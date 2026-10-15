// ============================================================================
// 盈亏对账 · 浏览器端资料读取（只读）
// 沿用驾驶舱的 DataManager 资料来源（日结、支出一律向伺服器读取），另加固定账单设定。
// ============================================================================
import { DataManager } from '../../dataManager';
import { browserCockpitSource } from '../../cockpit/loadCockpit';
import { reconcileMonth, type MonthReconciliation, type ReconSource } from './reconcileMonth';

const TIMEOUT_MS = 45000;

const browserReconSource: ReconSource = {
    ...browserCockpitSource,
    getRecurringBills: () => DataManager.getRecurringBills(),
};

export const loadReconciliation = (month: string, today: string): Promise<MonthReconciliation> =>
    Promise.race([
        reconcileMonth(browserReconSource, month, today),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('读取逾时，请检查网络')), TIMEOUT_MS)),
    ]);
