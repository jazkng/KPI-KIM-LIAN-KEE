import React from "react";
import { Lock, Unlock, MinusCircle, FileDown, ClipboardCheck } from "lucide-react";
import { MonthlyClosing } from "../treasuryTypes";
import { TreasuryCollapsible } from "./TreasuryCollapsible";

interface TreasuryClosingPanelProps {
  closing?: MonthlyClosing;
  isExporting: boolean;
  onExportCsv: (account: "CASH" | "BANK") => void;
  onCloseMonth: () => void;
  onUnlockMonth: () => void;
  onAddExpense: () => void;
  formatMoney: (amount: number) => string;
}

const StatusPill: React.FC<{ closed: boolean }> = ({ closed }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
      closed
        ? "bg-emerald-50 text-emerald-700"
        : "bg-amber-50 text-amber-700"
    }`}
  >
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        closed ? "bg-emerald-500" : "bg-amber-500"
      }`}
    />
    {closed ? "已锁定" : "待结账"}
  </span>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[11px] font-bold text-stone-500">{label}</span>
    <span className="font-mono text-[11px] font-bold tabular-nums text-[#111111]">
      {children}
    </span>
  </div>
);

export const TreasuryClosingPanel: React.FC<TreasuryClosingPanelProps> = ({
  closing,
  isExporting,
  onExportCsv,
  onCloseMonth,
  onUnlockMonth,
  onAddExpense,
  formatMoney,
}) => {
  const variance = (v?: number) =>
    !!v && Math.abs(v) >= 0.01 ? (
      <span className="ml-1.5 text-rose-600">
        ({v > 0 ? "+" : ""}
        {formatMoney(v)})
      </span>
    ) : null;

  return (
    <TreasuryCollapsible
      title="月度结账"
      subtitle="Monthly Closing"
      icon={Lock}
      summary={<StatusPill closed={!!closing} />}
    >
      <div className="space-y-3">
        {closing ? (
          <>
            <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-3.5">
              {closing.closedAt && (
                <Row label="结账时间">
                  {new Date(closing.closedAt).toLocaleString("zh-CN", {
                    hour12: false,
                  })}
                </Row>
              )}
              {closing.closedBy && <Row label="操作人员">{closing.closedBy}</Row>}

              {(closing.cashEndActual !== undefined ||
                closing.bankEndActual !== undefined) && (
                <div className="space-y-2 border-t border-[#E5E7EB] pt-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
                    实点对账
                  </p>
                  <Row label="实点现金">
                    {formatMoney(closing.cashEndActual ?? 0)}
                    {variance(closing.cashVariance)}
                  </Row>
                  <Row label="实点银行">
                    {formatMoney(closing.bankEndActual ?? 0)}
                    {variance(closing.bankVariance)}
                  </Row>
                  {closing.varianceNote && (
                    <p className="pt-1 text-[11px] leading-relaxed text-stone-500">
                      差异说明：{closing.varianceNote}
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={onUnlockMonth}
              type="button"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#8B0000] transition-colors hover:bg-[#F6F7FB] active:scale-[0.98]"
            >
              <Unlock size={16} strokeWidth={2.5} />
              解锁本月账目
            </button>
          </>
        ) : (
          <>
            <p className="rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-3.5 text-[11px] leading-relaxed text-stone-600">
              请在所有交易记录完整、每日对账无误后进行月结锁定。锁定后将无法修改本月账目。
            </p>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <button
                onClick={onCloseMonth}
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#111111] text-sm font-bold text-white transition-colors hover:bg-black active:scale-[0.98]"
              >
                <Lock size={16} strokeWidth={2.5} />
                结算并锁定本月
              </button>

              <button
                onClick={onAddExpense}
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-[0.98]"
              >
                <MinusCircle size={16} strokeWidth={2.5} />
                补录支出
              </button>
            </div>
          </>
        )}

        {/* 区间对账导出（只读） */}
        <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <ClipboardCheck size={14} strokeWidth={2.5} className="text-stone-500" />
            <p className="text-xs font-bold text-[#111111]">区间对账导出</p>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-stone-500">
            导出任意日期区间的流水 CSV，用来和银行月结单逐笔对账。只读取资料，不会修改任何账目。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onExportCsv("BANK")}
              disabled={isExporting}
              type="button"
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#111111] transition-colors hover:bg-stone-50 disabled:opacity-45"
            >
              <FileDown size={14} strokeWidth={2.5} /> 银行流水
            </button>
            <button
              onClick={() => onExportCsv("CASH")}
              disabled={isExporting}
              type="button"
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#111111] transition-colors hover:bg-stone-50 disabled:opacity-45"
            >
              <FileDown size={14} strokeWidth={2.5} /> 现金流水
            </button>
          </div>
        </div>
      </div>
    </TreasuryCollapsible>
  );
};
