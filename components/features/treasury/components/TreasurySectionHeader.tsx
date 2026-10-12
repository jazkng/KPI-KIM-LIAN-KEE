import React from "react";
import { LucideIcon } from "lucide-react";

interface TreasurySectionHeaderProps {
  title: string;
  /** 英文副标题，唯一允许出现英文的位置 */
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export const TreasurySectionHeader: React.FC<TreasurySectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  action,
}) => {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F7FB] text-[#111111]">
            <Icon size={15} strokeWidth={2.5} />
          </span>
        )}
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold leading-tight text-[#111111]">
            {title}
          </h4>
          {subtitle && (
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
