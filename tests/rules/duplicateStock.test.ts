/**
 * 同一 ID 在两个区域各有一份：选择保留哪一份（只在本机 Emulator 运行，永远不连正式项目）
 * 验证：只删选定那一份、留下的资料不变、删掉的资料备份；编号不同时旧编号进 legacyCodes、登记表标记 MOVED；
 * 只剩一份时不删除。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { findOtherAreaCopies, removeDuplicateCopy } from '../../utils/inventory/duplicateStock';
import { STOCK_AREA_MOVES_COLLECTION } from '../../utils/inventory/moveStockArea';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;

const oil = { id: 'K_OIL', name: '食油', category: 'OIL', currentQtyBase: 10, costPerBaseUnit: 60, baseUnit: 'Carton' };

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
    db = env.authenticatedContext('owner-001', {}).firestore() as unknown as Firestore;
});

afterAll(async () => { await env?.cleanup(); });

const seed = async (docs: [string, string, Record<string, any>][]) => env.withSecurityRulesDisabled(async ctx => {
    for (const [col, id, data] of docs) await setDoc(doc(ctx.firestore(), col, id), data);
});

describe('同一商品两份：保留哪一份', () => {
    it('找出其他区域的副本；保留燃料、删厨房那份，燃料资料不变，删掉的有备份', async () => {
        await seed([['stock_fuel', 'K_OIL', oil], ['stock_kitchen', 'K_OIL', { ...oil, currentQtyBase: 7 }]]);
        const copies = await findOtherAreaCopies(db, 'K_OIL', 'KITCHEN');
        expect(copies).toEqual([{ area: 'FUEL', name: '食油', qty: 10, unit: 'Carton', category: 'OIL', stockCode: null }]);
        const r = await removeDuplicateCopy(db, { stockId: 'K_OIL', removeFrom: 'KITCHEN', keepIn: 'FUEL', by: 'BEN' });
        expect((await getDoc(doc(db, 'stock_kitchen', 'K_OIL'))).exists()).toBe(false);
        expect((await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()).toEqual(oil);
        const log = (await getDoc(doc(db, STOCK_AREA_MOVES_COLLECTION, r.logId))).data()!;
        expect(log).toMatchObject({ type: 'DUPLICATE_REMOVED', stockId: 'K_OIL', removedFrom: 'KITCHEN', keptIn: 'FUEL', by: 'BEN', removedData: { ...oil, currentQtyBase: 7 } });
    });

    it('两份编号不同：删掉那份的编号进 legacyCodes，登记表标记 MOVED', async () => {
        await seed([
            ['stock_fuel', 'K_OIL', { ...oil, stockCode: 'F0003' }],
            ['stock_kitchen', 'K_OIL', { ...oil, stockCode: 'K0007' }],
            ['stock_codes', 'K0007', { code: 'K0007', stockId: 'K_OIL', area: 'KITCHEN', status: 'ACTIVE' }],
        ]);
        await removeDuplicateCopy(db, { stockId: 'K_OIL', removeFrom: 'KITCHEN', keepIn: 'FUEL', by: 'BEN' });
        expect((await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()!.legacyCodes).toEqual(['K0007']);
        expect((await getDoc(doc(db, 'stock_codes', 'K0007'))).data()).toMatchObject({ status: 'MOVED', movedTo: 'F0003' });
    });

    it('只剩一份或同一区域：不删除', async () => {
        await seed([['stock_fuel', 'K_OIL', oil]]);
        await expect(removeDuplicateCopy(db, { stockId: 'K_OIL', removeFrom: 'KITCHEN', keepIn: 'FUEL', by: 'BEN' })).rejects.toThrow('不是两份');
        await expect(removeDuplicateCopy(db, { stockId: 'K_OIL', removeFrom: 'FUEL', keepIn: 'KITCHEN', by: 'BEN' })).rejects.toThrow('不是两份');
        expect((await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).exists()).toBe(true);
        await expect(removeDuplicateCopy(db, { stockId: 'K_OIL', removeFrom: 'FUEL', keepIn: 'FUEL', by: 'BEN' })).rejects.toThrow('同一个区域');
    });
});
