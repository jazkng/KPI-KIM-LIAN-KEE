import { describe, expect, it } from 'vitest';
import { computePnL, resolveCategory } from '../../utils/pnl/engine/pnlEngine';
import { reconcileCashBox } from '../../utils/pnl/engine/cashBox';
import { buildClassicPnL } from '../../utils/classicPnLBuilder';
import {
    sepBillPayments, sepEmployees, sepPayroll, sepSettlements, sepStandaloneExpenses,
} from './fixtures/pnlAuditSep2026';

const base = {
    settlements: sepSettlements as any[],
    standaloneExpenses: sepStandaloneExpenses as any[],
    billPayments: sepBillPayments as any[],
    payrollRecords: sepPayroll as any[],
    employees: sepEmployees as any[],
};
const classicOf = (r: ReturnType<typeof computePnL>) => buildClassicPnL({
    month: r.start.slice(0, 7), storehub: null, platformGross: r.classic.platformGross, costByCategory: r.classic.costByCategory,
    viewMode: 'DETAILED', channelMode: 'IN_STORE', includeCost: true, costDetailMode: 'DETAILED',
    laborByDept: r.classic.laborByDept, inStoreSales: r.classic.inStoreSales,
} as any);

describe('唯一盈亏引擎 · 虚构 9 月', () => {
    const r = computePnL(base, '2026-09-01', '2026-09-30', '2026-10-16');

    it('五大项与净利（钱箱 35 不再计入）', () => {
        expect({ revenue: r.revenue, platform: r.platform, food: r.food, labour: r.labour, opex: r.opex, netProfit: r.netProfit }).toEqual({
            revenue: 89900, platform: 3750, food: 32000, labour: 6582.35, opex: 14645, netProfit: 32922.65,
        });
    });

    it('传统账目（会计格式）用同一份结果，净利完全相同，各段对得上', () => {
        const c = classicOf(r);
        expect(Math.round(c.netProfit * 100) / 100).toBe(r.netProfit);
        expect(Math.round(c.costTotal * 100) / 100).toBe(r.food);
        expect(Math.round(c.personalTotal * 100) / 100).toBe(r.labour);
        expect(Math.round((c.sellingTotal + c.operationTotal) * 100) / 100).toBe(Math.round((r.platform + r.opex) * 100) / 100);
        // 部门明细 + 兼职 + 员工餐 = LABOUR CHARGES，没有「对不上的差额」
        expect(c.rows.some(x => x.id === 'LABOUR_GAP')).toBe(false);
    });

    it('同一笔费用只算一次：分期付款、预支、钱箱、薪资付款纪录都不重复', () => {
        expect(r.classic.costByCategory.INGREDIENT_SEAFOOD).toBe(6000);
        expect(r.classic.costByCategory.STAFF_ADVANCE).toBeUndefined();
        expect(r.classic.costByCategory.SALARY).toBe(450); // 兼职一次
        expect(r.classic.costByCategory.PAYROLL).toBe(5300); // 应发（预支已含在内）
        expect(r.classic.costByCategory.EPF_SOCSO).toBe(532.35); // 雇主供款，不论是否已缴
        expect(r.excluded.find(x => x.label.startsWith('员工预支'))?.amount).toBe(300);
        expect(r.excluded.find(x => x.label.startsWith('日结钱箱'))?.amount).toBe(35);
    });

    it('没有对应科目的分类归入正确的行：订阅 → IT、宿舍电费 → 员工水电', () => {
        expect(r.classic.costByCategory.IT_SOFTWARE).toBe(120);
        expect(r.classic.costByCategory.UTILITIES_ELECTRIC_STAFF).toBe(300);
        expect(resolveCategory('SOMETHING_NEW')).toMatchObject({ key: 'MISC_OPEX', group: 'OPEX', fallback: true });
        expect(resolveCategory('TRANSFER')).toMatchObject({ group: 'NON_OPERATING' });
    });

    it('状态：未对账与钱箱缺少记录 → 暂估／待核对，并说明「费用可能遗漏」', () => {
        expect(r.status).toBe('PROVISIONAL');
        const codes = r.reasons.map(x => x.code);
        expect(codes).toContain('PLATFORM_UNRECONCILED');
        expect(codes).toContain('CASH_BOX_MISSING');
        expect(r.reasons.find(x => x.code === 'CASH_BOX_MISSING')?.label).toContain('费用可能遗漏');
        expect(codes).toContain('FOOD_PURCHASE_BASIS');
    });

    it('资料齐全、已对账、钱箱都有对应记录 → 已确认', () => {
        const settlements = sepSettlements.map(s => ({ ...s, reconStatus: { grab: 380 }, dayExpenses: [] }));
        const ok = computePnL({ ...base, settlements }, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(ok.reasons.filter(x => x.level === 'BLOCKING')).toEqual([]);
        expect(ok.status).toBe('CONFIRMED');
    });

    it('没有薪资单 → 人工按档案暂估，绝不使用 57,300', () => {
        const est = computePnL({ ...base, payrollRecords: [] }, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(est.reasons.map(x => x.code)).toContain('PAYROLL_NOT_POSTED');
        expect(est.labour).not.toBe(57300);
        expect(est.status).toBe('PROVISIONAL');
    });

    it('UTC 时间以马来西亚日期计：9/1 凌晨的账单算 9 月', () => {
        const extra = [...sepStandaloneExpenses, { id: 'utc_egg', category: 'INGREDIENT_EGG', amount: 80, time: '2026-08-31T18:00:00.000Z', paymentStatus: 'PAID' }];
        const x = computePnL({ ...base, standaloneExpenses: extra as any[] }, '2026-09-01', '2026-09-30', '2026-10-16');
        expect(x.food).toBe(32080);
    });
});

describe('钱箱核对：不只靠金额与日期', () => {
    const settle = (date: string, items: any[]) => ({ date, dayExpenses: items });
    const ap = [
        { id: 'ap1', company: 'Ah Seng Sayur', category: 'INGREDIENT_VEG', amount: 120, time: '2026-09-02', paymentDate: '2026-09-05', paymentMethod: 'CASH' },
        { id: 'ap2', company: 'Kedai Ais', category: 'INGREDIENT_ICE', amount: 35, time: '2026-09-05', paymentMethod: 'BANK_TRANSFER' },
        { id: 'ap3', company: 'Ah Seng Sayur', category: 'INGREDIENT_VEG', amount: 90, time: '2026-09-07', paymentDate: '2026-09-08', paymentMethod: 'CASH' },
        { id: 'parttime_x', company: 'Ali', category: 'SALARY', amount: 80, time: '2026-09-06' },
    ];
    const r = reconcileCashBox([
        settle('2026-09-05', [{ company: 'Ah Seng', item: '菜', amount: 120 }, { company: '', item: '冰', amount: 35 }]),
        settle('2026-09-06', [{ company: '', item: '兼职 Ali', amount: 80 }]),
        settle('2026-09-08', [{ company: 'Ah Seng', item: '菜', amount: 95 }]),
        settle('2026-09-09', [{ company: 'Pasar', item: '鸡', amount: 60 }]),
    ], ap, [], '2026-09-01', '2026-09-30');
    const byText = Object.fromEntries(r.entries.map(e => [`${e.date} ${e.amount}`, e]));

    it('金额 + 名称 + 现金付款 → 已核对；账单日期可早于付款日期', () => {
        expect(byText['2026-09-05 120'].status).toBe('MATCHED');
        expect(byText['2026-09-05 120'].match?.id).toBe('ap1');
        expect(byText['2026-09-06 80'].status).toBe('MATCHED');
        expect(byText['2026-09-06 80'].match?.kind).toBe('PART_TIME');
    });
    it('只有金额与日期相同 → 待核对，不自动确认', () => {
        expect(byText['2026-09-05 35'].status).toBe('TO_VERIFY');
    });
    it('名称相符、金额不同 → 不一致', () => {
        expect(byText['2026-09-08 95'].status).toBe('MISMATCH');
        expect(byText['2026-09-08 95'].match?.id).toBe('ap3');
    });
    it('找不到任何记录 → 缺少 AP / 费用记录', () => {
        expect(byText['2026-09-09 60'].status).toBe('MISSING');
        expect(r.byStatus.MISSING).toEqual({ amount: 60, count: 1 });
    });
});
