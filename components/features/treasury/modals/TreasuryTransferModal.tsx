import React from "react";
import { ArrowRightLeft } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasuryButton } from "../components/TreasuryButton";
import { FundTransfer } from "../treasuryTypes";

interface TreasuryTransferModalProps {
  open: boolean;
  onClose: () => void;
  form: Partial<FundTransfer>;
  setForm: React.Dispatch<React.SetStateAction<Partial<FundTransfer>>>;
  onSave: () => void;
  loading?: boolean;
}

export const TreasuryTransferModal: React.FC<TreasuryTransferModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  onSave,
  loading = false,
}) => {
  const isDeposit = form.type === "DEPOSIT";

  return (
    <TreasuryBottomSheet
      open={open}
      title="新增资金记录"
      subtitle="Fund Transfer"
      onClose={onClose}
      icon={<ArrowRightLeft size={20} />}
    >
      <div className="space-y-4">
        {/* Toggle between DEPOSIT (Cash -> Bank) and WITHDRAWAL (Bank -> Cash) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                type: "DEPOSIT",
                fromAccount: "CASH",
                toAccount: "BANK",
              })
            }
            className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              isDeposit
                ? "bg-white shadow-xs text-[#22C55E]"
                : "text-gray-400 hover:text-[#111111]"
            }`}
          >
            存入 (Bank In)
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                type: "WITHDRAWAL",
                fromAccount: "BANK",
                toAccount: "CASH",
              })
            }
            className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              !isDeposit
                ? "bg-white shadow-xs text-blue-600"
                : "text-gray-400 hover:text-[#111111]"
            }`}
          >
            提款 (Withdrawal)
          </button>
        </div>

        {/* Date Field */}
        <TreasuryFormField
          label="交易日期"
          id="transfer-date"
          type="date"
          value={form.date || ""}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />

        {/* Amount Field */}
        <TreasuryFormField
          label="转账金额"
          id="transfer-amount"
          type="number"
          step="any"
          inputMode="decimal"
          value={form.amount !== undefined ? form.amount : ""}
          onChange={(e) =>
            setForm({
              ...form,
              amount: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          placeholder="请输入转账金额"
          suffix="RM"
          required
        />

        {/* Note Field */}
        <TreasuryFormField
          label="交易备注"
          id="transfer-note"
          type="text"
          value={form.note || ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="例如：柜员机存入、提取备用金"
        />

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <TreasuryButton
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            取消
          </TreasuryButton>
          <TreasuryButton
            variant="primary"
            onClick={onSave}
            loading={loading}
            className="flex-[2]"
          >
            确认提交
          </TreasuryButton>
        </div>
      </div>
    </TreasuryBottomSheet>
  );
};
