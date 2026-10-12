import { describe, expect, it } from 'vitest';
import {
  calculatePurchaseToBaseRatio,
  convertDisplayToBase,
  convertPurchaseToDisplay,
  normalizeUnitName,
  roundQuantity,
  toPositiveNumber,
} from '../../utils/unitConversion';

describe('unitConversion（库存单位换算）', () => {
  it('normalizeUnitName', () => {
    expect(normalizeUnitName('  kg ')).toBe('KG');
    expect(normalizeUnitName(undefined)).toBe('');
  });

  it('toPositiveNumber：非正数与非数字回退', () => {
    expect(toPositiveNumber('3')).toBe(3);
    expect(toPositiveNumber(0, 1)).toBe(1);
    expect(toPositiveNumber(-2, 1)).toBe(1);
    expect(toPositiveNumber('abc', 1)).toBe(1);
  });

  it('roundQuantity：默认 4 位小数，消除浮点误差', () => {
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(1.23456)).toBe(1.2346);
    expect(roundQuantity(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('calculatePurchaseToBaseRatio：优先用两段比例，其次旧比例，最后 1', () => {
    expect(calculatePurchaseToBaseRatio({ purchaseToDisplayRatio: 12, displayToBaseRatio: 500 })).toBe(6000);
    expect(calculatePurchaseToBaseRatio({ purchaseToDisplayRatio: 12, existingToBaseRatio: 24 })).toBe(24);
    expect(calculatePurchaseToBaseRatio({})).toBe(1);
  });

  it('convert*：比例非法时按 1 处理', () => {
    expect(convertPurchaseToDisplay(2, 12)).toBe(24);
    expect(convertDisplayToBase(1.5, 1000)).toBe(1500);
    expect(convertDisplayToBase(3, 0)).toBe(3);
  });
});
