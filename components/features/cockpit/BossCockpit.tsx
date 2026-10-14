// ============================================================================
// 老板经营驾驶舱（Boss Management Cockpit · PR A）
// ----------------------------------------------------------------------------
// 手机优先：首屏先显示核心 KPI（利润、营业额、预计月底利润、保本），
// 每张卡片可点开看计算依据、资料来源与明细。只读，不写入任何资料。
// 所有数字来自 utils/cockpit/cockpitMetrics.ts，与财务报表同口径；
// 已确认 / 预估 / 资料不完整 / 等待日结月结 一律以标签标示。
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, Bot, ChevronRight, Info, Loader2, RefreshCw, Table2, X } from 'lucide-react';
import { getBusinessDateString } from '../../../utils/dateHelper';
import { PERIOD_LABEL, resolvePeriod, type PeriodPreset } from '../../../utils/cockpit/periods';
import { COCKPIT_STATUS_LABEL, type CockpitResult, type CockpitStatus, type Kpi } from '../../../utils/cockpit/cockpitMetrics';
import { loadCockpit } from '../../../utils/cockpit/loadCockpit';
import { LabourAnalyticsSheet } from './LabourAnalyticsSheet';
import { FoodAnalyticsSheet } from './FoodAnalyticsSheet';
import { BreakEvenSimSheet } from './BreakEvenSimSheet';
import { AlertCenterSheet } from './AlertCenterSheet';
import { buildAlertCenter, loadThresholds, saveThresholds, type AlertTarget, type AlertThresholds } from '../../../utils/cockpit/alertRules';
import { loadUnpaidPayables } from '../../../utils/cockpit/loadPayables';
import type { PayableLike } from '../../../utils/apDueDate';
import { buildAdvisorEvidence } from '../../../utils/cockpit/advisorEvidence';
import { AIOperationsAssistant } from '../../lazyModules';

interface Props {
    onClose: () => void;
}

const PRESETS: PeriodPreset[] = ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'CUSTOM'];

const STATUS_STYLE: Record<CockpitStatus, string> = {
    CONFIRMED: 'bg-emerald-100 text-emerald-800',
    ESTIMATED: 'bg-amber-100 text-amber-800',
    INCOMPLETE: 'bg-red-100 text-red-700',
    PENDING_CLOSE: 'bg-stone-200 text-stone-700',
};
const STATUS_ICON: Record<CockpitStatus, string> = { CONFIRMED: '✓', ESTIMATED: '≈', INCOMPLETE: '!', PENDING_CLOSE: '…' };

const rm = (n: number, digits = 2) =>
    `${n < 0 ? '−' : ''}RM ${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const formatKpi = (k: Kpi, compact = false) => {
    if (k.value === null) return '—';
    if (k.unit === 'PCT') return `${(k.value * 100).toFixed(1)}%`;
    if (k.unit === 'DAYS') return `${k.value} 天`;
    return rm(k.value, compact && Math.abs(k.value) >= 1000 ? 0 : 2);
};
const timeText = (iso: string) =>
    new Date(iso).toLocaleString('zh-MY', { timeZone: 'Asia/Kuala_Lumpur', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

const StatusChip: React.FC<{ status: CockpitStatus }> = ({ status }) => (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_STYLE[status]}`}>
        <span aria-hidden>{STATUS_ICON[status]}</span>
        {COCKPIT_STATUS_LABEL[status]}
    </span>
);

export const BossCockpit: React.FC<Props> = ({ onClose }) => {
    const today = useMemo(() => getBusinessDateString(), []);
    const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');
    const [custom, setCustom] = useState({ start: `${today.slice(0, 7)}-01`, end: today });
    const [mode, setMode] = useState<'ACCRUAL' | 'CASH'>('ACCRUAL');
    const [result, setResult] = useState<CockpitResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detail, setDetail] = useState<Kpi | null>(null);
    const [showLabour, setShowLabour] = useState(false);
    const [showFood, setShowFood] = useState(false);
    const [showSim, setShowSim] = useState(false);
    const [showAlerts, setShowAlerts] = useState(false);
    const [showAdvisor, setShowAdvisor] = useState(false);
    const [thresholds, setThresholds] = useState<AlertThresholds>(() => loadThresholds());
    const [payables, setPayables] = useState<{ items: PayableLike[] | null; error: string | null; loading: boolean }>({ items: null, error: null, loading: true });
    const requestId = useRef(0);
    const payablesRequest = useRef(0);

    // 未付应付账款以今天为准，与所选期间无关；打开驾驶舱与按重新整理时读取
    const loadPayables = useCallback(() => {
        const id = ++payablesRequest.current;
        setPayables(p => ({ ...p, loading: true }));
        loadUnpaidPayables()
            .then(items => { if (id === payablesRequest.current) setPayables({ items, error: null, loading: false }); })
            .catch(e => { if (id === payablesRequest.current) setPayables({ items: null, error: (e as Error).message || '权限或网络问题', loading: false }); });
    }, []);
    useEffect(() => { loadPayables(); }, [loadPayables]);

    const changeThresholds = useCallback((t: AlertThresholds) => {
        setThresholds(t);
        saveThresholds(t);
    }, []);

    const period = useMemo(() => resolvePeriod(preset, today, custom), [preset, today, custom]);

    const load = useCallback(() => {
        const id = ++requestId.current;
        setLoading(true);
        setError(null);
        loadCockpit(period, today, mode)
            .then(r => { if (id === requestId.current) setResult(r); })
            .catch(e => {
                if (id !== requestId.current) return;
                const msg = (e as Error).message || '';
                setError(/offline|from server|unavailable|逾时|network/i.test(msg) ? '读取资料失败：无法连线到伺服器（可能离线或网络不稳）' : `读取资料失败：${msg || '权限或其他问题'}`);
            })
            .finally(() => { if (id === requestId.current) setLoading(false); });
    }, [period, today, mode]);

    useEffect(() => { load(); }, [load]);

    // 显示中的结果若不是目前选的期间（正在读取新期间），标示为旧资料
    const stale = !!result && (result.period.start !== period.start || result.period.end !== period.end || result.accountingMode !== mode);
    const k = result?.kpis;
    const center = useMemo(
        () => (result ? buildAlertCenter({ result, today, thresholds, payables: payables.items, payablesError: payables.error }) : null),
        [result, today, thresholds, payables],
    );
    const openTarget = (target: AlertTarget) => {
        setShowAlerts(false);
        if (target.kind === 'kpi' && k?.[target.key]) setDetail(k[target.key]);
        else if (target.kind === 'labour') setShowLabour(true);
        else if (target.kind === 'food') setShowFood(true);
        else if (target.kind === 'sim') setShowSim(true);
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white px-4 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">经营驾驶舱</h2>
                        <p className="truncate text-[11px] font-bold text-stone-500">
                            {period.label} · {mode === 'ACCRUAL' ? '业务发生制' : '现金制'}
                            {result && !stale ? ` · 更新于 ${timeText(result.loadedAt)}` : ''}
                        </p>
                    </div>
                    <button onClick={() => { load(); loadPayables(); }} disabled={loading} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100 disabled:opacity-40" aria-label="重新整理">
                        <RefreshCw size={18} className={`mx-auto ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭">
                        <X size={20} className="mx-auto" />
                    </button>
                </div>
                <nav className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="期间">
                    {PRESETS.map(p => (
                        <button
                            key={p}
                            onClick={() => setPreset(p)}
                            className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-black ${preset === p ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
                        >
                            {PERIOD_LABEL[p]}
                        </button>
                    ))}
                    <button
                        onClick={() => setMode(m => (m === 'ACCRUAL' ? 'CASH' : 'ACCRUAL'))}
                        className="min-h-[40px] shrink-0 rounded-full border border-stone-300 px-4 text-sm font-bold text-stone-600"
                        title="切换会计口径"
                    >
                        口径：{mode === 'ACCRUAL' ? '业务发生制' : '现金制'}
                    </button>
                </nav>
                {preset === 'CUSTOM' && (
                    <div className="mt-2 flex items-center gap-2">
                        <input type="date" value={custom.start} max={custom.end} onChange={e => e.target.value && setCustom(c => ({ ...c, start: e.target.value }))} className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-2 text-sm font-bold" aria-label="开始日期" />
                        <span className="text-stone-400">~</span>
                        <input type="date" value={custom.end} min={custom.start} onChange={e => e.target.value && setCustom(c => ({ ...c, end: e.target.value }))} className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-2 text-sm font-bold" aria-label="结束日期" />
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                <div className="mx-auto max-w-5xl space-y-4 p-4">
                    {error && (
                        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                            <div className="flex-1">
                                {error}
                                <div className="mt-1 text-xs font-medium text-red-600">没有显示任何猜测数字。请检查网络后重试。</div>
                            </div>
                            <button onClick={load} className="min-h-[40px] rounded-xl bg-red-600 px-3 text-xs font-black text-white">重试</button>
                        </div>
                    )}

                    {!result && loading && <SkeletonGrid />}

                    {/* 读取失败时不显示上一个期间的结果，避免误认为是新期间的数字 */}
                    {result && k && !(error && stale) && (
                        <div className={stale ? 'opacity-50 transition-opacity' : ''} aria-busy={stale}>
                            {center && (
                                <section className="mb-4 space-y-2" aria-label="经营预警">
                                    {center.alerts.slice(0, 3).map(a => (
                                        <button
                                            key={a.id}
                                            onClick={() => (a.target ? openTarget(a.target) : setShowAlerts(true))}
                                            className={`flex w-full items-start gap-2 rounded-xl border p-3 text-left text-sm ${a.level === 'HIGH' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                                        >
                                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                            <span className="flex-1">
                                                <span className="font-black">{a.level === 'HIGH' ? '高优先级 · ' : ''}{a.title}</span>
                                                <span className="block text-xs font-medium opacity-80">{a.detail}</span>
                                            </span>
                                            <ChevronRight size={16} className="mt-0.5 shrink-0 opacity-50" />
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setShowAlerts(true)}
                                        className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-left text-sm font-black active:bg-stone-50"
                                    >
                                        <Bell size={16} className="shrink-0 text-stone-500" />
                                        <span className="flex-1">
                                            预警中心 · {center.alerts.length} 条{center.alerts.length > 3 ? `（另有 ${center.alerts.length - 3} 条）` : ''}
                                            <span className="block text-xs font-medium text-stone-500">依据、阈值设定、未检查的规则{payables.loading ? ' · 应付账款读取中' : ''}</span>
                                        </span>
                                        <ChevronRight size={16} className="shrink-0 text-stone-400" />
                                    </button>
                                </section>
                            )}

                            {/* 首屏：利润主卡 */}
                            <button onClick={() => setDetail(k.actualProfit)} className="mb-3 w-full rounded-3xl border border-stone-200 bg-white p-5 text-left shadow-sm active:bg-stone-50">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-black text-stone-600">{k.actualProfit.label}</span>
                                    <StatusChip status={k.actualProfit.status} />
                                </div>
                                <div className={`mt-2 font-mono text-4xl font-black tracking-tight ${(k.actualProfit.value ?? 0) < 0 ? 'text-red-700' : 'text-stone-900'}`}>
                                    {formatKpi(k.actualProfit)}
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs font-medium text-stone-500">{k.actualProfit.statusNote}</p>
                                <div className="mt-3 flex gap-4 text-xs font-bold text-stone-600">
                                    <span>毛利率 {formatKpi(k.grossMargin)}</span>
                                    <span>净利率 {formatKpi(k.netMargin)}</span>
                                    <span className="ml-auto text-stone-400">查看依据 ›</span>
                                </div>
                            </button>

                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                {['monthRevenue', 'projectedProfit', 'breakEvenDay', 'breakEvenGap', 'labour', 'labourRatio', 'food', 'foodRatio', 'revenue', 'breakEvenMonth']
                                    .filter(key => k[key])
                                    .map(key => <KpiCard key={key} kpi={k[key]} onOpen={() => setDetail(k[key])} />)}
                            </div>

                            <button
                                onClick={() => setShowLabour(true)}
                                className="mt-3 flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 text-left text-sm font-black active:bg-stone-50"
                            >
                                <span>人工效益分析<span className="block text-xs font-medium text-stone-500">每工时营业额、部门、星期别、OT 走势、排班建议</span></span>
                                <ChevronRight size={18} className="text-stone-400" />
                            </button>

                            <button
                                onClick={() => setShowFood(true)}
                                className="mt-2 flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 text-left text-sm font-black active:bg-stone-50"
                            >
                                <span>食材成本分析<span className="block text-xs font-medium text-stone-500">采购成本率走势、库存价值、耗用口径、盘点差异、品项涨价</span></span>
                                <ChevronRight size={18} className="text-stone-400" />
                            </button>

                            <button
                                onClick={() => setShowSim(true)}
                                className="mt-2 flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 text-left text-sm font-black active:bg-stone-50"
                            >
                                <span>保本模拟器<span className="block text-xs font-medium text-stone-500">调整营业额、人工、食材成本率、租金、营业天数，只模拟不保存</span></span>
                                <ChevronRight size={18} className="text-stone-400" />
                            </button>

                            <TrendChart result={result} onOpenBreakEven={() => setDetail(k.breakEvenDay)} />

                            <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4" aria-label="数据完整性">
                                <h3 className="text-sm font-black">数据完整性</h3>
                                <ul className="mt-2 divide-y divide-stone-100 text-sm">
                                    {result.integrity.map(item => (
                                        <li key={item.label} className="flex items-start gap-2 py-2">
                                            <span className={`mt-0.5 shrink-0 text-xs font-black ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`} aria-label={item.ok ? '正常' : '需留意'}>{item.ok ? '✓' : '!'}</span>
                                            <span className="w-24 shrink-0 font-bold text-stone-700">{item.label}</span>
                                            <span className="min-w-0 flex-1 text-stone-600">{item.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
                                <h3 className="flex items-center gap-2 text-sm font-black">
                                    经营简报
                                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-500">依系统计算 · 非 AI</span>
                                </h3>
                                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-stone-700">
                                    {result.briefing.map((line, i) => <li key={i}>{line}</li>)}
                                </ul>
                                <p className="mt-2 text-[11px] text-stone-400">这里的每句话都来自上方指标。</p>
                                <button
                                    onClick={() => setShowAdvisor(true)}
                                    disabled={stale}
                                    className="mt-3 flex min-h-[48px] w-full items-center gap-2 rounded-xl bg-stone-900 px-3 text-left text-sm font-black text-white active:bg-stone-800 disabled:opacity-40"
                                >
                                    <Bot size={18} className="shrink-0 text-amber-300" />
                                    <span className="flex-1">
                                        问 AI 经营顾问
                                        <span className="block text-xs font-medium text-stone-300">只根据本页数字回答，每句附依据编号，核对不到的会删除</span>
                                    </span>
                                    <ChevronRight size={16} className="shrink-0 text-stone-400" />
                                </button>
                            </section>

                            <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
                                金额单位 RM。营业额与成本分类与财务报表同口径；人工为雇主总成本（含雇主 EPF / SOCSO / EIS），损益中的薪资类支出不重复扣除。
                                本页只读，不写入任何资料；不使用预设营业目标、人工或食材比例。
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {showAlerts && center && result && (
                <AlertCenterSheet
                    center={center}
                    periodLabel={result.period.label}
                    payablesLoading={payables.loading}
                    thresholds={thresholds}
                    onChangeThresholds={changeThresholds}
                    onOpenTarget={openTarget}
                    onClose={() => setShowAlerts(false)}
                />
            )}
            {showAdvisor && result && (
                <AIOperationsAssistant
                    isOpen
                    onClose={() => setShowAdvisor(false)}
                    advisor={{
                        periodLabel: `${result.period.label}（${result.accountingMode === 'ACCRUAL' ? '业务发生制' : '现金制'}）`,
                        evidence: buildAdvisorEvidence(result, center),
                        onOpenKpi: key => { setShowAdvisor(false); if (k?.[key]) setDetail(k[key]); },
                    }}
                />
            )}
            {showSim && result && <BreakEvenSimSheet baseline={result.extras.monthBaseline} onClose={() => setShowSim(false)} />}
            {showFood && result && <FoodAnalyticsSheet result={result} onClose={() => setShowFood(false)} />}
            {showLabour && result && <LabourAnalyticsSheet result={result} onClose={() => setShowLabour(false)} />}
            {detail && <KpiDetailSheet kpi={detail} periodLabel={result?.period.label || ''} onClose={() => setDetail(null)} />}
        </div>
    );
};

const KpiCard: React.FC<{ kpi: Kpi; onOpen: () => void }> = ({ kpi, onOpen }) => (
    <button onClick={onOpen} className="flex min-h-[112px] flex-col rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm active:bg-stone-50">
        <span className="text-xs font-black text-stone-500">{kpi.label}</span>
        <span className={`mt-1 font-mono text-xl font-black tracking-tight ${kpi.unit === 'RM' && (kpi.value ?? 0) < 0 ? 'text-red-700' : 'text-stone-900'}`}>
            {formatKpi(kpi, true)}
        </span>
        <span className="mt-auto pt-2"><StatusChip status={kpi.status} /></span>
    </button>
);

const SkeletonGrid: React.FC = () => (
    <div className="space-y-3" aria-label="读取中">
        <div className="h-36 animate-pulse rounded-3xl bg-stone-200/70" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200/70" />)}
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-stone-500"><Loader2 size={16} className="animate-spin" /> 读取日结、支出与薪资资料…</div>
    </div>
);

/** 每日营业额柱状图 + 每日保本线（单一数列，不用双轴） */
const TrendChart: React.FC<{ result: CockpitResult; onOpenBreakEven: () => void }> = ({ result, onOpenBreakEven }) => {
    const [hover, setHover] = useState<number | null>(null);
    const [asTable, setAsTable] = useState(false);
    const data = result.trend;
    const breakEven = result.kpis.breakEvenDay?.value ?? null;
    if (data.length === 0) return null;
    const W = 640, H = 200, padL = 44, padR = 8, padT = 12, padB = 24;
    const max = Math.max(1, ...data.map(d => d.revenue ?? 0), breakEven ?? 0) * 1.1;
    const step = (W - padL - padR) / data.length;
    const barW = Math.min(24, Math.max(4, step - 2));
    const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
    const ticks = [0, max / 2, max].map(v => Math.round(v / 100) * 100);
    const fmtTick = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(v));
    const hovered = hover !== null ? data[hover] : null;

    return (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2">
                <h3 className="flex-1 text-sm font-black">每日营业额走势{result.period.days < 7 ? '（近 14 天）' : ''}</h3>
                <button onClick={() => setAsTable(v => !v)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-bold text-stone-500 hover:bg-stone-100" aria-pressed={asTable}>
                    <Table2 size={14} /> {asTable ? '图表' : '表格'}
                </button>
            </div>
            {asTable ? (
                <div className="mt-2 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white text-xs text-stone-500"><tr><th className="py-1 text-left">日期</th><th className="text-right">营业额</th><th className="text-right">当日贡献</th></tr></thead>
                        <tbody>
                            {data.map(d => (
                                <tr key={d.date} className="border-t border-stone-100">
                                    <td className="py-1.5 font-mono text-xs">{d.date}</td>
                                    <td className="text-right font-mono">{d.revenue === null ? <span className="text-red-600">未日结</span> : rm(d.revenue, 0)}</td>
                                    <td className="text-right font-mono">{d.contribution === null ? '—' : rm(d.contribution, 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="relative mt-2">
                    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="每日营业额柱状图" onMouseLeave={() => setHover(null)}>
                        {ticks.map(t => (
                            <g key={t}>
                                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
                                <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#78716c">{fmtTick(t)}</text>
                            </g>
                        ))}
                        {data.map((d, i) => {
                            const x = padL + i * step + (step - barW) / 2;
                            const h = d.revenue === null ? 0 : Math.max(1, y(0) - y(d.revenue));
                            return (
                                <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                                    <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent" />
                                    {d.revenue === null ? (
                                        <line x1={x} x2={x + barW} y1={y(0) - 1} y2={y(0) - 1} stroke="#dc2626" strokeWidth={2} />
                                    ) : (
                                        <path
                                            d={`M${x},${y(0)} V${y(0) - h + Math.min(4, h)} Q${x},${y(0) - h} ${x + Math.min(4, barW / 2)},${y(0) - h} H${x + barW - Math.min(4, barW / 2)} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + Math.min(4, h)} V${y(0)} Z`}
                                            fill="#b45309"
                                            opacity={hover === null || hover === i ? 1 : 0.45}
                                        />
                                    )}
                                </g>
                            );
                        })}
                        {breakEven !== null && breakEven > 0 && (
                            <g>
                                <line x1={padL} x2={W - padR} y1={y(breakEven)} y2={y(breakEven)} stroke="#44403c" strokeWidth={1.5} strokeDasharray="5 4" />
                                <text x={padL + 4} y={y(breakEven) - 5} fontSize={11} fontWeight={700} fill="#44403c" stroke="#ffffff" strokeWidth={4} paintOrder="stroke">每日保本 {fmtTick(Math.round(breakEven))}</text>
                            </g>
                        )}
                        {data.map((d, i) => (i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
                            <text key={d.date} x={padL + i * step + step / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#78716c">{d.date.slice(5)}</text>
                        ))}
                    </svg>
                    {hovered && (
                        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg">
                            <div className="font-black">{hovered.date}</div>
                            <div>营业额：{hovered.revenue === null ? '未日结' : rm(hovered.revenue)}</div>
                            {hovered.contribution !== null && <div>当日贡献（扣变动成本与日均固定成本）：{rm(hovered.contribution)}</div>}
                        </div>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-stone-500">
                        <span className="inline-block h-0.5 w-3 bg-red-600" /> 红线 = 当天未日结
                        {breakEven !== null && <button onClick={onOpenBreakEven} className="ml-auto underline">保本线怎么算？</button>}
                    </p>
                </div>
            )}
        </section>
    );
};

const KpiDetailSheet: React.FC<{ kpi: Kpi; periodLabel: string; onClose: () => void }> = ({ kpi, periodLabel, onClose }) => (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
        <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-2xl"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label={`${kpi.label}明细`}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-black">{kpi.label}</h3>
                    <p className="text-xs font-bold text-stone-500">{periodLabel}</p>
                </div>
                <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
            </div>
            <div className="mt-2 font-mono text-3xl font-black">{formatKpi(kpi)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <StatusChip status={kpi.status} />
                <span>{kpi.statusNote}</span>
            </div>

            {kpi.rows.length > 0 && (
                <section className="mt-4">
                    <h4 className="text-xs font-black uppercase text-stone-500">明细</h4>
                    <div className="mt-1 divide-y divide-stone-100 rounded-xl border border-stone-200">
                        {kpi.rows.map((r, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <span className="min-w-0 truncate">{r.label}</span>
                                <span className={`shrink-0 font-mono font-bold ${r.amount < 0 ? 'text-red-700' : ''}`}>{rm(r.amount)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="mt-4">
                <h4 className="flex items-center gap-1 text-xs font-black uppercase text-stone-500"><Info size={12} /> 计算依据</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
                    {kpi.basis.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
            </section>

            <section className="mt-4">
                <h4 className="text-xs font-black uppercase text-stone-500">资料来源</h4>
                <ul className="mt-1 space-y-1 text-sm text-stone-700">
                    {kpi.sources.map((s, i) => (
                        <li key={i} className="flex justify-between gap-2">
                            <span>{s.label} <code className="rounded bg-stone-100 px-1 text-[11px]">{s.collection}</code></span>
                            {s.count !== undefined && <span className="shrink-0 text-stone-500">{s.count} 笔</span>}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    </div>
);
