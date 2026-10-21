import { describe, expect, it } from 'vitest';
import { buildHrOverview, isCountedStaff, summarizeStaffCash } from '../../utils/hr/hrOverview';
import type { Employee, ExpenseItem } from '../../types';

const emp = (id: string, extra: Partial<Employee> = {}): Employee => ({
    id, name: id, role: '', status: 'CONFIRMED', level: '', basicSalary: 2000, phone: '', joinDate: '2025-01-01',
    absentDays: 0, gender: 'Male', nationality: 'MY', department: 'KITCHEN', ...extra,
} as Employee);

describe('buildHrOverview', () => {
    const employees = [
        emp('A', { status: 'PROBATION', dateOfBirth: '1990-10-19' }),
        emp('B', { department: 'FLOOR', salaryMode: 'DAILY', basicSalary: 80 }),
        emp('C'),
        emp('D', { isArchived: true }),
        emp('E', { status: 'TERMINATED' }),
        emp('O', { department: 'OWNER' }),
        emp('X', { excludeFromStaff: true }),
    ];
    const o = buildHrOverview({ employees, today: '2026-10-19', dayRoster: { A: 'MORNING', B: 'OFF', C: 'NIGHT' } });

    it('只算在职、计入员工的人', () => {
        expect(o.active).toBe(3);
        expect(o.probation).toBe(1);
        expect(isCountedStaff(emp('X', { excludeFromStaff: true }))).toBe(false);
    });
    it('底薪合计只算月薪制', () => expect(o.monthlySalaryTotal).toBe(4000));
    it('今天班表按部门：上班 / 休息', () => {
        expect(o.working).toBe(2);
        expect(o.off).toBe(1);
        expect(o.depts.map(d => [d.dept, d.working.map(p => p.employeeId), d.off.map(p => p.employeeId)]))
            .toEqual([['KITCHEN', ['A', 'C'], []], ['FLOOR', [], ['B']]]);
    });
    it('本月生日', () => expect(o.birthdays).toEqual([{ employeeId: 'A', name: 'A', day: '10-19', isToday: true }]));
    it('没有班表：只有部门人数', () => {
        const n = buildHrOverview({ employees, today: '2026-10-19', dayRoster: null });
        expect(n.hasRoster).toBe(false);
        expect(n.working).toBeNull();
        expect(n.depts[0]).toMatchObject({ dept: 'KITCHEN', total: 2, working: [] });
    });
    it('未排班的人不算上班也不算休息', () => {
        const n = buildHrOverview({ employees, today: '2026-10-19', dayRoster: { A: 'MORNING' } });
        expect(n.working).toBe(1);
        expect(n.off).toBe(0);
        expect(n.depts[0].unassigned.map(p => p.employeeId)).toEqual(['C']);
    });
});

describe('summarizeStaffCash', () => {
    const x = (id: string, amount: number, time: string, company = 'A') => ({ id, amount, time, company } as ExpenseItem);
    it('本月预支与兼职；薪资单（salary_ / payroll_）不算兼职', () => {
        const r = summarizeStaffCash({
            month: '2026-10',
            advances: [x('a1', 100, '2026-10-02', 'Ali'), x('a2', 50, '2026-10-05', 'Ali'), x('a3', 80, '2026-10-06', 'Mei'), x('a4', 999, '2026-09-30')],
            salaries: [x('pt1', 120, '2026-10-03'), x('salary_1', 2000, '2026-10-01'), x('payroll_1', 2000, '2026-10-01'), x('pt2', 60, '2026-09-03')],
        });
        expect(r).toEqual({ advanceTotal: 230, advanceCount: 3, partTimeTotal: 120, partTimeCount: 1, topAdvances: [{ name: 'Ali', amount: 150 }, { name: 'Mei', amount: 80 }] });
    });
});
