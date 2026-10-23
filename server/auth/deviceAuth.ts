// ============================================================================
// CHG-05b 服务端登录 · 专用设备与 PIN 二次确认
// ----------------------------------------------------------------------------
// 依 CHG-05/06 方案第 3 节第 4、5、8 项：
//   GET  /api/auth/devices                    设备登录页名单（不含 PIN 哈希、盐、会话）
//   POST /api/auth/device-login               设备编号 + PIN → 设备身份（claims：device / screens / store / epoch）
//                                             同时写入与 V1 相同的会话栏位，设备画面沿用现有的会话检查
//   POST /api/auth/device-admin/create        建立设备（HR 设备户口）
//   POST /api/auth/device-admin/change-pin    改设备 PIN（会话失效、撤销设备身份）
//   POST /api/auth/device-admin/revoke        停用或强制登出时撤销设备身份
//   POST /api/auth/verify-pin                 考勤主控台 PIN 打卡、排班重置的二次确认：只回 {ok}
// 新 PIN 只存 scrypt 哈希于 device_secrets（只有服务端）；过渡期同时写回 V1 的 PBKDF2 栏位（V1 设备仍在浏览器比对）。
// ============================================================================
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp } from '../firebaseAdmin';
import {
    canPerform, checkPin, deviceDocId, hashPin, isActiveEmployee, isLocked, isValidDevicePin, legacyDevicePinCredential, LIMITS,
    newDeviceSession, normalizeDeviceCode, rateKey, verifyLegacyDevicePin, verifyPinHash, type PrivilegedAction,
} from './authCore';
import { clearAttempts, db, loadSecret, portalOf, readAttempts, requireEmployeeCaller, writeFailure, type AuthOptions } from './authService';

const VALID_SCREENS = ['KITCHEN_ALERT', 'QUEUE_DISPLAY'] as const;
type Screen = (typeof VALID_SCREENS)[number];

const clean = (v: unknown, max: number) => {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    return s.length > max ? null : s;
};

const publicDevice = (id: string, d: FirebaseFirestore.DocumentData) => ({
    id,
    deviceCode: String(d.deviceCode || ''),
    deviceName: String(d.deviceName || ''),
    storeId: String(d.storeId || 'KEPONG'),
    status: d.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED',
    allowedScreens: Array.isArray(d.allowedScreens) ? d.allowedScreens.filter((s: string) => (VALID_SCREENS as readonly string[]).includes(s)) : [],
    defaultScreen: String(d.defaultScreen || ''),
    location: typeof d.location === 'string' ? d.location : undefined,
});

export const mountDeviceAuthRoutes = (app: express.Express, opts: AuthOptions) => {
    const guard: express.RequestHandler = (_req, res, next) => {
        if (!opts.enabled) return res.status(503).json({ error: '服务端登录尚未开通' });
        next();
    };
    const fail = (res: express.Response, e: unknown) => {
        console.error('Device auth error:', (e as Error)?.message || e);
        res.status(500).json({ error: '登录服务暂时无法使用，请稍后再试' });
    };
    const requireAction = async (req: express.Request, res: express.Response, action: PrivilegedAction) => {
        const caller = await requireEmployeeCaller(req, opts.epoch);
        if (!caller) { res.status(401).json({ error: '需要登录' }); return null; }
        if (!canPerform({ portal: portalOf(caller), allowedModules: caller.allowedModules, active: isActiveEmployee(caller) }, action)) {
            res.status(403).json({ error: '没有权限' });
            return null;
        }
        return caller;
    };
    const revokeDevice = (id: string) => getAuth(adminApp()).revokeRefreshTokens(id).catch(err => {
        if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
    });

    app.get('/api/auth/devices', guard, async (req, res) => {
        try {
            const storeId = clean(req.query.storeId || 'KEPONG', 80) || 'KEPONG';
            const snap = await db().collection('device_accounts').where('storeId', '==', storeId).get();
            res.json({ devices: snap.docs.map(d => publicDevice(d.id, d.data())).filter(d => d.status === 'ACTIVE') });
        } catch (e) { fail(res, e); }
    });

    app.post('/api/auth/device-login', guard, async (req, res) => {
        const code = normalizeDeviceCode(String(req.body?.deviceCode || ''));
        const pin = String(req.body?.pin || '');
        try {
            const key = rateKey('device', code || '?', opts.getIp(req));
            const prev = await readAttempts(key);
            if (isLocked(prev, Date.now())) return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
            const ref = code ? db().collection('device_accounts').doc(deviceDocId(code)) : null;
            const snap = ref ? await ref.get() : null;
            const d = snap?.exists ? snap.data()! : null;
            const secret = d ? (await db().collection('device_secrets').doc(snap!.id).get()).data() : undefined;
            const ok = !!d && isValidDevicePin(pin) && (
                typeof secret?.pinHash === 'string'
                    ? verifyPinHash(pin, secret.pinHash)
                    : opts.acceptLegacyPin && verifyLegacyDevicePin(pin, d)
            );
            if (!ok) {
                await writeFailure(key, prev, LIMITS.login);
                return res.status(401).json({ error: '设备编号或 PIN 不正确' });
            }
            if (d!.status !== 'ACTIVE') return res.status(403).json({ error: '这个设备户口已经停用，请联系管理员' });
            await clearAttempts(key);

            // 与 V1 相同的会话栏位：设备画面沿用现有的 validateSession / subscribeSession
            const session = newDeviceSession();
            const loginAt = new Date().toISOString();
            const sessionVersion = await db().runTransaction(async tx => {
                const latest = await tx.get(ref!);
                const cur = latest.data();
                if (!cur || cur.status !== 'ACTIVE') throw new Error('DEVICE_CHANGED');
                const next = Math.max(1, Number(cur.sessionVersion) || 1) + 1;
                tx.update(ref!, {
                    sessionVersion: next,
                    sessionHash: session.sessionHash,
                    lastLoginAt: loginAt,
                    lastSeenAt: loginAt,
                    currentScreen: cur.defaultScreen || null,
                    serverLastLoginAt: FieldValue.serverTimestamp(),
                    serverLastSeenAt: FieldValue.serverTimestamp(),
                });
                return next;
            });
            const pub = publicDevice(snap!.id, d!);
            const token = await getAuth(adminApp()).createCustomToken(snap!.id, {
                device: snap!.id,
                screens: pub.allowedScreens,
                store: pub.storeId,
                epoch: opts.epoch,
            });
            opts.onSignedIn?.(res, { sub: snap!.id, kind: 'device' });
            res.json({
                token,
                session: {
                    schemaVersion: 1,
                    deviceId: snap!.id,
                    deviceCode: pub.deviceCode,
                    deviceName: pub.deviceName,
                    storeId: pub.storeId,
                    allowedScreens: pub.allowedScreens,
                    defaultScreen: pub.defaultScreen,
                    sessionVersion,
                    sessionToken: session.sessionToken,
                    loginAt,
                },
            });
        } catch (e) { fail(res, e); }
    });

    app.post('/api/auth/device-admin/create', guard, async (req, res) => {
        try {
            const caller = await requireAction(req, res, 'DEVICE_ADMIN');
            if (!caller) return;
            const b = req.body || {};
            const code = normalizeDeviceCode(String(b.deviceCode || ''));
            const name = clean(b.deviceName, 100);
            const storeId = clean(b.storeId, 80);
            const location = clean(b.location, 120);
            const notes = clean(b.notes, 300);
            const screens = Array.from(new Set((Array.isArray(b.allowedScreens) ? b.allowedScreens : []).filter((s: string) => (VALID_SCREENS as readonly string[]).includes(s)))) as Screen[];
            const pin = String(b.pin || '');
            if (!code) return res.status(400).json({ error: '设备编号必须是 3 至 40 位英文字母、数字、横线或底线' });
            if (!name || !storeId) return res.status(400).json({ error: '请填写设备名称与门店编号' });
            if (location === null || notes === null) return res.status(400).json({ error: '位置或备注太长' });
            if (!screens.length || !screens.includes(b.defaultScreen)) return res.status(400).json({ error: '默认画面必须包含在设备可使用画面中' });
            if (!isValidDevicePin(pin)) return res.status(400).json({ error: '设备 PIN 必须是 4 至 8 位数字' });

            const id = deviceDocId(code);
            const now = new Date().toISOString();
            const ref = db().collection('device_accounts').doc(id);
            const created = await db().runTransaction(async tx => {
                if ((await tx.get(ref)).exists) return false;
                tx.set(ref, {
                    id, schemaVersion: 1, deviceCode: code, deviceName: name, storeId, status: 'ACTIVE',
                    allowedScreens: screens, defaultScreen: b.defaultScreen, sessionVersion: 1,
                    ...(location ? { location } : {}), ...(notes ? { notes } : {}),
                    createdById: caller.id, createdByName: caller.name || caller.id, createdAt: now,
                    updatedById: caller.id, updatedByName: caller.name || caller.id, updatedAt: now,
                    // 过渡期：V1 设备登录仍在浏览器比对这组栏位
                    ...(opts.mirrorLegacyPin ? legacyDevicePinCredential(pin) : {}),
                    serverCreatedAt: FieldValue.serverTimestamp(), serverUpdatedAt: FieldValue.serverTimestamp(),
                });
                tx.set(db().collection('device_secrets').doc(id), { pinHash: hashPin(pin), updatedAt: FieldValue.serverTimestamp() });
                return true;
            });
            if (!created) return res.status(409).json({ error: `设备编号 ${code} 已经存在` });
            res.json({ device: publicDevice(id, { deviceCode: code, deviceName: name, storeId, status: 'ACTIVE', allowedScreens: screens, defaultScreen: b.defaultScreen, location }) });
        } catch (e) { fail(res, e); }
    });

    app.post('/api/auth/device-admin/change-pin', guard, async (req, res) => {
        try {
            const caller = await requireAction(req, res, 'DEVICE_ADMIN');
            if (!caller) return;
            const id = String(req.body?.deviceId || '');
            const pin = String(req.body?.pin || '');
            if (!/^device_[a-z0-9_-]{3,40}$/.test(id)) return res.status(400).json({ error: '设备资料编号不正确' });
            if (!isValidDevicePin(pin)) return res.status(400).json({ error: '设备 PIN 必须是 4 至 8 位数字' });
            const ref = db().collection('device_accounts').doc(id);
            const ok = await db().runTransaction(async tx => {
                const cur = await tx.get(ref);
                if (!cur.exists) return false;
                tx.update(ref, {
                    ...(opts.mirrorLegacyPin ? legacyDevicePinCredential(pin) : { pinHash: FieldValue.delete(), pinSalt: FieldValue.delete(), pinIterations: FieldValue.delete() }),
                    sessionVersion: Math.max(1, Number(cur.data()!.sessionVersion) || 1) + 1,
                    sessionHash: null,
                    currentScreen: null,
                    updatedById: caller.id, updatedByName: caller.name || caller.id, updatedAt: new Date().toISOString(),
                    serverUpdatedAt: FieldValue.serverTimestamp(),
                });
                tx.set(db().collection('device_secrets').doc(id), { pinHash: hashPin(pin), updatedAt: FieldValue.serverTimestamp() });
                return true;
            });
            if (!ok) return res.status(404).json({ error: '找不到这个设备户口' });
            await revokeDevice(id);
            res.json({ ok: true });
        } catch (e) { fail(res, e); }
    });

    app.post('/api/auth/device-admin/revoke', guard, async (req, res) => {
        try {
            const caller = await requireAction(req, res, 'DEVICE_ADMIN');
            if (!caller) return;
            const id = String(req.body?.deviceId || '');
            if (!/^device_[a-z0-9_-]{3,40}$/.test(id)) return res.status(400).json({ error: '设备资料编号不正确' });
            await revokeDevice(id);
            res.json({ ok: true });
        } catch (e) { fail(res, e); }
    });

    // 二次确认：只回 {ok}，不签发身份；按「被确认的员工 + IP」限次
    app.post('/api/auth/verify-pin', guard, async (req, res) => {
        try {
            const caller = await requireAction(req, res, 'VERIFY_PIN');
            if (!caller) return;
            const targetId = String(req.body?.employeeId || '').slice(0, 40);
            const pin = String(req.body?.pin || '');
            const key = rateKey('verify', targetId, opts.getIp(req));
            const prev = await readAttempts(key);
            if (isLocked(prev, Date.now())) return res.status(429).json({ ok: false, error: '尝试次数过多，请 15 分钟后再试' });
            const snap = await db().collection('employees').doc(targetId).get();
            const target = snap.exists ? { ...(snap.data() as any), id: targetId } : null;
            const ok = !!target && isActiveEmployee(target) && checkPin(target, await loadSecret(targetId), pin, opts.acceptLegacyPin).ok;
            if (!ok) {
                await writeFailure(key, prev, LIMITS.login);
                return res.json({ ok: false });
            }
            await clearAttempts(key);
            res.json({ ok: true });
        } catch (e) { fail(res, e); }
    });
};
