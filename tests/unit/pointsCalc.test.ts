import { describe, expect, it } from 'vitest';
import { attendancePart, bonusLines, computeMonthPoints, disciplinePart, gradeOf, hygienePart, meetingPart, taskPart, type PointsInput } from '../../utils/points/pointsCalc';

const toDate = (iso: string) => iso.slice(0, 10);
const toHHMM = (iso: string) => iso.slice(11, 16);
const base = (over: Partial<PointsInput> = {}): PointsInput => ({
    month: '2026-10', asOf: '2026-10-31',
    employee: { id: 'e1', name: 'Ah Kow' },
    tasks: [], attendance: [], hygiene: [], meetings: [], checkins: [],
    toDate, toHHMM, ...over,
});
const task = (p: any) => ({ id: 't', type: 'CLEAN', title: '洗冷气', assignMode: 'PERSON', assigneeId: 'e1', assigneeKey: 'emp:e1', repeat: 'ONCE', photosRequired: 0, createdBy: 'b', createdByName: 'B', createdAt: '2026-10-01T02:00:00Z', status: 'OPEN', returnCount: 0, returnedEmployeeIds: [], history: [], ...p });

describe('积分计算（负责人 2026-10-22 规则）', () => {
    it('满分员工 = 100 分，A', () => {
        const r = computeMonthPoints(base());
        expect(r.total).toBe(100);
        expect(r.grade).toBe('A');
    });

    it('任务：每期算一次，迟交也算完成，没派任务 = 满分', () => {
        const weekly = task({ repeat: 'WEEKLY', repeatDays: [1], history: [{ at: '2026-10-06T03:00:00Z', by: 'Ah Kow', action: 'SUBMIT' }, { at: '2026-10-13T03:00:00Z', by: 'Ah Kow', action: 'SUBMIT' }] });
        // 10 月的星期一：5、12、19、26 → 4 期；5 号那期在 6 号交（迟交也算），12 号那期在 13 号交，19、26 没交
        const p = taskPart(base({ tasks: [weekly as any] }));
        expect(p.lines[0].text).toBe('完成 2 / 4 个任务');
        expect(p.points).toBe(15);
        expect(taskPart(base()).points).toBe(30);
        const once = task({ dueAt: '2026-10-10T10:00:00Z', status: 'DONE', history: [{ at: '2026-10-12T03:00:00Z', by: 'Ah Kow', action: 'SUBMIT' }] });
        expect(taskPart(base({ tasks: [once as any] })).points).toBe(30);
        expect(taskPart(base({ tasks: [task({ dueAt: '2026-10-10T10:00:00Z' }) as any] })).points).toBe(0);
    });

    it('出勤：迟到、早退各 −2，缺勤 −5，豁免不扣，最低 0', () => {
        const a = (date: string, status: string, extra: any = {}) => ({ id: date, employeeId: 'e1', employeeName: '', date, clockIn: '', clockOut: '', durationMinutes: 0, status, ...extra }) as any;
        const p = attendancePart(base({ attendance: [a('2026-10-02', 'LATE'), a('2026-10-03', 'LATE_AND_EARLY'), a('2026-10-04', 'ABSENT'), a('2026-10-05', 'LATE', { lateExcused: true }), a('2026-09-30', 'LATE')] }));
        expect(p.points).toBe(25 - 2 - 4 - 5);
        expect(attendancePart(base({ attendance: Array.from({ length: 20 }, (_, i) => a(`2026-10-${String(i + 1).padStart(2, '0')}`, 'ABSENT')) })).points).toBe(0);
    });

    it('卫生：平均 3 分 = 20，2 分 = 10；4 分 +1、5 分 +2 另算加分；没检查 = 20', () => {
        const h = (weekStart: string, score: number) => ({ id: weekStart, employeeId: 'e1', weekStart, score, checkedBy: 's', checkedByName: 'S', at: '' }) as any;
        const r = hygienePart(base({ hygiene: [h('2026-10-05', 3), h('2026-10-12', 2), h('2026-10-19', 5), h('2026-10-26', 4)] }));
        expect(r.part.points).toBe(17.5); // (20 + 10 + 20 + 20) / 4
        expect(r.bonus.reduce((n, l) => n + l.points, 0)).toBe(3);
        expect(hygienePart(base()).part.points).toBe(20);
    });

    it('会议：开始后 10 分钟内合格，更晚 −3，没来 −5，每月重置、最低 0', () => {
        const m = (id: string, date: string, start = '10:00') => ({ id, type: 'STORE', date, start, end: '11:00', attendeeIds: ['e1'], status: 'ENDED', createdBy: '', createdByName: '', createdAt: '' }) as any;
        const c = (meetingId: string, at: string) => ({ id: meetingId, meetingId, employeeId: 'e1', employeeName: '', via: 'CAMERA', checkedInAt: at }) as any;
        const p = meetingPart(base({ meetings: [m('a', '2026-10-05'), m('b', '2026-10-12'), m('c', '2026-10-19'), m('d', '2026-09-28')], checkins: [c('a', '2026-10-05T10:10:00'), c('b', '2026-10-12T10:11:00')] }));
        expect(p.points).toBe(10 - 3 - 5);
        expect(p.lines.map(l => l.points)).toEqual([0, -3, -5]);
    });

    it('纪律：警告 −5；黄色 −10 再 −5；红色 −50 起每月少 10、维持 5 个月', () => {
        const w = (date: string, type: string) => ({ id: date, date, type, reason: 'x', issuer: 'B' }) as any;
        expect(disciplinePart(base({ employee: { id: 'e1', name: 'A', warningHistory: [w('2026-10-03', 'VERBAL')] } })).points).toBe(10);
        expect(disciplinePart(base({ employee: { id: 'e1', name: 'A', warningHistory: [w('2026-09-20', 'WRITTEN')] } })).points).toBe(10);
        expect(disciplinePart(base({ month: '2026-11', employee: { id: 'e1', name: 'A', warningHistory: [w('2026-09-20', 'WRITTEN')] } })).points).toBe(15);
        expect(disciplinePart(base({ employee: { id: 'e1', name: 'A', warningHistory: [w('2026-08-01', 'FINAL')] } })).points).toBe(15 - 30);
        expect(disciplinePart(base({ month: '2027-01', employee: { id: 'e1', name: 'A', warningHistory: [w('2026-08-01', 'FINAL')] } })).points).toBe(15);
    });

    it('加分：表扬 +15；技能星级不算积分', () => {
        const emp = { id: 'e1', name: 'A', reviews: [{ id: 'r', date: '2026-10-08', author: 'B', content: '帮忙', type: 'PRAISE' }, { id: 'r2', date: '2026-10-09', author: 'B', content: 'x', type: 'CRITICISM' }] as any,
            skillRatingLog: [{ itemId: 'b', from: 1, to: 2, at: '2026-10-02T01:00:00Z' }] } as any;
        expect(bonusLines(base({ employee: emp })).map(l => l.points)).toEqual([15]);
        expect(bonusLines(base({ month: '2026-11', employee: emp }))).toEqual([]);
    });

    it('A ≥ 90、B ≥ 75、C ≥ 60、其他 D', () => {
        expect([95, 90, 89.9, 75, 60, 59].map(gradeOf)).toEqual(['A', 'A', 'B', 'B', 'C', 'D']);
    });
});
