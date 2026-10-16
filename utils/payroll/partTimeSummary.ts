// ============================================================================
// 薪资结算页 · 时薪兼职员工的当月兼职登记摘要（只供显示）
// 只读：不影响工资算法、总薪资或任何资料。
// 对应规则与「兼职与预支」页相同：有 employeeId 用 employeeId，旧资料没有就用名字（company）对应。
// ============================================================================
import type { Employee, ExpenseItem } from '../../types';

export interface PartTimeMonthSummary {
    count: number;
    total: number;
    paidCount: number;
    unpaidCount: number;
}

export const partTimeSummaryFor = (emp: Pick<Employee, 'id' | 'name'>, expenses: ExpenseItem[]): PartTimeMonthSummary => {
    const mine = expenses.filter(e => {
        const id = e.employeeId || e.partTime?.employeeId;
        return id ? id === emp.id : String(e.company || '').trim() === String(emp.name || '').trim();
    });
    const paidCount = mine.filter(e => e.paymentStatus === 'PAID').length;
    return {
        count: mine.length,
        total: Math.round(mine.reduce((s, e) => s + (Number(e.amount) || 0), 0) * 100) / 100,
        paidCount,
        unpaidCount: mine.length - paidCount,
    };
};

/** 显示文字：本月兼职已登记 3 笔 · RM 180.00 · 已付现金 / 本月没有兼职记录 */
export const partTimeSummaryText = (s: PartTimeMonthSummary): string => {
    if (!s.count) return '本月没有兼职记录';
    const money = s.total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const status = s.unpaidCount === 0 ? '已付款' : s.paidCount === 0 ? '未付款' : `已付 ${s.paidCount} 笔、未付 ${s.unpaidCount} 笔`;
    return `本月兼职已登记 ${s.count} 笔 · RM ${money} · ${status}`;
};
