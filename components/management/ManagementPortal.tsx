import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    CheckCircle2, LogOut, ChevronRight, HelpCircle, ShieldCheck, Languages
} from 'lucide-react';
import { Employee, AppModule } from '../../types';
import { ManagerDashboard } from '../AdminDashboard';
import { ManagementHome, getDepartmentName } from './ManagementHome';
import { MODULE_DEFINITIONS } from '../constants';
import { getOrgLevel, getOrgLevelLabel } from '../../utils/orgAccess';
import { mt, ManagementLang, getModuleTranslatedLabel, getModuleTranslatedDesc } from '../../constants/managementTranslations';
import { DataManager } from '../../utils/dataManager';
import { sortNavigationItems } from '../../constants/moduleNavigation';

interface ManagementPortalProps {
    employee: Employee;
    onLogout: () => void;
}

export const ManagementPortal: React.FC<ManagementPortalProps> = ({ employee, onLogout }) => {
    const [lang, setLang] = useState<ManagementLang>(employee.preferredLanguage === 'my' ? 'my' : 'zh');
    const [activeTabIdx, setActiveTabIdx] = useState<number>(0);
    const [activeModule, setActiveModule] = useState<AppModule | null>(null);

    // Keep state in sync when cloud session triggers a background update
    useEffect(() => {
        if (employee) {
            setLang(employee.preferredLanguage === 'my' ? 'my' : 'zh');
        }
    }, [employee.preferredLanguage]);

    const handleLanguageChange = async (newLang: ManagementLang) => {
        setLang(newLang);
        try {
            const dbLangValue = newLang === 'zh' ? 'zh_en' : 'my';
            await DataManager.updateEmployeePreferredLanguage(employee.id, dbLangValue);
            console.log(`Preferred language updated in Cloud: ${dbLangValue}`);
        } catch (err) {
            console.error('Failed to update language in Cloud:', err);
            // Non-blocking fallback alert
            alert(newLang === 'zh' ? '语言更新失败，请重试。' : 'ဘာသာစကားပြောင်းလဲမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။');
        }
    };

    const allowedModules = useMemo(() => {
        return employee.allowedModules || [];
    }, [employee]);

    const orderedAllowedModules = useMemo(
        () => sortNavigationItems(allowedModules, moduleKey => moduleKey),
        [allowedModules],
    );

    const SUPPORTED_MANAGEMENT_TABS = useMemo(() => [
        'SETTLEMENT',
        'ROSTER',
        'LOGBOOK',
        'LOGBOOK_VIEW',
        'SOP_INSPECT',
        'INVENTORY_CHECK',
        'INVENTORY_VIEW',
        'SUPPLIER_CONTACTS',
        'QUEUE',
        'ATTENDANCE_CONSOLE',
        'PROCUREMENT',
        'MENU_MANAGEMENT',
        'ASSESSMENT',
        'AP',
        'SELF_INVOICE',
        'KITCHEN_ALERT'
    ], []);

    const handleNavigateToModule = (modKey: string) => {
        // 1. Resolve tab key
        const def = MODULE_DEFINITIONS[modKey as keyof typeof MODULE_DEFINITIONS];
        const tabKey = (def && def.tab) ? def.tab : modKey;

        // 2. Strict Permission Check: Check if user has permission for the module
        // We allow access if modKey or tabKey is in employee.allowedModules,
        // or if they have relevant sub-permissions for inventory / roster.
        const isAuthorized = allowedModules.includes(modKey as AppModule) || 
                            allowedModules.includes(tabKey as AppModule) ||
                            (tabKey === 'INVENTORY_CHECK' && allowedModules.some(m => m.startsWith('INVENTORY'))) ||
                            (tabKey === 'ROSTER' && (allowedModules.includes('ROSTER_KITCHEN') || allowedModules.includes('ROSTER_FLOOR')));

        if (!isAuthorized) {
            alert(mt('no_auth_denied', lang));
            return;
        }

        // 3. Whitelist check against ManagerDashboard supported tabs
        if (SUPPORTED_MANAGEMENT_TABS.includes(tabKey)) {
            setActiveModule(tabKey as AppModule);
        } else {
            alert(lang === 'my' 
                ? `⚠️ ကန့်သတ်ချက်- လုပ်ဆောင်ချက် “${def?.label || modKey}” ကို စီမံခန့်ခွဲသူများအတွက် မဖွင့်ရသေးပါ။` 
                : `⚠️ 功能受限：模块“${def?.label || modKey}”暂未对管理人员开放或未接入管理层控制台。`);
        }
    };

    // Filter and compile active/permitted tasks list based on allowedModules and department isolation
    const taskList = useMemo(() => {
        const tasks: Array<{
            id: string;
            title: string;
            desc: string;
            icon: string;
            target: string;
            actionLabel: string;
            badge: string;
            badgeColor: string;
        }> = [];

        const orgLevel = getOrgLevel(employee);
        const isL3 = orgLevel === 'DEPARTMENT_HEAD';
        const managerDept = (employee.department || 'GENERAL').toUpperCase().trim();

        // 💰 SETTLEMENT Task: Show if allowed, and L3 matches BOH/KITCHEN or HR/GENERAL etc, if we want strict department lock.
        // Usually, settlement is for branch managers or general management. If L3 has it allowed, we show it.
        if (allowedModules.includes('SETTLEMENT')) {
            tasks.push({
                id: 'settlement',
                title: lang === 'my' ? 'နေ့စဉ် ငွေစာရင်း တိုက်ဆိုင်စစ်ဆေးခြင်း' : '每日结算对账',
                desc: lang === 'my' ? 'ယနေ့ ရရှိငွေစာရင်းများ တွက်ချက်ထည့်သွင်းခြင်း၊ အသုံးစရိတ် ပြေစာများ တင်ပြခြင်းနှင့် လက်ကျန်ငွေ ကွာခြားချက်များကို စစ်ဆေးခြင်း။' : '核算并录入今日的营业现金账，上传支出单据收条，核算备用金差异。',
                icon: '💰',
                target: 'SETTLEMENT',
                actionLabel: lang === 'my' ? 'ငွေစာရင်းစစ်ရန်' : '去结算',
                badge: lang === 'my' ? 'ယနေ့ လုပ်ဆောင်ရန်' : '今日待办',
                badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            });
        }

        // 📅 ROSTER Task: Filtered by department if L3 (DEPARTMENT_HEAD)
        if (allowedModules.includes('ROSTER') || allowedModules.includes('ROSTER_KITCHEN') || allowedModules.includes('ROSTER_FLOOR')) {
            let desc = '查看今日门店缺勤，安排或调整当班人员以防止现场人手不足。';
            if (lang === 'my') {
                desc = 'ယနေ့ ဝန်ထမ်း ပျက်ကွက်မှုများကို စစ်ဆေးပြီး လိုအပ်သလို အလှည့်ကျတာဝန်များကို ချိန်ညှိပါ။';
            }
            if (isL3) {
                desc = lang === 'my' 
                    ? `ယနေ့ ${getDepartmentName(managerDept, lang)} ပျက်ကွက်မှုများကို စစ်ဆေးပြီး တာဝန်ကျဝန်ထမ်းများအား စီစဉ်ရန်။`
                    : `查看今日 ${getDepartmentName(managerDept, lang)} 缺勤，安排或调整当班人员。`;
            }
            tasks.push({
                id: 'roster_check',
                title: lang === 'my' ? 'အလှည့်ကျတာဝန် စစ်ဆေးခြင်းနှင့် ခွင့်ပြုချက် အတည်ပြုခြင်း' : '排班稽查与请假审批',
                desc: desc,
                icon: '📅',
                target: 'ROSTER',
                actionLabel: lang === 'my' ? 'တာဝန်ဇယားကြည့်ရန်' : '查排班',
                badge: lang === 'my' ? 'ချက်ချင်း စစ်ဆေးရန်' : '即时稽查',
                badgeColor: 'bg-sky-500/10 text-sky-600 border-sky-500/20'
            });
        }

        // ⏱️ ATTENDANCE_CONSOLE Task: Show if allowed
        if (allowedModules.includes('ATTENDANCE_CONSOLE')) {
            tasks.push({
                id: 'attendance_console',
                title: lang === 'my' ? 'တက်ရောက်မှု မှတ်တမ်း ပြုပြင်ခြင်း' : '考勤漏打卡与代补签',
                desc: lang === 'my' ? 'တက်ရောက်မှုစနစ် မူမမှန်မှုများကို စစ်ဆေးအတည်ပြုပြီး ဝန်ထမ်းများ၏ လစဉ်လုပ်ငန်းခွင် နာရီများကို အတည်ပြုပါ။' : '协助或核实考勤系统异常记录，处理打卡漏洞并确认员工当月工时。',
                icon: '⏱️',
                target: 'ATTENDANCE_CONSOLE',
                actionLabel: lang === 'my' ? 'တက်ရောက်မှုစစ်ဆေး' : '考勤稽查',
                badge: lang === 'my' ? 'နေ့စဉ် မူမမှန်မှု' : '每日异常',
                badgeColor: 'bg-amber-500/10 text-amber-600 border-amber-500/20'
            });
        }

        // 📦 INVENTORY Task: Filtered by department if L3
        if (allowedModules.some(m => m.startsWith('INVENTORY'))) {
            let shouldShow = true;
            let desc = '根据今日排期，执行或分配厨房/水吧物料库存点算盘存。';
            if (lang === 'my') {
                desc = 'ယနေ့ အစီအစဉ်အရ မီးဖိုချောင်/ဘား ပစ္စည်းစာရင်းများကို စစ်ဆေးခြင်း သို့မဟုတ် တာဝန်ခွဲဝေပေးခြင်း။';
            }
            if (isL3) {
                if (managerDept === 'KITCHEN' || managerDept === 'BOH') {
                    desc = lang === 'my' 
                        ? 'ယနေ့ အစီအစဉ်အရ မီးဖိုချောင်ဌာန (BOH) ၏ ပစ္စည်းစာရင်း စစ်ဆေးမှုကို ဆောင်ရွက်ရန်။'
                        : '根据今日排期，执行厨房部（BOH）库存盘存稽核。';
                } else if (managerDept === 'BAR') {
                    desc = lang === 'my' 
                        ? 'ယနေ့ အစီအစဉ်အရ ဘားဌာန (BAR) ၏ ပစ္စည်းစာရင်း စစ်ဆေးမှုကို ဆောင်ရွက်ရန်。'
                        : '根据今日排期，执行水吧部（BAR）库存盘存稽核。';
                } else {
                    shouldShow = false; // Other L3 departments don't have stock tasks
                }
            }
            if (shouldShow) {
                tasks.push({
                    id: 'inventory_check',
                    title: lang === 'my' ? 'နေ့စဉ် ပစ္စည်းစာရင်း စစ်ဆေးမှု လုပ်ငန်း' : '每日库存盘点任务',
                    desc: desc,
                    icon: '📦',
                    target: 'INVENTORY_CHECK',
                    actionLabel: lang === 'my' ? 'ပစ္စည်းစာရင်း စစ်ရန်' : '执行盘点',
                    badge: lang === 'my' ? 'ပစ္စည်းစာရင်း စစ်ဆေးခြင်း' : '库存盘点',
                    badgeColor: 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                });
            }
        }

        // 🛒 PROCUREMENT Task: Only show to BOH/KITCHEN or BAR or General if L3
        if (allowedModules.includes('PROCUREMENT')) {
            let shouldShow = true;
            if (isL3 && managerDept === 'FLOOR') {
                shouldShow = false; // Floor doesn't do procurement
            }
            if (shouldShow) {
                tasks.push({
                    id: 'procurement',
                    title: lang === 'my' ? 'ကုန်ပစ္စည်း မှာယူမှု စစ်ဆေးခြင်းနှင့် ပေးပို့ခြင်း' : '申购订货单审核发送',
                    desc: lang === 'my' ? 'ပစ္စည်းစာရင်း လျော့နည်းနေသည်များကို ခွဲခြမ်းစိတ်ဖြာပြီး မှာယူရမည့် စာရင်းအား အလိုအလျောက် ထုတ်ယူပေးပို့ပါ။' : '分析低库存预警物料，自动生成申购清单并发送供应商。',
                    icon: '🛒',
                    target: 'PROCUREMENT',
                    actionLabel: lang === 'my' ? 'ပစ္စည်းမှာရန်' : '去订货',
                    badge: lang === 'my' ? 'ပုံမှန် မှာယူခြင်း' : '周期申购',
                    badgeColor: 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                });
            }
        }

        // 📝 LOGBOOK Task
        if (allowedModules.includes('LOGBOOK')) {
            tasks.push({
                id: 'logbook',
                title: lang === 'my' ? 'လုပ်ငန်းလည်ပတ်မှု မှတ်တမ်း ရေးသားခြင်း' : '突发运营日志确认',
                desc: lang === 'my' ? 'ယနေ့ အလှည့်ကျ တာဝန်လွှဲပြောင်းမှု မှတ်တမ်း ရေးသားခြင်း၊ တိုင်ကြားချက်များနှင့် ပြုပြင်ထိန်းသိမ်းမှုများကို တင်ပြခြင်း။' : '写今日班次交接日志，上报客诉、维保进度或紧急整改项目。',
                icon: '📝',
                target: 'LOGBOOK',
                actionLabel: lang === 'my' ? 'မှတ်တမ်းရေးရန်' : '写日志',
                badge: lang === 'my' ? 'တာဝန်လွှဲပြောင်းခြင်း' : '当班交接',
                badgeColor: 'bg-teal-500/10 text-teal-600 border-teal-500/20'
            });
        }

        // 🎖️ ASSESSMENT Task
        if (allowedModules.includes('ASSESSMENT')) {
            tasks.push({
                id: 'assessment',
                title: lang === 'my' ? 'ဝန်ထမ်း စွမ်းဆောင်ရည် ဆန်းစစ် အကဲဖြတ်ခြင်း' : '开展当班员工季度评分',
                desc: lang === 'my' ? 'လက်အောက်ငယ်သားများ၏ စွမ်းဆောင်ရည်၊ စည်းကမ်းနှင့် ကျွမ်းကျင်မှုများကို အကဲဖြတ်စစ်ဆေးပါ။' : '核准下属在效率、纪律 and 技能方面的实际表现，评估是否符合标准。',
                icon: '🎖️',
                target: 'ASSESSMENT',
                actionLabel: lang === 'my' ? 'အမှတ်ပေးရန်' : '去打分',
                badge: lang === 'my' ? 'လစဉ် ဆန်းစစ်ခြင်း' : '月度考评',
                badgeColor: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20'
            });
        }

        // 💳 AP Task
        if (allowedModules.includes('AP')) {
            tasks.push({
                id: 'ap_check',
                title: lang === 'my' ? 'ကုန်ပစ္စည်း ပြေစာများနှင့် ငွေပေးချေမှု စစ်ဆေးခြင်း' : '进货单据与付款审核',
                desc: lang === 'my' ? 'ကုန်ပစ္စည်း ပြေစာများ (AP) ကို စစ်ဆေးမှတ်တမ်းတင်ပြီး ငွေပေးချေမှု အတည်ပြုချက်များ ပြုလုပ်ပါ။' : '点算并登记进货单据（AP），生成对应的付款凭单并核准支出。',
                icon: '💳',
                target: 'AP',
                actionLabel: lang === 'my' ? 'စာရင်းသွင်းရန်' : '去记账',
                badge: lang === 'my' ? 'ငွေစာရင်း ကိုင်တွယ်ခြင်း' : '账款处理',
                badgeColor: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
            });
        }

        return tasks;
    }, [allowedModules, employee, lang]);

    return (
        <div className="min-h-screen bg-[#F6F7FB] flex flex-col relative overflow-x-hidden select-none text-stone-850">
            
            {/* If an operational sub-module is active, render the workspace full-screen, hiding tabs */}
            <AnimatePresence mode="wait">
                {activeModule ? (
                    <motion.div 
                        key="module-workspace"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 z-50 bg-[#F6F7FB] overflow-y-auto"
                    >
                        <ManagerDashboard
                            initialTab={activeModule as any}
                            onBack={() => setActiveModule(null)}
                            isSingleMode={true}
                            currentEmployee={employee}
                            isManagementStaff={true}
                            allowedModules={allowedModules}
                            lang={lang}
                        />
                    </motion.div>
                ) : (
                    // Regular Navigation Tabs Layout Shell
                    <motion.div 
                        key="portal-home"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col flex-grow"
                    >
                        {/* Tab Content Display Router */}
                        <div className="flex-grow pb-24">
                            
                            {/* Tab 0: Working Dashboard (工作台) */}
                            {activeTabIdx === 0 && (
                                <ManagementHome 
                                    employee={employee} 
                                    onNavigateToModule={handleNavigateToModule} 
                                    onSwitchTab={setActiveTabIdx}
                                    lang={lang}
                                    onLanguageChange={handleLanguageChange}
                                />
                            )}

                            {/* Tab 1: Tasks (待我处理) */}
                            {activeTabIdx === 1 && (
                                <div className="px-4 md:px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-xl font-black text-stone-900 font-serif tracking-wide">{mt('tasks_title', lang)}</h2>
                                            <p className="text-[10px] text-stone-400 tracking-widest mt-1 uppercase font-mono">ACTIONABLE TASK MANAGER</p>
                                        </div>
                                    </div>

                                    {taskList.length > 0 ? (
                                        <div className="space-y-3.5">
                                            {taskList.map(task => (
                                                <div 
                                                    key={task.id} 
                                                    className="p-4 rounded-xl border border-stone-200 bg-white shadow-sm flex flex-col justify-between gap-4"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-2xl mt-0.5">{task.icon}</span>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h4 className="text-sm font-extrabold text-stone-900">{task.title}</h4>
                                                                <span className={`text-[8px] px-2 py-0.5 rounded-full font-black border uppercase ${task.badgeColor}`}>
                                                                    {task.badge}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-stone-500 leading-relaxed font-medium">
                                                                {task.desc}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-end border-t border-stone-100 pt-3">
                                                        <button
                                                            onClick={() => handleNavigateToModule(task.target)}
                                                            className="flex items-center gap-1 bg-amber-500 text-white hover:bg-amber-600 px-4 py-1.5 rounded-full text-xs font-black shadow-sm active:scale-95 transition-transform outline-none"
                                                        >
                                                            <span>{task.actionLabel}</span>
                                                            <ChevronRight size={13} className="stroke-[3]" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-12 border border-dashed border-stone-300 rounded-2xl bg-white text-center flex flex-col items-center gap-3 shadow-xs">
                                            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                                                <CheckCircle2 size={20} />
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-emerald-700">{mt('tasks_empty', lang)}</div>
                                                <p className="text-[10px] text-stone-500 mt-1">{mt('tasks_empty_desc', lang)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab 2: Functions List (功能列表) */}
                            {activeTabIdx === 2 && (
                                <div className="px-4 md:px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-xl font-black text-stone-900 font-serif tracking-wide">{mt('functions_title', lang)}</h2>
                                            <p className="text-[10px] text-stone-400 tracking-widest mt-1 uppercase font-mono">AUTHORIZED SYSTEMS GRID</p>
                                        </div>
                                    </div>

                                    {allowedModules.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {orderedAllowedModules.map(modKey => {
                                                const modDef = MODULE_DEFINITIONS[modKey as keyof typeof MODULE_DEFINITIONS];
                                                if (!modDef) return null;
                                                const IconComponent = modDef.icon;
                                                const tabKey = modDef.tab || modKey;
                                                const isSupported = SUPPORTED_MANAGEMENT_TABS.includes(tabKey);
                                                return (
                                                    <button
                                                        key={modKey}
                                                        onClick={() => handleNavigateToModule(modKey)}
                                                        className={`p-4 rounded-xl border flex items-start gap-3.5 text-left transition-all outline-none group shadow-xs ${
                                                            isSupported 
                                                                ? 'border-stone-200 bg-white active:scale-[0.98] hover:bg-stone-50 cursor-pointer' 
                                                                : 'border-stone-200/60 bg-stone-50/50 opacity-60 cursor-not-allowed'
                                                        }`}
                                                    >
                                                        <div className="w-10 h-10 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-500 group-hover:border-amber-300 group-hover:text-amber-600 transition-colors shrink-0">
                                                            <IconComponent size={20} />
                                                        </div>
                                                        <div className="min-w-0 flex-grow">
                                                            <div className="text-sm font-extrabold text-stone-900 flex items-center justify-between gap-1">
                                                                <span className="truncate">{getModuleTranslatedLabel(modKey, lang, modDef.label)}</span>
                                                                {isSupported ? (
                                                                    <ChevronRight size={12} className="text-stone-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                                                                ) : (
                                                                    <span className="text-[8px] bg-stone-200 text-stone-600 font-extrabold px-1.5 py-0.5 rounded shrink-0">
                                                                        {mt('not_connected', lang)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-stone-500 mt-0.5 truncate leading-relaxed font-medium">
                                                                {isSupported ? getModuleTranslatedDesc(modKey, lang, modDef.desc) : (lang === 'my' ? 'စီမံခန့်ခွဲမှု မျက်နှာပြင်သို့ မဖွင့်သေးပါ' : '暂未向管理层界面开放接入')}
                                                            </p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-12 border border-dashed border-stone-300 rounded-2xl bg-white text-center flex flex-col items-center gap-3 shadow-xs">
                                            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400">
                                                <HelpCircle size={20} />
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-stone-500">{mt('no_modules_empty', lang)}</div>
                                                <p className="text-[10px] text-stone-500 mt-1">{mt('no_modules_empty_desc', lang)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab 3: Me/Profile View (我的) */}
                            {activeTabIdx === 3 && (
                                <div className="px-4 md:px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-xl font-black text-stone-900 font-serif tracking-wide">{mt('profile', lang)}</h2>
                                            <p className="text-[10px] text-stone-400 tracking-widest mt-1 uppercase font-mono">STAFF CARD & PRIVACY</p>
                                        </div>
                                    </div>

                                    {/* Personal Identity Card */}
                                    <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-full bg-stone-50 border-2 border-stone-200 flex items-center justify-center text-stone-700 text-xl font-black overflow-hidden shadow-sm shrink-0">
                                                {employee.avatar ? (
                                                    <img src={employee.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    employee.name.charAt(0)
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-stone-900">{employee.name}</h3>
                                                <p className="text-xs text-stone-500 font-bold mt-0.5">{employee.role}</p>
                                                
                                                {/* Issue 12: Dual line badge for L3 (DEPARTMENT_HEAD) */}
                                                {getOrgLevel(employee) === 'DEPARTMENT_HEAD' ? (
                                                    <div className="mt-1 flex flex-col items-start gap-1">
                                                        <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                                            L3
                                                        </span>
                                                        <span className="text-[10px] text-amber-700 font-extrabold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                            {mt('dept_head', lang)}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="inline-block mt-1 bg-amber-500/10 text-amber-700 text-[8px] px-2.5 py-0.5 rounded-full font-black border border-amber-500/20 uppercase tracking-wider">
                                                        {(() => {
                                                                                                                           const level = getOrgLevel(employee);
                                                              const translationMap = {
                                                                  'BOSS': 'org_owner',
                                                                  'GENERAL_MANAGER': 'org_general_manager',
                                                                  'BRANCH_MANAGER': 'org_branch_manager',
                                                                  'DEPARTMENT_HEAD': 'org_department_head',
                                                                  'STAFF': 'org_staff'
                                                              };
                                                              const transKey = translationMap[level];
                                                              if (transKey) return mt(transKey, lang);
                                                              return getOrgLevelLabel(employee);
                                                         })()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="border-t border-stone-100 pt-4 space-y-3">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-stone-500 font-bold">{mt('emp_id', lang)}:</span>
                                                <span className="font-mono text-stone-900 font-extrabold">{employee.id}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-stone-500 font-bold">{mt('emp_dept', lang)}:</span>
                                                <span className="text-stone-900 font-extrabold">
                                                    {getDepartmentName(employee.department, lang)}
                                                </span>
                                            </div>
                                            
                                            {/* Issue 5: Absolutely NO PIN display here for management */}
                                            
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-stone-500 font-bold">{mt('emp_status', lang)}:</span>
                                                 <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                     <ShieldCheck size={11} /> {(() => {
                                                         const status = employee.status || 'CONFIRMED';
                                                         if (status === 'PROBATION') {
                                                             return `${mt('status_probation', lang)} (PROBATION)`;
                                                         } else if (status === 'TERMINATED') {
                                                             return `${mt('status_terminated', lang)} (TERMINATED)`;
                                                         } else {
                                                             return `${mt('status_regular', lang)} (CONFIRMED)`;
                                                         }
                                                     })()}
                                                 </span>
                                             </div>
                                        </div>
                                    </div>

                                    {/* Language Settings Block */}
                                    <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Languages size={16} className="text-[#650707]" />
                                            <h4 className="font-extrabold text-stone-900 text-sm">首选语言 (Language)</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => handleLanguageChange('zh')}
                                                className={`h-11 rounded-xl text-xs font-black border transition-all ${
                                                    lang === 'zh'
                                                        ? 'bg-[#650707] text-white border-[#650707] shadow-sm'
                                                        : 'bg-[#FAF9F6] text-stone-500 border-stone-200 hover:bg-stone-50'
                                                }`}
                                                style={{ minHeight: '44px' }}
                                            >
                                                中文 / English
                                            </button>
                                            <button
                                                onClick={() => handleLanguageChange('my')}
                                                className={`h-11 rounded-xl text-xs font-black border transition-all ${
                                                    lang === 'my'
                                                        ? 'bg-[#650707] text-white border-[#650707] shadow-sm'
                                                        : 'bg-[#FAF9F6] text-stone-500 border-stone-200 hover:bg-stone-50'
                                                }`}
                                                style={{ minHeight: '44px' }}
                                            >
                                                မြန်မာစာ (Myanmar)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="space-y-3 pt-4">
                                        <button
                                            onClick={onLogout}
                                            className="w-full h-12 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all outline-none shadow-xs"
                                        >
                                            <LogOut size={16} />
                                            <span>{mt('logout', lang)}</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Standard Bottom Tab Navigation Bar with Safety Area padding for iOS Safari */}
                        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl border-t border-stone-200/80 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] px-4 flex justify-around items-center z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.03)] md:max-w-[390px] md:mx-auto md:rounded-t-2xl">
                            {[
                                { key: 'home', label: lang === 'my' ? 'ပင်မစာမျက်နှာ' : '工作台', icon: '👑' },
                                { key: 'tasks', label: lang === 'my' ? 'လုပ်ငန်းများ' : '任务', icon: '📝' },
                                { key: 'funcs', label: lang === 'my' ? 'လုပ်ဆောင်ချက်' : '功能', icon: '📦' },
                                { key: 'me', label: lang === 'my' ? 'ကျွန်ုပ်' : '我的', icon: '👤' }
                            ].map((tab, idx) => {
                                const isSelected = activeTabIdx === idx;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTabIdx(idx)}
                                        className="flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform outline-none"
                                        style={{ minWidth: '55px', minHeight: '44px' }} // Standard touch targets 44x44 HIG
                                    >
                                        <span className={`text-xl transition-all ${isSelected ? 'scale-110' : 'opacity-40'}`}>
                                            {tab.icon}
                                        </span>
                                        <span className={`text-[9px] font-black tracking-wider transition-colors ${isSelected ? 'text-amber-600' : 'text-stone-400'}`}>
                                            {tab.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};
