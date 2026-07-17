import React from "react";

interface TreasuryStatusBadgeProps {
  status: "CLOSED" | "DRAFT" | "IN" | "OUT" | "PENDING" | string;
  label?: string;
}

export const TreasuryStatusBadge: React.FC<TreasuryStatusBadgeProps> = ({
  status,
  label,
}) => {
  const styles: Record<string, string> = {
    CLOSED: "bg-green-50 text-green-700 border-green-200",
    DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
    IN: "bg-green-50 text-green-700 border-green-100",
    OUT: "bg-red-50 text-red-700 border-red-100",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  };

  const defaultStyle = "bg-gray-50 text-gray-700 border-gray-200";
  const matchedStyle = styles[status] || defaultStyle;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border leading-none shrink-0
        ${matchedStyle}
      `}
    >
      {status === "PENDING" && (
        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
      )}
      {label || status}
    </span>
  );
};
