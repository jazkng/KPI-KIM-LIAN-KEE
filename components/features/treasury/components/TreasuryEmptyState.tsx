import React from "react";
import { Inbox, LucideIcon } from "lucide-react";

interface TreasuryEmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  /** @deprecated 已改用 lucide 图标，保留仅为兼容旧调用，不再渲染 */
  emoji?: string;
}

export const TreasuryEmptyState: React.FC<TreasuryEmptyStateProps> = ({
  title,
  description,
  icon: Icon = Inbox,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 py-12 text-center">
      <Icon size={32} strokeWidth={1.5} className="mb-3 text-stone-300" />
      <h3 className="text-sm font-bold leading-tight text-[#111111]">{title}</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-stone-500">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
