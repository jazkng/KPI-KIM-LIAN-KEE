import React, { useRef, useState, useEffect } from 'react';
import {
    Edit3, X, Trash2, Link as LinkIcon, Loader2, Save,
    Camera, Image as ImageIcon, Info, Coins, Layers, Check, ArrowRightLeft
} from 'lucide-react';
import { CATEGORY_SECTIONS, INPUT_STYLE, LABEL_STYLE } from './inventoryConstants';
import { StockItem, Supplier, UnitConversionRule } from '../../../types';
import { uploadToCloudinary } from '../../utils';
import { normalizeUnitName } from '../../../utils/unitConversion';
import { SupplierComparison, type SameNameRef } from './SupplierComparison';
import type { SupplyOption } from '../../../utils/inventory/supplyOptions';
import { STOCK_AREAS, type StockArea } from '../../../utils/inventory/stockArea';
import { STOCK_AREA_LABEL } from '../../../utils/inventory/moveStockArea';
import type { StockCopy } from '../../../utils/inventory/duplicateStock';
import { summarizeUnitSetup, type UnitSetupSummary } from '../../../utils/inventory/unitSetupSummary';
import { suggestNameFields } from '../../../utils/inventory/stockName';

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
    /** 负责人 / 系统管理员：显示内部 ID 与旧编号 */
    showInternalIds?: boolean;
    /** 设定 / 取消常用供应商（只写 preferredSupply 一个字段） */
    onSetPreferred?: (option: SupplyOption | null) => Promise<void>;
    /** 负责人 / 系统管理员：把商品移到另一个区域（例如 厨房 → 燃料） */
    onMoveArea?: (to: StockArea, category: string) => Promise<void>;
    /** 没有供应商连到这个商品时，同名却连到别处的供应商品项与改连 */
    sameNameSupply?: SameNameRef[];
    onRelinkSupply?: (ref: SameNameRef) => Promise<void>;
    /** 有「编辑基本资料」权限才自动把旧品名括号英文移到第二行（没权限的人改别的栏位时不会被挡） */
    autoSplitName?: boolean;
    /** 同一 ID 也出现在其他区域的副本（负责人可选择保留哪一份） */
    otherCopies?: StockCopy[];
    /** keep = 'HERE' 保留这里、删其他区域那份；keep = 区域 → 保留那里、删这里 */
    onKeepCopy?: (keep: 'HERE' | StockArea, other: StockArea) => Promise<void>;
}

/** 同一个商品在两个区域各有一份：说明两份的数量，让负责人选保留哪一份 */
const DuplicateCopyBanner: React.FC<{ here: StockArea; hereQty: number; unit: string; copies: StockCopy[]; onKeep: (keep: 'HERE' | StockArea, other: StockArea) => Promise<void> }> = ({ here, hereQty, unit, copies, onKeep }) => {
    const [busy, setBusy] = useState(false);
    const run = async (keep: 'HERE' | StockArea, other: StockArea) => { setBusy(true); try { await onKeep(keep, other); } finally { setBusy(false); } };
    const short = (a: StockArea) => STOCK_AREA_LABEL[a].split(' ')[0];
    return (
        <div className="space-y-2.5 rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="text-sm font-black text-red-800">这个商品有两份</div>
            {copies.map(c => (
                <div key={c.area} className="space-y-2">
                    <p className="text-[12px] font-medium leading-relaxed text-red-900">
                        {short(here)}这里一份（{hereQty} {unit}），{short(c.area)}也有一份（{c.qty} {c.unit || unit}{c.stockCode ? ` · ${c.stockCode}` : ''}）。
                        保留一份，另一份删除（资料会备份）。供应商连结和菜谱会自动连到留下的那份。
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" disabled={busy} onClick={() => run(c.area, c.area)}
                            className="min-h-[44px] rounded-xl bg-red-700 px-2 text-xs font-black text-white disabled:opacity-50">
                            保留{short(c.area)}，删除这里
                        </button>
                        <button type="button" disabled={busy} onClick={() => run('HERE', c.area)}
                            className="min-h-[44px] rounded-xl border border-red-300 bg-white px-2 text-xs font-black text-red-800 disabled:opacity-50">
                            保留这里，删除{short(c.area)}的
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};


/** 库存单位快捷按钮（仍可在输入框自己打） */
const BASE_UNIT_CHOICES: { value: string; hint?: string }[] = [
    { value: 'kg', hint: '公斤' }, { value: 'g', hint: '克' }, { value: 'pcs', hint: '个/粒' }, { value: 'Btl', hint: '瓶' },
    { value: 'Can', hint: '罐' }, { value: 'pkt', hint: '包' }, { value: 'L', hint: '公升' }, { value: 'ml', hint: '毫升' }, { value: 'Tail', hint: '尾' }, { value: 'tank', hint: '桶' },
];

/** 标签：中文在上，英文小字在下（不再挤在同一行被遮住） */
const Bi: React.FC<{ zh: React.ReactNode; en?: string }> = ({ zh, en }) => (
    <span className="block leading-tight">
        <span className="block">{zh}</span>
        {en && <span className="block mt-0.5 text-[10px] font-medium normal-case tracking-normal text-gray-400">{en}</span>}
    </span>
);

const StepHeading: React.FC<{ step: string; color: string; title: string; sub: string }> = ({ step, color, title, sub }) => (
    <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
        <span className={`w-1.5 h-4 ${color} rounded-full`}></span>
        <div className="min-w-0">
            <h4 className="text-sm font-black text-[#111111]">{step} {title}</h4>
            <div className="text-[10px] font-bold text-gray-400">{sub}</div>
        </div>
    </div>
);

const UNIT_EXAMPLES = [
    { name: '花肉', lines: ['① kg', '② 按包装数：1 CTN ≈ 20 kg（或直接数 kg）', '③ CTN · 每次称重，收货填实际公斤'] },
    { name: '虎牌啤酒', lines: ['① BTL（瓶）', '② 直接数 BTL', '③ CTN · 固定数量：1 CTN = 24 BTL'] },
    { name: '鸡蛋', lines: ['① pcs（粒）', '② 按包装数：1 tray = 30 pcs', '③ tray · 固定数量（与盘点单位相同，自动 = 30 pcs）'] },
];

const UnitSetupOverview: React.FC<{ summary: UnitSetupSummary }> = ({ summary }) => (
    <div className="bg-white p-4 rounded-2xl border-2 border-[#111111] shadow-sm space-y-2">
        <div className="text-xs font-black text-[#111111]">单位一览 <span className="font-medium text-gray-400">（在下面 ①②③ 修改）</span></div>
        <ul className="space-y-1 text-[12px] font-bold leading-relaxed text-gray-800">
            <li>① {summary.stock}</li>
            <li>② {summary.count}</li>
            {summary.purchases.map((p, i) => <li key={i}>③ {p}</li>)}
        </ul>
        {summary.warnings.length > 0 && (
            <ul className="space-y-0.5 rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] font-bold text-red-700">
                {summary.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
            </ul>
        )}
        <details className="text-[11px] text-gray-600">
            <summary className="cursor-pointer font-black text-blue-700">看例子：花肉、啤酒、鸡蛋怎么设？</summary>
            <div className="mt-1.5 grid gap-1.5 md:grid-cols-3">
                {UNIT_EXAMPLES.map(ex => (
                    <div key={ex.name} className="rounded-lg bg-[#F6F7FB] p-2">
                        <div className="font-black text-[#111111]">{ex.name}</div>
                        {ex.lines.map(l => <div key={l}>{l}</div>)}
                    </div>
                ))}
            </div>
        </details>
    </div>
);

const MoveAreaSection: React.FC<{ currentArea: string; disabled: boolean; onMove: (to: StockArea, category: string) => Promise<void> }> = ({ currentArea, disabled, onMove }) => {
    const targets = STOCK_AREAS.filter(a => a !== currentArea);
    const [open, setOpen] = useState(false);
    const [to, setTo] = useState<StockArea>(targets[0]);
    const [category, setCategory] = useState(CATEGORY_SECTIONS[targets[0]]?.[0]?.id || '');
    const [busy, setBusy] = useState(false);
    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} disabled={disabled}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 text-xs font-black text-gray-600 hover:border-gray-500 disabled:opacity-50">
                <ArrowRightLeft size={14} /> 移到其他区域
            </button>
        );
    }
    return (
        <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-3">
            <div className="text-xs font-black text-blue-900">移动到其他区域</div>
            <div className="grid grid-cols-2 gap-2">
                <select className={INPUT_STYLE} value={to} onChange={e => { const a = e.target.value as StockArea; setTo(a); setCategory(CATEGORY_SECTIONS[a]?.[0]?.id || ''); }}>
                    {targets.map(a => <option key={a} value={a}>{STOCK_AREA_LABEL[a]}</option>)}
                </select>
                <select className={INPUT_STYLE} value={category} onChange={e => setCategory(e.target.value)}>
                    {CATEGORY_SECTIONS[to]?.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </div>
            <p className="text-[11px] font-bold text-blue-800">数量、成本、照片、供应商连结、菜谱都跟着走。已有新编号系统时会换成新区域的编号，旧编号仍可搜寻。这里其他未保存的修改不会一起保存。</p>
            <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="min-h-[40px] flex-1 rounded-xl bg-white text-xs font-black text-gray-600">取消</button>
                <button type="button" disabled={busy || disabled || !category}
                    onClick={async () => { setBusy(true); try { await onMove(to, category); } finally { setBusy(false); } }}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-xl bg-blue-700 text-xs font-black text-white disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" />} 移动到 {STOCK_AREA_LABEL[to]}
                </button>
            </div>
        </div>
    );
};

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
    onSave, onDelete, onClose, onChange, canDelete = true, canSave = true, showInternalIds = false, onSetPreferred, onMoveArea, sameNameSupply, onRelinkSupply, autoSplitName = false, otherCopies, onKeepCopy
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
    const unitSummary = summarizeUnitSetup(editingItem);

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

    // 旧品名「中文 (English)」：打开时把括号里的英文移到第二行（只改表单，按保存才写入）
    const [autoSplitFrom, setAutoSplitFrom] = useState<string | null>(null);
    useEffect(() => {
        const next = autoSplitName ? suggestNameFields(editingItem) : null;
        if (!next) { setAutoSplitFrom(null); return; }
        setAutoSplitFrom(editingItem.name || '');
        onChange({ ...editingItem, ...next });
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    /** 改库存单位（输入或按快捷按钮）：同步旧字段、重算采购换算 */
    const setBaseUnit = (newBase: string) => {
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
    };

    return (
        <div className="fixed inset-0 bg-[#111111]/75 z-[200] flex items-center justify-center p-0 md:p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#F6F7FB] w-full h-[100dvh] md:h-auto md:max-w-xl md:max-h-[92vh] md:rounded-[24px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col relative overflow-hidden border border-[#E5E7EB]">
                
                {/* Header - Optimized for iOS Notch safe area */}
                <div className="p-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))] md:pt-5 shrink-0 bg-white border-b border-[#E5E7EB] z-10">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-black text-lg md:text-2xl text-[#111111] flex items-center gap-2">
                                <Edit3 size={20} className="text-[#111111]"/> 
                                {editingItem.id ? '编辑库存' : '新增库存'}
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
                    {editingItem.id && onKeepCopy && otherCopies && otherCopies.length > 0 && (
                        <DuplicateCopyBanner here={currentStockView as StockArea} hereQty={currentQtyBase} unit={baseUnit} copies={otherCopies} onKeep={onKeepCopy} />
                    )}

                    {/* Card Section 1: Basic Info */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
                            <span className="w-1.5 h-4 bg-[#FFD200] rounded-full"></span>
                            <h4 className="text-sm font-black text-[#111111]">基本信息 <span className="text-[11px] font-medium text-gray-400">Basic info</span></h4>
                        </div>
                        
                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="品名" en="Name" /></label>
                            <input 
                                className={`${INPUT_STYLE} focus:border-[#FFD200] focus:ring-1 focus:ring-[#FFD200] transition-all`} 
                                value={editingItem.name || ''} 
                                onChange={e => onChange({...editingItem, name: e.target.value})} 
                                placeholder="例如: 招牌大面、大白面 (Pork Slices / Yellow Noodle)" 
                            />
                        </div>

                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="第二行（选填）" en="English name / style" /></label>
                            <input 
                                className={`${INPUT_STYLE} focus:border-[#FFD200] focus:ring-1 focus:ring-[#FFD200] transition-all`} 
                                value={editingItem.subName || ''} 
                                onChange={e => onChange({...editingItem, subName: e.target.value})} 
                                placeholder="例如: Packing plastic 20×20；没有就留空" 
                            />
                            {autoSplitFrom
                                ? <p className="mt-1 text-[11px] font-bold text-amber-700">已把括号里的英文移到这里（原名：{autoSplitFrom}）· 按保存才生效 · <button type="button" className="underline" onClick={() => { onChange({ ...editingItem, name: autoSplitFrom, subName: '' }); setAutoSplitFrom(null); }}>还原</button></p>
                                : <p className="mt-1 text-[11px] font-medium text-gray-400">显示在品名下面、字较小；留空就照品名自动分两行</p>}
                        </div>

                        {editingItem.id && (
                            <label className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${editingItem.discontinued ? 'border-gray-400 bg-gray-100' : 'border-[#E5E7EB] bg-white'}`}>
                                <span className="min-w-0">
                                    <span className="block text-sm font-black text-[#111111]">停订 <span className="text-[11px] font-medium text-gray-400">Discontinued</span></span>
                                    <span className="block text-[11px] font-medium text-gray-500 leading-snug">不再进货：不算无货、不提醒补货，排到最后。资料和记录都保留，随时可以取消。</span>
                                </span>
                                <input type="checkbox" className="w-5 h-5 shrink-0 accent-[#111111]" checked={!!editingItem.discontinued}
                                    onChange={e => onChange({ ...editingItem, discontinued: e.target.checked, discontinuedAt: e.target.checked ? new Date().toISOString() : editingItem.discontinuedAt })} />
                            </label>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="编号" en="Stock code" /></label>
                                <input 
                                    className={`${INPUT_STYLE} font-mono bg-gray-50 text-gray-400 cursor-not-allowed`} 
                                    value={editingItem.stockCode || (editingItem.id ? '未编号' : '存档后自动配号')} 
                                    readOnly 
                                />
                            </div>
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="分类" en="Category" /></label>
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

                        {editingItem.id && onMoveArea && (
                            <MoveAreaSection currentArea={currentStockView} disabled={isSubmitting} onMove={onMoveArea} />
                        )}

                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="使用说明（选填）" en="Notes" /></label>
                            <textarea
                                rows={2}
                                className={`${INPUT_STYLE} focus:border-[#FFD200] resize-y`}
                                value={editingItem.description || ''}
                                onChange={e => onChange({ ...editingItem, description: e.target.value })}
                                placeholder="例如：1 瓶兑 10 公升水；只用于地板。没有就留空"
                            />
                        </div>

                        {/* Image Upload Area */}
                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="照片" en="Photo" /></label>
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

                    <UnitSetupOverview summary={unitSummary} />

                    {/* Card Section 2: System Stock & Cost Unit */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <StepHeading step="①" color="bg-blue-500" title="库存用什么单位记？" sub="Base unit" />
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            选<strong>最小的计算单位</strong>：肉菜 kg、饮料 BTL、鸡蛋 pcs。
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-400 mr-0.5">快速选：</span>
                            {BASE_UNIT_CHOICES.map(u => {
                                const on = normalizeUnitName(baseUnit) === normalizeUnitName(u.value);
                                return (
                                    <button key={u.value} type="button" onClick={() => setBaseUnit(u.value)}
                                        className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-black transition-colors ${on ? 'border-[#111111] bg-[#111111] text-[#FFD200]' : 'border-[#E5E7EB] bg-white text-gray-700 hover:border-gray-400'}`}>
                                        {u.value}{u.hint && <span className={`ml-1 text-[10px] font-medium ${on ? 'text-[#FFD200]/80' : 'text-gray-400'}`}>{u.hint}</span>}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="库存单位" en="Base unit" /></label>
                                <input 
                                    className={`${INPUT_STYLE} font-bold text-center focus:border-[#FFD200] ${validationErrors.baseUnit ? 'border-red-500 ring-1 ring-red-500' : ''}`} 
                                    value={baseUnit} 
                                    onChange={e => setBaseUnit(e.target.value)}
                                    placeholder="g, ml, pcs, kg" 
                                />
                                {validationErrors.baseUnit && <p className="text-[10px] text-red-500 font-bold mt-1">⚠️ {validationErrors.baseUnit}</p>}
                            </div>
                            <div>
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="现有库存" en="Current qty" /></label>
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
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="最低警报量" en="Min level" /></label>
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
                                <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="最大容量" en="Max" /></label>
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
                                <div className="flex gap-2 text-yellow-900">
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
                        <StepHeading step="②" color="bg-[#FFD200]" title="员工盘点时怎么数？" sub="Count unit" />
                        
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            习惯数「几盘、几箱」就选「按包装数」，系统自动换成 {baseUnit}。
                        </p>

                        <div>
                            <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="盘点时数什么？" en="Count by" /></label>
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
                                    直接数 {baseUnit}
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
                                    按包装数{editingItem.displayUnit && !isDisplaySameAsBase(editingItem.displayUnit, baseUnit) ? `（${editingItem.displayUnit}）` : '（箱 / 盘 / 包）'}
                                </button>
                            </div>
                        </div>

                        {editingItem.preferredStockViewUnit === 'DISPLAY' && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-150">
                                <div>
                                    <label className={`${LABEL_STYLE} text-gray-500 font-bold text-xs`}><Bi zh="盘点单位" en="Count unit" /></label>
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
                            <StepHeading step="③" color="bg-emerald-500" title="供应商怎么卖给你？" sub="Purchase unit" />
                            <button 
                                type="button" 
                                onClick={addPurchaseUnit} 
                                className="text-[10px] bg-white border border-[#E5E7EB] hover:border-[#FFD200] hover:text-[#FFD200] px-2.5 py-1.5 rounded-lg font-black transition-all min-h-[44px] flex items-center justify-center px-3"
                            >
                                + 增加采购规格
                            </button>
                        </div>
                        
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            采购单 / Invoice 用的包装（CTN、PACK…）。数量固定选「固定数量」；重量每次不同（肉、鱼）选「每次称重」。
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
                                                <div className="flex flex-col md:flex-row gap-2">
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
                                                            className={`flex-1 md:flex-initial p-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 h-[44px] px-3 ${
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
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-t border-b border-gray-200/50 py-2.5 text-xs">
                                                <span className="font-bold text-gray-400">每包数量</span>
                                                <div className="flex gap-1.5 w-full md:w-auto">
                                                    <button
                                                        type="button"
                                                        onClick={() => updatePurchaseUnit(pu.id, 'conversionMode', 'FIXED')}
                                                        className={`flex-1 md:flex-initial px-3 py-2 rounded-lg border text-[10px] font-black transition-all h-[36px] flex items-center justify-center ${
                                                            mode === 'FIXED'
                                                                ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-xs'
                                                                : 'bg-white text-gray-500 border-[#E5E7EB] hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        固定数量
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updatePurchaseUnit(pu.id, 'conversionMode', 'ACTUAL_WEIGHT')}
                                                        className={`flex-1 md:flex-initial px-3 py-2 rounded-lg border text-[10px] font-black transition-all h-[36px] flex items-center justify-center ${
                                                            mode === 'ACTUAL_WEIGHT'
                                                                ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-xs'
                                                                : 'bg-white text-gray-500 border-[#E5E7EB] hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        每次称重
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
                                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-[#E5E7EB] text-xs">
                                                                <span className="font-extrabold text-gray-400 shrink-0">1 包装有几个盘点单位:</span>
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
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-white p-3 rounded-xl border border-[#E5E7EB] text-xs">
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
                                                            
                                                            <div className="text-left md:text-right border-t md:border-t-0 border-gray-100 pt-1.5 md:pt-0 mt-1 md:mt-0">
                                                                <span className="text-[11px] text-gray-400 block font-bold">每 {baseUnit} 成本</span>
                                                                <span className="font-black text-emerald-600 text-xs font-mono">
                                                                    RM {costPerBase.toFixed(4)} / {baseUnit}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Business Language Conversion Results Card */}
                                                    {/* 盘点单位 = 库存单位时，上面「1 X = N 单位 · 折合成本」已经写清楚，不再重复 */}
                                                    {isDisplaySameAsBase(editingItem.displayUnit, baseUnit) ? null : (
                                                        editingItem.displayUnit && (
                                                            isSame ? (
                                                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] leading-relaxed text-emerald-800">
                                                                    1 {pu.unitName} = 1 {editingItem.displayUnit} = <strong>{editingItem.displayToBaseRatio} {baseUnit}</strong> · 每 {baseUnit} <strong>RM {costPerBase.toFixed(4)}</strong>
                                                                </div>
                                                            ) : (
                                                                <div className="bg-blue-50/40 border border-[#E5E7EB] rounded-xl p-3 text-[11px] leading-relaxed text-blue-800">
                                                                    1 {pu.unitName} = <strong>{pu.toDisplayRatio} {editingItem.displayUnit}</strong> = {pu.toBaseRatio} {baseUnit} · 每 {baseUnit} <strong>RM {costPerBase.toFixed(4)}</strong>
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
                                    还没设定采购规格：采购时直接按 {baseUnit} 买（1 {baseUnit} = 1 {baseUnit}）。需要按箱 / 包买就按右上角「+ 增加采购规格」。
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card Section 4: Real-time ERP Cost Preview */}
                    <div className="bg-[#111111] text-white p-5 rounded-2xl border border-[#111111] shadow-md space-y-3">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-1">
                            <Coins size={16} className="text-[#FFD200]"/>
                            <h4 className="text-sm font-black text-[#FFD200]">成本 <span className="text-[11px] font-medium text-white/50">Cost</span></h4>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                <span className="text-[11px] text-gray-400 font-bold block mb-1">每 {baseUnit} 成本</span>
                                <span className="text-sm font-black text-[#FFD200]">
                                    RM {computedCostPerBaseUnit.toFixed(4)}
                                </span>
                                {sstPercent > 0 && (
                                    <span className="text-[10px] text-orange-400 font-bold block mt-1">
                                        +{sstPercent}% = RM {(computedCostPerBaseUnit * (1 + sstPercent / 100)).toFixed(4)}
                                    </span>
                                )}
                            </div>
                            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                <span className="text-[11px] text-gray-400 font-bold block mb-1">库存价值</span>
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
                            <p className="text-[11px] text-gray-400 leading-snug">
                                进货：1 <span className="text-white font-extrabold">{defaultPU.unitName || '未命名'}</span> = {defaultPU.toBaseRatio} {baseUnit} · RM {defaultPU.pricePerUnit?.toFixed(2)}
                            </p>
                        ) : (
                            <p className="text-[11px] text-gray-400 leading-snug">
                                还没设定进货包装，按每 {baseUnit} RM {computedCostPerBaseUnit.toFixed(2)} 计算
                            </p>
                        )}
                    </div>

                    {/* Card Section 5: Advanced (Yield & Margin) */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#F6F7FB] pb-2.5 mb-2">
                            <Layers size={16} className="text-[#111111]"/>
                            <h4 className="text-sm font-black text-[#111111]">出成与附加费 <span className="text-[11px] font-medium text-gray-400">Yield & extras</span></h4>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block"><Bi zh="出成率" en="Yield" /></label>
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
                                <label className="text-xs font-bold text-gray-500 mb-1 block"><Bi zh="折损" en="Overhead" /></label>
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
                                <label className="text-xs font-bold text-gray-500 mb-1 block"><Bi zh="SST 税" en="Gov. tax" /></label>
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

                    {/* 编号资料（只读）：一般员工只看到编号，内部 ID 只给负责人 / 系统管理员 */}
                    {editingItem.id && (
                        <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-2 text-xs">
                            <h4 className="text-sm font-black text-[#111111]">编号 <span className="text-[11px] font-medium text-gray-400">Stock code</span></h4>
                            <div className="flex justify-between"><span className="text-gray-500 font-bold">编号</span><span className="font-mono font-black">{editingItem.stockCode || '未编号'}</span></div>
                            {showInternalIds && (
                                <>
                                    <div className="flex justify-between gap-2"><span className="text-gray-500 font-bold shrink-0">内部 ID（永不更改）</span><span className="font-mono text-gray-500 break-all text-right">{editingItem.id}</span></div>
                                    {!!editingItem.legacyCodes?.length && (
                                        <div className="flex justify-between gap-2"><span className="text-gray-500 font-bold shrink-0">旧编号</span><span className="font-mono text-gray-500 text-right">{editingItem.legacyCodes.join('、')}</span></div>
                                    )}
                                    {editingItem.stockCodeAssignedAt && (
                                        <div className="flex justify-between gap-2"><span className="text-gray-500 font-bold shrink-0">配号</span><span className="text-gray-500 text-right">{editingItem.stockCodeAssignedAt.slice(0, 10)} · {editingItem.stockCodeAssignedBy || '-'}</span></div>
                                    )}
                                    {!!editingItem.nameHistory?.length && (
                                        <div className="space-y-1 pt-1">
                                            <div className="text-gray-500 font-bold">名称修改记录</div>
                                            {editingItem.nameHistory.map((h, i) => (
                                                <div key={i} className="flex justify-between gap-2 text-gray-500"><span className="truncate">{h.name}</span><span className="shrink-0">{h.changedAt.slice(0, 10)} · {h.changedBy}</span></div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Card Section 6: Supplier Links */}
                    <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-gray-600 uppercase flex items-center gap-2"><LinkIcon size={14}/> 供应商比价 <span className="normal-case font-medium text-gray-400">Suppliers</span></h4>
                        {editingItem.id ? (
                            <SupplierComparison
                                stock={editingItem as Partial<StockItem> & { id: string }}
                                suppliers={linkedSuppliers}
                                canSetPreferred={!!onSetPreferred && canSave}
                                onSetPreferred={async option => { if (onSetPreferred) await onSetPreferred(option); }}
                                sameName={sameNameSupply}
                                onRelink={onRelinkSupply}
                            />
                        ) : (
                            <div className="text-[11px] text-gray-400 italic text-center py-3 bg-gray-50 border border-dashed border-[#E5E7EB] rounded-xl">
                                存档后在供应商品项里连结这个商品
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
