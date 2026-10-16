import { describe, expect, it } from 'vitest';
import { auditExpenses, guessCategory } from '../../utils/pnl/audit/expenseAudit';
import { legacyFinancialReport } from '../../utils/pnl/reconciliation/legacyFinancialReport';
import {
    sepBillPayments, sepEmployees, sepPayroll, sepSettlements, sepStandaloneExpenses,
} from './fixtures/pnlAuditSep2026';

const extra = [
    { id: 'x_fishcake', company: 'Kilang Fish Cake', particulars: 'Fish Cake 5kg', category: 'SUPPLIES', amount: 85, time: '2026-09-11T10:00:00', paymentStatus: 'PAID', linkUrl: 'https://drive/x1' },
    { id: 'x_coke', company: 'Kedai Runcit', note: 'Coke 100Plus 3 carton', category: 'STAFF_MEAL', amount: 96, time: '2026-09-12T10:00:00', paymentStatus: 'PAID', invoiceRef: 'INV-9' },
    { id: 'x_misc', company: 'Mr DIY', note: '', category: 'EXPENSE', amount: 42.5, time: '2026-09-13T10:00:00', paymentStatus: 'PAID' },
    { id: 'x_split', company: 'Pasar', category: 'SUPPLIER', totalBillAmount: 300, amount: 300, time: '2026-09-14T10:00:00', paymentStatus: 'PAID', linkUrl: 'l',
      categorySplits: [{ category: 'INGREDIENT_VEG', amount: 200 }, { category: 'INGREDIENT_FRUIT', amount: 100 }] },
    { id: 'x_linked', company: 'Ah Kow', category: 'INGREDIENT_EGG', amount: 50, time: '2026-09-15T10:00:00', settlementId: 'audit_s_2026-09-15', paymentStatus: 'PAID', linkUrl: 'l' },
    { id: 'x_loan', company: 'Staff', category: 'STAFF_LOAN', amount: 500, time: '2026-09-16T10:00:00', paymentStatus: 'PAID' },
    { id: 'x_utc', company: 'Late Night', category: 'INGREDIENT_ICE', amount: 20, time: '2026-08-31T18:00:00.000Z', paymentStatus: 'PAID', linkUrl: 'l' },
];
const settlements = sepSettlements.map(s => s.date === '2026-09-15'
    ? { ...s, expenses: [{ id: 'x_linked', category: 'INGREDIENT_EGG', amount: 50 }] }
    : s);
const data = { settlements: settlements as any[], standaloneExpenses: [...sepStandaloneExpenses, ...extra] as any[], billPayments: sepBillPayments as any[] };
const fr = legacyFinancialReport({ ...data, payrollRecords: sepPayroll as any[], employees: sepEmployees as any[] }, '2026-09-01', '2026-09-30', 'ACCRUAL');
const a = auditExpenses('2026-09', data, fr.classicCostByCategory);
const row = (id: string) => a.rows.find(r => r.id === id)!;

describe('杂项费用审计 · 逐笔', () => {
    it('每一笔都有传统账目的处理方式与科目', () => {
        expect(row('x_fishcake').parts[0].line).toBe('UPKEEP OF SHOPLOT');
        expect(row('x_split').parts.map(p => p.line)).toEqual(['VEGETABLE', 'REFRESHMENT (饮料/水吧)']);
        expect(row('x_linked').treatment).toBe('VIA_SETTLEMENT');
        expect(row('x_loan').treatment).toBe('NON_OPERATING');
        expect(row('audit_subscription').treatment).toBe('NOT_IN_CLASSIC');
        expect(row('parttime_audit_1').personal).toBe(true);
        expect(row('x_utc').treatment).toBe('OTHER_MONTH');
        expect(row(`pay_audit_bill_seafood_1790000000000`).duplicateInstalment).toBe(true);
    });

    it('各科目与传统账目目前金额逐项核对：差额全部为 0', () => {
        expect(a.lineChecks.filter(x => Math.abs(x.diff) > 0.005)).toEqual([]);
        const veg = a.lineChecks.find(x => x.line === 'VEGETABLE')!;
        expect(veg.fromAP).toBe(200);
        const eggs = a.lineChecks.find(x => x.line === 'INGREDIENTS')!;
        expect(eggs.fromSettlement).toBe(50); // 有 settlementId 的账单由日结副本计入
    });

    it('没有进入任何科目的支出：订阅 120', () => {
        expect(a.notInClassic.map(r => r.id)).toEqual(['audit_subscription']);
        expect(a.totals.notInClassic).toBe(120);
        expect(a.suggestions.some(s => s.includes('SUBSCRIPTION'))).toBe(true);
    });

    it('分类可疑：Fish Cake 在 SUPPLIES、员工餐里的 Coke、笼统的 EXPENSE；不自动修改', () => {
        expect(row('x_fishcake').suspicion?.suggestedCategory).toBe('INGREDIENT_SEAFOOD_PROCESSED');
        expect(row('x_coke').suspicion?.reason).toContain('售卖');
        expect(row('x_misc').suspicion?.reason).toContain('太笼统');
        expect(row('x_fishcake').category).toBe('SUPPLIES'); // 原分类不变
        expect(a.suspicious.some(r => r.personal)).toBe(false);
    });

    it('重点类别与凭证', () => {
        expect(a.focus.SUPPLIES.count).toBe(1);
        expect(a.focus.EXPENSE.amount).toBe(42.5);
        expect(row('x_misc').missingVoucher).toBe(true);
        expect(row('x_coke').missingVoucher).toBe(false); // 有发票号码
    });

    it('钱箱支出对照：找不到 AP 记录的列出来（钱箱不计入盈亏）', () => {
        expect(a.cashBox.byStatus.MISSING.amount).toBe(35);
    });

    it('关键词推测', () => {
        expect(guessCategory('Tong gas LPG 14kg')?.category).toBe('GAS_COGS');
        expect(guessCategory('Bekas polistirena 1000pcs')?.category).toBe('PACKAGING');
        expect(guessCategory('Servis aircond')?.category).toBe('MAINTENANCE');
        expect(guessCategory('StoreHub subscription')?.category).toBe('IT_SOFTWARE');
        expect(guessCategory('Happy shop')).toBeNull();
    });
});

describe('杂项费用审计 · 摘要', () => {
    it('列出供应商证据；含员工姓名的记录（兼职、预支、借款）与人工类钱箱内容不列出', async () => {
        const { expenseAuditSummaryText } = await import('../../utils/pnl/audit/expenseAuditReport');
        const withNames = { ...data, standaloneExpenses: [...data.standaloneExpenses, { id: 'adv_x', company: 'Siti Aminah', category: 'STAFF_ADVANCE', amount: 200, time: '2026-09-18T10:00:00' }],
            settlements: data.settlements.map(s => s.date === '2026-09-19' ? { ...s, dayExpenses: [{ item: '兼职 Ali 工资', amount: 70 }] } : s) };
        const res = auditExpenses('2026-09', withNames, fr.classicCostByCategory);
        const text = expenseAuditSummaryText(res);
        expect(text).toContain('Kilang Fish Cake');
        expect(text).toContain('INGREDIENT_SEAFOOD_PROCESSED');
        expect(text).toContain('SUBSCRIPTION');
        expect(text).not.toContain('Siti');
        expect(text).not.toContain('Ali');
    });
});
