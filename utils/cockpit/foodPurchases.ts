// ============================================================================
// AI 经营顾问 · 食材明细（纯函数，只读）
// ----------------------------------------------------------------------------
// 来源：已收货的采购单（purchase_orders，status = RECEIVED）。收货时每一行都记了
//   finalLineTotal（这行实付）、receivedBaseQty（收到多少基础单位）、costPerBaseUnitAtReceive（单价）。
// 按收货日期（receivedAt，没有就用下单日期）归到月份；同一个库存品项合并。
// 单价 = 本月这个品项实付合计 ÷ 收到的基础单位合计；跟上个月同样算法比较。
// 没收货、没金额的行不算，不估计。
// ============================================================================
import type { PurchaseOrder } from '../../types';

export interface FoodLine {
    stockId: string;
    name: string;
    unit: string;
    spend: number;
    qty: number;
    /** 每基础单位单价；收到数量为 0 时为 null */
    unitPrice: number | null;
    /** 上个月同一品项的单价 */
    prevUnitPrice: number | null;
    /** 单价比上个月变化 %；上个月没买为 null */
    change: number | null;
    receipts: number;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const monthOf = (po: PurchaseOrder) => String(po.receivedAt || po.date || '').slice(0, 7);
const prevMonthOf = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const collect = (pos: PurchaseOrder[], month: string) => {
    const map = new Map<string, { name: string; unit: string; spend: number; qty: number; receipts: number }>();
    pos.filter(po => po.status === 'RECEIVED' && monthOf(po) === month).forEach(po => (po.items || []).forEach(it => {
        const spend = Number(it.finalLineTotal);
        if (!(spend > 0)) return;
        const key = String(it.stockId || it.name);
        const row = map.get(key) || { name: it.name, unit: it.baseUnit || it.unit || '', spend: 0, qty: 0, receipts: 0 };
        row.spend += spend;
        row.qty += Number(it.receivedBaseQty) > 0 ? Number(it.receivedBaseQty) : 0;
        row.receipts++;
        map.set(key, row);
    }));
    return map;
};

export const summarizeFoodPurchases = (pos: PurchaseOrder[], month: string) => {
    const now = collect(pos, month), prev = collect(pos, prevMonthOf(month));
    const unitPrice = (r: { spend: number; qty: number }) => r.qty > 0 ? r.spend / r.qty : null;
    const lines: FoodLine[] = [...now.entries()].map(([stockId, r]) => {
        const p = prev.get(stockId);
        const u = unitPrice(r), pu = p ? unitPrice(p) : null;
        return {
            stockId, name: r.name, unit: r.unit, spend: round(r.spend), qty: round(r.qty, 3),
            unitPrice: u === null ? null : round(u, 4), prevUnitPrice: pu === null ? null : round(pu, 4),
            change: u !== null && pu !== null && pu > 0 ? round((u - pu) / pu * 100, 1) : null,
            receipts: r.receipts,
        };
    }).sort((a, b) => b.spend - a.spend);
    return { lines, total: round(lines.reduce((s, l) => s + l.spend, 0)), receivedPos: pos.filter(po => po.status === 'RECEIVED' && monthOf(po) === month).length };
};
