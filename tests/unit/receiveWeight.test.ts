import { describe, expect, it } from 'vitest';
import { appendWeightReceipt, findUnchangedWeights, unchangedWeightMessage, weightStats, weightStatsText } from '../../utils/inventory/receiveWeight';
import { applyReceivedPrices } from '../../utils/inventory/catalogPrices';
import type { CatalogItem } from '../../types';

const pork = { name: '花肉', billByWeight: true, orderQty: 1, receivedQty: 1, estimatedWeightPerUnit: 20 };

describe('findUnchangedWeights', () => {
    it('重量还是预估值（箱数 × 每箱预估）就列出', () => {
        expect(findUnchangedWeights([{ ...pork, receivedWeight: 20 }])).toEqual(['花肉']);
        expect(findUnchangedWeights([{ ...pork, orderQty: 2, receivedQty: 2, receivedWeight: 40 }])).toEqual(['花肉']);
        expect(findUnchangedWeights([{ ...pork, estimatedBaseQty: 21, receivedWeight: 21 }])).toEqual(['花肉']);
    });
    it('改过实际重量、不按重量计价、没收货的不列出', () => {
        expect(findUnchangedWeights([{ ...pork, receivedWeight: 19.38 }])).toEqual([]);
        expect(findUnchangedWeights([{ ...pork, billByWeight: false, receivedWeight: 20 }])).toEqual([]);
        expect(findUnchangedWeights([{ ...pork, receivedQty: 0, receivedWeight: 20 }])).toEqual([]);
        expect(findUnchangedWeights([{ ...pork, receivedWeight: 0 }])).toEqual([]);
    });
    it('提醒文字', () => {
        expect(unchangedWeightMessage([])).toBeNull();
        expect(unchangedWeightMessage(['花肉'])).toContain('花肉');
    });
});

describe('weightHistory', () => {
    it('新的在前、同一张采购单取代、最多 10 笔', () => {
        let h = appendWeightReceipt(undefined, { at: 'a', poId: 'PO1', packs: 1, weight: 19.38 });
        h = appendWeightReceipt(h, { at: 'b', poId: 'PO2', packs: 1, weight: 20.48 });
        h = appendWeightReceipt(h, { at: 'c', poId: 'PO2', packs: 1, weight: 20.5 });
        expect(h.map(x => x.weight)).toEqual([20.5, 19.38]);
        for (let i = 0; i < 15; i++) h = appendWeightReceipt(h, { at: String(i), poId: `X${i}`, packs: 1, weight: 20 });
        expect(h).toHaveLength(10);
    });
    it('每箱平均、最小、最大', () => {
        const s = weightStats([{ at: 'b', poId: '2', packs: 1, weight: 20.48 }, { at: 'a', poId: '1', packs: 2, weight: 38.76 }])!;
        expect(s).toMatchObject({ count: 2, minPerPack: 19.38, maxPerPack: 20.48, avgPerPack: 19.93, lastPerPack: 20.48 });
        expect(weightStats([])).toBeNull();
        expect(weightStatsText({ weightHistory: [{ at: 'a', poId: '1', packs: 1, weight: 19.38 }], orderUnit: 'CTN', billingUnit: 'kg', estimatedWeightPerUnit: 20 }))
            .toBe('最近 1 次每CTN 19.38 kg，平均 19.38 kg（预估 20）');
    });
    it('收货时只有称重品项记重量', () => {
        const catalog = [
            { id: 'w', name: '花肉', unit: 'CTN', price: 20, pricingMode: 'WEIGHT_BASED', pricePerBillingUnit: 20, billingUnit: 'kg' },
            { id: 'n', name: '鸡蛋', unit: 'tray', price: 12, toBaseRatio: 30 },
        ] as unknown as CatalogItem[];
        const { catalog: next } = applyReceivedPrices(catalog, [
            { catalogItemId: 'w', perBase: 20, at: 't', poId: 'PO1', packs: 1, weight: 19.38 },
            { catalogItemId: 'n', perBase: 0.4, at: 't', poId: 'PO1', packs: 1, weight: 5 },
        ]);
        expect(next[0].weightHistory).toEqual([{ at: 't', poId: 'PO1', packs: 1, weight: 19.38 }]);
        expect(next[1].weightHistory).toBeUndefined();
    });
});
