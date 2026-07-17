import React from "react";
import { History, Plus, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { FundTransfer } from "../treasuryTypes";
import { TreasuryEmptyState } from "../components/TreasuryEmptyState";
import { TreasuryButton } from "../components/TreasuryButton";

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
  // Filter transfers that are not internal/shareholder/etc.
  const displayTransfers = transfers.filter(
    (t) =>
      t.fromAccount !== ("OTHER" as any) &&
      t.fromAccount !== ("SHAREHOLDER" as any)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
      {/* Tab Header Card */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-xs border border-gray-150">
        <div className="flex items-center gap-2">
          <History size={18} className="text-[#111111]" />
          <h3 className="font-extrabold text-sm md:text-base text-[#111111]">
            转账记录 (Fund Transfers)
          </h3>
        </div>
        <TreasuryButton
          variant="primary"
          onClick={onAddTransfer}
          className="!h-10 px-4 text-xs font-bold"
        >
          <Plus size={14} /> 新增记录
        </TreasuryButton>
      </div>

      {/* Transfers List */}
      <div className="space-y-3">
        {displayTransfers.length === 0 ? (
          <TreasuryEmptyState
            title="暂无转账记录"
            description="你可以点击上方“新增记录”录入现金与银行账户间的转账流水。"
            emoji="🔄"
          />
        ) : (
          displayTransfers.map((t) => {
            const isDeposit = t.type === "DEPOSIT";
            return (
              <div
                key={t.id}
                className="bg-white p-3.5 md:p-4 rounded-2xl border border-gray-150 flex justify-between items-center shadow-xs gap-3 active:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                  <div
                    className={`p-2.5 md:p-3 rounded-xl shrink-0 ${
                      isDeposit ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"
                    }`}
                  >
                    {isDeposit ? (
                      <ArrowUpRight size={16} className="md:w-5 md:h-5" />
                    ) : (
                      <ArrowDownLeft size={16} className="md:w-5 md:h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-xs md:text-sm text-[#111111] leading-tight">
                      {isDeposit ? "Cash Bank In (存入)" : "Withdrawal (提款)"}
                    </h4>
                    <div className="text-[10px] md:text-xs text-gray-400 font-mono font-medium mt-1">
                      {t.date.split("T")[0]} • {t.fromAccount} ➔ {t.toAccount}
                    </div>
                    {t.note && (
                      <div className="text-[9px] md:text-[10px] text-gray-500 mt-1 italic truncate font-medium">
                        "{t.note}"
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                  <span className="font-mono font-black text-xs md:text-sm whitespace-nowrap text-[#111111]">
                    RM {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    onClick={() => onDeleteTransfer(t.id)}
                    className="p-2 text-gray-300 hover:text-red-500 rounded-full transition-colors cursor-pointer"
                    style={{ minWidth: "40px", minHeight: "40px" }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
