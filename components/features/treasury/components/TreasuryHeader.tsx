import React from "react";
import { ArrowLeft, Wallet } from "lucide-react";
import { ModuleGuideButton } from "../../../ui/ModuleGuide";

interface TreasuryHeaderProps {
  onClose: () => void;
}

export const TreasuryHeader: React.FC<TreasuryHeaderProps> = ({ onClose }) => {
  return (
    <div className="relative z-50 flex h-14 shrink-0 items-center justify-between gap-2 bg-[#111111] px-3 text-white md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          onClick={onClose}
          type="button"
          style={{ touchAction: "manipulation" }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft size={20} strokeWidth={2.5} />
        </button>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFD200] text-[#111111]">
          <Wallet size={18} strokeWidth={2.5} />
        </span>

        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight text-white">
            资金管理
          </h1>
          <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-stone-500">
            Treasury
          </p>
        </div>
      </div>

      <div className="shrink-0">
        <ModuleGuideButton module="TREASURY" />
      </div>
    </div>
  );
};
