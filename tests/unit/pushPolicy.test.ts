import { describe, expect, it } from 'vitest';
import {
    alertLogId, buildPushMessage, decidePush, DEFAULT_PUSH_SETTINGS, deviceIdOf, isPlausibleFcmToken, isQuietTime, malaysiaMinuteOfDay, sanitizePushSettings,
} from '../../server/push/pushPolicy';
import type { CenterAlert } from '../../utils/cockpit/alertRules';

const alert = (id: string, level: CenterAlert['level'], category: CenterAlert['category'], title: string): CenterAlert =>
    ({ id, level, category, title, detail: 'RM 1,200.00', evidence: ['虚构鱼贩：RM 1,200.00'] });

const alerts = [
    alert('ap-overdue', 'HIGH', '应付账款', '1 笔应付账款已逾期'),
    alert('revenue-drop', 'HIGH', '营业额', '近 7 天营业额下降 39.9%'),
    alert('ap-due-soon', 'NORMAL', '应付账款', '2 笔应付账款 7 天内到期'),
];
const on = { ...DEFAULT_PUSH_SETTINGS, enabled: true };
// 2026-10-14 10:00 马来西亚时间 = 02:00 UTC
const morning = new Date('2026-10-14T02:00:00Z');

describe('手机推送规则（纯函数）', () => {
    it('只推高优先级；讯息只写条数与类别，不含金额、供应商', () => {
        const d = decidePush({ settings: on, alerts, alreadySentLogIds: new Set(), businessDate: '2026-10-14', now: morning });
        expect(d.send).toBe(true);
        if ('message' in d) {
            expect(d.alerts.map(a => a.id)).toEqual(['ap-overdue', 'revenue-drop']);
            expect(d.message.body).toBe('2 条高优先级预警（应付账款、营业额），请打开驾驶舱查看');
            expect(d.message.body).not.toMatch(/RM|\d+\.\d|鱼贩/);
        }
    });
    it('同一条预警同一营业日只推一次；第二天可再推', () => {
        const sent = new Set([alertLogId('2026-10-14', 'ap-overdue'), alertLogId('2026-10-14', 'revenue-drop')]);
        expect(decidePush({ settings: on, alerts, alreadySentLogIds: sent, businessDate: '2026-10-14', now: morning })).toMatchObject({ send: false, reason: 'already-sent' });
        const partial = new Set([alertLogId('2026-10-14', 'ap-overdue')]);
        const d = decidePush({ settings: on, alerts, alreadySentLogIds: partial, businessDate: '2026-10-14', now: morning });
        expect('alerts' in d && d.alerts.map(a => a.id)).toEqual(['revenue-drop']);
        expect(decidePush({ settings: on, alerts, alreadySentLogIds: sent, businessDate: '2026-10-15', now: morning }).send).toBe(true);
    });
    it('总开关关闭、勿扰时段、没有高优先级 → 不推', () => {
        expect(decidePush({ settings: DEFAULT_PUSH_SETTINGS, alerts, alreadySentLogIds: new Set(), businessDate: '2026-10-14', now: morning })).toMatchObject({ send: false, reason: 'disabled' });
        // 23:00 马来西亚时间 = 15:00 UTC
        expect(decidePush({ settings: on, alerts, alreadySentLogIds: new Set(), businessDate: '2026-10-14', now: new Date('2026-10-14T15:00:00Z') })).toMatchObject({ send: false, reason: 'quiet' });
        expect(decidePush({ settings: on, alerts: [alerts[2]], alreadySentLogIds: new Set(), businessDate: '2026-10-14', now: morning })).toMatchObject({ send: false, reason: 'none' });
    });
    it('勿扰时段：跨午夜与同日两种设定', () => {
        expect(malaysiaMinuteOfDay(new Date('2026-10-14T15:00:00Z'))).toBe(23 * 60);
        expect(isQuietTime(7 * 60 + 59, DEFAULT_PUSH_SETTINGS)).toBe(true);
        expect(isQuietTime(8 * 60, DEFAULT_PUSH_SETTINGS)).toBe(false);
        expect(isQuietTime(13 * 60, { quietFromMin: 12 * 60, quietToMin: 14 * 60 })).toBe(true);
        expect(isQuietTime(13 * 60, { quietFromMin: 0, quietToMin: 0 })).toBe(false);
    });
    it('设定清理：不合理的值回到预设，开关必须明确为 true', () => {
        const s = sanitizePushSettings({ enabled: 'yes', quietFromMin: 2000, quietToMin: 7.5, thresholds: { revenueDropPct: 20, foodRatioMax: 0.3 } });
        expect(s.enabled).toBe(false);
        expect(s.quietFromMin).toBe(DEFAULT_PUSH_SETTINGS.quietFromMin);
        expect(s.quietToMin).toBe(DEFAULT_PUSH_SETTINGS.quietToMin);
        expect(s.thresholds.revenueDropPct).toBe(20);
        expect(s.thresholds.foodRatioMax).toBe(0.3);
    });
    it('FCM 凭证格式检查与装置编号（同一凭证 → 同一编号）', () => {
        const token = `abc:${'A'.repeat(140)}`;
        expect(isPlausibleFcmToken(token)).toBe(true);
        expect(isPlausibleFcmToken('short')).toBe(false);
        expect(isPlausibleFcmToken(`${'A'.repeat(140)}/../x`)).toBe(false);
        expect(deviceIdOf(token)).toBe(deviceIdOf(token));
        expect(deviceIdOf(token)).toHaveLength(32);
    });
    it('推送纪录编号：营业日 + 杂凑，不含中文与斜线', () => {
        expect(alertLogId('2026-10-14', 'base:revenue:有营业日未提交日结')).toMatch(/^2026-10-14_[0-9a-f]{16}$/);
        expect(buildPushMessage([alerts[0]]).link).toBe('/?portal=boss');
    });
});
