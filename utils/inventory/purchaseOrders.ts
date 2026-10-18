// 取消未收货的采购单（数据审查中心用）
// 只把状态改成 CANCELLED 并记下谁、何时取消；不删除单据，不动库存，不产生账单。
// 在交易里确认仍是「未收货」才改，避免同一时间有人正在收货。
import { doc, runTransaction, type Firestore } from 'firebase/firestore';

export const cancelPurchaseOrder = async (db: Firestore, poId: string, by: string): Promise<void> => {
    const ref = doc(db, 'purchase_orders', poId);
    await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`找不到采购单 ${poId}`);
        const status = snap.data().status;
        if (status !== 'ORDERED') throw new Error(`采购单 ${poId} 现在是「${status === 'RECEIVED' ? '已收货' : status === 'CANCELLED' ? '已取消' : status}」，没有更改`);
        tx.update(ref, { status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancelledBy: by });
    });
};
