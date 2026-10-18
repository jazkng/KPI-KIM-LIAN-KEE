import { beforeEach, describe, expect, it } from 'vitest';
import {
    areaOfCategory, moveStockAreaRegistration, registerStockArea, resetStockAreaRegistry, resolveStockArea, stockAreaConflicts, STOCK_AREAS,
} from '../../utils/inventory/stockArea';
import { CATEGORY_SECTIONS } from '../../components/features/inventory/inventoryConstants';
import { CATEGORY_MAP } from '../../components/features/supplier/supplierConstants';

beforeEach(() => resetStockAreaRegistry());

describe('areaOfCategory', () => {
    it('与库存模块的 CATEGORY_SECTIONS 一致', () => {
        for (const [area, sections] of Object.entries(CATEGORY_SECTIONS)) {
            if (!STOCK_AREAS.includes(area as any)) continue;
            sections.forEach(s => expect(areaOfCategory(s.id), s.id).toBe(area));
        }
    });

    it('与供应商模块的 CATEGORY_MAP 一致', () => {
        Object.entries(CATEGORY_MAP).forEach(([cat, area]) => expect(areaOfCategory(cat), cat).toBe(area));
    });

    it('区域名本身也认得（盘点任务存的是区域）', () => {
        expect(areaOfCategory('BAR')).toBe('BAR');
        expect(areaOfCategory('FUEL')).toBe('FUEL');
        expect(areaOfCategory('fuel')).toBe('FUEL');
    });

    it('认不得的分类返回 null，不默认厨房', () => {
        expect(areaOfCategory('UNKNOWN')).toBeNull();
        expect(areaOfCategory(undefined)).toBeNull();
        expect(areaOfCategory('')).toBeNull();
    });
});

describe('resolveStockArea', () => {
    it('不看 ID 前缀：K 开头但实际放在吧台的品项写回吧台', () => {
        registerStockArea('BAR', [{ id: 'K009' }]);
        expect(resolveStockArea({ id: 'K009', category: 'MEAT' })).toBe('BAR');
    });

    it('B 开头但没读过、分类是厨房的品项 → 厨房（旧逻辑会写进吧台）', () => {
        expect(resolveStockArea({ id: 'B_1712345678901', category: 'SEAFOOD' })).toBe('KITCHEN');
    });

    it('随机 ID 也按分类判断', () => {
        expect(resolveStockArea({ id: 'x8f2Kq', category: 'GAS' })).toBe('FUEL');
        expect(resolveStockArea({ id: 'x8f2Kq', category: 'PACKAGING' })).toBe('GENERAL');
    });

    it('没读过、分类也认不得 → null（呼叫端要停下来）', () => {
        expect(resolveStockArea({ id: 'S001', category: 'WHATEVER' })).toBeNull();
        expect(resolveStockArea(null)).toBeNull();
    });

    it('同一 ID 同时在两个区域（复制品）→ null，并列入冲突清单', () => {
        registerStockArea('KITCHEN', [{ id: 'K001' }, { id: 'K002' }]);
        registerStockArea('BAR', [{ id: 'K001' }]);
        expect(resolveStockArea({ id: 'K001', category: 'MEAT' })).toBeNull();
        expect(resolveStockArea({ id: 'K002', category: 'TEA' })).toBe('KITCHEN');
        expect(stockAreaConflicts()).toEqual([{ id: 'K001', areas: ['KITCHEN', 'BAR'] }]);
    });

    it('重复读取同一区域不算冲突', () => {
        registerStockArea('FUEL', [{ id: 'F1' }]);
        registerStockArea('FUEL', [{ id: 'F1' }]);
        expect(stockAreaConflicts()).toEqual([]);
        expect(resolveStockArea({ id: 'F1' })).toBe('FUEL');
    });
});

describe('moveStockAreaRegistration', () => {
    it('移动后写到新区域，旧区域不算冲突', () => {
        resetStockAreaRegistry();
        registerStockArea('KITCHEN', [{ id: 'OIL' }]);
        registerStockArea('FUEL', [{ id: 'OIL' }]);
        expect(resolveStockArea({ id: 'OIL' })).toBeNull();
        moveStockAreaRegistration('OIL', 'FUEL');
        expect(resolveStockArea({ id: 'OIL' })).toBe('FUEL');
        expect(stockAreaConflicts()).toEqual([]);
    });
});
