import React from "react";
import {
  Zap,
  Droplets,
  Home,
  Coins,
  History,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Printer,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { TreasuryEmptyState } from "../components/TreasuryEmptyState";

interface TreasuryExtraIncomeTabProps {
  extraIncomeStats: {
    total: number;
    thisMonthTotal: number;
    breakdown: {
      electricity: number;
      water: number;
      rent: number;
      other: number;
    };
    records: any[];
    filteredTotal: number;
  };
  incomeFilterMonth: string;
  onAddIncome: () => void;
  onEditIncome: (record: any) => void;
  onDeleteIncome: (id: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGenerateReceipt: (record: any) => void;
  isGeneratingPdf: boolean;
  printingRecord: any | null;
  getMonthLabel: (month: string) => string;
  formatMoney: (val: number) => string;
}

/** 列表项的操作按钮，44x44 满足触控 */
const RowAction: React.FC<{
  onClick: () => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, label, disabled, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white transition-colors active:scale-95 disabled:opacity-45 ${
      danger
        ? "text-stone-400 hover:bg-[#8B0000] hover:text-white"
        : "text-stone-500 hover:bg-[#F6F7FB] hover:text-[#111111]"
    }`}
  >
    {children}
  </button>
);

export const TreasuryExtraIncomeTab: React.FC<TreasuryExtraIncomeTabProps> = ({
  extraIncomeStats,
  incomeFilterMonth,
  onAddIncome,
  onEditIncome,
  onDeleteIncome,
  onPrevMonth,
  onNextMonth,
  onGenerateReceipt,
  isGeneratingPdf,
  printingRecord,
  getMonthLabel,
  formatMoney,
}) => {
  const cards = [
    { label: "电费", value: extraIncomeStats.breakdown.electricity, icon: Zap },
    { label: "水费", value: extraIncomeStats.breakdown.water, icon: Droplets },
    { label: "租金", value: extraIncomeStats.breakdown.rent, icon: Home },
    { label: "其他", value: extraIncomeStats.breakdown.other, icon: Coins },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      {/* ── 累计代收收入 ─────────────────── */}
      <section className="rounded-2xl bg-[#111111] p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-bold text-stone-400">累计代收收入</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone-600">
            Extra Income
          </p>
        </div>

        <h2 className="mt-2 break-words font-mono text-[32px] font-bold leading-none tabular-nums tracking-tight text-[#FFD200] md:text-5xl">
          {formatMoney(extraIncomeStats.total)}
        </h2>

        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[11px] tabular-nums text-stone-500">
            本月小计 {formatMoney(extraIncomeStats.thisMonthTotal)}
          </p>

          <button
            type="button"
            onClick={onAddIncome}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FFD200] px-5 text-sm font-bold text-[#111111] transition-colors hover:bg-[#E5C100] active:scale-[0.98] md:w-auto"
          >
            <Plus size={16} strokeWidth={2.5} />
            记录新收入
          </button>
        </div>
      </section>

      {/* ── 分类小计 ─────────────────────── */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[#E5E7EB] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white md:grid-cols-4 md:divide-y-0">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0 p-3.5 md:p-4">
            <div className="flex items-center gap-1.5">
              <card.icon size={13} strokeWidth={2.5} className="shrink-0 text-stone-400" />
              <p className="truncate text-[11px] font-bold text-stone-500">
                {card.label}
              </p>
            </div>
            <p className="mt-1.5 truncate font-mono text-sm font-bold tabular-nums text-[#111111]">
              {formatMoney(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* ── 收入流水历史 ─────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-3.5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F7FB] text-[#111111]">
              <History size={15} strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-tight text-[#111111]">
                收入流水
              </h3>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
                History
              </p>
            </div>
          </div>

          {/* 月份切换 */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrevMonth}
              aria-label="上个月"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-90"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>

            <div className="flex h-11 min-w-[120px] flex-1 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-3 font-mono text-xs font-bold tabular-nums text-[#111111] md:flex-none">
              {getMonthLabel(incomeFilterMonth)}
            </div>

            <button
              type="button"
              onClick={onNextMonth}
              aria-label="下个月"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-90"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 当月小计 */}
        {extraIncomeStats.records.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F6F7FB] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-stone-500">
              当月小计
              <span className="ml-1.5 font-mono tabular-nums text-stone-400">
                {extraIncomeStats.records.length} 笔
              </span>
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-emerald-600">
              +{formatMoney(extraIncomeStats.filteredTotal)}
            </span>
          </div>
        )}

        {/* 列表 */}
        {extraIncomeStats.records.length === 0 ? (
          <div className="p-4">
            <TreasuryEmptyState
              icon={TrendingUp}
              title="当月暂无收入记录"
              description="使用上方「记录新收入」录入代收或杂项收入流水。"
            />
          </div>
        ) : (
          <div>
            {extraIncomeStats.records
              .sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
              )
              .map((t, idx) => (
                <div
                  key={t.id}
                  className={`flex flex-col gap-2.5 p-3.5 md:flex-row md:items-center md:justify-between ${
                    idx > 0 ? "border-t border-[#E5E7EB]" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug text-[#111111]">
                      {t.note?.replace("[代收] ", "") || "代收收入"}
                    </p>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-stone-400">
                      {t.date} · {t.toAccount}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end">
                    <span className="font-mono text-sm font-bold tabular-nums text-emerald-600">
                      +{formatMoney(t.amount)}
                    </span>

                    <div className="flex gap-1.5">
                      <RowAction onClick={() => onEditIncome(t)} label="编辑">
                        <Pencil size={14} strokeWidth={2.5} />
                      </RowAction>

                      <RowAction
                        onClick={() => onGenerateReceipt(t)}
                        label="打印收据"
                        disabled={isGeneratingPdf}
                      >
                        {isGeneratingPdf && printingRecord?.id === t.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Printer size={14} strokeWidth={2.5} />
                        )}
                      </RowAction>

                      <RowAction
                        onClick={() => onDeleteIncome(t.id)}
                        label="删除"
                        danger
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </RowAction>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
