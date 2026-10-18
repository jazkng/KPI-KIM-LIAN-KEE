import { describe, expect, it } from 'vitest';
import { catalogPerBaseCost, cheapestOption, listSupplyOptions, pickDefaultSupply, pickSupplyForSupplier } from '../../utils/inventory/supplyOptions';

const cat = (id: string, o: Record<string, any>) => ({ id, name: id, unit: 'CTN', price: 0, category: 'X', uomOptions: [], linkedStockId: 'BEER', ...o }) as any;
const sup = (id: string, catalog: any[]) => ({ id, name: id, catalog }) as any;

const suppliers = [
    sup('AL', [cat('al_ctn', { purchaseUnitName: 'CTN', toBaseRatio: 12, pricePerPurchaseUnit: 66 })]),           // 5.50 / BTL
    sup('EK', [
        cat('ek_ctn', { purchaseUnitName: 'CTN', toBaseRatio: 24, pricePerPurchaseUnit: 120 }),                  // 5.00 / BTL
        cat('ek_btl', { purchaseUnitName: 'BTL', toBaseRatio: 1, price: 6.2 }),                                  // 6.20 / BTL
    ]),
    sup('OLD', [cat('old', { toBaseRatio: 24, pricePerPurchaseUnit: 10, status: 'DISCONTINUED' })]),           // 停售，再便宜也不算
    sup('X', [cat('other', { linkedStockId: 'OTHER', toBaseRatio: 1, price: 1 })]),
];

describe('一样东西多个供应商', () => {
    it('列出所有连到这个商品、还在卖的品项（同一家多个包装都列）', () => {
        const o = listSupplyOptions({ id: 'BEER' }, suppliers);
        expect(o.map(x => x.catalogItem.id)).toEqual(['al_ctn', 'ek_ctn', 'ek_btl']);
        expect(o.map(x => x.perBase)).toEqual([5.5, 5, 6.2]);
        expect(o[0]).toMatchObject({ packRatio: 12, packPrice: 66, packUnit: 'CTN' });
    });
    it('包装同名「CTN」但大小不同：各自用自己的换算，不会互相盖掉', () => {
        const o = listSupplyOptions({ id: 'BEER' }, suppliers);
        expect(o.find(x => x.catalogItem.id === 'al_ctn')!.packRatio).toBe(12);
        expect(o.find(x => x.catalogItem.id === 'ek_ctn')!.packRatio).toBe(24);
    });
    it('默认：没设常用 → 每基础单位最便宜', () => {
        expect(pickDefaultSupply(listSupplyOptions({ id: 'BEER' }, suppliers))!.catalogItem.id).toBe('ek_ctn');
    });
    it('默认：有常用 → 用常用（即使比较贵）', () => {
        const o = listSupplyOptions({ id: 'BEER', preferredSupply: { supplierId: 'AL', catalogItemId: 'al_ctn' } }, suppliers);
        expect(pickDefaultSupply(o)!.catalogItem.id).toBe('al_ctn');
        expect(cheapestOption(o)!.catalogItem.id).toBe('ek_ctn');
    });
    it('指定供应商：用那一家；指定包装就用那个包装', () => {
        const o = listSupplyOptions({ id: 'BEER' }, suppliers);
        expect(pickSupplyForSupplier(o, 'EK')!.catalogItem.id).toBe('ek_ctn');
        expect(pickSupplyForSupplier(o, 'EK', 'ek_btl')!.catalogItem.id).toBe('ek_btl');
        expect(pickSupplyForSupplier(o, 'AL')!.catalogItem.id).toBe('al_ctn');
        expect(pickSupplyForSupplier(o, 'NOPE')).toBeNull();
    });
    it('称重商品：每基础单位价 = 每计价单位价', () => {
        expect(catalogPerBaseCost(cat('w', { pricingMode: 'WEIGHT_BASED', pricePerBillingUnit: 18 }))).toBe(18);
    });
    it('没价格：排在后面，全部没价格时取第一个', () => {
        const o = listSupplyOptions({ id: 'BEER' }, [sup('A', [cat('a', { toBaseRatio: 1 })]), sup('B', [cat('b', { toBaseRatio: 1 })])]);
        expect(o.map(x => x.perBase)).toEqual([null, null]);
        expect(pickDefaultSupply(o)!.catalogItem.id).toBe('a');
    });
});
