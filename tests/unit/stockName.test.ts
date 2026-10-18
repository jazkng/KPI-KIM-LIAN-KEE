import { describe, expect, it } from 'vitest';
import { splitStockName } from '../../utils/inventory/stockName';

describe('splitStockName', () => {
    it('中文 (English) 拆两行', () => {
        expect(splitStockName('洗布水 (Towel Detergent)')).toEqual({ primary: '洗布水', secondary: 'Towel Detergent' });
        expect(splitStockName('抹桌液（Disinfectant）')).toEqual({ primary: '抹桌液', secondary: 'Disinfectant' });
        expect(splitStockName('洗碗液 (Dish Soap)(A)')).toEqual({ primary: '洗碗液', secondary: '(Dish Soap)(A)' });
        expect(splitStockName('洗手液')).toEqual({ primary: '洗手液', secondary: '' });
        expect(splitStockName('(Only English)')).toEqual({ primary: '(Only English)', secondary: '' });
    });
});

import { isTrivialConversion } from '../../utils/inventory/stockName';
describe('isTrivialConversion', () => {
    it('同单位且比例 1 才算重复', () => {
        expect(isTrivialConversion('Bottle', 1, 'bottle')).toBe(true);
        expect(isTrivialConversion('CTN', 24, 'BTL')).toBe(false);
        expect(isTrivialConversion('Bottle', 2, 'Bottle')).toBe(false);
        expect(isTrivialConversion('Bag', 1, 'kg')).toBe(false);
    });
});
