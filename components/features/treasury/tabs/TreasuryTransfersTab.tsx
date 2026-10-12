import React from "react";
import {
  ArrowRightLeft,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { FundTransfer } from "../treasuryTypes";
import { TreasuryEmptyState } from "../components/TreasuryEmptyState";

interface TreasuryTransfersTabProps {
  transfers: FundTransfer[];
  onAddTransfer: () => void;
  onDeleteTransfer: (id: string) => void;
}

export const TreasuryTransfersTab: React.FC<TreasuryTransfersTabProps> = ({
  transfers,
  onAddTransfer,
  onDeleteTransfer,
}) => {
  // 只显示现金 / 银行之间的内部划转，排除代收与股东往来
  const displayTransfers = transfers.filter(
    (t) =>
      t.fromAccount !== ("OTHER" as any) &&
      t.fromAccount !== ("SHAREHOLDER" as any),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* 标题列 */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F7FB] text-[#111111]">
            <ArrowRightLeft size={15} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-tight text-[#111111]">
              转账记录
            </h3>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
              Fund Transfers
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddTransfer}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#FFD200] px-3.5 text-xs font-bold text-[#111111] transition-colors hover:bg-[#E5C100] active:scale-95"
        >
          <Plus size={14} strokeWidth={2.5} /> 新增记录
        </button>
      </div>

      {/* 记录列表 */}
      {displayTransfers.length === 0 ? (
        <TreasuryEmptyState
          icon={ArrowRightLeft}
          title="暂无转账记录"
          description="点击上方「新增记录」录入现金与银行账户之间的转账流水。"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          {displayTransfers.map((t, idx) => {
            const isDeposit = t.type === "DEPOSIT";
            return (
              <div
                key={t.id}
                className={`flex min-h-[68px] items-center justify-between gap-3 px-3 py-3 md:px-4 ${
                  idx > 0 ? "border-t border-[#E5E7EB]" : ""
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F6F7FB]">
                    {isDeposit ? (
                      <ArrowUpRight
                        size={16}
                        strokeWidth={2.5}
                        className="text-emerald-600"
                      />
                    ) : (
                      <ArrowDownLeft
                        size={16}
                        strokeWidth={2.5}
                        className="text-rose-600"
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold leading-tight text-[#111111] md:text-sm">
                      {isDeposit ? "存入银行" : "提取现金"}
                    </p>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-stone-400 md:text-[11px]">
                      {t.date.split("T")[0]} · {t.fromAccount} → {t.toAccount}
                    </p>
                    {t.note && (
                      <p className="mt-0.5 truncate text-[10px] text-stone-500">
                        {t.note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap font-mono text-xs font-bold tabular-nums text-[#111111] md:text-sm">
                    RM{" "}
                    {t.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteTransfer(t.id)}
                    aria-label="删除记录"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-[#8B0000] hover:text-white active:scale-95"
                  >
                    <Trash2 size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
