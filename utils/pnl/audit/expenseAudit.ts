// ============================================================================
// 杂项费用专项审计（只读）
// ----------------------------------------------------------------------------
// 负责人 2026-10-16 要求：逐笔检查某月全部应付账款 / 独立支出，确认每一笔在「传统账目」
// 目前被归到哪个科目、有没有被漏掉、分类是否合理，并与日结钱箱支出对照。
// 第一阶段只审计：不修改原始资料、不修改任何盈亏算法、不自动改分类。
//
// 「传统账目目前的处理」照抄 FinancialReport.tsx（2026-10-16 版本）的规则：
//   - 日期：业务发生制看 time，以 time.split('T')[0] 判断月份（UTC 字串，与画面相同）
//   - 金额：(totalBillAmount || amount) − creditNote；有拆分时按比例拆到各分类
//   - 不计入：payroll_ / salary_（薪资付款纪录）、bill_sync_（固定账单镜像）、recon_fee_（对账手续费）、
//            有 settlementId 的（改由日结里的那份副本计入）
//   - 分类：大写；ELECTRICITY → UTILITIES_ELECTRIC、WATER → UTILITIES_WATER；旧饮料 / 海鲜细分改归；
//            TRANSFER / FUND / ADJUSTMENT / SALES 一律丢弃
//   - 传统账目只加总 constants/classicPnLCostMap.ts 列出的分类；不在任何一行的分类整笔消失
// 纯函数，不读写资料库。
// ============================================================================
import { CLASSIC_COST_LINES } from '../../../constants/classicPnLCostMap';
import { categorizeExpense } from '../../monthlyPnLAggregator';
import { reconcileCashBox, type CashBoxSummary } from '../engine/cashBox';

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 + 0;

const LINE_BY_KEY = new Map<string, (typeof CLASSIC_COST_LINES)[number]>();
CLASSIC_COST_LINES.forEach(l => l.sources.forEach(k => LINE_BY_KEY.set(k, l)));

const LEGACY_BEVERAGE: Record<string, string> = { TEA: 'BEVERAGE_TEA', CANNED: 'BEVERAGE_CANNED', ALCOHOL: 'BEVERAGE_ALCOHOL' };
const LEGACY_SEAFOOD: Record<string, string> = {
    FISH: 'INGREDIENT_FISH', SHRIMP: 'INGREDIENT_PRAWN', SOTONG: 'INGREDIENT_SOTONG',
    LALA: 'INGREDIENT_LALA', PROCESSED: 'INGREDIENT_SEAFOOD_PROCESSED', SHRIMP_SOTONG: 'INGREDIENT_PRAWN',
};

/** 本次审计特别检查的「杂项」类别 */
export const FOCUS_CATEGORIES = ['SUPPLIES', 'MISC_OPEX', 'EXPENSE', 'MAINTENANCE', 'PACKAGING', 'IT_SOFTWARE', 'OTHER', 'GENERAL', 'SUPPLIER', 'BILL', 'CLEANING', 'CLEANING_SUPPLY'];
/** 太笼统、看不出用途的分类 */
const GENERIC = new Set(['OTHER', 'EXPENSE', 'MISC_OPEX', 'GENERAL', 'SUPPLIER', 'BILL', 'SUPPLIES']);

export type Treatment =
    | 'COUNTED'          // 进入传统账目某一行，并计入净利
    | 'CAPEX'            // 进入传统账目 CAPEX 段，不计入净利
    | 'NOT_IN_CLASSIC'   // 分类不在任何一行：整笔消失
    | 'NON_OPERATING'    // 转账 / 调整 / 押金 / 借款 / 分红：不计入（规则如此）
    | 'VIA_SETTLEMENT'   // 有 settlementId：改由日结里的副本计入
    | 'SKIPPED_PAYROLL'  // 薪资付款纪录：成本由薪资单计入
    | 'SKIPPED_BILL_SYNC'// 固定账单镜像：由固定账单付款计入
    | 'SKIPPED_RECON_FEE'// 对账手续费：传统账目略过
    | 'ZERO'             // 金额为 0 或负数
    | 'OTHER_MONTH';     // 马来西亚日期在本月，但系统按 UTC 计到别的月份
export const TREATMENT_LABEL: Record<Treatment, string> = {
    COUNTED: '已计入传统账目',
    CAPEX: '列在 CAPEX（不计入净利）',
    NOT_IN_CLASSIC: '没有进入任何科目（整笔消失）',
    NON_OPERATING: '不计入（转账 / 押金 / 借款 / 分红）',
    VIA_SETTLEMENT: '改由日结副本计入',
    SKIPPED_PAYROLL: '薪资付款纪录（由薪资单计入）',
    SKIPPED_BILL_SYNC: '固定账单镜像（由固定账单付款计入）',
    SKIPPED_RECON_FEE: '对账手续费（传统账目略过）',
    ZERO: '金额为 0',
    OTHER_MONTH: '系统按 UTC 计到别的月份',
};

export interface AuditPart {
    category: string;
    amount: number;
    line: string | null;
    section: string | null;
}

export interface Suspicion {
    reason: string;
    suggestedCategory?: string;
    suggestedLine?: string;
}

export interface AuditRow {
    id: string;
    date: string;
    /** 马来西亚日期（与 date 不同时代表 UTC 切日） */
    myDate: string;
    supplier: string;
    item: string;
    invoiceRef: string;
    voucher: string;
    amount: number;
    totalBillAmount: number;
    /** 传统账目（业务发生制）计入的金额 */
    accrualAmount: number;
    paymentStatus: string;
    paymentMethod: string;
    category: string;
    subCategory: string;
    parts: AuditPart[];
    treatment: Treatment;
    /** 分期付款的 pay_ 列：原账单已按全额计入，这笔又被计一次 */
    duplicateInstalment: boolean;
    /** 薪资 / 兼职 / 预支等含员工姓名的记录（摘要不列出名字） */
    personal: boolean;
    suspicion?: Suspicion;
    missingVoucher: boolean;
}

// ── 分类合理性：依文字关键词推测用途（只提示，不自动改）──
const KEYWORDS: { re: RegExp; category: string; label: string }[] = [
    { re: /fish\s*cake|fishcake|鱼饼|鱼丸|fish\s*ball|fishball|蟹柳|crab\s*stick|鱼豆腐|fu\s*chok|腐竹|tempura/i, category: 'INGREDIENT_SEAFOOD_PROCESSED', label: '海鲜加工品' },
    { re: /coca|coke|100\s*plus|pepsi|sprite|f\s*&\s*n|\bf&n\b|汽水|罐装|canned|soya|豆奶|milo|minuman|\bdrinks?\b|饮料/i, category: 'BEVERAGE_CANNED', label: '售卖饮料' },
    { re: /\bbeer\b|啤酒|carlsberg|tiger|heineken|guinness|\bwine\b|红酒|whisky|白酒/i, category: 'BEVERAGE_ALCOHOL', label: '酒类' },
    { re: /\bteh\b|\btea\b|茶叶|kopi|coffee|咖啡/i, category: 'BEVERAGE_TEA', label: '茶 / 咖啡' },
    { re: /\bais\b|\bice\b|冰块|冰粒/i, category: 'INGREDIENT_ICE', label: '冰块' },
    { re: /\bikan\b|\bfish\b|鱼|udang|prawn|shrimp|虾|sotong|苏东|\blala\b|啦啦|\bcrab\b|螃蟹/i, category: 'INGREDIENT_SEAFOOD', label: '海鲜' },
    { re: /ayam|chicken|鸡|猪|pork|daging|beef|牛肉|鸭|duck|肉/i, category: 'INGREDIENT_MEAT', label: '肉类' },
    { re: /sayur|vegetable|蔬菜|青菜|葱|蒜|姜|\bcili\b|chilli|chili|辣椒|tomato|番茄|bawang|洋葱/i, category: 'INGREDIENT_VEG', label: '蔬菜' },
    { re: /telur|\beggs?\b|鸡蛋|蛋/i, category: 'INGREDIENT_EGG', label: '蛋' },
    { re: /\bmee\b|noodle|面条|粿条|kuey\s*teow|bihun|米粉|beras|\brice\b|白米/i, category: 'INGREDIENT_NOODLE', label: '面 / 米' },
    { re: /kicap|\bsos\b|sauce|酱|gula|sugar|白糖|garam|\bsalt\b|食盐|tepung|flour|面粉|生粉/i, category: 'INGREDIENT_SAUCE', label: '酱料 / 调味' },
    { re: /minyak\s*masak|cooking\s*oil|食油|花生油|棕油/i, category: 'INGREDIENT_OIL', label: '食油' },
    { re: /bekas|container|打包|外卖盒|塑料袋|plastic\s*bag|paper\s*bag|tapau|straw|吸管|\bcups?\b|纸杯|\blids?\b|锡纸|\bfoil\b|保鲜膜|cling\s*wrap/i, category: 'PACKAGING', label: '包装' },
    { re: /\blpg\b|tong\s*gas|煤气|gas\s*memasak/i, category: 'GAS_COGS', label: '煤气' },
    { re: /charcoal|arang|木炭|火炭/i, category: 'CHARCOAL', label: '木炭' },
    { re: /sabun|detergent|洗洁精|清洁剂|clorox|bleach|漂白|tissue|纸巾|sponge|海绵|垃圾袋|garbage\s*bag/i, category: 'CLEANING_SUPPLY', label: '清洁用品' },
    { re: /repair|维修|修理|servis|\bservice\b|aircond|冷气|plumb|水喉|电工|electrician|maintenance|保养/i, category: 'MAINTENANCE', label: '维修保养' },
    { re: /storehub|subscription|langganan|canva|software|软件|\bdomain\b|hosting|microsoft|google\s*(workspace|one)|\bzoom\b|icloud/i, category: 'IT_SOFTWARE', label: '软件 / 订阅' },
    { re: /petrol|汽油|diesel|\btoll\b|parking|停车|minyak\s*kereta/i, category: 'TRANSPORT', label: '交通 / 油费' },
];

const lineOf = (key: string) => LINE_BY_KEY.get(key) || null;

export const guessCategory = (text: string): { category: string; label: string } | null => {
    for (const k of KEYWORDS) if (k.re.test(text)) return { category: k.category, label: k.label };
    return null;
};

const myDateOf = (value: unknown): string => {
    const s = String(value || '');
    if (/T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const t = Date.parse(s);
        if (Number.isFinite(t)) return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
    }
    return s.slice(0, 10);
};

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
        const line = lineOf(p.category);
        return { category: p.category, amount: r2(p.amount), line: line?.label || null, section: line?.section || null };
    });
};

const suspicionFor = (row: Omit<AuditRow, 'suspicion'>): Suspicion | undefined => {
    if (row.personal) return undefined;
    const text = [row.supplier, row.item, row.invoiceRef].join(' ');
    const guess = guessCategory(text);
    const cat = row.category;
    const currentLine = row.parts[0]?.line || null;
    const guessLine = guess ? lineOf(guess.category)?.label : undefined;
    if (cat === 'STAFF_MEAL' && guess && ['BEVERAGE_CANNED', 'BEVERAGE_ALCOHOL'].includes(guess.category)) {
        return { reason: `员工餐里出现「${guess.label}」字样：可能是售卖用的饮料，应计入水吧成本`, suggestedCategory: guess.category, suggestedLine: guessLine };
    }
    if (guess && guessLine && currentLine !== guessLine && categorizeExpense(cat) !== 'LABOR') {
        return { reason: `文字看起来是「${guess.label}」，目前归在「${currentLine || '没有对应科目'}」`, suggestedCategory: guess.category, suggestedLine: guessLine };
    }
    if (GENERIC.has(cat)) {
        return guess && guessLine
            ? { reason: `分类「${cat}」太笼统；文字看起来是「${guess.label}」`, suggestedCategory: guess.category, suggestedLine: guessLine }
            : { reason: `分类「${cat}」太笼统，看不出用途，请补上具体分类` };
    }
    return undefined;
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

export interface ExpenseAuditResult {
    month: string;
    rows: AuditRow[];
    totals: {
        count: number;
        apTotal: number;
        counted: number;
        capex: number;
        notInClassic: number;
        nonOperating: number;
        viaSettlement: number;
        skipped: number;
        duplicateInstalments: number;
        missingVoucher: number;
        utcShifted: number;
    };
    byCategory: { category: string; count: number; amount: number; line: string | null; section: string | null }[];
    lineChecks: LineCheck[];
    focus: Record<string, { count: number; amount: number; rows: AuditRow[] }>;
    suspicious: AuditRow[];
    notInClassic: AuditRow[];
    cashBox: CashBoxSummary;
    suggestions: string[];
}

/**
 * @param classicCostByCategory 传统账目画面目前使用的 costByCategory（legacyFinancialReport 的结果），用来核对
 */
export const auditExpenses = (
    month: string,
    data: { standaloneExpenses: any[]; settlements: any[]; billPayments: any[] },
    classicCostByCategory: Record<string, number>,
): ExpenseAuditResult => {
    const inMonth = (d: string) => d.slice(0, 7) === month;
    const rows: AuditRow[] = [];
    data.standaloneExpenses.forEach(e => {
        const id = String(e?.id || '');
        const date = String(e?.time || '').split('T')[0];
        const my = myDateOf(e?.time);
        if (!inMonth(date) && !inMonth(my)) return;
        const accrualAmount = r2(num(e.totalBillAmount || e.amount) - num(e.creditNote));
        const cat = normaliseKey(e.category, e);
        const parts = splitParts(accrualAmount, e);
        let treatment: Treatment;
        if (!inMonth(date)) treatment = 'OTHER_MONTH';
        else if (id.startsWith('payroll_') || id.startsWith('salary_')) treatment = 'SKIPPED_PAYROLL';
        else if (id.startsWith('bill_sync_')) treatment = 'SKIPPED_BILL_SYNC';
        else if (id.startsWith('recon_fee_')) treatment = 'SKIPPED_RECON_FEE';
        else if (e.settlementId) treatment = 'VIA_SETTLEMENT';
        else if (!(accrualAmount > 0)) treatment = 'ZERO';
        else if (parts.every(p => ['IGNORE', 'DIVIDEND', 'ASSET'].includes(categorizeExpense(p.category)) && !p.line)) treatment = 'NON_OPERATING';
        else if (parts.some(p => !p.line && !['IGNORE', 'DIVIDEND', 'ASSET'].includes(categorizeExpense(p.category)))) treatment = 'NOT_IN_CLASSIC';
        else if (parts.every(p => p.section === 'CAPEX')) treatment = 'CAPEX';
        else treatment = 'COUNTED';
        const personal = id.startsWith('parttime_') || id.startsWith('payroll_') || id.startsWith('salary_') || /ADVANCE|LOAN|SALARY|PAYROLL/.test(String(e.category || '').toUpperCase());
        const base = {
            id, date, myDate: my,
            supplier: String(e.company || ''),
            item: [e.particulars, e.note].filter(Boolean).join(' · '),
            invoiceRef: String(e.invoiceRef || ''),
            voucher: String(e.linkUrl || ''),
            amount: num(e.amount), totalBillAmount: num(e.totalBillAmount), accrualAmount,
            paymentStatus: String(e.paymentStatus || ''), paymentMethod: String(e.paymentMethod || ''),
            category: cat,
            subCategory: String(e.beverageSubCategory || e.seafoodSubCategory || e.marketingSubCategory || ''),
            parts, treatment,
            duplicateInstalment: false,
            personal,
            missingVoucher: !e.linkUrl && !e.invoiceRef && !personal && !id.startsWith('recon_fee_') && !id.startsWith('bill_sync_'),
        };
        rows.push({ ...base, suspicion: suspicionFor(base) });
    });

    // 分期付款：pay_<账单>_<时间>，原账单有全额 → 传统账目重复计入
    const byId = new Map(data.standaloneExpenses.map(e => [String(e?.id || ''), e]));
    rows.forEach(r => {
        if (!r.id.startsWith('pay_') || r.totalBillAmount > 0) return;
        const parentId = r.id.slice(4, r.id.lastIndexOf('_'));
        if (num(byId.get(parentId)?.totalBillAmount) > 0) r.duplicateInstalment = true;
    });

    const counted = rows.filter(r => r.treatment === 'COUNTED' || r.treatment === 'NOT_IN_CLASSIC' || r.treatment === 'CAPEX');
    const sum = (list: AuditRow[]) => r2(list.reduce((s, r) => s + r.accrualAmount, 0));
    const inMonthRows = rows.filter(r => inMonth(r.date));

    // ── 分类汇总（只算本月、会进入传统账目计算的那些）──
    const catMap = new Map<string, { category: string; count: number; amount: number; line: string | null; section: string | null }>();
    counted.forEach(r => r.parts.forEach(p => {
        const c = catMap.get(p.category) || { category: p.category, count: 0, amount: 0, line: p.line, section: p.section };
        c.count += 1; c.amount = r2(c.amount + p.amount);
        catMap.set(p.category, c);
    }));
    const byCategory = [...catMap.values()].sort((a, b) => b.amount - a.amount);

    // ── 与传统账目各科目核对：逐一来源加总，差额 ≠ 0 代表有钱没被这份审计解释 ──
    const addTo = (m: Map<string, number>, k: string, v: number) => m.set(k, r2((m.get(k) || 0) + v));
    const billsByKey = new Map<string, number>();
    data.billPayments.forEach(b => {
        if (!inMonth(String(b.date || '').split('T')[0])) return;
        const shared = (b.costShares || []).reduce((s2: number, x: any) => s2 + num(x.amount), 0);
        const v = Math.max(0, num(b.amount) - shared);
        if (v) addTo(billsByKey, normaliseKey(b.category), v);
    });
    const settleByKey = new Map<string, number>();
    data.settlements.forEach(st => {
        if (!inMonth(String(st.date || '').split('T')[0])) return;
        (st.expenses || []).forEach((e: any) => splitParts(num(e.amount), e).forEach(p => addTo(settleByKey, p.category, p.amount)));
    });
    const isComputed = (k: string) => k === 'PAYROLL' || k === 'EPF_SOCSO' || k.startsWith('PLATFORM_COMM_') || k.startsWith('PLATFORM_ADS_');
    const notInClassicRows = rows.filter(r => r.treatment === 'NOT_IN_CLASSIC');
    const lineChecks: LineCheck[] = CLASSIC_COST_LINES.map(l => {
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

    const suspicious = inMonthRows.filter(r => r.suspicion && r.treatment !== 'SKIPPED_BILL_SYNC' && r.treatment !== 'SKIPPED_RECON_FEE');
    const start = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const cashBox = reconcileCashBox(data.settlements, data.standaloneExpenses, data.billPayments, start, end);

    const dupRows = rows.filter(r => r.duplicateInstalment && inMonth(r.date));
    const utcShifted = rows.filter(r => r.date !== r.myDate && (inMonth(r.date) !== inMonth(r.myDate)));
    const suggestions: string[] = [];
    if (notInClassicRows.length) {
        const cats = [...new Set(notInClassicRows.flatMap(r => r.parts.filter(p => !p.line).map(p => p.category)))];
        suggestions.push(`有 ${notInClassicRows.length} 笔（RM ${sum(notInClassicRows).toFixed(2)}）的分类 ${cats.join('、')} 没有对应的传统账目科目，整笔没有被计算。建议在科目对照表补上对应行（程式修改，需负责人确认），或把这些账单改成已有的分类。`);
    }
    if (suspicious.length) suggestions.push(`有 ${suspicious.length} 笔分类可能不合理或太笼统（RM ${sum(suspicious).toFixed(2)}）。请在应付账款逐笔确认后手动改分类；系统不会自动修改。`);
    if (dupRows.length) suggestions.push(`有 ${dupRows.length} 笔分期付款（RM ${sum(dupRows).toFixed(2)}）在传统账目被重复计入（原账单已按全额计入）。唯一盈亏引擎（PR #36）已排除重复。`);
    if (cashBox.byStatus.MISSING.count) suggestions.push(`钱箱有 ${cashBox.byStatus.MISSING.count} 笔支出（RM ${cashBox.byStatus.MISSING.amount.toFixed(2)}）找不到应付账款 / 兼职 / 预支记录，费用可能没有入账。请补登应付账款（附收据）；钱箱本身不计入盈亏。`);
    if (cashBox.byStatus.TO_VERIFY.count + cashBox.byStatus.MISMATCH.count) suggestions.push(`钱箱另有 ${cashBox.byStatus.TO_VERIFY.count} 笔待核对、${cashBox.byStatus.MISMATCH.count} 笔金额不一致，请人工确认是否为同一笔。`);
    const noVoucher = inMonthRows.filter(r => r.missingVoucher && r.treatment === 'COUNTED');
    if (noVoucher.length) suggestions.push(`有 ${noVoucher.length} 笔已计入的费用（RM ${sum(noVoucher).toFixed(2)}）没有单据连结也没有发票号码，建议补上原始凭证。`);
    if (utcShifted.length) suggestions.push(`有 ${utcShifted.length} 笔账单时间带时区，系统按 UTC 计到另一个月份（马来西亚日期不同）。唯一盈亏引擎已改用马来西亚日期。`);

    return {
        month,
        rows: rows.sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier)),
        totals: {
            count: inMonthRows.length,
            apTotal: sum(inMonthRows),
            counted: sum(inMonthRows.filter(r => r.treatment === 'COUNTED')),
            capex: sum(inMonthRows.filter(r => r.treatment === 'CAPEX')),
            notInClassic: r2(notInClassicRows.reduce((s, r) => s + r.parts.filter(p => !p.line).reduce((a, p) => a + p.amount, 0), 0)),
            nonOperating: sum(inMonthRows.filter(r => r.treatment === 'NON_OPERATING')),
            viaSettlement: sum(inMonthRows.filter(r => r.treatment === 'VIA_SETTLEMENT')),
            skipped: sum(inMonthRows.filter(r => r.treatment.startsWith('SKIPPED'))),
            duplicateInstalments: sum(dupRows),
            missingVoucher: noVoucher.length,
            utcShifted: utcShifted.length,
        },
        byCategory,
        lineChecks,
        focus,
        suspicious,
        notInClassic: notInClassicRows,
        cashBox,
        suggestions,
    };
};
