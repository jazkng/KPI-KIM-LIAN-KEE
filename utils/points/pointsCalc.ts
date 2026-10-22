// ============================================================================
// 员工积分（每月）——纯计算
// 规则：docs/hr/points-system-design.md（负责人 2026-10-22 确认）
// 输入的资料都是现有纪录（考勤、委托任务、会议签到、卫生检查、警告、评语、技能改分纪录），
// 这里只计算，不读写资料库。
// ============================================================================
import type { AttendanceRecord, ReviewRecord, SkillRatingLog, WarningRecord } from '../../types';
import { currentCycle, type StaffTask } from '../tasks/staffTaskLogic';
import { checkinColor, type Meeting, type MeetingCheckin } from '../meetings/meetingLogic';

export const MAX = { tasks: 30, attendance: 25, hygiene: 20, meetings: 10, discipline: 15 } as const;
export type PointsKey = keyof typeof MAX | 'bonus';

export interface PointsLine { date?: string; text: string; points: number }
export interface PointsPart { key: PointsKey; label: string; max: number | null; points: number; lines: PointsLine[] }
export interface MonthPoints { month: string; total: number; grade: 'A' | 'B' | 'C' | 'D'; parts: PointsPart[] }

export interface HygieneCheck {
    id: string;
    employeeId: string;
    /** 那一周的星期一（YYYY-MM-DD） */
    weekStart: string;
    score: 1 | 2 | 3 | 4 | 5;
    note?: string;
    checkedBy: string;
    checkedByName: string;
    at: string;
}

export interface PointsInput {
    month: string;
    /** 算到哪一天（当月进行中 = 今天；过去的月份 = 月底） */
    asOf: string;
    employee: { id: string; name: string; warningHistory?: WarningRecord[]; reviews?: ReviewRecord[]; skillRatingLog?: SkillRatingLog[] };
    tasks: StaffTask[];
    attendance: AttendanceRecord[];
    hygiene: HygieneCheck[];
    meetings: Meeting[];
    checkins: MeetingCheckin[];
    /** 马来西亚时间 HH:MM（签到时间换算用） */
    toHHMM: (iso: string) => string;
    /** ISO 时间 → 马来西亚日期 */
    toDate: (iso: string) => string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const inMonth = (d: string | undefined, month: string) => !!d && d.slice(0, 7) === month;
const monthsBetween = (from: string, to: string) => {
    const [a, b] = [from.split('-').map(Number), to.split('-').map(Number)];
    return (b[0] - a[0]) * 12 + (b[1] - a[1]);
};
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const gradeOf = (total: number): MonthPoints['grade'] => total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : 'D';

// ── 1. 任务完成率（30）：派给本人的任务，每一期算一次；迟交但有交回也算完成。部门任务谁交回就算谁的。
export const taskPart = (inp: PointsInput): PointsPart => {
    const { month, asOf, employee: e } = inp;
    const start = `${month}-01`;
    let assigned = 0, done = 0;
    const lines: PointsLine[] = [];
    inp.tasks.forEach(t => {
        if (t.status === 'CANCELLED') return;
        const mine = t.assignMode === 'PERSON' && t.assigneeId === e.id;
        const submits = (t.history || []).filter(h => h.action === 'SUBMIT' && h.by === e.name).map(h => inp.toDate(h.at));
        if (t.repeat === 'ONCE') {
            const when = (t.dueAt ? inp.toDate(t.dueAt) : t.createdAt.slice(0, 10));
            const submitted = submits.length > 0 || (mine && (t.status === 'SUBMITTED' || t.status === 'DONE'));
            if (mine && inMonth(when, month) && when <= asOf) {
                assigned++;
                if (submitted) done++; else lines.push({ date: when, text: `没完成：${t.title}`, points: 0 });
            } else if (!mine && submits.some(d => inMonth(d, month))) { assigned++; done++; }
            return;
        }
        // 重复任务：本月（到今天为止）的每一期
        const doneCycles = new Set(submits.map(d => currentCycle(t, d)).filter(Boolean) as string[]);
        if (mine) {
            const from = t.createdAt.slice(0, 10) > start ? t.createdAt.slice(0, 10) : start;
            for (let d = from; d <= asOf && inMonth(d, month); d = addDays(d, 1)) {
                if (currentCycle(t, d) !== d) continue;
                assigned++;
                if (doneCycles.has(d)) done++; else lines.push({ date: d, text: `没完成：${t.title}`, points: 0 });
            }
        } else {
            [...doneCycles].filter(c => inMonth(c, month)).forEach(() => { assigned++; done++; });
        }
    });
    const points = assigned ? r1(MAX.tasks * done / assigned) : MAX.tasks;
    return { key: 'tasks', label: '任务完成率', max: MAX.tasks, points, lines: [{ text: assigned ? `完成 ${done} / ${assigned} 个任务` : '本月没有派给你的任务', points }, ...lines.slice(0, 20)] };
};

// ── 2. 出勤（25）：迟到 −2、早退 −2、缺勤 −5；主管豁免的迟到不扣；最低 0
const LATE = new Set(['LATE', 'COMPLETED_LATE', 'LATE_AND_EARLY']);
const EARLY = new Set(['EARLY_OUT', 'LATE_AND_EARLY']);
export const attendancePart = (inp: PointsInput): PointsPart => {
    const lines: PointsLine[] = [];
    inp.attendance.filter(a => inMonth(a.date, inp.month) && a.date <= inp.asOf && a.employeeId === inp.employee.id).forEach(a => {
        if (LATE.has(a.status) && !a.lateExcused) lines.push({ date: a.date, text: '迟到', points: -2 });
        if (EARLY.has(a.status)) lines.push({ date: a.date, text: '早退', points: -2 });
        if (a.status === 'ABSENT') lines.push({ date: a.date, text: '缺勤', points: -5 });
    });
    lines.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const points = Math.max(0, MAX.attendance + lines.reduce((n, l) => n + l.points, 0));
    return { key: 'attendance', label: '出勤（迟到 / 早退）', max: MAX.attendance, points, lines };
};

// ── 3. 个人卫生（20）：每周 1–5 分。平均 3 分 = 满分；1 分 = 0；2 分 = 10。4 分另 +1、5 分另 +2（算在加分）
export const hygienePart = (inp: PointsInput): { part: PointsPart; bonus: PointsLine[] } => {
    const checks = inp.hygiene.filter(h => h.employeeId === inp.employee.id && inMonth(h.weekStart, inp.month)).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const lines: PointsLine[] = checks.map(h => ({ date: h.weekStart, text: `卫生 ${h.score} 分${h.note ? `：${h.note}` : ''}（${h.checkedByName}）`, points: 0 }));
    const avg = checks.length ? checks.reduce((n, h) => n + MAX.hygiene * (Math.min(h.score, 3) - 1) / 2, 0) / checks.length : MAX.hygiene;
    const bonus = checks.filter(h => h.score >= 4).map(h => ({ date: h.weekStart, text: `卫生 ${h.score} 分（超过标准）`, points: h.score === 5 ? 2 : 1 }));
    return { part: { key: 'hygiene', label: '个人卫生', max: MAX.hygiene, points: r1(avg), lines: checks.length ? lines : [{ text: '本月还没有卫生检查', points: 0 }] }, bonus };
};

// ── 4. 会议（10，每月重置）：开始前 15 分钟到开始后 10 分钟 = 合格；更晚 −3；没来 −5
export const meetingPart = (inp: PointsInput): PointsPart => {
    const lines: PointsLine[] = [];
    inp.meetings.filter(m => m.status !== 'CANCELLED' && inMonth(m.date, inp.month) && m.attendeeIds.includes(inp.employee.id))
        // 已经开过的会议：今天以前的，或今天已结束 / 已签到的
        .filter(m => m.date < inp.asOf || (m.date === inp.asOf && (m.status === 'ENDED' || inp.checkins.some(c => c.meetingId === m.id && c.employeeId === inp.employee.id))))
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
        .forEach(m => {
            const c = inp.checkins.find(x => x.meetingId === m.id && x.employeeId === inp.employee.id);
            const color = checkinColor(m.start, c ? inp.toHHMM(c.checkedInAt) : null);
            const label = m.type === 'MANAGEMENT' ? '管理层会议' : '店面会议';
            if (color === 'GRAY') lines.push({ date: m.date, text: `${label}没来`, points: -5 });
            else if (color === 'ORANGE') lines.push({ date: m.date, text: `${label}晚到（${inp.toHHMM(c!.checkedInAt)}）`, points: -3 });
            else lines.push({ date: m.date, text: `${label}准时`, points: 0 });
        });
    const points = Math.max(0, MAX.meetings + lines.reduce((n, l) => n + l.points, 0));
    return { key: 'meetings', label: '会议出席', max: MAX.meetings, points, lines };
};

// ── 5. 纪律（15）：警告 −5（当月）；黄色 −10、−5（2 个月）；红色 −50、−40、−30、−20、−10（5 个月）
const WARNING_STEPS: Record<WarningRecord['type'], number[]> = { VERBAL: [-5], WRITTEN: [-10, -5], FINAL: [-50, -40, -30, -20, -10] };
const WARNING_LABEL: Record<WarningRecord['type'], string> = { VERBAL: '警告', WRITTEN: '黄色警告', FINAL: '红色警告' };
export const disciplinePart = (inp: PointsInput): PointsPart => {
    const lines: PointsLine[] = [];
    (inp.employee.warningHistory || []).forEach(w => {
        const d = String(w.date || '').slice(0, 10);
        if (!d) return;
        const k = monthsBetween(d.slice(0, 7), inp.month);
        const step = WARNING_STEPS[w.type]?.[k];
        if (k >= 0 && step) lines.push({ date: d, text: `${WARNING_LABEL[w.type]}${k ? `（第 ${k + 1} 个月）` : ''}：${w.reason || ''}`, points: step });
    });
    return { key: 'discipline', label: '纪律', max: MAX.discipline, points: MAX.discipline + lines.reduce((n, l) => n + l.points, 0), lines };
};

// ── 6. 加分：表扬 +15；技能升星（第一次评不加）1→2 +2、2→3 +5、3→4 +10、4→5 +15，维持 3 个月
const STAR_UP: Record<number, number> = { 2: 2, 3: 5, 4: 10, 5: 15 };
export const bonusLines = (inp: PointsInput): PointsLine[] => {
    const lines: PointsLine[] = [];
    (inp.employee.reviews || []).filter(r => r.type === 'PRAISE' && inMonth(String(r.date).slice(0, 10), inp.month))
        .forEach(r => lines.push({ date: String(r.date).slice(0, 10), text: `表扬：${r.content}`, points: 15 }));
    (inp.employee.skillRatingLog || []).forEach(l => {
        const from = Number(l.from) || 0, to = Number(l.to) || 0;
        if (!from || to <= from) return; // 第一次评、降级、清除都不加
        const d = inp.toDate(l.at);
        const k = monthsBetween(d.slice(0, 7), inp.month);
        if (k < 0 || k > 2) return;
        let pts = 0;
        for (let s = from + 1; s <= to; s++) pts += STAR_UP[s] || 0;
        if (pts) lines.push({ date: d, text: `技能升星 ★${from}→★${to}${k ? `（第 ${k + 1} 个月）` : ''}`, points: pts });
    });
    return lines;
};

export const computeMonthPoints = (inp: PointsInput): MonthPoints => {
    const hy = hygienePart(inp);
    const bonus = [...bonusLines(inp), ...hy.bonus].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const parts: PointsPart[] = [
        taskPart(inp), attendancePart(inp), hy.part, meetingPart(inp), disciplinePart(inp),
        { key: 'bonus', label: '加分（表扬、技能升星、卫生超标）', max: null, points: bonus.reduce((n, l) => n + l.points, 0), lines: bonus },
    ];
    const total = r1(parts.reduce((n, p) => n + p.points, 0));
    return { month: inp.month, total, grade: gradeOf(total), parts };
};
