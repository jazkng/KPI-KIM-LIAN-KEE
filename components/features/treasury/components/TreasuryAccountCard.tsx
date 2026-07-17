import React from "react";
import { Banknote, Landmark, ArrowRight, ArrowLeft } from "lucide-react";

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

  return (
    <div
      onClick={onOpenLedger}
      className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.985] select-none touch-manipulation"
    >
      {/* Tiny decorative background icon */}
      <div className="absolute right-[-10px] top-[-10px] opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
        {isCash ? (
          <Banknote size={110} className="text-[#FFD200]" />
        ) : (
          <Landmark size={110} className="text-[#3B82F6]" />
        )}
      </div>

      <div>
        {/* Header Section */}
        <div className="flex justify-between items-center mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${isCash ? "bg-[#FFD200]/10 text-[#111111]" : "bg-[#3B82F6]/10 text-[#3B82F6]"}`}>
              {isCash ? (
                <Banknote size={20} strokeWidth={2.5} />
              ) : (
                <Landmark size={20} strokeWidth={2.5} />
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider leading-none">
                {label}
              </p>
              <p className="text-[10px] text-gray-400 mt-1 font-medium">
                {isCash ? "Cash on Hand" : "Bank & Digital"}
              </p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onActionClick(e);
            }}
            type="button"
            className="min-h-11 px-3 py-2 text-[11px] bg-[#111111] hover:bg-[#252525] active:scale-95 text-white rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-1 touch-manipulation"
          >
            {isCash ? (
              <ArrowRight size={12} strokeWidth={3} className="text-[#FFD200]" />
            ) : (
              <ArrowLeft size={12} strokeWidth={3} className="text-blue-400" />
            )}
            <span>{actionLabel}</span>
          </button>
        </div>

        {/* Ending Balance Block */}
        <div className="mb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            期末结余 (Ending Balance)
          </p>
          <h3 className="text-2xl md:text-3xl font-extrabold text-[#111111] mt-1 font-mono tabular-nums">
            {isLoading ? (
              <span className="animate-pulse text-gray-300">RM --,--.-</span>
            ) : (
              formatMoney(ending)
            )}
          </h3>
        </div>

        {/* Three Columns Indicator Grid */}
        <div className="grid grid-cols-3 gap-2 border-t border-b border-[#E5E7EB] py-3 my-3 text-center">
          <div className="min-w-0">
            <span className="block text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              期初 Start
            </span>
            <span className="block text-[10px] min-[375px]:text-xs font-bold font-mono tabular-nums tracking-tight leading-tight break-words mt-1 text-gray-700">
              {formatMoney(opening)}
            </span>
          </div>
          <div className="min-w-0 border-l border-r border-gray-100">
            <span className="block text-[10px] sm:text-[11px] font-bold text-green-500 uppercase tracking-wider">
              流入 Cash In
            </span>
            <span className="block text-[10px] min-[375px]:text-xs font-bold font-mono tabular-nums tracking-tight leading-tight break-words mt-1 text-green-600">
              +{formatMoney(totalIn)}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] sm:text-[11px] font-bold text-red-500 uppercase tracking-wider">
              流出 Cash Out
            </span>
            <span className="block text-[10px] min-[375px]:text-xs font-bold font-mono tabular-nums tracking-tight leading-tight break-words mt-1 text-red-600">
              -{formatMoney(totalOut)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer Link */}
      <div className="flex items-center justify-between text-xs font-bold text-gray-500 group-hover:text-[#111111] transition-colors pt-1">
        <span>查看流水 Ledger</span>
        <span className="text-gray-400 group-hover:translate-x-1 transition-transform">
          →
        </span>
      </div>
    </div>
  );
};
