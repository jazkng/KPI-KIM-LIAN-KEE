/**
 * 删除库存商品前处理供应商品项（只在本机 Emulator 运行）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { updateSupplierLinksForDeletedStock } from '../../utils/inventory/supplierLinks';

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
        const f = ctx.firestore();
        await setDoc(doc(f, 'suppliers/s1'), { id: 's1', name: 'EK', contact: '012', catalog: [
            { id: 'a', name: '葱', linkedStockId: 'K1', linkedPurchaseUnitId: 'pu' }, { id: 'b', name: '姜', linkedStockId: 'K2' }] });
        await setDoc(doc(f, 'suppliers/s2'), { id: 's2', name: 'AL', catalog: [{ id: 'x', name: '葱', linkedStockId: 'K1' }] });
        await setDoc(doc(f, 'suppliers/s3'), { id: 's3', name: 'OTHER', catalog: [{ id: 'y', name: '蒜', linkedStockId: 'K3' }] });
    });
});

afterAll(async () => { await env?.cleanup(); });

const catalog = async (id: string) => (await getDoc(doc(db, 'suppliers', id))).data()!;

describe('删除库存商品前处理供应商品项', () => {
    it('一起删除：两家供应商的品项都删掉，其他品项与供应商资料不动', async () => {
        expect(await updateSupplierLinksForDeletedStock(db, 'K1', 'DELETE_ITEM')).toEqual({ suppliers: 2, items: 2 });
        const s1 = await catalog('s1');
        expect(s1.catalog.map((c: any) => c.id)).toEqual(['b']);
        expect(s1.contact).toBe('012');
        expect((await catalog('s2')).catalog).toEqual([]);
        expect((await catalog('s3')).catalog).toHaveLength(1);
    });
    it('解除连结：保留品项', async () => {
        await updateSupplierLinksForDeletedStock(db, 'K1', 'UNLINK');
        const a = (await catalog('s1')).catalog[0];
        expect(a).toEqual({ id: 'a', name: '葱' });
    });
    it('改连结', async () => {
        await updateSupplierLinksForDeletedStock(db, 'K1', 'RELINK', 'K9');
        expect((await catalog('s2')).catalog[0].linkedStockId).toBe('K9');
    });
});
