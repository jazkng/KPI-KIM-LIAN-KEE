// FACE3000-U 考勤导入测试
// ⚠️ 全部使用虚构的员工与打卡资料，绝不放入真实员工考勤（个资）。
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { Employee } from '../../types';
import { DEFAULT_ATTENDANCE_SETTINGS } from '../../utils/dataManager';
import { fromDailyRows, isCalendarMonth, parseFace3000Workbook, parsePeriod, parsePunchCell, type SheetRows } from '../../utils/attendance/face3000';
import {
    buildAttendanceRecords,
    buildReview,
    businessMinuteToIso,
    matchEmployee,
    toBusinessPunch,
    type Resolution,
} from '../../utils/attendance/shiftReview';

/** 依 FACE3000-U 的 Logs 版面产生虚构工作表：日期表头、员工列、打卡列 */
const makeLogs = (period: string, days: number, people: { no: string; name: string; dept: string; cells: Record<number, string> }[]): SheetRows => {
    const rows: SheetRows = [['List of Logs'], [], ['Period : ', '', period]];
    people.forEach(p => {
        const [y, m, d] = period.slice(0, 10).split('/').map(Number);
        rows.push(Array.from({ length: days }, (_, i) => String(new Date(Date.UTC(y, m - 1, d + i)).getUTCDate())));
        const label = Array(30).fill('');
        label[0] = 'No :'; label[2] = p.no; label[8] = 'Name :'; label[10] = p.name; label[18] = 'Dept :'; label[20] = p.dept;
        rows.push(label);
        rows.push(Array.from({ length: days }, (_, i) => p.cells[i + 1] || ''));
    });
    return rows;
};

const SETTINGS = {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    weekdayCheckIn: '15:00', weekdayCheckOut: '01:00',
    weekendCheckIn: '15:00', weekendCheckOut: '01:00',
    graceMinutes: 10,
};

const emp = (id: string, extra: Partial<Employee> = {}): Employee =>
    ({ id, name: `员工${id}`, role: 'CREW', status: 'CONFIRMED', level: '', basicSalary: 2000, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Male', nationality: 'Malaysian', ...extra }) as Employee;

const PERIOD = '2026/09/01 ~ 09/30';

describe('parseFace3000Workbook（解析）', () => {
    it('读取区间、员工与每格多次打卡；时间对应正确日期', () => {
        const data = parseFace3000Workbook({
            Logs: makeLogs(PERIOD, 30, [{ no: '9001', name: 'Alpha', dept: 'BOH', cells: { 1: '01:48\n15:02\n', 2: '01:05\n' } }]),
        });
        expect(data.periodStart).toBe('2026-09-01');
        expect(data.periodEnd).toBe('2026-09-30');
        expect(data.employees[0]).toMatchObject({ deviceNo: '9001', name: 'Alpha', department: 'BOH' });
        expect(data.employees[0].punches).toEqual([
            { date: '2026-09-01', time: '01:48' },
            { date: '2026-09-01', time: '15:02' },
            { date: '2026-09-02', time: '01:05' },
        ]);
    });

    it('Summary 有、Logs 没打卡的人也列出，避免名单漏人', () => {
        const data = parseFace3000Workbook({
            Summary: [['Summary of Attendance'], ['Date: ', PERIOD], ['No', 'Name'], [], ['9002', 'Bravo', 'Captain']],
            Logs: makeLogs(PERIOD, 30, [{ no: '9001', name: 'Alpha', dept: 'BOH', cells: {} }]),
        });
        expect(data.employees.map(e => e.deviceNo)).toEqual(['9001', '9002']);
        expect(data.employees[1].punches).toEqual([]);
    });

    it('跨月区间（26 号到下月 25 号）日期依序对应', () => {
        expect(parsePeriod('2026/09/26 ~ 10/25')).toEqual({ start: '2026-09-26', end: '2026-10-25' });
        expect(parsePeriod('2026/12/26 ~ 01/25')).toEqual({ start: '2026-12-26', end: '2027-01-25' });
        const data = parseFace3000Workbook({
            Logs: makeLogs('2026/09/26 ~ 10/25', 30, [{ no: '9001', name: 'A', dept: 'X', cells: { 6: '15:00' } }]),
        });
        expect(data.employees[0].punches[0].date).toBe('2026-10-01');
    });

    it('没有 Logs 工作表时给出清楚的错误', () => {
        expect(() => parseFace3000Workbook({ Summary: [] })).toThrow(/Logs/);
    });

    it('格子里只接受 HH:MM', () => {
        expect(parsePunchCell('9:05\n14:30:12\nAbsence\n25:00')).toEqual(['09:05', '14:30']);
    });

    it('旧版 .xls（BIFF8）可以直接读取', () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(makeLogs(PERIOD, 30, [{ no: '9001', name: 'A', dept: 'X', cells: { 3: '15:01\n' } }]) as unknown[][]), 'Logs');
        const buf = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' });
        const back = XLSX.read(buf, { type: 'buffer' });
        const sheets: Record<string, SheetRows> = {};
        back.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(back.Sheets[n], { header: 1, raw: false, defval: '' }); });
        expect(parseFace3000Workbook(sheets).employees[0].punches).toEqual([{ date: '2026-09-03', time: '15:01' }]);
    });
});

describe('buildReview（营业日、配对、异常）', () => {
    const load = (cells: Record<number, string>, no = '9001') =>
        parseFace3000Workbook({ Logs: makeLogs(PERIOD, 30, [{ no, name: 'A', dept: 'BOH', cells }]) });

    it('跨午夜：凌晨下班卡归前一个营业日；1 号凌晨的卡属于上个区间', () => {
        expect(toBusinessPunch('2026-09-02', '01:00', '06:00')).toEqual({ businessDate: '2026-09-01', minute: 1500 });
        const r = buildReview(load({ 1: '01:48\n15:05\n', 2: '00:58\n' }), [emp('9001')], { shiftSettings: SETTINGS });
        const e = r.employees[0];
        expect(e.previousPeriodPunches).toEqual(['2026-09-01 01:48']);
        expect(e.days).toHaveLength(1);
        expect(e.days[0]).toMatchObject({ businessDate: '2026-09-01', punches: ['15:05', '00:58+1'], workedMinutes: 593 });
        expect(e.days[0].exceptions).toEqual([]);
    });

    it('一天多次打卡：两两配对，中间休息不算工时；连按两次只算一次', () => {
        const r = buildReview(load({ 5: '15:00\n15:02\n18:00\n19:00\n', 6: '01:00\n' }), [emp('9001')], { shiftSettings: SETTINGS });
        const day = r.employees[0].days[0];
        expect(day.punches).toEqual(['15:00', '18:00', '19:00', '01:00+1']);
        expect(day.segments).toHaveLength(2);
        expect(day.workedMinutes).toBe(180 + 360);
    });

    it('漏打卡必须处理：补时间后重新计算；判定不算出勤则不写入', () => {
        const data = load({ 7: '15:00\n' });
        const r1 = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS });
        expect(r1.openExceptionCount).toBe(1);
        expect(r1.employees[0].days[0].exceptions[0].type).toBe('MISSING_PUNCH');
        expect(() => buildAttendanceRecords(r1, { batchId: 'b', reviewedBy: 'S', reviewedAt: 'now' })).toThrow(/未处理/);

        const key = '9001|2026-09-07|MISSING_PUNCH';
        const r2 = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS }, { [key]: { action: 'ADD_TIME', time: '01:00' } });
        expect(r2.openExceptionCount).toBe(0);
        expect(r2.employees[0].days[0].workedMinutes).toBe(600);

        const r3 = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS }, { [key]: { action: 'MARK_ABSENT' } });
        expect(buildAttendanceRecords(r3, { batchId: 'b', reviewedBy: 'S', reviewedAt: 'now' })).toEqual([]);
    });

    it('区间最后一天只有上班卡：提示下班卡可能在下个月档案', () => {
        const r = buildReview(load({ 30: '15:00\n' }), [emp('9001')], { shiftSettings: SETTINGS });
        expect(r.employees[0].days[0].exceptions[0].message).toMatch(/下个月/);
    });

    it('迟到超过宽限才算；豁免必须填原因，豁免后记录带 lateExcused、薪资不扣', () => {
        const data = load({ 8: '15:25\n', 9: '01:00\n' });
        const r1 = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS });
        const late = r1.employees[0].days[0].exceptions.find(x => x.type === 'LATE')!;
        expect(late.minutes).toBe(25);

        const noNote = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS }, { [late.key]: { action: 'EXCUSE', note: ' ' } as Resolution });
        expect(noNote.openExceptionCount).toBe(1);

        const ok = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS }, { [late.key]: { action: 'EXCUSE', note: '主管批准换班' } });
        const [rec] = buildAttendanceRecords(ok, { batchId: 'b1', reviewedBy: '主管', reviewedAt: '2026-10-01T00:00:00Z' });
        expect(rec).toMatchObject({ id: 'review_9001_2026-09-08', status: 'COMPLETED', lateExcused: true, source: 'face_machine', importBatchId: 'b1' });

        const confirmed = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS }, { [late.key]: { action: 'CONFIRM' } });
        const [rec2] = buildAttendanceRecords(confirmed, { batchId: 'b1', reviewedBy: '主管', reviewedAt: 'x' });
        expect(rec2.status).toBe('COMPLETED_LATE');
        expect(rec2.lateExcused).toBeUndefined();
    });

    it('加班须批准才计入', () => {
        const data = load({ 10: '15:00\n', 11: '02:30\n' });
        const r = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS });
        const ot = r.employees[0].days[0].exceptions.find(x => x.type === 'OVERTIME')!;
        expect(ot.minutes).toBe(90);
        expect(r.employees[0].totals.approvedOtMinutes).toBe(0);
        const approved = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS }, { [ot.key]: { action: 'APPROVE' } });
        expect(approved.employees[0].totals.approvedOtMinutes).toBe(90);
        expect(buildAttendanceRecords(approved, { batchId: 'b', reviewedBy: 'S', reviewedAt: 'x' })[0].approvedOtMinutes).toBe(90);
    });

    it('以员工编号对应：考勤机编号优先，其次员工 ID；对不上的列出，可手动对应或略过', () => {
        const list = [emp('9001'), emp('E-77', { attendanceDeviceNo: '9002' })];
        expect(matchEmployee('9002', list)?.id).toBe('E-77');
        expect(matchEmployee('9001', list)?.id).toBe('9001');
        expect(matchEmployee('1234', list)).toBeNull();

        const data = load({ 12: '15:00\n', 13: '01:00\n' }, '5555');
        expect(buildReview(data, list, { shiftSettings: SETTINGS }).unmatched).toHaveLength(1);
        expect(buildReview(data, list, { shiftSettings: SETTINGS }, {}, { '5555': '9001' }).employees[0].employee?.id).toBe('9001');
        expect(buildReview(data, list, { shiftSettings: SETTINGS }, {}, { '5555': '' }).employees).toHaveLength(0);
    });

    it('写入时间以马来西亚时区计算，不受浏览器时区影响', () => {
        expect(businessMinuteToIso('2026-09-01', 15 * 60)).toBe('2026-09-01T07:00:00.000Z');
        expect(businessMinuteToIso('2026-09-01', 1440 + 60)).toBe('2026-09-01T17:00:00.000Z');
    });
});

describe('Codex 审核修正', () => {
    const load = (cells: Record<number, string>, no = '9001') =>
        parseFace3000Workbook({ Logs: makeLogs(PERIOD, 30, [{ no, name: 'A', dept: 'BOH', cells }]) });

    it('补上的时间被当成重复（5 分钟内）时，漏打卡仍算未处理，不能导入', () => {
        const key = '9001|2026-09-07|MISSING_PUNCH';
        const r = buildReview(load({ 7: '15:00\n' }), [emp('9001')], { shiftSettings: SETTINGS }, { [key]: { action: 'ADD_TIME', time: '15:02' } });
        expect(r.openExceptionCount).toBe(1);
        expect(r.employees[0].days[0].exceptions[0].message).toMatch(/无效/);
        expect(() => buildAttendanceRecords(r, { batchId: 'b', reviewedBy: 'S', reviewedAt: 'x' })).toThrow();
    });

    it('allTimes 维持原本的 HH:mm 格式（不加 +1）', () => {
        const r = buildReview(load({ 1: '15:05\n', 2: '00:58\n' }), [emp('9001')], { shiftSettings: SETTINGS });
        const [rec] = buildAttendanceRecords(r, { batchId: 'b', reviewedBy: 'S', reviewedAt: 'x' });
        expect(rec.allTimes).toEqual(['15:05', '00:58']);
        expect(r.employees[0].days[0].punches).toEqual(['15:05', '00:58+1']);
    });

    it('PDF 每日列转成原始打卡：时间变小代表跨午夜，算下一个日历日', () => {
        const data = fromDailyRows('2026-09', [{ deviceNo: '9001', name: 'A', rows: [{ day: 1, times: ['14:39', '01:00'] }, { day: 30, times: ['15:00', '00:30'] }] }]);
        expect(data.periodEnd).toBe('2026-09-30');
        expect(data.employees[0].punches).toEqual([
            { date: '2026-09-01', time: '14:39' },
            { date: '2026-09-02', time: '01:00' },
            { date: '2026-09-30', time: '15:00' },
            { date: '2026-10-01', time: '00:30' },
        ]);
        const r = buildReview(data, [emp('9001')], { shiftSettings: SETTINGS });
        expect(r.employees[0].days.map(d => [d.businessDate, d.workedMinutes])).toEqual([['2026-09-01', 621], ['2026-09-30', 570]]);
    });

    it('人工成本只算完整日历月', () => {
        expect(isCalendarMonth('2026-09-01', '2026-09-30')).toBe(true);
        expect(isCalendarMonth('2026-02-01', '2026-02-28')).toBe(true);
        expect(isCalendarMonth('2026-09-26', '2026-10-25')).toBe(false);
        expect(isCalendarMonth('2026-09-01', '2026-09-15')).toBe(false);
    });
});
