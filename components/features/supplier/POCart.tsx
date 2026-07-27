import React from 'react';
import { ShoppingBag, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { PurchaseOrderItem, Supplier } from '../../../types';

interface POCartProps {
    cart: PurchaseOrderItem[];
    selectedSupplier: Supplier | null;
    isCartExpanded: boolean;
    onToggleExpand: () => void;
    onUpdateQty: (idx: number, qty: number) => void;
    onRemove: (idx: number) => void;
    onCreatePO: () => void;
}

export const POCart: React.FC<POCartProps> = ({
    cart, selectedSupplier, isCartExpanded, onToggleExpand, onUpdateQty, onRemove, onCreatePO
}) => {
    const total = cart.reduce((sum, item) => sum + (item.orderQty * item.cost), 0);

    return (
        <div className={`fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] border-t border-gray-200 z-[120] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isCartExpanded ? 'h-[65vh] md:h-[50vh] rounded-t-[2rem]' : 'h-16 md:h-20'}`}>
            <div className="max-w-7xl mx-auto h-full flex flex-col relative">
                {isCartExpanded && <div className="w-12 h-1.5 bg-gray-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2 cursor-pointer" onClick={onToggleExpand}></div>}
                
                <div className={`px-4 md:px-8 flex justify-between items-center bg-white cursor-pointer select-none shrink-0 ${isCartExpanded ? 'h-20 pt-4' : 'h-full'}`} onClick={onToggleExpand}>
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="relative">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-[#111111] to-gray-800 rounded-[14px] flex items-center justify-center text-[#FFD200] shadow-md">
                                <ShoppingBag size={20} className="md:w-6 md:h-6"/>
                            </div>
                            <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] md:text-xs font-black w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{cart.length}</div>
                        </div>
                        <div>
                            <h3 className="font-black text-sm md:text-lg text-[#111111]">采购车 (PO Cart)</h3>
                            <p className="text-[10px] md:text-xs text-gray-500 font-bold truncate max-w-[120px] md:max-w-xs">To: {selectedSupplier?.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-6">
                        <div className="text-right hidden md:block">
                            <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest">Est. Total</p>
                            <p className="text-base md:text-xl font-mono font-black text-[#111111]">RM {total.toFixed(2)}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onCreatePO(); }} className="px-5 md:px-8 py-2.5 md:py-3 bg-[#111111] text-[#FFD200] rounded-xl font-black text-xs md:text-sm shadow-lg hover:bg-black transition-all active:scale-95">生成订单</button>
                        <div className="text-gray-300 hidden md:block">{isCartExpanded ? <ChevronDown size={24}/> : <ChevronUp size={24}/>}</div>
                    </div>
                </div>
                
                {isCartExpanded && (
                    <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-gray-50/80 border-t border-gray-100">
                        <div className="space-y-3 max-w-4xl mx-auto">
                            {cart.map((item, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-[#FFD200]/50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-sm text-[#111111] truncate">{item.name}</h4>
                                        <p className="text-[10px] font-mono text-gray-400 mt-0.5">{item.stockId}</p>
                                    </div>
                                    <div className="flex items-center justify-between md:justify-end gap-4">
                                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1 shadow-inner">
                                            <button onClick={() => onUpdateQty(idx, Math.max(1, item.orderQty - 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-gray-600 font-black active:scale-95 transition-transform">-</button>
                                            <input type="number" className="w-12 bg-transparent text-center font-mono font-black text-sm outline-none" value={item.orderQty} onChange={(e) => onUpdateQty(idx, Math.max(1, parseInt(e.target.value) || 1))}/>
                                            <button onClick={() => onUpdateQty(idx, item.orderQty + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-gray-600 font-black active:scale-95 transition-transform">+</button>
                                        </div>
                                        <div className="flex flex-col items-end w-20">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">{item.unit}</span>
                                            <span className="font-mono font-black text-sm text-blue-700">RM {(item.orderQty * item.cost).toFixed(2)}</span>
                                        </div>
                                        <button onClick={() => onRemove(idx)} className="p-2 text-red-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                            ))}
                            <div className="md:hidden mt-6 p-4 bg-[#111111] text-white rounded-2xl flex justify-between items-center shadow-lg">
                                <span className="text-xs font-bold uppercase tracking-widest text-[#FFD200]">Total</span>
                                <span className="text-xl font-mono font-black">RM {total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
