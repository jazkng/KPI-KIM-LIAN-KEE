import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { Employee } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { isCountedStaff, shortName } from '../../utils/hr/hrOverview';
import { canScoreHygiene, HYGIENE_LEVELS, HYGIENE_STANDARD, hygieneNoteRequired, isHygieneHr, isHygieneSupervisor, mondayOf } from '../../utils/points/hygieneAccess';
import type { HygieneCheck } from '../../utils/points/pointsCalc';
import { listHygieneChecks, saveHygieneCheck } from '../../utils/points/pointsStore';
import { inputCls, Sheet } from '../tasks/TaskForms';

const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const SCORE_CLASS: Record<number, string> = { 1: 'bg-rose-500 text-white', 2: 'bg-orange-400 text-white', 3: 'bg-emerald-500 text-white', 4: 'bg-sky-500 text-white', 5: 'bg-indigo-600 text-white' };

/** 每周个人卫生评分：主管评自己部门的员工；HR 评主管（及所有人） */
export const HygieneBoard: React.FC<{ actor: Employee }> = ({ actor }) => {
    const allowed = isHygieneHr(actor) || isHygieneSupervisor(actor);
    const [week, setWeek] = useState(mondayOf(getMalaysiaDateString()));
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [checks, setChecks] = useState<Record<string, HygieneCheck>>({});
    const [editing, setEditing] = useState<{ emp: Employee; score: number } | null>(null);
    const [showStd, setShowStd] = useState(false);
    useEffect(() => { if (allowed) DataManager.getEmployees().then(l => setEmployees(l.filter(isCountedStaff))).catch(() => setEmployees([])); }, [allowed]);
    useEffect(() => {
        if (!allowed) return;
        let on = true;
        listHygieneChecks(week, week).then(l => on && setChecks(Object.fromEntries(l.map(c => [c.employeeId, c])))).catch(() => on && setChecks({}));
        return () => { on = false; };
    }, [week, allowed]);
    const people = useMemo(() => employees.filter(e => canScoreHygiene(actor, e)).sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name)), [employees, actor]);
    if (!allowed) return null;
    const thisWeek = mondayOf(getMalaysiaDateString());
    const done = people.filter(p => checks[p.id]).length;

    const save = async (emp: Employee, score: number, note?: string) => {
        const c = await saveHygieneCheck({ employeeId: emp.id, weekStart: week, score: score as HygieneCheck['score'], note, checkedBy: actor.id, checkedByName: actor.name });
        setChecks(x => ({ ...x, [emp.id]: c }));
    };
    const pick = (emp: Employee, score: number) => hygieneNoteRequired(score) ? setEditing({ emp, score }) : save(emp, score);

    return <div className="space-y-2.5">
        <div className="flex items-center gap-2">
            <h3 className="flex-1 text-sm font-black text-stone-800 flex items-center gap-1.5"><Sparkles size={15} /> 个人卫生（每周）</h3>
            <button onClick={() => setWeek(w => addDays(w, -7))} className="w-9 h-9 rounded-lg grid place-items-center bg-white border border-stone-200" aria-label="上一周"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-stone-700 tabular-nums">{week.slice(5).replace('-', '/')} 那周</span>
            <button onClick={() => setWeek(w => addDays(w, 7))} disabled={week >= thisWeek} className="w-9 h-9 rounded-lg grid place-items-center bg-white border border-stone-200 disabled:opacity-30" aria-label="下一周"><ChevronRight size={16} /></button>
        </div>
        <p className="text-xs text-stone-500">已评 {done}/{people.length} 人 · 3 分 = 全部符合标准 · <button onClick={() => setShowStd(v => !v)} className="font-black text-amber-700">{showStd ? '收起标准' : '看标准'}</button></p>
        {showStd && <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-stone-700 space-y-1">
            {HYGIENE_STANDARD.map((s, i) => <p key={s}>{'①②③④⑤⑥'[i]} {s}</p>)}
            <div className="pt-1 grid grid-cols-1 gap-0.5">{[1, 2, 3, 4, 5].map(n => <p key={n}><b>{n} {HYGIENE_LEVELS[n].label}</b>：{HYGIENE_LEVELS[n].desc}</p>)}</div>
        </div>}
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {people.length === 0 && <p className="p-3 text-xs text-stone-400">没有需要你评分的人</p>}
            {people.map(p => {
                const c = checks[p.id];
                return <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 min-w-0"><b className="block text-sm font-black text-stone-900 truncate">{shortName(p)}</b>
                        {c?.note && <small className="block text-[11px] text-stone-500 truncate">{c.note}</small>}</span>
                    <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => pick(p, n)} aria-label={`${n} 分`}
                        className={`w-8 h-8 rounded-lg text-sm font-black ${c?.score === n ? SCORE_CLASS[n] : 'bg-stone-100 text-stone-500'}`}>{n}</button>)}</div>
                </div>;
            })}
        </div>
        {editing && <NoteSheet emp={editing.emp} score={editing.score} onClose={() => setEditing(null)} onSave={async note => { await save(editing.emp, editing.score, note); setEditing(null); }} />}
    </div>;
};

const NoteSheet: React.FC<{ emp: Employee; score: number; onClose: () => void; onSave: (note: string) => Promise<void> }> = ({ emp, score, onClose, onSave }) => {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const low = score <= 2;
    return <Sheet title={`${shortName(emp)} · ${score} 分 ${HYGIENE_LEVELS[score].label}`} onClose={onClose} footer={
        <button disabled={!note.trim() || busy} onClick={async () => { setBusy(true); try { await onSave(note.trim()); } finally { setBusy(false); } }} className="w-full min-h-[52px] rounded-2xl bg-stone-900 text-[#FFD200] font-black disabled:opacity-40">{busy ? '保存中…' : '保存'}</button>}>
        <p className="text-sm text-stone-600">{low ? '请写出问题（例如：没戴发网、指甲太长）。' : '请写出超出标准的实际行为或改善建议。'}</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className={`${inputCls} py-2`} placeholder={low ? '问题…' : '做了什么 / 建议…'} />
    </Sheet>;
};
