// ============================================================================
// 老板经营驾驶舱 · 保本模拟器（PR D）
// ----------------------------------------------------------------------------
// 纯函数，只做模拟计算：不读写资料库，不会写回营业额、薪资、采购或财务记录。
// 固定成本 = 人工（不含 OT）+ OT + 租金 + 其他经营费用
// 变动成本率 = 食材成本率 + 外送平台费率
// 保本营业额 = 固定成本 ÷ (1 − 变动成本率)
// ============================================================================
import type { MonthBaseline } from './cockpitMetrics';

export interface SimParams {
    monthlyRevenue: number;
    labourExOt: number;
    ot: number;
    /** 员工人数调整（以目前人均人工成本换算；0 = 不变） */
    staffDelta: number;
    foodRate: number;
    platformRate: number;
    rent: number;
    otherFixed: number;
    operatingDays: number;
}

export interface SimResult {
    fixed: number;
    variableRate: number;
    contributionRate: number;
    profit: number;
    breakEvenMonthly: number | null;
    breakEvenDaily: number | null;
    dailyRevenue: number;
    gapToBreakEven: number | null;
    /** 食材成本率每上升 1 个百分点，保本营业额增加多少 */
    foodRateSensitivity: number | null;
    /** 每天多做 RM 500，月底利润增加多少 */
    plus500PerDay: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export const baselineParams = (b: MonthBaseline): SimParams => ({
    monthlyRevenue: b.projectedRevenue,
    labourExOt: b.labourExOt,
    ot: b.ot,
    staffDelta: 0,
    foodRate: b.foodRate,
    platformRate: b.platformRate,
    rent: b.rent,
    otherFixed: b.otherFixed,
    operatingDays: b.daysInMonth,
});

export const simulate = (p: SimParams, perHeadCost: number): SimResult => {
    const labour = Math.max(0, p.labourExOt + p.staffDelta * perHeadCost) + Math.max(0, p.ot);
    const fixed = labour + Math.max(0, p.rent) + Math.max(0, p.otherFixed);
    const variableRate = Math.max(0, p.foodRate) + Math.max(0, p.platformRate);
    const contributionRate = 1 - variableRate;
    const days = Math.max(1, Math.round(p.operatingDays));
    const breakEven = contributionRate > 0 ? fixed / contributionRate : null;
    const breakEvenUp = contributionRate - 0.01 > 0 ? fixed / (contributionRate - 0.01) : null;
    return {
        fixed: round2(fixed),
        variableRate,
        contributionRate,
        profit: round2(p.monthlyRevenue * contributionRate - fixed),
        breakEvenMonthly: breakEven === null ? null : round2(breakEven),
        breakEvenDaily: breakEven === null ? null : round2(breakEven / days),
        dailyRevenue: round2(p.monthlyRevenue / days),
        gapToBreakEven: breakEven === null ? null : round2(p.monthlyRevenue - breakEven),
        foodRateSensitivity: breakEven !== null && breakEvenUp !== null ? round2(breakEvenUp - breakEven) : null,
        plus500PerDay: round2(500 * days * contributionRate),
    };
};
