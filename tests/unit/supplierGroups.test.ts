import { describe, expect, it } from 'vitest';
import { categoryShortLabel, outstandingBySupplier, supplierGroupOf } from '../../utils/supplier/supplierGroups';

describe('supplierGroups', () => {
    it('科目归类', () => {
        expect(supplierGroupOf('INGREDIENT_SEAFOOD')).toBe('SEAFOOD');
        expect(supplierGroupOf('INGREDIENT_MEAT')).toBe('MEAT');
        expect(supplierGroupOf('GAS_COGS')).toBe('FUEL');
        expect(supplierGroupOf('PACKAGING')).toBe('PACKAGING');
        expect(supplierGroupOf('MAINTENANCE')).toBe('CLEANING');
        expect(supplierGroupOf('BEVERAGE')).toBe('BAR');
        expect(supplierGroupOf('RENT')).toBe('OTHER');
        expect(supplierGroupOf(undefined)).toBe('OTHER');
    });
    it('科目中文短名', () => {
        expect(categoryShortLabel('INGREDIENT_SEAFOOD')).toBe('海鲜');
        expect(categoryShortLabel('GAS_COGS')).toBe('烹饪煤气');
        expect(categoryShortLabel('MAINTENANCE')).toBe('维修/保养/清洁');
        expect(categoryShortLabel('UNKNOWN_X')).toBe('UNKNOWN_X');
    });
    it('未付款按供应商名称加总，已付清不算', () => {
        const r = outstandingBySupplier([{ id: '8001', name: 'AL FROZEN' }, { id: '8002', name: 'EK FRESH' }], [
            { company: 'AL FROZEN', outstandingAmount: 100.5 }, { company: 'AL FROZEN', outstandingAmount: 20 },
            { company: 'EK FRESH', outstandingAmount: 0 }, { company: 'OTHER', outstandingAmount: 9 },
        ]);
        expect(r).toEqual({ '8001': 120.5 });
    });
});
