import React from "react";
import { Wallet, Sparkles, TrendingUp } from "lucide-react";

interface TreasuryBalanceHeroProps {
  totalAmount: number;
  isLoading: boolean;
  startMonthLabel?: string;
  formatMoney: (amount: number) => string;
}

export const TreasuryBalanceHero: React.FC<TreasuryBalanceHeroProps> = ({
  totalAmount,
  isLoading,
  startMonthLabel,
  formatMoney,
}) => {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#2D2D32] bg-gradient-to-br from-[#1C1C1E] via-[#121214] to-[#0A0A0B] text-white shadow-xl relative touch-pan-y p-5 md:p-6">
      {/* Top Gold Highlighting Strip */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#FFD200] via-[#F59E0B] to-[#FFD200]" />

      {/* Subtle Background Decorative Icon */}
      <div className="absolute right-[-20px] bottom-[-20px] opacity-[0.06] pointer-events-none select-none">
        <Wallet size={160} className="text-[#FFD200]" />
      </div>

      <div className="relative z-10">
        {/* Header Tagline */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#FFD200]/15 rounded-lg text-[#FFD200] border border-[#FFD200]/30 shadow-xs">
              <Wallet size={15} className="stroke-[2.5]" />
            </div>
            <div>
              <p className="text-xs font-black text-[#FFD200] tracking-wider uppercase flex items-center gap-1.5">
                御膳总资金大盘
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </p>
              <p className="text-[10px] text-stone-400 font-mono tracking-widest uppercase">
                Cash & Bank Combined Assets
              </p>
            </div>
          </div>

          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-800/80 border border-stone-700/80 text-[10px] font-bold text-stone-300">
            <Sparkles size={11} className="text-[#FFD200]" />
            全盘掌控
          </span>
        </div>

        {/* Main Amount Display */}
        <div className="mt-4 md:mt-5">
          <div className="text-[10px] uppercase tracking-widest font-bold text-stone-400">
            期末自由支配总资金 (Ending Portfolio)
          </div>
 <h2 className="mt-1 break-words text-3xl md:text-5xl font-black tracking-tight text-[#FFD200] font-mono tabular-nums leading-none">
            {isLoading ? (
              <span className="animate-pulse text-stone-600">RM --,--.-</span>
            ) : (
              formatMoney(totalAmount)
            )}
          </h2>

          {startMonthLabel && (
            <p className="text-[11px] text-stone-400 mt-2.5 flex items-center gap-1.5 font-medium">
              <TrendingUp size={12} className="text-emerald-400" />
              <span>{startMonthLabel}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
