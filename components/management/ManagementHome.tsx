import React, { useMemo } from 'react';
import { isRetiredModule } from '../../utils/retiredModules';
import { Crown, Languages } from 'lucide-react';
import { Employee, AppModule, OrgLevel, normalizeLanguage } from '../../types';
import { getOrgLevel } from '../../utils/orgAccess';
import { mt, ManagementLang } from '../../constants/managementTranslations';
import { sortNavigationItems } from '../../constants/moduleNavigation';
import { ManagerInbox } from './ManagerInbox';

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
    STAFF_SUPPORT: {
        zh_en: 'L2S 幕僚',
        en: 'L2S Staff Support',
        my: 'L2S ပံ့ပိုးရေး'
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

export const ManagementHome: React.FC<ManagementHomeProps> = ({ employee, onNavigateToModule, lang, onLanguageChange }) => {
    const allowedModules = useMemo(() => {
        return employee.allowedModules || [];
    }, [employee]);

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
        if (!isRetiredModule('ASSESSMENT') && allowedModules.includes('ASSESSMENT')) {
            list.push({ module: 'ASSESSMENT', label: mt('module_assessment', lang), icon: '🎖️', bg: 'bg-cyan-50 border-cyan-200/80', text: 'text-cyan-600 font-extrabold' });
        }
        if (allowedModules.includes('AP')) {
            list.push({ module: 'AP', label: mt('module_ap', lang), icon: '💳', bg: 'bg-blue-50 border-blue-200/80', text: 'text-blue-600 font-extrabold' });
        }
        if (allowedModules.includes('SELF_INVOICE')) {
            list.push({ module: 'SELF_INVOICE', label: mt('module_self_invoice', lang), icon: '📄', bg: 'bg-violet-50 border-violet-200/80', text: 'text-violet-600 font-extrabold' });
        }
        if (allowedModules.includes('STAFF_CASH')) {
            list.push({ module: 'STAFF_CASH', label: lang === 'my' ? 'အချိန်ပိုင်း / ကြိုတင်ငွေ' : '兼职与预支', icon: '💵', bg: 'bg-emerald-50 border-emerald-200/80', text: 'text-emerald-700 font-extrabold' });
        }
        if (allowedModules.includes('SUPPLIER_CONTACTS')) {
            list.push({ module: 'SUPPLIER_CONTACTS', label: lang === 'my' ? 'ပေးသွင်းသူ' : '供应商', icon: '🏪', bg: 'bg-orange-50 border-orange-200/80', text: 'text-orange-700 font-extrabold' });
        }
        if (allowedModules.includes('MENU_MANAGEMENT')) {
            list.push({ module: 'MENU_MANAGEMENT', label: lang === 'my' ? 'မီနူး' : '菜单', icon: '🍜', bg: 'bg-red-50 border-red-200/80', text: 'text-red-700 font-extrabold' });
        }
        return sortNavigationItems(list, item => item.module);
    }, [allowedModules, lang]);

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

            {/* 2. 待我处理 + 全部功能：管理层要的是能直接动手的事 */}
            <div className="flex-grow px-4 md:px-6 space-y-6 pt-4">
                <ManagerInbox employee={employee} lang={lang} onOpen={onNavigateToModule} />

                <section className="space-y-2">
                    <h3 className="text-sm font-black text-stone-800 px-1">{lang === 'my' ? 'လုပ်ဆောင်ချက်များ' : lang === 'en' ? 'Functions' : '功能'}</h3>
                    <div className="grid grid-cols-4 gap-2">
                        {allPossibleShortcuts.map(item => (
                            <button key={item.module} onClick={() => onNavigateToModule(item.module)}
                                className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white border border-stone-200 shadow-xs min-h-[84px] px-1 py-2 active:scale-95 transition-transform">
                                <span className="text-[26px] leading-none">{item.icon}</span>
                                <span className="text-[11px] font-black text-stone-700 leading-tight text-center line-clamp-2">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};
