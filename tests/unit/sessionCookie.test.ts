import { describe, expect, it } from 'vitest';
import { deriveSessionKey, isPublicPath, readCookie, sessionCookie, signSession, verifySession } from '../../server/auth/sessionCookie';

const key = deriveSessionKey('test-secret');
const now = Date.UTC(2026, 9, 23);

describe('登录记录（代替预览站密码）', () => {
    it('签名后可验证，带回员工编号', () => {
        const v = signSession(key, { sub: '1044', kind: 'emp' }, 1, now);
        expect(verifySession(key, v, 1, now + 1000)).toMatchObject({ sub: '1044', kind: 'emp', epoch: 1 });
    });
    it('30 天后到期', () => {
        const v = signSession(key, { sub: '1044', kind: 'emp' }, 1, now);
        expect(verifySession(key, v, 1, now + 29 * 86400_000)).not.toBeNull();
        expect(verifySession(key, v, 1, now + 30 * 86400_000 + 1)).toBeNull();
    });
    it('改内容（例如改成老板 001）或换金钥都无效', () => {
        const v = signSession(key, { sub: '1044', kind: 'emp' }, 1, now);
        const [, sig] = v.split('.');
        const forged = Buffer.from(JSON.stringify({ sub: '001', kind: 'emp', epoch: 1, exp: now + 1e9 })).toString('base64url');
        expect(verifySession(key, `${forged}.${sig}`, 1, now)).toBeNull();
        expect(verifySession(deriveSessionKey('other'), v, 1, now)).toBeNull();
        expect(verifySession(key, 'garbage', 1, now)).toBeNull();
        expect(verifySession(key, '', 1, now)).toBeNull();
        expect(verifySession(key, null, 1, now)).toBeNull();
    });
    it('AUTH_EPOCH 提高后旧记录失效', () => {
        const v = signSession(key, { sub: '1044', kind: 'emp' }, 1, now);
        expect(verifySession(key, v, 2, now)).toBeNull();
    });
    it('读 Cookie 与 Cookie 属性', () => {
        expect(readCookie('a=1; klk_session=abc.def; b=2', 'klk_session')).toBe('abc.def');
        expect(readCookie('a=1', 'klk_session')).toBeNull();
        expect(readCookie(undefined, 'klk_session')).toBeNull();
        const c = sessionCookie('x.y');
        expect(c).toContain('HttpOnly');
        expect(c).toContain('Secure');
        expect(c).toContain('SameSite=Lax');
        expect(c).toContain(`Max-Age=${30 * 86400}`);
    });
});

describe('门禁放行清单', () => {
    it('网页本身与登录接口不用登录', () => {
        for (const [m, p] of [['GET', '/'], ['GET', '/assets/index-abc.js'], ['GET', '/manifest.json'], ['GET', '/.well-known/assetlinks.json'],
            ['GET', '/api/auth/config'], ['GET', '/api/auth/branding'], ['POST', '/api/auth/login'], ['POST', '/api/auth/boss-login'],
            ['POST', '/api/auth/change-pin'], ['POST', '/api/auth/device-login'], ['GET', '/api/auth/devices'], ['POST', '/api/auth/logout']]) {
            expect(isPublicPath(m, p), `${m} ${p}`).toBe(true);
        }
    });
    it('其他接口（含员工名单、AI、发票扫描）要登录', () => {
        for (const [m, p] of [['GET', '/api/auth/roster'], ['GET', '/api/auth/session'], ['POST', '/api/gemini/chat'], ['POST', '/api/ai/cockpit-advisor'],
            ['POST', '/api/ap-ai/scan'], ['GET', '/api/push/settings'], ['POST', '/api/auth/verify-pin'], ['GET', '/api/auth/login'], ['GET', '/api']]) {
            expect(isPublicPath(m, p), `${m} ${p}`).toBe(false);
        }
    });
});
