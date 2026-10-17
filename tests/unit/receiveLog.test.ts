import { describe, expect, it } from 'vitest';
import { buildReceiveLogs } from '../../utils/inventory/receiveLog';

describe('采购收货写库存记录', () => {
    const logs = buildReceiveLogs({
        poId: 'PO-1', supplierName: 'EK', staffName: 'BEN', date: '2026-10-18', timestamp: '2026-10-18T02:00:00Z',
        entries: [
            { area: 'KITCHEN', stockId: 'K1', stockName: '肉', unit: 'kg', oldQty: 5, receivedQty: 10, totalCost: 200, newAvgCost: 18 },
            { area: 'KITCHEN', stockId: 'K2', stockName: '菜', unit: 'kg', oldQty: 0, receivedQty: 3, totalCost: 10, newAvgCost: 3.3333 },
            { area: 'BAR', stockId: 'B1', stockName: '茶', unit: 'pkt', oldQty: 2, receivedQty: 4, totalCost: 48, newAvgCost: 11 },
            { area: 'BAR', stockId: 'B2', stockName: '没收到', unit: 'pkt', oldQty: 2, receivedQty: 0, totalCost: 0, newAvgCost: 1 },
        ],
    });

    it('按区域各一笔，id 固定（重复收货不会重复记录）', () => {
        expect(logs.map(l => l.id)).toEqual(['rcv_PO-1_KITCHEN', 'rcv_PO-1_BAR']);
        expect(logs.every(l => l.source === 'RECEIVE' && l.poId === 'PO-1' && l.supplierName === 'EK')).toBe(true);
    });
    it('每个品项：原数量、收货后数量、平均成本（与盘点同口径）、进货单价、金额', () => {
        expect(logs[0].items[0]).toEqual({ stockId: 'K1', stockName: '肉', oldQty: 5, newQty: 15, diff: 10, unit: 'kg', cost: 18, valueChange: 200, purchaseUnitCost: 20 });
        expect(logs[0].items[1].purchaseUnitCost).toBe(3.3333);
        expect(logs[0].totalValueChange).toBe(210);
    });
    it('没收到的品项不记录', () => {
        expect(logs[1].items.map(i => i.stockId)).toEqual(['B1']);
    });
});
