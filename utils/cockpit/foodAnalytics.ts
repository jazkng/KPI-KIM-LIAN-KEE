// ============================================================================
// 老板经营驾驶舱 · 食材成本双轨分析（PR C2）
// ----------------------------------------------------------------------------
// 纯函数，只读。保留现有采购口径（财务报表 COGS 分类），另外提供：
//   - 采购成本率与近 6 个月走势
//   - 目前库存价值（数量 × 每基础单位成本，与财务报表相同算法）
//   - 实际耗用成本：需要「期初库存 + 采购 − 期末库存」，但系统没有月底库存快照与出入库流水，
//     所以一律标「资料不完整」；另外提供「依历史采购成本率」的预估值，并写明依据
//   - 盘点差异（盘点前后价值变化；系统没有记录损耗 / 报废原因，无法再细分）
//   - 品项价格变化（价格历史来自盘点时的加权平均成本，不是供应商报价单）
// 采购付款、入库与耗用是不同概念：这里的采购金额只用来分析，不会再从利润中另外扣一次。
// ============================================================================

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface MonthFoodPoint {
    month: string;
    revenue: number;
    food: number;
    /** 整月日结齐全 */
    complete: boolean;
}

export interface StockLike {
    id?: string;
    name?: string;
    currentQtyBase?: number;
    currentQty?: number;
    costPerBaseUnit?: number;
    cost?: number;
}

export interface InventoryLogLike {
    date?: string;
    totalValueChange?: number;
    category?: string;
    source?: string;
}

export interface PriceHistoryLike {
    stockId: string;
    entries: { date: string; cost: number }[];
}

export interface FoodAnalyticsInput {
    period: { start: string; end: string };
    periodRevenue: number;
    periodFood: number;
    foodByCategory: { label: string; amount: number }[];
    trend: MonthFoodPoint[];
    stockByType: Record<string, StockLike[]>;
    inventoryLogs: InventoryLogLike[];
    priceHistories: PriceHistoryLike[];
    /** 价格比较的起点（例：期末前 90 天） */
    priceSince: string;
}

export interface FoodAnalytics {
    purchase: { amount: number; ratio: number | null; byCategory: { label: string; amount: number }[] };
    trend: (MonthFoodPoint & { ratio: number | null })[];
    inventoryNow: { total: number; byType: { type: string; value: number; items: number }[] };
    consumption: {
        status: 'INCOMPLETE';
        reason: string;
        estimate: number | null;
        estimateRatio: number | null;
        estimateBasis: string;
    };
    countVariance: { logs: number; loss: number; gain: number; net: number; note: string };
    priceChanges: { stockId: string; name: string; from: number; to: number; changePct: number; fromDate: string; toDate: string }[];
    priceNote: string;
    alerts: { title: string; detail: string }[];
}

export const buildFoodAnalytics = (input: FoodAnalyticsInput, stockNames: Record<string, string> = {}): FoodAnalytics => {
    const ratio = (food: number, revenue: number) => (revenue > 0 ? food / revenue : null);

    // ── 库存价值（与财务报表相同算法）──
    const byType = Object.entries(input.stockByType).map(([type, items]) => ({
        type,
        items: items.length,
        value: round2(items.reduce((s, it) => s + (Number(it.currentQtyBase ?? it.currentQty ?? 0) || 0) * (Number(it.costPerBaseUnit ?? it.cost ?? 0) || 0), 0)),
    }));
    const inventoryTotal = round2(byType.reduce((s, t) => s + t.value, 0));

    // ── 耗用成本：资料不完整；依历史采购成本率预估 ──
    const periodEndMonth = input.period.end.slice(0, 7);
    const basisMonths = input.trend.filter(t => t.complete && t.month < periodEndMonth && t.revenue > 0).slice(-3);
    const basisRevenue = basisMonths.reduce((s, t) => s + t.revenue, 0);
    const basisFood = basisMonths.reduce((s, t) => s + t.food, 0);
    const estimateRatio = basisMonths.length > 0 && basisRevenue > 0 ? basisFood / basisRevenue : null;
    const estimate = estimateRatio !== null ? round2(input.periodRevenue * estimateRatio) : null;

    // ── 盘点差异（期间内）──
    // 收货记录（source = RECEIVE）是进货，不是盘点差异
    const logs = input.inventoryLogs.filter(l => {
        if (l.source === 'RECEIVE') return false;
        const d = String(l.date || '').slice(0, 10);
        return d >= input.period.start && d <= input.period.end;
    });
    const loss = logs.reduce((s, l) => s + Math.min(0, Number(l.totalValueChange) || 0), 0);
    const gain = logs.reduce((s, l) => s + Math.max(0, Number(l.totalValueChange) || 0), 0);

    // ── 品项价格变化（期间前后的最近两笔价格）──
    const priceChanges = input.priceHistories
        .map(h => {
            const entries = [...(h.entries || [])].filter(e => e && e.date && Number(e.cost) > 0).sort((a, b) => a.date.localeCompare(b.date));
            const recent = entries.filter(e => e.date >= input.priceSince);
            if (recent.length === 0) return null;
            const to = recent[recent.length - 1];
            const before = entries.filter(e => e.date < to.date);
            if (before.length === 0) return null;
            const from = before[before.length - 1];
            if (Number(from.cost) === Number(to.cost)) return null;
            return {
                stockId: h.stockId,
                name: stockNames[h.stockId] || h.stockId,
                // 每基础单位成本常是小数点后多位（例：每克 RM 0.025），不能四舍五入到两位
                from: Math.round(Number(from.cost) * 1e6) / 1e6,
                to: Math.round(Number(to.cost) * 1e6) / 1e6,
                changePct: round2(((to.cost - from.cost) / from.cost) * 100),
                fromDate: from.date,
                toDate: to.date,
            };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => b.changePct - a.changePct);

    const trend = input.trend.map(t => ({ ...t, ratio: ratio(t.food, t.revenue) }));
    const alerts: FoodAnalytics['alerts'] = [];
    const periodRatio = ratio(input.periodFood, input.periodRevenue);
    if (periodRatio !== null && estimateRatio !== null && periodRatio - estimateRatio > 0.05) {
        alerts.push({
            title: '采购成本率高于近期平均',
            detail: `本期 ${(periodRatio * 100).toFixed(1)}%，前 ${basisMonths.length} 个完整月份平均 ${(estimateRatio * 100).toFixed(1)}%（${basisMonths.map(m => m.month).join('、')}）。采购集中在本期也可能造成，请对照进货节奏`,
        });
    }
    priceChanges.filter(p => p.changePct >= 10).slice(0, 5).forEach(p => {
        alerts.push({ title: `${p.name} 成本上涨 ${p.changePct.toFixed(0)}%`, detail: `RM ${p.from.toFixed(4)} → RM ${p.to.toFixed(4)}（${p.fromDate} → ${p.toDate}，每基础单位）` });
    });

    return {
        purchase: { amount: round2(input.periodFood), ratio: periodRatio, byCategory: input.foodByCategory },
        trend,
        inventoryNow: { total: inventoryTotal, byType },
        consumption: {
            status: 'INCOMPLETE',
            reason: '实际耗用成本 = 期初库存 + 采购 − 期末库存。系统目前没有月底库存价值快照，进货入库与耗用也没有逐笔流水，无法核实；库存价值只有「现在」这一个时点',
            estimate,
            estimateRatio,
            estimateBasis: estimateRatio !== null
                ? `预估 = 本期营业额 × 前 ${basisMonths.length} 个日结齐全月份的采购成本率 ${(estimateRatio * 100).toFixed(1)}%（${basisMonths.map(m => m.month).join('、')}）；这是预估，不是实际耗用`
                : '没有日结齐全的历史月份，无法预估',
        },
        countVariance: {
            logs: logs.length,
            loss: round2(loss),
            gain: round2(gain),
            net: round2(loss + gain),
            note: '来自盘点记录前后的价值变化；系统没有记录原因，无法区分损耗、报废或记录误差',
        },
        priceChanges,
        priceNote: '价格来自盘点时的加权平均成本（每基础单位），不是供应商报价单；供应商报价比较需进货单资料（后续版本）',
        alerts,
    };
};
