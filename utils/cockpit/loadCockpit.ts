// ============================================================================
// 老板经营驾驶舱 · 浏览器端资料读取（只读）
// 计算逻辑在 cockpitLoader.ts；这里只提供 DataManager 作为资料来源，并加上逾时。
// 薪资、员工沿用 DataManager 既有的快取；不读整个日结 / 支出集合，不写入任何资料。
// ============================================================================
import { DataManager } from '../dataManager';
import type { CockpitResult } from './cockpitMetrics';
import { loadCockpitWith, loadParentBillsWith, type CockpitDataSource } from './cockpitLoader';
import type { Period } from './periods';

const TIMEOUT_MS = 25000;

/** 读取逾时就报错，不让画面无限转圈 */
const withTimeout = <T,>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('读取逾时，请检查网络')), ms)),
    ]);

export const browserCockpitSource: CockpitDataSource = {
    getPnLRawRange: (start, end) => DataManager.getPnLRawRange(start, end),
    getEmployees: () => DataManager.getEmployees(),
    getPayrollRecords: () => DataManager.getPayrollRecords(),
    getAttendanceReviewsByMonth: month => DataManager.getAttendanceReviewsByMonth(month),
    getStandaloneExpensesByIds: ids => DataManager.getStandaloneExpensesByIds(ids),
    getRecurringBills: () => DataManager.getRecurringBills(),
};

/** 分期付款列对应的原账单（期间外的才另外读取） */
export const loadParentBills = (expenses: { id?: string }[], accountingMode: 'ACCRUAL' | 'CASH') =>
    loadParentBillsWith(browserCockpitSource, expenses, accountingMode);

export const loadCockpit = (
    period: Period,
    today: string,
    accountingMode: 'ACCRUAL' | 'CASH' = 'ACCRUAL',
): Promise<CockpitResult> => withTimeout(loadCockpitWith(browserCockpitSource, period, today, accountingMode));
