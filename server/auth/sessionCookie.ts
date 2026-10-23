// ============================================================================
// 登录记录（Cookie）：登录成功后代替预览站密码（负责人 2026-10-23 批准）
// ----------------------------------------------------------------------------
// 见 docs/security/2026-10-23-login-instead-of-gate-password.md。
// - 内容只有：员工或设备编号、到期时间、AUTH_EPOCH；以服务端金钥 HMAC 签名，改不了也伪造不了
// - Cookie 设为 HttpOnly / Secure / SameSite=Lax，网页程序读不到
// - 不写资料库：登出、到期、AUTH_EPOCH 提高或更换金钥即失效
// 纯函数，方便单元测试。
// ============================================================================
import crypto from 'crypto';

export const SESSION_COOKIE = 'klk_session';
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface SessionPayload {
    /** 员工编号或设备资料编号 */
    sub: string;
    kind: 'emp' | 'device';
    epoch: number;
    /** 到期时间（毫秒） */
    exp: number;
}

/** 签名金钥：SESSION_SECRET；没设就由预览站密码导出（换预览站密码 = 全部登录记录失效） */
export const deriveSessionKey = (secret: string): Buffer =>
    crypto.createHash('sha256').update(`klk-session-v1:${secret}`).digest();

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const mac = (key: Buffer, body: string) => crypto.createHmac('sha256', key).update(body).digest();

export const signSession = (key: Buffer, who: { sub: string; kind: 'emp' | 'device' }, epoch: number, now = Date.now()): string => {
    const payload: SessionPayload = { sub: who.sub, kind: who.kind, epoch, exp: now + SESSION_MS };
    const body = b64(JSON.stringify(payload));
    return `${body}.${b64(mac(key, body))}`;
};

export const verifySession = (key: Buffer, value: string | null | undefined, epoch: number, now = Date.now()): SessionPayload | null => {
    if (!value || value.length > 1024) return null;
    const dot = value.indexOf('.');
    if (dot <= 0) return null;
    const body = value.slice(0, dot);
    const given = Buffer.from(value.slice(dot + 1), 'base64url');
    const expected = mac(key, body);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
        if (typeof p.sub !== 'string' || !p.sub || (p.kind !== 'emp' && p.kind !== 'device')) return null;
        if (p.epoch !== epoch || !(p.exp > now)) return null;
        return p;
    } catch {
        return null;
    }
};

export const readCookie = (header: string | undefined, name: string): string | null => {
    if (!header) return null;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return null;
};

export const sessionCookie = (value: string) =>
    `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const clearedSessionCookie = () =>
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/**
 * 不用登录就能存取的路径：网页本身（页面、程序、图示、manifest、assetlinks）与登录用的接口。
 * 其余 /api/* 一律要登录记录（或预览站密码）。
 * 员工名单 /api/auth/roster 不在这里（负责人选 b：登录页不显示名单）。
 */
const PUBLIC_API = new Set([
    'GET /api/auth/config',
    'GET /api/auth/branding',
    'GET /api/auth/devices',
    'POST /api/auth/login',
    'POST /api/auth/boss-login',
    'POST /api/auth/change-pin',
    'POST /api/auth/device-login',
    'POST /api/auth/logout',
]);
export const isPublicPath = (method: string, path: string): boolean =>
    !(path === '/api' || path.startsWith('/api/')) || PUBLIC_API.has(`${method.toUpperCase()} ${path}`);
