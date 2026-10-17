import { describe, expect, it } from 'vitest';
import { computePnL, resolveCategory } from '../../utils/pnl/engine/pnlEngine';
import { legacyFinancialReport } from '../../utils/pnl/reconciliation/legacyFinancialReport';
import { buildClassicPnL } from '../../utils/classicPnLBuilder';
import {
    sepBillPayments, sepEmployees, sepPayroll, sepSettlements, sepStandaloneExpenses,
} from './fixtures/pnlAuditSep2026';

const base = {
    settlements: sepSettlements as any[],
    standaloneExpenses: sepStandaloneExpenses as any[],
    billPayments: sepBillPayments as any[],
    payrollRecords: sepPayroll as any[],
    employees: sepEmployees as any[],
};
const classicOf = (r: ReturnType<typeof computePnL>) => buildClassicPnL({
    month: r.start.slice(0, 7), storehub: null, platformGross: r.classic.platformGross, costByCategory: r.classic.costByCategory,
    viewMode: 'DETAILED', channelMode: 'IN_STORE', includeCost: true, costDetailMode: 'DETAILED',
    laborByDept: r.classic.laborByDept, inStoreSales: r.classic.inStoreSales,
} as any);

describe('唯一盈亏引擎 · 虚构 9 月', () => {
    const r = computePnL(base, '2026-09-01', '2026-09-30', '2026-10-16');

    it('五大项与净利（钱箱 35 不再计入）', () => {
        expect({ revenue: r.revenue, platform: r.platform, food: r.food, labour: r.labour, opex: r.opex, netProfit: r.netProfit }).toEqual({
            revenue: 89900, platform: 3750, food: 32000, labour: 6582.35, opex: 14645, netProfit: 32922.65,
        });
    });

    it('传统账目（会计格式）用同一份结果，净利完全相同，各段对得上', () => {
        const c = classicOf(r);
        expect(Math.round(c.netProfit * 100) / 100).toBe(r.netProfit);
        expect(Math.round(c.costTotal * 100) / 100).toBe(r.food);
        expect(Math.round(c.personalTotal * 100) / 100).toBe(r.labour);
        expect(Math.round((c.sellingTotal + c.operationTotal) * 100) / 100).toBe(Math.round((r.platform + r.opex) * 100) / 100);
        // 部门明细 + 兼职 + 员工餐 = LABOUR CHARGES，没有「对不上的差额」
        expect(c.rows.some(x => x.id === 'LABOUR_GAP')).toBe(false);
    });

    it('同一笔费用只算一次：分期付款、预支、钱箱、薪资付款纪录都不重复', () => {
        expect(r.classic.costByCategory.INGREDIENT_SEAFOOD).toBe(6000);
        expect(r.classic.costByCategory.STAFF_ADVANCE).toBeUndefined();
        expect(r.classic.costByCategory.SALARY).toBe(450); // 兼职一次
        expect(r.classic.costByCategory.PAYROLL).toBe(5300); // 应发（预支已含在内）
        expect(r.classic.costByCategory.EPF_SOCSO).toBe(532.35); // 雇主供款，不论是否已缴
        expect(r.excluded.find(x => x.label.startsWith('员工预支'))?.amount).toBe(300);
        expect(r.excluded.some(x => x.label.includes('钱箱'))).toBe(false); // 每日结算钱箱支出完全不纳入
    });

    it('没有对应科目的分类归入正确的行：订阅 → 其他营运费用（与传统账目相同）、宿舍电费 → 员工水电', () => {
        expect(r.classic.costByCategory.MISC_OPEX).toBe(120);
        expect(r.classic.costByCategory.UTILITIES_ELECTRIC_STAFF).toBe(300);
        expect(resolveCategory('SOMETHING_NEW')).toMatchObject({ key: 'MISC_OPEX', group: 'OPEX', fallback: true });
        expect(resolveCategory('TRANSFER')).toMatchObject({ group: 'NON_OPERATING' });
    });

    it('状态：平台未对账 → 暂估／待核对；钱箱支出不影响状态', () => {
        expect(r.status).toBe('PROVISIONAL');
        const codes = r.reasons.map(x => x.code);
        expect(codes).toContain('PLATFORM_UNRECONCILED');
        expect(codes.some(c => c.startsWith('CASH_BOX'))).toBe(false);
        expect(codes).toContain('FOOD_PURCHASE_BASIS');
    });

    it('资料齐全、已对账 → 已确认（日结有钱箱支出也一样）', () => {
        const settlements = sepSettlements.map(s => ({ ...s, reconStatus: { grab: 380 } }));
        const ok = computePnL({ ...base, settlements }, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(ok.reasons.filter(x => x.level === 'BLOCKING')).toEqual([]);
        expect(ok.status).toBe('CONFIRMED');
    });

    it('没有薪资单 → 人工按档案暂估，绝不使用 57,300', () => {
        const est = computePnL({ ...base, payrollRecords: [] }, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(est.reasons.map(x => x.code)).toContain('PAYROLL_NOT_POSTED');
        expect(est.labour).not.toBe(57300);
        expect(est.status).toBe('PROVISIONAL');
    });

    it('UTC 时间以马来西亚日期计：9/1 凌晨的账单算 9 月', () => {
        const extra = [...sepStandaloneExpenses, { id: 'utc_egg', category: 'INGREDIENT_EGG', amount: 80, time: '2026-08-31T18:00:00.000Z', paymentStatus: 'PAID' }];
        const x = computePnL({ ...base, standaloneExpenses: extra as any[] }, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(x.food).toBe(32080);
    });
});

describe('人工口径与传统账目一致（负责人 2026-10-16 核对）', () => {
    // 法定供款已缴时，传统账目 = 实发 + 借款扣回 + 宿舍费 + 预支 + 法定缴款 + 兼职 + 员工餐；引擎 = 应发 + 雇主供款 + 兼职 + 员工餐
    const paid = [{ ...sepPayroll[0], isStatutoryPaid: true }];
    const labourOfClassic = (input: any) => {
        const c = legacyFinancialReport(input, '2026-09-01', '2026-09-30', 'ACCRUAL').classicCostByCategory;
        return Math.round(['PAYROLL', 'EPF_SOCSO', 'SALARY', 'STAFF_ADVANCE', 'STAFF_MEAL'].reduce((s, k) => s + (c[k] || 0), 0) * 100) / 100;
    };
    it('预支、兼职、员工餐：两边都是 6,582.35', () => {
        const input = { ...base, payrollRecords: paid };
        expect(computePnL(input, '2026-09-01', '2026-09-30', '2026-10-16').labour).toBe(6582.35);
        expect(labourOfClassic(input)).toBe(6582.35);
    });
    it('借款扣回 1,000、宿舍费 150 不减少人工；其他扣款 50 减少人工', () => {
        const details = paid[0].details.map((d: any) => d.employeeId === 'E2'
            ? { ...d, loanRepay: 1000, hostelFee: 150, otherDeduction: 50, netPay: d.netPay - 1200 } : d);
        const input = { ...base, payrollRecords: [{ ...paid[0], details }] };
        expect(computePnL(input, '2026-09-01', '2026-09-30', '2026-10-16').labour).toBe(6532.35);
        expect(labourOfClassic(input)).toBe(6532.35);
    });
    it('薪资单以外手动登记的工资（补发上月少算）照计，并列出供核对', () => {
        const extra = [...sepStandaloneExpenses, { id: 'x_balance', company: 'PART TIME', note: 'Salary balance', category: 'SALARY', amount: 100, time: '2026-09-23T10:00:00' }];
        const input = { ...base, payrollRecords: paid, standaloneExpenses: extra as any[] };
        const e = computePnL(input, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(e.labour).toBe(6682.35);
        expect(labourOfClassic(input)).toBe(6682.35);
        expect(e.reasons.find(x => x.code === 'PAYROLL_LIKE_OUTSIDE')?.level).toBe('INFO');
    });
});
