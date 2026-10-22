import { describe, expect, it, vi } from 'vitest';
import { businessMonthPeriod, dailyBusiness, loadBusinessCenterWith, profitStory } from '../../utils/businessCenter';
import { computePnL } from '../../utils/pnl/engine/pnlEngine';
import type { CockpitDataSource } from '../../utils/cockpit/cockpitLoader';
import type { SettlementRecord } from '../../types';

const row = (date: string, extra: Partial<SettlementRecord> = {}) => ({ id: date, date, isClosed: true, weather: 'RAIN', sales: { cash: 100, tng: 50, card: 20, duitnow: 10, amex: 5, refundTotal: 5, total: 230, storeHubTotal: 180, deliveryBreakdown: { grabGross: 80, grabNet: 60, grabAds: 10, pandaGross: 40, shopeeGross: 10, lalamove: 5 } }, ops: { bills: 10, pax: 20 }, ...extra } as SettlementRecord);

describe('经营中心：复用利润引擎与原始记录', () => {
    it('月份使用营业日，当前月截止今天，历史月到月底', () => {
        expect(businessMonthPeriod('2026-10', '2026-10-19')).toMatchObject({ start: '2026-10-01', end: '2026-10-19' });
        expect(businessMonthPeriod('2024-02', '2026-10-19').end).toBe('2024-02-29');
        expect(() => businessMonthPeriod('2026-13', '2026-10-19')).toThrow();
        expect(() => businessMonthPeriod('2026-11', '2026-10-19')).toThrow();
    });
    it('日报营业额 = 店内实收 + 外卖实收（跟每日结算一样）', () => {
        const r = row('2026-10-18');
        const day = dailyBusiness([r], r.date)!;
        // 店内 180 + Grab 实收（净额 60 − 广告 10 = 50）+ Panda 40 + Shopee 10 + Lalamove 5
        expect(day.revenue).toBe(285);
        expect(day.channels.reduce((sum, c) => sum + c.amount, 0)).toBe(day.revenue);
        expect(day.perBill).toBe(18);
        expect(day.perPax).toBe(9);
        expect(day.weather).toBe('RAIN');
    });
    it('旧 Grab 只有净额时沿用引擎回退并明确标记', () => {
        const r = row('2026-10-18');
        r.sales.deliveryBreakdown!.grabGross = undefined;
        expect(dailyBusiness([r], r.date)).toMatchObject({ revenue: 285, legacyGrab: true });
    });
    it('缺单数、人数不推测，全渠道均价不会套用店内单数', () => {
        const r = row('2026-10-18', { ops: {} });
        expect(dailyBusiness([r], r.date)).toMatchObject({ bills: null, pax: null, perBill: null, perPax: null });
    });
    it('缺记录为 null，未结算草稿不冒充零营业额', () => {
        expect(dailyBusiness([], '2026-10-19')).toBeNull();
        expect(dailyBusiness([row('2026-10-19', { isClosed: false })], '2026-10-19')).toBeNull();
    });
    it('同日多笔归并；部分记录缺营运资料时不算虚假的均价', () => {
        const r = row('2026-10-18');
        const d = dailyBusiness([r, row(r.date, { ops: {}, weather: 'SUNNY' })], r.date)!;
        expect(d.revenue).toBe(570);
        expect(d.bills).toBeNull();
        expect(d.weather).toBeUndefined();
        expect(d.weatherMixed).toBe(true);
    });
    it('退款后负数保留，不夹成零或生成负进度比例', () => {
        const r = row('2026-10-18');
        r.sales.refundTotal = 1000;
        expect(dailyBusiness([r], r.date)!.revenue).toBe(-710);
    });
    it('一次范围读取供首页与利润，不另读日报；保留早月跨月周对比', async () => {
        const records = [row('2026-09-27'), row('2026-10-01'), row('2026-10-18'), row('2026-10-19', { isClosed: false })];
        const source: CockpitDataSource = { getPnLRawRange: vi.fn(async () => ({ settlements: records, standaloneExpenses: [], billPayments: [] })), getEmployees: async () => [], getPayrollRecords: async () => [], getAttendanceReviewsByMonth: async () => [], getStandaloneExpensesByIds: async () => [] };
        const value = await loadBusinessCenterWith(source, '2026-10', '2026-10-19');
        expect(source.getPnLRawRange).toHaveBeenCalledTimes(1);
        expect(source.getPnLRawRange).toHaveBeenCalledWith('2026-09-01', '2026-10-31');
        expect(value.days.some(d => d.date === '2026-09-27')).toBe(true);
        expect(value.days.some(d => d.date === '2026-10-19')).toBe(false);
        expect(value.draftCount).toBe(1);
        const actual = value.days.filter(d => d.date.startsWith('2026-10')).reduce((n, d) => n + d.revenue, 0);
        // 经营中心用实收（草稿那天引擎也算进去）；原始引擎数字留在 rawResult
        expect(value.result.kpis.revenue.value).toBe(actual + 285);
        expect(value.result.kpis.actualProfit.value).toBe(value.rawResult.kpis.actualProfit.value);
        expect(value.rawResult.kpis.revenue.value).toBe(computePnL({ settlements: records, employees: [], payrollRecords: [], standaloneExpenses: [], billPayments: [] }, '2026-10-01', '2026-10-19', '2026-10-19').revenue);
    });
    it('读取CC环境因素，未知值忽略，历史没填不推断晴天', () => {
        const d = dailyBusiness([row('2026-11-08', { weather: undefined, specialConditions: ['HAZE', 'POWER_CUT', 'OTHER'] as never[] })], '2026-11-08')!;
        expect(d.weather).toBeUndefined();
        expect(d.specialConditions).toEqual(['HAZE', 'POWER_CUT']);
        expect(d.holiday?.name).toBe('屠妖节');
        expect(d.tomorrowHoliday?.replacement).toBe(true);
        expect(dailyBusiness([row('2028-01-01')], '2028-01-01')!.holidayYearCovered).toBe(false);
        expect(dailyBusiness([row('2026-10-18', { specialConditions: 'HAZE' as never })], '2026-10-18')!.specialConditions).toEqual([]);
    });
    it('外卖单数使用同渠道同日数据，缺失和零单分开，均价用实收', () => {
        const r = row('2026-10-18');
        Object.assign(r.sales.deliveryBreakdown!, { grabOrders: 4, pandaOrders: 0, shopeeOrders: -2 });
        const channels = dailyBusiness([r], r.date)!.channels;
        expect(channels[1]).toMatchObject({ orders: 4, average: 12.5, needsReview: false });
        expect(channels[2]).toMatchObject({ orders: 0, average: null, needsReview: true });
        expect(channels[3]).toMatchObject({ orders: null, average: null });
        expect(dailyBusiness([r, row(r.date)], r.date)!.channels[1].orders).toBeNull();
    });

    it('同日一笔0单待核对，不能被另一笔有效单数掩盖', () => {
        const a = row('2026-10-18'), b = row('2026-10-18');
        a.sales.deliveryBreakdown!.grabOrders = 0;
        b.sales.deliveryBreakdown!.grabOrders = 4;
        expect(dailyBusiness([a, b], a.date)!.channels[1]).toMatchObject({ amount: 100, orders: 4, needsReview: true, average: null });
    });

});

describe('成本与利润白话版 profitStory', () => {
    const kpi = (key: string, value: number | null, extra: any = {}) => ({ key, label: key, value, unit: 'RM', status: 'ESTIMATED', statusNote: '', basis: [], sources: [], rows: [], ...extra });
    const result = (over: any = {}) => ({
        period: { start: '2026-10-01', end: '2026-10-19', label: '' },
        integrity: [{ label: '每日结算', ok: true, detail: '' }, { label: '薪资', ok: false, detail: '预估' }],
        kpis: {
            revenue: kpi('revenue', 10000),
            food: kpi('food', 4000),
            labour: kpi('labour', 3000),
            actualProfit: kpi('actualProfit', 500, { rows: [{ label: '营业额', amount: 10000 }, { label: '− 食材（采购暂估）', amount: -4000 }, { label: '− 外送平台扣款', amount: -1000 }, { label: '− 人工总成本', amount: -3000 }, { label: '− 其他经营费用', amount: -1500 }, { label: '= 净利', amount: 500 }] }),
            breakEvenMonth: kpi('breakEvenMonth', 31000), breakEvenDay: kpi('breakEvenDay', 1000), breakEvenGap: kpi('breakEvenGap', -9000),
            ...over,
        },
    } as any);

    it('splits revenue into plain cost lines that add up to the profit', () => {
        const s = profitStory(result(), '2026-10', '2026-10-19');
        expect(s.lines.map(l => [l.key, l.amount, l.per100])).toEqual([['food', 4000, 40], ['platform', 1000, 10], ['labour', 3000, 30], ['opex', 1500, 15]]);
        expect(s).toMatchObject({ profit: 500, isProfit: true, profitPer100: 5, isFinal: false, monthDone: false });
        expect(s.pending.map(p => p.label)).toEqual(['薪资']);
    });

    it('break-even: remaining and per-day need for the rest of the month (incl. today)', () => {
        const be = profitStory(result(), '2026-10', '2026-10-19').breakEven!;
        expect(be).toMatchObject({ target: 31000, remaining: 21000, daysLeft: 13, gap: -9000 });
        expect(be.needPerDayLeft).toBeCloseTo(21000 / 13, 2);
        expect(profitStory(result(), '2026-09', '2026-10-19').breakEven!.daysLeft).toBe(0);
    });

    it('shows an explicit adjustment line when the engine total differs', () => {
        const s = profitStory(result({ actualProfit: kpi('actualProfit', 300, { rows: result().kpis.actualProfit.rows }) }), '2026-10', '2026-10-19');
        expect(s.lines.at(-1)).toMatchObject({ key: 'other', amount: 200 });
    });

    it('经营中心实收版：平台扣款移出成本，利润不变，保本按比例换算', async () => {
        const { businessCenterNetView } = await import('../../utils/businessCenter');
        const base = result();
        base.kpis.revenue.rows = [{ label: '店内 POS 实收', amount: 7000 }];
        base.kpis.foodRatio = kpi('foodRatio', 0.4); base.kpis.labourRatio = kpi('labourRatio', 0.3);
        const v = businessCenterNetView(base);
        expect(v.kpis.revenue.value).toBe(9000);
        expect(v.kpis.revenue.rows).toEqual([{ label: '店内实收', amount: 7000 }, { label: '外卖实收（总额 − 抽成与广告）', amount: 2000 }]);
        expect(v.kpis.foodRatio.value).toBeCloseTo(4000 / 9000, 6);
        expect(v.kpis.breakEvenMonth.value).toBe(27900);
        const s = profitStory(v, '2026-10', '2026-10-19');
        expect(s.lines.map(l => l.key)).toEqual(['food', 'labour', 'opex']);
        expect(s.profit).toBe(500);
        expect(s.revenue).toBe(9000);
    });

    it('loss month and missing break-even', () => {
        const s = profitStory(result({ actualProfit: kpi('actualProfit', -500, { rows: [] }), breakEvenMonth: kpi('breakEvenMonth', null) }), '2026-10', '2026-10-19');
        expect(s.isProfit).toBe(false);
        expect(s.breakEven).toBeNull();
    });
});

describe('dailyBreakEvenTargets · 保本线按星期调整', () => {
    // 2026-09-01 至 10-21：周六、周日 2000，平日 1000
    const mk = (date: string) => { const w = new Date(`${date}T00:00:00`).getDay(); return { date, revenue: w === 0 || w === 6 ? 2000 : 1000 } as any; };
    const days = Array.from({ length: 51 }, (_, i) => { const d = new Date(Date.UTC(2026, 8, 1 + i)); return mk(d.toISOString().slice(0, 10)); });
    it('周末目标高、平日低，全月合计 = 每日保本 × 天数', async () => {
        const { dailyBreakEvenTargets } = await import('../../utils/businessCenter');
        const r = dailyBreakEvenTargets({ days, month: '2026-10', perDay: 1500 });
        expect(r.weighted).toBe(true);
        expect(r.targets['2026-10-17']).toBeGreaterThan(r.targets['2026-10-13']); // 周六 > 周二
        expect(r.targets['2026-10-17'] / r.targets['2026-10-13']).toBeCloseTo(2, 1);
        const total = Object.values(r.targets).reduce((s, n) => s + n, 0);
        expect(total).toBeCloseTo(1500 * 31, -1);
    });
    it('选「平均」或资料不够时，每天一样', async () => {
        const { dailyBreakEvenTargets } = await import('../../utils/businessCenter');
        expect(new Set(Object.values(dailyBreakEvenTargets({ days, month: '2026-10', perDay: 1500, mode: 'flat' }).targets))).toEqual(new Set([1500]));
        const few = dailyBreakEvenTargets({ days: days.slice(0, 5), month: '2026-10', perDay: 1500 });
        expect(few.weighted).toBe(false);
        expect(few.targets['2026-10-17']).toBe(1500);
    });
});
