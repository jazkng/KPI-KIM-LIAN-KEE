import React, { useState, useMemo } from "react";
import { TreasuryTab } from "./treasury/treasuryTypes";
import { formatMoney, getMonthLabel } from "./treasury/treasuryUtils";

// --- Hooks (资料层 / 逻辑层) ---
import {
  useTreasuryData,
  clearTreasuryCache,
} from "./treasury/hooks/useTreasuryData";
import { useTreasuryHistory } from "./treasury/hooks/useTreasuryHistory";
import { useTreasuryExtraIncome } from "./treasury/hooks/useTreasuryExtraIncome";
import { useTreasuryForms } from "./treasury/hooks/useTreasuryForms";

// --- Layout ---
import { TreasuryShell } from "./treasury/TreasuryShell";
import { TreasuryHeader } from "./treasury/components/TreasuryHeader";
import { TreasuryMobileTabs } from "./treasury/components/TreasuryMobileTabs";
import { TreasuryReceiptTemplate } from "./treasury/components/TreasuryReceiptTemplate";

// --- Tabs ---
import { TreasuryOverviewTab } from "./treasury/tabs/TreasuryOverviewTab";
import { TreasuryTransfersTab } from "./treasury/tabs/TreasuryTransfersTab";
import { TreasuryExtraIncomeTab } from "./treasury/tabs/TreasuryExtraIncomeTab";
import { TreasuryEquityTab } from "./treasury/tabs/TreasuryEquityTab";
import { TreasurySettingsTab } from "./treasury/tabs/TreasurySettingsTab";

// --- Modals ---
import { TreasuryTransferModal } from "./treasury/modals/TreasuryTransferModal";
import { TreasuryIncomeModal } from "./treasury/modals/TreasuryIncomeModal";
import { TreasuryShareholderModal } from "./treasury/modals/TreasuryShareholderModal";
import { TreasuryInjectionModal } from "./treasury/modals/TreasuryInjectionModal";
import { TreasuryRepaymentModal } from "./treasury/modals/TreasuryRepaymentModal";
import { TreasuryDividendModal } from "./treasury/modals/TreasuryDividendModal";
import { TreasuryExpenseModal } from "./treasury/modals/TreasuryExpenseModal";
import { TreasuryLedgerModal } from "./treasury/modals/TreasuryLedgerModal";
import { TreasuryHistoryModal } from "./treasury/modals/TreasuryHistoryModal";

interface TreasuryModuleProps {
  onClose: () => void;
}

/**
 * 资金管理 (Treasury) — 模块组装层
 *
 * 结构：
 *   hooks/    资料读取、余额计算、表单与写入操作
 *   tabs/     五个分页 (总览 / 转账 / 额外收入 / 股权 / 设置)
 *   components/  共用 UI 区块
 *   modals/   各类弹窗
 */
export const TreasuryModule: React.FC<TreasuryModuleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TreasuryTab>("OVERVIEW");
  const [viewLedger, setViewLedger] = useState<"CASH" | "BANK" | null>(null);

  const data = useTreasuryData();
  const history = useTreasuryHistory({
    fetchMonthlyLedger: data.fetchMonthlyLedger,
    initialDate: data.config.initialDate,
  });
  const income = useTreasuryExtraIncome(data.transfers);
  const forms = useTreasuryForms({
    config: data.config,
    setConfig: data.setConfig,
    transfers: data.transfers,
    setTransfers: data.setTransfers,
    expenses: data.expenses,
    setExpenses: data.setExpenses,
    loadData: data.loadData,
    // 👑 写入后必须绕过快取重抓，否则新记录不会出现在画面上
    loadExpenses: () => {
      clearTreasuryCache();
      data.loadData(true);
    },
  });

  const totalCapital = useMemo(
    () =>
      (data.config.shareholders || []).reduce(
        (acc, s) => acc + s.investmentAmount,
        0,
      ),
    [data.config.shareholders],
  );

  const dividendHistory = useMemo(
    () => data.expenses.filter((e) => e.category === "DIVIDEND"),
    [data.expenses],
  );

  return (
    <>
      <TreasuryShell
        header={<TreasuryHeader onClose={onClose} />}
        navigation={
          <TreasuryMobileTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        }
      >
        <div className="p-4 pb-6 md:p-8 md:pb-8">
          {/* ==================== OVERVIEW ==================== */}
          {activeTab === "OVERVIEW" && (
            <TreasuryOverviewTab
              selectedMonth={data.selectedMonth}
              setSelectedMonth={data.setSelectedMonth}
              onMonthShift={data.handleMonthShift}
              selectedMonthClosing={data.selectedMonthClosing}
              isSelectedMonthLoading={data.isSelectedMonthLoading}
              activeBalances={data.activeBalances}
              monthlyClosings={data.monthlyClosings}
              expenses={data.expenses}
              initialDate={data.config.initialDate}
              isExporting={history.isHistoryLoading}
              onOpenLedger={(account) => setViewLedger(account)}
              onDeposit={forms.openDepositModal}
              onWithdraw={forms.openWithdrawModal}
              onTransferClick={forms.openDepositModal}
              onIncomeClick={() => setActiveTab("EXTRA_INCOME")}
              onHistoryClick={() => history.setIsHistoryModalOpen(true)}
              onExportCsv={history.handleExportRangeCsv}
              onCloseMonth={data.handleCloseMonth}
              onUnlockMonth={data.handleUnlockMonth}
              onAddExpense={() => forms.setIsExpenseModalOpen(true)}
              formatMoney={formatMoney}
            />
          )}

          {/* ==================== EXTRA INCOME ==================== */}
          {activeTab === "EXTRA_INCOME" && (
            <TreasuryExtraIncomeTab
              extraIncomeStats={income.extraIncomeStats}
              incomeFilterMonth={income.incomeFilterMonth}
              onAddIncome={forms.openAddIncomeModal}
              onEditIncome={forms.handleEditIncome}
              onDeleteIncome={forms.handleDeleteTransfer}
              onPrevMonth={() => income.navigateMonth("prev")}
              onNextMonth={() => income.navigateMonth("next")}
              onGenerateReceipt={forms.handleGenerateReceipt}
              isGeneratingPdf={forms.isGeneratingPdf}
              printingRecord={forms.printingRecord}
              getMonthLabel={getMonthLabel}
              formatMoney={formatMoney}
            />
          )}

          {/* ==================== EQUITY ==================== */}
          {activeTab === "EQUITY" && (
            <TreasuryEquityTab
              shareholders={data.config.shareholders || []}
              totalCapital={totalCapital}
              transfers={data.transfers}
              dividendHistory={dividendHistory}
              expandedInjections={forms.expandedInjections}
              onToggleExpand={(name) =>
                forms.setExpandedInjections((prev) => ({
                  ...prev,
                  [name]: !prev[name],
                }))
              }
              onAddShareholder={() => {
                forms.setShareholderForm({
                  name: "",
                  investmentAmount: 0,
                  equityPercentage: 0,
                });
                forms.setIsShareholderFormOpen(true);
              }}
              onEditShareholder={(s) => {
                forms.setShareholderForm(s);
                forms.setIsShareholderFormOpen(true);
              }}
              onDeleteShareholder={forms.handleDeleteShareholder}
              onAddInjection={() => forms.setIsInjectionModalOpen(true)}
              onAddRepayment={() => forms.setIsRepaymentModalOpen(true)}
              onAddDividend={() => forms.setIsDividendModalOpen(true)}
              onDeleteTransfer={forms.handleDeleteTransfer}
              formatMoney={formatMoney}
            />
          )}

          {/* ==================== TRANSFERS ==================== */}
          {activeTab === "TRANSFERS" && (
            <TreasuryTransfersTab
              transfers={data.transfers}
              onAddTransfer={forms.openDepositModal}
              onDeleteTransfer={forms.handleDeleteTransfer}
            />
          )}

          {/* ==================== SETTINGS ==================== */}
          {activeTab === "SETTINGS" && (
            <TreasurySettingsTab
              isSettingsUnlocked={forms.isSettingsUnlocked}
              settingsPasswordInput={forms.settingsPasswordInput}
              setSettingsPasswordInput={forms.setSettingsPasswordInput}
              settingsPasswordError={forms.settingsPasswordError}
              setSettingsPasswordError={forms.setSettingsPasswordError}
              config={data.config}
              setConfig={data.setConfig}
              onUnlock={forms.handleSettingsUnlock}
              onLock={() => {
                forms.setIsSettingsUnlocked(false);
                forms.setSettingsPasswordInput("");
              }}
              onSaveConfig={forms.handleSaveConfig}
            />
          )}
        </div>
      </TreasuryShell>

      {/* ⚠️ 弹窗一律放在 TreasuryShell 之外（当兄弟节点，不是子节点），
          这样 position:fixed 就不会被绑到 Shell 的滚动容器上。

          ⚠️ 不要 createPortal 到 document.body。
          styles.css 里 body 是 position:fixed + overflow:hidden 且没有 inset，
          盒子高度会塌缩，iOS 的触摸命中测试落不到滚动区，结果就是「看得见、
          按得动、但滑不动」。全项目其他模块（AP 等）都不 portal，照做即可。 */}
      {/* ==================== MODALS ==================== */}
      <TreasuryTransferModal
        open={forms.isTransferModalOpen}
        onClose={() => forms.setIsTransferModalOpen(false)}
        form={forms.transferForm}
        setForm={forms.setTransferForm}
        onSave={forms.handleSaveTransfer}
      />

      <TreasuryShareholderModal
        open={forms.isShareholderFormOpen}
        onClose={() => forms.setIsShareholderFormOpen(false)}
        form={forms.shareholderForm}
        setForm={forms.setShareholderForm}
        onSave={forms.handleSaveShareholder}
      />

      <TreasuryInjectionModal
        open={forms.isInjectionModalOpen}
        onClose={() => forms.setIsInjectionModalOpen(false)}
        form={forms.injectionForm}
        setForm={forms.setInjectionForm}
        onSave={forms.handleSaveInjection}
        shareholders={data.config.shareholders}
      />

      <TreasuryIncomeModal
        open={forms.isIncomeModalOpen}
        onClose={() => {
          forms.setIsIncomeModalOpen(false);
          forms.setEditingIncomeRecord(null);
        }}
        form={forms.incomeForm}
        setForm={forms.setIncomeForm}
        onSave={forms.handleSaveIncome}
        isEditing={!!forms.editingIncomeRecord}
        incomeSourceHistory={income.incomeSourceHistory}
      />

      <TreasuryExpenseModal
        open={forms.isExpenseModalOpen}
        onClose={() => forms.setIsExpenseModalOpen(false)}
        form={forms.expenseForm}
        setForm={forms.setExpenseForm}
        onSave={forms.handleSaveExpense}
      />

      <TreasuryDividendModal
        open={forms.isDividendModalOpen}
        onClose={() => forms.setIsDividendModalOpen(false)}
        form={forms.dividendForm}
        setForm={forms.setDividendForm}
        onSave={forms.handleSaveDividend}
        shareholders={data.config.shareholders}
      />

      <TreasuryRepaymentModal
        open={forms.isRepaymentModalOpen}
        onClose={() => forms.setIsRepaymentModalOpen(false)}
        form={forms.repaymentForm}
        setForm={forms.setRepaymentForm}
        onSave={forms.handleSaveRepayment}
        shareholders={data.config.shareholders}
      />

      {/* 收据打印模板：只有生成 PDF 时才挂载 */}
      <TreasuryReceiptTemplate
        record={forms.printingRecord}
        printRef={forms.printRef}
      />

      {/* 历史账本档案馆 */}
      <TreasuryHistoryModal
        open={history.isHistoryModalOpen}
        onClose={history.closeHistoryModal}
        historyMonth={history.historyMonth}
        setHistoryMonth={history.setHistoryMonth}
        onSearch={() => history.fetchHistoryData(history.historyMonth)}
        isLoading={history.isHistoryLoading}
        historyRecords={history.historyRecords}
        filteredHistoryRecords={history.filteredHistoryRecords}
        inHistory={history.inHistory}
        outHistory={history.outHistory}
        stats={history.dynamicHistoryStats}
        accountFilter={history.historyAccountFilter}
        setAccountFilter={history.setHistoryAccountFilter}
        searchQuery={history.historySearchQuery}
        setSearchQuery={history.setHistorySearchQuery}
        activeFlow={history.historyActiveFlow}
        setActiveFlow={history.setHistoryActiveFlow}
        formatMoney={formatMoney}
      />

      {/* 流水明细 */}
      {viewLedger && (
        <TreasuryLedgerModal
          isOpen={!!viewLedger}
          type={viewLedger}
          onClose={() => setViewLedger(null)}
          items={data.getLedgerData(viewLedger)}
        />
      )}
    </>
  );
};
