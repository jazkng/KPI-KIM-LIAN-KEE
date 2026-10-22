import { describe, expect, it } from 'vitest';
import { canStartMeeting, checkinColor, checkinProblem, defaultAttendees, findActiveMeeting, meetingQrUrl, parseCheckinCode, validateMeeting, type Meeting } from '../../utils/meetings/meetingLogic';

const m = (p: Partial<Meeting>): Meeting => ({ id: 'm1', type: 'STORE', date: '2026-10-27', start: '10:00', end: '11:00', attendeeIds: ['1'], status: 'OPEN', createdBy: '0', createdByName: 'B', createdAt: '', ...p });

describe('meeting logic', () => {
    it('权限：管理层会议只有 L1，店面会议 L1–L3', () => {
        expect(canStartMeeting({ orgLevel: 'OWNER' } as any, 'MANAGEMENT')).toBe(true);
        expect(canStartMeeting({ orgLevel: 'BRANCH_MANAGER' } as any, 'MANAGEMENT')).toBe(false);
        expect(canStartMeeting({ orgLevel: 'DEPARTMENT_HEAD' } as any, 'STORE')).toBe(true);
        expect(canStartMeeting({ orgLevel: 'TEAM_LEAD' } as any, 'STORE')).toBe(false);
        expect(canStartMeeting({ orgLevel: 'CREW' } as any, 'STORE')).toBe(false);
    });
    it('只找同类型、当天、开始前 15 分钟到结束之间的会议', () => {
        const list = [m({}), m({ id: 'm2', type: 'MANAGEMENT' }), m({ id: 'm3', date: '2026-10-28' }), m({ id: 'm4', status: 'ENDED' })];
        expect(findActiveMeeting(list, 'STORE', '2026-10-27', '09:45')?.id).toBe('m1');
        expect(findActiveMeeting(list, 'STORE', '2026-10-27', '09:44')).toBeNull();
        expect(findActiveMeeting(list, 'STORE', '2026-10-27', '11:00')?.id).toBe('m1');
        expect(findActiveMeeting(list, 'STORE', '2026-10-27', '11:01')).toBeNull();
        expect(findActiveMeeting(list, 'MANAGEMENT', '2026-10-27', '10:30')?.id).toBe('m2');
    });
    it('颜色：开始前 15 分钟到开始后 10 分钟都合格（绿）、更晚橙、没签灰', () => {
        expect(checkinColor('10:00', '09:45')).toBe('GREEN');
        expect(checkinColor('10:00', '10:00')).toBe('GREEN');
        expect(checkinColor('10:00', '10:10')).toBe('GREEN');
        expect(checkinColor('10:00', '10:11')).toBe('ORANGE');
        expect(checkinColor('10:00', null)).toBe('GRAY');
    });
    it('QR 链接来回', () => {
        expect(meetingQrUrl('STORE', 'https://dev.kimliankee.app/')).toBe('https://dev.kimliankee.app/?checkin=store');
        expect(parseCheckinCode('https://dev.kimliankee.app/?checkin=mgmt')).toBe('MANAGEMENT');
        expect(parseCheckinCode('https://x/?a=1&checkin=store')).toBe('STORE');
        expect(parseCheckinCode('hello')).toBeNull();
    });
    it('名单外不能签', () => {
        expect(checkinProblem(null, '1')).toBe('NO_MEETING');
        expect(checkinProblem(m({}), '2')).toBe('NOT_INVITED');
        expect(checkinProblem(m({}), '1')).toBeNull();
    });
    it('建立前检查与预设名单', () => {
        expect(validateMeeting({ date: '2026-10-27', start: '11:00', end: '10:00', attendeeIds: ['1'] })).toMatch('晚');
        expect(validateMeeting({ date: '2026-10-27', start: '10:00', end: '11:00', attendeeIds: [] })).toMatch('出席');
        expect(validateMeeting({ date: '2026-10-27', start: '10:00', end: '11:00', attendeeIds: ['1'] })).toBeNull();
        const emps = [{ id: 'a', orgLevel: 'OWNER' }, { id: 'b', orgLevel: 'BRANCH_MANAGER' }, { id: 'c', orgLevel: 'DEPARTMENT_HEAD' }, { id: 'd', orgLevel: 'CREW' }, { id: 'e', orgLevel: 'CREW', excludeFromStaff: true }, { id: 'f', orgLevel: 'CREW', isArchived: true }] as any;
        expect(defaultAttendees(emps, 'MANAGEMENT')).toEqual(['b', 'c']);
        expect(defaultAttendees(emps, 'STORE')).toEqual(['a', 'b', 'c', 'd']);
    });
});
