import React from "react";
import { PlusCircle } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasurySelect } from "../components/TreasurySelect";
import { TreasuryButton } from "../components/TreasuryButton";

interface TreasuryInjectionModalProps {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  shareholders: { id: string; name: string }[] | undefined;
  loading?: boolean;
}

export const TreasuryInjectionModal: React.FC<TreasuryInjectionModalProps> = ({
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
    ...shareholders.map((s) => ({ value: s.name, label: s.name })),
  ];

  return (
    <TreasuryBottomSheet
      open={open}
      title="股东注资"
      subtitle="Shareholder Capital Injection"
      onClose={onClose}
      icon={<PlusCircle size={20} />}
      footer={
        <div className="flex gap-3">
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
                确认注资
              </TreasuryButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Shareholder selection */}
        <TreasurySelect
          label="股东"
          id="inj-sh"
          value={form.shareholderName || ""}
          onChange={(e) => setForm({ ...form, shareholderName: e.target.value })}
          options={shOptions}
          required
        />

        {/* Amount Field */}
        <TreasuryFormField
          label="金额"
          id="inj-amount"
          type="number"
          step="any"
          inputMode="decimal"
          value={form.amount || ""}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
          suffix="RM"
          required
        />

        {/* Account selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#111111]">
            Into Account (存入账户) <span className="text-rose-600 font-extrabold">*</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, toAccount: "BANK" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.toAccount === "BANK"
                  ? "bg-[#F6F7FB] border-blue-500 text-[#111111]"
                  : "bg-white border-[#E5E7EB] text-stone-500 hover:text-[#111111]"
              }`}
            >
              BANK
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, toAccount: "CASH" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.toAccount === "CASH"
                  ? "bg-emerald-50 border-[#22C55E] text-[#22C55E]"
                  : "bg-white border-[#E5E7EB] text-stone-500 hover:text-[#111111]"
              }`}
            >
              CASH
            </button>
          </div>
        </div>

        {/* Date Field */}
        <TreasuryFormField
          label="日期"
          id="inj-date"
          type="date"
          value={form.date || ""}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />

        {/* Note Field */}
        <TreasuryFormField
          label="备注"
          id="inj-note"
          type="text"
          value={form.note || ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="例如：补充营运资金"
        />
      </div>
    </TreasuryBottomSheet>
  );
};
