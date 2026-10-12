import React, { useEffect } from "react";
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

/**
 * 资金管理 — 统一弹窗骨架
 *
 * 手机能正常滑动的关键：
 *   本组件渲染在 #root 内（刻意不 portal 到 body），不会被 #treasury-page 这个
 *   滚动容器包住。若把弹窗写在 TreasuryShell 内部，iOS 会让 position:fixed
 *   绑到外层滚动器上，内部滚动就会失效。请勿改回去。
 */
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4`}
      style={{ overscrollBehavior: "contain" }}
    >
      <section
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[90dvh] min-h-0 w-full flex-col overflow-hidden rounded-t-2xl bg-white md:max-h-[85dvh] md:rounded-2xl ${maxWidthClassName}`}
      >
        {/* 手机端拖拽提示条 */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 md:hidden">
          <div className="h-1 w-9 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-4 py-3 md:px-5 md:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F6F7FB] text-[#111111]">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold leading-tight text-[#111111]">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-[#111111] active:scale-95"
            aria-label="关闭"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </header>

        {/* 内容区：独立滚动 */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5"
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>

        {/* Footer：操作按钮常驻 */}
        {footer ? (
          <footer
            className="shrink-0 border-t border-[#E5E7EB] bg-white px-4 pt-3 md:px-5"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
};
