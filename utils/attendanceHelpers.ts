import { AttendanceRecord } from "../types";

/**
 * 合并考勤记录：同一个人在同一天既有手机打卡又有打卡机导入时，优先采用打卡机记录。
 * Merge attendance records; face-machine punches win over app punches for the same person + day.
 */
export const mergeAttendanceRecords = <T extends Pick<AttendanceRecord, "employeeId" | "date" | "source">>(
    raw: T[] | null | undefined,
): T[] => {
    if (!raw) return [];
    const mergedMap = new Map<string, T>();
    raw.forEach((rec) => {
        const key = `${rec.employeeId}_${rec.date}`;
        const existing = mergedMap.get(key);
        if (!existing) {
            mergedMap.set(key, rec);
        } else if (rec.source === "face_machine" && existing.source !== "face_machine") {
            mergedMap.set(key, rec);
        }
    });
    return Array.from(mergedMap.values());
};

export interface PunchSlots {
    amIn: string;
    amOut: string;
    pmIn: string;
    pmOut: string;
    otIn: string;
    otOut: string;
}

const toMins = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
};

/**
 * 把一天里的多次打卡时间分配到「早上上/下班、下午上/下班、加班上/下班」六个格子。
 * Distribute a day's punch times into the six on/off slots shown in the attendance sheet.
 */
export const distributeTimes = (times: string[]): PunchSlots => {
    const res: PunchSlots = { amIn: "—", amOut: "—", pmIn: "—", pmOut: "—", otIn: "—", otOut: "—" };
    if (!times || times.length === 0) return res;

    if (times.length === 4) {
        res.amIn = times[0];
        res.amOut = times[1];
        res.pmIn = times[2];
        res.pmOut = times[3];
    } else if (times.length === 2) {
        const m0 = toMins(times[0]);
        const m1 = toMins(times[1]);
        if (m0 < 720) {
            // 12:00 之前算早班上班
            res.amIn = times[0];
            if (m1 < 900) {
                // 15:00 之前算早班下班
                res.amOut = times[1];
            } else {
                res.pmOut = times[1];
            }
        } else {
            res.pmIn = times[0];
            res.pmOut = times[1];
        }
    } else if (times.length === 1) {
        if (toMins(times[0]) < 720) {
            res.amIn = times[0];
        } else {
            res.pmIn = times[0];
        }
    } else {
        const slots: (keyof PunchSlots)[] = ["amIn", "amOut", "pmIn", "pmOut", "otIn", "otOut"];
        times.forEach((t, i) => {
            if (i < slots.length) res[slots[i]] = t;
        });
    }
    return res;
};
