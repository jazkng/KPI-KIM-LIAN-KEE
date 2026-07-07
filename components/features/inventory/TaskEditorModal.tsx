import React from 'react';
import { Search, X, Save, Check, PenLine, UserCheck } from 'lucide-react';
import { StockItem, InventoryTask } from '../../../types';
import { FREQ_OPTIONS, getCategoryColor, getCategoryLabel } from './inventoryConstants';

interface TaskEditorModalProps {
    editingTask: InventoryTask;
    editTaskItems: Set<string>;
    editTaskStockData: StockItem[];
    editTaskSearchTerm: string;
    editTaskFrequency: number;
    onSearchChange: (term: string) => void;
    onFrequencyChange: (freq: number) => void;
    onToggleItem: (stockId: string) => void;
    onSave: () => void;
    onClose: () => void;
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
    editingTask, editTaskItems, editTaskStockData, editTaskSearchTerm,
    editTaskFrequency, onSearchChange, onFrequencyChange, onToggleItem, onSave, onClose
}) => {
    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full h-full md:max-w-lg md:h-auto md:max-h-[90vh] md:rounded-3xl shadow-2xl animate-in zoom-in-95 flex flex-col relative overflow-hidden">
                <div className="p-4 md:p-6 pb-3 shrink-0 border-b border-gray-100 bg-white z-10">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-black text-xl text-[#1A1A1A] flex items-center gap-2"><PenLine size={20}/> 编辑常驻任务</h3>
                        <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                    <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-xl border border-indigo-100 mb-3">
                        <UserCheck size={16} className="text-indigo-600"/>
                        <div>
                            <div className="font-bold text-sm text-indigo-800">{editingTask.assigneeName}</div>
                            <div className="text-[10px] text-indigo-400">{editTaskItems.size} items selected</div>
                        </div>
                    </div>
                    <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                        {FREQ_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => onFrequencyChange(opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-all ${editTaskFrequency === opt.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={14}/>
                        <input type="text" placeholder="搜索物品..." value={editTaskSearchTerm} onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-400"/>
                    </div>
                </div>

                <div className="p-4 overflow-y-auto flex-grow space-y-2 bg-[#F9FAFB]">
                    {editTaskStockData
                        .filter(s => !editTaskSearchTerm || s.name.toLowerCase().includes(editTaskSearchTerm.toLowerCase()))
                        .map(stockItem => {
                            const isSelected = editTaskItems.has(stockItem.id);
                            return (
                                <div key={stockItem.id} onClick={() => onToggleItem(stockItem.id)}
                                    className={`p-3 rounded-xl border-2 cursor-pointer flex justify-between items-center transition-all ${isSelected ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-gray-100 hover:border-gray-300'}`}>
                                    <div>
                                        <div className="font-bold text-sm text-[#1A1A1A]">{stockItem.name}</div>
                                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getCategoryColor(stockItem.category)}`}>{getCategoryLabel(stockItem.category)}</span>
                                            <span>Qty: {stockItem.currentQty} {stockItem.unit}</span>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300'}`}>
                                        {isSelected && <Check size={14} strokeWidth={3}/>}
                                    </div>
                                </div>
                            );
                        })
                    }
                </div>

                <div className="p-4 border-t border-gray-100 bg-white flex gap-3 shrink-0">
                    <button onClick={onClose} className="flex-1 py-3 bg-white border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50">取消</button>
                    <button onClick={onSave}
                        className="flex-[2] py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                        <Save size={16}/> 保存更改 ({editTaskItems.size} items)
                    </button>
                </div>
            </div>
        </div>
    );
};