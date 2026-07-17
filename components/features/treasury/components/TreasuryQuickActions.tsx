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
        className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white text-gray-800 hover:bg-gray-50 active:scale-[0.98] transition-all touch-manipulation select-none shadow-sm"
      >
        <div className="p-1.5 bg-[#FFD200]/10 rounded-xl text-[#111111]">
          <ArrowRightLeft size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-bold text-[#111111]">
          内部转账
        </span>
      </button>

      <button
        onClick={onIncomeClick}
        type="button"
        className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white text-gray-800 hover:bg-gray-50 active:scale-[0.98] transition-all touch-manipulation select-none shadow-sm"
      >
        <div className="p-1.5 bg-green-50 rounded-xl text-green-600">
          <PlusCircle size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-bold text-[#111111]">
          记录收入
        </span>
      </button>

      <button
        onClick={onHistoryClick}
        type="button"
        className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white text-gray-800 hover:bg-gray-50 active:scale-[0.98] transition-all touch-manipulation select-none shadow-sm"
      >
        <div className="p-1.5 bg-purple-50 rounded-xl text-purple-600">
          <History size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xs font-bold text-[#111111]">
          历史账本
        </span>
      </button>
    </div>
  );
};
