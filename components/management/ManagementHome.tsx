import React, { useMemo } from 'react';
import { isRetiredModule } from '../../utils/retiredModules';
import { Employee, AppModule, OrgLevel, normalizeLanguage } from '../../types';
import { mt, ManagementLang } from '../../constants/managementTranslations';
import { sortNavigationItems } from '../../constants/moduleNavigation';
import { ManagerInbox } from './ManagerInbox';
import { TodayRosterCard } from '../hr/TodayRosterCard';
import { IconTile, moduleIcon } from './managementIcons';

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
    /** 放在「待我处理」标题右边（通知铃） */
    inboxAction?: React.ReactNode;
}

export const ManagementHome: React.FC<ManagementHomeProps> = ({ employee, onNavigateToModule, lang, onLanguageChange, inboxAction }) => {
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
        if (!isRetiredModule('SOP_INSPECT') && allowedModules.includes('SOP_INSPECT')) {
            list.push({ module: 'SOP_INSPECT', label: mt('module_sop_inspect', lang), icon: '✅', bg: 'bg-teal-50 border-teal-200/80', text: 'text-teal-600 font-extrabold' });
        }
        if (allowedModules.some(m => m.startsWith('INVENTORY'))) {
            list.push({ module: 'TASK_STOCKTAKE' as AppModule, label: lang === 'my' ? 'စာရင်းစစ် ခိုင်း' : '派盘点', icon: '📦', bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-600 font-extrabold' });
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
            {/* 2. 待我处理 + 全部功能：管理层要的是能直接动手的事 */}
            {/* 个人资料在「我的」；首页最上面直接看今日排班 */}
            <div className="flex-grow px-4 md:px-6 space-y-6 pt-[calc(1rem+env(safe-area-inset-top))]">
                <TodayRosterCard lang={lang} onOpen={() => onNavigateToModule('ROSTER')} />
                <ManagerInbox employee={employee} lang={lang} onOpen={onNavigateToModule} headerAction={inboxAction} />

                <section className="space-y-2">
                    <h3 className="text-sm font-black text-stone-800 px-1">{lang === 'my' ? 'လုပ်ဆောင်ချက်များ' : lang === 'en' ? 'Functions' : '功能'}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {allPossibleShortcuts.map(item => (
                            <button key={item.module} onClick={() => onNavigateToModule(item.module)}
                                className="w-full bg-white border border-stone-200/60 hover:border-stone-300 rounded-2xl p-4 flex flex-col justify-between text-left shadow-sm active:scale-95 transition-all min-h-[104px]"
                                style={{ WebkitTapHighlightColor: 'transparent' }}>
                                <IconTile style={moduleIcon(item.module)} />
                                <span className="mt-3 font-extrabold text-[#111111] text-sm leading-tight truncate">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};
