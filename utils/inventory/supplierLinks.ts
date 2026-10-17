// ============================================================================
// 删除库存商品时，处理连到它的供应商品项（纯函数）
// ----------------------------------------------------------------------------
// 以前删除库存商品不管供应商品项，留下「连结的库存已不存在」的断链：
// 之后从这些品项下单，收货时库存不会增加（库存资料审计会列为高）。
// 现在删除前必须选一种处理方式：
//   UNLINK      解除连结，保留供应商品项（还会向这家买，但不进库存）
//   DELETE_ITEM 一起删除这些供应商品项（不再采购）
//   RELINK      改连结到另一个库存商品（换了新商品）
// ============================================================================

import { collection, doc, getDocs, runTransaction, type Firestore } from 'firebase/firestore';
import type { CatalogItem } from '../../types';

export type LinkAction = 'UNLINK' | 'DELETE_ITEM' | 'RELINK';

export interface LinkedCatalogRef { supplierId: string; supplierName: string; itemId: string; itemName: string }

/** 找出所有连到这个库存商品的供应商品项 */
export const findLinkedCatalogItems = (
    suppliers: { id: string; name: string; catalog?: CatalogItem[] }[],
    stockId: string,
): LinkedCatalogRef[] =>
    suppliers.flatMap(s => (s.catalog || [])
        .filter(c => c.linkedStockId === stockId)
        .map(c => ({ supplierId: s.id, supplierName: s.name, itemId: c.id, itemName: c.name })));

/** 按处理方式改写一个供应商的品项清单；没有连到这个商品的品项不动 */
export const applyStockDeletionToCatalog = (
    catalog: CatalogItem[],
    stockId: string,
    action: LinkAction,
    newStockId?: string,
): { catalog: CatalogItem[]; changed: number } => {
    if (action === 'RELINK' && (!newStockId || newStockId === stockId)) throw new Error('改连结要选另一个库存商品');
    let changed = 0;
    const next: CatalogItem[] = [];
    catalog.forEach(item => {
        if (item.linkedStockId !== stockId) { next.push(item); return; }
        changed++;
        if (action === 'DELETE_ITEM') return;
        // 采购单位是跟着旧商品设定的，换商品或解除后不能再沿用
        const { linkedStockId, linkedPurchaseUnitId, ...rest } = item;
        next.push(action === 'RELINK' ? { ...rest, linkedStockId: newStockId } : rest);
    });
    return { catalog: next, changed };
};

// ── 资料库：删除库存商品前，逐个供应商在交易里改写品项清单 ──────────────────


/**
 * 读最新的供应商资料，把连到 stockId 的品项按 action 处理。
 * 每个供应商一个交易：读到的是最新的品项清单，只改 catalog 字段，不会盖掉别人刚改的其他资料。
 * 要在删除库存商品「之前」呼叫；失败就不要删除商品。
 */
export const updateSupplierLinksForDeletedStock = async (
    db: Firestore, stockId: string, action: LinkAction, newStockId?: string,
): Promise<{ suppliers: number; items: number }> => {
    if (action === 'RELINK' && (!newStockId || newStockId === stockId)) throw new Error('改连结要选另一个库存商品');
    const snap = await getDocs(collection(db, 'suppliers'));
    const affected = snap.docs.filter(d => (d.data().catalog || []).some((c: CatalogItem) => c.linkedStockId === stockId));
    let items = 0;
    for (const d of affected) {
        items += await runTransaction(db, async tx => {
            const ref = doc(db, 'suppliers', d.id);
            const fresh = await tx.get(ref);
            if (!fresh.exists()) return 0;
            const r = applyStockDeletionToCatalog(fresh.data().catalog || [], stockId, action, newStockId);
            if (r.changed) tx.update(ref, { catalog: r.catalog });
            return r.changed;
        });
    }
    return { suppliers: affected.length, items };
};
