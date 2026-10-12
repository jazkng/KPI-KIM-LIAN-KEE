import React from "react";

interface TreasuryBalanceHeroProps {
  totalAmount: number;
  isLoading: boolean;
  startMonthLabel?: string;
  formatMoney: (amount: number) => string;
}

/**
 * 总资金大盘
 * 墨黑底 + 品牌金数字，无渐变、无装饰图标。
 */
export const TreasuryBalanceHero: React.FC<TreasuryBalanceHeroProps> = ({
  totalAmount,
  isLoading,
  startMonthLabel,
  formatMoney,
}) => {
  return (
    <section className="rounded-2xl bg-[#111111] p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-bold text-stone-400">期末总资金</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone-600">
          Cash + Bank
        </p>
      </div>

      <h2 className="mt-2 break-words font-mono text-[32px] font-bold leading-none tabular-nums tracking-tight text-[#FFD200] md:text-5xl">
        {isLoading ? (
          <span className="animate-pulse text-stone-700">RM ——</span>
        ) : (
          formatMoney(totalAmount)
        )}
      </h2>

      {startMonthLabel && (
        <p className="mt-3 border-t border-white/10 pt-3 text-[11px] font-medium text-stone-500">
          {startMonthLabel}
        </p>
      )}
    </section>
  );
};
