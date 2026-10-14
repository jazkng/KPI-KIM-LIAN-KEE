// ============================================================================
// 老板经营驾驶舱 · 资料读取（只读）
// ----------------------------------------------------------------------------
// 一次按日期范围读取「期间 + 期末所在整月 + 走势需要的近 14 天」的日结与支出，
// 薪资、员工沿用 DataManager 既有的快取；不读整个日结 / 支出集合，不写入任何资料。
// ============================================================================
import type { AttendanceRecord } from '../../types';
import { DataManager } from '../dataManager';
import { aggregateMonth, aggregateRange, parentBillIdOfPayment, splitAccrualDuplicatePayments } from '../monthlyPnLAggregator';
import { buildMonthLabourCosts, summariseReviewedAttendance } from '../labour/labourCost';
import { buildCockpit, dailyRevenueFromSettlements, type CockpitInputs, type CockpitResult } from './cockpitMetrics';
import { computeProfitAdjustments } from './profitAdjustments';
import { addDays, daysInMonth, type Period } from './periods';

const TIMEOUT_MS = 25000;

/** 读取逾时就报错，不让画面无限转圈 */
const withTimeout = <T,>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('读取逾时，请检查网络')), ms)),
    ]);

/** 分期付款列对应的原账单（期间外的才另外读取） */
export const loadParentBills = async (
    expenses: { id?: string }[],
    accountingMode: 'ACCRUAL' | 'CASH',
): Promise<Map<string, { totalBillAmount?: number }>> => {
    if (accountingMode !== 'ACCRUAL') return new Map();
    const loaded = new Set(expenses.map(e => e.id));
    const missing = expenses.map(e => parentBillIdOfPayment(e.id)).filter((id): id is string => !!id && !loaded.has(id));
    if (!missing.length) return new Map();
    const bills = await DataManager.getStandaloneExpensesByIds(missing);
    return new Map(bills.map(b => [b.id, b]));
};

export const loadCockpit = (
    period: Period,
    today: string,
    accountingMode: 'ACCRUAL' | 'CASH' = 'ACCRUAL',
): Promise<CockpitResult> => withTimeout(loadCockpitInner(period, today, accountingMode));

const loadCockpitInner = async (
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

    const [rawLoaded, employees, payrollRecords, reviews] = await Promise.all([
        DataManager.getPnLRawRange(loadStart, loadEnd),
        DataManager.getEmployees(),
        DataManager.getPayrollRecords(),
        // 审核后的考勤只用于推算日薪 / 时薪员工；读不到不影响其他指标
        Promise.all(labourMonths.map(m => DataManager.getAttendanceReviewsByMonth(m).catch(() => [] as AttendanceRecord[]))),
    ]);
    // 分期付款对应的原账单（只有业务发生制需要；两种口径共用一次读取）
    const parents = await loadParentBills(rawLoaded.standaloneExpenses, 'ACCRUAL');
    const labourByMonth = labourMonths.map((m, i) => ({
        month: m,
        costs: buildMonthLabourCosts(m, employees, payrollRecords, summariseReviewedAttendance(reviews[i])),
    }));
    const daily = dailyRevenueFromSettlements(rawLoaded.settlements);
    const inPeriod = rawLoaded.settlements.filter(s => {
        const d = String(s.date || '').slice(0, 10);
        return d >= period.start && d <= period.end;
    });
    // PR B 利润引擎修正（与口径无关：平台扣款、收款手续费、钱箱支出）
    const adjustments = computeProfitAdjustments(rawLoaded.settlements, rawLoaded.standaloneExpenses, period.start, period.end);
    const monthAdjustments = computeProfitAdjustments(rawLoaded.settlements, rawLoaded.standaloneExpenses, monthStart, monthEnd);

    const inputsFor = (mode: 'ACCRUAL' | 'CASH'): CockpitInputs => {
        // 业务发生制：排除应付账款的分期付款列（原账单已按全额计入，否则重复扣除）
        const { kept, removed: duplicatePayments } = splitAccrualDuplicatePayments(rawLoaded.standaloneExpenses, mode, parents);
        const raw = { ...rawLoaded, standaloneExpenses: kept };
        const data = { ...raw, payrollRecords, employees };
        // 兼职工资：与 aggregateMonth 相同的日期 / 金额规则（业务发生制看账单日，现金制看付款日且已付）
        const partTimeIn = (start: string, end: string) => raw.standaloneExpenses.reduce((sum, e: any) => {
            if (!String(e?.id || '').startsWith('parttime_')) return sum;
            const date = String((mode === 'ACCRUAL' ? e.time : e.paymentDate || e.time) || '').slice(0, 10);
            if (!date || date < start || date > end) return sum;
            if (mode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return sum;
            const amount = (Number(mode === 'ACCRUAL' ? e.totalBillAmount || e.amount : e.amount) || 0) - (Number(e.creditNote) || 0);
            return sum + Math.max(0, amount);
        }, 0);
        return {
            period,
            today,
            accountingMode: mode,
            pnl: aggregateRange(period.start, period.end, data, mode),
            dailyRevenue: daily,
            settlementTotal: inPeriod.reduce((s, x) => s + (Number(x.sales?.total) || 0), 0),
            settlementCount: inPeriod.length,
            partTimeWages: partTimeIn(period.start, period.end),
            monthPartTimeWages: partTimeIn(monthStart, monthEnd),
            excludedDuplicatePayments: duplicatePayments
                .filter(e => { const d = String(e.time || '').slice(0, 10); return d >= period.start && d <= period.end; })
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
            pettyCash: adjustments.pettyCash,
            adjustments,
            monthAdjustments,
            labour: labourByMonth.filter(l => period.months.includes(l.month)),
            monthPnl: aggregateMonth(month, data, mode),
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
        };
    };

    // 另一种口径的净利（只取数字，用来说明两种口径的差异）
    const otherMode = accountingMode === 'ACCRUAL' ? 'CASH' : 'ACCRUAL';
    const otherModeNetProfit = buildCockpit(inputsFor(otherMode)).kpis.actualProfit.value;
    return buildCockpit({ ...inputsFor(accountingMode), otherModeNetProfit });
};
