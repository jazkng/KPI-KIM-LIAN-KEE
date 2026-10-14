// ============================================================================
// 驾驶舱手机推送（PR E2a）· 服务端读取、储存与发送
// ----------------------------------------------------------------------------
// 读取：用 firebase-admin 只读驾驶舱需要的集合，计算与浏览器完全相同（cockpitLoader + alertRules）。
// 写入：只写三个推送专用集合（负责人 2026-10-14 批准）：
//   push_devices/{deviceId}      装置与 FCM token
//   push_settings/owner           推送开关、阈值、勿扰时段
//   push_alert_log/{日期_杂凑}    已推送纪录（去重与稽核）
// 不写入、不修改任何既有集合；V1 不读取这三个集合。
// Emulator 模式一律连本机 Emulator（demo-klk-erp），FCM 发送改为记录在记忆体，不会真的推送。
// ============================================================================
import { adminApp, initFirebaseAdmin, isAdminEmulator } from '../firebaseAdmin';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import type { AttendanceRecord, BillPaymentRecord, Employee, ExpenseItem, PayrollRecord, SettlementRecord } from '../../types';
import { normalizeEmployeeOrgFields } from '../../utils/orgAccess';
import { loadCockpitWith, type CockpitDataSource } from '../../utils/cockpit/cockpitLoader';
import { buildAlertCenter } from '../../utils/cockpit/alertRules';
import { resolvePeriod } from '../../utils/cockpit/periods';
import { getBusinessDateString } from '../../utils/dateHelper';
import type { PayableLike } from '../../utils/apDueDate';
import { alertLogId, decidePush, deviceIdOf, DEFAULT_PUSH_SETTINGS, isPlausibleFcmToken, sanitizePushSettings, type PushMessage, type PushSettings } from './pushPolicy';

/** 初始化 firebase-admin（Emulator 模式强制连本机 Emulator） */
export const initPushAdmin = (isEmulatorMode: boolean): void => {
    initFirebaseAdmin(isEmulatorMode);
};

const db = (): Firestore => getFirestore(adminApp());

// ── 只读资料来源（与浏览器 DataManager 相同的查询）──
export const adminCockpitSource = (): CockpitDataSource => ({
    async getPnLRawRange(start, endDate) {
        const end = `${endDate}T23:59:59`;
        const [setSnap, billSnap, expByTime, expByPayment] = await Promise.all([
            db().collection('settlements').where('date', '>=', start).where('date', '<=', end).get(),
            db().collection('bill_payments').where('date', '>=', start).where('date', '<=', end).get(),
            db().collection('standalone_expenses').where('time', '>=', start).where('time', '<=', end).get(),
            db().collection('standalone_expenses').where('paymentDate', '>=', start).where('paymentDate', '<=', end).get(),
        ]);
        const expenses = new Map<string, ExpenseItem>();
        [...expByTime.docs, ...expByPayment.docs].forEach(d => expenses.set(d.id, { id: d.id, ...d.data() } as ExpenseItem));
        return {
            settlements: setSnap.docs.map(d => ({ id: d.id, ...d.data() }) as SettlementRecord),
            billPayments: billSnap.docs.map(d => ({ id: d.id, ...d.data() }) as BillPaymentRecord),
            standaloneExpenses: [...expenses.values()],
        };
    },
    async getEmployees() {
        const snap = await db().collection('employees').get();
        return snap.docs.map(d => normalizeEmployeeOrgFields(d.data() as Employee));
    },
    async getPayrollRecords() {
        const snap = await db().collection('payroll').get();
        return snap.docs.map(d => d.data() as PayrollRecord);
    },
    async getAttendanceReviewsByMonth(month) {
        const snap = await db().collection('attendance_reviews').where('date', '>=', `${month}-01`).where('date', '<=', `${month}-31`).get();
        return snap.docs.map(d => d.data() as AttendanceRecord);
    },
    async getStandaloneExpensesByIds(ids) {
        const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 100);
        if (!unique.length) return [];
        const snaps = await db().getAll(...unique.map(id => db().collection('standalone_expenses').doc(id)));
        return snaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }) as ExpenseItem);
    },
});

const loadUnpaidPayablesAdmin = async (): Promise<PayableLike[]> => {
    const snap = await db().collection('standalone_expenses').where('paymentStatus', 'in', ['UNPAID', 'PARTIAL']).get();
    return snap.docs.map(d => {
        const x = d.data();
        const num = (v: unknown) => (v === undefined || v === null ? undefined : Number(v) || 0);
        return {
            id: d.id,
            dueDate: x.dueDate,
            time: x.time,
            amount: Number(x.amount) || 0,
            outstandingAmount: num(x.outstandingAmount),
            totalBillAmount: num(x.totalBillAmount),
            company: typeof x.company === 'string' ? x.company : undefined,
            category: typeof x.category === 'string' ? x.category : undefined,
            invoiceRef: typeof x.invoiceRef === 'string' ? x.invoiceRef : undefined,
        };
    });
};

// ── 推送专用集合 ──
export const getPushSettings = async (): Promise<PushSettings> => {
    const snap = await db().collection('push_settings').doc('owner').get();
    return snap.exists ? sanitizePushSettings(snap.data()) : { ...DEFAULT_PUSH_SETTINGS };
};

export const savePushSettings = async (raw: unknown): Promise<PushSettings> => {
    const settings = sanitizePushSettings(raw);
    await db().collection('push_settings').doc('owner').set({ ...settings, updatedAt: FieldValue.serverTimestamp() });
    return settings;
};

export const registerDevice = async (token: string, label: string, userAgent: string): Promise<string> => {
    const id = deviceIdOf(token);
    const ref = db().collection('push_devices').doc(id);
    const existing = await ref.get();
    await ref.set({
        token,
        label: label.slice(0, 60),
        userAgent: userAgent.slice(0, 200),
        enabled: true,
        lastSeenAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return id;
};

export const unregisterDevice = async (token: string): Promise<void> => {
    await db().collection('push_devices').doc(deviceIdOf(token)).set(
        { enabled: false, token: FieldValue.delete(), disabledAt: FieldValue.serverTimestamp(), disabledReason: 'USER' },
        { merge: true },
    );
};

export const isDeviceRegistered = async (token: string): Promise<boolean> => {
    const snap = await db().collection('push_devices').doc(deviceIdOf(token)).get();
    return snap.exists && snap.data()?.enabled === true;
};

/** 启用中的装置；格式不对的纪录（可能被改写）直接停用，不发送 */
const activeDevices = async (): Promise<{ id: string; token: string }[]> => {
    const snap = await db().collection('push_devices').where('enabled', '==', true).get();
    const out: { id: string; token: string }[] = [];
    for (const d of snap.docs) {
        const token = d.data().token;
        if (isPlausibleFcmToken(token) && deviceIdOf(token) === d.id) out.push({ id: d.id, token });
        else await d.ref.set({ enabled: false, token: FieldValue.delete(), disabledAt: FieldValue.serverTimestamp(), disabledReason: 'INVALID_RECORD' }, { merge: true });
    }
    return out;
};

// ── 发送（Emulator 模式只记录，不真的推送）──
export const mockOutbox: { at: string; tokens: number; message: PushMessage }[] = [];

const sendToDevices = async (devices: { id: string; token: string }[], message: PushMessage) => {
    if (isAdminEmulator()) {
        mockOutbox.push({ at: new Date().toISOString(), tokens: devices.length, message });
        return { success: devices.length, invalidDeviceIds: [] as string[] };
    }
    const res = await getMessaging(adminApp()).sendEachForMulticast({
        tokens: devices.map(d => d.token),
        // 只送 data，由 sw.js 显示通知（与现有 Service Worker 共用，不另装 firebase-messaging-sw.js）
        data: { title: message.title, body: message.body, link: message.link },
        webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    });
    const invalidDeviceIds = res.responses
        .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || '') ? devices[i].id : null))
        .filter((x): x is string => !!x);
    return { success: res.successCount, invalidDeviceIds };
};

/** 定时任务：计算预警，需要时推送。回传摘要（不含金额） */
export const evaluateAndPush = async (now = new Date()) => {
    const settings = await getPushSettings();
    const businessDate = getBusinessDateString(now);
    if (!settings.enabled) return { businessDate, sent: false, reason: 'disabled' };

    const source = adminCockpitSource();
    const [result, payables] = await Promise.all([
        loadCockpitWith(source, resolvePeriod('THIS_MONTH', businessDate), businessDate, 'ACCRUAL'),
        loadUnpaidPayablesAdmin(),
    ]);
    const center = buildAlertCenter({ result, today: businessDate, thresholds: settings.thresholds, payables });
    const logSnap = await db().collection('push_alert_log').where('businessDate', '==', businessDate).get();
    const decision = decidePush({ settings, alerts: center.alerts, alreadySentLogIds: new Set(logSnap.docs.map(d => d.id)), businessDate, now });
    if ('reason' in decision) return { businessDate, sent: false, reason: decision.reason, candidates: decision.candidates };

    const devices = await activeDevices();
    if (devices.length === 0) return { businessDate, sent: false, reason: 'no-devices', candidates: decision.alerts.length };
    const res = await sendToDevices(devices, decision.message);

    const batch = db().batch();
    res.invalidDeviceIds.forEach(id => batch.set(db().collection('push_devices').doc(id), { enabled: false, token: FieldValue.delete(), disabledAt: FieldValue.serverTimestamp(), disabledReason: 'FCM_INVALID' }, { merge: true }));
    decision.alerts.forEach(a => batch.set(db().collection('push_alert_log').doc(alertLogId(businessDate, a.id)), {
        businessDate,
        alertId: a.id,
        category: a.category,
        title: a.title,
        sentAt: FieldValue.serverTimestamp(),
        devices: devices.length,
        delivered: res.success,
    }));
    await batch.commit();
    return { businessDate, sent: true, alerts: decision.alerts.length, alertIds: decision.alerts.map(x => x.id), devices: devices.length, delivered: res.success, disabledDevices: res.invalidDeviceIds.length };
};
