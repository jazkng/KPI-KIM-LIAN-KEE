// 员工看得到的任务文字（中 / 英 / 缅）。管理层画面只用中文。
type L = 'zh' | 'en' | 'my';
export const tl = (lang: string): L => lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh';

const T = {
    myTasks: { zh: '我的任务', en: 'My tasks', my: 'ကျွန်ုပ်၏ တာဝန်များ' },
    noTasks: { zh: '目前没有任务 👍', en: 'No tasks 👍', my: 'တာဝန် မရှိပါ 👍' },
    todo: { zh: '待做', en: 'To do', my: 'လုပ်ရန်' },
    submitted: { zh: '已交回，等确认', en: 'Submitted, waiting', my: 'ပေးပို့ပြီး စောင့်နေ' },
    done: { zh: '完成', en: 'Done', my: 'ပြီးပြီ' },
    overdue: { zh: '逾期', en: 'Overdue', my: 'နောက်ကျ' },
    daily: { zh: '每日', en: 'Daily', my: 'နေ့စဉ်' },
    dept: { zh: '部门任务', en: 'Team task', my: 'ဌာန တာဝန်' },
    due: { zh: '期限', en: 'Due', my: 'နောက်ဆုံး' },
    returned: { zh: '被退回，请重做', en: 'Returned, please redo', my: 'ပြန်ပို့ထားသည်၊ ပြန်လုပ်ပါ' },
    count: { zh: '点到的数量', en: 'Counted qty', my: 'ရေတွက်ထားသော အရေအတွက်' },
    photos: { zh: '照片', en: 'Photos', my: 'ဓာတ်ပုံ' },
    needPhotos: { zh: '至少要拍 {n} 张', en: 'At least {n} photo(s)', my: 'အနည်းဆုံး {n} ပုံ' },
    addPhoto: { zh: '拍照 / 选照片', en: 'Take / pick photo', my: 'ဓာတ်ပုံ ရိုက် / ရွေး' },
    note: { zh: '备注（选填）', en: 'Note (optional)', my: 'မှတ်ချက် (မဖြစ်မနေ မဟုတ်)' },
    submit: { zh: '完成，交回', en: 'Done, submit', my: 'ပြီးပြီ၊ ပေးပို့' },
    saving: { zh: '送出中…', en: 'Sending…', my: 'ပို့နေသည်…' },
    bought: { zh: '买了什么', en: 'What you bought', my: 'ဝယ်ခဲ့သည်များ' },
    item: { zh: '名称', en: 'Item', my: 'ပစ္စည်း' },
    qty: { zh: '数量', en: 'Qty', my: 'အရေအတွက်' },
    amount: { zh: '金额 RM', en: 'Amount RM', my: 'ငွေ RM' },
    addRow: { zh: '＋ 加一行', en: '+ Add row', my: '+ ထပ်ထည့်' },
    close: { zh: '关闭', en: 'Close', my: 'ပိတ်' },
    from: { zh: '派的人', en: 'From', my: 'ပေးသူ' },
} as const;

export const tt = (key: keyof typeof T, lang: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), T[key][tl(lang)]);
