// ============================================================================
// 积分：资料库读写
// 新集合（V1 不读不写）：hygiene_checks（每周卫生评分）、points_monthly（HR 确认后的月积分存档）
// 读取现有资料（考勤、委托任务、会议、警告、评语、技能纪录）只读不改。
// ============================================================================
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { AttendanceRecord, Employee } from '../../types';
import { DataManager } from '../dataManager';
import { getMalaysiaDateString } from '../dateHelper';
import { isCountedStaff, isPartTimer } from '../hr/hrOverview';
import { myTime, type Meeting, type MeetingCheckin } from '../meetings/meetingLogic';
import { listRecentTasks } from '../tasks/staffTaskStore';
import type { StaffTask } from '../tasks/staffTaskLogic';
import { computeMonthPoints, type HygieneCheck, type MonthPoints } from './pointsCalc';

const HYGIENE = 'hygiene_checks', MONTHLY = 'points_monthly';
const monthEnd = (month: string) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
/** 这个月算到哪一天：当月 = 今天；以前的月份 = 月底 */
export const asOfFor = (month: string, today = getMalaysiaDateString()) => month === today.slice(0, 7) ? today : monthEnd(month);
const toDate = (iso: string) => getMalaysiaDateString(new Date(iso));
const toHHMM = (iso: string) => myTime(new Date(iso));

// ── 卫生检查 ──
export const hygieneDocId = (weekStart: string, employeeId: string) => `${weekStart}_${employeeId}`;
export const saveHygieneCheck = async (c: Omit<HygieneCheck, 'id' | 'at'>) => {
    const check: HygieneCheck = { ...c, id: hygieneDocId(c.weekStart, c.employeeId), at: new Date().toISOString() };
    await setDoc(doc(db, HYGIENE, check.id), JSON.parse(JSON.stringify(check)));
    return check;
};
/** 某段日期（周一）之间的卫生检查 */
export const listHygieneChecks = async (fromWeek: string, toWeek: string) => {
    const snap = await getDocs(query(collection(db, HYGIENE), where('weekStart', '>=', fromWeek), where('weekStart', '<=', toWeek)));
    return snap.docs.map(d => d.data() as HygieneCheck);
};

// ── 读一个月的资料 ──
const listMeetingsIn = async (month: string) => {
    const snap = await getDocs(query(collection(db, 'meetings'), where('date', '>=', `${month}-01`), where('date', '<=', monthEnd(month))));
    return snap.docs.map(d => d.data() as Meeting);
};
const listCheckinsIn = async (month: string) => {
    const snap = await getDocs(query(collection(db, 'meeting_checkins'), where('meetingDate', '>=', `${month}-01`), where('meetingDate', '<=', monthEnd(month))));
    return snap.docs.map(d => { const x: any = d.data(); return { id: x.id, meetingId: x.meetingId, employeeId: x.employeeId, employeeName: x.employeeName, via: x.via, checkedInAt: x.serverAt?.toDate ? x.serverAt.toDate().toISOString() : x.clientAt } as MeetingCheckin; });
};

interface MonthData { tasks: StaffTask[]; attendance: AttendanceRecord[]; hygiene: HygieneCheck[]; meetings: Meeting[]; checkins: MeetingCheckin[] }
const loadMonthData = async (month: string, employeeId?: string): Promise<MonthData> => {
    const [tasks, attendance, hygiene, meetings, checkins] = await Promise.all([
        listRecentTasks().catch(() => [] as StaffTask[]),
        DataManager.getAttendanceByMonth(month, employeeId).catch(() => [] as AttendanceRecord[]),
        listHygieneChecks(`${month}-01`, monthEnd(month)).catch(() => [] as HygieneCheck[]),
        listMeetingsIn(month).catch(() => [] as Meeting[]),
        listCheckinsIn(month).catch(() => [] as MeetingCheckin[]),
    ]);
    return { tasks, attendance, hygiene, meetings, checkins };
};

const pointsFor = (e: Employee, month: string, asOf: string, d: MonthData) => computeMonthPoints({
    month, asOf, employee: e,
    tasks: d.tasks.filter(t => t.assigneeId === e.id || t.assignMode === 'DEPT'),
    attendance: d.attendance.filter(a => a.employeeId === e.id),
    hygiene: d.hygiene.filter(h => h.employeeId === e.id),
    meetings: d.meetings, checkins: d.checkins.filter(c => c.employeeId === e.id),
    toDate, toHHMM,
});

/** 员工自己看：这个月（到今天为止）的积分；用资料库最新的员工资料（警告、评语、技能纪录） */
export const loadMyPoints = async (employeeId: string, month: string): Promise<MonthPoints | null> => {
    const e = await DataManager.getEmployeeById(employeeId);
    if (!e) return null;
    const confirmed = await getConfirmedPoints(month, employeeId);
    if (confirmed) return confirmed;
    return pointsFor(e, month, asOfFor(month), await loadMonthData(month, employeeId));
};

/** HR：全部员工这个月的积分 */
export const loadAllPoints = async (month: string) => {
    const [employees, d] = await Promise.all([DataManager.getEmployees(), loadMonthData(month)]);
    const asOf = asOfFor(month);
    const confirmed = await listConfirmedPoints(month);
    // 兼职不评积分（负责人 2026-10-23）
    return employees.filter(e => isCountedStaff(e) && !isPartTimer(e)).map(e => ({ employee: e, points: confirmed[e.id] || pointsFor(e, month, asOf, d), confirmed: !!confirmed[e.id] }))
        .sort((a, b) => b.points.total - a.points.total);
};

// ── HR 确认后存档（之后不再变动） ──
export interface ConfirmedPoints extends MonthPoints { employeeId: string; confirmedBy: string; confirmedAt: string }
export const confirmMonthPoints = async (rows: { employee: Employee; points: MonthPoints }[], actor: Employee) => {
    const at = new Date().toISOString();
    await Promise.all(rows.map(({ employee, points }) => setDoc(doc(db, MONTHLY, `${points.month}_${employee.id}`),
        JSON.parse(JSON.stringify({ ...points, employeeId: employee.id, confirmedBy: actor.name, confirmedAt: at })))));
};
export const getConfirmedPoints = async (month: string, employeeId: string) => {
    const s = await getDoc(doc(db, MONTHLY, `${month}_${employeeId}`)).catch(() => null);
    return s?.exists() ? (s.data() as ConfirmedPoints) : null;
};
const listConfirmedPoints = async (month: string) => {
    const snap = await getDocs(query(collection(db, MONTHLY), where('month', '==', month))).catch(() => null);
    return Object.fromEntries((snap?.docs || []).map(d => [(d.data() as ConfirmedPoints).employeeId, d.data() as ConfirmedPoints]));
};
