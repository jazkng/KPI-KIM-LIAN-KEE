// ============================================================================
// 同一个库存商品（同一 ID）同时出现在两个区域时：由负责人决定保留哪一份
// ----------------------------------------------------------------------------
// 例：食油已移到燃料，之后又有东西（例如 V1 或旧画面）按 ID / 分类把它写回厨房，
// 厨房和燃料就各有一份 K_OIL。用一般的「删除」会连供应商连结一起处理，
// 会弄断留下来那一份的连结，所以另外提供这个动作：
//   - 只删掉选定区域的那一份文件；供应商连结、菜谱都按 ID 连，自动连到留下的那一份
//   - 删掉的资料完整备份在 stock_area_moves（type: DUPLICATE_REMOVED），可以还原
//   - 两份编号不同时：删掉那份的编号放进留下那份的 legacyCodes（搜寻还找得到），登记表标记 MOVED
// 只给负责人 / 系统管理员使用。
// ============================================================================

import { doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore';
import { STOCK_AREAS, STOCK_AREA_COLLECTION, type StockArea } from './stockArea';
import { STOCK_CODES_COLLECTION } from './stockCode';
import { STOCK_AREA_MOVES_COLLECTION } from './moveStockArea';

export interface StockCopy {
    area: StockArea;
    name: string;
    qty: number;
    unit: string;
    category: string;
    stockCode: string | null;
}

const toCopy = (area: StockArea, d: Record<string, any>): StockCopy => ({
    area,
    name: String(d.name || ''),
    qty: Number(d.currentQtyBase ?? d.currentQty ?? 0) || 0,
    unit: String(d.baseUnit || d.unit || ''),
    category: String(d.category || ''),
    stockCode: d.stockCode ? String(d.stockCode) : null,
});

/** 其他区域里同一 ID 的副本（只读） */
export const findOtherAreaCopies = async (db: Firestore, stockId: string, current: StockArea): Promise<StockCopy[]> => {
    if (!stockId) return [];
    const others = STOCK_AREAS.filter(a => a !== current);
    const snaps = await Promise.all(others.map(a => getDoc(doc(db, STOCK_AREA_COLLECTION[a], stockId))));
    return snaps.flatMap((s, i) => (s.exists() ? [toCopy(others[i], s.data())] : []));
};

/** 备份进记录时，太大的图片（data: URL）不放，免得超过文件大小上限 */
const backupOf = (data: Record<string, unknown>) => {
    const img = data.image;
    return typeof img === 'string' && img.startsWith('data:') && img.length > 20000 ? { ...data, image: '(图片太大，未备份)' } : data;
};

/** 删掉 removeFrom 区域的那一份，保留 keepIn 区域的那一份 */
export const removeDuplicateCopy = async (db: Firestore, args: {
    stockId: string; removeFrom: StockArea; keepIn: StockArea; by: string;
}): Promise<{ logId: string }> => {
    const { stockId, removeFrom, keepIn, by } = args;
    if (!stockId) throw new Error('缺少商品 ID');
    if (removeFrom === keepIn) throw new Error('要保留和要删除的是同一个区域');
    const removeRef = doc(db, STOCK_AREA_COLLECTION[removeFrom], stockId);
    const keepRef = doc(db, STOCK_AREA_COLLECTION[keepIn], stockId);
    const logId = `dup_${Date.now()}_${stockId}`;

    return runTransaction(db, async tx => {
        const rm = await tx.get(removeRef);
        const keep = await tx.get(keepRef);
        // 两份都要还在才动手：避免把唯一的一份删掉
        if (!rm.exists() || !keep.exists()) throw new Error('这个商品已经不是两份了（可能别人刚处理过），请刷新后再看。');
        const rmData = rm.data();
        const keepData = keep.data();
        const rmCode: string | null = rmData.stockCode || null;
        const keepCode: string | null = keepData.stockCode || null;
        const rmReg = rmCode && rmCode !== keepCode ? await tx.get(doc(db, STOCK_CODES_COLLECTION, rmCode)) : null;

        const now = new Date().toISOString();
        if (rmCode && rmCode !== keepCode) {
            const legacy = [...new Set([...(keepData.legacyCodes || []), rmCode])].filter(c => c !== keepCode);
            tx.update(keepRef, { legacyCodes: legacy });
            if (rmReg?.exists() && rmReg.data()?.stockId === stockId) {
                tx.update(rmReg.ref, { status: 'MOVED', movedTo: keepCode, movedAt: now });
            }
        }
        tx.delete(removeRef);
        tx.set(doc(db, STOCK_AREA_MOVES_COLLECTION, logId), {
            id: logId, type: 'DUPLICATE_REMOVED', stockId, name: String(keepData.name || rmData.name || ''),
            from: removeFrom, to: keepIn, removedFrom: removeFrom, keptIn: keepIn,
            removedData: backupOf(rmData), at: now, by,
        });
        return { logId };
    });
};
