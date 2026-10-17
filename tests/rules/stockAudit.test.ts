/**
 * 库存资料审计（只在本机 Emulator 运行）：只读载入正确、找得到问题、不写入任何资料。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { CATEGORY_SECTIONS } from '../../components/features/inventory/inventoryConstants';
import { auditStock, loadStockAuditInput } from '../../utils/inventory/stockAudit';
import { createBackup } from '../../utils/inventory/stockCodeMigration';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;
const SECTIONS = Object.fromEntries(Object.entries(CATEGORY_SECTIONS).map(([k, v]) => [k, v.map(s => s.id)]));

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
        await setDoc(doc(f, 'stock_kitchen/K1'), { id: 'K1', name: '肉片 (Meat)', category: 'MEAT', baseUnit: 'kg' });
        await setDoc(doc(f, 'stock_bar/K1'), { id: 'K1', name: '肉片 (Meat)', category: 'MEAT', baseUnit: 'kg' });
        await setDoc(doc(f, 'suppliers/s1'), { name: 'ABC', catalog: [{ id: 'c1', name: '旧', linkedStockId: 'GONE' }] });
        await setDoc(doc(f, 'purchase_orders/PO1'), { status: 'ORDERED', supplierName: 'ABC', items: [{ stockId: 'zzz', name: '不明' }] });
        await setDoc(doc(f, 'purchase_orders/PO2'), { status: 'RECEIVED', supplierName: 'ABC', items: [{ stockId: 'yyy', name: '已收' }] });
        await setDoc(doc(f, 'inventory_tasks/t1'), { status: 'PENDING', items: [{ stockId: 'OLD', stockName: '已删' }] });
        await setDoc(doc(f, 'inventory_tasks/t2'), { status: 'COMPLETED', items: [{ stockId: 'OLD3', stockName: '旧任务' }] });
    });
});

afterAll(async () => { await env?.cleanup(); });

describe('库存资料审计', () => {
    it('只读：找出问题，只看未收货采购单与未完成任务，资料完全不变', async () => {
        const before = await createBackup(db, 't');
        const f = auditStock(await loadStockAuditInput(db, SECTIONS));
        const types = f.map(x => x.type);
        expect(types).toContain('DUPLICATE_ID');
        expect(types).toContain('BROKEN_SUPPLIER_LINK');
        expect(f.filter(x => x.type === 'OPEN_PO_UNRESOLVED').map(x => x.subject)).toEqual(['ABC · PO1 · 不明']);
        expect(f.filter(x => x.type === 'BROKEN_TASK').length).toBe(1);
        const after = await createBackup(db, 't');
        for (const col of Object.keys(before.collections)) expect(after.collections[col].sha256, col).toBe(before.collections[col].sha256);
    });
});
