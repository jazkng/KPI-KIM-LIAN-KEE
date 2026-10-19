// ============================================================================
// 人事中心：员工、今天排班、今天打卡的汇总（纯函数，只读）
// ----------------------------------------------------------------------------
// 资料来源：employees、roster_months/{YYYY-MM}.roster[日期][员工ID]、attendance（当天）
// 这里不写入任何资料。
// ============================================================================

import type { AttendanceRecord, Employee } from '../../types';

export const DEPT_LABEL: Record<string, string> = {
    KITCHEN: '厨房', FLOOR: '楼面', BAR: '水吧', DISHWASH: '洗碗', BACK_OFFICE: '后勤', OTHER: '其他', OWNER: '老板',
};

/** 排班里算「休息 / 请假」的状态 */
const OFF_STATUSES = new Set(['OFF', 'LEAVE', 'MC', 'ABSENT', 'ANNUAL', 'HOLIDAY']);
const NOT_WORKING = new Set([...OFF_STATUSES, 'UNASSIGNED', 'PENDING']);

export const ROSTER_STATUS_LABEL: Record<string, string> = {
    MORNING: '早班', AFTERNOON: '午班', NIGHT: '晚班', WORK: '上班',
    OFF: '休息', LEAVE: '请假', MC: '病假', ABSENT: '缺勤', ANNUAL: '年假', HOLIDAY: '公假',
};

export type ExpiryKind = 'WORK_PERMIT' | 'TYPHOID' | 'CONTRACT' | 'PROBATION';
export const EXPIRY_LABEL: Record<ExpiryKind, string> = {
    WORK_PERMIT: '准证到期', TYPHOID: '伤寒针到期', CONTRACT: '合约到期', PROBATION: '试用期结束',
};

export interface ExpiryItem { employeeId: string; name: string; kind: ExpiryKind; date: string; daysLeft: number }
export interface PersonLine { employeeId: string; name: string; dept: string; status: string }

export interface HrOverview {
    active: number;
    probation: number;
    byDept: { dept: string; label: string; count: number }[];
    monthlySalaryTotal: number;
    roster: null | { working: PersonLine[]; off: PersonLine[]; unassigned: number };
    attendance: null | { clockedIn: number; late: number; notClockedIn: PersonLine[] };
    expiries: ExpiryItem[];
    birthdays: { employeeId: string; name: string; day: string; isToday: boolean }[];
}

/** 在职员工（老板本人不算在人数里） */
const isActive = (e: Employee) => !e.isArchived && e.status !== 'TERMINATED' && e.department !== 'OWNER';

/** 'YYYY-MM-DD'（也接受带时间的字串）→ 两个日期相差几天；读不懂返回 null */
export const daysBetween = (from: string, to: string): number | null => {
    const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
};

const LATE_STATUSES = new Set(['LATE', 'COMPLETED_LATE', 'LATE_AND_EARLY']);

export const buildHrOverview = (args: {
    employees: Employee[];
    today: string;
    /** 今天那一格：{ 员工ID: 状态 }；没有班表传 null */
    dayRoster: Record<string, string> | null;
    /** 今天的打卡；没读到传 null */
    attendance: AttendanceRecord[] | null;
    /** 未来几天内到期的才列出（已过期的一律列出） */
    expiryWindowDays?: number;
}): HrOverview => {
    const { today, dayRoster, attendance, expiryWindowDays = 60 } = args;
    const staff = args.employees.filter(isActive).sort((a, b) => a.name.localeCompare(b.name));
    const dept = (e: Employee) => e.department || 'OTHER';
    const line = (e: Employee, status = ''): PersonLine => ({ employeeId: e.id, name: e.name, dept: dept(e), status });

    const deptCount = new Map<string, number>();
    staff.forEach(e => deptCount.set(dept(e), (deptCount.get(dept(e)) || 0) + 1));
    const byDept = [...deptCount.entries()]
        .map(([d, count]) => ({ dept: d, label: DEPT_LABEL[d] || d, count }))
        .sort((a, b) => b.count - a.count);

    const monthlySalaryTotal = staff
        .filter(e => (e.salaryMode || 'MONTHLY') === 'MONTHLY')
        .reduce((s, e) => s + (Number(e.basicSalary) || 0), 0);

    let roster: HrOverview['roster'] = null;
    if (dayRoster) {
        const working: PersonLine[] = [], off: PersonLine[] = [];
        let unassigned = 0;
        staff.forEach(e => {
            const s = String(dayRoster[e.id] || 'UNASSIGNED');
            if (OFF_STATUSES.has(s)) off.push(line(e, s));
            else if (NOT_WORKING.has(s)) unassigned++;
            else working.push(line(e, s));
        });
        roster = { working, off, unassigned };
    }

    let att: HrOverview['attendance'] = null;
    if (attendance) {
        const byEmp = new Map(attendance.filter(a => a.clockIn).map(a => [a.employeeId, a]));
        const expected = roster ? roster.working : [];
        att = {
            clockedIn: byEmp.size,
            late: [...byEmp.values()].filter(a => LATE_STATUSES.has(a.status)).length,
            notClockedIn: expected.filter(p => !byEmp.has(p.employeeId)),
        };
    }

    const expiries: ExpiryItem[] = [];
    staff.forEach(e => {
        const add = (kind: ExpiryKind, date?: string) => {
            if (!date) return;
            const d = daysBetween(today, date);
            if (d === null || d > expiryWindowDays) return;
            // 试用期结束 / 合约到期太久以前的就不再提（多半是忘了更新状态，但只提最近 30 天）
            if ((kind === 'PROBATION' || kind === 'CONTRACT') && d < -30) return;
            expiries.push({ employeeId: e.id, name: e.name, kind, date: String(date).slice(0, 10), daysLeft: d });
        };
        add('WORK_PERMIT', e.workPermitExpiry);
        add('TYPHOID', e.typhoidExpiry);
        add('CONTRACT', e.contractEndDate);
        if (e.status === 'PROBATION') add('PROBATION', e.probationEndDate);
    });
    expiries.sort((a, b) => a.daysLeft - b.daysLeft);

    const month = today.slice(5, 7);
    const birthdays = staff
        .filter(e => e.dateOfBirth && String(e.dateOfBirth).slice(5, 7) === month)
        .map(e => ({ employeeId: e.id, name: e.name, day: String(e.dateOfBirth).slice(5, 10), isToday: String(e.dateOfBirth).slice(5, 10) === today.slice(5, 10) }))
        .sort((a, b) => a.day.localeCompare(b.day));

    return {
        active: staff.length,
        probation: staff.filter(e => e.status === 'PROBATION').length,
        byDept, monthlySalaryTotal, roster, attendance: att, expiries, birthdays,
    };
};
