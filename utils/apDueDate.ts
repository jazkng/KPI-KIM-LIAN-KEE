// ============================================================================
// 应付账款到期日（老板首页与驾驶舱预警中心共用，纯函数）
// 没有填到期日的账单，以账单日 + 15 天视为到期日（沿用老板首页既有规则）。
// ============================================================================

export const AP_DEFAULT_TERM_DAYS = 15;

export const normalizeDateOnly = (value: unknown): string => {
    const datePart = String(value || '').split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
};

export const shiftDate = (dateValue: unknown, days: number): string => {
    const datePart = normalizeDateOnly(dateValue);
    if (!datePart) return '';
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (!Number.isFinite(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export interface PayableLike {
    id?: string;
    dueDate?: unknown;
    time?: unknown;
    amount?: number;
    outstandingAmount?: number;
    totalBillAmount?: number;
    company?: string;
    category?: string;
    invoiceRef?: string;
}

export const getEffectiveAPDueDate = (item: PayableLike): string =>
    normalizeDateOnly(item.dueDate) || shiftDate(item.time, AP_DEFAULT_TERM_DAYS);

/** 未付余额：与应付账款模块相同（outstandingAmount → totalBillAmount → amount） */
export const outstandingOf = (item: PayableLike): number =>
    Number(item.outstandingAmount ?? item.totalBillAmount ?? item.amount) || 0;

/** 依今天把未付 / 部分付款的账单分成「已逾期」与「N 天内到期」 */
export const classifyPayables = (items: PayableLike[], today: string, dueSoonDays = 7) => {
    const todayStart = new Date(`${today}T00:00:00`);
    const overdue: (PayableLike & { due: string; outstanding: number; days: number })[] = [];
    const dueSoon: (PayableLike & { due: string; outstanding: number; days: number })[] = [];
    let noDueDate = 0;
    items.forEach(item => {
        const due = getEffectiveAPDueDate(item);
        const dueDate = due ? new Date(`${due}T00:00:00`) : null;
        if (!dueDate || !Number.isFinite(dueDate.getTime())) { noDueDate++; return; }
        const days = Math.round((dueDate.getTime() - todayStart.getTime()) / 86400000);
        const outstanding = outstandingOf(item);
        if (outstanding <= 0.005) return; // 状态未更新但余额已为 0
        const row = { ...item, due, outstanding, days };
        if (days < 0) overdue.push(row);
        else if (days <= dueSoonDays) dueSoon.push(row);
    });
    const sum = (rows: { outstanding: number }[]) => Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100;
    overdue.sort((a, b) => a.days - b.days);
    dueSoon.sort((a, b) => a.days - b.days);
    return { overdue, dueSoon, overdueAmount: sum(overdue), dueSoonAmount: sum(dueSoon), noDueDate };
};
