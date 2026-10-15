// ============================================================================
// 盈亏对账 · 旧算法 D：经营日报「经营净利润」（照抄，只读）
// ----------------------------------------------------------------------------
// 照抄 components/features/DailyBusinessReportModal.tsx（2026-10-15 版本）:
//   :217-221 当天独立支出的读取条件（time 介于 `${date}T00:00:00` 与 `${date}T23:59:59`，字串比较）
//   :303-348 卡片上的净利
// 经营日报只有单日数字；这里把每一天照原样算出来再加总，只是为了说明它不能当月度盈亏。
// ============================================================================

const num = (v: unknown) => Number(v) || 0;
const FOOD_KEYS = ['INGREDIENT', 'MEAT', 'SEAFOOD', 'VEG', 'DRY', 'SAUCE', 'NOODLE', 'OIL', 'EGG', 'FROZEN', 'BEVERAGE', 'SUPPLIER'];

export interface LegacyDailyReportDay {
    date: string;
    revenue: number;
    food: number;
    foodIsEstimate35: boolean;
    cashExpenses: number;
    ads: number;
    netProfit: number;
}

export const legacyDailyReportDay = (settlement: any, standaloneExpenses: any[]): LegacyDailyReportDay => {
    const date = String(settlement.date || '').slice(0, 10);
    const from = `${date}T00:00:00`;
    const to = `${date}T23:59:59`;
    const dayExpenses = standaloneExpenses.filter(e => typeof e.time === 'string' && e.time >= from && e.time <= to);
    const sales = settlement.sales || {};
    const revenue = num(sales.total);
    const b = sales.deliveryBreakdown || {};
    const ads = num(b.grabAds) + num(b.pandaAds) + num(b.shopeeAds);
    const cashExpenses = [...(settlement.expenses || []), ...(settlement.dayExpenses || [])].reduce((s: number, x: any) => s + num(x?.amount), 0);
    const actualFood = dayExpenses
        .filter(e => FOOD_KEYS.some(k => String(e.category || '').toUpperCase().includes(k)))
        .reduce((s, e) => s + num(e.amount), 0);
    const food = actualFood > 0 ? actualFood : revenue * 0.35;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
        date,
        revenue: r2(revenue),
        food: r2(food),
        foodIsEstimate35: !(actualFood > 0),
        cashExpenses: r2(cashExpenses),
        ads: r2(ads),
        netProfit: r2(revenue - food - cashExpenses - ads),
    };
};

/** 期间内每一张日结照经营日报算一次（没有日结的日子，经营日报也没有数字） */
export const legacyDailyReportRange = (settlements: any[], standaloneExpenses: any[], start: string, end: string) => {
    const days = settlements
        .filter(s => { const d = String(s.date || '').slice(0, 10); return d >= start && d <= end; })
        .map(s => legacyDailyReportDay(s, standaloneExpenses))
        .sort((a, b) => a.date.localeCompare(b.date));
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
        days,
        sum: r2(days.reduce((s, d) => s + d.netProfit, 0)),
        estimatedFoodDays: days.filter(d => d.foodIsEstimate35).length,
        estimatedFoodAmount: r2(days.filter(d => d.foodIsEstimate35).reduce((s, d) => s + d.food, 0)),
    };
};
