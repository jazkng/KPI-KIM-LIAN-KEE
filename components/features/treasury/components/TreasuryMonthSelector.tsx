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
  // selectedMonth is format "YYYY-MM"
  const displayLabel = selectedMonth.length >= 7 
    ? `${selectedMonth.split("-")[0]}年 ${selectedMonth.split("-")[1]}月`
    : selectedMonth;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white p-2 shadow-xs">
      <button
        onClick={() => onMonthShift(-1)}
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-90 transition-all touch-pan-y text-stone-800"
        aria-label="Previous Month"
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-2 text-center relative">
        <label className="flex items-center gap-1.5 cursor-pointer hover:bg-stone-100/80 px-3 py-1 rounded-xl transition-colors active:scale-95">
          <Calendar size={15} className="text-[#FFD200] fill-[#111111] shrink-0" />
          <span className="text-sm font-black text-[#111111] tabular-nums tracking-wide">
            {displayLabel}
          </span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedMonth(e.target.value);
              }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
        
        {/* Sub-label for status */}
        <div className="mt-0.5 flex items-center justify-center">
          {isClosed ? (
            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300/50 flex items-center gap-1 leading-none shadow-2xs">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              已结账 (Locked & Closed)
            </span>
          ) : (
            <span className="bg-amber-50 text-amber-900 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-300/50 flex items-center gap-1 leading-none shadow-2xs">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
              待结账 (Pending Closing)
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onMonthShift(1)}
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-90 transition-all touch-pan-y text-stone-800"
        aria-label="Next Month"
      >
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
};
