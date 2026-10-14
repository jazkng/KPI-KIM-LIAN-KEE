import { describe, expect, it } from 'vitest';
import { computeProfitAdjustments } from '../../utils/cockpit/profitAdjustments';
import { aggregateRange } from '../../utils/monthlyPnLAggregator';
import { applyAdjustments, reconciliationRows, splitCosts } from '../../utils/cockpit/cockpitMetrics';

// 虚构日结：Grab 总额 500、净额（未扣广告）400、广告 20 → 平台应得 380
const day = (date: string, extra: Record<string, any> = {}) => ({
    id: `s_${date}`, date,
    sales: { cash: 1000, tng: 0, duitnow: 0, card: 0, total: 1380, storeHubTotal: 1000, deliveryBreakdown: { grabGross: 500, grabNet: 400, grabAds: 20, grab: 380, panda: 0, shopee: 0, lalamove: 0 } },
    expenses: [], ...extra,
});

describe('利润引擎：外送平台扣款', () => {
    it('未对账：总额 −（净额 − 广告）= 120，财务报表算法只扣 100（漏了广告）', () => {
        const a = computeProfitAdjustments([day('2026-09-01')], [], '2026-09-01', '2026-09-30');
        expect(a.platformCost).toBe(120);
        expect(a.platformCostReport).toBe(100);
        expect(a.unreconciledPlatformDays).toBe(1);
        expect(a.platformRows[0].note).toContain('未对账');
    });
    it('已对账：总额 − 实收；与财务报表算法一致', () => {
        const a = computeProfitAdjustments([day('2026-09-01', { reconStatus: { grab: 370 } })], [], '2026-09-01', '2026-09-30');
        expect(a.platformCost).toBe(130);
        expect(a.platformCostReport).toBe(130);
        expect(a.unreconciledPlatformDays).toBe(0);
    });
    it('只填总额、没填净额：扣款 = 广告', () => {
        const s = day('2026-09-01');
        s.sales.deliveryBreakdown = { grabGross: 500, grabNet: 0, grabAds: 20, grab: 480, panda: 0, shopee: 0, lalamove: 0 } as any;
        expect(computeProfitAdjustments([s], [], '2026-09-01', '2026-09-30').platformCost).toBe(20);
    });
    it('与 aggregateRange 的平台类别金额一致（财务报表算法对照正确）', () => {
        const settlements = [day('2026-09-01'), day('2026-09-02', { reconStatus: { grab: 370 } })];
        const pnl = aggregateRange('2026-09-01', '2026-09-30', { settlements: settlements as any, standaloneExpenses: [], billPayments: [], payrollRecords: [], employees: [] });
        const fromPnl = Object.entries(pnl.costByCategory).filter(([k]) => k.startsWith('PLATFORM_')).reduce((s, [, v]) => s + v, 0);
        expect(computeProfitAdjustments(settlements, [], '2026-09-01', '2026-09-30').platformCostReport).toBeCloseTo(fromPnl, 2);
    });
});

describe('利润引擎：收款手续费与钱箱支出', () => {
    const expenses = [
        { id: 'recon_fee_s_2026-09-01_tng', category: 'BANK_FEE', time: '2026-09-01T12:00:00.000Z', amount: 3.5 },
        { id: 'recon_fee_s_2026-09-01_grab', category: 'MARKETING_FEE', time: '2026-09-01T12:00:00.000Z', amount: 10 },
        { id: 'recon_fee_s_2026-10-01_tng', category: 'BANK_FEE', time: '2026-10-01T12:00:00.000Z', amount: 9 },
    ];
    it('计入非平台的对账差额（TNG / 卡）；平台差额已含在「总额 − 实收」，不重复；期间外不计', () => {
        const a = computeProfitAdjustments([], expenses, '2026-09-01', '2026-09-30');
        expect(a.bankFees).toBe(3.5);
        expect(a.bankFeeCount).toBe(1);
    });
    it('日结钱箱现金支出计入', () => {
        const a = computeProfitAdjustments([day('2026-09-05', { dayExpenses: [{ amount: 35 }, { amount: 12.5 }] })], [], '2026-09-01', '2026-09-30');
        expect(a.pettyCash).toBe(47.5);
        expect(a.pettyCashCount).toBe(2);
    });
});

describe('利润引擎：套用到成本与对账明细', () => {
    it('平台扣款以修正值取代计算出的平台类别；手续费与钱箱支出计入经营费用', () => {
        const byCat = { PLATFORM_COMM_GRAB: 80, PLATFORM_ADS_GRAB: 20, PLATFORM_FEE: 5, RENT: 1000, INGREDIENT_MEAT: 300 };
        const adj = { platformCost: 120, platformCostReport: 100, unreconciledPlatformDays: 1, platformRows: [], bankFees: 3.5, bankFeeCount: 1, pettyCash: 47.5, pettyCashCount: 2 };
        const c = applyAdjustments(splitCosts(byCat), byCat, adj);
        expect(c.platform).toBe(125); // 120 + 另行入账的 PLATFORM_FEE 5
        expect(c.opex).toBe(1051);
        const rows = reconciliationRows(adj, 700);
        expect(rows.map(r => r.amount)).toEqual([-20, -3.5, -47.5, 700]);
    });
    it('没有修正资料时与原本相同', () => {
        const byCat = { PLATFORM_COMM_GRAB: 80, RENT: 1000 };
        const c = applyAdjustments(splitCosts(byCat), byCat, undefined);
        expect(c.platform).toBe(80);
        expect(c.opex).toBe(1000);
    });
});

describe('利润「已确认」须平台款项已对账', () => {
    it('其余都齐全、但平台未对账 → 不是已确认', async () => {
        const { buildCockpit, dailyRevenueFromSettlements } = await import('../../utils/cockpit/cockpitMetrics');
        const { resolvePeriod } = await import('../../utils/cockpit/periods');
        const { aggregateMonth } = await import('../../utils/monthlyPnLAggregator');
        const settlements = Array.from({ length: 30 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`));
        const expenses = [{ id: 'r', time: '2026-09-02T10:00:00', category: 'RENT', amount: 3000, totalBillAmount: 3000, paymentStatus: 'PAID' }, { id: 'f', time: '2026-09-02T10:00:00', category: 'INGREDIENT_MEAT', amount: 5000, totalBillAmount: 5000, paymentStatus: 'PAID' }];
        const data = { settlements: settlements as any, standaloneExpenses: expenses as any, billPayments: [], payrollRecords: [], employees: [] };
        const pnl = aggregateMonth('2026-09', data);
        const labour = [{ employeeId: 'x', employeeName: 'x', department: 'K', source: 'PAYROLL' as const, basic: 2000, overtime: 0, allowance: 0, gross: 2000, employerEpf: 0, employerSocso: 0, employerEis: 0, employerCost: 2000, employeeDeductions: 0, notes: [] }];
        const base = {
            period: resolvePeriod('LAST_MONTH', '2026-10-15'), today: '2026-10-15', accountingMode: 'ACCRUAL' as const, pnl,
            dailyRevenue: dailyRevenueFromSettlements(settlements), settlementTotal: 0, settlementCount: 30,
            labour: [{ month: '2026-09', costs: labour }], monthPnl: pnl, monthLabour: labour, monthDailyRevenue: dailyRevenueFromSettlements(settlements),
            partTimeWages: 0, monthPartTimeWages: 0, pettyCash: 0,
            sourceCounts: { settlements: 30, standaloneExpenses: 2, billPayments: 0, payrollRecords: 1, employees: 1 }, loadedAt: '',
        };
        const unrec = computeProfitAdjustments(settlements, [], '2026-09-01', '2026-09-30');
        const r1 = buildCockpit({ ...base, adjustments: unrec, monthAdjustments: unrec });
        expect(r1.kpis.actualProfit.status).not.toBe('CONFIRMED');
        expect(r1.kpis.actualProfit.statusNote).toContain('未对账');
        const recSettlements = settlements.map(s => ({ ...s, reconStatus: { grab: 380 } }));
        const rec = computeProfitAdjustments(recSettlements, [], '2026-09-01', '2026-09-30');
        const r2 = buildCockpit({ ...base, adjustments: rec, monthAdjustments: rec });
        expect(r2.kpis.actualProfit.status).toBe('CONFIRMED');
    });
});
