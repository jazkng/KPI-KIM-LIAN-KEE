import { SPECIAL_CONDITION_OPTIONS, type SettlementRecord } from '../types';
import { getOps } from '../components/features/settlement/settlementOps';
import { getSettlementFigures } from '../components/features/settlement/settlementExcelExport';
import { computePnL } from './pnl/engine/pnlEngine';
import { loadCockpitWith, type CockpitDataSource } from './cockpit/cockpitLoader';
import type { CockpitResult, Kpi } from './cockpit/cockpitMetrics';
import { addDays, daysInMonth, resolvePeriod } from './cockpit/periods';
import { getMalaysiaHoliday, hasHolidayDataForYear } from './holidays/malaysiaHolidays';

const r2 = (n: number) => Math.round(n * 100) / 100;

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
    // 外卖用实收（跟每日结算同一套：已对账用实际到账，没对账用净额 − 广告），负责人 2026-10-22
    const figures = rows.map(getSettlementFigures);
    const received = (grossKey: 'grab' | 'panda' | 'shopee' | 'lalamove') => r2(figures.reduce((n, f) => n + (grossKey === 'lalamove' ? f.lalamove : f[grossKey].report), 0));
    const platform = (label: string, grossKey: 'grab' | 'panda' | 'shopee' | 'lalamove', key: 'grabOrders' | 'pandaOrders' | 'shopeeOrders' | 'lalamoveOrders') => {
        const values = rows.map(r => r.sales?.deliveryBreakdown?.[key]);
        const complete = values.every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
        return { label, amount: received(grossKey), orders: complete ? values.reduce<number>((n, v) => n + v!, 0) : null,
            needsReview: values.some((v, i) => v === 0 && perRecord[i].classic.platformGross[grossKey] !== 0) };
    };
    const channels = [{ label: '店内', amount: store, orders: bills, needsReview: false }, platform('Grab', 'grab', 'grabOrders'), platform('Foodpanda', 'panda', 'pandaOrders'), platform('ShopeeFood', 'shopee', 'shopeeOrders'), platform('Lalamove', 'lalamove', 'lalamoveOrders')].map(c => ({ ...c, average: !c.needsReview && c.orders && c.orders > 0 ? c.amount / c.orders : null }));
    const weather = [...new Set(rows.map(r => r.weather).filter(Boolean))];
    // 熟客 / VIP 到店 / WhatsApp：同日多笔相加（没填 = 0，画面显示「—」）
    const sum = (key: 'vipNew' | 'vipVisits' | 'waJoin' | 'waOrders') => ops.reduce((n, o) => n + o[key], 0);
    const community = { regulars: sum('vipNew'), vipVisits: sum('vipVisits'), waJoin: sum('waJoin'), waOrders: sum('waOrders') };
    return { date, revenue: r2(store + channels.slice(1).reduce((n, c) => n + c.amount, 0)), channels, bills, pax, community, perBill: bills ? store / bills : null, perPax: pax ? store / pax : null,
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
        // 多读上个月整月的日结（只读）：给周对比与 AI 顾问「上月同期」用
        const from = `${addDays(period.start, -1).slice(0, 7)}-01`;
        const raw = await source.getPnLRawRange(start < from ? start : from, end);
        settlements = raw.settlements;
        return raw;
    } }, period, today, 'ACCRUAL');
    const draftCount = settlements.filter(r => r.isClosed === false && String(r.date).slice(0, 10) >= period.start && String(r.date).slice(0, 10) <= period.end).length;
    // 经营中心的营业额用「店内实收 + 外卖实收」（跟每日结算一样）；其他报表照旧（rawResult）
    return { month, result: businessCenterNetView(result), rawResult: result, draftCount, days: buildBusinessDays(settlements) };
};

/**
 * 经营中心专用：营业额改成「店内实收 + 外卖实收」（负责人 2026-10-22：要跟每日结算对得上）。
 * 外卖实收 = 平台总额 − 平台抽成与广告，所以利润不变，只是平台扣款不再单独列成本。
 * 食材率、人工率改用新的营业额当分母；保本营业额按同一比例换算（利润为 0 的那一点不变）。
 * 只影响经营中心画面，利润引擎、财务报表、导出照旧。
 */
export const businessCenterNetView = (result: CockpitResult): CockpitResult => {
    const k = result.kpis;
    const gross = k.revenue?.value;
    if (!k.revenue || gross === null || gross === undefined) return result;
    const rows = k.actualProfit?.rows || [];
    const platformRow = rows.find(r => /外送平台/.test(r.label));
    const platform = Math.abs(platformRow?.amount ?? 0);
    const net = r2(gross - platform);
    const scale = gross > 0 ? net / gross : 1;
    const inStore = k.revenue.rows.find(r => r.label.startsWith('店内'))?.amount ?? 0;
    const kpis: Record<string, Kpi> = { ...k };
    kpis.revenue = {
        ...k.revenue, value: net,
        basis: ['营业额 = 店内实收 + 外卖实收（平台总额 − 抽成与广告），跟每日结算的「总营业额」一样', '只用于经营中心；财务报表与导出照旧用平台总额，平台扣款列为成本', ...k.revenue.basis.slice(1)],
        rows: [{ label: '店内实收', amount: inStore }, { label: '外卖实收（总额 − 抽成与广告）', amount: r2(net - inStore) }],
    };
    if (k.actualProfit) kpis.actualProfit = { ...k.actualProfit, rows: rows.filter(r => r !== platformRow).map(r => r.label === '营业额' ? { ...r, amount: net } : r) };
    const ratio = (key: string, amountKey: string) => {
        const a = k[amountKey]?.value;
        if (k[key] && a !== null && a !== undefined) kpis[key] = { ...k[key], value: net > 0 ? a / net : null };
    };
    ratio('foodRatio', 'food'); ratio('labourRatio', 'labour');
    (['breakEvenMonth', 'breakEvenDay', 'breakEvenGap'] as const).forEach(key => {
        const v = k[key]?.value;
        if (k[key] && v !== null && v !== undefined) kpis[key] = { ...k[key], value: r2(v * scale), rows: k[key].rows.filter(r => !/平台/.test(r.label)).map(r => /营业额/.test(r.label) ? { ...r, amount: r2(r.amount * scale) } : r) };
    });
    return { ...result, kpis };
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
    // 经营中心用外卖实收时，平台扣款已经不在成本里，这一行是 0 就不显示
    const lines: ProfitLine[] = base.filter(l => l.key !== 'platform' || l.amount > 0).map(l => ({ ...l, per100: per100(l.amount) }));

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

// ───────────────────────── 每日保本线：按星期几调整 ─────────────────────────
// 周六、周日生意通常比较好，平日比较淡。把整个月的保本营业额（每日保本 × 当月天数）
// 按「过去各星期几的平均营业额」分配到每一天：好的日子目标高、淡的日子目标低，
// 但全月加起来还是同一个保本数字。只用已日结的真实营业日；资料不够（少于 14 天，
// 或某个星期几少于 2 天）就不调整，回到平均分配。

export interface DailyBreakEven {
    /** 每一天的保本线 */
    targets: Record<string, number>;
    /** 星期几（0=日…6=六）的倍数；1 = 平均 */
    weights: number[];
    /** 是否真的按星期调整（资料不够时为 false = 每天一样） */
    weighted: boolean;
    /** 用了几天资料算倍数 */
    sampleDays: number;
}

export const dailyBreakEvenTargets = (args: { days: BusinessDay[]; month: string; perDay: number; mode?: 'weekday' | 'flat' }): DailyBreakEven => {
    const { month, perDay } = args;
    const dim = daysInMonth(month);
    const dates = Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    const wd = (date: string) => new Date(`${date}T00:00:00`).getDay();
    // 用本月与上个月已日结的日子（经营中心已经读进来的那些）
    const sample = args.days.filter(d => d.date <= dates[dim - 1] && d.revenue > 0);
    const groups = Array.from({ length: 7 }, (_, w) => sample.filter(d => wd(d.date) === w).map(d => d.revenue));
    const enough = args.mode !== 'flat' && sample.length >= 14 && groups.every(g => g.length >= 2);
    let weights = Array(7).fill(1) as number[];
    if (enough) {
        const avgs = groups.map(g => g.reduce((s, n) => s + n, 0) / g.length);
        const mean = avgs.reduce((s, n) => s + n, 0) / 7;
        if (mean > 0) weights = avgs.map(a => round2(a / mean));
    }
    // 全月总保本不变：每天 = 全月保本 × 这天的倍数 ÷ 全月倍数合计
    const total = perDay * dim;
    const sumW = dates.reduce((s, d) => s + weights[wd(d)], 0);
    const targets = Object.fromEntries(dates.map(d => [d, round2(total * weights[wd(d)] / sumW)]));
    return { targets, weights, weighted: enough, sampleDays: enough ? sample.length : 0 };
};
