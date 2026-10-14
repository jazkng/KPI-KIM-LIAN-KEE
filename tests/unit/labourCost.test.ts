// 人工成本与盈利分析测试（虚构资料）
import { describe, expect, it } from 'vitest';
import type { Employee, PayrollRecord } from '../../types';
import { calculateEIS, calculateEPF, calculateLindung, calculateSOCSO } from '../../utils/payroll/statutory';
import { analyseLabour, buildLabourCosts, estimateEmployeeCost } from '../../utils/labour/labourCost';

const emp = (id: string, extra: Partial<Employee> = {}): Employee =>
    ({ id, name: `员工${id}`, role: 'CREW', status: 'CONFIRMED', level: '', basicSalary: 2000, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Male', nationality: 'Malaysian', ...extra }) as Employee;

const FULL_MONTH = { daysWorked: 26, workedMinutes: 26 * 600, approvedOtMinutes: 0 };

describe('法定扣款（搬家后数值不变）', () => {
    it('RM 2,000 的 EPF / SOCSO / EIS / LINDUNG', () => {
        expect(calculateEPF(2000, true)).toBe(260);
        expect(calculateEPF(2000, false)).toBe(220);
        expect(calculateSOCSO(2000, true)).toBe(34.15);
        expect(calculateSOCSO(2000, false)).toBe(9.75);
        expect(calculateEIS(2000, true)).toBe(3.9);
        expect(calculateLindung(2000, '2026-09')).toBe(14.65);
        expect(calculateLindung(2000, '2026-05')).toBe(0);
    });
});

describe('estimateEmployeeCost（雇主成本与员工自付分开）', () => {
    it('本地员工：雇主成本 = 底薪 + 雇主 EPF/SOCSO/EIS；员工自付另列，不加进成本', () => {
        const c = estimateEmployeeCost(emp('1'), FULL_MONTH, { month: '2026-09' });
        expect(c.gross).toBe(2000);
        expect(c.employerCost).toBe(2000 + 260 + 34.15 + 3.9);
        expect(c.employeeDeductions).toBe(220 + 9.75 + 3.9 + 14.65);
        expect(c.source).toBe('ESTIMATE');
    });

    it('外劳没有登记 EPF：没有雇主法定成本', () => {
        const c = estimateEmployeeCost(emp('2', { nationality: 'Myanmar' }), FULL_MONTH, { month: '2026-09' });
        expect(c.employerCost).toBe(2000);
        expect(c.employerEpf + c.employerSocso + c.employerEis).toBe(0);
    });

    it('加班默认不计入成本（规则待确认），只注明时数', () => {
        const c = estimateEmployeeCost(emp('3', { basicSalary: 2600 }), { ...FULL_MONTH, approvedOtMinutes: 120 }, { month: '2026-09' });
        expect(c.overtime).toBe(0);
        expect(c.notes.join('')).toMatch(/2\.0 小时.*未计入/);
    });

    it('负责人确认规则后才可开启：月薪 ÷ 26 ÷ 8 × 1.5', () => {
        const c = estimateEmployeeCost(emp('3', { basicSalary: 2600 }), { ...FULL_MONTH, approvedOtMinutes: 120 }, { month: '2026-09', includeOvertime: true });
        expect(c.overtime).toBe(37.5);
    });

    it('日薪按出勤天数；没有底薪会注明', () => {
        expect(estimateEmployeeCost(emp('4', { salaryMode: 'DAILY', basicSalary: 100 }), { ...FULL_MONTH, daysWorked: 20 }, { month: '2026-09' }).basic).toBe(2000);
        expect(estimateEmployeeCost(emp('5', { basicSalary: 0 }), FULL_MONTH, { month: '2026-09' }).notes).toContain('人事档案没有底薪');
    });

    it('只计算启用中的固定津贴', () => {
        const c = estimateEmployeeCost(
            emp('6', { customAllowances: [{ id: 'a', amount: 100, isActive: true }, { id: 'b', amount: 50, isActive: false }] }),
            FULL_MONTH,
            { month: '2026-09' },
        );
        expect(c.allowance).toBe(100);
    });
});

describe('buildLabourCosts（不重复计算）', () => {
    const payroll: PayrollRecord[] = [
        {
            id: 'p', month: '2026-09', totalAmount: 0, totalNetPay: 0, totalGovtPay: 0, staffCount: 1, status: 'POSTED',
            details: [{ employeeId: '1', employeeName: '员工1', basicSalary: 2100, allowance: 50, ot: 30, penalty: 0, advanceLoan: 0,
                ee_epf: 231, ee_socso: 10, ee_eis: 4, er_epf: 273, er_socso: 36, er_eis: 4, netPay: 0, totalCost: 0 }],
        } as PayrollRecord,
    ];

    it('已发放薪资的员工用实际数字，同一人不再用考勤推算', () => {
        const costs = buildLabourCosts('2026-09', [emp('1'), emp('2')], { '1': FULL_MONTH, '2': FULL_MONTH }, payroll);
        expect(costs).toHaveLength(2);
        const actual = costs.find(c => c.employeeId === '1')!;
        expect(actual.source).toBe('PAYROLL');
        expect(actual.employerCost).toBe(2100 + 50 + 30 + 273 + 36 + 4);
        expect(costs.find(c => c.employeeId === '2')!.source).toBe('ESTIMATE');
    });

    it('薪资草稿不算实际发放，仍用推算', () => {
        const draft = [{ ...payroll[0], status: 'DRAFT' }] as PayrollRecord[];
        expect(buildLabourCosts('2026-09', [emp('1')], { '1': FULL_MONTH }, draft)[0].source).toBe('ESTIMATE');
    });
});

describe('analyseLabour（人工成本率、保本营业额、预估利润）', () => {
    const costs = [estimateEmployeeCost(emp('1'), FULL_MONTH, { month: '2026-09' })];

    it('整月资料：保本营业额 = 固定成本 ÷（1 − 变动成本率）', () => {
        const a = analyseLabour('2026-09', [{ ...costs[0], source: 'PAYROLL' }], {
            revenue: 20000, revenueDays: 30, daysInMonth: 30, variableCostRatio: 0.35, otherFixedCosts: 4000,
        });
        expect(a.labourCost).toBe(2298.05);
        expect(a.labourCostRatio).toBeCloseTo(2298.05 / 20000, 6);
        expect(a.fixedCosts).toBe(6298.05);
        expect(a.breakEvenRevenue).toBe(Math.round((6298.05 / 0.65) * 100) / 100);
        expect(a.projectedProfit).toBe(Math.round((20000 * 0.65 - 6298.05) * 100) / 100);
        expect(a.isEstimate).toBe(false);
    });

    it('资料不完整一律标为估算并列出原因；营业额不足整月按日均推估', () => {
        const a = analyseLabour('2026-09', costs, {
            revenue: 10000, revenueDays: 15, daysInMonth: 30, variableCostRatio: 0.35, otherFixedCosts: 0, manualInputs: ['变动成本率'],
        }, ['考勤还有 3 项异常未处理']);
        expect(a.revenueProjected).toBe(20000);
        expect(a.isEstimate).toBe(true);
        expect(a.estimateReasons.join('|')).toMatch(/异常未处理.*推算.*15\/30.*手动输入/);
    });

    it('没有营业额时人工成本率为空，不会除以零', () => {
        const a = analyseLabour('2026-09', costs, { revenue: 0, revenueDays: 0, daysInMonth: 30, variableCostRatio: 0.3, otherFixedCosts: 0 });
        expect(a.labourCostRatio).toBeNull();
        expect(a.estimateReasons).toContain('本月还没有营业额资料');
    });
});
