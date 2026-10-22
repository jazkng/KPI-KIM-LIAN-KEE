import { describe, expect, it } from 'vitest';
import { countLateEarly } from '../../utils/hr/attendanceCounts';

const r = (date: string, status: any, extra: any = {}) => ({ id: date, employeeId: 'e', employeeName: 'E', date, clockIn: '', clockOut: '', durationMinutes: 0, status, ...extra });

describe('countLateEarly', () => {
    it('迟到、早退分开算，迟到又早退两边都算，豁免的迟到不算', () => {
        const c = countLateEarly([
            r('2026-09-01', 'LATE'), r('2026-09-03', 'COMPLETED_LATE'), r('2026-10-02', 'LATE_AND_EARLY'),
            r('2026-10-05', 'EARLY_OUT'), r('2026-10-06', 'COMPLETED'), r('2026-10-07', 'LATE', { lateExcused: true }),
        ] as any);
        expect(c).toEqual({ late: 3, early: 2, lastLate: '2026-10-02', lastEarly: '2026-10-05' });
    });
    it('没有记录 = 0', () => {
        expect(countLateEarly([])).toEqual({ late: 0, early: 0, lastLate: '', lastEarly: '' });
    });
});
