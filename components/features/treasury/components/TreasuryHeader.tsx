import React from "react";
import { X, Wallet } from "lucide-react";
import { ModuleGuideButton } from "../../../ui/ModuleGuide";

interface TreasuryHeaderProps {
  onClose: () => void;
}

export const TreasuryHeader: React.FC<TreasuryHeaderProps> = ({ onClose }) => {
  return (
    <div className="h-14 bg-white px-4 flex justify-between items-center text-[#111111] shrink-0 border-b border-[#E5E7EB] shadow-sm z-50 relative">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="bg-[#FFD200] text-[#111111] p-2 rounded-xl shrink-0">
          <Wallet className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-sans font-bold text-base md:text-lg tracking-wide text-[#111111] truncate">
            资金管理
          </h1>
          <p className="text-[10px] text-gray-500 font-mono tracking-widest leading-none mt-0.5 uppercase">
            Treasury
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ModuleGuideButton module="TREASURY" />
        <button
          onClick={onClose}
          type="button"
          className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all text-gray-600 active:scale-95 touch-manipulation"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};
