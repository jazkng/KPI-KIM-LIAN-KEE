import { describe, expect, it } from 'vitest';
import { fixedShiftTimes } from '../../utils/attendance/fixedShift';
import { DEFAULT_ATTENDANCE_SETTINGS, getAttendanceStatus, getTargetShiftForDate } from '../../utils/dataManager';

// 2026-10-23 是星期五，2026-10-24 是星期六
describe('固定上下班时间', () => {
    it('没设定 = 照旧按考勤设定', () => {
        expect(fixedShiftTimes('2026-10-23', undefined)).toBeNull();
        const s = getTargetShiftForDate('2026-10-23', DEFAULT_ATTENDANCE_SETTINGS, 1);
        expect(s.checkInStr).toBe(DEFAULT_ATTENDANCE_SETTINGS.weekdayCheckIn);
    });
    it('每天同一组时间', () => {
        const f = { checkIn: '09:00', checkOut: '18:00' };
        expect(fixedShiftTimes('2026-10-23', f)).toEqual(f);
        expect(fixedShiftTimes('2026-10-24', f)).toEqual(f);
        const s = getTargetShiftForDate('2026-10-24', DEFAULT_ATTENDANCE_SETTINGS, 2, f);
        expect([s.checkInStr, s.checkOutStr]).toEqual(['09:00', '18:00']);
    });
    it('按星期几不同；没设的那天用平常时间', () => {
        const f = { checkIn: '09:00', checkOut: '18:00', byDay: { '6': { checkIn: '09:00', checkOut: '13:00' } } };
        expect(fixedShiftTimes('2026-10-24', f)).toEqual({ checkIn: '09:00', checkOut: '13:00' });
        expect(fixedShiftTimes('2026-10-23', f)).toEqual({ checkIn: '09:00', checkOut: '18:00' });
    });
    it('特别期间也按自己的时间', () => {
        const settings = { ...DEFAULT_ATTENDANCE_SETTINGS, hasSpecialPeriod: true, specialStartDate: '2026-10-01', specialEndDate: '2026-10-31', specialCheckIn: '15:00', specialCheckOut: '02:00' };
        expect(getTargetShiftForDate('2026-10-23', settings, 1, { checkIn: '09:00', checkOut: '18:00' }).checkInStr).toBe('09:00');
    });
    it('跨午夜的固定时间', () => {
        const s = getTargetShiftForDate('2026-10-23', DEFAULT_ATTENDANCE_SETTINGS, 1, { checkIn: '20:00', checkOut: '04:00' });
        expect(s.checkOut.getDate()).toBe(24);
    });
    it('迟到 / 早退按固定时间判断', () => {
        const f = { checkIn: '09:00', checkOut: '18:00' };
        const inISO = new Date('2026-10-23T09:05:00').toISOString();
        const outISO = new Date('2026-10-23T18:00:00').toISOString();
        const r = getAttendanceStatus(inISO, outISO, '2026-10-23', { ...DEFAULT_ATTENDANCE_SETTINGS, graceMinutes: 0 }, 1, f);
        expect(r.lateMinutes).toBe(5);
        expect(r.isEarlyOut).toBe(false);
        // 没有固定时间：同样 18:00 下班，按店面时间是早退
        expect(getAttendanceStatus(inISO, outISO, '2026-10-23', DEFAULT_ATTENDANCE_SETTINGS, 1).isEarlyOut).toBe(true);
    });
});
