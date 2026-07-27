import { AppLanguage, normalizeLanguage } from '../types';
import { cleanEnglishOnly } from './staffTranslations';

export type ManagementLang = AppLanguage | 'zh' | 'zh_en';

export const MANAGEMENT_TRANSLATIONS = {
    // Shared / Core
    'workspace': {
        zh: '工作台',
        my: 'လုပ်ငန်းခွင်'
    },
    'tasks': {
        zh: '任务',
        my: 'လုပ်ငန်းများ'
    },
    'functions': {
        zh: '功能',
        my: 'လုပ်ဆောင်ချက်များ'
    },
    'me': {
        zh: '我的',
        my: 'ကျွန်ုပ်၏'
    },
    'loading': {
        zh: '加载中...',
        my: 'ဒေတာ ဆွဲယူနေသည်...'
    },
    'no_auth_denied': {
        zh: '🔒 安全拒绝：您的账号无权访问该功能模块。',
        my: '🔒 လုံခြုံရေး ငြင်းပယ်ခြင်း- သင်၏ အကောင့်သည် ဤလုပ်ဆောင်ချက်ကို ဝင်ရောက်ခွင့် မရှိပါ။'
    },
    'limited_feature': {
        zh: '⚠️ 功能受限：模块暂未对管理人员开放或未接入管理层控制台。',
        my: '⚠️ လုပ်ဆောင်ချက် ကန့်သတ်ချက်- ဤလုပ်ဆောင်ချက်ကို စီမံခန့်ခွဲသူများအတွက် မဖွင့်ရသေးပါ သို့မဟုတ် စီမံခန့်ခွဲမှု ကွန်ဆိုးလ်သို့ မချိတ်ဆက်ရသေးပါ။'
    },
    'back': {
        zh: '返回',
        my: 'နောက်သို့'
    },
    'view_all': {
        zh: '查看全部',
        my: 'အားလုံးကြည့်ရန်'
    },
    'no_data': {
        zh: '暂无数据',
        my: 'ဒေတာမရှိပါ'
    },

    // ManagementHome (Workspace)
    'today_operations': {
        zh: '今日营运状态',
        my: 'ယနေ့ လုပ်ငန်းလည်ပတ်မှု အခြေအနေ'
    },
    'realtime_audit': {
        zh: '实时营运稽查',
        my: 'အချိန်နှင့်တပြေးညီ လုပ်ငန်း စစ်ဆေးခြင်း'
    },
    'absent_count': {
        zh: '员工缺席',
        my: 'ဝန်ထမ်း ပျက်ကွက်မှု'
    },
    'stock_shortage': {
        zh: '库存告急',
        my: 'ပစ္စည်း ပြတ်လပ်လုနီးပါး သတိပေးချက်'
    },
    'pending_tasks_count': {
        zh: '待办任务',
        my: 'ဆောင်ရွက်ရန် လုပ်ငန်းများ'
    },
    'add_log': {
        zh: '新增日志',
        my: 'မှတ်တမ်းအသစ် ထည့်သွင်းရန်'
    },
    'quick_access': {
        zh: '快捷管理入口',
        my: 'ဖြတ်လမ်း စီမံခန့်ခွဲမှု လမ်းကြောင်း'
    },
    'today_team_exceptions': {
        zh: '今日团队异常',
        my: 'ယနေ့ အဖွဲ့သား အဆင်မပြေမှုများ'
    },
    'no_exceptions': {
        zh: '暂无异常',
        my: 'မူမမှန်မှု မရှိပါ'
    },
    'dept_kitchen': {
        zh: '厨房部门',
        my: 'မီးဖိုချောင် ဌာန'
    },
    'dept_floor': {
        zh: '楼面部门',
        my: 'စားသောက်ဆိုင် ရှေ့တန်းဌာန'
    },
    'dept_bar': {
        zh: '吧台部门',
        my: 'ဘား ဌာန'
    },
    'dept_hr': {
        zh: '人事行政',
        my: 'လူ့စွမ်းအားနှင့် စီမံခန့်ခွဲရေး'
    },
    'dept_finance': {
        zh: '行政财务',
        my: 'စီမံခန့်ခွဲရေးနှင့် ဘဏ္ဍာရေး'
    },
    'dept_head': {
        zh: '部门负责人',
        my: 'ဌာနအကြီးအကဲ'
    },

    // Identity level translation
    'org_owner': {
        zh: '老板',
        my: 'လုပ်ငန်းရှင်'
    },
    'org_general_manager': {
        zh: '总经理',
        my: 'အထွေထွေမန်နေဂျာ'
    },
    'org_branch_manager': {
        zh: '店长',
        my: 'ဆိုင်ခွဲမန်နေဂျာ'
    },
    'org_department_head': {
        zh: '部门负责人',
        my: 'ဌာနအကြီးအကဲ'
    },
    'org_staff': {
        zh: '员工',
        my: 'အမြဲတမ်းဝန်ထမ်း'
    },

    // Module Names (Skins & AdminDashboard Headers)
    'module_settlement': {
        zh: '每日结算',
        my: 'နေ့စဉ် ငွေစာရင်း ပိတ်ခြင်း'
    },
    'module_roster': {
        zh: '排班管理',
        my: 'အလှည့်ကျ တာဝန်ဇယား စီမံခန့်ခွဲမှု'
    },
    'module_attendance': {
        zh: '考勤稽查',
        my: 'တက်ရောက်မှု စစ်ဆေးခြင်း'
    },
    'module_attendance_console': {
        zh: '考勤指挥台',
        my: 'တက်ရောက်မှု ထိန်းချုပ်ရေးခန်း'
    },
    'module_logbook': {
        zh: '运营日志',
        my: 'လုပ်ငန်းလည်ပတ်မှု မှတ်တမ်း'
    },
    'module_logbook_view': {
        zh: '运营日志',
        my: 'လုပ်ငန်းလည်ပတ်မှု မှတ်တမ်း'
    },
    'module_sop': {
        zh: 'SOP稽查',
        my: 'SOP လုပ်ငန်းစဉ် စစ်ဆေးမှု'
    },
    'module_sop_inspect': {
        zh: 'SOP进度稽查',
        my: 'SOP တိုးတက်မှု စစ်ဆေးခြင်း'
    },
    'module_inventory_check': {
        zh: '库存盘点',
        my: 'ပစ္စည်းစာရင်း စစ်ဆေးခြင်း'
    },
    'module_inventory_view': {
        zh: '库存总览',
        my: 'ပစ္စည်းစာရင်း အကျဉ်းချုပ်'
    },
    'module_procurement': {
        zh: '智能订货',
        my: 'စမတ် ကုန်ပစ္စည်း မှာယူခြင်း'
    },
    'module_supplier': {
        zh: '供应商',
        my: 'ကုန်ပစ္စည်း ပေးသွင်းသူများ'
    },
    'module_supplier_contacts': {
        zh: '供应商',
        my: 'ကုန်ပစ္စည်း ပေးသွင်းသူများ'
    },
    'module_assessment': {
        zh: '员工评测',
        my: 'ဝန်ထမ်း စွမ်းဆောင်ရည် ဆန်းစစ်ခြင်း'
    },
    'module_ap': {
        zh: '应付账款',
        my: 'ပေးရန်ရှိ ငွေစာရင်းများ'
    },
    'module_self_invoice': {
        zh: '自制凭单',
        my: 'ကိုယ်တိုင်ထုတ် ငွေရပြေစာ'
    },
    'module_queue': {
        zh: '排队叫号',
        my: 'တန်းစီ စောင့်ဆိုင်းခြင်း'
    },
    'module_menu_management': {
        zh: '智能菜谱',
        my: 'စမတ် ဟင်းချက်နည်းများ'
    },
    'module_kitchen_alert': {
        zh: '通知厨房',
        my: 'မီးဖိုချောင်သတိပေးချက်'
    },

    // Module Detail Translation Mapping (For list view rendering)
    'mod_name_SETTLEMENT': { zh: '每日结算', my: 'နေ့စဉ် ငွေစာရင်း ပိတ်ခြင်း' },
    'mod_desc_SETTLEMENT': { zh: '现金流核对与支出记录', my: 'ငွေသားစီးဆင်းမှု တိုက်ဆိုင်စစ်ဆေးခြင်းနှင့် အသုံးစရိတ် မှတ်တမ်း' },
    'mod_name_ROSTER': { zh: '排班管理', my: 'အလှည့်ကျ တာဝန်ဇယား စီမံခန့်ခွဲမှု' },
    'mod_desc_ROSTER': { zh: '缺席记录与排班查看 (全员)', my: 'ပျက်ကွက်မှု မှတ်တမ်းနှင့် အလှည့်ကျတာဝန်ဇယား ကြည့်ရှုခြင်း (ဝန်ထမ်းအားလုံး)' },
    'mod_name_ROSTER_KITCHEN': { zh: '厨房排班', my: 'မီးဖိုချောင် အလှည့်ကျ တာဝန်ဇယား' },
    'mod_desc_ROSTER_KITCHEN': { zh: '厨房团队排班管理', my: 'မီးဖိုချောင်အဖွဲ့၏ အလှည့်ကျတာဝန်ဇယား စီမံခန့်ခွဲမှု' },
    'mod_name_ROSTER_FLOOR': { zh: '楼面排班', my: 'ဆိုင်ရှေ့တန်း အလှည့်ကျ တာဝန်ဇယား' },
    'mod_desc_ROSTER_FLOOR': { zh: '楼面/水吧/后勤排班管理', my: 'ဆိုင်ရှေ့၊ ဘားနှင့် သန့်ရှင်းရေးအဖွဲ့ အလှည့်ကျ တာဝန်ဇယား စီမံခန့်ခွဲမှု' },
    'mod_name_LOGBOOK': { zh: '运营日志', my: 'လုပ်ငန်းလည်ပတ်မှု မှတ်တမ်း' },
    'mod_desc_LOGBOOK': { zh: '客诉、维修与突发事件', my: 'ဝယ်ယူသူ တိုင်ကြားချက်၊ ပြုပြင်ထိန်းသိမ်းမှုနှင့် အရေးပေါ်ကိစ္စရပ်များ' },
    'mod_name_SOP_INSPECT': { zh: 'SOP 稽查', my: 'SOP လုပ်ငန်းစဉ် စစ်ဆေးမှု' },
    'mod_desc_SOP_INSPECT': { zh: '检查全员任务进度', my: 'ဝန်ထမ်းအားလုံး၏ နေ့စဉ်တာဝန် တိုးတက်မှု အခြေအနေကို စစ်ဆေးခြင်း' },
    'mod_name_INVENTORY_KITCHEN': { zh: '厨房库存', my: 'မီးဖိုချောင် ကုန်ပစ္စည်းစာရင်း' },
    'mod_desc_INVENTORY_KITCHEN': { zh: '生鲜 KF / 干货 KD / 酱料 KS', my: 'လတ်ဆတ်ဆန်းသစ်သော အသားငါး၊ ခြောက်ကုန်နှင့် ဆော့စ်ရည်များ' },
    'mod_name_INVENTORY_BAR': { zh: '水吧库存', my: 'ဘား ကုန်ပစ္စည်းစာရင်း' },
    'mod_desc_INVENTORY_BAR': { zh: '茶 BT / 罐装 BC / 水果 BF', my: 'လက်ဖက်ခြောက်၊ ဘူးသွင်းအချိုရည်နှင့် သစ်သီးဝလံများ' },
    'mod_name_INVENTORY_GENERAL': { zh: '后勤物资', my: 'အထွေထွေ နောက်ထောက်ခံ ပစ္စည်းများ' },
    'mod_desc_INVENTORY_GENERAL': { zh: '打包 SP / 杂项 SG', my: 'ထုပ်ပိုးပုံးများနှင့် အထွေထွေ သုံးကုန်ပစ္စည်းများ' },
    'mod_name_INVENTORY_FUEL': { zh: '燃料管理', my: 'လောင်စာဆီ စီမံခန့်ခွဲမှု' },
    'mod_desc_INVENTORY_FUEL': { zh: '煤气与木炭盘点', my: 'ဂတ်စ်အိုးနှင့် မီးသွေးစာရင်း စစ်ဆေးခြင်း' },
    'mod_name_INVENTORY_CHECK': { zh: '库存盘点', my: 'ပစ္စည်းစာရင်း စစ်ဆေးခြင်း' },
    'mod_desc_INVENTORY_CHECK': { zh: '执行盘点任务', my: 'သတ်မှတ်ထားသော ကုန်ပစ္စည်းစာရင်း စစ်ဆေးခြင်း လုပ်ငန်းများ ဆောင်ရွက်ရန်' },
    'mod_name_INVENTORY_VIEW': { zh: '库存总览', my: 'ကုန်ပစ္စည်းစာရင်း အကျဉ်းချုပ်' },
    'mod_desc_INVENTORY_VIEW': { zh: '查看库存与价值', my: 'လက်ရှိကုန်ပစ္စည်းစာရင်း ပမာဏနှင့် စုစုပေါင်းတန်ဖိုးကို ကြည့်ရှုရန်' },
    'mod_name_SUPPLIER_CONTACTS': { zh: '供应商', my: 'ပစ္စည်းပေးသွင်းသူ ဆက်သွယ်ရန်စာအုပ်' },
    'mod_desc_SUPPLIER_CONTACTS': { zh: '联系人与进货管理', my: 'ပေးသွင်းသူ ဆက်သွယ်ရန် လိပ်စာများနှင့် ဝယ်ယူမှု စီမံခန့်ခွဲခြင်း' },
    'mod_name_QUEUE_MANAGER': { zh: '排队取号', my: 'တန်းစီခြင်း စီမံခန့်ခွဲမှု' },
    'mod_desc_QUEUE_MANAGER': { zh: '发号、叫号与大屏控制', my: 'နံပါတ်ထုတ်ပေးခြင်း၊ ခေါ်ဆိုခြင်းနှင့် စခရင်ကြီး ထိန်းချုပ်ခြင်း' },
    'mod_name_QUEUE': { zh: '排队大屏', my: 'တန်းစီစောင့်ဆိုင်းခြင်း တီဗီစခရင်' },
    'mod_desc_QUEUE': { zh: '顾客端展示界面', my: 'ဝယ်ယူသူများ ကြည့်ရှုရန် တန်းစီနံပါတ်ပြသသည့် စနစ်' },
    'mod_name_ATTENDANCE_CONSOLE': { zh: '考勤总控', my: 'တက်ရောက်မှုစစ်ဆေးရေး ထိန်းချုပ်ခန်း' },
    'mod_desc_ATTENDANCE_CONSOLE': { zh: '打卡、点名与工时报表', my: 'Check-in / Check-out၊ လူစာရင်းခေါ်ယူခြင်းနှင့် အလုပ်ချိန် အစီရင်ခံစာများ' },
    'mod_name_SOP': { zh: 'SOP 稽查', my: 'SOP လုပ်ငန်းစဉ် စစ်ဆေးမှု' },
    'mod_desc_SOP': { zh: 'SOP 标准流程稽查与执行记录', my: 'SOP စံလုပ်ထုံးလုပ်နည်း စစ်ဆေးခြင်းနှင့် ဆောင်ရွက်မှုမှတ်တမ်း' },
    'mod_name_DAILY_ALERT': { zh: '每日告警', my: 'နေ့စဉ် သတိပေးချက်များ' },
    'mod_desc_DAILY_ALERT': { zh: '系统每日运行异常告警汇总', my: 'စနစ်၏နေ့စဉ် ပုံမှန်မဟုတ်သော သတိပေးချက်များ အကျဉ်းချုပ်' },
    'mod_name_REPORTS': { zh: '数据报表', my: 'ဒေတာ အစီရင်ခံစာများ' },
    'mod_desc_REPORTS': { zh: '营收、客流与多维度经营分析', my: 'ဝင်ငွေ၊ ဝယ်ယူသူဦးရေနှင့် လုပ်ငန်းလည်ပတ်မှု ဆန်းစစ်ချက်များ' },
    'mod_name_HR_FILES': { zh: '人事档案', my: 'ဝန်ထမ်း ကိုယ်ရေးဖိုင်များ' },
    'mod_desc_HR_FILES': { zh: '员工合同、履历与证照管理', my: 'ဝန်ထမ်း စာချုပ်၊ ကိုယ်ရေးရာဇဝင်နှင့် လိုင်စင်များ စီမံခန့်ခွဲမှု' },
    'mod_name_TREASURY': { zh: '资金库房', my: 'ငွေတိုက်နှင့် ဘဏ္ဍာရေး' },
    'mod_desc_TREASURY': { zh: '现金、备用金与多账户流水核对', my: 'လက်ကျန်ငွေ၊ အရန်ငွေနှင့် အကောင့်မျိုးစုံစာရင်း တိုက်ဆိုင်စစ်ဆေးခြင်း' },
    'mod_name_BILLS': { zh: '票据中心', my: 'ပြေစာနှင့် ဘောက်ချာ စင်တာ' },
    'mod_desc_BILLS': { zh: '报销凭证与发票数字化管理', my: 'ငွေပြန်အမ်းပြေစာနှင့် ဘောက်ချာများ စနစ်တကျ ထိန်းသိမ်းခြင်း' },
    'mod_name_WARRANTY': { zh: '保修管理', my: 'ပစ္စည်း ပြုပြင်ထိန်းသိမ်းမှု' },
    'mod_desc_WARRANTY': { zh: '设备报修与维保合同跟踪', my: 'စက်ပစ္စည်း ချို့ယွင်းမှုတိုင်ကြားခြင်းနှင့် ပြုပြင်ထိန်းသိမ်းမှုစာချုပ်များ' },
    'mod_name_AI_ASSISTANT': { zh: 'AI 智能助手', my: 'AI စမတ် ထိန်းချုပ်ရေးစနစ်' },
    'mod_desc_AI_ASSISTANT': { zh: '营运智能分析与一键审核辅助', my: 'လုပ်ငန်းလည်ပတ်မှု စမတ်ဆန်းစစ်ချက်နှင့် အတည်ပြုချက် အကူအညီ' },
    'mod_name_PROCUREMENT': { zh: '智能订货', my: 'စမတ် ကုန်ပစ္စည်း မှာယူခြင်း' },
    'mod_desc_PROCUREMENT': { zh: '补货、PO单与收货点算', my: 'ပစ္စည်းဖြည့်တင်းခြင်း၊ PO မှာယူလွှာနှင့် လက်ခံစစ်ဆေးခြင်း' },
    'mod_name_MENU_MANAGEMENT': { zh: '智能菜谱', my: 'စမတ် ဟင်းချက်နည်းများ' },
    'mod_desc_MENU_MANAGEMENT': { zh: '菜单定价与配方成本', my: 'ဟင်းပွဲစျေးနှုန်းသတ်မှတ်ခြင်းနှင့် ပါဝင်ပစ္စည်း ကုန်ကျစရိတ်' },
    'mod_name_ASSESSMENT': { zh: '能力评测', my: 'ဝန်ထမ်းစွမ်းဆောင်ရည် ဆန်းစစ်ခြင်း' },
    'mod_desc_ASSESSMENT': { zh: '员工技能评分与评估', my: 'ဝန်ထမ်းများ၏ ကျွမ်းကျင်မှုနှင့် စွမ်းဆောင်ရည်ကို အကဲဖြတ်အမှတ်ပေးခြင်း' },
    'mod_name_AP': { zh: '应付账款', my: 'ပေးရန်ရှိ ငွေစာရင်း စီမံခန့်ခွဲမှု' },
    'mod_desc_AP': { zh: '进货单据与付款管理', my: 'ကုန်ပစ္စည်း ပြေစာများနှင့် အသုံးစရိတ်များကို စီမံခန့်ခွဲခြင်း' },
    'mod_name_SELF_INVOICE': { zh: '自制凭单', my: 'ကိုယ်တိုင်ထုတ် ပြေစာများ ရေးဆွဲပြုလုပ်ခြင်း' },
    'mod_desc_SELF_INVOICE': { zh: '生成与自制支出凭证', my: 'အသုံးစရိတ် ပြေစာအထောက်အထားများ ဖန်တီးပြုလုပ်ခြင်း' },
    'mod_name_KITCHEN_ALERT': { zh: '通知厨房', my: 'မီးဖိုချောင်သတိပေးချက်' },
    'mod_desc_KITCHEN_ALERT': { zh: '一键催菜、重做与漏单通知', my: '催菜၊ အစားအစာပြန်လုပ်ရန် သို့မဟုတ် လွဲချော်သော အော်ဒါသတိပေးချက်' },

    // Tasks Page
    'tasks_title': {
        zh: '待我处理',
        my: 'ကျွန်ုပ် ဆောင်ရွက်ရန်'
    },
    'tasks_desc': {
        zh: '所有待办及确认事项',
        my: 'ဆောင်ရွက်ရန်နှင့် အတည်ပြုရန် အားလုံး'
    },
    'all_tasks': {
        zh: '所有任务',
        my: 'လုပ်ငန်းအားလုံး'
    },
    'all_tasks_desc': {
        zh: '所有已分配或公开的任务',
        my: 'တာဝန်ပေးထားသော သို့မဟုတ် အများမြင် လုပ်ငန်းအားလုံး'
    },
    'task_pending': {
        zh: '待处理',
        my: 'ဆောင်ရွက်ဆဲ'
    },
    'task_completed': {
        zh: '已完成',
        my: 'ပြီးစီး'
    },
    'task_confirmed': {
        zh: '已确认',
        my: 'အတည်ပြုပြီး'
    },
    'task_rejected': {
        zh: '已拒绝',
        my: 'ငြင်းပယ်ထားသည်'
    },
    'btn_approve': {
        zh: '确认/通过',
        my: 'အတည်ပြုသည်'
    },
    'btn_reject': {
        zh: '拒绝',
        my: 'ငြင်းပယ်သည်'
    },
    'btn_complete': {
        zh: '完成',
        my: 'ပြီးစီးသည်'
    },
    'tasks_empty': {
        zh: '所有事务已处理完毕',
        my: 'လုပ်ငန်းအားလုံး ပြီးစီးပါပြီ'
    },
    'tasks_empty_desc': {
        zh: '目前暂无属于您权限的待确认事项，请保持关注。',
        my: 'လောလောဆယ် သင့်တွင် အတည်ပြုရန် လုပ်ငန်းမရှိသေးပါ၊ ကျေးဇူးပြု၍ စောင့်ကြည့်ပေးပါ။'
    },

    // Functions Page
    'functions_title': {
        zh: '功能模块',
        my: 'လုပ်ဆောင်ချက် ကွန်ရက်'
    },
    'functions_desc': {
        zh: 'AUTHORIZED SYSTEMS GRID',
        my: 'ခွင့်ပြုထားသော စနစ်များ'
    },
    'not_connected': {
        zh: '未接入控制台',
        my: 'ကွန်ဆိုးလ်သို့ မချိတ်ဆက်ထားပါ'
    },
    'not_open_tip': {
        zh: '暂未向管理层界面开放接入',
        my: 'စီမံခန့်ခွဲမှု မျက်နှာပြင်သို့ မဖွင့်သေးပါ'
    },
    'no_permission_tip': {
        zh: '🔒 安全拒绝：您的账号无权访问该功能模块。',
        my: '🔒 လုံခြုံရေး ငြင်းပယ်ခြင်း- သင်၏ အကောင့်သည် ဤလုပ်ဆောင်ချက်ကို ဝင်ရောက်ခွင့် မရှိပါ။'
    },
    'no_modules_empty': {
        zh: '暂无可用功能模块',
        my: 'ရရှိနိုင်သော လုပ်ဆောင်ချက် မရှိသေးပါ'
    },
    'no_modules_empty_desc': {
        zh: '您的角色目前未分配任何模块，如有疑问请联系系统管理员。',
        my: 'သင့်ရာထူးအတွက် လုပ်ဆောင်ချက် သတ်မှတ်မထားပါ၊ မေးမြန်းလိုပါက စီမံခန့်ခွဲသူကို ဆက်သွယ်ပါ။'
    },

    // Me Page
    'profile': {
        zh: '个人资料',
        my: 'ကိုယ်ရေးအချက်အလက်များ'
    },
    'emp_id': {
        zh: '员工编号',
        my: 'ဝန်ထမ်းနံပါတ်'
    },
    'emp_dept': {
        zh: '所属部门',
        my: 'တာဝန်ကျဌာန'
    },
    'emp_status': {
        zh: '雇佣状态',
        my: 'အလုပ်ခန့်ထားမှု အခြေအနေ'
    },
    'status_regular': {
        zh: '正式员工',
        my: 'အမြဲတမ်းဝန်ထမ်း'
    },
    'status_probation': {
        zh: '试用期员工',
        my: 'အစမ်းခန့်ဝန်ထမ်း'
    },
    'status_terminated': {
        zh: '已离职员工',
        my: 'အလုပ်မှ နှုတ်ထွက်ပြီးသူ'
    },
    'logout': {
        zh: '安全退出账号',
        my: 'အကောင့်မှ စိတ်ချစွာ ထွက်ရန်'
    },

    // AdminDashboard / Shell
    'mgmt_console': {
        zh: '管理控制台',
        my: 'စီမံခန့်ခွဲရေး ကွန်ဆိုးလ်'
    },
    'mgmt_label': {
        zh: 'MANAGEMENT',
        my: 'စီမံခန့်ခွဲမှု'
    },
    'no_accessible_modules': {
        zh: '当前没有可访问的模块。',
        my: 'လောလောဆယ် ဝင်ရောက်နိုင်သော လုပ်ဆောင်ချက် မရှိပါ။'
    },
    'insufficient_permissions': {
        zh: '权限不足，无法访问该模块。',
        my: 'ခွင့်ပြုချက် မလုံလောက်သဖြင့် ဤလုပ်ဆောင်ချက်ကို ဝင်ရောက်၍မရပါ။'
    },
    'module_closed_tip': {
        zh: '该模块已关闭或未启用。',
        my: 'ဤလုပ်ဆောင်ချက်ကို ပိတ်ထားသည် သို့မဟုတ် အသုံးမပြုနိုင်ပါ။'
    }
} satisfies Record<string, Partial<Record<ManagementLang | string, string>>>;

export type ManagementTranslationKey = keyof typeof MANAGEMENT_TRANSLATIONS;

export function mt(key: ManagementTranslationKey | string, lang: ManagementLang): string {
    const norm = normalizeLanguage(lang);
    const entry = (MANAGEMENT_TRANSLATIONS as any)[key];
    if (!entry) {
        if (norm === 'en') return cleanEnglishOnly(key) || key.replace(/_/g, ' ');
        return key;
    }
    if (norm === 'en') {
        if (entry.en) return entry.en;
        if (entry.zh) return cleanEnglishOnly(entry.zh) || entry.zh;
    }
    if (norm === 'my' && entry.my) {
        return entry.my;
    }
    if (entry[norm]) {
        return entry[norm];
    }
    return entry.zh || "";
}

export function getModuleTranslatedLabel(modKey: string, lang: ManagementLang, defaultLabel: string): string {
    const norm = normalizeLanguage(lang);
    if (norm === 'zh_en') return defaultLabel;
    if (norm === 'en') return cleanEnglishOnly(defaultLabel) || modKey.replace(/_/g, ' ').toUpperCase();
    const key = `mod_name_${modKey}`;
    const entry = (MANAGEMENT_TRANSLATIONS as any)[key];
    if (entry && entry[norm]) {
        return entry[norm];
    }
    return modKey.replace(/_/g, ' ').toUpperCase();
}

export function getModuleTranslatedDesc(modKey: string, lang: ManagementLang, defaultDesc: string): string {
    const norm = normalizeLanguage(lang);
    if (norm === 'zh_en') return defaultDesc;
    if (norm === 'en') return cleanEnglishOnly(defaultDesc) || defaultDesc;
    const key = `mod_desc_${modKey}`;
    const entry = (MANAGEMENT_TRANSLATIONS as any)[key];
    if (entry && entry[norm]) {
        return entry[norm];
    }
    return mt('not_open_tip', lang);
}
