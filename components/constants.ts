import React from 'react';
import {
    Wallet, CalendarOff, BookOpen, ClipboardCheck, Utensils, Coffee, Package,
    Users, FileText, Truck, Armchair, Eye, CheckSquare, CreditCard, Banknote,
    Landmark, ShieldCheck, Clock, AlertTriangle, ChefHat, ShoppingCart, Flame, Award,
    Sparkles, BellRing
} from 'lucide-react';

export * from '../constants/suppliers';
export * from '../constants/menu';
export * from '../constants/staff';
export * from '../constants/inventory';

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 单条 SOP 任务 */
export interface SopTask {
    label:    string;
    standard: string;
    why:      string;
}

/** 单个岗位的 SOP（开铺 + 打烊） */
export interface SopDetail {
    start: { title: string; tasks: SopTask[] };
    end:   { title: string; tasks: SopTask[] };
}

interface ModuleDefinition {
    label:    string;
    desc:     string;
    icon:     React.ElementType;
    tab:      string;
    section?: string;
    guide:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MODULE_DEFINITIONS (彻底解决 Fix #8: 自动推导类型)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 💡 架构优化：使用 satisfies 替代显式的 Record 声明。
 * 这样既能严格检查每个 value 是否符合 ModuleDefinition，
 * 又能让 TypeScript 精准推导出具体的 key 集合。
 */
export const MODULE_DEFINITIONS = {
    // ── 订货 ──
    'PROCUREMENT': {
        label: '采购订货 (Ordering)', desc: '补货、PO单与收货点算', icon: ShoppingCart, tab: 'PROCUREMENT',
        guide: '1. 智能补货：系统自动列出库存不足的物品。\n2. 发送订单：一键生成 PO 单并 WhatsApp 发送。\n3. 收货点算：货到后，开启 PO 单进行数量核对，确认无误后自动入库。',
    },
    // ── 菜单 ──
    'MENU_MANAGEMENT': {
        label: '智能菜谱 (Smart Menu)', desc: '菜单定价与配方成本', icon: Utensils, tab: 'MENU_MANAGEMENT',
        guide: '1. 菜单管理：编辑菜品名称、图片与价格。\n2. 配方成本：为每个规格设定食材配方，系统自动计算毛利。\n3. 阅览模式：提供给顾客查看的电子菜单模式。',
    },
    // ── 结算 ──
    'SETTLEMENT': {
        label: '每日结算 (Settlement)', desc: '现金流核对与支出记录', icon: Wallet, tab: 'SETTLEMENT',
        guide: '1. 打烊后先从StoreHub导出当日Report。2. 点算钱箱内所有现金并输入。3. 录入所有现金支出单据(需拍照)。4. 差异必须控制在RM10以内。',
    },
    // ── 排班 ──
    'ROSTER': {
        label: '排班管理 (Roster)', desc: '缺席记录与排班查看 (全员)', icon: CalendarOff, tab: 'ROSTER',
        guide: '1. 仅限管理层操作。2. 红色代表MC/缺席，黄色代表有特别备注。3. 更改排班需至少提前3天。',
    },
    'ROSTER_KITCHEN': {
        label: '厨房排班 (Kitchen Roster)', desc: '厨房团队排班管理', icon: ChefHat, tab: 'ROSTER', section: 'KITCHEN',
        guide: '管理厨房人员的排班与休假。',
    },
    'ROSTER_FLOOR': {
        label: '楼面排班 (Floor Roster)', desc: '楼面/水吧/后勤排班管理', icon: Coffee, tab: 'ROSTER', section: 'FLOOR',
        guide: '管理楼面、水吧及清洁人员的排班与休假。',
    },
    // ── 日志 ──
    'LOGBOOK': {
        label: '运营日志 (Logbook)', desc: '客诉、维修与突发事件', icon: BookOpen, tab: 'LOGBOOK',
        guide: '1. 发生客诉必须即时拍照并上传。2. 维修事项需标注紧急程度。3. 所有的Log老板都会即时收到通知。',
    },
    // ── SOP ──
    'SOP_INSPECT': {
        label: 'SOP 稽查 (Inspection)', desc: '检查全员任务进度', icon: ClipboardCheck, tab: 'SOP_INSPECT',
        guide: '检查员工是否完成了开铺和打烊任务。如果进度条不是100%，请到现场核实工作情况。',
    },
    'SOP': {
        label: '每日任务 (SOP)', desc: '个人岗位开铺打烊', icon: ClipboardCheck, tab: 'SOP',
        guide: '查看并完成每日分配的 SOP 任务。',
    },
    // ── 库存 ──
    'INVENTORY_KITCHEN': {
        label: '厨房库存 (Kitchen K)', desc: '生鲜 KF / 干货 KD / 酱料 KS', icon: Utensils, tab: 'INVENTORY_CHECK', section: 'KITCHEN',
        guide: '1. 每天下午4:00盘点KF系列面条肉类。2. 发现缺货需立即通报。3. 输入数量为实物数量，系统会自动对比预警。',
    },
    'INVENTORY_BAR': {
        label: '水吧库存 (Bar B)', desc: '茶 BT / 罐装 BC / 水果 BF', icon: Coffee, tab: 'INVENTORY_CHECK', section: 'BAR',
        guide: '1. 盘点水果新鲜度。2. 罐装饮品需盘点数量以防内耗。3. 凉茶包剩余量少于2袋时需申购。',
    },
    'INVENTORY_GENERAL': {
        label: '后勤物资 (Supply S)', desc: '打包 SP / 杂项 SG', icon: Package, tab: 'INVENTORY_CHECK', section: 'GENERAL',
        guide: '每周日进行全盘点。打包盒是主要耗材，需确保存量足够周一至周五使用。',
    },
    'INVENTORY_FUEL': {
        label: '燃料管理 (Fuel)', desc: '煤气与木炭盘点', icon: Flame, tab: 'INVENTORY_CHECK', section: 'FUEL',
        guide: '专项管理煤气桶与木炭库存。',
    },
    'INVENTORY_CHECK': {
        label: '库存盘点 (Check)', desc: '执行盘点任务', icon: CheckSquare, tab: 'INVENTORY_CHECK',
        guide: '执行每日或每周的库存盘点任务。',
    },
    'INVENTORY_VIEW': {
        label: '库存总览 (View)', desc: '查看库存与价值', icon: Eye, tab: 'INVENTORY_VIEW',
        guide: '查看所有库存的实时数量与总价值 (老板/管理层专用)。',
    },
    // ── 供应商 ──
    'SUPPLIER_CONTACTS': {
        label: '供应商 (Suppliers)', desc: '联系人与进货管理', icon: Truck, tab: 'SUPPLIER_CONTACTS',
        guide: '查看所有供应商的WhatsApp。下单时请对照系统内的【目录价格】，防止供应商多算。',
    },
    // ── 队号 ──
    'QUEUE_MANAGER': {
        label: '排队叫号 (Queue)', desc: '发号、叫号与大屏控制', icon: Armchair, tab: 'QUEUE',
        guide: '1. 高峰期由柜台或马王负责。2. 5人以上选大桌(C系列)。3. 叫号三次不应需跳号并在系统点取消。',
    },
    'QUEUE': {
        label: '排队大屏 (TV)', desc: '顾客端展示界面', icon: Armchair, tab: 'QUEUE',
        guide: '显示排队号码和语音播报。',
    },
    'KITCHEN_ALERT': {
        label: '厨房通知 (Kitchen Alert)', desc: '催菜、漏单、做错与重做通知', icon: BellRing, tab: 'KITCHEN_ALERT',
        guide: '1. 输入桌号和菜单单号。\n2. 选择菜品、大小、数量和通知原因。\n3. 提交后在“我的通知”查看厨房是否已接收或解决。',
    },
    // ── 考勤 ──
    'ATTENDANCE_CONSOLE': {
        label: '考勤管理 (Attendance)', desc: '打卡、点名与工时报表', icon: Clock, tab: 'ATTENDANCE_CONSOLE',
        guide: '管理层专用考勤系统。支持代打卡、补卡、快速点名及查看月度工时达标情况。',
    },
    // ── 评测 ──
    'ASSESSMENT': {
        label: '技能评估 (Skill Matrix)', desc: '员工技能评分与评估', icon: Award, tab: 'ASSESSMENT',
        guide: '对下属或同级员工进行多维度能力打分 (效率/态度/技能等)。',
    },
    // ── 今日预警 ──
    'DAILY_ALERT': {
        label: '今日异常 (Daily Alert)', desc: '查看库存预警与日志', icon: AlertTriangle, tab: 'DAILY_ALERT',
        guide: '查看今日的库存不足、未读日志和紧急账单提醒。',
    },
    // ── 财务与系统 ──
    'REPORTS': {
        label: '财务报表 (Reports)', desc: 'P&L 损益表查看', icon: FileText, tab: 'REPORT',
        guide: '老板专用。分析毛利与支出占比。',
    },
    'HR_FILES': {
        label: '人事档案 (HR Files)', desc: '员工资料与权限管理', icon: Users, tab: 'HR_FILES',
        guide: '录入新员工。此处决定了员工的底薪和可以看见的模块。',
    },
    'AP': {
        label: '应付账款 (AP)', desc: '进货单据与付款管理', icon: CreditCard, tab: 'AP',
        guide: '管理所有进货单据和非经常性支出。',
    },
    'SELF_INVOICE': {
        label: '自开凭单 (Voucher Maker)', desc: '生成与自制支出凭证', icon: FileText, tab: 'SELF_INVOICE',
        guide: '1. 一键或批量自开凭单。\n2. 用于记录无正规发票的零散支出。',
    },
    'TREASURY': {
        label: '资金管理 (Treasury)', desc: '现金流与股东资金', icon: Landmark, tab: 'TREASURY',
        guide: '查看公司总资金状况，记录转账和注资。',
    },
    'BILLS': {
        label: '经常性支出 (Bills)', desc: '租金水电等月费', icon: Banknote, tab: 'BILLS',
        guide: '管理每月的固定循环账单。',
    },
    'WARRANTY': {
        label: '保修记录 (Warranty)', desc: '设备保修与文档', icon: ShieldCheck, tab: 'WARRANTY',
        guide: '记录设备的购买日期、保修到期日及发票链接。',
    },
    'AI_ASSISTANT': {
        label: 'AI 智控脑库 (AI Assistant)', desc: 'AI经营稽查与语音决策问答', icon: Sparkles, tab: 'AI_ASSISTANT',
        guide: '1. AI 经营稽查：点击或语音唤醒AI对账与异常问答。\n2. 决策脑库：查询店内实时数据与多维经营决策分析。',
    },
} satisfies Record<string, ModuleDefinition>;

// 🔥 黑科技在这里：直接由上方数据生成 AppModule 联合类型
// 你现在可以直接去 types.ts 里写: import { AppModule } from '../constants';
export type AppModule = keyof typeof MODULE_DEFINITIONS;


// ─────────────────────────────────────────────────────────────────────────────
// 2. MODULE_SYSTEM_TASKS (防呆设计：收紧 string 泛型)
// ─────────────────────────────────────────────────────────────────────────────

/** 必须完全匹配 MODULE_DEFINITIONS 中的合法 Key，防止拼写错误导致任务没显示 */
export type SystemTaskKey = Extract<AppModule, 'SETTLEMENT' | 'INVENTORY_KITCHEN' | 'INVENTORY_BAR' | 'INVENTORY_GENERAL' | 'INVENTORY_FUEL'>;

export const MODULE_SYSTEM_TASKS: Record<SystemTaskKey, SopTask[]> = {
    'SETTLEMENT': [
        { label: '提交每日结算单', standard: '差异 < RM10', why: '财务日清日结' },
        { label: '核对钱箱现金',   standard: '金额准确',    why: '防止遗失' },
    ],
    'INVENTORY_KITCHEN': [
        { label: '厨房库存盘点',   standard: 'KF系列每日必盘', why: '成本控制' },
        { label: '检查食材保质期', standard: 'FIFO',           why: '食品安全' },
    ],
    'INVENTORY_BAR': [
        { label: '水吧库存盘点',     standard: '每日营业前',     why: '成本控制' },
        { label: '检查水果新鲜度',   standard: '过期立即下架',   why: '食品安全' },
        { label: '凉茶包存量检查',   standard: '< 2袋需申购',    why: '防断供' },
    ],
    'INVENTORY_GENERAL': [
        { label: '后勤物资盘点',   standard: '每周日全盘', why: '耗材管控' },
        { label: '打包盒存量检查', standard: '足够5天用量', why: '外卖运营' },
    ],
    'INVENTORY_FUEL': [
        { label: '煤气桶剩余量记录', standard: '每晚营业后', why: '防断供' },
        { label: '木炭库存盘点',     standard: '每晚营业后', why: '防断供' },
    ],
};


// ─────────────────────────────────────────────────────────────────────────────
// 3. ROLE_SOP_DETAILS (保持原有优秀结构)
// ─────────────────────────────────────────────────────────────────────────────

export type RoleKey =
    | 'MANAGER' | 'SUPERVISOR'
    | 'COUNTER' | 'CAPTAIN' | 'WAITER' | 'CLEANER'
    | 'HEAD_CHEF' | 'ASST_CHEF' | 'CUTTER' | 'COMMIS' | 'BAR';

export const ROLE_SOP_DETAILS: Record<RoleKey, SopDetail> = {
    // ── 管理层 ──
    'MANAGER': {
        start: {
            title: 'Opening (开铺管理)',
            tasks: [
                { label: '解锁店门与解除警报',         standard: '准时 16:00', why: '营运' },
                { label: '检查昨晚结算差异',           standard: '查阅 Logbook', why: '财务安全' },
                { label: '检查员工仪容仪表',           standard: '制服整洁',   why: '品牌形象' },
                { label: '确认今日订位 (Reservations)', standard: '预留桌位',   why: '客户服务' },
            ],
        },
        end: {
            title: 'Closing (打烊管理)',
            tasks: [
                { label: '审核今日 Logbook',   standard: '无遗漏事项',  why: '复盘' },
                { label: '监督现金入保险柜',   standard: '双人核对',    why: '防盗' },
                { label: '检查全店门窗锁闭',   standard: '确认上锁',    why: '安全' },
                { label: '开启防盗系统',       standard: 'Alarm Active', why: '安保' },
            ],
        },
    },

    'SUPERVISOR': {
        start: {
            title: 'Opening (开铺督导)',
            tasks: [
                { label: '开启灯光与冷气',            standard: '全店通亮', why: '环境' },
                { label: '分配员工区域 (Sectioning)', standard: '合理调度', why: '效率' },
                { label: '检查楼面清洁度',            standard: '无异味无垃圾', why: '卫生' },
                { label: '播放店内音乐',              standard: '音量适中', why: '氛围' },
            ],
        },
        end: {
            title: 'Closing (打烊督导)',
            tasks: [
                { label: '安排员工打扫卫生', standard: '分区清洁',    why: '整洁' },
                { label: '关闭非必要电源',   standard: '招牌/冷气',   why: '节能' },
                { label: '检查厕所卫生',     standard: '无积水',      why: '卫生' },
            ],
        },
    },

    // ── 楼面 ──
    'COUNTER': {
        start: {
            title: 'Opening (柜台开铺)',
            tasks: [
                { label: 'StoreHub 开机登录',      standard: '系统在线',  why: '收银' },
                { label: '检查钱箱备用金 (Float)', standard: 'RM 500',    why: '找赎' },
                { label: '检查打印纸/收据纸',      standard: '备足两卷',  why: '耗材' },
                { label: '开启外卖接单平板',       standard: 'Grab/Panda', why: '外卖' },
            ],
        },
        end: {
            title: 'Closing (柜台打烊)',
            tasks: [
                { label: '打印每日结算单 (Settlement)', standard: '数据准确', why: '财务' },
                { label: '点算现金 (Cash Count)',       standard: '填入系统', why: '核对' },
                { label: '整理柜台杂物',               standard: '桌面整洁', why: '形象' },
                { label: '关闭 iPad 与打印机',         standard: '断电',     why: '设备' },
            ],
        },
    },

    'CAPTAIN': {
        start: {
            title: 'Opening (领班开铺)',
            tasks: [
                { label: '检查 iPad 点餐机电量',        standard: '100% Charged', why: '工具' },
                { label: '熟悉今日缺货 (86 List)',       standard: '通知全员',     why: '服务' },
                { label: '检查招牌灯箱',                 standard: '正常亮起',     why: '引流' },
            ],
        },
        end: {
            title: 'Closing (领班打烊)',
            tasks: [
                { label: '整理菜单 (Menu Books)',    standard: '无破损/归位', why: '保养' },
                { label: '检查未结单据 (Open Bills)', standard: '全部清空',    why: '防漏单' },
                { label: '关闭区域灯光',             standard: '分区执行',    why: '节能' },
            ],
        },
    },

    'WAITER': {
        start: {
            title: 'Opening (楼面准备)',
            tasks: [
                { label: '擦拭桌椅 (Wipe Tables)',  standard: '无油渍',     why: '卫生' },
                { label: '补充调味品 (Chili/Soy)',  standard: '满瓶/清洁',  why: '备料' },
                { label: '检查餐具筒',              standard: '补满筷子汤匙', why: '服务' },
                { label: '准备茶水壶',              standard: '热水充足',   why: '茶水' },
            ],
        },
        end: {
            title: 'Closing (楼面收尾)',
            tasks: [
                { label: '扫地与拖地',       standard: '无食物残渣', why: '清洁' },
                { label: '补充纸巾/牙签',    standard: '补满',       why: '明日准备' },
                { label: '归位桌椅',         standard: '整齐划一',   why: '美观' },
                { label: '清理工作台垃圾',   standard: '清空',       why: '防虫' },
            ],
        },
    },

    'CLEANER': {
        start: {
            title: 'Opening (保洁准备)',
            tasks: [
                { label: '彻底清洗厕所',       standard: '无异味/干爽', why: '卫生' },
                { label: '补充洗手液/擦手纸',  standard: '充足',        why: '服务' },
                { label: '拖大厅地面',         standard: '干净',        why: '印象' },
            ],
        },
        end: {
            title: 'Closing (保洁收尾)',
            tasks: [
                { label: '清理所有垃圾桶', standard: '换新袋', why: '卫生' },
                { label: '清洗拖把并晾干', standard: '悬挂',   why: '防臭' },
                { label: '再次清洗厕所',   standard: '消毒',   why: '保养' },
            ],
        },
    },

    // ── 厨房 ──
    'HEAD_CHEF': {
        start: {
            title: 'Opening (头手开炉)',
            tasks: [
                { label: '试炭火 (Test Wok Heat)',      standard: '火力猛',   why: '锅气' },
                { label: '检查酱料味道 (Taste Test)',   standard: '咸淡适中', why: '品控' },
                { label: '确认今日特别推荐',            standard: '通知楼面', why: '销售' },
                { label: '检查猪油渣库存',              standard: '足够',     why: '灵魂' },
            ],
        },
        end: {
            title: 'Closing (头手收炉)',
            tasks: [
                { label: '熄灭炭火 (Extinguish)', standard: '无明火', why: '安全' },
                { label: '关闭煤气总阀',          standard: 'Locked', why: '防爆' },
                { label: '检查炉台卫生',          standard: '无油垢', why: '清洁' },
                { label: '盖好酱料桶',            standard: '密封',   why: '防虫' },
            ],
        },
    },

    'ASST_CHEF': {
        start: {
            title: 'Opening (二锅准备)',
            tasks: [
                { label: '准备汤底 (Soup Base)', standard: '滚热',   why: '汤面' },
                { label: '预炸鸡翅/五香',        standard: '备货充足', why: '速度' },
                { label: '检查面条库存',         standard: '从冷房取出', why: '备料' },
            ],
        },
        end: {
            title: 'Closing (二锅收尾)',
            tasks: [
                { label: '过滤炸油 (Filter Oil)', standard: '去除残渣', why: '节约' },
                { label: '清洗炸炉',              standard: '干净',     why: '卫生' },
                { label: '收拾备料盘',            standard: '放入冰箱', why: '保鲜' },
            ],
        },
    },

    'CUTTER': {
        start: {
            title: 'Opening (砧板准备)',
            tasks: [
                { label: '磨刀 (Sharpen Knives)', standard: '锋利',       why: '效率' },
                { label: '切配今日蔬菜',          standard: '菜心/包菜',  why: '备料' },
                { label: '腌制肉类 (Marinate)',   standard: '猪肉/鸡肉',  why: '入味' },
                { label: '检查冰箱温度',          standard: '< 4°C',      why: '食安' },
            ],
        },
        end: {
            title: 'Closing (砧板收尾)',
            tasks: [
                { label: '盖好所有生鲜食材',        standard: '保鲜膜',   why: '防干' },
                { label: '清洗砧板 (Sanitize)',      standard: '消毒水',   why: '防霉' },
                { label: '清理水槽滤网',             standard: '无残渣',   why: '防堵' },
                { label: '倒垃圾',                   standard: '清空',     why: '卫生' },
            ],
        },
    },

    'COMMIS': {
        start: {
            title: 'Opening (马王准备)',
            tasks: [
                { label: '补满酱料瓶',           standard: '酱油/胡椒',  why: '补给' },
                { label: '准备打包盒 (Takeaway)', standard: '折叠好',     why: '外卖' },
                { label: '检查出菜盘',           standard: '数量足够',   why: '流转' },
                { label: '补充猪油渣',           standard: '从大桶取',   why: '备料' },
            ],
        },
        end: {
            title: 'Closing (马王收尾)',
            tasks: [
                { label: '擦拭出菜台 (Pass)', standard: '无油渍',   why: '清洁' },
                { label: '拖厨房地面',        standard: '去油除滑', why: '安全' },
                { label: '清洗抹布',          standard: '漂白水',   why: '卫生' },
                { label: '倒厨房垃圾',        standard: '不留过夜', why: '防鼠' },
            ],
        },
    },

    'BAR': {
        start: {
            title: 'Opening (水吧准备)',
            tasks: [
                { label: '煲凉茶 (Boil Herbal)', standard: '按配方',   why: '招牌' },
                { label: '切酸柑/柠檬',          standard: '备满一盒', why: '备料' },
                { label: '检查冰块 (Ice)',        standard: '满桶',     why: '冷饮' },
                { label: '检查糖浆存量',          standard: '足够',     why: '备料' },
            ],
        },
        end: {
            title: 'Closing (水吧收尾)',
            tasks: [
                { label: '清洗搅拌机/雪克杯', standard: '无残留',   why: '卫生' },
                { label: '封好水果盒',        standard: '放入冰箱', why: '保鲜' },
                { label: '清理水吧水槽',      standard: '无茶叶渣', why: '防堵' },
                { label: '关闭开水机',        standard: '断电',     why: '安全' },
            ],
        },
    },
};