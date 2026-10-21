import { describe, expect, it } from 'vitest';
import { buildAdvisorInsights } from '../../utils/cockpit/advisorInsights';
import { verifyAdvisorPoints } from '../../server/cockpitAdvisor';
import type { BusinessDay, ProfitLine } from '../../utils/businessCenter';

const day = (date: string, revenue: number, extra: Partial<BusinessDay> = {}) => ({
    date, revenue, weather: 'SUNNY', perPax: null, perBill: null,
    channels: [{ label: '店内', amount: revenue * 0.8, orders: null, needsReview: false, average: null }, { label: 'Grab', amount: revenue * 0.2, orders: null, needsReview: false, average: null }],
    ...extra,
} as unknown as BusinessDay);

// 2026-10-05 是周一
const days = Array.from({ length: 14 }, (_, i) => day(`2026-10-${String(i + 5).padStart(2, '0')}`, 1000 + i * 100, { weather: i % 2 ? 'RAIN' : 'SUNNY' } as any));
const costLines: ProfitLine[] = [
    { key: 'food', label: '食材', hint: '', amount: 3000, per100: 30, kpi: 'food' },
    { key: 'labour', label: '员工薪资', hint: '', amount: 2500, per100: 25, kpi: 'labour' },
    { key: 'opex', label: '租金、水电和其他费用', hint: '', amount: 0, per100: 0, kpi: 'actualProfit' },
];

describe('buildAdvisorInsights', () => {
    const r = buildAdvisorInsights({ days, month: '2026-10', costLines, revenue: 10000 });
    const get = (k: string) => r.insights.find(i => i.key === k)!;

    it('只用本月已日结的日子', () => expect(r.settledDays).toBe(14));
    it('走势：最近 7 天对比再前 7 天', () => {
        const t = get('trend');
        expect(t.bars).toHaveLength(14);
        // 前 7 天 1000..1600 = 9100；后 7 天 1700..2300 = 14000
        expect(t.headline).toBe('最近 7 天合计 RM 14,000，比再前 7 天多 53.8%');
    });
    it('星期几：每个星期的平均，标出最好 / 最弱', () => {
        const w = get('weekday');
        expect(w.bars.map(b => b.label)).toEqual(['周一', '周二', '周三', '周四', '周五', '周六', '周日']);
        expect(w.bars[0]).toMatchObject({ value: 1350, highlight: 'worst' }); // (1000+1700)/2
        expect(w.bars[6]).toMatchObject({ value: 1950, highlight: 'best' });
    });
    it('天气：只算有填天气的日子', () => {
        const w = get('weather');
        expect(w.bars.map(b => [b.label, b.value])).toEqual([['晴', 1600], ['雨', 1700]]);
    });
    it('渠道占比', () => expect(get('channel').headline).toBe('店内占 80.0%，外卖占 20.0%'));
    it('成本结构不列金额为 0 的项目', () => expect(get('cost').bars.map(b => b.label)).toEqual(['食材', '员工薪资']));
    it('证据编号连续，AI 引用正确数字会通过核对、乱编会被删掉', () => {
        expect(r.evidence.map(e => e.id)).toEqual(r.evidence.map((_, i) => `D${i + 1}`));
        const best = r.evidence.find(e => e.label === '本月周日平均营业额')!;
        const ok = verifyAdvisorPoints({ points: [{ kind: 'finding', text: '周日平均 RM 1,950，最好。', refs: [best.id] }] }, r.evidence);
        expect(ok.points).toHaveLength(1);
        const bad = verifyAdvisorPoints({ points: [{ kind: 'finding', text: '周日平均 RM 2,500。', refs: [best.id] }] }, r.evidence);
        expect(bad.points).toHaveLength(0);
    });
    it('资料不够就不画图', () => {
        expect(buildAdvisorInsights({ days: [days[0]], month: '2026-10', costLines: [], revenue: 0 }).insights.map(i => i.key)).toEqual(['channel']);
    });
});
