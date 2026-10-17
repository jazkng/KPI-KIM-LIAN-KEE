import { describe, expect, it } from 'vitest';
import { auditStock, type StockAuditInput } from '../../utils/inventory/stockAudit';

const SECTIONS = { KITCHEN: ['FRESH', 'MEAT', 'NOODLE'], BAR: ['TEA', 'RTD'], GENERAL: ['PACKAGING'], FUEL: ['GAS'] };
const s = (id: string, name: string, category: string, extra: Record<string, any> = {}) => ({ id, data: { id, name, category, baseUnit: 'kg', currentQtyBase: 1, ...extra } });

const base = (): StockAuditInput => ({
    stock: {
        KITCHEN: [s('K1', '肉片 (Meat)', 'MEAT'), s('K2', '鸡 (Chicken)', 'MEAT'), s('DUP', '面 (Noodle)', 'NOODLE')],
        BAR: [s('DUP', '面 (Noodle)', 'NOODLE'), s('B1', '鸡 (chicken)', 'MEAT'), s('B2', '茶 (Tea)', 'TEA', { currentQtyBase: -2 })],
        GENERAL: [s('G1', '盒 (Box)', 'WEIRD'), { id: 'docX', data: { id: 'G2', name: '袋 (Bag)', category: 'PACKAGING', baseUnit: 'pcs' } }],
        FUEL: [s('F1', '煤气 (Gas)', 'GAS', { baseUnit: undefined })],
    },
    suppliers: [{ id: 'sup1', data: { name: 'ABC', catalog: [
        { id: 'cat1', name: '肉片', linkedStockId: 'K1' },
        { id: 'cat2', name: '旧鸡', linkedStockId: 'GONE' },
        { id: 'cat3', name: '没连结' },
    ] } }],
    openPurchaseOrders: [{ id: 'PO1', data: { supplierName: 'ABC', items: [
        { stockId: 'cat1', name: '肉片' }, { stockId: 'cat3', name: '没连结' }, { stockId: 'K2', name: '鸡' }, { stockId: '???', name: '不明' }, { stockId: 'cat2', name: '旧鸡' },
    ] } }],
    menu: [{ id: 'm1', data: { name: '福建面', variants: [{ label: '大', recipe: [{ stockId: 'K1', stockName: '肉片' }, { stockId: 'OLD', stockName: '旧猪油' }] }] } }],
    pendingTasks: [{ id: 't1', data: { assigneeName: 'ALI', items: [{ stockId: 'K1', stockName: '肉片' }, { stockId: 'OLD2', stockName: '已删' }] } }],
    codes: [],
    hasCounters: false,
    sections: SECTIONS,
});

const types = (f: ReturnType<typeof auditStock>) => f.map(x => `${x.severity}:${x.type}:${x.stockId || x.subject}`);

describe('库存资料审计（只读）', () => {
    const f = auditStock(base());
    const t = types(f);

    it('复制品与文件 ID 不一致：高', () => {
        expect(t).toContain('HIGH:DUPLICATE_ID:DUP');
        expect(t).toContain('HIGH:DOC_ID_MISMATCH:G2');
    });
    it('供应商连结断掉、未收货采购单对不上：高；没连结：中', () => {
        expect(t).toContain('HIGH:BROKEN_SUPPLIER_LINK:ABC · 旧鸡');
        expect(t).toContain('HIGH:OPEN_PO_UNRESOLVED:ABC · PO1 · 不明');
        expect(t).toContain('HIGH:OPEN_PO_UNRESOLVED:ABC · PO1 · 旧鸡');
        expect(t).toContain('MEDIUM:OPEN_PO_UNLINKED:ABC · PO1 · 没连结');
        expect(t.filter(x => x.includes('PO1 · 肉片') || x.includes('PO1 · 鸡'))).toEqual([]); // 正常的不列
    });
    it('分类：放错区域、认不得', () => {
        expect(t).toContain('MEDIUM:AREA_MISMATCH:B1');
        expect(t).toContain('MEDIUM:UNKNOWN_CATEGORY:G1');
    });
    it('菜谱、盘点任务指向不存在的商品；负数库存；同名', () => {
        expect(t.some(x => x.startsWith('MEDIUM:BROKEN_RECIPE:福建面（大） · 旧猪油'))).toBe(true);
        expect(t.some(x => x.startsWith('MEDIUM:BROKEN_TASK:盘点任务 t1'))).toBe(true);
        expect(t).toContain('MEDIUM:NEGATIVE_QTY:B2');
        expect(f.find(x => x.type === 'SAME_NAME')!.subject).toContain('鸡 (Chicken)');
    });
    it('低：没供应商、缺单位、供应商品项没连结', () => {
        expect(t).toContain('LOW:NO_SUPPLIER:K2');
        expect(t).not.toContain('LOW:NO_SUPPLIER:K1');
        expect(t).toContain('LOW:MISSING_UNIT:F1');
        expect(t).toContain('LOW:UNLINKED_CATALOG:ABC');
    });
    it('高的排最前面', () => {
        const ranks = f.map(x => ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[x.severity]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
    it('还没全部重新连号：不报未编号', () => {
        expect(t.some(x => x.includes('MISSING_CODE'))).toBe(false);
    });
});

describe('编号检查', () => {
    it('重新连号后：未编号、编号重复、登记表不一致', () => {
        const input = base();
        input.hasCounters = true;
        input.stock.KITCHEN[0].data.stockCode = 'K0001';
        input.stock.KITCHEN[1].data.stockCode = 'K0001';
        input.codes = [
            { id: 'K0001', data: { code: 'K0001', stockId: 'K1', status: 'ACTIVE' } },
            { id: 'K0002', data: { code: 'K0002', stockId: 'K2', status: 'ACTIVE' } },
            { id: 'K0003', data: { code: 'K0003', stockId: 'NOPE', status: 'ACTIVE' } },
        ];
        const t = types(auditStock(input));
        expect(t).toContain('HIGH:CODE_DUPLICATE:K0001');
        expect(t).toContain('HIGH:CODE_REGISTRY_MISMATCH:K2');
        expect(t).toContain('HIGH:CODE_REGISTRY_MISMATCH:K0003');
        expect(t).toContain('MEDIUM:MISSING_CODE:B2');
        expect(t).not.toContain('MEDIUM:MISSING_CODE:DUP'); // 复制品先人工处理，不报未编号
    });
});
