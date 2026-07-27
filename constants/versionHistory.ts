export const APP_VERSION = "2.0";

export interface VersionLog {
    version: string;
    date: string;
    phaseId: string;
    phaseName: string;
    changes: string[];
}

export interface PhaseInfo {
    id: string;
    phaseNum: number;
    titleZh: string;
    titleEn: string;
    badge: string;
    status: 'COMPLETED' | 'CURRENT' | 'UPCOMING';
    period: string;
    icon: string;
    summary: string;
    features: {
        icon: string;
        title: string;
        desc: string;
        tag?: string;
    }[];
}

export const SYSTEM_PHASES: PhaseInfo[] = [
    {
        id: "PHASE_1",
        phaseNum: 1,
        titleZh: "阶段一：数字基座与核心模块",
        titleEn: "Phase 1: Foundation & Core ERP",
        badge: "已完成 COMPLETED",
        status: "COMPLETED",
        period: "v1.0 - v1.2",
        icon: "🏗️",
        summary: "构建 ERP 数字化基础设施，打通人事档案、打卡考勤、薪资计算、基础库存与 TV 叫号系统。",
        features: [
            { icon: "👥", title: "HR 人事与考勤 console", desc: "员工档案管理、排班考勤打卡与月度薪资初算", tag: "HR & Roster" },
            { icon: "📦", title: "基础库存与供应商", desc: "厨房/水吧/燃料库存管理与供应商名录录入", tag: "Inventory" },
            { icon: "📺", title: "排队叫号 TV 大屏", desc: "实时叫号大屏互动与离线数据安全备份", tag: "TV & System" }
        ]
    },
    {
        id: "PHASE_2",
        phaseNum: 2,
        titleZh: "阶段二：供应链数字化与精细化成本管控",
        titleEn: "Phase 2: Supply Chain & Costing 2.0",
        badge: "已完成 COMPLETED",
        status: "COMPLETED",
        period: "v1.3 - v1.5",
        icon: "🛒",
        summary: "升级智能采购 2.0，引入 Smart UOM 多单位换算、Catch Weight 生鲜称重补差及自动 COGS 归集。",
        features: [
            { icon: "⚖️", title: "Catch Weight 生鲜智能收货", desc: "按实际称重自动计算单价补差，解决生鲜入库误差", tag: "Smart Procurement" },
            { icon: "🍳", title: "菜谱成本同步 (Recipe Costing)", desc: "菜品配方成本自动计算与毛利动态监控", tag: "Menu Profit" },
            { icon: "🧾", title: "AP 批量支付凭证 & 会计科目", desc: "生成正式 Payment Voucher PDF，扩展 COGS 会计分类", tag: "Finance AP" },
            { icon: "🛡️", title: "设备保修追踪 (Warranty)", desc: "追踪门店资产保修期与维护记录", tag: "Asset Mgt" }
        ]
    },
    {
        id: "PHASE_3",
        phaseNum: 3,
        titleZh: "阶段三：决策治理、智能评测与合规",
        titleEn: "Phase 3: Digital Governance & Performance",
        badge: "已完成 COMPLETED",
        status: "COMPLETED",
        period: "v1.6 - v1.7",
        icon: "🏛️",
        summary: "建立数字董事会 (Boardroom)，推行 360°员工能力评测矩阵，SOP 履职追踪与 PDF 精准盘点导出。",
        features: [
            { icon: "🏛️", title: "数字董事会 (Digital Boardroom)", desc: "股东提案投票、OKR 目标追踪及营销战役 ROI 分析", tag: "Governance" },
            { icon: "🎯", title: "360°能力评测与自评屏蔽", desc: "精确配置评测关系，系统自动过滤自评，保障客观公正", tag: "Assessment" },
            { icon: "🖨️", title: "库存 PDF 高级导出", desc: "按部门筛选导出，支持隐藏成本金额，生成标准 A4 盘点单", tag: "PDF Report" }
        ]
    },
    {
        id: "PHASE_4",
        phaseNum: 4,
        titleZh: "阶段四：iOS 移动适配、三语架构与 AI 智慧引擎",
        titleEn: "Phase 4: Mobile HIG, Multi-Lang & AI Engine",
        badge: "当前运行 CURRENT",
        status: "CURRENT",
        period: "v1.8 - v2.0 (最新)",
        icon: "📱",
        summary: "针对 iOS 移动端/PWA 进行了全方位 HIG 触控适配，引入员工端三语支持及 Gemini AI 智慧运营诊断。",
        features: [
            { icon: "📱", title: "iOS Safe Area & 44px+ 触控", desc: "适配刘海屏与底部横条，全面优化单手大拇指底部 Tab 交互", tag: "iOS HIG / PWA" },
            { icon: "🌐", title: "员工三语控制台 (ZH / EN / MY)", desc: "支持中文、英文、缅甸语实时切换，无痛跨国籍员工协同", tag: "Multi-Lang" },
            { icon: "🤖", title: "Gemini 2.5/Flash AI 运营诊断", desc: "AI 损益分析 Advisor、语音巡店问答与智能发票 OCR 识别", tag: "Gemini AI" },
            { icon: "⚡", title: "AP 自动账单 8000+ 供应商映射", desc: "智能匹配 Evo Print, EK Fresh, Choi Seng, Restoran Noble 等", tag: "Smart AP" }
        ]
    },
    {
        id: "PHASE_5",
        phaseNum: 5,
        titleZh: "阶段五：全链条自动化与多店连锁扩展",
        titleEn: "Phase 5: Automated Ecosystem & Multi-Outlet",
        badge: "规划中 UPCOMING",
        status: "UPCOMING",
        period: "Roadmap (v2.1+)",
        icon: "🚀",
        summary: "未来将全面推进多门店调拨自动化、智能安全库存预测与 POS 实时双向数据同步。",
        features: [
            { icon: "🔮", title: "AI 销量预测与自动补货 PO", desc: "基于历史销量与天气自动生成下一周食材采购单", tag: "AI Forecast" },
            { icon: "🏪", title: "多门店跨店调拨 (Inter-store)", desc: "分店间库存实时申请、审批与调拨入库", tag: "Multi-Store" },
            { icon: "💳", title: "POS 实时双向同步 & 会员 CRM", desc: "交易自动冲减库存，会员积分与营销联动", tag: "POS Sync" }
        ]
    }
];

export const VERSION_HISTORY: VersionLog[] = [
    {
        version: "2.0",
        date: "2026-07-22",
        phaseId: "PHASE_4",
        phaseName: "阶段四：iOS 移动适配、三语架构与 AI 智慧引擎",
        changes: [
            "📱 iOS HIG 触控与 PWA 全面适配: 适配 Safe Area (env(safe-area-inset-*))，按钮触控不小于 44x44px，全面采用单手底部导航。",
            "🌐 员工端三语系统 (ZH / EN / MY): 完善中文、英文、缅甸语 (Myanmar) 实时无痛切换，跨国籍团队沟通无障碍。",
            "🤖 Gemini AI 运营诊断助手: 集成 AI 损益分析 (P&L Advisor)、语音巡店问答与智能账单识别。",
            "⚡ AP 自动化账单匹配: 精准关联 8000+ 供应商映射库 (Evo Print, EK Fresh, Choi Seng, Restoran Noble 等)。"
        ]
    },
    {
        version: "1.7",
        date: "2024-07-20",
        phaseId: "PHASE_3",
        phaseName: "阶段三：决策治理、智能评测与合规",
        changes: [
            "🖨️ 库存 PDF 高级导出 (Advanced Inventory Export): 库存总览新增 PDF 导出功能。",
            "🎯 精准筛选: 支持按部门 (Kitchen/Bar/General/Fuel) 筛选导出，无需打印全表。",
            "🙈 敏感数据控制: 可选择隐藏“成本与总价值”，方便打印给员工进行盘点。",
            "📉 缺货报表: 可一键勾选“仅导出缺货 (Low Stock Only)”，方便快速补货。",
            "📄 A4 打印优化: 自动分页、自动生成表头，完美适配 A4 纸张打印。"
        ]
    },
    {
        version: "1.6",
        date: "2024-07-15",
        phaseId: "PHASE_3",
        phaseName: "阶段三：决策治理、智能评测与合规",
        changes: [
            "🎯 评测权限配置 (Assessment Targeting): 在人事档案中新增了“评测对象配置”功能，现在可以精确设置每位员工允许评测的人员名单。",
            "🚫 禁止自评 (Self-Assessment Block): 能力评测模块现在会自动过滤掉当前登录者自己，确保评分公正。",
            "🍳 岗位分类修正 (Role Grouping Fix): 修正了打荷等岗位在系统内部的部门归属，确保其归类为厨房团队。",
            "🔒 权限逻辑增强: 非老板账号严格遵循配置好的评测名单。"
        ]
    },
    {
        version: "1.5",
        date: "2024-07-08",
        phaseId: "PHASE_2",
        phaseName: "阶段二：供应链数字化与精细化成本管控",
        changes: [
            "🖨️ 薪资单打印修复 (Payroll Print Fix): 彻底解决了薪资单和汇总表打印时内容被截断的问题。",
            "📊 会计科目扩展 (Accounting Categories): 应付账款 (AP) 新增 [食材-面类]、[碳]、[鱼类] 选项，并同步归类为 COGS。",
            "🔧 财务报表优化: 增强了成本归类逻辑。"
        ]
    },
    {
        version: "1.4",
        date: "2024-07-01",
        phaseId: "PHASE_2",
        phaseName: "阶段二：供应链数字化与精细化成本管控",
        changes: [
            "🏛️ 战略决策中心 (Digital Boardroom): 新增股东提案投票、OKR 目标管理、营销战役 ROI 追踪及活动日历。",
            "💰 资金流水账本 (Treasury Ledger): 资金管理新增“现金/银行流水账本”视图。",
            "⚖️ 智能收货 (Catch Weight): 采购入库支持“按重量计费”模式，自动计算实际单价。",
            "🧾 付款凭证 (Payment Voucher): AP 模块支持生成正式付款凭证 PDF，并支持一键批量支付。"
        ]
    },
    {
        version: "1.3",
        date: "2024-06-25",
        phaseId: "PHASE_2",
        phaseName: "阶段二：供应链数字化与精细化成本管控",
        changes: [
            "🛒 智能采购升级 (Procurement 2.0): 新增厨房二级分类 (海鲜/肉类/干货等) 与独立打包分类。",
            "⚖️ 多单位下单 (Smart UOM): 支持下单时切换单位 (如: PKT -> CTN)，系统自动换算价格。",
            "✏️ 价格灵活调整: 下单时可手动修改单价，应对供应商临时涨价。",
            "📱 移动端体验优化: 底部悬浮购物车 (Floating Cart) 与分类吸顶导航。"
        ]
    },
    {
        version: "1.2",
        date: "2024-06-15",
        phaseId: "PHASE_1",
        phaseName: "阶段一：数字基座与核心模块",
        changes: [
            "🛡️ 新增保修模块 (Warranty): 追踪设备保修期与单据链接。",
            "💰 资金管理升级 (Treasury): 新增现金/银行账本 (Ledger View) 与额外收入记录。",
            "📦 库存优化 (Inventory): 支持多单位换算 (Smart Unit) 及采购单直接入库 (PO Import)。",
            "⏰ 考勤增强 (Attendance): 新增一键批量开工 (Batch In) 与工时达标检查报表。"
        ]
    },
    {
        version: "1.1",
        date: "2024-05-21",
        phaseId: "PHASE_1",
        phaseName: "阶段一：数字基座与核心模块",
        changes: [
            "✨ 新增数据备份功能 (Data Export)：防止资料丢失，支持一键下载全系统数据。",
            "🔧 优化系统设置界面布局。",
            "📝 增加版本更新日志 (Changelog) 查看功能。"
        ]
    },
    {
        version: "1.0",
        date: "2024-01-01",
        phaseId: "PHASE_1",
        phaseName: "阶段一：数字基座与核心模块",
        changes: [
            "🚀 系统正式上线 (Initial Release)。",
            "✅ 包含核心模块：人事、考勤、薪资、库存、供应商、财务结算。",
            "📺 集成排队叫号 TV 大屏功能。"
        ]
    }
];
