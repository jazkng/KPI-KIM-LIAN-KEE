/**
 * 网站订单中心的 Firestore 交易（只在本机 Emulator 运行，永远不连正式项目）
 * 验证：审计事件与订单同一交易写入；POS 单号一对一；同时操作时后到者失败、不覆盖。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { performOrderAction } from '../../utils/onlineOrders/orderService';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;
const crew = { id: '020', name: 'Crew', orgLevel: 'CREW' };

beforeAll(async () => {
    expect(PROJECT_ID.startsWith('demo-')).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST, '必须通过 firebase emulators:exec 运行').toBeTruthy();
    env = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
});

beforeEach(async () => {
    await env.clearFirestore();
    db = env.authenticatedContext('staff-020', {}).firestore() as unknown as Firestore;
    const base = { orderNo: 'W-260913-001', businessDate: '2026-09-13', paymentStatus: 'UNPAID', lines: [], customer: { name: 'A', phone: '+60123456789' },
        pickup: { type: 'ASAP' }, createdAt: '2026-09-13T10:00:00Z', totals: { totalSen: 100 } };
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'online_orders/o1'), { ...base, status: 'PENDING_CONFIRMATION' });
        await setDoc(doc(ctx.firestore(), 'online_orders/o2'), { ...base, orderNo: 'W-260913-002', status: 'READY' });
        await setDoc(doc(ctx.firestore(), 'online_orders/o3'), { ...base, orderNo: 'W-260913-003', status: 'READY' });
    });
});

afterAll(async () => {
    await env?.cleanup();
});

describe('网站订单中心交易', () => {
    it('接单：订单更新与审计事件一起写入', async () => {
        await performOrderAction(db, 'o1', 'ACCEPT', crew);
        expect((await getDoc(doc(db, 'online_orders/o1'))).data()?.status).toBe('ACCEPTED');
        const events = (await getDocs(collection(db, 'online_order_events'))).docs.map(d => d.data());
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ orderId: 'o1', action: 'ACCEPT', from: { status: 'PENDING_CONFIRMATION' }, to: { status: 'ACCEPTED' } });
    });

    it('同一张 POS 单不能对应两张网站订单', async () => {
        await performOrderAction(db, 'o2', 'MARK_PAID', crew, { posReceiptNo: 'R00123', storeId: 'KEPONG' });
        await expect(performOrderAction(db, 'o3', 'MARK_PAID', crew, { posReceiptNo: 'r 00123', storeId: 'KEPONG' })).rejects.toThrow(/已对应订单/);
        expect((await getDoc(doc(db, 'online_orders/o3'))).data()?.paymentStatus).toBe('UNPAID');
        expect((await getDoc(doc(db, 'online_order_pos_receipts/KEPONG_2026-09-13_R00123'))).data()?.orderId).toBe('o2');
    });

    it('两位店员同时操作：一个接单、一个拒单，只有一个成功，不会互相覆盖', async () => {
        const results = await Promise.allSettled([
            performOrderAction(db, 'o1', 'ACCEPT', crew),
            performOrderAction(db, 'o1', 'REJECT', crew, { reason: '食材用完' }),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const events = (await getDocs(collection(db, 'online_order_events'))).docs;
        expect(events).toHaveLength(1);
        const status = (await getDoc(doc(db, 'online_orders/o1'))).data()?.status;
        expect(['ACCEPTED', 'REJECTED']).toContain(status);
        expect(events[0].data().to.status).toBe(status);
    });

    it('非法操作不写入任何资料', async () => {
        await expect(performOrderAction(db, 'o1', 'COMPLETE', crew)).rejects.toThrow();
        expect((await getDocs(collection(db, 'online_order_events'))).size).toBe(0);
    });
});
