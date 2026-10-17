// ============================================================================
// 新编号配发 · 在 Firestore 交易里进行
// ----------------------------------------------------------------------------
// stock_code_counters/{K|B|G|F}.nextSeq 是下一个号码；stock_codes/{code} 是登记表。
// 同一交易内：读计数器 → 确认号码没被登记 → 写商品、登记表、计数器。
// 两个人同时新增时，Firestore 会让其中一个交易重跑，所以不会拿到同一个号码。
// 还没执行「全部重新连号」（没有计数器）时不配号：避免新商品抢走 K0001，打乱整批连号的顺序。
// ============================================================================

import { doc, runTransaction, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore';
import { STOCK_AREA_COLLECTION, type StockArea } from './stockArea';
import { STOCK_CODE_PREFIX, STOCK_CODES_COLLECTION as CODES, STOCK_CODE_COUNTERS_COLLECTION as COUNTERS, formatStockCode } from './stockCode';

const MAX_SKIP = 50;

export interface AllocatedCode {
    stockCode: string;
    write: (tx: Transaction, itemRef: DocumentReference) => void;
}

/**
 * 交易里的「读」部分：找出下一个可用号码。没有计数器时返回 null（不配号）。
 * 呼叫端在所有读取完成后呼叫 write() 写入商品、登记表与计数器。
 */
export const reserveStockCode = async (
    tx: Transaction, db: Firestore, area: StockArea, stockId: string, by: string, source: 'AUTO' | 'MANUAL' = 'AUTO',
): Promise<AllocatedCode | null> => {
    const prefix = STOCK_CODE_PREFIX[area];
    const counterRef = doc(db, COUNTERS, prefix);
    const counter = await tx.get(counterRef);
    if (!counter.exists()) return null;
    let seq = Math.max(1, Number(counter.data().nextSeq) || 1);
    for (let i = 0; i < MAX_SKIP; i++, seq++) {
        const code = formatStockCode(area, seq);
        const reg = await tx.get(doc(db, CODES, code));
        if (reg.exists()) continue; // 已被使用（不应发生，保险起见跳过，永不重复使用）
        const now = new Date().toISOString();
        const next = seq + 1;
        return {
            stockCode: code,
            write: (t, itemRef) => {
                t.update(itemRef, { stockCode: code, stockCodeAssignedAt: now, stockCodeAssignedBy: by, stockCodeSource: source });
                t.set(doc(db, CODES, code), { code, stockId, area, status: 'ACTIVE', assignedAt: now, assignedBy: by, source });
                t.set(counterRef, { prefix, nextSeq: next, updatedAt: now });
            },
        };
    }
    throw new Error(`编号 ${prefix} 连续 ${MAX_SKIP} 个都已被使用，请联络管理员检查编号登记表`);
};

/** 为已经存在、但还没编号的商品配号（例如 V1 新增的商品、处理好的复制品）。已有编号就不动。 */
export const assignCodeToExisting = async (db: Firestore, area: StockArea, stockId: string, by: string): Promise<string | null> =>
    runTransaction(db, async tx => {
        const itemRef = doc(db, STOCK_AREA_COLLECTION[area], stockId);
        const item = await tx.get(itemRef);
        if (!item.exists()) throw new Error(`找不到商品 ${stockId}`);
        if (item.data().stockCode) return item.data().stockCode as string;
        const reserved = await reserveStockCode(tx, db, area, stockId, by, 'MANUAL');
        if (!reserved) return null;
        reserved.write(tx, itemRef);
        return reserved.stockCode;
    });
