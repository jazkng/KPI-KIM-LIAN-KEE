import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X } from 'lucide-react';
import type { Employee, StockItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { DEPT_LABEL, DEPT_ORDER, isCountedStaff } from '../../utils/hr/hrOverview';
import { getOrgLevel } from '../../utils/orgAccess';
import { isConsumeOnReceive, isDiscontinued } from '../../utils/unitConversion';
import { MATTER_LABEL, TASK_TYPE_LABEL, normDept, toStockLine, type MatterCategory, type StaffTask, type StockArea, type TaskRepeat, type TaskStockLine, type TaskType } from '../../utils/tasks/staffTaskLogic';
import { createMatter, createTask, editAssignedTask } from '../../utils/tasks/staffTaskStore';
import { TaskPhotoPicker } from './TaskPhotoPicker';
import { CATEGORY_SECTIONS, getCategoryLabel } from '../features/inventory/inventoryConstants';

/** 底部弹出的表单外框（挂到 body，不会被页面底部导航或外层层级挡住） */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, onClose, children, footer }) => createPortal(
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end md:items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-[#F6F7FB] w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 bg-white rounded-t-3xl border-b border-stone-100">
                <b className="text-base font-black text-stone-900">{title}</b>
                <button onClick={onClose} className="w-10 h-10 rounded-xl bg-stone-100 grid place-items-center" aria-label="关闭"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">{children}</div>
            {footer && <div className="p-4 bg-white border-t border-stone-100" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>{footer}</div>}
        </div>
    </div>, document.body);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) =>
    <label className="block space-y-1.5"><span className="block text-xs font-black text-stone-500">{label}</span>{children}</label>;
export const inputCls = 'w-full min-h-[46px] rounded-xl border border-stone-200 bg-white px-3 font-bold text-stone-900 outline-none focus:border-amber-400 text-[16px]';
export function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: NoInfer<T>) => void }) {
    return <div className="flex flex-wrap gap-1.5">{options.map(o => <button type="button" key={String(o.v)} onClick={() => onChange(o.v)}
        className={`min-h-[40px] px-3.5 rounded-full text-sm font-black border ${value === o.v ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>{o.label}</button>)}</div>;
}

const AREAS: { v: StockArea; label: string }[] = [{ v: 'KITCHEN', label: '厨房' }, { v: 'BAR', label: '水吧' }, { v: 'GENERAL', label: '后勤' }, { v: 'FUEL', label: '燃料' }];

/** 从库存挑品项（可跨区域） */
const StockPicker: React.FC<{ value: TaskStockLine[]; onChange: (v: TaskStockLine[]) => void; forCount?: boolean }> = ({ value, onChange, forCount }) => {
    const [area, setArea] = useState<StockArea>('KITCHEN');
    const [category, setCategory] = useState('ALL');
    const [items, setItems] = useState<StockItem[] | null>(null);
    const [q, setQ] = useState('');
    useEffect(() => {
        let on = true; setItems(null);
        DataManager.getStock(area).then(list => { if (on) setItems(list.filter(i => !isDiscontinued(i) && !(forCount && isConsumeOnReceive(i)))); }).catch(() => on && setItems([]));
        return () => { on = false; };
    }, [area, forCount]);
    const picked = new Set(value.map(v => v.stockId));
    const categories = [...new Set((items || []).map(i => i.category || 'OTHER'))];
    const shown = (items || []).filter(i => (category === 'ALL' || (i.category || 'OTHER') === category) && (!q || `${i.name} ${i.subName || ''} ${i.category}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
    const toggle = (i: StockItem) => onChange(picked.has(i.id) ? value.filter(v => v.stockId !== i.id) : [...value, toStockLine(i, area)]);
    return <div className="space-y-2">
        <Chips value={area} options={AREAS} onChange={v => { setArea(v); setCategory('ALL'); }} />
        {categories.length > 1 && <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="库存分类">
            {[{ id: 'ALL', label: '全部' }, ...categories.map(id => ({ id, label: CATEGORY_SECTIONS[area]?.find(x => x.id === id)?.label || getCategoryLabel(id) }))].map(c => <button type="button" key={c.id} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}
                className={`shrink-0 min-h-[38px] px-3 rounded-xl text-xs font-black border ${category === c.id ? 'bg-[#740f10] text-white border-[#740f10]' : 'bg-white text-stone-600 border-stone-200'}`}>{c.label}</button>)}
        </div>}
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜寻品项" className={`${inputCls} pl-9`} /></div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
            {items === null ? <p className="p-4 text-center text-xs text-stone-400"><Loader2 size={14} className="inline animate-spin" /> 读取库存…</p>
                : shown.length === 0 ? <p className="p-4 text-center text-xs text-stone-400">没有品项</p>
                    : shown.map(i => <button type="button" key={i.id} onClick={() => toggle(i)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-stone-50">
                        <span className={`w-5 h-5 rounded-md border-2 grid place-items-center text-[11px] font-black ${picked.has(i.id) ? 'bg-stone-900 border-stone-900 text-[#FFD200]' : 'border-stone-300'}`}>{picked.has(i.id) ? '✓' : ''}</span>
                        <span className="flex-1 min-w-0"><b className="block text-sm font-bold text-stone-800 truncate">{i.name}</b>{i.subName && <small className="block text-[11px] text-stone-400 truncate">{i.subName}</small>}</span>
                        <small className="text-[11px] text-stone-400 shrink-0">{getCategoryLabel(i.category)}</small>
                    </button>)}
        </div>
        {value.length > 0 && <p className="text-xs font-bold text-stone-500">已选 {value.length} 项：{value.map(v => v.name).join('、')}</p>}
    </div>;
};

/** 派任务 */
export const TaskCreateSheet: React.FC<{ actor: Employee; initialType?: TaskType; initialLines?: TaskStockLine[]; initialTask?: StaffTask; onClose: () => void; onCreated: () => void }> = ({ actor, initialType = 'CLEAN', initialLines, initialTask, onClose, onCreated }) => {
    const isL3 = getOrgLevel(actor) === 'DEPARTMENT_HEAD';
    const myDept = normDept(actor.department);
    const [type, setType] = useState<TaskType>(initialTask?.type || initialType);
    const [title, setTitle] = useState(initialTask?.title || '');
    const [note, setNote] = useState(initialTask?.note || '');
    const [mode, setMode] = useState<'PERSON' | 'DEPT'>(initialTask?.assignMode || 'PERSON');
    const [person, setPerson] = useState(initialTask?.assigneeId || '');
    const [dept, setDept] = useState(initialTask?.department || (isL3 ? myDept : 'KITCHEN'));
    const [repeat, setRepeat] = useState<TaskRepeat>(initialTask?.repeat || 'ONCE');
    const [repeatDays, setRepeatDays] = useState<number[]>(initialTask?.repeatDays || [1]);
    const [repeatDate, setRepeatDate] = useState(initialTask?.repeatDate || 1);
    const [repeatEvery, setRepeatEvery] = useState(initialTask?.repeatEvery || 2);
    const [due, setDue] = useState(initialTask?.dueAt ? new Date(new Date(initialTask.dueAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
    const [photos, setPhotos] = useState(initialTask?.photosRequired || 0);
    const [lines, setLines] = useState<TaskStockLine[]>(initialTask?.stockLines || initialLines || []);
    const [purchaseMode, setPurchaseMode] = useState<'STOCK' | 'FREE'>(initialTask?.purchaseMode || 'STOCK');
    const [repairBy, setRepairBy] = useState<'STAFF' | 'PRO'>('STAFF');
    const [staff, setStaff] = useState<Employee[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    // L3 也可以派给其他部门的人（例如厨房主管叫楼面的人来帮忙处理虾；负责人 2026-10-22）；自己部门的人排在前面
    useEffect(() => { DataManager.getEmployees().then(l => setStaff(l.filter(isCountedStaff).sort((a, b) => Number(normDept(b.department) === myDept) - Number(normDept(a.department) === myDept) || a.name.localeCompare(b.name)))).catch(() => setStaff([])); }, [myDept]);
    const depts = DEPT_ORDER;
    const pro = type === 'REPAIR' && repairBy === 'PRO';
    const needLines = type === 'STOCKTAKE' || (type === 'PURCHASE' && purchaseMode === 'STOCK');
    const autoTitle = title.trim() || (type === 'STOCKTAKE' ? `盘点 ${lines.length} 项` : '');

    const save = async () => {
        setErr('');
        if (!autoTitle) return setErr('请写要做什么');
        if (needLines && !lines.length) return setErr('请挑选库存品项');
        if (!pro && mode === 'PERSON' && !person) return setErr('请选派给谁');
        if (repeat === 'WEEKLY' && !repeatDays.length) return setErr('请选星期几');
        setBusy(true);
        try {
            if (initialTask) {
                const emp = staff.find(e => e.id === person);
                if (mode === 'PERSON' && !emp) throw new Error('指定员工不存在，请重选');
                await editAssignedTask(initialTask.id, actor, {
                    title: autoTitle, note: note || undefined, assignMode: mode,
                    assigneeId: mode === 'PERSON' ? emp!.id : undefined,
                    assigneeName: mode === 'PERSON' ? emp!.name : undefined,
                    department: mode === 'DEPT' ? dept : undefined,
                    assigneeKey: mode === 'PERSON' ? `emp:${emp!.id}` : `dept:${dept}`,
                    repeat, dueAt: repeat === 'ONCE' && due ? new Date(due).toISOString() : undefined,
                    repeatDays: repeat === 'WEEKLY' ? repeatDays : undefined,
                    repeatDate: repeat === 'MONTHLY' ? repeatDate : undefined,
                    repeatEvery: repeat === 'EVERY_N' ? repeatEvery : undefined,
                    photosRequired: photos, stockLines: needLines ? lines : undefined,
                });
            } else if (pro) {
                await createMatter({ title: autoTitle, category: 'REPAIR_PRO', note: note || undefined, createdBy: actor.id, createdByName: actor.name });
            } else {
                const emp = staff.find(e => e.id === person);
                await createTask({
                    type, title: autoTitle, note: note || undefined, assignMode: mode,
                    ...(mode === 'PERSON' ? { assigneeId: emp!.id, assigneeName: emp!.name, assigneeKey: `emp:${emp!.id}` } : { department: dept, assigneeKey: `dept:${dept}` }),
                    repeat, dueAt: repeat === 'ONCE' && due ? new Date(due).toISOString() : undefined, photosRequired: photos,
                    ...(repeat === 'WEEKLY' ? { repeatDays } : repeat === 'MONTHLY' ? { repeatDate } : repeat === 'EVERY_N' ? { repeatEvery } : {}),
                    stockLines: needLines ? lines : undefined, purchaseMode: type === 'PURCHASE' ? purchaseMode : undefined,
                    createdBy: actor.id, createdByName: actor.name,
                });
            }
            onCreated(); onClose();
        } catch (e: any) { setErr(e?.message || '送出失败'); }
        finally { setBusy(false); }
    };

    return <Sheet title={initialTask ? '编辑任务' : '派任务'} onClose={onClose} footer={<>
        {err && <p className="mb-2 text-sm font-bold text-rose-600">{err}</p>}
        <button onClick={save} disabled={busy} className="w-full min-h-[50px] rounded-2xl bg-stone-900 text-[#FFD200] font-black disabled:opacity-50">{busy ? '保存中…' : initialTask ? '保存修改' : pro ? '交给老板处理' : '派出去'}</button>
    </>}>
        <Field label="类型">{initialTask ? <p className="text-sm font-black text-stone-700">{TASK_TYPE_LABEL[type]}</p> : <Chips value={type} onChange={v => { setType(v); setLines([]); }} options={(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map(v => ({ v, label: TASK_TYPE_LABEL[v] }))} />}</Field>
        {type === 'REPAIR' && !initialTask && <Field label="谁来修"><Chips value={repairBy} onChange={setRepairBy} options={[{ v: 'STAFF', label: '员工自己修' }, { v: 'PRO', label: '请专业（交给老板）' }]} /></Field>}
        <Field label={type === 'STOCKTAKE' ? '标题（选填）' : '要做什么'}><input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder={type === 'STOCKTAKE' ? '例如：冷房肉类盘点' : type === 'PURCHASE' ? '例如：去买白米、洗洁精' : '例如：清洗 2 号冷气滤网'} /></Field>
        {type === 'PURCHASE' && <Field label="买什么"><Chips value={purchaseMode} onChange={v => { setPurchaseMode(v); setLines([]); }} options={[{ v: 'STOCK', label: '从库存选（买回来会入库）' }, { v: 'FREE', label: '自行输入（不入库）' }]} /></Field>}
        {needLines && <Field label={type === 'STOCKTAKE' ? '要点算的品项（可以跨区域）' : '要买的品项'}><StockPicker value={lines} onChange={setLines} forCount={type === 'STOCKTAKE'} /></Field>}
        {!pro && <>
            <Field label="派给"><Chips value={mode} onChange={setMode} options={[{ v: 'PERSON', label: '指定员工' }, { v: 'DEPT', label: '整个部门（谁做都可以）' }]} /></Field>
            {mode === 'PERSON'
                ? <select value={person} onChange={e => setPerson(e.target.value)} className={inputCls}><option value="">选员工…</option>{staff.map(e => <option key={e.id} value={e.id}>{e.name} · {DEPT_LABEL[normDept(e.department)] || '其他'}</option>)}</select>
                : <Chips value={dept} onChange={setDept} options={depts.map(d => ({ v: d, label: DEPT_LABEL[d] || d }))} />}
            <Field label="次数"><Chips value={repeat} onChange={setRepeat} options={[{ v: 'ONCE', label: '单次' }, { v: 'DAILY', label: '每日' }, { v: 'WEEKLY', label: '每周' }, { v: 'MONTHLY', label: '每月' }, { v: 'EVERY_N', label: '每隔几天' }]} /></Field>
            {repeat === 'WEEKLY' && <Field label="星期几（可多选）"><div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} onClick={() => setRepeatDays(v => v.includes(d) ? v.filter(x => x !== d) : [...v, d])}
                className={`w-11 h-11 rounded-full text-sm font-black border ${repeatDays.includes(d) ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>{'日一二三四五六'[d]}</button>)}</div></Field>}
            {repeat === 'MONTHLY' && <Field label="每月几号（当月没有这一天就用月底）"><select value={repeatDate} onChange={e => setRepeatDate(Number(e.target.value))} className={inputCls}>{Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d} 号</option>)}</select></Field>}
            {repeat === 'EVERY_N' && <Field label="每隔几天一次（从今天开始）"><select value={repeatEvery} onChange={e => setRepeatEvery(Number(e.target.value))} className={inputCls}>{[2, 3, 4, 5, 6, 7, 10, 14, 15, 30].map(n => <option key={n} value={n}>每 {n} 天</option>)}</select></Field>}
            {repeat === 'ONCE' && <Field label="期限（选填）"><input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className={inputCls} /></Field>}
            <Field label="要员工拍照吗"><Chips value={photos} onChange={setPhotos} options={[0, 1, 2, 3, 4, 5].map(n => ({ v: n, label: n === 0 ? '不用' : `至少 ${n} 张` }))} /></Field>
        </>}
        <Field label="说明（选填）"><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} py-2`} /></Field>
    </Sheet>;
};

/** 上报事项（交给老板 / 店面管理） */
export const MatterCreateSheet: React.FC<{ actor: Employee; onClose: () => void; onCreated: () => void }> = ({ actor, onClose, onCreated }) => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<MatterCategory>('EVENT');
    const [date, setDate] = useState('');
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const save = async () => {
        if (!title.trim()) return setErr('请写是什么事');
        setBusy(true); setErr('');
        try { await createMatter({ title: title.trim(), category, date: date || undefined, note: note || undefined, createdBy: actor.id, createdByName: actor.name }, photos); onCreated(); onClose(); }
        catch (e: any) { setErr(e?.message || '送出失败'); }
        finally { setBusy(false); }
    };
    return <Sheet title="上报事项" onClose={onClose} footer={<>
        {err && <p className="mb-2 text-sm font-bold text-rose-600">{err}</p>}
        <button onClick={save} disabled={busy} className="w-full min-h-[50px] rounded-2xl bg-stone-900 text-[#FFD200] font-black disabled:opacity-50">{busy ? '送出中…' : '送出'}</button>
    </>}>
        <Field label="类别"><Chips value={category} onChange={setCategory} options={(Object.keys(MATTER_LABEL) as MatterCategory[]).map(v => ({ v, label: MATTER_LABEL[v] }))} /></Field>
        <Field label="是什么事"><input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="例如：下星期三舞狮，需要楼面配合" /></Field>
        <Field label="日期（选填，活动当天等）"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="说明（选填）"><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className={`${inputCls} py-2`} /></Field>
        <Field label="照片（选填，最多 5 张）"><TaskPhotoPicker value={photos} onChange={setPhotos} label="拍照 / 选照片" /></Field>
    </Sheet>;
};
