import React from "react";
import { ChevronDown } from "lucide-react";

interface TreasurySelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  helperText?: string;
}

export const TreasurySelect: React.FC<TreasurySelectProps> = ({
  label,
  options,
  helperText,
  className = "",
  id,
  required,
  ...props
}) => {
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

      <div className="relative">
        <select
          id={id}
          required={required}
          className={`h-12 w-full appearance-none rounded-xl border border-[#E5E7EB] bg-white pl-3 pr-10 text-sm font-bold text-[#111111] outline-none transition-colors focus:border-[#FFD200] focus:ring-2 focus:ring-[#FFD200]/25 disabled:bg-[#F6F7FB] disabled:text-stone-400 ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={2.5}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
      </div>
    </div>
  );
};
