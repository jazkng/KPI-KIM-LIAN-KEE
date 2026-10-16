// ============================================================================
// 盈亏对账 · 只读
// ----------------------------------------------------------------------------
// 选月份（或多个月份），按按钮才读取资料；把财务报表首页、传统账目、驾驶舱（修改前）
// 与唯一盈亏引擎（修改后）对同一份资料算出的经营盈亏并列，逐项列出差异来源、
// 与仍待核对的项目。每日结算的钱箱支出不纳入。不写入任何资料。
// ============================================================================
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Loader2, X } from 'lucide-react';
import { getBusinessDateString } from '../../../utils/dateHelper';
import { loadReconciliation } from '../../../utils/pnl/reconciliation/loadReconciliation';
import { batchSummaryText, reconciliationSummaryText, type MonthReconciliation, type ReconFinding } from '../../../utils/pnl/reconciliation/reconcileMonth';
import { PNL_STATUS_LABEL } from '../../../utils/pnl/engine/pnlEngine';
import { COCKPIT_STATUS_LABEL } from '../../../utils/cockpit/cockpitMetrics';

const rm = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 手机版对照表：四舍五入到 RM 1，避免六位数挤出画面；精确金额见差额拆解与摘要 */
const rm0 = (n: number) => `${n < 0 ? '−' : ''}${Math.round(Math.abs(n)).toLocaleString('en-MY')}`;
const signed = (n: number) => (Math.abs(n) < 0.005 ? '0.00' : `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const previousMonth = (today: string) => {
    const [y, m] = today.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const LABOUR_SOURCE: Record<string, string> = {
    POSTED: '已发放薪资单', DRAFT: '薪资草稿', BASIC_SALARY: '员工档案底薪合计', ACTUAL_LABOR_EXPENSES: '人工类支出', FALLBACK_57300: 'RM 57,300 后备值',
};

const LINES: { key: 'revenue' | 'platform' | 'food' | 'labour' | 'opex' | 'netProfit'; label: string }[] = [
    { key: 'revenue', label: '营业额' },
    { key: 'platform', label: '− 外送平台扣款' },
    { key: 'food', label: '− 食材（采购暂估）' },
    { key: 'labour', label: '− 人工' },
    { key: 'opex', label: '− 其他经营费用' },
    { key: 'netProfit', label: '= 经营净利' },
];

export const PnLReconciliation: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const today = getBusinessDateString();
    const [month, setMonth] = useState(previousMonth(today));
    const [result, setResult] = useState<MonthReconciliation | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
    const [mode, setMode] = useState<'MONTH' | 'BATCH'>('MONTH');
    const [batchFrom, setBatchFrom] = useState('2026-05');
    const [batchTo, setBatchTo] = useState(previousMonth(today));
    const [batch, setBatch] = useState<MonthReconciliation[]>([]);
    const [batchProgress, setBatchProgress] = useState('');

    const monthList = (from: string, to: string) => {
        const out: string[] = [];
        let [y, m] = from.split('-').map(Number);
        const [ty, tm] = to.split('-').map(Number);
        while ((y < ty || (y === ty && m <= tm)) && out.length < 12) {
            out.push(`${y}-${String(m).padStart(2, '0')}`);
            m += 1; if (m > 12) { m = 1; y += 1; }
        }
        return out;
    };
    const runBatch = async () => {
        setLoading(true);
        setError('');
        setCopied('');
        setBatch([]);
        const months = monthList(batchFrom, batchTo);
        const done: MonthReconciliation[] = [];
        try {
            // 一个月一个月读，避免同时读太多资料
            for (const m of months) {
                setBatchProgress(`正在对账 ${m}（${done.length + 1} / ${months.length}）`);
                done.push(await loadReconciliation(m, today));
                setBatch([...done]);
            }
        } catch (e: any) {
            setError(`${e?.message || '读取失败'}（已完成 ${done.length} 个月）`);
        } finally {
            setBatchProgress('');
            setLoading(false);
        }
    };

    const run = async () => {
        setLoading(true);
        setError('');
        setCopied('');
        try {
            setResult(await loadReconciliation(month, today));
        } catch (e: any) {
            setError(e?.message || '读取失败');
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    const summary = useMemo(
        () => (mode === 'BATCH' ? (batch.length ? batchSummaryText(batch) : '') : result ? reconciliationSummaryText(result) : ''),
        [mode, batch, result],
    );
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(summary);
            setCopied('ok');
        } catch {
            setCopied('fail');
        }
    };

    const nets = result ? [result.algorithms.A.netProfit, result.algorithms.B.netProfit, result.algorithms.C.netProfit] : [];
    const allSame = nets.length > 0 && nets.every(n => Math.abs(n - nets[0]) < 0.01);

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white px-4 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">盈亏对账</h2>
                        <p className="truncate text-[11px] font-bold text-stone-500">只读 · 权责发生制 · 各报表的经营盈亏与差异来源</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭">
                        <X size={20} className="mx-auto" />
                    </button>
                </div>
                <div className="mt-2 flex gap-2" role="tablist">
                    {(['MONTH', 'BATCH'] as const).map(m => (
                        <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setCopied(''); }}
                            className={`min-h-[36px] rounded-full px-4 text-sm font-black ${mode === m ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
                            {m === 'MONTH' ? '单月明细' : '多月修改前后'}
                        </button>
                    ))}
                </div>
                {mode === 'MONTH' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm font-bold">
                            月份
                            <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)} className="min-h-[40px] rounded-lg border border-stone-300 px-2 font-mono" />
                        </label>
                        <button onClick={run} disabled={loading || !month} className="flex min-h-[40px] items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-black text-white disabled:opacity-50">
                            {loading && <Loader2 size={16} className="animate-spin" />} 开始对账
                        </button>
                    </div>
                ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-sm font-bold">
                            从 <input type="month" aria-label="开始月份" value={batchFrom} max={batchTo} onChange={e => setBatchFrom(e.target.value)} className="min-h-[40px] rounded-lg border border-stone-300 px-2 font-mono" />
                        </label>
                        <label className="flex items-center gap-1 text-sm font-bold">
                            到 <input type="month" aria-label="结束月份" value={batchTo} min={batchFrom} max={today.slice(0, 7)} onChange={e => setBatchTo(e.target.value)} className="min-h-[40px] rounded-lg border border-stone-300 px-2 font-mono" />
                        </label>
                        <button onClick={runBatch} disabled={loading || !batchFrom || !batchTo} className="flex min-h-[40px] items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-black text-white disabled:opacity-50">
                            {loading && <Loader2 size={16} className="animate-spin" />} 开始对账
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                <div className="mx-auto max-w-4xl space-y-4">
                    {mode === 'BATCH' && (
                        <BatchView rows={batch} progress={batchProgress} error={error} summary={summary} copied={copied} onCopy={copy} />
                    )}
                    {mode === 'MONTH' && !result && !loading && !error && (
                        <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-relaxed text-stone-600">
                            选择月份后按「开始对账」。系统会读取该月的日结、支出、固定账单、薪资与员工资料（只读，不会写入或修改任何资料），
                            用现有的几套算法（修改前）与唯一盈亏引擎（修改后）各算一次经营盈亏，列出每一项差异来自哪些记录，
                            以及仍待核对的项目。每日结算的钱箱支出不纳入。
                        </p>
                    )}
                    {mode === 'MONTH' && error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
                    {mode === 'MONTH' && result && (
                        <>
                            <section className={`rounded-2xl border p-4 ${allSame ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                <div className="flex items-start gap-2">
                                    {allSame ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />}
                                    <div className="text-sm leading-relaxed">
                                        <p className="font-black">
                                            {allSame ? '三套算法结果一致。' : `${result.month} 的经营盈亏目前有 ${new Set(nets.map(n => n.toFixed(2))).size} 个不同版本，还不能当作最终数字。`}
                                        </p>
                                        <p className="mt-1 text-stone-700">
                                            资料：日结 {result.counts.settlements} 天、独立支出 {result.counts.standaloneExpenses} 笔、固定账单付款 {result.counts.billPayments} 笔、
                                            薪资单 {result.counts.payrollRecords} 份、员工 {result.counts.employees} 人。
                                            驾驶舱状态：{COCKPIT_STATUS_LABEL[result.algorithms.C.status as keyof typeof COCKPIT_STATUS_LABEL] || result.algorithms.C.status}（{result.algorithms.C.statusNote || '—'}）。
                                        </p>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-stone-200 bg-white p-4">
                                <h3 className="text-sm font-black">各算法的经营盈亏</h3>
                                <div className="mt-2">
                                    <table className="w-full text-[11px] sm:text-sm">
                                        <thead className="text-[10px] text-stone-500 sm:text-xs">
                                            <tr>
                                                <th className="py-1 text-left">项目</th>
                                                <th className="text-right">A 财报首页</th>
                                                <th className="text-right">B 传统账目</th>
                                                <th className="text-right">C 驾驶舱</th>
                                                <th className="text-right text-emerald-700">修改后</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {LINES.map(l => (
                                                <tr key={l.key} className={`border-t border-stone-100 ${l.key === 'netProfit' ? 'font-black' : ''}`}>
                                                    <td className="py-1.5 pr-1">{l.label}</td>
                                                    {(['A', 'B', 'C'] as const).map(k => (
                                                        <td key={k} className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">
                                                            <span className="sm:hidden">{rm0(result.algorithms[k][l.key])}</span>
                                                            <span className="hidden sm:inline">{rm(result.algorithms[k][l.key])}</span>
                                                        </td>
                                                    ))}
                                                    <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums text-emerald-800">
                                                        <span className="sm:hidden">{rm0(result.engine[l.key])}</span>
                                                        <span className="hidden sm:inline">{rm(result.engine[l.key])}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <ul className="mt-3 space-y-1 text-xs leading-relaxed text-stone-600">
                                    <li className="sm:hidden">手机版金额四舍五入到 RM 1；精确到分的金额见下方差额拆解与摘要。</li>
                                    <li>A、B、C 是<strong>修改前</strong>的算法（对照用）；「修改后」是唯一盈亏引擎，驾驶舱与传统账目现在都显示这个数字。</li>
                                    <li>A 的人工来源：{LABOUR_SOURCE[result.algorithms.A.labourSource]}，整月 {rm(result.algorithms.A.baseMonthlyLabour)}，按已日结 {result.algorithms.A.settledDays} / {result.algorithms.A.daysInMonth} 天分摊。</li>
                                    <li>B 的「其他经营费用」= 营运栏 + 非平台的行销广告；传统账目多月份导出算出的净利：{rm(result.algorithms.B.exportNetProfit)}。</li>
                                    <li>
                                        D 经营日报：{result.algorithms.D.days} 天逐日加总 {rm(result.algorithms.D.sum)}，其中 {result.algorithms.D.estimatedFoodDays} 天的食材用营业额 × 35% 估算（{rm(result.algorithms.D.estimatedFoodAmount)}）。
                                        经营日报没有人工、租金、水电，不是月度盈亏，不能与上面比较。
                                    </li>
                                </ul>
                            </section>

                            <EngineSection r={result} />

                            <Bridge title="A 财务报表首页 − C 驾驶舱" rows={result.bridgeA} total={result.algorithms.A.netProfit - result.algorithms.C.netProfit} unexplained={result.unexplainedA} />
                            <Bridge title="B 传统账目 − C 驾驶舱" rows={result.bridgeB} total={result.algorithms.B.netProfit - result.algorithms.C.netProfit} unexplained={result.unexplainedB} />

                            <section className="rounded-2xl border border-stone-200 bg-white p-4">
                                <h3 className="text-sm font-black">差异来源与待核对项目</h3>
                                <p className="mt-1 text-xs text-stone-500">点开看每一笔记录。标「需确认」的项目，统一引擎不会自动处理，请负责人决定。</p>
                                <div className="mt-2 divide-y divide-stone-100">
                                    {result.findings.map(f => <FindingRow key={f.id} f={f} />)}
                                </div>
                            </section>

                            {result.payroll && <PayrollSection r={result} />}

                            <section className="rounded-2xl border border-stone-200 bg-white p-4">
                                <h3 className="text-sm font-black">支出分类对照（同一个分类在各算法归到哪里）</h3>
                                <div className="mt-2 max-h-96 overflow-auto">
                                    <table className="w-full min-w-[640px] text-xs">
                                        <thead className="sticky top-0 bg-white text-stone-500">
                                            <tr><th className="py-1 text-left">分类</th><th className="text-right">金额</th><th className="pl-3 text-left">财务报表</th><th className="text-left">传统账目</th><th className="text-left">驾驶舱</th></tr>
                                        </thead>
                                        <tbody>
                                            {result.categories.map(c => (
                                                <tr key={c.category} className={`border-t border-stone-100 ${c.flag ? 'bg-amber-50' : ''}`}>
                                                    <td className="py-1 font-mono">{c.category}{c.flag && <div className="font-sans text-[11px] font-bold text-amber-700">{c.flag}</div>}</td>
                                                    <td className="text-right font-mono">{rm(c.amount)}</td>
                                                    <td className="pl-3">{c.financialReport}</td>
                                                    <td>{c.classicLine}</td>
                                                    <td>{c.cockpit}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-stone-200 bg-white p-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="flex-1 text-sm font-black">对账摘要（只有金额与笔数，不含员工姓名）</h3>
                                    <button onClick={copy} className="flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-bold text-stone-600 hover:bg-stone-100">
                                        <Copy size={14} /> {copied === 'ok' ? '已复制' : '复制'}
                                    </button>
                                </div>
                                {copied === 'fail' && <p className="mt-1 text-xs text-red-600">无法自动复制，请手动选取下方文字。</p>}
                                <textarea readOnly value={summary} className="mt-2 h-48 w-full rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-[11px]" />
                            </section>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

const EngineSection: React.FC<{ r: MonthReconciliation }> = ({ r }) => {
    const E = r.engine;
    const blocking = E.reasons.filter(x => x.level === 'BLOCKING');
    const info = E.reasons.filter(x => x.level === 'INFO');
    const confirmed = E.status === 'CONFIRMED';
    return (
        <section className={`rounded-2xl border p-4 ${confirmed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-white'}`}>
            <h3 className="text-sm font-black">
                修改后 · 唯一盈亏引擎：{rm(E.netProfit)}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-black ${confirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{PNL_STATUS_LABEL[E.status]}</span>
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
                与修改前驾驶舱差 {signed(E.netProfit - r.algorithms.C.netProfit)}、与财务报表首页差 {signed(E.netProfit - r.algorithms.A.netProfit)}、
                与传统账目差 {signed(E.netProfit - r.algorithms.B.netProfit)}。每日结算的钱箱支出不计入；采购、杂项以应付账款为准；薪资以 Payroll 为准。
            </p>
            {blocking.length > 0 && (
                <div className="mt-2">
                    <p className="text-xs font-black text-amber-800">未解决前不能称为已确认：</p>
                    <ul className="mt-1 space-y-1 text-xs leading-relaxed">
                        {blocking.map((x, i) => <li key={i}>※ {x.label}{x.amount !== undefined ? `（${rm(x.amount)}）` : ''}</li>)}
                    </ul>
                </div>
            )}
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-stone-600">
                {info.map((x, i) => <li key={i}>· {x.label}{x.amount !== undefined ? `（${rm(x.amount)}）` : ''}</li>)}
                {E.excluded.map(x => <li key={x.label}>· 不计入：{x.label} {rm(x.amount)}</li>)}
            </ul>
            <details className="mt-2 text-xs">
                <summary className="min-h-[36px] cursor-pointer font-bold text-stone-600">各项明细与来源</summary>
                {(['revenue', 'platform', 'food', 'labour', 'opex'] as const).map(k => (
                    <div key={k} className="mt-2">
                        <p className="font-black">{{ revenue: '营业额', platform: '外送平台扣款', food: '食材（采购暂估）', labour: '人工', opex: '其他经营费用' }[k]}：{rm(E[k])}</p>
                        <table className="w-full"><tbody>
                            {E.detail[k].map(x => (
                                <tr key={x.label} className="border-t border-stone-100">
                                    <td className="py-0.5 font-mono">{x.label}{x.note && <span className="font-sans text-stone-500"> · {x.note}</span>}</td>
                                    <td className="text-right font-mono">{rm(x.amount)}</td>
                                </tr>
                            ))}
                        </tbody></table>
                    </div>
                ))}
                {E.fallbackCategories.length > 0 && (
                    <p className="mt-2 text-amber-800">没有对应会计科目、已归入「其他」的分类：{E.fallbackCategories.map(f => `${f.original} ${rm(f.amount)} → ${f.line || f.key}`).join('；')}</p>
                )}
            </details>
        </section>
    );
};


const BatchView: React.FC<{ rows: MonthReconciliation[]; progress: string; error: string; summary: string; copied: '' | 'ok' | 'fail'; onCopy: () => void }> = ({ rows, progress, error, summary, copied, onCopy }) => (
    <>
        {!rows.length && !progress && !error && (
            <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-relaxed text-stone-600">
                选择起讫月份后按「开始对账」，逐月比较修改前（驾驶舱、财务报表首页、传统账目）与修改后（唯一盈亏引擎）的经营盈亏，
                并列出每个月仍待核对的项目。只读，不写入任何资料。
            </p>
        )}
        {progress && <p className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm font-bold"><Loader2 size={16} className="animate-spin" />{progress}</p>}
        {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        {rows.length > 0 && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
                <h3 className="text-sm font-black">修改前后经营盈亏</h3>
                <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-xs">
                        <thead className="text-stone-500">
                            <tr>
                                <th className="py-1 text-left">月份</th>
                                <th className="text-right">修改前·驾驶舱</th>
                                <th className="text-right">财报首页</th>
                                <th className="text-right">传统账目</th>
                                <th className="text-right text-emerald-700">修改后</th>
                                <th className="text-right">修改后−驾驶舱</th>
                                <th className="pl-2 text-left">状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.month} className="border-t border-stone-100">
                                    <td className="py-1.5 font-mono">{r.month}</td>
                                    <td className="text-right font-mono">{rm(r.algorithms.C.netProfit)}</td>
                                    <td className="text-right font-mono">{rm(r.algorithms.A.netProfit)}</td>
                                    <td className="text-right font-mono">{rm(r.algorithms.B.netProfit)}</td>
                                    <td className="text-right font-mono font-black text-emerald-800">{rm(r.engine.netProfit)}</td>
                                    <td className="text-right font-mono">{signed(r.engine.netProfit - r.algorithms.C.netProfit)}</td>
                                    <td className="pl-2">{PNL_STATUS_LABEL[r.engine.status]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-3 space-y-3">
                    {rows.map(r => (
                        <div key={r.month} className="text-xs leading-relaxed">
                            <p className="font-black">{r.month} 仍待核对</p>
                            <ul className="mt-0.5 space-y-0.5 text-stone-700">
                                {r.engine.reasons.filter(x => x.level === 'BLOCKING').map((x, i) => <li key={i}>※ {x.label}{x.amount !== undefined ? `（${rm(x.amount)}）` : ''}</li>)}
                                {!r.engine.reasons.some(x => x.level === 'BLOCKING') && <li>没有待核对项目</li>}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>
        )}
        {summary && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-center gap-2">
                    <h3 className="flex-1 text-sm font-black">多月对账摘要（只有金额与笔数）</h3>
                    <button onClick={onCopy} className="flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-bold text-stone-600 hover:bg-stone-100">
                        <Copy size={14} /> {copied === 'ok' ? '已复制' : '复制'}
                    </button>
                </div>
                {copied === 'fail' && <p className="mt-1 text-xs text-red-600">无法自动复制，请手动选取下方文字。</p>}
                <textarea readOnly value={summary} className="mt-2 h-56 w-full rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-[11px]" />
            </section>
        )}
    </>
);

const Bridge: React.FC<{ title: string; rows: { label: string; amount: number }[]; total: number; unexplained: number }> = ({ title, rows, total, unexplained }) => (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-black">{title}：{signed(total)}</h3>
        <table className="mt-2 w-full text-sm">
            <tbody>
                {rows.filter(r => Math.abs(r.amount) >= 0.005).map(r => (
                    <tr key={r.label} className="border-t border-stone-100">
                        <td className="py-1.5">{r.label}</td>
                        <td className="text-right font-mono">{signed(r.amount)}</td>
                    </tr>
                ))}
                <tr className={`border-t border-stone-200 font-black ${Math.abs(unexplained) >= 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>
                    <td className="py-1.5">未能逐项解释的差额</td>
                    <td className="text-right font-mono">{signed(unexplained)}</td>
                </tr>
            </tbody>
        </table>
        <p className="mt-1 text-[11px] text-stone-500">正数 = 左边的算法因此比驾驶舱多算了利润。</p>
    </section>
);

const FindingRow: React.FC<{ f: ReconFinding }> = ({ f }) => {
    const [open, setOpen] = useState(false);
    const empty = f.count === 0 && Math.abs(f.amount) < 0.005;
    return (
        <div className="py-2">
            <button onClick={() => setOpen(o => !o)} className="flex min-h-[44px] w-full items-center gap-2 text-left" aria-expanded={open}>
                <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${empty ? 'text-stone-400' : ''}`}>
                        {f.title}
                        {f.needsDecision && !empty && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-800">需确认</span>}
                    </span>
                    <span className="block text-xs text-stone-500">{empty ? '这个月没有' : `${f.count} 笔 · ${rm(f.amount)}`}</span>
                </span>
                <ChevronDown size={16} className={`shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="mt-1 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
                    <p>{f.detail}</p>
                    {(f.effectOnA !== undefined || f.effectOnB !== undefined) && (
                        <p className="mt-1 font-bold">
                            对净利的影响（相对驾驶舱）：
                            {f.effectOnA !== undefined && ` 财务报表首页 ${signed(f.effectOnA)}`}
                            {f.effectOnB !== undefined && ` · 传统账目 ${signed(f.effectOnB)}`}
                        </p>
                    )}
                    {f.records.length > 0 && (
                        <table className="mt-2 w-full">
                            <tbody>
                                {f.records.slice(0, 100).map((r, i) => (
                                    <tr key={i} className="border-t border-stone-200 align-top">
                                        <td className="py-1 pr-2 font-mono">{r.date}</td>
                                        <td className="pr-2">{r.label}{r.note && <div className="text-stone-500">{r.note}</div>}</td>
                                        <td className="text-right font-mono">{r.amount ? rm(r.amount) : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {f.records.length > 100 && <p className="mt-1 text-stone-500">另有 {f.records.length - 100} 笔未列出。</p>}
                </div>
            )}
        </div>
    );
};

const PENALTY_LABEL: Record<string, string> = {
    NO_PENALTY: '—', PENALTY_DEDUCTED: '已扣', PENALTY_NOT_DEDUCTED: '记录但未扣', MISMATCH: '实发对不上',
};

const PayrollSection: React.FC<{ r: MonthReconciliation }> = ({ r }) => {
    const p = r.payroll!;
    const t = p.totals;
    return (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-black">薪资字段核对（{p.month} · {p.status === 'POSTED' ? '已发放' : '草稿'} · 法定供款{p.isStatutoryPaid ? '已缴' : '未缴'}）</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
                逐人用存档的实发反推：每个扣款字段是否真的从实发扣掉。只有能完全推算的人，才计算建议口径（应发 − 无薪假 − 已扣罚款 + 雇主供款）。
                住宿费、扣回借款、其他扣款是员工还钱，不改变人工成本；预支已含在应发里。
            </p>
            <div className="mt-2 max-h-96 overflow-auto">
                <table className="w-full min-w-[760px] text-xs">
                    <thead className="sticky top-0 bg-white text-stone-500">
                        <tr>
                            <th className="py-1 text-left">员工</th><th className="text-right">应发</th><th className="text-right">无薪假</th><th className="text-right">罚款</th><th className="text-left pl-2">罚款状态</th>
                            <th className="text-right">预支扣回</th><th className="text-right">雇主供款</th><th className="text-right">实发</th>
                            <th className="text-right">A 口径</th><th className="text-right">B 口径</th><th className="text-right">C 口径</th><th className="text-right">建议口径</th>
                        </tr>
                    </thead>
                    <tbody>
                        {p.employees.map(e => (
                            <tr key={e.employeeId} className={`border-t border-stone-100 ${e.penaltyStatus === 'MISMATCH' || e.basicBelowProfileWithUnpaidLeave ? 'bg-amber-50' : ''}`}>
                                <td className="py-1">{e.employeeName}{e.basicBelowProfileWithUnpaidLeave && <div className="text-[11px] font-bold text-amber-700">底薪已低于档案又有无薪假</div>}</td>
                                <td className="text-right font-mono">{rm(e.gross)}</td>
                                <td className="text-right font-mono">{e.unpaidLeave ? rm(e.unpaidLeave) : ''}</td>
                                <td className="text-right font-mono">{e.penalty ? rm(e.penalty) : ''}</td>
                                <td className="pl-2">{PENALTY_LABEL[e.penaltyStatus]}{e.penaltyStatus === 'MISMATCH' && ` ${signed(e.netPayGap)}`}</td>
                                <td className="text-right font-mono">{e.advanceLoan ? rm(e.advanceLoan) : ''}</td>
                                <td className="text-right font-mono">{rm(e.employerStatutory)}</td>
                                <td className="text-right font-mono">{rm(e.netPay)}</td>
                                <td className="text-right font-mono">{rm(e.asFinancialReport)}</td>
                                <td className="text-right font-mono">{rm(e.asClassic)}</td>
                                <td className="text-right font-mono">{rm(e.asCockpit)}</td>
                                <td className="text-right font-mono">{e.proposed === null ? '—' : rm(e.proposed)}</td>
                            </tr>
                        ))}
                        <tr className="border-t-2 border-stone-300 font-black">
                            <td className="py-1">合计</td>
                            <td className="text-right font-mono">{rm(t.gross)}</td>
                            <td className="text-right font-mono">{rm(t.unpaidLeave)}</td>
                            <td className="text-right font-mono">{rm(t.penaltyDeducted + t.penaltyNotDeducted)}</td>
                            <td />
                            <td className="text-right font-mono">{rm(t.advanceLoan)}</td>
                            <td className="text-right font-mono">{rm(t.employerStatutory)}</td>
                            <td className="text-right font-mono">{rm(t.netPay)}</td>
                            <td className="text-right font-mono">{rm(t.asFinancialReport)}</td>
                            <td className="text-right font-mono">{rm(t.asClassic)}</td>
                            <td className="text-right font-mono">{rm(t.asCockpit)}</td>
                            <td className="text-right font-mono">{t.proposed === null ? '—' : rm(t.proposed)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-stone-600">
                <li>A 口径 = 实发 + 员工与雇主法定供款（含 PCB）；B 口径 = 实发（法定供款已缴才另计）；C 口径 = 应发 + 雇主供款。</li>
                <li>当月预支支出 {rm(p.advanceExpenses)}，薪资单扣回 {rm(t.advanceLoan)}{Math.abs(p.advanceExpenses - t.advanceLoan) > 0.01 ? '，两者不同，请核对' : ''}。</li>
                {Math.abs(p.govtGap) > 0.05 && <li className="font-bold text-amber-700">存档的法定供款合计与逐人加总差 {signed(p.govtGap)}。</li>}
            </ul>
        </section>
    );
};

export default PnLReconciliation;
