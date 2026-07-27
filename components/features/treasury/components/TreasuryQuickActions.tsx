import React from "react";
import { ArrowRightLeft, PlusCircle, History } from "lucide-react";

interface TreasuryQuickActionsProps {
  onTransferClick: () => void;
  onIncomeClick: () => void;
  onHistoryClick: () => void;
}

export const TreasuryQuickActions: React.FC<TreasuryQuickActionsProps> = ({
  onTransferClick,
  onIncomeClick,
  onHistoryClick,
}) => {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <button
        onClick={onTransferClick}
        type="button"
        className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-stone-200/80 bg-white hover:border-[#FFD200] active:scale-[0.96] transition-all touch-pan-y shadow-xs"
      >
        <div className="p-2 bg-[#FFD200]/20 rounded-xl text-[#111111]">
          <ArrowRightLeft size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-black text-[#111111]">
          内部划转
        </span>
        <span className="text-[9px] font-mono text-stone-400 font-bold -mt-0.5">
          Transfer
        </span>
      </button>

      <button
        onClick={onIncomeClick}
        type="button"
        className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-stone-200/80 bg-white hover:border-emerald-400 active:scale-[0.96] transition-all touch-pan-y shadow-xs"
      >
        <div className="p-2 bg-emerald-100/70 rounded-xl text-emerald-700">
          <PlusCircle size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-black text-[#111111]">
          额外收入
        </span>
        <span className="text-[9px] font-mono text-stone-400 font-bold -mt-0.5">
          Income
        </span>
      </button>

      <button
        onClick={onHistoryClick}
        type="button"
        className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-stone-200/80 bg-white hover:border-indigo-400 active:scale-[0.96] transition-all touch-pan-y shadow-xs"
      >
        <div className="p-2 bg-indigo-100/70 rounded-xl text-indigo-700">
          <History size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-black text-[#111111]">
          调拨历史
        </span>
        <span className="text-[9px] font-mono text-stone-400 font-bold -mt-0.5">
          History
        </span>
      </button>
    </div>
  );
};
