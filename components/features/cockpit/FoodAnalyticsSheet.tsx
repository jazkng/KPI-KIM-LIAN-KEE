// ============================================================================
// 老板经营驾驶舱 · 食材成本双轨分析（PR C2）
// 只读：打开时才读取近 6 个月采购、库存、盘点记录与价格历史。
// 采购口径（财务报表）保留不变；耗用成本资料不足时只标示与预估，不冒充实际。
// ============================================================================
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { CockpitResult } from '../../../utils/cockpit/cockpitMetrics';
import type { FoodAnalytics } from '../../../utils/cockpit/foodAnalytics';
import { loadFoodAnalytics } from '../../../utils/cockpit/loadFoodAnalytics';

const rm = (n: number) => `${n < 0 ? '−' : ''}RM ${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);

export const FoodAnalyticsSheet: React.FC<{ result: CockpitResult; onClose: () => void }> = ({ result, onClose }) => {
    const [data, setData] = useState<FoodAnalytics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        loadFoodAnalytics(result)
            .then(d => alive && setData(d))
            .catch(e => alive && setError(`读取资料失败：${(e as Error).message}`));
        return () => { alive = false; };
    }, [result]);

    return (
        <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
            <div
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-2xl"
                style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="食材成本分析"
            >
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black">食材成本分析</h3>
                        <p className="text-xs font-bold text-stone-500">{result.period.label} · 采购口径与耗用口径分开，只读</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>

                {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
                {!data && !error && <div className="mt-6 flex items-center gap-2 text-sm font-bold text-stone-500"><Loader2 size={16} className="animate-spin" /> 读取采购、库存与价格资料…</div>}

                {data && (
                    <div className="mt-3 space-y-5">
                        {data.alerts.length > 0 && (
                            <ul className="space-y-2">
                                {data.alerts.map(a => (
                                    <li key={a.title} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                                        <div className="flex items-center gap-1 font-black text-amber-900"><AlertTriangle size={14} /> {a.title}</div>
                                        <div className="mt-0.5 text-stone-700">{a.detail}</div>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <section className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-stone-200 p-3">
                                <div className="text-xs font-bold text-stone-500">采购支出（财务报表口径）</div>
                                <div className="mt-1 font-mono text-base font-black">{rm(data.purchase.amount)}</div>
                                <div className="text-xs text-stone-500">采购成本率 {pct(data.purchase.ratio)}</div>
                            </div>
                            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                                <div className="text-xs font-bold text-stone-500">实际耗用成本</div>
                                <div className="mt-1 text-sm font-black text-red-700">资料不完整</div>
                                <div className="text-xs text-stone-600">预估 {data.consumption.estimate === null ? '—' : rm(data.consumption.estimate)}</div>
                            </div>
                        </section>
                        <div className="space-y-1 text-xs leading-relaxed text-stone-600">
                            <p><b>为何资料不完整：</b>{data.consumption.reason}</p>
                            <p><b>预估依据：</b>{data.consumption.estimateBasis}</p>
                            <p>采购付款、入库与耗用是不同概念；利润中只扣一次采购金额，这里的预估不会再扣。</p>
                        </div>

                        <section>
                            <h4 className="text-sm font-black">采购成本率走势（近 6 个月）</h4>
                            <div className="mt-1 overflow-x-auto rounded-xl border border-stone-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left">月份</th><th className="text-right">营业额</th><th className="text-right">食材采购</th><th className="text-right">成本率</th><th className="px-3 text-right">日结</th></tr></thead>
                                    <tbody>
                                        {data.trend.map(t => (
                                            <tr key={t.month} className="border-t border-stone-100">
                                                <td className="px-3 py-2 font-mono">{t.month}</td>
                                                <td className="text-right font-mono">{rm(t.revenue)}</td>
                                                <td className="text-right font-mono">{rm(t.food)}</td>
                                                <td className="text-right font-mono">{pct(t.ratio)}</td>
                                                <td className="px-3 text-right text-xs">{t.complete ? '齐全' : <span className="font-bold text-amber-700">不齐</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">本期采购分类</h4>
                            <div className="mt-1 divide-y divide-stone-100 rounded-xl border border-stone-200">
                                {data.purchase.byCategory.length === 0 && <div className="px-3 py-2 text-sm text-stone-500">没有采购记录</div>}
                                {data.purchase.byCategory.map(r => (
                                    <div key={r.label} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="truncate">{r.label}</span><span className="font-mono font-bold">{rm(r.amount)}</span></div>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">目前库存价值 {rm(data.inventoryNow.total)}</h4>
                            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {data.inventoryNow.byType.map(t => (
                                    <div key={t.type} className="rounded-xl border border-stone-200 p-2">
                                        <div className="text-xs font-bold text-stone-500">{t.type} · {t.items} 项</div>
                                        <div className="font-mono text-sm font-black">{rm(t.value)}</div>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-1 text-[11px] text-stone-500">数量 × 每基础单位成本（与财务报表相同算法），只代表现在这一刻，没有历史期初 / 期末值。</p>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">盘点差异（本期 {data.countVariance.logs} 次盘点）</h4>
                            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-xl border border-stone-200 p-2"><div className="text-xs text-stone-500">减少</div><div className="font-mono text-sm font-black text-red-700">{rm(data.countVariance.loss)}</div></div>
                                <div className="rounded-xl border border-stone-200 p-2"><div className="text-xs text-stone-500">增加</div><div className="font-mono text-sm font-black">{rm(data.countVariance.gain)}</div></div>
                                <div className="rounded-xl border border-stone-200 p-2"><div className="text-xs text-stone-500">净额</div><div className="font-mono text-sm font-black">{rm(data.countVariance.net)}</div></div>
                            </div>
                            <p className="mt-1 text-[11px] text-stone-500">{data.countVariance.note}</p>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">品项成本变化（近 90 天）</h4>
                            {data.priceChanges.length === 0 ? (
                                <p className="mt-1 text-sm text-stone-500">近 90 天没有价格变化记录</p>
                            ) : (
                                <div className="mt-1 divide-y divide-stone-100 rounded-xl border border-stone-200">
                                    {data.priceChanges.slice(0, 15).map(p => (
                                        <div key={p.stockId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                            <span className="min-w-0 truncate">{p.name}</span>
                                            <span className="shrink-0 font-mono text-xs text-stone-500">{p.from.toFixed(4)} → {p.to.toFixed(4)}</span>
                                            <span className={`w-16 shrink-0 text-right font-mono font-bold ${p.changePct > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{p.changePct > 0 ? '+' : ''}{p.changePct.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="mt-1 text-[11px] text-stone-500">{data.priceNote}</p>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};
