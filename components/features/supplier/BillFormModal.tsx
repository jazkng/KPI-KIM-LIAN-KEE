import React from 'react';
import { Receipt, X } from 'lucide-react';
import { ExpenseItem } from '../../../types';
import { SUP_INPUT_STYLE, SUP_LABEL_STYLE } from './supplierConstants';

interface BillFormModalProps {
    newBill: Partial<ExpenseItem>;
    onChange: (bill: Partial<ExpenseItem>) => void;
    onSave: () => void;
    onClose: () => void;
}

export const BillFormModal: React.FC<BillFormModalProps> = ({
    newBill, onChange, onSave, onClose
}) => {
    return (
        <div className="fixed inset-0 bg-[#1A1A1A]/80 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><Receipt size={20}/> 录入新账单</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><X size={18}/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className={SUP_LABEL_STYLE}>Amount (RM) 总金额</label>
                        <input type="number" className={SUP_INPUT_STYLE} value={newBill.totalBillAmount || ''} onChange={e => onChange({...newBill, totalBillAmount: parseFloat(e.target.value)})} placeholder="0.00" />
                    </div>
                    <div>
                        <label className={SUP_LABEL_STYLE}>Date (账单日期)</label>
                        <input type="date" className={SUP_INPUT_STYLE} value={newBill.time?.split('T')[0]} onChange={e => onChange({...newBill, time: e.target.value})} />
                    </div>
                    <div>
                        <label className={SUP_LABEL_STYLE}>Status (付款状态)</label>
                        <select className={SUP_INPUT_STYLE} value={newBill.paymentStatus} onChange={e => onChange({...newBill, paymentStatus: e.target.value as any})}>
                            <option value="UNPAID">🔴 未付 (UNPAID)</option>
                            <option value="PAID">🟢 已结清 (PAID)</option>
                        </select>
                    </div>
                    <div>
                        <label className={SUP_LABEL_STYLE}>Note (备注说明)</label>
                        <input className={SUP_INPUT_STYLE} value={newBill.note || ''} onChange={e => onChange({...newBill, note: e.target.value})} placeholder="Optional..." />
                    </div>
                    <button onClick={onSave} className="w-full py-3.5 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-sm shadow-lg hover:bg-black mt-2 active:scale-95 transition-all">确认生成账单</button>
                </div>
            </div>
        </div>
    );
};
