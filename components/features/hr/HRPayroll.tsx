import { html2canvas, loadJsPDF } from '../../../utils/lazyLibs';
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronUp,
  Save,
  Calendar,
  CheckCircle2,
  Calculator,
  X,
  Plus,
  MinusCircle,
  Building2,
  RotateCcw,
  Printer,
  Loader2,
  Wallet,
  Banknote,
  CreditCard,
  ToggleLeft,
  ToggleRight,
  CalendarDays,
  CheckSquare,
  Square,
  UserX,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ChevronDown,
  LockOpen,
  Ban,
  History,
  FileSpreadsheet,
  } from "lucide-react";
import {
  Employee,
  PayrollRecord,
  ExpenseItem,
  RosterStatus,
  LoanRecord,
  } from "../../../types";
import { mergeAttendanceRecords, distributeTimes } from "../../../utils/attendanceHelpers";
import { LABOR_DEPT_ROLE_FALLBACK } from "../../../constants/classicPnLCostMap";
import { 
  DataManager,
  DEFAULT_ATTENDANCE_SETTINGS,
  getTargetShiftForDate
} from "../../../utils/dataManager";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { applyResolvedStylesForPdf, waitForPdfFonts, prepareClonedDocumentForPdf } from "../../../utils/pdfStyleResolver";
import { PartTimePanel } from "./PartTimePanel";
import { exportPayrollExcel } from "./payrollExcelExport";
import {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculateLindung,
  isLindungMonth,
  getLindungRate,
  getHistoricalSalary,
} from "../../../utils/payroll/statutory";
import { partTimeSummaryFor, partTimeSummaryText } from "../../../utils/payroll/partTimeSummary";

// --- INTERFACES ---

interface DetailedPayrollEntry {
  // Earnings
  basic: number;
  allowance: number;
  extraSubsidy: number;
  ot: number;
  bonus: number;
  otherEarning: number;
  otherEarningNote: string;

  // Deductions (Company)
  latePenalty: number;
  rawLatePenalty?: number;
  unpaidLeave: number;
  hostelFee: number;
  advanceLoan: number;
  otherDeduction: number;
  otherDeductionNote: string;
  /** 本月从薪水扣回的欠款（对应人事档案的借还款记录，发放时会写一笔 REPAY） */
  loanRepay: number;

  // Statutory (Auto-calced but overrideable)
  ee_epf: number;
  ee_socso: number;
  ee_eis: number;
  /** LINDUNG 24 Jam (SKBBK) —— 员工全额承担，雇主 0 */
  ee_lindung: number;
  ee_pcb: number; // Tax

  er_epf: number;
  er_socso: number;
  er_eis: number;

  note: string;

  // Settings for this entry
  autoCalc: boolean;
  hasEPF: boolean;
  hasSOCSO: boolean;
  /** 有没有参加 LINDUNG 24 Jam（外劳强制；本地自愿，没退出就要扣） */
  hasLindung: boolean;
  paymentMethod: "BANK" | "CASH";
  proRateMode?: "26_DAYS" | "CALENDAR_DAYS" | "WORKABLE_DAYS";
  workDays?: number;
  isPaid?: boolean;
  paidAt?: string; // 🟢 记录真实的审计付款动作时间 (Audit Time)
  paymentExpenseId?: string; // 🟢 绑定单人生成的支出账单ID，用于退回撤销
}

interface HRPayrollProps {
  initialMode?: "CALC" | "PARTTIME";
  currentEmployee?: Employee | null;
  employees: Employee[];
  onNavigateToProfile?: (empId: string) => void;
}

// --- MALAYSIA STATUTORY CALCULATION HELPERS ---
// 已搬到 utils/payroll/statutory.ts（逻辑不变），薪资与人工成本分析共用。

// --- 👑 迟到扣款计算 (必须与 AttendanceConsole 保持一致) ---
let payrollShiftSettings = DEFAULT_ATTENDANCE_SETTINGS;
const MONTHLY_LATE_QUOTA_MIN = 60; // 月累积 >60min → 再扣1小时
const DAILY_WORK_HOURS_PAY = 10;
const DAYS_PER_MONTH_PAY = 30;

// 薪资迟到扣款一直按班次 1 的时间算；有固定上下班时间的员工改按自己的时间
const getShiftStartForDate = (dateStr: string, fixedShift?: Employee['fixedShift']): Date => {
  return getTargetShiftForDate(dateStr, payrollShiftSettings, 1, fixedShift).checkIn;
};

const getLateMinutesFromRecord = (
  clockInISO: string,
  dateStr: string,
  fixedShift?: Employee['fixedShift'],
): number => {
  const clockIn = new Date(clockInISO);
  const shiftStart = getShiftStartForDate(dateStr, fixedShift);
  return Math.max(
    0,
    Math.floor((clockIn.getTime() - shiftStart.getTime()) / 60000),
  );
};

/**
 * 根据本月考勤记录和底薪, 计算迟到扣款
 * - 单日迟到 > 宽限时间 → 扣 1 小时
 * - 月累积所有迟到分钟 > 60min → 再扣 1 小时
 * - 1 小时工钱 = basicSalary / 30 / 10
 */
const calculateLatePenalty = (
  basicSalary: number,
  records: { clockIn: string; date: string; employeeId: string }[],
  fixedShift?: Employee['fixedShift'],
) => {
  if (basicSalary <= 0 || !records || records.length === 0) {
    return { amount: 0, singleDayCount: 0, totalLateMinutes: 0, hourlyRate: 0 };
  }
  let singleDayCount = 0;
  let totalLateMinutes = 0;
  let customTiersDeduction = 0;

  const hourlyRate = basicSalary / DAYS_PER_MONTH_PAY / DAILY_WORK_HOURS_PAY;
  const isPenaltyRulesEnabled = payrollShiftSettings.enablePenaltyRules ?? true;
  const tiers = payrollShiftSettings.penaltyTiers || [
    { id: "tier_1", lateMinutes: 15, deductionType: 'AMOUNT', deductionAmount: 5 },
    { id: "tier_2", lateMinutes: 30, deductionType: 'AMOUNT', deductionAmount: 15 },
    { id: "tier_3", lateMinutes: 60, deductionType: 'HALF_DAY', deductionAmount: 0 }
  ];

  // Sort tiers in descending order of lateMinutes so we find the highest threshold first
  const sortedTiers = [...tiers].sort((a, b) => b.lateMinutes - a.lateMinutes);

  records.forEach((rec) => {
    if (!rec.clockIn || !rec.date) return;
    const lateMin = getLateMinutesFromRecord(rec.clockIn, rec.date, fixedShift);
    if (lateMin > 0) {
      totalLateMinutes += lateMin;
      if (lateMin > payrollShiftSettings.graceMinutes) {
        singleDayCount += 1;
        
        if (isPenaltyRulesEnabled) {
          // Find the highest tier that this lateMin exceeds
          const matchingTier = sortedTiers.find(t => lateMin > t.lateMinutes);
          if (matchingTier) {
            if (matchingTier.deductionType === 'AMOUNT') {
              customTiersDeduction += matchingTier.deductionAmount;
            } else if (matchingTier.deductionType === 'HALF_DAY') {
              customTiersDeduction += (basicSalary / DAYS_PER_MONTH_PAY) / 2;
            } else if (matchingTier.deductionType === 'FULL_DAY') {
              customTiersDeduction += (basicSalary / DAYS_PER_MONTH_PAY);
            }
          }
        }
      }
    }
  });

  let amount = 0;
  if (isPenaltyRulesEnabled) {
    amount = customTiersDeduction;
  } else {
    // Old fallback logic
    let hoursToDeduct = singleDayCount;
    if (totalLateMinutes > MONTHLY_LATE_QUOTA_MIN) hoursToDeduct += 1;
    amount = hourlyRate * hoursToDeduct;
  }

  return {
    amount: parseFloat(amount.toFixed(2)),
    singleDayCount,
    totalLateMinutes,
    hourlyRate: parseFloat(hourlyRate.toFixed(2)),
  };
};

const getDeductedLatePenalty = (rawAmount: number, mode: 'FULL' | 'HALF' | 'WARN_ONLY') => {
  if (mode === 'HALF') {
    return Math.round((rawAmount * 0.5) * 100) / 100;
  }
  if (mode === 'WARN_ONLY') {
    return rawAmount;
  }
  return rawAmount;
};

// 👑 核心修复：把 MoneyInput 移到主组件外部！
// 解决输入一个字就失去焦点（组件不断被销毁重建）的问题。
const MoneyInput = ({
  value,
  onChange,
  disabled,
  className,
  placeholder = "0.00",
  decimals = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  decimals?: boolean;
}) => {
  const [localValue, setLocalValue] = React.useState<string>(
    value === 0 ? "" : decimals ? value.toFixed(2) : String(value),
  );
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) {
      setLocalValue(
        value === 0 ? "" : decimals ? value.toFixed(2) : String(value),
      );
    }
  }, [value, decimals, isFocused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={localValue}
      onFocus={(e) => {
        setIsFocused(true);
        if (localValue === "0.00" || localValue === "0") {
          setLocalValue("");
        } else {
          setTimeout(() => e.target.select(), 50);
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        setLocalValue(raw);
        const parsed = parseFloat(raw);
        onChange(isNaN(parsed) ? 0 : parsed);
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseFloat(localValue);
        if (isNaN(parsed) || localValue === "") {
          setLocalValue("");
          onChange(0);
        } else {
          setLocalValue(decimals ? parsed.toFixed(2) : String(parsed));
          onChange(parsed);
        }
      }}
      className={className}
     
      placeholder={placeholder}
    />
  );
};

export const HRPayroll: React.FC<HRPayrollProps> = ({
  employees,
  onNavigateToProfile,
  initialMode = "CALC",
  currentEmployee,
}) => {
  // 👑 Sub-tab mode: CALC (Monthly Settlement Workspace) vs HISTORY (Pristine separate payment logs)
  const [currentMode, setCurrentMode] = useState<"CALC" | "HISTORY" | "PARTTIME">(initialMode);
  const [payMoreOpen, setPayMoreOpen] = useState(false);
  const [allHistoryRecords, setAllHistoryRecords] = useState<PayrollRecord[]>(
    [],
  );
  const [detailedHistId, setDetailedHistId] = useState<string | null>(null);
  const [isHistLoading, setIsHistLoading] = useState(false);
  const [enableAttendanceDeduction, setEnableAttendanceDeduction] =
    useState(false);
  const [latePenaltyMode, setLatePenaltyMode] =
    useState<'FULL' | 'HALF' | 'WARN_ONLY'>('FULL');
  const [pdfPenaltyMode, setPdfPenaltyMode] =
    useState<'SHOW_AND_DEDUCT' | 'SHOW_BUT_NO_DEDUCT' | 'HIDE'>('SHOW_AND_DEDUCT');

  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [partTimeExpenses, setPartTimeExpenses] = useState<ExpenseItem[]>([]);
  const [payrollData, setPayrollData] = useState<
    Record<string, DetailedPayrollEntry>
  >({});
  const [dailyRoster, setDailyRoster] = useState<
    Record<string, Record<string, RosterStatus>>
  >({});
  const [isPosted, setIsPosted] = useState(false);
  const [isStatutoryPaid, setIsStatutoryPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const loadAllHistory = async () => {
    setIsHistLoading(true);
    try {
      const records = await DataManager.getPayrollRecords();
      // Sort by month desc
      records.sort((a, b) => b.month.localeCompare(a.month));
      setAllHistoryRecords(records);
    } catch (e) {
      console.error("Load payroll logs failed:", e);
    } finally {
      setIsHistLoading(false);
    }
  };

  useEffect(() => {
    if (currentMode === "HISTORY") {
      loadAllHistory();
    }
  }, [currentMode]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await DataManager.getAttendanceSettings();
        if (s) {
          payrollShiftSettings = s;
        }
      } catch (e) {
        console.error("Fetch attendance settings failed in HRPayroll:", e);
      }
    };
    fetchSettings();
  }, [selectedMonth]);

  const [monthAdvances, setMonthAdvances] = useState<ExpenseItem[]>([]);
  const [showResigned, setShowResigned] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [mobileModalTab, setMobileModalTab] = useState<'EARNINGS' | 'DEDUCTIONS' | 'STATUTORY'>('EARNINGS');
  const [editingAttendance, setEditingAttendance] = useState<any[]>([]); // 👑 当月考勤记录(用于 Payslip 打印)
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advForm, setAdvForm] = useState({
    empId: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    note: "",
    method: "BANK_TRANSFER",
  });
  const [showAdvanceHistory, setShowAdvanceHistory] = useState(false);

  // 👑 人脸打卡机导入状态
  const [, ] = useState(false);
  const [, ] = useState(false);
  const [, ] = useState<string | null>(null);
  const [, ] = useState(false);
  const [editingAdvanceItem, setEditingAdvanceItem] =
    useState<ExpenseItem | null>(null);
  const [editAdvForm, setEditAdvForm] = useState({
    id: "",
    company: "",
    amount: "",
    date: "",
    note: "",
    paymentMethod: "BANK_TRANSFER" as "CASH" | "BANK_TRANSFER",
  });

  const [proRateSettings, setProRateSettings] = useState({
    days: 0,
    mode: "26_DAYS" as "26_DAYS" | "CALENDAR_DAYS" | "WORKABLE_DAYS",
    startDate: "",
    endDate: "",
  });

  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showBatchPayConfirm, setShowBatchPayConfirm] = useState(false);
  const [showDeptBreakdown, setShowDeptBreakdown] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => {
    const initialMonth = new Date().toISOString().slice(0, 7);
    const [yearStr, monthStrPart] = initialMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStrPart, 10);
    const lastDay = new Date(year, month, 0).getDate();
    return `${yearStr}-${monthStrPart.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }); // 👑 默认出款日自动为当月最后一天

  const printSlipRef = useRef<HTMLDivElement>(null);
  const printSummaryRef = useRef<HTMLDivElement>(null);
  const attendancePrintRef = useRef<HTMLDivElement>(null);

  // 🚨 已彻底移除把 paymentDate 强行锁死在月底的 useEffect

  /**
   * 这个员工在这个月要不要算薪。
   *   true  = 要算（在职，或离职当月要做最后结算）
   *   false = 不算（离职月已经过了）
   *   null  = 离职但没填离职日期，无法判断
   * ⚠️ 「显示离职员工」只是画面开关，不可以影响谁要算薪 ——
   *    以前这两件事混在一起，开了开关 7 月离职的人 8 月还会被算进去。
   */
  const payrollActiveInMonth = (e: Employee, month: string): boolean | null => {
    const terminated = e.isArchived || e.status === "TERMINATED";
    if (!terminated) return true;
    const t = e.terminationDate ? e.terminationDate.substring(0, 7) : "";
    if (!t) return null;
    return t >= month;
  };

  const displayEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (e.joinDate && e.joinDate.substring(0, 7) > selectedMonth)
        return false;

      // 硬规则先跑：离职月已经过了就一律不出现，不管有没有旧草稿资料
      const active = payrollActiveInMonth(e, selectedMonth);
      if (active === false) {
        // 已入账的历史记录例外 —— 那是真的发过的钱，不能凭空消失
        return !!(isPosted && payrollData && payrollData[e.id]);
      }

      if (payrollData && payrollData[e.id]) return true;

      const isEligible = e.isPayrollEligible !== undefined ? e.isPayrollEligible : !e.role.includes("Owner");
      if (!isEligible) return false;

      // 离职但没填离职日期 → 无法判断，交给「显示离职员工」开关
      if (active === null && !showResigned) return false;
      return true;
    });
  }, [employees, showResigned, selectedMonth, payrollData]);

  /**
   * 🔍 这个月「没有出现在薪资名单」的在职员工 + 原因。
   * 以前这些人是静悄悄消失的（例如上个月有草稿所以看得到，这个月就不见了），
   * 现在列在名单最下面，一眼知道为什么、要去哪里改。
   */
  const excludedEmployees = useMemo(() => {
    const out: { emp: Employee; reason: "EXEMPT" | "HOURLY" | "NO_TERM_DATE"; text: string }[] = [];
    employees.forEach((e) => {
      if (payrollData && payrollData[e.id]) return; // 已经在名单上
      if (e.joinDate && e.joinDate.substring(0, 7) > selectedMonth) return; // 还没入职
      const active = payrollActiveInMonth(e, selectedMonth);
      if (active === false) return; // 已经离职，本来就不算
      if (e.salaryMode === "HOURLY") {
        out.push({ emp: e, reason: "HOURLY", text: "时薪兼职 → 在「兼职」分页按天登记、付现金" });
        return;
      }
      const isEligible = e.isPayrollEligible !== undefined ? e.isPayrollEligible : !(e.role || "").includes("Owner");
      if (!isEligible) {
        out.push({
          emp: e,
          reason: "EXEMPT",
          text: e.isPayrollEligible === false
            ? "员工档案设成「豁免 / 不参与薪资结算」"
            : "职位含「Owner」，系统预设不算薪",
        });
        return;
      }
      if (active === null) {
        out.push({ emp: e, reason: "NO_TERM_DATE", text: "已离职但没填离职日期，无法判断要不要算" });
      }
    });
    return out;
  }, [employees, payrollData, selectedMonth]);

  const managementEmployees = useMemo(() => {
    return displayEmployees.filter(
      (e) => e.role === "HR Management" || e.role === "Store Management",
    );
  }, [displayEmployees]);

  const nonManagementEmployees = useMemo(() => {
    return displayEmployees.filter(
      (e) => e.role !== "HR Management" && e.role !== "Store Management",
    );
  }, [displayEmployees]);

  // 💡 优化：安全字符串检查，防止 nationality 为空引发崩溃
  const localEmployees = useMemo(() => {
    return nonManagementEmployees.filter(
      (e) =>
        (e.nationality || "").includes("Malaysian") ||
        (e.nationality || "").includes("🇲🇾"),
    );
  }, [nonManagementEmployees]);

  const foreignEmployees = useMemo(() => {
    return nonManagementEmployees.filter(
      (e) =>
        !(e.nationality || "").includes("Malaysian") &&
        !(e.nationality || "").includes("🇲🇾"),
    );
  }, [nonManagementEmployees]);

  // 🟢 借款扣回：saveEmployee 之后 employees(props) 还是旧的，用本地覆盖让欠款余额立刻更新
  const [loanRecordsOverride, setLoanRecordsOverride] = useState<
    Record<string, LoanRecord[]>
  >({});
  const getLoanRecords = (emp: Employee | null | undefined): LoanRecord[] => {
    if (!emp) return [];
    return loanRecordsOverride[emp.id] ?? emp.loanRecords ?? [];
  };
  // 同一个员工 + 同一个月份 只会有一笔「薪资扣回」，重复发放/撤销都用这个 id 覆盖或删除
  const loanRepayRecordId = (empId: string, month: string) =>
    `payroll_repay_${month}_${empId}`;

  const syncLoanRepayToProfile = async (
    empId: string,
    amount: number,
    month: string,
    dateStr: string,
  ) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const rid = loanRepayRecordId(empId, month);
    const kept = getLoanRecords(emp).filter((r) => r.id !== rid);
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    const next: LoanRecord[] =
      amt > 0
        ? [
            ...kept,
            {
              id: rid,
              date: dateStr,
              type: "REPAY" as const,
              amount: amt,
              note: `薪资扣除 ${month}`,
              via: "SALARY_DEDUCT",
            },
          ]
        : kept;
    if (amt <= 0 && kept.length === getLoanRecords(emp).length) return;
    await DataManager.saveEmployee({ ...emp, loanRecords: next });
    setLoanRecordsOverride((prev) => ({ ...prev, [empId]: next }));
  };

  // 💳 / 🛡️ 写回人事档案的小栏位（付款方式、LINDUNG 退出）
  //    employees(props) 不一定马上刷新，所以本地也记一份，并带上最新的借还款记录免得被旧资料盖掉
  const [profilePatch, setProfilePatch] = useState<Record<string, Partial<Employee>>>({});
  const patchEmployeeProfile = async (empId: string, patch: Partial<Employee>) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const merged = { ...emp, ...(profilePatch[empId] || {}), ...patch };
    setProfilePatch((prev) => ({ ...prev, [empId]: { ...(prev[empId] || {}), ...patch } }));
    try {
      await DataManager.saveEmployee({ ...merged, loanRecords: getLoanRecords(emp) });
    } catch (err) {
      console.warn("Save employee profile patch failed", err);
    }
  };

  const removeLoanRepayFromProfile = async (empId: string, month: string) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const rid = loanRepayRecordId(empId, month);
    const cur = getLoanRecords(emp);
    if (!cur.some((r) => r.id === rid)) return;
    const next = cur.filter((r) => r.id !== rid);
    await DataManager.saveEmployee({ ...emp, loanRecords: next });
    setLoanRecordsOverride((prev) => ({ ...prev, [empId]: next }));
  };

  const editingEntry = editingEmpId ? payrollData[editingEmpId] : null;
  const editingEmp = editingEmpId
    ? employees.find((e) => e.id === editingEmpId)
    : null;
  const [showProRateToolFor, setShowProRateToolFor] = useState<string | null>(null);
  const showProRateTool =
    !!editingEmpId &&
    (showProRateToolFor === editingEmpId ||
      !!editingEmp?.isArchived ||
      !!editingEmp?.joinDate?.startsWith(selectedMonth) ||
      !!editingEmp?.terminationDate?.startsWith(selectedMonth) ||
      (payrollData[editingEmpId]?.workDays || 0) > 0);

  // 员工欠款余额余额（与人事档案「借还款记录」同一个算法：BORROW 加，REPAY 减）
  const editingEmpLoanBalance = useMemo(() => {
    if (!editingEmp) return 0;
    const bal = getLoanRecords(editingEmp).reduce(
      (sum, r) => sum + (r.type === "BORROW" ? Number(r.amount) || 0 : -(Number(r.amount) || 0)),
      0,
    );
    return Math.max(0, Math.round(bal * 100) / 100);
  }, [editingEmp, loanRecordsOverride]);

  const currentEmpAdvances = useMemo(() => {
    if (!editingEmp) return [];
    return monthAdvances
      .filter((a) => a.company === editingEmp.name)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [editingEmp, monthAdvances]);

  // --- LOGIC FUNCTIONS ---

  const createDefaultEntry = (
    emp: Employee,
    advances: ExpenseItem[],
    rosterMap: Record<string, Record<string, RosterStatus>>,
    monthAttendance: any[] = [],
  ): DetailedPayrollEntry => {
    const totalAdv = advances
      .filter((a) => a.company === emp.name)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    const isLocal =
      (emp.nationality || "").includes("Malaysian") ||
      emp.nationality.includes("🇲🇾");
    const historicalBasic = getHistoricalSalary(emp, selectedMonth);

    let calculatedBasic = historicalBasic;
    let initialWorkDays = 0;
    let autoNote = "";

    const isJoinMonth = emp.joinDate?.startsWith(selectedMonth);
    const isTermMonth = emp.terminationDate?.startsWith(selectedMonth);

    if (isJoinMonth || isTermMonth) {
      const [yearStr, monthStr] = selectedMonth.split("-");
      const totalDaysInMonth = new Date(
        parseInt(yearStr),
        parseInt(monthStr),
        0,
      ).getDate();

      let startDate = isJoinMonth
        ? new Date(emp.joinDate)
        : new Date(`${selectedMonth}-01`);
      let endDate = isTermMonth
        ? new Date(emp.terminationDate!)
        : new Date(`${selectedMonth}-${totalDaysInMonth}`);

      let workedDays = 0;
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        const dateIso = d.toISOString().split("T")[0];
        const status = rosterMap[dateIso]?.[emp.id] || "WORK";
        if (status === "WORK") workedDays++;
      }

      calculatedBasic = parseFloat(
        ((historicalBasic / 26) * workedDays).toFixed(2),
      );
      initialWorkDays = workedDays;
      autoNote = isTermMonth
        ? `[Auto-Calc] 离职结算至 ${emp.terminationDate} (${workedDays}天)`
        : `[Auto-Calc] 入职算起 (${workedDays}天)`;
    }

    // 👑 自动计算迟到扣款 (单日>10min 扣1小时 + 月累积>60min 再扣1小时)
    const empAttendance = monthAttendance.filter(
      (r) => r.employeeId === emp.id,
    );
    const lateCalc = calculateLatePenalty(historicalBasic, empAttendance, emp.fixedShift);
    const actualPenaltyAmount = enableAttendanceDeduction ? getDeductedLatePenalty(lateCalc.amount, latePenaltyMode) : 0;
    const displayPenaltyDeduction = (enableAttendanceDeduction && latePenaltyMode !== 'WARN_ONLY') ? actualPenaltyAmount : 0;
    const lateNote =
      lateCalc.amount > 0
        ? `[Auto-Late] 单日超 ${payrollShiftSettings.graceMinutes} min | ${
            enableAttendanceDeduction 
              ? `理论应扣 RM${lateCalc.amount} | 实扣(扣款模式: ${latePenaltyMode === 'FULL' ? '100%实扣' : latePenaltyMode === 'HALF' ? '50%减半' : '警告不扣'}): RM${displayPenaltyDeduction}`
              : "(未启用自动扣薪)"
          }`
        : "";
    const finalNote = [autoNote, lateNote].filter(Boolean).join("\n");

    // 👑 新月份一打开就先把 EPF / SOCSO / EIS / LINDUNG 算好（以前要一个个点开才会算，Govt 一直显示 0）
    const statBase = Math.max(0, Number(calculatedBasic) || 0);
    const defHasEPF = isLocal || emp.hasEPF === true;
    const defHasSOCSO = isLocal;
    const defHasLindung = isLindungMonth(selectedMonth) && !emp.lindungOptOut; // 本地外劳都可以开关，状态存在人事档案

    return {
      basic: Number(calculatedBasic) || 0,
      allowance: 0,
      extraSubsidy: 0,
      ot: 0,
      bonus: 0,
      otherEarning: 0,
      otherEarningNote: "",
      latePenalty: actualPenaltyAmount,
      rawLatePenalty: lateCalc.amount,
      unpaidLeave: 0,
      hostelFee: 0,
      advanceLoan: totalAdv,
      otherDeduction: 0,
      otherDeductionNote: "",
      loanRepay: 0,
      ee_epf: defHasEPF ? calculateEPF(statBase, false) : 0,
      ee_socso: defHasSOCSO ? calculateSOCSO(statBase, false) : 0,
      ee_eis: defHasSOCSO ? calculateEIS(statBase, false) : 0,
      ee_lindung: defHasLindung ? calculateLindung(statBase, selectedMonth) : 0,
      ee_pcb: 0,
      er_epf: defHasEPF ? calculateEPF(statBase, true) : 0,
      er_socso: defHasSOCSO ? calculateSOCSO(statBase, true) : 0,
      er_eis: defHasSOCSO ? calculateEIS(statBase, true) : 0,
      note: finalNote,
      autoCalc: true,
      hasEPF: defHasEPF,
      hasSOCSO: defHasSOCSO,
      // 看人事档案有没有登记「不扣」→ 开关状态存在档案里，不用每个月重新关
      // 2026-06 以前没有这个计划
      hasLindung: defHasLindung,
      // 💳 付款方式跟着人事档案走，没设定过才默认银行
      paymentMethod: emp.payrollPaymentMethod || "BANK",
      proRateMode: "26_DAYS",
      workDays: initialWorkDays,
      isPaid: false,
      paidAt: "",
      paymentExpenseId: "",
    };
  };

  const loadPayrollForMonth = async () => {
    setIsLoading(true);
    try {
      const initialData: Record<string, DetailedPayrollEntry> = {};

      const [allRecords, rosterData, rawMonthAttendance, storeConfig] =
        await Promise.all([
          DataManager.getPayrollRecords(),
          DataManager.getRosterData(),
          DataManager.getAttendanceByMonth(selectedMonth), // 👑 读本月考勤, 用于计算迟到
          DataManager.getConfig(),
        ]);

      if (storeConfig) {
        setEnableAttendanceDeduction(!!storeConfig.enableAttendanceDeduction);
        setLatePenaltyMode((storeConfig.latePenaltyMode as any) || 'FULL');
        setPdfPenaltyMode((storeConfig.pdfPenaltyMode as any) || 'SHOW_AND_DEDUCT');
      }

      const monthAttendance = mergeAttendanceRecords(rawMonthAttendance);

      const currentRoster = rosterData.roster || {};
      const existingRecord = allRecords.find((r) => r.id === selectedMonth);
      setDailyRoster(currentRoster);

      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-31`;

      // 👑 护栏修复：绝对禁止全量扫描！只拉取 STAFF_ADVANCE 分类的单据
      const qAdvances = query(
        collection(db, "standalone_expenses"),
        where("category", "==", "STAFF_ADVANCE"),
      );
      const snap = await getDocs(qAdvances);

      // 然后在内存中过滤本月时间 (极大减少读取量，因为预支单本来就少)
      const advances = snap.docs
        .map((d) => d.data() as ExpenseItem)
        .filter((e) => e.time >= startOfMonth && e.time <= endOfMonth);

      setMonthAdvances(advances);

      const qPartTime = query(
        collection(db, "standalone_expenses"),
        where("category", "==", "SALARY"),
      );
      const ptSnap = await getDocs(qPartTime);
      const manualPartTimes = ptSnap.docs
        .map((d) => d.data() as ExpenseItem)
        .filter((e) => e.time && e.time.startsWith(selectedMonth))
        .filter(
          (e) => !(e.id.startsWith("salary_") || e.id.startsWith("payroll_")),
        );
      setPartTimeExpenses(manualPartTimes);

      const targetEmployees = employees.filter((e) => {
        if (e.joinDate && e.joinDate.substring(0, 7) > selectedMonth)
          return false;

        // 硬规则：离职月已经过了就不算薪，不受「显示离职员工」开关影响
        const active = payrollActiveInMonth(e, selectedMonth);
        if (active === false) {
          // 只有已经存进去的历史记录才保留，避免旧资料被抹掉
          return !!existingRecord?.details?.some((d) => d.employeeId === e.id);
        }

        // ⏱️ 时薪兼职不进月薪结算 —— 他们在「兼职」分页按天登记、当场付现金
        //    （以前真的从月薪发过钱的记录照样保留，只排除自动生成、没发过的草稿）
        if (e.salaryMode === "HOURLY") {
          const d = existingRecord?.details?.find((x) => x.employeeId === e.id);
          return !!d && (!!d.isPaid || existingRecord?.status === "POSTED");
        }

        if (existingRecord?.details?.some((d) => d.employeeId === e.id))
          return true; // 👑 Prevent data loss for historical records

        const isEligible = e.isPayrollEligible !== undefined ? e.isPayrollEligible : !e.role.includes("Owner");
        if (!isEligible) return false;

        if (active === null && !showResigned) return false;
        return true;
      });

      if (existingRecord) {
        setIsPosted(existingRecord.status === "POSTED");
        setIsStatutoryPaid(!!existingRecord.isStatutoryPaid);

        targetEmployees.forEach((emp) => {
          const savedDetail = existingRecord.details.find(
            (d) => d.employeeId === emp.id,
          );

          const realTimeAdvance = advances
            .filter((a) => a.company === emp.name)
            .reduce((sum, a) => sum + (a.amount || 0), 0);

          // 💡 优化：提取安全的 Record 类型映射，消除零散的 as any，同时对 nationality 增加防呆
          if (savedDetail) {
            const sd = savedDetail as Record<string, any>;
            initialData[emp.id] = {
              basic: Number(sd.basicSalary) || 0,
              allowance: Number(sd.allowance) || 0,
              extraSubsidy: Number(sd.extraSubsidy) || 0,
              ot: Number(sd.ot) || 0,
              bonus: Number(sd.bonus) || 0,
              otherEarning: Number(sd.otherEarning) || 0,
              otherEarningNote: sd.otherEarningNote || "",
              latePenalty: Number(sd.penalty) || 0,
              unpaidLeave: Number(sd.unpaidLeave) || 0,
              hostelFee: Number(sd.hostelFee) || 0,
              advanceLoan:
                existingRecord.status === "DRAFT"
                  ? realTimeAdvance
                  : Number(sd.advanceLoan) || 0,
              otherDeduction: Number(sd.otherDeduction) || 0,
              otherDeductionNote: sd.otherDeductionNote || "",
              loanRepay: Number(sd.loanRepay) || 0,
              ee_epf: Number(sd.ee_epf) || 0,
              ee_socso: Number(sd.ee_socso) || 0,
              ee_eis: Number(sd.ee_eis) || 0,
              ee_lindung: Number(sd.ee_lindung) || 0,
              ee_pcb: Number(sd.ee_pcb) || 0,
              er_epf: Number(sd.er_epf) || 0,
              er_socso: Number(sd.er_socso) || 0,
              er_eis: Number(sd.er_eis) || 0,
              note: sd.note || "",
              autoCalc: false,
              hasEPF:
                (emp.nationality || "").includes("Malaysian") ||
                emp.hasEPF === true,
              hasSOCSO: (emp.nationality || "").includes("Malaysian"),
              hasLindung: sd.hasLindung !== undefined ? !!sd.hasLindung : true,
              // 💳 还没发的人：以人事档案的默认付款方式为准（草稿是自动存的，常常只是预设 BANK）
              paymentMethod: sd.isPaid
                ? sd.paymentMethod || "BANK"
                : emp.payrollPaymentMethod || sd.paymentMethod || "BANK",
              proRateMode: sd.proRateMode || "26_DAYS",
              workDays: sd.workDays || 0,
              isPaid: !!sd.isPaid,
              paidAt: sd.paidAt || "",
              paymentExpenseId: sd.paymentExpenseId || "",
            };
          } else {
            initialData[emp.id] = createDefaultEntry(
              emp,
              advances,
              currentRoster,
              monthAttendance,
            );
          }
        });
      } else {
        setIsPosted(false);
        setIsStatutoryPaid(false);
        targetEmployees.forEach((emp) => {
          initialData[emp.id] = createDefaultEntry(
            emp,
            advances,
            currentRoster,
            monthAttendance,
          );
        });
      }

      setPayrollData(initialData);

      // 👑 加固：若数据库尚无本月 PayrollRecord，自动 seed 一份 DRAFT 让财务报表立刻可读
      if (!existingRecord && Object.keys(initialData).length > 0) {
        try {
          const seedDetails = Object.entries(initialData).map(([id, entry]) => {
            const emp = employees.find((e) => e.id === id);
            const t = getTotals(entry);
            return {
              employeeId: id,
              employeeName: emp?.name || "Unknown",
              basicSalary: entry.basic,
              allowance: entry.allowance,
              extraSubsidy: entry.extraSubsidy,
              ot: entry.ot,
              bonus: entry.bonus,
              otherEarning: entry.otherEarning,
              otherEarningNote: entry.otherEarningNote,
              penalty: entry.latePenalty,
              unpaidLeave: entry.unpaidLeave,
              hostelFee: entry.hostelFee,
              advanceLoan: entry.advanceLoan,
              otherDeduction: entry.otherDeduction,
              otherDeductionNote: entry.otherDeductionNote,
              loanRepay: entry.loanRepay || 0,
              ee_epf: entry.ee_epf,
              ee_socso: entry.ee_socso,
              ee_eis: entry.ee_eis,
              ee_lindung: entry.ee_lindung || 0,
              hasLindung: !!entry.hasLindung,
              ee_pcb: entry.ee_pcb,
              er_epf: entry.er_epf,
              er_socso: entry.er_socso,
              er_eis: entry.er_eis,
              netPay: t.netPay,
              totalCost: t.totalCompanyCost,
              note: entry.note || "",
              paymentMethod: entry.paymentMethod || "BANK",
              proRateMode: entry.proRateMode || "26_DAYS",
              workDays: entry.workDays || 0,
              isPaid: false,
              paidAt: "",
              paymentExpenseId: "",
            };
          });
          const seedTotals = seedDetails.reduce(
            (acc, d) => ({
              net: acc.net + d.netPay,
              cost: acc.cost + d.totalCost,
              govt:
                acc.govt +
                d.ee_epf +
                d.ee_socso +
                (d.ee_eis || 0) +
                (d.ee_lindung || 0) +
                (d.ee_pcb || 0) +
                d.er_epf +
                d.er_socso +
                d.er_eis,
            }),
            { net: 0, cost: 0, govt: 0 },
          );

          await DataManager.savePayrollRecord({
            id: selectedMonth,
            month: selectedMonth,
            totalAmount: seedTotals.cost,
            totalNetPay: seedTotals.net,
            totalGovtPay: seedTotals.govt,
            staffCount: seedDetails.length,
            status: "DRAFT",
            details: seedDetails as any,
          });
          console.log("✅ Auto-seeded DRAFT for", selectedMonth);
        } catch (seedErr) {
          console.warn("Seed DRAFT skipped:", seedErr);
        }
      }
    } catch (error) {
      console.error("Load Payroll Error", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPayrollForMonth();
  }, [selectedMonth, employees, showResigned]);

  // 👑 自动将付款日期同步为所选月份的最后一天 (默认出款日)
  useEffect(() => {
    if (selectedMonth && selectedMonth.includes("-")) {
      const [yearStr, monthStrPart] = selectedMonth.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStrPart, 10);
      const lastDay = new Date(year, month, 0).getDate();
      setPaymentDate(`${yearStr}-${monthStrPart.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (!editingEmpId || !payrollData[editingEmpId]) return;
    const entry = payrollData[editingEmpId];
    const emp = employees.find((e) => e.id === editingEmpId);
    if (!emp) return;

    let syncedDays = entry.workDays || 0;

    // 👑 兜底重算：若 workDays = 0 且是离职/入职月，从 Roster 实时重算
    // 防止旧 draft 没存 workDays、或 createDefaultEntry 漏算的情况
    if (
      syncedDays === 0 &&
      (emp.joinDate?.startsWith(selectedMonth) ||
        emp.terminationDate?.startsWith(selectedMonth))
    ) {
      const [yr, mo] = selectedMonth.split("-");
      const totalDaysInMonth = new Date(
        parseInt(yr),
        parseInt(mo),
        0,
      ).getDate();
      const startDate = emp.joinDate?.startsWith(selectedMonth)
        ? new Date(emp.joinDate)
        : new Date(`${selectedMonth}-01`);
      const endDate = emp.terminationDate?.startsWith(selectedMonth)
        ? new Date(emp.terminationDate)
        : new Date(`${selectedMonth}-${totalDaysInMonth}`);

      let workedDays = 0;
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        const dateIso = d.toISOString().split("T")[0];
        const status = dailyRoster[dateIso]?.[emp.id] || "WORK";
        if (status === "WORK") workedDays++;
      }
      syncedDays = workedDays;
    }

    setProRateSettings((prev) => ({
      ...prev,
      mode: entry.proRateMode || prev.mode,
      days: syncedDays, // 👑 自动同步从 Roster 计算的工作天数到 input
    }));
  }, [editingEmpId]); // 只在切换员工时同步, 避免输入时被重置

  // 👑 打开计算器时自动加载该员工当月考勤(供 Payslip 打印日历用)
  useEffect(() => {
    if (!editingEmpId) {
      setEditingAttendance([]);
      return;
    }
    DataManager.getAttendanceByMonth(selectedMonth, editingEmpId)
      .then((records: any[]) =>
        setEditingAttendance(mergeAttendanceRecords(records)),
      )
      .catch(() => setEditingAttendance([]));
  }, [editingEmpId, selectedMonth]);

  useEffect(() => {
    const anyModalOpen =
      editingEmpId || isAdvanceModalOpen || showAdvanceHistory;
    if (anyModalOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        const savedY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, parseInt(savedY || "0") * -1);
      };
    }
  }, [editingEmpId, isAdvanceModalOpen, showAdvanceHistory]);

  const handleMonthChange = (delta: number) => {
    const [year, month] = selectedMonth.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1 + delta, 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedEmpIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedEmpIds(newSet);
  };

  const handleSelectAll = () => {
    if (
      selectedEmpIds.size === displayEmployees.length &&
      displayEmployees.length > 0
    ) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(displayEmployees.map((e) => e.id)));
    }
  };

  // 🎯 快速勾选：未发的全部 / 只选银行 / 只选现金（发薪通常分两批：网银一批、现金一批）
  const selectUnpaidBy = (method?: "BANK" | "CASH") => {
    const ids = displayEmployees
      .filter((e) => {
        const en = payrollData[e.id];
        if (!en || en.isPaid) return false;
        if (!method) return true;
        return (en.paymentMethod || "BANK") === method;
      })
      .map((e) => e.id);
    setSelectedEmpIds(new Set(ids));
  };

  // 💳 改付款方式：当月这笔 + 人事档案一起改，下个月自动带入
  const setPaymentMethodFor = (empId: string, method: "BANK" | "CASH") => {
    const en = payrollData[empId];
    if (!en || en.isPaid || isPosted) return;
    if ((en.paymentMethod || "BANK") === method) return;
    updateEntry(empId, { paymentMethod: method });
    patchEmployeeProfile(empId, { payrollPaymentMethod: method });
  };

  const handleSaveAdvance = async () => {
    if (!advForm.empId || !advForm.amount)
      return alert("⚠️ 请选择员工并填写金额");
    const emp = employees.find((e) => e.id === advForm.empId);
    if (!emp) return;

    const newExpense: ExpenseItem = {
      id: `adv_${Date.now()}`,
      category: "STAFF_ADVANCE",
      expenseType: "SALARY",
      company: emp.name,
      amount: parseFloat(advForm.amount),
      note: `预支薪水 - ${advForm.note}`,
      time: advForm.date, // User selected Date
      createdAt: new Date().toISOString(), // Audit Trail
      paymentMethod: advForm.method as any,
      paymentStatus: "PAID",
    };

    await DataManager.saveStandaloneExpense(newExpense);
    setIsAdvanceModalOpen(false);
    setAdvForm({
      empId: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      note: "",
      method: "BANK_TRANSFER",
    });
    alert("✅ 预支已记录 (Advance Recorded)");
    loadPayrollForMonth();
  };

  const handleUpdateAdvance = async () => {
    if (!editingAdvanceItem) return;
    if (!editAdvForm.company || !editAdvForm.amount) {
      alert("⚠️ 请选择员工并填写金额");
      return;
    }

    const emp = employees.find((e) => e.id === editAdvForm.company);
    if (!emp) {
      alert("⚠️ 未找到选中的员工");
      return;
    }

    try {
      setIsLoading(true);
      const updatedExpense: ExpenseItem = {
        ...editingAdvanceItem,
        company: emp.name,
        amount: parseFloat(editAdvForm.amount),
        note: editAdvForm.note,
        time: editAdvForm.date,
        paymentMethod: editAdvForm.paymentMethod as any,
      };

      await DataManager.saveStandaloneExpense(updatedExpense);

      setEditingAdvanceItem(null);
      alert("✅ 预支修改成功！");
      await loadPayrollForMonth();
    } catch (err) {
      console.error("Failed to update advance:", err);
      alert("❌ 修改失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAdvance = async (
    advId: string,
    staffName: string,
    amount: number,
  ) => {
    if (
      !confirm(
        `⚠️ 确定要删除这一笔属于 【${staffName}】 的预支记录 (金额: RM ${amount.toFixed(2)}) 吗？\n\n删除后不可恢复，且该员工的本月薪水核算将自动恢复。`,
      )
    ) {
      return;
    }

    try {
      setIsLoading(true);
      await deleteDoc(doc(db, "standalone_expenses", advId));
      alert("✅ 预支删除成功！");
      await loadPayrollForMonth();
    } catch (err) {
      console.error("Failed to delete advance:", err);
      alert("❌ 删除失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const updateEntry = (id: string, updates: Partial<DetailedPayrollEntry>) => {
    setPayrollData((prev) => {
      const current = { ...prev[id], ...updates };
      if (
        "ee_epf" in updates ||
        "er_epf" in updates ||
        "ee_socso" in updates ||
        "er_socso" in updates
      ) {
        current.autoCalc = false;
      }
      if (current.autoCalc && !isPosted) {
        const grossForStatutory =
          current.basic -
          current.unpaidLeave;
        const safeGross = Math.max(0, grossForStatutory);

        if (current.hasEPF) {
          current.ee_epf = calculateEPF(safeGross, false);
          current.er_epf = calculateEPF(safeGross, true);
        } else {
          current.ee_epf = 0;
          current.er_epf = 0;
        }

        if (current.hasSOCSO) {
          current.ee_socso = calculateSOCSO(safeGross, false);
          current.er_socso = calculateSOCSO(safeGross, true);
          current.ee_eis = calculateEIS(safeGross, false);
          current.er_eis = calculateEIS(safeGross, true);
        } else {
          current.ee_socso = 0;
          current.er_socso = 0;
          current.ee_eis = 0;
          current.er_eis = 0;
        }

        // LINDUNG 24 Jam 独立开关：跟 SOCSO 无关，退出的人才关掉
        current.ee_lindung = current.hasLindung ? calculateLindung(safeGross, selectedMonth) : 0;
      }
      return { ...prev, [id]: current };
    });
  };

  const triggerRecalculateStatutory = (id: string) => {
    setPayrollData((prev) => {
      const current = { ...prev[id], autoCalc: true };
      const grossForStatutory =
        current.basic -
        current.unpaidLeave;
      const safeGross = Math.max(0, grossForStatutory);

      if (current.hasEPF) {
        current.ee_epf = calculateEPF(safeGross, false);
        current.er_epf = calculateEPF(safeGross, true);
      } else {
        current.ee_epf = 0;
        current.er_epf = 0;
      }
      if (current.hasSOCSO) {
        current.ee_socso = calculateSOCSO(safeGross, false);
        current.er_socso = calculateSOCSO(safeGross, true);
        current.ee_eis = calculateEIS(safeGross, false);
        current.er_eis = calculateEIS(safeGross, true);
      } else {
        current.ee_socso = 0;
        current.er_socso = 0;
        current.ee_eis = 0;
        current.er_eis = 0;
      }
      current.ee_lindung = current.hasLindung ? calculateLindung(safeGross, selectedMonth) : 0;
      return { ...prev, [id]: current };
    });
  };

  const toggleStatutory = (id: string, type: "EPF" | "SOCSO") => {
    const entry = payrollData[id];
    if (!entry) return;
    if (type === "EPF")
      updateEntry(id, { hasEPF: !entry.hasEPF, autoCalc: true });
    else updateEntry(id, { hasSOCSO: !entry.hasSOCSO, autoCalc: true });
  };

  const handleToggleDeduction = async () => {
    const newValue = !enableAttendanceDeduction;
    setEnableAttendanceDeduction(newValue);
    try {
      const currentConfig = (await DataManager.getConfig()) || {
        businessDayCutoff: 15,
        timeZoneOffset: 8,
      };
      currentConfig.enableAttendanceDeduction = newValue;
      await DataManager.saveConfig(currentConfig);
      // 重新加载当月薪资以刷新 penalty 状态
      await loadPayrollForMonth();
    } catch (e) {
      console.error("Save config failed:", e);
    }
  };

  const handleSetLatePenaltyMode = async (mode: 'FULL' | 'HALF' | 'WARN_ONLY') => {
    setLatePenaltyMode(mode);
    try {
      const currentConfig = (await DataManager.getConfig()) || {
        businessDayCutoff: 15,
        timeZoneOffset: 8,
      };
      currentConfig.latePenaltyMode = mode;
      await DataManager.saveConfig(currentConfig);
      // 重新加载当月薪资以刷新 penalty 状态
      await loadPayrollForMonth();
    } catch (e) {
      console.error("Save latePenaltyMode config failed:", e);
    }
  };

  const handleSetPdfPenaltyMode = async (mode: 'SHOW_AND_DEDUCT' | 'SHOW_BUT_NO_DEDUCT' | 'HIDE') => {
    setPdfPenaltyMode(mode);
    try {
      const currentConfig = (await DataManager.getConfig()) || {
        businessDayCutoff: 15,
        timeZoneOffset: 8,
      };
      currentConfig.pdfPenaltyMode = mode;
      await DataManager.saveConfig(currentConfig);
    } catch (e) {
      console.error("Save pdfPenaltyMode config failed:", e);
    }
  };

  const syncBasicSalary = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    if (emp) {
      const historicalBasic = getHistoricalSalary(emp, selectedMonth);
      updateEntry(id, { basic: Number(historicalBasic) || 0, autoCalc: true });
    }
  };

  // 👑 重算迟到扣款 (从当月考勤记录重新计算, 覆盖原值)
  const handleRecalcLatePenalty = async (id: string) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    if (
      !confirm(
        `确定要从 ${selectedMonth} 的考勤记录重新计算迟到扣款吗？\n(将覆盖当前 Late Penalty 值)`,
      )
    )
      return;

    try {
      const attendance = await DataManager.getAttendanceByMonth(selectedMonth);
      const empAtt = mergeAttendanceRecords(attendance)
        .filter((r: any) => r.employeeId === id)
        .map((r: any) => ({
          clockIn: r.clockIn,
          date: r.date,
          employeeId: r.employeeId,
        }));
      const basic = getHistoricalSalary(emp, selectedMonth);
      const calc = calculateLatePenalty(basic, empAtt, emp.fixedShift);
      const actualPenaltyAmount = enableAttendanceDeduction ? getDeductedLatePenalty(calc.amount, latePenaltyMode) : 0;
      const displayPenaltyDeduction = (enableAttendanceDeduction && latePenaltyMode !== 'WARN_ONLY') ? actualPenaltyAmount : 0;

      const newLateNote =
        calc.amount > 0
          ? `[Recalc-Late] 单日超 ${payrollShiftSettings.graceMinutes} min | ${
              enableAttendanceDeduction 
                ? `理论应扣 RM${calc.amount} | 实扣(扣款模式: ${latePenaltyMode === 'FULL' ? '100%实扣' : latePenaltyMode === 'HALF' ? '50%减半' : '警告不扣'}): RM${displayPenaltyDeduction}`
                : "(未启用自动扣薪)"
            }`
          : `[Recalc-Late] ${selectedMonth} 无迟到扣款`;

      const currentNote = payrollData[id]?.note || "";
      const cleanedNote = currentNote
        .replace(/\n?\[(Auto|Recalc)-Late\][^\n]*/g, "")
        .trim();
      const finalNote = cleanedNote
        ? `${cleanedNote}\n${newLateNote}`
        : newLateNote;

      updateEntry(id, {
        latePenalty: actualPenaltyAmount,
        rawLatePenalty: calc.amount,
        note: finalNote,
      });
      alert(
        `✅ 重算完成\n\n迟到统计: ${calc.singleDayCount} 次 | 累积: ${calc.totalLateMinutes} 分钟\n理论应扣: RM ${calc.amount}\n本次模式: ${latePenaltyMode === 'FULL' ? '100%实扣' : latePenaltyMode === 'HALF' ? '50%减半' : '警告不扣'}\n实际扣款: RM ${displayPenaltyDeduction}`,
      );
    } catch (err) {
      console.error(err);
      alert("❌ 重算失败：" + (err as Error).message);
    }
  };

  const handleFinalSettlement = () => {
    if (!editingEmpId || !editingEmp) return;

    if (!editingEmp.terminationDate) return alert("⚠️ 此员工未设置离职日期");
    if (!editingEmp.terminationDate.startsWith(selectedMonth)) {
      return alert(
        `离职日期 (${editingEmp.terminationDate}) 不在当前选中的月份`,
      );
    }

    if (!confirm(`确认进行离职结清 (Final Settlement)?`)) return;

    let startDateStr = `${selectedMonth}-01`;
    if (editingEmp.joinDate > startDateStr) startDateStr = editingEmp.joinDate;
    const endDateStr = editingEmp.terminationDate;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    let workedDaysExcludingOff = 0;
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateIso = d.toISOString().split("T")[0];
      const status = dailyRoster[dateIso]?.[editingEmpId] || "WORK";
      if (status === "WORK") workedDaysExcludingOff++;
    }

    const originalBasic = getHistoricalSalary(editingEmp, selectedMonth);
    const newBasic = parseFloat(
      ((originalBasic / 26) * workedDaysExcludingOff).toFixed(2),
    );

    updateEntry(editingEmpId, {
      basic: newBasic,
      autoCalc: true,
      proRateMode: "26_DAYS",
      workDays: workedDaysExcludingOff,
      note:
        (payrollData[editingEmpId].note || "") +
        `\n[FINAL SETTLEMENT] Last Day: ${endDateStr}\nCalculated ${workedDaysExcludingOff} working days.`,
    });

    alert(
      `✅ 已自动计算离职薪资。\n工作天数: ${workedDaysExcludingOff} 天\n实发底薪: RM ${newBasic}`,
    );
  };

  const calculateProRate = () => {
    if (!editingEmpId) return;
    const emp = employees.find((e) => e.id === editingEmpId);
    if (!emp) return;

    const originalBasic = getHistoricalSalary(emp, selectedMonth);
    const days = parseFloat(proRateSettings.days as any);
    if (isNaN(days) || days <= 0)
      return alert("⚠️ 请输入有效的工作天数");

    let newBasic = 0;
    const [yearStr, monthStr] = selectedMonth.split("-");
    const totalDaysInMonth = new Date(
      parseInt(yearStr),
      parseInt(monthStr),
      0,
    ).getDate();
    const restDays = emp.monthlyRestDays || 4;

    if (proRateSettings.mode === "26_DAYS")
      newBasic = parseFloat(((originalBasic / 26) * days).toFixed(2));
    else if (proRateSettings.mode === "CALENDAR_DAYS")
      newBasic = parseFloat(
        ((originalBasic / totalDaysInMonth) * days).toFixed(2),
      );
    else if (proRateSettings.mode === "WORKABLE_DAYS") {
      const denominator = totalDaysInMonth - restDays;
      newBasic = parseFloat(((originalBasic / denominator) * days).toFixed(2));
    }

    updateEntry(editingEmpId, {
      basic: newBasic,
      autoCalc: true,
      proRateMode: proRateSettings.mode,
      workDays: days,
      note:
        (payrollData[editingEmpId].note || "") +
        `\n[Pro-rate] Worked ${days} days (${proRateSettings.mode})`,
    });
  };
  // 👑 手动同步：从 Roster 重新计算当月 WORK 天数 (任何员工都可用)
  const syncWorkDaysFromRoster = () => {
    if (!editingEmpId) return;
    const emp = employees.find((e) => e.id === editingEmpId);
    if (!emp) return;

    const [yr, mo] = selectedMonth.split("-");
    const totalDaysInMonth = new Date(parseInt(yr), parseInt(mo), 0).getDate();

    // 范围：入职日(若本月)~离职日(若本月)，否则全月
    const startDate = emp.joinDate?.startsWith(selectedMonth)
      ? new Date(emp.joinDate)
      : new Date(`${selectedMonth}-01`);
    const endDate = emp.terminationDate?.startsWith(selectedMonth)
      ? new Date(emp.terminationDate)
      : new Date(`${selectedMonth}-${totalDaysInMonth}`);

    let workedDays = 0;
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateIso = d.toISOString().split("T")[0];
      const status = dailyRoster[dateIso]?.[emp.id] || "WORK";
      if (status === "WORK") workedDays++;
    }

    setProRateSettings((prev) => ({ ...prev, days: workedDays }));
    alert(
      `✅ 已同步：${workedDays} 个 WORK 天\n(从 ${selectedMonth} Roster 计算)`,
    );
  };

  const handleSettlePayment = async (method: "CASH" | "BANK_TRANSFER") => {
    const emp = employees.find((e) => e.id === editingEmpId);
    const entry = editingEmpId ? payrollData[editingEmpId] : null;
    if (!editingEmpId || !entry || !emp) return;

    const t = getTotals(entry);
    if (t.netPay < 0)
      return alert("⚠️ 实发工资是负数，请先处理预支或欠款");

    setIsLoading(true);
    try {
      const transactionTime = `${paymentDate}T12:00:00.000Z`;
      let actualAuditTime = new Date().toISOString();
      if (paymentDate && paymentDate.includes("-")) {
        const [py, pm, pd] = paymentDate.split("-").map(Number);
        const now = new Date();
        const auditDate = new Date(
          py,
          pm - 1,
          pd,
          now.getHours(),
          now.getMinutes(),
          now.getSeconds()
        );
        if (!isNaN(auditDate.getTime())) {
          actualAuditTime = auditDate.toISOString();
        }
      }
      const expenseId = `salary_${editingEmpId}_${selectedMonth}_${Date.now()}`;

      const expense: ExpenseItem = {
        id: expenseId,
        category: "SALARY",
        expenseType: "SALARY",
        company: emp.name,
        amount: parseFloat(t.netPay.toFixed(2)),
        paymentStatus: "PAID",
        paymentMethod: method,
        time: transactionTime,
        createdAt: actualAuditTime,
        note: `[Salary Payment] ${selectedMonth} - ${emp.name}`,
        paidBy: "COMPANY",
      };

      await DataManager.saveStandaloneExpense(expense);

      // 🟢 同步「欠款扣回」到人事档案的借还款记录
      await syncLoanRepayToProfile(
        editingEmpId,
        entry.loanRepay || 0,
        selectedMonth,
        paymentDate,
      );

      const updatedNote =
        (entry.note || "") +
        `\n[PAID] RM${t.netPay.toFixed(2)} via ${method} on ${paymentDate}`;

      // Local Update
      const updatedEntry = {
        ...entry,
        isPaid: true,
        paidAt: actualAuditTime,
        paymentExpenseId: expenseId,
        note: updatedNote,
      };
      setPayrollData((prev) => ({ ...prev, [editingEmpId]: updatedEntry }));

      // DB Update
      const currentRecords = await DataManager.getPayrollRecords();
      let recordToUpdate = currentRecords.find((r) => r.id === selectedMonth);

      if (!recordToUpdate) {
        recordToUpdate = {
          id: selectedMonth,
          month: selectedMonth,
          totalAmount: 0,
          totalNetPay: 0,
          totalGovtPay: 0,
          staffCount: 0,
          status: "DRAFT",
          details: [] as any,
        };
      }

      const currentDetails = Object.entries({
        ...payrollData,
        [editingEmpId]: updatedEntry,
      }).map(([id, e]: [string, any]) => {
        const em = employees.find((x) => x.id === id);
        const tm = getTotals(e);
        return {
          employeeId: id,
          employeeName: em?.name || "Unknown",
          basicSalary: e.basic,
          allowance: e.allowance,
          extraSubsidy: e.extraSubsidy,
          penalty: e.latePenalty,
          hostelFee: e.hostelFee,
          advanceLoan: e.advanceLoan,
          otherEarning: e.otherEarning,
          otherEarningNote: e.otherEarningNote,
          otherDeduction: e.otherDeduction,
          otherDeductionNote: e.otherDeductionNote,
          loanRepay: e.loanRepay || 0,
          ot: e.ot,
          bonus: e.bonus,
          unpaidLeave: e.unpaidLeave,
          ee_epf: e.ee_epf,
          ee_socso: e.ee_socso,
          ee_eis: e.ee_eis,
          ee_lindung: e.ee_lindung || 0,
          hasLindung: !!e.hasLindung,
          ee_pcb: e.ee_pcb,
          er_epf: e.er_epf,
          er_socso: e.er_socso,
          er_eis: e.er_eis,
          netPay: tm.netPay,
          totalCost: tm.totalCompanyCost,
          note: e.note,
          paymentMethod: e.paymentMethod || "BANK",
          proRateMode: e.proRateMode || "26_DAYS",
          workDays: e.workDays || 0,
          isPaid: e.isPaid,
          paidAt: e.paidAt,
          paymentExpenseId: e.paymentExpenseId,
        };
      });

      await DataManager.savePayrollRecord({
        ...recordToUpdate,
        details: currentDetails as any,
      });

      // 🟢 单人一个个发，发完最后一个也要自动结账，
      //    不然永远停在 DRAFT、跳不到「缴政府费用」
      const afterThis = payrollEntriesForMonth.active.every(([id, e]) =>
        id === editingEmpId ? true : !!e.isPaid,
      );
      let postedNow = false;
      if (afterThis && !isPosted) {
        await DataManager.savePayrollRecord({
          ...recordToUpdate,
          status: "POSTED",
          details: currentDetails as any,
        });
        setIsPosted(true);
        postedNow = true;
      }

      alert(
        `✅ 支付成功！\n已从资金管理 (${method === "CASH" ? "现金" : "银行"}) 扣除 RM ${t.netPay.toFixed(2)}。\n记账日期：${paymentDate}` +
          (postedNow
            ? "\n\n🎉 全员已付清，本月已自动结账！现在可以缴纳政府费用 (KWSP/SOCSO/EIS)。"
            : ""),
      );
      setShowPayConfirm(false);
    } catch (err) {
      console.error("Auto-save paid status failed", err);
      alert("❌ 支付记录失败，请检查网络！");
    } finally {
      setIsLoading(false);
    }
  };

  // 🟢 核心新增：个人退回付款功能 (Revoke Payment)
  // 🟢 核心新增：个人退回付款功能 (Revoke Payment)
  const handleRevokeIndividualPayment = async () => {
    if (!editingEmpId) return;
    const entry = payrollData[editingEmpId];
    if (!entry || !entry.isPaid) return;

    if (isPosted) {
      return alert(
        "⚠️ 整个月份已批量结账！请在下方大盘点击【撤销结账 (Revert)】，之后再进行单人修改。",
      );
    }

    if (
      !confirm(
        "⚠️ 确定要撤销这笔付款吗？(Undo Payment)\n\n系统将自动从【资金管理】删除这笔支出，并恢复【未付款】状态。",
      )
    )
      return;

    setIsLoading(true);
    try {
      if (entry!.paymentExpenseId) {
        await deleteDoc(
          doc(db, "standalone_expenses", entry!.paymentExpenseId),
        );
      }

      // 🟢 同步撤销人事档案里这个月的「薪资扣回」
      await removeLoanRepayFromProfile(editingEmpId, selectedMonth);

      const updatedNote = (entry!.note || "")
        .replace(/\[PAID\] RM[\d.]+ via (CASH|BANK_TRANSFER) on [\d-]+/, "")
        .trim();
      const updatedEntry = {
        ...entry!,
        isPaid: false,
        paidAt: "",
        paymentExpenseId: "",
        note: updatedNote,
      };

      setPayrollData((prev) => ({ ...prev, [editingEmpId]: updatedEntry }));

      const currentRecords = await DataManager.getPayrollRecords();
      let recordToUpdate = currentRecords.find((r) => r.id === selectedMonth);
      if (recordToUpdate) {
        const currentDetails = Object.entries({
          ...payrollData,
          [editingEmpId]: updatedEntry,
        }).map(([id, e]: [string, any]) => {
          const em = employees.find((x) => x.id === id);
          const tm = getTotals(e);
          return {
            employeeId: id,
            employeeName: em?.name || "Unknown",
            basicSalary: e.basic,
            allowance: e.allowance,
            extraSubsidy: e.extraSubsidy,
            penalty: e.latePenalty,
            hostelFee: e.hostelFee,
            advanceLoan: e.advanceLoan,
            otherEarning: e.otherEarning,
            otherEarningNote: e.otherEarningNote,
            otherDeduction: e.otherDeduction,
            otherDeductionNote: e.otherDeductionNote,
            loanRepay: e.loanRepay || 0,
            ot: e.ot,
            bonus: e.bonus,
            unpaidLeave: e.unpaidLeave,
            ee_epf: e.ee_epf,
            ee_socso: e.ee_socso,
            ee_eis: e.ee_eis,
            ee_lindung: e.ee_lindung || 0,
            hasLindung: !!e.hasLindung,
            ee_pcb: e.ee_pcb,
            er_epf: e.er_epf,
            er_socso: e.er_socso,
            er_eis: e.er_eis,
            netPay: tm.netPay,
            totalCost: tm.totalCompanyCost,
            note: e.note,
            paymentMethod: e.paymentMethod || "BANK",
            proRateMode: e.proRateMode || "26_DAYS",
            workDays: e.workDays || 0,
            isPaid: e.isPaid,
            paidAt: e.paidAt,
            paymentExpenseId: e.paymentExpenseId,
          };
        });
        await DataManager.savePayrollRecord({
          ...recordToUpdate,
          details: currentDetails as any,
        });
      }

      alert("✅ 撤销成功！该员工已退回未付款状态，资金流水已消除。");
    } catch (error) {
      console.error("Revoke error", error);
      alert("❌ 撤销失败，请检查网络！");
    } finally {
      setIsLoading(false);
    }
  };

  // 🟢 核心新增：批量撤销选中员工的付款 (Batch Undo Payment)
  const handleBatchRevokePayment = async () => {
    if (isPosted) {
      return alert(
        "⚠️ 整个月份已大盘结账！请在底部点击【撤销结账 (Revert)】，之后再进行修改。",
      );
    }

    const paidSelectedIds = Array.from(selectedEmpIds).filter(
      (id) => payrollData[id]?.isPaid,
    );

    if (paidSelectedIds.length === 0) {
      return alert("⚠️ 选中的员工中没有【已付款】的记录，无法撤销。");
    }

    if (
      !confirm(
        `⚠️ 确定要批量撤销这 ${paidSelectedIds.length} 位员工的付款吗？(Batch Undo)\n\n系统将自动从【资金管理】删除这些支出流水，并恢复为【未付款】状态。`,
      )
    )
      return;

    setIsLoading(true);
    try {
      // 1. 并发删除选中的独立支出单库
      const deletePromises = paidSelectedIds.map(async (id) => {
        const entry = payrollData[id];
        if (entry?.paymentExpenseId) {
          await deleteDoc(
            doc(db, "standalone_expenses", entry.paymentExpenseId),
          );
        }
      });
      await Promise.all(deletePromises);

      // 🟢 同步撤销人事档案里这个月的「薪资扣回」
      for (const id of paidSelectedIds) {
        await removeLoanRepayFromProfile(id, selectedMonth);
      }

      // 2. 更新本地状态 (清除备注和支付标记)
      const updatedPayrollData = { ...payrollData };
      paidSelectedIds.forEach((id) => {
        const entry = updatedPayrollData[id];
        const updatedNote = (entry.note || "")
          .replace(/\[PAID\] RM[\d.]+ via (CASH|BANK_TRANSFER) on [\d-]+/g, "")
          .trim();
        updatedPayrollData[id] = {
          ...entry,
          isPaid: false,
          paidAt: "",
          paymentExpenseId: "",
          note: updatedNote,
        };
      });
      setPayrollData(updatedPayrollData);

      // 3. 更新总表数据库
      const currentRecords = await DataManager.getPayrollRecords();
      let recordToUpdate = currentRecords.find((r) => r.id === selectedMonth);

      if (recordToUpdate) {
        const currentDetails = Object.entries(updatedPayrollData).map(
          ([id, e]: [string, any]) => {
            const em = employees.find((x) => x.id === id);
            const tm = getTotals(e);
            return {
              employeeId: id,
              employeeName: em?.name || "Unknown",
              basicSalary: e.basic,
              allowance: e.allowance,
              extraSubsidy: e.extraSubsidy,
              penalty: e.latePenalty,
              hostelFee: e.hostelFee,
              advanceLoan: e.advanceLoan,
              otherEarning: e.otherEarning,
              otherEarningNote: e.otherEarningNote,
              otherDeduction: e.otherDeduction,
              otherDeductionNote: e.otherDeductionNote,
              loanRepay: e.loanRepay || 0,
              ot: e.ot,
              bonus: e.bonus,
              unpaidLeave: e.unpaidLeave,
              ee_epf: e.ee_epf,
              ee_socso: e.ee_socso,
              ee_eis: e.ee_eis,
              ee_lindung: e.ee_lindung || 0,
              hasLindung: !!e.hasLindung,
              ee_pcb: e.ee_pcb,
              er_epf: e.er_epf,
              er_socso: e.er_socso,
              er_eis: e.er_eis,
              netPay: tm.netPay,
              totalCost: tm.totalCompanyCost,
              note: e.note,
              paymentMethod: e.paymentMethod || "BANK",
              proRateMode: e.proRateMode || "26_DAYS",
              workDays: e.workDays || 0,
              isPaid: e.isPaid,
              paidAt: e.paidAt,
              paymentExpenseId: e.paymentExpenseId,
            };
          },
        );
        await DataManager.savePayrollRecord({
          ...recordToUpdate,
          details: currentDetails as any,
        });
      }

      // 撤销完成后清空选中状态，方便下一步操作
      setSelectedEmpIds(new Set());

      alert(
        `✅ 批量撤销成功！已退回 ${paidSelectedIds.length} 位员工至未付款状态。`,
      );
    } catch (error) {
      console.error("Batch Revoke error", error);
      alert("❌ 撤销失败，请检查网络！");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintSingleSlip = async () => {
    if (!printSlipRef.current || !attendancePrintRef.current) return;
    setIsGeneratingPdf(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      
      // Capture Page 1: Payslip
      await waitForPdfFonts();
      const canvas1 = await html2canvas(printSlipRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 2000,
        windowHeight: 2000,
        onclone: async (clonedDoc) => {
          // 👑 iPhone：等 clone iframe 里的字体真的载入再量字宽，避免数字/连字号叠在一起
          await prepareClonedDocumentForPdf(clonedDoc);
          const clonedEl = clonedDoc.getElementById('hr-payroll-print-slip');
          if (printSlipRef.current && clonedEl) {
            applyResolvedStylesForPdf(printSlipRef.current as HTMLElement, clonedEl as HTMLElement);
          }
        }
      });
      const imgData1 = canvas1.toDataURL("image/jpeg", 1.0);
      
      // Capture Page 2: Monthly Attendance Record
      await waitForPdfFonts();
      const canvas2 = await html2canvas(attendancePrintRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 2000,
        windowHeight: 2000,
        onclone: async (clonedDoc) => {
          // 👑 iPhone：等 clone iframe 里的字体真的载入再量字宽，避免数字/连字号叠在一起
          await prepareClonedDocumentForPdf(clonedDoc);
          const clonedEl = clonedDoc.getElementById('hr-payroll-attendance-print');
          if (attendancePrintRef.current && clonedEl) {
            applyResolvedStylesForPdf(attendancePrintRef.current as HTMLElement, clonedEl as HTMLElement);
          }
        }
      });
      const imgData2 = canvas2.toDataURL("image/jpeg", 1.0);

      const pdf = new (await loadJsPDF())("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // 1. Add Payslip (Page 1)
      const scaleX1 = pdfWidth / canvas1.width;
      const scaleY1 = pdfHeight / canvas1.height;
      const scale1 = Math.min(scaleX1, scaleY1);
      const finalWidth1 = canvas1.width * scale1;
      const finalHeight1 = canvas1.height * scale1;
      const xOffset1 = (pdfWidth - finalWidth1) / 2;
      const yOffset1 = (pdfHeight - finalHeight1) / 2;
      pdf.addImage(imgData1, "JPEG", xOffset1, yOffset1, finalWidth1, finalHeight1);
      
      // 2. Add Attendance (Page 2)
      pdf.addPage();
      const scaleX2 = pdfWidth / canvas2.width;
      const scaleY2 = pdfHeight / canvas2.height;
      const scale2 = Math.min(scaleX2, scaleY2);
      const finalWidth2 = canvas2.width * scale2;
      const finalHeight2 = canvas2.height * scale2;
      const xOffset2 = (pdfWidth - finalWidth2) / 2;
      const yOffset2 = (pdfHeight - finalHeight2) / 2;
      pdf.addImage(imgData2, "JPEG", xOffset2, yOffset2, finalWidth2, finalHeight2);
      
      pdf.save(`Payslip_&_Attendance_${selectedMonth}_${editingEmp?.name || editingEmpId}.pdf`);
    } catch (e) {
      console.error(e);
      alert("❌ 打印失败");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintSummary = async () => {
    if (selectedEmpIds.size === 0) return alert("⚠️ 请先勾选需要打印的员工");
    if (!printSummaryRef.current) return;
    setIsGeneratingPdf(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      await waitForPdfFonts();
      const canvas = await html2canvas(printSummaryRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 2000,
        onclone: async (clonedDoc) => {
          // 👑 iPhone：等 clone iframe 里的字体真的载入再量字宽，避免数字/连字号叠在一起
          await prepareClonedDocumentForPdf(clonedDoc);
          const clonedEl = clonedDoc.getElementById('hr-payroll-summary-print');
          if (printSummaryRef.current && clonedEl) {
            applyResolvedStylesForPdf(printSummaryRef.current as HTMLElement, clonedEl as HTMLElement);
          }
        }
      });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new (await loadJsPDF())("l", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 297mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 210mm
      
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Page 1
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add extra pages if content overflows the first page
      while (heightLeft > 0) {
        position = position - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Payroll_Summary_${selectedMonth}.pdf`);
    } catch (e) {
      console.error(e);
      alert("❌ 汇总打印失败");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 🟢 核心修复：强制数字精度保留2位小数，杜绝后台保存 .0000001
  const getTotals = (entry: DetailedPayrollEntry) => {
    const gross = Number(
      (
        entry.basic +
        entry.allowance +
        entry.extraSubsidy +
        entry.ot +
        entry.bonus +
        entry.otherEarning
      ).toFixed(2),
    );
    const penaltyToDeduct = (enableAttendanceDeduction && latePenaltyMode !== 'WARN_ONLY')
      ? (entry.latePenalty || 0)
      : 0;
    const employeeDeductions = Number(
      (
        penaltyToDeduct +
        entry.unpaidLeave +
        entry.hostelFee +
        entry.advanceLoan +
        entry.otherDeduction +
        (entry.loanRepay || 0) +
        entry.ee_epf +
        entry.ee_socso +
        entry.ee_eis +
        (entry.ee_lindung || 0) +
        entry.ee_pcb
      ).toFixed(2),
    );
    const netPay = Number((gross - employeeDeductions).toFixed(2));

    const employerCost = Number(
      (entry.er_epf + entry.er_socso + entry.er_eis).toFixed(2),
    );
    const totalCompanyCost = Number((gross + employerCost).toFixed(2));
    const totalGovtPay = Number(
      (
        entry.ee_epf +
        entry.er_epf +
        entry.ee_socso +
        entry.er_socso +
        entry.ee_eis +
        entry.er_eis +
        (entry.ee_lindung || 0) +   // LINDUNG 24 Jam：员工全额，雇主 0
        entry.ee_pcb
      ).toFixed(2),
    );

    return {
      gross,
      netPay,
      totalCompanyCost,
      employerCost,
      deductions: employeeDeductions,
      totalGovtPay,
    };
  };

  const getPdfTotals = (entry: DetailedPayrollEntry, mode: 'SHOW_AND_DEDUCT' | 'SHOW_BUT_NO_DEDUCT' | 'HIDE') => {
    const gross = Number(
      (
        entry.basic +
        entry.allowance +
        entry.extraSubsidy +
        entry.ot +
        entry.bonus +
        entry.otherEarning
      ).toFixed(2),
    );
    const penaltyToDeduct = mode === 'SHOW_AND_DEDUCT' ? (entry.latePenalty || 0) : 0;
    const employeeDeductions = Number(
      (
        penaltyToDeduct +
        entry.unpaidLeave +
        entry.hostelFee +
        entry.advanceLoan +
        entry.otherDeduction +
        (entry.loanRepay || 0) +
        entry.ee_epf +
        entry.ee_socso +
        entry.ee_eis +
        (entry.ee_lindung || 0) +
        entry.ee_pcb
      ).toFixed(2),
    );
    const netPay = Number((gross - employeeDeductions).toFixed(2));
    return {
      gross,
      deductions: employeeDeductions,
      netPay,
    };
  };

  /**
   * 部门判定 —— 跟传统账目 (LABOUR CHARGES 的部门明细) 用同一套规则，
   * 两边才不会一个说「楼面 22,248」、另一个说「FLOOR 16,301 + ADMIN 5,947」。
   *
   * 顺序：员工档案的 department 栏位 → 没填就用职位名称关键字推 → 还是猜不到算「未分部门」
   * 管理职 (Manager / Supervisor / HR / Admin / Owner) 现在独立成「管理 (Admin)」，
   * 以前没对到任何关键字的人全部 fallthrough 进楼面，所以楼面会比传统账目大一截。
   */
  const DEPT_LABEL: Record<string, string> = {
    KITCHEN: "🔥 厨房 (Kitchen)",
    BAR: "🧋 水吧 (Bar)",
    FLOOR: "🍽️ 楼面 (Floor)",
    DISHWASH: "🧹 清洁 (Cleaning)",
    BACK_OFFICE: "📋 管理 (Admin)",
    UNASSIGNED: "❓ 未分部门",
  };
  /** 部门卡的排序，跟传统账目那五行同一个顺序 */
  const DEPT_ORDER = ["KITCHEN", "BAR", "FLOOR", "DISHWASH", "BACK_OFFICE", "UNASSIGNED"];

  const getDepartmentKey = (emp: Employee): string => {
    let dept = emp.department ? String(emp.department).toUpperCase() : "";
    if (!dept || dept === "OTHER") {
      const role = String(emp.role || "").toUpperCase();
      const hit = LABOR_DEPT_ROLE_FALLBACK.find((rule) =>
        rule.keywords.some((k) => role.includes(k.toUpperCase())),
      );
      dept = hit ? hit.department : "UNASSIGNED";
    }
    if (dept === "OWNER") dept = "BACK_OFFICE";   // 传统账目把 OWNER 并进 ADMIN
    return DEPT_LABEL[dept] ? dept : "UNASSIGNED";
  };

  const getDepartment = (emp: Employee): string =>
    DEPT_LABEL[getDepartmentKey(emp)] || DEPT_LABEL.UNASSIGNED;

  /**
   * 👻 幽灵草稿过滤
   *
   * payrollData 里可能留着「已经离职、但草稿还在」的员工。
   * 画面上的员工列表 (displayEmployees) 会把他们藏起来，
   * 但底部大盘和部门明细以前是直接跑整包 payrollData —— 结果就是
   * 「待发 RM 3,500，可是列表里找不到是谁」。
   *
   * 规则：
   *   · 已经发过的 (isPaid) 一律算 —— 那是真的付出去的钱，不能凭空消失
   *   · 没发、而且这个月本来就不该算薪的 → 排除，并记下来给老板看是谁
   */
  const payrollEntriesForMonth = useMemo(() => {
    const active: [string, DetailedPayrollEntry][] = [];
    const ghosts: { id: string; name: string; dept: string; netPay: number; terminationDate: string }[] = [];

    Object.entries(payrollData).forEach(([id, e]) => {
      const emp = employees.find((x) => x.id === id);
      if (!emp) return;
      const isActive = payrollActiveInMonth(emp, selectedMonth);
      if (!e.isPaid && isActive === false) {
        ghosts.push({
          id,
          name: emp.name,
          dept: getDepartment(emp),
          netPay: getTotals(e).netPay,
          terminationDate: emp.terminationDate || "",
        });
        return;
      }
      active.push([id, e]);
    });

    return {
      active,
      ghosts: ghosts.sort((a, b) => b.netPay - a.netPay),
      ghostTotal: ghosts.reduce((sum, g) => sum + g.netPay, 0),
    };
  }, [payrollData, employees, selectedMonth]);

  /**
   * 这个月「该算薪的人」是不是都已经发完了。
   *
   * ⚠️ 一定要排除离职残留的旧草稿，否则那几笔永远 isPaid=false，
   *    月份就永远卡在 DRAFT、永远跳不到「缴政府费用 (KWSP/SOCSO/EIS)」那一步。
   */
  const isAllPaidForMonth = useMemo(() => {
    const list = payrollEntriesForMonth.active;
    if (list.length === 0) return false;
    return list.every(([, e]) => !!e.isPaid);
  }, [payrollEntriesForMonth]);

  /** 存档写的是 DRAFT，但实际上该发的都发完了 —— 画面上提示老板补一个结账动作 */
  const needsPostCatchUp = !isPosted && isAllPaidForMonth;

  const grandTotals = useMemo(() => {
    let net = 0,
      cost = 0,
      govt = 0,
      paid = 0,
      unpaid = 0,
      totalAdvance = 0,
      allAdvances = 0;
    payrollEntriesForMonth.active.forEach(
      ([, e]: [string, DetailedPayrollEntry]) => {
        const t = getTotals(e);
        const adv = e.advanceLoan || 0;
        net += t.netPay;
        cost += t.totalCompanyCost;
        govt += t.totalGovtPay;
        allAdvances += adv; // 全员预支总额（用于显示）

        // 👑 预支【无论员工本月是否已发薪】都已经作为 STAFF_ADVANCE 现金付出去了 → 算「已发」。
        // ⚠️ t.netPay 本身「已经扣掉预支」（getTotals 的 employeeDeductions 含 advanceLoan），
        //    所以待发 = 还没发的人的 netPay，不能再减一次预支 ——
        //    以前多减一次，待发少了一整笔预支，桌面版「总薪资」也跟着少，跟手机版、部门卡片、财报都对不上。
        //    现在：总薪资 = 净发 + 预支 + 兼职 = 已发 + 待发。
        paid += adv;
        if (e.isPaid) {
          paid += t.netPay;
        } else {
          unpaid += t.netPay;
          totalAdvance += adv; // 供底部【未付员工待收预支】提示使用
        }
      },
    );

    // 👑 存档用的净发：只含正式员工，不含兼职
    //    兼职本身就是 standalone_expenses 的独立记录，财务报表会另外抓一次；
    //    如果把它也写进薪资单的 totalNetPay，传统账目就会算两遍
    //    （PAYROLL 里一次 + 薪资SALARY 那行一次）。
    const netStaffOnly = net;
    const costStaffOnly = cost;

    // 以下把兼职加进来，是给画面上的 TOTAL SALARY 用的（当月实际付出去的现金）
    partTimeExpenses.forEach((exp) => {
      const amount = exp.amount || 0;
      net += amount;
      cost += amount;
      paid += amount;
    });

    return {
      net, cost, govt, paid, unpaid, totalAdvance, allAdvances,
      netStaffOnly, costStaffOnly,
      partTimeTotal: net - netStaffOnly,
    };
  }, [payrollEntriesForMonth, partTimeExpenses]);

  // 💳 勾选中、还没发的人，按付款方式分组 —— 批量发放前给老板看清楚
  const selectedBreakdown = useMemo(() => {
    const r = { bankCount: 0, bankAmt: 0, cashCount: 0, cashAmt: 0 };
    selectedEmpIds.forEach((id) => {
      const en = payrollData[id];
      if (!en || en.isPaid) return;
      const net = getTotals(en).netPay;
      if ((en.paymentMethod || "BANK") === "CASH") {
        r.cashCount++;
        r.cashAmt += net;
      } else {
        r.bankCount++;
        r.bankAmt += net;
      }
    });
    return r;
  }, [selectedEmpIds, payrollData]);

  // 📊 导出 Excel（薪资总表 / 银行转账 / 现金签收 / 政府缴纳 / 兼职）—— 用画面上已载入的资料，不多读资料库
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const penaltyCounts = enableAttendanceDeduction && latePenaltyMode !== "WARN_ONLY";
      const rows = payrollEntriesForMonth.active
        .map(([id, e]) => {
          const emp = employees.find((x) => x.id === id);
          if (!emp) return null;
          const t = getTotals(e);
          return {
            emp: { ...emp, ...(profilePatch[id] || {}) },
            department: getDepartment(emp),
            isLocal:
              (emp.nationality || "").includes("Malaysian") ||
              (emp.nationality || "").includes("🇲🇾"),
            entry: {
              basic: e.basic,
              allowance: e.allowance,
              extraSubsidy: e.extraSubsidy,
              ot: e.ot,
              bonus: e.bonus,
              otherEarning: e.otherEarning,
              latePenaltyDeducted: penaltyCounts ? e.latePenalty || 0 : 0,
              unpaidLeave: e.unpaidLeave,
              hostelFee: e.hostelFee,
              advanceLoan: e.advanceLoan,
              loanRepay: e.loanRepay || 0,
              otherDeduction: e.otherDeduction,
              ee_epf: e.ee_epf,
              ee_socso: e.ee_socso,
              ee_eis: e.ee_eis,
              ee_lindung: e.ee_lindung || 0,
              ee_pcb: e.ee_pcb,
              er_epf: e.er_epf,
              er_socso: e.er_socso,
              er_eis: e.er_eis,
              paymentMethod: (e.paymentMethod === "CASH" ? "CASH" : "BANK") as "BANK" | "CASH",
              isPaid: !!e.isPaid,
              paidAt: e.paidAt,
              workDays: e.workDays,
              note: e.note,
            },
            totals: t,
          };
        })
        .filter(Boolean) as any[];
      await exportPayrollExcel({
        month: selectedMonth,
        paymentDate,
        rows,
        partTime: partTimeExpenses,
      });
    } catch (err) {
      console.error("Excel export failed", err);
      alert("❌ 导出 Excel 失败，请再试一次");
    } finally {
      setIsExportingExcel(false);
    }
  };

  const deptBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      {
        net: number;
        paid: number;
        unpaid: number;
        govt: number;
        count: number;
        cost: number;
        /** 从薪水扣下来、但不是缴给政府的（预支 / 宿舍费 / 罚款 / 其他扣除 / 借款扣回） */
        deduct: number;
        /** 👑 点进去要看的：这个部门每一个人拿多少 */
        members: {
          id: string; name: string; role: string;
          net: number; govt: number; deduct: number; cost: number; isPaid: boolean;
        }[];
      }
    > = {};
    payrollEntriesForMonth.active.forEach(([id, e]) => {
      const emp = employees.find((x) => x.id === id);
      if (!emp) return;
      const dept = getDepartment(emp);
      if (!breakdown[dept])
        breakdown[dept] = {
          net: 0,
          paid: 0,
          unpaid: 0,
          govt: 0,
          count: 0,
          cost: 0,
          deduct: 0,
          members: [],
        };
      const t = getTotals(e);
      breakdown[dept].net += t.netPay;
      breakdown[dept].cost += t.totalCompanyCost;
      breakdown[dept].govt += t.totalGovtPay;
      // 总成本 = 净发 + 政府缴款 + 这一块。拆出来才看得懂三个数字的关系
      breakdown[dept].deduct += t.totalCompanyCost - t.netPay - t.totalGovtPay;
      breakdown[dept].count++;
      breakdown[dept].members.push({
        id,
        name: emp.name || id,
        role: emp.role || '',
        net: t.netPay,
        govt: t.totalGovtPay,
        deduct: t.totalCompanyCost - t.netPay - t.totalGovtPay,
        cost: t.totalCompanyCost,
        isPaid: !!e.isPaid,
      });
      // 预支已经付出去了 → 算进「已发」，跟底部总数同口径（已发 + 待发 = 净发 + 预支）
      breakdown[dept].paid += e.advanceLoan || 0;
      if (e.isPaid) breakdown[dept].paid += t.netPay;
      else breakdown[dept].unpaid += t.netPay;
    });
    Object.values(breakdown).forEach(b => b.members.sort((x, y) => y.net - x.net));
    return breakdown;
  }, [payrollEntriesForMonth, employees]);

  /**
   * 👷 非部门薪资（兼职 / 临时工 / 其他走 standalone_expenses 的人事支出）
   *
   * 这些钱有算进底部的 TOTAL SALARY，但没有员工档案、没有部门，
   * 所以进不了上面任何一张部门卡 —— 以前四张卡加起来永远对不上总数，
   * 老板只能自己猜差额是什么。现在独立成一张卡，而且可以点开看每一笔。
   */
  const nonDeptPayroll = useMemo(() => {
    const items = (partTimeExpenses || [])
      .map((e) => ({
        id: e.id,
        name: e.company || e.note || "未命名",
        date: (e.time || "").split("T")[0],
        amount: Number(e.amount) || 0,
        method: e.paymentMethod || "",
      }))
      .sort((a, b) => b.amount - a.amount);
    return { items, total: items.reduce((sum, x) => sum + x.amount, 0) };
  }, [partTimeExpenses]);

  const [showNonDeptDetail, setShowNonDeptDetail] = useState(false);
  /** 👑 点开某个部门看每个人拿多少；null = 没展开 */
  const [openDept, setOpenDept] = useState<string | null>(null);

  /** 把离职员工残留的旧草稿从本月薪资里移除（要老板确认，不会自动跑） */
  const handleClearGhostDrafts = async () => {
    const ghosts = payrollEntriesForMonth.ghosts;
    if (ghosts.length === 0) return;
    if (isPosted) {
      return alert("⚠️ 这个月已经入账，请先撤销结账再清理草稿。");
    }
    const list = ghosts.map((g) => `· ${g.name} (${g.id})  RM ${g.netPay.toFixed(2)}`).join("\n");
    if (
      !confirm(
        `⚠️ 确定要清除这 ${ghosts.length} 笔离职员工的旧草稿吗？\n\n${list}\n\n合计 RM ${payrollEntriesForMonth.ghostTotal.toFixed(2)}\n\n` +
          "这些人离职月已经过了，本月不该算薪。\n" +
          "清除后会从本月薪资资料里移除，并覆盖存档。\n" +
          "⚠️ 这个动作不能复原。",
      )
    )
      return;

    setIsLoading(true);
    try {
      const ghostIds = new Set(ghosts.map((g) => g.id));
      const cleaned: Record<string, DetailedPayrollEntry> = {};
      Object.entries(payrollData).forEach(([id, e]) => {
        if (!ghostIds.has(id)) cleaned[id] = e;
      });
      setPayrollData(cleaned);

      const records = await DataManager.getPayrollRecords();
      const record = records.find((r) => r.id === selectedMonth);
      if (record) {
        const details = (record.details || []).filter(
          (d: any) => !ghostIds.has(d.employeeId),
        );
        await DataManager.savePayrollRecord({ ...record, details: details as any });
      }
      alert(`✅ 已清除 ${ghosts.length} 笔旧草稿，合计 RM ${payrollEntriesForMonth.ghostTotal.toFixed(2)}`);
    } catch (err) {
      console.error("清除旧草稿失败", err);
      alert("❌ 清除失败，请检查网络");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSingleDraft = async () => {
    setIsLoading(true);
    try {
      const details = Object.entries(payrollData).map(
        ([id, entry]: [string, DetailedPayrollEntry]) => {
          const emp = employees.find((e) => e.id === id);
          const t = getTotals(entry);
          return {
            employeeId: id,
            employeeName: emp?.name || "Unknown",
            basicSalary: entry.basic,
            allowance: entry.allowance,
            extraSubsidy: entry.extraSubsidy,
            penalty: entry.latePenalty,
            hostelFee: entry.hostelFee,
            advanceLoan: entry.advanceLoan,
            otherEarning: entry.otherEarning,
            otherEarningNote: entry.otherEarningNote,
            otherDeduction: entry.otherDeduction,
            otherDeductionNote: entry.otherDeductionNote,
            loanRepay: entry.loanRepay || 0,
            ot: entry.ot,
            bonus: entry.bonus,
            unpaidLeave: entry.unpaidLeave,
            ee_epf: entry.ee_epf,
            ee_socso: entry.ee_socso,
            ee_eis: entry.ee_eis,
            ee_lindung: entry.ee_lindung || 0,
            hasLindung: !!entry.hasLindung,
            ee_pcb: entry.ee_pcb,
            er_epf: entry.er_epf,
            er_socso: entry.er_socso,
            er_eis: entry.er_eis,
            netPay: t.netPay,
            totalCost: t.totalCompanyCost,
            note: entry.note,
            paymentMethod: entry.paymentMethod || "BANK",
            proRateMode: entry.proRateMode || "26_DAYS",
            workDays: entry.workDays || 0,
            isPaid: entry.isPaid || false,
            paidAt: entry.paidAt || "",
            paymentExpenseId: entry.paymentExpenseId || "",
          };
        },
      );
      const record: PayrollRecord = {
        id: selectedMonth,
        month: selectedMonth,
        totalAmount: grandTotals.costStaffOnly,  // 同上
        totalNetPay: grandTotals.netStaffOnly,   // 不含兼职，免得传统账目重复计算
        totalGovtPay: grandTotals.govt,
        staffCount: details.length,
        status: isPosted ? "POSTED" : "DRAFT",
        details: details as any,
        partTimeDetails: partTimeExpenses,
      };
      await DataManager.savePayrollRecord(record);
      setEditingEmpId(null);
    } catch (e) {
      console.error(e);
      alert("❌ 保存失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevertStatus = async () => {
    if (
      !confirm(
        "⚠️ 确定要撤销结账吗？(Revert to Draft)\n\n这将自动删除之前批量生成的“资金管理”大盘支出记录。已经单独打款的个人记录将保持不受影响。",
      )
    )
      return;

    setIsLoading(true);
    try {
      const records = await DataManager.getPayrollRecords();
      const currentRecord = records.find((r) => r.id === selectedMonth);

      if (currentRecord) {
        const updatedDetails = currentRecord.details.map((d) => {
          if (!d.paymentExpenseId) {
            return { ...d, isPaid: false, paidAt: "" };
          }
          return d;
        });
        const record: PayrollRecord = {
          ...currentRecord,
          status: "DRAFT",
          isStatutoryPaid: false,
          details: updatedDetails as any,
        };
        await DataManager.savePayrollRecord(record);

        // Update local payrollData state to reflect the reverted status
        setPayrollData((prev) => {
          const newData = { ...prev };
          updatedDetails.forEach((d) => {
            if (newData[d.employeeId]) {
              newData[d.employeeId] = {
                ...newData[d.employeeId],
                isPaid: d.isPaid,
                paidAt: d.paidAt,
              };
            }
          });
          return newData;
        });
      }

      try {
        await deleteDoc(
          doc(db, "standalone_expenses", `payroll_net_cash_${selectedMonth}`),
        );
        await deleteDoc(
          doc(db, "standalone_expenses", `payroll_net_bank_${selectedMonth}`),
        );
        await deleteDoc(
          doc(db, "standalone_expenses", `payroll_stat_${selectedMonth}`),
        );
      } catch (err) {
        console.warn("Cleanup skipped", err);
      }

      setIsPosted(false);
      setIsStatutoryPaid(false);
      alert("✅ 已撤销大盘结账 (Reverted to Draft)");
    } catch (e) {
      console.error(e);
      alert("❌ 撤销失败");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 补一个结账动作。
   * 用在「该发的都发完了，但存档还写着 DRAFT」的月份 ——
   * 以前离职残留的旧草稿会让 allPaidNow 永远是 false，月份卡在草稿，
   * 就跳不到「缴政府费用」。演算法已经修好，这颗按钮是用来补救已经存下的旧记录。
   */
  const handleMarkPosted = async () => {
    if (!isAllPaidForMonth) {
      return alert("⚠️ 还有员工没发薪，不能标记为已结账。");
    }
    if (
      !confirm(
        `确认把 ${selectedMonth} 标记为「已结账 (POSTED)」？\n\n` +
          `本月该发的 ${payrollEntriesForMonth.active.length} 位员工都已付清。\n` +
          `结账后就可以缴纳政府费用 (KWSP / SOCSO / EIS)。\n\n` +
          `之后还是可以按「撤销结账」退回来。`,
      )
    )
      return;

    setIsLoading(true);
    try {
      const records = await DataManager.getPayrollRecords();
      const record = records.find((r) => r.id === selectedMonth);
      if (!record) {
        return alert("❌ 找不到本月的薪资存档，请先按「保存」再试。");
      }
      await DataManager.savePayrollRecord({ ...record, status: "POSTED" });
      setIsPosted(true);
      alert("✅ 已标记为结账，现在可以缴纳政府费用 (KWSP / SOCSO / EIS)。");
    } catch (err) {
      console.error("标记结账失败", err);
      alert("❌ 标记失败，请检查网络");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🔄 用现在的资料重算本月存档的数字
   *
   * 给「存档是旧代码写的、数字已经不对」的月份用。例如 8 月：
   *   · 存档时幽灵草稿还没修掉 → totalNetPay 多了那几笔
   *   · 存档时兼职被算进 totalNetPay → 传统账目的 PAYROLL 与 SALARY 重复计算
   *
   * ⚠️ 只覆盖金额与 details，不动月份状态 (POSTED/DRAFT)、
   *    也完全不碰资金管理里的任何一笔支出流水。
   */
  const handleRefreshRecord = async () => {
    const detail = payrollEntriesForMonth.active.map(([id, entry]) => {
      const emp = employees.find((e) => e.id === id);
      const t = getTotals(entry);
      return {
        employeeId: id,
        employeeName: emp?.name || "Unknown",
        basicSalary: entry.basic,
        allowance: entry.allowance,
        extraSubsidy: entry.extraSubsidy,
        penalty: entry.latePenalty,
        hostelFee: entry.hostelFee,
        advanceLoan: entry.advanceLoan,
        otherEarning: entry.otherEarning,
        otherEarningNote: entry.otherEarningNote,
        otherDeduction: entry.otherDeduction,
        otherDeductionNote: entry.otherDeductionNote,
        loanRepay: entry.loanRepay || 0,
        ot: entry.ot,
        bonus: entry.bonus,
        unpaidLeave: entry.unpaidLeave,
        ee_epf: entry.ee_epf,
        ee_socso: entry.ee_socso,
        ee_eis: entry.ee_eis,
        ee_lindung: entry.ee_lindung || 0,
        hasLindung: !!entry.hasLindung,
        ee_pcb: entry.ee_pcb,
        er_epf: entry.er_epf,
        er_socso: entry.er_socso,
        er_eis: entry.er_eis,
        netPay: t.netPay,
        totalCost: t.totalCompanyCost,
        note: entry.note,
        paymentMethod: entry.paymentMethod || "BANK",
        proRateMode: entry.proRateMode || "26_DAYS",
        workDays: entry.workDays || 0,
        isPaid: entry.isPaid,
        paidAt: entry.paidAt,
        paymentExpenseId: entry.paymentExpenseId,
      };
    });

    if (
      !confirm(
        `用现在的资料重算 ${selectedMonth} 的存档数字？\n\n` +
          `员工数：${detail.length} 人\n` +
          `实发净额：RM ${grandTotals.netStaffOnly.toFixed(2)}（不含兼职）\n` +
          `兼职另计：RM ${grandTotals.partTimeTotal.toFixed(2)}\n` +
          `政府缴款：RM ${grandTotals.govt.toFixed(2)}\n\n` +
          `只会覆盖存档里的金额，不动结账状态，也不碰任何一笔支出流水。`,
      )
    )
      return;

    setIsLoading(true);
    try {
      const records = await DataManager.getPayrollRecords();
      const record = records.find((r) => r.id === selectedMonth);
      if (!record) return alert("❌ 找不到本月的薪资存档");

      await DataManager.savePayrollRecord({
        ...record,
        totalAmount: grandTotals.costStaffOnly,
        totalNetPay: grandTotals.netStaffOnly,
        totalGovtPay: grandTotals.govt,
        staffCount: detail.length,
        details: detail as any,
      });
      alert(
        `✅ 已重算 ${selectedMonth} 的存档\n\n` +
          `实发净额 RM ${grandTotals.netStaffOnly.toFixed(2)}\n` +
          `现在回去看传统账目的 LABOUR CHARGES，数字应该就对了。`,
      );
    } catch (err) {
      console.error("重算存档失败", err);
      alert("❌ 重算失败，请检查网络");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayStatutory = async () => {
    if (
      !confirm(
        `确认缴纳政府费用 (KWSP / SOCSO / EIS / LINDUNG 24 Jam / PCB)?\n总额: RM ${grandTotals.govt.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      )
    )
      return;

    setIsLoading(true);
    try {
      const transactionTime = `${paymentDate}T12:00:00.000Z`;
      const statExp: ExpenseItem = {
        id: `payroll_stat_${selectedMonth}`,
        category: "SALARY",
        expenseType: "SALARY",
        company: `Govt Bodies (KWSP/SOCSO/EIS/LINDUNG/LHDN) - ${selectedMonth}`,
        amount: grandTotals.govt,
        paymentStatus: "PAID",
        paymentMethod: "BANK_TRANSFER",
        time: transactionTime,
        createdAt: new Date().toISOString(), // Audit Timestamp
        note: `[Statutory Payment] Contributions for ${selectedMonth}`,
        paidBy: "COMPANY",
      };
      await DataManager.saveStandaloneExpense(statExp);

      const records = await DataManager.getPayrollRecords();
      const currentRecord = records.find((r) => r.id === selectedMonth);
      if (currentRecord) {
        const updatedRecord: PayrollRecord = {
          ...currentRecord,
          isStatutoryPaid: true,
        };
        await DataManager.savePayrollRecord(updatedRecord);
      }

      setIsStatutoryPaid(true);
      alert("✅ 法定缴纳已记录 (Statutory Paid)!");
    } catch (e) {
      console.error("Pay Stat Error", e);
      alert("❌ 支付记录失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 👑 批量发放：每个人按自己的付款方式（银行/现金）分别入账，不再问一次「银行还是现金」
  const handleSavePayroll = async () => {
    if (selectedEmpIds.size === 0) return alert("⚠️ 请先勾选需要结算的员工！");
    const selectedCount = Array.from(selectedEmpIds).filter(
      (id) => payrollData[id] && !payrollData[id].isPaid,
    ).length;
    if (selectedCount === 0)
      return alert("⚠️ 选中的员工已全部付款，无需重复结算。");
    // 👑 不再弹第二次确认 —— 按「确认发放」之前画面已经列出银行/现金各几人、多少钱

    setIsLoading(true);
    try {
      let actualAuditTime = new Date().toISOString();
      if (paymentDate && paymentDate.includes("-")) {
        const [py, pm, pd] = paymentDate.split("-").map(Number);
        const now = new Date();
        const auditDate = new Date(
          py,
          pm - 1,
          pd,
          now.getHours(),
          now.getMinutes(),
          now.getSeconds()
        );
        if (!isNaN(auditDate.getTime())) {
          actualAuditTime = auditDate.toISOString();
        }
      }

      const details = Object.entries(payrollData).map(
        ([id, entry]: [string, DetailedPayrollEntry]) => {
          const emp = employees.find((e) => e.id === id);
          const t = getTotals(entry);
          const isSelectedForPay = selectedEmpIds.has(id);
          return {
            employeeId: id,
            employeeName: emp?.name || "Unknown",
            basicSalary: entry.basic,
            allowance: entry.allowance,
            extraSubsidy: entry.extraSubsidy,
            penalty: entry.latePenalty,
            hostelFee: entry.hostelFee,
            advanceLoan: entry.advanceLoan,
            otherEarning: entry.otherEarning,
            otherEarningNote: entry.otherEarningNote,
            otherDeduction: entry.otherDeduction,
            otherDeductionNote: entry.otherDeductionNote,
            loanRepay: entry.loanRepay || 0,
            ot: entry.ot,
            bonus: entry.bonus,
            unpaidLeave: entry.unpaidLeave,
            ee_epf: entry.ee_epf,
            ee_socso: entry.ee_socso,
            ee_eis: entry.ee_eis,
            ee_lindung: entry.ee_lindung || 0,
            hasLindung: !!entry.hasLindung,
            ee_pcb: entry.ee_pcb,
            er_epf: entry.er_epf,
            er_socso: entry.er_socso,
            er_eis: entry.er_eis,
            netPay: t.netPay,
            totalCost: t.totalCompanyCost,
            note: entry.note,
            paymentMethod: entry.paymentMethod || "BANK",
            proRateMode: entry.proRateMode || "26_DAYS",
            workDays: entry.workDays || 0,
            isPaid: entry.isPaid || isSelectedForPay, // 只把勾选的人标为已付
            paidAt: entry.isPaid
              ? entry.paidAt
              : isSelectedForPay
                ? actualAuditTime
                : "",
            paymentExpenseId: entry.paymentExpenseId || "",
          };
        },
      );
      // 只看「本月该算薪的人」，离职残留的旧草稿不算，否则永远结不了账
      const ghostIdSet = new Set(payrollEntriesForMonth.ghosts.map((g) => g.id));
      const countableDetails = details.filter(
        (d: any) => d.isPaid || !ghostIdSet.has(d.employeeId),
      );
      const allPaidNow =
        countableDetails.length > 0 && countableDetails.every((d: any) => d.isPaid);
      const record: PayrollRecord = {
        id: selectedMonth,
        month: selectedMonth,
        totalAmount: grandTotals.costStaffOnly,  // 同上
        totalNetPay: grandTotals.netStaffOnly,   // 不含兼职，免得传统账目重复计算
        totalGovtPay: grandTotals.govt,
        staffCount: details.length,
        status: allPaidNow ? "POSTED" : "DRAFT",
        isStatutoryPaid: false,
        details: details as any,
        partTimeDetails: partTimeExpenses,
      };

      await DataManager.savePayrollRecord(record);

      try {
        await deleteDoc(
          doc(db, "standalone_expenses", `payroll_net_cash_${selectedMonth}`),
        );
        await deleteDoc(
          doc(db, "standalone_expenses", `payroll_net_bank_${selectedMonth}`),
        );
      } catch (err) {
        console.log("Cleanup skipped", err);
      }

      let netCashTotal = 0;
      let netBankTotal = 0;

      // 👑 核心修复：扫描所有已付款员工（含本次新标记的），排除单人支付的独立记录
      // 先构建一个包含本次更新的完整数据快照
      const snapshotData = { ...payrollData };
      selectedEmpIds.forEach((id) => {
        if (snapshotData[id] && !snapshotData[id].isPaid) {
          snapshotData[id] = { ...snapshotData[id], isPaid: true };
        }
      });

      Object.entries(snapshotData).forEach(
        ([id, entry]: [string, DetailedPayrollEntry]) => {
          if (!entry.isPaid) return; // 未付款的跳过
          if (entry.paymentExpenseId) return; // 单人支付的有独立expense，不重复算

          const t = getTotals(entry);
          const empMethod = (entry.paymentMethod || "BANK").toUpperCase();
          if (empMethod === "CASH") {
            netCashTotal += t.netPay;
          } else {
            netBankTotal += t.netPay;
          }
        },
      );

      const transactionTime = `${paymentDate}T12:00:00.000Z`;
      // actualAuditTime is computed above based on user-configured paymentDate

      if (netCashTotal > 0) {
        const cashExp: ExpenseItem = {
          id: `payroll_net_cash_${selectedMonth}`,
          category: "SALARY",
          expenseType: "SALARY",
          company: `Staff Payroll (Cash) - ${selectedMonth}`,
          amount: netCashTotal,
          paymentStatus: "PAID",
          paymentMethod: "CASH",
          time: transactionTime,
          createdAt: actualAuditTime,
          note: `[Auto-Sync] Net Pay via Cash for ${selectedMonth}`,
          paidBy: "COMPANY",
        };
        await DataManager.saveStandaloneExpense(cashExp);
      }

      if (netBankTotal > 0) {
        const bankExp: ExpenseItem = {
          id: `payroll_net_bank_${selectedMonth}`,
          category: "SALARY",
          expenseType: "SALARY",
          company: `Staff Payroll (Bank) - ${selectedMonth}`,
          amount: netBankTotal,
          paymentStatus: "PAID",
          paymentMethod: "BANK_TRANSFER",
          time: transactionTime,
          createdAt: actualAuditTime,
          note: `[Auto-Sync] Net Pay via Bank for ${selectedMonth}`,
          paidBy: "COMPANY",
        };
        await DataManager.saveStandaloneExpense(bankExp);
      }

      // 🟢 同步「欠款扣回」到人事档案（只处理本次新发放的）
      for (const id of Array.from(selectedEmpIds)) {
        const en = payrollData[id];
        if (!en || en.isPaid) continue;
        if (!(Number(en.loanRepay) || 0)) continue;
        await syncLoanRepayToProfile(
          id,
          en.loanRepay || 0,
          selectedMonth,
          paymentDate,
        );
      }

      // 只更新勾选的员工为 Paid
      setPayrollData((prev) => {
        const updated = { ...prev };
        selectedEmpIds.forEach((id) => {
          if (updated[id] && !updated[id].isPaid) {
            updated[id].isPaid = true;
            updated[id].paidAt = actualAuditTime;
          }
        });
        return updated;
      });

      setIsPosted(allPaidNow);
      setIsStatutoryPaid(false);
      setShowBatchPayConfirm(false);
      setSelectedEmpIds(new Set());
      alert(
        `✅ 批量结算成功！已发放 ${selectedCount} 人\n银行 ${selectedBreakdown.bankCount} 人 / 现金 ${selectedBreakdown.cashCount} 人\n记账日期: ${paymentDate}${allPaidNow ? "\n\n🎉 全员已付清，状态已标记为 POSTED！" : "\n\n⚠️ 仍有员工未付款，状态保持 DRAFT。"}`,
      );
    } catch (e) {
      console.error("Payroll Save Error", e);
      alert("❌ 保存失败");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClassName =
    "w-full p-4 !bg-white border-2 border-gray-200 rounded-xl text-lg font-black text-black outline-none focus:border-[#111111] focus:ring-4 focus:ring-black/5 transition-all text-right shadow-sm disabled:bg-gray-50 disabled:text-gray-400 touch-manipulation";

  const renderEmployeeCard = (emp: Employee) => {
    const entry = payrollData[emp.id];
    if (!entry) return null;
    const totals = getTotals(entry);
    const isNewJoiner = emp.joinDate?.startsWith(selectedMonth);
    const isSelected = selectedEmpIds.has(emp.id);
    const isLocal =
      emp.nationality.includes("Malaysian") || emp.nationality.includes("🇲🇾");

    // 判断是否仍有政府税未缴
    const hasStatutory =
      entry.ee_epf > 0 ||
      entry.ee_socso > 0 ||
      entry.ee_eis > 0 ||
      (entry.ee_lindung || 0) > 0 ||
      entry.ee_pcb > 0;
    // 外劳也有 LINDUNG 24 Jam 要缴，所以不再只看本地
    const showStatutoryPending = hasStatutory && !isStatutoryPaid;

    return (
      <div
        key={emp.id}
        onClick={() => {
          setEditingEmpId(emp.id);
          setShowPayConfirm(false);
          setShowAdvanceHistory(false);
        }}
        className={`w-full bg-white rounded-xl md:rounded-2xl p-3 md:p-4 shadow-sm border hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 group cursor-pointer active:scale-[0.99] ${emp.isArchived ? "border-red-200 bg-red-50/10" : isSelected ? "border-[#111111] ring-1 ring-[#111111]" : entry.isPaid ? "border-emerald-300 bg-emerald-50/20" : "border-gray-200 hover:border-[#FFD200]"}`}
      >
        <div className="flex items-center gap-2 md:gap-4 w-full md:w-1/3">
          <div
            onClick={(e) => {
              e.stopPropagation();
              toggleSelection(emp.id);
            }}
            className="p-2 -ml-2 -my-2 text-gray-300 hover:text-black cursor-pointer shrink-0 active:scale-90 transition-transform"
            role="checkbox"
            aria-checked={isSelected}
          >
            {isSelected ? (
              <CheckSquare size={20} className="text-[#111111]" />
            ) : (
              <Square size={20} />
            )}
          </div>
          {/* 💡 优化：加入空字符串保底，避免 charAt(0) 和 split('(') 报错 */}
          <div
            className={`w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-sm text-gray-400 border-2 shadow-sm overflow-hidden shrink-0 ${emp.isArchived ? "bg-red-100 border-red-200 grayscale" : entry.isPaid ? "bg-emerald-100 border-emerald-300 text-emerald-600" : "bg-gray-100 border-white group-hover:border-[#FFD200]"}`}
          >
            {emp.avatar ? (
              <img src={emp.avatar} className="w-full h-full object-cover" />
            ) : (
              (emp.name || "U").charAt(0)
            )}
          </div>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-2">
              <h4
                className={`font-bold truncate text-sm md:text-base ${emp.isArchived ? "text-red-700" : "text-[#111111]"}`}
              >
                {emp.name || "Unknown"}
              </h4>
              {emp.isArchived && (
                <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  离职
                </span>
              )}
              {isNewJoiner && (
                <span className="bg-blue-100 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  新人 (New)
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{(emp.role || "未分配").split("(")[0]}</span>
              <span className="text-[8px] font-bold text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                休{emp.monthlyRestDays || 4}天
              </span>
              {emp.hasHostel && (
                <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">
                  🏠宿舍
                </span>
              )}
            </div>

            {/* 🟢 付款状态与 Audit Timestamp 展示 */}
            {entry.isPaid && (
              <div className="flex flex-col items-start gap-1 mt-1.5">
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded border flex items-center gap-1 ${showStatutoryPending ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-emerald-100 text-emerald-700 border-emerald-300"}`}
                >
                  <CheckCircle2 size={12} />
                  {showStatutoryPending
                    ? "已发薪 (待缴政府)"
                    : "✅ 薪资已全清 (Fully Paid)"}
                </span>
                {entry.paidAt && (
                  <span className="text-[8.5px] text-gray-400 font-bold ml-0.5">
                    付于 (Audit Time): {new Date(entry.paidAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="w-full md:w-2/3 flex flex-row justify-end items-center gap-3 md:gap-6 text-right mt-1 md:mt-0">
          {/* 💳 付款方式 —— 直接在列表点一下切换，会记在人事档案，下个月自动带入 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPaymentMethodFor(emp.id, entry.paymentMethod === "CASH" ? "BANK" : "CASH");
            }}
            disabled={entry.isPaid || isPosted}
            className={`mr-auto md:mr-0 shrink-0 px-2.5 rounded-lg border text-[11px] font-black flex items-center gap-1 min-h-[36px] active:scale-95 transition-all disabled:opacity-70 ${
              entry.paymentMethod === "CASH"
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
            aria-label="切换付款方式"
          >
            {entry.paymentMethod === "CASH" ? (
              <>
                <Banknote size={13} /> 现金
              </>
            ) : (
              <>
                <Building2 size={13} /> 银行
              </>
            )}
          </button>
          {entry.advanceLoan > 0 && (
            <div className="hidden md:block">
              <div className="text-[9px] text-red-400 uppercase font-bold mb-0.5">
                Advance
              </div>
              <div className="text-xs font-mono font-bold text-red-600">
                -RM {entry.advanceLoan.toFixed(2)}
              </div>
            </div>
          )}

          {(isLocal || totals.totalGovtPay > 0) && (
            <div className="shrink-0 hidden sm:block">
              <div className="text-[8px] md:text-[9px] text-blue-600 uppercase font-bold mb-0.5">
                Govt
              </div>
              <div className="text-[11px] md:text-sm font-mono font-bold text-blue-800">
                {totals.totalGovtPay.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          )}

          <div className="shrink-0">
            <div className="text-[8px] md:text-[9px] text-gray-400 uppercase font-bold mb-0.5">
              Cost
            </div>
            <div className="text-[11px] md:text-sm font-mono font-bold text-gray-600">
              {totals.totalCompanyCost.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>

          <div
            className={`shrink-0 px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl border transition-colors ${emp.isArchived ? "bg-red-100 border-red-200" : entry.isPaid ? "bg-emerald-500 border-emerald-600 text-white" : "bg-emerald-50 border-emerald-100 group-hover:bg-emerald-100"}`}
          >
            <div
              className={`text-[8px] md:text-[9px] uppercase font-bold mb-0.5 ${emp.isArchived ? "text-red-600" : entry.isPaid ? "text-emerald-100" : "text-emerald-600"}`}
            >
              Net
            </div>
            <div
              className={`text-xs md:text-lg font-mono font-black ${emp.isArchived ? "text-red-700" : entry.isPaid ? "text-white" : "text-emerald-700"}`}
            >
              {totals.netPay.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[#F6F7FB]">
      {/* Header */}
      <div
        className="bg-white text-[#111111] border-b border-gray-200"
        style={{
          paddingTop: "8px",
          paddingBottom: "10px",
          paddingLeft: "12px",
          paddingRight: "12px",
        }}
      >
        {/* Row 1: Title + Month Selector */}
        <div className="flex justify-between items-center gap-2">
          {/* 「薪资管理 · DRAFT」拿掉，改成「更多操作」（导出、预支、考勤设置） */}
          {currentMode === "CALC" ? (
            <button
              type="button"
              onClick={() => setPayMoreOpen(v => !v)}
              aria-expanded={payMoreOpen}
              className={`min-h-[44px] px-3 rounded-xl text-xs font-black flex items-center gap-1 border shrink-0 ${payMoreOpen ? "bg-[#111111] text-[#FFD200] border-[#111111]" : "bg-white text-gray-700 border-gray-200"}`}
            >
              更多操作 {payMoreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : <span />}

          <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5 shrink-0">
            <button
              onClick={() => handleMonthChange(-1)}
              className="p-2 hover:bg-gray-100 rounded text-gray-600 hover:text-black transition-colors active:scale-90 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
              aria-label="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1.5 px-2 border-x border-gray-200 mx-0.5">
              <Calendar size={14} className="text-[#FFD200] hidden md:block" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-[#111111] font-bold outline-none w-32 md:w-36 text-center appearance-none cursor-pointer text-[16px] md:text-sm"
                style={{ minHeight: "36px" }}
              />
            </div>
            <button
              onClick={() => handleMonthChange(1)}
              className="p-2 hover:bg-gray-100 rounded text-gray-600 hover:text-black transition-colors active:scale-90 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
              aria-label="Next Month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* 👑 iOS High contrast Segmented control to separate HR settlement calculation and payout list */}
        <div className="flex bg-gray-100 rounded-xl p-1 mt-2.5 md:max-w-md border border-gray-200 shadow-inner">
          <button
            onClick={() => setCurrentMode("CALC")}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 min-h-[44px] select-none active:scale-[0.98] ${currentMode === "CALC" ? "bg-[#FFD200] text-black shadow-md" : "text-gray-600 hover:text-black hover:bg-gray-100"}`}
          >
            🧮 月薪核算
          </button>
          <button
            onClick={() => setCurrentMode("HISTORY")}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 min-h-[44px] select-none active:scale-[0.98] ${currentMode === "HISTORY" ? "bg-[#FFD200] text-black shadow-md" : "text-gray-600 hover:text-black hover:bg-gray-100"}`}
          >
            📜 历史
          </button>
          <button
            onClick={() => setCurrentMode("PARTTIME")}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 min-h-[44px] select-none active:scale-[0.98] ${currentMode === "PARTTIME" ? "bg-[#FFD200] text-black shadow-md" : "text-gray-600 hover:text-black hover:bg-gray-100"}`}
          >
            ⏱️ 兼职
          </button>
        </div>

        {/* Row 2: Action buttons - compact horizontal scroll on mobile (Only visible in CALC mode) */}
        {currentMode === "CALC" && (
          payMoreOpen && <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-150"><div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel || isLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0 active:scale-95 min-h-[44px]"
            >
              {isExportingExcel ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={14} />
              )}{" "}
              Excel
            </button>
            <button
              onClick={handlePrintSummary}
              disabled={isGeneratingPdf || selectedEmpIds.size === 0}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0 active:scale-95 min-h-[44px]"
            >
              {isGeneratingPdf ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Printer size={14} />
              )}{" "}
              打印
            </button>
            <button
              onClick={() => setShowResigned(!showResigned)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shrink-0 active:scale-95 min-h-[44px] ${showResigned ? "bg-red-900 text-red-100 border-red-700" : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-white/20"}`}
            >
              <UserX size={14} /> {showResigned ? "隐藏离职" : "离职"}
            </button>
            {!isPosted && (
              <button
                onClick={() => setIsAdvanceModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95 min-h-[44px]"
              >
                <Wallet size={14} /> 预支
              </button>
            )}
            <button
              onClick={() => {
                setEditingEmpId(null);
                setShowAdvanceHistory(true);
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95 min-h-[44px]"
            >
              <History size={14} /> 预支历史
            </button>

            {/* ⏰ 考勤自动扣款开关 */}
            <div className="flex items-center gap-2 bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 shrink-0 min-h-[44px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-gray-600">
                  ⏰ 自动扣薪
                </span>
                <button
                  onClick={handleToggleDeduction}
                  className={`min-h-[44px] md:min-h-0 w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 focus:outline-none ${enableAttendanceDeduction ? "bg-amber-500" : "bg-gray-600"}`}
                  aria-label="Toggle Late Deduction"
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${enableAttendanceDeduction ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>

              {enableAttendanceDeduction && (
                <div className="flex items-center gap-1 border-l border-white/20 pl-2 ml-1">
                  <span className="text-[10px] font-bold text-gray-400">模式:</span>
                  <select
                    value={latePenaltyMode}
                    onChange={(e) => handleSetLatePenaltyMode(e.target.value as any)}
                    className="bg-zinc-800 text-white text-[10px] font-black rounded px-1.5 py-0.5 outline-none border border-zinc-700 focus:border-[#FFD200] cursor-pointer text-[16px] md:text-sm" >
                    <option value="FULL">实扣 100% (Deduct 100%)</option>
                    <option value="HALF">减半 50% (Deduct 50%)</option>
                    <option value="WARN_ONLY">仅警告 0% (Deduct 0% / Warn)</option>
                  </select>
                </div>
              )}
            </div>
          </div></div>
        )}
      </div>

      {/* Main List */}
      <div
        className="p-4 md:p-6"
        style={{
          paddingBottom:
            "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        {currentMode === "PARTTIME" ? (
          <PartTimePanel
            employees={employees}
            currentEmployee={currentEmployee}
            selectedMonth={selectedMonth}
            expenses={partTimeExpenses}
            setExpenses={setPartTimeExpenses}
          />
        ) : currentMode === "HISTORY" ? (
          <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="font-black text-base text-[#111111]">支薪历史</h3>
              <div className="flex items-center gap-1.5">
                <details className="relative">
                  <summary className="list-none cursor-pointer select-none text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl px-3 min-h-[40px] flex items-center">说明</summary>
                  <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-[11px] leading-relaxed text-gray-600">
                    公司总成本 = 实发 + 预支 + 政府缴纳（已含微调 / 罚扣）。点任何一个月份看每位员工的明细。
                  </div>
                </details>
                <button
                  onClick={loadAllHistory}
                  aria-label="刷新"
                  className="bg-white border border-gray-200 text-gray-600 w-10 h-10 rounded-xl active:scale-95 flex items-center justify-center"
                  disabled={isHistLoading}
                >
                  <RefreshCw size={15} className={isHistLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {isHistLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 size={32} className="animate-spin text-gray-400" />
              </div>
            ) : allHistoryRecords.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-400">
                <History size={48} className="mx-auto mb-3 opacity-25" />
                <p className="text-xs font-black text-gray-500">
                  暂无支薪历史存档数据
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  在“核算”面板完成一键入账后，系统将自动归档日志到此处
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {allHistoryRecords.map((record) => {
                  const isExpanded = detailedHistId === record.id;
                  const totalAdvance = record.details?.reduce((acc: number, d: any) => acc + (d.advanceLoan || 0), 0) || 0;
                  return (
                    <div
                      key={record.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md"
                    >
                      <div
                        onClick={() =>
                          setDetailedHistId(isExpanded ? null : record.id)
                        }
                        className="p-4 bg-gray-50/50 flex justify-between items-center cursor-pointer border-b border-gray-100 hover:bg-gray-100/30 transition-all select-none"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-black text-base text-[#111111]">{record.month}</span>
                              <span className="text-[11px] font-bold text-gray-400">{record.staffCount} 人</span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${record.isStatutoryPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                {record.isStatutoryPaid ? "已全部发放" : "部分未发"}
                              </span>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-bold text-gray-400">公司总成本</span>
                            <span className="font-mono font-black text-lg text-[#111111]">RM {Number(record.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            {([
                              ["实发", Number(record.totalNetPay || 0), "text-emerald-700"],
                              ["预支", totalAdvance, "text-amber-700"],
                              ["政府缴纳", Number(record.totalGovtPay || 0), "text-purple-700"],
                            ] as const).map(([label, value, cls]) => (
                              <div key={label} className="bg-white rounded-xl border border-gray-100 px-2 py-1.5">
                                <div className="text-[10px] font-bold text-gray-400">{label}</div>
                                <div className={`text-xs font-mono font-black ${cls} whitespace-nowrap`}>{value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 bg-white border-t border-gray-100 space-y-3 animate-in slide-in-from-top-2 duration-150">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                            员工实发薪水细则 (Employee Payout Details)：
                          </div>
                          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-gray-50/20 max-h-80 overflow-y-auto">
                            {record.details?.map((detail: any, dIdx) => (
                              <div
                                key={dIdx}
                                className="p-3 flex justify-between items-center bg-white hover:bg-gray-50/50 transition-colors"
                              >
                                <div className="min-w-0">
                                  <h4 className="font-black text-xs md:text-sm text-blue-950 leading-tight">
                                    {detail.employeeName}
                                  </h4>
                                  <div className="text-[10px] text-gray-500 mt-1 font-mono">
                                    Basic: {detail.basicSalary?.toFixed(2)} |
                                    Net: {detail.netPay?.toFixed(2)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <div className="text-xs md:text-sm font-black font-mono text-[#111111]">
                                      RM {detail.netPay?.toFixed(2)}
                                    </div>
                                    <span
                                      className={`text-[8px] border px-1.5 py-0.2 rounded font-mono font-bold uppercase inline-block scale-90 ${detail.paymentMethod === "CASH" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                                    >
                                      {detail.paymentMethod === "CASH"
                                        ? "CASH 现金"
                                        : "BANK 转账"}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setEditingEmpId(detail.employeeId);
                                      setSelectedMonth(record.month);
                                      setEditingAttendance([]);
                                      // Trigger printing slips
                                      setTimeout(() => {
                                        handlePrintSingleSlip();
                                      }, 250);
                                    }}
                                    className="bg-gray-100 hover:bg-[#111111] hover:text-[#FFD200] p-2.5 rounded-xl text-gray-600 transition-all active:scale-90 min-h-[38px] select-none min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
                                    title="打印 A4 Payslip 薪资单"
                                  >
                                    <Printer size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {record.partTimeDetails?.map((detail: any, ptIdx) => (
                              <div
                                key={`pt-${ptIdx}`}
                                className="p-3 flex justify-between items-center bg-orange-50/30 hover:bg-orange-50/60 transition-colors"
                              >
                                <div className="min-w-0">
                                  <h4 className="font-black text-xs md:text-sm text-orange-900 leading-tight">
                                    {detail.company || detail.note || "Part Time Employee"}
                                  </h4>
                                  <div className="text-[10px] text-orange-500 mt-1 font-mono">
                                    Type: Part Time / Ad-Hoc
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <div className="text-xs md:text-sm font-black font-mono text-[#111111]">
                                      RM {detail.amount?.toFixed(2)}
                                    </div>
                                    <span className="text-[8px] border px-1.5 py-0.2 rounded font-mono font-bold uppercase inline-block scale-90 bg-orange-50 text-orange-700 border-orange-200">
                                      CASH / AP
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 🎯 快速勾选 —— 手机横向滑动，一次选好一批再发 */}
            <div className="max-w-5xl mx-auto mb-3 flex items-center gap-2 flex-wrap">
              {/* 快速勾选收进一个「选择」菜单（全选 / 未发 / 未发·银行 / 未发·现金） */}
              <details className="relative shrink-0" onClick={e => { if ((e.target as HTMLElement).closest('button')) (e.currentTarget as HTMLDetailsElement).open = false; }}>
                <summary className="list-none cursor-pointer select-none bg-white px-3 rounded-xl text-xs font-bold text-gray-700 border border-gray-200 flex items-center gap-1.5 min-h-[44px]">
                  {selectedEmpIds.size === displayEmployees.length && displayEmployees.length > 0 ? <CheckSquare size={16} className="text-[#111111]" /> : <Square size={16} />}
                  选择 <ChevronDown size={14} />
                </summary>
                <div className="absolute left-0 top-full mt-1 z-30 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 flex flex-col">
                  <button onClick={handleSelectAll} className="text-left px-3 min-h-[44px] rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <CheckSquare size={15} /> {selectedEmpIds.size === displayEmployees.length && displayEmployees.length > 0 ? '取消全选' : '全选'}
                  </button>
                  {!isPosted && (
                    <>
                      <button onClick={() => selectUnpaidBy()} className="text-left px-3 min-h-[44px] rounded-xl text-sm font-bold text-orange-700 hover:bg-orange-50 flex items-center gap-2">⏳ 未发</button>
                      <button onClick={() => selectUnpaidBy("BANK")} className="text-left px-3 min-h-[44px] rounded-xl text-sm font-bold text-blue-700 hover:bg-blue-50 flex items-center gap-2"><Building2 size={15} /> 未发 · 银行</button>
                      <button onClick={() => selectUnpaidBy("CASH")} className="text-left px-3 min-h-[44px] rounded-xl text-sm font-bold text-green-700 hover:bg-green-50 flex items-center gap-2"><Banknote size={15} /> 未发 · 现金</button>
                    </>
                  )}
                </div>
              </details>
              {selectedEmpIds.size > 0 && (
                <button
                  onClick={() => setSelectedEmpIds(new Set())}
                  className="bg-[#111111] text-white px-3 rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 min-h-[44px] shrink-0"
                >
                  已选 {selectedEmpIds.size} <X size={14} />
                </button>
              )}

              {/* 🟢 新增：批量撤销按钮 (仅在选中了至少1个已付款人员时显示) */}
              {selectedEmpIds.size > 0 &&
                Array.from(selectedEmpIds).some(
                  (id) => payrollData[id]?.isPaid,
                ) &&
                !isPosted && (
                  <button
                    onClick={handleBatchRevokePayment}
                    disabled={isLoading}
                    className="ml-auto shrink-0 bg-red-50 text-red-600 px-3 rounded-xl text-xs font-bold border border-red-200 hover:bg-red-100 flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50 min-h-[44px]"
                  >
                    {isLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RotateCcw size={14} />
                    )}
                    批量撤销 (Undo)
                  </button>
                )}
            </div>

            <div className="max-w-5xl mx-auto space-y-8">
              {/* Management Group */}
              {managementEmployees.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                  <h3 className="font-black text-sm text-gray-500 uppercase tracking-widest mb-4 ml-2 flex items-center gap-2">
                    <span className="text-xl">💼</span> 管理层 (Management)
                  </h3>
                  <div className="space-y-4">
                    {managementEmployees.map((emp) => renderEmployeeCard(emp))}
                  </div>
                </div>
              )}

              {/* Locals Group */}
              {localEmployees.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                  <h3 className="font-black text-sm text-gray-500 uppercase tracking-widest mb-4 ml-2 flex items-center gap-2">
                    <span className="text-xl">🇲🇾</span> 本地员工 (Locals)
                  </h3>
                  <div className="space-y-4">
                    {localEmployees.map((emp) => renderEmployeeCard(emp))}
                  </div>
                </div>
              )}

              {/* Foreigners Group */}
              {foreignEmployees.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="font-black text-sm text-gray-500 uppercase tracking-widest mb-4 ml-2 flex items-center gap-2">
                    <span className="text-xl">🌍</span> 外籍员工 (Foreigners)
                  </h3>
                  <div className="space-y-4">
                    {foreignEmployees.map((emp) => renderEmployeeCard(emp))}
                  </div>
                </div>
              )}

              {/* 🔍 不在月薪名单的员工 —— 不再静悄悄消失；时薪兼职另显示当月兼职登记（只供显示，不影响薪资） */}
              {excludedEmployees.length > 0 && (
                <details className="bg-white rounded-2xl border border-dashed border-gray-300 p-4 shadow-sm">
                  <summary className="cursor-pointer select-none flex items-center justify-between gap-2 min-h-[44px] list-none">
                    <span className="font-black text-sm text-gray-600 flex items-center gap-2">
                      🔍 不在月薪名单的员工（不代表未付款）
                      <span className="text-[11px] font-black bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{excludedEmployees.length} 人</span>
                    </span>
                    <span className="text-[11px] font-bold text-gray-400">点开看原因 ▾</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {excludedEmployees.map(({ emp, reason, text }) => (
                      <div key={emp.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2.5 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-black text-sm text-[#111111]">
                            {emp.name} <span className="text-[10px] font-mono text-gray-400">#{emp.id}</span>
                          </div>
                          <div className="text-[11px] font-bold text-gray-500 mt-0.5">{text}</div>
                          {reason === "HOURLY" && (() => {
                            const pt = partTimeSummaryFor(emp, partTimeExpenses);
                            return (
                              <div className={`text-[11px] font-black mt-1 ${pt.count === 0 ? "text-amber-700" : pt.unpaidCount > 0 ? "text-red-700" : "text-emerald-700"}`}>
                                {partTimeSummaryText(pt)}
                              </div>
                            );
                          })()}
                        </div>
                        {reason === "HOURLY" ? (
                          <button
                            onClick={() => setCurrentMode("PARTTIME")}
                            className="shrink-0 px-3 min-h-[40px] rounded-xl bg-white border border-gray-200 text-xs font-black text-gray-700 active:scale-95"
                          >
                            去兼职分页
                          </button>
                        ) : onNavigateToProfile ? (
                          <button
                            onClick={() => onNavigateToProfile(emp.id)}
                            className="shrink-0 px-3 min-h-[40px] rounded-xl bg-white border border-gray-200 text-xs font-black text-gray-700 active:scale-95"
                          >
                            打开档案修改
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <p className="text-[10px] font-bold text-gray-400 leading-relaxed pt-1">
                      要算薪的话：员工档案 → 薪资法定 → 打开「参与月度薪资结算」，或把计薪方式改回月薪；改好后回来重新整理这个月份。
                    </p>
                  </div>
                </details>
              )}

              {/* ⏱️ 兼职：改到「兼职」分页按天登记，这里只放一张摘要卡 */}
              {partTimeExpenses.length > 0 && (
                <button
                  onClick={() => setCurrentMode("PARTTIME")}
                  className="w-full bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between gap-3 shadow-sm active:scale-[0.99] text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">⏱️</span>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[#111111]">兼职 / 临时工资</div>
                      <div className="text-[11px] font-bold text-gray-400">
                        本月 {partTimeExpenses.length} 笔 · 已付现金，有算进总薪资
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-mono font-black text-[#111111]">
                      {partTimeExpenses
                        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
                        .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] font-black text-blue-600">查看 ›</div>
                  </div>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer Save Button - iOS Safe Area */}
      {currentMode === "CALC" && (
        <div
          className="bg-white border-t border-gray-200 z-20"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          {/* 📊 部门明细展开区 (Department Breakdown) */}
          {showDeptBreakdown && (
            <div className="border-b border-gray-200 bg-gray-50 px-3 md:px-4 py-2 md:py-3 animate-in slide-in-from-bottom-2 max-h-[40vh] overflow-y-auto">
              <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-50 z-10 pb-1">
                  <h4 className="text-[10px] md:text-xs font-black text-gray-600 uppercase tracking-widest">
                    部门薪资明细
                  </h4>
                  <button
                    onClick={() => setShowDeptBreakdown(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  {Object.entries(deptBreakdown)
                    .sort(([a], [b]) => {
                      const ia = DEPT_ORDER.findIndex((k) => DEPT_LABEL[k] === a);
                      const ib = DEPT_ORDER.findIndex((k) => DEPT_LABEL[k] === b);
                      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                    })
                    .map(([dept, data]) => (
                      <div
                        key={dept}
                        onClick={() => setOpenDept(openDept === dept ? null : dept)}
                        title="点一下看这个部门每个人拿多少"
                        className={`bg-white rounded-xl p-3 border shadow-sm cursor-pointer transition-all active:scale-[0.99] ${
                          openDept === dept
                            ? 'border-[#FFD200] ring-2 ring-[#FFD200]/40'
                            : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-xs font-black text-[#111111]">
                              {dept}
                            </div>
                            <div className="text-[9px] text-gray-400 font-bold">
                              {data.count} 人
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] text-gray-400 uppercase font-bold">
                              Net Pay
                            </div>
                            <div className="text-sm font-mono font-black text-[#111111]">
                              RM{" "}
                              {data.net.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between text-[10px] pt-2 border-t border-gray-100">
                          <span className="text-emerald-600 font-bold" title="含已经发出去的预支">
                            已发(含预支): RM{" "}
                            {data.paid.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-orange-600 font-bold">
                            待发: RM{" "}
                            {data.unpaid.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] mt-1">
                          <span className="text-blue-500 font-bold">
                            政府: RM{" "}
                            {data.govt.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-purple-500 font-bold" title="从薪水扣下来、但不是缴给政府的：预支 / 宿舍费 / 罚款 / 其他扣除 / 借款扣回">
                            扣款: RM{" "}
                            {data.deduct.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] mt-1 pt-1 border-t border-dashed border-gray-200">
                          <span className="text-gray-400 font-bold">总成本</span>
                          <span className="text-gray-600 font-black font-mono">
                            RM{" "}
                            {data.cost.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <p className="text-[8px] text-gray-400 font-bold mt-1 leading-tight">
                          净发 + 政府 + 扣款 = 总成本
                        </p>
                        <p className="text-[9px] font-black text-indigo-500 mt-1.5 leading-tight">
                          {openDept === dept ? '▲ 收起人员明细' : `▼ 看这 ${data.count} 个人拿多少`}
                        </p>
                      </div>
                    ))}

                  {/* 👷 兼职 / 无部门 —— 有算进 TOTAL SALARY，但不属于任何部门 */}
                  {nonDeptPayroll.total > 0 && (
                    <div className="bg-white rounded-xl p-3 border-2 border-dashed border-indigo-300 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-indigo-900">
                            👷 兼职 / 无部门
                          </div>
                          <div className="text-[9px] text-gray-400 font-bold">
                            {nonDeptPayroll.items.length} 笔
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[9px] text-gray-400 uppercase font-bold">
                            Net Pay
                          </div>
                          <div className="text-sm font-mono font-black text-indigo-900">
                            RM{" "}
                            {nonDeptPayroll.total.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowNonDeptDetail((v) => !v)}
                        className="w-full text-[10px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-1.5 border border-indigo-100 active:scale-95 min-h-[44px] md:min-h-0"
                      >
                        {showNonDeptDetail ? "收起明细" : "看是哪几笔 →"}
                      </button>
                      <p className="text-[9px] text-gray-400 font-bold mt-1.5 leading-relaxed">
                        这些走的是「独立支出」不是薪资单，没有员工档案也没有部门。
                        金额已算进下面的 TOTAL SALARY。
                      </p>
                    </div>
                  )}
                </div>

                {/* 🔄 存档数字对不上时，用现在的资料重算 */}
                <div className="mt-2 md:mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-slate-700">
                      🔄 传统账目的人事成本对不上？
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 mt-0.5 leading-relaxed">
                      旧版本存档时会把兼职和离职旧草稿一起写进去，让传统账目重复计算。
                      按这里用现在的资料重算 —— <b>只改存档金额，不动结账状态，也不碰任何支出流水。</b>
                    </div>
                  </div>
                  <button
                    onClick={handleRefreshRecord}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-white text-[11px] font-black active:scale-95 disabled:opacity-40 shrink-0 min-h-[44px] md:min-h-0"
                  >
                    重算本月存档
                  </button>
                </div>

                {/* 👑 某个部门的人员明细 —— 点部门卡片展开 */}
                {openDept && deptBreakdown[openDept] && (
                  <div className="mt-2 md:mt-3 bg-white border-2 border-[#FFD200] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <div className="text-[11px] font-black text-[#111111]">
                        {openDept} —— 共 {deptBreakdown[openDept].count} 人，净发合计 RM{" "}
                        {deptBreakdown[openDept].net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <button
                        onClick={() => setOpenDept(null)}
                        className="text-[10px] font-black text-gray-400 hover:text-gray-700 min-h-[44px] md:min-h-0 px-2"
                      >
                        收起
                      </button>
                    </div>

                    {/* 表头（手机不显示，卡片式排版自己有标签） */}
                    <div className="hidden md:grid grid-cols-[minmax(0,1fr)_repeat(4,88px)] gap-2 px-2.5 pb-1 border-b border-gray-200">
                      <span className="text-[9px] font-black text-gray-400 uppercase">员工</span>
                      <span className="text-[9px] font-black text-gray-400 uppercase text-right">净发</span>
                      <span className="text-[9px] font-black text-gray-400 uppercase text-right">政府</span>
                      <span className="text-[9px] font-black text-gray-400 uppercase text-right">扣款</span>
                      <span className="text-[9px] font-black text-gray-400 uppercase text-right">总成本</span>
                    </div>

                    <div className="space-y-1 mt-1 max-h-[260px] overflow-y-auto">
                      {deptBreakdown[openDept].members.map((m) => (
                        <div
                          key={m.id}
                          className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_repeat(4,88px)] gap-x-2 gap-y-1 bg-gray-50 rounded-lg px-2.5 py-2 items-center"
                        >
                          <div className="col-span-2 md:col-span-1 min-w-0 flex items-center gap-1.5">
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-white text-gray-500 border border-gray-200">{m.id}</span>
                            <span className="text-[11px] font-black text-gray-900 truncate">{m.name}</span>
                            {m.role && <span className="text-[9px] font-bold text-gray-400 truncate hidden md:inline">{m.role}</span>}
                            {!m.isPaid && <span className="text-[9px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1 rounded shrink-0">待发</span>}
                          </div>
                          <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">净发</span><span className="text-[11px] font-mono font-black text-gray-900">{m.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">政府</span><span className="text-[11px] font-mono font-bold text-blue-600">{m.govt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">扣款</span><span className="text-[11px] font-mono font-bold text-purple-600">{m.deduct.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">总成本</span><span className="text-[11px] font-mono font-black text-gray-600">{m.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>
                      ))}
                    </div>

                    {/* 合计列，跟上面卡片对得上 */}
                    <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_repeat(4,88px)] gap-x-2 gap-y-1 px-2.5 py-2 mt-1 border-t-2 border-gray-300 items-center">
                      <span className="col-span-2 md:col-span-1 text-[10px] font-black text-gray-500 uppercase">合计</span>
                      <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">净发</span><span className="text-[11px] font-mono font-black text-gray-900">{deptBreakdown[openDept].net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">政府</span><span className="text-[11px] font-mono font-black text-blue-600">{deptBreakdown[openDept].govt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">扣款</span><span className="text-[11px] font-mono font-black text-purple-600">{deptBreakdown[openDept].deduct.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      <div className="text-right"><span className="md:hidden text-[9px] font-bold text-gray-400 mr-1">总成本</span><span className="text-[11px] font-mono font-black text-gray-700">{deptBreakdown[openDept].cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    </div>
                    <p className="text-[9px] font-bold text-gray-400 mt-1.5">
                      净发 + 政府 + 扣款 = 总成本。扣款是预支 / 宿舍费 / 罚款 / 借款扣回这些从薪水扣下来、但没缴给政府的钱。
                    </p>
                  </div>
                )}

                {/* 兼职 / 无部门 —— 逐笔明细 */}
                {showNonDeptDetail && nonDeptPayroll.items.length > 0 && (
                  <div className="mt-2 md:mt-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <div className="text-[11px] font-black text-indigo-900">
                        👷 兼职 / 无部门 —— 共 {nonDeptPayroll.items.length} 笔，合计 RM{" "}
                        {nonDeptPayroll.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <button
                        onClick={() => setShowNonDeptDetail(false)}
                        className="text-[10px] font-black text-indigo-500 hover:text-indigo-700 min-h-[44px] md:min-h-0 px-2"
                      >
                        收起
                      </button>
                    </div>
                    <p className="text-[10px] font-bold text-indigo-700 mb-2 leading-relaxed bg-white/70 rounded-lg p-2">
                      ⚠️ 这里抓的是「资金管理里 category = 薪资、而且 id 不是 salary_ / payroll_ 开头」的支出。
                      如果看到<b>不该算成兼职</b>的东西（员工餐、津贴、奖金、重复入账…），
                      代表那笔支出的科目选错了 —— 去资金管理改掉科目，这个数字就会对。
                    </p>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {nonDeptPayroll.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex justify-between items-center gap-2 bg-white/70 rounded-lg px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <span className="text-[11px] font-black text-gray-800">{it.name}</span>
                            <span className="text-[9px] font-mono text-gray-400 ml-1.5">{it.date}</span>
                            {it.method && (
                              <span className="text-[9px] font-bold text-gray-400 ml-1.5">{it.method}</span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono font-black text-indigo-800 shrink-0">
                            RM {it.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 👻 离职后残留的旧草稿 —— 就是「待发对不上、又找不到人」的那几笔 */}
                {payrollEntriesForMonth.ghosts.length > 0 && (
                  <div className="mt-2 md:mt-3 bg-amber-50 border-2 border-amber-300 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                          👻 已排除 {payrollEntriesForMonth.ghosts.length} 笔离职员工的旧草稿
                          <span className="font-mono">
                            (RM {payrollEntriesForMonth.ghostTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-amber-700 mt-0.5 leading-relaxed">
                          这些人离职月已经过了，本月不该算薪，所以<b>没有</b>计入上面的待发。
                          草稿资料还留着，没有被删除。
                        </div>
                      </div>
                      <button
                        onClick={handleClearGhostDrafts}
                        disabled={isLoading || isPosted}
                        className="px-3 py-2 rounded-lg bg-white border border-amber-300 text-[10px] font-black text-amber-800 active:scale-95 disabled:opacity-40 shrink-0 min-h-[44px] md:min-h-0"
                      >
                        清除这些草稿
                      </button>
                    </div>
                    <div className="space-y-1">
                      {payrollEntriesForMonth.ghosts.map((g) => (
                        <div
                          key={g.id}
                          className="flex justify-between items-center gap-2 bg-white/70 rounded-lg px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <span className="text-[11px] font-black text-gray-800">{g.name}</span>
                            <span className="text-[9px] font-mono text-gray-400 ml-1.5">{g.id}</span>
                            <span className="text-[9px] font-bold text-gray-500 ml-1.5">{g.dept}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[11px] font-mono font-black text-amber-800">
                              RM {g.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] font-bold text-gray-400">
                              {g.terminationDate ? `${g.terminationDate} 离职` : "未填离职日期"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-3 md:px-4 pt-2 pb-1">
            <div className="max-w-5xl mx-auto flex flex-col gap-2">
              {/* 🔔 该发的都发完了，但月份还停在 DRAFT —— 提醒老板补一个结账动作 */}
              {needsPostCatchUp && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-emerald-900">
                      ✅ 本月该发的薪资都已经发完了，但月份状态还是「草稿」
                    </div>
                    <div className="text-[10px] font-bold text-emerald-700 mt-0.5 leading-relaxed">
                      结账之后才会出现「缴政府费用 (KWSP / SOCSO / EIS)」的按钮。
                      按右边补一个结账动作就可以了。
                    </div>
                  </div>
                  <button
                    onClick={handleMarkPosted}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-black active:scale-95 disabled:opacity-40 shrink-0 min-h-[44px] md:min-h-0"
                  >
                    标记为已结账
                  </button>
                </div>
              )}

              {/* 💰 薪资总览 — 移动端用紧凑2x2网格 */}
              <div
                onClick={() => setShowDeptBreakdown(!showDeptBreakdown)}
                className="flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition-transform select-none"
              >
                {/* 移动端: 2x2 网格，间距均匀 */}
                <div className="md:hidden grid grid-cols-2 gap-x-4 gap-y-1 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] text-gray-400 font-bold">
                      总薪资
                    </span>
                    <span className="text-xs font-mono text-[#111111] font-black">
                      RM{" "}
                      {(
                        grandTotals.net + grandTotals.allAdvances
                      ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] text-emerald-600 font-bold">
                      已发
                    </span>
                    <span className="text-xs font-mono text-emerald-700 font-black">
                      RM{" "}
                      {grandTotals.paid.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] text-orange-600 font-bold">
                      待发
                    </span>
                    <span className="text-xs font-mono text-orange-700 font-black">
                      RM{" "}
                      {grandTotals.unpaid.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] text-blue-500 font-bold">
                      Govt
                    </span>
                    <span className="text-xs font-mono text-blue-600 font-black">
                      RM{" "}
                      {grandTotals.govt.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                {/* 桌面端: 保持原有横排 */}
                <div className="hidden md:flex items-center gap-6 overflow-x-auto flex-nowrap min-w-0 flex-1">
                  <div className="shrink-0">
                    <span className="block text-[9px] text-gray-400 uppercase font-bold leading-none mb-0.5" title="总薪资 = 净发 + 已预支 + 兼职 = 已发 + 待发（不含雇主公积金，那在 To Govt）">
                      Total Salary (总薪资) · 净发+预支+兼职
                    </span>
                    <span className="text-xl font-mono text-[#111111] font-black leading-tight">
                      RM{" "}
                      {(grandTotals.paid + grandTotals.unpaid).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2 },
                      )}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-gray-200 shrink-0"></div>
                  <div className="shrink-0">
                    <span className="block text-[9px] text-emerald-600 uppercase font-bold leading-none mb-0.5">
                      已发 (Paid)
                    </span>
                    <span className="text-lg font-mono text-emerald-700 font-black leading-tight">
                      RM{" "}
                      {grandTotals.paid.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-gray-200 shrink-0"></div>
                  <div className="shrink-0">
                    <span className="block text-[9px] text-orange-600 uppercase font-bold leading-none mb-0.5">
                      待发 (Remaining)
                    </span>
                    <span className="text-lg font-mono text-orange-700 font-black leading-tight">
                      RM{" "}
                      {grandTotals.unpaid.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-gray-200 shrink-0"></div>
                  <div className="shrink-0">
                    <span className="block text-[9px] text-blue-500 uppercase font-bold leading-none mb-0.5">
                      To Govt
                    </span>
                    <span className="text-lg font-mono text-blue-600 font-black leading-tight">
                      RM{" "}
                      {grandTotals.govt.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                <div
                  className={`shrink-0 p-1 rounded-lg transition-all ${showDeptBreakdown ? "bg-gray-200 rotate-180" : "bg-gray-100"}`}
                >
                  <ChevronLeft size={12} className="rotate-90 text-gray-500" />
                </div>
              </div>

              {/* 💳 操作按钮区 — 移动端排版优化 */}
              <div className="flex flex-col md:flex-row gap-3 md:gap-2 md:items-center w-full">
                <div className="flex flex-col items-start w-full md:w-auto">
                  <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-2 rounded-lg border border-gray-200 w-full md:w-auto">
                    <CalendarDays size={14} className="text-gray-400 shrink-0" />
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="bg-transparent font-black text-[#111111] outline-none w-full md:w-36 p-0 text-center md:text-left text-[16px] md:text-sm"
                      style={{ minHeight: "36px" }}
                    />
                  </div>
                  <span className="text-[8px] text-gray-500 mt-0.5 ml-0.5 block scale-90 origin-left max-w-full leading-tight font-medium">
                    💡 付款日默认为当月最后一天
                  </span>
                </div>

                <div className="flex gap-1.5 w-full md:flex-1">
                  {isPosted ? (
                    <>
                      <button
                        onClick={handleRevertStatus}
                        disabled={isLoading}
                        className="flex-1 bg-red-50 text-red-600 border border-red-100 px-2 py-2.5 md:py-3 rounded-xl font-bold shadow-sm active:scale-95 transition-all text-[11px] flex items-center justify-center gap-1"
                      >
                        <LockOpen size={13} />{" "}
                        <span className="hidden md:inline">撤销</span>结账
                      </button>
                      {!isStatutoryPaid ? (
                        <button
                          onClick={handlePayStatutory}
                          disabled={isLoading}
                          className="flex-1 bg-blue-600 text-white border border-blue-600 px-2 py-2.5 md:py-3 rounded-xl font-bold shadow-md active:scale-95 transition-all text-[11px] flex items-center justify-center gap-1"
                        >
                          <Building2 size={13} /> 缴
                          <span className="hidden md:inline">政府</span>费用
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex-1 bg-gray-100 text-gray-400 border border-gray-200 px-2 py-2.5 md:py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 cursor-not-allowed"
                        >
                          <CheckCircle2 size={13} /> 完毕
                        </button>
                      )}
                    </>
                  ) : !showBatchPayConfirm ? (
                    <button
                      onClick={() => {
                        if (selectedBreakdown.bankCount + selectedBreakdown.cashCount === 0) {
                          selectUnpaidBy();
                        }
                        setShowBatchPayConfirm(true);
                      }}
                      disabled={isLoading}
                      className="flex-1 bg-[#111111] text-[#FFD200] px-3 py-3 rounded-xl font-black shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all text-sm disabled:opacity-50 min-h-[48px]"
                    >
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}{" "}
                      {selectedBreakdown.bankCount + selectedBreakdown.cashCount > 0
                        ? `发放已勾选 ${selectedBreakdown.bankCount + selectedBreakdown.cashCount} 人`
                        : "一键发放（全部未发）"}
                    </button>
                  ) : (
                    <div className="flex-1 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
                      {/* 👑 不再问「银行还是现金」—— 每个人按自己设定的方式入账，这里只给老板看分组 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                          <div className="text-[10px] font-black text-blue-700 flex items-center gap-1">
                            <Building2 size={12} /> 银行转账 · {selectedBreakdown.bankCount} 人
                          </div>
                          <div className="text-sm font-mono font-black text-blue-900">
                            RM {selectedBreakdown.bankAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                          <div className="text-[10px] font-black text-green-700 flex items-center gap-1">
                            <Banknote size={12} /> 现金 · {selectedBreakdown.cashCount} 人
                          </div>
                          <div className="text-sm font-mono font-black text-green-900">
                            RM {selectedBreakdown.cashAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSavePayroll()}
                          disabled={isLoading || selectedBreakdown.bankCount + selectedBreakdown.cashCount === 0}
                          className="flex-1 bg-[#111111] text-[#FFD200] py-3 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 min-h-[48px]"
                        >
                          {isLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                          确认发放 RM{" "}
                          {(selectedBreakdown.bankAmt + selectedBreakdown.cashAmt).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </button>
                        <button
                          onClick={() => setShowBatchPayConfirm(false)}
                          className="px-3 bg-white text-gray-500 rounded-xl border border-gray-200 active:scale-95 min-h-[48px] min-w-[48px] flex justify-center items-center"
                          aria-label="取消"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === ADVANCE MODAL === */}
      {isAdvanceModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-[#111111]">
                发放预支薪水 (Advance)
              </h3>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Staff (员工)
                </label>
                <select
                  value={advForm.empId}
                  onChange={(e) =>
                    setAdvForm({ ...advForm, empId: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-bold outline-none text-[16px] md:text-sm"
                  style={{ minHeight: "48px" }}
                >
                  <option value="">Select Staff...</option>
                  {displayEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} {e.isArchived ? "(离职)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Method (资金来源)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      setAdvForm({ ...advForm, method: "BANK_TRANSFER" })
                    }
                    className={`py-3.5 rounded-xl font-bold text-sm border active:scale-95 transition-transform ${advForm.method === "BANK_TRANSFER" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}
                  >
                    银行转账
                  </button>
                  <button
                    onClick={() => setAdvForm({ ...advForm, method: "CASH" })}
                    className={`py-3.5 rounded-xl font-bold text-sm border active:scale-95 transition-transform ${advForm.method === "CASH" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200"}`}
                  >
                    现金
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Amount (金额)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={advForm.amount}
                  onChange={(e) =>
                    setAdvForm({ ...advForm, amount: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-black outline-none"
                  style={{ fontSize: "18px", minHeight: "48px" }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Date (日期)
                </label>
                <input
                  type="date"
                  value={advForm.date}
                  onChange={(e) =>
                    setAdvForm({ ...advForm, date: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-bold outline-none text-[16px] md:text-sm"
                  style={{ minHeight: "48px" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Note (备注)
                </label>
                <input
                  type="text"
                  value={advForm.note}
                  onChange={(e) =>
                    setAdvForm({ ...advForm, note: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-bold outline-none text-[16px] md:text-sm"
                  style={{ minHeight: "48px" }}
                  placeholder="Reason..."
                />
              </div>
              <button
                onClick={handleSaveAdvance}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg hover:bg-blue-700 active:scale-95 transition-transform text-base"
              >
                确认发放 (Issue)
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* === CALCULATOR MODAL === */}
      {editingEmpId && editingEntry && editingEmp && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[310] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#F6F7FB] w-full h-[100dvh] md:max-w-3xl md:h-[95vh] md:rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 border border-gray-200 relative">
            {/* iOS-style drag handle (仅手机显示) */}
            <div
              className="md:hidden flex justify-center pt-3 pb-1.5 bg-white shrink-0"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="bg-white p-4 md:p-5 pt-2 md:pt-5 flex justify-between items-center shrink-0 border-b border-gray-200">
              <div>
                <h3 className="font-bold text-lg text-[#111111] flex items-center gap-2">
                  <Calculator
                    size={20}
                    className="text-[#FFD200] fill-current stroke-black"
                  />{" "}
                  薪资计算器
                </h3>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-xs text-gray-500 font-mono">
                    {editingEmp.name}
                  </p>
                  {editingEmp.isArchived && (
                    <span className="bg-red-100 text-red-600 text-[9px] px-1.5 rounded font-bold">
                      离职
                    </span>
                  )}

                  {onNavigateToProfile && (
                    <button
                      onClick={() => {
                        setEditingEmpId(null);
                        onNavigateToProfile(editingEmp.id);
                      }}
                      className="inline-flex items-center gap-1 bg-[#8B0000]/10 hover:bg-[#8B0000]/25 text-[#8B0000] text-[10px] font-black px-2 py-0.5 rounded-full transition-all active:scale-95 ml-1 border border-[#8B0000]/15 min-h-[44px] md:min-h-0"
                      title="直接跳转查看该员工的详细档案资料"
                    >
                      👤 详细档案 Employee File ➔
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingEmpId(null);
                  setShowAdvanceHistory(false);
                }}
                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors active:scale-95 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
              >
                <X size={20} />
              </button>
            </div>

            {/* 👑 Mobile High-contrast Segmented Control for Calculator Tabs */}
            <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex justify-center">
              <div className="flex bg-gray-100 rounded-xl p-1 w-full max-w-md border border-gray-200/50 shadow-inner">
                <button
                  type="button"
                  onClick={() => setMobileModalTab('EARNINGS')}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 min-h-[44px] select-none active:scale-[0.98] ${mobileModalTab === 'EARNINGS' ? 'bg-[#111111] text-[#FFD200] shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  💵 收入 (Earn)
                </button>
                <button
                  type="button"
                  onClick={() => setMobileModalTab('DEDUCTIONS')}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 min-h-[44px] select-none active:scale-[0.98] ${mobileModalTab === 'DEDUCTIONS' ? 'bg-[#111111] text-[#FFD200] shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  🛑 扣除 (Deduct)
                </button>
                <button
                  type="button"
                  onClick={() => setMobileModalTab('STATUTORY')}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 min-h-[44px] select-none active:scale-[0.98] ${mobileModalTab === 'STATUTORY' ? 'bg-[#111111] text-[#FFD200] shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  🏛️ 政府/其它 (Govt)
                </button>
              </div>
            </div>

            {/* Content - SCROLLABLE AREA WITH EXTRA PADDING */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 touch-pan-y overscroll-contain">
              {/* PRO-RATE TOOL —— 只有入职/离职月或已经算过天数才展开，其他人收起来，手机第一眼就看到底薪 */}
              {!isPosted && !showProRateTool && (
                <button
                  type="button"
                  onClick={() => setShowProRateToolFor(editingEmpId)}
                  className={`w-full bg-blue-50 border border-blue-200 rounded-xl px-4 text-left text-xs font-black text-blue-700 flex items-center gap-2 min-h-[44px] active:scale-[0.99] ${mobileModalTab === 'EARNINGS' ? 'flex' : 'hidden'}`}
                >
                  <CalendarDays size={14} /> 按天数计薪（入职 / 离职 / 请假）
                  <ChevronRight size={14} className="ml-auto" />
                </button>
              )}
              {!isPosted && showProRateTool && (
                <div className={`bg-blue-50 p-4 rounded-xl border border-blue-200 animate-in slide-in-from-top-2 ${mobileModalTab === 'EARNINGS' ? 'block' : 'hidden'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays size={14} className="text-blue-600" />
                    <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest">
                      {editingEmp.isArchived
                        ? "离职结算 (Resignation Pro-rate)"
                        : "新入职/天数计算 (Joiner Pro-rate)"}
                    </h4>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-bold text-blue-500 uppercase">
                          Work Days (从 Roster 同步)
                        </label>
                        <button
                          onClick={syncWorkDaysFromRoster}
                          className="text-[9px] font-black text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md flex items-center gap-1 active:scale-95 shadow-sm transition-transform min-h-[44px] md:min-h-0"
                          title="从当月 Roster 重新计算 WORK 天数"
                        >
                          <RefreshCw size={10} /> 同步 Roster
                        </button>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={proRateSettings.days || ""}
                        onChange={(e) =>
                          setProRateSettings({
                            ...proRateSettings,
                            days: parseFloat(e.target.value),
                          })
                        }
                        className="w-full p-3 bg-white border border-blue-200 rounded-lg font-bold outline-none focus:border-blue-400 text-[16px] md:text-sm"
                       
                        placeholder="e.g. 15"
                      />
                    </div>
                    <div className="md:w-52">
                      <label className="text-[9px] font-bold text-blue-500 uppercase mb-1 block">
                        Calculation Basis
                      </label>
                      <select
                        value={proRateSettings.mode}
                        onChange={(e) =>
                          setProRateSettings({
                            ...proRateSettings,
                            mode: e.target.value as any,
                          })
                        }
                        className="w-full p-3 bg-white border border-blue-200 rounded-lg font-bold outline-none text-[16px] md:text-sm"
                       
                      >
                        <option value="26_DAYS">Fixed 26 Days</option>
                        <option value="WORKABLE_DAYS">Month − Off Days</option>
                        <option value="CALENDAR_DAYS">Full Calendar</option>
                      </select>
                    </div>
                    <button
                      onClick={calculateProRate}
                      disabled={!proRateSettings.days}
                      className="px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 active:scale-95 min-h-[48px]"
                    >
                      Calculate
                    </button>
                  </div>

                  {(editingEmp.isArchived ||
                    editingEmp.status === "TERMINATED") && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <button
                        onClick={handleFinalSettlement}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-black shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all"
                      >
                        <Ban size={14} /> ⚡️ 离职一键结清 (Final Settlement)
                      </button>
                      <p className="text-[9px] text-red-500 mt-1 text-center font-bold">
                        Based on Termination Date:{" "}
                        {editingEmp.terminationDate || "Not Set"}
                      </p>
                    </div>
                  )}

                  <p className="text-[9px] text-blue-500 mt-2 italic font-bold">
                    {proRateSettings.startDate
                      ? `Detected: Joined/Start ${proRateSettings.startDate}`
                      : "Days auto-calculated from Roster (WORK status)"}
                  </p>
                </div>
              )}

              {/* 🟢 EARNINGS */}
              <div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden ${mobileModalTab === 'EARNINGS' ? 'block' : 'hidden'}`}>
                <div className="absolute top-0 left-0 w-1.5 h-full bg-green-500"></div>
                <h4 className="text-xs font-black text-green-700 uppercase mb-4 flex items-center gap-2 tracking-widest pl-2">
                  <Plus size={14} /> 收入 (Earnings)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-full md:col-span-2 grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">
                        Monthly Rate (档案底薪)
                      </label>
                      <div className="w-full p-3 bg-gray-100 border border-transparent rounded-xl text-sm font-bold text-gray-400 outline-none text-right">
                        {getHistoricalSalary(editingEmp, selectedMonth).toFixed(
                          2,
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-bold text-green-700 uppercase flex items-center gap-1">
                          Actual Basic (实发底薪)
                          <span className="text-[8px] font-normal text-blue-500 normal-case bg-blue-50 px-1 rounded">
                            关联 Statutory
                          </span>
                        </label>
                        <button
                          onClick={() => syncBasicSalary(editingEmpId)}
                          className="text-blue-500 hover:text-blue-700 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
                          title="Reset to Original"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                      <MoneyInput
                        disabled={isPosted || editingEntry.isPaid}
                        value={editingEntry.basic}
                        onChange={(v) =>
                          updateEntry(editingEmpId, { basic: v })
                        }
                        className="w-full p-3 bg-white border-2 border-green-200 rounded-xl font-black text-[#111111] outline-none focus:border-green-500 text-right shadow-sm"
                        decimals={true}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                      Fixed Allowance (津贴)
                      <span className="text-[8px] font-normal text-gray-400 normal-case bg-gray-100 px-1 rounded">
                        不关联 Statutory
                      </span>
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.allowance}
                      onChange={(v) =>
                        updateEntry(editingEmpId, { allowance: v })
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Subsidy (油费等额外补贴)
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.extraSubsidy}
                      onChange={(v) =>
                        updateEntry(editingEmpId, { extraSubsidy: v })
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                      OT / Commission
                      <span className="text-[8px] font-normal text-gray-400 normal-case bg-gray-100 px-1 rounded">
                        不关联 Statutory
                      </span>
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.ot}
                      onChange={(v) => updateEntry(editingEmpId, { ot: v })}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                      Bonus (奖金)
                      <span className="text-[8px] font-normal text-gray-400 normal-case bg-gray-100 px-1 rounded">
                        不关联 Statutory
                      </span>
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.bonus}
                      onChange={(v) => updateEntry(editingEmpId, { bonus: v })}
                      className={inputClassName}
                    />
                  </div>

                  {/* 🟢 新增: 其他收入 (带备注) */}
                  <div className="col-span-full">
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Other Earning (其他收入 / 账目抵消)
                    </label>
                    <div className="flex gap-2">
                      <MoneyInput
                        disabled={isPosted || editingEntry.isPaid}
                        value={editingEntry.otherEarning}
                        onChange={(v) =>
                          updateEntry(editingEmpId, { otherEarning: v })
                        }
                        className={`${inputClassName} w-1/3 text-green-700`}
                      />
                      <input
                        type="text"
                        disabled={isPosted || editingEntry.isPaid}
                        value={editingEntry.otherEarningNote}
                        onChange={(e) =>
                          updateEntry(editingEmpId, {
                            otherEarningNote: e.target.value,
                          })
                        }
                        className="w-2/3 p-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-black outline-none focus:border-green-500 transition-all shadow-sm disabled:bg-gray-50 text-[16px] md:text-sm"
                       
                        placeholder="备注 (例如：同事代还抵消)"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 🟢 DEDUCTIONS */}
              <div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden ${mobileModalTab === 'DEDUCTIONS' ? 'block' : 'hidden'}`}>
                <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                <h4 className="text-xs font-black text-red-700 uppercase mb-4 flex items-center gap-2 tracking-widest pl-2">
                  <MinusCircle size={14} /> 扣除 (Deductions)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="input-label text-[10px] font-bold text-gray-400 uppercase block">
                        Late Penalty (迟到)
                      </label>
                      {!isPosted && !editingEntry.isPaid && (
                        <button
                          onClick={() => handleRecalcLatePenalty(editingEmpId)}
                          className="text-[9px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-lg border border-red-100 flex items-center gap-1 transition-colors min-h-[44px] md:min-h-0"
                          title="从当月考勤重新计算"
                        >
                          <RefreshCw size={10} /> 重算
                        </button>
                      )}
                    </div>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.latePenalty}
                      onChange={(v) =>
                        updateEntry(editingEmpId, { latePenalty: v })
                      }
                      className={`${inputClassName} text-red-600`}
                    />
                  </div>
                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Unpaid Leave (无薪假)
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.unpaidLeave}
                      onChange={(v) =>
                        updateEntry(editingEmpId, { unpaidLeave: v })
                      }
                      className={`${inputClassName} text-red-600`}
                    />
                  </div>
                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Hostel Fee (宿舍费)
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.hostelFee}
                      onChange={(v) =>
                        updateEntry(editingEmpId, { hostelFee: v })
                      }
                      className={`${inputClassName} text-red-600`}
                    />
                  </div>
                  <div>
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Tax (PCB)
                    </label>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.ee_pcb}
                      onChange={(v) => updateEntry(editingEmpId, { ee_pcb: v })}
                      className={`${inputClassName} text-red-600`}
                    />
                  </div>

                  {/* 🟢 LINDUNG 24 Jam (SKBBK) — 员工全额承担，雇主 0 */}
                  <div>
                    <div className="flex justify-between items-center mb-1 gap-1">
                      <label className="input-label text-[10px] font-bold text-gray-400 uppercase block leading-tight">
                        LINDUNG 24 Jam
                      </label>
                      {/* 🔘 开关：本地、外劳都可以开关；状态写回人事档案，下个月自动带入 */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!editingEntry.hasLindung}
                        disabled={isPosted || editingEntry.isPaid}
                        onClick={() => {
                          const next = !editingEntry.hasLindung;
                          updateEntry(editingEmpId, {
                            hasLindung: next,
                            ee_lindung: next
                              ? calculateLindung(
                                  Math.max(0, editingEntry.basic - editingEntry.unpaidLeave),
                                  selectedMonth,
                                )
                              : 0,
                          });
                          if (editingEmp) {
                            patchEmployeeProfile(editingEmp.id, { lindungOptOut: !next });
                          }
                        }}
                        className="flex items-center gap-2 min-h-[36px] px-1 disabled:opacity-50"
                      >
                        <span className={`text-[11px] font-black ${editingEntry.hasLindung ? "text-blue-700" : "text-gray-400"}`}>
                          {editingEntry.hasLindung ? "扣" : "不扣"}
                        </span>
                        <span
                          className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${
                            editingEntry.hasLindung ? "bg-blue-600" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              editingEntry.hasLindung ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid || !editingEntry.hasLindung}
                      value={editingEntry.ee_lindung || 0}
                      onChange={(v) => updateEntry(editingEmpId, { ee_lindung: v })}
                      className={`${inputClassName} text-red-600`}
                    />
                    <p className="text-[9px] text-gray-400 font-bold mt-1 leading-tight">
                      {isLindungMonth(selectedMonth)
                        ? `${(getLindungRate(selectedMonth) * 100).toFixed(2)}% 级距表 · 上限 RM6,000（最多 RM${calculateLindung(6000, selectedMonth).toFixed(2)}）· 员工全额，公司不用出`
                        : "2026 年 6 月才开始，这个月份不用扣"}
                    </p>
                  </div>

 <div className="relative md:col-span-1">
                    <div className="flex justify-between items-center mb-1">
                      <label className="input-label text-[10px] font-bold text-gray-400 uppercase block">
                        Advance (预支)
                      </label>
                      {currentEmpAdvances.length > 0 && (
                        <button
                          onClick={() => setShowAdvanceHistory(true)}
                          className="text-[9px] bg-red-50 text-red-600 px-2 py-0.5 rounded-lg border border-red-100 hover:bg-red-100 flex items-center gap-1 font-bold min-h-[44px] md:min-h-0"
                        >
                          <History size={10} /> {currentEmpAdvances.length}{" "}
                          records
                        </button>
                      )}
                    </div>
                    <MoneyInput
                      disabled={isPosted || editingEntry.isPaid}
                      value={editingEntry.advanceLoan}
                      onChange={(v) =>
                        updateEntry(editingEmpId, { advanceLoan: v })
                      }
                      className={`${inputClassName} text-red-600`}
                    />
                  </div>

                  {/* 欠款扣回 —— 只有真的有欠款才出现 */}
                  {(editingEmpLoanBalance > 0 ||
                    (editingEntry.loanRepay || 0) > 0) && (
                    <div className="col-span-full bg-red-50 border-2 border-red-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <label className="input-label text-[10px] font-black text-red-700 uppercase block">
                          欠款扣回 (Loan Repayment)
                        </label>
                        <span className="text-[11px] font-bold text-red-700">
                          {editingEntry.isPaid ? (
                            <>
                              本月已扣回{" "}
                              <b className="font-mono">
                                RM {(editingEntry.loanRepay || 0).toFixed(2)}
                              </b>
                              {" "}→ 余额{" "}
                              <b className="font-mono text-red-900">
                                RM {editingEmpLoanBalance.toFixed(2)}
                              </b>
                            </>
                          ) : (
                            <>
                              欠款余额{" "}
                              <b className="font-mono">
                                RM {editingEmpLoanBalance.toFixed(2)}
                              </b>
                              {(editingEntry.loanRepay || 0) > 0 && (
                                <>
                                  {" "}→ 扣后余额{" "}
                                  <b className="font-mono text-red-900">
                                    RM{" "}
                                    {Math.max(
                                      0,
                                      editingEmpLoanBalance -
                                        (editingEntry.loanRepay || 0),
                                    ).toFixed(2)}
                                  </b>
                                </>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <MoneyInput
                          disabled={isPosted || editingEntry.isPaid}
                          value={editingEntry.loanRepay || 0}
                          onChange={(v) =>
                            updateEntry(editingEmpId, {
                              loanRepay: Math.min(Math.max(0, v), editingEmpLoanBalance),
                            })
                          }
                          className={`${inputClassName} w-1/3 text-red-600`}
                        />
                        <button
                          type="button"
                          disabled={isPosted || editingEntry.isPaid}
                          onClick={() => updateEntry(editingEmpId, { loanRepay: editingEmpLoanBalance })}
                          className="px-3 h-10 rounded-lg bg-white border border-red-200 text-[11px] font-black text-red-700 disabled:opacity-40 min-h-[44px] md:min-h-0"
                        >
                          全额扣清
                        </button>
                        <button
                          type="button"
                          disabled={isPosted || editingEntry.isPaid}
                          onClick={() => updateEntry(editingEmpId, { loanRepay: 0 })}
                          className="px-3 h-10 rounded-lg bg-white border border-gray-200 text-[11px] font-black text-gray-500 disabled:opacity-40 min-h-[44px] md:min-h-0"
                        >
                          这个月不扣
                        </button>
                      </div>
                      <p className="text-[10px] text-red-700 font-bold mt-2 leading-relaxed">
                        ⚠️ 按「发放」之后才会写进人事档案的借还款记录（记一笔「薪资扣回」），
                        在这里改数字不会马上改到欠款余额。
                      </p>
                    </div>
                  )}

                  {/* 🟢 新增: 其他扣除 (带备注) */}
                  <div className="col-span-full">
                    <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Other Deduction (其他扣除 / 帮同事还款)
                    </label>
                    <div className="flex gap-2">
                      <MoneyInput
                        disabled={isPosted || editingEntry.isPaid}
                        value={editingEntry.otherDeduction}
                        onChange={(v) =>
                          updateEntry(editingEmpId, { otherDeduction: v })
                        }
                        className={`${inputClassName} w-1/3 text-red-600`}
                      />
                      <input
                        type="text"
                        disabled={isPosted || editingEntry.isPaid}
                        value={editingEntry.otherDeductionNote}
                        onChange={(e) =>
                          updateEntry(editingEmpId, {
                            otherDeductionNote: e.target.value,
                          })
                        }
                        className="w-2/3 p-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-black outline-none focus:border-red-500 transition-all shadow-sm disabled:bg-gray-50 text-[16px] md:text-sm"
                       
                        placeholder="备注 (例如：帮某某还预支)"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* STATUTORY (EPF/SOCSO/EIS) */}
              <div className={`bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden ${mobileModalTab === 'STATUTORY' ? 'block' : 'hidden'}`}>
                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                <h4 className="text-xs font-black text-blue-700 uppercase mb-4 flex items-center gap-2 tracking-widest pl-2">
                  <Building2 size={14} /> 法定缴纳 (Statutory)
                  <span className="ml-2 text-[9px] text-gray-400 font-normal bg-gray-100 px-2 py-0.5 rounded">
                    (Editable / 可编辑)
                  </span>
                </h4>

                {!editingEntry.isPaid && (
                  <div className="mb-4">
                    <button
                      onClick={() => triggerRecalculateStatutory(editingEmpId)}
                      className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors w-full justify-center min-h-[44px] md:min-h-0"
                      title="Recalculate based on Current Basic Salary"
                    >
                      <RefreshCw size={12} /> 重置为自动计算 (Reset to Auto)
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center justify-between md:justify-start gap-4 min-w-[120px]">
                      <span className="text-xs font-black text-gray-600">
                        EPF (KWSP)
                      </span>
                      <button
                        onClick={() => toggleStatutory(editingEmpId, "EPF")}
                        disabled={isPosted || editingEntry.isPaid}
                        className={`min-h-[44px] md:min-h-0 transition-colors ${editingEntry.hasEPF ? "text-green-600" : "text-gray-400"}`}
                      >
                        {editingEntry.hasEPF ? (
                          <ToggleRight size={32} fill="currentColor" />
                        ) : (
                          <ToggleLeft size={32} />
                        )}
                      </button>
                    </div>
                    {editingEntry.hasEPF && (
                      <div className="flex gap-4 w-full">
                        <div className="flex-1">
                          <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">
                            Employee (11%)
                          </label>
                          <MoneyInput
                            disabled={isPosted || editingEntry.isPaid}
                            value={editingEntry.ee_epf}
                            onChange={(v) =>
                              updateEntry(editingEmpId, { ee_epf: v })
                            }
                            className={`${inputClassName} py-2`}
                            decimals={true}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">
                            Employer (13%)
                          </label>
                          <MoneyInput
                            disabled={isPosted || editingEntry.isPaid}
                            value={editingEntry.er_epf}
                            onChange={(v) =>
                              updateEntry(editingEmpId, { er_epf: v })
                            }
                            className={`${inputClassName} py-2`}
                            decimals={true}
                          />
                        </div>
                      </div>
                    )}
                    {!editingEntry.hasEPF && (
                      <span className="text-xs text-gray-400 italic">
                        Skipped
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-gray-600">
                        SOCSO & EIS
                      </span>
                      <button
                        onClick={() => toggleStatutory(editingEmpId, "SOCSO")}
                        disabled={isPosted || editingEntry.isPaid}
                        className={`min-h-[44px] md:min-h-0 transition-colors ${editingEntry.hasSOCSO ? "text-green-600" : "text-gray-400"}`}
                      >
                        {editingEntry.hasSOCSO ? (
                          <ToggleRight size={32} fill="currentColor" />
                        ) : (
                          <ToggleLeft size={32} />
                        )}
                      </button>
                    </div>

                    {editingEntry.hasSOCSO ? (
                      <div className="space-y-3">
                        <div className="flex flex-col md:flex-row gap-2">
                          <div className="w-24 pt-2 text-[10px] font-bold text-gray-500 uppercase">
                            SOCSO
                          </div>
                          <div className="flex gap-2 flex-1">
                            <div className="flex-1">
                              <label className="text-[8px] text-gray-400 font-bold uppercase block mb-0.5">
                                Employee
                              </label>
                              <MoneyInput
                                disabled={isPosted || editingEntry.isPaid}
                                value={editingEntry.ee_socso}
                                onChange={(v) =>
                                  updateEntry(editingEmpId, { ee_socso: v })
                                }
                                className={`${inputClassName} py-1.5`}
                                decimals={true}
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[8px] text-gray-400 font-bold uppercase block mb-0.5">
                                Employer
                              </label>
                              <MoneyInput
                                disabled={isPosted || editingEntry.isPaid}
                                value={editingEntry.er_socso}
                                onChange={(v) =>
                                  updateEntry(editingEmpId, { er_socso: v })
                                }
                                className={`${inputClassName} py-1.5`}
                                decimals={true}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-2">
                          <div className="w-24 pt-2 text-[10px] font-bold text-gray-500 uppercase">
                            EIS
                          </div>
                          <div className="flex gap-2 flex-1">
                            <div className="flex-1">
                              <label className="text-[8px] text-gray-400 font-bold uppercase block mb-0.5">
                                Employee
                              </label>
                              <MoneyInput
                                disabled={isPosted || editingEntry.isPaid}
                                value={editingEntry.ee_eis}
                                onChange={(v) =>
                                  updateEntry(editingEmpId, { ee_eis: v })
                                }
                                className={`${inputClassName} py-1.5`}
                                decimals={true}
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[8px] text-gray-400 font-bold uppercase block mb-0.5">
                                Employer
                              </label>
                              <MoneyInput
                                disabled={isPosted || editingEntry.isPaid}
                                value={editingEntry.er_eis}
                                onChange={(v) =>
                                  updateEntry(editingEmpId, { er_eis: v })
                                }
                                className={`${inputClassName} py-1.5`}
                                decimals={true}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="text-[8px] text-blue-400 font-bold mt-2 text-center bg-blue-50 py-1 rounded">
                          * Rates based on simulated Official Table logic (Act 4
                          & Act 800)
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">
                        Skipped
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* NOTE */}
              <div className={mobileModalTab === 'STATUTORY' ? 'block' : 'hidden'}>
                <label className="input-label text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  备注 (Note)
                </label>
                <textarea
                  className="w-full p-4 bg-[#FFFFFF] border border-gray-200 rounded-xl outline-none resize-none h-24 focus:border-[#111111] transition-colors text-[16px] md:text-sm"
                 
                  placeholder="Optional..."
                  value={editingEntry.note}
                  onChange={(e) =>
                    updateEntry(editingEmpId, { note: e.target.value })
                  }
                  disabled={isPosted || editingEntry.isPaid}
                ></textarea>
              </div>

              {/* 📄 PDF Export Options Select/Checkboxes */}
              <div className={`bg-yellow-50/50 rounded-2xl border border-yellow-100/65 p-3.5 ${mobileModalTab === 'STATUTORY' ? 'block' : 'hidden'}`}>
                <span className="text-[11px] font-black text-yellow-800 flex items-center gap-1.5 uppercase tracking-wider">
                  📄 PDF 迟到罚款导出选项 (PDF EXPORT PENALTY MODE)
                </span>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleSetPdfPenaltyMode('SHOW_AND_DEDUCT')}
                    className={`min-h-[44px] md:min-h-0 py-2 px-2.5 rounded-xl text-[10px] font-black border transition-all text-center leading-tight active:scale-95 ${pdfPenaltyMode === 'SHOW_AND_DEDUCT' ? 'bg-[#FFD200] text-black border-[#FFD200] shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                  >
                    实发也扣除
                    <span className="block font-normal text-[8px] text-gray-400 mt-0.5">Deduct 100%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPdfPenaltyMode('SHOW_BUT_NO_DEDUCT')}
                    className={`min-h-[44px] md:min-h-0 py-2 px-2.5 rounded-xl text-[10px] font-black border transition-all text-center leading-tight active:scale-95 ${pdfPenaltyMode === 'SHOW_BUT_NO_DEDUCT' ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    title="明面上打印扣除罚款，但是实际Net Pay总数里【不扣除】，只算警告"
                  >
                    明显实不扣 ⚠️
                    <span className="block font-normal text-[8px] text-amber-700 mt-0.5">Warning Only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPdfPenaltyMode('HIDE')}
                    className={`min-h-[44px] md:min-h-0 py-2 px-2.5 rounded-xl text-[10px] font-black border transition-all text-center leading-tight active:scale-95 ${pdfPenaltyMode === 'HIDE' ? 'bg-zinc-800 text-white border-zinc-900 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                  >
                    不显示罚款
                    <span className="block font-normal text-[8px] text-gray-400 mt-0.5">Hide Completely</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Footer (Fixed) */}
            <div
              className="p-4 md:p-5 bg-[#FFFFFF] border-t border-gray-200 shrink-0 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-10"
              style={{
                paddingBottom: "max(16px, env(safe-area-inset-bottom))",
              }}
            >
              {/* 💰 实发 + 付款方式（点一下切换，记在人事档案） */}
              <div className="flex items-end justify-between gap-3 mb-3">
                <div className="flex bg-gray-100 rounded-xl p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPaymentMethodFor(editingEmpId, "BANK")}
                    disabled={isPosted || editingEntry.isPaid}
                    className={`px-3 rounded-lg text-xs font-black flex items-center gap-1 min-h-[40px] transition-all disabled:opacity-60 ${
                      editingEntry.paymentMethod !== "CASH"
                        ? "bg-blue-600 text-white shadow"
                        : "text-gray-500"
                    }`}
                  >
                    <Building2 size={14} /> 银行
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethodFor(editingEmpId, "CASH")}
                    disabled={isPosted || editingEntry.isPaid}
                    className={`px-3 rounded-lg text-xs font-black flex items-center gap-1 min-h-[40px] transition-all disabled:opacity-60 ${
                      editingEntry.paymentMethod === "CASH"
                        ? "bg-green-600 text-white shadow"
                        : "text-gray-500"
                    }`}
                  >
                    <Banknote size={14} /> 现金
                  </button>
                </div>
                <div className="text-right min-w-0">
                  <div className="text-[10px] text-gray-400 uppercase font-bold">
                    NET PAY (实发)
                  </div>
                  <div className="text-2xl md:text-4xl font-mono font-black text-[#111111] tabular-nums tracking-tight truncate">
                    RM{" "}
                    {getTotals(editingEntry).netPay.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap md:flex-nowrap">
                {!showPayConfirm ? (
                  <>
                    <button
                      onClick={() => {
                        setEditingEmpId(null);
                        setShowAdvanceHistory(false);
                      }}
                      className="hidden md:flex flex-1 md:flex-initial bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 py-3 px-3 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-1 active:scale-95 transition-transform min-h-[44px]"
                    >
                      <X size={15} /> 关闭
                    </button>

                    <button
                      onClick={handlePrintSingleSlip}
                      disabled={isGeneratingPdf}
                      className="shrink-0 md:flex-initial bg-white border border-gray-200 text-gray-600 py-3 px-3 rounded-xl font-bold text-xs md:text-sm hover:bg-gray-50 flex items-center justify-center gap-2 active:scale-95 transition-transform min-h-[44px]"
                    >
                      {isGeneratingPdf ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Printer size={16} />
                      )}
                      <span className="hidden md:inline">打印</span>
                    </button>

                    {!isPosted &&
                      (editingEntry.isPaid ? (
                        <button
                          onClick={handleRevokeIndividualPayment}
                          className="flex-grow py-3 px-3 rounded-xl font-bold text-xs md:text-sm shadow-md flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:scale-95 transition-transform min-h-[44px]"
                        >
                          <RotateCcw size={16} /> 撤销
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowPayConfirm(true)}
                          className="flex-grow bg-green-600 text-white py-3 px-3 rounded-xl font-bold text-xs md:text-sm shadow-md hover:bg-green-700 flex items-center justify-center gap-2 active:scale-95 transition-transform min-h-[44px]"
                        >
                          <CreditCard size={16} /> 发放 (Pay)
                        </button>
                      ))}

                    {!editingEntry.isPaid && (
                      <button
                        onClick={handleSaveSingleDraft}
                        className="flex-grow bg-[#111111] text-[#FFD200] py-3 px-3 rounded-xl font-black text-xs md:text-sm shadow-lg hover:bg-black transition-colors flex items-center justify-center gap-2 active:scale-95 transition-transform min-h-[44px]"
                      >
                        <Save size={18} /> 保存 (Save)
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div className="flex flex-col w-full">
                      <span className="text-[9px] text-gray-400 font-bold uppercase ml-1 mb-1">
                        记账日期 (Sync to Funds)
                      </span>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="p-3 border border-gray-300 rounded-lg font-bold text-[#111111] outline-none w-full text-[16px] md:text-sm"
                        style={{ minHeight: "48px" }}
                      />
                      <span className="text-[9px] text-gray-500 mt-1 ml-1 block leading-tight font-medium">
                        💡 付款日默认为当月最后一天
                      </span>
                    </div>
                    <div className="flex gap-2 w-full">
                      {/* 👑 按这位员工设定的方式发（上面可以切换），不再重复问 */}
                      <button
                        onClick={() =>
                          handleSettlePayment(
                            editingEntry.paymentMethod === "CASH" ? "CASH" : "BANK_TRANSFER",
                          )
                        }
                        disabled={isLoading}
                        className={`flex-1 text-white py-3.5 rounded-lg font-black text-sm flex items-center justify-center gap-1.5 shadow-sm active:scale-95 min-h-[48px] disabled:opacity-50 ${
                          editingEntry.paymentMethod === "CASH"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : editingEntry.paymentMethod === "CASH" ? (
                          <Banknote size={16} />
                        ) : (
                          <Building2 size={16} />
                        )}
                        确认发放 · {editingEntry.paymentMethod === "CASH" ? "现金" : "银行转账"}
                      </button>
                      <button
                        onClick={() => setShowPayConfirm(false)}
                        className="px-4 bg-white text-gray-500 rounded-lg border border-gray-300 font-bold hover:bg-gray-100 active:scale-95 min-w-[48px] min-h-[48px] flex items-center justify-center"
                        aria-label="取消"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* === EDIT INDIVIDUAL ADVANCE MODAL === */}
      {editingAdvanceItem && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[340] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
          <div
            className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 relative max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-lg text-[#111111] flex items-center gap-1.5">
                ✏️ 修改预支 (Edit Advance)
              </h3>
              <button
                onClick={() => setEditingAdvanceItem(null)}
                className="p-1 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Staff (员工)
                </label>
                <select
                  value={editAdvForm.company}
                  onChange={(e) =>
                    setEditAdvForm({ ...editAdvForm, company: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-bold outline-none border border-gray-200 focus:border-purple-500 text-[16px] md:text-sm"
                  style={{ minHeight: "48px" }}
                >
                  <option value="">Select Staff...</option>
                  {displayEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} {e.isArchived ? "(离职)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Method (资金来源)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditAdvForm({
                        ...editAdvForm,
                        paymentMethod: "BANK_TRANSFER",
                      })
                    }
                    className={`py-3.5 rounded-xl font-bold text-sm border active:scale-95 transition-transform ${editAdvForm.paymentMethod === "BANK_TRANSFER" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}
                  >
                    银行转账
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditAdvForm({ ...editAdvForm, paymentMethod: "CASH" })
                    }
                    className={`py-3.5 rounded-xl font-bold text-sm border active:scale-95 transition-transform ${editAdvForm.paymentMethod === "CASH" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200"}`}
                  >
                    现金
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Amount (金额)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editAdvForm.amount}
                  onChange={(e) =>
                    setEditAdvForm({ ...editAdvForm, amount: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-black outline-none border border-gray-200 focus:border-purple-500 text-right shrink-0"
                  style={{ fontSize: "18px", minHeight: "48px" }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Date (日期)
                </label>
                <input
                  type="date"
                  value={editAdvForm.date}
                  onChange={(e) =>
                    setEditAdvForm({ ...editAdvForm, date: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-bold outline-none border border-gray-200 focus:border-purple-500 text-[16px] md:text-sm"
                  style={{ minHeight: "48px" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                  Note (备注)
                </label>
                <input
                  type="text"
                  value={editAdvForm.note}
                  onChange={(e) =>
                    setEditAdvForm({ ...editAdvForm, note: e.target.value })
                  }
                  className="w-full p-3 bg-gray-50 rounded-xl font-bold outline-none border border-gray-200 focus:border-purple-500 text-[16px] md:text-sm"
                  style={{ minHeight: "48px" }}
                  placeholder="Reason..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAdvanceItem(null)}
                  className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-xl font-black active:scale-95 transition-transform text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleUpdateAdvance}
                  disabled={isLoading}
                  className="flex-[2] py-4 bg-purple-600 text-white rounded-xl font-black shadow-lg hover:bg-purple-700 active:scale-95 transition-transform text-sm disabled:opacity-50"
                >
                  {isLoading ? "保存中..." : "确认修改 (Save)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* === ADVANCE HISTORY GLOBAL MODAL === */}
      {showAdvanceHistory && createPortal(
        <div
          className="fixed inset-0 z-[330] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in"
          onClick={() => setShowAdvanceHistory(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

          <div
            className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl border border-gray-200 animate-in zoom-in-95 relative z-10 overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-black text-sm text-gray-800 flex items-center gap-2">
                <History size={16} className="text-purple-600" />{" "}
                {editingEmp
                  ? `${editingEmp.name} - 预支记录`
                  : `本月所有预支记录 (${selectedMonth})`}
              </h3>
              <button
                onClick={() => setShowAdvanceHistory(false)}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-0 bg-gray-50 divide-y divide-gray-200">
              {(editingEmp ? currentEmpAdvances : monthAdvances).length ===
              0 ? (
                <div className="p-12 text-center text-gray-400 text-xs text-[#555]">
                  <History size={32} className="mx-auto mb-2 opacity-30" />
                  暂无预支记录
                </div>
              ) : (
                (editingEmp ? currentEmpAdvances : monthAdvances).map(
                  (adv, idx) => (
                    <div
                      key={adv.id}
                      className="p-4 bg-white flex justify-between items-center hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-sans font-black text-xs text-gray-950 leading-none">
                            {adv.company}
                          </span>
                          <span className="bg-purple-50 text-purple-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-purple-100 leading-none">
                            {adv.time}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-bold max-w-[200px] truncate leading-none mt-1.5">
                          {adv.note?.replace("预支薪水 - ", "") || "无备注"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-black text-red-600 font-sans tracking-tight">
                            - RM {adv.amount.toFixed(2)}
                          </div>
                          <span
                            className={`text-[9px] border px-1.5 py-0.2 rounded font-sans font-black uppercase inline-block scale-90 ${adv.paymentMethod === "CASH" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                          >
                            {adv.paymentMethod === "CASH" ? "现金" : "银行"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => {
                              const empId =
                                employees.find((e) => e.name === adv.company)
                                  ?.id || "";
                              setEditingAdvanceItem(adv);
                              setEditAdvForm({
                                id: adv.id,
                                company: empId,
                                amount: String(adv.amount),
                                date: adv.time,
                                note:
                                  adv.note?.replace("预支薪水 - ", "") || "",
                                paymentMethod:
                                  (adv.paymentMethod as any) || "BANK_TRANSFER",
                              });
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded-lg active:scale-95 transition-transform flex items-center justify-center min-w-[44px] min-h-[44px]"
                            title="编辑"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteAdvance(
                                adv.id,
                                adv.company,
                                adv.amount,
                              )
                            }
                            className="p-1.5 hover:bg-gray-100 rounded-lg active:scale-95 transition-transform flex items-center justify-center min-w-[44px] min-h-[44px]"
                            title="删除"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex justify-between items-center shadow-[0_-5px_15px_rgba(0,0,0,0.05)] relative z-20">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Total Advance
              </span>
              <span className="text-xl font-black text-red-600 font-mono">
                RM{" "}
                {(editingEmp ? currentEmpAdvances : monthAdvances)
                  .reduce((s, a) => s + (a.amount || 0), 0)
                  .toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 🟢 HIDDEN PRINT SLIP (A4 Layout - Large + Perfect spacing) */}
      {createPortal(
        <div style={{ position: "absolute", left: "0px", top: 0, zIndex: -9999, pointerEvents: "none" }}>
          <div
            ref={printSlipRef}
          id="hr-payroll-print-slip"
          className="w-[210mm] min-h-[297mm] bg-white p-12 text-black font-sans relative flex flex-col text-[12px]"
        >
          {editingEntry && editingEmp && (
            <>
              {/* Header Section (Larger) */}
              <div className="flex justify-between items-center border-b-4 border-black pb-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-black text-2xl rounded-md shrink-0">
                    K
                  </div>
                  <h1 className="text-xl font-black uppercase tracking-wider leading-tight">
                    KIM LIAN KEE (KEPONG) SDN. BHD.
                  </h1>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black uppercase text-gray-200 leading-none">
                    PAYSLIP
                  </p>
                  <p className="text-base font-bold mt-1">{selectedMonth}</p>
                </div>
              </div>

              {/* Employee Info Box (Larger and spacious) */}
              <div className="grid grid-cols-3 gap-x-6 gap-y-3.5 mb-6 bg-gray-50 p-5 rounded-lg border border-gray-200">
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    Name
                  </p>
                  <p className="text-[13px] font-black leading-tight">
                    {editingEmp.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                     Employee ID
                  </p>
                  <p className="text-[13px] font-mono font-bold leading-tight">
                    {editingEmp.id}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    Position
                  </p>
                  <p className="text-[12px] font-bold leading-tight">
                    {(editingEmp.role || "未分配").split("(")[0]}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    IC / Passport
                  </p>
                  <p className="text-[12px] font-mono font-bold leading-tight">
                    {editingEmp.icNumber || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    Join Date
                  </p>
                  <p className="text-[12px] font-bold leading-tight">
                    {editingEmp.joinDate || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    Bank / A/C
                  </p>
                  <p className="text-[12px] font-bold leading-tight">
                    {editingEmp.bankName || "-"} {editingEmp.bankAccount || ""}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    EPF No.
                  </p>
                  <p className="text-[12px] font-mono font-bold leading-tight">
                    {editingEmp.epfNo || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    SOCSO No.
                  </p>
                  <p className="text-[12px] font-mono font-bold leading-tight">
                    {editingEmp.socsoNo || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">
                    Payment
                  </p>
                  <p className="text-[12px] font-bold uppercase leading-tight">
                    {editingEntry.paymentMethod}
                  </p>
                </div>
              </div>

              {/* Two-column salary breakdown (More vertical spacing) */}
              <div className="grid grid-cols-2 gap-10 mb-6">
                {/* LEFT */}
                <div className="flex flex-col gap-6">
                  {/* EARNINGS */}
                  <div>
                    <div className="flex justify-between border-b-2 border-black pb-1.5 mb-3">
                      <h4 className="text-[12px] font-black uppercase whitespace-nowrap">
                        EARNINGS (收入)
                      </h4>
                      <span className="text-[10px] font-bold text-gray-500">
                        MYR
                      </span>
                    </div>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between">
                        <span>Basic Salary (底薪)</span>
                        <span className="font-mono">
                          {editingEntry.basic.toFixed(2)}
                        </span>
                      </div>
                      {editingEntry.allowance > 0 && (
                        <div className="flex justify-between">
                          <span>Allowances (津贴)</span>
                          <span className="font-mono">
                            {editingEntry.allowance.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.extraSubsidy > 0 && (
                        <div className="flex justify-between">
                          <span>Subsidies (补贴)</span>
                          <span className="font-mono">
                            {editingEntry.extraSubsidy.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.ot > 0 && (
                        <div className="flex justify-between">
                          <span>OT / Commission</span>
                          <span className="font-mono">
                            {editingEntry.ot.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.bonus > 0 && (
                        <div className="flex justify-between">
                          <span>Bonus (奖金)</span>
                          <span className="font-mono">
                            {editingEntry.bonus.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.otherEarning > 0 && (
                        <div className="flex justify-between">
                          <span>
                            Other ({editingEntry.otherEarningNote || "其他"})
                          </span>
                          <span className="font-mono">
                            {editingEntry.otherEarning.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold pt-2.5 border-t border-gray-300 mt-2">
                        <span className="whitespace-nowrap">GROSS PAY (总收入)</span>
                        <span className="font-mono">
                          {getTotals(editingEntry).gross.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DEDUCTIONS */}
                  <div>
                    <div className="flex justify-between border-b-2 border-black pb-1.5 mb-3">
                      <h4 className="text-[12px] font-black uppercase whitespace-nowrap">
                        LESS / DEDUCTIONS (扣除)
                      </h4>
                      <span className="text-[10px] font-bold text-gray-500">
                        MYR
                      </span>
                    </div>
                    <div className="space-y-2 text-[12px]">
                      {editingEntry.ee_epf > 0 && (
                        <div className="flex justify-between">
                          <span>EPF (Employee)</span>
                          <span className="font-mono">
                            {editingEntry.ee_epf.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.ee_socso > 0 && (
                        <div className="flex justify-between">
                          <span>SOCSO (Employee)</span>
                          <span className="font-mono">
                            {editingEntry.ee_socso.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.ee_eis > 0 && (
                        <div className="flex justify-between">
                          <span>EIS (Employee)</span>
                          <span className="font-mono">
                            {editingEntry.ee_eis.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {(editingEntry.ee_lindung || 0) > 0 && (
                        <div className="flex justify-between">
                          <span>LINDUNG 24 Jam</span>
                          <span className="font-mono">
                            {(editingEntry.ee_lindung || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.ee_pcb > 0 && (
                        <div className="flex justify-between">
                          <span>PCB (Tax)</span>
                          <span className="font-mono">
                            {editingEntry.ee_pcb.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {editingEntry.advanceLoan > 0 && (
                        <div className="flex justify-between">
                          <span>Advance (预支)</span>
                          <span className="font-mono">
                            {editingEntry.advanceLoan.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {(() => {
                        const pdfTotals = getPdfTotals(editingEntry, pdfPenaltyMode);
                        return (
                          <>
                            {pdfPenaltyMode === 'HIDE' ? (
                              editingEntry.unpaidLeave > 0 && (
                                <div className="flex justify-between">
                                  <span>Unpaid Leave (缺席扣除)</span>
                                  <span className="font-mono">
                                    {editingEntry.unpaidLeave.toFixed(2)}
                                  </span>
                                </div>
                              )
                            ) : pdfPenaltyMode === 'SHOW_BUT_NO_DEDUCT' ? (
                              <>
                                {editingEntry.latePenalty > 0 && (
                                  <div className="flex justify-between text-amber-700 font-bold">
                                    <span>Late Penalty (Warning / 仅警告不扣)</span>
                                    <span className="font-mono">
                                      RM {editingEntry.latePenalty.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {editingEntry.unpaidLeave > 0 && (
                                  <div className="flex justify-between">
                                    <span>Unpaid Leave (缺席扣除)</span>
                                    <span className="font-mono">
                                      {editingEntry.unpaidLeave.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {editingEntry.latePenalty > 0 && (
                                  <div className="flex justify-between">
                                    <span>Late Penalty (迟到扣款)</span>
                                    <span className="font-mono">
                                      {editingEntry.latePenalty.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {editingEntry.unpaidLeave > 0 && (
                                  <div className="flex justify-between">
                                    <span>Unpaid Leave (缺席扣除)</span>
                                    <span className="font-mono">
                                      {editingEntry.unpaidLeave.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}

                            {editingEntry.hostelFee > 0 && (
                              <div className="flex justify-between">
                                <span>Hostel Fee (宿舍费)</span>
                                <span className="font-mono">
                                  {editingEntry.hostelFee.toFixed(2)}
                                </span>
                              </div>
                            )}
                            {(editingEntry.loanRepay || 0) > 0 && (
                              <div className="flex justify-between">
                                <span>Loan Repayment (欠款扣回)</span>
                                <span className="font-mono">
                                  {(editingEntry.loanRepay || 0).toFixed(2)}
                                </span>
                              </div>
                            )}
                            {editingEntry.otherDeduction > 0 && (
                              <div className="flex justify-between">
                                <span>
                                  Other ({editingEntry.otherDeductionNote || "其他"})
                                </span>
                                <span className="font-mono">
                                  {editingEntry.otherDeduction.toFixed(2)}
                                </span>
                              </div>
                            )}
                            {pdfTotals.deductions === 0 && (
                              <div className="flex justify-between text-gray-400 italic">
                                <span>No deductions for this period</span>
                                <span className="font-mono">—</span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold pt-2.5 border-t border-gray-300 mt-2">
                              <span className="whitespace-nowrap">TOTAL DEDUCTIONS (总扣除)</span>
                              <span className="font-mono">
                                {pdfTotals.deductions.toFixed(2)}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* NET PAY */}
                  <div className="border-t-4 border-black pt-4 mt-2 flex justify-between items-center bg-gray-100 p-4 rounded-md">
                    <div>
                      <span className="text-base font-black uppercase block leading-tight">
                        NET PAY (实发薪资)
                      </span>
                      <span className="text-[10px] font-bold text-gray-500 uppercase">
                        via {editingEntry.paymentMethod}
                      </span>
                    </div>
                    <span className="text-2xl font-mono font-black">
                      RM {getPdfTotals(editingEntry, pdfPenaltyMode).netPay.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* RIGHT: CONTRIBUTIONS (本地员工) OR WORK PERMIT INFO (外劳) */}
                {(editingEmp.nationality || "").includes("Malaysian") ||
                (editingEmp.nationality || "").includes("🇲🇾") ? (
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-[12px] font-black uppercase border-b border-gray-300 pb-1.5 mb-3 text-gray-500">
                      CONTRIBUTIONS (法定缴纳)
                    </h4>
                    <div className="space-y-4 text-[12px]">
                      <div>
                        <p className="font-bold text-gray-500 mb-1 uppercase text-[10px]">
                          EPF (KWSP)
                        </p>
                        <table className="w-full">
                           <tbody>
                             <tr>
                               <td className="py-1">Employee (11%)</td>
                               <td className="text-right font-mono">
                                 {editingEntry.ee_epf.toFixed(2)}
                               </td>
                             </tr>
                             <tr>
                               <td className="py-1">Employer (13%)</td>
                               <td className="text-right font-mono">
                                 {editingEntry.er_epf.toFixed(2)}
                               </td>
                             </tr>
                             <tr className="font-bold border-t border-gray-300">
                               <td className="py-1">Total</td>
                               <td className="text-right font-mono">
                                 {(
                                   editingEntry.ee_epf + editingEntry.er_epf
                                 ).toFixed(2)}
                               </td>
                             </tr>
                           </tbody>
                         </table>
                      </div>
                      <div>
                        <p className="font-bold text-gray-500 mb-1 uppercase text-[10px]">
                          SOCSO (PERKESO)
                        </p>
                        <table className="w-full">
                          <tbody>
                            <tr>
                              <td className="py-1">Employee Share</td>
                              <td className="text-right font-mono">
                                {editingEntry.ee_socso.toFixed(2)}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1">Employer Share</td>
                              <td className="text-right font-mono">
                                {editingEntry.er_socso.toFixed(2)}
                              </td>
                            </tr>
                            <tr className="font-bold border-t border-gray-300">
                              <td className="py-1">Total</td>
                              <td className="text-right font-mono">
                                {(
                                  editingEntry.ee_socso + editingEntry.er_socso
                                ).toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <p className="font-bold text-gray-500 mb-1 uppercase text-[10px]">
                          EIS (SIP)
                        </p>
                        <table className="w-full">
                          <tbody>
                            <tr>
                              <td className="py-1">Employee Share</td>
                              <td className="text-right font-mono">
                                {editingEntry.ee_eis.toFixed(2)}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1">Employer Share</td>
                              <td className="text-right font-mono">
                                {editingEntry.er_eis.toFixed(2)}
                              </td>
                            </tr>
                            <tr className="font-bold border-t border-gray-300">
                              <td className="py-1">Total</td>
                              <td className="text-right font-mono">
                                {(
                                  editingEntry.ee_eis + editingEntry.er_eis
                                ).toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="pt-2 mt-2 border-t border-gray-200">
                        <div className="flex justify-between text-[11px]">
                          <span>Issued Date:</span>
                          <span className="font-bold">
                            {new Date().toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="text-[12px] font-black uppercase border-b border-blue-300 pb-1.5 mb-3 text-blue-700">
                      FOREIGN WORKER INFO (外劳资料)
                    </h4>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">
                          Nationality
                        </span>
                        <span className="font-bold">
                          {editingEmp.nationality || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">
                          Passport No.
                        </span>
                        <span className="font-mono font-bold">
                          {editingEmp.passportNo || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">
                          Work Permit No.
                        </span>
                        <span className="font-mono font-bold">
                          {editingEmp.workPermitNo || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">
                          Permit Expiry
                        </span>
                        <span className="font-mono font-bold">
                          {editingEmp.workPermitExpiry || "-"}
                        </span>
                      </div>
                      {editingEmp.hasHostel && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-bold">
                            Hostel
                          </span>
                          <span className="font-bold text-green-700">
                            ✓ Provided
                          </span>
                        </div>
                      )}
                      <div className="pt-3 mt-3 border-t border-blue-200">
                        <p className="text-[10px] text-blue-700 font-bold leading-relaxed">
                          ℹ️ Foreign workers are exempt from EPF, SOCSO, and EIS
                          statutory contributions under Malaysian Employment
                          Act.
                        </p>
                      </div>
                      <div className="pt-2 mt-2 border-t border-blue-200">
                        <div className="flex justify-between text-[11px]">
                          <span>Issued Date:</span>
                          <span className="font-bold">
                            {new Date().toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Signatures (Now at the bottom of Page 1) */}
              <div className="mt-auto pt-8">
                <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
                  <span className="font-bold uppercase">Disclaimer:</span> I
                  hereby acknowledge receipt of the above sum as full payment of
                  my salary for the period indicated, including all deductions
                  for EPF, SOCSO, EIS, and PCB (if applicable). Any
                  discrepancies must be reported to HR within 7 days of receipt.
                </p>
                <div className="grid grid-cols-2 gap-16 text-center text-[11px]">
                  <div>
                    <div className="border-b border-black mb-2 h-10"></div>
                    <p className="font-bold uppercase text-[10px]">Employer Signature</p>
                    <p className="text-[9px] text-gray-400">Kim Lian Kee</p>
                  </div>
                  <div>
                    <div className="border-b border-black mb-2 h-10"></div>
                    <p className="font-bold uppercase text-[10px]">Employee Signature</p>
                    <p className="text-[9px] text-gray-400">
                      I acknowledge receipt
                    </p>
                  </div>
                </div>
                <p className="text-[9px] text-gray-300 text-center mt-3 uppercase tracking-widest">
                  COMPUTER GENERATED • {new Date().toISOString().split("T")[0]}
                </p>
              </div>
            </>
          )}
        </div>

        {/* 👑 PAGE 2: Monthly Attendance Record (Cloned from AttendanceConsole) */}
        {editingEntry && editingEmp && (
          <div
            ref={attendancePrintRef}
            id="hr-payroll-attendance-print"
            className="w-[210mm] min-h-[297mm] bg-white p-12 text-black font-sans relative flex flex-col text-[12px]"
            style={{ marginTop: "20px" }}
          >
            {/* Print Header */}
            <div className="border-b-4 border-black flex justify-between items-start pb-3 mb-6">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-wider text-[#111111]">KIM LIAN KEE (金莲记)</h1>
                <p className="text-[11px] text-gray-500 font-black tracking-widest mt-1 uppercase">Monthly Attendance Record (员工月度打卡表)</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] text-gray-700 mt-3">
                  <div><span className="text-gray-400 font-bold uppercase">Name (姓名):</span> <span className="font-black">{editingEmp.name}</span></div>
                  <div><span className="text-gray-400 font-bold uppercase">No (工号):</span> <span className="font-mono font-black">{editingEmp.id}</span></div>
                  <div><span className="text-gray-400 font-bold uppercase">Department (部门):</span> <span className="font-bold">{(editingEmp.role || 'Admin/FOH').split('(')[0]}</span></div>
                  <div><span className="text-gray-400 font-bold uppercase">Period (期间):</span> <span className="font-mono font-black">{selectedMonth}-01 ~ {selectedMonth}-{new Date(parseInt(selectedMonth.split("-")[0]), parseInt(selectedMonth.split("-")[1]), 0).getDate()}</span></div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="bg-yellow-100 text-yellow-800 font-black text-[11px] px-3.5 py-1 rounded border border-yellow-200 uppercase tracking-widest mb-1">
                  Attendance Template
                </div>
                <p className="text-[11px] text-gray-400 font-mono">Printed: {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {/* Table */}
            <div className="border border-black overflow-hidden rounded mb-4">
              <table className="w-full border-collapse text-center text-[10.5px]">
                <thead className="bg-[#111111] text-white">
                  <tr className="border-b border-black">
                    <th className="p-2 border-r border-black font-black w-24">日期 / 星期<br/>(Date / Day)</th>
                    <th className="p-2 border-r border-black font-black" colSpan={2}>上午 (AM)<br/><span className="text-[9px] font-normal">Check In / Out</span></th>
                    <th className="p-2 border-r border-black font-black" colSpan={2}>下午 (PM)<br/><span className="text-[9px] font-normal">Check In / Out</span></th>
                    <th className="p-2 border-r border-black font-black" colSpan={2}>加班 (OT)<br/><span className="text-[9px] font-normal">Check In / Out</span></th>
                    <th className="p-2 border-r border-black font-black w-20">出勤状态<br/>(Status)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const [yr, mo] = selectedMonth.split("-").map(Number);
                    const daysInMonth = new Date(yr, mo, 0).getDate();
                    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const weekdayChinese = ['日', '一', '二', '三', '四', '五', '六'];
                    
                    return Array.from({ length: daysInMonth }, (_, index) => {
                      const d = index + 1;
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dateObj = new Date(`${dStr}T00:00:00`);
                      const dowIdx = dateObj.getDay();
                      const isWeekend = dowIdx === 0 || dowIdx === 6;
                      const dayLabel = `${String(d).padStart(2, '0')} ${weekdayNames[dowIdx]}`;

                      const rec = editingAttendance.find((r: any) => r.date === dStr);
                      const rosterStatus = dailyRoster[dStr]?.[editingEmp.id] || 'WORK';
                      
                      let recordTimes = rec?.allTimes || [];
                      if (recordTimes.length === 0 && rec) {
                        if (rec.clockIn) {
                          try {
                            recordTimes.push(new Date(rec.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
                          } catch (e) {
                            console.warn("Invalid clockIn", rec.clockIn);
                          }
                        }
                        if (rec.clockOut) {
                          try {
                            const outStr = new Date(rec.clockOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                            const inStr = rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                            if (outStr !== inStr) {
                              recordTimes.push(outStr);
                            }
                          } catch (e) {
                            console.warn("Invalid clockOut", rec.clockOut);
                          }
                        }
                      }
                      const punches = distributeTimes(recordTimes);

                      let statusNode = <span className="text-green-700 font-black">✓ 出勤</span>;
                      let rowBg = isWeekend ? "bg-red-50/40" : "bg-white";
                      
                      if (rosterStatus === 'OFF') {
                        statusNode = <span className="text-gray-400 font-bold bg-gray-100 px-1.5 py-0.5 rounded">OFF 休</span>;
                        rowBg = "bg-gray-100/50";
                      } else if (rosterStatus === 'MC') {
                        statusNode = <span className="text-orange-700 font-bold bg-orange-50 px-1.5 py-0.5 rounded">MC 病假</span>;
                      } else if (rosterStatus === 'ANNUAL') {
                        statusNode = <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded">AL 年假</span>;
                      } else if (rosterStatus === 'LEAVE') {
                        statusNode = <span className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded">UL 事假</span>;
                      } else if (rosterStatus === 'ABSENT') {
                        statusNode = <span className="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded">ABS 缺席</span>;
                      } else if (!rec) {
                        statusNode = <span className="text-gray-300 italic">未打卡</span>;
                      } else if (rec.status === 'LATE' || rec.status === 'COMPLETED_LATE') {
                        statusNode = <span className="text-red-600 font-black">迟到 Late</span>;
                      }

                      return (
                        <tr key={d} className={`border-b border-gray-300 last:border-0 hover:bg-gray-50/80 transition-colors ${rowBg}`}>
                          <td className={`py-1 px-0.5 border-r border-gray-300 font-bold font-mono ${isWeekend ? 'text-red-500 bg-red-50/30' : 'text-gray-700'}`}>
                            {dayLabel} {weekdayChinese[dowIdx]}
                          </td>

                          <td className="py-1 px-0.5 border-r border-gray-200 font-mono font-bold text-gray-700 text-center">{punches.amIn}</td>
                          <td className="py-1 px-0.5 border-r border-gray-300 font-mono text-gray-500 text-center">{punches.amOut}</td>

                          <td className="py-1 px-0.5 border-r border-gray-200 font-mono font-bold text-gray-700 text-center">{punches.pmIn}</td>
                          <td className="py-1 px-0.5 border-r border-gray-300 font-mono text-gray-500 text-center">{punches.pmOut}</td>

                          <td className="py-1 px-0.5 border-r border-gray-200 font-mono font-bold text-orange-600 text-center">{punches.otIn}</td>
                          <td className="py-1 px-0.5 border-r border-gray-300 font-mono text-gray-500 text-center">{punches.otOut}</td>

                          <td className="py-1 px-0.5 border-r border-gray-300 font-bold text-center">
                            {statusNode}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Signatures */}
            <div className="mt-auto pt-6 border-t border-dashed border-gray-300 grid grid-cols-2 gap-16 text-[11px]">
              <div className="flex flex-col justify-end min-h-[50px]">
                <div className="border-b border-black w-48 mb-2"></div>
                <p className="font-bold text-gray-600 uppercase text-[9px]">Employee's Signature (员工签名)</p>
                <p className="text-[9px] text-gray-400 mt-1">Date: __________________</p>
              </div>
              <div className="flex flex-col justify-end items-end min-h-[50px] text-right">
                <div className="border-b border-black w-48 mb-2"></div>
                <p className="font-bold text-gray-600 uppercase text-[9px]">Verified by HR Manager (经手经理)</p>
                <p className="text-[9px] text-gray-400 mt-1">Date: __________________</p>
              </div>
            </div>

            {/* Summary statistics */}
            {(() => {
              const workedDaysCount = editingAttendance.filter(r => (r.allTimes && r.allTimes.length > 0) || r.clockIn).length;
              const lateDaysCount = editingAttendance.filter(r => r.status === 'LATE' || r.status === 'COMPLETED_LATE').length;
              return (
                <div className="mt-4 p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-[11px] text-gray-500 flex justify-between items-center font-bold">
                  <div>Worked Days (工作天数): <span className="text-black font-black font-mono text-sm">{workedDaysCount} Days</span></div>
                  <div>Late Days (迟到天数): <span className="text-red-600 font-black font-mono text-sm">{lateDaysCount} Times</span></div>
                  <div className="text-[9px] text-gray-400">Kim Lian Kee Kepong Admin Portal</div>
                </div>
              );
            })()}
          </div>
        )}
      </div>,
      document.body
    )}

      {/* 🟢 HIDDEN PRINT SUMMARY TABLE (Landscape A4) */}
      {createPortal(
        <div style={{ position: "absolute", left: "0px", top: 0, zIndex: -9999, pointerEvents: "none" }}>
          <div
            ref={printSummaryRef}
          id="hr-payroll-summary-print"
          className="w-[297mm] min-h-[210mm] bg-white p-10 font-sans text-black relative"
        >
          <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-widest">
                PAYROLL SUMMARY
              </h1>
              <p className="text-sm font-bold text-gray-500">
                Month: {selectedMonth}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black">KIM LIAN KEE</p>
            </div>
          </div>

          <table className="w-full text-left text-[10px] border-collapse table-fixed">
            {/* 固定列宽：不写死的话列宽会随当月员工数据变化，每次导出对不上，
                金额列也容易被挤到换行。合计 100%。 */}
            <colgroup>
              <col className="w-[6%]" /><col className="w-[16%]" />
              <col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" />
              <col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" />
              <col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[5%]" />
            </colgroup>
            <thead>
              <tr className="bg-gray-100 border-y border-black">
                <th className="p-2 border-r border-gray-300 whitespace-nowrap">ID</th>
                <th className="p-2 border-r border-gray-300 whitespace-nowrap">Name</th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap">
                  Basic
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap">
                  Allow+Sub
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap">
                  OT/Bonus
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap text-green-700">
                  Other(Earn)
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap text-red-700">
                  Other(Ded)
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap">
                  Hostel+Adv
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap">
                  EPF/SOCSO/EIS/LINDUNG
                </th>
                <th className="p-2 text-right border-r border-gray-300 whitespace-nowrap font-black">
                  NET PAY
                </th>
                <th className="p-2 text-center whitespace-nowrap">Method</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(selectedEmpIds).map((id) => {
                const emp = employees.find((e) => e.id === id);
                const entry = payrollData[id];
                if (!emp || !entry) return null;
                const t = getTotals(entry);

                return (
                  <tr key={id} className="border-b border-gray-200">
                    <td className="p-2 border-r border-gray-100 font-mono">
                      {emp.id}
                    </td>
                    <td className="p-2 border-r border-gray-100 font-bold">
                      {emp.name}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums">
                      {entry.basic.toFixed(2)}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums">
                      {(entry.allowance + entry.extraSubsidy).toFixed(2)}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums">
                      {(entry.ot + entry.bonus).toFixed(2)}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums text-green-700">
                      {entry.otherEarning > 0
                        ? entry.otherEarning.toFixed(2)
                        : "-"}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums text-red-700">
                      {entry.otherDeduction > 0
                        ? `(${entry.otherDeduction.toFixed(2)})`
                        : "-"}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums text-red-600">
                      {entry.hostelFee + entry.advanceLoan > 0
                        ? `(${(entry.hostelFee + entry.advanceLoan).toFixed(2)})`
                        : "-"}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums text-red-600">
                      {entry.ee_epf + entry.ee_socso + entry.ee_eis + (entry.ee_lindung || 0) > 0
                        ? `(${(entry.ee_epf + entry.ee_socso + entry.ee_eis + (entry.ee_lindung || 0)).toFixed(2)})`
                        : "-"}
                    </td>
                    <td className="p-2 text-right border-r border-gray-100 font-mono tabular-nums font-black">
                      {t.netPay.toFixed(2)}
                    </td>
                    <td className="p-2 text-center text-[9px]">
                      {entry.paymentMethod}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold border-t-2 border-black">
                <td colSpan={9} className="p-2 text-right uppercase">
                  Total Net Pay:
                </td>
                <td className="p-2 text-right font-black font-mono tabular-nums">
                  RM{" "}
                  {(
                    Array.from(selectedEmpIds).reduce(
                      (acc: number, id: string) => {
                        const entry = payrollData[id];
                        return acc + (entry ? getTotals(entry).netPay : 0);
                      },
                      0,
                    ) as number
                  ).toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-12 flex justify-between pt-8 border-t border-black">
            <div>
              <p className="text-xs uppercase font-bold">Prepared By</p>
              <div className="w-48 h-px bg-black mt-8"></div>
            </div>
            <div>
              <p className="text-xs uppercase font-bold">Approved By</p>
              <div className="w-48 h-px bg-black mt-8"></div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </div>
  );
};

