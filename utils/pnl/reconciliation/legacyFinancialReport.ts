// ============================================================================
// 盈亏对账 · 旧算法 A：财务报表首页「经营净利」（照抄，只读）
// ----------------------------------------------------------------------------
// 逐行照抄 components/features/FinancialReport.tsx（2026-10-15 版本）的 analytics useMemo
//   :378-784（本期部分；上期比较不需要）与 :967-980（传统账目的 costByCategory）。
// 目的只有一个：在对账画面重现财务报表「现在」算出的数字，与其他算法逐项比较。
// 这里**不修正任何问题**——包括 57,300 后备值、广告漏扣——修正放在统一引擎（PR 2）。
//
// 2026-10-16 财务报表本身修了两处（杂项费用审计第二轮），这份照抄同步：
//   1. 月份边界改用马来西亚日期（带时区的时间先换算），不再用 UTC 字串切日
//   2. 业务发生制排除分期付款的第二笔以后（pay_<账单>_<时间>），原账单已按全额计入
//   3. 固定账单付款换成与应付账款镜像相同的分类（宿舍水电、订阅、其他固定账单原本找不到科目）
// version: 'BEFORE_FIX' 重现修正前的算法，只给对账 / 修正前后比较用。
// ============================================================================
import { categorizeExpense, splitAccrualDuplicatePayments } from '../../monthlyPnLAggregator';
import { toMalaysiaDay } from '../../dateHelper';
import { billPaymentCostCategory } from '../../../constants/recurringBillCategoryMap';

const num = (v: unknown) => Number(v) || 0;

export interface LegacyFinancialReportResult {
    revenue: number;
    platform: number;
    food: number;
    labour: number;
    opex: number;
    netProfit: number;
    /** 财务报表人工的来源（画面上「薪资预测」显示的同一个判断） */
    labourSource: 'POSTED' | 'DRAFT' | 'BASIC_SALARY' | 'ACTUAL_LABOR_EXPENSES' | 'FALLBACK_57300';
    /** 分摊前的整月人工基数 */
    baseMonthlyLabour: number;
    settledDays: number;
    daysInMonth: number;
    /** 被「人工基数」取代、不计入净利的 LABOR 类支出（兼职、员工餐、预支…；不含薪资单本身） */
    labourExpensesNotCounted: number;
    variance: number;
    /** 传统账目分页收到的 costByCategory（与画面相同） */
    classicCostByCategory: Record<string, number>;
    inStoreSales: number;
    platformGross: { grab: number; shopee: number; panda: number; lalamove: number };
}

export const legacyFinancialReport = (
    input: {
        settlements: any[];
        standaloneExpenses: any[];
        billPayments: any[];
        payrollRecords: any[];
        employees: any[];
        /** 分期付款列对应、但不在读取区间内的原账单 */
        parentBills?: Map<string, { totalBillAmount?: number }>;
    },
    startDate: string,
    endDate: string,
    accountingMode: 'ACCRUAL' | 'CASH' = 'ACCRUAL',
    version: 'CURRENT' | 'BEFORE_FIX' = 'CURRENT',
): LegacyFinancialReportResult => {
    const { settlements, billPayments, payrollRecords, employees } = input;
    const fixed = version === 'CURRENT';
    const standaloneExpenses = fixed
        ? splitAccrualDuplicatePayments(input.standaloneExpenses, accountingMode, input.parentBills).kept
        : input.standaloneExpenses;
    const isCurrentRange = (dateStr: string) => {
        if (!dateStr) return false;
        const d = fixed ? toMalaysiaDay(dateStr) : String(dateStr).split('T')[0];
        return d >= startDate && d <= endDate;
    };

    const rev = { inStoreSales: 0, totalGrossRevenue: 0, variance: 0 };
    const bdown = { grabGross: 0, grabAds: 0, pandaGross: 0, pandaAds: 0, shopeeGross: 0, shopeeAds: 0, lalamove: 0 };
    let totalCOGS = 0, totalLabor = 0, totalOPEX = 0;
    let totalPandaFees = 0, totalShopeeFees = 0, totalOtherPlatformFees = 0;
    let totalGrabCommission = 0, totalShopeeCommission = 0, totalPandaCommission = 0;
    const groups: Record<string, number> = {};
    const dailySalesMap: Record<string, number> = {};

    const legacyBeverageMap: Record<string, string> = { TEA: 'BEVERAGE_TEA', CANNED: 'BEVERAGE_CANNED', ALCOHOL: 'BEVERAGE_ALCOHOL' };
    const legacySeafoodMap: Record<string, string> = {
        FISH: 'INGREDIENT_FISH', SHRIMP: 'INGREDIENT_PRAWN', SOTONG: 'INGREDIENT_SOTONG',
        LALA: 'INGREDIENT_LALA', PROCESSED: 'INGREDIENT_SEAFOOD_PROCESSED', SHRIMP_SOTONG: 'INGREDIENT_PRAWN',
    };

    const addCost = (amount: number, category: string, label: string | undefined) => {
        if (!amount) return;
        let catKey = category ? String(category).toUpperCase() : 'OTHER';
        if (catKey === 'ELECTRICITY') catKey = 'UTILITIES_ELECTRIC';
        if (catKey === 'WATER') catKey = 'UTILITIES_WATER';
        const type = categorizeExpense(catKey);
        if (type === 'IGNORE') return;
        if (type === 'ASSET' || type === 'CAPEX' || type === 'DIVIDEND') {
            // 不进净利
        } else if (type === 'COGS') totalCOGS += amount;
        else if (type === 'LABOR') totalLabor += amount;
        else if (type === 'DELIVERY_COST') {
            const lowerLabel = (label || '').toUpperCase();
            if (catKey.includes('PANDA') || lowerLabel.includes('PANDA')) totalPandaFees += amount;
            else if (catKey.includes('SHOPEE') || lowerLabel.includes('SHOPEE')) totalShopeeFees += amount;
            else totalOtherPlatformFees += amount;
        } else totalOPEX += amount;
        groups[catKey] = (groups[catKey] || 0) + amount;
    };

    const addCostWithSplits = (amount: number, expense: any, label: string | undefined) => {
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
                    const part = i === splits.length - 1 ? amount - allocated : Number(((amount * num(sp.amount)) / splitTotal).toFixed(2));
                    allocated += part;
                    addCost(part, sp.category, label);
                });
                return;
            }
        }
        addCost(amount, effectiveCategory, label);
    };

    // :526-624 日结
    settlements.forEach(s => {
        const dStr = String(s.date || '').split('T')[0];
        if (!isCurrentRange(dStr)) return;
        const posSales = num(s.sales?.cash) + num(s.sales?.tng) + num(s.sales?.duitnow) + num(s.sales?.card) + num(s.sales?.amex);
        const netStoreSales = posSales - num(s.sales?.refundTotal);
        const b: Record<string, any> = s.sales?.deliveryBreakdown || {};
        const gGross = num(b.grabGross);
        const pGross = num(b.pandaGross) || num(b.panda);
        const shGross = num(b.shopeeGross) || num(b.shopee);
        const lala = num(b.lalamove);
        const dailyDeliveryGross = gGross + pGross + shGross + lala;
        const dailyTotalGross = netStoreSales + dailyDeliveryGross;
        const rs = s.reconStatus || {};
        const rawGNet = typeof rs.grab === 'number' ? Number(rs.grab) : (num(b.grabNet) || num(b.grab));
        const gNet = rawGNet > 0 ? rawGNet : gGross;
        const rawShNet = typeof rs.shopee === 'number' ? Number(rs.shopee) : (b.shopeeNet !== undefined ? num(b.shopeeNet) : num(b.shopee));
        const shNet = rawShNet > 0 ? rawShNet : shGross;
        const rawPNet = typeof rs.panda === 'number' ? Number(rs.panda) : (b.pandaNet !== undefined ? num(b.pandaNet) : num(b.panda));
        const pNet = rawPNet > 0 ? rawPNet : pGross;
        totalGrabCommission += gNet > 0 && gGross > gNet ? gGross - gNet : 0;
        totalShopeeCommission += shNet > 0 && shGross > shNet ? shGross - shNet : 0;
        totalPandaCommission += pNet > 0 && pGross > pNet ? pGross - pNet : 0;

        rev.variance += num(s.variance);
        rev.inStoreSales += netStoreSales;
        rev.totalGrossRevenue += dailyTotalGross;
        bdown.grabGross += gGross; bdown.grabAds += num(b.grabAds);
        bdown.pandaGross += pGross; bdown.pandaAds += num(b.pandaAds);
        bdown.shopeeGross += shGross; bdown.shopeeAds += num(b.shopeeAds);
        bdown.lalamove += lala;
        dailySalesMap[dStr] = dailyTotalGross;
        (s.expenses || []).forEach((e: any) => addCostWithSplits(num(e.amount), e, e.company || e.note));
    });

    // :633-646 独立支出
    standaloneExpenses.forEach(e => {
        const id = String(e.id || '');
        if (id.startsWith('payroll_') || id.startsWith('salary_') || e.settlementId || id.startsWith('bill_sync_') || id.startsWith('recon_fee_')) return;
        const dateToUse = accountingMode === 'ACCRUAL' ? e.time : (e.paymentDate || e.time);
        if (!isCurrentRange(dateToUse)) return;
        if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
        const amt = Number(accountingMode === 'ACCRUAL' ? (e.totalBillAmount || e.amount) : e.amount) - num(e.creditNote);
        if (amt > 0) addCostWithSplits(amt, e, e.company || e.note);
    });

    // :648-656 固定账单付款
    billPayments.forEach(b => {
        const shared = (b.costShares || []).reduce((sum: number, x: any) => sum + num(x.amount), 0);
        const netAmt = Math.max(0, num(b.amount) - shared);
        if (isCurrentRange(b.date)) addCost(netAmt, fixed ? billPaymentCostCategory(b.category) : b.category, b.note || b.payee || b.companyLabel);
    });

    // :670-685
    const netPayFromDetails = (p: any): number => {
        const details: any[] = Array.isArray(p.details) ? p.details : [];
        if (details.length === 0) return num(p.totalNetPay);
        return details.reduce((sum, d) => {
            const amount = num(d?.netPay);
            if (d?.isPaid) return sum + amount;
            const emp = employees.find(e => e.id === d?.employeeId);
            if (emp) {
                const terminated = emp.isArchived || emp.status === 'TERMINATED';
                const term = emp.terminationDate ? String(emp.terminationDate).substring(0, 7) : '';
                if (terminated && term && term < p.month) return sum;
            }
            return sum + amount;
        }, 0);
    };

    // :687-726 薪资（本期）
    const payrollSummary = { monthlyTotal: 0, isPosted: false };
    payrollRecords.forEach(p => {
        if (!isCurrentRange(`${p.month}-28`)) return;
        if (p.status === 'POSTED') {
            const net = netPayFromDetails(p);
            const govt = num(p.totalGovtPay);
            addCost(net, 'PAYROLL', undefined);
            payrollSummary.monthlyTotal += net + govt;
            payrollSummary.isPosted = true;
            if (p.isStatutoryPaid) addCost(govt, 'EPF_SOCSO', undefined);
        } else {
            const net = accountingMode === 'ACCRUAL'
                ? netPayFromDetails(p)
                : (p.details || []).reduce((s: number, d: any) => s + (d?.isPaid ? num(d?.netPay) : 0), 0);
            if (net > 0.005) addCost(net, 'PAYROLL', undefined);
        }
    });

    // :728-753 薪资预测
    let estimatedPayroll = 0;
    let forecastSource: 'POSTED' | 'DRAFT' | 'BASIC_SALARY' | 'NONE' = 'NONE';
    const activeBasic = employees.filter(e => e.status !== 'TERMINATED' && !e.isArchived).reduce((acc, e) => acc + num(e.basicSalary), 0);
    if (payrollSummary.isPosted) forecastSource = 'POSTED';
    else if (new Date(endDate).getDate() > 1) {
        const draftRecord = payrollRecords.find(p => p?.id === startDate.slice(0, 7) && p?.status === 'DRAFT');
        if (draftRecord) {
            const draftTotal = netPayFromDetails(draftRecord) + num(draftRecord.totalGovtPay);
            if (draftTotal > 0) { estimatedPayroll = draftTotal; forecastSource = 'DRAFT'; }
        }
        if (estimatedPayroll === 0) {
            estimatedPayroll = activeBasic;
            if (estimatedPayroll > 0) forecastSource = 'BASIC_SALARY';
        }
    }

    // :755-784
    const totalDeliveryDirectCost = totalGrabCommission + totalPandaFees + totalPandaCommission + totalShopeeFees + totalShopeeCommission + totalOtherPlatformFees;
    const netRealizedRevenue = rev.totalGrossRevenue - totalDeliveryDirectCost;
    const settledDays = Object.keys(dailySalesMap).length;
    const [yrStr, moStr] = startDate.split('-');
    const daysInMonth = new Date(parseInt(yrStr) || 2026, parseInt(moStr) || 6, 0).getDate() || 30;
    let labourSource: LegacyFinancialReportResult['labourSource'];
    let baseMonthlyLabor: number;
    if (payrollSummary.isPosted) { baseMonthlyLabor = payrollSummary.monthlyTotal; labourSource = 'POSTED'; }
    else if (estimatedPayroll > 0) { baseMonthlyLabor = estimatedPayroll; labourSource = forecastSource === 'DRAFT' ? 'DRAFT' : 'BASIC_SALARY'; }
    else if (totalLabor > 0) { baseMonthlyLabor = totalLabor; labourSource = 'ACTUAL_LABOR_EXPENSES'; }
    else if (activeBasic > 0) { baseMonthlyLabor = activeBasic; labourSource = 'BASIC_SALARY'; }
    else { baseMonthlyLabor = 57300; labourSource = 'FALLBACK_57300'; }
    const totalLaborSynced = (baseMonthlyLabor / daysInMonth) * settledDays;
    const netProfit = netRealizedRevenue - (totalCOGS + totalLaborSynced + totalOPEX);

    // :967-980 传统账目的 costByCategory
    const classicCostByCategory = { ...groups };
    const put = (k: string, v: number) => { if (v > 0.005) classicCostByCategory[k] = (classicCostByCategory[k] || 0) + v; };
    put('PLATFORM_COMM_GRAB', Math.max(0, totalGrabCommission - bdown.grabAds));
    put('PLATFORM_ADS_GRAB', bdown.grabAds);
    put('PLATFORM_COMM_PANDA', Math.max(0, totalPandaCommission - bdown.pandaAds));
    put('PLATFORM_ADS_PANDA', bdown.pandaAds);
    put('PLATFORM_COMM_SHOPEE', Math.max(0, totalShopeeCommission - bdown.shopeeAds));
    put('PLATFORM_ADS_SHOPEE', bdown.shopeeAds);

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
        revenue: r2(rev.totalGrossRevenue),
        platform: r2(totalDeliveryDirectCost),
        food: r2(totalCOGS),
        labour: r2(totalLaborSynced),
        opex: r2(totalOPEX),
        netProfit: r2(netProfit),
        labourSource,
        baseMonthlyLabour: r2(baseMonthlyLabor),
        settledDays,
        daysInMonth,
        labourExpensesNotCounted: labourSource === 'ACTUAL_LABOR_EXPENSES' ? 0 : r2(
            Object.entries(groups)
                .filter(([k]) => categorizeExpense(k) === 'LABOR' && k !== 'PAYROLL' && k !== 'EPF_SOCSO')
                .reduce((s, [, v]) => s + v, 0),
        ),
        variance: r2(rev.variance),
        classicCostByCategory,
        inStoreSales: r2(rev.inStoreSales),
        platformGross: { grab: bdown.grabGross, shopee: bdown.shopeeGross, panda: bdown.pandaGross, lalamove: bdown.lalamove },
    };
};
