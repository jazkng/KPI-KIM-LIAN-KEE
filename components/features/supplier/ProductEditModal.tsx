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

    const linkedStock = productForm.linkedStockId ? allStockList.find(s => s.id === productForm.linkedStockId) : undefined;

    // Derived values for normalization and preview
    const purchaseOptions = React.useMemo(() => {
        if (!linkedStock) return [];
        const opts = (linkedStock.purchaseUnits || []).map(pu => ({
            id: pu.id,
            name: pu.unitName,
            ratio: pu.toBaseRatio,
            price: pu.pricePerUnit
        }));
        
        // Add display unit if not already present
        if (linkedStock.displayUnit && !opts.some(o => o.name.toLowerCase() === linkedStock.displayUnit?.toLowerCase())) {
            opts.push({
                id: 'display_unit_virtual',
                name: linkedStock.displayUnit,
                ratio: linkedStock.displayToBaseRatio || 1,
                price: undefined
            });
        }
        
        // Add base unit if not already present
        const bUnit = linkedStock.baseUnit || linkedStock.unit || 'pcs';
        if (bUnit && !opts.some(o => o.name.toLowerCase() === bUnit.toLowerCase())) {
            opts.push({
                id: 'base_unit_virtual',
                name: bUnit,
                ratio: 1,
                price: undefined
            });
        }
        return opts;
    }, [linkedStock]);

    const normalizedForm = React.useMemo(() => {
        const baseUnit = productForm.baseUnit || linkedStock?.baseUnit || linkedStock?.unit || productForm.unit || 'pcs';
        const displayUnit = productForm.displayUnit || linkedStock?.displayUnit;
        const displayToBaseRatio = productForm.displayToBaseRatio || linkedStock?.displayToBaseRatio || 1;
        
        let purchaseUnitName = productForm.purchaseUnitName || productForm.unit || 'unit';
        let toBaseRatio = productForm.toBaseRatio;
        if (toBaseRatio === undefined || toBaseRatio <= 0 || isNaN(toBaseRatio)) {
            const matchPU = purchaseOptions.find(pu => pu.name.toLowerCase() === purchaseUnitName.toLowerCase());
            toBaseRatio = matchPU?.ratio || 1;
        }
        
        let pricePerPurchaseUnit = productForm.pricePerPurchaseUnit !== undefined && productForm.pricePerPurchaseUnit > 0
            ? productForm.pricePerPurchaseUnit 
            : (productForm.price ?? 0);
            
        let costPerBaseUnit = productForm.costPerBaseUnit !== undefined && productForm.costPerBaseUnit > 0
            ? productForm.costPerBaseUnit
            : (toBaseRatio > 0 ? pricePerPurchaseUnit / toBaseRatio : pricePerPurchaseUnit);

        return {
            ...productForm,
            baseUnit,
            displayUnit,
            displayToBaseRatio,
            purchaseUnitName,
            toBaseRatio,
            pricePerPurchaseUnit,
            costPerBaseUnit
        };
    }, [productForm, linkedStock, purchaseOptions]);

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
                                {allStockList.filter(s => s.name.toLowerCase().includes(stockSearchTerm.toLowerCase())).map(s => {
                                    const defaultPU = s.purchaseUnits?.find(pu => pu.id === s.defaultPurchaseUnitId) || s.purchaseUnits?.[0];
                                    const toBaseRatio = defaultPU ? defaultPU.toBaseRatio : (s.displayToBaseRatio || 1);
                                    const unitName = defaultPU ? defaultPU.unitName : (s.displayUnit || s.unit || 'pcs');
                                    const priceVal = defaultPU?.pricePerUnit ?? s.cost ?? 0;
                                    
                                    return (
                                        <button 
                                            key={s.id} 
                                            onClick={() => { 
                                                onFormChange({
                                                    ...productForm, 
                                                    linkedStockId: s.id, 
                                                    name: s.name, 
                                                    unit: unitName, 
                                                    price: priceVal, 
                                                    category: s.category,
                                                    
                                                    // Prompt 3 fields
                                                    linkedPurchaseUnitId: defaultPU?.id,
                                                    purchaseUnitName: unitName,
                                                    toBaseRatio: toBaseRatio,
                                                    baseUnit: s.baseUnit || s.unit || 'pcs',
                                                    displayUnit: s.displayUnit,
                                                    displayToBaseRatio: s.displayToBaseRatio,
                                                    pricePerPurchaseUnit: priceVal,
                                                    costPerBaseUnit: priceVal / (toBaseRatio || 1)
                                                }); 
                                                onStockSearchChange(''); 
                                            }} 
                                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-xs font-bold text-gray-700 border-b border-gray-50 flex justify-between"
                                        >
                                            {s.name} <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1 rounded">{s.id}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {productForm.linkedStockId && (
                            <div className="mt-3 bg-white border border-blue-200 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg"><Box size={14}/></div>
                                    <div>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Linked Item</p>
                                        <p className="text-xs font-black text-blue-900">{linkedStock?.name || productForm.linkedStockId}</p>
                                    </div>
                                </div>
                                <button onClick={() => onFormChange({...productForm, linkedStockId: undefined, linkedPurchaseUnitId: undefined, purchaseUnitName: undefined, toBaseRatio: undefined})} className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg"><X size={14}/></button>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={SUP_LABEL_STYLE}>Item Name (商品名称)</label>
                        <input type="text" value={productForm.name || ''} onChange={e => onFormChange({...productForm, name: e.target.value})} className={SUP_INPUT_STYLE} placeholder="e.g. Fresh Chicken Breast"/>
                    </div>

                    <div>
                        <label className={SUP_LABEL_STYLE}>Pricing Mode (计价模式)</label>
                        <select
                            value={productForm.pricingMode || 'FIXED_UNIT'}
                            onChange={e => {
                                const mode = e.target.value as 'FIXED_UNIT' | 'WEIGHT_BASED';
                                if (mode === 'WEIGHT_BASED') {
                                    onFormChange({
                                        ...productForm,
                                        pricingMode: 'WEIGHT_BASED',
                                        orderUnit: productForm.orderUnit || productForm.unit || 'pcs',
                                        billingUnit: productForm.billingUnit || linkedStock?.baseUnit || 'kg',
                                        pricePerBillingUnit: productForm.pricePerBillingUnit || productForm.price || 4.90,
                                        unit: productForm.orderUnit || productForm.unit || 'pcs',
                                    });
                                } else {
                                    onFormChange({
                                        ...productForm,
                                        pricingMode: 'FIXED_UNIT'
                                    });
                                }
                            }}
                            className={SUP_INPUT_STYLE}
                        >
                            <option value="FIXED_UNIT">固定单价 (Fixed Unit Price)</option>
                            <option value="WEIGHT_BASED">称重计价 (Weight Based Price)</option>
                        </select>
                    </div>

                    {productForm.pricingMode === 'WEIGHT_BASED' ? (
                        <div className="bg-[#F5F7FA] p-4 rounded-2xl border border-gray-200/50 space-y-4">
                            <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
                                ⚖️ 称重计价配置 (Weight Based Config)
                            </h4>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Order Unit (下单单位)</label>
                                    <input 
                                        type="text"
                                        value={productForm.orderUnit || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            onFormChange({
                                                ...productForm,
                                                orderUnit: val,
                                                unit: val
                                            });
                                        }}
                                        className={SUP_INPUT_STYLE}
                                        placeholder="e.g. pcs"
                                    />
                                </div>
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Billing Unit (计价单位)</label>
                                    <input 
                                        type="text"
                                        value={productForm.billingUnit || ''}
                                        onChange={e => onFormChange({...productForm, billingUnit: e.target.value})}
                                        className={`${SUP_INPUT_STYLE} ${linkedStock ? 'bg-gray-100 text-gray-500 cursor-not-allowed font-medium' : ''}`}
                                        placeholder="e.g. kg"
                                        readOnly={!!linkedStock}
                                        disabled={!!linkedStock}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Price per Billing Unit (计价单价 RM)</label>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        value={productForm.pricePerBillingUnit ?? ''}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            const safePrice = isNaN(val) || val < 0 ? 0 : val;
                                            onFormChange({
                                                ...productForm,
                                                pricePerBillingUnit: safePrice,
                                                price: safePrice
                                            });
                                        }}
                                        className={SUP_INPUT_STYLE}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Est. Weight per Unit (预估单重 - 选填)</label>
                                    <input 
                                        type="number"
                                        step="0.1"
                                        value={productForm.estimatedWeightPerUnit ?? ''}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            const safeWeight = isNaN(val) || val <= 0 ? undefined : val;
                                            onFormChange({
                                                ...productForm,
                                                estimatedWeightPerUnit: safeWeight
                                            });
                                        }}
                                        className={SUP_INPUT_STYLE}
                                        placeholder="e.g. 8.0"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {linkedStock && purchaseOptions.length > 0 && (
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Linked Purchase Unit (选择采购单位)</label>
                                    <select
                                        value={productForm.linkedPurchaseUnitId || purchaseOptions.find(o => o.name.toLowerCase() === productForm.unit?.toLowerCase())?.id || ''}
                                        onChange={e => {
                                            const optId = e.target.value;
                                            const selectedOpt = purchaseOptions.find(o => o.id === optId);
                                            if (selectedOpt) {
                                                const newRatio = selectedOpt.ratio || 1;
                                                const currentPrice = selectedOpt.price ?? productForm.pricePerPurchaseUnit ?? productForm.price ?? 0;
                                                onFormChange({
                                                    ...productForm,
                                                    linkedPurchaseUnitId: selectedOpt.id,
                                                    purchaseUnitName: selectedOpt.name,
                                                    unit: selectedOpt.name,
                                                    toBaseRatio: newRatio,
                                                    pricePerPurchaseUnit: currentPrice,
                                                    price: currentPrice,
                                                    costPerBaseUnit: currentPrice / newRatio,
                                                    baseUnit: linkedStock.baseUnit || linkedStock.unit || 'pcs'
                                                });
                                            }
                                        }}
                                        className={SUP_INPUT_STYLE}
                                    >
                                        <option value="">-- 请选择采购单位 --</option>
                                        {purchaseOptions.map(opt => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.name} (1 {opt.name} = {opt.ratio} {linkedStock.baseUnit || linkedStock.unit || 'pcs'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>
                                        {linkedStock ? 'Purchase Unit (采购单位)' : 'Base Unit (基础单位)'}
                                    </label>
                                    <input 
                                        type="text" 
                                        value={normalizedForm.unit || ''} 
                                        onChange={e => onFormChange({...productForm, unit: e.target.value, purchaseUnitName: e.target.value})} 
                                        className={`${SUP_INPUT_STYLE} ${linkedStock ? 'bg-gray-100 text-gray-500 cursor-not-allowed font-medium' : ''}`} 
                                        placeholder="e.g. KG"
                                        readOnly={!!linkedStock}
                                        disabled={!!linkedStock}
                                    />
                                </div>
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Price (价格 RM)</label>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={productForm.pricePerPurchaseUnit ?? productForm.price ?? ''} 
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            const safePrice = isNaN(val) || val < 0 ? 0 : val;
                                            const ratio = normalizedForm.toBaseRatio || 1;
                                            onFormChange({
                                                ...productForm,
                                                pricePerPurchaseUnit: safePrice,
                                                price: safePrice,
                                                costPerBaseUnit: safePrice / ratio
                                            });
                                        }} 
                                        className={SUP_INPUT_STYLE} 
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {linkedStock && (
                        productForm.pricingMode === 'WEIGHT_BASED' ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1.5 font-bold text-[#1A1A1A]">
                                <p className="text-[10px] uppercase text-amber-800 tracking-wider">称重商品成本与库存逻辑 (Weight-Based Logic)</p>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">下单单位 (Order Unit):</span>
                                    <span>{productForm.orderUnit || 'pcs'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">记账/计价单位 (Billing Unit):</span>
                                    <span>{productForm.billingUnit || 'kg'} (与库存基础单位 {linkedStock.baseUnit} 对应)</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">供应商报价:</span>
                                    <span>RM {(productForm.pricePerBillingUnit || 0).toFixed(2)} / {productForm.billingUnit || 'kg'}</span>
                                </div>
                                <div className="flex justify-between border-t border-amber-200/50 pt-1.5 mt-1.5">
                                    <span className="text-gray-650">预计基础成本 (Estimated Base Cost):</span>
                                    <span className="text-amber-950 font-black">
                                        RM {(productForm.pricePerBillingUnit || 0).toFixed(4)} / {linkedStock.baseUnit}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1.5 font-bold text-[#1A1A1A]">
                                <p className="text-[10px] uppercase text-amber-800 tracking-wider">换算与成本预览 (Unit Conversion & Cost Preview)</p>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">配对采购单位:</span>
                                    <span>1 {normalizedForm.purchaseUnitName} = {normalizedForm.toBaseRatio} {normalizedForm.baseUnit}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">供应商报价 (Display Cost):</span>
                                    <span>RM {normalizedForm.pricePerPurchaseUnit.toFixed(2)} / {normalizedForm.purchaseUnitName}</span>
                                </div>
                                <div className="flex justify-between border-t border-amber-200/50 pt-1.5 mt-1.5">
                                    <span className="text-gray-650">单只/克成本 (Cost Per Base Unit):</span>
                                    <span className="text-amber-950 font-black">
                                        ≈ RM {normalizedForm.costPerBaseUnit.toFixed(4)} / {normalizedForm.baseUnit}
                                    </span>
                                </div>
                            </div>
                        )
                    )}

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
