// ============================================================================
// FACE3000-U 考勤机 USB 汇出档（旧版 .xls）解析
// ----------------------------------------------------------------------------
// 档案内容：
//   - Summary：每位员工一行（编号、姓名、部门、机器算的迟到早退……）
//   - Logs   ：原始打卡记录。每位员工两行：
//                「No : 9001 … Name : Alpha … Dept : BOH」
//                下一行每格是当天所有打卡时间，例如 "01:48\n14:39\n"
//   - 其余工作表：机器按自己的班表配对后的明细（三人并排）
//
// 只采用 Logs 的原始时间：机器的班表设定与店里实际不同（机器会把每天都算成迟到），
// 配对、营业日归属、迟到早退一律由 ERP 按自己的设定重新计算（见 shiftReview.ts）。
//
// 本档是纯函数：输入工作表的二维阵列，不读档、不碰 Firestore，方便测试。
// ============================================================================

export interface Face3000Punch {
    /** 打卡的日历日期 YYYY-MM-DD（不是营业日） */
    date: string;
    /** HH:MM（24 小时制） */
    time: string;
}

export interface Face3000Employee {
    /** 机器上的员工编号 */
    deviceNo: string;
    name: string;
    department: string;
    punches: Face3000Punch[];
}

export interface Face3000Import {
    /** 汇出区间第一天 YYYY-MM-DD */
    periodStart: string;
    /** 汇出区间最后一天 YYYY-MM-DD */
    periodEnd: string;
    employees: Face3000Employee[];
    warnings: string[];
}

export type SheetRows = unknown[][];

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

const pad2 = (n: number) => String(n).padStart(2, '0');

const toIsoDate = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

const addDays = (isoDate: string, days: number): string => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/** 「2026/09/01 ~ 09/30」或「2026/09/26 ~ 2026/10/25」 */
export const parsePeriod = (value: string): { start: string; end: string } | null => {
    const m = value.match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\s*~\s*(?:(20\d{2})[\/-])?(\d{1,2})[\/-](\d{1,2})/);
    if (!m) return null;
    const startY = Number(m[1]);
    const startM = Number(m[2]);
    const endM = Number(m[5]);
    const endY = m[4] ? Number(m[4]) : endM < startM ? startY + 1 : startY;
    return { start: toIsoDate(startY, startM, Number(m[3])), end: toIsoDate(endY, endM, Number(m[6])) };
};

/** 一格里的打卡时间：只接受 HH:MM，其余忽略 */
export const parsePunchCell = (value: unknown): string[] => {
    const out: string[] = [];
    for (const token of text(value).split(/[\s,;]+/)) {
        const m = token.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
        if (m) out.push(`${pad2(Number(m[1]))}:${m[2]}`);
    }
    return out;
};

const findLabelValue = (row: unknown[], label: RegExp): string => {
    for (let i = 0; i < row.length; i++) {
        if (label.test(text(row[i]))) {
            for (let j = i + 1; j < row.length; j++) {
                const v = text(row[j]);
                if (v) return v;
            }
        }
    }
    return '';
};

const NO_LABEL = /^no\.?\s*:?$/i;
const NAME_LABEL = /^name\s*:?$/i;
const DEPT_LABEL = /^dept\.?\s*:?$/i;

const findPeriod = (rows: SheetRows): { start: string; end: string } | null => {
    for (const row of rows.slice(0, 10)) {
        for (const cell of row || []) {
            const p = parsePeriod(text(cell));
            if (p) return p;
        }
    }
    return null;
};

/** Summary 工作表：编号、姓名、部门（用来确认名单完整，含整月没打卡的人） */
const parseSummary = (rows: SheetRows): Map<string, { name: string; department: string }> => {
    const map = new Map<string, { name: string; department: string }>();
    for (const row of rows) {
        const no = text(row?.[0]).replace(/\.0$/, '');
        if (/^\d+$/.test(no)) map.set(no, { name: text(row[1]), department: text(row[2]) });
    }
    return map;
};

const findSheet = (sheets: Record<string, SheetRows>, pattern: RegExp): SheetRows | undefined => {
    const name = Object.keys(sheets).find(n => pattern.test(n.trim()));
    return name ? sheets[name] : undefined;
};

/**
 * 解析整份 FACE3000-U 汇出档。
 * @param sheets 工作表名称 → 二维阵列（SheetJS `sheet_to_json(ws, { header: 1, raw: false, defval: '' })`）
 */
export const parseFace3000Workbook = (sheets: Record<string, SheetRows>): Face3000Import => {
    const logs = findSheet(sheets, /^logs?$/i);
    if (!logs) throw new Error('找不到「Logs」工作表：请上传 FACE3000-U 汇出的原始考勤档（含 Summary、Logs）。');

    const summaryRows = findSheet(sheets, /^summary$/i);
    const period = findPeriod(logs) || (summaryRows ? findPeriod(summaryRows) : null);
    if (!period) throw new Error('无法从档案中读取考勤区间（例如 2026/09/01 ~ 09/30）。');

    const warnings: string[] = [];
    const employees = new Map<string, Face3000Employee>();

    for (let i = 0; i < logs.length; i++) {
        const row = logs[i] || [];
        if (!row.some(c => NO_LABEL.test(text(c)))) continue;

        const deviceNo = findLabelValue(row, NO_LABEL).replace(/\.0$/, '');
        if (!deviceNo) continue;
        const name = findLabelValue(row, NAME_LABEL);
        const department = findLabelValue(row, DEPT_LABEL);

        // 日期表头在员工列的上一行；打卡时间在下一行，同一栏对应同一天
        const header = logs[i - 1] || [];
        const punchesRow = logs[i + 1] || [];
        const columnDates = new Map<number, string>();
        let offset = 0;
        header.forEach((cell, col) => {
            const day = Number(text(cell));
            if (!Number.isInteger(day) || day < 1 || day > 31) return;
            const date = addDays(period.start, offset++);
            if (Number(date.slice(8, 10)) !== day) {
                warnings.push(`员工 ${deviceNo}：第 ${col + 1} 栏日期 ${day} 与区间不符，已略过`);
                return;
            }
            columnDates.set(col, date);
        });
        if (columnDates.size === 0) {
            warnings.push(`员工 ${deviceNo}：找不到日期表头，已略过`);
            continue;
        }

        const punches: Face3000Punch[] = [];
        columnDates.forEach((date, col) => {
            parsePunchCell(punchesRow[col]).forEach(time => punches.push({ date, time }));
        });

        const existing = employees.get(deviceNo);
        if (existing) {
            existing.punches.push(...punches);
            warnings.push(`员工编号 ${deviceNo} 在 Logs 出现多次，已合并`);
        } else {
            employees.set(deviceNo, { deviceNo, name, department, punches });
        }
    }

    // Summary 有、Logs 没有的人（整月没打卡）也列出来，避免名单漏人
    if (summaryRows) {
        parseSummary(summaryRows).forEach((info, deviceNo) => {
            if (!employees.has(deviceNo)) employees.set(deviceNo, { deviceNo, ...info, punches: [] });
        });
    }

    if (employees.size === 0) throw new Error('Logs 工作表中没有任何员工打卡记录。');

    const sorted = [...employees.values()].sort((a, b) => a.deviceNo.localeCompare(b.deviceNo, 'en', { numeric: true }));
    sorted.forEach(e => e.punches.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
    return { periodStart: period.start, periodEnd: period.end, employees: sorted, warnings };
};

/**
 * 旧的 PDF 报表解析结果（每位员工、每一天一列，机器已按班次排好）→ 原始打卡。
 * 同一列里时间变小代表过了午夜（例如 14:39 → 01:00），这些打卡算下一个日历日，
 * 之后由 shiftReview 依营业日分界归回当天的班。
 * PDF 也必须经过同样的审核，不能直接写入。
 */
export const fromDailyRows = (
    month: string,
    people: { deviceNo: string; name: string; rows: { day: number; times: string[] }[] }[],
): Face3000Import => {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const employees: Face3000Employee[] = people.map(p => {
        const punches: Face3000Punch[] = [];
        p.rows.forEach(row => {
            if (row.day < 1 || row.day > lastDay) return;
            const base = toIsoDate(y, m, row.day);
            let offset = 0;
            let prev = -1;
            row.times.flatMap(t => parsePunchCell(t)).forEach(time => {
                const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
                if (prev >= 0 && minute < prev) offset = 1;
                prev = minute;
                punches.push({ date: addDays(base, offset), time });
            });
        });
        punches.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        return { deviceNo: p.deviceNo, name: p.name, department: '', punches };
    });
    return { periodStart: toIsoDate(y, m, 1), periodEnd: toIsoDate(y, m, lastDay), employees, warnings: [] };
};

/** 区间是否刚好是一个日历月（1 号到月底） */
export const isCalendarMonth = (start: string, end: string): boolean => {
    if (start.slice(0, 7) !== end.slice(0, 7) || !start.endsWith('-01')) return false;
    const [y, m] = start.split('-').map(Number);
    return Number(end.slice(8, 10)) === new Date(y, m, 0).getDate();
};
