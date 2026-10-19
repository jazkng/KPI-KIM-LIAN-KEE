// ============================================================================
// 应付账款「冻结」（负责人 2026-10-19 批准）
// ----------------------------------------------------------------------------
// 疑似重复或资料不全、超过一个月没付、供应商又没资料的账单：先冻结，不删除。
//   · 只能冻结「完全未付」的账单（没有任何付款）。
//   · 冻结后 V2 不计入任何财务：应付、逾期、经营重点 / 驾驶舱、盈亏、财务报表、资金规划、供应商未付款。
//   · 只新增可选字段（frozen / frozenAt / frozenBy / frozenReason / frozenHistory），
//     不改金额、状态、日期；V1 不认识这些字段，仍会照常计算（负责人已接受）。
//   · 每次冻结 / 解冻都记进 frozenHistory。只有负责人 / 系统管理员可以操作。
// ============================================================================

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { ExpenseItem } from '../../types';

export const isFrozenBill = (e: { frozen?: unknown } | null | undefined): boolean => e?.frozen === true;

/** 财务计算前一律用这个过滤 */
export const withoutFrozen = <T extends { frozen?: unknown }>(list: T[]): T[] => list.filter(e => !isFrozenBill(e));

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 能不能冻结：完全未付（UNPAID、未付余额等于账单总额、没有付款日期），而且还没冻结 */
export const freezeBlockReason = (e: Partial<ExpenseItem>): string | null => {
    if (isFrozenBill(e)) return '已经冻结';
    if (e.paymentStatus !== 'UNPAID') return '只有完全未付的账单可以冻结（这张已付或部分付款）';
    const total = num(e.totalBillAmount ?? e.amount);
    const outstanding = e.outstandingAmount === undefined || e.outstandingAmount === null ? total : num(e.outstandingAmount);
    if (total > 0 && Math.abs(outstanding - total) > 0.005) return '这张账单已有付款，不能冻结';
    if (e.paymentDate) return '这张账单有付款日期，不能冻结';
    return null;
};

export interface FrozenEvent { action: 'FREEZE' | 'UNFREEZE'; at: string; by: string; reason?: string }

export const freezeBill = async (db: Firestore, id: string, reason: string, by: string): Promise<void> => {
    const r = reason.trim();
    if (!r) throw new Error('请填写冻结原因');
    const ref = doc(db, 'standalone_expenses', id);
    await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('找不到这张账单');
        const data = snap.data() as ExpenseItem;
        const block = freezeBlockReason(data);
        if (block) throw new Error(block);
        const at = new Date().toISOString();
        const history: FrozenEvent[] = [...(data.frozenHistory || []), { action: 'FREEZE', at, by, reason: r }];
        tx.update(ref, { frozen: true, frozenAt: at, frozenBy: by, frozenReason: r, frozenHistory: history });
    });
};

export const unfreezeBill = async (db: Firestore, id: string, by: string): Promise<void> => {
    const ref = doc(db, 'standalone_expenses', id);
    await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('找不到这张账单');
        const data = snap.data() as ExpenseItem;
        if (!isFrozenBill(data)) return;
        const at = new Date().toISOString();
        const history: FrozenEvent[] = [...(data.frozenHistory || []), { action: 'UNFREEZE', at, by }];
        // frozen 改成 false（不删字段）：留下最后一次冻结的原因，历史在 frozenHistory
        tx.update(ref, { frozen: false, frozenHistory: history });
    });
};
