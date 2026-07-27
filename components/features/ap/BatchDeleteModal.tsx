import * as React from 'react';
import { Trash2, Loader2 } from 'lucide-react';

interface BatchDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCount: number;
    batchInvoiceTotal: number;
    onConfirm: () => void;
    isSaving: boolean;
}

export const BatchDeleteModal: React.FC<BatchDeleteModalProps> = ({
    isOpen,
    onClose,
    selectedCount,
    batchInvoiceTotal,
    onConfirm,
    isSaving,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl text-center border-t-4 border-red-500 animate-in slide-in-from-bottom md:zoom-in-95 duration-300" 
                onClick={e => e.stopPropagation()} 
                style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
                <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <Trash2 size={32}/>
                </div>
                <h3 className="font-black text-xl text-[#111111] mb-2">危险操作：批量删除</h3>
                <p className="text-xs text-gray-500 font-bold mb-4">
                    你即将永久删除选中的 <span className="text-red-600 font-black text-base">{selectedCount}</span> 笔账单。
                    <br/><br/>
                    包含于每日结算单中的账单将通过排队事务被层层剥离剔除，绝对保证结算数据完整性。
                </p>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 mb-6 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Total Erased Amount</p>
                    <p className="text-2xl font-black font-mono text-gray-400 line-through decoration-red-500 decoration-2">RM {batchInvoiceTotal.toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200 transition-colors">
                        取消 (Cancel)
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={isSaving} 
                        className="py-3 bg-red-600 text-white font-black rounded-xl text-xs shadow-lg hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin w-4 h-4"/> : <Trash2 size={16}/>} 确认摧毁 (Destroy)
                    </button>
                </div>
            </div>
        </div>
    );
};
