import React from "react";
import { Lock, Info, Save, Settings } from "lucide-react";
import { TreasuryButton } from "../components/TreasuryButton";
import { TreasuryFormField } from "../components/TreasuryFormField";

interface TreasurySettingsTabProps {
  isSettingsUnlocked: boolean;
  settingsPasswordInput: string;
  setSettingsPasswordInput: (val: string) => void;
  settingsPasswordError: boolean;
  setSettingsPasswordError: (val: boolean) => void;
  config: {
    initialDate: string;
    initialCash: number;
    initialBank: number;
  };
  setConfig: React.Dispatch<React.SetStateAction<any>>;
  onUnlock: () => void;
  onSaveConfig: () => void;
  onLock: () => void;
}

export const TreasurySettingsTab: React.FC<TreasurySettingsTabProps> = ({
  isSettingsUnlocked,
  settingsPasswordInput,
  setSettingsPasswordInput,
  settingsPasswordError,
  setSettingsPasswordError,
  config,
  setConfig,
  onUnlock,
  onSaveConfig,
  onLock,
}) => {
  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-200">
      {!isSettingsUnlocked ? (
        /* 🔐 Lock screen password verification */
        <div className="bg-white p-6 md:p-10 rounded-[2rem] shadow-sm border border-gray-200 text-center space-y-6">
          <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto select-none">
            <Lock size={28} className="text-gray-400" />
          </div>
          <div>
            <h3 className="font-extrabold text-base md:text-lg text-[#111111]">
              系统设置已锁定
            </h3>
            <p className="text-xs text-gray-400 mt-1.5 font-bold">
              请输入高权限管理员密码以解锁初始资金设置
            </p>
          </div>
          <div className="max-w-xs mx-auto">
            <input
              type="password"
              inputMode="numeric"
              maxLength={10}
              value={settingsPasswordInput}
              onChange={(e) => {
                setSettingsPasswordInput(e.target.value);
                setSettingsPasswordError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onUnlock();
              }}
              placeholder="输入安全密码..."
              className={`w-full p-4 bg-gray-50 rounded-xl font-mono font-black text-xl text-center outline-none border-2 tracking-[0.5em] transition-colors ${
                settingsPasswordError
                  ? "border-red-400 bg-red-50 animate-shake"
                  : "border-gray-200 focus:border-[#FFD200]"
              }`}
            />
            {settingsPasswordError && (
              <p className="text-red-500 text-[11px] font-bold mt-2 animate-in fade-in">
                ❌ 密码不正确，请重试
              </p>
            )}
          </div>
          <TreasuryButton
            variant="primary"
            onClick={onUnlock}
            className="w-full max-w-xs mx-auto"
          >
            <Lock size={15} strokeWidth={2.5} /> 解锁系统
          </TreasuryButton>
        </div>
      ) : (
        /* 🔓 Unlocked Initial config setup screen */
        <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-gray-200 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-[#111111]" />
              <h3 className="font-extrabold text-base md:text-lg text-[#111111]">
                系统初始结余配置
              </h3>
            </div>
            <button
              type="button"
              onClick={onLock}
              className="text-xs text-gray-400 hover:text-red-500 font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-100 cursor-pointer active:scale-95 transition"
              style={{ minHeight: "36px" }}
            >
              <Lock size={12} /> 锁定面板
            </button>
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs text-amber-800 font-bold flex items-start gap-2 leading-relaxed">
            <Info size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              ⚠️ 注意：修改此配置将会直接重整资金计算的历史起点。
              <br />
              请务必确保录入的金额是目标生效日期当天准确的物理现金结余与银行流水余额。
            </div>
          </div>

          <div className="space-y-5">
            {/* Start Date Field */}
            <TreasuryFormField
              label="历史生效起点日期 (Start Date)"
              id="init-date"
              type="date"
              value={config.initialDate}
              onChange={(e) => setConfig({ ...config, initialDate: e.target.value })}
              required
            />

            {/* Inputs grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TreasuryFormField
                label="初始现金备用金 (Initial Cash)"
                id="init-cash"
                type="number"
                step="any"
                inputMode="decimal"
                value={config.initialCash}
                onChange={(e) =>
                  setConfig({ ...config, initialCash: parseFloat(e.target.value) || 0 })
                }
                suffix="RM"
                required
              />

              <TreasuryFormField
                label="初始银行账户余额 (Initial Bank)"
                id="init-bank"
                type="number"
                step="any"
                inputMode="decimal"
                value={config.initialBank}
                onChange={(e) =>
                  setConfig({ ...config, initialBank: parseFloat(e.target.value) || 0 })
                }
                suffix="RM"
                required
              />
            </div>

            <TreasuryButton
              variant="primary"
              onClick={onSaveConfig}
              className="w-full !mt-6"
            >
              <Save size={16} /> 保存初始余额并重算资金池
            </TreasuryButton>
          </div>
        </div>
      )}
    </div>
  );
};
