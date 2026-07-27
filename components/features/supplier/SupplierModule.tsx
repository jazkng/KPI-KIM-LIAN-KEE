import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Truck, Plus, Search, Phone, Edit3, Trash2, X, FileText, 
    Package, Send, ArrowLeft, Box,
    FileDown, Receipt, UserCircle, ChevronUp, ChevronDown,
    User, ClipboardCheck,
    Loader2, MessageCircle,
    ShoppingBag, Star, CalendarOff 
} from 'lucide-react';
import { Supplier, CatalogItem, PurchaseOrder, StockItem, PurchaseOrderItem, UomOption, ExpenseItem } from '../../../types';
import { normalizeCatalogItem } from '../../utils';
import { DataManager } from '../../../utils/dataManager';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas-pro';
import { applyResolvedStylesForPdf, waitForPdfFonts } from '../../../utils/pdfStyleResolver';
import {
    calculateWeightedAverageCost,
    getCostPerBaseUnit,
    getCurrentQtyBase,
    roundQuantity,
    toPositiveNumber
} from '../../../utils/unitConversion';

import { collection, getDocs, query, where, limit, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from '../../../firebaseConfig';
import { ModuleGuideButton } from '../../ui/ModuleGuide';

// 子组件
import { SupplierEditModal } from './SupplierEditModal';
import { ProductEditModal } from './ProductEditModal';
import { BillFormModal } from './BillFormModal';
import { ReceivePOModal } from './ReceivePOModal';
import { POCart } from './POCart';
import { DeleteProductModal, DeletePOModal, DeleteSupplierModal } from './SupplierDeleteModals';

// 共用常量
import { 
    ITEMS_PER_PAGE, DEFAULT_UOMS, CATEGORY_MAP, SUP_LABEL_STYLE, SupplierReceivedItem 
} from './supplierConstants';

interface SupplierModuleProps {
    onClose?: () => void;
    isModal?: boolean;
    onNavigateToStock?: (stockId: string) => void;
}

export const SupplierModule: React.FC<SupplierModuleProps> = ({ onClose, isModal = false, onNavigateToStock }) => {
    const [mainTab, setMainTab] = useState<'SUPPLIERS' | 'POS'>('SUPPLIERS');
    const [view, setView] = useState<'LIST' | 'DETAIL'>('LIST');

    // 👑 快捷金融汇入/文本复制一键存储状态与方法
    const [copiedText, setCopiedText] = useState<string | null>(null);
    const copyToClipboard = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopiedText(type);
        setTimeout(() => setCopiedText(null), 1800);
    };
    
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [allStockList, setAllStockList] = useState<StockItem[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
    const [activeDetailTab, setActiveDetailTab] = useState<'CATALOG' | 'BILLS'>('CATALOG');
    const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
    const [isBillFormOpen, setIsBillFormOpen] = useState(false);
    const [newBill, setNewBill] = useState<Partial<ExpenseItem>>({});

    const [isEditingSupplier, setIsEditingSupplier] = useState(false);
    const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});
    
    const [isEditingProduct, setIsEditingProduct] = useState(false);
    const [productForm, setProductForm] = useState<Partial<CatalogItem>>({});
    const [productUoms, setProductUoms] = useState<UomOption[]>(DEFAULT_UOMS);
    const [stockSearchTerm, setStockSearchTerm] = useState('');

    const [isCreatingPO, setIsCreatingPO] = useState(false);
    const [cart, setCart] = useState<PurchaseOrderItem[]>([]);
    const [isCartExpanded, setIsCartExpanded] = useState(true);

    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
    const [receivedItems, setReceivedItems] = useState<SupplierReceivedItem[]>([]); 
    const [isProcessingReceive, setIsProcessingReceive] = useState(false);

    const [deleteProductCandidate, setDeleteProductCandidate] = useState<Partial<CatalogItem> | null>(null);
    const [deletePOCandidate, setDeletePOCandidate] = useState<string | null>(null);
    const [deleteSupplierId, setDeleteSupplierId] = useState<string | null>(null);

    const printRef = useRef<HTMLDivElement>(null);
    const [printingPO, setPrintingPO] = useState<PurchaseOrder | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isSyncingName, setIsSyncingName] = useState(false);

    // Supplier Unpaid Bills Export State
    const [isExportingUnpaidBills, setIsExportingUnpaidBills] = useState(false);
    const [isExportingAllBills, setIsExportingAllBills] = useState(false);
    const [supplierPrintBills, setSupplierPrintBills] = useState<ExpenseItem[]>([]);
    const supplierPrintRef = useRef<HTMLDivElement>(null);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportSearchTerm, setExportSearchTerm] = useState('');
    const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);

    const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [cleaningLogs, setCleaningLogs] = useState<string[]>([]);
    const [manualSourceId, setManualSourceId] = useState('');
    const [manualTargetId, setManualTargetId] = useState('');

    const detectedDuplicateGroups = useMemo(() => {
        const groups: Record<string, Supplier[]> = {};
        suppliers.forEach(s => {
            const key = s.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });
        return Object.values(groups).filter(g => g.length >= 2);
    }, [suppliers]);

    const lowercaseSingleSuppliers = useMemo(() => {
        const duplicateIds = new Set(detectedDuplicateGroups.flat().map(s => s.id));
        return suppliers.filter(s => {
            if (duplicateIds.has(s.id)) return false;
            return /[a-z]/.test(s.name);
        });
    }, [suppliers, detectedDuplicateGroups]);

    // ============================================================
    // Data Loading
    // ============================================================
    useEffect(() => { loadData(); }, []);
    useEffect(() => {
        if (selectedSupplier && activeDetailTab === 'BILLS') loadExpenses(selectedSupplier.name);
    }, [selectedSupplier, activeDetailTab]);

    const stockCacheRef = useRef<{ data: StockItem[], timestamp: number } | null>(null);
    const STOCK_CACHE_TTL = 5 * 60 * 1000;

    const loadData = async (forceRefreshStock = false) => {
        try {
            const supData = await DataManager.getSuppliers();
            setSuppliers(supData);

            const now = Date.now();
            if (!forceRefreshStock && stockCacheRef.current && (now - stockCacheRef.current.timestamp < STOCK_CACHE_TTL)) {
                setAllStockList(stockCacheRef.current.data);
            } else {
                const results = await Promise.all([
                    DataManager.getStock('KITCHEN'), DataManager.getStock('BAR'),
                    DataManager.getStock('GENERAL'), DataManager.getStock('FUEL')
                ]);
                const allRaw = results.flat();
                const deduped = Array.from(new Map(allRaw.map(item => [item.id, item])).values());
                stockCacheRef.current = { data: deduped, timestamp: now };
                setAllStockList(deduped);
            }

            const poData = await DataManager.getPurchaseOrders();
            setPurchaseOrders(poData.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 35));
        } catch (error) {
            console.error("Failed to load supplier data", error);
        }
    };

    const loadExpenses = async (supplierName?: string) => {
        if (!supplierName) return;
        try {
            const q = query(collection(db, 'standalone_expenses'), where('company', '==', supplierName), limit(200));
            const snap = await getDocs(q);
            const items: ExpenseItem[] = [];
            snap.forEach(doc => items.push(doc.data() as ExpenseItem));
            setExpenses(items);
        } catch (err) { console.error("Failed to load expenses", err); }
    };

    // ============================================================
    // Computed Values
    // ============================================================
    const supplierExpenses = useMemo(() => {
        if (!selectedSupplier) return [];
        return expenses.filter(e => e.company === selectedSupplier.name).sort((a, b) => b.time.localeCompare(a.time));
    }, [expenses, selectedSupplier]);

    const billStats = useMemo(() => {
        let total = 0, outstanding = 0;
        supplierExpenses.forEach(b => {
            total += b.totalBillAmount || b.amount || 0;
            outstanding += b.outstandingAmount || 0;
        });
        return { total, outstanding, paid: total - outstanding };
    }, [supplierExpenses]);

    const groupedByMonth = useMemo(() => {
        const groups: Record<string, { bills: ExpenseItem[], total: number, count: number, monthName: string, year: string }> = {};
        supplierExpenses.forEach(bill => {
            const date = new Date(bill.time);
            const y = isNaN(date.getTime()) ? 'Unknown' : date.getFullYear().toString();
            const m = isNaN(date.getTime()) ? 'Unknown' : (date.getMonth() + 1).toString();
            const key = `${y}-${m.padStart(2, '0')}`;
            
            if (!groups[key]) {
                const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const mIdx = isNaN(date.getTime()) ? -1 : date.getMonth();
                const mName = mIdx >= 0 ? monthNamesEn[mIdx] : 'Unknown';
                groups[key] = {
                    bills: [],
                    total: 0,
                    count: 0,
                    monthName: mName,
                    year: y
                };
            }
            groups[key].bills.push(bill);
            groups[key].total += (bill.totalBillAmount || bill.amount || 0);
            groups[key].count += 1;
        });
        
        return Object.entries(groups)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([key, val]) => ({ key, ...val }));
    }, [supplierExpenses]);

    useEffect(() => {
        if (groupedByMonth.length > 0) {
            const latestKey = groupedByMonth[0].key;
            setExpandedMonths({ [latestKey]: true });
        } else {
            setExpandedMonths({});
        }
    }, [selectedSupplier]);

    const filteredSuppliers = useMemo(() => {
        return suppliers
            .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.category.toLowerCase().includes(searchTerm.toLowerCase()) || s.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())) || s.id.includes(searchTerm))
            .sort((a, b) => { if (a.isFavorite && !b.isFavorite) return -1; if (!a.isFavorite && b.isFavorite) return 1; return a.name.localeCompare(b.name); });
    }, [suppliers, searchTerm]);

    const filteredExportSuppliers = useMemo(() => {
        return suppliers
            .filter(s => s.name.toLowerCase().includes(exportSearchTerm.toLowerCase()) || s.id.includes(exportSearchTerm))
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [suppliers, exportSearchTerm]);

    // ============================================================
    // Supplier CRUD
    // ============================================================
    const handleOpenAddSupplier = () => {
        const numericIds = suppliers.map(s => parseInt(s.id)).filter(n => !isNaN(n));
        const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 8000;
        const nextId = (maxId < 8000 ? 8001 : maxId + 1).toString();
        setSupplierForm({ id: nextId, status: 'ACTIVE', paymentTerm: 'COD', category: 'SUPPLIER' });
        setIsEditingSupplier(true);
    };

    const handleSaveSupplier = async () => {
        if (!supplierForm.name) return alert("Supplier Name is required");
        if (!supplierForm.id) return alert("Supplier ID is required");
        setIsSyncingName(true);
        try {
            const rawSup: Supplier = {
                ...supplierForm as Supplier, id: supplierForm.id,
                status: supplierForm.status || 'ACTIVE',
                catalog: supplierForm.catalog || (selectedSupplier?.id === supplierForm.id ? selectedSupplier.catalog : []),
                tags: supplierForm.tags || [], contact: supplierForm.contact || '',
                category: supplierForm.category || 'SUPPLIER',
                restDayNote: supplierForm.restDayNote || '', isFavorite: supplierForm.isFavorite || false
            };
            const newSup = JSON.parse(JSON.stringify(rawSup));
            await DataManager.saveSupplier(newSup);
            await loadData();
            setIsEditingSupplier(false);
            if (selectedSupplier && selectedSupplier.id === newSup.id) setSelectedSupplier(newSup);
        } catch (e) { console.error("Save Supplier Error", e); alert("保存失败，请检查网络"); }
        finally { setIsSyncingName(false); }
    };

    const handleToggleFavorite = async (e: React.MouseEvent, sup: Supplier) => {
        e.stopPropagation();
        const updatedSup = { ...sup, isFavorite: !sup.isFavorite };
        setSuppliers(prev => prev.map(s => s.id === sup.id ? updatedSup : s));
        try { await DataManager.saveSupplier(updatedSup); }
        catch (err) { console.error(err); setSuppliers(prev => prev.map(s => s.id === sup.id ? sup : s)); }
    };

    const executeDeleteSupplier = async () => {
        if (!deleteSupplierId) return;
        try {
            await DataManager.deleteSupplier(deleteSupplierId);
            await loadData();
            if (selectedSupplier?.id === deleteSupplierId) { setSelectedSupplier(null); setView('LIST'); }
            setDeleteSupplierId(null);
        } catch (e) { console.error(e); alert("删除失败"); }
    };

    // ============================================================
    // Bills
    // ============================================================
    const handleOpenBillForm = () => {
        if (!selectedSupplier) return;
        setNewBill({ company: selectedSupplier.name, category: selectedSupplier.category || 'SUPPLIER', amount: 0, totalBillAmount: 0, paymentStatus: 'UNPAID', time: new Date().toISOString(), paymentMethod: 'BANK_TRANSFER', paidBy: 'COMPANY' });
        setIsBillFormOpen(true);
    };

    const handleSaveBill = async () => {
        if (!newBill.totalBillAmount) return alert("Please enter amount");
        const fullTotal = Math.round((Number(newBill.totalBillAmount) || 0) * 100) / 100;
        const isPaid = newBill.paymentStatus === 'PAID';
        const paidAmt = isPaid ? fullTotal : Math.round((Number(newBill.amount) || 0) * 100) / 100;
        const outstandingAmt = Math.round((fullTotal - paidAmt) * 100) / 100;
        const finalBill: ExpenseItem = {
            id: `exp_${Date.now()}`, category: newBill.category || 'SUPPLIER', expenseType: 'GENERAL',
            company: selectedSupplier?.name || newBill.company || 'Unknown', amount: paidAmt,
            outstandingAmount: outstandingAmt, totalBillAmount: fullTotal,
            paymentStatus: newBill.paymentStatus, time: newBill.time || new Date().toISOString(),
            paymentMethod: newBill.paymentMethod || 'BANK_TRANSFER', note: newBill.note || '',
            paidBy: newBill.paidBy || 'COMPANY', dueDate: newBill.dueDate
        };
        if (finalBill.outstandingAmount! <= 0) finalBill.paymentStatus = 'PAID';
        else if (finalBill.outstandingAmount! < (finalBill.totalBillAmount || 0)) finalBill.paymentStatus = 'PARTIAL';
        else finalBill.paymentStatus = 'UNPAID';
        await DataManager.saveStandaloneExpense(finalBill);
        await loadExpenses(selectedSupplier?.name);
        setIsBillFormOpen(false);
        alert("✅ 账单已录入");
    };

    // ============================================================
    // Product CRUD
    // ============================================================
    const handleAddProduct = () => { setProductForm({ unit: 'unit', price: 0 }); setProductUoms(DEFAULT_UOMS); setIsEditingProduct(true); };

    const handleSaveProduct = async () => {
        if (!selectedSupplier || !productForm.name || !productForm.price) return alert("Name and Price required");
        const baseUnit = productForm.unit || 'unit';
        let validUoms = productForm.uomOptions || [];
        if (!validUoms.find(u => u.value === 'BASE' || u.ratio === 1)) {
            validUoms = [{ label: `1 ${baseUnit} (Base)`, value: 'BASE', ratio: 1 }, ...validUoms];
        }
        
        const rawItem: CatalogItem = { 
            id: productForm.id || `cat_${Date.now()}`, 
            name: productForm.name, 
            unit: baseUnit, 
            price: Number(productForm.price), 
            category: productForm.category || 'GENERAL', 
            uomOptions: productUoms, 
            linkedStockId: productForm.linkedStockId, 
            supplierCode: productForm.supplierCode,
            linkedPurchaseUnitId: productForm.linkedPurchaseUnitId,
            purchaseUnitName: productForm.purchaseUnitName,
            toBaseRatio: productForm.toBaseRatio,
            baseUnit: productForm.baseUnit,
            displayUnit: productForm.displayUnit,
            displayToBaseRatio: productForm.displayToBaseRatio,
            pricePerPurchaseUnit: productForm.pricePerPurchaseUnit !== undefined ? Number(productForm.pricePerPurchaseUnit) : Number(productForm.price),
            costPerBaseUnit: productForm.costPerBaseUnit,
            pricingMode: productForm.pricingMode,
            orderUnit: productForm.orderUnit,
            billingUnit: productForm.billingUnit,
            pricePerBillingUnit: productForm.pricePerBillingUnit,
            estimatedWeightPerUnit: productForm.estimatedWeightPerUnit,
            conversionMode: productForm.conversionMode,
            purchaseUnit: productForm.purchaseUnit,
            pricingUnit: productForm.pricingUnit,
            pricePerPricingUnit: productForm.pricePerPricingUnit
        };

        const normalized = normalizeCatalogItem(rawItem, allStockList);
        const newItem = JSON.parse(JSON.stringify(normalized));
        const updatedCatalog = selectedSupplier.catalog ? [...selectedSupplier.catalog] : [];
        const existIdx = updatedCatalog.findIndex(i => i.id === newItem.id);
        if (existIdx >= 0) updatedCatalog[existIdx] = newItem; else updatedCatalog.push(newItem);
        const updatedSupplier = { ...selectedSupplier, catalog: updatedCatalog };
        await DataManager.saveSupplier(updatedSupplier);

        if (newItem.linkedStockId) {
            const targetStock = allStockList.find(s => s.id === newItem.linkedStockId);
            if (targetStock) {
                const type = (CATEGORY_MAP[targetStock.category] || 'KITCHEN') as 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL';
                const isWeightBased = newItem.pricingMode === 'WEIGHT_BASED' || newItem.conversionMode === 'ACTUAL_WEIGHT';

                if (isWeightBased) {
                    // 供应商报价属于采购资料；库存移动平均成本只能在实际收货时改变。
                    await DataManager.saveStockItem(type, {
                        ...targetStock,
                        uomOptions: newItem.uomOptions,
                        conversionMode: 'ACTUAL_WEIGHT',
                        requiresActualWeightOnReceive: true,
                        purchaseUnit: newItem.orderUnit || newItem.purchaseUnit || newItem.unit,
                        pricingUnit: newItem.billingUnit || newItem.pricingUnit || targetStock.baseUnit || targetStock.unit,
                        pricePerPricingUnit: Math.max(0, Number(newItem.pricePerBillingUnit ?? newItem.pricePerPricingUnit ?? newItem.price) || 0)
                    });
                } else {
                    const purchaseUnitName = newItem.purchaseUnitName || newItem.unit || targetStock.baseUnit || targetStock.unit;
                    const requestedPurchaseUnitId = newItem.linkedPurchaseUnitId || `supplier_${newItem.id}`;
                    const purchasePrice = Math.max(0, Number(newItem.pricePerPurchaseUnit ?? newItem.price) || 0);
                    const purchaseRatio = toPositiveNumber(newItem.toBaseRatio, 1);
                    const purchaseUnits = [...(targetStock.purchaseUnits || [])];
                    const matchingIndex = purchaseUnits.findIndex(unit =>
                        unit.id === requestedPurchaseUnitId || unit.unitName.toLowerCase() === purchaseUnitName.toLowerCase()
                    );
                    const purchaseUnitId = matchingIndex >= 0
                        ? purchaseUnits[matchingIndex].id
                        : requestedPurchaseUnitId;
                    const purchaseRule = {
                        ...(matchingIndex >= 0 ? purchaseUnits[matchingIndex] : {}),
                        id: purchaseUnitId,
                        unitName: purchaseUnitName,
                        unitType: 'PURCHASE' as const,
                        toBaseRatio: purchaseRatio,
                        pricePerUnit: purchasePrice,
                        isDefaultPurchase: matchingIndex >= 0
                            ? purchaseUnits[matchingIndex].isDefaultPurchase
                            : purchaseUnits.length === 0
                    };

                    if (matchingIndex >= 0) purchaseUnits[matchingIndex] = purchaseRule;
                    else purchaseUnits.push(purchaseRule);

                    await DataManager.saveStockItem(type, {
                        ...targetStock,
                        uomOptions: newItem.uomOptions,
                        purchaseUnits,
                        defaultPurchaseUnitId: targetStock.defaultPurchaseUnitId || purchaseRule.id
                    });
                }
            }
        }
        setSelectedSupplier(updatedSupplier);
        setIsEditingProduct(false);
        setProductForm({});
        await loadData(true);
    };

    const executeDeleteProduct = async () => {
        if (!selectedSupplier || !deleteProductCandidate || !deleteProductCandidate.id) return;
        const updatedCatalog = selectedSupplier.catalog?.filter(i => i.id !== deleteProductCandidate.id) || [];
        const updatedSupplier = { ...selectedSupplier, catalog: updatedCatalog };
        await DataManager.saveSupplier(updatedSupplier);
        setSelectedSupplier(updatedSupplier);
        setDeleteProductCandidate(null);
        await loadData();
    };

    // ============================================================
    // Cart & PO
    // ============================================================
    const addToCart = (rawItem: CatalogItem, selectedUom?: UomOption) => {
        const item = normalizeCatalogItem(rawItem, allStockList);
        const orderUnit = selectedUom ? selectedUom.value : (item.purchaseUnitName || item.unit);
        const orderRatio = selectedUom ? selectedUom.ratio : (item.toBaseRatio || 1);
        const orderCost = selectedUom?.price 
            ? selectedUom.price 
            : (item.pricePerPurchaseUnit !== undefined ? item.pricePerPurchaseUnit : item.price);

        const purchaseUnitId = selectedUom ? undefined : item.linkedPurchaseUnitId;
        const purchaseUnitName = selectedUom ? selectedUom.value : item.purchaseUnitName;
        const toBaseRatio = selectedUom ? selectedUom.ratio : item.toBaseRatio;
        const costPerBaseUnitAtReceive = selectedUom ? (orderCost / orderRatio) : item.costPerBaseUnit;

        setCart(prev => {
            const existing = prev.find(p => p.stockId === item.id && p.unit === orderUnit);
            if (existing) return prev.map(p => (p.stockId === item.id && p.unit === orderUnit) ? { ...p, orderQty: p.orderQty + 1 } : p);
            return [...prev, { 
                stockId: item.id, 
                name: item.name, 
                orderQty: 1, 
                unit: orderUnit, 
                ratio: orderRatio, 
                cost: orderCost, 
                supplierCode: item.supplierCode,
                purchaseUnitId,
                purchaseUnitName,
                toBaseRatio,
                costPerBaseUnitAtReceive
            }];
        });
        setIsCreatingPO(true);
        if (cart.length === 0) setIsCartExpanded(true);
    };

    const removeFromCart = (index: number) => { const c = [...cart]; c.splice(index, 1); setCart(c); if (c.length === 0) setIsCreatingPO(false); };
    
    const updateCartQty = (idx: number, qty: number) => { const c = [...cart]; c[idx].orderQty = qty; setCart(c); };

    const handleCreatePO = async () => {
        if (!selectedSupplier || cart.length === 0) return;
        const now = new Date();
        const todayPrefix = `PO${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const existingTodayPOs = purchaseOrders.filter(p => p.id.startsWith(todayPrefix));
        let maxSuffix = 0;
        existingTodayPOs.forEach(p => { const suffix = parseInt(p.id.replace(todayPrefix, ''), 10); if (!isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix; });
        const nextId = `${todayPrefix}${String(maxSuffix + 1).padStart(3, '0')}`;
        const total = cart.reduce((sum, item) => sum + (item.orderQty * item.cost), 0);
        const newPO: PurchaseOrder = { id: nextId, supplierId: selectedSupplier.id, supplierName: selectedSupplier.name, date: new Date().toISOString(), status: 'ORDERED', items: cart, totalEstimated: total };
        await DataManager.savePurchaseOrder(newPO);
        alert(`✅ 采购单 ${newPO.id} 已生成`);
        setCart([]); setIsCreatingPO(false);
        await loadData(); setMainTab('POS');
    };

    const executeDeletePO = async () => {
        if (!deletePOCandidate) return;
        try { await DataManager.deletePurchaseOrder(deletePOCandidate); await loadData(); }
        catch (e) { console.error(e); alert("删除失败"); }
        finally { setDeletePOCandidate(null); }
    };

    // ============================================================
    // Receive PO
    // ============================================================
    const initiateReceivePO = (po: PurchaseOrder) => {
        setReceivingPO(po);
        setReceivedItems(po.items.map(i => {
            const isWeightBased = i.pricingMode === 'WEIGHT_BASED' || i.conversionMode === 'ACTUAL_WEIGHT';
            return {
                ...i,
                receivedQty: i.orderQty,
                finalCost: isWeightBased ? (i.billingUnitPrice ?? i.cost ?? 0) : (i.cost ?? 0),
                billByWeight: isWeightBased,
                receivedWeight: isWeightBased
                    ? (i.estimatedBaseQty || (i.orderQty * (i.estimatedWeightPerUnit || 1)))
                    : 0
            };
        }));
        setIsReceiveModalOpen(true);
    };

    const updateReceivedItem = (idx: number, field: keyof SupplierReceivedItem, value: any) => {
        const updated = [...receivedItems]; updated[idx] = { ...updated[idx], [field]: value }; setReceivedItems(updated);
    };

    const confirmReceivePO = async () => {
        if (!receivingPO) return;
        setIsProcessingReceive(true);
        try {
            for (const item of receivedItems) {
                const receivedQty = Number(item.receivedQty);
                const receivedWeight = Number(item.receivedWeight) || 0;
                const finalCost = Number(item.finalCost);
                if (!Number.isFinite(receivedQty) || receivedQty < 0) {
                    alert(`❌ 实际收货数量不能为负数：${item.name}`);
                    return;
                }
                if (item.billByWeight && receivedWeight < 0) {
                    alert(`❌ 实际重量不能为负数：${item.name}`);
                    return;
                }
                if (!Number.isFinite(finalCost) || finalCost < 0) {
                    alert(`❌ 最终价格不能为负数：${item.name}`);
                    return;
                }
            }

            const finalTotal = receivedItems.reduce((sum, item) => sum + ((item.billByWeight && item.receivedWeight ? item.receivedWeight : item.receivedQty) * item.finalCost), 0);
            const stockUpdates = new Map<string, { qtyDelta: number, receivedTotalCost: number }>();
            const supplier = suppliers.find(s => s.id === receivingPO.supplierId);
            const billCategory = supplier?.category || 'SUPPLIER';

            receivedItems.forEach((item) => {
                const catalogItem = supplier?.catalog?.find(c => c.id === item.stockId);
                if (catalogItem && catalogItem.linkedStockId) {
                    const inventoryId = catalogItem.linkedStockId;
                    const receivedQty = Math.max(0, Number(item.receivedQty) || 0);
                    const ratio = toPositiveNumber(item.ratio ?? item.toBaseRatio, 1);
                    const isWeightBased = (item.pricingMode === 'WEIGHT_BASED' || item.conversionMode === 'ACTUAL_WEIGHT') && item.billByWeight;
                    const baseQtyDelta = roundQuantity(isWeightBased
                        ? Math.max(0, Number(item.receivedWeight) || 0)
                        : receivedQty * ratio);
                    const pricingQty = item.billByWeight
                        ? Math.max(0, Number(item.receivedWeight) || 0)
                        : receivedQty;
                    const finalUnitCost = Math.max(0, Number(item.finalCost) || 0);
                    const receivedTotalCost = roundQuantity(pricingQty * finalUnitCost, 2);
                    const existing = stockUpdates.get(inventoryId) || { qtyDelta: 0, receivedTotalCost: 0 };
                    stockUpdates.set(inventoryId, {
                        qtyDelta: roundQuantity(existing.qtyDelta + baseQtyDelta),
                        receivedTotalCost: roundQuantity(existing.receivedTotalCost + receivedTotalCost, 2)
                    });
                }
            });

            const changedItems: StockItem[] = [];
            allStockList.forEach(stockItem => {
                const update = stockUpdates.get(stockItem.id);
                if (update && update.qtyDelta > 0) {
                    const weighted = calculateWeightedAverageCost({
                        oldQtyBase: getCurrentQtyBase(stockItem),
                        oldCostPerBaseUnit: getCostPerBaseUnit(stockItem),
                        receivedQtyBase: update.qtyDelta,
                        receivedTotalCost: update.receivedTotalCost
                    });
                    changedItems.push({
                        ...stockItem,
                        currentQtyBase: weighted.newQtyBase,
                        currentQty: weighted.newQtyBase,
                        costPerBaseUnit: weighted.newCostPerBaseUnit,
                        cost: weighted.newCostPerBaseUnit,
                        diff: update.qtyDelta
                    } as StockItem & { diff: number });
                }
            });

            const changedByCategory: Record<string, StockItem[]> = {};
            changedItems.forEach(item => { const mainCat = CATEGORY_MAP[item.category] || 'KITCHEN'; if (!changedByCategory[mainCat]) changedByCategory[mainCat] = []; changedByCategory[mainCat].push(item); });
            const updatePromises = Object.entries(changedByCategory).filter(([_, items]) => items.length > 0).map(([cat, items]) => DataManager.batchUpdateStock(cat as any, items));
            await Promise.all(updatePromises);

            const receivedPOItems = receivedItems.map(item => {
                const receivedQty = Math.max(0, Number(item.receivedQty) || 0);
                const receivedWeight = Math.max(0, Number(item.receivedWeight) || 0);
                const ratio = toPositiveNumber(item.ratio ?? item.toBaseRatio, 1);
                const isWeightBased = (item.pricingMode === 'WEIGHT_BASED' || item.conversionMode === 'ACTUAL_WEIGHT') && item.billByWeight;
                const receivedBaseQty = roundQuantity(isWeightBased ? receivedWeight : receivedQty * ratio);
                const finalLineTotal = roundQuantity(
                    (item.billByWeight ? receivedWeight : receivedQty) * Math.max(0, Number(item.finalCost) || 0),
                    2
                );
                return {
                    ...item,
                    receivedQty,
                    receivedWeight,
                    finalUnitPrice: Math.max(0, Number(item.finalCost) || 0),
                    finalLineTotal,
                    receivedBaseQty,
                    costPerBaseUnitAtReceive: receivedBaseQty > 0
                        ? roundQuantity(finalLineTotal / receivedBaseQty)
                        : 0
                };
            });

            await DataManager.savePurchaseOrder({
                ...receivingPO,
                status: 'RECEIVED' as const,
                items: receivedPOItems
            });
            await DataManager.saveStandaloneExpense({ id: `exp_${Date.now()}`, category: billCategory, expenseType: 'GENERAL', company: receivingPO.supplierName, amount: 0, totalBillAmount: finalTotal, outstandingAmount: finalTotal, paymentStatus: 'UNPAID', time: new Date().toISOString(), note: `PO: ${receivingPO.id} (Auto-generated)`, paymentMethod: 'BANK_TRANSFER', paidBy: 'COMPANY' });

            alert(`✅ 入库成功！应付: RM ${finalTotal.toFixed(2)}\n分类: ${billCategory}`);
            setIsReceiveModalOpen(false); setReceivingPO(null);

            setAllStockList(prev => prev.map(stockItem => {
                const update = stockUpdates.get(stockItem.id);
                if (!update || update.qtyDelta <= 0) return stockItem;
                const weighted = calculateWeightedAverageCost({
                    oldQtyBase: getCurrentQtyBase(stockItem),
                    oldCostPerBaseUnit: getCostPerBaseUnit(stockItem),
                    receivedQtyBase: update.qtyDelta,
                    receivedTotalCost: update.receivedTotalCost
                });
                return {
                    ...stockItem,
                    currentQtyBase: weighted.newQtyBase,
                    currentQty: weighted.newQtyBase,
                    costPerBaseUnit: weighted.newCostPerBaseUnit,
                    cost: weighted.newCostPerBaseUnit
                };
            }));
            const poData = await DataManager.getPurchaseOrders();
            setPurchaseOrders(poData.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 35));
            if (selectedSupplier) await loadExpenses(selectedSupplier.name);
            stockCacheRef.current = null;
        } catch (error: any) {
            console.error("Receive Error:", error);
            const detailedMsg = error?.message || String(error);
            alert(`入库失败，请重试。\n\n详细错误: ${detailedMsg}`);
        }
        finally { setIsProcessingReceive(false); }
    };

    // ============================================================
    // PDF Export & WhatsApp
    // ============================================================
    const handleExportPO_PDF = async (po: PurchaseOrder) => {
        setPrintingPO(po); setIsGeneratingPdf(true);
        setTimeout(async () => {
            if (!printRef.current) return;
            try {
                const pdf = new jsPDF('p', 'mm', 'a4');
                const totalPages = Math.ceil(po.items.length / ITEMS_PER_PAGE);
                for (let i = 0; i < totalPages; i++) {
                    const pageElement = document.getElementById(`po-print-page-${i}`);
                    if (!pageElement) continue;
                    if (i > 0) pdf.addPage();
                    await waitForPdfFonts();
                    const canvas = await html2canvas(pageElement, { 
                        scale: 2, 
                        useCORS: true, 
                        backgroundColor: '#ffffff', 
                        windowWidth: 794,
                        onclone: (clonedDoc) => {
                            const clonedEl = clonedDoc.getElementById(`po-print-page-${i}`);
                            const originalEl = document.getElementById(`po-print-page-${i}`);
                            if (originalEl && clonedEl) {
                                applyResolvedStylesForPdf(originalEl as HTMLElement, clonedEl as HTMLElement);
                            }
                        }
                    });
                    const imgData = canvas.toDataURL('image/jpeg', 1.0);
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
                }
                pdf.save(`PO_${po.id}.pdf`);
            } catch (err) { console.error(err); alert("PDF Error"); }
            finally { setIsGeneratingPdf(false); setPrintingPO(null); }
        }, 800);
    };

    const handleExportUnpaidBillsPDF = () => {
        if (!selectedSupplier) return;
        const unpaidBills = supplierExpenses.filter(b => b.paymentStatus !== 'PAID');
        if (unpaidBills.length === 0) {
            alert(`✅ 供应商 (${selectedSupplier.name}) 暂无未付款账单！\n(All bills are fully paid)`);
            return;
        }
        setSupplierPrintBills(unpaidBills);
        setIsExportingUnpaidBills(true);
        setTimeout(async () => {
            const input = supplierPrintRef.current;
            if (!input) { setIsExportingUnpaidBills(false); return; }
            await waitForPdfFonts();
            html2canvas(input, { 
                scale: 2, 
                useCORS: true,
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('supplier-print-export-root');
                    if (supplierPrintRef.current && clonedEl) {
                        applyResolvedStylesForPdf(supplierPrintRef.current as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            }).then((canvas) => {
                const imgData = canvas.toDataURL('image/jpeg', 0.82);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgWidth = 210;
                const pageHeight = 297;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;
                let position = 0;
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
                pdf.save(`Supplier_Unpaid_Statement_${selectedSupplier.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
                setIsExportingUnpaidBills(false);
            }).catch(e => { 
                console.error(e); 
                setIsExportingUnpaidBills(false); 
            });
        }, 500);
    };

    const handleExportAllBillsPDF = () => {
        if (!selectedSupplier) return;
        const allBills = supplierExpenses;
        if (allBills.length === 0) {
            alert(`✅ 供应商 (${selectedSupplier.name}) 暂无任何账单！\n(No bills recorded)`);
            return;
        }
        setSupplierPrintBills(allBills);
        setIsExportingAllBills(true);
        setTimeout(async () => {
            const input = supplierPrintRef.current;
            if (!input) { setIsExportingAllBills(false); return; }
            await waitForPdfFonts();
            html2canvas(input, { 
                scale: 2, 
                useCORS: true,
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('supplier-print-export-root');
                    if (supplierPrintRef.current && clonedEl) {
                        applyResolvedStylesForPdf(supplierPrintRef.current as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            }).then((canvas) => {
                const imgData = canvas.toDataURL('image/jpeg', 0.82);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgWidth = 210;
                const pageHeight = 297;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;
                let position = 0;
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
                pdf.save(`Supplier_All_Historical_Statement_${selectedSupplier.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
                setIsExportingAllBills(false);
            }).catch(e => { 
                console.error(e); 
                setIsExportingAllBills(false); 
            });
        }, 500);
    };

    const sendWhatsappPO = (po: PurchaseOrder) => {
        const targetSup = suppliers.find(s => s.id === po.supplierId);
        if (!targetSup) return alert("Unknown Supplier");
        const phone = targetSup.contact.replace(/\D/g, '');
        if (!phone) return alert("供应商无联系电话");
        let text = `*PURCHASE ORDER: ${po.id}*\nTo: ${po.supplierName}\nDate: ${po.date.split('T')[0]}\n\n*ITEMS:*\n`;
        po.items.forEach((item, i) => { text += `${i + 1}. ${item.name} [${item.supplierCode || ''}]\n  Qty: ${item.orderQty} ${item.unit}\n`; });
        text += `\nPlease confirm delivery. Thanks!`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleOpenExportModal = () => {
        setExportSearchTerm('');
        setSelectedExportIds(suppliers.map(s => s.id));
        setIsExportModalOpen(true);
    };

    const handleToggleSelectExport = (id: string) => {
        setSelectedExportIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAllExport = () => {
        const availableIds = filteredExportSuppliers.map(s => s.id);
        setSelectedExportIds(prev => {
            const union = new Set([...prev, ...availableIds]);
            return Array.from(union);
        });
    };

    const handleDeselectAllExport = () => {
        const availableIds = filteredExportSuppliers.map(s => s.id);
        setSelectedExportIds(prev => prev.filter(id => !availableIds.includes(id)));
    };

    const formatSupplierFilenameCode = (id: string, name: string): string => {
        const cleanName = name
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return `${id}_${cleanName}`;
    };

    const handleConfirmExport = () => {
        const toExport = suppliers.filter(s => selectedExportIds.includes(s.id));
        if (toExport.length === 0) {
            alert("请选择至少一个商家进行导出");
            return;
        }
        
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            let currentY = 20;
            const pageHeight = 297;
            const margin = 15;
            
            const drawHeader = (pageNum: number) => {
                doc.setFillColor(26, 26, 26);
                doc.rect(margin, currentY, 180, 15, 'F');
                
                doc.setTextColor(255, 215, 0);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(11);
                doc.text("KIM LIAN KEE - SUPPLIER ENCODED REGISTRY (供应商名称及编码对照表)", margin + 6, currentY + 10);
                
                doc.setTextColor(255, 255, 255);
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(8);
                doc.text(`PAGE: ${pageNum}`, margin + 165, currentY + 9);
                
                currentY += 21;
                
                doc.setFillColor(245, 247, 250);
                doc.rect(margin, currentY, 180, 8, 'F');
                doc.setDrawColor(220, 225, 230);
                doc.line(margin, currentY, margin + 180, currentY);
                doc.line(margin, currentY + 8, margin + 180, currentY + 8);
                
                doc.setTextColor(100, 110, 120);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(8);
                doc.text("ID", margin + 5, currentY + 5.5);
                doc.text("COMPANY NAME (供应商名称)", margin + 20, currentY + 5.5);
                doc.text("STANDARDIZED FILENAME / CODE (系统映射标准编码)", margin + 85, currentY + 5.5);
                
                currentY += 12;
            };
            
            let pageNum = 1;
            drawHeader(pageNum);
            
            toExport.forEach((sup) => {
                if (currentY > pageHeight - 25) {
                    doc.addPage();
                    currentY = 20;
                    pageNum++;
                    drawHeader(pageNum);
                }
                
                const code = formatSupplierFilenameCode(sup.id, sup.name);
                
                doc.setTextColor(26, 26, 26);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(9);
                doc.text(sup.id, margin + 5, currentY);
                
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(9);
                const displayName = sup.name.length > 32 ? sup.name.slice(0, 30) + "..." : sup.name;
                doc.text(displayName, margin + 20, currentY);
                
                doc.setFont("Courier", "bold");
                doc.setFontSize(8.5);
                doc.setTextColor(139, 0, 0);
                doc.text(code, margin + 85, currentY);
                
                doc.setDrawColor(240, 240, 240);
                doc.setLineWidth(0.2);
                doc.line(margin, currentY + 2.5, margin + 180, currentY + 2.5);
                
                currentY += 8.5;
            });
            
            const dateStr = new Date().toISOString().split('T')[0];
            doc.save(`KLLK_Suppliers_Registry_${dateStr}.pdf`);
            setIsExportModalOpen(false);
        } catch (err: any) {
            console.error("PDF Export Error:", err);
            alert("编译 PDF 出错: " + err.message);
        }
    };

    const handleOpenCleanMergeModal = () => {
        setCleaningLogs([]);
        setManualSourceId('');
        setManualTargetId('');
        setIsCleanModalOpen(true);
    };

    const executeMerge = async (sources: Supplier[], target: Supplier) => {
        setIsCleaning(true);
        setCleaningLogs(["⏳ 清洗合并任务启动：初始化连接并创建批处理..."]);
        
        try {
            const batch = writeBatch(db);
            const targetUppercaseName = target.name.toUpperCase().trim();
            
            // 1. Target Supplier Update to UPPERCASE
            const targetRef = doc(db, 'suppliers', target.id);
            batch.set(targetRef, { ...target, name: targetUppercaseName }, { merge: true });
            setCleaningLogs(prev => [...prev, `✅ 项目 1/5：主商家记录 [${target.id}] 已重置名称为标致大写: "${targetUppercaseName}"`]);
            
            // 2. Source Suppliers Delete
            sources.forEach(src => {
                const srcRef = doc(db, 'suppliers', src.id);
                batch.delete(srcRef);
                setCleaningLogs(prev => [...prev, `🗑️ 项目 1/5：已被吸收的副本商家 [${src.id}] ("${src.name}") 已放入删除队列`]);
            });
            
            await batch.commit();
            setCleaningLogs(prev => [...prev, "⚡ 供应商底册结构更新成功！接下来开始对齐业务账单 (Standalone Expenses)..."]);

            // 3. AP Standalone Bills (`standalone_expenses`) Alignment
            const allSourceNames = [...sources.map(s => s.name), target.name];
            const expenseSnap = await getDocs(collection(db, 'standalone_expenses'));
            
            const expenseBatch = writeBatch(db);
            let expenseCount = 0;
            
            expenseSnap.docs.forEach(d => {
                const exp = d.data() as ExpenseItem;
                const matchesSource = allSourceNames.some(n => n.toLowerCase() === (exp.company || '').toLowerCase());
                if (matchesSource) {
                    expenseBatch.update(d.ref, { company: targetUppercaseName });
                    expenseCount++;
                }
            });
            
            if (expenseCount > 0) {
                await expenseBatch.commit();
                setCleaningLogs(prev => [...prev, `✅ 项目 2/5：对齐独立应付账账单: 共修改 ${expenseCount} 条记录`]);
            } else {
                setCleaningLogs(prev => [...prev, "ℹ️ 项目 2/5：未检测到需要对齐的独立应付账账单"]);
            }

            // 4. Settlements sub-expenses Alignment
            setCleaningLogs(prev => [...prev, "⏳ 项目 3/5：扫描并安全更新历史日结嵌套账单 (Settlement Nested Expenses)..."]);
            const stlSnap = await getDocs(collection(db, 'settlements'));
            let settlementCount = 0;
            
            for (const d of stlSnap.docs) {
                const s = d.data();
                if (s.expenses && Array.isArray(s.expenses)) {
                    let updated = false;
                    const newExpenses = s.expenses.map((exp: any) => {
                        const matchesSource = allSourceNames.some(n => n.toLowerCase() === (exp.company || '').toLowerCase());
                        if (matchesSource) {
                            updated = true;
                            return { ...exp, company: targetUppercaseName };
                        }
                        return exp;
                    });
                    
                    if (updated) {
                        const sRef = doc(db, 'settlements', d.id);
                        await setDoc(sRef, { expenses: newExpenses }, { merge: true });
                        settlementCount++;
                    }
                }
            }
            if (settlementCount > 0) {
                setCleaningLogs(prev => [...prev, `✅ 项目 3/5：修正历史嵌套日结对账表格共 ${settlementCount} 笔`]);
            } else {
                setCleaningLogs(prev => [...prev, "ℹ️ 项目 3/5：历史收银日结中没有要合并的内容"]);
            }

            // 5. Purchase Orders update (supplierId and supplierName)
            setCleaningLogs(prev => [...prev, "⏳ 项目 4/5：扫描并更正采购订单 (Purchase Orders) 的关联绑定..."]);
            const poSnap = await getDocs(collection(db, 'purchase_orders'));
            const poBatch = writeBatch(db);
            let poCount = 0;
            
            poSnap.docs.forEach(d => {
                const po = d.data() as PurchaseOrder;
                const matchesId = sources.some(s => s.id === po.supplierId) || po.supplierId === target.id;
                const matchesName = allSourceNames.some(n => n.toLowerCase() === (po.supplierName || '').toLowerCase());
                
                if (matchesId || matchesName) {
                    poBatch.update(d.ref, { 
                        supplierId: target.id,
                        supplierName: targetUppercaseName 
                    });
                    poCount++;
                }
            });
            
            if (poCount > 0) {
                await poBatch.commit();
                setCleaningLogs(prev => [...prev, `✅ 项目 4/5：重置采购绑定: 共修正及关联采购订单 ${poCount} 笔`]);
            } else {
                setCleaningLogs(prev => [...prev, "ℹ️ 项目 4/5：未发现关联的采购订单"]);
            }

            // 6. Payment Vouchers Alignment
            setCleaningLogs(prev => [...prev, "⏳ 项目 5/5：同步更新已签发付款凭单 (Payment Vouchers) 的收款人名称与ID..."]);
            const pvSnap = await getDocs(collection(db, 'payment_vouchers'));
            const pvBatch = writeBatch(db);
            let pvCount = 0;
            
            pvSnap.docs.forEach(d => {
                const pv = d.data();
                const matchesId = sources.some(s => s.id === pv.payeeId) || pv.payeeId === target.id;
                const matchesName = allSourceNames.some(n => n.toLowerCase() === (pv.payeeName || '').toLowerCase());
                
                if (matchesId || matchesName) {
                    pvBatch.update(d.ref, { 
                        payeeId: target.id, 
                        payeeName: targetUppercaseName 
                    });
                    pvCount++;
                }
            });
            
            if (pvCount > 0) {
                await pvBatch.commit();
                setCleaningLogs(prev => [...prev, `✅ 项目 5/5：完成付款凭单 (PV) 核销对齐: 共更新 ${pvCount} 笔`]);
            } else {
                setCleaningLogs(prev => [...prev, "ℹ️ 项目 5/5：无付款凭单需对齐"]);
            }

            // Clear local cached AP memory session storage
            try {
                sessionStorage.removeItem('klk_ap_suppliers_v1');
            } catch {}

            setCleaningLogs(prev => [...prev, "✨ 缓存清除完成，数据已同步！"]);
            setCleaningLogs(prev => [...prev, "🎉 账目完美合并，清洗流程全部结束！"]);
            await loadData(true); // force reload
            alert(`🎉 "${targetUppercaseName}" 账目清洗与重复项合并成功！\n数据变化详情：\n- 独立账单更新: ${expenseCount} 条\n- 日对账更正: ${settlementCount} 条\n- PO采购单更新: ${poCount} 件\n- PV付款凭单更正: ${pvCount} 件\n已经安全删除 ${sources.length} 个旧版本副本。`);
            
        } catch (err: any) {
            console.error("Clean error:", err);
            setCleaningLogs(prev => [...prev, `❌ 数据库级合并失败: ${err.message}`]);
            alert("发生异常: " + err.message);
        } finally {
            setIsCleaning(false);
        }
    };

    const runAutoMerge = async (group: Supplier[], targetId: string) => {
        const target = group.find(s => s.id === targetId);
        if (!target) return alert("目标物理主商家无效");
        const sources = group.filter(s => s.id !== targetId);
        
        if (window.confirm(`⚠️ 请确认本次归并操作 ⚠️\n\n您正准备将 ${sources.length} 个商家副本：\n${sources.map(s => `• [${s.id}] ${s.name}`).join('\n')}\n\n合并到主商家中：\n• [${target.id}] ${target.name}\n\n系统将自动清洗：\n1. 将其名称强制转换为全大写\n2. 将 ${sources.map(s => s.name).join("/")} 下的所有应付账款 (AP)、历史收银日账、采购单 (PO)、付款凭证 (PV) 统一更新绑定至该主商家\n3. 彻底删除副本商家实体以防再次录错。\n\n本操作将会写全部历史财务链接，确定要执行吗？`)) {
            await executeMerge(sources, target);
        }
    };

    const runManualMerge = async () => {
        if (!manualSourceId || !manualTargetId) {
            return alert("请同时选取 [源重复商家] 与 [核定保留的主商家]");
        }
        if (manualSourceId === manualTargetId) {
            return alert("源商家与目标商家不能一致，请重新选择");
        }
        
        const source = suppliers.find(s => s.id === manualSourceId);
        const target = suppliers.find(s => s.id === manualTargetId);
        if (!source || !target) return alert("检索商户记录失败");
        
        if (window.confirm(`⚠️ 确认开展 [人手精准跨类归并] ⚠️\n\n源商家 (将被移出并合并): [${source.id}] ${source.name}\n目标商家 (将吸收账目并保持大写): [${target.id}] ${target.name}\n\n所有相关联的 AP Bills, History Settlements, PO, 和 PV 均会被级联物理更新，操作无法撤销。`)) {
            await executeMerge([source], target);
        }
    };

    const runSingleCapitalize = async (target: Supplier) => {
        if (window.confirm(`⚠️ 确认将 [${target.name}] 转为大写拼写并同步吗？\n\n系统会将所有写在 [${target.name}] 名字下的账目和采购单批量刷新为规范的 "${target.name.toUpperCase()}" 格式。`)) {
            await executeMerge([], target);
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    const MainContent = (
        <div className={`flex flex-col bg-[#F6F7FB] h-full ${isModal ? 'md:max-h-[92vh] md:rounded-[2rem] overflow-hidden shadow-2xl border border-gray-100' : ''} font-sans relative`}>
            
            {/* 顶部导航栏 */}
            <div className="mobile-safe-header bg-[#111111] text-white shrink-0 border-b-4 border-[#FFD200] px-4 pb-3 md:px-6 md:py-0 min-h-[56px] md:h-16 flex justify-between items-center z-20 sticky top-0 shadow-md">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    {view !== 'LIST' ? (
                        <button 
                            onClick={() => { setView('LIST'); setSelectedSupplier(null); setIsCreatingPO(false); }} 
                            className="w-11 h-11 md:w-auto md:h-auto md:p-2 bg-white/10 hover:bg-[#FFD200] hover:text-black rounded-xl flex items-center justify-center transition-all shadow-sm shrink-0 active:scale-95"
                            id="mobile-back-btn"
                        >
                            <ArrowLeft size={18}/>
                        </button>
                    ) : (
                        onClose && (
                            <button 
                                onClick={onClose} 
                                className="md:hidden w-11 h-11 bg-white/10 hover:bg-red-500 hover:text-white rounded-xl flex items-center justify-center transition-colors text-gray-300 shrink-0"
                                id="mobile-close-btn"
                            >
                                <X size={18}/>
                            </button>
                        )
                    )}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-[#FFD200] text-black p-2 rounded-lg shadow-sm hidden md:block shrink-0"><Truck size={20}/></div>
                        <span className="text-xl md:hidden shrink-0">🚚</span>
                        <div className="min-w-0">
                            <h3 className="font-serif font-black text-sm md:text-lg tracking-wide text-white truncate flex items-center gap-1.5">
                                供应商与采购
                            </h3>
                            <p className="text-[8px] md:text-[9px] text-gray-400 font-mono uppercase tracking-widest mt-0.5 truncate">Supplier Management</p>
                        </div>
                    </div>
                </div>
                <div className="hidden md:flex gap-3 items-center">
                    <div className="flex bg-white/10 p-1 rounded-xl backdrop-blur-sm border border-white/5">
                        <button onClick={() => { setMainTab('SUPPLIERS'); setView('LIST'); }} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${mainTab === 'SUPPLIERS' ? 'bg-[#FFD200] text-[#111111] shadow-md' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}><UserCircle size={16}/> 供应商</button>
                        <button onClick={() => { setMainTab('POS'); setView('LIST'); }} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${mainTab === 'POS' ? 'bg-[#FFD200] text-[#111111] shadow-md' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}><FileText size={16}/> 采购单</button>
                    </div>
                    <div className="w-px h-8 bg-white/20 mx-2"></div>
                    <ModuleGuideButton module="SUPPLIER" />
                    {onClose && <button onClick={onClose} className="p-2 hover:bg-red-500 hover:text-white rounded-xl transition-colors text-gray-300"><X size={20}/></button>}
                </div>
                <div className="md:hidden flex items-center gap-2 shrink-0">
                    <ModuleGuideButton module="SUPPLIER" />
                    {onClose && view !== 'LIST' && (
                        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center bg-white/5 hover:bg-red-500 hover:text-white rounded-xl transition-colors text-gray-300"><X size={18}/></button>
                    )}
                </div>
            </div>

            {/* 手机端标签 */}
            <div className="md:hidden bg-[#F6F7FB] px-4 pt-4 pb-2 shrink-0 z-10 relative">
                <div className="bg-white p-1 rounded-2xl border border-[#E5E7EB] flex shadow-sm">
                    <button onClick={() => { setMainTab('SUPPLIERS'); setView('LIST'); }} className={`flex-1 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all min-h-[44px] ${mainTab === 'SUPPLIERS' ? 'bg-[#111111] text-[#FFD200] shadow-sm' : 'bg-transparent text-gray-500'}`}><UserCircle size={14}/> 供应商列表</button>
                    <button onClick={() => { setMainTab('POS'); setView('LIST'); }} className={`flex-1 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all min-h-[44px] ${mainTab === 'POS' ? 'bg-[#111111] text-[#FFD200] shadow-sm' : 'bg-transparent text-gray-500'}`}><FileText size={14}/> 采购单记录</button>
                </div>
            </div>

            {/* 手机端搜索框 */}
            {view === 'LIST' && (
                <div className="md:hidden bg-[#F6F7FB] px-4 pb-2 shrink-0">
                    <div className="relative w-full">
                        <Search className="absolute left-3.5 top-3.5 text-gray-400" size={16}/>
                        <input 
                            type="text" 
                            placeholder={mainTab === 'SUPPLIERS' ? "搜索供应商名称 / 编号 / 标签..." : "搜索采购单号 / 商家..."} 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full pl-10 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-2xl text-xs font-bold shadow-sm focus:border-[#FFD200] focus:ring-4 focus:ring-[#FFD200]/10 transition-all outline-none min-h-[44px]"
                        />
                    </div>
                </div>
            )}

            {/* 主内容区 */}
            <div className="mobile-fixed-actions-space flex-grow overflow-y-auto p-4 md:p-6 md:pb-8 scroll-smooth relative z-0">
                
                {/* 供应商列表 */}
                {mainTab === 'SUPPLIERS' && view === 'LIST' && (
                    <div className="max-w-7xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4">
                        <div className="hidden md:flex flex-col md:flex-row justify-between items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                                <input type="text" placeholder="搜索供应商名称 / 编号 / 标签..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-50/80 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-[#FFD200] focus:ring-4 focus:ring-[#FFD200]/10 transition-all outline-none"/>
                            </div>
                            <div className="hidden md:flex flex-col md:flex-row gap-2.5 w-full md:w-auto shrink-0 font-sans">
                                <button 
                                    onClick={handleOpenCleanMergeModal}
                                    className="w-full md:w-auto bg-amber-50 border border-amber-200 hover:bg-amber-100/80 text-amber-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px] cursor-pointer shadow-sm relative"
                                    title="一键将所有供应商更正为大写并自动合并重复账户，打通关联应付账款！"
                                >
                                    <span>🔠 重复合并与大写规范</span>
                                    {(detectedDuplicateGroups.length > 0 || lowercaseSingleSuppliers.length > 0) && (
                                        <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse shrink-0">
                                            {(detectedDuplicateGroups.length + lowercaseSingleSuppliers.length)} 件待排查
                                        </span>
                                    )}
                                </button>
                                <button 
                                    onClick={handleOpenCleanMergeModal} 
                                    className="w-full md:w-auto bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-950 font-black px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all active:scale-95 min-h-[44px] cursor-pointer shadow-sm"
                                >
                                    <span>⚡ 重名合并与大写清洗</span>
                                </button>
                                <button 
                                    onClick={handleOpenExportModal} 
                                    className="w-full md:w-auto bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-black px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all active:scale-95 min-h-[44px] cursor-pointer shadow-sm"
                                >
                                    <FileDown size={16} className="text-red-700"/> 导出编号 PDF
                                </button>
                                <button 
                                    onClick={handleOpenAddSupplier} 
                                    className="w-full md:w-auto bg-[#111111] text-[#FFD200] px-5 py-2.5 rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-center gap-2 hover:bg-black transition-all active:scale-95 min-h-[44px]"
                                >
                                    <Plus size={16}/> 录入新供应商
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredSuppliers.map(sup => (
                                <div key={sup.id} onClick={() => { setSelectedSupplier(sup); setView('DETAIL'); setActiveDetailTab('CATALOG'); }} className="relative bg-white rounded-2xl p-4 border border-[#E5E7EB] shadow-sm hover:shadow-[0_8px_30px_rgba(255,210,0,0.15)] hover:border-[#FFD200]/60 transition-all duration-300 cursor-pointer group flex flex-col h-full overflow-hidden">
                                    <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500 pointer-events-none"></div>
                                    <div className="absolute top-2 right-2 p-2 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none"><Truck size={48}/></div>
                                    <div className="flex items-start justify-between gap-2 mb-3 relative z-10">
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#111111] to-gray-800 text-[#FFD200] flex items-center justify-center font-black text-[10px] shadow-md shrink-0">{sup.id}</div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-black text-sm text-[#111111] leading-snug line-clamp-2 group-hover:text-[#8B0000] transition-colors" title={sup.name}>{sup.name}</h4>
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest mt-1 ${sup.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'}`}><span className={`w-1 h-1 rounded-full ${sup.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>{sup.status}</span>
                                            </div>
                                        </div>
                                        <button onClick={(e) => handleToggleFavorite(e, sup)} className="p-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-gray-100 hover:bg-gray-50 transition-all hover:scale-110 active:scale-95 shrink-0 mt-0.5"><Star size={14} className={sup.isFavorite ? "fill-[#FFD200] text-[#FFD200]" : "text-gray-200"} /></button>
                                    </div>
                                    {sup.restDayNote && (<div className="mb-3 bg-orange-50/80 border border-orange-100/50 rounded-lg px-2 py-1.5 flex items-start gap-1.5 relative z-10"><CalendarOff size={12} className="text-orange-500 mt-px shrink-0"/><p className="text-[10px] font-bold text-orange-800 leading-tight line-clamp-1">{sup.restDayNote}</p></div>)}
                                    <div className="space-y-2 mt-auto relative z-10">
                                        <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5 truncate"><User size={12} className="text-gray-400 shrink-0"/> {sup.contactPerson || sup.name.slice(0, 12)}</p>
                                        {sup.contact && (<button onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${sup.contact.replace(/\D/g, '')}`, '_blank'); }} className="text-[10px] text-green-600 font-bold flex items-center gap-1 hover:text-green-700"><Phone size={10}/> {sup.contact.slice(-8)}</button>)}
                                        <div className="flex gap-1.5 flex-wrap">
                                            {sup.category && <span className="text-[9px] font-bold bg-[#111111]/5 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200/50 truncate max-w-full">{sup.category}</span>}
                                            {sup.tags?.slice(0, 2).map(t => <span key={t} className="text-[9px] font-bold bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md border border-gray-100 truncate">#{t}</span>)}
                                        </div>
                                        <div className="pt-3 mt-1 border-t border-gray-100/80 flex justify-between items-center text-[11px] font-black text-gray-500">
                                            <span>📦 {sup.catalog?.length || 0} 品项</span>
                                            <div className="flex items-center gap-1 bg-[#111111] text-[#FFD200] px-3 py-1.5 rounded-lg text-[10px] shadow-sm font-black active:scale-95 transition-all">
                                                详情 <ArrowLeft size={10} className="rotate-180 text-[#FFD200]"/>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {filteredSuppliers.length === 0 && (
                            <div className="col-span-full py-20 text-center flex flex-col items-center justify-center bg-white rounded-[2rem] border border-gray-100 shadow-sm mt-4">
                                <div className="bg-gray-50 p-6 rounded-full mb-4 ring-8 ring-gray-50/50"><Truck size={48} className="text-gray-300"/></div>
                                <h3 className="font-black text-lg text-[#111111] mb-1">未找到相关供应商</h3>
                                <p className="text-sm text-gray-400 font-medium mb-6">您可以尝试更换搜索词，或立即新增一个。</p>
                                <button onClick={handleOpenAddSupplier} className="bg-[#111111] text-[#FFD200] px-6 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-black active:scale-95 flex items-center gap-2"><Plus size={16}/> 立即录入</button>
                            </div>
                        )}
                    </div>
                )}

                {/* 供应商详情页 */}
                {view === 'DETAIL' && selectedSupplier && (
                    <div className="max-w-6xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-8">
                        <div className="bg-white rounded-[2rem] p-5 md:p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#FFD200]/10 to-transparent rounded-full blur-3xl pointer-events-none -translate-y-1/4 translate-x-1/4"></div>
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                <div className="flex gap-4 w-full md:flex-1 min-w-0 items-center">
                                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 shadow-inner flex items-center justify-center shrink-0"><Truck size={28} className="text-[#8B0000]" /></div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-mono tracking-widest shrink-0 border border-gray-200/50">{selectedSupplier.id}</span>
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest shrink-0 ${selectedSupplier.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'}`}><span className={`w-1 h-1 rounded-full ${selectedSupplier.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>{selectedSupplier.status}</span>
                                            {selectedSupplier.restDayNote && (<span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-800 text-[9px] font-bold shrink-0"><CalendarOff size={10}/> {selectedSupplier.restDayNote}</span>)}
                                        </div>
                                        <h1 className="text-xl md:text-3xl font-black text-[#111111] truncate group-hover:text-[#8B0000] transition-colors" title={selectedSupplier.name}>{selectedSupplier.name}</h1>
                                        <div className="text-[11px] md:text-xs text-gray-500 flex flex-wrap items-center gap-y-1.5 gap-x-4 mt-1.5 font-medium">
                                            <span className="flex items-center gap-1.5 shrink-0"><User size={14} className="text-gray-400"/>对接客商: {selectedSupplier.contactPerson || '未登记'}</span>
                                            {selectedSupplier.contact && (
                                                <a href={`tel:${selectedSupplier.contact}`} className="flex items-center gap-1.5 shrink-0 text-blue-700 hover:underline font-bold active:opacity-60 transition-all" title="点击呼叫供应商">
                                                    <span>📞 {selectedSupplier.contact}</span>
                                                </a>
                                            )}
                                            {selectedSupplier.email && (
                                                <a href={`mailto:${selectedSupplier.email}`} className="flex items-center gap-1.5 shrink-0 text-amber-900 hover:underline font-bold active:opacity-60 transition-all" title="点击发送邮件">
                                                    <span>✉️ {selectedSupplier.email}</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                                    <button onClick={() => window.open(`https://wa.me/${selectedSupplier.contact.replace(/\D/g, '')}`, '_blank')} className="flex-1 md:flex-none min-h-[44px] md:min-h-0 md:h-10 px-5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_12px_rgba(22,163,74,0.3)] active:scale-95"><MessageCircle size={16} /> WhatsApp</button>
                                    <button onClick={() => { setSupplierForm(selectedSupplier); setIsEditingSupplier(true); }} className="min-h-[44px] w-[44px] md:min-h-0 md:h-10 md:w-10 flex items-center justify-center text-gray-500 hover:bg-white hover:text-blue-600 hover:shadow-md rounded-xl border border-gray-200 transition-all bg-gray-50/50"><Edit3 size={16}/></button>
                                    <button onClick={() => setDeleteSupplierId(selectedSupplier.id)} className="min-h-[44px] w-[44px] md:min-h-0 md:h-10 md:w-10 flex items-center justify-center text-red-100 hover:bg-rose-500 hover:text-white hover:shadow-md rounded-xl border border-rose-100 transition-all bg-rose-50/50"><Trash2 size={16}/></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100">
                                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100/50"><p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Payment</p><p className="font-black text-sm text-[#111111]">{selectedSupplier.paymentTerm || 'COD'}</p></div>
                                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100/50"><p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Min Order</p><p className="font-mono font-black text-sm text-[#111111]">RM {selectedSupplier.minOrderValue || 0}</p></div>
                                <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100/50"><p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">Total Spent</p><p className="font-mono font-black text-base text-blue-700">RM {billStats.total.toFixed(2)}</p></div>
                                <div className={`p-3 rounded-xl border ${billStats.outstanding > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-emerald-50/50 border-emerald-200'}`}><p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${billStats.outstanding > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>Outstanding</p><p className={`font-mono font-black text-base ${billStats.outstanding > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>RM {billStats.outstanding.toFixed(2)}</p></div>
                            </div>

                            {/* 👑 移动端极致适配 - 专业账款合规与一键导航功能卡 */}
                            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4">
                                {/* 收款银行卡片 (Sleek dark display) */}
                                <div className="md:col-span-6 bg-gradient-to-r from-gray-950 to-[#121212] rounded-2xl p-4 text-white shadow-lg relative overflow-hidden flex flex-col justify-between group min-h-[160px] border border-gray-800">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 rounded-full blur-2xl pointer-events-none -translate-y-12 translate-x-12 group-hover:bg-amber-400/10 transition-colors"></div>
                                    <div className="relative z-10 flex justify-between items-start pb-2 border-b border-white/5">
                                        <div className="flex items-center gap-1.5 text-xs text-amber-400 font-extrabold tracking-widest uppercase">
                                            <span className="text-sm">🏦</span> 收款对账银行信息 (PAYEE BANK)
                                        </div>
                                        <span className="text-[10px] text-white/50 font-bold">双模兼容</span>
                                    </div>

                                    <div className="relative z-10 mt-3 flex-grow max-h-[180px] overflow-y-auto scrollbar-thin">
                                        {selectedSupplier.bankAccounts && selectedSupplier.bankAccounts.length > 0 ? (
                                            <div className="space-y-3">
                                                {selectedSupplier.bankAccounts.map((b, bIdx) => {
                                                    return (
                                                        <div key={bIdx} className="bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/5 flex items-center justify-between transition-colors">
                                                            <div className="space-y-0.5 flex-1 min-w-0 pr-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-400 rounded text-[9px] font-black uppercase tracking-wider">{b.bankName || '未填银行'}</span>
                                                                    <span className="text-[10px] text-white/40 font-bold truncate">户名: {b.accountName || '--'}</span>
                                                                </div>
                                                                <p className="font-mono font-black text-xs text-[#FFD200] tracking-wider break-all">{b.accountNo || '无卡号'}</p>
                                                            </div>
                                                            {b.accountNo && (
                                                                <button 
                                                                    onClick={() => copyToClipboard(b.accountNo, `bank_${bIdx}`)}
                                                                    className="px-2 py-1.5 text-[9px] font-black uppercase text-[#121212] bg-[#FFD200] hover:bg-amber-300 rounded-lg active:scale-95 transition-all shadow-sm shrink-0"
                                                                >
                                                                    {copiedText === `bank_${bIdx}` ? '已复制' : '📋 复制'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : selectedSupplier.bankAccount ? (
                                            <div className="space-y-2">
                                                <div className="flex items-start justify-between bg-white/5 p-2 rounded-xl border border-white/5">
                                                    <div className="space-y-1 flex-1">
                                                        <p className="text-[10px] text-gray-400 font-bold">对账单转账参考:</p>
                                                        <p className="font-mono font-black text-xs text-[#FFD200] tracking-wide break-all">{selectedSupplier.bankAccount}</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => copyToClipboard(selectedSupplier.bankAccount || '', 'legacy_bank')}
                                                        className="ml-2 px-2 py-1 text-[9px] font-black uppercase text-[#121212] bg-[#FFD200] hover:bg-amber-300 rounded-lg active:scale-95 transition-all shadow-sm shrink-0"
                                                    >
                                                        {copiedText === 'legacy_bank' ? '已复制' : '📋 复制'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic font-medium mt-1">
                                                💡 暂无绑定的收款银行卡号。点击右上角 ✏️ 按钮编辑录入，以便转账对账。
                                            </p>
                                        )}
                                    </div>
                                    <div className="relative z-10 border-t border-white/5 pt-2 mt-2 flex justify-between items-center text-[10px] text-gray-500 font-bold">
                                         <span>PREMIUM ACCOUNT BOOK</span>
                                         <span className="text-amber-500/80 font-mono">SUP-{selectedSupplier.id}</span>
                                    </div>
                                </div>

                                {/* 工商执照与物流规格 */}
                                <div className="md:col-span-6 grid grid-cols-2 gap-3">
                                    <div className="bg-white border border-gray-200 p-3 rounded-2xl flex flex-col justify-between">
                                        <div>
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">SSM 注册编号</span>
                                            <span className="text-xs font-mono font-black text-[#111111] block truncate">{selectedSupplier.ssmNumber || 'N/A (无记录)'}</span>
                                        </div>
                                        {selectedSupplier.ssmNumber && (
                                            <button 
                                                onClick={() => copyToClipboard(selectedSupplier.ssmNumber || '', 'ssm')}
                                                className="text-[9px] font-extrabold text-[#8B0000] hover:underline flex items-center gap-1 mt-1 select-none active:opacity-50"
                                            >
                                                {copiedText === 'ssm' ? '✅ 已复制' : '📋 复制注册号'}
                                            </button>
                                        )}
                                    </div>

                                    <div className="bg-white border border-gray-200 p-3 rounded-2xl flex flex-col justify-between">
                                        <div>
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">SST 税收代码</span>
                                            <span className="text-xs font-mono font-black text-blue-900 block truncate">{selectedSupplier.sstNumber || '免征/未注册'}</span>
                                        </div>
                                        {selectedSupplier.sstNumber && (
                                            <button 
                                                onClick={() => copyToClipboard(selectedSupplier.sstNumber || '', 'sst')}
                                                className="text-[9px] font-extrabold text-blue-800 hover:underline flex items-center gap-1 mt-1 select-none active:opacity-50"
                                            >
                                                {copiedText === 'sst' ? '✅ 已复制' : '📋 复制税号'}
                                            </button>
                                        )}
                                    </div>

                                    <div className="bg-white border border-gray-200 p-3 rounded-2xl col-span-2">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">常规物流与配送排程 (Delivery Schedule)</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs">🚚</span>
                                            <p className="text-xs font-bold text-[#111111] leading-normal">
                                                {selectedSupplier.deliverySchedule || '未指定排程 (配合 Rest Days 进行下单)'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* 底部地理定位一键导航与备注信息 */}
                                <div className="md:col-span-12 space-y-3 mt-1.5">
                                    {selectedSupplier.address && (
                                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl p-3.5 border border-gray-200/60 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                <span className="text-lg mt-0.5 select-none shrink-0">📍</span>
                                                <div className="min-w-0">
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">提发货地址 (WAREHOUSE ADDRESS)</span>
                                                    <p className="text-xs text-gray-700 font-bold leading-relaxed break-words">{selectedSupplier.address}</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedSupplier.address || '')}`, '_blank')}
                                                className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 font-black text-[11px] hover:shadow-sm active:scale-95 transition-all flex items-center gap-1 shrink-0 select-none cursor-pointer min-h-[36px]"
                                            >
                                                🗺️ 谷歌地图一键导航
                                            </button>
                                        </div>
                                    )}

                                    {selectedSupplier.note && (
                                        <div className="bg-rose-50/20 border border-dotted border-rose-200 rounded-2xl p-3.5">
                                            <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest block mb-1">财务结算/收发票特别条款备忘 (Special Remarks)</span>
                                            <p className="text-xs text-rose-900 font-bold leading-relaxed">{selectedSupplier.note}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden min-h-[500px]">
                            <div className="flex border-b border-gray-100 bg-gray-50/80 p-1.5 gap-1.5">
                                <button onClick={() => setActiveDetailTab('CATALOG')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'CATALOG' ? 'bg-white text-[#111111] shadow-sm ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-700'}`}><Package size={16}/> 产品目录</button>
                                <button onClick={() => setActiveDetailTab('BILLS')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'BILLS' ? 'bg-white text-[#111111] shadow-sm ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-700'}`}><Receipt size={16}/> 历史账单</button>
                            </div>

                            {activeDetailTab === 'CATALOG' && (
                                <div className="p-4 md:p-6">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="font-black text-base md:text-lg text-[#111111] flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-[#111111] text-[#FFD200] flex items-center justify-center shadow-md"><ShoppingBag size={16}/></div>供应目录</h3>
                                        <button onClick={handleAddProduct} className="px-4 py-2.5 bg-[#111111] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:bg-black active:scale-95"><Plus size={14}/> 添加商品</button>
                                    </div>
                                    {(!selectedSupplier.catalog || selectedSupplier.catalog.length === 0) ? (
                                        <div className="py-16 text-center border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50"><Package size={40} className="mx-auto text-gray-300 mb-3"/><p className="text-gray-400 font-bold text-sm">目录为空</p></div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {selectedSupplier.catalog.map(rawItem => {
                                                const item = normalizeCatalogItem(rawItem, allStockList);
                                                const linkedStock = item.linkedStockId ? allStockList.find(s => s.id === item.linkedStockId) : undefined;
                                                return (
                                                    <div key={item.id} className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-[#FFD200] hover:shadow-md transition-all flex flex-col group relative">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="text-[10px] text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{item.supplierCode || 'NO-CODE'}</div>
                                                            <div className="flex items-center gap-1">
                                                                <button onClick={() => { setProductForm(item); setProductUoms(item.uomOptions || DEFAULT_UOMS); setIsEditingProduct(true); }} className="text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 p-1.5 rounded-lg"><Edit3 size={12}/></button>
                                                                <button onClick={(e) => { e.stopPropagation(); setDeleteProductCandidate(item); }} className="text-gray-300 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-1.5 rounded-lg"><Trash2 size={12}/></button>
                                                            </div>
                                                        </div>
                                                        <h4 className="font-bold text-sm text-[#111111] mb-1 line-clamp-2 min-h-[2.5em] leading-snug group-hover:text-blue-700">{item.name}</h4>
                                                        
                                                        {linkedStock && (
                                                            <div className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1 mb-2 inline-flex items-center gap-1">
                                                                <Box size={10} />
                                                                <span className="truncate">已关联: {linkedStock.name}</span>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="font-mono text-base font-black text-[#111111] mb-1">
                                                            RM {(item.pricePerPurchaseUnit ?? item.price).toFixed(2)}
                                                            <span className="text-[10px] text-gray-400 ml-1 font-bold">/{item.purchaseUnitName || item.unit}</span>
                                                        </div>

                                                        {linkedStock && (
                                                            <div className="bg-gray-50 rounded-xl p-2.5 mb-4 text-[10px] text-gray-500 font-bold space-y-1 border border-gray-100">
                                                                <div className="flex justify-between">
                                                                    <span>换算关系:</span>
                                                                    <span className="text-gray-700">1 {item.purchaseUnitName || item.unit} = {item.toBaseRatio || 1} {item.baseUnit || 'pcs'}</span>
                                                                </div>
                                                                <div className="flex justify-between border-t border-gray-200/50 pt-1 mt-1">
                                                                    <span>基础单位成本:</span>
                                                                    <span className="text-amber-700 font-extrabold font-mono">RM {(item.costPerBaseUnit || (item.price / (item.toBaseRatio || 1))).toFixed(4)} / {item.baseUnit || 'pcs'}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mt-auto pt-3 border-t border-gray-100 flex gap-2 flex-wrap">
                                                            <button onClick={() => addToCart(item)} className="flex-1 bg-[#111111] text-white py-2 rounded-xl text-xs font-bold hover:bg-[#FFD200] hover:text-black active:scale-95 flex items-center justify-center gap-1 shadow-sm min-h-[36px]"><Plus size={12}/> 1 {item.purchaseUnitName || item.unit}</button>
                                                            {item.uomOptions?.filter(u => u.ratio > 1).map((uom, idx) => (
                                                                <button key={idx} onClick={() => addToCart(item, uom)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2 rounded-xl text-[10px] font-bold hover:bg-gray-50 active:scale-95 min-h-[36px]">+ 1 {uom.value}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {activeDetailTab === 'BILLS' && (
                                <div className="flex flex-col h-full animate-in fade-in">
                                    <div className="bg-white px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3 sticky top-0 z-10 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <button onClick={handleOpenBillForm} className="px-3 py-1.5 bg-[#111111] text-[#FFD200] rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm active:scale-95 min-h-[36px]"><Plus size={12}/> 录入账单</button>
                                            <button 
                                                onClick={handleExportUnpaidBillsPDF} 
                                                disabled={isExportingUnpaidBills}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm active:scale-95 min-h-[36px] transition-all cursor-pointer ${
                                                    isExportingUnpaidBills 
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/10'
                                                }`}
                                            >
                                                <FileDown size={12}/> 
                                                <span>{isExportingUnpaidBills ? '正在生成 PDF...' : '批量导出未付账单'}</span>
                                            </button>
                                            <button 
                                                onClick={handleExportAllBillsPDF} 
                                                disabled={isExportingAllBills}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm active:scale-95 min-h-[36px] transition-all cursor-pointer ${
                                                    isExportingAllBills 
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10'
                                                }`}
                                            >
                                                <FileDown size={12}/> 
                                                <span>{isExportingAllBills ? '正在生成 PDF...' : '导出历史对账单'}</span>
                                            </button>
                                        </div>
                                        <div className="text-[10px] font-bold text-gray-400">共 {supplierExpenses.length} 笔 · <span className="text-red-500 ml-1 font-black">欠款 RM {billStats.outstanding.toFixed(2)}</span></div>
                                    </div>
                                    <div className="bg-gray-50 px-6 py-2 border-b border-gray-100 flex gap-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest"><div className="flex-[2]">Month & ID</div><div className="flex-1 text-center">Status</div><div className="flex-1 text-right">Amount</div></div>
                                    
                                    {groupedByMonth.length === 0 ? (
                                        <div className="p-16 text-center text-gray-400 text-sm font-medium bg-white">暂无历史账单记录</div>
                                    ) : (
                                        <div className="divide-y divide-gray-100 overflow-y-auto max-h-[500px] bg-white">
                                            {groupedByMonth.map(group => {
                                                const isExpanded = !!expandedMonths[group.key];
                                                return (
                                                    <div key={group.key} className="border-b border-gray-100 last:border-b-0">
                                                        {/* 📂 HTML Accordion Header */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedMonths(prev => ({ ...prev, [group.key]: !isExpanded }))}
                                                            className="w-full px-6 py-3.5 flex items-center justify-between text-left bg-gray-50/55 hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[48px] select-none"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-black text-gray-800">{group.year} {group.monthName}</span>
                                                                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full">{group.count} 笔</span>
                                                            </div>
                                                            <div className="flex items-center gap-2.5">
                                                                <span className="font-mono font-black text-[#111111] text-xs">RM {group.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                {isExpanded ? <ChevronUp size={14} className="text-indigo-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                                                            </div>
                                                        </button>

                                                        {/* 📄 Monthly Bill List */}
                                                        {isExpanded && (
                                                            <div className="bg-white divide-y divide-gray-100/50 animate-in fade-in duration-200">
                                                                {group.bills.map(bill => (
                                                                    <div 
                                                                        key={bill.id} 
                                                                        onClick={() => {
                                                                            window.dispatchEvent(new CustomEvent('erp-navigate-ap', { 
                                                                                detail: { 
                                                                                    billId: bill.id,
                                                                                    company: bill.company || selectedSupplier?.name || '',
                                                                                    date: bill.time.split('T')[0]
                                                                                } 
                                                                            }));
                                                                        }}
                                                                        className="px-8 py-3 flex items-center hover:bg-indigo-50/40 active:bg-indigo-100/40 cursor-pointer transition-all min-h-[58px]"
                                                                        title="点击此项将直接跳转至【应付账款】并追查此账单"
                                                                    >
                                                                        <div className="flex-[2] pr-2">
                                                                            <div className="font-bold text-xs text-gray-800 mb-0.5 flex items-center gap-1.5 flex-wrap">
                                                                                <span>{bill.time.split('T')[0]}</span>
                                                                                <span className="text-[8px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1 rounded-sm font-black flex items-center gap-0.5 scale-90 origin-left">
                                                                                    🔍 追踪
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1 py-0.5 rounded w-fit inline-block leading-none">
                                                                                #{bill.id.slice(-8)}
                                                                            </div>
                                                                            {bill.note && <p className="text-[10px] text-gray-400 truncate mt-0.5 max-w-[140px]">{bill.note}</p>}
                                                                        </div>
                                                                        <div className="flex-1 text-center">
                                                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${bill.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/10'}`}>
                                                                                {bill.paymentStatus}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex-1 text-right">
                                                                            <div className="font-mono font-black text-xs text-[#111111]">RM {(bill.totalBillAmount || bill.amount || 0).toFixed(2)}</div>
                                                                            {bill.outstandingAmount && bill.outstandingAmount > 0 ? (
                                                                                <div className="text-[9px] text-rose-500 font-bold mt-0.5 leading-none">未付: RM {bill.outstandingAmount.toFixed(2)}</div>
                                                                            ) : (
                                                                                <div className="text-[8px] text-emerald-600 font-black mt-0.5 leading-none">已付讫</div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 采购单记录 */}
                {mainTab === 'POS' && view === 'LIST' && (
                    <div className="max-w-6xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="font-black text-base text-[#111111] flex items-center gap-2"><div className="p-2 bg-[#FFD200] rounded-xl"><ClipboardCheck size={18}/></div> 采购单历史</h3>
                            <div className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">Total: {purchaseOrders.length}</div>
                        </div>
                        {purchaseOrders.length === 0 ? (
                            <div className="bg-white rounded-[2rem] p-16 text-center border border-gray-100 shadow-sm"><div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"><FileText size={32} className="text-gray-300"/></div><p className="font-black text-gray-400 text-lg">暂无采购单</p></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {purchaseOrders.map(po => (
                                    <div key={po.id} className="bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:border-[#FFD200]/50 transition-all flex flex-col group relative">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] tracking-widest shadow-sm ${po.status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : po.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>{po.status === 'RECEIVED' ? 'RCV' : po.status === 'CANCELLED' ? 'CNL' : 'ORD'}</div>
                                                <div><div className="font-mono font-black text-sm text-[#111111]">{po.id}</div><div className="text-[10px] font-bold text-gray-400">{po.date.split('T')[0]}</div></div>
                                            </div>
                                        </div>
                                        <div className="font-bold text-[#111111] text-sm flex items-center gap-2 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100"><Truck size={14} className="text-gray-400 shrink-0"/> <span className="truncate">{po.supplierName}</span></div>
                                        <div className="flex justify-between items-end mt-auto pt-3 border-t border-gray-100">
                                            <div><p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Est. Amount</p><p className="font-mono font-black text-base text-blue-700">RM {po.totalEstimated.toFixed(2)}</p></div>
                                            <div className="flex gap-1.5">
                                                {po.status === 'ORDERED' && (<button onClick={() => initiateReceivePO(po)} className="bg-[#111111] text-[#FFD200] px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-black shadow-md active:scale-95">入库收货</button>)}
                                                <button onClick={() => sendWhatsappPO(po)} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"><Send size={14}/></button>
                                                <button onClick={() => handleExportPO_PDF(po)} disabled={isGeneratingPdf && printingPO?.id === po.id} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-200">{isGeneratingPdf && printingPO?.id === po.id ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>}</button>
                                                <button onClick={() => setDeletePOCandidate(po.id)} className="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* HIDDEN PRINT TEMPLATE FOR PURCHASE ORDERS */}
            {printingPO && (
                <div style={{ position: 'fixed', top: '0px', left: '0px', zIndex: -9999, pointerEvents: 'none' }}>
                    <div ref={printRef}>
                        {Array.from({ length: Math.ceil(printingPO.items.length / ITEMS_PER_PAGE) }).map((_, i) => {
                            const pageItems = printingPO.items.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
                            return (
                                <div
                                    key={i}
                                    id={`po-print-page-${i}`}
                                    className="w-[794px] min-h-[1123px] bg-white p-12 text-black font-sans relative flex flex-col justify-between"
                                >
                                    <div>
                                        {/* Header */}
                                        <div className="flex justify-between items-start border-b-4 border-[#111111] pb-5 mb-8">
                                            <div>
                                                <h1 className="text-2xl font-black uppercase tracking-wider text-[#111111] mb-1">采购订单</h1>
                                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Purchase Order</p>
                                                <p className="text-[9px] text-gray-400 font-bold mt-2 font-mono">
                                                    订单日期 Date: {printingPO.date.split('T')[0]}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xl font-black text-[#111111]">KIM LIAN KEE (KEPONG)</p>
                                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">金莲记（甲洞）</p>
                                                <p className="text-[9px] text-gray-400 font-mono">PO No: {printingPO.id}</p>
                                            </div>
                                        </div>

                                        {/* Info Block */}
                                        <div className="grid grid-cols-2 gap-8 mb-8">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">供应商 Supplier</p>
                                                <p className="text-sm font-black text-[#111111]">{printingPO.supplierName}</p>
                                                <p className="text-[10px] text-gray-500 font-mono mt-1">ID: {printingPO.supplierId}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">收货方 Deliver To</p>
                                                <p className="text-sm font-black text-[#111111]">KIM LIAN KEE (KEPONG) SDN BHD</p>
                                                <p className="text-[10px] text-gray-500 mt-1">No. 52, Jalan Metro Perdana Barat 13, Kepong, KL</p>
                                            </div>
                                        </div>

                                        {/* Items Table */}
                                        <table className="w-full text-left text-[10px] border-collapse mb-8">
                                            <thead>
                                                <tr className="bg-[#111111] text-white font-black text-[9px]">
                                                    <th className="p-2 text-left rounded-l-lg">序号 No.</th>
                                                    <th className="p-2 text-left">商品名称 Item Description</th>
                                                    <th className="p-2 text-right">数量 Qty</th>
                                                    <th className="p-2 text-center">单位 Unit</th>
                                                    <th className="p-2 text-right">单价 Price (RM)</th>
                                                    <th className="p-2 text-right rounded-r-lg">预估小计 Subtotal (RM)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {pageItems.map((item, idx) => {
                                                    const itemNo = i * ITEMS_PER_PAGE + idx + 1;
                                                    const subtotal = item.totalCost || item.estimatedTotal || (item.orderQty * item.cost) || 0;
                                                    return (
                                                        <tr key={idx} className="hover:bg-gray-50/50">
                                                            <td className="p-2 text-left font-mono font-bold text-gray-500">{itemNo}</td>
                                                            <td className="p-2">
                                                                <div className="font-bold text-[#111111]">{item.name}</div>
                                                                {item.supplierCode && <span className="text-[8px] font-mono bg-gray-100 text-gray-600 px-1 py-0.5 rounded">Code: {item.supplierCode}</span>}
                                                            </td>
                                                            <td className="p-2 text-right font-mono font-bold">{item.orderQty}</td>
                                                            <td className="p-2 text-center font-bold text-gray-600">{item.unit}</td>
                                                            <td className="p-2 text-right font-mono font-bold">{(item.cost || 0).toFixed(2)}</td>
                                                            <td className="p-2 text-right font-mono font-black text-[#111111]">{subtotal.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Footer (Legend / Signature) */}
                                    <div>
                                        {i === Math.ceil(printingPO.items.length / ITEMS_PER_PAGE) - 1 && (
                                            <div className="border-t border-gray-200 pt-4 mb-8 flex justify-between items-end">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Total Estimated Amount</p>
                                                    <p className="text-xl font-mono font-black text-blue-700">RM {printingPO.totalEstimated.toFixed(2)}</p>
                                                </div>
                                                <div className="flex gap-12 text-center text-[9px] text-gray-500">
                                                    <div>
                                                        <p>采购人 (Prepared By)</p>
                                                        <div className="w-28 border-b border-dashed border-gray-300 mt-8"></div>
                                                    </div>
                                                    <div>
                                                        <p>批准人 (Approved By)</p>
                                                        <div className="w-28 border-b border-dashed border-gray-300 mt-8"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-[8px] text-gray-400 font-mono">
                                            <span>KIM LIAN KEE ERP SYSTEM • PO GENERATION</span>
                                            <span>Page {i + 1} of {Math.ceil(printingPO.items.length / ITEMS_PER_PAGE)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* HIDDEN PRINT TEMPLATE FOR SUPPLIER UNPAID BILLS */}
            <div style={{ position: 'fixed', top: '0px', left: '0px', zIndex: -9999, pointerEvents: 'none' }}>
                <div ref={supplierPrintRef} id="supplier-print-export-root" className="w-[794px] min-h-[1123px] bg-white p-12 text-black font-sans relative">
                    <div className="flex justify-between items-start border-b-4 border-rose-950 pb-5 mb-8">
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-wider text-rose-950 mb-1">未付款账单对账单</h1>
                            <p className="text-[10px] font-black text-rose-800 uppercase tracking-widest">Unpaid Statement of Accounts</p>
                            <p className="text-[9px] text-gray-400 font-bold mt-2 font-mono">
                                导出日期 Date Generated: {new Date().toLocaleDateString()}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-black text-rose-950">{selectedSupplier?.name || '供应商'}</p>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">金莲记 KIM LIAN KEE</p>
                            <p className="text-[9px] text-gray-400 font-medium">Finance Ledger Statement</p>
                        </div>
                    </div>

                    {/* 📊 统计区块 */}
                    <div className="grid grid-cols-3 gap-4 mb-8 text-center bg-rose-50/40 p-4 rounded-xl border border-rose-100">
                        <div>
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">未结单数 Count</p>
                            <p className="text-lg font-black text-rose-950">{supplierPrintBills.length} 笔</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">账单原始总额 Total</p>
                            <p className="text-lg font-black text-stone-800 font-mono">RM {supplierPrintBills.reduce((acc,b)=>acc+(b.totalBillAmount || b.amount || 0),0).toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-rose-800 uppercase tracking-widest mb-1">未付款总额 Outstanding</p>
                            <p className="text-lg font-black text-red-700 font-mono">RM {supplierPrintBills.reduce((acc,b)=>acc+(b.outstandingAmount||0),0).toFixed(2)}</p>
                        </div>
                    </div>

                    {/* 📋 明细表格 */}
                    <table className="w-full text-left text-[10px] border-collapse mb-12">
                        <thead>
                            <tr className="bg-rose-950 text-white font-black text-[9px]">
                                <th className="p-2.5 uppercase tracking-wider text-left rounded-l-lg">账单日期 Date</th>
                                <th className="p-2.5 uppercase tracking-wider text-left">内容与科目 Category &amp; Description</th>
                                <th className="p-2.5 uppercase tracking-wider text-right">账单金额 Total (RM)</th>
                                <th className="p-2.5 uppercase tracking-wider text-right">折让 CN (RM)</th>
                                <th className="p-2.5 uppercase tracking-wider text-right rounded-r-lg">未付金额 Outstanding (RM)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {supplierPrintBills.map((bill, i) => (
                                <tr key={i} className="hover:bg-rose-50/10">
                                    <td className="p-2.5 font-mono font-bold text-gray-700">{bill.time.split('T')[0]}</td>
                                    <td className="p-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[8px] font-black bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded uppercase">{bill.category}</span>
                                            {bill.invoiceRef && <span className="text-[8px] font-mono font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded">Inv: {bill.invoiceRef}</span>}
                                        </div>
                                        <div className="text-[11px] font-bold text-gray-800 mt-1 leading-relaxed">
                                            {bill.note || '进货款项 / Raw Materials & Supplies'}
                                        </div>
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-bold">{(bill.totalBillAmount || bill.amount || 0).toFixed(2)}</td>
                                    <td className="p-2.5 text-right font-mono text-orange-700 font-bold">{(bill.creditNote || 0).toFixed(2)}</td>
                                    <td className="p-2.5 text-right font-mono font-black text-red-700 bg-red-50/30">{(bill.outstandingAmount || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* ✍️ 签名确认区域 */}
                    <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between gap-12">
                        <div className="flex-1">
                            <p className="text-[9px] font-black uppercase text-rose-900 tracking-wider">✍️ 供应商代表签字 &amp; 盖章 Supplier Signature &amp; Stamp</p>
                            <div className="w-full border-b border-dashed border-gray-300 mt-14"></div>
                            <div className="flex justify-between text-[8px] text-gray-400 font-bold mt-2">
                                <span>姓名 Name: _________________</span>
                                <span>日期 Date: _________________</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <p className="text-[9px] font-black uppercase text-gray-700 tracking-wider">✍️ 金莲记负责人确认签字 Authorized Signature</p>
                            <div className="w-full border-b border-dashed border-gray-300 mt-14"></div>
                            <div className="flex justify-between text-[8px] text-gray-400 font-bold mt-2">
                                <span>姓名 Name: _________________</span>
                                <span>日期 Date: _________________</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* 所有弹窗（子组件化） */}
            {/* ============================================================ */}

            {isEditingSupplier && (
                <SupplierEditModal supplierForm={supplierForm} suppliers={suppliers} isSyncingName={isSyncingName} onChange={setSupplierForm} onSave={handleSaveSupplier} onClose={() => setIsEditingSupplier(false)} />
            )}

            {isEditingProduct && (
                <ProductEditModal productForm={productForm} productUoms={productUoms} allStockList={allStockList} stockSearchTerm={stockSearchTerm} onFormChange={setProductForm} onUomsChange={setProductUoms} onStockSearchChange={setStockSearchTerm} onSave={handleSaveProduct} onClose={() => setIsEditingProduct(false)} />
            )}

            {isBillFormOpen && (
                <BillFormModal newBill={newBill} onChange={setNewBill} onSave={handleSaveBill} onClose={() => setIsBillFormOpen(false)} />
            )}

            {isReceiveModalOpen && receivingPO && (
                <ReceivePOModal receivingPO={receivingPO} receivedItems={receivedItems} isProcessingReceive={isProcessingReceive} onUpdateItem={updateReceivedItem} onConfirm={confirmReceivePO} onClose={() => setIsReceiveModalOpen(false)} />
            )}

            {isCreatingPO && cart.length > 0 && (
                <POCart cart={cart} selectedSupplier={selectedSupplier} isCartExpanded={isCartExpanded} onToggleExpand={() => setIsCartExpanded(!isCartExpanded)} onUpdateQty={updateCartQty} onRemove={removeFromCart} onCreatePO={handleCreatePO} />
            )}

            {deleteProductCandidate && (<DeleteProductModal onConfirm={executeDeleteProduct} onCancel={() => setDeleteProductCandidate(null)} />)}
            {deletePOCandidate && (<DeletePOModal onConfirm={executeDeletePO} onCancel={() => setDeletePOCandidate(null)} />)}
            {deleteSupplierId && (<DeleteSupplierModal onConfirm={executeDeleteSupplier} onCancel={() => setDeleteSupplierId(null)} />)}

            {isExportModalOpen && (
                <div id="supplier-export-pdf-modal" className="fixed inset-0 bg-[#111111]/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in zoom-in-95 duration-200">
                    <div className="bg-white w-full max-w-2xl rounded-[2rem] overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[85vh]">
                        {/* Title bar */}
                        <div className="bg-[#111111] text-white p-5 border-b-4 border-[#FFD200] flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="bg-[#FFD200] p-1.5 rounded-lg text-black"><FileDown size={18}/></span>
                                <div>
                                    <h3 className="font-serif font-black text-base md:text-lg tracking-wide text-white">选择要导出的供应商</h3>
                                    <p className="text-[10px] text-gray-400 font-mono tracking-wider mt-0.5">SELECT SUPPLIERS FOR PDF COMPILATION</p>
                                </div>
                            </div>
                            <button onClick={() => setIsExportModalOpen(false)} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all text-gray-300"><X size={18}/></button>
                        </div>

                        {/* Search & Select tools */}
                        <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col md:flex-row gap-3 items-center shrink-0">
                            <div className="relative w-full md:flex-1">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="搜索供应商或编号以筛选列表..." 
                                    value={exportSearchTerm} 
                                    onChange={e => setExportSearchTerm(e.target.value)} 
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]/30 focus:border-[#FFD200] transition-all"
                                />
                            </div>
                            <div className="flex gap-2 w-full md:w-auto shrink-0">
                                <button 
                                    onClick={handleSelectAllExport}
                                    type="button"
                                    className="flex-1 md:flex-none px-3 py-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-[11px] font-black pointer-events-auto active:scale-95 transition-all text-gray-700"
                                >
                                    全选 ({filteredExportSuppliers.length})
                                </button>
                                <button 
                                    onClick={handleDeselectAllExport}
                                    type="button"
                                    className="flex-1 md:flex-none px-3 py-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-[11px] font-black pointer-events-auto active:scale-95 transition-all text-gray-700"
                                >
                                    清空
                                </button>
                            </div>
                        </div>

                        {/* Suppliers list */}
                        <div className="flex-grow overflow-y-auto p-4 divide-y divide-gray-100">
                            {filteredExportSuppliers.length === 0 ? (
                                <div className="py-12 text-center text-gray-400 font-bold text-xs">没有找到符合条件的供应商</div>
                            ) : (
                                filteredExportSuppliers.map(sup => {
                                    const isChecked = selectedExportIds.includes(sup.id);
                                    const codeSample = formatSupplierFilenameCode(sup.id, sup.name);
                                    return (
                                        <label 
                                            key={sup.id} 
                                            htmlFor={`export-check-${sup.id}`}
                                            className="flex items-center gap-3.5 py-3 px-2.5 hover:bg-gray-50 rounded-xl cursor-pointer select-none transition-colors group"
                                        >
                                            <input 
                                                id={`export-check-${sup.id}`}
                                                type="checkbox" 
                                                checked={isChecked}
                                                onChange={() => handleToggleSelectExport(sup.id)}
                                                className="w-5 h-5 rounded border-gray-300 text-[#111111] focus:ring-[#FFD200] font-black scale-105 shrink-0"
                                            />
                                            <div className="min-w-0 flex-grow">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[10px] font-black bg-[#111111] text-[#FFD200] px-1.5 py-0.5 rounded-md">{sup.id}</span>
                                                    <h4 className="font-bold text-xs text-[#111111] truncate group-hover:text-blue-700 transition-colors">{sup.name}</h4>
                                                </div>
                                                <p className="text-[10px] font-mono text-gray-400 mt-1 flex items-center gap-1">
                                                    <span>映射码:</span>
                                                    <span className="font-semibold text-red-700 bg-red-50 px-1 py-0.5 rounded break-all">{codeSample}</span>
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })
                            )}
                        </div>

                        {/* Bottom Actions footer */}
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-3 shrink-0">
                            <div className="text-[11px] font-bold text-gray-500">
                                已选中 <span className="text-[#8B0000] font-black text-xs">{selectedExportIds.length}</span> 个供应商对账实体进行打包编译
                            </div>
                            <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
                                <button 
                                    onClick={() => setIsExportModalOpen(false)}
                                    type="button"
                                    className="flex-1 md:flex-none px-4 py-2 border border-gray-200 bg-white hover:bg-gray-100 rounded-xl text-xs font-bold transition-all"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={handleConfirmExport}
                                    type="button"
                                    disabled={selectedExportIds.length === 0}
                                    className="flex-1 md:flex-none px-5 py-2.5 bg-[#111111] text-[#FFD200] hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer min-h-[40px]"
                                >
                                    <FileDown size={14}/> 确认生成 PDF 凭据
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isCleanModalOpen && (
                <div id="supplier-consolidation-hub-modal" className="fixed inset-0 bg-[#111111]/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in zoom-in-95 duration-200 font-sans">
                    <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
                        {/* Header */}
                        <div className="bg-[#111111] text-white p-5 border-b border-[#FFD200]/50 shrink-0 flex justify-between items-center">
                            <div>
                                <h3 className="font-serif font-black text-base flex items-center gap-2 text-white">🔠 集团商户去重与大写规范中心</h3>
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-mono mt-0.5">Enterprise Supplier Cleansing Hub</p>
                            </div>
                            <button 
                                id="btn-close-consolidation-hub"
                                onClick={() => { setIsCleanModalOpen(false); setCleaningLogs([]); }}
                                disabled={isCleaning}
                                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer disabled:opacity-20"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Analysis Quick Overview Panels */}
                        <div className="bg-amber-50/50 border-b border-amber-100 p-4 shrink-0 grid grid-cols-2 gap-3">
                            <div className="bg-white border border-amber-200/50 p-3 rounded-xl flex items-center gap-3">
                                <span className="text-2xl">🔄</span>
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">重叠副本商家</p>
                                    <p className="font-black text-base text-amber-950">{detectedDuplicateGroups.length} 组同名异常</p>
                                </div>
                            </div>
                            <div className="bg-white border border-amber-200/50 p-3 rounded-xl flex items-center gap-3">
                                <span className="text-2xl">🔠</span>
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">需大写矫正商家</p>
                                    <p className="font-black text-base text-amber-950">{lowercaseSingleSuppliers.length} 家未标准大写</p>
                                </div>
                            </div>
                        </div>

                        {/* Middle Content View - Scrollable list & manual merge */}
                        <div className="flex-grow overflow-y-auto p-5 space-y-5">
                            {/* Running Logs terminal if active */}
                            {cleaningLogs.length > 0 && (
                                <div className="space-y-1.5 shrink-0">
                                    <p className="text-xs font-black text-gray-700 flex items-center gap-1.5">
                                        <span>⚙️ 级联洗数跑批日志终端 (Analytics Logs):</span>
                                        {isCleaning && <Loader2 size={12} className="animate-spin text-red-700" />}
                                    </p>
                                    <div id="consolidation-log-console" className="bg-gray-950 text-green-400 font-mono text-[11px] p-3.5 rounded-xl max-h-40 overflow-y-auto space-y-1 border border-gray-800 shadow-inner">
                                        {cleaningLogs.map((log, idx) => (
                                            <div key={idx} className="leading-relaxed flex items-start gap-1">
                                                <span className="text-[#FFD200] shrink-0 select-none">❯</span>
                                                <span className="break-all">{log}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Batch Global Action Board */}
                            <div className="bg-[#FFD200]/5 rounded-2xl p-4 border border-[#FFD200]/30 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="space-y-1 text-center md:text-left">
                                    <h4 className="font-black text-sm text-[#111111]">⚡ 全局一键智能清洗合并法 (推荐)</h4>
                                    <p className="text-[11px] text-gray-500 font-bold leading-relaxed">
                                        执行后系统将自动找出所有同名大小写拼写分叉的供应商，无损将其所有的应付账款、日结对账记录、采购单(PO)、付款凭证(PV)刷新归并到唯一的主商家下，并彻底转换为大写拼写。
                                    </p>
                                </div>
                                <button
                                    id="btn-batch-auto-clean"
                                    onClick={async () => {
                                        setIsCleaning(true);
                                        setCleaningLogs(["🚀 全局商户大写级联洗数任务就绪..."]);
                                        try {
                                            const plans: { masterId: string; duplicateIds: string[]; targetName: string }[] = [];
                                            
                                            // Process duplicate groups
                                            detectedDuplicateGroups.forEach(group => {
                                                const targetName = group[0].name.trim().toUpperCase();
                                                const sorted = [...group].sort((a, b) => {
                                                    const aIsUpper = a.name === targetName;
                                                    const bIsUpper = b.name === targetName;
                                                    if (aIsUpper && !bIsUpper) return -1;
                                                    if (!aIsUpper && bIsUpper) return 1;
                                                    const aCat = a.catalog?.length || 0;
                                                    const bCat = b.catalog?.length || 0;
                                                    return bCat - aCat;
                                                });
                                                
                                                const master = sorted[0];
                                                const duplicateIds = sorted.slice(1).map(s => s.id);
                                                plans.push({
                                                    masterId: master.id,
                                                    duplicateIds,
                                                    targetName
                                                });
                                            });
                                            
                                            // Process lowercase singletons
                                            lowercaseSingleSuppliers.forEach(sup => {
                                                plans.push({
                                                    masterId: sup.id,
                                                    duplicateIds: [],
                                                    targetName: sup.name.trim().toUpperCase()
                                                });
                                            });
                                            
                                            if (plans.length === 0) {
                                                setCleaningLogs(prev => [...prev, "✨ 完美！未检测到任何命名不合规或多版本重复商户，无需操作。"]);
                                                setIsCleaning(false);
                                                return;
                                            }
                                            
                                            setCleaningLogs(prev => [...prev, `📊 共计规划了 ${plans.length} 组洗数指令，调用底层批处理管道...`]);
                                            await DataManager.mergeAndCapitalizeSuppliers(plans, (step) => {
                                                setCleaningLogs(prev => [...prev, `⚡ ${step}`]);
                                            });
                                            
                                            setCleaningLogs(prev => [...prev, "🎉 级联数据清洗已全面胜利结束！全部应付账单完美绑定于全规范大写供应商下。"]);
                                            await loadData(true);
                                        } catch (err: any) {
                                            setCleaningLogs(prev => [...prev, `❌ 清洗批处理任务失败: ${err.message || err}`]);
                                        } finally {
                                            setIsCleaning(false);
                                        }
                                    }}
                                    disabled={isCleaning || (detectedDuplicateGroups.length === 0 && lowercaseSingleSuppliers.length === 0)}
                                    className="w-full md:w-auto shrink-0 bg-[#8B0000] hover:bg-rose-950 disabled:bg-gray-200 disabled:text-gray-400 text-white px-5 py-3 rounded-xl text-xs font-black shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all min-h-[44px] cursor-pointer"
                                >
                                    🚀 一键跑批标准大写清洗
                                </button>
                            </div>

                            {/* Manual precision merge section */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
                                <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-widest">🎛️ 手工交叉指定商家合并 (Manual Merge)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div>
                                        <label className={SUP_LABEL_STYLE} htmlFor="select-merge-source">被合并的源头商家 (将被删除，关联订单账目流入保留方)</label>
                                        <select 
                                            id="select-merge-source"
                                            value={manualSourceId} 
                                            onChange={e => setManualSourceId(e.target.value)} 
                                            className="w-full bg-gray-50 border border-gray-200 text-[#111111] text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-[#FFD200] min-h-[44px]"
                                        >
                                            <option value="">-- 请选择被销毁的源商家 --</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>[{s.id}] {s.name} ({s.catalog?.length || 0} 个产品)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={SUP_LABEL_STYLE} htmlFor="select-merge-target">核定保留的主商家 (吸纳账目归档，强制规范为全大写)</label>
                                        <select 
                                            id="select-merge-target"
                                            value={manualTargetId} 
                                            onChange={e => setManualTargetId(e.target.value)} 
                                            className="w-full bg-gray-50 border border-gray-200 text-[#111111] text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-[#FFD200] min-h-[44px]"
                                        >
                                            <option value="">-- 请选择保留的主商家 --</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>[{s.id}] {s.name} ({s.catalog?.length || 0} 个产品)</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={runManualMerge}
                                        disabled={isCleaning || !manualSourceId || !manualTargetId}
                                        className="w-full md:w-auto px-5 py-2.5 bg-gray-900 text-[#FFD200] rounded-xl text-xs font-black hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 active:scale-95 transition-all min-h-[44px]"
                                    >
                                        🔗 确认合并所选两家
                                    </button>
                                </div>
                            </div>

                            {/* Detailed List of duplicate groups for verification */}
                            <div className="space-y-3">
                                <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                    <span>🔎 排查发现的同名重复商家集合 ({detectedDuplicateGroups.length} 组)</span>
                                </h4>
                                {detectedDuplicateGroups.length === 0 ? (
                                    <div className="p-8 text-center bg-gray-50/50 border border-dashed border-gray-200 rounded-2xl text-[11px] text-gray-400 font-bold">
                                        ✨ 无重合件！所有商家独立不重复。
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                        {detectedDuplicateGroups.map((group, gIdx) => {
                                            const normalizedName = group[0].name.trim().toUpperCase();
                                            return (
                                                <div key={gIdx} className="border border-gray-200 rounded-2xl p-3.5 space-y-3 bg-white shadow-sm">
                                                    <div className="flex justify-between items-start border-b border-gray-100 pb-2">
                                                        <div>
                                                            <h5 className="font-black text-xs text-[#111111]">{normalizedName}</h5>
                                                            <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1.5 mt-0.5">
                                                                <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-black">发现 {group.length} 个重合档案</span>
                                                            </p>
                                                        </div>
                                                        <select
                                                            onChange={(e) => {
                                                                if (e.target.value) {
                                                                    runAutoMerge(group, e.target.value);
                                                                    e.target.value = ""; // reset
                                                                }
                                                            }}
                                                            defaultValue=""
                                                            className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 text-[10px] font-black rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                                                        >
                                                            <option value="">⚡ 常规归纳本组...</option>
                                                            {group.map(s => (
                                                                <option key={s.id} value={s.id}>保留 ID: [{s.id}] {s.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {group.map(s => (
                                                            <div key={s.id} className="flex justify-between items-center text-[11px] font-medium bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono bg-gray-200 text-gray-700 px-1 py-0.5 rounded text-[9px] font-black">{s.id}</span>
                                                                    <span className="font-bold text-gray-700">{s.name}</span>
                                                                </div>
                                                                <span className="text-[10px] text-gray-400 font-bold font-mono">
                                                                    📦 {s.catalog?.length || 0} 件商品
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Detailed List of lowercase singletons */}
                            <div className="space-y-3">
                                <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-widest">
                                    <span>🔡 需转换拼写大小写的商家名单 ({lowercaseSingleSuppliers.length} 家)</span>
                                </h4>
                                {lowercaseSingleSuppliers.length === 0 ? (
                                    <div className="p-8 text-center bg-gray-50/50 border border-dashed border-gray-200 rounded-2xl text-[11px] text-gray-400 font-bold">
                                        ✨ 无大小写漏洞！全部商家档案名称均已为全大写。
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {lowercaseSingleSuppliers.map(s => (
                                            <div key={s.id} className="flex justify-between items-center p-3 rounded-xl border border-gray-200 bg-white shadow-sm gap-2">
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono bg-gray-100 text-[#111111] px-1.5 py-0.5 rounded text-[9px] font-black">{s.id}</span>
                                                        <span className="font-bold text-xs text-rose-900">{s.name}</span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 font-bold mt-1 flex items-center gap-1">
                                                        <span>系统将格式化为:</span> 
                                                        <span className="font-mono bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded font-black">{s.name.toUpperCase()}</span>
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => runSingleCapitalize(s)}
                                                    className="px-3.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 rounded-xl text-[11px] font-black active:scale-95 transition-all min-h-[36px] cursor-pointer"
                                                >
                                                    🔠 转大写
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="p-5 bg-gray-50 border-t border-[#FFD200]/30 shrink-0 flex justify-end gap-3">
                            <button
                                onClick={() => { setIsCleanModalOpen(false); setCleaningLogs([]); }}
                                disabled={isCleaning}
                                className="px-5 py-3 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl text-xs font-black transition-all active:scale-95 min-h-[44px] disabled:opacity-20 cursor-pointer"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 📱 手机端底栏固定操作栏 (Sticky Bottom Actions Bar) - 适配 iOS & HIG & Safe Areas */}
            {!isCleanModalOpen && !isExportModalOpen && !isEditingSupplier && !isEditingProduct && !isBillFormOpen && !isReceiveModalOpen && (
                <div id="sticky-bottom-actions-bar" className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 bg-[#111111]/95 backdrop-blur-lg border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] rounded-2xl p-3 flex items-center justify-between gap-2.5 font-sans">
                    {view === 'LIST' && mainTab === 'SUPPLIERS' && (
                        <div className="flex items-center justify-between w-full gap-2 font-sans">
                            {/* 洗数规范 */}
                            <button 
                                id="btn-mobile-clean"
                                onClick={handleOpenCleanMergeModal}
                                className="flex-1 min-h-[44px] bg-amber-500/10 border border-amber-500/20 active:bg-amber-500/20 rounded-xl flex flex-col items-center justify-center relative cursor-pointer"
                            >
                                <span className="text-[14px]">🔠</span>
                                <span className="text-[9px] font-black text-amber-400 tracking-wider">重名洗数</span>
                                {(detectedDuplicateGroups.length > 0 || lowercaseSingleSuppliers.length > 0) && (
                                    <span className="absolute -top-1.5 -right-1 bg-red-700 text-white text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse shadow-sm">
                                        {(detectedDuplicateGroups.length + lowercaseSingleSuppliers.length)}
                                    </span>
                                )}
                            </button>

                            {/* 导出 PDF */}
                            <button 
                                id="btn-mobile-export"
                                onClick={handleOpenExportModal}
                                className="flex-1 min-h-[44px] bg-white/5 border border-white/10 active:bg-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer"
                            >
                                <FileDown size={14} className="text-red-400" />
                                <span className="text-[9px] font-black text-gray-300 tracking-wider">合并导出</span>
                            </button>

                            {/* 录入新商家 */}
                            <button 
                                id="btn-mobile-add-supplier"
                                onClick={handleOpenAddSupplier}
                                className="flex-[2] min-h-[44px] bg-[#FFD200] text-black active:bg-[#FFE44D] rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer font-black text-xs"
                            >
                                <Plus size={16} className="stroke-[3]" />
                                <span>录入新供商</span>
                            </button>
                        </div>
                    )}

                    {view === 'LIST' && mainTab === 'POS' && (
                        <div className="flex items-center justify-between w-full gap-2.5 font-sans">
                            <div className="text-[11px] text-gray-300 font-bold ml-1.5 flex flex-col">
                                <span className="text-[9px] text-gray-400 uppercase font-mono tracking-wider">历史账目总览</span>
                                <span className="font-extrabold text-white">共 {purchaseOrders.length} 份采购存单</span>
                            </div>
                            <button 
                                id="btn-mobile-goto-suppliers"
                                onClick={() => { setMainTab('SUPPLIERS'); }}
                                className="px-5 min-h-[44px] bg-[#FFD200] text-[#111111] rounded-xl flex items-center justify-center gap-1.5 shadow-md font-black text-xs cursor-pointer animate-pulse"
                            >
                                <Plus size={15} />
                                <span>前往选购下单</span>
                            </button>
                        </div>
                    )}

                    {view === 'DETAIL' && selectedSupplier && (
                        <div className="flex items-center justify-between w-full gap-2 font-sans">
                            {/* 返回 */}
                            <button 
                                id="btn-mobile-back-list"
                                onClick={() => { setView('LIST'); setSelectedSupplier(null); }}
                                className="flex-1 min-h-[44px] bg-white/5 border border-white/10 active:bg-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer"
                            >
                                <ArrowLeft size={14} className="text-gray-300" />
                                <span className="text-[9px] font-black text-gray-400 tracking-wider">返回列表</span>
                            </button>

                            {/* 录入账单 */}
                            <button 
                                id="btn-mobile-add-bill"
                                onClick={() => { setActiveDetailTab('BILLS'); handleOpenBillForm(); }}
                                className="flex-[1.5] min-h-[44px] bg-rose-500/10 border border-rose-500/20 active:bg-rose-500/20 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer font-black text-xs text-rose-300"
                            >
                                <Receipt size={14} className="text-rose-400" />
                                <span>录入账单</span>
                            </button>

                            {/* 添加目录商品 */}
                            <button 
                                id="btn-mobile-add-product"
                                onClick={() => { setActiveDetailTab('CATALOG'); handleAddProduct(); }}
                                className="flex-[2] min-h-[44px] bg-[#FFD200] text-black active:bg-[#FFE44D] rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer font-black text-xs"
                            >
                                <Plus size={16} className="stroke-[3]" />
                                <span>添加商品</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (isModal) {
        return (<div className="fixed inset-0 bg-[#111111]/80 z-[80] flex items-center justify-center p-0 md:p-6 backdrop-blur-md animate-in zoom-in duration-300">{MainContent}</div>);
    }
    return MainContent;
};
