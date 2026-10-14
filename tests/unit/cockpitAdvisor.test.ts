import { describe, expect, it } from 'vitest';
import { buildAdvisorPrompt, parseAdvisorJson, sanitizeAdvisorRequest, verifyAdvisorPoints, type AdvisorEvidence } from '../../server/cockpitAdvisor';

const evidence: AdvisorEvidence[] = [
    { id: 'K1', label: '截至目前利润', value: 'RM 51,720.00（预估）', note: '外送平台 12 个平台日未对账' },
    { id: 'K2', label: '人工成本率', value: '8.4%（已确认）' },
    { id: 'A1', label: '预警·应付账款（高优先级）', value: '1 笔应付账款已逾期', note: '合计未付 RM 1,200.00；虚构鱼贩：到期日 2026-10-01，已逾期 13 天' },
];

describe('AI 经营顾问 · 请求检查', () => {
    it('合格请求：整理空白、截断过长文字', () => {
        const r = sanitizeAdvisorRequest({ question: '  利润  如何？ ', periodLabel: '本月', evidence: [{ id: 'K1', label: '利润', value: 'RM 1.00', note: 'x'.repeat(1000) }] });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.question).toBe('利润 如何？');
            expect(r.evidence[0].note!.length).toBe(400);
        }
    });
    it('拒绝：没有证据、编号格式错误、编号重复、没有问题', () => {
        expect(sanitizeAdvisorRequest({ question: 'q', evidence: [] }).ok).toBe(false);
        expect(sanitizeAdvisorRequest({ question: 'q', evidence: [{ id: 'k1; drop', label: 'a', value: 'b' }] }).ok).toBe(false);
        expect(sanitizeAdvisorRequest({ question: 'q', evidence: [{ id: 'K1', label: 'a', value: 'b' }, { id: 'K1', label: 'a', value: 'b' }] }).ok).toBe(false);
        expect(sanitizeAdvisorRequest({ question: ' ', evidence: [{ id: 'K1', label: 'a', value: 'b' }] }).ok).toBe(false);
    });
    it('提示词包含证据清单与「不得自行计算新数字」规则', () => {
        const p = buildAdvisorPrompt('本月', evidence);
        expect(p).toContain('K1 | 截至目前利润 | RM 51,720.00（预估）');
        expect(p).toContain('不要自己相加、相减、换算或推估新数字');
    });
});

describe('AI 经营顾问 · 逐点核对', () => {
    it('引用正确、数字与日期都能在证据中找到 → 保留', () => {
        const r = verifyAdvisorPoints({ points: [
            { kind: 'finding', text: '截至目前利润 RM 51,720，但仍是预估，因为有 12 个平台日未对账。', refs: ['K1'] },
            { kind: 'action', text: '可考虑先处理 2026-10-01 到期、已逾期 13 天的 RM 1,200.00 应付账款。', refs: ['A1'] },
            { kind: 'finding', text: '人工成本率约 8%。', refs: ['K2'] },
        ] }, evidence);
        expect(r.rejected).toEqual([]);
        expect(r.points.map(p => p.kind)).toEqual(['finding', 'action', 'finding']);
    });
    it('自行计算的新数字 → 删除并说明原因', () => {
        const r = verifyAdvisorPoints({ points: [{ kind: 'finding', text: '扣除应付后利润剩 RM 50,520。', refs: ['K1', 'A1'] }] }, evidence);
        expect(r.points).toEqual([]);
        expect(r.rejected[0].reason).toContain('50,520');
    });
    it('数字存在，但不在所引用的证据中 → 删除', () => {
        const r = verifyAdvisorPoints({ points: [{ kind: 'finding', text: '利润 RM 51,720。', refs: ['K2'] }] }, evidence);
        expect(r.rejected[0].reason).toContain('不在所引用的证据中');
    });
    it('百分比与金额不能互相冒充', () => {
        const r = verifyAdvisorPoints({ points: [{ kind: 'finding', text: '人工成本 RM 8.4。', refs: ['K2'] }] }, evidence);
        expect(r.points).toEqual([]);
    });
    it('没有引用、引用不存在的编号、日期不符 → 删除', () => {
        const r = verifyAdvisorPoints({ points: [
            { kind: 'finding', text: '生意不错。', refs: [] },
            { kind: 'finding', text: '生意不错。', refs: ['K9'] },
            { kind: 'gap', text: '2026-09-30 没有日结。', refs: ['A1'] },
        ] }, evidence);
        expect(r.points).toEqual([]);
        expect(r.rejected.map(x => x.reason)).toEqual(['没有引用任何证据', '引用了不存在的证据 K9', '日期 2026-09-30 不在所引用的证据中']);
    });
    it('格式不对（不是 JSON / 没有 points）→ 全部不显示', () => {
        expect(verifyAdvisorPoints(parseAdvisorJson('利润很好'), evidence).points).toEqual([]);
        expect(parseAdvisorJson('```json\n{"points":[]}\n```')).toEqual({ points: [] });
    });
});
