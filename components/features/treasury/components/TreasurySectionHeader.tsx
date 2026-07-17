import React from "react";

interface TreasurySectionHeaderProps {
  title: string;
  subtitle?: string;
  emoji?: string;
  action?: React.ReactNode;
}

export const TreasurySectionHeader: React.FC<TreasurySectionHeaderProps> = ({
  title,
  subtitle,
  emoji,
  action,
}) => {
  return (
    <div className="flex items-center justify-between pb-1 border-b border-[#E5E7EB]">
      <div className="flex items-start gap-2">
        {emoji && <span className="text-lg leading-none mt-0.5">{emoji}</span>}
        <div>
          <h4 className="font-bold text-sm md:text-base text-[#111111]">
            {title}
          </h4>
          {subtitle && (
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
