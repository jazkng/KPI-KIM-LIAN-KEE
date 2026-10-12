import React from "react";
import { UserPlus } from "lucide-react";
import { TreasuryBottomSheet } from "../components/TreasuryBottomSheet";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasuryButton } from "../components/TreasuryButton";

interface TreasuryShareholderModalProps {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  loading?: boolean;
}

export const TreasuryShareholderModal: React.FC<TreasuryShareholderModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  onSave,
  loading = false,
}) => {
  return (
    <TreasuryBottomSheet
      open={open}
      title="股东资料"
      subtitle="Shareholder Profile"
      onClose={onClose}
      icon={<UserPlus size={20} />}
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
                保存资料
              </TreasuryButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Name Field */}
        <TreasuryFormField
          label="股东姓名"
          id="sh-name"
          type="text"
          value={form.name || ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="请输入股东姓名"
          required
        />

        {/* Role Field */}
        <TreasuryFormField
          label="职责头衔"
          id="sh-role"
          type="text"
          value={form.role || ""}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          placeholder="例如：Director, Partner"
        />

        {/* Capital & Equity Row */}
        <div className="grid grid-cols-2 gap-3">
          <TreasuryFormField
            label="注资额"
            id="sh-capital"
            type="number"
            step="any"
            inputMode="decimal"
            value={form.investmentAmount !== undefined ? form.investmentAmount : ""}
            onChange={(e) =>
              setForm({
                ...form,
                investmentAmount: e.target.value ? parseFloat(e.target.value) : 0,
              })
            }
            suffix="RM"
          />

          <TreasuryFormField
            label="股权比例"
            id="sh-equity"
            type="number"
            step="any"
            inputMode="decimal"
            value={form.equityPercentage !== undefined ? form.equityPercentage : ""}
            onChange={(e) =>
              setForm({
                ...form,
                equityPercentage: e.target.value ? parseFloat(e.target.value) : 0,
              })
            }
            suffix="%"
          />
        </div>
      </div>
    </TreasuryBottomSheet>
  );
};
