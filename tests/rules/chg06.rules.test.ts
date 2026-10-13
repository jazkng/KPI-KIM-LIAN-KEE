/**
 * CHG-06 规则草案测试（只在本机 Emulator 运行，永远不连正式项目）
 *
 * 测的是 security/rules/firestore.chg06.rules（未部署的草案），目的：
 *   1. V1 员工照常使用：V1 用到的全部集合，epoch 2 员工身份都能读写（不论层级）。
 *   2. 外部与旧身份被挡：未登录、匿名、没有 claims、epoch 1 一律拒绝。
 *   3. 专用设备只能碰它需要的集合与栏位。
 *   4. 秘密集合（PIN 哈希）任何客户端都读不到；考勤导入记录只有管理层能写、不能删。
 * 集合清单来自 V1（main）程式码盘点，见 docs/security/2026-10-13-chg05-chg06-permission-plan.md 附录。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-klk-erp';
let env: RulesTestEnvironment;

/** V1（main）程式码中实际读写的集合（含以变数组成名称的） */
const V1_COLLECTIONS = [
    'employees', 'settlements', 'standalone_expenses', 'payment_vouchers', 'fund_transfers', 'bill_payments',
    'payroll', 'attendance', 'roster', 'roster_months', 'config', 'logs', 'notifications', 'suppliers',
    'purchase_orders', 'inventory_tasks', 'inventory_logs', 'stock_kitchen', 'stock_bar', 'stock_general',
    'stock_fuel', 'stock_price_history', 'storehubSales', 'assessment_records', 'assessment_boss_ratings',
    'warranties', 'treasury_monthly_closings', 'task_completions', 'system_backups', 'strategy_proposals',
    'strategy_okrs', 'strategy_events', 'strategy_campaigns', 'self_issued_vouchers', 'recurring_bills', 'menu',
    'ap_ai_corrections', 'translations', 'sop_progress', 'queue_tickets', 'queue_counters', 'kitchen_alerts',
    'device_accounts',
];

const staffClaims = (emp: string, lvl: string, extra: Record<string, unknown> = {}) => ({ emp, lvl, portal: 'STAFF', epoch: 2, ...extra });
const deviceClaims = (device: string, screens: string[]) => ({ device, screens, store: 'KEPONG', epoch: 2 });

const as = {
    unauth: () => env.unauthenticatedContext().firestore(),
    anonymous: () => env.authenticatedContext('anon-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore(),
    noClaims: () => env.authenticatedContext('user-x', {}).firestore(),
    epoch1Staff: () => env.authenticatedContext('emp-001', { emp: '001', lvl: 'OWNER', epoch: 1 }).firestore(),
    owner: () => env.authenticatedContext('emp-001', staffClaims('001', 'OWNER')).firestore(),
    deptHead: () => env.authenticatedContext('emp-010', staffClaims('010', 'DEPARTMENT_HEAD')).firestore(),
    crew: () => env.authenticatedContext('emp-020', staffClaims('020', 'CREW')).firestore(),
    kitchen: () => env.authenticatedContext('dev-k', deviceClaims('device_kitchen1', ['KITCHEN_ALERT'])).firestore(),
    queue: () => env.authenticatedContext('dev-q', deviceClaims('device_queue1', ['QUEUE_DISPLAY'])).firestore(),
};

beforeAll(async () => {
    expect(PROJECT_ID.startsWith('demo-')).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST, '必须通过 firebase emulators:exec 运行').toBeTruthy();
    env = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync(resolve(__dirname, '../../security/rules/firestore.chg06.rules'), 'utf8') },
    });
});

beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        for (const c of V1_COLLECTIONS) await setDoc(doc(db, `${c}/seed`), { seed: true });
        await setDoc(doc(db, 'employees/020'), { id: '020', name: 'Crew', pin: '1234', preferredLanguage: 'zh' });
        await setDoc(doc(db, 'config/store'), { logo: 'x' });
        await setDoc(doc(db, 'employee_secrets/020'), { pinHash: 'h', pinSalt: 's' });
        await setDoc(doc(db, 'device_accounts/device_kitchen1'), { name: 'Kitchen', screens: ['KITCHEN_ALERT'] });
        await setDoc(doc(db, 'device_accounts/device_queue1'), { name: 'Queue', screens: ['QUEUE_DISPLAY'] });
        await setDoc(doc(db, 'kitchen_alerts/a1'), { status: 'OPEN', isActive: true, storeId: 'KEPONG', message: 'x' });
        await setDoc(doc(db, 'queue_tickets/t1'), { status: 'WAITING', number: 1 });
        await setDoc(doc(db, 'attendance_import_batches/b1'), { status: 'COMPLETED' });
    });
});

afterAll(async () => {
    await env?.cleanup();
});

describe('CHG-06 草案：V1 员工照常使用（不论层级）', () => {
    it.each(V1_COLLECTIONS)('CREW 可以读写 %s（V1 的模组权限仍由前端控制）', async c => {
        const db = as.crew();
        await assertSucceeds(getDoc(doc(db, `${c}/seed`)));
        await assertSucceeds(setDoc(doc(db, `${c}/new-doc`), { by: '020' }));
        await assertSucceeds(updateDoc(doc(db, `${c}/seed`), { touched: true }));
        await assertSucceeds(deleteDoc(doc(db, `${c}/new-doc`)));
    });

    it('V1 典型流程：Counter 员工做日结、管理层替他人打卡、HR 改他人资料、员工改自己语言', async () => {
        await assertSucceeds(setDoc(doc(as.crew(), 'settlements/2026-10-13'), { cash: 100 }));
        await assertSucceeds(setDoc(doc(as.deptHead(), 'attendance/2026-10-13_020'), { employeeId: '020' }));
        await assertSucceeds(updateDoc(doc(as.deptHead(), 'employees/020'), { shiftGroup: 2 }));
        await assertSucceeds(updateDoc(doc(as.crew(), 'employees/020'), { preferredLanguage: 'en' }));
    });
});

describe('CHG-06 草案：外部与旧身份一律拒绝', () => {
    for (const [label, ctx] of [
        ['未登录', as.unauth],
        ['匿名身份（V1 现在每台装置都有）', as.anonymous],
        ['没有 claims 的身份', as.noClaims],
        ['epoch 1 的旧身份（窗口前签发）', as.epoch1Staff],
    ] as const) {
        it(`${label}：读不到员工资料、写不了日结`, async () => {
            await assertFails(getDoc(doc(ctx(), 'employees/020')));
            await assertFails(setDoc(doc(ctx(), 'settlements/x'), { cash: 1 }));
            await assertFails(getDoc(doc(ctx(), 'config/store')));
        });
    }
});

describe('CHG-06 草案：秘密集合', () => {
    it('任何客户端（包括老板与设备）都读写不到 employee_secrets', async () => {
        for (const ctx of [as.owner, as.crew, as.kitchen, as.anonymous]) {
            await assertFails(getDoc(doc(ctx(), 'employee_secrets/020')));
            await assertFails(setDoc(doc(ctx(), 'employee_secrets/020'), { pinHash: 'x' }));
        }
    });
});

describe('CHG-06 草案：专用设备只碰需要的东西', () => {
    it('厨房屏：读提醒、确认、完成可以；改内容、新增、删除不行', async () => {
        const db = as.kitchen();
        await assertSucceeds(getDoc(doc(db, 'kitchen_alerts/a1')));
        await assertSucceeds(updateDoc(doc(db, 'kitchen_alerts/a1'), {
            status: 'ACKNOWLEDGED', isActive: true, acknowledgedById: 'KITCHEN_DISPLAY', acknowledgedByName: 'K', acknowledgedAt: 'now', updatedAt: 'now',
        }));
        await assertSucceeds(updateDoc(doc(db, 'kitchen_alerts/a1'), {
            status: 'RESOLVED', isActive: false, resolvedById: 'KITCHEN_DISPLAY', resolvedByName: 'K', resolvedAt: 'now', resolutionNote: null, updatedAt: 'now',
        }));
        await assertFails(updateDoc(doc(db, 'kitchen_alerts/a1'), { message: 'changed' }));
        await assertFails(updateDoc(doc(db, 'kitchen_alerts/a1'), { status: 'OPEN' }));
        await assertFails(setDoc(doc(db, 'kitchen_alerts/new'), { status: 'OPEN' }));
        await assertFails(deleteDoc(doc(db, 'kitchen_alerts/a1')));
    });

    it('厨房屏不能看排队，排队屏不能看厨房', async () => {
        await assertFails(getDoc(doc(as.kitchen(), 'queue_tickets/t1')));
        await assertFails(getDoc(doc(as.queue(), 'kitchen_alerts/a1')));
        await assertSucceeds(getDoc(doc(as.queue(), 'queue_tickets/t1')));
        await assertFails(setDoc(doc(as.queue(), 'queue_tickets/t1'), { status: 'CALLING' }));
    });

    it('设备读得到门店 Logo 与自己的设备户口；读不到别的设备、员工、财务', async () => {
        const db = as.kitchen();
        await assertSucceeds(getDoc(doc(db, 'config/store')));
        await assertSucceeds(getDoc(doc(db, 'device_accounts/device_kitchen1')));
        await assertFails(getDoc(doc(db, 'device_accounts/device_queue1')));
        await assertFails(setDoc(doc(db, 'device_accounts/device_kitchen1'), { screens: ['QUEUE_DISPLAY'] }));
        await assertFails(getDoc(doc(db, 'employees/020')));
        await assertFails(getDoc(doc(db, 'settlements/seed')));
        await assertFails(getDoc(doc(db, 'config/attendance_settings')));
    });
});

describe('CHG-06 草案：考勤导入记录（PR #12，V2 新集合）', () => {
    it('管理层可以建立与完成；CREW 不行；任何人都不能删除', async () => {
        await assertSucceeds(setDoc(doc(as.deptHead(), 'attendance_import_batches/b2'), { status: 'PENDING' }));
        await assertSucceeds(updateDoc(doc(as.deptHead(), 'attendance_import_batches/b2'), { status: 'COMPLETED' }));
        await assertFails(setDoc(doc(as.crew(), 'attendance_import_batches/b3'), { status: 'PENDING' }));
        await assertSucceeds(getDoc(doc(as.crew(), 'attendance_import_batches/b1')));
        await assertFails(deleteDoc(doc(as.owner(), 'attendance_import_batches/b1')));
    });

    it('被取代记录的备份：管理层可写入一次，之后不能改也不能删', async () => {
        const path = 'attendance_import_batches/b1/replaced/c1';
        await assertSucceeds(setDoc(doc(as.deptHead(), path), { records: [] }));
        await assertFails(setDoc(doc(as.deptHead(), path), { records: [1] }));
        await assertFails(deleteDoc(doc(as.owner(), path)));
        await assertFails(getDoc(doc(as.crew(), path)));
    });
});
