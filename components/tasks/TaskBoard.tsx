import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Flag, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search } from 'lucide-react';
import type { Employee, InventoryLog } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getBusinessDateString } from '../../utils/dateHelper';
import { DEPT_LABEL } from '../../utils/hr/hrOverview';
import { getOrgLevel } from '../../utils/orgAccess';
import {
    MATTER_LABEL, MATTER_STATUS_LABEL, TASK_TYPE_LABEL, canEditAssignedTask, consumptionSinceLast, effectiveStatus, nextCycle, normDept, repeatLabel, stocktakeDiffs,
    type BossMatter, type EffectiveStatus, type MatterStatus, type StaffTask,
} from '../../utils/tasks/staffTaskLogic';
import {
    StockConflictError, cancelTask, confirmTask, listManageTasks, listMatters, loadPhotos, recentInventoryLogs, returnTask, updateMatter,
} from '../../utils/tasks/staffTaskStore';
import { MatterCreateSheet, Sheet, TaskCreateSheet, inputCls } from './TaskForms';
import { CashBreakdown } from './CashCounter';
import { formatRm, type CashCountRecord } from '../../utils/tasks/cashCount';
import { listCashCounts } from '../../utils/tasks/cashCountStore';

const GROUPS: { key: EffectiveStatus; label: string; tone: string }[] = [
    { key: 'SUBMITTED', label: '待确认', tone: 'text-amber-700 bg-amber-50 border-amber-200' },
    { key: 'OVERDUE', label: '逾期', tone: 'text-rose-600 bg-rose-50 border-rose-200' },
    { key: 'TODO', label: '待做', tone: 'text-sky-700 bg-sky-50 border-sky-200' },
    { key: 'DONE', label: '已完成', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { key: 'UPCOMING', label: '还没到期', tone: 'text-stone-500 bg-stone-50 border-stone-200' },
];
const who = (t: StaffTask) => t.assignMode === 'PERSON' ? t.assigneeName || '' : `${DEPT_LABEL[t.department || ''] || t.department}（部门）`;
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/** L3 只看自己部门的任务（派给本部门、派给本部门员工、或自己派的） */
const visibleTo = (actor: Employee, staffDept: (id?: string) => string) => (t: StaffTask) => {
    if (getOrgLevel(actor) !== 'DEPARTMENT_HEAD') return true;
    const d = normDept(actor.department);
    return t.createdBy === actor.id || t.department === d || staffDept(t.assigneeId) === d;
};

/** 管理层：任务管理（派任务、看进度、确认 / 退回）+ 上报事项 */
export const TaskBoard: React.FC<{ actor: Employee; autoCreate?: 'STOCKTAKE' | null; onAutoCreateUsed?: () => void }> = ({ actor, autoCreate, onAutoCreateUsed }) => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    useEffect(() => { DataManager.getEmployees().then(setEmployees).catch(() => setEmployees([])); }, []);
    const [tasks, setTasks] = useState<StaffTask[] | null>(null);
    const [matters, setMatters] = useState<BossMatter[]>([]);
    const [reload, setReload] = useState(0);
    const [creating, setCreating] = useState<null | 'TASK' | 'STOCKTAKE' | 'MATTER'>(autoCreate || null);
    useEffect(() => { if (autoCreate) onAutoCreateUsed?.(); }, [autoCreate, onAutoCreateUsed]);
    const [open, setOpen] = useState<StaffTask | null>(null);
    const [openMatter, setOpenMatter] = useState<BossMatter | null>(null);
    const [filter, setFilter] = useState('');
    const [search, setSearch] = useState('');
    const [view, setView] = useState<'ACTIVE' | 'DONE'>('ACTIVE');
    const [expanded, setExpanded] = useState<string[]>([]);
    const [editingTask, setEditingTask] = useState<StaffTask | null>(null);
    const canSeeMatters = ['OWNER', 'BRANCH_MANAGER'].includes(getOrgLevel(actor));
    const today = getBusinessDateString(), now = new Date().toISOString();

    useEffect(() => {
        let on = true;
        listManageTasks().then(t => on && setTasks(t)).catch(() => on && setTasks([]));
        if (canSeeMatters) listMatters().then(m => on && setMatters(m)).catch(() => undefined);
        return () => { on = false; };
    }, [reload, canSeeMatters]);

    const deptOf = useMemo(() => { const m = new Map(employees.map(e => [e.id, normDept(e.department)])); return (id?: string) => (id && m.get(id)) || ''; }, [employees]);
    const shown = (tasks || []).filter(t => t.status !== 'CANCELLED').filter(visibleTo(actor, deptOf))
        .filter(t => !filter || (filter.startsWith('dept:') ? (t.department === filter.slice(5) || deptOf(t.assigneeId) === filter.slice(5)) : t.assigneeId === filter))
        .filter(t => !search.trim() || `${t.title} ${t.assigneeName || ''} ${t.note || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
    const grouped = GROUPS.map(g => ({ ...g, list: shown.filter(t => effectiveStatus(t, today, now) === g.key).filter(t => g.key !== 'DONE' || (t.reviewedAt || t.createdAt) >= new Date(Date.now() - 7 * 864e5).toISOString()) }));
    const visibleGroups = grouped.filter(g => g.list.length && (view === 'DONE' ? g.key === 'DONE' : g.key !== 'DONE'));
    const openMatters = matters.filter(m => m.status === 'OPEN' || m.status === 'ARRANGED');
    const people = [...new Map((tasks || []).filter(t => t.assigneeId).map(t => [t.assigneeId!, t.assigneeName || ''])).entries()];

    return <div className="space-y-4">
        <div className="flex gap-2">
            <button onClick={() => setCreating('TASK')} className="flex-1 min-h-[44px] rounded-xl bg-stone-900 text-[#FFD200] text-sm font-black flex items-center justify-center gap-1.5"><Plus size={16} /> 派任务</button>
            <button onClick={() => setCreating('MATTER')} className="flex-1 min-h-[44px] rounded-xl bg-white border border-stone-200 text-stone-700 text-sm font-black flex items-center justify-center gap-1.5"><Flag size={15} /> 上报</button>
            {(tasks?.length || 0) > 0 && <button onClick={() => setReload(v => v + 1)} className="w-11 min-h-[44px] rounded-xl bg-white border border-stone-200 grid place-items-center" aria-label="重新读取"><RefreshCw size={15} /></button>}
        </div>

        {canSeeMatters && openMatters.length > 0 && <section className="space-y-2">
            <h3 className="text-sm font-black text-stone-800 px-1 flex items-center gap-2">上报事项 <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] grid place-items-center">{openMatters.length}</span></h3>
            {openMatters.map(m => <button key={m.id} onClick={() => setOpenMatter(m)} className="w-full rounded-2xl bg-white border border-stone-200 p-3.5 flex items-center gap-3 text-left">
                <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0"><Flag size={17} /></span>
                <span className="flex-1 min-w-0"><b className="block text-[15px] font-black text-stone-900 truncate">{m.title}</b>
                    <small className="block text-xs text-stone-500 font-semibold">{MATTER_LABEL[m.category]}{m.date ? ` · ${m.date}` : ''} · {m.createdByName} · {MATTER_STATUS_LABEL[m.status]}</small></span>
                <ChevronRight size={18} className="text-stone-300" />
            </button>)}
        </section>}

        <div className="flex gap-2 rounded-xl bg-stone-100 p-1" role="tablist" aria-label="任务状态">{(['ACTIVE', 'DONE'] as const).map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`flex-1 min-h-[42px] rounded-lg text-sm font-black ${view === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>{v === 'ACTIVE' ? '待处理' : '已完成'}</button>)}</div>
        <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜任务或员工" className={`${inputCls} pl-10`} /></div>
        {people.length > 1 && <select value={filter} onChange={e => setFilter(e.target.value)} className={inputCls}>
            <option value="">全部</option>
            {Object.entries(DEPT_LABEL).filter(([k]) => k !== 'OWNER').map(([k, v]) => <option key={k} value={`dept:${k}`}>{v}</option>)}
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>}

        {tasks === null ? <p className="text-center text-sm text-stone-400 py-8"><Loader2 size={16} className="inline animate-spin" /> 读取中…</p>
            : visibleGroups.length === 0 ? <p className="text-center text-sm font-bold text-stone-400 py-3">{view === 'DONE' ? '最近七天没有已完成任务' : '没有待处理任务'}</p>
                : visibleGroups.map(g => <section key={g.key} className="space-y-2">
                    <h3 className="text-sm font-black text-stone-800 px-1 flex items-center gap-2">{g.label}<span className={`text-[11px] px-2 py-0.5 rounded-full border ${g.tone}`}>{g.list.length}</span></h3>
                    <div className="rounded-2xl bg-white border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                        {(expanded.includes(g.key) ? g.list : g.list.slice(0, 8)).map(t => <button key={t.id} onClick={() => setOpen(t)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-stone-50 min-h-[60px]">
                            <span className="flex-1 min-w-0">
                                <b className="block text-[15px] font-black text-stone-900 truncate">{t.title}</b>
                                <small className="block text-xs text-stone-500 font-semibold truncate">{TASK_TYPE_LABEL[t.type]} · {who(t)}{t.repeat !== 'ONCE' ? ` · ${repeatLabel(t)}${g.key === 'UPCOMING' || g.key === 'DONE' ? `（下次 ${nextCycle(t, today)?.slice(5) || '—'}）` : ''}` : t.dueAt ? ` · 期限 ${fmt(t.dueAt)}` : ''}{t.returnCount ? ` · 退回 ${t.returnCount} 次` : ''}</small>
                            </span>
                            <ChevronRight size={18} className="text-stone-300 shrink-0" />
                        </button>)}
                        {g.list.length > 8 && <button onClick={() => setExpanded(v => v.includes(g.key) ? v.filter(x => x !== g.key) : [...v, g.key])} className="w-full min-h-[44px] text-sm font-black text-[#740f10] flex items-center justify-center gap-1">{expanded.includes(g.key) ? '收起' : `显示其余 ${g.list.length - 8} 项`}<ChevronDown size={15} className={expanded.includes(g.key) ? 'rotate-180' : ''} /></button>}
                    </div>
                </section>)}

        {creating === 'TASK' && <TaskCreateSheet actor={actor} onClose={() => setCreating(null)} onCreated={() => setReload(v => v + 1)} />}
        {creating === 'STOCKTAKE' && <TaskCreateSheet actor={actor} initialType="STOCKTAKE" onClose={() => setCreating(null)} onCreated={() => setReload(v => v + 1)} />}
        {creating === 'MATTER' && <MatterCreateSheet actor={actor} onClose={() => setCreating(null)} onCreated={() => setReload(v => v + 1)} />}
        {editingTask && <TaskCreateSheet actor={actor} initialTask={editingTask} onClose={() => setEditingTask(null)} onCreated={() => { setOpen(null); setReload(v => v + 1); }} />}
        {open && !editingTask && <TaskReviewSheet task={open} actor={actor} onEdit={() => { setEditingTask(open); setOpen(null); }} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); setReload(v => v + 1); }} />}
        {openMatter && <MatterSheet matter={openMatter} actor={actor} onClose={() => setOpenMatter(null)} onChanged={() => { setOpenMatter(null); setReload(v => v + 1); }} />}
    </div>;
};

const Photos: React.FC<{ ids?: string[] }> = ({ ids }) => {
    const [srcs, setSrcs] = useState<string[] | null>(null);
    useEffect(() => { if (ids?.length) loadPhotos(ids).then(setSrcs).catch(() => setSrcs([])); else setSrcs([]); }, [ids]);
    if (!ids?.length) return null;
    return <div className="flex flex-wrap gap-2">{srcs === null ? <Loader2 size={16} className="animate-spin text-stone-400" /> : srcs.map((s, i) => <a key={i} href={s} target="_blank" rel="noreferrer"><img src={s} className="w-24 h-24 rounded-xl object-cover border border-stone-200" /></a>)}</div>;
};

/** 查看 / 确认 / 退回一个任务 */
export const TaskReviewSheet: React.FC<{ task: StaffTask; actor: Employee; onEdit?: () => void; onClose: () => void; onChanged: () => void }> = ({ task: t, actor, onEdit, onClose, onChanged }) => {
    const [busy, setBusy] = useState(false);
    const [returning, setReturning] = useState(false);
    const [reason, setReason] = useState('');
    const [conflicts, setConflicts] = useState<string[] | null>(null);
    const [logs, setLogs] = useState<InventoryLog[]>([]);
    const today = getBusinessDateString();
    const status = effectiveStatus(t, today, new Date().toISOString());
    const sub = status === 'SUBMITTED' ? t.submission : t.status === 'DONE' ? t.submission : undefined;
    useEffect(() => {
        if (t.type !== 'STOCKTAKE' || !sub) return;
        const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
        recentInventoryLogs(since).then(setLogs).catch(() => setLogs([]));
    }, [t.type, sub]);

    const act = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        try { await fn(); onChanged(); }
        catch (e: any) { if (e instanceof StockConflictError) setConflicts(e.conflicts); else alert(e?.message || '操作失败'); }
        finally { setBusy(false); }
    };
    const diffs = t.type === 'STOCKTAKE' ? stocktakeDiffs(t) : [];

    return <Sheet title={t.title} onClose={onClose} footer={status === 'SUBMITTED' ? (returning ? <div className="space-y-2">
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={`${inputCls} py-2`} placeholder="退回原因（员工会看到）" />
        <div className="grid grid-cols-2 gap-2"><button onClick={() => setReturning(false)} className="min-h-[48px] rounded-2xl bg-stone-100 font-black">取消</button>
            <button disabled={busy || !reason.trim()} onClick={() => act(() => returnTask(t.id, actor, reason.trim()))} className="min-h-[48px] rounded-2xl bg-rose-600 text-white font-black disabled:opacity-40">退回重做</button></div>
    </div> : conflicts ? <div className="space-y-2">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-800"><AlertTriangle size={14} className="inline mr-1" />员工交回后，库存被改过：<ul className="mt-1 list-disc pl-5">{conflicts.map(c => <li key={c}>{c}</li>)}</ul>确定还是用员工点的数字吗？</div>
        <div className="grid grid-cols-2 gap-2"><button onClick={() => setConflicts(null)} className="min-h-[48px] rounded-2xl bg-stone-100 font-black">先不要</button>
            <button disabled={busy} onClick={() => act(() => confirmTask(t, actor, today, { force: true }))} className="min-h-[48px] rounded-2xl bg-stone-900 text-[#FFD200] font-black">仍然确认</button></div>
    </div> : <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => setReturning(true)} className="min-h-[50px] rounded-2xl bg-white border border-rose-200 text-rose-600 font-black flex items-center justify-center gap-1.5"><RotateCcw size={16} /> 退回</button>
        <button disabled={busy} onClick={() => act(() => confirmTask(t, actor, today))} className="min-h-[50px] rounded-2xl bg-stone-900 text-[#FFD200] font-black flex items-center justify-center gap-1.5">{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} 确认{t.type === 'STOCKTAKE' ? '，更新库存' : t.type === 'PURCHASE' && t.purchaseMode === 'STOCK' ? '，入库' : ''}</button>
    </div>) : status !== 'DONE' ? <button disabled={busy} onClick={() => { if (confirm('取消这个任务？员工那边会消失。')) act(() => cancelTask(t.id, actor)); }} className="w-full min-h-[48px] rounded-2xl bg-stone-100 text-stone-600 font-black">取消任务</button> : undefined}>
        {canEditAssignedTask(t, actor) && onEdit && <button onClick={onEdit} className="w-full min-h-[44px] rounded-xl border border-[#740f10]/20 bg-rose-50 text-[#740f10] font-black text-sm flex items-center justify-center gap-2"><Pencil size={15} /> 编辑任务</button>}
        <div className="rounded-2xl bg-white border border-stone-200 p-4 space-y-1.5 text-sm">
            <p><b className="text-stone-400 font-bold">类型</b> {TASK_TYPE_LABEL[t.type]}{t.type === 'PURCHASE' ? (t.purchaseMode === 'STOCK' ? '（从库存选）' : '（自行输入）') : ''}</p>
            <p><b className="text-stone-400 font-bold">派给</b> {who(t)} · {repeatLabel(t)}{t.dueAt ? ` · 期限 ${fmt(t.dueAt)}` : ''}</p>
            <p><b className="text-stone-400 font-bold">派的人</b> {t.createdByName} · {fmt(t.createdAt)}</p>
            {t.photosRequired > 0 && <p><b className="text-stone-400 font-bold">照片</b> 至少 {t.photosRequired} 张</p>}
            {t.note && <p className="text-stone-600">{t.note}</p>}
            {t.returnNote && status !== 'SUBMITTED' && <p className="text-rose-600 font-bold">上次退回：{t.returnNote}</p>}
            {t.returnCount > 0 && <p className="text-xs text-stone-400">已退回 {t.returnCount} 次</p>}
        </div>

        {!sub && t.type === 'STOCKTAKE' && <div className="rounded-2xl bg-white border border-stone-200 p-4 text-sm"><b className="block mb-1">要点算</b>{(t.stockLines || []).map(l => l.name).join('、')}</div>}

        {sub && <div className="rounded-2xl bg-white border border-stone-200 p-4 space-y-3">
            <p className="text-xs font-black text-stone-500">{sub.byName} 交回 · {fmt(sub.at)}</p>
            {t.type === 'STOCKTAKE' && <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px] font-black text-stone-400"><span>品项</span><span>系统</span><span>点到</span></div>
                {diffs.map(d => {
                    const used = d.countedBase === null ? null : consumptionSinceLast(logs, d.line.stockId, d.countedBase, sub.at);
                    const show = (base: number) => `${+(base / d.line.ratio).toFixed(2)} ${d.line.unit}`;
                    return <div key={d.line.stockId} className={`rounded-xl px-3 py-2 ${d.alert ? 'bg-rose-50 border border-rose-200' : 'bg-stone-50'}`}>
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-sm"><b className="truncate">{d.line.name}</b><span className="text-stone-500">{show(d.system)}</span><b className={d.alert ? 'text-rose-600' : ''}>{d.countedBase === null ? '—' : show(d.countedBase)}</b></div>
                        {d.alert && d.pct !== null && <p className="text-[11px] font-bold text-rose-600 mt-0.5">差 {d.pct > 0 ? '+' : ''}{d.pct.toFixed(0)}%，请核对</p>}
                        {used && <p className="text-[11px] text-stone-500 mt-0.5">从 {used.since} 到现在用了 {show(used.used)}（上次 {show(used.lastQty)} ＋ 收货 {show(used.received)}）</p>}
                    </div>;
                })}
            </div>}
            {t.type === 'PURCHASE' && <div className="space-y-1">{(sub.purchases || []).map((p, i) => <div key={i} className="flex justify-between text-sm"><span>{p.name} × {p.qty} {p.unit}</span><b>RM {p.amount.toFixed(2)}</b></div>)}
                <div className="flex justify-between text-sm border-t border-stone-100 pt-1 font-black"><span>合计</span><span>RM {(sub.purchases || []).reduce((s, p) => s + p.amount, 0).toFixed(2)}</span></div>
                <p className="text-[11px] text-stone-400">确认后{t.purchaseMode === 'STOCK' ? '库存会增加，' : ''}不会自动记成支出；付款请照原本流程。</p></div>}
            {t.type === 'CASH' && sub.cash && <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-stone-50 py-2"><small className="block text-[11px] font-bold text-stone-400">上班</small><b className="text-sm tabular-nums">{formatRm(sub.cash.openingSen)}</b></div>
                <div className="rounded-xl bg-stone-50 py-2"><small className="block text-[11px] font-bold text-stone-400">下班</small><b className="text-sm tabular-nums">{formatRm(sub.cash.closingSen)}</b></div>
                <div className="rounded-xl bg-amber-50 py-2"><small className="block text-[11px] font-bold text-amber-700">本班增加</small><b className="text-sm tabular-nums">{formatRm(sub.cash.closingSen - sub.cash.openingSen)}</b></div>
            </div>}
            {sub.note && <p className="text-sm text-stone-700">「{sub.note}」</p>}
            <Photos ids={sub.photoIds} />
        </div>}

        {t.type === 'CASH' && <CashHistory taskId={t.id} />}
    </Sheet>;
};

/** 收银点钱：每天的记录（最近 31 天，只读） */
const CashHistory: React.FC<{ taskId: string }> = ({ taskId }) => {
    const [rows, setRows] = useState<CashCountRecord[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    useEffect(() => { let on = true; listCashCounts(taskId).then(r => on && setRows(r)).catch(() => on && setRows([])); return () => { on = false; }; }, [taskId]);
    const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    return <div className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
        <p className="px-4 pt-3 pb-2 text-xs font-black text-stone-500">每天的点钱记录（最近 31 天）</p>
        {rows === null ? <p className="px-4 pb-3 text-sm text-stone-400"><Loader2 size={14} className="inline animate-spin" /></p>
            : rows.length === 0 ? <p className="px-4 pb-3 text-sm font-bold text-stone-400">还没有记录</p>
            : <div className="divide-y divide-stone-100">{rows.map(r => <button key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left px-4 py-2.5">
                <div className="grid grid-cols-[52px_1fr_1fr_1fr] gap-2 items-center text-sm">
                    <b className="text-stone-700">{r.date.slice(5)}</b>
                    <span className="tabular-nums">{r.opening ? formatRm(r.opening.totalSen) : '—'}</span>
                    <span className="tabular-nums">{r.closing ? formatRm(r.closing.totalSen) : <small className="text-amber-600 font-bold">未收班</small>}</span>
                    <b className="tabular-nums text-right">{r.diffSen !== undefined ? formatRm(r.diffSen) : ''}</b>
                </div>
                {open === r.id && <div className="mt-2 space-y-1.5 text-xs text-stone-500">
                    {r.opening && <div><b>上班</b> · {r.opening.byName} {time(r.opening.at)}<CashBreakdown counts={r.opening.counts} /></div>}
                    {r.closing && <div><b>下班</b> · {r.closing.byName} {time(r.closing.at)}<CashBreakdown counts={r.closing.counts} /></div>}
                </div>}
            </button>)}</div>}
        <p className="px-4 py-2 text-[11px] text-stone-400 border-t border-stone-100">日期 · 上班 · 下班 · 本班增加。只是记录，不会改日结。</p>
    </div>;
};

/** 上报事项：老板 / 店面管理处理 */
const MatterSheet: React.FC<{ matter: BossMatter; actor: Employee; onClose: () => void; onChanged: () => void }> = ({ matter: m, actor, onClose, onChanged }) => {
    const [note, setNote] = useState(m.resolution || '');
    const [busy, setBusy] = useState(false);
    const set = async (s: MatterStatus) => {
        if ((s === 'ARRANGED' || s === 'DECLINED') && !note.trim()) return alert('请写一句怎么安排 / 为什么不处理');
        setBusy(true);
        try { await updateMatter(m.id, actor, s, note.trim() || undefined); onChanged(); } catch (e: any) { alert(e?.message || '操作失败'); } finally { setBusy(false); }
    };
    return <Sheet title={m.title} onClose={onClose} footer={<div className="grid grid-cols-3 gap-2">
        <button disabled={busy} onClick={() => set('DECLINED')} className="min-h-[48px] rounded-2xl bg-stone-100 text-stone-600 font-black text-sm">不处理</button>
        <button disabled={busy} onClick={() => set('ARRANGED')} className="min-h-[48px] rounded-2xl bg-amber-100 text-amber-800 font-black text-sm">已安排</button>
        <button disabled={busy} onClick={() => set('DONE')} className="min-h-[48px] rounded-2xl bg-stone-900 text-[#FFD200] font-black text-sm">已完成</button>
    </div>}>
        <div className="rounded-2xl bg-white border border-stone-200 p-4 space-y-1.5 text-sm">
            <p><b className="text-stone-400 font-bold">类别</b> {MATTER_LABEL[m.category]}{m.date ? ` · ${m.date}` : ''}</p>
            <p><b className="text-stone-400 font-bold">上报</b> {m.createdByName} · {fmt(m.createdAt)}</p>
            <p><b className="text-stone-400 font-bold">状态</b> {MATTER_STATUS_LABEL[m.status]}</p>
            {m.note && <p className="text-stone-700">{m.note}</p>}
        </div>
        <Photos ids={m.photoIds} />
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} py-2`} placeholder="怎么安排（例如：已约师傅星期五来）" />
    </Sheet>;
};
