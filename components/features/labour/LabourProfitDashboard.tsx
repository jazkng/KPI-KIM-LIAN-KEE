// ============================================================================
// 老板看板 · 人工成本与盈利（Issue #8 · 任务二）
// ----------------------------------------------------------------------------
// 只读：读取当月日结、支出、账单付款、薪资记录、员工底薪与（V2）审核后的考勤，
// 计算雇主人工总成本、人工成本率、保本营业额与预估利润。
// 每一项都标明「已结算 / 估算 / 缺失」。不写入任何资料，不改动薪资或法定供款规则。
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import type { AttendanceRecord, Employee, PayrollRecord } from '../../../types';
import { DataManager } from '../../../utils/dataManager';
import { aggregateMonth } from '../../../utils/monthlyPnLAggregator';
import { buildMonthLabourCosts, summariseReviewedAttendance as summarise } from '../../../utils/labour/labourCost';
import { buildProfitSnapshot, DATA_STATUS_LABEL, type DataStatus, type ProfitLine } from '../../../utils/labour/profitDashboard';

interface Props {
    onClose: () => void;
}

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);

const STATUS_STYLE: Record<DataStatus, string> = {
    SETTLED: 'bg-emerald-100 text-emerald-800',
    ESTIMATED: 'bg-amber-100 text-amber-800',
    MISSING: 'bg-red-100 text-red-700',
};

const StatusChip: React.FC<{ status: DataStatus }> = ({ status }) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_STYLE[status]}`}>{DATA_STATUS_LABEL[status]}</span>
);

const currentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const LabourProfitDashboard: React.FC<Props> = ({ onClose }) => {
    const [month, setMonth] = useState(currentMonth());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<{
        employees: Employee[];
        payroll: PayrollRecord[];
        raw: Awaited<ReturnType<typeof DataManager.getMonthPnLRaw>>;
        reviews: AttendanceRecord[];
    } | null>(null);
    const [showStaff, setShowStaff] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        Promise.all([
            DataManager.getEmployees(),
            DataManager.getPayrollRecords(),
            DataManager.getMonthPnLRaw(month),
            DataManager.getAttendanceReviewsByMonth(month).catch(() => [] as AttendanceRecord[]),
        ])
            .then(([employees, payroll, raw, reviews]) => alive && setData({ employees, payroll, raw, reviews }))
            .catch(e => alive && setError(`读取资料失败：${(e as Error).message}`))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [month]);

    const snapshot = useMemo(() => {
        if (!data) return null;
        const pnl = aggregateMonth(month, {
            settlements: data.raw.settlements,
            standaloneExpenses: data.raw.standaloneExpenses,
            billPayments: data.raw.billPayments,
            payrollRecords: data.payroll,
            employees: data.employees,
        });
        const labour = buildMonthLabourCosts(month, data.employees, data.payroll, summarise(data.reviews));
        const [y, m] = month.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const today = new Date();
        const isCurrent = month === currentMonth();
        const isFuture = month > currentMonth();
        const settlementDays = new Set(
            data.raw.settlements.map(s => String(s.date || '').slice(0, 10)).filter(d => d.startsWith(month)),
        ).size;
        return {
            labour,
            snap: buildProfitSnapshot(pnl, labour, {
                daysInMonth,
                elapsedDays: isFuture ? 0 : isCurrent ? today.getDate() : daysInMonth,
                settlementDays,
                // 兼职工资（与财务报表相同：业务发生制看账单日期）
                partTimeWages: data.raw.standaloneExpenses
                    .filter(e => String(e.id || '').startsWith('parttime_') && String(e.time || '').slice(0, 7) === month)
                    .reduce((sum, e) => sum + Math.max(0, (Number((e as any).totalBillAmount || e.amount) || 0) - (Number((e as any).creditNote) || 0)), 0),
            }),
        };
    }, [data, month]);

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-black">人工成本与盈利</h2>
                    <p className="text-[11px] font-bold text-stone-500">只读分析 · 不改动薪资与法定供款</p>
                </div>
                <input
                    type="month"
                    value={month}
                    onChange={e => e.target.value && setMonth(e.target.value)}
                    className="min-h-[44px] rounded-xl border border-stone-300 px-2 text-sm font-bold"
                    aria-label="月份"
                />
                <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭">
                    <X className="mx-auto" size={20} />
                </button>
            </header>

            <main className="flex-1 space-y-4 overflow-y-auto p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                {loading && <div className="flex items-center gap-2 text-sm font-bold text-stone-500"><Loader2 size={16} className="animate-spin" /> 读取中…</div>}
                {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}

                {snapshot && !loading && (() => {
                    const { snap, labour } = snapshot;
                    return (
                        <>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-stone-600">整体资料状态</span>
                                <StatusChip status={snap.overallStatus} />
                            </div>

                            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <Kpi label="雇主人工总成本" value={rm(snap.labourCost)} />
                                <Kpi label="人工成本率" value={pct(snap.labourCostRatio)} hint="人工 ÷ 整月营业额" />
                                <Kpi label="保本营业额" value={snap.breakEvenRevenue === null ? '—' : rm(snap.breakEvenRevenue)} hint="固定成本 ÷（1 − 变动成本率）" />
                                <Kpi label="预估利润" value={rm(snap.projectedProfit)} tone={snap.projectedProfit < 0 ? 'bad' : 'good'} />
                            </section>

                            {snap.reasons.length > 0 && (
                                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                    <p className="mb-1 font-black">资料说明</p>
                                    <ul className="space-y-1">{snap.reasons.map(r => <li key={r}>· {r}</li>)}</ul>
                                </section>
                            )}

                            <section className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
                                <Line line={snap.revenue} extra={snap.revenueProjected !== snap.revenue.amount ? `整月推估 ${rm(snap.revenueProjected)}` : undefined} />
                                <Line line={snap.variableCosts} />
                                <Line line={snap.payrollLabour} />
                                <Line line={snap.otherLabour} />
                                <Line line={snap.otherFixedCosts} />
                                {snap.excludedLabourExpenses > 0 && (
                                    <div className="px-4 py-3 text-xs text-stone-500">
                                        损益中的薪资类支出 {rm(snap.excludedLabourExpenses)} 与薪资是同一笔钱，已排除，不重复计算。
                                    </div>
                                )}
                            </section>

                            <section className="rounded-2xl border border-stone-200 bg-white">
                                <button onClick={() => setShowStaff(v => !v)} className="flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-sm font-black">
                                    {showStaff ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    员工明细（{snap.employees.settled} 已结算 · {snap.employees.estimated} 估算 · {snap.employees.missing} 缺失）
                                </button>
                                {showStaff && (
                                    <ul className="divide-y divide-stone-100">
                                        {labour.map(c => {
                                            const status: DataStatus = c.notes.includes('人事档案没有底薪') ? 'MISSING' : c.source === 'PAYROLL' ? 'SETTLED' : 'ESTIMATED';
                                            return (
                                                <li key={c.employeeId} className="flex items-start gap-3 px-4 py-3 text-sm">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2"><span className="truncate font-bold">{c.employeeName}</span><StatusChip status={status} /></div>
                                                        <div className="text-[11px] text-stone-500">
                                                            底薪 {c.basic.toFixed(2)} · 雇主 EPF {c.employerEpf.toFixed(2)} · SOCSO {c.employerSocso.toFixed(2)} · EIS {c.employerEis.toFixed(2)}
                                                        </div>
                                                        {c.notes.length > 0 && <div className="text-[11px] text-amber-700">{c.notes.join('；')}</div>}
                                                    </div>
                                                    <div className="text-right font-black">{c.employerCost.toFixed(2)}</div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>

                            <p className="text-[11px] leading-relaxed text-stone-500">
                                雇主人工成本 = 应发薪资 + 雇主 EPF / SOCSO / EIS（法定供款沿用薪资模块的同一套算法）。员工自付的部分已含在应发薪资里，不重复计算。
                                已发放的薪资以实际数字为准；其余按底薪推算。加班规则待确认，推算时不计入加班费。
                                营业额与成本分类沿用财务报表的规则；网站订单不计入营业额（以 POS 日结为准）。
                            </p>
                        </>
                    );
                })()}
            </main>
        </div>
    );
};

const Kpi: React.FC<{ label: string; value: string; hint?: string; tone?: 'good' | 'bad' }> = ({ label, value, hint, tone }) => (
    <div className={`rounded-2xl border bg-white p-3 ${tone === 'bad' ? 'border-red-200' : 'border-stone-200'}`}>
        <div className="text-[11px] font-bold text-stone-500">{label}</div>
        <div className={`mt-1 text-lg font-black leading-tight ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</div>
        {hint && <div className="mt-1 text-[10px] text-stone-400">{hint}</div>}
    </div>
);

const Line: React.FC<{ line: ProfitLine; extra?: string }> = ({ line, extra }) => (
    <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold"><span>{line.label}</span><StatusChip status={line.status} /></div>
            {(line.note || extra) && <div className="mt-0.5 text-[11px] text-stone-500">{[line.note, extra].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="text-right text-sm font-black">{rm(line.amount)}</div>
    </div>
);
