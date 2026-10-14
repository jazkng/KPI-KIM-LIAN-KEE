// ============================================================================
// 马来西亚法定扣款（EPF / SOCSO / EIS / LINDUNG 24 Jam）与历史底薪
// ----------------------------------------------------------------------------
// 原本写在 components/features/hr/HRPayroll.tsx 里，原封不动搬到这里，
// 让薪资计算与「人工成本分析」共用同一套算法（不重写、不改费率）。
// 修改费率请只改这一个档案。
// ============================================================================
import type { Employee } from '../../types';

export const calculateEPF = (gross: number, isEmployer: boolean) => {
  if (gross <= 0) return 0;
  if (!isEmployer) {
    return Math.ceil(gross * 0.11);
  } else {
    const rate = gross <= 5000 ? 0.13 : 0.12;
    return Math.ceil(gross * rate);
  }
};

/**
 * LINDUNG 24 Jam (Skim Perlindungan Bukan Bencana Kerja, SKBBK)
 *
 * PERKESO 2026 年 6 月 1 日开办的新计划，保障「非工作时间」发生的意外。
 *   · 费率 0.75%（第一阶段：2026-06-01 ~ 2028-05-31）
 *   · 薪资上限 RM6,000 → 每人每月最多 RM44.65
 *   · ⚠️ 员工全额承担，雇主不用出（跟 SOCSO / EIS 不一样）
 *   · 外劳强制；本地员工可退出（现有员工退出期限 2026-08-31，之后「Sekali Layak, Terus Layak」）
 *
 * 👑 PERKESO 用的是「薪资级距表」，不是直接 × 0.75%：
 *    跟 SOCSO 一样按 RM100 一级，取级距上限 × 0.75% − RM0.35
 *    例：RM2,000 → 14.65 ｜ RM3,000 → 22.15 ｜ RM5,000 → 37.15 ｜ RM6,000 → 44.65
 *    （旧版直接 × 0.75% 进位，会每人多扣几毛钱）
 *
 * 之后阶段费率会调（2028-06 起 1.00%、2031-06 起 1.25%），
 * 到时候改下面的 LINDUNG_PHASES 就好。
 */
export const LINDUNG_START_MONTH = "2026-06";
export const LINDUNG_WAGE_CEILING = 6000;
export const LINDUNG_PHASES: { from: string; rate: number }[] = [
  { from: "2026-06", rate: 0.0075 },
  { from: "2028-06", rate: 0.01 },
  { from: "2031-06", rate: 0.0125 },
];

/** 这个月份有没有 LINDUNG 24 Jam（2026 年 6 月以前没有这个计划） */
export const isLindungMonth = (month: string) => !!month && month >= LINDUNG_START_MONTH;

export const getLindungRate = (month?: string) => {
  const m = month || new Date().toISOString().slice(0, 7);
  let rate = LINDUNG_PHASES[0].rate;
  LINDUNG_PHASES.forEach((p) => {
    if (m >= p.from) rate = p.rate;
  });
  return rate;
};

export const calculateLindung = (wage: number, month?: string): number => {
  if (!wage || wage <= 0) return 0;
  if (month && !isLindungMonth(month)) return 0;
  const rate = getLindungRate(month);
  const cappedWage = Math.min(wage, LINDUNG_WAGE_CEILING);
  const bracketTop = Math.max(100, Math.ceil(cappedWage / 100) * 100);
  // 级距中位数 × 费率，四舍五入（遇到 .x25 / .x75 这种刚好一半的往上）到 5 sen
  const midpoint = bracketTop - 50;
  const raw = midpoint * rate;
  const rounded = Math.round(raw * 20 + 1e-6) / 20;
  return parseFloat(rounded.toFixed(2));
};

export const SOCSO_EMPLOYER_LOOKUP: Record<number, number> = {
  3000: 51.65,
  3100: 53.35,
  3200: 55.15,
  3300: 56.85,
  3400: 58.65,
  3500: 60.35,
  3600: 62.15,
  3700: 63.85,
  3800: 65.65,
  3900: 67.35,
  4000: 69.05,
  4100: 70.85,
  4200: 72.55,
  4300: 74.35,
  4400: 76.05,
  4500: 77.85,
  4600: 79.55,
  4700: 81.35,
  4800: 83.05,
  4900: 84.85,
  5000: 86.55,
  5100: 88.35,
  5200: 90.05,
  5300: 91.85,
  5400: 93.55,
  5500: 95.35,
  5600: 97.05,
  5700: 98.85,
  5800: 100.55,
  5900: 102.35,
  6000: 104.15,
};

export const calculateSOCSO = (wage: number, isEmployer: boolean) => {
  if (wage <= 0) return 0;
  const cappedWage = Math.min(wage, 6000);
  if (cappedWage < 30) return isEmployer ? 0.4 : 0.1;
  const bracket = Math.ceil(cappedWage / 100) * 100;

  if (!isEmployer) {
    let amount = bracket * 0.005;
    if (bracket > 200) amount = amount - 0.25;
    return parseFloat(amount.toFixed(2));
  } else {
    if (bracket >= 3000 && SOCSO_EMPLOYER_LOOKUP[bracket]) {
      return SOCSO_EMPLOYER_LOOKUP[bracket];
    }
    let amount = bracket * 0.0175;
    if (bracket > 200) amount = amount - 0.85;
    return parseFloat(amount.toFixed(2));
  }
};

export const calculateEIS = (wage: number, isEmployer: boolean) => {
  if (wage <= 0) return 0;
  const cappedWage = Math.min(wage, 6000);
  if (cappedWage <= 30) return 0.05;
  const bracket = Math.ceil(cappedWage / 100) * 100;
  let amount = bracket * 0.002;
  if (bracket > 200) amount = amount - 0.1;
  return parseFloat(amount.toFixed(2));
};

// --- HISTORICAL SALARY HELPER ---
export const getHistoricalSalary = (emp: Employee, monthStr: string) => {
  if (!emp.salaryHistory || emp.salaryHistory.length === 0)
    return emp.basicSalary || 0;

  const targetDate = `${monthStr}-31`;
  const sortedHistory = [...emp.salaryHistory].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const futureChanges = sortedHistory.filter((rec) => rec.date > targetDate);

  if (futureChanges.length > 0) {
    const totalFutureAdjustment = futureChanges.reduce(
      (sum, rec) => sum + (rec.adjustment || 0),
      0,
    );
    return (emp.basicSalary || 0) - totalFutureAdjustment;
  }

  return emp.basicSalary || 0;
};
