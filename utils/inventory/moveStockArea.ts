// ============================================================================
// 把库存商品移到另一个区域（例如 食油：厨房 → 燃料）
// ----------------------------------------------------------------------------
// 区域就是集合（stock_kitchen / stock_bar / stock_general / stock_fuel），所以「移动」=
// 在同一个交易里：新区域写一份（同一个内部 ID）、旧区域删除。内部 ID 不变，
// 菜谱、供应商连结、价格记录都还连得到。
// 编号跟着区域走（K/B/G/F）：已执行全部重新连号（有计数器）时，在新区域配下一个号码，
// 旧编号放进 legacyCodes（搜寻还找得到），登记表的旧编号标记 MOVED，永不重复使用。
// 每次移动写一笔 stock_area_moves 记录。只给负责人 / 系统管理员使用。
// ============================================================================

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { STOCK_AREA_COLLECTION, type StockArea } from './stockArea';
import { STOCK_CODES_COLLECTION } from './stockCode';
import { reserveStockCode } from './stockCodeAllocator';

export const STOCK_AREA_MOVES_COLLECTION = 'stock_area_moves';
export const STOCK_AREA_LABEL: Record<StockArea, string> = { KITCHEN: '厨房 (Kitchen)', BAR: '水吧 (Bar)', GENERAL: '后勤 (General)', FUEL: '燃料 (Fuel)' };

export interface MoveStockResult { oldCode: string | null; newCode: string | null; moveId: string }

export const moveStockItem = async (db: Firestore, args: {
    stockId: string; from: StockArea; to: StockArea; category: string; by: string;
}): Promise<MoveStockResult> => {
    const { stockId, from, to, category, by } = args;
    if (!stockId) throw new Error('缺少商品 ID');
    if (from === to) throw new Error('新区域跟原本的区域一样');
    const fromRef = doc(db, STOCK_AREA_COLLECTION[from], stockId);
    const toRef = doc(db, STOCK_AREA_COLLECTION[to], stockId);
    const moveId = `mv_${Date.now()}_${stockId}`;

    return runTransaction(db, async tx => {
        // 先做完所有读取
        const src = await tx.get(fromRef);
        if (!src.exists()) throw new Error('这个商品已不在原本的区域（可能已被移动或删除），请刷新后再试。');
        const dst = await tx.get(toRef);
        if (dst.exists()) throw new Error('新区域已经有同一个 ID 的商品（复制品），没有移动。请先到「库存资料审计」处理复制品。');
        const data = src.data();
        const oldCode: string | null = data.stockCode || null;
        const oldReg = oldCode ? await tx.get(doc(db, STOCK_CODES_COLLECTION, oldCode)) : null;
        const reserved = await reserveStockCode(tx, db, to, stockId, by, 'MANUAL');

        // 写入
        const now = new Date().toISOString();
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
        tx.set(doc(db, STOCK_AREA_MOVES_COLLECTION, moveId), {
            id: moveId, stockId, name: data.name || '', from, to,
            fromCategory: data.category || null, toCategory: category,
            oldCode, newCode: reserved?.stockCode ?? oldCode, at: now, by,
        });
        return { oldCode, newCode: reserved?.stockCode ?? oldCode, moveId };
    });
};
