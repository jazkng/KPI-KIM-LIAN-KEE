// ============================================================================
// 老板经营驾驶舱 · 期间选择（今天 / 昨天 / 本周 / 本月 / 上个月 / 自订）
// ----------------------------------------------------------------------------
// 一律以「营业日」计算（马来西亚时间，凌晨 4 点前算前一天，与日结相同）。
// 纯函数，方便测试。
// ============================================================================
import { getBusinessDateString } from '../dateHelper';

export type PeriodPreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
    TODAY: '今天',
    YESTERDAY: '昨天',
    THIS_WEEK: '本周',
    THIS_MONTH: '本月',
    LAST_MONTH: '上个月',
    CUSTOM: '自订',
};

export interface Period {
    preset: PeriodPreset;
    /** YYYY-MM-DD（含） */
    start: string;
    /** YYYY-MM-DD（含） */
    end: string;
    label: string;
    /** 期间天数 */
    days: number;
    /** 期间内已经过去的营业日（含今天）；未来的日子不算 */
    elapsedDays: number;
    /** 期间涵盖的月份 YYYY-MM */
    months: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s: string, n: number) => {
    const d = toDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return fmt(d);
};
/** 两个日期之间的天数（含头含尾） */
export const daysInclusive = (start: string, end: string) =>
    Math.max(0, Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86400000) + 1);
export const daysInMonth = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const monthsBetween = (start: string, end: string): string[] => {
    const out: string[] = [];
    let [y, m] = start.slice(0, 7).split('-').map(Number);
    const [ey, em] = end.slice(0, 7).split('-').map(Number);
    while ((y < ey || (y === ey && m <= em)) && out.length < 24) {
        out.push(`${y}-${pad(m)}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
};

/**
 * @param today 今天的营业日 YYYY-MM-DD（预设取系统时间）
 * @param custom 自订期间
 */
export const resolvePeriod = (
    preset: PeriodPreset,
    today: string = getBusinessDateString(),
    custom?: { start: string; end: string },
): Period => {
    let start = today;
    let end = today;
    if (preset === 'YESTERDAY') {
        start = end = addDays(today, -1);
    } else if (preset === 'THIS_WEEK') {
        // 周一开始
        const dow = toDate(today).getUTCDay(); // 0 = 周日
        start = addDays(today, -((dow + 6) % 7));
    } else if (preset === 'THIS_MONTH') {
        start = `${today.slice(0, 7)}-01`;
    } else if (preset === 'LAST_MONTH') {
        const firstOfThis = `${today.slice(0, 7)}-01`;
        end = addDays(firstOfThis, -1);
        start = `${end.slice(0, 7)}-01`;
    } else if (preset === 'CUSTOM' && custom?.start && custom?.end) {
        [start, end] = custom.start <= custom.end ? [custom.start, custom.end] : [custom.end, custom.start];
    }
    const days = daysInclusive(start, end);
    const elapsedEnd = end < today ? end : today;
    const elapsedDays = start > today ? 0 : daysInclusive(start, elapsedEnd);
    const label = start === end ? start : `${start} ~ ${end}`;
    return { preset, start, end, label: `${PERIOD_LABEL[preset]} · ${label}`, days, elapsedDays, months: monthsBetween(start, end) };
};

/** 这个期间与某月重叠的天数 */
export const overlapDaysWithMonth = (period: Pick<Period, 'start' | 'end'>, month: string): number => {
    const mStart = `${month}-01`;
    const mEnd = `${month}-${pad(daysInMonth(month))}`;
    const s = period.start > mStart ? period.start : mStart;
    const e = period.end < mEnd ? period.end : mEnd;
    return s > e ? 0 : daysInclusive(s, e);
};
