// ============================================================================
// 库存编辑画面的「单位设定一览」：把三层单位（系统库存单位 / 盘点单位 / 采购规格）
// 翻成一句一句的白话，让人一眼看懂这件商品现在怎么记、怎么数、怎么买，以及哪里设错了。
// 只读：不改任何资料，算法与 StockEditModal 原本的换算一致。
// ============================================================================

import type { StockItem, UnitConversionRule } from '../../types';

const norm = (u?: string) => String(u || '').trim().toLowerCase();
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : '?');

export interface UnitSetupSummary {
    stock: string;
    count: string;
    purchases: string[];
    warnings: string[];
}

type Item = Pick<StockItem, 'baseUnit' | 'unit' | 'displayUnit' | 'displayToBaseRatio' | 'preferredStockViewUnit'> & { purchaseUnits?: UnitConversionRule[] };

export const summarizeUnitSetup = (item: Partial<Item>): UnitSetupSummary => {
    const base = item.baseUnit || item.unit || 'pcs';
    const warnings: string[] = [];
    const stock = `库存以 ${base} 记录：数量、成本、菜谱扣库存都用 ${base}。`;

    const display = item.displayUnit;
    const ratio = Number(item.displayToBaseRatio) || 0;
    const countsByPack = item.preferredStockViewUnit === 'DISPLAY' && !!display && norm(display) !== norm(base);
    let count = `盘点时直接数 ${base}。`;
    if (countsByPack) {
        if (ratio > 0) count = `盘点时按 ${display} 数：1 ${display} = ${fmt(ratio, 4)} ${base}（输入 2 ${display} 会存成 ${fmt(2 * ratio, 4)} ${base}）。`;
        else { count = `盘点时按 ${display} 数，但还没填 1 ${display} 等于多少 ${base}。`; warnings.push(`请在第 ② 步填「每 1 ${display} 包含多少 ${base}」。`); }
    }

    const pus = item.purchaseUnits || [];
    const purchases = pus.map(pu => {
        const name = pu.unitName || '（未命名）';
        const price = Number(pu.pricePerUnit) || 0;
        const r = Number(pu.toBaseRatio) || 0;
        const perBase = r > 0 && price > 0 ? ` ≈ 每 ${base} RM ${fmt(price / r, 4)}` : '';
        const tag = pu.isDefaultPurchase ? '【默认】' : '';
        if (!pu.unitName) warnings.push('有一个采购规格没有名称。');
        if (r <= 0) warnings.push(`采购规格 ${name} 还没填等于多少 ${base}。`);
        if (pu.conversionMode === 'ACTUAL_WEIGHT') {
            return `${tag}按 ${name} 买，每次收货称实际重量（预估 1 ${name} ≈ ${fmt(r, 3)} ${base}）${price > 0 ? `，报价 RM ${fmt(price)} / ${name}${perBase}` : ''}。`;
        }
        return `${tag}按 ${name} 买：1 ${name} = ${fmt(r, 4)} ${base}${price > 0 ? `，RM ${fmt(price)} / ${name}${perBase}` : '，还没填价格'}。`;
    });
    if (pus.length === 0) purchases.push(`没有设定采购规格：采购时直接按 ${base} 买。`);
    if (pus.length > 1 && !pus.some(p => p.isDefaultPurchase)) warnings.push('有多个采购规格，但没有设定哪一个是「默认」。');
    return { stock, count, purchases, warnings };
};
