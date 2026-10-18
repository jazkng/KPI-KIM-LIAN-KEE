import { describe, expect, it } from 'vitest';
import { buildSupplierPriceReport } from '../../utils/inventory/supplierPriceReport';

const stock = (id: string, extra = {}) => ({ area: 'BAR' as const, item: { id, name: id, baseUnit: 'BTL', ...extra } as any });
const sup = (id: string, catalog: any[]) => ({ id, name: id, catalog }) as any;
const suppliers = [
    sup('EK', [{ id: 'ek', name: 'T24', linkedStockId: 'BEER', toBaseRatio: 24, price: 120, priceUpdatedAt: '2026-06-01T00:00:00Z' }]),
    sup('AL', [{ id: 'al', name: 'T12', linkedStockId: 'BEER', toBaseRatio: 12, price: 57 }, { id: 'tea', name: '茶', linkedStockId: 'TEA', toBaseRatio: 1, price: 3 }]),
];

describe('供应商比价总表', () => {
    const rows = buildSupplierPriceReport([stock('BEER', { preferredSupply: { supplierId: 'EK', catalogItemId: 'ek' } }), stock('TEA'), stock('NONE')], suppliers);
    it('只列有供应商的商品；价差大的排前面', () => {
        expect(rows.map(r => r.stockId)).toEqual(['BEER', 'TEA']);
    });
    it('最便宜、最贵、价差、常用多付多少', () => {
        expect(rows[0]).toMatchObject({
            supplierCount: 2, packCount: 2,
            cheapest: { supplier: 'AL', perBase: 4.75 }, priciest: { supplier: 'EK', perBase: 5 },
            spreadPct: 5.3, preferred: { supplier: 'EK', perBase: 5 }, preferredIsCheapest: false, preferredExtraPerBase: 0.25,
            oldestPriceUpdate: '2026-06-01',
        });
    });
    it('只有一家：没有价差', () => {
        expect(rows[1]).toMatchObject({ supplierCount: 1, spreadPct: null, preferredIsCheapest: null });
    });
});
