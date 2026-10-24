import { readRawCostStock } from '../inventory/costSource';
import { buildStockCostRows, type StockCostRow } from '../inventory/costSnapshot';
// AI 经营顾问的额外资料（只读）：供应商目录（最近进价）、本月班表上班人数、采购单（食材明细）。
// 打开顾问时才读；读失败就不显示那张图，不影响其他部分。
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { PurchaseOrder, Supplier } from '../../types';
import { DataManager } from '../dataManager';
import { countWorkersByDate } from '../hr/hrOverview';

export interface AdvisorSources { suppliers?: Supplier[]; workers?: Record<string, number>; purchaseOrders?: PurchaseOrder[]; inventory?: StockCostRow[]; inventoryError?: string }

export const loadAdvisorSources = async (month: string, opts: { suppliers: boolean; roster: boolean; purchases: boolean; inventory?: boolean }): Promise<AdvisorSources> => {
    const [suppliers, workers, purchaseOrders, inventory] = await Promise.allSettled([
        opts.suppliers ? DataManager.getSuppliers() : Promise.resolve(undefined),
        opts.roster ? (async () => {
            // 只读 roster_months 这个月的文件（不用 getRosterData，那个遇到旧资料会顺手写入迁移）
            const [snap, employees] = await Promise.all([getDoc(doc(db, 'roster_months', month)), DataManager.getEmployees()]);
            return snap.exists() ? countWorkersByDate(snap.data().roster || {}, employees) : undefined;
        })() : Promise.resolve(undefined),
        // 最近 200 张采购单（按日期新到旧），够涵盖本月与上个月
        opts.purchases ? DataManager.getPurchaseOrders() : Promise.resolve(undefined),
        opts.inventory ? Promise.all([readRawCostStock(db), DataManager.getRecentPriceChanges()]) : Promise.resolve(undefined),
    ]);
    const supplierRows = suppliers.status === 'fulfilled' ? suppliers.value : undefined;
    return {
        suppliers: suppliers.status === 'fulfilled' ? suppliers.value : undefined,
        workers: workers.status === 'fulfilled' ? workers.value : undefined,
        inventory: inventory.status === 'fulfilled' && inventory.value ? buildStockCostRows(inventory.value[0], inventory.value[1], supplierRows) : undefined,
        inventoryError: opts.inventory && inventory.status === 'rejected' ? '库存成本来源读取失败，未纳入本次回答。' : undefined,
        purchaseOrders: purchaseOrders.status === 'fulfilled' ? purchaseOrders.value : undefined,
    };
};
