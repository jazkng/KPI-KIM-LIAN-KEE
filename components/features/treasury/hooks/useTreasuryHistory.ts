import { useState, useMemo } from "react";
import { LedgerItem } from "../treasuryTypes";
import {
  generateMonthsRange,
  formatMoney,
  buildLedgerCsv,
  downloadCsv,
} from "../treasuryUtils";

interface UseTreasuryHistoryArgs {
  fetchMonthlyLedger: (
    monthStr: string,
    rangeOverride?: { start: string; end: string },
  ) => Promise<LedgerItem[]>;
  initialDate?: string;
}

/**
 * 资金管理 — 历史账本档案馆 & 区间对账导出
 *
 * ⚠️ 逻辑与原本 TreasuryModule.tsx 内的实作完全一致，只是搬迁位置。
 */
export const useTreasuryHistory = ({
  fetchMonthlyLedger,
  initialDate,
}: UseTreasuryHistoryArgs) => {
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [historyRecords, setHistoryRecords] = useState<LedgerItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [, setHistoryStats] = useState({ totalIn: 0, totalOut: 0 });
  const [historyAccountFilter, setHistoryAccountFilter] = useState<
    "ALL" | "CASH" | "BANK"
  >("ALL");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyActiveFlow, setHistoryActiveFlow] = useState<
    "ALL" | "IN" | "OUT"
  >("ALL");

  const filteredHistoryRecords = useMemo(() => {
    let list = historyRecords;
    if (historyAccountFilter !== "ALL") {
      list = list.filter((item) => item.account === historyAccountFilter);
    }
    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const descWithCategoryAndTag =
          `${item.desc || ""} ${item.category || ""} ${item.tag || ""}`.toLowerCase();
        const descMatch = descWithCategoryAndTag.includes(q);
        const amountMatch =
          item.amount?.toString().includes(q) ||
          item.amount?.toFixed(2).includes(q);
        return descMatch || amountMatch;
      });
    }
    return list;
  }, [historyRecords, historyAccountFilter, historySearchQuery]);

  const dynamicHistoryStats = useMemo(() => {
    let tIn = 0;
    let tOut = 0;
    filteredHistoryRecords.forEach((itm) => {
      if (itm.type === "IN") tIn += itm.amount;
      else tOut += itm.amount;
    });
    return { totalIn: tIn, totalOut: tOut };
  }, [filteredHistoryRecords]);

  const inHistory = useMemo(
    () => filteredHistoryRecords.filter((item) => item.type === "IN"),
    [filteredHistoryRecords],
  );

  const outHistory = useMemo(
    () => filteredHistoryRecords.filter((item) => item.type === "OUT"),
    [filteredHistoryRecords],
  );

  // 🟢 核心功能：按月精准拉取历史数据 (绝对防计费爆炸)
  const fetchHistoryData = async (monthStr: string) => {
    setIsHistoryLoading(true);
    try {
      const dedupedItems = await fetchMonthlyLedger(monthStr);
      let tIn = 0;
      let tOut = 0;
      dedupedItems.forEach((itm) => {
        if (itm.type === "IN") tIn += itm.amount;
        else tOut += itm.amount;
      });

      setHistoryRecords(dedupedItems);
      setHistoryStats({ totalIn: tIn, totalOut: tOut });
    } catch (e) {
      console.error(e);
      alert("查询失败");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setIsHistoryModalOpen(false);
    setHistoryRecords([]);
    setHistorySearchQuery("");
    setHistoryAccountFilter("ALL");
    setHistoryActiveFlow("ALL");
  };

  // 👑 区间对账导出：一次导出任意日期区间的流水 CSV (只读，不修改任何资料)
  const handleExportRangeCsv = async (account: "CASH" | "BANK") => {
    const start = prompt(
      `【${account} 区间对账导出】第 1 步\n\n请输入开始日期 (YYYY-MM-DD)：`,
      initialDate || "2025-11-01",
    );
    if (start === null) return;

    const end = prompt(
      `【${account} 区间对账导出】第 2 步\n\n请输入结束日期 (YYYY-MM-DD)：`,
      new Date().toISOString().split("T")[0],
    );
    if (end === null) return;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(start.trim()) || !dateRe.test(end.trim())) {
      alert("❌ 日期格式必须是 YYYY-MM-DD，例如 2025-11-01");
      return;
    }
    if (start.trim() > end.trim()) {
      alert("❌ 开始日期不能晚于结束日期。");
      return;
    }

    const months = generateMonthsRange(
      start.trim().slice(0, 7),
      end.trim().slice(0, 7),
    );

    if (
      !confirm(
        `⚠️ 即将导出 ${start.trim()} 至 ${end.trim()} 的 ${account} 流水，共跨越 ${months.length} 个月。\n\n` +
          `💰 这会重新读取这段期间的历史资料，产生 Firestore 读取费用 (一次性，金额很小)。\n` +
          `🔒 此操作只读取资料，不会修改、删除任何账目。\n\n` +
          `确定要继续吗？`,
      )
    )
      return;

    setIsHistoryLoading(true);
    try {
      const ledger = await fetchMonthlyLedger("", {
        start: start.trim(),
        end: end.trim(),
      });
      const scoped = ledger.filter((i) => (i.account || "BANK") === account);
      const { csv, count, totalIn, totalOut } = buildLedgerCsv(scoped, account);

      if (!count) {
        alert("这段期间没有找到任何流水记录。");
        return;
      }

      downloadCsv(csv, `${account}_Ledger_${start.trim()}_to_${end.trim()}.csv`);
      alert(
        `✅ 导出成功！\n\n` +
          `共 ${count} 笔记录\n` +
          `流入 ${formatMoney(totalIn)}\n` +
          `流出 ${formatMoney(totalOut)}\n` +
          `净额 ${formatMoney(totalIn - totalOut)}`,
      );
    } catch (e) {
      console.error("Range export error", e);
      alert("导出失败，请检查网络后再试。");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  return {
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    historyMonth,
    setHistoryMonth,
    historyRecords,
    isHistoryLoading,
    historyAccountFilter,
    setHistoryAccountFilter,
    historySearchQuery,
    setHistorySearchQuery,
    historyActiveFlow,
    setHistoryActiveFlow,
    filteredHistoryRecords,
    dynamicHistoryStats,
    inHistory,
    outHistory,
    fetchHistoryData,
    closeHistoryModal,
    handleExportRangeCsv,
  };
};
