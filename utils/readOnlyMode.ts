import { Employee } from '../types';

/**
 * 只读模式 (Read-only Access)
 * ---------------------------------------------------------------
 * 用途：让会计等外部／非决策人员可以查看财务模块，但不能新增、
 * 修改或删除任何资料。
 *
 * ⚠️ 重要限制：这是**前端 UI 层**的防护。
 * 目前 firestore.rules 只检查「是否已登入」，没有角色概念
 * （见 firestore.rules 的 signedIn()），所以懂技术的人仍可绕过。
 * 若要真正锁死，需要 Phase 2 的 Firebase custom claims。
 */

let readOnlyActive = false;

/** 由 App.tsx 在登入／员工资料同步时调用 */
export const syncReadOnlyMode = (employee?: Employee | null): void => {
    readOnlyActive = !!employee?.readOnlyAccess;
};

/** 当前登入者是否处于只读模式 */
export const isReadOnlyMode = (): boolean => readOnlyActive;

/**
 * 写入前的守卫。
 * @returns true = 允许继续；false = 已被拦截（并已提示使用者）
 *
 * 用法：
 *   if (!guardWrite('删除账单')) return;
 */
export const guardWrite = (actionLabel = '此操作'): boolean => {
    if (!readOnlyActive) return true;
    if (typeof window !== 'undefined') {
        window.alert(
            `🔒 只读模式\n\n你的帐号只能查看资料，无法执行「${actionLabel}」。\n\n如需修改权限，请联系老板。`
        );
    }
    return false;
};
