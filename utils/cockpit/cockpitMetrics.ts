// ============================================================================
// 老板经营驾驶舱 · 指标计算（Boss Cockpit · PR A）
// ----------------------------------------------------------------------------
// 纯函数：输入「某期间」的原始资料，输出驾驶舱所需的每一个 KPI，
// 每个 KPI 都带：数值、资料状态、期间、计算依据、来源记录。
//
// 口径（与财务报表相同，可对账）：
//   - 营业额 = 店内 POS 实收（扣退款）+ 外送平台总额（Gross）——即 aggregateRange 的结果，
//     与 FinancialReport / 多月份 P&L 导出同一段程序。
//     日结表单上的「营业总收入」（sales.total = POS + 平台净额 − 广告）口径不同，只在明细中列出供对照。
//   - 平台抽佣与广告 = 变动成本（由日结的总额与净额算出，不走支出单）。
//   - 食材 = 支出分类为 COGS 的采购金额（采购口径，不是实际耗用；耗用成本在 PR C）。
//   - 人工 = 雇主总人工成本（实发薪资或按底薪推算 + 雇主 EPF / SOCSO / EIS），
//     来自 utils/labour/labourCost.ts；损益中的薪资类支出与之是同一笔钱，排除不重复扣除。
//   - 不使用任何硬编码的营业目标、人工或食材比例。资料不足就标示「资料不完整」，不以假数字代替。
//
// 只读：不写入任何资料。
// ============================================================================
import { calcBreakEven } from '../financialMetrics';
import { categorizeExpense, type MonthlyPnLInputs } from '../monthlyPnLAggregator';
import type { EmployeeLabourCost } from '../labour/labourCost';
import { addDays, daysInMonth, overlapDaysWithMonth, type Period } from './periods';
import type { ProfitAdjustments } from './profitAdjustments';

export type CockpitStatus = 'CONFIRMED' | 'ESTIMATED' | 'INCOMPLETE' | 'PENDING_CLOSE';

export const COCKPIT_STATUS_LABEL: Record<CockpitStatus, string> = {
    CONFIRMED: '已确认',
    ESTIMATED: '预估',
    INCOMPLETE: '资料不完整',
    PENDING_CLOSE: '等待日结／月结',
};

export interface KpiSource {
    label: string;
    /** Firestore 集合 */
    collection: string;
    count?: number;
}

export interface KpiDetailRow {
    label: string;
    amount: number;
    note?: string;
}

export interface Kpi {
    key: string;
    label: string;
    /** 金额（RM）或比例（0–1）；null = 无法计算 */
    value: number | null;
    unit: 'RM' | 'PCT' | 'DAYS';
    status: CockpitStatus;
    /** 一句话说明这个数字的状态 */
    statusNote: string;
    /** 计算依据（公式与口径） */
    basis: string[];
    sources: KpiSource[];
    rows: KpiDetailRow[];
}

/** 一个月份的人工资料（期间涵盖几个月就有几笔） */
export interface MonthLabour {
    month: string;
    costs: EmployeeLabourCost[];
}

export interface CockpitInputs {
    period: Period;
    /** 今天的营业日 */
    today: string;
    accountingMode: 'ACCRUAL' | 'CASH';
    /** aggregateRange(period.start, period.end) */
    pnl: MonthlyPnLInputs;
    /** 期间内（及趋势需要的前几天）每天的日结营业额，按 P&L 口径 */
    dailyRevenue: Record<string, number>;
    /** 日结表单的营业总收入 sales.total（对照用） */
    settlementTotal: number;
    settlementCount: number;
    labour: MonthLabour[];
    /** 期间末所在月份的整月资料（预测月底利润、保本用）；与 period 同月时可直接传同一份 */
    monthPnl: MonthlyPnLInputs;
    monthLabour: EmployeeLabourCost[];
    monthDailyRevenue: Record<string, number>;
    /** 兼职工资（parttime_* 支出，不在薪资单 details 里），期间内 */
    partTimeWages: number;
    monthPartTimeWages: number;
    /** 日结钱箱现金支出（dayExpenses）合计（旧栏位；有 adjustments 时以 adjustments 为准） */
    pettyCash: number;
    /** PR B 利润引擎修正：平台扣款、收款手续费、钱箱支出（期间 / 期末所在整月） */
    adjustments?: ProfitAdjustments;
    monthAdjustments?: ProfitAdjustments;
    /** 另一种会计口径下的净利（对照业务发生制 / 现金制的差异） */
    otherModeNetProfit?: number | null;
    /** 业务发生制下已排除的应付账款分期付款列（避免与原账单重复）；财务报表目前仍计入 */
    excludedDuplicatePayments?: number;
    sourceCounts: { settlements: number; standaloneExpenses: number; billPayments: number; payrollRecords: number; employees: number };
    loadedAt: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const PAYROLL_ONLY_LABOUR = (cat: string) => !['STAFF_MEAL', 'STAFF_ACCOMMODATION'].some(k => cat.toUpperCase().includes(k));

/** 支出分类拆成驾驶舱的几大类；薪资类排除（与人工模组同一笔钱） */
export const splitCosts = (costByCategory: Record<string, number>) => {
    const out = { food: 0, platform: 0, opex: 0, otherLabour: 0, excludedPayrollLike: 0, nonOperating: 0 };
    const rows: Record<'food' | 'platform' | 'opex', KpiDetailRow[]> = { food: [], platform: [], opex: [] };
    Object.entries(costByCategory || {}).forEach(([cat, raw]) => {
        const amount = Number(raw) || 0;
        const group = categorizeExpense(cat);
        if (group === 'COGS') { out.food += amount; rows.food.push({ label: cat, amount }); }
        else if (group === 'DELIVERY_COST' || cat.startsWith('PLATFORM_')) { out.platform += amount; rows.platform.push({ label: cat, amount }); }
        else if (group === 'OPEX') { out.opex += amount; rows.opex.push({ label: cat, amount }); }
        else if (group === 'LABOR') {
            if (PAYROLL_ONLY_LABOUR(cat)) out.excludedPayrollLike += amount;
            else out.otherLabour += amount;
        } else out.nonOperating += amount; // CAPEX / ASSET / DIVIDEND
    });
    (Object.keys(rows) as (keyof typeof rows)[]).forEach(k => rows[k].sort((a, b) => b.amount - a.amount));
    return { ...out, rows };
};

/** 套用利润引擎修正：以正确的平台扣款取代财务报表算法，并计入收款手续费与钱箱支出 */
export const applyAdjustments = (
    costs: ReturnType<typeof splitCosts>,
    costByCategory: Record<string, number>,
    adj?: ProfitAdjustments,
) => {
    if (!adj) return { ...costs, bankFees: 0, pettyCash: 0 };
    const computedPlatform = Object.entries(costByCategory || {})
        .filter(([k]) => k.startsWith('PLATFORM_COMM_') || k.startsWith('PLATFORM_ADS_'))
        .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    return {
        ...costs,
        platform: costs.platform - computedPlatform + adj.platformCost,
        opex: costs.opex + adj.bankFees + adj.pettyCash,
        bankFees: adj.bankFees,
        pettyCash: adj.pettyCash,
    };
};

const revenueOf = (pnl: MonthlyPnLInputs) =>
    round2(pnl.inStoreSales + pnl.platformGross.grab + pnl.platformGross.shopee + pnl.platformGross.panda + pnl.platformGross.lalamove);

/** 期间内的人工成本：整月照算，跨月或部分月份按天数比例分摊（标为预估） */
export const labourForPeriod = (period: Pick<Period, 'start' | 'end'>, labour: MonthLabour[]) => {
    let amount = 0;
    let prorated = false;
    let settled = 0;
    let estimated = 0;
    let missing = 0;
    const byDept: Record<string, number> = {};
    labour.forEach(({ month, costs }) => {
        const overlap = overlapDaysWithMonth(period, month);
        if (!overlap) return;
        const dim = daysInMonth(month);
        const share = overlap / dim;
        if (share < 1) prorated = true;
        costs.forEach(c => {
            const v = c.employerCost * share;
            amount += v;
            const dept = c.department || 'OTHER';
            byDept[dept] = (byDept[dept] || 0) + v;
            if (c.source === 'PAYROLL') settled += 1;
            else if (c.notes.includes('人事档案没有底薪')) missing += 1;
            else estimated += 1;
        });
    });
    return { amount: round2(amount), prorated, settled, estimated, missing, byDept };
};

/** 期间内应有日结、实际有日结的天数 */
const settlementCoverage = (period: Period, dailyRevenue: Record<string, number>) => {
    // 只看已经过去的营业日（含今天），未来的日子不算缺
    const expected: string[] = [];
    for (let i = 0; i < period.elapsedDays; i++) expected.push(addDays(period.start, i));
    const settled = expected.filter(d => dailyRevenue[d] !== undefined);
    const missingDays = expected.filter(d => dailyRevenue[d] === undefined);
    return { expected: expected.length, settled: settled.length, missingDays };
};

export interface MonthBaseline {
    month: string;
    daysInMonth: number;
    settledDays: number;
    /** 照日均推估的整月营业额 */
    projectedRevenue: number;
    foodRate: number;
    platformRate: number;
    /** 人工总成本（不含 OT）与 OT */
    labourExOt: number;
    ot: number;
    rent: number;
    otherFixed: number;
    /** 计入人工成本的员工人数（换算人均人工成本用） */
    headcount: number;
}

export interface CockpitResult {
    period: Period;
    accountingMode: 'ACCRUAL' | 'CASH';
    loadedAt: string;
    kpis: Record<string, Kpi>;
    /** 首屏顺序 */
    order: string[];
    trend: { date: string; revenue: number | null; contribution: number | null }[];
    alerts: { level: 'HIGH' | 'NORMAL'; title: string; detail: string; kpi?: string }[];
    briefing: string[];
    missingDays: string[];
    /** 数据完整性检查清单 */
    integrity: { label: string; ok: boolean; detail: string }[];
    /** 给进一步分析（人工效益等）用的期间数字 */
    extras: {
        grossProfit: number;
        partTime: number;
        otherLabour: number;
        dailyRevenue: Record<string, number>;
        /** 期末所在月份的实际结构（保本模拟器的起点） */
        monthBaseline: MonthBaseline;
    };
    /** 由 loadCockpit 附上：人工成本明细、员工、薪资记录（只在记忆体中，供分析页使用） */
    context?: {
        labourByMonth: MonthLabour[];
        employees: { id: string; name?: string; department?: string; role?: string }[];
        payrollRecords: { month: string; status?: string; details?: { employeeId?: string; ot?: number }[] }[];
    };
}

export const buildCockpit = (input: CockpitInputs): CockpitResult => {
    const { period, pnl } = input;
    const kpis: Record<string, Kpi> = {};
    const revenue = revenueOf(pnl);
    const costs = applyAdjustments(splitCosts(pnl.costByCategory), pnl.costByCategory, input.adjustments);
    const adj = input.adjustments;
    const coverage = settlementCoverage(period, input.dailyRevenue);
    const labour = labourForPeriod(period, input.labour);
    const partTime = round2(input.partTimeWages || 0);
    const labourTotal = round2(labour.amount + costs.otherLabour + partTime);
    const periodFinished = period.end < input.today;
    const futureOnly = period.elapsedDays === 0;

    const settlementSources: KpiSource[] = [{ label: '每日结算', collection: 'settlements', count: input.sourceCounts.settlements }];
    const expenseSources: KpiSource[] = [
        { label: '独立支出 / 应付', collection: 'standalone_expenses', count: input.sourceCounts.standaloneExpenses },
        { label: '固定账单付款', collection: 'bill_payments', count: input.sourceCounts.billPayments },
        { label: '日结钱箱支出', collection: 'settlements.expenses' },
    ];
    const labourSources: KpiSource[] = [
        { label: '薪资记录', collection: 'payroll', count: input.sourceCounts.payrollRecords },
        { label: '员工底薪与法定供款设定', collection: 'employees', count: input.sourceCounts.employees },
    ];

    // ── 营业额 ──
    // 只缺「今天」= 今天还没日结（正常），不算资料缺失
    const onlyTodayMissing = coverage.missingDays.length === 1 && coverage.missingDays[0] === input.today;
    const revenueStatus: CockpitStatus = futureOnly || onlyTodayMissing
        ? 'PENDING_CLOSE'
        : coverage.missingDays.length > 0
            ? 'INCOMPLETE'
            : 'CONFIRMED';
    // 「今天」还没日结是正常的，不算缺漏，另外注明
    const pastMissing = coverage.missingDays.filter(d => d !== input.today);
    const todayPending = coverage.missingDays.includes(input.today);
    const revenueStatusNote =
        revenueStatus === 'CONFIRMED' ? `${coverage.settled} 天日结都已提交`
            : revenueStatus === 'PENDING_CLOSE' ? (futureOnly ? '期间尚未开始' : '今天尚未日结')
                : coverage.settled === 0 && !pastMissing.length ? '期间内没有任何日结'
                    : `缺 ${pastMissing.length} 天日结：${pastMissing.slice(0, 5).join('、')}${pastMissing.length > 5 ? '…' : ''}${todayPending ? '（另：今天尚未日结）' : ''}`;
    kpis.revenue = {
        key: 'revenue',
        label: '营业额',
        value: revenue,
        unit: 'RM',
        status: revenueStatus,
        statusNote: revenueStatusNote,
        basis: [
            '营业额 = 店内 POS 实收（现金 + TNG + DuitNow + 卡，扣退款）+ 外送平台总额（Grab / Foodpanda / ShopeeFood Gross + Lalamove）',
            '与财务报表（FinancialReport）同一算法；平台抽佣与广告列为成本，不从营业额中扣',
            `日结表单的「营业总收入」合计 RM ${round2(input.settlementTotal).toFixed(2)}（POS + 平台净额 − 广告），口径不同，仅供对照`,
        ],
        sources: settlementSources,
        rows: [
            { label: '店内 POS 实收', amount: round2(pnl.inStoreSales) },
            { label: 'GrabFood（总额）', amount: round2(pnl.platformGross.grab) },
            { label: 'Foodpanda（总额）', amount: round2(pnl.platformGross.panda) },
            { label: 'ShopeeFood（总额）', amount: round2(pnl.platformGross.shopee) },
            { label: 'Lalamove', amount: round2(pnl.platformGross.lalamove) },
        ].filter(r => r.amount !== 0 || r.label === '店内 POS 实收'),
    };

    // ── 食材采购 ──
    const foodStatus: CockpitStatus = costs.food === 0 ? 'INCOMPLETE' : periodFinished ? 'CONFIRMED' : 'ESTIMATED';
    kpis.food = {
        key: 'food',
        label: '食材采购成本',
        value: round2(costs.food),
        unit: 'RM',
        status: foodStatus,
        statusNote: costs.food === 0 ? '期间内没有食材类支出记录' : periodFinished ? '期间已结束，以已入账采购为准' : '期间未结束，采购可能尚未全部入账',
        basis: [
            '采购口径：支出分类为食材 / 饮料 / 包装 / 供应商（与财务报表 COGS 分类相同）的金额',
            input.accountingMode === 'ACCRUAL' ? '业务发生制：按账单日期计入' : '现金制：按付款日期、已付款金额计入',
            '这是「采购支出」，不是「实际耗用成本」；库存期初期末与耗用分析在 PR C 提供',
        ],
        sources: expenseSources,
        rows: costs.rows.food,
    };
    kpis.foodRatio = {
        key: 'foodRatio',
        label: '食材采购成本率',
        value: revenue > 0 ? costs.food / revenue : null,
        unit: 'PCT',
        status: revenue > 0 ? foodStatus : 'INCOMPLETE',
        statusNote: revenue > 0 ? '食材采购 ÷ 营业额' : '没有营业额，无法计算',
        basis: ['食材采购成本 ÷ 营业额'],
        sources: [...settlementSources, ...expenseSources],
        rows: [],
    };

    // ── 人工 ──
    const labourStatus: CockpitStatus =
        labour.settled + labour.estimated + labour.missing === 0 ? 'INCOMPLETE'
            : labour.estimated === 0 && labour.missing === 0 && !labour.prorated ? 'CONFIRMED'
                : 'ESTIMATED';
    const labourNotes: string[] = [];
    if (labour.estimated) labourNotes.push(`${labour.estimated} 人次尚未发薪，按底薪与法定供款推算`);
    if (labour.missing) labourNotes.push(`${labour.missing} 人次人事档案没有底薪，未计入`);
    if (labour.prorated) labourNotes.push('期间不是整月，按天数比例分摊');
    kpis.labour = {
        key: 'labour',
        label: '人工总成本',
        value: labourTotal,
        unit: 'RM',
        status: labourStatus,
        statusNote: labourNotes.join('；') || '全部以已发放薪资为准',
        basis: [
            '雇主人工总成本 = 应发薪资（底薪 + 津贴 + 已发 OT / 奖金）+ 雇主 EPF + 雇主 SOCSO + 雇主 EIS',
            '员工净实领工资 ≠ 雇主总成本；员工自付的 EPF / SOCSO / EIS 已含在应发薪资内，不再加',
            '已发薪（POSTED）月份以薪资记录为准；未发薪按人事底薪与现有法定供款规则推算，不自动计入未确认的 OT',
            costs.excludedPayrollLike > 0
                ? `损益中的薪资类支出 RM ${round2(costs.excludedPayrollLike - partTime).toFixed(2)}（薪资、EPF、SOCSO、预支等）与上面是同一笔钱，已排除`
                : '损益中没有另外入账的薪资类支出',
            costs.otherLabour > 0 ? `另计员工餐、宿舍 RM ${round2(costs.otherLabour).toFixed(2)}（不在薪资单里）` : '',
            partTime > 0 ? `另计兼职工资 RM ${partTime.toFixed(2)}（兼职不在薪资单 details 里，从上面排除的薪资类支出中取回）` : '',
        ].filter(Boolean),
        sources: labourSources,
        rows: [
            ...Object.entries(labour.byDept).sort((a, b) => b[1] - a[1]).map(([dept, amount]) => ({ label: `部门 ${dept}`, amount: round2(amount) })),
            ...(costs.otherLabour > 0 ? [{ label: '员工餐、宿舍', amount: round2(costs.otherLabour) }] : []),
            ...(partTime > 0 ? [{ label: '兼职工资', amount: partTime }] : []),
        ],
    };
    kpis.labourRatio = {
        key: 'labourRatio',
        label: '人工成本率',
        value: revenue > 0 ? labourTotal / revenue : null,
        unit: 'PCT',
        status: revenue > 0 ? (labourStatus === 'CONFIRMED' && revenueStatus === 'CONFIRMED' ? 'CONFIRMED' : labourStatus === 'INCOMPLETE' ? 'INCOMPLETE' : 'ESTIMATED') : 'INCOMPLETE',
        statusNote: revenue > 0 ? '人工总成本 ÷ 营业额' : '没有营业额，无法计算',
        basis: ['人工总成本 ÷ 营业额（同一期间）'],
        sources: [...settlementSources, ...labourSources],
        rows: [],
    };

    // ── 利润 ──
    const grossProfit = round2(revenue - costs.food - costs.platform);
    const netProfit = round2(grossProfit - labourTotal - costs.opex);
    // 外送平台款项未对账时，平台扣款是预估值，利润不能算「已确认」
    const platformReconciled = !input.adjustments || input.adjustments.unreconciledPlatformDays === 0;
    const allConfirmed = [revenueStatus, foodStatus, labourStatus].every(s => s === 'CONFIRMED') && periodFinished && costs.opex > 0 && platformReconciled;
    const profitBasis = [
        '毛利 = 营业额 − 食材采购 − 外送平台抽佣与广告',
        '净利 = 毛利 − 人工总成本 − 其他经营费用（租金、水电、杂项等）',
        '不计入：资本支出、押金、股东股息（非经营项目）；损益中的薪资类支出（已由人工总成本计算）',
        input.accountingMode === 'ACCRUAL' ? '口径：业务发生制（按账单日期，与财务报表预设相同）' : '口径：现金制（按实际付款）',
        (input.excludedDuplicatePayments || 0) > 0
            ? `已排除应付账款分期付款列 RM ${round2(input.excludedDuplicatePayments || 0).toFixed(2)}：原账单已按全额计入，避免重复扣除（财务报表目前仍会计入，与本页相差此数）`
            : '',
        ...(adj
            ? [
                `外送平台扣款按「总额 − 实收」计算；未对账的 ${adj.unreconciledPlatformDays} 个平台日按「总额 −（净额 − 广告）」预估`,
                adj.bankFees > 0 ? `已计入收款手续费 RM ${adj.bankFees.toFixed(2)}（${adj.bankFeeCount} 笔对账差额，TNG / 卡 / DuitNow）` : '',
                adj.pettyCash > 0 ? `已计入日结钱箱现金支出 RM ${adj.pettyCash.toFixed(2)}（${adj.pettyCashCount} 笔，未分类，列入其他经营费用）。若同一笔也在应付账款登记，会重复，请告知` : '期间内没有日结钱箱现金支出',
            ]
            : [input.pettyCash > 0 ? `日结钱箱现金支出 RM ${round2(input.pettyCash).toFixed(2)} 没有分类，未计入` : '期间内没有日结钱箱现金支出']),
        input.otherModeNetProfit !== undefined && input.otherModeNetProfit !== null
            ? `${input.accountingMode === 'ACCRUAL' ? '现金制' : '业务发生制'}下的净利为 RM ${input.otherModeNetProfit.toFixed(2)}（差额 RM ${(input.otherModeNetProfit - netProfit).toFixed(2)}：业务发生制按账单日期计入未付账单，现金制只算已付款）`
            : '',
    ];
    const profitBasisClean = profitBasis.filter(Boolean);
    const profitRows: KpiDetailRow[] = [
        { label: '营业额', amount: revenue },
        { label: '− 食材采购', amount: -round2(costs.food) },
        { label: '− 外送平台抽佣与广告', amount: -round2(costs.platform) },
        { label: '= 毛利', amount: grossProfit },
        { label: '− 人工总成本', amount: -labourTotal },
        { label: '− 其他经营费用', amount: -round2(costs.opex) },
        { label: '= 净利', amount: netProfit },
        ...(adj ? reconciliationRows(adj, input.excludedDuplicatePayments || 0) : []),
    ];
    kpis.actualProfit = {
        key: 'actualProfit',
        label: allConfirmed ? '实际利润（已确认）' : '截至目前利润（未确认）',
        value: netProfit,
        unit: 'RM',
        status: allConfirmed ? 'CONFIRMED' : revenueStatus === 'INCOMPLETE' || labourStatus === 'INCOMPLETE' ? 'INCOMPLETE' : periodFinished ? 'PENDING_CLOSE' : 'ESTIMATED',
        statusNote: allConfirmed
            ? '期间已结束，日结、薪资、费用均已入账'
            : [
                !periodFinished ? '期间未结束' : '',
                revenueStatus !== 'CONFIRMED' ? `营业额：${revenueStatusNote}` : '',
                labourStatus !== 'CONFIRMED' ? `人工：${kpis.labour.statusNote}` : '',
                costs.opex === 0 ? '没有其他经营费用记录（租金、水电…）' : '',
                !platformReconciled ? `外送平台 ${input.adjustments!.unreconciledPlatformDays} 个平台日未对账（扣款为预估）` : '',
            ].filter(Boolean).join('；'),
        basis: profitBasisClean,
        sources: [...settlementSources, ...expenseSources, ...labourSources],
        rows: profitRows,
    };
    kpis.grossMargin = {
        key: 'grossMargin',
        label: '毛利率',
        value: revenue > 0 ? grossProfit / revenue : null,
        unit: 'PCT',
        status: revenue > 0 ? (foodStatus === 'INCOMPLETE' ? 'INCOMPLETE' : kpis.actualProfit.status === 'CONFIRMED' ? 'CONFIRMED' : 'ESTIMATED') : 'INCOMPLETE',
        statusNote: foodStatus === 'INCOMPLETE' ? '缺食材采购记录，毛利率会偏高' : '毛利 ÷ 营业额',
        basis: ['（营业额 − 食材采购 − 平台抽佣与广告）÷ 营业额'],
        sources: [...settlementSources, ...expenseSources],
        rows: [],
    };
    kpis.netMargin = {
        key: 'netMargin',
        label: '净利率',
        value: revenue > 0 ? netProfit / revenue : null,
        unit: 'PCT',
        status: revenue > 0 ? kpis.actualProfit.status : 'INCOMPLETE',
        statusNote: '净利 ÷ 营业额',
        basis: ['净利 ÷ 营业额'],
        sources: kpis.actualProfit.sources,
        rows: [],
    };

    // ── 本月累计、预计月底利润、保本（以期间末所在的月份计算） ──
    const month = period.end.slice(0, 7);
    const dim = daysInMonth(month);
    const monthRevenue = revenueOf(input.monthPnl);
    const monthCosts = applyAdjustments(splitCosts(input.monthPnl.costByCategory), input.monthPnl.costByCategory, input.monthAdjustments);
    const monthLabourAmount = round2(input.monthLabour.reduce((s, c) => s + c.employerCost, 0) + monthCosts.otherLabour + (input.monthPartTimeWages || 0));
    const monthSettledDays = Object.keys(input.monthDailyRevenue).filter(d => d.startsWith(month)).length;
    const monthElapsed = input.today.slice(0, 7) === month ? Number(input.today.slice(8, 10)) : input.today.slice(0, 7) > month ? dim : 0;
    const monthFinished = input.today.slice(0, 7) > month;
    const be = calcBreakEven({
        revenue: monthRevenue,
        variableCost: monthCosts.food + monthCosts.platform,
        fixedCost: monthLabourAmount + monthCosts.opex,
        daysElapsed: monthSettledDays,
        daysInPeriod: dim,
    });
    const projectedRevenue = monthSettledDays > 0 && monthSettledDays < dim ? (monthRevenue / monthSettledDays) * dim : monthRevenue;
    const contribution = 1 - (monthRevenue > 0 ? (monthCosts.food + monthCosts.platform) / monthRevenue : 0);
    const projectedProfit = monthSettledDays > 0 ? round2(projectedRevenue * contribution - monthLabourAmount - monthCosts.opex) : null;
    const monthStatus: CockpitStatus = monthSettledDays === 0 ? 'INCOMPLETE' : monthFinished && monthSettledDays === dim ? 'CONFIRMED' : 'ESTIMATED';
    const monthNote = monthSettledDays === 0 ? '本月还没有日结' : `${month} 已有 ${monthSettledDays}/${dim} 天日结`;
    const monthBasisVariable = `变动成本率 ${(100 - contribution * 100).toFixed(1)}%（本月食材采购 + 平台抽佣与广告 ÷ 本月营业额，非预设比例）`;
    const monthBasisFixed = `固定成本 RM ${round2(monthLabourAmount + monthCosts.opex).toFixed(2)} = 人工 RM ${monthLabourAmount.toFixed(2)} + 其他经营费用 RM ${round2(monthCosts.opex).toFixed(2)}`;

    kpis.monthRevenue = {
        key: 'monthRevenue',
        label: monthFinished ? `${month} 整月营业额` : '本月累计营业额',
        value: monthRevenue,
        unit: 'RM',
        status: monthSettledDays === 0 ? 'INCOMPLETE' : monthSettledDays >= monthElapsed ? (monthFinished ? 'CONFIRMED' : 'PENDING_CLOSE') : 'INCOMPLETE',
        statusNote: monthNote,
        basis: [monthFinished ? `${month} 整月所有日结，口径同「营业额」` : '本月 1 日至今所有日结，口径同「营业额」', '以日期范围查询整月日结（不受「最近 30 笔」限制）'],
        sources: settlementSources,
        rows: [{ label: '日均（已日结天数）', amount: monthSettledDays ? round2(monthRevenue / monthSettledDays) : 0 }],
    };
    kpis.projectedProfit = {
        key: 'projectedProfit',
        label: monthFinished ? `${month} 月底利润` : '预计月底利润',
        value: projectedProfit,
        unit: 'RM',
        status: projectedProfit === null ? 'INCOMPLETE' : monthStatus === 'CONFIRMED' ? 'CONFIRMED' : 'ESTIMATED',
        statusNote: projectedProfit === null ? '本月还没有日结，无法预测' : monthStatus === 'CONFIRMED' ? '月份已结束' : '预估值，不是已结算利润',
        basis: [
            `预计整月营业额 = 本月日均 × ${dim} 天 = RM ${round2(projectedRevenue).toFixed(2)}`,
            monthBasisVariable,
            monthBasisFixed + '（以已入账为准，未推估尚未入账的费用）',
            '预计月底利润 = 预计营业额 × (1 − 变动成本率) − 固定成本',
        ],
        sources: [...settlementSources, ...expenseSources, ...labourSources],
        rows: [
            { label: '预计整月营业额', amount: round2(projectedRevenue) },
            { label: '− 变动成本（按本月比率）', amount: -round2(projectedRevenue * (1 - contribution)) },
            { label: '− 人工', amount: -monthLabourAmount },
            { label: '− 其他经营费用（已入账）', amount: -round2(monthCosts.opex) },
        ],
    };
    const breakEvenOk = be.isValid && monthCosts.opex + monthLabourAmount > 0;
    kpis.breakEvenMonth = {
        key: 'breakEvenMonth',
        label: '每月保本营业额',
        value: breakEvenOk ? round2(be.revenueNeeded) : null,
        unit: 'RM',
        status: !breakEvenOk ? 'INCOMPLETE' : monthStatus === 'CONFIRMED' && monthCosts.food > 0 ? 'CONFIRMED' : 'ESTIMATED',
        statusNote: !breakEvenOk ? '缺营业额或成本资料，无法计算' : monthCosts.food === 0 ? '本月没有食材采购记录，保本额会偏低' : '依本月实际成本结构计算',
        basis: ['保本营业额 = 固定成本 ÷ (1 − 变动成本率)', monthBasisFixed, monthBasisVariable, '人工视为固定成本（餐饮业通用、较保守）'],
        sources: [...settlementSources, ...expenseSources, ...labourSources],
        rows: [
            { label: '固定成本：人工', amount: monthLabourAmount },
            { label: '固定成本：其他经营费用', amount: round2(monthCosts.opex) },
            { label: '变动成本：食材采购', amount: round2(monthCosts.food) },
            { label: '变动成本：平台抽佣与广告', amount: round2(monthCosts.platform) },
        ],
    };
    kpis.breakEvenDay = {
        key: 'breakEvenDay',
        label: '每日保本营业额',
        value: breakEvenOk ? round2(be.dailyNeeded) : null,
        unit: 'RM',
        status: kpis.breakEvenMonth.status,
        statusNote: `每月保本额 ÷ ${dim} 天${breakEvenOk && be.dailyNeededForRest > 0 ? `；剩余天数每天需 RM ${round2(be.dailyNeededForRest).toFixed(2)}` : ''}`,
        basis: [`每月保本营业额 ÷ 当月天数（${dim}）`, '营业天数设定（休息日）将在保本模拟器（PR D）中调整'],
        sources: kpis.breakEvenMonth.sources,
        rows: [],
    };
    const targetToDate = breakEvenOk ? (be.revenueNeeded / dim) * monthSettledDays : null;
    kpis.breakEvenGap = {
        key: 'breakEvenGap',
        label: '与保本目标差额',
        value: targetToDate === null ? null : round2(monthRevenue - targetToDate),
        unit: 'RM',
        status: targetToDate === null ? 'INCOMPLETE' : 'ESTIMATED',
        statusNote: targetToDate === null ? '无法计算保本额' : `比较 ${monthSettledDays} 天已日结营业额与同天数保本目标（正数 = 超过保本）`,
        basis: ['差额 = 本月累计营业额 − 每日保本营业额 × 已日结天数'],
        sources: kpis.breakEvenMonth.sources,
        rows: targetToDate === null ? [] : [
            { label: '本月累计营业额', amount: monthRevenue },
            { label: '同期保本目标', amount: round2(targetToDate) },
        ],
    };

    // ── 走势（期间每天；不足 7 天时显示截至期末的近 14 天）──
    const trendStart = period.days >= 7 ? period.start : addDays(period.end, -13);
    const fixedPerDay = dim > 0 ? (monthLabourAmount + monthCosts.opex) / dim : 0;
    const trend: CockpitResult['trend'] = [];
    for (let d = trendStart; d <= period.end && trend.length < 62; d = addDays(d, 1)) {
        const rev = input.dailyRevenue[d];
        trend.push({
            date: d,
            revenue: rev === undefined ? null : round2(rev),
            contribution: rev === undefined || !breakEvenOk ? null : round2(rev * contribution - fixedPerDay),
        });
    }

    // ── 预警（基础规则；完整预警中心在 PR E）──
    const alerts: CockpitResult['alerts'] = [];
    if (pastMissing.length > 0) {
        alerts.push({ level: 'HIGH', title: '有营业日未提交日结', detail: revenueStatusNote, kpi: 'revenue' });
    }
    if (projectedProfit !== null && projectedProfit < 0 && !monthFinished) {
        alerts.push({ level: 'HIGH', title: '照目前趋势，本月预计亏损', detail: `预计月底利润 RM ${projectedProfit.toFixed(2)}`, kpi: 'projectedProfit' });
    }
    if (kpis.breakEvenGap.value !== null && kpis.breakEvenGap.value < 0) {
        alerts.push({ level: 'NORMAL', title: '营业额落后保本进度', detail: `落后 RM ${Math.abs(kpis.breakEvenGap.value).toFixed(2)}`, kpi: 'breakEvenGap' });
    }
    if (!adj && input.pettyCash > 0) alerts.push({ level: 'NORMAL', title: '日结钱箱支出未计入利润', detail: `RM ${round2(input.pettyCash).toFixed(2)} 没有分类`, kpi: 'actualProfit' });
    if (adj && adj.unreconciledPlatformDays > 0) alerts.push({ level: 'NORMAL', title: '外送平台款项尚未对账', detail: `${adj.unreconciledPlatformDays} 个平台日未对账，平台扣款为预估`, kpi: 'actualProfit' });
    if (labour.missing > 0) alerts.push({ level: 'NORMAL', title: '有员工没有底薪资料', detail: `${labour.missing} 人次未计入人工成本`, kpi: 'labour' });
    if (costs.food === 0 && revenue > 0) alerts.push({ level: 'NORMAL', title: '期间内没有食材采购记录', detail: '毛利与保本额可能失真', kpi: 'food' });

    // ── 自动摘要（依系统计算，非 AI；AI 简报在 PR F）──
    const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
    const briefing: string[] = [];
    briefing.push(`${period.label}：营业额 ${rm(revenue)}（${COCKPIT_STATUS_LABEL[revenueStatus]}），${allConfirmed ? '实际' : '截至目前'}净利 ${rm(netProfit)}。`);
    if (revenue > 0) briefing.push(`人工成本率 ${((labourTotal / revenue) * 100).toFixed(1)}%，食材采购成本率 ${((costs.food / revenue) * 100).toFixed(1)}%。`);
    if (projectedProfit !== null && !monthFinished) briefing.push(`照本月日均，预计月底利润 ${rm(projectedProfit)}（预估）。`);
    if (kpis.breakEvenGap.value !== null) briefing.push(kpis.breakEvenGap.value >= 0 ? `目前超过保本进度 ${rm(kpis.breakEvenGap.value)}。` : `目前落后保本进度 ${rm(-kpis.breakEvenGap.value)}。`);
    if (alerts.some(a => a.level === 'HIGH')) briefing.push(`需要留意：${alerts.filter(a => a.level === 'HIGH').map(a => a.title).join('、')}。`);

    return {
        period,
        accountingMode: input.accountingMode,
        loadedAt: input.loadedAt,
        kpis,
        order: ['actualProfit', 'monthRevenue', 'projectedProfit', 'grossMargin', 'netMargin', 'labour', 'labourRatio', 'food', 'foodRatio', 'breakEvenDay', 'breakEvenMonth', 'breakEvenGap', 'revenue'],
        trend,
        alerts,
        briefing,
        missingDays: coverage.missingDays,
        extras: {
            grossProfit,
            partTime,
            otherLabour: round2(costs.otherLabour),
            dailyRevenue: input.dailyRevenue,
            monthBaseline: (() => {
                const ot = round2(input.monthLabour.reduce((sum, c) => sum + (c.overtime || 0), 0));
                const rent = round2(monthCosts.rows.opex.filter(r => r.label.toUpperCase().includes('RENT')).reduce((sum, r) => sum + r.amount, 0));
                return {
                    month,
                    daysInMonth: dim,
                    settledDays: monthSettledDays,
                    projectedRevenue: round2(projectedRevenue),
                    foodRate: monthRevenue > 0 ? monthCosts.food / monthRevenue : 0,
                    platformRate: monthRevenue > 0 ? monthCosts.platform / monthRevenue : 0,
                    labourExOt: round2(monthLabourAmount - ot),
                    ot,
                    rent,
                    otherFixed: round2(monthCosts.opex - rent),
                    headcount: input.monthLabour.filter(c => c.employerCost > 0).length,
                };
            })(),
        },
        integrity: [
            { label: '每日结算', ok: pastMissing.length === 0, detail: pastMissing.length ? `缺 ${pastMissing.length} 天` : `${coverage.settled} 天齐全${todayPending ? '（今天尚未日结）' : ''}` },
            ...(adj ? [{ label: '外送平台对账', ok: adj.unreconciledPlatformDays === 0, detail: adj.unreconciledPlatformDays ? `${adj.unreconciledPlatformDays} 个平台日未对账，扣款为预估` : '已全部对账或无平台营业额' }] : []),
            { label: '薪资', ok: labour.estimated === 0 && labour.missing === 0, detail: labour.estimated || labour.missing ? kpis.labour.statusNote : '全部以已发放薪资为准' },
            { label: '经营费用', ok: costs.opex > 0, detail: costs.opex > 0 ? `已入账 RM ${round2(costs.opex).toFixed(2)}` : '没有租金、水电等费用记录' },
            { label: '食材采购', ok: costs.food > 0, detail: costs.food > 0 ? `已入账 RM ${round2(costs.food).toFixed(2)}（采购口径）` : '没有食材采购记录' },
            ...(adj ? [{ label: '日结钱箱支出', ok: true, detail: adj.pettyCash ? `已计入 RM ${adj.pettyCash.toFixed(2)}（未分类）` : '无' }] : []),
            { label: '分期付款去重', ok: true, detail: (input.excludedDuplicatePayments || 0) > 0 ? `已排除重复 RM ${round2(input.excludedDuplicatePayments || 0).toFixed(2)}` : '无重复' },
        ],
    };
};

/** 每天的营业额（P&L 口径），给走势图与日结覆盖率用 */
export const dailyRevenueFromSettlements = (settlements: { date?: string; sales?: any }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    settlements.forEach(s => {
        const d = String(s.date || '').slice(0, 10);
        if (!d) return;
        const sales = s.sales || {};
        const b = sales.deliveryBreakdown || {};
        const pos = ['cash', 'tng', 'duitnow', 'card', 'amex'].reduce((sum, k) => sum + (Number(sales[k]) || 0), 0) - (Number(sales.refundTotal) || 0);
        // 与 aggregateMonth 相同：Grab 只取 grabGross；Panda / Shopee 无总额时退回旧栏位
        const platform = (Number(b.grabGross) || 0) + (Number(b.pandaGross) || Number(b.panda) || 0) + (Number(b.shopeeGross) || Number(b.shopee) || 0) + (Number(b.lalamove) || 0);
        out[d] = (out[d] || 0) + pos + platform;
    });
    return out;
};

/** 与财务报表口径的差异（驾驶舱净利 = 财务报表口径净利 + 下列差异；人工口径另计） */
export const reconciliationRows = (adj: ProfitAdjustments, duplicatePayments: number): KpiDetailRow[] => {
    const rows: KpiDetailRow[] = [];
    const platformDiff = round2(adj.platformCost - adj.platformCostReport);
    if (platformDiff !== 0) rows.push({ label: '对账：平台扣款修正（未对账日的广告等）', amount: -platformDiff, note: `财务报表算法 RM ${adj.platformCostReport.toFixed(2)}，驾驶舱 RM ${adj.platformCost.toFixed(2)}` });
    if (adj.bankFees) rows.push({ label: '对账：收款手续费（财务报表未计入）', amount: -adj.bankFees });
    if (adj.pettyCash) rows.push({ label: '对账：日结钱箱支出（财务报表未计入）', amount: -adj.pettyCash });
    if (duplicatePayments) rows.push({ label: '对账：分期付款重复（财务报表重复扣除，驾驶舱已排除）', amount: round2(duplicatePayments) });
    return rows;
};
