import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Settings,
  PiggyBank,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  MinusCircle,
  Gem,
} from "lucide-react";
import { FundTransfer } from "../treasuryTypes";
import { TreasuryButton } from "../components/TreasuryButton";

interface Shareholder {
  id: string;
  name: string;
  role?: string;
  investmentAmount: number;
  equityPercentage: number;
}

interface TreasuryEquityTabProps {
  shareholders: Shareholder[];
  totalCapital: number;
  transfers: FundTransfer[];
  dividendHistory: any[];
  expandedInjections: Record<string, boolean>;
  onToggleExpand: (name: string) => void;
  onAddShareholder: () => void;
  onEditShareholder: (sh: Shareholder) => void;
  onDeleteShareholder: (id: string) => void;
  onAddInjection: () => void;
  onAddRepayment: () => void;
  onAddDividend: () => void;
  onDeleteTransfer: (id: string) => void;
  formatMoney: (val: number) => string;
}

export const TreasuryEquityTab: React.FC<TreasuryEquityTabProps> = ({
  shareholders = [],
  totalCapital,
  transfers = [],
  dividendHistory = [],
  expandedInjections = {},
  onToggleExpand,
  onAddShareholder,
  onEditShareholder,
  onDeleteShareholder,
  onAddInjection,
  onAddRepayment,
  onAddDividend,
  onDeleteTransfer,
  formatMoney,
}) => {
  const [expandedDividends, setExpandedDividends] = useState<Record<string, boolean>>({});

  const toggleDividendExpand = (name: string) => {
    setExpandedDividends((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-200">
      
      {/* Shareholders List Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-150">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-extrabold text-sm md:text-base text-[#111111] flex items-center gap-2">
              <Users size={18} className="text-[#111111]" /> 股东与实收资本
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1 tracking-wider">
              Paid-up Capital: {formatMoney(totalCapital)}
            </p>
          </div>
          <TreasuryButton
            variant="primary"
            onClick={onAddShareholder}
            className="!h-10 px-4 text-xs font-bold"
          >
            <UserPlus size={14} /> 添加股东
          </TreasuryButton>
        </div>

        {/* Shareholders Grid */}
        {shareholders.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400 italic">
            暂无股东资料，请点击右上角按钮添加。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4">
            {shareholders.map((s) => {
              const shareholderTransfers = transfers.filter(
                (t) =>
                  (t.fromAccount === "SHAREHOLDER" && t.note?.includes(s.name)) ||
                  (t.toAccount === "SHAREHOLDER" && t.note?.includes(s.name))
              );
              const totalInject = shareholderTransfers
                .filter((t) => t.fromAccount === "SHAREHOLDER")
                .reduce((sum, t) => sum + t.amount, 0);
              const totalRepay = shareholderTransfers
                .filter((t) => t.toAccount === "SHAREHOLDER")
                .reduce((sum, t) => sum + t.amount, 0);
              const netInjection = totalInject - totalRepay;

              const shareholderDividends = dividendHistory.filter((t) => t.company === s.name);
              const totalDividend = shareholderDividends.reduce((sum, t) => sum + t.amount, 0);

              return (
                <div
                  key={s.id}
                  className="bg-gray-50 p-4 rounded-2xl border border-gray-150 flex flex-col justify-between hover:border-gray-300 transition-colors relative"
                >
                  <div className="w-full">
                    {/* Shareholder Metadata Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-extrabold text-sm text-[#111111]">
                          {s.name}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 block">
                          {s.role || "Investor"}
                        </span>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => onEditShareholder(s)}
                          className="p-1.5 bg-white border border-gray-150 rounded-lg text-gray-400 hover:text-[#111111] shadow-xs cursor-pointer"
                          title="编辑股东"
                        >
                          <Settings size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteShareholder(s.id)}
                          className="p-1.5 bg-white border border-gray-150 rounded-lg text-gray-400 hover:text-red-500 shadow-xs cursor-pointer"
                          title="删除股东"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Numeric breakdown cards */}
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <div className="bg-white p-2 rounded-xl border border-gray-150 text-center">
                        <div className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                          股本 (Capital)
                        </div>
                        <div className="text-[11px] font-mono font-black text-blue-600 leading-none">
                          {formatMoney(s.investmentAmount)}
                        </div>
                        <div className="text-[8px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded-full inline-block mt-1 font-black">
                          {s.equityPercentage}%
                        </div>
                      </div>
                      
                      <div className="bg-white p-2 rounded-xl border border-gray-150 text-center">
                        <div className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                          净垫资 (Net Inj.)
                        </div>
                        <div
                          className={`text-[11px] font-mono font-black leading-none ${
                            netInjection >= 0 ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {formatMoney(netInjection)}
                        </div>
                      </div>
                      
                      <div className="bg-white p-2 rounded-xl border border-gray-150 text-center">
                        <div className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                          已分红 (Dividends)
                        </div>
                        <div className="text-[11px] font-mono font-black text-red-500 leading-none">
                          {formatMoney(totalDividend)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shareholder Injections & Repayments List Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-150">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
          <div>
            <h3 className="font-extrabold text-sm md:text-base text-[#111111] flex items-center gap-2">
              <PiggyBank size={18} className="text-[#111111]" /> 股东注资与还款记录
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1 tracking-wider uppercase">
              Capital Injection & Repayments
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAddRepayment}
              className="flex-1 sm:flex-none bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition"
            >
              <ArrowDownLeft size={14} /> 还钱给股东
            </button>
            <button
              type="button"
              onClick={onAddInjection}
              className="flex-1 sm:flex-none bg-green-50 text-green-700 border border-green-100 px-3 py-2 rounded-xl text-xs font-bold hover:bg-green-100 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition"
            >
              <ArrowUpRight size={14} /> 股东注资
            </button>
          </div>
        </div>

        {/* Action list */}
        <div className="space-y-4">
          {(() => {
            const shareholderTransfers = transfers.filter(
              (t) =>
                t.fromAccount === ("SHAREHOLDER" as any) || t.toAccount === ("SHAREHOLDER" as any)
            );
            if (shareholderTransfers.length === 0) {
              return (
                <div className="text-center py-8 text-xs text-gray-400 italic">
                  暂无记录
                </div>
              );
            }

            // Group by shareholder name
            const grouped = shareholderTransfers.reduce((acc, t) => {
              let name = "Unknown";
              if (t.toAccount === ("SHAREHOLDER" as any)) {
                const match = t.note?.match(/\[还钱给股东\](.*?):/);
                name = match ? match[1].trim() : "Unknown";
              } else {
                const match = t.note?.match(/\[股东注资\](.*?):/);
                if (match) {
                  name = match[1].trim();
                } else {
                  name =
                    t.note
                      ?.replace(/\[股东注资\]|\[垫资\]/g, "")
                      .split(":")[0]
                      ?.trim() || "Unknown";
                }
              }
              if (!acc[name]) acc[name] = [];
              acc[name].push(t);
              return acc;
            }, {} as Record<string, typeof shareholderTransfers>);

            return Object.entries(grouped).map(([name, items]) => {
              const isExpanded = expandedInjections[name];
              const totalInject = items
                .filter((t) => t.fromAccount === ("SHAREHOLDER" as any))
                .reduce((sum, t) => sum + t.amount, 0);
              const totalRepay = items
                .filter((t) => t.toAccount === ("SHAREHOLDER" as any))
                .reduce((sum, t) => sum + t.amount, 0);
              const netTotal = totalInject - totalRepay;

              return (
                <div
                  key={name}
                  className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-xs transition-all duration-200"
                >
                  {/* Collapsible header row */}
                  <div
                    onClick={() => onToggleExpand(name)}
                    className="cursor-pointer bg-gray-50/50 p-3 flex justify-between items-center border-b border-gray-200 hover:bg-gray-100/50 transition-colors select-none"
                  >
                    <div className="font-extrabold text-xs text-[#111111] flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">
                        {name ? name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <div>
                        <div>{name}</div>
                        <div className="text-[9px] text-gray-400 font-medium mt-0.5">
                          净垫资:{" "}
                          <span className={netTotal >= 0 ? "text-green-600" : "text-red-500"}>
                            {formatMoney(netTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[9px] text-gray-400 font-bold">
                          总注资: <span className="text-green-600">+{formatMoney(totalInject)}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 font-bold">
                          已还款: <span className="text-indigo-500">-{formatMoney(totalRepay)}</span>
                        </div>
                      </div>
                      <div className="text-gray-400 bg-white p-1 rounded-full shadow-xs border border-gray-150">
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </div>
                    </div>
                  </div>

                  {/* Sublist mapping */}
                  {isExpanded && (
                    <div className="p-1.5 space-y-1 bg-white animate-in slide-in-from-top-2 duration-150">
                      {items
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((t) => {
                          const isRepay = t.toAccount === ("SHAREHOLDER" as any);
                          return (
                            <div
                              key={t.id}
                              className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-xl transition border border-transparent hover:border-gray-100"
                            >
                              <div>
                                <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                  {isRepay ? (
                                    <ArrowDownLeft size={12} className="text-indigo-500" />
                                  ) : (
                                    <ArrowUpRight size={12} className="text-green-500" />
                                  )}
                                  {t.note?.split(":").slice(1).join(":").trim() ||
                                    (isRepay ? "Repayment" : "Injection")}
                                </div>
                                <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                  {t.date} • {isRepay ? `From ${t.fromAccount}` : `Into ${t.toAccount}`}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3 shrink-0">
                                <span
                                  className={`font-mono font-bold text-xs ${
                                    isRepay ? "text-indigo-600" : "text-green-600"
                                  }`}
                                >
                                  {isRepay ? "-" : "+"}
                                  {formatMoney(t.amount)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onDeleteTransfer(t.id)}
                                  className="text-gray-300 hover:text-red-500 transition p-2 hover:bg-red-50 rounded-lg cursor-pointer"
                                  style={{ minWidth: "36px", minHeight: "36px" }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Dividend Payouts List Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-150">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-extrabold text-sm md:text-base text-[#111111] flex items-center gap-2">
              <Gem size={18} className="text-[#111111]" /> 股东分红 / 提款
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1 tracking-wider uppercase">
              Dividend Payouts (Wages)
            </p>
          </div>
          <button
            type="button"
            onClick={onAddDividend}
            className="bg-red-50 text-red-700 border border-red-100 px-3 md:px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 transition"
          >
            <MinusCircle size={14} /> 分发分红
          </button>
        </div>
        <div className="space-y-4">
          {(() => {
            if (dividendHistory.length === 0) {
              return (
                <div className="text-center py-6 text-gray-400 text-xs italic">
                  暂无分红记录
                </div>
              );
            }

            const grouped = dividendHistory.reduce(
              (acc, t) => {
                const name = t.company || "Unknown";
                if (!acc[name]) acc[name] = [];
                acc[name].push(t);
                return acc;
              },
              {} as Record<string, any[]>
            );

            return Object.entries(grouped).map(([name, items]) => {
              const isExpanded = expandedDividends[name];
              const totalDividend = (items as any[]).reduce((sum, t) => sum + t.amount, 0);

              return (
                <div
                  key={name}
                  className="border border-red-100 rounded-2xl overflow-hidden bg-white shadow-xs transition-all duration-200"
                >
                  <div
                    onClick={() => toggleDividendExpand(name)}
                    className="cursor-pointer bg-red-50/50 p-3.5 flex justify-between items-center border-b border-red-50 hover:bg-red-50 transition-colors select-none"
                  >
                    <div className="font-black text-xs text-gray-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                        {name ? name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <div>
                        <div>{name}</div>
                        <div className="text-[10px] text-gray-500 font-normal">
                          累计分红:{" "}
                          <span className="text-red-500 font-bold">
                            {formatMoney(totalDividend)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 font-bold">
                          已付:{" "}
                          <span className="text-red-500 font-bold">
                            {formatMoney(totalDividend)}
                          </span>
                        </div>
                      </div>
                      <div className="text-gray-400 bg-white p-1 rounded-full shadow-xs border border-gray-150">
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="p-2 space-y-1 bg-white animate-in slide-in-from-top-2 duration-150">
                      {(items as any[])
                        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                        .map((t) => {
                          return (
                            <div
                              key={t.id}
                              className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100"
                            >
                              <div>
                                <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                  <ArrowDownLeft size={12} className="text-red-500" />
                                  {t.note || "Dividend"}
                                </div>
                                <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                  {t.time.split("T")[0]} • Via {t.paymentMethod}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-xs text-red-600">
                                  -{formatMoney(t.amount)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
};
