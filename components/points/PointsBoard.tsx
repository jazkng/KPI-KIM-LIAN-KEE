import React, { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, ChevronDown, RefreshCw } from 'lucide-react';
import type { Employee } from '../../types';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { shortName } from '../../utils/hr/hrOverview';
import { isHygieneHr } from '../../utils/points/hygieneAccess';
import type { MonthPoints } from '../../utils/points/pointsCalc';
import { confirmMonthPoints, loadAllPoints } from '../../utils/points/pointsStore';
import { getDeptLabel, getEmployeeDept, DEPT_SEQUENCE } from '../features/roster/rosterUtils';
import { Sheet } from '../tasks/TaskForms';
import { GRADE_CLASS, PointsBreakdown } from './PointsBreakdown';
import { PointsRules } from './PointsRules';

const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7); };
type Row = { employee: Employee; points: MonthPoints; confirmed: boolean };

/** HR：员工月积分（按部门分区，按「展开」才读取）；过去的月份可以「确认」存档 */
export const PointsBoard: React.FC<{ actor: Employee }> = ({ actor }) => {
    const thisMonth = getMalaysiaDateString().slice(0, 7);
    const [expanded, setExpanded] = useState(false);
    const [month, setMonth] = useState(thisMonth);
    const [rows, setRows] = useState<Row[] | null>(null);
    const [open, setOpen] = useState<Row | null>(null);
    const [reload, setReload] = useState(0);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!expanded) return;
        let on = true; setRows(null);
        loadAllPoints(month).then(r => on && setRows(r)).catch(() => on && setRows([]));
        return () => { on = false; };
    }, [month, reload, expanded]);
    const groups = useMemo(() => {
        const by = new Map<string, Row[]>();
        (rows || []).forEach(r => { const d = getEmployeeDept(r.employee); by.set(d, [...(by.get(d) || []), r]); });
        return [...by.entries()].sort((a, b) => DEPT_SEQUENCE.indexOf(a[0]) - DEPT_SEQUENCE.indexOf(b[0]));
    }, [rows]);
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
        <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="w-full flex items-center gap-2 text-left">
            <h3 className="flex-1 text-sm font-black text-stone-800 flex items-center gap-1.5"><Award size={15} /> 员工积分</h3>
            <span className="text-xs font-bold text-stone-400">{expanded ? '收起' : '展开'}</span>
            <ChevronDown size={16} className={`text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && <>
            <div className="flex items-center gap-2">
                <div className="flex bg-stone-100 rounded-lg p-0.5">{[thisMonth, prevMonth(thisMonth)].map((m, i) => <button key={m} onClick={() => setMonth(m)} className={`px-2.5 h-8 rounded-md text-xs font-black ${month === m ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>{i ? '上个月' : '这个月'}</button>)}</div>
                <span className="flex-1 text-xs font-bold text-stone-500">{rows && (['A', 'B', 'C', 'D'] as const).map(g => `${g} ${count(g)}`).join(' · ')}</span>
                <button onClick={() => setReload(v => v + 1)} className="w-8 h-8 rounded-lg grid place-items-center text-stone-400" aria-label="刷新"><RefreshCw size={14} /></button>
            </div>
            {rows === null ? <p className="text-xs text-stone-400">计算中…</p> : <div className="space-y-2">
                {groups.map(([dept, list]) => <div key={dept}>
                    <p className="text-[11px] font-black text-stone-500 mb-1">{getDeptLabel(dept)} · {list.length} 人</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                        {list.map(r => <button key={r.employee.id} onClick={() => setOpen(r)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-left active:bg-stone-50">
                            <span className="flex-1 min-w-0 text-[13px] font-bold text-stone-800 truncate">{shortName(r.employee)}{r.confirmed && <CheckCircle2 size={11} className="inline ml-0.5 text-emerald-500" />}</span>
                            <b className="text-[13px] font-black tabular-nums">{r.points.total}</b>
                            <span className={`w-5 text-center rounded text-[11px] font-black ${GRADE_CLASS[r.points.grade]}`}>{r.points.grade}</span>
                        </button>)}
                    </div>
                </div>)}
                {month === thisMonth && <p className="text-[11px] text-stone-400">这个月算到今天为止；兼职不评。</p>}
                {canConfirm && <button onClick={confirm} disabled={busy} className="w-full min-h-[44px] rounded-xl bg-stone-900 text-[#FFD200] text-sm font-black disabled:opacity-50">{busy ? '确认中…' : `确认 ${month} 积分（${pending.length} 人）`}</button>}
            </div>}
            <PointsRules />
        </>}
        {open && <Sheet title={`${shortName(open.employee)} · ${month} · ${open.points.total} 分 ${open.points.grade}`} onClose={() => setOpen(null)}>
            <PointsBreakdown points={open.points} />
        </Sheet>}
    </div>;
};
