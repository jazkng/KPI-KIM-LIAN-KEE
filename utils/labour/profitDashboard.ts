// ============================================================================
// 老板「人工成本与盈利」月度快照（Issue #8 · 任务二）
// ----------------------------------------------------------------------------
// 纯计算：输入一个月的损益原始资料（aggregateMonth 的结果）与人工成本明细，
// 输出雇主人工总成本、人工成本率、保本营业额、预估利润，
// 并把每一项标明资料状态：已结算 / 估算 / 缺失。
//
// 不重算、不改动既有规则：
//   - 营业额、成本分类沿用 monthlyPnLAggregator（与财务报表相同的算法）；
//   - 法定供款沿用 utils/payroll/statutory.ts（与薪资模块同一份）；
//   - 已发放薪资（POSTED）一律以实际数字为准。
//
// 避免重复计算：
//   - 人工成本以薪资（实际或推算）为准；损益中「薪资类」支出（SALARY、EPF、SOCSO、
//     ADVANCE 等）与薪资是同一笔钱，不再计入；
//   - 员工餐、员工宿舍不在薪资里，单独列为「其他人事支出」计入人工成本；
//   - 资本支出、资产、股息不是经营费用，不计入。
// ============================================================================
import { categorizeExpense, type MonthlyPnLInputs } from '../monthlyPnLAggregator';
import type { EmployeeLabourCost } from './labourCost';

export type DataStatus = 'SETTLED' | 'ESTIMATED' | 'MISSING';

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
    SETTLED: '已结算',
    ESTIMATED: '估算',
    MISSING: '缺失',
};

/** 损益中与员工有关、但不在薪资单里的支出：照实计入人工成本 */
const NON_PAYROLL_LABOUR = ['STAFF_MEAL', 'STAFF_ACCOMMODATION'];

export interface ProfitLine {
    key: string;
    label: string;
    amount: number;
    status: DataStatus;
    note?: string;
}

export interface ProfitSnapshot {
    month: string;
    revenue: ProfitLine;
    revenueProjected: number;
    variableCosts: ProfitLine;
    variableCostRatio: number;
    payrollLabour: ProfitLine;
    otherLabour: ProfitLine;
    labourCost: number;
    otherFixedCosts: ProfitLine;
    excludedLabourExpenses: number;
    labourCostRatio: number | null;
    breakEvenRevenue: number | null;
    projectedProfit: number;
    overallStatus: DataStatus;
    reasons: string[];
    employees: {
        settled: number;
        estimated: number;
        missing: number;
    };
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param elapsedDays 这个月已经过去的天数（过去的月份 = 整月天数）；用来判断营业额是否完整
 * @param settlementDays 这个月有日结记录的天数
 */
export const buildProfitSnapshot = (
    pnl: MonthlyPnLInputs,
    labour: EmployeeLabourCost[],
    opts: {
        daysInMonth: number;
        elapsedDays: number;
        settlementDays: number;
        /** 兼职工资（parttime_* 支出）：不在薪资单 details 里，要从排除的薪资类支出中取回 */
        partTimeWages?: number;
    },
): ProfitSnapshot => {
    const reasons: string[] = [];

    // ── 营业额 ──
    const platform = pnl.platformGross.grab + pnl.platformGross.shopee + pnl.platformGross.panda + pnl.platformGross.lalamove;
    const revenueAmount = round2(pnl.inStoreSales + platform);
    const elapsed = Math.max(0, Math.min(opts.elapsedDays, opts.daysInMonth));
    let revenueStatus: DataStatus = 'SETTLED';
    let revenueNote = `${opts.settlementDays} 天日结`;
    if (opts.settlementDays === 0) {
        revenueStatus = 'MISSING';
        revenueNote = '本月还没有日结记录';
        reasons.push('营业额缺失：本月还没有日结记录');
    } else if (opts.settlementDays < opts.daysInMonth) {
        revenueStatus = 'ESTIMATED';
        revenueNote = `${opts.settlementDays}/${opts.daysInMonth} 天日结，整月按日均推估`;
        reasons.push(
            opts.settlementDays < elapsed
                ? `营业额不完整：已过 ${elapsed} 天，只有 ${opts.settlementDays} 天日结`
                : `月份尚未结束：整月营业额按 ${opts.settlementDays} 天日均推估`,
        );
    }
    const revenueProjected =
        opts.settlementDays > 0 && opts.settlementDays < opts.daysInMonth
            ? round2((revenueAmount / opts.settlementDays) * opts.daysInMonth)
            : revenueAmount;

    // ── 成本分类（沿用财务报表的分类规则）──
    let cogs = 0;
    let delivery = 0;
    let opex = 0;
    let otherLabour = 0;
    let excludedLabour = 0;
    Object.entries(pnl.costByCategory || {}).forEach(([cat, amount]) => {
        const value = Number(amount) || 0;
        const group = categorizeExpense(cat);
        if (group === 'COGS') cogs += value;
        // 平台抽佣与广告（PLATFORM_COMM_* / PLATFORM_ADS_*，由日结算出）不含 PLATFORM_FEE 字样，
        // categorizeExpense 会归为 OPEX；它们随外送营业额变动，必须算变动成本
        else if (group === 'DELIVERY_COST' || cat.toUpperCase().startsWith('PLATFORM_')) delivery += value;
        else if (group === 'OPEX') opex += value;
        else if (group === 'LABOR') {
            if (NON_PAYROLL_LABOUR.some(k => cat.toUpperCase().includes(k))) otherLabour += value;
            else excludedLabour += value;
        }
        // CAPEX、ASSET、DIVIDEND、IGNORE 不是经营费用
    });

    const variable = round2(cogs + delivery);
    const variableCostRatio = revenueAmount > 0 ? Math.min(variable / revenueAmount, 0.99) : 0;
    const variableStatus: DataStatus = revenueAmount === 0 || variable === 0 ? 'MISSING' : 'SETTLED';
    if (variable === 0) reasons.push('食材与外送平台成本缺失：本月没有相关支出记录，保本营业额会偏低');

    // ── 人工 ──
    const settled = labour.filter(c => c.source === 'PAYROLL');
    const estimated = labour.filter(c => c.source === 'ESTIMATE' && !c.notes.includes('人事档案没有底薪'));
    const missing = labour.filter(c => c.notes.includes('人事档案没有底薪'));
    const payrollAmount = round2(labour.reduce((s, c) => s + c.employerCost, 0));
    let payrollStatus: DataStatus = 'SETTLED';
    if (labour.length === 0) {
        payrollStatus = 'MISSING';
        reasons.push('人工成本缺失：找不到在职员工或薪资资料');
    } else if (estimated.length || missing.length) {
        payrollStatus = 'ESTIMATED';
        if (estimated.length) reasons.push(`${estimated.length} 位员工本月尚未发薪，按底薪与法定供款推算`);
        if (missing.length) reasons.push(`${missing.length} 位员工人事档案没有底薪，未计入`);
    }
    const partTime = Math.max(0, Math.min(Number(opts.partTimeWages) || 0, excludedLabour));
    otherLabour += partTime;
    excludedLabour -= partTime;
    if (partTime > 0) reasons.push(`兼职工资 RM ${partTime.toFixed(2)} 不在薪资单里，已计入人工成本`);
    if (excludedLabour > 0) {
        reasons.push(`损益中的薪资类支出 RM ${excludedLabour.toFixed(2)} 与薪资是同一笔钱，已排除，不重复计算`);
    }

    // 只有营业额按日均推估整月；成本以实际记录为准（不推估），状态标明
    const monthInProgress = elapsed < opts.daysInMonth;
    const otherFixedStatus: DataStatus = opex === 0 ? 'MISSING' : monthInProgress ? 'ESTIMATED' : 'SETTLED';
    if (opex === 0) reasons.push('其他经营费用缺失：本月没有租金、水电等支出记录');
    else if (monthInProgress) reasons.push('月份未结束，经营费用可能尚未全部入账');

    const labourCost = round2(payrollAmount + otherLabour);
    const fixed = round2(labourCost + opex);
    const margin = 1 - variableCostRatio;
    const breakEvenRevenue = revenueAmount > 0 && margin > 0 ? round2(fixed / margin) : null;
    const projectedProfit = round2(revenueProjected * margin - fixed);

    const statuses: DataStatus[] = [revenueStatus, variableStatus, payrollStatus, otherFixedStatus];
    const overallStatus: DataStatus = statuses.includes('MISSING') ? 'MISSING' : statuses.includes('ESTIMATED') ? 'ESTIMATED' : 'SETTLED';

    return {
        month: pnl.month,
        revenue: { key: 'revenue', label: '营业额（店内 + 外送平台总额）', amount: revenueAmount, status: revenueStatus, note: revenueNote },
        revenueProjected,
        variableCosts: { key: 'variable', label: '食材与外送平台成本', amount: variable, status: variableStatus, note: `占营业额 ${(variableCostRatio * 100).toFixed(1)}%` },
        variableCostRatio,
        payrollLabour: {
            key: 'payroll',
            label: '雇主薪资成本（含雇主 EPF / SOCSO / EIS）',
            amount: payrollAmount,
            status: payrollStatus,
            note: `${settled.length} 人已发薪、${estimated.length} 人推算、${missing.length} 人缺底薪`,
        },
        otherLabour: { key: 'other_labour', label: '其他人事支出（兼职工资、员工餐、宿舍）', amount: round2(otherLabour), status: 'SETTLED' },
        labourCost,
        otherFixedCosts: { key: 'opex', label: '其他经营费用（租金、水电等）', amount: round2(opex), status: otherFixedStatus },
        excludedLabourExpenses: round2(excludedLabour),
        labourCostRatio: revenueProjected > 0 ? labourCost / revenueProjected : null,
        breakEvenRevenue,
        projectedProfit,
        overallStatus,
        reasons,
        employees: { settled: settled.length, estimated: estimated.length, missing: missing.length },
    };
};
