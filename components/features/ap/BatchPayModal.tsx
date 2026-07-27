import * as React from 'react';
import { useState } from 'react';
import { CreditCard, Wallet, Loader2, CheckCircle2, Camera, Trash2, Link, Calendar } from 'lucide-react';
import { uploadToCloudinary } from '../../utils';

interface BatchPayModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCount: number;
    batchOutstandingAmount: number;
    payMethod: string;
    setPayMethod: React.Dispatch<React.SetStateAction<string>>;
    onConfirm: (data: { bankRef: string; bankReceiptUrl: string; soaUrl: string; paymentDate: string; generatePV: boolean }) => void;
    isSaving: boolean;
}

export const BatchPayModal: React.FC<BatchPayModalProps> = ({
    isOpen,
    onClose,
    selectedCount,
    batchOutstandingAmount,
    payMethod,
    setPayMethod,
    onConfirm,
    isSaving,
}) => {
    const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [bankRef, setBankRef] = useState<string>('');
    const [soaUrl, setSoaUrl] = useState<string>('');
    const [bankReceiptUrl, setBankReceiptUrl] = useState<string>('');
    const [generatePV, setGeneratePV] = useState<boolean>(false);

    const [isUploadingSoa, setIsUploadingSoa] = useState(false);
    const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

    const soaInputRef = React.useRef<HTMLInputElement>(null);
    const receiptInputRef = React.useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm({
            bankRef,
            bankReceiptUrl,
            soaUrl,
            paymentDate,
            generatePV
        });
    };

    const handleUploadSoa = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingSoa(true);
        try {
            const url = await uploadToCloudinary(file);
            setSoaUrl(url);
        } catch (err) {
            alert("上传结账单图片失败，请重试");
        } finally {
            setIsUploadingSoa(false);
        }
    };

    const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingReceipt(true);
        try {
            const url = await uploadToCloudinary(file);
            setBankReceiptUrl(url);
        } catch (err) {
            alert("上传付款水单图片失败，请重试");
        } finally {
            setIsUploadingReceipt(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-white w-full md:max-w-md max-h-[95vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300" 
                onClick={e => e.stopPropagation()} 
                style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
            >
                {/* Drag handle (mobile only) */}
                <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>

                <div className="text-center md:text-left">
                    <h3 className="font-black text-lg md:text-xl text-[#111111] mb-1">批量支付确认 & 电子凭证核销</h3>
                    <p className="text-[11px] md:text-sm text-gray-500 font-bold mb-4">准备为批量的 {selectedCount} 笔账单登记付款</p>
                </div>
                
                {/* Total box */}
                <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100 mb-4 text-center">
                    <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mb-1">Total Payment</p>
                    <p className="text-2xl md:text-3xl font-black font-mono text-green-600 font-sans">RM {batchOutstandingAmount.toFixed(2)}</p>
                </div>
                
                {/* Method selector */}
                <div className="mb-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">1. 支付方式 (Payment Method)</label>
                    <div className="flex gap-2 md:gap-3">
                        <button 
                            onClick={() => setPayMethod('BANK_TRANSFER')} 
                            type="button"
                            className={`flex-1 py-3 rounded-xl md:rounded-2xl font-black text-xs md:text-sm border-2 transition-all flex flex-col items-center justify-center gap-1.5 ${payMethod === 'BANK_TRANSFER' ? 'bg-[#111111] text-[#FFD200] border-[#FFD200] shadow-lg scale-[1.02]' : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'}`}
                        >
                            <CreditCard className="w-5 h-5 md:w-6 md:h-6"/> Bank
                        </button>
                        <button 
                            onClick={() => setPayMethod('CASH')} 
                            type="button"
                            className={`flex-1 py-3 rounded-xl md:rounded-2xl font-black text-xs md:text-sm border-2 transition-all flex flex-col items-center justify-center gap-1.5 ${payMethod === 'CASH' ? 'bg-green-600 text-white border-green-500 shadow-lg scale-[1.02]' : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'}`}
                        >
                            <Wallet className="w-5 h-5 md:w-6 md:h-6"/> Cash
                        </button>
                    </div>
                </div>

                <div className="space-y-4 border-t border-gray-100 pt-3 mb-4">
                    {/* 2. Custom payment date */}
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                            <Calendar size={12} className="text-gray-400"/> 2. 支付日期 (Payment Date - 补旧账核心)
                        </label>
                        <input 
                            type="date"
                            value={paymentDate}
                            onChange={e => setPaymentDate(e.target.value)}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD200]"
                        />
                    </div>

                    {/* 📅 批量开具PV单选项 */}
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl">
                        <input 
                            type="checkbox" 
                            id="batch_generate_pv"
                            checked={generatePV}
                            onChange={e => setGeneratePV(e.target.checked)}
                            className="w-4 h-4 text-amber-600 border-[#FFD500] rounded focus:ring-amber-500 cursor-pointer mt-0.5"
                        />
                        <label htmlFor="batch_generate_pv" className="text-xs font-black text-amber-950 cursor-pointer flex flex-col">
                            <span>同时自动为该批支付生成付款凭单 (Generate PVs)</span>
                            <span className="text-[9px] text-amber-800 font-normal mt-0.5 animate-pulse">勾选后本次批量支付将自动为所选账单分别生成专属付款凭单 (PV)。若不勾选，将仅登记账单付清，不会生成任何凭单。</span>
                        </label>
                    </div>
                </div>

                {payMethod && (
                    <div className="space-y-4 border-t border-gray-100 pt-4 mb-5 animate-in slide-in-from-top-2 duration-300">
                        {/* 3. Bank Ref Number */}
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">
                                3. {payMethod === 'BANK_TRANSFER' ? '银行交易参考号' : '付款流水说明'} (Ref ID)
                            </label>
                            <input 
                                type="text"
                                value={bankRef}
                                onChange={e => setBankRef(e.target.value)}
                                placeholder={payMethod === 'BANK_TRANSFER' ? '例如: 831648818M' : '现金付款备注说明 / 无'}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD200]"
                            />
                        </div>

                        {/* 4. Documents Integration */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* SOA Upload */}
                            <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex flex-col justify-between">
                                <span className="text-[9px] font-black text-gray-500 uppercase mb-2 block">对方对账结账单 (SOA)</span>
                                
                                {soaUrl ? (
                                    <div className="space-y-1.5">
                                        <div className="relative rounded overflow-hidden aspect-video bg-gray-200 flex items-center justify-center">
                                            {soaUrl.match(/\.(jpeg|jpg|gif|png)/i) ? (
                                                <img src={soaUrl} className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                                            ) : (
                                                <Link size={20} className="text-gray-400" />
                                            )}
                                            <button 
                                                type="button"
                                                onClick={() => setSoaUrl('')}
                                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                        <span className="text-[8px] text-emerald-600 font-bold text-center block">📎 已成功绑定</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <button 
                                            type="button"
                                            onClick={() => soaInputRef.current?.click()}
                                            disabled={isUploadingSoa}
                                            className="w-full h-12 bg-white hover:bg-gray-100 text-gray-500 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center transition-all"
                                        >
                                            {isUploadingSoa ? (
                                                <Loader2 size={14} className="animate-spin text-gray-400" />
                                            ) : (
                                                <>
                                                    <Camera size={14} className="text-gray-400 mb-0.5" />
                                                    <span className="text-[8px] font-black">拍照或上传</span>
                                                </>
                                            )}
                                        </button>
                                        <input 
                                            type="text" 
                                            value={soaUrl} 
                                            onChange={e => setSoaUrl(e.target.value)} 
                                            placeholder="或直接粘贴链接" 
                                            className="w-full text-[8px] text-center font-bold p-1 border border-gray-200 rounded block focus:outline-none focus:ring-1 focus:ring-[#FFD200]"
                                        />
                                    </div>
                                )}
                                <input type="file" ref={soaInputRef} className="hidden" accept="image/*" onChange={handleUploadSoa} />
                            </div>

                            {/* Bank Receipt Upload */}
                            <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex flex-col justify-between">
                                <span className="text-[9px] font-black text-gray-500 uppercase mb-2 block">银行付款水单 (Receipt)</span>
                                
                                {bankReceiptUrl ? (
                                    <div className="space-y-1.5">
                                        <div className="relative rounded overflow-hidden aspect-video bg-gray-200 flex items-center justify-center">
                                            {bankReceiptUrl.match(/\.(jpeg|jpg|gif|png)/i) ? (
                                                <img src={bankReceiptUrl} className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                                            ) : (
                                                <Link size={20} className="text-gray-400" />
                                            )}
                                            <button 
                                                type="button"
                                                onClick={() => setBankReceiptUrl('')}
                                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                        <span className="text-[8px] text-emerald-600 font-bold text-center block">📎 已成功绑定</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <button 
                                            type="button"
                                            onClick={() => receiptInputRef.current?.click()}
                                            disabled={isUploadingReceipt}
                                            className="w-full h-12 bg-white hover:bg-gray-100 text-gray-500 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center transition-all"
                                        >
                                            {isUploadingReceipt ? (
                                                <Loader2 size={14} className="animate-spin text-gray-400" />
                                            ) : (
                                                <>
                                                    <Camera size={14} className="text-gray-400 mb-0.5" />
                                                    <span className="text-[8px] font-black">拍照或上传</span>
                                                </>
                                            )}
                                        </button>
                                        <input 
                                            type="text" 
                                            value={bankReceiptUrl} 
                                            onChange={e => setBankReceiptUrl(e.target.value)} 
                                            placeholder="或直接粘贴链接" 
                                            className="w-full text-[8px] text-center font-bold p-1 border border-gray-200 rounded block focus:outline-none focus:ring-1 focus:ring-[#FFD200]"
                                        />
                                    </div>
                                )}
                                <input type="file" ref={receiptInputRef} className="hidden" accept="image/*" onChange={handleUploadReceipt} />
                            </div>
                        </div>
                    </div>
                )}

                {payMethod ? (
                    <button 
                        onClick={handleConfirm} 
                        disabled={isSaving || isUploadingReceipt || isUploadingSoa} 
                        type="button"
                        className="w-full py-3.5 bg-[#111111] text-[#FFD200] rounded-xl font-black text-sm md:text-base shadow-lg hover:bg-black flex items-center justify-center gap-2 animate-in slide-in-from-bottom-2 fade-in"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin"/> : <CheckCircle2 size={18}/>} 确认支付 (Confirm)
                    </button>
                ) : (
                    <div className="w-full py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-gray-300 border-2 border-dashed border-gray-200 rounded-xl">请选择上方支付方式</div>
                )}
                
                <button type="button" onClick={onClose} className="w-full py-2.5 mt-1 text-gray-400 text-[10px] md:text-xs font-bold hover:text-black">取消 (Cancel)</button>
            </div>
        </div>
    );
};

