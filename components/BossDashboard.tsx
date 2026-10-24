import { isRetiredModule } from '../utils/retiredModules';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Users, Banknote, Coffee, Truck, CheckSquare, PenTool, BookOpen, CalendarOff, 
    ClipboardCheck, ShoppingBag, Layout, Eye, FileBarChart, Clock, CreditCard, Wallet, ShieldCheck,
    ShoppingCart, Megaphone, Target, PartyPopper, Vote, TrendingUp, Languages, X,
    FileText, Calculator, Star, Search, Lock, Gauge, ListChecks, Sparkles, ArrowLeft, FlaskConical
} from 'lucide-react';
import { Employee } from '../types';
import { DataManager } from '../utils/dataManager';
import { needsReplenishment } from '../utils/unitConversion';
import {
    MODULE_CATEGORIES,
    getModuleNavigationRule,
    sortNavigationItems,
} from '../constants/moduleNavigation';
import { canUseBossTarget } from '../utils/bossPortalAccess';
import { canOpenDataTools } from './features/system/DataToolsHub';
import { isReadOnlyMode } from '../utils/readOnlyMode';
import { HRSystem, MenuManagement, RecurringBillsModule, OrgChart, FinancialReport, LabourProfitDashboard, BossCockpit, PnLReconciliation, ExpenseAudit, DataToolsHub, AttendanceConsole, AccountsPayableModule, TreasuryModule, WarrantyModule, EventsPlanningModule, PriceMonitorModule, EmployeeAssessmentModule, TranslationManager, SelfInvoiceModule, DailyBusinessReportModal, AIOperationsAssistant } from './lazyModules';
import { canManageStockCodes } from '../utils/inventory/stockCodeAccess';
import { isHygieneHr } from '../utils/points/hygieneAccess';
import { getOrgLevel } from '../utils/orgAccess';
import { HygieneBoard } from './points/HygieneBoard';
import { OPEN_TEST_SWITCHER_EVENT } from './dev/TestSwitcher';

// Cache configurations
const ALERTS_CACHE_KEY = 'boss_dashboard_alerts_cache';
const ALERTS_CACHE_TTL = 5 * 60 * 1000; // 5 mins cache

type ActiveModal = 'NONE' | 'HR' | 'MENU' | 'BILLS' | 'ORG' | 'REPORTS' | 'LABOUR_PROFIT' | 'BOSS_COCKPIT' | 'PNL_RECON' | 'EXPENSE_AUDIT' | 'DATA_TOOLS' | 'ATTENDANCE' | 'AP' | 'TREASURY' | 'WARRANTY' | 'PLANNING' | 'PRICE_MONITOR' | 'ASSESSMENT' | 'TRANSLATION' | 'SELF_INVOICE' | 'DAILY_REPORT' | 'HYGIENE';
type PlanningTab  = 'VOTE' | 'OKR' | 'CAMPAIGN' | 'EVENTS';

type CardConfig = {
    id: string; 
    title: string; 
    sub: string; 
    icon: React.ComponentType<{ size?: number; className?: string }>; 
    colorClass: string; 
    iconColor: string; 
    actionType: 'MODAL' | 'NAVIGATE' | 'PLANNING' | 'EVENT'; 
    target: string;
    alertKey?: 'bills' | 'stock' | 'logs' | 'absent'; 
    alertColor?: string;
};

const BOSS_CARDS: CardConfig[] = [
    { id: "daily_report", title: "经营日报", sub: "DAILY REPORT", icon: FileBarChart, colorClass: "bg-amber-50", iconColor: "text-amber-600", actionType: 'MODAL', target: 'DAILY_REPORT' },
    { id: "settlement", title: "每日结算", sub: "SETTLEMENT", icon: Calculator, colorClass: "bg-amber-50", iconColor: "text-amber-600", actionType: 'NAVIGATE', target: 'SETTLEMENT' },
    { id: "online_orders", title: "网站订单", sub: "ONLINE ORDERS", icon: ShoppingBag, colorClass: "bg-sky-50", iconColor: "text-sky-600", actionType: 'NAVIGATE', target: 'ONLINE_ORDERS' },
    // 排队叫号（QUEUE）已在 V2 停用
    { id: "logwrite", title: "运营日志", sub: "ADD LOG", icon: PenTool, colorClass: "bg-orange-50", iconColor: "text-orange-500", actionType: 'NAVIGATE', target: 'LOGBOOK' },
    { id: "logview", title: "日志查询", sub: "VIEW", icon: BookOpen, colorClass: "bg-emerald-50", iconColor: "text-emerald-500", actionType: 'NAVIGATE', target: 'LOGBOOK_VIEW', alertKey: 'logs', alertColor: 'bg-blue-500' },
    { id: "sop", title: "SOP 稽查", sub: "INSPECT", icon: ClipboardCheck, colorClass: "bg-violet-50", iconColor: "text-violet-500", actionType: 'NAVIGATE', target: 'SOP_INSPECT' },
    { id: "invcheck", title: "库存盘点", sub: "CHECK", icon: CheckSquare, colorClass: "bg-blue-50", iconColor: "text-blue-500", actionType: 'NAVIGATE', target: 'INVENTORY_CHECK' },
    { id: "stock", title: "库存总览", sub: "STOCK VALUE", icon: Eye, colorClass: "bg-purple-50", iconColor: "text-purple-600", actionType: 'NAVIGATE', target: 'INVENTORY_VIEW', alertKey: 'stock' },
    { id: "order", title: "采购订货", sub: "SMART ORDER", icon: ShoppingCart, colorClass: "bg-lime-50", iconColor: "text-lime-600", actionType: 'NAVIGATE', target: 'PROCUREMENT' },
    { id: "supplier", title: "供应商", sub: "PURCHASING", icon: Truck, colorClass: "bg-blue-50", iconColor: "text-blue-600", actionType: 'NAVIGATE', target: 'SUPPLIER_CONTACTS' },
    { id: "menu", title: "智能菜谱", sub: "SMART RECIPE", icon: Coffee, colorClass: "bg-amber-50", iconColor: "text-amber-600", actionType: 'MODAL', target: 'MENU' },
    { id: "price", title: "成本监控", sub: "PRICE MONITOR", icon: TrendingUp, colorClass: "bg-red-50", iconColor: "text-red-600", actionType: 'MODAL', target: 'PRICE_MONITOR' },
    { id: "ap", title: "应付账款", sub: "ACCOUNTS PAYABLE", icon: CreditCard, colorClass: "bg-rose-50", iconColor: "text-rose-600", actionType: 'MODAL', target: 'AP' },
    { id: "self_invoice", title: "自开凭单", sub: "VOUCHER MAKER", icon: FileText, colorClass: "bg-emerald-50", iconColor: "text-emerald-600", actionType: 'MODAL', target: 'SELF_INVOICE' },
    { id: "bills", title: "经常性支出", sub: "RECURRING EXPENSES", icon: Banknote, colorClass: "bg-orange-50", iconColor: "text-orange-600", actionType: 'MODAL', target: 'BILLS', alertKey: 'bills' },
    { id: "treasury", title: "资金管理", sub: "CASH & BANK", icon: Wallet, colorClass: "bg-emerald-50", iconColor: "text-emerald-600", actionType: 'MODAL', target: 'TREASURY' },
    { id: "reports", title: "财务报表", sub: "P&L REPORT", icon: FileBarChart, colorClass: "bg-green-50", iconColor: "text-green-600", actionType: 'MODAL', target: 'REPORTS' },
    { id: "boss_cockpit", title: "经营驾驶舱", sub: "BOSS COCKPIT", icon: Gauge, colorClass: "bg-stone-100", iconColor: "text-stone-800", actionType: 'MODAL', target: 'BOSS_COCKPIT' },
    { id: "labour_profit", title: "人工成本与盈利", sub: "LABOUR & PROFIT", icon: TrendingUp, colorClass: "bg-teal-50", iconColor: "text-teal-600", actionType: 'MODAL', target: 'LABOUR_PROFIT' },
    { id: "staff_cash", title: "兼职与预支", sub: "PART-TIME & ADVANCE", icon: Banknote, colorClass: "bg-emerald-50", iconColor: "text-emerald-700", actionType: 'NAVIGATE', target: 'STAFF_CASH' },
    { id: "hr", title: "人事管理", sub: "人员档案 / 薪资", icon: Users, colorClass: "bg-red-50", iconColor: "text-red-600", actionType: 'MODAL', target: 'HR' },
    { id: "attendance", title: "考勤管理", sub: "Attendance Control", icon: Clock, colorClass: "bg-indigo-50", iconColor: "text-indigo-600", actionType: 'MODAL', target: 'ATTENDANCE' },
    // 个人卫生：HR（L2 / L2S）评全部员工；老板本人不显示（负责人 2026-10-23）
    { id: "hygiene", title: "个人卫生", sub: "HYGIENE · 每周", icon: Sparkles, colorClass: "bg-sky-50", iconColor: "text-sky-600", actionType: 'MODAL', target: 'HYGIENE' },
    { id: "roster", title: "排班管理", sub: "ROSTER", icon: CalendarOff, colorClass: "bg-rose-50", iconColor: "text-rose-500", actionType: 'NAVIGATE', target: 'ROSTER', alertKey: 'absent', alertColor: 'bg-orange-500' },
    { id: "org", title: "组织结构", sub: "ORG STRUCTURE", icon: Layout, colorClass: "bg-teal-50", iconColor: "text-teal-600", actionType: 'MODAL', target: 'ORG' },
    { id: "vote", title: "决策投票", sub: "BOARDROOM VOTE", icon: Vote, colorClass: "bg-stone-100", iconColor: "text-stone-800", actionType: 'PLANNING', target: 'VOTE' },
    { id: "okr", title: "目标规划", sub: "OKRs & KPI", icon: Target, colorClass: "bg-indigo-50", iconColor: "text-indigo-600", actionType: 'PLANNING', target: 'OKR' },
    { id: "campaign", title: "营销推广", sub: "CAMPAIGNS (ROI)", icon: Megaphone, colorClass: "bg-pink-50", iconColor: "text-pink-600", actionType: 'PLANNING', target: 'CAMPAIGN' },
    { id: "events", title: "节日活动", sub: "EVENTS CALENDAR", icon: PartyPopper, colorClass: "bg-rose-50", iconColor: "text-rose-600", actionType: 'PLANNING', target: 'EVENTS' },
    // 盈亏对账、杂项费用审计、库存编号整理都集中在「数据审查中心」
    { id: "data_tools", title: "数据审查中心", sub: "AUDIT & DATA TOOLS", icon: ListChecks, colorClass: "bg-stone-100", iconColor: "text-stone-800", actionType: 'MODAL', target: 'DATA_TOOLS' },
    { id: "translation", title: "翻译管理", sub: "TRANSLATION", icon: Languages, colorClass: "bg-orange-50", iconColor: "text-orange-600", actionType: 'MODAL', target: 'TRANSLATION' },
    // 测试切换：只有老板本人看得到（负责人 2026-10-24：从画面右边的浮动按钮移到这里）
    { id: "test_switch", title: "测试切换", sub: "TEST AS STAFF", icon: FlaskConical, colorClass: "bg-orange-50", iconColor: "text-orange-500", actionType: 'EVENT', target: 'TEST_SWITCH' },
    { id: "warranty", title: "保修记录", sub: "WARRANTY", icon: ShieldCheck, colorClass: "bg-cyan-50", iconColor: "text-cyan-600", actionType: 'MODAL', target: 'WARRANTY' },
];

const BOSS_DASHBOARD_SECTIONS = MODULE_CATEGORIES.map(category => ({
    title: category.title,
    sub: category.subtitle,
    cards: sortNavigationItems(
        BOSS_CARDS.filter(card => getModuleNavigationRule(card.target).category === category.id),
        card => card.target,
    ),
})).filter(section => section.cards.length > 0);

// Custom Hook for Alerts
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
                    Promise.all([
                        DataManager.getStock('KITCHEN'),
                        DataManager.getStock('BAR'),
                        DataManager.getStock('GENERAL'),
                        DataManager.getStock('FUEL')
                    ]),
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
                    next.stock = all.filter(needsReplenishment).length;
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

interface DashboardCardProps {
    card: CardConfig;
    isFavorite: boolean;
    isEditingFavorites: boolean;
    alertCount: number;
    onCardClick: (card: CardConfig) => void;
    onToggleFavorite: (id: string) => void;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
    card,
    isFavorite,
    isEditingFavorites,
    alertCount,
    onCardClick,
    onToggleFavorite
}) => {
    const Icon = card.icon;
    const alertBg = card.alertColor || 'bg-rose-500';

    return (
        <div className="relative group select-none">
            {/* Card Main Button */}
            <button
                onClick={() => onCardClick(card)}
                className={`w-full bg-white border ${
                    isEditingFavorites ? 'border-amber-400/80 ring-2 ring-amber-400/10 shadow-[0_4px_12px_rgba(255,210,0,0.1)]' : 'border-stone-200/60 hover:border-stone-300'
                } rounded-2xl p-4 flex flex-col justify-between text-left shadow-sm active:scale-95 active:shadow-none transition-all duration-150 outline-none min-h-[114px] md:min-h-[124px] relative`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
            >
                {/* Icon Wrapper with subtle colored background */}
                <div className={`w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center relative ${card.colorClass}`}>
                    <Icon size={18} className={`${card.iconColor}`} />
                    
                    {/* Badge */}
                    {alertCount > 0 && (
                        <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 ${alertBg} text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white shadow-sm animate-pulse z-10`}>
                            {alertCount}
                        </span>
                    )}
                </div>

                {/* Information */}
                <div className="mt-3">
                    <h4 className="font-extrabold text-[#111111] text-xs md:text-sm mb-0.5 leading-tight truncate">
                        {card.title}
                    </h4>
                    <p className="text-[9px] md:text-[10px] text-stone-400 font-bold uppercase tracking-wider leading-tight truncate">
                        {card.sub}
                    </p>
                </div>
            </button>

            {/* Favorite Star Icon Button (Min 44x44px Touch Target) */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(card.id);
                }}
                className="absolute -top-1 -right-1 w-11 h-11 flex items-center justify-center text-stone-300 hover:text-amber-500 active:scale-90 transition-all z-20 outline-none"
                style={{ width: '44px', height: '44px' }}
                title={isFavorite ? '取消常用' : '加入常用'}
            >
                <Star 
                    size={16} 
                    className={`${
                        isFavorite 
                            ? 'fill-amber-400 text-amber-500 filter drop-shadow-[0_1px_3px_rgba(245,158,11,0.2)]' 
                            : 'text-stone-300 group-hover:text-stone-400'
                    } transition-all`} 
                />
            </button>
        </div>
    );
};

export const BossDashboard: React.FC<{ 
    currentEmployee: Employee; 
    onNavigate: (tab: string) => void; 
    onOpenConfig?: () => void 
    /** 通知铃铛：放在页面右上方的工具列里，跟着页面走（不再固定浮在画面上；负责人 2026-10-24） */
    notifications?: React.ReactNode
}> = ({ currentEmployee, onNavigate, onOpenConfig, notifications }) => {
    const { alerts } = useDashboardAlerts();
    const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');
    const [planningTab, setPlanningTab] = useState<PlanningTab>('VOTE');
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditingFavorites, setIsEditingFavorites] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);

    // Load Favorites from LocalStorage
    const [favorites, setFavorites] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem('boss_favorites');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    // Load Recently Used from LocalStorage
    const [recent, setRecent] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem('boss_recent_used');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    // Notify parent App.tsx when activeModal changes (hiding bottom navigation)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).bossActiveModal = activeModal;
            window.dispatchEvent(new Event('boss-modal-change'));
        }
    }, [activeModal]);

    // Global synchronizer listener
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

    // 🔐 权限闸门：L1 老板看全部；L2 等被指派进老板界面的人只看已勾选模块
    const canUseCard = useCallback(
        (card: CardConfig) => isRetiredModule(card.target) ? false : card.target === 'TEST_SWITCH'
            ? getOrgLevel(currentEmployee) === 'OWNER'
            : card.target === 'HYGIENE'
            ? isHygieneHr(currentEmployee) && getOrgLevel(currentEmployee) !== 'OWNER'
            : card.target === 'DATA_TOOLS'
            ? canOpenDataTools(currentEmployee) // 里面任何一个工具能用就显示入口（系统管理员可只用库存编号整理）
            : canUseBossTarget(currentEmployee, card.target),
        [currentEmployee],
    );

    // Flatten all cards list (已过滤权限)
    const allCards = useMemo(() => {
        return BOSS_CARDS.filter(canUseCard);
    }, [canUseCard]);

    // Filter cards by Search Query (已过滤权限)
    const filteredSections = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        return BOSS_DASHBOARD_SECTIONS.map(section => {
            const filteredCards = section.cards
                .filter(canUseCard)
                .filter(card =>
                    !q ||
                    card.title.toLowerCase().includes(q) ||
                    card.sub.toLowerCase().includes(q)
                );
            return {
                ...section,
                cards: filteredCards
            };
        }).filter(section => section.cards.length > 0);
    }, [searchQuery, canUseCard]);

    // Favorites cards configurations
    const favoriteCards = useMemo(() => {
        return favorites
            .map(id => allCards.find(c => c.id === id))
            .filter((c): c is CardConfig => !!c);
    }, [favorites, allCards]);

    // Recently used configurations (Filtered to valid existings, max 4)
    const recentCards = useMemo(() => {
        return recent
            .filter(id => allCards.some(c => c.id === id))
            .slice(0, 4)
            .map(id => allCards.find(c => c.id === id))
            .filter((c): c is CardConfig => !!c);
    }, [recent, allCards]);

    // Handle Card Click - Updates Recently Used storage as well
    const handleCardClick = useCallback((card: CardConfig) => {
        // 🔐 防御：即使从收藏／最近使用点进来，也要有权限
        if (!canUseCard(card)) {
            alert('你没有此功能的权限，请联系老板开通。');
            return;
        }

        setRecent(prev => {
            const filtered = prev.filter(id => id !== card.id);
            const next = [card.id, ...filtered].slice(0, 4);
            try {
                localStorage.setItem('boss_recent_used', JSON.stringify(next));
            } catch (e) {
                console.error(e);
            }
            return next;
        });

        if (card.actionType === 'MODAL') {
            setActiveModal(card.target as ActiveModal);
        } else if (card.actionType === 'NAVIGATE') {
            onNavigate(card.target);
        } else if (card.actionType === 'EVENT') {
            if (card.target === 'TEST_SWITCH') window.dispatchEvent(new Event(OPEN_TEST_SWITCHER_EVENT));
        } else if (card.actionType === 'PLANNING') {
            setPlanningTab(card.target as PlanningTab);
            setActiveModal('PLANNING');
        }
    }, [onNavigate, canUseCard]);

    // Toggle Favorites Action
    const toggleFavorite = useCallback((cardId: string) => {
        setFavorites(prev => {
            const next = prev.includes(cardId) 
                ? prev.filter(id => id !== cardId)
                : [...prev, cardId];
            try {
                localStorage.setItem('boss_favorites', JSON.stringify(next));
            } catch (e) {
                console.error(e);
            }
            return next;
        });
    }, []);

    const renderModal = () => {
        const close = () => setActiveModal('NONE');
        const modalMap: Record<string, React.ReactElement> = {
            'HR': <HRSystem onClose={close} currentEmployee={currentEmployee} />,
            'MENU': <MenuManagement onClose={close} />,
            'BILLS': <RecurringBillsModule onClose={close} />,
            'ORG': <OrgChart onClose={close} />,
            'REPORTS': <FinancialReport onClose={close} />,
            'LABOUR_PROFIT': <LabourProfitDashboard onClose={close} />,
            'BOSS_COCKPIT': <BossCockpit onClose={close} />,
            'PNL_RECON': <PnLReconciliation onClose={close} />,
            'EXPENSE_AUDIT': <ExpenseAudit onClose={close} />,
            'DATA_TOOLS': <DataToolsHub onClose={close} currentEmployee={currentEmployee} />,
            'ATTENDANCE': <AttendanceConsole onClose={close} currentEmployee={currentEmployee} />,
            'AP': <AccountsPayableModule onClose={close} canFreeze={canManageStockCodes(currentEmployee, !currentEmployee)} onNavigateToSelfVoucher={(prefill) => {
                localStorage.setItem('klk_prefill_self_invoice', JSON.stringify(prefill));
                setActiveModal('SELF_INVOICE');
            }} />,
            'TREASURY': <TreasuryModule onClose={close} />,
            'WARRANTY': <WarrantyModule onClose={close} />,
            'PLANNING': <EventsPlanningModule onClose={close} currentEmployee={currentEmployee} defaultTab={planningTab} />,
            'PRICE_MONITOR': <PriceMonitorModule onClose={close} />,
            'ASSESSMENT': <EmployeeAssessmentModule onClose={close} currentEmployee={currentEmployee} />,
            'TRANSLATION': <TranslationManager onClose={close} />,
            'SELF_INVOICE': <SelfInvoiceModule onClose={close} />,
            'HYGIENE': (
                <div className="fixed inset-0 z-[120] bg-[#F6F7FB] overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 flex items-center gap-3">
                        <button onClick={close} className="w-10 h-10 rounded-full bg-stone-100 grid place-items-center" aria-label="返回"><ArrowLeft size={18} /></button>
                        <b className="text-base font-black">个人卫生（每周）</b>
                    </div>
                    <div className="max-w-2xl mx-auto p-4 pb-24"><HygieneBoard actor={currentEmployee} /></div>
                </div>
            ),
            'DAILY_REPORT': (
                <DailyBusinessReportModal
                    isOpen={activeModal === 'DAILY_REPORT'}
                    onClose={close}
                    settlements={[]}
                    onNavigateToSettlement={(date) => {
                        close();
                        onNavigate('SETTLEMENT');
                    }}
                    onNavigateToReports={() => {
                        close();
                        setActiveModal('REPORTS');
                    }}
                />
            )
        };
        return activeModal !== 'NONE' ? modalMap[activeModal] : null;
    };

    return (
        <div className="w-full min-h-screen bg-[#F6F7FB] px-4 md:px-8 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-12" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
            <div className="max-w-7xl mx-auto space-y-6">

                {/* 🔒 只读模式提示条 */}
                {isReadOnlyMode() && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
                        <Lock size={16} className="text-amber-600 shrink-0" strokeWidth={2.5} />
                        <p className="text-xs font-bold text-amber-800 leading-relaxed">
                            只读模式 (Read-only) — 你可以查看资料，但无法新增、修改或删除。
                        </p>
                    </div>
                )}

                {/* 1. TOP HEADER & SEARCH TOOLS */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b border-stone-200/50">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h2 className="font-extrabold text-stone-950 text-xl md:text-2xl font-sans tracking-tight">全部功能</h2>
                            <span className="bg-stone-200 text-stone-700 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">ALL MODULES</span>
                        </div>
                        <span className="text-xs text-stone-400 font-bold uppercase tracking-widest mt-0.5">Business Tools Dashboard</span>
                    </div>

                    {/* Search & Actions Bar */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索功能 (例：结算、库存...)"
                                className="w-full pl-10 pr-4 py-2.5 rounded-full text-xs font-bold text-stone-900 bg-white border border-stone-200 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-sm"
                                style={{ minHeight: '44px' }}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 active:scale-90 transition-all outline-none"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Edit Favorites Button */}
                        <button
                            onClick={() => setIsEditingFavorites(!isEditingFavorites)}
                            className={`px-4 py-2.5 rounded-full text-xs font-black tracking-wider transition-all outline-none border flex items-center justify-center gap-1.5 shrink-0 ${
                                isEditingFavorites 
                                    ? 'bg-[#FFD200] text-stone-950 border-[#FFD200] shadow-sm' 
                                    : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                            }`}
                            style={{ minHeight: '44px' }}
                        >
                            <Star size={14} className={isEditingFavorites ? 'fill-stone-950' : ''} />
                            <span>{isEditingFavorites ? '完成编辑' : '编辑常用'}</span>
                        </button>
                        {notifications && <div className="shrink-0">{notifications}</div>}
                    </div>
                </div>

                {/* 2. MY FAVORITES (我的常用) */}
                {favoriteCards.length > 0 && (
                    <div className="bg-white rounded-3xl p-5 border border-amber-300/40 shadow-sm space-y-4 relative overflow-hidden bg-gradient-to-br from-white to-amber-50/5">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD200]/5 rounded-full blur-2xl pointer-events-none"></div>
                        <div className="flex justify-between items-center pb-2 border-b border-stone-100">
                            <h3 className="font-black text-amber-600 text-xs md:text-sm flex items-center gap-1.5 uppercase tracking-widest">
                                <Star size={16} className="fill-amber-400 text-amber-500" />
                                我的常用功能
                                <span className="text-[10px] text-stone-400 font-bold tracking-normal normal-case">({favoriteCards.length})</span>
                            </h3>
                        </div>
 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                            {favoriteCards.map(card => (
                                <DashboardCard
                                    key={`fav-${card.id}`}
                                    card={card}
                                    isFavorite={true}
                                    isEditingFavorites={isEditingFavorites}
                                    alertCount={card.alertKey ? alerts[card.alertKey] : 0}
                                    onCardClick={handleCardClick}
                                    onToggleFavorite={toggleFavorite}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State when editing but no favorites selected yet */}
                {favoriteCards.length === 0 && isEditingFavorites && (
                    <div className="bg-stone-100/50 border-2 border-dashed border-stone-200 rounded-3xl p-6 text-center text-stone-500">
                        <Star size={24} className="text-stone-300 mx-auto mb-2" />
                        <p className="text-xs font-bold">暂无常用功能</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">点击下方任何功能卡片上的星标，即可固定在顶部常用栏中。</p>
                    </div>
                )}

                {/* 3. RECENTLY USED (最近使用) */}
                {recentCards.length > 0 && (
                    <div className="bg-white rounded-2xl p-4 border border-stone-200/50 shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="font-black text-stone-600 text-xs md:text-sm flex items-center gap-1.5 uppercase tracking-widest">
                                <Clock size={16} />
                                最近使用
                            </h3>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {recentCards.map(card => {
                                const Icon = card.icon;
                                return (
                                    <button
                                        key={`rec-${card.id}`}
                                        onClick={() => handleCardClick(card)}
                                        className="min-w-[155px] md:min-w-[175px] min-h-[58px] rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2.5 flex items-center gap-3 text-left active:scale-[0.98] transition-all"
                                    >
                                        <span className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${card.colorClass}`}>
                                            <Icon size={16} className={card.iconColor} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-xs font-black text-stone-900 truncate">{card.title}</span>
                                            <span className="block text-[9px] font-bold text-stone-400 uppercase truncate mt-0.5">{card.sub}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 4. ALL CATEGORIZED FUNCTIONS */}
                {filteredSections.map((section, idx) => (
                    <div key={idx} className="bg-white rounded-3xl p-5 border border-stone-200/50 shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-stone-100">
                            <h3 className="font-black text-stone-900 text-xs md:text-sm flex items-center gap-1.5 uppercase tracking-widest">
                                <span className="text-[#FFD200] font-black">■</span>
                                {section.title}
                                <span className="text-[10px] text-stone-400 font-bold tracking-normal normal-case"> · {section.sub}</span>
                            </h3>
                        </div>
 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                            {section.cards.map((card) => (
                                <DashboardCard 
                                    key={card.id}
                                    card={card}
                                    isFavorite={favorites.includes(card.id)}
                                    isEditingFavorites={isEditingFavorites}
                                    alertCount={card.alertKey ? alerts[card.alertKey] : 0}
                                    onCardClick={handleCardClick}
                                    onToggleFavorite={toggleFavorite}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {/* NO RESULTS VIEW */}
                {filteredSections.length === 0 && (
                    <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center text-stone-500 shadow-sm">
                        <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center text-stone-400 mx-auto mb-3">
                            <Search size={20} />
                        </div>
                        <p className="text-sm font-extrabold text-stone-900">未找到相关功能</p>
                        <p className="text-xs text-stone-400 mt-1">没有找到匹配 "{searchQuery}" 的功能</p>
                    </div>
                )}

            </div>

            {/* Modals rendering area */}
            {renderModal()}

            {/* AI Assistant dialog */}
            <AIOperationsAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />
        </div>
    );
};
