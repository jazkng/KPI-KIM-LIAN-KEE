// ==========================================
// 📒 按月汇总 — 给「多月份 P&L 导出」用
// ------------------------------------------
// ⚠️ 这里的算法是照抄 FinancialReport 的那段大 useMemo，
//    目的是能一个月一个月循环算，而画面那边一行都不用动（零风险）。
//
//    因为是两份代码，怕它们以后走歪，导出时会做一次「自我校验」：
//    拿本月算出来的 costByCategory 跟画面正在用的那份逐项比对，
//    有差就把差异写在 Excel 最后，让老板一眼看到。
// ==========================================

import { SettlementRecord, ExpenseItem, PayrollRecord, Employee, BillPaymentRecord } from '../types';
import { LABOR_DEPT_ROLE_FALLBACK } from '../constants/classicPnLCostMap';

export interface MonthlyRawData {
    settlements: SettlementRecord[];
    standaloneExpenses: ExpenseItem[];
    billPayments: BillPaymentRecord[];
    payrollRecords: PayrollRecord[];
    employees: Employee[];
}

export interface MonthlyPnLInputs {
    month: string;                       // 'YYYY-MM'
    costByCategory: Record<string, number>;
    platformGross: { grab: number; shopee: number; panda: number; lalamove: number };
    inStoreSales: number;
    laborByDept: Record<string, number>;
    /** 这个月有没有任何一笔结算，没有就不用出这一栏 */
    hasData: boolean;
}

const num = (v: any): number => Number(v) || 0;

/** 照抄 FinancialReport.categorizeExpense —— 分类规则必须跟画面一致 */
export const categorizeExpense = (category: string): string => {
    const c = category?.toUpperCase() || 'OTHER';
    if (['TRANSFER', 'FUND', 'ADJUSTMENT', 'SALES'].some(k => c.includes(k))) return 'IGNORE';
    if (c.includes('DIVIDEND')) return 'DIVIDEND';
    if (c.includes('DEPOSIT') || c.includes('STAFF_LOAN')) return 'ASSET';
    if (['INGREDIENT', 'MEAT', 'SEAFOOD', 'VEG', 'DRY', 'SAUCE', 'NOODLE', 'OIL', 'EGG', 'FROZEN', 'BEVERAGE', 'PACKAGING', 'GAS_COGS', 'CHARCOAL', 'SUPPLIER', 'HQ'].some(k => c.includes(k))) return 'COGS';
    if (['SALARY', 'EPF', 'SOCSO', 'ADVANCE', 'COMMISSION', 'STAFF_ADVANCE', 'ALLOWANCE', 'PAYROLL', 'STAFF_MEAL', 'STAFF_ACCOMMODATION'].some(k => c.includes(k))) return 'LABOR';
    if (['EQUIPMENT', 'KITCHEN_EQUIPMENT', 'FURNITURE', 'RENOVATION', 'IT_SYSTEM', 'SIGNAGE'].some(k => c === k)) return 'CAPEX';
    if (['PLATFORM_FEE', 'MARKETING_FEE'].some(k => c.includes(k))) return 'DELIVERY_COST';
    return 'OPEX';
};

const legacyBeverageMap: Record<string, string> = {
    JUICE: 'BEVERAGE_JUICE', TEA: 'BEVERAGE_TEA', CANNED: 'BEVERAGE_CANNED', ALCOHOL: 'BEVERAGE_ALCOHOL',
};
const legacySeafoodMap: Record<string, string> = {
    FISH: 'INGREDIENT_FISH', SHRIMP: 'INGREDIENT_PRAWN', SOTONG: 'INGREDIENT_SOTONG',
    LALA: 'INGREDIENT_LALA', PROCESSED: 'INGREDIENT_SEAFOOD_PROCESSED', SHRIMP_SOTONG: 'INGREDIENT_PRAWN',
};

/**
 * 算一个月的传统账目输入值。
 * @param month 'YYYY-MM'
 * @param accountingMode 'ACCRUAL'(业务发生) / 'CASH'(现金实收)，要跟画面上选的一样
 */
export const aggregateMonth = (
    month: string,
    data: MonthlyRawData,
    accountingMode: 'ACCRUAL' | 'CASH' = 'ACCRUAL',
): MonthlyPnLInputs => {
    const { settlements, standaloneExpenses, billPayments, payrollRecords, employees } = data;
    const inMonth = (d?: string) => !!d && String(d).slice(0, 7) === month;

    const cost: Record<string, number> = {};
    const bdown = { grabGross: 0, grabNet: 0, grabAds: 0, pandaGross: 0, pandaNet: 0, pandaAds: 0, shopeeGross: 0, shopeeNet: 0, shopeeAds: 0, lalamove: 0 };
    let grabComm = 0, pandaComm = 0, shopeeComm = 0;
    let inStoreSales = 0;
    let hasData = false;

    const addCost = (amount: number, category: string, ) => {
        if (!amount) return;
        let catKey = category ? String(category).toUpperCase() : 'OTHER';
        if (catKey === 'ELECTRICITY') catKey = 'UTILITIES_ELECTRIC';
        if (catKey === 'WATER') catKey = 'UTILITIES_WATER';
        if (categorizeExpense(catKey) === 'IGNORE') return;
        cost[catKey] = (cost[catKey] || 0) + amount;
    };

    const addCostWithSplits = (amount: number, expense: any) => {
        let effectiveCategory = expense?.category || 'OTHER';
        const upperCat = String(effectiveCategory).toUpperCase();
        if (upperCat === 'BEVERAGE' && expense?.beverageSubCategory) {
            effectiveCategory = legacyBeverageMap[String(expense.beverageSubCategory).toUpperCase()] || effectiveCategory;
        } else if (upperCat === 'INGREDIENT_SEAFOOD' && expense?.seafoodSubCategory) {
            effectiveCategory = legacySeafoodMap[String(expense.seafoodSubCategory).toUpperCase()] || effectiveCategory;
        }
        const splits = expense?.categorySplits;
        if (Array.isArray(splits) && splits.length > 0) {
            const splitTotal = splits.reduce((s: number, x: any) => s + num(x.amount), 0);
            if (splitTotal > 0) {
                let allocated = 0;
                splits.forEach((sp: any, i: number) => {
                    const part = i === splits.length - 1
                        ? amount - allocated
                        : Number(((amount * num(sp.amount)) / splitTotal).toFixed(2));
                    allocated += part;
                    addCost(part, sp.category);
                });
                return;
            }
        }
        addCost(amount, effectiveCategory);
    };

    // ---------- 1. 每日结算 ----------
    settlements.forEach(s => {
        const dStr = String(s.date || '').split('T')[0];
        if (!inMonth(dStr)) return;
        hasData = true;

        const posSales = num(s.sales?.cash) + num(s.sales?.tng) + num(s.sales?.duitnow) + num(s.sales?.card) + num(s.sales?.amex);
        inStoreSales += posSales - num(s.sales?.refundTotal);

        const b: Record<string, any> = (s.sales?.deliveryBreakdown || {}) as any;
        const gGross = num(b.grabGross);
        const pGross = num(b.pandaGross) || num(b.panda);
        const shGross = num(b.shopeeGross) || num(b.shopee);

        const rs: any = (s as any).reconStatus || {};
        const pick = (key: string, fallback: number) =>
            (rs[key] !== undefined && typeof rs[key] === 'number') ? Number(rs[key]) : fallback;

        const gNetRaw = pick('grab', num(b.grabNet) || num(b.grab));
        const gNet = gNetRaw > 0 ? gNetRaw : gGross;
        const pNetRaw = pick('panda', b.pandaNet !== undefined ? num(b.pandaNet) : num(b.panda));
        const pNet = pNetRaw > 0 ? pNetRaw : pGross;
        const shNetRaw = pick('shopee', b.shopeeNet !== undefined ? num(b.shopeeNet) : num(b.shopee));
        const shNet = shNetRaw > 0 ? shNetRaw : shGross;

        bdown.grabGross += gGross;   bdown.grabNet += gNet;   bdown.grabAds += num(b.grabAds);
        bdown.pandaGross += pGross;  bdown.pandaNet += pNet;  bdown.pandaAds += num(b.pandaAds);
        bdown.shopeeGross += shGross; bdown.shopeeNet += shNet; bdown.shopeeAds += num(b.shopeeAds);
        bdown.lalamove += num(b.lalamove);

        grabComm   += (gNet > 0 && gGross > gNet) ? (gGross - gNet) : 0;
        pandaComm  += (pNet > 0 && pGross > pNet) ? (pGross - pNet) : 0;
        shopeeComm += (shNet > 0 && shGross > shNet) ? (shGross - shNet) : 0;

        (s.expenses || []).forEach((e: any) => addCostWithSplits(num(e.amount), e));
    });

    // ---------- 2. 独立支出 ----------
    standaloneExpenses.forEach((e: any) => {
        if (!e?.id) return;
        if (String(e.id).startsWith('payroll_') || String(e.id).startsWith('salary_') || e.settlementId
            || String(e.id).startsWith('bill_sync_') || String(e.id).startsWith('recon_fee_')) return;
        const dateToUse = accountingMode === 'ACCRUAL' ? e.time : (e.paymentDate || e.time);
        if (!inMonth(dateToUse)) return;
        if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
        const amt = num(accountingMode === 'ACCRUAL' ? (e.totalBillAmount || e.amount) : e.amount) - num(e.creditNote);
        if (amt > 0) addCostWithSplits(amt, e);
    });

    // ---------- 3. 账单付款 ----------
    billPayments.forEach((b: any) => {
        if (!inMonth(b?.date)) return;
        const shared = (b.costShares || []).reduce((s: number, x: any) => s + num(x.amount), 0);
        addCost(Math.max(0, num(b.amount) - shared), b.category);
    });

    // ---------- 4. 薪资（POSTED 照算；未结账按看账模式，跟画面一致）----------
    const netPayFromDetails = (p: any): number => {
        const details: any[] = Array.isArray(p?.details) ? p.details : [];
        if (details.length === 0) return num(p?.totalNetPay);
        return details.reduce((sum, d) => {
            const amount = num(d?.netPay);
            if (d?.isPaid) return sum + amount;
            const emp = employees.find(x => x.id === d?.employeeId);
            if (emp) {
                const terminated = emp.isArchived || emp.status === 'TERMINATED';
                const term = emp.terminationDate ? emp.terminationDate.substring(0, 7) : '';
                if (terminated && term && term < p.month) return sum;
            }
            return sum + amount;
        }, 0);
    };

    const laborByDept: Record<string, number> = {};
    payrollRecords.forEach((p: any) => {
        if (p?.month !== month) return;
        if (p?.status === 'POSTED') {
            addCost(netPayFromDetails(p), 'PAYROLL');
            if (p.isStatutoryPaid) addCost(num(p.totalGovtPay), 'EPF_SOCSO');
        } else {
            // 跟画面同口径：未结账的月份，业务发生 = 整月净发；现金实收 = 已发的那几个人
            addCost(
                accountingMode === 'ACCRUAL'
                    ? netPayFromDetails(p)
                    : (p?.details || []).reduce((s: number, d: any) => s + (d?.isPaid ? num(d?.netPay) : 0), 0),
                'PAYROLL',
            );
        }
        // 部门明细：不管 POSTED 与否都拆（跟画面的 classicLaborByDept 一致）
        (p?.details || []).forEach((d: any) => {
            // 跟画面同口径：净发 + 预支（不是 totalCost）
            const cashNotPaid = accountingMode === 'CASH' && p?.status !== 'POSTED' && !d?.isPaid;
            const c = (cashNotPaid ? 0 : num(d?.netPay)) + num(d?.advanceLoan);
            if (!c) return;
            const emp = employees.find(x => x.id === d?.employeeId);
            let dept = emp?.department ? String(emp.department).toUpperCase() : '';
            if (!dept || dept === 'OTHER') {
                const role = String(emp?.role || '').toUpperCase();
                const hit = LABOR_DEPT_ROLE_FALLBACK.find(rule => rule.keywords.some(k => role.includes(k.toUpperCase())));
                dept = hit ? hit.department : 'UNASSIGNED';
            }
            laborByDept[dept] = (laborByDept[dept] || 0) + c;
        });
    });

    // ---------- 5. 平台抽佣 / 广告（算出来的，不走支出单）----------
    const put = (k: string, v: number) => { if (v > 0.005) cost[k] = (cost[k] || 0) + v; };
    put('PLATFORM_COMM_GRAB',   Math.max(0, grabComm - bdown.grabAds));
    put('PLATFORM_ADS_GRAB',    bdown.grabAds);
    put('PLATFORM_COMM_PANDA',  Math.max(0, pandaComm - bdown.pandaAds));
    put('PLATFORM_ADS_PANDA',   bdown.pandaAds);
    put('PLATFORM_COMM_SHOPEE', Math.max(0, shopeeComm - bdown.shopeeAds));
    put('PLATFORM_ADS_SHOPEE',  bdown.shopeeAds);

    return {
        month,
        costByCategory: cost,
        platformGross: { grab: bdown.grabGross, shopee: bdown.shopeeGross, panda: bdown.pandaGross, lalamove: bdown.lalamove },
        inStoreSales,
        laborByDept,
        hasData,
    };
};

/** 从起讫月份产生月份清单，例如 2026-01 ~ 2026-08 */
export const monthRange = (start: string, end: string, max = 12): string[] => {
    const out: string[] = [];
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while ((y < ey || (y === ey && m <= em)) && out.length < max) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
};

/** 自我校验：拿新算法的结果跟画面正在用的那份比对，回传对不上的科目 */
export const diffCostByCategory = (
    mine: Record<string, number>,
    theirs: Record<string, number>,
    tolerance = 0.01,
): { key: string; mine: number; theirs: number; diff: number }[] => {
    const keys = Array.from(new Set([...Object.keys(mine), ...Object.keys(theirs)]));
    return keys
        .map(k => ({ key: k, mine: mine[k] || 0, theirs: theirs[k] || 0, diff: Number(((mine[k] || 0) - (theirs[k] || 0)).toFixed(2)) }))
        .filter(x => Math.abs(x.diff) > tolerance)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
};
