import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    Users, Crown, Banknote, Coffee, Truck, Armchair, CheckSquare, PenTool, BookOpen, CalendarOff, 
    ClipboardCheck, Layout, Box, Eye, FileBarChart, Clock, CreditCard, Wallet, ShieldCheck,
    AlertTriangle, ShoppingCart, Megaphone, Target, PartyPopper, Vote, TrendingUp, Award, Languages, Palette, X,
    FileText, Calculator
} from 'lucide-react';
import { Employee } from '../types';
import { HRSystem } from './features/HRSystem';
import { MenuManagement } from './features/MenuManagement';
import { RecurringBillsModule } from './features/RecurringBillsModule';
import { OrgChart } from './features/OrgChart';
import { FinancialReport } from './features/FinancialReport';
import { AttendanceConsole } from './features/AttendanceConsole';
import { AccountsPayableModule } from './features/AccountsPayableModule';
import { TreasuryModule } from './features/TreasuryModule'; 
import { WarrantyModule } from './features/WarrantyModule'; 
import { EventsPlanningModule } from './features/EventsPlanningModule';
import { PriceMonitorModule } from './features/PriceMonitorModule'; 
import { EmployeeAssessmentModule } from './features/EmployeeAssessmentModule';
import { TranslationManager } from './features/TranslationManager'; 
import { SelfInvoiceModule } from './features/SelfInvoiceModule';
import { AIOperationsAssistant } from './features/AIOperationsAssistant';
import { DataManager } from '../utils/dataManager';

// ─────────────────────────────────────────────────────────────
// 1. 常量与缓存配置 (外置，避免重新渲染)
// ─────────────────────────────────────────────────────────────
const CARD_COLORS_KEY  = 'boss_dashboard_card_colors';
const ALERTS_CACHE_KEY = 'boss_dashboard_alerts_cache';
const ALERTS_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

const COLOR_PRESETS = [
    { dot: 'bg-white border border-gray-300', bgClass: 'bg-white' },
    { dot: 'bg-red-100',     bgClass: 'bg-red-50' },
    { dot: 'bg-orange-100',  bgClass: 'bg-orange-50' },
    { dot: 'bg-amber-100',   bgClass: 'bg-amber-50' },
    { dot: 'bg-lime-100',    bgClass: 'bg-lime-50' },
    { dot: 'bg-emerald-100', bgClass: 'bg-emerald-50' },
    { dot: 'bg-teal-100',    bgClass: 'bg-teal-50' },
    { dot: 'bg-blue-100',    bgClass: 'bg-blue-50' },
    { dot: 'bg-indigo-100',  bgClass: 'bg-indigo-50' },
    { dot: 'bg-purple-100',  bgClass: 'bg-purple-50' },
    { dot: 'bg-pink-100',    bgClass: 'bg-pink-50' },
    { dot: 'bg-cyan-100',    bgClass: 'bg-cyan-50' },
];

const MODAL_KEYS = [
    'NONE','HR','MENU','BILLS','ORG','REPORTS','ATTENDANCE',
    'AP','TREASURY','WARRANTY','PLANNING','PRICE_MONITOR','ASSESSMENT','TRANSLATION','SELF_INVOICE',
] as const;
type ActiveModal = typeof MODAL_KEYS[number];
type PlanningTab  = 'VOTE' | 'OKR' | 'CAMPAIGN' | 'EVENTS';

// ─────────────────────────────────────────────────────────────
// 2. 数据驱动的 UI 配置 (新增任何卡片只需在这里加一行)
// ─────────────────────────────────────────────────────────────
type CardConfig = {
    id: string; title: string; sub: string; icon: React.ElementType; 
    colorClass: string; iconColor: string; 
    actionType: 'MODAL' | 'NAVIGATE' | 'PLANNING'; target: string;
    alertKey?: 'bills' | 'stock' | 'logs' | 'absent'; alertColor?: string;
};

const DASHBOARD_SECTIONS = [
    {
        title: "财务与资金", sub: "Finance & Capital", icon: Crown,
        cards: [
            { id: "settlement", title: "每日结算", sub: "SETTLEMENT", icon: Calculator, colorClass: "bg-amber-50", iconColor: "text-amber-600", actionType: 'NAVIGATE', target: 'SETTLEMENT' },
            { id: "treasury", title: "资金管理", sub: "CASH & BANK", icon: Wallet, colorClass: "bg-emerald-50", iconColor: "text-emerald-600", actionType: 'MODAL', target: 'TREASURY' },
            { id: "reports", title: "财务报表", sub: "P&L REPORT", icon: FileBarChart, colorClass: "bg-green-50", iconColor: "text-green-600", actionType: 'MODAL', target: 'REPORTS' },
            { id: "bills", title: "固定支出", sub: "SUBSCRIPTIONS", icon: Banknote, colorClass: "bg-orange-50", iconColor: "text-orange-600", actionType: 'MODAL', target: 'BILLS', alertKey: 'bills' },
            { id: "ap", title: "应付账款", sub: "ACCOUNTS PAYABLE", icon: CreditCard, colorClass: "bg-rose-50", iconColor: "text-rose-600", actionType: 'MODAL', target: 'AP' },
            { id: "price", title: "成本监控", sub: "PRICE MONITOR", icon: TrendingUp, colorClass: "bg-red-50", iconColor: "text-red-600", actionType: 'MODAL', target: 'PRICE_MONITOR' },
        ] as CardConfig[]
    },
    {
        title: "人事与考勤", sub: "HR & Workforce",
        cards: [
            { id: "hr", title: "HR 指挥中心", sub: "人员档案 / 薪资", icon: Users, colorClass: "bg-red-50", iconColor: "text-red-600", actionType: 'MODAL', target: 'HR' },
            { id: "attendance", title: "考勤总控台", sub: "Attendance Control", icon: Clock, colorClass: "bg-indigo-50", iconColor: "text-indigo-600", actionType: 'MODAL', target: 'ATTENDANCE' },
            { id: "assess", title: "能力评测", sub: "SKILL MATRIX", icon: Award, colorClass: "bg-purple-50", iconColor: "text-purple-600", actionType: 'MODAL', target: 'ASSESSMENT' },
            { id: "roster", title: "排班缺席", sub: "ROSTER", icon: CalendarOff, colorClass: "bg-rose-50", iconColor: "text-rose-500", actionType: 'NAVIGATE', target: 'ROSTER', alertKey: 'absent', alertColor: 'bg-orange-500' },
            { id: "org", title: "组织结构", sub: "ORG STRUCTURE", icon: Layout, colorClass: "bg-teal-50", iconColor: "text-teal-600", actionType: 'MODAL', target: 'ORG' },
        ] as CardConfig[]
    },
    {
        title: "供应链与产品", sub: "Supply & Product",
        cards: [
            { id: "order", title: "智能订货", sub: "SMART ORDER", icon: ShoppingCart, colorClass: "bg-lime-50", iconColor: "text-lime-600", actionType: 'NAVIGATE', target: 'PROCUREMENT' },
            { id: "supplier", title: "供应商", sub: "PURCHASING", icon: Truck, colorClass: "bg-blue-50", iconColor: "text-blue-600", actionType: 'NAVIGATE', target: 'SUPPLIER_CONTACTS' },
            { id: "stock", title: "库存总览", sub: "STOCK VALUE", icon: Eye, colorClass: "bg-purple-50", iconColor: "text-purple-600", actionType: 'NAVIGATE', target: 'INVENTORY_VIEW', alertKey: 'stock' },
            { id: "translation", title: "翻译管理", sub: "TRANSLATION", icon: Languages, colorClass: "bg-orange-50", iconColor: "text-orange-600", actionType: 'MODAL', target: 'TRANSLATION' },
            { id: "menu", title: "智能菜谱", sub: "SMART RECIPE", icon: Coffee, colorClass: "bg-amber-50", iconColor: "text-amber-600", actionType: 'MODAL', target: 'MENU' },
            { id: "warranty", title: "保修记录", sub: "WARRANTY", icon: ShieldCheck, colorClass: "bg-cyan-50", iconColor: "text-cyan-600", actionType: 'MODAL', target: 'WARRANTY' },
            { id: "self_invoice", title: "自制凭单", sub: "VOUCHER MAKER", icon: FileText, colorClass: "bg-emerald-50", iconColor: "text-emerald-600", actionType: 'MODAL', target: 'SELF_INVOICE' },
        ] as CardConfig[]
    },
    {
        title: "活动与计划", sub: "Strategy & Planning",
        cards: [
            { id: "vote", title: "决策投票", sub: "BOARDROOM VOTE", icon: Vote, colorClass: "bg-black text-white", iconColor: "text-[#FFD700]", actionType: 'PLANNING', target: 'VOTE' },
            { id: "okr", title: "目标规划", sub: "OKRs & KPI", icon: Target, colorClass: "bg-indigo-50", iconColor: "text-indigo-600", actionType: 'PLANNING', target: 'OKR' },
            { id: "campaign", title: "营销推广", sub: "CAMPAIGNS (ROI)", icon: Megaphone, colorClass: "bg-pink-50", iconColor: "text-pink-600", actionType: 'PLANNING', target: 'CAMPAIGN' },
            { id: "events", title: "节日活动", sub: "EVENTS CALENDAR", icon: PartyPopper, colorClass: "bg-rose-50", iconColor: "text-rose-600", actionType: 'PLANNING', target: 'EVENTS' },
        ] as CardConfig[]
    }
];

const DAILY_OPS_CARDS: CardConfig[] = [
    { id: "queue", title: "排队叫号", sub: "QUEUE TV", icon: Armchair, colorClass: "bg-white border-2 border-gray-100", iconColor: "text-gray-600", actionType: 'NAVIGATE', target: 'QUEUE' },
    { id: "invcheck", title: "库存盘点", sub: "CHECK", icon: CheckSquare, colorClass: "bg-blue-50", iconColor: "text-blue-500", actionType: 'NAVIGATE', target: 'INVENTORY_CHECK' },
    { id: "logwrite", title: "运营日志（写）", sub: "ADD LOG", icon: PenTool, colorClass: "bg-orange-50", iconColor: "text-orange-500", actionType: 'NAVIGATE', target: 'LOGBOOK' },
    { id: "logview", title: "运营日志（查）", sub: "VIEW", icon: BookOpen, colorClass: "bg-emerald-50", iconColor: "text-emerald-500", actionType: 'NAVIGATE', target: 'LOGBOOK_VIEW', alertKey: 'logs', alertColor: 'bg-blue-500' },
    { id: "sop", title: "SOP 稽查", sub: "INSPECT", icon: ClipboardCheck, colorClass: "bg-violet-50", iconColor: "text-violet-500", actionType: 'NAVIGATE', target: 'SOP_INSPECT' },
];

// ─────────────────────────────────────────────────────────────
// 3. 自定义 Hook: 独立处理数据获取逻辑，不阻塞 UI 渲染
// ─────────────────────────────────────────────────────────────
function useDashboardAlerts() {
    const [alerts, setAlerts] = useState({ bills: 0, stock: 0, logs: 0, absent: 0 });
    const [loadingAlerts, setLoadingAlerts] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const run = async () => {
            try {
                const raw = sessionStorage.getItem(ALERTS_CACHE_KEY);
                if (raw) {
                    const { alerts: cached, timestamp } = JSON.parse(raw);
                    if (Date.now() - timestamp < ALERTS_CACHE_TTL) {
                        if (isMounted) { setAlerts(cached); setLoadingAlerts(false); }
                        return;
                    }
                }
            } catch {}

            setLoadingAlerts(true);
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const yr = today.getFullYear();
            const mo = today.getMonth() + 1;

            try {
                const results = await Promise.allSettled([
                    DataManager.getRecurringBills(),
                    Promise.all([DataManager.getStock('KITCHEN'), DataManager.getStock('BAR'), DataManager.getStock('GENERAL')]),
                    DataManager.getRosterData(),
                    DataManager.getLogs(),
                ]);

                if (!isMounted) return;
                const next = { bills: 0, stock: 0, logs: 0, absent: 0 };

                if (results[0].status === 'fulfilled') {
                    results[0].value.forEach((bill: any) => {
                        if (bill.type === 'YEARLY') {
                            const due = new Date(yr, (bill.dueMonth || 1) - 1, bill.dueDay);
                            const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
                            const lastYr = bill.lastPaidDate ? new Date(bill.lastPaidDate).getFullYear() : 0;
                            if (lastYr < yr && diff <= (bill.reminderDays || 30)) next.bills++;
                        } else if (bill.type === 'MONTHLY') {
                            const due = new Date(yr, mo - 1, bill.dueDay || 1);
                            const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
                            const isPaid = bill.lastPaidDate ? (() => { const d = new Date(bill.lastPaidDate); return d.getFullYear() === yr && d.getMonth() + 1 === mo; })() : false;
                            if (!isPaid && diff <= (bill.reminderDays || 7)) next.bills++;
                        }
                    });
                }
                if (results[1].status === 'fulfilled') {
                    const all = results[1].value.flat();
                    next.stock = all.filter((i: any) => i.currentQty <= (i.minLevel || 0)).length;
                }
                if (results[2].status === 'fulfilled') {
                    const todayRoster = results[2].value.roster[dateStr] || {};
                    next.absent = Object.values(todayRoster).filter((s: any) => s === 'MC' || s === 'ABSENT').length;
                }
                if (results[3].status === 'fulfilled') {
                    next.logs = results[3].value.filter((l: any) => l.date === dateStr && !l.acknowledgedBy).length;
                }

                setAlerts(next);
                try { sessionStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify({ alerts: next, timestamp: Date.now() })); } catch {}
            } catch (e) {
                console.error('Dashboard Health Check Failed', e);
            } finally {
                if (isMounted) setLoadingAlerts(false);
            }
        };
        run();
        return () => { isMounted = false; };
    }, []);

    const totalAlerts = useMemo(() => Object.values(alerts).reduce((a, b) => a + b, 0), [alerts]);
    return { alerts, loadingAlerts, totalAlerts };
}

// ─────────────────────────────────────────────────────────────
// 4. UI 组件 (DashboardCard & SectionBlock 原样保留)
// ─────────────────────────────────────────────────────────────
interface DashboardCardProps {
    id?: string; title: string; sub: string; icon: React.ElementType; colorClass: string; iconColor: string;
    onClick: () => void; alertCount?: number; alertColor?: string;
    cardColors: Record<string, string>; colorPickerOpen: string | null; pickerRef: React.RefObject<HTMLDivElement | null>;
    onOpenPicker: (id: string) => void; onSetColor: (id: string, bgClass: string) => void; onResetColor: (id: string) => void;
}

const DashboardCard = React.memo(({ id, title, sub, icon: Icon, colorClass, onClick, iconColor, alertCount = 0, alertColor = 'bg-red-500', cardColors, colorPickerOpen, pickerRef, onOpenPicker, onSetColor, onResetColor }: DashboardCardProps) => {
    const cardBg = (id && cardColors[id]) ? cardColors[id] : 'bg-white';
    const isPickerOpen = id ? colorPickerOpen === id : false;

    // Mobile long press states & references
    const timerRef = React.useRef<any>(null);
    const progressIntervalRef = React.useRef<any>(null);
    const [isHolding, setIsHolding] = React.useState(false);
    const [holdProgress, setHoldProgress] = React.useState(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        
        // Reset and clear any existing timers
        if (timerRef.current) clearTimeout(timerRef.current);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

        setIsHolding(true);
        setHoldProgress(0);

        let elapsed = 0;
        // Total duration 3000ms. An update every 50ms (60 updates total)
        progressIntervalRef.current = setInterval(() => {
            elapsed += 50;
            const percentage = Math.min((elapsed / 3000) * 100, 100);
            setHoldProgress(percentage);
        }, 50);

        timerRef.current = setTimeout(() => {
            onOpenPicker(isPickerOpen ? '' : (id ?? ''));
            setIsHolding(false);
            setHoldProgress(0);
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (navigator.vibrate) {
                try { navigator.vibrate(80); } catch (_) {}
            }
        }, 3000); // 3 seconds hold required strictly
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        setIsHolding(false);
        setHoldProgress(0);
    };

    const handleMouseClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const isMobile = window.innerWidth < 768;
        if (!isMobile) {
            // Desktop users enjoy immediate single clicks for fast setup
            onOpenPicker(isPickerOpen ? '' : (id ?? ''));
        }
    };

    return (
        <button
            onClick={onClick}
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            className={[cardBg, 'p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all text-left group h-full min-h-[72px] md:min-h-0 flex flex-col justify-between relative overflow-visible active:scale-[0.97] active:shadow-none select-none'].join(' ')}
        >
            {alertCount > 0 && (
                <div className={['absolute top-6 md:top-7 -right-2', alertColor, 'text-white text-[10px] font-black min-w-[1.25rem] h-5 px-1.5 rounded-full flex items-center justify-center shadow-md animate-pulse z-10 border-2 border-white'].join(' ')}>
                    {alertCount}
                </div>
            )}
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center mb-2 md:mb-4 ${colorClass}`}>
                <Icon size={20} className={`md:w-6 md:h-6 ${iconColor}`} />
            </div>
            <div>
                <h4 className="font-bold text-[#1A1A1A] text-xs md:text-sm mb-0.5 md:mb-1 group-hover:text-black transition-colors leading-tight">{title}</h4>
                <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-tight line-clamp-1">{sub}</p>
            </div>
        </button>
    );
});
DashboardCard.displayName = 'DashboardCard';

const SectionBlock: React.FC<{ title: string; sub: string; children: React.ReactNode }> = ({ title, sub, children }) => (
    <div>
        <h4 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">{title} · <span className="text-gray-300 font-normal">{sub}</span></h4>
        {children}
    </div>
);

export const BossDashboard: React.FC<{ currentEmployee: Employee; onNavigate: (tab: string) => void; onOpenConfig?: () => void }> = ({ currentEmployee, onNavigate, onOpenConfig }) => {
    const { alerts, loadingAlerts, totalAlerts } = useDashboardAlerts();
    const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');
    const [planningTab, setPlanningTab] = useState<PlanningTab>('VOTE');

    // Notify parent App.tsx when activeModal changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).bossActiveModal = activeModal;
            window.dispatchEvent(new Event('boss-modal-change'));
        }
    }, [activeModal]);
    const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
    const [cardColors, setCardColors] = useState<Record<string, string>>(() => {
        try {
            const raw = localStorage.getItem(CARD_COLORS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });
    const [alertDismissed, setAlertDismissed] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);

    const pickerRef = useRef<HTMLDivElement | null>(null);

    // 监听跨模块跳转意图以打开 AP 等 Modal
    useEffect(() => {
        const checkNav = () => {
            const modal = localStorage.getItem('klk_boss_active_modal');
            if (modal) {
                setActiveModal(modal as ActiveModal);
                localStorage.removeItem('klk_boss_active_modal');
            }
        };
        checkNav();
        window.addEventListener('storage-sync-navigation', checkNav);
        return () => window.removeEventListener('storage-sync-navigation', checkNav);
    }, []);

    // 全局事件监听：点击外部关闭调色板
    useEffect(() => {
        if (!colorPickerOpen) return;
        const handler = (e: MouseEvent) => {
            if (!pickerRef.current || !pickerRef.current.contains(e.target as Node)) {
                setColorPickerOpen(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [colorPickerOpen]);

    // Handlers (useCallback 保证组件 memo 性能)
    const handleOpenPicker = useCallback((id: string) => setColorPickerOpen(id || null), []);
    const handleSetCardColor = useCallback((cardId: string, bgClass: string) => {
        setCardColors(prev => {
            const next = { ...prev, [cardId]: bgClass };
            try { localStorage.setItem(CARD_COLORS_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
        setColorPickerOpen(null);
    }, []);
    const handleResetCardColor = useCallback((cardId: string) => {
        setCardColors(prev => {
            const next = { ...prev }; delete next[cardId];
            try { localStorage.setItem(CARD_COLORS_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
        setColorPickerOpen(null);
    }, []);

    // 核心跳转中枢（解析 Config）
    const handleCardClick = useCallback((card: CardConfig) => {
        if (card.actionType === 'MODAL') {
            setActiveModal(card.target as ActiveModal);
        } else if (card.actionType === 'NAVIGATE') {
            onNavigate(card.target);
        } else if (card.actionType === 'PLANNING') {
            setPlanningTab(card.target as PlanningTab);
            setActiveModal('PLANNING');
        }
    }, [onNavigate]);

    const pickerProps = useMemo(() => ({
        cardColors, colorPickerOpen, pickerRef,
        onOpenPicker: handleOpenPicker, onSetColor: handleSetCardColor, onResetColor: handleResetCardColor,
    }), [cardColors, colorPickerOpen, handleOpenPicker, handleSetCardColor, handleResetCardColor]);

    // 字典映射渲染 Modal（比长串的 && 判断更清晰且性能更好）
    const renderModal = () => {
        const close = () => setActiveModal('NONE');
        const modalMap: Record<string, React.ReactElement> = {
            'HR': <HRSystem onClose={close} currentEmployee={currentEmployee} />,
            'MENU': <MenuManagement onClose={close} />,
            'BILLS': <RecurringBillsModule onClose={close} />,
            'ORG': <OrgChart onClose={close} />,
            'REPORTS': <FinancialReport onClose={close} />,
            'ATTENDANCE': <AttendanceConsole onClose={close} />,
            'AP': <AccountsPayableModule onClose={close} onNavigateToSelfVoucher={(prefill) => {
                localStorage.setItem('klk_prefill_self_invoice', JSON.stringify(prefill));
                setActiveModal('SELF_INVOICE');
            }} />,
            'TREASURY': <TreasuryModule onClose={close} />,
            'WARRANTY': <WarrantyModule onClose={close} />,
            'PLANNING': <EventsPlanningModule onClose={close} currentEmployee={currentEmployee} defaultTab={planningTab} />,
            'PRICE_MONITOR': <PriceMonitorModule onClose={close} />,
            'ASSESSMENT': <EmployeeAssessmentModule onClose={close} currentEmployee={currentEmployee} />,
            'TRANSLATION': <TranslationManager onClose={close} />,
            'SELF_INVOICE': <SelfInvoiceModule onClose={close} />
        };
        return activeModal !== 'NONE' ? modalMap[activeModal] : null;
    };

    return (
        <div className="p-3 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-8 bg-[#FAFAFA] min-h-screen overflow-x-hidden" style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' }}>
            
            {/* ── 🔮 AI 智控决策脑库旗舰面板 (AI Core Intelligence Operations Center) ── */}
            <div className="hidden md:block bg-gradient-to-br from-[#0E0E10] via-[#151518] to-[#0A0A0C] border border-[#FFD700]/25 rounded-[1.5rem] p-5 text-white shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(255,215,0,0.03)] relative overflow-hidden animate-in fade-in-50 duration-500">
                {/* Micro Gold-Glow Ambient Light Source */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-b from-[#FFD700]/6 to-transparent rounded-full blur-3xl pointer-events-none z-0"></div>

                <div className="flex flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center shrink-0">
                            <span className="absolute inline-flex h-8 w-8 rounded-full bg-[#FFD700]/25 animate-ping opacity-75"></span>
                            <div className="bg-gradient-to-b from-[#3a3418] to-[#15140f] p-2.5 rounded-2xl border border-[#FFD700]/40 shadow-inner">
                                <span className="text-xl inline-block drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]">🔮</span>
                            </div>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-[#FFD700] text-sm md:text-base tracking-widest uppercase flex items-center gap-2">
                                御膳 AI 智控脑库
                                <span className="bg-gradient-to-r from-stone-700 to-stone-850 text-[#FFD700] text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm border border-[#FFD700]/30 font-mono">BETA</span>
                            </h3>
                            <p className="text-[10px] text-stone-400 font-semibold tracking-wide mt-1">
                                餐饮财务专职智脑 • 多维自动对账与日常经营智能稽查
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0">
                        <button
                            onClick={() => {
                                setAiOpen(true);
                            }}
                            style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                            className="bg-gradient-to-r from-[#FFD700] via-[#F5C73C] to-[#E5A93C] text-stone-950 font-black text-xs px-6 py-2.5 rounded-xl active:scale-95 hover:brightness-110 shadow-[0_5px_15px_rgba(255,215,0,0.25)] transition-all duration-200 flex items-center justify-center gap-2 select-none"
                        >
                            <span className="text-sm">🗣️</span>
                            立即唤醒语音提问
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 1. CORE MANAGEMENT ───────────────────── */}
            <div className="bg-[#F3F4F6] rounded-[1.5rem] md:rounded-[2.5rem] p-4 md:p-8 border border-gray-200/60 space-y-5 md:space-y-8">
                <div className="flex justify-between items-center px-1">
                    <h3 className="font-black text-[#8B0000] text-sm md:text-base flex items-center gap-2 uppercase tracking-widest">
                        <Crown size={18} className="fill-current" />
                        核心管理
                        <span className="hidden sm:inline">(Owner's Office)</span>
                    </h3>
                </div>

                {/* 通过遍历配置渲染区块与卡片 */}
                {DASHBOARD_SECTIONS.map((section, idx) => (
                    <SectionBlock key={idx} title={section.title} sub={section.sub}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                            {section.cards.map((card) => (
                                <DashboardCard 
                                    key={card.id}
                                    {...pickerProps} 
                                    id={card.id} 
                                    title={card.title} 
                                    sub={card.sub} 
                                    icon={card.icon} 
                                    colorClass={card.colorClass} 
                                    iconColor={card.iconColor} 
                                    onClick={() => handleCardClick(card)} 
                                    alertCount={card.alertKey ? alerts[card.alertKey] : 0}
                                    alertColor={card.alertColor}
                                />
                            ))}
                        </div>
                    </SectionBlock>
                ))}
            </div>

            {/* ── 2. DAILY OPERATIONS ──────────────────── */}
            <div className="bg-[#F3F4F6] rounded-[1.5rem] md:rounded-[2.5rem] p-4 md:p-8 border border-gray-200/60">
                <h3 className="font-black text-gray-500 text-sm mb-4 md:mb-6 flex items-center gap-2 uppercase tracking-widest px-1">
                    <Box size={18} />日常运营<span className="hidden sm:inline">(Store Operations)</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                    {DAILY_OPS_CARDS.map((card) => (
                        <DashboardCard 
                            key={card.id}
                            {...pickerProps} 
                            id={card.id} 
                            title={card.title} 
                            sub={card.sub} 
                            icon={card.icon} 
                            colorClass={card.colorClass} 
                            iconColor={card.iconColor} 
                            onClick={() => handleCardClick(card)} 
                            alertCount={card.alertKey ? alerts[card.alertKey] : 0}
                            alertColor={card.alertColor}
                        />
                    ))}
                </div>
            </div>

            {/* ── MODALS ────────────────────────────────── */}
            {renderModal()}

            {/* ── AI OPERATIONS WORKFLOW DRAWER ── */}
            <AIOperationsAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />
        </div>
    );
};