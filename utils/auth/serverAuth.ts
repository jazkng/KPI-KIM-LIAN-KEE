// ============================================================================
// CHG-05 服务端登录 · 浏览器端
// ----------------------------------------------------------------------------
// 服务端开通（/api/auth/config 回 enabled）时：登录前不读 Firestore，
// PIN 只送到服务端比对，成功后以 Custom Token 登录 Firebase（带 emp 等 claims）。
// 未开通时一律回 false，画面照旧使用原本的登录方式。
// ============================================================================
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, serverAuthEnabled } from '../../firebaseConfig';
import { DataManager } from '../dataManager';
import type { CreateDeviceAccountInput, DeviceAccount, DeviceSession, Employee } from '../../types';

export { serverAuthEnabled };

export interface RosterEmployee {
    id: string;
    name: string;
    role: string;
    avatar: string;
}

export type LoginResult =
    | { kind: 'OK'; employee: Employee }
    | { kind: 'MUST_CHANGE'; changeToken: string; employee: RosterEmployee }
    | { kind: 'DENIED'; remaining?: number }
    | { kind: 'LOCKED' }
    | { kind: 'ERROR'; message: string };

const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as Record<string, any> };
};

/** 登录页用：只有 Logo 与「系统是否还没有员工」，不含员工名单（负责人 2026-10-23 选 b） */
export const fetchBranding = async (): Promise<{ logoUrl: string; empty: boolean }> => {
    const res = await fetch('/api/auth/branding');
    if (!res.ok) throw new Error(`branding ${res.status}`);
    return res.json();
};

/**
 * 服务端的登录记录（Cookie，代替预览站密码）是否还有效：
 * 'OK' = 有效或以预览站密码进来；'EXPIRED' = 没有或已到期（要重新输入员工 PIN）；
 * 'MISMATCH' = 记录的是别人；'UNKNOWN' = 连不上（离线时不登出）
 */
export const checkServerSession = async (expectedId: string): Promise<'OK' | 'EXPIRED' | 'MISMATCH' | 'UNKNOWN'> => {
    try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (res.status === 401) return 'EXPIRED';
        if (!res.ok) return 'UNKNOWN';
        const data = await res.json();
        return data?.kind === 'emp' && data.id !== expectedId ? 'MISMATCH' : 'OK';
    } catch {
        return 'UNKNOWN';
    }
};

/** 以服务端签发的 Custom Token 登录 Firebase，再读取自己的员工资料 */
const completeSignIn = async (token: string): Promise<Employee> => {
    const cred = await signInWithCustomToken(auth, token);
    const claims = (await cred.user.getIdTokenResult()).claims;
    const emp = typeof claims.emp === 'string' ? await DataManager.getEmployeeById(claims.emp) : null;
    if (!emp) throw new Error('找不到员工资料');
    return emp;
};

const toResult = async (r: { status: number; data: Record<string, any> }): Promise<LoginResult> => {
    if (r.status === 429) return { kind: 'LOCKED' };
    if (r.status === 401) return { kind: 'DENIED', remaining: r.data.remaining };
    if (r.status !== 200) return { kind: 'ERROR', message: r.data.error || `伺服器错误 ${r.status}` };
    if (r.data.mustChange) return { kind: 'MUST_CHANGE', changeToken: r.data.changeToken, employee: r.data.employee };
    return { kind: 'OK', employee: await completeSignIn(r.data.token) };
};

const safely = async (fn: () => Promise<LoginResult>): Promise<LoginResult> => {
    try { return await fn(); } catch (e) { return { kind: 'ERROR', message: (e as Error).message || '无法连线到伺服器' }; }
};

export const loginWithPin = (id: string, pin: string) => safely(async () => toResult(await post('/api/auth/login', { id, pin })));
export const bossLogin = (pin: string) => safely(async () => toResult(await post('/api/auth/boss-login', { pin })));
export const changePinWithToken = (changeToken: string, newPin: string) =>
    safely(async () => {
        const r = await post('/api/auth/change-pin', { changeToken, newPin });
        if (r.status === 400) return { kind: 'ERROR', message: 'INVALID PIN' };
        return toResult(r);
    });

/** 目前 Firebase 身份的员工编号（服务端登录才有）；没有就回 null */
export const currentSignedInEmployeeId = async (): Promise<string | null> => {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return null;
    const claims = (await user.getIdTokenResult().catch(() => null))?.claims;
    return typeof claims?.emp === 'string' ? claims.emp : null;
};

/** 登出：清掉服务端的登录记录，再登出 Firebase 身份 */
export const serverSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    await signOut(auth).catch(() => undefined);
};

// ── CHG-05b：设备登录、设备户口、PIN 二次确认 ──

/** 以目前登录员工的 ID Token 呼叫需要权限的接口 */
const authedPost = async (path: string, body: unknown) => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error('请重新登录后再试');
    return post(path, body, { Authorization: `Bearer ${await user.getIdToken()}` });
};

const ensureOk = (r: { status: number; data: Record<string, any> }) => {
    if (r.status !== 200) throw new Error(r.data.error || `伺服器错误 ${r.status}`);
    return r.data;
};

export const fetchLoginDevices = async (storeId = 'KEPONG'): Promise<DeviceAccount[]> => {
    const res = await fetch(`/api/auth/devices?storeId=${encodeURIComponent(storeId)}`);
    if (!res.ok) throw new Error(`devices ${res.status}`);
    return (await res.json()).devices;
};

/** 设备登录：服务端比对 PIN，签发设备身份，并回传与原本相同格式的设备会话 */
export const deviceLogin = async (deviceCode: string, pin: string): Promise<DeviceSession> => {
    const r = await post('/api/auth/device-login', { deviceCode, pin });
    const data = ensureOk(r);
    await signInWithCustomToken(auth, data.token);
    return data.session as DeviceSession;
};

/** 目前 Firebase 身份的设备编号（设备登录才有） */
export const currentSignedInDeviceId = async (): Promise<string | null> => {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return null;
    const claims = (await user.getIdTokenResult().catch(() => null))?.claims;
    return typeof claims?.device === 'string' ? claims.device : null;
};

export const adminCreateDevice = async (input: Omit<CreateDeviceAccountInput, 'createdBy'>): Promise<DeviceAccount> =>
    ensureOk(await authedPost('/api/auth/device-admin/create', input)).device;
export const adminChangeDevicePin = async (deviceId: string, pin: string) => { ensureOk(await authedPost('/api/auth/device-admin/change-pin', { deviceId, pin })); };
export const adminRevokeDevice = async (deviceId: string) => { ensureOk(await authedPost('/api/auth/device-admin/revoke', { deviceId })); };

/** 考勤 PIN 打卡、排班重置的二次确认：服务端比对，只回对或错 */
export const verifyEmployeePin = async (employeeId: string, pin: string): Promise<{ ok: boolean; error?: string }> => {
    const r = await authedPost('/api/auth/verify-pin', { employeeId, pin });
    if (r.status === 200) return { ok: r.data.ok === true };
    return { ok: false, error: r.data.error || `伺服器错误 ${r.status}` };
};
