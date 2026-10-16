// ============================================================================
// 盈亏对账 · 薪资字段核对（只读）
// ----------------------------------------------------------------------------
// 统一人工成本之前，先确认薪资单上每个字段「是否已经从实发扣掉 / 已经算在应发里」，不盲目加减。
//
// 薪资模块（components/features/hr/HRPayroll.tsx getTotals，2026-10-15 版本）存档的规则：
//   应发 gross = basicSalary + allowance + extraSubsidy + ot + bonus + otherEarning
//   员工扣款   = 罚款（只有开启考勤扣款、且不是「只警告」才扣）+ unpaidLeave + hostelFee + advanceLoan
//              + otherDeduction + loanRepay + ee_epf + ee_socso + ee_eis + ee_lindung + ee_pcb
//   netPay     = gross − 员工扣款
//   totalCost  = gross + er_epf + er_socso + er_eis（不扣无薪假与罚款）
// 存档的 penalty 是「迟到罚款原始金额」，不一定真的扣了。所以逐人用存档的 netPay 反推：
//   netPay = gross − 其他扣款           → 罚款没有扣
//   netPay = gross − 其他扣款 − penalty → 罚款已扣
//   都对不上                            → 列为「对不上」，人工成本不自动采用任何一种
// ============================================================================

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const TOL = 0.05;

export type PenaltyStatus = 'NO_PENALTY' | 'PENALTY_DEDUCTED' | 'PENALTY_NOT_DEDUCTED' | 'MISMATCH';

export interface PayrollEmployeeCheck {
    employeeId: string;
    employeeName: string;
    gross: number;
    extraSubsidy: number;
    unpaidLeave: number;
    penalty: number;
    penaltyStatus: PenaltyStatus;
    /** 存档 netPay 与字段推算的差额（MISMATCH 时才有意义） */
    netPayGap: number;
    advanceLoan: number;
    hostelFee: number;
    otherDeduction: number;
    loanRepay: number;
    employeeStatutory: number;
    employerStatutory: number;
    netPay: number;
    savedTotalCost: number;
    /** 薪资单底薪低于人事档案底薪，同时又有无薪假扣款：可能重复减少 */
    basicBelowProfileWithUnpaidLeave: boolean;
    /** 三套旧算法 / 驾驶舱各自认定的这个人的人工成本 */
    asFinancialReport: number; // 实发 + 全部法定（含员工与雇主、PCB）
    asClassic: number;         // 实发 + 借款扣回（法定已缴才另加，这里不含）
    asCockpit: number;         // 应发 + 雇主供款
    /** 建议口径：应发 − 无薪假 − 已扣罚款 + 雇主供款（对不上时为 null） */
    proposed: number | null;
}

export interface PayrollMonthCheck {
    month: string;
    status: string;
    isStatutoryPaid: boolean;
    totalGovtPay: number;
    employees: PayrollEmployeeCheck[];
    totals: {
        gross: number;
        unpaidLeave: number;
        penaltyDeducted: number;
        penaltyNotDeducted: number;
        advanceLoan: number;
        hostelFee: number;
        otherDeduction: number;
        loanRepay: number;
        employerStatutory: number;
        netPay: number;
        asFinancialReport: number;
        asClassic: number;
        asCockpit: number;
        proposed: number | null;
    };
    mismatchCount: number;
    /** 存档 totalGovtPay 与逐人加总的差额 */
    govtGap: number;
    /** 当月 STAFF_ADVANCE 支出合计 vs 薪资单扣回的预支合计 */
    advanceExpenses: number;
}

export const checkPayrollMonth = (
    record: any,
    employees: any[],
    advanceExpenses = 0,
): PayrollMonthCheck => {
    const byId = new Map(employees.map(e => [e.id, e]));
    const rows: PayrollEmployeeCheck[] = (Array.isArray(record?.details) ? record.details : []).map((d: any) => {
        const gross = num(d.basicSalary) + num(d.allowance) + num(d.extraSubsidy) + num(d.ot) + num(d.bonus) + num(d.otherEarning);
        const employeeStatutory = num(d.ee_epf) + num(d.ee_socso) + num(d.ee_eis) + num(d.ee_lindung) + num(d.ee_pcb);
        const employerStatutory = num(d.er_epf) + num(d.er_socso) + num(d.er_eis);
        const otherDed = num(d.unpaidLeave) + num(d.hostelFee) + num(d.advanceLoan) + num(d.otherDeduction) + num(d.loanRepay) + employeeStatutory;
        const penalty = num(d.penalty);
        const netPay = num(d.netPay);
        const withoutPenalty = gross - otherDed;
        const withPenalty = withoutPenalty - penalty;
        let penaltyStatus: PenaltyStatus;
        let netPayGap = 0;
        if (Math.abs(netPay - withoutPenalty) <= TOL) penaltyStatus = penalty > 0 ? 'PENALTY_NOT_DEDUCTED' : 'NO_PENALTY';
        else if (penalty > 0 && Math.abs(netPay - withPenalty) <= TOL) penaltyStatus = 'PENALTY_DEDUCTED';
        else { penaltyStatus = 'MISMATCH'; netPayGap = r2(netPay - withoutPenalty); }
        const penaltyDeducted = penaltyStatus === 'PENALTY_DEDUCTED' ? penalty : 0;
        const emp = byId.get(d.employeeId);
        const profileBasic = num(emp?.basicSalary);
        return {
            employeeId: d.employeeId,
            employeeName: d.employeeName || emp?.name || d.employeeId,
            gross: r2(gross),
            extraSubsidy: num(d.extraSubsidy),
            unpaidLeave: num(d.unpaidLeave),
            penalty,
            penaltyStatus,
            netPayGap,
            advanceLoan: num(d.advanceLoan),
            hostelFee: num(d.hostelFee),
            otherDeduction: num(d.otherDeduction),
            loanRepay: num(d.loanRepay),
            employeeStatutory: r2(employeeStatutory),
            employerStatutory: r2(employerStatutory),
            netPay,
            savedTotalCost: num(d.totalCost),
            basicBelowProfileWithUnpaidLeave: profileBasic > 0 && num(d.basicSalary) < profileBasic - TOL && num(d.unpaidLeave) > 0,
            asFinancialReport: r2(netPay + employeeStatutory + employerStatutory),
            asClassic: r2(netPay + num(d.loanRepay)),
            asCockpit: r2(gross + employerStatutory),
            proposed: penaltyStatus === 'MISMATCH' ? null : r2(gross - num(d.unpaidLeave) - penaltyDeducted + employerStatutory),
        };
    });
    const sum = (f: (r: PayrollEmployeeCheck) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
    const mismatchCount = rows.filter(r => r.penaltyStatus === 'MISMATCH').length;
    const govtByRows = sum(r => r.employeeStatutory + r.employerStatutory);
    return {
        month: record?.month,
        status: record?.status,
        isStatutoryPaid: !!record?.isStatutoryPaid,
        totalGovtPay: num(record?.totalGovtPay),
        employees: rows,
        totals: {
            gross: sum(r => r.gross),
            unpaidLeave: sum(r => r.unpaidLeave),
            penaltyDeducted: sum(r => (r.penaltyStatus === 'PENALTY_DEDUCTED' ? r.penalty : 0)),
            penaltyNotDeducted: sum(r => (r.penaltyStatus === 'PENALTY_NOT_DEDUCTED' ? r.penalty : 0)),
            advanceLoan: sum(r => r.advanceLoan),
            hostelFee: sum(r => r.hostelFee),
            otherDeduction: sum(r => r.otherDeduction),
            loanRepay: sum(r => r.loanRepay),
            employerStatutory: sum(r => r.employerStatutory),
            netPay: sum(r => r.netPay),
            asFinancialReport: sum(r => r.asFinancialReport),
            asClassic: sum(r => r.asClassic),
            asCockpit: sum(r => r.asCockpit),
            proposed: mismatchCount ? null : sum(r => r.proposed || 0),
        },
        mismatchCount,
        govtGap: r2(num(record?.totalGovtPay) - govtByRows),
        advanceExpenses: r2(advanceExpenses),
    };
};
