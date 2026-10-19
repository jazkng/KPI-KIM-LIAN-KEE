import { describe, it, expect } from 'vitest';
import { MALAYSIA_HOLIDAYS, getMalaysiaHoliday, hasHolidayDataForYear, holidayLabel } from '../../utils/holidays/malaysiaHolidays';
import { DEFAULT_MALAYSIAN_HOLIDAYS } from '../../components/features/roster/rosterConstants';

describe('malaysiaHolidays', () => {
  it('dates are valid, unique and sorted', () => {
    const dates = MALAYSIA_HOLIDAYS.map(h => h.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [y, m, day] = d.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, day));
      expect(dt.getUTCDate()).toBe(day);
    }
  });

  it('looks up holidays by business date', () => {
    expect(getMalaysiaHoliday('2026-11-08')?.en).toBe('Deepavali');
    expect(getMalaysiaHoliday('2026-11-09')?.replacement).toBe(true);
    expect(getMalaysiaHoliday('2026-10-19')).toBeNull();
    expect(getMalaysiaHoliday('')).toBeNull();
    expect(getMalaysiaHoliday('2026-12-25T10:00:00Z')?.name).toBe('圣诞节');
  });

  it('includes the announced 2026 additional and replacement days', () => {
    expect(getMalaysiaHoliday('2026-03-20')?.name).toBe('开斋节额外假日');
    expect(getMalaysiaHoliday('2026-06-01')?.replacement).not.toBe(true);
    expect(getMalaysiaHoliday('2026-06-02')?.replacement).toBe(true);
  });

  it('fixed-date national holidays fall on the right day', () => {
    for (const y of [2026, 2027]) {
      expect(getMalaysiaHoliday(`${y}-01-01`)).not.toBeNull();
      expect(getMalaysiaHoliday(`${y}-05-01`)).not.toBeNull();
      expect(getMalaysiaHoliday(`${y}-08-31`)).not.toBeNull();
      expect(getMalaysiaHoliday(`${y}-09-16`)).not.toBeNull();
      expect(getMalaysiaHoliday(`${y}-12-25`)).not.toBeNull();
    }
  });

  it('marks tentative dates and knows which years are covered', () => {
    expect(holidayLabel(getMalaysiaHoliday('2027-03-10')!)).toBe('开斋节（预计）');
    expect(hasHolidayDataForYear(2026)).toBe(true);
    expect(hasHolidayDataForYear('2030')).toBe(false);
  });

  it('roster uses the same list', () => {
    expect(DEFAULT_MALAYSIAN_HOLIDAYS.length).toBe(MALAYSIA_HOLIDAYS.length);
    expect(DEFAULT_MALAYSIAN_HOLIDAYS.find(h => h.date === '2026-02-17')?.name).toBe('农历新年');
  });
});
