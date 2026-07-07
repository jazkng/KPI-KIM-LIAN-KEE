
export const APP_VERSION = "1.7";

export interface VersionLog {
    version: string;
    date: string;
    changes: string[];
}

export const VERSION_HISTORY: VersionLog[] = [
    {
        version: "1.7",
        date: "2024-07-20",
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
        changes: [
            "🎯 评测权限配置 (Assessment Targeting): 在人事档案中新增了“评测对象配置”功能，现在可以精确设置每位员工允许评测的人员名单（例如：头手只能评测厨房帮手）。",
            "🚫 禁止自评 (Self-Assessment Block): 能力评测模块现在会自动过滤掉当前登录者自己，确保评分公正。",
            "🍳 岗位分类修正 (Role Grouping Fix): 修正了“打荷 (Fryer)”等岗位在系统内部的部门归属，确保它们被正确归类为厨房团队而非楼面。",
            "🔒 权限逻辑增强: 非老板账号现在严格遵循配置好的评测名单，不再能看到所有人。"
        ]
    },
    {
        version: "1.5",
        date: "2024-07-08",
        changes: [
            "🖨️ 薪资单打印修复 (Payroll Print Fix): 彻底解决了薪资单和汇总表打印时内容被截断或无限加载的问题，优化了 A4 打印布局。",
            "📊 会计科目扩展 (Accounting Categories): 应付账款 (AP) 与供应商模块新增 [食材-面类]、[碳]、[鱼类] 选项，并已同步至财务报表自动归类为 COGS (销货成本)。",
            "🔧 财务报表优化: 增强了成本归类逻辑，确保新增的食材类别能被正确识别为成本而非运营支出。"
        ]
    },
    {
        version: "1.4",
        date: "2024-07-01",
        changes: [
            "🏛️ 战略决策中心 (Digital Boardroom): 新增股东提案投票、OKR 目标管理、营销战役 ROI 追踪及活动日历。",
            "💰 资金流水账本 (Treasury Ledger): 资金管理新增“现金/银行流水账本”视图，支持查看每一笔资金变动明细。",
            "⚖️ 智能收货 (Catch Weight): 采购入库支持“按重量计费”模式，自动计算实际单价，解决生鲜称重误差。",
            "🧾 付款凭证 (Payment Voucher): AP 模块支持生成正式付款凭证 PDF，并支持一键批量支付 (Batch Pay)。",
            "🍳 菜谱优化 (Menu): 菜单管理支持拖拽排序 (Reorder) 及配方成本一键同步 (Recipe Sync)。",
            "📄 报表增强: 排班表支持 PDF 导出，薪资单支持离职即时结清功能。"
        ]
    },
    {
        version: "1.3",
        date: "2024-06-25",
        changes: [
            "🛒 智能采购升级 (Procurement 2.0): 新增厨房二级分类 (海鲜/肉类/干货等) 与独立打包分类。",
            "⚖️ 多单位下单 (Smart UOM): 支持下单时切换单位 (如: PKT -> CTN)，系统自动换算价格。",
            "✏️ 价格灵活调整: 下单时可手动修改单价，应对供应商临时涨价。",
            "📱 移动端体验优化: 底部悬浮购物车 (Floating Cart) 与分类吸顶导航，单手操作更丝滑。",
            "💄 UI/UX 全面美化: 采用黑金/红白配色，提升视觉质感与操作清晰度。"
        ]
    },
    {
        version: "1.2",
        date: "2024-06-15",
        changes: [
            "🛡️ 新增保修模块 (Warranty): 追踪设备保修期与单据链接。",
            "💰 资金管理升级 (Treasury): 新增现金/银行账本 (Ledger View) 与额外收入记录 (Extra Income)。",
            "📦 库存优化 (Inventory): 支持多单位换算 (Smart Unit) 及采购单直接入库 (PO Import)。",
            "⏰ 考勤增强 (Attendance): 新增一键批量开工 (Batch In) 与工时达标检查报表。",
            "🔗 供应商关联 (Supplier): 支持库存物品与供应商目录的深度关联。"
        ]
    },
    {
        version: "1.1",
        date: "2024-05-21",
        changes: [
            "✨ 新增数据备份功能 (Data Export)：防止资料丢失，支持一键下载全系统数据。",
            "🔧 优化系统设置界面布局。",
            "📝 增加版本更新日志 (Changelog) 查看功能。",
            "🔒 强化数据安全性。"
        ]
    },
    {
        version: "1.0",
        date: "2024-01-01",
        changes: [
            "🚀 系统正式上线 (Initial Release)。",
            "✅ 包含核心模块：人事、考勤、薪资、库存、供应商、财务结算。",
            "📺 集成排队叫号 TV 大屏功能。"
        ]
    }
];
