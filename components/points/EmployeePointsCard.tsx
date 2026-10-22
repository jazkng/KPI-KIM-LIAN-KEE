import React, { useEffect, useState } from 'react';
import { Award, Loader2 } from 'lucide-react';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { isPartTimer } from '../../utils/hr/hrOverview';
import type { MonthPoints } from '../../utils/points/pointsCalc';
import { loadMyPoints } from '../../utils/points/pointsStore';
import type { Employee } from '../../types';
import { GRADE_CLASS, PointsBreakdown } from './PointsBreakdown';
import { PointsRules } from './PointsRules';

const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7); };

/** 员工档案「记录」：这个月 / 上个月的积分（跟员工自己看到的同一份） */
export const EmployeePointsCard: React.FC<{ employee: Employee }> = ({ employee }) => {
    const thisMonth = getMalaysiaDateString().slice(0, 7);
    const [month, setMonth] = useState(thisMonth);
    const [data, setData] = useState<MonthPoints | null | undefined>(undefined);
    const partTime = isPartTimer(employee);
    useEffect(() => {
        if (partTime) return;
        let on = true; setData(undefined);
        loadMyPoints(employee.id, month).then(d => on && setData(d)).catch(() => on && setData(null));
        return () => { on = false; };
    }, [employee.id, month, partTime]);
    return <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 space-y-3">
        <div className="flex items-center gap-2">
            <h4 className="flex-1 text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Award size={14} /> 积分</h4>
            {!partTime && <div className="flex bg-stone-100 rounded-lg p-0.5">{[thisMonth, prevMonth(thisMonth)].map((m, i) => <button key={m} onClick={() => setMonth(m)} className={`px-2.5 h-7 rounded-md text-xs font-black ${month === m ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>{i ? '上个月' : '这个月'}</button>)}</div>}
        </div>
        {partTime ? <p className="text-sm text-stone-400">兼职不评积分。</p>
            : data === undefined ? <p className="text-stone-400"><Loader2 size={16} className="inline animate-spin" /></p>
                : !data ? <p className="text-sm text-stone-400">—</p>
                    : <>
                        <div className="flex items-center gap-3"><b className="text-3xl font-black tabular-nums">{data.total}</b><span className="text-sm text-stone-400 font-bold">分</span>
                            <span className={`ml-auto px-3 py-1 rounded-xl font-black ${GRADE_CLASS[data.grade]}`}>{data.grade}</span></div>
                        <PointsBreakdown points={data} />
                    </>}
        <PointsRules />
    </div>;
};
