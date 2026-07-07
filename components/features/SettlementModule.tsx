import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Trash2, Check, AlertTriangle, Calculator, Play, Power, History, 
    Wallet, Banknote, CreditCard, X, Calendar, Truck, CheckCircle2, 
    RotateCcw, AlertCircle, Loader2, FileDown, ShieldCheck, Zap
} from 'lucide-react';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { SettlementRecord, StoreConfig, ExpenseItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';

interface SettlementModuleProps {
    storeConfig: StoreConfig;
    onClose?: () => void;
    isStandalone?: boolean;
}

const getBusinessDateStr = (cutoff: number) => {
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < cutoff) {
        now.setDate(now.getDate() - 1);
    }
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getCalendarTodayStr = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isChannelReconciled = (reconStatus: any, key: string): boolean => {
    const val = reconStatus?.[key];
    return val === true || (typeof val === 'number');
};

const getReconActual = (reconStatus: any, key: string): number | null => {
    const val = reconStatus?.[key];
    if (typeof val === 'number') return val;
    return null;
};

// 🟢 ReconItem：补回对账后的手续费/调节费的百分比展示
const ReconItem = ({ 
    label, 
    gross,
    net,
    ads = 0,
    isReconciled,
    actualAmount,
    onReconcile 
}: { 
    label: string, 
    gross: number,
    net?: number,
    ads?: number,
    isReconciled: boolean,
    actualAmount: number | null,
    onReconcile: () => void 
}) => { 
    // 实际应入账标准：如果有 net 则为 net - ads，否则退回使用 gross
    const expected = net !== undefined ? (net - ads) : gross;
    if (expected <= 0 && gross <= 0) return null;

    const displayActual = actualAmount !== null ? actualAmount : (isReconciled ? expected : null);
    const reconFee = displayActual !== null ? Number((expected - displayActual).toFixed(2)) : null;
    const commission = (gross > 0 && net !== undefined && gross > net) ? Number((gross - net).toFixed(2)) : null;
    
    // 🌟 Grab 专属：计算当班即刻已知的基础抽佣率
    const commRate = (commission !== null && gross > 0) ? ((commission / gross) * 100).toFixed(1) : null;
    
    // 🌟 核心修复：计算对账后产生的手续费/平台调节费的抽水率 (Bank, Panda, Shopee)
    const feeRate = (reconFee !== null && reconFee > 0 && expected > 0) ? ((reconFee / expected) * 100).toFixed(1) : null;
    
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm mt-2 gap-3 sm:gap-2">
            <div className="flex-1 min-w-0">
                <div className="flex justify-between sm:block items-center mb-1 sm:mb-0">
                    <p className="text-xs font-black text-gray-800 truncate pr-2">{label}</p>
                    <div className="flex flex-col items-end sm:items-start gap-0.5 mt-1">
                        {commission !== null && (
                            <p className="text-[9px] text-gray-400 font-mono whitespace-nowrap line-through">Gross: RM {gross.toFixed(2)}</p>
                        )}
                        <p className="text-[11px] text-[#1A1A1A] font-bold font-mono whitespace-nowrap">预期到账 (Net): RM {expected.toFixed(2)}</p>
                        {ads > 0 && (
                            <p className="text-[9px] text-orange-500 font-bold font-mono whitespace-nowrap">- 已扣除当班广告 RM {ads.toFixed(2)}</p>
                        )}
                    </div>
                </div>
                {isReconciled && displayActual !== null && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 whitespace-nowrap">
                            实际到账: RM {displayActual.toFixed(2)}
                        </span>
                        {commission !== null && commission > 0 && (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 whitespace-nowrap">
                                基础抽佣: RM {commission.toFixed(2)} {commRate && <span className="text-gray-400 ml-0.5">({commRate}%)</span>}
                            </span>
                        )}
                        {/* 🌟 把算好的 feeRate 塞进粉红色的徽章里 */}
                        {reconFee !== null && reconFee > 0 && (
                            <span className="text-[10px] font-bold text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded border border-pink-100 whitespace-nowrap flex items-center gap-1">
                                {['GrabFood', 'FoodPanda', 'ShopeeFood'].includes(label) ? '滞后广告/调节费' : '手续费'}: RM {reconFee.toFixed(2)} {feeRate && <span className="opacity-80 font-black ml-0.5">({feeRate}%)</span>}
                            </span>
                        )}
                    </div>
                )}
            </div>
            
            <div className="flex justify-end shrink-0 w-full sm:w-auto">
                {isReconciled ? (
                    <span className="flex items-center justify-center w-full sm:w-auto gap-1 text-[10px] font-black text-green-700 bg-green-100 px-3 py-1.5 rounded-lg border border-green-200">
                        <CheckCircle2 size={14}/> 已过账
                    </span>
                ) : (
                    <button 
                        onClick={onReconcile}
                        className="flex items-center justify-center w-full sm:w-auto gap-1 text-[11px] font-black text-[#FFD700] bg-[#1A1A1A] hover:bg-black px-4 py-2 rounded-lg shadow-md active:scale-95 transition-all"
                    >
                        <ShieldCheck size={14}/> 核对到账
                    </button>
                )}
            </div>
        </div>
    );
};

// 🌟 HistoryDetailModal - 剔除所有无关的%，只在 PDF 的 Grab 抽水旁边加上比率 🌟
const HistoryDetailModal = ({ record, onClose, onDelete, onRefresh, onUndoEdit }: { record: SettlementRecord | null, onClose: () => void, onDelete: (id: string) => void, onRefresh: () => void, onUndoEdit: (record: SettlementRecord) => void }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const [localRecord, setLocalRecord] = useState<SettlementRecord | null>(record);
    
    useEffect(() => {
        setLocalRecord(record);
    }, [record]);

    const [reconTarget, setReconTarget] = useState<{key: string, label: string, expectedAmount: number, grossAmount: number} | null>(null);
    const [reconActual, setReconActual] = useState<string>('');
    const [isProcessingRecon, setIsProcessingRecon] = useState(false);

    if (!localRecord) return null;

    const deliveryBreakdown = localRecord.sales.deliveryBreakdown || {} as any;
    
    // 抓取 Grab 专属数据
    const grabGross = Number(deliveryBreakdown.grabGross) || 0;
    const grabNet = Number(deliveryBreakdown.grabNet) || Number(deliveryBreakdown.grab) || 0;
    const grabAds = Number(deliveryBreakdown.grabAds) || 0;
    const grabExpected = grabNet - grabAds;
    const grabComm = grabGross > grabNet ? grabGross - grabNet : 0; 
    
    const pandaNet = deliveryBreakdown.pandaNet !== undefined ? Number(deliveryBreakdown.pandaNet) : (Number(deliveryBreakdown.panda) || 0);
    const pandaAds = Number(deliveryBreakdown.pandaAds) || 0;
    const pandaExpected = pandaNet - pandaAds;
    const pandaGross = Number(deliveryBreakdown.pandaGross) || (deliveryBreakdown.pandaNet !== undefined ? pandaNet : (Number(deliveryBreakdown.panda) || 0));
    
    // 🌟 抓取 Shopee 拆分数据（加入强力覆盖逻辑，确保不走 Gross 旧数据）
    const shopeeNet = deliveryBreakdown.shopeeNet !== undefined ? Number(deliveryBreakdown.shopeeNet) : (Number(deliveryBreakdown.shopee) || 0);
    const shopeeAds = Number(deliveryBreakdown.shopeeAds) || 0;
    const shopeeExpected = shopeeNet - shopeeAds;
    // 如果 shopeeGross 为 0 但 shopeeNet 有值，说明是新版数据，强制让 Gross 等于 Net 以便显示
    const shopeeGross = Number(deliveryBreakdown.shopeeGross) || shopeeNet;

    // 🌟 重新计算彻底挤干水分的外卖总额
    const totalDelivery = grabExpected + (deliveryBreakdown.pandaNet !== undefined ? pandaExpected : pandaGross) + shopeeExpected + (Number(deliveryBreakdown.lalamove) || 0);

    // 🌟 读取历史记录中保存的临时支出和老板抽款（做防空保护）
    const recordExpenses = (localRecord as any).dayExpenses || [];
    const recordWithdrawal = Number((localRecord as any).ownerWithdrawal) || 0;
    const totalRecordExpenses = recordExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const totalDebit = (localRecord.sales.duitnow || 0);
    const totalCard = localRecord.sales.card || 0;
    const totalBank = (localRecord.sales.tng || 0) + totalDebit + totalCard + (localRecord.sales.amex || 0);
    
    const reconStatus = (localRecord as any).reconStatus || {};

    const handleDownloadPDF = async () => {
        if (!printRef.current) return;
        setIsGenerating(true);
        setTimeout(async () => {
            try {
                const canvas = await html2canvas(printRef.current!, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                
                // Calculate dynamic PDF height based on aspect ratio of the generated canvas to prevent bottom cropping
                const pdfWidth = 148; // Base width of A5 in mm
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                
                // Initialize jsPDF with the customized size [width, height]
                const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]); 
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                pdf.save(`Settlement_${localRecord.date}.pdf`);
            } catch (error) {
                console.error('PDF Generation Failed:', error);
                alert("生成 PDF 失败，请重试。");
            } finally {
                setIsGenerating(false);
            }
        }, 300);
    };

    const executeReconciliation = async (perfectMatch: boolean = false) => {
        if (!reconTarget) return;
        const targetExpected = reconTarget.expectedAmount;
        const actualNum = perfectMatch ? targetExpected : (parseFloat(reconActual) || 0);
        
        if (actualNum > targetExpected) {
            return alert("❌ 实收金额不能大于系统预估记账金额！");
        }

        const diff = Number((targetExpected - actualNum).toFixed(2));
        setIsProcessingRecon(true);

        try {
            if (diff > 0) {
                const isPlatform = ['grab', 'panda', 'shopee'].includes(reconTarget.key);
                const feeCategory = isPlatform ? 'MARKETING_FEE' : 'BANK_FEE';
                const feeLabel = isPlatform ? '广告/异常扣款' : '银行手续费';

                const expense: ExpenseItem = {
                    id: `recon_fee_${localRecord.id}_${reconTarget.key}_${Date.now()}`,
                    category: feeCategory, 
                    expenseType: 'GENERAL',
                    company: `${reconTarget.label} (${feeLabel})`,
                    amount: diff,
                    totalBillAmount: diff,
                    outstandingAmount: 0,
                    paymentStatus: 'PAID',
                    paymentMethod: 'BANK_TRANSFER', 
                    time: `${localRecord.date}T12:00:00.000Z`, 
                    createdAt: new Date().toISOString(), 
                    note: `[系统自动平账] 预期记账: ${targetExpected} | 实收: ${actualNum} | ${reconTarget.label}`,
                    paidBy: 'COMPANY'
                };
                await DataManager.saveStandaloneExpense(expense);
            }

            const updatedReconStatus = { ...reconStatus, [reconTarget.key]: actualNum };
            const updatedRecord = { ...localRecord, reconStatus: updatedReconStatus };
            
            await DataManager.updateSettlementReconStatus(localRecord.id, updatedReconStatus);
            setLocalRecord(updatedRecord as SettlementRecord);
            
            const matchText = perfectMatch ? '(完美对账)' : '';
            alert(`✅ ${reconTarget.label} 核对成功！${matchText}\n实际到账 RM ${actualNum.toFixed(2)}${diff > 0 ? `\n自动记入费用 RM ${diff.toFixed(2)}` : ''}`);
            setReconTarget(null);
            setReconActual('');
            onRefresh(); 
        } catch (e) {
            console.error(e);
            alert("核对失败，请重试");
        } finally {
            setIsProcessingRecon(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="bg-white w-full max-w-lg rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto flex flex-col custom-scrollbar relative pb-[max(16px,env(safe-area-inset-bottom))]">
                
                {/* 核销弹窗 UI */}
                {reconTarget && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-50 rounded-t-[2rem] sm:rounded-[2rem] p-6 flex flex-col items-center justify-center animate-in zoom-in-95">
                        <div className="bg-white p-6 rounded-3xl shadow-2xl border border-gray-200 w-full max-w-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-black text-lg text-blue-900 flex items-center gap-2"><ShieldCheck size={20}/> 银行入账核对</h4>
                                <button onClick={() => { setReconTarget(null); setReconActual(''); }} className="p-1 hover:bg-gray-100 rounded-full"><X size={16}/></button>
                            </div>
                            <p className="text-xs text-gray-500 font-bold mb-4">当前核对: <span className="text-[#1A1A1A]">{reconTarget.label}</span></p>
                            
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 space-y-1">
                                {reconTarget.grossAmount > reconTarget.expectedAmount && (
                                    <div className="flex justify-between text-[10px] font-bold text-gray-400 line-through">
                                        <span>原始账单/当班记账基数</span>
                                        <span>RM {reconTarget.grossAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-black text-blue-800">
                                    <span>预期银行到账金额</span>
                                    <span className="whitespace-nowrap">RM {reconTarget.expectedAmount.toFixed(2)}</span>
                                </div>
                            </div>

                            <button onClick={() => executeReconciliation(true)} disabled={isProcessingRecon} className="w-full py-3 mb-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-black shadow-md hover:from-green-600 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                {isProcessingRecon ? <Loader2 size={16} className="animate-spin"/> : <Zap size={16}/>}
                                完美无差额到账
                                <span className="text-[10px] font-bold opacity-80 ml-1 whitespace-nowrap">= RM {reconTarget.expectedAmount.toFixed(2)}</span>
                            </button>

                            <div className="relative flex items-center justify-center mb-4">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                <span className="relative bg-white px-3 text-[10px] font-bold text-gray-400 uppercase">或手动输入实际收到金额</span>
                            </div>

                            <div className="mb-6">
                                <label className="text-[10px] font-black text-blue-600 uppercase mb-2 block">Bank Received (银行实际到账)</label>
                                <input type="number" value={reconActual} onChange={e => setReconActual(e.target.value)} className="w-full p-4 bg-white border-2 border-blue-200 focus:border-blue-500 rounded-xl text-xl font-black font-mono outline-none shadow-inner" placeholder="0.00" />
                                {reconActual && parseFloat(reconActual) < reconTarget.expectedAmount && (
                                    <div className="mt-2 p-2 bg-pink-50 border border-pink-100 rounded-lg">
                                        <p className="text-[10px] text-pink-700 font-bold leading-relaxed">
                                            ⚠️ 差额 <span className="whitespace-nowrap">RM {(reconTarget.expectedAmount - parseFloat(reconActual)).toFixed(2)}</span> 将自动记为
                                            <span className="bg-pink-200 text-pink-900 px-1.5 py-0.5 rounded font-black mx-1 inline-block shadow-sm">
                                                {['grab','panda','shopee'].includes(reconTarget.key) ? '广告/平台调节费' : '银行手续费'}
                                            </span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button onClick={() => executeReconciliation(false)} disabled={!reconActual || isProcessingRecon} className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black shadow-md hover:bg-black disabled:opacity-50 flex justify-center items-center gap-2">
                                {isProcessingRecon ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                                确认实收并平账
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-center bg-[#1A1A1A] rounded-t-[2rem] sm:rounded-t-[2rem] sticky top-0 z-10">
                    <div>
                        <h3 className="font-black text-lg sm:text-xl text-[#FFD700]">结算单详情 (Receipt Details)</h3>
                        <p className="text-[10px] sm:text-xs text-gray-400 font-mono mt-1 font-bold tracking-widest">{localRecord.date} • {new Date(localRecord.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleDownloadPDF} disabled={isGenerating} className="p-2 bg-[#FFD700] text-black rounded-full hover:bg-white hover:text-black transition-colors shadow-lg disabled:opacity-50" title="导出为 PDF">
                            {isGenerating ? <Loader2 size={18} className="animate-spin"/> : <FileDown size={18}/>}
                        </button>
                        <button onClick={onClose} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20 hover:text-[#FFD700] transition-colors"><X size={18}/></button>
                    </div>
                </div>
                
                {/* 详情区：恢复没有任何 Cash/Bank 的%版本，但引入修改后的 ReconItem */}
                <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 bg-[#F8F9FA] flex-grow pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-end pb-4 border-b border-gray-100 gap-2 bg-[#FFD700]/10 p-4 rounded-xl border border-[#FFD700]/30">
                            <div>
                                <span className="text-xs font-black text-gray-600 uppercase tracking-widest leading-tight">Total Sales (核心总营业额)</span>
                                <p className="text-[10px] text-gray-400 font-bold mt-1">老板视角：已彻底挤干Grab账面水分</p>
                            </div>
                            <div className="flex items-baseline gap-1 text-[#1A1A1A] shrink-0 self-end sm:self-auto">
                                <span className="text-sm font-bold">RM</span>
                                <span className="text-2xl sm:text-3xl font-black font-mono tracking-tighter whitespace-nowrap">{localRecord.sales.total.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        {localRecord.sales.refundTotal && localRecord.sales.refundTotal > 0 ? (
                            <div className="flex justify-between items-center text-xs bg-red-50 p-3 rounded-xl border border-red-100 mb-2 gap-2">
                                <span className="flex items-center gap-2 text-red-600 font-bold shrink-0"><RotateCcw size={14}/> Refunds</span>
                                <span className="font-mono font-bold text-red-700 whitespace-nowrap shrink-0">- RM {localRecord.sales.refundTotal.toFixed(2)}</span>
                            </div>
                        ) : null}

                        <div className="flex justify-between items-center text-sm p-2 gap-2">
                            <span className="flex items-center gap-2 text-gray-600 font-bold shrink-0"><Banknote size={16} className="text-green-600"/> Cash (现金)</span>
                            <span className="font-mono font-bold text-[#1A1A1A] text-base sm:text-lg whitespace-nowrap shrink-0">RM {localRecord.sales.cash.toFixed(2)}</span>
                        </div>
                        
                        <div className="bg-blue-50/50 p-3 sm:p-4 rounded-xl space-y-2 border border-blue-100 overflow-hidden">
                            <p className="text-[10px] font-black text-blue-800 uppercase flex items-center gap-1.5"><CreditCard size={12}/> Digital & POS Payments</p>
                            <ReconItem label="TNG eWallet" gross={localRecord.sales.tng || 0} isReconciled={isChannelReconciled(reconStatus, 'tng')} actualAmount={getReconActual(reconStatus, 'tng')} onReconcile={() => setReconTarget({key: 'tng', label: 'TNG eWallet', expectedAmount: localRecord.sales.tng || 0, grossAmount: localRecord.sales.tng || 0})} />
                            <ReconItem label="Debit / DuitNow" gross={totalDebit} isReconciled={isChannelReconciled(reconStatus, 'debit')} actualAmount={getReconActual(reconStatus, 'debit')} onReconcile={() => setReconTarget({key: 'debit', label: 'Debit / DuitNow', expectedAmount: totalDebit, grossAmount: totalDebit})} />
                            <ReconItem label="Credit Card" gross={totalCard} isReconciled={isChannelReconciled(reconStatus, 'credit')} actualAmount={getReconActual(reconStatus, 'credit')} onReconcile={() => setReconTarget({key: 'credit', label: 'Credit Card', expectedAmount: totalCard, grossAmount: totalCard})} />
                            <ReconItem label="Amex" gross={localRecord.sales.amex || 0} isReconciled={isChannelReconciled(reconStatus, 'amex')} actualAmount={getReconActual(reconStatus, 'amex')} onReconcile={() => setReconTarget({key: 'amex', label: 'Amex', expectedAmount: localRecord.sales.amex || 0, grossAmount: localRecord.sales.amex || 0})} />
                        </div>

                        {totalDelivery > 0 && (
                            <div className="bg-orange-50/50 p-3 sm:p-4 rounded-xl space-y-2 border border-orange-100 overflow-hidden">
                                <div className="flex flex-wrap justify-between items-center border-b border-orange-100 pb-2 gap-1">
                                    <p className="text-[10px] font-black text-orange-800 uppercase flex items-center gap-1.5"><Truck size={12}/> Delivery Platforms</p>
                                    <span className="font-mono text-[10px] sm:text-xs font-black text-orange-800 whitespace-nowrap bg-orange-100/50 px-2 py-0.5 rounded">记账总额: RM {totalDelivery.toFixed(2)}</span>
                                </div>
                                <ReconItem label="GrabFood" gross={grabGross} net={grabNet} ads={grabAds} isReconciled={isChannelReconciled(reconStatus, 'grab')} actualAmount={getReconActual(reconStatus, 'grab')} onReconcile={() => setReconTarget({key: 'grab', label: 'GrabFood', expectedAmount: grabExpected, grossAmount: grabGross})} />
                                <ReconItem label="FoodPanda" gross={pandaGross} net={pandaNet} ads={pandaAds} isReconciled={isChannelReconciled(reconStatus, 'panda')} actualAmount={getReconActual(reconStatus, 'panda')} onReconcile={() => setReconTarget({key: 'panda', label: 'FoodPanda', expectedAmount: (deliveryBreakdown.pandaNet !== undefined ? pandaExpected : pandaGross), grossAmount: pandaGross})} />
                                {/* 🌟 修复：把拆分好的 net 和 ads 属性完美塞进 ShopeeFood 标签，对账期望改为 shopeeExpected */}
                                <ReconItem label="ShopeeFood" gross={shopeeGross} net={shopeeNet} ads={shopeeAds} isReconciled={isChannelReconciled(reconStatus, 'shopee')} actualAmount={getReconActual(reconStatus, 'shopee')} onReconcile={() => setReconTarget({key: 'shopee', label: 'ShopeeFood', expectedAmount: shopeeExpected, grossAmount: shopeeGross})} />
                            </div>
                        )}
                    </div>
                    
                    <div className={`flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 rounded-xl border-2 gap-2 ${localRecord.variance >= 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                        <div>
                            <span className="font-black uppercase tracking-widest text-xs block mb-1">Cash Variance</span>
                            {localRecord.varianceReason && <span className="text-[10px] text-gray-600 font-bold block sm:inline">{localRecord.varianceReason}</span>}
                        </div>
                        <span className="font-mono font-black text-2xl self-end sm:self-auto whitespace-nowrap">{localRecord.variance > 0 ? '+' : ''}{localRecord.variance.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={() => onUndoEdit(localRecord)} className="flex-[2] py-3.5 sm:py-4 bg-[#1A1A1A] border-2 border-[#1A1A1A] text-[#FFD700] rounded-2xl font-black text-sm hover:bg-black shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                            <RotateCcw size={18}/> 撤销并重新编辑 (Undo & Edit)
                        </button>
                        <button onClick={() => onDelete(localRecord.id)} className="flex-[1] py-3.5 sm:py-4 bg-white border-2 border-red-100 text-red-600 rounded-2xl font-black text-sm hover:bg-red-50 transition-all flex items-center justify-center gap-2 shadow-sm">
                            <Trash2 size={18}/> 仅删除
                        </button>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* 🌟 升级版：高颜值、呼吸感、高质感 P&L Slip 报表模板 🌟 */}
                {/* ========================================================= */}
                <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                    <div ref={printRef} className="w-[148mm] min-h-[210mm] bg-white p-8 font-sans text-gray-900 border box-border flex flex-col leading-relaxed">
                        
                        {/* 头部区域：拉开间距，规范流水号 */}
                        <div className="text-center border-b-2 border-gray-900 pb-5 mb-6 shrink-0">
                            <h1 className="text-2xl font-black tracking-widest uppercase text-gray-900 mb-1.5">KIM LIAN KEE</h1>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-100 inline-block px-3 py-1 rounded">Daily Settlement P&L Slip</p>
                            
                            <div className="mt-4 space-y-1 text-xs text-gray-600 font-mono">
                                <p className="font-bold">DATE/TIME: {localRecord.date} {new Date(localRecord.timestamp).toLocaleTimeString()}</p>
                                {/* 🌟 优化一：顺位顺序风格的流水号 (年月日-时分秒末尾) */}
                                <p className="text-gray-400">REF: {localRecord.date.replace(/-/g, '')}-{new Date(localRecord.timestamp).getTime().toString().slice(-4)}</p>
                            </div>
                        </div>

                        {/* 主体区块：加大 mb-6 间距，提升字里行间的呼吸感 */}
                        <div className="space-y-6 flex-grow text-xs">
                            
                            {/* 1. REVENUE SECTION (营业额板块) */}
                            <div className="space-y-3">
                                <h3 className="font-black border-b border-gray-900 pb-1.5 uppercase tracking-widest text-gray-900 text-xs">1. Revenue (营业额汇总)</h3>
                                
                                {/* 店内总收 */}
                                <div className="flex justify-between items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">
                                    <span className="font-black text-gray-800 uppercase tracking-wide">In-Store Total (店内总收)</span>
                                    <span className="font-mono font-black text-sm">RM {localRecord.sales.storeHubTotal.toFixed(2)}</span>
                                </div>
                                
                                {/* 店内明细：加大 py-1 间距，避免缩在一起 */}
                                <div className="pl-4 pr-2 space-y-1 text-gray-600 font-medium border-l border-gray-200 ml-1">
                                    <div className="flex justify-between items-center py-0.5"><span>• Cash (现金)</span><span className="font-mono font-bold">RM {localRecord.sales.cash.toFixed(2)}</span></div>
                                    <div className="flex justify-between items-center py-0.5"><span>• TNG eWallet</span><span className="font-mono">RM {(localRecord.sales.tng || 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between items-center py-0.5"><span>• Debit Card</span><span className="font-mono">RM {totalDebit.toFixed(2)}</span></div>
                                    <div className="flex justify-between items-center py-0.5"><span>• Credit Card</span><span className="font-mono">RM {totalCard.toFixed(2)}</span></div>
                                    {localRecord.sales.amex > 0 && <div className="flex justify-between items-center py-0.5"><span>• Amex</span><span className="font-mono">RM {(localRecord.sales.amex || 0).toFixed(2)}</span></div>}
                                </div>

                                {/* 外卖总计 */}
                                {totalDelivery > 0 && (
                                    <div className="space-y-2 mt-4">
                                        <div className="flex justify-between items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">
                                            <span className="font-black text-gray-800 uppercase tracking-wide">Delivery Platforms (外卖实收)</span>
                                            <span className="font-mono font-black text-sm">RM {totalDelivery.toFixed(2)}</span>
                                        </div>
                                        <div className="pl-4 pr-2 space-y-1.5 text-gray-600 font-medium border-l border-gray-200 ml-1">
                                            {grabGross > 0 && (
                                                <div className="flex justify-between items-center py-0.5">
                                                    <span>• GrabFood <span className="text-[10px] text-gray-400 font-normal">(Net: {grabNet.toFixed(1)} Ads: -{grabAds.toFixed(1)})</span></span>
                                                    <span className="font-mono font-bold">RM {grabExpected.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {pandaGross > 0 && (
                                                <div className="flex justify-between items-center py-0.5">
                                                    <span>• FoodPanda <span className="text-[10px] text-gray-400 font-normal">(Gross)</span></span>
                                                    <span className="font-mono font-bold">RM {pandaGross.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {shopeeGross > 0 && (
                                                <div className="flex justify-between items-center py-0.5">
                                                    <span>• ShopeeFood <span className="text-[10px] text-gray-400 font-normal">(Net: {shopeeNet.toFixed(1)} Ads: -{shopeeAds.toFixed(1)})</span></span>
                                                    <span className="font-mono font-bold">RM {shopeeExpected.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {Number(deliveryBreakdown.lalamove) > 0 && (
                                                <div className="flex justify-between items-center py-0.5">
                                                    <span>• Lalamove</span>
                                                    <span className="font-mono font-bold">RM {Number(deliveryBreakdown.lalamove).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* 挤干水分的总营业额：加大内边距 py-3 */}
                                <div className="flex justify-between items-center bg-gray-900 text-white px-4 py-3 rounded-xl shadow-sm mt-4">
                                    <span className="font-black uppercase tracking-wider text-xs">Total Net Revenue (挤干水分总计)</span>
                                    <span className="font-mono font-black text-base">RM {localRecord.sales.total.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* 2. CASH EXPENSES & WITHDRAWALS SECTION (临时支出与老板抽款) */}
                            <div className="space-y-3">
                                <h3 className="font-black border-b border-gray-900 pb-1.5 uppercase tracking-widest text-gray-900 text-xs">2. Cash Deductions (临时现金扣除)</h3>
                                
                                {recordWithdrawal > 0 && (
                                    <div className="flex justify-between items-center bg-orange-50 border border-orange-100 px-3 py-2 rounded-lg text-orange-950 font-bold">
                                        <span className="flex items-center gap-1">业主提支 (Owner's Drawings)</span>
                                        <span className="font-mono text-sm">- RM {recordWithdrawal.toFixed(2)}</span>
                                    </div>
                                )}

                                {totalRecordExpenses > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center bg-cyan-50 border border-cyan-100 px-3 py-2 rounded-lg text-cyan-950 font-bold">
                                            <span>当日钱箱现金支出 (Expenses)</span>
                                            <span className="font-mono text-sm">- RM {totalRecordExpenses.toFixed(2)}</span>
                                        </div>
                                        <div className="pl-4 pr-2 space-y-1.5 text-gray-500 font-mono bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                            {recordExpenses.map((e: any, idx: number) => (
                                                <div key={e.id || idx} className="flex justify-between items-center py-0.5 border-b border-gray-200/50 last:border-0">
                                                    <span>• {e.company || '未知商户'} — <span className="text-gray-400 font-sans">{e.item || '杂物'}</span></span>
                                                    <span className="font-bold text-gray-700">RM {Number(e.amount).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {recordWithdrawal === 0 && totalRecordExpenses === 0 && (
                                    <p className="text-xs text-gray-400 italic pl-1 py-1">今日无任何临时现金支出或业主提支</p>
                                )}
                            </div>

                            {/* 3. LIQUIDITY & EXPECTED BALANCE SECTION (最终钱箱应余) */}
                            <div className="space-y-3 pt-3 border-t-2 border-gray-900">
                                <h3 className="font-black border-b border-gray-300 pb-1.5 uppercase tracking-widest text-gray-400 text-[10px]">3. Cash Counter Balance (钱箱结余审计)</h3>
                                
                                <div className="space-y-2 text-gray-700 px-1 font-medium">
                                    <div className="flex justify-between items-center">
                                        <span>Opening Float (开班备用金)</span>
                                        <span className="font-mono font-bold">RM {localRecord.openingCash.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>+ Cash Sales (今日现金收入)</span>
                                        <span className="font-mono text-green-700 font-bold">+ RM {localRecord.sales.cash.toFixed(2)}</span>
                                    </div>
                                    {(recordWithdrawal > 0 || totalRecordExpenses > 0) && (
                                        <div className="flex justify-between items-center text-red-600">
                                            <span>- Total Cash Deductions (总扣除额)</span>
                                            <span className="font-mono font-bold">- RM {(recordWithdrawal + totalRecordExpenses).toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-between items-center bg-gray-100 border border-gray-300 px-3 py-2.5 rounded-lg text-gray-900 font-black">
                                    <span>Expected Cash Balance (系统理论应余)</span>
                                    <span className="font-mono text-sm">
                                        RM {(localRecord.openingCash + localRecord.sales.cash - recordWithdrawal - totalRecordExpenses).toFixed(2)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg font-bold text-gray-800">
                                    <span>Actual Closing Cash (钱箱实际点算)</span>
                                    <span className="font-mono text-sm text-gray-900">RM {localRecord.closingCash.toFixed(2)}</span>
                                </div>

                                <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-dashed border-gray-900 bg-gray-50 p-3 rounded-xl">
                                    <span className="font-black uppercase tracking-widest text-xs text-gray-950">Cash Variance (对账差异)</span>
                                    <span className={`font-mono font-black text-base ${localRecord.variance === 0 ? 'text-gray-900' : localRecord.variance > 0 ? 'text-green-700' : 'text-red-600'}`}>
                                        {localRecord.variance > 0 ? '+' : ''}{localRecord.variance.toFixed(2)}
                                    </span>
                                </div>
                                {localRecord.varianceReason && (
                                    <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 mt-2">
                                        <p className="text-[11px] text-red-700 leading-normal font-medium"><span className="font-black uppercase">Reason:</span> {localRecord.varianceReason}</p>
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* 页脚区域：略微增加上边距 */}
                        <div className="mt-8 pt-4 text-center border-t border-gray-200 shrink-0">
                            <p className="text-[9px] font-bold text-gray-700 uppercase tracking-widest mb-0.5">System Generated Report</p>
                            <p className="text-[8px] text-gray-400 font-mono">ERP System • Internal Audit Document</p>
                        </div>
                    </div>
                </div>
                {/* ========================================================= */}
            </div>
        </div>
    );
};

export const SettlementModule: React.FC<SettlementModuleProps> = ({ storeConfig, onClose, isStandalone = true }) => {
    const [activeTab, setActiveTab] = useState<'SHIFT' | 'HISTORY'>('SHIFT');
    const [isShiftOpen, setIsShiftOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [openingTotal, setOpeningTotal] = useState<number>(0);
    const [businessDate, setBusinessDate] = useState<string>(getBusinessDateStr(storeConfig.businessDayCutoff || 4));
    
    // 🌟 核心数据模型更新：追加 grab 与 shopee 与 panda 的 Gross/Net/Ads 拆分
    const [salesData, setSalesData] = useState({
        storeHubTotal: 0, refundTotal: 0, cash: 0, tng: 0, duitnow: 0, card: 0, amex: 0, 
        grabGross: 0, grabNet: 0, grabAds: 0, 
        pandaGross: 0, pandaNet: 0, pandaAds: 0, // 👈 新增分拆 FoodPanda
        shopeeGross: 0, shopeeNet: 0, shopeeAds: 0, // 👈 新增分拆
        lalamove: 0,
        // Legacy fields mapping
        grab: 0, panda: 0, shopee: 0
    });

    const [closingCashInput, setClosingCashInput] = useState<number>(0);
    const [varianceReason, setVarianceReason] = useState<string>('');
    
    // 🌟 新增：当日 Expected Cash 临时支出列表 (不连外部，仅当班记录)
    const [dayExpenses, setDayExpenses] = useState<{ id: string; company: string; item: string; amount: number }[]>([]);
    // 🌟 新增：老板提早抽走的大额现金
    const [ownerWithdrawal, setOwnerWithdrawal] = useState<number>(0);
    
    // 🌟 新增：添加一行支出的快捷方法
    const handleAddDayExpense = () => {
        setDayExpenses([...dayExpenses, { id: `day_exp_${Date.now()}`, company: '', item: '', amount: 0 }]);
    };
    // 🌟 新增：删除某行支出的快捷方法
    const handleRemoveDayExpense = (id: string) => {
        setDayExpenses(dayExpenses.filter(exp => exp.id !== id));
    };
    // 🌟 新增：更新支出内容的快捷方法
    const handleUpdateDayExpense = (id: string, field: 'company' | 'item' | 'amount', value: any) => {
        setDayExpenses(dayExpenses.map(exp => exp.id === id ? { ...exp, [field]: value } : exp));
    };

    const [historyRecords, setHistoryRecords] = useState<SettlementRecord[]>([]);
    const [filterMonth, setFilterMonth] = useState<string>(new Date().toISOString().slice(0, 7)); 
    const [selectedRecord, setSelectedRecord] = useState<SettlementRecord | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => { loadData(); }, []);
    useEffect(() => { if (activeTab === 'HISTORY') loadHistory(); }, [activeTab, filterMonth]);
    
    const loadData = async () => {
        setIsLoading(true);
        try {
            const shift = await DataManager.getActiveShift();

            if (shift) {
                setBusinessDate(shift.businessDate || getBusinessDateStr(storeConfig.businessDayCutoff || 4));
                
                const savedCounts = shift.openingCounts || {};
                const savedCoins = shift.openingCoins || 0;
                const calcTotal = Object.entries(savedCounts).reduce((acc, [val, count]) => acc + (parseInt(val) * (Number(count) || 0)), 0) + Number(savedCoins);
                setOpeningTotal(shift.openingTotal ?? calcTotal);
                
                const savedSales = shift.salesData || {};
                setSalesData({
                    storeHubTotal: savedSales.storeHubTotal || 0, refundTotal: savedSales.refundTotal || 0, 
                    cash: savedSales.cash || 0, tng: savedSales.tng || 0, duitnow: savedSales.duitnow || 0, 
                    card: savedSales.card || 0, amex: savedSales.amex || 0, 
                    grabGross: savedSales.grabGross || 0,
                    grabNet: savedSales.grabNet !== undefined ? savedSales.grabNet : (savedSales.grab || 0),
                    grabAds: savedSales.grabAds || 0,
                    pandaGross: savedSales.pandaGross || savedSales.panda || 0,
                    pandaNet: savedSales.pandaNet !== undefined ? savedSales.pandaNet : (savedSales.panda || 0),
                    pandaAds: savedSales.pandaAds || 0,
                    shopeeGross: savedSales.shopeeGross || 0,
                    shopeeNet: savedSales.shopeeNet !== undefined ? savedSales.shopeeNet : (savedSales.shopee || 0), // 👈 新增
                    shopeeAds: savedSales.shopeeAds || 0, // 👈 新增
                    lalamove: savedSales.lalamove || 0,
                    grab: savedSales.grab || 0, panda: savedSales.panda || 0, shopee: savedSales.shopee || 0
                });
                
                setClosingCashInput(shift.closingCashInput || 0);
                setVarianceReason(shift.varianceReason || '');
                if (shift.dayExpenses) setDayExpenses(shift.dayExpenses);
                if (shift.ownerWithdrawal !== undefined) setOwnerWithdrawal(shift.ownerWithdrawal);
                setIsShiftOpen(true);
            } else {
                setBusinessDate(getBusinessDateStr(storeConfig.businessDayCutoff || 4));
            }
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };

    const loadHistory = async () => {
        setIsLoading(true);
        const records = await DataManager.getSettlements(filterMonth);
        records.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistoryRecords(records);
        setIsLoading(false);
    };

    useEffect(() => {
        if (isShiftOpen && !isLoading && !isSubmitting && activeTab === 'SHIFT') {
            const shiftData = {
                businessDate: businessDate || getBusinessDateStr(4),
                openingTotal, salesData, 
                closingCashInput, varianceReason: varianceReason || '',
                dayExpenses, ownerWithdrawal,
                updatedAt: new Date().toISOString()
            };
            DataManager.saveActiveShift(shiftData);
        }
    }, [isShiftOpen, businessDate, openingTotal, salesData, closingCashInput, varianceReason, dayExpenses, ownerWithdrawal, isLoading, activeTab, isSubmitting]);

    // 🌟 核心计算引擎：自动化求和并剔除外卖水分
    const totals = useMemo(() => {
        const s = salesData;
        // 1. 自动汇总 POS 渠道作为 storeHubTotal
        const posSales = (Number(s.cash)||0) + (Number(s.tng)||0) + (Number(s.duitnow)||0) + (Number(s.card)||0) + (Number(s.amex)||0);
        const storeHubTotal = posSales; // 👈 自动求和，不再依赖手动输入
        
        // 2. 扣除广告费后的 Grab(实收) + Panda(实收) + Shopee(实收)
        const grabVal = (Number(s.grabNet) || 0) - (Number(s.grabAds) || 0); // Grab(实收)
        const shopeeVal = (Number(s.shopeeNet) || 0) - (Number(s.shopeeAds) || 0); // Shopee(实收)
        const pandaVal = s.pandaNet !== undefined ? ((Number(s.pandaNet) || 0) - (Number(s.pandaAds) || 0)) : (Number(s.pandaGross) || 0); // FoodPanda(实收)
        const deliverySales = grabVal + pandaVal + shopeeVal + (Number(s.lalamove)||0);
        
        const totalRevenue = posSales + deliverySales;
        
        // 🌟 核心计算更新：汇总当班所有的临时现金支出
        const totalDayExpenses = dayExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
        
        // 🌟 业主视角新公式：应余现金 = 开班现金 + 今日现金营业额 - 临时支出 - 业主提支
        const expectedCash = Number(openingTotal) + Number(s.cash || 0) - totalDayExpenses - Number(ownerWithdrawal); 
        
        const variance = Number(closingCashInput) - expectedCash;
        const salesVariance = 0; 
        return { posSales, deliverySales, totalRevenue, expectedCash, variance, storeHubTotal, salesVariance, totalDayExpenses };
    }, [openingTotal, salesData, closingCashInput, dayExpenses, ownerWithdrawal]); // 👈 别忘了追加依赖项

    const handleStartShift = () => {
        if (openingTotal <= 0 && !confirm("点算总额为 RM 0，确定开班吗？")) return;
        setIsShiftOpen(true);
    };

    const handleDeleteClick = (id: string) => setShowDeleteConfirm(true);

    const executeDeleteRecord = async () => {
        if (!selectedRecord) return;
        setIsLoading(true);
        try {
            await DataManager.deleteSettlement(selectedRecord.id);
            const records = await DataManager.getSettlements(filterMonth);
            setHistoryRecords(records);
            setShowDeleteConfirm(false);
            setSelectedRecord(null); 
            alert("✅ 记录已删除");
        } catch(e) { console.error(e); alert("Delete Failed"); } finally { setIsLoading(false); }
    };

    const handleUndoAndEdit = async (record: SettlementRecord) => {
        if (!confirm(`⚠️ 确定要撤销并重新编辑 ${record.date} 的结算吗？\n\n系统将删除该历史记录，并把所有数据反填恢复到当班表单中供您修改。`)) return;
        setIsLoading(true);
        try {
            await DataManager.deleteSettlement(record.id);
            setBusinessDate(record.date);
            setOpeningTotal(record.openingCash); 
            
            const bd = record.sales.deliveryBreakdown as any || {};
            setSalesData({
                storeHubTotal: record.sales.storeHubTotal || 0,
                refundTotal: record.sales.refundTotal || 0,
                cash: record.sales.cash || 0, tng: record.sales.tng || 0,
                duitnow: record.sales.duitnow || 0, card: record.sales.card || 0, amex: record.sales.amex || 0,
                grabGross: bd.grabGross || 0,
                grabNet: bd.grabNet !== undefined ? bd.grabNet : (bd.grab || 0),
                grabAds: bd.grabAds || 0,
                pandaGross: bd.pandaGross || bd.panda || 0,
                pandaNet: bd.pandaNet !== undefined ? bd.pandaNet : (bd.panda || 0),
                pandaAds: bd.pandaAds || 0,
                shopeeGross: bd.shopeeGross || 0,
                shopeeNet: bd.shopeeNet !== undefined ? bd.shopeeNet : (bd.shopee || 0), // 👈 新增
                shopeeAds: bd.shopeeAds || 0, // 👈 新增
                lalamove: bd.lalamove || 0,
                grab: 0, panda: 0, shopee: 0
            });
            
            setClosingCashInput(record.closingCash || 0);
            setVarianceReason(record.varianceReason || '');
            setOwnerWithdrawal(record.ownerWithdrawal || 0);
            setDayExpenses(record.dayExpenses || []);
            
            setIsShiftOpen(true);
            setActiveTab('SHIFT');
            setSelectedRecord(null);
            
            const updatedHistory = await DataManager.getSettlements(filterMonth);
            setHistoryRecords(updatedHistory);
            
            alert("✅ 撤销成功！数据已完全恢复，请直接修改您需要调整的金额。");
        } catch(e) { console.error(e); alert("撤销失败，请检查网络 (Undo Failed)"); } finally { setIsLoading(false); }
    };

    const handleSubmitSettlement = async () => {
        setIsSubmitting(true);
        const isDuplicate = await DataManager.checkSettlementExists(businessDate);
        if (isDuplicate) {
             alert(`📅 日期 ${businessDate} 已经结算过了！\n若需重新提交，请先在"历史"页面撤销旧记录。`);
             setIsSubmitting(false); return;
        }
        if (!confirm(`⚠️ 确认提交结算？\n日期: ${businessDate}\n记账总额 (真实水分已挤干): RM ${totals.totalRevenue.toFixed(2)}`)) {
            setIsSubmitting(false); return;
        }
        
        const record: SettlementRecord = {
            id: `settle_${businessDate}_${Date.now()}`, date: businessDate, timestamp: new Date().toISOString(),
            openingCash: openingTotal, closingCash: closingCashInput,
            sales: {
                total: totals.totalRevenue, storeHubTotal: totals.storeHubTotal, refundTotal: salesData.refundTotal || 0,
                cash: salesData.cash || 0, tng: salesData.tng || 0, duitnow: salesData.duitnow || 0, 
                card: salesData.card || 0, amex: salesData.amex || 0,
                deliveryBreakdown: {
                    grabGross: salesData.grabGross || 0, grabNet: salesData.grabNet || 0, grabAds: salesData.grabAds || 0,
                    grab: (salesData.grabNet || 0) - (salesData.grabAds || 0),       
                    pandaGross: salesData.pandaGross || 0,
                    pandaNet: salesData.pandaNet || 0,
                    pandaAds: salesData.pandaAds || 0,
                    panda: (salesData.pandaNet || 0) - (salesData.pandaAds || 0),     
                    shopeeGross: salesData.shopeeGross || 0,
                    shopeeNet: salesData.shopeeNet || 0, // 👈 新增
                    shopeeAds: salesData.shopeeAds || 0, // 👈 新增
                    shopee: (salesData.shopeeNet || 0) - (salesData.shopeeAds || 0), // 👈 存放计算后净值兼容旧版本
                    lalamove: salesData.lalamove || 0
                }
            },
            expenses: [], // 保持原样不改动外部接口
            variance: totals.variance, varianceReason: varianceReason,
            submittedBy: 'Manager', isClosed: true,
            // 🌟 扩展保存当班本地临时数据，用于后续 PDF 和 PL 报表展示
            dayExpenses: dayExpenses, 
            ownerWithdrawal: ownerWithdrawal,
            reconStatus: { tng: false, debit: false, credit: false, amex: false, grab: false, panda: false, shopee: false } as any
        };
        
        try {
            await DataManager.executeSettlementTransaction(record);
            setBusinessDate(getBusinessDateStr(storeConfig.businessDayCutoff || 4));
            setOpeningTotal(0);
            setSalesData({ storeHubTotal: 0, refundTotal: 0, cash: 0, tng: 0, duitnow: 0, card: 0, amex: 0, grabGross: 0, grabNet: 0, grabAds: 0, pandaGross: 0, pandaNet: 0, pandaAds: 0, shopeeGross: 0, shopeeNet: 0, shopeeAds: 0, lalamove: 0, grab: 0, panda: 0, shopee: 0 });
            setClosingCashInput(0); setVarianceReason('');
            setOwnerWithdrawal(0);
            setDayExpenses([]);
            setIsShiftOpen(false);
            alert("✅ 结算成功！数据已转入历史记录，请移步历史列表进行数字对账。");
            setActiveTab('HISTORY'); loadHistory();
        } catch (error: any) { 
            console.error("Settlement Error", error); 
            if (error.message.includes('DATE_ALREADY_SETTLED')) alert("❌ 提交被拦截：该日期刚刚已被其他设备结算！");
            else alert("❌ 提交失败，请检查网络后重试"); 
        } finally { setIsSubmitting(false); }
    };

    const handleForceToday = () => {
        const todayStr = getCalendarTodayStr();
        if(businessDate !== todayStr && confirm(`确定将日期修改为今天 (${todayStr}) 吗？`)) setBusinessDate(todayStr);
    };

    const renderSummarySection = () => (
        <div className="bg-[#1A1A1A] p-6 text-white shadow-2xl flex flex-col justify-between shrink-0 rounded-[2rem] md:rounded-none md:rounded-l-[2rem] h-auto overflow-visible md:h-full md:overflow-y-auto select-none">
            <div className="space-y-6">
                <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest flex items-center gap-2"><Calculator size={18}/> 现金对账 (Reconciliation)</h3>
                <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Opening Float</span><span className="font-mono text-[#FFD700]">RM {openingTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Cash Sales</span><span className="font-mono text-green-400">+ RM {(salesData?.cash || 0).toFixed(2)}</span></div>
                    
                    {/* 🌟 1. 业主提支 (Owner's Drawings) - 极简高雅重构 */}
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block font-sans">业主提支 (Owner's Drawings)</label>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-450 font-black text-xs font-sans">RM</span>
                            <input 
                                type="number" 
                                placeholder="0.00 (提取今日营业款)" 
                                className="w-full bg-black/60 border border-orange-500/25 rounded-xl p-3.5 pl-10 text-xs font-mono font-black text-orange-350 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all min-h-[44px]" 
                                value={ownerWithdrawal || ''} 
                                onChange={e => setOwnerWithdrawal(parseFloat(e.target.value) || 0)} 
                            />
                        </div>
                    </div>

                    {/* 🌟 2. 临时支出项目 (买杂物/动态新增) —— 换成红色专业英文支出 (CASH EXPENSES) */}
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center bg-transparent">
                            <div className="flex flex-col">
                                <span className="text-xs font-black text-red-500 tracking-wider">当日钱箱支出</span>
                                <span className="text-[10px] font-black text-red-400/80 uppercase tracking-widest font-mono">CASH EXPENSES</span>
                            </div>
                            <button 
                                onClick={handleAddDayExpense} 
                                className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 font-semibold px-3 py-1.5 rounded-xl active:bg-red-500/40 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 hover:bg-red-500/30"
                            >
                                + 新增支出
                            </button>
                        </div>
                        
                        {dayExpenses.map((exp) => (
                            <div key={exp.id} className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-2 animate-in slide-in-from-top-1 duration-150 relative">
                                <div className="grid grid-cols-2 gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="公司/商户名" 
                                        className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-red-500 min-h-[40px] focus:ring-1 focus:ring-red-500/20" 
                                        value={exp.company} 
                                        onChange={e => handleUpdateDayExpense(exp.id, 'company', e.target.value)} 
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="购买内容" 
                                        className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-red-500 min-h-[40px] focus:ring-1 focus:ring-red-500/20" 
                                        value={exp.item} 
                                        onChange={e => handleUpdateDayExpense(exp.id, 'item', e.target.value)} 
                                    />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs text-red-400/50">RM</span>
                                        <input 
                                            type="number" 
                                            placeholder="金额" 
                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 pl-9 text-xs font-mono text-red-400 outline-none focus:border-red-500 min-h-[40px] focus:ring-1 focus:ring-red-500/20 font-black" 
                                            value={exp.amount || ''} 
                                            onChange={e => handleUpdateDayExpense(exp.id, 'amount', parseFloat(e.target.value) || 0)} 
                                        />
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveDayExpense(exp.id)} 
                                        className="w-[44px] h-[40px] flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 active:scale-95 transition-all cursor-pointer"
                                        aria-label="删除"
                                    >
                                        <X size={16}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {dayExpenses.length > 0 && (
                            <div className="flex justify-between text-[10px] text-gray-400 px-1 pt-0.5">
                                <span>支出汇总:</span>
                                <span className="font-mono text-red-400 font-extrabold">- RM {totals.totalDayExpenses.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="flex justify-between items-center"><span className="text-xs font-black text-[#FFD700] uppercase">Expected Cash</span><span className="text-xl font-mono font-black text-white">RM {totals.expectedCash.toFixed(2)}</span></div>
                </div>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/10 relative">
                    <label className="text-[10px] font-black text-[#FFD700] uppercase block mb-3 text-center tracking-widest">钱箱实际结余 (Actual Closing Cash)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-black text-2xl">RM</span>
                        <input type="number" value={closingCashInput || ''} onChange={e => setClosingCashInput(parseFloat(e.target.value) || 0)} className="w-full p-4 pl-14 bg-black/40 border-2 border-[#FFD700]/30 rounded-2xl text-center font-black text-4xl text-white outline-none focus:border-[#FFD700] transition-all shadow-inner" placeholder="0.00" />
                    </div>
                    <div className={`mt-4 p-3 rounded-xl text-center border transition-all ${totals.variance >= 0 ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1">现金差异 (Variance)</p>
                        <p className="text-xl font-black font-mono">RM {totals.variance.toFixed(2)}</p>
                    </div>
                </div>
                {Math.abs(totals.variance) > 0.5 && (
                    <div className="animate-in slide-in-from-bottom-2">
                        <label className="text-[10px] font-black text-red-400 uppercase block mb-2 flex items-center gap-2"><AlertCircle size={12}/> 差异说明 (Reason)</label>
                        <textarea value={varianceReason} onChange={e => setVarianceReason(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-white/30 focus:border-red-400 outline-none h-20 resize-none" placeholder="请输入原因 (e.g. 找赎错误)..."/>
                    </div>
                )}
            </div>
            <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
                <div className="flex justify-between items-end">
                    <div><p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Total Sales (已去水分)</p><p className="text-2xl font-black font-mono text-[#FFD700]">RM {totals.totalRevenue.toFixed(2)}</p></div>
                    <div><p className="text-[9px] text-gray-500 uppercase font-black tracking-widest text-right">POS Sales Only</p><p className="text-lg font-black font-mono text-white text-right">RM {totals.posSales.toFixed(2)}</p></div>
                </div>
                <button onClick={handleSubmitSettlement} disabled={isSubmitting} className="w-full py-4 bg-[#FFD700] text-black rounded-2xl font-black text-lg shadow-[0_10px_30px_rgba(255,215,0,0.3)] hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isSubmitting ? <Loader2 size={24} className="animate-spin"/> : <Check size={24} strokeWidth={4}/>}
                    {isSubmitting ? '提交中...' : '完成结算 (Submit)'}
                </button>
            </div>
        </div>
    );

    return (
        <div className={isStandalone ? "fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200" : "w-full h-full flex flex-col relative animate-in fade-in"}>
            <div className={isStandalone ? "bg-[#F5F7FA] w-full h-[100dvh] md:max-w-7xl md:h-[95vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl font-sans relative" : "flex-grow flex flex-col overflow-hidden font-sans relative"}>
                <div className="bg-[#1A1A1A] px-4 py-3 md:py-4 pt-[max(env(safe-area-inset-top,12px),12px)] flex items-center justify-between text-white shrink-0 border-b-4 border-[#FFD700] relative z-50 shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD700] text-black p-2 rounded-xl shadow-lg shrink-0"><Calculator size={20} className="md:w-6 md:h-6"/></div>
                        <div><h3 className="font-serif font-black text-sm md:text-xl tracking-wide">每日结算中心</h3><p className="text-[8px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">SETTLEMENT & CASH CONTROL</p></div>
                    </div>
                    <div className="flex items-center gap-2 relative z-50">
                        <div className="hidden md:flex bg-white/10 p-1 rounded-xl justify-center cursor-pointer relative z-50">
                            <button onClick={() => setActiveTab('SHIFT')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap relative z-50 ${activeTab === 'SHIFT' ? 'bg-[#FFD700] text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}>当班 (Shift)</button>
                            <button onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap relative z-50 ${activeTab === 'HISTORY' ? 'bg-[#FFD700] text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}>历史 (History)</button>
                        </div>
                        <div className="flex gap-2 relative z-50 items-center">
                            <ModuleGuideButton module="SETTLEMENT" />
                            {onClose && (
                                <button 
                                    onClick={onClose} 
                                    className="w-[44px] h-[44px] flex items-center justify-center bg-white/10 active:bg-red-600 rounded-xl transition-colors text-white relative z-50 cursor-pointer shadow-sm" 
                                    title="关闭/退出 (Exit)"
                                >
                                    <X size={20}/>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-hidden bg-[#F5F7FA]">
                    {activeTab === 'SHIFT' ? (
                        !isShiftOpen ? (
                            <div className="h-full overflow-y-auto bg-[#F5F7FA]">
                                <div className="min-h-full p-4 md:p-6 flex flex-col items-center justify-center">
                                    <div className="max-w-xs sm:max-w-md w-full bg-white p-5 md:p-8 rounded-3xl shadow-lg text-center border-t-8 border-[#FFD700]">
                                        <Power size={48} className="mx-auto text-gray-200 mb-4 md:mb-6"/>
                                        <h2 className="text-xl md:text-2xl font-black text-[#1A1A1A] mb-1 md:mb-2">准备开班?</h2>
                                        <div className="mb-4 md:mb-6 bg-gray-50 p-3 md:p-4 rounded-2xl border border-gray-100">
                                            <label className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest flex items-center gap-2 justify-center"><Calendar size={12}/> 营业日期 (Business Date)</label>
                                            <div className="flex items-center gap-2">
                                                <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="w-full p-2.5 md:p-3 bg-white border-2 border-gray-200 rounded-xl font-black text-[#1A1A1A] outline-none focus:border-[#FFD700] text-center text-base md:text-lg shadow-sm min-h-[44px]"/>
                                                <button onClick={handleForceToday} className="w-[44px] h-[44px] flex items-center justify-center bg-white border-2 border-gray-200 rounded-xl hover:border-[#FFD700] hover:text-[#FFD700] transition-colors"><RotateCcw size={18}/></button>
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 p-4 md:p-6 rounded-2xl mb-6 md:mb-8 border border-gray-100 text-left">
                                            <label className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">开班现金金额 (Opening Float)</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl md:text-2xl">RM</span>
                                                <input type="number" value={openingTotal || ''} onChange={e => setOpeningTotal(parseFloat(e.target.value) || 0)} className="w-full pl-12 pr-4 py-3 md:py-4 bg-white border-2 border-gray-200 rounded-xl font-mono text-2xl md:text-3xl font-black text-[#1A1A1A] outline-none focus:border-[#FFD700] transition-all shadow-sm min-h-[48px]" placeholder="0.00" />
                                            </div>
                                        </div>
                                        <button onClick={handleStartShift} className="w-full bg-[#FFD700] active:bg-yellow-500 text-black py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"><Play size={18} fill="currentColor"/> 确认开班 (Start)</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col md:flex-row overflow-hidden animate-in fade-in">
                                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                                    <div className="flex justify-between items-end border-b pb-4 border-gray-200">
                                        <div><h2 className="text-2xl font-black text-[#1A1A1A]">{new Date(businessDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</h2><p className="text-xs font-bold text-gray-400">Business Date (Settlement Date)</p></div>
                                        <div className="text-right"><p className="text-[10px] font-bold text-gray-400 uppercase">Opening Float</p><p className="text-lg font-mono font-black text-blue-600">RM {openingTotal.toFixed(2)}</p></div>
                                    </div>
                                    
                                    {/* 📦 StoreHub POS Total - 极简高雅栏目（右侧直接显示金额，已去除退款记录） */}
                                    <div className="bg-blue-50/65 p-4 rounded-2xl border border-blue-150/80 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-1.5 h-6 rounded-full bg-blue-600 shrink-0"></div>
                                            <div>
                                                <label className="text-xs font-black text-blue-900 uppercase block tracking-wider font-sans">StoreHub POS Total</label>
                                                <p className="text-[9px] text-blue-500 font-black mt-1 uppercase tracking-wider">系统已自动求和 (Auto Calculated)</p>
                                            </div>
                                        </div>
                                        <div className="font-mono text-xl sm:text-2xl font-black text-blue-950 whitespace-nowrap">
                                            RM {totals.storeHubTotal.toFixed(2)}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                                            <h4 className="text-xs font-bold text-[#1A1A1A] uppercase border-b pb-3 mb-3">POS Payment Methods (In-Store)</h4>
                                            
                                            {/* Cash (现金) */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 shrink-0 shadow-sm border border-green-200/50 group-hover:scale-105 transition-transform"><Banknote size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Cash (现金)</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-green-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-green-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.cash || ''} 
                                                        onChange={e => setSalesData({...salesData, cash: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* TNG eWallet */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-605 shrink-0 shadow-sm border border-cyan-200/50 group-hover:scale-105 transition-transform"><Wallet size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">TNG eWallet</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-cyan-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-cyan-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.tng || ''} 
                                                        onChange={e => setSalesData({...salesData, tng: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Debit Card */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm border border-indigo-200/50 group-hover:scale-105 transition-transform"><CreditCard size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Debit Card</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-indigo-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.duitnow || ''} 
                                                        onChange={e => setSalesData({...salesData, duitnow: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Credit Card */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-650 shrink-0 shadow-sm border border-purple-200/50 group-hover:scale-105 transition-transform"><CreditCard size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Credit Card</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-purple-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-purple-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.card || ''} 
                                                        onChange={e => setSalesData({...salesData, card: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Amex */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 shadow-sm border border-blue-200/50 group-hover:scale-105 transition-transform"><CreditCard size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Amex</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-blue-450 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.amex || ''} 
                                                        onChange={e => setSalesData({...salesData, amex: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            <div className="pt-3 mt-3 border-t border-gray-100 flex justify-between items-center text-xs font-bold"><span>POS Total</span><span className="font-mono text-blue-600 text-base">RM {totals.posSales.toFixed(2)}</span></div>
                                        </div>
                                        
                                        <div className="space-y-3 bg-orange-50/50 p-5 rounded-3xl border border-orange-100 shadow-sm">
                                            <div className="flex justify-between items-center border-b border-orange-200 pb-3 mb-3">
                                                <h4 className="text-xs font-bold text-orange-800 uppercase">Delivery Platforms</h4>
                                            </div>
                                            
                                            {/* 🌟 GRAB专属三列输入区域 - 美化 */}
                                            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-green-200/60 mb-4 shadow-sm animate-in fade-in-50">
                                                <div className="flex justify-between items-center mb-2 px-1">
                                                    <span className="text-xs font-black text-green-700 font-sans">GrabFood (精确记账)</span>
                                                    <span className="text-[9px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Auto Calc</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">原价 (Gross)</label>
                                                        <input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-green-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-green-100 shadow-inner min-h-[44px] tabular-nums" 
                                                            value={salesData.grabGross || ''} 
                                                            onChange={e => setSalesData({...salesData, grabGross: parseFloat(e.target.value) || 0})} 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">净额 (Net)</label>
                                                        <input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-green-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-green-100 shadow-inner min-h-[44px] tabular-nums" 
                                                            value={salesData.grabNet || ''} 
                                                            onChange={e => setSalesData({...salesData, grabNet: parseFloat(e.target.value) || 0})} 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-orange-500 block mb-1 text-center">广告 (Ads)</label>
                                                        <input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner text-orange-600 min-h-[44px] tabular-nums" 
                                                            value={salesData.grabAds || ''} 
                                                            onChange={e => setSalesData({...salesData, grabAds: parseFloat(e.target.value) || 0})} 
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 🌟 Panda / Shopee 极简与三列模式 */}
                                            <div className="space-y-4">
                                                {/* 🌟 FoodPanda 三列高精准输入区域 - 美化 */}
                                                <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-pink-200 shadow-sm animate-in fade-in-50">
                                                    <div className="flex justify-between items-center mb-2 px-1">
                                                        <span className="text-xs font-black text-pink-700 font-sans">FoodPanda (精确记账)</span>
                                                        <span className="text-[9px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Net to Sum</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">原价 (Gross)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-pink-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-pink-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.pandaGross || ''} 
                                                                onChange={e => setSalesData({...salesData, pandaGross: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">净额 (Net)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-pink-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-pink-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.pandaNet || ''} 
                                                                onChange={e => setSalesData({...salesData, pandaNet: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-pink-500 block mb-1 text-center">广告 (Ads)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-pink-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-pink-100 shadow-inner text-pink-600 min-h-[44px] tabular-nums" 
                                                                value={salesData.pandaAds || ''} 
                                                                onChange={e => setSalesData({...salesData, pandaAds: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 🌟 ShopeeFood 三列高精准输入区域 - 美化 */}
                                                <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-200 shadow-sm animate-in fade-in-50">
                                                    <div className="flex justify-between items-center mb-2 px-1">
                                                        <span className="text-xs font-black text-orange-700 font-sans">ShopeeFood (精确记账)</span>
                                                        <span className="text-[9px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Net to Sum</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">原价 (Gross)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.shopeeGross || ''} 
                                                                onChange={e => setSalesData({...salesData, shopeeGross: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">净额 (Net)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.shopeeNet || ''} 
                                                                onChange={e => setSalesData({...salesData, shopeeNet: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-orange-500 block mb-1 text-center">广告 (Ads)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner text-orange-600 min-h-[44px] tabular-nums" 
                                                                value={salesData.shopeeAds || ''} 
                                                                onChange={e => setSalesData({...salesData, shopeeAds: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Lalamove - 美化 */}
                                            <div className="flex items-center gap-3 pt-3 border-t border-orange-100/50 mt-3">
                                                <div className="w-[100px] shrink-0 border-2 rounded-xl py-2.5 flex items-center justify-center shadow-sm text-blue-700 bg-blue-50 border-blue-100 font-extrabold text-xs">
                                                    Lalamove
                                                </div>
                                                <div className="flex-1 relative">
                                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="填入实收到账 (Net)" 
                                                        className="w-full p-3 pl-10 bg-gray-50 border border-gray-200 focus:border-blue-400 rounded-xl text-right font-mono font-black text-base text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 shadow-inner min-h-[44px] tabular-nums" 
                                                        value={salesData.lalamove || ''} 
                                                        onChange={e => setSalesData({...salesData, lalamove: parseFloat(e.target.value) || 0})} 
                                                    />
                                                </div>
                                            </div>

                                            <div className="pt-3.5 mt-3.5 border-t border-orange-200/65 space-y-1 flex flex-col items-end">
                                                <div className="flex justify-between items-center text-xs font-black w-full">
                                                    <span className="text-gray-600 font-sans tracking-wide uppercase">Delivery Mix Total</span>
                                                    <span className="font-mono text-orange-600 text-lg">RM {totals.deliverySales.toFixed(2)}</span>
                                                </div>
                                                <p className="text-[9px] text-orange-650 font-black tracking-wide font-sans mt-0.5">Grab(实收) + Panda(Gross) + Shopee(Net)</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`p-5 rounded-2xl border flex justify-between items-center shadow-sm ${Math.abs(totals.salesVariance) < 1 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                        <div>
                                            <p className={`text-xs font-black uppercase ${Math.abs(totals.salesVariance) < 1 ? 'text-green-700' : 'text-red-700'}`}>{Math.abs(totals.salesVariance) < 1 ? 'POS Match (Perfect)' : 'POS Variance Detected'}</p>
                                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">Calc POS: RM {totals.posSales.toFixed(2)} vs Report: RM {totals.storeHubTotal.toFixed(2)}</p>
                                        </div>
                                        <div className={`text-xl font-black font-mono ${Math.abs(totals.salesVariance) < 1 ? 'text-green-700' : 'text-red-700'}`}>{totals.salesVariance > 0 ? '+' : ''}{totals.salesVariance.toFixed(2)}</div>
                                    </div>
                                    
                                    <div className="md:hidden pb-[calc(5rem+env(safe-area-inset-bottom,16px))]">{renderSummarySection()}</div>
                                </div>
                                <div className="hidden md:block md:w-[350px] lg:w-[400px] h-full overflow-hidden">{renderSummarySection()}</div>
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col bg-[#F5F7FA]">
                            <div className="p-3 sm:p-6 bg-white border-b border-gray-200 shadow-sm shrink-0">
                                <div className="max-w-4xl mx-auto flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <div className="bg-[#1A1A1A] p-1.5 sm:p-2 rounded-xl text-[#FFD700] shadow-md"><Calendar className="w-5 h-5 sm:w-5 sm:h-5"/></div>
                                        <div>
                                            <h4 className="font-black text-[#1A1A1A] text-base sm:text-lg">历史账单</h4>
                                            <p className="hidden sm:block text-[10px] text-gray-400 font-bold uppercase mt-0.5">Archive & Reconciliation History</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 sm:p-2 rounded-xl border border-gray-200">
                                        <span className="hidden sm:inline text-xs font-black text-gray-400 px-2">月份:</span>
                                        <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-transparent font-black text-[#1A1A1A] text-sm sm:text-base outline-none w-[110px] sm:w-auto" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-[calc(6rem+env(safe-area-inset-bottom,16px))]">
                                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                    {isLoading ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 lg:col-span-2">
                                            <Loader2 size={48} className="animate-spin mb-4 text-[#FFD700]"/>
                                            <p className="font-bold">正在拉取 {filterMonth} 的账单...</p>
                                        </div>
                                    ) : historyRecords.length === 0 ? (
                                        <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-200 lg:col-span-2">
                                            <History size={64} className="mx-auto mb-4 opacity-10 text-[#1A1A1A]"/>
                                            <p className="font-black text-[#1A1A1A]">{filterMonth} 暂无历史数据</p>
                                        </div>
                                    ) : (
                                        historyRecords.map(record => {
                                            const debit = record.sales.duitnow || 0; const credit = record.sales.card || 0;
                                            const tng = record.sales.tng || 0; const amex = record.sales.amex || 0;
                                            const cash = record.sales.cash || 0;
                                            const rs = (record as any).reconStatus || {};
                                            const deliveryBreakdown = record.sales.deliveryBreakdown || {} as any;
                                            
                                            const grabGross = Number(deliveryBreakdown.grabGross) || 0;
                                            const grabNet = Number(deliveryBreakdown.grabNet) || Number(deliveryBreakdown.grab) || 0;
                                            const grabAds = Number(deliveryBreakdown.grabAds) || 0;
                                            const grabExpected = grabNet - grabAds;
                                            
                                            const pandaGross = Number(deliveryBreakdown.pandaGross) || Number(deliveryBreakdown.panda) || 0;
                                            const shopeeNet = deliveryBreakdown.shopeeNet !== undefined ? Number(deliveryBreakdown.shopeeNet) : (Number(deliveryBreakdown.shopee) || 0);
                                            const shopeeAds = Number(deliveryBreakdown.shopeeAds) || 0;
                                            const shopeeExpected = shopeeNet - shopeeAds;
                                            const lalamoveVal = deliveryBreakdown.lalamove || 0;
                                            
                                            const totalDeliveryVal = grabExpected + pandaGross + shopeeExpected + lalamoveVal;
                                            const totalCardVal = debit + credit + amex;

                                            let hasPending = false;
                                            if (tng > 0 && !isChannelReconciled(rs, 'tng')) hasPending = true;
                                            if (debit > 0 && !isChannelReconciled(rs, 'debit')) hasPending = true;
                                            if (credit > 0 && !isChannelReconciled(rs, 'credit')) hasPending = true;
                                            if (amex > 0 && !isChannelReconciled(rs, 'amex')) hasPending = true;
                                            if (grabExpected > 0 && !isChannelReconciled(rs, 'grab')) hasPending = true;
                                            if (pandaGross > 0 && !isChannelReconciled(rs, 'panda')) hasPending = true;
                                            if (shopeeExpected > 0 && !isChannelReconciled(rs, 'shopee')) hasPending = true;

                                            return (
                                                <div key={record.id} onClick={() => setSelectedRecord(record)} className={`bg-white p-5 sm:p-6 rounded-2xl border ${hasPending ? 'border-amber-200 border-l-4 border-l-amber-500 shadow-sm bg-gradient-to-br from-white to-amber-50/[0.01]' : 'border-gray-200 border-l-4 border-l-emerald-500 shadow-sm'} hover:shadow-md hover:border-r-gray-300 hover:border-t-gray-300 hover:border-b-gray-300 active:scale-[0.98] transition-all cursor-pointer flex flex-col gap-4`}>
                                                    {/* Card Header Info */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3.5">
                                                            {/* Date Box - Omitted month as requested, only showing day */}
                                                            <div className="w-12 h-12 bg-gray-50 border border-gray-200/85 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                                                                <span className="text-xl font-extrabold text-gray-955 font-mono tracking-tight">{record.date.split('-')[2]}</span>
                                                            </div>
                                                            {/* Totals Title & Value */}
                                                            <div>
                                                                <div className="text-xs font-bold text-gray-400">当日总营业额</div>
                                                                <div className="text-lg sm:text-xl font-black text-gray-95" style={{ color: '#1A1A1A' }}>RM {record.sales.total.toFixed(2)}</div>
                                                            </div>
                                                        </div>
                                                        {/* Right side Status Badges */}
                                                        <div className="flex flex-col items-end gap-1.5">
                                                            {hasPending ? (
                                                                 <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-300/80 px-2 py-0.5 rounded-lg shrink-0 shadow-sm">
                                                                     <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                                     待核对
                                                                 </span>
                                                             ) : (
                                                                 <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-300/80 px-2 py-0.5 rounded-lg shrink-0">
                                                                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                     已核对
                                                                 </span>
                                                             )}
                                                            <div className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded-md leading-none ${record.variance >= 0 ? 'text-emerald-700 bg-emerald-50 border border-emerald-250' : 'text-rose-700 bg-rose-50 border border-rose-200'}`}>
                                                                {record.variance >= 0 ? '+' : ''}{record.variance.toFixed(2)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 4-Column breakdown grid - Single line, Math.round to avoid decimals */}
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div className="bg-slate-50/80 p-2 text-center flex flex-col justify-center rounded-xl border border-slate-100/70">
                                                            <div className="text-[10px] text-gray-400 font-bold truncate">💵 Cash</div>
                                                            <div className="text-xs sm:text-[13px] font-black font-mono text-gray-950 mt-1 whitespace-nowrap">RM {Math.round(cash)}</div>
                                                        </div>
                                                        <div className="bg-slate-50/80 p-2 text-center flex flex-col justify-center rounded-xl border border-slate-100/70">
                                                            <div className="text-[10px] text-gray-400 font-bold truncate">🔵 TNG</div>
                                                            <div className="text-xs sm:text-[13px] font-black font-mono text-gray-950 mt-1 whitespace-nowrap">RM {Math.round(tng)}</div>
                                                        </div>
                                                        <div className="bg-slate-50/80 p-2 text-center flex flex-col justify-center rounded-xl border border-slate-100/70">
                                                            <div className="text-[10px] text-gray-400 font-bold truncate">💳 Card</div>
                                                            <div className="text-xs sm:text-[13px] font-black font-mono text-gray-950 mt-1 whitespace-nowrap">RM {Math.round(totalCardVal)}</div>
                                                        </div>
                                                        <div className="bg-amber-50/70 p-2 text-center flex flex-col justify-center rounded-xl border border-amber-100">
                                                            <div className="text-[10px] text-amber-805 font-bold truncate">🛵 Delivery</div>
                                                            <div className="text-xs sm:text-[13px] font-black font-mono text-amber-900 mt-1 whitespace-nowrap">RM {Math.round(totalDeliveryVal)}</div>
                                                        </div>
                                                    </div>

                                                    {/* Delivery Detail Badges - Color dot representation, no text labels, no decimals */}
                                                    {totalDeliveryVal > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 px-0.5">
                                                            {grabExpected > 0 && (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                                    <span className="font-mono font-extrabold">RM {Math.round(grabExpected)}</span>
                                                                </span>
                                                            )}
                                                            {pandaGross > 0 && (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-pink-850 bg-pink-50 border border-pink-150 px-2 py-0.5 rounded-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0"></span>
                                                                    <span className="font-mono font-extrabold">RM {Math.round(pandaGross)}</span>
                                                                </span>
                                                            )}
                                                            {shopeeExpected > 0 && (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-950 bg-orange-50 border border-orange-150 px-2 py-0.5 rounded-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></span>
                                                                    <span className="font-mono font-extrabold">RM {Math.round(shopeeExpected)}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                            <HistoryDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} onDelete={handleDeleteClick} onRefresh={loadHistory} onUndoEdit={handleUndoAndEdit} />
                        </div>
                    )}
                </div>

                {/* 📱 iOS/Mobile Premium Bottom Navigation Tab Bar */}
                <div className="md:hidden block bg-white border-t border-gray-100 shrink-0 select-none pb-[env(safe-area-inset-bottom,16px)] z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex h-16 items-center justify-around">
                        <button 
                            id="mobile-tab-shift"
                            onClick={() => setActiveTab('SHIFT')} 
                            className={`flex flex-col items-center justify-center flex-1 h-full text-center transition-all cursor-pointer ${
                                activeTab === 'SHIFT' 
                                    ? 'text-[#1A1A1A] font-black scale-105' 
                                    : 'text-gray-400 font-bold active:text-gray-600'
                            }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all ${
                                activeTab === 'SHIFT' 
                                    ? 'bg-[#FFD700] text-black shadow-sm' 
                                    : 'bg-transparent text-gray-400'
                            }`}>
                                <Calculator size={18} strokeWidth={2.5}/>
                            </div>
                            <span className="text-[10px] tracking-wide mt-1">当班结算 (Shift)</span>
                        </button>
                        <button 
                            id="mobile-tab-history"
                            onClick={() => setActiveTab('HISTORY')} 
                            className={`flex flex-col items-center justify-center flex-1 h-full text-center transition-all cursor-pointer ${
                                activeTab === 'HISTORY' 
                                    ? 'text-[#1A1A1A] font-black scale-105' 
                                    : 'text-gray-400 font-bold active:text-gray-600'
                            }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all ${
                                activeTab === 'HISTORY' 
                                    ? 'bg-[#FFD700] text-black shadow-sm' 
                                    : 'bg-transparent text-gray-400'
                            }`}>
                                <History size={18} strokeWidth={2.5}/>
                            </div>
                            <span className="text-[10px] tracking-wide mt-1">历史账单 (History)</span>
                        </button>
                    </div>
                </div>

                {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center border-t-8 border-red-600 animate-in zoom-in-95">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce"><Trash2 size={32} className="text-red-600"/></div>
                            <h3 className="font-black text-2xl text-[#1A1A1A] mb-2">严重警告</h3>
                            <p className="text-sm text-gray-500 font-bold mb-2">确定要仅删除 <span className="text-red-600">{selectedRecord?.date}</span> 的结算记录吗？</p>
                            <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg mb-6 border border-red-100">
                                <AlertTriangle size={12} className="inline mr-1"/> 如果你想修改数据，请使用“撤销并重新编辑”按钮。此操作将永久清空记录。
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setShowDeleteConfirm(false)} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors">取消</button>
                                <button onClick={executeDeleteRecord} className="py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2">
                                    <Trash2 size={16}/> 确认删除
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>
    );
};