import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { readLogDateRange } from '../../utils/logbook/readRange';
import { readRawCostStock } from '../../utils/inventory/costSource';
import { buildStockCostRows } from '../../utils/inventory/costSnapshot';
let env: RulesTestEnvironment;
beforeAll(async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    env = await initializeTestEnvironment({projectId:'demo-klk-erp',firestore:{rules:readFileSync(resolve(__dirname,'../../firestore.rules'),'utf8')}});
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        await Promise.all(Array.from({length:205},(_,i) => setDoc(doc(ctx.firestore(),'logs',`log${String(i).padStart(3,'0')}`),{id:`log${i}`,date:i===204?'2026-10-25':'2026-10-24',issue:`问题${i}`})));
    });
});

it('成本快照真实读取链保留缺失值，不把缺成本和单位补成零或pcs', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'stock_kitchen', 'qa-missing'), { name: 'QA 缺资料' });
    });
    const db = env.authenticatedContext('qa-reader').firestore() as unknown as Firestore;
    const rows = buildStockCostRows(await readRawCostStock(db), [], []);
    const row = rows.find(r => r.id === 'qa-missing')!;
    expect(row.cost).toBeNull();
    expect(row.unit).toBe('未设');
    expect(row.gaps).toContain('缺成本');
    expect(row.gaps).toContain('缺库存单位');
    expect((await getDocs(collection(db, 'stock_kitchen'))).docs[0].data()).toEqual({ name: 'QA 缺资料' });
});
afterAll(async () => { await env?.cleanup(); });
it('同日期超过100条也完整分页，不重复不遗漏且不写回',async () => {
    const db = env.authenticatedContext('qa-reader').firestore() as unknown as Firestore;
    const rows = await readLogDateRange(db,'2026-10-24','2026-10-24');
    expect(rows.length).toBe(204); expect(new Set(rows.map(l => l.id)).size).toBe(204);
    expect((await getDocs(collection(db,'logs'))).size).toBe(205);
    await expect(readLogDateRange(db,'2026-10-25','2026-10-24')).rejects.toThrow();
});
