import { Employee } from '../types';
import type { AppModule } from '../components/constants';
import { getOrgLevel } from './orgAccess';

/**
 * 老板界面 (BossDashboard / BossPriorityDashboard) 的卡片 target
 * → 权限模块 (AppModule) 的映射表。
 *
 * 用途：L1 老板不受限制；L2 及以下若被指派进老板界面，
 * 只能看到／打开 HR 权限配置里已勾选的模块。
 */
export const BOSS_TARGET_MODULE_MAP: Record<string, AppModule> = {
    // 运营
    SETTLEMENT: 'SETTLEMENT',
    DAILY_REPORT: 'SETTLEMENT',
    QUEUE: 'QUEUE_MANAGER',
    LOGBOOK: 'LOGBOOK',
    LOGBOOK_VIEW: 'LOGBOOK',
    SOP_INSPECT: 'SOP_INSPECT',
    // 库存与供应链
    INVENTORY_CHECK: 'INVENTORY_CHECK',
    INVENTORY_VIEW: 'INVENTORY_VIEW',
    PROCUREMENT: 'PROCUREMENT',
    SUPPLIER_CONTACTS: 'SUPPLIER_CONTACTS',
    MENU: 'MENU_MANAGEMENT',
    PRICE_MONITOR: 'PRICE_MONITOR',
    // 财务
    AP: 'AP',
    SELF_INVOICE: 'SELF_INVOICE',
    BILLS: 'BILLS',
    TREASURY: 'TREASURY',
    REPORTS: 'REPORTS',
    ONLINE_ORDERS: 'ONLINE_ORDERS',
    // 人工成本与盈利：与财务报表同一个权限（含薪资与营业额资料）
    LABOUR_PROFIT: 'REPORTS',
    // 经营驾驶舱：含利润、营业额与人工成本，与财务报表同一个权限
    BOSS_COCKPIT: 'REPORTS',
    // 盈亏对账：只读，含利润、营业额与薪资，与财务报表同一个权限
    PNL_RECON: 'REPORTS',
    // 人事
    HR: 'HR_FILES',
    ATTENDANCE: 'ATTENDANCE_CONSOLE',
    ROSTER: 'ROSTER',
    ASSESSMENT: 'ASSESSMENT',
    STAFF_CASH: 'STAFF_CASH',
    ORG: 'ORG_CHART',
    // 规划
    VOTE: 'PLANNING',
    OKR: 'PLANNING',
    CAMPAIGN: 'PLANNING',
    EVENTS: 'PLANNING',
    // 其他
    TRANSLATION: 'TRANSLATION',
    WARRANTY: 'WARRANTY',
    AI_ASSISTANT: 'AI_ASSISTANT',
};

/** L1 老板／决策层：不受 allowedModules 限制。 */
export const isUnrestrictedBossPortal = (employee?: Employee | null): boolean => {
    if (!employee) return false;
    return getOrgLevel(employee) === 'OWNER';
};

/**
 * 判断当前使用者能否使用老板界面上的某个 target。
 * L1 一律 true；其余人按 allowedModules 判断。
 */
export const canUseBossTarget = (
    employee: Employee | null | undefined,
    target: string,
): boolean => {
    if (isUnrestrictedBossPortal(employee)) return true;
    if (!employee) return false;

    const allowed = employee.allowedModules || [];
    const required = BOSS_TARGET_MODULE_MAP[target];
    if (!required) return false; // 未登记的 target 一律不开放给非老板

    if (allowed.includes(required)) return true;

    // 兼容既有的分区权限写法
    if (required === 'INVENTORY_CHECK') {
        return allowed.some(m => m.startsWith('INVENTORY'));
    }
    if (required === 'ROSTER') {
        return allowed.includes('ROSTER_KITCHEN') || allowed.includes('ROSTER_FLOOR');
    }
    return false;
};
