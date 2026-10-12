import React from "react";
import { Banknote, Landmark, ChevronRight } from "lucide-react";

interface TreasuryAccountCardProps {
  account: "CASH" | "BANK";
  label: string;
  opening: number;
  totalIn: number;
  totalOut: number;
  ending: number;
  isLoading: boolean;
  onOpenLedger: () => void;
  onActionClick: (e: React.MouseEvent) => void;
  actionLabel: string;
  formatMoney: (amount: number) => string;
}

export const TreasuryAccountCard: React.FC<TreasuryAccountCardProps> = ({
  account,
  label,
  opening,
  totalIn,
  totalOut,
  ending,
  isLoading,
  onOpenLedger,
  onActionClick,
  actionLabel,
  formatMoney,
}) => {
  const isCash = account === "CASH";
  const Icon = isCash ? Banknote : Landmark;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      {/* 标题列 */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F7FB] text-[#111111]">
            <Icon size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-[#111111]">
              {label}
            </p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
              {isCash ? "Cash" : "Bank"}
            </p>
          </div>
        </div>

        <button
          onClick={onActionClick}
          type="button"
          className="flex h-10 shrink-0 items-center rounded-xl bg-[#111111] px-3 text-xs font-bold text-white transition-colors hover:bg-black active:scale-95"
        >
          {actionLabel}
        </button>
      </div>

      {/* 期末结余 */}
      <div className="px-4 pt-4">
        <p className="text-[11px] font-bold text-stone-500">期末结余</p>
        <p className="mt-1 font-mono text-2xl font-bold leading-none tabular-nums text-[#111111] md:text-[28px]">
          {isLoading ? (
            <span className="animate-pulse text-stone-300">RM ——</span>
          ) : (
            formatMoney(ending)
          )}
        </p>
      </div>

      {/* 期初 / 流入 / 流出 */}
      <div className="mx-4 mt-4 grid grid-cols-3 divide-x divide-[#E5E7EB] rounded-xl border border-[#E5E7EB] bg-[#F6F7FB]">
        <div className="min-w-0 px-2 py-2.5 text-center">
          <p className="text-[10px] font-bold text-stone-500">期初</p>
          <p className="mt-1 truncate font-mono text-[11px] font-bold tabular-nums text-[#111111] md:text-xs">
            {formatMoney(opening)}
          </p>
        </div>
        <div className="min-w-0 px-2 py-2.5 text-center">
          <p className="text-[10px] font-bold text-stone-500">流入</p>
          <p className="mt-1 truncate font-mono text-[11px] font-bold tabular-nums text-emerald-600 md:text-xs">
            +{formatMoney(totalIn)}
          </p>
        </div>
        <div className="min-w-0 px-2 py-2.5 text-center">
          <p className="text-[10px] font-bold text-stone-500">流出</p>
          <p className="mt-1 truncate font-mono text-[11px] font-bold tabular-nums text-rose-600 md:text-xs">
            -{formatMoney(totalOut)}
          </p>
        </div>
      </div>

      {/* 查看流水 */}
      <button
        onClick={onOpenLedger}
        type="button"
        className="mt-3 flex min-h-[44px] w-full items-center justify-between border-t border-[#E5E7EB] px-4 text-xs font-bold text-[#111111] transition-colors hover:bg-[#F6F7FB] active:bg-stone-100"
      >
        <span>查看流水明细</span>
        <ChevronRight size={16} strokeWidth={2.5} className="text-stone-400" />
      </button>
    </div>
  );
};
