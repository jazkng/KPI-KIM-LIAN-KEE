import { DEFAULT_MALAYSIAN_HOLIDAYS, DEFAULT_MIN_COVERAGE, ROSTER_STATUSES } from './rosterConstants';

export interface RosterAnomaly {
    id: string;
    type: 'UNASSIGNED' | 'NO_OFF' | 'CONSECUTIVE_WORK' | 'UNDERSTAFFED' | 'HOLIDAY_WORK';
    date?: string;
    employeeId?: string;
    employeeName?: string;
    message: string;
    severity: 'warning' | 'error';
    department?: string;
}

// Get all dates in a month YYYY-MM
export function getDaysInMonth(monthKey: string): string[] {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; // 0-indexed
    const date = new Date(year, month, 1);
    const dates: string[] = [];
    while (date.getMonth() === month) {
        const dStr = `${yearStr}-${monthStr}-${String(date.getDate()).padStart(2, '0')}`;
        dates.push(dStr);
        date.setDate(date.getDate() + 1);
    }
    return dates;
}

// Get Chinese and English day of week
export function getDayOfWeekText(dateStr: string): { en: string; zh: string; short: string } {
    const daysZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const date = new Date(dateStr);
    const day = date.getDay();
    return {
        en: daysEn[day],
        zh: daysZh[day],
        short: daysShort[day]
    };
}

// Get ISO Week Number
export function getWeekNumber(dateStr: string): number {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    // Set to nearest Thursday: current date + 4 - current day number, make Sunday 7
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

// Parse department from employee role (with direct department field support and legacy fallback)
export function getEmployeeDept(employee: any): string {
    if (!employee) return 'OTHER';
    
    // If the employee record explicitly has a department, use it!
    if (employee.department) {
        const d = employee.department.toUpperCase();
        if (d === 'DISHWASH') return 'DISHWASH';
        if (d === 'BACK_OFFICE') return 'BACK_OFFICE';
        if (d === 'OTHER') return 'OTHER';
        return d;
    }
    
    const role = (employee.role || '').toUpperCase();
    
    // Explicit priority mapping requested by user:
    // 1. 头手、马王、Assistant Chef (帮锅) 归入厨房
    if (
        role.includes('头手') || 
        role.includes('HEAD CHEF') ||
        role.includes('马王') || 
        role.includes('RUNNER') || 
        role.includes('帮锅') || 
        role.includes('ASSISTANT CHEF')
    ) {
        return 'KITCHEN';
    }
    
    // 2. 清洁员 归入洗碗
    if (
        role.includes('清洁') || 
        role.includes('CLEANER')
    ) {
        return 'DISHWASH';
    }
    
    // 3. Captain (写单员) 归入楼面
    if (
        role.includes('写单') || 
        role.includes('CAPTAIN')
    ) {
        return 'FLOOR';
    }

    // Default matching logic:
    if (role.includes('KITCHEN') || role.includes('COOK') || role.includes('砧板') || role.includes('厨') || role.includes('面') || role.includes('点心') || role.includes('烤')) return 'KITCHEN';
    if (role.includes('BAR') || role.includes('WATER') || role.includes('茶') || role.includes('水')) return 'BAR';
    if (role.includes('DISH') || role.includes('WASH') || role.includes('洗')) return 'DISHWASH';
    if (role.includes('FLOOR') || role.includes('WAITER') || role.includes('柜') || role.includes('收银') || role.includes('堂') || role.includes('CASHIER') || role.includes('领位') || role.includes('服务')) return 'FLOOR';
    if (role.includes('HR') || role.includes('FINANCE') || role.includes('OFFICE') || role.includes('人事') || role.includes('财务') || role.includes('店面管理') || role.includes('M_STORE') || role.includes('M_HR')) return 'BACK_OFFICE';
    
    return 'OTHER';
}

// Translate department code to human label
export function getDeptLabel(dept: string): string {
    switch (dept) {
        case 'KITCHEN': return '厨房 (Kitchen)';
        case 'FLOOR': return '楼面 (Floor)';
        case 'BAR': return '吧台 (Bar)';
        case 'DISHWASH': return '洗碗 (Dishwash)';
        case 'BACK_OFFICE': return '后勤 (Back Office)';
        case 'OTHER': return '其他 (Other)';
        default: return '其他 (Other)';
    }
}

// Check holidays
export function getHolidayName(dateStr: string, customHolidays?: any[]): string | null {
    const list = customHolidays || DEFAULT_MALAYSIAN_HOLIDAYS;
    const h = list.find(item => item.date === dateStr);
    return h ? h.name : null;
}

// Run full anomaly checker
export function runRosterCheck(
    employees: any[],
    days: string[],
    roster: Record<string, Record<string, string>>,
    minCoverage?: Record<string, number>,
    customHolidays?: any[]
): RosterAnomaly[] {
    const anomalies: RosterAnomaly[] = [];
    const minDeptCoverage = minCoverage || DEFAULT_MIN_COVERAGE;

    // Filter out archived employees
    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');

    // 1. UNASSIGNED Checks & HOLIDAY_WORK Checks & UNDERSTAFFED Checks per day
    days.forEach(day => {
        const dayRoster = roster[day] || {};
        const holidayName = getHolidayName(day, customHolidays);

        // Track how many active department members are working/on shift today
        // Active on shift means status is NOT OFF, LEAVE, MC, ABSENT, UNASSIGNED, PENDING
        const deptWorkingCounts: Record<string, number> = {
            KITCHEN: 0,
            FLOOR: 0,
            BAR: 0,
            DISHWASH: 0,
            BACK_OFFICE: 0,
            OTHER: 0
        };

        activeEmployees.forEach(emp => {
            const status = dayRoster[emp.id] || 'UNASSIGNED';
            const dept = getEmployeeDept(emp);

            // A. UNASSIGNED Check (Disabled: empty cells default to normal work days as per user request)
            /*
            if (status === 'UNASSIGNED') {
                anomalies.push({
                    id: `unassigned-${day}-${emp.id}`,
                    type: 'UNASSIGNED',
                    date: day,
                    employeeId: emp.id,
                    employeeName: emp.name,
                    message: `${day} [${emp.name}] 仍未排班 (Unassigned)`,
                    severity: 'warning',
                    department: dept
                });
            }
            */

            // B. Holiday work warning (just for info)
            if (holidayName && !['OFF', 'LEAVE', 'MC', 'ABSENT', 'UNASSIGNED'].includes(status)) {
                anomalies.push({
                    id: `holiday-${day}-${emp.id}`,
                    type: 'HOLIDAY_WORK',
                    date: day,
                    employeeId: emp.id,
                    employeeName: emp.name,
                    message: `${day} 是 [${holidayName}] 公假，排班为 [${ROSTER_STATUSES[status]?.label || status}]`,
                    severity: 'warning',
                    department: dept
                });
            }

            // Track coverage (UNASSIGNED is working by default)
            const isWorking = !['OFF', 'LEAVE', 'MC', 'ABSENT', 'PENDING'].includes(status);
            if (isWorking) {
                deptWorkingCounts[dept] = (deptWorkingCounts[dept] || 0) + 1;
            }
        });

        // C. UNDERSTAFFED Check per department
        Object.keys(minDeptCoverage).forEach(dept => {
            const minRequired = minDeptCoverage[dept] || 0;
            const currentlyWorking = deptWorkingCounts[dept] || 0;
            if (currentlyWorking < minRequired) {
                anomalies.push({
                    id: `understaffed-${day}-${dept}`,
                    type: 'UNDERSTAFFED',
                    date: day,
                    message: `${day} ${getDeptLabel(dept)} 在岗仅 ${currentlyWorking} 人，低于最低需求 ${minRequired} 人！`,
                    severity: 'error',
                    department: dept
                });
            }
        });
    });

    // 2. CONSECUTIVE_WORK Checks & NO_OFF Checks per employee
    activeEmployees.forEach(emp => {
        const empRosterByDate = days.map(day => {
            const status = (roster[day] || {})[emp.id] || 'UNASSIGNED';
            return { date: day, status };
        });

        // A. Consecutive working days check (6 days or more)
        let consecutiveCount = 0;
        let consecutiveStartIdx = -1;

        for (let i = 0; i < empRosterByDate.length; i++) {
            const status = empRosterByDate[i].status;
            const isWorking = !['OFF', 'LEAVE', 'MC', 'ABSENT', 'PENDING'].includes(status);

            if (isWorking) {
                if (consecutiveCount === 0) {
                    consecutiveStartIdx = i;
                }
                consecutiveCount++;
            } else {
                if (consecutiveCount >= 6) {
                    const startDay = empRosterByDate[consecutiveStartIdx].date;
                    const endDay = empRosterByDate[i - 1].date;
                    anomalies.push({
                        id: `consecutive-${emp.id}-${startDay}`,
                        type: 'CONSECUTIVE_WORK',
                        employeeId: emp.id,
                        employeeName: emp.name,
                        message: `员工 [${emp.name}] 从 ${startDay} 到 ${endDay} 连续工作达 ${consecutiveCount} 天 (无休息)`,
                        severity: 'warning',
                        department: getEmployeeDept(emp)
                    });
                }
                consecutiveCount = 0;
            }
        }

        // Catch if employee has consecutive work days ending at the end of the month
        if (consecutiveCount >= 6) {
            const startDay = empRosterByDate[consecutiveStartIdx].date;
            const endDay = empRosterByDate[empRosterByDate.length - 1].date;
            anomalies.push({
                id: `consecutive-${emp.id}-${startDay}`,
                type: 'CONSECUTIVE_WORK',
                employeeId: emp.id,
                employeeName: emp.name,
                message: `员工 [${emp.name}] 从 ${startDay} 到 ${endDay} 连续工作达 ${consecutiveCount} 天 (无休息)`,
                severity: 'warning',
                department: getEmployeeDept(emp)
            });
        }

        // B. Insufficient rest: check week-by-week rest days
        // We partition the month days by calendar week (Monday to Sunday)
        // Group days by Monday-Sunday week
        const weeks: Record<number, { date: string; status: string }[]> = {};
        empRosterByDate.forEach(item => {
            const wkNum = getWeekNumber(item.date);
            if (!weeks[wkNum]) weeks[wkNum] = [];
            weeks[wkNum].push(item);
        });

        Object.keys(weeks).forEach(wkKey => {
            const wkNum = parseInt(wkKey);
            const weekDays = weeks[wkNum];
            // Only alert if we have at least 5 days of that week inside our current month
            // so we don't alert prematurely on boundary partial weeks
            if (weekDays.length >= 5) {
                const offCount = weekDays.filter(d => d.status === 'OFF').length;
                if (offCount === 0) {
                    const wkStart = weekDays[0].date;
                    const wkEnd = weekDays[weekDays.length - 1].date;
                    anomalies.push({
                        id: `no-off-${emp.id}-${wkNum}`,
                        type: 'NO_OFF',
                        employeeId: emp.id,
                        employeeName: emp.name,
                        message: `员工 [${emp.name}] 在本周 (${wkStart} ~ ${wkEnd}) 无任何 [OFF] 休息日`,
                        severity: 'error',
                        department: getEmployeeDept(emp)
                    });
                }
            }
        });
    });

    return anomalies;
}
