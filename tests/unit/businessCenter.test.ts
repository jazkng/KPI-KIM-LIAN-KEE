import { describe, expect, it, vi } from 'vitest';
import { businessMonthPeriod, dailyBusiness, loadBusinessCenterWith } from '../../utils/businessCenter';
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
    it('日报销售额与同日引擎一致，不把广告抽佣扣两次', () => {
        const r = row('2026-10-18');
        const day = dailyBusiness([r], r.date)!;
        expect(day.revenue).toBe(315);
        expect(day.channels.reduce((sum, c) => sum + c.amount, 0)).toBe(day.revenue);
        expect(day.perBill).toBe(18);
        expect(day.perPax).toBe(9);
        expect(day.weather).toBe('RAIN');
    });
    it('旧 Grab 只有净额时沿用引擎回退并明确标记', () => {
        const r = row('2026-10-18');
        r.sales.deliveryBreakdown!.grabGross = undefined;
        expect(dailyBusiness([r], r.date)).toMatchObject({ revenue: 295, legacyGrab: true });
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
        expect(d.revenue).toBe(630);
        expect(d.bills).toBeNull();
        expect(d.weather).toBeUndefined();
        expect(d.weatherMixed).toBe(true);
    });
    it('退款后负数保留，不夹成零或生成负进度比例', () => {
        const r = row('2026-10-18');
        r.sales.refundTotal = 1000;
        expect(dailyBusiness([r], r.date)!.revenue).toBe(-680);
    });
    it('一次范围读取供首页与利润，不另读日报；保留早月跨月周对比', async () => {
        const records = [row('2026-09-27'), row('2026-10-01'), row('2026-10-18'), row('2026-10-19', { isClosed: false })];
        const source: CockpitDataSource = { getPnLRawRange: vi.fn(async () => ({ settlements: records, standaloneExpenses: [], billPayments: [] })), getEmployees: async () => [], getPayrollRecords: async () => [], getAttendanceReviewsByMonth: async () => [], getStandaloneExpensesByIds: async () => [] };
        const value = await loadBusinessCenterWith(source, '2026-10', '2026-10-19');
        expect(source.getPnLRawRange).toHaveBeenCalledTimes(1);
        expect(source.getPnLRawRange).toHaveBeenCalledWith('2026-09-17', '2026-10-31');
        expect(value.days.some(d => d.date === '2026-09-27')).toBe(true);
        expect(value.days.some(d => d.date === '2026-10-19')).toBe(false);
        expect(value.draftCount).toBe(1);
        const actual = value.days.filter(d => d.date.startsWith('2026-10')).reduce((n, d) => n + d.revenue, 0);
        expect(value.result.kpis.revenue.value).toBe(actual + 315);
        expect(value.result.kpis.revenue.value).toBe(computePnL({ settlements: records, employees: [], payrollRecords: [], standaloneExpenses: [], billPayments: [] }, '2026-10-01', '2026-10-19', '2026-10-19').revenue);
    });
});
