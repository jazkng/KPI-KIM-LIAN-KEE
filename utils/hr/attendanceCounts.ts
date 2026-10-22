import type { AttendanceRecord } from '../../types';

const LATE = new Set(['LATE', 'COMPLETED_LATE', 'LATE_AND_EARLY']);
const EARLY = new Set(['EARLY_OUT', 'LATE_AND_EARLY']);

export interface LateEarlyCounts {
    late: number;
    early: number;
    /** 最近一次迟到 / 早退的日期（没有 = 空字串） */
    lastLate: string;
    lastEarly: string;
}

/** 员工档案「记录」：累计迟到次数、早退次数。主管已豁免的迟到不算。 */
export const countLateEarly = (records: AttendanceRecord[]): LateEarlyCounts => {
    const out: LateEarlyCounts = { late: 0, early: 0, lastLate: '', lastEarly: '' };
    records.forEach(r => {
        if (LATE.has(r.status) && !r.lateExcused) {
            out.late++;
            if (r.date > out.lastLate) out.lastLate = r.date;
        }
        if (EARLY.has(r.status)) {
            out.early++;
            if (r.date > out.lastEarly) out.lastEarly = r.date;
        }
    });
    return out;
};
