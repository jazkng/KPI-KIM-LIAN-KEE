import React from "react";
import { Loader2 } from "lucide-react";

interface TreasuryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  loading?: boolean;
}

/**
 * 资金管理 — 统一按钮
 * 高度 48px（手机触控安全），无渐变、无重阴影。
 */
export const TreasuryButton: React.FC<TreasuryButtonProps> = ({
  variant = "primary",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}) => {
  const base =
    "h-12 px-5 rounded-xl text-sm font-bold transition-colors duration-150 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer select-none";

  const variants: Record<string, string> = {
    primary: "bg-[#FFD200] hover:bg-[#E5C100] text-[#111111]",
    secondary:
      "bg-white border border-[#E5E7EB] hover:bg-[#F6F7FB] text-[#111111]",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
    danger: "bg-[#8B0000] hover:bg-[#6d0000] text-white",
    ghost: "bg-transparent text-stone-500 hover:bg-stone-100",
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${
        disabled || loading ? "opacity-45 cursor-not-allowed active:scale-100" : ""
      } ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span>处理中</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
