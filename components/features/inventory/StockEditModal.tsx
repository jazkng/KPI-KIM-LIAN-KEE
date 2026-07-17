import React, { useRef, useState, useEffect } from 'react';
import {
    Edit3, X, Scale, Calculator, Box, ArrowRightLeft,
    Trash2, Link as LinkIcon, Package, Loader2, Save,
    Camera, Image as ImageIcon, Info, Percent, Coins, Layers, Check
} from 'lucide-react';
import { CATEGORY_SECTIONS, INPUT_STYLE, LABEL_STYLE } from './inventoryConstants';
import { StockItem, Supplier, UnitConversionRule } from '../../../types';
import { uploadToCloudinary } from '../../utils';
import { normalizeUnitName } from '../../../utils/unitConversion';

const isPurchaseSameAsDisplay = (purchaseUnitName: string, displayUnitName?: string): boolean => {
    return normalizeUnitName(purchaseUnitName) === normalizeUnitName(displayUnitName);
};

const isDisplaySameAsBase = (displayUnitName?: string, baseUnitName?: string): boolean => {
    return normalizeUnitName(displayUnitName) === normalizeUnitName(baseUnitName);
};

interface StockEditModalProps {
    editingItem: Partial<StockItem>;
    currentStockView: string;
    linkedSuppliers: Supplier[];
    isSubmitting: boolean;
    onSave: () => void;
    onDelete: () => void;
    onClose: () => void;
    onChange: (item: Partial<StockItem>) => void;
    canDelete?: boolean;
    canSave?: boolean;
}

// Common unit conversion mapping configuration
const commonConversionMap: Record<string, Record<string, number>> = {
    'kg': { 'g': 1000 },
    'g': { 'kg': 0.001 },
    'l': { 'ml': 1000 },
    'L': { 'ml': 1000 },
    'ml': { 'l': 0.001, 'L': 0.001 },
    'pcs': { 'pcs': 1 }
};

// Helper function to dynamically retrieve suggested conversion ratios
const getAutoConversionRatio = (oldUnit: string, newUnit: string): number | null => {
    const o = (oldUnit || '').trim();
    const n = (newUnit || '').trim();
    
    // Exact match case
    if (commonConversionMap[o] && commonConversionMap[o][n] !== undefined) {
        return commonConversionMap[o][n];
    }
    
    // Fallback case-insensitive match
    const oLower = o.toLowerCase();
    const nLower = n.toLowerCase();
    if (commonConversionMap[oLower] && commonConversionMap[oLower][nLower] !== undefined) {
        return commonConversionMap[oLower][nLower];
    }
    
    return null;
};

export const StockEditModal: React.FC<StockEditModalProps> = React.memo(({
    editingItem, currentStockView, linkedSuppliers, isSubmitting,
    onSave, onDelete, onClose, onChange, canDelete = true, canSave = true
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    // Ensure all modern ERP fields are initialized from legacy fallback if not present
    const baseUnit = editingItem.baseUnit || editingItem.unit || 'pcs';
    const currentQtyBase = editingItem.currentQtyBase ?? editingItem.currentQty ?? 0;
    const minLevelBase = editingItem.minLevelBase ?? editingItem.minLevel ?? 0;
    const maxQtyBase = editingItem.maxQtyBase ?? editingItem.maxQty ?? 10000;
    const yieldPercent = editingItem.yieldPercent ?? 100;
    const overheadPercent = editingItem.overheadPercent ?? 0;
    const sstPercent = editingItem.sstPercent ?? 0;
    const purchaseUnits = editingItem.purchaseUnits || [];

    const revalidatePurchaseRules = (
        pUnits: UnitConversionRule[],
        dUnit: string | undefined,
        dToBaseRatio: number
    ): UnitConversionRule[] => {
        return pUnits.map(pu => {
            const mode = pu.conversionMode || 'FIXED';
            if (mode === 'FIXED') {
                if (dUnit && isPurchaseSameAsDisplay(pu.unitName, dUnit)) {
                    return {
                        ...pu,
                        toDisplayRatio: 1,
                        toBaseRatio: dToBaseRatio
                    };
                } else {
                    const toDisplay = pu.toDisplayRatio ?? 1;
                    return {
                        ...pu,
                        toDisplayRatio: toDisplay,
                        toBaseRatio: parseFloat((toDisplay * dToBaseRatio).toFixed(4))
                    };
                }
            } else {
                // ACTUAL_WEIGHT mode
                if (dUnit && isPurchaseSameAsDisplay(pu.unitName, dUnit)) {
                    return {
                        ...pu,
                        toDisplayRatio: 1
                    };
                }
            }
            return pu;
        });
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        
        // 1. baseUnit cannot be empty
        if (!baseUnit.trim()) {
            errors.baseUnit = "系统库存单位不能为空 (Base unit required)";
        }
        
        // 2. displayToBaseRatio must be > 0
        if ((editingItem.displayToBaseRatio ?? 0) <= 0) {
            errors.displayToBaseRatio = "盘点单位比例必须大于 0 (Ratio must be > 0)";
        }
        
        // 8. Display Unit with Base Unit same check displayToBaseRatio must be 1
        if (editingItem.displayUnit && isDisplaySameAsBase(editingItem.displayUnit, baseUnit)) {
            if ((editingItem.displayToBaseRatio ?? 1) !== 1) {
                errors.displayToBaseRatio = "盘点单位与系统单位相同时，换算比例必须为 1";
            }
        }
        
        // Purchase specs validation
        const usedNames = new Set<string>();
        
        purchaseUnits.forEach((pu) => {
            const unitNameNorm = normalizeUnitName(pu.unitName);
            
            // 3. purchaseUnit.unitName cannot be empty
            if (!pu.unitName.trim()) {
                errors[`pu_${pu.id}_name`] = "采购单位名称不能为空 (Unit name required)";
            }
            
            // 4. pricePerUnit cannot be < 0
            if ((pu.pricePerUnit ?? 0) < 0) {
                errors[`pu_${pu.id}_price`] = "采购单价不能为负数 (Price cannot be negative)";
            }
            
            // 10. No two purchase specs can have the same unit name
            if (pu.unitName.trim()) {
                if (usedNames.has(unitNameNorm)) {
                    errors[`pu_${pu.id}_name`] = `不能存在两个完全相同的采购单位名称: ${pu.unitName.trim().toUpperCase()}`;
                } else {
                    usedNames.add(unitNameNorm);
                }
            }
            
            const mode = pu.conversionMode || 'FIXED';
            if (mode === 'FIXED') {
                // 5. FIXED mode toDisplayRatio must be > 0
                if ((pu.toDisplayRatio ?? 0) <= 0) {
                    errors[`pu_${pu.id}_ratio`] = "固定换算比例必须大于 0";
                }
                
                // 9. No NaN, Infinity, 0 or negative conversions
                if (isNaN(pu.toDisplayRatio ?? 0) || !isFinite(pu.toDisplayRatio ?? 0)) {
                    errors[`pu_${pu.id}_ratio`] = "换算比例不能是无效数字";
                }
                if (isNaN(pu.toBaseRatio) || !isFinite(pu.toBaseRatio) || pu.toBaseRatio <= 0) {
                    errors[`pu_${pu.id}_toBase`] = "基础换算比例不能是无效数字且必须大于0";
                }
                
                // 7. When purchase unit === display unit, toDisplayRatio must be 1
                if (editingItem.displayUnit && isPurchaseSameAsDisplay(pu.unitName, editingItem.displayUnit)) {
                    if (pu.toDisplayRatio !== 1) {
                        errors[`pu_${pu.id}_ratio`] = "采购与盘点单位相同时，折合盘点比例必须为 1";
                    }
                    const expectedBase = editingItem.displayToBaseRatio ?? 1;
                    if (Math.abs(pu.toBaseRatio - expectedBase) > 0.0001) {
                        errors[`pu_${pu.id}_toBase`] = `采购与盘点单位相同时，折合基础比例应为 ${expectedBase}`;
                    }
                } else {
                    // 6. FIXED mode toBaseRatio must be equal to: toDisplayRatio * displayToBaseRatio
                    const expectedBaseRatio = (pu.toDisplayRatio ?? 1) * (editingItem.displayToBaseRatio ?? 1);
                    if (Math.abs(pu.toBaseRatio - expectedBaseRatio) > 0.01) {
                        errors[`pu_${pu.id}_toBase`] = `换算结果不一致：折合基础应等于 [折合盘点] × [盘点比例] = ${expectedBaseRatio}`;
                    }
                }
            } else {
                // ACTUAL_WEIGHT mode
                if (isNaN(pu.toBaseRatio) || !isFinite(pu.toBaseRatio) || pu.toBaseRatio <= 0) {
                    errors[`pu_${pu.id}_toBase`] = "预估重量必须大于 0";
                }
                if (editingItem.displayUnit && isPurchaseSameAsDisplay(pu.unitName, editingItem.displayUnit)) {
                    if (pu.toDisplayRatio !== 1) {
                        errors[`pu_${pu.id}_ratio`] = "采购与盘点单位相同时，折合盘点比例必须为 1";
                    }
                }
            }
        });
        
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handlePreSave = () => {
        if (!editingItem || !editingItem.name) {
            setValidationErrors(prev => ({ ...prev, name: "请输入物品名称 (Name required)" }));
            return;
        }
        if (validateForm()) {
            onSave();
        } else {
            alert("❌ 请先修正页面中的换算或单位错误后再保存。");
        }
    };

    // State trackers for unit migration helper
    const [originalBaseUnit, setOriginalBaseUnit] = useState(baseUnit);
    const [originalCurrentQtyBase, setOriginalCurrentQtyBase] = useState(currentQtyBase);
    const [originalMinLevelBase, setOriginalMinLevelBase] = useState(minLevelBase);
    const [originalMaxQtyBase, setOriginalMaxQtyBase] = useState(maxQtyBase);
    const [conversionRatio, setConversionRatio] = useState<number>(1);

    // Prevent background scrolling on mobile to stop address bar resizing/flickering
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    useEffect(() => {
        const u = editingItem.baseUnit || editingItem.unit || 'pcs';
        const q = editingItem.currentQtyBase ?? editingItem.currentQty ?? 0;
        const minL = editingItem.minLevelBase ?? editingItem.minLevel ?? 0;
        const maxQ = editingItem.maxQtyBase ?? editingItem.maxQty ?? 10000;
        setOriginalBaseUnit(u);
        setOriginalCurrentQtyBase(q);
        setOriginalMinLevelBase(minL);
        setOriginalMaxQtyBase(maxQ);
        setConversionRatio(1);
    }, [editingItem.id]);

    // Automatically suggest conversionRatio when baseUnit is modified by user
    useEffect(() => {
        if (baseUnit !== originalBaseUnit) {
            const ratio = getAutoConversionRatio(originalBaseUnit, baseUnit);
            if (ratio !== null) {
                setConversionRatio(ratio);
            } else {
                setConversionRatio(1);
            }
        } else {
            setConversionRatio(1);
        }
    }, [baseUnit, originalBaseUnit]);

    const handleApplyConversion = () => {
        if (isNaN(conversionRatio) || conversionRatio <= 0 || !isFinite(conversionRatio)) {
            alert("❌ 错误：换算比例必须大于 0 (Ratio must be > 0)");
            return;
        }

        const nextCurrentQtyBase = originalCurrentQtyBase * conversionRatio;
        const nextMinLevelBase = originalMinLevelBase * conversionRatio;
        const nextMaxQtyBase = originalMaxQtyBase * conversionRatio;

        // Suggested purchase units logic
        const updatedPurchaseUnits = [...purchaseUnits];
        const defaultPUIndex = updatedPurchaseUnits.findIndex(pu => pu.isDefaultPurchase);
        
        if (defaultPUIndex >= 0) {
            updatedPurchaseUnits[defaultPUIndex] = {
                ...updatedPurchaseUnits[defaultPUIndex],
                unitName: originalBaseUnit,
                toBaseRatio: conversionRatio
            };
        } else if (updatedPurchaseUnits.length > 0) {
            updatedPurchaseUnits[0] = {
                ...updatedPurchaseUnits[0],
                unitName: originalBaseUnit,
                toBaseRatio: conversionRatio
            };
        } else {
            updatedPurchaseUnits.push({
                id: `pu_${Date.now()}_default`,
                unitName: originalBaseUnit,
                unitType: 'PURCHASE',
                toBaseRatio: conversionRatio,
                pricePerUnit: 0,
                isDefaultPurchase: true
            });
        }

        onChange({
            ...editingItem,
            currentQtyBase: nextCurrentQtyBase,
            currentQty: nextCurrentQtyBase, // sync with legacy
            minLevelBase: nextMinLevelBase,
            minLevel: nextMinLevelBase, // sync with legacy
            maxQtyBase: nextMaxQtyBase,
            maxQty: nextMaxQtyBase, // sync with legacy
            displayUnit: originalBaseUnit,
            displayToBaseRatio: conversionRatio,
            preferredStockViewUnit: 'DISPLAY',
            purchaseUnits: updatedPurchaseUnits
        });

        setOriginalBaseUnit(baseUnit);
        setOriginalCurrentQtyBase(nextCurrentQtyBase);
        setOriginalMinLevelBase(nextMinLevelBase);
        setOriginalMaxQtyBase(nextMaxQtyBase);
        
        alert(`✅ 成功应用单位换算！\n基础库存已调整为: ${nextCurrentQtyBase} ${baseUnit}\n盘点视图已自动建议为: ${originalBaseUnit}\n换算比为: 1 ${originalBaseUnit} = ${conversionRatio} ${baseUnit}`);
    };

    // Automatically recalculate costPerBaseUnit based on default purchase unit or first purchase unit
    const defaultPU = purchaseUnits.find(p => p.isDefaultPurchase) || purchaseUnits[0];
    const computedCostPerBaseUnit = defaultPU && typeof defaultPU.pricePerUnit === 'number' && defaultPU.pricePerUnit > 0 && defaultPU.toBaseRatio > 0 
        ? defaultPU.pricePerUnit / defaultPU.toBaseRatio 
        : (editingItem.costPerBaseUnit ?? editingItem.cost ?? 0);

    // Sync computed cost to item on change of conversion rules
    useEffect(() => {
        if (editingItem.costPerBaseUnit !== computedCostPerBaseUnit) {
            onChange({
                ...editingItem,
                costPerBaseUnit: computedCostPerBaseUnit
            });
        }
    }, [computedCostPerBaseUnit]);

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

    const addPurchaseUnit = () => {
        const newRule: UnitConversionRule = {
            id: `pu_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            unitName: '',
            unitType: 'PURCHASE',
            toBaseRatio: 1,
            toDisplayRatio: 1,
            conversionMode: 'FIXED',
            pricePerUnit: 0,
            isDefaultPurchase: purchaseUnits.length === 0
        };
        onChange({
            ...editingItem,
            purchaseUnits: [...purchaseUnits, newRule]
        });
    };

    const updatePurchaseUnit = (id: string, field: keyof UnitConversionRule, value: any) => {
        const currentDisplayToBaseRatio = editingItem.displayToBaseRatio ?? 1;
        const updated = purchaseUnits.map(pu => {
            if (pu.id === id) {
                const updatedRule = { ...pu, [field]: value };
                const isSame = isPurchaseSameAsDisplay(updatedRule.unitName, editingItem.displayUnit);
                
                if (field === 'toDisplayRatio') {
                    if (isSame && updatedRule.conversionMode !== 'ACTUAL_WEIGHT') {
                        updatedRule.toDisplayRatio = 1;
                        updatedRule.toBaseRatio = currentDisplayToBaseRatio;
                    } else {
                        const toDisplay = parseFloat(value) || 0;
                        updatedRule.toBaseRatio = parseFloat((toDisplay * currentDisplayToBaseRatio).toFixed(4));
                    }
                } else if (field === 'toBaseRatio') {
                    if (isSame && updatedRule.conversionMode !== 'ACTUAL_WEIGHT') {
                        updatedRule.toDisplayRatio = 1;
                        updatedRule.toBaseRatio = currentDisplayToBaseRatio;
                    } else {
                        const toBase = parseFloat(value) || 0;
                        updatedRule.toDisplayRatio = currentDisplayToBaseRatio > 0 ? parseFloat((toBase / currentDisplayToBaseRatio).toFixed(4)) : toBase;
                    }
                } else if (field === 'conversionMode' && value === 'ACTUAL_WEIGHT') {
                    updatedRule.conversionMode = 'ACTUAL_WEIGHT';
                    if (isSame) {
                        updatedRule.toDisplayRatio = 1;
                    }
                } else if (field === 'conversionMode' && value === 'FIXED') {
                    updatedRule.conversionMode = 'FIXED';
                    if (isSame) {
                        updatedRule.toDisplayRatio = 1;
                        updatedRule.toBaseRatio = currentDisplayToBaseRatio;
                    }
                } else if (field === 'unitName') {
                    if (isSame) {
                        updatedRule.toDisplayRatio = 1;
                        if (updatedRule.conversionMode !== 'ACTUAL_WEIGHT') {
                            updatedRule.toBaseRatio = currentDisplayToBaseRatio;
                        }
                    }
                }
                
                if (field === 'isDefaultPurchase' && value === true) {
                    return { ...updatedRule, isDefaultPurchase: true };
                }
                return updatedRule;
            }
            if (field === 'isDefaultPurchase' && value === true) {
                return { ...pu, isDefaultPurchase: false };
            }
            return pu;
        });
        onChange({
            ...editingItem,
            purchaseUnits: updated
        });
    };

    const removePurchaseUnit = (id: string) => {
        const updated = purchaseUnits.filter(pu => pu.id !== id);
        // If we removed default, make the first one default
        if (updated.length > 0 && !updated.some(pu => pu.isDefaultPurchase)) {
            updated[0].isDefaultPurchase = true;
        }
        onChange({
            ...editingItem,
            purchaseUnits: updated
        });
    };

    return (
        <div className="fixed inset-0 bg-[#111111]/75 z-[200] flex items-center justify-center p-0 md:p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#F6F7FB] w-full h-[100dvh] md:h-auto md:max-w-xl md:max-h-[92vh] md:rounded-[24px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col relative overflow-hidden border border-[#E5E7EB]">
                
                {/* Header - Optimized for iOS Notch safe area */}
                <div className="p-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))] md:pt-5 shrink-0 bg-white border-b border-[#E5E7EB] z-10">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#FFD200] bg-[#111111] px-2.5 py-1 rounded-full">
                                ERP Stock Master Data
                            </span>
                            <h3 className="font-black text-lg md:text-2xl text-[#111111] mt-1.5 flex items-center gap-2">
                                <Edit3 size={20} className="text-[#111111]"/> 
                                {editingItem.id ? '编辑库存基础档案' : '新建库存基础档案'}
                            </h3>
                        </div>
                        <button 
                            type="button"
                            onClick={onClose} 
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                            <X size={20} className="text-gray-500"/>
                        </button>
                    </div>
                </div>

                {/* Form Body - Card Sections - Optimized scroll container with standard flex layout */}
                <div className="p-5 space-y-5 overflow-y-auto flex-grow pb-6">
                    
                    {/* Card Section 1: Basic Info */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
                            <span className="w-1.5 h-4 bg-[#FFD200] rounded-full"></span>
                            <h4 className="text-xs font-extrabold text-[#111111] uppercase tracking-wide">基本信息 (Basic Info)</h4>
                        </div>
                        
                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>品名 (Material Name)</label>
                            <input 
                                className={`${INPUT_STYLE} focus:border-[#FFD200] focus:ring-1 focus:ring-[#FFD200] transition-all`} 
                                value={editingItem.name || ''} 
                                onChange={e => onChange({...editingItem, name: e.target.value})} 
                                placeholder="例如: 招牌大面、大白面 (Pork Slices / Yellow Noodle)" 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>物料编码 (ID Code)</label>
                                <input 
                                    className={`${INPUT_STYLE} font-mono bg-gray-50 text-gray-400 cursor-not-allowed`} 
                                    value={editingItem.id || '自动生成 (Auto)'} 
                                    readOnly 
                                    placeholder="Auto" 
                                />
                            </div>
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>物料分类 (Sub Category)</label>
                                <select 
                                    className={`${INPUT_STYLE} focus:border-[#FFD200] focus:ring-1 focus:ring-[#FFD200] transition-all`} 
                                    value={editingItem.category || CATEGORY_SECTIONS[currentStockView]?.[0]?.id} 
                                    onChange={e => onChange({...editingItem, category: e.target.value})}
                                >
                                    {CATEGORY_SECTIONS[currentStockView]?.map(c => (
                                        <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Image Upload Area */}
                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>商品照片 (Photo)</label>
                            <div
                                className="relative h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl overflow-hidden cursor-pointer group flex items-center justify-center bg-cover bg-center transition-all hover:border-[#FFD200]"
                                onClick={() => fileInputRef.current?.click()}
                                style={editingItem.image ? { backgroundImage: `url(${editingItem.image})` } : undefined}
                            >
                                {editingItem.image ? (
                                    <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold text-xs gap-2">
                                        <Camera size={16} /> 更改照片
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-gray-400 gap-1 p-2">
                                        {isUploading ? <Loader2 size={20} className="animate-spin text-[#FFD200]" /> : <ImageIcon size={20} />}
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
                    </div>

                    {/* Card Section 2: System Stock & Cost Unit */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
                            <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
                            <h4 className="text-xs font-extrabold text-[#111111] uppercase tracking-wide">系统库存与成本单位 (System Stock & Cost Unit)</h4>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                            系统实际保存库存数量的单位，也用于菜谱扣库存和成本计算，例如 kg、g、ml、pcs。
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>系统库存单位 (Base Unit)</label>
                                <input 
                                    className={`${INPUT_STYLE} font-bold text-center focus:border-[#FFD200] ${validationErrors.baseUnit ? 'border-red-500 ring-1 ring-red-500' : ''}`} 
                                    value={baseUnit} 
                                    onChange={e => {
                                        const newBase = e.target.value;
                                        const isSame = isDisplaySameAsBase(editingItem.displayUnit, newBase);
                                        const nextRatio = isSame ? 1 : (editingItem.displayToBaseRatio ?? 1);
                                        const updatedItem = {
                                            ...editingItem,
                                            baseUnit: newBase,
                                            unit: newBase, // Sync with legacy field
                                            displayToBaseRatio: nextRatio
                                        };
                                        if (updatedItem.purchaseUnits) {
                                            updatedItem.purchaseUnits = revalidatePurchaseRules(updatedItem.purchaseUnits, updatedItem.displayUnit, nextRatio);
                                        }
                                        onChange(updatedItem);
                                        setValidationErrors(prev => {
                                            const copy = { ...prev };
                                            delete copy.baseUnit;
                                            return copy;
                                        });
                                    }} 
                                    placeholder="g, ml, pcs, kg" 
                                />
                                {validationErrors.baseUnit && <p className="text-[10px] text-red-500 font-bold mt-1">⚠️ {validationErrors.baseUnit}</p>}
                            </div>
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>当前基础库存 (Current Base Qty)</label>
                                <input 
                                    type="number" 
                                    className={`${INPUT_STYLE} font-black text-center focus:border-[#FFD200]`} 
                                    value={currentQtyBase} 
                                    onChange={e => onChange({
                                        ...editingItem,
                                        currentQtyBase: parseFloat(e.target.value) || 0,
                                        currentQty: parseFloat(e.target.value) || 0 // Sync with legacy field
                                    })} 
                                    placeholder="0" 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>安全警报量 (Min Level)</label>
                                <input 
                                    type="number" 
                                    className={`${INPUT_STYLE} text-center focus:border-[#FFD200] text-red-600 font-bold`} 
                                    value={minLevelBase} 
                                    onChange={e => onChange({
                                        ...editingItem,
                                        minLevelBase: parseFloat(e.target.value) || 0,
                                        minLevel: parseFloat(e.target.value) || 0 // Sync with legacy field
                                    })} 
                                    placeholder="0" 
                                />
                            </div>
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>最大容量 (Max Capacity)</label>
                                <input 
                                    type="number" 
                                    className={`${INPUT_STYLE} text-center focus:border-[#FFD200] text-gray-600 font-bold`} 
                                    value={maxQtyBase} 
                                    onChange={e => onChange({
                                        ...editingItem,
                                        maxQtyBase: parseFloat(e.target.value) || 0,
                                        maxQty: parseFloat(e.target.value) || 0 // Sync with legacy field
                                    })} 
                                    placeholder="0" 
                                />
                            </div>
                        </div>

                        {/* Yellow Warning Card (Unit Migration Helper) */}
                        {baseUnit !== originalBaseUnit && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3 shadow-xs animate-in slide-in-from-top-2 duration-150">
                                <div className="flex gap-2 text-yellow-850">
                                    <Info size={18} className="shrink-0 mt-0.5 text-yellow-600" />
                                    <div>
                                        <h5 className="font-bold text-xs text-yellow-800">⚠️ 警告：检测到库存基础单位变更</h5>
                                        <p className="text-[11px] leading-relaxed mt-1 text-yellow-700">
                                            你正在将库存基础单位从 <span className="font-extrabold underline">{originalBaseUnit}</span> 更改为 <span className="font-extrabold underline">{baseUnit}</span>。
                                            若不转换历史库存数值，当前库存数量可能会被误算（例如 {originalCurrentQtyBase} {originalBaseUnit} 会变成 {originalCurrentQtyBase} {baseUnit}）。
                                        </p>
                                    </div>
                                </div>

                                {getAutoConversionRatio(originalBaseUnit, baseUnit) === null && (
                                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/50 rounded-xl p-2.5 font-bold flex items-center gap-1.5 leading-snug animate-in fade-in duration-150">
                                        <span>⚠️</span>
                                        <span>系统无法自动判断换算比例，请手动确认。</span>
                                    </div>
                                )}

                                <div className="bg-white/75 rounded-lg p-3 border border-yellow-100 space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-gray-500">旧单位数量:</span>
                                        <span className="font-extrabold font-mono text-gray-900">{originalCurrentQtyBase} {originalBaseUnit}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-500">每 1 {originalBaseUnit} 等于:</span>
                                        <div className="flex items-center gap-1">
                                            <input 
                                                type="number" 
                                                step="any"
                                                className="w-20 px-2 py-1 bg-white border border-yellow-200 focus:border-[#FFD200] rounded text-center font-bold text-[#111111]"
                                                value={conversionRatio}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    setConversionRatio(isNaN(val) ? 0 : val);
                                                }}
                                            />
                                            <span className="font-extrabold text-gray-700">{baseUnit}</span>
                                        </div>
                                    </div>

                                    <div className="border-t border-yellow-100/50 pt-2 flex flex-col gap-1 text-[11px]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500 font-bold">系统自动计算新库存:</span>
                                            {(isNaN(conversionRatio) || !isFinite(conversionRatio) || conversionRatio <= 0) ? (
                                                <span className="text-red-500 font-black">❌ 换算比例无效 (必须大于 0)</span>
                                            ) : (
                                                <span className="font-extrabold text-blue-600 font-mono">
                                                    {originalCurrentQtyBase} {originalBaseUnit} × {conversionRatio} = {(originalCurrentQtyBase * conversionRatio)} {baseUnit}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleApplyConversion}
                                    className="w-full py-2 bg-[#FFD200] hover:bg-yellow-400 text-[#111111] font-black rounded-lg text-xs transition-all shadow-sm active:scale-95"
                                >
                                    应用换算并同步建议 (Apply Conversion)
                                </button>
                            </div>
                        )}
                    </div>

                    {/* New Card Section: Display / Ordering Unit */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
                            <span className="w-1.5 h-4 bg-[#FFD200] rounded-full"></span>
                            <h4 className="text-xs font-extrabold text-[#111111] uppercase tracking-wide">盘点显示单位 (Stock Count Display Unit)</h4>
                        </div>
                        
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                            员工在库存总览和盘点时习惯使用的单位，例如 PACK、TRAY、BOTTLE。此单位不会改变系统的基础库存单位。
                        </p>

                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>首选查看/盘点单位 (Preferred View Unit)</label>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChange({ ...editingItem, preferredStockViewUnit: 'BASE' });
                                    }}
                                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all ${
                                        (editingItem.preferredStockViewUnit || 'BASE') === 'BASE'
                                            ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-sm'
                                            : 'bg-white text-gray-500 border-[#E5E7EB] hover:bg-gray-50'
                                    }`}
                                >
                                    基础单位 ({baseUnit})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...editingItem, preferredStockViewUnit: 'DISPLAY' })}
                                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all ${
                                        editingItem.preferredStockViewUnit === 'DISPLAY'
                                            ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-sm'
                                            : 'bg-white text-gray-500 border-[#E5E7EB] hover:bg-gray-50'
                                    }`}
                                >
                                    展示单位 ({editingItem.displayUnit || '未设定'})
                                </button>
                            </div>
                        </div>

                        {editingItem.preferredStockViewUnit === 'DISPLAY' && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-150">
                                <div>
                                    <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>员工盘点单位 (Display Unit)</label>
                                    <input 
                                        className={`${INPUT_STYLE} font-bold text-center focus:border-[#FFD200]`} 
                                        value={editingItem.displayUnit || ''} 
                                        onChange={e => {
                                            const newDisplay = e.target.value;
                                            const isSame = isDisplaySameAsBase(newDisplay, baseUnit);
                                            const nextRatio = isSame ? 1 : (editingItem.displayToBaseRatio ?? 1);
                                            const updatedItem = {
                                                ...editingItem,
                                                displayUnit: newDisplay,
                                                displayToBaseRatio: nextRatio
                                            };
                                            if (updatedItem.purchaseUnits) {
                                                updatedItem.purchaseUnits = revalidatePurchaseRules(updatedItem.purchaseUnits, newDisplay, nextRatio);
                                            }
                                            onChange(updatedItem);
                                        }} 
                                        placeholder="例如: tray, box" 
                                    />
                                    {isDisplaySameAsBase(editingItem.displayUnit, baseUnit) && editingItem.displayUnit && (
                                        <p className="text-[10px] text-emerald-600 font-bold mt-1">💡 盘点单位与系统单位相同，比例自动设定为 1。</p>
                                    )}
                                </div>
                                {!isDisplaySameAsBase(editingItem.displayUnit, baseUnit) ? (
                                    <div>
                                        <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}>
                                            每 1 {editingItem.displayUnit || '展示单位'} 包含
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                step="any"
                                                className={`${INPUT_STYLE} font-black text-center pr-10 focus:border-[#FFD200] ${validationErrors.displayToBaseRatio ? 'border-red-500 ring-1 ring-red-500' : ''}`} 
                                                value={editingItem.displayToBaseRatio ?? ''} 
                                                onChange={e => {
                                                    const ratio = parseFloat(e.target.value) || 1;
                                                    const updatedItem = {
                                                        ...editingItem,
                                                        displayToBaseRatio: ratio
                                                    };
                                                    if (updatedItem.purchaseUnits) {
                                                        updatedItem.purchaseUnits = revalidatePurchaseRules(updatedItem.purchaseUnits, editingItem.displayUnit, ratio);
                                                    }
                                                    onChange(updatedItem);
                                                    setValidationErrors(prev => {
                                                        const copy = { ...prev };
                                                        delete copy.displayToBaseRatio;
                                                        return copy;
                                                    });
                                                }} 
                                                placeholder="10" 
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-gray-400 font-bold">{baseUnit}</span>
                                        </div>
                                        {validationErrors.displayToBaseRatio && <p className="text-[10px] text-red-500 font-bold mt-1">⚠️ {validationErrors.displayToBaseRatio}</p>}
                                    </div>
                                ) : (
                                    <div className="flex flex-col justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onChange({
                                                    ...editingItem,
                                                    displayUnit: baseUnit,
                                                    displayToBaseRatio: 1
                                                });
                                            }}
                                            className="w-full h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center border border-gray-200"
                                        >
                                            直接使用系统库存单位
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {editingItem.preferredStockViewUnit === 'DISPLAY' && editingItem.displayUnit && (editingItem.displayToBaseRatio || 0) > 0 && !isDisplaySameAsBase(editingItem.displayUnit, baseUnit) && (
                            <div className="bg-[#F6F7FB] border border-[#E5E7EB] rounded-xl p-3 text-xs text-gray-600 font-medium space-y-1 animate-in fade-in duration-200">
                                <div className="flex justify-between">
                                    <span>转换关系:</span>
                                    <span className="font-bold text-[#111111]">1 {editingItem.displayUnit} = {editingItem.displayToBaseRatio} {baseUnit}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>盘点输入 1 {editingItem.displayUnit} =</span>
                                    <span className="font-bold text-blue-600">系统自动保存为 {editingItem.displayToBaseRatio} {baseUnit}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>当前基础库存:</span>
                                    <span className="font-bold text-gray-900">{currentQtyBase} {baseUnit}</span>
                                </div>
                                <div className="flex justify-between border-t border-gray-200/50 pt-1.5 mt-1.5">
                                    <span>总览展示数量:</span>
                                    <span className="font-black text-emerald-600">
                                        {(currentQtyBase / (editingItem.displayToBaseRatio || 1)).toFixed(2)} {editingItem.displayUnit}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card Section 3: Purchase Unit Conversion */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-[#F6F7FB] pb-2.5 mb-1">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                                <h4 className="text-xs font-extrabold text-[#111111] uppercase tracking-wide">供应商采购规格 (Supplier Purchase Unit)</h4>
                            </div>
                            <button 
                                type="button" 
                                onClick={addPurchaseUnit} 
                                className="text-[10px] bg-white border border-[#E5E7EB] hover:border-[#FFD200] hover:text-[#FFD200] px-2.5 py-1.5 rounded-lg font-black transition-all min-h-[44px] flex items-center justify-center px-3"
                            >
                                + 增加采购规格
                            </button>
                        </div>
                        
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                            供应商报价、采购单和Invoice使用的单位，例如 PACK、CTN、BUNDLE、BOX。
                        </p>

                        <div className="space-y-3">
                            {purchaseUnits.length > 0 ? (
                                purchaseUnits.map((pu, index) => {
                                    const mode = pu.conversionMode || 'FIXED';
                                    const costPerBase = pu.toBaseRatio > 0 ? (pu.pricePerUnit || 0) / pu.toBaseRatio : 0;
                                    const isSame = isPurchaseSameAsDisplay(pu.unitName, editingItem.displayUnit);
                                    
                                    // Detect erroneous old data in DB (same unit name but ratio not aligned to 1 or display ratio is wrong)
                                    const isErroneousSameUnit = mode !== 'ACTUAL_WEIGHT' && 
                                                                editingItem.displayUnit && 
                                                                isSame && 
                                                                (pu.toDisplayRatio !== 1 || Math.abs(pu.toBaseRatio - (editingItem.displayToBaseRatio ?? 1)) > 0.0001);

                                    return (
                                        <div key={pu.id} className={`p-4 bg-[#F6F7FB] rounded-xl border relative space-y-3 shadow-xs transition-all duration-200 ${isErroneousSameUnit ? 'border-red-300 ring-1 ring-red-100 bg-red-50/20' : 'border-[#E5E7EB]'}`}>
                                            {/* Header Inputs Row - Fully Optimized with flex-wrap and HIG-compliant tap targets */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <div className="w-24 shrink-0">
                                                            <input 
                                                                className={`bg-white p-2 rounded-lg border text-xs font-black uppercase outline-none focus:border-[#FFD200] w-full h-[44px] ${validationErrors[`pu_${pu.id}_name`] ? 'border-red-500 ring-1 ring-red-500' : 'border-[#E5E7EB]'}`}
                                                                placeholder="CTN"
                                                                value={pu.unitName}
                                                                onChange={e => {
                                                                    const newName = e.target.value;
                                                                    const updatedPUs = purchaseUnits.map(item => {
                                                                        if (item.id === pu.id) {
                                                                            const isSameUnit = isPurchaseSameAsDisplay(newName, editingItem.displayUnit);
                                                                            if (isSameUnit && mode === 'FIXED') {
                                                                                return {
                                                                                    ...item,
                                                                                    unitName: newName,
                                                                                    toDisplayRatio: 1,
                                                                                    toBaseRatio: editingItem.displayToBaseRatio ?? 1
                                                                                };
                                                                            }
                                                                            return { ...item, unitName: newName };
                                                                        }
                                                                        return item;
                                                                    });
                                                                    onChange({
                                                                        ...editingItem,
                                                                        purchaseUnits: updatedPUs
                                                                    });
                                                                    setValidationErrors(prev => {
                                                                        const copy = { ...prev };
                                                                        delete copy[`pu_${pu.id}_name`];
                                                                        return copy;
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                        
                                                        <div className="flex-1 flex items-center gap-1.5 bg-white border px-2.5 rounded-lg min-h-[44px]">
                                                            <span className="text-[10px] font-black text-gray-400">RM</span>
                                                            <input 
                                                                type="number"
                                                                step="0.01"
                                                                className="w-full bg-transparent p-2 text-xs font-black text-[#111111] outline-none"
                                                                placeholder="单价"
                                                                value={pu.pricePerUnit ?? ''}
                                                                onChange={e => {
                                                                    updatePurchaseUnit(pu.id, 'pricePerUnit', parseFloat(e.target.value) || 0);
                                                                    setValidationErrors(prev => {
                                                                        const copy = { ...prev };
                                                                        delete copy[`pu_${pu.id}_price`];
                                                                        return copy;
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => updatePurchaseUnit(pu.id, 'isDefaultPurchase', !pu.isDefaultPurchase)}
                                                            className={`flex-1 sm:flex-initial p-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 h-[44px] px-3 ${
                                                                pu.isDefaultPurchase 
                                                                    ? 'bg-[#111111] border-[#111111] text-[#FFD200]' 
                                                                    : 'bg-white border-[#E5E7EB] text-gray-400 hover:text-gray-600'
                                                            }`}
                                                            title={pu.isDefaultPurchase ? '默认采购单位' : '设为默认采购'}
                                                        >
                                                            {pu.isDefaultPurchase ? <Check size={14}/> : null}
                                                            默认
                                                        </button>

                                                        <button 
                                                            type="button"
                                                            onClick={() => removePurchaseUnit(pu.id)} 
                                                            className="p-2 border border-red-200 bg-white hover:bg-red-50 text-red-500 rounded-lg transition-colors h-[44px] w-[44px] flex items-center justify-center shrink-0"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </div>
                                                </div>
                                                {validationErrors[`pu_${pu.id}_name`] && <p className="text-[10px] text-red-500 font-bold">⚠️ {validationErrors[`pu_${pu.id}_name`]}</p>}
                                                {validationErrors[`pu_${pu.id}_price`] && <p className="text-[10px] text-red-500 font-bold">⚠️ {validationErrors[`pu_${pu.id}_price`]}</p>}
                                            </div>

                                            {/* Legacy Same-Unit Error Repair Button */}
                                            {isErroneousSameUnit && (
                                                <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-xs font-medium space-y-2 animate-in fade-in duration-150">
                                                    <p>⚠️ 检测到单位换算比例异常：你的采购单位 <strong>{pu.unitName}</strong> 与盘点展示单位 <strong>{editingItem.displayUnit}</strong> 为相同单位，但换算比不是 1。这会导致库存或报价账目错乱。</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = purchaseUnits.map(item => {
                                                                if (item.id === pu.id) {
                                                                    return {
                                                                        ...item,
                                                                        toDisplayRatio: 1,
                                                                        toBaseRatio: editingItem.displayToBaseRatio ?? 1
                                                                    };
                                                                }
                                                                return item;
                                                            });
                                                            onChange({
                                                                ...editingItem,
                                                                purchaseUnits: updated
                                                            });
                                                        }}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg text-[10px] transition-all"
                                                    >
                                                        ⚡ 一键校准相同单位比例为 1
                                                    </button>
                                                </div>
                                            )}

                                            {/* Mode Selector - Stretch buttons equally on mobile */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-b border-gray-200/50 py-2.5 text-xs">
                                                <span className="font-bold text-gray-400">换算模式:</span>
                                                <div className="flex gap-1.5 w-full sm:w-auto">
                                                    <button
                                                        type="button"
                                                        onClick={() => updatePurchaseUnit(pu.id, 'conversionMode', 'FIXED')}
                                                        className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg border text-[10px] font-black transition-all h-[36px] flex items-center justify-center ${
                                                            mode === 'FIXED'
                                                                ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-xs'
                                                                : 'bg-white text-gray-500 border-[#E5E7EB] hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        ⚙️ 固定比例 (Fixed)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updatePurchaseUnit(pu.id, 'conversionMode', 'ACTUAL_WEIGHT')}
                                                        className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg border text-[10px] font-black transition-all h-[36px] flex items-center justify-center ${
                                                            mode === 'ACTUAL_WEIGHT'
                                                                ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-xs'
                                                                : 'bg-white text-gray-500 border-[#E5E7EB] hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        ⚖️ 实际称重 (Actual)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Conversion Ratio Input & Business Language Layout */}
                                            {mode === 'ACTUAL_WEIGHT' ? (
                                                <div className="space-y-3 animate-in slide-in-from-top-1 duration-150">
                                                    <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-[#E5E7EB] text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-extrabold text-orange-600">单箱预估重量 ≈</span>
                                                            <input 
                                                                type="number"
                                                                className="w-16 text-center font-black border-b border-[#E5E7EB] focus:border-[#FFD200] outline-none bg-transparent"
                                                                value={pu.toBaseRatio ?? 1}
                                                                onChange={e => updatePurchaseUnit(pu.id, 'toBaseRatio', parseFloat(e.target.value) || 1)}
                                                            />
                                                            <span className="font-extrabold text-[#111111]">{baseUnit}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] text-gray-400 block font-bold">参考成本 (Est Cost)</span>
                                                            <span className="font-black text-[#111111] text-xs font-mono">
                                                                RM {costPerBase.toFixed(4)} / {baseUnit}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1.5 text-xs text-orange-800 leading-relaxed">
                                                        <div className="font-extrabold text-[11px] text-orange-950">⚖️ 实际称重模式换算机制：</div>
                                                        <p className="text-[11px]">
                                                            订购单位：<strong>1 {pu.unitName || '包装'}</strong> (报价：<strong>RM {pu.pricePerUnit?.toFixed(2)}</strong>)<br />
                                                            入库行为：每次对账/入库时，手动输入每箱的<strong>实际称重数值</strong>，系统累加实际重量到系统库存（系统自动以实际重量计算精确成本）。
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                // FIXED Mode
                                                <div className="space-y-3 animate-in slide-in-from-top-1 duration-150">
                                                    {/* If displayUnit is defined and different from baseUnit */}
                                                    {editingItem.displayUnit && !isDisplaySameAsBase(editingItem.displayUnit, baseUnit) ? (
                                                        isSame ? (
                                                            // Purchase unit is SAME as display unit (Automatic lock to 1)
                                                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
                                                                <span className="font-black block text-emerald-950 mb-1">📦 采购与盘点使用相同单位：</span>
                                                                <p className="text-[11px] leading-relaxed">
                                                                    1 {pu.unitName} 自动关联为 1 {editingItem.displayUnit} = <strong>{editingItem.displayToBaseRatio} {baseUnit}</strong>。<br />
                                                                    无需手动设置两层换算比例，避免配算错误。
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            // Full Three-tier Conversion Input - Wrapped and centered nicely for mobile
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-[#E5E7EB] text-xs">
                                                                <span className="font-extrabold text-gray-400 shrink-0">三级单位关系:</span>
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="font-black text-emerald-600">
                                                                        1 {pu.unitName || '包装'} = 
                                                                    </span>
                                                                    <div className="flex items-center gap-1">
                                                                        <input 
                                                                            type="number"
                                                                            className={`w-14 text-center font-black border-b outline-none bg-transparent text-blue-600 ${validationErrors[`pu_${pu.id}_ratio`] ? 'border-red-500 ring-1 ring-red-500' : 'border-[#E5E7EB] focus:border-[#FFD200]'}`}
                                                                            value={pu.toDisplayRatio ?? ''}
                                                                            onChange={e => {
                                                                                updatePurchaseUnit(pu.id, 'toDisplayRatio', parseFloat(e.target.value) || 0);
                                                                                setValidationErrors(prev => {
                                                                                    const copy = { ...prev };
                                                                                    delete copy[`pu_${pu.id}_ratio`];
                                                                                    return copy;
                                                                                });
                                                                            }}
                                                                            placeholder="1"
                                                                        />
                                                                        <span className="font-extrabold text-gray-700">{editingItem.displayUnit}</span>
                                                                    </div>
                                                                    <span className="font-extrabold text-gray-400">→</span>
                                                                    <span className="font-extrabold text-gray-900 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                                        {pu.toBaseRatio} {baseUnit}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )
                                                    ) : (
                                                        // No Display Unit defined or display unit same as base
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 rounded-xl border border-[#E5E7EB] text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-extrabold text-gray-400">1 {pu.unitName || '包装'} =</span>
                                                                <input 
                                                                    type="number"
                                                                    className={`w-16 text-center font-black border-b outline-none bg-transparent text-blue-600 ${validationErrors[`pu_${pu.id}_toBase`] ? 'border-red-500 ring-1 ring-red-500' : 'border-[#E5E7EB] focus:border-[#FFD200]'}`}
                                                                    value={pu.toBaseRatio ?? ''}
                                                                    onChange={e => {
                                                                        updatePurchaseUnit(pu.id, 'toBaseRatio', parseFloat(e.target.value) || 0);
                                                                        setValidationErrors(prev => {
                                                                            const copy = { ...prev };
                                                                            delete copy[`pu_${pu.id}_toBase`];
                                                                            return copy;
                                                                        });
                                                                    }}
                                                                />
                                                                <span className="font-extrabold text-[#111111]">{baseUnit}</span>
                                                            </div>
                                                            
                                                            <div className="text-left sm:text-right border-t sm:border-t-0 border-gray-100 pt-1.5 sm:pt-0 mt-1 sm:mt-0">
                                                                <span className="text-[10px] text-gray-400 block font-bold">折合成本 (Base Cost)</span>
                                                                <span className="font-black text-emerald-600 text-xs font-mono">
                                                                    RM {costPerBase.toFixed(4)} / {baseUnit}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Business Language Conversion Results Card */}
                                                    {isDisplaySameAsBase(editingItem.displayUnit, baseUnit) ? (
                                                        !isSame && (
                                                            <div className="bg-blue-50/40 border border-blue-200/50 rounded-xl p-3 text-[11px] leading-relaxed text-blue-800">
                                                                <strong>🔄 换算关系：</strong> 采购 1 {pu.unitName} (RM {pu.pricePerUnit?.toFixed(2)}) 等于 <strong>{pu.toBaseRatio} {baseUnit}</strong>。<br />
                                                                <strong>折合库存成本：</strong> <strong>RM {costPerBase.toFixed(4)}</strong> / {baseUnit}。
                                                            </div>
                                                        )
                                                    ) : (
                                                        editingItem.displayUnit && (
                                                            isSame ? (
                                                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] leading-relaxed text-emerald-800">
                                                                    <strong>📦 换算关系：</strong> 采购 1 {pu.unitName} 等于 1 {editingItem.displayUnit} (折合系统库存 <strong>{editingItem.displayToBaseRatio} {baseUnit}</strong>)。<br />
                                                                    <strong>折合库存成本：</strong> <strong>RM {costPerBase.toFixed(4)}</strong> / {baseUnit}。
                                                                </div>
                                                            ) : (
                                                                <div className="bg-blue-50/40 border border-[#E5E7EB] rounded-xl p-3 text-[11px] leading-relaxed text-blue-800">
                                                                    <strong>🔄 换算关系：</strong> 采购 1 {pu.unitName} (RM {pu.pricePerUnit?.toFixed(2)}) 等于 <strong>{pu.toDisplayRatio} {editingItem.displayUnit}</strong> (折合系统库存 <strong>{pu.toBaseRatio} {baseUnit}</strong>)。<br />
                                                                    <strong>折合库存成本：</strong> <strong>RM {costPerBase.toFixed(4)}</strong> / {baseUnit}。
                                                                </div>
                                                            )
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-[11px] text-gray-400 italic text-center py-6 border border-dashed border-[#E5E7EB] rounded-xl bg-gray-50/50">
                                    暂无大包装换算，默认采用: 1 {baseUnit} = 1 {baseUnit} 基础计算。
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card Section 4: Real-time ERP Cost Preview */}
                    <div className="bg-[#111111] text-white p-5 rounded-2xl border border-[#111111] shadow-md space-y-3">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-1">
                            <Coins size={16} className="text-[#FFD200]"/>
                            <h4 className="text-xs font-extrabold text-[#FFD200] uppercase tracking-wide">ERP 成本结算看板 (Cost Insights)</h4>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                <span className="text-[10px] text-gray-400 font-bold block mb-1">结算基底单位成本</span>
                                <span className="text-sm font-black text-[#FFD200]">
                                    RM {computedCostPerBaseUnit.toFixed(4)} <span className="text-[10px] text-white/50">/ {baseUnit}</span>
                                </span>
                                {sstPercent > 0 && (
                                    <span className="text-[10px] text-orange-400 font-bold block mt-1">
                                        +{sstPercent}% = RM {(computedCostPerBaseUnit * (1 + sstPercent / 100)).toFixed(4)}
                                    </span>
                                )}
                            </div>
                            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                <span className="text-[10px] text-gray-400 font-bold block mb-1">当前库存总资产价值</span>
                                <span className="text-sm font-black text-white">
                                    RM {(currentQtyBase * computedCostPerBaseUnit * (1 + sstPercent / 100)).toFixed(2)}
                                </span>
                                {sstPercent > 0 && (
                                    <span className="text-[9px] text-gray-400 font-medium block mt-1">
                                        (含 {sstPercent}% 政府附加费)
                                    </span>
                                )}
                            </div>
                        </div>

                        {defaultPU ? (
                            <p className="text-[10px] text-gray-400 leading-tight">
                                💡 采购首选规格为 <span className="text-white font-extrabold">{defaultPU.unitName || '未命名'}</span> (单价 RM {defaultPU.pricePerUnit?.toFixed(2)}，内含 {defaultPU.toBaseRatio} {baseUnit})。
                            </p>
                        ) : (
                            <p className="text-[10px] text-gray-400 leading-tight">
                                💡 当前暂未设定大包装换算，每基底单位默认定价为 RM {computedCostPerBaseUnit.toFixed(2)}。
                            </p>
                        )}
                    </div>

                    {/* Card Section 5: Advanced (Yield & Margin) */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
                            <Layers size={16} className="text-[#111111]"/>
                            <h4 className="text-xs font-extrabold text-[#111111] uppercase tracking-wide">高级公式加权 (Yield & Overhead)</h4>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 flex items-center gap-1 mb-1 whitespace-nowrap">
                                    <Percent size={11}/> 出成率 (Yield %)
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        className={`${INPUT_STYLE} text-center font-bold focus:border-[#FFD200] pr-6 pl-1 text-xs`} 
                                        value={yieldPercent} 
                                        onChange={e => onChange({ ...editingItem, yieldPercent: parseFloat(e.target.value) || 100 })} 
                                        placeholder="100" 
                                    />
                                    <span className="absolute right-1.5 top-2.5 text-[10px] text-gray-400 font-bold">%</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 flex items-center gap-1 mb-1 whitespace-nowrap">
                                    <Coins size={11}/> 杂项折损 (Overhead %)
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        className={`${INPUT_STYLE} text-center font-bold focus:border-[#FFD200] pr-6 pl-1 text-xs`} 
                                        value={overheadPercent} 
                                        onChange={e => onChange({ ...editingItem, overheadPercent: parseFloat(e.target.value) || 0 })} 
                                        placeholder="0" 
                                    />
                                    <span className="absolute right-1.5 top-2.5 text-[10px] text-gray-400 font-bold">%</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 flex items-center gap-1 mb-1 whitespace-nowrap">
                                    <Coins size={11} className="text-orange-500"/> SST (政府附加费 %)
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        className={`${INPUT_STYLE} text-center font-bold focus:border-orange-500 pr-6 pl-1 text-xs`} 
                                        value={sstPercent} 
                                        onChange={e => onChange({ ...editingItem, sstPercent: parseFloat(e.target.value) || 0 })} 
                                        placeholder="0" 
                                    />
                                    <span className="absolute right-1.5 top-2.5 text-[10px] text-gray-400 font-bold">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card Section 6: Supplier Links */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-gray-600 uppercase flex items-center gap-2"><LinkIcon size={14}/> 绑定供应商 (Supplier Links)</h4>
                        {linkedSuppliers.length > 0 ? (
                            <div className="space-y-2">
                                {linkedSuppliers.map(s => (
                                    <div key={s.id} className="flex items-center gap-2 bg-[#F6F7FB] p-2.5 rounded-xl border border-[#E5E7EB] text-xs">
                                        <div className="bg-blue-50 text-blue-600 p-1 rounded-lg"><Package size={14}/></div>
                                        <span className="font-bold text-[#111111] truncate flex-1">{s.name}</span>
                                        <span className="text-[10px] text-gray-400 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-md font-mono">{s.id}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[11px] text-gray-400 italic text-center py-3 bg-gray-50 border border-dashed border-[#E5E7EB] rounded-xl">
                                暂无关联供应商 (No active supplier bindings)
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Buttons - Supported with safe-area-inset-bottom for iOS standalone devices */}
                <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#E5E7EB] bg-white rounded-b-none md:rounded-b-2xl flex gap-3 shrink-0 relative bottom-0 left-0 right-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                    {editingItem.id && canDelete && (
                        <button 
                            type="button"
                            onClick={onDelete} 
                            className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors flex items-center justify-center border border-red-100 min-h-[48px] min-w-[48px]"
                        >
                            <Trash2 size={20}/>
                        </button>
                    )}
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="flex-1 py-4 bg-white border border-[#E5E7EB] text-[#111111] font-bold rounded-2xl hover:bg-gray-50 transition-colors min-h-[48px]"
                    >
                        取消
                    </button>
                    {canSave && <button
                        type="button"
                        onClick={onSave} 
                        disabled={isSubmitting}
                        className="flex-[2] py-4 bg-[#111111] text-[#FFD200] font-black rounded-2xl shadow-md hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                    >
                        {isSubmitting ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                        {isSubmitting ? '保存中...' : '保存更改'}
                    </button>}
                </div>
            </div>
        </div>
    );
});
