import { describe, expect, it } from 'vitest';
import { buildFoodAnalytics, type FoodAnalyticsInput } from '../../utils/cockpit/foodAnalytics';

const base: FoodAnalyticsInput = {
    period: { start: '2026-10-01', end: '2026-10-14' },
    periodRevenue: 40000,
    periodFood: 14000,
    foodByCategory: [{ label: 'INGREDIENT_MEAT', amount: 14000 }],
    trend: [
        { month: '2026-05', revenue: 90000, food: 30000, complete: false },
        { month: '2026-06', revenue: 90000, food: 18000, complete: true },
        { month: '2026-07', revenue: 100000, food: 20000, complete: true },
        { month: '2026-08', revenue: 110000, food: 22000, complete: true },
        { month: '2026-09', revenue: 90000, food: 18000, complete: true },
        { month: '2026-10', revenue: 40000, food: 14000, complete: false },
    ],
    stockByType: { 厨房: [{ id: 's1', name: '虚构猪肉', currentQtyBase: 1000, costPerBaseUnit: 0.03 }], 水吧: [{ id: 's2', currentQty: 10, cost: 2 }] },
    inventoryLogs: [
        { date: '2026-10-05', totalValueChange: -120 },
        { date: '2026-10-10', totalValueChange: 30 },
        { date: '2026-09-28', totalValueChange: -999 },
        { date: '2026-10-12', totalValueChange: 500, source: 'RECEIVE' }, // 收货不是盘点差异
    ],
    priceHistories: [
        { stockId: 's1', entries: [{ date: '2026-08-01', cost: 0.025 }, { date: '2026-10-02', cost: 0.03 }] },
        { stockId: 's2', entries: [{ date: '2026-10-01', cost: 2 }] },
    ],
    priceSince: '2026-07-16',
};

describe('食材成本双轨分析', () => {
    const a = buildFoodAnalytics(base, { s1: '虚构猪肉' });
    it('采购口径：金额与成本率', () => {
        expect(a.purchase.amount).toBe(14000);
        expect(a.purchase.ratio).toBeCloseTo(0.35, 4);
    });
    it('库存价值：数量 × 每基础单位成本（与财务报表相同，含旧栏位）', () => {
        expect(a.inventoryNow.total).toBe(30 + 20);
    });
    it('耗用成本一律标资料不完整；预估只用期末前的日结齐全月份（最近 3 个），并写明依据', () => {
        expect(a.consumption.status).toBe('INCOMPLETE');
        expect(a.consumption.estimateRatio).toBeCloseTo((20000 + 22000 + 18000) / (100000 + 110000 + 90000), 6);
        expect(a.consumption.estimate).toBe(8000);
        expect(a.consumption.estimateBasis).toContain('2026-07、2026-08、2026-09');
        expect(a.consumption.estimateBasis).toContain('不是实际耗用');
    });
    it('盘点差异只算期间内的盘点记录（收货记录不算）', () => {
        expect(a.countVariance).toMatchObject({ logs: 2, loss: -120, gain: 30, net: -90 });
    });
    it('品项价格变化：只有一笔价格的品项不列；涨价 20% 产生提醒', () => {
        expect(a.priceChanges).toHaveLength(1);
        expect(a.priceChanges[0]).toMatchObject({ name: '虚构猪肉', changePct: 20, from: 0.025, to: 0.03 });
        expect(a.alerts.some(x => x.title.includes('虚构猪肉'))).toBe(true);
    });
    it('采购成本率明显高于近期平均 → 提醒', () => {
        expect(a.alerts.some(x => x.title === '采购成本率高于近期平均')).toBe(true);
    });
    it('没有日结齐全的历史月份：不预估', () => {
        const b = buildFoodAnalytics({ ...base, trend: base.trend.map(t => ({ ...t, complete: false })) });
        expect(b.consumption.estimate).toBeNull();
    });
});
