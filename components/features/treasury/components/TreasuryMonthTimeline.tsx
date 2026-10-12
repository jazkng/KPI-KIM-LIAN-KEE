import React from "react";
import { CalendarRange } from "lucide-react";
import { ExpenseItem, MonthlyClosing } from "../treasuryTypes";
import { generateMonthsRange, getMonthLabel } from "../treasuryUtils";
import { TreasuryCollapsible } from "./TreasuryCollapsible";

interface TreasuryMonthTimelineProps {
  initialDate?: string;
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  monthlyClosings: MonthlyClosing[];
  expenses: ExpenseItem[];
  formatMoney: (amount: number) => string;
}

export const TreasuryMonthTimeline: React.FC<TreasuryMonthTimelineProps> = ({
  initialDate,
  selectedMonth,
  onSelectMonth,
  monthlyClosings,
  expenses,
  formatMoney,
}) => {
  const startMonth = initialDate ? initialDate.substring(0, 7) : "2025-11";
  const months = generateMonthsRange(
    startMonth,
    new Date().toISOString().slice(0, 7),
  ).reverse();

  return (
    <TreasuryCollapsible
      title="历史月度汇总"
      subtitle="Monthly Timeline"
      icon={CalendarRange}
      summary={
        <span className="rounded-full bg-[#F6F7FB] px-2.5 py-1 font-mono text-[10px] font-bold tabular-nums text-stone-500">
          {months.length} 个月
        </span>
      }
    >
      <div className="space-y-1.5 md:max-h-80 md:overflow-y-auto">
        {months.map((monthStr) => {
          const closing = monthlyClosings.find((c) => c.month === monthStr);
          const isSelected = selectedMonth === monthStr;

          const unpaidBills = expenses.filter((e) => {
            const dDate = e.time?.split("T")[0] || "";
            return (
              dDate.startsWith(monthStr) &&
              (e.paymentStatus === "UNPAID" || e.paymentStatus === "PARTIAL")
            );
          });
          const unpaidCount = unpaidBills.length;
          const unpaidAmount = unpaidBills.reduce((sum, e) => {
            const amt =
              Number(e.outstandingAmount) ||
              (Number(e.totalBillAmount) > 0
                ? Number(e.totalBillAmount) - (Number(e.amount) || 0)
                : Number(e.amount)) ||
              0;
            return sum + amt;
          }, 0);

          return (
            <button
              key={monthStr}
              type="button"
              onClick={() => onSelectMonth(monthStr)}
              className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#E5E7EB] bg-white hover:bg-[#F6F7FB]"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs font-bold tabular-nums md:text-sm">
                    {getMonthLabel(monthStr)}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      closing
                        ? isSelected
                          ? "bg-white/15 text-emerald-300"
                          : "bg-emerald-50 text-emerald-700"
                        : isSelected
                          ? "bg-white/15 text-amber-300"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {closing ? "已结账" : "待结算"}
                  </span>
                </div>

                {unpaidCount > 0 && (
                  <span
                    className={`font-mono text-[10px] font-bold tabular-nums ${
                      isSelected ? "text-rose-300" : "text-rose-600"
                    }`}
                  >
                    应付 {formatMoney(unpaidAmount)} · {unpaidCount} 笔
                  </span>
                )}
              </div>

              <div className="shrink-0 text-right">
                {closing ? (
                  <>
                    <p
                      className={`font-mono text-xs font-bold tabular-nums md:text-sm ${
                        isSelected ? "text-[#FFD200]" : "text-[#111111]"
                      }`}
                    >
                      {formatMoney(closing.cashEnd + closing.bankEnd)}
                    </p>
                    <p className="mt-0.5 hidden font-mono text-[10px] tabular-nums md:block">
                      <span className="text-emerald-600">
                        +{formatMoney(closing.cashIn + closing.bankIn)}
                      </span>
                      <span className="mx-1 text-stone-400">/</span>
                      <span className="text-rose-600">
                        -{formatMoney(closing.cashOut + closing.bankOut)}
                      </span>
                    </p>
                  </>
                ) : (
                  <span
                    className={`text-[11px] font-medium ${
                      isSelected ? "text-stone-400" : "text-stone-400"
                    }`}
                  >
                    {isSelected ? "计算中" : "查看"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </TreasuryCollapsible>
  );
};
