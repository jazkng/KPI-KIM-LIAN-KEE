import React from "react";
import { X } from "lucide-react";

interface TreasuryBottomSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
  closeOnBackdrop?: boolean;
}

export const TreasuryBottomSheet: React.FC<TreasuryBottomSheetProps> = ({
  open,
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  maxWidthClassName = "md:max-w-xl",
  closeOnBackdrop = true,
}) => {
  // No background scroll lock to preserve standard native mobile scrolling
  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 md:items-center md:p-4 animate-in fade-in duration-200"
    >
      <section
        role="dialog"
        aria-modal="true"
        className={`
          relative
          flex
          max-h-[92dvh]
          min-h-0
          w-full
          flex-col
          overflow-hidden
          rounded-t-2xl
          bg-white
          shadow-xl
          md:max-h-[88dvh]
          ${maxWidthClassName}
          md:rounded-2xl
          animate-in slide-in-from-bottom duration-300 md:zoom-in-95
        `}
      >
        {/* Mobile pull indicator */}
        <div className="shrink-0 md:hidden flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <header className="shrink-0 border-b border-[#E5E7EB] px-5 py-4 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            {icon && <div className="text-[#111111] shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[#111111] leading-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5 uppercase tracking-wider">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-[#111111] transition-colors cursor-pointer"
            style={{ minWidth: "44px", minHeight: "44px" }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        {/* Scrollable Content */}
        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto
            px-5
            py-4
          "
          style={{
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer ? (
          <footer
            className="shrink-0 border-t border-[#E5E7EB] bg-white px-5 pt-4 pb-4"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
};
