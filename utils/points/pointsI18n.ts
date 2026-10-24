import type { PointsKey } from './pointsCalc';

type Language = 'zh' | 'en' | 'my';
export const pointsLanguage = (lang: string): Language => lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh';

const labels: Record<PointsKey, Record<Language, string>> = {
    tasks: { zh: '任务完成率', en: 'Tasks completed', my: 'တာဝန်ပြီးမြောက်မှု' },
    attendance: { zh: '出勤（迟到 / 早退）', en: 'Attendance (late / early)', my: 'အလုပ်တက်ရောက်မှု (နောက်ကျ / စောထွက်)' },
    hygiene: { zh: '个人卫生', en: 'Personal hygiene', my: 'တစ်ကိုယ်ရေသန့်ရှင်းရေး' },
    meetings: { zh: '会议出席', en: 'Meeting attendance', my: 'အစည်းအဝေး တက်ရောက်မှု' },
    discipline: { zh: '纪律', en: 'Discipline', my: 'စည်းကမ်း' },
    bonus: { zh: '加分（表扬、卫生超标）', en: 'Bonus (praise and hygiene)', my: 'အပိုအမှတ် (ချီးကျူးမှု၊ သန့်ရှင်းရေး)' },
};
export const pointsLabel = (key: PointsKey, lang: string) => labels[key][pointsLanguage(lang)];

const fixed: Record<string, Record<'en' | 'my', string>> = {
    '迟到': { en: 'Late', my: 'နောက်ကျခြင်း' },
    '早退': { en: 'Left early', my: 'စောထွက်ခြင်း' },
    '缺勤': { en: 'Absent', my: 'ပျက်ကွက်ခြင်း' },
    '本月没有派给你的任务': { en: 'No tasks assigned this month', my: 'ဒီလတွင် တာဝန်ပေးထားခြင်း မရှိပါ' },
    '本月还没有卫生检查': { en: 'No hygiene check this month', my: 'ဒီလတွင် သန့်ရှင်းရေး စစ်ဆေးမှု မရှိသေးပါ' },
};

export const pointsLine = (value: string, lang: string): string => {
    const l = pointsLanguage(lang);
    if (l === 'zh') return value;
    if (fixed[value]) return fixed[value][l];
    let match = value.match(/^完成 (\d+) \/ (\d+) 个任务$/);
    if (match) return l === 'en' ? `Completed ${match[1]} of ${match[2]} tasks` : `တာဝန် ${match[2]} ခုအနက် ${match[1]} ခု ပြီးမြောက်`;
    match = value.match(/^没完成：(.*)$/);
    if (match) return `${l === 'en' ? 'Not completed' : 'မပြီးမြောက်'}: ${match[1]}`;
    match = value.match(/^卫生 (\d+) 分（超过标准）$/);
    if (match) return l === 'en' ? `Hygiene ${match[1]} points (above standard)` : `သန့်ရှင်းရေး ${match[1]} မှတ် (စံထက်မြင့်)`;
    match = value.match(/^卫生 (\d+) 分(?:：(.*))?（(.*)）$/);
    if (match) return l === 'en' ? `Hygiene ${match[1]} points${match[2] ? `: ${match[2]}` : ''} (${match[3]})` : `သန့်ရှင်းရေး ${match[1]} မှတ်${match[2] ? `: ${match[2]}` : ''} (${match[3]})`;
    match = value.match(/^表扬：(.*)$/);
    if (match) return `${l === 'en' ? 'Praise' : 'ချီးကျူးမှု'}: ${match[1]}`;
    match = value.match(/^(管理层会议|店面会议)(没来|晚到（([^）]+)）|准时)$/);
    if (match) {
        const meeting = match[1] === '管理层会议' ? (l === 'en' ? 'Management meeting' : 'စီမံခန့်ခွဲရေး အစည်းအဝေး') : (l === 'en' ? 'Store meeting' : 'ဆိုင်အစည်းအဝေး');
        const outcome = match[2] === '没来' ? (l === 'en' ? 'absent' : 'မတက်ရောက်') : match[2] === '准时' ? (l === 'en' ? 'on time' : 'အချိန်မီ') : (l === 'en' ? `late (${match[3]})` : `နောက်ကျ (${match[3]})`);
        return `${meeting}: ${outcome}`;
    }
    match = value.match(/^(警告|黄色警告|红色警告)(?:（第 (\d+) 个月）)?：(.*)$/);
    if (match) {
        const warning = match[1] === '警告' ? (l === 'en' ? 'Warning' : 'သတိပေးချက်') : match[1] === '黄色警告' ? (l === 'en' ? 'Yellow warning' : 'အဝါရောင် သတိပေးချက်') : (l === 'en' ? 'Red warning' : 'အနီရောင် သတိပေးချက်');
        const period = match[2] ? (l === 'en' ? ` (month ${match[2]})` : ` (${match[2]} လမြောက်)`) : '';
        return `${warning}${period}: ${match[3]}`;
    }
    return value;
};
