import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Utensils, Plus, Search, Edit3, Trash2, X, Save, Box,
    Truck, RefreshCw, Loader2, Copy, Layers, AlertTriangle,
    ArrowLeft, ArrowRight, Move, ChevronLeft, ChevronDown, ChevronUp,
    BookOpen, Clock, Youtube, Hash, Film,
    StickyNote, ListOrdered, Sparkles, Info, Check, ExternalLink, Scale, Upload
} from 'lucide-react';
import { MenuItem, MenuCategory, MenuVariant, StockItem, MenuIngredient } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { resolveStockArea } from '../../utils/inventory/stockArea';
import { matchesStockSearch } from '../../utils/inventory/stockCode';
import { useIsMobile } from '../../utils/useIsMobile';
import {
    getBaseUnit,
    getCostPerBaseUnit
} from '../../utils/unitConversion';
import { MENU_CATEGORIES, INITIAL_MENU_ITEMS } from '../../constants/menu';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { db } from '../../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface MenuManagementProps {
    onClose?: () => void;
    isModal?: boolean;
    /** 打开后直接编辑这道菜（数据审查中心「去处理」用） */
    initialMenuItemId?: string;
}

const MENU_CATEGORY_STORAGE_KEY = 'menu_categories_v1';
const MENU_CATEGORY_CONFIG_DOC = 'menu_categories';

const normalizeMenuCategories = (value: unknown): MenuCategory[] => {
    const source = Array.isArray(value) ? value : [];
    const normalized = source.reduce<MenuCategory[]>((result, rawCategory) => {
        if (!rawCategory || typeof rawCategory !== 'object') return result;

        const raw = rawCategory as Partial<MenuCategory>;
        const id = String(raw.id || '').trim().toUpperCase();
        const label = String(raw.label || '').trim();

        if (!id || !label || result.some(category => category.id === id)) return result;
        result.push({ ...raw, id, label } as MenuCategory);
        return result;
    }, []);

    const fallbackCategories = normalized.length > 0
        ? normalized
        : MENU_CATEGORIES.map(category => ({ ...category }));

    const allCategory = fallbackCategories.find(category => category.id === 'ALL');
    const businessCategories = fallbackCategories.filter(category => category.id !== 'ALL');

    return [
        { ...(allCategory || {}), id: 'ALL', label: allCategory?.label || '全部 (All)' } as MenuCategory,
        ...businessCategories
    ];
};

const STOCK_CATEGORIES: Record<string, string> = {
    'FRESH': '生鲜 (Fresh)', 'MEAT': '肉类 (Meat)', 'SEAFOOD': '海鲜 (Seafood)',
    'VEG': '蔬果 (Veg)', 'NOODLE': '面类 (Noodles)', 'DRY': '干货 (Dry)',
    'SAUCE': '酱料 (Sauce)', 'HQ': '总店 (HQ)', 'TEA': '茶叶 (Tea)',
    'FRUIT': '水果 (Fruit)', 'RTD': '罐装 (Drinks)', 'OTHER': '其他 (Other)'
};

// 👑 提取 YouTube ID，用于缩略图预览 (兼容 youtu.be / youtube.com/watch / shorts / embed 等格式)
const extractYouTubeId = (url?: string): string | null => {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
};

// 👑 重新编号食材，保持 order 字段与数组顺序一致 (双轨制核心)
const renumberRecipe = (recipe?: MenuIngredient[]): MenuIngredient[] => {
    if (!recipe || recipe.length === 0) return [];
    return recipe.map((r, i) => ({ ...r, order: i + 1 }));
};

// 👑 按 order 字段排序食材 (向后兼容: order 缺失时按数组下标 fallback)
const sortRecipeByOrder = (recipe?: MenuIngredient[]): MenuIngredient[] => {
    if (!recipe || recipe.length === 0) return [];
    return [...recipe]
        .map((r, idx) => ({ ...r, order: r.order ?? idx + 1 }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
};

// 👑 重新计算规格成本 (recipe 任何变更后必须调用)
// 👑 公制单位换算表 (factor = 折成该族最小单位的倍数)
const METRIC_UNITS: Record<string, { family: 'mass' | 'vol'; factor: number }> = {
    'g': { family: 'mass', factor: 1 },
    'gram': { family: 'mass', factor: 1 },
    'grams': { family: 'mass', factor: 1 },
    '克': { family: 'mass', factor: 1 },
    'kg': { family: 'mass', factor: 1000 },
    'kgs': { family: 'mass', factor: 1000 },
    '公斤': { family: 'mass', factor: 1000 },
    'ml': { family: 'vol', factor: 1 },
    '毫升': { family: 'vol', factor: 1 },
    'l': { family: 'vol', factor: 1000 },
    'ltr': { family: 'vol', factor: 1000 },
    'litre': { family: 'vol', factor: 1000 },
    '升': { family: 'vol', factor: 1000 },
};

// 👑 单位切换环：基础单位 → 公制孪生 (g/kg) → 展示单位 (Pack/CTN)
// toBase = 1 个该单位 等于多少个基础单位
const getUnitCycle = (ing: MenuIngredient, stockItems: StockItem[]): { unit: string; toBase: number }[] => {
    const stockItem = stockItems.find(s => s.id === ing.stockId);
    const base = (stockItem ? getBaseUnit(stockItem) : (ing.unit || '')).trim();
    if (!base) return [];
    const cycle: { unit: string; toBase: number }[] = [{ unit: base, toBase: 1 }];
    const m = METRIC_UNITS[base.toLowerCase()];
    if (m?.family === 'mass') cycle.push(m.factor === 1000 ? { unit: 'g', toBase: 0.001 } : { unit: 'kg', toBase: 1000 });
    if (m?.family === 'vol') cycle.push(m.factor === 1000 ? { unit: 'ml', toBase: 0.001 } : { unit: 'L', toBase: 1000 });
    const disp = (stockItem?.displayUnit || '').trim();
    const dispRatio = Number(stockItem?.displayToBaseRatio) || 0;
    if (disp && dispRatio > 0 && !cycle.some(c => c.unit.toLowerCase() === disp.toLowerCase())) {
        cycle.push({ unit: disp, toBase: dispRatio });
    }
    return cycle;
};

const getIngredientCostDetail = (
    ingredient: MenuIngredient,
    stockItems: StockItem[]
): {
    unitCost: number;
    unit: string;
    baseQty: number;
    baseCost: number;
    yieldPercent: number;
    effectiveCost: number;
    conversionPath: 'direct' | 'base' | 'display' | 'purchase' | 'metric' | 'fallback';
} => {
    const stockItem = stockItems.find(s => s.id === ingredient.stockId);
    
    // Read priority:
    // unitCost = stockItem.costPerBaseUnit ?? stockItem.cost ?? ingredient.costPerUnit ?? 0
    // unit = stockItem.baseUnit ?? stockItem.unit ?? ingredient.unit
    const unitCost = stockItem ? getCostPerBaseUnit(stockItem) : (ingredient.costPerUnit ?? 0);
    const baseUnit = stockItem ? getBaseUnit(stockItem) : (ingredient.unit ?? 'pcs');
    
    const recipeUnit = ingredient.unit || '';
    const recipeQty = ingredient.qty ?? 0;
    
    const normRecipeUnit = recipeUnit.trim().toLowerCase();
    const normBaseUnit = baseUnit.trim().toLowerCase();
    const normDisplayUnit = (stockItem?.displayUnit || '').trim().toLowerCase();
    
    let baseQty = recipeQty;
    let conversionPath: 'direct' | 'base' | 'display' | 'purchase' | 'metric' | 'fallback' = 'direct';
    
    // 👑 同族公制换算 (g↔kg / ml↔L)，防止切到 g 后掉进 fallback 放大 1000 倍
    const mRecipe = METRIC_UNITS[normRecipeUnit];
    const mBase = METRIC_UNITS[normBaseUnit];
    
    if (normRecipeUnit === normBaseUnit) {
        baseQty = recipeQty;
        conversionPath = 'base';
    } else if (mRecipe && mBase && mRecipe.family === mBase.family) {
        baseQty = recipeQty * (mRecipe.factor / mBase.factor);
        conversionPath = 'metric';
    } else if (normDisplayUnit && normRecipeUnit === normDisplayUnit) {
        const displayRatio = stockItem?.displayToBaseRatio ?? 1;
        baseQty = recipeQty * displayRatio;
        conversionPath = 'display';
    } else {
        // Search purchase units
        const matchingPU = stockItem?.purchaseUnits?.find(
            pu => (pu.unitName || '').trim().toLowerCase() === normRecipeUnit
        );
        if (matchingPU) {
            const puRatio = matchingPU.toBaseRatio ?? 1;
            baseQty = recipeQty * puRatio;
            conversionPath = 'purchase';
        } else {
            // fallback
            baseQty = recipeQty;
            conversionPath = 'fallback';
        }
    }
    
    // Safety check on baseQty
    if (isNaN(baseQty) || !isFinite(baseQty) || baseQty < 0) {
        baseQty = 0;
    }
    
    // baseCost = baseQty * unitCost
    let baseCost = baseQty * unitCost;
    if (isNaN(baseCost) || !isFinite(baseCost) || baseCost < 0) {
        baseCost = 0;
    }
    
    // yieldPercent
    let yieldPercent = ingredient.yieldPercent ?? stockItem?.yieldPercent ?? 100;
    if (yieldPercent <= 0 || isNaN(yieldPercent) || !isFinite(yieldPercent)) {
        yieldPercent = 100;
    }
    
    // effectiveCost = baseCost / (yieldPercent / 100)
    let effectiveCost = baseCost / (yieldPercent / 100);
    if (isNaN(effectiveCost) || !isFinite(effectiveCost) || effectiveCost < 0) {
        effectiveCost = 0;
    }
    
    return {
        unitCost,
        unit: baseUnit,
        baseQty,
        baseCost,
        yieldPercent,
        effectiveCost,
        conversionPath
    };
};

const recalcVariantCost = (recipe?: MenuIngredient[], overheadMarginPercent?: number, stockItems: StockItem[] = []): number => {
    if (!recipe || recipe.length === 0) return 0;
    const baseCost = recipe.reduce((sum, item) => {
        const detail = getIngredientCostDetail(item, stockItems);
        return sum + detail.effectiveCost;
    }, 0);
    return baseCost * (1 + (overheadMarginPercent || 0) / 100);
};


// ============================================================
// Excel 配方一键导入（只认「配方填写_App同步」同步页）
// ============================================================
type RecipeImportSize = 'S' | 'M' | 'L';

type RecipeImportRow = {
    menuCode: string;
    menuName: string;
    stockId: string;
    stockChoice: string;
    stockName: string;
    declaredUnit: string;
    excelBaseUnit: string;
    conversionRatio: number;
    order: number;
    qty: Record<RecipeImportSize, unknown>;
    note: string;
    status: string;
};

type MaterialMasterImport = {
    stockId: string;
    stockName: string;
    appUnit: string;
    recipeUnit: string;
    ratio: number;
};

type ParsedImportQty = {
    qty: number;
    unit: string;
    original: string;
    explicitUnit: boolean;
    rangeUsed: boolean;
};

const normalizeExcelKey = (value: unknown): string => String(value ?? '')
    .trim()
    .replace(/[\s_＿]/g, '')
    .replace(/[（）()\/]/g, '')
    .toLowerCase();

const getExcelCell = (row: Record<string, unknown>, aliases: string[]): unknown => {
    for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
    }
    const aliasKeys = new Set(aliases.map(normalizeExcelKey));
    const entry = Object.entries(row).find(([key]) => aliasKeys.has(normalizeExcelKey(key)));
    return entry?.[1];
};

const normalizeSheetName = (name: string): string => name
    .replace(/[①❶]/g, '')
    .replace(/[\s_＿]/g, '')
    .toLowerCase();

const cleanExcelText = (value: unknown): string => {
    const text = String(value ?? '').trim();
    // 某些 Excel/浏览器组合会把公式本身读出来；公式文字绝不能当成 ID / 单位。
    return text.startsWith('=') ? '' : text;
};

const normalizeImportCode = (value: unknown): string => cleanExcelText(value)
    .replace(/\s+/g, '')
    .toUpperCase();

const extractCodeFromText = (value: unknown): string => {
    const text = cleanExcelText(value);
    if (!text) return '';

    const beforePipe = text.split('|')[0].trim();
    if (beforePipe && !/\s/.test(beforePipe) && /[A-Za-z]/.test(beforePipe) && /\d/.test(beforePipe)) {
        return normalizeImportCode(beforePipe);
    }

    const match = text.toUpperCase().match(/[A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*/);
    return match ? normalizeImportCode(match[0]) : '';
};

const extractNameFromChoice = (value: unknown): string => {
    const text = cleanExcelText(value);
    if (!text) return '';
    const parts = text.split('|');
    return (parts.length > 1 ? parts.slice(1).join('|') : text).trim();
};

const normalizeImportName = (value: unknown): string => cleanExcelText(value)
    .toLowerCase()
    .replace(/[\s（）()\-_/|,.，。:：'"]/g, '');

const canonicalMetricUnit = (raw: string): string => {
    const unit = raw.trim();
    const lower = unit.toLowerCase();
    if (['g', 'gram', 'grams', '克'].includes(lower)) return 'g';
    if (['kg', 'kgs', '公斤'].includes(lower)) return 'kg';
    if (['ml', '毫升'].includes(lower)) return 'ml';
    if (['l', 'ltr', 'litre', 'liter', '升'].includes(lower)) return 'L';
    return unit;
};

const isGenericCountUnit = (raw: string): boolean => {
    const unit = raw.trim().toLowerCase();
    return ['pc', 'pcs', 'piece', 'pieces', '粒', '个', '只', '支', '片', '条', '块', '份', '枚'].includes(unit);
};

const sameUnit = (a: string, b: string): boolean => {
    const left = canonicalMetricUnit(a).trim().toLowerCase();
    const right = canonicalMetricUnit(b).trim().toLowerCase();
    return !!left && left === right;
};

const resolveRecipeUnitForStock = (requestedUnit: string, stockItem: StockItem): string => {
    const requested = canonicalMetricUnit(requestedUnit || getBaseUnit(stockItem));
    const candidates = [
        getBaseUnit(stockItem),
        stockItem.displayUnit || '',
        ...(stockItem.purchaseUnits || []).map(pu => pu.unitName || '')
    ].filter(Boolean);

    const exact = candidates.find(candidate => sameUnit(candidate, requested));
    if (exact) return exact;

    if (isGenericCountUnit(requested)) {
        const countCandidate = candidates.find(candidate => isGenericCountUnit(candidate));
        if (countCandidate) return countCandidate;
    }

    return requested;
};

const parseRecipeQuantity = (rawValue: unknown, declaredUnit: string): ParsedImportQty | null => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;

    if (typeof rawValue === 'number') {
        if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
        return {
            qty: rawValue,
            unit: canonicalMetricUnit(declaredUnit),
            original: String(rawValue),
            explicitUnit: false,
            rangeUsed: false
        };
    }

    const original = String(rawValue).trim();
    if (!original) return null;
    const compact = original.replace(/,/g, '').replace(/\s+/g, '');

    // 80-100G / 4-5粒：成本只能是单一数值，取中间值并在预览中提示。
    const rangeMatch = compact.match(/^(\d+(?:\.\d+)?)[\-~～–—至到](\d+(?:\.\d+)?)([^\d]*)$/i);
    if (rangeMatch) {
        const low = Number(rangeMatch[1]);
        const high = Number(rangeMatch[2]);
        if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null;
        let suffix = (rangeMatch[3] || '').trim();
        let qty = (low + high) / 2;

        if (suffix === '对') {
            qty *= 2;
            suffix = declaredUnit || 'pcs';
        }

        return {
            qty,
            unit: canonicalMetricUnit(suffix || declaredUnit),
            original,
            explicitUnit: !!suffix,
            rangeUsed: true
        };
    }

    const singleMatch = compact.match(/^(\d+(?:\.\d+)?)([^\d]*)$/i);
    if (!singleMatch) return null;

    let qty = Number(singleMatch[1]);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    let suffix = (singleMatch[2] || '').trim();

    if (suffix === '对') {
        qty *= 2;
        suffix = declaredUnit || 'pcs';
    }

    return {
        qty,
        unit: canonicalMetricUnit(suffix || declaredUnit),
        original,
        explicitUnit: !!suffix,
        rangeUsed: false
    };
};

const getVariantImportSize = (variant: MenuVariant, index: number, _total: number): RecipeImportSize | null => {
    const label = String(variant.label || '').trim();
    const normalized = label.toLowerCase();

    if (/(^|[\s(/_-])s($|[\s)/_-])/.test(normalized) || /小|small/.test(normalized)) return 'S';
    if (/(^|[\s(/_-])m($|[\s)/_-])/.test(normalized) || /中|medium|regular/.test(normalized)) return 'M';
    if (/(^|[\s(/_-])l($|[\s)/_-])/.test(normalized) || /大|large/.test(normalized)) return 'L';

    // 旧资料的规格名称未必标准；只要是前三个规格，仍按 S / M / L 顺序处理。
    if (index <= 2) return (['S', 'M', 'L'] as RecipeImportSize[])[index];
    return null;
};

const getMenuImportCandidates = (item: MenuItem): string[] => {
    const anyItem = item as any;
    const candidates = [
        item.id,
        anyItem.code,
        anyItem.menuCode,
        anyItem.menuId,
        anyItem.sku,
        anyItem.storeHubCode,
        extractCodeFromText(item.name)
    ]
        .map(normalizeImportCode)
        .filter(Boolean);

    return [...new Set(candidates)];
};

const getStockImportCandidates = (item: StockItem): string[] => {
    const anyItem = item as any;
    const candidates = [
        item.id,
        anyItem.code,
        anyItem.stockId,
        anyItem.stockCode,
        anyItem.inventoryId,
        anyItem.itemCode,
        anyItem.sku
    ]
        .map(normalizeImportCode)
        .filter(Boolean);

    return [...new Set(candidates)];
};

// ============================================================
// 弹窗类型 (统一替换 native confirm/alert，iOS 兼容)
// ============================================================
type ConfirmState = {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
} | null;

type InfoState = {
    title: string;
    message: string;
    icon?: 'success' | 'error' | 'info';
} | null;

export const MenuManagement: React.FC<MenuManagementProps> = ({ onClose, isModal = true, initialMenuItemId }) => {
    // ---- Data State ----
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<MenuCategory[]>(MENU_CATEGORIES);
    const [stockItems, setStockItems] = useState<StockItem[]>([]);

    // ---- View State ----
    const [activeCategory, setActiveCategory] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [priceMode, setPriceMode] = useState<'LOCAL' | 'DELIVERY'>('LOCAL');
    const [deliveryCommission, setDeliveryCommission] = useState<number>(27);
    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT'>('LIST');
    const [loading, setLoading] = useState(true);

    const [isReorderMode, setIsReorderMode] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const isMobile = useIsMobile();

    // ---- Form State ----
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newId, setNewId] = useState('');
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState('A_SERIES');
    const [newOptions, setNewOptions] = useState('');
    const [newImage, setNewImage] = useState('');
    const [newVariants, setNewVariants] = useState<MenuVariant[]>([]);
    const [activeVariantTab, setActiveVariantTab] = useState(0);
    const [, ] = useState(false);

    // ---- Modal / Selector State ----
    const [showStockSelector, setShowStockSelector] = useState(false);
    const [stockSearch, setStockSearch] = useState('');
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copySearch, setCopySearch] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // ---- 分类管理 State ----
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategoryLabel, setNewCategoryLabel] = useState('');
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryLabel, setEditingCategoryLabel] = useState('');
    const [isSavingCategories, setIsSavingCategories] = useState(false);

    // 👑 新增: 食材展开 / 拖拽 / 统一弹窗 (替换所有 native confirm/alert)
    const [expandedIngIdx, setExpandedIngIdx] = useState<number | null>(null);
    const [ingSection, setIngSection] = useState<'USE' | 'KITCHEN' | 'ADV'>('USE');
    const [draggedIngIdx, setDraggedIngIdx] = useState<number | null>(null);
    const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
    const [infoModal, setInfoModal] = useState<InfoState>(null);
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
    const [isImportingRecipe, setIsImportingRecipe] = useState(false);
    const recipeImportInputRef = useRef<HTMLInputElement | null>(null);

    // ============================================================
    // 👑 统一弹窗工具函数 (替换所有 native confirm/alert, iOS 兼容)
    // ============================================================
    const askConfirm = (
        title: string,
        message: string,
        onConfirm: () => void,
        opts?: { danger?: boolean; confirmText?: string; cancelText?: string }
    ) => setConfirmModal({ title, message, onConfirm, ...opts });

    const showInfo = (title: string, message: string, icon: 'success' | 'error' | 'info' = 'info') =>
        setInfoModal({ title, message, icon });

    // ============================================================
    // 数据加载 / Lifecycle
    // ============================================================
    useEffect(() => {
        loadData();
    }, []);

    // 👑 编辑模式以及物料审计模式下锁定 body 滚动 (iOS Safari 防止 modal 背景滚穿)
    useEffect(() => {
        if (viewMode === 'EDIT' || deleteId || showStockSelector || showCopyModal || showCategoryManager || confirmModal || infoModal) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = originalOverflow; };
        }
    }, [viewMode, deleteId, showStockSelector, showCopyModal, showCategoryManager, confirmModal, infoModal]);

    const loadMenuCategories = async () => {
        let localCategories: MenuCategory[] | null = null;

        try {
            const savedLocal = localStorage.getItem(MENU_CATEGORY_STORAGE_KEY);
            if (savedLocal) localCategories = normalizeMenuCategories(JSON.parse(savedLocal));
        } catch (error) {
            console.warn('[Menu Categories] Invalid local cache ignored:', error);
        }

        try {
            const snapshot = await getDoc(doc(db, 'config', MENU_CATEGORY_CONFIG_DOC));
            const cloudCategories = snapshot.exists()
                ? normalizeMenuCategories(snapshot.data()?.items)
                : null;
            const resolved = cloudCategories && cloudCategories.length > 1
                ? cloudCategories
                : localCategories && localCategories.length > 1
                    ? localCategories
                    : normalizeMenuCategories(MENU_CATEGORIES);

            setCategories(resolved);
            localStorage.setItem(MENU_CATEGORY_STORAGE_KEY, JSON.stringify(resolved));
        } catch (error) {
            console.warn('[Menu Categories] Cloud load failed; using local/default categories:', error);
            const fallback = localCategories && localCategories.length > 1
                ? localCategories
                : normalizeMenuCategories(MENU_CATEGORIES);
            setCategories(fallback);
        }
    };

    const persistMenuCategories = async (nextCategories: MenuCategory[]): Promise<boolean> => {
        const normalized = normalizeMenuCategories(nextCategories);
        setCategories(normalized);
        localStorage.setItem(MENU_CATEGORY_STORAGE_KEY, JSON.stringify(normalized));

        try {
            await setDoc(
                doc(db, 'config', MENU_CATEGORY_CONFIG_DOC),
                {
                    items: normalized,
                    updatedAt: new Date().toISOString()
                },
                { merge: true }
            );
            return true;
        } catch (error) {
            console.error('[Menu Categories] Cloud save failed:', error);
            return false;
        }
    };

    const createCategoryId = (label: string) => {
        const slug = label
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 28);

        const baseId = slug || `CATEGORY_${Date.now().toString(36).toUpperCase()}`;
        let candidate = baseId;
        let suffix = 2;

        while (categories.some(category => category.id === candidate)) {
            candidate = `${baseId}_${suffix}`;
            suffix += 1;
        }

        return candidate;
    };

    const handleAddCategory = async () => {
        const label = newCategoryLabel.trim();
        if (!label) {
            return showInfo('缺少分类名称', '请先输入新分类名称。', 'error');
        }

        const duplicate = categories.some(
            category => category.label.trim().toLowerCase() === label.toLowerCase()
        );
        if (duplicate) {
            return showInfo('分类已存在', `「${label}」已经在分类列表中。`, 'error');
        }

        const id = createCategoryId(label);
        const nextCategories = [
            ...categories,
            { id, label } as MenuCategory
        ];

        setIsSavingCategories(true);
        const cloudSaved = await persistMenuCategories(nextCategories);
        setIsSavingCategories(false);
        setNewCategoryLabel('');
        setNewCategory(id);
        setActiveCategory(id);

        showInfo(
            cloudSaved ? '✅ 分类已新增' : '分类已保存在本机',
            cloudSaved
                ? `「${label}」已新增，并已同步到云端。`
                : `「${label}」已经可以使用，但云端同步失败。请检查网络后再编辑一次。`,
            cloudSaved ? 'success' : 'info'
        );
    };

    const startEditingCategory = (category: MenuCategory) => {
        if (category.id === 'ALL') return;
        setEditingCategoryId(category.id);
        setEditingCategoryLabel(category.label);
    };

    const cancelEditingCategory = () => {
        setEditingCategoryId(null);
        setEditingCategoryLabel('');
    };

    const handleSaveCategoryEdit = async () => {
        if (!editingCategoryId) return;

        const label = editingCategoryLabel.trim();
        if (!label) {
            return showInfo('缺少分类名称', '分类名称不可以留空。', 'error');
        }

        const duplicate = categories.some(
            category =>
                category.id !== editingCategoryId &&
                category.label.trim().toLowerCase() === label.toLowerCase()
        );
        if (duplicate) {
            return showInfo('分类名称重复', `「${label}」已经被其他分类使用。`, 'error');
        }

        const nextCategories = categories.map(category =>
            category.id === editingCategoryId
                ? { ...category, label }
                : category
        );

        setIsSavingCategories(true);
        const cloudSaved = await persistMenuCategories(nextCategories);
        setIsSavingCategories(false);
        cancelEditingCategory();

        showInfo(
            cloudSaved ? '✅ 分类已更新' : '分类名称已保存在本机',
            cloudSaved
                ? `分类已改名为「${label}」，原有菜品会继续保留在这个分类中。`
                : '分类名称已更新，但云端同步失败。请检查网络连接。',
            cloudSaved ? 'success' : 'info'
        );
    };

    const handleDeleteCategory = (category: MenuCategory) => {
        if (category.id === 'ALL') return;

        const usageCount = menuItems.filter(item => item.category === category.id).length;
        if (usageCount > 0) {
            return showInfo(
                '无法删除正在使用的分类',
                `「${category.label}」仍有 ${usageCount} 个菜品使用。请先把这些菜品移到其他分类，再删除这个分类。`,
                'error'
            );
        }

        askConfirm(
            '删除分类?',
            `确定删除「${category.label}」吗？这个分类目前没有菜品使用。`,
            async () => {
                const nextCategories = categories.filter(item => item.id !== category.id);
                setIsSavingCategories(true);
                const cloudSaved = await persistMenuCategories(nextCategories);
                setIsSavingCategories(false);

                if (activeCategory === category.id) setActiveCategory('ALL');
                if (newCategory === category.id) {
                    setNewCategory(nextCategories.find(item => item.id !== 'ALL')?.id || 'A_SERIES');
                }
                if (editingCategoryId === category.id) cancelEditingCategory();

                showInfo(
                    cloudSaved ? '分类已删除' : '分类已从本机删除',
                    cloudSaved
                        ? `「${category.label}」已删除。`
                        : '分类已经从当前设备删除，但云端同步失败。',
                    cloudSaved ? 'success' : 'info'
                );
            },
            { danger: true, confirmText: '删除分类' }
        );
    };

    const loadData = async () => {
        setLoading(true);
        try {
            await loadMenuCategories();

            const stockResults = await Promise.all([
                DataManager.getStock('KITCHEN'),
                DataManager.getStock('BAR'),
                DataManager.getStock('GENERAL'),
                DataManager.getStock('FUEL')
            ]).catch(err => {
                console.error("Stock load error", err);
                return [] as StockItem[][];
            });
            setStockItems(stockResults.flat());

            const items = await DataManager.getMenu();
            if (items && items.length > 0) {
                setMenuItems(items);
            } else {
                setMenuItems(INITIAL_MENU_ITEMS);
            }
        } catch (error) {
            console.error("Failed to load menu data", error);
            setMenuItems(INITIAL_MENU_ITEMS);
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // 菜品列表排序逻辑 (拖拽 / 上下箭头)
    // ============================================================
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const newItems = [...menuItems];
        const draggedItem = newItems[draggedItemIndex];
        newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, draggedItem);
        setMenuItems(newItems);
        setDraggedItemIndex(index);
    };

    const handleDragEnd = () => setDraggedItemIndex(null);

    const handleMoveItem = (index: number, direction: 'UP' | 'DOWN') => {
        if (direction === 'UP' && index === 0) return;
        if (direction === 'DOWN' && index === menuItems.length - 1) return;
        const newItems = [...menuItems];
        const targetIndex = direction === 'UP' ? index - 1 : index + 1;
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
        setMenuItems(newItems);
    };

    const saveReorderedList = async () => {
        askConfirm(
            "保存新排序?",
            "Confirm Save Order? 此操作将更新菜品的显示顺序。",
            async () => {
                setLoading(true);
                await DataManager.saveMenu(menuItems);
                setLoading(false);
                setIsReorderMode(false);
                showInfo("✅ 排序已保存", "Order Saved", 'success');
            }
        );
    };

    // ============================================================
    // 价格 / 利润计算
    // ============================================================
    const calculateDeliveryPrice = (localPrice: number) => {
        if (!localPrice) return 0;
        const factor = 1 - (deliveryCommission / 100);
        const safeFactor = factor > 0 ? factor : 1;
        const calculatedPrice = localPrice / safeFactor;
        const wholeNumber = Math.floor(calculatedPrice);
        const decimalPart = calculatedPrice - wholeNumber;
        return decimalPart >= 0.45 ? wholeNumber + 0.5 : wholeNumber;
    };

    const getDisplayPrice = (basePrice: number | undefined | null) => {
        const price = Number(basePrice) || 0;
        return priceMode === 'LOCAL' ? price : calculateDeliveryPrice(price);
    };

    const calculateMargin = (price: number, cost: number) => {
        const p = Number(price) || 0;
        const c = Number(cost) || 0;
        if (p <= 0) return 0;
        return ((p - c) / p) * 100;
    };

    // 👑 直接利润 = 卖价 - 成本 (RM 金额)
    const calculateProfit = (price: number, cost: number) => {
        const p = Number(price) || 0;
        const c = Number(cost) || 0;
        return p - c;
    };

    // ============================================================
    // 菜品 CRUD
    // ============================================================
    const saveMenu = async (items: MenuItem[]) => {
        setMenuItems(items);
        await DataManager.saveMenu(items);
    };


    // ============================================================
    // Excel 一键导入：以「①配方填写_App同步」为真源
    // - 菜单：优先 Code / ID，兼容从菜名提取 Code
    // - 材料：优先库存 ID，兼容从「KF09 | 材料名」直接提取
    // - 公式栏失效时，自动回退读取「材料主档_App」
    // - Excel 空白/未完成行不删除 App 旧配方
    // ============================================================
    const handleRecipeExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (stockItems.length === 0) {
            return showInfo('库存资料尚未载入', '请等库存资料载入完成后再导入配方。', 'error');
        }

        setIsImportingRecipe(true);
        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            const targetSheetName = workbook.SheetNames.find(name => {
                const normalized = normalizeSheetName(name);
                return normalized === '配方填写app同步' || normalized.includes('配方填写app同步');
            });

            if (!targetSheetName) {
                return showInfo(
                    '找不到同步工作表',
                    '此功能只读取「①配方填写_App同步 / 配方填写_APP同步」工作表。请确认上传的是员工填写后的正确 Excel。',
                    'error'
                );
            }

            // 先读取材料主档。同步页 H-K 有公式；部分浏览器/Excel 组合可能读到公式文字，
            // 所以材料 ID / 单位必须有第二条可靠来源。
            const materialMasterMap = new Map<string, MaterialMasterImport>();
            const materialSheetName = workbook.SheetNames.find(name => normalizeSheetName(name).includes('材料主档app'));
            if (materialSheetName) {
                const materialRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[materialSheetName], {
                    defval: null,
                    raw: true
                });

                materialRows.forEach(row => {
                    const stockId = normalizeImportCode(getExcelCell(row, ['库存 ID', '库存ID']));
                    if (!stockId) return;

                    const ratioRaw = getExcelCell(row, ['1 App单位 = ? 配方单位', '1App单位=?配方单位']);
                    const ratio = Number(ratioRaw) || 0;
                    materialMasterMap.set(stockId, {
                        stockId,
                        stockName: cleanExcelText(getExcelCell(row, ['材料名称 / Ingredient', '材料名称', 'Ingredient'])),
                        appUnit: cleanExcelText(getExcelCell(row, ['App 库存单位（参考）', 'App库存单位（参考）', 'App 库存单位'])),
                        recipeUnit: cleanExcelText(getExcelCell(row, ['配方使用单位（可改）', '配方使用单位'])),
                        ratio
                    });
                });
            }

            const worksheet = workbook.Sheets[targetSheetName];
            const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
                defval: null,
                raw: true
            });

            if (rawRows.length === 0) {
                return showInfo('同步表没有资料', `「${targetSheetName}」没有可读取的数据。`, 'error');
            }

            const importRows: RecipeImportRow[] = rawRows.map((row, index) => {
                const stockChoice = cleanExcelText(getExcelCell(row, [
                    '库存材料（从App选择）',
                    '库存材料(从App选择)',
                    '库存材料'
                ]));

                const formulaStockId = normalizeImportCode(getExcelCell(row, [
                    '库存 ID（自动）',
                    '库存ID（自动）',
                    '库存 ID',
                    '库存ID'
                ]));

                // 如果 H 列公式没有被浏览器正确计算，直接从 G 列「KF09 | 肉片」提取 KF09。
                const stockId = formulaStockId || extractCodeFromText(stockChoice);
                const master = materialMasterMap.get(stockId);

                const formulaStockName = cleanExcelText(getExcelCell(row, [
                    '材料名称（自动）',
                    '材料名称',
                    'Ingredient'
                ]));

                const formulaBaseUnit = cleanExcelText(getExcelCell(row, [
                    'App 库存单位（自动）',
                    'App库存单位（自动）',
                    'App 库存单位'
                ]));

                const formulaRecipeUnit = cleanExcelText(getExcelCell(row, [
                    '配方使用单位（自动）',
                    '配方使用单位（可改）',
                    '配方使用单位'
                ]));

                return {
                    menuCode: normalizeImportCode(getExcelCell(row, ['菜单 Code', '菜单Code', 'Menu Code'])),
                    menuName: cleanExcelText(getExcelCell(row, ['菜名 / Menu', '菜名', 'Menu'])),
                    stockId,
                    stockChoice,
                    stockName: formulaStockName || master?.stockName || extractNameFromChoice(stockChoice),
                    declaredUnit: formulaRecipeUnit || master?.recipeUnit || '',
                    excelBaseUnit: formulaBaseUnit || master?.appUnit || '',
                    conversionRatio: master?.ratio || 0,
                    order: Number(getExcelCell(row, ['配料序号', '序号']) ?? index + 1) || index + 1,
                    qty: {
                        S: getExcelCell(row, ['小 S 用量', '小S用量', 'S 用量', 'S用量']),
                        M: getExcelCell(row, ['中 M 用量', '中M用量', 'M 用量', 'M用量']),
                        L: getExcelCell(row, ['大 L 用量', '大L用量', 'L 用量', 'L用量'])
                    },
                    note: cleanExcelText(getExcelCell(row, ['备注 / Notes', '备注', 'Notes'])),
                    status: cleanExcelText(getExcelCell(row, ['状态', 'Status']))
                };
            }).filter(row => row.menuCode);

            const rowsByMenu = new Map<string, RecipeImportRow[]>();
            const warnings: string[] = [];
            let incompleteRows = 0;
            let invalidRows = 0;
            let rangeApproxCount = 0;
            let unitOverrideCount = 0;
            let masterConversionCount = 0;

            importRows.forEach(row => {
                const hasAnyQty = (['S', 'M', 'L'] as RecipeImportSize[])
                    .some(size => row.qty[size] !== null && row.qty[size] !== undefined && row.qty[size] !== '');

                if (!hasAnyQty) {
                    if (row.stockId || row.stockChoice) incompleteRows += 1;
                    return;
                }

                if (!row.stockId) {
                    invalidRows += 1;
                    warnings.push(`${row.menuCode}: 有用量但无法取得库存 ID（G/H 列），已跳过。`);
                    return;
                }

                const list = rowsByMenu.get(row.menuCode) || [];
                list.push(row);
                rowsByMenu.set(row.menuCode, list);
            });

            // App 菜单 Code 兼容：item.id / code / menuCode / 菜名开头 A01
            const menuMatchCodeByIndex = new Map<number, string>();
            const matchedMenuCodes = new Set<string>();
            menuItems.forEach((item, index) => {
                const matched = getMenuImportCandidates(item).find(code => rowsByMenu.has(code));
                if (matched) {
                    menuMatchCodeByIndex.set(index, matched);
                    matchedMenuCodes.add(matched);
                }
            });

            rowsByMenu.forEach((_rows, code) => {
                if (!matchedMenuCodes.has(code)) {
                    warnings.push(`${code}: App 菜单找不到相同 Code。`);
                }
            });

            // App 库存兼容：除了 id，也检查常见 code/sku 字段；最后才按材料名回退。
            const stockByCode = new Map<string, StockItem>();
            const stockByName = new Map<string, StockItem>();
            stockItems.forEach(stock => {
                getStockImportCandidates(stock).forEach(code => {
                    if (!stockByCode.has(code)) stockByCode.set(code, stock);
                });
                const nameKey = normalizeImportName(stock.name);
                if (nameKey && !stockByName.has(nameKey)) stockByName.set(nameKey, stock);
            });

            const resolveStockItem = (row: RecipeImportRow): StockItem | undefined => {
                const byCode = stockByCode.get(normalizeImportCode(row.stockId));
                if (byCode) return byCode;

                const nameCandidates = [
                    row.stockName,
                    extractNameFromChoice(row.stockChoice)
                ].map(normalizeImportName).filter(Boolean);

                for (const key of nameCandidates) {
                    const byName = stockByName.get(key);
                    if (byName) return byName;
                }
                return undefined;
            };

            let updatedVariants = 0;
            let importedIngredients = 0;
            let skippedIngredients = 0;
            let matchedStockRows = 0;
            let recognizedVariantCount = 0;
            const updatedMenuCodes = new Set<string>();

            const nextMenuItems = menuItems.map((item, itemIndex) => {
                const code = menuMatchCodeByIndex.get(itemIndex);
                if (!code) return item;

                const sourceRows = rowsByMenu.get(code);
                if (!sourceRows || sourceRows.length === 0 || !item.variants?.length) return item;

                let itemChanged = false;
                const nextVariants = item.variants.map((variant, variantIndex) => {
                    const size = getVariantImportSize(variant, variantIndex, item.variants.length);
                    if (!size) return variant;
                    recognizedVariantCount += 1;

                    const rowsForSize = sourceRows.filter(row => {
                        const value = row.qty[size];
                        return value !== null && value !== undefined && value !== '';
                    });
                    if (rowsForSize.length === 0) return variant;

                    const existingRecipe = variant.recipe || [];
                    const existingByStockId = new Map(
                        existingRecipe.map(ingredient => [normalizeImportCode(ingredient.stockId), ingredient])
                    );
                    const seenActualStockIds = new Set<string>();
                    const touchedActualStockIds = new Set<string>();
                    const importedRecipe: MenuIngredient[] = [];

                    [...rowsForSize]
                        .sort((a, b) => a.order - b.order)
                        .forEach(sourceRow => {
                            const rawQty = sourceRow.qty[size];
                            const stockItem = resolveStockItem(sourceRow);
                            if (!stockItem) {
                                skippedIngredients += 1;
                                warnings.push(
                                    `${code}/${size}: 库存 ${sourceRow.stockId || sourceRow.stockName} 在 App 找不到，已跳过。`
                                );
                                return;
                            }

                            matchedStockRows += 1;
                            const actualStockKey = normalizeImportCode(stockItem.id);
                            touchedActualStockIds.add(actualStockKey);

                            if (seenActualStockIds.has(actualStockKey)) {
                                skippedIngredients += 1;
                                warnings.push(`${code}/${size}: ${stockItem.id} 重复出现，保留第一行。`);
                                return;
                            }
                            seenActualStockIds.add(actualStockKey);

                            const baseUnit = getBaseUnit(stockItem);
                            const declaredUnit = sourceRow.declaredUnit || sourceRow.excelBaseUnit || baseUnit;
                            const parsed = parseRecipeQuantity(rawQty, declaredUnit);
                            if (!parsed) {
                                skippedIngredients += 1;
                                warnings.push(`${code}/${size} ${stockItem.id}: 无法识别用量「${String(rawQty)}」，已跳过。`);
                                return;
                            }

                            if (parsed.rangeUsed) rangeApproxCount += 1;
                            let resolvedUnit = resolveRecipeUnitForStock(parsed.unit, stockItem);
                            let resolvedQty = parsed.qty;
                            let pieceQty = existingByStockId.get(actualStockKey)?.pieceQty || 0;
                            let pieceUnit = existingByStockId.get(actualStockKey)?.pieceUnit || '';

                            if (
                                parsed.explicitUnit &&
                                sourceRow.declaredUnit &&
                                !sameUnit(parsed.unit, sourceRow.declaredUnit)
                            ) {
                                unitOverrideCount += 1;
                                warnings.push(
                                    `${code}/${size} ${stockItem.id}: 「${parsed.original}」明确写了 ${parsed.unit}，因此不采用表内 ${sourceRow.declaredUnit}。`
                                );
                            }

                            let ingredient: MenuIngredient = {
                                ...(existingByStockId.get(actualStockKey) || {}),
                                stockId: stockItem.id,
                                stockName: stockItem.name || sourceRow.stockName,
                                qty: resolvedQty,
                                unit: resolvedUnit,
                                costPerUnit: getCostPerBaseUnit(stockItem),
                                order: importedRecipe.length + 1,
                                spec: existingByStockId.get(actualStockKey)?.spec || '',
                                time: existingByStockId.get(actualStockKey)?.time || 0,
                                note: sourceRow.note || existingByStockId.get(actualStockKey)?.note || '',
                                step: existingByStockId.get(actualStockKey)?.step || '',
                                youtubeUrl: existingByStockId.get(actualStockKey)?.youtubeUrl || '',
                                pieceQty,
                                pieceUnit
                            };

                            let detail = getIngredientCostDetail(ingredient, stockItems);

                            // 如果 App 本身没有这条换算，但 Excel「材料主档_App」已经有：
                            // 1 App单位 = N 配方单位，则先换回 App 基础单位再写入，成本仍然正确。
                            if (detail.conversionPath === 'fallback' && !sameUnit(resolvedUnit, baseUnit)) {
                                const canUseMasterRatio =
                                    sourceRow.conversionRatio > 0 &&
                                    sourceRow.excelBaseUnit &&
                                    sameUnit(sourceRow.excelBaseUnit, baseUnit) &&
                                    sourceRow.declaredUnit &&
                                    sameUnit(parsed.unit, sourceRow.declaredUnit);

                                if (canUseMasterRatio) {
                                    resolvedQty = parsed.qty / sourceRow.conversionRatio;
                                    resolvedUnit = baseUnit;

                                    if (isGenericCountUnit(parsed.unit)) {
                                        pieceQty = parsed.qty;
                                        pieceUnit = parsed.unit;
                                    }

                                    ingredient = {
                                        ...ingredient,
                                        qty: resolvedQty,
                                        unit: resolvedUnit,
                                        pieceQty,
                                        pieceUnit
                                    };
                                    detail = getIngredientCostDetail(ingredient, stockItems);
                                    masterConversionCount += 1;
                                }
                            }

                            // 最后保险：仍然无法换算时，只跳过这一项，不阻断整份 Excel。
                            if (detail.conversionPath === 'fallback' && !sameUnit(ingredient.unit || '', baseUnit)) {
                                skippedIngredients += 1;
                                warnings.push(
                                    `${code}/${size} ${stockItem.id}: 「${parsed.original}」无法安全换算成库存基础单位 ${baseUnit}，仅此材料跳过。`
                                );
                                return;
                            }

                            importedRecipe.push(ingredient);
                        });

                    if (importedRecipe.length === 0) {
                        warnings.push(`${code}/${size}: 本规格没有通过验证的新配料，原配方保持不变。`);
                        return variant;
                    }

                    // Excel 空白/未完成的材料不代表删除：保留 App 里没有被本次 Excel 明确覆盖的旧材料。
                    const preservedExisting = existingRecipe.filter(existing =>
                        !touchedActualStockIds.has(normalizeImportCode(existing.stockId))
                    );

                    const mergedRecipe = renumberRecipe([
                        ...importedRecipe,
                        ...preservedExisting
                    ]);

                    itemChanged = true;
                    updatedVariants += 1;
                    importedIngredients += importedRecipe.length;
                    return {
                        ...variant,
                        recipe: mergedRecipe,
                        cost: recalcVariantCost(mergedRecipe, variant.overheadMarginPercent, stockItems)
                    };
                });

                if (!itemChanged) return item;
                updatedMenuCodes.add(code);
                return { ...item, variants: nextVariants };
            });

            if (updatedVariants === 0) {
                console.warn('[Recipe Excel Import] diagnostics:', {
                    excelMenuCodes: rowsByMenu.size,
                    matchedMenuCodes: matchedMenuCodes.size,
                    matchedStockRows,
                    recognizedVariantCount,
                    warnings
                });

                const warningPreview = warnings.slice(0, 6);
                return showInfo(
                    '暂时没有导入到配方',
                    [
                        `Excel 有用量的菜单：${rowsByMenu.size}`,
                        `成功对上 App 菜单：${matchedMenuCodes.size}`,
                        `成功对上库存材料：${matchedStockRows}`,
                        `识别到的 S/M/L 规格：${recognizedVariantCount}`,
                        '',
                        warningPreview.length ? `原因：\n• ${warningPreview.join('\n• ')}` : '目前没有找到可写入项目。'
                    ].join('\n'),
                    'error'
                );
            }

            console.info('[Recipe Excel Import] preview', {
                file: file.name,
                sheet: targetSheetName,
                updatedMenus: updatedMenuCodes.size,
                updatedVariants,
                importedIngredients,
                skippedIngredients,
                incompleteRows,
                invalidRows,
                rangeApproxCount,
                unitOverrideCount,
                masterConversionCount,
                warnings
            });

            const warningPreview = warnings.slice(0, 5);
            const previewText = [
                `文件：${file.name}`,
                `工作表：${targetSheetName}`,
                '',
                `将更新：${updatedMenuCodes.size} 道菜 / ${updatedVariants} 个规格 / ${importedIngredients} 项配料`,
                `未完成/空白材料：${incompleteRows}（保留 App 原资料）`,
                `跳过/无效：${skippedIngredients + invalidRows}`,
                masterConversionCount > 0 ? `Excel 主档换算：${masterConversionCount} 项` : '',
                rangeApproxCount > 0 ? `范围用量：${rangeApproxCount} 项（例如 4-5粒，取中间值）` : '',
                unitOverrideCount > 0 ? `单位自动纠正：${unitOverrideCount} 项（例如表内写“支”，实际填写“15G”时按 g）` : '',
                warningPreview.length > 0 ? `\n前 ${warningPreview.length} 个提示：\n• ${warningPreview.join('\n• ')}` : '',
                warnings.length > warningPreview.length ? `\n另有 ${warnings.length - warningPreview.length} 个提示，完整内容在浏览器 Console。` : '',
                '',
                '确认后才会写入。Excel 有填写的材料会更新；Excel 空白/未完成材料不会删除 App 现有配方。'
            ].filter(Boolean).join('\n');

            askConfirm(
                '导入 Excel 配方?',
                previewText,
                async () => {
                    setIsImportingRecipe(true);
                    try {
                        await saveMenu(nextMenuItems);
                        showInfo(
                            '✅ 配方导入完成',
                            `已同步 ${updatedMenuCodes.size} 道菜、${updatedVariants} 个规格、${importedIngredients} 项配料。\n` +
                            (skippedIngredients + invalidRows > 0
                                ? `另有 ${skippedIngredients + invalidRows} 项因资料/换算不足被跳过，其他正确资料已经写入。`
                                : '所有通过验证的资料已成功写入。'),
                            'success'
                        );
                    } catch (error) {
                        console.error('[Recipe Excel Import] save failed:', error);
                        showInfo('导入保存失败', 'Excel 已读取，但保存到后端失败。请检查网络后重试。', 'error');
                    } finally {
                        setIsImportingRecipe(false);
                    }
                },
                { confirmText: '确认导入', cancelText: '取消' }
            );
        } catch (error) {
            console.error('[Recipe Excel Import] parse failed:', error);
            showInfo(
                'Excel 读取失败',
                '无法读取这个 Excel。请使用 .xlsx / .xls 文件，并确认项目已安装 xlsx 套件。',
                'error'
            );
        } finally {
            setIsImportingRecipe(false);
        }
    };

    const handleSaveItem = async () => {
        if (!newName) return showInfo("缺少菜名", "请填写菜品名称 (Name required)", 'error');
        const cleanId = newId.trim().toUpperCase().replace(/\s+/g, '');
        if (!cleanId) return showInfo("缺少编号", "请填写菜品编号 (Code/ID required)", 'error');

        const duplicate = menuItems.find(i => i.id === cleanId && i.id !== editingId);
        if (duplicate) {
            return showInfo("编号重复", `编号 [${cleanId}] 已经属于 ${duplicate.name}。 (ID already in use)`, 'error');
        }

        const validVariants = newVariants.filter(v => v.price > 0);
        if (validVariants.length === 0) return showInfo("缺少售价", "请至少填写一个规格的售价 (At least one variant needs a price)", 'error');

        // 👑 保存前重新编号所有规格的食材，保证 order 与数组顺序一致
        const finalVariants = newVariants.map(v => ({
            ...v,
            recipe: renumberRecipe(v.recipe),
            cost: recalcVariantCost(v.recipe, v.overheadMarginPercent, stockItems)
        }));

        const selectedCategoryId = categories.some(category => category.id === newCategory && category.id !== 'ALL')
            ? newCategory
            : categories.find(category => category.id !== 'ALL')?.id;

        if (!selectedCategoryId) {
            return showInfo('缺少分类', '请先建立至少一个菜品分类。', 'error');
        }

        const newItem: MenuItem = {
            id: cleanId,
            name: newName,
            category: selectedCategoryId,
            variants: finalVariants,
            options: newOptions ? newOptions.split(',').map(s => s.trim()).filter(s => s) : [],
            image: newImage
        };

        setLoading(true);
        try {
            if (editingId) {
                if (cleanId !== editingId) {
                    await DataManager.deleteMenuItem(editingId);
                    const remaining = menuItems.filter(i => i.id !== editingId);
                    await saveMenu([...remaining, newItem]);
                } else {
                    const updated = menuItems.map(i => i.id === editingId ? newItem : i);
                    await saveMenu(updated);
                }
            } else {
                await saveMenu([...menuItems, newItem]);
            }
            resetForm();
            setViewMode('LIST');
            showInfo("✅ 已保存", `${newItem.name} 保存成功`, 'success');
        } catch (e) {
            console.error(e);
            showInfo("保存失败", "存储到后端时出错，请重试", 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEditItem = (item: MenuItem) => {
        if (isReorderMode) return;
        setNewId(item.id);
        setNewName(item.name);
        setNewCategory(item.category);
        setNewOptions(item.options ? item.options.join(', ') : '');
        setNewImage(item.image || '');

        // 👑 深拷贝 + 按 order 排序 (确保编辑时食材顺序稳定)
        const loadedVariants: MenuVariant[] = item.variants && item.variants.length > 0
            ? JSON.parse(JSON.stringify(item.variants))
            : [
                { label: 'S (小)', price: 0, cost: 0, recipe: [] },
                { label: 'M (中)', price: 0, cost: 0, recipe: [] },
                { label: 'L (大)', price: 0, cost: 0, recipe: [] }
            ];

        loadedVariants.forEach(v => {
            v.recipe = sortRecipeByOrder(v.recipe);
        });

        setNewVariants(loadedVariants);
        setEditingId(item.id);
        setViewMode('EDIT');
        setActiveVariantTab(0);
        setExpandedIngIdx(null);
    };

    const resetForm = () => {
        setNewId('');
        setNewName('');
        setNewCategory(categories.find(category => category.id !== 'ALL')?.id || 'A_SERIES');
        setNewOptions('');
        setNewImage('');
        setNewVariants([
            { label: 'S (小)', price: 0, cost: 0, recipe: [] },
            { label: 'M (中)', price: 0, cost: 0, recipe: [] },
            { label: 'L (大)', price: 0, cost: 0, recipe: [] }
        ]);
        setEditingId(null);
        setExpandedIngIdx(null);
    };

    const handleAddNew = () => { resetForm(); setViewMode('EDIT'); };

    // 从数据审查中心「去处理」进来：资料读完后直接打开这道菜（只打开一次）
    const openedInitialRef = useRef(false);
    useEffect(() => {
        if (!initialMenuItemId || openedInitialRef.current || loading) return;
        const target = menuItems.find(m => m.id === initialMenuItemId);
        if (target) { openedInitialRef.current = true; handleEditItem(target); }
    }, [initialMenuItemId, loading, menuItems]);
    const handleDeleteClick = (id: string) => { if (isReorderMode) return; setDeleteId(id); };

    const confirmDelete = async () => {
        if (deleteId) {
            await DataManager.deleteMenuItem(deleteId);
            const updated = menuItems.filter(i => i.id !== deleteId);
            setMenuItems(updated);
            setDeleteId(null);
            if (viewMode === 'EDIT') {
                resetForm();
                setViewMode('LIST');
            }
        }
    };

    const handleResetToDefault = () => {
        askConfirm(
            "⚠️ 重置菜谱?",
            "确定重置菜谱到初始状态吗？所有自定义更改将丢失，恢复为金莲记标准菜单。",
            async () => {
                setLoading(true);
                await DataManager.saveMenu(INITIAL_MENU_ITEMS);
                setMenuItems(INITIAL_MENU_ITEMS);
                setLoading(false);
                showInfo("✅ 菜谱已恢复", "Menu Restored", 'success');
            },
            { danger: true, confirmText: '重置' }
        );
    };

    // ============================================================
    // 配方食材逻辑 (新增 / 编辑 / 排序 / 删除)
    // ============================================================
    const addIngredientToVariant = (stockItem: StockItem) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (!currentVariant.recipe) currentVariant.recipe = [];
        if (currentVariant.recipe.find(r => r.stockId === stockItem.id)) {
            setShowStockSelector(false);
            return;
        }
        const newOrder = currentVariant.recipe.length + 1;
        currentVariant.recipe.push({
            stockId: stockItem.id,
            stockName: stockItem.name,
            qty: 0,
            unit: getBaseUnit(stockItem),
            costPerUnit: getCostPerBaseUnit(stockItem),
            order: newOrder,
            spec: '',
            time: 0,
            note: '',
            step: '',
            youtubeUrl: '',
            // 👑 V2.1: 份数描述 (厨房看用) / 实际用量分离 — qty 仍用于算成本
            pieceQty: 0,
            pieceUnit: ''
        });
        currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent, stockItems);
        setNewVariants(updatedVariants);
        setShowStockSelector(false);
        // 自动展开刚加入的食材
        setExpandedIngIdx(currentVariant.recipe.length - 1);
    };

    const updateIngredientQty = (idx: number, qty: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe && currentVariant.recipe[idx]) {
            currentVariant.recipe[idx].qty = isNaN(qty) ? 0 : qty;
            currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent, stockItems);
        }
        setNewVariants(updatedVariants);
    };

    // 👑 通用食材字段更新器 (支持所有新增字段 spec/time/step/note/youtubeUrl/order)
    const updateIngredientField = (idx: number, field: keyof MenuIngredient, value: any) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe && currentVariant.recipe[idx]) {
            (currentVariant.recipe[idx] as any)[field] = value;
            if (field === 'qty' || field === 'costPerUnit' || field === 'yieldPercent') {
                currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent, stockItems);
            }
        }
        setNewVariants(updatedVariants);
    };

    // 👑 通用单位循环切换 (基础 ↔ g/kg ↔ Pack/CTN)，实际用量恒定不变
    const toggleIngredientUnit = (idx: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        const ing = currentVariant?.recipe?.[idx];
        if (!ing) return;
        const cycle = getUnitCycle(ing, stockItems);
        if (cycle.length < 2) return;
        const curIdx = cycle.findIndex(c => c.unit.trim().toLowerCase() === (ing.unit || '').trim().toLowerCase());
        const cur = curIdx >= 0 ? cycle[curIdx] : { unit: ing.unit || '', toBase: 1 };
        const next = cycle[(curIdx + 1) % cycle.length]; // curIdx = -1 时回到基础单位
        // 先折成基础量，再换去下一个单位 —— 分量不会跑掉
        const baseQty = (ing.qty || 0) * cur.toBase;
        ing.qty = parseFloat((baseQty / next.toBase).toFixed(4));
        ing.unit = next.unit;
        const stockItem = stockItems.find(s => s.id === ing.stockId);
        const perBase = stockItem ? getCostPerBaseUnit(stockItem) : (ing.costPerUnit || 0);
        ing.costPerUnit = perBase * next.toBase;
        if (ing.piecesPerKg && ing.piecesPerKg > 0) {
            const mn = METRIC_UNITS[next.unit.toLowerCase()];
            if (mn?.family === 'mass') {
                ing.pieceQty = parseFloat((ing.qty * mn.factor / 1000 * ing.piecesPerKg).toFixed(2));
            }
        }
        currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent, stockItems);
        setNewVariants(updatedVariants);
    };

    const _deprecated_toggleIngredientKgGram = (idx: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe && currentVariant.recipe[idx]) {
            const ing = currentVariant.recipe[idx];
            const currentUnit = (ing.unit || '').toLowerCase();
            if (currentUnit === 'kg' || currentUnit === '公斤') {
                ing.unit = 'g';
                ing.qty = parseFloat(((ing.qty || 0) * 1000).toFixed(4));
                ing.costPerUnit = (ing.costPerUnit || 0) / 1000;
                // 同时把 pieceQty 转换（多向联动）
                if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                    ing.pieceQty = parseFloat(((ing.qty * ing.piecesPerKg) / 1000).toFixed(2));
                }
            } else if (currentUnit === 'g' || currentUnit === 'gram' || currentUnit === '克') {
                ing.unit = 'kg';
                ing.qty = parseFloat(((ing.qty || 0) / 1000).toFixed(4));
                ing.costPerUnit = (ing.costPerUnit || 0) * 1000;
                // 同时把 pieceQty 转换（多向联动）
                if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                    ing.pieceQty = parseFloat((ing.qty * ing.piecesPerKg).toFixed(2));
                }
            }
            currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent, stockItems);
        }
        setNewVariants(updatedVariants);
    };
    void _deprecated_toggleIngredientKgGram;

    const removeIngredient = (idx: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe) {
            currentVariant.recipe.splice(idx, 1);
            // 👑 重新编号 (保持 order 字段连续)
            currentVariant.recipe = renumberRecipe(currentVariant.recipe);
            currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent, stockItems);
        }
        setNewVariants(updatedVariants);
        if (expandedIngIdx === idx) setExpandedIngIdx(null);
        else if (expandedIngIdx !== null && expandedIngIdx > idx) setExpandedIngIdx(expandedIngIdx - 1);
    };

    // 👑 食材上下移动 (双轨制: 同时更新数组顺序 + order 字段)
    const moveIngredient = (idx: number, direction: 'UP' | 'DOWN') => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (!currentVariant.recipe) return;
        if (direction === 'UP' && idx === 0) return;
        if (direction === 'DOWN' && idx === currentVariant.recipe.length - 1) return;
        const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
        [currentVariant.recipe[idx], currentVariant.recipe[targetIdx]] =
            [currentVariant.recipe[targetIdx], currentVariant.recipe[idx]];
        currentVariant.recipe = renumberRecipe(currentVariant.recipe);
        setNewVariants(updatedVariants);
        // 跟随展开
        if (expandedIngIdx === idx) setExpandedIngIdx(targetIdx);
        else if (expandedIngIdx === targetIdx) setExpandedIngIdx(idx);
    };

    // 食材拖拽排序 (桌面端 HTML5 drag/drop)
    const handleIngDragStart = (e: React.DragEvent, idx: number) => {
        setDraggedIngIdx(idx);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleIngDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedIngIdx === null || draggedIngIdx === idx) return;
        const updatedVariants = [...newVariants];
        const recipe = updatedVariants[activeVariantTab].recipe;
        if (!recipe) return;
        const dragged = recipe[draggedIngIdx];
        recipe.splice(draggedIngIdx, 1);
        recipe.splice(idx, 0, dragged);
        updatedVariants[activeVariantTab].recipe = renumberRecipe(recipe);
        setNewVariants(updatedVariants);
        setDraggedIngIdx(idx);
    };

    const handleIngDragEnd = () => setDraggedIngIdx(null);

    // ============================================================
    // 规格 CRUD + 配方同步 / 复制
    // ============================================================
    const updateVariantField = (idx: number, field: keyof MenuVariant, val: any) => {
        const updated = [...newVariants];
        updated[idx] = { ...updated[idx], [field]: val };
        if (field === 'overheadMarginPercent') {
            updated[idx].cost = recalcVariantCost(updated[idx].recipe, val, stockItems);
        }
        setNewVariants(updated);
    };

    const deleteVariant = (idx: number) => {
        if (newVariants.length <= 1) {
            return showInfo("无法删除", "必须保留至少一个规格 (At least one variant required)", 'error');
        }
        askConfirm(
            "删除此规格?",
            `确定删除 [${newVariants[idx].label}] 吗？此规格的所有配方和做法将一并删除。`,
            () => {
                const updated = newVariants.filter((_, i) => i !== idx);
                setNewVariants(updated);
                setActiveVariantTab(0);
                setExpandedIngIdx(null);
            },
            { danger: true, confirmText: '删除' }
        );
    };

    const syncRecipeToAll = () => {
        const cur = newVariants[activeVariantTab];
        if (!cur.recipe || cur.recipe.length === 0) {
            return showInfo("无配方", "当前规格没有配方，无法同步。", 'info');
        }
        askConfirm(
            "同步配方?",
            `确定将 [${cur.label}] 的配方同步到其他所有规格吗？其他规格现有的配方将被覆盖（包括做法、注解、视频等全部字段）。`,
            () => {
                const baseRecipe = cur.recipe || [];
                const updatedVariants = newVariants.map((v, idx) => {
                    if (idx === activeVariantTab) return v;
                    const clonedRecipe = baseRecipe.map(ing => ({ ...ing }));
                    return {
                        ...v,
                        recipe: renumberRecipe(clonedRecipe),
                        cost: recalcVariantCost(clonedRecipe, v.overheadMarginPercent, stockItems)
                    };
                });
                setNewVariants(updatedVariants);
                showInfo("✅ 配方已同步", "请检查其他规格的用量。", 'success');
            }
        );
    };

    const handleCopyRecipe = (sourceItem: MenuItem) => {
        if (!sourceItem.variants || sourceItem.variants.length === 0) {
            return showInfo("无变量", "Source item has no variants.", 'error');
        }
        const sourceVariant = sourceItem.variants[activeVariantTab] || sourceItem.variants[0];
        if (!sourceVariant.recipe || sourceVariant.recipe.length === 0) {
            return showInfo("无配方", "该菜品暂无配方 (No recipe found in source).", 'info');
        }
        askConfirm(
            "复制配方?",
            `确认从 [${sourceItem.name} - ${sourceVariant.label}] 复制配方？当前规格 [${newVariants[activeVariantTab].label}] 的现有配方将被覆盖。`,
            () => {
                const updatedVariants = [...newVariants];
                const cloned = JSON.parse(JSON.stringify(sourceVariant.recipe));
                updatedVariants[activeVariantTab].recipe = sortRecipeByOrder(cloned);
                updatedVariants[activeVariantTab].cost = recalcVariantCost(updatedVariants[activeVariantTab].recipe, updatedVariants[activeVariantTab].overheadMarginPercent, stockItems);
                setNewVariants(updatedVariants);
                setShowCopyModal(false);
                setCopySearch('');
                showInfo("✅ 已复制", `从 ${sourceItem.name} 复制了 ${sourceVariant.recipe!.length} 项食材`, 'success');
            }
        );
    };

    // ============================================================
    // 视图过滤
    // ============================================================
    const visibleGridItems = useMemo(() => {
        return menuItems.map((item, index) => ({ ...item, globalIndex: index })).filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = activeCategory === 'ALL' || item.category === activeCategory;
            return matchesSearch && matchesCategory;
        });
    }, [menuItems, activeCategory, searchTerm]);

    const containerClass = isModal
        ? "fixed inset-0 z-[120] flex flex-col font-sans bg-[#F6F7FB]"
        : "relative w-full h-[85dvh] bg-[#F6F7FB] flex flex-col font-sans rounded-3xl overflow-hidden border border-gray-200 shadow-xl";

    // ============================================================
    // 渲染菜品卡片 (列表)
    // ============================================================
    const renderItemCard = (item: MenuItem & { globalIndex: number }, displayIndex: number) => (
        <div
            key={item.id}
            draggable={isReorderMode}
            onDragStart={(e) => handleDragStart(e, item.globalIndex)}
            onDragOver={(e) => handleDragOver(e, item.globalIndex)}
            onDragEnd={handleDragEnd}
            className={`
                bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 group flex flex-col relative overflow-hidden h-full select-none
                ${isReorderMode
                    ? 'cursor-move ring-2 ring-[#FFD200] ring-offset-2 scale-[0.98]'
                    : 'border border-gray-100 hover:border-yellow-400 cursor-default'
                }
            `}
        >
            {/* Header: ID Code + Commission + Edit/Delete Buttons */}
            <div className="p-3 pb-2.5 flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="bg-black/70 text-white text-[10px] font-mono font-black px-2 py-0.5 rounded-lg shadow-sm shrink-0">
                        {item.id}
                    </span>
                    {priceMode === 'DELIVERY' && !isReorderMode && (
                        <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg flex items-center gap-0.5 truncate shadow-sm">
                            <Truck size={10} /> {deliveryCommission}%
                        </span>
                    )}
                </div>
                {!isReorderMode && (
                    <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => handleEditItem(item)} className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#111111] bg-white border border-gray-200 hover:bg-[#FFD200] hover:border-[#FFD200] rounded-xl transition-colors active:scale-95 shadow-sm"><Edit3 size={12} /></button>
                        <button onClick={() => handleDeleteClick(item.id)} className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-red-600 bg-white border border-gray-200 hover:bg-red-500 hover:text-white hover:border-red-500 rounded-xl transition-colors active:scale-95 shadow-sm"><Trash2 size={12} /></button>
                    </div>
                )}
            </div>

            <div className="p-3 md:p-4 flex flex-col flex-grow bg-white relative z-10">
                <h4 className="font-black text-sm md:text-base text-[#111111] line-clamp-2 leading-snug mb-3 group-hover:text-yellow-600 transition-colors">
                    {item.name}
                </h4>

                {isReorderMode && (
                    <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl mt-auto p-1.5 shadow-inner">
                        <button onClick={() => handleMoveItem(item.globalIndex, 'UP')} className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white rounded-lg text-yellow-700 active:scale-95 shadow-sm flex items-center justify-center"><ArrowLeft size={14} /></button>
                        <Move size={16} className="text-yellow-500" />
                        <button onClick={() => handleMoveItem(item.globalIndex, 'DOWN')} className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white rounded-lg text-yellow-700 active:scale-95 shadow-sm flex items-center justify-center"><ArrowRight size={14} /></button>
                    </div>
                )}

                {!isReorderMode && (
                    <div className="mt-auto space-y-1.5 bg-gray-50/70 rounded-xl p-2.5 md:p-3 border border-gray-100">
                        {(item.variants || []).slice(0, 3).map((v, idx) => {
                            const dispPrice = getDisplayPrice(v.price);
                            return (
                                <div key={idx} className="flex justify-between items-end border-b border-dashed border-gray-200 last:border-0 pb-1.5 last:pb-0">
                                    <span className="font-bold text-xs text-gray-600 truncate pr-2">{v.label}</span>
                                    <div className={`font-mono font-black tabular-nums whitespace-nowrap leading-none ${priceMode === 'DELIVERY' ? 'text-blue-600' : 'text-[#111111]'}`}>
                                        <span className="text-[10px] mr-0.5 opacity-60">RM</span>
                                        <span className="text-sm">{dispPrice.toFixed(0)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!isReorderMode && item.options && item.options.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.options.slice(0, 3).map(opt => (
                            <span key={opt} className="text-[9px] bg-[#111111] text-[#FFD200] px-1.5 py-0.5 rounded flex items-center">{opt}</span>
                        ))}
                        {item.options.length > 3 && (
                            <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">+{item.options.length - 3}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // ============================================================
    // 渲染食材卡片 V2.1 (紧凑纵向卡 / 2 列网格 / 份数双轨)
    // ============================================================
    const renderIngredientRow = (ing: MenuIngredient, i: number) => {
        const detail = getIngredientCostDetail(ing, stockItems);
        const yieldPercentVal = detail.yieldPercent;
        const totalCost = detail.effectiveCost;
        const ytId = extractYouTubeId(ing.youtubeUrl);
        const isExpanded = expandedIngIdx === i;
        const recipeLen = newVariants[activeVariantTab]?.recipe?.length || 0;
        const hasPieces = !!(ing.pieceQty && ing.pieceUnit);

        const stockItemMatch = stockItems.find(s => s.id === ing.stockId);
        const ingredientPhoto = stockItemMatch?.image;

        const unitLower = (ing.unit || '').toLowerCase();
        const unitCycle = getUnitCycle(ing, stockItems);
        const canToggleUnit = unitCycle.length > 1;
        const needConvert = detail.conversionPath !== 'base' && detail.conversionPath !== 'direct';

        const sectionBtn = (key: 'USE' | 'KITCHEN' | 'ADV', label: string) => (
            <button
                type="button"
                onClick={() => setIngSection(key)}
                className={`px-3 py-2 min-h-[40px] rounded-lg text-[11px] font-bold transition-all active:scale-95
                    ${ingSection === key ? 'bg-[#111111] text-[#FFD200]' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
                {label}
            </button>
        );

        // ---- 共用控件 (手机 / 电脑 共用同一套逻辑) ----
        const qtyControl = (
            <div className="flex items-stretch bg-white rounded-lg border border-gray-300 overflow-hidden h-11 md:h-9">
                <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={ing.qty || ''}
                    onChange={e => {
                        const qtyVal = parseFloat(e.target.value) || 0;
                        updateIngredientQty(i, qtyVal);
                        if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                            const isKg = ['kg', '公斤'].includes(unitLower);
                            const pieceQtyVal = isKg ? (qtyVal * ing.piecesPerKg) : (qtyVal * ing.piecesPerKg / 1000);
                            updateIngredientField(i, 'pieceQty', parseFloat(pieceQtyVal.toFixed(2)));
                        }
                    }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                    className="w-full px-2 text-right font-black text-base md:text-sm outline-none min-w-0 font-mono tabular-nums"
                    placeholder="0"
                />
                <button
                    type="button"
                    disabled={!canToggleUnit}
                    onClick={() => { if (canToggleUnit) toggleIngredientUnit(i); }}
                    className={`text-[11px] md:text-[10px] font-bold px-2.5 border-l flex items-center gap-0.5 shrink-0 select-none
                        ${canToggleUnit ? 'bg-amber-50 active:bg-amber-100 text-amber-700 cursor-pointer' : 'bg-gray-50 text-gray-500 cursor-default'}`}
                    title={canToggleUnit ? `点击切换：${unitCycle.map(c => c.unit).join(' / ')}` : undefined}
                >
                    {ing.unit}{canToggleUnit && <RefreshCw size={10} />}
                </button>
            </div>
        );

        const costBlock = (
            <div className="text-right">
                <div className="font-mono tabular-nums font-black text-base md:text-[13px] text-[#111111] leading-none">
                    {totalCost > 0 ? totalCost.toFixed(2) : <span className="text-gray-300">0.00</span>}
                </div>
                <div className="text-[9px] text-gray-400 font-mono mt-0.5">
                    {detail.unitCost.toFixed(2)}/{detail.unit}
                    {yieldPercentVal < 100 && (
                        <span className="ml-1 text-orange-600 font-black" title={`出成率 ${yieldPercentVal}%`}>{yieldPercentVal}%</span>
                    )}
                </div>
            </div>
        );

        const metaTags = (
            <div className="flex items-center gap-1 mt-0.5">
                {ing.spec && <span className="text-[9px] bg-yellow-100 text-yellow-800 px-1.5 rounded font-bold truncate max-w-[110px]">{ing.spec}</span>}
                {hasPieces && <span className="text-[9px] text-amber-700 font-bold">≈{ing.pieceQty}{ing.pieceUnit}</span>}
                {ing.time && ing.time > 0 ? <Clock size={9} className="text-gray-400" /> : null}
                {ytId && <Youtube size={10} className="text-red-500" />}
                {ing.step && <ListOrdered size={10} className="text-blue-500" />}
                {ing.note && <StickyNote size={10} className="text-gray-400" />}
            </div>
        );

        const expandBtn = (
            <button
                onClick={() => { setExpandedIngIdx(isExpanded ? null : i); setIngSection('USE'); }}
                className={`w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-all
                    ${isExpanded ? 'bg-[#111111] text-[#FFD200]' : 'bg-gray-50 text-gray-500 md:hover:bg-gray-200'}`}
                title={isExpanded ? '收起' : '详情'}
            >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
        );

        const deleteBtn = (
            <button
                onClick={() => removeIngredient(i)}
                className="w-10 h-10 md:w-8 md:h-8 rounded-lg bg-red-50 text-red-500 md:hover:bg-red-500 md:hover:text-white flex items-center justify-center active:scale-90 transition-all shrink-0"
                title="删除食材"
            >
                <X size={15} />
            </button>
        );

        const seqBadge = (
            <div className="bg-[#111111] text-[#FFD200] text-[10px] font-mono font-black w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                {ing.order ?? i + 1}
            </div>
        );

        return (
            <div
                key={`${ing.stockId}_${i}`}
                draggable={!isMobile}
                onDragStart={(e) => handleIngDragStart(e, i)}
                onDragOver={(e) => handleIngDragOver(e, i)}
                onDragEnd={handleIngDragEnd}
                className={`bg-white rounded-xl border transition-colors overflow-hidden
                    ${draggedIngIdx === i ? 'border-[#FFD200]' : isExpanded ? 'border-[#FFD200]' : 'border-gray-200 md:hover:border-gray-300'}`}
            >
                {/* ============ 主行 · 手机版 (两行) ============ */}
                <div className="md:hidden px-2.5 py-2">
                    {/* 上行: 序号 + 名称 + 详情 + 删除 */}
                    <div className="flex items-center gap-2">
                        {seqBadge}
                        {ingredientPhoto ? (
                            <div
                                onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: ingredientPhoto, name: ing.stockName }); }}
                                className="w-9 h-9 rounded-lg overflow-hidden bg-cover bg-center shrink-0 border border-gray-200"
                                style={{ backgroundImage: `url(${ingredientPhoto})` }}
                            />
                        ) : null}
                        <div className="flex-grow min-w-0">
                            <div className="font-bold text-[14px] text-[#111111] leading-tight truncate">{ing.stockName}</div>
                            {metaTags}
                        </div>
                        {expandBtn}
                        {deleteBtn}
                    </div>
                    {/* 下行: 用量 + 成本 */}
                    <div className="flex items-center gap-2 mt-2 pl-9">
                        <div className="flex-grow min-w-0">
                            {qtyControl}
                            {needConvert && (
                                <div className="text-[9px] text-indigo-600 font-mono mt-0.5 pl-1">
                                    = {detail.baseQty.toFixed(2)} {detail.unit}
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 w-[92px]">{costBlock}</div>
                    </div>
                </div>

                {/* ============ 主行 · 电脑版 (单行) ============ */}
                <div className="hidden md:flex items-center gap-2 px-2 py-2">
                    {seqBadge}
                    {ingredientPhoto ? (
                        <div
                            onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: ingredientPhoto, name: ing.stockName }); }}
                            className="w-9 h-9 rounded-lg overflow-hidden bg-cover bg-center cursor-zoom-in shrink-0 border border-gray-200"
                            style={{ backgroundImage: `url(${ingredientPhoto})` }}
                        />
                    ) : <div className="w-9 shrink-0" />}
                    <div className="flex-grow min-w-0">
                        <div className="font-bold text-[13px] text-[#111111] leading-tight truncate">{ing.stockName}</div>
                        {metaTags}
                    </div>
                    <div className="shrink-0 w-[150px]">
                        {qtyControl}
                        {needConvert && (
                            <div className="text-[9px] text-indigo-600 font-mono text-right mt-0.5 pr-1">
                                = {detail.baseQty.toFixed(2)} {detail.unit}
                            </div>
                        )}
                    </div>
                    <div className="shrink-0 w-[92px]">{costBlock}</div>
                    <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveIngredient(i, 'UP')} disabled={i === 0}
                            className="w-6 h-4 rounded bg-gray-50 hover:bg-gray-200 disabled:opacity-25 flex items-center justify-center" title="上移">
                            <ChevronUp size={11} className="text-gray-600" />
                        </button>
                        <button onClick={() => moveIngredient(i, 'DOWN')} disabled={i === recipeLen - 1}
                            className="w-6 h-4 rounded bg-gray-50 hover:bg-gray-200 disabled:opacity-25 flex items-center justify-center" title="下移">
                            <ChevronDown size={11} className="text-gray-600" />
                        </button>
                    </div>
                    {expandBtn}
                    {deleteBtn}
                </div>

                {/* ============ 展开区 (三组分页) ============ */}
                {isExpanded && (
                    <div className="border-t border-dashed border-gray-200 bg-[#F6F7FB] p-3 space-y-3">

                        {/* 手机排序 */}
                        <div className="flex md:hidden items-center gap-2">
                            <button onClick={() => moveIngredient(i, 'UP')} disabled={i === 0}
                                className="flex-1 h-9 rounded-lg bg-white border border-gray-200 disabled:opacity-30 flex items-center justify-center gap-1 text-[11px] font-bold">
                                <ChevronUp size={13} /> 上移
                            </button>
                            <button onClick={() => moveIngredient(i, 'DOWN')} disabled={i === recipeLen - 1}
                                className="flex-1 h-9 rounded-lg bg-white border border-gray-200 disabled:opacity-30 flex items-center justify-center gap-1 text-[11px] font-bold">
                                <ChevronDown size={13} /> 下移
                            </button>
                        </div>

                        {/* 分组切换 */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {sectionBtn('USE', '用量换算')}
                            {sectionBtn('KITCHEN', '厨房做法')}
                            {sectionBtn('ADV', '成本设定')}
                        </div>

                        {/* ---- 组 1: 用量换算 ---- */}
                        {ingSection === 'USE' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                                <p className="text-[10px] text-gray-500">份数给厨房看（如「5 只虾」）；上方主行的用量才是成本计算依据，两者会自动联动。</p>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">份数</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={ing.pieceQty || ''}
                                            onChange={e => {
                                                const pieceQtyVal = parseFloat(e.target.value) || 0;
                                                updateIngredientField(i, 'pieceQty', pieceQtyVal);
                                                if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                                                    const isKg = ['kg', '公斤'].includes(unitLower);
                                                    const qtyVal = isKg ? (pieceQtyVal / ing.piecesPerKg) : (pieceQtyVal / ing.piecesPerKg * 1000);
                                                    updateIngredientQty(i, parseFloat(qtyVal.toFixed(4)));
                                                }
                                            }}
                                            placeholder="5"
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] font-bold text-center font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">份数单位</label>
                                        <input
                                            type="text"
                                            list="piece-units-suggestions"
                                            value={ing.pieceUnit || ''}
                                            onChange={e => updateIngredientField(i, 'pieceUnit', e.target.value)}
                                            placeholder="只 / 片 / 段"
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] font-bold text-center"
                                        />
                                    </div>
                                </div>

                                {canToggleUnit && (
                                    <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-gray-100">
                                        <div>
                                            <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">每 1kg 数量</label>
                                            <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                                <input
                                                    type="number"
                                                    placeholder="未设置"
                                                    value={ing.piecesPerKg || ''}
                                                    className="w-full p-2.5 text-center text-sm font-bold outline-none bg-transparent font-mono"
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        updateIngredientField(i, 'piecesPerKg', val);
                                                        if (val > 0 && ing.pieceQty) {
                                                            const isKg = ['kg', '公斤'].includes(unitLower);
                                                            const weight = isKg ? (ing.pieceQty / val) : (ing.pieceQty / val * 1000);
                                                            updateIngredientQty(i, parseFloat(weight.toFixed(4)));
                                                        }
                                                    }}
                                                />
                                                <span className="p-2 border-l bg-white text-[9px] text-gray-400 font-bold shrink-0">/1kg</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">1 份折算成本</label>
                                            <div className="w-full p-2.5 bg-gray-50 rounded-lg text-sm font-black text-center text-gray-700 border border-gray-200 min-h-[42px] flex items-center justify-center font-mono">
                                                {ing.piecesPerKg && ing.piecesPerKg > 0 ? (() => {
                                                    const isKg = ['kg', '公斤'].includes(unitLower);
                                                    const kgCost = isKg ? (ing.costPerUnit || 0) : ((ing.costPerUnit || 0) * 1000);
                                                    return `RM ${(kgCost / ing.piecesPerKg).toFixed(4)}`;
                                                })() : '按重量核算'}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="text-[10px] text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-200 font-mono">
                                    小计 RM {totalCost.toFixed(2)} = {needConvert ? `${detail.baseQty.toFixed(2)} ${detail.unit}` : `${ing.qty || 0} ${ing.unit}`} × RM {detail.unitCost.toFixed(2)}/{detail.unit}
                                </div>
                            </div>
                        )}

                        {/* ---- 组 2: 厨房做法 ---- */}
                        {ingSection === 'KITCHEN' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                        <ListOrdered size={10} /> 做法 (Step)
                                    </label>
                                    <textarea
                                        value={ing.step || ''}
                                        onChange={e => updateIngredientField(i, 'step', e.target.value)}
                                        placeholder="如: 虾去壳留尾，用淀粉抓洗，沥干水分，热油爆香"
                                        rows={3}
                                        className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] resize-y leading-relaxed"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                        <StickyNote size={10} /> 注解 (Note)
                                    </label>
                                    <textarea
                                        value={ing.note || ''}
                                        onChange={e => updateIngredientField(i, 'note', e.target.value)}
                                        placeholder="如: 必须新鲜，冷冻虾口感差"
                                        rows={2}
                                        className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] resize-y leading-relaxed"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Clock size={10} /> 处理时间 (分)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={ing.time || ''}
                                            onChange={e => updateIngredientField(i, 'time', parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] font-bold font-mono text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Sparkles size={10} /> 食材规格 (Spec)
                                        </label>
                                        <input
                                            type="text"
                                            value={ing.spec || ''}
                                            onChange={e => updateIngredientField(i, 'spec', e.target.value)}
                                            placeholder="如: 大只虾"
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] font-bold"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                        <Youtube size={11} className="text-red-500" /> YouTube 教学链接
                                    </label>
                                    <input
                                        type="url"
                                        value={ing.youtubeUrl || ''}
                                        onChange={e => updateIngredientField(i, 'youtubeUrl', e.target.value)}
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        className="w-full p-2.5 bg-gray-50 rounded-lg text-sm border border-gray-200 outline-none focus:border-red-300 font-mono"
                                    />
                                    {ytId && (
                                        <a
                                            href={ing.youtubeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm active:scale-95 transition-all"
                                        >
                                            <Youtube size={18} /> 在 YouTube 打开 <ExternalLink size={13} className="opacity-70" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ---- 组 3: 成本设定 ---- */}
                        {ingSection === 'ADV' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Scale size={10} /> 出成率 (Yield %)
                                        </label>
                                        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={ing.yieldPercent ?? 100}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 100;
                                                    updateIngredientField(i, 'yieldPercent', val > 100 ? 100 : val < 1 ? 1 : val);
                                                }}
                                                className="w-full p-2.5 text-center text-base font-bold outline-none bg-transparent font-mono"
                                            />
                                            <span className="p-2 border-l bg-white text-[10px] text-gray-500 font-bold shrink-0">%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Hash size={10} /> 顺序号
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={ing.order ?? i + 1}
                                            onChange={e => updateIngredientField(i, 'order', parseInt(e.target.value) || 1)}
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] font-bold font-mono text-center"
                                        />
                                    </div>
                                </div>

                                {yieldPercentVal < 100 && (
                                    <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-2.5 leading-normal">
                                        <strong>净料损耗分析</strong>
                                        <ul className="list-disc pl-4 mt-1 space-y-0.5 font-mono">
                                            <li>所需净料 {detail.baseQty.toFixed(2)} {detail.unit}</li>
                                            <li>需备毛料 {(detail.baseQty / (yieldPercentVal / 100)).toFixed(2)} {detail.unit}（损耗 {((detail.baseQty / (yieldPercentVal / 100)) - detail.baseQty).toFixed(2)}）</li>
                                            <li>净料真实单价 RM {(detail.unitCost / (yieldPercentVal / 100)).toFixed(2)} / {detail.unit}</li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // 👑 份数单位的智能建议列表 (一次声明，渲染时全局可用)
    const renderPieceUnitsDatalist = () => (
        <datalist id="piece-units-suggestions">
            <option value="只" />
            <option value="片" />
            <option value="段" />
            <option value="粒" />
            <option value="条" />
            <option value="瓣" />
            <option value="朵" />
            <option value="支" />
            <option value="根" />
            <option value="个" />
            <option value="块" />
            <option value="包" />
            <option value="把" />
            <option value="颗" />
            <option value="份" />
        </datalist>
    );

    // ============================================================
    // 主返回 JSX
    // ============================================================
    const currentVariant = newVariants[activeVariantTab];
    const baseRecipeCost = currentVariant?.recipe?.reduce((sum, item) => {
        const detail = getIngredientCostDetail(item, stockItems);
        return sum + detail.effectiveCost;
    }, 0) || 0;
    const overheadCostAmount = baseRecipeCost * ((currentVariant?.overheadMarginPercent || 0) / 100);
    const variantPrice = currentVariant?.price || 0;
    const variantCost = currentVariant?.cost || 0;
    const variantProfit = calculateProfit(variantPrice, variantCost);
    const variantMargin = calculateMargin(variantPrice, variantCost);

    // 利润颜色: 绿 ≥65 / 黄 50-64 / 红 <50
    const marginColor = variantMargin >= 65
        ? 'bg-green-100 text-green-700 border-green-200'
        : variantMargin >= 50
            ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
            : 'bg-red-100 text-red-700 border-red-200';

    return (
        <div className={containerClass}>
            {/* ====================================================== */}
            {/* 顶栏 Header (含 iOS safe-area) */}
            {/* ====================================================== */}
            <div className="bg-[#111111] px-3 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:px-4 md:pb-4 md:pt-[max(env(safe-area-inset-top),1rem)] flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD200] z-30 relative shadow-md">
                <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    <button 
                        onClick={onClose || (() => window.history.back())}
                        style={{ touchAction: 'manipulation' }}
                        className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-white transition-all border border-white/10 shrink-0"
                        aria-label="Back"
                    >
                        <ArrowLeft size={20} strokeWidth={2.5} />
                    </button>
                    <div className="bg-[#FFD200] text-black p-2 rounded-xl shadow-lg shrink-0"><Utensils size={20} className="md:w-6 md:h-6" /></div>
                    <div className="min-w-0">
                        <h3 className="font-serif font-black text-base md:text-xl tracking-wide truncate">智能菜谱系统</h3>
                        <p className="text-[9px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5 truncate">SMART MENU</p>
                    </div>
                </div>
                <div className="flex gap-2 items-center shrink-0">
                    <ModuleGuideButton module="MENU" />
                    {onClose && (
                        <button onClick={onClose} aria-label="关闭" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full active:scale-95 transition-all text-gray-300 hover:text-white">
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* ====================================================== */}
            {/* LIST 视图 */}
            {/* ====================================================== */}
            {viewMode === 'LIST' && (
                <div className="flex-grow flex flex-col overflow-hidden bg-[#F6F7FB]">
                    <div className="bg-white border-b border-gray-200 p-2 md:p-3 space-y-2 shadow-sm z-20 shrink-0 sticky top-0">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-2">
                            <div className="flex gap-2 w-full md:flex-1 md:w-0 overflow-x-auto scrollbar-hide pb-1 md:pb-0 px-1">
                                {categories.map(c => (
                                    <button key={c.id} onClick={() => setActiveCategory(c.id)} disabled={isReorderMode && c.id === 'ALL'} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold whitespace-nowrap transition-all duration-200 border shrink-0 active:scale-95 ${activeCategory === c.id ? 'bg-gradient-to-r from-[#111111] to-[#333] text-[#FFD200] shadow-md border-transparent scale-105' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end overflow-x-auto px-1">
                                <button onClick={() => { if (isReorderMode) { saveReorderedList(); } else { setIsReorderMode(true); } }} className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm transition-all whitespace-nowrap border active:scale-95 ${isReorderMode ? 'bg-green-50 text-green-700 border-green-200 animate-pulse' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {isReorderMode ? <Save size={14} /> : <Move size={14} />}
                                    {isReorderMode ? '保存顺序 (Save)' : '排序 (Sort)'}
                                </button>

                                {!isReorderMode && (
                                    <>
                                        <div className="bg-gray-100 p-0.5 rounded-lg flex shrink-0 border border-gray-200 items-center">
                                            <button onClick={() => setPriceMode('LOCAL')} className={`px-2 py-1.5 rounded-md text-[10px] font-bold transition-all active:scale-95 ${priceMode === 'LOCAL' ? 'bg-white shadow-sm text-black ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}>堂食</button>
                                            <div className="flex items-center relative">
                                                <button onClick={() => setPriceMode('DELIVERY')} className={`px-2 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95 ${priceMode === 'DELIVERY' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}>
                                                    <Truck size={10} /> 外卖
                                                </button>
                                                {priceMode === 'DELIVERY' && (
                                                    <div className="flex items-center ml-1 pr-1 bg-white border border-gray-200 rounded text-[10px] h-6 shadow-sm overflow-hidden">
                                                        <span className="text-gray-400 pl-1">抽成</span>
                                                        <input type="number" value={deliveryCommission} onChange={e => setDeliveryCommission(Number(e.target.value) || 0)} className="w-7 text-center font-bold outline-none text-blue-600 bg-transparent text-[10px]" onClick={e => e.stopPropagation()} />
                                                        <span className="text-gray-400 font-mono">%</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <input
                                            ref={recipeImportInputRef}
                                            type="file"
                                            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                            className="hidden"
                                            onChange={handleRecipeExcelImport}
                                        />
                                        <button
                                            type="button"
                                            disabled={isImportingRecipe || loading}
                                            onClick={() => recipeImportInputRef.current?.click()}
                                            className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all border border-green-200 bg-green-50 text-green-800 hover:bg-green-100 active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                            title="只读取 Excel 的「配方填写_App同步」工作表"
                                        >
                                            {isImportingRecipe ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                            <span>导入配方</span>
                                        </button>
                                        <button
                                            onClick={() => setShowCategoryManager(true)}
                                            className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 shrink-0"
                                        >
                                            <Layers size={13} />
                                            <span>分类管理</span>
                                        </button>
                                        <button onClick={handleAddNew} className="bg-[#FFD200] hover:bg-[#E5C100] text-black px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 shadow-md active:scale-95 transition-all shrink-0 border border-yellow-400/20">
                                            <Plus size={14} /> <span className="hidden md:inline">新增</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {!isReorderMode && (
                            <div className="relative flex gap-2">
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3 top-2 text-gray-400" size={14} />
                                    <input type="text" placeholder="搜索菜名 (Search Menu)..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); }} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-base md:text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200] focus:border-transparent transition-all shadow-sm" />
                                </div>
                                <button onClick={handleResetToDefault} className="px-3 bg-white border border-gray-200 text-gray-500 hover:text-red-500 hover:bg-red-50 hover:border-red-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm shrink-0 active:scale-95" title="Reset">
                                    <RefreshCw size={12} /> 重置
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-grow overflow-hidden flex flex-col relative pb-[max(env(safe-area-inset-bottom,20px),1rem)]" id="menu-scroll-container">
                        {loading ? (
                            <div className="text-center py-20 text-gray-400 flex flex-col items-center">
                                <RefreshCw className="animate-spin mb-2" />Loading Menu...
                            </div>
                        ) : (
                            <div className="overflow-y-auto p-3 md:p-4 pb-32 h-full">
                                {visibleGridItems.length === 0 ? (
                                    <div className="text-center py-20 text-gray-400 font-bold">暂无菜品 (No Items)</div>
                                ) : (
                                    <div className="max-w-[1600px] mx-auto w-full">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
                                            {visibleGridItems.map((item, idx) => renderItemCard(item, idx))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* ====================================================== */}
            {/* EDIT 视图 - 编辑菜品 */}
            {/* ====================================================== */}
            {viewMode === 'EDIT' && (
                <div className="flex-grow flex flex-col md:flex-row bg-[#F6F7FB] overflow-y-auto md:overflow-hidden h-full relative">

                    {/* ============ 左栏: 菜品基本信息 ============ */}
                    <div className="w-full md:w-1/3 bg-white border-b md:border-r md:border-b-0 border-gray-200 p-6 flex flex-col shrink-0 z-20 md:h-full md:overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <button onClick={() => setViewMode('LIST')} className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-black p-2 -ml-2 min-h-[44px] active:scale-95 transition-all">
                                <ChevronLeft size={16} /> 返回列表
                            </button>
                            {editingId && (
                                <button onClick={() => handleDeleteClick(editingId)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors md:hidden active:scale-95">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>

                        <h3 className="font-black text-2xl text-[#111111] mb-6">{editingId ? '编辑菜品' : '新增菜品'}</h3>

                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Code / ID (菜品编号)</label>
                                <input 
                                    className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none border-2 border-transparent focus:border-[#FFD200] uppercase font-mono" 
                                    value={newId} 
                                    onChange={e => setNewId(e.target.value.toUpperCase().replace(/\s+/g, ''))} 
                                    placeholder="e.g. A01" 
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Name (菜名)</label>
                                <input className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none border-2 border-transparent focus:border-[#FFD200]" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Hokkien Mee" />
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase block">Category (分类)</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowCategoryManager(true)}
                                        className="text-[10px] font-black text-yellow-700 hover:text-black flex items-center gap-1 min-h-[32px] px-2 rounded-lg hover:bg-yellow-50 transition-all"
                                    >
                                        <Layers size={11} /> 管理分类
                                    </button>
                                </div>
                                <select className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                                    {categories.filter(c => c.id !== 'ALL').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Options (选项)</label>
                                <input className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none border-2 border-transparent focus:border-[#FFD200]" value={newOptions} onChange={e => setNewOptions(e.target.value)} placeholder="e.g. 少辣, 加蛋, 走青 (Comma separated)" />
                            </div>
                        </div>

                        <div className="mt-auto pt-6 hidden md:block pb-[env(safe-area-inset-bottom)]">
                            <button onClick={handleSaveItem} className="w-full py-4 bg-[#111111] text-[#FFD200] rounded-xl font-black text-lg shadow-lg hover:bg-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                                <Save size={20} /> 保存菜品 (Save)
                            </button>
                        </div>
                    </div>

                    {/* ============ 右栏: 规格与配方 ============ */}
                    <div className="flex-grow p-4 md:p-6 md:h-full md:overflow-y-auto pb-40 md:pb-6">
                        <div className="max-w-3xl mx-auto space-y-5">

                            {/* --- 规格 Tab 切换栏 --- */}
                            <div className="flex justify-between items-center gap-3 flex-wrap">
                                <h4 className="font-black text-lg text-[#111111] flex items-center gap-2">
                                    <Box size={18} className="text-[#FFD200]" />
                                    规格与配方
                                </h4>
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 overflow-x-auto scrollbar-hide flex-grow md:flex-grow-0 max-w-full">
                                        {newVariants.map((v, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => { setActiveVariantTab(idx); setExpandedIngIdx(null); }}
                                                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${activeVariantTab === idx ? 'bg-[#111111] text-[#FFD200]' : 'text-gray-500 hover:bg-gray-50'}`}
                                            >
                                                {v.label || `Var ${idx + 1}`}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => {
                                                setNewVariants([...newVariants, { label: 'New', price: 0, cost: 0, recipe: [], method: '', youtubeUrl: '', totalTime: 0, variantNote: '' }]);
                                                setActiveVariantTab(newVariants.length);
                                            }}
                                            className="px-3 py-2.5 min-h-[44px] text-gray-400 hover:text-black active:scale-95"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                    <button onClick={() => deleteVariant(activeVariantTab)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors active:scale-95" title="Delete Variant">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* --- 6 列规格指标卡 (Label | Price | Overhead | Cost | Profit | GP%) --- */}
                            <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
 <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4 pb-6 border-b border-gray-100">
                                    {/* 规格名 */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">规格名</label>
                                        <input className="w-full p-2.5 bg-gray-50 rounded-lg text-base font-bold outline-none border focus:border-[#FFD200]" value={currentVariant?.label || ''} onChange={e => updateVariantField(activeVariantTab, 'label', e.target.value)} />
                                    </div>
                                    {/* 卖价 */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">卖价 (RM)</label>
                                        <div className="relative">
                                            <span className="absolute left-2 top-[11px] text-gray-400 text-xs font-bold">RM</span>
                                            <input
                                                type="number"
                                                step="0.50"
                                                className="w-full p-2.5 pl-9 bg-gray-50 rounded-lg text-base font-bold outline-none border focus:border-[#FFD200]"
                                                value={currentVariant?.price || ''}
                                                onChange={e => updateVariantField(activeVariantTab, 'price', parseFloat(e.target.value) || 0)}
                                                onClick={e => (e.target as HTMLInputElement).select()}
                                            />
                                        </div>
                                    </div>
                                    {/* 调料/杂项损耗 % */}
                                    <div>
                                        <label className="text-[9px] font-black text-amber-600 uppercase mb-1 block tracking-wider" title="杂项调料、油盐酱醋与备料耗损附加比例 (Overhead Margin %)">🧂 调料/损耗 %</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.5"
                                                className="w-full p-2.5 pr-8 bg-amber-50 rounded-lg text-base font-bold outline-none border border-amber-200 focus:border-[#FFD200] text-center text-amber-900"
                                                value={currentVariant?.overheadMarginPercent ?? 0}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    updateVariantField(activeVariantTab, 'overheadMarginPercent', val > 100 ? 100 : val < 0 ? 0 : val);
                                                }}
                                                onClick={e => (e.target as HTMLInputElement).select()}
                                            />
                                            <span className="absolute right-2 top-[11px] text-amber-500 text-xs font-bold">%</span>
                                        </div>
                                    </div>
                                    {/* 成本 (auto) */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">成本 (Auto)</label>
                                        <div className="w-full p-2.5 bg-gray-100 text-gray-700 rounded-lg text-base font-mono font-black border border-gray-200 relative">
                                            <span className="text-[10px] mr-1 opacity-50">RM</span>
                                            {variantCost.toFixed(2)}
                                            <Info size={10} className="absolute right-2 top-3 text-gray-400" />
                                        </div>
                                    </div>
                                    {/* 利润 RM (NEW) */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">💰 利润 (RM)</label>
                                        <div className={`w-full p-2.5 rounded-lg text-base font-mono font-black border-2 ${variantProfit > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : variantProfit < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            <span className="text-[10px] mr-1 opacity-50">RM</span>
                                            {variantProfit.toFixed(2)}
                                        </div>
                                    </div>
                                    {/* GP% */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">利润率 GP%</label>
                                        <div className={`w-full p-2.5 rounded-lg text-base font-mono font-black border-2 ${marginColor}`}>
                                            {variantMargin.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                {currentVariant?.overheadMarginPercent && currentVariant.overheadMarginPercent > 0 ? (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[10px] text-amber-800 leading-normal font-bold mt-4 animate-in fade-in duration-200">
                                        💡 <strong>配方额外损耗与调味料分摊分析</strong>：
                                        <ul className="list-disc pl-4 mt-1 space-y-0.5 font-sans">
                                            <li>配方食材原料净成本：<strong>RM {baseRecipeCost.toFixed(2)}</strong></li>
                                            <li>额外增设的调味品/杂项/损耗附加率：<strong>{currentVariant.overheadMarginPercent}%</strong></li>
                                            <li>分摊间接损耗金额：<strong>+ RM {overheadCostAmount.toFixed(2)}</strong></li>
                                            <li>最终加权总出餐成本 (作为成本基数，已用于核算上方毛利润和GP%)：<strong>RM {variantCost.toFixed(2)}</strong></li>
                                        </ul>
                                    </div>
                                ) : null}

                                {/* --- 外卖价对比 (副) --- */}
                                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-blue-600">
                                            <Truck size={12} /> <span className="font-bold">外卖建议价</span>
                                        </div>
                                        <div className="font-mono font-black text-blue-700">RM {calculateDeliveryPrice(variantPrice).toFixed(2)}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-gray-500">
                                            <Info size={12} /> <span className="font-bold">配方项数</span>
                                        </div>
                                        <div className="font-mono font-black text-gray-700">{currentVariant?.recipe?.length || 0} 项</div>
                                    </div>
                                </div>

                                {/* --- 食材配方区 --- */}
                                <div className="mt-6 space-y-4">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                        <h5 className="font-bold text-sm text-[#111111] flex items-center gap-2">
                                            <Box size={16} /> 配方食材 (Ingredients)
                                            {currentVariant?.recipe && currentVariant.recipe.length > 0 && (
                                                <span className="bg-[#FFD200] text-black text-[10px] px-2 py-0.5 rounded-full font-black">{currentVariant.recipe.length}</span>
                                            )}
                                        </h5>
                                        <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                            <button onClick={syncRecipeToAll} className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1 flex-1 md:flex-none justify-center active:scale-95">
                                                <Layers size={12} /> <span className="hidden md:inline">同步到所有规格</span><span className="md:hidden">同步</span>
                                            </button>
                                            <button onClick={() => setShowCopyModal(true)} className="text-[10px] bg-orange-50 text-orange-600 px-3 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-orange-100 transition-colors flex items-center gap-1 flex-1 md:flex-none justify-center active:scale-95">
                                                <BookOpen size={12} /> <span className="hidden md:inline">从其他菜品复制</span><span className="md:hidden">复制</span>
                                            </button>
                                            <button onClick={() => setShowStockSelector(true)} className="text-[10px] bg-[#FFD200] text-black px-3 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-yellow-400 transition-colors flex items-center gap-1 flex-1 md:flex-none justify-center shadow-sm active:scale-95">
                                                <Plus size={12} /> 添加原料
                                            </button>
                                        </div>
                                    </div>

                                    {(!currentVariant?.recipe || currentVariant.recipe.length === 0) ? (
                                        <div className="text-center py-10 text-gray-400 text-xs italic bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                            <Box size={32} className="mx-auto mb-2 opacity-30" />
                                            暂无配方 (No Ingredients)
                                            <p className="mt-2 text-[10px] not-italic">点击右上方「添加原料」开始</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* 表头 (桌面) */}
                                            <div className="hidden md:flex items-center gap-2 px-2 pb-1 text-[9px] font-black text-gray-400 uppercase tracking-wider">
                                                <span className="w-7 shrink-0 text-center">#</span>
                                                <span className="w-9 shrink-0" />
                                                <span className="flex-grow">食材 Ingredient</span>
                                                <span className="w-[150px] shrink-0 text-center">用量 Qty</span>
                                                <span className="w-[92px] shrink-0 text-right">成本 RM</span>
                                                <span className="w-6 shrink-0" />
                                                <span className="w-8 shrink-0" />
                                                <span className="w-8 shrink-0" />
                                            </div>
                                            <div className="space-y-1.5">
                                                {currentVariant.recipe.map((ing, i) => renderIngredientRow(ing, i))}
                                            </div>
                                            {/* 合计 */}
                                            <div className="flex items-center justify-between bg-[#111111] text-white rounded-xl px-4 py-3 mt-2">
                                                <span className="text-[11px] font-bold text-gray-300">食材原料净成本 (未含调料/损耗)</span>
                                                <span className="font-mono tabular-nums font-black text-[#FFD200] text-base">RM {baseRecipeCost.toFixed(2)}</span>
                                            </div>
                                            {renderPieceUnitsDatalist()}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ---------- 做法 / 视频区块 (规格层级) ---------- */}
                            <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="bg-orange-100 p-2 rounded-xl">
                                        <Film size={18} className="text-orange-600" />
                                    </div>
                                    <div>
                                        <h5 className="font-black text-base text-[#111111]">做法 & 视频 (Method & Video)</h5>
                                        <p className="text-[10px] text-gray-400">规格层级 — 每个规格独立做法</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* 总用时 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Clock size={11} /> 总用时 (分钟)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={currentVariant?.totalTime || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'totalTime', parseFloat(e.target.value) || 0)}
                                            placeholder="如: 30"
                                            className="w-full md:w-32 p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] font-bold"
                                        />
                                    </div>

                                    {/* 整体做法 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <ListOrdered size={11} /> 整体做法 (Method) — 按步骤换行
                                        </label>
                                        <textarea
                                            value={currentVariant?.method || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'method', e.target.value)}
                                            placeholder={"1. 大火热锅下油\n2. 加入虾爆炒至变色\n3. 加入面条快炒\n4. 调味，加蛋液炒匀\n5. 撒葱花起锅"}
                                            rows={6}
                                            className="w-full p-3 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] resize-y leading-relaxed font-mono"
                                        />
                                        <p className="text-[9px] text-gray-400 mt-1">建议每行一个步骤，方便后厨阅读</p>
                                    </div>

                                    {/* YouTube */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Youtube size={12} className="text-red-500" /> YouTube 教学视频
                                        </label>
                                        <input
                                            type="url"
                                            value={currentVariant?.youtubeUrl || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'youtubeUrl', e.target.value)}
                                            placeholder="https://www.youtube.com/watch?v=..."
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-red-300 font-mono"
                                        />
                                        {extractYouTubeId(currentVariant?.youtubeUrl) && (
                                            <a
                                                href={currentVariant?.youtubeUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-3 inline-flex items-center gap-2 px-5 py-3.5 min-h-[48px] bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                            >
                                                <Youtube size={20} className="fill-white" />
                                                <span>在 YouTube 打开教学视频</span>
                                                <ExternalLink size={14} className="opacity-70" />
                                            </a>
                                        )}
                                    </div>

                                    {/* 规格备注 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <StickyNote size={11} /> 规格备注 (Variant Note)
                                        </label>
                                        <textarea
                                            value={currentVariant?.variantNote || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'variantNote', e.target.value)}
                                            placeholder="如: L 大份要用 2 号大锅，火候要更猛"
                                            rows={2}
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD200] resize-y leading-relaxed"
                                        />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* ============ 移动端底部保存条 ============ */}
                    <div className="md:hidden fixed bottom-0 left-0 w-full px-4 pt-3 pb-[max(env(safe-area-inset-bottom,20px),1rem)] bg-white/95 backdrop-blur-md border-t border-gray-200 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
                        <button onClick={handleSaveItem} className="w-full py-3.5 bg-[#111111] text-[#FFD200] rounded-xl font-black text-lg shadow-lg hover:bg-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                            <Save size={20} /> 保存菜品 (Save)
                        </button>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 分类管理 Modal */}
            {/* ====================================================== */}
            {showCategoryManager && (
                <div
                    className="fixed inset-0 bg-black/60 z-[240] flex items-center justify-center p-3 md:p-4 backdrop-blur-sm animate-in fade-in pb-[max(env(safe-area-inset-bottom),1rem)]"
                    onClick={() => {
                        if (!isSavingCategories) {
                            setShowCategoryManager(false);
                            cancelEditingCategory();
                        }
                    }}
                >
                    <div
                        className="bg-[#F6F7FB] rounded-3xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden border border-white/20"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="bg-[#111111] text-white px-5 py-4 flex items-center justify-between border-b-4 border-[#FFD200]">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-2xl bg-[#FFD200] text-black flex items-center justify-center shadow-lg shrink-0">
                                    <Layers size={21} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-black text-lg leading-tight">菜品分类管理</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                        Menu Categories
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isSavingCategories}
                                onClick={() => {
                                    setShowCategoryManager(false);
                                    cancelEditingCategory();
                                }}
                                className="w-11 h-11 rounded-full hover:bg-white/10 disabled:opacity-40 flex items-center justify-center active:scale-95 transition-all shrink-0"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 md:p-5 border-b border-gray-200 bg-white">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">
                                新增分类
                            </label>
                            <div className="flex flex-col md:flex-row gap-2">
                                <input
                                    type="text"
                                    value={newCategoryLabel}
                                    onChange={event => setNewCategoryLabel(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' && !isSavingCategories) handleAddCategory();
                                    }}
                                    placeholder="例如：季节限定、员工餐、甜品"
                                    className="flex-grow min-h-[48px] px-4 bg-[#F6F7FB] border-2 border-transparent focus:border-[#FFD200] rounded-xl text-base font-bold outline-none transition-all"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    disabled={isSavingCategories || !newCategoryLabel.trim()}
                                    onClick={handleAddCategory}
                                    className="min-h-[48px] px-5 rounded-xl bg-[#FFD200] hover:bg-[#E5BE00] text-black font-black text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                                >
                                    {isSavingCategories ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    新增分类
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                                分类会同步到云端；修改名称不会改变分类编号，也不会影响原有菜品。
                            </p>
                        </div>

                        <div className="flex-grow overflow-y-auto p-4 md:p-5 space-y-3">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 flex gap-2">
                                <Info size={16} className="text-yellow-700 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-yellow-900 leading-relaxed font-medium">
                                    为保护菜谱资料，仍有菜品使用的分类不能删除。请先编辑相关菜品并转移分类。
                                </p>
                            </div>

                            {categories.filter(category => category.id !== 'ALL').map(category => {
                                const usageCount = menuItems.filter(item => item.category === category.id).length;
                                const isEditing = editingCategoryId === category.id;

                                return (
                                    <div
                                        key={category.id}
                                        className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 md:p-4"
                                    >
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                                                        修改分类名称
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editingCategoryLabel}
                                                        onChange={event => setEditingCategoryLabel(event.target.value)}
                                                        onKeyDown={event => {
                                                            if (event.key === 'Enter' && !isSavingCategories) handleSaveCategoryEdit();
                                                            if (event.key === 'Escape') cancelEditingCategory();
                                                        }}
                                                        className="w-full min-h-[46px] px-3 bg-[#F6F7FB] border-2 border-[#FFD200] rounded-xl text-base font-bold outline-none"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={isSavingCategories}
                                                        onClick={cancelEditingCategory}
                                                        className="flex-1 min-h-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs active:scale-95 transition-all"
                                                    >
                                                        取消
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isSavingCategories || !editingCategoryLabel.trim()}
                                                        onClick={handleSaveCategoryEdit}
                                                        className="flex-1 min-h-[44px] rounded-xl bg-[#111111] text-[#FFD200] font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
                                                    >
                                                        {isSavingCategories ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                        保存名称
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-[#FFD200]/20 text-yellow-800 flex items-center justify-center shrink-0">
                                                    <Layers size={18} />
                                                </div>
                                                <div className="min-w-0 flex-grow">
                                                    <div className="font-black text-sm text-[#111111] truncate">{category.label}</div>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                        <span className="text-[9px] font-mono font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">
                                                            {category.id}
                                                        </span>
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${usageCount > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                            {usageCount} 个菜品
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={isSavingCategories}
                                                        onClick={() => startEditingCategory(category)}
                                                        className="w-11 h-11 rounded-xl border border-gray-200 bg-white hover:bg-[#FFD200] hover:border-[#FFD200] text-gray-700 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
                                                        title="修改分类名称"
                                                    >
                                                        <Edit3 size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isSavingCategories}
                                                        onClick={() => handleDeleteCategory(category)}
                                                        className={`w-11 h-11 rounded-xl border flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all ${
                                                            usageCount > 0
                                                                ? 'border-gray-200 bg-gray-100 text-gray-300'
                                                                : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'
                                                        }`}
                                                        title={usageCount > 0 ? `仍有 ${usageCount} 个菜品使用，不能删除` : '删除分类'}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 删除确认 Modal (单独保留，因业务上属于"删除菜品"专门弹窗) */}
            {/* ====================================================== */}
            {deleteId && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
                        <Trash2 size={48} className="mx-auto text-red-500 mb-4" />
                        <h3 className="font-black text-xl mb-2">确认删除?</h3>
                        <p className="text-sm text-gray-500 mb-6">此操作将永久删除该菜品。</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setDeleteId(null)} className="py-3.5 min-h-[48px] bg-gray-100 rounded-xl font-bold text-sm active:scale-95 transition-all">取消</button>
                            <button onClick={confirmDelete} className="py-3.5 min-h-[48px] bg-red-600 text-white rounded-xl font-bold text-sm active:scale-95 transition-all">删除</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 库存原料选择器 */}
            {/* ====================================================== */}
            {showStockSelector && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85dvh]">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-black text-lg">选择库存原料</h3>
                            <button onClick={() => setShowStockSelector(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95 transition-all"><X /></button>
                        </div>
                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                                <input className="w-full pl-10 p-2.5 bg-gray-50 rounded-xl text-base font-bold outline-none" placeholder="Search stock..." value={stockSearch} onChange={e => setStockSearch(e.target.value)} autoFocus />
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-2 pb-6">
                            {(() => {
                                const grouped: Record<string, StockItem[]> = {};
                                const kitchenOnly = stockItems.filter(s => {
                                    if (stockSearch) return matchesStockSearch(s, stockSearch);
                                    return resolveStockArea(s) === 'KITCHEN';
                                });
                                kitchenOnly.forEach(s => {
                                    const catLabel = STOCK_CATEGORIES[s.category] || '其他 (Other)';
                                    if (!grouped[catLabel]) grouped[catLabel] = [];
                                    grouped[catLabel].push(s);
                                });
                                const sortedGroups = Object.keys(grouped).sort();
                                if (sortedGroups.length === 0) return <div className="p-8 text-center text-gray-400 text-xs">No matching kitchen ingredients found.</div>;
                                return sortedGroups.map(group => (
                                    <div key={group} className="mb-4">
                                        <div className="px-3 py-2 bg-gray-50 rounded-lg text-xs font-black text-gray-500 uppercase tracking-wider mb-1 sticky top-0 z-10 flex items-center gap-2">
                                            <Layers size={12} /> {group}
                                        </div>
                                        {grouped[group].map(s => (
                                            <button key={s.id} onClick={() => addIngredientToVariant(s)} className="w-full text-left p-3.5 min-h-[56px] hover:bg-gray-50 rounded-xl flex justify-between items-center group border-b border-gray-50 last:border-0 active:scale-[0.99] active:bg-yellow-50 transition-all">
                                                <div>
                                                    <div className="font-bold text-sm text-[#111111]">{s.name}</div>
                                                    <div className="text-[10px] text-gray-400">Unit: {getBaseUnit(s)} • Cost: RM {getCostPerBaseUnit(s).toFixed(2)}</div>
                                                </div>
                                                <Plus size={18} className="text-gray-300 group-hover:text-[#FFD200]" />
                                            </button>
                                        ))}
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 复制配方 Modal */}
            {/* ====================================================== */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85dvh]">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <div>
                                <h3 className="font-black text-lg text-[#111111] flex items-center gap-2"><BookOpen size={18} className="text-orange-500" /> 复制配方</h3>
                                <p className="text-xs text-gray-500">Copy ingredients from another dish</p>
                            </div>
                            <button onClick={() => setShowCopyModal(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95 transition-all"><X size={20} /></button>
                        </div>

                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                                <input
                                    className="w-full pl-10 p-2.5 bg-white border-2 border-gray-200 rounded-xl text-base font-bold outline-none focus:border-orange-400 transition-colors"
                                    placeholder="搜索菜品 (Search Menu)..."
                                    value={copySearch}
                                    onChange={e => setCopySearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-2 space-y-1 pb-6">
                            {menuItems
                                .filter(m => m.id !== editingId)
                                .filter(m => m.name.toLowerCase().includes(copySearch.toLowerCase()))
                                .map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleCopyRecipe(item)}
                                        className="w-full text-left p-3.5 min-h-[56px] hover:bg-orange-50 rounded-xl flex items-center justify-between group transition-colors active:scale-[0.99]"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs shrink-0 overflow-hidden">
                                                <Utensils size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm text-[#111111] truncate">{item.name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">ID: {item.id} • {item.variants?.[0]?.recipe?.length || 0} 项配方</div>
                                            </div>
                                        </div>
                                        <Copy size={16} className="text-gray-300 group-hover:text-orange-500 shrink-0 ml-2" />
                                    </button>
                                ))
                            }
                            {menuItems.filter(m => m.name.toLowerCase().includes(copySearch.toLowerCase())).length === 0 && (
                                <div className="py-10 text-center text-gray-400 text-xs italic">没有找到匹配的菜品</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 👑 通用 ConfirmModal (替换所有 native confirm) */}
            {/* ====================================================== */}
            {confirmModal && (
                <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${confirmModal.danger ? 'bg-red-100' : 'bg-yellow-100'}`}>
                            {confirmModal.danger ? <AlertTriangle size={28} className="text-red-600" /> : <Info size={28} className="text-yellow-600" />}
                        </div>
                        <h3 className="font-black text-xl mb-2 text-center text-[#111111]">{confirmModal.title}</h3>
                        <p className="text-sm text-gray-600 mb-6 text-center leading-relaxed whitespace-pre-line">{confirmModal.message}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="py-3.5 min-h-[48px] bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-sm active:scale-95 transition-all"
                            >
                                {confirmModal.cancelText || '取消'}
                            </button>
                            <button
                                onClick={() => {
                                    const fn = confirmModal.onConfirm;
                                    setConfirmModal(null);
                                    fn();
                                }}
                                className={`py-3.5 min-h-[48px] rounded-xl font-bold text-sm active:scale-95 transition-all text-white ${confirmModal.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#111111] hover:bg-black'}`}
                            >
                                {confirmModal.confirmText || '确认'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🔍 全局高清图片大图预览弹窗 (Lightbox Zoom Modal) */}
            {previewImage && (
                <div 
                    onClick={() => setPreviewImage(null)}
                    className="fixed inset-0 z-[320] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in cursor-zoom-out select-none"
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
                            <p className="text-xs text-gray-500 mt-1 font-mono font-semibold">点击空白处或右上角关闭 (Tap anywhere to close)</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 👑 通用 InfoModal (替换所有 native alert) */}
            {/* ====================================================== */}
            {infoModal && (
                <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]" onClick={() => setInfoModal(null)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${infoModal.icon === 'success' ? 'bg-green-100' : infoModal.icon === 'error' ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {infoModal.icon === 'success' && <Check size={28} className="text-green-600" />}
                            {infoModal.icon === 'error' && <AlertTriangle size={28} className="text-red-600" />}
                            {(!infoModal.icon || infoModal.icon === 'info') && <Info size={28} className="text-blue-600" />}
                        </div>
                        <h3 className="font-black text-xl mb-2 text-center text-[#111111]">{infoModal.title}</h3>
                        <p className="text-sm text-gray-600 mb-6 text-center leading-relaxed whitespace-pre-line">{infoModal.message}</p>
                        <button
                            onClick={() => setInfoModal(null)}
                            className="w-full py-3.5 min-h-[48px] bg-[#111111] text-[#FFD200] rounded-xl font-bold text-sm active:scale-95 transition-all"
                        >
                            知道了
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
