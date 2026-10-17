/**
 * 库存全部重新连号（只在本机 Emulator 运行，永远不连正式项目）
 * 验证：只写编号字段、不碰数量成本；可续跑不重复；校验；按 runId 回滚还原；已编号过不能再跑。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { CATEGORY_SECTIONS } from '../../components/features/inventory/inventoryConstants';
import { planFingerprint, planRenumber } from '../../utils/inventory/stockCode';
import {
    applyRenumberPlan, checkBackupFile, createBackup, loadStockSnapshot, rollbackRenumber, verifyRenumber, CODES, COUNTERS, RUNS,
} from '../../utils/inventory/stockCodeMigration';
import { assignCodeToExisting, reserveStockCode } from '../../utils/inventory/stockCodeAllocator';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;
let db: Firestore;
const ORDER = Object.fromEntries(Object.entries(CATEGORY_SECTIONS).map(([k, v]) => [k, v.map(s => s.id)]));

const seed: [string, string, Record<string, any>][] = [
    ['stock_kitchen', 'K009', { id: 'K009', name: '肉片 (Meat Slices)', category: 'MEAT', currentQtyBase: 5, costPerBaseUnit: 20, unit: 'kg' }],
    ['stock_kitchen', 'K_1700000000001', { id: 'K_1700000000001', name: 'Egg 鸡蛋', category: 'FRESH', currentQtyBase: 30, costPerBaseUnit: 0.5, unit: 'pcs' }],
    ['stock_kitchen', 'DUP1', { id: 'DUP1', name: '鸡 (Chicken)', category: 'MEAT', currentQtyBase: 1, costPerBaseUnit: 10 }],
    ['stock_bar', 'DUP1', { id: 'DUP1', name: '鸡 (Chicken)', category: 'MEAT', currentQtyBase: 1, costPerBaseUnit: 10 }],
    ['stock_bar', 'B_1700000000002', { id: 'B_1700000000002', name: 'Tiger Beer 虎牌啤酒', category: 'RTD', currentQtyBase: 48, costPerBaseUnit: 6.2, unit: 'BTL' }],
    ['stock_general', 'S12', { id: 'S12', name: '外卖盒 (Box)', category: 'PACKAGING', currentQtyBase: 200, costPerBaseUnit: 0.3 }],
    ['stock_fuel', 'F_1700000000003', { id: 'F_1700000000003', name: '煤气 (Gas)', category: 'GAS', currentQtyBase: 2, costPerBaseUnit: 60 }],
];

const build = async () => {
    const snap = await loadStockSnapshot(db);
    return { snap, plan: planRenumber(snap.items, ORDER, snap.blockedIds) };
};

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
    await env.withSecurityRulesDisabled(async ctx => {
        for (const [col, id, data] of seed) await setDoc(doc(ctx.firestore(), col, id), data);
    });
});

afterAll(async () => { await env?.cleanup(); });

describe('全部重新连号', () => {
    it('读取：复制品列为要人工处理，不配号', async () => {
        const { snap, plan } = await build();
        expect(snap.problems.map(p => p.stockId)).toEqual(['DUP1']);
        expect(plan.rows.map(r => [r.stockId, r.newCode])).toEqual([
            ['K_1700000000001', 'K0001'], ['K009', 'K0002'], ['B_1700000000002', 'B0001'], ['S12', 'G0001'], ['F_1700000000003', 'F0001'],
        ]);
    });

    it('备份档：读回来校验通过；资料变动后要求重新备份', async () => {
        const backup = await createBackup(db, 'owner');
        const text = JSON.stringify(backup);
        expect((await checkBackupFile(db, text)).ok).toBe(true);
        await setDoc(doc(db, 'stock_fuel', 'NEW'), { id: 'NEW', name: 'x', category: 'GAS' });
        const r = await checkBackupFile(db, text);
        expect(r.ok).toBe(false);
        expect(r.messages.join()).toContain('stock_fuel');
        expect((await checkBackupFile(db, text.replace('肉片', '肉块'))).ok).toBe(false);
    });

    it('写入：只加编号字段（与勾选的名称），数量成本不变；校验全部通过', async () => {
        const backup = await createBackup(db, 'owner');
        const { plan } = await build();
        const res = await applyRenumberPlan(db, plan, { runId: 'run1', by: '负责人', renames: { B_1700000000002: '虎牌啤酒 (Tiger Beer)' } });
        expect(res).toMatchObject({ done: 5, skipped: 0, failed: 0, renamed: 1 });

        const k009 = (await getDoc(doc(db, 'stock_kitchen', 'K009'))).data()!;
        expect(k009).toMatchObject({ id: 'K009', name: '肉片 (Meat Slices)', currentQtyBase: 5, costPerBaseUnit: 20, stockCode: 'K0002', legacyCodes: ['K009'], stockCodeSource: 'MIGRATION', stockCodeRunId: 'run1' });
        const beer = (await getDoc(doc(db, 'stock_bar', 'B_1700000000002'))).data()!;
        expect(beer.name).toBe('虎牌啤酒 (Tiger Beer)');
        expect(beer.nameHistory).toEqual([expect.objectContaining({ name: 'Tiger Beer 虎牌啤酒', changedBy: '负责人', runId: 'run1' })]);
        expect((await getDoc(doc(db, 'stock_kitchen', 'DUP1'))).data()!.stockCode).toBeUndefined();

        expect((await getDoc(doc(db, CODES, 'G0001'))).data()).toMatchObject({ stockId: 'S12', area: 'GENERAL', status: 'ACTIVE' });
        expect((await getDoc(doc(db, COUNTERS, 'K'))).data()!.nextSeq).toBe(3);
        expect((await getDoc(doc(db, RUNS, 'run1'))).data()!.status).toBe('DONE');

        const checks = await verifyRenumber(db, plan, backup);
        expect(checks.filter(c => !c.ok)).toEqual([]);
    });

    it('已经重新编号过：不能再跑一次全部重新连号', async () => {
        const { plan } = await build();
        await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' });
        await expect(applyRenumberPlan(db, plan, { runId: 'run2', by: 'o' })).rejects.toThrow('已经重新编号过');
        await expect(applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' })).rejects.toThrow('DONE');
    });

    it('续跑：同一 runId 中途中断后再跑，已完成的不重复；计划不同不能续跑', async () => {
        const { plan } = await build();
        const first = plan.rows[0];
        // 模拟中断：第 1 个已写好、其余还没写
        await setDoc(doc(db, RUNS, 'run1'), { id: 'run1', planHash: planFingerprint(plan), status: 'RUNNING', countersBefore: { K: null, B: null, G: null, F: null } });
        await updateDoc(doc(db, 'stock_kitchen', first.stockId), { stockCode: first.newCode, stockCodeRunId: 'run1' });
        await setDoc(doc(db, CODES, first.newCode), { code: first.newCode, stockId: first.stockId, area: 'KITCHEN', runId: 'run1' });
        await setDoc(doc(db, RUNS, 'run1', 'items', first.stockId), { stockId: first.stockId, area: 'KITCHEN', code: first.newCode, status: 'DONE', prevLegacyCodes: null });
        const res = await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' });
        expect(res).toMatchObject({ done: 5, skipped: 0, failed: 0 });
        expect((await getDocs(collection(db, CODES))).size).toBe(5);
        expect((await getDoc(doc(db, RUNS, 'run1'))).data()!.status).toBe('DONE');

        await setDoc(doc(db, RUNS, 'run9'), { id: 'run9', planHash: 'other', status: 'RUNNING' });
        await expect(applyRenumberPlan(db, plan, { runId: 'run9', by: 'o' })).rejects.toThrow('另一份计划');
    });

    it('预览后商品已被配了别的编号：跳过并记录，不覆盖', async () => {
        const { plan } = await build();
        await updateDoc(doc(db, 'stock_general', 'S12'), { stockCode: 'G0099' });
        const res = await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' });
        expect(res.skipped).toBe(1);
        expect((await getDoc(doc(db, 'stock_general', 'S12'))).data()!.stockCode).toBe('G0099');
        expect((await getDoc(doc(db, RUNS, 'run1'))).data()!.status).toBe('DONE');
    });

    it('回滚：编号字段、名称、登记表、计数器还原，其他资料不变', async () => {
        const before = await createBackup(db, 'owner');
        const { plan } = await build();
        await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o', renames: { B_1700000000002: '虎牌啤酒 (Tiger Beer)' } });
        const r = await rollbackRenumber(db, 'run1');
        expect(r.reverted).toBe(5);
        const after = await createBackup(db, 'owner');
        for (const col of ['stock_kitchen', 'stock_bar', 'stock_general', 'stock_fuel', CODES, COUNTERS]) {
            expect(after.collections[col].sha256, col).toBe(before.collections[col].sha256);
        }
        expect((await getDoc(doc(db, RUNS, 'run1'))).data()!.status).toBe('ROLLED_BACK');
        await expect(rollbackRenumber(db, 'run1')).rejects.toThrow('已经回滚过');
    });

    it('重新编号后又发过新编号：拒绝整批回滚', async () => {
        const { plan } = await build();
        await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' });
        await setDoc(doc(db, CODES, 'K0003'), { code: 'K0003', stockId: 'new', source: 'AUTO', runId: null });
        await expect(rollbackRenumber(db, 'run1')).rejects.toThrow('不能整批回滚');
        expect((await getDocs(collection(db, CODES))).size).toBe(6);
    });
});

// 与 DataManager.saveStockItem 新建商品时相同的交易流程
const createItem = (id: string, name: string) => runTransaction(db, async tx => {
    const ref = doc(db, 'stock_kitchen', id);
    const snap = await tx.get(ref);
    const reserved = snap.exists() ? null : await reserveStockCode(tx, db, 'KITCHEN', id, 'tester');
    tx.set(ref, { id, name, category: 'MEAT' });
    reserved?.write(tx, ref);
});

describe('新商品自动配号', () => {
    it('还没全部重新连号（没有计数器）：不配号', async () => {
        await createItem('n1', 'x');
        expect((await getDoc(doc(db, 'stock_kitchen', 'n1'))).data()!.stockCode).toBeUndefined();
        expect((await getDocs(collection(db, CODES))).size).toBe(0);
    });

    it('重新连号之后：接着配下一个号；同时新增 5 个也不会重复', async () => {
        const { plan } = await build();
        await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' });
        await Promise.all(['n1', 'n2', 'n3', 'n4', 'n5'].map(id => createItem(id, id)));
        const codes = await Promise.all(['n1', 'n2', 'n3', 'n4', 'n5'].map(async id => (await getDoc(doc(db, 'stock_kitchen', id))).data()!.stockCode));
        expect([...codes].sort()).toEqual(['K0003', 'K0004', 'K0005', 'K0006', 'K0007']);
        expect((await getDoc(doc(db, COUNTERS, 'K'))).data()!.nextSeq).toBe(8);
        expect((await getDoc(doc(db, CODES, 'K0005'))).data()).toMatchObject({ source: 'AUTO', status: 'ACTIVE' });
    });

    it('补配号：已有编号的不动；号码被占用时跳过，不重复使用', async () => {
        const { plan } = await build();
        await applyRenumberPlan(db, plan, { runId: 'run1', by: 'o' });
        await setDoc(doc(db, CODES, 'K0003'), { code: 'K0003', stockId: 'someone-else' });
        await setDoc(doc(db, 'stock_kitchen', 'v1item'), { id: 'v1item', name: 'V1 新增', category: 'MEAT' });
        expect(await assignCodeToExisting(db, 'KITCHEN', 'v1item', 'o')).toBe('K0004');
        expect(await assignCodeToExisting(db, 'KITCHEN', 'v1item', 'o')).toBe('K0004');
        expect(await assignCodeToExisting(db, 'KITCHEN', 'K009', 'o')).toBe('K0002');
    });
});
