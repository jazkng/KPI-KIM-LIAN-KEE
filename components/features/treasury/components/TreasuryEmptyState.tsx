import React from "react";

interface TreasuryEmptyStateProps {
  title: string;
  description: string;
  emoji?: string;
  action?: React.ReactNode;
}

export const TreasuryEmptyState: React.FC<TreasuryEmptyStateProps> = ({
  title,
  description,
  emoji = "📂",
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs py-12">
      <div className="text-4xl mb-3 select-none">{emoji}</div>
      <h3 className="text-sm font-extrabold text-[#111111] leading-tight">
        {title}
      </h3>
      <p className="mt-1 text-xs text-gray-400 font-medium max-w-xs leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
