// 老板「人工成本与盈利」快照测试（虚构资料）
import { describe, expect, it } from 'vitest';
import type { Employee, PayrollRecord } from '../../types';
import type { MonthlyPnLInputs } from '../../utils/monthlyPnLAggregator';
import { buildMonthLabourCosts, isActiveForPayroll } from '../../utils/labour/labourCost';
import { buildProfitSnapshot } from '../../utils/labour/profitDashboard';

const emp = (id: string, extra: Partial<Employee> = {}): Employee =>
    ({ id, name: `员工${id}`, role: 'CREW', status: 'CONFIRMED', level: '', basicSalary: 2000, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Male', nationality: 'Myanmar', ...extra }) as Employee;

const pnl = (costByCategory: Record<string, number>, inStoreSales = 50000, grab = 10000): MonthlyPnLInputs => ({
    month: '2026-09',
    costByCategory,
    platformGross: { grab, shopee: 0, panda: 0, lalamove: 0 },
    inStoreSales,
    laborByDept: {},
    hasData: true,
});

const FULL = { daysInMonth: 30, elapsedDays: 30, settlementDays: 30 };

describe('buildMonthLabourCosts（在职员工）', () => {
    it('只算当月在职、参与薪资的员工；当月离职的照算', () => {
        const list = [
            emp('1'),
            emp('2', { isPayrollEligible: false }),
            emp('3', { joinDate: '2026-10-05' }),
            emp('4', { status: 'TERMINATED', terminationDate: '2026-08-31' }),
            emp('5', { status: 'TERMINATED', terminationDate: '2026-09-15' }),
        ];
        expect(list.filter(e => isActiveForPayroll(e, '2026-09')).map(e => e.id)).toEqual(['1', '5']);
        expect(buildMonthLabourCosts('2026-09', list, []).map(c => c.employeeId).sort()).toEqual(['1', '5']);
    });

    it('已发放薪资的员工用实际数字；草稿不算', () => {
        const posted = [{ id: 'p', month: '2026-09', status: 'POSTED', totalAmount: 0, totalNetPay: 0, totalGovtPay: 0, staffCount: 1,
            details: [{ employeeId: '1', employeeName: '员工1', basicSalary: 2100, allowance: 0, penalty: 0, advanceLoan: 0, ee_epf: 0, ee_socso: 0, er_epf: 0, er_socso: 0, er_eis: 0, netPay: 0, totalCost: 0 }] }] as PayrollRecord[];
        const costs = buildMonthLabourCosts('2026-09', [emp('1'), emp('2')], posted);
        expect(costs.find(c => c.employeeId === '1')?.source).toBe('PAYROLL');
        expect(costs.find(c => c.employeeId === '2')?.source).toBe('ESTIMATE');
    });

    it('月薪员工没有考勤也能推算，不会被标为缺资料', () => {
        const [c] = buildMonthLabourCosts('2026-09', [emp('1')], []);
        expect(c.notes).toEqual([]);
        expect(c.employerCost).toBe(2000);
    });
});

describe('buildProfitSnapshot（人工成本率、保本、预估利润）', () => {
    const labour = buildMonthLabourCosts('2026-09', [emp('1'), emp('2')], []);

    it('按财务报表分类：食材与平台为变动成本，租金水电为固定，薪资类支出排除不重复', () => {
        const s = buildProfitSnapshot(pnl({
            INGREDIENT_MEAT: 15000, PLATFORM_FEE: 3000, RENT: 8000, UTILITIES_ELECTRIC: 2000,
            SALARY: 4000, EPF: 500, STAFF_MEAL: 600, EQUIPMENT: 5000,
        }), labour, FULL);
        expect(s.revenue.amount).toBe(60000);
        expect(s.variableCosts.amount).toBe(18000);
        expect(s.variableCostRatio).toBeCloseTo(0.3, 6);
        expect(s.payrollLabour.amount).toBe(4000);
        expect(s.otherLabour.amount).toBe(600);
        expect(s.labourCost).toBe(4600);
        expect(s.excludedLabourExpenses).toBe(4500);
        expect(s.otherFixedCosts.amount).toBe(10000);
        expect(s.labourCostRatio).toBeCloseTo(4600 / 60000, 6);
        expect(s.breakEvenRevenue).toBe(Math.round((14600 / 0.7) * 100) / 100);
        expect(s.projectedProfit).toBe(Math.round((60000 * 0.7 - 14600) * 100) / 100);
    });

    it('全部有记录且薪资已发放 → 已结算', () => {
        const posted = [{ id: 'p', month: '2026-09', status: 'POSTED', totalAmount: 0, totalNetPay: 0, totalGovtPay: 0, staffCount: 1,
            details: [{ employeeId: '1', employeeName: '员工1', basicSalary: 2000, allowance: 0, penalty: 0, advanceLoan: 0, ee_epf: 0, ee_socso: 0, er_epf: 0, er_socso: 0, er_eis: 0, netPay: 0, totalCost: 0 }] }] as PayrollRecord[];
        const s = buildProfitSnapshot(pnl({ INGREDIENT_MEAT: 1000, RENT: 100 }), buildMonthLabourCosts('2026-09', [emp('1')], posted), FULL);
        expect(s.overallStatus).toBe('SETTLED');
        expect(s.payrollLabour.status).toBe('SETTLED');
    });

    it('尚未发薪 → 人工为估算；没有底薪 → 缺失并说明', () => {
        const s = buildProfitSnapshot(pnl({ INGREDIENT_MEAT: 1000, RENT: 100 }), buildMonthLabourCosts('2026-09', [emp('1'), emp('9', { basicSalary: 0 })], []), FULL);
        expect(s.payrollLabour.status).toBe('ESTIMATED');
        expect(s.employees).toEqual({ settled: 0, estimated: 1, missing: 1 });
        expect(s.reasons.join('|')).toMatch(/尚未发薪.*没有底薪/);
    });

    it('月中：营业额按日均推估整月，标为估算；成本不推估', () => {
        const s = buildProfitSnapshot(pnl({ INGREDIENT_MEAT: 6000, RENT: 8000 }, 20000, 0), labour, { daysInMonth: 30, elapsedDays: 10, settlementDays: 10 });
        expect(s.revenue.status).toBe('ESTIMATED');
        expect(s.revenueProjected).toBe(60000);
        expect(s.otherFixedCosts.amount).toBe(8000);
        expect(s.otherFixedCosts.status).toBe('ESTIMATED');
    });

    it('没有日结 → 营业额缺失，人工成本率与保本为空，不会除以零', () => {
        const s = buildProfitSnapshot(pnl({}, 0, 0), labour, { daysInMonth: 30, elapsedDays: 5, settlementDays: 0 });
        expect(s.revenue.status).toBe('MISSING');
        expect(s.overallStatus).toBe('MISSING');
        expect(s.labourCostRatio).toBeNull();
        expect(s.breakEvenRevenue).toBeNull();
    });

    it('漏日结（已过天数多于日结天数）会特别说明', () => {
        const s = buildProfitSnapshot(pnl({ INGREDIENT_MEAT: 1, RENT: 1 }), labour, { daysInMonth: 30, elapsedDays: 30, settlementDays: 27 });
        expect(s.reasons.join('|')).toMatch(/已过 30 天，只有 27 天日结/);
    });
});
