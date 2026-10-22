import React, { useEffect, useState } from 'react';
import { ChevronRight, ClipboardList, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { Employee } from '../../types';
import { getBusinessDateString } from '../../utils/dateHelper';
import { effectiveStatus, validateSubmission, type StaffTask, type TaskPurchaseLine } from '../../utils/tasks/staffTaskLogic';
import { listTasksFor, submitTask } from '../../utils/tasks/staffTaskStore';
import { Sheet, inputCls } from './TaskForms';
import { TaskPhotoPicker } from './TaskPhotoPicker';
import { tt } from './taskText';

const TYPE_TEXT: Record<StaffTask['type'], Record<'zh' | 'en' | 'my', string>> = {
    STOCKTAKE: { zh: '盘点', en: 'Stock count', my: 'စာရင်းစစ်' },
    CLEAN: { zh: '清洁整理', en: 'Cleaning', my: 'သန့်ရှင်းရေး' },
    PURCHASE: { zh: '采购', en: 'Buying', my: 'ဝယ်ယူ' },
    REPAIR: { zh: '维修', en: 'Repair', my: 'ပြင်ဆင်' },
    OTHER: { zh: '其他', en: 'Other', my: 'အခြား' },
};
const L = (lang: string) => lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh';

/** 员工页「我的任务」：派给自己或自己部门的任务。只读取；按「交回」才写入。 */
export const StaffTaskList: React.FC<{ employee: Employee; lang: string }> = ({ employee, lang }) => {
    const [tasks, setTasks] = useState<StaffTask[] | null>(null);
    const [open, setOpen] = useState<StaffTask | null>(null);
    const [reload, setReload] = useState(0);
    const today = getBusinessDateString(), now = new Date().toISOString();
    useEffect(() => { let on = true; listTasksFor(employee).then(t => on && setTasks(t)).catch(() => on && setTasks([])); return () => { on = false; }; }, [employee, reload]);

    const rows = (tasks || []).map(t => ({ t, s: effectiveStatus(t, today, now) })).filter(r => r.s === 'TODO' || r.s === 'OVERDUE' || r.s === 'SUBMITTED')
        .sort((a, b) => ['OVERDUE', 'TODO', 'SUBMITTED'].indexOf(a.s) - ['OVERDUE', 'TODO', 'SUBMITTED'].indexOf(b.s));
    if (tasks !== null && rows.length === 0) return null;

    return <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2"><ClipboardList size={16} className="text-[#FFD200]" /><h3 className="font-black text-sm text-[#111111]">{tt('myTasks', lang)}</h3>
            {rows.length > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black grid place-items-center">{rows.filter(r => r.s !== 'SUBMITTED').length}</span>}</div>
        {tasks === null ? <p className="text-xs text-gray-400"><Loader2 size={13} className="inline animate-spin" /></p> : rows.map(({ t, s }) => (
            <button key={t.id} disabled={s === 'SUBMITTED'} onClick={() => setOpen(t)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${s === 'OVERDUE' ? 'border-rose-200 bg-rose-50' : s === 'SUBMITTED' ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'}`}>
                <span className="flex-1 min-w-0">
                    <b className="block text-[15px] font-black text-stone-900 truncate">{t.title}</b>
                    <small className="block text-xs text-stone-500 font-semibold truncate">{TYPE_TEXT[t.type][L(lang)]}{t.assignMode === 'DEPT' ? ` · ${tt('dept', lang)}` : ''}{t.repeat === 'DAILY' ? ` · ${tt('daily', lang)}` : ''} · {s === 'OVERDUE' ? tt('overdue', lang) : s === 'SUBMITTED' ? tt('submitted', lang) : tt('todo', lang)}</small>
                    {t.returnNote && s !== 'SUBMITTED' && <small className="block text-xs text-rose-600 font-bold truncate"><RotateCcw size={11} className="inline" /> {tt('returned', lang)}：{t.returnNote}</small>}
                </span>
                {s !== 'SUBMITTED' && <ChevronRight size={18} className="text-stone-300" />}
            </button>))}
        {open && <TaskDoSheet task={open} employee={employee} lang={lang} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setReload(v => v + 1); }} />}
    </div>;
};

/** 员工做任务：盘点只填数量（看不到系统数量）；采购填买了什么；其他拍照 / 备注 */
const TaskDoSheet: React.FC<{ task: StaffTask; employee: Employee; lang: string; onClose: () => void; onDone: () => void }> = ({ task: t, employee, lang, onClose, onDone }) => {
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [rows, setRows] = useState<TaskPurchaseLine[]>(() => t.type === 'PURCHASE' && t.purchaseMode === 'STOCK'
        ? (t.stockLines || []).map(l => ({ stockId: l.stockId, area: l.area, name: l.name, unit: l.unit, ratio: l.ratio, qty: 0, amount: 0 }))
        : t.type === 'PURCHASE' ? [{ name: '', unit: '', ratio: 1, qty: 0, amount: 0 }] : []);
    const [photos, setPhotos] = useState<string[]>([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const numCounts = Object.fromEntries(Object.entries(counts).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]));
    const purchases = rows.filter(r => r.stockId ? r.qty > 0 : (r.qty > 0 || r.name.trim()));

    const submit = async () => {
        const problem = validateSubmission(t, { counts: numCounts, photoCount: photos.length, purchases });
        if (problem) return setErr(problem);
        setBusy(true); setErr('');
        try {
            await submitTask(t, employee, getBusinessDateString(), { note: note.trim() || undefined, photos, counts: t.type === 'STOCKTAKE' ? numCounts : undefined, purchases: t.type === 'PURCHASE' ? purchases : undefined });
            onDone();
        } catch (e: any) { setErr(e?.message || 'Error'); }
        finally { setBusy(false); }
    };
    const setRow = (i: number, p: Partial<TaskPurchaseLine>) => setRows(r => r.map((x, j) => j === i ? { ...x, ...p } : x));

    return <Sheet title={t.title} onClose={onClose} footer={<>
        {err && <p className="mb-2 text-sm font-bold text-rose-600">{err}</p>}
        <button onClick={submit} disabled={busy} className="w-full min-h-[52px] rounded-2xl bg-stone-900 text-[#FFD200] font-black disabled:opacity-50">{busy ? tt('saving', lang) : tt('submit', lang)}</button>
    </>}>
        {(t.note || t.returnNote) && <div className="rounded-2xl bg-white border border-stone-200 p-4 space-y-1 text-sm">
            {t.note && <p className="text-stone-700">{t.note}</p>}
            {t.returnNote && <p className="text-rose-600 font-bold">{tt('returned', lang)}：{t.returnNote}</p>}
            <p className="text-xs text-stone-400">{tt('from', lang)}：{t.createdByName}</p>
        </div>}

        {t.type === 'STOCKTAKE' && <div className="rounded-2xl bg-white border border-stone-200 divide-y divide-stone-100">
            <p className="px-4 py-2 text-xs font-black text-stone-500">{tt('count', lang)}</p>
            {(t.stockLines || []).map(l => <label key={l.stockId} className="flex items-center gap-3 px-4 py-2.5">
                <b className="flex-1 min-w-0 text-[15px] font-bold text-stone-800 truncate">{l.name}</b>
                <input inputMode="decimal" value={counts[l.stockId] ?? ''} onChange={e => setCounts(c => ({ ...c, [l.stockId]: e.target.value.replace(/[^0-9.]/g, '') }))}
                    className="w-24 min-h-[44px] rounded-xl border border-stone-200 text-right px-3 font-black text-[16px]" placeholder="0" />
                <span className="w-10 text-xs font-bold text-stone-400">{l.unit}</span>
            </label>)}
        </div>}

        {t.type === 'PURCHASE' && <div className="rounded-2xl bg-white border border-stone-200 p-3 space-y-2">
            <p className="text-xs font-black text-stone-500">{tt('bought', lang)}</p>
            {rows.map((r, i) => <div key={i} className="grid grid-cols-[1fr_70px_84px_auto] gap-1.5 items-center">
                {r.stockId ? <b className="text-sm font-bold truncate">{r.name} <small className="text-stone-400">{r.unit}</small></b>
                    : <input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder={tt('item', lang)} className={`${inputCls} min-h-[42px] px-2`} />}
                <input inputMode="decimal" value={r.qty || ''} onChange={e => setRow(i, { qty: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder={tt('qty', lang)} className={`${inputCls} min-h-[42px] px-2 text-right`} />
                <input inputMode="decimal" value={r.amount || ''} onChange={e => setRow(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder={tt('amount', lang)} className={`${inputCls} min-h-[42px] px-2 text-right`} />
                {!r.stockId ? <button onClick={() => setRows(x => x.filter((_, j) => j !== i))} className="w-9 h-9 grid place-items-center text-stone-400" aria-label="删除"><Trash2 size={15} /></button> : <span />}
            </div>)}
            {t.purchaseMode !== 'STOCK' && <button onClick={() => setRows(x => [...x, { name: '', unit: '', ratio: 1, qty: 0, amount: 0 }])} className="text-sm font-black text-amber-700">{tt('addRow', lang)}</button>}
        </div>}

        <div className="rounded-2xl bg-white border border-stone-200 p-4 space-y-2">
            <p className="text-xs font-black text-stone-500">{tt('photos', lang)}{t.photosRequired > 0 ? ` · ${tt('needPhotos', lang, { n: t.photosRequired })}` : ''}</p>
            <TaskPhotoPicker value={photos} onChange={setPhotos} label={tt('addPhoto', lang)} />
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} py-2`} placeholder={tt('note', lang)} />
    </Sheet>;
};
