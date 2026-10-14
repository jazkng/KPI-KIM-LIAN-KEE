import { describe, expect, it } from 'vitest';
import { buildLabourAnalytics, type LabourAnalyticsInput } from '../../utils/cockpit/labourAnalytics';
import { resolvePeriod } from '../../utils/cockpit/periods';
import type { EmployeeLabourCost } from '../../utils/labour/labourCost';

const cost = (id: string, dept: string, basic: number, ot = 0, allowance = 0, bonus = 0, epf = 0): EmployeeLabourCost => ({
    employeeId: id, employeeName: id, department: dept, source: 'PAYROLL', basic, overtime: ot, allowance,
    gross: basic + ot + allowance + bonus, employerEpf: epf, employerSocso: 0, employerEis: 0,
    employerCost: basic + ot + allowance + bonus + epf, employeeDeductions: 0, notes: [],
});

// 9 月：周一营业额高、周日营业额低；周日工时与平日相同（虚构）
const dailyRevenue: Record<string, number> = {};
const attendance: LabourAnalyticsInput['attendance'] = [];
for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, '0')}`;
    const dow = new Date(Date.UTC(2026, 8, d)).getUTCDay();
    dailyRevenue[date] = dow === 0 ? 800 : 3000;
    attendance.push({ employeeId: 'k1', date, durationMinutes: 600 }, { employeeId: 'f1', date, durationMinutes: 480 });
}

const base: LabourAnalyticsInput = {
    period: resolvePeriod('LAST_MONTH', '2026-10-15'),
    dailyRevenue,
    grossProfit: 60000,
    labourByMonth: [{ month: '2026-09', costs: [cost('k1', 'KITCHEN', 3000, 200, 100, 50, 390), cost('f1', 'FLOOR', 2000)] }],
    otherLabour: 120,
    partTime: 300,
    attendance,
    employees: [{ id: 'k1', department: 'KITCHEN' }, { id: 'f1', department: 'FLOOR' }],
    payrollRecords: [
        { month: '2026-06', status: 'POSTED', details: [{ ot: 100 }] },
        { month: '2026-07', status: 'POSTED', details: [{ ot: 100 }] },
        { month: '2026-08', status: 'POSTED', details: [{ ot: 100 }] },
        { month: '2026-09', status: 'POSTED', details: [{ ot: 200 }] },
    ],
    trendEndMonth: '2026-09',
};

describe('人工效益分析', () => {
    const a = buildLabourAnalytics(base);
    it('工时、人数与每工时指标', () => {
        expect(a.hours).toBe(30 * 18);
        expect(a.headcount).toBe(2);
        expect(a.revenuePerHour).toBeCloseTo(a.revenue / 540, 2);
        expect(a.grossProfitPerHour).toBeCloseTo(60000 / 540, 2);
    });
    it('人工成本组成加总 = 雇主总成本 + 兼职 + 员工餐（整月不分摊）', () => {
        const byLabel = Object.fromEntries(a.composition.map(r => [r.label.slice(0, 2), r.amount]));
        expect(byLabel['底薪']).toBe(5000);
        expect(a.labourCost).toBe(3740 + 2000 + 300 + 120);
    });
    it('部门成本与工时', () => {
        const k = a.byDept.find(d => d.dept === 'KITCHEN')!;
        expect(k.cost).toBe(3740);
        expect(k.hours).toBe(300);
        expect(k.headcount).toBe(1);
    });
    it('星期别：周日每工时营业额最低，产生「检视周日排班」建议并附证据与注意事项', () => {
        const sun = a.byWeekday.find(w => w.weekday === '周日')!;
        expect(sun.avgRevenue).toBe(800);
        const s = a.suggestions.find(x => x.title.includes('周日'));
        expect(s).toBeDefined();
        expect(s!.evidence).toContain('2026-09-01 ~ 2026-09-30');
        expect(s!.caveat).toContain('厨房');
    });
    it('OT 走势：近 6 个月，没有记录的月份标「无记录」；OT 明显上升产生建议', () => {
        expect(a.otTrend.map(t => t.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
        expect(a.otTrend[0].status).toBe('NONE');
        expect(a.suggestions.some(x => x.title === 'OT 成本上升')).toBe(true);
    });
    it('班次效益：没有分班次营业额，一律标资料不足', () => {
        expect(a.shiftAnalysis.available).toBe(false);
    });
    it('没有打卡工时：每小时指标为资料不足，不推算', () => {
        const b = buildLabourAnalytics({ ...base, attendance: [] });
        expect(b.hoursStatus).toBe('INSUFFICIENT');
        expect(b.revenuePerHour).toBeNull();
        expect(b.suggestions.some(x => x.title.includes('排班'))).toBe(false);
    });
    it('部分月份：人工成本按天数分摊', () => {
        const half = buildLabourAnalytics({ ...base, period: { start: '2026-09-01', end: '2026-09-15', months: ['2026-09'] } });
        expect(half.byDept.find(d => d.dept === 'FLOOR')!.cost).toBe(1000);
    });
});
