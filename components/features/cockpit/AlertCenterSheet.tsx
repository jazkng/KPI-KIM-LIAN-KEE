// ============================================================================
// 老板经营驾驶舱 · 预警中心（PR E1）
// 只读：每条预警附证据与计算方式，可跳到对应明细。
// 阈值只存在这台装置（localStorage），不写入资料库。
// 手机推送尚未开放：开关显示为停用，待负责人确认推送方案（FCM）后再做（PR E2）。
// ============================================================================
import React, { useState } from 'react';
import { AlertTriangle, BellOff, ChevronDown, ChevronRight, Settings2, X } from 'lucide-react';
import { DEFAULT_THRESHOLDS, type AlertCenter, type AlertTarget, type AlertThresholds, type CenterAlert } from '../../../utils/cockpit/alertRules';

interface Props {
    center: AlertCenter;
    periodLabel: string;
    payablesLoading: boolean;
    thresholds: AlertThresholds;
    onChangeThresholds: (t: AlertThresholds) => void;
    onOpenTarget: (target: AlertTarget) => void;
    onClose: () => void;
}

const LEVEL_STYLE: Record<CenterAlert['level'], string> = {
    HIGH: 'border-red-200 bg-red-50 text-red-900',
    NORMAL: 'border-amber-200 bg-amber-50 text-amber-900',
};

const TARGET_LABEL: Record<AlertTarget['kind'], string> = {
    kpi: '查看指标明细',
    labour: '打开人工效益分析',
    food: '打开食材成本分析',
    sim: '打开保本模拟器',
};

export const AlertCenterSheet: React.FC<Props> = ({ center, periodLabel, payablesLoading, thresholds, onChangeThresholds, onOpenTarget, onClose }) => {
    const [open, setOpen] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const high = center.alerts.filter(a => a.level === 'HIGH').length;

    return (
        <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
            <div
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-2xl"
                style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="预警中心"
            >
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black">预警中心</h3>
                        <p className="text-xs font-bold text-stone-500">
                            {periodLabel} · {center.alerts.length} 条预警{high ? `（高优先级 ${high}）` : ''} · 应付账款与薪资以今天为准
                        </p>
                    </div>
                    <button onClick={() => setShowSettings(v => !v)} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="预警设定" aria-pressed={showSettings}>
                        <Settings2 size={18} className="mx-auto" />
                    </button>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>

                {showSettings && <ThresholdSettings value={thresholds} onChange={onChangeThresholds} />}

                <div className="mt-3 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <BellOff size={18} className="shrink-0 text-stone-400" />
                    <div className="min-w-0 flex-1 text-xs">
                        <div className="font-black text-stone-700">手机推送通知</div>
                        <div className="text-stone-500">待负责人确认推送方案（FCM）后开放；目前只在打开驾驶舱时显示</div>
                    </div>
                    <label className="flex shrink-0 cursor-not-allowed items-center gap-2 opacity-50">
                        <input type="checkbox" disabled checked={false} readOnly className="h-5 w-5" aria-label="手机推送（尚未开放）" />
                        <span className="text-xs font-bold text-stone-500">停用</span>
                    </label>
                </div>

                {center.alerts.length === 0 && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                        目前没有触发的预警{payablesLoading ? '（应付账款仍在读取）' : ''}。
                    </div>
                )}

                <ul className="mt-3 space-y-2">
                    {center.alerts.map(a => {
                        const expanded = open === a.id;
                        return (
                            <li key={a.id} className={`rounded-xl border ${LEVEL_STYLE[a.level]}`}>
                                <button onClick={() => setOpen(expanded ? null : a.id)} className="flex w-full items-start gap-2 p-3 text-left text-sm" aria-expanded={expanded}>
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="mr-1 rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-bold">{a.category}</span>
                                        <span className="font-black">{a.level === 'HIGH' ? '高优先级 · ' : ''}{a.title}</span>
                                        <span className="block text-xs font-medium opacity-80">{a.detail}</span>
                                    </span>
                                    {expanded ? <ChevronDown size={16} className="mt-0.5 shrink-0 opacity-60" /> : <ChevronRight size={16} className="mt-0.5 shrink-0 opacity-60" />}
                                </button>
                                {expanded && (
                                    <div className="border-t border-black/5 px-3 pb-3 pt-2 text-xs text-stone-700">
                                        <div className="font-black text-stone-500">依据</div>
                                        <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed">
                                            {a.evidence.map((e, i) => <li key={i}>{e}</li>)}
                                        </ul>
                                        {a.target && (
                                            <button onClick={() => onOpenTarget(a.target!)} className="mt-2 min-h-[40px] rounded-lg bg-white px-3 text-xs font-black text-stone-800 shadow-sm">
                                                {TARGET_LABEL[a.target.kind]} ›
                                            </button>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {(center.skipped.length > 0 || payablesLoading) && (
                    <section className="mt-4">
                        <h4 className="text-xs font-black text-stone-500">未检查的规则</h4>
                        <ul className="mt-1 divide-y divide-stone-100 rounded-xl border border-stone-200 text-xs">
                            {payablesLoading && <li className="px-3 py-2 text-stone-500">应付账款到期：读取中…</li>}
                            {center.skipped.filter(s => !(payablesLoading && s.rule === '应付账款到期')).map(s => (
                                <li key={s.rule} className="flex gap-2 px-3 py-2">
                                    <span className="w-28 shrink-0 font-bold text-stone-700">{s.rule}</span>
                                    <span className="text-stone-500">{s.reason}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
                    预警只根据系统资料计算，不写入任何资料。人工、食材、OT 比例没有预设阈值，请按店里的目标在设定中填写后才会检查。
                </p>
            </div>
        </div>
    );
};

const ThresholdSettings: React.FC<{ value: AlertThresholds; onChange: (t: AlertThresholds) => void }> = ({ value, onChange }) => {
    const pctField = (key: 'labourRatioMax' | 'otShareMax' | 'foodRatioMax', label: string) => (
        <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="font-bold text-stone-700">{label}</span>
            <span className="flex items-center gap-1">
                <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="未设定"
                    value={value[key] === null ? '' : Math.round(value[key]! * 1000) / 10}
                    onChange={e => {
                        const n = e.target.value === '' ? null : Number(e.target.value) / 100;
                        onChange({ ...value, [key]: n !== null && n > 0 && n <= 1 ? n : null });
                    }}
                    className="min-h-[40px] w-24 rounded-lg border border-stone-300 px-2 text-right font-mono"
                    aria-label={label}
                />
                <span className="text-xs text-stone-500">%</span>
            </span>
        </label>
    );
    const intField = (key: 'revenueDropPct' | 'apDueSoonDays' | 'payrollPostByDay', label: string, unit: string, min: number, max: number) => (
        <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="font-bold text-stone-700">{label}</span>
            <span className="flex items-center gap-1">
                <input
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    value={value[key]}
                    onChange={e => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= min && n <= max) onChange({ ...value, [key]: n });
                    }}
                    className="min-h-[40px] w-24 rounded-lg border border-stone-300 px-2 text-right font-mono"
                    aria-label={label}
                />
                <span className="w-6 text-xs text-stone-500">{unit}</span>
            </span>
        </label>
    );
    return (
        <section className="mt-3 rounded-xl border border-stone-200 p-3" aria-label="预警设定">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-black">预警阈值</h4>
                <button onClick={() => onChange({ ...DEFAULT_THRESHOLDS })} className="min-h-[36px] rounded-lg px-2 text-xs font-bold text-stone-500 hover:bg-stone-100">恢复预设</button>
            </div>
            <div className="divide-y divide-stone-100">
                {intField('revenueDropPct', '近 7 天营业额下降超过', '%', 1, 100)}
                {pctField('labourRatioMax', '人工成本率高于')}
                {pctField('otShareMax', 'OT 占人工成本高于')}
                {pctField('foodRatioMax', '食材采购成本率高于')}
                {intField('apDueSoonDays', '应付账款提前提醒', '天', 1, 60)}
                {intField('payrollPostByDay', '每月几号后提醒薪资未过账', '号', 1, 28)}
            </div>
            <p className="mt-1 text-[11px] text-stone-500">只保存在这台装置，不写入资料库；留空 = 不检查。</p>
        </section>
    );
};
