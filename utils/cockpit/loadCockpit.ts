// ============================================================================
// 老板经营驾驶舱 · 资料读取（只读）
// ----------------------------------------------------------------------------
// 一次按日期范围读取「期间 + 期末所在整月 + 走势需要的近 14 天」的日结与支出，
// 薪资、员工沿用 DataManager 既有的快取；不读整个日结 / 支出集合，不写入任何资料。
// ============================================================================
import type { AttendanceRecord } from '../../types';
import { DataManager } from '../dataManager';
import { aggregateMonth, aggregateRange } from '../monthlyPnLAggregator';
import { buildMonthLabourCosts, summariseReviewedAttendance } from '../labour/labourCost';
import { buildCockpit, dailyRevenueFromSettlements, type CockpitResult } from './cockpitMetrics';
import { addDays, daysInMonth, type Period } from './periods';

export const loadCockpit = async (
    period: Period,
    today: string,
    accountingMode: 'ACCRUAL' | 'CASH' = 'ACCRUAL',
): Promise<CockpitResult> => {
    const month = period.end.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const trendStart = addDays(period.end, -13);
    const loadStart = [period.start, monthStart, trendStart].sort()[0];
    const loadEnd = [period.end, monthEnd].sort()[1];
    const labourMonths = Array.from(new Set([...period.months, month]));

    const [raw, employees, payrollRecords, reviews] = await Promise.all([
        DataManager.getPnLRawRange(loadStart, loadEnd),
        DataManager.getEmployees(),
        DataManager.getPayrollRecords(),
        // 审核后的考勤只用于推算日薪 / 时薪员工；读不到不影响其他指标
        Promise.all(labourMonths.map(m => DataManager.getAttendanceReviewsByMonth(m).catch(() => [] as AttendanceRecord[]))),
    ]);
    const data = { ...raw, payrollRecords, employees };
    const labourByMonth = labourMonths.map((m, i) => ({
        month: m,
        costs: buildMonthLabourCosts(m, employees, payrollRecords, summariseReviewedAttendance(reviews[i])),
    }));
    const daily = dailyRevenueFromSettlements(raw.settlements);
    // 兼职工资：与 aggregateMonth 相同的日期 / 金额规则（业务发生制看账单日，现金制看付款日且已付）
    const partTimeIn = (start: string, end: string) => raw.standaloneExpenses.reduce((sum, e: any) => {
        if (!String(e?.id || '').startsWith('parttime_')) return sum;
        const date = String((accountingMode === 'ACCRUAL' ? e.time : e.paymentDate || e.time) || '').slice(0, 10);
        if (!date || date < start || date > end) return sum;
        if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return sum;
        const amount = (Number(accountingMode === 'ACCRUAL' ? e.totalBillAmount || e.amount : e.amount) || 0) - (Number(e.creditNote) || 0);
        return sum + Math.max(0, amount);
    }, 0);
    const inPeriod = raw.settlements.filter(s => {
        const d = String(s.date || '').slice(0, 10);
        return d >= period.start && d <= period.end;
    });

    return buildCockpit({
        period,
        today,
        accountingMode,
        pnl: aggregateRange(period.start, period.end, data, accountingMode),
        dailyRevenue: daily,
        settlementTotal: inPeriod.reduce((s, x) => s + (Number(x.sales?.total) || 0), 0),
        settlementCount: inPeriod.length,
        partTimeWages: partTimeIn(period.start, period.end),
        monthPartTimeWages: partTimeIn(monthStart, monthEnd),
        pettyCash: inPeriod.reduce((sum, x: any) => sum + (x.dayExpenses || []).reduce((t: number, e: any) => t + (Number(e?.amount) || 0), 0), 0),
        labour: labourByMonth.filter(l => period.months.includes(l.month)),
        monthPnl: aggregateMonth(month, data, accountingMode),
        monthLabour: labourByMonth.find(l => l.month === month)?.costs || [],
        monthDailyRevenue: Object.fromEntries(Object.entries(daily).filter(([d]) => d >= monthStart && d <= monthEnd)),
        sourceCounts: {
            settlements: inPeriod.length,
            standaloneExpenses: raw.standaloneExpenses.length,
            billPayments: raw.billPayments.length,
            payrollRecords: payrollRecords.filter(p => labourMonths.includes(p.month)).length,
            employees: employees.length,
        },
        loadedAt: new Date().toISOString(),
    });
};
