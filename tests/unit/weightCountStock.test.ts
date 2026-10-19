import { describe, expect, it } from 'vitest';
import { calculateReceivedLine, isWeightUnit, calculateWeightedAverageCost } from '../../utils/unitConversion';

// 2026-10-16 Miss Cute POS33136：非洲鱼按尾下单、按 kg 计价 RM20
const fish = { pricingMode: 'WEIGHT_BASED' as const, billByWeight: true, finalCost: 20, toBaseRatio: 0.8, orderUnit: '尾' };

describe('称重计价、库存按尾数', () => {
    it('库存单位是「尾」：库存加尾数，应付按重量，每尾成本 = 金额 ÷ 尾数', () => {
        const l = calculateReceivedLine({ ...fish, baseUnit: '尾', receivedQty: 8, receivedWeight: 6.9 });
        expect(l).toMatchObject({ countByPiece: true, receivedBaseQty: 8, weight: 6.9, finalLineTotal: 138 });
        expect(l.costPerBaseUnit).toBeCloseTo(17.25, 4);
    });

    it('整张单 38 尾 RM624：移动平均每尾 RM16.42', () => {
        const lines = [[8, 6.9], [7, 7.65], [10, 9.3], [13, 7.35]].map(([q, w]) => calculateReceivedLine({ ...fish, baseUnit: '尾', receivedQty: q, receivedWeight: w }));
        const qty = lines.reduce((n, l) => n + l.receivedBaseQty, 0);
        const total = lines.reduce((n, l) => n + l.finalLineTotal, 0);
        expect(qty).toBe(38);
        expect(total).toBe(624);
        const avg = calculateWeightedAverageCost({ oldQtyBase: 0, oldCostPerBaseUnit: 0, receivedQtyBase: qty, receivedTotalCost: total });
        expect(avg.newCostPerBaseUnit).toBeCloseTo(16.42, 2);
    });

    it('库存单位是 kg（或没有传库存单位）：照旧加重量', () => {
        expect(calculateReceivedLine({ ...fish, baseUnit: 'kg', receivedQty: 8, receivedWeight: 6.9 })).toMatchObject({ countByPiece: false, receivedBaseQty: 6.9, finalLineTotal: 138 });
        expect(calculateReceivedLine({ ...fish, receivedQty: 8, receivedWeight: 6.9 })).toMatchObject({ countByPiece: false, receivedBaseQty: 6.9 });
    });

    it('下单单位跟库存单位不同（1 箱 = 20 尾）：按换算比例', () => {
        expect(calculateReceivedLine({ ...fish, orderUnit: 'CTN', toBaseRatio: 20, baseUnit: '尾', receivedQty: 2, receivedWeight: 30 })).toMatchObject({ receivedBaseQty: 40, finalLineTotal: 600 });
    });

    it('不是称重品项：完全不受影响', () => {
        expect(calculateReceivedLine({ receivedQty: 2, finalCost: 30, toBaseRatio: 12, baseUnit: 'Btl' })).toMatchObject({ countByPiece: false, receivedBaseQty: 24, finalLineTotal: 60, weight: 0 });
    });

    it('重量单位判断', () => {
        ['kg', 'KG', 'g', 'gram', '斤', '公斤'].forEach(u => expect(isWeightUnit(u)).toBe(true));
        ['尾', 'pcs', 'Pcs', 'Btl', 'CTN', '', undefined].forEach(u => expect(isWeightUnit(u as any)).toBe(false));
    });
});
