import React from "react";
import {
  LayoutGrid,
  ArrowRightLeft,
  TrendingUp,
  Users,
  Settings,
  LucideIcon,
} from "lucide-react";
import { TreasuryTab } from "../treasuryTypes";

interface TabItem {
  id: TreasuryTab;
  label: string;
  icon: LucideIcon;
}

interface TreasuryMobileTabsProps {
  activeTab: TreasuryTab;
  setActiveTab: (tab: TreasuryTab) => void;
}

const TABS: TabItem[] = [
  { id: "OVERVIEW", label: "总览", icon: LayoutGrid },
  { id: "TRANSFERS", label: "转账", icon: ArrowRightLeft },
  { id: "EXTRA_INCOME", label: "收入", icon: TrendingUp },
  { id: "EQUITY", label: "股东", icon: Users },
  { id: "SETTINGS", label: "设置", icon: Settings },
];

export const TreasuryMobileTabs: React.FC<TreasuryMobileTabsProps> = ({
  activeTab,
  setActiveTab,
}) => {
  return (
    <nav
      className="flex bg-[#111111] px-2 md:px-4"
      style={{ touchAction: "pan-y" }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold transition-colors md:min-h-[48px] md:flex-none md:flex-row md:gap-2 md:px-5 md:text-xs ${
              isActive ? "text-[#FFD200]" : "text-stone-500 hover:text-stone-300"
            }`}
          >
            <Icon size={17} strokeWidth={2.5} />
            <span className="leading-none">{tab.label}</span>
            {/* 底部指示条：取代整块高亮，视觉更克制 */}
            <span
              className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-colors md:inset-x-3 ${
                isActive ? "bg-[#FFD200]" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
};
