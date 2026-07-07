import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShoppingCart, Package, Truck, AlertTriangle, Plus, FileText, Send, Printer, CheckCircle2, X, RefreshCw, ChevronRight, Search, ClipboardCheck, ArrowDownToLine, Loader2, Info, ChevronDown, Filter, Utensils, Coffee, Box, Wrench, Minus, ChevronUp, History, Clock, Zap, Trash2, Fish, Beef, Wheat, Carrot, Soup, PaintBucket, Users, ArrowLeft, Percent, Bus, Scale, Calculator, Flame } from 'lucide-react';
import { StockItem, Supplier, PurchaseOrder, PurchaseOrderItem, ExpenseItem, CatalogItem, UomOption } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';

interface ProcurementModuleProps {
    onClose?: () => void;
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

export const ProcurementModule: React.FC<ProcurementModuleProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'REPLENISH' | 'ORDERS'>('REPLENISH');
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    
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

    const loadData = async () => {
        setLoading(true);
        try {
            const [k, b, g, f, sup, pos] = await Promise.all([
            DataManager.getStock('KITCHEN'),
            DataManager.getStock('BAR'),
            DataManager.getStock('GENERAL'),
            DataManager.getStock('FUEL'),
            DataManager.getSuppliers(),
            DataManager.getPurchaseOrders()
        ]);

        const allStock = [...k, ...b, ...g, ...f].sort((a,b) => {
                const ratioA = a.currentQty / (a.minLevel || 1);
                const ratioB = b.currentQty / (b.minLevel || 1);
                return ratioA - ratioB;
            });

            setStockItems(allStock);
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
            if (item.currentQty <= item.minLevel) {
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
            list = list.filter(i => i.currentQty <= i.minLevel);
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
            const current = prev[stockId] || { stockId, qty: 0, unit: baseItem.unit, price: baseItem.cost, ratio: 1 };
            const updated = { ...current, [field]: value };

            if (field === 'unit') {
                const selectedUom = baseItem.uomOptions?.find(u => u.value === value);
                if (selectedUom) {
                    updated.ratio = selectedUom.ratio;
                    updated.price = selectedUom.price || (baseItem.cost * selectedUom.ratio);
                } else {
                    updated.ratio = 1;
                    updated.price = baseItem.cost;
                }
            }

            if (field === 'qty' && value < 0) updated.qty = 0;

            return { ...prev, [stockId]: updated };
        });
    }, []);

    // =====================================================
    // 🔧 FIX: handleQuickAdd - 之前缺失导致数量无法更改
    // =====================================================
    const handleQuickAdd = useCallback((item: StockItem, delta: number) => {
        setOrderDrafts(prev => {
            const current = prev[item.id] || { stockId: item.id, qty: 0, unit: item.unit, price: item.cost, ratio: 1 };
            const newQty = Math.max(0, current.qty + delta);
            return { ...prev, [item.id]: { ...current, qty: newQty } };
        });
    }, []);

    const updateDraftSupplier = useCallback((stockId: string, supplierId: string, catalogItem: CatalogItem, baseItem: StockItem) => {
        setOrderDrafts(prev => {
            const current = prev[stockId] || { stockId, qty: 1, unit: baseItem.unit, price: baseItem.cost, ratio: 1 };
            const selectedUom = catalogItem.uomOptions?.find(u => u.value === current.unit);
            const newPrice = selectedUom?.price || catalogItem.price;
            return {
                ...prev,
                [stockId]: {
                    ...current,
                    selectedSupplierId: supplierId,
                    price: newPrice,
                }
            };
        });
    }, []);

    // --- SMART FILL ---
    const executeSmartFill = useCallback((type: 'CATEGORY' | 'SUPPLIER', targetId: string, subTarget?: string) => {
        let targetItems: StockItem[] = [];

        if (type === 'CATEGORY') {
            setActiveSupplierFilter(null);
            if (targetId === 'ALL') {
                targetItems = stockItems;
            } else if (targetId === 'KITCHEN') {
                targetItems = stockItems.filter(i => i.id.startsWith('K') || ['MEAT','SEAFOOD','VEG','NOODLE','DRY','SAUCE','HQ','FRESH'].includes(i.category));
                if (subTarget) targetItems = targetItems.filter(i => i.category === subTarget);
            } else if (targetId === 'BAR') {
                targetItems = stockItems.filter(i => i.id.startsWith('B') || ['TEA','FRUIT','RTD','MISC','DRINK'].includes(i.category));
            } else if (targetId === 'GENERAL') {
                targetItems = stockItems.filter(i => i.id.startsWith('S') || i.id.startsWith('G') || i.category === 'PACKAGING');
            }
        } else if (type === 'SUPPLIER') {
            const supplier = suppliers.find(s => s.id === targetId);
            if (!supplier) return;
            
            targetItems = stockItems.filter(i => {
                const allM = findAllSuppliersForStock(i.id);
                return allM.some(m => m.supplier.id === targetId);
            });
        }

        const lowItems = targetItems.filter(i => i.currentQty <= i.minLevel);

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
            const targetQty = item.maxQty > 0 ? (item.maxQty - item.currentQty) : (item.minLevel - item.currentQty + 2);
            const fillQty = Math.max(1, Math.ceil(targetQty));
            
            if (!newDrafts[item.id] || newDrafts[item.id].qty === 0) {
                newDrafts[item.id] = {
                    stockId: item.id,
                    qty: fillQty,
                    unit: item.unit,
                    price: item.cost,
                    ratio: 1
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
    }, [stockItems, suppliers, orderDrafts, findAllSuppliersForStock]);

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
            
            if (match) {
                const { supplier, catalogItem } = match;
                    
                if (!supplierGroups.has(supplier.id)) {
                    supplierGroups.set(supplier.id, { supplier, items: [] });
                }
                
                supplierGroups.get(supplier.id)!.items.push({
                    stockId: catalogItem.id,
                    name: catalogItem.name,
                    orderQty: draft.qty,
                    unit: draft.unit,
                    ratio: draft.ratio || 1,
                    cost: draft.price || 0,
                    supplierCode: catalogItem.supplierCode || ''
                });
            } else {
                adhocItems.push({
                    stockId: draft.stockId,
                    name: stockItem?.name || draft.stockId,
                    orderQty: draft.qty,
                    unit: draft.unit,
                    ratio: draft.ratio || 1,
                    cost: draft.price || 0,
                    supplierCode: 'N/A'
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
                
                const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 });
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
            pdf.save(`PO_${po.id}.pdf`);
        } catch (err) {
            console.error(err);
            alert("PDF Generation Error");
        } finally {
            setIsGeneratingPdf(false);
            setPrintingPO(null);
        }
    };

    const initiateReceive = useCallback((po: PurchaseOrder) => {
        setReceivingPO(po);
        setReceivedItems(po.items.map(i => ({ 
            ...i, 
            receivedQty: i.orderQty, 
            finalCost: i.cost,
            billByWeight: false,
            receivedWeight: 0
        })));
        setReceiveTax(0);
        setReceiveDelivery(0);
        setIsReceiveModalOpen(true);
    }, []);

    const confirmReceive = async () => {
        if (!receivingPO) return;
        setIsProcessingReceive(true);
        try {
            const itemsTotal = receivedItems.reduce((sum: number, item) => {
                if (item.billByWeight && item.receivedWeight) {
                    return sum + (item.receivedWeight * item.finalCost);
                } else {
                    return sum + (item.receivedQty * item.finalCost);
                }
            }, 0);

            const finalTotal = Math.round((itemsTotal + (receiveTax || 0) + (receiveDelivery || 0)) * 100) / 100;
            
            const supplier = suppliers.find(s => s.id === receivingPO.supplierId);
            const billCategory = supplier?.category || 'SUPPLIER';
            
            const stockUpdates = new Map<string, { qtyDelta: number, newCost: number }>();
            
            receivedItems.forEach((item) => {
                let inventoryId: string | null = null;
                let ratio = item.ratio || 1;

                if (supplier && supplier.catalog) {
                    const catalogItem = supplier.catalog.find(c => c.id === item.stockId);
                    if (catalogItem && catalogItem.linkedStockId) {
                        inventoryId = catalogItem.linkedStockId;
                    }
                }

                if (!inventoryId) {
                    const directStock = stockItems.find(s => s.id === item.stockId);
                    if (directStock) {
                        inventoryId = directStock.id;
                    }
                }

                if (inventoryId) {
                    const baseQtyDelta = item.receivedQty * ratio;
                    
                    let baseUnitCost = 0;
                    if (item.billByWeight && item.receivedWeight && item.receivedQty > 0) {
                        const totalLineCost = item.receivedWeight * item.finalCost;
                        baseUnitCost = (totalLineCost / item.receivedQty) / ratio;
                    } else {
                        baseUnitCost = item.finalCost / ratio; 
                    }
                    
                    const existing = stockUpdates.get(inventoryId) || { qtyDelta: 0, newCost: 0 };
                    stockUpdates.set(inventoryId, { qtyDelta: existing.qtyDelta + baseQtyDelta, newCost: baseUnitCost });
                }
            });

            const updatedStockList = stockItems.map(stockItem => {
                const update = stockUpdates.get(stockItem.id);
                if (update) {
                    return { ...stockItem, currentQty: (stockItem.currentQty || 0) + update.qtyDelta, cost: update.newCost };
                }
                return stockItem;
            });

            // ⚡ 增量更新：只写有变动的物品，避免全量写回爆配额
            const changedItems: StockItem[] = [];
            stockUpdates.forEach((update, stockId) => {
                const original = stockItems.find(s => s.id === stockId);
                if (original) {
                    changedItems.push({
                        ...original,
                        currentQty: (original.currentQty || 0) + update.qtyDelta,
                        cost: update.newCost
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

            const updatedPO = { ...receivingPO, status: 'RECEIVED' as const };
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

            alert("✅ 入库成功！库存已更新，成本已更新。");
            setIsReceiveModalOpen(false);
            setReceivingPO(null); 
        } catch (error) {
            console.error("Receive Error", error);
            alert("入库失败，请重试");
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
        stockItems.filter(i => i.currentQty <= i.minLevel).length,
        [stockItems]
    );

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
                                                    className="h-9 px-3 bg-blue-600 text-white rounded-xl font-black text-[10px] flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-sm active:scale-95 whitespace-nowrap"
                                                >
                                                    <Zap size={13} fill="currentColor"/>
                                                    <span className="hidden sm:inline">智能补货</span>
                                                    <span className="sm:hidden">补货</span>
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

                                    {/* ====== ITEM LIST (OPTIMIZED MOBILE) ====== */}
                                    <div className="flex-grow overflow-y-auto bg-[#F5F7FA]" style={{ paddingBottom: cartTotalCount > 0 ? 'calc(120px + env(safe-area-inset-bottom, 0px))' : '20px' }}>
                                        <div className="p-2.5 md:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
                                            {filteredStock.map(item => {
                                                const allMatches = findAllSuppliersForStock(item.id);
                                                const isLow = item.currentQty <= item.minLevel;
                                                const draft = orderDrafts[item.id] || { stockId: item.id, qty: 0, unit: item.unit, price: item.cost, ratio: 1 };
                                                const unitOptions = [{ label: item.unit, value: item.unit, ratio: 1 }, ...(item.uomOptions || [])];
                                                const hasDraft = draft.qty > 0;
                                                const selectedSupplierId = draft.selectedSupplierId || allMatches[0]?.supplier.id;

                                                return (
                                                    <div key={item.id} className={`bg-white rounded-2xl shadow-sm border-2 transition-all relative ${hasDraft ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A]/30' : isLow ? 'border-red-200' : 'border-transparent'}`}>
                                                        
                                                        {/* ===== MOBILE CARD (sm:hidden) ===== */}
                                                        <div className="sm:hidden p-3 flex flex-col gap-2">
                                                            {/* Row 1: Name + Stock Badge */}
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="font-black text-[13px] text-[#1A1A1A] leading-tight truncate">{item.name}</h4>
                                                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                                        <span className="text-[8px] font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-400 font-bold">{item.id}</span>
                                                                        {allMatches.length === 0 && (
                                                                            <span className="text-[8px] font-bold bg-gray-50 text-gray-400 px-1 py-0.5 rounded">无供应商</span>
                                                                        )}
                                                                        {allMatches.length === 1 && !hasDraft && (
                                                                            <span className="text-[8px] font-bold bg-blue-50 text-blue-500 px-1 py-0.5 rounded truncate max-w-[100px] flex items-center gap-0.5"><Truck size={8}/>{allMatches[0].supplier.name.slice(0,10)}</span>
                                                                        )}
                                                                        {allMatches.length > 1 && !hasDraft && (
                                                                            <span className="text-[8px] font-bold bg-purple-50 text-purple-500 px-1 py-0.5 rounded flex items-center gap-0.5"><Truck size={8}/> {allMatches.length}家可选</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col items-end shrink-0">
                                                                    <div className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isLow ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                                        {item.currentQty}/{item.minLevel}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Row 2: Multi-Supplier Selector (only when editing & 2+ suppliers) */}
                                                            {hasDraft && allMatches.length > 1 && (
                                                                <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
                                                                    {allMatches.map(({ supplier, catalogItem }) => (
                                                                        <button
                                                                            key={supplier.id}
                                                                            onClick={() => updateDraftSupplier(item.id, supplier.id, catalogItem, item)}
                                                                            className={`shrink-0 text-[9px] font-black px-2 py-1.5 rounded-lg border-2 transition-all active:scale-95 flex items-center gap-1 ${
                                                                                selectedSupplierId === supplier.id 
                                                                                    ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A]' 
                                                                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                                                            }`}
                                                                        >
                                                                            <Truck size={9}/>
                                                                            <span className="truncate max-w-[60px]">{supplier.name.slice(0, 8)}</span>
                                                                            <span className="opacity-70">RM{catalogItem.price.toFixed(1)}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Row 3: Unit + Qty Controls */}
                                                            <div className="flex items-center gap-1.5">
                                                                {/* Unit selector */}
                                                                <select 
                                                                    value={draft.unit} 
                                                                    onChange={e => updateDraft(item.id, 'unit', e.target.value, item)} 
                                                                    className="bg-gray-100 text-[10px] font-black text-[#1A1A1A] rounded-lg px-1.5 py-2 outline-none cursor-pointer appearance-none w-auto max-w-[52px] shrink-0"
                                                                >
                                                                    {unitOptions.map((u, idx) => (
                                                                        <option key={idx} value={u.value}>{u.value}</option>
                                                                    ))}
                                                                </select>

                                                                {/* Minus */}
                                                                <button onClick={() => handleQuickAdd(item, -1)} className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 active:scale-90 flex items-center justify-center transition-all shrink-0">
                                                                    <Minus size={14} strokeWidth={2.5}/>
                                                                </button>
                                                                
                                                                {/* Qty input */}
                                                                <input
                                                                    type="number"
                                                                    inputMode="numeric"
                                                                    min="0"
                                                                    value={draft.qty || ''}
                                                                    placeholder="0"
                                                                    onChange={(e) => {
                                                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                                        if (!isNaN(val)) updateDraft(item.id, 'qty', Math.max(0, val), item);
                                                                    }}
                                                                    className="w-12 h-8 text-center font-black text-sm text-[#1A1A1A] bg-white border-2 border-gray-200 rounded-lg outline-none focus:border-[#1A1A1A] transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                                />
                                                                
                                                                {/* Plus */}
                                                                <button onClick={() => handleQuickAdd(item, 1)} className="w-8 h-8 rounded-lg bg-[#1A1A1A] text-[#FFD700] active:scale-90 flex items-center justify-center transition-all shadow-sm shrink-0">
                                                                    <Plus size={14} strokeWidth={2.5}/>
                                                                </button>

                                                                {/* Quick buttons */}
                                                                <button onClick={() => handleQuickAdd(item, 5)} className="h-8 px-2 rounded-lg bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 shrink-0">
                                                                    +5
                                                                </button>
                                                                <button onClick={() => {
                                                                    const target = item.maxQty || 30;
                                                                    const needed = Math.max(0, target - item.currentQty);
                                                                    updateDraft(item.id, 'qty', needed, item);
                                                                }} className="h-8 px-2 rounded-lg bg-orange-50 active:scale-95 text-[10px] font-bold text-orange-600 border border-orange-100 shrink-0">
                                                                    满
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* ===== DESKTOP CARD (hidden sm:flex) ===== */}
                                                        <div className="hidden sm:flex flex-col justify-between p-4 h-full">
                                                            {/* Status Badge */}
                                                            <div className="absolute top-3 right-3 flex flex-col items-end">
                                                                <div className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isLow ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                                    库存: {item.currentQty}
                                                                </div>
                                                                <div className="text-[8px] text-gray-400 font-bold mt-0.5">Min: {item.minLevel}</div>
                                                            </div>

                                                            {/* Item Info */}
                                                            <div className="mb-3 pr-20">
                                                                <h4 className="font-black text-sm text-[#1A1A1A] line-clamp-2 leading-tight mb-1">{item.name}</h4>
                                                                <div className="flex flex-wrap gap-1">
                                                                    <span className="text-[8px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{item.id}</span>
                                                                    {allMatches.length === 0 ? (
                                                                        <span className="text-[8px] font-bold bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded">无供应商</span>
                                                                    ) : allMatches.length === 1 ? (
                                                                        <span className="text-[8px] font-bold bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Truck size={8}/>{allMatches[0].supplier.name.slice(0, 12)}</span>
                                                                    ) : !hasDraft ? (
                                                                        <span className="text-[8px] font-bold bg-purple-50 text-purple-500 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Truck size={8}/> {allMatches.length} 家可选</span>
                                                                    ) : null}
                                                                </div>

                                                                {/* Multi-Supplier Selector (Desktop) */}
                                                                {hasDraft && allMatches.length > 1 && (
                                                                    <div className="flex flex-col gap-1 mt-2">
                                                                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">选择供应商 ↓</span>
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {allMatches.map(({ supplier, catalogItem }) => (
                                                                                <button
                                                                                    key={supplier.id}
                                                                                    onClick={() => updateDraftSupplier(item.id, supplier.id, catalogItem, item)}
                                                                                    className={`text-[8px] font-black px-2 py-1 rounded-lg border-2 transition-all flex items-center gap-0.5 active:scale-95 ${
                                                                                        selectedSupplierId === supplier.id 
                                                                                            ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A] shadow-sm' 
                                                                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                                                                    }`}
                                                                                >
                                                                                    <Truck size={8}/>{supplier.name.slice(0, 10)} · RM{catalogItem.price.toFixed(2)}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Controls */}
                                                            <div className="mt-auto pt-2">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1">
                                                                         <span className="text-[9px] font-bold text-gray-400 uppercase">UNIT</span>
                                                                         <select 
                                                                            value={draft.unit} 
                                                                            onChange={e => updateDraft(item.id, 'unit', e.target.value, item)} 
                                                                            className="bg-transparent text-xs font-black text-[#1A1A1A] outline-none cursor-pointer appearance-none pr-1"
                                                                         >
                                                                             {unitOptions.map((u, idx) => (
                                                                                 <option key={idx} value={u.value}>{u.value}</option>
                                                                             ))}
                                                                         </select>
                                                                    </div>
                                                                    <div className="text-[10px] font-mono text-gray-400">
                                                                         RM {draft.price.toFixed(2)}
                                                                    </div>
                                                                </div>

                                                                <div className="select-none">
                                                                    <div className="flex items-center justify-center gap-2 mb-2">
                                                                        <button onClick={() => handleQuickAdd(item, -1)} className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-90 flex items-center justify-center transition-all shrink-0">
                                                                            <Minus size={18} strokeWidth={2.5}/>
                                                                        </button>
                                                                        <input
                                                                            type="number"
                                                                            inputMode="numeric"
                                                                            min="0"
                                                                            value={draft.qty || ''}
                                                                            placeholder="0"
                                                                            onChange={(e) => {
                                                                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                                                if (!isNaN(val)) updateDraft(item.id, 'qty', Math.max(0, val), item);
                                                                            }}
                                                                            className="w-16 h-10 text-center font-black text-lg text-[#1A1A1A] bg-white border-2 border-gray-200 rounded-xl outline-none focus:border-[#1A1A1A] transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                                        />
                                                                        <button onClick={() => handleQuickAdd(item, 1)} className="w-10 h-10 rounded-xl bg-[#1A1A1A] text-[#FFD700] hover:bg-black active:scale-90 flex items-center justify-center transition-all shadow-md shrink-0">
                                                                            <Plus size={18} strokeWidth={2.5}/>
                                                                        </button>
                                                                    </div>

                                                                    <div className="flex items-center justify-center gap-1.5">
                                                                        <button onClick={() => handleQuickAdd(item, -5)} className="px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-400 border border-gray-100 transition-all">
                                                                            −5
                                                                        </button>
                                                                        <button onClick={() => handleQuickAdd(item, 5)} className="px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 border border-gray-100 transition-all">
                                                                            +5
                                                                        </button>
                                                                        <button onClick={() => handleQuickAdd(item, 10)} className="px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 border border-gray-100 transition-all">
                                                                            +10
                                                                        </button>
                                                                        <button onClick={() => {
                                                                            const target = item.maxQty || 30;
                                                                            const needed = Math.max(0, target - item.currentQty);
                                                                            updateDraft(item.id, 'qty', needed, item);
                                                                        }} className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 active:scale-95 text-[10px] font-bold text-orange-600 border border-orange-100 transition-all">
                                                                            补满
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="text-center mt-1.5">
                                                                    <span className="text-[8px] font-bold text-gray-400">
                                                                        目标: {item.maxQty || 30}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
                                                {displayOrders.slice(0, visibleOrderCount).map(po => (
                                                    <div key={po.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${po.status === 'RECEIVED' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                                                    {po.status === 'RECEIVED' ? <CheckCircle2 size={22}/> : <Clock size={22}/>}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="font-mono font-black text-base text-[#1A1A1A]">{po.id}</span>
                                                                        <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{po.date.split('T')[0]}</span>
                                                                    </div>
                                                                    <div className="font-bold text-gray-500 text-xs flex items-center gap-1 mt-0.5 truncate"><Truck size={12}/> {po.supplierName}</div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-2 justify-end">
                                                                {po.status === 'ORDERED' && (
                                                                    <button onClick={() => initiateReceive(po)} className="bg-[#1A1A1A] text-[#FFD700] px-4 py-2 rounded-xl text-[11px] font-bold shadow-lg active:scale-95 flex items-center gap-1.5">
                                                                        <ClipboardCheck size={14}/> 收货
                                                                    </button>
                                                                )}
                                                                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                                                    <button onClick={() => sendWhatsapp(po)} className="p-2 bg-white text-green-600 rounded-md shadow-sm border border-gray-200"><Send size={16}/></button>
                                                                    <button onClick={() => handlePrintPDF(po)} className="p-2 bg-white text-blue-600 rounded-md shadow-sm border border-gray-200">
                                                                        {isGeneratingPdf && printingPO?.id === po.id ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16}/>}
                                                                    </button>
                                                                    <button onClick={() => setDeletePOCandidate(po.id)} className="p-2 bg-white text-red-600 rounded-md shadow-sm border border-gray-200"><Trash2 size={16}/></button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2 overflow-x-auto scrollbar-hide">
                                                            {po.items.map((item, idx) => (
                                                                <div key={idx} className="flex-shrink-0 bg-gray-50 px-2.5 py-1.5 rounded-lg text-[11px] border border-gray-100">
                                                                    <span className="font-bold text-[#1A1A1A]">{item.name}</span> <span className="text-gray-500">x{item.orderQty}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}

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
                                                                onClick={() => {
                                                                    const updated = [...receivedItems];
                                                                    updated[idx].billByWeight = !updated[idx].billByWeight;
                                                                    setReceivedItems(updated);
                                                                }}
                                                                className={`text-[9px] px-1.5 py-0.5 rounded border transition-all flex items-center gap-0.5 shrink-0 ${item.billByWeight ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                                                            >
                                                                <Scale size={9}/> 按重量
                                                            </button>
                                                        </div>
                                                        <div className="text-[9px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded w-fit">订: {item.orderQty} {item.unit}</div>
                                                        {item.billByWeight && item.receivedWeight ? (
                                                            <div className="mt-1 text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit flex items-center gap-0.5">
                                                                <Calculator size={9}/> 均价: RM {displayUnitCost}/{item.unit}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex gap-2 items-end flex-wrap">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 block">实收 ({item.unit})</label>
                                                        <div className="flex items-center">
                                                            <button onClick={() => {
                                                                const newVal = Math.max(0, item.receivedQty - 1);
                                                                setReceivedItems(prev => { const n = [...prev]; n[idx].receivedQty = newVal; return n; });
                                                            }} className="w-7 h-9 bg-gray-100 rounded-l-lg border border-r-0 border-gray-300 flex items-center justify-center font-bold hover:bg-gray-200 text-sm">-</button>
                                                            <input 
                                                                type="number" 
                                                                value={item.receivedQty} 
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setReceivedItems(prev => { const n = [...prev]; n[idx].receivedQty = val; return n; });
                                                                }}
                                                                className={`w-12 h-9 border-y border-gray-300 text-center font-black text-sm outline-none ${isShort ? 'text-red-600 bg-red-50' : 'bg-white'}`}
                                                            />
                                                            <button onClick={() => {
                                                                const newVal = item.receivedQty + 1;
                                                                setReceivedItems(prev => { const n = [...prev]; n[idx].receivedQty = newVal; return n; });
                                                            }} className="w-7 h-9 bg-gray-100 rounded-r-lg border border-l-0 border-gray-300 flex items-center justify-center font-bold hover:bg-gray-200 text-sm">+</button>
                                                        </div>
                                                    </div>

                                                    {item.billByWeight && (
                                                        <div>
                                                            <label className="text-[9px] font-bold text-orange-500 uppercase mb-0.5 block">重量 (KG)</label>
                                                            <input 
                                                                type="number" 
                                                                value={item.receivedWeight || ''}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setReceivedItems(prev => { const n = [...prev]; n[idx].receivedWeight = val; return n; });
                                                                }}
                                                                className="w-16 h-9 px-2 bg-orange-50 border border-orange-200 text-orange-800 rounded-lg text-center font-bold text-sm outline-none focus:border-orange-400"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                    )}

                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 block">
                                                            RM/{item.billByWeight ? 'KG' : item.unit}
                                                        </label>
                                                        <input 
                                                            type="number" 
                                                            value={item.finalCost} 
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                setReceivedItems(prev => { const n = [...prev]; n[idx].finalCost = val; return n; });
                                                            }}
                                                            className="w-16 h-9 px-2 bg-white border border-gray-300 rounded-lg text-center font-bold text-sm outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
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
                                        RM {(receivedItems.reduce((sum, i) => {
                                            if (i.billByWeight && i.receivedWeight) {
                                                return sum + (i.receivedWeight * i.finalCost);
                                            }
                                            return sum + (i.receivedQty * i.finalCost);
                                        }, 0) + (receiveTax || 0) + (receiveDelivery || 0)).toFixed(2)}
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
                                        alert("✅ 已删除");
                                    } catch (e) {
                                        console.error(e);
                                        alert("删除失败");
                                    } finally {
                                        setDeletePOCandidate(null);
                                    }
                                }} className="py-3 bg-red-600 text-white font-bold rounded-xl text-xs shadow-lg">确认删除</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* HIDDEN PRINT AREA */}
                <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                    {printingPO && (() => {
                         const itemsPerPage = ITEMS_PER_PAGE;
                         const pages: PurchaseOrderItem[][] = [];
                         for (let i = 0; i < Math.ceil(printingPO.items.length / itemsPerPage); i++) {
                             pages.push(printingPO.items.slice(i * itemsPerPage, (i + 1) * itemsPerPage));
                         }
                         return pages.map((pageItems, pageIndex) => (
                             <div key={pageIndex} id={`po-page-${pageIndex}`} className="w-[794px] h-[1123px] bg-white text-black font-sans relative flex flex-col" style={{ fontFamily: 'sans-serif' }}>
                                 <div className="h-2 bg-gradient-to-r from-[#8B0000] via-[#C00000] to-[#8B0000]"></div>
                                 
                                 <div className="flex flex-col flex-1 px-12 pt-8 pb-6">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h1 className="text-4xl font-black tracking-wider text-gray-800 leading-none">PURCHASE</h1>
                                            <h1 className="text-4xl font-black tracking-wider text-gray-800 leading-none">ORDER</h1>
                                            <p className="text-xs font-bold text-[#8B0000] mt-2 tracking-widest uppercase">Kim Lian Kee (Kepong)</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-mono font-black text-gray-800 tracking-tight">{printingPO?.id}</p>
                                            <p className="text-sm font-semibold text-gray-500 mt-1">{printingPO?.date.split('T')[0]}</p>
                                            {printingPO?.createdBy && <p className="text-xs text-gray-400 mt-1">By: <span className="font-semibold text-gray-500">{printingPO.createdBy}</span></p>}
                                        </div>
                                    </div>

                                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">To Supplier:</p>
                                        <h2 className="text-xl font-bold text-gray-800">{printingPO?.supplierName}</h2>
                                    </div>

                                    <div className="flex-1">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b-2 border-gray-800">
                                                    <th className="py-2 text-[10px] font-black uppercase text-gray-500 tracking-wider w-8">#</th>
                                                    <th className="py-2 text-[10px] font-black uppercase text-gray-500 tracking-wider">Item Name</th>
                                                    <th className="py-2 text-[10px] font-black uppercase text-gray-500 tracking-wider text-center w-24">Qty</th>
                                                    <th className="py-2 text-[10px] font-black uppercase text-gray-500 tracking-wider text-center w-24">Unit</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pageItems.map((item, i) => (
                                                    <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                        <td className="py-3 text-xs text-gray-300 font-mono">{pageIndex * itemsPerPage + i + 1}</td>
                                                        <td className="py-3">
                                                            <span className="text-base font-bold text-gray-800 leading-tight">{item.name}</span>
                                                            {item.supplierCode && <span className="text-[10px] text-gray-400 block font-normal mt-0.5">{item.supplierCode}</span>}
                                                        </td>
                                                        <td className="py-3 text-lg font-mono text-center font-bold text-gray-800">{item.orderQty}</td>
                                                        <td className="py-3 text-xs font-semibold text-center uppercase text-gray-500 tracking-wide">{item.unit}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        
                                        {pageIndex === pages.length - 1 && (
                                            <div className="mt-4 flex justify-end">
                                                <div className="bg-gray-50 rounded-lg px-5 py-2 border border-gray-200">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Items: </span>
                                                    <span className="text-sm font-black text-gray-800">{printingPO.items.length}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-auto pt-6">
                                        {pageIndex === pages.length - 1 && (
                                            <div className="flex justify-between items-end mt-4">
                                                <div className="flex-1">
                                                    <div className="w-48 border-b-2 border-gray-300 mb-1"></div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Authorized Signature</p>
                                                </div>
                                                <div className="flex-1 text-right">
                                                    <div className="w-48 border-b-2 border-gray-300 mb-1 ml-auto"></div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Received By (Supplier)</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                                            <p className="text-[9px] text-gray-300">Generated by 御膳智控 ERP</p>
                                            <p className="text-[9px] text-gray-400 font-mono">Page {pageIndex + 1} of {pages.length}</p>
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