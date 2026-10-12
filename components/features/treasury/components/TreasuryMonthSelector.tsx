import React from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface TreasuryMonthSelectorProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  onMonthShift: (direction: number) => void;
  isClosed: boolean;
}

export const TreasuryMonthSelector: React.FC<TreasuryMonthSelectorProps> = ({
  selectedMonth,
  setSelectedMonth,
  onMonthShift,
  isClosed,
}) => {
  const [year, month] = selectedMonth.split("-");
  const displayLabel =
    selectedMonth.length >= 7 ? `${year}年 ${month}月` : selectedMonth;

  return (
    <div className="flex items-center justify-between gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5">
      <button
        onClick={() => onMonthShift(-1)}
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-90"
        aria-label="上个月"
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>

      <label className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-[#F6F7FB]">
        <span className="flex items-center gap-1.5">
          <Calendar size={14} strokeWidth={2.5} className="shrink-0 text-stone-400" />
          <span className="font-mono text-sm font-bold tabular-nums text-[#111111]">
            {displayLabel}
          </span>
        </span>

        <span
          className={`flex items-center gap-1.5 text-[10px] font-bold leading-none ${
            isClosed ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isClosed ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {isClosed ? "已结账锁定" : "待结账"}
        </span>

        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="选择月份"
        />
      </label>

      <button
        onClick={() => onMonthShift(1)}
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-90"
        aria-label="下个月"
      >
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
};
