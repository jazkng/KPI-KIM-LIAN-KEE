// ============================================================================
// 库存商品「暂无关联供应商」时，找出同名、却连到别的库存（或没连 / 连到已删除库存）的供应商品项
// ----------------------------------------------------------------------------
// 连结只看 linkedStockId，不看名称。同名商品在不同区域各有一份（例如厨房和燃料都有「碳」）时，
// 供应商品项可能连到另一份，这个商品就看不到供应商。这里只读找出来，负责人按一下改连。
// ============================================================================

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { CatalogItem, Supplier } from '../../types';
import { nameKey } from './stockCode';

const chinesePart = (name: string) => nameKey(String(name || '').split(/[（(]/)[0]);

export const sameName = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    if (nameKey(a) === nameKey(b)) return true;
    const ca = chinesePart(a), cb = chinesePart(b);
    return !!ca && ca === cb && /[一-鿿]/.test(ca);
};

export interface SameNameCatalogRef { supplierId: string; supplierName: string; item: CatalogItem }

export const findSameNameCatalog = (stock: { id: string; name?: string }, suppliers: Supplier[]): SameNameCatalogRef[] => {
    const out: SameNameCatalogRef[] = [];
    suppliers.forEach(s => (s.catalog || []).forEach(item => {
        if (item.linkedStockId === stock.id) return;
        if (item.status === 'DISCONTINUED') return;
        if (sameName(item.name, stock.name || '')) out.push({ supplierId: s.id, supplierName: s.name, item });
    }));
    return out;
};

/** 只改这一个供应商品项的 linkedStockId（旧库存的采购单位 ID 不再适用，一并清掉）；名称、价格不动 */
export const applyRelink = (catalog: CatalogItem[], itemId: string, newStockId: string): CatalogItem[] =>
    catalog.map(c => {
        if (c.id !== itemId) return c;
        const { linkedPurchaseUnitId: _drop, ...rest } = c;
        return { ...rest, linkedStockId: newStockId };
    });

export const relinkCatalogItem = async (db: Firestore, supplierId: string, itemId: string, newStockId: string): Promise<void> => {
    const ref = doc(db, 'suppliers', supplierId);
    await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('找不到这家供应商');
        const catalog: CatalogItem[] = snap.data().catalog || [];
        if (!catalog.some(c => c.id === itemId)) throw new Error('这个供应商品项已不存在');
        tx.update(ref, { catalog: applyRelink(catalog, itemId, newStockId) });
    });
};
