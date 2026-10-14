// ============================================================================
// ERP 网站订单中心 · Firestore 存取
// ----------------------------------------------------------------------------
// - 只按营业日查询订单（不读整个集合），即时更新用 onSnapshot。
// - 每个店员操作都在同一个交易内：确认来源状态 → 更新订单 → 新增审计事件；
//   标记已收款时同时建立 POS 单号对应（已存在就拒绝，一张 POS 单只能对应一张订单）。
// - 订单只由公开 API 服务端建立；这里不建立、不删除订单。
// ============================================================================
import { collection, doc, onSnapshot, query, runTransaction, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { applyStaffAction, type ActionInput, type OnlineOrder, type StaffAction, type StaffActor } from './orderModel';

export const ORDERS = 'online_orders';
export const EVENTS = 'online_order_events';
export const POS_RECEIPTS = 'online_order_pos_receipts';

/** 某营业日的全部订单（即时更新） */
export const subscribeOrdersByBusinessDate = (
    db: Firestore,
    businessDate: string,
    onData: (orders: OnlineOrder[]) => void,
    onError: (error: Error) => void,
): Unsubscribe =>
    onSnapshot(
        query(collection(db, ORDERS), where('businessDate', '==', businessDate)),
        snap => onData(snap.docs.map(d => ({ ...(d.data() as OnlineOrder), id: d.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
        onError,
    );

export class OrderActionError extends Error {
    constructor(public code: string, message: string) {
        super(message);
    }
}

/**
 * 执行店员操作（交易）。来源状态在交易内重新读取并验证，
 * 两位店员同时操作时，后到的一方会收到错误，不会互相覆盖。
 */
export const performOrderAction = async (
    db: Firestore,
    orderId: string,
    action: StaffAction,
    actor: StaffActor,
    input: ActionInput = {},
): Promise<void> => {
    await runTransaction(db, async tx => {
        const ref = doc(db, ORDERS, orderId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new OrderActionError('ORDER_NOT_FOUND', '订单不存在');
        const order = { ...(snap.data() as OnlineOrder), id: snap.id };
        const outcome = applyStaffAction(order, action, actor, input);
        if (outcome.ok === false) throw new OrderActionError(outcome.error, outcome.message);
        const result = outcome;

        if (result.receiptKey) {
            const receiptRef = doc(db, POS_RECEIPTS, result.receiptKey);
            const receipt = await tx.get(receiptRef);
            if (receipt.exists()) {
                throw new OrderActionError('POS_RECEIPT_ALREADY_USED', `POS 单号 ${input.posReceiptNo} 已对应订单 ${receipt.data().orderNo || ''}，一张 POS 单只能对应一张网站订单`);
            }
            tx.set(receiptRef, { orderId: order.id, orderNo: order.orderNo, businessDate: order.businessDate, markedById: actor.id, markedByName: actor.name, markedAt: result.event.at });
        }
        tx.update(ref, result.patch as Record<string, unknown>);
        tx.set(doc(collection(db, EVENTS)), JSON.parse(JSON.stringify(result.event)));
    });
};
