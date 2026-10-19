/**
 * 💵 经营中心「现金与账款」：给老板看的付款清单（只读）
 *
 * - 应付账款：未付 / 部分付款、不含冻结，按到期日分已逾期 / 7 天内到期（与应付账款模块同一套到期规则）
 * - 固定账单：本月（年缴则今年）还没付的，按到期日排
 * - 资金：最近一次月结的月底现金 / 银行（有实点就用实点）
 */
import { classifyPayables, outstandingOf, type PayableLike } from './apDueDate';
import { isFrozenBill } from './ap/frozenBills';

export interface PayRow {
    id: string;
    kind: 'AP' | 'BILL';
    name: string;
    note?: string;
    amount: number;
    due: string;
    /** 负数 = 已逾期几天 */
    days: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (from: string, to: string) =>
    Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
const ymd = (y: number, m: number, d: number) => {
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(Math.max(1, d), last)).padStart(2, '0')}`;
};

export const summarizePayables = (items: (PayableLike & { frozen?: unknown })[], today: string) => {
    const live = items.filter(i => !isFrozenBill(i) && outstandingOf(i) > 0.005);
    const c = classifyPayables(live, today);
    const toRow = (r: (typeof c.overdue)[number]): PayRow => ({
        id: String(r.id || ''), kind: 'AP', name: r.company || '未填供应商', note: r.invoiceRef ? `单号 ${r.invoiceRef}` : undefined,
        amount: round2(r.outstanding), due: r.due, days: r.days,
    });
    return {
        count: live.length,
        total: round2(live.reduce((n, i) => n + outstandingOf(i), 0)),
        overdue: c.overdue.map(toRow),
        overdueAmount: c.overdueAmount,
        dueSoon: c.dueSoon.map(toRow),
        dueSoonAmount: c.dueSoonAmount,
    };
};

interface BillLike {
    id: string; name: string; amount: number; type: string; dueDay: number; dueMonth?: number;
    isActive?: boolean; isArchived?: boolean; lastPaidDate?: string; payableTo?: string;
}

/** 本期还没付的固定账单（月缴看本月、年缴看今年），已逾期在前 */
export const unpaidRecurringBills = (bills: BillLike[], today: string): PayRow[] => {
    const [y, m] = today.split('-').map(Number);
    const rows: PayRow[] = [];
    bills.forEach(b => {
        if (b.isActive === false || b.isArchived === true) return;
        const paid = String(b.lastPaidDate || '').slice(0, 10);
        let due: string;
        let isPaid: boolean;
        if (b.type === 'YEARLY') {
            due = ymd(y, b.dueMonth || 1, b.dueDay || 1);
            isPaid = paid.slice(0, 4) >= String(y);
        } else if (b.type === 'MONTHLY') {
            due = ymd(y, m, b.dueDay || 1);
            isPaid = paid.slice(0, 7) >= today.slice(0, 7);
        } else return;
        if (isPaid) return;
        rows.push({ id: b.id, kind: 'BILL', name: b.name, note: b.payableTo || (b.type === 'YEARLY' ? '年缴' : '月缴'), amount: round2(Number(b.amount) || 0), due, days: daysBetween(today, due) });
    });
    return rows.sort((a, b) => a.days - b.days);
};

interface ClosingLike { month: string; status?: string; cashEnd: number; bankEnd: number; cashEndActual?: number; bankEndActual?: number }

/** 最近一次已月结的月底资金；没有月结 → null */
export const latestClosing = (closings: ClosingLike[]) => {
    const closed = closings.filter(c => c.status === 'CLOSED' && /^\d{4}-\d{2}$/.test(c.month)).sort((a, b) => b.month.localeCompare(a.month));
    const c = closed[0];
    if (!c) return null;
    const cash = Number(c.cashEndActual ?? c.cashEnd) || 0;
    const bank = Number(c.bankEndActual ?? c.bankEnd) || 0;
    return { month: c.month, cash: round2(cash), bank: round2(bank), total: round2(cash + bank), counted: c.cashEndActual !== undefined || c.bankEndActual !== undefined };
};

/** 这 7 天（含已逾期）要付的合计：应付账款 + 固定账单 */
export const payThisWeek = (ap: ReturnType<typeof summarizePayables>, bills: PayRow[]) =>
    round2(ap.overdueAmount + ap.dueSoonAmount + bills.filter(b => b.days <= 7).reduce((n, b) => n + b.amount, 0));
