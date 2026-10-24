import React from 'react';
import { DENOMINATIONS, cashTotalSen, cleanCounts, formatRm, type CashCounts } from '../../utils/tasks/cashCount';
import { tt } from './taskText';

/** 收银点钱：按面额填张数，自动算合计。value 是输入框的文字（可空白） */
export const CashCounter: React.FC<{ value: Record<string, string>; onChange: (v: Record<string, string>) => void; lang: string; title: string }> = ({ value, onChange, lang, title }) => {
    const total = cashTotalSen(cleanCounts(value));
    const row = (coin: boolean) => DENOMINATIONS.filter(d => d.coin === coin).map(d => {
        const k = String(d.sen);
        const n = Number(value[k]) || 0;
        return <div key={k} className="grid grid-cols-[60px_minmax(0,1fr)_72px] gap-1.5 items-center">
            <b className="text-sm font-black text-stone-800">{d.label}</b>
            <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => onChange({ ...value, [k]: String(Math.max(0, n - 1)) })} aria-label={`${d.label} −1`} className="w-10 h-10 rounded-xl bg-stone-100 text-lg font-black">−</button>
                <input inputMode="numeric" aria-label={d.label} value={value[k] ?? ''} placeholder="0"
                    onChange={e => onChange({ ...value, [k]: e.target.value.replace(/[^0-9]/g, '') })}
                    className="min-w-0 flex-1 h-10 rounded-xl border border-stone-200 text-center font-black text-[16px]" />
                <button type="button" onClick={() => onChange({ ...value, [k]: String(n + 1) })} aria-label={`${d.label} +1`} className="w-10 h-10 rounded-xl bg-stone-100 text-lg font-black">＋</button>
            </div>
            <span className="text-right text-xs font-bold text-stone-500 tabular-nums">{formatRm(d.sen * (Number(value[k]) || 0))}</span>
        </div>;
    });
    return <div className="rounded-2xl bg-white border border-stone-200 p-3 space-y-2.5">
        <p className="text-xs font-black text-stone-500">{title}</p>
        <p className="text-[11px] font-black text-stone-400">{tt('cashNotes', lang)}</p>
        {row(false)}
        <p className="text-[11px] font-black text-stone-400 pt-1">{tt('cashCoins', lang)}</p>
        {row(true)}
        <div className="flex justify-between items-center border-t border-stone-100 pt-2">
            <b className="text-sm font-black">{tt('cashTotal', lang)}</b>
            <b className="text-xl font-black text-stone-900 tabular-nums">{formatRm(total)}</b>
        </div>
    </div>;
};

/** 只读：某一边的面额明细（管理层看） */
export const CashBreakdown: React.FC<{ counts: CashCounts }> = ({ counts }) =>
    <div className="flex flex-wrap gap-1.5">{DENOMINATIONS.filter(d => counts[String(d.sen)]).map(d =>
        <span key={d.sen} className="text-[11px] font-bold rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{d.label} × {counts[String(d.sen)]}</span>)}</div>;
