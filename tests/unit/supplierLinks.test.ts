import { describe, expect, it } from 'vitest';
import { applyStockDeletionToCatalog, findLinkedCatalogItems } from '../../utils/inventory/supplierLinks';

const cat = (id: string, linkedStockId?: string, extra = {}) => ({ id, name: id, unit: 'kg', price: 1, category: 'X', uomOptions: [], ...(linkedStockId ? { linkedStockId, linkedPurchaseUnitId: 'pu1' } : {}), ...extra }) as any;

describe('删除库存商品时处理供应商品项', () => {
    const catalog = [cat('a', 'K1'), cat('b', 'K2'), cat('c', 'K1', { price: 9 }), cat('d')];

    it('找出所有连到这个商品的品项（跨供应商）', () => {
        const refs = findLinkedCatalogItems([{ id: 's1', name: 'EK', catalog }, { id: 's2', name: 'AL', catalog: [cat('x', 'K1')] }], 'K1');
        expect(refs.map(r => `${r.supplierName}:${r.itemId}`)).toEqual(['EK:a', 'EK:c', 'AL:x']);
    });
    it('解除连结：保留品项，去掉连结与采购单位，其他资料不变', () => {
        const r = applyStockDeletionToCatalog(catalog, 'K1', 'UNLINK');
        expect(r.changed).toBe(2);
        expect(r.catalog.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(r.catalog[0].linkedStockId).toBeUndefined();
        expect((r.catalog[0] as any).linkedPurchaseUnitId).toBeUndefined();
        expect(r.catalog[2].price).toBe(9);
        expect(r.catalog[1]).toEqual(catalog[1]);
    });
    it('一起删除：只删连到这个商品的品项', () => {
        const r = applyStockDeletionToCatalog(catalog, 'K1', 'DELETE_ITEM');
        expect(r.catalog.map(c => c.id)).toEqual(['b', 'd']);
        expect(r.changed).toBe(2);
    });
    it('改连结到另一个商品', () => {
        const r = applyStockDeletionToCatalog(catalog, 'K1', 'RELINK', 'K9');
        expect(r.catalog.filter(c => c.linkedStockId === 'K9').map(c => c.id)).toEqual(['a', 'c']);
        expect(() => applyStockDeletionToCatalog(catalog, 'K1', 'RELINK')).toThrow();
        expect(() => applyStockDeletionToCatalog(catalog, 'K1', 'RELINK', 'K1')).toThrow();
    });
    it('没有连结的供应商：不变', () => {
        expect(applyStockDeletionToCatalog([cat('b', 'K2')], 'K1', 'DELETE_ITEM').changed).toBe(0);
    });
});
