import { describe, expect, it } from 'vitest';
import { getStockStatus, needsReplenishment, isDiscontinued, applyReceivedStock, isConsumeOnReceive } from '../../utils/unitConversion';
import { buildReceiveLogs } from '../../utils/inventory/receiveLog';

describe('停订材料', () => {
    const empty = { currentQtyBase: 0, minLevelBase: 5 };
    it('没停订：0 库存 = 无货、要补货', () => {
        expect(getStockStatus(empty)).toBe('OUT_OF_STOCK');
        expect(needsReplenishment(empty)).toBe(true);
    });
    it('停订：不算无货 / 低库存，不提醒补货', () => {
        const d = { ...empty, discontinued: true };
        expect(isDiscontinued(d)).toBe(true);
        expect(getStockStatus(d)).toBe('NORMAL');
        expect(needsReplenishment(d)).toBe(false);
        expect(getStockStatus({ currentQtyBase: 2, minLevelBase: 5, discontinued: true })).toBe('NORMAL');
    });
    it('取消停订（false）就恢复正常判断', () => {
        expect(getStockStatus({ ...empty, discontinued: false })).toBe('OUT_OF_STOCK');
    });
});

describe('当天用完（不计库存）', () => {
    const ice = { id: 'ICE', currentQtyBase: 0, costPerBaseUnit: 2, minLevel: 5, minLevelBase: 5, consumeOnReceive: true };
    it('不提醒补货、不算无货', () => {
        expect(isConsumeOnReceive(ice)).toBe(true);
        expect(getStockStatus(ice)).toBe('NORMAL');
        expect(needsReplenishment(ice)).toBe(false);
    });
    it('收货：数量不变，每单位成本改成这次进价', () => {
        expect(applyReceivedStock(ice, 10, 25)).toEqual({ newQtyBase: 0, newCostPerBaseUnit: 2.5, diff: 0 });
        expect(applyReceivedStock({ ...ice, currentQtyBase: 3 }, 10, 25).newQtyBase).toBe(3);
        expect(applyReceivedStock(ice, 0, 0).newCostPerBaseUnit).toBe(2);
    });
    it('一般商品：数量相加、移动平均成本', () => {
        expect(applyReceivedStock({ currentQtyBase: 10, costPerBaseUnit: 2 }, 10, 30)).toEqual({ newQtyBase: 20, newCostPerBaseUnit: 2.5, diff: 10 });
    });
    it('收货记录：留下收了多少、花多少钱，库存数量与估值不变', () => {
        const [log] = buildReceiveLogs({
            poId: 'PO1', supplierName: 'S', staffName: 'A', date: '2026-10-19', timestamp: 't',
            entries: [{ area: 'KITCHEN', stockId: 'ICE', stockName: '冰块', unit: 'Bag', oldQty: 0, receivedQty: 10, totalCost: 25, newAvgCost: 2.5, consumed: true }],
        });
        expect(log.items[0]).toMatchObject({ oldQty: 0, newQty: 0, diff: 0, valueChange: 0, purchaseUnitCost: 2.5, consumedQty: 10, consumedCost: 25 });
        expect(log.totalValueChange).toBe(0);
    });
});
