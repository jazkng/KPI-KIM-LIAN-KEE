import React from "react";
import { ExpenseItem, MonthlyClosing } from "../treasuryTypes";
import { TreasuryMonthSelector } from "../components/TreasuryMonthSelector";
import { TreasuryBalanceHero } from "../components/TreasuryBalanceHero";
import { TreasuryAccountCard } from "../components/TreasuryAccountCard";
import { TreasuryQuickActions } from "../components/TreasuryQuickActions";
import { TreasuryClosingPanel } from "../components/TreasuryClosingPanel";
import { TreasuryMonthTimeline } from "../components/TreasuryMonthTimeline";

interface ActiveBalances {
  cashStart: number;
  cashIn: number;
  cashOut: number;
  cashEnd: number;
  bankStart: number;
  bankIn: number;
  bankOut: number;
  bankEnd: number;
  total: number;
  isClosed: boolean;
  startMonthLabel: string;
}

interface TreasuryOverviewTabProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  onMonthShift: (delta: number) => void;
  selectedMonthClosing?: MonthlyClosing;
  isSelectedMonthLoading: boolean;
  activeBalances: ActiveBalances;
  monthlyClosings: MonthlyClosing[];
  expenses: ExpenseItem[];
  initialDate?: string;
  isExporting: boolean;
  onOpenLedger: (account: "CASH" | "BANK") => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransferClick: () => void;
  onIncomeClick: () => void;
  onHistoryClick: () => void;
  onExportCsv: (account: "CASH" | "BANK") => void;
  onCloseMonth: () => void;
  onUnlockMonth: () => void;
  onAddExpense: () => void;
  formatMoney: (amount: number) => string;
}

export const TreasuryOverviewTab: React.FC<TreasuryOverviewTabProps> = ({
  selectedMonth,
  setSelectedMonth,
  onMonthShift,
  selectedMonthClosing,
  isSelectedMonthLoading,
  activeBalances,
  monthlyClosings,
  expenses,
  initialDate,
  isExporting,
  onOpenLedger,
  onDeposit,
  onWithdraw,
  onTransferClick,
  onIncomeClick,
  onHistoryClick,
  onExportCsv,
  onCloseMonth,
  onUnlockMonth,
  onAddExpense,
  formatMoney,
}) => {
  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-5">
      {/* ── 1. 月份切换 ───────────────────────── */}
      <TreasuryMonthSelector
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        onMonthShift={onMonthShift}
        isClosed={!!selectedMonthClosing}
      />

      {/* ── 2. 总资金大盘 ─────────────────────── */}
      <TreasuryBalanceHero
        totalAmount={activeBalances.total}
        isLoading={isSelectedMonthLoading}
        startMonthLabel={activeBalances.startMonthLabel}
        formatMoney={formatMoney}
      />

      {/* ── 3. 现金 / 银行账户明细 ─────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <TreasuryAccountCard
          account="CASH"
          label="现金账户"
          opening={activeBalances.cashStart}
          totalIn={activeBalances.cashIn}
          totalOut={activeBalances.cashOut}
          ending={activeBalances.cashEnd}
          isLoading={isSelectedMonthLoading}
          onOpenLedger={() => onOpenLedger("CASH")}
          onActionClick={(e) => {
            e.stopPropagation();
            onDeposit();
          }}
          actionLabel="存入"
          formatMoney={formatMoney}
        />

        <TreasuryAccountCard
          account="BANK"
          label="银行账户"
          opening={activeBalances.bankStart}
          totalIn={activeBalances.bankIn}
          totalOut={activeBalances.bankOut}
          ending={activeBalances.bankEnd}
          isLoading={isSelectedMonthLoading}
          onOpenLedger={() => onOpenLedger("BANK")}
          onActionClick={(e) => {
            e.stopPropagation();
            onWithdraw();
          }}
          actionLabel="提款"
          formatMoney={formatMoney}
        />
      </div>

      {/* ── 4. 快捷操作 ───────────────────────── */}
      <TreasuryQuickActions
        onTransferClick={onTransferClick}
        onIncomeClick={onIncomeClick}
        onHistoryClick={onHistoryClick}
      />

      {/* ── 5. 月度结账与对账 ─────────────────── */}
      <TreasuryClosingPanel
        closing={selectedMonthClosing}
        isExporting={isExporting}
        onExportCsv={onExportCsv}
        onCloseMonth={onCloseMonth}
        onUnlockMonth={onUnlockMonth}
        onAddExpense={onAddExpense}
        formatMoney={formatMoney}
      />

      {/* ── 6. 历史月度时间线 ─────────────────── */}
      <TreasuryMonthTimeline
        initialDate={initialDate}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        monthlyClosings={monthlyClosings}
        expenses={expenses}
        formatMoney={formatMoney}
      />
    </div>
  );
};
