import React, { useState, useMemo, useEffect } from "react";
import {
  ScrollText,
  X,
  Search,
  ChevronDown,
  ExternalLink,
  Download,
} from "lucide-react";
import { LedgerItem } from "../treasuryTypes";
import { buildLedgerCsv, downloadCsv } from "../treasuryUtils";

/** 同日同摘要的多笔记录会合并成一组，展开后看明细 */
export const GroupedLedgerItem = ({ group }: { group: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSingle = group.items.length === 1;
  const mainItem = group.items[0];
  const isIn = group.type === "IN";

  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
      <div
        onClick={() => !isSingle && setIsExpanded(!isExpanded)}
        className={`flex min-h-[56px] items-center justify-between gap-3 px-3 py-2.5 ${
          isSingle
            ? ""
            : "cursor-pointer active:bg-[#F6F7FB] md:hover:bg-[#F6F7FB]"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              isIn ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="truncate text-xs font-bold leading-tight text-[#111111]"
                title={group.baseDesc}
              >
                {group.baseDesc}
              </span>
              {!isSingle && (
                <span className="shrink-0 rounded bg-[#F6F7FB] px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-stone-500">
                  {group.items.length} 笔
                </span>
              )}
              {isSingle && mainItem.linkUrl && (
                <a
                  href={mainItem.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex shrink-0 items-center gap-0.5 rounded bg-[#F6F7FB] px-1.5 py-0.5 text-[9px] font-bold text-stone-600 hover:bg-stone-200"
                >
                  <ExternalLink size={9} strokeWidth={2.5} /> 单据
                </a>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] tabular-nums text-stone-400">
              <span>{group.date}</span>
              {group.category && (
                <>
                  <span>·</span>
                  <span>{group.category}</span>
                </>
              )}
              {group.tag && (
                <>
                  <span>·</span>
                  <span>#{group.tag}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`font-mono text-xs font-bold tabular-nums ${
              isIn ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {isIn ? "+" : "-"}
            {group.totalAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
          {!isSingle && (
            <ChevronDown
              size={14}
              strokeWidth={2.5}
              className={`text-stone-400 transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </div>

      {!isSingle && isExpanded && (
        <div className="space-y-1 border-t border-[#E5E7EB] bg-[#F6F7FB] p-2">
          {group.items.map((item: any, idx: number) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#111111] font-mono text-[9px] font-bold text-[#FFD200]">
                  {idx + 1}
                </span>
                <span className="truncate text-[11px] font-medium text-stone-600">
                  {item.desc}
                </span>
              </div>
              <span
                className={`shrink-0 font-mono text-[11px] font-bold tabular-nums ${
                  item.type === "IN" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {item.type === "IN" ? "+" : "-"}
                {item.amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** 电脑端的收入 / 支出分栏 */
const LedgerColumn: React.FC<{
  title: string;
  tone: "IN" | "OUT";
  groups: any[];
  total: number;
}> = ({ title, tone, groups, total }) => {
  const isIn = tone === "IN";
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F6F7FB] px-3 py-2.5">
        <span className="text-xs font-bold text-[#111111]">
          {title}
          <span className="ml-1.5 font-mono text-[10px] font-medium tabular-nums text-stone-400">
            {groups.length} 笔
          </span>
        </span>
        <span
          className={`font-mono text-xs font-bold tabular-nums ${
            isIn ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {isIn ? "+" : "-"}RM{" "}
          {total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 bg-[#F6F7FB] p-2">
        {groups.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-stone-400">
            无符合的{title}记录
          </p>
        ) : (
          groups.map((group) => (
            <GroupedLedgerItem key={group.key} group={group} />
          ))
        )}
      </div>
    </div>
  );
};

interface TreasuryLedgerModalProps {
  isOpen: boolean;
  type: "CASH" | "BANK";
  onClose: () => void;
  items: LedgerItem[] | undefined;
}

const FLOW_TABS = [
  ["ALL", "全部"],
  ["IN", "收入"],
  ["OUT", "支出"],
] as const;

export const TreasuryLedgerModal: React.FC<TreasuryLedgerModalProps> = ({
  isOpen,
  type,
  onClose,
  items = [],
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFlow, setActiveFlow] = useState<"ALL" | "IN" | "OUT">("ALL");

  const filteredItems = useMemo(() => {
    if (!items) return [];

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

  const inGroups = useMemo(
    () => groupedItems.filter((g) => g.type === "IN"),
    [groupedItems],
  );
  const outGroups = useMemo(
    () => groupedItems.filter((g) => g.type === "OUT"),
    [groupedItems],
  );

  // 导出对账用 CSV（只导出当前筛选结果，不改动任何数据）
  const handleExportCsv = () => {
    const { csv, count } = buildLedgerCsv(filteredItems, type);
    if (!count) {
      alert("目前没有可导出的流水记录。");
      return;
    }
    const stamp = new Date().toISOString().split("T")[0];
    downloadCsv(csv, `${type}_Ledger_${stamp}.csv`);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ⚠️ 必须 portal 到 body：留在 #treasury-page 内会导致 iOS 上无法滚动
  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-0 md:p-4"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#F6F7FB] font-sans md:h-[88dvh] md:max-w-5xl md:rounded-2xl">
        {/* Header */}
        <header
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          className="z-10 flex shrink-0 items-center justify-between gap-2 bg-[#111111] px-4 pb-3 text-white"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ScrollText
                size={17}
                strokeWidth={2.5}
                className="text-[#FFD200]"
              />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold leading-tight">
                {type === "CASH" ? "现金流水" : "银行流水"}
              </h3>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-500">
                Ledger
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={handleExportCsv}
              type="button"
              className="flex h-11 items-center gap-1.5 rounded-xl px-3 transition-colors hover:bg-white/10 active:scale-95"
              aria-label="导出 CSV"
            >
              <Download size={18} strokeWidth={2.5} />
              <span className="hidden text-xs font-bold md:inline">导出</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-white/10 active:scale-95"
              aria-label="关闭"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
        </header>

        {/* 搜寻与筛选 */}
        <div className="shrink-0 space-y-2 border-b border-[#E5E7EB] bg-white p-3">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3">
            <Search
              size={15}
              strokeWidth={2.5}
              className="shrink-0 text-stone-400"
            />
            <input
              type="text"
              placeholder="查询摘要、分类或金额"
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

          <div className="flex rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-1">
            {FLOW_TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveFlow(key)}
                type="button"
                className={`h-9 flex-1 rounded-lg text-xs font-bold transition-colors ${
                  activeFlow === key
                    ? key === "IN"
                      ? "bg-white text-emerald-600"
                      : key === "OUT"
                        ? "bg-white text-rose-600"
                        : "bg-white text-[#111111]"
                    : "text-stone-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 小计 */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] px-3 py-2">
            <span className="text-[11px] font-bold text-stone-500">
              筛选后小计
            </span>
            <span className="font-mono text-xs font-bold tabular-nums">
              <span className="text-emerald-600">
                +RM{" "}
                {totalIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="mx-1.5 text-stone-300">/</span>
              <span className="text-rose-600">
                -RM{" "}
                {totalOut.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </span>
          </div>
        </div>

        {/* 内容区 */}
        <div
          className="min-h-0 flex-1 overflow-y-auto p-3"
          style={{
            overscrollBehavior: "contain",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
          }}
        >
          {groupedItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-stone-400">
              <ScrollText size={36} strokeWidth={1.5} />
              <p className="text-sm font-medium">
                {searchQuery ? "没有符合的记录" : "本月暂无交易明细"}
              </p>
            </div>
          ) : (
            <>
              {/* 电脑：收入 / 支出 双栏 */}
              <div
                className={`hidden items-start gap-3 md:grid ${
                  activeFlow === "ALL" ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {(activeFlow === "ALL" || activeFlow === "IN") && (
                  <LedgerColumn
                    title="收入"
                    tone="IN"
                    groups={inGroups}
                    total={totalIn}
                  />
                )}
                {(activeFlow === "ALL" || activeFlow === "OUT") && (
                  <LedgerColumn
                    title="支出"
                    tone="OUT"
                    groups={outGroups}
                    total={totalOut}
                  />
                )}
              </div>

              {/* 手机：单栏时间流 */}
              <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white md:hidden">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F6F7FB] px-3 py-2.5">
                  <span className="text-xs font-bold text-[#111111]">
                    交易明细
                  </span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-stone-500">
                    {groupedItems.length} 笔
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 bg-[#F6F7FB] p-2">
                  {[...groupedItems]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((group) => (
                      <GroupedLedgerItem key={group.key} group={group} />
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
