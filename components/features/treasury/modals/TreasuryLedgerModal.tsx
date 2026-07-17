import React, { useState, useMemo, useEffect } from "react";
import { ScrollText, X, Search, ChevronDown, ExternalLink } from "lucide-react";
import { LedgerItem } from "../treasuryTypes";

// GroupedLedgerItem Component (Compact row design optimized for touch and readability)
export const GroupedLedgerItem = ({ group }: { group: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSingle = group.items.length === 1;
  const mainItem = group.items[0];

  return (
    <div className="bg-white rounded-xl md:rounded-none shadow-xs md:shadow-none border border-gray-150 md:border-b md:border-t-0 md:border-x-0 overflow-hidden flex flex-col transition-all">
      {/* --- MOBILE COMPACT VIEW (md:hidden) --- */}
      <div
        onClick={() => !isSingle && setIsExpanded(!isExpanded)}
        className="p-2.5 flex md:hidden items-center justify-between gap-3 active:bg-gray-100 transition-colors cursor-pointer select-none"
      >
        <div className="min-w-0 flex-1 flex items-start gap-2">
          {/* Status Dot / Flag */}
          <span
            className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
              group.type === "IN"
                ? "bg-[#22C55E] shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                : "bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.4)]"
            }`}
          />

          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-xs text-stone-900 truncate leading-tight flex items-center gap-1.5 flex-wrap">
              <span className="truncate max-w-[160px]">{group.baseDesc}</span>
              {!isSingle && (
                <span className="text-[8px] bg-amber-50 text-[#111111] px-1 py-0.2 rounded font-black shrink-0">
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
          <span
            className={`font-mono font-black text-xs ${
              group.type === "IN" ? "text-green-600" : "text-red-600"
            }`}
          >
            {group.type === "IN" ? "+" : "-"}{" "}
            {group.totalAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
          {!isSingle && (
            <ChevronDown
              size={12}
              className={`text-stone-450 transition-transform duration-200 ${
                isExpanded ? "rotate-180 text-amber-500" : ""
              }`}
            />
          )}
        </div>
      </div>

      {/* --- DESKTOP VIEW (hidden md:flex) --- */}
      <div
        onClick={() => !isSingle && setIsExpanded(!isExpanded)}
        className={`hidden md:flex flex-col gap-1 px-3 py-2 border-b border-gray-100 transition-colors ${
          !isSingle ? "cursor-pointer hover:bg-gray-50" : "hover:bg-gray-50"
        }`}
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
              <span className="text-[8px] bg-amber-50 text-[#111111] px-1 py-0.2 rounded font-black shrink-0">
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
            <span className={group.type === "IN" ? "text-green-600" : "text-red-600"}>
              {group.type === "IN" ? "+" : "-"}{" "}
              {group.totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* LINE 2: Badges/Meta */}
        <div className="flex justify-between items-center w-full gap-2 text-[10px]">
          <div className="flex flex-wrap items-center gap-1.5 text-stone-400 font-semibold min-w-0">
            <span
              className={`px-1 py-0.2 rounded text-[8px] font-black border leading-none ${
                group.type === "IN"
                  ? "bg-green-50 text-green-700 border-green-100"
                  : "bg-red-50 text-red-700 border-red-100"
              }`}
            >
              {group.type}
            </span>
            <span className="font-mono text-stone-500 text-[9px]">{group.date}</span>
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

          <div className="shrink-0 text-right font-mono text-[10px] text-stone-550 flex items-center gap-1">
            {!isSingle && (
              <ChevronDown
                size={11}
                className={`text-stone-450 transition-transform ${
                  isExpanded ? "rotate-180 text-amber-500" : ""
                }`}
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
              <div className="text-[10px] md:text-xs text-gray-500 font-bold flex items-center gap-2 pr-2 overflow-hidden">
                <span className="bg-[#111111] text-[#FFD200] rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] shrink-0 font-extrabold">
                  {idx + 1}
                </span>
                <span className="truncate">{item.desc}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`font-mono font-bold text-[10px] md:text-xs ${
                    item.type === "IN" ? "text-[#22C55E]" : "text-[#EF4444]"
                  }`}
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

interface TreasuryLedgerModalProps {
  isOpen: boolean;
  type: "CASH" | "BANK";
  onClose: () => void;
  items: LedgerItem[] | undefined;
}

export const TreasuryLedgerModal: React.FC<TreasuryLedgerModalProps> = ({
  isOpen,
  type,
  onClose,
  items = [],
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFlow, setActiveFlow] = useState<"ALL" | "IN" | "OUT">("ALL");

  // No background scroll lock to preserve standard native mobile scrolling

  const filteredItems = useMemo(() => {
    if (!items) return [];
    
    // Filter by tab type (ALL, IN, OUT)
    let flowFiltered = items;
    if (activeFlow !== "ALL") {
      flowFiltered = items.filter((item) => item.type === activeFlow);
    }

    if (!searchQuery.trim()) return flowFiltered;
    
    const q = searchQuery.toLowerCase().trim();
    return flowFiltered.filter((item) => {
      const descMatch =
        item.desc?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q);
      const amountMatch =
        item.amount?.toString().includes(q) ||
        item.amount?.toFixed(2).includes(q);
      return descMatch || amountMatch;
    });
  }, [items, searchQuery, activeFlow]);

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
    const groups: any[] = [];
    filteredItems.forEach((item) => {
      let baseDesc = item.desc || "";
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
    <div className="fixed inset-0 bg-[#111111]/80 z-[200] flex items-center justify-center p-0 md:p-4 backdrop-blur-xs animate-in zoom-in duration-200">
      <div className="bg-white w-full h-full md:max-w-5xl md:h-[90vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
        
        {/* Header */}
        <header
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          className="bg-[#111111] px-4 pb-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD200] z-10 shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="bg-[#FFD200] text-[#111111] p-2 rounded-xl shadow-lg">
              <ScrollText size={20} />
            </div>
            <div>
              <h3 className="font-serif font-black text-base md:text-lg tracking-wide uppercase">
                {type} LEDGER (流水账)
              </h3>
              <p className="text-[9px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">
                Transaction Ledger Details
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            style={{ minWidth: "44px", minHeight: "44px" }}
          >
            <X size={20} />
          </button>
        </header>

        {/* Search & Tabs Row */}
        <div className="bg-stone-50 border-b border-stone-200 p-3 flex flex-col gap-2.5 md:flex-row md:items-center shrink-0">
          {/* Search box */}
          <div className="flex items-center bg-white border border-stone-300 rounded-xl px-3 py-2 flex-grow shadow-inner">
            <Search size={15} className="text-stone-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="查询特定摘要、类型、分类或金额..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent flex-grow font-bold text-xs md:text-sm text-stone-850 outline-none placeholder:text-stone-400 w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Subtabs (Swivel switch) */}
          <div className="flex bg-gray-200 border border-gray-300 rounded-xl p-0.5 shadow-xs shrink-0">
            <button
              onClick={() => setActiveFlow("ALL")}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeFlow === "ALL"
                  ? "bg-[#111111] text-white shadow-xs"
                  : "text-stone-600 hover:text-[#111111]"
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveFlow("IN")}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeFlow === "IN"
                  ? "bg-[#22C55E] text-white shadow-xs"
                  : "text-stone-600 hover:text-[#111111]"
              }`}
            >
              🟢 收入 (IN)
            </button>
            <button
              onClick={() => setActiveFlow("OUT")}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeFlow === "OUT"
                  ? "bg-[#EF4444] text-white shadow-xs"
                  : "text-stone-600 hover:text-[#111111]"
              }`}
            >
              🔴 支出 (OUT)
            </button>
          </div>
        </div>

        {/* Flow Subtotals Stats Row */}
        <div className="grid grid-cols-2 gap-2.5 p-3 bg-stone-100 border-b border-gray-200 shrink-0">
          <div className="bg-green-50 border border-green-100 rounded-xl p-2.5 md:p-3 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[9px] md:text-[10px] text-green-700 font-extrabold uppercase tracking-widest leading-none">
                总流入 (TOTAL IN)
              </p>
              <p className="text-xs md:text-sm font-black text-[#22C55E] mt-1.5 font-mono">
                +RM {totalIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span className="text-sm md:text-base select-none">📈</span>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 md:p-3 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[9px] md:text-[10px] text-red-700 font-extrabold uppercase tracking-widest leading-none">
                总流出 (TOTAL OUT)
              </p>
              <p className="text-xs md:text-sm font-black text-[#EF4444] mt-1.5 font-mono">
                -RM {totalOut.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span className="text-sm md:text-base select-none">📉</span>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-3 md:p-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          {groupedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 my-12">
              <ScrollText size={48} className="opacity-20 mb-3" />
              <p className="text-xs font-bold">
                {searchQuery ? "没有找到符合搜索条件的项目" : "暂无交易明细记录"}
              </p>
            </div>
          ) : (
            <div>
              {/* DESKTOP VIEW (Two columns) */}
              <div
                className={`hidden md:grid ${
                  activeFlow === "ALL" ? "grid-cols-2" : "grid-cols-1"
                } gap-4 items-start`}
              >
                {/* Inflows column */}
                {(activeFlow === "ALL" || activeFlow === "IN") && (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden min-h-[300px]">
                    <div className="bg-green-50/60 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between sticky top-0 z-10 shrink-0">
                      <h4 className="text-[10px] font-black text-green-700 tracking-wider flex items-center gap-1.5 uppercase leading-none">
                        <span>📥</span> 收入流水 (INFLOWS)
                      </h4>
                      <span className="text-[10px] font-black text-[#22C55E] font-mono leading-none">
                        共 {inGroups.length} 笔 • +RM{" "}
                        {totalIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 p-2 space-y-1.5 bg-stone-50/20">
                      {inGroups.length === 0 ? (
                        <div className="p-12 text-center text-stone-400 text-xs font-bold">
                          无符合的收入记录
                        </div>
                      ) : (
                        inGroups.map((group) => <GroupedLedgerItem key={group.key} group={group} />)
                      )}
                    </div>
                  </div>
                )}

                {/* Outflows column */}
                {(activeFlow === "ALL" || activeFlow === "OUT") && (
                  <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden min-h-[300px]">
                    <div className="bg-red-50/60 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between sticky top-0 z-10 shrink-0">
                      <h4 className="text-[10px] font-black text-red-700 tracking-wider flex items-center gap-1.5 uppercase leading-none">
                        <span>📤</span> 支出流水 (OUTFLOWS)
                      </h4>
                      <span className="text-[10px] font-black text-[#EF4444] font-mono leading-none">
                        共 {outGroups.length} 笔 • -RM{" "}
                        {totalOut.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 p-2 space-y-1.5 bg-stone-50/20">
                      {outGroups.length === 0 ? (
                        <div className="p-12 text-center text-stone-400 text-xs font-bold">
                          无符合的支出记录
                        </div>
                      ) : (
                        outGroups.map((group) => <GroupedLedgerItem key={group.key} group={group} />)
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* MOBILE VIEW (Single list timeline) */}
              <div className="block md:hidden space-y-3">
                <div className="flex flex-col bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-xs">
                  <div className="bg-stone-50 border-b border-gray-150 px-3 py-2 flex items-center justify-between">
                    <h4 className="text-[11px] font-bold text-stone-700 flex items-center gap-1.5">
                      <span>📋</span> 交易明细时间流
                    </h4>
                    <span className="text-[9px] bg-[#111111] text-white font-bold px-1.5 py-0.5 rounded-sm">
                      共 {groupedItems.length} 笔
                    </span>
                  </div>
                  <div className="p-1.5 gap-1.5 flex flex-col bg-gray-50/50">
                    {[...groupedItems]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((group) => (
                        <GroupedLedgerItem key={group.key} group={group} />
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
