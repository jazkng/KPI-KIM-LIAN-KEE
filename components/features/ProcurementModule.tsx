import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShoppingCart, Package, Truck, AlertTriangle, Plus, FileText, Send, Printer, CheckCircle2, X, RefreshCw, ChevronRight, Search, ClipboardCheck, ArrowDownToLine, Loader2, Info, ChevronDown, Filter, Utensils, Coffee, Box, Wrench, Minus, ChevronUp, History, Clock, Zap, Trash2, Fish, Beef, Wheat, Carrot, Soup, PaintBucket, Users, ArrowLeft, Percent, Bus, Scale, Calculator, Flame } from 'lucide-react';
import { StockItem, Supplier, PurchaseOrder, PurchaseOrderItem, ExpenseItem, CatalogItem, UomOption } from '../../types';
import { normalizeCatalogItem } from '../utils';
import { DataManager } from '../../utils/dataManager';
import {
    calculateWeightedAverageCost, calculateReceivedLine, convertPurchaseToBase, calculatePurchaseToBaseRatio,
    getCurrentQtyBase, getMinLevelBase, getMaxQtyBase, getCostPerBaseUnit,
    getBaseUnit, getDisplayToBaseRatio, needsReplenishment
} from '../../utils/unitConversion';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas-pro';
import { applyResolvedStylesForPdf } from '../../utils/pdfStyleResolver';


interface ProcurementModuleProps {
    onClose?: () => void;
}

interface InventoryStocktakeCompletion {
    id: string;
    taskId: string;
    assigneeId: string;
    assigneeName: string;
    date: string;
    completedAt: string;
    items: { stockId: string; stockName: string; countedQty?: number }[];
}

// --- CONFIGURATION ---
const MAIN_CATEGORIES = [
    { id: 'ALL', label: '全部', icon: Filter, color: 'bg-gray-100 text-gray-600' },
    { id: 'KITCHEN', label: '厨房', icon: Utensils, color: 'bg-orange-100 text-orange-700' },
    { id: 'BAR', label: '水吧', icon: Coffee, color: 'bg-blue-100 text-blue-700' },
    { id: 'GENERAL', label: '后勤', icon: Wrench, color: 'bg-gray-100 text-gray-700' },
    { id: 'PACKAGING', label: '打包', icon: Package, color: 'bg-yellow-100 text-yellow-700' },
    { id: 'FUEL', label: '燃料', icon: Flame, color: 'bg-indigo-100 text-indigo-700' },
];

const KITCHEN_SUB_CATEGORIES = [
    { id: 'ALL', label: '全部' },
    { id: 'MEAT', label: '肉类' },
    { id: 'SEAFOOD', label: '海鲜' },
    { id: 'VEG', label: '蔬果' },
    { id: 'NOODLE', label: '面类' },
    { id: 'DRY', label: '干货' },
    { id: 'SAUCE', label: '酱料' },
    { id: 'HQ', label: '总店' },
];

const ITEMS_PER_PAGE = 10;

// --- INTERFACES ---
interface OrderDraftItem {
    stockId: string;
    qty: number;
    unit: string;
    price: number;
    ratio: number;
    selectedSupplierId?: string;
}

interface ReceivedItem extends PurchaseOrderItem {
    receivedQty: number;
    finalCost: number;
    billByWeight?: boolean;
    receivedWeight?: number;
}

const roundReceivePrice = (value: number, decimals: number = 4): number => {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

const getReceiveWeightUnitPrice = (item: PurchaseOrderItem): number => {
    const ratio = item.toBaseRatio ?? item.ratio ?? 1;
    const fallbackFromOrderUnit = ratio > 0 ? (item.cost || 0) / ratio : 0;
    return roundReceivePrice(
        item.billingUnitPrice
        ?? item.pricePerPricingUnit
        ?? item.costPerBaseUnitAtOrder
        ?? item.costPerBaseUnitAtReceive
        ?? fallbackFromOrderUnit
    );
};

const getReceiveOrderUnitPrice = (item: PurchaseOrderItem): number => roundReceivePrice(
    item.purchaseUnitCost ?? item.cost ?? 0
);

// --- 3-LAYER UNIT SYSTEM HELPERS ---
function getItemReplenishConfig(item: StockItem) {
    const currentQtyBase = getCurrentQtyBase(item);
    const minLevelBase = getMinLevelBase(item);
    const maxQtyBase = getMaxQtyBase(item);
    const displayToBaseRatio = getDisplayToBaseRatio(item);

    let replenishDisplayUnit = getBaseUnit(item);
    let replenishRatio = 1;
    let displayCurrentQty = currentQtyBase;
    let displayMinLevel = minLevelBase;
    let displayMaxQty = maxQtyBase;

    if (item.preferredStockViewUnit === 'DISPLAY' && displayToBaseRatio > 0) {
        replenishDisplayUnit = item.displayUnit || replenishDisplayUnit;
        replenishRatio = displayToBaseRatio;
        displayCurrentQty = currentQtyBase / displayToBaseRatio;
        displayMinLevel = minLevelBase / displayToBaseRatio;
        displayMaxQty = maxQtyBase / displayToBaseRatio;
    }

    // Fallback NaN checks to 0 for quantities
    if (isNaN(displayCurrentQty)) displayCurrentQty = 0;
    if (isNaN(displayMinLevel)) displayMinLevel = 0;
    if (isNaN(displayMaxQty)) displayMaxQty = 0;

    return {
        currentQtyBase,
        minLevelBase,
        maxQtyBase,
        replenishDisplayUnit,
        replenishRatio,
        displayCurrentQty,
        displayMinLevel,
        displayMaxQty
    };
}

function getReplenishmentUrgencyRatio(item: StockItem): number {
    const currentQtyBase = getCurrentQtyBase(item);
    const minLevelBase = getMinLevelBase(item);
    if (minLevelBase > 0) return currentQtyBase / minLevelBase;
    return currentQtyBase <= 0 ? 0 : Number.POSITIVE_INFINITY;
}

export const normalizeUnit = (value?: string): string => {
    return String(value || '').trim().toLowerCase();
};

export interface ResolvedProcurementPrice {
    unitName: string;
    purchaseUnitPrice: number;
    purchaseToBaseRatio: number;
    costPerBaseUnit: number;
    baseUnit: string;
    source:
        | 'SUPPLIER_PURCHASE_PRICE'
        | 'INVENTORY_PURCHASE_UNIT_PRICE'
        | 'SUPPLIER_BASE_COST'
        | 'INVENTORY_BASE_COST'
        | 'WEIGHT_BASED';
    isValid: boolean;
    warning?: string;
}

export function resolveProcurementPrice(
    item: StockItem,
    selectedUnit: string,
    catalogItem?: CatalogItem
): ResolvedProcurementPrice {
    const baseUnit = item.baseUnit || item.unit || 'pcs';
    const selectedUnitNorm = normalizeUnit(selectedUnit);
    
    // Determine the conversion mode (defaulting to FIXED if unspecified)
    const conversionMode = catalogItem?.conversionMode || item.conversionMode || 'FIXED';

    if (conversionMode === 'ACTUAL_WEIGHT') {
        const orderUnit = catalogItem?.purchaseUnit || item.purchaseUnit || 'pcs';
        const pricingUnit = catalogItem?.pricingUnit || item.pricingUnit || baseUnit || 'kg';
        const pricePerPricingUnit = catalogItem?.pricePerPricingUnit ?? item.pricePerPricingUnit ?? catalogItem?.price ?? item.costPerBaseUnit ?? 0;
        
        // Use estimatedWeightPerUnit or fallback to displayToBaseRatio for the conversion estimation
        const estimatedWeightPerUnit = catalogItem?.estimatedWeightPerUnit ?? item.displayToBaseRatio ?? 1;

        let purchaseUnitPrice = 0;
        let ratio = 1;
        let costPerBaseUnit = pricePerPricingUnit;

        if (selectedUnitNorm === normalizeUnit(orderUnit)) {
            purchaseUnitPrice = pricePerPricingUnit * estimatedWeightPerUnit;
            ratio = estimatedWeightPerUnit;
        } else if (selectedUnitNorm === normalizeUnit(pricingUnit)) {
            purchaseUnitPrice = pricePerPricingUnit;
            ratio = 1;
        } else {
            let foundRatio = 1;
            if (item.displayUnit && normalizeUnit(item.displayUnit) === selectedUnitNorm) {
                foundRatio = item.displayToBaseRatio || 1;
            } else if (item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
                const foundPU = item.purchaseUnits.find(pu => normalizeUnit(pu.unitName) === selectedUnitNorm);
                if (foundPU) foundRatio = foundPU.toBaseRatio || 1;
            }
            purchaseUnitPrice = pricePerPricingUnit * foundRatio;
            ratio = foundRatio;
        }

        const isValid = pricePerPricingUnit > 0;

        return {
            unitName: selectedUnit,
            purchaseUnitPrice: purchaseUnitPrice,
            purchaseToBaseRatio: ratio,
            costPerBaseUnit: costPerBaseUnit,
            baseUnit,
            source: 'WEIGHT_BASED',
            isValid,
            warning: isValid ? undefined : "未设定计价单位单价"
        };
    }

    // 1. Resolve ratio for FIXED mode
    let ratio = 1;
    if (selectedUnitNorm === normalizeUnit(baseUnit) || selectedUnitNorm === normalizeUnit(item.unit)) {
        ratio = 1;
    } else if (item.displayUnit && normalizeUnit(item.displayUnit) === selectedUnitNorm) {
        ratio = item.displayToBaseRatio || 1;
    } else if (item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
        const foundPU = item.purchaseUnits.find(pu => normalizeUnit(pu.unitName) === selectedUnitNorm);
        if (foundPU) {
            ratio = foundPU.toBaseRatio || 1;
        }
    } else if (item.uomOptions && Array.isArray(item.uomOptions)) {
        const found = item.uomOptions.find(u => normalizeUnit(u.value) === selectedUnitNorm);
        if (found) {
            ratio = found.ratio || 1;
        }
    }
    
    if (ratio <= 0 || isNaN(ratio) || !isFinite(ratio)) {
        ratio = 1;
    }

    // Dynamic, self-healing catalog base cost resolution
    let resolvedCatalogBaseCost: number | null = null;
    let directPrice: number | undefined = undefined;

    if (catalogItem) {
        const catUnit = catalogItem.purchaseUnitName || catalogItem.unit;
        const catUnitNorm = normalizeUnit(catUnit);
        
        let catPrice = 0;
        const catDyn = catalogItem as any;
        if (catalogItem.pricePerPurchaseUnit && catalogItem.pricePerPurchaseUnit > 0) {
            catPrice = catalogItem.pricePerPurchaseUnit;
        } else if (catDyn.purchaseUnitCost && catDyn.purchaseUnitCost > 0) {
            catPrice = catDyn.purchaseUnitCost;
        } else if (catalogItem.price && catalogItem.price > 0) {
            catPrice = catalogItem.price;
        }

        if (catPrice > 0) {
            let catToBaseRatio = 1;
            if (catUnitNorm === normalizeUnit(baseUnit)) {
                catToBaseRatio = 1;
            } else if (item.displayUnit && normalizeUnit(item.displayUnit) === catUnitNorm) {
                catToBaseRatio = item.displayToBaseRatio || 1;
            } else if (item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
                const foundPU = item.purchaseUnits.find(pu => normalizeUnit(pu.unitName) === catUnitNorm);
                if (foundPU) {
                    catToBaseRatio = foundPU.toBaseRatio || 1;
                }
            } else if (item.uomOptions && Array.isArray(item.uomOptions)) {
                const found = item.uomOptions.find(u => normalizeUnit(u.value) === catUnitNorm);
                if (found) {
                    catToBaseRatio = found.ratio || 1;
                }
            }

            if (catToBaseRatio > 0) {
                resolvedCatalogBaseCost = catPrice / catToBaseRatio;
            }

            if (catUnitNorm === selectedUnitNorm) {
                directPrice = catPrice;
            }
        }
    }

    const itemCostPerBase = item.costPerBaseUnit ?? item.cost ?? 0;
    const baselinePrice = itemCostPerBase * ratio;

    let purchaseUnitPrice = 0;
    let costPerBaseUnit = 0;
    let source: ResolvedProcurementPrice['source'] = 'INVENTORY_BASE_COST';
    let warning: string | undefined = undefined;

    if (directPrice !== undefined && directPrice > 0) {
        purchaseUnitPrice = directPrice;
        costPerBaseUnit = resolvedCatalogBaseCost ?? (ratio > 0 ? directPrice / ratio : 0);
        source = 'SUPPLIER_PURCHASE_PRICE';
    } else if (resolvedCatalogBaseCost !== null && resolvedCatalogBaseCost > 0) {
        purchaseUnitPrice = resolvedCatalogBaseCost * ratio;
        costPerBaseUnit = resolvedCatalogBaseCost;
        source = 'SUPPLIER_BASE_COST';
    } else {
        let invPUPrice: number | undefined = undefined;
        if (item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
            const foundPU = item.purchaseUnits.find(pu => normalizeUnit(pu.unitName) === selectedUnitNorm);
            if (foundPU && foundPU.pricePerUnit && foundPU.pricePerUnit > 0) {
                invPUPrice = foundPU.pricePerUnit;
            }
        }

        if (invPUPrice !== undefined && invPUPrice > 0) {
            purchaseUnitPrice = invPUPrice;
            costPerBaseUnit = ratio > 0 ? invPUPrice / ratio : 0;
            source = 'INVENTORY_PURCHASE_UNIT_PRICE';
        } else {
            purchaseUnitPrice = itemCostPerBase * ratio;
            costPerBaseUnit = itemCostPerBase;
            source = 'INVENTORY_BASE_COST';
        }
    }

    let isValid = true;
    if (purchaseUnitPrice <= 0 || isNaN(purchaseUnitPrice) || !isFinite(purchaseUnitPrice)) {
        isValid = false;
        warning = "价格资料异常：无有效采购单价";
    }
    
    if (ratio <= 0 || isNaN(ratio) || !isFinite(ratio)) {
        isValid = false;
        warning = "价格资料异常：无效的换算比例";
    }

    if (isValid && baselinePrice > 0 && (source === 'SUPPLIER_PURCHASE_PRICE' || source === 'SUPPLIER_BASE_COST')) {
        if (purchaseUnitPrice > baselinePrice * 5) {
            warning = `价格异常高：超出库存推算价5倍 (RM ${purchaseUnitPrice.toFixed(2)} vs RM ${baselinePrice.toFixed(2)})`;
        } else if (purchaseUnitPrice < baselinePrice * 0.2) {
            warning = `价格异常低：低于库存推算价20% (RM ${purchaseUnitPrice.toFixed(2)} vs RM ${baselinePrice.toFixed(2)})`;
        }
    }

    return {
        unitName: selectedUnit,
        purchaseUnitPrice: isNaN(purchaseUnitPrice) || !isFinite(purchaseUnitPrice) ? 0 : purchaseUnitPrice,
        purchaseToBaseRatio: ratio,
        costPerBaseUnit: isNaN(costPerBaseUnit) || !isFinite(costPerBaseUnit) ? 0 : costPerBaseUnit,
        baseUnit,
        source,
        isValid,
        warning
    };
}

function getUnitOptionsForItem(item: StockItem, catalogItem?: CatalogItem) {
    const optionsMap = new Map<string, { label: string, value: string, ratio: number, price?: number }>();

    // 1. baseUnit / item.unit
    const baseU = item.baseUnit || item.unit || 'pcs';
    const resolvedBase = resolveProcurementPrice(item, baseU, catalogItem);
    optionsMap.set(baseU, { 
        label: baseU, 
        value: baseU, 
        ratio: 1, 
        price: resolvedBase.purchaseUnitPrice 
    });

    // 2. displayUnit
    if (item.displayUnit) {
        const resolvedDisp = resolveProcurementPrice(item, item.displayUnit, catalogItem);
        optionsMap.set(item.displayUnit, {
            label: item.displayUnit,
            value: item.displayUnit,
            ratio: resolvedDisp.purchaseToBaseRatio,
            price: resolvedDisp.purchaseUnitPrice
        });
    }

    // 3. purchaseUnits
    if (item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
        item.purchaseUnits.forEach(pu => {
            if (pu.unitName) {
                const resolvedPU = resolveProcurementPrice(item, pu.unitName, catalogItem);
                optionsMap.set(pu.unitName, {
                    label: pu.unitName,
                    value: pu.unitName,
                    ratio: resolvedPU.purchaseToBaseRatio,
                    price: resolvedPU.purchaseUnitPrice
                });
            }
        });
    }

    // Legacy support
    if (item.uomOptions && Array.isArray(item.uomOptions)) {
        item.uomOptions.forEach(u => {
            if (u.value) {
                const resolvedU = resolveProcurementPrice(item, u.value, catalogItem);
                optionsMap.set(u.value, {
                    label: u.label || u.value,
                    value: u.value,
                    ratio: resolvedU.purchaseToBaseRatio,
                    price: resolvedU.purchaseUnitPrice
                });
            }
        });
    }

    return Array.from(optionsMap.values());
}

function getDefaultReplenishUnit(item: StockItem, catalogItem?: CatalogItem) {
    let defaultUnitName = item.baseUnit || item.unit || 'pcs';
    
    if (item.defaultPurchaseUnitId && item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
        const found = item.purchaseUnits.find(pu => pu.id === item.defaultPurchaseUnitId);
        if (found && found.unitName) {
            defaultUnitName = found.unitName;
        }
    } else if (item.purchaseUnits && Array.isArray(item.purchaseUnits)) {
        const found = item.purchaseUnits.find(pu => pu.isDefaultPurchase);
        if (found && found.unitName) {
            defaultUnitName = found.unitName;
        }
    } else if (item.displayUnit) {
        defaultUnitName = item.displayUnit;
    }

    if (catalogItem && catalogItem.pricingMode === 'WEIGHT_BASED' && catalogItem.orderUnit) {
        defaultUnitName = catalogItem.orderUnit;
    }

    const resolved = resolveProcurementPrice(item, defaultUnitName, catalogItem);
    return {
        unit: resolved.unitName,
        ratio: resolved.purchaseToBaseRatio,
        price: resolved.purchaseUnitPrice
    };
}

function getPriceForUnit(item: StockItem, unitName: string, catalogItem?: CatalogItem): number {
    const resolved = resolveProcurementPrice(item, unitName, catalogItem);
    return resolved.purchaseUnitPrice;
}

export const ProcurementModule: React.FC<ProcurementModuleProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'REPLENISH' | 'ORDERS'>('REPLENISH');
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshingForSmartFill, setIsRefreshingForSmartFill] = useState(false);
    const [stocktakeCompletions, setStocktakeCompletions] = useState<InventoryStocktakeCompletion[]>([]);
    const [isLoadingStocktakes, setIsLoadingStocktakes] = useState(false);
    
    const [activeCategory, setActiveCategory] = useState<string>('ALL');
    const [activeSubCategory, setActiveSubCategory] = useState<string>('ALL');
    const [filterLowStock, setFilterLowStock] = useState(false); 
    const [searchTerm, setSearchTerm] = useState('');
    
    const [activeSupplierFilter, setActiveSupplierFilter] = useState<string | null>(null);
    const [supplierMenuSearch, setSupplierMenuSearch] = useState('');

    const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraftItem>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [showCartDetail, setShowCartDetail] = useState(false);
    
    const [isSmartFillMenuOpen, setIsSmartFillMenuOpen] = useState(false);
    const [showSupplierSelectorMap, setShowSupplierSelectorMap] = useState<Record<string, boolean>>({});

    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
    const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
    const [receiveTax, setReceiveTax] = useState<number>(0);
    const [receiveDelivery, setReceiveDelivery] = useState<number>(0);
    const [isProcessingReceive, setIsProcessingReceive] = useState(false);

    const [printingPO, setPrintingPO] = useState<PurchaseOrder | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const [deletePOCandidate, setDeletePOCandidate] = useState<string | null>(null);

    const [visibleOrderCount, setVisibleOrderCount] = useState(15);
    const [orderDateFilter, setOrderDateFilter] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    // Always return a fresh inventory snapshot before smart replenishment.
    // This connects a staff stocktake result to management ordering without polling Firestore.
    const loadLatestStock = useCallback(async (): Promise<StockItem[]> => {
        const [kitchen, bar, general, fuel] = await Promise.all([
            DataManager.getStock('KITCHEN'),
            DataManager.getStock('BAR'),
            DataManager.getStock('GENERAL'),
            DataManager.getStock('FUEL'),
        ]);
        const latestStock = [...kitchen, ...bar, ...general, ...fuel].sort(
            (a, b) => getReplenishmentUrgencyRatio(a) - getReplenishmentUrgencyRatio(b)
        );
        setStockItems(latestStock);
        return latestStock;
    }, []);

    const loadTodayStocktakeCompletions = useCallback(async (): Promise<InventoryStocktakeCompletion[]> => {
        setIsLoadingStocktakes(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const rawCompletions = await DataManager.getTaskCompletions(today);
            const completions = (rawCompletions as unknown as InventoryStocktakeCompletion[])
                .filter(completion => Array.isArray(completion.items) && Boolean(completion.completedAt))
                .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                .slice(0, 5);
            setStocktakeCompletions(completions);
            return completions;
        } catch (error) {
            console.error('Failed to load stocktake completions', error);
            setStocktakeCompletions([]);
            return [];
        } finally {
            setIsLoadingStocktakes(false);
        }
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [, sup, pos] = await Promise.all([
            loadLatestStock(),
            DataManager.getSuppliers(),
            DataManager.getPurchaseOrders(),
            loadTodayStocktakeCompletions()
        ]);

            setSuppliers(sup);
            setPurchaseOrders(pos.sort((a,b) => b.id.localeCompare(a.id)).slice(0, 50));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- HELPER: FIND SUPPLIER ---
    const findAllSuppliersForStock = useCallback((stockId: string): { supplier: Supplier, catalogItem: CatalogItem }[] => {
        const results: { supplier: Supplier, catalogItem: CatalogItem }[] = [];
        for (const sup of suppliers) {
            if (sup.catalog) {
                const match = sup.catalog.find(c => c.linkedStockId === stockId);
                if (match) results.push({ supplier: sup, catalogItem: match });
            }
        }
        return results;
    }, [suppliers]);

    const findSupplierForStock = useCallback((stockId: string) => {
        const all = findAllSuppliersForStock(stockId);
        return all.length > 0 ? all[0] : null;
    }, [findAllSuppliersForStock]);

    const resolveSupplierForDraft = useCallback((draft: OrderDraftItem): { supplier: Supplier, catalogItem: CatalogItem } | null => {
        if (draft.selectedSupplierId) {
            const sup = suppliers.find(s => s.id === draft.selectedSupplierId);
            const catalogItem = sup?.catalog?.find(c => c.linkedStockId === draft.stockId);
            if (sup && catalogItem) return { supplier: sup, catalogItem };
        }
        return findSupplierForStock(draft.stockId);
    }, [suppliers, findSupplierForStock]);

    // --- SUPPLIER LOW STOCK COUNTS ---
    const supplierLowStockCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        suppliers.forEach(s => counts[s.id] = 0);
        
        stockItems.forEach(item => {
            if (needsReplenishment(item)) {
                const allMatches = findAllSuppliersForStock(item.id);
                allMatches.forEach(({ supplier }) => {
                    counts[supplier.id] = (counts[supplier.id] || 0) + 1;
                });
            }
        });
        return counts;
    }, [stockItems, suppliers, findAllSuppliersForStock]);

    const menuSuppliers = useMemo(() => {
        return suppliers.filter(s => {
            const isSynced = s.catalog?.some(c => c.linkedStockId);
            if (!isSynced) return false;
            if (!supplierMenuSearch) return true;
            const term = supplierMenuSearch.toLowerCase();
            return s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
        });
    }, [suppliers, supplierMenuSearch]);

    // --- FILTER LOGIC ---
    const filteredStock = useMemo(() => {
        let list = stockItems;

        if (activeSupplierFilter) {
            list = list.filter(i => {
                const allM = findAllSuppliersForStock(i.id);
                return allM.some(m => m.supplier.id === activeSupplierFilter);
            });
        } else {
            if (activeCategory === 'KITCHEN') {
                list = list.filter(i => i.id.startsWith('K') || ['MEAT','SEAFOOD','VEG','NOODLE','DRY','SAUCE','HQ','FRESH'].includes(i.category));
                if (activeSubCategory !== 'ALL') {
                    list = list.filter(i => i.category === activeSubCategory);
                }
            } else if (activeCategory === 'BAR') {
                list = list.filter(i => i.id.startsWith('B') || ['TEA','FRUIT','RTD','MISC','DRINK'].includes(i.category));
            } else if (activeCategory === 'GENERAL') {
                list = list.filter(i => (i.id.startsWith('S') || i.id.startsWith('G')) && i.category !== 'PACKAGING');
            } else if (activeCategory === 'PACKAGING') {
                list = list.filter(i => i.category === 'PACKAGING');
            } else if (activeCategory === 'FUEL') {
                list = list.filter(i => ['GAS','CHARCOAL','OIL'].includes(i.category));
            }
        }

        if (filterLowStock) {
            list = list.filter(needsReplenishment);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(i => i.name.toLowerCase().includes(lower) || i.id.toLowerCase().includes(lower));
        }
        return list;
    }, [stockItems, activeCategory, activeSubCategory, filterLowStock, searchTerm, activeSupplierFilter, findAllSuppliersForStock]);

    // --- DRAFT HANDLERS ---
    const updateDraft = useCallback((stockId: string, field: keyof OrderDraftItem, value: any, baseItem: StockItem) => {
        setOrderDrafts(prev => {
            let newSupplierId = prev[stockId]?.selectedSupplierId;
            if (field === 'selectedSupplierId') {
                newSupplierId = value;
            }

            // Resolve catalog item for the selected supplier (if any)
            let catalogItem: CatalogItem | undefined;
            if (newSupplierId) {
                const sup = suppliers.find(s => s.id === newSupplierId);
                catalogItem = sup?.catalog?.find(c => c.linkedStockId === stockId);
            } else {
                const match = findSupplierForStock(stockId);
                if (match) {
                    catalogItem = match.catalogItem;
                    newSupplierId = match.supplier.id;
                }
            }

            const defInfo = getDefaultReplenishUnit(baseItem, catalogItem);
            const current = prev[stockId] || { stockId, qty: 0, unit: defInfo.unit, price: defInfo.price, ratio: defInfo.ratio };
            
            let newUnit = current.unit || defInfo.unit;
            let newQty = current.qty;

            if (field === 'unit') {
                newUnit = value;
            } else if (field === 'qty') {
                newQty = value < 0 ? 0 : value;
            }

            const resolved = resolveProcurementPrice(baseItem, newUnit, catalogItem);

            const updated = {
                ...current,
                unit: newUnit,
                qty: newQty,
                ratio: resolved.purchaseToBaseRatio,
                price: resolved.purchaseUnitPrice,
                selectedSupplierId: newSupplierId
            };

            return { ...prev, [stockId]: updated };
        });
    }, [suppliers, findSupplierForStock]);

    // =====================================================
    // 🔧 FIX: handleQuickAdd - 之前缺失导致数量无法更改
    // =====================================================
    const handleQuickAdd = useCallback((item: StockItem, delta: number) => {
        setOrderDrafts(prev => {
            // Ensure price is correct for current unit and selected supplier
            let selectedSupplierId = prev[item.id]?.selectedSupplierId;
            let catalogItem: CatalogItem | undefined;
            if (selectedSupplierId) {
                const sup = suppliers.find(s => s.id === selectedSupplierId);
                catalogItem = sup?.catalog?.find(c => c.linkedStockId === item.id);
            } else {
                const match = findSupplierForStock(item.id);
                if (match) {
                    catalogItem = match.catalogItem;
                    selectedSupplierId = match.supplier.id;
                }
            }

            const defInfo = getDefaultReplenishUnit(item, catalogItem);
            const current = prev[item.id] || { stockId: item.id, qty: 0, unit: defInfo.unit, price: defInfo.price, ratio: defInfo.ratio };
            const newQty = Math.max(0, current.qty + delta);
            const resolved = resolveProcurementPrice(item, current.unit || defInfo.unit, catalogItem);

            return {
                ...prev,
                [item.id]: {
                    ...current,
                    unit: current.unit || defInfo.unit,
                    qty: newQty,
                    price: resolved.purchaseUnitPrice,
                    ratio: resolved.purchaseToBaseRatio,
                    selectedSupplierId
                }
            };
        });
    }, [suppliers, findSupplierForStock]);

    const updateDraftSupplier = useCallback((stockId: string, supplierId: string, catalogItem: CatalogItem, baseItem: StockItem) => {
        setOrderDrafts(prev => {
            const defInfo = getDefaultReplenishUnit(baseItem, catalogItem);
            const current = prev[stockId] || { stockId, qty: 1, unit: defInfo.unit, price: defInfo.price, ratio: defInfo.ratio };
            
            const resolved = resolveProcurementPrice(baseItem, current.unit, catalogItem);
            return {
                ...prev,
                [stockId]: {
                    ...current,
                    selectedSupplierId: supplierId,
                    price: resolved.purchaseUnitPrice,
                    ratio: resolved.purchaseToBaseRatio
                }
            };
        });
    }, []);

    const executeStocktakeFill = useCallback(async (completion: InventoryStocktakeCompletion) => {
        if (isRefreshingForSmartFill) return;
        setIsRefreshingForSmartFill(true);

        try {
            const latestStockItems = await loadLatestStock();
            const completedStockIds = new Set(completion.items.map(item => item.stockId));
            const lowItems = latestStockItems.filter(item => completedStockIds.has(item.id) && needsReplenishment(item));

            setActiveSupplierFilter(null);
            setActiveCategory('ALL');
            setActiveSubCategory('ALL');
            setSearchTerm('');
            setFilterLowStock(true);

            if (lowItems.length === 0) {
                alert(`✅ ${completion.assigneeName} 的这次盘点没有发现低于安全库存的物品。`);
                return;
            }

            const newDrafts = { ...orderDrafts };
            let addedCount = 0;

            lowItems.forEach(item => {
                const { currentQtyBase, minLevelBase, maxQtyBase } = getItemReplenishConfig(item);
                const match = findSupplierForStock(item.id);
                const catalogItem = match?.catalogItem;
                const defInfo = getDefaultReplenishUnit(item, catalogItem);
                const ratio = defInfo.ratio || 1;
                const currentQtyInUnit = currentQtyBase / ratio;
                const maxQtyInUnit = maxQtyBase > 0
                    ? maxQtyBase / ratio
                    : ((minLevelBase > 0 ? minLevelBase * 2 : 30) / ratio);
                const targetQty = Math.max(1, Math.ceil(maxQtyInUnit - currentQtyInUnit));

                if (!newDrafts[item.id] || newDrafts[item.id].qty === 0) {
                    const resolved = resolveProcurementPrice(item, defInfo.unit, catalogItem);
                    newDrafts[item.id] = {
                        stockId: item.id,
                        qty: targetQty,
                        unit: defInfo.unit,
                        price: resolved.purchaseUnitPrice,
                        ratio: resolved.purchaseToBaseRatio,
                        selectedSupplierId: match?.supplier.id
                    };
                    addedCount++;
                }
            });

            setOrderDrafts(newDrafts);
            if (addedCount > 0) {
                alert(`✅ 已根据 ${completion.assigneeName} 的盘点结果加入 ${addedCount} 个补货物品。`);
            } else {
                alert('这些缺货物品已经在采购清单中，无需重复加入。');
            }
        } catch (error) {
            console.error('Failed to replenish from stocktake completion', error);
            alert('读取最新盘点结果失败，请检查网络后重试。');
        } finally {
            setIsRefreshingForSmartFill(false);
        }
    }, [isRefreshingForSmartFill, loadLatestStock, orderDrafts, findSupplierForStock]);

    // --- SMART FILL ---
    const executeSmartFill = useCallback(async (type: 'CATEGORY' | 'SUPPLIER', targetId: string, subTarget?: string) => {
        if (isRefreshingForSmartFill) return;
        setIsRefreshingForSmartFill(true);

        try {
        // Read the quantities submitted by the latest stocktake immediately before calculating.
        const latestStockItems = await loadLatestStock();
        let targetItems: StockItem[] = [];

        if (type === 'CATEGORY') {
            setActiveSupplierFilter(null);
            if (targetId === 'ALL') {
                targetItems = latestStockItems;
            } else if (targetId === 'KITCHEN') {
                targetItems = latestStockItems.filter(i => i.id.startsWith('K') || ['MEAT','SEAFOOD','VEG','NOODLE','DRY','SAUCE','HQ','FRESH'].includes(i.category));
                if (subTarget) targetItems = targetItems.filter(i => i.category === subTarget);
            } else if (targetId === 'BAR') {
                targetItems = latestStockItems.filter(i => i.id.startsWith('B') || ['TEA','FRUIT','RTD','MISC','DRINK'].includes(i.category));
            } else if (targetId === 'GENERAL') {
                targetItems = latestStockItems.filter(i => i.id.startsWith('S') || i.id.startsWith('G') || i.category === 'PACKAGING');
            } else if (targetId === 'FUEL') {
                targetItems = latestStockItems.filter(i => ['GAS','CHARCOAL','OIL'].includes(i.category));
            }
        } else if (type === 'SUPPLIER') {
            const supplier = suppliers.find(s => s.id === targetId);
            if (!supplier) return;
            
            targetItems = latestStockItems.filter(i => {
                const allM = findAllSuppliersForStock(i.id);
                return allM.some(m => m.supplier.id === targetId);
            });
        }

        const lowItems = targetItems.filter(needsReplenishment);

        if (lowItems.length === 0) {
            setIsSmartFillMenuOpen(false);
            alert(`✅ ${type === 'SUPPLIER' ? '该供应商' : '该区域'} 暂无缺货商品。\n(No low stock items found)`);
            
            if (type === 'SUPPLIER') {
                setFilterLowStock(false);
                setActiveSupplierFilter(targetId);
                setSearchTerm('');
            }
            return;
        }
        
        const newDrafts = { ...orderDrafts };
        let addedCount = 0;

        lowItems.forEach(item => {
            const {
                currentQtyBase,
                minLevelBase,
                maxQtyBase
            } = getItemReplenishConfig(item);

            // Determine supplier pricing
            let catalogItem: CatalogItem | undefined;
            const match = findSupplierForStock(item.id);
            if (match) {
                catalogItem = match.catalogItem;
            }

            const defInfo = getDefaultReplenishUnit(item, catalogItem);
            const ratio = defInfo.ratio || 1;
            const currentQtyInUnit = currentQtyBase / ratio;
            const maxQtyInUnit = maxQtyBase > 0 ? (maxQtyBase / ratio) : ((minLevelBase > 0 ? minLevelBase * 2 : 30) / ratio);
            
            const targetQty = Math.max(1, Math.ceil(maxQtyInUnit - currentQtyInUnit));
            
            if (!newDrafts[item.id] || newDrafts[item.id].qty === 0) {
                const resolved = resolveProcurementPrice(item, defInfo.unit, catalogItem);

                newDrafts[item.id] = {
                    stockId: item.id,
                    qty: targetQty,
                    unit: defInfo.unit,
                    price: resolved.purchaseUnitPrice,
                    ratio: resolved.purchaseToBaseRatio,
                    selectedSupplierId: match?.supplier.id
                };
                addedCount++;
            }
        });

        setOrderDrafts(newDrafts);
        setIsSmartFillMenuOpen(false);

        if (type === 'CATEGORY') {
            setFilterLowStock(true);
            if (targetId !== 'ALL') {
                setActiveCategory(targetId);
                if (subTarget && targetId === 'KITCHEN') setActiveSubCategory(subTarget);
            }
        } else if (type === 'SUPPLIER') {
            setFilterLowStock(false);
            setActiveSupplierFilter(targetId);
            setSearchTerm('');
        }

        const targetName = type === 'SUPPLIER' 
            ? suppliers.find(s => s.id === targetId)?.name 
            : `${targetId} ${subTarget ? `(${subTarget})` : ''}`;

        alert(`⚡️ 已为 [${targetName}] 自动添加 ${addedCount} 个缺货物品！`);
        } catch (error) {
            console.error('Failed to refresh inventory before smart replenishment', error);
            alert('读取最新盘点数量失败，请检查网络后重试。');
        } finally {
            setIsRefreshingForSmartFill(false);
        }
    }, [isRefreshingForSmartFill, loadLatestStock, suppliers, orderDrafts, findAllSuppliersForStock, findSupplierForStock]);

    // --- GENERATE POs ---
    const handleGeneratePOs = async () => {
        const entries = (Object.values(orderDrafts) as OrderDraftItem[]).filter(draft => draft.qty > 0);
        if (entries.length === 0) return alert("请先选择商品 (Please select items)");

        setIsGenerating(true);
        
        const supplierGroups = new Map<string, { supplier: Supplier, items: PurchaseOrderItem[] }>();
        const adhocItems: PurchaseOrderItem[] = [];
        
        for (const draft of entries) {
            const match = resolveSupplierForDraft(draft);
            const stockItem = stockItems.find(s => s.id === draft.stockId);
            if (!stockItem) continue;

            const pUnits = stockItem.purchaseUnits || [];
            const selectedPU = pUnits.find(p => p.unitName === draft.unit);
            
            const defaultPurchaseUnitId = selectedPU?.id;
            const defaultPurchaseUnitName = selectedPU?.unitName || draft.unit;
            const defaultToBaseRatio = selectedPU?.toBaseRatio ?? draft.ratio ?? 1;
            
            if (match) {
                const { supplier, catalogItem: rawCatalogItem } = match;
                const catalog = normalizeCatalogItem(rawCatalogItem, stockItems);
                
                const purchaseUnitId = catalog.linkedPurchaseUnitId || defaultPurchaseUnitId;
                const isWeightBased = catalog.pricingMode === 'WEIGHT_BASED' || rawCatalogItem?.conversionMode === 'ACTUAL_WEIGHT' || stockItem.conversionMode === 'ACTUAL_WEIGHT';
                
                const resolved = resolveProcurementPrice(stockItem, draft.unit, rawCatalogItem);
                const orderQty = draft.qty;
                const totalCost = orderQty * resolved.purchaseUnitPrice;
                const costPerBaseUnitAtOrder = resolved.costPerBaseUnit;
                
                if (!supplierGroups.has(supplier.id)) {
                    supplierGroups.set(supplier.id, { supplier, items: [] });
                }
                
                supplierGroups.get(supplier.id)!.items.push({
                    stockId: catalog.id,
                    name: catalog.name,
                    orderQty: orderQty,
                    unit: resolved.unitName,
                    ratio: resolved.purchaseToBaseRatio,
                    cost: resolved.purchaseUnitPrice,
                    supplierCode: catalog.supplierCode || '',
                    purchaseUnitId,
                    purchaseUnitName: resolved.unitName,
                    toBaseRatio: resolved.purchaseToBaseRatio,
                    costPerBaseUnitAtReceive: catalog.costPerBaseUnit || costPerBaseUnitAtOrder,
                    conversionMode: rawCatalogItem?.conversionMode || stockItem.conversionMode || 'FIXED',
                    
                    // Explicit 3-layer procurement fields
                    purchaseUnitQty: orderQty,
                    purchaseUnitCost: resolved.purchaseUnitPrice,
                    purchaseUnitToBaseRatio: resolved.purchaseToBaseRatio,
                    baseUnit: resolved.baseUnit,
                    baseQty: orderQty * resolved.purchaseToBaseRatio,
                    costPerBaseUnitAtOrder: costPerBaseUnitAtOrder,
                    totalCost: totalCost,
                    
                    pricingMode: catalog.pricingMode,
                    orderUnit: catalog.orderUnit,
                    billingUnit: catalog.billingUnit,
                    billingUnitPrice: catalog.pricePerBillingUnit,
                    estimatedWeightPerUnit: catalog.estimatedWeightPerUnit || stockItem.displayToBaseRatio || 1,
                    estimatedBaseQty: isWeightBased ? (orderQty * (catalog.estimatedWeightPerUnit || stockItem.displayToBaseRatio || 1)) : undefined
                });
            } else {
                const resolved = resolveProcurementPrice(stockItem, draft.unit);
                const orderQty = draft.qty;
                const totalCost = orderQty * resolved.purchaseUnitPrice;
                const costPerBaseUnitAtOrder = resolved.costPerBaseUnit;
                const isWeightBased = stockItem.conversionMode === 'ACTUAL_WEIGHT';

                adhocItems.push({
                    stockId: draft.stockId,
                    name: stockItem.name || draft.stockId,
                    orderQty: orderQty,
                    unit: resolved.unitName,
                    ratio: resolved.purchaseToBaseRatio,
                    cost: resolved.purchaseUnitPrice,
                    supplierCode: 'N/A',
                    purchaseUnitId: defaultPurchaseUnitId,
                    purchaseUnitName: resolved.unitName,
                    toBaseRatio: resolved.purchaseToBaseRatio,
                    conversionMode: stockItem.conversionMode || 'FIXED',
                    
                    // Explicit 3-layer procurement fields
                    purchaseUnitQty: orderQty,
                    purchaseUnitCost: resolved.purchaseUnitPrice,
                    purchaseUnitToBaseRatio: resolved.purchaseToBaseRatio,
                    baseUnit: resolved.baseUnit,
                    baseQty: orderQty * resolved.purchaseToBaseRatio,
                    costPerBaseUnitAtOrder: costPerBaseUnitAtOrder,
                    totalCost: totalCost,
                    
                    pricingMode: isWeightBased ? 'WEIGHT_BASED' : undefined,
                    billingUnit: isWeightBased ? resolved.baseUnit : undefined,
                    billingUnitPrice: isWeightBased ? resolved.purchaseUnitPrice : undefined,
                    estimatedWeightPerUnit: isWeightBased ? resolved.purchaseToBaseRatio : undefined,
                    estimatedBaseQty: isWeightBased ? (orderQty * resolved.purchaseToBaseRatio) : undefined
                });
            }
        }

        if (supplierGroups.size === 0 && adhocItems.length === 0) {
            setIsGenerating(false);
            return;
        }

        const latestPOs = await DataManager.getPurchaseOrders();
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayPrefix = `PO${year}${month}${day}`;
        
        const existingTodayPOs = latestPOs.filter(p => p.id.startsWith(todayPrefix));
        let maxSuffix = 0;
        existingTodayPOs.forEach(p => { 
            const suffixStr = p.id.replace(todayPrefix, '');
            const suffix = parseInt(suffixStr, 10); 
            if (!isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix; 
        });

        let currentSuffix = maxSuffix + 1;
        const newPOs: PurchaseOrder[] = [];

        const savedSession = localStorage.getItem('kepong_erp_session_employee');
        const currentCreator = savedSession ? JSON.parse(savedSession).name : 'Admin';

        for (const { supplier, items } of supplierGroups.values()) {
            const nextId = `${todayPrefix}${String(currentSuffix).padStart(3, '0')}`;
            const total = items.reduce((sum, i) => sum + (i.orderQty * i.cost), 0);

            const newPO: PurchaseOrder = {
                id: nextId,
                supplierId: supplier.id,
                supplierName: supplier.name,
                date: now.toISOString(),
                status: 'ORDERED',
                items: items,
                totalEstimated: total,
                createdBy: currentCreator
            };
            
            const cleanPO = JSON.parse(JSON.stringify(newPO));
            await DataManager.savePurchaseOrder(cleanPO);
            newPOs.push(cleanPO);
            currentSuffix++;
        }

        if (adhocItems.length > 0) {
            const nextId = `${todayPrefix}${String(currentSuffix).padStart(3, '0')}`;
            const total = adhocItems.reduce((sum, i) => sum + (i.orderQty * i.cost), 0);

            const newPO: PurchaseOrder = {
                id: nextId,
                supplierId: 'ADHOC_MARKET',
                supplierName: '通用采购 / 自购 (General Market)',
                date: now.toISOString(),
                status: 'ORDERED',
                items: adhocItems,
                totalEstimated: total,
                createdBy: currentCreator
            };
            
            const cleanPO = JSON.parse(JSON.stringify(newPO));
            await DataManager.savePurchaseOrder(cleanPO);
            newPOs.push(cleanPO);
            currentSuffix++;
        }

        setPurchaseOrders([...newPOs, ...latestPOs].slice(0, 50));
        setOrderDrafts({});
        setIsGenerating(false);
        setActiveTab('ORDERS');
        setVisibleOrderCount(15);
        setActiveSupplierFilter(null);
        setFilterLowStock(false);
        alert(`✅ 成功生成 ${newPOs.length} 张采购单！`);
    };

    // --- SHARED ACTIONS ---
    const sendWhatsapp = useCallback((po: PurchaseOrder) => {
        const supplier = suppliers.find(s => s.id === po.supplierId);
        if (!supplier || !supplier.contact) return alert("供应商无电话号码 (或为自购单)");
        const phone = supplier.contact.replace(/\D/g, '');
        let text = `*PURCHASE ORDER: ${po.id}*\nTo: ${po.supplierName}\nDate: ${po.date.split('T')[0]}\n\n*ITEMS:*\n`;
        po.items.forEach((item, i) => { text += `${i+1}. ${item.name} ${item.supplierCode ? `[${item.supplierCode}]` : ''}\n   Qty: ${item.orderQty} ${item.unit}\n`; });
        text += `\nPlease confirm delivery. Thank you!\n- Kim Lian Kee`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    }, [suppliers]);

    // --- PDF ---
    const handlePrintPDF = async (po: PurchaseOrder) => {
        setPrintingPO(po);
        setIsGeneratingPdf(true);
        await new Promise(resolve => setTimeout(resolve, 800));

        const pdf = new jsPDF('p', 'mm', 'a4');
        const totalPages = Math.ceil(po.items.length / ITEMS_PER_PAGE);

        try {
            for (let i = 0; i < totalPages; i++) {
                const element = document.getElementById(`po-page-${i}`);
                if (!element) continue;
                if (i > 0) pdf.addPage();
                
                const canvas = await html2canvas(element, {
                    scale: window.innerWidth < 768 ? 1.2 : 1.8,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: "#ffffff",
                    logging: false,
                    removeContainer: true,
                    windowWidth: 794,
                    scrollX: 0,
                    scrollY: 0,

                    onclone: clonedDocument => {
                        const clonedElement =
                            clonedDocument.getElementById(`po-page-${i}`);

                        const originalElement =
                            document.getElementById(`po-page-${i}`);

                        if (!clonedElement || !originalElement) {
                            throw new Error(
                                `找不到 PDF 页面 po-page-${i}`
                            );
                        }

                        clonedElement.style.display = "flex";
                        clonedElement.style.visibility = "visible";
                        clonedElement.style.opacity = "1";
                        clonedElement.style.position = "relative";
                        clonedElement.style.left = "0";
                        clonedElement.style.top = "0";
                        clonedElement.style.backgroundColor = "#ffffff";
                        clonedElement.style.color = "#111111";

                        applyResolvedStylesForPdf(originalElement as HTMLElement, clonedElement as HTMLElement);
                    }
                });
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
            pdf.save(`PO_${po.id}.pdf`);
        } catch (err) {
            console.error(err);
            alert("PDF Generation Error: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsGeneratingPdf(false);
            setPrintingPO(null);
        }
    };

    const initiateReceive = useCallback((po: PurchaseOrder) => {
        setReceivingPO(po);
        setReceivedItems(po.items.map(i => {
            const isWeightBased = i.pricingMode === 'WEIGHT_BASED' || i.conversionMode === 'ACTUAL_WEIGHT';
            return { 
                ...i, 
                receivedQty: i.orderQty, 
                finalCost: isWeightBased ? getReceiveWeightUnitPrice(i) : getReceiveOrderUnitPrice(i),
                billByWeight: isWeightBased,
                receivedWeight: isWeightBased ? (i.estimatedBaseQty || (i.orderQty * (i.estimatedWeightPerUnit || 1))) : 0
            };
        }));
        setReceiveTax(0);
        setReceiveDelivery(0);
        setIsReceiveModalOpen(true);
    }, []);

    const toggleReceiveBillingMode = useCallback((index: number) => {
        setReceivedItems(previous => previous.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            const nextBillByWeight = !item.billByWeight;
            const estimatedWeight = item.estimatedBaseQty
                || (item.receivedQty * (item.estimatedWeightPerUnit || item.toBaseRatio || item.ratio || 1));

            return {
                ...item,
                billByWeight: nextBillByWeight,
                finalCost: nextBillByWeight
                    ? getReceiveWeightUnitPrice(item)
                    : getReceiveOrderUnitPrice(item),
                receivedWeight: nextBillByWeight
                    ? (item.receivedWeight && item.receivedWeight > 0 ? item.receivedWeight : estimatedWeight)
                    : 0
            };
        }));
    }, []);

    const confirmReceive = async () => {
        if (!receivingPO) return;
        setIsProcessingReceive(true);
        try {
            if (receiveTax < 0 || receiveDelivery < 0) {
                alert('❌ 错误：税金和运输费不能为负数');
                return;
            }

            // Re-read stock immediately before receiving so a completed stocktake is never overwritten
            // by quantities that were loaded when this procurement screen first opened.
            const latestStockItems = await loadLatestStock();

            // Pre-validation to avoid empty or negative received quantities
            let totalReceivedBaseQty = 0;
            for (const item of receivedItems) {
                const line = calculateReceivedLine(item);

                if (!Number.isFinite(line.receivedQty) || line.receivedQty < 0) {
                    await (window as any).systemDialog.alert(`❌ 错误：数量不能为负数 (${item.name})`, "采购管理");
                    return;
                }
                if (!Number.isFinite(line.ratio) || line.ratio <= 0) {
                    await (window as any).systemDialog.alert(`❌ 错误：采购规格换算无效 (${item.name})`, "采购管理");
                    return;
                }
                if (line.isWeightBased) {
                    if (!Number.isFinite(line.receivedBaseQty) || line.receivedBaseQty < 0) {
                        await (window as any).systemDialog.alert(`❌ 错误：重量不能为负数 (${item.name})`, "采购管理");
                        return;
                    }
                }
                if (line.receivedBaseQty > 0 && (!Number.isFinite(line.finalUnitPrice) || line.finalUnitPrice <= 0)) {
                    await (window as any).systemDialog.alert(`❌ 错误：请输入有效的最终价格 (${item.name})`, "采购管理");
                    return;
                }
                totalReceivedBaseQty += line.receivedBaseQty;
            }
            if (totalReceivedBaseQty <= 0) {
                await (window as any).systemDialog.alert("❌ 错误：入库基础数量必须大于 0 (Received base qty must be > 0)", "采购管理");
                return;
            }

            const itemsTotal = receivedItems.reduce(
                (sum: number, item) => sum + calculateReceivedLine(item).finalLineTotal,
                0
            );

            const finalTotal = Math.round((itemsTotal + (receiveTax || 0) + (receiveDelivery || 0)) * 100) / 100;
            
            const supplier = suppliers.find(s => s.id === receivingPO.supplierId);
            const billCategory = supplier?.category || 'SUPPLIER';
            
            const stockUpdates = new Map<string, { qtyDelta: number, costDelta: number }>();
            
            receivedItems.forEach((item) => {
                let inventoryId: string | null = null;
                const line = calculateReceivedLine(item);

                if (supplier && supplier.catalog) {
                    const catalogItem = supplier.catalog.find(c => c.id === item.stockId);
                    if (catalogItem && catalogItem.linkedStockId) {
                        inventoryId = catalogItem.linkedStockId;
                    }
                }

                if (!inventoryId) {
                    const directStock = latestStockItems.find(s => s.id === item.stockId);
                    if (directStock) {
                        inventoryId = directStock.id;
                    }
                }

                if (inventoryId) {
                    if (line.receivedBaseQty > 0) {
                        const existing = stockUpdates.get(inventoryId) || { qtyDelta: 0, costDelta: 0 };
                        stockUpdates.set(inventoryId, {
                            qtyDelta: existing.qtyDelta + line.receivedBaseQty,
                            costDelta: existing.costDelta + line.finalLineTotal
                        });
                    }
                }
            });

            // ⚡ 增量更新：只写有变动的物品，避免全量写回爆配额
            const changedItems: (StockItem & { diff?: number })[] = [];
            stockUpdates.forEach((update, stockId) => {
                const original = latestStockItems.find(s => s.id === stockId);
                if (original) {
                    const baseUnit = original.baseUnit || original.unit || 'pcs';
                    const oldQtyBase = Math.max(0, getCurrentQtyBase(original));
                    const oldCostPerBaseUnit = getCostPerBaseUnit(original);
                    
                    const qtyDelta = update.qtyDelta;
                    const costDelta = update.costDelta;
                    
                    const costResult = calculateWeightedAverageCost({
                        oldQtyBase,
                        oldCostPerBaseUnit,
                        receivedQtyBase: qtyDelta,
                        receivedTotalCost: costDelta
                    });

                    const newCostPerBaseUnit = costResult.newCostPerBaseUnit;
                    const newQty = costResult.newQtyBase;

                    changedItems.push({
                        ...original,
                        currentQty: newQty,
                        currentQtyBase: newQty,
                        cost: newCostPerBaseUnit,
                        costPerBaseUnit: newCostPerBaseUnit,
                        unit: baseUnit,
                        baseUnit: baseUnit,
                        // DataManager applies this delta against the newest quantity inside its transaction.
                        diff: qtyDelta
                    });
                }
            });

            const changedByCategory: Record<string, StockItem[]> = {};
            changedItems.forEach(item => {
                let mainCat = 'GENERAL';
                if (item.id.startsWith('K') || ['FRESH','MEAT','SEAFOOD','VEG','NOODLE','DRY','SAUCE','HQ'].includes(item.category)) mainCat = 'KITCHEN';
                else if (item.id.startsWith('B') || ['TEA','FRUIT','RTD','MISC','DRINK'].includes(item.category)) mainCat = 'BAR';
                else if (['GAS','CHARCOAL','OIL'].includes(item.category)) mainCat = 'FUEL';
                if (!changedByCategory[mainCat]) changedByCategory[mainCat] = [];
                changedByCategory[mainCat].push(item);
            });

            await Promise.all(
                Object.entries(changedByCategory).map(([cat, items]) =>
                    DataManager.batchUpdateStock(cat as any, items)
                )
            );

            // 本地同步，避免再次全量 loadData
            setStockItems(prev => prev.map(s => {
                const updated = changedItems.find(c => c.id === s.id);
                return updated || s;
            }));

            // Sync received fields onto PO items for record-keeping
            const receivedItemsWithNewFields = receivedItems.map(item => {
                const line = calculateReceivedLine(item);
                
                return {
                    ...item,
                    receivedBaseQty: line.receivedBaseQty,
                    receivedQty: item.receivedQty,
                    receivedWeight: line.isWeightBased ? line.receivedBaseQty : undefined,
                    actualWeight: line.isWeightBased ? line.receivedBaseQty : undefined,
                    finalUnitPrice: line.finalUnitPrice,
                    finalLineTotal: line.finalLineTotal,
                    costPerBaseUnitAtReceive: line.costPerBaseUnit,
                    status: line.receivedBaseQty > 0 ? 'RECEIVED' : 'NOT_RECEIVED'
                };
            });

            const savedSession = localStorage.getItem('kepong_erp_session_employee');
            const currentReceiver = savedSession ? JSON.parse(savedSession).name : 'Admin';

            const updatedPO = { 
                ...receivingPO, 
                status: 'RECEIVED' as const,
                items: receivedItemsWithNewFields,
                totalReceived: finalTotal,
                receivedTax: receiveTax || 0,
                receivedDelivery: receiveDelivery || 0,
                receivedAt: new Date().toISOString(),
                receivedBy: currentReceiver
            };
            await DataManager.savePurchaseOrder(updatedPO);

            const noteParts = [`PO: ${receivingPO.id} (Received)`];
            if (receiveTax > 0) noteParts.push(`Tax: ${receiveTax.toFixed(2)}`);
            if (receiveDelivery > 0) noteParts.push(`Del: ${receiveDelivery.toFixed(2)}`);

            const newBill: ExpenseItem = {
                id: `exp_${Date.now()}`,
                category: billCategory, 
                expenseType: 'GENERAL',
                company: receivingPO.supplierName,
                amount: 0, 
                totalBillAmount: finalTotal,
                outstandingAmount: finalTotal,
                paymentStatus: 'UNPAID',
                time: new Date().toISOString(),
                note: noteParts.join(' | '),
                paymentMethod: 'BANK_TRANSFER',
                paidBy: 'COMPANY'
            };
            await DataManager.saveStandaloneExpense(newBill);

            await (window as any).systemDialog.alert("✅ 入库成功！库存已更新，成本已更新。", "采购管理");
            setIsReceiveModalOpen(false);
            setReceivingPO(null); 
        } catch (error: any) {
            console.error("Receive Error", error);
            const detailedMsg = error?.message || String(error);
            await (window as any).systemDialog.alert(`入库失败，请重试。\n\n详细错误: ${detailedMsg}`, "采购管理");
        } finally {
            setIsProcessingReceive(false);
        }
    };

    // --- CART TOTALS ---
    const cartItemsList = useMemo(() => 
        (Object.values(orderDrafts) as OrderDraftItem[]).filter(d => d.qty > 0),
        [orderDrafts]
    );
    const cartTotalCount = cartItemsList.length;
    const cartTotalVal = useMemo(() => 
        cartItemsList.reduce((sum: number, d) => sum + (d.qty * d.price), 0),
        [cartItemsList]
    );

    // Low stock count for badge
    const lowStockCount = useMemo(() => 
        stockItems.filter(needsReplenishment).length,
        [stockItems]
    );

    // --- RENDER UNIFIED CARD ---
    const renderUnifiedCard = (item: StockItem) => {
        const allMatches = findAllSuppliersForStock(item.id);
        
        // Get replenish configs
        const {
            currentQtyBase,
            minLevelBase,
            maxQtyBase,
            replenishDisplayUnit,
            replenishRatio,
            displayCurrentQty,
            displayMinLevel,
            displayMaxQty
        } = getItemReplenishConfig(item);
        
        const isLow = needsReplenishment(item);
        const selectedSupplierId = orderDrafts[item.id]?.selectedSupplierId || allMatches[0]?.supplier.id;
        const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
        const activeCatalogItem = selectedSupplier?.catalog?.find(c => c.linkedStockId === item.id);

        const defUnitInfo = getDefaultReplenishUnit(item, activeCatalogItem);
        const draft = orderDrafts[item.id] || { 
            stockId: item.id, 
            qty: 0, 
            unit: defUnitInfo.unit, 
            price: defUnitInfo.price, 
            ratio: defUnitInfo.ratio 
        };
        
        const unitOptions = getUnitOptionsForItem(item, activeCatalogItem);
        const hasDraft = draft.qty > 0;
        const resolvedPrice = resolveProcurementPrice(item, draft.unit, activeCatalogItem);

        return (
            <div 
                key={item.id} 
                className={`bg-white rounded-2xl p-4 border border-gray-200 transition-all flex flex-col justify-between gap-3.5 shadow-sm hover:shadow-md ${
                    hasDraft 
                        ? 'ring-2 ring-[#111111] border-transparent' 
                        : !resolvedPrice.isValid 
                            ? 'border-orange-300 bg-orange-50/10' 
                            : isLow 
                                ? 'border-red-200' 
                                : 'hover:border-gray-300'
                }`}
            >
                {/* A. 商品标题区 (Responsive Column/Row Stacking to prevent overlap) */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1.5 flex-wrap">
                            <h4 className="font-extrabold text-sm text-[#111111] leading-snug tracking-tight">
                                {item.name}
                            </h4>
                            {item.conversionMode === 'ACTUAL_WEIGHT' && (
                                <span className="text-[9px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200 shadow-xs shrink-0">
                                    ⚖️ 实际称重
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="text-[9px] font-mono font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {item.id}
                            </span>
                            {allMatches.length === 0 ? (
                                <span className="text-[9px] font-bold bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded">
                                    无供应商
                                </span>
                            ) : (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${allMatches.length > 1 ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                    <Truck size={9}/> {allMatches.length} 家供应商
                                </span>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1.5 w-full sm:w-auto shrink-0 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-gray-100/80">
                        <div className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                            !resolvedPrice.isValid
                                ? 'bg-orange-50 text-orange-600 border-orange-200'
                                : isLow
                                    ? 'bg-red-50 text-red-600 border-red-100'
                                    : 'bg-green-50 text-green-600 border-green-100'
                        }`}>
                            {!resolvedPrice.isValid 
                                ? '价格异常' 
                                : item.conversionMode === 'ACTUAL_WEIGHT'
                                    ? `库存: ${displayCurrentQty} 个 / ${(item.currentWeightQty || 0).toFixed(1)} ${item.weightUnit || 'KG'}`
                                    : `库存: ${displayCurrentQty % 1 === 0 ? displayCurrentQty : displayCurrentQty.toFixed(1)} ${replenishDisplayUnit}`
                            }
                        </div>
                        <div className="flex flex-col items-end text-right">
                            {item.conversionMode !== 'ACTUAL_WEIGHT' && replenishRatio > 1 && resolvedPrice.isValid && (
                                <span className="text-[9px] text-gray-400 font-medium">
                                    = {currentQtyBase} {item.baseUnit || item.unit || 'pcs'}
                                </span>
                            )}
                            <span className="text-[9px] text-gray-400 font-medium">
                                Min: {displayMinLevel % 1 === 0 ? displayMinLevel : displayMinLevel.toFixed(1)} {replenishDisplayUnit}
                            </span>
                        </div>
                    </div>
                </div>

                {/* B. 价格区 */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col gap-1.5 relative">
                    {selectedSupplier ? (
                        <>
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-extrabold text-[#111111] truncate flex-1 flex items-center gap-1 min-w-0">
                                    <Truck size={11} className="text-[#FFD200] shrink-0" />
                                    <span className="truncate">{selectedSupplier.name}</span>
                                </span>
                                {allMatches.length > 1 && (
                                    <button 
                                        type="button"
                                        onClick={() => setShowSupplierSelectorMap(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                        className="text-[10px] text-blue-600 font-extrabold flex items-center gap-0.5 hover:text-blue-800 transition-colors shrink-0"
                                    >
                                        更换 <ChevronDown size={11} className={`transition-transform duration-200 ${showSupplierSelectorMap[item.id] ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                            </div>

                            {/* Expandable Supplier List Selector */}
                            {showSupplierSelectorMap[item.id] && allMatches.length > 1 && (
                                <div className="mt-2 flex flex-col gap-1.5 bg-white border border-gray-100 rounded-lg p-2 shadow-sm max-h-[160px] overflow-y-auto z-10">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">选择其他供应商:</p>
                                    {allMatches.map(({ supplier, catalogItem }) => {
                                        const optPriceInfo = resolveProcurementPrice(item, draft.unit, catalogItem);
                                        const isSelected = selectedSupplierId === supplier.id;
                                        return (
                                            <button
                                                key={supplier.id}
                                                type="button"
                                                onClick={() => {
                                                    updateDraftSupplier(item.id, supplier.id, catalogItem, item);
                                                    setShowSupplierSelectorMap(prev => ({ ...prev, [item.id]: false }));
                                                }}
                                                className={`p-2 rounded-lg text-left border text-[11px] transition-all flex flex-col gap-0.5 ${
                                                    isSelected 
                                                        ? 'border-[#111111] bg-[#111111]/5 text-[#111111]' 
                                                        : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100'
                                                }`}
                                            >
                                                <div className="flex justify-between items-center w-full font-bold">
                                                    <span className="truncate max-w-[150px]">{supplier.name}</span>
                                                    {isSelected && <span className="text-[9px] bg-[#111111] text-[#FFD200] px-1 py-0.2 rounded font-black">当前</span>}
                                                </div>
                                                <div className="font-mono flex justify-between text-[10px] mt-0.5 text-gray-500">
                                                    <span>RM {optPriceInfo.purchaseUnitPrice.toFixed(2)} / {draft.unit}</span>
                                                    <span>≈ RM {optPriceInfo.costPerBaseUnit.toFixed(4)} / {resolvedPrice.baseUnit}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Price display */}
                            {resolvedPrice.isValid ? (
                                <div className="mt-1 flex flex-col gap-0.5">
                                    <div className="flex items-baseline gap-1 flex-wrap">
                                        <span className="text-[11px] font-black text-gray-400">RM</span>
                                        <span className="text-xl font-black text-[#111111] tracking-tight">
                                            {resolvedPrice.purchaseUnitPrice.toFixed(2)}
                                        </span>
                                        <span className="text-xs text-gray-500 font-semibold">/ {draft.unit}</span>
                                        {item.conversionMode === 'ACTUAL_WEIGHT' && (
                                            <span className="text-[9px] text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded ml-1.5 whitespace-nowrap">
                                                (待称重 / Est)
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] font-mono text-gray-400 font-medium">
                                        <span>≈ RM {resolvedPrice.costPerBaseUnit.toFixed(4)} / {resolvedPrice.baseUnit}</span>
                                        <span>
                                            {item.conversionMode === 'ACTUAL_WEIGHT' 
                                                ? `估重: 1 ${draft.unit} ≈ ${resolvedPrice.purchaseToBaseRatio} ${resolvedPrice.baseUnit}`
                                                : `规格: 1 ${draft.unit} = ${resolvedPrice.purchaseToBaseRatio} ${resolvedPrice.baseUnit}`
                                            }
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-1 bg-red-50 text-red-700 p-2 rounded-lg border border-red-100 text-xs flex flex-col gap-0.5">
                                    <span className="font-extrabold flex items-center gap-1">
                                        <AlertTriangle size={12} className="shrink-0" />
                                        价格资料异常
                                    </span>
                                    <span className="text-[10px] leading-snug">{resolvedPrice.warning}</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-4 text-xs text-gray-400 italic">
                            暂无供应商，使用默认库存成本计算
                            {resolvedPrice.isValid && (
                                <div className="mt-1.5 flex items-baseline justify-center gap-1 text-left flex-wrap">
                                    <span className="text-[11px] font-black text-gray-400">RM</span>
                                    <span className="text-lg font-black text-[#111111]">{resolvedPrice.purchaseUnitPrice.toFixed(2)}</span>
                                    <span className="text-xs text-gray-500 font-bold">/ {draft.unit}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* C. 数量控制区 */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        {/* Unit Selector */}
                        <div className="relative flex-1 min-w-[72px]">
                            <select 
                                value={draft.unit} 
                                onChange={e => updateDraft(item.id, 'unit', e.target.value, item)} 
                                className="w-full bg-gray-100 text-xs font-black text-[#111111] rounded-xl pl-2.5 pr-6 py-2.5 outline-none cursor-pointer appearance-none border border-transparent hover:border-gray-300 transition-colors"
                            >
                                {unitOptions.map((u, idx) => (
                                    <option key={idx} value={u.value}>{u.value}</option>
                                ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        </div>

                        {/* Minus Button */}
                        <button 
                            type="button"
                            onClick={() => handleQuickAdd(item, -1)} 
                            disabled={!resolvedPrice.isValid}
                            className="w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-90 text-gray-600 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center transition-all shrink-0"
                        >
                            <Minus size={16} strokeWidth={2.5}/>
                        </button>
                        
                        {/* Qty Input */}
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            disabled={!resolvedPrice.isValid}
                            value={draft.qty || ''}
                            placeholder="0"
                            onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                if (!isNaN(val)) updateDraft(item.id, 'qty', Math.max(0, val), item);
                            }}
                            className="w-16 h-11 text-center font-black text-sm text-[#111111] bg-white border border-gray-200 rounded-xl outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all disabled:opacity-50 disabled:bg-gray-50"
                        />
                        
                        {/* Plus Button */}
                        <button 
                            type="button"
                            onClick={() => handleQuickAdd(item, 1)} 
                            disabled={!resolvedPrice.isValid}
                            className="w-11 h-11 rounded-xl bg-[#111111] hover:bg-black active:scale-90 text-[#FFD200] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center transition-all shadow-sm shrink-0"
                        >
                            <Plus size={16} strokeWidth={2.5}/>
                        </button>
                    </div>

                    {/* Shortcuts */}
                    <div className="grid grid-cols-4 gap-1.5 select-none">
                        <button 
                            type="button"
                            onClick={() => handleQuickAdd(item, -5)} 
                            disabled={!resolvedPrice.isValid}
                            className="py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200/60 active:scale-95 text-[10px] font-bold text-gray-500 transition-colors disabled:opacity-50"
                        >
                            -5
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleQuickAdd(item, 5)} 
                            disabled={!resolvedPrice.isValid}
                            className="py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200/60 active:scale-95 text-[10px] font-bold text-gray-700 transition-colors disabled:opacity-50"
                        >
                            +5
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleQuickAdd(item, 10)} 
                            disabled={!resolvedPrice.isValid}
                            className="py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200/60 active:scale-95 text-[10px] font-bold text-gray-700 transition-colors disabled:opacity-50"
                        >
                            +10
                        </button>
                        <button 
                            type="button"
                            onClick={() => {
                                const activeMaxQty = maxQtyBase > 0 ? maxQtyBase : (minLevelBase > 0 ? minLevelBase * 2 : 30);
                                const maxQtyInUnit = activeMaxQty / draft.ratio;
                                const currentQtyInUnit = currentQtyBase / draft.ratio;
                                const neededInUnit = Math.max(0, Math.ceil(maxQtyInUnit - currentQtyInUnit));
                                updateDraft(item.id, 'qty', neededInUnit, item);
                            }} 
                            disabled={!resolvedPrice.isValid}
                            className="py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 active:scale-95 text-[10px] font-extrabold text-orange-600 border border-orange-200/50 transition-colors disabled:opacity-50"
                        >
                            补满
                        </button>
                    </div>
                </div>

                {/* D. 订单摘要区 */}
                <div className={`mt-1 pt-3.5 border-t border-dashed border-gray-100 text-[11px] flex flex-col gap-1 ${hasDraft ? 'text-[#111111]' : 'text-gray-400'}`}>
                    <div className="flex justify-between items-center">
                        <span>目标库存:</span>
                        <span className="font-bold">
                            {(maxQtyBase > 0 ? maxQtyBase / draft.ratio : (minLevelBase > 0 ? minLevelBase * 2 : 30) / draft.ratio).toFixed(1)} {draft.unit}
                        </span>
                    </div>
                    {hasDraft && (
                        <>
                            <div className="flex justify-between items-center text-blue-600 font-medium">
                                <span>预计增加:</span>
                                <span className="font-bold font-mono">
                                    {item.conversionMode === 'ACTUAL_WEIGHT'
                                        ? `+${draft.qty} ${draft.unit} (≈ ${(draft.qty * draft.ratio).toFixed(1)} ${item.baseUnit || 'KG'})`
                                        : `+${draft.qty * draft.ratio} ${item.baseUnit || item.unit || 'pcs'}`
                                    }
                                </span>
                            </div>
                            <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-gray-100 text-xs">
                                <span className="font-extrabold">小计:</span>
                                <div className="text-right">
                                    <span className="font-black text-[#111111] font-mono text-sm">
                                        RM {(draft.qty * resolvedPrice.purchaseUnitPrice).toFixed(2)}
                                    </span>
                                    {item.conversionMode === 'ACTUAL_WEIGHT' && (
                                        <span className="text-[9px] text-orange-500 font-bold block">
                                            (待称重结算)
                                        </span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-7xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* === HEADER === */}
                <div className="bg-[#1A1A1A] px-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700] shadow-md z-20"
                     style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)', paddingBottom: '12px' }}>
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD700] text-black p-2 rounded-xl shadow-lg"><ShoppingCart size={20}/></div>
                        <div>
                            <h3 className="font-serif font-black text-lg tracking-wide">智能采购</h3>
                            <p className="text-[9px] text-gray-400 font-mono uppercase tracking-widest">PROCUREMENT</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <ModuleGuideButton module="SUPPLIER" />
                        {onClose && <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={22}/></button>}
                    </div>
                </div>

                {/* === TAB SWITCHER === */}
                <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex gap-2 shrink-0 z-10 shadow-sm">
                    <button onClick={() => setActiveTab('REPLENISH')} className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${activeTab === 'REPLENISH' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                        <RefreshCw size={14}/> 智能补货
                    </button>
                    <button onClick={() => { setActiveTab('ORDERS'); setVisibleOrderCount(15); }} className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${activeTab === 'ORDERS' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                        <History size={14}/> 采购记录
                    </button>
                </div>

                {/* === MAIN CONTENT === */}
                <div className="flex-grow overflow-hidden flex flex-col relative">
                    {loading ? (
                        <div className="flex items-center justify-center h-full"><Loader2 size={40} className="animate-spin text-gray-400"/></div>
                    ) : (
                        <>
                            {/* --- TAB 1: REPLENISH --- */}
                            {activeTab === 'REPLENISH' && (
                                <div className="flex flex-col h-full relative">
                                    
                                    {/* FILTER BAR */}
                                    <div className="bg-white p-2.5 border-b border-gray-200 flex flex-col gap-2 shadow-sm z-10">
                                        
                                        {/* Supplier Banner OR Category Bar */}
                                        {activeSupplierFilter ? (
                                            <div className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                                                <button onClick={() => { setActiveSupplierFilter(null); setFilterLowStock(false); setActiveCategory('ALL'); }} className="p-1.5 bg-white text-indigo-600 rounded-lg shadow-sm"><ArrowLeft size={14}/></button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wide">供应商筛选</p>
                                                    <p className="text-xs font-black text-indigo-900 truncate flex items-center gap-1"><Truck size={12}/> {suppliers.find(s => s.id === activeSupplierFilter)?.name}</p>
                                                </div>
                                                <button onClick={() => { setActiveSupplierFilter(null); setFilterLowStock(false); setActiveCategory('ALL'); }} className="px-2.5 py-1 bg-indigo-200 text-indigo-800 text-[10px] font-bold rounded-lg">清除</button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                                                {MAIN_CATEGORIES.map(cat => (
                                                    <button 
                                                        key={cat.id} 
                                                        onClick={() => { setActiveCategory(cat.id); setActiveSubCategory('ALL'); }} 
                                                        className={`px-3 py-2 rounded-xl text-[11px] font-black whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 ${activeCategory === cat.id ? 'bg-[#1A1A1A] text-[#FFD700] ring-2 ring-[#FFD700] ring-offset-1' : `${cat.color}`}`}
                                                    >
                                                        <cat.icon size={13}/> {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Kitchen Subcategories */}
                                        {activeCategory === 'KITCHEN' && !activeSupplierFilter && (
                                            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                                                {KITCHEN_SUB_CATEGORIES.map(sub => (
                                                    <button 
                                                        key={sub.id}
                                                        onClick={() => setActiveSubCategory(sub.id)}
                                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-all shrink-0 ${activeSubCategory === sub.id ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                                                    >
                                                        {sub.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* ====== SEARCH + FILTERS ROW (OPTIMIZED FOR MOBILE) ====== */}
                                        <div className="flex items-center gap-2">
                                            {/* Search - takes remaining space */}
                                            <div className="relative flex-1 min-w-0">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14}/>
                                                <input 
                                                    type="text" 
                                                    placeholder="搜索..." 
                                                    value={searchTerm} 
                                                    onChange={e => setSearchTerm(e.target.value)} 
                                                    className="w-full pl-8 pr-3 py-2 bg-gray-100 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#1A1A1A] transition-all"
                                                />
                                            </div>

                                            {/* Low Stock Toggle - compact icon pill */}
                                            <button 
                                                onClick={() => setFilterLowStock(!filterLowStock)} 
                                                className={`shrink-0 h-9 px-2.5 rounded-xl border flex items-center gap-1.5 text-[10px] font-black transition-all relative ${filterLowStock ? 'bg-red-500 border-red-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-400'}`}
                                            >
                                                <AlertTriangle size={13}/>
                                                <span className="hidden xs:inline">缺货</span>
                                                {/* Badge with count */}
                                                {lowStockCount > 0 && !filterLowStock && (
                                                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">{lowStockCount}</span>
                                                )}
                                            </button>
                                            
                                            {/* Smart Fill Button */}
                                            <div className="relative shrink-0">
                                                <button 
                                                    onClick={() => setIsSmartFillMenuOpen(!isSmartFillMenuOpen)}
                                                    disabled={isRefreshingForSmartFill}
                                                    className="h-9 px-3 bg-blue-600 text-white rounded-xl font-black text-[10px] flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-sm active:scale-95 whitespace-nowrap disabled:opacity-60 disabled:active:scale-100"
                                                >
                                                    {isRefreshingForSmartFill ? <Loader2 size={13} className="animate-spin"/> : <Zap size={13} fill="currentColor"/>}
                                                    <span className="hidden sm:inline">{isRefreshingForSmartFill ? '读取最新库存...' : '智能补货'}</span>
                                                    <span className="sm:hidden">{isRefreshingForSmartFill ? '读取中' : '补货'}</span>
                                                </button>

                                                {/* Smart Fill Dropdown */}
                                                {isSmartFillMenuOpen && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setIsSmartFillMenuOpen(false)}></div>
                                                        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50 overflow-hidden flex flex-col max-h-[70vh]">
                                                            <div className="text-[10px] font-bold text-gray-400 uppercase px-3 py-1.5 shrink-0">按区域补货</div>
                                                            
                                                            <div className="shrink-0">
                                                                <button onClick={() => executeSmartFill('CATEGORY', 'ALL')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-xl text-xs font-bold flex items-center gap-2 mb-1">
                                                                    <div className="bg-[#1A1A1A] text-[#FFD700] p-1.5 rounded"><Zap size={12}/></div>
                                                                    全店补货 (All Low Stock)
                                                                </button>
                                                                
                                                                <div className="grid grid-cols-2 gap-1 mb-2">
                                                                    <button onClick={() => executeSmartFill('CATEGORY', 'KITCHEN')} className="text-left px-3 py-1.5 hover:bg-orange-50 text-orange-700 rounded-xl text-[10px] font-bold flex items-center gap-1 col-span-2">
                                                                        <Utensils size={12}/> 整个厨房
                                                                    </button>
                                                                    <button onClick={() => executeSmartFill('CATEGORY', 'KITCHEN', 'MEAT')} className="text-left px-2.5 py-1.5 hover:bg-red-50 text-red-700 rounded-xl text-[10px] font-bold flex items-center gap-1"><Beef size={11}/> 肉类</button>
                                                                    <button onClick={() => executeSmartFill('CATEGORY', 'KITCHEN', 'SEAFOOD')} className="text-left px-2.5 py-1.5 hover:bg-blue-50 text-blue-700 rounded-xl text-[10px] font-bold flex items-center gap-1"><Fish size={11}/> 海鲜</button>
                                                                    <button onClick={() => executeSmartFill('CATEGORY', 'KITCHEN', 'VEG')} className="text-left px-2.5 py-1.5 hover:bg-green-50 text-green-700 rounded-xl text-[10px] font-bold flex items-center gap-1"><Carrot size={11}/> 蔬果</button>
                                                                    <button onClick={() => executeSmartFill('CATEGORY', 'KITCHEN', 'DRY')} className="text-left px-2.5 py-1.5 hover:bg-yellow-50 text-yellow-700 rounded-xl text-[10px] font-bold flex items-center gap-1"><Wheat size={11}/> 干货</button>
                                                                </div>

                                                                <button onClick={() => executeSmartFill('CATEGORY', 'BAR')} className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-blue-800 rounded-xl text-[10px] font-bold flex items-center gap-2 mb-1">
                                                                    <Coffee size={12}/> 水吧
                                                                </button>
                                                                <button onClick={() => executeSmartFill('CATEGORY', 'GENERAL')} className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700 rounded-xl text-[10px] font-bold flex items-center gap-2 mb-2">
                                                                    <Wrench size={12}/> 后勤/打包
                                                                </button>
                                                                <button onClick={() => executeSmartFill('CATEGORY', 'FUEL')} className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-bold flex items-center gap-2 mb-2">
                                                                    <Flame size={12}/> 燃料
                                                                </button>
                                                            </div>

                                                            <div className="h-px bg-gray-100 my-1 shrink-0"></div>
                                                            <div className="text-[10px] font-bold text-gray-400 uppercase px-3 py-1.5 shrink-0">按供应商补货</div>
                                                            
                                                            <div className="px-3 pb-2 shrink-0">
                                                                <div className="relative">
                                                                    <Search size={12} className="absolute left-2.5 top-2 text-gray-400"/>
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="搜索供应商..." 
                                                                        value={supplierMenuSearch}
                                                                        onChange={e => setSupplierMenuSearch(e.target.value)}
                                                                        className="w-full pl-7 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 text-gray-700"
                                                                        onClick={e => e.stopPropagation()}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="overflow-y-auto pr-1 flex-grow max-h-44">
                                                                {menuSuppliers.map(s => {
                                                                    const count = supplierLowStockCounts[s.id] || 0;
                                                                    return (
                                                                        <button 
                                                                            key={s.id}
                                                                            onClick={() => executeSmartFill('SUPPLIER', s.id)}
                                                                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-indigo-900 rounded-xl text-[10px] font-bold flex justify-between items-center transition-colors"
                                                                        >
                                                                            <div className="flex flex-col truncate flex-1 mr-2">
                                                                                <span className="flex items-center gap-1.5 truncate"><Truck size={11}/> {s.name}</span>
                                                                                <span className="text-[9px] text-gray-400 font-mono ml-4">ID: {s.id}</span>
                                                                            </div>
                                                                            {count > 0 && <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full text-[9px] border border-red-100 whitespace-nowrap shrink-0">{count} 缺货</span>}
                                                                        </button>
                                                                    );
                                                                })}
                                                                {menuSuppliers.length === 0 && (
                                                                    <div className="px-3 py-4 text-[10px] text-gray-400 italic text-center">
                                                                        {supplierMenuSearch ? '未找到匹配供应商' : '暂无已关联供应商'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* TODAY'S STOCKTAKE RESULTS: direct management handoff to purchasing */}
                                    {(isLoadingStocktakes || stocktakeCompletions.length > 0) && (
                                        <div className="bg-emerald-50 border-b border-emerald-200 px-2.5 py-2.5 shrink-0">
                                            <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 text-emerald-900">
                                                        <ClipboardCheck size={15}/>
                                                        <span className="text-xs font-black">今日盘点结果</span>
                                                        {!isLoadingStocktakes && (
                                                            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                                                {stocktakeCompletions.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-0.5 text-[9px] font-medium text-emerald-700">员工提交后，可直接按实际库存准备采购清单</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={loadTodayStocktakeCompletions}
                                                    disabled={isLoadingStocktakes}
                                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 active:scale-95 disabled:opacity-60"
                                                    aria-label="刷新今日盘点结果"
                                                >
                                                    <RefreshCw size={14} className={isLoadingStocktakes ? 'animate-spin' : ''}/>
                                                </button>
                                            </div>

                                            {isLoadingStocktakes ? (
                                                <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-white/70 text-[10px] font-bold text-emerald-700">
                                                    <Loader2 size={13} className="animate-spin"/> 读取最新盘点结果...
                                                </div>
                                            ) : (
                                                <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide snap-x snap-mandatory">
                                                    {stocktakeCompletions.map(completion => (
                                                        <div
                                                            key={completion.id}
                                                            className="min-w-[260px] max-w-[300px] flex-1 snap-start rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-xs font-black text-[#1A1A1A]">{completion.assigneeName}</p>
                                                                    <p className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-gray-400">
                                                                        <Clock size={10}/>
                                                                        {new Date(completion.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                        <span>·</span>
                                                                        {completion.items.length} 个物品
                                                                    </p>
                                                                </div>
                                                                <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">已完成</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => executeStocktakeFill(completion)}
                                                                disabled={isRefreshingForSmartFill}
                                                                className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1A1A1A] px-3 py-2.5 text-xs font-black text-[#FFD700] shadow-sm active:scale-[0.98] disabled:opacity-60"
                                                            >
                                                                {isRefreshingForSmartFill ? <Loader2 size={14} className="animate-spin"/> : <Zap size={14}/>} 根据这次盘点补货
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ====== ITEM LIST (OPTIMIZED MOBILE) ====== */}
                                    <div className="flex-grow overflow-y-auto bg-[#F5F7FA]" style={{ paddingBottom: cartTotalCount > 0 ? 'calc(120px + env(safe-area-inset-bottom, 0px))' : '20px' }}>
                                        <div className="p-2.5 md:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                                            {filteredStock.map(item => renderUnifiedCard(item))}

                                            {filteredStock.length === 0 && (
                                                <div className="col-span-full py-20 text-center text-gray-400 font-bold flex flex-col items-center">
                                                    <Package size={48} className="mb-2 opacity-20"/>
                                                    没有符合条件的物品
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ====== FLOATING CART BAR (iOS SAFE) ====== */}
                                    {cartTotalCount > 0 && (
                                        <div className="absolute left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[600px] z-50"
                                             style={{ bottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
                                            <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl p-3 flex items-center justify-between border border-[#FFD700]/30 relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#FFD700] to-transparent"></div>
                                                
                                                <div className="flex items-center gap-3 cursor-pointer min-w-0 flex-1" onClick={() => setShowCartDetail(!showCartDetail)}>
                                                    <div className="relative shrink-0">
                                                        <div className="bg-[#FFD700] text-black w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shadow-lg">
                                                            {cartTotalCount}
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Est. Cost</p>
                                                        <p className="text-lg font-mono font-black text-white truncate">RM {cartTotalVal.toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-gray-500 shrink-0">
                                                        {showCartDetail ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={handleGeneratePOs} 
                                                    disabled={isGenerating}
                                                    className="bg-[#FFD700] hover:bg-white text-black px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg transition-all active:scale-95 shrink-0 ml-2"
                                                >
                                                    {isGenerating ? <Loader2 size={16} className="animate-spin"/> : <FileText size={16}/>}
                                                    <span className="hidden sm:inline">生成采购单</span>
                                                    <span className="sm:hidden">下单</span>
                                                </button>
                                            </div>

                                            {/* Cart Details Dropdown */}
                                            {showCartDetail && (
                                                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-h-[50vh] flex flex-col">
                                                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0">
                                                        <h4 className="font-black text-xs text-[#1A1A1A]">已选 ({cartTotalCount})</h4>
                                                        <button onClick={() => setOrderDrafts({})} className="text-[10px] text-red-500 font-bold flex items-center gap-1"><Trash2 size={11}/> 清空</button>
                                                    </div>
                                                    <div className="p-2 space-y-0.5 overflow-y-auto">
                                                        {cartItemsList.map((d) => {
                                                            const item = stockItems.find(s => s.id === d.stockId);
                                                            return (
                                                                <div key={d.stockId} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg">
                                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                        <span className="font-bold text-xs text-[#1A1A1A] truncate">{item?.name}</span>
                                                                        <span className="text-[10px] text-gray-400 font-mono shrink-0">x{d.qty} {d.unit}</span>
                                                                    </div>
                                                                    <span className="font-mono font-bold text-xs text-[#1A1A1A] shrink-0 ml-2">RM {(d.qty * d.price).toFixed(2)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ====== TAB 2: ORDERS ====== */}
                            {activeTab === 'ORDERS' && (() => {
                                // 在渲染前先进行日期过滤
                                const displayOrders = purchaseOrders.filter(po => 
                                    !orderDateFilter || po.date.startsWith(orderDateFilter)
                                );

                                return (
                                <div className="flex-grow overflow-y-auto p-3 md:p-6" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>
                                    <div className="max-w-4xl mx-auto space-y-3">
                                        
                                        {/* 新增：头部筛选与状态提示栏 */}
                                        <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <Clock size={16} className="text-[#FFD700]" />
                                                <span className="text-xs font-black text-[#1A1A1A]">最近 50 条记录</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="date" 
                                                    value={orderDateFilter}
                                                    onChange={e => setOrderDateFilter(e.target.value)}
                                                    className="bg-gray-50 border border-gray-200 text-xs font-bold rounded-lg px-2 py-1.5 outline-none focus:border-[#1A1A1A] text-gray-700"
                                                />
                                                {orderDateFilter && (
                                                    <button onClick={() => setOrderDateFilter('')} className="bg-red-50 text-red-500 p-1.5 rounded-lg active:scale-95 transition-all">
                                                        <X size={14}/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {displayOrders.length === 0 ? (
                                            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-sm flex flex-col items-center">
                                                <Package size={48} className="text-gray-200 mb-3"/>
                                                <p className="font-black text-gray-400">{orderDateFilter ? '该日期无采购记录' : '暂无采购记录'}</p>
                                                {!orderDateFilter && <button onClick={() => setActiveTab('REPLENISH')} className="mt-3 px-6 py-2 bg-gray-100 rounded-full text-xs font-bold text-gray-500 hover:bg-gray-200">去补货</button>}
                                            </div>
                                        ) : (
                                            <>
                                                {displayOrders.slice(0, visibleOrderCount).map(po => {
                                                    const isReceived = po.status === 'RECEIVED';
                                                    const isCancelled = po.status === 'CANCELLED';
                                                    const hasFinalFigures = typeof po.totalReceived === 'number' || po.items.some(item => typeof item.finalLineTotal === 'number');
                                                    const finalTotal = typeof po.totalReceived === 'number'
                                                        ? po.totalReceived
                                                        : po.items.reduce((sum, item) => sum + (item.finalLineTotal || 0), 0);
                                                    const amountDifference = hasFinalFigures ? finalTotal - po.totalEstimated : 0;

                                                    return (
                                                    <div key={po.id} className={`bg-white p-4 rounded-2xl border shadow-sm ${isReceived ? 'border-green-200' : isCancelled ? 'border-gray-300 opacity-75' : 'border-yellow-200'}`}>
                                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isReceived ? 'bg-green-50 text-green-600' : isCancelled ? 'bg-gray-100 text-gray-500' : 'bg-yellow-50 text-yellow-600'}`}>
                                                                    {isReceived ? <CheckCircle2 size={22}/> : isCancelled ? <X size={22}/> : <Clock size={22}/>}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="font-mono font-black text-base text-[#1A1A1A]">{po.id}</span>
                                                                        <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{po.date.split('T')[0]}</span>
                                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isReceived ? 'bg-green-100 text-green-700' : isCancelled ? 'bg-gray-200 text-gray-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                                                            {isReceived ? '已收货' : isCancelled ? '已取消' : '等待收货'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="font-bold text-gray-500 text-xs flex items-center gap-1 mt-0.5 truncate"><Truck size={12}/> {po.supplierName}</div>
                                                                    {isReceived && po.receivedAt && (
                                                                        <div className="mt-1 text-[9px] font-medium text-green-600">
                                                                            {new Date(po.receivedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                            {po.receivedBy ? ` · ${po.receivedBy}` : ''}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex w-full sm:w-auto items-center gap-2 justify-end">
                                                                {po.status === 'ORDERED' && (
                                                                    <button onClick={() => initiateReceive(po)} className="min-h-11 flex-1 sm:flex-none bg-[#1A1A1A] text-[#FFD700] px-4 py-2.5 rounded-xl text-xs font-black shadow-lg active:scale-95 flex items-center justify-center gap-1.5">
                                                                        <ClipboardCheck size={14}/> 收货
                                                                    </button>
                                                                )}
                                                                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                                                    <button onClick={() => sendWhatsapp(po)} className="w-10 h-10 flex items-center justify-center bg-white text-green-600 rounded-md shadow-sm border border-gray-200 active:scale-95" aria-label="发送采购单"><Send size={16}/></button>
                                                                    <button onClick={() => handlePrintPDF(po)} className="w-10 h-10 flex items-center justify-center bg-white text-blue-600 rounded-md shadow-sm border border-gray-200 active:scale-95" aria-label="打印采购单">
                                                                        {isGeneratingPdf && printingPO?.id === po.id ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16}/>}
                                                                    </button>
                                                                    <button onClick={() => setDeletePOCandidate(po.id)} className="w-10 h-10 flex items-center justify-center bg-white text-red-600 rounded-md shadow-sm border border-gray-200 active:scale-95" aria-label="删除采购单"><Trash2 size={16}/></button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                            <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5">
                                                                <p className="text-[9px] font-bold text-gray-400 uppercase">预计金额</p>
                                                                <p className="mt-0.5 text-sm font-black text-[#1A1A1A]">RM {po.totalEstimated.toFixed(2)}</p>
                                                            </div>
                                                            <div className={`rounded-xl border p-2.5 ${isReceived ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'}`}>
                                                                <p className={`text-[9px] font-bold uppercase ${isReceived ? 'text-green-600' : 'text-yellow-700'}`}>{isReceived ? '最终金额' : '当前状态'}</p>
                                                                <p className={`mt-0.5 text-sm font-black ${isReceived ? 'text-green-800' : 'text-yellow-800'}`}>
                                                                    {isReceived && hasFinalFigures ? `RM ${finalTotal.toFixed(2)}` : isReceived ? '已收货' : '待点算'}
                                                                </p>
                                                            </div>
                                                            <div className="col-span-2 sm:col-span-1 rounded-xl bg-gray-50 border border-gray-100 p-2.5 flex sm:block items-center justify-between">
                                                                <p className="text-[9px] font-bold text-gray-400 uppercase">{isReceived && hasFinalFigures ? '金额差异' : '物品数量'}</p>
                                                                <p className={`mt-0.5 text-sm font-black ${amountDifference > 0 ? 'text-red-600' : amountDifference < 0 ? 'text-green-600' : 'text-[#1A1A1A]'}`}>
                                                                    {isReceived && hasFinalFigures
                                                                        ? `${amountDifference > 0 ? '+' : ''}RM ${amountDifference.toFixed(2)}`
                                                                        : `${po.items.length} 项`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2 overflow-x-auto scrollbar-hide">
                                                            {po.items.map((item, idx) => {
                                                                const hasReceivedQty = typeof item.receivedQty === 'number';
                                                                const isWeightItem = typeof item.receivedWeight === 'number' && item.receivedWeight > 0;
                                                                const isShortReceived = hasReceivedQty && (item.receivedQty || 0) < item.orderQty;
                                                                return (
                                                                <div key={idx} className={`flex-shrink-0 min-w-[150px] px-2.5 py-2 rounded-xl text-[11px] border ${isShortReceived ? 'bg-red-50 border-red-100' : isReceived ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                                                                    <div className="font-bold text-[#1A1A1A] truncate">{item.name}</div>
                                                                    <div className="mt-1 text-[9px] font-medium text-gray-500">订购: {item.orderQty} {item.unit}</div>
                                                                    {isReceived && (
                                                                        <>
                                                                            <div className={`mt-0.5 text-[9px] font-black ${isShortReceived ? 'text-red-600' : 'text-green-700'}`}>
                                                                                {hasReceivedQty ? `实收: ${item.receivedQty} ${item.unit}` : '实收数量未记录'}
                                                                            </div>
                                                                            {isWeightItem && <div className="mt-0.5 text-[9px] font-bold text-orange-600">重量: {item.receivedWeight} {item.billingUnit || item.pricingUnit || item.baseUnit || 'KG'}</div>}
                                                                            {typeof item.finalLineTotal === 'number' && <div className="mt-1 font-mono text-[9px] font-black text-[#1A1A1A]">RM {item.finalLineTotal.toFixed(2)}</div>}
                                                                        </>
                                                                    )}
                                                                </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    );
                                                })}

                                                {visibleOrderCount < displayOrders.length && (
                                                    <button 
                                                        onClick={() => setVisibleOrderCount(prev => prev + 15)}
                                                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-gray-500 font-bold text-xs hover:bg-gray-50 flex items-center justify-center gap-2 shadow-sm active:scale-95"
                                                    >
                                                        <ChevronDown size={14} /> 加载更多 ({displayOrders.length - visibleOrderCount})
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                );
                            })()}
                        </>
                    )}
                </div>

                {/* ====== RECEIVE MODAL (iOS Safe) ====== */}
                {isReceiveModalOpen && receivingPO && (
                    <div className="fixed inset-0 bg-black/80 z-[200] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm">
                        <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden relative"
                             style={{ 
                                 maxHeight: '100vh',
                                 borderTopLeftRadius: '1.5rem',
                                 borderTopRightRadius: '1.5rem',
                                 paddingBottom: 'env(safe-area-inset-bottom, 0px)'
                             }}>
                            {/* Handle bar for mobile */}
                            <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
                                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
                            </div>
                            
                            <div className="px-4 py-3 sm:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                                <div>
                                    <h3 className="font-black text-base sm:text-xl text-[#1A1A1A] flex items-center gap-2"><ArrowDownToLine className="text-blue-600" size={18}/> 收货点算</h3>
                                    <p className="text-[10px] text-gray-500 font-bold mt-0.5 font-mono">PO: {receivingPO.id}</p>
                                </div>
                                <button onClick={() => setIsReceiveModalOpen(false)} className="p-2 bg-white shadow-sm rounded-full hover:bg-gray-100"><X size={18}/></button>
                            </div>

                            <div className="flex-grow overflow-y-auto px-3 py-3 sm:p-5 space-y-3 bg-[#F9FAFB]">
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex gap-2 items-start text-[11px] text-blue-800 font-bold">
                                    <Info size={14} className="shrink-0 mt-0.5"/>
                                    <p>核对实收数量，确认后自动增加库存并生成应付账款。</p>
                                </div>

                                <div className="space-y-2">
                                    {receivedItems.map((item, idx) => {
                                        const isShort = item.receivedQty < item.orderQty;
                                        const weightUnitLabel = item.billingUnit || item.pricingUnit || item.baseUnit || 'KG';
                                        const displayUnitCost = item.billByWeight && item.receivedWeight && item.receivedQty > 0
                                            ? ((item.receivedWeight * item.finalCost) / item.receivedQty).toFixed(2)
                                            : item.finalCost.toFixed(2);

                                        return (
                                            <div key={idx} className={`bg-white border-2 rounded-xl p-3 flex flex-col gap-3 ${isShort ? 'border-red-100 bg-red-50/30' : 'border-gray-100'}`}>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-black text-xs text-[#1A1A1A] mb-1 flex items-center gap-1.5 flex-wrap">
                                                            <span className="truncate">{item.name}</span>
                                                            <button 
                                                                type="button"
                                                                onClick={() => toggleReceiveBillingMode(idx)}
                                                                aria-pressed={Boolean(item.billByWeight)}
                                                                className={`text-[10px] px-2 py-1 rounded-lg border transition-all flex items-center gap-1 shrink-0 active:scale-95 ${item.billByWeight ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                                                            >
                                                                <Scale size={10}/> {item.billByWeight ? '按重量计价' : '按数量计价'}
                                                            </button>
                                                        </div>
                                                        <div className="text-[9px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded w-fit">订: {item.orderQty} {item.unit}</div>
                                                        {item.billByWeight && item.receivedWeight ? (
                                                            <div className="mt-1 text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit flex items-center gap-0.5">
                                                                <Calculator size={9}/> 折合每{item.unit}: RM {displayUnitCost}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:flex-wrap">
                                                    <div className="col-span-2 sm:col-span-1">
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 block">实收 ({item.unit})</label>
                                                        <div className="grid grid-cols-[44px_minmax(64px,1fr)_44px] sm:flex sm:items-center">
                                                            <button onClick={() => {
                                                                const newVal = Math.max(0, item.receivedQty - 1);
                                                                setReceivedItems(prev => { const n = [...prev]; n[idx].receivedQty = newVal; return n; });
                                                            }} className="w-11 h-11 bg-gray-100 rounded-l-xl border border-r-0 border-gray-300 flex items-center justify-center font-bold hover:bg-gray-200 active:bg-gray-300 text-base">-</button>
                                                            <input 
                                                                type="number" 
                                                                inputMode="decimal"
                                                                step="any"
                                                                value={item.receivedQty} 
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setReceivedItems(prev => { const n = [...prev]; n[idx].receivedQty = val; return n; });
                                                                }}
                                                                className={`min-w-0 w-full sm:w-16 h-11 border-y border-gray-300 text-center font-black text-base outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isShort ? 'text-red-600 bg-red-50' : 'bg-white'}`}
                                                            />
                                                            <button onClick={() => {
                                                                const newVal = item.receivedQty + 1;
                                                                setReceivedItems(prev => { const n = [...prev]; n[idx].receivedQty = newVal; return n; });
                                                            }} className="w-11 h-11 bg-gray-100 rounded-r-xl border border-l-0 border-gray-300 flex items-center justify-center font-bold hover:bg-gray-200 active:bg-gray-300 text-base">+</button>
                                                        </div>
                                                    </div>

                                                    {item.billByWeight && (
                                                        <div className="min-w-0">
                                                            <label className="text-[9px] font-bold text-orange-500 uppercase mb-0.5 block">实际重量 ({weightUnitLabel})</label>
                                                            <input 
                                                                type="number" 
                                                                inputMode="decimal"
                                                                step="0.01"
                                                                value={item.receivedWeight || ''}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setReceivedItems(prev => { const n = [...prev]; n[idx].receivedWeight = val; return n; });
                                                                }}
                                                                className="w-full min-w-0 h-11 px-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl text-center font-black text-base outline-none focus:border-orange-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                    )}

                                                    <div className={`min-w-0 ${item.billByWeight ? '' : 'col-span-2 sm:col-span-1'}`}>
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 block">
                                                            {item.billByWeight ? `每${weightUnitLabel}价格 (RM/${weightUnitLabel})` : `每${item.unit}价格 (RM/${item.unit})`}
                                                        </label>
                                                        <input 
                                                            type="number" 
                                                            inputMode="decimal"
                                                            step="0.01"
                                                            value={item.finalCost} 
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                setReceivedItems(prev => { const n = [...prev]; n[idx].finalCost = val; return n; });
                                                            }}
                                                            onBlur={() => setReceivedItems(prev => {
                                                                const next = [...prev];
                                                                next[idx] = { ...next[idx], finalCost: roundReceivePrice(next[idx].finalCost) };
                                                                return next;
                                                            })}
                                                            className="w-full min-w-0 h-11 px-3 bg-white border border-gray-300 rounded-xl text-center font-black text-base outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                        />
                                                    </div>
                                                </div>

                                                {(() => {
                                                    const line = calculateReceivedLine(item);
                                                    let costPerBaseUnitPreview = line.costPerBaseUnit;
                                                    if (isNaN(costPerBaseUnitPreview) || !isFinite(costPerBaseUnitPreview)) {
                                                        costPerBaseUnitPreview = 0;
                                                    }
                                                    
                                                    const receivingSupplier = suppliers.find(s => s.id === receivingPO?.supplierId);
                                                    const inventoryStockId = receivingSupplier?.catalog?.find(c => c.id === item.stockId)?.linkedStockId || item.stockId;
                                                    const directStock = stockItems.find(s => s.id === inventoryStockId);
                                                    const baseUnit = directStock?.baseUnit || directStock?.unit || item.unit || 'pcs';
                                                    const displayUnit = directStock?.displayUnit;
                                                    const matchedPU = directStock?.purchaseUnits?.find(
                                                        pu => pu.unitName?.toLowerCase() === item.unit?.toLowerCase()
                                                    );
                                                    const toDisplayRatio = matchedPU?.toDisplayRatio;
                                                    
                                                    return (
                                                        <div className="mt-1 text-[10px] font-bold text-blue-600 bg-blue-50/50 rounded-lg p-2 border border-blue-100 flex flex-wrap gap-x-4 gap-y-1">
                                                            {line.isWeightBased ? (
                                                                <span>按实际重量入库，不使用预估重量换算</span>
                                                            ) : (
                                                                <span>
                                                                    规格: {toDisplayRatio && displayUnit && displayUnit !== baseUnit
                                                                        ? `1 ${item.unit} = ${toDisplayRatio} ${displayUnit} = ${line.ratio} ${baseUnit}`
                                                                        : `1 ${item.unit} = ${line.ratio} ${baseUnit}`
                                                                    }
                                                                </span>
                                                            )}
                                                            <span>入库基础数量: <span className="font-extrabold">{line.receivedBaseQty.toLocaleString()} {baseUnit}</span></span>
                                                            <span>折合基础成本: <span className="font-extrabold">RM {costPerBaseUnitPreview.toFixed(4)} / {baseUnit}</span></span>
                                                            <span>本项金额: <span className="font-extrabold">RM {line.finalLineTotal.toFixed(2)}</span></span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="px-4 py-3 sm:p-5 border-t border-gray-100 bg-white shrink-0">
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 block flex items-center gap-1"><Percent size={9}/> Tax</label>
                                        <input 
                                            type="number" 
                                            value={receiveTax || ''} 
                                            onChange={e => setReceiveTax(parseFloat(e.target.value) || 0)}
                                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none text-right"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 block flex items-center gap-1"><Bus size={9}/> Transport</label>
                                        <input 
                                            type="number" 
                                            value={receiveDelivery || ''} 
                                            onChange={e => setReceiveDelivery(parseFloat(e.target.value) || 0)}
                                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none text-right"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-3 px-1 pt-2 border-t border-dashed border-gray-200">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</span>
                                    <span className="text-2xl font-black font-mono text-[#1A1A1A]">
                                        RM {(receivedItems.reduce(
                                            (sum, item) => sum + calculateReceivedLine(item).finalLineTotal,
                                            0
                                        ) + (receiveTax || 0) + (receiveDelivery || 0)).toFixed(2)}
                                    </span>
                                </div>
                                <button onClick={confirmReceive} disabled={isProcessingReceive} className="w-full py-3.5 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-sm shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 active:scale-95">
                                    {isProcessingReceive ? <Loader2 size={20} className="animate-spin"/> : <CheckCircle2 size={20}/>} 确认入库
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* DELETE CONFIRMATION */}
                {deletePOCandidate && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl text-center border-t-4 border-red-500">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Trash2 size={28} className="text-red-600"/>
                            </div>
                            <h4 className="text-lg font-black text-[#1A1A1A] mb-1">确认删除?</h4>
                            <p className="text-xs font-bold text-gray-500 mb-5">
                                <span className="font-mono text-black">{deletePOCandidate}</span> · 无法撤销
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setDeletePOCandidate(null)} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs">取消</button>
                                <button onClick={async () => {
                                    if (!deletePOCandidate) return;
                                    try {
                                        await DataManager.deletePurchaseOrder(deletePOCandidate);
                                        setPurchaseOrders(prev => prev.filter(p => p.id !== deletePOCandidate));
                                        await (window as any).systemDialog.alert("✅ 已删除", "采购管理");
                                    } catch (e) {
                                        console.error(e);
                                        await (window as any).systemDialog.alert("删除失败", "采购管理");
                                    } finally {
                                        setDeletePOCandidate(null);
                                    }
                                }} className="py-3 bg-red-600 text-white font-bold rounded-xl text-xs shadow-lg">确认删除</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* HIDDEN PRINT AREA */}
                <div
                    id="pdf-print-root"
                    aria-hidden="true"
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "794px",
                        pointerEvents: "none",
                        opacity: 0,
                        zIndex: -9999
                    }}
                >
                    {printingPO && (() => {
                         const itemsPerPage = ITEMS_PER_PAGE;
                         const pages: PurchaseOrderItem[][] = [];
                         for (let i = 0; i < Math.ceil(printingPO.items.length / itemsPerPage); i++) {
                             pages.push(printingPO.items.slice(i * itemsPerPage, (i + 1) * itemsPerPage));
                         }
                         return pages.map((pageItems, pageIndex) => (
                             <div key={pageIndex} id={`po-page-${pageIndex}`} className="w-[794px] h-[1123px] bg-[#FFFFFF] text-[#111111] font-sans relative flex flex-col" style={{ fontFamily: 'sans-serif' }}>
                                 <div className="h-2 bg-[#FFD200]"></div>
                                 
                                 <div className="flex flex-col flex-1 px-12 pt-8 pb-6">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h1 className="text-4xl font-black tracking-wider text-[#111111] leading-none">PURCHASE</h1>
                                            <h1 className="text-4xl font-black tracking-wider text-[#111111] leading-none">ORDER</h1>
                                            <p className="text-xs font-bold text-[#FFD200] mt-2 tracking-widest uppercase">Kim Lian Kee (Kepong)</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-mono font-black text-[#111111] tracking-tight">{printingPO?.id}</p>
                                            <p className="text-sm font-semibold text-[#6B7280] mt-1">{printingPO?.date.split('T')[0]}</p>
                                            {printingPO?.createdBy && <p className="text-xs text-[#9CA3AF] mt-1">By: <span className="font-semibold text-[#6B7280]">{printingPO.createdBy}</span></p>}
                                        </div>
                                    </div>

                                    <div className="mb-6 p-4 bg-[#F6F7FB] rounded-lg border border-[#E5E7EB]">
                                        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-0.5">To Supplier:</p>
                                        <h2 className="text-xl font-bold text-[#111111]">{printingPO?.supplierName}</h2>
                                    </div>

                                    <div className="flex-1">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b-2 border-[#111111]">
                                                    <th className="py-2 text-[10px] font-black uppercase text-[#6B7280] tracking-wider w-8">#</th>
                                                    <th className="py-2 text-[10px] font-black uppercase text-[#6B7280] tracking-wider">Item Name</th>
                                                    <th className="py-2 text-[10px] font-black uppercase text-[#6B7280] tracking-wider text-center w-24">Qty</th>
                                                    <th className="py-2 text-[10px] font-black uppercase text-[#6B7280] tracking-wider text-center w-24">Unit</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pageItems.map((item, i) => (
                                                    <tr key={i} className={`border-b border-[#E5E7EB] ${i % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F6F7FB]'}`}>
                                                        <td className="py-3 text-xs text-[#D1D5DB] font-mono">{pageIndex * itemsPerPage + i + 1}</td>
                                                        <td className="py-3">
                                                            <span className="text-base font-bold text-[#111111] leading-tight">{item.name}</span>
                                                            {item.supplierCode && <span className="text-[10px] text-[#9CA3AF] block font-normal mt-0.5">{item.supplierCode}</span>}
                                                        </td>
                                                        <td className="py-3 text-lg font-mono text-center font-bold text-[#111111]">{item.orderQty}</td>
                                                        <td className="py-3 text-xs font-semibold text-center uppercase text-[#6B7280] tracking-wide">{item.unit}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        
                                        {pageIndex === pages.length - 1 && (
                                            <div className="mt-4 flex justify-end">
                                                <div className="bg-[#F6F7FB] rounded-lg px-5 py-2 border border-[#E5E7EB]">
                                                    <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Total Items: </span>
                                                    <span className="text-sm font-black text-[#111111]">{printingPO.items.length}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-auto pt-6">
                                        {pageIndex === pages.length - 1 && (
                                            <div className="flex justify-between items-end mt-4">
                                                <div className="flex-1">
                                                    <div className="w-48 border-b-2 border-[#D1D5DB] mb-1"></div>
                                                    <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Authorized Signature</p>
                                                </div>
                                                <div className="flex-1 text-right">
                                                    <div className="w-48 border-b-2 border-[#D1D5DB] mb-1 ml-auto"></div>
                                                    <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Received By (Supplier)</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#E5E7EB]">
                                            <p className="text-[9px] text-[#D1D5DB]">Generated by 御膳智控 ERP</p>
                                            <p className="text-[9px] text-[#6B7280] font-mono">Page {pageIndex + 1} of {pages.length}</p>
                                        </div>
                                    </div>
                                 </div>
                             </div>
                         ));
                    })()}
                </div>

            </div>
        </div>
    );
};
