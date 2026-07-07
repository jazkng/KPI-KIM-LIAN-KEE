import React from 'react';
import { 
    Flame, Users, DollarSign, Zap, BookOpen, Heart, 
    Sparkles, Timer, Shield, Crown, ChefHat, Coffee,
    ClipboardCheck, Target, Car, Trash2 
} from 'lucide-react';

// ============================================================================
// 1. 基础接口定义
// ============================================================================

export type Department = 'KITCHEN' | 'BAR' | 'FLOOR' | 'LOGISTICS' | 'EXEMPT';

export interface MetricDef {
    key: string;
    label: string;
    desc: string;
    icon: React.ElementType; // 💡 优化：把 any 换成具体的组件类型
}

export interface JobMetricConfig {
    label: string;
    emoji: string;
    department: Department;
    metrics: MetricDef[];
    assessable: boolean;
}

export const MANAGEMENT_DIMENSIONS: MetricDef[] = [
    { key: 'loyalty', label: '忠诚与执行力（听话）', desc: '面对调动、新政策、老板指令时的服从度与落地速度。', icon: Shield },
    { key: 'adaptability', label: '适应能力', desc: '面对环境、菜单、系统或人员变动时的态度与工作能力的保持度。', icon: Zap },
    { key: 'teamwork', label: '团队合作能力', desc: '跨部门配合度（前厅后厨），此项数据将作为生成“团队关系额外报告”的基础。', icon: Users },
    { key: 'personal_grooming', label: '个人修养与职业操守', desc: '包含个人卫生（形象/指甲/衣服油污等）、工作态度（敬业度/服从性等）、个人纪律性、个人时间观念与考勤情况。', icon: Sparkles },
    { key: 'job_capability', label: '职位能力（动态变动）', desc: '根据具体职位动态细分的核心业务硬实力与熟练度。', icon: Target },
    { key: 'mentorship', label: '传帮带能力（扩张裂变能力）', desc: '核心技术标准化输出，带教新人与人才梯队建设。', icon: BookOpen }
];

export const EMPLOYEE_DIMENSIONS: MetricDef[] = [
    { key: 'loyalty', label: '忠诚与执行力（听话）', desc: '面对调动、新政策、老板指令时的服从度与落地速度。', icon: Shield },
    { key: 'adaptability', label: '适应能力', desc: '面对环境、菜单、系统或人员变动时的态度与工作能力的保持度。', icon: Zap },
    { key: 'teamwork', label: '团队合作能力', desc: '跨部门配合度（前厅后厨），此项数据将作为生成“团队关系额外报告”的基础。', icon: Users },
    { key: 'personal_grooming', label: '个人修养与职业操守', desc: '包含个人卫生（形象/指甲/衣服油污等）、工作态度（敬业度/服从性等）、个人纪律性、个人时间观念与考勤情况。', icon: Sparkles },
    { key: 'job_capability', label: '职位能力（动态变动）', desc: '根据具体职位动态细分的核心业务硬实力与熟练度。', icon: Target },
    { key: 'stress_handling', label: '抗压与危机处理', desc: '爆单、客诉、人手不足时的情绪管理与解决能力。', icon: Flame }
];

// ============================================================================
// 2. 岗位 → 指标映射表 (单一数据源)
// ============================================================================

/**
 * 💡 架构优化：直接定义配置，由 TypeScript 自动推导 JobCategory。
 * 以后新增岗位，只管往这个大对象里加就行了，全网自动识别！
 */
export const JOB_METRICS = {
    KITCHEN_HEAD: {
        label: '头手 / 行政总厨', emoji: '👨‍🍳', department: 'KITCHEN', assessable: true,
        metrics: MANAGEMENT_DIMENSIONS
    },
    KITCHEN_SECOND: {
        label: '帮锅 / 厨师 / 学徒', emoji: '🔥', department: 'KITCHEN', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    KITCHEN_PREP: {
        label: '占板 (切配)', emoji: '🔪', department: 'KITCHEN', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    KITCHEN_FRY: {
        label: '打荷 (炸炉/摆盘)', emoji: '🍳', department: 'KITCHEN', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    KITCHEN_RUNNER: {
        label: '马王 / 厨房帮手 / 看单', emoji: '🏃', department: 'KITCHEN', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    BAR: {
        label: '水吧员', emoji: '🥤', department: 'BAR', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    FLOOR_MANAGER: {
        label: '经理 / 主管 / HR / 店管', emoji: '👔', department: 'FLOOR', assessable: true,
        metrics: MANAGEMENT_DIMENSIONS
    },
    FLOOR_CASHIER: {
        label: '柜台 / 收银', emoji: '💳', department: 'FLOOR', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    FLOOR_WAITER: {
        label: '写单 / 服务员 / 外卖', emoji: '🛎️', department: 'FLOOR', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    LOGISTICS_CLEAN: {
        label: '清洁员 / 洗碗', emoji: '🧹', department: 'LOGISTICS', assessable: true,
        metrics: EMPLOYEE_DIMENSIONS
    },
    PART_TIME: {
        label: '兼职', emoji: '⏱️', department: 'EXEMPT', assessable: false,
        metrics: []
    },
    OWNER: {
        label: '最高决策层 / 老板', emoji: '👑', department: 'EXEMPT', assessable: false,
        metrics: []
    },
    UNKNOWN: {
        label: '未分类 ⚠️', emoji: '❓', department: 'EXEMPT', assessable: false,
        metrics: []
    }
} satisfies Record<string, JobMetricConfig>;

export interface SubItemDef {
    key: string;
    label: string;
    desc: string;
}

export const JOB_CAPABILITY_SUBITEMS: Record<string, SubItemDef[]> = {
    // 水吧
    BAR: [
        { key: 'drink_speed', label: '出水速度与节奏', desc: '爆单时，出单的先后顺序和整体速度。' },
        { key: 'drink_consistency', label: '味道一致性', desc: '是否严格按照配方（冰量、糖量、茶底比例），确保每杯茶饮味道一样。' },
        { key: 'drink_maintenance', label: '设备保养与卫生', desc: '制冰机、咖啡机/茶咖设备的日常清洁，水吧台面的整洁度。' },
        { key: 'drink_waste', label: '物料损耗控制', desc: '对水果、鲜奶、茶叶等保质期短的物料抓得准不准，有无严重浪费。' }
    ],
    // 厨师
    KITCHEN_SECOND: [
        { key: 'chef_flavor', label: '锅气与火候掌控', desc: '核心炒面/炒菜的出品质量，是否达到金莲记的标准老字号味道。' },
        { key: 'chef_speed', label: '出餐速度', desc: '在高峰期，能否高效连续翻锅，控好出餐时间。' },
        { key: 'chef_safety', label: '厨房安全与卫生', desc: '灶台、油锅的安全使用，收档时的卫生清洁。' },
        { key: 'chef_waste', label: '食材利用率', desc: '砧板切配是否精准，有无恶意浪费核心食材（肉类、酱料）。' }
    ],
    // 打荷
    KITCHEN_FRY: [
        { key: 'prep_speed', label: '备料与速度', desc: '调料、配料、盘饰的准备是否齐全，递送速度能否跟上厨师的炒菜节奏。' },
        { key: 'prep_accuracy', label: '传单精准度', desc: '看单、叫单是否清晰，有没有漏单、错单、重单。' },
        { key: 'prep_hygiene', label: '前置卫生', desc: '负责区域的餐具洁净度、打荷台面的即时清理。' }
    ],
    // 马王 / 砧板 (占板 KITCHEN_PREP, 马王 KITCHEN_RUNNER)
    KITCHEN_PREP: [
        { key: 'cut_standard', label: '刀工与标准化', desc: '肉类、蔬菜的切割规格（厚薄、长短）是否完全符合标准，确保成熟度一致。' },
        { key: 'cut_sequence', label: '出货顺序', desc: '根据出餐单的缓急，精准、快速地完成切配。' },
        { key: 'cut_stock', label: '库存与保鲜管理', desc: '懂得哪些先切、哪些后切，严格执行 FIFO（先进先出）原则，防止食材变质。' }
    ],
    KITCHEN_RUNNER: [
        { key: 'cut_standard', label: '刀工与标准化', desc: '肉类、蔬菜的切割规格（厚薄、长短）是否完全符合标准，确保成熟度一致。' },
        { key: 'cut_sequence', label: '出货顺序', desc: '根据出餐单的缓急，精准、快速地完成切配。' },
        { key: 'cut_stock', label: '库存与保鲜管理', desc: '懂得哪些先切、哪些后切，严格执行 FIFO（先进先出）原则，防止食材变质。' }
    ],
    // 后勤清洁
    LOGISTICS_CLEAN: [
        { key: 'clean_speed', label: '洗消速度与周转', desc: '高峰期餐具、锅具的清洗和消毒速度，能否保障前厅后厨的周转。' },
        { key: 'clean_thorough', label: '清洁彻底度', desc: '洗好的碗碟是否有油渍、水渍残留；洗碗机/水槽的日常维护。' },
        { key: 'clean_public', label: '公区卫生维护', desc: '垃圾分类与及时清倒、地面防滑处理（地面防滑是餐饮大忌）、厕所异味控制。' }
    ],
    // 楼面服务员
    FLOOR_WAITER: [
        { key: 'waiter_eye', label: '眼力见与迎送服务', desc: '顾客进出门的招呼，能不能主动发现顾客的需求（如加水、拿餐巾纸）。' },
        { key: 'waiter_turnover', label: '带位与翻台速度', desc: '顾客买单后，清理桌面并重新摆台的速度（连锁店提升周转率的关键）。' },
        { key: 'waiter_accuracy', label: '传菜精准度', desc: '认清桌号，端盘稳、准、快，上菜时礼貌报菜名。' }
    ],
    // 写单员 (FLOOR_WAITER with write-order role, dynamically substituted in form)
    FLOOR_WAITER_TAKER: [
        { key: 'order_skill', label: '推销与沟通技巧', desc: '熟悉菜单，能主动引导顾客下单、推荐招牌菜或小吃（提升客单价）。' },
        { key: 'order_accuracy', label: '写单精准度', desc: '听清顾客特殊要求（如少辣、去冰），录入系统或手工写单时零出错率。' },
        { key: 'order_control', label: '台面掌控', desc: '一个人能同时照看几张桌子的点单需求，不让顾客久等。' }
    ],
    // 收银员
    FLOOR_CASHIER: [
        { key: 'cashier_accuracy', label: '账目准确度', desc: '收银、找零、刷卡、扫码操作零失误，日结时现金/账目完全对得上。' },
        { key: 'cashier_speed', label: '收银速度', desc: '高峰期排队时，操作结账的速度，能否熟练处理优惠券、发票或账单合并/拆分。' },
        { key: 'cashier_grooming', label: '收银台形象', desc: '代表分店的最后一道门面，礼貌用语以及收银台周边的整洁。' }
    ],
    // 主管 (Supervisor)
    FLOOR_MANAGER: [
        { key: 'm_command', label: '现场指挥与调度（控人效）', desc: '高峰期能高效调配前厅所有人手，解决卡单、排队问题，让写单和服务顺畅。' },
        { key: 'm_qsc', label: 'QSC标准督导（控品质）', desc: '死磕前厅环境卫生、服务员礼貌与翻台速度，确保金莲记门面不走样。' },
        { key: 'm_complaint', label: '客诉与突发事件搞定力（消摩擦）', desc: '能在分店现场妥善安抚顾客并解决严重抱怨，把危机控制在店里，不惊动老板。' },
        { key: 'm_data', label: '数据、系统与报表管理（账目合规）', desc: '对 POS 系统、电子支付（Touch \'n Go, GrabPay 等）以及收银账目极度严谨；每日收市对账零误差，能准确填写并分析分店的每日营业报表，不弄虚作假。' },
        { key: 'm_schedule', label: '灵活排班与前厅成本控制（降本增效）', desc: '根据历史营业数据（如周末、夜市客流波动）进行智能化排班，既不浪费人手增加人工成本，也不在爆单时缺人；严格控制前厅日常耗材的浪费。' }
    ],
    // 头手 (Head Chef)
    KITCHEN_HEAD: [
        { key: 'k_flavor', label: '出品稳定性与控时（保招牌）', desc: '确保任何时候出去的每一盘面，其味道、色泽、锅气、分量完全符合金莲记标准。' },
        { key: 'k_waste', label: '食材损耗与库存管理（控成本）', desc: '精准预估每日备料和订货量，严格管控报损率，收市时对冰箱库存清清楚楚。' },
        { key: 'k_team', label: '后厨铁军管理与安全（带团队）', desc: '压得住阵，让厨师、打荷、清洁配合默契；严格执行生熟分开 and 用火用气安全。' },
        { key: 'k_asset', label: '厨房设备保养与资产管理（护工具）', desc: '后厨的硬件（如高压水枪、鼓风机灶台、冰箱、抽风系统）必须严格监督日常清洁与保养，定期检查设备状态，避免“只用不养”导致设备故障停产。' },
        { key: 'k_stress', label: '极端爆单下的出餐节奏与前后协同（抗高压）', desc: '在连续高压下，自己不自乱阵脚、脾气暴躁，并根据前厅写单员、马王的催单反馈，灵活调整炒菜顺序和出餐节奏，全盘稳住后厨。' }
    ]
};

export const MENTORSHIP_SUBITEMS: Record<string, SubItemDef[]> = {
    FLOOR_MANAGER: [
        { key: 'standard_output', label: '标准化输出', desc: '能不能把前厅的写单、收银、客诉处理流程规范化，让新员工来了一个星期就能独立面对客人。' },
        { key: 'ladder_building', label: '人才梯队建树（手里有没有兵）', desc: '他负责的部门里，有没有培养出“副手”（如副主管）。严格考核：当老板明天说要开一家新分店，需要调走他或者他的副手去拓荒时，他手下的团队会不会立刻瘫痪？如果老店能无缝运转，说明他裂变成功。' },
        { key: 'attitude_active', label: '带教的心态与主动性', desc: '是否把培养新人当成自己的 KPI，主动去发掘有潜力的员工并提拔他们；在带教过程中是否有耐心，而不是动不动就破口大骂导致新人流动率高。' }
    ],
    KITCHEN_HEAD: [
        { key: 'standard_output', label: '标准化输出', desc: '能不能把炒面的火候、调料配比变成傻瓜式的带教步骤，让二厨、三厨在短时间内学到 8、9 成相似度，而不是自己留一手。' },
        { key: 'ladder_building', label: '人才梯队建树（手里有没有兵）', desc: '他负责的部门里，有没有培养出“副手”（如二头手）。严格考核：当老板明天说要开一家新分店，需要调走他或者他的副手去拓荒时，他手下的团队会不会立刻瘫痪？如果老店能无缝运转，说明他裂变成功。' },
        { key: 'attitude_active', label: '带教的心态与主动性', desc: '是否把培养新人当成自己的 KPI，主动去发掘有潜力的员工并提拔他们；在带教过程中是否有耐心，而不是动不动就破口大骂导致新人流动率高。' }
    ]
};

export const STRESS_SUBITEMS: SubItemDef[] = [
    { key: 'stress_control', label: '情绪管理与基本抗压', desc: '爆单、客诉、人手不足时能否保持情绪稳定，不急躁、不抱怨，微笑接待每一位。' },
    { key: 'mistake_rate', label: '失误率控制', desc: '在爆单、快节奏、重压之下，出餐或服务依然保持低失误率（不漏单、不错餐、服务规范）。' },
    { key: 'speed_consistency', label: '认真程度与出单速度保持', desc: '即使面对爆单，也依然维持同样的专注度与高产出速度（爆单还是一样的速度）。' }
];

export const PERSONAL_GROOMING_SUBITEMS: SubItemDef[] = [
    { key: 'grooming_hygiene', label: '个人卫生与仪容仪表', desc: '1分：极差，制服脏乱/异味/指甲长\n2分：较差，偶尔不修边幅\n3分：达标，符合基本着装要求\n4分：优秀，仪表整洁\n5分：卓越，堪称门店形象标杆' },
    { key: 'grooming_attitude', label: '个人工作态度', desc: '1分：极度消极，抱怨连篇，不服从安排\n2分：较差，服从性低，工作敷衍\n3分：达标，能接受安排，态度平稳\n4分：优秀，积极主动，乐于接受新任务\n5分：卓越，高度敬业，积极影响他人' },
    { key: 'grooming_discipline', label: '个人纪律性', desc: '1分：无视纪律，经常违规操作\n2分：较差，需要反复提醒才能遵守\n3分：达标，能遵守公司规章制度\n4分：优秀，自觉遵守，绝不越线\n5分：卓越，纪律严明，主动纠正他人违规' },
    { key: 'grooming_time', label: '个人时间观念', desc: '1分：极差，经常迟到早退，拖延工作\n2分：较差，偶尔迟到，踩点上下班\n3分：达标，按时上下班，基本不拖延\n4分：优秀，提前到岗准备，时间管理好\n5分：卓越，完美的时间规划，从不耽误进度' }
];

export const TEAMWORK_SUBITEMS: Record<string, SubItemDef[]> = {
    // 1. 水吧员
    BAR: [
        { key: 'bar_speed_coop', label: '高峰期出单节奏与外卖/前厅的配合度', desc: '1分：出水极慢且无序。经常漏单、做错口味，前厅或打包员来询问进度时态度恶劣。\n2分：做饮品经常看错单（如少冰做成去冰），导致前厅退换；高峰期容易手忙脚乱，对前厅或打包员的催促显得不耐烦。\n3分：能按单据先后顺序制作饮品。堂食和外卖分流基本清晰，能配合前厅和打包员完成日常出餐。\n4分：出单效率高。外卖爆单或堂食高峰时能分清轻重缓急，主动告知前厅大约需要等多久，沟通态度良好。\n5分：动态协调高手。高峰期能主动识别“即将超时的外卖”或“等了很久的堂食”并优先制作；出餐时主动对单并提醒前厅“这杯加了冰，先上”，协作度极高。' },
        { key: 'bar_equip_coop', label: '吧台物料共享与设备维护协作', desc: '1分：自私马虎。冰块用完不补、杯子不洗，把脏乱的吧台留给下一个班次。\n2分：收尾工作敷衍，常有小遗漏（如垃圾未倒干净、物料未补齐），需要接班同事帮忙“擦屁股”。\n3分：下班前能按照检查表完成吧台的收尾 and 清扫，物料正常交接，不给接班同事添麻烦。\n4分：交接非常干净规范，物料补充充足，且能主动留意吧台设备的日常卫生与小异常并提醒主管。\n5分：交接极度规范。不仅自己区域干净，还会主动帮前厅补充冰块或物料；设备有隐患及时提报并提醒全员注意。' }
    ],
    // 2. 后勤
    LOGISTICS_CLEAN: [
        { key: 'clean_dish_coop', label: '高峰期餐具周转与洗碗区的协作响应', desc: '1分：严重卡壳。高峰期洗碗极慢，导致前厅没杯子用、后厨没盘子装菜，别人催促时消极怠工。\n2分：洗碗效率勉强，但脏餐具堆积时分类混乱，经常需要前厅或厨房自己跑进洗碗区翻找特定盘子。\n3分：能基本保证高峰期的餐具周转，洗碗区积压不超过日常标准，前厅后厨要盘子时能及时送达。\n4分：反应迅速。听到前厅或厨房喊缺盘子时，能立刻调整清洗顺序优先解决，餐具输送及时。\n5分：高效保障。眼里极度有活，高峰期能预判哪个部门缺什么（如后厨缺某种特定菜盘），主动加速清洗并送达；洗碗区始终保持安全有序。' },
        { key: 'clean_corner_coop', label: '卫生死角清理与场地复原的配合度', desc: '1分：偷懒应付。拖地只拖路中间，垃圾满了不倒，公共区域脏乱差，被指出后找借口推卸。\n2分：做卫生比较被动，通常要店长检查指出了才去补做，公共区域的死角（如角落、门把手）经常被忽略。\n3分：能按照排班表和卫生标准完成日常的清洁和垃圾清理工作，基本符合门店卫生要求。\n4分：日常清洁到位，收尾干净。看到非自己负责的公共区域有污渍或垃圾时，能顺手清理干净。\n5分：高标准执行。主动承担重活脏活，每次收尾都把地面和死角清理得极其彻底，为整个门店的整体形象做隐形贡献。' }
    ],
    // 3. 服务员 / 写单员
    FLOOR_WAITER: [
        { key: 'waiter_comm_coop', label: '跨部门沟通效率与改单包容度（前厅 ⇄ 厨房）', desc: '1分：经常因为漏写、错写或传达不清（如没写少辣/去葱）导致厨房做错菜，且被后厨指出时态度恶劣。\n2分：写单习惯不好，字迹潦草或备注不规范，导致厨房经常要停下来重新确认；被厨房抱怨时容易带个人情绪。\n3分：能够按照规范写单并准确传达顾客要求。遇到改单或退菜时，能进行基本的、礼貌的前后厨交接。\n4分：前厅后厨沟通顺畅。后厨忙不过来时，能主动安抚客人并调整点单节奏；点错单时能主动去后厨理智协调，减少浪费。\n5分：跨部门桥梁。写单极度清晰减少厨房负担；厨房忙不过来时，能主动安抚客人并调整点单节奏，在前后厨之间有极高的信任度。' },
        { key: 'waiter_eye_coop', label: '高峰期“眼里有活”与全场补位意识', desc: '1分：极度自私。只看自己负责的几张桌子，旁边桌子客人等得发火、或者外卖堆满，他也视而不见。\n2分：比较被动，属于“拨一下动一下”。只有被领班点名或者同事开口求助了，才会不情不愿地去帮一下忙。\n3分：能做好本职区域工作。在自己不忙的前提下，看到团队整体有压力时，能够配合调度去协助传菜或翻台。\n4分：眼里有活，补位积极。在高峰期能自动切换到“全场协助”模式，哪里卡壳（如收台慢、打包堆积）就主动过去顶上。\n5分：全场“救火队”。高峰期自动切换到大局模式，哪里卡壳就主动过去顶上，极大提升门店整体翻台率。' }
    ],
    // 4. 收银员
    FLOOR_CASHIER: [
        { key: 'cashier_complaint_coop', label: '异常账目处理与客诉时的前线支撑', desc: '1分：甩锅第一名。遇到顾客因为菜品慢或服务不好要求打折/免单时，当着客人的面大声训斥服务员或后厨。\n2分：遇到客诉处理比较僵硬，只会复读规定，导致客人更生气，容易把矛盾转交给前厅服务员去扛。\n3分：遇到常规客诉（如算错帐、退菜）能按照门店流程给予权限内的处理，配合服务员安抚好顾客。\n4分：控场能力好。遇到难缠顾客或账目纠纷时，能灵活运用安抚技巧快速解决，不让矛盾升级，给前厅减轻压力。\n5分：前线的坚强后盾。发生严重账目或客诉纠纷时，第一时间站出来利用收银技巧和高情商“背锅”并解决问题，保护一线服务员。' },
        { key: 'cashier_reconcile_coop', label: '收银交接规范与前厅账目协作', desc: '1分：账目混乱。交接班时长短款频发，备用金不数清，错账漏账丢给下一个班次。\n2分：交接班速度慢，账目经常有几块钱的对不上，虽然会自己补齐，但流程不够严谨，拖延交接时间。\n3分：能做到账实相符，按时完成交接班的现金与系统对账，交接流程清晰无误。\n4分：对账高效准确，日常能主动核对前厅的漏单风险，发现可疑挂账时能及时提醒前厅确认，防止跑单。\n5分：财务规范标兵。对账极速且零失误，日常能主动提醒写单员注意哪些单据未买单或优惠券使用规范，杜绝门店跑单漏单。' }
    ],
    // 5. 厨师 / 头镬 (Head Chef / Wok Chef)
    KITCHEN_SECOND: [
        { key: 'chef_wok_pace_coop', label: '高峰期出餐节奏控制与改单配合度', desc: '1分：极其排斥前厅的催单或特殊备注。遇到突发情况经常在厨房抱怨甚至骂人，故意拖延出餐。\n2分：对前厅的改单或退单非常反感，虽然会做但脸色很难看，出餐故意放慢，前后厨关系紧张。\n3分：能按照标准单据和配方出餐。面对前厅的催单或特殊备注能正常配合制作，极少因为情绪影响出餐。\n4分：出餐效率高，且能体谅前厅。前厅不小心下错单时，能积极配合快速改单或重做，尽量减少顾客等待时间。\n5分：后厨的“定海神针”。高峰期能根据前厅客流和外卖积压情况，主动调整烹饪节奏和出餐顺序，并能稳住整个厨房的浮躁情绪。' },
        { key: 'chef_wok_teach_coop', label: '对下级的技术传授与团队氛围带动', desc: '1分：脾气暴躁，倚老卖老。对打荷、副厨非打即骂，藏私不愿教技术，导致后厨人员流动率高。\n2分：在厨房比较孤立，只顾自己炒菜，极少与副厨或打荷沟通技术，下级出错时只是一味指责而不教导。\n3分：能正常与厨房其他岗位搭档，日常工作中能给予基本的业务指导，保持后厨基本稳定。\n4分：带徒弟有耐心，日常愿意让副厨上灶实践，并给予纠正；后厨气氛较为融洽。\n5分：良师友。愿意毫无保留地传授火候和烹饪技巧，耐心包容下级的失误，在后厨享有极高的威望和凝聚力。' }
    ],

    // 7. 打荷 / 马王 (Kitchen Assistant / Plating / Order Runner)
    KITCHEN_FRY: [
        { key: 'runner_order_coop', label: '单据管理与前厅催单的协调能力', desc: '1分：厨房的混乱源头。经常看错单、漏看特殊备注、单据乱贴导致漏菜；前厅来问进度时态度恶劣。\n2分：理单能力一般，高峰期容易漏掉前厅的特殊备注（如去葱）；前厅催单时只会回答“在做了”，沟通效率低。\n3分：能准确按照接单顺序排单、贴单，将特殊要求清晰转告厨师，按部就班地完成出餐对单。\n4分：思路清晰。高峰期能有条不紊地给厨师排单，前厅催菜时能给出具体的进度（如“正在炒了，马上出”），有效缓解前厅焦虑。\n5分：厨房的“交警总指挥”。脑子清晰，前厅一开口就能立刻报出某道菜在哪个档口、还要几分钟；能巧妙安抚前厅的催促，同时协调厨师的节奏。' },
        { key: 'runner_material_coop', label: '档口物料准备与菜品呈现的把关', desc: '1分：经常缺东少西。高峰期才发现盘子没备够、装饰的小菜用完了，导致厨师停工等待；出餐不看卖相。\n2分：开市前备料不够精细，高峰期偶尔需要临时去洗盘子或切配配料；出餐时盘边有油渍偶尔漏看。\n3分：能在开市前备齐所需的盘子、调料和小菜，出餐时能做基本的菜品外表检查。\n4分：备料充足，出餐速度快。对菜品卖相把关较好，盘边有油渍或酱汁会主动擦拭干净再递给前厅。\n5分：完美的幕后功臣。物料准备永远有冗余，出餐前化身“质检员”，菜品有瑕疵立刻拦下让厨房修正，绝不让前厅承担客诉。' }
    ],
    KITCHEN_RUNNER: [
        { key: 'runner_order_coop', label: '单据管理与前厅催单的协调能力', desc: '1分：厨房的混乱源头。经常看错单、漏看特殊备注、单据乱贴导致漏菜；前厅来问进度时态度恶劣。\n2分：理单能力一般，高峰期容易漏掉前厅的特殊备注（如去葱）；前厅催单时只会回答“在做了”，沟通效率低。\n3分：能准确按照接单顺序排单、贴单，将特殊要求清晰转告厨师，按部就班地完成出餐对单。\n4分：思路清晰。高峰期能有条不紊地给厨师排单，前厅催菜时能给出具体的进度（如“正在炒了，马上出”），有效缓解前厅焦虑。\n5分：厨房的“交警总指挥”。脑子清晰，前厅一开口就能立刻报出某道菜在哪个档口、还要几分钟；能巧妙安抚前厅的催促，同时协调厨师的节奏。' },
        { key: 'runner_material_coop', label: '档口物料准备与菜品呈现的把关', desc: '1分：经常缺东少西。高峰期才发现盘子没备够、装饰的小菜用完了，导致厨师停工等待；出餐不看卖相。\n2分：开市前备料不够精细，高峰期偶尔需要临时去洗盘子或切配配料；出餐时盘边有油渍偶尔漏看。\n3分：能在开市前备齐所需的盘子、调料和小菜，出餐时能做基本的菜品外表检查。\n4分：备料充足，出餐速度快。对菜品卖相把关较好，盘边有油渍或酱汁会主动擦拭干净再递给前厅。\n5分：完美的幕后功臣。物料准备永远有冗余，出餐前化身“质检员”，菜品有瑕疵立刻拦下让厨房修正，绝不让前厅承担客诉。' }
    ],
    KITCHEN_PREP: [
        { key: 'runner_order_coop', label: '单据管理与前厅催单的协调能力', desc: '1分：厨房的混乱源头。经常看错单、漏看特殊备注、单据乱贴导致漏菜；前厅来问进度时态度恶劣。\n2分：理单能力一般，高峰期容易漏掉前厅的特殊备注（如去葱）；前厅催单时只会回答“在做了”，沟通效率低。\n3分：能准确按照接单顺序排单、贴单，将特殊要求清晰转告厨师，按部就班地完成出餐对单。\n4分：思路清晰。高峰期能有条不紊地给厨师排单，前厅催菜时能给出具体的进度（如“正在炒了，马上出”），有效缓解前厅焦虑。\n5分：厨房的“交警总指挥”。脑子清晰，前厅一开口就能立刻报出某道菜在哪个档口、还要几分钟；能巧妙安抚前厅的催促，同时协调厨师的节奏。' },
        { key: 'runner_material_coop', label: '档口物料准备与菜品呈现的把关', desc: '1分：经常缺东少西。高峰期才发现盘子没备够、装饰的小菜用完了，导致厨师停工等待；出餐不看卖相。\n2分：开市前备料不够精细，高峰期偶尔需要临时去洗盘子或切配配料；出餐时盘边有油渍偶尔漏看。\n3分：能在开市前备齐所需的盘子、调料和小菜，出餐时能做基本的菜品外表检查。\n4分：备料充足，出餐速度快。对菜品卖相把关较好，盘边有油渍或酱汁会主动擦拭干净再递给前厅。\n5分：完美的幕后功臣。物料准备永远有冗余，出餐前化身“质检员”，菜品有瑕疵立刻拦下让厨房修正，绝不让前厅承担客诉。' }
    ],
    // 8. 头手
    // In our config, KITCHEN_HEAD represents '头手 / 行政总厨'. Since executive chefs are also heads, we map both KITCHEN_HEAD and team leads to this.
    // 9. 管理 / 店长 / 经理
    FLOOR_MANAGER: [
        { key: 'm_conflict_coop', label: '跨部门冲突解决与公平性（前厅 ⇄ 厨房 ⇄ 水吧）', desc: '1分：拉偏架或视而不见。处理前后厨矛盾时明显偏袒某一方，导致另一个部门寒心，团队彻底撕裂。\n2分：处理矛盾和稀泥，只求表面和平（如让双方各写检讨），不去找引起冲突的根本原因（如出餐流程问题）。\n3分：发生部门冲突时能出面调停，各打五十大板，按照员工手册按部就班地进行处罚或安抚。\n4分：处理冲突公平公正。能分别听取前后厨的意见，坐下来一起理智复盘，不仅化解个人情绪，还能微调流程防范下次冲突。\n5分：顶级的团队架构师。处理冲突时对事不对人，能从流程漏洞上找原因而不是一味责怪员工；能让前厅、厨房、水吧真正形成“一家人”的利益共同体。' },
        { key: 'm_building_coop', label: '团队梯队建设与“额外报告”的应用能力', desc: '1分：任人唯亲。打绩效全凭个人喜好，对系统生成的“团队关系报告”视若无睹，导致真正配合度高的好员工流失。\n2分：虽然看绩效数据，但流于表面，打分有明显的“好人主义”（大家都打差不多分），导致考核失去激励作用。\n3分：能参考绩效数据进行日常管理，对团队中的“刺头”或“独行侠”会进行常规的例行面谈。\n4分：善于利用数据。能根据绩效报告准确识别出谁是团队的协作骨干，并在周会上公开表扬；对得分低的员工制定具体的改进计划。\n5分：伯乐与导师。高度重视并能看懂“团队关系报告”背后的隐患，主动针对‘默默奉献型’员工给予晋升和奖励，针对‘矛盾制造者’实施针对性改造，打造高凝聚力铁军。' }
    ],
    // 8. 头手/Section Supervisor
    // Let's create an entry specifically for KITCHEN_HEAD which represents 头手. Wait! If KITCHEN_HEAD is the lead chef, they should have this supervisor teamwork scale.
    // In case they are Chef/Wok Chef (KITCHEN_SECOND), they have the 5th cook teamwork scale.
    KITCHEN_HEAD: [
        { key: 'lead_schedule_coop', label: '现场突发状况的统筹与排班调配能力', desc: '1分：毫无组织能力。现场一忙或者有人请假，自己先乱了阵脚，调配人手时偏心、不公。\n2分：能按规矩排班，但缺乏灵活性。现场爆单或有人迟到时，调整岗位手忙脚乱，容易顾此失失彼。\n3分：能按照门店标准流程处理日常的排班和突发请假，高峰期能站在现场做基本的区域岗位调配。\n4分：调度能力良好。高峰期能迅速发现哪个区域（如打包或收台）即将崩溃，并及时从闲置区域调人支援。\n5分：现场的“定海神针”。具备极强的运筹帷幄能力，现场有人手短缺或爆单时，能在 1 分钟内做出最合理的岗位对调，让员工心服口服。' },
        { key: 'lead_comm_coop', label: '承上启下的信息传递与员工心理安抚', desc: '1分：传话筒兼放大器。对上唯唯诺诺，对下简单粗暴；或者把管理层的压力和负面情绪直接倒给员工。\n2分：传达管理层政策时比较生硬，员工有抵触情绪时只用“这是公司规定”压人，不注意方法。\n3分：能准确向员工传达经理或店长的开会精神，日常能关注到员工的工作状态，做基本的沟通。\n4分：沟通技巧好。能站在员工角度解释店里的新政策，遇到员工家里有事或情绪低落时能主动关怀，凝聚力强。\n5分：团队的润滑剂。能把生硬的考核指标转化为员工听得懂、愿意做的动力；当员工有情绪或前后厨起冲突时，能私下快速化解，把矛盾消灭在萌芽状态。' }
    ],
    UNKNOWN: [
        { key: 'teamwork_1_coop', label: '跨部门配合与大局观', desc: '1分：极其不配合，经常在交接和跨部门协作中发生争吵或消极对抗。\n2分：配合度较低，需要他人反复催促和协调，容易带有情绪。\n3分：能基本完成日常配合与交接工作，符合岗位最低协作要求。\n4分：配合度高，态度积极，日常交接清晰，能为其他同事着想。\n5分：协作模范。不仅出色配合，还能在压力下主动协助他人，深得团队信任。' },
        { key: 'teamwork_2_coop', label: '团队利益维护与正能量带动', desc: '1分：散播负能量，拉帮结派或在团队中制造对立摩擦。\n2分：较为自私，对集体事务和团队建设漠不关心，缺乏团队荣誉感。\n3分：能遵守团队纪律，维护基本团队和谐。\n4分：表现积极主动，乐于参与和协助团队活动，带给他人正向反馈。\n5分：凝聚力核心。时刻维护团队利益，主动关怀协助新人和困难员工，是公认的团队正能量源泉。' }
    ]
};

export type JobCategory = keyof typeof JOB_METRICS;

// ============================================================================
// 4. Role → JobCategory 映射 (业务分类逻辑保持原样)
// ============================================================================

export const classifyJob = (role: string): JobCategory => {
    if (!role) return 'UNKNOWN';
    
    const normalized = role.trim().toLowerCase();
    
    // 🚫 Part-time 最优先判定 (豁免)
    if (normalized.includes('part-time') || normalized.includes('兼职')) return 'PART_TIME';
    
    // 如果是纯粹的老板 (不包含其他具体业务职务关键字如总厨、头手、经理、主管、水吧等，且无斜杠/加号连接)
    const hasJobKeyword = normalized.includes('chef') || normalized.includes('厨') || normalized.includes('头手') || 
                           normalized.includes('manager') || normalized.includes('经理') || normalized.includes('supervisor') || 
                           normalized.includes('主管') || normalized.includes('water bar') || normalized.includes('水吧') || 
                           normalized.includes('cutter') || normalized.includes('占板') || normalized.includes('fryer') || 
                           normalized.includes('打荷') || normalized.includes('runner') || normalized.includes('马王') || 
                           normalized.includes('waiter') || normalized.includes('服务员') || normalized.includes('cleaner') || 
                           normalized.includes('清洁') || normalized.includes('wash') || normalized.includes('洗碗') ||
                           normalized.includes('cashier') || normalized.includes('收银');

    if ((normalized.includes('owner') || normalized.includes('老板') || normalized.includes('决策')) && 
        !normalized.includes('/') && !normalized.includes('+') && !normalized.includes('&') && !hasJobKeyword) {
        return 'OWNER';
    }
    
    // 🍳 厨房
    if (normalized.includes('head chef')       || normalized.includes('头手')) return 'KITCHEN_HEAD';
    if (normalized.includes('executive chef')  || normalized.includes('行政总厨')) return 'KITCHEN_HEAD';
    if (normalized.includes('assistant chef')    || normalized.includes('帮锅')) return 'KITCHEN_SECOND';
    if (normalized.includes('kitchen cook')      || normalized.includes('厨师')) return 'KITCHEN_SECOND';
    if (normalized.includes('kitchen apprentice')|| normalized.includes('厨房学徒')) return 'KITCHEN_SECOND';
    if (normalized.includes('kitchen cutter')    || normalized.includes('占板')) return 'KITCHEN_PREP';
    if (normalized.includes('fryer')             || normalized.includes('打荷')) return 'KITCHEN_FRY';
    if (normalized.includes('commis')            || normalized.includes('runner') || normalized.includes('马王')) return 'KITCHEN_RUNNER';
    if (normalized.includes('kitchen helper')    || normalized.includes('厨房帮手')) return 'KITCHEN_RUNNER';
    if (normalized.includes('order checker')     || normalized.includes('看单')) return 'KITCHEN_RUNNER';
    
    // 🥤 水吧
    if (normalized.includes('water bar')         || normalized.includes('水吧')) return 'BAR';
    
    // 🛎️ 楼面
    if (normalized.includes('store manager')       || normalized.includes('门店经理')) return 'FLOOR_MANAGER';
    if (normalized.includes('operations supervisor')|| normalized.includes('运营主管')) return 'FLOOR_MANAGER';
    if (normalized.includes('hr management')       || normalized.includes('人事管理')) return 'FLOOR_MANAGER';
    if (normalized.includes('store management')    || normalized.includes('店面管理')) return 'FLOOR_MANAGER';
    if (normalized.includes('counter')             || normalized.includes('柜台') || normalized.includes('cashier') || normalized.includes('收银')) return 'FLOOR_CASHIER';
    if (normalized.includes('captain')             || normalized.includes('写单')) return 'FLOOR_WAITER';
    if (normalized.includes('waiter')              || normalized.includes('服务员')) return 'FLOOR_WAITER';
    if (normalized.includes('delivery')            || normalized.includes('外卖')) return 'FLOOR_WAITER';
    
    // 🧹 后勤
    if (normalized.includes('cleaner')             || normalized.includes('清洁员')) return 'LOGISTICS_CLEAN';
    if (normalized.includes('dishwasher')          || normalized.includes('洗碗')) return 'LOGISTICS_CLEAN';
    
    // 如果含有老板字眼但有斜杠，在此作为兜底
    if (normalized.includes('owner') || normalized.includes('老板') || normalized.includes('决策')) return 'OWNER';
    
    return 'UNKNOWN';
};

// ============================================================================
// 5. 排序优先级配置
// ============================================================================

export const JOB_CATEGORY_SORT: Record<JobCategory, number> = {
    OWNER:           0,
    KITCHEN_HEAD:    1,
    KITCHEN_SECOND:  2,
    KITCHEN_PREP:    3,
    KITCHEN_FRY:     4,
    KITCHEN_RUNNER:  5,
    FLOOR_MANAGER:   10,
    FLOOR_CASHIER:   11,
    FLOOR_WAITER:    12,
    BAR:             20,
    LOGISTICS_CLEAN: 30,
    PART_TIME:       99,
    UNKNOWN:         999,
};

export const DEPARTMENT_SORT: Record<Department, number> = {
    KITCHEN:   1,
    FLOOR:     2,
    BAR:       3,
    LOGISTICS: 4,
    EXEMPT:    99
};

// ============================================================================
// 5.5 评级档次定义 (Grading Tiers)
// ============================================================================

export interface GradeTier {
    label: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    score: number;
    color: string;
    desc: string;
    decision: string;
}

export const GRADE_TIERS: GradeTier[] = [
    { label: 'SSS', score: 120, color: 'bg-yellow-500 border-yellow-600 text-white', desc: '超越完美，全员典范', decision: '优先晋升并增发绩效年终奖' },
    { label: 'SS',  score: 110, color: 'bg-amber-400 border-amber-500 text-white', desc: '绝对核心，战力卓群', decision: '保留优秀晋升资格，全额绩效' },
    { label: 'S',   score: 100, color: 'bg-emerald-500 border-emerald-600 text-white', desc: '卓越优秀，超出预期', decision: '全额绩效，优先考虑薪酬涨幅' },
    { label: 'A',   score: 80,  color: 'bg-teal-500 border-teal-600 text-white', desc: '稳健靠谱，符合标准', decision: '全额发放季度绩效奖金' },
    { label: 'B',   score: 60,  color: 'bg-blue-500 border-blue-600 text-white', desc: '中规中矩，偶有小疵', decision: '发放 80% 绩效，主管跟进辅导' },
    { label: 'C',   score: 40,  color: 'bg-orange-500 border-orange-600 text-white', desc: '有待改进，需要培训', decision: '扣除季度绩效，限期 30 天改进' },
    { label: 'D',   score: 20,  color: 'bg-red-500 border-red-600 text-white', desc: '极差警告，不合格', decision: '正式警告信，降职或面临辞退' }
];

// ============================================================================
// 6. 客观事实勾选问答库 (Fact-Based Objective Assessment Data)
// ============================================================================

export interface FactOption {
    label: string;
    desc: string;
    grade: 'S' | 'A' | 'B' | 'C' | 'D';
    score: number;
}

export interface FactQuestion {
    id: string;
    question: string;
    options: FactOption[];
}

export const METRIC_FACTS_QUESTIONS: Record<string, FactQuestion[]> = {
    output_stability: [
        {
            id: 'stability_1',
            question: '该员工的出品是否遭到过客诉或退菜？',
            options: [
                { label: '极度完美', desc: '全季度零客诉，品质优异', grade: 'S', score: 100 },
                { label: '稳定可靠', desc: '极少退菜，且重做迅速', grade: 'S', score: 90 },
                { label: '勉强合格', desc: '偶尔发生退菜（每月 1-2 次）', grade: 'B', score: 60 },
                { label: '频遭投诉', desc: '经常由于味道或质量差引发客诉', grade: 'D', score: 20 }
            ]
        },
        {
            id: 'stability_2',
            question: '员工对配料、克数和风味 SOP 的执行度：',
            options: [
                { label: '标准典范', desc: '严格执规，克数精准，零偏差', grade: 'S', score: 100 },
                { label: '操作规范', desc: '遵循标准流程，抽检合格', grade: 'A', score: 80 },
                { label: '凭感觉做', desc: '不查配方卡，习惯凭主观习惯投放', grade: 'C', score: 45 },
                { label: '无视规范', desc: '烹饪粗糙，不按研发流程走', grade: 'D', score: 20 }
            ]
        },
        {
            id: 'stability_3',
            question: '菜品摆盘与出餐温度的高峰期表现：',
            options: [
                { label: '顶级水准', desc: '摆盘艺术，出餐温度符合标准', grade: 'S', score: 100 },
                { label: '摆盘端正', desc: '盘面整洁，温度符合要求', grade: 'A', score: 80 },
                { label: '偶有瑕疵', desc: '忙乱时盘边有污渍，摆盘一般', grade: 'B', score: 60 },
                { label: '脏乱不合规', desc: '盘边油渍多，温度不合标准', grade: 'C', score: 40 }
            ]
        }
    ],
    team_command: [
        {
            id: 'command_1',
            question: '突发爆单或特殊大单时，其调度排单能力：',
            options: [
                { label: '神级指挥', desc: '排单科学，全场有条不紊不忙乱', grade: 'S', score: 100 },
                { label: '控场优异', desc: '大局观好，催单调度合理，无卡单', grade: 'S', score: 90 },
                { label: '手忙脚乱', desc: '勉强应付，排单偶尔出现混乱', grade: 'B', score: 60 },
                { label: '全盘崩溃', desc: '爆单阵脚大乱，后厨严重堵单', grade: 'D', score: 20 }
            ]
        },
        {
            id: 'command_2',
            question: '带教新人、团队建设与经验传授表现：',
            options: [
                { label: '优秀教练', desc: '耐心传授，成功带出骨干新员工', grade: 'S', score: 100 },
                { label: '日常指引', desc: '日常愿意教导，工作指点到位', grade: 'A', score: 80 },
                { label: '冷漠敷衍', desc: '不愿多教，甚至态度粗暴导致流失', grade: 'C', score: 40 },
                { label: '抗拒标准', desc: '阻碍标准化流程，不利于良性运转', grade: 'D', score: 20 }
            ]
        }
    ],
    cooking_speed: [
        {
            id: 'speed_1',
            question: '高峰时段的出餐速度与客人催单情况：',
            options: [
                { label: '快如闪电', desc: '手脚极快，极少有大厅催单', grade: 'S', score: 100 },
                { label: '高效敏捷', desc: '出单速度稳定在标准时间内', grade: 'S', score: 90 },
                { label: '勉强跟上', desc: '偶尔发生催单（每餐 1-2 次）', grade: 'B', score: 60 },
                { label: '慢性子拖垮', desc: '手脚极慢，高峰期堵单影响翻台', grade: 'D', score: 20 }
            ]
        },
        {
            id: 'speed_2',
            question: '多任务操作与兼顾多菜系的协调效率：',
            options: [
                { label: '协同极强', desc: '多任务切换自如，烹饪节奏好', grade: 'S', score: 100 },
                { label: '协同良好', desc: '能兼顾多口锅，备料充足不空等', grade: 'A', score: 80 },
                { label: '效率一般', desc: '只能干单任务，高峰期效率低', grade: 'C', score: 45 },
                { label: '丢三落四', desc: '多任务操作慌乱，频发失误', grade: 'D', score: 20 }
            ]
        }
    ],
    service_passion: [
        {
            id: 'passion_1',
            question: '迎客热情度、服务主动性与眼力见：',
            options: [
                { label: '店之灵魂', desc: '服务真诚，能敏锐观察客人需求', grade: 'S', score: 100 },
                { label: '积极主动', desc: '主动迎送，添水撤盘及时', grade: 'S', score: 90 },
                { label: '机械执行', desc: '按部就班，缺乏真诚笑意', grade: 'B', score: 60 },
                { label: '态度敷衍', desc: '丧气满满，甚至引发客人投诉', grade: 'D', score: 20 }
            ]
        },
        {
            id: 'passion_2',
            question: '面对难缠客人或客诉时的沟通态度：',
            options: [
                { label: '高情商典范', desc: '微笑化解纠纷，服务让客人满意', grade: 'S', score: 100 },
                { label: '耐心克制', desc: '不与客争执，耐心按店规处理', grade: 'A', score: 80 },
                { label: '容易暴躁', desc: '情绪易受影响，脸色难看', grade: 'C', score: 45 },
                { label: '现场对线', desc: '脾气火爆，跟客人争吵损害店誉', grade: 'D', score: 20 }
            ]
        }
    ],
    complaint_handling: [
        {
            id: 'complaint_1',
            question: '发生现场客诉纠纷时，该管理者的反应：',
            options: [
                { label: '妥善圆满', desc: '迅速到场处理，转危为安，化解纠纷', grade: 'S', score: 100 },
                { label: '规范处理', desc: '执行赔付免单流程，态度诚恳', grade: 'S', score: 90 },
                { label: '缩手缩脚', desc: '怕担责，反复打电话请示老板', grade: 'B', score: 60 },
                { label: '粗暴激化', desc: '推卸责任，处理粗暴导致纠纷升级', grade: 'D', score: 20 }
            ]
        }
    ],
    payment_accuracy: [
        {
            id: 'payment_1',
            question: '收银结账对账与备用金流转准确度：',
            options: [
                { label: '零账差错', desc: '账实完美吻合，各种账目闭环无误', grade: 'S', score: 100 },
                { label: '偶尔微差', desc: '偶有微差但能当晚查清，无隐患', grade: 'S', score: 90 },
                { label: '经常不平', desc: '经常长款或短款，核算粗心', grade: 'C', score: 45 },
                { label: '财务重大隐患', desc: '收银不入账或发生大少收事故', grade: 'D', score: 20 }
            ]
        }
    ]
};

export const getFallbackQuestionsForMetric = (metricKey: string, label: string): FactQuestion[] => {
    return [
        {
            id: `${metricKey}_fallback_1`,
            question: `关于该员工在「${label}」指标上的日常规范执行现状：`,
            options: [
                { label: '行业模范', desc: `完美执行标准，还能指导监督其他员工`, grade: 'S', score: 100 },
                { label: '严谨稳健', desc: `标准极高，日常执规严谨，无纠错记录`, grade: 'S', score: 90 },
                { label: '偶有松懈', desc: `基本合规，但忙乱时偶有松懈或被口头纠正`, grade: 'B', score: 60 },
                { label: '散漫懈怠', desc: `经常不按规定做，态度敷衍，视标准如无物`, grade: 'D', score: 20 }
            ]
        },
        {
            id: `${metricKey}_fallback_2`,
            question: `该员工在「${label}」考核方面的稳定性与抗压表现：`,
            options: [
                { label: '绝对战力', desc: '抗压极强，高峰期执行动作绝不走样', grade: 'S', score: 100 },
                { label: '稳妥靠谱', desc: '高峰期顶得住压力，整体执行令人放心', grade: 'A', score: 80 },
                { label: '情绪起伏', desc: '高峰期慌乱，效率下降且有急躁情绪', grade: 'C', score: 45 },
                { label: '崩溃摆摆', desc: '无法承受高负荷工作，爆单时发脾气撂挑子', grade: 'D', score: 20 }
            ]
        },
        {
            id: `${metricKey}_fallback_3`,
            question: `本季度内，该指标是否发生过导致警告、重做、客诉事件？`,
            options: [
                { label: '完全零事故', desc: '整季度完美无瑕，无任何负面失误或事故', grade: 'S', score: 100 },
                { label: '偶发小纰漏', desc: '仅有一次自查弥补的微小瑕疵，未受处罚', grade: 'A', score: 80 },
                { label: '口头指正', desc: '有轻微违规或业务偏差，曾接受口头指导', grade: 'B', score: 60 },
                { label: '严重受罚', desc: '重大工作失误，造成明显的客损或警示处分', grade: 'D', score: 20 }
            ]
        }
    ];
};

/** 提取该 Metric 对应的所有客观题目 */
export const getQuestionsForMetric = (metricKey: string, label: string): FactQuestion[] => {
    return METRIC_FACTS_QUESTIONS[metricKey] || getFallbackQuestionsForMetric(metricKey, label);
};
