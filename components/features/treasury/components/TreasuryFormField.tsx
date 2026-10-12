import React from "react";

interface TreasuryFormFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  suffix?: React.ReactNode;
}

export const TreasuryFormField: React.FC<TreasuryFormFieldProps> = ({
  label,
  helperText,
  suffix,
  className = "",
  id,
  type = "text",
  required,
  ...props
}) => {
  const isNumeric = type === "number";

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-bold text-[#111111]">
          {label}
          {required && <span className="ml-0.5 text-[#8B0000]">*</span>}
        </label>
        {helperText && (
          <span className="text-[11px] text-stone-400">{helperText}</span>
        )}
      </div>

      <div className="relative flex items-center">
        <input
          id={id}
          type={type}
          required={required}
          className={`h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-bold text-[#111111] outline-none transition-colors placeholder:font-normal placeholder:text-stone-400 focus:border-[#FFD200] focus:ring-2 focus:ring-[#FFD200]/25 disabled:bg-[#F6F7FB] disabled:text-stone-400 ${
            isNumeric ? "font-mono tabular-nums" : ""
          } ${suffix ? "pr-12" : ""} ${className}`}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 select-none text-xs font-bold text-stone-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
};
