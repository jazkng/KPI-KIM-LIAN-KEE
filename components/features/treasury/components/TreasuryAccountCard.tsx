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
      className={`p-5 rounded-2xl border transition-all active:scale-[0.985] touch-pan-y relative overflow-hidden group cursor-pointer shadow-md ${
        isCash
          ? "bg-gradient-to-br from-white via-[#FFFDF5] to-[#FFF9E6] border-amber-200/90 hover:border-amber-400"
          : "bg-gradient-to-br from-white via-[#F8FAFC] to-[#EFF6FF] border-blue-200/90 hover:border-blue-400"
      }`}
    >
      {/* Decorative background icon */}
      <div className="absolute right-[-15px] top-[-15px] opacity-[0.05] group-hover:opacity-[0.1] transition-opacity pointer-events-none select-none">
        {isCash ? (
          <Banknote size={120} className="text-[#D97706]" />
        ) : (
          <Landmark size={120} className="text-[#2563EB]" />
        )}
      </div>

      <div className="relative z-10">
        {/* Header Section */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-xl shadow-xs ${
                isCash
                  ? "bg-[#FFD200] text-[#111111]"
                  : "bg-blue-600 text-white"
              }`}
            >
              {isCash ? (
                <Banknote size={20} strokeWidth={2.5} />
              ) : (
                <Landmark size={20} strokeWidth={2.5} />
              )}
            </div>
            <div>
              <p className="text-xs font-black text-[#111111] uppercase tracking-wider leading-none">
                {label}
              </p>
              <p className="text-[10px] text-stone-500 mt-1 font-mono font-bold">
                {isCash ? "CASH ON HAND" : "BANK & DIGITAL PORTFOLIO"}
              </p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onActionClick(e);
            }}
            type="button"
            className="min-h-[40px] px-3 py-1.5 text-xs bg-[#111111] hover:bg-[#252525] active:scale-95 text-white rounded-xl font-black transition-all shadow-sm flex items-center justify-center gap-1.5 touch-pan-y"
          >
            {isCash ? (
              <ArrowRight size={13} strokeWidth={3} className="text-[#FFD200]" />
            ) : (
              <ArrowLeft size={13} strokeWidth={3} className="text-sky-400" />
            )}
            <span>{actionLabel}</span>
          </button>
        </div>

        {/* Ending Balance Block */}
        <div className="my-3.5 bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-stone-200/60 shadow-xs">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
            期末结余 (Ending Balance)
          </p>
          <h3 className="text-2xl sm:text-3xl font-black text-[#111111] mt-1 font-mono tabular-nums leading-none">
            {isLoading ? (
              <span className="animate-pulse text-stone-300">RM --,--.-</span>
            ) : (
              formatMoney(ending)
            )}
          </h3>
        </div>

        {/* Three Columns Indicator Grid */}
        <div className="grid grid-cols-3 gap-1.5 py-2.5 my-2.5 text-center bg-stone-100/60 rounded-xl p-2 border border-stone-200/50">
          <div className="min-w-0">
            <span className="block text-[9px] sm:text-[10px] font-black text-stone-500 uppercase tracking-wider">
              期初 Start
            </span>
            <span className="block text-[11px] sm:text-xs font-black font-mono tabular-nums tracking-tight leading-tight truncate mt-0.5 text-stone-700">
              {formatMoney(opening)}
            </span>
          </div>
          <div className="min-w-0 border-l border-r border-stone-300/60 px-1">
            <span className="block text-[9px] sm:text-[10px] font-black text-emerald-600 uppercase tracking-wider">
              流入 Cash In
            </span>
            <span className="block text-[11px] sm:text-xs font-black font-mono tabular-nums tracking-tight leading-tight truncate mt-0.5 text-emerald-600">
              +{formatMoney(totalIn)}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block text-[9px] sm:text-[10px] font-black text-rose-600 uppercase tracking-wider">
              流出 Cash Out
            </span>
            <span className="block text-[11px] sm:text-xs font-black font-mono tabular-nums tracking-tight leading-tight truncate mt-0.5 text-rose-600">
              -{formatMoney(totalOut)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer Link */}
      <div className="flex items-center justify-between text-xs font-black text-stone-600 group-hover:text-[#111111] transition-colors pt-1">
        <span>查看流水明细 (Ledger)</span>
        <span className="text-stone-400 group-hover:translate-x-1 group-hover:text-[#111111] transition-all">
          →
        </span>
      </div>
    </div>
  );
};
