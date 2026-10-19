/**
 * 库存商品移到另一个区域（只在本机 Emulator 运行，永远不连正式项目）
 * 验证：同一 ID 搬过去、旧区域删除、资料全部保留；有计数器时换新区域编号、旧编号进 legacyCodes；
 * 目标区域已有同 ID 时不动；每次移动有记录。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { moveStockItem, STOCK_AREA_MOVES_COLLECTION } from '../../utils/inventory/moveStockArea';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;

const oil = { id: 'K_OIL', name: '食油 (Oil)', category: 'SAUCE', currentQtyBase: 16, costPerBaseUnit: 60, unit: 'Carton', image: 'x.jpg' };

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

describe('移动区域', () => {
    it('还没有编号系统：同一 ID 搬到燃料，资料全部保留，旧区域删除，有移动记录', async () => {
        await seed([['stock_kitchen', 'K_OIL', oil]]);
        const r = await moveStockItem(db, { stockId: 'K_OIL', from: 'KITCHEN', to: 'FUEL', category: 'OIL', by: 'BEN' });
        expect((await getDoc(doc(db, 'stock_kitchen', 'K_OIL'))).exists()).toBe(false);
        const moved = (await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()!;
        expect(moved).toMatchObject({ ...oil, category: 'OIL', areaMovedFrom: 'KITCHEN', areaMovedBy: 'BEN' });
        expect(moved.stockCode).toBeUndefined();
        expect(r.newCode).toBeNull();
        const log = (await getDoc(doc(db, STOCK_AREA_MOVES_COLLECTION, r.moveId))).data()!;
        expect(log).toMatchObject({ stockId: 'K_OIL', from: 'KITCHEN', to: 'FUEL', fromCategory: 'SAUCE', toCategory: 'OIL', by: 'BEN' });
    });

    it('有编号系统：配燃料下一个号码，旧编号进 legacyCodes，登记表标记 MOVED', async () => {
        await seed([
            ['stock_kitchen', 'K_OIL', { ...oil, stockCode: 'K0007', legacyCodes: ['K009'] }],
            ['stock_codes', 'K0007', { code: 'K0007', stockId: 'K_OIL', area: 'KITCHEN', status: 'ACTIVE' }],
            ['stock_code_counters', 'F', { prefix: 'F', nextSeq: 3 }],
        ]);
        const r = await moveStockItem(db, { stockId: 'K_OIL', from: 'KITCHEN', to: 'FUEL', category: 'OIL', by: 'BEN' });
        expect(r).toMatchObject({ oldCode: 'K0007', newCode: 'F0003' });
        const moved = (await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()!;
        expect(moved.stockCode).toBe('F0003');
        expect(moved.legacyCodes).toEqual(['K009', 'K0007']);
        expect(moved.currentQtyBase).toBe(16);
        expect((await getDoc(doc(db, 'stock_codes', 'K0007'))).data()).toMatchObject({ status: 'MOVED', movedTo: 'F0003' });
        expect((await getDoc(doc(db, 'stock_codes', 'F0003'))).data()).toMatchObject({ stockId: 'K_OIL', area: 'FUEL', status: 'ACTIVE' });
        expect((await getDoc(doc(db, 'stock_code_counters', 'F'))).data()!.nextSeq).toBe(4);
    });

    it('目标区域已有同 ID（复制品）或来源已不存在：不写任何资料', async () => {
        await seed([['stock_kitchen', 'K_OIL', oil], ['stock_fuel', 'K_OIL', { ...oil, currentQtyBase: 1 }]]);
        await expect(moveStockItem(db, { stockId: 'K_OIL', from: 'KITCHEN', to: 'FUEL', category: 'OIL', by: 'BEN' })).rejects.toThrow('复制品');
        expect((await getDoc(doc(db, 'stock_kitchen', 'K_OIL'))).exists()).toBe(true);
        expect((await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()!.currentQtyBase).toBe(1);
        await expect(moveStockItem(db, { stockId: 'NOPE', from: 'KITCHEN', to: 'FUEL', category: 'OIL', by: 'BEN' })).rejects.toThrow('已不在原本的区域');
        await expect(moveStockItem(db, { stockId: 'K_OIL', from: 'KITCHEN', to: 'KITCHEN', category: 'SAUCE', by: 'BEN' })).rejects.toThrow('一样');
    });

    it('旧区域有「文件名不同、id 相同」的残留副本：移动时一起删掉，资料备份在移动记录', async () => {
        await seed([['stock_kitchen', 'K_OIL', oil], ['stock_kitchen', 'legacyDoc', { ...oil, currentQtyBase: 10 }], ['stock_kitchen', 'OTHER', { id: 'OTHER', name: '酱油' }]]);
        const r = await moveStockItem(db, { stockId: 'K_OIL', from: 'KITCHEN', to: 'FUEL', category: 'OIL', by: 'BEN' });
        expect(r).toMatchObject({ removedCopies: 1, cleanupOnly: false });
        expect((await getDoc(doc(db, 'stock_kitchen', 'legacyDoc'))).exists()).toBe(false);
        expect((await getDoc(doc(db, 'stock_kitchen', 'OTHER'))).exists()).toBe(true);
        expect((await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()!.currentQtyBase).toBe(16);
        const log = (await getDoc(doc(db, STOCK_AREA_MOVES_COLLECTION, r.moveId))).data()!;
        expect(log.removedDuplicates).toEqual([{ docId: 'legacyDoc', data: { ...oil, currentQtyBase: 10 } }]);
    });

    it('之前已移过去、旧区域只剩残留副本：再按一次只清副本，新区域资料不动', async () => {
        await seed([['stock_fuel', 'K_OIL', { ...oil, category: 'OIL', currentQtyBase: 9 }], ['stock_kitchen', 'legacyDoc', oil]]);
        const r = await moveStockItem(db, { stockId: 'K_OIL', from: 'KITCHEN', to: 'FUEL', category: 'OIL', by: 'BEN' });
        expect(r).toMatchObject({ removedCopies: 1, cleanupOnly: true });
        expect((await getDoc(doc(db, 'stock_kitchen', 'legacyDoc'))).exists()).toBe(false);
        expect((await getDoc(doc(db, 'stock_fuel', 'K_OIL'))).data()).toMatchObject({ category: 'OIL', currentQtyBase: 9 });
        expect((await getDoc(doc(db, STOCK_AREA_MOVES_COLLECTION, r.moveId))).data()).toMatchObject({ cleanupOnly: true, removedDuplicates: [{ docId: 'legacyDoc', data: oil }] });
    });
});
