/**
 * 应付账款冻结 / 解冻（只在本机 Emulator 运行，永远不连正式项目）
 * 验证：只加冻结字段、不改金额与状态；部分付款不能冻结；解冻保留历史。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { freezeBill, unfreezeBill } from '../../utils/ap/frozenBills';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;
const bill = { id: 'exp_1', company: 'AL FROZEN', category: 'INGREDIENT_SEAFOOD', amount: 0, totalBillAmount: 250, outstandingAmount: 250, paymentStatus: 'UNPAID', time: '2026-09-01T00:00:00Z' };

beforeAll(async () => {
    expect(PROJECT_ID.startsWith('demo-')).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST, '必须通过 firebase emulators:exec 运行').toBeTruthy();
    env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
});
beforeEach(async () => {
    await env.clearFirestore();
    db = env.authenticatedContext('owner-001', {}).firestore() as unknown as Firestore;
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'standalone_expenses', 'exp_1'), bill);
        await setDoc(doc(ctx.firestore(), 'standalone_expenses', 'exp_2'), { ...bill, id: 'exp_2', outstandingAmount: 100, paymentStatus: 'PARTIAL' });
    });
});
afterAll(async () => { await env?.cleanup(); });

describe('冻结账单', () => {
    it('冻结只加冻结字段，金额与状态不变；解冻后 frozen=false、历史两笔', async () => {
        await freezeBill(db, 'exp_1', '疑似重复', 'BEN');
        let d = (await getDoc(doc(db, 'standalone_expenses', 'exp_1'))).data()!;
        expect(d).toMatchObject({ ...bill, frozen: true, frozenBy: 'BEN', frozenReason: '疑似重复' });
        expect(d.frozenHistory).toHaveLength(1);
        await expect(freezeBill(db, 'exp_1', '再冻一次', 'BEN')).rejects.toThrow('已经冻结');
        await unfreezeBill(db, 'exp_1', 'BEN');
        d = (await getDoc(doc(db, 'standalone_expenses', 'exp_1'))).data()!;
        expect(d.frozen).toBe(false);
        expect(d.totalBillAmount).toBe(250);
        expect(d.paymentStatus).toBe('UNPAID');
        expect(d.frozenHistory.map((h: any) => h.action)).toEqual(['FREEZE', 'UNFREEZE']);
    });
    it('部分付款的账单不能冻结；没填原因不能冻结', async () => {
        await expect(freezeBill(db, 'exp_2', '原因', 'BEN')).rejects.toThrow('完全未付');
        await expect(freezeBill(db, 'exp_1', '  ', 'BEN')).rejects.toThrow('原因');
        expect((await getDoc(doc(db, 'standalone_expenses', 'exp_2'))).data()!.frozen).toBeUndefined();
    });
});
