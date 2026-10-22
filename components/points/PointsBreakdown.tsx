import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MonthPoints } from '../../utils/points/pointsCalc';

export const GRADE_CLASS: Record<MonthPoints['grade'], string> = { A: 'bg-emerald-500 text-white', B: 'bg-sky-500 text-white', C: 'bg-amber-400 text-stone-900', D: 'bg-rose-500 text-white' };
const sign = (n: number) => n > 0 ? `+${n}` : `${n}`;

/** 每一项得分，点开看是哪件事加分 / 扣分 */
export const PointsBreakdown: React.FC<{ points: MonthPoints }> = ({ points }) => {
    const [open, setOpen] = useState<string | null>(null);
    return <div className="divide-y divide-gray-100">
        {points.parts.map(p => <div key={p.key}>
            <button onClick={() => setOpen(o => o === p.key ? null : p.key)} className="w-full flex items-center gap-2 py-2.5 text-left">
                <span className="flex-1 text-sm font-bold text-stone-700">{p.label}</span>
                <b className={`text-sm font-black tabular-nums ${p.points < 0 ? 'text-rose-600' : 'text-stone-900'}`}>{p.max === null ? sign(p.points) : p.points}{p.max !== null && <span className="text-stone-400 font-bold"> / {p.max}</span>}</b>
                <ChevronDown size={15} className={`text-stone-300 transition-transform ${open === p.key ? 'rotate-180' : ''}`} />
            </button>
            {open === p.key && <div className="pb-2 space-y-1">
                {p.lines.length === 0 ? <p className="text-xs text-stone-400">没有加分或扣分</p> : p.lines.map((l, i) => <p key={i} className="flex gap-2 text-xs">
                    <span className="w-12 shrink-0 text-stone-400 tabular-nums">{l.date ? l.date.slice(5).replace('-', '/') : ''}</span>
                    <span className="flex-1 text-stone-600">{l.text}</span>
                    {l.points !== 0 && <b className={`tabular-nums ${l.points < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{sign(l.points)}</b>}
                </p>)}
            </div>}
        </div>)}
    </div>;
};
