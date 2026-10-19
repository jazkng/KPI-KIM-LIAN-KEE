// ============================================================================
// 把库存商品移到另一个区域（例如 食油：厨房 → 燃料）
// ----------------------------------------------------------------------------
// 区域就是集合（stock_kitchen / stock_bar / stock_general / stock_fuel），所以「移动」=
// 在同一个交易里：新区域写一份（同一个内部 ID）、旧区域删除。内部 ID 不变，
// 菜谱、供应商连结、价格记录都还连得到。
// 编号跟着区域走（K/B/G/F）：已执行全部重新连号（有计数器）时，在新区域配下一个号码，
// 旧编号放进 legacyCodes（搜寻还找得到），登记表的旧编号标记 MOVED，永不重复使用。
// 每次移动写一笔 stock_area_moves 记录。只给负责人 / 系统管理员使用。
// 旧区域里「文件名不同、id 相同」的残留副本一起删除（资料备份在移动记录的 removedDuplicates）；
// 之前已移过去、只剩残留副本时，再按一次「移到其他区域」就只清副本。
// ============================================================================

import { collection, doc, getDocs, query, runTransaction, where, type DocumentReference, type Firestore } from 'firebase/firestore';
import { STOCK_AREA_COLLECTION, type StockArea } from './stockArea';
import { STOCK_CODES_COLLECTION } from './stockCode';
import { reserveStockCode } from './stockCodeAllocator';

export const STOCK_AREA_MOVES_COLLECTION = 'stock_area_moves';
export const STOCK_AREA_LABEL: Record<StockArea, string> = { KITCHEN: '厨房 (Kitchen)', BAR: '水吧 (Bar)', GENERAL: '后勤 (General)', FUEL: '燃料 (Fuel)' };

export interface MoveStockResult {
    oldCode: string | null; newCode: string | null; moveId: string;
    /** 旧区域里另外删掉的残留副本数量（文件名不同、但 id 一样的旧资料） */
    removedCopies: number;
    /** true = 商品早已移到新区域，这次只是清掉旧区域的残留副本 */
    cleanupOnly: boolean;
}

/** 备份进移动记录时，太大的图片（data: URL）不放，免得超过文件大小上限 */
const backupOf = (data: Record<string, unknown>) => {
    const img = data.image;
    return typeof img === 'string' && img.startsWith('data:') && img.length > 20000 ? { ...data, image: '(图片太大，未备份)' } : data;
};

export const moveStockItem = async (db: Firestore, args: {
    stockId: string; from: StockArea; to: StockArea; category: string; by: string;
}): Promise<MoveStockResult> => {
    const { stockId, from, to, category, by } = args;
    if (!stockId) throw new Error('缺少商品 ID');
    if (from === to) throw new Error('新区域跟原本的区域一样');
    const fromRef = doc(db, STOCK_AREA_COLLECTION[from], stockId);
    const toRef = doc(db, STOCK_AREA_COLLECTION[to], stockId);
    const moveId = `mv_${Date.now()}_${stockId}`;

    // 旧资料可能有「文件名 ≠ id」的副本（例如文件 abc 里写 id: K_OIL）。只删 K_OIL 会留下 abc，
    // 画面上旧区域还看得到这个商品。先找出这些副本，在同一个交易里一起删掉（资料备份进移动记录）。
    const copySnap = await getDocs(query(collection(db, STOCK_AREA_COLLECTION[from]), where('id', '==', stockId)));
    const copyRefs: DocumentReference[] = copySnap.docs.filter(d => d.id !== stockId).map(d => d.ref);

    return runTransaction(db, async tx => {
        // 先做完所有读取
        const src = await tx.get(fromRef);
        const dst = await tx.get(toRef);
        const copies = (await Promise.all(copyRefs.map(r => tx.get(r)))).filter(c => c.exists() && c.data()?.id === stockId);
        const now = new Date().toISOString();
        const removedDuplicates = copies.map(c => ({ docId: c.id, data: backupOf(c.data() as Record<string, unknown>) }));

        // 之前已经移过去、旧区域只剩残留副本 → 只清副本，新区域的资料不动
        if (!src.exists() && dst.exists() && copies.length > 0) {
            copies.forEach(c => tx.delete(c.ref));
            tx.set(doc(db, STOCK_AREA_MOVES_COLLECTION, moveId), {
                id: moveId, stockId, name: String(dst.data()?.name || ''), from, to, cleanupOnly: true,
                removedDuplicates, at: now, by,
            });
            const code = (dst.data()?.stockCode as string) || null;
            return { oldCode: code, newCode: code, moveId, removedCopies: copies.length, cleanupOnly: true };
        }
        if (!src.exists()) throw new Error('这个商品已不在原本的区域（可能已被移动或删除），请刷新后再试。');
        if (dst.exists()) throw new Error('新区域已经有同一个 ID 的商品（复制品），没有移动。重新打开这个商品，最上面可以选择保留哪一份。');
        const data = src.data();
        const oldCode: string | null = data.stockCode || null;
        const oldReg = oldCode ? await tx.get(doc(db, STOCK_CODES_COLLECTION, oldCode)) : null;
        const reserved = await reserveStockCode(tx, db, to, stockId, by, 'MANUAL');

        // 写入
        const legacyCodes = reserved && oldCode
            ? [...new Set([...(data.legacyCodes || []), oldCode])].filter(c => c !== reserved.stockCode)
            : data.legacyCodes;
        tx.set(toRef, {
            ...data,
            id: stockId,
            category,
            ...(legacyCodes ? { legacyCodes } : {}),
            areaMovedFrom: from,
            areaMovedAt: now,
            areaMovedBy: by,
        });
        reserved?.write(tx, toRef);
        if (reserved && oldReg?.exists()) tx.update(oldReg.ref, { status: 'MOVED', movedTo: reserved.stockCode, movedAt: now });
        tx.delete(fromRef);
        copies.forEach(c => tx.delete(c.ref));
        tx.set(doc(db, STOCK_AREA_MOVES_COLLECTION, moveId), {
            id: moveId, stockId, name: data.name || '', from, to,
            fromCategory: data.category || null, toCategory: category,
            oldCode, newCode: reserved?.stockCode ?? oldCode, at: now, by,
            ...(removedDuplicates.length ? { removedDuplicates } : {}),
        });
        return { oldCode, newCode: reserved?.stockCode ?? oldCode, moveId, removedCopies: copies.length, cleanupOnly: false };
    });
};
