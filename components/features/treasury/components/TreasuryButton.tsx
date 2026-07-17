import React from "react";

interface TreasuryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  loading?: boolean;
}

export const TreasuryButton: React.FC<TreasuryButtonProps> = ({
  variant = "primary",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}) => {
  const baseStyle = "h-12 px-5 rounded-xl text-sm font-bold transition duration-200 active:scale-[0.98] select-none touch-manipulation flex items-center justify-center gap-2 cursor-pointer";
  
  const variants = {
    primary: "bg-[#FFD200] hover:bg-[#FFD200]/90 text-[#111111] border-none shadow-sm",
    secondary: "bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#111111] shadow-xs",
    success: "bg-[#22C55E] hover:bg-[#22C55E]/90 text-white border-none shadow-sm",
    danger: "bg-[#EF4444] hover:bg-[#EF4444]/90 text-white border-none shadow-sm",
    ghost: "bg-transparent text-gray-500 hover:bg-gray-100",
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`
        ${baseStyle}
        ${variants[variant]}
        ${(disabled || loading) ? "opacity-50 cursor-not-allowed active:scale-100" : ""}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-1.5">
          <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>加载中...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
