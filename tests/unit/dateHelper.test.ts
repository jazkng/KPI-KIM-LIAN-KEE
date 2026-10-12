import { describe, expect, it } from 'vitest';
import { getBusinessDateString, getMalaysiaDateString } from '../../utils/dateHelper';

// 马来西亚 = UTC+8，没有夏令时
describe('dateHelper（Asia/Kuala_Lumpur）', () => {
  it('getMalaysiaDateString 按马来西亚时区换日', () => {
    expect(getMalaysiaDateString(new Date('2026-10-11T15:59:00Z'))).toBe('2026-10-11'); // 23:59 MYT
    expect(getMalaysiaDateString(new Date('2026-10-11T16:00:00Z'))).toBe('2026-10-12'); // 00:00 MYT
  });

  it('getBusinessDateString：凌晨 4 点前仍算前一个营业日', () => {
    expect(getBusinessDateString(new Date('2026-10-11T16:30:00Z'))).toBe('2026-10-11'); // 00:30 MYT
    expect(getBusinessDateString(new Date('2026-10-11T19:59:00Z'))).toBe('2026-10-11'); // 03:59 MYT
    expect(getBusinessDateString(new Date('2026-10-11T20:00:00Z'))).toBe('2026-10-12'); // 04:00 MYT
    expect(getBusinessDateString(new Date('2026-10-12T14:00:00Z'))).toBe('2026-10-12'); // 22:00 MYT
  });

  it('getBusinessDateString：跨月、跨年回退正确', () => {
    expect(getBusinessDateString(new Date('2026-10-31T17:00:00Z'))).toBe('2026-10-31'); // 11-01 01:00 MYT
    expect(getBusinessDateString(new Date('2026-12-31T17:00:00Z'))).toBe('2026-12-31'); // 2027-01-01 01:00 MYT
  });
});
