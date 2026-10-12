import React from "react";
import { ArrowRightLeft, PlusCircle, Archive } from "lucide-react";

interface TreasuryQuickActionsProps {
  onTransferClick: () => void;
  onIncomeClick: () => void;
  onHistoryClick: () => void;
}

const ACTIONS = [
  { key: "transfer", label: "内部划转", icon: ArrowRightLeft },
  { key: "income", label: "额外收入", icon: PlusCircle },
  { key: "history", label: "历史账本", icon: Archive },
] as const;

export const TreasuryQuickActions: React.FC<TreasuryQuickActionsProps> = ({
  onTransferClick,
  onIncomeClick,
  onHistoryClick,
}) => {
  const handlers: Record<string, () => void> = {
    transfer: onTransferClick,
    income: onIncomeClick,
    history: onHistoryClick,
  };

  return (
    <div className="grid grid-cols-3 divide-x divide-[#E5E7EB] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      {ACTIONS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={handlers[key]}
          type="button"
          className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 px-1 transition-colors hover:bg-[#F6F7FB] active:bg-stone-100"
        >
          <Icon size={18} strokeWidth={2.5} className="text-[#111111]" />
          <span className="text-[11px] font-bold text-[#111111]">{label}</span>
        </button>
      ))}
    </div>
  );
};
