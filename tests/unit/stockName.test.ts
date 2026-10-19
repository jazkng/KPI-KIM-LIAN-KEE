import { describe, expect, it } from 'vitest';
import { splitStockName, chineseFirstName, stockNameLines } from '../../utils/inventory/stockName';

describe('splitStockName', () => {
    it('中文 (English) 拆两行', () => {
        expect(splitStockName('洗布水 (Towel Detergent)')).toEqual({ primary: '洗布水', secondary: 'Towel Detergent' });
        expect(splitStockName('抹桌液（Disinfectant）')).toEqual({ primary: '抹桌液', secondary: 'Disinfectant' });
        expect(splitStockName('洗碗液 (Dish Soap)(A)')).toEqual({ primary: '洗碗液', secondary: '(Dish Soap)(A)' });
        expect(splitStockName('洗手液')).toEqual({ primary: '洗手液', secondary: '' });
        expect(splitStockName('(Only English)')).toEqual({ primary: '(Only English)', secondary: '' });
        // 全英文：括号是名称的一部分，不拆
        expect(splitStockName('Plastic bag (30GG)')).toEqual({ primary: 'Plastic bag (30GG)', secondary: '' });
        expect(splitStockName('打包纸20X20 (Packing plastic20X20)')).toEqual({ primary: '打包纸20X20', secondary: 'Packing plastic20X20' });
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

describe('chineseFirstName（采购单）', () => {
  it('puts the Chinese line first', () => {
    expect(chineseFirstName('厚垃圾袋 (Karung Sampah tebal)')).toEqual({ primary: '厚垃圾袋', secondary: 'Karung Sampah tebal' });
    expect(chineseFirstName('SQ1500 Box (单座饭盒)')).toEqual({ primary: '单座饭盒', secondary: 'SQ1500 Box' });
  });
  it('keeps English-only names on one line', () => {
    expect(chineseFirstName('C.BIO (M) Brown Lunch Box')).toEqual({ primary: 'C.BIO (M) Brown Lunch Box', secondary: '' });
    expect(chineseFirstName('Pearly Cocktail Napkin')).toEqual({ primary: 'Pearly Cocktail Napkin', secondary: '' });
  });
});

describe('stockNameLines（品名 + 第二行）', () => {
  it('uses the second-line field when filled, without splitting the name', () => {
    expect(stockNameLines({ name: '打包纸20X20 (Packing plastic20X20)', subName: '30 pkt / guni' })).toEqual({ primary: '打包纸20X20 (Packing plastic20X20)', secondary: '30 pkt / guni' });
    expect(stockNameLines({ name: 'Plastic bag', subName: '30GG' })).toEqual({ primary: 'Plastic bag', secondary: '30GG' });
  });
  it('falls back to the automatic split when empty', () => {
    expect(stockNameLines({ name: '洗布水 (Towel Detergent)', subName: '  ' })).toEqual({ primary: '洗布水', secondary: 'Towel Detergent' });
    expect(stockNameLines({ name: 'Plastic bag (30GG)' })).toEqual({ primary: 'Plastic bag (30GG)', secondary: '' });
  });
});
