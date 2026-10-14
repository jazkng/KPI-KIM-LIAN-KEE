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
import type { Employee } from '../../types';

export { serverAuthEnabled };

export interface RosterEmployee {
    id: string;
    name: string;
    role: string;
    avatar: string;
}

export interface Roster {
    empty: boolean;
    hasOwner: boolean;
    logoUrl: string;
    employees: RosterEmployee[];
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

export const fetchRoster = async (): Promise<Roster> => {
    const res = await fetch('/api/auth/roster');
    if (!res.ok) throw new Error(`roster ${res.status}`);
    return res.json();
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

export const serverSignOut = () => signOut(auth).catch(() => undefined);
