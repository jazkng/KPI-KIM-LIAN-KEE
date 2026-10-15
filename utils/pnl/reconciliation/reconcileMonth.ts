// ============================================================================
// 盈亏对账（PR 1）· 同一个月、同一份资料，各套算法的经营盈亏与逐项差异来源
// ----------------------------------------------------------------------------
// 只读：一次读取该月的日结、固定账单付款、独立支出、薪资、员工、固定账单设定，
// 交给四套现有算法各算一次，再列出每一项差异来自哪些记录。
//   A 财务报表首页（照抄，legacyFinancialReport.ts）
//   B 传统账目（画面：A 的分类结果 → buildClassicPnL；多月份导出：aggregateMonth → buildClassicPnL）
//   C 老板驾驶舱（loadCockpitWith，现有程序）
//   D 经营日报（照抄，legacyDailyReport.ts，逐日加总，仅供说明）
// 驾驶舱只是拟采用的起点，**不当作正确答案**；它自己的缺口在「薪资字段核对」与「待确认」中列出。
// 不写入任何资料。
// ============================================================================
import { aggregateMonth, categorizeExpense, splitAccrualDuplicatePayments } from '../../monthlyPnLAggregator';
import { buildClassicPnL } from '../../classicPnLBuilder';
import { CLASSIC_COST_LINES, MAPPED_CAT_KEYS } from '../../../constants/classicPnLCostMap';
import { loadCockpitWith, loadParentBillsWith, type CockpitDataSource } from '../../cockpit/cockpitLoader';
import { computeProfitAdjustments } from '../../cockpit/profitAdjustments';
import { addDays, daysInMonth, resolvePeriod } from '../../cockpit/periods';
import { legacyFinancialReport, type LegacyFinancialReportResult } from './legacyFinancialReport';
import { legacyDailyReportRange } from './legacyDailyReport';
import { checkPayrollMonth, type PayrollMonthCheck } from './payrollFieldCheck';
import { checkPettyCash, PETTY_CASH_MATCH_LABEL, PETTY_CASH_USE_LABEL, type PettyCashCheck, type PettyCashMatchType, type PettyCashUse } from './pettyCashCheck';

export interface ReconSource extends CockpitDataSource {
    getRecurringBills(): Promise<any[]>;
}

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 + 0;

export interface ReconLine {
    revenue: number;
    platform: number;
    food: number;
    labour: number;
    opex: number;
    netProfit: number;
}

export interface ReconRecord {
    date: string;
    label: string;
    amount: number;
    note?: string;
}

export interface ReconFinding {
    id: string;
    title: string;
    /** 一两句话说明：哪套算法怎么处理、建议口径怎么处理 */
    detail: string;
    amount: number;
    count: number;
    /** 对各算法净利的影响（相对驾驶舱 C）：正数 = 该算法净利因此比 C 高 */
    effectOnA?: number;
    effectOnB?: number;
    /** 需要负责人决定或核对，引擎不自动处理 */
    needsDecision?: boolean;
    records: ReconRecord[];
}

export interface ReconBridgeRow { label: string; amount: number }

export interface MonthReconciliation {
    month: string;
    start: string;
    end: string;
    loadedAt: string;
    counts: { settlements: number; standaloneExpenses: number; billPayments: number; payrollRecords: number; employees: number; recurringBills: number };
    algorithms: {
        A: ReconLine & { labourSource: LegacyFinancialReportResult['labourSource']; settledDays: number; daysInMonth: number; baseMonthlyLabour: number };
        B: ReconLine & { selling: number; personal: number; operation: number; cost: number; exportNetProfit: number };
        C: ReconLine & { status: string; statusNote: string };
        D: { sum: number; days: number; estimatedFoodDays: number; estimatedFoodAmount: number; sample: { date: string; netProfit: number } | null };
    };
    bridgeA: ReconBridgeRow[];
    bridgeB: ReconBridgeRow[];
    unexplainedA: number;
    unexplainedB: number;
    findings: ReconFinding[];
    payroll: PayrollMonthCheck | null;
    pettyCash: PettyCashCheck;
    categories: { category: string; amount: number; financialReport: string; classicLine: string; cockpit: string; flag?: string }[];
    missingSettlementDays: string[];
}

const COGS_LINE_KEYS = new Set(CLASSIC_COST_LINES.filter(l => l.section === 'COST').flatMap(l => l.sources));
const classicLineOf = (key: string) => CLASSIC_COST_LINES.find(l => l.sources.includes(key));
const cockpitGroupOf = (key: string) => {
    const g = categorizeExpense(key);
    if (g === 'COGS') return '食材';
    if (g === 'DELIVERY_COST' || key.startsWith('PLATFORM_')) return '平台';
    if (g === 'OPEX') return '其他经营费用';
    if (g === 'LABOR') return ['STAFF_MEAL', 'STAFF_ACCOMMODATION'].some(k => key.includes(k)) ? '人工（另计）' : '人工（以薪资单为准，此笔不计）';
    if (g === 'IGNORE') return '不计（转账 / 调整）';
    return '不计（资本支出 / 押金 / 分红）';
};
const frGroupLabel: Record<string, string> = {
    COGS: '食材', LABOR: '人工', OPEX: '经营费用', DELIVERY_COST: '平台费用', CAPEX: '资本支出（不计）', ASSET: '押金 / 借款（不计）', DIVIDEND: '分红（不计）', IGNORE: '不计（转账 / 调整）',
};

const mytDateOf = (value: unknown): string | null => {
    const s = String(value || '');
    if (!/T\d{2}:\d{2}/.test(s) || !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;
    const t = new Date(s).getTime();
    if (!Number.isFinite(t)) return null;
    return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
};

/** 支出列的显示名称：有供应商写供应商（附分类），没有就只写分类 */
const expenseLabel = (e: any) => {
    const who = e?.company || e?.note;
    return who ? `${who}（${e?.category || '未分类'}）` : String(e?.category || '未分类');
};

const normaliseCompany = (s: unknown) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');

export const reconcileMonth = async (source: ReconSource, month: string, today: string): Promise<MonthReconciliation> => {
    const dim = daysInMonth(month);
    const start = `${month}-01`;
    const end = `${month}-${String(dim).padStart(2, '0')}`;
    const dayBefore = addDays(start, -1);
    const [raw, employees, payrollRecords, recurringBills, rawDayBefore] = await Promise.all([
        source.getPnLRawRange(start, end),
        source.getEmployees(),
        source.getPayrollRecords(),
        source.getRecurringBills().catch(() => [] as any[]),
        // 只给「UTC 切日」检查用：马来西亚日期在本月 1 日、却被存成上个月最后一天的记录
        source.getPnLRawRange(dayBefore, dayBefore).catch(() => ({ settlements: [], billPayments: [], standaloneExpenses: [] })),
    ]);
    const settlements = raw.settlements as any[];
    const standalone = raw.standaloneExpenses as any[];
    const billPayments = raw.billPayments as any[];
    const data = { settlements, standaloneExpenses: standalone, billPayments, payrollRecords: payrollRecords as any[], employees: employees as any[] };

    // ── A ──
    const A = legacyFinancialReport(data, start, end, 'ACCRUAL');

    // ── B（画面与多月份导出）──
    const classicInput = (costByCategory: Record<string, number>, platformGross: any, inStoreSales: number, laborByDept: Record<string, number>) => buildClassicPnL({
        month, storehub: null, platformGross, costByCategory, viewMode: 'DETAILED', channelMode: 'IN_STORE',
        includeCost: true, costDetailMode: 'DETAILED', laborByDept, inStoreSales,
    } as any);
    const agg = aggregateMonth(month, data as any, 'ACCRUAL');
    const B = classicInput(A.classicCostByCategory, A.platformGross, A.inStoreSales, agg.laborByDept);
    const Bexport = classicInput(agg.costByCategory, agg.platformGross, agg.inStoreSales, agg.laborByDept);

    // ── C：只读一次，驾驶舱从同一份资料取（期间外的才向来源要） ──
    const cachedSource: CockpitDataSource = {
        getPnLRawRange: (s, e) => (s >= start && e <= end
            ? Promise.resolve({
                settlements: settlements.filter(x => { const d = String(x.date || '').slice(0, 10); return d >= s && d <= e; }),
                billPayments: billPayments.filter(x => { const d = String(x.date || '').slice(0, 10); return d >= s && d <= e; }),
                standaloneExpenses: standalone,
            })
            : source.getPnLRawRange(s, e)),
        getEmployees: async () => employees,
        getPayrollRecords: async () => payrollRecords,
        getAttendanceReviewsByMonth: m => source.getAttendanceReviewsByMonth(m),
        getStandaloneExpensesByIds: ids => source.getStandaloneExpensesByIds(ids),
    };
    const period = resolvePeriod('CUSTOM', today, { start, end });
    const cockpit = await loadCockpitWith(cachedSource, period, today, 'ACCRUAL');
    const rowAmount = (label: string) => -num(cockpit.kpis.actualProfit.rows.find(r => r.label === label)?.amount);
    const C: ReconLine & { status: string; statusNote: string } = {
        revenue: num(cockpit.kpis.revenue.value),
        platform: r2(rowAmount('− 外送平台抽佣与广告')),
        food: num(cockpit.kpis.food.value),
        labour: num(cockpit.kpis.labour.value),
        opex: r2(rowAmount('− 其他经营费用')),
        netProfit: num(cockpit.kpis.actualProfit.value),
        status: cockpit.kpis.actualProfit.status,
        statusNote: cockpit.kpis.actualProfit.statusNote,
    };

    // ── D ──
    const D = legacyDailyReportRange(settlements, standalone, start, end);

    // ── 差异来源 ──
    const findings: ReconFinding[] = [];
    const adj = computeProfitAdjustments(settlements, standalone, start, end);
    const inMonth = (d: unknown) => { const x = String(d || '').split('T')[0]; return x >= start && x <= end; };

    // 1. 应付账款分期付款重复
    const parents = await loadParentBillsWith(cachedSource, standalone, 'ACCRUAL');
    const { removed } = splitAccrualDuplicatePayments(standalone, 'ACCRUAL', parents);
    const dupRows = removed.filter((e: any) => inMonth(e.time) && !e.settlementId);
    const catOf = (e: any) => String(e.category || 'OTHER').toUpperCase();
    const dupOperating = dupRows.filter((e: any) => ['COGS', 'OPEX', 'DELIVERY_COST'].includes(categorizeExpense(catOf(e))));
    const sumAmt = (rows: any[]) => r2(rows.reduce((s, e: any) => s + num(e.amount), 0));
    const dupAmount = sumAmt(dupOperating);
    // 平台类（DELIVERY_COST）的重复已反映在「平台扣款」那一行，差额桥只拆食材与经营费用
    const dupFoodOpex = dupOperating.filter((e: any) => categorizeExpense(catOf(e)) !== 'DELIVERY_COST');
    const dupBridge = sumAmt(dupFoodOpex);
    const dupMappedInClassic = sumAmt(dupFoodOpex.filter((e: any) => MAPPED_CAT_KEYS.has(catOf(e))));
    findings.push({
        id: 'DUP_INSTALMENT',
        title: '应付账款分期付款被重复计入',
        detail: '原账单已按全额（totalBillAmount）计入；第二次以后付款另建的 pay_ 列，财务报表与传统账目又再计一次。驾驶舱与建议口径不计。',
        amount: dupAmount, count: dupOperating.length, effectOnA: -dupAmount, effectOnB: -dupMappedInClassic,
        records: dupOperating.map((e: any) => ({ date: String(e.time).slice(0, 10), label: expenseLabel(e), amount: num(e.amount), note: `原账单 ${String(e.id).slice(4, String(e.id).lastIndexOf('_'))}` })),
    });

    // 2. 外送平台未对账日的广告
    const platformGap = r2(adj.platformCost - adj.platformCostReport);
    findings.push({
        id: 'PLATFORM_UNRECONCILED',
        title: '外送平台未对账日的扣款',
        detail: `${adj.unreconciledPlatformDays} 个「日 × 平台」尚未对账。未对账时财务报表用「总额 − 净额」，净额尚未扣广告，所以广告没被扣到；驾驶舱用「总额 −（净额 − 广告）」，并标为预估。对账后以实收为准，两者一致。`,
        amount: platformGap, count: adj.unreconciledPlatformDays, effectOnA: platformGap,
        records: settlements
            .filter(s => inMonth(s.date))
            .flatMap(s => (['grab', 'panda', 'shopee'] as const)
                .filter(ch => typeof s.reconStatus?.[ch] !== 'number' && num(s.sales?.deliveryBreakdown?.[`${ch}Ads`]) > 0)
                .map(ch => ({ date: String(s.date).slice(0, 10), label: `${ch} 未对账，广告`, amount: num(s.sales.deliveryBreakdown[`${ch}Ads`]) }))),
    });

    // 3. 钱箱支出：逐笔列出，并找出与兼职、预支、应付账款同金额的疑似同一笔
    const pettyCash = checkPettyCash(settlements, standalone, start, end);
    findings.push({
        id: 'PETTY_CASH',
        title: '日结钱箱现金支出（dayExpenses）',
        detail: `钱已经从钱箱付出，但财务报表与传统账目都没有读取这一栏；驾驶舱计入其他经营费用。按文字粗分：${
            (Object.keys(pettyCash.byUse) as PettyCashUse[]).filter(k => pettyCash.byUse[k].count)
                .map(k => `${PETTY_CASH_USE_LABEL[k]} ${pettyCash.byUse[k].amount.toFixed(2)}（${pettyCash.byUse[k].count} 笔）`).join('、') || '无'}。`,
        amount: adj.pettyCash, count: adj.pettyCashCount, effectOnA: adj.pettyCash, effectOnB: adj.pettyCash,
        records: pettyCash.entries.map(e => ({ date: e.date, label: e.text, amount: e.amount, note: PETTY_CASH_USE_LABEL[e.use] })),
    });
    findings.push({
        id: 'PETTY_CASH_OVERLAP',
        title: '钱箱支出与其他记录同金额（疑似同一笔被记两次）',
        detail: `同一天前后 2 天内、金额完全相同的兼职工资、员工预支或应付账款记录。若确实是同一笔钱（从钱箱拿钱付，又在兼职 / 预支 / 应付账款登记），驾驶舱会重复扣除；若只是巧合同金额，则不必处理。${
            (Object.keys(pettyCash.matched) as PettyCashMatchType[]).filter(k => pettyCash.matched[k].count)
                .map(k => `${PETTY_CASH_MATCH_LABEL[k]} ${pettyCash.matched[k].amount.toFixed(2)}（${pettyCash.matched[k].count} 笔）`).join('、')}`,
        amount: pettyCash.matchedTotal, count: pettyCash.entries.filter(e => e.match).length, needsDecision: pettyCash.matchedTotal > 0,
        records: pettyCash.entries.filter(e => e.match).map(e => ({
            date: e.date, label: e.text, amount: e.amount,
            note: `${PETTY_CASH_MATCH_LABEL[e.match!.type]}：${e.match!.label}（${e.match!.date}）`,
        })),
    });

    // 4. 收款手续费
    findings.push({
        id: 'BANK_FEE',
        title: '收款手续费（对账自动产生的 recon_fee_，TNG / 卡 / DuitNow）',
        detail: '实收少于记账的差额，是真实成本。财务报表与传统账目整批略过；驾驶舱计入。',
        amount: adj.bankFees, count: adj.bankFeeCount, effectOnA: adj.bankFees, effectOnB: adj.bankFees,
        records: standalone.filter(e => String(e.id).startsWith('recon_fee_') && String(e.category).toUpperCase() === 'BANK_FEE' && inMonth(e.time))
            .map(e => ({ date: String(e.time).slice(0, 10), label: String(e.id), amount: num(e.amount) })),
    });

    // 5. 财务报表首页：人工基数取代 LABOR 类支出
    const frLabourExpenseKeys = Object.entries(A.classicCostByCategory)
        .filter(([k]) => categorizeExpense(k) === 'LABOR' && k !== 'PAYROLL' && k !== 'EPF_SOCSO');
    findings.push({
        id: 'FR_LABOUR_EXPENSES_EXCLUDED',
        title: '财务报表首页没有计入的人工类支出',
        detail: '财务报表首页的人工只用「薪资单（或草稿、底薪）× 已日结天数 ÷ 当月天数」，兼职、员工餐、宿舍、预支、津贴等 LABOR 类支出全部不计。',
        amount: A.labourExpensesNotCounted, count: frLabourExpenseKeys.length,
        records: frLabourExpenseKeys.map(([k, v]) => ({ date: month, label: k, amount: r2(v) })),
    });
    if (A.settledDays < A.daysInMonth) {
        findings.push({
            id: 'FR_LABOUR_PRORATION',
            title: '财务报表首页把人工按已日结天数分摊',
            detail: `只有 ${A.settledDays} / ${A.daysInMonth} 天有日结，人工只算 ${A.settledDays} 天的份；缺日结的日子人工成本消失。`,
            amount: r2(A.baseMonthlyLabour - A.labour), count: A.daysInMonth - A.settledDays, records: [],
        });
    }
    if (A.labourSource === 'FALLBACK_57300') {
        findings.push({
            id: 'FR_FALLBACK_57300',
            title: '财务报表首页使用 RM 57,300 人工后备值',
            detail: '这个月没有薪资单、草稿、人工支出，员工档案也没有底薪，财务报表首页用 57,300 代替，画面没有任何标示。统一后删除。',
            amount: 57300, count: 1, records: [],
        });
    }

    // 6. 传统账目：没有对应栏位而消失的分类
    const unmapped = Object.entries(A.classicCostByCategory).filter(([k, v]) =>
        Math.abs(v) > 0.005 && !MAPPED_CAT_KEYS.has(k) && !['DIVIDEND', 'ASSET', 'IGNORE'].includes(categorizeExpense(k)));
    const dupUnmapped = sumAmt(dupFoodOpex.filter((e: any) => !MAPPED_CAT_KEYS.has(catOf(e))));
    const unmappedAmount = r2(unmapped.reduce((s, [, v]) => s + v, 0));
    // 人工类的未对应分类在「人工类支出」那一行处理（驾驶舱多数也不计），这里只算非人工
    const unmappedNonLabour = r2(unmapped.filter(([k]) => categorizeExpense(k) !== 'LABOR').reduce((s, [, v]) => s + v, 0));
    findings.push({
        id: 'CLASSIC_UNMAPPED',
        title: '传统账目没有对应栏位、整笔消失的分类',
        detail: '传统账目只加总对照表里列出的分类，其他分类不进任何一行，也不提示。建议口径：一律进「其他营运费用」并列出。',
        amount: unmappedAmount, count: unmapped.length, effectOnB: r2(unmappedNonLabour - dupUnmapped),
        records: unmapped.map(([k, v]) => ({ date: month, label: k, amount: r2(v) })),
    });

    // 7. 薪资字段核对
    const payrollRecord = (payrollRecords as any[]).find(p => p?.month === month && p?.status === 'POSTED')
        || (payrollRecords as any[]).find(p => p?.month === month);
    const advanceExpenses = standalone.filter(e => String(e.category || '').toUpperCase() === 'STAFF_ADVANCE' && inMonth(e.time))
        .reduce((s, e) => s + num(e.totalBillAmount || e.amount), 0);
    const payroll = payrollRecord ? checkPayrollMonth(payrollRecord, employees as any[], advanceExpenses) : null;
    if (payroll && payroll.status === 'POSTED' && !payroll.isStatutoryPaid && payroll.totalGovtPay > 0) {
        findings.push({
            id: 'CLASSIC_STATUTORY_UNPAID',
            title: '法定供款尚未缴交，传统账目整笔不计',
            detail: '权责发生制下，当月的 EPF / SOCSO / EIS / PCB 不论是否已缴都属于当月人工成本。传统账目只在「已缴」时才计入。',
            amount: payroll.totalGovtPay, count: 1, effectOnB: payroll.totalGovtPay, records: [],
        });
    }
    if (!payrollRecord) {
        findings.push({
            id: 'PAYROLL_MISSING',
            title: '这个月没有薪资单',
            detail: '财务报表首页改用底薪合计（或 57,300），驾驶舱按员工档案底薪与法定供款推算并标为预估。这个月的人工只能算「暂估」。',
            amount: 0, count: 0, needsDecision: true, records: [],
        });
    } else if (payrollRecord.status !== 'POSTED') {
        findings.push({
            id: 'PAYROLL_DRAFT',
            title: '这个月的薪资单还是草稿（未发放）',
            detail: '财务报表首页用草稿「实发 + 法定」，驾驶舱只采用已发放的薪资、其余按底薪推算。发放后两边才会一致；这个月的人工只能算「暂估」。',
            amount: 0, count: 0, needsDecision: true, records: [],
        });
    }
    if (payroll) {
        const t = payroll.totals;
        findings.push({
            id: 'PAYROLL_FIELDS',
            title: '薪资字段核对（无薪假、罚款、预支、津贴）',
            detail: [
                `${payroll.employees.length} 人中 ${payroll.employees.length - payroll.mismatchCount} 人的实发可由字段完全推算${payroll.mismatchCount ? `，${payroll.mismatchCount} 人对不上（不自动采用任何口径）` : ''}。`,
                `无薪假合计 ${t.unpaidLeave.toFixed(2)}、已从实发扣掉的罚款 ${t.penaltyDeducted.toFixed(2)}：驾驶舱目前没有扣，人工因此偏高这两项。`,
                t.penaltyNotDeducted ? `另有罚款 ${t.penaltyNotDeducted.toFixed(2)} 存在薪资单上但没有从实发扣掉，不能当作成本减少。` : '',
                `预支：薪资单扣回 ${t.advanceLoan.toFixed(2)}，当月预支支出 ${payroll.advanceExpenses.toFixed(2)}。`,
                Math.abs(payroll.govtGap) > 0.05 ? `存档 totalGovtPay 与逐人加总差 ${payroll.govtGap.toFixed(2)}。` : '',
            ].filter(Boolean).join(''),
            amount: r2(t.unpaidLeave + t.penaltyDeducted), count: payroll.employees.length, needsDecision: true,
            records: payroll.employees
                .filter(e => e.penaltyStatus === 'MISMATCH' || e.unpaidLeave > 0 || e.penalty > 0 || e.basicBelowProfileWithUnpaidLeave)
                .map(e => ({
                    date: month,
                    label: e.employeeName,
                    amount: e.penaltyStatus === 'MISMATCH' ? e.netPayGap : r2(e.unpaidLeave + (e.penaltyStatus === 'PENALTY_DEDUCTED' ? e.penalty : 0)),
                    note: [
                        e.penaltyStatus === 'MISMATCH' ? `实发对不上，差 ${e.netPayGap.toFixed(2)}` : '',
                        e.unpaidLeave ? `无薪假 ${e.unpaidLeave.toFixed(2)}` : '',
                        e.penalty ? `罚款 ${e.penalty.toFixed(2)}（${e.penaltyStatus === 'PENALTY_DEDUCTED' ? '已扣' : e.penaltyStatus === 'PENALTY_NOT_DEDUCTED' ? '未扣' : '无法判断'}）` : '',
                        e.basicBelowProfileWithUnpaidLeave ? '底薪已低于人事档案又有无薪假，可能重复减少' : '',
                    ].filter(Boolean).join('；'),
                })),
        });
    }

    // 8. 薪资单以外另付的人工类支出（驾驶舱排除，传统账目计入）
    const outsidePayroll = standalone.filter(e => {
        const cat = String(e.category || '').toUpperCase();
        if (!inMonth(e.time) || String(e.id).startsWith('parttime_') || String(e.id).startsWith('payroll_') || String(e.id).startsWith('salary_')) return false;
        if (categorizeExpense(cat) !== 'LABOR') return false;
        return !['STAFF_MEAL', 'STAFF_ACCOMMODATION', 'STAFF_ADVANCE'].some(k => cat.includes(k));
    });
    findings.push({
        id: 'LABOUR_OUTSIDE_PAYROLL',
        title: '薪资单以外另外登记的人工支出（津贴、佣金、薪资…）',
        detail: '驾驶舱视为「已在薪资单里」而不计；传统账目计入。若这些钱是薪资单以外另外付的，应计入人工；若薪资单里已有，就是重复。需逐笔确认。',
        amount: r2(outsidePayroll.reduce((s, e) => s + num(e.totalBillAmount || e.amount), 0)), count: outsidePayroll.length, needsDecision: true,
        records: outsidePayroll.map(e => ({ date: String(e.time).slice(0, 10), label: expenseLabel(e), amount: num(e.totalBillAmount || e.amount) })),
    });

    // 9. 旧日结只有 grab、没有 grabGross
    const legacyGrab = settlements.filter(s => inMonth(s.date)).filter(s => {
        const b = s.sales?.deliveryBreakdown || {};
        return !num(b.grabGross) && (num(b.grabNet) || num(b.grab)) > 0;
    });
    findings.push({
        id: 'LEGACY_GRAB_GROSS',
        title: 'Grab 只有净额、没有总额的日结',
        detail: '四套算法的营业额都只认 grabGross，这几天的 Grab 营业额算成 0（经营日报的营业额除外）。统一后退回旧栏位并标「待核对」。',
        amount: r2(legacyGrab.reduce((s, x) => s + (num(x.sales.deliveryBreakdown.grabNet) || num(x.sales.deliveryBreakdown.grab)), 0)),
        count: legacyGrab.length, needsDecision: true,
        records: legacyGrab.map(s => ({ date: String(s.date).slice(0, 10), label: 'Grab 净额（无总额）', amount: num(s.sales.deliveryBreakdown.grabNet) || num(s.sales.deliveryBreakdown.grab) })),
    });

    // 10. 缺日结
    const lastDay = end < today ? end : addDays(today, -1);
    const settledSet = new Set(settlements.map(s => String(s.date || '').slice(0, 10)));
    const missingSettlementDays: string[] = [];
    for (let d = start; d <= lastDay; d = addDays(d, 1)) if (!settledSet.has(d)) missingSettlementDays.push(d);
    findings.push({
        id: 'MISSING_SETTLEMENT',
        title: '没有日结的日子',
        detail: '没有日结就没有营业额；财务报表首页的人工也按日结天数分摊。若是公休日请注明，否则需补日结。',
        amount: 0, count: missingSettlementDays.length, needsDecision: missingSettlementDays.length > 0,
        records: missingSettlementDays.map(d => ({ date: d, label: '缺日结', amount: 0 })),
    });

    // 11. 固定账单当月没有费用
    const monthNo = Number(month.slice(5, 7));
    const expectedBills = (recurringBills || []).filter((b: any) => b && b.isActive !== false && !b.isArchived
        && (!b.contractStart || String(b.contractStart).slice(0, 7) <= month)
        && (!b.contractEnd || String(b.contractEnd).slice(0, 7) >= month)
        && (b.type === 'MONTHLY' || (b.type === 'YEARLY' && Number(b.dueMonth) === monthNo)));
    const missingBills = expectedBills.filter((b: any) => !billPayments.some(p => p.billId === b.id && inMonth(p.date)));
    findings.push({
        id: 'MISSING_FIXED_COST',
        title: '固定账单这个月没有付款记录',
        detail: '依「经常性支出」的设定，这些账单这个月应该有一笔费用。若是在应付账款另外登记，请在明细中核对；若真的还没入账，这个月的盈亏只能算「暂估」。',
        amount: r2(missingBills.reduce((s: number, b: any) => s + num(b.amount), 0)), count: missingBills.length, needsDecision: missingBills.length > 0,
        records: missingBills.map((b: any) => {
            const cat = String(b.category || '').toUpperCase();
            const apSameCat = standalone.filter(e => inMonth(e.time) && String(e.category || '').toUpperCase().includes(cat === 'ELECTRICITY' ? 'ELECTRIC' : cat === 'WATER' ? 'WATER' : cat));
            return { date: month, label: `${b.name}（${b.category}）`, amount: num(b.amount), note: apSameCat.length ? `应付账款有 ${apSameCat.length} 笔同类费用，可能已在那边登记` : '设定金额，仅供参考' };
        }),
    });

    // 12. 疑似重复登记
    const suspected: ReconRecord[] = [];
    // 同一类费用（租金对租金、电费对电费…）且金额相同，才视为疑似重复
    const familyOf = (cat: unknown): string => {
        const c = String(cat || '').toUpperCase();
        if (c.includes('RENT')) return 'RENT';
        if (c.includes('ELECTRIC')) return 'ELECTRIC';
        if (c.includes('WATER')) return 'WATER';
        for (const k of ['INTERNET', 'WASTE', 'LICENSE', 'SUBSCRIPTION']) if (c.includes(k)) return k;
        return categorizeExpense(c) === 'OPEX' ? 'OTHER_OPEX' : `X_${c}`;
    };
    billPayments.filter(p => inMonth(p.date)).forEach(p => {
        standalone.filter(e => inMonth(e.time) && !String(e.id).startsWith('bill_sync_') && !String(e.id).startsWith('pay_')
            && familyOf(e.category) === familyOf(p.category)
            && Math.abs(num(e.totalBillAmount || e.amount) - num(p.amount)) < 0.01)
            .forEach(e => suspected.push({ date: String(p.date).slice(0, 10), label: `固定账单「${p.name || p.category}」与应付账款「${e.company || e.note || e.category}」金额相同`, amount: num(p.amount) }));
    });
    const groupsByKey = new Map<string, any[]>();
    standalone.filter(e => inMonth(e.time) && !String(e.id).startsWith('pay_') && !String(e.id).startsWith('recon_fee_') && !String(e.id).startsWith('parttime_')).forEach(e => {
        const key = `${normaliseCompany(e.company)}|${String(e.category || '').toUpperCase()}|${num(e.totalBillAmount || e.amount).toFixed(2)}`;
        if (!normaliseCompany(e.company)) return;
        groupsByKey.set(key, [...(groupsByKey.get(key) || []), e]);
    });
    groupsByKey.forEach(list => {
        if (list.length < 2) return;
        const refs = new Set(list.map(e => String(e.invoiceRef || '').trim()).filter(Boolean));
        if (refs.size === list.length) return; // 发票号码都不同，视为不同账单
        suspected.push({ date: String(list[0].time).slice(0, 10), label: `应付账款「${list[0].company}」同金额 ${list.length} 笔（${list[0].category}）`, amount: num(list[0].totalBillAmount || list[0].amount), note: list.map(e => String(e.time).slice(0, 10)).join('、') });
    });
    findings.push({
        id: 'SUSPECTED_DUPLICATE',
        title: '疑似重复登记（不自动删除，请核对）',
        detail: '同一笔费用可能同时在「经常性支出」付款和「应付账款」登记，或同一供应商同金额登记多笔。所有算法都会照算，所以要人工确认。',
        amount: r2(suspected.reduce((s, x) => s + x.amount, 0)), count: suspected.length, needsDecision: suspected.length > 0, records: suspected,
    });

    // 13. 日期以 UTC 切日
    const shiftCandidates = new Map<string, any>();
    [...(rawDayBefore.standaloneExpenses as any[]), ...standalone].forEach(e => shiftCandidates.set(e.id, e));
    const shifted = [
        ...[...shiftCandidates.values()].map(e => ({ when: e.time, label: expenseLabel(e), amount: num(e.totalBillAmount || e.amount) })),
        ...settlements.map(s => ({ when: s.date, label: '日结', amount: 0 })),
    ].flatMap(x => {
        const myt = mytDateOf(x.when);
        const utc = String(x.when || '').split('T')[0];
        if (!myt || myt === utc) return [];
        if (!(inMonth(utc) || inMonth(myt))) return [];
        return [{ date: myt, label: x.label, amount: x.amount, note: `系统按 ${utc} 计；马来西亚日期 ${myt}${utc.slice(0, 7) !== myt.slice(0, 7) ? '（跨月）' : ''}` }];
    });
    findings.push({
        id: 'UTC_DATE',
        title: '日期按 UTC 切日、与马来西亚日期不同的记录',
        detail: '凌晨 00:00–08:00 登记、带时区的时间，系统切日期时会落到前一天；跨月的会算到上个月。建议口径一律用马来西亚日期。',
        amount: r2(shifted.filter(x => x.note.includes('跨月')).reduce((s, x) => s + x.amount, 0)), count: shifted.length, records: shifted,
    });

    // 14. 现金短溢与 Lalamove（不进经营盈亏，列出供参考）
    const lalamove = r2(settlements.filter(s => inMonth(s.date)).reduce((s, x) => s + num(x.sales?.deliveryBreakdown?.lalamove), 0));
    findings.push({
        id: 'INFO_VARIANCE_LALAMOVE',
        title: '不进经营盈亏的项目（参考）',
        detail: `现金短溢合计 ${A.variance.toFixed(2)}（只进财务报表「调整后净利」）；Lalamove 营业额 ${lalamove.toFixed(2)}，各算法都计入营业额、没有对应成本。`,
        amount: A.variance, count: 0, records: [],
    });

    // ── 分类对照 ──
    const categories = Object.entries(A.classicCostByCategory)
        .filter(([, v]) => Math.abs(v) > 0.005)
        .map(([k, v]) => {
            const g = categorizeExpense(k);
            const line = classicLineOf(k);
            let flag: string | undefined;
            if (g === 'COGS' && !COGS_LINE_KEYS.has(k)) flag = '被当成食材，但不在传统账目的食材栏位：请确认分类';
            else if (!line && !['DIVIDEND', 'ASSET', 'IGNORE'].includes(g)) flag = '传统账目没有对应栏位';
            return {
                category: k, amount: r2(v), financialReport: frGroupLabel[g] || g,
                classicLine: line ? line.label : '（不在任何一行）', cockpit: cockpitGroupOf(k), flag,
            };
        })
        .sort((a, b) => b.amount - a.amount);

    // ── 差额桥：A − C、B − C 逐项拆开，剩下的列为「未能解释」 ──
    const bridgeA: ReconBridgeRow[] = [
        { label: '营业额', amount: r2(A.revenue - C.revenue) },
        { label: '外送平台扣款（未对账日的广告等）', amount: r2(C.platform - A.platform) },
        { label: '分期付款重复计入', amount: -dupBridge },
        { label: '钱箱支出未计入', amount: adj.pettyCash },
        { label: '收款手续费未计入', amount: adj.bankFees },
        { label: '人工口径不同（详见薪资核对）', amount: r2(C.labour - A.labour) },
    ];
    const explainedA = bridgeA.reduce((s, x) => s + x.amount, 0);
    const unexplainedA = r2(A.netProfit - C.netProfit - explainedA);

    const classicPlatform = r2(Object.entries(A.classicCostByCategory)
        .filter(([k]) => k.startsWith('PLATFORM_') || categorizeExpense(k) === 'DELIVERY_COST')
        .filter(([k]) => MAPPED_CAT_KEYS.has(k))
        .reduce((s, [, v]) => s + v, 0));
    const classicLabourExpenses = r2(Object.entries(A.classicCostByCategory)
        .filter(([k]) => categorizeExpense(k) === 'LABOR' && k !== 'PAYROLL' && k !== 'EPF_SOCSO' && MAPPED_CAT_KEYS.has(k))
        .reduce((s, [, v]) => s + v, 0));
    const cockpitPayroll = r2((cockpit.context?.labourByMonth.find(l => l.month === month)?.costs || []).reduce((s, c) => s + c.employerCost, 0));
    const classicPayroll = r2(num(A.classicCostByCategory.PAYROLL) + num(A.classicCostByCategory.EPF_SOCSO));
    const statUnpaid = findings.find(f => f.id === 'CLASSIC_STATUTORY_UNPAID')?.amount || 0;
    const bridgeB: ReconBridgeRow[] = [
        { label: '营业额', amount: r2(B.salesTotal - C.revenue) },
        { label: '外送平台扣款', amount: r2(C.platform - classicPlatform) },
        { label: '分期付款重复计入', amount: -dupMappedInClassic },
        { label: '钱箱支出未计入', amount: adj.pettyCash },
        { label: '收款手续费未计入', amount: adj.bankFees },
        { label: '没有对应栏位而消失的分类', amount: r2(unmappedNonLabour - dupUnmapped) },
        { label: '法定供款未缴不计', amount: statUnpaid },
        { label: '薪资：实发 vs 应发 + 雇主供款', amount: r2(cockpitPayroll - classicPayroll - statUnpaid) },
        { label: '人工类支出（兼职、员工餐、预支、津贴…）', amount: r2(C.labour - cockpitPayroll - classicLabourExpenses) },
    ];
    const explainedB = bridgeB.reduce((s, x) => s + x.amount, 0);
    const unexplainedB = r2(B.netProfit - C.netProfit - explainedB);

    const sample = D.days.length ? D.days[Math.floor(D.days.length / 2)] : null;
    return {
        month, start, end, loadedAt: new Date().toISOString(),
        counts: {
            settlements: settlements.filter(s => inMonth(s.date)).length,
            standaloneExpenses: standalone.length,
            billPayments: billPayments.length,
            payrollRecords: (payrollRecords as any[]).filter(p => p?.month === month).length,
            employees: employees.length,
            recurringBills: (recurringBills || []).length,
        },
        algorithms: {
            A: { revenue: A.revenue, platform: A.platform, food: A.food, labour: A.labour, opex: A.opex, netProfit: A.netProfit, labourSource: A.labourSource, settledDays: A.settledDays, daysInMonth: A.daysInMonth, baseMonthlyLabour: A.baseMonthlyLabour },
            B: {
                // SELLING 里非平台的行销广告并入「其他经营费用」，让五行加总 = 传统账目净利
                revenue: r2(B.salesTotal), platform: classicPlatform, food: r2(B.costTotal), labour: r2(B.personalTotal), opex: r2(B.operationTotal + B.sellingTotal - classicPlatform),
                netProfit: r2(B.netProfit), selling: r2(B.sellingTotal), personal: r2(B.personalTotal), operation: r2(B.operationTotal), cost: r2(B.costTotal),
                exportNetProfit: r2(Bexport.netProfit),
            },
            C,
            D: { sum: D.sum, days: D.days.length, estimatedFoodDays: D.estimatedFoodDays, estimatedFoodAmount: D.estimatedFoodAmount, sample: sample ? { date: sample.date, netProfit: sample.netProfit } : null },
        },
        bridgeA, bridgeB, unexplainedA, unexplainedB,
        findings,
        payroll,
        pettyCash,
        categories,
        missingSettlementDays,
    };
};

/** 给负责人复制贴回对话的摘要：只有金额与笔数，不含员工姓名或明细 */
export const reconciliationSummaryText = (r: MonthReconciliation): string => {
    const f = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const { A, B, C, D } = r.algorithms;
    const lines = [
        `【盈亏对账摘要 ${r.month}】（权责发生制）`,
        `资料：日结 ${r.counts.settlements} 天、独立支出 ${r.counts.standaloneExpenses} 笔、固定账单付款 ${r.counts.billPayments} 笔、薪资单 ${r.counts.payrollRecords} 份`,
        '',
        '项目 | 财务报表首页 A | 传统账目 B | 驾驶舱 C',
        `营业额 | ${f(A.revenue)} | ${f(B.revenue)} | ${f(C.revenue)}`,
        `平台扣款 | ${f(A.platform)} | ${f(B.platform)} | ${f(C.platform)}`,
        `食材 | ${f(A.food)} | ${f(B.food)} | ${f(C.food)}`,
        `人工 | ${f(A.labour)} | ${f(B.labour)} | ${f(C.labour)}`,
        `其他经营费用 | ${f(A.opex)} | ${f(B.opex)} | ${f(C.opex)}`,
        `经营净利 | ${f(A.netProfit)} | ${f(B.netProfit)} | ${f(C.netProfit)}`,
        `传统账目多月份导出：${f(B.exportNetProfit)}；经营日报 ${D.days} 天加总：${f(D.sum)}（其中 ${D.estimatedFoodDays} 天食材用 35% 估算）`,
        `财务报表首页人工来源：${A.labourSource}，已日结 ${A.settledDays}/${A.daysInMonth} 天`,
        `驾驶舱状态：${C.status}（${C.statusNote}）`,
        '',
        'A − C 差额拆解：',
        ...r.bridgeA.filter(x => Math.abs(x.amount) > 0.005).map(x => `  ${x.label}：${f(x.amount)}`),
        `  未能解释：${f(r.unexplainedA)}`,
        'B − C 差额拆解：',
        ...r.bridgeB.filter(x => Math.abs(x.amount) > 0.005).map(x => `  ${x.label}：${f(x.amount)}`),
        `  未能解释：${f(r.unexplainedB)}`,
        '',
        '差异来源：',
        ...r.findings.filter(x => x.count > 0 || Math.abs(x.amount) > 0.005).map(x => `  ${x.title}：${f(x.amount)}（${x.count} 笔）${x.needsDecision ? ' ※需确认' : ''}`),
    ];
    const pc = r.pettyCash;
    lines.push('', `钱箱支出 ${f(pc.total)}（${pc.entries.length} 笔），按文字粗分：${
        (Object.keys(pc.byUse) as PettyCashUse[]).map(k => `${PETTY_CASH_USE_LABEL[k]} ${f(pc.byUse[k].amount)}（${pc.byUse[k].count}）`).join('、')}`,
    `  与其他记录同金额（±2 天）：${f(pc.matchedTotal)}；${
        (Object.keys(pc.matched) as PettyCashMatchType[]).map(k => `${PETTY_CASH_MATCH_LABEL[k]} ${f(pc.matched[k].amount)}（${pc.matched[k].count}）`).join('、')}`);
    if (r.payroll) {
        const t = r.payroll.totals;
        lines.push('', `薪资核对：${r.payroll.employees.length} 人，${r.payroll.mismatchCount} 人实发对不上；状态 ${r.payroll.status}，法定供款${r.payroll.isStatutoryPaid ? '已缴' : '未缴'}`,
            `  应发 ${f(t.gross)}、无薪假 ${f(t.unpaidLeave)}、已扣罚款 ${f(t.penaltyDeducted)}、未扣罚款 ${f(t.penaltyNotDeducted)}、预支扣回 ${f(t.advanceLoan)}（预支支出 ${f(r.payroll.advanceExpenses)}）、雇主供款 ${f(t.employerStatutory)}`,
            `  其他扣款：住宿费 ${f(t.hostelFee)}、其他扣款 ${f(t.otherDeduction)}、扣回借款 ${f(t.loanRepay)}；员工法定扣款 ${f(r.payroll.employees.reduce((s, e) => s + e.employeeStatutory, 0))}`,
            `  人工（薪资单部分）：A 口径 ${f(t.asFinancialReport)}、B 口径 ${f(t.asClassic)}、C 口径 ${f(t.asCockpit)}、建议口径 ${t.proposed === null ? '无法计算（有人对不上）' : f(t.proposed)}`);
    }
    return lines.join('\n');
};
