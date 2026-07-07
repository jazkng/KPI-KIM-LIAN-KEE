import React from 'react';
import { Package, X, Search, Box, Trash2, Link as LinkIcon } from 'lucide-react';
import { CatalogItem, StockItem, UomOption } from '../../../types';
import { SUP_INPUT_STYLE, SUP_LABEL_STYLE, DEFAULT_UOMS } from './supplierConstants';

interface ProductEditModalProps {
    productForm: Partial<CatalogItem>;
    productUoms: UomOption[];
    allStockList: StockItem[];
    stockSearchTerm: string;
    onFormChange: (form: Partial<CatalogItem>) => void;
    onUomsChange: (uoms: UomOption[]) => void;
    onStockSearchChange: (term: string) => void;
    onSave: () => void;
    onClose: () => void;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
    productForm, productUoms, allStockList, stockSearchTerm,
    onFormChange, onUomsChange, onStockSearchChange, onSave, onClose
}) => {
    const addUomOption = () => { onUomsChange([...productUoms, { label: '', value: '', ratio: 10 }]); };
    const updateUomOption = (idx: number, field: keyof UomOption, value: any) => { const c = [...productUoms]; c[idx] = { ...c[idx], [field]: value }; onUomsChange(c); };
    const removeUomOption = (idx: number) => { const c = [...productUoms]; c.splice(idx, 1); onUomsChange(c); };

    return (
        <div className="fixed inset-0 bg-[#1A1A1A]/80 z-[160] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-[2rem] p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black flex items-center gap-2 text-[#1A1A1A]">
                        <div className="p-2 bg-gray-100 rounded-xl text-gray-700"><Package size={20}/></div>
                        {productForm.id ? '编辑商品' : '新增供应商品'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"><X size={20}/></button>
                </div>
                <div className="space-y-5">
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                        <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-2"><LinkIcon size={14}/> 关联库存系统</h4>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-blue-400" size={14}/>
                            <input type="text" placeholder="搜索现有库存物品名称..." value={stockSearchTerm} onChange={e => onStockSearchChange(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"/>
                        </div>
                        {stockSearchTerm && (
                            <div className="mt-2 max-h-32 overflow-y-auto bg-white border border-blue-100 rounded-xl shadow-lg absolute z-50 w-[calc(100%-3rem)] left-6">
                                {allStockList.filter(s => s.name.toLowerCase().includes(stockSearchTerm.toLowerCase())).map(s => (
                                    <button key={s.id} onClick={() => { onFormChange({...productForm, linkedStockId: s.id, name: s.name, unit: s.unit, price: s.cost, category: s.category}); onStockSearchChange(''); }} className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-xs font-bold text-gray-700 border-b border-gray-50 flex justify-between">
                                        {s.name} <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1 rounded">{s.id}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {productForm.linkedStockId && (
                            <div className="mt-3 bg-white border border-blue-200 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg"><Box size={14}/></div>
                                    <div>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Linked Item</p>
                                        <p className="text-xs font-black text-blue-900">{allStockList.find(s => s.id === productForm.linkedStockId)?.name || productForm.linkedStockId}</p>
                                    </div>
                                </div>
                                <button onClick={() => onFormChange({...productForm, linkedStockId: undefined})} className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg"><X size={14}/></button>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className={SUP_LABEL_STYLE}>Item Name (商品名称)</label>
                        <input type="text" value={productForm.name || ''} onChange={e => onFormChange({...productForm, name: e.target.value})} className={SUP_INPUT_STYLE} placeholder="e.g. Fresh Chicken Breast"/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={SUP_LABEL_STYLE}>Base Unit (基础单位)</label>
                            <input type="text" value={productForm.unit || ''} onChange={e => onFormChange({...productForm, unit: e.target.value})} className={SUP_INPUT_STYLE} placeholder="e.g. KG"/>
                        </div>
                        <div>
                            <label className={SUP_LABEL_STYLE}>Price (价格 RM)</label>
                            <input type="number" value={productForm.price || ''} onChange={e => onFormChange({...productForm, price: parseFloat(e.target.value)})} className={SUP_INPUT_STYLE} placeholder="0.00"/>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">多单位换算 (Smart Units)</h4>
                            <button onClick={addUomOption} className="text-[10px] bg-white border border-gray-200 px-2.5 py-1 rounded-md font-bold text-[#1A1A1A] hover:bg-gray-100">+ Add</button>
                        </div>
                        <div className="space-y-2">
                            {productUoms?.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
                                    <input className="w-20 p-2 text-xs border border-gray-200 rounded-lg font-bold outline-none focus:border-[#FFD700]" placeholder="Unit Name" value={opt.value} onChange={e => updateUomOption(idx, 'value', e.target.value)} />
                                    <span className="text-xs font-bold text-gray-400">=</span>
                                    <input type="number" className="w-16 p-2 text-xs border border-gray-200 rounded-lg font-bold text-center outline-none focus:border-[#FFD700]" value={opt.ratio} onChange={e => updateUomOption(idx, 'ratio', parseFloat(e.target.value))} />
                                    <span className="text-[10px] text-gray-500 font-bold">{productForm.unit || 'Base'}</span>
                                    <button onClick={() => removeUomOption(idx)} className="ml-auto text-red-400 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={onSave} className="w-full py-3.5 bg-[#1A1A1A] text-[#FFD700] font-black rounded-xl text-sm mt-4 shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:bg-black active:scale-95 transition-all">保存商品 (Save Item)</button>
                </div>
            </div>
        </div>
    );
};
