const fs = require('fs');

const fullTsContent = `import { AppLanguage, normalizeLanguage } from '../types';

export type StaffLang = AppLanguage | 'zh' | 'zh_en';

export function cleanEnglishOnly(text: string): string {
  if (!text) return '';
  const parenthesizedEn = text.match(/\\(([^)]*[a-zA-Z]{2,}[^)]*)\\)/);
  if (parenthesizedEn && parenthesizedEn[1]) {
    return parenthesizedEn[1].trim();
  }
  const reverseParenthesizedEn = text.match(/^([a-zA-Z0-9\\s\\/\\-\\&]+)\\s*[\\(（]/);
  if (reverseParenthesizedEn && reverseParenthesizedEn[1]) {
    return reverseParenthesizedEn[1].trim();
  }
  if (text.includes('/')) {
    const parts = text.split('/');
    const enPart = parts.find(p => /[a-zA-Z]/.test(p));
    if (enPart) return enPart.trim();
  }
  const stripped = text.replace(/[\\u4e00-\\u9fa5]/g, '').trim();
  if (stripped.length > 0) {
    return stripped.replace(/^[（\\(\\s\\:\\/]+|[）\\)\\s\\:\\/]+$/g, '').trim();
  }
  return text;
}

// 1. Fixed UI Translations
export const STAFF_UI_TRANSLATIONS: Record<string, Partial<Record<StaffLang | string, string>>> = {
  // Tabs & Nav
  'today': { zh: '今天', en: 'Today', my: 'ယနေ့' },
  'tomorrow': { zh: '明天', en: 'Tomorrow', my: 'မနက်ဖြန်' },
  'dayAfterTomorrow': { zh: '后天', en: 'Day After Tomorrow', my: 'သန်ဘက်ခါ' },
  'schedule': { zh: '排班', en: 'Schedule', my: 'ဇယား' },
  'handbook': { zh: '手册', en: 'Handbook', my: 'လက်စွဲ' },
  'me': { zh: '我的', en: 'Profile', my: 'ကျွန်ုပ်' },

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
  // Employee Rules
  '🕒 考勤铁律：楼面是下午 3:30，厨房是下午 3:00 准时打卡开铺。迟到超过 15 分钟扣除一小时的薪资，并且对本身的 KPI 有影响。': {
    zh: '🕒 考勤铁律：楼面是下午 3:30，厨房是下午 3:00 准时打卡开铺。迟到超过 15 分钟扣除一小时的薪资，并且对本身的 KPI 有影响。',
    en: '🕒 Attendance Rule: Floor staff clock in at 3:30 PM, Kitchen staff clock in at 3:00 PM. Lateness exceeding 15 mins incurs 1-hr salary deduction & affects KPI.',
    my: '🕒 တက်ရောက်မှုစည်းကမ်း- ရှေ့တန်းဝန်ထမ်းများ မွန်းလွဲ ၃:၃၀၊ မီးဖိုချောင်ဝန်ထမ်းများ မွန်းလွဲ ၃:၀၀ တွင် အလုပ်ဝင်打卡 ရမည်။'
  },
  '📱 手机管制：手机必须静音和严禁边工作边玩手机。': {
    zh: '📱 手机管制：手机必须静音和严禁边工作边玩手机。',
    en: '📱 Mobile Rule: Phones must be muted. Playing with phones during working hours is strictly prohibited.',
    my: '📱 ဖုန်းအသုံးပြုမှု- ဖုန်းကို အသံတိတ်ထားရမည်။'
  },
  '🧼 仪容仪表：必须穿戴整齐制服、围裙、包鞋。厨房人员必须戴帽子，长发需盘起。': {
    zh: '🧼 仪容仪表：必须穿戴整齐制服、围裙、包鞋。厨房人员必须戴帽子，长发需盘起。',
    en: '🧼 Grooming: Wear neat uniform, apron & closed shoes. Kitchen staff must wear caps; long hair tied up.',
    my: '🧼 ဝတ်စားဆင်ယင်မှု- ယူနီဖောင်း၊ ဂျပန်အေပရွန်နှင့် ဖိနပ်အပြည့်ဝတ်ဆင်ရမည်။'
  },
  '🍜 员工用餐：仅限 16:30前 或 21:30-22:00 轮流用餐。': {
    zh: '🍜 员工用餐：仅限 16:30前 或 21:30-22:00 轮流用餐。',
    en: '🍜 Staff Meals: Allowed in turns only before 4:30 PM or between 9:30 PM - 10:00 PM.',
    my: '🍜 ဝန်ထမ်းထမင်းစားချိန်- ညနေ ၄:၃၀ မတိုင်မီ သို့မဟုတ် ည ၉:၃၀ မှ ၁၀:၀၀ အတွင်း။'
  },
  '🚬 吸烟规定：仅限后巷指定区域，严禁穿着围裙吸烟，回岗必须洗手漱口。': {
    zh: '🚬 吸烟规定：仅限后巷指定区域，严禁穿着围裙吸烟，回岗必须洗手漱口。',
    en: '🚬 Smoking: Designated alley area only. Do not smoke wearing aprons. Wash hands & rinse mouth before returning.',
    my: '🚬 ဆေးလိပ်သောက်ခြင်း- သတ်မှတ်ထားသော နောက်ဖေးလမ်းကြားတွင်သာ။'
  },
  '🗣️ 待客之道：见到顾客必须点头微笑说"欢迎光临"，离开说"谢谢光临"流通服务。': {
    zh: '🗣️ 待客之道：见到顾客必须点头微笑说"欢迎光临"，离开说"谢谢光临"流通服务。',
    en: '🗣️ Courtesy: Greet customers with a smile saying "Welcome", and say "Thank you for coming" when leaving.',
    my: '🗣️ ဝယ်ယူသူဧည့်ဝတ်ပြုမှု- ဧည့်သည်များကို ပြုံးရွှင်စွာ နှုတ်ဆက်ရမည်။'
  },
  '🚫 安全红线：厨房地面保持干燥防滑，端热汤/铁板必须使用托盘或隔热布。': {
    zh: '🚫 安全红线：厨房地面保持干燥防滑，端热汤/铁板必须使用托盘或隔热布。',
    en: '🚫 Safety Red Line: Keep kitchen floor dry. Always use trays or thermal cloth for hot soups and hot plates.',
    my: '🚫 ဘေးကင်းရေးစည်းကမ်း- မီးဖိုချောင်ကြမ်းပြင်ကို ခြောက်သွေ့စေရမည်။'
  },
  '🌛 打烊纪律：01:30 Last Call 后不再接单，02:00 前完成所有清洁工作并经主管检查后方可离店。': {
    zh: '🌛 打烊纪律：01:30 Last Call 后不再接单，02:00 前完成所有清洁工作并经主管检查后方可离店。',
    en: '🌛 Closing Discipline: No orders after 1:30 AM Last Call. Finish cleaning by 2:00 AM; leave after supervisor check.',
    my: '🌛 ဆိုင်ပိတ်စည်းကမ်း- ည ၁:၃၀ မိုဗိုအော်ဒါပိတ်ပြီးနောက် အော်ဒါမယူတော့ပါ။'
  },

  // Role Headings & Descriptions
  '厨房最高指挥官。负责菜品研发、成本控制与团队建设。': {
    zh: '厨房最高指挥官。负责菜品研发、成本控制与团队建设。',
    en: 'Executive Kitchen Leader. Responsible for menu development, cost control, and team management.',
    my: 'မီးဖိုချောင်ခေါင်းဆောင်။ အစားအစာတီထွင်မှု၊ ကုန်ကျစရိတ်ထိန်းချုပ်မှုနှင့် အဖွဲ့စီမံခန့်ခွဲမှု。'
  },
  '出品灵魂与厨房纪律': { zh: '出品灵魂与厨房纪律', en: 'Culinary Excellence & Kitchen Discipline', my: 'ဟင်းပွဲအရည်အသွေးနှင့် မီးဖိုချောင်စည်းကမ်း' },
  '严禁使用变质食材 / 严禁私自更改秘制酱料配方': {
    zh: '严禁使用变质食材 / 严禁私自更改秘制酱料配方',
    en: 'Forbidden: Using spoiled ingredients / Altering secret sauce recipes without approval',
    my: 'မလတ်ဆတ်သောအစာသုံးခြင်းနှင့် ဆော့စ်ချက်နည်းပြောင်းလဲခြင်းကို လုံးဝတားမြစ်သည်။'
  },
  '完全掌握核心酱料配方，能独立解决厨房突发状况。': {
    zh: '完全掌握核心酱料配方，能独立解决厨房突发状况。',
    en: 'Master all core sauce recipes and independently resolve kitchen emergencies.',
    my: 'ပင်မဆော့စ်ချက်နည်းများကို ကျွမ်းကျင်ပြီး မီးဖိုချောင်အရေးပေါ်အခြေအနေများကို ဖြေရှင်းနိုင်ရန်。'
  },
  '培养出至少一名合格的头手，厨房零重大投诉，Food Cost 稳定。': {
    zh: '培养出至少一名合格的头手，厨房零重大投诉，Food Cost 稳定。',
    en: 'Train at least one qualified Head Chef; zero major complaints; maintain stable food cost.',
    my: 'ကျွမ်းကျင်စားဖိုမှူး အနည်းဆုံးတစ်ဦး မွေးထုတ်ပေးရန်နှင့် အစားအသောက်စရိတ် တည်ငြိမ်စေရန်。'
  },
  '门店的大脑。全权负责楼面运营、业绩达标与团队稳定。': {
    zh: '门店的大脑。全权负责楼面运营、业绩达标与团队稳定。',
    en: 'Store Operations Leader. Oversee floor operations, sales targets, and team stability.',
    my: 'ဆိုင်ခွဲခေါင်းဆောင်。 လုပ်ငန်းလည်ပတ်ရေး၊ အရောင်းပန်းတိုင်နှင့် အဖွဲ့သားတည်ငြိမ်ရေး。'
  },
  '高效履职 · 严守纪律 · 团队榜样': { zh: '高效履职 · 严守纪律 · 团队榜样', en: 'Efficient Leadership · Strict Discipline · Team Role Model', my: 'ကျွမ်းကျင်စွာဦးဆောင်ခြင်း · စည်းကမ်းလိုက်နာခြင်း' },
  '严禁作假账 / 严禁隐瞒重大事故 / 严禁私自放人早退': {
    zh: '严禁作假账 / 严禁隐瞒重大事故 / 严禁私自放人早退',
    en: 'Forbidden: Falsifying accounts / Concealing major incidents / Allowing unauthorized early leaves',
    my: 'စာရင်းလိမ်လည်ခြင်း၊ မတော်တဆမှုကို ဖုံးကွယ်ခြင်းနှင့် စောစီးစွာပြန်ခွင့်ပြုခြင်းကို တားမြစ်သည်။'
  },
  '能够处理 90% 的日常客诉与突发状况。': {
    zh: '能够处理 90% 的日常客诉与突发状况。',
    en: 'Capable of handling 90% of daily customer complaints and operational emergencies.',
    my: 'နေ့စဉ် ဧည့်သည်တိုင်ကြားမှုနှင့် အရေးပေါ်အခြေအနေ ၉၀% ကို ကိုင်တွယ်နိုင်ရန်。'
  },
  '独立完成月度采购与成本控制，设备维护及时无影响营业。': {
    zh: '独立完成月度采购与成本控制，设备维护及时无影响营业。',
    en: 'Manage monthly procurement & cost control independently; timely equipment maintenance.',
    my: 'လစဉ်ဝယ်ယူမှုနှင့် ကုန်ကျစရိတ်များကို လွတ်လပ်စွာထိန်းချုပ်နိုင်ရန်。'
  },
  '餐厅的枢纽与门面。负责收银、外卖平台对接与电话接单。': {
    zh: '餐厅的枢纽与门面。负责收银、外卖平台对接与电话接单。',
    en: 'Front Counter Hub. Responsible for cashiering, delivery platform orders, and phone reservations.',
    my: 'ငွေကိုင်စင်တာ。 ငွေရှင်းခြင်း၊ ပါဆယ်အော်ဒါများနှင့် ဖုန်းမှာယူမှုများကို ကိုင်တွယ်ရန်。'
  },
  '账目精准 · 即使忙碌也要保持微笑': { zh: '账目精准 · 即使忙碌也要保持微笑', en: 'Accurate Billing · Warm Professional Smile Always', my: 'စာရင်းတိကျမှု · ပြုံးရွှင်စွာ ဝန်ဆောင်မှုပေးခြင်း' },
  '严禁私吞公款 / 严禁私自给予折扣 / 钱箱必须随时上锁': {
    zh: '严禁私吞公款 / 严禁私自给予折扣 / 钱箱必须随时上锁',
    en: 'Forbidden: Misappropriating funds / Unauthorized discounts / Unlocked cash drawer',
    my: 'ဆိုင်ငွေသုံးစွဲခြင်း၊ ခွင့်ပြုချက်မရှိဘဲ လျှော့စျေးပေးခြင်းကို တားမြစ်သည်။'
  },
  '熟练操作 POS 系统，外卖接单无漏单。': {
    zh: '熟练操作 POS 系统，外卖接单无漏单。',
    en: 'Master POS operations; achieve zero missed orders on delivery platforms.',
    my: 'POS စနစ်ကို ကျွမ်းကျင်စွာအသုံးပြုနိုင်ရန်၊ ပါဆယ်အော်ဒါ မကျန်စေရန်。'
  },
  '能同时处理现场结账和电话订单，账目每月差异少于 RM50。': {
    zh: '能同时处理现场结账和电话订单，账目每月差异少于 RM50。',
    en: 'Handle in-store checkout and phone orders simultaneously; cash variance < RM50/month.',
    my: 'ငွေရှင်းခြင်းနှင့် ဖုန်းအော်ဒါများကို တစ်ပြိုင်နက်ကိုင်တွယ်နိုင်ရန်。'
  },

  // Crucial Kitchen Prep Items (Assisting Chef / Fryer / Cutter)
  '准备汤底 (Soup Base)': { zh: '准备汤底 (Soup Base)', en: 'Soup Base Preparation', my: 'ဟင်းရည်အနှစ် ပြင်ဆင်ခြင်း' },
  '预炸鸡翅/五香': { zh: '预炸鸡翅/五香', en: 'Pre-fry Chicken Wings & Five-Spice Rolls', my: 'ကြက်တောင်ပံနှင့် ငါးမွှေးကြော်များ ကြိုကြော်ထားရန်' },
  '检查面条库存': { zh: '检查面条库存', en: 'Check Noodle Stock', my: 'ခေါက်ဆွဲလက်ကျန် စစ်ဆေးရန်' },
  '过滤炸油 (Filter Oil)': { zh: '过滤炸油 (Filter Oil)', en: 'Filter Frying Oil', my: 'ကြော်ဆီများကို စစ်ထုတ်ရန်' },
  '清洗炸炉': { zh: '清洗炸炉', en: 'Clean the Fryer Machine', my: 'ဆီကြော်အိုးများ ဆေးကြောရန်' },
  '收拾备料盘': { zh: '收拾备料盘', en: 'Store Ingredient Preparation Trays', my: 'ပြင်ဆင်ပြီး ဟင်းသီးဟင်းရွက်ဗန်းများ သိမ်းဆည်းရန်' },
  '从冷房取出': { zh: '从冷房取出', en: 'Retrieve from Cold Room', my: 'အေးခဲခန်းမှ ထုတ်ယူပါ' },
  '去除残渣': { zh: '去除残渣', en: 'Remove Food Residue', my: 'အနှစ်အကြွင်းများ ဖယ်ရှားပါ' },
  '放入冰箱': { zh: '放入冰箱', en: 'Store in Refrigerator', my: 'ရေခဲသေတ္တာထဲ ထည့်ပါ' },
  '保鲜': { zh: '保鲜', en: 'Maintain Freshness', my: 'လတ်ဆတ်မှုထိန်းသိမ်းရေး' },
  '磨刀 (Sharpen Knives)': { zh: '磨刀 (Sharpen Knives)', en: 'Sharpen Chef Knives', my: 'ဓားများ သွေးရန်' },
  '切配今日蔬菜': { zh: '切配今日蔬菜', en: 'Prep & Chop Daily Vegetables', my: 'ယနေ့ သုံးရန် ဟင်းသီးဟင်းရွက်များ လှီးဖြတ်ရန်' },
  '腌制肉类 (Marinate)': { zh: '腌制肉类 (Marinate)', en: 'Marinate Meats (Pork/Chicken)', my: 'အသားများ အနှစ်နယ်၍ နှပ်ထားရန်' },
  '补满酱料瓶': { zh: '补满酱料瓶', en: 'Refill Condiment Sauce Bottles', my: 'ဆော့စ်ပုလင်းများ ဖြည့်ဆည်းရန်' },
  '准备打包盒 (Takeaway)': { zh: '准备打包盒 (Takeaway)', en: 'Fold Takeaway Boxes', my: 'အပြင်ထုတ် ပါကင်ဗူးများ ခေါက်ထားရန်' },
  '擦拭出菜台 (Pass)': { zh: '擦拭出菜台 (Pass)', en: 'Wipe Down Kitchen Pass Station', my: 'ဟင်းထုတ်စင်ကို သုတ်သင်ရှင်းလင်းရန်' },
  '拖厨房地面': { zh: '拖厨房地面', en: 'Mop Kitchen Floor', my: 'မီးဖိုချောင် ကြမ်းပြင်ကို တိုင်ကူတိုက်ရန်' },
  '煲凉茶 (Boil Herbal)': { zh: '煲凉茶 (Boil Herbal)', en: 'Boil Herbal Tea Batch', my: 'ဆေးဘက်ဝင် ရေနွေးဂျင်းကြိုရန်' },
  '切酸柑/柠檬': { zh: '切酸柑/柠檬', en: 'Slice Calamansi Limes & Lemons', my: 'သံပုရာသီးနှင့် သံပုရိုသီးများ လှီးထားရန်' },
  '检查冰块 (Ice)': { zh: '检查冰块 (Ice)', en: 'Check Ice Bin Levels', my: 'ရေခဲပုံး လက်ကျန် စစ်ဆေးရန်' },

  // System Modules SOP tasks
  '提交每日结算单': { zh: '提交每日结算单', en: 'Submit Daily Settlement Report', my: 'နေ့စဉ် ငွေစာရင်းအစီရင်ခံစာ တင်ပြရန်' },
  '核对钱箱现金': { zh: '核对钱箱现金', en: 'Verify Cash Drawer Amount', my: 'ငွေသား လက်ကျန် စစ်ဆေးရန်' },
  '厨房库存盘点': { zh: '厨房库存盘点', en: 'Kitchen Inventory Audit', my: 'မီးဖိုချောင် ပစ္စည်းစာရင်းစစ်ခြင်း' },
  '检查食材保质期': { zh: '检查食材保质期', en: 'Check Ingredient Expiry Dates', my: 'ပါဝင်ပစ္စည်း သက်တမ်းကုန်ရက် စစ်ဆေးရန်' },
  '水吧库存盘点': { zh: '水吧库存盘点', en: 'Bar Inventory Audit', my: 'ဖျော်ရည်ဌာန ပစ္စည်းစာရင်းစစ်ခြင်း' },
  '检查水果新鲜度': { zh: '检查水果新鲜度', en: 'Check Fruit Freshness', my: 'သစ်သီး လတ်ဆတ်မှု စစ်ဆေးရန်' },
  '凉茶包存量检查': { zh: '凉茶包存量检查', en: 'Check Herbal Tea Bag Stock', my: 'ဆေးဘက်ဝင် လက်ဖက်ခြောက်ထုတ် လက်ကျန်စစ်ဆေးရန်' },
  '后勤物资盘点': { zh: '后勤物资盘点', en: 'General Supplies Inventory', my: 'အထွေထွေ ပစ္စည်းစာရင်းစစ်ခြင်း' },
  '打包盒存量检查': { zh: '打包盒存量检查', en: 'Check Takeaway Box Stock', my: 'ပါကင်ဗူး လက်ကျန် စစ်ဆေးရန်' },
  '煤气桶剩余量记录': { zh: '煤气桶剩余量记录', en: 'Record LPG Gas Cylinder Level', my: 'ဓာတ်ငွေ့အိုး လက်ကျန် မှတ်တမ်းတင်ရန်' },
  '木炭库存盘点': { zh: '木炭库存盘点', en: 'Charcoal Inventory Count', my: 'မီးသွေး လက်ကျန် စာရင်းစစ်ရန်' }
};

// 3. Module Translations
export const STAFF_MODULE_TRANSLATIONS: Record<string, {
  label: Partial<Record<StaffLang | string, string>>;
  desc: Partial<Record<StaffLang | string, string>>;
  guide?: Partial<Record<StaffLang | string, string>>;
}> = {
  'LOGBOOK': {
    label: { zh: '交接日志', en: 'Logbook Shift Handover', my: 'လွှဲပြောင်းမှတ်တမ်း (Logbook)' },
    desc: { zh: '班次异常与重大事件记录', en: 'Shift handover notes & exception logs', my: 'အဆန်းပြားဖြစ်စဉ်များနှင့် သတင်းအချက်အလက်များ' },
    guide: {
      zh: '1. 填写交接：记录本班次发生的客人投诉、设备损坏或临时调班。\\n2. 查阅日志：接班员工必须查看上一班的未完成事项并确认。',
      en: '1. Handover Notes: Record guest complaints, broken tools, or shift swaps.\\n2. Review Logs: Incoming staff must inspect and clear pending items.',
      my: '၁။ အစီရင်ခံစာဖြည့်ပါ- အမှားအယွင်းများ သို့မဟုတ် ဧည့်သည်တိုင်ကြားချက်များကို မှတ်တမ်းတင်ပါ။\\n၂။ စစ်ဆေးပါ- တာဝန်ကျအဖွဲ့သားများသည် ယခင်ဂျူတီမှ အရာများကို စစ်ဆေးရမည်။'
    }
  },
  'EXPENSES': {
    label: { zh: '零用金报销', en: 'Petty Cash Expenses', my: 'သေးငယ်သော စရိတ်စက' },
    desc: { zh: '紧急小额采购拍单报销', en: 'Emergency minor purchases photo claim', my: 'အသေးသုံးစရိတ်များ ဓာတ်ပုံရိုက်၍ စာရင်းတင်ပြခြင်း' },
    guide: {
      zh: '1. 拍照上传：购买零星杂项（如紧急买冰块、洗洁精）后拍照发票。\\n2. 填报金额：输入实际支出金额并选择科目，等待老板或经理审核。',
      en: '1. Snap Receipt: Photo receipts for urgent buys (ice, detergent).\\n2. Submit Claim: Enter amount, select category, await approval.',
      my: '၁။ ဓာတ်ပုံရိုက်ပါ- အရေးပေါ်ဝယ်ယူမှု ဖြတ်ပိုင်းကို ဓာတ်ပုံရိုက်ပါ။\\n၂။ စာရင်းတင်ပါ- ပမာဏထည့်ပြီး အတည်ပြုချက်စောင့်ပါ။'
    }
  },
  'EMPLOYEE_RATING': {
    label: { zh: '季度评分', en: 'Quarterly Rating', my: 'သုံးလပတ် အကဲဖြတ်ချက်' },
    desc: { zh: '员工 KPI 考核与记录', en: 'Employee KPI review & records', my: 'ဝန်ထမ်း KPI အကဲဖြတ်ချက်' },
    guide: {
      zh: '1. 查看评分：经理对员工服务、出勤、SOP完成度进行季度评分。\\n2. 绩效激励：评分直接挂钩季度奖金与升职加薪参考。',
      en: '1. View Score: Managers evaluate service, attendance, and SOP compliance.\\n2. Incentives: Scores directly impact bonuses and promotions.',
      my: '၁။ အကဲဖြတ်ချက်ကြည့်ပါ- မန်နေဂျာမှ ဝန်ထမ်း၏ စွမ်းဆောင်ရည်ကို အမှတ်ပေးသည်။\\n၂။ ဆုကြေး- အမှတ်သည် ဆုကြေးငွေနှင့် တိုက်ရိုက်သက်ဆိုင်သည်။'
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
      zh: '1. AI 经营稽查：点击或语音唤醒AI对账与异常问答。\\n2. 决策脑库：查询店内实时数据与多维经营决策分析。',
      en: '1. AI Operational Audit: Use voice queries for financial reconciliation & issues.\\n2. Decision Engine: Query store analytics & business guidelines.',
      my: '၁။ AI စစ်ဆေးမှု- အသံဖြင့် မေးမြန်း၍ စာရင်းများ စစ်ဆေးပါ။\\n၂။ ဆုံးဖြတ်ချက်- ဆိုင်၏ ဒေတာများကို မေးမြန်းပါ။'
    }
  }
};

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
    if (entry.zh && (norm === 'zh_en' || norm === 'zh')) {
      return entry.zh;
    }
  }

  if (norm === 'en') {
    const cleanedKey = cleanEnglishOnly(key);
    if (cleanedKey && /[a-zA-Z]{2,}/.test(cleanedKey)) return cleanedKey;
    const match = key.match(/^([a-zA-Z0-9\\s\\/\\-\\&]+)\\s*[\\(（]/) || key.match(/\\(([^)]*[a-zA-Z]{2,}[^)]*)\\)/);
    if (match && match[1] && match[1].trim().length > 1) {
      return match[1].trim();
    }
    if (!/[\\u4e00-\\u9fa5]/.test(key)) {
      return key;
    }
    return key;
  }

  if (norm === 'my') {
    return key.replace(/_/g, ' ').toUpperCase();
  }

  return key;
}

export function localizeStaffContent(originalText: string, lang: StaffLang): string {
  if (!originalText) return '';
  const norm = normalizeLanguage(lang);
  
  const entry = STAFF_CONTENT_TRANSLATIONS[originalText] || STAFF_CONTENT_TRANSLATIONS[originalText.trim()];
  if (entry) {
    if (norm === 'en' && entry.en) return entry.en;
    if (norm === 'my' && entry.my) return entry.my;
    if (entry[norm]) return entry[norm]!;
    if (entry.zh && (norm === 'zh_en' || norm === 'zh')) return entry.zh;
  }

  if (norm === 'en') {
    const pEn = originalText.match(/\\(([^)]*[a-zA-Z]{2,}[^)]*)\\)/);
    if (pEn && pEn[1] && pEn[1].trim().length > 1) {
      return pEn[1].trim();
    }
    const leadEn = originalText.match(/^([a-zA-Z0-9\\s\\/\\-\\&]+)\\s*[\\(（]/);
    if (leadEn && leadEn[1] && leadEn[1].trim().length > 1) {
      return leadEn[1].trim();
    }
    if (!/[\\u4e00-\\u9fa5]/.test(originalText)) {
      return originalText;
    }
    return originalText;
  }

  if (norm === 'my') {
    if (entry && entry.my) return entry.my;
    const containsChinese = /[\\u4e00-\\u9fa5]/.test(originalText);
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
      if (norm === 'en') return cleanEnglishOnly(entry.label.zh) || entry.label.zh;
      return entry.label.zh;
    }
  }
  if (norm === 'en') return cleanEnglishOnly(fallback) || modKey.replace(/_/g, ' ').toUpperCase();
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
      if (norm === 'en') return cleanEnglishOnly(entry.desc.zh) || entry.desc.zh;
      return entry.desc.zh;
    }
  }
  if (norm === 'en') return cleanEnglishOnly(fallback) || 'Module description';
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
      if (norm === 'en') return cleanEnglishOnly(entry.guide.zh) || entry.guide.zh;
      return entry.guide.zh;
    }
  }
  if (norm === 'en') return cleanEnglishOnly(fallback);
  return fallback || '';
}
`;

fs.writeFileSync('constants/staffTranslations.ts', fullTsContent);
console.log('Clean build written to constants/staffTranslations.ts');
