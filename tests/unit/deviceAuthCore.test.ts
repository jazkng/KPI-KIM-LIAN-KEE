import { describe, expect, it } from 'vitest';
import {
    canPerform, deviceDocId, isValidDevicePin, legacyDevicePinCredential, newDeviceSession, normalizeDeviceCode, verifyLegacyDevicePin,
} from '../../server/auth/authCore';
import crypto from 'crypto';

/** 与 V1 utils/deviceAccountService.ts 相同的浏览器端算法（WebCrypto PBKDF2-SHA256, 256 bits） */
const browserCredential = async (pin: string) => {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120_000 }, key, 256);
    return { pinHash: Buffer.from(bits).toString('base64'), pinSalt: Buffer.from(salt).toString('base64'), pinIterations: 120_000 };
};

describe('CHG-05b · 设备 PIN 与 V1 格式相容', () => {
    it('服务端能验证 V1 浏览器建立的设备 PIN', async () => {
        const rec = await browserCredential('4321');
        expect(verifyLegacyDevicePin('4321', rec)).toBe(true);
        expect(verifyLegacyDevicePin('4322', rec)).toBe(false);
    });
    it('服务端写回的旧格式，V1 浏览器算法也能验证（同步写回不会让 V1 设备登录失败）', async () => {
        const rec = legacyDevicePinCredential('87654321');
        const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode('87654321'), 'PBKDF2', false, ['deriveBits']);
        const bits = await globalThis.crypto.subtle.deriveBits(
            { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(rec.pinSalt, 'base64'), iterations: rec.pinIterations }, key, 256);
        expect(Buffer.from(bits).toString('base64')).toBe(rec.pinHash);
    });
    it('格式不对、缺栏位、迭代次数异常一律不通过', () => {
        const rec = legacyDevicePinCredential('1234');
        expect(verifyLegacyDevicePin('12a4', rec)).toBe(false);
        expect(verifyLegacyDevicePin('1234', { ...rec, pinSalt: undefined })).toBe(false);
        expect(verifyLegacyDevicePin('1234', { ...rec, pinIterations: 1 })).toBe(false);
    });
    it('会话凭证：资料库存的是 SHA-256（与 V1 validateSession 相同算法）', () => {
        const s = newDeviceSession();
        expect(crypto.createHash('sha256').update(s.sessionToken).digest('base64')).toBe(s.sessionHash);
    });
    it('设备编号与 PIN 格式（与 V1 相同）', () => {
        expect(normalizeDeviceCode(' kitchen-01 ')).toBe('KITCHEN-01');
        expect(normalizeDeviceCode('a')).toBeNull();
        expect(deviceDocId('KITCHEN-01')).toBe('device_kitchen-01');
        expect(isValidDevicePin('1234')).toBe(true);
        expect(isValidDevicePin('123')).toBe(false);
    });
});

describe('CHG-05b · 服务端操作权限（与 V1 画面的进入条件一致）', () => {
    it('设备户口：老板入口或有 HR_FILES 权限', () => {
        expect(canPerform({ portal: 'BOSS', active: true }, 'DEVICE_ADMIN')).toBe(true);
        expect(canPerform({ portal: 'STAFF', allowedModules: ['HR_FILES'], active: true }, 'DEVICE_ADMIN')).toBe(true);
        expect(canPerform({ portal: 'MANAGEMENT', allowedModules: ['ROSTER'], active: true }, 'DEVICE_ADMIN')).toBe(false);
    });
    it('PIN 二次确认：老板 / 管理层，或有考勤主控台、排班权限', () => {
        expect(canPerform({ portal: 'MANAGEMENT', active: true }, 'VERIFY_PIN')).toBe(true);
        expect(canPerform({ portal: 'STAFF', allowedModules: ['ATTENDANCE_CONSOLE'], active: true }, 'VERIFY_PIN')).toBe(true);
        expect(canPerform({ portal: 'STAFF', allowedModules: ['SETTLEMENT'], active: true }, 'VERIFY_PIN')).toBe(false);
    });
    it('离职或封存的员工一律没有权限', () => {
        expect(canPerform({ portal: 'BOSS', active: false }, 'DEVICE_ADMIN')).toBe(false);
    });
});
