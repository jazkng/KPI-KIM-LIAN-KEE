import React, { useRef, useState } from 'react';
import {
    Edit3, X, Scale, Calculator, Box, ArrowRightLeft,
    Trash2, Link as LinkIcon, Package, Loader2, Save,
    Camera, Image as ImageIcon
} from 'lucide-react';
import { CATEGORY_SECTIONS, INPUT_STYLE, LABEL_STYLE } from './inventoryConstants';
import { StockItem, Supplier, UomOption } from '../../../types';
import { uploadToCloudinary } from '../../utils';
// ============================================================
// 🧩 抽离子组件：库存编辑弹窗
// ============================================================
interface StockEditModalProps {
    editingItem: Partial<StockItem>;
    currentStockView: string;
    linkedSuppliers: Supplier[];
    isSubmitting: boolean;
    onSave: () => void;
    onDelete: () => void;
    onClose: () => void;
    onChange: (item: Partial<StockItem>) => void;
}

export const StockEditModal: React.FC<StockEditModalProps> = React.memo(({
    editingItem, currentStockView, linkedSuppliers, isSubmitting,
    onSave, onDelete, onClose, onChange
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            onChange({ ...editingItem, image: url });
        } catch (error) {
            console.error("Failed to upload stock image:", error);
            alert("图片上传失败，请重试 (Upload failed)");
        } finally {
            setIsUploading(false);
        }
    };

    const addUomOption = () => {
        const current = editingItem.uomOptions || [];
        onChange({ ...editingItem, uomOptions: [...current, { label: '', value: '', ratio: 1 }] });
    };
    const updateUomOption = (idx: number, field: keyof UomOption, value: any) => {
        const current = [...(editingItem.uomOptions || [])];
        current[idx] = { ...current[idx], [field]: value };
        onChange({ ...editingItem, uomOptions: current });
    };
    const removeUomOption = (idx: number) => {
        const current = [...(editingItem.uomOptions || [])];
        current.splice(idx, 1);
        onChange({ ...editingItem, uomOptions: current });
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full h-full md:max-w-lg md:h-auto md:max-h-[90vh] md:rounded-3xl shadow-2xl animate-in zoom-in-95 flex flex-col relative overflow-hidden">

                <div className="p-4 md:p-6 pb-2 shrink-0 border-b md:border-0 border-gray-100 bg-white z-10 sticky top-0">
                    <div className="flex justify-between items-center mb-4 md:mb-6">
                        <h3 className="font-black text-xl md:text-2xl text-[#1A1A1A] flex items-center gap-2">
                            <Edit3 size={24}/> {editingItem.id ? '编辑物品 (Edit)' : '新增物品 (New)'}
                        </h3>
                        <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                </div>

                <div className="p-4 md:p-6 space-y-6 overflow-y-auto flex-grow bg-[#F9FAFB] md:bg-white pb-24 md:pb-6">
                    <div>
                        <label className={LABEL_STYLE}>Item Name (品名)</label>
                        <input className={INPUT_STYLE} value={editingItem.name || ''} onChange={e => onChange({...editingItem, name: e.target.value})} placeholder="e.g. 肉片 (Pork Slices)" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={LABEL_STYLE}>ID Code</label>
                            <input className={`${INPUT_STYLE} font-mono`} value={editingItem.id || 'Auto'} readOnly={!!editingItem.id} placeholder="Auto" />
                        </div>
                        <div>
                            <label className={LABEL_STYLE}>Base Unit (基础)</label>
                            <input className={INPUT_STYLE} value={editingItem.unit || ''} onChange={e => onChange({...editingItem, unit: e.target.value})} placeholder="kg/pkt" />
                        </div>
                    </div>

                    <div>
                        <label className={LABEL_STYLE}>Sub Category (分类)</label>
                        <select className={INPUT_STYLE} value={editingItem.category || CATEGORY_SECTIONS[currentStockView]?.[0]?.id} onChange={e => onChange({...editingItem, category: e.target.value})}>
                            {CATEGORY_SECTIONS[currentStockView]?.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={LABEL_STYLE}>Photo (商品照片)</label>
                        <div
                            className="relative h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden cursor-pointer group flex items-center justify-center bg-cover bg-center"
                            onClick={() => fileInputRef.current?.click()}
                            style={editingItem.image ? { backgroundImage: `url(${editingItem.image})` } : undefined}
                        >
                            {editingItem.image ? (
                                <div className="absolute inset-0 bg-black/45 flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity text-white font-bold text-xs gap-2">
                                    <Camera size={16} /> 更改照片
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-gray-400 gap-1 p-2">
                                    {isUploading ? <Loader2 size={20} className="animate-spin text-[#FFD700]" /> : <ImageIcon size={20} />}
                                    <span className="text-[11px] font-bold">{isUploading ? '正在上传...' : '点击上传照片'}</span>
                                </div>
                            )}
                        </div>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        {editingItem.image && (
                            <button
                                type="button"
                                onClick={() => onChange({ ...editingItem, image: '' })}
                                className="mt-1.5 text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                            >
                                🗑️ 移除照片 (Remove)
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div><label className={LABEL_STYLE}>Min Level</label><input type="number" className={`${INPUT_STYLE} text-center text-orange-600`} value={editingItem.minLevel ?? ''} onChange={e => onChange({...editingItem, minLevel: parseFloat(e.target.value)})} placeholder="0" /></div>
                        <div><label className={LABEL_STYLE}>Current</label><input type="number" className={`${INPUT_STYLE} text-center`} value={editingItem.currentQty ?? ''} onChange={e => onChange({...editingItem, currentQty: parseFloat(e.target.value)})} placeholder="0" /></div>
                        <div><label className={LABEL_STYLE}>Cost (RM)</label><input type="number" className={`${INPUT_STYLE} text-center`} value={editingItem.cost ?? ''} onChange={e => onChange({...editingItem, cost: parseFloat(e.target.value)})} placeholder="0.00" /></div>
                    </div>

                    <div className="bg-orange-50 p-4 rounded-2xl border border-orange-200">
                        <h4 className="text-xs font-black text-orange-800 uppercase flex items-center gap-2 mb-2">
                            <Scale size={14}/> 基础换算设置 (Base Conversion)
                        </h4>
                        <p className="text-[10px] text-orange-600 mb-3 leading-tight">
                            设置基础单位 (如: {editingItem.unit || 'Pkt'}) 对应的重量或数量，以便食谱计算成本。
                        </p>
                        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-orange-100 shadow-sm">
                            <span className="text-xs font-bold text-gray-500 whitespace-nowrap">1 {editingItem.unit || 'UNIT'} = </span>
                            <div className="relative flex-1 flex items-center gap-2">
                                <input type="number" value={editingItem.weightPerUnit ?? ''} onChange={e => onChange({...editingItem, weightPerUnit: parseFloat(e.target.value)})}
                                    className="flex-1 p-2 bg-transparent font-black text-center text-orange-900 outline-none placeholder-gray-300 border-b border-orange-100 focus:border-orange-300 transition-colors" placeholder="0.00"/>
                                <select value={editingItem.conversionUnit || 'kg'} onChange={e => onChange({...editingItem, conversionUnit: e.target.value})}
                                    className="w-20 p-2 bg-orange-50 rounded-lg text-xs font-bold text-orange-800 outline-none border-none cursor-pointer">
                                    <option value="kg">KG</option><option value="g">GRAM</option><option value="pcs">PCS (粒/只)</option><option value="slice">SLICE (片)</option><option value="portion">PORTION (份)</option><option value="ml">ML</option><option value="l">LITER</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-black text-gray-600 uppercase flex items-center gap-2"><Calculator size={14}/> 多单位设置 (SMART UNIT CONFIG)</h4>
                            <button onClick={addUomOption} className="text-[10px] bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 font-bold">+ Add Unit</button>
                        </div>
                        <div className="space-y-3">
                            {editingItem.uomOptions && editingItem.uomOptions.length > 0 ? (
                                editingItem.uomOptions.map((uom, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm relative group">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 bg-green-100 text-green-700 rounded-lg"><Box size={14}/></div>
                                            <input className="w-24 p-1.5 border border-gray-200 rounded text-xs font-black uppercase outline-none focus:border-green-500" placeholder="UNIT NAME" value={uom.value} onChange={e => updateUomOption(idx, 'value', e.target.value)} />
                                            <div className="flex items-center border border-gray-200 rounded px-2 bg-gray-50">
                                                <span className="text-[10px] text-gray-400 font-bold mr-1">RM</span>
                                                <input type="number" className="w-16 bg-transparent text-xs font-bold outline-none py-1.5" placeholder="Auto" value={uom.price || ''} onChange={e => updateUomOption(idx, 'price', parseFloat(e.target.value))}/>
                                            </div>
                                            <button onClick={() => removeUomOption(idx)} className="ml-auto text-red-300 hover:text-red-500"><Trash2 size={14}/></button>
                                        </div>
                                        <div className="flex items-center gap-2 bg-green-50 p-2 rounded-lg border border-green-100">
                                            <span className="text-[9px] font-bold text-green-700 bg-white px-1.5 py-0.5 rounded border border-green-100">大单位 (Larger)</span>
                                            <ArrowRightLeft size={10} className="text-green-400"/>
                                            <span className="text-[9px] font-bold text-gray-400">小单位 (Smaller)</span>
                                            <div className="flex-grow flex justify-end items-center gap-2">
                                                <span className="text-xs font-black text-green-800">1 {uom.value || 'UNIT'} = </span>
                                                <input type="number" className="w-12 p-1 text-center font-black border-b-2 border-green-500 bg-transparent outline-none text-green-900" value={uom.ratio} onChange={e => updateUomOption(idx, 'ratio', parseFloat(e.target.value))} />
                                                <span className="text-xs font-black text-gray-500">{editingItem.unit || 'BASE'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-[10px] text-gray-400 italic text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
                                    暂无额外单位配置 (e.g. 1 箱 = 24 瓶)
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                        <h4 className="text-xs font-black text-gray-600 uppercase flex items-center gap-2 mb-3"><LinkIcon size={14}/> 供应商关联 (SUPPLIER LINKS)</h4>
                        {linkedSuppliers.length > 0 ? (
                            <div className="space-y-2">
                                {linkedSuppliers.map(s => (
                                    <div key={s.id} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200 text-xs">
                                        <div className="bg-blue-50 text-blue-600 p-1 rounded"><Package size={12}/></div>
                                        <span className="font-bold text-[#1A1A1A] truncate flex-1">{s.name}</span>
                                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{s.id}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[10px] text-gray-400 italic text-center py-2 bg-white rounded-xl border border-gray-100">
                                暂无关联供应商 (No links)
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-white rounded-b-3xl flex gap-3 shrink-0 fixed bottom-0 left-0 right-0 md:relative md:bottom-auto z-20">
                    {editingItem.id && (
                        <button onClick={onDelete} className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors">
                            <Trash2 size={20}/>
                        </button>
                    )}
                    <button onClick={onClose} className="flex-1 py-4 bg-white border-2 border-gray-200 text-gray-600 font-bold rounded-2xl hover:bg-gray-50 transition-colors">
                        取消
                    </button>
                    <button onClick={onSave} disabled={isSubmitting}
                        className="flex-[2] py-4 bg-[#1A1A1A] text-[#FFD700] font-black rounded-2xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                        {isSubmitting ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                        {isSubmitting ? '保存中...' : '保存更改'}
                    </button>
                </div>
            </div>
        </div>
    );
});