// ============================================================
// BackdatePVModule.tsx  (v3 — 每行可改日期)
//
// 流程: 选账单 → 预览每张 PV (默认 invoice 日期) → 可逐一改日期 → 确认补开
// 单选/多选/全选都支持 (用户需求 #5 = c)
//
// 📁 components/features/BackdatePVModule.tsx
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, AlertTriangle, CheckCircle2, History, Search, Calendar, FileDown
} from 'lucide-react';
import { DataManager } from '../../utils/dataManager';
import {
    PaymentVoucher,
    buildPaymentVoucher,
    billsToParticulars,
    groupBillsForBackdate,
    BackdatePVGroup,
} from '../../utils/paymentVoucherUtils';
import { ExpenseItem, Supplier } from '../../types';

interface BackdatePVModuleProps {
    onClose: () => void;
    onReprint: (pv: PaymentVoucher) => void;
}

// 预览阶段每组的状态 (含可编辑的日期)
interface EditableGroup extends BackdatePVGroup {
    editableDate: string; // YYYY-MM-DD, 默认 dateKey, 用户可改
}

const getDefaultRange = () => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 3);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
};

export const BackdatePVModule: React.FC<BackdatePVModuleProps> = ({ onClose, onReprint }) => {
    const [stage, setStage] = useState<'PICK' | 'PREVIEW'>('PICK');
    const [loading, setLoading] = useState(true);
    const [bills, setBills] = useState<ExpenseItem[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [dateRange, setDateRange] = useState(getDefaultRange());
    const [search, setSearch] = useState('');
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [editableGroups, setEditableGroups] = useState<EditableGroup[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [resultModal, setResultModal] = useState<{ generated: PaymentVoucher[]; failed: number } | null>(null);

    useEffect(() => { loadBills(); }, [dateRange.start, dateRange.end]);

    const loadBills = async () => {
        if (!dateRange.start || !dateRange.end) return;
        setLoading(true);
        try {
            const [billsData, supsData] = await Promise.all([
                DataManager.getBillsForBackdate(dateRange.start, dateRange.end),
                DataManager.getSuppliers(),
            ]);
            setBills(billsData);
            setSuppliers(supsData);
        } catch (e) {
            console.error('Load backdate bills failed', e);
            alert('加载账单失败,请重试');
        } finally {
            setLoading(false);
        }
    };

    const groups = useMemo(() => groupBillsForBackdate(bills), [bills]);

    const filteredGroups = useMemo(() => {
        if (!search.trim()) return groups;
        const lower = search.toLowerCase();
        return groups.filter(g => g.payeeName.toLowerCase().includes(lower));
    }, [groups, search]);

    const groupKey = (g: BackdatePVGroup) => `${g.dateKey}__${g.payeeName}__${g.paymentMethod}`;

    const toggleGroup = (g: BackdatePVGroup) => {
        const k = groupKey(g);
        const next = new Set(selectedKeys);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        setSelectedKeys(next);
    };

    const selectAll = () => {
        if (selectedKeys.size === filteredGroups.length) {
            setSelectedKeys(new Set());
        } else {
            setSelectedKeys(new Set(filteredGroups.map(groupKey)));
        }
    };

    const stats = useMemo(() => {
        const selectedGroups = filteredGroups.filter(g => selectedKeys.has(groupKey(g)));
        const totalAmount = selectedGroups.reduce((sum, g) => sum + g.totalAmount, 0);
        const totalBills = selectedGroups.reduce((sum, g) => sum + g.bills.length, 0);
        return { groupCount: selectedGroups.length, billCount: totalBills, totalAmount };
    }, [filteredGroups, selectedKeys]);

    const supplierByName = useMemo(() => {
        const m = new Map<string, Supplier>();
        suppliers.forEach(s => m.set(s.name, s));
        return m;
    }, [suppliers]);

    // 进入预览阶段 - 把选中的组复制成可编辑列表
    const goToPreview = () => {
        const selected = filteredGroups.filter(g => selectedKeys.has(groupKey(g)));
        setEditableGroups(selected.map(g => ({ ...g, editableDate: g.dateKey })));
        setStage('PREVIEW');
    };

    const updateEditableDate = (idx: number, newDate: string) => {
        setEditableGroups(prev => prev.map((g, i) => i === idx ? { ...g, editableDate: newDate } : g));
    };

    // 👑 真正生成补开 PV
    const handleGenerate = async () => {
        setIsProcessing(true);
        const generated: PaymentVoucher[] = [];
        let failed = 0;

        for (const g of editableGroups) {
            try {
                const monthKey = g.editableDate.slice(0, 7).replace('-', '');
                const pvNumber = await DataManager.generateBackdatePVNumber(monthKey);
                const pv = buildPaymentVoucher({
                    pvNumber,
                    payeeName: g.payeeName,
                    payeeId: supplierByName.get(g.payeeName)?.id,
                    paymentMethod: g.paymentMethod,
                    relatedExpenseIds: g.bills.map(b => b.id),
                    particulars: billsToParticulars(g.bills),
                    date: g.editableDate + 'T00:00:00.000Z',
                    isBackdated: true,
                });
                await DataManager.savePaymentVoucher(pv);
                generated.push(pv);
            } catch (e) {
                console.error('Backdate PV failed for group', g, e);
                failed++;
            }
        }

        setIsProcessing(false);
        setResultModal({ generated, failed });
        setSelectedKeys(new Set());
        setStage('PICK');
        await loadBills();
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#F5F7FA] w-full h-[92vh] md:max-w-5xl md:h-[92vh] rounded-t-3xl md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="bg-[#1A1A1A] px-4 pt-[env(safe-area-inset-top,0px)] pb-3 md:p-4 flex justify-between items-center text-white shrink-0 border-b-4 border-amber-400">
                    <div className="flex items-center gap-3 min-w-0">
                        {stage === 'PREVIEW' && (
                            <button onClick={() => setStage('PICK')} className="p-2 hover:bg-white/10 rounded-full">
                                <X size={20} className="rotate-45" />
                            </button>
                        )}
                        <div className="bg-amber-400 text-black p-2 rounded-xl shadow-lg shrink-0"><History size={20} /></div>
                        <div className="min-w-0">
                            <h3 className="font-serif font-black text-base md:text-xl tracking-wide truncate">
                                {stage === 'PICK' ? '补开旧凭单' : '预览 & 调整日期'}
                            </h3>
                            <p className="text-[9px] text-gray-400 font-mono uppercase tracking-widest hidden md:block">
                                {stage === 'PICK' ? 'Backdate Payment Voucher' : 'Preview & Adjust Dates'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full shrink-0"><X size={20} /></button>
                </div>

                {/* ============================================================ */}
                {/* STAGE 1: PICK */}
                {/* ============================================================ */}
                {stage === 'PICK' && (
                    <>
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-[11px] text-amber-800 font-bold flex items-start gap-2 shrink-0">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <div>
                                选择要补开 PV 的账单。下一步可逐一调整每张 PV 的日期。
                                生成的凭单将永久锁定,只能作废不能编辑。
                            </div>
                        </div>

                        <div className="bg-white border-b border-gray-200 px-3 py-2.5 md:p-4 shrink-0 space-y-2.5">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-gray-400 shrink-0" />
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                    className="flex-1 bg-gray-50 rounded-lg p-2 text-xs font-bold outline-none border-2 border-transparent focus:border-amber-300"
                                    style={{ fontSize: 16 }}
                                />
                                <span className="text-gray-400 text-xs font-bold">至</span>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                    className="flex-1 bg-gray-50 rounded-lg p-2 text-xs font-bold outline-none border-2 border-transparent focus:border-amber-300"
                                    style={{ fontSize: 16 }}
                                />
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="按收款人筛选..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-amber-300"
                                    style={{ fontSize: 16 }}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    onClick={selectAll}
                                    disabled={filteredGroups.length === 0}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-black disabled:opacity-50"
                                >
                                    {selectedKeys.size === filteredGroups.length && filteredGroups.length > 0 ? '取消全选' : '全选'}
                                </button>
                                <div className="text-[10px] font-bold text-gray-500">
                                    共 <span className="text-[#1A1A1A]">{filteredGroups.length}</span> 组 · 选中
                                    <span className="text-amber-700 ml-1">{stats.groupCount}</span> 组
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-3 md:p-5 space-y-2.5">
                            {loading ? (
                                <div className="flex items-center justify-center h-40">
                                    <Loader2 size={32} className="animate-spin text-gray-400" />
                                </div>
                            ) : filteredGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                                    <CheckCircle2 size={56} className="mb-4 opacity-30 text-emerald-300" />
                                    <p className="font-black text-sm text-gray-400">该日期范围内已无需补开的账单</p>
                                    <p className="text-xs text-gray-400 mt-1">所有已付账单都已经有对应 PV 了</p>
                                </div>
                            ) : (
                                filteredGroups.map(g => {
                                    const k = groupKey(g);
                                    const selected = selectedKeys.has(k);
                                    return (
                                        <div
                                            key={k}
                                            onClick={() => toggleGroup(g)}
                                            className={`bg-white rounded-xl p-3 md:p-4 border-2 transition-all cursor-pointer ${
                                                selected ? 'border-amber-400 shadow-md ring-2 ring-amber-200' : 'border-transparent hover:border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 mt-0.5 ${
                                                    selected ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300 bg-white'
                                                }`}>
                                                    {selected && <CheckCircle2 size={14} strokeWidth={3} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <span className="font-black text-sm text-[#1A1A1A] truncate">{g.payeeName}</span>
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                            g.paymentMethod === 'CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {g.paymentMethod === 'CASH' ? 'Cash' : 'Online Transfer'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 font-bold flex items-center gap-2 flex-wrap">
                                                        <span>默认日期: {g.dateKey}</span>
                                                        <span className="text-gray-300">·</span>
                                                        <span>{g.bills.length} 笔账单</span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-base font-black font-mono text-[#1A1A1A]">RM {g.totalAmount.toFixed(2)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* 底部:下一步预览 */}
                        {selectedKeys.size > 0 && (
                            <div className="bg-[#1A1A1A] p-3 md:p-4 shrink-0 border-t border-amber-400/30" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-white">
                                        <div className="text-[10px] text-gray-400 font-bold uppercase">已选</div>
                                        <div className="text-base font-black text-amber-400">
                                            {stats.groupCount} 张 PV · RM {stats.totalAmount.toFixed(2)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={goToPreview}
                                        className="bg-amber-400 text-black px-5 py-3 rounded-xl text-sm font-black shadow-lg hover:bg-amber-300 active:scale-95 transition-all flex items-center gap-2"
                                    >
                                        下一步:调整日期 →
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ============================================================ */}
                {/* STAGE 2: PREVIEW (可编辑日期) */}
                {/* ============================================================ */}
                {stage === 'PREVIEW' && (
                    <>
                        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-[11px] text-blue-800 font-bold flex items-start gap-2 shrink-0">
                            <Calendar size={14} className="shrink-0 mt-0.5" />
                            <div>
                                每行的日期会写在 PV 上(对账银行 statement)。默认是 invoice 日期,你可以逐一改。
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-3 md:p-5 space-y-3">
                            {editableGroups.map((g, idx) => (
                                <div key={`${g.dateKey}__${g.payeeName}__${idx}`} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                    <div className="flex items-start gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-black text-sm text-[#1A1A1A]">{g.payeeName}</span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                    g.paymentMethod === 'CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {g.paymentMethod === 'CASH' ? 'Cash' : 'Online Transfer'}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-gray-500 font-bold">
                                                {g.bills.length} 笔账单 · RM {g.totalAmount.toFixed(2)}
                                            </div>
                                            {/* 列出账单内容 */}
                                            <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto bg-gray-50 rounded-lg p-2">
                                                {g.bills.map((b, i) => (
                                                    <div key={i} className="text-[10px] font-mono text-gray-500 flex justify-between gap-2">
                                                        <span className="truncate">{b.note?.slice(0, 30) || b.category || 'Bill'} · #{b.id.slice(-6)}</span>
                                                        <span className="shrink-0 text-gray-700">RM {(b.amount || 0).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="shrink-0 w-full md:w-auto">
                                            <label className="text-[10px] font-black text-amber-700 uppercase mb-1 block">
                                                PV 日期 (可改)
                                            </label>
                                            <input
                                                type="date"
                                                value={g.editableDate}
                                                onChange={e => updateEditableDate(idx, e.target.value)}
                                                className="bg-amber-50 border-2 border-amber-300 rounded-lg p-2 text-sm font-black outline-none focus:border-amber-500"
                                                style={{ fontSize: 16 }}
                                            />
                                            {g.editableDate !== g.dateKey && (
                                                <p className="text-[9px] text-amber-600 mt-1 italic">原: {g.dateKey}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-[#1A1A1A] p-3 md:p-4 shrink-0 border-t border-amber-400/30" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                            <div className="flex items-center justify-between gap-3">
                                <button
                                    onClick={() => setStage('PICK')}
                                    className="text-amber-400 px-4 py-2 text-xs font-bold hover:bg-white/10 rounded-lg"
                                >
                                    ← 返回选择
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={isProcessing}
                                    className="bg-amber-400 text-black px-5 py-3 rounded-xl text-sm font-black shadow-lg hover:bg-amber-300 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 size={18} />}
                                    确认补开 {editableGroups.length} 张
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Result Modal */}
                {resultModal && (
                    <div className="fixed inset-0 bg-black/70 z-[210] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setResultModal(null)}>
                        <div
                            className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl border-t-4 border-emerald-500 animate-in slide-in-from-bottom md:zoom-in-95 duration-300 max-h-[80vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                        >
                            <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <CheckCircle2 size={28} />
                            </div>
                            <h3 className="font-black text-lg text-[#1A1A1A] mb-1 text-center">补开完成</h3>
                            <p className="text-xs text-gray-500 font-bold mb-4 text-center">
                                成功 {resultModal.generated.length} 张{resultModal.failed > 0 ? ` · 失败 ${resultModal.failed} 张` : ''}
                            </p>
                            <div className="bg-gray-50 rounded-xl p-3 mb-4 max-h-60 overflow-y-auto">
                                {resultModal.generated.map(pv => (
                                    <div key={pv.pvNumber} className="flex items-center justify-between py-1.5 text-xs">
                                        <div className="min-w-0">
                                            <div className="font-mono font-black text-[#1A1A1A]">{pv.pvNumber}</div>
                                            <div className="text-[10px] text-gray-500 truncate">{pv.payeeName} · {new Date(pv.date).toLocaleDateString('en-GB')}</div>
                                        </div>
                                        <button
                                            onClick={() => onReprint(pv)}
                                            className="ml-2 p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg shrink-0"
                                            title="下载 PDF"
                                        >
                                            <FileDown size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setResultModal(null)}
                                className="w-full py-3 bg-[#1A1A1A] text-amber-400 font-black rounded-xl text-sm hover:bg-black"
                            >
                                完成
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};