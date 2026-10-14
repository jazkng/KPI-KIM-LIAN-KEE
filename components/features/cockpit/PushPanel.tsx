// ============================================================================
// 预警中心 · 手机推送设定（PR E2a）
// 打开时只读取状态；开启 / 关闭 / 更新阈值都要老板按按钮才写入（经服务端）。
// 服务端未开通时整块停用，并说明原因。
// ============================================================================
import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import type { AlertThresholds } from '../../../utils/cockpit/alertRules';
import {
    checkPushAvailability, disableThisDevice, enableThisDevice, getServerPushSettings, isThisDeviceRegistered, saveServerPushSettings,
    type PushAvailability, type PushServerSettings,
} from '../../../utils/push/pushClient';

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const sameThresholds = (a: AlertThresholds, b: AlertThresholds) =>
    (Object.keys(a) as (keyof AlertThresholds)[]).every(k => a[k] === b[k]);

export const PushPanel: React.FC<{ thresholds: AlertThresholds }> = ({ thresholds }) => {
    const [avail, setAvail] = useState<PushAvailability | null>(null);
    const [registered, setRegistered] = useState<boolean | null>(null);
    const [settings, setSettings] = useState<PushServerSettings | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            const a = await checkPushAvailability();
            if (!alive) return;
            setAvail(a);
            if (!a.ok) return;
            try {
                const [r, s] = await Promise.all([isThisDeviceRegistered(), getServerPushSettings()]);
                if (alive) { setRegistered(r); setSettings(s); }
            } catch (e) {
                if (alive) setError((e as Error).message);
            }
        })();
        return () => { alive = false; };
    }, []);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };

    if (!avail || !avail.ok) {
        return (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3" aria-label="手机推送">
                <BellOff size={18} className="shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1 text-xs">
                    <div className="font-black text-stone-700">手机推送通知</div>
                    <div className="text-stone-500">{avail ? (avail as { reason: string }).reason : '检查中…'}</div>
                </div>
                <label className="flex shrink-0 cursor-not-allowed items-center gap-2 opacity-50">
                    <input type="checkbox" disabled checked={false} readOnly className="h-5 w-5" aria-label="手机推送（尚未开放）" />
                    <span className="text-xs font-bold text-stone-500">停用</span>
                </label>
            </div>
        );
    }

    const thresholdsSynced = settings ? sameThresholds(settings.thresholds, thresholds) : true;
    return (
        <section className="mt-3 rounded-xl border border-stone-200 p-3 text-sm" aria-label="手机推送">
            <div className="flex items-center gap-2">
                <Bell size={16} className="text-stone-600" />
                <h4 className="flex-1 font-black">手机推送通知</h4>
                {busy && <Loader2 size={14} className="animate-spin text-stone-400" />}
            </div>
            {error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">{error}</div>}

            <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs">
                    <div className="font-bold text-stone-700">这台装置</div>
                    <div className="text-stone-500">{registered === null ? '读取中…' : registered ? '已开启，会收到推送' : '未开启'}</div>
                </div>
                <button
                    disabled={busy || registered === null}
                    onClick={() => run(async () => {
                        if (registered) await disableThisDevice(); else await enableThisDevice();
                        setRegistered(!registered);
                    })}
                    className={`min-h-[40px] shrink-0 rounded-lg px-3 text-xs font-black disabled:opacity-40 ${registered ? 'border border-stone-300 text-stone-700' : 'bg-stone-900 text-white'}`}
                >
                    {registered ? '在这台装置关闭' : '在这台装置开启'}
                </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-stone-100 pt-2">
                <div className="text-xs">
                    <div className="font-bold text-stone-700">推送总开关（所有装置）</div>
                    <div className="text-stone-500">{settings ? (settings.enabled ? '开启' : '关闭') : '读取中…'} · 勿扰 {settings ? `${hhmm(settings.quietFromMin)}–${hhmm(settings.quietToMin)}` : '—'}（马来西亚时间）</div>
                </div>
                <button
                    disabled={busy || !settings}
                    onClick={() => run(async () => setSettings(await saveServerPushSettings({ ...settings!, enabled: !settings!.enabled, thresholds })))}
                    className="min-h-[40px] shrink-0 rounded-lg border border-stone-300 px-3 text-xs font-black text-stone-700 disabled:opacity-40"
                >
                    {settings?.enabled ? '关闭总开关' : '开启总开关'}
                </button>
            </div>

            {settings && !thresholdsSynced && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-2 text-xs">
                    <span className="text-amber-900">推送使用的阈值与本机设定不同</span>
                    <button
                        disabled={busy}
                        onClick={() => run(async () => setSettings(await saveServerPushSettings({ ...settings, thresholds })))}
                        className="min-h-[36px] shrink-0 rounded-lg bg-amber-600 px-2 font-black text-white disabled:opacity-40"
                    >
                        以本机设定更新
                    </button>
                </div>
            )}
            <p className="mt-2 text-[11px] text-stone-500">只推高优先级预警；同一条每天最多一次。通知只显示条数与类别，不显示金额。</p>
        </section>
    );
};
