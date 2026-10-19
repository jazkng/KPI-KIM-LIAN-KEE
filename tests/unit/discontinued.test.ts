import { describe, expect, it } from 'vitest';
import { getStockStatus, needsReplenishment, isDiscontinued } from '../../utils/unitConversion';

describe('停订材料', () => {
    const empty = { currentQtyBase: 0, minLevelBase: 5 };
    it('没停订：0 库存 = 无货、要补货', () => {
        expect(getStockStatus(empty)).toBe('OUT_OF_STOCK');
        expect(needsReplenishment(empty)).toBe(true);
    });
    it('停订：不算无货 / 低库存，不提醒补货', () => {
        const d = { ...empty, discontinued: true };
        expect(isDiscontinued(d)).toBe(true);
        expect(getStockStatus(d)).toBe('NORMAL');
        expect(needsReplenishment(d)).toBe(false);
        expect(getStockStatus({ currentQtyBase: 2, minLevelBase: 5, discontinued: true })).toBe('NORMAL');
    });
    it('取消停订（false）就恢复正常判断', () => {
        expect(getStockStatus({ ...empty, discontinued: false })).toBe('OUT_OF_STOCK');
    });
});
