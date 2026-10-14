// ============================================================================
// 老板经营驾驶舱 · 人工效益分析（PR C1）
// 只读：打开时才读取期间的打卡工时（V1 attendance，只读），其余资料沿用驾驶舱已读取的内容。
// 只提出排班建议，不修改班表、OT 或薪资。
// ============================================================================
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { AttendanceRecord } from '../../../types';
import { DataManager } from '../../../utils/dataManager';
import type { CockpitResult } from '../../../utils/cockpit/cockpitMetrics';
import { buildLabourAnalytics, type LabourAnalytics } from '../../../utils/cockpit/labourAnalytics';

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DEPT_LABEL: Record<string, string> = { KITCHEN: '厨房', FLOOR: '楼面', BAR: '水吧', DISHWASH: '洗碗', BACK_OFFICE: '办公室', OWNER: '老板', OTHER: '其他' };

export const LabourAnalyticsSheet: React.FC<{ result: CockpitResult; onClose: () => void }> = ({ result, onClose }) => {
    const [data, setData] = useState<LabourAnalytics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const ctx = result.context;
        if (!ctx) { setError('缺少人工资料，请重新整理驾驶舱'); return; }
        Promise.all(result.period.months.map(m => DataManager.getAttendanceByMonth(m).catch(() => [] as AttendanceRecord[])))
            .then(lists => {
                if (!alive) return;
                setData(buildLabourAnalytics({
                    period: result.period,
                    dailyRevenue: result.extras.dailyRevenue,
                    grossProfit: result.extras.grossProfit,
                    labourByMonth: ctx.labourByMonth.filter(l => result.period.months.includes(l.month)),
                    otherLabour: result.extras.otherLabour,
                    partTime: result.extras.partTime,
                    attendance: lists.flat(),
                    employees: ctx.employees,
                    payrollRecords: ctx.payrollRecords,
                    trendEndMonth: result.period.end.slice(0, 7),
                }));
            })
            .catch(e => alive && setError(`读取打卡资料失败：${(e as Error).message}`));
        return () => { alive = false; };
    }, [result]);

    return (
        <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
            <div
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-2xl"
                style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="人工效益分析"
            >
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black">人工效益分析</h3>
                        <p className="text-xs font-bold text-stone-500">{result.period.label} · 只读分析，只提建议，不修改班表 / OT / 薪资</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>

                {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
                {!data && !error && <div className="mt-6 flex items-center gap-2 text-sm font-bold text-stone-500"><Loader2 size={16} className="animate-spin" /> 读取打卡工时…</div>}

                {data && (
                    <div className="mt-3 space-y-5">
                        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Metric label="每工时营业额" value={data.revenuePerHour === null ? '资料不足' : rm(data.revenuePerHour)} />
                            <Metric label="每工时毛利贡献" value={data.grossProfitPerHour === null ? '资料不足' : rm(data.grossProfitPerHour)} />
                            <Metric label="每工时人工成本" value={data.labourCostPerHour === null ? '资料不足' : rm(data.labourCostPerHour)} />
                            <Metric label="打卡工时 / 人数" value={`${data.hours.toFixed(0)} 小时 · ${data.headcount} 人`} />
                        </section>
                        <p className={`text-xs ${data.hoursStatus === 'OK' ? 'text-stone-500' : 'font-bold text-amber-700'}`}>{data.hoursNote}。工时来源：员工打卡记录（attendance）。</p>

                        <section>
                            <h4 className="text-sm font-black">人工成本组成（雇主总成本 {rm(data.labourCost)}）</h4>
                            <div className="mt-1 divide-y divide-stone-100 rounded-xl border border-stone-200">
                                {data.composition.map(r => (
                                    <div key={r.label} className="flex justify-between gap-3 px-3 py-2 text-sm">
                                        <span>{r.label}</span><span className="font-mono font-bold">{rm(r.amount)}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-1 text-[11px] text-stone-500">员工净实领 ≠ 雇主总成本；未发薪的月份按底薪与现有法定供款推算，非整月期间按天数分摊。</p>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">部门</h4>
                            <div className="mt-1 overflow-x-auto rounded-xl border border-stone-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left">部门</th><th className="text-right">人工成本</th><th className="text-right">占比</th><th className="text-right">工时</th><th className="px-3 text-right">人数</th></tr></thead>
                                    <tbody>
                                        {data.byDept.map(d => (
                                            <tr key={d.dept} className="border-t border-stone-100">
                                                <td className="px-3 py-2">{DEPT_LABEL[d.dept] || d.dept}</td>
                                                <td className="text-right font-mono">{rm(d.cost)}</td>
                                                <td className="text-right font-mono">{(d.costShare * 100).toFixed(0)}%</td>
                                                <td className="text-right font-mono">{d.hours.toFixed(0)}</td>
                                                <td className="px-3 text-right font-mono">{d.headcount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">星期别（期间内已日结的日子）</h4>
                            <div className="mt-1 overflow-x-auto rounded-xl border border-stone-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left">星期</th><th className="text-right">天数</th><th className="text-right">平均营业额</th><th className="text-right">平均工时</th><th className="px-3 text-right">每工时营业额</th></tr></thead>
                                    <tbody>
                                        {data.byWeekday.map(w => (
                                            <tr key={w.weekday} className="border-t border-stone-100">
                                                <td className="px-3 py-2">{w.weekday}</td>
                                                <td className="text-right font-mono">{w.days}</td>
                                                <td className="text-right font-mono">{rm(w.avgRevenue)}</td>
                                                <td className="text-right font-mono">{w.avgHours.toFixed(1)}</td>
                                                <td className="px-3 text-right font-mono">{w.revenuePerHour === null ? '—' : rm(w.revenuePerHour)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-sm font-black">OT 成本（近 6 个月薪资记录）</h4>
                            <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
                                {data.otTrend.map(t => (
                                    <div key={t.month} className="rounded-xl border border-stone-200 p-2 text-center">
                                        <div className="text-[11px] font-bold text-stone-500">{t.month}</div>
                                        <div className="font-mono text-sm font-black">{t.status === 'NONE' ? '—' : rm(t.ot)}</div>
                                        <div className="text-[11px] text-stone-400">{t.status === 'POSTED' ? '已发薪' : t.status === 'DRAFT' ? '草稿' : '无记录'}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                            <span className="font-black">班次效益：</span>{data.shiftAnalysis.note}
                        </section>

                        <section>
                            <h4 className="text-sm font-black">排班建议（只供参考，系统不会自动修改）</h4>
                            {data.suggestions.length === 0 ? (
                                <p className="mt-1 text-sm text-stone-500">期间资料没有显示明显需要调整的地方，或资料不足以下结论。</p>
                            ) : (
                                <ul className="mt-1 space-y-2">
                                    {data.suggestions.map(s => (
                                        <li key={s.title} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                                            <div className="flex items-center gap-1 font-black text-amber-900"><AlertTriangle size={14} /> {s.title}</div>
                                            <div className="mt-1 text-stone-700"><b>证据：</b>{s.evidence}</div>
                                            <div className="text-stone-700"><b>可能影响：</b>{s.impact}</div>
                                            <div className="text-stone-500"><b>注意：</b>{s.caveat}</div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="rounded-xl border border-stone-200 p-3">
        <div className="text-xs font-bold text-stone-500">{label}</div>
        <div className="mt-1 font-mono text-base font-black">{value}</div>
    </div>
);
