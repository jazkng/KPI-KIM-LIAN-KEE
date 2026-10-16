// ============================================================================
// 杂项费用专项审计（只读）
// ----------------------------------------------------------------------------
// 负责人 2026-10-16 要求：逐笔检查某月全部应付账款 / 独立支出，确认每一笔在「传统账目」
// 目前被归到哪个科目、有没有被漏掉或重复。不修改原始资料；不依供应商名称或关键词推测分类（分类以负责人确认为准）。
// 第二轮（同日）：每日结算的钱箱支出（dayExpenses）完全排除——不用于计费、AP 配对或漏账判断；
// 采购 / 杂费以扫描凭证形成的正式 AP 为准，工资以 Payroll 为准（见 labourCheck）。
//
// 「传统账目目前的处理」照抄 FinancialReport.tsx（2026-10-16 修正后）的规则：
//   - 日期：业务发生制看 time（单据日期），以马来西亚日期判断月份；付款日期另列，不影响归属月份
//   - 金额：(totalBillAmount || amount) − creditNote；有拆分时按比例拆到各分类
//   - 不计入：payroll_ / salary_（薪资付款纪录）、bill_sync_（固定账单镜像）、recon_fee_（对账手续费）、
//            有 settlementId 的（改由日结里的那份副本计入）、分期付款第二笔以后的 pay_ 列（原账单已按全额计入）
//   - 分类：大写；ELECTRICITY → UTILITIES_ELECTRIC、WATER → UTILITIES_WATER；旧饮料 / 海鲜细分改归；
//            TRANSFER / FUND / ADJUSTMENT / SALES 一律丢弃
//   - 固定账单付款换成与应付账款镜像相同的分类（constants/recurringBillCategoryMap.ts）
//   - 不在 constants/classicPnLCostMap.ts 对照表的分类并入后备科目（classicLinesFor），不再整笔消失
// 纯函数，不读写资料库。
// ============================================================================
import { classicLineOf, classicLinesFor } from '../../classicPnLBuilder';
import { categorizeExpense, parentBillIdOfPayment } from '../../monthlyPnLAggregator';
import { checkPayrollMonth, type PayrollMonthCheck } from '../reconciliation/payrollFieldCheck';
import { toMalaysiaDay } from '../../dateHelper';
import { billPaymentCostCategory } from '../../../constants/recurringBillCategoryMap';

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 + 0;

// 传统账目的科目（含 2026-10-16 起的后备科目：没有对应的分类并入「其他」行，不再消失）

const LEGACY_BEVERAGE: Record<string, string> = { TEA: 'BEVERAGE_TEA', CANNED: 'BEVERAGE_CANNED', ALCOHOL: 'BEVERAGE_ALCOHOL' };
const LEGACY_SEAFOOD: Record<string, string> = {
    FISH: 'INGREDIENT_FISH', SHRIMP: 'INGREDIENT_PRAWN', SOTONG: 'INGREDIENT_SOTONG',
    LALA: 'INGREDIENT_LALA', PROCESSED: 'INGREDIENT_SEAFOOD_PROCESSED', SHRIMP_SOTONG: 'INGREDIENT_PRAWN',
};

/** 杂项类别分组列出（只是分组，不代表分类有问题；分类以负责人确认为准） */
export const FOCUS_CATEGORIES = ['SUPPLIES', 'MISC_OPEX', 'EXPENSE', 'MAINTENANCE', 'PACKAGING', 'IT_SOFTWARE', 'OTHER', 'GENERAL', 'SUPPLIER', 'BILL', 'CLEANING', 'CLEANING_SUPPLY'];

export type Treatment =
    | 'COUNTED'          // 进入传统账目某一行，并计入净利
    | 'CAPEX'            // 进入传统账目 CAPEX 段，不计入净利
    | 'FOLDED'           // 分类不在对照表：并入后备科目计入（2026-10-16 前整笔消失）
    | 'NOT_IN_CLASSIC'   // 分类不在任何一行、也没有后备科目：整笔不计
    | 'NON_OPERATING'    // 转账 / 调整 / 押金 / 借款 / 分红：不计入（规则如此）
    | 'VIA_SETTLEMENT'   // 有 settlementId：改由日结里的副本计入
    | 'SKIPPED_PAYROLL'  // 薪资付款纪录：成本由薪资单计入
    | 'SKIPPED_BILL_SYNC'// 固定账单镜像：由固定账单付款计入
    | 'SKIPPED_RECON_FEE'// 对账手续费：传统账目略过
    | 'ZERO'             // 金额为 0 或负数
    | 'DUP_INSTALMENT'   // 分期付款第二笔以后：原账单已按全额计入，这笔不再计
    | 'OTHER_MONTH';     // 单据的马来西亚日期不在本月（只为对照列出）
export const TREATMENT_LABEL: Record<Treatment, string> = {
    COUNTED: '已计入传统账目',
    CAPEX: '列在 CAPEX（不计入净利）',
    FOLDED: '分类没有对应科目，并入后备科目计入',
    NOT_IN_CLASSIC: '没有进入任何科目（不计）',
    NON_OPERATING: '不计入（转账 / 押金 / 借款 / 分红）',
    VIA_SETTLEMENT: '改由日结副本计入',
    SKIPPED_PAYROLL: '薪资付款纪录（由薪资单计入）',
    SKIPPED_BILL_SYNC: '固定账单镜像（由固定账单付款计入）',
    SKIPPED_RECON_FEE: '对账手续费（传统账目略过）',
    ZERO: '金额为 0',
    DUP_INSTALMENT: '分期付款（原账单已全额计入，不再计）',
    OTHER_MONTH: '单据日期不在本月',
};

export interface AuditPart {
    category: string;
    amount: number;
    line: string | null;
    section: string | null;
    /** 分类不在对照表，并入后备科目（INGREDIENTS / OTHER OPERATING EXPENSES / LABOUR CHARGES） */
    folded: boolean;
}


export interface AuditRow {
    id: string;
    /** 单据日期（马来西亚日期；决定归属月份） */
    date: string;
    /** 旧算法按 UTC 字串切出的日期（与 date 不同代表 UTC 切日） */
    utcDate: string;
    /** 付款日期（马来西亚日期；没有付款为空） */
    paymentDate: string;
    supplier: string;
    item: string;
    invoiceRef: string;
    voucher: string;
    amount: number;
    totalBillAmount: number;
    /** 传统账目（业务发生制）计入的金额 */
    accrualAmount: number;
    /** 记录上的扣减（credit note）；会从账单全额扣掉，需要有 CN 凭证 */
    creditNote: number;
    paymentStatus: string;
    paymentMethod: string;
    category: string;
    subCategory: string;
    parts: AuditPart[];
    treatment: Treatment;
    /** 分期付款的 pay_ 列：原账单已按全额计入（传统账目已排除，不再计） */
    duplicateInstalment: boolean;
    /** 薪资 / 兼职 / 预支等含员工姓名的记录（摘要不列出名字） */
    personal: boolean;
    missingVoucher: boolean;
    /** 拆分金额合计（原始值）；与账单全额不同时，传统账目会按比例缩放 */
    splitTotal: number | null;
}




const normaliseKey = (category: unknown, expense?: any): string => {
    let key = category ? String(category).toUpperCase() : 'OTHER';
    if (key === 'BEVERAGE' && expense?.beverageSubCategory) key = LEGACY_BEVERAGE[String(expense.beverageSubCategory).toUpperCase()] || key;
    else if (key === 'INGREDIENT_SEAFOOD' && expense?.seafoodSubCategory) key = LEGACY_SEAFOOD[String(expense.seafoodSubCategory).toUpperCase()] || key;
    if (key === 'ELECTRICITY') key = 'UTILITIES_ELECTRIC';
    if (key === 'WATER') key = 'UTILITIES_WATER';
    return key;
};

const splitParts = (amount: number, e: any): AuditPart[] => {
    const splits = e?.categorySplits;
    const raw: { category: string; amount: number }[] = [];
    if (Array.isArray(splits) && splits.length) {
        const total = splits.reduce((s: number, x: any) => s + num(x.amount), 0);
        if (total > 0) {
            let allocated = 0;
            splits.forEach((sp: any, i: number) => {
                const part = i === splits.length - 1 ? amount - allocated : Number(((amount * num(sp.amount)) / total).toFixed(2));
                allocated += part;
                raw.push({ category: normaliseKey(sp.category), amount: part });
            });
        }
    }
    if (!raw.length) raw.push({ category: normaliseKey(e?.category, e), amount });
    return raw.map(p => {
        const hit = classicLineOf(p.category);
        return { category: p.category, amount: r2(p.amount), line: hit?.line.label || null, section: hit?.line.section || null, folded: !!hit?.folded };
    });
};


export interface LineCheck {
    line: string;
    section: string;
    /** 来自应付账款 / 独立支出（本审计逐笔加总） */
    fromAP: number;
    /** 来自固定账单付款（扣除他人分摊） */
    fromBills: number;
    /** 来自日结里的支出副本（与应付账款连结的账单） */
    fromSettlement: number;
    /** 系统算出来的：薪资单（PAYROLL / EPF_SOCSO）、平台抽佣与广告 */
    computed: number;
    /** 传统账目目前显示的金额 */
    classic: number;
    diff: number;
}

/** 人工只计一次的核对（Payroll 为正式来源；员工预支是工资的一部分，不另作费用） */
export interface LabourCheck {
    payrollStatus: string;
    /** 当月薪资单逐人字段核对（应发、实发、各项扣款） */
    payroll: PayrollMonthCheck | null;
    /** 应发 = 实发 + 预支扣回 + 员工法定扣款 + 其他扣款（宿舍 / 其他 / 还款 / 无薪假 / 已扣罚款） */
    identity: { gross: number; netPay: number; advanceLoan: number; employeeStatutory: number; otherDeductions: number; gap: number } | null;
    /** 当月登记的员工预支（STAFF_ADVANCE）合计 vs 薪资单扣回的预支 */
    advanceAP: number;
    advanceGap: number;
    /** 薪资付款纪录（payroll_net_* / payroll_stat_*，不计入，只核对）vs 薪资单实发 / 缴政府 */
    payrollPaymentRecords: { net: number; statutory: number; netGap: number; statGap: number };
    partTimeAP: number;
    partTimeCount: number;
    /** 不是 parttime_ 产生、也不是薪资付款纪录的 SALARY 类支出（手动登记的工资） */
    manualSalaryRows: AuditRow[];
    /** 手动工资 / 兼职的人名与薪资单员工相同或相近：可能与月薪重复，待确认 */
    possibleDuplicates: { row: AuditRow; payrollName: string }[];
    /** 传统账目 LABOUR CHARGES + STATUTORY 的组成 */
    classic: { payrollNet: number; advance: number; partTime: number; manualSalary: number; staffMeal: number; other: number; statutory: number; total: number };
    /** 文字结论（不含员工姓名） */
    notes: string[];
}

export interface ExpenseAuditResult {
    month: string;
    rows: AuditRow[];
    totals: {
        count: number;
        apTotal: number;
        counted: number;
        capex: number;
        /** 不在对照表、并入后备科目的金额 */
        folded: number;
        notInClassic: number;
        nonOperating: number;
        viaSettlement: number;
        skipped: number;
        duplicateInstalments: number;
        utcShifted: number;
        creditNotes: number;
    };
    byCategory: { category: string; count: number; amount: number; line: string | null; section: string | null }[];
    lineChecks: LineCheck[];
    focus: Record<string, { count: number; amount: number; rows: AuditRow[] }>;
    /** 固定账单付款：换成 AP 分类后仍没有传统账目科目 → 整笔没有计入 */
    unmappedBills: { id: string; date: string; name: string; category: string; amount: number; line: string | null }[];
    /** 拆分金额合计与账单全额不同：传统账目按比例缩放各拆分，金额可能不是单据上的数字 */
    splitMismatch: AuditRow[];
    notInClassic: AuditRow[];
    /** 有 creditNote 扣减的记录（扣减要有 CN 凭证；系统不会自动判断对错） */
    creditNoteRows: AuditRow[];
    labour: LabourCheck | null;
    suggestions: string[];
}

// ── 人名比对（只用来提示「可能重复」，不自动认定）──
const NAME_STOP = new Set(['bin', 'binti', 'bte', 'mohd', 'muhammad', 'part', 'time', 'parttime', 'salary', 'wages', 'wage', 'gaji', 'staff', 'balance', 'cash', 'payroll']);
const nameTokens = (s: unknown) => String(s || '').toLowerCase().split(/[\s·,.\-_/()（）:：]+/)
    .filter(t => (/[一-鿿]/.test(t) ? t.length >= 2 : t.length >= 3) && !NAME_STOP.has(t));
const sharesName = (text: string, name: string) => {
    const ta = new Set(nameTokens(text));
    return nameTokens(name).some(t => ta.has(t));
};

const labourCheck = (
    month: string,
    monthRows: AuditRow[],
    payroll: { records: any[]; employees: any[] },
    classicCostByCategory: Record<string, number>,
): LabourCheck => {
    const counted = monthRows.filter(r => r.treatment === 'COUNTED');
    const sumRows = (list: AuditRow[]) => r2(list.reduce((s2, r) => s2 + r.accrualAmount, 0));
    const record = payroll.records.find(p => p?.month === month && p?.status === 'POSTED') || payroll.records.find(p => p?.month === month) || null;
    const advanceRows = counted.filter(r => r.parts.some(p => p.category === 'STAFF_ADVANCE'));
    const advanceAP = r2(advanceRows.reduce((s2, r) => s2 + r.parts.filter(p => p.category === 'STAFF_ADVANCE').reduce((a, p) => a + p.amount, 0), 0));
    const pm = record ? checkPayrollMonth(record, payroll.employees, advanceAP) : null;
    const t = pm?.totals;
    const employeeStatutory = pm ? r2(pm.employees.reduce((s2, e) => s2 + e.employeeStatutory, 0)) : 0;
    const otherDeductions = t ? r2(t.unpaidLeave + t.hostelFee + t.otherDeduction + t.loanRepay + t.penaltyDeducted) : 0;
    const identity = t ? {
        gross: t.gross, netPay: t.netPay, advanceLoan: t.advanceLoan, employeeStatutory, otherDeductions,
        gap: r2(t.gross - t.netPay - t.advanceLoan - employeeStatutory - otherDeductions),
    } : null;
    const payNet = sumRows(monthRows.filter(r => r.id.startsWith('payroll_net_')));
    const payStat = sumRows(monthRows.filter(r => r.id.startsWith('payroll_stat_')));
    const partTimeRows = counted.filter(r => r.id.startsWith('parttime_'));
    const manualSalaryRows = counted.filter(r => !r.id.startsWith('parttime_') && r.parts.some(p => p.category === 'SALARY'));
    const payrollNames: string[] = (Array.isArray(record?.details) ? record.details : []).map((d: any) => String(d?.employeeName || '')).filter(Boolean);
    const possibleDuplicates = [...manualSalaryRows, ...partTimeRows].flatMap(r => {
        const name = payrollNames.find(n => sharesName(`${r.supplier} ${r.item}`, n));
        return name ? [{ row: r, payrollName: name }] : [];
    });
    const c = (k: string) => r2(num(classicCostByCategory[k]));
    const salaryAll = c('SALARY');
    const partTime = sumRows(partTimeRows);
    const manualSalary = r2(salaryAll - partTime);
    const classic = {
        payrollNet: c('PAYROLL'), advance: c('STAFF_ADVANCE'), partTime, manualSalary, staffMeal: c('STAFF_MEAL'),
        other: r2(c('ALLOWANCE') + c('COMMISSION')),
        statutory: r2(['EPF_SOCSO', 'EPF', 'SOCSO', 'EIS', 'LINDUNG', 'PCB'].reduce((s2, k) => s2 + c(k), 0)),
        total: 0,
    };
    classic.total = r2(classic.payrollNet + classic.advance + classic.partTime + classic.manualSalary + classic.staffMeal + classic.other + classic.statutory);
    const f2 = (n: number) => n.toFixed(2);
    const notes: string[] = [];
    const advanceGap = r2(advanceAP - (t?.advanceLoan || 0));
    if (!record) notes.push('这个月没有薪资单：传统账目的工资部分不完整，结果只能当参考。');
    else {
        notes.push(`薪资单状态 ${record.status}。Payroll 存的是「扣完预支、扣款后的净薪」：应发 ${f2(identity!.gross)} = 实发 ${f2(identity!.netPay)} + 预支扣回 ${f2(identity!.advanceLoan)} + 员工法定扣款 ${f2(employeeStatutory)} + 其他扣款 ${f2(otherDeductions)}${Math.abs(identity!.gap) > 0.05 ? `（还有 ${f2(identity!.gap)} 对不上，见逐人核对）` : '（逐人核对一致）'}。`);
        if (Math.abs(advanceGap) <= 0.05) notes.push(`预支：本月登记 ${f2(advanceAP)}，薪资单扣回 ${f2(t!.advanceLoan)}，金额一致。预支在发放时计入人工，发薪时实发已扣掉同一笔，所以工资只计一次（不是另外的费用，也没有重复）。`);
        else if (advanceGap > 0) notes.push(`预支：本月登记 ${f2(advanceAP)}，薪资单只扣回 ${f2(t!.advanceLoan)}，多出 ${f2(advanceGap)} 尚未扣回（可能下月才扣）。这部分本月已计入人工，下月扣回时实发会减少；单月人工偏高，需确认是否为借款。`);
        else notes.push(`预支：薪资单扣回 ${f2(t!.advanceLoan)}，比本月登记的 ${f2(advanceAP)} 多 ${f2(-advanceGap)}（扣回的是以前月份的预支）。那部分在发放的月份已计入人工，本月人工因此偏低 ${f2(-advanceGap)}。`);
        const stat = num(record.totalGovtPay);
        notes.push(record.isStatutoryPaid
            ? `法定缴款 ${f2(stat)}（含员工扣款 ${f2(employeeStatutory)} + 雇主供款 ${f2(t!.employerStatutory)}）已缴，计入 STATUTORY。员工扣款本来就是应发的一部分，所以传统账目人工 = 应发 − 其他扣款 + 雇主供款，工资只计一次。`
            : `法定缴款 ${f2(stat)} 尚未标记已缴，传统账目不计：员工法定扣款与雇主供款都没有计入，人工偏低 ${f2(stat)}。`);
        if (otherDeductions > 0.005) notes.push(`其他扣款 ${f2(otherDeductions)}（宿舍费 ${f2(t!.hostelFee)}、其他扣款 ${f2(t!.otherDeduction)}、还款 ${f2(t!.loanRepay)}、无薪假 ${f2(t!.unpaidLeave)}、已扣罚款 ${f2(t!.penaltyDeducted)}）从人工里减掉。无薪假、罚款是真的少付工资；宿舍费、还款、其他扣款是员工付给公司的钱，是否应抵减人工需要负责人决定口径。`);
        if (payNet || payStat) notes.push(`薪资付款纪录（不计入，只核对）：实发付款 ${f2(payNet)}${Math.abs(payNet - t!.netPay) > 0.05 ? `，与薪资单实发相差 ${f2(r2(payNet - t!.netPay))}` : '，与薪资单实发一致'}；缴政府 ${f2(payStat)}${Math.abs(payStat - stat) > 0.05 ? `，与薪资单相差 ${f2(r2(payStat - stat))}` : '，一致'}。`);
    }
    notes.push(`兼职（系统按工时产生）${partTimeRows.length} 笔 ${f2(partTime)}，只在应付账款计一次；手动登记的工资 ${manualSalaryRows.length} 笔 ${f2(manualSalary)}。`);
    if (possibleDuplicates.length) notes.push(`有 ${possibleDuplicates.length} 笔兼职 / 手动工资的人名与月薪名单相同或相近（${f2(sumRows(possibleDuplicates.map(x => x.row)))}），可能与月薪重复或其实是预支，待确认。`);
    return {
        payrollStatus: String(record?.status || '没有薪资单'),
        payroll: pm, identity, advanceAP, advanceGap,
        payrollPaymentRecords: { net: payNet, statutory: payStat, netGap: t ? r2(payNet - t.netPay) : 0, statGap: record ? r2(payStat - num(record.totalGovtPay)) : 0 },
        partTimeAP: partTime, partTimeCount: partTimeRows.length,
        manualSalaryRows, possibleDuplicates, classic, notes,
    };
};

/**
 * @param classicCostByCategory 传统账目画面目前使用的 costByCategory（legacyFinancialReport 的结果），用来核对
 * @param payroll 薪资单与员工（核对工资只计一次）；不传就不做人工核对
 * @param parentBills 期间外的原账单（判断分期付款列）
 */
export const auditExpenses = (
    month: string,
    data: { standaloneExpenses: any[]; settlements: any[]; billPayments: any[] },
    classicCostByCategory: Record<string, number>,
    payroll?: { records: any[]; employees: any[] },
    parentBills: Map<string, { totalBillAmount?: number }> = new Map(),
): ExpenseAuditResult => {
    const inMonth = (d: string) => d.slice(0, 7) === month;
    const byId = new Map(data.standaloneExpenses.map(e => [String(e?.id || ''), e]));
    const parentTotal = (pid: string) => num((byId.get(pid) ?? parentBills.get(pid))?.totalBillAmount);
    const rows: AuditRow[] = [];
    data.standaloneExpenses.forEach(e => {
        const id = String(e?.id || '');
        const date = toMalaysiaDay(e?.time);
        const utcDate = String(e?.time || '').split('T')[0];
        if (!inMonth(date) && !inMonth(utcDate)) return;
        const accrualAmount = r2(num(e.totalBillAmount || e.amount) - num(e.creditNote));
        const cat = normaliseKey(e.category, e);
        const parts = splitParts(accrualAmount, e);
        const parentId = parentBillIdOfPayment(id);
        const dupInstalment = !!parentId && !(num(e.totalBillAmount) > 0) && parentTotal(parentId) > 0;
        let treatment: Treatment;
        if (!inMonth(date)) treatment = 'OTHER_MONTH';
        else if (id.startsWith('payroll_') || id.startsWith('salary_')) treatment = 'SKIPPED_PAYROLL';
        else if (id.startsWith('bill_sync_')) treatment = 'SKIPPED_BILL_SYNC';
        else if (id.startsWith('recon_fee_')) treatment = 'SKIPPED_RECON_FEE';
        else if (e.settlementId) treatment = 'VIA_SETTLEMENT';
        else if (dupInstalment) treatment = 'DUP_INSTALMENT';
        else if (!(accrualAmount > 0)) treatment = 'ZERO';
        else if (parts.every(p => ['IGNORE', 'DIVIDEND', 'ASSET'].includes(categorizeExpense(p.category)) && !p.line)) treatment = 'NON_OPERATING';
        else if (parts.some(p => !p.line && !['IGNORE', 'DIVIDEND', 'ASSET'].includes(categorizeExpense(p.category)))) treatment = 'NOT_IN_CLASSIC';
        else if (parts.some(p => p.folded)) treatment = 'FOLDED';
        else if (parts.every(p => p.section === 'CAPEX')) treatment = 'CAPEX';
        else treatment = 'COUNTED';
        const personal = id.startsWith('parttime_') || id.startsWith('payroll_') || id.startsWith('salary_') || /ADVANCE|LOAN|SALARY|PAYROLL/.test(String(e.category || '').toUpperCase());
        const base = {
            id, date, utcDate,
            paymentDate: e.paymentDate ? toMalaysiaDay(e.paymentDate) : '',
            supplier: String(e.company || ''),
            item: [e.particulars, e.note].filter(Boolean).join(' · '),
            invoiceRef: String(e.invoiceRef || ''),
            voucher: String(e.linkUrl || ''),
            amount: num(e.amount), totalBillAmount: num(e.totalBillAmount), accrualAmount,
            creditNote: num(e.creditNote),
            paymentStatus: String(e.paymentStatus || ''), paymentMethod: String(e.paymentMethod || ''),
            category: cat,
            subCategory: String(e.beverageSubCategory || e.seafoodSubCategory || e.marketingSubCategory || ''),
            parts, treatment,
            duplicateInstalment: dupInstalment,
            personal,
            missingVoucher: !e.linkUrl && !e.invoiceRef && !personal && !id.startsWith('recon_fee_') && !id.startsWith('bill_sync_'),
            splitTotal: Array.isArray(e.categorySplits) && e.categorySplits.length ? r2(e.categorySplits.reduce((s2: number, x: any) => s2 + num(x.amount), 0)) : null,
        };
        rows.push(base);
    });

    const inMonthRows = rows.filter(r => inMonth(r.date));
    const counted = inMonthRows.filter(r => r.treatment === 'COUNTED' || r.treatment === 'FOLDED' || r.treatment === 'NOT_IN_CLASSIC' || r.treatment === 'CAPEX');
    const sum = (list: AuditRow[]) => r2(list.reduce((s, r) => s + r.accrualAmount, 0));

    // ── 分类汇总（只算本月、会进入传统账目计算的那些）──
    const catMap = new Map<string, { category: string; count: number; amount: number; line: string | null; section: string | null }>();
    counted.forEach(r => r.parts.forEach(p => {
        const c = catMap.get(p.category) || { category: p.category, count: 0, amount: 0, line: p.line, section: p.section };
        c.count += 1; c.amount = r2(c.amount + p.amount);
        catMap.set(p.category, c);
    }));
    const byCategory = [...catMap.values()].sort((a, b) => b.amount - a.amount);

    // ── 与传统账目各科目核对：逐一来源加总。差额为 0 只代表「钱的来源都找得到」，不代表每笔分类都对 ──
    const addTo = (m: Map<string, number>, k: string, v: number) => m.set(k, r2((m.get(k) || 0) + v));
    const billsByKey = new Map<string, number>();
    const unmappedBills: ExpenseAuditResult['unmappedBills'] = [];
    data.billPayments.forEach(b => {
        const d = toMalaysiaDay(b.date);
        if (!inMonth(d)) return;
        const shared = (b.costShares || []).reduce((s2: number, x: any) => s2 + num(x.amount), 0);
        const v = r2(Math.max(0, num(b.amount) - shared));
        const key = normaliseKey(billPaymentCostCategory(b.category));
        if (v) addTo(billsByKey, key, v);
        const hit = classicLineOf(key);
        if (v && (!hit || hit.folded) && !['IGNORE', 'DIVIDEND', 'ASSET'].includes(categorizeExpense(key))) {
            unmappedBills.push({ id: String(b.id || ''), date: d, name: String(b.name || b.note || ''), category: key, amount: v, line: hit?.line.label || null });
        }
    });
    const settleByKey = new Map<string, number>();
    data.settlements.forEach(st => {
        if (!inMonth(String(st.date || '').split('T')[0])) return;
        (st.expenses || []).forEach((e: any) => splitParts(num(e.amount), e).forEach(p => addTo(settleByKey, p.category, p.amount)));
    });
    const isComputed = (k: string) => k === 'PAYROLL' || k === 'EPF_SOCSO' || k.startsWith('PLATFORM_COMM_') || k.startsWith('PLATFORM_ADS_');
    const notInClassicRows = inMonthRows.filter(r => r.treatment === 'NOT_IN_CLASSIC' || r.treatment === 'FOLDED');
    const lineChecks: LineCheck[] = classicLinesFor(classicCostByCategory).lines.map(l => {
        const pick = (m: Map<string, number> | Map<string, { amount: number }>, k: string) => {
            const v = (m as Map<string, any>).get(k);
            return typeof v === 'number' ? v : num(v?.amount);
        };
        const fromAP = r2(l.sources.reduce((s2, k) => s2 + pick(catMap, k), 0));
        const fromBills = r2(l.sources.reduce((s2, k) => s2 + pick(billsByKey, k), 0));
        const fromSettlement = r2(l.sources.reduce((s2, k) => s2 + pick(settleByKey, k), 0));
        const classic = r2(l.sources.reduce((s2, k) => s2 + num(classicCostByCategory[k]), 0));
        const computed = r2(l.sources.filter(isComputed).reduce((s2, k) => s2 + num(classicCostByCategory[k]) - pick(catMap, k) - pick(billsByKey, k) - pick(settleByKey, k), 0));
        return { line: l.label, section: l.section, fromAP, fromBills, fromSettlement, computed, classic, diff: r2(classic - fromAP - fromBills - fromSettlement - computed) };
    }).filter(x => [x.classic, x.fromAP, x.fromBills, x.fromSettlement].some(v => Math.abs(v) > 0.005));

    const focus: ExpenseAuditResult['focus'] = {};
    FOCUS_CATEGORIES.forEach(k => {
        const list = inMonthRows.filter(r => r.category === k || r.parts.some(p => p.category === k));
        if (list.length) focus[k] = { count: list.length, amount: sum(list), rows: list };
    });

    const splitMismatch = counted.filter(r => r.splitTotal !== null && Math.abs(r.splitTotal - (r.totalBillAmount || r.amount)) > 0.005);
    const dupRows = inMonthRows.filter(r => r.treatment === 'DUP_INSTALMENT');
    const utcShifted = rows.filter(r => r.utcDate.slice(0, 7) !== r.date.slice(0, 7));
    const creditNoteRows = counted.filter(r => r.creditNote > 0);
    const labour = payroll ? labourCheck(month, inMonthRows, payroll, classicCostByCategory) : null;

    const suggestions: string[] = [];
    if (notInClassicRows.length) {
        const cats = [...new Set(notInClassicRows.flatMap(r => r.parts.filter(p => !p.line || p.folded).map(p => `${p.category}${p.line ? ` → ${p.line}` : '（不计）'}`)))];
        suggestions.push(`有 ${notInClassicRows.length} 笔（RM ${sum(notInClassicRows).toFixed(2)}）的分类不在科目对照表：${cats.join('、')}。2026-10-16 起并入后备科目计入（以前整笔消失）；如要放在别的科目，请在对照表补上（程式修改，需负责人确认）。`);
    }
    if (unmappedBills.length) suggestions.push(`有 ${unmappedBills.length} 笔固定账单付款（RM ${r2(unmappedBills.reduce((s, b) => s + b.amount, 0)).toFixed(2)}）的分类 ${[...new Set(unmappedBills.map(b => b.category))].join('、')} 没有传统账目科目，整笔没有计入。`);
    if (splitMismatch.length) suggestions.push(`有 ${splitMismatch.length} 笔账单的拆分金额合计与账单全额不同，传统账目按比例缩放各拆分；请核对拆分金额。`);
    if (creditNoteRows.length) suggestions.push(`有 ${creditNoteRows.length} 笔账单记录了扣减（credit note，合计 RM ${r2(creditNoteRows.reduce((s, r) => s + r.creditNote, 0)).toFixed(2)}），计入金额比账单全额少。请确认每一笔都有供应商的 CN / 退货凭证；没有凭证的扣减会让费用偏低。`);
    if (dupRows.length) suggestions.push(`有 ${dupRows.length} 笔分期付款列（RM ${sum(dupRows).toFixed(2)}），原账单已按全额计入，传统账目不再重复计。`);
    if (utcShifted.length) suggestions.push(`有 ${utcShifted.length} 笔账单时间带时区，按 UTC 会落到另一个月份；传统账目已改用马来西亚日期（单据日期）判断月份。`);
    if (labour?.possibleDuplicates.length) suggestions.push(`有 ${labour.possibleDuplicates.length} 笔兼职 / 手动工资的人名与月薪名单相同或相近，可能重复计工资，请确认。`);

    return {
        month,
        rows: rows.sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier)),
        totals: {
            count: inMonthRows.length,
            apTotal: sum(inMonthRows),
            counted: sum(inMonthRows.filter(r => r.treatment === 'COUNTED')),
            capex: sum(inMonthRows.filter(r => r.treatment === 'CAPEX')),
            folded: r2(notInClassicRows.reduce((s, r) => s + r.parts.filter(p => p.folded).reduce((a, p) => a + p.amount, 0), 0)),
            notInClassic: r2(notInClassicRows.reduce((s, r) => s + r.parts.filter(p => !p.line).reduce((a, p) => a + p.amount, 0), 0)),
            nonOperating: sum(inMonthRows.filter(r => r.treatment === 'NON_OPERATING')),
            viaSettlement: sum(inMonthRows.filter(r => r.treatment === 'VIA_SETTLEMENT')),
            skipped: sum(inMonthRows.filter(r => r.treatment.startsWith('SKIPPED'))),
            duplicateInstalments: sum(dupRows),
            utcShifted: utcShifted.length,
            creditNotes: r2(creditNoteRows.reduce((s, r) => s + r.creditNote, 0)),
        },
        byCategory,
        lineChecks,
        focus,
        unmappedBills,
        splitMismatch,
        notInClassic: notInClassicRows,
        creditNoteRows,
        labour,
        suggestions,
    };
};
