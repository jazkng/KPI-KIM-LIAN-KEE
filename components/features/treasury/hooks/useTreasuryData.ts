import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import { DataManager } from "../../../../utils/dataManager";
import { guardWrite } from "../../../../utils/readOnlyMode";
import {
  TreasuryConfig,
  FundTransfer,
  SettlementRecord,
  ExpenseItem,
  BillPaymentRecord,
  LedgerItem,
  MonthlyClosing,
} from "../treasuryTypes";
import { formatMoney, getMonthLabel } from "../treasuryUtils";

/**
 * 资金管理 — 数据层
 *
 * ⚠️ 本 Hook 只是把原本写在 TreasuryModule.tsx 里的资料读取与余额计算逻辑
 *    原封不动搬出来，任何计算规则、Firestore 查询范围、去重规则皆未更动。
 */
// 👑 会话级快取 / Session-level cache
//    资金表每次挂载都全表扫描四个 collection，是 Firestore 读取量主因。
//    同一个浏览器分页内共用一份快照，切换模组再回来不重打 Firestore。
const TREASURY_CACHE_KEY = "klk_treasury_full_v1";
const TREASURY_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

const readTreasuryCache = (): any | null => {
  try {
    const raw = sessionStorage.getItem(TREASURY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > TREASURY_CACHE_TTL) return null;
    return parsed.payload;
  } catch {
    return null;
  }
};

const writeTreasuryCache = (payload: any) => {
  try {
    sessionStorage.setItem(
      TREASURY_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), payload }),
    );
  } catch {
    // 👑 配额满或隐私模式 → 静默略过，功能不受影响
  }
};

export const clearTreasuryCache = () => {
  try {
    sessionStorage.removeItem(TREASURY_CACHE_KEY);
  } catch {
    /* noop */
  }
};

export const useTreasuryData = () => {
  const [config, setConfig] = useState<TreasuryConfig>({
    initialDate: new Date().toISOString().split("T")[0],
    initialCash: 0,
    initialBank: 0,
    shareholders: [],
  });
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [billPayments, setBillPayments] = useState<BillPaymentRecord[]>([]);
  // 👑 standalone_expenses 的原始资料（未与结算/账单合并前），供快取重用
  const [rawStandaloneExpenses, setRawStandaloneExpenses] = useState<
    ExpenseItem[]
  >([]);
  const [, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  const [monthlyClosings, setMonthlyClosings] = useState<MonthlyClosing[]>([]);
  const [selectedMonthLedgerItems, setSelectedMonthLedgerItems] = useState<
    LedgerItem[]
  >([]);
  const [isSelectedMonthLoading, setIsSelectedMonthLoading] = useState(false);

  // 🟢 核心功能：通用按月精准拉取历史账目明细 (绝对防计费爆炸 + 极速运行)
  // 👑 传入 rangeOverride 可改为任意日期区间 (对账导出用)
  const fetchMonthlyLedger = useCallback(
    async (
      monthStr: string,
      rangeOverride?: { start: string; end: string },
    ): Promise<LedgerItem[]> => {
      let startStr: string;
      let endStr: string;
      if (rangeOverride) {
        startStr = rangeOverride.start;
        endStr = `${rangeOverride.end}T23:59:59`;
      } else {
        startStr = `${monthStr}-01`;
        const [year, month] = monthStr.split("-");
        const endDay = new Date(Number(year), Number(month), 0).getDate();
        endStr = `${monthStr}-${endDay}T23:59:59`;
      }

      // 🔴 修正：支出可能跨月付款 (账期最长 2-3 个月)。
      // Firestore 无法对缺少 paymentDate 的旧记录做范围查询，
      // 因此改为用 time 往前多抓 6 个月，再于前端用 paymentDate 精确过滤。
      // 付款日一定 >= 账单日，所以只需往前回溯，不必往后。
      const EXPENSE_LOOKBACK_MONTHS = 6;
      const expStartDate = new Date(`${startStr.slice(0, 10)}T00:00:00`);
      expStartDate.setMonth(expStartDate.getMonth() - EXPENSE_LOOKBACK_MONTHS);
      const expQueryStartStr = expStartDate.toISOString().slice(0, 10);

      const [stlSnap, trfSnap, billsSnap, expSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "settlements"),
            where("date", ">=", startStr),
            where("date", "<=", endStr),
          ),
        ),
        getDocs(
          query(
            collection(db, "fund_transfers"),
            where("date", ">=", startStr),
            where("date", "<=", endStr),
          ),
        ),
        getDocs(
          query(
            collection(db, "bill_payments"),
            where("date", ">=", startStr),
            where("date", "<=", endStr),
          ),
        ),
        getDocs(
          query(
            collection(db, "standalone_expenses"),
            where("time", ">=", expQueryStartStr),
            where("time", "<=", endStr),
          ),
        ),
      ]);

      const items: LedgerItem[] = [];

      stlSnap.docs.forEach((d) => {
        const s = d.data() as SettlementRecord;
        const sCash = Number(s.sales?.cash || 0);

        const bankIncome =
          Number(s.sales?.tng || 0) +
          Number(s.sales?.duitnow || 0) +
          Number(s.sales?.card || 0) +
          Number(s.sales?.amex || 0);
        const bd = s.sales?.deliveryBreakdown || ({} as any);
        const grabExpected =
          (Number(bd.grabNet) || Number(bd.grab) || 0) -
          (Number(bd.grabAds) || 0);
        const deliveryIncome =
          Math.max(0, grabExpected) +
          (Number(bd.pandaGross) || Number(bd.panda) || 0) +
          (Number(bd.shopeeGross) || Number(bd.shopee) || 0) +
          (Number(bd.lalamove) || 0);
        const sBank = bankIncome + deliveryIncome;

        if (sCash > 0) {
          items.push({
            id: `h_c_${s.id}`,
            date: s.date,
            desc: `Cash Sales (现金营业额)`,
            amount: sCash,
            type: "IN",
            category: "SALES",
            account: "CASH",
          });
        }
        if (sBank > 0) {
          items.push({
            id: `h_b_${s.id}`,
            date: s.date,
            desc: `Digital & Delivery Sales (电子/外卖营收)`,
            amount: sBank,
            type: "IN",
            category: "SALES",
            account: "BANK",
          });
        }

        if (s.expenses) {
          s.expenses.forEach((e, idx) => {
            const amt = Number(e.amount) || 0;
            if (amt > 0) {
              const isPaid =
                e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL";
              if (!isPaid) return;

              // 🔴 修正：paidBy 优先。SHOP_CASH = 店面现金垫付，
              // 不可因为 paymentMethod 写成 BANK_TRANSFER/DUITNOW 就误判为银行支出。
              const isCompanyPaid =
                e.paidBy === "SHOP_CASH"
                  ? false
                  : e.paidBy === "COMPANY" ||
                    (!!e.paymentMethod &&
                      !e.paymentMethod.toUpperCase().includes("CASH"));

              if (isCompanyPaid) {
                items.push({
                  id: `h_e_${e.id}`,
                  date: s.date,
                  desc: `[支出] ${e.company} ${e.note ? "- " + e.note : ""}`,
                  amount: amt,
                  type: "OUT",
                  category: e.category,
                  account: "BANK",
                });
              } else {
                items.push({
                  // 🔴 修正：有 e.id 就沿用 h_e_ 前缀，确保与 standalone_expenses
                  // 同步过来的同一笔能被 uniqueMap 去重，避免现金支出算两次。
                  id: e.id ? `h_e_${e.id}` : `h_petty_${s.id}_${idx}`,
                  date: s.date,
                  desc: `[店面垫付] ${e.company} ${e.note ? "- " + e.note : ""}`,
                  amount: amt,
                  type: "OUT",
                  category: e.category || "PETTY_CASH",
                  account: "CASH",
                });
              }
            }
          });
        }

        if (s.variance !== undefined && s.variance !== 0) {
          items.push({
            id: `h_var_${s.id}`,
            date: s.date,
            desc: `[现金误差] ${s.varianceReason || ""}`,
            amount: Math.abs(s.variance),
            type: s.variance > 0 ? "IN" : "OUT",
            category: "ADJUSTMENT",
            account: "CASH",
          });
        } else if (s.variance === undefined && s.closingCash === undefined) {
          const refundAmt = Number(s.sales?.refundTotal || 0);
          if (refundAmt > 0) {
            items.push({
              id: `h_ref_${s.id}`,
              date: s.date,
              desc: `[销售退款]`,
              amount: refundAmt,
              type: "OUT",
              category: "REFUND",
              account: "CASH",
            });
          }
        }
      });

      trfSnap.docs.forEach((d) => {
        const t = d.data() as FundTransfer;
        if (
          t.fromAccount === ("SHAREHOLDER" as any) ||
          t.fromAccount === ("OTHER" as any)
        ) {
          const recAccount = t.toAccount === "CASH" ? "CASH" : "BANK";
          const label =
            t.fromAccount === ("SHAREHOLDER" as any)
              ? "股东向店铺注资"
              : "店铺额外收益";
          items.push({
            id: `h_t_${t.id}`,
            date: t.date.split("T")[0],
            desc: t.note ? `${label} (${t.note})` : label,
            amount: t.amount,
            type: "IN",
            category: "TRANSFER",
            account: recAccount,
          });
        } else {
          if (t.fromAccount === "CASH" || t.fromAccount === "BANK") {
            items.push({
              id: `h_t_out_${t.id}`,
              date: t.date.split("T")[0],
              desc: `[转账流出] ${t.note ? `(${t.note})` : ""}`,
              amount: t.amount,
              type: "OUT",
              category: "TRANSFER",
              account: t.fromAccount,
            });
          }
          if (t.toAccount === "CASH" || t.toAccount === "BANK") {
            items.push({
              id: `h_t_in_${t.id}`,
              date: t.date.split("T")[0],
              desc: `[转账存入] ${t.note ? `(${t.note})` : ""}`,
              amount: t.amount,
              type: "IN",
              category: "TRANSFER",
              account: t.toAccount,
            });
          }
        }
      });

      billsSnap.docs.forEach((d) => {
        const b = d.data() as BillPaymentRecord;
        const isCashBill = b.method === "CASH";
        items.push({
          id: `h_b_${b.id}`,
          date: b.date.split("T")[0],
          desc: `[账单] ${b.name}`,
          amount: Number(b.amount),
          type: "OUT",
          category: b.category,
          account: isCashBill ? "CASH" : "BANK",
        });
      });

      expSnap.docs.forEach((d) => {
        const e = d.data() as ExpenseItem;
        if (e.id.startsWith("bill_sync_") || e.expenseType === "RECURRING")
          return;

        if (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL") {
          // 🔴 修正：资金流水必须用「实际付款日期」而非账单日期。
          // 供应商有账期 (例: 6/15 的账 7/3 才付款)，用 e.time 会把钱算错月份。
          const dDate = (e.paymentDate || e.time)?.split("T")[0] || "";
          // 🔴 因查询已往前回溯 6 个月，此处必须按付款日期过滤掉不属于本期的记录
          if (dDate < startStr.slice(0, 10) || dDate > endStr.slice(0, 10))
            return;
          // 🔴 修正：paidBy 优先，SHOP_CASH 一律算现金支出
          const isCashExp =
            e.paidBy === "SHOP_CASH" ||
            (e.paymentMethod || "BANK_TRANSFER").toUpperCase().includes("CASH");
          items.push({
            id: `h_e_${e.id}`,
            date: dDate,
            desc: `[支出] ${e.company} ${e.note ? "- " + e.note : ""}`,
            amount: Number(e.amount),
            type: "OUT",
            category: e.category,
            account: isCashExp ? "CASH" : "BANK",
          });
        }
      });

      const uniqueMap = new Map<string, LedgerItem>();
      items.forEach((itm) => {
        const existing = uniqueMap.get(itm.id);
        if (!existing) {
          uniqueMap.set(itm.id, itm);
        } else if (
          itm.category !== "PETTY_CASH" &&
          existing.category === "PETTY_CASH"
        ) {
          uniqueMap.set(itm.id, itm);
        }
      });
      const dedupedItems = Array.from(uniqueMap.values());
      dedupedItems.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      return dedupedItems;
    },
    [],
  );

  // 🟢 核心功能：拉取当前选定月份的实时流水账目
  const loadSelectedMonthLedger = async (monthStr: string) => {
    setIsSelectedMonthLoading(true);
    try {
      const ledger = await fetchMonthlyLedger(monthStr);
      setSelectedMonthLedgerItems(ledger);
    } catch (e) {
      console.error("Error loading selected month ledger", e);
    } finally {
      setIsSelectedMonthLoading(false);
    }
  };

  const loadExpenses = async (
    fullSettlements: SettlementRecord[] = settlements,
    currentBills: BillPaymentRecord[] = billPayments,
    rawExpenses?: ExpenseItem[],
  ) => {
    try {
      const allExp: ExpenseItem[] = [];

      // 👑 原本每次都全表扫描 standalone_expenses。
      //    现在优先用 loadData 已取回 / 快取中的资料，两者皆无才回退查询。
      let source: ExpenseItem[] = rawExpenses ?? rawStandaloneExpenses;
      if (!source || source.length === 0) {
        const cached = readTreasuryCache();
        if (cached?.rawExp?.length) {
          source = cached.rawExp as ExpenseItem[];
        } else {
          const snap = await getDocs(collection(db, "standalone_expenses"));
          source = snap.docs.map((d) => d.data() as ExpenseItem);
        }
        setRawStandaloneExpenses(source);
      }
      allExp.push(...source);

      // Extract nested expenses from daily settlements
      fullSettlements.forEach((s) => {
        if (s.expenses) {
          s.expenses.forEach((e) => {
            allExp.push({ ...e, settlementId: s.id });
          });
        }
      });

      // Merge and dedup by id (giving preference to PAID/PARTIAL or most updated entries)
      const uniqueMap = new Map<string, ExpenseItem>();
      allExp.forEach((item) => {
        const existing = uniqueMap.get(item.id);
        if (
          !existing ||
          item.paymentStatus === "PAID" ||
          item.paymentStatus === "PARTIAL"
        ) {
          uniqueMap.set(item.id, item);
        }
      });
      const uniqueExp = Array.from(uniqueMap.values());

      const billExpenses: ExpenseItem[] = currentBills.map((b) => ({
        id: b.id,
        category: b.category,
        expenseType: "RECURRING",
        company: b.name,
        amount: Number(b.amount) || 0,
        note: b.referenceNo ? `[Bill] ${b.referenceNo}` : "[Bill Payment]",
        time: `${b.date}T12:00:00`,
        paymentMethod: b.method,
        paymentStatus: "PAID",
      }));

      const combined = [...uniqueExp, ...billExpenses];
      combined.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      );
      setExpenses(combined);
    } catch (e) {
      console.error("Expense load error", e);
    }
  };

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const cfg = await DataManager.getTreasuryConfig();
      if (cfg) setConfig(cfg);

      // 👑 先看会话快取；命中就完全不碰 Firestore。
      if (!forceRefresh) {
        const cached = readTreasuryCache();
        if (cached) {
          const cStl = (cached.stl || []) as SettlementRecord[];
          const cTrf = (cached.trf || []) as FundTransfer[];
          const cBills = (cached.bills || []) as BillPaymentRecord[];
          const cRaw = (cached.rawExp || []) as ExpenseItem[];
          setSettlements(cStl);
          setTransfers(cTrf);
          setBillPayments(cBills);
          setRawStandaloneExpenses(cRaw);
          await loadExpenses(cStl, cBills, cRaw);
          setLoading(false);
          return;
        }
      }

      const startDateStr = cfg ? cfg.initialDate : "2020-01-01";

      // 👑 standalone_expenses 并入同一批 Promise.all，
      //    省掉 loadExpenses 原本那趟独立的全表扫描。
      const [stlSnap, trfSnap, billsSnap, expSnap] = await Promise.all([
        getDocs(
          query(collection(db, "settlements"), where("date", ">=", startDateStr)),
        ),
        getDocs(collection(db, "fund_transfers")),
        getDocs(collection(db, "bill_payments")),
        getDocs(collection(db, "standalone_expenses")),
      ]);

      const stl = stlSnap.docs.map((d) => d.data() as SettlementRecord);
      const trf = trfSnap.docs
        .map((d) => d.data() as FundTransfer)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const bills = billsSnap.docs.map((d) => d.data() as BillPaymentRecord);
      const rawExp = expSnap.docs.map((d) => d.data() as ExpenseItem);

      setSettlements(stl);
      setTransfers(trf);
      setBillPayments(bills);
      setRawStandaloneExpenses(rawExp);
      writeTreasuryCache({ stl, trf, bills, rawExp });
      await loadExpenses(stl, bills, rawExp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadClosings = async () => {
    try {
      const snap = await getDocs(collection(db, "treasury_monthly_closings"));
      const closings = snap.docs.map((d) => d.data() as MonthlyClosing);
      setMonthlyClosings(closings);
    } catch (e) {
      console.error("Failed to load monthly closings", e);
    }
  };

  const handleMonthShift = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    let year = y;
    let month = m + delta;
    if (month < 1) {
      month = 12;
      year--;
    } else if (month > 12) {
      month = 1;
      year++;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, "0")}`);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadClosings();
  }, []);

  useEffect(() => {
    loadSelectedMonthLedger(selectedMonth);
  }, [selectedMonth]);

  const selectedMonthClosing = useMemo(() => {
    return monthlyClosings.find(
      (c) => c.month === selectedMonth && c.status === "CLOSED",
    );
  }, [monthlyClosings, selectedMonth]);

  const realtimeMonthlySummary = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let bankIn = 0;
    let bankOut = 0;

    selectedMonthLedgerItems.forEach((itm) => {
      if (itm.account === "CASH") {
        if (itm.type === "IN") cashIn += itm.amount;
        else cashOut += itm.amount;
      } else if (itm.account === "BANK") {
        if (itm.type === "IN") bankIn += itm.amount;
        else bankOut += itm.amount;
      }
    });

    return { cashIn, cashOut, bankIn, bankOut };
  }, [selectedMonthLedgerItems]);

  const activeBalances = useMemo(() => {
    // Find all closed months before selectedMonth, sorted descending
    const closedBefore = monthlyClosings
      .filter((c) => c.month < selectedMonth && c.status === "CLOSED")
      .sort((a, b) => b.month.localeCompare(a.month));

    let cashStart = Number(config.initialCash) || 0;
    let bankStart = Number(config.initialBank) || 0;
    let startMonthLabel = `Checkpoint (期初) ${config.initialDate}`;
    let gapStartStr = config.initialDate || "2020-01-01";

    if (closedBefore.length > 0) {
      const lastClosed = closedBefore[0];
      // 👑 期初以「实点金额」为准；旧记录没有实点值时才退回系统计算值
      cashStart =
        lastClosed.cashEndActual !== undefined
          ? lastClosed.cashEndActual
          : lastClosed.cashEnd;
      bankStart =
        lastClosed.bankEndActual !== undefined
          ? lastClosed.bankEndActual
          : lastClosed.bankEnd;
      startMonthLabel = `延续自上一个结算月 【${lastClosed.month}】`;

      const [lcY, lcM] = lastClosed.month.split("-");
      let nextM = Number(lcM) + 1;
      let nextY = Number(lcY);
      if (nextM > 12) {
        nextM = 1;
        nextY++;
      }
      gapStartStr = `${nextY}-${nextM.toString().padStart(2, "0")}-01`;
    }

    const gapEndStr = `${selectedMonth}-00`; // Before the 1st of selectedMonth

    if (gapStartStr < gapEndStr) {
      let gapCIn = 0,
        gapCOut = 0,
        gapBIn = 0,
        gapBOut = 0;

      settlements.forEach((s) => {
        if (s.date >= gapStartStr && s.date <= gapEndStr) {
          const sCash = Number(s.sales?.cash || 0);
          const bankIncome =
            Number(s.sales?.tng || 0) +
            Number(s.sales?.duitnow || 0) +
            Number(s.sales?.card || 0) +
            Number(s.sales?.amex || 0);
          const bd = s.sales?.deliveryBreakdown || ({} as any);
          const grabExpected =
            (Number(bd.grabNet) || Number(bd.grab) || 0) -
            (Number(bd.grabAds) || 0);
          const deliveryIncome =
            Math.max(0, grabExpected) +
            (Number(bd.pandaGross) || Number(bd.panda) || 0) +
            (Number(bd.shopeeGross) || Number(bd.shopee) || 0) +
            (Number(bd.lalamove) || 0);
          const sBank = bankIncome + deliveryIncome;

          if (sCash > 0) gapCIn += sCash;
          if (sBank > 0) gapBIn += sBank;

          if (s.expenses) {
            s.expenses.forEach((e) => {
              const amt = Number(e.amount) || 0;
              if (
                amt > 0 &&
                (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL")
              ) {
                // 🔴 修正：与 fetchMonthlyLedger 保持同一规则，paidBy 优先
                const isCompanyPaid =
                  e.paidBy === "SHOP_CASH"
                    ? false
                    : e.paidBy === "COMPANY" ||
                      (!!e.paymentMethod &&
                        !e.paymentMethod.toUpperCase().includes("CASH"));
                if (isCompanyPaid) gapBOut += amt;
                else gapCOut += amt;
              }
            });
          }

          if (s.variance !== undefined && s.variance !== 0) {
            if (s.variance > 0) gapCIn += s.variance;
            else gapCOut += Math.abs(s.variance);
          } else if (s.variance === undefined && s.closingCash === undefined) {
            const refundAmt = Number(s.sales?.refundTotal || 0);
            if (refundAmt > 0) gapCOut += refundAmt;
          }
        }
      });

      transfers.forEach((t) => {
        const d = t.date.split("T")[0];
        if (d >= gapStartStr && d <= gapEndStr) {
          if (
            t.fromAccount === ("SHAREHOLDER" as any) ||
            t.fromAccount === ("OTHER" as any)
          ) {
            if (t.toAccount === "CASH") gapCIn += t.amount;
            else gapBIn += t.amount;
          } else {
            if (t.fromAccount === "CASH") gapCOut += t.amount;
            if (t.fromAccount === "BANK") gapBOut += t.amount;
            if (t.toAccount === "CASH") gapCIn += t.amount;
            if (t.toAccount === "BANK") gapBIn += t.amount;
          }
        }
      });

      billPayments.forEach((b) => {
        const d = b.date.split("T")[0];
        if (d >= gapStartStr && d <= gapEndStr) {
          if (b.method === "CASH") gapCOut += Number(b.amount);
          else gapBOut += Number(b.amount);
        }
      });

      expenses.forEach((e) => {
        if (
          e.id.startsWith("bill_sync_") ||
          e.expenseType === "RECURRING" ||
          e.settlementId
        )
          return;
        // 🔴 修正：与 fetchMonthlyLedger 保持一致，用实际付款日期
        const dDate = (e.paymentDate || e.time)?.split("T")[0] || "";
        if (dDate >= gapStartStr && dDate <= gapEndStr) {
          if (e.paymentStatus === "PAID" || e.paymentStatus === "PARTIAL") {
            // 🔴 修正：paidBy 优先，SHOP_CASH 一律算现金支出
            const isCashExp =
              e.paidBy === "SHOP_CASH" ||
              (e.paymentMethod || "BANK_TRANSFER")
                .toUpperCase()
                .includes("CASH");
            if (isCashExp) gapCOut += Number(e.amount);
            else gapBOut += Number(e.amount);
          }
        }
      });

      cashStart = cashStart + gapCIn - gapCOut;
      bankStart = bankStart + gapBIn - gapBOut;
    }

    // If the selected month itself is already closed, load the locked values!
    if (selectedMonthClosing) {
      // 👑 已结账月份：期末以实点金额为准 (旧记录无实点值时退回计算值)
      const lockedCashEnd =
        selectedMonthClosing.cashEndActual !== undefined
          ? selectedMonthClosing.cashEndActual
          : selectedMonthClosing.cashEnd;
      const lockedBankEnd =
        selectedMonthClosing.bankEndActual !== undefined
          ? selectedMonthClosing.bankEndActual
          : selectedMonthClosing.bankEnd;
      return {
        cashStart: selectedMonthClosing.cashStart,
        cashIn: selectedMonthClosing.cashIn,
        cashOut: selectedMonthClosing.cashOut,
        cashEnd: lockedCashEnd,
        bankStart: selectedMonthClosing.bankStart,
        bankIn: selectedMonthClosing.bankIn,
        bankOut: selectedMonthClosing.bankOut,
        bankEnd: lockedBankEnd,
        total: lockedCashEnd + lockedBankEnd,
        isClosed: true,
        startMonthLabel,
      };
    }

    // Otherwise compute dynamically from realtime ledger items
    const cashEnd =
      cashStart + realtimeMonthlySummary.cashIn - realtimeMonthlySummary.cashOut;
    const bankEnd =
      bankStart + realtimeMonthlySummary.bankIn - realtimeMonthlySummary.bankOut;

    return {
      cashStart,
      cashIn: realtimeMonthlySummary.cashIn,
      cashOut: realtimeMonthlySummary.cashOut,
      cashEnd,
      bankStart,
      bankIn: realtimeMonthlySummary.bankIn,
      bankOut: realtimeMonthlySummary.bankOut,
      bankEnd,
      total: cashEnd + bankEnd,
      isClosed: false,
      startMonthLabel,
    };
  }, [
    selectedMonth,
    selectedMonthClosing,
    realtimeMonthlySummary,
    monthlyClosings,
    config,
    settlements,
    transfers,
    billPayments,
    expenses,
  ]);

  const handleCloseMonth = async () => {
    if (!guardWrite('月结关账')) return;
    // 👑 STEP 1: 先让用户输入「实点金额」(Physical Count)
    const cashInput = prompt(
      `【${getMonthLabel(selectedMonth)}】月度结账 — 第 1 步：实点现金\n\n` +
        `系统计算的期末现金为 ${formatMoney(activeBalances.cashEnd)}。\n\n` +
        `请输入你月尾【实际数出来】的现金金额：\n` +
        `(直接按确定 = 采用系统计算值)`,
      String(Number(activeBalances.cashEnd.toFixed(2))),
    );
    if (cashInput === null) return; // 用户取消

    const bankInput = prompt(
      `【${getMonthLabel(selectedMonth)}】月度结账 — 第 2 步：银行余额\n\n` +
        `系统计算的期末银行为 ${formatMoney(activeBalances.bankEnd)}。\n\n` +
        `请输入【银行月结单】上的真实余额：\n` +
        `(直接按确定 = 采用系统计算值)`,
      String(Number(activeBalances.bankEnd.toFixed(2))),
    );
    if (bankInput === null) return;

    const parsedCash = Number(String(cashInput).replace(/[^0-9.-]/g, ""));
    const parsedBank = Number(String(bankInput).replace(/[^0-9.-]/g, ""));

    if (!isFinite(parsedCash) || !isFinite(parsedBank)) {
      alert("❌ 金额格式不正确，请重新输入。");
      return;
    }

    const cashEndActual = parsedCash;
    const bankEndActual = parsedBank;
    const cashVariance = cashEndActual - activeBalances.cashEnd;
    const bankVariance = bankEndActual - activeBalances.bankEnd;
    const hasVariance =
      Math.abs(cashVariance) >= 0.01 || Math.abs(bankVariance) >= 0.01;

    let varianceNote = "";
    if (hasVariance) {
      const note = prompt(
        `⚠️ 发现帐实差异 (Variance)！\n\n` +
          `💵 现金: 系统 ${formatMoney(activeBalances.cashEnd)} → 实点 ${formatMoney(cashEndActual)}  (差 ${cashVariance >= 0 ? "+" : ""}${formatMoney(cashVariance)})\n` +
          `🏦 银行: 系统 ${formatMoney(activeBalances.bankEnd)} → 实点 ${formatMoney(bankEndActual)}  (差 ${bankVariance >= 0 ? "+" : ""}${formatMoney(bankVariance)})\n\n` +
          `请简单说明差异原因 (可留空)：`,
        "",
      );
      if (note === null) return;
      varianceNote = note;
    }

    if (
      !confirm(
        `⚠️ 确认对 【${getMonthLabel(selectedMonth)}】 结算锁账吗？\n\n` +
          `📊 系统计算：\n` +
          `💵 现金: 期初 ${formatMoney(activeBalances.cashStart)} + 流入 ${formatMoney(activeBalances.cashIn)} - 流出 ${formatMoney(activeBalances.cashOut)} = ${formatMoney(activeBalances.cashEnd)}\n` +
          `🏦 银行: 期初 ${formatMoney(activeBalances.bankStart)} + 流入 ${formatMoney(activeBalances.bankIn)} - 流出 ${formatMoney(activeBalances.bankOut)} = ${formatMoney(activeBalances.bankEnd)}\n\n` +
          `✅ 实点确认 (以此为准)：\n` +
          `💵 现金 ${formatMoney(cashEndActual)}   (差 ${cashVariance >= 0 ? "+" : ""}${formatMoney(cashVariance)})\n` +
          `🏦 银行 ${formatMoney(bankEndActual)}   (差 ${bankVariance >= 0 ? "+" : ""}${formatMoney(bankVariance)})\n\n` +
          `🎯 下个月的期初余额将采用【实点金额】，误差不会累积到下个月。`,
      )
    )
      return;

    setLoading(true);
    try {
      const closingRecord: MonthlyClosing = {
        id: selectedMonth,
        month: selectedMonth,
        cashStart: activeBalances.cashStart,
        cashIn: activeBalances.cashIn,
        cashOut: activeBalances.cashOut,
        cashEnd: activeBalances.cashEnd,
        bankStart: activeBalances.bankStart,
        bankIn: activeBalances.bankIn,
        bankOut: activeBalances.bankOut,
        bankEnd: activeBalances.bankEnd,
        cashEndActual,
        bankEndActual,
        cashVariance,
        bankVariance,
        varianceNote,
        status: "CLOSED",
        closedAt: new Date().toISOString(),
        closedBy: "MANAGER",
      };

      await setDoc(
        doc(db, "treasury_monthly_closings", selectedMonth),
        closingRecord,
      );
      alert(
        `✅ 【${getMonthLabel(selectedMonth)}】月度结账成功！\n` +
          `下月期初将采用实点金额：现金 ${formatMoney(cashEndActual)} / 银行 ${formatMoney(bankEndActual)}`,
      );
      await loadClosings();
    } catch (e) {
      console.error(e);
      alert("结账失败，请检查网络！");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockMonth = async () => {
    if (!guardWrite('解锁月结')) return;
    if (
      !confirm(
        `⚠️ 警告：确定要解锁 【${getMonthLabel(selectedMonth)}】 的账目吗？\n\n` +
          `这会删除该月的结算快照，账目将恢复为【实时计算 (Draft)】。`,
      )
    )
      return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, "treasury_monthly_closings", selectedMonth));
      alert(`✅ 【${getMonthLabel(selectedMonth)}】账目已解锁，恢复实时计算状态。`);
      await loadClosings();
    } catch (e) {
      console.error(e);
      alert("解锁失败，请检查网络！");
    } finally {
      setLoading(false);
    }
  };

  // --- LEDGER DATA ---
  const getLedgerData = (type: "CASH" | "BANK") => {
    const items: LedgerItem[] = [];
    const initialAmt =
      type === "CASH" ? activeBalances.cashStart : activeBalances.bankStart;

    items.push({
      id: "init",
      date: `${selectedMonth}-01`,
      desc: `【${getMonthLabel(selectedMonth)}】期初结转余额 (Starting Balance)`,
      amount: initialAmt,
      type: "IN",
      category: "INIT",
      tag: "SETUP",
      sortTime: new Date(`${selectedMonth}-01`).getTime(),
    });

    const monthItems = selectedMonthLedgerItems.filter(
      (itm) => itm.account === type,
    );
    items.push(...monthItems);

    items.sort((a, b) => {
      if (a.category === "INIT") return -1;
      if (b.category === "INIT") return 1;
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timeA - timeB;
    });

    let currentBalance = 0;
    const processedItems = items.map((item) => {
      if (item.id === "init") {
        currentBalance = item.amount;
      } else {
        if (item.type === "IN") currentBalance += item.amount;
        else currentBalance -= item.amount;
      }
      currentBalance = Math.round(currentBalance * 100) / 100;
      return { ...item, balance: currentBalance };
    });

    return processedItems.reverse();
  };

  return {
    // state
    config,
    setConfig,
    transfers,
    setTransfers,
    settlements,
    expenses,
    setExpenses,
    billPayments,
    monthlyClosings,
    selectedMonth,
    setSelectedMonth,
    selectedMonthClosing,
    isSelectedMonthLoading,
    activeBalances,
    // actions
    loadData,
    loadExpenses,
    loadClosings,
    fetchMonthlyLedger,
    handleMonthShift,
    handleCloseMonth,
    handleUnlockMonth,
    getLedgerData,
  };
};
