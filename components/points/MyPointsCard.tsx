import React from 'react';
import { Award } from 'lucide-react';

const T = {
    zh: { title: '我的积分（每月）', note: '积分规则确认后从下个月开始计算。每一项会写清楚是哪件事加分或扣分。', rows: [['任务完成率', 30], ['出勤（迟到 / 早退）', 25], ['个人卫生（每周检查）', 20], ['会议出席', 10], ['加分 / 扣分（表扬、警告、技能升星）', null]] },
    en: { title: 'My points (monthly)', note: 'Points start next month once the rules are confirmed. Every item shows which action added or deducted points.', rows: [['Task completion', 30], ['Attendance (late / early out)', 25], ['Personal hygiene (weekly check)', 20], ['Meetings', 10], ['Bonus / deductions (praise, warnings, skill up)', null]] },
    my: { title: 'ကျွန်ုပ်၏ အမှတ် (လစဉ်)', note: 'စည်းမျဉ်း အတည်ပြုပြီးနောက် နောက်လမှ စတင်တွက်ပါမည်။', rows: [['လုပ်ငန်းပြီးစီးမှု', 30], ['အချိန်လိုက်နာမှု', 25], ['ကိုယ်ရေးသန့်ရှင်းမှု', 20], ['အစည်းအဝေး', 10], ['အပိုအမှတ် / နုတ်အမှတ်', null]] },
} as const;

/** 员工「我的」：取代旧的季度评分。积分系统上线前只显示项目与满分。 */
export const MyPointsCard: React.FC<{ lang: string }> = ({ lang }) => {
    const t = T[lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh'];
    return <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-3">
        <h3 className="font-black text-sm text-[#111111] border-b border-gray-100 pb-3 flex items-center gap-2"><Award size={16} className="text-[#FFD200]" /><span>{t.title}</span></h3>
        <div className="divide-y divide-gray-100">
            {t.rows.map(([label, max]) => <div key={label} className="flex items-center justify-between py-2">
                <span className="text-sm font-bold text-stone-700">{label}</span>
                <span className="text-sm font-black tabular-nums text-stone-400">— {max !== null ? `/ ${max}` : ''}</span>
            </div>)}
        </div>
        <p className="text-xs text-stone-500">{t.note}</p>
    </div>;
};
