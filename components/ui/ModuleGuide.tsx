import React, { useState, useEffect } from 'react';
import { HelpCircle, X, BookOpen } from 'lucide-react';

export type GuideModule = 
    | 'SETTLEMENT' | 'TREASURY' | 'AP' | 'BILLS'
    | 'INVENTORY' | 'HR' | 'SUPPLIER' | 'ROSTER' 
    | 'LOGBOOK' | 'SOP' | 'QUEUE' | 'REPORTS' | 'MENU';

const GUIDE_CONTENT: Record<GuideModule, { title: string; steps: string[] }> = {
    SETTLEMENT: {
        title: '每日结算 & 现金管理 SOP',
        steps: [
            '💵 1. 开班现金 (Opening Float): 输入开铺时钱箱里的备用金。每次输入都针对移动端触控进行了适配。',
            '📈 2. 渠道营业额 (POS Payment Methods): 依次点击输入各项支付渠道 (Cash、TNG eWallet、Debit Card、Credit Card、Amex)。StoreHub POS Total 将由系统自动求和，免去人工计算。',
            '🛵 3. 外卖核算 (Delivery Platforms): 针对不同平台分通道精细核算：\n   - GrabFood (精确记账): 键入原价(Gross)、净额(Net)及广告费(Ads)，系统自动根据 (Net - Ads) 自动计算实到账款。\n   - FoodPanda: 输入今日 Gross 营业总额。\n   - ShopeeFood (精确记账): 输入分项数据，系统自动拉取净额(Net)计算入账。\n   - Lalamove: 输入实收到账 (Net) 金额。',
            '💸 4. 业主提支 (Owner\'s Drawings): 记录业主中途抽走支取的今日现金营业款，系统将在底层财务算薪时无缝扣减和跟踪。',
            '⚠️ 5. 当日钱箱支出 (CASH EXPENSES): 点击「+ 新增支出」可动态增设多条购买物资等小额开销。现已升级为高亮红色风格展示。',
            '💰 6. 关班结账 (Reconciliation): 结业时点算钱箱所有的实际现金 (Actual Cash) 并输入。\n   - 计算公式: 应余现金 = 开班备用金 + 现金营业额(Cash) - 当日钱箱支出 - 业主提支。\n   - 系统会自动对比并计算账目差异 (Variance)。若差异绝对值 > RM10，请务必填写具体说明。'
        ]
    },
    TREASURY: {
        title: '资金管理 & 股东权益',
        steps: [
            '📊 总览 (Overview): 实时查看 Cash (店面现金) 和 Bank (银行存款) 的余额。',
            '💸 转账 (Transfer): 记录 Cash -> Bank (存钱) 或 Bank -> Cash (提款) 的流向。',
            '💰 股东 (Equity): 记录股东注资 (Injection) 和 初始资金。',
            '🏗️ 开业支出 (Startup): 装修费、设备费和 **租金底金 (Rental Deposit)** 请在此处录入，选择 CAPEX 分类。'
        ]
    },
    AP: {
        title: '应付账款 (AP) 操作指南',
        steps: [
            '💡 核心概念: 此处管理所有基于“交易”的进货单据和杂费 (如买菜、维修、包装)。',
            '🛒 录入 (Add): 点击 "录入新账单"，输入供应商名称 (新名称会自动创建档案)。选择正确的财务科目 (COGS/OPEX)。',
            '⚡️ 批量支付 (Batch Pay): 1. 使用标签筛选 2. 点击全选 3. 点击底部批量支付。',
            '🏷️ 标签管理: 点击 "Manage Tags" 可修改或合并标签。',
            '⚠️ 注意: 固定月费 (房租/水电) 请去 Bills 模块，这里主要用于非固定的进货和杂项。'
        ]
    },
    BILLS: {
        title: '固定支出 (Bills) - 循环月费',
        steps: [
            '💡 定义: 基于“时间”的循环费用 (房租、水电、网费)。',
            '✅ 包含: 每月租金 (Monthly Rent)、TNB、Syabas、WiFi。',
            '❌ 不包含: 租金底金 (Rental Deposit)！底金是一次性资产，不是每月花费。',
            '⚡️ 功能: 记录电表读数，追踪每月用量趋势。'
        ]
    },
    INVENTORY: {
        title: '库存管理 SOP',
        steps: [
            '📋 盘点 (Check): 员工每日只需关注 "每日必盘 (Daily)" 的红色标签物品。',
            '⚙️ 管理 (Master): 老板可在此添加新物品、设定安全库存和进货价。',
            '🚚 进货: 推荐使用 "采购单 (PO)" 功能，入库时会自动增加数量。',
            '⚠️ 单位: 支持多单位换算 (如: 1 Box = 10 Pkt)。'
        ]
    },
    HR: {
        title: '人事与薪资指南',
        steps: [
            '👤 档案: 录入员工资料、底薪和银行信息。离职员工请点击 "离职" 归档。',
            '💵 薪资 (Payroll): 每月点击 "薪资结算"，系统自动拉取考勤扣款。',
            '✅ 确认: 核对无误后点击 "Post Payroll" 归档。'
        ]
    },
    SUPPLIER: {
        title: '供应商采购 SOP',
        steps: [
            '📂 目录 (Catalog): 先完善供应商的 "产品目录" 和价格。',
            '🛒 采购 (PO): 将物品加入购物车生成采购单。',
            '📤 发送: 点击 "WhatsApp" 直接发单给供应商。',
            '📥 收货: 货到后点击 "入库"，库存自动更新。'
        ]
    },
    ROSTER: {
        title: '排班管理指南',
        steps: [
            '📅 排班: 点击日期格子修改状态 (Work / Off / Leave)。',
            '🤒 病假/缺席: 选择 MC 或 Absent，系统会在算薪水时自动扣款。',
            '📝 备注: 点击格子可添加备注 (如: 晚到1小时)。'
        ]
    },
    LOGBOOK: {
        title: '运营日志 SOP',
        steps: [
            '📝 记录: 发生客诉、设备故障或突发事件必须记录。',
            '🔴 优先级: 紧急事项请选 "HIGH"，老板会重点关注。',
            '📷 拍照: 尽量上传照片作为证据。',
            '✅ 闭环: 问题解决后，管理层应更新 Action Taken。'
        ]
    },
    SOP: {
        title: 'SOP 稽查指南',
        steps: [
            '🧐 检查: 监控员工是否完成了开铺 (Opening) 和 打烊 (Closing) 任务。',
            '📊 进度: 绿色代表已完成，黄色代表进行中。',
            '🔄 重置: 每日凌晨系统自动重置。'
        ]
    },
    QUEUE: {
        title: '排队叫号使用指南',
        steps: [
            '1️⃣ 取号: 输入人数，系统自动分配 A/B/C 号码。',
            '2️⃣ 电视: 点击 "启动电视大屏" 展示叫号界面。',
            '3️⃣ 呼叫: 点击 "呼叫"，电视会语音播报。',
            '4️⃣ 入座: 客人进店后点击 "入座" 清除号码。'
        ]
    },
    REPORTS: {
        title: '财务分析报表指南',
        steps: [
            '📅 日期筛选: 切换查看 今日、本周或本月的数据。',
            '📊 经营分析: 点击甜甜圈图可查看具体支出明细。',
            '📄 损益表 (P&L): 底部的 Net Cash Flow 是扣除所有开支后的净现金流。',
            '⚠️ 债务 (Debt): 显示所有尚未结清的账单。'
        ]
    },
    MENU: {
        title: '智能菜谱管理指南',
        steps: [
            '🍽️ 1. 菜品管理 (Items): 查看和编辑所有餐厅菜品的价格、销售状态与分类。',
            '🎨 2. 菜品编辑 (Edit): 设置商品售价、成本，并估算毛利率。',
            '⚡️ 3. 实时同步 (Sync): 修改完成后，收银端与菜单将自动同步。'
        ]
    }
};

export const ModuleGuideButton: React.FC<{ module: GuideModule, dark?: boolean }> = ({ module, dark = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const content = GUIDE_CONTENT[module];

    // ESC 键关闭弹窗
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    if (!content) return null;

    return (
        <>
            <button 
                onClick={() => setIsOpen(true)} 
                className={`mobile-touch-target p-2 rounded-full transition-all flex items-center justify-center shrink-0 active:scale-90 ${
                    dark ? 'text-gray-500 hover:text-black hover:bg-gray-100' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`} 
                title="操作说明 (Help)"
            >
                <HelpCircle size={20} />
            </button>

            {isOpen && (
                <div 
                    className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-6 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-0 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-200"
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-[#1A1A1A] px-5 py-4 flex justify-between items-center text-white border-b-4 border-[#FFD700] shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#FFD700] rounded-lg">
                                    <BookOpen size={18} className="text-black"/>
                                </div>
                                <h3 className="font-black text-base sm:text-lg tracking-tight">{content.title}</h3>
                            </div>
                            <button 
                                onClick={() => setIsOpen(false)} 
                                className="mobile-touch-target p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="p-5 sm:p-6 space-y-4 bg-[#F9FAFB] flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            {content.steps.map((step, idx) => {
                                const isWarning = step.includes('⚠️') || step.includes('🚫') || step.includes('❌');
                                return (
                                    <div 
                                        key={idx} 
                                        className={`flex gap-3 p-3 rounded-xl transition-all ${
                                            isWarning ? 'bg-red-50 border border-red-100' : 'bg-white border border-gray-100'
                                        }`}
                                    >
                                        <div className={`mt-1.5 min-w-[6px] h-1.5 rounded-full shrink-0 ${
                                            isWarning ? 'bg-red-500' : 'bg-gray-400'
                                        }`}></div>
                                        <p className={`text-sm leading-relaxed ${
                                            isWarning ? 'text-red-700 font-bold' : 'text-gray-700'
                                        }`}>
                                            {step}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 bg-white border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] shrink-0">
                            <button 
                                onClick={() => setIsOpen(false)} 
                                className="w-full py-4 bg-[#1A1A1A] hover:bg-black text-[#FFD700] rounded-xl font-black text-sm transition-all active:scale-[0.98]"
                            >
                                明白了 (Got it)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
