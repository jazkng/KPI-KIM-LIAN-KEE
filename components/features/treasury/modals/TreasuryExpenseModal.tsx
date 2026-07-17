import React from "react";
import { FileMinus } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasurySelect } from "../components/TreasurySelect";
import { TreasuryButton } from "../components/TreasuryButton";

interface TreasuryExpenseModalProps {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  loading?: boolean;
}

export const TreasuryExpenseModal: React.FC<TreasuryExpenseModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  onSave,
  loading = false,
}) => {
  const categories = [
    { value: "RENOVATION", label: "装修工程 (Renovation)" },
    { value: "EQUIPMENT", label: "设备采购 (Equipment)" },
    { value: "RENT", label: "租金 (Rent)" },
    { value: "UTILITIES_ELECTRIC", label: "电费 (Electricity)" },
    { value: "UTILITIES_WATER", label: "水费 (Water)" },
    { value: "CLEANING_SUPPLY", label: "清洁药水 (Cleaning Supply)" },
    { value: "MAINTENANCE", label: "维修/保养/清洁 (Maintenance)" },
    { value: "SUPPLIES", label: "消耗杂品 (Supplies)" },
    { value: "SUPPLIER", label: "一般进货 (General)" },
    { value: "SALARY", label: "薪资预支 (Salary)" },
    { value: "LICENSE", label: "执照 (License)" },
    { value: "ADVERTISING", label: "广告与推广 (Advertising & Promotion)" },
    { value: "IT_SOFTWARE", label: "软件与信息技术 (IT & Software)" },
    { value: "BANK_FEE", label: "银行手续费 (Bank Fees)" },
    { value: "OTHER", label: "其他 (Other)" },
  ];

  const handleDateChange = (val: string) => {
    setForm({ ...form, time: val });
  };

  const handleAmountChange = (val: string) => {
    setForm({ ...form, amount: val ? parseFloat(val) : "" });
  };

  return (
    <TreasuryBottomSheet
      open={open}
      title="补录/记录支出"
      subtitle="Manual Expense Log"
      onClose={onClose}
      icon={<FileMinus size={20} className="text-[#EF4444]" />}
    >
      <div className="space-y-4">
        {/* Category Selection */}
        <TreasurySelect
          label="Category (支出类别)"
          id="exp-category"
          value={form.category || "OTHER"}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          options={categories}
          required
        />

        {/* Description / Company */}
        <TreasuryFormField
          label="Description / Item (摘要描述)"
          id="exp-company"
          type="text"
          value={form.company || ""}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="例如：Public Bank MDR, 隔壁店铺租金"
          required
        />

        {/* Amount Field */}
        <TreasuryFormField
          label="Amount (支出金额)"
          id="exp-amount"
          type="number"
          step="any"
          inputMode="decimal"
          value={form.amount || ""}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0.00"
          suffix="RM"
          required
        />

        {/* Account selection (paymentMethod) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#111111]">
            Payment Source (支付渠道) <span className="text-red-500 font-extrabold">*</span>
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

        {/* Date Field (Backdate Allowed) */}
        <TreasuryFormField
          label="Date (日期)"
          id="exp-date"
          type="date"
          value={form.time ? form.time.split("T")[0] : ""}
          onChange={(e) => handleDateChange(e.target.value)}
          required
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
            确认支出
          </TreasuryButton>
        </div>
      </div>
    </TreasuryBottomSheet>
  );
};
