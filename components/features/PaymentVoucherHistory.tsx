// ============================================================
// PaymentVoucherHistory.tsx  (v2 — 加错误显示)
// 📁 components/features/PaymentVoucherHistory.tsx
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
    X, FileText, Loader2, Search, Printer, Ban, AlertTriangle, CheckCircle2,
    ChevronDown, ChevronUp, Calendar
} from 'lucide-react';
import { DataManager } from '../../utils/dataManager';
import { PaymentVoucher } from '../../utils/paymentVoucherUtils';

interface PaymentVoucherHistoryProps {
    onClose: () => void;
    onReprint: (pv: PaymentVoucher) => void;
}

export const PaymentVoucherHistory: React.FC<PaymentVoucherHistoryProps> = ({ onClose, onReprint }) => {
    const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null); // 👑 新增：错误显示
    const [search, setSearch] = useState('');
    const [voidTarget, setVoidTarget] = useState<PaymentVoucher | null>(null);
    const [voidReason, setVoidReason] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);

    // Date range and inline expansion states
    const [startDate, setStartDate] = useState(() => {
        // Default to last 30 days to limit the initial volume of vouchers
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [expandedPvs, setExpandedPvs] = useState<Record<string, boolean>>({});

    const toggleExpand = (pvNumber: string) => {
        setExpandedPvs(prev => ({
            ...prev,
            [pvNumber]: !prev[pvNumber]
        }));
    };

    // 👑 Added monthly counters editor state
    const [showCounterEditor, setShowCounterEditor] = useState(false);
    const [counters, setCounters] = useState<Record<string, number>>({});
    const [editingCounterKey, setEditingCounterKey] = useState('');
    const [editingCounterValue, setEditingCounterValue] = useState('');

    useEffect(() => { loadVouchers(); }, []);

    const loadVouchers = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            console.log('[PV History] Loading vouchers...');
            const list = await DataManager.getPaymentVouchers({ max: 200 });
            console.log('[PV History] Loaded:', list.length, 'vouchers');
            setVouchers(list);
        } catch (e: any) {
            console.error('[PV History] Load failed:', e);
            // 👑 把错误显示在 UI 上，而不是只在 console
            setLoadError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePV = async (pvNumber: string) => {
        if (!confirm(`⚠️ 确定要彻底删除凭单 ${pvNumber} 吗？\n这是开发测试模式功能，删除后单据会被永久抹除，该号码不可找回（通常在测试重置单号时使用）。`)) return;
        setLoading(true);
        try {
            await DataManager.deletePaymentVoucher(pvNumber);
            await loadVouchers();
            alert('✅ 凭单彻底删除成功！');
        } catch (err) {
            console.error('Delete PV failed:', err);
            alert('删除失败，请重试');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCounter = async () => {
        if (!editingCounterKey) { alert('请输入月份Key (例如 202605)'); return; }
        const val = parseInt(editingCounterValue);
        if (isNaN(val) || val < 0) { alert('请输入有效的正整数'); return; }
        
        const updated = { ...counters, [editingCounterKey]: val };
        setLoading(true);
        try {
            await DataManager.savePVCounterDocument(updated);
            alert('✅ 月度单号计数器修改成功！\n下一个生成的付款凭单将在此数值上自增。');
            setShowCounterEditor(false);
        } catch (e) {
            console.error(e);
            alert('保存计数器配置失败');
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        return vouchers.filter(pv => {
            // 1. Text filter
            if (search.trim()) {
                const lower = search.toLowerCase();
                const textMatch = pv.pvNumber.toLowerCase().includes(lower) ||
                                  pv.payeeName.toLowerCase().includes(lower);
                if (!textMatch) return false;
            }

            // 2. Date range filter
            if (startDate) {
                // Comparing YYYY-MM-DD strings directly since pv.date and inputs have standard format
                if (pv.date < startDate) return false;
            }
            if (endDate) {
                if (pv.date > endDate) return false;
            }
            return true;
        });
    }, [vouchers, search, startDate, endDate]);

    const handleVoid = async () => {
        if (!voidTarget) return;
        if (!voidReason.trim()) { alert('请填写作废原因'); return; }
        setIsVoiding(true);
        try {
            await DataManager.voidPaymentVoucher(voidTarget.pvNumber, voidReason.trim());
            setVoidTarget(null);
            setVoidReason('');
            await loadVouchers();
        } catch (e) {
            console.error('Void PV failed', e);
            alert('作废失败，请重试');
        } finally {
            setIsVoiding(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#F5F7FA] w-full h-[92vh] md:max-w-4xl md:h-[88vh] rounded-t-3xl md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">

                <div className="bg-[#1A1A1A] px-4 pt-[env(safe-area-inset-top,0px)] pb-3 md:p-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700]">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD700] text-black p-2 rounded-xl shadow-lg"><FileText size={20} /></div>
                        <div>
                            <h3 className="font-serif font-black text-base md:text-xl tracking-wide">付款凭单历史</h3>
                            <p className="text-[9px] text-gray-400 font-mono uppercase tracking-widest hidden md:block">Payment Voucher History</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                </div>

                <div className="bg-white border-b border-gray-200 p-3 md:p-4 shrink-0 flex gap-2 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="搜索凭单编号 / 收款人..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#FFD700] outline-none"
                            style={{ fontSize: 16 }}
                        />
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                const docData = await DataManager.getPVCounterDocument();
                                setCounters(docData);
                                // Set initial values to current year/month
                                const now = new Date();
                                const currentMonthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
                                setEditingCounterKey(currentMonthKey);
                                setEditingCounterValue(String(docData[currentMonthKey] || 0));
                                setShowCounterEditor(true);
                            } catch (e) {
                                alert("加载单号计数器失败");
                            }
                        }}
                        className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all select-none min-h-[44px] active:scale-95"
                    >
                        🔢 调整单号
                    </button>
                </div>

                {/* 👑 Added date selection filters bar */}
                <div className="bg-white border-b border-gray-200 px-3 pb-3 md:px-4 md:pb-3 shrink-0 flex flex-col sm:flex-row gap-2.5 justify-between items-stretch sm:items-center text-xs text-gray-600">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-gray-500 mr-1 flex items-center gap-1"><Calendar size={13}/>日期范围:</span>
                        <button
                            type="button"
                            onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() - 7);
                                setStartDate(d.toISOString().split('T')[0]);
                                setEndDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="px-2.5 py-1.5 bg-gray-50 hover:bg-amber-50 rounded-lg font-bold text-gray-600 border border-gray-200 active:scale-95 transition-all text-[11px] min-h-[32px] flex items-center"
                        >
                            近 7 天
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() - 30);
                                setStartDate(d.toISOString().split('T')[0]);
                                setEndDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="px-2.5 py-1.5 bg-gray-50 hover:bg-amber-50 rounded-lg font-bold text-gray-600 border border-gray-200 active:scale-95 transition-all text-[11px] min-h-[32px] flex items-center"
                        >
                            近 30 天
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const d = new Date();
                                const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
                                setStartDate(firstDay.toISOString().split('T')[0]);
                                setEndDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="px-2.5 py-1.5 bg-gray-50 hover:bg-amber-50 rounded-lg font-bold text-gray-600 border border-gray-200 active:scale-95 transition-all text-[11px] min-h-[32px] flex items-center"
                        >
                            本月
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                            }}
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 active:scale-95 transition-all text-[11px] min-h-[32px] flex items-center"
                        >
                            全部
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-end">
                        <div className="flex items-center gap-1 font-mono">
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 block text-gray-700 text-[11px] outline-none h-8 font-bold focus:ring-1 focus:ring-[#FFD700]"
                            />
                            <span className="text-gray-400 font-bold px-0.5 text-[10px]">至</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 block text-gray-700 text-[11px] outline-none h-8 font-bold focus:ring-1 focus:ring-[#FFD700]"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-3 md:p-5 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 size={32} className="animate-spin text-gray-400" />
                        </div>
                    ) : loadError ? (
                        // 👑 错误显示：让用户能看到具体错误
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                            <AlertTriangle size={40} className="text-red-500 mx-auto mb-3" />
                            <h3 className="font-black text-base text-red-700 mb-2">加载失败</h3>
                            <p className="text-xs text-red-600 font-mono mb-4 break-words bg-red-100 p-3 rounded-lg text-left">{loadError}</p>
                            <button
                                onClick={loadVouchers}
                                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg text-sm hover:bg-red-700"
                            >
                                重试 (Retry)
                            </button>
                            <p className="text-[10px] text-gray-400 mt-3 italic">
                                如果错误信息含 "index" 或 "indexes",需要在 Firebase Console 创建索引。
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                            <FileText size={56} className="mb-4 opacity-20" />
                            <p className="font-black text-sm">暂无付款凭单</p>
                        </div>
                    ) : (
                        filtered.map(pv => {
                            const isVoid = pv.status === 'VOID';
                            return (
                                <div
                                    key={pv.pvNumber}
                                    className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all ${
                                        isVoid ? 'border-l-gray-300 opacity-70' : pv.isBackdated ? 'border-l-amber-400' : 'border-l-[#FFD700]'
                                    }`}
                                >
                                    {/* 👑 Wrap the card header in a clean clickable container suitable for single-hand palm clicks with Apple touch constraints */}
                                    <div 
                                        onClick={() => toggleExpand(pv.pvNumber)}
                                        className="cursor-pointer flex justify-between items-start gap-3 group active:opacity-85 select-none"
                                        title="点击展开或收起付款明细"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="font-mono font-black text-sm text-[#1A1A1A] group-hover:text-blue-600 transition-colors">{pv.pvNumber}</span>
                                                {isVoid ? (
                                                    <span className="bg-gray-200 text-gray-600 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Void</span>
                                                ) : pv.isBackdated ? (
                                                    <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase ring-1 ring-amber-600/20">Backdated</span>
                                                ) : (
                                                    <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase ring-1 ring-emerald-600/20">Active</span>
                                                )}
                                            </div>
                                            <h4 className="font-black text-base text-blue-900 truncate group-hover:text-blue-700 transition-colors">{pv.payeeName}</h4>
                                            <div className="text-[11px] text-gray-400 font-bold mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <span>{new Date(pv.date).toLocaleDateString('en-GB')}</span>
                                                <span>•</span>
                                                <span>{pv.paymentMethod === 'CASH' ? '💵 Cash' : '🏦 Online Transfer'}</span>
                                                <span>•</span>
                                                <span className="text-gray-500 font-extrabold">{pv.particulars.length} 项明细</span>
                                            </div>
                                            {isVoid && pv.voidReason && (
                                                <div className="text-[10px] text-red-500 font-bold mt-1 italic">
                                                    作废原因: {pv.voidReason}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                                            <div className={`text-lg font-black font-mono leading-none ${isVoid ? 'text-gray-400 line-through' : 'text-[#1A1A1A]'}`}>
                                                RM {pv.totalAmount.toFixed(2)}
                                            </div>
                                            <div className="text-gray-400 flex items-center justify-center p-1 bg-gray-50 hover:bg-gray-100 rounded-lg group-hover:text-amber-500 transition-colors w-7 h-7">
                                                {expandedPvs[pv.pvNumber] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 👑 Expandable detailed section mapping particulars */}
                                    {expandedPvs[pv.pvNumber] && (
                                        <div className="mt-3.5 pt-3.5 border-t border-dashed border-gray-200 space-y-3 bg-gray-50/50 -mx-4 px-4 pb-1 rounded-b-2xl animate-in slide-in-from-top duration-200">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">凭单明细 (Particulars)</div>
                                            <div className="space-y-2">
                                                {pv.particulars.map((part, index) => (
                                                    <div key={index} className="bg-white p-3 rounded-xl border border-gray-150 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-xs font-black text-[#1A1A1A] break-words">{part.description}</div>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                                {part.category && (
                                                                    <span className="text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-150/50 px-1.5 py-0.5 rounded">
                                                                        🏷️ {part.category}
                                                                    </span>
                                                                )}
                                                                {part.invoiceRef && (
                                                                    <span className="text-[9px] font-mono font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                                                        Ref: {part.invoiceRef}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right font-mono font-bold text-[#1A1A1A] text-xs shrink-0 self-end sm:self-center bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                                            RM {part.amount.toFixed(2)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Extra metadata cards and big words */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-gray-100 text-[10.5px]">
                                                <div>
                                                    <span className="text-gray-400 font-bold block">英文大写金额 (Amount in Words):</span>
                                                    <span className="font-extrabold text-[#1A1A1A] italic leading-tight block mt-0.5">{pv.amountInWords}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 font-bold block">付款渠道 & 经手参考 (Method & Bank Ref):</span>
                                                    <span className="font-black text-blue-900 block mt-0.5">
                                                        {pv.paymentMethod === 'CASH' ? '💵 Cash' : '🏦 Bank Transfer'}
                                                        {pv.bankRef ? ` (${pv.bankRef})` : ' (无参考号)'}
                                                    </span>
                                                </div>
                                                {pv.preparedBy && (
                                                    <div className="md:col-span-2 border-t border-gray-100 pt-2 mt-1 flex justify-between items-center text-[9px] text-gray-405 font-bold">
                                                        <span>经手人 (Prepared By): {pv.preparedBy}</span>
                                                        <span>建立时间 (Created At): {pv.createdAt ? pv.createdAt.replace('T', ' ').split('.')[0] : '-'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action row with hard-delete support for ease of dev testing reset */}
                                    <div className="grid grid-cols-12 gap-2 mt-3 pt-3 border-t border-gray-100">
                                        <button
                                            onClick={() => onReprint(pv)}
                                            className="col-span-6 bg-[#1A1A1A] text-[#FFD700] py-2 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 hover:bg-black active:scale-95 transition-all min-h-[40px] select-none"
                                        >
                                            <Printer size={14} /> 重新 A4 PDF
                                        </button>
                                        {!isVoid ? (
                                            <button
                                                onClick={() => { setVoidTarget(pv); setVoidReason(''); }}
                                                className="col-span-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-100 active:scale-95 transition-all min-h-[40px] select-none"
                                            >
                                                <Ban size={13} /> 作废
                                            </button>
                                        ) : (
                                            <div className="col-span-3"></div>
                                        )}
                                        <button
                                            onClick={() => handleDeletePV(pv.pvNumber)}
                                            className="col-span-3 bg-red-600 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1 hover:bg-red-700 active:scale-95 transition-all min-h-[40px] select-none"
                                        >
                                            彻底删除
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* 👑 Added PV Monthly Counter Adjustment Overlay Modal */}
                {showCounterEditor && (
                    <div className="fixed inset-0 bg-black/70 z-[220] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowCounterEditor(false)}>
                        <div
                            className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl border-t-4 border-amber-500 animate-in slide-in-from-bottom md:zoom-in-95 duration-300 flex flex-col max-h-[85vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-serif font-black text-lg text-[#1A1A1A]">🔢 调整月度单号计数器</h3>
                                <button onClick={() => setShowCounterEditor(false)} className="text-gray-400 p-1"><X size={20}/></button>
                            </div>
                            
                            <p className="text-xs text-gray-500 font-bold mb-4">
                                系统根据不同月份累加单号。修改这里的月份计数后，下次系统生成的单号将会是【数值 + 1】。例如要重发 <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-800">PV202605-0019</code>，请将 <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">202605</code> 设置为 <code className="font-bold text-black font-mono">18</code> 即可！
                            </p>

                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 mb-4 overflow-y-auto max-h-48">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">当前系统中的月份计数列表：</div>
                                {Object.keys(counters).length === 0 ? (
                                    <div className="text-xs text-gray-400 italic text-center py-2">暂无计数数据</div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(counters).sort((a,b)=>b[0].localeCompare(a[0])).map(([mKey, mVal]) => (
                                            <button
                                                key={mKey}
                                                onClick={() => {
                                                    setEditingCounterKey(mKey);
                                                    setEditingCounterValue(String(mVal));
                                                }}
                                                className={`p-2 rounded-xl text-left border flex justify-between items-center transition-all ${editingCounterKey === mKey ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                <span className="font-mono font-black text-xs text-blue-900">{mKey}</span>
                                                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded-md font-bold text-gray-700">Counter: {mVal}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">月份 Key (如 202605)</label>
                                    <input
                                        type="text"
                                        value={editingCounterKey}
                                        onChange={e => setEditingCounterKey(e.target.value)}
                                        className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-200 focus:border-amber-400"
                                        placeholder="YYYYMM"
                                        style={{ fontSize: 16 }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">当前已发最大号数</label>
                                    <input
                                        type="number"
                                        value={editingCounterValue}
                                        onChange={e => setEditingCounterValue(e.target.value)}
                                        className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-200 focus:border-amber-400"
                                        placeholder="例如: 18"
                                        style={{ fontSize: 16 }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-auto">
                                <button onClick={() => setShowCounterEditor(false)} className="py-3 bg-gray-150 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200 select-none min-h-[44px]">取消</button>
                                <button onClick={handleSaveCounter} className="py-3 bg-amber-500 text-white font-black rounded-xl text-xs shadow-lg hover:bg-amber-600 active:scale-95 transition-all select-none min-h-[44px]">
                                    保存计数器
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {voidTarget && (
                    <div className="fixed inset-0 bg-black/70 z-[210] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setVoidTarget(null)}>
                        <div
                            className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl border-t-4 border-red-500 animate-in slide-in-from-bottom md:zoom-in-95 duration-300"
                            onClick={e => e.stopPropagation()}
                            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                        >
                            <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertTriangle size={28} />
                            </div>
                            <h3 className="font-black text-lg text-[#1A1A1A] mb-1 text-center">作废凭单 {voidTarget.pvNumber}?</h3>
                            <p className="text-xs text-gray-500 font-bold mb-4 text-center">
                                凭单不会被删除，只标记为 VOID（编号保留以维持连续性）。
                            </p>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">作废原因 (必填)</label>
                            <textarea
                                value={voidReason}
                                onChange={e => setVoidReason(e.target.value)}
                                className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none resize-none h-20 border-2 border-transparent focus:border-red-300 mb-4"
                                placeholder="例如：金额录入错误，重新开单"
                                style={{ fontSize: 16 }}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setVoidTarget(null)} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200">取消</button>
                                <button onClick={handleVoid} disabled={isVoiding} className="py-3 bg-red-600 text-white font-black rounded-xl text-xs shadow-lg hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                    {isVoiding ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle2 size={16} />}
                                    确认作废
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};