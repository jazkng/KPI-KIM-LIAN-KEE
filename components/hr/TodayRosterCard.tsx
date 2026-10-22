import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { DataManager } from '../../utils/dataManager';
import { getBusinessDateString } from '../../utils/dateHelper';
import { buildHrOverview, ROSTER_STATUS_LABEL, type HrOverview } from '../../utils/hr/hrOverview';

/**
 * 今日排班（精简版）：各部门谁上班（显示昵称）、几人休息。只读：直接读 roster_months 这个月的文件。
 */
export const TodayRosterCard: React.FC<{ lang?: string; onOpen?: () => void }> = ({ lang = 'zh', onOpen }) => {
    const [data, setData] = useState<HrOverview | null>(null);
    const today = getBusinessDateString();
    useEffect(() => {
        let on = true;
        Promise.all([DataManager.getEmployees(), getDoc(doc(db, 'roster_months', today.slice(0, 7))).catch(() => null)])
            .then(([emps, snap]) => { if (on) setData(buildHrOverview({ employees: emps, today, dayRoster: snap?.exists() ? (snap.data().roster || {})[today] || {} : null })); })
            .catch(() => on && setData(null));
        return () => { on = false; };
    }, [today]);
    const my = lang === 'my';
    return <section className="rounded-2xl bg-white border border-stone-200 shadow-xs p-4 space-y-3">
        <button onClick={onOpen} className="w-full flex items-center gap-2 text-left">
            <CalendarDays size={18} className="text-rose-500" />
            <b className="flex-1 text-[15px] font-black text-stone-900">{my ? 'ယနေ့ အလှည့်' : '今日排班'} <small className="text-xs font-bold text-stone-400">{Number(today.slice(5, 7))}/{Number(today.slice(8))}</small></b>
            {data?.hasRoster && <span className="text-xs font-bold text-stone-500">{my ? 'အလုပ်' : '上班'} <b className="text-emerald-600">{data.working}</b> · {my ? 'နား' : '休息'} <b>{data.off}</b></span>}
            {onOpen && <ChevronRight size={16} className="text-stone-300" />}
        </button>
        {!data ? <p className="text-xs text-stone-400">…</p> : !data.hasRoster ? <p className="text-xs text-stone-400">{my ? 'ဒီလ အလှည့်ဇယား မရှိသေး' : '本月班表还没建立'}</p>
            : data.depts.filter(d => d.working.length || d.off.length).map(d => <div key={d.dept} className="flex gap-2 items-start">
                <span className="w-10 shrink-0 text-xs font-black text-stone-500 pt-1">{d.label}</span>
                <div className="flex-1 flex flex-wrap gap-1">
                    {d.working.map(p => <span key={p.employeeId} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold">{p.name}{p.status !== 'WORK' && ROSTER_STATUS_LABEL[p.status] ? <small className="ml-1 text-[10px] text-emerald-600/70">{ROSTER_STATUS_LABEL[p.status]}</small> : null}</span>)}
                    {d.off.map(p => <span key={p.employeeId} className="px-2 py-0.5 rounded-full border border-dashed border-stone-300 text-stone-400 text-xs font-bold">{p.name}</span>)}
                </div>
            </div>)}
    </section>;
};
