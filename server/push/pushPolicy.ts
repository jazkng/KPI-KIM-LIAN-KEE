// ============================================================================
// 驾驶舱手机推送（PR E2a）· 推送规则（纯函数）
// ----------------------------------------------------------------------------
// - 只推「高优先级」预警
// - 同一条预警每天最多推一次（以营业日 + 预警编号去重）
// - 勿扰时段内不推（马来西亚时间，预设 22:30–08:00）
// - 推送文字只写条数与类别，不写金额、供应商或员工姓名（避免锁屏被旁人看到）
// ============================================================================
import crypto from 'crypto';
import type { CenterAlert, AlertThresholds } from '../../utils/cockpit/alertRules';
import { DEFAULT_THRESHOLDS, sanitizeThresholds } from '../../utils/cockpit/alertRules';

export interface PushSettings {
    enabled: boolean;
    thresholds: AlertThresholds;
    /** 勿扰时段（马来西亚时间，分钟数，0–1439）；起点大于终点表示跨午夜 */
    quietFromMin: number;
    quietToMin: number;
}

export const DEFAULT_PUSH_SETTINGS: PushSettings = {
    enabled: false,
    thresholds: { ...DEFAULT_THRESHOLDS },
    quietFromMin: 22 * 60 + 30,
    quietToMin: 8 * 60,
};

export const sanitizePushSettings = (raw: unknown): PushSettings => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const minute = (v: unknown, fallback: number) => {
        const n = Number(v);
        return v !== null && v !== '' && Number.isInteger(n) && n >= 0 && n < 1440 ? n : fallback;
    };
    return {
        enabled: r.enabled === true,
        thresholds: sanitizeThresholds(r.thresholds),
        quietFromMin: minute(r.quietFromMin, DEFAULT_PUSH_SETTINGS.quietFromMin),
        quietToMin: minute(r.quietToMin, DEFAULT_PUSH_SETTINGS.quietToMin),
    };
};

/** 马来西亚时间的「当天第几分钟」 */
export const malaysiaMinuteOfDay = (now: Date): number => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const [h, m] = parts.split(':').map(Number);
    return (h % 24) * 60 + m;
};

export const isQuietTime = (minuteOfDay: number, s: Pick<PushSettings, 'quietFromMin' | 'quietToMin'>) => {
    if (s.quietFromMin === s.quietToMin) return false;
    return s.quietFromMin < s.quietToMin
        ? minuteOfDay >= s.quietFromMin && minuteOfDay < s.quietToMin
        : minuteOfDay >= s.quietFromMin || minuteOfDay < s.quietToMin;
};

/** 推送纪录的文件编号：营业日 + 预警编号的杂凑（预警编号含中文与符号，不直接当文件编号） */
export const alertLogId = (businessDate: string, alertId: string) =>
    `${businessDate}_${crypto.createHash('sha256').update(alertId).digest('hex').slice(0, 16)}`;

export type PushDecision =
    | { send: false; reason: 'disabled' | 'quiet' | 'none' | 'already-sent'; candidates: number }
    | { send: true; alerts: CenterAlert[]; message: PushMessage };

export interface PushMessage {
    title: string;
    body: string;
    link: string;
}

export const buildPushMessage = (alerts: CenterAlert[]): PushMessage => {
    const categories = Array.from(new Set(alerts.map(a => a.category)));
    return {
        title: '金莲记 ERP',
        body: `${alerts.length} 条高优先级预警（${categories.join('、')}），请打开驾驶舱查看`,
        link: '/?portal=boss',
    };
};

export const decidePush = (input: {
    settings: PushSettings;
    alerts: CenterAlert[];
    alreadySentLogIds: Set<string>;
    businessDate: string;
    now: Date;
}): PushDecision => {
    const high = input.alerts.filter(a => a.level === 'HIGH');
    if (!input.settings.enabled) return { send: false, reason: 'disabled', candidates: high.length };
    if (isQuietTime(malaysiaMinuteOfDay(input.now), input.settings)) return { send: false, reason: 'quiet', candidates: high.length };
    if (high.length === 0) return { send: false, reason: 'none', candidates: 0 };
    const fresh = high.filter(a => !input.alreadySentLogIds.has(alertLogId(input.businessDate, a.id)));
    if (fresh.length === 0) return { send: false, reason: 'already-sent', candidates: high.length };
    return { send: true, alerts: fresh, message: buildPushMessage(fresh) };
};

/** FCM token 的格式检查（避免把任意字串存进资料库） */
export const isPlausibleFcmToken = (token: unknown): token is string =>
    typeof token === 'string' && token.length >= 100 && token.length <= 4096 && /^[A-Za-z0-9_:\-]+$/.test(token);

export const deviceIdOf = (token: string) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
