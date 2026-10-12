/**
 * Firestore Security Rules 测试（只在本机 Emulator 运行，永远不连正式项目）
 *
 * 用法：npm run test:rules
 *
 * 这里测的是仓库中的 firestore.rules（= V1 目前的规则）。
 * 「已知漏洞」那组测试刻意断言漏洞仍然存在：等到身份认证整改把规则收紧后，
 * 这些测试会失败，届时把它们改为 assertFails 即可——这能防止有人以为已修好但其实没有。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-klk-erp';
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // 安全护栏：只允许 demo- 项目（Firebase 保证 demo- 项目不会连云端）
  expect(PROJECT_ID.startsWith('demo-')).toBe(true);
  expect(process.env.FIRESTORE_EMULATOR_HOST, '必须通过 firebase emulators:exec 运行').toBeTruthy();

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'employees/001'), { id: '001', name: 'Mock Owner', role: 'Owner', pin: '123456' });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('V1 firestore.rules：身份门槛', () => {
  it('未登录（无 Firebase 身份）不能读取', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'employees/001')));
  });

  it('未登录（无 Firebase 身份）不能写入', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'settlements/x'), { amount: 1 }));
  });
});

describe('V1 firestore.rules：已知漏洞（整改后应改为 assertFails）', () => {
  const anonymous = () =>
    testEnv.authenticatedContext('anon-attacker', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

  it('KNOWN GAP：任何匿名身份都能读取员工资料（含 PIN）', async () => {
    const snap = await assertSucceeds(getDoc(doc(anonymous(), 'employees/001')));
    expect(snap.data()?.pin).toBe('123456');
  });

  it('KNOWN GAP：任何匿名身份都能改写员工资料', async () => {
    await assertSucceeds(setDoc(doc(anonymous(), 'employees/001'), { pin: '000000' }, { merge: true }));
  });
});
