// ============================================================================
// 统一盈亏审计 · 虚构 2026 年 9 月：同一份资料，各套算法算出的经营盈亏
// ----------------------------------------------------------------------------
// 这是「现况记录」测试：把目前各算法的结果与手算的正确答案并列，差额逐项解释。
// 统一引擎完成后（PR 2），所有页面必须等于 CORRECT.netProfit。
//   - 传统账目（Classic）、老板驾驶舱：直接执行现有程序。
//   - FinancialReport 首页「经营净利」与经营日报：计算写在组件里，无法单独呼叫，
//     这里照原始码公式逐项抄算（行号见各段注解），并以 aggregateMonth 的分类结果为输入。
// 不连任何资料库。
// ============================================================================
import { describe, expect, it } from 'vitest';
import { aggregateMonth, categorizeExpense } from '../../utils/monthlyPnLAggregator';
import { buildClassicPnL } from '../../utils/classicPnLBuilder';
import { loadCockpitWith, type CockpitDataSource } from '../../utils/cockpit/cockpitLoader';
import { resolvePeriod } from '../../utils/cockpit/periods';
import {
    SEP_DAYS, sepBillPayments, sepEmployees, sepPayroll, sepSettlements, sepStandaloneExpenses,
} from './fixtures/pnlAuditSep2026';

const r2 = (n: number) => Math.round(n * 100) / 100;
const raw = {
    settlements: sepSettlements as any[],
    standaloneExpenses: sepStandaloneExpenses as any[],
    billPayments: sepBillPayments as any[],
    payrollRecords: sepPayroll as any[],
    employees: sepEmployees as any[],
};

// ── 手算的正确答案（权责发生制，2026-09） ──
const CORRECT = {
    // POS 2,500 × 30 − 退款 100 + Grab 总额 500 × 30
    revenue: 74900 + 15000,
    // 已对账 15 天 ×（500 − 370）+ 未对账 15 天 ×（500 −（400 − 20））
    platform: 15 * 130 + 15 * 120,
    // 肉 26,000 + 海鲜账单全额 6,000（分期付款 4,000 是同一张账单，不再计）—— 采购口径，暂估
    food: 26000 + 6000,
    // 雇主人工成本：E1 应发 3,300 + 雇主 EPF/SOCSO/EIS 492.35；E2 应发 2,000 + 雇主 EPF 40
    //（E2 的预支 300 已含在应发里，预支支出不再计）+ 兼职 450 + 员工餐 300
    labour: 3792.35 + 2040 + 450 + 300,
    // 租金 12,000 + 电费 2,200（未付也计）+ 订阅 120 + 宿舍电费 300 + 收款手续费 25
    //（日结钱箱支出 35 不计：负责人 2026-10-16 决定，钱箱支出只用于现金核对）
    opex: 12000 + 2200 + 120 + 300 + 25,
    netProfit: 0,
};
CORRECT.netProfit = r2(CORRECT.revenue - CORRECT.platform - CORRECT.food - CORRECT.labour - CORRECT.opex);

const agg = aggregateMonth('2026-09', raw as any, 'ACCRUAL');
const sumWhere = (pred: (cat: string) => boolean) =>
    r2(Object.entries(agg.costByCategory).filter(([k]) => pred(k)).reduce((s, [, v]) => s + v, 0));

describe('2026-09 虚构资料 · 正确答案', () => {
    it('权责发生制经营净利 = 32,922.65', () => {
        expect(CORRECT.netProfit).toBe(32922.65);
    });
});

describe('现有算法 1：FinancialReport 首页「经营净利」（业务发生制）', () => {
    // FinancialReport.tsx:762-784（本资料：薪资已 POSTED、整月 30 天都有日结）
    //   netRealizedRevenue = 营业额 − 平台抽佣（广告不另扣）
    //   人工 = payrollSummary.monthlyTotal（实发 + totalGovtPay）× 30/30；此时所有 LABOR 类支出不计
    //   支出与 aggregateMonth 相同（同一份抄写），recon_fee_ 略过、dayExpenses 不读
    const revenue = r2(agg.inStoreSales + agg.platformGross.grab);
    const platform = sumWhere(k => k.startsWith('PLATFORM_'));
    const food = sumWhere(k => categorizeExpense(k) === 'COGS');
    const labour = r2(sepPayroll[0].totalNetPay + sepPayroll[0].totalGovtPay);
    const opex = sumWhere(k => categorizeExpense(k) === 'OPEX' && !k.startsWith('PLATFORM_'));
    const netProfit = r2(revenue - platform - food - labour - opex);

    it('结果 30,297.65，比正确答案少 2,625.00', () => {
        expect({ revenue, platform, food, labour, opex, netProfit }).toEqual({
            revenue: 89900, platform: 3450, food: 36000, labour: 5532.35, opex: 14620, netProfit: 30297.65,
        });
        expect(r2(netProfit - CORRECT.netProfit)).toBe(-2625);
    });
    it('逐项差异可以解释', () => {
        expect(platform - CORRECT.platform).toBe(-300); // 未对账 15 天的广告 20 × 15 没扣
        expect(food - CORRECT.food).toBe(4000);          // 海鲜分期付款 pay_ 列重复计入
        expect(r2(labour - CORRECT.labour)).toBe(-1050); // 预支 300 + 兼职 450 + 员工餐 300 被排除
        expect(opex - CORRECT.opex).toBe(-25);           // 收款手续费 25 未计
    });
});

describe('现有算法 2：传统账目 Classic P&L（业务发生制）', () => {
    const classic = buildClassicPnL({
        month: '2026-09', storehub: null, platformGross: agg.platformGross, costByCategory: agg.costByCategory,
        viewMode: 'DETAILED', channelMode: 'IN_STORE', includeCost: true, costDetailMode: 'DETAILED',
        laborByDept: agg.laborByDept, inStoreSales: agg.inStoreSales,
    } as any);

    it('结果 30,205.75，比正确答案少 2,716.90（2026-10-16 起宿舍电费 300、订阅 120 不再消失）', () => {
        expect({
            sales: r2(classic.salesTotal), cost: r2(classic.costTotal), personal: r2(classic.personalTotal),
            selling: r2(classic.sellingTotal), operation: r2(classic.operationTotal), netProfit: r2(classic.netProfit),
        }).toEqual({ sales: 89900, cost: 36000, personal: 5624.25, selling: 3450, operation: 14620, netProfit: 30205.75 });
        expect(r2(classic.netProfit - CORRECT.netProfit)).toBe(-2716.9);
    });
    it('逐项差异可以解释', () => {
        expect(classic.costTotal - CORRECT.food).toBe(4000);                 // pay_ 重复（aggregateMonth 本身不排除；财务报表画面与导出在呼叫前已排除）
        expect(r2(classic.personalTotal - CORRECT.labour)).toBe(-958.1);     // 法定供款未缴 → 整笔 958.10 不计
        expect(classic.sellingTotal - CORRECT.platform).toBe(-300);          // 未对账日广告
        expect(classic.operationTotal - CORRECT.opex).toBe(-25);             // 手续费 25 未计（宿舍电费 300 换成 AP 分类、订阅 120 并入 OTHER OPERATING EXPENSES）
    });
});

describe('现有算法 3：老板驾驶舱「上个月」（业务发生制）', () => {
    const source: CockpitDataSource = {
        getPnLRawRange: async () => ({ settlements: raw.settlements, billPayments: raw.billPayments, standaloneExpenses: raw.standaloneExpenses }),
        getEmployees: async () => raw.employees,
        getPayrollRecords: async () => raw.payrollRecords,
        getAttendanceReviewsByMonth: async () => [],
        getStandaloneExpensesByIds: async ids => raw.standaloneExpenses.filter(e => ids.includes(e.id)),
    };

    it('结果等于正确答案 32,922.65，状态不是「已确认」（15 个平台日未对账）', async () => {
        // 修改前的驾驶舱算法（2026-10-16 起钱箱支出也不计入）
        const result = await loadCockpitWith(source, resolvePeriod('LAST_MONTH', '2026-10-15'), '2026-10-15', 'ACCRUAL', { useEngine: false });
        const k = result.kpis;
        expect(k.revenue.value).toBe(CORRECT.revenue);
        expect(k.food.value).toBe(CORRECT.food);
        expect(k.labour.value).toBe(CORRECT.labour);
        expect(k.actualProfit.value).toBe(CORRECT.netProfit);
        expect(k.actualProfit.status).not.toBe('CONFIRMED');
    });
});

describe('修改后：驾驶舱改读唯一盈亏引擎', () => {
    const source: CockpitDataSource = {
        getPnLRawRange: async () => ({ settlements: raw.settlements, billPayments: raw.billPayments, standaloneExpenses: raw.standaloneExpenses }),
        getEmployees: async () => raw.employees,
        getPayrollRecords: async () => raw.payrollRecords,
        getAttendanceReviewsByMonth: async () => [],
        getStandaloneExpensesByIds: async ids => raw.standaloneExpenses.filter(e => ids.includes(e.id)),
    };
    it('驾驶舱利润 = 引擎；钱箱 35 不计入、也不做漏账判断；平台未对账 → 暂估／待核对', async () => {
        const result = await loadCockpitWith(source, resolvePeriod('LAST_MONTH', '2026-10-15'), '2026-10-15', 'ACCRUAL', { useEngine: true });
        const k = result.kpis;
        expect(k.actualProfit.value).toBe(32922.65);
        expect(k.labour.value).toBe(6582.35);
        expect(k.actualProfit.status).not.toBe('CONFIRMED');
        expect(k.actualProfit.label).toContain('暂估／待核对');
        expect(result.alerts.some(a => a.title.includes('钱箱') || a.title === '费用可能遗漏')).toBe(false);
        expect(result.integrity.some(i => i.label.includes('钱箱'))).toBe(false);
        // 月底预测 / 保本也用同一份引擎结果：整月已结束，预计月底利润 = 实际利润
        expect(k.projectedProfit.value).toBe(32922.65);
    });
});

describe('现有算法 4：经营日报（每日，无月度净利）', () => {
    // DailyBusinessReportModal.tsx:303-348
    //   营业额 = sales.total（已扣广告、未扣退款）
    //   食材 = 当天食材类独立支出 > 0 ? 实际 : 营业额 × 35%
    //   净利 = 营业额 − 食材 − 钱箱支出 − 广告（广告第二次扣）；没有人工、租金、水电
    const FOOD_KEYS = ['INGREDIENT', 'MEAT', 'SEAFOOD', 'VEG', 'DRY', 'SAUCE', 'NOODLE', 'OIL', 'EGG', 'FROZEN', 'BEVERAGE', 'SUPPLIER'];
    const dbrDay = (date: string) => {
        const s = sepSettlements.find(x => x.date === date)!;
        const revenue = s.sales.total;
        const food = sepStandaloneExpenses
            .filter(e => String(e.time).slice(0, 10) === date && FOOD_KEYS.some(k => e.category.toUpperCase().includes(k)))
            .reduce((sum, e) => sum + e.amount, 0);
        const cogs = food > 0 ? food : revenue * 0.35;
        const cash = [...s.expenses, ...s.dayExpenses].reduce((sum, e) => sum + e.amount, 0);
        return r2(revenue - cogs - cash - s.sales.deliveryBreakdown.grabAds);
    };

    it('9 月 5 日显示 1,817（35% 估算食材，广告扣两次）', () => {
        expect(dbrDay('2026-09-05')).toBe(1817);
    });
    it('30 天加总 26,549：不是月度盈亏（缺人工、租金、水电；食材一半靠 35% 猜测）', () => {
        expect(r2(SEP_DAYS.reduce((s, d) => s + dbrDay(d), 0))).toBe(26549);
    });
});
