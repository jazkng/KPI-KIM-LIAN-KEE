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
