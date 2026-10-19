import { describe, it, expect } from 'vitest';
import { summarizePayables, unpaidRecurringBills, latestClosing, payThisWeek } from '../../utils/cashOverview';

const today = '2026-10-19';

describe('现金与账款', () => {
  it('splits unpaid AP into overdue / due soon, skipping frozen and fully paid', () => {
    const s = summarizePayables([
      { id: 'a', company: 'EK FRESH', outstandingAmount: 300, dueDate: '2026-10-10' },
      { id: 'b', company: 'AL FROZEN', outstandingAmount: 200, dueDate: '2026-10-22' },
      { id: 'c', company: 'GAS', outstandingAmount: 100, dueDate: '2026-12-01' },
      { id: 'd', company: 'FROZEN ONE', outstandingAmount: 999, dueDate: '2026-09-01', frozen: true },
      { id: 'e', company: 'ZERO', outstandingAmount: 0, dueDate: '2026-09-01' },
    ] as any, today);
    expect(s).toMatchObject({ count: 3, total: 600, overdueAmount: 300, dueSoonAmount: 200 });
    expect(s.overdue[0]).toMatchObject({ name: 'EK FRESH', days: -9, kind: 'AP' });
  });

  it('lists recurring bills not yet paid this period', () => {
    const rows = unpaidRecurringBills([
      { id: 'r1', name: '租金', amount: 12000, type: 'MONTHLY', dueDay: 5, isActive: true, lastPaidDate: '2026-09-05' },
      { id: 'r2', name: 'TNB', amount: 3500, type: 'MONTHLY', dueDay: 25, isActive: true },
      { id: 'r3', name: '已付', amount: 50, type: 'MONTHLY', dueDay: 1, isActive: true, lastPaidDate: '2026-10-02' },
      { id: 'r4', name: '执照', amount: 800, type: 'YEARLY', dueMonth: 12, dueDay: 31, isActive: true, lastPaidDate: '2025-12-30' },
      { id: 'r5', name: '停用', amount: 1, type: 'MONTHLY', dueDay: 1, isActive: false },
      { id: 'r6', name: '二月', amount: 1, type: 'MONTHLY', dueDay: 31, isActive: true, lastPaidDate: '2026-11-01' },
    ], today);
    expect(rows.map(r => [r.name, r.due, r.days])).toEqual([['租金', '2026-10-05', -14], ['TNB', '2026-10-25', 6], ['执照', '2026-12-31', 73]]);
  });

  it('uses the latest closed month, preferring physical counts', () => {
    expect(latestClosing([])).toBeNull();
    expect(latestClosing([
      { month: '2026-08', status: 'CLOSED', cashEnd: 1, bankEnd: 1 },
      { month: '2026-09', status: 'CLOSED', cashEnd: 5000, bankEnd: 20000, cashEndActual: 4800 },
      { month: '2026-10', status: 'DRAFT', cashEnd: 9, bankEnd: 9 },
    ])).toEqual({ month: '2026-09', cash: 4800, bank: 20000, total: 24800, counted: true });
  });

  it('sums what must be paid within 7 days (incl. overdue)', () => {
    const ap = summarizePayables([{ id: 'a', outstandingAmount: 300, dueDate: '2026-10-10' }, { id: 'b', outstandingAmount: 200, dueDate: '2026-10-22' }] as any, today);
    const bills = unpaidRecurringBills([{ id: 'r', name: 'TNB', amount: 3500, type: 'MONTHLY', dueDay: 25, isActive: true }], today);
    expect(payThisWeek(ap, bills)).toBe(4000);
  });
});
