import { describe, expect, it } from 'vitest';
import { resolveProcurementPrice } from '../../components/features/ProcurementModule';

// 库存上只有一个「CTN」= 24 BTL（EK 的箱子）；AL 的箱子是 12 BTL
const beer = { id: 'BEER', name: '虎牌啤酒', category: 'RTD', unit: 'BTL', baseUnit: 'BTL', currentQty: 0, maxQty: 0, minLevel: 0, cost: 5, costPerBaseUnit: 5, isKeyItem: false,
    purchaseUnits: [{ id: 'supplier_ek', unitName: 'CTN', unitType: 'PURCHASE', toBaseRatio: 24, pricePerUnit: 120 }] } as any;
const al = { id: 'al', name: 'Tiger', unit: 'CTN', purchaseUnitName: 'CTN', toBaseRatio: 12, pricePerPurchaseUnit: 66, price: 66, category: 'RTD', uomOptions: [], linkedStockId: 'BEER' } as any;
const ek = { id: 'ek', name: 'Tiger', unit: 'CTN', purchaseUnitName: 'CTN', toBaseRatio: 24, pricePerPurchaseUnit: 120, price: 120, category: 'RTD', uomOptions: [], linkedStockId: 'BEER' } as any;

describe('采购价格：用供应商品项自己的包装', () => {
    it('AL 一箱 12 瓶：不会用库存上「CTN = 24」的换算', () => {
        const r = resolveProcurementPrice(beer, 'CTN', al);
        expect(r.purchaseToBaseRatio).toBe(12);
        expect(r.purchaseUnitPrice).toBe(66);
        expect(r.costPerBaseUnit).toBeCloseTo(5.5, 6);
    });
    it('EK 一箱 24 瓶', () => {
        const r = resolveProcurementPrice(beer, 'CTN', ek);
        expect(r.purchaseToBaseRatio).toBe(24);
        expect(r.costPerBaseUnit).toBeCloseTo(5, 6);
    });
    it('向 AL 改订单瓶：每瓶按 AL 的每瓶价', () => {
        const r = resolveProcurementPrice(beer, 'BTL', al);
        expect(r.purchaseToBaseRatio).toBe(1);
        expect(r.purchaseUnitPrice).toBeCloseTo(5.5, 6);
    });
});
