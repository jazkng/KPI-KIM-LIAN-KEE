import {
  TreasuryConfig,
  FundTransfer,
  SettlementRecord,
  ExpenseItem,
  BillPaymentRecord,
  Shareholder,
} from "../../../types";

export type TreasuryTab = "OVERVIEW" | "TRANSFERS" | "EXTRA_INCOME" | "EQUITY" | "SETTINGS";

export type TreasuryAccount = "CASH" | "BANK";

export interface LedgerItem {
  id: string;
  date: string;
  desc: string;
  amount: number;
  type: "IN" | "OUT";
  category: string;
  tag?: string;
  balance?: number;
  sortTime?: number;
  linkUrl?: string;
  account?: TreasuryAccount;
}

export interface MonthlyClosing {
  id: string; // YYYY-MM
  month: string; // YYYY-MM
  cashStart: number;
  cashIn: number;
  cashOut: number;
  cashEnd: number;
  bankStart: number;
  bankIn: number;
  bankOut: number;
  bankEnd: number;
  // 👑 实点对账 (Physical Count) — 月结以实物盘点为准，避免误差累积
  cashEndActual?: number; // 月尾实际数出来的现金
  bankEndActual?: number; // 月尾银行月结单余额
  cashVariance?: number; // 实点 - 系统计算 (现金)
  bankVariance?: number; // 实点 - 系统计算 (银行)
  varianceNote?: string; // 差异说明
  status: "CLOSED" | "DRAFT";
  closedAt?: string;
  closedBy?: string;
}

export type {
  TreasuryConfig,
  FundTransfer,
  SettlementRecord,
  ExpenseItem,
  BillPaymentRecord,
  Shareholder,
};
