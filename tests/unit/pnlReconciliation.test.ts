import { describe, expect, it } from 'vitest';
import { reconcileMonth, reconciliationSummaryText, type ReconSource } from '../../utils/pnl/reconciliation/reconcileMonth';
import { checkPayrollMonth } from '../../utils/pnl/reconciliation/payrollFieldCheck';
import { legacyFinancialReport } from '../../utils/pnl/reconciliation/legacyFinancialReport';
import {
    sepBillPayments, sepEmployees, sepPayroll, sepSettlements, sepStandaloneExpenses,
} from './fixtures/pnlAuditSep2026';

const sourceOf = (over: Partial<{ settlements: any[]; standalone: any[]; bills: any[]; payroll: any[]; employees: any[]; recurring: any[] }> = {}): ReconSource => {
    const settlements = over.settlements ?? sepSettlements;
    const standalone = over.standalone ?? sepStandaloneExpenses;
    const bills = over.bills ?? sepBillPayments;
    return {
        getPnLRawRange: async (s, e) => ({
            settlements: settlements.filter(x => x.date >= s && x.date <= e) as any,
            billPayments: bills.filter(x => x.date >= s && x.date <= e) as any,
            standaloneExpenses: standalone.filter((x: any) => {
                const t = String(x.time).slice(0, 10), p = String(x.paymentDate || '').slice(0, 10);
                return (t >= s && t <= e) || (p >= s && p <= e);
            }) as any,
        }),
        getEmployees: async () => (over.employees ?? sepEmployees) as any,
        getPayrollRecords: async () => (over.payroll ?? sepPayroll) as any,
        getAttendanceReviewsByMonth: async () => [],
        getStandaloneExpensesByIds: async ids => standalone.filter((x: any) => ids.includes(x.id)) as any,
        getRecurringBills: async () => over.recurring ?? [],
    };
};

describe('盈亏对账 · 虚构 9 月', () => {
    it('三套算法的数字与审计文件一致，差额全部可以解释（未能解释 = 0）', async () => {
        const r = await reconcileMonth(sourceOf(), '2026-09', '2026-10-15');
        expect(r.algorithms.A.netProfit).toBe(30297.65);
        expect(r.algorithms.B.netProfit).toBe(30625.75);
        expect(r.algorithms.C.netProfit).toBe(32887.65);
        expect(r.algorithms.B.exportNetProfit).toBe(30625.75);
        expect(r.algorithms.D.sum).toBe(26549);
        expect(r.unexplainedA).toBe(0);
        expect(r.unexplainedB).toBe(0);
        // 五行加总 = 净利（每一套）
        for (const k of ['A', 'B', 'C'] as const) {
            const a = r.algorithms[k];
            expect(Math.round((a.revenue - a.platform - a.food - a.labour - a.opex) * 100) / 100).toBe(a.netProfit);
        }
    });

    it('逐项差异来源的金额', async () => {
        const r = await reconcileMonth(sourceOf(), '2026-09', '2026-10-15');
        const f = Object.fromEntries(r.findings.map(x => [x.id, x]));
        expect(f.DUP_INSTALMENT.amount).toBe(4000);
        expect(f.DUP_INSTALMENT.count).toBe(1);
        expect(f.PLATFORM_UNRECONCILED.amount).toBe(300);
        expect(f.PLATFORM_UNRECONCILED.count).toBe(15);
        expect(f.PETTY_CASH.amount).toBe(35);
        expect(f.BANK_FEE.amount).toBe(25);
        expect(f.FR_LABOUR_EXPENSES_EXCLUDED.amount).toBe(1050);
        expect(f.CLASSIC_UNMAPPED.amount).toBe(420);
        expect(f.CLASSIC_STATUTORY_UNPAID.amount).toBe(958.1);
        expect(f.MISSING_SETTLEMENT.count).toBe(0);
        expect(r.payroll?.mismatchCount).toBe(0);
    });

    it('摘要不含员工姓名', async () => {
        const r = await reconcileMonth(sourceOf(), '2026-09', '2026-10-15');
        const text = reconciliationSummaryText(r);
        expect(text).toContain('30,297.65');
        expect(text).not.toContain('员工甲');
        expect(text).not.toContain('员工乙');
    });

    it('缺日结、缺固定账单、疑似重复、旧 Grab 资料、UTC 跨月都会列出', async () => {
        const settlements = sepSettlements.filter(s => s.date !== '2026-09-07').map(s => s.date === '2026-09-08'
            ? { ...s, sales: { ...s.sales, deliveryBreakdown: { ...s.sales.deliveryBreakdown, grabGross: 0 } } }
            : s);
        const standalone = [
            ...sepStandaloneExpenses,
            { id: 'dup_a', company: 'TNB', category: 'UTILITIES_ELECTRIC', amount: 300, time: '2026-09-18T10:00:00', paymentStatus: 'PAID' },
            { id: 'veg_1', company: 'Ah Seng', category: 'INGREDIENT_VEG', amount: 500, time: '2026-09-11T10:00:00' },
            { id: 'veg_2', company: 'ah seng ', category: 'INGREDIENT_VEG', amount: 500, time: '2026-09-11T11:00:00' },
            // 马来西亚 9/1 02:00 登记，存成 UTC → 系统算 8/31
            { id: 'utc_1', company: 'X', category: 'INGREDIENT_EGG', amount: 80, time: '2026-08-31T18:00:00.000Z' },
        ];
        const recurring = [
            { id: 'audit_rb_staff_elec', name: '宿舍电费', amount: 300, type: 'MONTHLY', category: 'ELECTRICITY_STAFF', isActive: true, isArchived: false },
            { id: 'rb_water', name: '店面水费', amount: 180, type: 'MONTHLY', category: 'WATER', isActive: true, isArchived: false },
            { id: 'rb_license', name: '执照', amount: 900, type: 'YEARLY', dueMonth: 3, category: 'LICENSE', isActive: true, isArchived: false },
        ];
        const r = await reconcileMonth(sourceOf({ settlements, standalone, recurring }), '2026-09', '2026-10-15');
        const f = Object.fromEntries(r.findings.map(x => [x.id, x]));
        expect(r.missingSettlementDays).toEqual(['2026-09-07']);
        expect(f.MISSING_FIXED_COST.records.map(x => x.label)).toEqual(['店面水费（WATER）']);
        expect(f.SUSPECTED_DUPLICATE.records.map(x => x.label)).toEqual([
            '固定账单「ELECTRICITY_STAFF」与应付账款「TNB」金额相同',
            '应付账款「Ah Seng」同金额 2 笔（INGREDIENT_VEG）',
        ]);
        expect(f.LEGACY_GRAB_GROSS.count).toBe(1);
        expect(f.LEGACY_GRAB_GROSS.amount).toBe(400);
        expect(f.UTC_DATE.records.some(x => x.note?.includes('跨月'))).toBe(true);
        expect(r.algorithms.A.settledDays).toBe(29);
        expect(r.unexplainedA).toBe(0);
        expect(r.unexplainedB).toBe(0);
    });
});

describe('薪资字段核对：不盲目加减', () => {
    const base = {
        employeeId: 'E9', employeeName: 'X', basicSalary: 2000, allowance: 0, extraSubsidy: 100, ot: 0, bonus: 0, otherEarning: 0,
        unpaidLeave: 150, hostelFee: 50, advanceLoan: 0, otherDeduction: 0, loanRepay: 0,
        ee_epf: 0, ee_socso: 0, ee_eis: 0, ee_pcb: 0, er_epf: 0, er_socso: 0, er_eis: 0,
    };
    it('罚款已从实发扣掉 → 建议口径扣罚款', () => {
        const c = checkPayrollMonth({ month: '2026-09', status: 'POSTED', details: [{ ...base, penalty: 30, netPay: 2100 - 150 - 50 - 30 }] }, []);
        expect(c.employees[0].penaltyStatus).toBe('PENALTY_DEDUCTED');
        expect(c.employees[0].proposed).toBe(2100 - 150 - 30);
        expect(c.employees[0].asCockpit).toBe(2100);
    });
    it('罚款只记录、没有扣 → 不能当成本减少', () => {
        const c = checkPayrollMonth({ month: '2026-09', status: 'POSTED', details: [{ ...base, penalty: 30, netPay: 2100 - 150 - 50 }] }, []);
        expect(c.employees[0].penaltyStatus).toBe('PENALTY_NOT_DEDUCTED');
        expect(c.employees[0].proposed).toBe(2100 - 150);
        expect(c.totals.penaltyNotDeducted).toBe(30);
    });
    it('实发对不上 → 不自动采用任何口径', () => {
        const c = checkPayrollMonth({ month: '2026-09', status: 'POSTED', details: [{ ...base, penalty: 0, netPay: 1777 }] }, []);
        expect(c.employees[0].penaltyStatus).toBe('MISMATCH');
        expect(c.employees[0].proposed).toBeNull();
        expect(c.totals.proposed).toBeNull();
        expect(c.mismatchCount).toBe(1);
    });
    it('底薪已低于档案又有无薪假 → 提示可能重复减少', () => {
        const c = checkPayrollMonth({ month: '2026-09', status: 'POSTED', details: [{ ...base, penalty: 0, netPay: 2100 - 150 - 50 }] }, [{ id: 'E9', basicSalary: 2400 }]);
        expect(c.employees[0].basicBelowProfileWithUnpaidLeave).toBe(true);
    });
});

describe('财务报表首页照抄：人工来源', () => {
    it('没有薪资、没有底薪、没有人工支出 → 57,300 后备值', () => {
        const r = legacyFinancialReport({ settlements: sepSettlements, standaloneExpenses: [], billPayments: [], payrollRecords: [], employees: [] }, '2026-09-01', '2026-09-30');
        expect(r.labourSource).toBe('FALLBACK_57300');
        expect(r.labour).toBe(57300);
    });
    it('草稿薪资 → 用草稿实发 + 法定', () => {
        const draft = [{ ...sepPayroll[0], status: 'DRAFT' }];
        const r = legacyFinancialReport({ settlements: sepSettlements, standaloneExpenses: [], billPayments: [], payrollRecords: draft, employees: sepEmployees }, '2026-09-01', '2026-09-30');
        expect(r.labourSource).toBe('DRAFT');
        expect(r.labour).toBe(5532.35);
    });
});

describe('钱箱支出核对：疑似同一笔被记两次', () => {
    it('同日同金额的兼职工资会被配对；用途按文字粗分；每笔另外的记录只配对一次', async () => {
        const { checkPettyCash, classifyPettyCashUse } = await import('../../utils/pnl/reconciliation/pettyCashCheck');
        const settlements = [
            { date: '2026-09-20', dayExpenses: [{ company: '', item: '兼职 Ali 工资', amount: 450 }, { company: 'Kedai', item: '买冰', amount: 35 }] },
            { date: '2026-09-21', dayExpenses: [{ company: '', item: '杂费', amount: 450 }] },
        ];
        const r = checkPettyCash(settlements, sepStandaloneExpenses, '2026-09-01', '2026-09-30');
        expect(r.total).toBe(935);
        expect(r.entries[0].match?.type).toBe('PART_TIME');
        expect(r.entries[2].match).toBeUndefined(); // parttime_audit_1 已配对过
        expect(r.matched.PART_TIME).toEqual({ amount: 450, count: 1 });
        expect(r.byUse.LABOUR.amount).toBe(450);
        expect(r.byUse.FOOD.amount).toBe(35);
        expect(classifyPettyCashUse('Gas LPG 14kg')).toBe('FUEL');
        expect(classifyPettyCashUse('修理水管')).toBe('OTHER');
        expect(classifyPettyCashUse('矿泉水 2 箱')).toBe('FOOD');
    });

    it('对账结果与摘要包含钱箱核对；摘要不列钱箱文字内容（可能含员工姓名）', async () => {
        const settlements = sepSettlements.map(s => s.date === '2026-09-20' ? { ...s, dayExpenses: [{ company: '', item: '兼职 Ali 工资', amount: 450 }] } : s);
        const r = await reconcileMonth(sourceOf({ settlements }), '2026-09', '2026-10-15');
        const f = Object.fromEntries(r.findings.map(x => [x.id, x]));
        expect(f.PETTY_CASH_OVERLAP.amount).toBe(450);
        expect(f.PETTY_CASH_OVERLAP.needsDecision).toBe(true);
        const text = reconciliationSummaryText(r);
        expect(text).toContain('与其他记录同金额');
        expect(text).not.toContain('Ali');
        expect(text).toContain('住宿费');
    });
});
