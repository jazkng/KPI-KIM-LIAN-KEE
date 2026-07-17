import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
    Search, Layers, AlertTriangle, ChevronUp, ChevronDown, 
    Plus, Edit3, Trash2, CheckCircle2, X, Calculator, Link as LinkIcon, Save, Package, Image as ImageIcon,
    Filter, Calendar, CalendarDays, Box, ArrowRightLeft, Minus, DollarSign, History, Clock, User, Scale, Loader2, Check, Flame, Send, ClipboardList, CheckSquare, PlayCircle, RefreshCw,
    FileDown, Printer, Square, UserCheck, PenLine, ChevronRight, Users, XCircle, AlertOctagon, RotateCcw, CalendarClock, ArrowLeft, HelpCircle, Lock
} from 'lucide-react';
import { StockItem, Employee, AppModule, Supplier, UomOption, InventoryLog, InventoryLogItem, InventoryTask, InventoryPermission, InventoryScope, PortalRole } from '../../../types';
import { 
    CATEGORY_SECTIONS, getCategoryLabel, getCategoryColor, 
    getToday, getYesterday, daysBetween, 
    FREQ_OPTIONS, INPUT_STYLE, LABEL_STYLE, 
    TaskCompletion 
} from './inventoryConstants';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AssignModal } from './AssignModal';
import { TaskEditorModal } from './TaskEditorModal';
import { ExportModal } from './ExportModal';
import { DataManager } from '../../../utils/dataManager';
import { StockEditModal } from './StockEditModal';
import { jsPDF } from "jspdf";
import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas-pro';
import { applyResolvedStylesForPdf } from '../../../utils/pdfStyleResolver';
import { 
    getCurrentQtyBase, getMinLevelBase, getCostPerBaseUnit, getBaseUnit, getStockValue, getStockStatus,
    needsReplenishment, getPreferredCountQuantity, getDisplayToBaseRatio, convertDisplayToBase
} from '../../../utils/unitConversion';
import {
    INVENTORY_PERMISSION_LABELS,
    INVENTORY_SCOPES,
    resolveInventoryAccess,
} from '../../../utils/inventoryAccess';
import { getPortalRole } from '../../../utils/orgAccess';


// ============================================================
// NEW TYPES for recurring task system
// ============================================================
interface StaffAssignmentGroup {
    groupId: string; // 新增用于精确区分不同频率的组
    assigneeId: string;
    assigneeName: string;
    tasks: InventoryTask[];
    allItems: { stockId: string; stockName: string; category: string }[];
    todayCompletion?: TaskCompletion;
    lastCompletion?: TaskCompletion;
    needsMerge: boolean;
    checkFrequency: number;
    isDueToday: boolean;
}

interface InventoryModuleProps {
    allowedModules?: AppModule[];
    employee?: Employee;
    lockedMode?: 'CHECK' | 'MASTER';
    initialMode?: 'CHECK' | 'MASTER';
    initialSearchTerm?: string;
    isManagementStaff?: boolean;
    lang?: 'zh' | 'my';
    onClose?: () => void;
}

const usesDisplayCountUnit = (item: Partial<StockItem> | undefined): boolean =>
    item?.preferredStockViewUnit === 'DISPLAY' && !!item?.displayUnit;

const convertCountInputToBase = (item: Partial<StockItem> | undefined, count: number): number => {
    const numericCount = Number(count);
    const safeCount = Number.isFinite(numericCount) ? Math.max(0, numericCount) : 0;
    return usesDisplayCountUnit(item)
        ? convertDisplayToBase(safeCount, getDisplayToBaseRatio(item))
        : safeCount;
};

const getInventoryScopeForCategory = (category?: string): InventoryScope => {
    const directScope = category as InventoryScope;
    if (INVENTORY_SCOPES.includes(directScope)) return directScope;

    for (const [scope, sections] of Object.entries(CATEGORY_SECTIONS)) {
        if (sections.some(section => section.id === category)) return scope as InventoryScope;
    }
    return 'KITCHEN';
};

// 🛡️ 防御护栏: 使用 React.memo 避免单个输入框变动导致整个巨型列表灾难性重绘
const MemoizedStockCard = React.memo(({ 
    item, mode, isChecked, currentCount, assignedTo, 
    onCountChange, onToggleCheck, onEdit, onAssignToggle, isSelectedForAssign, 
    tItem, tUnit, getCategoryColor, getCategoryLabel, onImageClick
}: any) => {
    const baseUnit = getBaseUnit(item);
    const minLevelBase = getMinLevelBase(item);
    
    // Display unit check
    const preferredStockViewUnit = item.preferredStockViewUnit || 'BASE';
    const displayUnit = item.displayUnit || '';
    const displayToBaseRatio = getDisplayToBaseRatio(item);
    const isDisplayMode = preferredStockViewUnit === 'DISPLAY' && !!displayUnit;

    const shownUnit = isDisplayMode ? displayUnit : baseUnit;

    const stockStatus = getStockStatus(item);
    const isOutOfStock = stockStatus === 'OUT_OF_STOCK';
    const isLowStock = stockStatus === 'LOW_STOCK';

    const displayName = tItem(item);
    const hasTranslation = displayName !== item.name;
    const cleanChinese = item.name.replace(/\([^)]+\)/, '').trim();

    if (mode === 'ASSIGN') {
        return (
            <div onClick={() => onAssignToggle(item.id)} className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center ${isSelectedForAssign ? 'bg-indigo-50/70 border-indigo-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                <div>
                    {hasTranslation ? (
                        <div className="flex flex-col text-left leading-tight">
                            <div className="font-bold text-sm text-stone-900 tracking-wide">{displayName}</div>
                            <div className="text-[10px] text-stone-500 font-medium mt-0.5">{cleanChinese}</div>
                        </div>
                    ) : (
                        <div className="font-bold text-sm text-[#111111]">{displayName}</div>
                    )}
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">#{item.id}</div>
                    {assignedTo && assignedTo.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                            <UserCheck size={10} className="text-blue-500"/>
                            <span className="text-[9px] text-blue-600 font-bold">
                                已指派: {[...new Set(assignedTo.map((a: any) => a.assigneeName))].join(', ')}
                            </span>
                        </div>
                    )}
                </div>
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${isSelectedForAssign ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300'}`}>
                    {isSelectedForAssign && <Check size={14} strokeWidth={3}/>}
                </div>
            </div>
        );
    }

    if (mode === 'CHECK') {
        let cardColor = 'bg-white border-gray-200';
        let checkBtnColor = 'bg-white border-gray-200 text-gray-300 hover:bg-gray-50';

        if (isChecked) {
            if (isOutOfStock) {
                cardColor = 'bg-red-50 border-red-500';
                checkBtnColor = 'bg-red-500 border-red-700 text-white shadow-red-200';
            } else if (isLowStock) {
                cardColor = 'bg-yellow-50 border-yellow-500';
                checkBtnColor = 'bg-yellow-500 border-yellow-700 text-white shadow-yellow-200';
            } else {
                cardColor = 'bg-green-50 border-green-500';
                checkBtnColor = 'bg-green-500 border-green-700 text-white shadow-green-200';
            }
        } else {
            if (isOutOfStock) cardColor = 'bg-red-50/50 border-red-200';
            else if (isLowStock) cardColor = 'bg-yellow-50/50 border-yellow-200';
        }

        return (
            <div className={`rounded-2xl border-2 transition-all p-4 flex flex-col gap-3 shadow-sm ${cardColor}`}>
                <div className={`flex justify-between items-start ${isChecked ? 'opacity-70' : ''} gap-3`}>
                    {item.image && (
                        <div 
                            onClick={(e) => {
                                e.stopPropagation();
                                onImageClick?.(item.image, tItem(item));
                            }}
                            className="w-24 h-16 md:w-28 md:h-20 rounded-xl overflow-hidden shrink-0 border border-gray-150 bg-gray-50 bg-cover bg-center cursor-zoom-in hover:scale-105 active:scale-95 transition-all shadow-sm" 
                            style={{ backgroundImage: `url(${item.image})` }} 
                        />
                    )}
                    <div className="flex-1 min-w-0">
                        {hasTranslation ? (
                            <div className="flex flex-col text-left leading-tight">
                                <div className="font-black text-sm md:text-base text-stone-900 tracking-wide truncate">{displayName}</div>
                                <div className="text-[10px] text-stone-500 font-medium truncate mt-0.5">{cleanChinese}</div>
                            </div>
                        ) : (
                            <div className="font-black text-sm md:text-base text-[#111111] truncate">{displayName}</div>
                        )}
                        <div className="text-[10px] text-gray-400 font-mono mt-1 flex flex-col gap-0.5">
                            <span className="bg-black/5 px-1.5 py-0.5 rounded font-bold w-fit mb-0.5">#{item.id}</span>
                            <span>Min: {isDisplayMode ? `${(minLevelBase / displayToBaseRatio).toFixed(1)} ${tUnit(displayUnit)}` : `${minLevelBase} ${tUnit(baseUnit)}`}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        {isOutOfStock && <span className="text-[9px] bg-red-500 text-white px-2 py-1 rounded-lg font-black tracking-wider shadow-sm">没货 (OUT)</span>}
                        {isLowStock && !isOutOfStock && <span className="text-[9px] bg-yellow-400 text-yellow-900 px-2 py-1 rounded-lg font-black tracking-wider shadow-sm">警告 (LOW)</span>}
                    </div>
                </div>

                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 p-1 shadow-inner">
                        <button onClick={() => onCountChange(item.id, Math.max(0, currentCount - 1))} className="w-11 h-11 flex items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm border border-gray-100 hover:bg-gray-100 active:scale-90 transition-all"><Minus size={22} strokeWidth={3}/></button>
                        <div className="w-16 flex flex-col items-center justify-center">
                            <input type="number" inputMode="decimal" min="0" step="any" className="w-full text-center font-black text-xl outline-none bg-transparent text-[#111111] leading-none" value={currentCount !== undefined ? currentCount : ''} onChange={(e) => onCountChange(item.id, Number(e.target.value))} />
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1 w-full text-center truncate">{tUnit(shownUnit)}</span>
                        </div>
                        <button onClick={() => onCountChange(item.id, currentCount + 1)} className="w-11 h-11 flex items-center justify-center rounded-lg bg-[#111111] text-[#FFD200] shadow-md hover:bg-black active:scale-90 transition-all"><Plus size={22} strokeWidth={3}/></button>
                    </div>
                    <button onClick={() => onToggleCheck(item.id)} className={`w-14 h-12 flex items-center justify-center rounded-xl shadow-md transition-all active:scale-90 border-b-4 ${checkBtnColor}`}>
                        <Check size={26} strokeWidth={isChecked ? 4 : 3} />
                    </button>
                </div>
            </div>
        );
    } else {
        // MASTER/Management view (Linear / Stripe style cards)
        const qtyBase = getCurrentQtyBase(item);
        const costPerBase = getCostPerBaseUnit(item);
        const sstPercent = item.sstPercent ?? 0;
        const costPerBaseWithSST = costPerBase * (1 + sstPercent / 100);
        
        const isCardOutOfStock = isOutOfStock;
        const isCardLowStock = isLowStock;
        
        // Find default or first purchase unit
        const defaultPU = item.purchaseUnits?.find((pu: any) => pu.isDefaultPurchase) || item.purchaseUnits?.[0];
        const stockValue = getStockValue(item);

        return (
            <div 
                onClick={() => onEdit?.(item)}
                className={`p-4 rounded-2xl border transition-all duration-150 relative text-left ${onEdit ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'} ${
                    isCardOutOfStock 
                        ? 'border-red-200 bg-red-50/40 hover:bg-red-50/70' 
                        : isCardLowStock 
                            ? 'border-orange-200 bg-orange-50/30 hover:bg-orange-50/60' 
                            : 'border-[#E5E7EB] bg-white hover:border-[#FFD200] hover:shadow-md'
                } shadow-xs flex flex-col gap-3`}
            >
                {/* Upper Section */}
                <div className="flex gap-3">
                    {item.image ? (
                        <div 
                            onClick={(e) => {
                                e.stopPropagation();
                                onImageClick?.(item.image, tItem(item));
                            }}
                            className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-gray-100 bg-gray-50 bg-cover bg-center cursor-zoom-in hidden sm:block" 
                            style={{ backgroundImage: `url(${item.image})` }} 
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-xl shrink-0 border border-[#E5E7EB] bg-[#F6F7FB] flex flex-col items-center justify-center text-gray-300 hidden sm:flex">
                            <ImageIcon size={24}/>
                            <span className="text-[8px] font-bold text-gray-400 mt-1 uppercase">NO PHOTO</span>
                        </div>
                    )}
                    
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start gap-2">
                                {hasTranslation ? (
                                    <div className="flex flex-col text-left leading-tight min-w-0 flex-1">
                                        <div className="font-extrabold text-sm text-stone-900 tracking-wide truncate">{displayName}</div>
                                        <div className="text-[10px] text-stone-500 font-medium truncate mt-0.5">{cleanChinese}</div>
                                    </div>
                                ) : (
                                    <div className="font-extrabold text-sm text-[#111111] truncate">{displayName}</div>
                                )}
                                {onEdit && <div className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors shrink-0"><Edit3 size={12}/></div>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-gray-400 font-mono font-black bg-[#F6F7FB] border border-[#E5E7EB] px-1.5 py-0.5 rounded-md">
                                    #{item.id}
                                </span>
                                {isCardOutOfStock && (
                                    <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                                        无货
                                    </span>
                                )}
                                {isCardLowStock && (
                                    <span className="text-[8px] bg-orange-100 text-[#E25C00] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                                        超低水位
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Conversion Summary Display */}
                        <div className="text-[10px] text-gray-500 font-semibold flex items-center gap-1 mt-1.5">
                            <Scale size={10} className="text-gray-400 shrink-0"/>
                            {defaultPU ? (
                                <span className="truncate">
                                    规格: {defaultPU.toDisplayRatio && item.displayUnit && item.displayUnit !== item.baseUnit 
                                        ? `1 ${defaultPU.unitName} = ${defaultPU.toDisplayRatio} ${tUnit(item.displayUnit)} = ${defaultPU.toBaseRatio} ${tUnit(baseUnit)}`
                                        : `1 ${defaultPU.unitName} = ${defaultPU.toBaseRatio} ${tUnit(baseUnit)}`}
                                </span>
                            ) : (
                                <span className="italic text-gray-400 truncate">无采购规格换算</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Lower Grid Details Section */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#F6F7FB] text-left">
                    <div className="px-2 py-1.5 bg-[#F6F7FB] rounded-lg border border-[#E5E7EB]/50">
                        <span className="text-[8px] text-gray-400 font-black block uppercase tracking-wide">当前库存</span>
                        <span className="text-[11px] font-black text-[#111111] block">
                            {isDisplayMode 
                                ? `${(qtyBase / displayToBaseRatio).toLocaleString()} ${tUnit(displayUnit)}` 
                                : `${qtyBase.toLocaleString()} ${tUnit(baseUnit)}`}
                        </span>
                        {isDisplayMode && (
                            <span className="text-[9px] text-gray-400 font-semibold block leading-none mt-0.5">
                                = {qtyBase.toLocaleString()} {tUnit(baseUnit)}
                            </span>
                        )}
                    </div>
                    <div className="px-2 py-1.5 bg-[#F6F7FB] rounded-lg border border-[#E5E7EB]/50">
                        <span className="text-[8px] text-gray-400 font-black block uppercase tracking-wide">基础单价</span>
                        <span className="text-[11px] font-black text-emerald-600 block">
                            RM {costPerBase.toFixed(3)}
                        </span>
                        {sstPercent > 0 && (
                            <span className="text-[7.5px] text-orange-600 font-bold block leading-none mt-1 whitespace-nowrap">
                                +{sstPercent}% = RM {costPerBaseWithSST.toFixed(3)}
                            </span>
                        )}
                        {isDisplayMode && (
                            <span className="text-[9px] text-emerald-600/75 font-semibold block leading-none mt-1">
                                RM {(costPerBase * displayToBaseRatio).toFixed(2)}/{displayUnit}
                            </span>
                        )}
                    </div>
                    <div className="px-2 py-1.5 bg-[#111111] rounded-lg text-white">
                        <span className="text-[8px] text-gray-300 font-black block uppercase tracking-wide">库存估值</span>
                        <span className="text-[11px] font-black text-[#FFD200]">
                            RM {stockValue.toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Additional indicators: Assigned tasks */}
                {assignedTo && assignedTo.length > 0 && (
                    <div className="flex items-center gap-1 text-[9px] text-blue-600 bg-blue-50/50 border border-blue-100 p-1.5 rounded-lg">
                        <UserCheck size={10}/>
                        <span className="font-bold truncate">已指派: {[...new Set(assignedTo.map((a: any) => a.assigneeName))].join(', ')}</span>
                    </div>
                )}
            </div>
        );
    }
});

export const InventoryModule: React.FC<InventoryModuleProps> = ({ 
    allowedModules, 
    employee, 
    lockedMode, 
    initialMode = 'CHECK', 
    initialSearchTerm,
    isManagementStaff = false,
    lang = 'zh',
    onClose
}) => {
    const [currentStockView, setCurrentStockView] = useState<'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL'>('KITCHEN');
    const [mode, setMode] = useState<'CHECK' | 'MASTER' | 'ASSIGN'>(lockedMode || initialMode);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    
    const [fbTranslations, setFbTranslations] = useState<Record<string, Record<string, string>>>({ items: {}, categories: {}, units: {}, ui: {} });
    
    const FALLBACK_MY: Record<string, Record<string, string>> = {
        ui: {
            '厨房': 'မီးဖိုချောင်', '水吧': 'အချိုရည်ဆိုင်', '后勤': 'ထောက်ပံ့ရေး', '燃料': 'လောင်စာ',
            '库存盘点': 'ကုန်ပစ္စည်းစစ်ဆေး', '库存总览': 'ကုန်ပစ္စည်းအနှစ်ချုပ်',
            '我的盘点任务': 'ကျွန်ုပ်၏ စာရင်းစစ်ဆေးရန်တာဝန်များ',
            '库存经营总览': 'ကုန်ပစ္စည်း စီမံခန့်ခွဲမှု အနှစ်ချုပ်',
            '库存工作台': 'ကုန်ပစ္စည်း လုပ်ငန်းခွင်',
            '搜索': 'ရှာဖွေရန်', '保存': 'သိမ်းဆည်းရန်', '当前': 'လက်ရှိ', '最低': 'အနိမ့်ဆုံး', '最高': 'အမြင့်ဆုံး',
            '单位': 'ယူနစ်', '品名': 'ပစ္စည်းအမည်', '数量': 'အရေအတွက်',
            '不足': 'မလုံလောက်', '正常': 'ပုံမှန်', '充足': 'လုံလောက်',
        },
        categories: {
            'FRESH': 'လတ်ဆတ် (Fresh)', 'MEAT': 'အသား (Meat)', 'SEAFOOD': 'ပင်လယ်စာ (Seafood)',
            'VEG': 'ဟင်းသီးဟင်းရွက် (Veg)', 'NOODLE': 'ခေါက်ဆွဲ (Noodle)', 'SAUCE': 'ဆီ/ငံပြာရည် (Sauce)',
            'DRY': 'ခြောက်သွေ့ (Dry)', 'HQ': 'ရုံးချုပ် (HQ)',
            'TEA': 'လက်ဖက်ရည် (Tea)', 'FRUIT': 'သစ်သီး (Fruit)', 'RTD': 'ဗူးသွတ် (Drinks)',
            'MISC': 'အခြား (Misc)', 'DRINK': 'အချိုရည် (Drink)',
            'PACKAGING': 'ထုပ်ပိုး (Pack)', 'CLEANING': 'သန့်ရှင်းရေး (Clean)',
            'TOOLS': 'ကိရိယာ (Tools)', 'WASTE': 'စားသုံးကုန် (Waste)', 'GENERAL': 'အထွေထွေ (General)',
            'GAS': 'ဓာတ်ငွေ့ (Gas)', 'CHARCOAL': 'မီးသွေး (Charcoal)', 'OIL': 'ဆီ (Oil)',
        },
        units: {
            'kg': 'ကီလို', 'pkt': 'ထုပ်', 'btl': 'ပုလင်း', 'ctn': 'ပုံး',
            'roll': 'လိပ်', 'box': 'သေတ္တာ', 'tank': 'တိုင်ကီ', 'tray': 'ခွက်', 'bag': 'အိတ်', 'pc': 'ခု',
        },
    };
    
    const translations = {
        items: { ...fbTranslations.items },
        categories: { ...(lang === 'my' ? FALLBACK_MY.categories : {}), ...fbTranslations.categories },
        units: { ...(lang === 'my' ? FALLBACK_MY.units : {}), ...fbTranslations.units },
        ui: { ...(lang === 'my' ? FALLBACK_MY.ui : {}), ...fbTranslations.ui },
    };
    
    useEffect(() => {
        if (lang !== 'zh') {
            DataManager.getTranslations(lang).then(setFbTranslations);
        }
    }, [lang]);
    
    const t = (zh: string): string => {
        if (lang === 'zh') return zh;
        return translations.ui?.[zh] || zh;
    };
    const tCat = (catId: string): string => {
        if (lang === 'zh') return getCategoryLabel(catId);
        const translated = translations.categories?.[catId];
        return translated ? `${translated}` : getCategoryLabel(catId);
    };
    const tItem = useCallback((item: StockItem): string => {
        if (lang === 'zh') return item.name;
        const translated = translations.items?.[item.id];
        if (!translated) return item.name;
        const engPart = item.name.match(/\(([^)]+)\)/)?.[1];
        return engPart ? `${translated} (${engPart})` : translated;
    }, [lang, translations.items]);

    const tUnit = useCallback((unit: string): string => {
        if (lang === 'zh') return unit;
        return translations.units?.[unit] || unit;
    }, [lang, translations.units]);
    
    const [viewType, setViewType] = useState<'LIST' | 'HISTORY' | 'TASKS'>('LIST');
    const [logs, setLogs] = useState<InventoryLog[]>([]);
    const [items, setItems] = useState<StockItem[]>([]);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editingItem, setEditingItem] = useState<Partial<StockItem> | null>(null);
    const [linkedSuppliers, setLinkedSuppliers] = useState<Supplier[]>([]);
    
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    const [selectedForAssign, setSelectedForAssign] = useState<Set<string>>(new Set());
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [staffList, setStaffList] = useState<Employee[]>([]);
    const [selectedAssignee, setSelectedAssignee] = useState('');
    const [assignFrequency, setAssignFrequency] = useState(1);
    const [taskList, setTaskList] = useState<InventoryTask[]>([]);
    const [myTask, setMyTask] = useState<InventoryTask | null>(null);

    const [allRecentCompletions, setAllRecentCompletions] = useState<TaskCompletion[]>([]);

    const [editingTask, setEditingTask] = useState<InventoryTask | null>(null);
    const [editTaskItems, setEditTaskItems] = useState<Set<string>>(new Set());
    const [editTaskStockData, setEditTaskStockData] = useState<StockItem[]>([]);
    const [editTaskSearchTerm, setEditTaskSearchTerm] = useState('');
    const [editTaskFrequency, setEditTaskFrequency] = useState(1);

    const [taskDateFilter, setTaskDateFilter] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'ALL'>('TODAY');
    const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
    const [taskSubView, setTaskSubView] = useState<'ASSIGNMENTS' | 'LOG'>('ASSIGNMENTS');
    const [completionLog, setCompletionLog] = useState<TaskCompletion[]>([]);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportConfig, setExportConfig] = useState({
        categories: { KITCHEN: true, BAR: false, GENERAL: false, FUEL: false },
        showCost: true,
        lowStockOnly: false
    });
    const [printChunks, setPrintChunks] = useState<StockItem[][]>([]);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    // New inventory permissions are resolved here once and used by both UI and write handlers.
    // Boss sessions created before currentEmployee was passed remain fully compatible.
    const isLegacyBossSession = !employee && (!allowedModules || allowedModules.length === 0);
    const portalRole = employee
        ? getPortalRole(employee)
        : (isLegacyBossSession ? PortalRole.BOSS : PortalRole.STAFF);
    const inventoryAccess = useMemo(
        () => resolveInventoryAccess(employee, portalRole),
        [employee, portalRole],
    );
    const allowedScopes = inventoryAccess.scopes;
    const allowedScopeKey = allowedScopes.join('|');
    const canInventory = useCallback(
        (permission: InventoryPermission) => Boolean(inventoryAccess.permissions[permission]),
        [inventoryAccess.permissions],
    );
    const canViewStock = canInventory('VIEW_STOCK');
    const canExecuteStocktake = canInventory('EXECUTE_STOCKTAKE');
    const canAddItem = canInventory('ADD_ITEM');
    const canDeactivateItem = canInventory('DEACTIVATE_ITEM');
    const canEditExistingItem = ([
        'EDIT_BASIC_INFO',
        'EDIT_MIN_LEVEL',
        'EDIT_COUNT_UNIT_CONVERSION',
        'EDIT_PURCHASE_UNIT_CONVERSION',
        'EDIT_BASE_UNIT',
        'EDIT_COST',
    ] as InventoryPermission[]).some(canInventory);
    const canOpenItemDetails = canEditExistingItem || canDeactivateItem;
    const canAssignTasks = portalRole !== PortalRole.STAFF && canViewStock && canExecuteStocktake;
    const isRestrictedView = !canViewStock && canExecuteStocktake;
    const hasNoInventoryAccess = !canViewStock && !canExecuteStocktake;
    const isBossInventoryView = portalRole === PortalRole.BOSS;
    const isManagementInventoryView = portalRole === PortalRole.MANAGEMENT;
    const isStaffInventoryView = portalRole === PortalRole.STAFF;

    const mobileRoleTitle = isRestrictedView
        ? t('我的盘点任务')
        : isBossInventoryView
            ? t('库存经营总览')
            : isManagementInventoryView
                ? t('库存工作台')
                : canViewStock
                    ? t('库存总览')
                    : t('库存盘点');

    const activeTasks = useMemo(() => taskList.filter(task =>
        task.status === 'PENDING' &&
        task.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category)))
    ), [taskList, allowedScopeKey]);

    const assignedItemMap = useMemo(() => {
        const map: Record<string, { assigneeName: string, taskId: string }[]> = {};
        activeTasks.forEach(task => {
            task.items.forEach(ti => {
                if (!map[ti.stockId]) map[ti.stockId] = [];
                if (!map[ti.stockId].some(e => e.taskId === task.id)) {
                    map[ti.stockId].push({ assigneeName: task.assigneeName, taskId: task.id });
                }
            });
        });
        return map;
    }, [activeTasks]);

    const completionsByTask = useMemo(() => {
        const map: Record<string, TaskCompletion> = {};
        allRecentCompletions.forEach(c => {
            if (!map[c.taskId] || c.date > map[c.taskId].date) map[c.taskId] = c;
        });
        return map;
    }, [allRecentCompletions]);

    const todayCompletions = useMemo(() => {
        const today = getToday();
        const map: Record<string, TaskCompletion> = {};
        allRecentCompletions.filter(c => c.date === today).forEach(c => { map[c.taskId] = c; });
        return map;
    }, [allRecentCompletions]);

    // 🌟 修复: 区分同一个员工但不同频率的任务组 🌟
    const staffGroups: StaffAssignmentGroup[] = useMemo(() => {
        const groups: Record<string, StaffAssignmentGroup> = {};
        const today = getToday();
        
        activeTasks.forEach(task => {
            const freq = (task as any).checkFrequency || 1;
            const key = `${task.assigneeId}_${freq}`; // 用 员工ID + 频率 作为唯一分组Key
            
            if (!groups[key]) {
                groups[key] = {
                    groupId: key,
                    assigneeId: task.assigneeId, assigneeName: task.assigneeName,
                    tasks: [], allItems: [], needsMerge: false,
                    checkFrequency: freq, isDueToday: false
                };
            }
            groups[key].tasks.push(task);
        });

        Object.values(groups).forEach(g => {
            const itemMap = new Map<string, any>();
            g.tasks.forEach(task => task.items.forEach(item => {
                if (!itemMap.has(item.stockId)) itemMap.set(item.stockId, { stockId: item.stockId, stockName: item.stockName, category: item.category || 'KITCHEN' });
            }));
            g.allItems = Array.from(itemMap.values());
            g.needsMerge = g.tasks.length > 1;
            
            for (const task of g.tasks) {
                if (todayCompletions[task.id]) g.todayCompletion = todayCompletions[task.id];
                if (completionsByTask[task.id]) {
                    if (!g.lastCompletion || completionsByTask[task.id].date > g.lastCompletion.date) g.lastCompletion = completionsByTask[task.id];
                }
            }
            
            if (g.todayCompletion) { g.isDueToday = false; }
            else if (!g.lastCompletion) { g.isDueToday = true; }
            else { g.isDueToday = daysBetween(g.lastCompletion.date, today) >= g.checkFrequency; }
        });
        return Object.values(groups);
    }, [activeTasks, todayCompletions, completionsByTask]);

    const myDueTasks = useMemo(() => {
        if (!employee) return [];
        const today = getToday();
        return activeTasks.filter(task => {
            if (task.assigneeId !== employee.id) return false;
            if (!task.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category)))) return false;
            if (todayCompletions[task.id]) return false;
            const freq = (task as any).checkFrequency || 1;
            const last = completionsByTask[task.id];
            if (!last) return true;
            return daysBetween(last.date, today) >= freq;
        });
    }, [activeTasks, employee, todayCompletions, completionsByTask, allowedScopeKey]);

    const myDoneToday = useMemo(() => {
        if (!employee) return [];
        return activeTasks.filter(t =>
            t.assigneeId === employee.id &&
            t.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category))) &&
            !!todayCompletions[t.id]
        );
    }, [activeTasks, employee, todayCompletions, allowedScopeKey]);

    useEffect(() => {
        if (allowedScopes.length === 0) {
            setItems([]);
            return;
        }
        if (!allowedScopes.includes(currentStockView)) {
            setCurrentStockView(allowedScopes[0]);
            return;
        }
        if (canViewStock || canExecuteStocktake) loadStock(currentStockView);
    }, [currentStockView, allowedScopeKey, canViewStock, canExecuteStocktake]);

    useEffect(() => {
        if (hasNoInventoryAccess) return;
        if (viewType === 'TASKS' && !canAssignTasks) setViewType('LIST');
        if (mode === 'ASSIGN' && !canAssignTasks) {
            setMode(canViewStock ? 'MASTER' : 'CHECK');
            setViewType('LIST');
        } else if (mode === 'MASTER' && !canViewStock) {
            setMode('CHECK');
            setViewType('LIST');
        } else if (mode === 'CHECK' && !canExecuteStocktake && canViewStock) {
            setMode('MASTER');
            setViewType('LIST');
        }
    }, [mode, viewType, canAssignTasks, canViewStock, canExecuteStocktake, hasNoInventoryAccess]);

    useEffect(() => {
        const nextCategories = { KITCHEN: false, BAR: false, GENERAL: false, FUEL: false };
        const firstAllowed = allowedScopes[0];
        if (firstAllowed) nextCategories[firstAllowed] = true;
        setExportConfig(prev => ({ ...prev, categories: nextCategories }));
    }, [allowedScopeKey]);

    useEffect(() => {
        loadTasks();
        loadCompletions();
    }, [employee?.id, mode]);

    useEffect(() => {
        if (viewType === 'HISTORY') loadLogs();
    }, [viewType]);

    useEffect(() => {
        if (viewType === 'TASKS' && taskSubView === 'LOG') loadCompletionLog();
    }, [viewType, taskSubView, taskDateFilter]);

    useEffect(() => {
        if (initialSearchTerm) {
            setSearchTerm(initialSearchTerm);
        }
    }, [initialSearchTerm]);

    useEffect(() => {
        if (editingItem && editingItem.id) {
            const CACHE_KEY = 'inventory_suppliers_cache';
            const cached = sessionStorage.getItem(CACHE_KEY);
            
            const processSuppliers = (allSuppliers: Supplier[]) => {
                const linked = allSuppliers.filter(s => 
                    s.catalog?.some(c => c.linkedStockId === editingItem.id)
                );
                setLinkedSuppliers(linked);
            };

            if (cached) {
                processSuppliers(JSON.parse(cached));
            } else {
                DataManager.getSuppliers().then(allSuppliers => {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify(allSuppliers));
                    processSuppliers(allSuppliers);
                });
            }
        } else {
            setLinkedSuppliers([]);
        }
    }, [editingItem?.id]);

    const loadStock = async (view: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL') => {
        const data = await DataManager.getStock(view);
        setItems(data);
        const initialCounts: Record<string, number> = {};
        data.forEach(item => {
            initialCounts[item.id] = getPreferredCountQuantity(item);
        });
        setCounts(initialCounts);
        setCheckedItems({}); 
        setSelectedForAssign(new Set()); 
    };

    // 🛡️ 致命漏洞修复区：拦截全量加载，强制设限防爆
    const loadLogs = async () => {
        try {
            // DataManager 端已更新为默认 50 条，这里明确显式传入 50 以做双重保险
            const allLogs = await DataManager.getInventoryLogs(50);
            setLogs((allLogs || []).filter(log =>
                !log.category || allowedScopes.includes(log.category as InventoryScope)
            ));
        } catch (error) {
            console.error("加载历史记录失败，可能触发限流:", error);
            setLogs([]);
        }
    };

    const loadTasks = async () => {
        try {
            const allTasks = await DataManager.getInventoryTasks();
            if (canAssignTasks) {
                setTaskList(allTasks);
            } else {
                setTaskList(allTasks.filter(t => t.assigneeId === employee?.id || t.creatorId === employee?.id));
            }
        } catch (e) {
            console.error("Error loading tasks", e);
        }
    };

    const loadCompletions = async () => {
        try {
            const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            const data = await DataManager.getTaskCompletionsByRange(start, getToday());
            setAllRecentCompletions(data as any as TaskCompletion[]);
        } catch (e) { console.error("Error loading completions", e); }
    };

    const loadCompletionLog = async () => {
        try {
            const now = new Date(); const today = getToday(); const yesterday = getYesterday();
            const sow = new Date(now); sow.setDate(sow.getDate() - sow.getDay());
            let sd = today, ed = today;
            if (taskDateFilter === 'YESTERDAY') { sd = yesterday; ed = yesterday; }
            else if (taskDateFilter === 'WEEK') { sd = sow.toISOString().split('T')[0]; }
            else if (taskDateFilter === 'ALL') { sd = '2020-01-01'; }
            const data = await DataManager.getTaskCompletionsByRange(sd, ed) as any as TaskCompletion[];
            const allowedTaskIds = new Set(taskList
                .filter(task => task.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category))))
                .map(task => task.id));
            setCompletionLog(data.filter(completion => allowedTaskIds.has(completion.taskId)));
        } catch (e) { console.error(e); }
    };

    const handleViewChange = (view: InventoryScope) => {
        if (!allowedScopes.includes(view)) return;
        setCurrentStockView(view);
        setSearchTerm('');
    };

    // ⚡ 护栏：使用 useCallback 冻结函数内存地址，彻底激活 MemoizedStockCard 的防重绘能力
    const toggleSection = React.useCallback((sectionId: string) => {
        setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    }, []);

    const handleCountChange = React.useCallback((id: string, val: number) => {
        if (!canExecuteStocktake) return;
        const numericValue = Number(val);
        const safeValue = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
        setCounts(prev => ({ ...prev, [id]: safeValue }));
    }, [canExecuteStocktake]);

    const toggleItemChecked = React.useCallback((id: string) => {
        if (!canExecuteStocktake) return;
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    }, [canExecuteStocktake]);

    const toggleAssignSelect = React.useCallback((id: string) => {
        if (!canAssignTasks) return;
        setSelectedForAssign(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    }, [canAssignTasks]);

    // 🌟 修复：重构库存提交，支持跨分类（KITCHEN/FUEL等） 🌟
    const handleSubmitCheck = async (taskRef?: InventoryTask) => {
        if (!canExecuteStocktake) {
            alert('你没有执行盘点的权限。');
            return;
        }
        if (!allowedScopes.includes(currentStockView) && !taskRef) {
            alert('你没有这个库存区域的权限。');
            return;
        }
        if (taskRef && !taskRef.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category)))) {
            alert('这个任务包含你无权处理的库存区域，请联系管理层调整任务。');
            return;
        }
        let targetItems = items;

        if (taskRef) {
             const hasUnconfirmedItems = taskRef.items.some(item => !checkedItems[item.stockId]);
             if (hasUnconfirmedItems) {
                 alert("请先确认所有盘点物品后再提交。");
                 return;
             }
             // 任务包含的所有分类数据现在都在 items 里，直接过滤出这个任务要做的
             targetItems = items.filter(i => taskRef.items.some(ti => ti.stockId === i.id));
        } else {
             if (!await (window as any).systemDialog.confirm("您确认要提交当前盘点并更新库存数据吗？", "库存管理")) return;
        }
        
        setIsSubmitting(true);
        try {
            const logItems: any[] = [];
            const updatedItems: StockItem[] = [];
            
            // 计算更新后的数量与差额
            targetItems.forEach(item => {
                const qtyBase = getCurrentQtyBase(item);

                // inputCount holds display quantity if in display mode
                const inputCount = counts[item.id] !== undefined ? counts[item.id] : getPreferredCountQuantity(item);
                
                // Convert back to base quantity
                const newQtyBase = convertCountInputToBase(item, inputCount);
                const diffBase = newQtyBase - qtyBase;
                
                if (diffBase !== 0) {
                    const costPerBase = getCostPerBaseUnit(item);
                    const valChange = diffBase * costPerBase;
                    logItems.push({
                        stockId: item.id, stockName: item.name,
                        oldQty: qtyBase, newQty: newQtyBase, diff: diffBase,
                        unit: getBaseUnit(item), cost: costPerBase, valueChange: valChange,
                        _category: item.category // 暂存分类以便后续分组
                    });
                }
                
                updatedItems.push({
                    ...item,
                    currentQtyBase: newQtyBase,
                    currentQty: newQtyBase // sync legacy field
                } as StockItem);
            });
            
            // ⚡ 增量更新：只写有变动的物品，必须携带 diff 给后端！
            const changedOnly = updatedItems.map(item => {
                const original = targetItems.find(t => t.id === item.id);
                const originalQtyBase = getCurrentQtyBase(original);
                const diff = item.currentQtyBase - originalQtyBase;
                return { ...item, diff }; // 将差异值携带进去
            }).filter(item => item.diff !== 0);

            // 按大分类分组（仅变动物品）
            const changedByCategory: Record<string, StockItem[]> = {};
            changedOnly.forEach(item => {
                const cat = item.category || currentStockView;
                let mainCategory = currentStockView;
                for (const [groupKey, sections] of Object.entries(CATEGORY_SECTIONS)) {
                    if (sections.some(s => s.id === cat)) {
                        mainCategory = groupKey as any;
                        break;
                    }
                }
                if (!changedByCategory[mainCategory]) changedByCategory[mainCategory] = [];
                changedByCategory[mainCategory].push(item);
            });

            // 日志按分类分组
            const logItemsByCategory: Record<string, InventoryLogItem[]> = {};
            logItems.forEach((li) => {
                let mainCategory = currentStockView;
                for (const [groupKey, sections] of Object.entries(CATEGORY_SECTIONS)) {
                    if (sections.some(s => s.id === li._category)) {
                        mainCategory = groupKey as any;
                        break;
                    }
                }
                if (!logItemsByCategory[mainCategory]) logItemsByCategory[mainCategory] = [];
                const { _category, ...cleanLog } = li;
                logItemsByCategory[mainCategory].push(cleanLog);
            });

            // ⚡ 护栏: 跨表更新强制使用 Promise.all 并发执行，防范 Partial Failure (数据断层)
            const updatePromises = [];
            const allCats = new Set([...Object.keys(changedByCategory), ...Object.keys(logItemsByCategory)]);
            
            for (const cat of allCats) {
                if (changedByCategory[cat] && changedByCategory[cat].length > 0) {
                    updatePromises.push(DataManager.batchUpdateStock(cat as any, changedByCategory[cat]));
                }
                
                if (logItemsByCategory[cat] && logItemsByCategory[cat].length > 0) {
                    const totalVal = logItemsByCategory[cat].reduce((sum, item) => sum + item.valueChange, 0);
                    const newLog: InventoryLog = {
                        id: `log_${cat}_${Date.now()}`,
                        date: new Date().toISOString().split('T')[0],
                        timestamp: new Date().toISOString(),
                        staffName: employee?.name || 'Unknown',
                        totalValueChange: totalVal,
                        items: logItemsByCategory[cat],
                        category: cat as any
                    };
                    updatePromises.push(DataManager.saveInventoryLog(newLog));
                }
            }

            // 并发执行所有事务，任何一个失败都会被 catch 捕获，避免“半拉子更新”
            await Promise.all(updatePromises);

            // 完成任务后记录 Completion
            if (taskRef) {
                const completion: TaskCompletion = {
                    id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    taskId: taskRef.id,
                    assigneeId: employee?.id || 'unknown',
                    assigneeName: employee?.name || 'Unknown',
                    date: getToday(),
                    completedAt: new Date().toISOString(),
                    items: taskRef.items.map(ti => {
                        const item = items.find(i => i.id === ti.stockId);
                        const cnt = counts[ti.stockId];
                        const countedBase = cnt !== undefined ? convertCountInputToBase(item, cnt) : undefined;
                        return {
                            stockId: ti.stockId,
                            stockName: ti.stockName,
                            countedQty: countedBase
                        };
                    })
                };
                await DataManager.saveTaskCompletion(completion as any);

                // ⚡ 本地同步，不全量重拉
                setItems(prev => prev.map(i => {
                    const changed = changedOnly.find(c => c.id === i.id);
                    return changed || i;
                }));
                await loadCompletions();
                setMyTask(null); // 自动退出任务执行模式
                alert("✅ 盘点已完成！");
                loadTasks();
            } else {
                alert("✅ 库存已更新！");
                // 局部更新 UI 避免重新加载
                setItems(prev => prev.map(i => {
                    const u = updatedItems.find(ui => ui.id === i.id);
                    return u || i;
                }));
            }

            setCheckedItems({}); 

        } catch (e) {
            console.error(e);
            alert("Failed to update stock.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveMaster = async () => {
        if (!editingItem || !editingItem.name) return alert("请输入物品名称 (Name required)");
        if (!allowedScopes.includes(currentStockView)) return alert('你没有这个库存区域的权限。');

        const isNewItem = !editingItem.id;
        if (isNewItem && !canAddItem) return alert('你没有新增物品的权限。');
        const originalItem = editingItem.id ? items.find(item => item.id === editingItem.id) : undefined;

        if (!isNewItem) {
            if (!originalItem) return alert('找不到原始物品资料，请刷新后重试。');

            const changed = (fields: Array<keyof StockItem>) => fields.some(field =>
                JSON.stringify(originalItem[field] ?? null) !== JSON.stringify(editingItem[field] ?? null)
            );
            const baseUnitChanged = changed(['baseUnit', 'unit']);
            const purchaseUnitChanged = changed(['purchaseUnits', 'uomOptions']);
            const denied: InventoryPermission[] = [];

            if (changed(['name', 'category', 'image', 'isKeyItem', 'yieldPercent', 'overheadPercent', 'sstPercent']) && !canInventory('EDIT_BASIC_INFO')) {
                denied.push('EDIT_BASIC_INFO');
            }
            if (!baseUnitChanged && changed(['minLevelBase', 'minLevel', 'maxQtyBase', 'maxQty']) && !canInventory('EDIT_MIN_LEVEL')) {
                denied.push('EDIT_MIN_LEVEL');
            }
            if (!baseUnitChanged && changed(['displayUnit', 'displayToBaseRatio', 'preferredStockViewUnit']) && !canInventory('EDIT_COUNT_UNIT_CONVERSION')) {
                denied.push('EDIT_COUNT_UNIT_CONVERSION');
            }
            if (!baseUnitChanged && purchaseUnitChanged && !canInventory('EDIT_PURCHASE_UNIT_CONVERSION')) {
                denied.push('EDIT_PURCHASE_UNIT_CONVERSION');
            }
            if (baseUnitChanged && !canInventory('EDIT_BASE_UNIT')) {
                denied.push('EDIT_BASE_UNIT');
            }
            if (!baseUnitChanged && !purchaseUnitChanged && changed(['costPerBaseUnit', 'cost']) && !canInventory('EDIT_COST')) {
                denied.push('EDIT_COST');
            }
            if (!baseUnitChanged && changed(['currentQtyBase', 'currentQty']) && !canExecuteStocktake) {
                denied.push('EXECUTE_STOCKTAKE');
            }

            if (denied.length > 0) {
                const uniqueDenied = Array.from(new Set(denied));
                alert(`这些修改没有权限：\n${uniqueDenied.map(permission => `• ${INVENTORY_PERMISSION_LABELS[permission]}`).join('\n')}`);
                return;
            }
        }
        
        setIsSubmitting(true);
        
        try {
            const safeNum = (v: any) => {
                const n = parseFloat(v);
                return isNaN(n) ? 0 : n;
            };

            const pUnits = editingItem.purchaseUnits || [];
            const dPU = pUnits.find(p => p.isDefaultPurchase) || pUnits[0];
            const derivedCostPerBase = dPU && typeof dPU.pricePerUnit === 'number' && dPU.pricePerUnit > 0 && dPU.toBaseRatio > 0
                ? safeNum(dPU.pricePerUnit) / dPU.toBaseRatio 
                : safeNum(editingItem.costPerBaseUnit ?? editingItem.cost ?? 0);
            const purchaseConfigChanged = Boolean(originalItem) &&
                JSON.stringify(originalItem?.purchaseUnits ?? []) !== JSON.stringify(editingItem.purchaseUnits ?? []);
            const baseUnitChanged = Boolean(originalItem) &&
                (originalItem?.baseUnit || originalItem?.unit) !== (editingItem.baseUnit || editingItem.unit);
            const mayRecalculateCost = isNewItem || canInventory('EDIT_COST') || purchaseConfigChanged || baseUnitChanged;
            const computedCostPerBase = mayRecalculateCost
                ? derivedCostPerBase
                : getCostPerBaseUnit(originalItem);

            const baseUnitVal = editingItem.baseUnit || editingItem.unit || 'pcs';
            const qtyBaseVal = safeNum(editingItem.currentQtyBase !== undefined ? editingItem.currentQtyBase : editingItem.currentQty);
            const minLevelBaseVal = safeNum(editingItem.minLevelBase !== undefined ? editingItem.minLevelBase : editingItem.minLevel);
            const maxQtyBaseVal = safeNum(editingItem.maxQtyBase !== undefined ? editingItem.maxQtyBase : (editingItem.maxQty ?? 10000));

            const newItem: StockItem = {
                ...editingItem,
                id: editingItem.id || `${currentStockView.charAt(0)}_${Date.now()}`,
                
                // Legacy fields sync
                currentQty: qtyBaseVal,
                minLevel: minLevelBaseVal,
                maxQty: maxQtyBaseVal,
                cost: computedCostPerBase,
                unit: baseUnitVal,
                category: editingItem.category || (CATEGORY_SECTIONS[currentStockView][0].id),
                isKeyItem: editingItem.isKeyItem || false, 
                
                // Modern ERP fields
                baseUnit: baseUnitVal,
                displayUnit: editingItem.displayUnit || baseUnitVal,
                displayToBaseRatio: safeNum(editingItem.displayToBaseRatio ?? 1),
                currentQtyBase: qtyBaseVal,
                minLevelBase: minLevelBaseVal,
                maxQtyBase: maxQtyBaseVal,
                costPerBaseUnit: computedCostPerBase,
                purchaseUnits: pUnits,
                yieldPercent: safeNum(editingItem.yieldPercent ?? 100),
                overheadPercent: safeNum(editingItem.overheadPercent ?? 0),
                sstPercent: safeNum(editingItem.sstPercent ?? 0),
                
                uomOptions: pUnits.map(pu => ({
                    label: pu.unitName,
                    value: pu.unitName,
                    ratio: pu.toBaseRatio,
                    price: pu.pricePerUnit
                })),
                weightPerUnit: safeNum(editingItem.weightPerUnit), 
                conversionUnit: editingItem.conversionUnit || 'kg' 
            } as StockItem;

            await DataManager.saveStockItem(currentStockView, newItem);
            setEditingItem(null);
            await loadStock(currentStockView);
        } catch (error) {
            console.error(error);
            alert("保存失败 (Failed to save)");
        } finally {
            setIsSubmitting(false);
        }
    };
    const initiateAssignment = async () => {
        if (!canAssignTasks) return alert('你没有指派盘点任务的权限。');
        if (selectedForAssign.size === 0) return alert("请先选择物品 (Select items first)");
        const staff = await DataManager.getEmployees();
        setStaffList(staff.filter(s => !s.isArchived));
        setAssignFrequency(1);
        setIsAssignModalOpen(true);
    };

    // 🌟 修复：指派任务时只合并同等频率的任务 🌟
    const confirmAssignment = async () => {
        if (!canAssignTasks) return alert('你没有指派盘点任务的权限。');
        if (!selectedAssignee) return alert("Select staff");
        const assignee = staffList.find(s => s.id === selectedAssignee);
        if (!assignee) return;

        // 【关键修复】只查找该员工相同盘点频率的任务进行合并
        const existing = activeTasks.filter(t => t.assigneeId === assignee.id && t.checkFrequency === assignFrequency);

        const newTaskItems = items
            .filter(i => selectedForAssign.has(i.id))
            .map(i => ({
                stockId: i.id, stockName: i.name,
                category: currentStockView, currentQty: getCurrentQtyBase(i)
            }));

        if (existing.length > 0) {
            const allExisting = existing.flatMap(t => t.items);
            const existingIds = new Set(allExisting.map(i => i.stockId));
            const itemsToAdd = newTaskItems.filter(ni => !existingIds.has(ni.stockId));
            
            if (itemsToAdd.length === 0) {
                alert(`⚠️ ${assignee.name} 的任务已包含所有选中物品。`);
                setIsAssignModalOpen(false);
                return;
            }

            const deduped = new Map<string, any>();
            [...allExisting, ...itemsToAdd].forEach(i => { if (!deduped.has(i.stockId)) deduped.set(i.stockId, i); });

            await DataManager.saveInventoryTask({ ...existing[0], items: Array.from(deduped.values()), checkFrequency: assignFrequency } as any);

            for (let i = 1; i < existing.length; i++) {
                await DataManager.deleteInventoryTask(existing[i].id);
            }

            setIsAssignModalOpen(false);
            setSelectedForAssign(new Set());
            setMode('CHECK');
            loadTasks();
            alert(`✅ 已追加 ${itemsToAdd.length} 个物品到 ${assignee.name} 的${assignFrequency}天任务中`);
        } else {
            const newTask: InventoryTask = {
                id: `task_${Date.now()}`,
                createdAt: new Date().toISOString(),
                creatorId: employee?.id || 'admin',
                creatorName: employee?.name || 'Admin',
                assigneeId: assignee.id,
                assigneeName: assignee.name,
                status: 'PENDING',
                items: newTaskItems,
                checkFrequency: assignFrequency
            } as any;

            await DataManager.saveInventoryTask(newTask);
            setIsAssignModalOpen(false);
            setSelectedForAssign(new Set());
            setMode('CHECK');
            loadTasks();
            alert(`✅ 常驻任务已派发给 ${assignee.name}（每${assignFrequency === 1 ? '天' : assignFrequency + '天'}）`);
        }
    };

    const mergeStaffTasks = async (assigneeId: string, frequency: number) => {
        if (!canAssignTasks) return alert('你没有管理盘点任务的权限。');
        const st = activeTasks.filter(t => t.assigneeId === assigneeId && t.checkFrequency === frequency);
        if (st.length <= 1) return;
        const im = new Map<string, any>();
        st.forEach(task => task.items.forEach(item => { if (!im.has(item.stockId)) im.set(item.stockId, item); }));
        await DataManager.saveInventoryTask({ ...st[0], items: Array.from(im.values()) });
        for (let i = 1; i < st.length; i++) await DataManager.deleteInventoryTask(st[i].id);
        loadTasks();
        alert(`✅ 已合并该员工的 ${st.length} 个同频率任务`);
    };

    const cancelStaffAssignment = async (assigneeId: string, frequency: number) => {
        if (!canAssignTasks) return alert('你没有管理盘点任务的权限。');
        const st = activeTasks.filter(t => t.assigneeId === assigneeId && t.checkFrequency === frequency);
        if (!await (window as any).systemDialog.confirm(`确定取消该员工（每${frequency}天）的所有盘点任务？(${st.length} 个任务)`, "库存管理")) return;
        for (const task of st) await DataManager.saveInventoryTask({ ...task, status: 'COMPLETED' });
        loadTasks();
        alert("✅ 已取消指定任务");
    };

    const openTaskEditor = async (task: InventoryTask) => {
        if (!canAssignTasks) return alert('你没有编辑盘点任务的权限。');
        if (task.status !== 'PENDING') return;
        setEditingTask(task);
        setEditTaskSearchTerm('');
        setEditTaskFrequency((task as any).checkFrequency || 1);
        
        const results = await Promise.all(allowedScopes.map(scope => DataManager.getStock(scope)));
        setEditTaskStockData(results.flat());
        setEditTaskItems(new Set(task.items.map(i => i.stockId)));
    };

    const toggleEditTaskItem = (stockId: string) => {
        const newSet = new Set(editTaskItems);
        if (newSet.has(stockId)) newSet.delete(stockId);
        else newSet.add(stockId);
        setEditTaskItems(newSet);
    };

    const saveTaskEdits = async () => {
        if (!canAssignTasks) return alert('你没有编辑盘点任务的权限。');
        if (!editingTask) return;
        if (editTaskItems.size === 0) {
            if (await (window as any).systemDialog.confirm("由于没有选中任何盘点物品，是否要直接取消（废弃）此盘点任务？", "库存管理")) {
                await DataManager.saveInventoryTask({ ...editingTask, status: 'COMPLETED' });
                setEditingTask(null);
                loadTasks();
                return;
            }
            return;
        }

        const updatedItems = Array.from(editTaskItems).map(stockId => {
            const existing = editingTask.items.find(i => i.stockId === stockId);
            const stockItem = editTaskStockData.find(s => s.id === stockId);
            if (!stockItem) return existing || null;
            
            let itemCategory = 'KITCHEN';
            for (const [groupKey, sections] of Object.entries(CATEGORY_SECTIONS)) {
                if (sections.some(s => s.id === stockItem.category)) {
                    itemCategory = groupKey;
                    break;
                }
            }
            
            return {
                ...existing,
                stockId: stockItem.id, stockName: stockItem.name,
                category: itemCategory, currentQty: getCurrentQtyBase(stockItem)
            };
        }).filter(Boolean);

        await DataManager.saveInventoryTask({
            ...editingTask,
            items: updatedItems as any,
            checkFrequency: editTaskFrequency
        } as any);
        setEditingTask(null);
        loadTasks();
        alert("✅ 任务已更新");
    };

    // 🌟 修复：执行任务时加载该任务跨越的所有分类，并动态剔除已被删除的幽灵物品 🌟
    const startTaskExecution = async (task: InventoryTask) => {
        if (!canExecuteStocktake) return alert('你没有执行盘点的权限。');
        if (!task.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category)))) {
            alert('这个任务包含你无权处理的库存区域，请联系管理层调整任务。');
            return;
        }
        // 提取任务中包含的所有主分类 (e.g. ['KITCHEN', 'FUEL'])
        const categoriesInTask = Array.from(new Set(task.items.map(ti => {
            let cat = 'KITCHEN';
            for (const [groupKey, sections] of Object.entries(CATEGORY_SECTIONS)) {
                if (sections.some(s => s.id === ti.category)) {
                    cat = groupKey; break;
                }
            }
            return cat;
        })));
        
        // 如果数据异常，至少保证拉一个 KITCHEN
        if (categoriesInTask.length === 0) categoriesInTask.push('KITCHEN');

        // 拉取所需所有分类的数据并平铺
        const promises = categoriesInTask.map(c => DataManager.getStock(c as any));
        const results = await Promise.all(promises);
        const allRelevantStock = results.flat();
        
        // 【核心防御】：只保留在真实库存中依然存活的物品
        const validTaskItems = task.items.filter(ti => allRelevantStock.some(s => s.id === ti.stockId));
        const taskItemsData = allRelevantStock.filter(i => validTaskItems.some(ti => ti.stockId === i.id));
        
        // 极端情况拦截：如果任务里所有东西都被老板删完了
        if (validTaskItems.length === 0) {
            alert("⚠️ 该任务包含的所有物品均已被移出库存，任务自动失效。");
            await DataManager.saveInventoryTask({ ...task, status: 'COMPLETED' });
            loadTasks();
            return;
        }

        setItems(taskItemsData);
        
        const initialCounts: Record<string, number> = {};
        taskItemsData.forEach(item => { initialCounts[item.id] = getPreferredCountQuantity(item); });
        setCounts(initialCounts);
        setCheckedItems({});
        
        // 【修正进度条】：覆盖传入的 task，把 items 替换为剥离幽灵物品后的 validTaskItems
        setMyTask({ ...task, items: validTaskItems } as InventoryTask);
        setMode('CHECK');
    };

    const handleDeleteClick = () => {
        if (!canDeactivateItem) return alert('你没有停用／删除物品的权限。');
        setShowDeleteConfirm(true);
    };

    const executeDelete = async () => {
        if (!canDeactivateItem) return alert('你没有停用／删除物品的权限。');
        if (!allowedScopes.includes(currentStockView)) return alert('你没有这个库存区域的权限。');
        if (editingItem && editingItem.id) {
            setIsSubmitting(true);
            try {
                // 1. 从主库存中彻底删除
                await DataManager.deleteStockItem(currentStockView, editingItem.id);

                // 2. 防御性清理：查找并清洗所有未完成的关联任务
                const affectedTasks = activeTasks.filter(t => 
                    t.items.some(i => i.stockId === editingItem?.id)
                );

                for (const task of affectedTasks) {
                    const newItems = task.items.filter(i => i.stockId !== editingItem.id);
                    if (newItems.length === 0) {
                        // 如果任务里的物品全被删光了，直接结束该幽灵任务
                        await DataManager.saveInventoryTask({ ...task, status: 'COMPLETED' });
                    } else {
                        // 否则更新任务，仅剔除已被删除的物品
                        await DataManager.saveInventoryTask({ ...task, items: newItems as any });
                    }
                }

                // 3. 刷新视图
                await loadStock(currentStockView);
                await loadTasks(); // 刷新任务列表以反映最新状态
                setEditingItem(null);
                setShowDeleteConfirm(false);
            } catch (error) {
                console.error("Failed to delete stock item or update tasks", error);
                alert("❌ 删除过程中发生错误，请检查网络。");
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    // ⚡ 护栏：缓存搜索结果，别人在输入盘点数字时，不要去重算庞大的搜索逻辑
    const filteredItems = useMemo(() => {
        return items.filter(i => {
            if (!searchTerm) return true;
            return i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.id.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [items, searchTerm]);

    const totalInventoryValue = useMemo(() => {
        return filteredItems.reduce((total, item) => total + getStockValue(item), 0);
    }, [filteredItems]);

    const mobileStockSummary = useMemo(() => ({
        itemCount: filteredItems.length,
        lowStockCount: filteredItems.filter(item => getStockStatus(item) === 'LOW_STOCK').length,
        outOfStockCount: filteredItems.filter(item => getStockStatus(item) === 'OUT_OF_STOCK').length,
    }), [filteredItems]);

    const openMobileWorkspace = (target: 'STOCK' | 'CHECK' | 'TASKS' | 'HISTORY') => {
        if (target === 'CHECK') {
            if (!canExecuteStocktake) return;
            setMode('CHECK');
            setViewType('LIST');
            return;
        }

        if (!canViewStock) return;
        setMode('MASTER');
        setViewType(target === 'TASKS' ? 'TASKS' : target === 'HISTORY' ? 'HISTORY' : 'LIST');
    };

    const handleCategoryToggle = (key: keyof typeof exportConfig.categories) => {
        if (!canViewStock || !allowedScopes.includes(key)) return;
        setExportConfig(prev => ({
            ...prev,
            categories: { ...prev.categories, [key]: !prev.categories[key] }
        }));
    };

// 新增：追踪 Excel 生成状态
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

    // 新增：处理 Excel 导出，完全不干涉你的 PDF 逻辑
    // 新增：处理 Excel 导出
    // 新增：处理带颜色和宽度的专业版 Excel 导出
    const executeExcelExport = async () => {
        if (!canViewStock) return alert('你没有查看／导出库存的权限。');
        setIsGeneratingExcel(true);
        setIsExportModalOpen(false);

        try {
            const promises = [];
            if (exportConfig.categories.KITCHEN && allowedScopes.includes('KITCHEN')) promises.push(DataManager.getStock('KITCHEN'));
            if (exportConfig.categories.BAR && allowedScopes.includes('BAR')) promises.push(DataManager.getStock('BAR'));
            if (exportConfig.categories.GENERAL && allowedScopes.includes('GENERAL')) promises.push(DataManager.getStock('GENERAL'));
            if (exportConfig.categories.FUEL && allowedScopes.includes('FUEL')) promises.push(DataManager.getStock('FUEL'));

            const results = await Promise.all(promises);
            let allItems = results.flat();

            if (exportConfig.lowStockOnly) {
                allItems = allItems.filter(needsReplenishment);
            }

            // 排序逻辑：先按分类排，再按名称排
            allItems.sort((a, b) => {
                if (a.category !== b.category) return a.category.localeCompare(b.category);
                return a.name.localeCompare(b.name);
            });

            // 1. 创建工作簿和表格
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Price Comparison');

            // 2. 设定列宽 (设置你截图里想要的阔度)
            worksheet.columns = [
                { header: '分类 (Category)', key: 'category', width: 22 },
                { header: '产品名称 (Item Name)', key: 'name', width: 40 },
                { header: '单位 (Unit)', key: 'unit', width: 15 },
                { header: '成本价 (Cost)', key: 'cost', width: 20 }
            ];

            // 3. 设置表头颜色 (黑底，金字，居中对齐)
            const headerRow = worksheet.getRow(1);
            headerRow.height = 25; // 加高表头
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1A1A1A' } // 黑色背景
                };
                cell.font = {
                    color: { argb: 'FFFFD700' }, // 金色文字
                    bold: true,
                    size: 12
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                // 加上边框
                cell.border = {
                    top: {style:'thin', color: {argb:'FFD1D5DB'}},
                    left: {style:'thin', color: {argb:'FFD1D5DB'}},
                    bottom: {style:'thin', color: {argb:'FFD1D5DB'}},
                    right: {style:'thin', color: {argb:'FFD1D5DB'}}
                };
            });

            // 4. 填入数据
            allItems.forEach(item => {
                const row = worksheet.addRow({
                    category: getCategoryLabel(item.category),
                    name: item.name,
                    unit: getBaseUnit(item).toUpperCase(),
                    // 带有 RM 和 2位小数的格式
                    cost: exportConfig.showCost ? `RM ${getCostPerBaseUnit(item).toFixed(2)}` : '***'
                });

                // 给数据行也加上边框和间距
                row.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: {style:'thin', color: {argb:'FFEEEEEE'}},
                        bottom: {style:'thin', color: {argb:'FFEEEEEE'}}
                    };
                    cell.alignment = { vertical: 'middle', indent: 1 };
                    
                    // 成本列内容靠右对齐，看起来更专业
                    if (colNumber === 4) {
                        cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
                    }
                });
            });

            // 5. 生成并下载文件 (不依赖任何外部下载插件，纯原生方法)
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const dateStr = new Date().toISOString().split('T')[0];
            a.download = `Inventory_Price_Compare_${dateStr}.xlsx`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

        } catch (e) {
            console.error(e);
            alert("Excel 导出失败");
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    const executeExport = async () => {
        if (!canViewStock) return alert('你没有查看／导出库存的权限。');
        setIsGeneratingPdf(true);
        setIsExportModalOpen(false);

        try {
            const promises = [];
            if (exportConfig.categories.KITCHEN && allowedScopes.includes('KITCHEN')) promises.push(DataManager.getStock('KITCHEN'));
            if (exportConfig.categories.BAR && allowedScopes.includes('BAR')) promises.push(DataManager.getStock('BAR'));
            if (exportConfig.categories.GENERAL && allowedScopes.includes('GENERAL')) promises.push(DataManager.getStock('GENERAL'));
            if (exportConfig.categories.FUEL && allowedScopes.includes('FUEL')) promises.push(DataManager.getStock('FUEL'));

            const results = await Promise.all(promises);
            let allItems = results.flat();

            if (exportConfig.lowStockOnly) {
                allItems = allItems.filter(needsReplenishment);
            }

            allItems.sort((a, b) => {
                if (a.category !== b.category) return a.category.localeCompare(b.category);
                return a.name.localeCompare(b.name);
            });

            const chunkSize = 25;
            const chunks = [];
            for (let i = 0; i < allItems.length; i += chunkSize) {
                chunks.push(allItems.slice(i, i + chunkSize));
            }
            setPrintChunks(chunks);

            await new Promise(r => setTimeout(r, 1000));

            if (!printRef.current) throw new Error("Print ref not found");

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            
            for (let i = 0; i < chunks.length; i++) {
                const pageId = `print-page-${i}`;
                const element = document.getElementById(pageId);
                if (!element) continue;

                if (i > 0) pdf.addPage();

                const canvas = await html2canvas(element, { 
                    scale: 2, 
                    useCORS: true, 
                    backgroundColor: '#ffffff',
                    onclone: (clonedDoc) => {
                        const clonedEl = clonedDoc.getElementById(`print-page-${i}`);
                        const originalEl = document.getElementById(`print-page-${i}`);
                        if (originalEl && clonedEl) {
                            applyResolvedStylesForPdf(originalEl as HTMLElement, clonedEl as HTMLElement);
                        }
                    }
                });
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const imgProps = pdf.getImageProperties(imgData);
                const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
            }

            pdf.save(`Inventory_Report_${new Date().toISOString().split('T')[0]}.pdf`);

        } catch (e) {
            console.error(e);
            alert("Export failed");
        } finally {
            setIsGeneratingPdf(false);
            setPrintChunks([]);
        }
    };

    const groupItemsByCategory = (taskItems: { stockId: string; stockName: string; category: string }[]) => {
        const grouped: Record<string, typeof taskItems> = {};
        taskItems.forEach(item => {
            const cat = item.category || 'UNKNOWN';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        return grouped;
    };

    const renderItemCard = (item: StockItem) => {
        return (
            <MemoizedStockCard
                key={item.id}
                item={item}
                mode={mode}
                isChecked={checkedItems[item.id]}
                currentCount={counts[item.id] !== undefined ? counts[item.id] : getPreferredCountQuantity(item)}
                assignedTo={assignedItemMap[item.id]}
                onCountChange={handleCountChange}
                onToggleCheck={toggleItemChecked}
                onEdit={mode === 'MASTER' && canOpenItemDetails ? setEditingItem : undefined}
                onAssignToggle={toggleAssignSelect}
                isSelectedForAssign={selectedForAssign.has(item.id)}
                tItem={tItem}
                tUnit={tUnit}
                getCategoryColor={getCategoryColor}
                getCategoryLabel={getCategoryLabel}
                onImageClick={(url: string, name: string) => setPreviewImage({ url, name })}
            />
        );
    };

    const renderStaffCard = (group: StaffAssignmentGroup) => {
        const isExpanded = expandedStaffId === group.groupId;
        const grouped = groupItemsByCategory(group.allItems);
        const freqLabel = FREQ_OPTIONS.find(f => f.value === group.checkFrequency)?.label || `每${group.checkFrequency}天`;

        return (
            <div key={group.groupId} className={`bg-white rounded-2xl border shadow-sm mb-3 overflow-hidden ${group.isDueToday && !group.todayCompletion ? 'border-yellow-300' : 'border-gray-200'}`}>
                <div onClick={() => setExpandedStaffId(isExpanded ? null : group.groupId)}
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md">
                                {group.assigneeName.charAt(0)}
                            </div>
                            <div>
                                <div className="font-black text-[#1A1A1A] text-sm flex items-center gap-2 flex-wrap">
                                    {group.assigneeName}
                                    <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{group.allItems.length} items</span>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CalendarClock size={9}/> {freqLabel}</span>
                                    {group.needsMerge && (
                                        <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">{group.tasks.length} 个任务</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {group.todayCompletion ? (
                                        <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-green-50 text-green-600">
                                            <CheckCircle2 size={10}/> 今日 {new Date(group.todayCompletion.completedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                    ) : group.isDueToday ? (
                                        <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-yellow-50 text-yellow-600">
                                            <Clock size={10}/> 今日待完成
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-gray-50 text-gray-400">
                                            <Check size={10}/> 未到期
                                        </div>
                                    )}
                                    {group.lastCompletion && (
                                        <div className="text-[9px] text-gray-400 font-medium">上次: {group.lastCompletion.date}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {group.needsMerge && (
                                <button onClick={(e) => { e.stopPropagation(); mergeStaffTasks(group.assigneeId, group.checkFrequency); }}
                                    className="p-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100" title="合并任务">
                                    <RotateCcw size={14}/>
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); openTaskEditor(group.tasks[0]); }}
                                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="编辑任务">
                                <PenLine size={14}/>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); cancelStaffAssignment(group.assigneeId, group.checkFrequency); }}
                                className="p-1.5 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 hover:text-red-600" title="取消任务">
                                <XCircle size={14}/>
                            </button>
                            {isExpanded ? <ChevronUp size={18} className="text-gray-400 ml-1"/> : <ChevronDown size={18} className="text-gray-400 ml-1"/>}
                        </div>
                    </div>
                </div>

                {isExpanded && (
                    <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3">
                        {Object.entries(grouped).map(([catKey, catItems]) => {
                            let groupLabel = CATEGORY_SECTIONS[catKey] ? catKey : (getCategoryLabel(catKey) || catKey);
                            return (
                                <div key={catKey}>
                                    <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg mb-1.5 inline-block ${getCategoryColor(catKey)}`}>
                                        {groupLabel} ({catItems.length})
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {catItems.map((item, idx) => (
                                            <span key={idx} className="bg-white border border-gray-200 px-2 py-1 rounded-lg text-[11px] font-medium text-gray-700">
                                                {item.stockName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const renderLogCard = (log: InventoryLog) => {
        const isExpanded = expandedLogId === log.id;
        const changeCount = log.items.length;
        const isPositive = log.totalValueChange >= 0;

        return (
            <div key={log.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-3 group">
                <div 
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-4 cursor-pointer flex justify-between items-center hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border-2 ${isPositive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            {isPositive ? '+' : '-'}{Math.abs(log.totalValueChange).toFixed(0)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-[#1A1A1A]">{log.date}</span>
                                <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-bold">{new Date(log.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                            <div className="text-xs text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                                <User size={12}/> {log.staffName} • {changeCount} items changed
                            </div>
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                </div>

                {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-100 p-2">
                        <table className="w-full text-left text-xs">
                            <thead className="text-gray-400 font-bold uppercase border-b border-gray-200">
                                <tr>
                                    <th className="p-2">Item</th>
                                    <th className="p-2 text-center">Old ➔ New</th>
                                    <th className="p-2 text-right">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {log.items.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-100 last:border-0">
                                        <td className="p-2 font-bold text-[#1A1A1A]">{item.stockName}</td>
                                        <td className="p-2 text-center text-gray-600">
                                            {item.oldQty} ➔ <span className="font-black">{item.newQty}</span>
                                        </td>
                                        <td className={`p-2 text-right font-mono font-bold ${item.valueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {item.valueChange > 0 ? '+' : ''}{item.valueChange.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const confirmedTaskCount = myTask
        ? myTask.items.filter(item => checkedItems[item.stockId]).length
        : 0;
    const isCurrentTaskFullyConfirmed = !!myTask &&
        myTask.items.length > 0 &&
        confirmedTaskCount === myTask.items.length;

    return (
        <div className="p-0 md:p-6 pb-32 flex flex-col bg-[#F5F7FA] min-h-screen">
            {/* Styles to hide parent AdminDashboard header on mobile to prevent overlapping / double headers */}
            <style>{`
              @media (max-width: 767px) {
                div.sticky.shadow-lg,
                .h-6.bg-gray-50,
                .admin-dashboard-header,
                .admin-dashboard-spacer {
                  display: none !important;
                }
              }
            `}</style>
            
            {myTask && (
                <div className="fixed inset-0 z-[100] bg-[#F5F7FA] flex flex-col">
                    <div className="bg-[#1A1A1A] text-white px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] shrink-0">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-bold text-[#FFD700] uppercase tracking-wider">盘点任务</p>
                                <p className="font-black text-lg mt-0.5">{myTask.items.length} 个物品</p>
                            </div>
                            <button onClick={() => { setMyTask(null); setMode(employee?.role?.includes('Owner') ? 'MASTER' : 'CHECK'); loadStock(currentStockView); }} className="px-4 py-2 min-h-[44px] rounded-xl bg-white/10 text-sm font-bold active:bg-white/20">取消</button>
                        </div>
                        <div className="mt-3 bg-white/10 rounded-full h-2 overflow-hidden">
                            <div className="bg-[#FFD700] h-full rounded-full transition-all" style={{ width: `${(confirmedTaskCount / myTask.items.length) * 100}%` }}/>
                        </div>
                        <div className="text-[10px] text-white/60 mt-1 text-right">{confirmedTaskCount} / {myTask.items.length} 已确认</div>
                    </div>
                    <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
                        {items.map(item => renderItemCard(item))}
                    </div>
                    <div className="px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-white border-t border-gray-200 shrink-0">
                        <button onClick={() => handleSubmitCheck(myTask)} disabled={isSubmitting || !isCurrentTaskFullyConfirmed} className="w-full min-h-[56px] bg-[#1A1A1A] text-[#FFD200] py-4 rounded-2xl font-black text-base shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none disabled:active:scale-100">
                            {isSubmitting ? <Loader2 size={20} className="animate-spin"/> : <CheckCircle2 size={20}/>} {isSubmitting ? '提交中...' : isCurrentTaskFullyConfirmed ? '提交盘点' : `请先确认全部 (${confirmedTaskCount}/${myTask.items.length})`}
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile StickyTopBar */}
            {!myTask && (
                <div className="sticky top-0 z-50 bg-[#111111] text-[#FFD200] border-b-4 border-[#FFD200] px-4 flex items-center justify-between shadow-md md:hidden pt-[env(safe-area-inset-top,0px)] h-[calc(3.5rem+env(safe-area-inset-top,0px))] select-none">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => {
                                if (onClose) {
                                    onClose();
                                } else {
                                    const parentBack = (document.querySelector('.admin-dashboard-header button') || 
                                                        document.querySelector('div.sticky.shadow-lg button')) as HTMLButtonElement;
                                    if (parentBack) {
                                        parentBack.click();
                                    } else {
                                        window.history.back();
                                    }
                                }
                            }} 
                            className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center bg-white/10 active:bg-white/20 transition-all text-[#FFD200]"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <span className="font-serif font-black text-sm tracking-wide">
                            {mobileRoleTitle}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setIsHelpOpen(true)}
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 active:bg-white/20 text-[#FFD200] transition-all"
                            title="Help Guide"
                        >
                            <HelpCircle size={18} />
                        </button>
                        <div className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[9px] font-mono font-bold text-white/80">ONLINE</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile StickyControlBar */}
            {!myTask && !isRestrictedView && !hasNoInventoryAccess && allowedScopes.length > 0 && (
                <div className="sticky z-40 bg-[#F6F7FB]/95 backdrop-blur border-b border-[#E5E7EB] p-3 shadow-sm md:hidden flex flex-col gap-2.5 top-[calc(3.5rem+env(safe-area-inset-top,0px))]">
                    {/* Row 1: Section Category Tabs - scrollable for thumb swiping */}
                    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
                        {allowedScopes.includes('KITCHEN') && <button
                            onClick={() => handleViewChange('KITCHEN')} 
                            className={`flex-1 min-w-[76px] h-11 rounded-xl text-xs font-black transition-all ${currentStockView === 'KITCHEN' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'bg-white text-gray-500 border border-gray-200'}`}
                        >
                            {t('厨房')}
                        </button>}
                        {allowedScopes.includes('BAR') && <button
                            onClick={() => handleViewChange('BAR')} 
                            className={`flex-1 min-w-[76px] h-11 rounded-xl text-xs font-black transition-all ${currentStockView === 'BAR' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'bg-white text-gray-500 border border-gray-200'}`}
                        >
                            {t('水吧')}
                        </button>}
                        {allowedScopes.includes('GENERAL') && <button
                            onClick={() => handleViewChange('GENERAL')} 
                            className={`flex-1 min-w-[76px] h-11 rounded-xl text-xs font-black transition-all ${currentStockView === 'GENERAL' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'bg-white text-gray-500 border border-gray-200'}`}
                        >
                            {t('后勤')}
                        </button>}
                        {allowedScopes.includes('FUEL') && <button
                            onClick={() => handleViewChange('FUEL')} 
                            className={`flex-1 min-w-[88px] h-11 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${currentStockView === 'FUEL' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200'}`}
                        >
                            <Flame size={12}/> {t('燃料')}
                        </button>}
                    </div>

                    {/* Row 2: Search input + Actions */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-grow">
                            <Search className="absolute left-3 top-3.5 text-gray-400" size={16}/>
                            <input 
                                type="text" 
                                placeholder={t('Search item...')} 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full pl-9 pr-4 h-11 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD700] shadow-sm"
                            />
                        </div>
                        
                        <button 
                            onClick={() => { loadTasks(); loadCompletions(); }} 
                            className="bg-white border border-gray-200 text-gray-500 w-11 h-11 flex items-center justify-center rounded-xl shadow-sm hover:bg-gray-100 active:scale-95 transition-all shrink-0"
                            title="Refresh"
                        >
                            <RefreshCw size={18}/>
                        </button>

                    </div>
                </div>
            )}

            {/* Main Content Area Container: Wraps all components below the headers with padding on mobile */}
            <div className="p-3 md:p-0 flex flex-col flex-grow">
                {/* Mobile role workspace: one calculation core, three task-focused experiences. */}
                {!myTask && !isRestrictedView && !hasNoInventoryAccess && allowedScopes.length > 0 && (
                    <div className="md:hidden mb-3 rounded-3xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3 px-1 pb-3">
                            <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                                    {isBossInventoryView ? '老板视图 · BUSINESS' : isManagementInventoryView ? '管理层视图 · OPERATIONS' : isStaffInventoryView ? '员工视图 · STAFF' : '库存视图'}
                                </div>
                                <div className="mt-1 truncate text-base font-black text-[#111111]">
                                    {isBossInventoryView ? '库存经营与设置' : isManagementInventoryView ? '盘点、任务与库存处理' : '按权限查看库存'}
                                </div>
                            </div>
                            <div className="shrink-0 rounded-full bg-[#111111] px-3 py-1.5 text-[10px] font-black text-[#FFD200]">
                                {currentStockView === 'KITCHEN' ? t('厨房') : currentStockView === 'BAR' ? t('水吧') : currentStockView === 'GENERAL' ? t('后勤') : t('燃料')}
                            </div>
                        </div>

                        {isBossInventoryView ? (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="col-span-2 rounded-2xl bg-[#111111] px-4 py-3 text-white">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[9px] font-black uppercase tracking-widest text-white/50">库存总价值</div>
                                        <div className="text-[9px] font-black text-white/50">{mobileStockSummary.itemCount} ITEMS</div>
                                    </div>
                                    <div className="mt-1 font-mono text-xl font-black text-[#FFD200]">
                                        RM {totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-2.5">
                                    <div className="text-[9px] font-black text-orange-500">低库存</div>
                                    <div className="mt-0.5 text-lg font-black text-orange-700">{mobileStockSummary.lowStockCount}</div>
                                </div>
                                <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5">
                                    <div className="text-[9px] font-black text-red-500">已缺货</div>
                                    <div className="mt-0.5 text-lg font-black text-red-700">{mobileStockSummary.outOfStockCount}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-2 py-2.5 text-center">
                                    <div className="text-[9px] font-black text-yellow-600">待完成</div>
                                    <div className="mt-0.5 text-lg font-black text-yellow-700">{staffGroups.filter(group => group.isDueToday && !group.todayCompletion).length}</div>
                                </div>
                                <div className="rounded-2xl border border-green-100 bg-green-50 px-2 py-2.5 text-center">
                                    <div className="text-[9px] font-black text-green-600">今日完成</div>
                                    <div className="mt-0.5 text-lg font-black text-green-700">{staffGroups.filter(group => group.todayCompletion).length}</div>
                                </div>
                                <div className="rounded-2xl border border-orange-100 bg-orange-50 px-2 py-2.5 text-center">
                                    <div className="text-[9px] font-black text-orange-600">低库存</div>
                                    <div className="mt-0.5 text-lg font-black text-orange-700">{mobileStockSummary.lowStockCount + mobileStockSummary.outOfStockCount}</div>
                                </div>
                            </div>
                        )}

                        <div className="mt-3 flex gap-1 rounded-2xl bg-[#F1F3F6] p-1">
                            {canViewStock && <button
                                onClick={() => openMobileWorkspace('STOCK')}
                                className={`min-h-[48px] min-w-0 flex-1 rounded-xl px-1 text-[10px] font-black transition-all ${mode === 'MASTER' && viewType === 'LIST' ? 'bg-white text-[#111111] shadow-sm' : 'text-gray-500'}`}
                            >
                                <Box size={15} className="mx-auto mb-1"/>库存
                            </button>}
                            {canExecuteStocktake && <button
                                onClick={() => openMobileWorkspace('CHECK')}
                                className={`min-h-[48px] min-w-0 flex-1 rounded-xl px-1 text-[10px] font-black transition-all ${mode === 'CHECK' && viewType === 'LIST' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}
                            >
                                <CheckSquare size={15} className="mx-auto mb-1"/>盘点
                            </button>}
                            {canAssignTasks && <button
                                onClick={() => openMobileWorkspace('TASKS')}
                                className={`min-h-[48px] min-w-0 flex-1 rounded-xl px-1 text-[10px] font-black transition-all ${mode === 'MASTER' && viewType === 'TASKS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                            >
                                <ClipboardList size={15} className="mx-auto mb-1"/>任务
                            </button>}
                            {canViewStock && <button
                                onClick={() => openMobileWorkspace('HISTORY')}
                                className={`min-h-[48px] min-w-0 flex-1 rounded-xl px-1 text-[10px] font-black transition-all ${mode === 'MASTER' && viewType === 'HISTORY' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                            >
                                <History size={15} className="mx-auto mb-1"/>记录
                            </button>}
                        </div>

                        {mode === 'MASTER' && viewType === 'LIST' && (
                            <div className="mt-3 flex gap-2">
                                {canAssignTasks && <button
                                    onClick={() => { setMode('ASSIGN'); setViewType('LIST'); }}
                                    className="flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-xl border border-blue-100 bg-blue-50 px-2 text-[10px] font-black text-blue-700 active:scale-[0.98]"
                                >
                                    <Send size={14}/> 指派盘点
                                </button>}
                                <button
                                    onClick={() => setIsExportModalOpen(true)}
                                    disabled={isGeneratingPdf}
                                    className="flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-2 text-[10px] font-black text-gray-600 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isGeneratingPdf ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} 导出
                                </button>
                                {canAddItem && <button
                                    onClick={() => setEditingItem({ category: CATEGORY_SECTIONS[currentStockView][0].id, unit: 'unit' })}
                                    className="flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-xl bg-[#111111] px-2 text-[10px] font-black text-[#FFD200] active:scale-[0.98]"
                                >
                                    <Plus size={14}/> 新增物品
                                </button>}
                            </div>
                        )}

                        {mode === 'ASSIGN' && (
                            <button
                                onClick={() => { setMode('MASTER'); setSelectedForAssign(new Set()); }}
                                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-600 active:scale-[0.98]"
                            >
                                <X size={15}/> 退出指派模式
                            </button>
                        )}
                    </div>
                )}

                {/* Desktop-Only Header/Control Bar */}
                {!myTask && !isRestrictedView && !hasNoInventoryAccess && allowedScopes.length > 0 && (
                    <div className="hidden md:flex flex-col md:flex-row justify-between items-center mb-4 gap-4 shrink-0">
                        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-gray-200 w-full md:w-auto overflow-x-auto">
                            {allowedScopes.includes('KITCHEN') && <button onClick={() => handleViewChange('KITCHEN')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${currentStockView === 'KITCHEN' ? 'bg-[#1A1A1A] text-[#FFD700]' : 'text-gray-500 hover:bg-gray-50'}`}>{t('厨房')}</button>}
                            {allowedScopes.includes('BAR') && <button onClick={() => handleViewChange('BAR')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${currentStockView === 'BAR' ? 'bg-[#1A1A1A] text-[#FFD700]' : 'text-gray-500 hover:bg-gray-50'}`}>{t('水吧')}</button>}
                            {allowedScopes.includes('GENERAL') && <button onClick={() => handleViewChange('GENERAL')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${currentStockView === 'GENERAL' ? 'bg-[#1A1A1A] text-[#FFD700]' : 'text-gray-500 hover:bg-gray-50'}`}>{t('后勤')}</button>}
                            {allowedScopes.includes('FUEL') && <button onClick={() => handleViewChange('FUEL')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${currentStockView === 'FUEL' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><Flame size={12}/> {t('燃料')}</button>}
                        </div>
                        
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="relative flex-grow md:flex-grow-0 md:w-64">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Search item..." 
                                    value={searchTerm} 
                                    onChange={(e) => setSearchTerm(e.target.value)} 
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD700]"
                                />
                            </div>
                            
                            <button 
                                onClick={() => { loadTasks(); loadCompletions(); }} 
                                className="bg-gray-100 text-gray-500 p-2 rounded-xl shadow-sm hover:bg-gray-200 hover:text-black transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw size={18}/>
                            </button>

                            {mode === 'MASTER' && (
                                <>
                                    <button 
                                        onClick={() => setIsExportModalOpen(true)} 
                                        disabled={isGeneratingPdf}
                                        className="bg-white border border-gray-200 text-gray-600 p-2 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-50"
                                        title="Export PDF"
                                    >
                                        {isGeneratingPdf ? <Loader2 size={18} className="animate-spin"/> : <FileDown size={18}/>}
                                    </button>
                                    {canAddItem && <button onClick={() => setEditingItem({ category: CATEGORY_SECTIONS[currentStockView][0].id, unit: 'unit' })} className="bg-[#1A1A1A] text-[#FFD700] p-2 rounded-xl shadow-sm hover:bg-black"><Plus size={18}/></button>}
                                </>
                            )}
                            <button 
                                onClick={() => setIsHelpOpen(true)}
                                className="bg-white border border-gray-200 text-gray-500 p-2 rounded-xl shadow-sm hover:bg-gray-100 active:scale-95 transition-all shrink-0"
                                title="Help Guide"
                            >
                                <HelpCircle size={18} />
                            </button>
                        </div>
                    </div>
                )}

            {!myTask && !isRestrictedView && !hasNoInventoryAccess && allowedScopes.length > 0 && (
                <div className="hidden md:flex flex-col md:flex-row justify-between items-end md:items-center mb-4 px-1 gap-4">
                    <div className="flex gap-3 items-center flex-wrap">
                        
                        {(canExecuteStocktake || canViewStock) && <div className="flex bg-gray-200 p-1 rounded-lg border border-gray-300">
                            {canExecuteStocktake && <button onClick={() => {setMode('CHECK'); setViewType('LIST');}} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'CHECK' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>✅ 盘点模式</button>}
                            {canViewStock && <button onClick={() => {setMode('MASTER'); setViewType('LIST');}} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'MASTER' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>⚙️ 管理模式</button>}
                        </div>}

                        {mode === 'MASTER' && (
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button onClick={() => setViewType('LIST')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewType === 'LIST' ? 'bg-white text-black shadow-sm' : 'text-gray-500'}`}><Box size={12}/> 列表 (List)</button>
                                <button onClick={() => setViewType('HISTORY')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewType === 'HISTORY' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}><History size={12}/> 记录 (History)</button>
                                {canAssignTasks && <button onClick={() => setViewType('TASKS')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewType === 'TASKS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}><ClipboardList size={12}/> 任务 (Tasks)</button>}
                            </div>
                        )}

                        {canAssignTasks && (mode === 'MASTER' || mode === 'ASSIGN') && viewType === 'LIST' && (
                            <button 
                                onClick={() => setMode(prev => prev === 'ASSIGN' ? 'MASTER' : 'ASSIGN')} 
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${mode === 'ASSIGN' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
                            >
                                <Send size={12}/> {mode === 'ASSIGN' ? '退出指派 (Exit)' : '指派任务 (Assign)'}
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {mode === 'MASTER' && viewType === 'LIST' && (
                            <div className="text-right bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 flex items-center gap-3">
                                <div className="text-emerald-500 bg-white p-1 rounded-full"><DollarSign size={14}/></div>
                                <div className="text-right">
                                    <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">总价值 (Total Value)</div>
                                    <div className="text-sm md:text-base font-black text-emerald-700 font-mono">RM {totalInventoryValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                </div>
                            </div>
                        )}
                        {viewType === 'LIST' && (
                            <div className="text-right px-2">
                                <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">物品数 (Items)</div>
                                <div className="text-sm md:text-base font-black text-[#1A1A1A]">{filteredItems.length}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!myTask && isRestrictedView && (
                <div className="mb-3 bg-gradient-to-r from-blue-600 to-indigo-700 p-4 rounded-2xl flex justify-between items-center shadow-lg">
                    <div className="flex items-center gap-2 text-white">
                        <ClipboardList size={20}/>
                        <span className="font-black text-base">我的盘点任务</span>
                    </div>
                    <button onClick={() => { loadTasks(); loadCompletions(); }} className="p-2.5 bg-white/20 rounded-xl text-white active:bg-white/30"><RefreshCw size={16}/></button>
                </div>
            )}

            {!myTask && (hasNoInventoryAccess || allowedScopes.length === 0) && (
                <div className="mx-auto mt-8 w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                        <Lock size={26}/>
                    </div>
                    <h3 className="text-base font-black text-[#1A1A1A]">没有可用的库存权限</h3>
                    <p className="mt-2 text-xs font-medium leading-5 text-gray-400">
                        {allowedScopes.length === 0 ? '尚未分配厨房、水吧、后勤或燃料的管理范围。' : '请联系老板开启查看库存或执行盘点权限。'}
                    </p>
                </div>
            )}

            {!myTask && !hasNoInventoryAccess && allowedScopes.length > 0 && (
            <div className="space-y-4">
                
                {mode === 'CHECK' && (
                    <div className="mb-4">
                        {myDueTasks.length > 0 && (
                            <div className="space-y-2 mb-3">
                                <h4 className="font-black text-sm text-[#1A1A1A] flex items-center gap-2 px-1"><Clock size={14} className="text-yellow-600"/> 待完成盘点</h4>
                                {myDueTasks.map(task => {
                                    const freq = (task as any).checkFrequency || 1;
                                    const freqLabel = FREQ_OPTIONS.find(f => f.value === freq)?.label || `每${freq}天`;
                                    return (
                                        <div key={task.id} className="bg-white p-4 rounded-2xl border-2 border-yellow-200 shadow-sm">
                                            <div className="flex justify-between items-center mb-3">
                                                <div>
                                                    <div className="text-[10px] text-gray-400 font-bold">指派人: {task.creatorName}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                                        <span className="font-bold">{task.items.length} 个物品</span>
                                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1"><CalendarClock size={9}/> {freqLabel}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={() => startTaskExecution(task)}
                                                className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-base flex items-center justify-center gap-2 active:scale-[0.98] shadow-md">
                                                <PlayCircle size={20}/> 开始盘点
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {myDoneToday.length > 0 && (
                            <div className="bg-green-50 border border-green-200 p-3 rounded-xl mb-3">
                                <h4 className="font-bold text-green-700 text-xs flex items-center gap-2 mb-2"><CheckCircle2 size={14}/> 今日已完成</h4>
                                {myDoneToday.map(task => {
                                    const c = todayCompletions[task.id];
                                    return (
                                        <div key={task.id} className="text-xs text-green-600 flex items-center gap-2 py-1">
                                            <Check size={12}/>
                                            <span className="font-bold">{task.items.length} items</span>
                                            {c && <span className="text-green-400">✓ {new Date(c.completedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {isRestrictedView && myDueTasks.length === 0 && myDoneToday.length === 0 && (
                            <div className="text-center py-16 text-gray-400 flex flex-col items-center">
                                <CheckSquare size={48} className="mb-3 opacity-20"/>
                                <p className="font-bold text-base">暂无待办任务</p>
                                <p className="text-xs text-gray-300 mt-1">所有盘点任务已完成或未到期</p>
                            </div>
                        )}
                    </div>
                )}

                {viewType === 'TASKS' && mode === 'MASTER' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button onClick={() => setTaskSubView('ASSIGNMENTS')}
                                    className={`flex items-center gap-1 px-4 py-2 rounded-md text-xs font-bold transition-all ${taskSubView === 'ASSIGNMENTS' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-gray-500'}`}>
                                    <Users size={14}/> 常驻指派
                                </button>
                                <button onClick={() => setTaskSubView('LOG')}
                                    className={`flex items-center gap-1 px-4 py-2 rounded-md text-xs font-bold transition-all ${taskSubView === 'LOG' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}>
                                    <History size={14}/> 完成记录
                                </button>
                            </div>
                            <button onClick={() => { loadTasks(); loadCompletions(); loadCompletionLog(); }} className="text-xs bg-gray-100 p-2 rounded-lg hover:bg-gray-200"><RefreshCw size={14}/></button>
                        </div>

                        {taskSubView === 'ASSIGNMENTS' && (
                            <>
                                <div className="flex gap-2 mb-4 flex-wrap">
                                    <div className="bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl flex items-center gap-2">
                                        <Users size={14} className="text-indigo-600"/>
                                        <span className="text-xs font-black text-indigo-700">{staffGroups.length} 人</span>
                                    </div>
                                    <div className="bg-green-50 border border-green-200 px-3 py-2 rounded-xl flex items-center gap-2">
                                        <CheckCircle2 size={14} className="text-green-600"/>
                                        <span className="text-xs font-black text-green-700">{staffGroups.filter(g => g.todayCompletion).length} 今日完成</span>
                                    </div>
                                    <div className="bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-xl flex items-center gap-2">
                                        <Clock size={14} className="text-yellow-600"/>
                                        <span className="text-xs font-black text-yellow-700">{staffGroups.filter(g => g.isDueToday && !g.todayCompletion).length} 待完成</span>
                                    </div>
                                </div>
                                {staffGroups.length === 0 ? (
                                    <div className="text-center py-20 text-gray-400 font-bold">
                                        <Users size={48} className="mx-auto mb-2 opacity-20"/>
                                        <p>暂无常驻指派</p>
                                        <p className="text-xs text-gray-300 mt-1">在 列表 (List) 页面使用 指派任务 (Assign) 开始指派</p>
                                    </div>
                                ) : (
                                    staffGroups.map(group => renderStaffCard(group))
                                )}
                            </>
                        )}

                        {taskSubView === 'LOG' && (
                            <>
                                <div className="flex bg-gray-200 p-0.5 rounded-lg mb-4 w-fit">
                                    {(['TODAY', 'YESTERDAY', 'WEEK', 'ALL'] as const).map(f => (
                                        <button key={f} onClick={() => setTaskDateFilter(f)}
                                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${taskDateFilter === f ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                            {f === 'TODAY' ? '今日' : f === 'YESTERDAY' ? '昨日' : f === 'WEEK' ? '本周' : '全部'}
                                        </button>
                                    ))}
                                </div>
                                {completionLog.length === 0 ? (
                                    <div className="text-center py-20 text-gray-400 font-bold">
                                        <History size={48} className="mx-auto mb-2 opacity-20"/>
                                        <p>暂无完成记录</p>
                                    </div>
                                ) : (
                                    completionLog.map(c => (
                                        <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-green-100 text-green-700 rounded-xl"><CheckCircle2 size={16}/></div>
                                                <div>
                                                    <div className="font-bold text-sm text-[#1A1A1A]">{c.assigneeName}</div>
                                                    <div className="text-[10px] text-gray-400">
                                                        {c.date} · {new Date(c.completedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · {c.items.length} items
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {c.items.map((item, idx) => (
                                                    <span key={idx} className="bg-gray-50 border px-1.5 py-0.5 rounded text-[10px] font-medium">
                                                        {item.stockName} {item.countedQty !== undefined && <span className="font-black text-green-600">({item.countedQty})</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </>
                        )}
                    </div>
                )}

                {viewType === 'HISTORY' && mode === 'MASTER' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                        
                        {/* 🛡️ 致命漏洞护栏 UI：防止全表扫描带来的并发熔断与计费爆炸 */}
                        <div className="bg-red-50 border-l-4 border-[#1A1A1A] p-4 my-4 shadow-sm rounded-r-xl">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <AlertOctagon className="h-5 w-5 text-red-600" />
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-bold text-red-800 tracking-wide">高危计费防护 (BILLING PROTECTION)</h3>
                                    <div className="mt-1 text-xs text-red-700 font-medium">
                                        <p>为防止全表扫描导致账单爆炸和系统熔断，流水日志已强制开启 <code className="font-mono text-[#1A1A1A] font-bold bg-[#FFD700] px-1.5 py-0.5 rounded ml-1">limit(50)</code> 限制。</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {logs.length === 0 ? <div className="text-center py-20 text-gray-400 font-bold">暂无盘点记录 (No History)</div> : logs.map(log => renderLogCard(log))}
                    </div>
                )}

                {viewType === 'LIST' && (!isRestrictedView) && (
                    <div className="space-y-4 pb-6">
                        {CATEGORY_SECTIONS[currentStockView]?.map(section => {
                            const sectionItems = filteredItems.filter(i => i.category === section.id);
                            if (sectionItems.length === 0) return null;
                            
                            const isSearching = searchTerm.length > 0;
                            const isExpanded = expandedSections[section.id] || isSearching || mode === 'ASSIGN';
                            const outOfStockCount = sectionItems.filter(i => getStockStatus(i) === 'OUT_OF_STOCK').length;
                            const lowStockCount = sectionItems.filter(i => getStockStatus(i) === 'LOW_STOCK').length;

                            return (
                                <div key={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 bg-white/50 rounded-2xl p-1 md:p-2 border border-transparent">
                                    <div onClick={() => toggleSection(section.id)} className={`px-3 md:px-4 py-3 md:py-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-between cursor-pointer transition-all shadow-sm ${section.color} hover:brightness-95 select-none active:scale-[0.98]`}>
                                        <div className="flex items-center gap-2">
                                            <Layers size={16}/> 
                                            <span className="truncate max-w-[150px] md:max-w-[200px]">{tCat(section.id)}</span>
                                            <span className="bg-white/30 px-2 py-0.5 rounded-full text-[9px] text-current">{sectionItems.length}</span>
                                            {outOfStockCount > 0 && <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded-full shadow-sm ml-1 animate-pulse border border-red-400"><AlertTriangle size={10} fill="currentColor" /><span className="text-[10px] font-black">{outOfStockCount}</span></div>}
                                            {lowStockCount > 0 && <div className="flex items-center gap-1 bg-yellow-400 text-black px-2 py-0.5 rounded-full shadow-sm ml-1 border border-yellow-500"><AlertTriangle size={10} fill="currentColor" /><span className="text-[10px] font-black">{lowStockCount}</span></div>}
                                        </div>
                                        {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                    </div>
                                    {isExpanded && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 mt-2 md:mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {sectionItems.map(item => renderItemCard(item))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* 🌟 捕获未分类 / 遗失分类的物品 (把不见的每周物品找出来) 🌟 */}
                        {(() => {
                            const validCategoryIds = new Set(CATEGORY_SECTIONS[currentStockView]?.map(s => s.id) || []);
                            const orphanedItems = filteredItems.filter(i => !validCategoryIds.has(i.category));
                            if (orphanedItems.length === 0) return null;
                            
                            const isSearching = searchTerm.length > 0;
                            const isExpanded = expandedSections['UNCATEGORIZED'] || isSearching || mode === 'ASSIGN';
                            const outOfStockCount = orphanedItems.filter(i => getStockStatus(i) === 'OUT_OF_STOCK').length;
                            const lowStockCount = orphanedItems.filter(i => getStockStatus(i) === 'LOW_STOCK').length;

                            return (
                                <div key="UNCATEGORIZED" className="animate-in fade-in slide-in-from-bottom-2 duration-500 bg-gray-100 rounded-2xl p-1 md:p-2 border border-dashed border-gray-300 mt-6 shadow-inner">
                                    <div onClick={() => toggleSection('UNCATEGORIZED')} className="px-3 md:px-4 py-3 md:py-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-between cursor-pointer transition-all shadow-sm bg-gray-200 text-gray-600 hover:brightness-95 select-none active:scale-[0.98]">
                                        <div className="flex items-center gap-2">
                                            <AlertOctagon size={16} className="text-red-500 animate-pulse"/> 
                                            <span className="truncate max-w-[150px] md:max-w-[200px] text-gray-700">未分类 / 遗失区</span>
                                            <span className="bg-gray-300 px-2 py-0.5 rounded-full text-[9px] text-gray-700">{orphanedItems.length}</span>
                                            {outOfStockCount > 0 && <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded-full shadow-sm ml-1"><AlertTriangle size={10} fill="currentColor" /></div>}
                                            {lowStockCount > 0 && <div className="flex items-center gap-1 bg-yellow-400 text-black px-2 py-0.5 rounded-full shadow-sm ml-1"><AlertTriangle size={10} fill="currentColor" /></div>}
                                        </div>
                                        {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                    </div>
                                    <div className="px-3 pt-2 text-[10px] font-bold text-gray-400">💡 提示：请点击这些物品编辑，赋予它们正确的分类，它们就会回到正常的列表里。</div>
                                    {isExpanded && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 mt-2 md:mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {orphanedItems.map(item => renderItemCard(item))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
            )}

            {!myTask && mode === 'CHECK' && !isRestrictedView && canExecuteStocktake && (
                <div className="fixed bottom-0 left-0 w-full bg-white p-4 border-t border-gray-200 md:static md:bg-transparent md:border-0 md:p-0 mt-4">
                    <button onClick={() => handleSubmitCheck()} disabled={isSubmitting} className="w-full bg-[#1A1A1A] text-[#FFD700] py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2">
                        <CheckCircle2 size={20}/> {isSubmitting ? 'Saving...' : '提交盘点'}
                    </button>
                </div>
            )}
            
            {!myTask && mode === 'ASSIGN' && canAssignTasks && (
                <div className="fixed bottom-0 left-0 w-full bg-indigo-50 p-4 border-t border-indigo-100 md:static md:bg-transparent md:border-0 md:p-0 mt-4">
                    <button onClick={initiateAssignment} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                        <Send size={20}/> 指派 {selectedForAssign.size} 个物品 (Assign)
                    </button>
                </div>
            )}
            
            </div> {/* Closing custom p-3 md:p-0 wrapper */}

            {editingItem && (canAddItem || canOpenItemDetails) && (
                <StockEditModal
                    editingItem={editingItem}
                    currentStockView={currentStockView}
                    linkedSuppliers={linkedSuppliers}
                    isSubmitting={isSubmitting}
                    onSave={handleSaveMaster}
                    onDelete={handleDeleteClick}
                    onClose={() => setEditingItem(null)}
                    onChange={setEditingItem}
                    canDelete={canDeactivateItem}
                    canSave={!editingItem.id ? canAddItem : canEditExistingItem}
                />
            )}

            {showDeleteConfirm && canDeactivateItem && (
                <DeleteConfirmModal
                    itemName={editingItem?.name}
                    onConfirm={executeDelete}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}

            {isAssignModalOpen && canAssignTasks && (
                <AssignModal
                    selectedCount={selectedForAssign.size}
                    staffList={staffList}
                    selectedAssignee={selectedAssignee}
                    onAssigneeChange={setSelectedAssignee}
                    assignFrequency={assignFrequency}
                    onFrequencyChange={setAssignFrequency}
                    activeTasks={activeTasks}
                    onConfirm={confirmAssignment}
                    onClose={() => setIsAssignModalOpen(false)}
                />
            )}

            {editingTask && canAssignTasks && (
                <TaskEditorModal
                    editingTask={editingTask}
                    editTaskItems={editTaskItems}
                    editTaskStockData={editTaskStockData}
                    editTaskSearchTerm={editTaskSearchTerm}
                    editTaskFrequency={editTaskFrequency}
                    onSearchChange={setEditTaskSearchTerm}
                    onFrequencyChange={setEditTaskFrequency}
                    onToggleItem={toggleEditTaskItem}
                    onSave={saveTaskEdits}
                    onClose={() => setEditingTask(null)}
                />
            )}

            {/* 🔍 全局高清图片大图预览弹窗 (Lightbox Zoom Modal) */}
            {previewImage && (
                <div 
                    onClick={() => setPreviewImage(null)}
                    className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in cursor-zoom-out select-none"
                >
                    <div className="absolute top-4 right-4 z-10">
                        <button 
                            onClick={() => setPreviewImage(null)}
                            style={{ minWidth: '48px', minHeight: '48px' }}
                            className="bg-white/10 hover:bg-white/25 active:scale-95 text-white rounded-full flex items-center justify-center transition-all shadow-lg border border-white/10"
                        >
                            <span className="text-xl font-bold">✕</span>
                        </button>
                    </div>
                    
                    <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="flex flex-col items-center max-w-full md:max-w-3xl bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-xs shadow-2xl select-text"
                    >
                        <img 
                            src={previewImage.url} 
                            alt={previewImage.name}
                            referrerPolicy="no-referrer"
                            className="max-w-[90vw] max-h-[65vh] md:max-h-[75vh] object-contain rounded-2xl shadow-xl border border-white/5"
                        />
                        <div className="mt-4 text-center">
                            <h3 className="text-base md:text-lg font-black text-white tracking-wide">{previewImage.name}</h3>
                            <p className="text-xs text-gray-450 mt-1 font-mono font-semibold">点击空白处或右上角关闭 (Tap anywhere to close)</p>
                        </div>
                    </div>
                </div>
            )}

            {isExportModalOpen && canViewStock && (
                <ExportModal
                    exportConfig={exportConfig}
                    isGeneratingPdf={isGeneratingPdf}
                    isGeneratingExcel={isGeneratingExcel}  // 新增
                    onCategoryToggle={handleCategoryToggle}
                    onConfigChange={setExportConfig}
                    onExport={executeExport}
                    onExportExcel={executeExcelExport}     // 新增
                    onClose={() => setIsExportModalOpen(false)}
                />
            )}

            {isHelpOpen && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm md:flex md:items-center md:justify-center p-0 md:p-4 animate-in fade-in duration-200"
                    onClick={() => setIsHelpOpen(false)}
                >
                    <div 
                        className="fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-[28px] bg-white shadow-2xl overflow-hidden flex flex-col md:relative md:bottom-auto md:left-auto md:right-auto md:max-w-lg md:w-full md:rounded-3xl animate-in slide-in-from-bottom duration-300 md:animate-in md:zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-[#111111] p-5 flex justify-between items-center text-white border-b-4 border-[#FFD200] shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#FFD200] rounded-lg text-black">
                                    <ClipboardList size={18} />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="font-serif font-black text-sm tracking-wide text-[#FFD200]">库存总览使用说明</h3>
                                    <span className="text-[10px] text-gray-400 font-sans tracking-wider font-semibold uppercase">Inventory Master Guide</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsHelpOpen(false)} 
                                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                            >
                                <X size={16} className="text-[#FFD200]"/>
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="overflow-y-auto max-h-[65vh] px-5 py-4 space-y-4 bg-[#F6F7FB] custom-scrollbar">
                            
                            {/* Card 1: Check Mode */}
                            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-base">📋</span>
                                    <h4 className="font-bold text-xs text-[#111111] uppercase tracking-wider">盘点模式 (Check Mode)</h4>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                                    员工可输入当前库存，系统会记录库存变化。
                                </p>
                            </div>

                            {/* Card 2: Master Mode */}
                            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-base">⚙️</span>
                                    <h4 className="font-bold text-xs text-[#111111] uppercase tracking-wider">管理模式 (Master Mode)</h4>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                                    老板可新增物品、设置安全库存、成本、图片和单位换算。
                                </p>
                            </div>

                            {/* Card 3: 3-Layer Units */}
                            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">📦</span>
                                    <h4 className="font-bold text-xs text-[#111111] uppercase tracking-wider">三层单位系统 (3-Layer Unit System)</h4>
                                </div>
                                
                                <div className="space-y-2.5 pt-1">
                                    <div className="p-2.5 bg-[#F6F7FB] rounded-xl border border-gray-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-indigo-600 font-mono tracking-wider">1. BASE UNIT</span>
                                            <span className="text-[9px] bg-indigo-50 px-1.5 py-0.5 rounded font-bold text-indigo-600">系统 & 成本</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
                                            系统 / Recipe 成本单位，例如 pcs、g、ml。
                                        </p>
                                    </div>

                                    <div className="p-2.5 bg-[#F6F7FB] rounded-xl border border-gray-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-amber-600 font-mono tracking-wider">2. DISPLAY UNIT</span>
                                            <span className="text-[9px] bg-amber-50 px-1.5 py-0.5 rounded font-bold text-amber-600">员工 & 订购</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
                                            员工和订购员看到的单位，例如 Tray、Tin、Box。
                                        </p>
                                    </div>

                                    <div className="p-2.5 bg-[#F6F7FB] rounded-xl border border-gray-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-emerald-600 font-mono tracking-wider">3. PURCHASE UNIT</span>
                                            <span className="text-[9px] bg-emerald-50 px-1.5 py-0.5 rounded font-bold text-emerald-600">采购单位</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
                                            供应商采购单位，例如 CTN、Carton、Pack。
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4: Examples */}
                            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">💡</span>
                                    <h4 className="font-bold text-xs text-[#111111] uppercase tracking-wider">换算实例 (Practical Examples)</h4>
                                </div>

                                <div className="space-y-3 pt-1">
                                    <div className="border-l-4 border-indigo-500 pl-3 py-0.5">
                                        <p className="text-xs font-black text-[#111111]">例一：鸡蛋 (Egg)</p>
                                        <div className="text-[11px] text-gray-600 space-y-1 font-medium mt-1">
                                            <p><span className="font-mono text-gray-400">Base Unit</span> = pcs</p>
                                            <p><span className="font-mono text-gray-400">Display Unit</span> = Tray</p>
                                            <p><span className="font-mono text-gray-400">Purchase Unit</span> = Tray</p>
                                            <p className="font-semibold bg-[#F6F7FB] p-1.5 rounded-lg mt-1 text-stone-700">
                                                换算关系：<span className="text-indigo-600 font-bold">1 Tray = 30 pcs</span>
                                            </p>
                                            <p className="text-stone-500 text-[10px] mt-0.5">
                                                库存卡显示 <span className="font-black text-[#111111]">17 Tray</span>，同时小字自动计算并显示 <span className="font-bold text-[#111111]">= 510 pcs</span>。
                                            </p>
                                        </div>
                                    </div>

                                    <div className="border-l-4 border-amber-500 pl-3 py-0.5">
                                        <p className="text-xs font-black text-[#111111]">例二：扣肉罐头 (Stewed Pork Tin)</p>
                                        <div className="text-[11px] text-gray-600 space-y-1 font-medium mt-1">
                                            <p><span className="font-mono text-gray-400">Purchase Unit</span> = CTN</p>
                                            <p className="font-semibold bg-[#F6F7FB] p-1.5 rounded-lg mt-1 text-stone-700 leading-relaxed">
                                                换算关系：<br />
                                                <span className="text-amber-600 font-bold">1 CTN = 24 TIN</span><br />
                                                <span className="text-amber-600 font-bold">1 TIN = 360g</span>
                                            </p>
                                            <p className="text-stone-500 text-[10px] mt-0.5">
                                                Recipe 可以用 <span className="font-black text-[#111111]">120g</span> 或 <span className="font-black text-[#111111]">0.333 TIN</span> 精确计算菜品成本。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 5: Best Practice Tip */}
                            <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-base">🚀</span>
                                    <h4 className="font-bold text-xs text-amber-800 uppercase tracking-wider">最佳实践建议 (Best Practice)</h4>
                                </div>
                                <p className="text-xs text-amber-900 leading-relaxed font-semibold">
                                    采购入库请优先使用 <span className="font-black">Procurement / Purchase Order</span>，收货入库时系统会自动更新库存数量和移动平均成本。
                                </p>
                            </div>

                        </div>

                        {/* Footer - sticky bottom */}
                        <div className="sticky bottom-0 bg-white p-4 border-t border-[#E5E7EB] shrink-0">
                            <button 
                                onClick={() => setIsHelpOpen(false)} 
                                className="w-full bg-[#111111] hover:bg-black text-[#FFD200] rounded-2xl h-14 font-black transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Check size={18} strokeWidth={3} />
                                <span>明白了 (Got it)</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ position: 'fixed', top: '0px', left: '0px', zIndex: -9999, pointerEvents: 'none' }}>
                <div ref={printRef}>
                    {printChunks.map((chunk, pageIndex) => (
                        <div key={pageIndex} id={`print-page-${pageIndex}`} className="w-[210mm] min-h-[297mm] bg-white p-10 font-sans text-black relative flex flex-col">
                            <div className="border-b-4 border-black pb-4 mb-6 flex justify-between items-end">
                                <div>
                                    <h1 className="text-3xl font-black uppercase tracking-widest mb-1">INVENTORY REPORT</h1>
                                    <p className="text-sm font-bold text-gray-500">KIM LIAN KEE (KEPONG)</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Generated On</p>
                                    <p className="text-lg font-mono font-black">{new Date().toLocaleDateString()}</p>
                                </div>
                            </div>

                            <table className="w-full text-left border-collapse mb-8">
                                <thead>
                                    <tr className="bg-black text-white text-[10px] uppercase tracking-wider">
                                        <th className="p-2 w-16 text-center border-r border-gray-600">ID</th>
                                        <th className="p-2 w-24 border-r border-gray-600">Category</th>
                                        <th className="p-2 border-r border-gray-600">Item Name</th>
                                        <th className="p-2 w-16 text-center border-r border-gray-600">Unit</th>
                                        <th className="p-2 w-16 text-center border-r border-gray-600">Min</th>
                                        <th className="p-2 w-20 text-center border-r border-gray-600">Current</th>
                                        <th className="p-2 w-20 border-r border-gray-600">Check</th>
                                        {exportConfig.showCost && (
                                            <>
                                                <th className="p-2 w-20 text-right border-r border-gray-600">Cost</th>
                                                <th className="p-2 w-24 text-right">Value</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="text-xs">
                                    {chunk.map((item) => (
                                        <tr key={item.id} className="border-b border-gray-200 break-inside-avoid">
                                            <td className="p-2 text-center font-mono text-gray-500 bg-gray-50 border-r border-gray-200">{item.id}</td>
                                            <td className="p-2 font-bold text-gray-700 uppercase border-r border-gray-200">{getCategoryLabel(item.category)}</td>
                                            <td className="p-2 font-bold border-r border-gray-200">{item.name}</td>
                                            <td className="p-2 text-center uppercase font-mono text-gray-500 border-r border-gray-200">{getBaseUnit(item)}</td>
                                            <td className="p-2 text-center font-bold text-gray-400 border-r border-gray-200">{getMinLevelBase(item)}</td>
                                            <td className="p-2 text-center font-black border-r border-gray-200 text-lg">{getCurrentQtyBase(item)}</td>
                                            <td className="p-2 border-r border-gray-200">
                                                <div className="w-full h-6 border-b border-gray-300"></div>
                                            </td>
                                            {exportConfig.showCost && (
                                                <>
                                                    <td className="p-2 text-right font-mono border-r border-gray-200">{getCostPerBaseUnit(item).toFixed(2)}</td>
                                                    <td className="p-2 text-right font-mono font-black">{getStockValue(item).toFixed(2)}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-auto pt-4 border-t border-black flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <span>{exportConfig.lowStockOnly ? 'FILTER: LOW STOCK ONLY' : 'FULL REPORT'}</span>
                                <span>Page {pageIndex + 1} of {printChunks.length}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
