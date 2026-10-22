import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, RefreshCw } from 'lucide-react';
import type { Employee } from '../../types';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { shortName } from '../../utils/hr/hrOverview';
import { isHygieneHr } from '../../utils/points/hygieneAccess';
import type { MonthPoints } from '../../utils/points/pointsCalc';
import { confirmMonthPoints, loadAllPoints } from '../../utils/points/pointsStore';
import { Sheet } from '../tasks/TaskForms';
import { GRADE_CLASS, PointsBreakdown } from './PointsBreakdown';

const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7); };
type Row = { employee: Employee; points: MonthPoints; confirmed: boolean };

/** HR：全部员工的月积分；过去的月份可以「确认」存档（之后不再变动） */
export const PointsBoard: React.FC<{ actor: Employee }> = ({ actor }) => {
    const thisMonth = getMalaysiaDateString().slice(0, 7);
    const [month, setMonth] = useState(thisMonth);
    const [rows, setRows] = useState<Row[] | null>(null);
    const [open, setOpen] = useState<Row | null>(null);
    const [reload, setReload] = useState(0);
    const [busy, setBusy] = useState(false);
    useEffect(() => { let on = true; setRows(null); loadAllPoints(month).then(r => on && setRows(r)).catch(() => on && setRows([])); return () => { on = false; }; }, [month, reload]);
    if (!isHygieneHr(actor)) return null;
    const pending = (rows || []).filter(r => !r.confirmed);
    const canConfirm = month < thisMonth && pending.length > 0;
    const confirm = async () => {
        if (!window.confirm(`确认 ${month} 全部 ${pending.length} 人的积分？确认后不会再变动。`)) return;
        setBusy(true);
        try { await confirmMonthPoints(pending, actor); setReload(v => v + 1); } finally { setBusy(false); }
    };
    const count = (g: string) => (rows || []).filter(r => r.points.grade === g).length;
    return <div className="space-y-2.5">
        <div className="flex items-center gap-2">
            <h3 className="flex-1 text-sm font-black text-stone-800 flex items-center gap-1.5"><Award size={15} /> 员工积分</h3>
            <div className="flex bg-stone-100 rounded-lg p-0.5">{[thisMonth, prevMonth(thisMonth)].map((m, i) => <button key={m} onClick={() => setMonth(m)} className={`px-2.5 h-8 rounded-md text-xs font-black ${month === m ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>{i ? '上个月' : '这个月'}</button>)}</div>
            <button onClick={() => setReload(v => v + 1)} className="w-9 h-9 rounded-lg grid place-items-center text-stone-400" aria-label="刷新"><RefreshCw size={14} /></button>
        </div>
        {rows === null ? <p className="text-xs text-stone-400">计算中…</p> : <>
            <p className="text-xs text-stone-500">{(['A', 'B', 'C', 'D'] as const).map(g => `${g} ${count(g)} 人`).join(' · ')}{month === thisMonth ? ' · 算到今天为止' : ''}</p>
            <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
                {rows.map(r => <button key={r.employee.id} onClick={() => setOpen(r)} className="w-full flex items-center gap-3 px-3 py-2 text-left active:bg-stone-50">
                    <span className="flex-1 min-w-0 text-sm font-black text-stone-900 truncate">{shortName(r.employee)}{r.confirmed && <CheckCircle2 size={13} className="inline ml-1 text-emerald-500" />}</span>
                    <b className="text-sm font-black tabular-nums">{r.points.total}</b>
                    <span className={`w-7 text-center rounded-md text-xs font-black py-0.5 ${GRADE_CLASS[r.points.grade]}`}>{r.points.grade}</span>
                </button>)}
            </div>
            {canConfirm && <button onClick={confirm} disabled={busy} className="w-full min-h-[46px] rounded-xl bg-stone-900 text-[#FFD200] text-sm font-black disabled:opacity-50">{busy ? '确认中…' : `确认 ${month} 积分（${pending.length} 人）`}</button>}
        </>}
        {open && <Sheet title={`${shortName(open.employee)} · ${month} · ${open.points.total} 分 ${open.points.grade}`} onClose={() => setOpen(null)}>
            <PointsBreakdown points={open.points} />
        </Sheet>}
    </div>;
};
