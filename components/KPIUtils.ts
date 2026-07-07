
import { Employee } from '../types';

// ==========================================
// CONFIGURATION (THE RULES)
// ==========================================
export const KPI_CONFIG = {
    // Review Rules (Floor)
    POOL_5STAR_PHOTO: 20,      // RM20 (With Photo/Text)
    POOL_4STAR_OR_PLAIN: 10,   // RM10 (4 Star OR 5 Star no text)
    DIRECT_MENTION_REWARD: 5,  // RM5 direct to staff

    // Review Rules (Kitchen)
    POOL_KITCHEN_QUALITY: 20,  // RM20 (Food tasty/Fast)
    POOL_KITCHEN_SPEED_BONUS: 100, // RM100 Monthly if no complaints

    // Penalties
    LATE_MINOR_PENALTY: 5,     // < 10 mins
    LATE_MAJOR_PENALTY: 10,    // > 10 mins
    LATE_KILL_THRESHOLD: 3,    // > 3 times = No Attendance Bonus
    
    // Foreigner Penalty
    FOREIGNER_ABSENT_DEDUCTION_DAYS: 2, // Deduct 2 days salary for weekend absent
};

const mapRoleToCode = (roleTitle: string): string => {
  if (!roleTitle) return 'PENDING';
  const t = roleTitle.toLowerCase().trim();
  
  if (t.includes('executive chef') || t.includes('行政总厨')) return 'EXEC_CHEF';
  if (t.includes('manager')) return 'MANAGER';
  if (t.includes('supervisor')) return 'SUPERVISOR';
  
  if (t.includes('counter') || t.includes('cashier')) return 'COUNTER';
  if (t.includes('captain')) return 'CAPTAIN';
  if (t.includes('waiter')) return 'WAITER';
  if (t.includes('cleaner')) return 'CLEANER';
  if (t.includes('part')) return 'PART_TIME';
  
  if (t.includes('water bar') || t.includes('bar')) return 'BAR';
  if (t.includes('head chef') || t.includes('头手')) return 'HEAD_CHEF';
  if (t.includes('sous') || t.includes('asst')) return 'ASST_CHEF';
  if (t.includes('cutter')) return 'CUTTER';
  if (t.includes('crew')) return 'CREW';
  if (t.includes('apprentice') || t.includes('学徒')) return 'APPRENTICE';
  if (t.includes('helper') || t.includes('帮手')) return 'HELPER';
  if (t.includes('dish')) return 'DISHWASH';
  if (t.includes('commis')) return 'COMMIS';
  
  return 'PENDING';
};

/**
 * CALCULATE LEAVE ENTITLEMENT (Malaysian Employment Act 1955)
 */
export const calculateLeaveEntitlement = (joinDateStr: string) => {
    const joinDate = new Date(joinDateStr);
    const today = new Date();
    
    const diffTime = Math.abs(today.getTime() - joinDate.getTime());
    const yearsService = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    let annualLeaveEntitlement = 8;
    if (yearsService >= 2 && yearsService < 5) annualLeaveEntitlement = 12;
    if (yearsService >= 5) annualLeaveEntitlement = 16;

    const currentYear = today.getFullYear();
    const joinYear = joinDate.getFullYear();
    
    if (joinYear === currentYear) {
        const monthsServed = 12 - joinDate.getMonth(); 
        annualLeaveEntitlement = Math.round((monthsServed / 12) * annualLeaveEntitlement);
    }

    let mcEntitlement = 14;
    if (yearsService >= 2 && yearsService < 5) mcEntitlement = 18;
    if (yearsService >= 5) mcEntitlement = 22;

    const hospitalization = 60;

    return {
        yearsService: yearsService.toFixed(1),
        annualLeave: annualLeaveEntitlement,
        mc: mcEntitlement,
        hospitalization
    };
};

/**
 * HIGH-PERFORMANCE PAYROLL CALCULATOR (UPDATED)
 */
export const calculateHRPayroll = (
    employee: Employee,
    rosterStats: { lateMinor: number, lateMajor: number, absentWeekend: number, absentNormal: number, mc: number, unpaidLeave: number },
    reviewStats: { star5Photo: number, star4: number, kitchenGood: number, complaints: number },
    activeStaffCounts: { floor: number, kitchen: number },
    currentDateStr: string,
    loanDeduction: number = 0, 
    roleConfig?: { enabledAllowances: any[] } // Ignored in favor of employee.customAllowances if available
) => {
    
    const roleCode = mapRoleToCode(employee.role);
    const isPartTime = roleCode === 'PART_TIME';
    const isLocal = employee.nationality.includes('Malaysian') || employee.nationality.includes('🇲🇾');
    
    // 1. STATUS CHECK
    const isProbation = employee.status === 'PROBATION';
    const isConfirmed = !isProbation;

    // 2. BASE SALARY
    const baseSalary = employee.basicSalary || 0; 

    // 3. STATUTORY (EPF/SOCSO/EIS)
    let epfDeduction = 0;
    let socsoDeduction = 0;
    let eisDeduction = 0;

    // EPF Logic: Locals get it automatically. Foreigners only if hasEPF flag is true.
    const shouldDeductEPF = isLocal || (employee.hasEPF === true);

    if (shouldDeductEPF) {
        epfDeduction = baseSalary * 0.11; // Standard 11%
    }
    
    if (isLocal) {
        // Locals only get SOCSO/EIS usually
        socsoDeduction = 19.75; 
        eisDeduction = 7.90;    
    }

    // 4. ALLOWANCES (DYNAMIC CALCULATION)
    // Default structure for fallback
    const allowances: Record<string, number> = {
        attendance: 0,
        meal: 0,
        hostel: 0,
        other: 0
    };

    // Determine Eligibility
    // Local: Must be Confirmed.
    // Foreigner: Must be Confirmed AND Quality Staff.
    const isEligibleForBenefits = isLocal ? isConfirmed : (isConfirmed && employee.isQualityStaff);

    if (isEligibleForBenefits && !isPartTime && employee.customAllowances) {
        const totalLate = rosterStats.lateMinor + rosterStats.lateMajor;
        const hasPerfectAttendance = 
            totalLate === 0 && 
            rosterStats.absentWeekend === 0 && 
            rosterStats.absentNormal === 0 && 
            rosterStats.mc === 0 && 
            rosterStats.unpaidLeave === 0;

        const isAttendanceBonusKilled = totalLate > KPI_CONFIG.LATE_KILL_THRESHOLD;

        employee.customAllowances.forEach(allowance => {
            if (!allowance.isActive) return;

            // ATTENDANCE LOGIC
            if (allowance.id === 'ATTENDANCE') {
                if (hasPerfectAttendance && !isAttendanceBonusKilled) {
                    allowances.attendance += allowance.amount;
                }
            } 
            // FIXED ALLOWANCES (Just need to be active and eligible)
            else if (allowance.id === 'MEAL') {
                allowances.meal += allowance.amount;
            } 
            else if (allowance.id === 'HOSTEL') {
                allowances.hostel += allowance.amount;
            } 
            // CUSTOM ALLOWANCES
            else {
                allowances.other += allowance.amount;
            }
        });
    }

    // 5. INCENTIVES POOL
    let poolShare = 0;
    const isKitchen = ['HEAD_CHEF', 'ASST_CHEF', 'CUTTER', 'CREW', 'DISHWASH', 'COMMIS', 'BAR', 'APPRENTICE', 'HELPER'].includes(roleCode);
    const isFloor = ['MANAGER', 'SUPERVISOR', 'COUNTER', 'CAPTAIN', 'WAITER', 'CLEANER'].includes(roleCode);

    if (isFloor && activeStaffCounts.floor > 0) {
        const floorPool = (reviewStats.star5Photo * KPI_CONFIG.POOL_5STAR_PHOTO) + 
                          (reviewStats.star4 * KPI_CONFIG.POOL_4STAR_OR_PLAIN);
        poolShare = floorPool / activeStaffCounts.floor;
    } else if (isKitchen && activeStaffCounts.kitchen > 0) {
        let kitchenPool = (reviewStats.kitchenGood * KPI_CONFIG.POOL_KITCHEN_QUALITY);
        if (reviewStats.complaints === 0) {
            kitchenPool += KPI_CONFIG.POOL_KITCHEN_SPEED_BONUS;
        }
        poolShare = kitchenPool / activeStaffCounts.kitchen;
    }

    // 6. PENALTIES & DEDUCTIONS
    const penaltyLate = (rosterStats.lateMinor * KPI_CONFIG.LATE_MINOR_PENALTY) + 
                        (rosterStats.lateMajor * KPI_CONFIG.LATE_MAJOR_PENALTY);
    
    const dayRate = baseSalary / 26;
    let absentDeduction = (rosterStats.absentNormal + rosterStats.unpaidLeave) * dayRate;
    
    if (rosterStats.absentWeekend > 0) {
        const penaltyDays = isLocal ? 1 : KPI_CONFIG.FOREIGNER_ABSENT_DEDUCTION_DAYS;
        absentDeduction += (rosterStats.absentWeekend * penaltyDays * dayRate);
    }

    // 7. TOTALS
    const totalAllowances = allowances.attendance + allowances.meal + allowances.hostel + allowances.other;
    const grossPay = baseSalary + totalAllowances; 
    const totalDeductions = epfDeduction + socsoDeduction + eisDeduction + penaltyLate + absentDeduction + loanDeduction;
    const netPay = grossPay - totalDeductions;

    // Helper for hasPerfectAttendance usage in UI
    const totalLateCheck = rosterStats.lateMinor + rosterStats.lateMajor;
    const hasPerfectAttendance = 
        totalLateCheck === 0 && 
        rosterStats.absentWeekend === 0 && 
        rosterStats.absentNormal === 0 && 
        rosterStats.mc === 0 && 
        rosterStats.unpaidLeave === 0;

    return {
        baseSalary,
        allowances, // Object
        deductions: {
            epf: epfDeduction,
            socso: socsoDeduction,
            eis: eisDeduction,
            latePenalty: penaltyLate,
            absent: absentDeduction,
            loan: loanDeduction 
        },
        poolShare, 
        grossPay,
        totalDeductions,
        netPay,
        isProbation,
        isLocal,
        hasPerfectAttendance
    };
};
