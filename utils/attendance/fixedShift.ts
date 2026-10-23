// 固定员工自己的上下班时间（负责人 2026-10-23 批准，见 docs/hr/fixed-shift-design.md）。
// 有设定的人，迟到 / 早退按自己的时间算，不看 Group A / B、平日 / 周末、特别期间。
// 可以每天同一组时间，也可以按星期几各设一组（byDay 的 key：'0' = 星期日 … '6' = 星期六）。

export type ShiftTimes = { checkIn: string; checkOut: string };
export type FixedShift = ShiftTimes & { byDay?: Record<string, ShiftTimes> };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidTimes = (t?: Partial<ShiftTimes> | null): t is ShiftTimes => !!t && HHMM.test(t.checkIn || '') && HHMM.test(t.checkOut || '');

/** 这一天要用的固定时间；null = 没设定（照旧按考勤设定） */
export const fixedShiftTimes = (dateStr: string, fixed?: FixedShift | null): ShiftTimes | null => {
    if (!fixed) return null;
    const dow = String(new Date(`${dateStr}T00:00:00Z`).getUTCDay());
    const day = fixed.byDay?.[dow];
    if (isValidTimes(day)) return { checkIn: day.checkIn, checkOut: day.checkOut };
    return isValidTimes(fixed) ? { checkIn: fixed.checkIn, checkOut: fixed.checkOut } : null;
};

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
