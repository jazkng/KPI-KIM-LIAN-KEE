// 谁可以管理库存编号（重新编号、手动改编号、看内部 ID）：负责人（L1）与系统管理员。
// 注意：V1 的权限只在前端执行，这里只是画面控制；Firestore Rules 加强另案申请（编号计划第 7 步）。
import type { Employee } from '../../types';
import { getOrgLevel, getSystemRole } from '../orgAccess';

export const canManageStockCodes = (employee: Employee | undefined | null, isLegacyBossSession = false): boolean => {
    if (!employee) return isLegacyBossSession;
    return getOrgLevel(employee) === 'OWNER' || getSystemRole(employee) === 'SYSTEM_ADMIN';
};
