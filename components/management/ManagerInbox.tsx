import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { Employee } from '../../types';
import { getBusinessDateString } from '../../utils/dateHelper';
import { buildInboxItems, inboxLang, loadManagerInbox, type InboxCounts } from '../../utils/management/managerInbox';

/**
 * 管理层「待我处理」：真正要动手的事，按一下直接进去处理。
 * 有数字的排前面；都处理完的收成一行「其他都正常」。
 */
const L = {
    zh: { title: '待我处理', loading: '读取中…', clear: '都处理好了 👍', ok: '其他正常', retry: '重新读取', status: { MC: '病假', LEAVE: '请假', ABSENT: '缺勤' } as Record<string, string> },
    en: { title: 'To do', loading: 'Loading…', clear: 'All clear 👍', ok: 'All fine', retry: 'Reload', status: { MC: 'MC', LEAVE: 'Leave', ABSENT: 'Absent' } as Record<string, string> },
    my: { title: 'လုပ်ရန်', loading: 'ဖွင့်နေသည်…', clear: 'အားလုံး ပြီးပါပြီ 👍', ok: 'ကျန်တာ ပုံမှန်', retry: 'ပြန်ဖွင့်', status: { MC: 'ဆေးခွင့်', LEAVE: 'ခွင့်', ABSENT: 'ပျက်ကွက်' } as Record<string, string> },
};

export const ManagerInbox: React.FC<{ employee: Employee; lang: string; onOpen: (target: string) => void }> = ({ employee, lang, onOpen }) => {
    const t = L[inboxLang(lang)];
    const [counts, setCounts] = useState<InboxCounts | null>(null);
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(0);
    const [openPeople, setOpenPeople] = useState(false);

    useEffect(() => {
        let active = true;
        setLoading(true);
        loadManagerInbox(employee, getBusinessDateString())
            .then(c => { if (active) setCounts(c); })
            .catch(() => { if (active) setCounts({}); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [employee, reload]);

    const items = counts ? buildInboxItems(counts, lang) : [];
    const todo = items.filter(i => i.count > 0), fine = items.filter(i => i.count === 0);

    return <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-black text-stone-800 flex items-center gap-2">{t.title}
                {todo.length > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black grid place-items-center">{todo.reduce((s, i) => s + i.count, 0)}</span>}
            </h3>
            <button onClick={() => setReload(v => v + 1)} disabled={loading} aria-label={t.retry} className="w-9 h-9 rounded-full grid place-items-center text-stone-400 active:bg-stone-100">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>

        {loading && !counts ? <div className="p-4 rounded-2xl bg-white border border-stone-200 text-center text-xs font-bold text-stone-400">{t.loading}</div> : <>
            {todo.length === 0 && <div className="p-4 rounded-2xl bg-white border border-emerald-200 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-500 shrink-0" /><span className="text-sm font-black text-emerald-700">{t.clear}</span>
            </div>}
            {todo.map(i => <div key={i.key} className="rounded-2xl bg-white border border-stone-200 shadow-xs overflow-hidden">
                <button onClick={() => i.people ? setOpenPeople(v => !v) : onOpen(i.target)} className="w-full flex items-center gap-3 p-3.5 text-left active:bg-stone-50 min-h-[64px]">
                    <span className="text-2xl w-9 text-center shrink-0">{i.icon}</span>
                    <span className="flex-1 min-w-0">
                        <b className="block text-[15px] font-black text-stone-900 truncate">{i.title}</b>
                        <small className="block text-xs text-stone-500 font-semibold truncate">{i.sub}</small>
                    </span>
                    <span className={`min-w-[30px] h-[30px] px-2 rounded-full grid place-items-center text-sm font-black ${i.tone === 'urgent' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{i.count}</span>
                    {i.people ? <ChevronDown size={18} className={`text-stone-300 transition-transform ${openPeople ? 'rotate-180' : ''}`} /> : <ChevronRight size={18} className="text-stone-300" />}
                </button>
                {i.people && openPeople && <div className="px-3.5 pb-3 flex flex-wrap gap-1.5">
                    {i.people.map((p, idx) => <span key={idx} className="px-2.5 py-1 rounded-full bg-stone-50 border border-stone-200 text-xs font-bold text-stone-700">{p.name} · {t.status[p.status] || p.status}</span>)}
                    <button onClick={() => onOpen(i.target)} className="px-2.5 py-1 rounded-full bg-stone-900 text-[#FFD200] text-xs font-black">→</button>
                </div>}
            </div>)}
            {fine.length > 0 && <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
                <CheckCircle2 size={13} className="text-emerald-500" /><span className="text-[11px] font-bold text-stone-400">{t.ok}：</span>
                {fine.map(i => <button key={i.key} onClick={() => onOpen(i.target)} className="text-[11px] font-bold text-stone-500 bg-white border border-stone-200 rounded-full px-2 py-0.5">{i.title}</button>)}
            </div>}
        </>}
    </section>;
};
