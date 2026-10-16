// ============================================================================
// 杂项费用专项审计 · 只读
// ----------------------------------------------------------------------------
// 选月份按「开始审计」才读取；逐笔列出该月全部应付账款 / 独立支出在传统账目的去向，
// 与传统账目各科目核对，列出没有进入任何科目、分类可疑、钱箱有支出但 AP 可能缺失的记录。
// 不修改任何资料、分类或盈亏算法。
// ============================================================================
import React, { useMemo, useState } from 'react';
import { ChevronDown, Copy, Download, Loader2, X } from 'lucide-react';
import { getBusinessDateString } from '../../../utils/dateHelper';
import { exportExpenseAuditExcel, expenseAuditSummaryText, loadExpenseAudit } from '../../../utils/pnl/audit/expenseAuditReport';
import { TREATMENT_LABEL, type AuditRow, type ExpenseAuditResult, type Treatment } from '../../../utils/pnl/audit/expenseAudit';
import { CASH_BOX_KIND_LABEL, CASH_BOX_STATUS_LABEL, CASH_BOX_USE_LABEL, type CashBoxStatus } from '../../../utils/pnl/engine/cashBox';
import { downloadBlob } from '../../../utils/classicPnLExport';

const rm = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const previousMonth = (today: string) => {
    const [y, m] = today.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const Card: React.FC<{ title: string; children: React.ReactNode; note?: string }> = ({ title, children, note }) => (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-black">{title}</h3>
        {note && <p className="mt-1 text-xs leading-relaxed text-stone-600">{note}</p>}
        <div className="mt-2">{children}</div>
    </section>
);

const RowsTable: React.FC<{ rows: AuditRow[]; showSuggestion?: boolean; limit?: number }> = ({ rows, showSuggestion, limit = 200 }) => (
    <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[640px] text-xs">
            <thead className="sticky top-0 bg-white text-stone-500">
                <tr>
                    <th className="py-1 text-left">日期</th><th className="text-left">供应商 · 项目</th><th className="text-right">金额</th>
                    <th className="pl-2 text-left">原始分类 → 传统账目科目</th>{showSuggestion && <th className="pl-2 text-left">建议</th>}<th className="pl-2 text-left">凭证</th>
                </tr>
            </thead>
            <tbody>
                {rows.slice(0, limit).map(r => (
                    <tr key={r.id} className="border-t border-stone-100 align-top">
                        <td className="py-1 pr-2 font-mono">{r.date.slice(5)}</td>
                        <td className="pr-2">{r.supplier || '（没有供应商）'}{r.item && <div className="text-stone-500">{r.item}</div>}</td>
                        <td className="whitespace-nowrap text-right font-mono">{rm(r.accrualAmount)}</td>
                        <td className="pl-2">
                            <span className="font-mono">{r.category}</span> → {r.parts.map(p => p.line || '（没有科目）').join('；')}
                            <div className="text-stone-500">{TREATMENT_LABEL[r.treatment]}{r.duplicateInstalment ? ' · 分期付款重复计入' : ''}</div>
                        </td>
                        {showSuggestion && <td className="pl-2">{r.suspicion?.suggestedCategory ? <><span className="font-mono">{r.suspicion.suggestedCategory}</span><div className="text-stone-500">{r.suspicion.reason}</div></> : r.suspicion?.reason}</td>}
                        <td className="pl-2">{r.voucher ? <a href={r.voucher} target="_blank" rel="noreferrer" className="text-blue-700 underline">单据</a> : r.invoiceRef || <span className="text-amber-700">无</span>}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        {rows.length > limit && <p className="mt-1 text-xs text-stone-500">另有 {rows.length - limit} 笔，请下载 Excel 查看。</p>}
    </div>
);

export const ExpenseAudit: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const today = getBusinessDateString();
    const [month, setMonth] = useState(previousMonth(today));
    const [result, setResult] = useState<ExpenseAuditResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
    const [exporting, setExporting] = useState(false);
    const [treatmentFilter, setTreatmentFilter] = useState<Treatment | 'ALL'>('ALL');
    const [search, setSearch] = useState('');
    const [cashFilter, setCashFilter] = useState<CashBoxStatus>('MISSING');
    const [openFocus, setOpenFocus] = useState<string | null>(null);

    const run = async () => {
        setLoading(true); setError(''); setCopied('');
        try { setResult(await loadExpenseAudit(month)); }
        catch (e: any) { setError(e?.message || '读取失败'); setResult(null); }
        finally { setLoading(false); }
    };
    const summary = useMemo(() => (result ? expenseAuditSummaryText(result) : ''), [result]);
    const copy = async () => {
        try { await navigator.clipboard.writeText(summary); setCopied('ok'); } catch { setCopied('fail'); }
    };
    const download = async () => {
        if (!result) return;
        setExporting(true);
        try { downloadBlob(await exportExpenseAuditExcel(result), `杂项费用审计_${result.month}.xlsx`); }
        finally { setExporting(false); }
    };
    const filteredRows = useMemo(() => {
        if (!result) return [];
        const q = search.trim().toLowerCase();
        return result.rows.filter(r => (treatmentFilter === 'ALL' || r.treatment === treatmentFilter)
            && (!q || [r.supplier, r.item, r.category, r.invoiceRef].join(' ').toLowerCase().includes(q)));
    }, [result, treatmentFilter, search]);

    const t = result?.totals;
    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white px-4 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">杂项费用专项审计</h2>
                        <p className="truncate text-[11px] font-bold text-stone-500">只读 · 逐笔检查应付账款 / 独立支出在传统账目的去向</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm font-bold">月份
                        <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)} className="min-h-[40px] rounded-lg border border-stone-300 px-2 font-mono" />
                    </label>
                    <button onClick={run} disabled={loading || !month} className="flex min-h-[40px] items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-black text-white disabled:opacity-50">
                        {loading && <Loader2 size={16} className="animate-spin" />} 开始审计
                    </button>
                    {result && (
                        <button onClick={download} disabled={exporting} className="flex min-h-[40px] items-center gap-2 rounded-full border border-stone-300 px-4 text-sm font-bold disabled:opacity-50">
                            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 下载 Excel 报告
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                <div className="mx-auto max-w-5xl space-y-4">
                    {!result && !loading && !error && (
                        <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-relaxed text-stone-600">
                            选择月份后按「开始审计」。系统会读取该月全部应付账款 / 独立支出、日结与固定账单付款（只读），
                            逐笔列出原始分类与传统账目目前归入的科目，核对各科目金额，找出没有进入任何科目、分类可能不合理、
                            以及钱箱有支出但应付账款可能缺失的记录。不会修改任何资料或分类。
                        </p>
                    )}
                    {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
                    {result && t && (
                        <>
                            <Card title={`总览 · ${result.month}`}>
                                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                    {[
                                        ['AP 笔数', String(t.count)], ['AP 原始费用总额', rm(t.apTotal)], ['已计入传统账目', rm(t.counted)], ['没有进入任何科目', rm(t.notInClassic)],
                                        ['列在 CAPEX', rm(t.capex)], ['不计入（转账 / 押金 / 借款）', rm(t.nonOperating)], ['由日结副本计入', rm(t.viaSettlement)], ['分期付款重复计入', rm(t.duplicateInstalments)],
                                        ['疑似分类问题', `${result.suspicious.length} 笔`], ['没有凭证（已计入）', `${t.missingVoucher} 笔`],
                                        ['钱箱缺 AP 记录', `${result.cashBox.byStatus.MISSING.count} 笔 · ${rm(result.cashBox.byStatus.MISSING.amount)}`], ['UTC 切日计到别月', `${t.utcShifted} 笔`],
                                    ].map(([k, v]) => (
                                        <div key={k} className="rounded-xl bg-stone-50 p-2"><div className="text-stone-500">{k}</div><div className="font-mono text-sm font-black">{v}</div></div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="传统账目各科目核对" note="每个科目的金额 = 应付账款 + 固定账单付款 + 日结副本 + 系统计算（薪资单、平台抽佣）。差额不为 0 代表有钱没被解释。">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[680px] text-xs">
                                        <thead className="text-stone-500"><tr><th className="py-1 text-left">科目</th><th className="text-right">AP</th><th className="text-right">固定账单</th><th className="text-right">日结副本</th><th className="text-right">系统计算</th><th className="text-right">传统账目</th><th className="text-right">差额</th></tr></thead>
                                        <tbody>
                                            {result.lineChecks.map(x => (
                                                <tr key={x.line} className="border-t border-stone-100">
                                                    <td className="py-1">{x.line} <span className="text-stone-400">{x.section}</span></td>
                                                    <td className="text-right font-mono">{rm(x.fromAP)}</td><td className="text-right font-mono">{rm(x.fromBills)}</td>
                                                    <td className="text-right font-mono">{rm(x.fromSettlement)}</td><td className="text-right font-mono">{rm(x.computed)}</td>
                                                    <td className="text-right font-mono font-black">{rm(x.classic)}</td>
                                                    <td className={`text-right font-mono ${Math.abs(x.diff) > 0.005 ? 'font-black text-red-700' : 'text-emerald-700'}`}>{rm(x.diff)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            <Card title={`没有进入任何科目：${result.notInClassic.length} 笔 · ${rm(t.notInClassic)}`} note="这些支出的分类不在传统账目的任何一行，目前整笔没有被计算。">
                                {result.notInClassic.length ? <RowsTable rows={result.notInClassic} /> : <p className="text-xs text-stone-500">没有。</p>}
                            </Card>

                            <Card title="重点类别" note="SUPPLIES、MISC_OPEX、EXPENSE、MAINTENANCE、PACKAGING、IT_SOFTWARE 等。点开看每一笔。">
                                <div className="divide-y divide-stone-100">
                                    {Object.entries(result.focus).map(([k, v]) => (
                                        <div key={k} className="py-1">
                                            <button onClick={() => setOpenFocus(openFocus === k ? null : k)} className="flex min-h-[44px] w-full items-center gap-2 text-left" aria-expanded={openFocus === k}>
                                                <span className="flex-1 text-sm font-bold"><span className="font-mono">{k}</span> · {v.count} 笔 · {rm(v.amount)}{v.rows.some(r => r.suspicion) && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-800">{v.rows.filter(r => r.suspicion).length} 笔可疑</span>}</span>
                                                <ChevronDown size={16} className={`text-stone-400 ${openFocus === k ? 'rotate-180' : ''}`} />
                                            </button>
                                            {openFocus === k && <RowsTable rows={v.rows} showSuggestion />}
                                        </div>
                                    ))}
                                    {!Object.keys(result.focus).length && <p className="text-xs text-stone-500">这个月没有这些类别。</p>}
                                </div>
                            </Card>

                            <Card title={`疑似分类错误 / 太笼统：${result.suspicious.length} 笔`} note="依供应商与项目文字推测，只是建议；请在应付账款逐笔确认后手动修改，系统不会自动改。薪资、兼职、预支、借款不在检查范围。">
                                {result.suspicious.length ? <RowsTable rows={result.suspicious} showSuggestion /> : <p className="text-xs text-stone-500">没有。</p>}
                            </Card>

                            <Card title={`钱箱支出对照：${result.cashBox.entries.length} 笔 · ${rm(result.cashBox.total)}`} note="钱箱支出不计入盈亏，只用来找出应付账款可能漏登的费用。只有金额相近的列为「待核对」，不自动当成同一笔。">
                                <div className="flex flex-wrap gap-2">
                                    {(['MISSING', 'MISMATCH', 'TO_VERIFY', 'MATCHED'] as const).map(k => (
                                        <button key={k} onClick={() => setCashFilter(k)} aria-pressed={cashFilter === k} className={`min-h-[36px] rounded-full px-3 text-xs font-black ${cashFilter === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>
                                            {CASH_BOX_STATUS_LABEL[k]} {result.cashBox.byStatus[k].count} · {rm(result.cashBox.byStatus[k].amount)}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 max-h-96 overflow-y-auto">
                                    <table className="w-full text-xs"><tbody>
                                        {result.cashBox.entries.filter(e => e.status === cashFilter).sort((a, b) => b.amount - a.amount).slice(0, 300).map((e, i) => (
                                            <tr key={i} className="border-t border-stone-100 align-top">
                                                <td className="py-1 pr-2 font-mono">{e.date.slice(5)}</td>
                                                <td className="pr-2">{e.text}<div className="text-stone-500">{e.match ? `${CASH_BOX_KIND_LABEL[e.match.kind]}：${e.match.name || e.match.category}（${e.match.date}，${rm(e.match.amount)}）· ` : ''}{e.note} · 用途：{CASH_BOX_USE_LABEL[e.use]}</div></td>
                                                <td className="whitespace-nowrap text-right font-mono">{rm(e.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody></table>
                                </div>
                            </Card>

                            <Card title={`逐笔明细：${result.rows.length} 笔`}>
                                <div className="mb-2 flex flex-wrap gap-2">
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜寻供应商、项目、分类" className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-stone-300 px-2 text-sm" />
                                    <select value={treatmentFilter} onChange={e => setTreatmentFilter(e.target.value as Treatment | 'ALL')} className="min-h-[40px] rounded-lg border border-stone-300 px-2 text-sm">
                                        <option value="ALL">全部处理方式</option>
                                        {(Object.keys(TREATMENT_LABEL) as Treatment[]).map(k => <option key={k} value={k}>{TREATMENT_LABEL[k]}</option>)}
                                    </select>
                                </div>
                                <RowsTable rows={filteredRows} showSuggestion limit={300} />
                            </Card>

                            <Card title="修正建议">
                                <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed">{result.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ol>
                                {!result.suggestions.length && <p className="text-xs text-stone-500">没有需要修正的项目。</p>}
                            </Card>

                            <Card title="审计摘要（可复制贴回；薪资 / 兼职 / 预支等含员工姓名的记录只列笔数）">
                                <div className="flex justify-end">
                                    <button onClick={copy} className="flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-bold text-stone-600 hover:bg-stone-100"><Copy size={14} /> {copied === 'ok' ? '已复制' : '复制'}</button>
                                </div>
                                {copied === 'fail' && <p className="mt-1 text-xs text-red-600">无法自动复制，请手动选取下方文字。</p>}
                                <textarea readOnly value={summary} className="mt-2 h-64 w-full rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-[11px]" />
                            </Card>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

export default ExpenseAudit;
