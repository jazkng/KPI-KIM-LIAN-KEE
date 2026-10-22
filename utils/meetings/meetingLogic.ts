// ============================================================================
// 会议签到（设计：docs/hr/meeting-checkin-design.md，负责人 2026-10-22 批准）
// 纯函数：权限、找「现在正在开」的会议、签到颜色、QR 链接。
// ============================================================================
import type { Employee } from '../../types';
import { getOrgLevel } from '../orgAccess';

export type MeetingType = 'MANAGEMENT' | 'STORE';
export type MeetingStatus = 'OPEN' | 'ENDED' | 'CANCELLED';

export interface Meeting {
    id: string;
    type: MeetingType;
    /** YYYY-MM-DD（马来西亚日期） */
    date: string;
    /** HH:MM */
    start: string;
    end: string;
    /** 要出席的员工号 */
    attendeeIds: string[];
    status: MeetingStatus;
    note?: string;
    createdBy: string;
    createdByName: string;
    createdAt: string;
}

export interface MeetingCheckin {
    id: string;
    meetingId: string;
    employeeId: string;
    employeeName: string;
    /** 服务器时间（ISO） */
    checkedInAt: string;
    via: 'CAMERA' | 'APP_SCAN';
}

export const MEETING_LABEL: Record<MeetingType, string> = { MANAGEMENT: '管理层会议', STORE: '店面会议' };

/** 开始前多久可以扫码 */
export const EARLY_MINUTES = 15;
/** 开始后多少分钟内算黄色 */
export const GRACE_MINUTES = 10;

/** 管理层会议只有 L1；店面会议 L1–L3（L2S 幕僚也算 L2） */
export const canStartMeeting = (emp: Pick<Employee, 'orgLevel' | 'rank' | 'role'>, type: MeetingType): boolean => {
    const lv = getOrgLevel(emp);
    if (type === 'MANAGEMENT') return lv === 'OWNER';
    return lv === 'OWNER' || lv === 'BRANCH_MANAGER' || lv === 'STAFF_SUPPORT' || lv === 'DEPARTMENT_HEAD';
};
export const startableTypes = (emp: Pick<Employee, 'orgLevel' | 'rank' | 'role'>): MeetingType[] =>
    (['MANAGEMENT', 'STORE'] as MeetingType[]).filter(t => canStartMeeting(emp, t));

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** 现在（马来西亚日期 + HH:MM）正在开的这种会议；开始前 15 分钟起到结束为止 */
export const findActiveMeeting = (meetings: Meeting[], type: MeetingType, date: string, time: string): Meeting | null => {
    const now = toMin(time);
    return meetings
        .filter(m => m.type === type && m.date === date && m.status === 'OPEN' && now >= toMin(m.start) - EARLY_MINUTES && now <= toMin(m.end))
        .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
};

export type CheckinColor = 'GREEN' | 'YELLOW' | 'ORANGE' | 'GRAY';
/** 只用颜色区分：准时 / 10 分钟内 / 更晚 / 没签（不标「迟到」） */
export const checkinColor = (start: string, checkinHHMM?: string | null): CheckinColor => {
    if (!checkinHHMM) return 'GRAY';
    const d = toMin(checkinHHMM) - toMin(start);
    if (d <= 0) return 'GREEN';
    if (d <= GRACE_MINUTES) return 'YELLOW';
    return 'ORANGE';
};
export const COLOR_CLASS: Record<CheckinColor, string> = {
    GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    YELLOW: 'bg-amber-50 text-amber-700 border-amber-200',
    ORANGE: 'bg-orange-100 text-orange-700 border-orange-300',
    GRAY: 'bg-stone-50 text-stone-400 border-stone-200',
};

/** 马来西亚时间 HH:MM */
export const myTime = (d: Date = new Date()) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** 墙上那张 QR 的链接：每种会议一条，固定不变 */
export const meetingQrUrl = (type: MeetingType, origin: string) => `${origin.replace(/\/$/, '')}/?checkin=${type === 'MANAGEMENT' ? 'mgmt' : 'store'}`;

/** 从链接（或扫到的文字）读出会议类型；不是签到码就回 null */
export const parseCheckinCode = (text: string): MeetingType | null => {
    const m = /[?&]checkin=(mgmt|store)\b/.exec(text || '');
    return m ? (m[1] === 'mgmt' ? 'MANAGEMENT' : 'STORE') : null;
};

export const checkinDocId = (meetingId: string, employeeId: string) => `${meetingId}_${employeeId}`;

export type CheckinProblem = 'NO_MEETING' | 'NOT_INVITED' | null;
export const checkinProblem = (meeting: Meeting | null, employeeId: string): CheckinProblem =>
    !meeting ? 'NO_MEETING' : meeting.attendeeIds.includes(employeeId) ? null : 'NOT_INVITED';

/** 建立会议前检查（回传中文错误或 null） */
export const validateMeeting = (m: Pick<Meeting, 'date' | 'start' | 'end' | 'attendeeIds'>): string | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return '请选日期';
    if (!/^\d{2}:\d{2}$/.test(m.start) || !/^\d{2}:\d{2}$/.test(m.end)) return '请填开始和结束时间';
    if (toMin(m.end) <= toMin(m.start)) return '结束时间要比开始时间晚';
    if (!m.attendeeIds.length) return '请至少选一位出席人员';
    return null;
};

/** 预设出席名单：管理层会议 = L2–L3；店面会议 = 全部在职员工（不计入员工除外） */
export const defaultAttendees = (employees: Employee[], type: MeetingType): string[] =>
    employees
        .filter(e => !e.isArchived && e.status !== 'TERMINATED' && !e.excludeFromStaff)
        .filter(e => {
            if (type === 'STORE') return true;
            const lv = getOrgLevel(e);
            return lv === 'BRANCH_MANAGER' || lv === 'STAFF_SUPPORT' || lv === 'DEPARTMENT_HEAD';
        })
        .map(e => e.id);
