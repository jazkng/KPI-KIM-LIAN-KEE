// ============================================================================
// CHG-05 服务端登录 · 接口与资料存取（firebase-admin）
// ----------------------------------------------------------------------------
// 依 docs/security/2026-10-13-chg05-chg06-permission-plan.md 第 4 节。
// 这是独立模组：可挂在 server.ts（V2 预览、AI Studio V1），也可另外部署成 klk-auth（负责人决定 S5）。
//
// 读取：employees、config/store
// 写入（只有服务端；规则在 CHG-06 才收紧）：
//   employee_secrets/{员工 ID}        PIN 哈希
//   auth_rate_limits/{杂凑}           尝试次数与锁定
//   auth_pin_change_tokens/{杂凑}     一次性改 PIN 凭证（只存杂凑）
//   employees/{员工 ID}.pin           过渡期同步旧明文 PIN（V1 与 V2 共用资料库，V1 仍比对此栏位；
//                                     与 V1 今天写入的栏位与格式相同，CHG-06 窗口后停止）
// 不提供 bootstrap 接口；第一位老板由负责人执行 scripts/auth/bootstrap-owner.ts。
// ============================================================================
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getPortalRole } from '../../utils/orgAccess';
import { PortalRole, type Employee } from '../../types';
import { adminApp } from '../firebaseAdmin';
import {
    checkPin, claimsFor, findEmployeeByLoginId, hashPin, isAcceptableNewPin, isActiveEmployee, isLocked, LIMITS, NEW_PIN_RULES,
    newOneTimeToken, oneTimeTokenId, PIN_CHANGE_TOKEN_TTL_MS, rateKey, recordFailure, uidForEmployee,
    type AttemptState, type AuthEmployee, type EmployeeSecret,
} from './authCore';

export interface AuthOptions {
    /** AUTH_SERVER_ENABLED=true 且（有预览站门禁或 Emulator） */
    enabled: boolean;
    /** CHG-05 期间为 1；CHG-06 窗口改为 2 */
    epoch: number;
    /** 过渡期接受 employees.pin 旧明文 PIN */
    acceptLegacyPin: boolean;
    /** 改 PIN 时同步写回 employees.pin（V1 仍在使用旧登录时必须开启） */
    mirrorLegacyPin: boolean;
    getIp: (req: express.Request) => string;
    /** 登录成功、签发身份时呼叫：设定登录记录 Cookie（代替预览站密码） */
    onSignedIn?: (res: express.Response, who: { sub: string; kind: 'emp' | 'device' }) => void;
}

export const db = (): Firestore => getFirestore(adminApp());

export const loadEmployees = async (): Promise<AuthEmployee[]> => {
    const snap = await db().collection('employees').get();
    return snap.docs.map(d => ({ ...(d.data() as AuthEmployee), id: String(d.data().id || d.id) }));
};

export const loadSecret = async (id: string): Promise<EmployeeSecret | null> => {
    const snap = await db().collection('employee_secrets').doc(id).get();
    const data = snap.data();
    return snap.exists && typeof data?.pinHash === 'string' ? { pinHash: data.pinHash, mustChange: data.mustChange === true } : null;
};

const attemptsRef = (key: string) => db().collection('auth_rate_limits').doc(key);
export const readAttempts = async (key: string): Promise<AttemptState | null> => {
    const snap = await attemptsRef(key).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    return { failures: Number(d.failures) || 0, windowStart: Number(d.windowStart) || 0, lockedUntil: Number(d.lockedUntil) || 0 };
};
export const writeFailure = async (key: string, prev: AttemptState | null, limit: { maxFailures: number; windowMs: number; lockMs: number }) => {
    const next = recordFailure(prev, Date.now(), limit);
    await attemptsRef(key).set({ ...next, updatedAt: FieldValue.serverTimestamp() });
    return next;
};
export const clearAttempts = (key: string) => attemptsRef(key).delete();

const issueToken = async (e: AuthEmployee, epoch: number) => {
    const claims = claimsFor(e, epoch);
    return getAuth(adminApp()).createCustomToken(uidForEmployee(e.id), { ...claims });
};

const issuePinChange = async (e: AuthEmployee) => {
    const { token, id } = newOneTimeToken();
    await db().collection('auth_pin_change_tokens').doc(id).set({
        emp: e.id,
        expiresAt: Date.now() + PIN_CHANGE_TOKEN_TTL_MS,
        used: false,
        createdAt: FieldValue.serverTimestamp(),
    });
    return token;
};

const publicEmployee = (e: AuthEmployee) => ({ id: e.id, name: e.name || e.id, role: e.role || '', avatar: e.avatar || '' });

/** V1 老板入口的判断（getPortalRole 会从职位推断层级）；claims 仍只看明确栏位 */
const isBossPortal = (e: AuthEmployee) => getPortalRole(e as unknown as Employee) === PortalRole.BOSS;

/** 验证呼叫者的员工身份（Bearer ID Token，检查撤销与 epoch），回传员工资料 */
export const requireEmployeeCaller = async (req: express.Request, epoch: number): Promise<(AuthEmployee & { allowedModules?: string[] }) | null> => {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return null;
    const decoded = await getAuth(adminApp()).verifyIdToken(header.slice(7), true).catch(() => null);
    if (!decoded || typeof decoded.emp !== 'string' || decoded.epoch !== epoch) return null;
    const snap = await db().collection('employees').doc(decoded.emp).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as AuthEmployee & { allowedModules?: string[] }), id: decoded.emp };
};

export const portalOf = (e: AuthEmployee): 'BOSS' | 'MANAGEMENT' | 'STAFF' => {
    const p = getPortalRole(e as unknown as Employee);
    return p === PortalRole.BOSS ? 'BOSS' : p === PortalRole.MANAGEMENT ? 'MANAGEMENT' : 'STAFF';
};

export const mountAuthRoutes = (app: express.Express, opts: AuthOptions) => {
    const DENIED = { error: 'ACCESS DENIED' };
    const guard: express.RequestHandler = (_req, res, next) => {
        if (!opts.enabled) return res.status(503).json({ error: '服务端登录尚未开通' });
        next();
    };
    const fail = (res: express.Response, e: unknown) => {
        console.error('Auth error:', (e as Error)?.message || e);
        res.status(500).json({ error: '登录服务暂时无法使用，请稍后再试' });
    };

    app.get('/api/auth/config', (_req, res) => res.json({ enabled: opts.enabled }));

    /** 签发身份 + 登录记录 */
    const signedIn = async (res: express.Response, emp: AuthEmployee) => {
        const token = await issueToken(emp, opts.epoch);
        opts.onSignedIn?.(res, { sub: emp.id, kind: 'emp' });
        res.json({ token, employee: publicEmployee(emp) });
    };

    // 登录页只要 Logo（负责人选 b：不显示员工名单，名单接口要登录才能用）
    app.get('/api/auth/branding', guard, async (_req, res) => {
        try {
            const [cfg, any] = await Promise.all([db().collection('config').doc('store').get(), db().collection('employees').limit(1).get()]);
            res.json({ logoUrl: typeof cfg.data()?.logoUrl === 'string' ? cfg.data()!.logoUrl : '', empty: any.empty });
        } catch (e) { fail(res, e); }
    });

    // 登录页名单：不含 PIN、薪资、电话；附门店 Logo
    app.get('/api/auth/roster', guard, async (_req, res) => {
        try {
            const [list, cfg] = await Promise.all([loadEmployees(), db().collection('config').doc('store').get()]);
            const active = list.filter(isActiveEmployee);
            res.json({
                empty: list.length === 0,
                hasOwner: list.some(e => String(e.role || '').includes('Owner') || ['001', '002', '003', '004'].includes(e.id)),
                logoUrl: typeof cfg.data()?.logoUrl === 'string' ? cfg.data()!.logoUrl : '',
                employees: active.map(publicEmployee),
            });
        } catch (e) { fail(res, e); }
    });

    app.post('/api/auth/login', guard, async (req, res) => {
        const loginId = String(req.body?.id || '').slice(0, 30);
        const pin = String(req.body?.pin || '');
        try {
            const emp = findEmployeeByLoginId((await loadEmployees()).filter(isActiveEmployee), loginId);
            // 找不到员工也计入同一 IP 的失败次数，避免用来枚举员工编号
            const key = rateKey('login', emp?.id || `?${loginId}`, opts.getIp(req));
            // 同一员工不论 IP 的总次数（登录页公开后，防止换 IP 猜 PIN）
            const empKey = emp ? rateKey('login-emp', emp.id) : null;
            const [prev, empPrev] = await Promise.all([readAttempts(key), empKey ? readAttempts(empKey) : Promise.resolve(null)]);
            const now = Date.now();
            if (isLocked(prev, now)) return res.status(429).json({ error: 'LOCKED', retryAfterMs: prev!.lockedUntil - now });
            if (isLocked(empPrev, now)) return res.status(429).json({ error: 'LOCKED', retryAfterMs: empPrev!.lockedUntil - now });
            const result = emp ? checkPin(emp, await loadSecret(emp.id), pin, opts.acceptLegacyPin) : { ok: false as const };
            if (!emp || !result.ok) {
                const [next] = await Promise.all([
                    writeFailure(key, prev, LIMITS.login),
                    empKey ? writeFailure(empKey, empPrev, LIMITS.loginEmployee) : Promise.resolve(null),
                ]);
                return res.status(401).json({ ...DENIED, remaining: Math.max(0, LIMITS.login.maxFailures - next.failures) });
            }
            await Promise.all([clearAttempts(key), empKey ? clearAttempts(empKey) : Promise.resolve()]);
            if (result.mustChange) return res.json({ mustChange: true, changeToken: await issuePinChange(emp), employee: publicEmployee(emp) });
            await signedIn(res, emp);
        } catch (e) { fail(res, e); }
    });

    // 老板键盘：只输入 PIN，只比对老板入口的人；同一 IP 限次更严
    app.post('/api/auth/boss-login', guard, async (req, res) => {
        const pin = String(req.body?.pin || '');
        try {
            const key = rateKey('boss', opts.getIp(req));
            const prev = await readAttempts(key);
            if (isLocked(prev, Date.now())) return res.status(429).json({ error: 'LOCKED', retryAfterMs: prev!.lockedUntil - Date.now() });
            const bosses = (await loadEmployees()).filter(e => isActiveEmployee(e) && isBossPortal(e));
            for (const boss of bosses) {
                const result = checkPin(boss, await loadSecret(boss.id), pin, opts.acceptLegacyPin);
                if (!result.ok) continue;
                await clearAttempts(key);
                if (result.mustChange) return res.json({ mustChange: true, changeToken: await issuePinChange(boss), employee: publicEmployee(boss) });
                return signedIn(res, boss);
            }
            await writeFailure(key, prev, LIMITS.boss);
            res.status(401).json({ error: 'WRONG PIN' });
        } catch (e) { fail(res, e); }
    });

    // 改 PIN：一次性凭证（首次登录 / 临时 PIN），或已登录身份 + 目前的 PIN
    app.post('/api/auth/change-pin', guard, async (req, res) => {
        const newPin = String(req.body?.newPin || '');
        if (!isAcceptableNewPin(newPin)) return res.status(400).json({ error: 'INVALID PIN', detail: NEW_PIN_RULES });
        try {
            let empId: string | null = null;
            const changeToken = req.body?.changeToken;
            if (typeof changeToken === 'string' && changeToken) {
                const ref = db().collection('auth_pin_change_tokens').doc(oneTimeTokenId(changeToken));
                empId = await db().runTransaction(async tx => {
                    const snap = await tx.get(ref);
                    const d = snap.data();
                    if (!snap.exists || d?.used === true || Number(d?.expiresAt) < Date.now()) return null;
                    tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
                    return String(d!.emp);
                });
                if (!empId) return res.status(401).json({ error: '改 PIN 凭证无效或已过期，请重新登录' });
            } else {
                const header = String(req.headers.authorization || '');
                if (!header.startsWith('Bearer ')) return res.status(401).json({ error: '需要登录' });
                const decoded = await getAuth(adminApp()).verifyIdToken(header.slice(7), true).catch(() => null);
                if (!decoded || typeof decoded.emp !== 'string' || decoded.epoch !== opts.epoch) return res.status(401).json({ error: '需要登录' });
                const list = await loadEmployees();
                const self = list.find(e => e.id === decoded.emp);
                const key = rateKey('login', decoded.emp, opts.getIp(req));
                const prev = await readAttempts(key);
                if (isLocked(prev, Date.now())) return res.status(429).json({ error: 'LOCKED' });
                if (!self || !checkPin(self, await loadSecret(self.id), String(req.body?.currentPin || ''), opts.acceptLegacyPin).ok) {
                    await writeFailure(key, prev, LIMITS.login);
                    return res.status(401).json(DENIED);
                }
                empId = self.id;
            }

            const emp = (await loadEmployees()).find(e => e.id === empId);
            if (!emp || !isActiveEmployee(emp)) return res.status(401).json(DENIED);
            const batch = db().batch();
            batch.set(db().collection('employee_secrets').doc(emp.id), { pinHash: hashPin(newPin), mustChange: false, updatedAt: FieldValue.serverTimestamp() });
            if (opts.mirrorLegacyPin) batch.set(db().collection('employees').doc(emp.id), { pin: newPin }, { merge: true });
            await batch.commit();
            // 撤销这位员工所有旧登录，再签发新身份
            await getAuth(adminApp()).revokeRefreshTokens(uidForEmployee(emp.id)).catch(err => {
                if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
            });
            await signedIn(res, emp);
        } catch (e) { fail(res, e); }
    });
};
