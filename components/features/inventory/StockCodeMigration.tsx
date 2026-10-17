// 库存编号整理（全部重新连号 + 命名建议）· 只给负责人 / 系统管理员
// 打开画面只读取；写入必须：下载备份 → 读回备份档确认 → 看过预览 → 输入「确认」。
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Download, Upload, CheckCircle2, AlertTriangle, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { DataManager } from '../../../utils/dataManager';
import type { StockCodeMigrationRun } from '../../../types';
import { CATEGORY_SECTIONS, getCategoryLabel } from './inventoryConstants';
import { planFingerprint, planRenumber, type RenumberPlan, type RenumberRow } from '../../../utils/inventory/stockCode';
import {
    applyRenumberPlan, checkBackupFile, createBackup, loadStockSnapshot, rollbackRenumber, verifyRenumber,
    RUNS, type BackupFile, type StockSnapshot, type VerifyCheck,
} from '../../../utils/inventory/stockCodeMigration';
import { assignCodeToExisting } from '../../../utils/inventory/stockCodeAllocator';

const ORDER = Object.fromEntries(Object.entries(CATEGORY_SECTIONS).map(([k, v]) => [k, v.map(s => s.id)]));
const AREA_LABEL: Record<string, string> = { KITCHEN: '厨房', BAR: '水吧', GENERAL: '后勤', FUEL: '燃料' };
const ISSUE_LABEL: Record<string, string> = { MISSING_ENGLISH: '缺英文名', MISSING_CHINESE: '缺中文名', NEEDS_MANUAL: '需人工命名' };
type Filter = 'ALL' | 'SUGGEST' | 'ISSUE' | 'DUP';

const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

interface Props { operatorName: string; onClose: () => void; onChanged: () => void }

export const StockCodeMigration: React.FC<Props> = ({ operatorName, onClose, onChanged }) => {
    const [loading, setLoading] = useState(true);
    const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
    const [plan, setPlan] = useState<RenumberPlan | null>(null);
    const [runs, setRuns] = useState<StockCodeMigrationRun[]>([]);
    const [backup, setBackup] = useState<BackupFile | null>(null);
    const [backupMessages, setBackupMessages] = useState<string[]>([]);
    const [backupOk, setBackupOk] = useState(false);
    const [renames, setRenames] = useState<Record<string, string>>({});
    const [filter, setFilter] = useState<Filter>('ALL');
    const [confirmText, setConfirmText] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [progress, setProgress] = useState('');
    const [resultMessages, setResultMessages] = useState<string[]>([]);
    const [checks, setChecks] = useState<VerifyCheck[]>([]);

    const load = async () => {
        setLoading(true);
        try {
            const snap = await loadStockSnapshot(db);
            setSnapshot(snap);
            setPlan(planRenumber(snap.items, ORDER, snap.blockedIds));
            const r = await getDocs(collection(db, RUNS));
            setRuns(r.docs.map(d => d.data() as StockCodeMigrationRun).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const alreadyDone = runs.some(r => r.status === 'DONE' || r.status === 'PARTIAL');
    const rows = useMemo(() => (plan?.rows || []).filter(r =>
        filter === 'ALL' ? true
            : filter === 'SUGGEST' ? !!r.suggestedName
                : filter === 'ISSUE' ? !!r.nameIssue
                    : r.duplicateNameWith.length > 0), [plan, filter]);
    const counts = useMemo(() => {
        const all = plan?.rows || [];
        return { suggest: all.filter(r => r.suggestedName).length, issue: all.filter(r => r.nameIssue).length, dup: all.filter(r => r.duplicateNameWith.length).length };
    }, [plan]);

    const toggleRename = (r: RenumberRow, on: boolean) => setRenames(prev => {
        const next = { ...prev };
        if (on) next[r.stockId] = prev[r.stockId] ?? r.suggestedName ?? r.name; else delete next[r.stockId];
        return next;
    });
    const acceptAllSuggestions = () => setRenames(prev => {
        const next = { ...prev };
        (plan?.rows || []).forEach(r => { if (r.suggestedName && next[r.stockId] === undefined) next[r.stockId] = r.suggestedName; });
        return next;
    });

    const exportCsv = () => {
        if (!plan) return;
        const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['区域', '新编号', '以前显示', '子分类', '现在名称', '建议名称', '是否采用新名称', '问题', '同名商品'];
        const lines = plan.rows.map(r => [AREA_LABEL[r.area], r.newCode, r.oldDisplay, getCategoryLabel(r.category), r.name, r.suggestedName || '',
            renames[r.stockId] !== undefined ? renames[r.stockId] : '', r.nameIssue ? ISSUE_LABEL[r.nameIssue] : '',
            r.duplicateNameWith.length ? `与 ${r.duplicateNameWith.length} 个同名` : ''].map(esc).join(','));
        const blocked = plan.blocked.map(b => ['', '（不配号）', b.stockId, '', '', '', '', b.reason, ''].map(esc).join(','));
        download(`库存编号预览-${stamp()}.csv`, '﻿' + [header.map(esc).join(','), ...lines, ...blocked].join('\n'), 'text/csv;charset=utf-8');
    };

    const makeBackup = async () => {
        setBusy('backup');
        try {
            const b = await createBackup(db, operatorName);
            download(`klk-stock-backup-${stamp()}.json`, JSON.stringify(b), 'application/json');
            setBackup(b); setBackupOk(false);
            setBackupMessages(['备份档已下载。请在下面选择刚下载的档案，确认可以读回来。']);
        } catch (e: any) { alert(`备份失败：${e?.message || e}`); } finally { setBusy(null); }
    };

    const checkBackup = async (file: File) => {
        setBusy('check');
        try {
            const r = await checkBackupFile(db, await file.text());
            setBackupMessages(r.messages); setBackupOk(r.ok);
            if (r.ok && r.backup) setBackup(r.backup);
        } finally { setBusy(null); }
    };

    const apply = async () => {
        if (!plan || !backup || !backupOk) return;
        setBusy('apply'); setResultMessages([]); setChecks([]);
        try {
            // 写入前重新读取：资料若在预览后变动，计划会不同，要重新预览
            const fresh = await loadStockSnapshot(db);
            const freshPlan = planRenumber(fresh.items, ORDER, fresh.blockedIds);
            if (planFingerprint(freshPlan) !== planFingerprint(plan)) {
                alert('库存资料在预览后有变动（新增、删除或改名），已重新产生预览，请再看一次。');
                setSnapshot(fresh); setPlan(freshPlan); return;
            }
            const runId = `run_${stamp()}`;
            const summary = Object.entries(backup.collections).map(([c, v]) => ({ collection: c, count: v.count, sha256: v.sha256 }));
            const res = await applyRenumberPlan(db, plan, {
                runId, by: operatorName, renames, backupSummary: summary,
                onProgress: (d, t) => setProgress(`${d} / ${t}`),
            });
            DataManager.clearCacheKeys(['stock_']);
            setResultMessages([`执行编号 ${runId}：完成 ${res.done}，跳过 ${res.skipped}，失败 ${res.failed}，改名 ${res.renamed}`, ...res.messages]);
            setChecks(await verifyRenumber(db, plan, backup));
            onChanged();
            await load();
        } catch (e: any) { alert(`写入停止：${e?.message || e}`); } finally { setBusy(null); setProgress(''); setConfirmText(''); }
    };

    // 重新连号之后仍没编号的：V1 新增的商品、处理好的复制品
    const unnumbered = useMemo(() => (snapshot?.items || []).filter(i => !i.stockCode && !snapshot!.blockedIds.has(i.id)), [snapshot]);
    const assignMissing = async () => {
        if (!window.confirm(`为 ${unnumbered.length} 个未编号商品配下一个号码？`)) return;
        setBusy('assign');
        const msgs: string[] = [];
        let n = 0;
        try {
            for (const i of unnumbered) {
                try {
                    const code = await assignCodeToExisting(db, i.area, i.id, operatorName);
                    if (code) { n++; msgs.push(`${code} ← ${i.name}`); }
                } catch (e: any) { msgs.push(`${i.name}：${e?.message || e}`); }
            }
            DataManager.clearCacheKeys(['stock_']);
            setResultMessages([`已配号 ${n} 个`, ...msgs]);
            onChanged();
            await load();
        } finally { setBusy(null); }
    };

    const rollback = async (run: StockCodeMigrationRun) => {
        if (!window.confirm(`确定回滚 ${run.id}？\n会删除这次写入的编号，并把这次改过的名称改回去。数量、成本等其他资料不会动。`)) return;
        setBusy('rollback');
        try {
            const r = await rollbackRenumber(db, run.id);
            DataManager.clearCacheKeys(['stock_']);
            setResultMessages([`已回滚 ${r.reverted} 个商品`, ...r.messages]);
            onChanged();
            await load();
        } catch (e: any) { alert(`回滚停止：${e?.message || e}`); } finally { setBusy(null); }
    };

    const step = (n: number, title: string, done: boolean, body: React.ReactNode) => (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-[#111111]">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${done ? 'bg-green-500 text-white' : 'bg-[#111111] text-[#FFD200]'}`}>{done ? '✓' : n}</span>
                {title}
            </h3>
            {body}
        </section>
    );

    return (
        <div className="fixed inset-0 z-[120] flex items-stretch justify-center bg-black/50 md:items-center md:p-6">
            <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-[#F6F7FB] md:max-h-[92vh] md:rounded-3xl">
                <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
                    <div>
                        <h2 className="text-base font-black text-[#111111]">库存编号整理</h2>
                        <p className="text-[11px] font-bold text-gray-500">全部重新连号（K0001 厨房 · B 水吧 · G 后勤 · F 燃料）＋ 名称统一「中文 (English)」</p>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100" aria-label="关闭"><X size={20} /></button>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {loading || !plan || !snapshot ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-gray-500"><Loader2 className="animate-spin" size={18} /> 读取库存中（只读）…</div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">
                                内部 ID 不会改，供应商连结、采购单、盘点任务、记录都不受影响。只新增编号（旧编号隐藏保存，搜寻仍找得到），名称只改你勾选的。
                                执行时请暂停收货与盘点（约 1–2 分钟）。
                            </div>

                            {step(1, '读取结果（只读）', true, (
                                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                                    {(['KITCHEN', 'BAR', 'GENERAL', 'FUEL'] as const).map(a => (
                                        <div key={a} className="rounded-xl bg-[#F6F7FB] p-2.5">
                                            <div className="font-black text-gray-500">{AREA_LABEL[a]}</div>
                                            <div className="text-lg font-black">{plan.rows.filter(r => r.area === a).length}</div>
                                            {!alreadyDone && <div className="text-[10px] font-bold text-gray-400">配到 {plan.nextSeq[a] > 1 ? `${a === 'KITCHEN' ? 'K' : a === 'BAR' ? 'B' : a === 'GENERAL' ? 'G' : 'F'}${String(plan.nextSeq[a] - 1).padStart(4, '0')}` : '—'}</div>}
                                        </div>
                                    ))}
                                    {snapshot.problems.length > 0 && (
                                        <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-800 md:col-span-4">
                                            <div className="mb-1 flex items-center gap-1 font-black"><AlertTriangle size={14} /> {snapshot.problems.length} 个要人工处理（先不配号）</div>
                                            {snapshot.problems.slice(0, 10).map(p => <div key={p.stockId + p.message} className="font-mono text-[11px]">{p.stockId}：{p.message}</div>)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {!alreadyDone && step(2, '预览与命名建议', false, (
                                <>
                                    <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                        {([['ALL', `全部 ${plan.rows.length}`], ['SUGGEST', `有命名建议 ${counts.suggest}`], ['ISSUE', `需补名称 ${counts.issue}`], ['DUP', `同名 ${counts.dup}`]] as [Filter, string][]).map(([k, label]) => (
                                            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 ${filter === k ? 'bg-[#111111] text-[#FFD200]' : 'border border-gray-200 bg-white text-gray-600'}`}>{label}</button>
                                        ))}
                                        <button onClick={acceptAllSuggestions} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-blue-700">全部采用建议名称</button>
                                        <button onClick={() => setRenames({})} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-gray-600">清除勾选</button>
                                        <button onClick={exportCsv} className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-green-700"><FileSpreadsheet size={12} /> 下载预览（Excel）</button>
                                    </div>
                                    <div className="text-[11px] font-bold text-gray-500">已勾选改名：{Object.keys(renames).length} 个。没勾选的保留原名。</div>
                                    <div className="max-h-[50vh] overflow-auto rounded-xl border border-gray-200">
                                        <table className="w-full min-w-[720px] text-left text-[11px]">
                                            <thead className="sticky top-0 bg-gray-100 text-[10px] font-black uppercase text-gray-500">
                                                <tr><th className="p-2">新编号</th><th className="p-2">以前显示</th><th className="p-2">子分类</th><th className="p-2">现在名称</th><th className="p-2">改名</th><th className="p-2">新名称</th></tr>
                                            </thead>
                                            <tbody>
                                                {rows.map(r => {
                                                    const on = renames[r.stockId] !== undefined;
                                                    return (
                                                        <tr key={r.stockId} className="border-t border-gray-100 bg-white align-top">
                                                            <td className="p-2 font-mono font-black">{r.newCode}</td>
                                                            <td className="p-2 font-mono text-gray-400 break-all">{r.oldDisplay}</td>
                                                            <td className="p-2 text-gray-500">{getCategoryLabel(r.category)}</td>
                                                            <td className="p-2 font-bold">
                                                                {r.name}
                                                                {r.nameIssue && <span className="ml-1 rounded bg-orange-100 px-1 text-[9px] font-black text-orange-700">{ISSUE_LABEL[r.nameIssue]}</span>}
                                                                {r.duplicateNameWith.length > 0 && <span className="ml-1 rounded bg-red-100 px-1 text-[9px] font-black text-red-700">同名</span>}
                                                            </td>
                                                            <td className="p-2"><input type="checkbox" checked={on} onChange={e => toggleRename(r, e.target.checked)} /></td>
                                                            <td className="p-2">
                                                                {on ? (
                                                                    <input className="w-full rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-bold" value={renames[r.stockId]} onChange={e => setRenames(p => ({ ...p, [r.stockId]: e.target.value }))} />
                                                                ) : <span className="text-gray-400">{r.suggestedName || '—'}</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ))}

                            {!alreadyDone && step(3, '备份（写入前必须）', backupOk, (
                                <div className="space-y-2 text-xs">
                                    <div className="flex flex-wrap gap-2">
                                        <button disabled={!!busy} onClick={makeBackup} className="flex items-center gap-1 rounded-xl bg-[#111111] px-3 py-2 font-black text-[#FFD200] disabled:opacity-50">
                                            {busy === 'backup' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 下载备份档
                                        </button>
                                        <label className={`flex cursor-pointer items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 py-2 font-black text-gray-700 ${!backup ? 'pointer-events-none opacity-50' : ''}`}>
                                            {busy === 'check' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 选择刚下载的备份档确认
                                            <input type="file" accept="application/json,.json" className="hidden" onChange={e => e.target.files?.[0] && checkBackup(e.target.files[0])} />
                                        </label>
                                    </div>
                                    {backupMessages.map(m => <div key={m} className={`font-bold ${backupOk ? 'text-green-700' : 'text-gray-600'}`}>{m}</div>)}
                                    <div className="text-[10px] text-gray-400">备份档只存在你的装置里，不会上传。</div>
                                </div>
                            ))}

                            {step(4, '确认写入', checks.length > 0 && checks.every(c => c.ok), (
                                <div className="space-y-2 text-xs">
                                    {alreadyDone ? (
                                        <div className="space-y-2">
                                            <div className="font-bold text-green-700">已经执行过全部重新连号。之后在 V2 新增的商品会自动配下一个号码。</div>
                                            {unnumbered.length > 0 && (
                                                <div className="rounded-xl border border-orange-200 bg-orange-50 p-2.5">
                                                    <div className="font-black text-orange-800">{unnumbered.length} 个商品还没有编号（例如在 V1 新增的）</div>
                                                    <div className="mt-1 text-[11px] text-orange-700">{unnumbered.slice(0, 8).map(i => i.name).join('、')}{unnumbered.length > 8 ? '…' : ''}</div>
                                                    <button disabled={!!busy} onClick={assignMissing} className="mt-2 flex items-center gap-1 rounded-xl bg-[#111111] px-3 py-2 font-black text-[#FFD200] disabled:opacity-50">
                                                        {busy === 'assign' && <Loader2 size={14} className="animate-spin" />} 为未编号商品配号
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="font-bold text-gray-600">
                                                将写入 {plan.rows.length} 个编号、改名 {Object.keys(renames).length} 个。计划指纹 <span className="font-mono">{planFingerprint(plan)}</span>。
                                                请输入「确认」：
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="确认" className="w-28 rounded-xl border border-gray-300 px-3 py-2 font-bold" />
                                                <button disabled={!backupOk || confirmText.trim() !== '确认' || !!busy || plan.rows.length === 0} onClick={apply}
                                                    className="flex items-center gap-1 rounded-xl bg-red-600 px-4 py-2 font-black text-white disabled:opacity-40">
                                                    {busy === 'apply' ? <><Loader2 size={14} className="animate-spin" /> 写入中 {progress}</> : '写入编号'}
                                                </button>
                                            </div>
                                            {!backupOk && <div className="font-bold text-orange-600">要先完成第 3 步备份确认。</div>}
                                        </>
                                    )}
                                    {resultMessages.map((m, i) => <div key={i} className="font-bold text-gray-700">{m}</div>)}
                                    {checks.length > 0 && (
                                        <div className="space-y-1 rounded-xl bg-[#F6F7FB] p-2.5">
                                            <div className="font-black">写入后校验</div>
                                            {checks.map(c => (
                                                <div key={c.label} className={`flex items-center gap-1 font-bold ${c.ok ? 'text-green-700' : 'text-red-700'}`}>
                                                    {c.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {c.label}：{c.detail}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {runs.length > 0 && (
                                <section className="rounded-2xl border border-gray-200 bg-white p-4 text-xs">
                                    <h3 className="mb-2 text-sm font-black">执行记录</h3>
                                    {runs.map(r => (
                                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2">
                                            <div className="font-bold">
                                                <span className="font-mono">{r.id}</span> · {r.status} · {r.by} · 完成 {r.done} / 跳过 {r.skipped} / 失败 {r.failed} / 改名 {r.renamed}
                                            </div>
                                            {(r.status === 'DONE' || r.status === 'PARTIAL') && (
                                                <button disabled={!!busy} onClick={() => rollback(r)} className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 font-black text-red-700 disabled:opacity-50">
                                                    <RotateCcw size={12} /> 回滚这次
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
