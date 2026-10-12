import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Banknote, CheckSquare, Clock, Loader2, Printer, Square, Wallet } from 'lucide-react';
import { db } from '../../../firebaseConfig';
import type { Employee, ExpenseItem } from '../../../types';
import { DataManager } from '../../../utils/dataManager';
import { PartTimePanel, isPartTimer } from '../hr/PartTimePanel';
import { deliverPdf } from '../hr/skills/skillPrintSheets';
import { clearTreasuryCache } from '../treasury/hooks/useTreasuryData';
import { buildSummaryPages, buildVoucher, findEmployee, groupByPerson, kindOf, renderA5Pdf } from './staffCashPrint';

/**
 * 👥 兼职与预支（主管用）
 * ---------------------------------------------------------------------------
 * 以前预支、兼职都在「薪资结算」里面，主管进不去也不方便。现在独立出来：
 *   · 💵 预支：主管直接登记 → 写进 standalone_expenses（category = STAFF_ADVANCE，跟薪资结算同一格式）
 *            → 薪资结算（草稿）会自动把这笔算进当月「预支扣款」，资金管理也自动扣现金。
 *   · ⏱️ 兼职：沿用薪资结算里的兼职登记（同一个 PartTimePanel），记的账完全一样。
 *   · 🖨 打印：A5 签收单（员工 / 主管 / 人事 三方签名），可以批量：一笔一张 或 一人一张汇总。
 * 规则：直接生效；主管不能删除，记错了找人事在「薪资结算」里改。
 */

interface Props {
    onClose?: () => void;
    currentEmployee?: Employee | null;
    /** 放在管理控制台里面（外面已经有标题列和返回键）→ 不再画自己的标题 */
    embedded?: boolean;
}

type Tab = 'ADVANCE' | 'PARTTIME' | 'PRINT';

const pad = (n: number) => String(n).padStart(2, '0');
const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthLastDay = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return `${m}-${pad(new Date(y, mo, 0).getDate())}`;
};
const fmt = (n: number) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (e: ExpenseItem) => String(e.paymentDate || e.time || '').slice(0, 10);
const isActive = (e: Employee) => !e.isArchived && e.status !== 'TERMINATED';

const ask = async (msg: string): Promise<boolean> => {
    const sd = (window as any).systemDialog;
    if (sd?.confirm) return !!(await sd.confirm(msg, '兼职与预支'));
    return window.confirm(msg);
};
const tell = (msg: string) => {
    const sd = (window as any).systemDialog;
    if (sd?.alert) sd.alert(msg, '兼职与预支');
    else window.alert(msg);
};

const QUICK = [50, 100, 200, 300, 500];
const DEPT_ZH: Record<string, string> = { KITCHEN: '厨房', FLOOR: '楼面', BAR: '水吧', DISHWASH: '洗碗', BACK_OFFICE: '后勤', OWNER: '老板', OTHER: '其他' };

export const StaffCashModule: React.FC<Props> = ({ onClose, currentEmployee, embedded = false }) => {
    const [tab, setTab] = useState<Tab>('ADVANCE');
    const [month, setMonth] = useState(todayLocal().slice(0, 7));
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [advances, setAdvances] = useState<ExpenseItem[]>([]);
    const [partTimes, setPartTimes] = useState<ExpenseItem[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [emps, advSnap, ptSnap, records] = await Promise.all([
                DataManager.getEmployees(),
                getDocs(query(collection(db, 'standalone_expenses'), where('category', '==', 'STAFF_ADVANCE'))),
                getDocs(query(collection(db, 'standalone_expenses'), where('category', '==', 'SALARY'))),
                DataManager.getPayrollRecords().catch(() => []),
            ]);
            setEmployees(emps || []);
            setAdvances(advSnap.docs.map(d => d.data() as ExpenseItem));
            // 跟薪资结算一样：SALARY 里面 id 不是 salary_ / payroll_ 开头的 = 兼职 / 临时工资
            setPartTimes(
                ptSnap.docs
                    .map(d => d.data() as ExpenseItem)
                    .filter(e => e.id && !(e.id.startsWith('salary_') || e.id.startsWith('payroll_'))),
            );
            setPayrollRecords(records || []);
        } catch (err) {
            console.error('[StaffCash] load failed', err);
            tell('❌ 读取资料失败，请检查网络后再试');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const inMonth = useCallback((e: ExpenseItem) => dateOf(e).startsWith(month) || String(e.time || '').startsWith(month), [month]);
    const monthAdvances = useMemo(() => advances.filter(inMonth).sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(b.createdAt).localeCompare(String(a.createdAt))), [advances, inMonth]);
    const monthPartTimes = useMemo(() => partTimes.filter(e => String(e.time || '').startsWith(month)), [partTimes, month]);

    const setMonthPartTimes: React.Dispatch<React.SetStateAction<ExpenseItem[]>> = useCallback(
        upd => {
            setPartTimes(prev => {
                const cur = prev.filter(e => String(e.time || '').startsWith(month));
                const rest = prev.filter(e => !String(e.time || '').startsWith(month));
                const next = typeof upd === 'function' ? (upd as (p: ExpenseItem[]) => ExpenseItem[])(cur) : upd;
                return [...rest, ...next];
            });
        },
        [month],
    );

    const printPdf = async (pages: string[], fileName: string, setBusy?: (s: string) => void) => {
        if (!pages.length) return;
        try {
            setBusy?.(`准备中… 0/${pages.length}`);
            const pdf = await renderA5Pdf(pages, (d, t) => setBusy?.(`生成中… ${d}/${t}`));
            await deliverPdf(pdf, fileName);
        } catch (err) {
            console.error('[StaffCash] pdf failed', err);
            tell('❌ 生成 PDF 失败，请再试一次');
        } finally {
            setBusy?.('');
        }
    };

    const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { key: 'ADVANCE', label: '预支', icon: <Wallet size={16} />, count: monthAdvances.length },
        { key: 'PARTTIME', label: '兼职', icon: <Clock size={16} />, count: monthPartTimes.length },
        { key: 'PRINT', label: '记录·打印', icon: <Printer size={16} /> },
    ];

    return (
        <div className="min-h-full bg-[#F6F6F4] pb-[calc(env(safe-area-inset-bottom)+24px)]">
            {/* 顶部 */}
            <div className={`bg-[#111111] text-white px-4 pb-3 ${embedded ? 'pt-3' : 'sticky top-0 z-20 pt-[calc(env(safe-area-inset-top)+10px)]'}`}>
                <div className="flex items-center gap-2">
                    {onClose && !embedded && (
                        <button onClick={onClose} className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center active:bg-white/10" aria-label="返回">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="text-[17px] font-black leading-tight">兼职与预支</div>
                        <div className="text-[11px] font-bold text-white/60 truncate">Part-Time &amp; Advance</div>
                    </div>
                    <input
                        type="month"
                        value={month}
                        onChange={e => e.target.value && setMonth(e.target.value)}
                        className="h-11 rounded-xl bg-white/10 border border-white/20 px-2 text-[16px] font-black text-[#FFD200] w-[148px] shrink-0"
                        aria-label="月份"
                    />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 bg-white/10 p-1 rounded-2xl">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-black transition-colors ${
                                tab === t.key ? 'bg-[#FFD200] text-[#111111]' : 'text-white/80 active:bg-white/10'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                            {!!t.count && <span className={`text-[11px] px-1.5 rounded-full ${tab === t.key ? 'bg-black/10' : 'bg-white/15'}`}>{t.count}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="py-20 flex flex-col items-center text-gray-400 gap-2">
                    <Loader2 className="animate-spin" />
                    <span className="text-sm font-bold">读取中…</span>
                </div>
            ) : (
                <div className="max-w-3xl mx-auto px-4 pt-4">
                    {tab === 'ADVANCE' && (
                        <AdvanceTab
                            month={month}
                            employees={employees}
                            monthAdvances={monthAdvances}
                            allAdvances={advances}
                            payrollRecords={payrollRecords}
                            currentEmployee={currentEmployee}
                            onSaved={exp => setAdvances(prev => [...prev, exp])}
                            onPrint={(e, setBusy) => printPdf([buildVoucher(e, employees)], `预支单_${e.company}_${dateOf(e)}.pdf`, setBusy)}
                        />
                    )}
                    {tab === 'PARTTIME' && (
                        <div className="space-y-3">
                            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] font-bold text-amber-900 leading-relaxed">
                                ⏱️ 兼职 = 人事档案里 Salary Mode 设为 <b>Hourly</b> 的员工（Basic Salary 那格是时薪）。登记后直接算进资金管理的现金支出和当月总薪资。
                                <br />
                                要打印三方签名的签收单 → 到「记录·打印」。
                            </div>
                            <PartTimePanel
                                employees={employees}
                                currentEmployee={currentEmployee || null}
                                selectedMonth={month}
                                expenses={monthPartTimes}
                                setExpenses={setMonthPartTimes}
                                canDelete={false}
                            />
                        </div>
                    )}
                    {tab === 'PRINT' && <PrintTab month={month} employees={employees} advances={advances} partTimes={partTimes} printPdf={printPdf} />}
                </div>
            )}
        </div>
    );
};

// ===========================================================================
// 💵 预支
// ===========================================================================

interface AdvanceTabProps {
    month: string;
    employees: Employee[];
    monthAdvances: ExpenseItem[];
    allAdvances: ExpenseItem[];
    payrollRecords: any[];
    currentEmployee?: Employee | null;
    onSaved: (e: ExpenseItem) => void;
    onPrint: (e: ExpenseItem, setBusy: (s: string) => void) => Promise<void>;
}

const AdvanceTab: React.FC<AdvanceTabProps> = ({ month, employees, monthAdvances, allAdvances, payrollRecords, currentEmployee, onSaved, onPrint }) => {
    const [empId, setEmpId] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(todayLocal());
    const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState('');
    const [busyId, setBusyId] = useState('');

    // 月薪员工（时薪兼职不预支，他们是做一天领一天）
    const candidates = useMemo(
        () =>
            employees
                .filter(e => isActive(e) && !isPartTimer(e))
                .sort((a, b) => String(a.department || '').localeCompare(String(b.department || '')) || String(a.name).localeCompare(String(b.name))),
        [employees],
    );
    const emp = candidates.find(e => e.id === empId);
    const amt = parseFloat(amount) || 0;
    const advMonth = date.slice(0, 7);

    // 这个人在「扣款月份」已经预支多少
    const alreadyThisMonth = useMemo(() => {
        if (!emp) return 0;
        return allAdvances
            .filter(a => (a.employeeId ? a.employeeId === emp.id : a.company === emp.name) && dateOf(a).startsWith(advMonth))
            .reduce((s, a) => s + (Number(a.amount) || 0), 0);
    }, [emp, allAdvances, advMonth]);

    // 那个月的薪水是不是已经发了（发了就不会再自动扣）
    const payrollLocked = useMemo(() => {
        const rec = payrollRecords.find(r => r.id === advMonth);
        if (!rec) return false;
        if (rec.status === 'POSTED') return true;
        return !!emp && !!rec.details?.some((d: any) => d.employeeId === emp.id && d.isPaid);
    }, [payrollRecords, advMonth, emp]);

    const basic = Number(emp?.basicSalary) || 0;
    const after = alreadyThisMonth + amt;
    const overHalf = basic > 0 && after > basic * 0.5;

    const reset = () => {
        setEmpId('');
        setAmount('');
        setReason('');
        setDate(todayLocal());
        setMethod('CASH');
    };

    const save = async () => {
        if (!emp) return tell('⚠️ 请先选员工');
        if (!(amt > 0)) return tell('⚠️ 请填写金额');
        if (!date) return tell('⚠️ 请选日期');

        const dup = allAdvances.find(a => a.company === emp.name && dateOf(a) === date && Math.abs((Number(a.amount) || 0) - amt) < 0.005);
        const warnings: string[] = [];
        if (dup) warnings.push(`⚠️ ${emp.name} 在 ${date} 已经有一笔 RM ${fmt(amt)} 的预支，确定不是重复？`);
        if (payrollLocked) warnings.push(`⚠️ ${advMonth} 的薪水已经发了，这笔不会自动扣，要请人事手动处理（或把日期改到下个月）。`);
        if (overHalf) warnings.push(`⚠️ 这个月预支合计 RM ${fmt(after)}，超过底薪的一半（RM ${fmt(basic * 0.5)}）。`);

        const ok = await ask(
            `${warnings.length ? warnings.join('\n\n') + '\n\n' : ''}确认预支？\n\n` +
                `员工：${emp.name}\n金额：RM ${fmt(amt)}（${method === 'CASH' ? '现金' : '银行转账'}）\n日期：${date}\n` +
                `会在 ${advMonth} 的薪水里扣回。`,
        );
        if (!ok) return;

        setSaving(true);
        try {
            const exp: ExpenseItem = {
                id: `adv_${Date.now()}`,
                category: 'STAFF_ADVANCE',
                expenseType: 'SALARY',
                company: emp.name, // ⚠️ 薪资结算靠名字对应，不能改
                employeeId: emp.id,
                amount: Math.round(amt * 100) / 100,
                note: `预支薪水 - ${reason.trim()}`,
                time: date,
                createdAt: new Date().toISOString(),
                paymentMethod: method,
                paymentStatus: 'PAID',
                ...(currentEmployee ? { recordedBy: { id: currentEmployee.id, name: currentEmployee.name } } : {}),
            };
            await DataManager.saveStandaloneExpense(exp);
            try {
                clearTreasuryCache();
            } catch {}
            onSaved(exp);
            reset();
            if (await ask(`✅ 已记录：${exp.company} RM ${fmt(exp.amount)}\n\n现在打印签收单（A5）给员工签名吗？`)) {
                setBusyId(exp.id);
                await onPrint(exp, setBusy);
                setBusyId('');
            }
        } catch (err) {
            console.error('[StaffCash] save advance failed', err);
            tell('❌ 记录失败，请检查网络后再试');
        } finally {
            setSaving(false);
        }
    };

    const total = monthAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const inputCls = 'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 text-[16px] font-bold focus:outline-none focus:ring-2 focus:ring-[#FFD200]';

    return (
        <div className="space-y-4">
            {/* 登记 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Wallet size={18} className="text-[#111111]" />
                    <div className="font-black text-[16px]">登记预支</div>
                    <span className="ml-auto text-[11px] font-bold text-gray-400">保存后直接生效</span>
                </div>

                <label className="block">
                    <span className="text-[12px] font-black text-gray-500">员工</span>
                    <select value={empId} onChange={e => setEmpId(e.target.value)} className={inputCls}>
                        <option value="">— 选择员工 —</option>
                        {candidates.map(e => (
                            <option key={e.id} value={e.id}>
                                {e.name}（{e.id}）{e.department ? ` · ${DEPT_ZH[e.department] || e.department}` : ''}
                            </option>
                        ))}
                    </select>
                </label>
                {emp && (
                    <div className={`rounded-xl px-3 py-2 text-[12.5px] font-bold ${overHalf ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                        {advMonth} 已预支 RM {fmt(alreadyThisMonth)}
                        {basic > 0 && <> · 底薪 RM {fmt(basic)}</>}
                        {amt > 0 && <> · 加这笔后 RM {fmt(after)}</>}
                        {payrollLocked && <div className="text-red-700 mt-1">⚠️ {advMonth} 的薪水已经发了，这笔不会自动扣</div>}
                    </div>
                )}

                <label className="block">
                    <span className="text-[12px] font-black text-gray-500">金额 (RM)</span>
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={`${inputCls} font-mono text-[20px]`} />
                </label>
                <div className="flex flex-wrap gap-2">
                    {QUICK.map(q => (
                        <button key={q} onClick={() => setAmount(String(q))} className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-black ${amt === q ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : 'bg-white border-gray-200 text-gray-700'}`}>
                            {q}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-[12px] font-black text-gray-500">日期</span>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                    </label>
                    <div>
                        <span className="text-[12px] font-black text-gray-500">付款方式</span>
                        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1 min-h-[48px]">
                            {(['CASH', 'BANK_TRANSFER'] as const).map(m => (
                                <button key={m} onClick={() => setMethod(m)} className={`rounded-lg text-[14px] font-black ${method === m ? 'bg-white shadow text-[#111111]' : 'text-gray-500'}`}>
                                    {m === 'CASH' ? '现金' : '转账'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <label className="block">
                    <span className="text-[12px] font-black text-gray-500">原因（选填）</span>
                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：家里急用、交房租" className={inputCls} />
                </label>

                <button
                    onClick={save}
                    disabled={saving || !emp || !(amt > 0)}
                    className="w-full min-h-[52px] rounded-2xl bg-[#111111] text-[#FFD200] text-[16px] font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
                    确认预支{amt > 0 ? ` RM ${fmt(amt)}` : ''}
                </button>
                <div className="text-[11.5px] font-bold text-gray-400 leading-relaxed">
                    🔗 自动连接：薪资结算会把这笔算进 {advMonth} 的「预支扣款」；资金管理也会自动记一笔支出。主管不能删除，记错了请找人事在「薪资结算」里修改。
                </div>
            </div>

            {/* 本月记录 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center border-b border-gray-100">
                    <div className="font-black text-[15px]">{month} 预支记录</div>
                    <div className="ml-auto text-right">
                        <div className="text-[11px] font-bold text-gray-400">{monthAdvances.length} 笔 · 合计</div>
                        <div className="font-mono font-black text-[16px]">RM {fmt(total)}</div>
                    </div>
                </div>
                {busy && <div className="px-4 py-2 bg-amber-50 text-amber-800 text-[13px] font-bold flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{busy}</div>}
                {monthAdvances.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm font-bold">这个月还没有预支</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {monthAdvances.map(a => {
                            const e = findEmployee(a, employees);
                            return (
                                <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-[15px] truncate">
                                            {a.company} {e && <span className="text-[11px] font-bold text-gray-400">#{e.id}</span>}
                                        </div>
                                        <div className="text-[12px] font-bold text-gray-500 truncate">
                                            {dateOf(a)} · {(a.paymentMethod || '').includes('CASH') ? '现金' : '转账'}
                                            {a.recordedBy?.name ? ` · 经手 ${a.recordedBy.name}` : ''}
                                        </div>
                                        {String(a.note || '').replace(/^预支薪水\s*-\s*/, '').trim() && (
                                            <div className="text-[12px] text-gray-500 truncate">{String(a.note).replace(/^预支薪水\s*-\s*/, '')}</div>
                                        )}
                                    </div>
                                    <div className="font-mono font-black text-[16px] shrink-0">{fmt(a.amount)}</div>
                                    <button
                                        disabled={!!busyId}
                                        onClick={async () => {
                                            setBusyId(a.id);
                                            await onPrint(a, setBusy);
                                            setBusyId('');
                                        }}
                                        className="shrink-0 w-11 h-11 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100 disabled:opacity-40"
                                        aria-label="打印签收单"
                                    >
                                        {busyId === a.id ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// ===========================================================================
// 🖨 记录 · 批量打印
// ===========================================================================

interface PrintTabProps {
    month: string;
    employees: Employee[];
    advances: ExpenseItem[];
    partTimes: ExpenseItem[];
    printPdf: (pages: string[], fileName: string, setBusy?: (s: string) => void) => Promise<void>;
}

const PrintTab: React.FC<PrintTabProps> = ({ month, employees, advances, partTimes, printPdf }) => {
    const [from, setFrom] = useState(`${month}-01`);
    const [to, setTo] = useState(monthLastDay(month));
    const [kind, setKind] = useState<'ALL' | 'ADVANCE' | 'PARTTIME'>('ALL');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState('');

    useEffect(() => {
        setFrom(`${month}-01`);
        setTo(monthLastDay(month));
    }, [month]);

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return [...advances, ...partTimes]
            .filter(e => {
                const d = dateOf(e);
                if (from && d < from) return false;
                if (to && d > to) return false;
                if (kind !== 'ALL' && kindOf(e) !== kind) return false;
                if (q && !String(e.company || '').toLowerCase().includes(q) && !String(findEmployee(e, employees)?.id || '').toLowerCase().includes(q)) return false;
                return true;
            })
            .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || String(a.company).localeCompare(String(b.company)));
    }, [advances, partTimes, from, to, kind, search, employees]);

    // 筛选条件一改，就只保留还看得到的勾选
    useEffect(() => {
        setSelected(prev => {
            const ids = new Set(rows.map(r => r.id));
            const next = new Set([...prev].filter(id => ids.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [rows]);

    const picked = rows.filter(r => selected.has(r.id));
    const people = useMemo(() => groupByPerson(picked, employees), [picked, employees]);
    const allOn = rows.length > 0 && picked.length === rows.length;
    const toggle = (id: string) =>
        setSelected(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    const sumAdv = picked.filter(r => kindOf(r) === 'ADVANCE').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const sumPt = picked.filter(r => kindOf(r) === 'PARTTIME').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const period = from === to ? from : `${from} ~ ${to}`;
    const inputCls = 'w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-[16px] font-bold';

    const printVouchers = () => printPdf(picked.map(r => buildVoucher(r, employees)), `预支兼职单据_${from}_${to}_${picked.length}张.pdf`, setBusy);
    const printSummary = () => printPdf(people.flatMap(g => buildSummaryPages(g, period)), `预支兼职汇总_${from}_${to}_${people.length}人.pdf`, setBusy);

    return (
        <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-[12px] font-black text-gray-500">从</span>
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                    </label>
                    <label className="block">
                        <span className="text-[12px] font-black text-gray-500">到</span>
                        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                    </label>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
                    {(
                        [
                            ['ALL', '全部'],
                            ['ADVANCE', '💵 预支'],
                            ['PARTTIME', '⏱️ 兼职'],
                        ] as const
                    ).map(([k, l]) => (
                        <button key={k} onClick={() => setKind(k)} className={`min-h-[40px] rounded-lg text-[14px] font-black ${kind === k ? 'bg-white shadow text-[#111111]' : 'text-gray-500'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 搜名字 / 工号" className={inputCls} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <button onClick={() => setSelected(allOn ? new Set() : new Set(rows.map(r => r.id)))} className="w-full px-4 min-h-[48px] flex items-center gap-2 border-b border-gray-100 text-[14px] font-black active:bg-gray-50">
                    {allOn ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                    全选（{rows.length} 笔）
                    <span className="ml-auto text-[12px] text-gray-400">已选 {picked.length}</span>
                </button>
                {rows.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm font-bold">这段期间没有记录</div>
                ) : (
                    <div className="divide-y divide-gray-100 max-h-[55dvh] overflow-y-auto overscroll-contain">
                        {rows.map(r => {
                            const on = selected.has(r.id);
                            const k = kindOf(r);
                            const e = findEmployee(r, employees);
                            return (
                                <button key={r.id} onClick={() => toggle(r.id)} className={`w-full text-left px-4 py-2.5 flex items-center gap-3 min-h-[52px] ${on ? 'bg-amber-50' : 'active:bg-gray-50'}`}>
                                    {on ? <CheckSquare size={18} className="shrink-0" /> : <Square size={18} className="shrink-0 text-gray-300" />}
                                    <span className={`shrink-0 text-[11px] font-black px-1.5 py-0.5 rounded ${k === 'ADVANCE' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>{k === 'ADVANCE' ? '预支' : '兼职'}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-black text-[14px] truncate">
                                            {r.company} {e && <span className="text-[11px] text-gray-400">#{e.id}</span>}
                                        </span>
                                        <span className="block text-[12px] font-bold text-gray-500">{dateOf(r)}{r.partTime ? ` · ${r.partTime.hours}h` : ''}</span>
                                    </span>
                                    <span className="font-mono font-black text-[15px] shrink-0">{fmt(r.amount)}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 打印按钮（固定在下面） */}
            <div className="sticky bottom-0 -mx-4 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-gradient-to-t from-[#F6F6F4] via-[#F6F6F4] to-transparent">
                {busy && <div className="mb-2 rounded-xl bg-amber-50 text-amber-800 px-3 py-2 text-[13px] font-bold flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{busy}</div>}
                {picked.length > 0 && (
                    <div className="mb-2 text-[12px] font-bold text-gray-500 text-center">
                        预支 RM {fmt(sumAdv)} · 兼职 RM {fmt(sumPt)} · 合计 <b className="text-[#111111]">RM {fmt(sumAdv + sumPt)}</b>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={printVouchers} disabled={!picked.length || !!busy} className="min-h-[52px] rounded-2xl bg-[#111111] text-[#FFD200] font-black text-[14px] disabled:opacity-40 flex flex-col items-center justify-center leading-tight">
                        <span>🖨 一笔一张</span>
                        <span className="text-[11px] text-white/60">{picked.length} 张 A5</span>
                    </button>
                    <button onClick={printSummary} disabled={!picked.length || !!busy} className="min-h-[52px] rounded-2xl bg-white border-2 border-[#111111] text-[#111111] font-black text-[14px] disabled:opacity-40 flex flex-col items-center justify-center leading-tight">
                        <span>🖨 一人一张汇总</span>
                        <span className="text-[11px] text-gray-500">{people.length} 人</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StaffCashModule;
