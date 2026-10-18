/**
 * 收货写最近进价、负责人同意后更新目录价（只在本机 Emulator 运行）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { recordReceivedPrices, updateCatalogPrices } from '../../utils/inventory/catalogPrices';

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
        await setDoc(doc(ctx.firestore(), 'suppliers/EK'), { id: 'EK', name: 'EK', contact: '012', catalog: [
            { id: 'ctn', name: 'Tiger 24', unit: 'CTN', purchaseUnitName: 'CTN', toBaseRatio: 24, price: 120, pricePerPurchaseUnit: 120 },
            { id: 'x', name: '别的', unit: 'pkt', toBaseRatio: 1, price: 3 }] });
    });
});
afterAll(async () => { await env?.cleanup(); });

describe('收货写最近进价', () => {
    it('只写最近进价，目录价不自动改；同意后才更新目录价', async () => {
        const diffs = await recordReceivedPrices(db, 'EK', [{ catalogItemId: 'ctn', perBase: 5.5, at: '2026-10-18T02:00:00Z', poId: 'PO1' }]);
        let s = (await getDoc(doc(db, 'suppliers/EK'))).data()!;
        expect(s.catalog[0]).toMatchObject({ price: 120, lastReceivedPrice: 132, lastReceivedPoId: 'PO1' });
        expect(s.catalog[1]).toEqual({ id: 'x', name: '别的', unit: 'pkt', toBaseRatio: 1, price: 3 });
        expect(s.contact).toBe('012');
        expect(diffs.map(d => d.pct)).toEqual([10]);

        await updateCatalogPrices(db, 'EK', diffs);
        s = (await getDoc(doc(db, 'suppliers/EK'))).data()!;
        expect(s.catalog[0]).toMatchObject({ price: 132, pricePerPurchaseUnit: 132, lastReceivedPrice: 132 });
        expect(s.catalog[0].priceUpdatedAt).toBeTruthy();
    });
});
