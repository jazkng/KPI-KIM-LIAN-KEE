import React from "react";
import { X, Wallet, ShieldCheck, ArrowLeft } from "lucide-react";
import { ModuleGuideButton } from "../../../ui/ModuleGuide";

interface TreasuryHeaderProps {
  onClose: () => void;
}

export const TreasuryHeader: React.FC<TreasuryHeaderProps> = ({ onClose }) => {
  return (
    <div className="h-14 bg-[#111111] px-4 flex justify-between items-center text-white shrink-0 border-b border-[#2A2A2E] shadow-md z-50 relative">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <button
          onClick={onClose}
          type="button"
          style={{ touchAction: 'manipulation' }}
          className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#222226] hover:bg-white/20 text-white rounded-xl transition-all active:scale-95 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft size={20} strokeWidth={2.5} />
        </button>
        <div className="bg-gradient-to-br from-[#FFD200] to-[#E5C100] text-[#111111] p-2 rounded-xl shrink-0 shadow-sm">
          <Wallet className="w-5 h-5 stroke-[2.5]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-sans font-black text-base md:text-lg tracking-wide text-white truncate">
              资金管理
            </h1>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#FFD200]/15 text-[#FFD200] border border-[#FFD200]/30 text-[9px] font-bold">
              <ShieldCheck size={10} />
              御膳智控
            </span>
          </div>
          <p className="text-[10px] text-gray-400 font-mono tracking-widest leading-none mt-0.5 uppercase">
            Imperial Treasury System
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ModuleGuideButton module="TREASURY" />
        <button
          onClick={onClose}
          type="button"
          className="w-10 h-10 flex items-center justify-center bg-[#222226] hover:bg-rose-900/40 hover:text-rose-400 rounded-xl transition-all text-gray-300 active:scale-95 touch-pan-y"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};
