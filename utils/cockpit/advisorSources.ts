// AI 经营顾问的额外资料（只读）：供应商目录（最近进价）、本月班表上班人数、采购单（食材明细）。
// 打开顾问时才读；读失败就不显示那张图，不影响其他部分。
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { PurchaseOrder, Supplier } from '../../types';
import { DataManager } from '../dataManager';
import { countWorkersByDate } from '../hr/hrOverview';

export interface AdvisorSources { suppliers?: Supplier[]; workers?: Record<string, number>; purchaseOrders?: PurchaseOrder[] }

export const loadAdvisorSources = async (month: string, opts: { suppliers: boolean; roster: boolean; purchases: boolean }): Promise<AdvisorSources> => {
    const [suppliers, workers, purchaseOrders] = await Promise.allSettled([
        opts.suppliers ? DataManager.getSuppliers() : Promise.resolve(undefined),
        opts.roster ? (async () => {
            // 只读 roster_months 这个月的文件（不用 getRosterData，那个遇到旧资料会顺手写入迁移）
            const [snap, employees] = await Promise.all([getDoc(doc(db, 'roster_months', month)), DataManager.getEmployees()]);
            return snap.exists() ? countWorkersByDate(snap.data().roster || {}, employees) : undefined;
        })() : Promise.resolve(undefined),
        // 最近 200 张采购单（按日期新到旧），够涵盖本月与上个月
        opts.purchases ? DataManager.getPurchaseOrders() : Promise.resolve(undefined),
    ]);
    return {
        suppliers: suppliers.status === 'fulfilled' ? suppliers.value : undefined,
        workers: workers.status === 'fulfilled' ? workers.value : undefined,
        purchaseOrders: purchaseOrders.status === 'fulfilled' ? purchaseOrders.value : undefined,
    };
};
