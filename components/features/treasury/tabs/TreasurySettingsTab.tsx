import React from "react";
import { Lock, Info, Save, Settings } from "lucide-react";
import { TreasuryButton } from "../components/TreasuryButton";
import { TreasuryFormField } from "../components/TreasuryFormField";
import { TreasuryCard } from "../components/TreasuryCard";
import { TreasurySectionHeader } from "../components/TreasurySectionHeader";

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
    <div className="mx-auto max-w-2xl">
      {!isSettingsUnlocked ? (
        /* 密码锁 */
        <TreasuryCard className="space-y-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F6F7FB]">
            <Lock size={24} strokeWidth={2} className="text-stone-400" />
          </span>

          <div>
            <h3 className="text-base font-bold text-[#111111]">系统设置已锁定</h3>
            <p className="mt-1.5 text-xs text-stone-500">
              请输入管理员密码以解锁初始资金设置
            </p>
          </div>

          <div className="mx-auto max-w-xs">
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
              placeholder="输入密码"
              aria-label="管理员密码"
              className={`h-14 w-full rounded-xl border bg-[#F6F7FB] text-center font-mono text-xl font-bold tracking-[0.4em] text-[#111111] outline-none transition-colors placeholder:text-base placeholder:tracking-normal placeholder:text-stone-400 ${
                settingsPasswordError
                  ? "border-[#8B0000] bg-[#8B0000]/5"
                  : "border-[#E5E7EB] focus:border-[#FFD200] focus:ring-2 focus:ring-[#FFD200]/25"
              }`}
            />
            {settingsPasswordError && (
              <p className="mt-2 text-[11px] font-bold text-[#8B0000]">
                密码不正确，请重试
              </p>
            )}
          </div>

          <TreasuryButton
            variant="primary"
            onClick={onUnlock}
            className="mx-auto w-full max-w-xs"
          >
            <Lock size={15} strokeWidth={2.5} /> 解锁系统
          </TreasuryButton>
        </TreasuryCard>
      ) : (
        /* 初始结余配置 */
        <TreasuryCard>
          <TreasurySectionHeader
            title="系统初始结余"
            subtitle="Opening Balance"
            icon={Settings}
            action={
              <button
                type="button"
                onClick={onLock}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-stone-500 transition-colors hover:bg-[#F6F7FB] hover:text-[#111111] active:scale-95"
              >
                <Lock size={13} strokeWidth={2.5} /> 锁定
              </button>
            }
          />

          <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-3.5">
            <Info
              size={15}
              strokeWidth={2.5}
              className="mt-0.5 shrink-0 text-stone-500"
            />
            <p className="text-[11px] leading-relaxed text-stone-600">
              修改此配置会直接重整资金计算的历史起点。请确保录入的金额是生效日期当天准确的实点现金与银行余额。
            </p>
          </div>

          <div className="space-y-4">
            <TreasuryFormField
              label="历史生效起点日期"
              id="init-date"
              type="date"
              value={config.initialDate}
              onChange={(e) =>
                setConfig({ ...config, initialDate: e.target.value })
              }
              required
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TreasuryFormField
                label="初始现金备用金"
                id="init-cash"
                type="number"
                step="any"
                inputMode="decimal"
                value={config.initialCash}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    initialCash: parseFloat(e.target.value) || 0,
                  })
                }
                suffix="RM"
                required
              />

              <TreasuryFormField
                label="初始银行余额"
                id="init-bank"
                type="number"
                step="any"
                inputMode="decimal"
                value={config.initialBank}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    initialBank: parseFloat(e.target.value) || 0,
                  })
                }
                suffix="RM"
                required
              />
            </div>

            <TreasuryButton
              variant="primary"
              onClick={onSaveConfig}
              className="mt-2 w-full"
            >
              <Save size={16} strokeWidth={2.5} /> 保存并重算资金池
            </TreasuryButton>
          </div>
        </TreasuryCard>
      )}
    </div>
  );
};
