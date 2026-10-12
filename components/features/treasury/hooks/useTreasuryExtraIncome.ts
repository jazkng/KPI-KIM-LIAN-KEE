import { useState, useEffect, useMemo } from "react";
import { FundTransfer } from "../treasuryTypes";
import { DEFAULT_INCOME_SOURCES } from "../treasuryConstants";

/**
 * 资金管理 — 额外收入 (代收) 的月份过滤与统计
 *
 * ⚠️ 逻辑与原本 TreasuryModule.tsx 内的实作完全一致，只是搬迁位置。
 */
export const useTreasuryExtraIncome = (transfers: FundTransfer[]) => {
  // 📅 额外收入月份过滤 State
  const [incomeFilterMonth, setIncomeFilterMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );

  const navigateMonth = (direction: "prev" | "next") => {
    if (!incomeFilterMonth || incomeFilterMonth.length < 7) return;
    const [yearStr, monthStr] = incomeFilterMonth.split("-");
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);
    if (direction === "prev") {
      month--;
      if (month < 1) {
        month = 12;
        year--;
      }
    } else {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    const nextMonthStr = `${year}-${String(month).padStart(2, "0")}`;
    setIncomeFilterMonth(nextMonthStr);
  };

  // 📅 自动切换到有记录的最新月份（如果当前月份没有记录）
  useEffect(() => {
    const allRecords = transfers.filter(
      (t) => t.fromAccount === ("OTHER" as any),
    );
    if (allRecords.length > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const hasCurrentMonth = allRecords.some((t) => {
        if (!t.date) return false;
        try {
          const d = new Date(t.date);
          if (isNaN(d.getTime())) return t.date.startsWith(currentMonth);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          return `${y}-${m}` === currentMonth;
        } catch {
          return t.date.startsWith(currentMonth);
        }
      });
      if (!hasCurrentMonth) {
        // 按日期降序排列以找到最新记录
        const sorted = [...allRecords].sort((a, b) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        const latestDate = sorted[0].date;
        try {
          const d = new Date(latestDate);
          if (!isNaN(d.getTime())) {
            const latestMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            setIncomeFilterMonth(latestMonth);
          } else {
            setIncomeFilterMonth(latestDate.slice(0, 7).replace(/\//g, "-"));
          }
        } catch {
          setIncomeFilterMonth(latestDate.slice(0, 7).replace(/\//g, "-"));
        }
      }
    }
  }, [transfers]);

  const incomeSourceHistory = useMemo(() => {
    const historySet = new Set<string>(DEFAULT_INCOME_SOURCES);
    transfers.forEach((t) => {
      if (t.fromAccount === ("OTHER" as any) && t.note?.startsWith("[代收]")) {
        const withoutPrefix = t.note.substring(5);
        const parts = withoutPrefix.split(" - ");
        if (parts.length > 0 && parts[0].trim()) historySet.add(parts[0].trim());
      }
    });
    return Array.from(historySet).sort();
  }, [transfers]);

  // 📅 按月过滤的额外收入统计
  const extraIncomeStats = useMemo(() => {
    const allRecords = transfers.filter(
      (t) => t.fromAccount === ("OTHER" as any),
    );
    const total = allRecords.reduce((sum, t) => sum + t.amount, 0);

    // 按选中月份过滤 (支持各类日期格式)
    const filteredRecords = allRecords.filter((t) => {
      if (!t.date) return false;
      try {
        const d = new Date(t.date);
        if (isNaN(d.getTime())) {
          return t.date.replace(/\//g, "-").startsWith(incomeFilterMonth);
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}` === incomeFilterMonth;
      } catch (err) {
        return t.date.replace(/\//g, "-").startsWith(incomeFilterMonth);
      }
    });
    const filteredTotal = filteredRecords.reduce((sum, t) => sum + t.amount, 0);

    // 本月统计 (支持各类日期格式)
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthTotal = allRecords
      .filter((t) => {
        if (!t.date) return false;
        try {
          const d = new Date(t.date);
          if (isNaN(d.getTime())) {
            return t.date.replace(/\//g, "-").startsWith(currentMonthPrefix);
          }
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          return `${y}-${m}` === currentMonthPrefix;
        } catch (err) {
          return t.date.replace(/\//g, "-").startsWith(currentMonthPrefix);
        }
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const breakdown = {
      electricity: allRecords
        .filter(
          (t) =>
            t.note?.toUpperCase().includes("ELECTRICITY") ||
            t.note?.includes("电"),
        )
        .reduce((s, t) => s + t.amount, 0),
      water: allRecords
        .filter(
          (t) =>
            t.note?.toUpperCase().includes("WATER") || t.note?.includes("水"),
        )
        .reduce((s, t) => s + t.amount, 0),
      rent: allRecords
        .filter(
          (t) =>
            t.note?.toUpperCase().includes("RENT") || t.note?.includes("租"),
        )
        .reduce((s, t) => s + t.amount, 0),
      other: allRecords
        .filter((t) => !t.note?.match(/ELECTRICITY|电|WATER|水|RENT|租/i))
        .reduce((s, t) => s + t.amount, 0),
    };

    // 获取所有存在记录的月份列表（用于快速导航） (支持各类日期格式)
    const monthsSet = new Set<string>();
    allRecords.forEach((t) => {
      if (!t.date) return;
      try {
        const d = new Date(t.date);
        if (isNaN(d.getTime())) {
          const m = t.date.slice(0, 7).replace(/\//g, "-");
          if (m && m.length === 7) monthsSet.add(m);
        } else {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          monthsSet.add(`${y}-${m}`);
        }
      } catch (e) {
        const m = t.date.slice(0, 7).replace(/\//g, "-");
        if (m && m.length === 7) monthsSet.add(m);
      }
    });
    const availableMonths = Array.from(monthsSet).sort().reverse();

    return {
      total,
      thisMonthTotal,
      breakdown,
      records: filteredRecords,
      filteredTotal,
      allRecords,
      availableMonths,
    };
  }, [transfers, incomeFilterMonth]);

  return {
    incomeFilterMonth,
    navigateMonth,
    incomeSourceHistory,
    extraIncomeStats,
  };
};
