import React from "react";

interface TreasuryCardProps {
  children: React.ReactNode;
  padding?: "normal" | "compact" | "none";
  className?: string;
}

/** 资金管理 — 统一卡片容器（无渐变、无重阴影） */
export const TreasuryCard: React.FC<TreasuryCardProps> = ({
  children,
  padding = "normal",
  className = "",
}) => {
  const pad =
    padding === "none" ? "" : padding === "compact" ? "p-3.5" : "p-4 md:p-5";

  return (
    <section
      className={`rounded-2xl border border-[#E5E7EB] bg-white ${pad} ${className}`}
    >
      {children}
    </section>
  );
};
