// ============================================================================
// 老板经营驾驶舱 · 保本模拟器（PR D）
// 只做模拟：参数只存在这个画面的记忆体，关闭即消失，不会写回任何账目或设定。
// ============================================================================
import React, { useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { MonthBaseline } from '../../../utils/cockpit/cockpitMetrics';
import { baselineParams, simulate, type SimParams } from '../../../utils/cockpit/breakEvenSim';

const rm = (n: number) => `${n < 0 ? '−' : ''}RM ${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

type Field = { key: keyof SimParams; label: string; kind: 'RM' | 'PCT' | 'INT'; step: number };
const FIELDS: Field[] = [
    { key: 'monthlyRevenue', label: '每月营业额', kind: 'RM', step: 1000 },
    { key: 'labourExOt', label: '人工成本（不含 OT）', kind: 'RM', step: 500 },
    { key: 'staffDelta', label: '员工人数增减', kind: 'INT', step: 1 },
    { key: 'ot', label: 'OT 成本', kind: 'RM', step: 100 },
    { key: 'foodRate', label: '食材成本率', kind: 'PCT', step: 0.005 },
    { key: 'platformRate', label: '平台佣金 / 变动费率', kind: 'PCT', step: 0.005 },
    { key: 'rent', label: '租金', kind: 'RM', step: 500 },
    { key: 'otherFixed', label: '其他固定费用', kind: 'RM', step: 500 },
    { key: 'operatingDays', label: '营业天数', kind: 'INT', step: 1 },
];

export const BreakEvenSimSheet: React.FC<{ baseline: MonthBaseline; onClose: () => void }> = ({ baseline, onClose }) => {
    const initial = useMemo(() => baselineParams(baseline), [baseline]);
    const [params, setParams] = useState<SimParams>(initial);
    const perHead = baseline.headcount > 0 ? baseline.labourExOt / baseline.headcount : 0;
    const actual = useMemo(() => simulate(initial, perHead), [initial, perHead]);
    const sim = useMemo(() => simulate(params, perHead), [params, perHead]);
    const changed = FIELDS.some(f => params[f.key] !== initial[f.key]);

    const show = (f: Field, v: number) => (f.kind === 'PCT' ? `${(v * 100).toFixed(1)}%` : f.kind === 'RM' ? rm(v) : String(v));
    const setField = (f: Field, raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        setParams(p => ({ ...p, [f.key]: f.kind === 'PCT' ? n / 100 : n }));
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
            <div
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-2xl"
                style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="保本模拟器"
            >
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black">保本模拟器</h3>
                        <p className="text-xs font-bold text-stone-500">起点：{baseline.month} 实际结构（{baseline.settledDays}/{baseline.daysInMonth} 天日结，营业额按日均推估整月）</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-bold text-sky-900">
                    只供模拟：调整的数字不会保存，也不会写回营业额、薪资、采购或财务记录。
                </div>

                <section className="mt-3 grid grid-cols-2 gap-2">
                    <Result label="模拟月利润" value={rm(sim.profit)} base={rm(actual.profit)} negative={sim.profit < 0} />
                    <Result label="每月保本营业额" value={sim.breakEvenMonthly === null ? '无法保本' : rm(sim.breakEvenMonthly)} base={actual.breakEvenMonthly === null ? '—' : rm(actual.breakEvenMonthly)} />
                    <Result label="每日保本营业额" value={sim.breakEvenDaily === null ? '—' : rm(sim.breakEvenDaily)} base={actual.breakEvenDaily === null ? '—' : rm(actual.breakEvenDaily)} />
                    <Result label="与保本的差额" value={sim.gapToBreakEven === null ? '—' : rm(sim.gapToBreakEven)} base={actual.gapToBreakEven === null ? '—' : rm(actual.gapToBreakEven)} negative={(sim.gapToBreakEven ?? 0) < 0} />
                </section>
                <ul className="mt-2 space-y-1 text-xs text-stone-600">
                    <li>固定成本 {rm(sim.fixed)} · 变动成本率 {(sim.variableRate * 100).toFixed(1)}% · 日均营业额 {rm(sim.dailyRevenue)}</li>
                    {sim.foodRateSensitivity !== null && <li>食材成本率每上升 1 个百分点，保本营业额增加约 {rm(sim.foodRateSensitivity)}</li>}
                    <li>如果每天多做 RM 500，月底利润约增加 {rm(sim.plus500PerDay)}</li>
                </ul>

                <section className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black">调整参数</h4>
                        <button
                            onClick={() => setParams(initial)}
                            disabled={!changed}
                            className="flex min-h-[40px] items-center gap-1 rounded-xl border border-stone-300 px-3 text-xs font-black text-stone-700 disabled:opacity-40"
                        >
                            <RotateCcw size={14} /> 恢复实际数据
                        </button>
                    </div>
                    {FIELDS.map(f => (
                        <label key={f.key} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2">
                            <span className="min-w-0 flex-1 text-sm font-bold">
                                {f.label}
                                <span className="block text-[11px] font-medium text-stone-400">实际 {show(f, initial[f.key])}{f.key === 'staffDelta' && perHead > 0 ? `（人均 ${rm(perHead)}）` : ''}</span>
                            </span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step={f.kind === 'PCT' ? f.step * 100 : f.step}
                                value={f.kind === 'PCT' ? Number((params[f.key] * 100).toFixed(2)) : params[f.key]}
                                onChange={e => setField(f, e.target.value)}
                                className={`min-h-[44px] w-32 rounded-lg border px-2 text-right font-mono text-base ${params[f.key] !== initial[f.key] ? 'border-amber-400 bg-amber-50' : 'border-stone-300'}`}
                                aria-label={f.label}
                            />
                            <span className="w-6 text-xs text-stone-500">{f.kind === 'PCT' ? '%' : f.kind === 'INT' ? '' : 'RM'}</span>
                        </label>
                    ))}
                </section>
                <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
                    固定成本 = 人工（含增减人数 × 人均人工成本）+ OT + 租金 + 其他固定费用；变动成本率 = 食材成本率 + 平台费率；
                    保本营业额 = 固定成本 ÷（1 − 变动成本率）。起点数字全部来自本月实际资料，不使用预设比例。
                </p>
            </div>
        </div>
    );
};

const Result: React.FC<{ label: string; value: string; base: string; negative?: boolean }> = ({ label, value, base, negative }) => (
    <div className="rounded-xl border border-stone-200 p-3">
        <div className="text-xs font-bold text-stone-500">{label}</div>
        <div className={`mt-1 font-mono text-lg font-black ${negative ? 'text-red-700' : ''}`}>{value}</div>
        <div className="text-[11px] text-stone-400">实际：{base}</div>
    </div>
);
