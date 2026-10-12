import React, { useState } from "react";
import { ChevronDown, LucideIcon } from "lucide-react";

interface TreasuryCollapsibleProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** 收起时显示在右侧的摘要（例如状态徽章） */
  summary?: React.ReactNode;
  /** 预设是否展开。手机端建议 false，避免一屏塞太多要滑很久 */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * 资金管理 — 可折叠区块
 * 次要信息（月度结账、历史时间线）预设收起，需要时才展开。
 */
export const TreasuryCollapsible: React.FC<TreasuryCollapsibleProps> = ({
  title,
  subtitle,
  icon: Icon,
  summary,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F7FB] active:bg-stone-100"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F7FB] text-[#111111]">
              <Icon size={15} strokeWidth={2.5} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-[#111111]">
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {summary}
          <ChevronDown
            size={18}
            strokeWidth={2.5}
            className={`text-stone-400 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-[#E5E7EB] p-4">{children}</div>
      )}
    </section>
  );
};
