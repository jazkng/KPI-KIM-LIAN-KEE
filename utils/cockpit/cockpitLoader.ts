// ============================================================================
// 老板经营驾驶舱 · 资料读取与计算（与执行环境无关）
// ----------------------------------------------------------------------------
// 读取层以 CockpitDataSource 注入：浏览器用 DataManager（loadCockpit.ts），
// 服务端推送检查用 firebase-admin（server/push/adminDataSource.ts），两边共用同一套计算。
// 一次按日期范围读取「期间 + 期末所在整月 + 走势与预警需要的近 15 天」的日结与支出；不写入任何资料。
// ============================================================================
import type { AttendanceRecord, BillPaymentRecord, Employee, ExpenseItem, PayrollRecord, SettlementRecord } from '../../types';
import { aggregateMonth, aggregateRange, parentBillIdOfPayment, splitAccrualDuplicatePayments } from '../monthlyPnLAggregator';
import { buildMonthLabourCosts, summariseReviewedAttendance } from '../labour/labourCost';
import { buildCockpit, dailyRevenueFromSettlements, type CockpitInputs, type CockpitResult } from './cockpitMetrics';
import { computeProfitAdjustments } from './profitAdjustments';
import { addDays, daysInMonth, type Period } from './periods';
import { computePnL } from '../pnl/engine/pnlEngine';

/** 驾驶舱需要的只读资料来源 */
export interface CockpitDataSource {
    getPnLRawRange(start: string, end: string): Promise<{ settlements: SettlementRecord[]; billPayments: BillPaymentRecord[]; standaloneExpenses: ExpenseItem[] }>;
    getEmployees(): Promise<Employee[]>;
    getPayrollRecords(): Promise<PayrollRecord[]>;
    getAttendanceReviewsByMonth(month: string): Promise<AttendanceRecord[]>;
    getStandaloneExpensesByIds(ids: string[]): Promise<ExpenseItem[]>;
    /** 固定账单设定（检查当月有没有漏入账用；没有提供就不检查） */
    getRecurringBills?(): Promise<any[]>;
}

/** 分期付款列对应的原账单（期间外的才另外读取） */
export const loadParentBillsWith = async (
    source: Pick<CockpitDataSource, 'getStandaloneExpensesByIds'>,
    expenses: { id?: string }[],
    accountingMode: 'ACCRUAL' | 'CASH',
): Promise<Map<string, { totalBillAmount?: number }>> => {
    if (accountingMode !== 'ACCRUAL') return new Map();
    const loaded = new Set(expenses.map(e => e.id));
    const missing = expenses.map(e => parentBillIdOfPayment(e.id)).filter((id): id is string => !!id && !loaded.has(id));
    if (!missing.length) return new Map();
    const bills = await source.getStandaloneExpensesByIds(missing);
    return new Map(bills.map(b => [b.id, b]));
};

export const loadCockpitWith = async (
    source: CockpitDataSource,
    period: Period,
    today: string,
    accountingMode: 'ACCRUAL' | 'CASH' = 'ACCRUAL',
    /** true = 改读唯一盈亏引擎（负责人在盈亏对账核对 9 月数字后，另一个 PR 才改为预设） */
    options: { useEngine?: boolean } = {},
): Promise<CockpitResult> => {
    const month = period.end.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const trendStart = addDays(period.end, -13);
    // 预警中心比较「近 7 天 vs 前 7 天」，今天未日结时以昨天为终点，所以多读一天
    const alertStart = addDays(period.end, -14);
    // 多读前一天：带时区的账单时间要换成马来西亚日期再判断属于哪一天
    const loadStart = addDays([period.start, monthStart, trendStart, alertStart].sort()[0], -1);
    const loadEnd = [period.end, monthEnd].sort()[1];
    const labourMonths = Array.from(new Set([...period.months, month]));

    const [rawLoaded, employees, payrollRecords, reviews, recurringBills] = await Promise.all([
        source.getPnLRawRange(loadStart, loadEnd),
        source.getEmployees(),
        source.getPayrollRecords(),
        // 审核后的考勤只用于推算日薪 / 时薪员工；读不到不影响其他指标
        Promise.all(labourMonths.map(m => source.getAttendanceReviewsByMonth(m).catch(() => [] as AttendanceRecord[]))),
        source.getRecurringBills ? source.getRecurringBills().catch(() => [] as any[]) : Promise.resolve([] as any[]),
    ]);
    // 分期付款对应的原账单（只有业务发生制需要；两种口径共用一次读取）
    const parents = await loadParentBillsWith(source, rawLoaded.standaloneExpenses, 'ACCRUAL');
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
    // 唯一盈亏引擎（业务发生制）：利润以它为准；现金制画面仍是现金流对照
    const engineInput = {
        settlements: rawLoaded.settlements as any[], standaloneExpenses: rawLoaded.standaloneExpenses as any[], billPayments: rawLoaded.billPayments as any[],
        payrollRecords: payrollRecords as any[], employees: employees as any[], recurringBills, parentBills: parents,
        attendanceByMonth: Object.fromEntries(labourMonths.map((m, i) => [m, summariseReviewedAttendance(reviews[i])])),
    };
    const engines = accountingMode === 'ACCRUAL' && options.useEngine === true
        ? { engine: computePnL(engineInput, period.start, period.end, today), monthEngine: computePnL(engineInput, monthStart, monthEnd, today) }
        : {};
    const result = buildCockpit({ ...inputsFor(accountingMode), otherModeNetProfit, ...engines });
    return { ...result, context: { labourByMonth, employees, payrollRecords } };
};
