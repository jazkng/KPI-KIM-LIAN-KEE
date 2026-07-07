import * as React from 'react';
import { CreditCard, Wallet, DollarSign, Calendar } from 'lucide-react';
import { ExpenseItem } from '../../../types';

interface QuickPayModalProps {
    bill: ExpenseItem | null;
    payAmount: number;
    setPayAmount: React.Dispatch<React.SetStateAction<number>>;
    payMethod: string;
    setPayMethod: React.Dispatch<React.SetStateAction<string>>;
    onClose: () => void;
    onConfirm: (options?: { generatePV?: boolean; paymentDate?: string }) => void;
}

export const QuickPayModal: React.FC<QuickPayModalProps> = ({
    bill,
    payAmount,
    setPayAmount,
    payMethod,
    setPayMethod,
    onClose,
    onConfirm,
}) => {
    const [generatePV, setGeneratePV] = React.useState<boolean>(false);
    const [paymentDate, setPaymentDate] = React.useState<string>(() => new Date().toISOString().split('T')[0]);
    if (!bill) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[150] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300 max-h-[92vh] overflow-y-auto" 
                onClick={e => e.stopPropagation()} 
                style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
                {/* Drag handle (mobile only) */}
                <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                <h3 className="font-black text-xl text-[#1A1A1A] mb-1">支付账单 (Pay Bill)</h3>
                <p className="text-xs text-gray-500 font-bold mb-6">{bill.company} • Inv #{bill.id.slice(-6)}</p>
                
                <div className="space-y-4">
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                        <div className="text-[10px] text-red-400 uppercase font-black">Outstanding</div>
                        <div className="text-2xl font-black text-red-600">RM {bill.outstandingAmount?.toFixed(2)}</div>
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Payment Amount</label>
                        <input 
                            type="number" 
                            value={payAmount} 
                            onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} 
                            className="w-full p-4 bg-gray-50 rounded-xl font-black text-xl outline-none focus:border-[#FFD700] border-2 border-transparent"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                            <Calendar size={12} className="text-gray-400" /> Payment Date (支付日期)
                        </label>
                        <input 
                            type="date" 
                            value={paymentDate} 
                            onChange={e => setPaymentDate(e.target.value)} 
                            className="w-full p-4 bg-gray-50 rounded-xl font-bold text-sm outline-none focus:border-[#FFD700] border-2 border-transparent text-gray-800"
                        />
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-3 block text-center">Payment Method (资金来源)</label>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setPayMethod('BANK_TRANSFER')} 
                                className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all flex flex-col items-center justify-center gap-2 ${payMethod === 'BANK_TRANSFER' ? 'bg-[#1A1A1A] text-[#FFD700] border-[#FFD700] shadow-lg scale-105' : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'}`}
                            >
                                <CreditCard size={28}/> Bank
                            </button>
                            <button 
                                onClick={() => setPayMethod('CASH')} 
                                className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all flex flex-col items-center justify-center gap-2 ${payMethod === 'CASH' ? 'bg-green-600 text-white border-green-500 shadow-lg scale-105' : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'}`}
                            >
                                <Wallet size={28}/> Cash
                            </button>
                        </div>
                        {payMethod && (
                            <p className="text-[9px] text-gray-400 mt-2 italic text-center animate-in fade-in">
                                Will deduct from Treasury {payMethod === 'CASH' ? 'CASH' : 'BANK'} balance.
                            </p>
                        )}
                    </div>

                    {payMethod && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl animate-in fade-in duration-200">
                            <input 
                                type="checkbox" 
                                id="quick_generate_pv"
                                checked={generatePV}
                                onChange={e => setGeneratePV(e.target.checked)}
                                className="w-4 h-4 text-amber-600 border-[#FFD500] rounded focus:ring-amber-500 cursor-pointer mt-0.5"
                            />
                            <label htmlFor="quick_generate_pv" className="text-xs font-black text-amber-950 cursor-pointer flex flex-col">
                                <span>同时生成付款凭单 (Generate PV)</span>
                                <span className="text-[9px] text-amber-800 font-normal mt-0.5 animate-pulse">勾选后将自动为该笔支付生成付款核销凭单 (PV)。若不勾选，将仅记录款项支付而不生成凭单。</span>
                            </label>
                        </div>
                    )}

                    {payMethod ? (
                        <button 
                            onClick={() => onConfirm({ generatePV, paymentDate })} 
                            className="w-full bg-[#1A1A1A] text-[#FFD700] py-4 rounded-xl font-black shadow-lg hover:bg-black flex items-center justify-center gap-2 mt-2 animate-in slide-in-from-bottom-2 fade-in"
                        >
                            <DollarSign size={18}/> 确认支付 (Confirm)
                        </button>
                    ) : (
                        <div className="w-full py-4 mt-4 text-center text-xs font-bold text-gray-300 border-2 border-dashed border-gray-200 rounded-xl">
                            请选择上方支付方式
                        </div>
                    )}
                    
                    <button onClick={onClose} className="w-full py-3 text-gray-400 text-xs font-bold hover:text-gray-600">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
