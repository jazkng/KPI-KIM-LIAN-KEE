// ============================================================================
// 考勤导入审核：把原始打卡整理成「营业日班次」，并找出需要主管确认的异常
// ----------------------------------------------------------------------------
// 规则：
//   - 营业日：凌晨 cutoff（默认 06:00）以前的打卡算前一天的班（跨午夜下班）。
//   - 连续打卡：同一营业日内，相隔 duplicateWindowMinutes 以内的重复打卡只算一次。
//   - 一天多次打卡：按时间两两配对（上班、下班、上班、下班……），中间是休息。
//   - 班表：沿用 ERP「考勤设定」（getTargetShiftForDate），不用机器的班表。
//   - 异常（必须由主管逐项处理后才能导入）：
//       MISSING_PUNCH 漏打卡（打卡次数为单数）
//       LATE          迟到（超过宽限分钟）
//       EARLY_LEAVE   早退（超过宽限分钟）
//       OVERTIME      加班（下班比班表晚 otThresholdMinutes 以上，须批准才算）
//       LONG_SHIFT    班次过长（多半是漏打卡被配错）
//
// 纯函数：同样的输入 + 同样的主管决定 → 同样的结果，方便测试与重算。
// ============================================================================
import type { AttendanceRecord, Employee } from '../../types';
import type { AttendanceShiftSettings } from '../dataManager';
import { getTargetShiftForDate } from '../dataManager';
import type { Face3000Employee, Face3000Import } from './face3000';

export type ExceptionType = 'MISSING_PUNCH' | 'LATE' | 'EARLY_LEAVE' | 'OVERTIME' | 'LONG_SHIFT';

export type Resolution =
    | { action: 'ADD_TIME'; time: string; note?: string }
    | { action: 'MARK_ABSENT'; note?: string }
    | { action: 'CONFIRM'; note?: string }
    | { action: 'EXCUSE'; note: string }
    | { action: 'APPROVE'; note?: string }
    | { action: 'REJECT'; note?: string };

/** 每种异常可以选的处理方式 */
export const ALLOWED_ACTIONS: Record<ExceptionType, Resolution['action'][]> = {
    MISSING_PUNCH: ['ADD_TIME', 'MARK_ABSENT'],
    LATE: ['CONFIRM', 'EXCUSE'],
    EARLY_LEAVE: ['CONFIRM', 'EXCUSE'],
    OVERTIME: ['APPROVE', 'REJECT'],
    LONG_SHIFT: ['CONFIRM', 'MARK_ABSENT'],
};

export interface ReviewException {
    /** 稳定键：`<deviceNo>|<营业日>|<类型>`，主管的决定以此对应 */
    key: string;
    type: ExceptionType;
    deviceNo: string;
    businessDate: string;
    minutes?: number;
    message: string;
    resolution?: Resolution;
}

export interface WorkSegment {
    /** 相对营业日 00:00 的分钟数，跨午夜会大于 1440 */
    inMin: number;
    outMin: number;
}

export interface ReviewDay {
    businessDate: string;
    /** 显示用的打卡时间，跨午夜的加上「+1」 */
    punches: string[];
    segments: WorkSegment[];
    workedMinutes: number;
    scheduledIn: string;
    scheduledOut: string;
    lateMinutes: number;
    earlyMinutes: number;
    overtimeMinutes: number;
    /** 主管处理后：迟到获豁免 */
    lateExcused: boolean;
    earlyExcused: boolean;
    approvedOtMinutes: number;
    /** 主管判定当天不算出勤（例如漏打卡无法补） */
    markedAbsent: boolean;
    /** 打卡次数为单数且尚未补时间 */
    incomplete: boolean;
    exceptions: ReviewException[];
}

export interface ReviewEmployee {
    deviceNo: string;
    deviceName: string;
    department: string;
    employee: Employee | null;
    /** 名单中有这个编号，但人事档案已离职或封存 */
    inactive: boolean;
    days: ReviewDay[];
    /** 属于上一个区间的打卡（例如 1 号凌晨的下班卡），只显示不导入 */
    previousPeriodPunches: string[];
    totals: {
        daysWorked: number;
        workedMinutes: number;
        lateDays: number;
        lateMinutes: number;
        approvedOtMinutes: number;
        openExceptions: number;
    };
}

export interface ReviewOptions {
    shiftSettings: AttendanceShiftSettings;
    /** 营业日分界，默认 06:00 */
    businessDayCutoff?: string;
    duplicateWindowMinutes?: number;
    otThresholdMinutes?: number;
    longShiftMinutes?: number;
}

export interface ReviewResult {
    periodStart: string;
    periodEnd: string;
    employees: ReviewEmployee[];
    /** 档案里有、但对不上 ERP 员工编号的人 */
    unmatched: ReviewEmployee[];
    openExceptionCount: number;
    totalExceptionCount: number;
}

export const DEFAULT_REVIEW_OPTIONS = {
    businessDayCutoff: '06:00',
    duplicateWindowMinutes: 5,
    otThresholdMinutes: 30,
    longShiftMinutes: 14 * 60,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

export const formatMinutes = (min: number): string => {
    const dayOffset = Math.floor(min / 1440);
    const within = ((min % 1440) + 1440) % 1440;
    const label = `${pad2(Math.floor(within / 60))}:${pad2(within % 60)}`;
    return dayOffset > 0 ? `${label}+${dayOffset}` : label;
};

const addDays = (isoDate: string, days: number): string => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

/** 打卡 → 营业日与相对分钟（凌晨分界前算前一天，分钟 + 1440） */
export const toBusinessPunch = (date: string, time: string, cutoff: string): { businessDate: string; minute: number } => {
    const minute = toMinutes(time);
    return minute < toMinutes(cutoff)
        ? { businessDate: addDays(date, -1), minute: minute + 1440 }
        : { businessDate: date, minute };
};

/** 机器员工编号 → ERP 员工：优先比对 `attendanceDeviceNo`，再比对员工 ID */
export const matchEmployee = (deviceNo: string, employees: Employee[]): Employee | null => {
    const no = String(deviceNo).trim();
    if (!no) return null;
    return (
        employees.find(e => String(e.attendanceDeviceNo || '').trim() === no) ||
        employees.find(e => String(e.id).trim() === no) ||
        null
    );
};

const scheduleFor = (businessDate: string, settings: AttendanceShiftSettings, shiftGroup: number) => {
    const s = getTargetShiftForDate(businessDate, settings, shiftGroup);
    const inMin = toMinutes(s.checkInStr);
    let outMin = toMinutes(s.checkOutStr);
    // 与 getTargetShiftForDate 相同的跨午夜判断
    const inHour = Math.floor(inMin / 60);
    const outHour = Math.floor(outMin / 60);
    if (outHour < inHour || (outHour < 12 && inHour >= 12)) outMin += 1440;
    return { inMin, outMin, checkInStr: s.checkInStr, checkOutStr: s.checkOutStr };
};

const buildDay = (
    deviceNo: string,
    businessDate: string,
    rawMinutes: number[],
    isLastDay: boolean,
    shiftGroup: number,
    opts: Required<ReviewOptions>,
    resolutions: Record<string, Resolution>,
): ReviewDay => {
    const key = (type: ExceptionType) => `${deviceNo}|${businessDate}|${type}`;
    const settings = opts.shiftSettings;
    const grace = Number(settings.graceMinutes) || 0;

    // 主管补上的时间也算一次打卡
    const missing = resolutions[key('MISSING_PUNCH')];
    const minutes = [...rawMinutes];
    if (missing?.action === 'ADD_TIME' && /^\d{2}:\d{2}$/.test(missing.time)) {
        const added = toMinutes(missing.time);
        minutes.push(added < toMinutes(opts.businessDayCutoff) ? added + 1440 : added);
    }
    minutes.sort((a, b) => a - b);

    const kept: number[] = [];
    minutes.forEach(m => {
        if (kept.length === 0 || m - kept[kept.length - 1] > opts.duplicateWindowMinutes) kept.push(m);
    });

    const sched = scheduleFor(businessDate, settings, shiftGroup);
    const exceptions: ReviewException[] = [];
    const add = (type: ExceptionType, message: string, minutesValue?: number) =>
        exceptions.push({ key: key(type), type, deviceNo, businessDate, message, minutes: minutesValue, resolution: resolutions[key(type)] });

    const incomplete = kept.length % 2 === 1;
    const segments: WorkSegment[] = [];
    for (let i = 0; i + 1 < kept.length; i += 2) segments.push({ inMin: kept[i], outMin: kept[i + 1] });

    if (incomplete) {
        add(
            'MISSING_PUNCH',
            isLastDay
                ? `打卡 ${kept.length} 次（单数）。这是区间最后一天，下班卡可能在下个月的档案里；请补上时间或判定不算出勤`
                : `打卡 ${kept.length} 次（单数），缺上班或下班卡；请补上时间或判定不算出勤`,
        );
    }

    const markedAbsent =
        resolutions[key('MISSING_PUNCH')]?.action === 'MARK_ABSENT' ||
        resolutions[key('LONG_SHIFT')]?.action === 'MARK_ABSENT';

    let lateMinutes = 0;
    let earlyMinutes = 0;
    let overtimeMinutes = 0;
    if (!incomplete && segments.length > 0) {
        const firstIn = segments[0].inMin;
        const lastOut = segments[segments.length - 1].outMin;
        const late = firstIn - sched.inMin;
        if (settings.enableLateCheck !== false && late > grace) {
            lateMinutes = late;
            add('LATE', `上班 ${formatMinutes(firstIn)}，班表 ${sched.checkInStr}，迟到 ${late} 分钟`, late);
        }
        const early = sched.outMin - lastOut;
        if (settings.enableEarlyCheck !== false && early > grace) {
            earlyMinutes = early;
            add('EARLY_LEAVE', `下班 ${formatMinutes(lastOut)}，班表 ${sched.checkOutStr}，早退 ${early} 分钟`, early);
        }
        const ot = lastOut - sched.outMin;
        if (ot >= opts.otThresholdMinutes) {
            overtimeMinutes = ot;
            add('OVERTIME', `下班 ${formatMinutes(lastOut)}，比班表晚 ${ot} 分钟；批准后才计入加班`, ot);
        }
        if (lastOut - firstIn > opts.longShiftMinutes) {
            add('LONG_SHIFT', `从上班到下班 ${Math.round((lastOut - firstIn) / 6) / 10} 小时，可能漏打卡被配错`, lastOut - firstIn);
        }
    }

    const res = (t: ExceptionType) => resolutions[key(t)];
    const workedMinutes = markedAbsent || incomplete ? 0 : segments.reduce((sum, s) => sum + (s.outMin - s.inMin), 0);

    return {
        businessDate,
        punches: kept.map(formatMinutes),
        segments,
        workedMinutes,
        scheduledIn: sched.checkInStr,
        scheduledOut: sched.checkOutStr,
        lateMinutes,
        earlyMinutes,
        overtimeMinutes,
        lateExcused: res('LATE')?.action === 'EXCUSE',
        earlyExcused: res('EARLY_LEAVE')?.action === 'EXCUSE',
        approvedOtMinutes: !markedAbsent && res('OVERTIME')?.action === 'APPROVE' ? overtimeMinutes : 0,
        markedAbsent,
        incomplete: incomplete && !markedAbsent,
        exceptions,
    };
};

const isResolved = (ex: ReviewException): boolean => {
    const r = ex.resolution;
    if (!r || !ALLOWED_ACTIONS[ex.type].includes(r.action)) return false;
    if (r.action === 'EXCUSE') return !!r.note?.trim();
    // 补时间后若仍是单数，异常会以同一个键再出现一次，需要再处理
    return true;
};

/**
 * 根据档案、ERP 员工名单、考勤设定与主管的决定，算出审核结果。
 * @param manualMatches 机器编号 → ERP 员工 ID（主管手动对应；空字串代表略过此人）
 */
export const buildReview = (
    data: Face3000Import,
    employees: Employee[],
    options: ReviewOptions,
    resolutions: Record<string, Resolution> = {},
    manualMatches: Record<string, string> = {},
): ReviewResult => {
    const opts: Required<ReviewOptions> = { ...DEFAULT_REVIEW_OPTIONS, ...options } as Required<ReviewOptions>;
    const reviewed: ReviewEmployee[] = data.employees.map((src: Face3000Employee) => {
        const manual = manualMatches[src.deviceNo];
        const employee = manual !== undefined ? employees.find(e => e.id === manual) || null : matchEmployee(src.deviceNo, employees);
        const shiftGroup = employee?.shiftGroup || 1;

        const byDay = new Map<string, number[]>();
        const previousPeriodPunches: string[] = [];
        src.punches.forEach(p => {
            const { businessDate, minute } = toBusinessPunch(p.date, p.time, opts.businessDayCutoff);
            if (businessDate < data.periodStart) {
                previousPeriodPunches.push(`${p.date} ${p.time}`);
                return;
            }
            const list = byDay.get(businessDate) || [];
            list.push(minute);
            byDay.set(businessDate, list);
        });

        const days = [...byDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, mins]) => buildDay(src.deviceNo, date, mins, date === data.periodEnd, shiftGroup, opts, resolutions));

        const counted = days.filter(d => !d.markedAbsent && !d.incomplete && d.workedMinutes > 0);
        const lateDays = counted.filter(d => d.lateMinutes > 0 && !d.lateExcused);
        return {
            deviceNo: src.deviceNo,
            deviceName: src.name,
            department: src.department,
            employee,
            inactive: !!employee && (employee.status === 'TERMINATED' || !!employee.isArchived),
            days,
            previousPeriodPunches,
            totals: {
                daysWorked: counted.length,
                workedMinutes: counted.reduce((s, d) => s + d.workedMinutes, 0),
                lateDays: lateDays.length,
                lateMinutes: lateDays.reduce((s, d) => s + d.lateMinutes, 0),
                approvedOtMinutes: counted.reduce((s, d) => s + d.approvedOtMinutes, 0),
                openExceptions: days.flatMap(d => d.exceptions).filter(ex => !isResolved(ex)).length,
            },
        };
    });

    const matched = reviewed.filter(r => r.employee);
    const unmatched = reviewed.filter(r => !r.employee);
    const allExceptions = matched.flatMap(r => r.days.flatMap(d => d.exceptions));
    return {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        employees: matched,
        unmatched,
        openExceptionCount: allExceptions.filter(ex => !isResolved(ex)).length,
        totalExceptionCount: allExceptions.length,
    };
};

/** 以 +08:00（马来西亚时间）组出 ISO 时间，不受浏览器时区影响 */
export const businessMinuteToIso = (businessDate: string, minute: number): string => {
    const date = addDays(businessDate, Math.floor(minute / 1440));
    const within = minute % 1440;
    return new Date(`${date}T${pad2(Math.floor(within / 60))}:${pad2(within % 60)}:00+08:00`).toISOString();
};

/**
 * 审核完成后要写入的考勤记录（沿用现有 attendance 格式与 ID，V1 读得懂）。
 * 只在所有异常处理完毕后才可呼叫；不算出勤的日子不写入。
 */
export const buildAttendanceRecords = (
    review: ReviewResult,
    meta: { batchId: string; reviewedBy: string; reviewedAt: string },
): AttendanceRecord[] => {
    if (review.openExceptionCount > 0) throw new Error(`还有 ${review.openExceptionCount} 项异常未处理，不能导入`);
    const records: AttendanceRecord[] = [];
    review.employees.forEach(r => {
        const emp = r.employee!;
        r.days.forEach(day => {
            if (day.markedAbsent || day.incomplete || day.segments.length === 0) return;
            const first = day.segments[0].inMin;
            const last = day.segments[day.segments.length - 1].outMin;
            const late = day.lateMinutes > 0 && !day.lateExcused;
            const early = day.earlyMinutes > 0 && !day.earlyExcused;
            const notes = day.exceptions
                .map(ex => `${ex.type}:${ex.resolution?.action}${ex.resolution?.note ? `(${ex.resolution.note})` : ''}`)
                .join('; ');
            records.push({
                id: `attendance_${emp.id}_${day.businessDate}_face`,
                employeeId: emp.id,
                employeeName: emp.name,
                date: day.businessDate,
                clockIn: businessMinuteToIso(day.businessDate, first),
                clockOut: businessMinuteToIso(day.businessDate, last),
                durationMinutes: day.workedMinutes,
                status: late && early ? 'LATE_AND_EARLY' : late ? 'COMPLETED_LATE' : early ? 'EARLY_OUT' : 'COMPLETED',
                source: 'face_machine',
                notes: `FACE3000 审核导入 (机器编号 ${r.deviceNo})${notes ? ` | ${notes}` : ''}`,
                allTimes: day.punches,
                lateExcused: day.lateMinutes > 0 && day.lateExcused ? true : undefined,
                approvedOtMinutes: day.approvedOtMinutes || undefined,
                importBatchId: meta.batchId,
                reviewedBy: meta.reviewedBy,
                reviewedAt: meta.reviewedAt,
            });
        });
    });
    // Firestore 不接受 undefined 栏位
    return records.map(rec => JSON.parse(JSON.stringify(rec)) as AttendanceRecord);
};
