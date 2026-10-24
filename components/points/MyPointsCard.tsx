import React, { useEffect, useState } from 'react';
import { Award, Loader2 } from 'lucide-react';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import type { MonthPoints } from '../../utils/points/pointsCalc';
import { loadMyPoints } from '../../utils/points/pointsStore';
import { PointsBreakdown, GRADE_CLASS } from './PointsBreakdown';
import { PointsRules } from './PointsRules';

const T = {
    zh: { title: '我的积分', thisMonth: '这个月', lastMonth: '上个月', sofar: '算到今天为止，月底 HR 确认后才定案。', confirmed: 'HR 已确认' },
    en: { title: 'My points', thisMonth: 'This month', lastMonth: 'Last month', sofar: 'Counted up to today; final after HR confirms at month end.', confirmed: 'Confirmed by HR' },
    my: { title: 'ကျွန်ုပ်၏ အမှတ်', thisMonth: 'ဒီလ', lastMonth: 'ပြီးခဲ့သည့်လ', sofar: 'ယနေ့အထိ တွက်ထားသည်။', confirmed: 'HR အတည်ပြုပြီး' },
} as const;
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };

/** 员工「我的」：这个月 / 上个月的积分与明细（让员工知道自己的行为带来什么结果） */
export const MyPointsCard: React.FC<{ lang: string; employeeId: string }> = ({ lang, employeeId }) => {
    const t = T[lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh'];
    const thisMonth = getMalaysiaDateString().slice(0, 7);
    const [month, setMonth] = useState(thisMonth);
    const [data, setData] = useState<MonthPoints | null | undefined>(undefined);
    useEffect(() => { let on = true; setData(undefined); loadMyPoints(employeeId, month).then(d => on && setData(d)).catch(() => on && setData(null)); return () => { on = false; }; }, [employeeId, month]);
    return <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Award size={16} className="text-[#FFD200]" /><h3 className="flex-1 font-black text-sm text-[#111111]">{t.title}</h3>
            <div className="flex bg-stone-100 rounded-lg p-0.5">{[thisMonth, prevMonth(thisMonth)].map((m, i) => <button key={m} onClick={() => setMonth(m)} className={`px-2.5 h-8 rounded-md text-xs font-black ${month === m ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>{i ? t.lastMonth : t.thisMonth}</button>)}</div>
        </div>
        {data === undefined ? <p className="text-center text-stone-400 py-4"><Loader2 className="inline animate-spin" size={18} /></p>
            : !data ? <p className="text-sm text-stone-400">—</p>
                : <>
                    <div className="flex items-end gap-3">
                        <b className="text-4xl font-black tabular-nums text-stone-900">{data.total}</b><span className="pb-1 text-sm font-bold text-stone-400">{lang === 'my' ? 'မှတ်' : lang === 'en' ? 'pts' : '分'}</span>
                        <span className={`ml-auto px-3 py-1 rounded-xl text-lg font-black ${GRADE_CLASS[data.grade]}`}>{data.grade}</span>
                    </div>
                    <p className="text-[11px] text-stone-500">{'confirmedAt' in data ? t.confirmed : t.sofar}</p>
                    <PointsBreakdown points={data} lang={lang} />
                    <PointsRules lang={lang} />
                </>}
    </div>;
};

