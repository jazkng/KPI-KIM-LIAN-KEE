// ============================================================================
// 食材成本分析 · 资料读取（只读，打开分析页时才执行）
// 近 6 个月日结与支出（按日期范围）、四个库存集合（沿用快取）、最近盘点记录、价格历史。
// ============================================================================
import { DataManager } from '../dataManager';
import { aggregateMonth, splitAccrualDuplicatePayments } from '../monthlyPnLAggregator';
import type { CockpitResult } from './cockpitMetrics';
import { splitCosts } from './cockpitMetrics';
import { buildFoodAnalytics, type FoodAnalytics, type MonthFoodPoint } from './foodAnalytics';
import { loadParentBills } from './loadCockpit';
import { addDays, daysInMonth } from './periods';

const prevMonth = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

export const loadFoodAnalytics = async (result: CockpitResult): Promise<FoodAnalytics> => {
    const endMonth = result.period.end.slice(0, 7);
    const months: string[] = [];
    for (let m = endMonth, i = 0; i < 6; i++, m = prevMonth(m)) months.unshift(m);
    const start = `${months[0]}-01`;
    const end = `${endMonth}-${String(daysInMonth(endMonth)).padStart(2, '0')}`;
    const priceSince = addDays(result.period.end, -90);

    const [raw, kitchen, bar, general, fuel, logs, prices] = await Promise.all([
        DataManager.getPnLRawRange(start, end),
        DataManager.getStock('KITCHEN'),
        DataManager.getStock('BAR'),
        DataManager.getStock('GENERAL'),
        DataManager.getStock('FUEL'),
        DataManager.getInventoryLogs(200).catch(() => []),
        DataManager.getRecentPriceChanges(priceSince).catch(() => []),
    ]);
    const parents = await loadParentBills(raw.standaloneExpenses, result.accountingMode);
    const expenses = splitAccrualDuplicatePayments(raw.standaloneExpenses, result.accountingMode, parents).kept;
    const data = { settlements: raw.settlements, standaloneExpenses: expenses, billPayments: raw.billPayments, payrollRecords: [], employees: [] };
    const settledDays = (m: string) => new Set(raw.settlements.map(s => String(s.date || '').slice(0, 10)).filter(d => d.startsWith(m))).size;
    const trend: MonthFoodPoint[] = months.map(month => {
        const pnl = aggregateMonth(month, data, result.accountingMode);
        const revenue = pnl.inStoreSales + pnl.platformGross.grab + pnl.platformGross.panda + pnl.platformGross.shopee + pnl.platformGross.lalamove;
        return { month, revenue: Math.round(revenue * 100) / 100, food: Math.round(splitCosts(pnl.costByCategory).food * 100) / 100, complete: settledDays(month) === daysInMonth(month) };
    });
    const allStock = [...kitchen, ...bar, ...general, ...fuel];
    const names = Object.fromEntries(allStock.map(s => [s.id, s.name]));
    return buildFoodAnalytics({
        period: result.period,
        periodRevenue: result.kpis.revenue.value || 0,
        periodFood: result.kpis.food.value || 0,
        foodByCategory: result.kpis.food.rows,
        trend,
        stockByType: { 厨房: kitchen, 水吧: bar, 一般: general, 燃料: fuel },
        inventoryLogs: logs,
        priceHistories: prices,
        priceSince,
    }, names);
};
