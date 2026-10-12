import { createPortal } from "react-dom";
import { PartTimeCorrection } from "./PartTimeCorrection";
import { exportPartTimeReceipts } from "./partTimeReceipts";
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Banknote,
  Clock,
  Trash2,
  Loader2,
  UserPlus,
  Fingerprint,
} from "lucide-react";
import { Employee, ExpenseItem } from "../../../types";
import { DataManager } from "../../../utils/dataManager";
import { clearTreasuryCache } from "../treasury/hooks/useTreasuryData";

/**
 * ⏱️ 兼职日薪登记 (Part-Time Daily Cash Log)
 *
 * 以前兼职是去「应付账款」开一张账单再按已付 —— 要选分类、填公司名、自己算钱。
 * 现在：选人 → 填工时（可一键带入打卡时间）→ 自动算钱 → 按「已付现金」。
 *
 * 👑 资料照旧写进 standalone_expenses（category = SALARY），
 *    所以财务报表、资金管理、薪资总额都不用改，会自动算进去。
 *    id 以 `parttime_` 开头，跟月薪的 `salary_` / `payroll_` 分开，不会被当成月薪重复扣除。
 *
 * 谁算兼职：人事档案「Salary Mode」设成 Hourly 的员工，Basic Salary 那格就是时薪。
 */

interface PartTimePanelProps {
  employees: Employee[];
  currentEmployee?: Employee | null;
  selectedMonth: string;
  /** 本月所有兼职/临时工资（含以前从应付账款开的旧记录） */
  expenses: ExpenseItem[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  /** false = 不显示删除（主管用的「兼职与预支」页面：记错要找人事更正） */
  canDelete?: boolean;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** 上下班时间 → 工时（支持跨午夜，例如 18:00 → 01:30） */
const hoursBetween = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((x) => isNaN(x))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 4) / 4; // 取到 15 分钟
};

const toHHMM = (iso?: string) => {
  if (!iso) return "";
  if (/^\d{1,2}:\d{2}$/.test(iso)) return iso.padStart(5, "0");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const askConfirm = async (msg: string): Promise<boolean> => {
  const sd = (window as any).systemDialog;
  if (sd?.confirm) return !!(await sd.confirm(msg, "兼职登记"));
  return window.confirm(msg);
};

const tellUser = (msg: string) => {
  const sd = (window as any).systemDialog;
  if (sd?.alert) sd.alert(msg, "兼职登记");
  else window.alert(msg);
};

export const isPartTimer = (e: Employee) => e.salaryMode === "HOURLY";

export const PartTimePanel: React.FC<PartTimePanelProps> = ({
  employees,
  currentEmployee,
  selectedMonth,
  expenses,
  setExpenses,
  canDelete = true,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paperSize, setPaperSize] = useState<'a5' | 'a4'>('a5');
  const [exporting, setExporting] = useState(false);
  const [correction, setCorrection] = useState<ExpenseItem | null>(null);
  useEffect(() => { setSelectedIds(new Set()); setCorrection(null); }, [selectedMonth]);
  const exportReceipts = async (records: ExpenseItem[]) => {
    if (exporting) return;
    setExporting(true);
    try { await exportPartTimeReceipts(records, paperSize); }
    catch (e) { tellUser(e instanceof Error ? e.message : '导出失败，请重试'); }
    finally { setExporting(false); }
  };
  const partTimers = useMemo(
    () =>
      employees
        .filter((e) => isPartTimer(e) && !e.isArchived && e.status !== "TERMINATED")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [employees],
  );

  // ---------- 本月汇总 ----------
  const sorted = useMemo(
    () =>
      [...expenses].sort((a, b) =>
        (b.time || "").localeCompare(a.time || "") ||
        (b.createdAt || "").localeCompare(a.createdAt || ""),
      ),
    [expenses],
  );

  const summary = useMemo(() => {
    let total = 0;
    let hours = 0;
    const byPerson: Record<string, { name: string; amount: number; hours: number; times: number }> = {};
    expenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      total += amt;
      const h = Number(e.partTime?.hours) || 0;
      hours += h;
      const key = e.company || "—";
      if (!byPerson[key]) byPerson[key] = { name: key, amount: 0, hours: 0, times: 0 };
      byPerson[key].amount += amt;
      byPerson[key].hours += h;
      byPerson[key].times += 1;
    });
    return {
      total,
      hours,
      count: expenses.length,
      people: Object.values(byPerson).sort((a, b) => b.amount - a.amount),
    };
  }, [expenses]);

  // ---------- 登记表单 ----------
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [empId, setEmpId] = useState<string>("");
  const [otherName, setOtherName] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [useTimes, setUseTimes] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hoursStr, setHoursStr] = useState("");
  const [rateStr, setRateStr] = useState("");
  const [extraStr, setExtraStr] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [note, setNote] = useState("");
  const [punch, setPunch] = useState<{ start: string; end: string; hours: number } | null>(null);
  const [punchLoading, setPunchLoading] = useState(false);

  const isOther = empId === "__OTHER__";
  const selectedEmp = partTimers.find((e) => e.id === empId) || null;

  const hours = useTimes ? hoursBetween(startTime, endTime) : parseFloat(hoursStr) || 0;
  const rate = parseFloat(rateStr) || 0;
  const extra = parseFloat(extraStr) || 0;
  const amount = Math.round((hours * rate + extra) * 100) / 100;
  const personName = isOther ? otherName.trim() : selectedEmp?.name || "";
  const canSave = !!personName && Number.isFinite(amount) && amount > 0 && hours > 0 && hours <= 24 && rate >= 0 && extra >= 0 && !!date && !isSaving;

  const resetForm = () => {
    setEmpId("");
    setOtherName("");
    setDate(todayLocal());
    setUseTimes(false);
    setStartTime("");
    setEndTime("");
    setHoursStr("");
    setRateStr("");
    setExtraStr("");
    setExtraNote("");
    setNote("");
    setPunch(null);
  };

  const openForm = (presetEmpId?: string) => {
    resetForm();
    if (presetEmpId) pickEmployee(presetEmpId);
    setIsOpen(true);
  };

  const pickEmployee = (id: string) => {
    setEmpId(id);
    const emp = partTimers.find((e) => e.id === id);
    if (emp && emp.basicSalary > 0) setRateStr(String(emp.basicSalary));
    else if (id === "__OTHER__") setRateStr("");
  };

  // 👆 选了人 + 日期 → 看看当天有没有打卡，有的话给一个「带入」按钮（只读一个人一个月，很省）
  useEffect(() => {
    setPunch(null);
    if (!isOpen || !selectedEmp || !date) return;
    let cancelled = false;
    setPunchLoading(true);
    DataManager.getAttendanceByMonth(date.slice(0, 7), selectedEmp.id)
      .then((records: any[]) => {
        if (cancelled) return;
        const dayRecs = (records || []).filter((r) => r.date === date);
        if (dayRecs.length === 0) return;
        let mins = 0;
        let first = "";
        let last = "";
        dayRecs.forEach((r) => {
          mins += Number(r.durationMinutes) || 0;
          const ci = toHHMM(r.clockIn);
          const co = toHHMM(r.clockOut);
          if (ci && (!first || ci < first)) first = ci;
          if (co && (!last || co > last)) last = co;
        });
        let h = Math.round((mins / 60) * 4) / 4;
        if (!h && first && last) h = hoursBetween(first, last);
        if (h > 0) setPunch({ start: first, end: last, hours: h });
      })
      .catch(() => {})
      .finally(() => !cancelled && setPunchLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, empId, date]);

  // 打开表单时锁住背景，iOS 才不会整页跟着滑
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const applyPunch = () => {
    if (!punch) return;
    if (punch.start && punch.end) {
      setUseTimes(true);
      setStartTime(punch.start);
      setEndTime(punch.end);
    }
    setHoursStr(String(punch.hours));
    if (!(punch.start && punch.end)) setUseTimes(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const slug = isOther
        ? personName.replace(/[^\w一-龥]+/g, "").slice(0, 20) || "temp"
        : selectedEmp!.id;
      const id = `parttime_${slug}_${date}_${Date.now()}`;
      const detail =
        `${hours}h × RM${fmt(rate)}` +
        (useTimes && startTime && endTime ? ` (${startTime}–${endTime})` : "") +
        (extra > 0 ? ` + ${extraNote || "另加"} RM${fmt(extra)}` : "");
      const expense: ExpenseItem = {
        id,
        category: "SALARY",
        expenseType: "SALARY",
        company: personName,
        amount,
        paymentStatus: "PAID",
        paymentMethod: "CASH",
        paidBy: "COMPANY",
        time: `${date}T12:00:00.000Z`,
        paymentDate: date,
        createdAt: new Date().toISOString(),
        note: `[Part-Time] ${detail}${note ? ` · ${note}` : ""}`,
        particulars: `Part-time wages ${date} - ${personName}`,
        tags: ["PART_TIME"],
        ...(isOther ? {} : { employeeId: selectedEmp!.id }),
        ...(currentEmployee ? { recordedBy: { id: currentEmployee.id, name: currentEmployee.name } } : {}),
        partTime: {
          employeeId: isOther ? undefined : selectedEmp!.id,
          hours,
          rate,
          extra: extra || undefined,
          extraNote: extraNote || undefined,
          clockIn: useTimes ? startTime : undefined,
          clockOut: useTimes ? endTime : undefined,
        },
      };
      await DataManager.saveStandaloneExpense(expense);
      try {
        clearTreasuryCache();
      } catch {}
      if (date.startsWith(selectedMonth)) {
        setExpenses((prev) => [...prev, expense]);
      }
      setIsOpen(false);
      tellUser(
        `✅ 已记账：${personName} RM ${fmt(amount)}（现金）` +
          (date.startsWith(selectedMonth) ? "" : `\n\n日期是 ${date}，不在现在看的月份，切到那个月就看得到。`),
      );
    } catch (err) {
      console.error("Save part-time failed", err);
      tellUser("❌ 记账失败，请检查网络后再试");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (exp: ExpenseItem) => {
    if (!exp.id.startsWith("parttime_")) {
      tellUser("这笔是以前从「应付账款」开的，请到应付账款那边修改或删除。");
      return;
    }
    const ok = await askConfirm(
      `删除这笔兼职工资？\n\n${exp.company} · ${exp.time?.slice(0, 10)} · RM ${fmt(exp.amount)}\n\n资金管理的现金支出也会一起扣回。`,
    );
    if (!ok) return;
    setDeletingId(exp.id);
    try {
      await DataManager.deleteStandaloneExpense(exp.id);
      try {
        clearTreasuryCache();
      } catch {}
      setExpenses((prev) => prev.filter((e) => e.id !== exp.id));
    } catch (err) {
      console.error(err);
      tellUser("❌ 删除失败，请检查网络");
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- UI ----------
  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in duration-150">
      {/* 本月汇总 + 主按钮 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 text-[#111111] shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              ⏱️ 本月兼职 · {selectedMonth}
            </div>
            <div className="text-2xl font-mono font-black mt-1">RM {fmt(summary.total)}</div>
            <div className="text-[11px] text-gray-500 font-bold mt-0.5">
              {summary.count} 笔 · {summary.hours ? `${summary.hours} 小时` : "—"}
            </div>
          </div>
          <button
            onClick={() => openForm()}
            className="bg-[#FFD200] text-black px-4 rounded-xl font-black text-sm flex items-center gap-1.5 active:scale-95 min-h-[48px] shrink-0 shadow"
          >
            <Plus size={18} /> 登记兼职
          </button>
        </div>

        {/* 常用兼职：一点就开表单并带好时薪 */}
        {partTimers.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 -mx-4 px-4">
            {partTimers.map((e) => (
              <button
                key={e.id}
                onClick={() => openForm(e.id)}
                className="shrink-0 bg-[#F6F7FB] border border-gray-200 rounded-xl px-3 min-h-[44px] text-xs font-bold flex items-center gap-1.5 active:scale-95"
              >
                <span className="truncate max-w-[110px]">{e.name}</span>
                {e.basicSalary > 0 && (
                  <span className="text-[10px] text-amber-800 font-mono">RM{e.basicSalary}/h</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {partTimers.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] font-bold text-amber-800 leading-relaxed">
          💡 还没有设定兼职名单。到「人事档案」把兼职员工的 <b>Salary Mode 设成 Hourly</b>、Basic Salary 填时薪，
          这里就会出现他们的快捷按钮，时薪自动带入。没有档案的临时工也可以用「其他临时人员」直接登记。
        </div>
      )}

      {/* 每人合计 */}
      {summary.people.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-3">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">每人本月合计</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {summary.people.map((p) => (
              <div key={p.name} className="bg-gray-50 rounded-xl px-3 py-2">
                <div className="text-xs font-black text-[#111111] truncate">{p.name}</div>
                <div className="text-sm font-mono font-black text-emerald-700">RM {fmt(p.amount)}</div>
                <div className="text-[10px] font-bold text-gray-400">
                  {p.times} 次{p.hours ? ` · ${p.hours}h` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white p-3 rounded-2xl border border-gray-200 flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" aria-label="全选本月收据" checked={sorted.length > 0 && sorted.every(e => selectedIds.has(e.id))} onChange={e => setSelectedIds(e.target.checked ? new Set(sorted.map(v => v.id)) : new Set())} />全选本月</label>
        <span className="text-gray-500">已选 {sorted.filter(e => selectedIds.has(e.id)).length} 笔</span>
        <select aria-label="收据纸张尺寸" value={paperSize} onChange={e => setPaperSize(e.target.value as 'a5' | 'a4')} className="min-h-[44px] px-3 border border-gray-200 rounded-xl"><option value="a5">A5（默认）</option><option value="a4">A4</option></select>
        <button disabled={exporting || !sorted.some(e => selectedIds.has(e.id))} onClick={() => exportReceipts(sorted.filter(e => selectedIds.has(e.id)))} className="min-h-[44px] px-4 rounded-xl bg-[#FFD200] font-bold disabled:opacity-40">{exporting ? '生成收据…' : '批量导出 PDF'}</button>
      </div>
      {/* 逐笔明细 */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center">
            <Clock size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs font-black text-gray-500">这个月还没有兼职记录</p>
            <p className="text-[11px] text-gray-400 font-bold mt-1">兼职做完当天按「登记兼职」，付了现金就记一笔</p>
          </div>
        ) : (
          sorted.map((exp) => {
            const isNew = exp.id.startsWith("parttime_");
            const pt = exp.partTime;
            return (
              <div
                key={exp.id}
                className="bg-white rounded-2xl border border-gray-200 p-3 flex flex-wrap items-center gap-3 shadow-sm"
              >
                <input type="checkbox" aria-label={`选择 ${exp.company} ${exp.time?.slice(0, 10)} 收据`} checked={selectedIds.has(exp.id)} onChange={e => setSelectedIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(exp.id); else next.delete(exp.id); return next; })} className="w-5 h-5 accent-[#FFD200]" />
                <div className="w-11 text-center shrink-0">
                  <div className="text-lg font-black text-[#111111] leading-none">
                    {exp.time?.slice(8, 10) || "--"}
                  </div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase">
                    {exp.time ? new Date(exp.time).toLocaleDateString("zh-CN", { weekday: "short" }) : ""}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-[#111111] truncate">{exp.company || "兼职"}</div>
                  <div className="text-[11px] font-bold text-gray-500 truncate">
                    {pt
                      ? `${pt.hours}h × RM${fmt(pt.rate)}${pt.clockIn && pt.clockOut ? ` · ${pt.clockIn}–${pt.clockOut}` : ""}${pt.extra ? ` + RM${fmt(pt.extra)}` : ""}`
                      : (exp.note || "").replace(/^\[.*?\]\s*/, "") || "—"}
                  </div>
                  {!isNew && (
                    <span className="inline-block mt-0.5 text-[9px] font-black bg-orange-50 text-orange-600 border border-orange-200 px-1.5 rounded">
                      旧·应付账款
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-mono font-black text-[#111111]">{fmt(exp.amount)}</div>
                  <div className="text-[9px] font-black text-green-700 flex items-center gap-0.5 justify-end">
                    <Banknote size={10} /> {(exp.paymentMethod || "CASH").includes("CASH") ? "现金" : "银行"}
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto text-sm">
                  <button disabled={exporting} onClick={() => exportReceipts([exp])} className="min-h-[44px] px-3 rounded-xl border border-gray-200">导出收据</button>
                  <button onClick={() => setCorrection(exp)} className="min-h-[44px] px-3 rounded-xl bg-amber-50 text-amber-800">更正{exp.partTimeRevisions?.length ? ` (${exp.partTimeRevisions.length})` : ''}</button>
                </div>
                {canDelete && isNew && !exp.partTimeRevisions?.length && (
                  <button
                    onClick={() => handleDelete(exp)}
                    disabled={deletingId === exp.id}
                    className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90"
                    aria-label="删除"
                  >
                    {deletingId === exp.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {correction && createPortal(<PartTimeCorrection expense={correction} actor={currentEmployee} onClose={() => setCorrection(null)} onSaved={updated => {
        clearTreasuryCache();
        setExpenses(prev => prev.filter(e => e.id !== updated.id).concat(updated.time.startsWith(selectedMonth) ? [updated] : []));
        setCorrection(null);
        tellUser('已更正原账目，收据已同步更新。');
      }} />, document.body)}
      {/* ===== 登记表单（手机底部弹出） ===== */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/60 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm"
          onClick={() => !isSaving && setIsOpen(false)}
        >
          <div
            className="bg-[#F6F7FB] w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4"
            style={{ maxHeight: "92dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
              <div>
                <h3 className="text-base font-black text-[#111111]">登记兼职工资</h3>
                <p className="text-[10px] font-bold text-gray-400">付了现金就按下面的按钮记账</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 bg-white border border-gray-200 active:scale-90"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain px-4 pb-4 space-y-4 flex-1">
              {/* 1. 谁 */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block">1. 谁</label>
                <div className="grid grid-cols-2 gap-2">
                  {partTimers.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => pickEmployee(e.id)}
                      className={`rounded-xl border-2 px-3 py-2 text-left min-h-[52px] active:scale-95 transition-all ${
                        empId === e.id
                          ? "bg-[#111111] border-[#111111] text-white"
                          : "bg-white border-gray-200 text-[#111111]"
                      }`}
                    >
                      <div className="text-sm font-black truncate">{e.name}</div>
                      <div className={`text-[10px] font-bold ${empId === e.id ? "text-[#FFD200]" : "text-gray-400"}`}>
                        {e.basicSalary > 0 ? `RM${e.basicSalary}/小时` : "未设时薪"}
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => pickEmployee("__OTHER__")}
                    className={`rounded-xl border-2 border-dashed px-3 py-2 text-left min-h-[52px] active:scale-95 flex items-center gap-2 ${
                      isOther ? "bg-[#111111] border-[#111111] text-white" : "bg-white border-gray-300 text-gray-500"
                    }`}
                  >
                    <UserPlus size={16} />
                    <span className="text-sm font-black">其他临时人员</span>
                  </button>
                </div>
                {isOther && (
                  <input
                    value={otherName}
                    onChange={(e) => setOtherName(e.target.value)}
                    placeholder="名字"
                    className="mt-2 w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                    style={{ fontSize: "16px", minHeight: "48px" }}
                  />
                )}
              </div>

              {/* 2. 哪天 */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block">2. 哪天</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                  style={{ fontSize: "16px", minHeight: "48px" }}
                />
              </div>

              {/* 3. 做几个小时 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase">3. 做几个小时</label>
                  <div className="flex bg-gray-200/70 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setUseTimes(false)}
                      className={`px-2.5 rounded-md text-[11px] font-black min-h-[32px] ${!useTimes ? "bg-white shadow text-[#111111]" : "text-gray-500"}`}
                    >
                      填小时
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseTimes(true)}
                      className={`px-2.5 rounded-md text-[11px] font-black min-h-[32px] ${useTimes ? "bg-white shadow text-[#111111]" : "text-gray-500"}`}
                    >
                      上下班时间
                    </button>
                  </div>
                </div>

                {punchLoading && selectedEmp && (
                  <div className="text-[11px] font-bold text-gray-400 mb-2 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> 查打卡记录…
                  </div>
                )}
                {punch && (
                  <button
                    type="button"
                    onClick={applyPunch}
                    className="w-full mb-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-3 py-2 text-left flex items-center gap-2 active:scale-[0.98] min-h-[48px]"
                  >
                    <Fingerprint size={18} className="shrink-0" />
                    <span className="text-xs font-black flex-1">
                      当天有打卡{punch.start && punch.end ? `：${punch.start}–${punch.end}` : ""} = {punch.hours} 小时
                    </span>
                    <span className="text-[11px] font-black bg-blue-600 text-white rounded-lg px-2 py-1">带入</span>
                  </button>
                )}

                {!useTimes ? (
                  <>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={hoursStr}
                      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setHoursStr(e.target.value)}
                      placeholder="例如 5 或 5.5"
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-black text-right outline-none focus:border-[#111111]"
                      style={{ fontSize: "18px", minHeight: "52px" }}
                    />
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      {[3, 4, 5, 6, 8].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setHoursStr(String(h))}
                          className={`rounded-lg border font-black text-sm min-h-[44px] active:scale-95 ${
                            hours === h ? "bg-[#111111] text-[#FFD200] border-[#111111]" : "bg-white border-gray-200 text-gray-600"
                          }`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 mb-1">上班</div>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-black outline-none focus:border-[#111111]"
                        style={{ fontSize: "16px", minHeight: "48px" }}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 mb-1">下班</div>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-black outline-none focus:border-[#111111]"
                        style={{ fontSize: "16px", minHeight: "48px" }}
                      />
                    </div>
                    <div className="col-span-2 text-right text-xs font-black text-gray-500">
                      = {hours || 0} 小时{startTime && endTime && endTime <= startTime ? "（跨午夜）" : ""}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. 时薪 + 另加 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block">4. 时薪 (RM)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateStr}
                    onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setRateStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-black text-right outline-none focus:border-[#111111]"
                    style={{ fontSize: "16px", minHeight: "48px" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block">另加 (可空)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={extraStr}
                    onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setExtraStr(e.target.value)}
                    placeholder="餐费/车马费"
                    className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-black text-right outline-none focus:border-[#111111]"
                    style={{ fontSize: "16px", minHeight: "48px" }}
                  />
                </div>
                {extra > 0 && (
                  <input
                    value={extraNote}
                    onChange={(e) => setExtraNote(e.target.value)}
                    placeholder="另加的是什么？（例：餐费）"
                    className="col-span-2 w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                    style={{ fontSize: "16px", minHeight: "48px" }}
                  />
                )}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="备注（可空）"
                  className="col-span-2 w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                  style={{ fontSize: "16px", minHeight: "48px" }}
                />
              </div>
            </div>

            {/* 底部：合计 + 记账 */}
            <div
              className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0 rounded-b-none md:rounded-b-2xl"
              style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-bold text-gray-500">
                  {hours || 0}h × RM{fmt(rate)}
                  {extra > 0 ? ` + RM${fmt(extra)}` : ""}
                </span>
                <span className="text-2xl font-mono font-black text-[#111111]">RM {fmt(amount)}</span>
              </div>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="w-full bg-green-600 text-white rounded-xl font-black text-base flex items-center justify-center gap-2 min-h-[52px] active:scale-[0.98] disabled:opacity-40 shadow-md"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
                已付现金 · 记账
              </button>
              {!personName && (
                <p className="text-[10px] text-center text-gray-400 font-bold mt-1.5">先选人</p>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default PartTimePanel;
