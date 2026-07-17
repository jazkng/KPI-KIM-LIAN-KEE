import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface TreasuryDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const TreasuryDialog: React.FC<TreasuryDialogProps> = ({
  open,
  title,
  description,
  confirmText = "确认 (Confirm)",
  cancelText = "取消 (Cancel)",
  isDanger = false,
  onConfirm,
  onClose,
}) => {
  // No background scroll lock to preserve standard native mobile scrolling
  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div
        className="
          relative
          w-full
          max-w-[360px]
          rounded-2xl
          bg-white
          p-5
          shadow-xl
          animate-in zoom-in-95 duration-200
        "
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-[#111111] transition-colors"
          style={{ minWidth: "36px", minHeight: "36px" }}
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          <div
            className={`
              mb-3 p-3 rounded-full
              ${isDanger ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"}
            `}
          >
            <AlertTriangle size={24} />
          </div>

          <h3 className="text-base font-extrabold text-[#111111] leading-snug">
            {title}
          </h3>
          
          <p className="mt-2 text-xs font-medium text-gray-500 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="
              h-11
              rounded-xl
              border
              border-[#E5E7EB]
              bg-white
              text-xs
              font-bold
              text-[#111111]
              transition
              hover:bg-gray-50
              active:scale-[0.98]
              touch-manipulation
            "
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`
              h-11
              rounded-xl
              text-xs
              font-bold
              text-white
              transition
              active:scale-[0.98]
              touch-manipulation
              ${isDanger ? "bg-[#EF4444] hover:bg-red-600 shadow-sm" : "bg-[#FFD200] text-[#111111] hover:bg-[#FFD200]/90 shadow-sm"}
            `}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
