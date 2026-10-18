// 供应商比价总表（只读）：每个库存商品各家供应商的每基础单位价格，最便宜 / 最贵 / 价差 / 常用是否最便宜
import type { StockItem, Supplier } from '../../types';
import type { StockArea } from './stockArea';
import { cheapestOption, listSupplyOptions } from './supplyOptions';

export interface PriceReportRow {
    stockId: string;
    area: StockArea;
    name: string;
    stockCode?: string;
    baseUnit: string;
    supplierCount: number;
    packCount: number;
    cheapest?: { supplier: string; item: string; perBase: number };
    priciest?: { supplier: string; item: string; perBase: number };
    spreadPct: number | null;
    preferred?: { supplier: string; item: string; perBase: number | null };
    preferredIsCheapest: boolean | null;
    /** 用常用而不用最便宜：每基础单位多付 */
    preferredExtraPerBase: number | null;
    oldestPriceUpdate?: string;
}

export const buildSupplierPriceReport = (stocks: { area: StockArea; item: StockItem }[], suppliers: Supplier[]): PriceReportRow[] =>
    stocks.map(({ area, item }) => {
        const options = listSupplyOptions(item, suppliers);
        if (!options.length) return null;
        const priced = options.filter(o => o.perBase !== null);
        const cheap = cheapestOption(options);
        const dear = priced.length ? priced.reduce((a, b) => (b.perBase! > a.perBase! ? b : a)) : null;
        const pref = options.find(o => o.isPreferred);
        const dates = options.map(o => o.catalogItem.priceUpdatedAt).filter(Boolean).sort() as string[];
        const r2 = (n: number) => Math.round(n * 10000) / 10000;
        return {
            stockId: item.id, area, name: item.name, stockCode: item.stockCode, baseUnit: item.baseUnit || item.unit || '',
            supplierCount: new Set(options.map(o => o.supplier.id)).size,
            packCount: options.length,
            cheapest: cheap ? { supplier: cheap.supplier.name, item: cheap.catalogItem.name, perBase: r2(cheap.perBase!) } : undefined,
            priciest: dear ? { supplier: dear.supplier.name, item: dear.catalogItem.name, perBase: r2(dear.perBase!) } : undefined,
            spreadPct: cheap && dear && cheap.perBase! > 0 && priced.length > 1 ? Math.round(((dear.perBase! - cheap.perBase!) / cheap.perBase!) * 1000) / 10 : null,
            preferred: pref ? { supplier: pref.supplier.name, item: pref.catalogItem.name, perBase: pref.perBase !== null ? r2(pref.perBase) : null } : undefined,
            preferredIsCheapest: pref && cheap ? pref.catalogItem.id === cheap.catalogItem.id || pref.perBase === cheap.perBase : null,
            preferredExtraPerBase: pref && cheap && pref.perBase !== null && pref.perBase > cheap.perBase! ? r2(pref.perBase - cheap.perBase!) : null,
            oldestPriceUpdate: dates[0]?.slice(0, 10),
        } as PriceReportRow;
    }).filter((r): r is PriceReportRow => r !== null)
      .sort((a, b) => (b.spreadPct ?? -1) - (a.spreadPct ?? -1) || a.name.localeCompare(b.name));
