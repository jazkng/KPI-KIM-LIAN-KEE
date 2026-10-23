import { describe, expect, it } from 'vitest';
import {
    candidateIds, checkPin, claimsFor, findEmployeeByLoginId, hashPin, isAcceptableNewPin, isLocked, LIMITS, legacyPinOf,
    newOneTimeToken, oneTimeTokenId, recordFailure, verifyPinHash,
} from '../../server/auth/authCore';

const owner = { id: '001', name: '虚构老板', role: 'Owner (老板)', pin: '8888' };
const crew = { id: '7001', name: '虚构厨师', role: 'Cook', pin: '246810' };
const fresh = { id: '7002', name: '虚构新人', role: 'Floor' };

describe('CHG-05 · PIN 哈希', () => {
    it('scrypt 哈希可验证，错误 PIN、竄改格式都不通过', () => {
        const h = hashPin('135790');
        expect(h).toMatch(/^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
        expect(verifyPinHash('135790', h)).toBe(true);
        expect(verifyPinHash('135791', h)).toBe(false);
        expect(verifyPinHash('135790', h.replace('scrypt', 'md5'))).toBe(false);
        expect(verifyPinHash('135790', 'scrypt$1$aa$bb')).toBe(false);
        expect(hashPin('135790')).not.toBe(h); // 每次不同的盐
    });
});

describe('CHG-05 · 比对 PIN（过渡期）', () => {
    it('旧明文 PIN：与 V1 相同的预设值（没存 PIN：老板 8888、其他 0000）', () => {
        expect(legacyPinOf({ id: '1', role: 'Owner (老板)' })).toBe('8888');
        expect(legacyPinOf(fresh)).toBe('0000');
        expect(checkPin(crew, null, '246810', true)).toEqual({ ok: true, mustChange: false, via: 'LEGACY' });
        expect(checkPin(crew, null, '000000', true)).toEqual({ ok: false });
    });
    it('预设 PIN（没存 PIN 或 0000）登录成功也必须先改 PIN', () => {
        expect(checkPin(fresh, null, '0000', true)).toEqual({ ok: true, mustChange: true, via: 'LEGACY' });
        expect(checkPin({ id: '1', role: 'Owner (老板)' }, null, '8888', true)).toMatchObject({ ok: true, mustChange: true });
        expect(checkPin({ ...crew, pin: '0000' }, null, '0000', true)).toMatchObject({ mustChange: true });
    });
    it('已有哈希就只认哈希；旧明文 PIN 不再有效', () => {
        const h = { pinHash: hashPin('112358') };
        expect(checkPin(crew, h, '112358', true)).toEqual({ ok: true, mustChange: false, via: 'HASH' });
        expect(checkPin(crew, h, '246810', true)).toEqual({ ok: false });
        // 临时 PIN（负责人发放）：对了也要先改
        expect(checkPin(crew, { ...h, mustChange: true }, '112358', true)).toEqual({ ok: true, mustChange: true, via: 'HASH' });
    });
    it('关闭 ACCEPT_LEGACY_PIN：没有哈希的人无法登录', () => {
        expect(checkPin(crew, null, '246810', false)).toEqual({ ok: false });
    });
    it('PIN 格式不对直接拒绝', () => {
        expect(checkPin(crew, null, '24a810', true)).toEqual({ ok: false });
        expect(checkPin(crew, null, '1234567', true)).toEqual({ ok: false });
    });
    it('新 PIN 规则', () => {
        expect(isAcceptableNewPin('135790')).toBe(true);
        expect(isAcceptableNewPin('000000')).toBe(false);
        expect(isAcceptableNewPin('888888')).toBe(false);
        expect(isAcceptableNewPin('123456')).toBe(false);
        expect(isAcceptableNewPin('1357')).toBe(false);
    });
});

describe('CHG-05 · claims 只看明确栏位', () => {
    it('没有 orgLevel 一律 CREW，不从职位名称推断；002 不再自动是系统管理员', () => {
        expect(claimsFor(owner, 1)).toEqual({ emp: '001', lvl: 'CREW', portal: null, ro: false, sa: false, epoch: 1 });
        expect(claimsFor({ id: '002', role: 'IT' }, 1).sa).toBe(false);
    });
    it('明确栏位照实带入；不认得的值不带入', () => {
        expect(claimsFor({ id: '9', orgLevel: 'OWNER', systemRole: 'SYSTEM_ADMIN', portalRoleOverride: 'MANAGEMENT', readOnlyAccess: true }, 2))
            .toEqual({ emp: '9', lvl: 'OWNER', portal: 'MANAGEMENT', ro: true, sa: true, epoch: 2 });
        expect(claimsFor({ id: '9', orgLevel: 'GOD', portalRoleOverride: 'ROOT' }, 1)).toMatchObject({ lvl: 'CREW', portal: null });
    });
});

describe('CHG-05 · 登录 ID 与尝试次数', () => {
    it('登录 ID 写法与 V1 相同（补零、ID 前缀、大小写）', () => {
        expect(candidateIds(' id7 ')).toEqual(['ID7', '7', '007', 'ID007']);
        expect(findEmployeeByLoginId([owner, crew], '1')?.id).toBe('001');
        expect(findEmployeeByLoginId([owner, crew], '7001')?.id).toBe('7001');
        expect(findEmployeeByLoginId([owner, crew], '99')).toBeUndefined();
    });
    it('15 分钟内连续错 5 次锁定 15 分钟；时间窗过后重新计算', () => {
        let s = null as ReturnType<typeof recordFailure> | null;
        const t0 = 1_000_000;
        for (let i = 0; i < 4; i++) s = recordFailure(s, t0 + i * 1000, LIMITS.login);
        expect(isLocked(s, t0 + 5000)).toBe(false);
        s = recordFailure(s, t0 + 5000, LIMITS.login);
        expect(isLocked(s, t0 + 6000)).toBe(true);
        expect(isLocked(s, t0 + 5000 + LIMITS.login.lockMs + 1)).toBe(false);
        const later = recordFailure(s, t0 + LIMITS.login.windowMs + 10_000, LIMITS.login);
        expect(later.failures).toBe(1);
    });
    it('同一员工不论 IP：1 小时错 20 次锁 1 小时', () => {
        let s = null as ReturnType<typeof recordFailure> | null;
        const t0 = 1_000_000;
        for (let i = 0; i < 19; i++) s = recordFailure(s, t0 + i * 60_000, LIMITS.loginEmployee);
        expect(isLocked(s, t0 + 19 * 60_000)).toBe(false);
        s = recordFailure(s, t0 + 19 * 60_000, LIMITS.loginEmployee);
        expect(isLocked(s, t0 + 20 * 60_000)).toBe(true);
        expect(isLocked(s, t0 + 19 * 60_000 + LIMITS.loginEmployee.lockMs + 1)).toBe(false);
    });
    it('一次性凭证：服务端只存杂凑', () => {
        const { token, id } = newOneTimeToken();
        expect(token.length).toBeGreaterThan(30);
        expect(oneTimeTokenId(token)).toBe(id);
        expect(id).not.toContain(token);
    });
});
