import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, RefreshCw, ChevronDown, ChevronRight, Truck, Users, Home } from "lucide-react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { DataManager } from "../../../utils/dataManager";
import { LABOR_DEPT_ROLE_FALLBACK } from "../../../constants/classicPnLCostMap";
import type { Employee, ExpenseItem, PayrollRecord, RecurringBill } from "../../../types";

/**
 * 📊 应付总览 —— 一页看完「还有多少钱没给」
 *
 *   ① 供应商：未付 / 部分付款的账单，按「单据日期」算账龄，分成 ≤15 天、>15 天
 *   ② 员工薪资：上个月（应该要发了）+ 这个月（预计），按 楼面 / 厨房 / 水吧 / 后勤 / 管理 分
 *   ③ 每月固定费用：租金 / 员工宿舍 / Maxis / 水电 / 其他，看这个月付了没有
 *
 * 读取量：未付账单一次（最多 500 笔）+ 薪资记录 + 员工 + 固定账单（后三个本来就有快取）。
 * 只读，不会改任何资料。
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------- 工具

const DAY_MS = 24 * 60 * 60 * 1000;
const AGE_LIMIT = 15;

const pad = (v: number) => String(v).padStart(2, "0");
const ymKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const money = (v: number) =>
  (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const localDate = (s?: string) => {
  // 账单 time 多半是 "YYYY-MM-DDT12:00:00.000Z"，只取日期部分当本地日期，免得时区差一天
  const ymd = String(s || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** 跟 AP 模块同一套判断：薪资类、平台手续费类、固定账单类都不算「供应商欠款」 */
const isSalaryBill = (b: ExpenseItem) =>
  b.category === "SALARY" || b.category === "STAFF_ADVANCE" || b.expenseType === "SALARY" || b.id.startsWith("payroll_");

const isFixedBill = (b: ExpenseItem) =>
  (["RENT", "UTILITIES", "UTILITIES_ELECTRIC", "UTILITIES_WATER", "INTERNET", "WASTE"].includes(b.category) ||
    b.expenseType === "RECURRING" ||
    b.id.startsWith("bill_sync_") ||
    (b.tags || []).includes("RECURRING_BILL")) &&
  b.category !== "LICENSE" &&
  b.category !== "SUBSCRIPTION";

const isPlatformFee = (b: ExpenseItem) => {
  const name = (b.company || "").trim().toLowerCase();
  if (b.id.startsWith("recon_fee_")) return true;
  if (name.includes("shopee mobile") || name.includes("8047")) return false;
  return ["shopeefood", "shopee", "foodpanda", "food panda", "grabfood", "grab food", "duitnow", "duit now", "debit", "credit card", "bank fee", "bank charge", "transaction fee"].some((k) =>
    name.includes(k),
  );
};

const outstandingOf = (b: ExpenseItem) => {
  const v = b.outstandingAmount !== undefined && b.outstandingAmount !== null ? Number(b.outstandingAmount) : Number(b.amount);
  return Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
};

// 薪资部门：楼面 / 厨房 / 水吧 / 后勤 / 管理
const DEPTS = [
  { key: "FLOOR", label: "楼面", emoji: "🍽️" },
  { key: "KITCHEN", label: "厨房", emoji: "🔥" },
  { key: "BAR", label: "水吧", emoji: "🧋" },
  { key: "DISHWASH", label: "后勤", emoji: "🧹" },
  { key: "BACK_OFFICE", label: "管理", emoji: "📋" },
  { key: "UNASSIGNED", label: "未分部门", emoji: "❓" },
] as const;

/** 跟薪资结算 (HRPayroll.getDepartmentKey) 同一套规则 */
const deptOf = (emp?: Employee) => {
  if (!emp) return "UNASSIGNED";
  let dept = emp.department ? String(emp.department).toUpperCase() : "";
  if (!dept || dept === "OTHER") {
    const role = String(emp.role || "").toUpperCase();
    const hit = LABOR_DEPT_ROLE_FALLBACK.find((rule) => rule.keywords.some((k) => role.includes(k.toUpperCase())));
    dept = hit ? hit.department : "UNASSIGNED";
  }
  if (dept === "OWNER") dept = "BACK_OFFICE";
  return DEPTS.some((d) => d.key === dept) ? dept : "UNASSIGNED";
};

// 固定费用分组：租金 / 员工宿舍 / Maxis / 水电 / 其他
const FIXED_GROUPS = [
  { key: "RENT", label: "租金", emoji: "🏪", cats: ["RENT"] },
  { key: "HOSTEL", label: "员工宿舍", emoji: "🛏️", cats: ["RENT_STAFF", "ELECTRICITY_STAFF", "WATER_STAFF"] },
  { key: "MAXIS", label: "Maxis / 网络", emoji: "📶", cats: ["INTERNET"] },
  { key: "UTIL", label: "水电", emoji: "💡", cats: ["ELECTRICITY", "WATER"] },
  { key: "OTHER", label: "其他", emoji: "📦", cats: ["WASTE", "LICENSE", "SUBSCRIPTION", "OTHER"] },
];

const monthsBetween = (from: Date, to: Date) => (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

// ---------------------------------------------------------------- 组件

export const PayablesOverview: React.FC<Props> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<ExpenseItem[]>([]);
  const [billsCapped, setBillsCapped] = useState(false);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [recurring, setRecurring] = useState<RecurringBill[]>([]);
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<"ALL" | "OVER" | "WITHIN">("ALL");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [snap, pr, emps, rb] = await Promise.all([
        getDocs(query(collection(db, "standalone_expenses"), where("paymentStatus", "in", ["UNPAID", "PARTIAL"]), limit(500))),
        DataManager.getPayrollRecords(),
        DataManager.getEmployees(),
        DataManager.getRecurringBills(),
      ]);
      setBills(snap.docs.map((d) => d.data() as ExpenseItem));
      setBillsCapped(snap.size >= 500);
      setPayrolls(pr || []);
      setEmployees(emps || []);
      setRecurring(rb || []);
    } catch (e) {
      console.error("PayablesOverview load failed", e);
      setError("读取失败，请检查网络后按「刷新」");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [isOpen]);
  const thisMonth = ymKey(today);
  const lastMonth = ymKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  // ---------- ① 供应商 ----------
  const supplier = useMemo(() => {
    const rows = bills
      .filter((b) => !isSalaryBill(b) && !isFixedBill(b) && !isPlatformFee(b))
      .map((b) => {
        const d = localDate(b.time);
        const age = d ? Math.floor((today.getTime() - d.getTime()) / DAY_MS) : 0;
        return { b, amount: outstandingOf(b), age, over: age > AGE_LIMIT };
      })
      .filter((r) => r.amount > 0.009);

    const bySupplier = new Map<string, { name: string; over: number; within: number; count: number; oldest: number; items: typeof rows }>();
    rows.forEach((r) => {
      const name = (r.b.company || "未知供应商").trim();
      const cur = bySupplier.get(name) || { name, over: 0, within: 0, count: 0, oldest: 0, items: [] as typeof rows };
      if (r.over) cur.over += r.amount;
      else cur.within += r.amount;
      cur.count += 1;
      cur.oldest = Math.max(cur.oldest, r.age);
      cur.items.push(r);
      bySupplier.set(name, cur);
    });
    const list = Array.from(bySupplier.values())
      .map((s) => ({ ...s, items: s.items.sort((a, b) => b.age - a.age) }))
      .sort((a, b) => b.over - a.over || b.within - a.within);

    return {
      list,
      over: rows.filter((r) => r.over).reduce((s, r) => s + r.amount, 0),
      within: rows.filter((r) => !r.over).reduce((s, r) => s + r.amount, 0),
      overCount: rows.filter((r) => r.over).length,
      withinCount: rows.filter((r) => !r.over).length,
    };
  }, [bills, today]);

  const supplierShown = supplier.list.filter((s) =>
    supplierFilter === "ALL" ? true : supplierFilter === "OVER" ? s.over > 0 : s.within > 0,
  );

  // ---------- ② 薪资 ----------
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const salaryFor = (month: string) => {
    const rec = payrolls.find((r) => r.id === month || r.month === month);
    const byDept: Record<string, { amount: number; people: number }> = {};
    DEPTS.forEach((d) => (byDept[d.key] = { amount: 0, people: 0 }));
    if (!rec) return { rec: null as PayrollRecord | null, byDept, unpaid: 0, people: 0, govt: 0 };
    let unpaid = 0;
    let people = 0;
    (rec.details || []).forEach((d: any) => {
      if (d.isPaid) return;
      const net = Number(d.netPay) || 0;
      if (net <= 0) return;
      const emp = empById.get(d.employeeId);
      // 离职后残留的旧草稿不算（跟薪资结算的「幽灵草稿」同一个规则）
      if (emp && (emp.isArchived || emp.status === "TERMINATED")) {
        const t = emp.terminationDate ? emp.terminationDate.slice(0, 7) : "";
        if (t && t < month) return;
      }
      const k = deptOf(emp);
      byDept[k].amount += net;
      byDept[k].people += 1;
      unpaid += net;
      people += 1;
    });
    const govt = rec.isStatutoryPaid ? 0 : Number(rec.totalGovtPay) || 0;
    return { rec, byDept, unpaid, people, govt };
  };

  const salaryLast = useMemo(() => salaryFor(lastMonth), [payrolls, empById, lastMonth]);
  const salaryThis = useMemo(() => salaryFor(thisMonth), [payrolls, empById, thisMonth]);

  // ---------- ③ 固定费用 ----------
  const fixed = useMemo(() => {
    const curMonthNo = today.getMonth() + 1;
    const rows = recurring
      .filter((b) => b.isActive !== false && !b.isArchived)
      .filter((b) => b.type === "MONTHLY" || (b.type === "YEARLY" && (!b.dueMonth || b.dueMonth <= curMonthNo)))
      .map((b) => {
        const last = localDate(b.lastPaidDate);
        let paid = false;
        let periods = 1;
        if (b.type === "MONTHLY") {
          paid = !!last && ymKey(last) === thisMonth;
          // 上次付款到这个月之间漏了几期（从没付过就算 1 期）
          periods = paid ? 0 : last ? Math.max(1, monthsBetween(last, today)) : 1;
        } else {
          paid = !!last && last.getFullYear() === today.getFullYear();
          periods = paid ? 0 : 1;
        }
        const overdue = !paid && (b.type === "MONTHLY" ? today.getDate() > (b.dueDay || 31) || periods > 1 : true);
        const group = FIXED_GROUPS.find((g) => g.cats.includes(b.category))?.key || "OTHER";
        return { b, paid, periods, owed: paid ? 0 : (Number(b.amount) || 0) * periods, overdue, group };
      });
    const groups = FIXED_GROUPS.map((g) => {
      const items = rows.filter((r) => r.group === g.key).sort((a, b) => Number(a.paid) - Number(b.paid) || (a.b.dueDay || 0) - (b.b.dueDay || 0));
      return {
        ...g,
        items,
        owed: items.reduce((s, r) => s + r.owed, 0),
        paidCount: items.filter((r) => r.paid).length,
      };
    }).filter((g) => g.items.length > 0);
    return { groups, owed: rows.reduce((s, r) => s + r.owed, 0), unpaidCount: rows.filter((r) => !r.paid).length };
  }, [recurring, today, thisMonth]);

  // 固定会在打开时锁住背景滚动（iOS）
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const salaryDue = salaryLast.unpaid + salaryLast.govt;
  const grandDueNow = supplier.over + supplier.within + salaryDue + fixed.owed;

  const SalaryBlock = ({ title, hint, data, tone }: { title: string; hint: string; data: ReturnType<typeof salaryFor>; tone: "red" | "gray" }) => (
    <div className={`rounded-2xl border p-3 md:p-4 ${tone === "red" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-sm font-black text-[#111111]">{title}</p>
          <p className="text-[11px] font-bold text-gray-400">{hint}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-mono font-black text-lg ${tone === "red" ? "text-red-600" : "text-[#111111]"}`}>RM {money(data.unpaid)}</p>
          <p className="text-[10px] font-bold text-gray-400">{data.people} 人未发</p>
        </div>
      </div>
      {!data.rec ? (
        <p className="text-xs font-bold text-gray-400 bg-[#F6F7FB] rounded-xl px-3 py-2">这个月还没开始薪资结算</p>
      ) : data.unpaid <= 0 && data.govt <= 0 ? (
        <p className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">✅ 全部发完</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DEPTS.filter((d) => d.key !== "UNASSIGNED" || data.byDept[d.key].amount > 0).map((d) => {
            const v = data.byDept[d.key];
            return (
              <div key={d.key} className={`rounded-xl px-3 py-2 border ${v.amount > 0 ? "bg-white border-gray-200" : "bg-[#F6F7FB] border-transparent"}`}>
                <p className="text-[11px] font-black text-gray-500">
                  {d.emoji} {d.label} <span className="font-bold text-gray-400">· {v.people} 人</span>
                </p>
                <p className={`font-mono font-black ${v.amount > 0 ? "text-[#111111]" : "text-gray-300"}`}>RM {money(v.amount)}</p>
              </div>
            );
          })}
          {data.govt > 0 && (
            <div className="rounded-xl px-3 py-2 border bg-blue-50 border-blue-200">
              <p className="text-[11px] font-black text-blue-700">🏛️ 政府缴纳 (未缴)</p>
              <p className="font-mono font-black text-blue-900">RM {money(data.govt)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // 👑 用 portal + fixed 贴住视窗：以前是 absolute 跟着 AP 外框，外框比视窗高时整页撑长，
  //    里面的滚动区不会出现滚动条，加上背景被锁住 → 拉不到下面
  return createPortal(
    <div className="fixed inset-0 z-[500] bg-[#F6F7FB] flex flex-col overflow-hidden animate-in fade-in duration-150" style={{ height: "100dvh" }}>
      {/* Header */}
      <div className="bg-[#111111] border-b-[3px] border-[#FFD200] px-4 md:px-6 flex items-center justify-between shrink-0 min-h-[56px] md:min-h-[68px]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="min-w-0">
          <h2 className="font-black text-white text-base md:text-xl truncate">📊 应付总览</h2>
          <p className="text-[10px] md:text-[11px] font-bold text-gray-400 truncate">还有多少钱没给 · {today.toLocaleDateString("en-GB")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} disabled={loading} className="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-90 disabled:opacity-40" aria-label="刷新">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={onClose} className="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-90" aria-label="关闭">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))", WebkitOverflowScrolling: "touch" }}>
        {loading && bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 size={36} className="animate-spin mb-3 text-[#FFD200]" />
            <p className="text-sm font-bold">正在计算…</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-5">
            {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-4 py-3">{error}</p>}

            {/* 总数 */}
            <div className="bg-[#111111] rounded-2xl p-4 md:p-5 text-white">
              <p className="text-[11px] font-black text-[#FFD200] uppercase tracking-widest">现在应付合计</p>
              <p className="font-mono font-black text-3xl md:text-4xl mt-1">RM {money(grandDueNow)}</p>
              <p className="text-[11px] font-bold text-white/50 mt-1">供应商 + 上月薪资（含政府缴纳）+ 本月未付固定费用 · 本月薪资是预计，不算进来</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                <div className="bg-red-500/15 border border-red-400/30 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-black text-red-300">供应商 &gt;15 天</p>
                  <p className="font-mono font-black text-lg text-red-200">RM {money(supplier.over)}</p>
                  <p className="text-[10px] font-bold text-white/40">{supplier.overCount} 张单</p>
                </div>
                <div className="bg-white/10 border border-white/10 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-black text-white/60">供应商 ≤15 天</p>
                  <p className="font-mono font-black text-lg">RM {money(supplier.within)}</p>
                  <p className="text-[10px] font-bold text-white/40">{supplier.withinCount} 张单</p>
                </div>
                <div className="bg-white/10 border border-white/10 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-black text-white/60">上月薪资未发</p>
                  <p className="font-mono font-black text-lg">RM {money(salaryDue)}</p>
                  <p className="text-[10px] font-bold text-white/40">{lastMonth}</p>
                </div>
                <div className="bg-white/10 border border-white/10 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-black text-white/60">固定费用未付</p>
                  <p className="font-mono font-black text-lg">RM {money(fixed.owed)}</p>
                  <p className="text-[10px] font-bold text-white/40">{fixed.unpaidCount} 项</p>
                </div>
              </div>
            </div>

            {/* ① 供应商 */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 md:px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
                <h3 className="font-black text-[#111111] flex items-center gap-2"><Truck size={18} /> 供应商欠款</h3>
                <div className="flex bg-gray-100 rounded-xl p-1">
                  {([
                    ["ALL", "全部"],
                    ["OVER", "过了 15 天"],
                    ["WITHIN", "15 天内"],
                  ] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setSupplierFilter(k)} className={`px-3 rounded-lg text-xs font-black min-h-[36px] ${supplierFilter === k ? "bg-white shadow text-[#111111]" : "text-gray-500"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {billsCapped && (
                <p className="px-4 py-2 text-[11px] font-bold text-amber-700 bg-amber-50">⚠️ 未付账单超过 500 张，只算了前 500 张</p>
              )}
              {supplierShown.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-bold text-gray-400">没有欠款 🎉</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {supplierShown.map((s) => {
                    const open = openSupplier === s.name;
                    return (
                      <div key={s.name}>
                        <button onClick={() => setOpenSupplier(open ? null : s.name)} className="w-full px-4 md:px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 active:bg-gray-100 min-h-[56px]">
                          {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-[#111111] truncate">{s.name}</p>
                            <p className="text-[11px] font-bold text-gray-400">
                              {s.count} 张单 · 最久 {s.oldest} 天
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {s.over > 0 && <p className="font-mono font-black text-sm text-red-600">&gt;15天 RM {money(s.over)}</p>}
                            {s.within > 0 && <p className="font-mono font-bold text-sm text-gray-600">≤15天 RM {money(s.within)}</p>}
                          </div>
                        </button>
                        {open && (
                          <div className="bg-[#F6F7FB] px-4 md:px-5 py-2 space-y-1.5">
                            {s.items.map(({ b, amount, age, over }) => (
                              <div key={b.id} className="flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2 border border-gray-100">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#111111] truncate">
                                    {String(b.time || "").slice(0, 10)}
                                    {b.invoiceRef ? ` · ${b.invoiceRef}` : ""}
                                    {b.paymentStatus === "PARTIAL" ? " · 部分已付" : ""}
                                  </p>
                                  <p className="text-[10px] font-bold text-gray-400 truncate">{b.note || b.category}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-mono font-black text-sm text-[#111111]">RM {money(amount)}</p>
                                  <p className={`text-[10px] font-black ${over ? "text-red-600" : "text-gray-400"}`}>{age} 天</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ② 薪资 */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5 space-y-3">
              <h3 className="font-black text-[#111111] flex items-center gap-2"><Users size={18} /> 员工薪资</h3>
              <SalaryBlock title={`上个月 ${lastMonth}`} hint="应该要发了（每月 5–7 号发上个月薪水）" data={salaryLast} tone="red" />
              <SalaryBlock title={`这个月 ${thisMonth}`} hint="预计，还没到发薪日" data={salaryThis} tone="gray" />
              <p className="text-[10px] font-bold text-gray-400">后勤 = 清洁 / 洗碗；管理 = 经理 / 主管 / 行政。部门按人事档案，跟薪资结算的部门明细同一套规则。兼职当天付现金，不在这里。</p>
            </section>

            {/* ③ 固定费用 */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-[#111111] flex items-center gap-2"><Home size={18} /> 每月固定费用 · {thisMonth}</h3>
                <p className="font-mono font-black text-red-600">RM {money(fixed.owed)}</p>
              </div>
              {fixed.groups.length === 0 ? (
                <p className="text-sm font-bold text-gray-400">还没有设定固定账单（在「固定账单」模块新增）</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fixed.groups.map((g) => (
                    <div key={g.key} className="rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-[#F6F7FB]">
                        <p className="text-sm font-black text-[#111111]">
                          {g.emoji} {g.label} <span className="text-[11px] font-bold text-gray-400">· {g.paidCount}/{g.items.length} 已付</span>
                        </p>
                        <p className={`font-mono font-black text-sm ${g.owed > 0 ? "text-red-600" : "text-emerald-600"}`}>{g.owed > 0 ? `RM ${money(g.owed)}` : "✅ 已付清"}</p>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {g.items.map(({ b, paid, periods, owed, overdue }) => (
                          <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#111111] truncate">{b.name}</p>
                              <p className="text-[10px] font-bold text-gray-400 truncate">
                                {b.type === "MONTHLY" ? `每月 ${b.dueDay} 号` : `每年 ${b.dueMonth || "?"} 月 ${b.dueDay} 号`}
                                {b.lastPaidDate ? ` · 上次 ${b.lastPaidDate}` : " · 从没付过"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {paid ? (
                                <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">已付</span>
                              ) : (
                                <>
                                  <p className="font-mono font-black text-sm text-[#111111]">RM {money(owed)}</p>
                                  <p className={`text-[10px] font-black ${overdue ? "text-red-600" : "text-amber-600"}`}>
                                    {periods > 1 ? `欠 ${periods} 期` : overdue ? "已过期" : "未到期"}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] font-bold text-gray-400">金额用固定账单设定的金额（水电是预估）；付款状态看「上次付款日期」是不是这个月。</p>
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PayablesOverview;
