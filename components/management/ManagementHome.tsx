import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Users, Crown, CheckSquare, BookOpen, AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, Sparkles, Languages
} from 'lucide-react';
import { Employee, AppModule, OrgLevel, normalizeLanguage } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getOrgLevel } from '../../utils/orgAccess';
import { getBusinessDateString } from '../../utils/dateHelper';
import { mt, ManagementLang } from '../../constants/managementTranslations';
import { needsReplenishment } from '../../utils/unitConversion';
import { sortNavigationItems } from '../../constants/moduleNavigation';

export const getDepartmentName = (dept?: string, lang: ManagementLang = 'zh_en'): string => {
    const d = (dept || '').toUpperCase().trim();
    if (lang === 'my') {
        switch (d) {
            case 'KITCHEN':
            case 'BOH':
                return 'မီးဖိုချောင် ဌာန (BOH)';
            case 'FLOOR':
            case 'FOH':
                return 'စားသောက်ဆိုင် ရှေ့တန်းဌာန (FOH)';
            case 'BAR':
                return 'ဘား ဌာန (BAR)';
            case 'HR':
                return 'လူ့စွမ်းအား အရင်းအမြစ် ဌာန (HR)';
            default:
                return 'စီမံခန့်ခွဲရေး (GENERAL)';
        }
    }
    if (lang === 'en') {
        switch (d) {
            case 'KITCHEN':
            case 'BOH':
                return 'Kitchen Department (BOH)';
            case 'FLOOR':
            case 'FOH':
                return 'Floor Department (FOH)';
            case 'BAR':
                return 'Bar Department (BAR)';
            case 'HR':
                return 'Human Resources (HR)';
            default:
                return 'General Management';
        }
    }
    switch (d) {
        case 'KITCHEN':
        case 'BOH':
            return '厨房部 (BOH)';
        case 'FLOOR':
        case 'FOH':
            return '楼面部 (FOH)';
        case 'BAR':
            return '水吧部 (BAR)';
        case 'HR':
            return '人事部 (HR)';
        default:
            return '综合后勤 (GENERAL)';
    }
};

const ORG_LEVEL_LABELS: Record<OrgLevel, Record<'zh_en' | 'en' | 'my', string>> = {
    OWNER: {
        zh_en: 'L1 老板',
        en: 'L1 Owner',
        my: 'L1 လုပ်ငန်းရှင်'
    },
    BRANCH_MANAGER: {
        zh_en: 'L2 店面管理',
        en: 'L2 Branch Manager',
        my: 'L2 ဆိုင်ခွဲမန်နေဂျာ'
    },
    DEPARTMENT_HEAD: {
        zh_en: 'L3 部门负责人',
        en: 'L3 Department Head',
        my: 'L3 ဌာနအကြီးအကဲ'
    },
    TEAM_LEAD: {
        zh_en: 'L4 组长／PIC',
        en: 'L4 Team Lead / PIC',
        my: 'L4 အဖွဲ့ခေါင်းဆောင် / PIC'
    },
    CREW: {
        zh_en: 'L5 员工',
        en: 'L5 Crew',
        my: 'L5 ဝန်ထမ်း'
    }
};

export const getOrgLevelDisplayName = (
    level: OrgLevel,
    lang: ManagementLang = 'zh_en'
): string => ORG_LEVEL_LABELS[level][normalizeLanguage(lang)];

interface ManagementHomeProps {
    employee: Employee;
    onNavigateToModule: (tabKey: string) => void;
    onSwitchTab: (tabIndex: number) => void;
    lang: ManagementLang;
    onLanguageChange: (newLang: ManagementLang) => void;
}

export const ManagementHome: React.FC<ManagementHomeProps> = ({ employee, onNavigateToModule, onSwitchTab, lang, onLanguageChange }) => {
    const [stats, setStats] = useState({
        lowStock: 0,
        absences: 0,
        pendingTasks: 0,
        todayLogs: 0
    });
    const [loading, setLoading] = useState(true);
    const [teamAbsences, setTeamAbsences] = useState<Array<{ name: string; role: string; type: string }>>([]);

    // Caching/fetching optimized for mobile data networks
    useEffect(() => {
        let isMounted = true;
        const loadStatsAndTeam = async () => {
            setLoading(true);
            try {
                const dateStr = getBusinessDateString();
                const orgLevel = getOrgLevel(employee);
                const isL3 = orgLevel === 'DEPARTMENT_HEAD';
                const managerDept = (employee.department || 'GENERAL').toUpperCase().trim();

                // L2 can see all stock. L3 only loads stock collections relevant
                // to their department instead of downloading all four collections.
                let stockTypes: Array<'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL'> = [
                    'KITCHEN',
                    'BAR',
                    'GENERAL',
                    'FUEL'
                ];
                if (isL3) {
                    if (managerDept === 'KITCHEN' || managerDept === 'BOH') {
                        stockTypes = ['KITCHEN'];
                    } else if (managerDept === 'BAR') {
                        stockTypes = ['BAR'];
                    } else if (managerDept === 'FLOOR' || managerDept === 'FOH') {
                        stockTypes = [];
                    } else {
                        stockTypes = ['GENERAL', 'FUEL'];
                    }
                }

                const [
                    stockGroups,
                    rosterData,
                    todayLogsCount,
                    pendingTaskResult
                ] = await Promise.all([
                    Promise.all(
                        stockTypes.map(type => DataManager.getStock(type).catch(() => []))
                    ),
                    DataManager.getRosterData().catch(() => ({ roster: {}, notes: {} })),
                    DataManager.getOperationalLogCountByDate(dateStr).catch(() => 0),
                    isL3
                        ? DataManager.getPendingInventoryTasks().catch(() => [])
                        : DataManager.getPendingInventoryTaskCount().catch(() => 0)
                ]);

                if (!isMounted) return;

                // 1. Calculate Low Stock Items with the existing replenishment algorithm.
                const allStock = stockGroups.flat();

                const lowItemsCount = allStock.filter(needsReplenishment).length;

                // 2. Identify only today's exception employees and task assignees.
                // Employee profiles are fetched by document id instead of loading
                // the complete employee collection.
                const todayRoster = rosterData.roster?.[dateStr] || {};
                const absenceEntries = Object.entries(todayRoster).filter(([, status]) =>
                    status === 'MC' || status === 'ABSENT' || status === 'LEAVE'
                );
                const pendingTasks = Array.isArray(pendingTaskResult)
                    ? pendingTaskResult
                    : [];
                const requiredEmployeeIds = [
                    ...absenceEntries.map(([empId]) => empId),
                    ...(isL3 ? pendingTasks.map(task => task.assigneeId) : [])
                ];
                const relevantEmployees: Employee[] = await DataManager.getEmployeesByIds(requiredEmployeeIds)
                    .catch(() => []);

                if (!isMounted) return;

                const employeesById = new Map<string, Employee>(
                    relevantEmployees.map(emp => [emp.id, emp] as const)
                );
                const absentList: Array<{ name: string; role: string; type: string }> = [];
                let absenceCount = 0;

                absenceEntries.forEach(([empId, status]) => {
                    const emp = employeesById.get(empId);
                    if (emp) {
                        // Filter absences for L3 (DEPARTMENT_HEAD) - only show members in their department
                        if (isL3) {
                            const empDept = (emp.department || '').toUpperCase().trim();
                            if (empDept !== managerDept) {
                                return; // Skip if different department
                            }
                        }

                        absenceCount++;
                        absentList.push({
                            name: emp.name,
                            role: emp.role?.split('(')[0] || '员工',
                            type: status === 'MC' ? '病假 (MC)' : status === 'LEAVE' ? '事假 (UL)' : '旷工 (ABS)'
                        });
                    }
                });

                // 3. Pending Inventory Tasks with L2 / L3 isolation
                const pendingTasksCount = isL3
                    ? pendingTasks.filter(task => {
                        const assignee = employeesById.get(task.assigneeId);
                        if (!assignee) return false;
                        const assigneeDept = (assignee.department || '').toUpperCase().trim();
                        return assigneeDept === managerDept;
                    }).length
                    : typeof pendingTaskResult === 'number'
                        ? pendingTaskResult
                        : pendingTasks.length;

                setStats({
                    lowStock: lowItemsCount,
                    absences: absenceCount,
                    pendingTasks: pendingTasksCount,
                    todayLogs: todayLogsCount
                });
                setTeamAbsences(absentList);
            } catch (err) {
                console.error('[ManagementHome] Error loading workspace statistics:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadStatsAndTeam();
        return () => { isMounted = false; };
    }, [employee]);

    // Filter available modules for shortcuts based on employee permission list
    const allowedModules = useMemo(() => {
        return employee.allowedModules || [];
    }, [employee]);

    const [isEditingShortcuts, setIsEditingShortcuts] = useState(false);
    const [customShortcutKeys, setCustomShortcutKeys] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(`kepong_erp_custom_shortcuts_${employee.id}`);
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.error(e);
        }
        return [];
    });

    const allPossibleShortcuts = useMemo(() => {
        const list: Array<{ module: AppModule; label: string; icon: string; bg: string; text: string }> = [];
        
        if (allowedModules.includes('SETTLEMENT')) {
            list.push({ module: 'SETTLEMENT', label: mt('module_settlement', lang), icon: '💰', bg: 'bg-emerald-50 border-emerald-200/80', text: 'text-emerald-600 font-extrabold' });
        }
        if (allowedModules.includes('ROSTER') || allowedModules.includes('ROSTER_KITCHEN') || allowedModules.includes('ROSTER_FLOOR')) {
            list.push({ module: 'ROSTER', label: mt('module_roster', lang), icon: '📅', bg: 'bg-sky-50 border-sky-200/80', text: 'text-sky-600 font-extrabold' });
        }
        if (allowedModules.includes('ATTENDANCE_CONSOLE')) {
            list.push({ module: 'ATTENDANCE_CONSOLE', label: mt('module_attendance_console', lang), icon: '⏱️', bg: 'bg-indigo-50 border-indigo-200/80', text: 'text-indigo-700 font-extrabold' });
        }
        if (allowedModules.includes('LOGBOOK')) {
            list.push({ module: 'LOGBOOK', label: mt('module_logbook_view', lang), icon: '📝', bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-600 font-extrabold' });
        }
        if (allowedModules.includes('SOP_INSPECT')) {
            list.push({ module: 'SOP_INSPECT', label: mt('module_sop_inspect', lang), icon: '✅', bg: 'bg-teal-50 border-teal-200/80', text: 'text-teal-600 font-extrabold' });
        }
        if (allowedModules.some(m => m.startsWith('INVENTORY'))) {
            list.push({ module: 'INVENTORY_CHECK' as AppModule, label: mt('module_inventory_check', lang), icon: '📦', bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-600 font-extrabold' });
        }
        if (allowedModules.includes('PROCUREMENT')) {
            list.push({ module: 'PROCUREMENT', label: mt('module_procurement', lang), icon: '🛒', bg: 'bg-purple-50 border-purple-200/80', text: 'text-purple-600 font-extrabold' });
        }
        if (allowedModules.includes('ASSESSMENT')) {
            list.push({ module: 'ASSESSMENT', label: mt('module_assessment', lang), icon: '🎖️', bg: 'bg-cyan-50 border-cyan-200/80', text: 'text-cyan-600 font-extrabold' });
        }
        if (allowedModules.includes('AP')) {
            list.push({ module: 'AP', label: mt('module_ap', lang), icon: '💳', bg: 'bg-blue-50 border-blue-200/80', text: 'text-blue-600 font-extrabold' });
        }
        if (allowedModules.includes('SELF_INVOICE')) {
            list.push({ module: 'SELF_INVOICE', label: mt('module_self_invoice', lang), icon: '📄', bg: 'bg-violet-50 border-violet-200/80', text: 'text-violet-600 font-extrabold' });
        }
        if (allowedModules.includes('KITCHEN_ALERT')) {
            list.push({ module: 'KITCHEN_ALERT', label: lang === 'my' ? 'မီးဖိုချောင်သတိပေးချက်' : '通知厨房', icon: '🔔', bg: 'bg-red-50 border-red-200/80', text: 'text-red-600 font-extrabold' });
        }
        return sortNavigationItems(list, item => item.module);
    }, [allowedModules, lang]);

    const shortcuts = useMemo(() => {
        if (customShortcutKeys.length === 0) {
            return allPossibleShortcuts;
        }
        return allPossibleShortcuts.filter(item => customShortcutKeys.includes(item.module));
    }, [allPossibleShortcuts, customShortcutKeys]);

    return (
        <div className="flex flex-col min-h-screen bg-[#F6F7FB] text-stone-900 pb-32">
            {/* 1. Header with iOS Notch Safety & Identity Section */}
            <header className="pt-[calc(1.25rem+env(safe-area-inset-top))] pb-6 px-4 md:px-6 bg-white border-b border-stone-200/80 sticky top-0 z-30 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-lg text-stone-700 overflow-hidden shadow-sm shrink-0">
                            {employee.avatar ? (
                                <img src={employee.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                employee.name.charAt(0)
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                                <h1 className="text-lg font-black text-stone-900 tracking-wide shrink leading-tight truncate">{employee.name}</h1>
                                {getOrgLevel(employee) === 'DEPARTMENT_HEAD' ? (
                                    <div className="flex flex-col items-start gap-0.5 shrink-0">
                                        <span className="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider leading-none">
                                            L3
                                        </span>
                                        <span className="bg-amber-50 text-amber-700 text-[9px] px-1.5 py-0.5 rounded border border-amber-200 font-black uppercase tracking-wider leading-none">
                                            {mt('dept_head', lang)}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="bg-amber-500/10 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-black border border-amber-500/20 uppercase tracking-wider shrink-0 leading-none">
                                        {getOrgLevelDisplayName(getOrgLevel(employee), lang)}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1.5 font-semibold">
                                <Crown size={11} className="text-amber-500 shrink-0" />
                                <span className="truncate">{employee.role?.split('(')[0]}</span>
                                <span className="text-stone-300">•</span>
                                <span className="text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded text-[10px] font-bold truncate max-w-[120px]">
                                    {getDepartmentName(employee.department, lang)}
                                </span>
                            </p>
                        </div>
                    </div>
                    
                    {/* Notifications & Language Wrapper */}
                    <div className="flex items-center gap-2 shrink-0 mr-12">
                        {/* Languages switch button */}
                        <button 
                            onClick={() => onLanguageChange(lang === 'zh' ? 'my' : 'zh')}
                            className="h-10 px-3 rounded-full bg-stone-50 border border-stone-200 flex items-center gap-1.5 text-stone-700 font-black text-xs active:scale-95 transition-transform outline-none"
                            style={{ minWidth: '44px', minHeight: '44px' }}
                        >
                            <Languages size={15} className="text-[#650707]" />
                            <span>{lang === 'zh' ? '中文' : 'မြန်မာ'}</span>
                        </button>

                    </div>
                </div>
            </header>

            {/* 2. Scrollable Body Content */}
            <div className="flex-grow px-4 md:px-6 space-y-6 pt-4">
                
                {/* 2.1 Brand-Identity Operation Status Card (Linear/Wallet elegant light amber card) - Compact Size Reduced by 50% */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="bg-[#FFFDF0] border border-amber-200 rounded-xl p-3 shadow-xs relative overflow-hidden group"
                >
                    {/* Soft shimmering gold ambient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.03] to-transparent pointer-events-none" />
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-2">
                            <div>
                                <h3 className="text-[10px] font-black text-amber-800 tracking-[0.12em] uppercase">
                                    {getOrgLevel(employee) === 'DEPARTMENT_HEAD' ? (lang === 'my' ? 'ဌာန လုပ်ငန်းလည်ပတ်မှု အခြေအနေ' : '本部门营运状态') : mt('today_operations', lang)}
                                </h3>
                            </div>
                            <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                            </span>
                        </div>

                        {/* Stats Grid Matrix */}
                        <div className="grid grid-cols-4 gap-2">
                            
                            {/* Absent Count Block */}
                            <div className="bg-white border border-stone-200/50 rounded-lg p-2 flex flex-col justify-between shadow-xs min-h-[54px]">
                                <div className="flex items-center gap-1 text-stone-600">
                                    <Users size={11} className="text-amber-500 shrink-0" />
                                    <span className="text-[9px] font-bold truncate">{mt('absent_count', lang)}</span>
                                </div>
                                <div className="flex items-baseline gap-0.5 mt-1">
                                    <span className={`text-sm font-black font-mono ${stats.absences > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                                        {loading ? '--' : stats.absences}
                                    </span>
                                    <span className="text-[8px] text-stone-400 truncate">{lang === 'my' ? 'ဦး' : '人'}</span>
                                </div>
                            </div>

                            {/* Inventory Alert Block */}
                            <div className="bg-white border border-stone-200/50 rounded-lg p-2 flex flex-col justify-between shadow-xs min-h-[54px]">
                                <div className="flex items-center gap-1 text-stone-600">
                                    <AlertTriangle size={11} className="text-rose-500 shrink-0" />
                                    <span className="text-[9px] font-bold truncate">{mt('stock_shortage', lang)}</span>
                                </div>
                                <div className="flex items-baseline gap-0.5 mt-1">
                                    <span className={`text-sm font-black font-mono ${stats.lowStock > 0 ? 'text-rose-600' : 'text-stone-800'}`}>
                                        {loading ? '--' : stats.lowStock}
                                    </span>
                                    <span className="text-[8px] text-stone-400 truncate">{lang === 'my' ? 'မျိုး' : '类'}</span>
                                </div>
                            </div>

                            {/* Pending Tasks Block */}
                            <div className="bg-white border border-stone-200/50 rounded-lg p-2 flex flex-col justify-between shadow-xs min-h-[54px]">
                                <div className="flex items-center gap-1 text-stone-600">
                                    <CheckSquare size={11} className="text-amber-600 shrink-0" />
                                    <span className="text-[9px] font-bold truncate">{mt('pending_tasks_count', lang)}</span>
                                </div>
                                <div className="flex items-baseline gap-0.5 mt-1">
                                    <span className={`text-sm font-black font-mono ${stats.pendingTasks > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                                        {loading ? '--' : stats.pendingTasks}
                                    </span>
                                    <span className="text-[8px] text-stone-400 truncate">{lang === 'my' ? 'ခု' : '项'}</span>
                                </div>
                            </div>

                            {/* Today Logs Block */}
                            <div className="bg-white border border-stone-200/50 rounded-lg p-2 flex flex-col justify-between shadow-xs min-h-[54px]">
                                <div className="flex items-center gap-1 text-stone-600">
                                    <BookOpen size={11} className="text-sky-500 shrink-0" />
                                    <span className="text-[9px] font-bold truncate">{mt('add_log', lang)}</span>
                                </div>
                                <div className="flex items-baseline gap-0.5 mt-1">
                                    <span className="text-sm font-black font-mono text-sky-600">
                                        {loading ? '--' : stats.todayLogs}
                                    </span>
                                    <span className="text-[8px] text-stone-400 truncate">{lang === 'my' ? 'စောင်' : '篇'}</span>
                                </div>
                            </div>

                        </div>
                    </div>
                </motion.div>

                {/* 2.2 Shortcut Touch Targets (High touchability, large size for iOS Safari) */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-black text-stone-500 tracking-widest uppercase">{mt('quick_access', lang)}</h3>
                            <button
                                onClick={() => setIsEditingShortcuts(true)}
                                className="text-[10px] text-amber-700 hover:text-amber-800 font-extrabold flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 px-2.5 py-0.5 rounded-full transition-all active:scale-95 outline-none"
                                style={{ minHeight: '30px' }}
                            >
                                ⚙️ {lang === 'my' ? 'စိတ်ကြိုက်ပြင်ရန်' : '自定义'}
                            </button>
                        </div>
                        <span className="text-[9px] text-stone-400 font-mono">TOUCH CHANNELS</span>
                    </div>

                    {shortcuts.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {shortcuts.map(item => (
                                <button
                                    key={item.module}
                                    onClick={() => onNavigateToModule(item.module)}
                                    className={`h-[90px] rounded-xl border bg-white shadow-xs ${item.bg} flex flex-col items-center justify-center gap-2 active:scale-95 hover:bg-stone-50 transition-all outline-none`}
                                >
                                    <span className="text-2xl">{item.icon}</span>
                                    <span className={`text-xs font-black ${item.text}`}>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-stone-500 border border-dashed border-stone-300 rounded-xl bg-white text-xs font-bold shadow-xs">
                            {lang === 'my' ? '🔒 ရရှိနိုင်သော ဖြတ်လမ်းလင့်ခ် မရှိသေးပါ' : '🔒 暂无已选定的快捷模块，请点击“自定义”配置'}
                        </div>
                    )}
                </div>

                {/* Custom Shortcut Modal */}
                <AnimatePresence>
                    {isEditingShortcuts && (
                        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 50 }}
                                className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-stone-200 flex flex-col max-h-[85vh] pb-[env(safe-area-inset-bottom)] animate-none"
                            >
                                {/* Modal Header */}
                                <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                                    <div>
                                        <h3 className="font-extrabold text-stone-900 text-sm">
                                            {lang === 'my' ? 'ဖြတ်လမ်းများ စိတ်ကြိုက်ပြင်ဆင်ရန်' : '自定义快捷入口'}
                                        </h3>
                                        <p className="text-[10px] text-stone-500 mt-0.5">
                                            {lang === 'my' ? 'ပင်မစာမျက်နှာတွင် ဖော်ပြမည့် ဖြတ်လမ်းများကို ရွေးချယ်ပါ' : '勾选要在首页展示的快捷管理入口'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setIsEditingShortcuts(false)}
                                        className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200/60 flex items-center justify-center text-stone-500 font-bold text-xs hover:bg-stone-200 active:scale-95 transition-all outline-none"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Modal Content - List of Allowed Shortcuts */}
                                <div className="p-5 overflow-y-auto space-y-3 flex-grow">
                                    {allPossibleShortcuts.length === 0 ? (
                                        <p className="text-xs text-stone-500 text-center py-8">
                                            {lang === 'my' ? 'ရွေးချယ်စရာ မရှိပါ' : '无可选快捷模块'}
                                        </p>
                                    ) : (
                                        allPossibleShortcuts.map((item) => {
                                            const isChecked = customShortcutKeys.length === 0 
                                                ? true 
                                                : customShortcutKeys.includes(item.module);
                                            return (
                                                <button
                                                    key={item.module}
                                                    onClick={() => {
                                                        let nextKeys: string[];
                                                        const currentActiveKeys = customShortcutKeys.length === 0 
                                                            ? allPossibleShortcuts.map(s => s.module)
                                                            : customShortcutKeys;
                                                        
                                                        if (currentActiveKeys.includes(item.module)) {
                                                            nextKeys = currentActiveKeys.filter(k => k !== item.module);
                                                        } else {
                                                            nextKeys = [...currentActiveKeys, item.module];
                                                        }
                                                        setCustomShortcutKeys(nextKeys);
                                                    }}
                                                    className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-left transition-all outline-none active:scale-[0.99] ${
                                                        isChecked 
                                                            ? 'bg-[#FAF9F6] border-amber-300 shadow-xs font-bold' 
                                                            : 'bg-white border-stone-200 opacity-60'
                                                    }`}
                                                    style={{ minHeight: '48px' }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl shrink-0">{item.icon}</span>
                                                        <div>
                                                            <span className="text-xs font-black text-stone-900 block leading-tight">{item.label}</span>
                                                            <span className="text-[10px] text-stone-500 block mt-0.5 leading-none">
                                                                {item.module}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                                        isChecked 
                                                            ? 'bg-amber-500 border-amber-500 text-white' 
                                                            : 'border-stone-300'
                                                    }`}>
                                                        {isChecked && <span className="text-[10px] font-bold">✓</span>}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Modal Actions */}
                                <div className="p-4 border-t border-stone-100 flex gap-3 bg-stone-50">
                                    <button
                                        onClick={() => {
                                            setCustomShortcutKeys([]);
                                            localStorage.removeItem(`kepong_erp_custom_shortcuts_${employee.id}`);
                                            setIsEditingShortcuts(false);
                                        }}
                                        className="flex-1 h-11 border border-stone-200 bg-white rounded-xl text-stone-600 font-extrabold text-xs active:scale-95 transition-all outline-none"
                                        style={{ minHeight: '44px' }}
                                    >
                                        {lang === 'my' ? 'မူလအတိုင်းပြန်ထား' : '恢复默认'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            try {
                                                localStorage.setItem(`kepong_erp_custom_shortcuts_${employee.id}`, JSON.stringify(customShortcutKeys));
                                            } catch (e) {
                                                console.error(e);
                                            }
                                            setIsEditingShortcuts(false);
                                        }}
                                        className="flex-1 h-11 bg-amber-500 border border-amber-500 text-white rounded-xl font-extrabold text-xs active:scale-95 transition-all outline-none shadow-sm"
                                        style={{ minHeight: '44px' }}
                                    >
                                        {lang === 'my' ? 'သိမ်းဆည်းမည်' : '保存设置'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* 2.3 Team Attendance/Absence Real-time Exceptions */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                        <h3 className="text-xs font-black text-stone-500 tracking-widest uppercase">{mt('today_team_exceptions', lang)}</h3>
                        <span className="text-[9px] text-amber-600 font-mono font-bold cursor-pointer" onClick={() => onSwitchTab(1)}>
                            {lang === 'my' ? 'အလုပ်များကိုကြည့်ရန်' : '查看任务'}
                        </span>
                    </div>

                    {loading ? (
                        <div className="p-4 text-center text-stone-500 text-xs font-black">
                            <RefreshCw size={14} className="animate-spin inline mr-1" /> {lang === 'my' ? 'အချက်အလက် ဆွဲယူနေသည်...' : '正在加载团队实时考勤...'}
                        </div>
                    ) : teamAbsences.length > 0 ? (
                        <div className="space-y-2">
                            {teamAbsences.map((abs, idx) => (
                                <div 
                                    key={idx}
                                    className="p-3.5 rounded-xl border border-stone-200/80 bg-white flex items-center justify-between shadow-xs"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 text-sm font-bold">
                                            {abs.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-sm font-extrabold text-stone-900">{abs.name}</div>
                                            <div className="text-[10px] text-stone-500 mt-0.5">{abs.role}</div>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                        {lang === 'my' ? (abs.type.includes('MC') ? 'ဆေးခွင့် (MC)' : abs.type.includes('LEAVE') ? 'ကိစ္စခွင့် (UL)' : 'ခွင့်မဲ့ပျက်ကွက် (ABS)') : abs.type}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-5 border border-stone-200 bg-white rounded-xl flex items-center gap-3 shadow-xs">
                            <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                                <CheckCircle2 size={18} />
                            </div>
                            <div>
                                <div className="text-xs font-black text-emerald-700">{lang === 'my' ? 'အဖွဲ့သား လုပ်ငန်းပုံမှန်ဖြစ်သည်' : '团队运营正常'}</div>
                                <p className="text-[10px] text-stone-500 mt-0.5">
                                    {lang === 'my' ? 'ယနေ့ ဝန်ထမ်းများ ခွင့်ယူခြင်း၊ ပျက်ကွက်ခြင်း သို့မဟုတ် ဖျားနာခြင်း မရှိပါ။' : '今天没有发现任何员工请假、缺席或病假。'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2.4 Quick Copilot Recommendation Assistant */}
                {allowedModules.includes('AI_ASSISTANT') && (
                    <button 
                        onClick={() => onNavigateToModule('AI_ASSISTANT')}
                        className="w-full p-4 rounded-xl border border-stone-200 bg-white shadow-xs flex items-center justify-between active:scale-[0.98] transition-all outline-none"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                                <Sparkles size={18} className="animate-pulse" />
                            </div>
                            <div className="text-left">
                                <div className="text-xs font-black text-stone-900">
                                    {lang === 'my' ? 'AI စမတ် ထိန်းချုပ်ရေးစနစ် ဖွင့်ပါ' : '唤醒 AI 智控脑库'}
                                </div>
                                <p className="text-[10px] text-stone-500 mt-0.5">
                                    {lang === 'my' ? 'ဒေတာ စစ်ဆေးခြင်း၊ ငွေစာရင်း တွက်ချက်မှုနှင့် တက်ရောက်မှုများကို လုပ်ဆောင်ရန်' : '点查数据、分析结算账单、考勤异常一键审核'}
                                </p>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-stone-400" />
                    </button>
                )}

            </div>
        </div>
    );
};
