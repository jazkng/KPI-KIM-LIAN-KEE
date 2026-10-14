// ============================================================================
// 驾驶舱手机推送（PR E2a）· 浏览器端
// ----------------------------------------------------------------------------
// 所有写入都经服务端（/api/push/*），浏览器不直接写 Firestore；只在老板按按钮时执行。
// Emulator 模式不连 FCM：用本机产生的模拟凭证，服务端也只记录、不真的推送。
// ============================================================================
import { app, isEmulatorMode } from '../../firebaseConfig';
import type { AlertThresholds } from '../cockpit/alertRules';

export interface PushServerSettings {
    enabled: boolean;
    thresholds: AlertThresholds;
    quietFromMin: number;
    quietToMin: number;
}

export type PushAvailability =
    | { ok: true }
    | { ok: false; reason: string };

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;
const EMULATOR_TOKEN_KEY = 'klk.push.emulatorToken.v1';

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `伺服器错误 ${res.status}`);
    return data as T;
};

export const isPushSupportedHere = () =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** 推送能不能在这台装置使用；不能时回传给老板看的原因 */
export const checkPushAvailability = async (): Promise<PushAvailability> => {
    let status: { available: boolean };
    try {
        status = await api<{ available: boolean }>('/api/push/status');
    } catch {
        return { ok: false, reason: '无法连线到伺服器' };
    }
    if (!status.available) return { ok: false, reason: '待负责人完成 FCM 设定（网页推送金钥、服务账号授权、定时任务）后开放' };
    if (isEmulatorMode) return { ok: true };
    if (!VAPID_KEY) return { ok: false, reason: '缺少网页推送金钥（VITE_FCM_VAPID_KEY），待负责人在 Firebase 产生后设定' };
    if (!isPushSupportedHere()) return { ok: false, reason: '这个浏览器不支援推送；iPhone 请先用 Safari 把 ERP「加入主画面」，再从主画面打开' };
    return { ok: true };
};

const emulatorToken = () => {
    try {
        const saved = window.localStorage.getItem(EMULATOR_TOKEN_KEY);
        if (saved) return saved;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
        const random = Array.from(crypto.getRandomValues(new Uint8Array(150)), b => chars[b % chars.length]).join('');
        const token = `emulator:${random}`;
        window.localStorage.setItem(EMULATOR_TOKEN_KEY, token);
        return token;
    } catch {
        return null;
    }
};

/** 取得这台装置的 FCM 凭证；ask=true 时会询问通知权限 */
export const getDeviceToken = async (ask: boolean): Promise<string | null> => {
    if (isEmulatorMode) return emulatorToken();
    if (!isPushSupportedHere() || !VAPID_KEY || !app) return null;
    if (Notification.permission === 'denied') throw new Error('通知权限已被拒绝，请到浏览器或手机设定中允许通知');
    if (Notification.permission !== 'granted') {
        if (!ask) return null;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('没有取得通知权限');
    }
    const { getMessaging, getToken } = await import('firebase/messaging');
    const registration = await navigator.serviceWorker.ready;
    return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
};

export const deviceLabel = () => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const os = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '其他装置';
    return `${os}${standalone ? '（主画面）' : '（浏览器）'}`;
};

export const isThisDeviceRegistered = async (): Promise<boolean> => {
    const token = await getDeviceToken(false);
    if (!token) return false;
    return (await api<{ registered: boolean }>('/api/push/device-status', { method: 'POST', body: JSON.stringify({ token }) })).registered;
};

export const enableThisDevice = async () => {
    const token = await getDeviceToken(true);
    if (!token) throw new Error('无法取得这台装置的推送凭证');
    await api('/api/push/register', { method: 'POST', body: JSON.stringify({ token, label: deviceLabel() }) });
};

export const disableThisDevice = async () => {
    const token = await getDeviceToken(false);
    if (!token) return;
    await api('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token }) });
};

export const getServerPushSettings = () => api<PushServerSettings>('/api/push/settings');
export const saveServerPushSettings = (s: PushServerSettings) =>
    api<PushServerSettings>('/api/push/settings', { method: 'PUT', body: JSON.stringify(s) });
