import React from "react";
import { Landmark, ArrowRightLeft, TrendingUp, Briefcase, Settings, LucideIcon } from "lucide-react";
import { TreasuryTab } from "../treasuryTypes";

interface TabItem {
  id: TreasuryTab;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
}

interface TreasuryMobileTabsProps {
  activeTab: TreasuryTab;
  setActiveTab: (tab: TreasuryTab) => void;
}

const TABS: TabItem[] = [
  { id: "OVERVIEW", label: "总览", mobileLabel: "总览", icon: Landmark },
  { id: "TRANSFERS", label: "转账", mobileLabel: "转账", icon: ArrowRightLeft },
  { id: "EXTRA_INCOME", label: "额外收入", mobileLabel: "收入", icon: TrendingUp },
  { id: "EQUITY", label: "股权", mobileLabel: "股东", icon: Briefcase },
  { id: "SETTINGS", label: "设置", mobileLabel: "设置", icon: Settings },
];

export const TreasuryMobileTabs: React.FC<TreasuryMobileTabsProps> = ({
  activeTab,
  setActiveTab,
}) => {
  return (
    <div className="px-3 md:px-6 py-2 bg-white md:bg-[#F6F7FB] shrink-0 border-b border-[#E5E7EB]">
      {/* Mobile Grid View (cols-5, no horizontal scroll) */}
      <nav className="grid grid-cols-5 gap-1 rounded-2xl bg-[#F6F7FB] md:hidden p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              className={`
                flex min-h-[52px] min-w-0
                flex-col items-center justify-center
                gap-1 rounded-xl
                px-1
                text-[11px] font-bold
                touch-manipulation
                transition-transform
                active:scale-[0.97]
                ${
                  isActive
                    ? "bg-[#FFD200] text-[#111111] shadow-sm"
                    : "text-gray-500 hover:bg-gray-100"
                }
              `}
            >
              <Icon size={18} strokeWidth={2.5} className={isActive ? "text-[#111111]" : "text-gray-400"} />
              <span className="w-full truncate text-center leading-none">
                {tab.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Tablet & Desktop View */}
      <nav className="hidden md:flex p-1 bg-gray-200/60 rounded-2xl gap-1 md:gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              className={`relative flex-grow md:flex-initial min-w-[110px] py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 touch-manipulation ${
                isActive
                  ? "bg-white text-[#111111] shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={2.5}
                className={`transition-colors ${isActive ? "text-[#111111]" : "text-gray-400"}`}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
