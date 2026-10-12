import { describe, expect, it } from 'vitest';
import { daysBetween, formatGrowth, growthPct, inDateRange, pct } from '../../utils/financialMetrics';

describe('financialMetrics 基础工具', () => {
  it('pct：分母为 0 或负数时回 0，不产生 NaN/Infinity', () => {
    expect(pct(25, 100)).toBe(25);
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -10)).toBe(0);
    expect(pct(Number.NaN, 100)).toBe(0);
  });

  it('growthPct：上期为 0 时回 null（显示「新增」）', () => {
    expect(growthPct(120, 100)).toBe(20);
    expect(growthPct(80, 100)).toBe(-20);
    expect(growthPct(50, 0)).toBeNull();
    expect(growthPct(-50, -100)).toBe(50);
  });

  it('formatGrowth：格式化正负号与「新增」', () => {
    expect(formatGrowth(null)).toBe('新增');
    expect(formatGrowth(12.345)).toBe('+12.3%');
    expect(formatGrowth(-5)).toBe('-5.0%');
    expect(formatGrowth(0)).toBe('0.0%');
  });

  it('inDateRange：含头含尾，忽略时间部分', () => {
    expect(inDateRange('2026-10-01', '2026-10-01', '2026-10-31')).toBe(true);
    expect(inDateRange('2026-10-31T23:59:00', '2026-10-01', '2026-10-31')).toBe(true);
    expect(inDateRange('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false);
    expect(inDateRange('', '2026-10-01', '2026-10-31')).toBe(false);
  });

  it('daysBetween：含头含尾，非法日期回 0', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(31);
    expect(daysBetween('2026-10-12', '2026-10-12')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(0);
    expect(daysBetween('not-a-date', '2026-10-01')).toBe(0);
  });
});
