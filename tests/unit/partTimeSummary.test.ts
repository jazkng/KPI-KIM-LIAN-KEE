import { describe, expect, it } from 'vitest';
import { partTimeSummaryFor, partTimeSummaryText } from '../../utils/payroll/partTimeSummary';

const ann = { id: '1058', name: 'Ann' };
const rec = (o: any) => ({ id: `parttime_${Math.random()}`, category: 'SALARY', expenseType: 'SALARY', company: 'Ann', amount: 60, paymentStatus: 'PAID', time: '2026-09-03T12:00:00.000Z', ...o });

describe('薪资结算页 · 时薪兼职当月登记摘要（只供显示）', () => {
    it('依 employeeId 对应；旧资料没有 employeeId 时用名字', () => {
        const s = partTimeSummaryFor(ann, [rec({ employeeId: '1058' }), rec({}), rec({ employeeId: '999', company: 'Ann' }), rec({ company: 'Bob' })] as any);
        expect(s).toEqual({ count: 2, total: 120, paidCount: 2, unpaidCount: 0 });
        expect(partTimeSummaryText(s)).toBe('本月兼职已登记 2 笔 · RM 120.00 · 已付款');
    });
    it('有未付款时显示笔数', () => {
        const s = partTimeSummaryFor(ann, [rec({ employeeId: '1058' }), rec({ employeeId: '1058', paymentStatus: 'UNPAID', amount: 40 })] as any);
        expect(partTimeSummaryText(s)).toBe('本月兼职已登记 2 笔 · RM 100.00 · 已付 1 笔、未付 1 笔');
    });
    it('没有记录 → 本月没有兼职记录', () => {
        expect(partTimeSummaryText(partTimeSummaryFor(ann, []))).toBe('本月没有兼职记录');
    });
});
