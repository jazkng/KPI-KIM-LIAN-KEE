import { Employee, RoleDefinition, RoleGuide, AllowanceKey } from '../types';

// ==========================================
// 通用员工守则 (General Employee Rules)
// ==========================================
export const GENERAL_EMPLOYEE_RULES = [
    '🕒 考勤铁律：楼面是下午 3:30，厨房是下午 3:00 准时打卡开铺。迟到超过 15 分钟扣除一小时的薪资，并且对本身的 KPI 有影响。',
    '📱 手机管制：手机必须静音和严禁边工作边玩手机。',
    '🧼 仪容仪表：必须穿戴整齐制服、围裙、包鞋。厨房人员必须戴帽子，长发需盘起。',
    '🍜 员工用餐：仅限 16:30前 或 21:30-22:00 轮流用餐。',
    '🚬 吸烟规定：仅限后巷指定区域，严禁穿着围裙吸烟，回岗必须洗手漱口。',
    '🗣️ 待客之道：见到顾客必须点头微笑说"欢迎光临"，离开说"谢谢光临"。',
    "🚫 安全红线：厨房地面保持干燥防滑，端热汤/铁板必须使用托盘或隔热布。",
    '🌛 打烊纪律：01:30 Last Call 后不再接单，02:00 前完成所有清洁工作并经主管检查后方可离店。'
];

// ==========================================
// ROLE GUIDES (职位说明书 - 针对金莲记定制)
// ==========================================
export const DEFAULT_ROLE_GUIDES: Record<string, RoleGuide> = {
  // ------------------------------------------------------------------
  // MANAGEMENT (管理层)
  // ------------------------------------------------------------------
  'Executive Chef (行政总厨)': {
    description: '厨房最高指挥官。负责菜品研发、成本控制与团队建设。',
    coreValue: '出品灵魂与厨房纪律',
    safetyRedLine: '严禁使用变质食材 / 严禁私自更改秘制酱料配方',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '监控每日炭火福建面出品质量 (锅气/色泽/味道)',
        '负责秘制酱料、猪油渣的熬制与品控',
        '控制厨房成本 (Costing) 在 35% 以内',
        '培训头手与二锅，传承炒面技艺'
    ],
    troubleshooting: [
        { issue: "顾客投诉面没有锅气 (No Wok Hei)", solution: "立即检查炭火炉温度及鼓风机运作，亲自试炒一份确认味道，必要时更换受潮的炭。" },
        { issue: "酱料味道不稳定 (Taste inconsistent)", solution: "立即停止使用当前批次酱料，重新调配。检查是否有人未按比例投放调料。" },
        { issue: "供应商送来的猪油不新鲜", solution: "直接拒收并拍照留证，立即联系备用供应商补货，确保猪油渣品质。" }
    ],
    salaryRange: { min: 5500, max: 7000 },
    specialIncentive: '季度净利分红 (Profit Share) & 成本控制奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '完全掌握核心酱料配方，能独立解决厨房突发状况。',
    confirmedExpectation: '培养出至少一名合格的头手，厨房零重大投诉，Food Cost 稳定。'
  },

  'Store Manager (门店经理)': {
    description: '门店的大脑。全权负责楼面运营、业绩达标与团队稳定。',
    coreValue: '业绩为王 · 客户至上 · 团队凝聚',
    safetyRedLine: '严禁伪造报表 / 严禁包庇员工违规行为',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '每日营业额目标跟进与汇报',
        '排班管理与人力成本控制',
        '处理严重客诉 (Google Review / 现场发飙)',
        '监督现金流与每日结算'
    ],
    troubleshooting: [
        { issue: "突发停电/断网", solution: "立即启动离线作业流程，指挥厨房使用应急照明继续出餐（炭火不受影响），安抚顾客情绪。" },
        { issue: "甚至爆满排队混乱", solution: "亲自到门口控场，启用取号系统，预先派发菜单给排队顾客点餐以缩短等待时间。" },
        { issue: "员工之间发生争执", solution: "立即将当事人带离现场至办公室冷静，避免在顾客面前吵架，事后进行调解或处分。" }
    ],
    salaryRange: { min: 3800, max: 4800 },
    specialIncentive: '月度达标奖金 (KPI Bonus)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉所有岗位SOP，能独立完成开铺和打烊结算。',
    confirmedExpectation: '带领团队连续3个月达成业绩目标，Google评分保持4.5以上。'
  },

  'Operations Supervisor (运营主管)': {
    description: '楼面总指挥。负责现场调度与顾客满意度。',
    coreValue: '现场效率与零客诉',
    safetyRedLine: '严禁排班偏私 / 包庇下属违规',
    duties: ['排班管理', '现场控场', '新人培训', '客诉处理'],
    troubleshooting: [
        { issue: "人手不足", solution: "合理重新划分服务区域，自己亲自顶上繁忙区域。" },
        { issue: "顾客投诉菜品有异物", solution: "立即道歉并撤走菜品，承诺免单该菜品并赠送甜品，事后追查厨房责任人。" }
    ],
    salaryRange: { min: 2800, max: 3200 },
    employeeRules: GENERAL_EMPLOYEE_RULES,
    specialIncentive: '团队达标奖金 (Team Bonus)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉楼面动线，能够处理一般客诉。',
    confirmedExpectation: '独立带班，培训新员工，提升翻台率。'
  },

  // ------------------------------------------------------------------ ✅ NEW
  // HR & STORE MANAGEMENT
  // ------------------------------------------------------------------
  '人事管理 (HR Management)': {
    description: '负责招聘、员工档案管理、薪资处理及劳资关系维护，确保公司人力资源健康运作。',
    coreValue: '公平 · 保密 · 合规',
    safetyRedLine: '严禁泄露员工薪资与个人档案 / 严禁偏私处理纪律事件',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '维护员工档案 (入职/离职/调岗/薪资变动)',
        '处理月度薪资计算与发放 (EPF/SOCSO/PCB)',
        '跟进员工警告记录与纪律流程',
        '协调招聘广告、面试与入职引导',
        '管理员工排班与假期申请审批',
        '确保公司遵守劳工法令 (Employment Act 1955)'
    ],
    troubleshooting: [
        { issue: "员工投诉薪资计算错误", solution: "立即调出当月考勤与薪资单核对，24小时内给出书面答复，确认有误则下次发薪补足差额。" },
        { issue: "员工突然离职不辞而别 (Abscond)", solution: "按流程发送书面通知至其登记地址，记录档案为 '旷工离职' ，并更新系统状态。" },
        { issue: "收到前员工索取薪资单纪录", solution: "核实身份后，依劳工法令在5个工作日内提供，只能提供本人档案。" }
    ],
    salaryRange: { min: 2800, max: 3800 },
    specialIncentive: '零错误薪资奖 (Payroll Accuracy Bonus)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉系统档案操作，薪资核算无误差。',
    confirmedExpectation: '独立完成月度薪资流程，员工档案100%完整无漏项。'
  },

  '店面管理 (Store Management)': {
    description: '专注门店日常运营管理。负责库存、采购、设备维护及营业指标跟进，确保门店高效运转。',
    coreValue: '效率 · 节约 · 稳定运营',
    safetyRedLine: '严禁私自挪用库存物资 / 严禁授权不明的供应商进货',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '监控每日营业额与达标率',
        '跟进库存盘点，确保食材与物资充足',
        '协调与供应商的采购、报价及交货',
        '负责设备日常检查与维修申报',
        '维护门店卫生与安全标准 (SOP Inspection)',
        '协助经理完成月底盘点与成本报告'
    ],
    troubleshooting: [
        { issue: "供应商无法按时交货", solution: "立即联系备用供应商，同时通知厨房调整当日菜单以应对食材短缺。" },
        { issue: "设备故障 (如冰箱/炸炉/洗碗机)", solution: "立即拍照记录故障状况，联系指定维修师傅，同时安排替代方案确保运营不中断。" },
        { issue: "月底盘点与系统数据出现差异", solution: "重新清点实物，检查入库与出库记录，找出差异原因并形成书面报告。" }
    ],
    salaryRange: { min: 2800, max: 3800 },
    specialIncentive: '成本节约奖 (Cost Saving Bonus) & 设备零故障奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉供应链流程，库存盘点准确无重大差异。',
    confirmedExpectation: '独立完成月度采购与成本控制，设备维护及时无影响营业。'
  },

  // ------------------------------------------------------------------
  // FRONT OF HOUSE (楼面)
  // ------------------------------------------------------------------
  'Counter (柜台)': {
    description: '餐厅的枢纽与门面。负责收银、外卖平台对接与电话接单。',
    coreValue: '账目精准 · 即使忙碌也要保持微笑',
    safetyRedLine: '严禁私吞公款 / 严禁私自给予折扣 / 钱箱必须随时上锁',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        'StoreHub 收银操作与结账',
        '接听电话订单与 GrabFood/FoodPanda 接单',
        '核对每日现金与单据 (Variance < RM10)',
        '管理排队叫号系统 (高峰期)'
    ],
    troubleshooting: [
        { issue: "StoreHub 系统卡顿/死机", solution: "立即重启 iPad。若无法恢复，使用手写单记账，待网络恢复后补录。" },
        { issue: "外卖骑手催单且态度恶劣", solution: "保持冷静，告知大概出餐时间。如骑手并在店内喧哗，请经理出面处理。" },
        { issue: "结账时发现少钱 (Cash Shortage)", solution: "如实记录在 Logbook，若差额超过 RM10 需自行补齐或接受调查。" }
    ],
    salaryRange: { min: 2200, max: 2600 },
    specialIncentive: '零差错津贴 (Zero Variance Bonus)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟练操作 POS 系统，外卖接单无漏单。',
    confirmedExpectation: '能同时处理现场结账和电话订单，账目每月差异少于 RM50。'
  },

  'Captain (写单员)': {
    description: '推销专家。负责为顾客点餐，推销招牌菜与高毛利饮品。',
    coreValue: '精准下单 · 主动推销 · 掌控节奏',
    safetyRedLine: '严禁漏单不报 / 严禁对顾客不耐烦',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '为顾客点餐 (推荐: 招牌福建面, 月光河)',
        '确认顾客特殊要求 (如: 少猪油, 加辣)',
        '巡视餐桌，跟进出餐速度',
        '处理简单的退换菜要求'
    ],
    troubleshooting: [
        { issue: "顾客投诉等了 30 分钟还没上菜", solution: "先道歉，立即去厨房查看单据位置。如果是漏单，优先补做并送上一杯免费凉茶致歉。" },
        { issue: "顾客点菜犹豫不决", solution: "主动引导：'不如试下我们的招牌福建面？两个人吃中份刚好，再加个炸鸡翅？" },
        { issue: "福建面卖完了 (极少发生)", solution: "立即通知所有服务员，并向顾客推荐广府鸳鸯或罗面作为替代。" }
    ],
    salaryRange: { min: 2300, max: 2800 },
    specialIncentive: '推销提成 (Sales Commission)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '背熟菜单价格与配料，手写单字迹工整。',
    confirmedExpectation: '善于推销高价菜品 (如: 生虾面)，客单价提升 10%。'
  },

  'Waiter (服务员)': {
    description: '服务基石。负责传菜、清理桌面与响应顾客需求。',
    coreValue: '眼观六路 · 手脚麻利 · 安全第一',
    safetyRedLine: '严禁在店内奔跑 / 严禁跨过小孩头顶上菜',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '准确将菜品送至对应桌号',
        '客人离座后 1 分钟内收桌并擦净',
        '补充餐具、辣椒酱、纸巾',
        '保持地面无垃圾'
    ],
    troubleshooting: [
        { issue: "不小心把汤洒在客人身上", solution: "立即道歉，提供纸巾擦拭。不管客人是否生气，必须马上报告经理处理赔偿事宜。" },
        { issue: "客人要求加汤/加猪油渣", solution: "微笑着说'好的，稍等'，立即去厨房取，不要让客人等超过 3 分钟。" },
        { issue: "发现桌子摇晃不稳", solution: "立即找硬纸皮垫脚，确保客人用餐体验舒适。" }
    ],
    salaryRange: { min: 1800, max: 2200 },
    specialIncentive: '每日小费 (Tips Sharing)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉桌号分布，端托盘稳当不洒漏。',
    confirmedExpectation: '眼里有活，无需指令主动加水、收空盘。'
  },

  'Cleaner (清洁员)': {
    description: '环境卫士。维护店内整洁与卫生。',
    coreValue: '无死角清洁',
    safetyRedLine: '严禁地面积水不处理 (防滑倒)',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: ['环境清洁', '厕所检查 (30min)', '垃圾处理', '翻台/抹桌'],
    troubleshooting: [
        { issue: "厕所堵塞", solution: "立即暂停使用，尝试疏通，不行则通知经理报修。" },
        { issue: "地面有呕吐物", solution: "戴上手套口罩，使用专用清洁剂和木屑覆盖清理，彻底消毒去味。" }
    ],
    salaryRange: { min: 1500, max: 1800 },
    specialIncentive: '环境卫生奖 (Hygiene Bonus)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '勤快，厕所无异味，地面无垃圾。',
    confirmedExpectation: '主动发现卫生死角，维护店面形象。'
  },

  'Part-Time (兼职)': {
    description: '灵活支援。当日结算，无福利，仅享制服。',
    coreValue: '机动性与补位',
    safetyRedLine: '严禁无故缺席 (No Show)',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: ['高峰期支援', '基础服务/清洁', '听从调配'],
    troubleshooting: [
        { issue: "不知道该做什么", solution: "主动询问 Supervisor 或 Captain：'有什么需要帮忙的吗？不要站在角落玩手机。" }
    ],
    salaryRange: { min: 0, max: 0 }, // Hourly
    specialIncentive: '当日出薪 (Daily Pay)',
    enabledAllowances: [],
    probationExpectation: 'Hourly Rate: RM 9 - RM 12 depending on skill.',
    confirmedExpectation: 'Reliable and fast.'
  },

  // ------------------------------------------------------------------
  // BACK OF HOUSE (厨房)
  // ------------------------------------------------------------------
  'Head Chef (头手)': {
    description: '炉台主宰。负责第一炒锅，掌控每一盘面的火候。',
    coreValue: '锅气十足 · 速度激情 · 品质如一',
    safetyRedLine: '严禁出品夹生或烧焦严重 / 严禁在炉台吸烟',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '负责核心炒锅 (福建面/月光河)',
        '把控出餐节奏，指挥帮手',
        '每日收档检查煤气与炭火安全',
        '试味 (确保咸淡适中)'
    ],
    troubleshooting: [
        { issue: "炭火火力变弱", solution: "指挥马王(Commis)立即加炭并开大风机。若来不及，先用备用煤气炉顶替，确保不断供。" },
        { issue: "单子突然爆满 (高峰期)", solution: "保持冷静，按单顺序炒，可以一次炒 2-3 份同款面，但严禁一次炒太多导致味道变差。" },
        { issue: "发现面条发酸", solution: "立即停止使用该批次面条，整锅倒掉，绝不侥幸出餐。" }
    ],
    salaryRange: { min: 4500, max: 5500 },
    specialIncentive: '出品质量奖 & 零退菜奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '炒出的福建面色泽黝黑发亮，锅气浓郁。',
    confirmedExpectation: '高峰期出餐稳定，出餐速度快且质量稳定。'
  },

  'Assistant Chef (帮锅)': {
    description: '头手的左膀右臂。负责二锅、煮汤面及协助头手。',
    coreValue: '配合默契 · 补位及时 · 学习进取',
    safetyRedLine: '严禁擅自离岗导致炉台无人',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '负责汤面类 (罗面/滑蛋河) 制作',
        '协助头手备料 (抓面/配菜)',
        '管理炸炉 (炸鸡翅/炸五香)',
        '保持炉台卫生'
    ],
    troubleshooting: [
        { issue: "头手忙不过来", solution: "主动接过简单的炒单 (如炒饭)，或帮头手提前烫面，减轻其负担。" },
        { issue: "炸鸡翅没熟", solution: "严格遵守定时器时间，出锅前用探针检查。没熟的必须重炸，不能出给客人。" }
    ],
    salaryRange: { min: 3000, max: 3800 },
    specialIncentive: '全勤奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉备料流程，配合头手出餐。',
    confirmedExpectation: '能够独立负责部分炒锅工作。'
  },

  'Kitchen Cook (厨师)': {
    description: '厨房中坚。负责炒饭、炒面及普通热菜制作。',
    coreValue: '标准统一 · 出品稳定',
    safetyRedLine: '严禁生熟不分 / 严禁出品夹生',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: ['负责普通炒锅 (炒饭/马来风光)', '协助备料', '炉台清洁', '收档清洁'],
    troubleshooting: [
        { issue: "客人投诉咸淡", solution: "立即重做，并自我检查调料比例是否按SOP执行。" },
        { issue: "饭太湿炒不散", solution: "通知占板注意煮饭水量，或者使用隔夜饭。尽力用大火将水分炒干。" }
    ],
    salaryRange: { min: 2500, max: 3500 },
    specialIncentive: '绩效奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '能独立完成炒饭类订单，口味达标。',
    confirmedExpectation: '能胜任二锅位置，高峰期协助头手出餐。'
  },

  'Kitchen Cutter (占板)': {
    description: '食材管家。负责所有肉类、蔬菜的切割与腌制。',
    coreValue: '刀工精准 · 减少损耗 · 新鲜卫生',
    safetyRedLine: '严禁生熟砧板混用 (食品安全红线)',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '每日猪肉/鸡肉/海鲜切割与腌制',
        '蔬菜清洗与切配',
        '管理冰箱库存 (FIFO 先进先出)',
        '根据预估销量备足料'
    ],
    troubleshooting: [
        { issue: "切肉时不小心切到手", solution: "立即停止工作，按压止血，对伤口进行包扎并戴上手套。严重者立即就医。" },
        { issue: "发现冰箱里的肉有异味", solution: "立即隔离该批次肉类并上报总厨，禁止使用。" },
        { issue: "备料不足", solution: "提前 1 小时预警，通知马王去补货或现场紧急切配。" }
    ],
    salaryRange: { min: 2200, max: 2600 },
    specialIncentive: '无工伤安全奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '刀工合格，肉片厚薄均匀。',
    confirmedExpectation: '能精准预估每日备料量，减少食材浪费。'
  },

  'Fryer (打荷)': {
    description: '出品最后一关。负责炸炉、摆盘装饰与出菜协助。',
    coreValue: '美观 · 速度 · 把关',
    safetyRedLine: '严禁出品盘边有油渍 / 严禁徒手接触熟食',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '负责炸炉出品 (五香/鸡翅)',
        '菜品装饰与摆盘',
        '配合头手出菜',
        '管理酱料碟与餐具'
    ],
    troubleshooting: [
        { issue: "炸炉油温过高冒烟", solution: "立即关火，放入少量冷油降温。严禁泼水！" },
        { issue: "出菜口积压", solution: "大声呼叫传菜员 (Runner) 取餐，优先处理容易变凉的菜品。" }
    ],
    salaryRange: { min: 1800, max: 2400 },
    specialIncentive: '全勤奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟悉菜单摆盘标准，炸物火候掌握得当。',
    confirmedExpectation: '能预判头手出菜节奏，提前准备盘子和装饰。'
  },

  'Commis/Runner (马王)': {
    description: '厨房的生命线。负责食材传递、紧急补货与档口支援。',
    coreValue: '响应迅速 · 眼观六路 · 随叫随到',
    safetyRedLine: '严禁传递错误食材 / 严禁在厨房奔跑滑倒',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '连接切配台与炉台，传递食材',
        '负责出菜口的最后检查 (擦盘边)',
        '紧急补货 (面条/猪油/酱料)',
        '保持出菜通道畅通'
    ],
    troubleshooting: [
        { issue: "炉台突然说没面了", solution: "立即跑步去冷房取面，如果冷房也没了，马上通报总厨并去最近的超市购买(经批准)。" },
        { issue: "传菜员端错了菜", solution: "在出菜口就要核对单号，发现错误立即拦截，避免送错给客人。" },
        { issue: "地面有油渍", solution: "立即拿拖把清理，防止厨师端热锅时滑倒。" }
    ],
    salaryRange: { min: 1800, max: 2200 },
    specialIncentive: '勤劳奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '听得懂所有食材的行话 (如: 米粉、伊面、老鼠粉)。',
    confirmedExpectation: '能预判厨师需求，提前把盘子和配料准备好。'
  },

  'Kitchen Helper (厨房帮手)': {
    description: '后勤多面手。负责杂务与清洁。',
    coreValue: '机动灵活',
    safetyRedLine: '严禁垃圾过夜',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: ['打荷辅助', '补货搬运', '环境清洁', '洗碗支援'],
    troubleshooting: [
        { issue: "垃圾桶满了", solution: "立即打包换袋，不要等溢出来才处理。" }
    ],
    salaryRange: { min: 1500, max: 1800 },
    specialIncentive: '全勤奖励 (Attendance)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '手脚麻利，服从安排。',
    confirmedExpectation: '熟悉厨房卫生标准，保持环境整洁。'
  },

  'Dishwasher (洗碗)': {
    description: '后勤保障。负责餐具清洗、消毒与归位。',
    coreValue: '卫生 · 速度 · 破损率低',
    safetyRedLine: '严禁使用破损餐具 / 严禁地面积水 (防滑)',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '清洗所有碗盘筷子 (三槽洗涤法: 去渣-清洗-消毒)',
        '操作洗碗机 (如有)',
        '清理厨余垃圾与隔油池 (Grease Trap)',
        '保持洗碗间干燥卫生'
    ],
    troubleshooting: [
        { issue: "碗盘堆积如山", solution: "优先清洗急需的餐具 (如: 筷子/汤匙/面盘)，请求厨房帮手支援。" },
        { issue: "猪油太厚洗不干净", solution: "使用热水浸泡去油，并适当增加洗洁精用量，确保无油腻感。" },
        { issue: "打破盘子", solution: "立即清理碎片，用报纸包好再丢入垃圾桶，防止割伤倒垃圾的人。" }
    ],
    salaryRange: { min: 1500, max: 1800 },
    specialIncentive: '全勤奖 & 卫生奖',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '手脚麻利，能区分不同餐具的存放位置。',
    confirmedExpectation: '高峰期不积压餐具，餐具破损率极低。'
  },

  'Water Bar (水吧)': {
    description: '饮品专家。负责金莲记凉茶、桔子酸梅及各类特色饮料。',
    coreValue: '出品稳定 · 速度 · 控成本',
    safetyRedLine: '严禁使用变质水果 / 严禁偷吃吧台零食',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: [
        '熬煮金莲记招牌凉茶 (Air Mata Kucing)',
        '制作各类冷热饮品',
        '管理吧台水果与罐装饮料库存',
        '清洗杯具'
    ],
    troubleshooting: [
        { issue: "凉茶卖完了", solution: "高峰期前必须确保留有备用凉茶。若断货，礼貌推荐薏米水或中国茶。" },
        { issue: "冰块机故障或冰块不够", solution: "立即联系冰块供应商送货，或安排人去便利店买冰应急。" },
        { issue: "客人投诉饮料太甜", solution: "无条件重做一杯少糖的给客人，并检查糖浆泵的刻度。" }
    ],
    salaryRange: { min: 2000, max: 2500 },
    specialIncentive: '新品推广提成',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '熟记所有饮料配方 (糖分/冰量)。',
    confirmedExpectation: '出饮品速度快，能独立完成吧台盘点。'
  },

  'Kitchen Apprentice (厨房学徒)': {
    description: '厨房新人。学习并协助各岗位。',
    coreValue: '勤奋与好学',
    safetyRedLine: '严禁操作不熟悉的设备 (安全第一)',
    employeeRules: GENERAL_EMPLOYEE_RULES,
    duties: ['基础备料 (剥蒜/洗菜)', '传递食材', '学习烹饪技巧'],
    troubleshooting: [
        { issue: "不知道该做什么", solution: "主动问头手或占板：'有什么我可以先准备的？'不要发呆。" },
        { issue: "被师傅骂", solution: "虚心接受，记住错误点，下次不再犯。不要顶嘴。" }
    ],
    salaryRange: { min: 1500, max: 1800 },
    specialIncentive: '晋升考核奖 (Promotion Exam)',
    enabledAllowances: ['ATTENDANCE', 'MEAL', 'HOSTEL'],
    probationExpectation: '肯学肯干，不迟到早退。',
    confirmedExpectation: '掌握基本备料，可以协助打荷或二锅。'
  },

  // OWNER ROLE DEFAULT
  'Owner (老板)': {
    description: 'Company Owner',
    coreValue: 'Ownership', 
    safetyRedLine: 'No Limits',
    duties: ['Strategic Planning', 'Financial Control', 'Business Development'],
    troubleshooting: [],
    salaryRange: { min: 0, max: 0 },
    employeeRules: [],
    specialIncentive: 'Profit Sharing',
    enabledAllowances: [],
    probationExpectation: '',
    confirmedExpectation: ''
  }
};

export const DEFAULT_ROLES: RoleDefinition[] = [
    { id: 'k1', title: 'Executive Chef (行政总厨)', department: 'MANAGEMENT', rankCategory: 'MANAGEMENT', duties: ['厨房总控'], allowedModules: ['INVENTORY_KITCHEN', 'INVENTORY_BAR', 'SUPPLIER_CONTACTS', 'SOP_INSPECT', 'ROSTER_KITCHEN', 'LOGBOOK', 'ASSESSMENT'] },
    { id: 'k2', title: 'Head Chef (头手)', department: 'BOH', rankCategory: 'MID_LEVEL', duties: ['烹饪'], allowedModules: ['INVENTORY_KITCHEN', 'ROSTER_KITCHEN'] },
    { id: 'k2_2', title: 'Assistant Chef (帮锅)', department: 'BOH', rankCategory: 'MID_LEVEL', duties: ['烹饪辅助'], allowedModules: ['INVENTORY_KITCHEN'] },
    { id: 'k_cook', title: 'Kitchen Cook (厨师)', department: 'BOH', rankCategory: 'MID_LEVEL', duties: ['烹饪'], allowedModules: ['INVENTORY_KITCHEN'] },
    { id: 'k_fryer', title: 'Fryer (打荷)', department: 'BOH', rankCategory: 'ENTRY_LEVEL', duties: ['炸炉/摆盘'], allowedModules: [] },
    { id: 'k3', title: 'Kitchen Cutter (占板)', department: 'BOH', rankCategory: 'ENTRY_LEVEL', duties: ['切配'], allowedModules: [] },
    { id: 'k6', title: 'Commis/Runner (马王)', department: 'BOH', rankCategory: 'ENTRY_LEVEL', duties: ['传递'], allowedModules: [] },
    { id: 'k13', title: 'Kitchen Helper (厨房帮手)', department: 'BOH', rankCategory: 'ENTRY_LEVEL', duties: ['杂务'], allowedModules: [] },
    { id: 'k_dish', title: 'Dishwasher (洗碗)', department: 'BOH', rankCategory: 'ENTRY_LEVEL', duties: ['清洗'], allowedModules: [] },
    { id: 'k12', title: 'Kitchen Apprentice (厨房学徒)', department: 'BOH', rankCategory: 'ENTRY_LEVEL', duties: ['学习'], allowedModules: [] },
    { id: 'b1', title: 'Water Bar (水吧)', department: 'BOH', rankCategory: 'MID_LEVEL', duties: ['饮品'], allowedModules: ['INVENTORY_BAR'] },
    
    { id: 'f1', title: 'Store Manager (门店经理)', department: 'MANAGEMENT', rankCategory: 'MANAGEMENT', duties: ['全盘管理'], allowedModules: ['SETTLEMENT', 'ROSTER', 'LOGBOOK', 'INVENTORY_KITCHEN', 'INVENTORY_BAR', 'INVENTORY_GENERAL', 'SUPPLIER_CONTACTS', 'QUEUE_MANAGER', 'SOP_INSPECT', 'REPORTS', 'HR_FILES', 'ASSESSMENT'] },
    { id: 'f2', title: 'Operations Supervisor (运营主管)', department: 'MANAGEMENT', rankCategory: 'MANAGEMENT', duties: ['楼面管理'], allowedModules: ['ROSTER_FLOOR', 'LOGBOOK', 'SOP_INSPECT', 'QUEUE_MANAGER', 'ASSESSMENT'] },
    { id: 'f3', title: 'Counter (柜台)', department: 'FOH', rankCategory: 'MID_LEVEL', duties: ['收银'], allowedModules: ['SETTLEMENT', 'QUEUE_MANAGER'] },
    { id: 'f4', title: 'Captain (写单员)', department: 'FOH', rankCategory: 'MID_LEVEL', duties: ['点单'], allowedModules: ['QUEUE_MANAGER'] },
    { id: 'f5', title: 'Waiter (服务员)', department: 'FOH', rankCategory: 'ENTRY_LEVEL', duties: ['服务'], allowedModules: [] },
    { id: 'f6', title: 'Cleaner (清洁员)', department: 'FOH', rankCategory: 'ENTRY_LEVEL', duties: ['清洁'], allowedModules: [] },
    { id: 'f7', title: 'Part-Time (兼职)', department: 'FOH', rankCategory: 'ENTRY_LEVEL', duties: ['机动'], allowedModules: [] },

    // ✅ NEW ROLES
    { id: 'm_hr',    title: 'HR Management (人事管理)',    department: 'MANAGEMENT', rankCategory: 'MANAGEMENT', duties: ['招聘', '档案管理', '薪资处理', '劳资关系'], allowedModules: ['HR_FILES', 'REPORTS', 'ROSTER', 'ASSESSMENT'] },
    { id: 'm_store', title: 'Store Management (店面管理)', department: 'MANAGEMENT', rankCategory: 'MANAGEMENT', duties: ['库存管理', '采购协调', '设备维护', '营业跟进'], allowedModules: ['INVENTORY_KITCHEN', 'INVENTORY_BAR', 'INVENTORY_GENERAL', 'SUPPLIER_CONTACTS', 'LOGBOOK', 'SOP_INSPECT', 'REPORTS'] },
    { id: 'x_delivery', title: 'Delivery (外卖)', department: 'FOH', rankCategory: 'ENTRY_LEVEL', duties: ['外卖配送'], allowedModules: [] },
    { id: 'x_order_checker', title: 'Order Checker (看单)', department: 'FOH', rankCategory: 'ENTRY_LEVEL', duties: ['核单'], allowedModules: [] },
];

export const DEFAULT_STAFF: Employee[] = [
  // OWNERS
  { id: '001', pin: '8888', name: 'BEN', role: 'Owner (老板)', status: 'CONFIRMED', rank: 'TOP', level: 'Confirmed', basicSalary: 0, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Male', nationality: 'Malaysian 🇲🇾' },
  { id: '002', pin: '8888', name: 'JAKE', role: 'Owner (老板)', status: 'CONFIRMED', rank: 'TOP', level: 'Confirmed', basicSalary: 0, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Male', nationality: 'Malaysian 🇲🇾' },
  { id: '003', pin: '8888', name: 'JEFFREY', role: 'Owner (老板)', status: 'CONFIRMED', rank: 'TOP', level: 'Confirmed', basicSalary: 0, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Male', nationality: 'Malaysian 🇲🇾' },
  { id: '004', pin: '8888', name: 'EVELYN', role: 'Owner (老板)', status: 'CONFIRMED', rank: 'TOP', level: 'Confirmed', basicSalary: 0, phone: '', joinDate: '2024-01-01', absentDays: 0, gender: 'Female', nationality: 'Malaysian 🇲🇾' }
];

export const NATIONALITY_OPTS = ['Malaysian 🇲🇾', 'Foreigner (WP)', 'Indonesian 🇮🇩', 'Bangladeshi 🇧🇩', 'Nepalese 🇳🇵', 'Vietnamese 🇻🇳', 'Myanmar 🇲🇲', 'Chinese 🇨🇳', 'Other'];
export const ALLOWANCE_RULES: Record<AllowanceKey, number> = { 
    'ATTENDANCE': 100, 
    'MEAL': 200, 
    'HOSTEL': 300,
    'OTHER': 0
};
export const SALARY_TABLE: Record<string, any> = {};
export const DEFAULT_BENEFIT_OPTIONS = [
    { id: 'UNIFORM', label: 'Uniform (制服)' },
    { id: 'BASIC', label: 'Basic Salary (底薪)' },
    { id: 'APP', label: 'App Access (系统权限)' },
    { id: 'TRAINING', label: 'Training (培训)' },
    { id: 'EPF', label: 'EPF & SOCSO (公积金)' },
    { id: 'LEAVE', label: 'Annual/MC Leave (年假病假)' },
    { id: 'ATTENDANCE', label: 'Attendance (全勤)' },
    { id: 'MEAL', label: 'Staff Meal (员工餐)' },
    { id: 'HOSTEL', label: 'Hostel (宿舍)' }
];

export const BANK_OPTIONS = ['Maybank', 'CIMB', 'Public Bank', 'Hong Leong', 'RHB', 'AmBank', 'UOB', 'OCBC', 'HSBC', 'Standard Chartered', 'Alliance Bank', 'Affin Bank', 'Bank Islam', 'Bank Muamalat', 'TNG eWallet', 'Cash (现金)'];
export const PAYMENT_METHOD_OPTIONS = [
    { label: 'Bank Transfer (银行转账)', value: 'BANK_TRANSFER' },
    { label: 'Cash (现金)', value: 'CASH' },
    { label: 'TNG eWallet', value: 'TNG_EWALLET' }
];