import React, { useEffect } from "react";
import {
  X,
  Calendar,
  Loader2,
  Archive,
  Search,
  Banknote,
  Landmark,
} from "lucide-react";
import { LedgerItem } from "../treasuryTypes";

interface TreasuryHistoryModalProps {
  open: boolean;
  onClose: () => void;
  historyMonth: string;
  setHistoryMonth: (m: string) => void;
  onSearch: () => void;
  isLoading: boolean;
  historyRecords: LedgerItem[];
  filteredHistoryRecords: LedgerItem[];
  inHistory: LedgerItem[];
  outHistory: LedgerItem[];
  stats: { totalIn: number; totalOut: number };
  accountFilter: "ALL" | "CASH" | "BANK";
  setAccountFilter: (v: "ALL" | "CASH" | "BANK") => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  activeFlow: "ALL" | "IN" | "OUT";
  setActiveFlow: (v: "ALL" | "IN" | "OUT") => void;
  formatMoney: (amount: number) => string;
}

const HistoryRow: React.FC<{ item: LedgerItem; tone: "IN" | "OUT" }> = ({
  item,
  tone,
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-3 py-2.5 last:border-b-0">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        {item.account && (
          <span className="flex shrink-0 items-center text-stone-400">
            {item.account === "CASH" ? (
              <Banknote size={12} strokeWidth={2.5} />
            ) : (
              <Landmark size={12} strokeWidth={2.5} />
            )}
          </span>
        )}
        <span className="truncate text-xs font-bold text-[#111111]">
          {item.desc}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-[10px] tabular-nums text-stone-400">
        {item.date} · {item.category}
      </div>
    </div>
    <div
      className={`shrink-0 font-mono text-xs font-bold tabular-nums ${
        tone === "IN" ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {tone === "IN" ? "+" : "-"}
      {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </div>
  </div>
);

const FlowColumn: React.FC<{
  tone: "IN" | "OUT";
  items: LedgerItem[];
  total: number;
  formatMoney: (n: number) => string;
}> = ({ tone, items, total, formatMoney }) => {
  const isIn = tone === "IN";
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F6F7FB] px-3 py-2.5">
        <span className="text-xs font-bold text-[#111111]">
          {isIn ? "收入" : "支出"}
          <span className="ml-1.5 font-mono text-[10px] font-medium tabular-nums text-stone-400">
            {items.length} 笔
          </span>
        </span>
        <span
          className={`font-mono text-xs font-bold tabular-nums ${
            isIn ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {isIn ? "+" : "-"}
          {formatMoney(total)}
        </span>
      </div>
      {/* ⚠️ 这里刻意不设 max-h + overflow-y-auto。
          嵌套滚动区在手机上会把手势吞掉，让外层面板滑不动。
          让内容自然撑开，交给外层唯一的滚动区处理。 */}
      <div>
        {items.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-stone-400">
            无符合的{isIn ? "收入" : "支出"}记录
          </p>
        ) : (
          items.map((item, idx) => (
            <HistoryRow key={idx} item={item} tone={tone} />
          ))
        )}
      </div>
    </div>
  );
};

export const TreasuryHistoryModal: React.FC<TreasuryHistoryModalProps> = ({
  open,
  onClose,
  historyMonth,
  setHistoryMonth,
  onSearch,
  isLoading,
  historyRecords,
  filteredHistoryRecords,
  inHistory,
  outHistory,
  stats,
  accountFilter,
  setAccountFilter,
  searchQuery,
  setSearchQuery,
  activeFlow,
  setActiveFlow,
  formatMoney,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasResults = historyRecords.length > 0;

  // ⚠️ 必须 portal 到 body：留在 #treasury-page 内会导致 iOS 上无法滚动
  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 md:items-center md:p-4"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#F6F7FB] md:h-[88dvh] md:max-w-5xl md:rounded-2xl">
        {/* Header */}
        <header
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          className="flex shrink-0 items-center justify-between gap-3 bg-[#111111] px-4 pb-3 text-white"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Archive size={17} strokeWidth={2.5} className="text-[#FFD200]" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold leading-tight">
                历史账本
              </h3>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-500">
                Archive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10 active:scale-95"
            aria-label="关闭"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </header>

        {/* 查询列 */}
        <div className="shrink-0 space-y-2 border-b border-[#E5E7EB] bg-white p-3">
          <div className="flex gap-2">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3">
              <Calendar size={15} strokeWidth={2.5} className="shrink-0 text-stone-400" />
              <input
                type="month"
                value={historyMonth}
                onChange={(e) => setHistoryMonth(e.target.value)}
                className="w-full bg-transparent font-mono text-sm font-bold tabular-nums text-[#111111] outline-none"
                aria-label="查询月份"
              />
            </label>
            <button
              onClick={onSearch}
              disabled={isLoading}
              type="button"
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#FFD200] px-5 text-sm font-bold text-[#111111] transition-colors hover:bg-[#E5C100] active:scale-95 disabled:opacity-45"
            >
              {isLoading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Search size={15} strokeWidth={2.5} />
              )}
              查询
            </button>
          </div>

          {hasResults && (
            <>
              <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3">
                <Search size={15} strokeWidth={2.5} className="shrink-0 text-stone-400" />
                <input
                  type="text"
                  placeholder="搜寻商家、分类或金额"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-[#111111] outline-none placeholder:text-stone-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    type="button"
                    className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-100"
                    aria-label="清除"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </label>

              <div className="flex gap-2">
                {/* 账户筛选 */}
                <div className="flex flex-1 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-1">
                  {(
                    [
                      ["ALL", "全部"],
                      ["CASH", "现金"],
                      ["BANK", "银行"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setAccountFilter(key)}
                      type="button"
                      className={`h-9 flex-1 rounded-lg text-xs font-bold transition-colors ${
                        accountFilter === key
                          ? "bg-white text-[#111111] shadow-xs"
                          : "text-stone-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* 收支筛选 */}
                <div className="flex flex-1 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-1">
                  {(
                    [
                      ["ALL", "收支"],
                      ["IN", "收入"],
                      ["OUT", "支出"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setActiveFlow(key)}
                      type="button"
                      className={`h-9 flex-1 rounded-lg text-xs font-bold transition-colors ${
                        activeFlow === key
                          ? key === "IN"
                            ? "bg-white text-emerald-600 shadow-xs"
                            : key === "OUT"
                              ? "bg-white text-rose-600 shadow-xs"
                              : "bg-white text-[#111111] shadow-xs"
                          : "text-stone-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 过滤后小计 */}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] px-3 py-2">
                <span className="text-[11px] font-bold text-stone-500">
                  过滤后小计
                </span>
                <span className="font-mono text-xs font-bold tabular-nums">
                  <span className="text-emerald-600">
                    +{formatMoney(stats.totalIn)}
                  </span>
                  <span className="mx-1.5 text-stone-300">/</span>
                  <span className="text-rose-600">
                    -{formatMoney(stats.totalOut)}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>

        {/* 内容区 */}
        <div
          className="min-h-0 flex-1 overflow-y-auto p-3"
          style={{
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm font-medium">正在读取资料</p>
            </div>
          ) : !hasResults ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
              <Archive size={36} strokeWidth={1.5} />
              <p className="text-sm font-medium">请选择月份并点击查询</p>
            </div>
          ) : filteredHistoryRecords.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
              <Search size={32} strokeWidth={1.5} />
              <p className="text-sm font-medium">没有符合的记录</p>
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 items-start gap-3 ${
                activeFlow === "ALL" ? "md:grid-cols-2" : ""
              }`}
            >
              {(activeFlow === "ALL" || activeFlow === "IN") && (
                <FlowColumn
                  tone="IN"
                  items={inHistory}
                  total={stats.totalIn}
                  formatMoney={formatMoney}
                />
              )}
              {(activeFlow === "ALL" || activeFlow === "OUT") && (
                <FlowColumn
                  tone="OUT"
                  items={outHistory}
                  total={stats.totalOut}
                  formatMoney={formatMoney}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
