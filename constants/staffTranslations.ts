import { AppLanguage, normalizeLanguage } from '../types';

export type StaffLang = AppLanguage | 'zh' | 'zh_en';

export function cleanEnglishOnly(text: string): string {
  if (!text) return '';
  const parenthesizedEn = text.match(/\(([^)]*[a-zA-Z]{2,}[^)]*)\)/);
  if (parenthesizedEn && parenthesizedEn[1]) {
    return parenthesizedEn[1].trim();
  }
  const reverseParenthesizedEn = text.match(/^([a-zA-Z0-9\s\/\-\&]+)\s*[\(（]/);
  if (reverseParenthesizedEn && reverseParenthesizedEn[1]) {
    return reverseParenthesizedEn[1].trim();
  }
  if (text.includes('/')) {
    const parts = text.split('/');
    const enPart = parts.find(p => /[a-zA-Z]/.test(p));
    if (enPart) return enPart.trim();
  }
  const stripped = text.replace(/[\u4e00-\u9fa5]/g, '').trim();
  if (stripped.length > 0 && /[a-zA-Z]/.test(stripped)) {
    return stripped.replace(/^[（\(\s\:\/]+|[）\)\s\:\/]+$/g, '').trim();
  }
  return '';
}

function getEnFallback(text: string): string {
  const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV;
  return isDev ? `[Missing EN: ${text}]` : 'Translation unavailable';
}

// 1. Fixed UI Translations
export const STAFF_UI_TRANSLATIONS: Record<string, Partial<Record<StaffLang | string, string>>> = {
  // Tabs & Nav
  'today': { zh: '今天', en: 'Today', my: 'ယနေ့' },
  'tomorrow': { zh: '明天', en: 'Tomorrow', my: 'မနက်ဖြန်' },
  'dayAfterTomorrow': { zh: '后天', en: 'In 2 Days', my: 'သန်ဘက်ခါ' },
  'schedule': { zh: '排班', en: 'Schedule', my: 'ဇယား' },
  'handbook': { zh: '手册', en: 'Handbook', my: 'လက်စွဲ' },
  'me': { zh: '我的', en: 'Profile', my: 'ကျွန်ုပ်' },
  'navWork': { zh: '工作台', en: 'Work', my: 'အလုပ်' },

  // Workspace headers & info
  'todayWorkspace': { zh: '今日工作台', en: 'Today’s Workspace', my: 'ယနေ့ လုပ်ငန်းခွင်' },
  'branch': { zh: '当前分行', en: 'Current Branch', my: 'လက်ရှိဆိုင်ခွဲ' },
  'notifications': { zh: '员工通知', en: 'Staff Notifications', my: 'ဝန်ထမ်းအသိပေးချက်များ' },
  'noNotifications': { zh: '暂无新的工作通知', en: 'No new work notifications', my: 'အသိပေးချက်အသစ် မရှိသေးပါ' },
  'probation': { zh: '试用员工', en: 'Probation Staff', my: 'အစမ်းခန့် ဝန်ထမ်း' },
  'confirmed': { zh: '正式员工', en: 'Confirmed Staff', my: 'အတည်ပြုပြီး ဝန်ထမ်း' },
  'todayShift': { zh: '今日班次', en: 'Today’s Shift', my: 'ယနေ့အလှည့်ကျ' },
  'position': { zh: '工作岗位', en: 'Position', my: 'ရာထူး' },
  'workHours': { zh: '班次时间', en: 'Shift Hours', my: 'အလုပ်ချိန်' },
  'status': { zh: '出勤状态', en: 'Attendance Status', my: 'တက်ရောက်မှုအခြေအနေ' },
  'onDuty': { zh: '正常出勤', en: 'On Duty', my: 'ပုံမှန်အလုပ်ဆင်း' },
  'restDay': { zh: '休息日', en: 'Rest Day', my: 'အလုပ်ပိတ်ရက်' },
  'publicHolidayShort': { zh: '公假', en: 'Holiday', my: 'အများပြည်သူရုံးပိတ်ရက်' },
  'sickLeaveShort': { zh: '病假', en: 'MC', my: 'ဆေးခွင့်' },
  'personalLeaveShort': { zh: '请假', en: 'Leave', my: 'ခွင့်' },
  'noScheduleShort': { zh: '未排班', en: 'No Shift', my: 'ဇယားမရှိ' },
  'noSchedule': { zh: '暂无排班', en: 'No Shift Scheduled', my: 'ဇယားမရှိသေးပါ' },
  'sickLeave': { zh: '病假', en: 'Medical Leave (MC)', my: 'နာမကျန်းခွင့် (MC)' },
  'personalLeave': { zh: '事假', en: 'Personal Leave', my: 'အရေးပေါ်分假' },
  'absent': { zh: '缺席', en: 'Absent', my: 'ပျက်ကွက်' },
  'work': { zh: '上班', en: 'Working', my: 'အလုပ်ဆင်း' },

  // Tasks & SOP progress
  'taskProgress': { zh: '今日任务进度', en: 'Today’s Task Progress', my: 'ယနေ့တာဝန်ပြီးစီးမှု' },
  'nextTask': { zh: '下一项待办任务', en: 'Next Task', my: 'နောက်ထပ်လုပ်ဆောင်ရမည့်အလုပ်' },
  'allDone': { zh: '恭喜！今天的所有任务已全部完成！🎉', en: 'Congratulations! All tasks completed today! 🎉', my: 'ဂုဏ်ယူပါတယ်! ယနေ့တာဝန်အားလုံး ပြီးမြောက်ပါပြီ။ 🎉' },
  'openingTasks': { zh: '开铺准备', en: 'Opening Preparation', my: 'ဆိုင်ဖွင့်ချိန်ပြင်ဆင်ခြင်း (Opening)' },
  'midTasks': { zh: '营业中任务', en: 'Mid-Day Duties', my: 'ဆိုင်ဖွင့်ချိန်အတွင်း (Mid-day)' },
  'closingTasks': { zh: '打烊收尾', en: 'Closing Duties', my: 'ဆိုင်ပိတ်ချိန်သိမ်းဆည်းခြင်း (Closing)' },
  'execStd': { zh: '执行标准', en: 'Standard', my: 'စံသတ်မှတ်ချက် (Standard)' },
  'purpose': { zh: '目的', en: 'Purpose (Why)', my: 'ရည်ရွယ်ချက် (Why)' },
  'synced': { zh: '云端已同步', en: 'Cloud Synced', my: 'Cloud သိမ်းဆည်းပြီး' },
  'tools': { zh: '工作应用', en: 'Work Apps', my: 'အလုပ်လုပ်ဆောင်ရန် Tools များ' },
  'activeApps': { zh: '可用', en: 'Active', my: 'အသုံးပြုနိုင်' },
  'progress': { zh: '进度', en: 'Progress', my: 'ပြီးစီးမှု' },
  'unauthorized': { zh: '无授权应用', en: 'No Authorized Apps', my: 'ခွင့်ပြုထားသော Tools မရှိပါ' },
  'tempTasks': { zh: '临时任务', en: 'Temporary Tasks', my: 'ယာယီအလုပ်များ' },
  'inventoryTasks': { zh: '库存盘点任务', en: 'Inventory Audit Tasks', my: 'ပစ္စည်းစာရင်းစစ်ခြင်း' },
  'pendingInvAlert': { zh: '你有未完成的分派盘点', en: 'You have pending inventory audit tasks', my: 'သင့်တွင် မပြီးပြတ်သေးသော ပစ္စည်းစာရင်းစစ်ရန် ရှိနေပါသည်' },
  'not_open_tip': { zh: '🔒 暂无可用管理快捷模块，请联系老板开通权限', en: '🔒 No management module available. Contact admin for access', my: '🔒 ရရှိနိုင်သော ဖြတ်လမ်းလင့်ခ် မရှိသေးပါ' },
  'view_tasks': { zh: '查看任务', en: 'View Tasks', my: 'အလုပ်များကိုကြည့်ရန်' },
  'loading_attendance': { zh: '正在加载团队实时考勤...', en: 'Loading team live attendance...', my: 'အဖွဲ့သားများ၏ 考勤 ကို ဆွဲယူနေပါသည်...' },
  'team_on_track': { zh: '团队运营正常', en: 'Team Operations Normal', my: 'အဖွဲ့သား လုပ်ငန်းပုံမှန်ဖြစ်သည်' },
  'team_no_absences': { zh: '今天没有发现任何员工请假、缺席或病假。', en: 'No absences or sick leave recorded today.', my: 'ယနေ့ ဝန်ထမ်းများ ခွင့်ယူခြင်း၊ ပျက်ကွက်ခြင်း သို့မဟုတ် ဖျားနာခြင်း မရှိပါ။' },
  'ai_assistant_title': { zh: 'AI 智能助手', en: 'AI Assistant', my: 'AI စမတ် ထိန်းချုပ်ရေးစနစ်' },
  'ai_assistant_desc': { zh: '点查数据、分析结算账单、考勤异常一键审核', en: 'Search data, analyze settlement reports & audit attendance', my: 'ဒေတာ စစ်ဆေးခြင်း၊ ငွေစာရင်း တွက်ချက်မှုနှင့် တက်ရောက်မှုများကို လုပ်ဆောင်ရန်' },
  'ai_assistant_btn': { zh: '唤醒 AI 智控脑库', en: 'Activate AI Brain', my: 'AI စမတ် ထိန်းချုပ်ရေးစနစ် ဖွင့်ပါ' },

  // Role Guides Headers & Titles
  'duties_title': { zh: '核心职责', en: 'Core Duties', my: 'အဓိကတာဝန်များ (Duties)' },
  'coreValue_title': { zh: '核心价值', en: 'Core Value', my: 'အဓိကတန်ဖိုး (Core Value)' },
  'safetyRedLine_title': { zh: '安全红线', en: 'Safety Red Line', my: 'ဘေးကင်းရေးစည်းကမ်း (Safety Red Line)' },
  'troubleshooting_title': { zh: '岗位实战宝典', en: 'Role Job Manual', my: 'အလုပ်လမ်းညွှန် (Job Manual)' },
  'issue_label': { zh: '遇此情况', en: 'If This Happens', my: 'ဤသို့ကြုံတွေ့ပါက' },
  'solution_label': { zh: '解决方案', en: 'Solution', my: 'ဖြေရှင်းနည်း' },
  'employeeRules_title': { zh: '员工守则', en: 'Employee Rules', my: 'အထွေထွေစည်းကမ်းများ (General Rules)' },
  'no_troubleshooting_tips': { zh: '暂无常见问题记录', en: 'No troubleshooting entries found', my: 'ပြဿနာဖြေရှင်းနည်း မှတ်တမ်းမရှိသေးပါ' },
  'salaryRange_label': { zh: '薪资范围', en: 'Salary Range', my: 'လစာနှုန်းထား' },
  'specialIncentive_label': { zh: '特别激励', en: 'Incentives', my: 'အထူးဆုကြေး' },
  'probationExpectation_label': { zh: '试用期期望', en: 'Probation Expectations', my: 'အစမ်းခန့်ကာလ မျှော်မှန်းချက်' },
  'confirmedExpectation_label': { zh: '转正后期望', en: 'Confirmed Expectations', my: 'အတည်ပြုပြီးနောက် မျှော်မှန်းချက်' },

  // Profile View
  'profile': { zh: '个人资料', en: 'My Profile', my: 'ကိုယ်ရေးအချက်အလက်' },
  'id': { zh: '员工编号', en: 'Employee ID', my: 'ဝန်ထမ်းနံပါတ်' },
  'nationality': { zh: '国籍', en: 'Nationality', my: 'နိုင်ငံသား' },
  'phone': { zh: '联系电话', en: 'Phone Number', my: 'ဖုန်းနံပါတ်' },
  'joinDate': { zh: '入职日期', en: 'Join Date', my: 'အလုပ်ဝင်သည့်နေ့' },
  'warnings': { zh: '警告记录', en: 'Warning Records', my: 'သတိပေးချက်မှတ်တမ်း' },
  'verbal': { zh: '口头警告', en: 'Verbal Warning', my: 'နှုတ်ဖြင့်သတိပေးချက်' },
  'written': { zh: '书面警告 (黄牌)', en: 'Written Warning (Yellow Card)', my: 'စာဖြင့်သတိပေးချက် (ဝါကတ်)' },
  'final': { zh: '最后警告 (红牌)', en: 'Final Warning (Red Card)', my: 'နောက်ဆုံးသတိပေးချက် (ရဲကတ်)' },
  'fine': { zh: '罚款', en: 'Fine', my: 'ဒဏ်ကြေး' },
  'rating': { zh: '我的季度评分', en: 'Quarterly Rating', my: 'ကျွန်ုပ်၏ သုံးလပတ် အကဲဖြတ်ချက်' },
  'noRating': { zh: '本季度暂无评分记录', en: 'No ratings for this quarter', my: 'ယခုသုံးလပတ်အတွက် အကဲဖြတ်ချက် မရှိသေးပါ' },
  'logout': { zh: '安全退出', en: 'Logout', my: 'လုံခြုံစွာထွက်ရန်' },
  'close': { zh: '关闭', en: 'Close', my: 'ပိတ်မည်' },
  'clockInBtn': { zh: '打卡上班', en: 'Clock In', my: 'အလုပ်ဝင်打卡ရန်' },
  'clockOutBtn': { zh: '打卡下班', en: 'Clock Out', my: 'အလုပ်ဆင်း打卡ရန်' },
  'checkedIn': { zh: '已打卡上班', en: 'Clocked In', my: 'အလုပ်ဝင်打卡ပြီးပါပြီ' },
  'checkedOut': { zh: '已打卡下班', en: 'Clocked Out', my: 'အလုပ်ဆင်း打卡ပြီးပါပြီ' },
  'monthlyRoster': { zh: '月度排班表', en: 'Monthly Roster', my: 'လစဉ်အလှည့်ကျဇယား' },
  '返回工作台': { zh: '返回工作台', en: 'Back to Workspace', my: 'ပြန်သွားရန်' },
  'pendingInvDesc': { zh: '您今天有已被分配的库存盘点任务，请点击“工作应用”进入处理。', en: 'You have assigned inventory audit tasks today. Please click "Work Apps" to complete.', my: 'ယနေ့ ဆောင်ရွက်ရန် ပစ္စည်းစာရင်းစစ်ဆေးခြင်း တာဝန် သတ်မှတ်ထားရှိပါသည်၊ အလုပ်အသုံးချ ဆော့ဖ်ဝဲလ်ကို နှိပ်၍ ဆောင်ရွက်ပါ။' },
  'safetyReminder': { zh: '安全与纪律提醒', en: 'Safety & Discipline Reminder', my: 'စည်းကမ်းနှင့် ဘေးကင်းရေး သေချာစေရန် သတိပေးချက်' },
  'safetyReminderDesc': { zh: '请每位员工严格遵守本岗位的安全红线，杜绝任何违规违纪操作。', en: 'Please strictly abide by the safety red line of your role and eliminate any non-compliance.', my: 'ဝန်ထမ်းတိုင်း မိမိအလုပ်နေရာ၏ စည်းကမ်းချက်များကို တိကျစွာလိုက်နာပြီး ဘေးကင်းလုံခြုံရေးစည်းကမ်းကို လိုက်နာပါ။' },
  'attendanceCompleted': { zh: '今日出勤已完成 (Attendance Completed)', en: 'Attendance Completed Today', my: 'ယနေ့ အလုပ်ဆင်းချိန် ပြီးစီးပါပြီ (Attendance Completed)' },
  'clockedInWaiting': { zh: '已打卡上班，等待打卡下班 (Clocked in, waiting for clock out)', en: 'Clocked In - Waiting for Clock Out', my: 'အလုပ်ဝင်打卡ပြီးပါပြီ、အလုပ်ဆင်း打卡ရန် စောင့်ဆိုင်းနေပါသည်' },
  'restDayNoPunch': { zh: '💤 今天休息，无需打卡 (Rest day, no punch required)', en: '💤 Rest Day - No Clock-In Needed', my: '💤 ယနေ့ အလုပ်ပိတ်ရက်ဖြစ်၍ 打卡ရန် မလိုပါ' },
  'noRosterTip': { zh: '❔ 暂无排班，如有疑问请咨询经理', en: '❔ No shift scheduled. Please check with your manager if needed', my: '❔ ဇယားမရှိသေးပါ၊ သိလိုသည်များရှိပါက မန်နေဂျာအား မေးမြန်းပါ' },
  'waitingManagerConfirmation': { zh: '等待经理确认或考勤设备打卡', en: 'Waiting for manager confirmation or clock-in device', my: 'မန်နေဂျာ အတည်ပြုချက် သို့မဟုတ် တက်ရောက်မှုစက်တွင် 打卡ရန် စောင့်ဆိုင်းနေပါသည်' },
  'waitingDeviceSub': { zh: '(Waiting for manager confirmation or attendance device)', en: '(Waiting for manager confirmation or attendance device)', my: '(မန်နေဂျာ အတည်ပြုချက် သို့မဟုတ် တက်ရောက်မှုစက်ကို စောင့်ဆိုင်းနေပါသည်)' },
  'ai_support_desc': { zh: '支持免提麦克风语音录入！一键检索店内库存、异常日志、排班与业务规范。', en: 'Hands-free voice input supported! Instantly search inventory, logs, rosters & SOPs.', my: 'အသံဖြင့် ပြောဆိုမေးမြန်းမှုကို ပံ့ပိုးပေးသည်! ဆိုင်တွင်းရှိ ပစ္စည်းစာရင်း၊ ထူးခြားဖြစ်စဉ်များ၊ ဇယားများနှင့် စည်းမျဉ်းများကို ရှာဖွေနိုင်သည်။' },
  'ai_launch_btn': { zh: '立即唤醒语音提问', en: 'Activate Voice Query Now', my: 'ယခုပင် မေးမြန်းမှုစနစ်ကို ဖွင့်ပါ' },

  // Days of week
  'mon': { zh: '一', en: 'Mon', my: 'တနင်္လာ' },
  'tue': { zh: '二', en: 'Tue', my: 'အင်္ဂါ' },
  'wed': { zh: '三', en: 'Wed', my: 'ဗုဒ္ဓဟူး' },
  'thu': { zh: '四', en: 'Thu', my: 'ကြာသပတေး' },
  'fri': { zh: '五', en: 'Fri', my: 'သောကြာ' },
  'sat': { zh: '六', en: 'Sat', my: 'စနေ' },
  'sun': { zh: '日', en: 'Sun', my: 'တနင်္ဂနွေ' },

  // Positions Names
  'Executive Chef (行政总厨)': { zh: 'Executive Chef (行政总厨)', en: 'Executive Chef', my: 'အမှုဆောင်စားဖိုမှူးချုပ်' },
  'Store Manager (门店经理)': { zh: 'Store Manager (门店经理)', en: 'Store Manager', my: 'ဆိုင်ခွဲမန်နေဂျာ' },
  'Operations Supervisor (运营主管)': { zh: 'Operations Supervisor (运营主管)', en: 'Operations Supervisor', my: 'လုပ်ငန်းလည်ပတ်ရေးကြီးကြပ်သူ' },
  '人事管理 (HR Management)': { zh: '人事管理 (HR Management)', en: 'HR Management', my: 'လူ့စွမ်းအားအရင်းအမြစ်စီမံခန့်ခွဲသူ' },
  '店面管理 (Store Management)': { zh: '店面管理 (Store Management)', en: 'Store Management', my: 'ဆိုင်ခွဲစီမံခန့်客ွဲသူ' },
  'Counter (柜台)': { zh: 'Counter (柜台)', en: 'Counter / Cashier', my: 'ငွေကိုင်' },
  'Captain (写单员)': { zh: 'Captain (写单员)', en: 'Captain Order-Taker', my: 'အမှာစာယူသူ' },
  'Waiter (服务员)': { zh: 'Waiter (服务员)', en: 'Waiter / Service Staff', my: 'စားပွဲထိုး' },
  'Cleaner (清洁员)': { zh: 'Cleaner (清洁员)', en: 'Cleaner / Janitor', my: 'သန့်ရှင်းရေးဝန်ထမ်း' },
  'Part-Time (兼职)': { zh: 'Part-Time (兼职)', en: 'Part-Time Staff', my: 'အချိန်ပိုင်းဝန်ထမ်း' },
  'Head Chef (头手)': { zh: 'Head Chef (头手)', en: 'Head Chef', my: 'အဓိကစားဖိုမှူး' },
  'Assistant Chef (帮锅)': { zh: 'Assistant Chef (帮锅)', en: 'Assistant Chef', my: 'လက်ထောက်စားဖိုမှူး' },
  'Kitchen Cook (厨师)': { zh: 'Kitchen Cook (厨师)', en: 'Kitchen Cook', my: 'စားဖိုမှူး' },
  'Kitchen Cutter (占板)': { zh: 'Kitchen Cutter (占板)', en: 'Kitchen Cutter / Prep', my: 'အသား/ဟင်းသီးဟင်းရွက်လှီးဖြတ်သူ' },
  'Fryer (打荷)': { zh: 'Fryer (打荷)', en: 'Fryer / Pass', my: 'ဆီကြော်သမား' },
  'Commis/Runner (马王)': { zh: 'Commis/Runner (马王)', en: 'Commis / Food Runner', my: 'အစားအစာပို့ဆောင်သူ' },
  'Kitchen Helper (厨房帮手)': { zh: 'Kitchen Helper (厨房帮手)', en: 'Kitchen Helper', my: 'မီးဖိုချောင်ကူညီသူ' },
  'Dishwasher (洗碗)': { zh: 'Dishwasher (洗碗)', en: 'Dishwasher', my: 'ပန်းကန်ဆေးသမား' },
  'Water Bar (水吧)': { zh: 'Water Bar (水吧)', en: 'Bar / Drinks Bar', my: 'ဖျော်ရည်စပ်သူ' },
  'Kitchen Apprentice (厨房学徒)': { zh: 'Kitchen Apprentice (厨房学徒)', en: 'Kitchen Apprentice', my: 'မီးဖိုချောင်သင်တန်းသား' },
  'Owner (老板)': { zh: 'Owner (老板)', en: 'Store Owner', my: 'ဆိုင်ရှင်' },
  'MANAGER': { zh: '门店经理', en: 'Store Manager', my: 'မန်နေဂျာ' },
  'SUPERVISOR': { zh: '运营主管', en: 'Operations Supervisor', my: 'ကြီးကြပ်သူ' },
  'COUNTER': { zh: '柜台收银', en: 'Counter / Cashier', my: 'ငွေကိုင်' },
  'CAPTAIN': { zh: '写单员', en: 'Captain Order-Taker', my: 'အမှာစာယူသူ' },
  'WAITER': { zh: '楼面服务', en: 'Waiter / Service Staff', my: 'စားပွဲထိုး' },
  'CLEANER': { zh: '清洁卫生', en: 'Cleaner', my: 'သန့်ရှင်းရေး' },
  'HEAD_CHEF': { zh: '头手主厨', en: 'Head Chef', my: 'အဓိကစားဖိုမှူး' },
  'ASST_CHEF': { zh: '二锅帮锅', en: 'Assistant Chef', my: 'လက်ထောက်စားဖိုမှူး' },
  'CUTTER': { zh: '砧板切配', en: 'Kitchen Cutter', my: 'လှီးဖြတ်သူ' },
  'COMMIS': { zh: '马王出菜', en: 'Commis / Runner', my: 'အစားအစာပို့သူ' },
  'BAR': { zh: '水吧饮料', en: 'Water Bar', my: 'ဖျော်ရည်စပ်သူ' },
  'techGuides': { zh: '系统功能指引', en: 'Tech Guides', my: 'စနစ်အသုံးပြုမှုလမ်းညွှန် (Tech Guide)' }
};

// 2. Content Translations (SOPs, Guides, Rules, Duties)
export const STAFF_CONTENT_TRANSLATIONS: Record<string, Partial<Record<StaffLang | string, string>>> = {
  "准备汤底 (Soup Base)": { zh: "准备汤底 (Soup Base)", en: "Prepare Soup Base", my: "ဟင်းရည်အနှစ် ပြင်ဆင်ခြင်း" },
  "预炸鸡翅/五香": { zh: "预炸鸡翅/五香", en: "Pre-fry Wings / Ngo Hiang", my: "ကြက်တောင်ပံနှင့် ငါးမွှေးကြော်များ ကြိုကြော်ထားရန်" },
  "检查面条库存": { zh: "检查面条库存", en: "Check Noodle Stock", my: "ခေါက်ဆွဲလက်ကျန် စစ်ဆေးရန်" },
  "从冷房取出": { zh: "从冷房取出", en: "Take from Chiller", my: "အေးခဲခန်းမှ ထုတ်ယူပါ" },
  "过滤炸油 (Filter Oil)": { zh: "过滤炸油 (Filter Oil)", en: "Filter Fryer Oil", my: "ကြော်ဆီများကို စစ်ထုတ်ရန်" },
  "去除残渣": { zh: "去除残渣", en: "Remove Residue", my: "အနှစ်အကြွင်းများ ဖယ်ရှားပါ" },
  "清洗炸炉": { zh: "清洗炸炉", en: "Clean Fryer", my: "ဆီကြော်အိုးများ ဆေးကြောရန်" },
  "收拾备料盘": { zh: "收拾备料盘", en: "Clear Prep Trays", my: "ပြင်ဆင်ပြီး ဟင်းသီးဟင်းရွက်ဗန်းများ သိမ်းဆည်းရန်" },
  "放入冰箱": { zh: "放入冰箱", en: "Put into Fridge", my: "ရေခဲသေတ္တာထဲ ထည့်ပါ" },
  "保鲜": { zh: "保鲜", en: "Keep Fresh", my: "လတ်ဆတ်မှုထိန်းသိမ်းရေး" },
  "磨刀 (Sharpen Knives)": { zh: "磨刀 (Sharpen Knives)", en: "Sharpen Knives", my: "ဓားများ သွေးရန်" },
  "切配今日蔬菜": { zh: "切配今日蔬菜", en: "Cut Today's Veggies", my: "ယနေ့ သုံးရန် ဟင်းသီးဟင်းရွက်များ လှီးဖြတ်ရန်" },
  "腌制肉类 (Marinate)": { zh: "腌制肉类 (Marinate)", en: "Marinate Meat", my: "အသားများ အနှစ်နယ်၍ နှပ်ထားရန်" },
  "补满酱料瓶": { zh: "补满酱料瓶", en: "Refill Sauce Bottles", my: "ဆော့စ်ပုလင်းများ ဖြည့်ဆည်းရန်" },
  "准备打包盒 (Takeaway)": { zh: "准备打包盒 (Takeaway)", en: "Prepare Takeaway Boxes", my: "အပြင်ထုတ် ပါကင်ဗူးများ ခေါက်ထားရန်" },
  "擦拭出菜台 (Pass)": { zh: "擦拭出菜台 (Pass)", en: "Wipe the Pass", my: "ဟင်းထုတ်စင်ကို သုတ်သင်ရှင်းလင်းရန်" },
  "拖厨房地面": { zh: "拖厨房地面", en: "Mop Kitchen Floor", my: "မီးဖိုချောင် ကြမ်းပြင်ကို တိုင်ကူတိုက်ရန်" },
  "煲凉茶 (Boil Herbal)": { zh: "煲凉茶 (Boil Herbal)", en: "Boil Herbal Tea", my: "ဆေးဘက်ဝင် ရေနွေးဂျင်းကြိုရန်" },
  "切酸柑/柠檬": { zh: "切酸柑/柠檬", en: "Cut Lime / Lemon", my: "သံပုရာသီးနှင့် သံပုရိုသီးများ လှီးထားရန်" },
  "检查冰块 (Ice)": { zh: "检查冰块 (Ice)", en: "Check Ice", my: "ရေခဲပုံး လက်ကျန် စစ်ဆေးရန်" },

  "解锁店门与解除警报": { zh: "解锁店门与解除警报", en: "Unlock Door & Disarm Alarm", my: "တံခါးဖွင့်ပြီး နှိုးစက်ပိတ်ပါ" },
  "准时 16:00": { zh: "准时 16:00", en: "By 16:00 PM", my: "၁၆:၀၀ အချိန်မှန်" },
  "营运": { zh: "营运", en: "Operations", my: "[MY] Operations" },
  "检查昨晚结算差异": { zh: "检查昨晚结算差异", en: "Check Last Night's Settlement", my: "ညက စာရင်းကို စစ်ဆေးပါ" },
  "查阅 Logbook": { zh: "查阅 Logbook", en: "Check Logbook", my: "Logbook ကို စစ်ဆေးပါ" },
  "财务安全": { zh: "财务安全", en: "Financial Security", my: "[MY] Financial Security" },
  "检查员工仪容仪表": { zh: "检查员工仪容仪表", en: "Staff Grooming Check", my: "ဝန်ထမ်းများ၏ သပ်ရပ်မှုကို စစ်ဆေးပါ" },
  "制服整洁": { zh: "制服整洁", en: "Neat Uniforms", my: "[MY] Neat Uniforms" },
  "品牌形象": { zh: "品牌形象", en: "Brand Image", my: "[MY] Brand Image" },
  "确认今日订位 (Reservations)": { zh: "确认今日订位 (Reservations)", en: "Confirm Reservations", my: "ဒီနေ့ Booking များကို အတည်ပြုပါ" },
  "预留桌位": { zh: "预留桌位", en: "Reserve Tables", my: "[MY] Reserve Tables" },
  "客户服务": { zh: "客户服务", en: "Customer Service", my: "[MY] Customer Service" },
  "审核今日 Logbook": { zh: "审核今日 Logbook", en: "Review Today's Logbook", my: "ဒီနေ့ Logbook ကို စစ်ဆေးပါ" },
  "无遗漏事项": { zh: "无遗漏事项", en: "No Missing Items", my: "[MY] No Missing Items" },
  "复盘": { zh: "复盘", en: "Review", my: "[MY] Review" },
  "监督现金入保险柜": { zh: "监督现金入保险柜", en: "Monitor Cash into Safe", my: "ငွေကို မီးခံသေတ္တာထဲသို့ ထည့်ရန် ကြီးကြပ်ပါ" },
  "双人核对": { zh: "双人核对", en: "Double Check", my: "[MY] Double Check" },
  "防盗": { zh: "防盗", en: "Security", my: "[MY] Security" },
  "检查全店门窗锁闭": { zh: "检查全店门窗锁闭", en: "Check All Doors & Windows", my: "တံခါးများ အားလုံး ပိတ်/မပိတ် စစ်ဆေးပါ" },
  "确认上锁": { zh: "确认上锁", en: "Confirm Locked", my: "[MY] Confirm Locked" },
  "安全": { zh: "安全", en: "Safety", my: "[MY] Safety" },
  "开启防盗系统": { zh: "开启防盗系统", en: "Activate Alarm System", my: "နှိုးစက် စနစ် ဖွင့်ပါ" },
  "Alarm Active": { zh: "Alarm Active", en: "Alarm Active", my: "[MY] Alarm Active" },
  "安保": { zh: "安保", en: "Security", my: "[MY] Security" },
  "开启灯光与冷气": { zh: "开启灯光与冷气", en: "Turn on Lights & A/C", my: "မီးနှင့် အဲကွန်း ဖွင့်ပါ" },
  "全店通亮": { zh: "全店通亮", en: "Bright Lighting", my: "[MY] Bright Lighting" },
  "环境": { zh: "环境", en: "Environment", my: "[MY] Environment" },
  "分配员工区域 (Sectioning)": { zh: "分配员工区域 (Sectioning)", en: "Staff Sectioning", my: "[MY] Staff Sectioning" },
  "合理调度": { zh: "合理调度", en: "Proper Scheduling", my: "[MY] Proper Scheduling" },
  "效率": { zh: "效率", en: "Efficiency", my: "[MY] Efficiency" },
  "检查楼面清洁度": { zh: "检查楼面清洁度", en: "Check Floor Cleanliness", my: "ကြမ်းပြင် သန့်ရှင်းမှု စစ်ဆေးပါ" },
  "无异味无垃圾": { zh: "无异味无垃圾", en: "No Odor / No Trash", my: "[MY] No Odor / No Trash" },
  "卫生": { zh: "卫生", en: "Hygiene", my: "[MY] Hygiene" },
  "播放店内音乐": { zh: "播放店内音乐", en: "Play Background Music", my: "[MY] Play Background Music" },
  "音量适中": { zh: "音量适中", en: "Moderate Volume", my: "[MY] Moderate Volume" },
  "氛围": { zh: "氛围", en: "Atmosphere", my: "[MY] Atmosphere" },
  "安排员工打扫卫生": { zh: "安排员工打扫卫生", en: "Arrange Staff for Cleaning", my: "[MY] Arrange Staff for Cleaning" },
  "分区清洁": { zh: "分区清洁", en: "Zone Cleaning", my: "[MY] Zone Cleaning" },
  "整洁": { zh: "整洁", en: "Cleanliness", my: "[MY] Cleanliness" },
  "关闭非必要电源": { zh: "关闭非必要电源", en: "Turn Off Unnecessary Power", my: "[MY] Turn Off Unnecessary Power" },
  "招牌/冷气": { zh: "招牌/冷气", en: "Signboard / A/C", my: "[MY] Signboard / A/C" },
  "节能": { zh: "节能", en: "Energy Saving", my: "[MY] Energy Saving" },
  "检查厕所卫生": { zh: "检查厕所卫生", en: "Check Toilet Cleanliness", my: "[MY] Check Toilet Cleanliness" },
  "无积水": { zh: "无积水", en: "No Stagnant Water", my: "[MY] No Stagnant Water" },
  "StoreHub 开机登录": { zh: "StoreHub 开机登录", en: "StoreHub Login", my: "[MY] StoreHub Login" },
  "系统在线": { zh: "系统在线", en: "System Online", my: "[MY] System Online" },
  "收银": { zh: "收银", en: "Cashier", my: "ငွေရှင်း" },
  "检查钱箱备用金 (Float)": { zh: "检查钱箱备用金 (Float)", en: "Check Cash Register Float", my: "[MY] Check Cash Register Float" },
  "RM 500": { zh: "RM 500", en: "RM 500", my: "[MY] RM 500" },
  "找赎": { zh: "找赎", en: "Change", my: "[MY] Change" },
  "检查打印纸/收据纸": { zh: "检查打印纸/收据纸", en: "Check Receipt Paper", my: "[MY] Check Receipt Paper" },
  "备足两卷": { zh: "备足两卷", en: "2 Rolls Standby", my: "[MY] 2 Rolls Standby" },
  "耗材": { zh: "耗材", en: "Supplies", my: "[MY] Supplies" },
  "开启外卖接单平板": { zh: "开启外卖接单平板", en: "Turn on Delivery Tablet", my: "[MY] Turn on Delivery Tablet" },
  "Grab/Panda": { zh: "Grab/Panda", en: "Grab/Panda", my: "[MY] Grab/Panda" },
  "外卖": { zh: "外卖", en: "Delivery", my: "ပါဆယ်" },
  "打印每日结算单 (Settlement)": { zh: "打印每日结算单 (Settlement)", en: "Print Daily Settlement", my: "[MY] Print Daily Settlement" },
  "数据准确": { zh: "数据准确", en: "Accurate Data", my: "[MY] Accurate Data" },
  "财务": { zh: "财务", en: "Finance", my: "[MY] Finance" },
  "点算现金 (Cash Count)": { zh: "点算现金 (Cash Count)", en: "Cash Count", my: "[MY] Cash Count" },
  "填入系统": { zh: "填入系统", en: "Enter into System", my: "[MY] Enter into System" },
  "核对": { zh: "核对", en: "Verification", my: "[MY] Verification" },
  "整理柜台杂物": { zh: "整理柜台杂物", en: "Organize Counter", my: "[MY] Organize Counter" },
  "桌面整洁": { zh: "桌面整洁", en: "Tidy Counter", my: "[MY] Tidy Counter" },
  "形象": { zh: "形象", en: "Image", my: "[MY] Image" },
  "关闭 iPad 与打印机": { zh: "关闭 iPad 与打印机", en: "Turn off iPad & Printer", my: "[MY] Turn off iPad & Printer" },
  "断电": { zh: "断电", en: "Power Off", my: "[MY] Power Off" },
  "设备": { zh: "设备", en: "Equipment", my: "[MY] Equipment" },
  "检查 iPad 点餐机电量": { zh: "检查 iPad 点餐机电量", en: "Check iPad Battery", my: "[MY] Check iPad Battery" },
  "100% Charged": { zh: "100% Charged", en: "100% Charged", my: "[MY] 100% Charged" },
  "工具": { zh: "工具", en: "Tools", my: "[MY] Tools" },
  "熟悉今日缺货 (86 List)": { zh: "熟悉今日缺货 (86 List)", en: "Check 86 List (Out of Stock)", my: "[MY] Check 86 List (Out of Stock)" },
  "通知全员": { zh: "通知全员", en: "Inform All Staff", my: "[MY] Inform All Staff" },
  "服务": { zh: "服务", en: "Service", my: "[MY] Service" },
  "检查招牌灯箱": { zh: "检查招牌灯箱", en: "Check Signboard Lights", my: "[MY] Check Signboard Lights" },
  "正常亮起": { zh: "正常亮起", en: "Functioning Properly", my: "[MY] Functioning Properly" },
  "引流": { zh: "引流", en: "Attract Customers", my: "[MY] Attract Customers" },
  "整理菜单 (Menu Books)": { zh: "整理菜单 (Menu Books)", en: "Organize Menu Books", my: "[MY] Organize Menu Books" },
  "无破损/归位": { zh: "无破损/归位", en: "No Damage / Placed Back", my: "[MY] No Damage / Placed Back" },
  "保养": { zh: "保养", en: "Maintenance", my: "[MY] Maintenance" },
  "检查未结单据 (Open Bills)": { zh: "检查未结单据 (Open Bills)", en: "Check Open Bills", my: "[MY] Check Open Bills" },
  "全部清空": { zh: "全部清空", en: "Clear All", my: "[MY] Clear All" },
  "防漏单": { zh: "防漏单", en: "Prevent Missed Bills", my: "[MY] Prevent Missed Bills" },
  "关闭区域灯光": { zh: "关闭区域灯光", en: "Turn Off Zone Lights", my: "[MY] Turn Off Zone Lights" },
  "分区执行": { zh: "分区执行", en: "Execute by Zone", my: "[MY] Execute by Zone" },
  "擦拭桌椅 (Wipe Tables)": { zh: "擦拭桌椅 (Wipe Tables)", en: "Wipe Tables", my: "စားပွဲခုံများကို သုတ်ပါ" },
  "无油渍": { zh: "无油渍", en: "No Oil Stains", my: "[MY] No Oil Stains" },
  "补充调味品 (Chili/Soy)": { zh: "补充调味品 (Chili/Soy)", en: "Refill Condiments", my: "[MY] Refill Condiments" },
  "满瓶/清洁": { zh: "满瓶/清洁", en: "Full & Clean", my: "[MY] Full & Clean" },
  "备料": { zh: "备料", en: "Preparation", my: "ပစ္စည်းပြင်ဆင်မှု" },
  "检查餐具筒": { zh: "检查餐具筒", en: "Check Cutlery Holder", my: "[MY] Check Cutlery Holder" },
  "补满筷子汤匙": { zh: "补满筷子汤匙", en: "Refill Chopsticks & Spoons", my: "[MY] Refill Chopsticks & Spoons" },
  "准备茶水壶": { zh: "准备茶水壶", en: "Prepare Teapots", my: "[MY] Prepare Teapots" },
  "热水充足": { zh: "热水充足", en: "Sufficient Hot Water", my: "[MY] Sufficient Hot Water" },
  "茶水": { zh: "茶水", en: "Tea Service", my: "[MY] Tea Service" },
  "扫地与拖地": { zh: "扫地与拖地", en: "Sweep & Mop", my: "ကြမ်းလှဲ ကြမ်းတိုက်ပါ" },
  "无食物残渣": { zh: "无食物残渣", en: "No Food Residue", my: "[MY] No Food Residue" },
  "清洁": { zh: "清洁", en: "Cleaning", my: "[MY] Cleaning" },
  "补充纸巾/牙签": { zh: "补充纸巾/牙签", en: "Refill Tissue / Toothpicks", my: "[MY] Refill Tissue / Toothpicks" },
  "补满": { zh: "补满", en: "Refilled", my: "[MY] Refilled" },
  "明日准备": { zh: "明日准备", en: "Prepare for Tomorrow", my: "[MY] Prepare for Tomorrow" },
  "归位桌椅": { zh: "归位桌椅", en: "Rearrange Tables/Chairs", my: "[MY] Rearrange Tables/Chairs" },
  "整齐划一": { zh: "整齐划一", en: "Organized", my: "[MY] Organized" },
  "美观": { zh: "美观", en: "Appearance", my: "[MY] Appearance" },
  "清理工作台垃圾": { zh: "清理工作台垃圾", en: "Clear Workstation Trash", my: "[MY] Clear Workstation Trash" },
  "清空": { zh: "清空", en: "Empty", my: "[MY] Empty" },
  "防虫": { zh: "防虫", en: "Pest Control", my: "[MY] Pest Control" },
  "彻底清洗厕所": { zh: "彻底清洗厕所", en: "Thoroughly Clean Toilets", my: "[MY] Thoroughly Clean Toilets" },
  "无异味/干爽": { zh: "无异味/干爽", en: "No Odor / Dry", my: "[MY] No Odor / Dry" },
  "补充洗手液/擦手纸": { zh: "补充洗手液/擦手纸", en: "Refill Hand Soap / Paper Towels", my: "[MY] Refill Hand Soap / Paper Towels" },
  "充足": { zh: "充足", en: "Sufficient", my: "[MY] Sufficient" },
  "拖大厅地面": { zh: "拖大厅地面", en: "Mop Hall Floor", my: "[MY] Mop Hall Floor" },
  "干净": { zh: "干净", en: "Clean", my: "[MY] Clean" },
  "印象": { zh: "印象", en: "Impression", my: "[MY] Impression" },
  "清理所有垃圾桶": { zh: "清理所有垃圾桶", en: "Clear All Trash Bins", my: "အမှိုက်ပုံးများကို ရှင်းလင်းပါ" },
  "换新袋": { zh: "换新袋", en: "Replace Trash Bags", my: "[MY] Replace Trash Bags" },
  "清洗拖把并晾干": { zh: "清洗拖把并晾干", en: "Wash & Hang Mops", my: "[MY] Wash & Hang Mops" },
  "悬挂": { zh: "悬挂", en: "Hanging", my: "[MY] Hanging" },
  "防臭": { zh: "防臭", en: "Odor Prevention", my: "[MY] Odor Prevention" },
  "再次清洗厕所": { zh: "再次清洗厕所", en: "Clean Toilet Again", my: "[MY] Clean Toilet Again" },
  "消毒": { zh: "消毒", en: "Disinfect", my: "[MY] Disinfect" },
  "试炭火 (Test Wok Heat)": { zh: "试炭火 (Test Wok Heat)", en: "Test Wok Heat", my: "[MY] Test Wok Heat" },
  "火力猛": { zh: "火力猛", en: "Strong Heat", my: "[MY] Strong Heat" },
  "锅气": { zh: "锅气", en: "Wok Hei", my: "[MY] Wok Hei" },
  "检查酱料味道 (Taste Test)": { zh: "检查酱料味道 (Taste Test)", en: "Taste Test Sauces", my: "[MY] Taste Test Sauces" },
  "咸淡适中": { zh: "咸淡适中", en: "Balanced Flavor", my: "[MY] Balanced Flavor" },
  "品控": { zh: "品控", en: "Quality Control", my: "[MY] Quality Control" },
  "确认今日特别推荐": { zh: "确认今日特别推荐", en: "Confirm Today's Special", my: "[MY] Confirm Today's Special" },
  "通知楼面": { zh: "通知楼面", en: "Inform Floor Staff", my: "[MY] Inform Floor Staff" },
  "销售": { zh: "销售", en: "Sales", my: "[MY] Sales" },
  "检查猪油渣库存": { zh: "检查猪油渣库存", en: "Check Lard Stock", my: "[MY] Check Lard Stock" },
  "足够": { zh: "足够", en: "Sufficient", my: "[MY] Sufficient" },
  "灵魂": { zh: "灵魂", en: "Soul of the Dish", my: "[MY] Soul of the Dish" },
  "熄灭炭火 (Extinguish)": { zh: "熄灭炭火 (Extinguish)", en: "Extinguish Charcoal", my: "[MY] Extinguish Charcoal" },
  "无明火": { zh: "无明火", en: "No Open Flames", my: "[MY] No Open Flames" },
  "关闭煤气总阀": { zh: "关闭煤气总阀", en: "Turn Off Gas Valve", my: "[MY] Turn Off Gas Valve" },
  "Locked": { zh: "Locked", en: "Locked", my: "[MY] Locked" },
  "防爆": { zh: "防爆", en: "Explosion Prevention", my: "[MY] Explosion Prevention" },
  "检查炉台卫生": { zh: "检查炉台卫生", en: "Check Stove Cleanliness", my: "[MY] Check Stove Cleanliness" },
  "无油垢": { zh: "无油垢", en: "No Grease", my: "[MY] No Grease" },
  "盖好酱料桶": { zh: "盖好酱料桶", en: "Cover Sauce Bins", my: "[MY] Cover Sauce Bins" },
  "密封": { zh: "密封", en: "Sealed", my: "[MY] Sealed" },
  "滚热": { zh: "滚热", en: "Piping Hot", my: "[MY] Piping Hot" },
  "汤面": { zh: "汤面", en: "Noodle Soup", my: "[MY] Noodle Soup" },
  "备货充足": { zh: "备货充足", en: "Sufficient Stock", my: "[MY] Sufficient Stock" },
  "速度": { zh: "速度", en: "Speed", my: "[MY] Speed" },
  "节约": { zh: "节约", en: "Cost Saving", my: "[MY] Cost Saving" },
  "锋利": { zh: "锋利", en: "Sharp", my: "[MY] Sharp" },
  "菜心/包菜": { zh: "菜心/包菜", en: "Cabbage / Choy Sum", my: "[MY] Cabbage / Choy Sum" },
  "猪肉/鸡肉": { zh: "猪肉/鸡肉", en: "Pork / Chicken", my: "[MY] Pork / Chicken" },
  "入味": { zh: "入味", en: "Marinated", my: "[MY] Marinated" },
  "检查冰箱温度": { zh: "检查冰箱温度", en: "Check Fridge Temp", my: "[MY] Check Fridge Temp" },
  "< 4°C": { zh: "< 4°C", en: "< 4°C", my: "[MY] < 4°C" },
  "食安": { zh: "食安", en: "Food Safety", my: "[MY] Food Safety" },
  "盖好所有生鲜食材": { zh: "盖好所有生鲜食材", en: "Cover All Fresh Ingredients", my: "[MY] Cover All Fresh Ingredients" },
  "保鲜膜": { zh: "保鲜膜", en: "Cling Wrap", my: "[MY] Cling Wrap" },
  "防干": { zh: "防干", en: "Prevent Drying", my: "[MY] Prevent Drying" },
  "清洗砧板 (Sanitize)": { zh: "清洗砧板 (Sanitize)", en: "Sanitize Cutting Board", my: "စဉ်းတီတုံးများကို ဆေးကြောပါ" },
  "消毒水": { zh: "消毒水", en: "Sanitizer", my: "[MY] Sanitizer" },
  "防霉": { zh: "防霉", en: "Prevent Mold", my: "[MY] Prevent Mold" },
  "清理水槽滤网": { zh: "清理水槽滤网", en: "Clean Sink Strainer", my: "[MY] Clean Sink Strainer" },
  "无残渣": { zh: "无残渣", en: "No Residue", my: "[MY] No Residue" },
  "防堵": { zh: "防堵", en: "Prevent Clogging", my: "[MY] Prevent Clogging" },
  "倒垃圾": { zh: "倒垃圾", en: "Throw Trash", my: "အမှိုက်ပစ်ပါ" },
  "酱油/胡椒": { zh: "酱油/胡椒", en: "Soy Sauce / Pepper", my: "[MY] Soy Sauce / Pepper" },
  "补给": { zh: "补给", en: "Supply", my: "[MY] Supply" },
  "折叠好": { zh: "折叠好", en: "Folded neatly", my: "[MY] Folded neatly" },
  "检查出菜盘": { zh: "检查出菜盘", en: "Check Serving Plates", my: "[MY] Check Serving Plates" },
  "数量足够": { zh: "数量足够", en: "Sufficient Quantity", my: "[MY] Sufficient Quantity" },
  "流转": { zh: "流转", en: "Flow", my: "[MY] Flow" },
  "补充猪油渣": { zh: "补充猪油渣", en: "Refill Lard", my: "[MY] Refill Lard" },
  "从大桶取": { zh: "从大桶取", en: "Take from Main Bucket", my: "[MY] Take from Main Bucket" },
  "去油除滑": { zh: "去油除滑", en: "Remove Greasiness", my: "[MY] Remove Greasiness" },
  "清洗抹布": { zh: "清洗抹布", en: "Wash Towels", my: "[MY] Wash Towels" },
  "漂白水": { zh: "漂白水", en: "Bleach", my: "[MY] Bleach" },
  "倒厨房垃圾": { zh: "倒厨房垃圾", en: "Dispose Kitchen Trash", my: "[MY] Dispose Kitchen Trash" },
  "不留过夜": { zh: "不留过夜", en: "No Overnight Trash", my: "[MY] No Overnight Trash" },
  "防鼠": { zh: "防鼠", en: "Rodent Control", my: "[MY] Rodent Control" },
  "按配方": { zh: "按配方", en: "Follow Recipe", my: "[MY] Follow Recipe" },
  "招牌": { zh: "招牌", en: "Signature", my: "[MY] Signature" },
  "备满一盒": { zh: "备满一盒", en: "Refill One Full Box", my: "[MY] Refill One Full Box" },
  "满桶": { zh: "满桶", en: "Full Bucket", my: "[MY] Full Bucket" },
  "冷饮": { zh: "冷饮", en: "Cold Drinks", my: "[MY] Cold Drinks" },
  "检查糖浆存量": { zh: "检查糖浆存量", en: "Check Syrup Stock", my: "[MY] Check Syrup Stock" },
  "清洗搅拌机/雪克杯": { zh: "清洗搅拌机/雪克杯", en: "Wash Blender / Shaker", my: "[MY] Wash Blender / Shaker" },
  "无残留": { zh: "无残留", en: "No Residue", my: "[MY] No Residue" },
  "封好水果盒": { zh: "封好水果盒", en: "Seal Fruit Boxes", my: "[MY] Seal Fruit Boxes" },
  "清理水吧水槽": { zh: "清理水吧水槽", en: "Clean Bar Sink", my: "[MY] Clean Bar Sink" },
  "无茶叶渣": { zh: "无茶叶渣", en: "No Tea Leaves Residue", my: "[MY] No Tea Leaves Residue" },
  "关闭开水机": { zh: "关闭开水机", en: "Turn Off Boiler", my: "[MY] Turn Off Boiler" },
  "差异 < RM10": { zh: "差异 < RM10", en: "Variance < RM10", my: "[MY] Variance < RM10" },
  "财务日清日结": { zh: "财务日清日结", en: "Daily Settlement", my: "[MY] Daily Settlement" },
  "金额准确": { zh: "金额准确", en: "Accurate Amount", my: "[MY] Accurate Amount" },
  "防止遗失": { zh: "防止遗失", en: "Prevent Loss", my: "[MY] Prevent Loss" },
  "KF系列每日必盘": { zh: "KF系列每日必盘", en: "Daily KF Inventory", my: "[MY] Daily KF Inventory" },
  "成本控制": { zh: "成本控制", en: "Cost Control", my: "[MY] Cost Control" },
  "FIFO": { zh: "FIFO", en: "FIFO", my: "[MY] FIFO" },
  "食品安全": { zh: "食品安全", en: "Food Safety", my: "[MY] Food Safety" },
  "每日营业前": { zh: "每日营业前", en: "Before Operations", my: "[MY] Before Operations" },
  "过期立即下架": { zh: "过期立即下架", en: "Remove Expired Items", my: "[MY] Remove Expired Items" },
  "< 2袋需申购": { zh: "< 2袋需申购", en: "< 2 Bags Need Order", my: "[MY] < 2 Bags Need Order" },
  "防断供": { zh: "防断供", en: "Prevent Out of Stock", my: "[MY] Prevent Out of Stock" },
  "每周日全盘": { zh: "每周日全盘", en: "Weekly Full Audit", my: "[MY] Weekly Full Audit" },
  "耗材管控": { zh: "耗材管控", en: "Supply Control", my: "[MY] Supply Control" },
  "足够5天用量": { zh: "足够5天用量", en: "5 Days Stock", my: "[MY] 5 Days Stock" },
  "外卖运营": { zh: "外卖运营", en: "Delivery Ops", my: "[MY] Delivery Ops" },
  "每晚营业后": { zh: "每晚营业后", en: "After Closing", my: "[MY] After Closing" },
  "监控每日炭火福建面出品质量 (锅气/色泽/味道)": { zh: "监控每日炭火福建面出品质量 (锅气/色泽/味道)", en: "Monitor Daily Charcoal Fried Noodles Quality (Wok Hei/Color/Taste)", my: "[MY] Monitor Daily Charcoal Fried Noodles Quality (Wok Hei/Color/Taste)" },
  "负责秘制酱料、猪油渣的熬制与品控": { zh: "负责秘制酱料、猪油渣的熬制与品控", en: "Responsible for secret sauce, lard preparation & QC", my: "[MY] Responsible for secret sauce, lard preparation & QC" },
  "控制厨房成本 (Costing) 在 35% 以内": { zh: "控制厨房成本 (Costing) 在 35% 以内", en: "Control kitchen food cost under 35%", my: "[MY] Control kitchen food cost under 35%" },
  "培训头手与二锅，传承炒面技艺": { zh: "培训头手与二锅，传承炒面技艺", en: "Train junior chefs & pass down noodle-frying skills", my: "[MY] Train junior chefs & pass down noodle-frying skills" },
  "🗣️ 待客之道：见到顾客必须点头微笑说\"欢迎光临\"，离开说\"谢谢光临\"。": { zh: "🗣️ 待客之道：见到顾客必须点头微笑说\"欢迎光临\"，离开说\"谢谢光临\"。", en: "Hospitality: Smile and say 'Welcome' to customers upon arrival, and 'Thank you' upon departure.", my: "🗣️ ဝန်ဆောင်မှု- ဧည့်သည်ကို မြင်ပါက ခေါင်းညိတ်ပြုံးရွှင်စွာ \"ကြိုဆိုပါသည်\" ဟု နှုတ်ဆက်ပြီး၊ ပြန်ပါက \"ကျေးဇူးတင်ပါသည်\" ဟု ပြောရမည်。" },
  "顾客投诉面没有锅气 (No Wok Hei)": { zh: "顾客投诉面没有锅气 (No Wok Hei)", en: "Customer complains no Wok Hei on noodles", my: "ဝယ်ယူသူမှ အိုးငွေ့အရသာ (Wok Hei) မရှိကြောင်း တိုင်ကြားခြင်း" },
  "立即检查炭火炉温度及鼓风机运作，亲自试炒一份确认味道，必要时更换受潮的炭。": { zh: "立即检查炭火炉温度及鼓风机运作，亲自试炒一份确认味道，必要时更换受潮的炭。", en: "Immediately check charcoal temperature and blower. Test fry one portion. Replace damp charcoal if necessary.", my: "မီးဖိုအပူချိန်နှင့် လေမှုတ်စက် အလုပ်လုပ်ပုံကို ချက်ချင်းစစ်ဆေးပါ၊ ကိုယ်တိုင်တစ်ပွဲစမ်း炒ပြီး အရသာမြည်းကြည့်ပါ၊ လိုအပ်ပါက စိုထိုင်းနေသော မီးသွေးများကို လဲလှယ်ပါ။" },
  "酱料味道不稳定 (Taste inconsistent)": { zh: "酱料味道不稳定 (Taste inconsistent)", en: "Inconsistent sauce taste", my: "ဆော့စ်အရသာ မတည်ငြိမ်ခြင်း" },
  "立即停止使用当前批次酱料，重新调配。检查是否有人未按比例投放调料。": { zh: "立即停止使用当前批次酱料，重新调配。检查是否有人未按比例投放调料。", en: "Stop using current sauce batch, prepare a new one. Check if staff followed recipe ratios.", my: "လက်ရှိဆော့စ်များကို အသုံးပြုခြင်း ချက်ချင်းရပ်တန့်ပြီး အသစ်ပြန်စပ်ပါ။ မည်သူမဆို ဖော်မြူလာအတိုင်း မထည့်ဘဲနေသလား စစ်ဆေးပါ။" },
  "供应商送来的猪油不新鲜": { zh: "供应商送来的猪油不新鲜", en: "Supplier delivered unfresh lard", my: "ပေးသွင်းသူထံမှ ပို့ပေးသော ဝက်ဆီ မလတ်ဆတ်ခြင်း" },
  "直接拒收并拍照留证，立即联系备用供应商补货，确保猪油渣品质。": { zh: "直接拒收并拍照留证，立即联系备用供应商补货，确保猪油渣品质。", en: "Reject immediately and take photos. Contact backup supplier to ensure lard quality.", my: "လက်ခံရန် ချက်ချင်းငြင်းပယ်ပြီး ဓာတ်ပုံရိုက်ကာ မှတ်တမ်းတင်ပါ၊ အရန်ပေးသွင်းသူကို ချက်ချင်းဆက်သွယ်ပြီး ဝက်ဆီဖတ်အရည်အသွေး ကောင်းမွန်စေရန် လုပ်ဆောင်ပါ။" },
  "每日营业额目标跟进与汇报": { zh: "每日营业额目标跟进与汇报", en: "Track & report daily sales targets", my: "[MY] Track & report daily sales targets" },
  "排班管理与人力成本控制": { zh: "排班管理与人力成本控制", en: "Manage roster & control labor cost", my: "[MY] Manage roster & control labor cost" },
  "处理严重客诉 (Google Review / 现场发飙)": { zh: "处理严重客诉 (Google Review / 现场发飙)", en: "Handle severe customer complaints (Google Reviews/On-site issues)", my: "[MY] Handle severe customer complaints (Google Reviews/On-site issues)" },
  "监督现金流与每日结算": { zh: "监督现金流与每日结算", en: "Supervise cash flow and daily settlement", my: "[MY] Supervise cash flow and daily settlement" },
  "业绩为王 · 客户至上 · 团队凝聚": { zh: "业绩为王 · 客户至上 · 团队凝聚", en: "Sales King · Customers First · Team Cohesion", my: "ရောင်းအားမြင့်တင်ရေး · ဝယ်ယူသူကို ဦးစားပေးရေး · အဖွဲ့စည်းလုံးညီညွတ်ရေး" },
  "严禁伪造报表 / 严禁包庇员工违规行为": { zh: "严禁伪造报表 / 严禁包庇员工违规行为", en: "No falsifying reports / No covering up for staff violations", my: "အစီရင်ခံစာများ အတုပြုလုပ်ခြင်း သို့မဟုတ် ဝန်ထမ်းများ၏ စည်းကမ်းဖောက်ဖျက်မှုကို ဖုံးကွယ်ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "突发停电/断网": { zh: "突发停电/断网", en: "Sudden Power/Network Outage", my: "ရုတ်တရက် မီးပျက်ခြင်း/အင်တာနက်ပြတ်တောက်ခြင်း" },
  "立即启动离线作业流程，指挥厨房使用应急照明继续出餐（炭火不受影响），安抚顾客情绪。": { zh: "立即启动离线作业流程，指挥厨房使用应急照明继续出餐（炭火不受影响），安抚顾客情绪。", en: "Initiate offline SOP. Instruct kitchen to use emergency lighting to continue cooking (Charcoal unaffected). Calm customers.", my: "အော့ဖ်လိုင်းလုပ်ငန်းစဉ်ကို ချက်ချင်းစတင်ပါ၊ မီးဖိုချောင်တွင် အရေးပေါ်မီးများသုံး၍ ဆက်လက်ချက်ပြုတ်စေပါ (မီးသွေးဖြစ်၍ မထိခိုက်ပါ)၊ ဝယ်ယူသူများကို စိတ်အေးအောင် ရှင်းလင်းပြောကြားပါ။" },
  "甚至爆满排队混乱": { zh: "甚至爆满排队混乱", en: "Overwhelming crowd / messy queue", my: "ဧည့်သည်အလွန်များပြားပြီး တန်းစီခြင်း ရှုပ်ထွေးခြင်း" },
  "亲自到门口控场，启用取号系统，预先派发菜单给排队顾客点餐以缩短等待时间。": { zh: "亲自到门口控场，启用取号系统，预先派发菜单给排队顾客点餐以缩短等待时间。", en: "Manage the queue personally, issue numbers, give menus in advance to shorten waiting time.", my: "ကိုယ်တိုင် ဆိုင်တံခါးဝသို့သွား၍ ထိန်းချုပ်ပါ၊ တန်းစီစနစ်ကို အသုံးပြုပါ၊ စောင့်ဆိုင်းချိန်တိုစေရန် တန်းစီနေသော ဧည့်သည်များကို မီနူးကြိုတင်ဝေပေးပါ။" },
  "员工之间发生争执": { zh: "员工之间发生争执", en: "Staff dispute", my: "ဝန်ထမ်းအချင်းချင်း စကားများရန်ဖြစ်ခြင်း" },
  "立即将当事人带离现场至办公室冷静，避免在顾客面前吵架，事后进行调解或处分。": { zh: "立即将当事人带离现场至办公室冷静，避免在顾客面前吵架，事后进行调解或处分。", en: "Take involved staff to office immediately to calm down. Do not argue in front of customers. Mediate or penalize later.", my: "သက်ဆိုင်သူများကို စားသောက်ခန်းမမှ ရုံးခန်းသို့ ချက်ချင်းခေါ်ထုတ်သွားပြီး စိတ်အေးစေပါ၊ ဧည့်သည်များရှေ့တွင် ရန်ဖြစ်ခြင်းကို ရှောင်ရှားပြီး နောက်ပိုင်းတွင် ညှိနှိုင်းဖြေရှင်း သို့မဟုတ် အရေးယူပါ။" },
  "排班管理": { zh: "排班管理", en: "Roster Management", my: "[MY] Roster Management" },
  "现场控场": { zh: "现场控场", en: "Floor Control", my: "[MY] Floor Control" },
  "新人培训": { zh: "新人培训", en: "Newcomer Training", my: "[MY] Newcomer Training" },
  "客诉处理": { zh: "客诉处理", en: "Complaint Handling", my: "[MY] Complaint Handling" },
  "现场效率与零客诉": { zh: "现场效率与零客诉", en: "Operational Efficiency & Zero Complaints", my: "ဝန်ဆောင်မှုမြန်ဆန်ရေးနှင့် ဝယ်ယူသူတိုင်ကြားမှု လုံးဝမရှိစေရေး" },
  "严禁排班偏私 / 包庇下属违规": { zh: "严禁排班偏私 / 包庇下属违规", en: "No favoritism in rostering / No covering up", my: "ဂျူတီခွဲဝေရာတွင် မျက်နှာလိုက်ခြင်း သို့မဟုတ် လက်အောက်ဝန်ထမ်း၏ အမှားများကို ဖုံးကွယ်ပေးခြင်း လုံးဝမပြုလုပ်ရ။" },
  "人手不足": { zh: "人手不足", en: "Understaffed", my: "ဝန်ထမ်းအင်အား မလုံလောက်ခြင်း" },
  "合理重新划分服务区域，自己亲自顶上繁忙区域。": { zh: "合理重新划分服务区域，自己亲自顶上繁忙区域。", en: "Reassign sections properly, step in to cover the busiest area personally.", my: "ဝန်ဆောင်မှုဧရိယာကို စနစ်တကျ ပြန်လည်ခွဲဝေပါ၊ မိမိကိုယ်တိုင် အလုပ်အရှုပ်ဆုံးနေရာတွင် ဝင်ရောက်ကူညီပါ။" },
  "顾客投诉菜品有异物": { zh: "顾客投诉菜品有异物", en: "Customer complains foreign object in food", my: "ဟင်းပွဲထဲတွင် မလိုလားအပ်သော ပစ္စည်းပါဝင်ကြောင်း ဧည့်သည်မှ တိုင်ကြားခြင်း" },
  "立即道歉并撤走菜品，承诺免单该菜品并赠送甜品，事后追查厨房责任人。": { zh: "立即道歉并撤走菜品，承诺免单该菜品并赠送甜品，事后追查厨房责任人。", en: "Apologize immediately, remove food, waive the item cost, offer a free dessert. Investigate kitchen later.", my: "ချက်ချင်းတောင်းပန်ပြီး ဟင်းပွဲကို ပြန်လည်သိမ်းဆည်းပါ၊ ထိုဟင်းပွဲအတွက် အခမဲ့ပေးမည်ဟု ကတိပြုပြီး အချိုပွဲလက်ဆောင်ပေးပါ၊ နောက်ပိုင်းတွင် မီးဖိုချောင်တာဝန်ရှိသူကို စုံစမ်းစစ်ဆေးပါ။" },
  "维护员工档案 (入职/离职/调岗/薪资变动)": { zh: "维护员工档案 (入职/离职/调岗/薪资变动)", en: "Maintain staff files (Onboarding/Resignation/Transfer/Salary)", my: "[MY] Maintain staff files (Onboarding/Resignation/Transfer/Salary)" },
  "处理月度薪资计算与发放 (EPF/SOCSO/PCB)": { zh: "处理月度薪资计算与发放 (EPF/SOCSO/PCB)", en: "Process monthly payroll (EPF/SOCSO/PCB)", my: "[MY] Process monthly payroll (EPF/SOCSO/PCB)" },
  "跟进员工警告记录与纪律流程": { zh: "跟进员工警告记录与纪律流程", en: "Follow up on warning letters & disciplinary actions", my: "[MY] Follow up on warning letters & disciplinary actions" },
  "协调招聘广告、面试与入职引导": { zh: "协调招聘广告、面试与入职引导", en: "Coordinate job ads, interviews & onboarding", my: "[MY] Coordinate job ads, interviews & onboarding" },
  "管理员工排班与假期申请审批": { zh: "管理员工排班与假期申请审批", en: "Manage roster & leave approvals", my: "[MY] Manage roster & leave approvals" },
  "确保公司遵守劳工法令 (Employment Act 1955)": { zh: "确保公司遵守劳工法令 (Employment Act 1955)", en: "Ensure compliance with Employment Act 1955", my: "[MY] Ensure compliance with Employment Act 1955" },
  "公平 · 保密 · 合规": { zh: "公平 · 保密 · 合规", en: "Fairness · Confidentiality · Compliance", my: "တရားမျှတမှု · လျှို့ဝှက်ထိန်းသိမ်းမှု · စည်းကမ်းလိုက်နာမှု" },
  "严禁泄露员工薪资与个人档案 / 严禁偏私处理纪律事件": { zh: "严禁泄露员工薪资与个人档案 / 严禁偏私处理纪律事件", en: "No leaking salaries or personal info / No bias in discipline", my: "ဝန်ထမ်းများ၏ လစာနှင့် ကိုယ်ရေးအချက်အလက်များကို ဖွင့်ဟခြင်း သို့မဟုတ် စည်းကမ်းပိုင်းဆိုင်ရာအရေးယူမှုများတွင် မျက်နှာလိုက်ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "员工投诉薪资计算错误": { zh: "员工投诉薪资计算错误", en: "Staff complains about payroll error", my: "ဝန်ထမ်းမှ လစာတွက်ချက်မှု မှားယွင်းကြောင်း တိုင်ကြားခြင်း" },
  "立即调出当月考勤与薪资单核对，24小时内给出书面答复，确认有误则下次发薪补足差额。": { zh: "立即调出当月考勤与薪资单核对，24小时内给出书面答复，确认有误则下次发薪补足差额。", en: "Check attendance and payslip immediately. Reply in 24 hours. Compensate any shortfall in next payroll.", my: "ထိုလ၏ 考勤 နှင့် လစာစာရွက်ကို ချက်ချင်းထုတ်ယူစစ်ဆေးပါ၊ ၂၄ နာရီအတွင်း စာဖြင့်အကြောင်းပြန်ပါ၊ မှားယွင်းပါက နောက်လ發薪တွင် ပြန်လည်ဖြည့်စွက်ပေးပါ။" },
  "员工突然离职不辞而别 (Abscond)": { zh: "员工突然离职不辞而别 (Abscond)", en: "Staff absconds without notice", my: "ဝန်ထမ်းမှ အကြောင်းမကြားဘဲ ရုတ်တရက် အလုပ်ထွက်သွားခြင်း (Abscond)" },
  "按流程发送书面通知至其登记地址，记录档案为 '旷工离职' ，并更新系统状态。": { zh: "按流程发送书面通知至其登记地址，记录档案为 '旷工离职' ，并更新系统状态。", en: "Send formal notice to registered address. Record as 'Absconded' and update system.", my: "အလုပ်သမားစည်းကမ်းအတိုင်း ၎င်း၏နေရပ်လိပ်စာသို့ စာဖြင့်အကြောင်းကြားစာပေးပို့ပါ၊ ကိုယ်ရေးဖိုင်တွင် \"အကြောင်းမဲ့ပျက်ကွက်အလုပ်ထွက်\" ဟု မှတ်တမ်းတင်ပြီး စနစ်အတွင်း အခြေအနေကို အပ်ဒိတ်လုပ်ပါ။" },
  "收到前员工索取薪资单纪录": { zh: "收到前员工索取薪资单纪录", en: "Ex-staff requests old payslips", my: "ဝန်ထမ်းဟောင်းမှ လစာမှတ်တမ်း တောင်းခံခြင်း" },
  "核实身份后，依劳工法令在5个工作日内提供，只能提供本人档案。": { zh: "核实身份后，依劳工法令在5个工作日内提供，只能提供本人档案。", en: "Verify ID, provide within 5 working days per law. Only provide their own records.", my: "မည်သူမည်ဝါဖြစ်ကြောင်း စိစစ်ပြီးနောက်၊ အလုပ်သမားဥပဒေအရ ၅ ရက်အတွင်း ထုတ်ပေးပါ၊ ကာယကံရှင်၏ ကိုယ်ရေးဖိုင်ကိုသာ ထုတ်ပေးနိုင်သည်။" },
  "监控每日营业额与达标率": { zh: "监控每日营业额与达标率", en: "Monitor daily revenue & targets", my: "[MY] Monitor daily revenue & targets" },
  "跟进库存盘点，确保食材与物资充足": { zh: "跟进库存盘点，确保食材与物资充足", en: "Follow up inventory, ensure sufficient stocks", my: "[MY] Follow up inventory, ensure sufficient stocks" },
  "协调与供应商的采购、报价及交货": { zh: "协调与供应商的采购、报价及交货", en: "Coordinate purchasing, quotes, delivery with suppliers", my: "[MY] Coordinate purchasing, quotes, delivery with suppliers" },
  "负责设备日常检查与维修申报": { zh: "负责设备日常检查与维修申报", en: "Handle daily equipment checks & repair requests", my: "[MY] Handle daily equipment checks & repair requests" },
  "维护门店卫生与安全标准 (SOP Inspection)": { zh: "维护门店卫生与安全标准 (SOP Inspection)", en: "Maintain store hygiene & safety (SOP Inspect)", my: "[MY] Maintain store hygiene & safety (SOP Inspect)" },
  "协助经理完成月底盘点与成本报告": { zh: "协助经理完成月底盘点与成本报告", en: "Assist manager in month-end stock count & cost report", my: "[MY] Assist manager in month-end stock count & cost report" },
  "效率 · 节约 · 稳定运营": { zh: "效率 · 节约 · 稳定运营", en: "Efficiency · Cost-saving · Stable Ops", my: "ထိရောက်မှု · ချွေတာမှု · တည်ငြိမ်စွာလည်ပတ်မှု" },
  "严禁私自挪用库存物资 / 严禁授权不明的供应商进货": { zh: "严禁私自挪用库存物资 / 严禁授权不明的供应商进货", en: "No misappropriation of stock / No unauthorized suppliers", my: "ဆိုင်ပစ္စည်းများကို ခွင့်ပြုချက်မရှိဘဲ သုံးစွဲခြင်း သို့မဟုတ် အတည်မပြုထားသော ပစ္စည်းပေးသွင်းသူများထံမှ ကုန်ပစ္စည်းမှာယူခြင်းကို လုံးဝတားမြစ်သည်။" },
  "供应商无法按时交货": { zh: "供应商无法按时交货", en: "Supplier fails to deliver on time", my: "ပေးသွင်းသူမှ အချိန်မီ ပစ္စည်းမပို့နိုင်ခြင်း" },
  "立即联系备用供应商，同时通知厨房调整当日菜单以应对食材短缺。": { zh: "立即联系备用供应商，同时通知厨房调整当日菜单以应对食材短缺。", en: "Contact backup supplier, inform kitchen to adjust menu due to shortage.", my: "အရန်ပေးသွင်းသူကို ချက်ချင်းဆက်သွယ်ပါ၊ တစ်ပြိုင်နက်တည်းတွင် ပါဝင်ပစ္စည်းပြတ်လပ်မှုကို ဖြေရှင်းရန် ယနေ့မီနူးကို ညှိနှိုင်းပြင်ဆင်ရန် မီးဖိုချောင်သို့ အကြောင်းကြားပါ။" },
  "设备故障 (如冰箱/炸炉/洗碗机)": { zh: "设备故障 (如冰箱/炸炉/洗碗机)", en: "Equipment breakdown (e.g. fridge/fryer/dishwasher)", my: "စက်ပစ္စည်း ချို့ယွင်းခြင်း (ဥပမာ- ရေခဲသေတ္တာ/ဆီကြော်အိုး/ပန်းကန်ဆေးစက်)" },
  "立即拍照记录故障状况，联系指定维修师傅，同时安排替代方案确保运营不中断。": { zh: "立即拍照记录故障状况，联系指定维修师傅，同时安排替代方案确保运营不中断。", en: "Take photo, contact technician, arrange backup plan to ensure smooth operations.", my: "ချို့ယွင်းမှုအခြေအနေကို ချက်ချင်းဓာတ်ပုံရိုက်ပြီး မှတ်တမ်းတင်ပါ၊ သတ်မှတ်ထားသော ပြုပြင်ရေးဆရာကို ဆက်သွယ်ပါ၊ ဆိုင်လည်ပတ်မှု မပြတ်တောက်စေရန် အစားထိုးနည်းလမ်းကို စီစဉ်ပါ။" },
  "月底盘点与系统数据出现差异": { zh: "月底盘点与系统数据出现差异", en: "Month-end inventory differs from system", my: "လကုန်ပိုင်း စာရင်းစစ်ခြင်းတွင် စနစ်နှင့်实物 ကွာဟချက်ရှိခြင်း" },
  "重新清点实物，检查入库与出库记录，找出差异原因并形成书面报告。": { zh: "重新清点实物，检查入库与出库记录，找出差异原因并形成书面报告。", en: "Recount physical stock, check inbound/outbound records, find root cause and report.", my: "实物 များကို ထပ်မံရေတွက်ပါ၊ ပစ္စည်းအဝင်/အထွက်မှတ်တမ်းများကို စစ်ဆေးပါ၊ ကွာဟရသည့် အကြောင်းရင်းကို ရှာဖွေပြီး စာဖြင့်အစီရင်ခံစာတင်ပြပါ။" },
  "StoreHub 收银操作与结账": { zh: "StoreHub 收银操作与结账", en: "StoreHub cashier & checkout ops", my: "[MY] StoreHub cashier & checkout ops" },
  "接听电话订单与 GrabFood/FoodPanda 接单": { zh: "接听电话订单与 GrabFood/FoodPanda 接单", en: "Take phone orders & delivery orders", my: "[MY] Take phone orders & delivery orders" },
  "核对每日现金与单据 (Variance < RM10)": { zh: "核对每日现金与单据 (Variance < RM10)", en: "Verify daily cash & bills (Variance < RM10)", my: "[MY] Verify daily cash & bills (Variance < RM10)" },
  "管理排队叫号系统 (高峰期)": { zh: "管理排队叫号系统 (高峰期)", en: "Manage queuing system (Peak hours)", my: "[MY] Manage queuing system (Peak hours)" },
  "StoreHub 系统卡顿/死机": { zh: "StoreHub 系统卡顿/死机", en: "StoreHub system freeze", my: "StoreHub စနစ် ဟန်းသွားခြင်း/ရပ်တန့်သွားခြင်း" },
  "立即重启 iPad。若无法恢复，使用手写单记账，待网络恢复后补录。": { zh: "立即重启 iPad。若无法恢复，使用手写单记账，待网络恢复后补录。", en: "Restart iPad immediately. Use manual bills if persists, record later when online.", my: "iPad ကို ချက်ချင်း Restart ချပါ။ အဆင်မပြေပါက လက်ရေးမှာယူမှုများဖြင့် စာရင်းမှတ်သားထားပြီး၊ ကွန်ရက်ပြန်ကောင်းလာပါက စနစ်ထဲသို့ ပြန်လည်ထည့်သွင်းပါ။" },
  "外卖骑手催单且态度恶劣": { zh: "外卖骑手催单且态度恶劣", en: "Delivery rider rushes order rudely", my: "ပါဆယ်ပို့ဆောင်သူ (Rider) မှ အော်ဒါအလျင်စလိုတောင်းပြီး ရိုင်းစိုင်းစွာ ဆက်ဆံခြင်း" },
  "保持冷静，告知大概出餐时间。如骑手并在店内喧哗，请经理出面处理。": { zh: "保持冷静，告知大概出餐时间。如骑手并在店内喧哗，请经理出面处理。", en: "Stay calm, provide estimated time. If rider shouts, call manager to handle.", my: "စိတ်အေးအေးထားပြီး ဟင်းထွက်မည့်အချိန်ကို ခန့်မှန်းပြောပြပါ။ ဆိုင်တွင်း ဆူညံအော်ဟစ်ပါက မန်နေဂျာကို ခေါ်ယူဖြေရှင်းခိုင်းပါ။" },
  "结账时发现少钱 (Cash Shortage)": { zh: "结账时发现少钱 (Cash Shortage)", en: "Cash Shortage found during checkout", my: "ငွေရှင်းရာတွင် ငွေသားလျော့နည်းနေခြင်း (Cash Shortage)" },
  "如实记录在 Logbook，若差额超过 RM10 需自行补齐或接受调查。": { zh: "如实记录在 Logbook，若差额超过 RM10 需自行补齐或接受调查。", en: "Record in Logbook. If > RM10, top up yourself or face investigation.", my: "မှတ်တမ်းစာအုပ်ထဲတွင် အရှိအတိုင်း ရေးမှတ်ပါ၊ ကွာဟချက် RM၁၀ ထက်ကျော်လွန်ပါက မိမိကိုယ်တိုင် စိုက်လျော်ရမည် သို့မဟုတ် စုံစမ်းစစ်ဆေးမှုခံယူရမည်။" },
  "为顾客点餐 (推荐: 招牌福建面, 月光河)": { zh: "为顾客点餐 (推荐: 招牌福建面, 月光河)", en: "Take orders (Recommend: Signature Hokkien Mee, Moonlight Hor Fun)", my: "[MY] Take orders (Recommend: Signature Hokkien Mee, Moonlight Hor Fun)" },
  "确认顾客特殊要求 (如: 少猪油, 加辣)": { zh: "确认顾客特殊要求 (如: 少猪油, 加辣)", en: "Confirm special requests (e.g. less lard, extra spicy)", my: "[MY] Confirm special requests (e.g. less lard, extra spicy)" },
  "巡视餐桌，跟进出餐速度": { zh: "巡视餐桌，跟进出餐速度", en: "Patrol tables, follow up serving speed", my: "[MY] Patrol tables, follow up serving speed" },
  "处理简单的退换菜要求": { zh: "处理简单的退换菜要求", en: "Handle simple food return/exchange", my: "[MY] Handle simple food return/exchange" },
  "精准下单 · 主动推销 · 掌控节奏": { zh: "精准下单 · 主动推销 · 掌控节奏", en: "Accurate Orders · Active Upsell · Control Pace", my: "မှာယူမှုတိကျခြင်း · တက်ကြွစွာ ညွှန်းဆိုရောင်းချခြင်း · အချိန်ကို ထိန်းချုပ်နိုင်ခြင်း" },
  "严禁漏单不报 / 严禁对顾客不耐烦": { zh: "严禁漏单不报 / 严禁对顾客不耐烦", en: "No hiding missed orders / No impatience with customers", my: "အော်ဒါလွတ်သွားသည်ကို မတင်ပြဘဲနေခြင်း သို့မဟုတ် ဧည့်သည်အပေါ် စိတ်မရှည်ဖြစ်ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "顾客投诉等了 30 分钟还没上菜": { zh: "顾客投诉等了 30 分钟还没上菜", en: "Customer complains 30 min wait", my: "ဧည့်သည်မှ မိနစ် ၃၀ ခန့် စောင့်ဆိုင်းသော်လည်း ဟင်းမရသေးကြောင်း တိုင်ကြားခြင်း" },
  "先道歉，立即去厨房查看单据位置。如果是漏单，优先补做并送上一杯免费凉茶致歉。": { zh: "先道歉，立即去厨房查看单据位置。如果是漏单，优先补做并送上一杯免费凉茶致歉。", en: "Apologize, check kitchen tickets. If missed, prioritize and offer free herbal tea.", my: "ဦးစွာတောင်းပန်ပါ၊ မီးဖိုချောင်သို့သွား၍ အမှာစာစာရွက်ရှိရာနေရာကို ချက်ချင်းစစ်ဆေးပါ၊ အမှာစာလွတ်သွားပါက အမြန်ဆုံး ဦးစားပေးချက်ပြုတ်စေပြီး တောင်းပန်ခြင်းအထိမ်းအမှတ်အဖြစ် အခမဲ့涼茶 တစ်ခွက် ပေးအပ်ပါ။" },
  "顾客点菜犹豫不决": { zh: "顾客点菜犹豫不决", en: "Customer hesitates while ordering", my: "ဧည့်သည်မှ ဟင်းမှာယူရန် ဝေခွဲမရဖြစ်နေခြင်း" },
  "主动引导：'不如试下我们的招牌福建面？两个人吃中份刚好，再加个炸鸡翅？": { zh: "主动引导：'不如试下我们的招牌福建面？两个人吃中份刚好，再加个炸鸡翅？", en: "Guide them: 'Try our Signature Hokkien Mee? Medium is perfect for two, maybe add chicken wings?'", my: "[MY] Guide them: 'Try our Signature Hokkien Mee? Medium is perfect for two, maybe add chicken wings?'" },
  "福建面卖完了 (极少发生)": { zh: "福建面卖完了 (极少发生)", en: "Hokkien Mee sold out (Rare)", my: "ဟူကင်မီး ကုန်သွားခြင်း (အလွန်ဖြစ်ခဲပါသည်)" },
  "立即通知所有服务员，并向顾客推荐广府鸳鸯或罗面作为替代。": { zh: "立即通知所有服务员，并向顾客推荐广府鸳鸯或罗面作为替代。", en: "Inform all staff, recommend Cantonese Yin Yang or Lor Mee instead.", my: "စားပွဲထိုးအားလုံးကို ချက်ချင်းအကြောင်းကြားပါ၊ ဧည့်သည်များကို အစားထိုးအဖြစ် အခြားခေါက်ဆွဲများကို ညွှန်းဆိုပေးပါ။" },
  "准确将菜品送至对应桌号": { zh: "准确将菜品送至对应桌号", en: "Deliver food accurately to tables", my: "[MY] Deliver food accurately to tables" },
  "客人离座后 1 分钟内收桌并擦净": { zh: "客人离座后 1 分钟内收桌并擦净", en: "Clear and wipe table within 1 minute of customer leaving", my: "[MY] Clear and wipe table within 1 minute of customer leaving" },
  "补充餐具、辣椒酱、纸巾": { zh: "补充餐具、辣椒酱、纸巾", en: "Refill cutlery, chili sauce, tissue", my: "[MY] Refill cutlery, chili sauce, tissue" },
  "保持地面无垃圾": { zh: "保持地面无垃圾", en: "Keep floor free of trash", my: "[MY] Keep floor free of trash" },
  "眼观六路 · 手脚麻利 · 安全第一": { zh: "眼观六路 · 手脚麻利 · 安全第一", en: "Be alert · Be fast · Safety first", my: "အကဲခတ်လျင်မြန်ခြင်း · သွက်လက်ချက်ချာခြင်း · ဘေးကင်းရေးကို ဦးစားပေးခြင်း" },
  "严禁在店内奔跑 / 严禁跨过小孩头顶上菜": { zh: "严禁在店内奔跑 / 严禁跨过小孩头顶上菜", en: "No running in store / Do not serve over children's heads", my: "ဆိုင်အတွင်း ပြေးလွှားခြင်း သို့မဟုတ် ကလေးများ၏ ခေါင်းပေါ်မှ ဟင်းပွဲကျော်၍ ချပေးခြင်းကို လုံးဝတားမြစ်သည်။" },
  "不小心把汤洒在客人身上": { zh: "不小心把汤洒在客人身上", en: "Accidentally spilled soup on customer", my: "မတော်တဆ ဟင်းရည်များကို ဧည့်သည်၏ကိုယ်ပေါ်သို့ ဖိတ်စင်မိခြင်း" },
  "立即道歉，提供纸巾擦拭。不管客人是否生气，必须马上报告经理处理赔偿事宜。": { zh: "立即道歉，提供纸巾擦拭。不管客人是否生气，必须马上报告经理处理赔偿事宜。", en: "Apologize immediately, provide tissues. Must report to manager for compensation regardless of anger.", my: "ချက်ချင်းတောင်းပန်ပါ၊ သုတ်ရန် တစ်ရှူးပေးပါ။ ဧည့်သည် စိတ်ဆိုးသည်ဖြစ်စေ၊ မဆိုးသည်ဖြစ်စေ နစ်နာမှုဖြေရှင်းရန် မန်နေဂျာထံ ချက်ချင်းတင်ပြပါ။" },
  "客人要求加汤/加猪油渣": { zh: "客人要求加汤/加猪油渣", en: "Customer requests extra soup/lard", my: "ဧည့်သည်မှ ဟင်းရည် သို့မဟုတ် ဝက်ဆီဖတ် ထပ်တောင်းခြင်း" },
  "微笑着说'好的，稍等'，立即去厨房取，不要让客人等超过 3 分钟。": { zh: "微笑着说'好的，稍等'，立即去厨房取，不要让客人等超过 3 分钟。", en: "Smile and say 'Sure, please wait'. Fetch from kitchen immediately, do not exceed 3 mins.", my: "ပြုံးလျက် \"ဟုတ်ကဲ့ ခဏစောင့်ပါခင်ဗျာ\" ဟုပြောပြီး၊ မီးဖိုချောင်သို့သွား၍ ချက်ချင်းယူပေးပါ၊ ဧည့်သည်ကို ၃ မိနစ်ထက် ပိုမစောင့်ခိုင်းပါနှင့်။" },
  "发现桌子摇晃不稳": { zh: "发现桌子摇晃不稳", en: "Table is wobbly", my: "စားပွဲ လှုပ်ခါပြီး မငြိမ်မသက်ဖြစ်နေသည်ကို တွေ့ရှိခြင်း" },
  "立即找硬纸皮垫脚，确保客人用餐体验舒适。": { zh: "立即找硬纸皮垫脚，确保客人用餐体验舒适。", en: "Find cardboard to balance it, ensure comfortable dining experience.", my: "စားပွဲခြေထောက်အောက်တွင် ညှပ်ရန် စက္ကူထူကို ချက်ချင်းရှာဖွေထည့်သွင်းပေးပြီး၊ ဧည့်သည်များ စိတ်ချမ်းသာစွာ စားသုံးနိုင်ရန် ဆောင်ရွက်ပါ။" },
  "环境清洁": { zh: "环境清洁", en: "Environment Cleaning", my: "[MY] Environment Cleaning" },
  "厕所检查 (30min)": { zh: "厕所检查 (30min)", en: "Toilet Check (30min)", my: "[MY] Toilet Check (30min)" },
  "垃圾处理": { zh: "垃圾处理", en: "Trash Disposal", my: "[MY] Trash Disposal" },
  "翻台/抹桌": { zh: "翻台/抹桌", en: "Turn Table / Wipe", my: "[MY] Turn Table / Wipe" },
  "无死角清洁": { zh: "无死角清洁", en: "Zero Blind Spot Cleaning", my: "နေရာအနှံ့အပြား ကွက်လပ်မကျန် သန့်ရှင်းစေရေး" },
  "严禁地面积水不处理 (防滑倒)": { zh: "严禁地面积水不处理 (防滑倒)", en: "Do not leave puddles untreated (Prevent slips)", my: "ကြမ်းပြင်တွင် ရေတင်ကျန်နေခြင်းကို မရှင်းဘဲထားခြင်း (ချော်လဲခြင်းကို ကာကွယ်ရန်) ကို လုံးဝတားမြစ်သည်။" },
  "厕所堵塞": { zh: "厕所堵塞", en: "Toilet clogged", my: "အိမ်သာပိတ်ဆို့ခြင်း" },
  "立即暂停使用，尝试疏通，不行则通知经理报修。": { zh: "立即暂停使用，尝试疏通，不行则通知经理报修。", en: "Suspend use, try to unclog, or report to manager for repair.", my: "အသုံးပြုခြင်းကို ချက်ချင်းရပ်ဆိုင်းပါ၊ ပိုက်စုပ်ဖြင့် စမ်းသပ်疏通ပါ၊ အဆင်မပြေပါက ပြုပြင်ရန် မန်နေဂျာထံ အကြောင်းကြားပါ။" },
  "地面有呕吐物": { zh: "地面有呕吐物", en: "Vomit on floor", my: "ကြမ်းပြင်ပေါ်တွင် အန်ဖတ်များရှိနေခြင်း" },
  "戴上手套口罩，使用专用清洁剂和木屑覆盖清理，彻底消毒去味。": { zh: "戴上手套口罩，使用专用清洁剂和木屑覆盖清理，彻底消毒去味。", en: "Wear gloves/mask, use cleaner & sawdust, sanitize and deodorize thoroughly.", my: "လက်အိတ်နှင့် နှာခေါင်းစည်းတပ်ဆင်ပါ၊ သတ်မှတ်ထားသော သန့်ရှင်းရေးဆေးနှင့် သစ်သားမှုန့်များ သုံး၍ ဖုံးအုပ်ရှင်းလင်းပါ၊ ပိုးသတ်ပြီး အနံ့ဆိုးများကို လုံးဝဖယ်ရှားပါ။" },
  "高峰期支援": { zh: "高峰期支援", en: "Peak Hour Support", my: "[MY] Peak Hour Support" },
  "基础服务/清洁": { zh: "基础服务/清洁", en: "Basic Service/Cleaning", my: "[MY] Basic Service/Cleaning" },
  "听从调配": { zh: "听从调配", en: "Follow Instructions", my: "[MY] Follow Instructions" },
  "机动性与补位": { zh: "机动性与补位", en: "Flexibility & Backup", my: "လိုအပ်သောနေရာတွင် ချက်ချင်းကူညီခြင်း" },
  "严禁无故缺席 (No Show)": { zh: "严禁无故缺席 (No Show)", en: "No absent without reason (No Show)", my: "အကြောင်းပြချက်မရှိဘဲ ဂျူတီပျက်ကွက်ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "不知道该做什么": { zh: "不知道该做什么", en: "Don't know what to do", my: "ဘာလုပ်ရမှန်း မသိဖြစ်နေခြင်း" },
  "主动询问 Supervisor 或 Captain：'有什么需要帮忙的吗？不要站在角落玩手机。": { zh: "主动询问 Supervisor 或 Captain：'有什么需要帮忙的吗？不要站在角落玩手机。", en: "Ask Supervisor/Captain: 'Anything I can help with?'. Do not play with phone in corner.", my: "[MY] Ask Supervisor/Captain: 'Anything I can help with?'. Do not play with phone in corner." },
  "负责核心炒锅 (福建面/月光河)": { zh: "负责核心炒锅 (福建面/月光河)", en: "Handle core Wok (Hokkien Mee / Moonlight Hor Fun)", my: "[MY] Handle core Wok (Hokkien Mee / Moonlight Hor Fun)" },
  "把控出餐节奏，指挥帮手": { zh: "把控出餐节奏，指挥帮手", en: "Control serving pace, instruct helpers", my: "[MY] Control serving pace, instruct helpers" },
  "每日收档检查煤气与炭火安全": { zh: "每日收档检查煤气与炭火安全", en: "Daily closing check of gas & charcoal safety", my: "[MY] Daily closing check of gas & charcoal safety" },
  "试味 (确保咸淡适中)": { zh: "试味 (确保咸淡适中)", en: "Taste test (Ensure balanced flavor)", my: "[MY] Taste test (Ensure balanced flavor)" },
  "锅气十足 · 速度激情 · 品质如一": { zh: "锅气十足 · 速度激情 · 品质如一", en: "Full Wok Hei · Fast Pace · Consistent Quality", my: "အိုးငွေ့အရသာပြည့်ဝခြင်း · မြန်ဆန်သွက်လက်ခြင်း · အရည်အသွေးတစ်သမတ်တည်းရှိခြင်း" },
  "严禁出品夹生或烧焦严重 / 严禁在炉台吸烟": { zh: "严禁出品夹生或烧焦严重 / 严禁在炉台吸烟", en: "No undercooked or severely burnt food / No smoking at stove", my: "မကျက်တကျက်ဖြစ်သော သို့မဟုတ် အလွန်တူးနေသော ဟင်းပွဲများကို ပေးပို့ခြင်း သို့မဟုတ် မီးဖိုအနီးတွင် ဆေးလိပ်သောက်ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "炭火火力变弱": { zh: "炭火火力变弱", en: "Charcoal heat weakening", my: "မီးသွေးမီးအား လျော့နည်းသွားခြင်း" },
  "指挥马王(Commis)立即加炭并开大风机。若来不及，先用备用煤气炉顶替，确保不断供。": { zh: "指挥马王(Commis)立即加炭并开大风机。若来不及，先用备用煤气炉顶替，确保不断供。", en: "Instruct Commis to add charcoal and boost blower. Use backup gas stove if urgent.", my: "မီးသွေးထပ်ထည့်ရန်နှင့် လေမှုတ်စက်အားမြှင့်ရန် ဝန်ထမ်းကို ချက်ချင်းခိုင်းပါ၊ မမီပါက အရန်ဂတ်စ်မီးဖိုကို သုံး၍ ချက်ချင်းချက်ပြုတ်ပါ၊ ဟင်းပွဲပြတ်တောက်မှု မရှိစေရန် လုပ်ဆောင်ပါ။" },
  "单子突然爆满 (高峰期)": { zh: "单子突然爆满 (高峰期)", en: "Sudden influx of orders (Peak)", my: "အော်ဒါများ ရုတ်တရက် အလွန်များပြားလာခြင်း (အလုပ်အရှုပ်ဆုံးအချိန်)" },
  "保持冷静，按单顺序炒，可以一次炒 2-3 份同款面，但严禁一次炒太多导致味道变差。": { zh: "保持冷静，按单顺序炒，可以一次炒 2-3 份同款面，但严禁一次炒太多导致味道变差。", en: "Stay calm, follow sequence. Can fry 2-3 portions together, but do not fry too many and ruin taste.", my: "စိတ်အေးအေးထားပြီး မှာယူမှုအစီအစဉ်အတိုင်း ချက်ပါ၊ တူညီသောအော်ဒါကို တစ်ကြိမ်လျှင် ၂-၃ ပွဲ စုပေါင်းချက်နိုင်သော်လည်း အရသာပျက်စီးနိုင်သဖြင့် အလွန်အကျွံ စုပေါင်းချက်ခြင်းကို တားမြစ်သည်။" },
  "发现面条发酸": { zh: "发现面条发酸", en: "Noodles taste sour", my: "ခေါက်ဆွဲများ ချဉ်နေသည်ကို တွေ့ရှိရခြင်း" },
  "立即停止使用该批次面条，整锅倒掉，绝不侥幸出餐。": { zh: "立即停止使用该批次面条，整锅倒掉，绝不侥幸出餐。", en: "Stop using batch immediately. Discard the whole wok. Do not serve.", my: "ထိုခေါက်ဆွဲများကို သုံးစွဲခြင်း ချက်ချင်းရပ်တန့်ပြီး အားလုံးကို စွန့်ပစ်ပါ၊ ဧည့်သည်ကို ပေးပို့ခြင်း လုံးဝမပြုရ။" },
  "负责汤面类 (罗面/滑蛋河) 制作": { zh: "负责汤面类 (罗面/滑蛋河) 制作", en: "Handle noodle soups (Lor Mee/Wat Tan Hor)", my: "[MY] Handle noodle soups (Lor Mee/Wat Tan Hor)" },
  "协助头手备料 (抓面/配菜)": { zh: "协助头手备料 (抓面/配菜)", en: "Assist Head Chef (Grab noodles/sides)", my: "[MY] Assist Head Chef (Grab noodles/sides)" },
  "管理炸炉 (炸鸡翅/炸五香)": { zh: "管理炸炉 (炸鸡翅/炸五香)", en: "Manage Fryer (Wings/Ngo Hiang)", my: "[MY] Manage Fryer (Wings/Ngo Hiang)" },
  "保持炉台卫生": { zh: "保持炉台卫生", en: "Maintain stove cleanliness", my: "[MY] Maintain stove cleanliness" },
  "配合默契 · 补位及时 · 学习进取": { zh: "配合默契 · 补位及时 · 学习进取", en: "Good teamwork · Timely backup · Proactive learning", my: "နားလည်မှုရှိရှိ ပူးပေါင်းဆောင်ရွက်ခြင်း · အချိန်မီကူညီခြင်း · စဉ်ဆက်မပြတ်သင်ယူခြင်း" },
  "严禁擅自离岗导致炉台无人": { zh: "严禁擅自离岗导致炉台无人", en: "No leaving stove unattended", my: "ခွင့်ပြုချက်မရှိဘဲ မီးဖိုနေရာမှ ထွက်ခွာပြီး မီးဖိုတွင် လူမရှိဘဲထားခြင်းကို လုံးဝတားမြစ်သည်။" },
  "头手忙不过来": { zh: "头手忙不过来", en: "Head Chef overwhelmed", my: "စားဖိုမှူးကြီး အလွန်အလုပ်ရှုပ်နေခြင်း" },
  "主动接过简单的炒单 (如炒饭)，或帮头手提前烫面，减轻其负担。": { zh: "主动接过简单的炒单 (如炒饭)，或帮头手提前烫面，减轻其负担。", en: "Take over simple items (e.g. Fried Rice) or blanch noodles to relieve pressure.", my: "ရိုးရှင်းသောအော်ဒါများကို (ဥပမာ- ထမင်းကြော်) ကူညီချက်ပြုတ်ပါ၊ သို့မဟုတ် စားဖိုမှူးကြီးအတွက် ခေါက်ဆွဲများကို ကြိုတင်ပြုတ်ပေးပြီး ဝန်ထုပ်ဝန်ပိုးကို လျှော့ချပေးပါ။" },
  "炸鸡翅没熟": { zh: "炸鸡翅没熟", en: "Fried wings undercooked", my: "ကြက်တောင်ပံကြော် မကျက်ခြင်း" },
  "严格遵守定时器时间，出锅前用探针检查。没熟的必须重炸，不能出给客人。": { zh: "严格遵守定时器时间，出锅前用探针检查。没熟的必须重炸，不能出给客人。", en: "Follow timer strictly. Check with thermometer. Must re-fry if undercooked.", my: "အချိန်သတ်မှတ်ချက်ကို တိကျစွာလိုက်နာပါ၊ အိုးမှမထုတ်မီ အပူချိန်တိုင်းတံဖြင့် စစ်ဆေးပါ၊ မကျက်ပါက ပြန်လည်ကြော်ရမည်ဖြစ်ပြီး ဧည့်သည်ကို ပေးပို့ခြင်း မပြုရ။" },
  "负责普通炒锅 (炒饭/马来风光)": { zh: "负责普通炒锅 (炒饭/马来风光)", en: "Handle standard Wok (Fried Rice/Kangkung)", my: "[MY] Handle standard Wok (Fried Rice/Kangkung)" },
  "协助备料": { zh: "协助备料", en: "Assist prep", my: "[MY] Assist prep" },
  "炉台清洁": { zh: "炉台清洁", en: "Stove Cleaning", my: "[MY] Stove Cleaning" },
  "收档清洁": { zh: "收档清洁", en: "Closing Cleaning", my: "[MY] Closing Cleaning" },
  "标准统一 · 出品稳定": { zh: "标准统一 · 出品稳定", en: "Unified Standard · Stable Output", my: "စံနှုန်းတစ်သမတ်တည်းရှိခြင်း · ဟင်းပွဲအရသာ တည်ငြိမ်ခြင်း" },
  "严禁生熟不分 / 严禁出品夹生": { zh: "严禁生熟不分 / 严禁出品夹生", en: "No mixing raw/cooked / No undercooked food", my: "အစိမ်းနှင့် အကျက်ကို ရောနှောကိုင်တွယ်ခြင်း သို့မဟုတ် မကျက်သောဟင်းပွဲများကို ပေးပို့ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "客人投诉咸淡": { zh: "客人投诉咸淡", en: "Customer complains about seasoning", my: "ဧည့်သည်မှ အရသာပေါ့ခြင်း/ငန်ခြင်းကို တိုင်ကြားခြင်း" },
  "立即重做，并自我检查调料比例是否按SOP执行。": { zh: "立即重做，并自我检查调料比例是否按SOP执行。", en: "Remake immediately, self-check if SOP ratios were followed.", my: "ချက်ချင်း အသစ်ပြန်ချက်ပေးပါ၊ ၎င်းအပြင် ဆော့စ်အချိုးအစားကို စံနှုန်းအတိုင်း ထည့်သွင်းခြင်းရှိမရှိ မိမိကိုယ်တိုင် ပြန်လည်စစ်ဆေးပါ။" },
  "饭太湿炒不散": { zh: "饭太湿炒不散", en: "Rice too wet to fry", my: "ထမင်းအလွန်ပျော့သဖြင့် ကြော်ရာတွင် ကပ်နေခြင်း" },
  "通知占板注意煮饭水量，或者使用隔夜饭。尽力用大火将水分炒干。": { zh: "通知占板注意煮饭水量，或者使用隔夜饭。尽力用大火将水分炒干。", en: "Tell cutter to check rice water level. Use overnight rice. Use high heat to dry.", my: "ထမင်းချက်ရာတွင် ရေပမာဏကို သတိပြုရန် ချက်ပြုတ်သူကို အသိပေးပါ၊ သို့မဟုတ် ရေခဲသေတ္တာထဲရှိ ထမင်းအေးကို အသုံးပြုပါ၊ မီးအားပြင်းပြင်းဖြင့် ရေဓာတ်ခြောက်သွေ့အောင် ကြိုးစားကြော်ပါ။" },
  "每日猪肉/鸡肉/海鲜切割与腌制": { zh: "每日猪肉/鸡肉/海鲜切割与腌制", en: "Daily meat/seafood cutting & marinating", my: "[MY] Daily meat/seafood cutting & marinating" },
  "蔬菜清洗与切配": { zh: "蔬菜清洗与切配", en: "Veggie washing & cutting", my: "[MY] Veggie washing & cutting" },
  "管理冰箱库存 (FIFO 先进先出)": { zh: "管理冰箱库存 (FIFO 先进先出)", en: "Manage fridge stock (FIFO)", my: "[MY] Manage fridge stock (FIFO)" },
  "根据预估销量备足料": { zh: "根据预估销量备足料", en: "Prepare enough stock based on forecasts", my: "[MY] Prepare enough stock based on forecasts" },
  "刀工精准 · 减少损耗 · 新鲜卫生": { zh: "刀工精准 · 减少损耗 · 新鲜卫生", en: "Accurate Knife Skills · Less Waste · Fresh & Hygienic", my: "ဓားအသုံးပြုမှု တိကျခြင်း · ကုန်ဆုံးမှုကို လျှော့ချခြင်း · လတ်ဆတ်သန့်ရှင်းခြင်း" },
  "严禁生熟砧板混用 (食品安全红线)": { zh: "严禁生熟砧板混用 (食品安全红线)", en: "No mixing raw/cooked boards (Food Safety Red Line)", my: "အသားစိမ်းနှင့် အကျက်စင်း砧板ကို ရောနှောအသုံးပြုခြင်း (စားသောက်ကုန်ဘေးကင်းရေးစည်းကမ်း) လုံးဝမပြုရ။" },
  "切肉时不小心切到手": { zh: "切肉时不小心切到手", en: "Accidentally cut hand", my: "အသားလှီးစဉ် မတော်တဆ လက်ကို ဓားရှမိခြင်း" },
  "立即停止工作，按压止血，对伤口进行包扎并戴上手套。严重者立即就医。": { zh: "立即停止工作，按压止血，对伤口进行包扎并戴上手套。严重者立即就医。", en: "Stop working, apply pressure, bandage, wear glove. Seek doctor if severe.", my: "အလုပ်ကို ချက်ချင်းရပ်တန့်ပါ၊ သွေးတိတ်အောင် ဖိထားပါ၊ ဒဏ်ရာကို ပတ်တီးစီးပြီး လက်အိတ်စွပ်ပါ၊ ပြင်းထန်ပါက ဆေးရုံသို့ ချက်ချင်းသွားပါ။" },
  "发现冰箱里的肉有异味": { zh: "发现冰箱里的肉有异味", en: "Meat in fridge smells bad", my: "ရေခဲသေတ္တာထဲရှိ အသားများ အနံ့ဆိုးထွက်နေသည်ကို တွေ့ရှိခြင်း" },
  "立即隔离该批次肉类并上报总厨，禁止使用。": { zh: "立即隔离该批次肉类并上报总厨，禁止使用。", en: "Isolate the meat, report to Head Chef, do not use.", my: "ထိုအသားများကို သီးခြားခွဲထုတ်ထားပြီး စားဖိုမှူးချုပ်ထံ ချက်ချင်းတင်ပြပါ၊ သုံးစွဲခြင်းကို လုံးဝတားမြစ်သည်။" },
  "备料不足": { zh: "备料不足", en: "Insufficient Prep", my: "ပါဝင်ပစ္စည်း ပြင်ဆင်မှု မလုံလောက်ခြင်း" },
  "提前 1 小时预警，通知马王去补货或现场紧急切配。": { zh: "提前 1 小时预警，通知马王去补货或现场紧急切配。", en: "Warn 1 hour ahead, tell Commis to restock or chop urgently.", my: "၁ နာရီကြိုတင်သတိပေးပါ၊ ဝန်ထမ်းကို ပစ္စည်းသွားယူခိုင်းပါ သို့မဟုတ် ချက်ချင်း အရေးပေါ်လှီးဖြတ်ပြင်ဆင်ပါ။" },
  "负责炸炉出品 (五香/鸡翅)": { zh: "负责炸炉出品 (五香/鸡翅)", en: "Handle Fryer (Ngo Hiang/Wings)", my: "[MY] Handle Fryer (Ngo Hiang/Wings)" },
  "菜品装饰与摆盘": { zh: "菜品装饰与摆盘", en: "Garnish & Plating", my: "[MY] Garnish & Plating" },
  "配合头手出菜": { zh: "配合头手出菜", en: "Coordinate serving with Head Chef", my: "[MY] Coordinate serving with Head Chef" },
  "管理酱料碟与餐具": { zh: "管理酱料碟与餐具", en: "Manage sauce dishes & cutlery", my: "[MY] Manage sauce dishes & cutlery" },
  "美观 · 速度 · 把关": { zh: "美观 · 速度 · 把关", en: "Aesthetic · Speed · Gatekeeping", my: "လှပသပ်ရပ်ခြင်း · မြန်ဆန်ခြင်း · နောက်ဆုံးစစ်ဆေးခြင်း" },
  "严禁出品盘边有油渍 / 严禁徒手接触熟食": { zh: "严禁出品盘边有油渍 / 严禁徒手接触熟食", en: "No oily plate edges / No bare hands on cooked food", my: "ပန်းကန်ဘေးတွင် ဆီဂျီးပေကျံနေခြင်း သို့မဟုတ် လက်ဗလာဖြင့် အကျက်များကို ကိုင်တွယ်ခြင်းကို လုံးဝတားမြစ်သည်။" },
  "炸炉油温过高冒烟": { zh: "炸炉油温过高冒烟", en: "Fryer oil smoking too hot", my: "ဆီအပူချိန် အလွန်မြင့်မားသဖြင့် မီးခိုးထွက်ခြင်း" },
  "立即关火，放入少量冷油降温。严禁泼水！": { zh: "立即关火，放入少量冷油降温。严禁泼水！", en: "Turn off heat, add cold oil. DO NOT add water!", my: "မီးကို ချက်ချင်းပိတ်ပါ၊ အပူချိန်ကျဆင်းစေရန် ဆီအေးအနည်းငယ်ထည့်ပါ၊ ရေလောင်းခြင်း လုံးဝမပြုလုပ်ရ။" },
  "出菜口积压": { zh: "出菜口积压", en: "Food backlog at pass", my: "ဟင်းပွဲထုတ်ရာနေရာတွင် ဟင်းပွဲများ ပုံနေခြင်း" },
  "大声呼叫传菜员 (Runner) 取餐，优先处理容易变凉的菜品。": { zh: "大声呼叫传菜员 (Runner) 取餐，优先处理容易变凉的菜品。", en: "Shout for Runner. Prioritize dishes that get cold easily.", my: "ဟင်းပွဲသယ်ဆောင်သူကို (Runner) အော်ခေါ်၍ ယူခိုင်းပါ၊ အေးလွယ်သောဟင်းပွဲများကို ဦးစားပေးပို့ဆောင်ခိုင်းပါ။" },
  "连接切配台与炉台，传递食材": { zh: "连接切配台与炉台，传递食材", en: "Link prep station and stove, pass ingredients", my: "[MY] Link prep station and stove, pass ingredients" },
  "负责出菜口的最后检查 (擦盘边)": { zh: "负责出菜口的最后检查 (擦盘边)", en: "Final check at pass (wipe plate edges)", my: "[MY] Final check at pass (wipe plate edges)" },
  "紧急补货 (面条/猪油/酱料)": { zh: "紧急补货 (面条/猪油/酱料)", en: "Urgent restock (Noodles/Lard/Sauce)", my: "[MY] Urgent restock (Noodles/Lard/Sauce)" },
  "保持出菜通道畅通": { zh: "保持出菜通道畅通", en: "Keep pass channel clear", my: "[MY] Keep pass channel clear" },
  "响应迅速 · 眼观六路 · 随叫随到": { zh: "响应迅速 · 眼观六路 · 随叫随到", en: "Fast Response · Alert · Always on Call", my: "လျင်မြန်စွာတုံ့ပြန်ခြင်း · အခြေအနေကို ကောင်းစွာအကဲခတ်ခြင်း · ခေါ်လျှင်ချက်ချင်းရောက်ရှိခြင်း" },
  "严禁传递错误食材 / 严禁在厨房奔跑滑倒": { zh: "严禁传递错误食材 / 严禁在厨房奔跑滑倒", en: "No passing wrong ingredients / No running to prevent slips", my: "ပါဝင်ပစ္စည်းအမှားများ ပေးပို့ခြင်း သို့မဟုတ် မီးဖိုချောင်အတွင်း ပြေးလွှား၍ ချော်လဲခြင်းကို လုံးဝတားမြစ်သည်။" },
  "炉台突然说没面了": { zh: "炉台突然说没面了", en: "Stove suddenly out of noodles", my: "မီးဖိုမှ ခေါက်ဆွဲမရှိတော့ကြောင်း ရုတ်တရက်ပြောလာခြင်း" },
  "立即跑步去冷房取面，如果冷房也没了，马上通报总厨并去最近的超市购买(经批准)。": { zh: "立即跑步去冷房取面，如果冷房也没了，马上通报总厨并去最近的超市购买(经批准)。", en: "Run to chiller. If empty, tell Head Chef and buy from nearest mart (if approved).", my: "အအေးခန်းသို့ အမြန်ပြေးသွား၍ ယူပါ၊ အအေးခန်းတွင်လည်း မရှိပါက စားဖိုမှူးချုပ်ထံ ချက်ချင်းတင်ပြပြီး ခွင့်ပြုချက်ဖြင့် အနီးဆုံးစူပါမားကတ်သို့ သွားရောက်ဝယ်ယူပါ။" },
  "传菜员端错了菜": { zh: "传菜员端错了菜", en: "Runner took wrong dish", my: "စားပွဲထိုးမှ ဟင်းပွဲမှားယူသွားခြင်း" },
  "在出菜口就要核对单号，发现错误立即拦截，避免送错给客人。": { zh: "在出菜口就要核对单号，发现错误立即拦截，避免送错给客人。", en: "Check ticket at pass, stop them immediately to prevent wrong serving.", my: "ဟင်းထုတ်ရာနေရာတွင် မှာယူမှုနံပါတ်ကို တိုက်ဆိုင်စစ်ဆေးပါ၊ မှားယွင်းပါက ချက်ချင်းတားဆီးပါ၊ ဧည့်သည်ထံ မှားယွင်းရောက်ရှိခြင်းကို ရှောင်ရှားရန်။" },
  "地面有油渍": { zh: "地面有油渍", en: "Oil stain on floor", my: "ကြမ်းပြင်ပေါ်တွင် ဆီများပေကျံနေခြင်း" },
  "立即拿拖把清理，防止厨师端热锅时滑倒。": { zh: "立即拿拖把清理，防止厨师端热锅时滑倒。", en: "Mop immediately to prevent chefs slipping with hot woks.", my: "စားဖိုမှူးများ အိုးပူများသယ်ဆောင်စဉ် ချော်လဲခြင်းမှ ကာကွယ်ရန် ကြမ်းတိုက်ဖတ်ဖြင့် ချက်ချင်းရှင်းလင်းပါ။" },
  "打荷辅助": { zh: "打荷辅助", en: "Plating Assist", my: "[MY] Plating Assist" },
  "补货搬运": { zh: "补货搬运", en: "Restock & Carry", my: "[MY] Restock & Carry" },
  "洗碗支援": { zh: "洗碗支援", en: "Dishwashing Backup", my: "[MY] Dishwashing Backup" },
  "机动灵活": { zh: "机动灵活", en: "Flexible & Mobile", my: "သွက်လက်လျင်မြန်စွာ ကူညီခြင်း" },
  "严禁垃圾过夜": { zh: "严禁垃圾过夜", en: "No overnight trash", my: "အမှိုက်များကို ညသိပ်ထားခြင်းကို လုံးဝတားမြစ်သည်။" },
  "垃圾桶满了": { zh: "垃圾桶满了", en: "Trash bin full", my: "အမှိုက်ပုံး ပြည့်နေခြင်း" },
  "立即打包换袋，不要等溢出来才处理。": { zh: "立即打包换袋，不要等溢出来才处理。", en: "Tie up and replace immediately. Don't wait till overflow.", my: "အမှိုက်အိတ်ကို ချက်ချင်းချည်နှောင်ပြီး အသစ်လဲပါ၊ အမှိုက်များလျှံထွက်လာသည်အထိ မစောင့်ပါနှင့်။" },
  "清洗所有碗盘筷子 (三槽洗涤法: 去渣-清洗-消毒)": { zh: "清洗所有碗盘筷子 (三槽洗涤法: 去渣-清洗-消毒)", en: "Wash all dishware (3-sink: Scrape-Wash-Sanitize)", my: "[MY] Wash all dishware (3-sink: Scrape-Wash-Sanitize)" },
  "操作洗碗机 (如有)": { zh: "操作洗碗机 (如有)", en: "Operate dishwasher (if any)", my: "[MY] Operate dishwasher (if any)" },
  "清理厨余垃圾与隔油池 (Grease Trap)": { zh: "清理厨余垃圾与隔油池 (Grease Trap)", en: "Clear food waste & Grease Trap", my: "[MY] Clear food waste & Grease Trap" },
  "保持洗碗间干燥卫生": { zh: "保持洗碗间干燥卫生", en: "Keep dish area dry & clean", my: "[MY] Keep dish area dry & clean" },
  "卫生 · 速度 · 破损率低": { zh: "卫生 · 速度 · 破损率低", en: "Hygiene · Speed · Low Breakage", my: "သန့်ရှင်းမှု · မြန်ဆန်မှု · ပန်းကန်ကွဲအက်မှုနှုန်းနည်းခြင်း" },
  "严禁使用破损餐具 / 严禁地面积水 (防滑)": { zh: "严禁使用破损餐具 / 严禁地面积水 (防滑)", en: "No broken dishes / No puddles (Slip prevention)", my: "ကွဲအက်နေသော ပန်းကန်များကို အသုံးပြုခြင်း သို့မဟုတ် ကြမ်းပြင်တွင် ရေတင်ကျန်စေခြင်းကို လုံးဝတားမြစ်သည်။" },
  "碗盘堆积如山": { zh: "碗盘堆积如山", en: "Mountain of dishes", my: "ပန်းကန်များ တောင်လိုပုံနေခြင်း" },
  "优先清洗急需的餐具 (如: 筷子/汤匙/面盘)，请求厨房帮手支援。": { zh: "优先清洗急需的餐具 (如: 筷子/汤匙/面盘)，请求厨房帮手支援。", en: "Prioritize urgent items (Chopsticks/Spoons/Plates), ask for backup.", my: "အရေးတကြီးလိုအပ်သော 餐具 များကို (ဥပမာ- ဇွန်း/ခက်ရင်း/ခေါက်ဆွဲပန်းကန်) ဦးစားပေးဆေးကြောပါ၊ မီးဖိုချောင်ကူညီသူကို ဝိုင်းကူခိုင်းပါ။" },
  "猪油太厚洗不干净": { zh: "猪油太厚洗不干净", en: "Lard too thick to wash", my: "ဝက်ဆီများ အလွန်ထူသဖြင့် ဆေးကြောရ ခက်ခဲခြင်း" },
  "使用热水浸泡去油，并适当增加洗洁精用量，确保无油腻感。": { zh: "使用热水浸泡去油，并适当增加洗洁精用量，确保无油腻感。", en: "Soak in hot water, use more soap, ensure no greasy feel.", my: "ရေနွေးဖြင့် စိမ်၍ ဆီများကို ဖယ်ရှားပါ၊ ဆပ်ပြာဆီ ပမာဏကို သင့်တင့်စွာ တိုးမြှင့်သုံးစွဲပြီး ဆီဂျီးများ လုံးဝမကျန်ရှိစေရန် လုပ်ဆောင်ပါ။" },
  "打破盘子": { zh: "打破盘子", en: "Broke a plate", my: "ပန်းကန် ကွဲသွားခြင်း" },
  "立即清理碎片，用报纸包好再丢入垃圾桶，防止割伤倒垃圾的人。": { zh: "立即清理碎片，用报纸包好再丢入垃圾桶，防止割伤倒垃圾的人。", en: "Clean pieces, wrap in newspaper before trashing to protect handlers.", my: "ကွဲအက်စများကို ချက်ချင်းရှင်းလင်းပါ၊ အမှိုက်ပစ်သူများကို မရှမိစေရန် သတင်းစာဖြင့် သေချာထုပ်ပိုးပြီးမှ အမှိုက်ပုံးထဲသို့ ထည့်ပါ။" },
  "熬煮金莲记招牌凉茶 (Air Mata Kucing)": { zh: "熬煮金莲记招牌凉茶 (Air Mata Kucing)", en: "Brew Signature Herbal Tea (Air Mata Kucing)", my: "[MY] Brew Signature Herbal Tea (Air Mata Kucing)" },
  "制作各类冷热饮品": { zh: "制作各类冷热饮品", en: "Make hot & cold drinks", my: "[MY] Make hot & cold drinks" },
  "管理吧台水果与罐装饮料库存": { zh: "管理吧台水果与罐装饮料库存", en: "Manage bar fruits & canned drinks stock", my: "[MY] Manage bar fruits & canned drinks stock" },
  "清洗杯具": { zh: "清洗杯具", en: "Wash glasses", my: "[MY] Wash glasses" },
  "出品稳定 · 速度 · 控成本": { zh: "出品稳定 · 速度 · 控成本", en: "Stable Output · Speed · Cost Control", my: "အရသာတစ်သမတ်တည်းရှိခြင်း · မြန်ဆန်ခြင်း · ကုန်ကျစရိတ်ထိန်းချုပ်ခြင်း" },
  "严禁使用变质水果 / 严禁偷吃吧台零食": { zh: "严禁使用变质水果 / 严禁偷吃吧台零食", en: "No rotten fruits / No eating bar snacks", my: "မလတ်ဆတ်သော သစ်သီးများကို သုံးစွဲခြင်း သို့မဟုတ် ဘားရှိမုန့်များကို ခွင့်ပြုချက်မရှိဘဲ စားသုံးခြင်းကို လုံးဝတားမြစ်သည်။" },
  "凉茶卖完了": { zh: "凉茶卖完了", en: "Herbal Tea sold out", my: "တိုင်းရင်းဆေးအေးရည် ကုန်သွားခြင်း" },
  "高峰期前必须确保留有备用凉茶。若断货，礼貌推荐薏米水或中国茶。": { zh: "高峰期前必须确保留有备用凉茶。若断货，礼貌推荐薏米水或中国茶。", en: "Keep backup before peak. If out, politely recommend Barley or Chinese Tea.", my: "အလုပ်အရှုပ်ဆုံးအချိန်မတိုင်မီ အရန်涼茶 ရှိနေကြောင်း သေချာပါစေ။ ပြတ်လပ်သွားပါက ယဉ်ကျေးပျူငှာစွာဖြင့် 薏米水 သို့မဟုတ် တရုတ်လက်ဖက်ရည်ကို ညွှန်းဆိုပေးပါ။" },
  "冰块机故障或冰块不够": { zh: "冰块机故障或冰块不够", en: "Ice machine broken / out of ice", my: "ရေခဲစက်ချို့ယွင်းခြင်း သို့မဟုတ် ရေခဲမလုံလောက်ခြင်း" },
  "立即联系冰块供应商送货，或安排人去便利店买冰应急。": { zh: "立即联系冰块供应商送货，或安排人去便利店买冰应急。", en: "Contact ice supplier or send someone to mart to buy ice.", my: "ရေခဲပေးသွင်းသူကို ချက်ချင်းဆက်သွယ်ပါ၊ သို့မဟုတ် အရေးပေါ်အဖြစ် စတိုးဆိုင်သို့သွား၍ ရေခဲဝယ်ခိုင်းပါ။" },
  "客人投诉饮料太甜": { zh: "客人投诉饮料太甜", en: "Customer complains drink too sweet", my: "ဧည့်သည်မှ ဖျော်ရည် အလွန်ချိုကြောင်း တိုင်ကြားခြင်း" },
  "无条件重做一杯少糖的给客人，并检查糖浆泵的刻度。": { zh: "无条件重做一杯少糖的给客人，并检查糖浆泵的刻度。", en: "Remake less sweet unconditionally. Check syrup pump.", my: "အခြေအနေမရှိဘဲ သကြားလျှော့ထားသော အသစ်တစ်ခွက် ပြန်လည်ဖျော်ပေးပါ၊ အပြင် သကြားရည်စုပ်စက်၏ အတိုင်းအတာကို စစ်ဆေးပါ။" },
  "基础备料 (剥蒜/洗菜)": { zh: "基础备料 (剥蒜/洗菜)", en: "Basic prep (Peel garlic/Wash veg)", my: "[MY] Basic prep (Peel garlic/Wash veg)" },
  "传递食材": { zh: "传递食材", en: "Pass ingredients", my: "[MY] Pass ingredients" },
  "学习烹饪技巧": { zh: "学习烹饪技巧", en: "Learn cooking skills", my: "[MY] Learn cooking skills" },
  "勤奋与好学": { zh: "勤奋与好学", en: "Hardworking & Eager to learn", my: "ကြိုးစားအားထုတ်ခြင်းနှင့် သင်ယူလိုစိတ်ရှိခြင်း" },
  "严禁操作不熟悉的设备 (安全第一)": { zh: "严禁操作不熟悉的设备 (安全第一)", en: "No operating unfamiliar equipment (Safety First)", my: "မကျွမ်းကျင်သော စက်ပစ္စည်းများကို စမ်းသပ်မကိုင်တွယ်ရ (ဘေးကင်းရေးကို ဦးစားပေးရန်)။" },
  "主动问头手或占板：'有什么我可以先准备的？'不要发呆。": { zh: "主动问头手或占板：'有什么我可以先准备的？'不要发呆。", en: "Ask Chefs: 'What can I prep first?'. Don't idle.", my: "[MY] Ask Chefs: 'What can I prep first?'. Don't idle." },
  "被师傅骂": { zh: "被师傅骂", en: "Scolded by master", my: "ဆရာမှ ဆူပူကြိမ်းမောင်းခြင်း" },
  "虚心接受，记住错误点，下次不再犯。不要顶嘴。": { zh: "虚心接受，记住错误点，下次不再犯。不要顶嘴。", en: "Accept humbly, remember mistakes. Don't talk back.", my: "စိတ်နှိမ့်ချစွာ ခံယူပါ၊ မိမိ၏အမှားကို မှတ်သားထားပြီး နောက်တစ်ကြိမ် မမှားစေရန် သတိပြုပါ၊ ပြန်လည်ပြောဆိုခြင်း မပြုရ။" },
  "Strategic Planning": { zh: "Strategic Planning", en: "Strategic Planning", my: "[MY] Strategic Planning" },
  "Financial Control": { zh: "Financial Control", en: "Financial Control", my: "[MY] Financial Control" },
  "Business Development": { zh: "Business Development", en: "Business Development", my: "[MY] Business Development" },
  "Ownership": { zh: "Ownership", en: "Ownership", my: "[MY] Ownership" },
  "No Limits": { zh: "No Limits", en: "No Limits", my: "[MY] No Limits" },

  // System-generated SOP tasks that are visible on the staff workspace.
  "提交每日结算单": { zh: "提交每日结算单", en: "Submit Daily Settlement", my: "နေ့စဉ် ငွေစာရင်းရှင်းတမ်းကို တင်သွင်းရန်" },
  "核对钱箱现金": { zh: "核对钱箱现金", en: "Verify Cash Drawer Balance", my: "ငွေရှင်းကောင်တာရှိ ငွေသားကို စစ်ဆေးရန်" },
  "厨房库存盘点": { zh: "厨房库存盘点", en: "Kitchen Stock Count", my: "မီးဖိုချောင် ပစ္စည်းလက်ကျန်ကို ရေတွက်ရန်" },
  "检查食材保质期": { zh: "检查食材保质期", en: "Check Ingredient Expiry Dates", my: "ပါဝင်ပစ္စည်းများ၏ သက်တမ်းကုန်ရက်ကို စစ်ဆေးရန်" },
  "水吧库存盘点": { zh: "水吧库存盘点", en: "Beverage Station Stock Count", my: "အချိုရည်ကောင်တာ ပစ္စည်းလက်ကျန်ကို ရေတွက်ရန်" },
  "检查水果新鲜度": { zh: "检查水果新鲜度", en: "Check Fruit Freshness", my: "သစ်သီးများ၏ လတ်ဆတ်မှုကို စစ်ဆေးရန်" },
  "凉茶包存量检查": { zh: "凉茶包存量检查", en: "Check Herbal Tea Pack Stock", my: "ဆေးဖက်ဝင်လက်ဖက်ခြောက်အထုပ် လက်ကျန်ကို စစ်ဆေးရန်" },
  "后勤物资盘点": { zh: "后勤物资盘点", en: "General Supplies Stock Count", my: "အထွေထွေသုံးပစ္စည်း လက်ကျန်ကို ရေတွက်ရန်" },
  "打包盒存量检查": { zh: "打包盒存量检查", en: "Check Takeaway Container Stock", my: "ပါဆယ်ဘူး လက်ကျန်ကို စစ်ဆေးရန်" },
  "煤气桶剩余量记录": { zh: "煤气桶剩余量记录", en: "Record Remaining Gas Cylinder Levels", my: "ဓာတ်ငွေ့အိုး လက်ကျန်ပမာဏကို မှတ်တမ်းတင်ရန်" },
  "木炭库存盘点": { zh: "木炭库存盘点", en: "Charcoal Stock Count", my: "မီးသွေးလက်ကျန်ကို ရေတွက်ရန်" },

  // Handbook content that previously fell through to Translation unavailable.
  "出品灵魂与厨房纪律": { zh: "出品灵魂与厨房纪律", en: "Food Quality and Kitchen Discipline", my: "အစားအသောက်အရည်အသွေးနှင့် မီးဖိုချောင်စည်းကမ်း" },
  "严禁使用变质食材 / 严禁私自更改秘制酱料配方": { zh: "严禁使用变质食材 / 严禁私自更改秘制酱料配方", en: "Never use spoiled ingredients or alter secret sauce recipes without approval", my: "ပုပ်သိုးသော ပါဝင်ပစ္စည်းများ မသုံးရ၊ လျှို့ဝှက်ဆော့စ်ဖော်မြူလာကို ခွင့်ပြုချက်မရှိဘဲ မပြောင်းရ" },
  "🕒 考勤铁律：楼面是下午 3:30，厨房是下午 3:00 准时打卡开铺。迟到超过 15 分钟扣除一小时的薪资，并且对本身的 KPI 有影响。": { zh: "🕒 考勤铁律：楼面是下午 3:30，厨房是下午 3:00 准时打卡开铺。迟到超过 15 分钟扣除一小时的薪资，并且对本身的 KPI 有影响。", en: "🕒 Attendance: Floor staff must clock in by 3:30 PM and kitchen staff by 3:00 PM. Being over 15 minutes late results in a one-hour pay deduction and affects your KPI.", my: "🕒 တက်ရောက်မှုစည်းကမ်း- စားပွဲထိုးဝန်ထမ်းများ ညနေ ၃:၃၀ နှင့် မီးဖိုချောင်ဝန်ထမ်းများ ညနေ ၃:၀၀ မတိုင်မီ အချိန်မီ အလုပ်ဝင်မှတ်တမ်းတင်ရမည်။ ၁၅ မိနစ်ကျော် နောက်ကျပါက တစ်နာရီစာ လစာဖြတ်တောက်ပြီး KPI ကိုလည်း ထိခိုက်မည်။" },
  "📱 手机管制：手机必须静音和严禁边工作边玩手机。": { zh: "📱 手机管制：手机必须静音和严禁边工作边玩手机。", en: "📱 Phone Use: Keep phones on silent. Using a phone while working is strictly prohibited.", my: "📱 ဖုန်းအသုံးပြုမှု- ဖုန်းကို အသံပိတ်ထားရမည်။ အလုပ်လုပ်နေစဉ် ဖုန်းအသုံးပြုခြင်းကို လုံးဝတားမြစ်သည်။" },
  "🧼 仪容仪表：必须穿戴整齐制服、围裙、包鞋。厨房人员必须戴帽子，长发需盘起。": { zh: "🧼 仪容仪表：必须穿戴整齐制服、围裙、包鞋。厨房人员必须戴帽子，长发需盘起。", en: "🧼 Grooming: Wear a neat uniform, apron, and closed-toe shoes. Kitchen staff must wear a cap, and long hair must be tied up.", my: "🧼 ဝတ်စားဆင်ယင်မှု- ယူနီဖောင်း၊ ခါးစည်းနှင့် ခြေချောင်းပိတ်ဖိနပ်ကို သပ်ရပ်စွာ ဝတ်ဆင်ရမည်။ မီးဖိုချောင်ဝန်ထမ်းများ ဦးထုပ်ဆောင်းရပြီး ဆံပင်ရှည်ကို စည်းထားရမည်။" },
  "🍜 员工用餐：仅限 16:30前 或 21:30-22:00 轮流用餐。": { zh: "🍜 员工用餐：仅限 16:30前 或 21:30-22:00 轮流用餐。", en: "🍜 Staff Meals: Take turns eating only before 4:30 PM or between 9:30 PM and 10:00 PM.", my: "🍜 ဝန်ထမ်းစားချိန်- ညနေ ၄:၃၀ မတိုင်မီ သို့မဟုတ် ည ၉:၃၀ မှ ၁၀:၀၀ အတွင်း အလှည့်ကျ စားရမည်။" },
  "🚬 吸烟规定：仅限后巷指定区域，严禁穿着围裙吸烟，回岗必须洗手漱口。": { zh: "🚬 吸烟规定：仅限后巷指定区域，严禁穿着围裙吸烟，回岗必须洗手漱口。", en: "🚬 Smoking: Smoke only in the designated back-lane area. Never smoke while wearing an apron, and wash your hands and rinse your mouth before returning to work.", my: "🚬 ဆေးလိပ်စည်းကမ်း- နောက်ဖေးလမ်းရှိ သတ်မှတ်နေရာတွင်သာ ဆေးလိပ်သောက်ရမည်။ ခါးစည်းဝတ်ထားစဉ် မသောက်ရ၊ အလုပ်ပြန်ဝင်မီ လက်ဆေးပြီး ပါးစပ်ဆေးရမည်။" },
  "🚫 安全红线：厨房地面保持干燥防滑，端热汤/铁板必须使用托盘或隔热布。": { zh: "🚫 安全红线：厨房地面保持干燥防滑，端热汤/铁板必须使用托盘或隔热布。", en: "🚫 Safety Rule: Keep kitchen floors dry and slip-free. Always use a tray or heat-resistant cloth when carrying hot soup or sizzling plates.", my: "🚫 ဘေးကင်းရေးစည်းကမ်း- မီးဖိုချောင်ကြမ်းပြင်ကို ခြောက်သွေ့၍ မချော်အောင် ထိန်းသိမ်းရမည်။ ပူသောဟင်းရည် သို့မဟုတ် သံပြားပူကို သယ်ရာတွင် ဗန်း သို့မဟုတ် အပူခံအဝတ်ကို မဖြစ်မနေ အသုံးပြုရမည်။" },
  "🌛 打烊纪律：01:30 Last Call 后不再接单，02:00 前完成所有清洁工作并经主管检查后方可离店。": { zh: "🌛 打烊纪律：01:30 Last Call 后不再接单，02:00 前完成所有清洁工作并经主管检查后方可离店。", en: "🌛 Closing Rule: Do not accept orders after the 1:30 AM last call. Complete all cleaning by 2:00 AM and leave only after a supervisor's inspection.", my: "🌛 ဆိုင်ပိတ်စည်းကမ်း- မနက် ၁:၃၀ နောက်ဆုံးအော်ဒါပြီးနောက် အော်ဒါအသစ် မလက်ခံရ။ မနက် ၂:၀၀ မတိုင်မီ သန့်ရှင်းရေးအားလုံး ပြီးစီးရပြီး ကြီးကြပ်သူ စစ်ဆေးပြီးမှသာ ပြန်နိုင်သည်။" },
  "账目精准 · 即使忙碌也要保持微笑": { zh: "账目精准 · 即使忙碌也要保持微笑", en: "Accurate Accounts · Keep Smiling Even When Busy", my: "စာရင်းတိကျမှု · အလုပ်များနေချိန်တွင်လည်း အပြုံးမပျက် ဝန်ဆောင်မှုပေးရန်" },
  "严禁私吞公款 / 严禁私自给予折扣 / 钱箱必须随时上锁": { zh: "严禁私吞公款 / 严禁私自给予折扣 / 钱箱必须随时上锁", en: "Never misappropriate company funds or give unauthorized discounts. Keep the cash drawer locked at all times.", my: "ကုမ္ပဏီငွေကို ကိုယ်ကျိုးအတွက် မသုံးရ၊ ခွင့်ပြုချက်မရှိဘဲ လျှော့ဈေးမပေးရ၊ ငွေသေတ္တာကို အမြဲသော့ခတ်ထားရမည်။" },

};

export const STAFF_MODULE_TRANSLATIONS: Record<string, {
  label: Partial<Record<StaffLang | string, string>>;
  desc: Partial<Record<StaffLang | string, string>>;
  guide?: Partial<Record<StaffLang | string, string>>;
}> = {
  'LOGBOOK': {
    label: { zh: '交接日志', en: 'Logbook Shift Handover', my: 'လွှဲပြောင်းမှတ်တမ်း (Logbook)' },
    desc: { zh: '班次异常与重大事件记录', en: 'Shift handover notes & exception logs', my: 'အဆန်းပြားဖြစ်စဉ်များနှင့် သတင်းအချက်အလက်များ' },
    guide: {
      zh: '1. 填写交接：记录本班次发生的客人投诉、设备损坏或临时调班。\n2. 查阅日志：接班员工必须查看上一班的未完成事项并确认。',
      en: '1. Handover Notes: Record guest complaints, broken tools, or shift swaps.\n2. Review Logs: Incoming staff must inspect and clear pending items.',
      my: '၁။ အစီရင်ခံစာဖြည့်ပါ- အမှားအယွင်းများ သို့မဟုတ် ဧည့်သည်တိုင်ကြားချက်များကို မှတ်တမ်းတင်ပါ။\n၂။ စစ်ဆေးပါ- တာဝန်ကျအဖွဲ့သားများသည် ယခင်ဂျူတီမှ အရာများကို စစ်ဆေးရမည်။'
    }
  },
  'EXPENSES': {
    label: { zh: '零用金报销', en: 'Petty Cash Expenses', my: 'သေးငယ်သော စရိတ်စက' },
    desc: { zh: '紧急小额采购拍单报销', en: 'Emergency minor purchases photo claim', my: 'အသေးသုံးစရိတ်များ ဓာတ်ပုံရိုက်၍ စာရင်းတင်ပြခြင်း' },
    guide: {
      zh: '1. 拍照上传：购买零星杂项（如紧急买冰块、洗洁精）后拍照发票。\n2. 填报金额：输入实际支出金额并选择科目，等待老板或经理审核。',
      en: '1. Snap Receipt: Photo receipts for urgent buys (ice, detergent).\n2. Submit Claim: Enter amount, select category, await approval.',
      my: '၁။ ဓာတ်ပုံရိုက်ပါ- အရေးပေါ်ဝယ်ယူမှု ဖြတ်ပိုင်းကို ဓာတ်ပုံရိုက်ပါ။\n၂။ စာရင်းတင်ပါ- ပမာဏထည့်ပြီး အတည်ပြုချက်စောင့်ပါ။'
    }
  },
  'EMPLOYEE_RATING': {
    label: { zh: '季度评分', en: 'Quarterly Rating', my: 'သုံးလပတ် အကဲဖြတ်ချက်' },
    desc: { zh: '员工 KPI 考核与记录', en: 'Employee KPI review & records', my: 'ဝန်ထမ်း KPI အကဲဖြတ်ချက်' },
    guide: {
      zh: '1. 查看评分：经理对员工服务、出勤、SOP完成度进行季度评分。\n2. 绩效激励：评分直接挂钩季度奖金与升职加薪参考。',
      en: '1. View Score: Managers evaluate service, attendance, and SOP compliance.\n2. Incentives: Scores directly impact bonuses and promotions.',
      my: '၁။ အကဲဖြတ်ချက်ကြည့်ပါ- မန်နေဂျာမှ ဝန်ထမ်း၏ စွမ်းဆောင်ရည်ကို အမှတ်ပေးသည်။\n၂။ ဆုကြေး- အမှတ်သည် ဆုကြေးငွေနှင့် တိုက်ရိုက်သက်ဆိုင်သည်။'
    }
  },
  'SUPPLIER_CONTACTS': {
    label: { zh: '供应商', en: 'Suppliers Directory', my: 'ပစ္စည်းပေးသွင်းသူများ' },
    desc: { zh: '联系人与进货管理', en: 'Supplier directory & procurement', my: 'ဆက်သွယ်ရန်ပုဂ္ဂိုလ်နှင့် ဝယ်ယူမှု စီမံခန့်ခွဲခြင်း' },
    guide: {
      zh: '查看各类食材、耗材供应商联系方式及送货周期。',
      en: 'View contact details and delivery lead times for all suppliers.',
      my: 'ပစ္စည်းပေးသွင်းသူများ၏ ဆက်သွယ်ရန်နှင့် ပစ္စည်းပို့ချိန်များကို ကြည့်ရှုရန်။'
    }
  },
  'INVENTORY_CHECK': {
    label: { zh: '库存盘点', en: 'Inventory Audit', my: 'ကုန်ပစ္စည်းစာရင်းစစ်ခြင်း' },
    desc: { zh: '执行盘点任务', en: 'Execute assigned inventory counts', my: 'သတ်မှတ်ထားသော ပစ္စည်းစာရင်းစစ်ခြင်းကို ဆောင်ရွက်ရန်' },
    guide: {
      zh: '按系统分配的物品进行实物盘点并提交数量。',
      en: 'Count assigned stock items physically and submit current quantities.',
      my: 'သတ်မှတ်ထားသော ပစ္စည်းများကို စနစ်တကျ ရေတွက်ပြီး စာရင်းတင်ပြပါ။'
    }
  },
  'INVENTORY_VIEW': {
    label: { zh: '库存总览', en: 'Stock Overview', my: 'ပစ္စည်းလက်ကျန် အနှစ်ချုပ်' },
    desc: { zh: '查看库存与价值', en: 'View stock levels and total value', my: 'လက်ကျန်ပမာဏနှင့် စုစုပေါင်းတန်ဖိုး ကြည့်ရှုခြင်း' },
    guide: {
      zh: '查看店内实时库存数量、预警状态及采购建议。',
      en: 'View real-time stock levels, warning alerts, and restock tips.',
      my: 'ဆိုင်တွင်း လက်ကျန်ပစ္စည်းပမာဏနှင့် သတိပေးချက်များကို ကြည့်ရှုရန်。'
    }
  },
  'AI_ASSISTANT': {
    label: { zh: 'AI 智控脑库', en: 'AI Control Brain', my: 'AI စမတ် ထိန်းချုပ်ရေးစနစ်' },
    desc: { zh: 'AI经营稽查与语音决策问答', en: 'AI operations audit & voice Q&A', my: 'လုပ်ငန်းလည်ပတ်မှု စမတ်ဆန်းစစ်ချက်နှင့် အတည်ပြုချက် အကူအညီ' },
    guide: {
      zh: '1. AI 经营稽查：点击或语音唤醒AI对账与异常问答。\n2. 决策脑库：查询店内实时数据与多维经营决策分析。',
      en: '1. AI Operational Audit: Use voice queries for financial reconciliation & issues.\n2. Decision Engine: Query store analytics & business guidelines.',
      my: '၁။ AI စစ်ဆေးမှု- အသံဖြင့် မေးမြန်း၍ စာရင်းများ စစ်ဆေးပါ။\n၂။ ဆုံးဖြတ်ချက်- ဆိုင်၏ ဒေတာများကို မေးမြန်းပါ။'
    }
  },
  "PROCUREMENT": {
    label: { zh: "PROCUREMENT", en: "Procurement", my: "စမတ် ကုန်ပစ္စည်း မှာယူခြင်း" },
    desc: { zh: "procurement模块", en: "Procurement Module", my: "ပစ္စည်းဖြည့်တင်းခြင်း၊ PO မှာယူလွှာနှင့် လက်ခံစစ်ဆေးခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Procurement procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "MENU_MANAGEMENT": {
    label: { zh: "MENU_MANAGEMENT", en: "Menu Management", my: "စမတ် ဟင်းချက်နည်းများ" },
    desc: { zh: "menu management模块", en: "Menu Management Module", my: "ဟင်းလျာစျေးနှုန်းနှင့် ပါဝင်ပစ္စည်း ကုန်ကျစရိတ်" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Menu Management procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "SETTLEMENT": {
    label: { zh: "SETTLEMENT", en: "Settlement", my: "နေ့စဉ်စာရင်းရှင်းလင်းခြင်း" },
    desc: { zh: "settlement模块", en: "Settlement Module", my: "ငွေသားစီးဆင်းမှု တိုက်ဆိုင်စစ်ဆေးခြင်းနှင့် အသုံးစရိတ် မှတ်တမ်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Settlement procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "ROSTER": {
    label: { zh: "ROSTER", en: "Roster", my: "အလှည့်ကျ ဂျူတီစီမံခန့်ခွဲမှု" },
    desc: { zh: "roster模块", en: "Roster Module", my: "ပျက်ကွက်မှတ်တမ်းနှင့် 排班 ကြည့်ရှုခြင်း (ဝန်ထမ်းအားလုံး)" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Roster procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "ROSTER_KITCHEN": {
    label: { zh: "ROSTER_KITCHEN", en: "Kitchen Roster", my: "မီးဖိုချောင် အလှည့်ကျဂျူတီ" },
    desc: { zh: "roster kitchen模块", en: "Kitchen Roster Module", my: "မီးဖိုချောင်ဝန်ထမ်းများ၏ ဂျူတီ စီမံခန့်ခွဲမှု" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Kitchen Roster procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "ROSTER_FLOOR": {
    label: { zh: "ROSTER_FLOOR", en: "Floor Roster", my: "ရှေ့တန်း အလှည့်ကျဂျူတီ" },
    desc: { zh: "roster floor模块", en: "Floor Roster Module", my: "ရှေ့တန်း/ဘား/သန့်ရှင်းရေး ဝန်ထမ်းများ၏ ဂျူတီ စီမံခန့်ခွဲမှု" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Floor Roster procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "SOP_INSPECT": {
    label: { zh: "SOP_INSPECT", en: "SOP Inspect", my: "SOP လုပ်ငန်းစဉ် စစ်ဆေးမှု" },
    desc: { zh: "sop inspect模块", en: "SOP Inspect Module", my: "ဝန်ထမ်းအားလုံး၏ လုပ်ငန်းပြီးစီးမှုစစ်ဆေးခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard SOP Inspect procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "SOP": {
    label: { zh: "SOP", en: "SOP", my: "နေ့စဉ် SOP လုပ်ငန်းစဉ်" },
    desc: { zh: "sop模块", en: "SOP Module", my: "မိမိနေရာအလိုက် ဆိုင်ဖွင့်/ပိတ် တာဝန်များ" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard SOP procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "INVENTORY_KITCHEN": {
    label: { zh: "INVENTORY_KITCHEN", en: "Kitchen Inventory", my: "မီးဖိုချောင် ကုန်ပစ္စည်းလက်ကျန်" },
    desc: { zh: "inventory kitchen模块", en: "Kitchen Inventory Module", my: "လတ်ဆတ်အသားစိမ်း KF / ခြောက်သွေ့ပစ္စည်း KD / ဆော့စ်များ KS" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Kitchen Inventory procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "INVENTORY_BAR": {
    label: { zh: "INVENTORY_BAR", en: "Bar Inventory", my: "ဘား ကုန်ပစ္စည်းလက်ကျန်" },
    desc: { zh: "inventory bar模块", en: "Bar Inventory Module", my: "လက်ဖက်ခြောက် BT / ဘူးသွင်း BC / သစ်သီးများ BF" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Bar Inventory procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "INVENTORY_GENERAL": {
    label: { zh: "INVENTORY_GENERAL", en: "General Inventory", my: "နောက်ဖေးထောက်ပံ့ရေးပစ္စည်း" },
    desc: { zh: "inventory general模块", en: "General Inventory Module", my: "ပါဆယ်ဘူး SP / အထွေထွေ SG" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard General Inventory procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "INVENTORY_FUEL": {
    label: { zh: "INVENTORY_FUEL", en: "Fuel Inventory", my: "ဂတ်စ်နှင့်木炭စီမံမှု" },
    desc: { zh: "inventory fuel模块", en: "Fuel Inventory Module", my: "ဂတ်စ်အိုးနှင့် မီးသွေးလက်ကျန် စာရင်းစစ်" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Fuel Inventory procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "QUEUE_MANAGER": {
    label: { zh: "QUEUE_MANAGER", en: "Queue Manager", my: "တန်းစီစောင့်ဆိုင်းခြင်းစနစ်" },
    desc: { zh: "queue manager模块", en: "Queue Manager Module", my: "နံပါတ်ထုတ်ပေးခြင်း၊ ခေါ်ယူခြင်းနှင့် တီဗီစခရင် ထိန်းချုပ်မှု" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Queue Manager procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "QUEUE": {
    label: { zh: "QUEUE", en: "Queue", my: "တန်းစီစောင့်ဆိုင်းခြင်း တီဗီစခရင်" },
    desc: { zh: "queue模块", en: "Queue Module", my: "ဝယ်ယူသူများ ကြည့်ရှုရန် တန်းစီနံပါတ်ပြသသည့် စနစ်" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Queue procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "KITCHEN_ALERT": {
    label: { zh: "KITCHEN_ALERT", en: "Kitchen Alerts", my: "မီးဖိုချောင်သို့ အသိပေးရန်" },
    desc: { zh: "kitchen alert模块", en: "Kitchen Alerts Module", my: "အမြန်လုပ်ရန်၊ အော်ဒါကျန်နှင့် ပြန်လုပ်ရန် အသိပေးချက်" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Kitchen Alerts procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "ATTENDANCE_CONSOLE": {
    label: { zh: "ATTENDANCE_CONSOLE", en: "Attendance Console", my: "တက်ရောက်မှုစစ်ဆေးရေး ထိန်းချုပ်ခန်း" },
    desc: { zh: "attendance console模块", en: "Attendance Console Module", my: "Check-in / Check-out၊ လူစာရင်းခေါ်ယူခြင်းနှင့် အလုပ်ချိန် အစီရင်ခံစာများ" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Attendance Console procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "ASSESSMENT": {
    label: { zh: "ASSESSMENT", en: "Assessment", my: "ကျွမ်းကျင်မှု စစ်ဆေးခြင်း" },
    desc: { zh: "assessment模块", en: "Assessment Module", my: "ဝန်ထမ်းကျွမ်းကျင်မှု အကဲဖြတ်ချက်နှင့် အမှတ်ပေးခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Assessment procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "DAILY_ALERT": {
    label: { zh: "DAILY_ALERT", en: "Daily Alerts", my: "နေ့စဉ် သတိပေးချက်များ" },
    desc: { zh: "daily alert模块", en: "Daily Alerts Module", my: "ပစ္စည်းလက်ကျန်နည်းခြင်းနှင့် မှတ်တမ်းသတိပေးချက်များ" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Daily Alerts procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "REPORTS": {
    label: { zh: "REPORTS", en: "Reports", my: "ဒေတာ အစီရင်ခံစာများ" },
    desc: { zh: "reports模块", en: "Reports Module", my: "အရှုံးအမြတ် (P&L) စာရင်းရှင်းတမ်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Reports procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "HR_FILES": {
    label: { zh: "HR_FILES", en: "HR Files", my: "ဝန်ထမ်း ကိုယ်ရေးဖိုင်များ" },
    desc: { zh: "hr files模块", en: "HR Files Module", my: "ဝန်ထမ်းစာချုပ်၊ ကိုယ်ရေးရာဇဝင်နှင့် လိုင်စင်များ စီမံခန့်ခွဲမှု" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard HR Files procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "AP": {
    label: { zh: "AP", en: "Accounts Payable", my: "ပေးရန်ရှိစာရင်း" },
    desc: { zh: "ap模块", en: "Accounts Payable Module", my: "ဝယ်ယူမှု ဖြတ်ပိုင်းများနှင့် ငွေပေးချေမှု စီမံခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Accounts Payable procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "SELF_INVOICE": {
    label: { zh: "SELF_INVOICE", en: "Self Invoice", my: "ကိုယ်တိုင်ပြေစာ" },
    desc: { zh: "self invoice模块", en: "Self Invoice Module", my: "ကိုယ်တိုင်အသုံးစရိတ် ဖြတ်ပိုင်း ထုတ်လုပ်ခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Self Invoice procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "TREASURY": {
    label: { zh: "TREASURY", en: "Treasury", my: "ငွေတိုက်နှင့် ဘဏ္ဍာရေး" },
    desc: { zh: "treasury模块", en: "Treasury Module", my: "လက်ကျန်ငွေ၊ အရန်ငွေနှင့် အကောင့်မျိုးစုံစာရင်း တိုက်ဆိုင်စစ်ဆေးခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Treasury procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "BILLS": {
    label: { zh: "BILLS", en: "Bills", my: "ပြေစာနှင့် ဘောက်ချာ စင်တာ" },
    desc: { zh: "bills模块", en: "Bills Module", my: "ငွေပြန်အမ်းပြေစာနှင့် ဘောက်ချာများ စနစ်တကျ ထိန်းသိမ်းခြင်း" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Bills procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
  "WARRANTY": {
    label: { zh: "WARRANTY", en: "Warranty", my: "ပစ္စည်း ပြုပြင်ထိန်း维持" },
    desc: { zh: "warranty模块", en: "Warranty Module", my: "စက်ပစ္စည်း ချို့ယွင်းမှုတိုင်ကြားခြင်းနှင့် ပြုပြင်ထိန်းသိမ်းမှုစာချုပ်များ" },
    guide: { zh: "请遵循操作指引", en: "Please follow standard Warranty procedures.", my: "လုပ်ငန်းစဉ်များကို လိုက်နာပါ" }
  },
};


// Firestore may contain visually identical legacy text with different quote,
// width or emoji-variation characters. Normalize only for lookup; stored text
// and translation keys remain unchanged.
function normalizeStaffContentKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_STAFF_CONTENT_TRANSLATIONS = new Map<
  string,
  Partial<Record<StaffLang | string, string>>
>();

Object.entries(STAFF_CONTENT_TRANSLATIONS).forEach(([key, entry]) => {
  const normalizedKey = normalizeStaffContentKey(key);
  if (!NORMALIZED_STAFF_CONTENT_TRANSLATIONS.has(normalizedKey)) {
    NORMALIZED_STAFF_CONTENT_TRANSLATIONS.set(normalizedKey, entry);
  }
});

function getStaffContentEntry(originalText: string) {
  return STAFF_CONTENT_TRANSLATIONS[originalText]
    || STAFF_CONTENT_TRANSLATIONS[originalText.trim()]
    || NORMALIZED_STAFF_CONTENT_TRANSLATIONS.get(normalizeStaffContentKey(originalText));
}

// 4. Translate Helper Functions
export function st(key: string, lang: StaffLang): string {
  if (!key) return '';
  const norm = normalizeLanguage(lang);
  const entry = STAFF_UI_TRANSLATIONS[key] || STAFF_UI_TRANSLATIONS[key.trim()];

  if (entry) {
    if (norm === 'en') {
      if (entry.en) return entry.en;
      if (entry.zh) {
        const cleaned = cleanEnglishOnly(entry.zh);
        if (cleaned && /[a-zA-Z]{2,}/.test(cleaned)) return cleaned;
      }
    }
    if (norm === 'my' && entry.my) {
      return entry.my;
    }
    if (entry[norm]) {
      return entry[norm]!;
    }
    if (entry.zh && norm === 'zh_en') {
      return entry.zh;
    }
  }

  if (norm === 'en') {
    const cleanedKey = cleanEnglishOnly(key);
    if (cleanedKey && /[a-zA-Z]{2,}/.test(cleanedKey)) return cleanedKey;
    const match = key.match(/^([a-zA-Z0-9\s\/\-\&]+)\s*[\(（]/) || key.match(/\(([^)]*[a-zA-Z]{2,}[^)]*)\)/);
    if (match && match[1] && match[1].trim().length > 1) {
      return match[1].trim();
    }
    if (!/[\u4e00-\u9fa5]/.test(key)) {
      return key;
    }
    return getEnFallback(key);
  }

  if (norm === 'my') {
    return key.replace(/_/g, ' ').toUpperCase();
  }

  return key;
}

export function localizeStaffContent(originalText: string, lang: StaffLang): string {
  if (!originalText) return '';
  const norm = normalizeLanguage(lang);
  
  const entry = getStaffContentEntry(originalText);
  if (entry) {
    if (norm === 'en' && entry.en) return entry.en;
    if (norm === 'my' && entry.my && !entry.my.startsWith('[MY]')) {
      return entry.my;
    }
    if (norm !== 'my' && entry[norm]) return entry[norm]!;
    if (entry.zh && norm === 'zh_en') return entry.zh;
  }

  if (norm === 'en') {
    const pEn = originalText.match(/\(([^)]*[a-zA-Z]{2,}[^)]*)\)/);
    if (pEn && pEn[1] && pEn[1].trim().length > 1) {
      return pEn[1].trim();
    }
    const leadEn = originalText.match(/^([a-zA-Z0-9\s\/\-\&]+)\s*[\(（]/);
    if (leadEn && leadEn[1] && leadEn[1].trim().length > 1) {
      return leadEn[1].trim();
    }
    if (!/[\u4e00-\u9fa5]/.test(originalText)) {
      return originalText;
    }
    return getEnFallback(originalText);
  }

  if (norm === 'my') {
    if (entry && entry.my && !entry.my.startsWith('[MY]')) return entry.my;
    const containsChinese = /[\u4e00-\u9fa5]/.test(originalText);
    if (containsChinese) {
      if (originalText.includes('打卡') || originalText.includes('考勤')) {
        return 'ပုံမှန်အလုပ်ဆင်း တက်ရောက်မှု တာဝန်';
      }
      if (originalText.includes('清洁') || originalText.includes('垃圾')) {
        return 'သန့်ရှင်းရေးနှင့် သပ်ရပ်မှု လုပ်ဆောင်ရန်';
      }
      if (originalText.includes('检查') || originalText.includes('确认')) {
        return 'စနစ်တကျစစ်ဆေးပြီး အတည်ပြုဆောင်ရွက်ရန်';
      }
      if (originalText.includes('准备') || originalText.includes('SOP')) {
        return 'သတ်မှတ်ထားသော ဆိုင်ဖွင့်ပြင်ဆင်မှု SOP';
      }
      return 'သတ်မှတ်ထားသော တာဝန် လုပ်ဆောင်ရန်';
    }
  }

  return originalText;
}

export function getStaffModuleLabel(modKey: string, lang: StaffLang, fallback: string): string {
  const norm = normalizeLanguage(lang);
  const entry = STAFF_MODULE_TRANSLATIONS[modKey];
  if (entry && entry.label) {
    if (norm === 'en' && entry.label.en) return entry.label.en;
    if (norm === 'my' && entry.label.my) return entry.label.my;
    if (entry.label[norm]) return entry.label[norm]!;
    if (entry.label.zh) {
      if (norm === 'en') {
        const cl = cleanEnglishOnly(entry.label.zh);
        return cl ? cl : getEnFallback(entry.label.zh);
      }
      return entry.label.zh;
    }
  }
  if (norm === 'en') {
    const cl = cleanEnglishOnly(fallback);
    return cl ? cl : getEnFallback(fallback || modKey);
  }
  return fallback || modKey.replace(/_/g, ' ').toUpperCase();
}

export function getStaffModuleDesc(modKey: string, lang: StaffLang, fallback: string): string {
  const norm = normalizeLanguage(lang);
  const entry = STAFF_MODULE_TRANSLATIONS[modKey];
  if (entry && entry.desc) {
    if (norm === 'en' && entry.desc.en) return entry.desc.en;
    if (norm === 'my' && entry.desc.my) return entry.desc.my;
    if (entry.desc[norm]) return entry.desc[norm]!;
    if (entry.desc.zh) {
      if (norm === 'en') {
        const cl = cleanEnglishOnly(entry.desc.zh);
        return cl ? cl : getEnFallback(entry.desc.zh);
      }
      return entry.desc.zh;
    }
  }
  if (norm === 'en') {
    const cl = cleanEnglishOnly(fallback);
    return cl ? cl : getEnFallback(fallback || 'Module description');
  }
  return fallback || st('not_open_tip', lang);
}

export function getStaffModuleGuide(modKey: string, lang: StaffLang, fallback: string): string {
  const norm = normalizeLanguage(lang);
  const entry = STAFF_MODULE_TRANSLATIONS[modKey];
  if (entry && entry.guide) {
    if (norm === 'en' && entry.guide.en) return entry.guide.en;
    if (norm === 'my' && entry.guide.my) return entry.guide.my;
    if (entry.guide[norm]) return entry.guide[norm]!;
    if (entry.guide.zh) {
      if (norm === 'en') {
        const cl = cleanEnglishOnly(entry.guide.zh);
        return cl ? cl : getEnFallback(entry.guide.zh);
      }
      return entry.guide.zh;
    }
  }
  if (norm === 'en') {
    const cl = cleanEnglishOnly(fallback);
    return cl ? cl : getEnFallback(fallback || 'Module guide');
  }
  return fallback || '';
}