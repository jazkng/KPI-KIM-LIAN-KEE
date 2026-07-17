import React from "react";
import { DollarSign } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasurySelect } from "../components/TreasurySelect";
import { TreasuryButton } from "../components/TreasuryButton";

interface TreasuryIncomeModalProps {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  isEditing: boolean;
  incomeSourceHistory: string[];
  loading?: boolean;
}

export const TreasuryIncomeModal: React.FC<TreasuryIncomeModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  onSave,
  isEditing,
  incomeSourceHistory,
  loading = false,
}) => {
  const categories = [
    { value: "UTILITIES_ELECTRIC", label: "电费 (Electricity)" },
    { value: "UTILITIES_WATER", label: "水费 (Water)" },
    { value: "RENT", label: "租金 (Rent)" },
    { value: "OTHER", label: "其他 (Other)" },
  ];

  return (
    <TreasuryBottomSheet
      open={open}
      title={isEditing ? "✏️ 编辑收入记录" : "代收/杂项收入 (Extra Income)"}
      subtitle="Extra Income Form"
      onClose={onClose}
      icon={<DollarSign size={20} />}
    >
      <div className="space-y-4">
        {/* Source Field with datalist */}
        <div className="flex flex-col gap-1.5 w-full">
          <label htmlFor="income-source" className="text-xs font-bold text-[#111111]">
            Source (来源) <span className="text-red-500 font-extrabold">*</span>
          </label>
          <input
            id="income-source"
            list="income_sources_list"
            type="text"
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
              placeholder:text-gray-400
              placeholder:font-normal
              outline-none
              transition
              focus:border-[#FFD200]
              focus:ring-2
              focus:ring-[#FFD200]/30
            "
            value={form.source || ""}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="例如：隔壁店铺、废品回收"
          />
          <datalist id="income_sources_list">
            {incomeSourceHistory.map((src, idx) => (
              <option key={idx} value={src} />
            ))}
          </datalist>
        </div>

        {/* Category Field */}
        <TreasurySelect
          label="Category (类别)"
          id="income-category"
          value={form.category || "OTHER"}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          options={categories}
          required
        />

        {/* Amount Field */}
        <TreasuryFormField
          label="Amount (金额)"
          id="income-amount"
          type="number"
          step="any"
          inputMode="decimal"
          value={form.amount || ""}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
          suffix="RM"
          required
        />

        {/* Account Selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#111111]">
            Into Account (存入账户) <span className="text-red-500 font-extrabold">*</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, toAccount: "CASH" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.toAccount === "CASH"
                  ? "bg-green-50 border-[#22C55E] text-[#22C55E]"
                  : "bg-white border-[#E5E7EB] text-gray-500 hover:text-[#111111]"
              }`}
            >
              CASH
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, toAccount: "BANK" })}
              className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                form.toAccount === "BANK"
                  ? "bg-blue-50 border-blue-500 text-blue-600"
                  : "bg-white border-[#E5E7EB] text-gray-500 hover:text-[#111111]"
              }`}
            >
              BANK
            </button>
          </div>
        </div>

        {/* Date Field */}
        <TreasuryFormField
          label="Date (日期)"
          id="income-date"
          type="date"
          value={form.date || ""}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />

        {/* Note Field */}
        <TreasuryFormField
          label="Note (备注)"
          id="income-note"
          type="text"
          value={form.note || ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="选填备注..."
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
            variant={isEditing ? "primary" : "success"}
            onClick={onSave}
            loading={loading}
            className="flex-[2]"
          >
            {isEditing ? "确认更新" : "确认收入"}
          </TreasuryButton>
        </div>
      </div>
    </TreasuryBottomSheet>
  );
};
