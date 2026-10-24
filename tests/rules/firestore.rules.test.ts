/**
 * Firestore Security Rules 测试（只在本机 Emulator 运行，永远不连正式项目）
 *
 * 用法：npm run test:rules
 *
 * V1 仍在使用，只对 V2 专用的 hygiene_checks 收紧规则。
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
    await setDoc(doc(ctx.firestore(), 'employees/001'), { id: '001', name: 'Mock Manager', role: 'Manager', orgLevel: 'BRANCH_MANAGER', pin: '123456' });
    await setDoc(doc(ctx.firestore(), 'employees/002'), { id: '002', orgLevel: 'TEAM_LEAD', department: 'KITCHEN' });
    await setDoc(doc(ctx.firestore(), 'employees/003'), { id: '003', orgLevel: 'CREW', department: 'KITCHEN' });
    await setDoc(doc(ctx.firestore(), 'employees/004'), { id: '004', orgLevel: 'CREW', department: 'FLOOR' });
    await setDoc(doc(ctx.firestore(), 'employees/005'), { id: '005', orgLevel: 'DEPARTMENT_HEAD', department: 'KITCHEN', hygieneDepartments: ['FLOOR'] });
    await setDoc(doc(ctx.firestore(), 'employees/006'), { id: '006', role: 'Owner', department: 'KITCHEN' });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('V1 compatibility: existing identity gate', () => {
  it('未登录（无 Firebase 身份）不能读取', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'employees/001')));
  });

  it('未登录（无 Firebase 身份）不能写入', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'settlements/x'), { amount: 1 }));
  });
});

describe('V1 legacy access: known gap until V1 retirement', () => {
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

describe('V2 hygiene score permissions', () => {
  const dbFor = (id: string, lvl: string) => testEnv.authenticatedContext(`emp_${id}`, { emp: id, lvl }).firestore();
  const check = (target: string, by: string, score: number, note = 'observed') => ({
    id: `2026-10-19_${target}`, employeeId: target, weekStart: '2026-10-19',
    checkedBy: by, checkedByName: 'Reviewer', score, note, at: '2026-10-24T00:00:00.000Z',
  });

  it('V1 anonymous identity cannot submit a hygiene score but keeps legacy business access', async () => {
    const db = testEnv.authenticatedContext('old-v1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertFails(setDoc(doc(db, 'hygiene_checks/2026-10-19_003'), check('003', '002', 3)));
    await assertSucceeds(setDoc(doc(db, 'settlements/legacy'), { amount: 1 }));
  });

  it('L4 is capped at 3 and can score only staff in an allowed department', async () => {
    const db = dbFor('002', 'TEAM_LEAD');
    await assertSucceeds(setDoc(doc(db, 'hygiene_checks/2026-10-19_003'), check('003', '002', 3)));
    await assertFails(setDoc(doc(db, 'hygiene_checks/2026-10-19_003'), check('003', '002', 4)));
    await assertFails(setDoc(doc(db, 'hygiene_checks/2026-10-19_004'), check('004', '002', 3)));
    await assertFails(setDoc(doc(db, 'hygiene_checks/2026-10-19_002'), check('002', '002', 3)));
  });

  it('L3 can score across the extra granted department up to 4, but cannot overwrite another scorer', async () => {
    const db = dbFor('005', 'DEPARTMENT_HEAD');
    await assertSucceeds(setDoc(doc(db, 'hygiene_checks/2026-10-19_004'), check('004', '005', 4)));
    await assertFails(setDoc(doc(db, 'hygiene_checks/2026-10-19_004'), check('004', '005', 5)));
    await assertFails(setDoc(doc(db, 'hygiene_checks/2026-10-19_002'), check('002', '005', 3)));
  });

  it('L2 may score up to 5, while L5 cannot score', async () => {
    await assertSucceeds(setDoc(doc(dbFor('001', 'BRANCH_MANAGER'), 'hygiene_checks/2026-10-19_005'), check('005', '001', 5)));
    await assertFails(setDoc(doc(dbFor('003', 'CREW'), 'hygiene_checks/2026-10-19_004'), check('004', '003', 3)));
  });

  it('rejects non-Monday and malformed weekly keys', async () => {
    const db = dbFor('002', 'TEAM_LEAD');
    for (const weekStart of ['2026-10-20', '2026-02-30', 'not-a-date']) {
      await assertFails(setDoc(doc(db, `hygiene_checks/${weekStart}_003`), { ...check('003', '002', 3), id: `${weekStart}_003`, weekStart }));
    }
  });

  it('denies a read-only scorer and legacy targets without an explicit level', async () => {
    const readonly = testEnv.authenticatedContext('emp_002', { emp: '002', lvl: 'TEAM_LEAD', ro: true }).firestore();
    await assertFails(setDoc(doc(readonly, 'hygiene_checks/2026-10-19_003'), check('003', '002', 3)));
    await assertFails(setDoc(doc(dbFor('002', 'TEAM_LEAD'), 'hygiene_checks/2026-10-19_006'), check('006', '002', 3)));
  });
});
