import { describe, expect, it } from 'vitest';
import { buildHrOverview, daysBetween } from '../../utils/hr/hrOverview';
import type { AttendanceRecord, Employee } from '../../types';

const emp = (id: string, extra: Partial<Employee> = {}): Employee => ({
    id, name: id, role: '', status: 'CONFIRMED', level: '', basicSalary: 2000, phone: '', joinDate: '2025-01-01',
    absentDays: 0, gender: 'Male', nationality: 'MY', department: 'KITCHEN', ...extra,
} as Employee);

describe('buildHrOverview', () => {
    const employees = [
        emp('A', { status: 'PROBATION', probationEndDate: '2026-10-25', dateOfBirth: '1990-10-19' }),
        emp('B', { department: 'FLOOR', workPermitExpiry: '2026-10-10', salaryMode: 'DAILY', basicSalary: 80 }),
        emp('C', { typhoidExpiry: '2027-06-01' }),
        emp('D', { isArchived: true }),
        emp('E', { status: 'TERMINATED' }),
        emp('O', { department: 'OWNER' }),
    ];
    const attendance = [{ employeeId: 'A', clockIn: '09:05', status: 'LATE' }] as AttendanceRecord[];
    const o = buildHrOverview({ employees, today: '2026-10-19', dayRoster: { A: 'MORNING', B: 'OFF', C: 'NIGHT' }, attendance });

    it('只算在职员工', () => {
        expect(o.active).toBe(3);
        expect(o.probation).toBe(1);
        expect(o.byDept).toEqual([{ dept: 'KITCHEN', label: '厨房', count: 2 }, { dept: 'FLOOR', label: '楼面', count: 1 }]);
    });
    it('底薪合计只算月薪制', () => expect(o.monthlySalaryTotal).toBe(4000));
    it('今天班表与打卡', () => {
        expect(o.roster?.working.map(p => p.employeeId)).toEqual(['A', 'C']);
        expect(o.roster?.off.map(p => p.employeeId)).toEqual(['B']);
        expect(o.attendance).toMatchObject({ clockedIn: 1, late: 1 });
        expect(o.attendance?.notClockedIn.map(p => p.employeeId)).toEqual(['C']);
    });
    it('到期提醒：过期在前，太远的不列', () => {
        expect(o.expiries.map(x => [x.employeeId, x.kind, x.daysLeft])).toEqual([['B', 'WORK_PERMIT', -9], ['A', 'PROBATION', 6]]);
    });
    it('本月生日', () => expect(o.birthdays).toEqual([{ employeeId: 'A', name: 'A', day: '10-19', isToday: true }]));
    it('没有班表时 roster 为 null，未排班不算上班', () => {
        expect(buildHrOverview({ employees, today: '2026-10-19', dayRoster: null, attendance: null }).roster).toBeNull();
        expect(buildHrOverview({ employees, today: '2026-10-19', dayRoster: {}, attendance: null }).roster).toMatchObject({ working: [], unassigned: 3 });
    });
    it('daysBetween', () => {
        expect(daysBetween('2026-10-19', '2026-11-18')).toBe(30);
        expect(daysBetween('2026-10-19', 'bad')).toBeNull();
    });
});
