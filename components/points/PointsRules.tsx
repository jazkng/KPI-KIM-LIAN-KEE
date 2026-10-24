import React from 'react';

/** 积分标准（员工、HR、员工档案都看同一份） */
const RULES: [string, string, string][] = [
    ['任务完成率', '30', '派给你的任务，每一期算一次；迟交但有交回也算完成'],
    ['出勤', '25', '迟到 −2、早退 −2、缺勤 −5（主管已豁免的迟到不扣）'],
    ['个人卫生', '20', '每周由有权限的主管评分一次；L4 最高 3 分、L3 最高 4 分、L2 最高 5 分；平均 3 分 = 满分，2 分 = 10，1 分 = 0'],
    ['会议出席', '10', '开始后 10 分钟内签到 = 合格；更晚 −3；没来 −5'],
    ['纪律', '15', '警告 −5；黄色警告 −10、下个月 −5；红色警告 −50 起每月少 10（5 个月）'],
    ['加分', '+', '表扬 +15；卫生 4 分 +1、5 分 +2'],
];
const RULES_EN: [string, string, string][] = [
    ['Tasks completed', '30', 'Each assigned task cycle counts once. Late submissions still count.'],
    ['Attendance', '25', 'Late −2, left early −2, absent −5. Approved late arrivals are exempt.'],
    ['Personal hygiene', '20', 'Authorized supervisors check weekly. L4 can award up to 3, L3 up to 4, L2 up to 5. Average 3 earns full points.'],
    ['Meetings', '10', 'Check in within 10 minutes. Later −3; absent −5.'],
    ['Discipline', '15', 'Verbal warning −5; yellow warning −10 then −5 next month; red warning −50, reducing the deduction by 10 each month over 5 months.'],
    ['Bonus', '+', 'Praise +15; hygiene score 4 earns +1, score 5 earns +2.'],
];
const RULES_MY: [string, string, string][] = [
    ['တာဝန်ပြီးမြောက်မှု', '30', 'ပေးအပ်ထားသော တာဝန်တစ်ကြိမ်စီကို တွက်သည်။ နောက်ကျ၍ တင်သွင်းလည်း ပြီးမြောက်သည်ဟု တွက်သည်။'],
    ['အလုပ်တက်ရောက်မှု', '25', 'နောက်ကျ −2၊ စောထွက် −2၊ ပျက်ကွက် −5။ ခွင့်ပြုထားသော နောက်ကျမှုကို မနုတ်ပါ။'],
    ['တစ်ကိုယ်ရေသန့်ရှင်းရေး', '20', 'ခွင့်ပြုထားသော ကြီးကြပ်သူက အပတ်စဉ် စစ်ဆေးသည်။ L4 အများဆုံး 3၊ L3 အများဆုံး 4၊ L2 အများဆုံး 5 မှတ်ပေးနိုင်သည်။'],
    ['အစည်းအဝေး', '10', 'စပြီး ၁၀ မိနစ်အတွင်း တက်ရောက်ပါ။ နောက်ကျ −3၊ ပျက်ကွက် −5။'],
    ['စည်းကမ်း', '15', 'နှုတ်ဖြင့်သတိပေးချက် −5၊ အဝါရောင်သတိပေးချက် −10 နှင့် နောက်လ −5၊ အနီရောင်သတိပေးချက် −50 မှစ၍ ၅ လအတွင်း လစဉ် နုတ်သည့်အမှတ် 10 စီ လျော့သည်။'],
    ['အပိုအမှတ်', '+', 'ချီးကျူးမှု +15၊ သန့်ရှင်းရေး 4 မှတ်ရလျှင် +1၊ 5 မှတ်ရလျှင် +2။'],
];

export const PointsRules: React.FC<{ className?: string; lang?: string }> = ({ className, lang = 'zh' }) => <details className={`rounded-xl bg-stone-50 border border-stone-200 px-3 py-2 ${className || ''}`}>
    <summary className="text-xs font-black text-stone-600 cursor-pointer">{lang === 'my' ? 'အမှတ်စည်းမျဉ်း (လစဉ်၊ အများဆုံး 100)' : lang === 'en' ? 'Point rules (monthly, up to 100)' : '积分标准（每月，满分 100）'}</summary>
    <table className="w-full mt-2 text-xs"><tbody>
        {(lang === 'my' ? RULES_MY : lang === 'en' ? RULES_EN : RULES).map(([k, max, desc]) => <tr key={k} className="border-t border-stone-200 align-top">
            <td className="py-1.5 pr-2 font-black text-stone-800 whitespace-nowrap">{k}</td>
            <td className="py-1.5 pr-2 font-black tabular-nums text-stone-500">{max}</td>
            <td className="py-1.5 text-stone-600">{desc}</td>
        </tr>)}
    </tbody></table>
    <p className="mt-2 text-[11px] text-stone-500">{lang === 'my' ? 'အဆင့် A: 90 နှင့်အထက် · B: 75–89 · C: 60–74 · D: 60 အောက်။ အချိန်ပိုင်းဝန်ထမ်းကို မတွက်ပါ။' : lang === 'en' ? 'Grades: A 90+, B 75–89, C 60–74, D below 60. Part-time staff are not graded.' : '等级：A 90 分以上 · B 75–89 · C 60–74 · D 60 以下。兼职不评。技能星级是个人能力，不算积分。'}</p>
</details>;
