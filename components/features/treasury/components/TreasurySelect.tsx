import React from "react";

interface TreasurySelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
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
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold text-[#111111] flex items-center gap-1">
          {label}
          {required && <span className="text-red-500 font-extrabold">*</span>}
        </label>
        {helperText && <span className="text-[11px] text-gray-400 font-medium">{helperText}</span>}
      </div>

      <div className="relative">
        <select
          id={id}
          required={required}
          className={`
            min-h-12
            w-full
            rounded-xl
            border
            border-[#E5E7EB]
            bg-white
            px-3
            text-sm
            text-[#111111]
            font-bold
            outline-none
            transition
            appearance-none
            focus:border-[#FFD200]
            focus:ring-2
            focus:ring-[#FFD200]/30
            disabled:bg-gray-50
            disabled:text-gray-400
            cursor-pointer
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="font-bold">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none select-none text-gray-400 text-xs font-bold">
          ▼
        </div>
      </div>
    </div>
  );
};
