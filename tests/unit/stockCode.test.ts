import { describe, expect, it } from 'vitest';
import {
    formatStockCode, parseStockCode, isHumanLegacyCode, displayStockCode, matchesStockSearch,
    suggestStockName, planRenumber, planFingerprint, nameKey, keepStockCodeFields,
} from '../../utils/inventory/stockCode';

const ORDER = { KITCHEN: ['FRESH', 'MEAT', 'SEAFOOD', 'VEG', 'NOODLE'], BAR: ['TEA', 'RTD'], GENERAL: ['PACKAGING'], FUEL: ['GAS'] };

describe('编号格式', () => {
    it('K0001 / B0012 / G0100 / F0003', () => {
        expect(formatStockCode('KITCHEN', 1)).toBe('K0001');
        expect(formatStockCode('BAR', 12)).toBe('B0012');
        expect(formatStockCode('GENERAL', 100)).toBe('G0100');
        expect(formatStockCode('FUEL', 3)).toBe('F0003');
        expect(formatStockCode('KITCHEN', 12345)).toBe('K12345');
    });
    it('解析', () => {
        expect(parseStockCode('k0007')).toEqual({ prefix: 'K', seq: 7 });
        expect(parseStockCode('K009')).toBeNull();
        expect(parseStockCode('S0001')).toBeNull();
    });
    it('旧编号判断：人看得懂的才算', () => {
        expect(isHumanLegacyCode('K009')).toBe(true);
        expect(isHumanLegacyCode('KF01')).toBe(true);
        expect(isHumanLegacyCode('S12')).toBe(true);
        expect(isHumanLegacyCode('K_1712345678901')).toBe(false);
        expect(isHumanLegacyCode('x8f2Kq9')).toBe(false);
    });
    it('没编号显示「未编号」，不显示内部 ID', () => {
        expect(displayStockCode({})).toBe('未编号');
        expect(displayStockCode({ stockCode: 'K0001' })).toBe('K0001');
    });
    it('搜寻：编号、旧编号、内部 ID、名称', () => {
        const item = { id: 'K_1712345678901', name: '米粉 (Bee Hoon)', stockCode: 'K0042', legacyCodes: ['K009'] };
        ['k0042', 'K009', '1712345', 'bee', '米粉', ''].forEach(t => expect(matchesStockSearch(item, t), t).toBe(true));
        expect(matchesStockSearch(item, 'K0043')).toBe(false);
    });
});

describe('命名建议：统一「中文 (English)」', () => {
    const cases: [string, string | null, string | undefined][] = [
        ['米粉 (Bee Hoon)', null, undefined],
        ['米粉（Bee Hoon）', '米粉 (Bee Hoon)', undefined],
        ['米粉  (Bee Hoon )', '米粉 (Bee Hoon)', undefined],
        ['Bee Hoon 米粉', '米粉 (Bee Hoon)', undefined],
        ['米粉 Bee Hoon', '米粉 (Bee Hoon)', undefined],
        ['(Bee Hoon) 米粉', '米粉 (Bee Hoon)', undefined],
        ['Bee Hoon (米粉)', '米粉 (Bee Hoon)', undefined],
        ['Tiger Beer 虎牌啤酒 320ml', '虎牌啤酒 320ml (Tiger Beer)', undefined],
        ['可乐 1.5L', null, 'MISSING_ENGLISH'],
        ['Heineken', null, 'MISSING_CHINESE'],
        ['米粉', null, 'MISSING_ENGLISH'],
        ['猪肉 Pork 片 Slice', null, 'NEEDS_MANUAL'],
        ['Coca可乐', null, 'NEEDS_MANUAL'],
    ];
    cases.forEach(([raw, suggested, issue]) => it(raw, () => {
        const r = suggestStockName(raw);
        expect(r.suggested).toBe(suggested);
        expect(r.issue).toBe(issue);
    }));
    it('同名键忽略空格、括号、大小写', () => {
        expect(nameKey('米粉 (Bee Hoon)')).toBe(nameKey('米粉（bee hoon）'));
    });
});

describe('全部重新连号计划', () => {
    const items = [
        { id: 'K_1700000000002', area: 'KITCHEN' as const, category: 'NOODLE', name: '面 (Noodles)' },
        { id: 'K009', area: 'KITCHEN' as const, category: 'MEAT', name: '肉片 (Meat Slices)' },
        { id: 'x8f2', area: 'KITCHEN' as const, category: 'FRESH', name: '鸡蛋 (Egg)' },
        { id: 'K_1700000000003', area: 'KITCHEN' as const, category: 'WEIRD', name: '某物' },
        { id: 'B001', area: 'BAR' as const, category: 'RTD', name: 'Tiger Beer 虎牌啤酒' },
        { id: 'S12', area: 'GENERAL' as const, category: 'PACKAGING', name: '外卖盒 (Box)' },
        { id: 'DUP', area: 'KITCHEN' as const, category: 'MEAT', name: '鸡 (Chicken)' },
        { id: 'DUP', area: 'BAR' as const, category: 'TEA', name: '鸡 (Chicken)' },
        { id: 'K_1700000000004', area: 'KITCHEN' as const, category: 'NOODLE', name: '面（noodles）' },
    ];
    const plan = planRenumber(items, ORDER, new Set(['DUP']));

    it('按区域 → 子分类顺序 → 名称排序连号，不认得的分类排最后', () => {
        const k = plan.rows.filter(r => r.area === 'KITCHEN').map(r => [r.newCode, r.stockId]);
        expect(k).toEqual([
            ['K0001', 'x8f2'], ['K0002', 'K009'], ['K0003', 'K_1700000000002'], ['K0004', 'K_1700000000004'], ['K0005', 'K_1700000000003'],
        ]);
        expect(plan.rows.find(r => r.stockId === 'S12')!.newCode).toBe('G0001');
        expect(plan.rows.find(r => r.stockId === 'B001')!.newCode).toBe('B0001');
        expect(plan.nextSeq).toEqual({ KITCHEN: 6, BAR: 2, GENERAL: 2, FUEL: 1 });
    });
    it('旧编号保存到 legacyCodes；系统产生的长 ID 不放', () => {
        expect(plan.rows.find(r => r.stockId === 'K009')!.legacyCodes).toEqual(['K009']);
        expect(plan.rows.find(r => r.stockId === 'S12')!.legacyCodes).toEqual(['S12']);
        expect(plan.rows.find(r => r.stockId === 'x8f2')!.legacyCodes).toEqual([]);
    });
    it('复制品不配号，列入要人工处理', () => {
        expect(plan.rows.some(r => r.stockId === 'DUP')).toBe(false);
        expect(plan.blocked).toEqual([{ stockId: 'DUP', reason: expect.any(String) }]);
    });
    it('同名与命名建议', () => {
        expect(plan.rows.find(r => r.stockId === 'K_1700000000002')!.duplicateNameWith).toEqual(['K_1700000000004']);
        expect(plan.rows.find(r => r.stockId === 'B001')!.suggestedName).toBe('虎牌啤酒 (Tiger Beer)');
        expect(plan.rows.find(r => r.stockId === 'K_1700000000004')!.suggestedName).toBe('面 (noodles)');
    });
    it('同样资料产生同样计划（可重跑）', () => {
        const again = planRenumber([...items].reverse(), ORDER, new Set(['DUP']));
        expect(planFingerprint(again)).toBe(planFingerprint(plan));
    });
});

describe('一般存档不能改编号', () => {
    it('以资料库现有的编号为准', () => {
        const db = { id: 'a', stockCode: 'K0001', legacyCodes: ['K009'] };
        const next = { id: 'a', name: 'x', stockCode: 'K9999', legacyCodes: [] };
        expect(keepStockCodeFields(db, next)).toEqual({ id: 'a', name: 'x', stockCode: 'K0001', legacyCodes: ['K009'] });
    });
    it('资料库还没编号时，画面传来的编号也不写', () => {
        expect(keepStockCodeFields({ id: 'a' }, { id: 'a', stockCode: 'K0001' })).toEqual({ id: 'a' });
    });
});
