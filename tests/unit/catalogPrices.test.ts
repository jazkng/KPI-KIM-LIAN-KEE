import { describe, expect, it } from 'vitest';
import { applyCatalogPriceUpdates, applyReceivedPrices, priceDiffMessage } from '../../utils/inventory/catalogPrices';

const ctn = { id: 'ctn', name: 'Tiger 24', unit: 'CTN', purchaseUnitName: 'CTN', toBaseRatio: 24, price: 120, pricePerPurchaseUnit: 120, category: 'RTD', uomOptions: [] } as any;   // 5.00 / BTL
const kg = { id: 'kg', name: '猪肉', unit: 'kg', pricingMode: 'WEIGHT_BASED', billingUnit: 'kg', pricePerBillingUnit: 18, price: 18, category: 'MEAT', uomOptions: [] } as any;
const other = { id: 'x', name: '别的', unit: 'pkt', toBaseRatio: 1, price: 3, category: 'X', uomOptions: [] } as any;

describe('收货写最近进价', () => {
    it('每个品项记最近进价（每包装、每基础单位、日期、单号），其他品项不动', () => {
        const r = applyReceivedPrices([ctn, kg, other], [
            { catalogItemId: 'ctn', perBase: 5.1, at: '2026-10-18T02:00:00Z', poId: 'PO1' },
            { catalogItemId: 'kg', perBase: 18, at: '2026-10-18T02:00:00Z', poId: 'PO1' },
        ]);
        expect(r.catalog[0]).toMatchObject({ lastReceivedPrice: 122.4, lastReceivedPricePerBase: 5.1, lastReceivedPoId: 'PO1', price: 120 });
        expect(r.catalog[1]).toMatchObject({ lastReceivedPrice: 18, lastReceivedPricePerBase: 18 });
        expect(r.catalog[2]).toBe(other);
    });
    it('差 2%：不提醒；差 10%：提醒，目录价不自动改', () => {
        expect(applyReceivedPrices([ctn], [{ catalogItemId: 'ctn', perBase: 5.1, at: 't', poId: 'P' }]).diffs).toEqual([]);
        const r = applyReceivedPrices([ctn], [{ catalogItemId: 'ctn', perBase: 5.5, at: 't', poId: 'P' }]);
        expect(r.diffs).toEqual([{ catalogItemId: 'ctn', name: 'Tiger 24', unit: 'CTN', catalogPerBase: 5, receivedPerBase: 5.5, pct: 10, newPackPrice: 132 }]);
        expect(r.catalog[0].price).toBe(120);
        expect(priceDiffMessage('EK', r.diffs)).toContain('新目录价 RM 132.00 / CTN');
    });
    it('同意更新：改目录价并写价格更新日期', () => {
        const r = applyReceivedPrices([ctn, kg], [{ catalogItemId: 'ctn', perBase: 5.5, at: 't', poId: 'P' }, { catalogItemId: 'kg', perBase: 20, at: 't', poId: 'P' }]);
        const updated = applyCatalogPriceUpdates(r.catalog, r.diffs, '2026-10-18');
        expect(updated[0]).toMatchObject({ price: 132, pricePerPurchaseUnit: 132, costPerBaseUnit: 5.5, priceUpdatedAt: '2026-10-18' });
        expect(updated[1]).toMatchObject({ pricePerBillingUnit: 20, price: 20, priceUpdatedAt: '2026-10-18' });
    });
});
