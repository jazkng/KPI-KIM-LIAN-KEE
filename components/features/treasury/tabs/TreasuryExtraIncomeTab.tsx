import React from "react";
import {
  TrendingUp,
  Calendar,
  Zap,
  Droplets,
  Home,
  Coins,
  History,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  Printer,
  Loader2,
  Recycle,
} from "lucide-react";
import { TreasuryEmptyState } from "../components/TreasuryEmptyState";

interface TreasuryExtraIncomeTabProps {
  extraIncomeStats: {
    total: number;
    thisMonthTotal: number;
    breakdown: {
      electricity: number;
      water: number;
      rent: number;
      other: number;
    };
    records: any[];
    filteredTotal: number;
  };
  incomeFilterMonth: string;
  onAddIncome: () => void;
  onEditIncome: (record: any) => void;
  onDeleteIncome: (id: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGenerateReceipt: (record: any) => void;
  isGeneratingPdf: boolean;
  printingRecord: any | null;
  getMonthLabel: (month: string) => string;
  formatMoney: (val: number) => string;
}

export const TreasuryExtraIncomeTab: React.FC<TreasuryExtraIncomeTabProps> = ({
  extraIncomeStats,
  incomeFilterMonth,
  onAddIncome,
  onEditIncome,
  onDeleteIncome,
  onPrevMonth,
  onNextMonth,
  onGenerateReceipt,
  isGeneratingPdf,
  printingRecord,
  getMonthLabel,
  formatMoney,
}) => {
  const cards = [
    {
      l: "Electricity",
      v: extraIncomeStats.breakdown.electricity,
      c: "text-yellow-600",
      b: "bg-yellow-50",
      i: Zap,
    },
    {
      l: "Water",
      v: extraIncomeStats.breakdown.water,
      c: "text-cyan-600",
      b: "bg-cyan-50",
      i: Droplets,
    },
    {
      l: "Rent",
      v: extraIncomeStats.breakdown.rent,
      c: "text-indigo-600",
      b: "bg-indigo-50",
      i: Home,
    },
    {
      l: "Other",
      v: extraIncomeStats.breakdown.other,
      c: "text-emerald-600",
      b: "bg-emerald-50",
      i: Coins,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-8 animate-in fade-in duration-200">
      
      {/* Hero Display Card */}
      <div className="bg-[#111111] rounded-2xl md:rounded-[2rem] p-5 md:p-10 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-5 md:gap-8 border-b-4 border-[#FFD200]">
        <div className="relative z-10 text-center md:text-left space-y-1 md:space-y-2 w-full">
          <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-amber-300 text-[10px] font-bold uppercase tracking-widest border border-white/10">
            <TrendingUp size={12} /> 代收/杂项收入 Extra Revenue
          </div>
          <h2 className="text-2xl md:text-5xl font-black text-white font-mono tracking-tighter">
            {formatMoney(extraIncomeStats.total)}
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-2 text-stone-300 text-xs font-bold">
            <span className="flex items-center gap-1">
              <Calendar size={14} className="text-amber-400" /> 本月小计:{" "}
              {formatMoney(extraIncomeStats.thisMonthTotal)}
            </span>
            <span className="bg-[#FFD200]/20 text-[#FFD200] px-2 py-0.5 rounded border border-[#FFD200]/30 text-[9px] font-bold tracking-wider">
              ⚠️ 非主营业额
            </span>
          </div>
        </div>
        
        <button
          type="button"
          onClick={onAddIncome}
          className="relative z-10 bg-[#FFD200] text-[#111111] px-6 md:px-8 py-3.5 rounded-xl shadow-md flex items-center gap-2 font-extrabold text-xs md:text-sm hover:bg-[#FFD200]/90 transition-all cursor-pointer w-full md:w-auto justify-center active:scale-[0.98] touch-pan-y"
        >
          <Plus size={16} strokeWidth={3} />
          <span>记录新收入</span>
        </button>
      </div>

      {/* Breakdown Grid Cards (2x2 on mobile, 4 columns on desktop) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => (
          <div
            key={card.l}
            className="bg-white p-3.5 md:p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between h-24 md:h-28 relative overflow-hidden group"
          >
            <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <card.i size={44} />
            </div>
            <div className="relative z-10">
              <div
                className={`w-7 h-7 md:w-9 md:h-9 rounded-lg ${card.b} ${card.c} flex items-center justify-center mb-1.5 shadow-inner`}
              >
                <card.i size={14} />
              </div>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                {card.l}
              </p>
              <p className="text-xs md:text-sm font-black text-[#111111] font-mono mt-0.5">
                {formatMoney(card.v)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* History List Section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Switch Filter Row */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-2">
            <History size={18} className="text-gray-400" />
            <h3 className="font-extrabold text-sm md:text-base text-[#111111]">
              收入流水历史
            </h3>
          </div>

          {/* Month Selector for Incomes */}
          <div className="flex items-center gap-1.5 w-full md:w-auto select-none">
            <button
              type="button"
              onClick={onPrevMonth}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 active:scale-95 transition shadow-xs cursor-pointer"
              style={{ minWidth: "36px", minHeight: "36px" }}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 md:flex-none text-center bg-white border border-gray-200 px-3 py-2 rounded-lg font-black text-xs text-[#111111] shadow-xs min-w-[130px]">
              {getMonthLabel(incomeFilterMonth)}
            </div>
            <button
              type="button"
              onClick={onNextMonth}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 active:scale-95 transition shadow-xs cursor-pointer"
              style={{ minWidth: "36px", minHeight: "36px" }}
            >
              <ChevronRight size={16} />
            </button>
            <span className="text-[10px] font-black text-[#111111] bg-[#FFD200] px-2 py-1 rounded border border-[#FFD200]/25 whitespace-nowrap">
              {extraIncomeStats.records.length} 笔
            </span>
          </div>
        </div>

        {/* Current Month Subtotal Row */}
        {extraIncomeStats.records.length > 0 && (
          <div className="px-4 py-2 bg-green-50/50 border-b border-green-100 flex justify-between items-center">
            <span className="text-[10px] font-bold text-green-700">当月小计</span>
            <span className="font-mono font-black text-xs text-green-700">
              {formatMoney(extraIncomeStats.filteredTotal)}
            </span>
          </div>
        )}

        {/* List Content */}
        <div className="divide-y divide-gray-100">
          {extraIncomeStats.records.length === 0 ? (
            <div className="p-8">
              <TreasuryEmptyState
                title="当月暂无收入记录"
                description="请使用上方按钮“记录新收入”录入当前的代收或杂项收入流水。"
                emoji="📂"
              />
            </div>
          ) : (
            extraIncomeStats.records
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-gray-50/50 transition duration-150 group"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50 text-gray-500 shrink-0 border border-gray-100 shadow-inner mt-0.5">
                      <Recycle size={15} className="opacity-80" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-sm text-[#111111] break-words whitespace-normal leading-snug">
                        {t.note?.replace("[代收] ", "") || "Extra Income"}
                      </div>
                      <div className="text-[10px] text-gray-400 font-bold mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm">{t.date}</span>
                        <span>•</span>
                        <span className="uppercase text-gray-500 font-mono text-[9px]">
                          {t.toAccount}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 border-t border-gray-50 pt-2 md:pt-0 md:border-none">
                    <span className="font-mono font-black text-sm text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100/30">
                      +{formatMoney(t.amount)}
                    </span>
                    
                    {/* Action buttons */}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditIncome(t)}
                        className="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-xs cursor-pointer active:scale-90"
                        style={{ minWidth: "36px", minHeight: "36px" }}
                        title="编辑 (Edit)"
                      >
                        <Edit3 size={13} />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => onGenerateReceipt(t)}
                        disabled={isGeneratingPdf}
                        className="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-xs cursor-pointer active:scale-90 disabled:opacity-50"
                        style={{ minWidth: "36px", minHeight: "36px" }}
                        title="打印收据"
                      >
                        {isGeneratingPdf && printingRecord?.id === t.id ? (
                          <Loader2 size={13} className="animate-spin text-blue-600" />
                        ) : (
                          <Printer size={13} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteIncome(t.id)}
                        className="p-2 bg-white border border-gray-200 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-xs cursor-pointer active:scale-90"
                        style={{ minWidth: "36px", minHeight: "36px" }}
                        title="删除 (Delete)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};
