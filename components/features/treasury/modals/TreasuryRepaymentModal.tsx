import React from "react";
import { ArrowLeftCircle } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasurySelect } from "../components/TreasurySelect";
import { TreasuryButton } from "../components/TreasuryButton";

interface TreasuryRepaymentModalProps {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  shareholders: { id: string; name: string }[] | undefined;
  loading?: boolean;
}

export const TreasuryRepaymentModal: React.FC<TreasuryRepaymentModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  onSave,
  shareholders = [],
  loading = false,
}) => {
  const shOptions = [
    { value: "", label: "请选择股东 (Select Shareholder...)" },
    ...shareholders.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <TreasuryBottomSheet
      open={open}
      title="还钱给股东 (Repayment)"
      subtitle="Repayment to Shareholder"
      onClose={onClose}
      icon={<ArrowLeftCircle size={20} className="text-indigo-600" />}
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500 font-bold leading-relaxed">
          偿还股东之前的注资或垫资，将作为支出从公司资金池扣除。
        </p>

        {/* Shareholder selection */}
        <TreasurySelect
          label="Shareholder (股东)"
          id="rep-sh"
          value={form.shareholderId || ""}
          onChange={(e) => setForm({ ...form, shareholderId: e.target.value })}
          options={shOptions}
          required
        />

        {/* Amount Field */}
        <TreasuryFormField
          label="Amount (金额)"
          id="rep-amount"
          type="number"
          step="any"
          inputMode="decimal"
          value={form.amount || ""}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
          suffix="RM"
          required
        />

        {/* Account selection (From Account) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#111111]">
            Funds From (资金来源) <span className="text-red-500 font-extrabold">*</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, fromAccount: "BANK" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.fromAccount === "BANK"
                  ? "bg-blue-50 border-blue-500 text-blue-600"
                  : "bg-white border-[#E5E7EB] text-gray-500 hover:text-[#111111]"
              }`}
            >
              BANK
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, fromAccount: "CASH" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.fromAccount === "CASH"
                  ? "bg-green-50 border-[#22C55E] text-[#22C55E]"
                  : "bg-white border-[#E5E7EB] text-gray-500 hover:text-[#111111]"
              }`}
            >
              CASH
            </button>
          </div>
        </div>

        {/* Date Field */}
        <TreasuryFormField
          label="Date (日期)"
          id="rep-date"
          type="date"
          value={form.date || ""}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />

        {/* Note Field */}
        <TreasuryFormField
          label="Note (备注)"
          id="rep-note"
          type="text"
          value={form.note || ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="例如：还清垫付资金"
        />

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <TreasuryButton
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            取消
          </TreasuryButton>
          <TreasuryButton
            variant="danger"
            onClick={onSave}
            loading={loading}
            className="flex-[2]"
          >
            确认还款
          </TreasuryButton>
        </div>
      </div>
    </TreasuryBottomSheet>
  );
};
