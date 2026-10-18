/**
 * 取消未收货的采购单（只在本机 Emulator 运行）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { cancelPurchaseOrder } from '../../utils/inventory/purchaseOrders';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;

beforeAll(async () => {
    expect(PROJECT_ID.startsWith('demo-')).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST, '必须通过 firebase emulators:exec 运行').toBeTruthy();
    env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
});
beforeEach(async () => {
    await env.clearFirestore();
    db = env.authenticatedContext('owner-001', {}).firestore() as unknown as Firestore;
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'purchase_orders/PO1'), { id: 'PO1', status: 'ORDERED', supplierName: 'WF', items: [{ stockId: 'x', name: '调色油' }], totalEstimated: 10 });
        await setDoc(doc(ctx.firestore(), 'purchase_orders/PO2'), { id: 'PO2', status: 'RECEIVED', supplierName: 'WF', items: [] });
    });
});
afterAll(async () => { await env?.cleanup(); });

describe('取消未收货的采购单', () => {
    it('只改状态与取消记录，品项与金额保留', async () => {
        await cancelPurchaseOrder(db, 'PO1', 'BEN');
        const po = (await getDoc(doc(db, 'purchase_orders/PO1'))).data()!;
        expect(po).toMatchObject({ status: 'CANCELLED', cancelledBy: 'BEN', totalEstimated: 10, items: [{ stockId: 'x', name: '调色油' }] });
        expect(po.cancelledAt).toBeTruthy();
    });
    it('已收货或已取消的单不能取消', async () => {
        await expect(cancelPurchaseOrder(db, 'PO2', 'BEN')).rejects.toThrow('已收货');
        await cancelPurchaseOrder(db, 'PO1', 'BEN');
        await expect(cancelPurchaseOrder(db, 'PO1', 'BEN')).rejects.toThrow('已取消');
    });
});
