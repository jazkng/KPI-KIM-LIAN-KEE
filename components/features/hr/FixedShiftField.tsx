import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Employee } from '../../../types';
import { WEEKDAY_LABELS, isValidTimes } from '../../../utils/attendance/fixedShift';

type Fixed = NonNullable<Employee['fixedShift']>;
// 星期一排第一个，跟排班表一样
const DAY_ORDER = ['1', '2', '3', '4', '5', '6', '0'];

const timeInput = 'flex-1 min-w-0 min-h-[40px] rounded-lg border border-gray-200 bg-white px-1.5 text-sm font-bold text-gray-800 focus:border-amber-400 outline-none';

/** 员工档案「资料 → 工作」：固定上下班时间（选填）。可以每天同一组，也可以按星期几各设一组。 */
export const FixedShiftField: React.FC<{ value?: Fixed; isEditing: boolean; onChange: (next: Fixed | undefined) => void }> = ({ value, isEditing, onChange }) => {
    const byDay = value?.byDay || {};
    const [perDay, setPerDay] = useState(Object.keys(byDay).length > 0);

    if (!isEditing) {
        if (!isValidTimes(value)) return <div className="text-sm font-bold py-1.5 text-gray-400">没有设定（迟到 / 早退按排班分组的时间）</div>;
        const diff = DAY_ORDER.filter(d => isValidTimes(byDay[d]));
        return (
            <div className="text-sm font-bold py-1.5 text-gray-800 space-y-0.5">
                <div>{diff.length ? '其他日子' : '每天'} {value!.checkIn}–{value!.checkOut}</div>
                {diff.map(d => <div key={d} className="text-xs text-gray-600">星期{WEEKDAY_LABELS[+d]} {byDay[d].checkIn}–{byDay[d].checkOut}</div>)}
            </div>
        );
    }

    if (!value) {
        return (
            <button type="button" onClick={() => onChange({ checkIn: '09:00', checkOut: '18:00' })}
                className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-gray-300 text-xs font-black text-gray-500 active:scale-95">
                + 设定固定上下班时间
            </button>
        );
    }

    const setDay = (d: string, part: Partial<{ checkIn: string; checkOut: string }>) => {
        const cur = byDay[d] || { checkIn: value.checkIn, checkOut: value.checkOut };
        onChange({ ...value, byDay: { ...byDay, [d]: { ...cur, ...part } } });
    };
    const resetDay = (d: string) => {
        const { [d]: _drop, ...rest } = byDay;
        onChange({ ...value, byDay: Object.keys(rest).length ? rest : undefined });
    };

    return (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-xs font-black text-gray-500 w-10 shrink-0">{perDay ? '平常' : '每天'}</span>
                <input type="time" aria-label="上班时间" value={value.checkIn} onChange={e => onChange({ ...value, checkIn: e.target.value })} className={timeInput} />
                <span className="text-gray-400">–</span>
                <input type="time" aria-label="下班时间" value={value.checkOut} onChange={e => onChange({ ...value, checkOut: e.target.value })} className={timeInput} />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                <input type="checkbox" checked={perDay} onChange={e => { setPerDay(e.target.checked); if (!e.target.checked) onChange({ checkIn: value.checkIn, checkOut: value.checkOut }); }} />
                按星期几设不同的时间
            </label>
            {perDay && (
                <div className="space-y-1.5">
                    {DAY_ORDER.map(d => {
                        const own = byDay[d];
                        const t = own || value;
                        return (
                            <div key={d} className="flex items-center gap-1.5">
                                <span className={`text-sm font-black w-6 shrink-0 text-center ${own ? 'text-amber-700' : 'text-gray-400'}`} title={`星期${WEEKDAY_LABELS[+d]}`}>{WEEKDAY_LABELS[+d]}</span>
                                <input type="time" aria-label={`星期${WEEKDAY_LABELS[+d]}上班`} value={t.checkIn} onChange={e => setDay(d, { checkIn: e.target.value })} className={timeInput} />
                                <span className="text-gray-400">–</span>
                                <input type="time" aria-label={`星期${WEEKDAY_LABELS[+d]}下班`} value={t.checkOut} onChange={e => setDay(d, { checkOut: e.target.value })} className={timeInput} />
                                <button type="button" onClick={() => resetDay(d)} aria-label={`星期${WEEKDAY_LABELS[+d]}同平常`} title="同平常" className={`w-7 h-7 grid place-items-center shrink-0 text-gray-400 ${own ? '' : 'invisible'}`}><RotateCcw size={14} /></button>
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-gray-400 leading-relaxed">有设定就按这个时间算迟到 / 早退和薪资迟到扣款，不看排班分组。哪天上班仍以排班表为准。</p>
                <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-[11px] font-black text-red-500">取消固定时间</button>
            </div>
        </div>
    );
};
