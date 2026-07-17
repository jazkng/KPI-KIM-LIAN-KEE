import React from "react";
import { Coins } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasurySelect } from "../components/TreasurySelect";
import { TreasuryButton } from "../components/TreasuryButton";

interface TreasuryDividendModalProps {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  shareholders: { id: string; name: string }[] | undefined;
  loading?: boolean;
}

export const TreasuryDividendModal: React.FC<TreasuryDividendModalProps> = ({
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
      title="分发分红 (Payout)"
      subtitle="Shareholder Dividend / Payout"
      onClose={onClose}
      icon={<Coins size={20} className="text-red-500" />}
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500 font-bold leading-relaxed">
          作为股东薪资、利润分红进行发放，将从公司资金池中扣除。
        </p>

        {/* Shareholder selection */}
        <TreasurySelect
          label="Shareholder (股东)"
          id="div-sh"
          value={form.shareholderId || ""}
          onChange={(e) => setForm({ ...form, shareholderId: e.target.value })}
          options={shOptions}
          required
        />

        {/* Amount Field */}
        <TreasuryFormField
          label="Amount (金额)"
          id="div-amount"
          type="number"
          step="any"
          inputMode="decimal"
          value={form.amount || ""}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
          suffix="RM"
          required
        />

        {/* Account selection (paymentMethod) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#111111]">
            Payment Method (资金来源) <span className="text-red-500 font-extrabold">*</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, paymentMethod: "BANK_TRANSFER" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.paymentMethod === "BANK_TRANSFER"
                  ? "bg-blue-50 border-blue-500 text-blue-600"
                  : "bg-white border-[#E5E7EB] text-gray-500 hover:text-[#111111]"
              }`}
            >
              BANK
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, paymentMethod: "CASH" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.paymentMethod === "CASH"
                  ? "bg-green-50 border-[#22C55E] text-[#22C55E]"
                  : "bg-white border-[#E5E7EB] text-gray-500 hover:text-[#111111]"
              }`}
            >
              CASH
            </button>
          </div>
        </div>

        {/* Dividend Month Field */}
        <div className="flex flex-col gap-1.5 w-full">
          <label htmlFor="div-month" className="text-xs font-bold text-[#111111]">
            Dividend Month (分红月份) <span className="text-red-500 font-extrabold">*</span>
          </label>
          <input
            id="div-month"
            type="month"
            required
            className="
              min-h-12
              w-full
              rounded-xl
              border
              border-[#E5E7EB]
              bg-white
              px-3
              text-sm
              text-[#111111]
              font-bold
              outline-none
              transition
              focus:border-[#FFD200]
              focus:ring-2
              focus:ring-[#FFD200]/30
            "
            value={form.dividendMonth || ""}
            onChange={(e) => setForm({ ...form, dividendMonth: e.target.value })}
          />
        </div>

        {/* Date Field */}
        <TreasuryFormField
          label="Date (日期)"
          id="div-date"
          type="date"
          value={form.date || ""}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />

        {/* Note Field */}
        <TreasuryFormField
          label="Note (备注)"
          id="div-note"
          type="text"
          value={form.note || ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="例如：第一季度利润分红"
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
            确认分发
          </TreasuryButton>
        </div>
      </div>
    </TreasuryBottomSheet>
  );
};
