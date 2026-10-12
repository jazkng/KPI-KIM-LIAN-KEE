import { describe, expect, it } from 'vitest';
import { numberToWords } from '../../utils/paymentVoucherUtils';

describe('numberToWords（付款凭单金额大写）', () => {
  it('整数与分', () => {
    expect(numberToWords(0)).toBe('Ringgit Malaysia Zero Only');
    expect(numberToWords(1)).toBe('Ringgit Malaysia One Only');
    expect(numberToWords(1234.5)).toBe('Ringgit Malaysia One Thousand Two Hundred Thirty Four And Cents Fifty Only');
    expect(numberToWords(1_000_015.07)).toBe('Ringgit Malaysia One Million Fifteen And Cents Seven Only');
  });

  it('四舍五入到分，不会出现 100 分', () => {
    expect(numberToWords(10.999)).toBe('Ringgit Malaysia Eleven Only');
    expect(numberToWords(0.005)).toBe('Ringgit Malaysia Zero And Cents One Only');
  });

  it('非法金额', () => {
    expect(numberToWords(-1)).toBe('Invalid Amount');
    expect(numberToWords(Number.NaN)).toBe('Invalid Amount');
  });
});
