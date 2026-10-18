// ============================================================================
// 一样东西多个供应商：列出可选的供应商品项、算每基础单位价格、选默认的那一个
// ----------------------------------------------------------------------------
// 「库存商品」是一样东西；「供应商品项」是某家卖的某种包装（自己的价格与 toBaseRatio）。
// 比价一律看每基础单位价格，包装大小不同也能比。
// 默认供应商：常用（StockItem.preferredSupply）→ 每基础单位最便宜 → 第一个。停售的不算。
// ============================================================================

import type { CatalogItem, StockItem, Supplier } from '../../types';

export interface SupplyOption {
    supplier: Supplier;
    catalogItem: CatalogItem;
    /** 每基础单位价格（RM）；算不出来时为 null */
    perBase: number | null;
    /** 1 个包装 = 几个基础单位 */
    packRatio: number;
    /** 每包装价格 */
    packPrice: number;
    packUnit: string;
    isPreferred: boolean;
}

const pos = (n: unknown): number | null => { const v = Number(n); return Number.isFinite(v) && v > 0 ? v : null; };

/** 供应商品项每基础单位价格：称重按每计价单位价；固定包装按 每包装价 ÷ 包装换算 */
export const catalogPerBaseCost = (c: CatalogItem): number | null => {
    if (c.pricingMode === 'WEIGHT_BASED' || c.conversionMode === 'ACTUAL_WEIGHT') {
        return pos(c.pricePerBillingUnit) ?? pos(c.pricePerPricingUnit) ?? pos(c.price);
    }
    const price = pos(c.pricePerPurchaseUnit) ?? pos(c.price);
    const ratio = pos(c.toBaseRatio) ?? 1;
    return price !== null ? price / ratio : pos(c.costPerBaseUnit);
};

export const isDiscontinued = (c: CatalogItem) => c.status === 'DISCONTINUED';

/** 所有连到这个库存商品、还在卖的供应商品项（同一家可以有多个包装） */
export const listSupplyOptions = (stock: Pick<StockItem, 'id' | 'preferredSupply'>, suppliers: Supplier[], includeDiscontinued = false): SupplyOption[] => {
    const pref = stock.preferredSupply;
    const out: SupplyOption[] = [];
    suppliers.forEach(supplier => (supplier.catalog || []).forEach(c => {
        if (c.linkedStockId !== stock.id) return;
        if (!includeDiscontinued && isDiscontinued(c)) return;
        const weight = c.pricingMode === 'WEIGHT_BASED' || c.conversionMode === 'ACTUAL_WEIGHT';
        out.push({
            supplier, catalogItem: c,
            perBase: catalogPerBaseCost(c),
            packRatio: weight ? (pos(c.estimatedWeightPerUnit) ?? 1) : (pos(c.toBaseRatio) ?? 1),
            packPrice: weight ? (pos(c.pricePerBillingUnit) ?? pos(c.price) ?? 0) : (pos(c.pricePerPurchaseUnit) ?? pos(c.price) ?? 0),
            packUnit: weight ? (c.billingUnit || c.pricingUnit || 'kg') : (c.purchaseUnitName || c.unit || ''),
            isPreferred: !!pref && pref.supplierId === supplier.id && pref.catalogItemId === c.id,
        });
    }));
    return out;
};

/** 默认：常用 → 每基础单位最便宜 → 第一个 */
export const pickDefaultSupply = (options: SupplyOption[]): SupplyOption | null => {
    if (!options.length) return null;
    const preferred = options.find(o => o.isPreferred);
    if (preferred) return preferred;
    const priced = options.filter(o => o.perBase !== null);
    if (priced.length) return priced.reduce((a, b) => (b.perBase! < a.perBase! ? b : a));
    return options[0];
};

/** 指定供应商（与包装）时找对应的品项；没指定包装时用这家里的常用 / 最便宜那个 */
export const pickSupplyForSupplier = (options: SupplyOption[], supplierId: string, catalogItemId?: string): SupplyOption | null => {
    const mine = options.filter(o => o.supplier.id === supplierId);
    if (catalogItemId) {
        const exact = mine.find(o => o.catalogItem.id === catalogItemId);
        if (exact) return exact;
    }
    return pickDefaultSupply(mine);
};

/** 最便宜的那个（比价画面标绿色用） */
export const cheapestOption = (options: SupplyOption[]): SupplyOption | null => {
    const priced = options.filter(o => o.perBase !== null);
    return priced.length ? priced.reduce((a, b) => (b.perBase! < a.perBase! ? b : a)) : null;
};
