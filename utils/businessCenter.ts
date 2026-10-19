import { SPECIAL_CONDITION_OPTIONS, type SettlementRecord } from '../types';
import { getOps } from '../components/features/settlement/settlementOps';
import { computePnL } from './pnl/engine/pnlEngine';
import { loadCockpitWith, type CockpitDataSource } from './cockpit/cockpitLoader';
import type { CockpitResult } from './cockpit/cockpitMetrics';
import { addDays, daysInMonth, resolvePeriod } from './cockpit/periods';
import { getMalaysiaHoliday, hasHolidayDataForYear } from './holidays/malaysiaHolidays';

export const businessMonthPeriod = (month: string, today: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today.slice(0, 7)) throw new Error('请选择有效的经营月份');
    return resolvePeriod('CUSTOM', today, { start: `${month}-01`, end: month === today.slice(0, 7) ? today : `${month}-${daysInMonth(month)}` });
};

export const dailyBusiness = (records: SettlementRecord[], date: string) => {
    const rows = records.filter(r => r.isClosed !== false && String(r.date).slice(0, 10) === date);
    if (!rows.length) return null;
    const pnl = computePnL({ settlements: rows, standaloneExpenses: [], billPayments: [], employees: [], payrollRecords: [] }, date, date, date);
    const ops = rows.map(getOps);
    const count = (key: 'bills' | 'pax') => ops.every(o => o[key] > 0) ? ops.reduce((n, o) => n + o[key], 0) : null;
    const bills = count('bills'), pax = count('pax'), store = pnl.classic.inStoreSales;
    const perRecord = rows.length === 1 ? [pnl] : rows.map(r => computePnL({ settlements: [r], standaloneExpenses: [], billPayments: [], employees: [], payrollRecords: [] }, date, date, date));
    const platform = (label: string, grossKey: 'grab' | 'panda' | 'shopee' | 'lalamove', key: 'grabOrders' | 'pandaOrders' | 'shopeeOrders' | 'lalamoveOrders') => {
        const values = rows.map(r => r.sales?.deliveryBreakdown?.[key]);
        const complete = values.every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
        return { label, amount: pnl.classic.platformGross[grossKey], orders: complete ? values.reduce<number>((n, v) => n + v!, 0) : null,
            needsReview: values.some((v, i) => v === 0 && perRecord[i].classic.platformGross[grossKey] !== 0) };
    };
    const channels = [{ label: '店内', amount: store, orders: bills, needsReview: false }, platform('Grab', 'grab', 'grabOrders'), platform('Foodpanda', 'panda', 'pandaOrders'), platform('ShopeeFood', 'shopee', 'shopeeOrders'), platform('Lalamove', 'lalamove', 'lalamoveOrders')].map(c => ({ ...c, average: !c.needsReview && c.orders && c.orders > 0 ? c.amount / c.orders : null }));
    const weather = [...new Set(rows.map(r => r.weather).filter(Boolean))];
    // 熟客 / VIP 到店 / WhatsApp：同日多笔相加（没填 = 0，画面显示「—」）
    const sum = (key: 'vipNew' | 'vipVisits' | 'waJoin' | 'waOrders') => ops.reduce((n, o) => n + o[key], 0);
    const community = { regulars: sum('vipNew'), vipVisits: sum('vipVisits'), waJoin: sum('waJoin'), waOrders: sum('waOrders') };
    return { date, revenue: pnl.revenue, channels, bills, pax, community, perBill: bills ? store / bills : null, perPax: pax ? store / pax : null,
        weather: weather.length === 1 ? weather[0] : undefined, weatherMixed: weather.length > 1,
        legacyGrab: pnl.reasons.some(r => r.code === 'LEGACY_GRAB'),
        specialConditions: SPECIAL_CONDITION_OPTIONS.filter(o => rows.some(r => Array.isArray(r.specialConditions) && r.specialConditions.includes(o.value))).map(o => o.value),
        holiday: getMalaysiaHoliday(date), tomorrowHoliday: getMalaysiaHoliday(addDays(date, 1)), holidayYearCovered: hasHolidayDataForYear(date.slice(0, 4)) };
};

export const buildBusinessDays = (records: SettlementRecord[]) => [...new Set(records.filter(r => r.isClosed !== false).map(r => String(r.date).slice(0, 10)))].sort().map(date => dailyBusiness(records, date)!);

export const loadBusinessCenterWith = async (source: CockpitDataSource, month: string, today: string) => {
    const period = businessMonthPeriod(month, today);
    let settlements: SettlementRecord[] = [];
    const result = await loadCockpitWith({ ...source, getPnLRawRange: async (start, end) => {
        const raw = await source.getPnLRawRange(start < addDays(period.start, -14) ? start : addDays(period.start, -14), end);
        settlements = raw.settlements;
        return raw;
    } }, period, today, 'ACCRUAL');
    const draftCount = settlements.filter(r => r.isClosed === false && String(r.date).slice(0, 10) >= period.start && String(r.date).slice(0, 10) <= period.end).length;
    return { month, result, draftCount, days: buildBusinessDays(settlements) };
};

export type BusinessCenterData = Awaited<ReturnType<typeof loadBusinessCenterWith>>;
export type BusinessDay = NonNullable<ReturnType<typeof dailyBusiness>>;

// ───────────────────────── 成本与利润：给老板看的白话版 ─────────────────────────
// 只重新排列利润引擎已经算好的数字，不另外计算口径。

export interface ProfitLine {
    key: 'food' | 'platform' | 'labour' | 'opex' | 'other';
    label: string;
    /** 一句话说明这笔钱是什么 */
    hint: string;
    /** 一般餐厅参考比例（只给食材、人工） */
    reference?: string;
    amount: number;
    /** 每 RM100 营业额花掉多少；营业额为 0 → null */
    per100: number | null;
    /** 点开看计算依据用的 KPI key */
    kpi: string;
}

const rowAmount = (rows: { label: string; amount: number }[], re: RegExp) => Math.abs(rows.find(r => re.test(r.label))?.amount ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const profitStory = (result: CockpitResult, month: string, today: string) => {
    const k = result.kpis;
    const rows = k.actualProfit?.rows || [];
    const revenue = k.revenue?.value ?? 0;
    const profit = k.actualProfit?.value ?? 0;
    const per100 = (amount: number) => revenue > 0 ? round2(amount / revenue * 100) : null;
    const base: Omit<ProfitLine, 'per100'>[] = [
        { key: 'food', label: '食材', hint: '向供应商买食材的钱（按买进算，不是按用掉算）', reference: '一般餐厅约 RM30–35', amount: k.food?.value ?? rowAmount(rows, /食材/), kpi: 'food' },
        { key: 'platform', label: '外卖平台抽成与广告', hint: 'Grab、Foodpanda、ShopeeFood 扣走的佣金和广告费', amount: rowAmount(rows, /外送平台/), kpi: 'actualProfit' },
        { key: 'labour', label: '员工薪资', hint: '员工薪水；还没发放的月份按排班预估', reference: '一般餐厅约 RM25–30', amount: k.labour?.value ?? rowAmount(rows, /人工/), kpi: 'labour' },
        { key: 'opex', label: '租金、水电和其他费用', hint: '租金、水电、维修、营销等应付账款与固定账单', amount: rowAmount(rows, /其他经营费用/), kpi: 'actualProfit' },
    ];
    // 引擎若还有其他调整（例如待核对项目），差额单独列出，不让数字对不上
    const other = round2(revenue - base.reduce((n, l) => n + l.amount, 0) - profit);
    if (Math.abs(other) >= 1) base.push({ key: 'other', label: '其他调整（待核对）', hint: '利润引擎标记待核对的项目，点开看明细', amount: other, kpi: 'actualProfit' });
    const lines: ProfitLine[] = base.map(l => ({ ...l, per100: per100(l.amount) }));

    const monthDone = month < today.slice(0, 7);
    const isFinal = k.actualProfit?.status === 'CONFIRMED';
    const pending = result.integrity.filter(i => !i.ok);

    const target = k.breakEvenMonth?.value ?? null;
    const dim = daysInMonth(month);
    const endDay = Number(result.period.end.slice(8, 10));
    const daysLeft = monthDone ? 0 : Math.max(0, dim - endDay + 1);
    const remaining = target === null ? null : Math.max(0, round2(target - revenue));
    return {
        revenue, profit, isProfit: profit >= 0, isFinal, monthDone, pending, lines,
        profitPer100: per100(profit),
        breakEven: target === null ? null : {
            target,
            perDay: k.breakEvenDay?.value ?? null,
            progress: target > 0 ? Math.min(1, revenue / target) : 0,
            /** 正数 = 超过保本进度 */
            gap: k.breakEvenGap?.value ?? null,
            remaining,
            daysLeft,
            needPerDayLeft: remaining !== null && daysLeft > 0 ? round2(remaining / daysLeft) : null,
        },
    };
};

export type ProfitStory = ReturnType<typeof profitStory>;
