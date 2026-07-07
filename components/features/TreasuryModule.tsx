import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Wallet,
  Landmark,
  ArrowRightLeft,
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
  Briefcase,
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
} from "../../types";
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
import { ModuleGuideButton } from "../ui/ModuleGuide";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export interface MonthlyClosing {
  id: string; // YYYY-MM
  month: string; // YYYY-MM
  cashStart: number;
  cashIn: number;
  cashOut: number;
  cashEnd: number;
  bankStart: number;
  bankIn: number;
  bankOut: number;
  bankEnd: number;
  status: "CLOSED" | "DRAFT";
  closedAt?: string;
  closedBy?: string;
}

const generateMonthsRange = (
  startMonth: string,
  endMonth: string,
): string[] => {
  const list: string[] = [];
  let [sY, sM] = startMonth.split("-").map(Number);
  const [eY, eM] = endMonth.split("-").map(Number);

  while (sY < eY || (sY === eY && sM <= eM)) {
    list.push(`${sY}-${String(sM).padStart(2, "0")}`);
    sM++;
    if (sM > 12) {
      sM = 1;
      sY++;
    }
  }
  return list;
};

interface TreasuryModuleProps {
  onClose: () => void;
}

// --- HELPER ---
const formatMoney = (n: number) =>
  `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DEFAULT_INCOME_SOURCES = [
  "隔壁店铺 (Neighbor)",
  "废品回收 (Recycle)",
  "租金分摊 (Sub-rent)",
];

// --- LEDGER INTERFACES ---
interface LedgerItem {
  id: string;
  date: string;
  desc: string;
  amount: number;
  type: "IN" | "OUT";
  category: string;
  tag?: string;
  balance?: number;
  sortTime?: number;
  linkUrl?: string;
  account?: "CASH" | "BANK";
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

const LedgerModal = ({
  isOpen,
  type,
  onClose,
  items,
}: {
  isOpen: boolean;
  type: "CASH" | "BANK";
  onClose: () => void;
  items: LedgerItem[] | undefined;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFlow, setActiveFlow] = useState<"ALL" | "IN" | "OUT">("ALL");

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const descMatch =
        item.desc?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q);
      const amountMatch =
        item.amount?.toString().includes(q) ||
        item.amount?.toFixed(2).includes(q);
      return descMatch || amountMatch;
    });
  }, [items, searchQuery]);

  const { totalIn, totalOut } = useMemo(() => {
    let tin = 0;
    let tout = 0;
    filteredItems.forEach((item) => {
      if (item.type === "IN") tin += item.amount;
      else tout += item.amount;
    });
    return { totalIn: tin, totalOut: tout };
  }, [filteredItems]);

  const groupedItems = useMemo(() => {
    const list = filteredItems;
    const groups: any[] = [];
    list.forEach((item) => {
      let baseDesc = item.desc;
      if (baseDesc.includes(" - ")) baseDesc = baseDesc.split(" - ")[0].trim();
      baseDesc = baseDesc.replace(/ \[账期.*/, "").trim();

      const groupKey = `${item.date}_${item.type}_${baseDesc}`;
      const existingGroup = groups.find((g) => g.key === groupKey);

      if (existingGroup) {
        existingGroup.items.push(item);
        existingGroup.totalAmount += item.amount;
      } else {
        groups.push({
          key: groupKey,
          date: item.date,
          type: item.type,
          baseDesc,
          items: [item],
          totalAmount: item.amount,
          category: item.category,
          tag: item.tag,
          balance: item.balance,
        });
      }
    });
    return groups;
  }, [filteredItems]);

  const inGroups = useMemo(() => {
    return groupedItems.filter((g) => g.type === "IN");
  }, [groupedItems]);

  const outGroups = useMemo(() => {
    return groupedItems.filter((g) => g.type === "OUT");
  }, [groupedItems]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
      <div className="bg-white w-full h-full md:max-w-5xl md:h-[90vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
        <div
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
          className="bg-[#1A1A1A] px-4 pb-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700] z-10 shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="bg-[#FFD700] text-black p-2 rounded-xl shadow-lg">
              <ScrollText size={20} />
            </div>
            <div>
              <h3 className="font-serif font-black text-lg tracking-wide">
                {type} LEDGER (流水账)
              </h3>
              <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">
                Transaction History
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 🔍 Search Input Row */}
        <div className="bg-stone-50 border-b border-stone-200 p-2.5 md:p-3 flex flex-col md:flex-row gap-2 md:gap-4 items-center shrink-0">
          <div className="flex items-center bg-white border border-stone-300 rounded-xl px-3 py-2 flex-grow shadow-inner w-full md:w-auto">
            <Search size={15} className="text-stone-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="查询特定摘要、品牌商(公司)名称、项目分类或支付金额..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent flex-grow font-bold text-xs md:text-sm text-stone-850 outline-none placeholder:text-stone-400 w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="p-0.5 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* IN/OUT Sub-tab Swivel Switcher */}
          <div className="flex bg-gray-200 border border-gray-300 rounded-xl p-0.5 shadow-sm shrink-0 w-full md:w-auto">
            <button
              onClick={() => setActiveFlow("ALL")}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeFlow === "ALL" ? "bg-[#1A1A1A] text-white shadow-sm font-bold" : "text-stone-600 hover:text-[#1A1A1A]"}`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveFlow("IN")}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeFlow === "IN" ? "bg-green-600 text-white shadow-sm font-bold" : "text-stone-600 hover:text-[#1A1A1A]"}`}
            >
              🟢 收入 (IN)
            </button>
            <button
              onClick={() => setActiveFlow("OUT")}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeFlow === "OUT" ? "bg-red-600 text-white shadow-sm font-bold" : "text-stone-600 hover:text-[#1A1A1A]"}`}
            >
              🔴 支出 (OUT)
            </button>
          </div>
        </div>

        {/* 💳 Filter Stats Subtotals Row */}
        <div className="grid grid-cols-2 gap-2.5 p-2.5 bg-stone-100 border-b border-gray-200 shrink-0">
          <div className="bg-green-50 border border-green-100 rounded-xl p-2 md:p-3 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[9px] md:text-[10px] text-green-700 font-extrabold uppercase tracking-widest">
                总流入 (TOTAL IN)
              </p>
              <p className="text-xs md:text-sm font-black text-green-600 mt-0.5 font-mono">
                +RM{" "}
                {totalIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span className="text-sm md:text-base">📈</span>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-2 md:p-3 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[9px] md:text-[10px] text-red-700 font-extrabold uppercase tracking-widest">
                总流出 (TOTAL OUT)
              </p>
              <p className="text-xs md:text-sm font-black text-red-600 mt-0.5 font-mono">
                -RM{" "}
                {totalOut.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span className="text-sm md:text-base">📉</span>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto bg-[#F5F7FA] p-3 md:p-4 pb-[calc(env(safe-area-inset-bottom)+24px)] custom-scrollbar">
          {groupedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ScrollText size={48} className="opacity-20 mb-4" />
              <p className="text-sm font-bold">
                {searchQuery
                  ? "没有找到符合特定条件的项目"
                  : "暂无交易明细记录"}
              </p>
            </div>
          ) : (
            <div>
              {/* === DESKTOP VIEW: TWO COLS === */}
              <div
                className={`hidden md:grid ${activeFlow === "ALL" ? "grid-cols-2" : "grid-cols-1"} gap-4 items-start`}
              >
                {/* INFLOWS */}
                {(activeFlow === "ALL" || activeFlow === "IN") && (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[300px]">
                    <div className="bg-green-50/60 border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
                      <h4 className="text-xs font-black text-green-700 tracking-wider flex items-center gap-1.5 uppercase">
                        <span>📥</span> 收入流水 (INFLOWS)
                      </h4>
                      <span className="text-xs font-black text-green-600 font-mono">
                        共 {inGroups.length} 笔 • +RM{" "}
                        {totalIn.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 p-2 space-y-1.5 bg-stone-50/40">
                      {inGroups.length === 0 ? (
                        <div className="p-12 text-center text-stone-400 text-xs font-medium">
                          无符合的收入记录
                        </div>
                      ) : (
                        inGroups.map((group) => (
                          <GroupedLedgerItem key={group.key} group={group} />
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* OUTFLOWS */}
                {(activeFlow === "ALL" || activeFlow === "OUT") && (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[300px]">
                    <div className="bg-red-50/60 border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
                      <h4 className="text-xs font-black text-red-700 tracking-wider flex items-center gap-1.5 uppercase">
                        <span>📤</span> 支出流水 (OUTFLOWS)
                      </h4>
                      <span className="text-xs font-black text-red-600 font-mono">
                        共 {outGroups.length} 笔 • -RM{" "}
                        {totalOut.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 p-2 space-y-1.5 bg-stone-50/40">
                      {outGroups.length === 0 ? (
                        <div className="p-12 text-center text-stone-400 text-xs font-medium">
                          无符合的支出记录
                        </div>
                      ) : (
                        outGroups.map((group) => (
                          <GroupedLedgerItem key={group.key} group={group} />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* === MOBILE VIEW: TIMELINE FLUID === */}
              <div className="block md:hidden space-y-3">
                {activeFlow === "ALL" ? (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-sm">
                    <div className="bg-stone-50 border-b border-gray-100 px-3 py-2.5 flex items-center justify-between sticky top-0 z-10">
                      <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                        <span>📋</span> 统一交易明细时间流
                      </h4>
                      <span className="text-[10px] bg-stone-200 text-stone-800 font-black px-1.5 py-0.5 rounded">
                        共 {groupedItems.length} 笔
                      </span>
                    </div>
                    <div className="p-1 gap-1.5 flex flex-col bg-gray-50/50">
                      {[...groupedItems]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((group) => (
                          <GroupedLedgerItem key={group.key} group={group} />
                        ))}
                    </div>
                  </div>
                ) : activeFlow === "IN" ? (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-sm">
                    <div className="bg-green-50/60 border-b border-[#E6F4EA] px-3 py-2.5 flex items-center justify-between sticky top-0 z-10">
                      <h4 className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                        <span>📥</span> 收入明细时间流
                      </h4>
                      <span className="text-[10px] bg-green-100 text-green-800 font-bold px-1.5 py-0.5 rounded">
                        {inGroups.length} 笔 • +RM{" "}
                        {totalIn.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="p-1 gap-1.5 flex flex-col bg-gray-50/50">
                      {inGroups.map((group) => (
                        <GroupedLedgerItem key={group.key} group={group} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-155 overflow-hidden shadow-sm">
                    <div className="bg-red-50/60 border-b border-[#FCE8E6] px-3 py-2.5 flex items-center justify-between sticky top-0 z-10">
                      <h4 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                        <span>📤</span> 支出明细时间流
                      </h4>
                      <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded">
                        {outGroups.length} 笔 • -RM{" "}
                        {totalOut.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="p-1 gap-1.5 flex flex-col bg-gray-50/50">
                      {outGroups.map((group) => (
                        <GroupedLedgerItem key={group.key} group={group} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TreasuryModule: React.FC<TreasuryModuleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<
    "OVERVIEW" | "TRANSFERS" | "EXTRA_INCOME" | "EQUITY" | "SETTINGS"
  >("OVERVIEW");
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
  const SETTINGS_PASSWORD = "9394";

  const handleSettingsUnlock = () => {
    if (settingsPasswordInput === SETTINGS_PASSWORD) {
      setIsSettingsUnlocked(true);
      setSettingsPasswordError(false);
    } else {
      setSettingsPasswordError(true);
    }
  };

  const getMonthLabel = (monthStr: string) => {
    if (!monthStr || monthStr.length < 7) return "";
    const [year, month] = monthStr.split("-");
    return `${year}年${month}月`;
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
    const historySet = new Set(DEFAULT_INCOME_SOURCES);
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

    // 按选中月份过滤
    const filteredRecords = allRecords.filter((t) =>
      t.date.startsWith(incomeFilterMonth),
    );
    const filteredTotal = filteredRecords.reduce((sum, t) => sum + t.amount, 0);

    // 本月统计
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthTotal = allRecords
      .filter((t) => t.date.startsWith(currentMonthPrefix))
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

    // 获取所有存在记录的月份列表（用于快速导航）
    const monthsSet = new Set<string>();
    allRecords.forEach((t) => {
      const m = t.date.slice(0, 7);
      if (m) monthsSet.add(m);
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

  // �                {/* Header 注入 Safe Area */}
  return (
    <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
      <div className="bg-white w-full h-full md:max-w-7xl md:h-[95vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">
        {/* Header 注入 Safe Area */}
        <div className="bg-[#1A1A1A] px-4 pb-3 md:px-5 md:pb-4 flex justify-between items-center text-white shrink-0 border-b-2 md:border-b-4 border-[#FFD700] shadow-md z-50 relative safe-area-top">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
            <div className="bg-[#FFD700] text-black p-1.5 md:p-2.5 rounded-xl shadow-lg shrink-0">
              <Wallet className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-black text-sm md:text-xl tracking-wide truncate">
                资金管理 (Treasury)
              </h3>
              <p className="hidden md:block text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">
                CASH FLOW & ASSETS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ModuleGuideButton module="TREASURY" />
            <button
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-red-600 rounded-xl transition-colors text-white select-none"
            >
              <X size={18} className="md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* Tabs：外快 → 额外收入 */}
        <div className="px-2.5 md:px-6 pt-3 md:pt-4 pb-2 bg-[#F5F7FA] shrink-0 border-b border-gray-100/50">
          <div className="flex p-1 bg-white md:bg-gray-200/60 rounded-2xl overflow-x-auto scrollbar-hide shadow-sm md:shadow-inner gap-0.5 md:gap-2">
            {[
              { id: "OVERVIEW", label: "总览", icon: Landmark },
              { id: "TRANSFERS", label: "转账", icon: ArrowRightLeft },
              { id: "EXTRA_INCOME", label: "额外收入", icon: TrendingUp },
              { id: "EQUITY", label: "股权", icon: Briefcase },
              { id: "SETTINGS", label: "设置", icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex-1 min-w-[58px] md:min-w-[110px] py-1.5 md:py-2.5 rounded-xl text-[9px] md:text-xs font-black transition-all flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-gray-100 md:bg-white text-[#1A1A1A] shadow-none md:shadow-sm transform scale-[1.01]"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 active:scale-95"
                }`}
              >
                <tab.icon
                  size={15}
                  className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-colors ${activeTab === tab.id ? "text-[#C70000]" : "text-gray-400"}`}
                />
                <span className="opacity-95 md:opacity-100">{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-[-1px] md:bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-[#FFD700] rounded-t-sm md:hidden"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-4 md:p-8 pb-[calc(env(safe-area-inset-bottom)+32px)] md:pb-8 custom-scrollbar">
          {/* ==================== OVERVIEW TAB ==================== */}
          {activeTab === "OVERVIEW" && (
            <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto">
              {/* Month Selector Switcher */}
              <div className="flex items-center justify-between bg-stone-100 p-3 rounded-2xl border border-stone-200">
                <button
                  onClick={() => handleMonthShift(-1)}
                  className="p-2 hover:bg-stone-200 rounded-xl transition-all"
                >
                  <ChevronLeft size={18} className="text-stone-700" />
                </button>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-[#C70000]" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent font-black text-stone-900 text-sm md:text-base outline-none cursor-pointer"
                  />
                  {selectedMonthClosing ? (
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      🟢 已结账
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1 animate-pulse">
                      🟡 待结账
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleMonthShift(1)}
                  className="p-2 hover:bg-stone-200 rounded-xl transition-all"
                >
                  <ChevronRight size={18} className="text-stone-700" />
                </button>
              </div>

              {/* Total Assets Overview Header Card */}
              <div className="bg-[#1A1A1A] rounded-3xl p-5 md:p-8 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFD700] opacity-10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 text-center md:text-left">
                  <p className="text-[10px] md:text-xs font-bold text-[#FFD700] uppercase tracking-[0.2em] mb-1 md:mb-2 flex items-center justify-center md:justify-start gap-1">
                    <span>💰</span> {getMonthLabel(selectedMonth)} 期末总资金
                    (Ending Assets)
                  </p>
                  <h2 className="text-3xl md:text-6xl font-black text-[#FFD700] font-mono tracking-tight">
                    {isSelectedMonthLoading ? (
                      <span className="animate-pulse text-stone-400">
                        计算中...
                      </span>
                    ) : (
                      formatMoney(activeBalances.total)
                    )}
                  </h2>
                  <p className="text-[9px] md:text-[10px] text-gray-500 mt-1 md:mt-2 italic">
                    {activeBalances.startMonthLabel}
                  </p>
                </div>
                <div className="relative z-10 flex flex-col gap-2 w-full md:w-auto shrink-0">
                  {selectedMonthClosing ? (
                    <button
                      onClick={handleUnlockMonth}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 font-black text-xs md:text-sm transition-transform active:scale-95 justify-center"
                    >
                      🔓 解锁本月账目 (Unlock Month)
                    </button>
                  ) : (
                    <button
                      onClick={handleCloseMonth}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 font-black text-xs md:text-sm transition-transform active:scale-95 border border-emerald-500 justify-center"
                    >
                      🔒 结算并锁定本月 (Close & Lock)
                    </button>
                  )}
                  <button
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 font-black text-xs md:text-sm transition-transform active:scale-95 border border-red-500 justify-center"
                  >
                    <MinusCircle size={16} /> 补录支出 (Expense)
                  </button>
                  <button
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="bg-transparent hover:bg-white/10 text-gray-300 px-6 py-2 rounded-2xl flex items-center gap-2 font-bold text-xs transition-colors border border-dashed border-gray-600 justify-center"
                  >
                    <Archive size={14} /> 查阅历史账本 (History)
                  </button>
                </div>
              </div>

              {/* CASH AND BANK DETAIL CARDS WITH IN/OUT/BAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* CASH CARD */}
                <div
                  onClick={() => setViewLedger("CASH")}
                  className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="absolute right-0 top-0 p-4 md:p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Banknote
                      size={80}
                      className="text-green-600 md:w-[120px] md:h-[120px]"
                    />
                  </div>
                  <div className="flex justify-between items-start mb-3 md:mb-4">
                    <div className="p-2 md:p-3 bg-green-50 rounded-2xl text-green-600 inline-block">
                      <Banknote size={20} className="md:w-6 md:h-6" />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTransferForm({
                          type: "DEPOSIT",
                          fromAccount: "CASH",
                          toAccount: "BANK",
                          date: new Date().toISOString().split("T")[0],
                        });
                        setIsTransferModalOpen(true);
                      }}
                      className="text-[10px] bg-black text-white px-3 py-1.5 rounded-lg font-bold hover:bg-gray-800 transition-colors shadow-lg whitespace-nowrap"
                    >
                      存入 (Bank In)
                    </button>
                  </div>

                  <div className="space-y-2 relative z-10">
                    <p className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest">
                      Cash on Hand (现金账户)
                    </p>

                    {/* IN/OUT/BAL breakdown */}
                    <div className="grid grid-cols-3 border-t border-b border-gray-100 py-2 my-2 text-[11px] font-bold">
                      <div>
                        <div className="text-gray-400 text-[9px] uppercase">
                          期初 Bal
                        </div>
                        <div className="text-stone-700">
                          {formatMoney(activeBalances.cashStart)}
                        </div>
                      </div>
                      <div>
                        <div className="text-green-500 text-[9px] uppercase">
                          本月 In
                        </div>
                        <div className="text-green-600 font-mono">
                          +{formatMoney(activeBalances.cashIn)}
                        </div>
                      </div>
                      <div>
                        <div className="text-red-500 text-[9px] uppercase">
                          本月 Out
                        </div>
                        <div className="text-red-600 font-mono">
                          -{formatMoney(activeBalances.cashOut)}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-gray-500 text-[10px]">
                        期末结余 Balance
                      </span>
                      <h3 className="text-xl md:text-3xl font-black text-stone-900 font-mono">
                        {isSelectedMonthLoading
                          ? "计算中..."
                          : formatMoney(activeBalances.cashEnd)}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* BANK CARD */}
                <div
                  onClick={() => setViewLedger("BANK")}
                  className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="absolute right-0 top-0 p-4 md:p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Landmark
                      size={80}
                      className="text-blue-600 md:w-[120px] md:h-[120px]"
                    />
                  </div>
                  <div className="flex justify-between items-start mb-3 md:mb-4">
                    <div className="p-2 md:p-3 bg-blue-50 rounded-2xl text-blue-600 inline-block">
                      <Landmark size={20} className="md:w-6 md:h-6" />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTransferForm({
                          type: "WITHDRAWAL",
                          fromAccount: "BANK",
                          toAccount: "CASH",
                          date: new Date().toISOString().split("T")[0],
                        });
                        setIsTransferModalOpen(true);
                      }}
                      className="text-[10px] bg-black text-white px-3 py-1.5 rounded-lg font-bold hover:bg-gray-800 transition-colors shadow-lg whitespace-nowrap"
                    >
                      提款 (Withdraw)
                    </button>
                  </div>

                  <div className="space-y-2 relative z-10">
                    <p className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest">
                      Bank & Digital (银行账户)
                    </p>

                    {/* IN/OUT/BAL breakdown */}
                    <div className="grid grid-cols-3 border-t border-b border-gray-100 py-2 my-2 text-[11px] font-bold">
                      <div>
                        <div className="text-gray-400 text-[9px] uppercase">
                          期初 Bal
                        </div>
                        <div className="text-stone-700">
                          {formatMoney(activeBalances.bankStart)}
                        </div>
                      </div>
                      <div>
                        <div className="text-green-500 text-[9px] uppercase">
                          本月 In
                        </div>
                        <div className="text-green-600 font-mono">
                          +{formatMoney(activeBalances.bankIn)}
                        </div>
                      </div>
                      <div>
                        <div className="text-red-500 text-[9px] uppercase">
                          本月 Out
                        </div>
                        <div className="text-red-600 font-mono">
                          -{formatMoney(activeBalances.bankOut)}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-gray-500 text-[10px]">
                        期末结余 Balance
                      </span>
                      <h3 className="text-xl md:text-3xl font-black text-stone-900 font-mono">
                        {isSelectedMonthLoading
                          ? "计算中..."
                          : formatMoney(activeBalances.bankEnd)}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Month Closings Timeline List */}
              <div className="bg-white rounded-3xl p-5 md:p-6 border border-gray-150 shadow-sm space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <div>
                    <h3 className="font-black text-sm md:text-base text-stone-900 flex items-center gap-1.5">
                      <span>📅</span> 历史月度大盘汇总 (Monthly Treasury
                      Timeline)
                    </h3>
                    <p className="text-[9px] text-stone-400 uppercase tracking-wider font-bold">
                      Historical Closings & Balance Tracking
                    </p>
                  </div>
                  <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-bold">
                    起自{" "}
                    {config.initialDate
                      ? config.initialDate.substring(0, 7)
                      : "2025-11"}
                  </span>
                </div>

                <div className="divide-y divide-gray-150 max-h-80 overflow-y-auto custom-scrollbar space-y-1 pr-1">
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
                              <span className="bg-green-100 text-green-850 text-[8px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
                                已结账
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-850 text-[8px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
                                待结算
                              </span>
                            )}

                            {unpaidCount > 0 && (
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${isSelected ? "bg-red-900/50 text-red-200" : "bg-red-50 text-red-600 border border-red-100"}`}
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
                                    className={`font-black ${isSelected ? "text-[#FFD700]" : "text-[#1A1A1A]"}`}
                                  >
                                    {formatMoney(
                                      closing.cashEnd + closing.bankEnd,
                                    )}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-stone-400 italic">
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

          {/* ==================== EXTRA INCOME TAB (额外收入) ==================== */}
          {activeTab === "EXTRA_INCOME" && (
            <div className="max-w-5xl mx-auto space-y-4 md:space-y-8 animate-in fade-in slide-in-from-right-4">
              {/* Hero Card - 手机适配 */}
              <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-2xl md:rounded-[2.5rem] p-4 md:p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-4 md:gap-8 border border-emerald-500/30">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 text-center md:text-left space-y-1 md:space-y-2 w-full">
                  <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-emerald-100 text-[10px] font-black uppercase tracking-widest border border-white/10">
                    <TrendingUp size={12} /> 额外收入 Extra Revenue
                  </div>
                  <h2 className="text-2xl md:text-6xl font-black text-white font-mono tracking-tighter drop-shadow-sm">
                    {formatMoney(extraIncomeStats.total)}
                  </h2>
                  <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-2 md:gap-4 text-emerald-100 text-xs font-bold">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} /> 本月:{" "}
                      {formatMoney(extraIncomeStats.thisMonthTotal)}
                    </span>
                    <span className="bg-yellow-400/20 text-yellow-200 px-2 py-0.5 rounded border border-yellow-400/30 text-[10px]">
                      ⚠️ 非营业额
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
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
                  className="relative z-10 bg-white text-emerald-800 px-5 md:px-8 py-3 md:py-4 rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.2)] flex items-center gap-2 md:gap-3 font-black text-xs md:text-sm transition-all hover:scale-105 active:scale-95 hover:bg-emerald-50 w-full md:w-auto justify-center"
                >
                  <div className="bg-emerald-100 p-1.5 rounded-full">
                    <Plus size={16} className="text-emerald-700" />
                  </div>
                  <span>记录新收入</span>
                </button>
              </div>

              {/* Breakdown Cards - 手机 2x2 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[
                  {
                    l: "Electricity",
                    v: extraIncomeStats.breakdown.electricity,
                    c: "text-yellow-600",
                    b: "bg-yellow-50",
                    i: Zap,
                  },
                  {
                    l: "Water",
                    v: extraIncomeStats.breakdown.water,
                    c: "text-cyan-600",
                    b: "bg-cyan-50",
                    i: Droplets,
                  },
                  {
                    l: "Rent",
                    v: extraIncomeStats.breakdown.rent,
                    c: "text-indigo-600",
                    b: "bg-indigo-50",
                    i: Home,
                  },
                  {
                    l: "Other",
                    v: extraIncomeStats.breakdown.other,
                    c: "text-emerald-600",
                    b: "bg-emerald-50",
                    i: Coins,
                  },
                ].map((card) => (
                  <div
                    key={card.l}
                    className="bg-white p-3 md:p-5 rounded-2xl md:rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between h-24 md:h-32 relative group overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 p-3 md:p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <card.i size={48} className="md:w-16 md:h-16" />
                    </div>
                    <div className="relative z-10">
                      <div
                        className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl ${card.b} ${card.c} flex items-center justify-center mb-2 md:mb-3 shadow-inner`}
                      >
                        <card.i
                          size={16}
                          className="md:w-5 md:h-5"
                          fill="currentColor"
                        />
                      </div>
                      <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                        {card.l}
                      </p>
                      <p className="text-sm md:text-lg font-black text-[#1A1A1A]">
                        {formatMoney(card.v)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* History with Month Filter */}
              <div className="bg-white rounded-2xl md:rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden">
                {/* Header with Month Navigator */}
                <div className="p-4 md:p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <h3 className="font-black text-base md:text-lg text-[#1A1A1A] flex items-center gap-2">
                    <History
                      size={18}
                      className="md:w-5 md:h-5 text-gray-400"
                    />{" "}
                    收入记录
                  </h3>
                  {/* 月份导航器 */}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={() => navigateMonth("prev")}
                      className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 active:scale-95 transition-all shadow-sm"
                    >
                      <ChevronLeft size={16} className="text-gray-500" />
                    </button>
                    <div className="flex-1 md:flex-none text-center bg-white border border-gray-200 px-4 py-2 rounded-lg font-black text-xs md:text-sm text-[#1A1A1A] shadow-sm min-w-[140px]">
                      {getMonthLabel(incomeFilterMonth)}
                    </div>
                    <button
                      onClick={() => navigateMonth("next")}
                      className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 active:scale-95 transition-all shadow-sm"
                    >
                      <ChevronRight size={16} className="text-gray-500" />
                    </button>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full border border-gray-200 whitespace-nowrap">
                      {extraIncomeStats.records.length} 笔
                    </span>
                  </div>
                </div>

                {/* 当月小计 */}
                {extraIncomeStats.records.length > 0 && (
                  <div className="px-4 md:px-6 py-2 bg-emerald-50/50 border-b border-emerald-100 flex justify-between items-center">
                    <span className="text-[10px] md:text-xs font-bold text-emerald-600">
                      当月小计
                    </span>
                    <span className="font-mono font-black text-sm md:text-base text-emerald-700">
                      {formatMoney(extraIncomeStats.filteredTotal)}
                    </span>
                  </div>
                )}

                <div className="divide-y divide-gray-100">
                  {extraIncomeStats.records.length === 0 ? (
                    <div className="p-8 md:p-12 text-center text-gray-400 text-sm font-bold flex flex-col items-center">
                      <div className="bg-gray-100 p-4 rounded-full mb-3">
                        <Archive size={24} className="opacity-50" />
                      </div>
                      本月暂无收入记录
                    </div>
                  ) : (
                    extraIncomeStats.records
                      .sort(
                        (a, b) =>
                          new Date(b.date).getTime() -
                          new Date(a.date).getTime(),
                      )
                      .map((t) => (
                        <div
                          key={t.id}
                          className="p-3 md:p-5 flex items-center justify-between hover:bg-gray-50 transition-colors group"
                        >
                          <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center bg-gray-100 text-gray-600 shrink-0">
                              <Recycle
                                size={16}
                                className="md:w-5 md:h-5 opacity-80"
                                fill="currentColor"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs md:text-sm text-[#1A1A1A] truncate">
                                {t.note?.replace("[代收] ", "") || "Income"}
                              </div>
                              <div className="text-[10px] text-gray-400 font-bold mt-0.5 flex items-center gap-1 md:gap-2 flex-wrap">
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded">
                                  {t.date}
                                </span>
                                <span>•</span>
                                <span className="uppercase">{t.toAccount}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 md:gap-4 shrink-0 ml-1.5 md:ml-2">
                            <span className="font-mono font-black text-[11px] md:text-base text-emerald-600 bg-emerald-50 px-1.5 md:px-3 py-1 rounded-lg whitespace-nowrap">
                              +{formatMoney(t.amount)}
                            </span>
                            <div className="flex gap-0.5 md:gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={() => handleEditIncome(t)}
                                className="p-1 md:p-2 bg-white border border-gray-200 text-gray-400 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-90 active:bg-gray-100"
                                title="编辑 (Edit)"
                              >
                                <Edit3
                                  size={12}
                                  className="w-[13px] h-[13px] md:w-[14px] md:h-[14px]"
                                />
                              </button>
                              <button
                                onClick={() => handleGenerateReceipt(t)}
                                disabled={isGeneratingPdf}
                                className="p-1 md:p-2 bg-white border border-gray-200 text-gray-400 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-90 active:bg-gray-100"
                                title="打印收据"
                              >
                                {isGeneratingPdf &&
                                printingRecord?.id === t.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Printer
                                    size={12}
                                    className="w-[13px] h-[13px] md:w-[14px] md:h-[14px]"
                                  />
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteTransfer(t.id)}
                                className="p-1 md:p-2 bg-white border border-gray-200 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-sm active:scale-90 active:bg-gray-100"
                              >
                                <Trash2
                                  size={12}
                                  className="w-[13px] h-[13px] md:w-[14px] md:h-[14px]"
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== EQUITY TAB ==================== */}
          {activeTab === "EQUITY" && (
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4 md:mb-6">
                  <div>
                    <h3 className="font-black text-base md:text-lg text-[#1A1A1A] flex items-center gap-2">
                      <Users size={18} className="md:w-5 md:h-5" /> 股东与股本
                    </h3>
                    <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1">
                      Paid-up Capital: {formatMoney(totalCapital)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShareholderForm({
                        name: "",
                        investmentAmount: 0,
                        equityPercentage: 0,
                      });
                      setIsShareholderFormOpen(true);
                    }}
                    className="bg-[#1A1A1A] text-[#FFD700] px-3 md:px-4 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-black flex items-center gap-2 whitespace-nowrap"
                  >
                    <UserPlus size={14} /> 添加股东
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {(config.shareholders || []).map((s) => {
                    const shareholderTransfers = transfers.filter(
                      (t) =>
                        (t.fromAccount === "SHAREHOLDER" &&
                          t.note?.includes(s.name)) ||
                        (t.toAccount === "SHAREHOLDER" &&
                          t.note?.includes(s.name)),
                    );
                    const totalInject = shareholderTransfers
                      .filter((t) => t.fromAccount === "SHAREHOLDER")
                      .reduce((sum, t) => sum + t.amount, 0);
                    const totalRepay = shareholderTransfers
                      .filter((t) => t.toAccount === "SHAREHOLDER")
                      .reduce((sum, t) => sum + t.amount, 0);
                    const netInjection = totalInject - totalRepay;

                    const shareholderDividends = dividendHistory.filter(
                      (t) => t.company === s.name,
                    );
                    const totalDividend = shareholderDividends.reduce(
                      (sum, t) => sum + t.amount,
                      0,
                    );

                    return (
                      <div
                        key={s.id}
                        className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center group relative hover:border-gray-300 transition-colors"
                      >
                        <div className="w-full">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-black text-sm text-[#1A1A1A]">
                              {s.name}{" "}
                              <span className="text-[10px] text-gray-400 font-normal">
                                ({s.role || "Investor"})
                              </span>
                            </h4>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setShareholderForm(s);
                                  setIsShareholderFormOpen(true);
                                }}
                                className="p-1.5 bg-white rounded-lg text-gray-400 hover:text-black shadow-sm"
                              >
                                <Settings size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteShareholder(s.id)}
                                className="p-1.5 bg-white rounded-lg text-gray-400 hover:text-red-600 shadow-sm"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div className="bg-white p-2 rounded-xl border border-gray-100 text-center">
                              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                股本 (Capital)
                              </div>
                              <div className="text-xs font-mono font-black text-blue-600">
                                {formatMoney(s.investmentAmount)}
                              </div>
                              <div className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full inline-block mt-0.5 font-bold">
                                {s.equityPercentage}%
                              </div>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-gray-100 text-center">
                              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                净垫资 (Net Inj.)
                              </div>
                              <div
                                className={`text-xs font-mono font-black ${netInjection >= 0 ? "text-green-600" : "text-red-500"}`}
                              >
                                {formatMoney(netInjection)}
                              </div>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-gray-100 text-center">
                              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                已分红 (Dividends)
                              </div>
                              <div className="text-xs font-mono font-black text-red-500">
                                {formatMoney(totalDividend)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-black text-base md:text-lg text-[#1A1A1A] flex items-center gap-2">
                      <PiggyBank size={18} className="md:w-5 md:h-5" />{" "}
                      股东注资/垫资
                    </h3>
                    <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1">
                      Capital Injection
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsRepaymentModalOpen(true)}
                      className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 md:px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 flex items-center gap-2 whitespace-nowrap"
                    >
                      <ArrowDownLeft size={14} /> 还钱给股东
                    </button>
                    <button
                      onClick={() => setIsInjectionModalOpen(true)}
                      className="bg-green-50 text-green-700 border border-green-100 px-3 md:px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-100 flex items-center gap-2 whitespace-nowrap"
                    >
                      <Plus size={14} /> 股东注资
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {(() => {
                    const shareholderTransfers = transfers.filter(
                      (t) =>
                        t.fromAccount === ("SHAREHOLDER" as any) ||
                        t.toAccount === ("SHAREHOLDER" as any),
                    );
                    if (shareholderTransfers.length === 0) {
                      return (
                        <div className="text-center py-6 text-gray-400 text-xs italic">
                          暂无记录
                        </div>
                      );
                    }

                    const grouped = shareholderTransfers.reduce(
                      (acc, t) => {
                        let name = "Unknown";
                        if (t.toAccount === ("SHAREHOLDER" as any)) {
                          const match = t.note?.match(/\[还钱给股东\](.*?):/);
                          name = match ? match[1].trim() : "Unknown";
                        } else {
                          const match = t.note?.match(/\[股东注资\](.*?):/);
                          if (match) {
                            name = match[1].trim();
                          } else {
                            name =
                              t.note
                                ?.replace(/\[股东注资\]|\[垫资\]/g, "")
                                .split(":")[0]
                                ?.trim() || "Unknown";
                          }
                        }
                        if (!acc[name]) acc[name] = [];
                        acc[name].push(t);
                        return acc;
                      },
                      {} as Record<string, typeof shareholderTransfers>,
                    );

                    return Object.entries(grouped).map(([name, items]) => {
                      const isExpanded = expandedInjections[name];
                      const toggleExpand = () =>
                        setExpandedInjections((prev) => ({
                          ...prev,
                          [name]: !prev[name],
                        }));
                      const totalInject = items
                        .filter((t) => t.fromAccount === ("SHAREHOLDER" as any))
                        .reduce((sum, t) => sum + t.amount, 0);
                      const totalRepay = items
                        .filter((t) => t.toAccount === ("SHAREHOLDER" as any))
                        .reduce((sum, t) => sum + t.amount, 0);
                      const netTotal = totalInject - totalRepay;

                      return (
                        <div
                          key={name}
                          className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm transition-all duration-200"
                        >
                          <div
                            onClick={toggleExpand}
                            className="cursor-pointer bg-gray-50 p-3.5 flex justify-between items-center border-b border-gray-100 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-black text-sm text-gray-900 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                                {name ? name.charAt(0).toUpperCase() : "?"}
                              </div>
                              <div>
                                <div>{name}</div>
                                <div className="text-[10px] text-gray-500 font-normal">
                                  净垫资:{" "}
                                  <span
                                    className={
                                      netTotal >= 0
                                        ? "text-green-600 font-bold"
                                        : "text-red-500 font-bold"
                                    }
                                  >
                                    {formatMoney(netTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-[10px] text-gray-400 font-bold">
                                  总注资:{" "}
                                  <span className="text-green-600">
                                    +{formatMoney(totalInject)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold">
                                  已还款:{" "}
                                  <span className="text-indigo-500">
                                    -{formatMoney(totalRepay)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-gray-400 bg-white p-1 rounded-full shadow-sm border border-gray-100">
                                {isExpanded ? (
                                  <ChevronUp size={14} />
                                ) : (
                                  <ChevronDown size={14} />
                                )}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="p-2 space-y-1 bg-white animate-in slide-in-from-top-2 fade-in duration-200">
                              {items
                                .sort(
                                  (a, b) =>
                                    new Date(b.date).getTime() -
                                    new Date(a.date).getTime(),
                                )
                                .map((t) => {
                                  const isRepay =
                                    t.toAccount === ("SHAREHOLDER" as any);
                                  return (
                                    <div
                                      key={t.id}
                                      className="flex justify-between items-center p-2.5 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100"
                                    >
                                      <div>
                                        <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                          {isRepay ? (
                                            <ArrowDownLeft
                                              size={12}
                                              className="text-indigo-500"
                                            />
                                          ) : (
                                            <ArrowUpRight
                                              size={12}
                                              className="text-green-500"
                                            />
                                          )}
                                          {t.note
                                            ?.split(":")
                                            .slice(1)
                                            .join(":")
                                            .trim() ||
                                            (isRepay
                                              ? "Repayment"
                                              : "Injection")}
                                        </div>
                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                          {t.date} •{" "}
                                          {isRepay
                                            ? `From ${t.fromAccount}`
                                            : `Into ${t.toAccount}`}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span
                                          className={`font-mono font-bold text-xs ${isRepay ? "text-indigo-600" : "text-green-600"}`}
                                        >
                                          {isRepay ? "-" : "+"}
                                          {formatMoney(t.amount)}
                                        </span>
                                        <button
                                          onClick={() =>
                                            handleDeleteTransfer(t.id)
                                          }
                                          className="text-gray-300 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded-lg"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-black text-base md:text-lg text-[#1A1A1A] flex items-center gap-2">
                      <Gem size={18} className="md:w-5 md:h-5" /> 股东分红 /
                      提款
                    </h3>
                    <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1">
                      Dividend Payouts (Wages)
                    </p>
                  </div>
                  <button
                    onClick={() => setIsDividendModalOpen(true)}
                    className="bg-red-50 text-red-700 border border-red-100 px-3 md:px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 flex items-center gap-2 whitespace-nowrap"
                  >
                    <MinusCircle size={14} /> 分发分红
                  </button>
                </div>
                <div className="space-y-4">
                  {(() => {
                    if (dividendHistory.length === 0) {
                      return (
                        <div className="text-center py-6 text-gray-400 text-xs italic">
                          暂无分红记录
                        </div>
                      );
                    }

                    const grouped = dividendHistory.reduce(
                      (acc, t) => {
                        const name = t.company || "Unknown";
                        if (!acc[name]) acc[name] = [];
                        acc[name].push(t);
                        return acc;
                      },
                      {} as Record<string, typeof dividendHistory>,
                    );

                    return Object.entries(grouped).map(([name, items]) => {
                      const isExpanded = expandedDividends[name];
                      const toggleExpand = () =>
                        setExpandedDividends((prev) => ({
                          ...prev,
                          [name]: !prev[name],
                        }));
                      const totalDividend = items.reduce(
                        (sum, t) => sum + t.amount,
                        0,
                      );

                      return (
                        <div
                          key={name}
                          className="border border-red-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all duration-200"
                        >
                          <div
                            onClick={toggleExpand}
                            className="cursor-pointer bg-red-50/50 p-3.5 flex justify-between items-center border-b border-red-50 hover:bg-red-50 transition-colors"
                          >
                            <div className="font-black text-sm text-gray-900 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                                {name ? name.charAt(0).toUpperCase() : "?"}
                              </div>
                              <div>
                                <div>{name}</div>
                                <div className="text-[10px] text-gray-500 font-normal">
                                  累计分红:{" "}
                                  <span className="text-red-500 font-bold">
                                    {formatMoney(totalDividend)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-[10px] text-gray-400 font-bold">
                                  已付:{" "}
                                  <span className="text-red-500">
                                    {formatMoney(totalDividend)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-gray-400 bg-white p-1 rounded-full shadow-sm border border-gray-100">
                                {isExpanded ? (
                                  <ChevronUp size={14} />
                                ) : (
                                  <ChevronDown size={14} />
                                )}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="p-2 space-y-1 bg-white animate-in slide-in-from-top-2 fade-in duration-200">
                              {items
                                .sort(
                                  (a, b) =>
                                    new Date(b.time).getTime() -
                                    new Date(a.time).getTime(),
                                )
                                .map((t) => {
                                  return (
                                    <div
                                      key={t.id}
                                      className="flex justify-between items-center p-2.5 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100"
                                    >
                                      <div>
                                        <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                          <ArrowDownLeft
                                            size={12}
                                            className="text-red-500"
                                          />
                                          {t.note || "Dividend"}
                                        </div>
                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                          {t.time.split("T")[0]} • Via{" "}
                                          {t.paymentMethod}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="font-mono font-bold text-xs text-red-600">
                                          -{formatMoney(t.amount)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TRANSFERS TAB (手机适配) ==================== */}
          {activeTab === "TRANSFERS" && (
            <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
              <div className="flex justify-between items-center bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="font-black text-sm md:text-lg text-[#1A1A1A] flex items-center gap-2">
                  <History size={18} className="md:w-5 md:h-5" /> 转账记录
                </h3>
                <button
                  onClick={() => {
                    setTransferForm({
                      type: "DEPOSIT",
                      fromAccount: "CASH",
                      toAccount: "BANK",
                      date: new Date().toISOString().split("T")[0],
                    });
                    setIsTransferModalOpen(true);
                  }}
                  className="bg-[#1A1A1A] text-[#FFD700] px-3 md:px-4 py-2 rounded-xl font-bold text-xs shadow-lg hover:bg-black flex items-center gap-2"
                >
                  <Plus size={14} className="md:w-4 md:h-4" /> 新增记录
                </button>
              </div>
              <div className="space-y-3">
                {transfers.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 font-bold text-sm">
                    暂无转账记录
                  </div>
                ) : (
                  transfers.map((t) => {
                    if (
                      t.fromAccount === ("OTHER" as any) ||
                      t.fromAccount === ("SHAREHOLDER" as any)
                    )
                      return null;
                    return (
                      <div
                        key={t.id}
                        className="bg-white p-3 md:p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm gap-3"
                      >
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                          <div
                            className={`p-2 md:p-3 rounded-xl shrink-0 ${t.type === "DEPOSIT" ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"}`}
                          >
                            {t.type === "DEPOSIT" ? (
                              <ArrowUpRight
                                size={16}
                                className="md:w-5 md:h-5"
                              />
                            ) : (
                              <ArrowDownLeft
                                size={16}
                                className="md:w-5 md:h-5"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-black text-xs md:text-sm text-[#1A1A1A]">
                              {t.type === "DEPOSIT"
                                ? "Cash Bank In (存入)"
                                : "Withdrawal (提款)"}
                            </h4>
                            <div className="text-[10px] md:text-xs text-gray-500 font-mono mt-0.5">
                              {t.date.split("T")[0]} • {t.fromAccount} ➔{" "}
                              {t.toAccount}
                            </div>
                            {t.note && (
                              <div className="text-[9px] md:text-[10px] text-gray-400 mt-1 italic truncate">
                                "{t.note}"
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-4 shrink-0">
                          <span className="font-mono font-black text-sm md:text-lg whitespace-nowrap">
                            RM {t.amount.toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleDeleteTransfer(t.id)}
                            className="p-1.5 md:p-2 text-gray-300 hover:text-red-500 rounded-full transition-colors"
                          >
                            <Trash2 size={14} className="md:w-4 md:h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ==================== SETTINGS TAB (密码锁) ==================== */}
          {activeTab === "SETTINGS" && (
            <div className="max-w-2xl mx-auto">
              {!isSettingsUnlocked ? (
                /* 🔐 密码锁界面 */
                <div className="bg-white p-6 md:p-10 rounded-[2rem] shadow-lg border border-gray-200 text-center space-y-6">
                  <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                    <Lock size={36} className="text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-xl text-[#1A1A1A]">
                      设置已锁定
                    </h3>
                    <p className="text-xs text-gray-400 mt-2 font-bold">
                      请输入密码以解锁初始资金设置
                    </p>
                  </div>
                  <div className="max-w-xs mx-auto">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={10}
                      value={settingsPasswordInput}
                      onChange={(e) => {
                        setSettingsPasswordInput(e.target.value);
                        setSettingsPasswordError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSettingsUnlock();
                      }}
                      placeholder="输入密码..."
                      className={`w-full p-4 bg-gray-50 rounded-xl font-mono font-black text-2xl text-center outline-none border-2 tracking-[0.5em] transition-colors ${
                        settingsPasswordError
                          ? "border-red-400 bg-red-50 animate-shake"
                          : "border-transparent focus:border-[#FFD700]"
                      }`}
                    />
                    {settingsPasswordError && (
                      <p className="text-red-500 text-xs font-bold mt-2 animate-in fade-in">
                        ❌ 密码错误，请重试
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleSettingsUnlock}
                    className="bg-[#1A1A1A] text-[#FFD700] px-8 py-3 rounded-xl font-black shadow-lg hover:bg-black transition-colors flex items-center justify-center gap-2 mx-auto"
                  >
                    <Lock size={16} /> 解锁 (Unlock)
                  </button>
                </div>
              ) : (
                /* 🔓 已解锁的设置界面 */
                <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-xl text-[#1A1A1A] flex items-center gap-2">
                      <Settings size={24} /> 初始资金设置
                    </h3>
                    <button
                      onClick={() => {
                        setIsSettingsUnlocked(false);
                        setSettingsPasswordInput("");
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-colors"
                    >
                      <Lock size={12} /> 重新锁定
                    </button>
                  </div>
                  <div className="space-y-6">
                    <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-xs text-yellow-800 font-bold flex items-start gap-2">
                      <Info size={16} className="mt-0.5 shrink-0" />
                      <div>
                        ⚠️ 注意：修改此设置会重置资金计算的起点。
                        <br />
                        请确保输入的金额是 <strong>
                          {config.initialDate}
                        </strong>{" "}
                        当天的实际结余。
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase mb-2 block">
                        生效日期 (Start Date)
                      </label>
                      <input
                        type="date"
                        value={config.initialDate}
                        onChange={(e) =>
                          setConfig({ ...config, initialDate: e.target.value })
                        }
                        className="w-full p-4 bg-gray-50 rounded-xl font-bold border-2 border-transparent focus:border-[#FFD700] outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase mb-2 block">
                          Initial Cash (现金)
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                            RM
                          </span>
                          <input
                            type="number"
                            value={config.initialCash}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                initialCash: parseFloat(e.target.value),
                              })
                            }
                            className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-xl font-mono font-black text-lg border-2 border-transparent focus:border-[#FFD700] outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase mb-2 block">
                          Initial Bank (银行)
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                            RM
                          </span>
                          <input
                            type="number"
                            value={config.initialBank}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                initialBank: parseFloat(e.target.value),
                              })
                            }
                            className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-xl font-mono font-black text-lg border-2 border-transparent focus:border-[#FFD700] outline-none"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveConfig}
                      className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black shadow-lg hover:bg-black transition-colors flex items-center justify-center gap-2"
                    >
                      <Save size={18} /> 保存并重新计算
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ==================== MODALS ==================== */}

        {/* Transfer Modal - 手机 safe area 适配 */}
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-6">
                新增资金记录
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                  <button
                    onClick={() =>
                      setTransferForm({
                        ...transferForm,
                        type: "DEPOSIT",
                        fromAccount: "CASH",
                        toAccount: "BANK",
                      })
                    }
                    className={`py-2.5 rounded-lg text-xs font-bold transition-all ${transferForm.type === "DEPOSIT" ? "bg-white shadow-sm text-green-700" : "text-gray-400"}`}
                  >
                    存入 (Bank In)
                  </button>
                  <button
                    onClick={() =>
                      setTransferForm({
                        ...transferForm,
                        type: "WITHDRAWAL",
                        fromAccount: "BANK",
                        toAccount: "CASH",
                      })
                    }
                    className={`py-2.5 rounded-lg text-xs font-bold transition-all ${transferForm.type === "WITHDRAWAL" ? "bg-white shadow-sm text-blue-700" : "text-gray-400"}`}
                  >
                    提款 (Withdraw)
                  </button>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                    Date
                  </label>
                  <input
                    type="date"
                    value={transferForm.date}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, date: e.target.value })
                    }
                    className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                    Amount (RM)
                  </label>
                  <input
                    type="number"
                    value={transferForm.amount}
                    onChange={(e) =>
                      setTransferForm({
                        ...transferForm,
                        amount: parseFloat(e.target.value),
                      })
                    }
                    className="w-full p-4 bg-gray-50 rounded-xl font-mono font-black text-xl outline-none focus:border-[#FFD700] border-2 border-transparent"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                    Note
                  </label>
                  <input
                    type="text"
                    value={transferForm.note || ""}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, note: e.target.value })
                    }
                    className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none"
                    placeholder="e.g. ATM Deposit"
                  />
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setIsTransferModalOpen(false)}
                    className="flex-1 py-3 bg-white border border-gray-200 text-gray-500 font-bold rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTransfer}
                    className="flex-[2] py-3 bg-[#1A1A1A] text-[#FFD700] font-bold rounded-xl text-sm shadow-lg hover:bg-black"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shareholder Modal - 手机 safe area 适配 */}
        {isShareholderFormOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-4">
                股东资料 (Shareholder)
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Name
                  </label>
                  <input
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={shareholderForm.name}
                    onChange={(e) =>
                      setShareholderForm({
                        ...shareholderForm,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Role (Title)
                  </label>
                  <input
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={shareholderForm.role || ""}
                    onChange={(e) =>
                      setShareholderForm({
                        ...shareholderForm,
                        role: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                      Capital (RM)
                    </label>
                    <input
                      type="number"
                      className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                      value={shareholderForm.investmentAmount}
                      onChange={(e) =>
                        setShareholderForm({
                          ...shareholderForm,
                          investmentAmount: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                      Equity (%)
                    </label>
                    <input
                      type="number"
                      className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                      value={shareholderForm.equityPercentage}
                      onChange={(e) =>
                        setShareholderForm({
                          ...shareholderForm,
                          equityPercentage: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveShareholder}
                  className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-bold mt-2"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsShareholderFormOpen(false)}
                  className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Injection Modal - 手机 safe area 适配 */}
        {isInjectionModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 max-h-[90vh] overflow-y-auto"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-4">
                股东注资 (Injection)
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Shareholder (股东)
                  </label>
                  <select
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={injectionForm.shareholderName}
                    onChange={(e) =>
                      setInjectionForm({
                        ...injectionForm,
                        shareholderName: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Shareholder...</option>
                    {config.shareholders?.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Amount (金额)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-50 rounded-xl font-black text-lg outline-none border-2 border-transparent focus:border-[#FFD700]"
                    value={injectionForm.amount}
                    onChange={(e) =>
                      setInjectionForm({
                        ...injectionForm,
                        amount: e.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Into Account (存入账户)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setInjectionForm({
                          ...injectionForm,
                          toAccount: "BANK",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${injectionForm.toAccount === "BANK" ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      BANK
                    </button>
                    <button
                      onClick={() =>
                        setInjectionForm({
                          ...injectionForm,
                          toAccount: "CASH",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${injectionForm.toAccount === "CASH" ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      CASH
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Date (日期)
                  </label>
                  <input
                    type="date"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={injectionForm.date}
                    onChange={(e) =>
                      setInjectionForm({
                        ...injectionForm,
                        date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Note (备注)
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={injectionForm.note}
                    onChange={(e) =>
                      setInjectionForm({
                        ...injectionForm,
                        note: e.target.value,
                      })
                    }
                    placeholder="e.g. Working Capital"
                  />
                </div>
                <button
                  onClick={handleSaveInjection}
                  className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-bold mt-2 shadow-lg"
                >
                  确认注资 (Confirm)
                </button>
                <button
                  onClick={() => setIsInjectionModalOpen(false)}
                  className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Income Modal - 支持新增 + 编辑模式，手机 safe area 适配 */}
        {isIncomeModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 max-h-[90vh] overflow-y-auto"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-4">
                {editingIncomeRecord
                  ? "✏️ 编辑收入记录"
                  : "代收/杂项收入 (Extra Income)"}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Source (来源)
                  </label>
                  <input
                    list="income_sources"
                    type="text"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={incomeForm.source}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, source: e.target.value })
                    }
                    placeholder="e.g. 隔壁店铺"
                  />
                  <datalist id="income_sources">
                    {incomeSourceHistory.map((src, idx) => (
                      <option key={idx} value={src} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Category (类别)
                  </label>
                  <select
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={incomeForm.category}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, category: e.target.value })
                    }
                  >
                    <option value="UTILITIES_ELECTRIC">
                      电费 (Electricity)
                    </option>
                    <option value="UTILITIES_WATER">水费 (Water)</option>
                    <option value="RENT">租金 (Rent)</option>
                    <option value="OTHER">其他 (Other)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Amount (金额)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-50 rounded-xl font-black text-lg outline-none border-2 border-transparent focus:border-[#FFD700]"
                    value={incomeForm.amount}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, amount: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Into Account (存入账户)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setIncomeForm({ ...incomeForm, toAccount: "CASH" })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${incomeForm.toAccount === "CASH" ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      CASH
                    </button>
                    <button
                      onClick={() =>
                        setIncomeForm({ ...incomeForm, toAccount: "BANK" })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${incomeForm.toAccount === "BANK" ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      BANK
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Date (日期)
                  </label>
                  <input
                    type="date"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={incomeForm.date}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Note (备注)
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={incomeForm.note}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, note: e.target.value })
                    }
                    placeholder="Optional..."
                  />
                </div>
                <button
                  onClick={handleSaveIncome}
                  className={`w-full py-3 rounded-xl font-bold mt-2 shadow-lg ${editingIncomeRecord ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-green-600 text-white hover:bg-green-700"}`}
                >
                  {editingIncomeRecord
                    ? "✅ 确认更新 (Update)"
                    : "确认收入 (Confirm)"}
                </button>
                <button
                  onClick={() => {
                    setIsIncomeModalOpen(false);
                    setEditingIncomeRecord(null);
                  }}
                  className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expense Modal - 手机 safe area 适配 */}
        {isExpenseModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 max-h-[90vh] overflow-y-auto"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-2">
                补录/记录支出
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Category
                  </label>
                  <select
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={expenseForm.category}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        category: e.target.value,
                      })
                    }
                  >
                    <option value="RENOVATION">装修工程 (Renovation)</option>
                    <option value="EQUIPMENT">设备采购 (Equipment)</option>
                    <option value="RENT">租金 (Rent)</option>
                    <option value="UTILITIES_ELECTRIC">
                      电费 (Electricity)
                    </option>
                    <option value="UTILITIES_WATER">水费 (Water)</option>
                    <option value="CLEANING_SUPPLY">
                      清洁药水 (Cleaning Supply)
                    </option>
                    <option value="MAINTENANCE">
                      维修/保养/清洁 (Maintenance)
                    </option>
                    <option value="SUPPLIES">消耗杂品 (Supplies)</option>
                    <option value="SUPPLIER">一般进货 (General)</option>
                    <option value="SALARY">薪资预支 (Salary)</option>
                    <option value="LICENSE">执照 (License)</option>
                    <option value="ADVERTISING">
                      广告与推广 (Advertising & Promotion)
                    </option>
                    <option value="IT_SOFTWARE">
                      软件与信息技术 (IT & Software)
                    </option>
                    <option value="BANK_FEE">银行手续费 (Bank Fees)</option>
                    <option value="OTHER">其他 (Other)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Description / Item
                  </label>
                  <input
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={expenseForm.company}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        company: e.target.value,
                      })
                    }
                    placeholder="e.g. Public Bank MDR"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Amount (RM)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={expenseForm.amount}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        amount: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Payment Source
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setExpenseForm({
                          ...expenseForm,
                          paymentMethod: "BANK_TRANSFER",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${expenseForm.paymentMethod === "BANK_TRANSFER" ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      BANK
                    </button>
                    <button
                      onClick={() =>
                        setExpenseForm({
                          ...expenseForm,
                          paymentMethod: "CASH",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${expenseForm.paymentMethod === "CASH" ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      CASH
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Date (Backdate Allowed)
                  </label>
                  <input
                    type="date"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={expenseForm.time?.split("T")[0]}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, time: e.target.value })
                    }
                  />
                </div>
                <button
                  onClick={handleSaveExpense}
                  className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-bold mt-2 shadow-lg"
                >
                  确认支出 (Confirm)
                </button>
                <button
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dividend Modal - 手机 safe area 适配 */}
        {isDividendModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 border-t-8 border-red-500 max-h-[90vh] overflow-y-auto"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-4">
                分发分红 (Payout)
              </h3>
              <p className="text-xs text-gray-500 mb-4 font-bold">
                当作工钱发放，将从公司资金中扣除。
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Shareholder (股东)
                  </label>
                  <select
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={dividendForm.shareholderId}
                    onChange={(e) =>
                      setDividendForm({
                        ...dividendForm,
                        shareholderId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Shareholder...</option>
                    {config.shareholders?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Amount (金额)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-50 rounded-xl font-black text-lg outline-none border-2 border-transparent focus:border-[#FFD700]"
                    value={dividendForm.amount}
                    onChange={(e) =>
                      setDividendForm({
                        ...dividendForm,
                        amount: e.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Payment Method (资金来源)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setDividendForm({
                          ...dividendForm,
                          paymentMethod: "BANK_TRANSFER",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${dividendForm.paymentMethod === "BANK_TRANSFER" ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      BANK
                    </button>
                    <button
                      onClick={() =>
                        setDividendForm({
                          ...dividendForm,
                          paymentMethod: "CASH",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${dividendForm.paymentMethod === "CASH" ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      CASH
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Dividend Month (分红月份)
                  </label>
                  <input
                    type="month"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={dividendForm.dividendMonth}
                    onChange={(e) =>
                      setDividendForm({
                        ...dividendForm,
                        dividendMonth: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Date (日期)
                  </label>
                  <input
                    type="date"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={dividendForm.date}
                    onChange={(e) =>
                      setDividendForm({ ...dividendForm, date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Note (备注)
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={dividendForm.note}
                    onChange={(e) =>
                      setDividendForm({ ...dividendForm, note: e.target.value })
                    }
                    placeholder="e.g. 盈利分红"
                  />
                </div>
                <button
                  onClick={handleSaveDividend}
                  className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-bold mt-2 shadow-lg hover:bg-black"
                >
                  确认分发 (Confirm)
                </button>
                <button
                  onClick={() => setIsDividendModalOpen(false)}
                  className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Repayment Modal - 还钱给股东 */}
        {isRepaymentModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className="bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 border-t-8 border-indigo-500 max-h-[90vh] overflow-y-auto"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
              <h3 className="font-black text-xl text-[#1A1A1A] mb-4">
                还钱给股东 (Repayment)
              </h3>
              <p className="text-xs text-gray-500 mb-4 font-bold">
                偿还股东之前的注资/垫资，将作为支出从资金池扣除。
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Shareholder (股东)
                  </label>
                  <select
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={repaymentForm.shareholderId}
                    onChange={(e) =>
                      setRepaymentForm({
                        ...repaymentForm,
                        shareholderId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Shareholder...</option>
                    {config.shareholders?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Amount (金额)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-50 rounded-xl font-black text-lg outline-none border-2 border-transparent focus:border-[#FFD700]"
                    value={repaymentForm.amount}
                    onChange={(e) =>
                      setRepaymentForm({
                        ...repaymentForm,
                        amount: e.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Funds From (资金来源)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setRepaymentForm({
                          ...repaymentForm,
                          fromAccount: "BANK",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${repaymentForm.fromAccount === "BANK" ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      BANK
                    </button>
                    <button
                      onClick={() =>
                        setRepaymentForm({
                          ...repaymentForm,
                          fromAccount: "CASH",
                        })
                      }
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${repaymentForm.fromAccount === "CASH" ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                    >
                      CASH
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Date (日期)
                  </label>
                  <input
                    type="date"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={repaymentForm.date}
                    onChange={(e) =>
                      setRepaymentForm({
                        ...repaymentForm,
                        date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">
                    Note (备注)
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none"
                    value={repaymentForm.note}
                    onChange={(e) =>
                      setRepaymentForm({
                        ...repaymentForm,
                        note: e.target.value,
                      })
                    }
                    placeholder="e.g. 还清垫资"
                  />
                </div>
                <button
                  onClick={handleSaveRepayment}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold mt-2 shadow-lg hover:bg-indigo-700"
                >
                  确认还款 (Confirm)
                </button>
                <button
                  onClick={() => setIsRepaymentModalOpen(false)}
                  className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HIDDEN PRINT TEMPLATE */}
        <div style={{ position: "absolute", top: "-9999px", left: "-9999px" }}>
          <div
            ref={printRef}
            className="w-[148mm] min-h-[210mm] bg-white p-8 font-sans text-black relative border"
          >
            <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
              <div>
                <h1 className="text-3xl font-black uppercase tracking-widest mb-1">
                  OFFICIAL RECEIPT
                </h1>
                <p className="text-xs font-bold text-gray-500">
                  KIM LIAN KEE (KEPONG)
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  No. 52, Jalan Metro Perdana Barat 13
                  <br />
                  Kepong, 52100 Kuala Lumpur
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-mono font-black">
                  {printingRecord?.id.slice(-6)}
                </p>
                <p className="text-sm font-bold text-gray-500">
                  {printingRecord?.date}
                </p>
              </div>
            </div>
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
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Received From (收到):
                      </p>
                      <h2 className="text-xl font-bold">{sourceName}</h2>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Payment For (款项用途):
                      </p>
                      <h2 className="text-lg font-bold">{description}</h2>
                    </div>
                    <div className="flex justify-between items-center bg-black text-white p-6 rounded-xl">
                      <p className="text-sm font-bold uppercase tracking-widest">
                        Amount Received
                      </p>
                      <p className="text-3xl font-mono font-black">
                        RM {printingRecord.amount.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 mt-4 px-2">
                      <span>Payment Mode: {printingRecord.toAccount}</span>
                      <span>Status: PAID</span>
                    </div>
                  </div>
                );
              })()}
            <div className="absolute bottom-8 left-8 right-8">
              <div className="grid grid-cols-2 gap-12">
                <div className="border-t border-black pt-2">
                  <p className="text-[10px] font-bold uppercase">Received By</p>
                  <p className="text-xs">Kim Lian Kee</p>
                </div>
                <div className="border-t border-black pt-2">
                  <p className="text-[10px] font-bold uppercase">
                    Authorized Signature
                  </p>
                </div>
              </div>
              <p className="text-[8px] text-center text-gray-400 mt-8 uppercase tracking-widest">
                System Generated Receipt • No Signature Required
              </p>
            </div>
          </div>
        </div>

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
                className="flex-grow overflow-y-auto p-3 md:p-4 bg-gray-100"
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
          <LedgerModal
            isOpen={!!viewLedger}
            type={viewLedger}
            onClose={() => setViewLedger(null)}
            items={getLedgerData(viewLedger)}
          />
        )}
      </div>
    </div>
  );
};
