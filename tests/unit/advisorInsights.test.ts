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

describe('buildAdvisorInsights · 保本 / 上月同期 / 进货价 / 人效 / 异常', () => {
    const sept = Array.from({ length: 14 }, (_, i) => day(`2026-09-${String(i + 5).padStart(2, '0')}`, 1000));
    const suppliers = [{ id: 's1', name: '鸿发', catalog: [
        { id: 'c1', name: '猪肉', unit: 'kg', price: 20, pricePerPurchaseUnit: 20, toBaseRatio: 1, lastReceivedPricePerBase: 23, lastReceivedAt: '2026-10-10T08:00:00Z' },
        { id: 'c2', name: '白米', unit: 'bag', price: 100, toBaseRatio: 1, lastReceivedPricePerBase: 101, lastReceivedAt: '2026-10-10' },
        { id: 'c3', name: '旧货', unit: 'kg', price: 10, toBaseRatio: 1, lastReceivedPricePerBase: 20, lastReceivedAt: '2026-07-01' },
    ] }] as any;
    const workers = Object.fromEntries(days.map(d => [d.date, 5]));
    const breakEven = { target: 30000, perDay: 1000, progress: 0.5, gap: -2000, remaining: 14000, daysLeft: 13, needPerDayLeft: 1076.92 };
    const r = buildAdvisorInsights({ days: [...sept, ...days], month: '2026-10', costLines: [{ ...costLines[0], per100: 38 }], revenue: 16000, breakEven, suppliers, workers });
    const get = (k: string) => r.insights.find(i => i.key === k)!;

    it('保本：进度条与每天还要多少', () => {
        expect(get('breakeven').gauge).toMatchObject({ target: 30000, remaining: 14000, needPerDay: 1076.92 });
        expect(get('breakeven').headline).toBe('已达 53%，每天还要 RM 1,077');
    });
    it('上月同期：同样到 18 号为止比较日均', () => {
        const c = get('compare');
        expect(c.paired).toBe(true);
        // 本月 10/5–10/18 日均 1650；上月 9/5–9/18 日均 1000
        expect(c.bars[0]).toMatchObject({ label: '日均营业额', value: 1650, compare: 1000, sub: '+65.0%' });
    });
    it('进货价：只看两个月内收货、差 3% 以上的品项', () => {
        const s = get('supplier');
        expect(s.bars.map(b => [b.label, b.value])).toEqual([['猪肉', 15]]);
        expect(s.unit).toBe('CHANGE');
    });
    it('人效：每位上班员工的营业额', () => {
        expect(get('staff').bars).toHaveLength(7);
        expect(get('staff').headline).toContain('每人 RM 330');
    });
    it('异常：保本落后、成本偏高、进货价涨都列出，最多 4 条且坏的在前', () => {
        expect(r.anomalies.length).toBeLessThanOrEqual(4);
        expect(r.anomalies[0]).toMatchObject({ tone: 'bad', key: 'breakeven' });
        expect(r.anomalies.map(a => a.text)).toEqual(['保本进度落后 RM 2,000', '10/5 周一 少 41%', '10/6 周二 少 39%', '食材每 RM100 花 RM 38']);
        r.anomalies.forEach(a => expect(r.evidence.some(e => e.id === a.ref)).toBe(true));
    });
    it('每根柱子都有对应的证据编号，总数在服务端上限内', () => {
        r.insights.filter(i => i.key !== 'trend').forEach(i => i.bars.forEach(b => expect(r.evidence.some(e => e.id === b.ref)).toBe(true)));
        expect(r.evidence.length).toBeLessThan(80);
    });
    it('AI 引用上月同期的数字能通过核对', () => {
        const ref = get('compare').bars[0].ref!;
        expect(verifyAdvisorPoints({ points: [{ kind: 'finding', text: '日均 RM 1,650，比上月同期 RM 1,000 多 65.0%。', refs: [ref] }] }, r.evidence).points).toHaveLength(1);
    });
});
