import React from "react";

interface TreasuryFormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
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
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold text-[#111111] flex items-center gap-1">
          {label}
          {required && <span className="text-red-500 font-extrabold">*</span>}
        </label>
        {helperText && <span className="text-[11px] text-gray-400 font-medium">{helperText}</span>}
      </div>

      <div className="relative flex items-center">
        <input
          id={id}
          type={type}
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
            placeholder:text-gray-400
            placeholder:font-normal
            outline-none
            transition
            focus:border-[#FFD200]
            focus:ring-2
            focus:ring-[#FFD200]/30
            disabled:bg-gray-50
            disabled:text-gray-400
            ${suffix ? "pr-10" : ""}
            ${className}
          `}
          {...props}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs pointer-events-none select-none">
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
};
