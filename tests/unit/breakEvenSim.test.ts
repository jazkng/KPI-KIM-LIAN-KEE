import { describe, expect, it } from 'vitest';
import { baselineParams, simulate } from '../../utils/cockpit/breakEvenSim';

const baseline = { month: '2026-09', daysInMonth: 30, settledDays: 30, projectedRevenue: 100000, foodRate: 0.3, platformRate: 0.05, labourExOt: 20000, ot: 1000, rent: 9000, otherFixed: 5000, headcount: 8 };

describe('保本模拟器（只计算，不写入）', () => {
    it('以实际结构为起点：保本 = 固定成本 ÷ (1 − 变动成本率)', () => {
        const r = simulate(baselineParams(baseline), 2500);
        expect(r.fixed).toBe(35000);
        expect(r.breakEvenMonthly).toBeCloseTo(35000 / 0.65, 2);
        expect(r.breakEvenDaily).toBeCloseTo(35000 / 0.65 / 30, 2);
        expect(r.profit).toBe(100000 * 0.65 - 35000);
    });
    it('每天多做 RM 500：月底利润增加 500 × 天数 × 贡献率', () => {
        expect(simulate(baselineParams(baseline), 2500).plus500PerDay).toBe(500 * 30 * 0.65);
    });
    it('员工增加 2 人（人均 2,500）：固定成本 +5,000', () => {
        expect(simulate({ ...baselineParams(baseline), staffDelta: 2 }, 2500).fixed).toBe(40000);
    });
    it('营业天数 26 天：每日保本额提高', () => {
        const r = simulate({ ...baselineParams(baseline), operatingDays: 26 }, 2500);
        expect(r.breakEvenDaily).toBeCloseTo((35000 / 0.65) / 26, 2);
    });
    it('食材成本率敏感度：+1 个百分点使保本额增加', () => {
        const r = simulate(baselineParams(baseline), 2500);
        expect(r.foodRateSensitivity).toBeCloseTo(35000 / 0.64 - 35000 / 0.65, 2);
    });
    it('变动成本率 ≥ 100%：无法保本', () => {
        const r = simulate({ ...baselineParams(baseline), foodRate: 0.98, platformRate: 0.05 }, 2500);
        expect(r.breakEvenMonthly).toBeNull();
    });
});
