import { describe, expect, it } from 'vitest';
import { summarizeUnitSetup } from '../../utils/inventory/unitSetupSummary';

describe('summarizeUnitSetup', () => {
    it('花肉：KG 记录、按箱盘点、按箱买每次称重', () => {
        const s = summarizeUnitSetup({
            baseUnit: 'KG', displayUnit: 'CTN', displayToBaseRatio: 20, preferredStockViewUnit: 'DISPLAY',
            purchaseUnits: [{ id: 'p', unitName: 'CTN', unitType: 'PURCHASE', toBaseRatio: 20, pricePerUnit: 400, conversionMode: 'ACTUAL_WEIGHT', isDefaultPurchase: true }],
        });
        expect(s.stock).toContain('KG');
        expect(s.count).toBe('盘点时按 CTN 数：1 CTN = 20 KG（输入 2 CTN 会存成 40 KG）。');
        expect(s.purchases[0]).toBe('【默认】按 CTN 买，每次收货称实际重量（预估 1 CTN ≈ 20 KG），报价 RM 400 / CTN ≈ 每 KG RM 20。');
        expect(s.warnings).toEqual([]);
    });
    it('啤酒：直接数瓶、整箱固定 24 瓶', () => {
        const s = summarizeUnitSetup({
            baseUnit: 'BTL', preferredStockViewUnit: 'BASE',
            purchaseUnits: [{ id: 'p', unitName: 'CTN', unitType: 'PURCHASE', toBaseRatio: 24, pricePerUnit: 120 }],
        });
        expect(s.count).toBe('盘点时直接数 BTL。');
        expect(s.purchases[0]).toBe('按 CTN 买：1 CTN = 24 BTL，RM 120 / CTN ≈ 每 BTL RM 5。');
    });
    it('漏填的地方列成提醒', () => {
        const s = summarizeUnitSetup({
            baseUnit: 'pcs', displayUnit: 'tray', displayToBaseRatio: 0, preferredStockViewUnit: 'DISPLAY',
            purchaseUnits: [
                { id: 'a', unitName: '', unitType: 'PURCHASE', toBaseRatio: 0 },
                { id: 'b', unitName: 'box', unitType: 'PURCHASE', toBaseRatio: 10, pricePerUnit: 0 },
            ],
        });
        expect(s.warnings.join('|')).toContain('每 1 tray 包含多少 pcs');
        expect(s.warnings.join('|')).toContain('没有名称');
        expect(s.warnings.join('|')).toContain('没有设定哪一个是「默认」');
        expect(s.purchases[1]).toContain('还没填价格');
        expect(summarizeUnitSetup({ baseUnit: 'kg' }).purchases[0]).toContain('直接按 kg 买');
    });
});
