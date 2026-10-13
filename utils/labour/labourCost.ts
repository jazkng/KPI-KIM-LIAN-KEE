// ============================================================================
// 人工成本与盈利分析（Issue #8）
// ----------------------------------------------------------------------------
// 原则：
//   - 底薪与 EPF / SOCSO / EIS / LINDUNG 一律沿用薪资模块的设定与算法
//     （utils/payroll/statutory.ts，与 HRPayroll 同一份），不另写一套。
//   - 「员工扣款」与「雇主成本」分开：
//       雇主人工成本 = 应发薪资（底薪 + 固定津贴）+ 雇主 EPF + 雇主 SOCSO + 雇主 EIS
//       （已批准加班暂不计入：加班规则待负责人确认；已发薪资里的加班照实计入）
//       员工 EPF / SOCSO / EIS / LINDUNG 已经包含在应发薪资里，只是从员工那边扣，不能再加一次。
//   - 该月已有薪资记录（已发放）的员工，以实际薪资为准；其余才用考勤推算，并标为「估算」。
//   - 损益里的薪资类支出（SALARY、EPF、SOCSO…）不再计入「其他固定成本」，避免重复计算。
//   - 资料不完整时（没有底薪、考勤异常未处理、营业额天数不足……）结果一律标为「估算」并列出原因。
// ============================================================================
import type { Employee, PayrollRecord } from '../../types';
import {
    calculateEIS,
    calculateEPF,
    calculateLindung,
    calculateSOCSO,
    getHistoricalSalary,
    isLindungMonth,
} from '../payroll/statutory';

/** 与薪资模块相同：本地员工才有 SOCSO / EIS；EPF 本地必扣，外劳看人事档案 */
export const isLocalEmployee = (emp: Employee): boolean =>
    (emp.nationality || '').includes('Malaysian') || (emp.nationality || '').includes('🇲🇾');

export interface AttendanceSummary {
    daysWorked: number;
    workedMinutes: number;
    approvedOtMinutes: number;
}

export interface LabourCostOptions {
    month: string; // YYYY-MM
    /** 加班倍数，默认 1.5（马来西亚雇佣法令）。只在 includeOvertime 为 true 时使用 */
    otMultiplier?: number;
    /**
     * 是否把已批准加班计入人工成本。默认 false：
     * 负责人尚未确认实际班表与加班计算规则，加班费不自动计算、不计入成本。
     */
    includeOvertime?: boolean;
    /** 月薪员工换算时薪：月薪 ÷ 26 天 ÷ 8 小时（雇佣法令算法） */
    workingDaysPerMonth?: number;
    normalHoursPerDay?: number;
}

export interface EmployeeLabourCost {
    employeeId: string;
    employeeName: string;
    department: string;
    source: 'PAYROLL' | 'ESTIMATE';
    basic: number;
    overtime: number;
    allowance: number;
    gross: number;
    employerEpf: number;
    employerSocso: number;
    employerEis: number;
    /** 雇主实际负担 */
    employerCost: number;
    /** 员工自付（从应发薪资扣，不加进成本） */
    employeeDeductions: number;
    notes: string[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** 人事档案里的固定津贴（金额型），跟薪资模块一样以月计 */
const monthlyAllowance = (emp: Employee): number =>
    (emp.customAllowances || []).filter(a => a?.isActive !== false).reduce((sum, a) => sum + (Number(a?.amount) || 0), 0);

/** 以考勤推算一位员工当月的人工成本（尚未发薪时用） */
export const estimateEmployeeCost = (
    emp: Employee,
    attendance: AttendanceSummary | undefined,
    options: LabourCostOptions,
): EmployeeLabourCost => {
    const otMultiplier = options.otMultiplier ?? 1.5;
    const days = options.workingDaysPerMonth ?? 26;
    const hours = options.normalHoursPerDay ?? 8;
    const notes: string[] = [];

    const rate = getHistoricalSalary(emp, options.month);
    if (!rate) notes.push('人事档案没有底薪');
    const mode = emp.salaryMode || 'MONTHLY';
    const worked = attendance || { daysWorked: 0, workedMinutes: 0, approvedOtMinutes: 0 };
    // 月薪员工不需要考勤就能算底薪；日薪、时薪没有考勤就无法估算
    if (!attendance && (emp.salaryMode === 'DAILY' || emp.salaryMode === 'HOURLY')) notes.push('没有考勤资料');

    let basic: number;
    let hourlyRate: number;
    if (mode === 'DAILY') {
        basic = rate * worked.daysWorked;
        hourlyRate = rate / hours;
    } else if (mode === 'HOURLY') {
        basic = rate * (worked.workedMinutes / 60);
        hourlyRate = rate;
    } else {
        basic = rate; // 月薪：整月底薪（入职 / 离职按比例由薪资模块处理，这里标注）
        hourlyRate = rate / days / hours;
        if (emp.joinDate?.startsWith(options.month) || emp.terminationDate?.startsWith(options.month)) {
            notes.push('当月入职或离职，实际底薪以薪资模块按比例计算为准');
        }
    }
    const overtime = options.includeOvertime ? hourlyRate * otMultiplier * (worked.approvedOtMinutes / 60) : 0;
    if (!options.includeOvertime && worked.approvedOtMinutes > 0) {
        notes.push(`已批准加班 ${(worked.approvedOtMinutes / 60).toFixed(1)} 小时，加班规则待确认，未计入成本`);
    }
    const allowance = monthlyAllowance(emp);
    const gross = basic + overtime + allowance;

    const local = isLocalEmployee(emp);
    const hasEpf = local || emp.hasEPF === true;
    const statBase = Math.max(0, basic);
    const employerEpf = hasEpf ? calculateEPF(statBase, true) : 0;
    const employerSocso = local ? calculateSOCSO(statBase, true) : 0;
    const employerEis = local ? calculateEIS(statBase, true) : 0;
    const employeeDeductions =
        (hasEpf ? calculateEPF(statBase, false) : 0) +
        (local ? calculateSOCSO(statBase, false) + calculateEIS(statBase, false) : 0) +
        (isLindungMonth(options.month) && !emp.lindungOptOut ? calculateLindung(statBase, options.month) : 0);

    return {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'OTHER',
        source: 'ESTIMATE',
        basic: round2(basic),
        overtime: round2(overtime),
        allowance: round2(allowance),
        gross: round2(gross),
        employerEpf,
        employerSocso,
        employerEis,
        employerCost: round2(gross + employerEpf + employerSocso + employerEis),
        employeeDeductions: round2(employeeDeductions),
        notes,
    };
};

/** 已有薪资记录：直接用实际数字（这才是真正付出去的钱） */
export const costFromPayroll = (detail: PayrollRecord['details'][number], emp?: Employee): EmployeeLabourCost => {
    const basic = Number(detail.basicSalary) || 0;
    const overtime = Number(detail.ot) || 0;
    const allowance = (Number(detail.allowance) || 0) + (Number(detail.extraSubsidy) || 0);
    const gross = basic + overtime + allowance + (Number(detail.bonus) || 0) + (Number(detail.otherEarning) || 0);
    const employerEpf = Number(detail.er_epf) || 0;
    const employerSocso = Number(detail.er_socso) || 0;
    const employerEis = Number(detail.er_eis) || 0;
    return {
        employeeId: detail.employeeId,
        employeeName: detail.employeeName,
        department: emp?.department || 'OTHER',
        source: 'PAYROLL',
        basic: round2(basic),
        overtime: round2(overtime),
        allowance: round2(gross - basic - overtime),
        gross: round2(gross),
        employerEpf,
        employerSocso,
        employerEis,
        employerCost: round2(gross + employerEpf + employerSocso + employerEis),
        employeeDeductions: round2(
            (Number(detail.ee_epf) || 0) + (Number(detail.ee_socso) || 0) + (Number(detail.ee_eis) || 0) + (Number(detail.ee_lindung) || 0),
        ),
        notes: [],
    };
};

export interface ProfitInputs {
    /** 当月营业额（POS + 外送平台总额） */
    revenue: number;
    /** 营业额涵盖的天数；少于整月时会按比例推估整月，并标为估算 */
    revenueDays: number;
    daysInMonth: number;
    /** 食材 + 包装等随营业额变动的成本占营业额比例（0–1） */
    variableCostRatio: number;
    /** 人工以外的固定成本（租金、水电……），不得含薪资类，避免重复计算 */
    otherFixedCosts: number;
    /** 资料来源备注：哪些是手动输入的 */
    manualInputs?: string[];
}

export interface LabourAnalysis {
    month: string;
    employees: EmployeeLabourCost[];
    labourCost: number;
    employeeDeductions: number;
    revenueActual: number;
    revenueProjected: number;
    labourCostRatio: number | null;
    variableCostRatio: number;
    fixedCosts: number;
    breakEvenRevenue: number | null;
    projectedProfit: number;
    isEstimate: boolean;
    estimateReasons: string[];
}

/**
 * 汇总当月人工成本、人工成本率、保本营业额与预估利润。
 *   保本营业额 = 固定成本（人工 + 其他固定）÷（1 − 变动成本率）
 *   预估利润   = 预估营业额 ×（1 − 变动成本率）− 固定成本
 */
export const analyseLabour = (
    month: string,
    costs: EmployeeLabourCost[],
    profit: ProfitInputs,
    extraReasons: string[] = [],
): LabourAnalysis => {
    const labourCost = round2(costs.reduce((s, c) => s + c.employerCost, 0));
    const employeeDeductions = round2(costs.reduce((s, c) => s + c.employeeDeductions, 0));
    const reasons = [...extraReasons];

    const estimated = costs.filter(c => c.source === 'ESTIMATE');
    if (estimated.length) reasons.push(`${estimated.length} 位员工尚未发薪，人工成本按考勤与底薪推算`);
    const missingSalary = costs.filter(c => c.notes.includes('人事档案没有底薪'));
    if (missingSalary.length) reasons.push(`${missingSalary.length} 位员工没有底薪资料`);

    const revenueDays = Math.max(0, Math.min(profit.revenueDays, profit.daysInMonth));
    const revenueProjected =
        revenueDays > 0 && revenueDays < profit.daysInMonth ? (profit.revenue / revenueDays) * profit.daysInMonth : profit.revenue;
    if (revenueDays < profit.daysInMonth) {
        reasons.push(
            revenueDays === 0
                ? '本月还没有营业额资料'
                : `营业额只有 ${revenueDays}/${profit.daysInMonth} 天，整月营业额按日均推估`,
        );
    }
    (profit.manualInputs || []).forEach(m => reasons.push(`${m} 为手动输入`));

    const variableCostRatio = Math.min(Math.max(profit.variableCostRatio, 0), 0.99);
    const fixedCosts = round2(labourCost + Math.max(0, profit.otherFixedCosts));
    const margin = 1 - variableCostRatio;
    return {
        month,
        employees: costs,
        labourCost,
        employeeDeductions,
        revenueActual: round2(profit.revenue),
        revenueProjected: round2(revenueProjected),
        labourCostRatio: revenueProjected > 0 ? labourCost / revenueProjected : null,
        variableCostRatio,
        fixedCosts,
        breakEvenRevenue: margin > 0 ? round2(fixedCosts / margin) : null,
        projectedProfit: round2(revenueProjected * margin - fixedCosts),
        isEstimate: reasons.length > 0,
        estimateReasons: reasons,
    };
};

/**
 * 合并实际薪资与考勤推算：同一位员工只算一次（有薪资记录就不再用考勤推算）。
 */
export const buildLabourCosts = (
    month: string,
    employees: Employee[],
    attendanceByEmployee: Record<string, AttendanceSummary>,
    payrollRecords: PayrollRecord[],
    options: Omit<LabourCostOptions, 'month'> = {},
): EmployeeLabourCost[] => {
    // 只采用已发放（POSTED）的薪资；草稿仍可能修改，照样用考勤推算
    const payroll = payrollRecords.find(r => r.month === month && r.status === 'POSTED');
    const paid = new Map((payroll?.details || []).map(d => [d.employeeId, d]));
    const byId = new Map(employees.map(e => [e.id, e]));
    const result: EmployeeLabourCost[] = [];
    paid.forEach((detail, id) => result.push(costFromPayroll(detail, byId.get(id))));
    Object.entries(attendanceByEmployee).forEach(([id, summary]) => {
        if (paid.has(id)) return;
        const emp = byId.get(id);
        if (emp) result.push(estimateEmployeeCost(emp, summary, { month, ...options }));
    });
    return result.sort((a, b) => b.employerCost - a.employerCost);
};

/** 这个月是否在职、且参与薪资结算（与薪资模块相同的判断方向：入职在月底前、离职不早于月初） */
export const isActiveForPayroll = (emp: Employee, month: string): boolean => {
    if (emp.isPayrollEligible === false || emp.isArchived) return false;
    const [y, m] = month.split('-').map(Number);
    const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    if (emp.joinDate && emp.joinDate > monthEnd) return false;
    if (emp.status === 'TERMINATED') {
        return !!emp.terminationDate && emp.terminationDate >= `${month}-01`;
    }
    return true;
};

/**
 * 老板看板用：当月全部在职员工的人工成本。
 * - 已发放薪资（POSTED）的员工用实际数字；
 * - 其余按底薪与法定供款推算（有审核后的考勤就用来算日薪 / 时薪）；
 * - 同一人只算一次。
 */
export const buildMonthLabourCosts = (
    month: string,
    employees: Employee[],
    payrollRecords: PayrollRecord[],
    reviewedAttendance: Record<string, AttendanceSummary> = {},
    options: Omit<LabourCostOptions, 'month'> = {},
): EmployeeLabourCost[] => {
    const attendance: Record<string, AttendanceSummary | undefined> = {};
    employees.filter(e => isActiveForPayroll(e, month)).forEach(e => { attendance[e.id] = reviewedAttendance[e.id]; });
    const payroll = payrollRecords.find(r => r.month === month && r.status === 'POSTED');
    const paid = new Map((payroll?.details || []).map(d => [d.employeeId, d]));
    const byId = new Map(employees.map(e => [e.id, e]));
    const result: EmployeeLabourCost[] = [];
    paid.forEach((detail, id) => result.push(costFromPayroll(detail, byId.get(id))));
    Object.entries(attendance).forEach(([id, summary]) => {
        if (paid.has(id)) return;
        const emp = byId.get(id);
        if (emp) result.push(estimateEmployeeCost(emp, summary, { month, ...options }));
    });
    return result.sort((a, b) => b.employerCost - a.employerCost);
};
