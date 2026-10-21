// ==========================================
// 🧾 批量核对（对账）
// ------------------------------------------
// 选一个月 → 整个月所有「日期 × 付款方式」摊平成一张清单，
// 可以只看 TNG、只看 GrabFood，或者几个一起看。
// 每一行自己填实收、自己按「确认」，不用一笔笔点进去。
// 已核对过的也可以直接改（会自动把旧的平账费用清掉再重记，不会重复记账）。
// ==========================================

import React, { useState, useMemo, useEffect } from 'react';
import { OPS_ICONS } from './settlementIcons';
import { X, Loader2, Search, CheckCircle2, Pencil, ShieldCheck, RotateCcw, Calendar, AlertTriangle, Wallet, Users, ClipboardPen, SlidersHorizontal, MoreHorizontal } from 'lucide-react';
import { SettlementRecord, WEATHER_OPTIONS, SPECIAL_CONDITION_OPTIONS } from '../../../types';
import { SettlementExtras, getExtras, platformsWithSales, extrasUpdate, applyExtrasLocally } from './settlementExtras';
import { SPECIAL_CONDITION_ICONS } from './settlementIcons';
import { getMalaysiaHoliday, holidayLabel } from '../../../utils/holidays/malaysiaHolidays';
import { guardWrite } from '../../../utils/readOnlyMode';
import { DataManager } from '../../../utils/dataManager';
import { getReconChannels, applyRecon, ReconChannelKey } from '../../../utils/settlementRecon';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { SettlementOps, OPS_FIELDS, getOps, perPax, fmtMoneyOrDash } from './settlementOps';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    defaultMonth: string;
    /** 有任何一笔核对成功后通知外面刷新 */
    onChanged: () => void;
    /** 打开时先显示哪一页（历史页的「补填」按钮直接开 EXTRA） */
    initialMode?: 'RECON' | 'OPS' | 'EXTRA';
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

const CHANNELS: { key: ReconChannelKey; label: string; short: string; cls: string }[] = [
    { key: 'tng',    label: 'TNG eWallet',     short: 'TNG',    cls: 'bg-sky-100 text-sky-800 border-sky-300' },
    { key: 'debit',  label: 'Debit / DuitNow', short: 'Debit',  cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
    { key: 'credit', label: 'Credit Card',     short: 'Credit', cls: 'bg-violet-100 text-violet-800 border-violet-300' },
    { key: 'amex',   label: 'Amex',            short: 'Amex',   cls: 'bg-slate-100 text-slate-800 border-slate-300' },
    { key: 'grab',   label: 'GrabFood',        short: 'Grab',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    { key: 'panda',  label: 'FoodPanda',       short: 'Panda',  cls: 'bg-pink-100 text-pink-800 border-pink-300' },
    { key: 'shopee', label: 'ShopeeFood',      short: 'Shopee', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
];

const chanMeta = (k: string) => CHANNELS.find(c => c.key === k)!;
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row {
    rowKey: string;
    record: SettlementRecord;
    date: string;
    key: ReconChannelKey;
    label: string;
    expected: number;
    actual: number | null;
    isReconciled: boolean;
}

export const SettlementBatchRecon: React.FC<Props> = ({ isOpen, onClose, defaultMonth, onChanged, initialMode = 'RECON' }) => {
    const [month, setMonth] = useState(defaultMonth);
    const [records, setRecords] = useState<SettlementRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<Set<ReconChannelKey>>(new Set());     // 空 = 全部
    const [status, setStatus] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');
    const [drafts, setDrafts] = useState<Record<string, string>>({});          // rowKey → 输入中的实收
    const [editing, setEditing] = useState<Set<string>>(new Set());            // 已核对但正在改的 rowKey
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number }>({ running: false, done: 0, total: 0 });
    // 👥 营运数据模式：整个月一次过补填 人数 / 单数 / VIP / WhatsApp
    const [mode, setMode] = useState<'RECON' | 'OPS' | 'EXTRA'>(initialMode);
    // 精简画面：付款方式筛选、合计与「一键填」收进按钮，按了才弹出
    const [filterOpen, setFilterOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [opsDrafts, setOpsDrafts] = useState<Record<string, SettlementOps>>({});
    const [opsSaving, setOpsSaving] = useState(false);
    // 📝 补填模式：外卖单数 / 天气 / 特殊情况
    const [extraDrafts, setExtraDrafts] = useState<Record<string, SettlementExtras>>({});
    const [extraSaving, setExtraSaving] = useState(false);

    useEffect(() => { if (isOpen) { setMonth(defaultMonth); setMode(initialMode); } }, [isOpen, defaultMonth, initialMode]);

    const load = async (m: string) => {
        setLoading(true);
        try {
            const list = await DataManager.getSettlements(m);
            setRecords(list.sort((a, b) => a.date.localeCompare(b.date)));
            setOpsDrafts({});
            setExtraDrafts({});
        } catch (e) {
            console.error('批量核对：读取结算失败', e);
            alert('❌ 读取账目失败，请检查网络');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { if (isOpen) load(month); }, [isOpen, month]);

    const allRows: Row[] = useMemo(() => {
        const out: Row[] = [];
        records.forEach(r => {
            getReconChannels(r).forEach(c => {
                // 金额 0 又没核对过的不用列（没东西对）
                if (c.expected <= 0 && c.actual === null) return;
                out.push({
                    rowKey: `${r.id}__${c.key}`, record: r, date: r.date,
                    key: c.key, label: c.label, expected: c.expected,
                    actual: c.actual, isReconciled: c.isReconciled,
                });
            });
        });
        return out;
    }, [records]);

    const rows = useMemo(() => allRows.filter(r => {
        if (picked.size > 0 && !picked.has(r.key)) return false;
        if (status === 'PENDING' && r.isReconciled) return false;
        if (status === 'DONE' && !r.isReconciled) return false;
        return true;
    }), [allRows, picked, status]);

    /** 每个通道各有几笔待核对，显示在筛选按钮上 */
    const pendingByChannel = useMemo(() => {
        const m: Record<string, number> = {};
        allRows.forEach(r => { if (!r.isReconciled) m[r.key] = (m[r.key] || 0) + 1; });
        return m;
    }, [allRows]);

    const summary = useMemo(() => {
        let expected = 0, actual = 0, pending = 0, done = 0;
        rows.forEach(r => {
            expected += r.expected;
            if (r.isReconciled) { actual += r.actual || 0; done++; } else pending++;
        });
        return { expected, actual, pending, done, diff: Number((expected - actual).toFixed(2)) };
    }, [rows]);

    // 👥 营运数据：有改过的日子
    const opsDirtyIds = Object.keys(opsDrafts).filter(id => {
        const r = records.find(x => x.id === id);
        if (!r) return false;
        const cur = getOps(r);
        return OPS_FIELDS.some(f => (opsDrafts[id][f.key] || 0) !== (cur[f.key] || 0));
    });

    const setOpsField = (r: SettlementRecord, key: keyof SettlementOps, raw: string) => {
        const v = Math.max(0, parseInt(raw, 10) || 0);
        setOpsDrafts(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || getOps(r)), [key]: v } }));
    };

    const saveOps = async () => {
        if (opsDirtyIds.length === 0) return;
        setOpsSaving(true);
        const failed: string[] = [];
        const saved: Record<string, SettlementOps> = {};
        for (const id of opsDirtyIds) {
            const r = records.find(x => x.id === id)!;
            try {
                // 只改 ops 这一栏，不动营业额、核对状态等其他资料
                await updateDoc(doc(db, 'settlements', id), { ops: opsDrafts[id] });
                saved[id] = opsDrafts[id];
            } catch (e) {
                console.error('保存营运数据失败', id, e);
                failed.push(r.date);
            }
        }
        setRecords(prev => prev.map(r => saved[r.id] ? ({ ...r, ops: saved[r.id] } as any) : r));
        setOpsDrafts(prev => {
            const n = { ...prev };
            Object.keys(saved).forEach(id => delete n[id]);
            return n;
        });
        setOpsSaving(false);
        onChanged();
        alert(failed.length === 0
            ? `✅ 已保存 ${Object.keys(saved).length} 天的营运数据`
            : `⚠️ 成功 ${Object.keys(saved).length} 天，失败 ${failed.length} 天：${failed.join('、')}`);
    };

    // 📝 补填：有改过的日子
    const extraUpdates = Object.fromEntries(Object.keys(extraDrafts).map(id => {
        const r = records.find(x => x.id === id);
        return [id, r ? extrasUpdate(getExtras(r), extraDrafts[id]) : {}];
    }).filter(([, u]) => Object.keys(u as object).length > 0)) as Record<string, Record<string, any>>;
    const extraDirtyIds = Object.keys(extraUpdates);
    const missingOrdersDays = records.filter(r => {
        const ex = getExtras(r);
        return platformsWithSales(r).some(p => !(ex.orders[p.key]! > 0));
    }).length;

    const editExtra = (r: SettlementRecord, fn: (d: SettlementExtras) => SettlementExtras) =>
        setExtraDrafts(prev => {
            const cur = prev[r.id] || getExtras(r);
            return { ...prev, [r.id]: fn({ ...cur, orders: { ...cur.orders }, specialConditions: [...cur.specialConditions] }) };
        });

    const saveExtras = async () => {
        if (extraDirtyIds.length === 0 || !guardWrite('补填结算资料')) return;
        setExtraSaving(true);
        const failed: string[] = [];
        const saved: Record<string, Record<string, any>> = {};
        for (const id of extraDirtyIds) {
            const r = records.find(x => x.id === id)!;
            try {
                // 只写改动的栏位（栏位路径更新），营业额、核对状态等完全不动
                await updateDoc(doc(db, 'settlements', id), extraUpdates[id]);
                saved[id] = extraUpdates[id];
            } catch (e) {
                console.error('补填失败', id, e);
                failed.push(r.date);
            }
        }
        setRecords(prev => prev.map(r => saved[r.id] ? applyExtrasLocally(r, saved[r.id]) : r));
        setExtraDrafts(prev => {
            const n = { ...prev };
            Object.keys(saved).forEach(id => delete n[id]);
            return n;
        });
        setExtraSaving(false);
        onChanged();
        alert(failed.length === 0
            ? `✅ 已补填 ${Object.keys(saved).length} 天`
            : `⚠️ 成功 ${Object.keys(saved).length} 天，失败 ${failed.length} 天：${failed.join('、')}`);
    };

    if (!isOpen) return null;

    const toggleChannel = (k: ReconChannelKey) => setPicked(prev => {
        const n = new Set(prev);
        n.has(k) ? n.delete(k) : n.add(k);
        return n;
    });

    const confirmRow = async (row: Row) => {
        const raw = drafts[row.rowKey];
        if (raw === undefined || raw === '') return alert('⚠️ 请先填写实际到账金额');
        const actualNum = parseFloat(raw);
        if (isNaN(actualNum) || actualNum < 0) return alert('⚠️ 金额格式不对');
        if (actualNum > row.expected + 0.001) {
            return alert(`❌ 实收 RM ${money(actualNum)} 大于系统预估 RM ${money(row.expected)}。\n如果真的收多了，请先用「直接编辑」改当天的营业额。`);
        }
        const diff = Number((row.expected - actualNum).toFixed(2));
        const wasDone = row.isReconciled;
        const msg = `确认核对？\n\n${row.date} · ${row.label}\n系统预估：RM ${money(row.expected)}\n实际到账：RM ${money(actualNum)}\n` +
            (diff > 0 ? `差额 RM ${money(diff)} 会自动记成${['grab', 'panda', 'shopee'].includes(row.key) ? '「广告/异常扣款」' : '「银行手续费」'}` : '完美对上，不产生费用') +
            (wasDone ? '\n\n⚠️ 这笔之前核对过，旧的自动平账费用会先清掉再重记（不会重复）。' : '');
        if (!confirm(msg)) return;

        setSavingKey(row.rowKey);
        try {
            const rs = await applyRecon(row.record, { key: row.key, label: row.label, expected: row.expected }, actualNum);
            setRecords(prev => prev.map(r => r.id === row.record.id ? ({ ...r, reconStatus: rs } as SettlementRecord) : r));
            setDrafts(p => { const n = { ...p }; delete n[row.rowKey]; return n; });
            setEditing(p => { const n = new Set(p); n.delete(row.rowKey); return n; });
            onChanged();
        } catch (e) {
            console.error('核对失败', e);
            alert('❌ 核对失败，请重试');
        } finally {
            setSavingKey(null);
        }
    };

    const startEdit = (row: Row) => {
        setEditing(p => new Set(p).add(row.rowKey));
        setDrafts(p => ({ ...p, [row.rowKey]: String(row.actual ?? '') }));
    };
    const cancelEdit = (rowKey: string) => {
        setEditing(p => { const n = new Set(p); n.delete(rowKey); return n; });
        setDrafts(p => { const n = { ...p }; delete n[rowKey]; return n; });
    };

    /** 已经填好金额的行，全部找出来（还没核对的、或正在改的） */
    const readyRows = rows.filter(r => {
        const editable = !r.isReconciled || editing.has(r.rowKey);
        if (!editable) return false;
        const raw = drafts[r.rowKey];
        if (raw === undefined || raw === '') return false;
        const v = parseFloat(raw);
        return !isNaN(v) && v >= 0 && v <= r.expected + 0.001;
    });

    /** 🚀 一次过确认：把上面填好的行全部写进去，不用一颗一颗按 */
    const confirmAll = async () => {
        if (readyRows.length === 0) return alert('⚠️ 还没有填好金额的行');
        const totalExpected = readyRows.reduce((sum, r) => sum + r.expected, 0);
        const totalActual = readyRows.reduce((sum, r) => sum + parseFloat(drafts[r.rowKey]), 0);
        const totalDiff = Number((totalExpected - totalActual).toFixed(2));
        const redoCount = readyRows.filter(r => r.isReconciled).length;

        const msg = `一次过确认 ${readyRows.length} 笔？\n\n` +
            `系统预估合计：RM ${money(totalExpected)}\n` +
            `实际到账合计：RM ${money(totalActual)}\n` +
            (totalDiff > 0 ? `差额合计 RM ${money(totalDiff)} 会自动记成费用\n` : '完美对上，不产生费用\n') +
            (redoCount > 0 ? `\n⚠️ 其中 ${redoCount} 笔是重新核对，旧的自动平账费用会先清掉再重记（不会重复）。\n` : '') +
            `\n写进去之后不会自动退回，请确认金额没打错。`;
        if (!confirm(msg)) return;

        setBulk({ running: true, done: 0, total: readyRows.length });
        // ⚠️ 同一天可能有好几个通道要写。applyRecon 是读 record.reconStatus 再整份写回，
        //    所以要用 rsMap 记住「刚写完的最新状态」，不然后面那笔会把前面那笔覆盖掉。
        const rsMap: Record<string, any> = {};
        const failed: string[] = [];
        let ok = 0;

        for (let i = 0; i < readyRows.length; i++) {
            const row = readyRows[i];
            const actualNum = parseFloat(drafts[row.rowKey]);
            try {
                const base = { ...row.record, reconStatus: rsMap[row.record.id] ?? (row.record as any).reconStatus } as SettlementRecord;
                const rs = await applyRecon(base, { key: row.key, label: row.label, expected: row.expected }, actualNum);
                rsMap[row.record.id] = rs;
                ok++;
            } catch (e) {
                console.error('批量核对失败', row.rowKey, e);
                failed.push(`${row.date} ${row.label}`);
            }
            setBulk({ running: true, done: i + 1, total: readyRows.length });
        }

        // 一次过更新画面
        setRecords(prev => prev.map(r => rsMap[r.id] ? ({ ...r, reconStatus: rsMap[r.id] } as SettlementRecord) : r));
        setDrafts(prev => {
            const next = { ...prev };
            readyRows.forEach(r => { if (!failed.includes(`${r.date} ${r.label}`)) delete next[r.rowKey]; });
            return next;
        });
        setEditing(prev => {
            const next = new Set(prev);
            readyRows.forEach(r => next.delete(r.rowKey));
            return next;
        });
        setBulk({ running: false, done: 0, total: 0 });
        onChanged();

        alert(failed.length === 0
            ? `✅ 已核对 ${ok} 笔`
            : `⚠️ 成功 ${ok} 笔，失败 ${failed.length} 笔：\n${failed.join('\n')}\n\n失败的那几笔金额还留在画面上，可以再按一次。`);
    };

    /** 一键把还没填的行填成「等于系统预估」（完美对账），仍要一行行按确认 */
    const fillAllPerfect = () => {
        const targets = rows.filter(r => !r.isReconciled && (drafts[r.rowKey] === undefined || drafts[r.rowKey] === ''));
        if (targets.length === 0) return;
        if (!confirm(`把 ${targets.length} 行还没填的实收金额，先填成跟系统预估一样？\n（只是帮你填，还是要一行行按确认才会写进去）`)) return;
        setDrafts(p => {
            const n = { ...p };
            targets.forEach(r => { n[r.rowKey] = r.expected.toFixed(2); });
            return n;
        });
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-4xl md:rounded-3xl rounded-t-3xl max-h-[95vh] flex flex-col shadow-2xl">

                {/* 标题 */}
                <div className="flex items-center justify-between gap-2 px-3 md:px-5 pt-3 pb-2 border-b border-gray-100 shrink-0">
                    <div className="min-w-0 flex-1">
                        <div className="flex bg-gray-100 rounded-xl p-1 w-full md:w-fit">
                            <button onClick={() => setMode('RECON')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-2.5 rounded-lg text-xs font-black whitespace-nowrap ${mode === 'RECON' ? 'bg-white shadow text-stone-900' : 'text-gray-500'}`} style={{ minHeight: '36px' }}><Wallet size={13} />对账</button>
                            <button onClick={() => setMode('OPS')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-2.5 rounded-lg text-xs font-black whitespace-nowrap ${mode === 'OPS' ? 'bg-white shadow text-violet-700' : 'text-gray-500'}`} style={{ minHeight: '36px' }}><Users size={13} />人数</button>
                            <button onClick={() => setMode('EXTRA')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-2.5 rounded-lg text-xs font-black whitespace-nowrap ${mode === 'EXTRA' ? 'bg-white shadow text-amber-700' : 'text-gray-500'}`} style={{ minHeight: '36px' }}><ClipboardPen size={13} />单数 / 天气</button>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1.5 px-0.5 truncate">
                            {loading ? '读取中…' : mode === 'EXTRA'
                                ? <>共 {records.length} 天 · 外卖缺单数 <b className="text-amber-600">{missingOrdersDays}</b> 天</>
                                : mode === 'OPS'
                                ? <>共 {records.length} 天 · 已填人数 <b className="text-violet-600">{records.filter(r => getOps(r).pax > 0).length}</b> 天</>
                                : <>待核对 <b className="text-amber-600">{summary.pending}</b> · 已核对 <b className="text-emerald-600">{summary.done}</b> · 共 {rows.length} 行</>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex justify-center items-center shrink-0 self-start"><X size={18} /></button>
                </div>

                {/* 筛选 */}
                <div className="px-3 md:px-5 py-2 border-b border-gray-100 shrink-0 space-y-2">
                    <div className="flex gap-1.5">
                        <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl px-2 shrink-0" style={{ minHeight: '40px' }}>
                            <Calendar size={13} className="text-gray-400 shrink-0" />
                            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                                className="bg-transparent font-black text-stone-900 outline-none w-[118px] md:w-[150px]" style={{ fontSize: '15px' }} />
                        </div>
                        {mode === 'RECON' && <>
                            <select value={status} onChange={e => setStatus(e.target.value as 'PENDING' | 'DONE' | 'ALL')} aria-label="核对状态"
                                className="flex-1 min-w-0 rounded-xl bg-[#FFD200] text-stone-900 text-xs font-black px-2 outline-none" style={{ minHeight: '40px' }}>
                                <option value="PENDING">待核对</option><option value="DONE">已核对</option><option value="ALL">全部</option>
                            </select>
                            <button onClick={() => setFilterOpen(v => !v)} aria-expanded={filterOpen}
                                className={`shrink-0 flex items-center gap-1 rounded-xl px-2.5 text-xs font-black border ${picked.size > 0 || filterOpen ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-gray-600 border-gray-200'}`} style={{ minHeight: '40px' }}>
                                <SlidersHorizontal size={13} /> {picked.size > 0 ? `${picked.size} 种` : '付款'}
                            </button>
                        </>}
                    </div>

                    {mode === 'RECON' && filterOpen && (<div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase">付款方式（不选 = 全部）</span>
                            {picked.size > 0 && (
                                <button onClick={() => setPicked(new Set())} className="text-[10px] font-black text-indigo-600 flex items-center gap-1">
                                    <RotateCcw size={11} /> 看全部
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-4 md:grid-cols-7 gap-1.5">
                            {CHANNELS.map(c => {
                                const on = picked.has(c.key);
                                const n = pendingByChannel[c.key] || 0;
                                return (
                                    <button key={c.key} onClick={() => toggleChannel(c.key)}
                                        className={`rounded-xl border px-1 py-1.5 transition-all active:scale-95 ${on ? c.cls + ' ring-2 ring-offset-1 ring-stone-400' : 'bg-white border-gray-200 text-gray-400'}`}
                                        style={{ minHeight: '44px' }}>
                                        <div className="text-[11px] font-black leading-tight">{c.short}</div>
                                        <div className="text-[9px] font-bold opacity-70 leading-tight">{n > 0 ? `${n} 待对` : '—'}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>)}
                </div>

                {/* 清单 */}
                <div className="flex-grow overflow-auto px-4 md:px-5 py-3">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <Loader2 size={36} className="animate-spin mb-3 text-[#FFD200]" />
                            <p className="text-xs font-bold">正在拉取 {month} 的账目…</p>
                        </div>
                    ) : mode === 'EXTRA' ? (
                        records.length === 0 ? (
                            <p className="text-center py-16 text-xs font-black text-gray-400">{month} 没有结算记录</p>
                        ) : (
                            <div className="space-y-2">
                                {records.map(r => {
                                    const ex = extraDrafts[r.id] || getExtras(r);
                                    const dirty = extraDirtyIds.includes(r.id);
                                    const plats = platformsWithSales(r);
                                    const hol = getMalaysiaHoliday(r.date);
                                    const wd = new Date(`${r.date}T00:00:00`).getDay();
                                    return (
                                        <div key={r.id} className={`rounded-xl border px-3 py-2.5 space-y-2 ${dirty ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200 bg-white'}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-[12px] font-black text-stone-900">
                                                    {r.date.slice(5)} <span className={`text-[10px] ${wd === 0 || wd === 6 ? 'text-amber-600' : 'text-gray-400'}`}>周{WEEKDAY[wd]}</span>
                                                    {hol && <span className="ml-1.5 rounded bg-pink-50 px-1 text-[10px] font-bold text-pink-600">{holidayLabel(hol)}</span>}
                                                </span>
                                                {dirty && <span className="text-[11px] font-black text-amber-600">未保存</span>}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1">
                                                {WEATHER_OPTIONS.map(o => (
                                                    <button key={o.value} type="button" onClick={() => editExtra(r, d => ({ ...d, weather: o.value }))}
                                                        className={`min-w-[44px] rounded-lg border px-2 text-[11px] font-black ${ex.weather === o.value ? 'border-stone-900 bg-stone-900 text-[#FFD200]' : 'border-gray-200 bg-white text-gray-500'}`}
                                                        style={{ minHeight: '34px' }}>{o.label}</button>
                                                ))}
                                                <span className="mx-1 h-5 w-px bg-gray-200" />
                                                {SPECIAL_CONDITION_OPTIONS.map(o => {
                                                    const on = ex.specialConditions.includes(o.value);
                                                    return (
                                                        <button key={o.value} type="button"
                                                            onClick={() => editExtra(r, d => ({ ...d, specialConditions: on ? d.specialConditions.filter(v => v !== o.value) : [...d.specialConditions, o.value] }))}
                                                            className={`flex items-center gap-1 rounded-lg border px-2 text-[11px] font-black ${on ? 'border-orange-400 bg-orange-400 text-black' : 'border-gray-200 bg-white text-gray-500'}`}
                                                            style={{ minHeight: '34px' }}>
                                                            {React.createElement(SPECIAL_CONDITION_ICONS[o.value], { size: 12, className: 'shrink-0' })}{o.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {plats.length > 0 ? (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                                    {plats.map(p => {
                                                        const v = ex.orders[p.key];
                                                        const missing = !(v! > 0);
                                                        return (
                                                            <label key={p.key} className="min-w-0">
                                                                <span className={`block text-[9px] font-black truncate mb-0.5 ${missing ? 'text-amber-600' : 'text-gray-500'}`}>{p.label} 单数 · RM {money(p.amount)}</span>
                                                                <input type="number" inputMode="numeric" min={0} step={1}
                                                                    value={v === undefined || v === 0 ? '' : v}
                                                                    onChange={e => { const n = parseInt(e.target.value, 10); editExtra(r, d => ({ ...d, orders: { ...d.orders, [p.key]: Number.isFinite(n) && n >= 0 ? n : undefined } })); }}
                                                                    placeholder="待补"
                                                                    className={`w-full bg-white border rounded-lg px-2 text-right font-mono font-black text-stone-900 outline-none focus:border-amber-400 ${missing ? 'border-amber-300' : 'border-gray-300'}`}
                                                                    style={{ fontSize: '16px', minHeight: '40px' }} />
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            ) : <p className="text-[10px] font-bold text-gray-400">这天没有外卖营业额</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : mode === 'OPS' ? (
                        records.length === 0 ? (
                            <p className="text-center py-16 text-xs font-black text-gray-400">{month} 没有结算记录</p>
                        ) : (
                            <div className="space-y-2">
                                {records.map(r => {
                                    const o = opsDrafts[r.id] || getOps(r);
                                    const dirty = opsDirtyIds.includes(r.id);
                                    const avg = perPax(r.sales.storeHubTotal, o);
                                    return (
                                        <div key={r.id} className={`rounded-xl border px-3 py-2.5 ${dirty ? 'border-violet-300 bg-violet-50/50' : 'border-gray-200 bg-white'}`}>
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="font-mono text-[12px] font-black text-stone-900">
                                                    {r.date.slice(5)} <span className="text-[10px] text-gray-400">店内 RM {money(r.sales.storeHubTotal || 0)}</span>
                                                </span>
                                                <span className="text-[11px] font-black text-violet-700">人均 RM {fmtMoneyOrDash(avg)}{dirty && <span className="ml-1.5 text-violet-500">· 未保存</span>}</span>
                                            </div>
                                            <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
                                                {OPS_FIELDS.map(f => (
                                                    <label key={f.key} className="min-w-0">
                                                        <span className="flex items-center gap-0.5 text-[9px] font-black text-gray-500 truncate mb-0.5">{React.createElement(OPS_ICONS[f.key], { size: 10, className: 'shrink-0 text-violet-500' })}{f.short}</span>
                                                        <input type="number" inputMode="numeric" min={0} step={1}
                                                            value={o[f.key] || ''}
                                                            onChange={e => setOpsField(r, f.key, e.target.value)}
                                                            placeholder="0"
                                                            className="w-full bg-white border border-gray-300 rounded-lg px-2 text-right font-mono font-black text-stone-900 outline-none focus:border-violet-400"
                                                            style={{ fontSize: '16px', minHeight: '40px' }} />
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : rows.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Search size={40} className="mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-black">这个条件下没有要核对的账目</p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {rows.map(row => {
                                const meta = chanMeta(row.key);
                                const isEditing = !row.isReconciled || editing.has(row.rowKey);
                                const draft = drafts[row.rowKey] ?? '';
                                const draftNum = draft === '' ? null : parseFloat(draft);
                                const liveDiff = draftNum === null || isNaN(draftNum) ? null : Number((row.expected - draftNum).toFixed(2));
                                const saving = savingKey === row.rowKey || bulk.running;

                                return (
                                    <div key={row.rowKey}
                                        className={`rounded-xl border px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-2 ${
                                            row.isReconciled && !editing.has(row.rowKey) ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'
                                        }`}>

                                        {/* 手机：日期 + 通道 + 预估同一行；电脑：各占一栏 */}
                                        <div className="flex items-center justify-between gap-2 md:contents">
                                        {/* 日期 + 通道 */}
                                        <div className="flex items-center gap-2 min-w-0 md:w-[210px] shrink-0">
                                            <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black bg-gray-100 text-gray-600 border border-gray-200">
                                                {row.date.slice(5)}
                                            </span>
                                            <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-black border ${meta.cls}`}>{meta.short}</span>
                                            <span className="text-[10px] font-bold text-gray-400 truncate hidden md:block">{row.label}</span>
                                        </div>

                                        {/* 应收 */}
                                        <div className="flex items-center justify-between md:justify-start gap-2 md:w-[150px] shrink-0">
                                            <span className="text-[10px] font-bold text-gray-400 md:hidden">预估</span>
                                            <span className="font-mono text-[13px] font-black text-stone-800 tabular-nums">RM {money(row.expected)}</span>
                                        </div>
                                        </div>

                                        {/* 手机：实收 + 按钮同一行 */}
                                        <div className="flex items-center gap-2 md:contents">

                                        {/* 实收 */}
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {isEditing ? (
                                                <>
                                                    <input type="number" inputMode="decimal" step="0.01" value={draft}
                                                        onChange={e => setDrafts(p => ({ ...p, [row.rowKey]: e.target.value }))}
                                                        placeholder="实际到账"
                                                        className="flex-1 min-w-0 bg-white border border-gray-300 rounded-lg px-2 font-mono font-black text-stone-900 outline-none focus:border-[#FFD200] focus:ring-2 focus:ring-[#FFD200]/30"
                                                        style={{ fontSize: '16px', minHeight: '40px' }} />
                                                </>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-[12px] font-black text-emerald-700">
                                                    <CheckCircle2 size={14} /> 实收 RM {money(row.actual || 0)}
                                                </span>
                                            )}

                                            {liveDiff !== null && isEditing && (
                                                <span className={`shrink-0 text-[10px] font-black px-1.5 py-1 rounded-md border whitespace-nowrap ${
                                                    liveDiff > 0 ? 'bg-pink-50 text-pink-700 border-pink-200'
                                                    : liveDiff < 0 ? 'bg-red-50 text-red-700 border-red-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                }`}>
                                                    {liveDiff > 0 ? `差 ${money(liveDiff)}` : liveDiff < 0 ? '超出！' : '完美'}
                                                </span>
                                            )}
                                        </div>

                                        {/* 按钮 */}
                                        <div className="flex gap-1.5 shrink-0">
                                            {isEditing ? (
                                                <>
                                                    {row.isReconciled && (
                                                        <button onClick={() => cancelEdit(row.rowKey)} disabled={saving}
                                                            className="px-3 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-black shrink-0" style={{ minHeight: '40px' }}>
                                                            取消
                                                        </button>
                                                    )}
                                                    <button onClick={() => confirmRow(row)} disabled={saving}
                                                        className="px-4 rounded-lg bg-stone-900 text-[#FFD200] text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 shrink-0"
                                                        style={{ minHeight: '40px' }}>
                                                        {saving ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                                        确认
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => startEdit(row)}
                                                    className="px-3 rounded-lg bg-white border border-gray-300 text-gray-600 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 shrink-0"
                                                    style={{ minHeight: '40px' }}>
                                                    <Pencil size={12} /> 改
                                                </button>
                                            )}
                                        </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {mode === 'EXTRA' && (
                    <div className="p-3 md:p-4 border-t border-gray-100 shrink-0 flex gap-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                        <button onClick={saveExtras} disabled={extraSaving || extraDirtyIds.length === 0}
                            className="flex-1 rounded-xl bg-amber-500 text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95" style={{ minHeight: '48px' }}>
                            {extraSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                            保存 {extraDirtyIds.length} 天
                        </button>
                        <button onClick={onClose} disabled={extraSaving} className="px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black shrink-0 disabled:opacity-40" style={{ minHeight: '48px' }}>
                            关闭
                        </button>
                    </div>
                )}

                {mode === 'OPS' && (
                    <div className="p-3 md:p-4 border-t border-gray-100 shrink-0 flex gap-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                        <button onClick={saveOps} disabled={opsSaving || opsDirtyIds.length === 0}
                            className="flex-1 rounded-xl bg-violet-600 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95" style={{ minHeight: '48px' }}>
                            {opsSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                            保存 {opsDirtyIds.length} 天
                        </button>
                        <button onClick={onClose} disabled={opsSaving} className="px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black shrink-0 disabled:opacity-40" style={{ minHeight: '48px' }}>
                            关闭
                        </button>
                    </div>
                )}

                {/* 底部合计 */}
                <div className={`relative p-3 md:p-4 border-t border-gray-100 shrink-0 ${mode !== 'RECON' ? 'hidden' : ''}`} style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                    {moreOpen && <>
                    <div className="fixed inset-0 z-[1]" onClick={() => setMoreOpen(false)} />
                    <div className="absolute left-3 right-3 bottom-full mb-2 z-[2] bg-white rounded-2xl border border-gray-200 shadow-2xl p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-gray-50 rounded-xl px-2 py-1.5 text-center border border-gray-100">
                            <div className="text-[9px] font-black text-gray-400 uppercase">系统预估合计</div>
                            <div className="font-mono text-[13px] font-black text-stone-800 tabular-nums">{money(summary.expected)}</div>
                        </div>
                        <div className="bg-emerald-50 rounded-xl px-2 py-1.5 text-center border border-emerald-100">
                            <div className="text-[9px] font-black text-emerald-600 uppercase">已核对实收</div>
                            <div className="font-mono text-[13px] font-black text-emerald-800 tabular-nums">{money(summary.actual)}</div>
                        </div>
                        <div className="bg-amber-50 rounded-xl px-2 py-1.5 text-center border border-amber-100">
                            <div className="text-[9px] font-black text-amber-700 uppercase">还没对</div>
                            <div className="font-mono text-[13px] font-black text-amber-800 tabular-nums">{summary.pending} 笔</div>
                        </div>
                    </div>
                        <button onClick={() => { setMoreOpen(false); fillAllPerfect(); }} disabled={loading || bulk.running || summary.pending === 0}
                            className="w-full rounded-xl bg-gray-100 text-gray-700 text-xs font-black disabled:opacity-40" style={{ minHeight: '44px' }}>
                            ① 一键填「完美对账」（还没填的都填成系统预估）
                        </button>
                        <p className="text-[10px] text-gray-400 font-bold flex items-start gap-1">
                            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                            可以一行一行按「确认」，也可以填好之后按 ② 一次过写进去。差额会自动记成费用；重新核对同一笔时，旧的那笔自动费用会先清掉，不会重复记账。
                        </p>
                    </div>
                    </>}
                    <div className="flex items-stretch gap-2">
                        <button onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen} aria-label="更多：合计与一键填"
                            className={`shrink-0 rounded-xl px-3 flex items-center justify-center gap-1 text-xs font-black border ${moreOpen ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-gray-600 border-gray-200'}`} style={{ minHeight: '44px' }}>
                            <MoreHorizontal size={16} /> 更多
                        </button>
                        <button onClick={confirmAll} disabled={loading || bulk.running || readyRows.length === 0}
                            className="flex-1 min-w-0 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95" style={{ minHeight: '44px' }}>
                            {bulk.running
                                ? <><Loader2 size={15} className="animate-spin" /> 写入中 {bulk.done}/{bulk.total}</>
                                : <><ShieldCheck size={15} /> ② 确认已填的 {readyRows.length} 笔</>}
                        </button>
                        <button onClick={onClose} disabled={bulk.running} className="px-4 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black shrink-0 disabled:opacity-40" style={{ minHeight: '44px' }}>
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettlementBatchRecon;
