import { describe, expect, it } from 'vitest';
import { applyRelink, findSameNameCatalog, sameName } from '../../utils/inventory/sameNameSupply';
import type { Supplier } from '../../types';

describe('sameNameSupply', () => {
    it('名称比对：完全相同、只差格式、只看中文', () => {
        expect(sameName('碳 (Carbon)', '碳 (Carbon)')).toBe(true);
        expect(sameName('碳（Carbon）', '碳 (carbon)')).toBe(true);
        expect(sameName('碳', '碳 (Charcoal)')).toBe(true);
        expect(sameName('Arang Kayu', '碳 (Carbon)')).toBe(false);
        expect(sameName('', '碳')).toBe(false);
    });
    it('找出同名但没连到这个库存的品项（停售的不算）', () => {
        const sups = [{ id: 's', name: 'S', catalog: [
            { id: 'a', name: '碳 (Carbon)', linkedStockId: 'K_C' },
            { id: 'b', name: '碳 (Carbon)', linkedStockId: 'F_C' },
            { id: 'c', name: '碳', status: 'DISCONTINUED' },
            { id: 'd', name: '碳' },
        ] }] as unknown as Supplier[];
        expect(findSameNameCatalog({ id: 'F_C', name: '碳 (Carbon)' }, sups).map(r => r.item.id)).toEqual(['a', 'd']);
    });
    it('改连只改 linkedStockId，清掉旧的采购单位 ID，其他不动', () => {
        const out = applyRelink([
            { id: 'a', name: 'Arang', price: 40, linkedStockId: 'K_C', linkedPurchaseUnitId: 'pu1' },
            { id: 'b', name: 'X', linkedStockId: 'K_C' },
        ] as any, 'a', 'F_C');
        expect(out[0]).toEqual({ id: 'a', name: 'Arang', price: 40, linkedStockId: 'F_C' });
        expect(out[1].linkedStockId).toBe('K_C');
    });
});
