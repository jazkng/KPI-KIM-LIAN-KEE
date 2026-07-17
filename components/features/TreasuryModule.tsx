import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  History,
  Settings,
  X,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Calendar,
  Save,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowRight,
  UserPlus,
  Users,
  Wrench,
  PiggyBank,
  FileText,
  MinusCircle,
  Info,
  Calculator,
  Download,
  Zap,
  Droplets,
  Home,
  Coins,
  Recycle,
  FileDown,
  Loader2,
  ScrollText,
  Table2,
  ChevronDown,
  ChevronUp,
  Clock,
  Circle,
  LayoutList,
  Archive,
  Gem,
  Printer,
  ExternalLink,
  Search,
  Lock,
  Edit3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  TreasuryConfig,
  FundTransfer,
  SettlementRecord,
  ExpenseItem,
  BillPaymentRecord,
  Shareholder,
  LedgerItem,
  MonthlyClosing,
  TreasuryTab,
} from "./treasury/treasuryTypes";
import { DataManager } from "../../utils/dataManager";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { applyResolvedStylesForPdf } from "../../utils/pdfStyleResolver";

import {
  SETTINGS_PASSWORD,
  SHAREHOLDER_OWNER_MAP,
  DEFAULT_INCOME_SOURCES,
} from "./treasury/treasuryConstants";
import {
  generateMonthsRange,
  formatMoney,
  formatDate,
  getMonthLabel,
  getPreviousMonth,
  getNextMonth,
  normalizeShareholderName,
  cleanTransactionNote,
  calculatePercentage,
} from "./treasury/treasuryUtils";
import { TreasuryShell } from "./treasury/TreasuryShell";
import { TreasuryHeader } from "./treasury/components/TreasuryHeader";
import { TreasuryMobileTabs } from "./treasury/components/TreasuryMobileTabs";
import { TreasuryMonthSelector } from "./treasury/components/TreasuryMonthSelector";
import { TreasuryBalanceHero } from "./treasury/components/TreasuryBalanceHero";
import { TreasuryAccountCard } from "./treasury/components/TreasuryAccountCard";
import { TreasuryQuickActions } from "./treasury/components/TreasuryQuickActions";
import { TreasurySectionHeader } from "./treasury/components/TreasurySectionHeader";

// Import modular components for modals & tabs
import { TreasuryTransferModal } from "./treasury/modals/TreasuryTransferModal";
import { TreasuryIncomeModal } from "./treasury/modals/TreasuryIncomeModal";
import { TreasuryShareholderModal } from "./treasury/modals/TreasuryShareholderModal";
import { TreasuryInjectionModal } from "./treasury/modals/TreasuryInjectionModal";
import { TreasuryRepaymentModal } from "./treasury/modals/TreasuryRepaymentModal";
import { TreasuryDividendModal } from "./treasury/modals/TreasuryDividendModal";
import { TreasuryExpenseModal } from "./treasury/modals/TreasuryExpenseModal";
import { TreasuryLedgerModal } from "./treasury/modals/TreasuryLedgerModal";
import { TreasuryTransfersTab } from "./treasury/tabs/TreasuryTransfersTab";
import { TreasuryExtraIncomeTab } from "./treasury/tabs/TreasuryExtraIncomeTab";
import { TreasuryEquityTab } from "./treasury/tabs/TreasuryEquityTab";
import { TreasurySettingsTab } from "./treasury/tabs/TreasurySettingsTab";

interface TreasuryModuleProps {
  onClose: () => void;
}

// 🌟 新增：智能折叠列表项组件 (在手机端适配单行极简高密风格，防止视觉杂乱)
const GroupedLedgerItem = ({ group }: { group: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSingle = group.items.length === 1;
  const mainItem = group.items[0];

  return (
    <div className="bg-white rounded-xl md:rounded-none shadow-sm md:shadow-none border border-gray-150 md:border-b md:border-t-0 md:border-x-0 overflow-hidden flex flex-col transition-all">
      {/* --- MOBILE COMPACT VIEW (md:hidden) --- */}
      <div
        onClick={() => !isSingle && setIsExpanded(!isExpanded)}
        className="p-2.5 flex md:hidden items-center justify-between gap-3 active:bg-gray-100 transition-colors cursor-pointer select-none"
      >
        <div className="min-w-0 flex-1 flex items-start gap-2">
          {/* Status Dot / Flag */}
          <span
            className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${group.type === "IN" ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]"}`}
          />

          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-xs text-stone-900 truncate leading-tight flex items-center gap-1.5 flex-wrap">
              <span className="truncate max-w-[160px]">{group.baseDesc}</span>
              {!isSingle && (
                <span className="text-[8px] bg-orange-100 text-orange-850 px-1 py-0.2 rounded font-black shrink-0">
                  合{group.items.length}笔
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[9px] text-stone-400 font-medium mt-0.5">
              <span className="font-mono">{group.date}</span>
              <span>•</span>
              <span className="bg-stone-100 text-stone-600 px-1 rounded-sm text-[8px] font-bold">
                {group.category}
              </span>
              {group.tag && (
                <>
                  <span>•</span>
                  <span className="text-blue-600 font-bold">#{group.tag}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0 flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span
              className={`font-mono font-black text-xs ${group.type === "IN" ? "text-green-600" : "text-red-600"}`}
            >
              {group.type === "IN" ? "+" : "-"}{" "}
              {group.totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          {!isSingle && (
            <ChevronDown
              size={12}
              className={`text-stone-400 transition-transform duration-200 ${isExpanded ? "rotate-180 text-orange-500" : ""}`}
            />
          )}
        </div>
      </div>

      {/* --- DESKTOP VIEW (hidden md:flex) --- */}
      <div
        onClick={() => !isSingle && setIsExpanded(!isExpanded)}
        className={`hidden md:flex flex-col gap-1 px-3 py-2 border-b border-gray-100 transition-colors ${!isSingle ? "cursor-pointer hover:bg-gray-50" : "hover:bg-gray-50"}`}
      >
        {/* LINE 1: Description & Amount */}
        <div className="flex justify-between items-center w-full gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              className="font-extrabold text-stone-900 text-xs truncate"
              title={group.baseDesc}
            >
              {group.baseDesc}
            </span>
            {!isSingle && (
              <span className="text-[8px] bg-orange-100 text-orange-850 px-1 py-0.2 rounded font-black shrink-0">
                合{group.items.length}笔
              </span>
            )}
            {isSingle && mainItem.linkUrl && (
              <a
                href={mainItem.linkUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[8px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-1 py-0.2 rounded flex items-center gap-0.5 font-bold transition-all border border-indigo-100 shrink-0"
              >
                <ExternalLink size={8} strokeWidth={3} /> 单据
              </a>
            )}
          </div>

          <div className="shrink-0 text-right font-mono font-black text-xs">
            <span
              className={
                group.type === "IN" ? "text-green-600" : "text-red-600"
              }
            >
              {group.type === "IN" ? "+" : "-"}{" "}
              {group.totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* LINE 2: Badges/Meta & Balance */}
        <div className="flex justify-between items-center w-full gap-2 text-[10px]">
          <div className="flex flex-wrap items-center gap-1.5 text-stone-400 font-semibold min-w-0">
            {/* Type badge */}
            <span
              className={`px-1 py-0.2 rounded text-[8px] font-black border leading-none ${group.type === "IN" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}
            >
              {group.type}
            </span>
            <span className="font-mono text-stone-500 text-[9px]">
              {group.date}
            </span>
            {group.category && (
              <>
                <span>•</span>
                <span className="bg-stone-100 text-stone-600 px-1 rounded-sm text-[8px] font-bold">
                  {group.category}
                </span>
              </>
            )}
            {group.tag && (
              <>
                <span>•</span>
                <span className="text-blue-600 text-[8px] font-bold bg-blue-50 px-1 rounded-sm border border-blue-100">
                  #{group.tag}
                </span>
              </>
            )}
          </div>

          <div className="shrink-0 text-right font-mono text-[10px] text-stone-500 flex items-center gap-1">
            {!isSingle && (
              <ChevronDown
                size={11}
                className={`text-stone-450 transition-transform ${isExpanded ? "rotate-180 text-orange-500" : ""}`}
              />
            )}
          </div>
        </div>
      </div>

      {!isSingle && isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/80 p-1.5 md:p-2 md:pl-10 space-y-1 animate-in slide-in-from-top-1 shadow-inner">
          {group.items.map((item: any, idx: number) => (
            <div
              key={item.id}
              className="flex justify-between items-center bg-white py-1 px-2.5 rounded-lg border border-gray-150 shadow-xs hover:border-gray-250 transition-colors"
            >
              <div className="text-[10px] md:text-xs text-gray-500 font-bold flex items-center gap-2 pr-2 pr-2 overflow-hidden">
                <span className="bg-[#1A1A1A] text-[#FFD700] rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] shrink-0">
                  {idx + 1}
                </span>
                <span className="truncate">{item.desc}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`font-mono font-bold text-[10px] md:text-xs ${item.type === "IN" ? "text-green-500" : "text-red-500"}`}
                >
                  {item.type === "IN" ? "+" : "-"} RM{" "}
                  {item.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LedgerModal = () => null;
const DeletedLedgerModalBody = "";

export const TreasuryModule: React.FC<TreasuryModuleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TreasuryTab>("OVERVIEW");
  const [config, setConfig] = useState<TreasuryConfig>({
    initialDate: new Date().toISOString().split("T")[0],
    initialCash: 0,
    initialBank: 0,
    shareholders: [],
  });
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [billPayments, setBillPayments] = useState<BillPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewLedger, setViewLedger] = useState<"CASH" | "BANK" | null>(null);

  // --- 👑 月度结账新功能 State ---
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  ); // YYYY-MM
  const [monthlyClosings, setMonthlyClosings] = useState<MonthlyClosing[]>([]);
  const [selectedMonthLedgerItems, setSelectedMonthLedgerItems] = useState<
    LedgerItem[]
  >([]);
  const [isSelectedMonthLoading, setIsSelectedMonthLoading] = useState(false);

  // 👑 历史查询专属 State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [historyRecords, setHistoryRecords] = useState<LedgerItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState({ totalIn: 0, totalOut: 0 });
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

  const inHistory = useMemo(() => {
    return filteredHistoryRecords.filter((item) => item.type === "IN");
  }, [filteredHistoryRecords]);

  const outHistory = useMemo(() => {
    return filteredHistoryRecords.filter((item) => item.type === "OUT");
  }, [filteredHistoryRecords]);

  // 🔐 设置密码锁 State
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [settingsPasswordInput, setSettingsPasswordInput] = useState("");
  const [settingsPasswordError, setSettingsPasswordError] = useState(false);

  const handleSettingsUnlock = () => {
    if (settingsPasswordInput === SETTINGS_PASSWORD) {
      setIsSettingsUnlocked(true);
      setSettingsPasswordError(false);
    } else {
      setSettingsPasswordError(true);
    }
  };

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

  // 📅 额外收入月份过滤 State
  const [incomeFilterMonth, setIncomeFilterMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );

  // 📅 自动切换到有记录的最新月份（如果当前月份没有记录）
  useEffect(() => {
    const allRecords = transfers.filter((t) => t.fromAccount === ("OTHER" as any));
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

  // ✏️ 编辑收入记录 State
  const [editingIncomeRecord, setEditingIncomeRecord] =
    useState<FundTransfer | null>(null);

  // 🟢 核心功能：通用按月精准拉取历史账目明细 (绝对防计费爆炸 + 极速运行)
  const fetchMonthlyLedger = async (
    monthStr: string,
  ): Promise<LedgerItem[]> => {
    const startStr = `${monthStr}-01`;
    const [year, month] = monthStr.split("-");
    const endDay = new Date(Number(year), Number(month), 0).getDate();
    const endStr = `${monthStr}-${endDay}T23:59:59`;

    const [stlSnap, trfSnap, billsSnap, expSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "settlements"),
          where("date", ">=", startStr),
          where("date", "<=", endStr),
        ),
      ),
      getDocs(
        query(
          collection(db, "fund_transfers"),
          where("date", ">=", startStr),
          where("date", "<=", endStr),
        ),
      ),
      getDocs(
        query(
          collection(db, "bill_payments"),
          where("date", ">=", startStr),
          where("date", "<=", endStr),
        ),
      ),
      getDocs(
        query(
          collection(db, "standalone_expenses"),
          where("time", ">=", startStr),
          where("time", "<=", endStr),
        ),
      ),
    ]);

    const items: LedgerItem[] = [];

    stlSnap.docs.forEach((d) => {
      const s = d.data() as SettlementRecord;
      const sCash = Number(s.sales?.cash || 0);

      const bankIncome =
        Number(s.sales?.tng || 0) +
        Number(s.sales?.duitnow || 0) +
        Number(s.sales?.card || 0) +
        Number(s.sales?.amex || 0);
      const bd = s.sales?.deliveryBreakdown || ({} as any);
      const grabExpected =
        (Number(bd.grabNet) || Number(bd.grab) || 0) -
        (Number(bd.grabAds) || 0);
      const deliveryIncome =
        Math.max(0, grabExpected) +
        (Number(bd.pandaGross) || Number(bd.panda) || 0) +
        (Number(bd.shopeeGross) || Number(bd.shopee) || 0) +
        (Number(bd.lalamove) || 0);
      const sBank = bankIncome + deliveryIncome;

      if (sCash > 0) {
        items.push({
          id: `h_c_${s.id}`,
          date: s.date,
          desc: `Cash Sales (现金营业额)`,
          amount: sCash,
          type: "IN",
          category: "SALES",
          account: "CASH",
        });
      }
      if (sBank > 0) {
        items.push({
          id: `h_b_${s.id}`,
          date: s.date,
          desc: `Digital & Delivery Sales (电子/外卖营收)`,
          amount: sBank,
          type: "IN",
          category: "SALES",
          account: "BANK",
        });
      }

      if (s.expenses) {
        s.expenses.forEach((e, idx) => {
          const amt = Number(e.amount) || 0;
          if (amt > 0) {
            const isPaid =
              e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL";
            if (!isPaid) return;

            const isCompanyPaid =
              e.paidBy === "COMPANY" ||
              (e.paymentMethod &&
                !e.paymentMethod.toUpperCase().includes("CASH"));

            if (isCompanyPaid) {
              items.push({
                id: `h_e_${e.id}`,
                date: s.date,
                desc: `[支出] ${e.company} ${e.note ? "- " + e.note : ""}`,
                amount: amt,
                type: "OUT",
                category: e.category,
                account: "BANK",
              });
            } else {
              items.push({
                id: `h_petty_${s.id}_${idx}`,
                date: s.date,
                desc: `[店面垫付] ${e.company} ${e.note ? "- " + e.note : ""}`,
                amount: amt,
                type: "OUT",
                category: e.category || "PETTY_CASH",
                account: "CASH",
              });
            }
          }
        });
      }

      if (s.variance !== undefined && s.variance !== 0) {
        items.push({
          id: `h_var_${s.id}`,
          date: s.date,
          desc: `[现金误差] ${s.varianceReason || ""}`,
          amount: Math.abs(s.variance),
          type: s.variance > 0 ? "IN" : "OUT",
          category: "ADJUSTMENT",
          account: "CASH",
        });
      } else if (s.variance === undefined && s.closingCash === undefined) {
        const refundAmt = Number(s.sales?.refundTotal || 0);
        if (refundAmt > 0) {
          items.push({
            id: `h_ref_${s.id}`,
            date: s.date,
            desc: `[销售退款]`,
            amount: refundAmt,
            type: "OUT",
            category: "REFUND",
            account: "CASH",
          });
        }
      }
    });

    trfSnap.docs.forEach((d) => {
      const t = d.data() as FundTransfer;
      if (
        t.fromAccount === ("SHAREHOLDER" as any) ||
        t.fromAccount === ("OTHER" as any)
      ) {
        const recAccount = t.toAccount === "CASH" ? "CASH" : "BANK";
        const label =
          t.fromAccount === ("SHAREHOLDER" as any)
            ? "股东向店铺注资"
            : "店铺额外收益";
        items.push({
          id: `h_t_${t.id}`,
          date: t.date.split("T")[0],
          desc: t.note ? `${label} (${t.note})` : label,
          amount: t.amount,
          type: "IN",
          category: "TRANSFER",
          account: recAccount,
        });
      } else {
        if (t.fromAccount === "CASH" || t.fromAccount === "BANK") {
          items.push({
            id: `h_t_out_${t.id}`,
            date: t.date.split("T")[0],
            desc: `[转账流出] ${t.note ? `(${t.note})` : ""}`,
            amount: t.amount,
            type: "OUT",
            category: "TRANSFER",
            account: t.fromAccount,
          });
        }
        if (t.toAccount === "CASH" || t.toAccount === "BANK") {
          items.push({
            id: `h_t_in_${t.id}`,
            date: t.date.split("T")[0],
            desc: `[转账存入] ${t.note ? `(${t.note})` : ""}`,
            amount: t.amount,
            type: "IN",
            category: "TRANSFER",
            account: t.toAccount,
          });
        }
      }
    });

    billsSnap.docs.forEach((d) => {
      const b = d.data() as BillPaymentRecord;
      const isCashBill = b.method === "CASH";
      items.push({
        id: `h_b_${b.id}`,
        date: b.date.split("T")[0],
        desc: `[账单] ${b.name}`,
        amount: Number(b.amount),
        type: "OUT",
        category: b.category,
        account: isCashBill ? "CASH" : "BANK",
      });
    });

    expSnap.docs.forEach((d) => {
      const e = d.data() as ExpenseItem;
      if (e.id.startsWith("bill_sync_") || e.expenseType === "RECURRING")
        return;

      if (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL") {
        const dDate = e.time?.split("T")[0] || "";
        const isCashExp = (e.paymentMethod || "BANK_TRANSFER")
          .toUpperCase()
          .includes("CASH");
        items.push({
          id: `h_e_${e.id}`,
          date: dDate,
          desc: `[支出] ${e.company} ${e.note ? "- " + e.note : ""}`,
          amount: Number(e.amount),
          type: "OUT",
          category: e.category,
          account: isCashExp ? "CASH" : "BANK",
        });
      }
    });

    const uniqueMap = new Map<string, LedgerItem>();
    items.forEach((itm) => {
      const existing = uniqueMap.get(itm.id);
      if (!existing) {
        uniqueMap.set(itm.id, itm);
      } else if (
        itm.category !== "PETTY_CASH" &&
        existing.category === "PETTY_CASH"
      ) {
        uniqueMap.set(itm.id, itm);
      }
    });
    const dedupedItems = Array.from(uniqueMap.values());
    dedupedItems.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return dedupedItems;
  };

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

  // 🟢 核心功能：拉取当前选定月份的实时流水账目
  const loadSelectedMonthLedger = async (monthStr: string) => {
    setIsSelectedMonthLoading(true);
    try {
      const ledger = await fetchMonthlyLedger(monthStr);
      setSelectedMonthLedgerItems(ledger);
    } catch (e) {
      console.error("Error loading selected month ledger", e);
    } finally {
      setIsSelectedMonthLoading(false);
    }
  };

  const printRef = useRef<HTMLDivElement>(null);
  const [printingRecord, setPrintingRecord] = useState<FundTransfer | null>(
    null,
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<Partial<FundTransfer>>({
    amount: 0,
    fromAccount: "CASH",
    toAccount: "BANK",
    type: "DEPOSIT",
    date: new Date().toISOString().split("T")[0],
  });

  const [isShareholderFormOpen, setIsShareholderFormOpen] = useState(false);
  const [shareholderForm, setShareholderForm] = useState<Partial<Shareholder>>({
    name: "",
    investmentAmount: 0,
    equityPercentage: 0,
  });

  const [isInjectionModalOpen, setIsInjectionModalOpen] = useState(false);
  const [injectionForm, setInjectionForm] = useState({
    shareholderName: "",
    amount: "",
    toAccount: "BANK",
    date: new Date().toISOString().split("T")[0],
    note: "",
  });

  const [isDividendModalOpen, setIsDividendModalOpen] = useState(false);
  const [dividendForm, setDividendForm] = useState({
    dividendMonth: new Date().toISOString().slice(0, 7),
    shareholderId: "",
    amount: "",
    paymentMethod: "BANK_TRANSFER",
    date: new Date().toISOString().split("T")[0],
    note: "",
  });

  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [repaymentForm, setRepaymentForm] = useState({
    shareholderId: "",
    amount: "",
    fromAccount: "BANK",
    date: new Date().toISOString().split("T")[0],
    note: "",
  });

  const [expandedInjections, setExpandedInjections] = useState<
    Record<string, boolean>
  >({});
  const [expandedDividends, setExpandedDividends] = useState<
    Record<string, boolean>
  >({});

  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState({
    source: "",
    category: "ELECTRICITY",
    amount: "",
    toAccount: "CASH",
    date: new Date().toISOString().split("T")[0],
    note: "",
  });

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<Partial<ExpenseItem>>({
    category: "RENOVATION",
    amount: 0,
    company: "",
    note: "",
    paymentStatus: "PAID",
    paymentMethod: "BANK_TRANSFER",
    time: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const cfg = await DataManager.getTreasuryConfig();
      if (cfg) setConfig(cfg);

      const startDateStr = cfg ? cfg.initialDate : "2020-01-01";

      const [stlSnap, trfSnap, billsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "settlements"),
            where("date", ">=", startDateStr),
          ),
        ),
        getDocs(collection(db, "fund_transfers")),
        getDocs(collection(db, "bill_payments")),
      ]);

      const stl = stlSnap.docs.map((d) => d.data() as SettlementRecord);
      const trf = trfSnap.docs
        .map((d) => d.data() as FundTransfer)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      const bills = billsSnap.docs.map((d) => d.data() as BillPaymentRecord);

      setSettlements(stl);
      setTransfers(trf);
      setBillPayments(bills);
      loadExpenses(stl, bills);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async (
    fullSettlements: SettlementRecord[] = settlements,
    currentBills: BillPaymentRecord[] = billPayments,
  ) => {
    try {
      const allExp: ExpenseItem[] = [];

      const qExpenses = collection(db, "standalone_expenses");
      const snap = await getDocs(qExpenses);
      snap.forEach((doc) => allExp.push(doc.data() as ExpenseItem));

      // Extract nested expenses from daily settlements
      fullSettlements.forEach((s) => {
        if (s.expenses) {
          s.expenses.forEach((e) => {
            allExp.push({ ...e, settlementId: s.id });
          });
        }
      });

      // Merge and dedup by id (giving preference to PAID/PARTIAL or most updated entries)
      const uniqueMap = new Map<string, ExpenseItem>();
      allExp.forEach((item) => {
        const existing = uniqueMap.get(item.id);
        if (
          !existing ||
          item.paymentStatus === "PAID" ||
          item.paymentStatus === "PARTIAL"
        ) {
          uniqueMap.set(item.id, item);
        }
      });
      const uniqueExp = Array.from(uniqueMap.values());

      const billExpenses: ExpenseItem[] = currentBills.map((b) => ({
        id: b.id,
        category: b.category,
        expenseType: "RECURRING",
        company: b.name,
        amount: Number(b.amount) || 0,
        note: b.referenceNo ? `[Bill] ${b.referenceNo}` : "[Bill Payment]",
        time: `${b.date}T12:00:00`,
        paymentMethod: b.method,
        paymentStatus: "PAID",
      }));

      const combined = [...uniqueExp, ...billExpenses];
      combined.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      );
      setExpenses(combined);
    } catch (e) {
      console.error("Expense load error", e);
    }
  };

  // --- 👑 月度结账新功能 Functions ---
  const loadClosings = async () => {
    try {
      const snap = await getDocs(collection(db, "treasury_monthly_closings"));
      const closings = snap.docs.map((d) => d.data() as MonthlyClosing);
      setMonthlyClosings(closings);
    } catch (e) {
      console.error("Failed to load monthly closings", e);
    }
  };

  const handleMonthShift = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    let year = y;
    let month = m + delta;
    if (month < 1) {
      month = 12;
      year--;
    } else if (month > 12) {
      month = 1;
      year++;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, "0")}`);
  };

  useEffect(() => {
    loadClosings();
  }, []);

  useEffect(() => {
    loadSelectedMonthLedger(selectedMonth);
  }, [selectedMonth]);

  const selectedMonthClosing = useMemo(() => {
    return monthlyClosings.find(
      (c) => c.month === selectedMonth && c.status === "CLOSED",
    );
  }, [monthlyClosings, selectedMonth]);

  const realtimeMonthlySummary = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let bankIn = 0;
    let bankOut = 0;

    selectedMonthLedgerItems.forEach((itm) => {
      if (itm.account === "CASH") {
        if (itm.type === "IN") cashIn += itm.amount;
        else cashOut += itm.amount;
      } else if (itm.account === "BANK") {
        if (itm.type === "IN") bankIn += itm.amount;
        else bankOut += itm.amount;
      }
    });

    return { cashIn, cashOut, bankIn, bankOut };
  }, [selectedMonthLedgerItems]);

  const activeBalances = useMemo(() => {
    // Find all closed months before selectedMonth, sorted descending
    const closedBefore = monthlyClosings
      .filter((c) => c.month < selectedMonth && c.status === "CLOSED")
      .sort((a, b) => b.month.localeCompare(a.month));

    let cashStart = Number(config.initialCash) || 0;
    let bankStart = Number(config.initialBank) || 0;
    let startMonthLabel = `Checkpoint (期初) ${config.initialDate}`;
    let gapStartStr = config.initialDate || "2020-01-01";

    if (closedBefore.length > 0) {
      const lastClosed = closedBefore[0];
      cashStart = lastClosed.cashEnd;
      bankStart = lastClosed.bankEnd;
      startMonthLabel = `延续自上一个结算月 【${lastClosed.month}】`;

      const [lcY, lcM] = lastClosed.month.split("-");
      let nextM = Number(lcM) + 1;
      let nextY = Number(lcY);
      if (nextM > 12) {
        nextM = 1;
        nextY++;
      }
      gapStartStr = `${nextY}-${nextM.toString().padStart(2, "0")}-01`;
    }

    const gapEndStr = `${selectedMonth}-00`; // Before the 1st of selectedMonth

    if (gapStartStr < gapEndStr) {
      let gapCIn = 0,
        gapCOut = 0,
        gapBIn = 0,
        gapBOut = 0;

      settlements.forEach((s) => {
        if (s.date >= gapStartStr && s.date <= gapEndStr) {
          const sCash = Number(s.sales?.cash || 0);
          const bankIncome =
            Number(s.sales?.tng || 0) +
            Number(s.sales?.duitnow || 0) +
            Number(s.sales?.card || 0) +
            Number(s.sales?.amex || 0);
          const bd = s.sales?.deliveryBreakdown || ({} as any);
          const grabExpected =
            (Number(bd.grabNet) || Number(bd.grab) || 0) -
            (Number(bd.grabAds) || 0);
          const deliveryIncome =
            Math.max(0, grabExpected) +
            (Number(bd.pandaGross) || Number(bd.panda) || 0) +
            (Number(bd.shopeeGross) || Number(bd.shopee) || 0) +
            (Number(bd.lalamove) || 0);
          const sBank = bankIncome + deliveryIncome;

          if (sCash > 0) gapCIn += sCash;
          if (sBank > 0) gapBIn += sBank;

          if (s.expenses) {
            s.expenses.forEach((e) => {
              const amt = Number(e.amount) || 0;
              if (
                amt > 0 &&
                (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL")
              ) {
                const isCompanyPaid =
                  e.paidBy === "COMPANY" ||
                  (e.paymentMethod &&
                    !e.paymentMethod.toUpperCase().includes("CASH"));
                if (isCompanyPaid) gapBOut += amt;
                else gapCOut += amt;
              }
            });
          }

          if (s.variance !== undefined && s.variance !== 0) {
            if (s.variance > 0) gapCIn += s.variance;
            else gapCOut += Math.abs(s.variance);
          } else if (s.variance === undefined && s.closingCash === undefined) {
            const refundAmt = Number(s.sales?.refundTotal || 0);
            if (refundAmt > 0) gapCOut += refundAmt;
          }
        }
      });

      transfers.forEach((t) => {
        const d = t.date.split("T")[0];
        if (d >= gapStartStr && d <= gapEndStr) {
          if (
            t.fromAccount === ("SHAREHOLDER" as any) ||
            t.fromAccount === ("OTHER" as any)
          ) {
            if (t.toAccount === "CASH") gapCIn += t.amount;
            else gapBIn += t.amount;
          } else {
            if (t.fromAccount === "CASH") gapCOut += t.amount;
            if (t.fromAccount === "BANK") gapBOut += t.amount;
            if (t.toAccount === "CASH") gapCIn += t.amount;
            if (t.toAccount === "BANK") gapBIn += t.amount;
          }
        }
      });

      billPayments.forEach((b) => {
        const d = b.date.split("T")[0];
        if (d >= gapStartStr && d <= gapEndStr) {
          if (b.method === "CASH") gapCOut += Number(b.amount);
          else gapBOut += Number(b.amount);
        }
      });

      expenses.forEach((e) => {
        if (
          e.id.startsWith("bill_sync_") ||
          e.expenseType === "RECURRING" ||
          e.settlementId
        )
          return;
        const dDate = e.time?.split("T")[0] || "";
        if (dDate >= gapStartStr && dDate <= gapEndStr) {
          if (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL") {
            const isCashExp = (e.paymentMethod || "BANK_TRANSFER")
              .toUpperCase()
              .includes("CASH");
            if (isCashExp) gapCOut += Number(e.amount);
            else gapBOut += Number(e.amount);
          }
        }
      });

      cashStart = cashStart + gapCIn - gapCOut;
      bankStart = bankStart + gapBIn - gapBOut;
    }

    // If the selected month itself is already closed, load the locked values!
    if (selectedMonthClosing) {
      return {
        cashStart: selectedMonthClosing.cashStart,
        cashIn: selectedMonthClosing.cashIn,
        cashOut: selectedMonthClosing.cashOut,
        cashEnd: selectedMonthClosing.cashEnd,
        bankStart: selectedMonthClosing.bankStart,
        bankIn: selectedMonthClosing.bankIn,
        bankOut: selectedMonthClosing.bankOut,
        bankEnd: selectedMonthClosing.bankEnd,
        total: selectedMonthClosing.cashEnd + selectedMonthClosing.bankEnd,
        isClosed: true,
        startMonthLabel,
      };
    }

    // Otherwise compute dynamically from realtime ledger items
    const cashEnd =
      cashStart +
      realtimeMonthlySummary.cashIn -
      realtimeMonthlySummary.cashOut;
    const bankEnd =
      bankStart +
      realtimeMonthlySummary.bankIn -
      realtimeMonthlySummary.bankOut;

    return {
      cashStart,
      cashIn: realtimeMonthlySummary.cashIn,
      cashOut: realtimeMonthlySummary.cashOut,
      cashEnd,
      bankStart,
      bankIn: realtimeMonthlySummary.bankIn,
      bankOut: realtimeMonthlySummary.bankOut,
      bankEnd,
      total: cashEnd + bankEnd,
      isClosed: false,
      startMonthLabel,
    };
  }, [
    selectedMonth,
    selectedMonthClosing,
    realtimeMonthlySummary,
    monthlyClosings,
    config,
    settlements,
    transfers,
    billPayments,
    expenses,
  ]);

  const handleCloseMonth = async () => {
    if (
      !confirm(
        `⚠️ 确认对 【${getMonthLabel(selectedMonth)}】 进行资金月度结算锁账 (Close & Lock Month) 吗？\n\n` +
          `📊 结账数据快照：\n` +
          `💵 现金: 期初 ${formatMoney(activeBalances.cashStart)} + 存入 ${formatMoney(activeBalances.cashIn)} - 支出 ${formatMoney(activeBalances.cashOut)} = 期末结余 ${formatMoney(activeBalances.cashEnd)}\n` +
          `🏦 银行: 期初 ${formatMoney(activeBalances.bankStart)} + 存入 ${formatMoney(activeBalances.bankIn)} - 支出 ${formatMoney(activeBalances.bankOut)} = 期末结余 ${formatMoney(activeBalances.bankEnd)}\n\n` +
          `🎯 结账后，期末金额将锁定，并自动作为下一个月的期初余额延续！`,
      )
    )
      return;

    setLoading(true);
    try {
      const closingRecord: MonthlyClosing = {
        id: selectedMonth,
        month: selectedMonth,
        cashStart: activeBalances.cashStart,
        cashIn: activeBalances.cashIn,
        cashOut: activeBalances.cashOut,
        cashEnd: activeBalances.cashEnd,
        bankStart: activeBalances.bankStart,
        bankIn: activeBalances.bankIn,
        bankOut: activeBalances.bankOut,
        bankEnd: activeBalances.bankEnd,
        status: "CLOSED",
        closedAt: new Date().toISOString(),
        closedBy: "MANAGER",
      };

      await setDoc(
        doc(db, "treasury_monthly_closings", selectedMonth),
        closingRecord,
      );
      alert(
        `✅ 【${getMonthLabel(selectedMonth)}】月度结账成功！期末余额已自动作为下月期初开始延续。`,
      );
      await loadClosings();
    } catch (e) {
      console.error(e);
      alert("结账失败，请检查网络！");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockMonth = async () => {
    if (
      !confirm(
        `⚠️ 警告：确定要解锁 【${getMonthLabel(selectedMonth)}】 的账目吗？\n\n` +
          `这会删除该月的结算快照，账目将恢复为【实时计算 (Draft)】。`,
      )
    )
      return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, "treasury_monthly_closings", selectedMonth));
      alert(
        `✅ 【${getMonthLabel(selectedMonth)}】账目已解锁，恢复实时计算状态。`,
      );
      await loadClosings();
    } catch (e) {
      console.error(e);
      alert("解锁失败，请检查网络！");
    } finally {
      setLoading(false);
    }
  };

  const reloadAllData = async () => {
    await loadData();
    await loadClosings();
    await loadSelectedMonthLedger(selectedMonth);
  };

  // --- COMPUTED VALUES ---
  const totalCapital = useMemo(() => {
    return (config.shareholders || []).reduce(
      (acc, s) => acc + s.investmentAmount,
      0,
    );
  }, [config.shareholders]);

  const totalInjections = useMemo(() => {
    return transfers
      .filter((t) => t.fromAccount === ("SHAREHOLDER" as any))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transfers]);

  const dividendHistory = useMemo(() => {
    return expenses.filter((e) => e.category === "DIVIDEND");
  }, [expenses]);

  const incomeSourceHistory = useMemo(() => {
    const historySet = new Set<string>(DEFAULT_INCOME_SOURCES);
    transfers.forEach((t) => {
      if (t.fromAccount === ("OTHER" as any) && t.note?.startsWith("[代收]")) {
        const withoutPrefix = t.note.substring(5);
        const parts = withoutPrefix.split(" - ");
        if (parts.length > 0 && parts[0].trim())
          historySet.add(parts[0].trim());
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

  // --- BALANCE CALCULATION ---
  const balances = useMemo(() => {
    let cash = Number(config.initialCash) || 0;
    let bank = Number(config.initialBank) || 0;
    const startDate = new Date(config.initialDate);

    settlements.forEach((s) => {
      if (new Date(s.date) >= startDate) {
        const sCash = Number(s.sales?.cash || 0);
        const sOpening = Number(s.openingCash || 0);
        const sClosing = Number(s.closingCash || 0);

        cash += sCash;

        if (s.variance !== undefined && s.variance !== 0) {
          cash += Number(s.variance);
        } else if (
          s.variance === undefined &&
          s.closingCash !== undefined &&
          s.openingCash !== undefined
        ) {
          const inferredVariance = sClosing - sOpening - sCash;
          cash += inferredVariance;
        } else if (s.variance === undefined && s.closingCash === undefined) {
          const refundAmt = Number(s.sales?.refundTotal || 0);
          cash -= refundAmt;
        }

        const bankIncome =
          Number(s.sales.tng || 0) +
          Number(s.sales.duitnow || 0) +
          Number(s.sales.card || 0) +
          Number(s.sales.amex || 0);

        const bd = s.sales.deliveryBreakdown || ({} as any);
        const grabNet = Number(bd.grabNet) || Number(bd.grab) || 0;
        const grabAds = Number(bd.grabAds) || 0;
        const grabExpected = grabNet - grabAds;
        const pandaGross = Number(bd.pandaGross) || Number(bd.panda) || 0;
        const shopeeGross = Number(bd.shopeeGross) || Number(bd.shopee) || 0;
        const lalamove = Number(bd.lalamove) || 0;
        const deliveryIncome =
          Math.max(0, grabExpected) + pandaGross + shopeeGross + lalamove;

        bank += bankIncome + deliveryIncome;
      }
    });

    expenses.forEach((e) => {
      if (e.expenseType === "RECURRING") return;
      if (e.id.startsWith("bill_sync_")) return;

      if (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL") {
        const payDateStr =
          e.paymentDate?.split("T")[0] ||
          e.time?.split("T")[0] ||
          (e as any).createdAt?.split("T")[0];
        if (!payDateStr) return;

        const payDate = new Date(payDateStr);
        if (payDate >= startDate) {
          const amt = Number(e.amount) || 0;
          const method = e.paymentMethod
            ? e.paymentMethod.toUpperCase()
            : "BANK_TRANSFER";
          if (method.includes("CASH")) cash -= amt;
          else bank -= amt;
        }
      }
    });

    billPayments.forEach((b) => {
      if (new Date(b.date) >= startDate) {
        const amt = Number(b.amount) || 0;
        const method = b.method ? b.method.toUpperCase() : "BANK_TRANSFER";
        if (method.includes("CASH")) cash -= amt;
        else bank -= amt;
      }
    });

    transfers.forEach((t) => {
      const transferDateStr = t.date?.split("T")[0];
      if (!transferDateStr) return;

      if (new Date(transferDateStr) >= startDate) {
        const amt = Number(t.amount) || 0;
        if (t.fromAccount === "CASH") cash -= amt;
        else if (t.fromAccount === "BANK") bank -= amt;

        if (
          t.fromAccount === ("SHAREHOLDER" as any) ||
          t.fromAccount === ("OTHER" as any)
        ) {
          if (t.toAccount === "CASH") cash += amt;
          else bank += amt;
        } else {
          if (t.toAccount === "CASH") cash += amt;
          else if (t.toAccount === "BANK") bank += amt;
        }
      }
    });

    return { cash, bank, total: cash + bank };
  }, [config, settlements, expenses, billPayments, transfers]);

  // --- LEDGER DATA ---
  const getLedgerData = (type: "CASH" | "BANK") => {
    const items: LedgerItem[] = [];
    const initialAmt =
      type === "CASH" ? activeBalances.cashStart : activeBalances.bankStart;

    items.push({
      id: "init",
      date: `${selectedMonth}-01`,
      desc: `【${getMonthLabel(selectedMonth)}】期初结转余额 (Starting Balance)`,
      amount: initialAmt,
      type: "IN",
      category: "INIT",
      tag: "SETUP",
      sortTime: new Date(`${selectedMonth}-01`).getTime(),
    });

    const monthItems = selectedMonthLedgerItems.filter(
      (itm) => itm.account === type,
    );
    items.push(...monthItems);

    items.sort((a, b) => {
      if (a.category === "INIT") return -1;
      if (b.category === "INIT") return 1;
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timeA - timeB;
    });

    let currentBalance = 0;
    const processedItems = items.map((item) => {
      if (item.id === "init") {
        currentBalance = item.amount;
      } else {
        if (item.type === "IN") currentBalance += item.amount;
        else currentBalance -= item.amount;
      }
      currentBalance = Math.round(currentBalance * 100) / 100;
      return { ...item, balance: currentBalance };
    });

    return processedItems.reverse();
  };

  // --- HANDLERS ---
  const handleSaveConfig = async () => {
    await DataManager.saveTreasuryConfig(config);
    alert("✅ 设置已保存 (Settings Saved)");
    loadData();
  };

  const handleSaveShareholder = async () => {
    if (!shareholderForm.name || !shareholderForm.investmentAmount)
      return alert("Name & Investment Required");
    const newShareholder: Shareholder = {
      id: shareholderForm.id || `sh_${Date.now()}`,
      name: shareholderForm.name,
      investmentAmount: Number(shareholderForm.investmentAmount),
      equityPercentage: Number(shareholderForm.equityPercentage),
      role: shareholderForm.role,
    };
    const currentList = config.shareholders || [];
    const updatedList = shareholderForm.id
      ? currentList.map((s) =>
          s.id === newShareholder.id ? newShareholder : s,
        )
      : [...currentList, newShareholder];
    const newConfig = { ...config, shareholders: updatedList };
    setConfig(newConfig);
    await DataManager.saveTreasuryConfig(newConfig);
    setIsShareholderFormOpen(false);
    setShareholderForm({ name: "", investmentAmount: 0, equityPercentage: 0 });
  };

  const handleDeleteShareholder = async (id: string) => {
    if (
      !confirm(
        "⚠️ 确定要删除该股东吗？\n\n删除后该股东信息将无法在前端参与日后的股份分红、注资核算操作。此操作不可逆，请确认！",
      )
    )
      return;
    const newConfig = {
      ...config,
      shareholders: config.shareholders?.filter((s) => s.id !== id),
    };
    setConfig(newConfig);
    await DataManager.saveTreasuryConfig(newConfig);
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.amount || !expenseForm.company)
      return alert("Please fill amount and details");
    const newExpense: ExpenseItem = {
      id: `exp_${Date.now()}`,
      category: expenseForm.category || "OTHER",
      expenseType: "GENERAL",
      company: expenseForm.company,
      amount: Number(expenseForm.amount),
      note: expenseForm.note || "Manual Entry",
      time: expenseForm.time
        ? `${expenseForm.time}T12:00:00`
        : new Date().toISOString(),
      paymentMethod: expenseForm.paymentMethod || "BANK_TRANSFER",
      paymentStatus: "PAID",
      totalBillAmount: Number(expenseForm.amount),
      outstandingAmount: 0,
    };
    await DataManager.saveStandaloneExpense(newExpense);
    setIsExpenseModalOpen(false);
    setExpenseForm({
      category: "RENOVATION",
      amount: 0,
      company: "",
      note: "",
      paymentMethod: "BANK_TRANSFER",
      time: new Date().toISOString().split("T")[0],
    });
    alert("✅ 支出已补录 (Expense Recorded)");
    loadExpenses();
  };

  const handleSaveTransfer = async () => {
    if (!transferForm.amount || transferForm.amount <= 0)
      return alert("Enter valid amount");
    const newTransfer: FundTransfer = {
      id: `trf_${Date.now()}`,
      date: transferForm.date || new Date().toISOString(),
      amount: Number(transferForm.amount),
      fromAccount: transferForm.fromAccount as any,
      toAccount: transferForm.toAccount as any,
      type: transferForm.type as any,
      note: transferForm.note,
    };
    await DataManager.saveFundTransfer(newTransfer);
    setTransfers([newTransfer, ...transfers]);
    setIsTransferModalOpen(false);
    alert("✅ 转账记录已保存");
    loadData();
  };

  const handleSaveInjection = async () => {
    if (!injectionForm.shareholderName || !injectionForm.amount)
      return alert("请填写完整信息");
    const newTransfer: FundTransfer = {
      id: `inj_${Date.now()}`,
      date: injectionForm.date,
      amount: parseFloat(injectionForm.amount),
      fromAccount: "SHAREHOLDER" as any,
      toAccount: injectionForm.toAccount as any,
      type: "DEPOSIT",
      note: `[股东注资] ${injectionForm.shareholderName}: ${injectionForm.note || "额外资金"}`,
    };
    await DataManager.saveFundTransfer(newTransfer);
    setTransfers([newTransfer, ...transfers]);
    setIsInjectionModalOpen(false);
    setInjectionForm({
      shareholderName: "",
      amount: "",
      toAccount: "BANK",
      date: new Date().toISOString().split("T")[0],
      note: "",
    });
    alert("✅ 资金注入已记录 (Injection Recorded)");
    loadData();
  };

  // 👑 handleSaveIncome 支持新增 + 编辑模式
  const handleSaveIncome = async () => {
    if (!incomeForm.amount) return alert("请输入金额");

    if (editingIncomeRecord) {
      // 编辑模式：先删除旧记录，再创建新记录
      await DataManager.deleteFundTransfer(editingIncomeRecord.id);
      const updatedTransfer: FundTransfer = {
        id: editingIncomeRecord.id,
        date: incomeForm.date,
        amount: parseFloat(incomeForm.amount),
        fromAccount: "OTHER" as any,
        toAccount: incomeForm.toAccount as any,
        type: "DEPOSIT",
        note: `[代收] ${incomeForm.source} - ${incomeForm.category}${incomeForm.note ? ` (${incomeForm.note})` : ""}`,
      };
      await DataManager.saveFundTransfer(updatedTransfer);
      setEditingIncomeRecord(null);
      setIsIncomeModalOpen(false);
      setIncomeForm({
        source: "",
        category: "ELECTRICITY",
        amount: "",
        toAccount: "CASH",
        date: new Date().toISOString().split("T")[0],
        note: "",
      });
      alert("✅ 收入记录已更新 (Income Updated)");
      loadData();
    } else {
      // 新增模式
      const newTransfer: FundTransfer = {
        id: `inc_${Date.now()}`,
        date: incomeForm.date,
        amount: parseFloat(incomeForm.amount),
        fromAccount: "OTHER" as any,
        toAccount: incomeForm.toAccount as any,
        type: "DEPOSIT",
        note: `[代收] ${incomeForm.source} - ${incomeForm.category}${incomeForm.note ? ` (${incomeForm.note})` : ""}`,
      };
      await DataManager.saveFundTransfer(newTransfer);
      setTransfers([newTransfer, ...transfers]);
      setIsIncomeModalOpen(false);
      setIncomeForm({
        source: "",
        category: "ELECTRICITY",
        amount: "",
        toAccount: "CASH",
        date: new Date().toISOString().split("T")[0],
        note: "",
      });
      alert("✅ 代收收入已记录 (Income Recorded)");
      loadData();
    }
  };

  // 👑 编辑收入记录：解析 note 回填表单
  const handleEditIncome = (record: FundTransfer) => {
    const cleanNote = record.note?.replace("[代收] ", "") || "";
    const dashIndex = cleanNote.indexOf(" - ");
    const source =
      dashIndex > -1 ? cleanNote.substring(0, dashIndex) : cleanNote;
    let category = "OTHER";
    let noteText = "";
    if (dashIndex > -1) {
      const afterDash = cleanNote.substring(dashIndex + 3);
      // 尝试提取 category 和 note
      const parenMatch = afterDash.match(/^(.+?)\s*\((.+)\)$/);
      if (parenMatch) {
        category = parenMatch[1].trim();
        noteText = parenMatch[2].trim();
      } else {
        category = afterDash.trim();
      }
    }

    setEditingIncomeRecord(record);
    setIncomeForm({
      source: source,
      category: category,
      amount: String(record.amount),
      toAccount: record.toAccount as string,
      date: record.date.split("T")[0],
      note: noteText,
    });
    setIsIncomeModalOpen(true);
  };

  const handleDeleteTransfer = async (id: string) => {
    if (
      !confirm(
        "⚠️ 确定要彻底删除此笔资金记录/转账日志吗？\n\n删除后系统该笔账目将被永久移除并自动重新校准总资产流，此操作不可撤消，请确认！",
      )
    )
      return;
    await DataManager.deleteFundTransfer(id);
    setTransfers(transfers.filter((t) => t.id !== id));
    loadData();
  };

  const handleGenerateReceipt = async (record: FundTransfer) => {
    if (isGeneratingPdf) return;
    setPrintingRecord(record);
    setIsGeneratingPdf(true);
    setTimeout(async () => {
      if (!printRef.current) return;
      try {
        const canvas = await html2canvas(printRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.getElementById('treasury-receipt-export-root');
            if (printRef.current && clonedEl) {
              applyResolvedStylesForPdf(printRef.current as HTMLElement, clonedEl as HTMLElement);
            }
          }
        });
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const pdf = new jsPDF("p", "mm", "a5");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Receipt_${record.date}_${record.id.slice(-4)}.pdf`);
      } catch (err) {
        console.error("PDF Gen Error:", err);
        alert("生成收据失败 (Failed to generate PDF)");
      } finally {
        setIsGeneratingPdf(false);
        setPrintingRecord(null);
      }
    }, 800);
  };

  const handleSaveDividend = async () => {
    if (!dividendForm.shareholderId || !dividendForm.amount)
      return alert("Please fill all fields");
    const sh = config.shareholders?.find(
      (s) => s.id === dividendForm.shareholderId,
    );
    const companyName = sh ? sh.name : "Unknown";

    const monthStr = dividendForm.dividendMonth
      ? `[${dividendForm.dividendMonth}分红]`
      : "[股东分红]";

    const newExpense: ExpenseItem = {
      id: `div_${Date.now()}`,
      category: "DIVIDEND",
      expenseType: "GENERAL",
      company: companyName,
      amount: parseFloat(dividendForm.amount),
      paymentStatus: "PAID",
      paymentMethod: dividendForm.paymentMethod as any,
      time: `${dividendForm.date}T12:00:00`,
      note: `${monthStr} ${dividendForm.note || "Dividend Payout"}`,
      paidBy: "COMPANY",
    };

    await DataManager.saveStandaloneExpense(newExpense);
    setExpenses([newExpense, ...expenses]);
    setIsDividendModalOpen(false);
    setDividendForm({
      dividendMonth: new Date().toISOString().slice(0, 7),
      shareholderId: "",
      amount: "",
      paymentMethod: "BANK_TRANSFER",
      date: new Date().toISOString().split("T")[0],
      note: "",
    });
    alert("✅ 分红已记录并扣除 (Dividend Recorded)");
    loadData();
  };

  const handleSaveRepayment = async () => {
    if (!repaymentForm.shareholderId || !repaymentForm.amount)
      return alert("Please fill all fields");
    const sh = config.shareholders?.find(
      (s) => s.id === repaymentForm.shareholderId,
    );
    const name = sh ? sh.name : "Unknown";

    const newTransfer: FundTransfer = {
      id: `trf_${Date.now()}`,
      date: repaymentForm.date,
      amount: parseFloat(repaymentForm.amount),
      fromAccount: repaymentForm.fromAccount as any,
      toAccount: "SHAREHOLDER" as any,
      type: "WITHDRAWAL",
      note: `[还钱给股东] ${name}: ${repaymentForm.note || "Repayment"}`,
    };

    await DataManager.saveFundTransfer(newTransfer);
    setTransfers([newTransfer, ...transfers]);
    setIsRepaymentModalOpen(false);
    setRepaymentForm({
      shareholderId: "",
      amount: "",
      fromAccount: "BANK",
      date: new Date().toISOString().split("T")[0],
      note: "",
    });
    alert("✅ 还钱记录已保存 (Repayment Saved)");
    loadData();
  };

  const handleCheckpoint = async () => {
    const today = new Date().toISOString().split("T")[0];

    if (config.initialDate === today) {
      return alert("⚠️ 今天已经进行过结转，无需重复操作。");
    }

    if (
      !confirm(
        `⚠️ 确认执行【资金结转快照 (Checkpoint)】吗？\n\n` +
          `系统会将现在的真实余额：\n` +
          `💰 现金: ${formatMoney(balances.cash)}\n` +
          `🏦 银行: ${formatMoney(balances.bank)}\n\n` +
          `保存为新的"初始资金"，并将计算起点更新为【今天 (${today})】。\n\n` +
          `🎯 优势：大幅提升 App 流畅度！避免拉取几千条旧账单导致云端账单爆炸。\n` +
          `⚠️ 注意：结转后，修改今天之前的旧账单将不再影响现在的总资产。`,
      )
    )
      return;

    setLoading(true);
    try {
      const newConfig = {
        ...config,
        initialDate: today,
        initialCash: balances.cash,
        initialBank: balances.bank,
      };
      await DataManager.saveTreasuryConfig(newConfig);
      setConfig(newConfig);
      alert("✅ 资金结转快照保存成功！系统已重置计算起点。");
      loadData();
    } catch (error) {
      console.error("Checkpoint error", error);
      alert("结转失败，请检查网络！");
    } finally {
      setLoading(false);
    }
  };

  // 使用 Portal，避免父层 transform / overflow / sidebar 布局影响 fixed 全屏遮罩
  return createPortal(
    <TreasuryShell
      header={<TreasuryHeader onClose={onClose} />}
      navigation={
        <TreasuryMobileTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      }
    >
      <div className="p-4 pb-6 md:p-8 md:pb-8">
          {/* ==================== OVERVIEW TAB ==================== */}
          {activeTab === "OVERVIEW" && (
            <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto">
              {/* 1. Month Selector Switcher */}
              <TreasuryMonthSelector
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                onMonthShift={handleMonthShift}
                isClosed={!!selectedMonthClosing}
              />

              {/* 2. Total Assets Overview Header Card */}
              <TreasuryBalanceHero
                totalAmount={activeBalances.total}
                isLoading={isSelectedMonthLoading}
                startMonthLabel={activeBalances.startMonthLabel}
                formatMoney={formatMoney}
              />

              {/* 3. CASH AND BANK DETAIL CARDS WITH IN/OUT/BAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <TreasuryAccountCard
                  account="CASH"
                  label="现金账户"
                  opening={activeBalances.cashStart}
                  totalIn={activeBalances.cashIn}
                  totalOut={activeBalances.cashOut}
                  ending={activeBalances.cashEnd}
                  isLoading={isSelectedMonthLoading}
                  onOpenLedger={() => setViewLedger("CASH")}
                  onActionClick={(e) => {
                    e.stopPropagation();
                    setTransferForm({
                      type: "DEPOSIT",
                      fromAccount: "CASH",
                      toAccount: "BANK",
                      date: new Date().toISOString().split("T")[0],
                    });
                    setIsTransferModalOpen(true);
                  }}
                  actionLabel="存入 (Bank In)"
                  formatMoney={formatMoney}
                />

                <TreasuryAccountCard
                  account="BANK"
                  label="银行账户"
                  opening={activeBalances.bankStart}
                  totalIn={activeBalances.bankIn}
                  totalOut={activeBalances.bankOut}
                  ending={activeBalances.bankEnd}
                  isLoading={isSelectedMonthLoading}
                  onOpenLedger={() => setViewLedger("BANK")}
                  onActionClick={(e) => {
                    e.stopPropagation();
                    setTransferForm({
                      type: "WITHDRAWAL",
                      fromAccount: "BANK",
                      toAccount: "CASH",
                      date: new Date().toISOString().split("T")[0],
                    });
                    setIsTransferModalOpen(true);
                  }}
                  actionLabel="提款 (Withdraw)"
                  formatMoney={formatMoney}
                />
              </div>

              {/* 4. Quick Actions */}
              <TreasuryQuickActions
                onTransferClick={() => {
                  setTransferForm({
                    type: "DEPOSIT",
                    fromAccount: "CASH",
                    toAccount: "BANK",
                    date: new Date().toISOString().split("T")[0],
                  });
                  setIsTransferModalOpen(true);
                }}
                onIncomeClick={() => {
                  setActiveTab("EXTRA_INCOME");
                }}
                onHistoryClick={() => {
                  setIsHistoryModalOpen(true);
                }}
              />

              {/* 5. Monthly Status / Closing Controls */}
              <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] shadow-sm space-y-4">
                <TreasurySectionHeader
                  title="月度结账与状态 (Monthly Closing & Status)"
                  subtitle="CLOSING OPERATIONS"
                  emoji="🔒"
                />
                
                <div className="flex flex-col gap-3">
                  {selectedMonthClosing ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-bold space-y-2 border border-emerald-100">
                        <div className="flex justify-between">
                          <span>本月状态:</span>
                          <span className="text-emerald-700 font-extrabold">🟢 已结账并锁定</span>
                        </div>
                        {selectedMonthClosing.closedAt && (
                          <div className="flex justify-between">
                            <span>结账时间:</span>
                            <span className="text-stone-600 font-mono">
                              {new Date(selectedMonthClosing.closedAt).toLocaleString("zh-CN", { hour12: false })}
                            </span>
                          </div>
                        )}
                        {selectedMonthClosing.closedBy && (
                          <div className="flex justify-between">
                            <span>操作人员:</span>
                            <span className="text-stone-600 font-mono">{selectedMonthClosing.closedBy}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleUnlockMonth}
                        type="button"
                        className="w-full bg-[#EF4444] hover:bg-red-700 active:scale-[0.98] text-white px-6 py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 font-black text-xs md:text-sm transition-all touch-manipulation"
                      >
                        🔓 解锁本月账目 (Unlock Month)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-xs font-bold space-y-2 border border-amber-100">
                        <div className="flex justify-between">
                          <span>本月状态:</span>
                          <span className="text-amber-700 font-extrabold">🟡 待结账/未锁定</span>
                        </div>
                        <p className="text-[10px] text-amber-600 leading-relaxed font-medium">
                          请在所有交易记录完整、每日对账无误后，进行月结锁定。锁定后将无法修改本月账目。
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <button
                          onClick={handleCloseMonth}
                          type="button"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white px-6 py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 font-black text-xs md:text-sm transition-all border border-emerald-500 touch-manipulation"
                        >
                          🔒 结算并锁定本月 (Close & Lock)
                        </button>
                        
                        <button
                          onClick={() => setIsExpenseModalOpen(true)}
                          type="button"
                          className="w-full bg-[#EF4444] hover:bg-red-700 active:scale-[0.98] text-white px-6 py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 font-black text-xs md:text-sm transition-all border border-red-500 touch-manipulation"
                        >
                          <MinusCircle size={16} /> 补录支出 (Expense)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Month Closings Timeline List */}
              <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#E5E7EB] shadow-sm space-y-4">
                <TreasurySectionHeader
                  title="历史月度大盘汇总 (Monthly Treasury Timeline)"
                  subtitle="Historical Closings & Balance Tracking"
                  emoji="📅"
                  action={
                    <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-1 rounded-lg font-bold">
                      起自{" "}
                      {config.initialDate
                        ? config.initialDate.substring(0, 7)
                        : "2025-11"}
                    </span>
                  }
                />

                <div
                  className="
                    divide-y divide-gray-150
                    space-y-1
                    pr-1
                    max-h-none
                    overflow-visible
                    md:max-h-80
                    md:overflow-y-auto
                    md:custom-scrollbar
                  "
                >
                  {generateMonthsRange(
                    config.initialDate
                      ? config.initialDate.substring(0, 7)
                      : "2025-11",
                    new Date().toISOString().slice(0, 7),
                  )
                    .reverse()
                    .map((monthStr) => {
                      const closing = monthlyClosings.find(
                        (c) => c.month === monthStr,
                      );
                      const isSelected = selectedMonth === monthStr;

                      const monthExpenses = expenses.filter((e) => {
                        const dDate = e.time?.split("T")[0] || "";
                        return dDate.startsWith(monthStr);
                      });

                      const unpaidBills = monthExpenses.filter(
                        (e) =>
                          e.paymentStatus === "UNPAID" ||
                          e.paymentStatus === "PARTIAL",
                      );
                      const unpaidCount = unpaidBills.length;
                      const unpaidAmount = unpaidBills.reduce((sum, e) => {
                        const amt =
                          Number(e.outstandingAmount) ||
                          (Number(e.totalBillAmount) > 0
                            ? Number(e.totalBillAmount) -
                              (Number(e.amount) || 0)
                            : Number(e.amount)) ||
                          0;
                        return sum + amt;
                      }, 0);

                      return (
                        <div
                          key={monthStr}
                          onClick={() => setSelectedMonth(monthStr)}
                          className={`p-3 rounded-xl flex items-center justify-between gap-4 cursor-pointer transition-all duration-150 border ${
                            isSelected
                              ? "bg-stone-900 text-white border-stone-900 shadow-md scale-[1.01]"
                              : "bg-stone-50/50 hover:bg-stone-100/80 border-gray-100 hover:border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-xs md:text-sm font-black truncate">
                              {getMonthLabel(monthStr)}
                            </span>
                            {closing ? (
                              <span className="bg-green-100 text-green-850 text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
                                已结账
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-850 text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
                                待结算
                              </span>
                            )}

                            {unpaidCount > 0 && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${isSelected ? "bg-red-900/50 text-red-200" : "bg-red-50 text-red-600 border border-red-100"}`}
                              >
                                应付: {formatMoney(unpaidAmount)} ({unpaidCount}
                                笔)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 font-mono text-[10px] md:text-xs text-right shrink-0">
                            {closing ? (
                              <>
                                <div className="hidden sm:block text-left mr-2">
                                  <span className="text-green-500 font-bold block">
                                    +
                                    {formatMoney(
                                      closing.cashIn + closing.bankIn,
                                    )}
                                  </span>
                                  <span className="text-red-500 font-bold block">
                                    -
                                    {formatMoney(
                                      closing.cashOut + closing.bankOut,
                                    )}
                                  </span>
                                </div>
                                <div>
                                  <span
                                    className={`font-black ${isSelected ? "text-[#FFD200]" : "text-[#111111]"}`}
                                  >
                                    {formatMoney(
                                      closing.cashEnd + closing.bankEnd,
                                    )}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-stone-400 italic text-[11px]">
                                {isSelected
                                  ? "⏳ 计算中..."
                                  : "🔍 点击查看与结算"}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ==================== EXTRA_INCOME TAB ==================== */}
          {activeTab === "EXTRA_INCOME" && (
            <TreasuryExtraIncomeTab
              extraIncomeStats={extraIncomeStats}
              incomeFilterMonth={incomeFilterMonth}
              onAddIncome={() => {
                setEditingIncomeRecord(null);
                setIncomeForm({
                  source: "",
                  category: "ELECTRICITY",
                  amount: "",
                  toAccount: "CASH",
                  date: new Date().toISOString().split("T")[0],
                  note: "",
                });
                setIsIncomeModalOpen(true);
              }}
              onEditIncome={handleEditIncome}
              onDeleteIncome={handleDeleteTransfer}
              onPrevMonth={() => navigateMonth("prev")}
              onNextMonth={() => navigateMonth("next")}
              onGenerateReceipt={handleGenerateReceipt}
              isGeneratingPdf={isGeneratingPdf}
              printingRecord={printingRecord}
              getMonthLabel={getMonthLabel}
              formatMoney={formatMoney}
            />
          )}

          {/* ==================== EQUITY TAB ==================== */}
          {activeTab === "EQUITY" && (
            <TreasuryEquityTab
              shareholders={config.shareholders || []}
              totalCapital={totalCapital}
              transfers={transfers}
              dividendHistory={dividendHistory}
              expandedInjections={expandedInjections}
              onToggleExpand={(name) =>
                setExpandedInjections((prev) => ({
                  ...prev,
                  [name]: !prev[name],
                }))
              }
              onAddShareholder={() => {
                setShareholderForm({
                  name: "",
                  investmentAmount: 0,
                  equityPercentage: 0,
                });
                setIsShareholderFormOpen(true);
              }}
              onEditShareholder={(s) => {
                setShareholderForm(s);
                setIsShareholderFormOpen(true);
              }}
              onDeleteShareholder={handleDeleteShareholder}
              onAddInjection={() => setIsInjectionModalOpen(true)}
              onAddRepayment={() => setIsRepaymentModalOpen(true)}
              onAddDividend={() => setIsDividendModalOpen(true)}
              onDeleteTransfer={handleDeleteTransfer}
              formatMoney={formatMoney}
            />
          )}

          {/* ==================== TRANSFERS TAB (手机适配) ==================== */}
          {activeTab === "TRANSFERS" && (
            <TreasuryTransfersTab
              transfers={transfers}
              onAddTransfer={() => {
                setTransferForm({
                  type: "DEPOSIT",
                  fromAccount: "CASH",
                  toAccount: "BANK",
                  date: new Date().toISOString().split("T")[0],
                });
                setIsTransferModalOpen(true);
              }}
              onDeleteTransfer={handleDeleteTransfer}
            />
          )}

          {/* ==================== SETTINGS TAB (密码锁) ==================== */}
          {activeTab === "SETTINGS" && (
            <TreasurySettingsTab
              isSettingsUnlocked={isSettingsUnlocked}
              settingsPasswordInput={settingsPasswordInput}
              setSettingsPasswordInput={setSettingsPasswordInput}
              settingsPasswordError={settingsPasswordError}
              setSettingsPasswordError={setSettingsPasswordError}
              config={config}
              setConfig={setConfig}
              onUnlock={handleSettingsUnlock}
              onLock={() => {
                setIsSettingsUnlocked(false);
                setSettingsPasswordInput("");
              }}
              onSaveConfig={handleSaveConfig}
            />
          )}
        </div>

        {/* ==================== MODALS ==================== */}

        {/* Transfer Modal - 手机 safe area 适配 */}
        <TreasuryTransferModal
          open={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          form={transferForm}
          setForm={setTransferForm}
          onSave={handleSaveTransfer}
        />

        {/* Shareholder Modal - 手机 safe area 适配 */}
        <TreasuryShareholderModal
          open={isShareholderFormOpen}
          onClose={() => setIsShareholderFormOpen(false)}
          form={shareholderForm}
          setForm={setShareholderForm}
          onSave={handleSaveShareholder}
        />

        {/* Injection Modal - 手机 safe area 适配 */}
        <TreasuryInjectionModal
          open={isInjectionModalOpen}
          onClose={() => setIsInjectionModalOpen(false)}
          form={injectionForm}
          setForm={setInjectionForm}
          onSave={handleSaveInjection}
          shareholders={config.shareholders}
        />

        {/* Income Modal - 支持新增 + 编辑模式，手机 safe area 适配 */}
        <TreasuryIncomeModal
          open={isIncomeModalOpen}
          onClose={() => {
            setIsIncomeModalOpen(false);
            setEditingIncomeRecord(null);
          }}
          form={incomeForm}
          setForm={setIncomeForm}
          onSave={handleSaveIncome}
          isEditing={!!editingIncomeRecord}
          incomeSourceHistory={incomeSourceHistory}
        />

        {/* Expense Modal - 手机 safe area 适配 */}
        <TreasuryExpenseModal
          open={isExpenseModalOpen}
          onClose={() => setIsExpenseModalOpen(false)}
          form={expenseForm}
          setForm={setExpenseForm}
          onSave={handleSaveExpense}
        />

        {/* Dividend Modal - 手机 safe area 适配 */}
        <TreasuryDividendModal
          open={isDividendModalOpen}
          onClose={() => setIsDividendModalOpen(false)}
          form={dividendForm}
          setForm={setDividendForm}
          onSave={handleSaveDividend}
          shareholders={config.shareholders}
        />

        {/* Repayment Modal - 还钱给股东 */}
        <TreasuryRepaymentModal
          open={isRepaymentModalOpen}
          onClose={() => setIsRepaymentModalOpen(false)}
          form={repaymentForm}
          setForm={setRepaymentForm}
          onSave={handleSaveRepayment}
          shareholders={config.shareholders}
        />

        {/* HIDDEN PRINT TEMPLATE
            只有生成 PDF 时才挂载，平时完全不出现在 DOM，避免桌面端露出 OFFICIAL RECEIPT */}
        {printingRecord && (
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              top: "0px",
              left: "-100000px",
              width: "148mm",
              height: "210mm",
              overflow: "hidden",
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            <div
              ref={printRef}
              id="treasury-receipt-export-root"
              className="w-[148mm] min-h-[210mm] bg-white p-10 font-sans text-black relative border-8 border-[#1A1A1A] flex flex-col justify-between"
              style={{ boxSizing: "border-box" }}
            >
              {/* Top Decorative Gold Bar */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-[#FFD700]" />
              
              <div>
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-200 pb-6 mb-8">
                  <div>
                    <h1 className="text-2xl font-black uppercase tracking-widest text-[#1A1A1A] mb-1">
                      OFFICIAL RECEIPT
                    </h1>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-2 h-2 rounded-full bg-[#FFD700]" />
                      <p className="text-xs font-black text-gray-700 tracking-wider">
                        KIM LIAN KEE (KEPONG)
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                      No. 52, Jalan Metro Perdana Barat 13
                      <br />
                      Kepong, 52100 Kuala Lumpur
                    </p>
                  </div>
                  <div className="text-right flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                        Receipt No
                      </p>
                      <p className="text-lg font-mono font-black text-[#1A1A1A] bg-gray-100 px-3 py-1 rounded-lg border border-gray-200 inline-block">
                        #{printingRecord?.id.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <div className="mt-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                        Date Issued
                      </p>
                      <p className="text-xs font-bold text-gray-700">
                        {printingRecord?.date}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                {printingRecord &&
                  (() => {
                    const cleanNote =
                      printingRecord.note?.replace("[代收] ", "") || "";
                    const dashIndex = cleanNote.indexOf(" - ");
                    const sourceName =
                      dashIndex > -1
                        ? cleanNote.substring(0, dashIndex)
                        : cleanNote || "N/A";
                    const description =
                      dashIndex > -1
                        ? cleanNote.substring(dashIndex + 3)
                        : "Payment";
                    return (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Received From (付款人):
                            </p>
                            <h2 className="text-sm font-black text-[#1A1A1A]">{sourceName}</h2>
                          </div>
                          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Payment For (款项用途):
                            </p>
                            <h2 className="text-sm font-black text-[#1A1A1A]">{description}</h2>
                          </div>
                        </div>

                        {/* Amount Banner */}
                        <div className="bg-[#1A1A1A] text-white p-6 rounded-2xl border-b-4 border-[#FFD700] shadow-xl relative overflow-hidden flex items-center justify-between">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD700]/10 rounded-full blur-2xl pointer-events-none" />
                          <div className="relative z-10">
                            <p className="text-[10px] font-black text-[#FFD700] uppercase tracking-widest mb-1">
                              TOTAL AMOUNT RECEIVED
                            </p>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                              实收金额 (MYR)
                            </p>
                          </div>
                          <div className="relative z-10 text-right">
                            <p className="text-3xl font-mono font-black text-[#FFD700]">
                              RM {printingRecord.amount.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {/* Payment metadata */}
                        <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex justify-between items-center text-xs font-bold text-stone-600">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] bg-stone-200 text-stone-700 px-2 py-0.5 rounded-md font-black">METHOD</span>
                            <span className="font-mono uppercase text-stone-900">{printingRecord.toAccount}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-black">STATUS</span>
                            <span className="text-emerald-600 uppercase font-black">PAID (已付)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>

              {/* Footer */}
              <div>
                <div className="grid grid-cols-2 gap-16">
                  <div className="border-t-2 border-gray-200 pt-3">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Received By (收款方)
                    </p>
                    <p className="text-xs font-black text-gray-800">KIM LIAN KEE</p>
                  </div>
                  <div className="border-t-2 border-[#FFD700] pt-3 relative">
                    <p className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest mb-1">
                      Authorized Signature (授权签章)
                    </p>
                    <div className="h-6" />
                  </div>
                </div>
                
                <p className="text-[8px] text-center text-gray-400 mt-10 uppercase tracking-widest font-bold border-t border-gray-100 pt-4">
                  This is a computer-generated official receipt • No physical signature is required
                </p>
              </div>
            </div>
          </div>
        )}

        {/* === HISTORY ARCHIVE MODAL === */}
        {isHistoryModalOpen && (
          <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full md:max-w-5xl h-[92vh] md:h-[88vh] md:rounded-[2rem] rounded-t-[2rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
              <div
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
                className="bg-[#1A1A1A] px-4 md:px-5 pb-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700]"
              >
                <div>
                  <h3 className="font-black text-base md:text-xl flex items-center gap-2">
                    <Archive
                      size={18}
                      className="md:w-5 md:h-5 text-[#FFD700]"
                    />{" "}
                    历史账本档案馆
                  </h3>
                  <p className="text-[10px] text-gray-400 font-mono mt-1">
                    ON-DEMAND SECURE FETCHING
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsHistoryModalOpen(false);
                    setHistoryRecords([]);
                    setHistorySearchQuery("");
                    setHistoryAccountFilter("ALL");
                    setHistoryActiveFlow("ALL");
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 📅 Month Search & Primary Tab Switch Toolbars */}
              <div className="p-3 md:p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="bg-white p-1 rounded-xl border border-gray-300 shadow-inner flex items-center flex-1 md:flex-none">
                    <Calendar size={14} className="text-gray-400 ml-2" />
                    <input
                      type="month"
                      value={historyMonth}
                      onChange={(e) => setHistoryMonth(e.target.value)}
                      className="p-2 bg-transparent font-black text-[#1A1A1A] outline-none cursor-pointer text-sm w-full md:w-auto"
                    />
                  </div>
                  <button
                    onClick={() => fetchHistoryData(historyMonth)}
                    disabled={isHistoryLoading}
                    className="bg-[#1A1A1A] text-[#FFD700] px-4 md:px-6 py-2.5 rounded-xl font-black shadow-md hover:bg-black active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 text-xs md:text-sm whitespace-nowrap"
                  >
                    {isHistoryLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Search size={14} />
                    )}
                    查询
                  </button>
                </div>

                {historyRecords.length > 0 && (
                  <div className="flex bg-gray-200 border border-gray-300 rounded-xl p-0.5 shadow-sm shrink-0">
                    <button
                      onClick={() => setHistoryAccountFilter("CASH")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${historyAccountFilter === "CASH" ? "bg-[#FFD700] text-black shadow-sm font-bold" : "text-stone-600 hover:text-[#1A1A1A]"}`}
                    >
                      💵 现金 (Cash)
                    </button>
                    <button
                      onClick={() => setHistoryAccountFilter("BANK")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${historyAccountFilter === "BANK" ? "bg-[#FFD700] text-black shadow-sm font-bold" : "text-stone-600 hover:text-[#1A1A1A]"}`}
                    >
                      🏦 银行 (Bank)
                    </button>
                    <button
                      onClick={() => setHistoryAccountFilter("ALL")}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all ${historyAccountFilter === "ALL" ? "bg-[#1A1A1A] text-white shadow-sm font-bold" : "text-stone-400 hover:text-stone-600"}`}
                    >
                      全部
                    </button>
                  </div>
                )}
              </div>

              {/* 🔍 Keyword/Vendor or Specific Amount Search Input */}
              {historyRecords.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-stone-100 border-b border-gray-200 flex flex-col md:flex-row gap-2.5 md:gap-4 items-center justify-between shrink-0 font-sans">
                    <div className="flex items-center bg-white border border-gray-300 rounded-xl px-3 py-2 flex-grow shadow-inner w-full">
                      <Search
                        size={15}
                        className="text-gray-400 mr-2 shrink-0"
                      />
                      <input
                        type="text"
                        placeholder="简易搜寻特定商家公司名称、类型分类或金额..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        className="bg-transparent flex-grow font-bold text-xs text-[#1A1A1A] outline-none placeholder:text-gray-400 w-full"
                      />
                      {historySearchQuery && (
                        <button
                          onClick={() => setHistorySearchQuery("")}
                          className="p-0.5 hover:bg-gray-150 rounded-full text-gray-400"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2.5 text-[11px] font-bold font-mono w-full md:w-auto justify-end">
                      <span className="text-gray-400 self-center uppercase font-bold text-[9px]">
                        过滤后小计:
                      </span>
                      <div className="text-green-600 bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-100 font-black">
                        +{formatMoney(dynamicHistoryStats.totalIn)}
                      </div>
                      <div className="text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100 font-black font-semibold">
                        -{formatMoney(dynamicHistoryStats.totalOut)}
                      </div>
                    </div>
                  </div>

                  {/* IN/OUT Flow Segment Tab Switcher */}
                  <div className="px-3 py-2.5 bg-white border-b border-gray-200 flex justify-center shrink-0 font-sans">
                    <div className="flex bg-gray-100 border border-gray-200 rounded-xl p-1 shadow-inner w-full max-w-sm">
                      <button
                        onClick={() => setHistoryActiveFlow("ALL")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${historyActiveFlow === "ALL" ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-[#1A1A1A]"}`}
                      >
                        全部 (ALL)
                      </button>
                      <button
                        onClick={() => setHistoryActiveFlow("IN")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${historyActiveFlow === "IN" ? "bg-green-600 text-white shadow-sm" : "text-stone-500 hover:text-green-600"}`}
                      >
                        🟢 收入 ({inHistory.length})
                      </button>
                      <button
                        onClick={() => setHistoryActiveFlow("OUT")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${historyActiveFlow === "OUT" ? "bg-red-600 text-white shadow-sm" : "text-stone-500 hover:text-red-600"}`}
                      >
                        🔴 支出 ({outHistory.length})
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div
                className="flex-grow overflow-y-auto touch-pan-y overscroll-contain p-3 md:p-4 bg-gray-100"
                style={{
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
                }}
              >
                {isHistoryLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                    <Loader2 size={40} className="animate-spin text-gray-300" />
                    <p className="font-bold text-sm animate-pulse">
                      正在捞取数据库...
                    </p>
                  </div>
                ) : historyRecords.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Archive size={48} className="opacity-20 mb-4" />
                    <p className="text-sm font-bold text-gray-500">
                      请选择月份并点击查询
                    </p>
                  </div>
                ) : filteredHistoryRecords.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Search size={40} className="opacity-20 mb-4" />
                    <p className="text-sm font-bold text-gray-500">
                      在该分类下未检索到匹配项目
                    </p>
                  </div>
                ) : (
                  <div
                    className={`grid grid-cols-1 ${historyActiveFlow === "ALL" ? "md:grid-cols-2" : "grid-cols-1"} gap-4 items-start font-sans pb-[calc(env(safe-area-inset-bottom)+12px)]`}
                  >
                    {/* === LEFT COLUMN: INFLOWS (IN 收入) === */}
                    {(historyActiveFlow === "ALL" ||
                      historyActiveFlow === "IN") && (
                      <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[180px]">
                        <div className="bg-green-50/60 border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
                          <h4 className="text-xs font-black text-green-700 tracking-wider flex items-center gap-1.5 uppercase">
                            <span>📥</span> 收入明细 (INFLOWS)
                          </h4>
                          <span className="text-xs font-black text-green-600 font-mono">
                            共 {inHistory.length} 笔 • +RM{" "}
                            {dynamicHistoryStats.totalIn.toLocaleString(
                              "en-US",
                              { minimumFractionDigits: 2 },
                            )}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[65vh] md:max-h-none overflow-y-auto flex-grow p-2 space-y-1.5 bg-stone-50/40">
                          {inHistory.length === 0 ? (
                            <div className="p-12 text-center text-stone-400 text-xs font-medium">
                              无符合的收入记录
                            </div>
                          ) : (
                            inHistory.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-between gap-2 hover:bg-stone-50/80 transition-all duration-150"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs md:text-sm text-[#1A1A1A] truncate flex items-center gap-1.5">
                                      {item.account && (
                                        <span
                                          className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${item.account === "CASH" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}
                                        >
                                          {item.account === "CASH"
                                            ? "💵 现金"
                                            : "🏦 银行"}
                                        </span>
                                      )}
                                      <span className="truncate">
                                        {item.desc}
                                      </span>
                                    </div>
                                    <div className="text-[9px] md:text-[10px] text-gray-400 font-mono mt-0.5">
                                      {item.date} • {item.category}
                                    </div>
                                  </div>
                                </div>
                                <div className="font-mono font-black text-xs md:text-sm text-right text-green-600 shrink-0">
                                  +
                                  {item.amount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* === RIGHT COLUMN: OUTFLOWS (OUT 支出) === */}
                    {(historyActiveFlow === "ALL" ||
                      historyActiveFlow === "OUT") && (
                      <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[180px]">
                        <div className="bg-red-50/60 border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
                          <h4 className="text-xs font-black text-red-700 tracking-wider flex items-center gap-1.5 uppercase">
                            <span>📤</span> 支出明细 (OUTFLOWS)
                          </h4>
                          <span className="text-xs font-black text-red-600 font-mono">
                            共 {outHistory.length} 笔 • -RM{" "}
                            {dynamicHistoryStats.totalOut.toLocaleString(
                              "en-US",
                              { minimumFractionDigits: 2 },
                            )}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[65vh] md:max-h-none overflow-y-auto flex-grow p-2 space-y-1.5 bg-stone-50/40">
                          {outHistory.length === 0 ? (
                            <div className="p-12 text-center text-stone-400 text-xs font-medium">
                              无符合的支出记录
                            </div>
                          ) : (
                            outHistory.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-between gap-2 hover:bg-stone-50/80 transition-all duration-150"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs md:text-sm text-[#1A1A1A] truncate flex items-center gap-1.5">
                                      {item.account && (
                                        <span
                                          className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${item.account === "CASH" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}
                                        >
                                          {item.account === "CASH"
                                            ? "💵 现金"
                                            : "🏦 银行"}
                                        </span>
                                      )}
                                      <span className="truncate">
                                        {item.desc}
                                      </span>
                                    </div>
                                    <div className="text-[9px] md:text-[10px] text-gray-400 font-mono mt-0.5">
                                      {item.date} • {item.category}
                                    </div>
                                  </div>
                                </div>
                                <div className="font-mono font-black text-xs md:text-sm text-right text-red-600 shrink-0">
                                  -
                                  {item.amount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


      {/* Ledger Modal */}
      {viewLedger && (
        <TreasuryLedgerModal
          isOpen={!!viewLedger}
          type={viewLedger}
          onClose={() => setViewLedger(null)}
          items={getLedgerData(viewLedger)}
        />
      )}
    </TreasuryShell>,
    document.body
  );
};
