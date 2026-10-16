import { describe, expect, it } from 'vitest';
import { auditExpenses } from '../../utils/pnl/audit/expenseAudit';
import { expenseAuditSummaryText } from '../../utils/pnl/audit/expenseAuditReport';
import { legacyFinancialReport } from '../../utils/pnl/reconciliation/legacyFinancialReport';
import { aggregateMonth } from '../../utils/monthlyPnLAggregator';
import { inDateRange } from '../../utils/financialMetrics';
import { toMalaysiaDay } from '../../utils/dateHelper';
import {
    sepBillPayments, sepEmployees, sepPayroll, sepSettlements, sepStandaloneExpenses,
} from './fixtures/pnlAuditSep2026';

// 全部是虚构资料，只在记忆体中计算（不连接任何资料库）
const AI = '🤖 AI 自动抓取识别盲录入';
const extra = [
    { id: 'x_fishcake', company: 'Kilang Fish Cake', particulars: 'Fish Cake 5kg', category: 'SUPPLIES', amount: 85, time: '2026-09-11T10:00:00', paymentStatus: 'PAID', linkUrl: 'https://drive/x1' },
    { id: 'x_coke', company: 'Kedai Runcit', note: 'Coke 100Plus 3 carton', category: 'STAFF_MEAL', amount: 96, time: '2026-09-12T10:00:00', paymentStatus: 'PAID', invoiceRef: 'INV-9' },
    { id: 'x_misc', company: 'Mr DIY', note: '', category: 'EXPENSE', amount: 42.5, time: '2026-09-13T10:00:00', paymentStatus: 'PAID' },
    { id: 'x_split', company: 'Pasar', category: 'SUPPLIER', totalBillAmount: 300, amount: 300, time: '2026-09-14T10:00:00', paymentStatus: 'PAID', linkUrl: 'l',
      categorySplits: [{ category: 'INGREDIENT_VEG', amount: 200 }, { category: 'INGREDIENT_FRUIT', amount: 100 }] },
    { id: 'x_linked', company: 'Ah Kow', category: 'INGREDIENT_EGG', amount: 50, time: '2026-09-15T10:00:00', settlementId: 'audit_s_2026-09-15', paymentStatus: 'PAID', linkUrl: 'l' },
    { id: 'x_loan', company: 'Staff', category: 'STAFF_LOAN', amount: 500, time: '2026-09-16T10:00:00', paymentStatus: 'PAID' },
    // 商号含关键词：QUAN MEE（面）、FISH WORLD（鱼）—— 不能因供应商名称判定分类
    { id: 'x_quanmee', company: 'QUAN MEE HARDWARE TRADING', note: AI, category: 'SUPPLIES', amount: 6.5, time: '2026-09-17T10:00:00', paymentStatus: 'PAID', linkUrl: 'l' },
    { id: 'x_fishworld', company: 'CP FISH WORLD TRADING', note: AI, category: 'SUPPLIES', amount: 46, time: '2026-09-17T11:00:00', paymentStatus: 'PAID', linkUrl: 'l' },
    { id: 'x_software', company: 'SOFTWARE CO', particulars: 'Software & IT service (2026-08-27)', note: AI, category: 'IT_SOFTWARE', amount: 90.59, time: '2026-09-02T10:00:00', paymentStatus: 'PAID', linkUrl: 'l' },
    // 混合发票（仿 EK FRESH IV326322）：水果 64.84 + 蔬菜 117.50 = 182.34，记录上另有扣减 0.10
    { id: 'x_mixed', company: 'EK FRESH SDN BHD', particulars: 'Seasonal vegetables (2026-09-29) · PO: PO20260928006 (Received)', invoiceRef: 'IV326322',
      category: 'INGREDIENT_VEG', amount: 0, totalBillAmount: 182.34, creditNote: 0.1, time: '2026-09-29T10:00:00', paymentStatus: 'UNPAID', linkUrl: 'l',
      categorySplits: [{ category: 'INGREDIENT_FRUIT', amount: 64.84 }, { category: 'INGREDIENT_VEG', amount: 117.5 }] },
    // UTC 存档：马来西亚 9/1 02:00（属于 9 月）与 10/1 01:00（属于 10 月）
    { id: 'x_utc_in', company: 'Late Night', category: 'INGREDIENT_ICE', amount: 20, time: '2026-08-31T18:00:00.000Z', paymentStatus: 'PAID', linkUrl: 'l' },
    { id: 'x_utc_out', company: 'Late Night', category: 'INGREDIENT_ICE', amount: 30, time: '2026-09-30T17:00:00.000Z', paymentStatus: 'PAID', linkUrl: 'l' },
    // 8 月的账单在 9 月付第二期：原账单不在 9 月读取范围，由 parentBills 提供
    { id: 'pay_old_aug_bill_1790500000000', company: 'Old Supplier', category: 'INGREDIENT_MEAT', amount: 700, totalBillAmount: 0, time: '2026-09-05T10:00:00', paymentStatus: 'PAID' },
    // 固定账单镜像（金额与固定账单付款相同）、薪资付款纪录：都不能再计一次
    { id: 'bill_sync_pay_audit_bp_staff_elec', company: 'TNB', category: 'ELECTRICITY_STAFF', amount: 300, time: '2026-09-18T09:00:00', paymentStatus: 'PAID' },
    { id: 'payroll_net_cash_2026-09', company: 'Staff Payroll (Cash)', category: 'SALARY', amount: 4574.25, time: '2026-09-30T12:00:00', paymentStatus: 'PAID' },
    { id: 'payroll_stat_2026-09', company: 'Govt Bodies', category: 'SALARY', amount: 958.1, time: '2026-09-30T12:00:00', paymentStatus: 'PAID' },
    // 拆分合计 90 ≠ 账单 100：传统账目按比例放大成 66.67 + 33.33
    { id: 'x_split_off', company: 'Pasar B', category: 'INGREDIENT_VEG', amount: 100, time: '2026-09-21T10:00:00', paymentStatus: 'PAID', linkUrl: 'l',
      categorySplits: [{ category: 'INGREDIENT_VEG', amount: 60 }, { category: 'INGREDIENT_EGG', amount: 30 }] },
    // 手动登记的「工资余额」，人名与月薪员工相同 → 待确认是否重复
    { id: 'x_manual_salary', company: 'PART TIME', note: '员工甲 salary balance', category: 'SALARY', amount: 100, time: '2026-09-23T10:00:00', paymentStatus: 'PAID', linkUrl: 'l' },
];
const parentBills = new Map([['old_aug_bill', { totalBillAmount: 1400 }]]);
const settlements = sepSettlements.map(s => s.date === '2026-09-15'
    ? { ...s, expenses: [{ id: 'x_linked', category: 'INGREDIENT_EGG', amount: 50 }] }
    : s);
// 固定账单付款：宿舍电费（ELECTRICITY_STAFF，旧算法找不到科目）与一个没有对应的自订分类
const bills = [...sepBillPayments, { id: 'bp_custom', name: '保安费', category: 'SECURITY', amount: 150, date: '2026-09-20' }];
const data = { settlements: settlements as any[], standaloneExpenses: [...sepStandaloneExpenses, ...extra] as any[], billPayments: bills as any[] };
const frInput = { ...data, payrollRecords: sepPayroll as any[], employees: sepEmployees as any[], parentBills };
const fr = legacyFinancialReport(frInput, '2026-09-01', '2026-09-30', 'ACCRUAL');
const a = auditExpenses('2026-09', data, fr.classicCostByCategory, { records: sepPayroll as any[], employees: sepEmployees as any[] }, parentBills);
const row = (id: string) => a.rows.find(r => r.id === id)!;

describe('马来西亚日期', () => {
    it('带时区的时间先换算；没有时区的原样取日期', () => {
        expect(toMalaysiaDay('2026-08-31T18:00:00.000Z')).toBe('2026-09-01');
        expect(toMalaysiaDay('2026-09-30T17:00:00.000Z')).toBe('2026-10-01');
        expect(toMalaysiaDay('2026-09-30T23:00:00')).toBe('2026-09-30');
        expect(toMalaysiaDay('2026-09-30')).toBe('2026-09-30');
        expect(inDateRange('2026-08-31T18:00:00.000Z', '2026-09-01', '2026-09-30')).toBe(true);
        expect(inDateRange('2026-09-30T17:00:00.000Z', '2026-09-01', '2026-09-30')).toBe(false);
    });

    it('单据日期决定月份，付款日期另列', () => {
        expect(row('x_utc_in').date).toBe('2026-09-01');
        expect(row('x_utc_in').utcDate).toBe('2026-08-31');
        expect(row('x_utc_in').treatment).toBe('COUNTED');
        expect(row('x_utc_out').treatment).toBe('OTHER_MONTH');
        expect(row('audit_bill_seafood').date).toBe('2026-09-08');
        expect(row('audit_bill_seafood').paymentDate).toBe('2026-09-10');
        expect(a.totals.utcShifted).toBe(2);
    });
});

describe('杂项费用审计 · 逐笔', () => {
    it('每一笔都有传统账目的处理方式与科目', () => {
        expect(row('x_fishcake').parts[0].line).toBe('UPKEEP OF SHOPLOT');
        expect(row('x_split').parts.map(p => p.line)).toEqual(['VEGETABLE', 'REFRESHMENT (饮料/水吧)']);
        expect(row('x_linked').treatment).toBe('VIA_SETTLEMENT');
        expect(row('x_loan').treatment).toBe('NON_OPERATING');
        expect(row('audit_subscription').treatment).toBe('FOLDED');
        expect(row('audit_subscription').parts[0].line).toBe('OTHER OPERATING EXPENSES');
        expect(row('parttime_audit_1').personal).toBe(true);
    });

    it('各科目与传统账目逐项核对：差额全部为 0（只代表来源找得到）', () => {
        expect(a.lineChecks.filter(x => Math.abs(x.diff) > 0.005)).toEqual([]);
        const veg = a.lineChecks.find(x => x.line === 'VEGETABLE')!;
        expect(veg.fromAP).toBe(r2(200 + 117.44 + 66.67));
        const eggs = a.lineChecks.find(x => x.line === 'INGREDIENTS')!;
        expect(eggs.fromSettlement).toBe(50); // 有 settlementId 的账单由日结副本计入，AP 那份不计
    });

    it('不在对照表的分类不再消失：订阅 120 并入 OTHER OPERATING EXPENSES，传统账目该行含这 120', () => {
        expect(a.notInClassic.map(r => r.id)).toEqual(['audit_subscription']);
        expect(a.totals.folded).toBe(120);
        expect(a.totals.notInClassic).toBe(0);
        const other = a.lineChecks.find(x => x.line === 'OTHER OPERATING EXPENSES')!;
        expect(other.fromAP).toBeGreaterThanOrEqual(120);
        expect(other.diff).toBe(0);
    });
});

describe('同一笔费用只计一次', () => {
    it('分期付款：原账单按全额计一次，pay_ 列不再计（原账单在期间内或期间外都一样）', () => {
        expect(row('pay_audit_bill_seafood_1790000000000').treatment).toBe('DUP_INSTALMENT');
        expect(row('pay_old_aug_bill_1790500000000').treatment).toBe('DUP_INSTALMENT');
        expect(a.totals.duplicateInstalments).toBe(4700);
        const seafood = a.lineChecks.find(x => x.line === 'SEAFOOD (海鲜合计)')!;
        expect(seafood.classic).toBe(6000); // 原账单全额，不是 6,000 + 4,000
        expect(fr.classicCostByCategory.INGREDIENT_MEAT).toBe(26000); // 8 月账单的第二期不计入 9 月
    });

    it('固定账单镜像、薪资付款纪录、对账手续费不计；固定账单付款只计一次', () => {
        expect(row('bill_sync_pay_audit_bp_staff_elec').treatment).toBe('SKIPPED_BILL_SYNC');
        expect(row('payroll_net_cash_2026-09').treatment).toBe('SKIPPED_PAYROLL');
        expect(row('recon_fee_audit_s_2026-09-12_tng').treatment).toBe('SKIPPED_RECON_FEE');
        // 镜像 300 + 付款 300 只算 300，且换成与镜像相同的分类，进入「UTINITY CHARGES STAFF」
        expect(fr.classicCostByCategory.UTILITIES_ELECTRIC_STAFF).toBe(300);
        expect(fr.classicCostByCategory.ELECTRICITY_STAFF).toBeUndefined();
        expect(a.lineChecks.find(x => x.line === 'UTINITY CHARGES STAFF')?.classic).toBe(300);
    });

    it('每日结算的钱箱支出完全不纳入（不计费、不配对、不做漏账判断）', () => {
        expect(JSON.stringify(a)).not.toContain('钱箱买冰');
        expect((a as any).cashBox).toBeUndefined();
        expect(a.suggestions.some(s => s.includes('钱箱'))).toBe(false);
    });

    it('修正前的算法会重复计入分期付款、漏掉 UTC 切日的记录：修正后差额正好是这两项', () => {
        const before = legacyFinancialReport(frInput, '2026-09-01', '2026-09-30', 'ACCRUAL', 'BEFORE_FIX');
        // 修正前：多计分期 4,000 + 700、多计 10 月 1 日的 30、漏计 9 月 1 日的 20
        // 宿舍电费 300 修正前找不到科目：传统账目画面整笔消失（净利不受影响，但科目合计少 300）
        expect(r2(before.netProfit - fr.netProfit)).toBe(r2(-4000 - 700 - 30 + 20));
        expect(before.classicCostByCategory.ELECTRICITY_STAFF).toBe(300);
        // 多月份导出（aggregateMonth）与画面同口径
        const agg = aggregateMonth('2026-09', { ...frInput, standaloneExpenses: data.standaloneExpenses.filter(e => !String(e.id).startsWith('pay_')) } as any, 'ACCRUAL');
        expect(agg.costByCategory.INGREDIENT_ICE).toBe(20);
    });
});

describe('人工：Payroll 为准，工资只计一次', () => {
    const L = a.labour!;
    it('应发 = 实发 + 预支扣回 + 员工法定扣款 + 其他扣款', () => {
        expect(L.identity).toEqual({ gross: 5300, netPay: 4574.25, advanceLoan: 300, employeeStatutory: 425.75, otherDeductions: 0, gap: 0 });
    });
    it('预支 300 在发放时计入，薪资单实发已扣回同一笔 → 不重复', () => {
        expect(L.advanceAP).toBe(300);
        expect(L.advanceGap).toBe(0);
        expect(L.notes.some(n => n.includes('工资只计一次'))).toBe(true);
    });
    it('传统账目人工组成与 LABOUR CHARGES + STATUTORY 一致；法定缴款未缴时不计并提示', () => {
        const lines = a.lineChecks.filter(x => x.line === 'LABOUR CHARGES' || x.line.startsWith('STATUTORY'));
        expect(L.classic.total).toBe(r2(lines.reduce((s, x) => s + x.classic, 0)));
        expect(L.classic.payrollNet).toBe(4574.25);
        expect(L.classic.advance).toBe(300);
        expect(L.classic.partTime).toBe(450);
        expect(L.classic.manualSalary).toBe(100);
        expect(L.notes.some(n => n.includes('尚未标记已缴'))).toBe(true);
    });
    it('薪资付款纪录只核对不计入；手动工资人名与月薪员工相同 → 待确认', () => {
        expect(L.payrollPaymentRecords.netGap).toBe(0);
        expect(L.payrollPaymentRecords.statGap).toBe(0);
        expect(L.possibleDuplicates.map(x => x.row.id)).toEqual(['x_manual_salary']);
        expect(L.partTimeCount).toBe(1);
    });
    it('预支没在当月扣回 → 说明差额，不当成没问题', () => {
        const more = auditExpenses('2026-09', { ...data, standaloneExpenses: [...data.standaloneExpenses, { id: 'adv_x', company: 'X', category: 'STAFF_ADVANCE', amount: 200, time: '2026-09-28T10:00:00' }] },
            fr.classicCostByCategory, { records: sepPayroll as any[], employees: sepEmployees as any[] }, parentBills);
        expect(more.labour!.advanceGap).toBe(200);
        expect(more.labour!.notes.some(n => n.includes('尚未扣回'))).toBe(true);
    });
});

describe('完整计入与金额拆项', () => {
    it('不依供应商名称或关键词推测分类：没有任何「建议改分类」', () => {
        expect(JSON.stringify(a)).not.toContain('suggestedCategory');
        expect((a as any).suspicious).toBeUndefined();
        expect(a.suggestions.some(s => s.includes('太笼统'))).toBe(false);
    });
    it('固定账单付款换成 AP 分类后仍没有科目的，列出来（整笔没有计入）', () => {
        expect(a.unmappedBills).toEqual([{ id: 'bp_custom', date: '2026-09-20', name: '保安费', category: 'SECURITY', amount: 150, line: 'OTHER OPERATING EXPENSES' }]);
    });
    it('拆分合计与账单全额不同 → 列出；EK FRESH 式拆分（合计 = 账单）不列，扣减按比例分摊', () => {
        expect(a.splitMismatch.map(r => r.id)).toEqual(['x_split_off']);
        expect(row('x_split_off').parts.map(p => p.amount)).toEqual([66.67, 33.33]);
        const m = row('x_mixed');
        expect(m.splitTotal).toBe(182.34);
        expect(m.accrualAmount).toBe(182.24);
        expect(m.parts.map(p => p.amount)).toEqual([64.8, 117.44]);
        expect(a.creditNoteRows.map(r => r.id)).toEqual(['x_mixed']);
        expect(a.totals.creditNotes).toBe(0.1);
    });
});

describe('摘要', () => {
    it('摘要列出供应商证据；不列员工姓名', () => {
        const text = expenseAuditSummaryText(a);
        expect(text).toContain('Pasar B');
        expect(text).toContain('IV326322');
        expect(text).toContain('差额为 0 只代表');
        expect(text).not.toContain('员工甲');
        expect(text).not.toContain('员工乙');
    });
});

function r2(n: number) { return Math.round(n * 100) / 100 + 0; }

describe('传统账目排版不变', () => {
    it('不在对照表的分类并入既有的行：行数与行 ID 完全相同，只有金额与 ⚠ 提示不同', async () => {
        const { buildClassicPnL } = await import('../../utils/classicPnLBuilder');
        const base = { month: '2026-09', storehub: null, platformGross: { grab: 0, shopee: 0, panda: 0, lalamove: 0 }, viewMode: 'DETAILED', channelMode: 'IN_STORE',
            includeCost: true, costDetailMode: 'DETAILED', laborByDept: {}, inStoreSales: 10000 } as any;
        const plain = buildClassicPnL({ ...base, costByCategory: { MISC_OPEX: 100, SUPPLIER: 50 } });
        const withUnmapped = buildClassicPnL({ ...base, costByCategory: { MISC_OPEX: 100, SUPPLIER: 50, SUBSCRIPTION: 120, INGREDIENT_OTHER: 30 } });
        expect(withUnmapped.rows.map(r => r.id)).toEqual(plain.rows.map(r => r.id));
        const other = withUnmapped.rows.find(r => r.id === 'OTHER_OPEX')!;
        expect(other.amount).toBe(220);
        expect(other.warn).toBe(true);
        expect(other.note).toContain('SUBSCRIPTION');
        expect(withUnmapped.rows.find(r => r.id === 'INGREDIENTS')!.amount).toBe(80);
        expect(withUnmapped.rows.find(r => r.id === 'ING_OTHERS')!.amount).toBe(80); // 子行与父行一致
        expect(r2(plain.netProfit - withUnmapped.netProfit)).toBe(150);
    });
});

describe('员工借款从薪水扣回：工资成本不能因此变少', () => {
    // 员工乙 8 月借 3,000（STAFF_LOAN，资产），9 月从薪水扣回 1,000
    const payroll = [{ ...sepPayroll[0], details: sepPayroll[0].details.map((d: any) => d.employeeId === 'E2' ? { ...d, loanRepay: 1000, netPay: d.netPay - 1000 } : d) }];
    const input = { ...frInput, payrollRecords: payroll as any[] };
    it('传统账目薪资 = 实发 + 借款扣回；修正前少算 1,000', () => {
        const after = legacyFinancialReport(input, '2026-09-01', '2026-09-30', 'ACCRUAL');
        const before = legacyFinancialReport(input, '2026-09-01', '2026-09-30', 'ACCRUAL', 'BEFORE_FIX');
        expect(after.classicCostByCategory.PAYROLL).toBe(4574.25);
        expect(before.classicCostByCategory.PAYROLL).toBe(3574.25);
        expect(aggregateMonth('2026-09', input as any, 'ACCRUAL').costByCategory.PAYROLL).toBe(4574.25);
    });
    it('借款发出（STAFF_LOAN）不进盈亏；审计说明借款扣回', () => {
        expect(row('x_loan').treatment).toBe('NON_OPERATING');
        const res = auditExpenses('2026-09', data, legacyFinancialReport(input, '2026-09-01', '2026-09-30', 'ACCRUAL').classicCostByCategory,
            { records: payroll as any[], employees: sepEmployees as any[] }, parentBills);
        expect(res.labour!.identity!.otherDeductions).toBe(1000);
        expect(res.labour!.notes.some(n => n.includes('借款还款 1000.00'))).toBe(true);
        expect(res.labour!.classic.payrollNet).toBe(4574.25);
    });
});

describe('宿舍费算人工（负责人决定）', () => {
    it('薪资单写了宿舍费：传统账目薪资照全额，不因宿舍费减少', () => {
        const payroll = [{ ...sepPayroll[0], details: sepPayroll[0].details.map((d: any) => d.employeeId === 'E1' ? { ...d, hostelFee: 150, netPay: d.netPay - 150 } : d) }];
        const input = { ...frInput, payrollRecords: payroll as any[] };
        expect(legacyFinancialReport(input, '2026-09-01', '2026-09-30', 'ACCRUAL').classicCostByCategory.PAYROLL).toBe(4574.25);
        expect(aggregateMonth('2026-09', input as any, 'ACCRUAL').costByCategory.PAYROLL).toBe(4574.25);
    });
});
