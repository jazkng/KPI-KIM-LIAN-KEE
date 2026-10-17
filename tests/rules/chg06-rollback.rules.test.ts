/**
 * CHG-06 紧急回滚规则测试（只在本机 Emulator 运行）
 * 回滚后旧版 V1（匿名身份）要能照常营业，但新的 PIN 哈希仍不能外泄。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;

beforeAll(async () => {
    expect(PROJECT_ID.startsWith('demo-')).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST, '必须通过 firebase emulators:exec 运行').toBeTruthy();
    env = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync(resolve(__dirname, '../../security/rules/firestore.chg06-rollback.rules'), 'utf8') },
    });
});

beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'employees/020'), { id: '020', pin: '1234' });
        await setDoc(doc(ctx.firestore(), 'employee_secrets/020'), { pinHash: 'h' });
        await setDoc(doc(ctx.firestore(), 'device_secrets/device_k'), { pinHash: 'h' });
    });
});

afterAll(async () => {
    await env?.cleanup();
});

describe('CHG-06 紧急回滚规则', () => {
    const anonymous = () => env.authenticatedContext('anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

    it('旧版 V1（匿名身份）可以照常读写营业资料', async () => {
        await assertSucceeds(getDoc(doc(anonymous(), 'employees/020')));
        await assertSucceeds(setDoc(doc(anonymous(), 'settlements/x'), { cash: 1 }));
    });

    it('新的 PIN 哈希仍然读写不到（匿名与新身份都一样）', async () => {
        const staff = env.authenticatedContext('emp', { emp: '001', lvl: 'OWNER', epoch: 2 }).firestore();
        for (const db of [anonymous(), staff]) {
            await assertFails(getDoc(doc(db, 'employee_secrets/020')));
            await assertFails(getDoc(doc(db, 'device_secrets/device_k')));
            await assertFails(setDoc(doc(db, 'employee_secrets/020'), { pinHash: 'x' }));
        }
    });

    it('匿名身份不能改写决定登录权限的栏位，也不能冒用编号；但旧版 V1 的一般写入照常', async () => {
        const db = anonymous();
        await assertFails(setDoc(doc(db, 'employees/020'), { orgLevel: 'OWNER' }, { merge: true }));
        await assertFails(setDoc(doc(db, 'employees/020'), { systemRole: 'SYSTEM_ADMIN' }, { merge: true }));
        await assertFails(setDoc(doc(db, 'employees/030'), { id: '002' }));
        await assertFails(setDoc(doc(db, 'employees/031'), { id: '031', orgLevel: 'OWNER' }));
        await assertSucceeds(setDoc(doc(db, 'employees/020'), { preferredLanguage: 'en', pin: '5678' }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, 'employees/032'), { id: '032', orgLevel: 'CREW' }));
    });

    it('未登录仍然被拒', async () => {
        await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'employees/020')));
    });
});
