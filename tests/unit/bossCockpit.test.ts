import { describe, expect, it } from 'vitest';
import { aggregateMonth, aggregateRange } from '../../utils/monthlyPnLAggregator';
import { aggregateMonth as legacyAggregateMonth } from './fixtures/legacyMonthlyPnLAggregator';
import { resolvePeriod, overlapDaysWithMonth } from '../../utils/cockpit/periods';
import { buildCockpit, dailyRevenueFromSettlements, labourForPeriod, splitCosts, type CockpitInputs } from '../../utils/cockpit/cockpitMetrics';
import type { EmployeeLabourCost } from '../../utils/labour/labourCost';

// ── 虚构资料 ──
const settlement = (date: string, cash: number, extra: Record<string, any> = {}) => ({
    id: `s_${date}`,
    date,
    sales: { total: cash, storeHubTotal: cash, cash, tng: 0, duitnow: 0, card: 0, deliveryBreakdown: { grab: 0, panda: 0, shopee: 0, lalamove: 0, ...(extra.delivery || {}) } },
    expenses: extra.expenses || [],
    variance: 0,
    submittedBy: 'x',
    isClosed: true,
} as any);

const raw = {
    settlements: [
        settlement('2026-09-01', 1000, { delivery: { grabGross: 500, grabNet: 400, grabAds: 20 }, expenses: [{ amount: 50, category: 'INGREDIENT_MEAT' }] }),
        settlement('2026-09-15', 2000),
        settlement('2026-09-30', 1500),
        settlement('2026-10-01', 999),
    ],
    standaloneExpenses: [
        { id: 'e1', time: '2026-09-03T10:00:00', paymentDate: '2026-10-02', paymentStatus: 'PAID', category: 'INGREDIENT_SEAFOOD', amount: 800 },
        { id: 'e2', time: '2026-09-05T10:00:00', paymentStatus: 'UNPAID', category: 'RENT', amount: 3000 },
        { id: 'e3', time: '2026-09-20T10:00:00', paymentStatus: 'PAID', category: 'SALARY', amount: 4000 },
        { id: 'e4', time: '2026-09-21T10:00:00', paymentStatus: 'PAID', category: 'STAFF_MEAL', amount: 120 },
        { id: 'e5', time: '2026-09-22T10:00:00', paymentStatus: 'PAID', category: 'EQUIPMENT', amount: 5000 },
    ] as any[],
    billPayments: [{ id: 'b1', date: '2026-09-10', amount: 400, category: 'UTILITIES_ELECTRIC' }] as any[],
    payrollRecords: [
        { id: '2026-09', month: '2026-09', status: 'POSTED', totalNetPay: 0, totalGovtPay: 0, details: [{ employeeId: '7001', netPay: 2000, advanceLoan: 0, isPaid: true }] },
    ] as any[],
    employees: [{ id: '7001', name: '虚构员工', role: 'Crew', status: 'CONFIRMED', department: 'KITCHEN' }] as any[],
};

const cost = (id: string, employerCost: number, source: 'PAYROLL' | 'ESTIMATE' = 'PAYROLL', notes: string[] = []): EmployeeLabourCost => ({
    employeeId: id, employeeName: id, department: 'KITCHEN', source, basic: employerCost, overtime: 0, allowance: 0, gross: employerCost,
    employerEpf: 0, employerSocso: 0, employerEis: 0, employerCost, employeeDeductions: 0, notes,
});

describe('aggregateMonth 重构：结果与重构前完全相同', () => {
    for (const mode of ['ACCRUAL', 'CASH'] as const) {
        for (const month of ['2026-09', '2026-10']) {
            it(`${month} · ${mode}`, () => {
                expect(aggregateMonth(month, raw, mode)).toEqual(legacyAggregateMonth(month, raw as any, mode));
            });
        }
    }
});

describe('aggregateRange：任意日期区间，同口径', () => {
    it('整月区间与 aggregateMonth 的营业额与成本一致', () => {
        const m = aggregateMonth('2026-09', raw);
        const r = aggregateRange('2026-09-01', '2026-09-30', raw);
        expect(r.inStoreSales).toBe(m.inStoreSales);
        expect(r.platformGross).toEqual(m.platformGross);
        expect(r.costByCategory).toEqual(m.costByCategory);
    });
    it('部分月份：只算区间内的日结与支出，薪资不计入（由人工模组按天数分摊）', () => {
        const r = aggregateRange('2026-09-10', '2026-09-20', raw);
        expect(r.inStoreSales).toBe(2000);
        expect(r.costByCategory.UTILITIES_ELECTRIC).toBe(400);
        expect(r.costByCategory.INGREDIENT_SEAFOOD).toBeUndefined();
        expect(r.costByCategory.PAYROLL).toBeUndefined();
    });
});

describe('期间', () => {
    const today = '2026-10-15'; // 周四
    it('今天 / 昨天 / 本周 / 本月 / 上个月', () => {
        expect(resolvePeriod('TODAY', today)).toMatchObject({ start: today, end: today, days: 1, elapsedDays: 1 });
        expect(resolvePeriod('YESTERDAY', today)).toMatchObject({ start: '2026-10-14', end: '2026-10-14' });
        expect(resolvePeriod('THIS_WEEK', today)).toMatchObject({ start: '2026-10-12', end: today, days: 4 });
        expect(resolvePeriod('THIS_MONTH', today)).toMatchObject({ start: '2026-10-01', end: today, elapsedDays: 15 });
        expect(resolvePeriod('LAST_MONTH', today)).toMatchObject({ start: '2026-09-01', end: '2026-09-30', days: 30, months: ['2026-09'] });
    });
    it('自订：起讫颠倒会自动对调；跨月会列出所有月份', () => {
        const p = resolvePeriod('CUSTOM', today, { start: '2026-10-05', end: '2026-08-20' });
        expect(p).toMatchObject({ start: '2026-08-20', end: '2026-10-05', months: ['2026-08', '2026-09', '2026-10'] });
        expect(overlapDaysWithMonth(p, '2026-09')).toBe(30);
        expect(overlapDaysWithMonth(p, '2026-08')).toBe(12);
    });
    it('周一时本周只有一天', () => {
        expect(resolvePeriod('THIS_WEEK', '2026-10-12')).toMatchObject({ start: '2026-10-12', days: 1 });
    });
});

describe('不重复计算', () => {
    it('薪资类支出排除；员工餐计入人工；资本支出不计入经营费用', () => {
        const c = splitCosts(aggregateMonth('2026-09', raw).costByCategory);
        expect(c.excludedPayrollLike).toBe(4000 + 2000); // SALARY 支出 + 薪资记录 PAYROLL
        expect(c.otherLabour).toBe(120);
        expect(c.opex).toBe(3000 + 400);
        expect(c.nonOperating).toBe(5000);
        expect(c.food).toBe(50 + 800);
        expect(c.platform).toBe(100); // Grab 总额 500 − 净额 400
    });
    it('人工按天数分摊：半个月 = 一半，标为分摊', () => {
        const l = labourForPeriod({ start: '2026-09-01', end: '2026-09-15' }, [{ month: '2026-09', costs: [cost('a', 3000)] }]);
        expect(l.amount).toBe(1500);
        expect(l.prorated).toBe(true);
    });
    it('每日营业额与 aggregateRange 同口径', () => {
        const d = dailyRevenueFromSettlements(raw.settlements);
        expect(d['2026-09-01']).toBe(1000 + 500);
        const r = aggregateRange('2026-09-01', '2026-09-01', raw);
        expect(d['2026-09-01']).toBe(r.inStoreSales + r.platformGross.grab);
    });
});

const inputsFor = (period: ReturnType<typeof resolvePeriod>, today: string, labourCosts: EmployeeLabourCost[]): CockpitInputs => {
    const pnl = aggregateRange(period.start, period.end, raw);
    const month = period.end.slice(0, 7);
    const monthPnl = aggregateMonth(month, raw);
    const daily = dailyRevenueFromSettlements(raw.settlements);
    return {
        period, today, accountingMode: 'ACCRUAL', pnl,
        dailyRevenue: daily, settlementTotal: 0, settlementCount: 0, partTimeWages: 0, monthPartTimeWages: 0, pettyCash: 0,
        labour: period.months.map(m => ({ month: m, costs: labourCosts })),
        monthPnl, monthLabour: labourCosts, monthDailyRevenue: daily,
        sourceCounts: { settlements: 4, standaloneExpenses: 5, billPayments: 1, payrollRecords: 1, employees: 1 },
        loadedAt: '2026-10-15T10:00:00Z',
    };
};

describe('驾驶舱 KPI 与资料状态', () => {
    it('上个月日结不齐 → 营业额与利润为「资料不完整」，并列出缺少的日子；不是「已确认」', () => {
        const period = resolvePeriod('LAST_MONTH', '2026-10-15');
        const r = buildCockpit(inputsFor(period, '2026-10-15', [cost('7001', 2600)]));
        expect(r.kpis.revenue.status).toBe('INCOMPLETE');
        expect(r.missingDays.length).toBe(27);
        expect(r.kpis.actualProfit.status).toBe('INCOMPLETE');
        expect(r.kpis.actualProfit.label).toContain('未确认');
        expect(r.alerts.some(a => a.level === 'HIGH' && a.kpi === 'revenue')).toBe(true);
    });
    it('利润公式：营业额 − 食材 − 平台 − 人工 − 其他费用；薪资类支出不重复扣', () => {
        const period = resolvePeriod('LAST_MONTH', '2026-10-15');
        const r = buildCockpit(inputsFor(period, '2026-10-15', [cost('7001', 2600)]));
        const revenue = 1000 + 500 + 2000 + 1500;
        expect(r.kpis.revenue.value).toBe(revenue);
        expect(r.kpis.actualProfit.value).toBe(revenue - 850 - 100 - (2600 + 120) - 3400);
        expect(r.kpis.labour.value).toBe(2720);
    });
    it('兼职工资计入人工（不在薪资单里），钱箱支出只列出不计入', () => {
        const period = resolvePeriod('LAST_MONTH', '2026-10-15');
        const r = buildCockpit({ ...inputsFor(period, '2026-10-15', [cost('7001', 2600)]), partTimeWages: 300, pettyCash: 45 });
        expect(r.kpis.labour.value).toBe(2600 + 120 + 300);
        expect(r.kpis.actualProfit.basis.join()).toContain('钱箱');
        expect(r.alerts.some(a => a.title.includes('钱箱'))).toBe(true);
    });
    it('没有人工资料 → 人工「资料不完整」，不使用任何预设人工金额', () => {
        const period = resolvePeriod('LAST_MONTH', '2026-10-15');
        const r = buildCockpit(inputsFor(period, '2026-10-15', []));
        expect(r.kpis.labour.status).toBe('INCOMPLETE');
        expect(r.kpis.labour.value).toBe(120); // 只有员工餐
    });
    it('今天尚未日结 → 「等待日结」，不是资料缺失', () => {
        const period = resolvePeriod('TODAY', '2026-10-02');
        const r = buildCockpit(inputsFor(period, '2026-10-02', [cost('7001', 2600)]));
        expect(r.kpis.revenue.status).toBe('PENDING_CLOSE');
        expect(r.alerts.find(a => a.kpi === 'revenue')).toBeUndefined();
    });
    it('预计月底利润一律标为预估（月份未结束）', () => {
        const period = resolvePeriod('THIS_MONTH', '2026-09-20');
        const r = buildCockpit(inputsFor(period, '2026-09-20', [cost('7001', 2600)]));
        expect(r.kpis.projectedProfit.status).toBe('ESTIMATED');
        expect(r.kpis.breakEvenMonth.value).not.toBeNull();
        expect(r.kpis.breakEvenDay.value).toBeCloseTo((r.kpis.breakEvenMonth.value as number) / 30, 1);
    });
    it('每个 KPI 都有计算依据与来源', () => {
        const r = buildCockpit(inputsFor(resolvePeriod('THIS_MONTH', '2026-09-20'), '2026-09-20', [cost('7001', 2600, 'ESTIMATE')]));
        r.order.forEach(k => {
            expect(r.kpis[k].basis.length).toBeGreaterThan(0);
            expect(r.kpis[k].sources.length).toBeGreaterThan(0);
        });
        expect(r.kpis.labour.status).toBe('ESTIMATED');
    });
});
