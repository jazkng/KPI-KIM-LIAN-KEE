import { describe, expect, it } from 'vitest';
import { summarizeFoodPurchases } from '../../utils/cockpit/foodPurchases';
import { buildAdvisorInsights } from '../../utils/cockpit/advisorInsights';
import { verifyAdvisorPoints } from '../../server/cockpitAdvisor';

const po = (id: string, receivedAt: string, items: any[], status = 'RECEIVED') => ({ id, supplierId: 's', supplierName: '鸿发', date: receivedAt, status, receivedAt, items, totalEstimated: 0 }) as any;
const line = (stockId: string, name: string, spend: number, qty: number, unit = 'g') => ({ stockId, name, finalLineTotal: spend, receivedBaseQty: qty, baseUnit: unit, unit, orderQty: 1, ratio: 1, cost: spend });

const pos = [
    po('p1', '2026-09-10', [line('pork', '猪肉', 200, 10000)]),               // 9 月：RM 20/kg
    po('p2', '2026-10-05', [line('pork', '猪肉', 230, 10000), line('rice', '白米', 100, 25000)]),
    po('p3', '2026-10-12', [line('pork', '猪肉', 240, 10000)]),
    po('p4', '2026-10-15', [line('pork', '猪肉', 999, 1)], 'ORDERED'),          // 没收货不算
    po('p5', '2026-10-16', [line('egg', '鸡蛋', 0, 30)]),                      // 没金额不算
];

describe('summarizeFoodPurchases', () => {
    const r = summarizeFoodPurchases(pos, '2026-10');
    it('只算已收货、有金额的行，同品项合并、按金额排序', () => {
        expect(r.lines.map(l => [l.name, l.spend, l.receipts])).toEqual([['猪肉', 470, 2], ['白米', 100, 1]]);
        expect(r.total).toBe(570);
    });
    it('单价 = 实付 ÷ 收到数量，跟上月单价比', () => {
        expect(r.lines[0].unitPrice).toBe(0.0235);
        expect(r.lines[0].change).toBe(17.5);
        expect(r.lines[1].change).toBeNull();
    });
});

describe('食材明细图', () => {
    const r = buildAdvisorInsights({ days: [], month: '2026-10', costLines: [], revenue: 0, purchaseOrders: pos });
    const food = r.insights.find(i => i.key === 'food')!;
    it('g 换成 kg 显示单价，涨 10% 以上标红并列入要注意', () => {
        expect(food.bars[0]).toMatchObject({ label: '猪肉', value: 470, highlight: 'worst', sub: 'RM 23.50/kg · 上月 +17.5%' });
        expect(r.anomalies.map(a => a.text)).toContain('猪肉 单价 +17.5%');
    });
    it('AI 引用单价能通过核对', () => {
        const ref = food.bars[0].ref!;
        expect(verifyAdvisorPoints({ points: [{ kind: 'finding', text: '猪肉本月 RM 470，单价 RM 23.50/kg，比上月 +17.5%。', refs: [ref] }] }, r.evidence).points).toHaveLength(1);
    });
});
