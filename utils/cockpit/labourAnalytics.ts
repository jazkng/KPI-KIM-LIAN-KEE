// ============================================================================
// 老板经营驾驶舱 · 人工效益分析（PR C1）
// ----------------------------------------------------------------------------
// 纯函数，只读。输入期间的营业额、毛利、人工成本明细与打卡工时，输出：
//   - 每人工小时营业额 / 毛利贡献、每小时人工成本
//   - 人工成本组成（底薪、OT、津贴与其他、雇主法定供款、兼职、员工餐宿舍）
//   - 部门人工成本、工时、人数
//   - 星期别营业额与工时
//   - OT 成本走势（近 6 个月薪资记录）
//   - 排班建议（只提建议，附证据；不自动修改班表、OT 或薪资）
// 资料不足时明确标示，不推算成真实数字：
//   - 没有分班次营业额 → 班次效益一律标「资料不足」
//   - 没有打卡工时 → 每小时指标标「资料不足」
// ============================================================================
import type { EmployeeLabourCost } from '../labour/labourCost';
import { addDays, daysInMonth, overlapDaysWithMonth, type Period } from './periods';

export interface AttendanceLike {
    employeeId: string;
    date: string;
    durationMinutes?: number;
}

export interface PayrollLike {
    month: string;
    status?: string;
    details?: { employeeId?: string; ot?: number }[];
}

export interface LabourAnalyticsInput {
    period: Pick<Period, 'start' | 'end' | 'months'>;
    dailyRevenue: Record<string, number>;
    grossProfit: number;
    labourByMonth: { month: string; costs: EmployeeLabourCost[] }[];
    otherLabour: number; // 员工餐、宿舍（期间）
    partTime: number; // 兼职工资（期间）
    attendance: AttendanceLike[];
    employees: { id: string; department?: string; role?: string }[];
    payrollRecords: PayrollLike[];
    /** 近 6 个月 OT 走势的最后一个月（通常是期末所在月） */
    trendEndMonth: string;
}

export interface LabourAnalytics {
    hours: number;
    headcount: number;
    hoursStatus: 'OK' | 'INSUFFICIENT';
    hoursNote: string;
    revenue: number;
    labourCost: number;
    revenuePerHour: number | null;
    grossProfitPerHour: number | null;
    labourCostPerHour: number | null;
    composition: { label: string; amount: number }[];
    byDept: { dept: string; cost: number; hours: number; headcount: number; costShare: number }[];
    byWeekday: { weekday: string; days: number; avgRevenue: number; avgHours: number; revenuePerHour: number | null }[];
    otTrend: { month: string; ot: number; status: 'POSTED' | 'DRAFT' | 'NONE' }[];
    shiftAnalysis: { available: false; note: string };
    suggestions: { title: string; evidence: string; impact: string; caveat: string }[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekdayOf = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const prevMonth = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

export const buildLabourAnalytics = (input: LabourAnalyticsInput): LabourAnalytics => {
    const { period } = input;
    const inPeriod = (d: string) => d >= period.start && d <= period.end;

    // ── 人工成本组成（按期间天数分摊，与驾驶舱「人工总成本」同口径）──
    const comp = { basic: 0, ot: 0, allowance: 0, other: 0, statutory: 0 };
    const deptCost: Record<string, number> = {};
    input.labourByMonth.forEach(({ month, costs }) => {
        const share = overlapDaysWithMonth(period, month) / daysInMonth(month);
        if (!share) return;
        costs.forEach(c => {
            const other = Math.max(0, c.gross - c.basic - c.overtime - c.allowance);
            comp.basic += c.basic * share;
            comp.ot += c.overtime * share;
            comp.allowance += c.allowance * share;
            comp.other += other * share;
            comp.statutory += (c.employerEpf + c.employerSocso + c.employerEis) * share;
            const dept = c.department || 'OTHER';
            deptCost[dept] = (deptCost[dept] || 0) + c.employerCost * share;
        });
    });
    const composition = [
        { label: '底薪', amount: round2(comp.basic) },
        { label: '加班费（OT，已发薪资中的实际金额）', amount: round2(comp.ot) },
        { label: '固定津贴', amount: round2(comp.allowance) },
        { label: '奖金与其他收入', amount: round2(comp.other) },
        { label: '雇主 EPF / SOCSO / EIS', amount: round2(comp.statutory) },
        { label: '兼职工资', amount: round2(input.partTime) },
        { label: '员工餐、宿舍', amount: round2(input.otherLabour) },
    ].filter(r => r.amount !== 0);
    const labourCost = round2(composition.reduce((s, r) => s + r.amount, 0));

    // ── 工时（V1 打卡记录 durationMinutes；只算期间内、时长 > 0 的记录）──
    const deptOf = new Map(input.employees.map(e => [e.id, e.department || 'OTHER']));
    const records = input.attendance.filter(a => inPeriod(String(a.date || '').slice(0, 10)) && Number(a.durationMinutes) > 0);
    const hours = round2(records.reduce((s, a) => s + Number(a.durationMinutes) / 60, 0));
    const people = new Set(records.map(a => a.employeeId));
    const deptHours: Record<string, number> = {};
    const deptPeople: Record<string, Set<string>> = {};
    const dayHours: Record<string, number> = {};
    records.forEach(a => {
        const dept = deptOf.get(a.employeeId) || 'OTHER';
        deptHours[dept] = (deptHours[dept] || 0) + Number(a.durationMinutes) / 60;
        (deptPeople[dept] ||= new Set()).add(a.employeeId);
        const d = String(a.date).slice(0, 10);
        dayHours[d] = (dayHours[d] || 0) + Number(a.durationMinutes) / 60;
    });

    const revenueDays = Object.keys(input.dailyRevenue).filter(inPeriod);
    const revenue = round2(revenueDays.reduce((s, d) => s + input.dailyRevenue[d], 0));
    const hoursStatus: LabourAnalytics['hoursStatus'] = hours > 0 ? 'OK' : 'INSUFFICIENT';
    const daysWithBoth = revenueDays.filter(d => dayHours[d] > 0).length;
    const hoursNote = hours > 0
        ? `打卡工时 ${hours.toFixed(1)} 小时（${people.size} 人、${records.length} 笔打卡记录），${daysWithBoth}/${revenueDays.length} 个营业日同时有营业额与工时`
        : '期间内没有打卡工时资料，每小时指标无法计算';

    const depts = Array.from(new Set([...Object.keys(deptCost), ...Object.keys(deptHours)]));
    const totalDeptCost = depts.reduce((s, d) => s + (deptCost[d] || 0), 0);
    const byDept = depts
        .map(dept => ({
            dept,
            cost: round2(deptCost[dept] || 0),
            hours: round2(deptHours[dept] || 0),
            headcount: deptPeople[dept]?.size || 0,
            costShare: totalDeptCost > 0 ? (deptCost[dept] || 0) / totalDeptCost : 0,
        }))
        .sort((a, b) => b.cost - a.cost);

    // ── 星期别 ──
    const wk: Record<number, { days: number; revenue: number; hours: number }> = {};
    for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
        if (input.dailyRevenue[d] === undefined) continue;
        const w = weekdayOf(d);
        const slot = (wk[w] ||= { days: 0, revenue: 0, hours: 0 });
        slot.days += 1;
        slot.revenue += input.dailyRevenue[d];
        slot.hours += dayHours[d] || 0;
    }
    const byWeekday = [1, 2, 3, 4, 5, 6, 0].filter(w => wk[w]).map(w => ({
        weekday: WEEKDAYS[w],
        days: wk[w].days,
        avgRevenue: round2(wk[w].revenue / wk[w].days),
        avgHours: round2(wk[w].hours / wk[w].days),
        revenuePerHour: wk[w].hours > 0 ? round2(wk[w].revenue / wk[w].hours) : null,
    }));

    // ── OT 走势（近 6 个月薪资记录的 OT 金额）──
    const trendMonths: string[] = [];
    for (let m = input.trendEndMonth, i = 0; i < 6; i++, m = prevMonth(m)) trendMonths.unshift(m);
    const otTrend = trendMonths.map(month => {
        const rec = input.payrollRecords.find(p => p.month === month);
        if (!rec) return { month, ot: 0, status: 'NONE' as const };
        const ot = (rec.details || []).reduce((s, d) => s + (Number(d?.ot) || 0), 0);
        return { month, ot: round2(ot), status: (rec.status === 'POSTED' ? 'POSTED' : 'DRAFT') as 'POSTED' | 'DRAFT' };
    });

    // ── 排班建议（只建议，附证据；需考虑岗位性质）──
    const suggestions: LabourAnalytics['suggestions'] = [];
    const rated = byWeekday.filter(w => w.revenuePerHour !== null && w.days >= 2);
    if (rated.length >= 3 && hours > 0) {
        const avg = revenue / hours;
        const low = [...rated].sort((a, b) => (a.revenuePerHour as number) - (b.revenuePerHour as number))[0];
        const high = [...rated].sort((a, b) => (b.revenuePerHour as number) - (a.revenuePerHour as number))[0];
        if ((low.revenuePerHour as number) < avg * 0.8) {
            suggestions.push({
                title: `检视${low.weekday}的排班人手`,
                evidence: `${period.start} ~ ${period.end} 共 ${low.days} 个${low.weekday}：平均营业额 RM ${low.avgRevenue.toFixed(0)}、工时 ${low.avgHours.toFixed(1)} 小时，每工时营业额 RM ${(low.revenuePerHour as number).toFixed(2)}，比期间平均 RM ${avg.toFixed(2)} 低 ${((1 - (low.revenuePerHour as number) / avg) * 100).toFixed(0)}%`,
                impact: `若${low.weekday}工时调整到期间平均效益，每个${low.weekday}约可减少 ${Math.max(0, low.avgHours - low.avgRevenue / avg).toFixed(1)} 工时`,
                caveat: '只看营业额与工时；厨房备料、清洁、开关店等固定工作不随营业额变动，调整前请与主管确认',
            });
        }
        if ((high.revenuePerHour as number) > avg * 1.25 && high.weekday !== low.weekday) {
            suggestions.push({
                title: `留意${high.weekday}是否人手不足`,
                evidence: `${high.weekday}每工时营业额 RM ${(high.revenuePerHour as number).toFixed(2)}，比期间平均高 ${(((high.revenuePerHour as number) / avg - 1) * 100).toFixed(0)}%`,
                impact: '效益高可能代表人手偏紧，出餐速度与服务品质可能受影响',
                caveat: '需对照顾客等候时间、出错与加班纪录再判断',
            });
        }
    }
    const otPosted = otTrend.filter(t => t.status !== 'NONE');
    if (otPosted.length >= 3) {
        const last = otPosted[otPosted.length - 1];
        const prior = otPosted.slice(0, -1);
        const priorAvg = prior.reduce((s, t) => s + t.ot, 0) / prior.length;
        if (priorAvg > 0 && last.ot > priorAvg * 1.3) {
            suggestions.push({
                title: 'OT 成本上升',
                evidence: `${last.month} OT RM ${last.ot.toFixed(2)}，前 ${prior.length} 个月平均 RM ${priorAvg.toFixed(2)}（+${((last.ot / priorAvg - 1) * 100).toFixed(0)}%）`,
                impact: `比平均多 RM ${(last.ot - priorAvg).toFixed(2)}`,
                caveat: 'OT 金额来自薪资记录；OT 规则尚待负责人确认，系统不会自动调整 OT 或薪资',
            });
        }
    }

    return {
        hours,
        headcount: people.size,
        hoursStatus,
        hoursNote,
        revenue,
        labourCost,
        revenuePerHour: hours > 0 ? round2(revenue / hours) : null,
        grossProfitPerHour: hours > 0 ? round2(input.grossProfit / hours) : null,
        labourCostPerHour: hours > 0 ? round2(labourCost / hours) : null,
        composition,
        byDept,
        byWeekday,
        otTrend,
        shiftAnalysis: {
            available: false,
            note: '资料不足：日结只记录整天营业额，没有分班次（午 / 晚）营业额，无法计算班次效益；不以推算代替真实数字',
        },
        suggestions,
    };
};
