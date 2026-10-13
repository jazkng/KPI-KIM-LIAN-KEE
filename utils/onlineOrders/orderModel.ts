// ============================================================================
// ERP 网站订单中心 · 资料模型与状态规则（依 docs/api/online-orders-contract.md）
// ----------------------------------------------------------------------------
// 纯函数：判断店员操作是否合法、产生订单更新内容与审计事件。
// Firestore 交易在 orderService.ts 执行，这里不碰资料库，方便测试。
//
// 重要原则：
//   - 订单状态与付款状态分开；提交订单不等于付款。
//   - 网站订单金额**不计入营业额**；营业额以 POS / 日结为准。
//   - 标记已收款必须填 POS 单号，一张 POS 单只能对应一张网站订单。
//   - 不使用旧的 Kitchen Alert；备餐状态在订单中心内管理。
// ============================================================================
import type { PricedLine } from './pricing';

export type OrderStatus =
    | 'PENDING_CONFIRMATION'
    | 'ACCEPTED'
    | 'PREPARING'
    | 'READY'
    | 'COMPLETED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';

export type PaymentStatus = 'UNPAID' | 'PAID_AT_COUNTER' | 'WAIVED';

/** Firestore 路径：online_orders/{orderId}（由公开 API 服务端建立） */
export interface OnlineOrder {
    id: string;
    orderNo: string;
    /** 营业日 YYYY-MM-DD（马来西亚时间，凌晨 4 点前归前一天），订单中心按此查询 */
    businessDate: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    lines: PricedLine[];
    totals: {
        subtotalSen: number;
        serviceChargeSen: number;
        serviceTaxSen: number;
        discountSen: number;
        roundingSen: number;
        totalSen: number;
    };
    customer: { name: string; phone: string };
    pickup: { type: 'ASAP' | 'SCHEDULED'; time?: string };
    orderNote?: string;
    createdAt: string;
    updatedAt?: string;
    /** 店员拒单 / 取消的原因（会显示给顾客） */
    reason?: string;
    posReceiptNo?: string;
    paidAt?: string;
    waivedReason?: string;
}

export type StaffAction = 'ACCEPT' | 'REJECT' | 'START_PREPARING' | 'MARK_READY' | 'COMPLETE' | 'CANCEL' | 'MARK_PAID' | 'WAIVE';

export interface StaffActor {
    id: string;
    name: string;
    /** 组织层级（免单只限管理层以上） */
    orgLevel?: string;
}

export interface ActionInput {
    reason?: string;
    posReceiptNo?: string;
    storeId?: string;
}

/** Firestore 路径：online_order_events/{eventId}（只增不改） */
export interface OrderEvent {
    orderId: string;
    orderNo: string;
    action: StaffAction;
    from: { status: OrderStatus; paymentStatus: PaymentStatus };
    to: { status: OrderStatus; paymentStatus: PaymentStatus };
    actor: { type: 'STAFF'; id: string; name: string };
    reason?: string;
    posReceiptNo?: string;
    at: string;
}

export type ActionError =
    | 'INVALID_TRANSITION'
    | 'REASON_REQUIRED'
    | 'POS_RECEIPT_REQUIRED'
    | 'ALREADY_SETTLED'
    | 'ORDER_CLOSED'
    | 'NOT_ALLOWED';

export type ActionResult =
    | { ok: true; patch: Partial<OnlineOrder>; event: OrderEvent; receiptKey?: string }
    | { ok: false; error: ActionError; message: string };

export const STATUS_LABEL: Record<OrderStatus, string> = {
    PENDING_CONFIRMATION: '待确认',
    ACCEPTED: '已接单',
    PREPARING: '备餐中',
    READY: '可取餐',
    COMPLETED: '已取走',
    REJECTED: '已拒单',
    CANCELLED: '已取消',
    EXPIRED: '逾时未接',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
    UNPAID: '未付款',
    PAID_AT_COUNTER: '已在 POS 结账',
    WAIVED: '免单',
};

export const ACTION_LABEL: Record<StaffAction, string> = {
    ACCEPT: '接单',
    REJECT: '拒单',
    START_PREPARING: '开始备餐',
    MARK_READY: '备餐完成',
    COMPLETE: '顾客已取走',
    CANCEL: '取消订单',
    MARK_PAID: '已在 POS 收款',
    WAIVE: '免单',
};

/** 订单状态转换（店员可执行的部分） */
const STATUS_TRANSITIONS: Partial<Record<StaffAction, { from: OrderStatus[]; to: OrderStatus; needsReason?: boolean }>> = {
    ACCEPT: { from: ['PENDING_CONFIRMATION'], to: 'ACCEPTED' },
    REJECT: { from: ['PENDING_CONFIRMATION'], to: 'REJECTED', needsReason: true },
    START_PREPARING: { from: ['ACCEPTED'], to: 'PREPARING' },
    MARK_READY: { from: ['ACCEPTED', 'PREPARING'], to: 'READY' },
    COMPLETE: { from: ['READY'], to: 'COMPLETED' },
    CANCEL: { from: ['ACCEPTED', 'PREPARING', 'READY'], to: 'CANCELLED', needsReason: true },
};

const CLOSED: OrderStatus[] = ['REJECTED', 'CANCELLED', 'EXPIRED'];
const MANAGER_LEVELS = ['OWNER', 'BRANCH_MANAGER', 'STAFF_SUPPORT', 'DEPARTMENT_HEAD'];

/** 这个订单在目前状态下，店员可以做哪些操作（画面用来显示按钮） */
export const availableActions = (order: Pick<OnlineOrder, 'status' | 'paymentStatus'>, actor?: StaffActor): StaffAction[] => {
    const actions = (Object.keys(STATUS_TRANSITIONS) as StaffAction[]).filter(a => STATUS_TRANSITIONS[a]!.from.includes(order.status));
    if (order.paymentStatus === 'UNPAID' && !CLOSED.includes(order.status) && order.status !== 'PENDING_CONFIRMATION') {
        actions.push('MARK_PAID');
        if (!actor || MANAGER_LEVELS.includes(actor.orgLevel || '')) actions.push('WAIVE');
    }
    return actions;
};

/** POS 单号正规化：去空白、转大写，只保留英数与横线 */
export const normalizeReceiptNo = (value: string): string => String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');

/** online_order_pos_receipts 的文件 ID：门店 + 营业日 + 正规化单号 */
export const posReceiptKey = (storeId: string, businessDate: string, receiptNo: string): string =>
    `${normalizeReceiptNo(storeId) || 'STORE'}_${businessDate}_${normalizeReceiptNo(receiptNo)}`;

/**
 * 店员操作 → 订单更新内容与审计事件。
 * 不合法就回传错误，不产生任何写入。
 */
export const applyStaffAction = (
    order: OnlineOrder,
    action: StaffAction,
    actor: StaffActor,
    input: ActionInput = {},
    now: string = new Date().toISOString(),
): ActionResult => {
    const reason = (input.reason || '').trim();
    const fail = (error: ActionError, message: string): ActionResult => ({ ok: false, error, message });
    let nextStatus = order.status;
    let nextPayment = order.paymentStatus;
    const patch: Partial<OnlineOrder> = { updatedAt: now };
    let receiptKey: string | undefined;
    let receiptNo: string | undefined;

    const transition = STATUS_TRANSITIONS[action];
    if (transition) {
        if (!transition.from.includes(order.status)) {
            return fail('INVALID_TRANSITION', `订单目前是「${STATUS_LABEL[order.status]}」，不能${ACTION_LABEL[action]}`);
        }
        if (transition.needsReason && !reason) return fail('REASON_REQUIRED', `${ACTION_LABEL[action]}须填写原因`);
        nextStatus = transition.to;
        patch.status = nextStatus;
        if (reason) patch.reason = reason;
    } else if (action === 'MARK_PAID' || action === 'WAIVE') {
        if (CLOSED.includes(order.status)) return fail('ORDER_CLOSED', '订单已拒单、取消或逾时，不能标记付款');
        if (order.status === 'PENDING_CONFIRMATION') return fail('INVALID_TRANSITION', '请先接单，再标记付款');
        if (order.paymentStatus !== 'UNPAID') return fail('ALREADY_SETTLED', `付款状态已是「${PAYMENT_LABEL[order.paymentStatus]}」`);
        if (action === 'MARK_PAID') {
            receiptNo = normalizeReceiptNo(input.posReceiptNo || '');
            if (!receiptNo) return fail('POS_RECEIPT_REQUIRED', '请填写 POS 单号（在 POS 结账后才可标记）');
            nextPayment = 'PAID_AT_COUNTER';
            patch.paymentStatus = nextPayment;
            patch.posReceiptNo = receiptNo;
            patch.paidAt = now;
            receiptKey = posReceiptKey(input.storeId || 'KEPONG', order.businessDate, receiptNo);
        } else {
            if (!MANAGER_LEVELS.includes(actor.orgLevel || '')) return fail('NOT_ALLOWED', '免单只限管理层以上');
            if (!reason) return fail('REASON_REQUIRED', '免单须填写原因');
            nextPayment = 'WAIVED';
            patch.paymentStatus = nextPayment;
            patch.waivedReason = reason;
        }
    } else {
        return fail('INVALID_TRANSITION', '未知的操作');
    }

    const event: OrderEvent = {
        orderId: order.id,
        orderNo: order.orderNo,
        action,
        from: { status: order.status, paymentStatus: order.paymentStatus },
        to: { status: nextStatus, paymentStatus: nextPayment },
        actor: { type: 'STAFF', id: actor.id, name: actor.name },
        ...(reason ? { reason } : {}),
        ...(receiptNo ? { posReceiptNo: receiptNo } : {}),
        at: now,
    };
    return { ok: true, patch, event, ...(receiptKey ? { receiptKey } : {}) };
};

export const formatSen = (sen: number): string =>
    `RM ${((Number(sen) || 0) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 电话只显示末 4 码（个资最少化）；需要联络时由店员点开 */
export const maskPhone = (phone: string): string => {
    const digits = String(phone || '');
    return digits.length <= 4 ? digits : `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

/**
 * 当日摘要：只做单数统计。网站订单金额不计入营业额；
 * 「已在 POS 结账」的金额仅供对账参考，营业额以 POS 日结为准。
 */
export const summariseOrders = (orders: OnlineOrder[]) => {
    const count = (pred: (o: OnlineOrder) => boolean) => orders.filter(pred).length;
    return {
        total: orders.length,
        pending: count(o => o.status === 'PENDING_CONFIRMATION'),
        inProgress: count(o => ['ACCEPTED', 'PREPARING'].includes(o.status)),
        ready: count(o => o.status === 'READY'),
        completed: count(o => o.status === 'COMPLETED'),
        closed: count(o => CLOSED.includes(o.status)),
        unpaidOpen: count(o => o.paymentStatus === 'UNPAID' && !CLOSED.includes(o.status)),
        /** 已取走但未在 POS 结账：对账时要追查 */
        collectedUnpaid: count(o => o.status === 'COMPLETED' && o.paymentStatus === 'UNPAID'),
        paidAtPosCount: count(o => o.paymentStatus === 'PAID_AT_COUNTER'),
    };
};
