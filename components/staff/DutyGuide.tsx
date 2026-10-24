import React from 'react';
import { ClipboardList } from 'lucide-react';
import type { SOPItem } from '../../types';

type Language = 'zh' | 'en' | 'my';
const WORDS = {
    zh: { title: '我的岗位职责', intro: '按顺序做好这些工作；这里是工作指引，无需打勾。', open: '开档准备', during: '营业中', close: '打烊收尾', standard: '标准', why: '目的' },
    en: { title: 'My duties', intro: 'Use this as a guide. No check-off needed.', open: 'Opening', during: 'During service', close: 'Closing', standard: 'Standard', why: 'Why' },
    my: { title: 'ကျွန်ုပ်၏ တာဝန်', intro: 'လုပ်ငန်းလမ်းညွှန်ဖြစ်သည်။ အမှန်ခြစ်ရန် မလိုပါ။', open: 'ဆိုင်ဖွင့် ပြင်ဆင်မှု', during: 'ဆိုင်ဖွင့်ချိန်', close: 'ဆိုင်ပိတ် ပြင်ဆင်မှု', standard: 'စံနှုန်း', why: 'ရည်ရွယ်ချက်' },
};

export const DutyGuide: React.FC<{ items: SOPItem[]; role: string; lang: Language; translate: (text: string) => string }> = ({ items, role, lang, translate }) => {
    const t = WORDS[lang];
    const groups = [
        { key: 'start_', title: t.open, accent: 'bg-amber-400' },
        { key: 'auto_', title: t.during, accent: 'bg-sky-500' },
        { key: 'end_', title: t.close, accent: 'bg-rose-700' },
    ];
    return <section className="space-y-3" aria-label={t.title}>
        <div className="rounded-2xl bg-[#740f10] p-5 text-white shadow-sm">
            <div className="flex items-center gap-2"><ClipboardList size={18} className="text-[#FFD200]" /><h2 className="text-lg font-black">{t.title}</h2></div>
            <p className="mt-1 text-sm font-bold text-white/80">{role}</p>
            <p className="mt-2 text-xs text-white/70">{t.intro}</p>
        </div>
        {groups.map(g => {
            const rows = items.filter(i => i.id.startsWith(g.key));
            if (!rows.length) return null;
            return <div key={g.key} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <h3 className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 text-sm font-black text-stone-900"><span className={`h-3 w-1 rounded-full ${g.accent}`} />{g.title}<span className="ml-auto text-xs text-stone-400">{rows.length}</span></h3>
                <ol className="divide-y divide-stone-100">{rows.map((item, index) => <li key={item.id} className="flex gap-3 px-4 py-3.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-xs font-black text-stone-600">{index + 1}</span>
                    <div className="min-w-0 space-y-1"><b className="block text-sm leading-snug text-stone-900">{translate(item.label)}</b>
                        {item.standard && <p className="text-xs leading-relaxed text-stone-600"><span className="font-black text-stone-500">{t.standard} · </span>{translate(item.standard)}</p>}
                        {item.why && <p className="text-xs leading-relaxed text-stone-500"><span className="font-black">{t.why} · </span>{translate(item.why)}</p>}</div>
                </li>)}</ol>
            </div>;
        })}
    </section>;
};
