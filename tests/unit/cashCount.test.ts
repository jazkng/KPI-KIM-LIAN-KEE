import { describe, expect, it } from 'vitest';
import { cashCountId, cashTotalSen, cleanCounts, countsEntered, formatRm } from '../../utils/tasks/cashCount';
import { validateSubmission, type StaffTask } from '../../utils/tasks/staffTaskLogic';

describe('收银点钱', () => {
    it('按面额算合计（用仙计算，没有小数误差）', () => {
        const c = cleanCounts({ '10000': '2', '5000': '1', '100': '7', '50': '3', '20': '1', '10': '4', '5': '1' });
        expect(cashTotalSen(c)).toBe(20000 + 5000 + 700 + 150 + 20 + 40 + 5);
        expect(formatRm(cashTotalSen(c))).toBe('RM 259.15');
    });
    it('空白不算、负数和小数不收、不认识的面额不收', () => {
        const c = cleanCounts({ '10000': '', '5000': '-1', '2000': '1.5', '999': '3', '1000': '0' });
        expect(c).toEqual({ '1000': 0 });
        expect(countsEntered(c)).toBe(true);
        expect(countsEntered(cleanCounts({}))).toBe(false);
    });
    it('差额与显示', () => {
        expect(formatRm(-1250)).toBe('−RM 12.50');
        expect(cashCountId('2026-10-24', 'task_x')).toBe('2026-10-24_task_x');
    });
    it('收银任务交回前一定要有上班与下班金额', () => {
        const t = { type: 'CASH', photosRequired: 0 } as StaffTask;
        expect(validateSubmission(t, { photoCount: 0 })).toMatch(/上班和下班/);
        expect(validateSubmission(t, { photoCount: 0, cash: { openingSen: 20000, closingSen: 85000 } })).toBeNull();
    });
});
