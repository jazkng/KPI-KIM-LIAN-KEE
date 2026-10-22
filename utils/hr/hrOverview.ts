// ============================================================================
// 人事中心：员工、今天排班、本月兼职 / 预支的汇总（纯函数，只读）
// ----------------------------------------------------------------------------
// 资料来源：employees、roster_months/{YYYY-MM}.roster[日期][员工ID]、
//           standalone_expenses（STAFF_ADVANCE = 预支；SALARY 且 id 不是 salary_/payroll_ 开头 = 兼职）
// 这里不写入任何资料。
// ============================================================================

import type { Employee, ExpenseItem } from '../../types';

export const DEPT_LABEL: Record<string, string> = {
    KITCHEN: '厨房', FLOOR: '楼面', BAR: '水吧', DISHWASH: '洗碗', BACK_OFFICE: '后勤', OTHER: '其他', OWNER: '老板',
};
/** 人事中心 / 排班的部门顺序 */
export const DEPT_ORDER = ['KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER'];

/** 排班里算「休息 / 请假」的状态 */
const OFF_STATUSES = new Set(['OFF', 'LEAVE', 'MC', 'ABSENT', 'ANNUAL', 'HOLIDAY']);
const NOT_WORKING = new Set([...OFF_STATUSES, 'UNASSIGNED', 'PENDING']);

export const ROSTER_STATUS_LABEL: Record<string, string> = {
    MORNING: '早班', AFTERNOON: '午班', NIGHT: '晚班', WORK: '上班',
    OFF: '休息', LEAVE: '请假', MC: '病假', ABSENT: '缺勤', ANNUAL: '年假', HOLIDAY: '公假',
};

/**
 * 算不算员工（人数、排班、人事中心）：
 * 离职 / 封存、老板部门、档案勾了「不计入员工」的都不算。
 */
export const isCountedStaff = (e: Employee) =>
    !e.isArchived && e.status !== 'TERMINATED' && e.department !== 'OWNER' && e.excludeFromStaff !== true;

export interface PersonLine { employeeId: string; name: string; status: string }
export interface DeptToday {
    dept: string;
    label: string;
    total: number;
    working: PersonLine[];
    off: PersonLine[];
    unassigned: PersonLine[];
}
export interface StaffCashMonth {
    advanceTotal: number;
    advanceCount: number;
    partTimeTotal: number;
    partTimeCount: number;
    /** 本月预支最多的几个人 */
    topAdvances: { name: string; amount: number }[];
}

export interface HrOverview {
    active: number;
    probation: number;
    monthlySalaryTotal: number;
    /** 有班表才有：今天上班 / 休息总数 */
    working: number | null;
    off: number | null;
    /** 按部门：今天谁上班、谁休息（没有班表时 working / off 都是空的，人全部在 unassigned） */
    depts: DeptToday[];
    hasRoster: boolean;
    birthdays: { employeeId: string; name: string; day: string; isToday: boolean }[];
}

export const buildHrOverview = (args: {
    employees: Employee[];
    today: string;
    /** 今天那一格：{ 员工ID: 状态 }；没有班表传 null */
    dayRoster: Record<string, string> | null;
}): HrOverview => {
    const { today, dayRoster } = args;
    const staff = args.employees.filter(isCountedStaff).sort((a, b) => a.name.localeCompare(b.name));
    const deptOf = (e: Employee) => (e.department && DEPT_LABEL[e.department] ? e.department : 'OTHER');

    const byDept = new Map<string, DeptToday>();
    staff.forEach(e => {
        const d = deptOf(e);
        if (!byDept.has(d)) byDept.set(d, { dept: d, label: DEPT_LABEL[d], total: 0, working: [], off: [], unassigned: [] });
        const row = byDept.get(d)!;
        row.total++;
        const s = String(dayRoster?.[e.id] || 'UNASSIGNED');
        const line = { employeeId: e.id, name: e.name, status: s };
        if (!dayRoster || NOT_WORKING.has(s) && !OFF_STATUSES.has(s)) row.unassigned.push(line);
        else if (OFF_STATUSES.has(s)) row.off.push(line);
        else row.working.push(line);
    });
    const depts = [...byDept.values()].sort((a, b) => DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept));

    const monthlySalaryTotal = staff
        .filter(e => (e.salaryMode || 'MONTHLY') === 'MONTHLY')
        .reduce((s, e) => s + (Number(e.basicSalary) || 0), 0);

    const month = today.slice(5, 7);
    const birthdays = staff
        .filter(e => e.dateOfBirth && String(e.dateOfBirth).slice(5, 7) === month)
        .map(e => ({ employeeId: e.id, name: e.name, day: String(e.dateOfBirth).slice(5, 10), isToday: String(e.dateOfBirth).slice(5, 10) === today.slice(5, 10) }))
        .sort((a, b) => a.day.localeCompare(b.day));

    return {
        active: staff.length,
        probation: staff.filter(e => e.status === 'PROBATION').length,
        monthlySalaryTotal,
        working: dayRoster ? depts.reduce((s, d) => s + d.working.length, 0) : null,
        off: dayRoster ? depts.reduce((s, d) => s + d.off.length, 0) : null,
        depts,
        hasRoster: !!dayRoster,
        birthdays,
    };
};

const dateOf = (e: ExpenseItem) => String(e.paymentDate || e.time || '').slice(0, 10);

/** 本月预支 / 兼职（跟「兼职与预支」页同一套判断） */
export const summarizeStaffCash = (args: { advances: ExpenseItem[]; salaries: ExpenseItem[]; month: string }): StaffCashMonth => {
    const { month } = args;
    const advances = args.advances.filter(e => dateOf(e).startsWith(month) || String(e.time || '').startsWith(month));
    const partTimes = args.salaries.filter(e => e.id && !(e.id.startsWith('salary_') || e.id.startsWith('payroll_')) && String(e.time || '').startsWith(month));
    const sum = (list: ExpenseItem[]) => Math.round(list.reduce((s, e) => s + (Number(e.amount) || 0), 0) * 100) / 100;
    const perPerson = new Map<string, number>();
    advances.forEach(e => perPerson.set(e.company || '?', (perPerson.get(e.company || '?') || 0) + (Number(e.amount) || 0)));
    return {
        advanceTotal: sum(advances),
        advanceCount: advances.length,
        partTimeTotal: sum(partTimes),
        partTimeCount: partTimes.length,
        topAdvances: [...perPerson.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    };
};

/** 班表一个月：{ 日期: 上班人数 }（只算计入员工、排了上班班次的人；休息 / 请假 / 未排都不算） */
export const countWorkersByDate = (roster: Record<string, Record<string, string>>, employees: Employee[]): Record<string, number> => {
    const counted = new Set(employees.filter(isCountedStaff).map(e => e.id));
    const out: Record<string, number> = {};
    Object.entries(roster || {}).forEach(([date, day]) => {
        const n = Object.entries(day || {}).filter(([id, s]) => counted.has(id) && !NOT_WORKING.has(String(s))).length;
        if (n > 0) out[date] = n;
    });
    return out;
};
