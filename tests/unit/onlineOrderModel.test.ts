// ERP 网站订单中心：状态与付款规则（纯函数，虚构资料）
import { describe, expect, it } from 'vitest';
import { applyStaffAction, availableActions, maskPhone, normalizeReceiptNo, posReceiptKey, summariseOrders, type OnlineOrder } from '../../utils/onlineOrders/orderModel';

const order = (extra: Partial<OnlineOrder> = {}): OnlineOrder => ({
    id: 'o1', orderNo: 'W-260913-001', businessDate: '2026-09-13', status: 'PENDING_CONFIRMATION', paymentStatus: 'UNPAID',
    lines: [], totals: { subtotalSen: 5100, serviceChargeSen: 0, serviceTaxSen: 0, discountSen: 0, roundingSen: 0, totalSen: 5100 },
    customer: { name: 'Ali', phone: '+60123456789' }, pickup: { type: 'ASAP' }, createdAt: '2026-09-13T10:00:00Z', ...extra,
});
const crew = { id: '020', name: 'Crew', orgLevel: 'CREW' };
const head = { id: '030', name: 'Head', orgLevel: 'DEPARTMENT_HEAD' };

describe('订单状态转换', () => {
    it('依序：接单 → 开始备餐 → 备餐完成 → 顾客取走，每一步都产生审计事件', () => {
        let o = order();
        for (const [action, to] of [['ACCEPT', 'ACCEPTED'], ['START_PREPARING', 'PREPARING'], ['MARK_READY', 'READY'], ['COMPLETE', 'COMPLETED']] as const) {
            const r = applyStaffAction(o, action, crew, {}, 'now');
            if (r.ok === false) throw new Error(r.message);
            expect(r.event).toMatchObject({ orderId: 'o1', action, from: { status: o.status }, to: { status: to }, actor: { id: '020' } });
            o = { ...o, ...r.patch };
        }
        expect(o.status).toBe('COMPLETED');
    });

    it('不能跳步或倒退；拒单与取消须填原因', () => {
        expect(applyStaffAction(order(), 'COMPLETE', crew).ok).toBe(false);
        expect(applyStaffAction(order({ status: 'COMPLETED' }), 'ACCEPT', crew).ok).toBe(false);
        const r = applyStaffAction(order(), 'REJECT', crew, { reason: ' ' });
        expect(r.ok === false && r.error).toBe('REASON_REQUIRED');
        expect(applyStaffAction(order({ status: 'PREPARING' }), 'CANCEL', crew, { reason: '食材用完' }).ok).toBe(true);
    });
});

describe('付款状态（与订单状态分开，提交订单不等于付款）', () => {
    it('标记已收款必须填 POS 单号；单号正规化并产生门店 + 营业日的对应键', () => {
        const o = order({ status: 'READY' });
        const missing = applyStaffAction(o, 'MARK_PAID', crew, {});
        expect(missing.ok === false && missing.error).toBe('POS_RECEIPT_REQUIRED');
        const r = applyStaffAction(o, 'MARK_PAID', crew, { posReceiptNo: ' r 00123 ', storeId: 'KEPONG' }, 'now');
        if (r.ok === false) throw new Error(r.message);
        expect(r.patch).toMatchObject({ paymentStatus: 'PAID_AT_COUNTER', posReceiptNo: 'R00123', paidAt: 'now' });
        expect(r.receiptKey).toBe('KEPONG_2026-09-13_R00123');
        expect(r.patch.status).toBeUndefined();
    });

    it('未接单、已拒单 / 取消、或已付款的订单不能再标记付款', () => {
        expect(applyStaffAction(order(), 'MARK_PAID', crew, { posReceiptNo: 'R1' }).ok).toBe(false);
        expect(applyStaffAction(order({ status: 'CANCELLED' }), 'MARK_PAID', crew, { posReceiptNo: 'R1' }).ok).toBe(false);
        expect(applyStaffAction(order({ status: 'READY', paymentStatus: 'PAID_AT_COUNTER' }), 'MARK_PAID', crew, { posReceiptNo: 'R1' }).ok).toBe(false);
    });

    it('免单只限管理层，须填原因', () => {
        const o = order({ status: 'READY' });
        expect(applyStaffAction(o, 'WAIVE', crew, { reason: 'x' }).ok).toBe(false);
        expect(applyStaffAction(o, 'WAIVE', head, {}).ok).toBe(false);
        expect(applyStaffAction(o, 'WAIVE', head, { reason: '出错补偿' }).ok).toBe(true);
        expect(availableActions(o, crew)).not.toContain('WAIVE');
        expect(availableActions(o, head)).toContain('WAIVE');
    });
});

describe('画面辅助', () => {
    it('按钮只显示合法操作', () => {
        expect(availableActions(order(), crew)).toEqual(['ACCEPT', 'REJECT']);
        expect(availableActions(order({ status: 'READY' }), crew)).toEqual(['COMPLETE', 'CANCEL', 'MARK_PAID']);
        expect(availableActions(order({ status: 'REJECTED' }), head)).toEqual([]);
    });

    it('电话只显示末 4 码；单号正规化', () => {
        expect(maskPhone('+60123456789')).toBe('••••••••6789');
        expect(normalizeReceiptNo(' a-12 b ')).toBe('A-12B');
        expect(posReceiptKey('kepong', '2026-09-13', 'r1')).toBe('KEPONG_2026-09-13_R1');
    });

    it('摘要只计单数，并找出「已取走但未结账」的订单', () => {
        const s = summariseOrders([
            order(), order({ status: 'COMPLETED' }), order({ status: 'COMPLETED', paymentStatus: 'PAID_AT_COUNTER' }), order({ status: 'CANCELLED' }),
        ]);
        expect(s).toMatchObject({ total: 4, pending: 1, completed: 2, closed: 1, collectedUnpaid: 1, paidAtPosCount: 1 });
        expect(Object.keys(s)).not.toContain('revenue');
    });
});
