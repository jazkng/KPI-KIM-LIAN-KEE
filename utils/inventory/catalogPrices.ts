// ============================================================================
// 收货 → 供应商品项的「最近进价」，以及进价跟目录价不同时的提醒与一键更新
// ----------------------------------------------------------------------------
// 收货时每个供应商品项写：lastReceivedPrice（每包装）、lastReceivedPricePerBase、lastReceivedAt、lastReceivedPoId。
// 不自动改目录价格（负责人 2026-10-18 决定）：进价与目录价每基础单位差超过 5% 时，收货完成后提醒，
// 负责人按确定才更新目录价格与 priceUpdatedAt。比较一律用每基础单位价，订的是哪个单位都能比。
// ============================================================================

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { CatalogItem } from '../../types';
import { catalogPerBaseCost } from './supplyOptions';
import { appendWeightReceipt } from './receiveWeight';

export const PRICE_ALERT_PCT = 5;

/** packs / weight：称重品项这次收到几个下单单位、实际重量（有的话记进 weightHistory） */
export interface ReceivedPrice { catalogItemId: string; perBase: number; at: string; poId: string; packs?: number; weight?: number }
export interface PriceDiff { catalogItemId: string; name: string; unit: string; catalogPerBase: number; receivedPerBase: number; pct: number; newPackPrice: number }

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const isWeight = (c: CatalogItem) => c.pricingMode === 'WEIGHT_BASED' || c.conversionMode === 'ACTUAL_WEIGHT';
/** 每基础单位价 → 这个品项自己的报价单位价（每包装，或称重的每计价单位） */
const packPriceFromPerBase = (c: CatalogItem, perBase: number) => isWeight(c) ? perBase : perBase * (Number(c.toBaseRatio) > 0 ? Number(c.toBaseRatio) : 1);

/** 写最近进价，并算出跟目录价差超过门槛的品项 */
export const applyReceivedPrices = (catalog: CatalogItem[], received: ReceivedPrice[], alertPct = PRICE_ALERT_PCT): { catalog: CatalogItem[]; diffs: PriceDiff[] } => {
    const byId = new Map(received.filter(r => r.perBase > 0).map(r => [r.catalogItemId, r]));
    const diffs: PriceDiff[] = [];
    const next = catalog.map(c => {
        const r = byId.get(c.id);
        if (!r) return c;
        const catalogPerBase = catalogPerBaseCost(c);
        if (catalogPerBase && catalogPerBase > 0) {
            const pct = ((r.perBase - catalogPerBase) / catalogPerBase) * 100;
            if (Math.abs(pct) > alertPct) diffs.push({
                catalogItemId: c.id, name: c.name, unit: isWeight(c) ? (c.billingUnit || c.pricingUnit || 'kg') : (c.purchaseUnitName || c.unit),
                catalogPerBase: round(catalogPerBase), receivedPerBase: round(r.perBase), pct: round(pct, 1), newPackPrice: round(packPriceFromPerBase(c, r.perBase), 2),
            });
        }
        const withWeight = isWeight(c) && Number(r.packs) > 0 && Number(r.weight) > 0
            ? { weightHistory: appendWeightReceipt(c.weightHistory, { at: r.at, poId: r.poId, packs: Number(r.packs), weight: Number(r.weight) }) }
            : {};
        return { ...c, lastReceivedPrice: round(packPriceFromPerBase(c, r.perBase), 2), lastReceivedPricePerBase: round(r.perBase), lastReceivedAt: r.at, lastReceivedPoId: r.poId, ...withWeight };
    });
    return { catalog: next, diffs };
};

/** 负责人同意后：目录价格改成最近进价 */
export const applyCatalogPriceUpdates = (catalog: CatalogItem[], diffs: PriceDiff[], at: string): CatalogItem[] => {
    const byId = new Map(diffs.map(d => [d.catalogItemId, d]));
    return catalog.map(c => {
        const d = byId.get(c.id);
        if (!d) return c;
        if (isWeight(c)) return { ...c, pricePerBillingUnit: d.newPackPrice, pricePerPricingUnit: d.newPackPrice, price: d.newPackPrice, costPerBaseUnit: d.receivedPerBase, priceUpdatedAt: at };
        return { ...c, price: d.newPackPrice, pricePerPurchaseUnit: d.newPackPrice, costPerBaseUnit: d.receivedPerBase, priceUpdatedAt: at };
    });
};

/** 收货后呼叫：在交易里只改这家供应商的 catalog 字段 */
export const recordReceivedPrices = async (db: Firestore, supplierId: string, received: ReceivedPrice[]): Promise<PriceDiff[]> => {
    if (!supplierId || received.length === 0) return [];
    const ref = doc(db, 'suppliers', supplierId);
    return runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return [];
        const r = applyReceivedPrices(snap.data().catalog || [], received);
        tx.update(ref, { catalog: r.catalog });
        return r.diffs;
    });
};

export const updateCatalogPrices = async (db: Firestore, supplierId: string, diffs: PriceDiff[]): Promise<void> => {
    if (!diffs.length) return;
    const ref = doc(db, 'suppliers', supplierId);
    await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        tx.update(ref, { catalog: applyCatalogPriceUpdates(snap.data().catalog || [], diffs, new Date().toISOString()) });
    });
};

/** 收货完成后的提醒文字；没有差价时返回 null */
export const priceDiffMessage = (supplierName: string, diffs: PriceDiff[]): string | null => {
    if (!diffs.length) return null;
    const lines = diffs.slice(0, 10).map(d => `· ${d.name}：目录 RM ${d.catalogPerBase.toFixed(4)} → 这次 RM ${d.receivedPerBase.toFixed(4)}（${d.pct > 0 ? '+' : ''}${d.pct}%），新目录价 RM ${d.newPackPrice.toFixed(2)} / ${d.unit}`);
    return `${supplierName} 这次的进价跟目录价格不同（每基础单位差超过 ${PRICE_ALERT_PCT}%）：\n\n${lines.join('\n')}${diffs.length > 10 ? `\n…还有 ${diffs.length - 10} 项` : ''}\n\n要把目录价格更新成这次的进价吗？`;
};
