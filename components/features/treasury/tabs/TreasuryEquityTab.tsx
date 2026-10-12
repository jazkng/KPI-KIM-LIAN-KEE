import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Pencil,
  PiggyBank,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  MinusCircle,
  Gem,
} from "lucide-react";
import { FundTransfer } from "../treasuryTypes";
import { TreasuryCard } from "../components/TreasuryCard";
import { TreasurySectionHeader } from "../components/TreasurySectionHeader";

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

/** 姓名首字圆形头像 */
const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#111111] text-xs font-bold text-[#FFD200]">
    {name ? name.charAt(0).toUpperCase() : "?"}
  </span>
);

/** 卡片右上角的小工具按钮，尺寸满足触控 */
const IconButton: React.FC<{
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, label, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white transition-colors active:scale-95 ${
      danger
        ? "text-stone-400 hover:bg-[#8B0000] hover:text-white"
        : "text-stone-500 hover:bg-[#F6F7FB] hover:text-[#111111]"
    }`}
  >
    {children}
  </button>
);

/** 三栏数字统计格 */
const StatCell: React.FC<{
  label: string;
  value: string;
  tone?: "ink" | "up" | "down";
  badge?: string;
}> = ({ label, value, tone = "ink", badge }) => (
  <div className="min-w-0 px-2 py-2.5 text-center">
    <p className="text-[10px] font-bold text-stone-500">{label}</p>
    <p
      className={`mt-1 truncate font-mono text-[11px] font-bold tabular-nums ${
        tone === "up"
          ? "text-emerald-600"
          : tone === "down"
            ? "text-rose-600"
            : "text-[#111111]"
      }`}
    >
      {value}
    </p>
    {badge && (
      <span className="mt-1 inline-block rounded bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-stone-500">
        {badge}
      </span>
    )}
  </div>
);

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
  const [expandedDividends, setExpandedDividends] = useState<
    Record<string, boolean>
  >({});

  const toggleDividendExpand = (name: string) => {
    setExpandedDividends((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-5">
      {/* ── 股东与实收资本 ───────────────── */}
      <TreasuryCard>
        <TreasurySectionHeader
          title="股东与实收资本"
          subtitle="Shareholders"
          icon={Users}
          action={
            <button
              type="button"
              onClick={onAddShareholder}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-[#FFD200] px-3.5 text-xs font-bold text-[#111111] transition-colors hover:bg-[#E5C100] active:scale-95"
            >
              <UserPlus size={14} strokeWidth={2.5} /> 添加股东
            </button>
          }
        />

        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] px-3 py-2.5">
          <span className="text-[11px] font-bold text-stone-500">实收资本</span>
          <span className="font-mono text-sm font-bold tabular-nums text-[#111111]">
            {formatMoney(totalCapital)}
          </span>
        </div>

        {shareholders.length === 0 ? (
          <p className="py-8 text-center text-xs text-stone-400">
            暂无股东资料，请点击上方按钮添加。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {shareholders.map((s) => {
              const shareholderTransfers = transfers.filter(
                (t) =>
                  (t.fromAccount === "SHAREHOLDER" && t.note?.includes(s.name)) ||
                  (t.toAccount === "SHAREHOLDER" && t.note?.includes(s.name)),
              );
              const totalInject = shareholderTransfers
                .filter((t) => t.fromAccount === "SHAREHOLDER")
                .reduce((sum, t) => sum + t.amount, 0);
              const totalRepay = shareholderTransfers
                .filter((t) => t.toAccount === "SHAREHOLDER")
                .reduce((sum, t) => sum + t.amount, 0);
              const netInjection = totalInject - totalRepay;

              const shareholderDividends = dividendHistory.filter(
                (t) => t.company === s.name,
              );
              const totalDividend = shareholderDividends.reduce(
                (sum, t) => sum + t.amount,
                0,
              );

              return (
                <div
                  key={s.id}
                  className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={s.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight text-[#111111]">
                          {s.name}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400">
                          {s.role || "Investor"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1.5">
                      <IconButton
                        onClick={() => onEditShareholder(s)}
                        label="编辑股东"
                      >
                        <Pencil size={14} strokeWidth={2.5} />
                      </IconButton>
                      <IconButton
                        onClick={() => onDeleteShareholder(s.id)}
                        label="删除股东"
                        danger
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-[#E5E7EB] bg-[#F6F7FB]">
                    <StatCell
                      label="股本"
                      value={formatMoney(s.investmentAmount)}
                      badge={`${s.equityPercentage}%`}
                    />
                    <StatCell
                      label="净垫资"
                      value={formatMoney(netInjection)}
                      tone={netInjection >= 0 ? "up" : "down"}
                    />
                    <StatCell
                      label="已分红"
                      value={formatMoney(totalDividend)}
                      tone="down"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TreasuryCard>

      {/* ── 注资与还款 ───────────────────── */}
      <TreasuryCard>
        <TreasurySectionHeader
          title="股东注资与还款"
          subtitle="Injection & Repayment"
          icon={PiggyBank}
        />

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAddInjection}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-95"
          >
            <ArrowUpRight size={15} strokeWidth={2.5} className="text-emerald-600" />
            股东注资
          </button>
          <button
            type="button"
            onClick={onAddRepayment}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-95"
          >
            <ArrowDownLeft size={15} strokeWidth={2.5} className="text-rose-600" />
            还钱给股东
          </button>
        </div>

        <div className="space-y-2">
          {(() => {
            const shareholderTransfers = transfers.filter(
              (t) =>
                t.fromAccount === ("SHAREHOLDER" as any) ||
                t.toAccount === ("SHAREHOLDER" as any),
            );
            if (shareholderTransfers.length === 0) {
              return (
                <p className="py-8 text-center text-xs text-stone-400">暂无记录</p>
              );
            }

            const grouped = shareholderTransfers.reduce(
              (acc, t) => {
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
              },
              {} as Record<string, typeof shareholderTransfers>,
            );

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
                  className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
                >
                  <button
                    type="button"
                    onClick={() => onToggleExpand(name)}
                    aria-expanded={!!isExpanded}
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#F6F7FB] active:bg-stone-100"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight text-[#111111]">
                          {name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-stone-400">
                          净垫资{" "}
                          <span
                            className={
                              netTotal >= 0 ? "text-emerald-600" : "text-rose-600"
                            }
                          >
                            {formatMoney(netTotal)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <div className="text-right font-mono text-[10px] tabular-nums">
                        <p className="text-emerald-600">
                          +{formatMoney(totalInject)}
                        </p>
                        <p className="text-rose-600">-{formatMoney(totalRepay)}</p>
                      </div>
                      <ChevronDown
                        size={16}
                        strokeWidth={2.5}
                        className={`text-stone-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="space-y-1 border-t border-[#E5E7EB] bg-[#F6F7FB] p-2">
                      {items
                        .sort(
                          (a, b) =>
                            new Date(b.date).getTime() - new Date(a.date).getTime(),
                        )
                        .map((t) => {
                          const isRepay = t.toAccount === ("SHAREHOLDER" as any);
                          return (
                            <div
                              key={t.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {isRepay ? (
                                    <ArrowDownLeft
                                      size={12}
                                      strokeWidth={2.5}
                                      className="shrink-0 text-rose-500"
                                    />
                                  ) : (
                                    <ArrowUpRight
                                      size={12}
                                      strokeWidth={2.5}
                                      className="shrink-0 text-emerald-500"
                                    />
                                  )}
                                  <span className="truncate text-xs font-bold text-[#111111]">
                                    {t.note?.split(":").slice(1).join(":").trim() ||
                                      (isRepay ? "还款" : "注资")}
                                  </span>
                                </div>
                                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-stone-400">
                                  {t.date} ·{" "}
                                  {isRepay ? t.fromAccount : t.toAccount}
                                </p>
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <span
                                  className={`font-mono text-xs font-bold tabular-nums ${
                                    isRepay ? "text-rose-600" : "text-emerald-600"
                                  }`}
                                >
                                  {isRepay ? "-" : "+"}
                                  {formatMoney(t.amount)}
                                </span>
                                <IconButton
                                  onClick={() => onDeleteTransfer(t.id)}
                                  label="删除记录"
                                  danger
                                >
                                  <Trash2 size={13} strokeWidth={2.5} />
                                </IconButton>
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
      </TreasuryCard>

      {/* ── 股东分红 ─────────────────────── */}
      <TreasuryCard>
        <TreasurySectionHeader
          title="股东分红"
          subtitle="Dividend Payouts"
          icon={Gem}
          action={
            <button
              type="button"
              onClick={onAddDividend}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-bold text-[#111111] transition-colors hover:bg-[#F6F7FB] active:scale-95"
            >
              <MinusCircle size={14} strokeWidth={2.5} className="text-rose-600" />
              分发分红
            </button>
          }
        />

        <div className="space-y-2">
          {(() => {
            if (dividendHistory.length === 0) {
              return (
                <p className="py-8 text-center text-xs text-stone-400">
                  暂无分红记录
                </p>
              );
            }

            const grouped = dividendHistory.reduce(
              (acc, t) => {
                const name = t.company || "Unknown";
                if (!acc[name]) acc[name] = [];
                acc[name].push(t);
                return acc;
              },
              {} as Record<string, any[]>,
            );

            return Object.entries(grouped).map(([name, items]) => {
              const isExpanded = expandedDividends[name];
              const totalDividend = (items as any[]).reduce(
                (sum, t) => sum + t.amount,
                0,
              );

              return (
                <div
                  key={name}
                  className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
                >
                  <button
                    type="button"
                    onClick={() => toggleDividendExpand(name)}
                    aria-expanded={!!isExpanded}
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#F6F7FB] active:bg-stone-100"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight text-[#111111]">
                          {name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-stone-400">
                          {(items as any[]).length} 笔
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-stone-500">
                          累计分红
                        </p>
                        <p className="font-mono text-xs font-bold tabular-nums text-rose-600">
                          {formatMoney(totalDividend)}
                        </p>
                      </div>
                      <ChevronDown
                        size={16}
                        strokeWidth={2.5}
                        className={`text-stone-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="space-y-1 border-t border-[#E5E7EB] bg-[#F6F7FB] p-2">
                      {(items as any[])
                        .sort(
                          (a, b) =>
                            new Date(b.time).getTime() - new Date(a.time).getTime(),
                        )
                        .map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-[#111111]">
                                {t.note || "分红"}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-stone-400">
                                {t.time.split("T")[0]} · {t.paymentMethod}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-rose-600">
                              -{formatMoney(t.amount)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </TreasuryCard>
    </div>
  );
};
