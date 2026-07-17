import React from "react";
import { Wallet } from "lucide-react";

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
    <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm relative">
      {/* Primary Brand Color Top Strip */}
      <div className="h-2 bg-[#FFD200]" />

      <div className="p-5 flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-gray-500">
            <span className="p-1 bg-[#FFD200]/10 rounded-lg text-[#111111]">
              <Wallet size={14} className="stroke-[2.5]" />
            </span>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              期末总资金 (Ending Assets)
            </p>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 font-medium">
            Cash + Bank Portfolio
          </p>

          <div className="mt-4">
            <h2 className="break-words text-3xl md:text-4xl font-extrabold tracking-tight text-[#111111] font-mono tabular-nums">
              {isLoading ? (
                <span className="animate-pulse text-gray-300">RM --,--.-</span>
              ) : (
                formatMoney(totalAmount)
              )}
            </h2>
            {startMonthLabel && (
              <p className="text-[11px] text-gray-400 mt-1.5 italic font-medium">
                {startMonthLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
