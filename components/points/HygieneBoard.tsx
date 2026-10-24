import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { Employee } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { isCountedStaff, shortName } from '../../utils/hr/hrOverview';
import { canScoreHygiene, HYGIENE_LEVELS, HYGIENE_STANDARD, hygieneNoteRequired, isHygieneHr, isHygieneSupervisor, maxHygieneScore, mondayOf } from '../../utils/points/hygieneAccess';
import type { HygieneCheck } from '../../utils/points/pointsCalc';
import { listHygieneChecks, saveHygieneCheck } from '../../utils/points/pointsStore';
import { inputCls, Sheet } from '../tasks/TaskForms';

const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const SCORE_CLASS: Record<number, string> = { 1: 'bg-rose-500 text-white', 2: 'bg-orange-400 text-white', 3: 'bg-emerald-500 text-white', 4: 'bg-sky-500 text-white', 5: 'bg-indigo-600 text-white' };
const WORDS = {
    zh: { title: '个人卫生（每周）', prev: '上一周', next: '下一周', week: '那周', done: '已评', people: '人', max: '可评', points: '分', show: '看标准', hide: '收起标准', empty: '没有需要你评分的人', scored: '已评', save: '保存', saving: '保存中…', low: '点选问题，或自己写。', high: '点选做得好的地方，或自己写。', issue: '问题…', praise: '做了什么 / 建议…' },
    en: { title: 'Hygiene · weekly', prev: 'Previous week', next: 'Next week', week: 'week', done: 'Scored', people: 'staff', max: 'Your range', points: 'points', show: 'Show standards', hide: 'Hide standards', empty: 'No staff to score', scored: 'scored by', save: 'Save', saving: 'Saving…', low: 'Choose an issue or write your own.', high: 'Choose a strength or write your own.', issue: 'Issue…', praise: 'Action / suggestion…' },
    my: { title: 'တစ်ကိုယ်ရေ သန့်ရှင်းရေး · အပတ်စဉ်', prev: 'ယခင်အပတ်', next: 'နောက်အပတ်', week: 'အပတ်', done: 'အကဲဖြတ်ပြီး', people: 'ဦး', max: 'အမှတ်ပေးနိုင်သည့်အပိုင်း', points: 'မှတ်', show: 'စံနှုန်းကြည့်', hide: 'စံနှုန်းပိတ်', empty: 'အကဲဖြတ်ရန် ဝန်ထမ်းမရှိပါ', scored: 'အကဲဖြတ်ပြီး', save: 'သိမ်း', saving: 'သိမ်းနေသည်…', low: 'ပြဿနာကို ရွေးပါ သို့မဟုတ် ရေးပါ။', high: 'ကောင်းမွန်သည့်အချက်ကို ရွေးပါ သို့မဟုတ် ရေးပါ။', issue: 'ပြဿနာ…', praise: 'လုပ်ဆောင်ချက် / အကြံပြုချက်…' },
};
const STANDARDS = {
    zh: HYGIENE_STANDARD,
    en: ['Clean uniform and apron', 'Hairnet fully covers hair', 'Clean hands and nails', 'Wash and sanitise hands before work', 'No unsafe jewellery; cover wounds properly', 'Wear disposable gloves while cutting or portioning food'],
    my: ['ယူနီဖောင်းနှင့် ခါးစည်း သန့်ရှင်းရန်', 'ဆံပင်အုပ်ကို အပြည့်အဝ ဝတ်ရန်', 'လက်နှင့် လက်သည်း သန့်ရှင်းရန်', 'အလုပ်မစမီ လက်ဆေးပြီး ပိုးသတ်ရန်', 'အန္တရာယ်ရှိသည့် လက်ဝတ်ရတနာ မဝတ်ရန်၊ ဒဏ်ရာကို ဖုံးအုပ်ရန်', 'အစားအစာ ဖြတ်ရာတွင် တစ်ခါသုံး လက်အိတ် ဝတ်ရန်'],
};
const LEVELS = {
    zh: [HYGIENE_LEVELS[1], HYGIENE_LEVELS[2], HYGIENE_LEVELS[3], HYGIENE_LEVELS[4], HYGIENE_LEVELS[5]],
    en: [{ label: 'Poor', desc: 'Serious hygiene issue' }, { label: 'Improve', desc: 'Corrected only after reminder' }, { label: 'Standard', desc: 'All standards met' }, { label: 'Good', desc: 'Meets standards and reminds others' }, { label: 'Excellent', desc: 'Good plus a practical improvement' }],
    my: [{ label: 'မကောင်း', desc: 'ပြင်းထန်သော သန့်ရှင်းရေးပြဿနာ' }, { label: 'တိုးတက်ရန်', desc: 'သတိပေးပြီးမှ ပြင်ဆင်သည်' }, { label: 'စံမီ', desc: 'စံနှုန်းအားလုံး ပြည့်မီသည်' }, { label: 'ကောင်း', desc: 'စံမီပြီး အခြားသူများကို သတိပေးသည်' }, { label: 'အလွန်ကောင်း', desc: 'လက်တွေ့ကျသော တိုးတက်မှု အကြံပြုသည်' }],
};

/** 每周个人卫生评分：主管评自己部门的员工；HR 评主管（及所有人） */
export const HygieneBoard: React.FC<{ actor: Employee; lang?: 'zh' | 'en' | 'my' }> = ({ actor, lang = 'zh' }) => {
    const w = WORDS[lang];
    const allowed = isHygieneHr(actor) || isHygieneSupervisor(actor);
    const [week, setWeek] = useState(mondayOf(getMalaysiaDateString()));
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [checks, setChecks] = useState<Record<string, HygieneCheck>>({});
    const [editing, setEditing] = useState<{ emp: Employee; score: number } | null>(null);
    const [showStd, setShowStd] = useState(false);
    const [error, setError] = useState('');
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
        try {
            setError('');
            const c = await saveHygieneCheck({ employeeId: emp.id, weekStart: week, score: score as HygieneCheck['score'], note, checkedBy: actor.id, checkedByName: actor.name }, actor, emp);
            setChecks(x => ({ ...x, [emp.id]: c }));
        } catch (e: any) {
            setError(e?.message || (lang === 'en' ? 'Save failed' : lang === 'my' ? 'သိမ်းမရပါ' : '保存失败'));
            throw e;
        }
    };
    const pick = (emp: Employee, score: number) => {
        if (score > maxHygieneScore(actor) || (checks[emp.id] && checks[emp.id].checkedBy !== actor.id)) return;
        if (hygieneNoteRequired(score)) setEditing({ emp, score }); else void save(emp, score).catch(() => undefined);
    };

    return <div className="space-y-2.5">
        <div className="flex items-center gap-2">
            <h3 className="flex-1 text-sm font-black text-stone-800 flex items-center gap-1.5"><Sparkles size={15} /> {w.title}</h3>
            <button onClick={() => setWeek(v => addDays(v, -7))} className="w-9 h-9 rounded-lg grid place-items-center bg-white border border-stone-200" aria-label={w.prev}><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-stone-700 tabular-nums">{week.slice(5).replace('-', '/')} {w.week}</span>
            <button onClick={() => setWeek(v => addDays(v, 7))} disabled={week >= thisWeek} className="w-9 h-9 rounded-lg grid place-items-center bg-white border border-stone-200 disabled:opacity-30" aria-label={w.next}><ChevronRight size={16} /></button>
        </div>
        <p className="text-xs text-stone-500">{w.done} {done}/{people.length} {w.people} · {w.max} 1–{maxHygieneScore(actor)} {w.points} · <button onClick={() => setShowStd(v => !v)} className="font-black text-amber-700">{showStd ? w.hide : w.show}</button></p>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
        {showStd && <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-stone-700 space-y-1">
            {STANDARDS[lang].map((s, i) => <p key={s}>{'①②③④⑤⑥'[i]} {s}</p>)}
            <div className="pt-1 grid grid-cols-1 gap-0.5">{[1, 2, 3, 4, 5].filter(n => n <= maxHygieneScore(actor)).map(n => <p key={n}><b>{n} {LEVELS[lang][n - 1].label}</b>：{LEVELS[lang][n - 1].desc}</p>)}</div>
        </div>}
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {people.length === 0 && <p className="p-3 text-xs text-stone-400">{w.empty}</p>}
            {people.map(p => {
                const c = checks[p.id];
                return <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 min-w-0"><b className="block text-sm font-black text-stone-900 truncate">{shortName(p)}</b>
                        {c && <small className="block text-[11px] text-stone-500 truncate">{c.score} {w.points} · {c.checkedByName} {w.scored}{c.note ? ` · ${c.note}` : ''}</small>}</span>
                    <div className="flex gap-1">{[1, 2, 3, 4, 5].filter(n => n <= maxHygieneScore(actor)).map(n => <button key={n} onClick={() => pick(p, n)} disabled={!!c && c.checkedBy !== actor.id} aria-label={`${n} 分`}
                        className={`w-8 h-8 rounded-lg text-sm font-black disabled:opacity-40 ${c?.score === n ? SCORE_CLASS[n] : 'bg-stone-100 text-stone-500'}`}>{n}</button>)}</div>
                </div>;
            })}
        </div>
        {editing && <NoteSheet emp={editing.emp} score={editing.score} lang={lang} onClose={() => setEditing(null)} onSave={async note => { await save(editing.emp, editing.score, note); setEditing(null); }} />}
    </div>;
};

// 2 分（需要进步）/ 4 分（很好）的预设答案，按标准 6 项写（负责人 2026-10-23）
const LOW_PRESETS = ['发网没包好头发', '制服 / 围裙不整洁', '指甲太长或不干净', '上岗前没洗手消毒', '戴了饰物 / 伤口没包扎', '切配时没戴手套', '提醒后才改善'];
const HIGH_PRESETS = ['全部达标', '主动提醒同事注意卫生', '帮忙整理工作区卫生', '提出可执行的改善建议'];
const PRESETS = {
    zh: { low: LOW_PRESETS, high: HIGH_PRESETS },
    en: { low: ['Hairnet not covering hair', 'Uniform or apron not clean', 'Nails long or dirty', 'Did not wash hands before work', 'Jewellery or wound not covered', 'No gloves while cutting food', 'Improved only after reminder'], high: ['All standards met', 'Reminded colleagues about hygiene', 'Helped clean the work area', 'Suggested a practical improvement'] },
    my: { low: ['ဆံပင်အုပ် မပြည့်စုံ', 'ယူနီဖောင်း သို့မဟုတ် ခါးစည်း မသန့်ရှင်း', 'လက်သည်း ရှည် သို့မဟုတ် ညစ်ပတ်', 'အလုပ်မစမီ လက်မဆေး', 'လက်ဝတ်ရတနာ သို့မဟုတ် ဒဏ်ရာ မဖုံး', 'ဖြတ်တောက်ရာတွင် လက်အိတ် မဝတ်', 'သတိပေးပြီးမှ ပြင်ဆင်'], high: ['စံနှုန်းအားလုံး ပြည့်မီ', 'လုပ်ဖော်ကိုင်ဖက်များကို သတိပေး', 'လုပ်ငန်းခွင် သန့်ရှင်းရေး ကူညီ', 'လက်တွေ့ကျသော တိုးတက်မှု အကြံပြု'] },
};

const NoteSheet: React.FC<{ emp: Employee; score: number; lang: 'zh' | 'en' | 'my'; onClose: () => void; onSave: (note: string) => Promise<void> }> = ({ emp, score, lang, onClose, onSave }) => {
    const w = WORDS[lang];
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const low = score <= 2;
    return <Sheet title={`${shortName(emp)} · ${score} ${w.points}`} onClose={onClose} footer={
        <button disabled={!note.trim() || busy} onClick={async () => { setBusy(true); try { await onSave(note.trim()); } catch { /* parent displays the error */ } finally { setBusy(false); } }} className="w-full min-h-[52px] rounded-2xl bg-stone-900 text-[#FFD200] font-black disabled:opacity-40">{busy ? w.saving : w.save}</button>}>
        <p className="text-sm text-stone-600">{low ? w.low : w.high}</p>
        <div className="flex flex-wrap gap-1.5">{(low ? PRESETS[lang].low : PRESETS[lang].high).map(p => <button key={p} type="button" onClick={() => setNote(n => n.includes(p) ? n : (n.trim() ? `${n.trim()}；${p}` : p))}
            className={`min-h-[36px] px-3 rounded-full text-[13px] font-bold border ${note.includes(p) ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>{p}</button>)}</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className={`${inputCls} py-2`} placeholder={low ? w.issue : w.praise} />
    </Sheet>;
};
