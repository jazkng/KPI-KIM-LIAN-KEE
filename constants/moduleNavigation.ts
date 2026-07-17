/**
 * 全系统功能排列的唯一来源。
 *
 * 这里只负责「分类与顺序」，不负责权限。老板、管理层与员工仍然只会
 * 看见原本获准使用的功能，但同一个功能在所有界面会保持相同位置。
 */

export type ModuleCategoryId =
    | 'OPERATIONS'
    | 'INVENTORY'
    | 'FINANCE'
    | 'PEOPLE'
    | 'STRATEGY'
    | 'SYSTEM';

export interface ModuleCategoryDefinition {
    id: ModuleCategoryId;
    title: string;
    subtitle: string;
    order: number;
}

export interface ModuleNavigationRule {
    category: ModuleCategoryId;
    order: number;
}

export const MODULE_CATEGORIES: ModuleCategoryDefinition[] = [
    { id: 'OPERATIONS', title: '今日营运', subtitle: 'Today Operations', order: 10 },
    { id: 'INVENTORY', title: '库存与采购', subtitle: 'Inventory & Purchasing', order: 20 },
    { id: 'FINANCE', title: '财务与资金', subtitle: 'Finance & Capital', order: 30 },
    { id: 'PEOPLE', title: '人事与组织', subtitle: 'People & Organization', order: 40 },
    { id: 'STRATEGY', title: '计划与发展', subtitle: 'Strategy & Growth', order: 50 },
    { id: 'SYSTEM', title: '系统与工具', subtitle: 'System & Utilities', order: 60 },
];

/**
 * Key 可以是 AppModule、ManagerDashboard tab，或 BossDashboard target。
 * 别名放在一起，避免不同入口使用不同名称时顺序再次分叉。
 */
export const MODULE_NAVIGATION_RULES: Record<string, ModuleNavigationRule> = {
    // 今日营运
    SETTLEMENT: { category: 'OPERATIONS', order: 10 },
    KITCHEN_ALERT: { category: 'OPERATIONS', order: 20 },
    QUEUE_MANAGER: { category: 'OPERATIONS', order: 30 },
    QUEUE: { category: 'OPERATIONS', order: 30 },
    LOGBOOK: { category: 'OPERATIONS', order: 40 },
    LOGBOOK_VIEW: { category: 'OPERATIONS', order: 41 },
    SOP: { category: 'OPERATIONS', order: 50 },
    SOP_INSPECT: { category: 'OPERATIONS', order: 51 },
    DAILY_ALERT: { category: 'OPERATIONS', order: 60 },

    // 库存与采购
    INVENTORY_CHECK: { category: 'INVENTORY', order: 10 },
    INVENTORY_KITCHEN: { category: 'INVENTORY', order: 11 },
    INVENTORY_BAR: { category: 'INVENTORY', order: 12 },
    INVENTORY_GENERAL: { category: 'INVENTORY', order: 13 },
    INVENTORY_FUEL: { category: 'INVENTORY', order: 14 },
    INVENTORY_VIEW: { category: 'INVENTORY', order: 20 },
    PROCUREMENT: { category: 'INVENTORY', order: 30 },
    SUPPLIER_CONTACTS: { category: 'INVENTORY', order: 40 },
    MENU_MANAGEMENT: { category: 'INVENTORY', order: 50 },
    MENU: { category: 'INVENTORY', order: 50 },
    PRICE_MONITOR: { category: 'INVENTORY', order: 60 },

    // 财务与资金
    AP: { category: 'FINANCE', order: 10 },
    SELF_INVOICE: { category: 'FINANCE', order: 20 },
    BILLS: { category: 'FINANCE', order: 30 },
    TREASURY: { category: 'FINANCE', order: 40 },
    REPORTS: { category: 'FINANCE', order: 50 },
    REPORT: { category: 'FINANCE', order: 50 },

    // 人事与组织
    HR: { category: 'PEOPLE', order: 10 },
    HR_FILES: { category: 'PEOPLE', order: 10 },
    ATTENDANCE: { category: 'PEOPLE', order: 20 },
    ATTENDANCE_CONSOLE: { category: 'PEOPLE', order: 20 },
    ROSTER: { category: 'PEOPLE', order: 30 },
    ROSTER_KITCHEN: { category: 'PEOPLE', order: 31 },
    ROSTER_FLOOR: { category: 'PEOPLE', order: 32 },
    ASSESSMENT: { category: 'PEOPLE', order: 40 },
    ORG: { category: 'PEOPLE', order: 50 },

    // 计划与发展
    VOTE: { category: 'STRATEGY', order: 10 },
    OKR: { category: 'STRATEGY', order: 20 },
    CAMPAIGN: { category: 'STRATEGY', order: 30 },
    EVENTS: { category: 'STRATEGY', order: 40 },
    PLANNING: { category: 'STRATEGY', order: 50 },

    // 系统与工具
    TRANSLATION: { category: 'SYSTEM', order: 10 },
    WARRANTY: { category: 'SYSTEM', order: 20 },
    AI_ASSISTANT: { category: 'SYSTEM', order: 30 },
    SYSTEM_SETTINGS: { category: 'SYSTEM', order: 40 },
};

const FALLBACK_RULE: ModuleNavigationRule = { category: 'SYSTEM', order: 900 };

export const getModuleNavigationRule = (key: string): ModuleNavigationRule => (
    MODULE_NAVIGATION_RULES[key] || FALLBACK_RULE
);

export const getModuleCategoryOrder = (category: ModuleCategoryId): number => (
    MODULE_CATEGORIES.find(item => item.id === category)?.order ?? 999
);

/** 不修改原数组，避免排序影响权限资料或 React state。 */
export const sortNavigationItems = <T>(
    items: readonly T[],
    getKey: (item: T) => string,
): T[] => (
    [...items].sort((a, b) => {
        const keyA = getKey(a);
        const keyB = getKey(b);
        const ruleA = getModuleNavigationRule(keyA);
        const ruleB = getModuleNavigationRule(keyB);
        const categoryDifference = getModuleCategoryOrder(ruleA.category) - getModuleCategoryOrder(ruleB.category);
        if (categoryDifference !== 0) return categoryDifference;
        if (ruleA.order !== ruleB.order) return ruleA.order - ruleB.order;
        return keyA.localeCompare(keyB);
    })
);
