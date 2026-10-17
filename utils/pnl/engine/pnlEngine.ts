// ============================================================================
// 金莲记 · 唯一经营盈亏引擎（权责发生制）
// ----------------------------------------------------------------------------
// 依负责人 2026-10-15 / 10-16 决定：
//   - 全 ERP 只用这一套算经营盈亏；老板驾驶舱、传统账目（含 Excel）都读这里的结果。
//   - 正式费用来源：应付账款 / 独立支出（采购、食材、杂项、维修、包装、软件…）、固定账单付款；
//     正式薪资来源：Payroll。兼职工资（parttime_）计一次；员工预支只是提早发薪，不另计成本。
//   - 日结钱箱支出（dayExpenses）完全排除：不计费、不与 AP 配对、不做漏账判断（负责人 2026-10-16）。
//   - 薪资口径与传统账目一致（2026-10-16 核对）：应发 − 无薪假 − 已扣罚款 − 其他扣款 + 雇主供款；
//     借款扣回、宿舍费都不减少人工；手动登记的工资（SALARY 等）照计，并列出供核对。
//   - 食材以采购金额计（不是实际耗用），一律注明「采购暂估」。
//   - 不使用任何比例或后备值代替真实金额；资料不足就标示原因。
//
// 输出：
//   - 五大项（营业额、平台扣款、食材、人工、其他经营费用）与经营净利；
//   - 传统账目格式的 costByCategory / laborByDept / platformGross / inStoreSales，
//     交给 buildClassicPnL 得出的净利必须等于这里的净利（自动对账测试保证）；
//   - 状态（已确认 / 暂估／待核对）与每一条原因；被排除、未计入的项目也逐项列出。
// 纯函数，不读写资料库。
// ============================================================================
import { CLASSIC_COST_LINES, LABOR_DEPT_ROLE_FALLBACK } from '../../../constants/classicPnLCostMap';
import { categorizeExpense, parentBillIdOfPayment } from '../../monthlyPnLAggregator';
import { buildMonthLabourCosts, type AttendanceSummary } from '../../labour/labourCost';
import { addDays, daysInMonth, monthsBetween, overlapDaysWithMonth } from '../../cockpit/periods';
import { computeProfitAdjustments, PLATFORMS } from '../../cockpit/profitAdjustments';
import { checkPayrollMonth } from '../reconciliation/payrollFieldCheck';
import { billPaymentCostCategory } from '../../../constants/recurringBillCategoryMap';

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 + 0;

// ── 日期：一律用马来西亚营业日 ──
export const myDate = (value: unknown): string => {
    const s = String(value || '');
    if (/T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const t = Date.parse(s);
        if (Number.isFinite(t)) return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
    }
    return s.slice(0, 10);
};

// ── 分类：每个分类都要落在传统账目的某一行 ──
export type EngineGroup = 'FOOD' | 'PLATFORM' | 'LABOUR' | 'OPEX' | 'CAPEX' | 'NON_OPERATING';

const LINE_BY_KEY = new Map<string, (typeof CLASSIC_COST_LINES)[number]>();
CLASSIC_COST_LINES.forEach(l => l.sources.forEach(s => LINE_BY_KEY.set(s, l)));

/** 旧分类 / 没有对应栏位的分类 → 传统账目已有的分类（引擎专用，不改资料） */
const ALIASES: Record<string, string> = {
    ELECTRICITY: 'UTILITIES_ELECTRIC',
    WATER: 'UTILITIES_WATER',
    ELECTRICITY_STAFF: 'UTILITIES_ELECTRIC_STAFF',
    WATER_STAFF: 'UTILITIES_WATER_STAFF',
    OTHER: 'MISC_OPEX',
    BEVERAGE_JUICE: 'BEVERAGE',
};
const LEGACY_BEVERAGE: Record<string, string> = { TEA: 'BEVERAGE_TEA', CANNED: 'BEVERAGE_CANNED', ALCOHOL: 'BEVERAGE_ALCOHOL', JUICE: 'BEVERAGE' };
const LEGACY_SEAFOOD: Record<string, string> = {
    FISH: 'INGREDIENT_FISH', SHRIMP: 'INGREDIENT_PRAWN', SOTONG: 'INGREDIENT_SOTONG',
    LALA: 'INGREDIENT_LALA', PROCESSED: 'INGREDIENT_SEAFOOD_PROCESSED', SHRIMP_SOTONG: 'INGREDIENT_PRAWN',
};

/** 薪资类：以 Payroll 为正式来源，独立支出里的这些不另计（列出待核对） */
const PAYROLL_LIKE = ['SALARY', 'PAYROLL', 'EPF', 'SOCSO', 'EIS', 'PCB', 'LINDUNG', 'ALLOWANCE', 'COMMISSION', 'EPF_SOCSO'];

export interface ResolvedCategory {
    /** 原本的分类 */
    original: string;
    /** 进 costByCategory 的分类（一定是传统账目某一行的来源，或不进盈亏） */
    key: string;
    group: EngineGroup;
    /** 传统账目行名；不进盈亏时为空 */
    line?: string;
    /** 原分类没有对应栏位，由引擎归到「其他」 */
    fallback?: boolean;
}

const groupOfLine = (key: string, section: string): EngineGroup => {
    if (section === 'COST') return 'FOOD';
    if (section === 'PERSONAL') return 'LABOUR';
    if (section === 'CAPEX') return 'CAPEX';
    if (section === 'SELLING') return key.startsWith('PLATFORM_') || key === 'MARKETING_FEE' ? 'PLATFORM' : 'OPEX';
    return 'OPEX';
};

export const resolveCategory = (rawCategory: unknown, expense?: any): ResolvedCategory => {
    const original = String(rawCategory || 'OTHER').toUpperCase();
    let key = ALIASES[original] || original;
    if (original === 'BEVERAGE' && expense?.beverageSubCategory) key = LEGACY_BEVERAGE[String(expense.beverageSubCategory).toUpperCase()] || key;
    if (original === 'INGREDIENT_SEAFOOD' && expense?.seafoodSubCategory) key = LEGACY_SEAFOOD[String(expense.seafoodSubCategory).toUpperCase()] || key;
    const line = LINE_BY_KEY.get(key);
    if (line) return { original, key, group: groupOfLine(key, line.section), line: line.label };
    const g = categorizeExpense(key);
    if (g === 'IGNORE' || g === 'DIVIDEND' || g === 'ASSET') return { original, key, group: 'NON_OPERATING' };
    // 没有对应栏位：归到同性质的「其他」行，并标示
    if (g === 'COGS') return { original, key: 'GENERAL', group: 'FOOD', line: LINE_BY_KEY.get('GENERAL')?.label, fallback: true };
    if (g === 'DELIVERY_COST') return { original, key: 'PLATFORM_FEE_OTHER', group: 'PLATFORM', line: LINE_BY_KEY.get('PLATFORM_FEE_OTHER')?.label, fallback: true };
    if (g === 'LABOR') return { original, key: 'PAYROLL_LIKE', group: 'LABOUR' };
    return { original, key: 'MISC_OPEX', group: 'OPEX', line: LINE_BY_KEY.get('MISC_OPEX')?.label, fallback: true };
};

// ── 输入与输出 ──
export interface PnLEngineInput {
    settlements: any[];
    standaloneExpenses: any[];
    billPayments: any[];
    payrollRecords: any[];
    employees: any[];
    recurringBills?: any[];
    /** 期间外的原账单（判断分期付款列是否重复用） */
    parentBills?: Map<string, { totalBillAmount?: number }>;
    /** 未发薪月份按考勤推算人工用（可无） */
    attendanceByMonth?: Record<string, Record<string, AttendanceSummary>>;
}

export type PnLStatus = 'CONFIRMED' | 'PROVISIONAL';
export const PNL_STATUS_LABEL: Record<PnLStatus, string> = { CONFIRMED: '已确认', PROVISIONAL: '暂估／待核对' };

export interface PnLReason {
    code: string;
    /** BLOCKING：未解决前不能称为已确认；INFO：说明，不影响状态 */
    level: 'BLOCKING' | 'INFO';
    label: string;
    amount?: number;
    count?: number;
}

export interface PnLLineItem { label: string; amount: number; note?: string }

export interface PnLEngineResult {
    start: string;
    end: string;
    months: string[];
    revenue: number;
    platform: number;
    food: number;
    labour: number;
    opex: number;
    netProfit: number;
    /** 传统账目的输入（buildClassicPnL 用同一份，净利必须相同） */
    classic: {
        platformGross: { grab: number; shopee: number; panda: number; lalamove: number };
        inStoreSales: number;
        costByCategory: Record<string, number>;
        laborByDept: Record<string, number>;
    };
    detail: {
        revenue: PnLLineItem[];
        platform: PnLLineItem[];
        food: PnLLineItem[];
        labour: PnLLineItem[];
        opex: PnLLineItem[];
    };
    /** 不进经营盈亏、但列出来对账的项目 */
    excluded: PnLLineItem[];
    /** 归到「其他」行的原分类 */
    fallbackCategories: { original: string; key: string; line?: string; amount: number }[];
    status: PnLStatus;
    reasons: PnLReason[];
    sourceCounts: { settlements: number; standaloneExpenses: number; billPayments: number; payrollRecords: number; employees: number };
}

const deptOf = (emp: any): string => {
    let dept = String(emp?.department || '').toUpperCase();
    if (dept && dept !== 'OTHER') return dept;
    const role = String(emp?.role || '').toUpperCase();
    const hit = LABOR_DEPT_ROLE_FALLBACK.find(rule => rule.keywords.some(k => role.includes(k.toUpperCase())));
    return hit ? hit.department : 'UNASSIGNED';
};

export const computePnL = (input: PnLEngineInput, start: string, end: string, today: string): PnLEngineResult => {
    const inRange = (d: string) => !!d && d >= start && d <= end;
    const months = monthsBetween(start, end);
    const reasons: PnLReason[] = [];
    const excluded: PnLLineItem[] = [];
    const cost: Record<string, number> = {};
    const fallback = new Map<string, { original: string; key: string; line?: string; amount: number }>();
    const add = (key: string, amount: number) => { if (amount) cost[key] = (cost[key] || 0) + amount; };
    const exclude = (label: string, amount: number, note?: string) => {
        if (Math.abs(amount) < 0.005) return;
        const row = excluded.find(x => x.label === label);
        if (row) row.amount = r2(row.amount + amount); else excluded.push({ label, amount: r2(amount), note });
    };

    // ── 1. 营业额（日结，按营业日）──
    const settlements = input.settlements.filter(s => inRange(String(s.date || '').slice(0, 10)));
    let inStoreSales = 0;
    const gross = { grab: 0, shopee: 0, panda: 0, lalamove: 0 };
    let legacyGrab = 0, legacyGrabDays = 0;
    settlements.forEach(s => {
        const sales = s.sales || {};
        inStoreSales += num(sales.cash) + num(sales.tng) + num(sales.duitnow) + num(sales.card) + num(sales.amex) - num(sales.refundTotal);
        const b = sales.deliveryBreakdown || {};
        const g = num(b.grabGross);
        if (!g && (num(b.grabNet) || num(b.grab)) > 0) {
            // 旧日结只有 Grab 净额：以净额计营业额，标示待核对
            const v = num(b.grabNet) || num(b.grab);
            gross.grab += v; legacyGrab += v; legacyGrabDays += 1;
        } else gross.grab += g;
        gross.panda += num(b.pandaGross) || num(b.panda);
        gross.shopee += num(b.shopeeGross) || num(b.shopee);
        gross.lalamove += num(b.lalamove);
    });
    const revenue = r2(inStoreSales + gross.grab + gross.panda + gross.shopee + gross.lalamove);
    if (legacyGrabDays) reasons.push({ code: 'LEGACY_GRAB', level: 'BLOCKING', label: `${legacyGrabDays} 天的 Grab 只有净额、没有总额，营业额暂以净额计`, amount: r2(legacyGrab), count: legacyGrabDays });

    // ── 2. 外送平台扣款（已对账：总额 − 实收；未对账：总额 −（净额 − 广告））+ 收款手续费 ──
    const adj = computeProfitAdjustments(input.settlements, input.standaloneExpenses, start, end);
    const perPlatform: Record<string, { amount: number; ads: number }> = {};
    settlements.forEach(s => {
        const b = s.sales?.deliveryBreakdown || {};
        const rs = s.reconStatus || {};
        PLATFORMS.forEach(ch => {
            const g = ch === 'grab' ? num(b.grabGross) : num(b[`${ch}Gross`]) || num(b[ch]);
            const netField = num(b[`${ch}Net`]);
            const net = netField > 0 ? netField : g;
            const ads = num(b[`${ch}Ads`]);
            if (g === 0 && ads === 0) return;
            const actual = typeof rs[ch] === 'number' ? Number(rs[ch]) : null;
            const deduction = Math.max(0, actual !== null ? g - actual : g - (net - ads));
            const slot = (perPlatform[ch] ||= { amount: 0, ads: 0 });
            slot.amount += deduction;
            slot.ads += Math.min(ads, deduction);
        });
    });
    Object.entries(perPlatform).forEach(([ch, v]) => {
        const k = ch.toUpperCase();
        add(`PLATFORM_ADS_${k}`, v.ads);
        add(`PLATFORM_COMM_${k}`, v.amount - v.ads);
    });
    if (adj.unreconciledPlatformDays) reasons.push({ code: 'PLATFORM_UNRECONCILED', level: 'BLOCKING', label: `外送平台 ${adj.unreconciledPlatformDays} 个平台日未对账，扣款按平台报表预估`, count: adj.unreconciledPlatformDays });
    add('BANK_FEE', adj.bankFees);

    // ── 3. 应付账款 / 独立支出（按账单日期、马来西亚日期；分期付款不重复）──
    const known = new Map<string, { totalBillAmount?: number }>(input.parentBills || []);
    input.standaloneExpenses.forEach(e => { if (e?.id && !known.has(e.id)) known.set(e.id, e); });
    const standaloneIds = new Set(input.standaloneExpenses.map(e => String(e?.id || '')));
    let advances = 0, payrollLike = 0, payrollLikeCount = 0, partTime = 0, partTimeCount = 0;
    const addExpense = (amount: number, expense: any) => {
        const splits = expense?.categorySplits;
        const parts: { amount: number; category: string; source: any }[] = [];
        if (Array.isArray(splits) && splits.length) {
            const total = splits.reduce((s: number, x: any) => s + num(x.amount), 0);
            if (total > 0) {
                let allocated = 0;
                splits.forEach((sp: any, i: number) => {
                    const part = i === splits.length - 1 ? amount - allocated : Number(((amount * num(sp.amount)) / total).toFixed(2));
                    allocated += part;
                    parts.push({ amount: part, category: sp.category, source: sp });
                });
            }
        }
        if (!parts.length) parts.push({ amount, category: expense?.category, source: expense });
        parts.forEach(p => {
            const res = resolveCategory(p.category, p.source === expense ? expense : undefined);
            if (res.group === 'NON_OPERATING') { exclude('转账 / 押金 / 借款 / 分红（不属经营费用）', p.amount); return; }
            // 资本支出：留在传统账目的 CAPEX 段（会计格式照旧显示），不进经营净利
            if (res.group === 'CAPEX') { exclude('资本支出（装修、设备，不进经营盈亏）', p.amount); add(res.key, p.amount); return; }
            if (res.key === 'STAFF_ADVANCE' || res.original.includes('ADVANCE')) { advances += p.amount; return; }
            if (res.group === 'LABOUR' && (res.key === 'PAYROLL_LIKE' || PAYROLL_LIKE.includes(res.key))) {
                // 薪资单以外手动登记的工资 / 津贴 / 法定供款：照计（与传统账目一致），列出供核对是否与薪资单重复
                payrollLike += p.amount; payrollLikeCount += 1;
                add(res.key === 'PAYROLL_LIKE' ? 'SALARY' : res.key, p.amount);
                return;
            }
            if (res.fallback) {
                const f = fallback.get(res.original) || { original: res.original, key: res.key, line: res.line, amount: 0 };
                f.amount = r2(f.amount + p.amount);
                fallback.set(res.original, f);
            }
            add(res.key, p.amount);
        });
    };
    input.standaloneExpenses.forEach(e => {
        const id = String(e?.id || '');
        if (id.startsWith('recon_fee_') || id.startsWith('bill_sync_')) return; // 手续费已另计；固定账单以付款记录为准
        if (id.startsWith('payroll_') || id.startsWith('salary_')) return;    // 发薪的付款纪录，成本以 Payroll 为准
        const date = myDate(e.time);
        if (!inRange(date)) return;
        const parentId = parentBillIdOfPayment(id);
        if (parentId && !(num(e.totalBillAmount) > 0) && num(known.get(parentId)?.totalBillAmount) > 0) return; // 原账单已按全额计
        const amount = num(e.totalBillAmount || e.amount) - num(e.creditNote);
        if (!(amount > 0)) return;
        if (id.startsWith('parttime_')) { partTime += amount; partTimeCount += 1; add('SALARY', amount); return; }
        addExpense(amount, e);
    });
    // 日结里的 expenses（旧资料）：与独立支出同一笔的不重复
    settlements.forEach(s => (s.expenses || []).forEach((e: any) => {
        if (standaloneIds.has(String(e?.id || ''))) return;
        const amount = num(e?.amount);
        if (amount > 0) addExpense(amount, e);
    }));
    if (advances) exclude('员工预支（提早发薪，成本以薪资单为准）', advances);
    if (payrollLike) {
        reasons.push({ code: 'PAYROLL_LIKE_OUTSIDE', level: 'INFO', label: `${payrollLikeCount} 笔薪资单以外手动登记的工资 / 津贴 / 法定供款已计入人工（例如补发上月少算的工资），请确认没有与薪资单重复`, amount: r2(payrollLike), count: payrollLikeCount });
    }

    // ── 4. 固定账单付款（按付款日期；扣除他人分摊）──
    const billPayments = input.billPayments.filter(b => inRange(myDate(b.date)));
    billPayments.forEach(b => {
        const shared = (b.costShares || []).reduce((s: number, x: any) => s + num(x.amount), 0);
        const amount = Math.max(0, num(b.amount) - shared);
        if (amount > 0) addExpense(amount, { category: billPaymentCostCategory(b.category) });
    });
    if (billPayments.length) reasons.push({ code: 'FIXED_BILL_BY_PAYMENT_DATE', level: 'INFO', label: '固定账单（水电、租金…）以付款日期计入当月（付款记录没有账期栏位）' });

    // ── 5. 人工（Payroll 为准；未发薪按底薪与法定供款推算；跨月或部分月份按天数分摊）──
    const laborByDept: Record<string, number> = {};
    const byId = new Map(input.employees.map(e => [e.id, e]));
    let payrollWages = 0, employerStat = 0, estimatedMonths = 0, prorated = false;
    months.forEach(m => {
        const overlap = overlapDaysWithMonth({ start, end }, m);
        if (!overlap) return;
        const share = overlap / daysInMonth(m);
        if (share < 1) prorated = true;
        const posted = input.payrollRecords.find(p => p?.month === m && p?.status === 'POSTED');
        if (posted) {
            const check = checkPayrollMonth(posted, input.employees);
            if (check.mismatchCount) reasons.push({ code: 'PAYROLL_FIELDS', level: 'BLOCKING', label: `${m} 薪资单有 ${check.mismatchCount} 人的实发无法由字段推算，这些人以应发计（未扣无薪假、罚款）`, count: check.mismatchCount });
            check.employees.forEach(e => {
                const deducted = e.penaltyStatus === 'PENALTY_DEDUCTED' ? e.penalty : 0;
                // 其他扣款（otherDeduction）与传统账目一致：从人工减掉；借款扣回、宿舍费不减（负责人 2026-10-16）
                const wages = (e.penaltyStatus === 'MISMATCH' ? e.gross : e.gross - e.unpaidLeave - deducted - e.otherDeduction) * share;
                payrollWages += wages;
                employerStat += e.employerStatutory * share;
                const dept = deptOf(byId.get(e.employeeId));
                laborByDept[dept] = (laborByDept[dept] || 0) + wages;
            });
            if (check.totals.loanRepay || check.totals.hostelFee) reasons.push({ code: 'PAYROLL_LOAN_HOSTEL', level: 'INFO', label: `${m} 薪资单的借款扣回 ${check.totals.loanRepay.toFixed(2)}、宿舍费 ${check.totals.hostelFee.toFixed(2)} 不减少人工（借款发出时是资产；宿舍费只写在薪资单）` });
            if (check.totals.otherDeduction) reasons.push({ code: 'PAYROLL_OTHER_DEDUCTION', level: 'INFO', label: `${m} 薪资单「其他扣款」${check.totals.otherDeduction.toFixed(2)} 已从人工减掉`, amount: r2(check.totals.otherDeduction) });
            if (!posted.isStatutoryPaid && check.totals.employerStatutory) reasons.push({ code: 'STATUTORY_ACCRUED', level: 'INFO', label: `${m} 法定供款尚未标记已缴，雇主供款已按应计计入人工` });
        } else {
            estimatedMonths += 1;
            const costs = buildMonthLabourCosts(m, input.employees, input.payrollRecords, input.attendanceByMonth?.[m] || {});
            const missing = costs.filter(c => c.notes.some(n => n.includes('没有底薪'))).length;
            costs.forEach(c => {
                payrollWages += c.gross * share;
                employerStat += (c.employerEpf + c.employerSocso + c.employerEis) * share;
                const dept = deptOf(byId.get(c.employeeId));
                laborByDept[dept] = (laborByDept[dept] || 0) + c.gross * share;
            });
            const draft = input.payrollRecords.some(p => p?.month === m);
            reasons.push({ code: 'PAYROLL_NOT_POSTED', level: 'BLOCKING', label: `${m} 薪资${draft ? '仍是草稿' : '尚未建立'}，人工按员工档案底薪与法定供款暂估${missing ? `（${missing} 人档案没有底薪，未计入）` : ''}` });
        }
    });
    add('PAYROLL', payrollWages);
    add('EPF_SOCSO', employerStat);
    if (prorated) reasons.push({ code: 'LABOUR_PRORATED', level: 'BLOCKING', label: '期间不是整月，人工按天数比例分摊' });
    // 兼职：PayrollRecord.partTimeDetails 只是留底，成本以 parttime_ 记录为准（计一次）

    // ── 7. 资料完整性 ──
    const lastDay = end < today ? end : addDays(today, -1);
    const settled = new Set(settlements.map(s => String(s.date).slice(0, 10)));
    const missingDays: string[] = [];
    for (let d = start; d <= lastDay; d = addDays(d, 1)) if (!settled.has(d)) missingDays.push(d);
    if (missingDays.length) reasons.push({ code: 'MISSING_SETTLEMENT', level: 'BLOCKING', label: `缺 ${missingDays.length} 天日结：${missingDays.slice(0, 5).join('、')}${missingDays.length > 5 ? '…' : ''}`, count: missingDays.length });
    if (end >= today) reasons.push({ code: 'PERIOD_OPEN', level: 'BLOCKING', label: '期间尚未结束' });

    // 固定账单：这个期间该有、却没有付款记录，也没有同类应付账款
    const familyOf = (cat: unknown): string => {
        const c = String(cat || '').toUpperCase();
        for (const k of ['RENT', 'ELECTRIC', 'WATER', 'INTERNET', 'WASTE', 'LICENSE', 'SUBSCRIPTION']) if (c.includes(k)) return k;
        return c;
    };
    const apInRange = input.standaloneExpenses.filter(e => inRange(myDate(e.time)) && !String(e.id || '').startsWith('bill_sync_'));
    (input.recurringBills || []).forEach((b: any) => {
        if (!b || b.isActive === false || b.isArchived) return;
        months.forEach(m => {
            const expected = b.type === 'MONTHLY' || (b.type === 'YEARLY' && Number(b.dueMonth) === Number(m.slice(5, 7)));
            if (!expected) return;
            if (b.contractStart && String(b.contractStart).slice(0, 7) > m) return;
            if (b.contractEnd && String(b.contractEnd).slice(0, 7) < m) return;
            const paid = input.billPayments.some(p => p.billId === b.id && myDate(p.date).slice(0, 7) === m);
            const inAp = apInRange.some(e => myDate(e.time).slice(0, 7) === m && familyOf(e.category) === familyOf(b.category));
            if (!paid && !inAp) reasons.push({ code: 'FIXED_BILL_MISSING', level: 'BLOCKING', label: `${m}「${b.name}」没有付款记录，也没有同类应付账款：费用可能遗漏`, amount: num(b.amount) || undefined });
        });
    });
    // 同一类固定费用同时在固定账单与应付账款出现、金额相同 → 疑似重复（不自动删除）
    billPayments.forEach(p => {
        const dup = apInRange.find(e => familyOf(e.category) === familyOf(p.category) && Math.abs(num(e.totalBillAmount || e.amount) - num(p.amount)) < 0.01);
        if (dup) reasons.push({ code: 'FIXED_BILL_DUPLICATE', level: 'BLOCKING', label: `「${p.name || p.category}」${num(p.amount).toFixed(2)} 同时出现在固定账单与应付账款，疑似重复（两笔都已计入，请核对）`, amount: num(p.amount) });
    });
    if (fallback.size) reasons.push({ code: 'CATEGORY_FALLBACK', level: 'INFO', label: `${fallback.size} 个分类没有对应会计科目，已归入「其他」行：${[...fallback.keys()].join('、')}` });
    reasons.push({ code: 'FOOD_PURCHASE_BASIS', level: 'INFO', label: '食材以采购金额计（采购暂估），不是已核实的实际耗用' });

    // ── 汇总 ──
    Object.keys(cost).forEach(k => { cost[k] = r2(cost[k]); });
    Object.keys(laborByDept).forEach(k => { laborByDept[k] = r2(laborByDept[k]); });
    const groupTotals: Record<EngineGroup, number> = { FOOD: 0, PLATFORM: 0, LABOUR: 0, OPEX: 0, CAPEX: 0, NON_OPERATING: 0 };
    const detailRows: Record<'food' | 'platform' | 'labour' | 'opex', PnLLineItem[]> = { food: [], platform: [], labour: [], opex: [] };
    Object.entries(cost).forEach(([k, v]) => {
        const line = LINE_BY_KEY.get(k);
        if (!line) return;
        const g = groupOfLine(k, line.section);
        groupTotals[g] += v;
        const bucket = g === 'FOOD' ? 'food' : g === 'PLATFORM' ? 'platform' : g === 'LABOUR' ? 'labour' : g === 'OPEX' ? 'opex' : null;
        if (bucket && Math.abs(v) >= 0.005) detailRows[bucket].push({ label: k, amount: v, note: line.label });
    });
    (Object.keys(detailRows) as (keyof typeof detailRows)[]).forEach(k => detailRows[k].sort((a, b) => b.amount - a.amount));
    const food = r2(groupTotals.FOOD), platform = r2(groupTotals.PLATFORM), labour = r2(groupTotals.LABOUR), opex = r2(groupTotals.OPEX);
    const blocking = reasons.some(r => r.level === 'BLOCKING');

    return {
        start, end, months,
        revenue, platform, food, labour, opex,
        netProfit: r2(revenue - platform - food - labour - opex),
        classic: { platformGross: { grab: r2(gross.grab), shopee: r2(gross.shopee), panda: r2(gross.panda), lalamove: r2(gross.lalamove) }, inStoreSales: r2(inStoreSales), costByCategory: cost, laborByDept },
        detail: {
            revenue: [
                { label: '店内 POS 实收（扣退款）', amount: r2(inStoreSales) },
                { label: 'GrabFood（总额）', amount: r2(gross.grab) },
                { label: 'Foodpanda（总额）', amount: r2(gross.panda) },
                { label: 'ShopeeFood（总额）', amount: r2(gross.shopee) },
                { label: 'Lalamove', amount: r2(gross.lalamove) },
            ].filter(x => x.amount !== 0 || x.label.startsWith('店内')),
            ...detailRows,
            labour: [
                { label: '正职薪资（应发 − 无薪假 − 已扣罚款）', amount: r2(payrollWages), note: estimatedMonths ? '含暂估' : undefined },
                { label: '雇主 EPF / SOCSO / EIS', amount: r2(employerStat) },
                { label: `兼职工资（${partTimeCount} 笔）`, amount: r2(partTime) },
                ...detailRows.labour.filter(x => !['PAYROLL', 'EPF_SOCSO', 'SALARY'].includes(x.label)),
            ].filter(x => Math.abs(x.amount) >= 0.005),
        },
        excluded,
        fallbackCategories: [...fallback.values()],
        status: blocking ? 'PROVISIONAL' : 'CONFIRMED',
        reasons,
        sourceCounts: {
            settlements: settlements.length,
            standaloneExpenses: input.standaloneExpenses.length,
            billPayments: input.billPayments.length,
            payrollRecords: input.payrollRecords.filter(p => months.includes(p?.month)).length,
            employees: input.employees.length,
        },
    };
};
