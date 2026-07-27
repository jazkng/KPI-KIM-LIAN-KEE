import React from 'react';
import { ClipboardCheck, X, Save, Info, Loader2 } from 'lucide-react';
import { PurchaseOrder } from '../../../types';
import { SupplierReceivedItem } from './supplierConstants';

interface ReceivePOModalProps {
    receivingPO: PurchaseOrder;
    receivedItems: SupplierReceivedItem[];
    isProcessingReceive: boolean;
    onUpdateItem: (idx: number, field: keyof SupplierReceivedItem, value: any) => void;
    onConfirm: () => void;
    onClose: () => void;
}

export const ReceivePOModal: React.FC<ReceivePOModalProps> = ({
    receivingPO, receivedItems, isProcessingReceive, onUpdateItem, onConfirm, onClose
}) => {
    return (
        <div className="fixed inset-0 bg-[#111111]/80 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh] overflow-hidden">
                <div className="p-5 md:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl"><ClipboardCheck size={24}/></div>
                        <div>
                            <h3 className="font-black text-lg md:text-xl text-[#111111]">采购入库对账 (Receive PO)</h3>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-widest">ORDER REF: {receivingPO.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
                </div>
                
                <div className="flex-grow overflow-y-auto p-4 md:p-6">
                    <div className="bg-blue-50/80 border border-blue-200/50 p-4 rounded-2xl mb-6 text-xs font-bold text-blue-800 flex gap-3 items-start shadow-sm">
                        <Info size={18} className="shrink-0 mt-0.5 text-blue-600"/>
                        <p className="leading-relaxed">请核对实际收货数量与价格。如果供应商按<span className="text-red-600 font-black">实际重量(KG)</span>计费（如肉类/海鲜），请勾选「按重计费」并输入实重，系统会自动为您摊算每单位的真实库存成本。</p>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                                <tr>
                                    <th className="p-4">Item (商品)</th>
                                    <th className="p-4 w-24">Ordered</th>
                                    <th className="p-4 w-28">Cost(Unit)</th>
                                    <th className="p-4 w-28">Rcv Qty (包/件)</th>
                                    <th className="p-4 w-36 bg-blue-50/50 border-x border-blue-100/50">按重计费? (By KG)</th>
                                    <th className="p-4 w-28 text-right">Total (RM)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {receivedItems.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="p-4 font-bold text-xs text-[#111111]">
                                            {item.name}
                                            <div className="text-[9px] text-gray-400 font-mono mt-0.5">{item.supplierCode || 'NO-CODE'}</div>
                                        </td>
                                        <td className="p-4 text-xs font-mono font-medium">{item.orderQty} <span className="text-[10px] text-gray-400">{item.unit}</span></td>
                                        <td className="p-4">
                                            <div className="relative">
                                                <span className="absolute left-2.5 top-2 text-[10px] text-gray-400 font-bold">RM</span>
                                                <input type="number" className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold focus:border-blue-500 outline-none" value={item.finalCost} onChange={e => onUpdateItem(idx, 'finalCost', parseFloat(e.target.value))} />
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <input type="number" className="w-full p-1.5 border border-gray-200 rounded-lg text-xs font-mono font-black text-center focus:border-blue-500 outline-none bg-gray-50" value={item.receivedQty} onChange={e => onUpdateItem(idx, 'receivedQty', parseInt(e.target.value))} />
                                        </td>
                                        <td className="p-4 bg-blue-50/30 border-x border-blue-50/50">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={item.billByWeight || false} onChange={e => onUpdateItem(idx, 'billByWeight', e.target.checked)} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                                                {item.billByWeight && (
                                                    <div className="flex items-center gap-1 relative">
                                                        <input type="number" className="w-16 p-1.5 border-2 border-blue-400 rounded-lg text-xs font-mono font-black text-blue-900 outline-none focus:ring-2 ring-blue-200 text-center" placeholder="0.0" value={item.receivedWeight || ''} onChange={e => onUpdateItem(idx, 'receivedWeight', parseFloat(e.target.value))} />
                                                        <span className="text-[10px] text-blue-600 font-black absolute -right-4">KG</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-mono font-black text-blue-700 text-sm">
                                            {((item.billByWeight && item.receivedWeight ? item.receivedWeight : item.receivedQty) * item.finalCost).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-5 md:p-6 border-t border-gray-200 bg-white flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
                    <div className="w-full md:w-auto flex items-center justify-between md:justify-start gap-6 bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Final AP Total</p>
                            <p className="text-2xl font-mono font-black text-red-600">
                                RM {receivedItems.reduce((sum, item) => sum + ((item.billByWeight && item.receivedWeight ? item.receivedWeight : item.receivedQty) * item.finalCost), 0).toFixed(2)}
                            </p>
                        </div>
                    </div>
                    <button onClick={onConfirm} disabled={isProcessingReceive} className="w-full md:w-auto px-8 py-4 bg-[#111111] text-[#FFD200] rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-black active:scale-95 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                        {isProcessingReceive ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} 确认入库并抛转账单
                    </button>
                </div>
            </div>
        </div>
    );
};
