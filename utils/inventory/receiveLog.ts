// ============================================================================
// 采购收货 → 库存记录（inventory_logs）与价格记录（stock_price_history）
// ----------------------------------------------------------------------------
// 以前只有盘点会写库存记录，收货不留记录：事后查不到哪天进了多少、什么价钱，
// 价格监控也只看得到盘点时的平均成本。现在每张采购单收货后，按区域写一笔记录：
//   id = rcv_{采购单号}_{区域}（同一张单重复收货会覆盖同一笔，不会重复）
//   每个品项：原数量、收货后数量、收货数量、收货后的平均成本、这次的进货单价、这次金额
// cost 写「收货后的平均成本」，与盘点记录同口径：价格记录（由 cost 产生）才不会在
// 平均成本与进货单价之间来回跳。实际进货单价另存在 purchaseUnitCost。
// ============================================================================

import type { InventoryLog } from '../../types';
import type { StockArea } from './stockArea';

export interface ReceiveEntry {
    area: StockArea;
    stockId: string;
    stockName: string;
    unit: string;
    oldQty: number;       // 收货前的基础单位数量
    receivedQty: number;  // 这次收到的基础单位数量
    totalCost: number;    // 这次收货的金额（RM）
    newAvgCost: number;   // 收货后的平均成本（每基础单位）
    /** 当天用完（不计库存）：库存数量不变，记录照样留下收了多少、花多少钱 */
    consumed?: boolean;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export const buildReceiveLogs = (args: {
    poId: string;
    supplierName: string;
    staffName: string;
    date: string;        // 营业日 YYYY-MM-DD（马来西亚）
    timestamp: string;
    entries: ReceiveEntry[];
}): InventoryLog[] => {
    const byArea = new Map<StockArea, ReceiveEntry[]>();
    args.entries.filter(e => e.receivedQty > 0).forEach(e => byArea.set(e.area, [...(byArea.get(e.area) || []), e]));
    return [...byArea.entries()].map(([area, entries]) => {
        const items = entries.map(e => ({
            stockId: e.stockId,
            stockName: e.stockName,
            oldQty: round(e.oldQty),
            newQty: round(e.consumed ? e.oldQty : e.oldQty + e.receivedQty),
            diff: e.consumed ? 0 : round(e.receivedQty),
            unit: e.unit,
            cost: round(e.newAvgCost),
            // 当天用完：钱当天就算费用，库存估值不变
            valueChange: e.consumed ? 0 : round(e.totalCost, 2),
            purchaseUnitCost: round(e.totalCost / e.receivedQty),
            ...(e.consumed ? { consumedQty: round(e.receivedQty), consumedCost: round(e.totalCost, 2) } : {}),
        }));
        return {
            id: `rcv_${args.poId}_${area}`,
            date: args.date,
            timestamp: args.timestamp,
            staffName: args.staffName,
            totalValueChange: round(items.reduce((s, i) => s + i.valueChange, 0), 2),
            items,
            category: area,
            source: 'RECEIVE' as const,
            poId: args.poId,
            supplierName: args.supplierName,
        };
    });
};
