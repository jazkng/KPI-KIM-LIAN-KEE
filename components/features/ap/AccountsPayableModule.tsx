// @ts-nocheck
import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { CreditCard, Calendar, DollarSign, Filter, CheckCircle2, X, Loader2, Plus, Edit3, Trash2, Search, ArrowLeft, ExternalLink, FileDown, User, RefreshCw, CheckSquare, ListChecks, ChevronDown, RotateCcw, FileText, History, AlertTriangle, Archive, Sparkles } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';


// UI & Constants
import { ModuleGuideButton } from '../../ui/ModuleGuide';
import { PaymentVoucherTemplate } from '../PaymentVoucherTemplate';
import { PaymentVoucherHistory } from '../PaymentVoucherHistory';
import { BackdatePVModule } from '../BackdatePVModule';

import {
    PaymentVoucher,
    buildPaymentVoucher,
    resolveParticulars,
    resolveInvoiceRef,
} from '../../../utils/paymentVoucherUtils';
import {
    ExpenseItem, Supplier, SettlementRecord, Employee,
    MarketingSubCategory, AdChannel,
    MARKETING_SUBCAT_LABELS, MARKETING_SUBCAT_EMOJIS,
    AD_CHANNEL_LABELS, AD_CHANNEL_EMOJIS,
    BeverageSubCategory, SeafoodSubCategory,
    BEVERAGE_SUBCAT_LABELS, BEVERAGE_SUBCAT_EMOJIS,
    SEAFOOD_SUBCAT_LABELS, SEAFOOD_SUBCAT_EMOJIS
} from '../../../types';
import { DataManager } from '../../../utils/dataManager';

// Firebase APIs
import { collection, getDocs, getDoc, query, where, orderBy, doc, deleteDoc, runTransaction, limit, writeBatch, documentId } from "firebase/firestore";
import { db } from '../../../firebaseConfig';

// AP Constants & Sub-components
import { getCached, TABS, FLAT_CATEGORIES, getQuickDateRange, getParticularsOptions } from './apConstants';
import { BillFormDrawer } from './BillFormDrawer';
import { QuickPayModal } from './QuickPayModal';
import { BatchPayModal } from './BatchPayModal';
import { BatchDeleteModal } from './BatchDeleteModal';
import { ApMigrationTool } from './ApMigrationTool';

interface AccountsPayableModuleProps {
    onClose: () => void;
    onNavigateToSelfVoucher?: (prefillData: { company: string; date: string; totalAmount: number; particulars: string; billRefId: string }) => void;
}

const AP_AI_API_URL = '/api/ap-ai';

import { applyResolvedStylesForPdf } from '../../../utils/pdfStyleResolver';

const toMoneyCents = (value: unknown): number | null => {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
};

const normalizeVendorForMatch = (value: unknown): string =>
    String(value || '')
        .toUpperCase()
        .replace(/\b(SDN\.?\s*BHD\.?|ENTERPRISE|PLT|TRADING|COMPANY|CO\.?)\b/g, '')
        .replace(/[^A-Z0-9]/g, '');

const getBillMatchAmount = (bill: ExpenseItem): number | null =>
    toMoneyCents(bill.totalBillAmount ?? bill.outstandingAmount ?? bill.amount);

const getApiErrorMessage = (payload: any, fallback: string): string => {
    let msg = payload?.error || payload?.message || fallback;
    if (typeof msg === 'object') {
        try {
            msg = JSON.stringify(msg);
        } catch(e) {
            msg = String(msg);
        }
    }
    return msg;
};

const requestApAi = async (path: string, init?: RequestInit) => {
    if (!AP_AI_API_URL) throw new Error('AP AI 服务地址尚未配置（缺少 VITE_AP_AI_API_URL）');

    const response = await fetch(`${AP_AI_API_URL}${path}`, {
        cache: 'no-store',
        ...init,
        headers: {
            Accept: 'application/json',
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init?.headers || {}),
        },
    });

    const rawText = await response.text();
    let payload: any;
    try { payload = rawText ? JSON.parse(rawText) : {}; }
    catch { throw new Error(`AP AI 服务返回了无效内容（HTTP ${response.status}）`); }

    if (!response.ok || !payload?.success) {
        const error = new Error(getApiErrorMessage(payload, `AP AI 请求失败（HTTP ${response.status}）`)) as Error & { status?: number; payload?: any };
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return { response, payload };
};

export const AccountsPayableModule: React.FC<AccountsPayableModuleProps> = ({ onClose, onNavigateToSelfVoucher }) => {
    const [allBills, setAllBills] = useState<ExpenseItem[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'LIST' | 'SUPPLIER_DETAIL'>('LIST');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'UNPAID' | 'PARTIAL' | 'PAID' | 'ALL'>('ALL');
    const [searchId, setSearchId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<{start: string, end: string}>({ start: '', end: '' });
    const [selectedTag, setSelectedTag] = useState<string>('ALL');
    const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
    const [isBatchPayModalOpen, setIsBatchPayModalOpen] = useState(false);
    const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingBill, setEditingBill] = useState<Partial<ExpenseItem>>({});
    const [isSaving, setIsSaving] = useState(false);
    
    const [payModalData, setPayModalData] = useState<ExpenseItem | null>(null);
    const [payAmount, setPayAmount] = useState(0);
    const [payMethod, setPayMethod] = useState<string>('');
    const actualPrintRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [printData, setPrintData] = useState<ExpenseItem[]>([]);
    const [printMode, setPrintMode] = useState<'GENERAL' | 'SUPPLIER_UNPAID'>('GENERAL');
    
    // Payment Voucher State
    const voucherRef = useRef<HTMLDivElement>(null);
    const [printingVoucher, setPrintingVoucher] = useState<PaymentVoucher | null>(null);
    const [showPVHistory, setShowPVHistory] = useState(false);
    const [showBackdate, setShowBackdate] = useState(false);
    const [pvJustCreated, setPvJustCreated] = useState<PaymentVoucher | null>(null);
    const [generatePVForBill, setGeneratePVForBill] = useState<ExpenseItem | null>(null);
    const [pvGenerateDate, setPvGenerateDate] = useState<string>('');
    const [isCardPVLoading, setIsCardPVLoading] = useState<string | null>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);
    const [batchPVProgress, setBatchPVProgress] = useState<{current: number; total: number; phase: string} | null>(null);
    const [batchPVMissingDialog, setBatchPVMissingDialog] = useState<{bills: ExpenseItem[]; existingPVs: PaymentVoucher[]} | null>(null);
    const [batchPVBackdateDate, setBatchPVBackdateDate] = useState<string>('');
    const [pvMergeMode, setPvMergeMode] = useState<'separate' | 'group_vendor' | 'merge'>('separate');
    const [mergePayeeName, setMergePayeeName] = useState('Petty Cash (零用金)');
    const [mergePaymentMethod, setMergePaymentMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
    const [batchVoucherTitle, setBatchVoucherTitle] = useState<string>('PAYMENT VOUCHER'); // 'PAYMENT VOUCHER', 'CASH VOUCHER', 'AUTO'
 
    const [expensesWithPV, setExpensesWithPV] = useState<Set<string>>(new Set());
    const [billTypeFilter, setBillTypeFilter] = useState<'REGULAR' | 'SALARY' | 'PLATFORM' | 'FIXED' | 'ALL'>('REGULAR');
    const [mobileFilterStyle, setMobileFilterStyle] = useState<'PILL' | 'DROPDOWN'>('PILL');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    const [formGeneratePV, setFormGeneratePV] = useState<boolean>(false);
    const [formPVTitle, setFormPVTitle] = useState<string>('AUTO'); // 'AUTO', 'CASH VOUCHER', 'CASH BILL', 'PAYMENT VOUCHER'
    const [pvVoucherTitle, setPvVoucherTitle] = useState<string>('AUTO'); // For single backdate PV dialog
    const [displayLimit, setDisplayLimit] = useState(30);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [debouncedSearchId, setDebouncedSearchId] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [totalLoaded, setTotalLoaded] = useState(0);
    const [isBillingCapped, setIsBillingCapped] = useState(false);
    const [debouncedDateRange, setDebouncedDateRange] = useState<{start: string, end: string}>({ start: '', end: '' });

    const [showMigrationTool, setShowMigrationTool] = useState(false);
    const [migrationData, setMigrationData] = useState<Record<string, {
        subCat?: MarketingSubCategory; channel?: AdChannel; tag?: string;
    }>>({});

    // AI Scan State & Logic
    const [isAiScanning, setIsAiScanning] = useState(false);
    const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
    const [aiScannedData, setAiScannedData] = useState<any>(null); // 暂存 AI 从暂存区盲抽出来的票据数据
    const [reconSearch, setReconSearch] = useState('');
    const [reconShowAll, setReconShowAll] = useState(false);
    const [isDeletingFile, setIsDeletingFile] = useState(false);
    const [isHoldingFile, setIsHoldingFile] = useState(false);

    const monthsList = useMemo(() => {
        const list = [];
        for (const year of [2026, 2025]) {
            for (let month = 12; month >= 1; month--) {
                const mStr = String(month).padStart(2, '0');
                const label = `${year}年 ${month}月`;
                const value = `${year}-${mStr}`;
                list.push({ value, label, year, month });
            }
        }
        return list;
    }, []);

    const currentMonthVal = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return '';
        const startParts = dateRange.start.split('-');
        const endParts = dateRange.end.split('-');
        if (startParts.length === 3 && endParts.length === 3) {
            const sYear = startParts[0];
            const sMonth = startParts[1];
            const sDay = startParts[2];
            const eYear = endParts[0];
            const eMonth = endParts[1];
            const eDay = endParts[2];
            if (sYear === eYear && sMonth === eMonth && sDay === '01') {
                const expectedLastDay = new Date(Number(sYear), Number(sMonth), 0).getDate();
                if (Number(eDay) === expectedLastDay) {
                    return `${sYear}-${sMonth}`;
                }
            }
        }
        return '';
    }, [dateRange]);

    const handleAiScanPending = async () => {
        if (isAiScanning) return;
        if (!AP_AI_API_URL) {
            alert('AP AI 服务地址尚未配置，请设置 VITE_AP_AI_API_URL。');
            return;
        }

        setIsAiScanning(true);
        try {
            console.info('[AP AI] Request URL:', `${AP_AI_API_URL}/api/scan-pending`);
            const { payload } = await requestApAi('/api/scan-pending');
            if (!Array.isArray(payload.data) || payload.data.length === 0) {
                alert('暂存区目前没有可扫描的新账单。');
                return;
            }
            setAiScannedData(payload.data[0]);
            setReconSearch('');
            setReconShowAll(false);
            setIsMatchModalOpen(true);
        } catch (error: any) {
            console.error('[AP AI] Scan failed:', error);
            
            let errMsg = error?.message || '未知错误';
            if (errMsg.includes('high demand') || errMsg.includes('503')) {
                errMsg = '云端 AI 识别模型当前处于访问高峰（High Demand），请稍等片刻后再试。';
            } else if (errMsg.includes('{')) {
                try {
                    const parsed = JSON.parse(errMsg);
                    if (parsed.error?.message) {
                        errMsg = parsed.error.message;
                        if (errMsg.includes('high demand') || errMsg.includes('503')) {
                            errMsg = '云端 AI 识别模型当前处于访问高峰（High Demand），请稍等片刻后再试。';
                        }
                    }
                } catch(e) {}
            }
            alert(`无法连接到云端 AP AI 服务：${errMsg}`);
        } finally {
            setIsAiScanning(false);
        }
    };

    const handleDeletePendingFile = async (fileId: string) => {
        if (!fileId || isDeletingFile || isHoldingFile) return;
        if (!await (window as any).systemDialog.confirm('确定要废弃此文件并移入 _REJECTED_TRASH_BIN 吗？\n此操作不会建立任何财务账目。', '应付账款')) return;
        setIsDeletingFile(true);
        try {
            const { payload } = await requestApAi('/api/delete-pending', {
                method: 'POST', body: JSON.stringify({ fileId })
            });
            alert(payload.message || '账单已移入废单隔离区。');
            setIsMatchModalOpen(false);
            setAiScannedData(null);
            await loadData();
        } catch (error: any) {
            console.error('[AP AI] Delete pending failed:', error);
            alert(`废弃账单失败：${error?.message || '未知错误'}`);
        } finally { setIsDeletingFile(false); }
    };

    const handleHoldPendingFile = async (
        fileId: string,
        reason: 'MANUAL_REVIEW_REQUIRED' | 'NO_AP_MATCH' | 'UNCLEAR_AMOUNT' | 'UNCLEAR_DATE' | 'UNKNOWN_VENDOR' | 'POSSIBLE_DUPLICATE' | 'OTHER' = 'MANUAL_REVIEW_REQUIRED'
    ) => {
        if (!fileId || isHoldingFile || isDeletingFile) return;
        if (!await (window as any).systemDialog.confirm('要把这张账单移入 _HOLDING_AREA，稍后再人工处理吗？', '应付账款')) return;
        setIsHoldingFile(true);
        try {
            const { payload } = await requestApAi('/api/hold-pending', {
                method: 'POST', body: JSON.stringify({ fileId, reason })
            });
            alert(payload.message || '账单已移入待确认保留区。');
            setIsMatchModalOpen(false);
            setAiScannedData(null);
        } catch (error: any) {
            console.error('[AP AI] Hold pending failed:', error);
            alert(`移入保留区失败：${error?.message || '未知错误'}`);
        } finally { setIsHoldingFile(false); }
    };

    const unCategorizedMarketingBills = useMemo(() =>
        allBills.filter(b => b.category === 'MARKETING' && !b.marketingSubCategory),
        [allBills]
    );

    const handleMigrationSave = async () => {
        const entries = Object.entries(migrationData).filter(([, d]) => d && d.subCat);
        if (entries.length === 0) return alert('请至少补一条类目');

        const missingChannel = entries.filter(([, d]) => d && d.subCat === 'AD_OUTPUT' && !d.channel);
        if (missingChannel.length > 0) {
            return alert(`⚠️ 有 ${missingChannel.length} 条「广告输出」还没选渠道，请补齐或改成其他类型`);
        }

        setIsSaving(true);
        try {
            for (const [billId, data] of entries) {
                const bill = allBills.find(b => b.id === billId);
                if (!bill || !data.subCat) continue;
                
                const merged = {
                    ...bill,
                    marketingSubCategory: data.subCat,
                    adChannel: data.subCat === 'AD_OUTPUT' ? data.channel : undefined,
                    campaignTag: data.tag || bill.campaignTag || undefined,
                } as any;
                const clean = JSON.parse(JSON.stringify(merged)) as ExpenseItem;
                await DataManager.saveStandaloneExpense(clean);
                if (clean.settlementId) await DataManager.updateExpenseInSettlement(clean.settlementId, clean);
            }
            alert(`✅ 已成功补类目 ${entries.length} 条`);
            setMigrationData({});
            setShowMigrationTool(false);
            await loadData();
        } catch (e) {
            console.error('Migration save failed', e);
            alert('补类目出错，请查看控制台');
        } finally { setIsSaving(false); }
    };

    useEffect(() => { 
        loadData(); 
        
        const targetCompany = localStorage.getItem('klk_ap_highlight_company');
        const targetDate = localStorage.getItem('klk_ap_highlight_date');
        
        if (targetCompany && targetDate) {
            setSearchQuery(targetCompany);
            setDebouncedSearchQuery(targetCompany);
            setDateRange({ start: targetDate, end: targetDate });
            setDebouncedDateRange({ start: targetDate, end: targetDate });
            setActiveTab('ALL'); // Ensure searching across all states
            setViewMode('LIST'); // Change view mode to list so it displays search results
            setSelectedSupplierId(null);
            localStorage.removeItem('klk_ap_highlight_company');
            localStorage.removeItem('klk_ap_highlight_date');
            localStorage.removeItem('klk_ap_highlight_bill'); // Clear fallback as well
        } else {
            const targetId = localStorage.getItem('klk_ap_highlight_bill');
            if (targetId) {
                setSearchQuery(targetId);
                setDebouncedSearchQuery(targetId);
                setActiveTab('ALL'); // Ensure it is searched across all tabs
                setViewMode('LIST'); // Reset view mode to list so it displays search results
                setSelectedSupplierId(null);
                localStorage.removeItem('klk_ap_highlight_bill');
            }
        }
    }, []);

    useEffect(() => {
        // Reset scroll position to top whenever search query, mode, or tabs change
        if (mainScrollRef.current) {
            mainScrollRef.current.scrollTop = 0;
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [debouncedSearchId, debouncedSearchQuery, viewMode, activeTab, selectedTag, selectedSupplierId]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchId(searchId), 250);
        return () => clearTimeout(timer);
    }, [searchId]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 250);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // date range debounce
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedDateRange(dateRange), 400);
        return () => clearTimeout(timer);
    }, [dateRange.start, dateRange.end]);

    useEffect(() => {
        if (!debouncedDateRange.start || !debouncedDateRange.end) return;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 3);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        if (!isBillingCapped && debouncedDateRange.start >= cutoffStr) return;
            
        const fetchDateRange = async () => {
            try {
                const qRange = query(
                    collection(db, 'standalone_expenses'),
                    where('time', '>=', debouncedDateRange.start),
                    where('time', '<=', debouncedDateRange.end + 'T23:59:59'),
                    orderBy('time', 'desc'),
                    limit(500)
                );

                const qStlRange = query(
                    collection(db, 'settlements'),
                    where('date', '>=', debouncedDateRange.start),
                    where('date', '<=', debouncedDateRange.end),
                    orderBy('date', 'desc'),
                    limit(300)
                );

                const qPvRange = query(
                    collection(db, 'payment_vouchers'),
                    where('date', '>=', debouncedDateRange.start),
                    where('date', '<=', debouncedDateRange.end),
                    limit(500)
                );

                const [snap, stlSnap, pvSnap] = await Promise.all([
                    getDocs(qRange),
                    getDocs(qStlRange),
                    getDocs(qPvRange)
                ]);

                if (snap.size >= 500 || stlSnap.size >= 300) setIsBillingCapped(true);

                const rangeItems: ExpenseItem[] = [];

                snap.forEach(doc => rangeItems.push(doc.data() as ExpenseItem));

                stlSnap.forEach(d => {
                    const s = d.data() as SettlementRecord;
                    if (s.expenses) {
                        s.expenses.forEach(e => rangeItems.push({ ...e, settlementId: s.id }));
                    }
                });

                setAllBills(prev => {
                    const merged = new Map(prev.map(b => [b.id, b]));
                    rangeItems.forEach(b => merged.set(b.id, b));
                    const arr = Array.from(merged.values());
                    arr.sort((a, b) => new Date(b.time || '').getTime() - new Date(a.time || '').getTime());
                    return arr;
                });

                // Update expensesWithPV for the loaded date range
                const rangePvExpenseIds = new Set<string>();
                pvSnap.forEach(d => {
                    const pv = d.data() as PaymentVoucher;
                    if (pv.status !== 'VOID' && pv.relatedExpenseIds) {
                        pv.relatedExpenseIds.forEach(id => rangePvExpenseIds.add(id));
                    }
                });

                if (rangePvExpenseIds.size > 0) {
                    setExpensesWithPV(prev => {
                        const next = new Set(prev);
                        rangePvExpenseIds.forEach(id => next.add(id));
                        return next;
                    });
                }
            } catch (err) { console.error('Date range fetch error:', err); }
        };
        fetchDateRange();
    }, [debouncedDateRange.start, debouncedDateRange.end, isBillingCapped]);

    const loadData = async () => {
        setLoading(true);
        setIsBillingCapped(false);
        try {
            const [sups, emps, pvs] = await Promise.all([
                getCached('klk_ap_suppliers_v1', () => DataManager.getSuppliers()),
                getCached('klk_ap_employees_v1', () => DataManager.getEmployees()),
                DataManager.getPaymentVouchers({ max: 300 })
            ]);
            setSuppliers(sups);
            setEmployees(emps);
            
            const pvExpenseIds = new Set<string>();
            pvs.forEach(pv => {
                if (pv.status !== 'VOID' && pv.relatedExpenseIds) {
                    pv.relatedExpenseIds.forEach(id => pvExpenseIds.add(id));
                }
            });
            setExpensesWithPV(pvExpenseIds);
            
            let expenses: ExpenseItem[] = [];
            const cutoffDate = new Date();
            cutoffDate.setMonth(cutoffDate.getMonth() - 3);
            const cutoffStr = cutoffDate.toISOString().split('T')[0];

            const qSettlements = query(
                collection(db, 'settlements'),
                where('date', '>=', cutoffStr),
                orderBy('date', 'desc'),
                limit(30)
            );
            
            const recentDate = new Date();
            recentDate.setMonth(recentDate.getMonth() - 6); 
            const recentStr = recentDate.toISOString().split('T')[0];
            const qRecent = query(
                collection(db, 'standalone_expenses'), 
                where('time', '>=', recentStr),
                orderBy('time', 'desc'),
                limit(150)
            );

            const qUnpaid = query(
                collection(db, 'standalone_expenses'), 
                where('paymentStatus', 'in', ['UNPAID', 'PARTIAL']),
                orderBy('time', 'desc'),
                limit(100)
            );

            const [stlSnap, unpaidSnap, recentSnap] = await Promise.all([
                getDocs(qSettlements),
                getDocs(qUnpaid), 
                getDocs(qRecent)
            ]);

            if (recentSnap.size >= 50 || stlSnap.size >= 30 || unpaidSnap.size >= 100) {
                setIsBillingCapped(true);
            }

            const activeSettlements = new Map<string, SettlementRecord>();
            stlSnap.docs.forEach(d => { 
                const s = d.data() as SettlementRecord;
                activeSettlements.set(s.id, s);
                if (s.expenses) expenses.push(...s.expenses.map(e => ({...e, settlementId: s.id}))); 
            });

            const missingSettlementIds = new Set<string>();
            unpaidSnap.forEach(d => {
                const data = d.data() as ExpenseItem;
                if (data.settlementId && !activeSettlements.has(data.settlementId)) {
                    missingSettlementIds.add(data.settlementId);
                }
            });
            if (missingSettlementIds.size > 0) {
                const ids = Array.from(missingSettlementIds);
                const chunks: string[][] = [];
                for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
                await Promise.all(chunks.map(async (chunk) => {
                    try {
                        const qFill = query(
                            collection(db, 'settlements'),
                            where(documentId(), 'in', chunk)
                        );
                        const snap = await getDocs(qFill);
                        snap.forEach(d => {
                            const s = d.data() as SettlementRecord;
                            activeSettlements.set(s.id, s);
                            if (s.expenses) expenses.push(...s.expenses.map(e => ({...e, settlementId: s.id})));
                        });
                    } catch (err) {
                        console.warn('Backfill settlements failed for chunk:', err);
                    }
                }));
            }

            const filterAndPushStandalone = (doc: any) => {
                const data = doc.data() as ExpenseItem;
                if (data.settlementId) {
                    const parent = activeSettlements.get(data.settlementId);
                    if (parent) {
                        const exists = parent.expenses?.some(e => e.id === data.id);
                        if (!exists) return; 
                    }
                }
                expenses.push(data);
            };

            unpaidSnap.forEach(filterAndPushStandalone);
            recentSnap.forEach(filterAndPushStandalone);
            
            // 🎯 Check if there is a cross-navigation focus bill target and fetch directly if missing from last 3-month default query
            const targetId = localStorage.getItem('klk_ap_highlight_bill');
            if (targetId) {
                const targetKey = targetId.toLowerCase().replace('exp_', '');
                const alreadyLoaded = expenses.some(e => e.id.toLowerCase().replace('exp_', '') === targetKey);
                if (!alreadyLoaded) {
                    try {
                        const directDocSnap = await getDoc(doc(db, 'standalone_expenses', targetId));
                        if (directDocSnap.exists()) {
                            expenses.push(directDocSnap.data() as ExpenseItem);
                        } else {
                            const alternativeId = targetId.startsWith('exp_') ? targetId.replace('exp_', '') : `exp_${targetId}`;
                            const directDocSnapAlt = await getDoc(doc(db, 'standalone_expenses', alternativeId));
                            if (directDocSnapAlt.exists()) {
                                expenses.push(directDocSnapAlt.data() as ExpenseItem);
                            }
                        }
                    } catch (directErr) {
                        console.warn('Failed directly fetching target standalone bill:', directErr);
                    }
                }
            }
            
            const unique = Array.from(new Map(expenses.map(item => [item.id, item])).values());
            unique.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
            
            setAllBills(unique);
            setTotalLoaded(unique.length);
            setDisplayLimit(30); 
            
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const supplierByName = useMemo(() => {
        const map = new Map<string, Supplier>();
        suppliers.forEach(s => map.set(s.name, s));
        return map;
    }, [suppliers]);

    const supplierById = useMemo(() => {
        const map = new Map<string, Supplier>();
        suppliers.forEach(s => map.set(s.id, s));
        return map;
    }, [suppliers]);

    const isPlatformAdjustments = (param: string | ExpenseItem) => {
        if (typeof param === 'string') {
            const name = param.trim().toLowerCase();
            // 🛑 排除 Shopee Mobile 采购类型（如 ID 8047 等买货账单，算作常规账单，而非平台手续费扣款）
            if (name.includes('shopee mobile') || name.includes('8047')) {
                return false;
            }
            return name.includes('shopeefood') || 
                   name.includes('shopee') || 
                   name.includes('foodpanda') || 
                   name.includes('food panda') || 
                   name.includes('grabfood') || 
                   name.includes('grab food') || 
                   name.includes('duitnow') || 
                   name.includes('duit now') || 
                   name.includes('debit') || 
                   name.includes('credit card') || 
                   name.includes('bank fee') || 
                   name.includes('bank charge') || 
                   name.includes('transaction fee');
        }
        
        const b = param;
        const name = (b.company || '').trim().toLowerCase();
        const category = b.category || '';
        const id = b.id || '';
        
        // 🛑 排除 Shopee Mobile 采购类型（支持名称匹配以及关联的 Supplier ID 等信息）
        const supplier = supplierByName.get(b.company);
        const isShopeeMobile = name.includes('shopee mobile') || 
                               name.includes('8047') || 
                               (supplier && (supplier.id === '8047' || supplier.name.toLowerCase().includes('shopee mobile')));
        if (isShopeeMobile) {
            return false;
        }
        
        return name.includes('shopeefood') || 
               name.includes('shopee') || 
               name.includes('foodpanda') || 
               name.includes('food panda') || 
               name.includes('grabfood') || 
               name.includes('grab food') || 
               name.includes('duitnow') || 
               name.includes('duit now') || 
               name.includes('debit') || 
               name.includes('credit card') || 
               name.includes('bank fee') || 
               name.includes('bank charge') || 
               name.includes('transaction fee') ||
               id.startsWith('recon_fee_') ||
               ['BANK_FEE', 'PLATFORM_FEE_SHOPEE', 'PLATFORM_FEE_OTHER'].includes(category);
    };

    const showSalaries = billTypeFilter === 'SALARY' || billTypeFilter === 'ALL';
    const showPlatformAdjustments = billTypeFilter === 'PLATFORM';

    const billTypeCounts = useMemo(() => {
        let regular = 0;
        let salary = 0;
        let platform = 0;
        let fixed = 0;
        
        let baseList = allBills;
        if (activeTab !== 'ALL') baseList = baseList.filter(b => b.paymentStatus === activeTab);
        if (dateRange.start) baseList = baseList.filter(b => b.time >= dateRange.start);
        if (dateRange.end) baseList = baseList.filter(b => b.time <= dateRange.end + 'T23:59:59');
        if (selectedTag !== 'ALL') baseList = baseList.filter(b => (b.tags || []).includes(selectedTag));
        if (viewMode === 'SUPPLIER_DETAIL' && selectedSupplierId) {
            const sup = supplierById.get(selectedSupplierId);
            if (sup) baseList = baseList.filter(b => b.company === sup.name);
        }
        if (debouncedSearchId) {
            const idToSearch = debouncedSearchId.trim();
            baseList = baseList.filter(b => {
                const sup = supplierByName.get(b.company);
                return sup?.id === idToSearch;
            });
        }
        if (debouncedSearchQuery) {
            const lower = debouncedSearchQuery.toLowerCase().trim();
            baseList = baseList.filter(b => {
                const companyMatches = b.company.toLowerCase().includes(lower);
                const noteMatches = (b.note || '').toLowerCase().includes(lower);
                const amountVal = b.totalBillAmount || b.amount || 0;
                const amountMatches = String(amountVal).includes(lower) || amountVal.toFixed(2).includes(lower);
                const billIdLower = b.id.toLowerCase();
                const idMatches = billIdLower.includes(lower);
                return companyMatches || noteMatches || amountMatches || idMatches;
            });
        }

        baseList.forEach(b => {
            const isSalary = b.category === 'SALARY' || b.category === 'STAFF_ADVANCE' || b.expenseType === 'SALARY' || b.id.startsWith('payroll_');
            const isFixed = (['RENT', 'UTILITIES', 'UTILITIES_ELECTRIC', 'UTILITIES_WATER', 'INTERNET', 'WASTE'].includes(b.category) || b.expenseType === 'RECURRING' || b.id.startsWith('bill_sync_') || (b.tags || []).includes('RECURRING_BILL')) && b.category !== 'LICENSE' && b.category !== 'SUBSCRIPTION';
            if (isSalary) {
                salary++;
            } else if (isPlatformAdjustments(b)) {
                platform++;
            } else if (isFixed) {
                fixed++;
            } else {
                regular++;
            }
        });

        return { regular, salary, platform, fixed, total: baseList.length };
    }, [allBills, activeTab, debouncedSearchId, debouncedSearchQuery, dateRange, selectedTag, viewMode, selectedSupplierId, supplierByName, supplierById]);

    const hiddenPlatformAdjustmentsCount = billTypeCounts.platform;

    const filteredBills = useMemo(() => {
        let list = allBills;

        // Apply our custom Segmented / Type filter
        if (billTypeFilter === 'REGULAR') {
            list = list.filter(b => {
                const isSalary = b.category === 'SALARY' || b.category === 'STAFF_ADVANCE' || b.expenseType === 'SALARY' || b.id.startsWith('payroll_');
                const isFixed = (['RENT', 'UTILITIES', 'UTILITIES_ELECTRIC', 'UTILITIES_WATER', 'INTERNET', 'WASTE'].includes(b.category) || b.expenseType === 'RECURRING' || b.id.startsWith('bill_sync_') || (b.tags || []).includes('RECURRING_BILL')) && b.category !== 'LICENSE' && b.category !== 'SUBSCRIPTION';
                return !isSalary && !isPlatformAdjustments(b) && !isFixed;
            });
        } else if (billTypeFilter === 'SALARY') {
            list = list.filter(b => {
                const isSalary = b.category === 'SALARY' || b.category === 'STAFF_ADVANCE' || b.expenseType === 'SALARY' || b.id.startsWith('payroll_');
                return isSalary;
            });
        } else if (billTypeFilter === 'PLATFORM') {
            list = list.filter(b => isPlatformAdjustments(b));
        } else if (billTypeFilter === 'FIXED') {
            list = list.filter(b => {
                const isFixed = (['RENT', 'UTILITIES', 'UTILITIES_ELECTRIC', 'UTILITIES_WATER', 'INTERNET', 'WASTE'].includes(b.category) || b.expenseType === 'RECURRING' || b.id.startsWith('bill_sync_') || (b.tags || []).includes('RECURRING_BILL')) && b.category !== 'LICENSE' && b.category !== 'SUBSCRIPTION';
                return isFixed;
            });
        } else {
            // 'ALL' -> Show everything
        }

        if (activeTab !== 'ALL') list = list.filter(b => b.paymentStatus === activeTab);
        
        if (debouncedSearchId) {
            const idToSearch = debouncedSearchId.trim();
            list = list.filter(b => {
                const sup = supplierByName.get(b.company);
                return sup?.id === idToSearch;
            });
        }

        if (debouncedSearchQuery) {
            const lower = debouncedSearchQuery.toLowerCase().trim();
            list = list.filter(b => {
                const companyMatches = b.company.toLowerCase().includes(lower);
                const noteMatches = (b.note || '').toLowerCase().includes(lower);
                const amountVal = b.totalBillAmount || b.amount || 0;
                const amountMatches = String(amountVal).includes(lower) || amountVal.toFixed(2).includes(lower);
                const billIdLower = b.id.toLowerCase();
                const idMatches = billIdLower.includes(lower);
                return companyMatches || noteMatches || amountMatches || idMatches;
            });
        }

        if (dateRange.start) list = list.filter(b => b.time >= dateRange.start);
        if (dateRange.end) list = list.filter(b => b.time <= dateRange.end + 'T23:59:59');
        if (selectedTag !== 'ALL') list = list.filter(b => (b.tags || []).includes(selectedTag));
        if (viewMode === 'SUPPLIER_DETAIL' && selectedSupplierId) {
            const sup = supplierById.get(selectedSupplierId);
            if (sup) list = list.filter(b => b.company === sup.name);
        }
        const hasActiveFilter = dateRange.start || dateRange.end || debouncedSearchId || debouncedSearchQuery || selectedTag !== 'ALL' || activeTab !== 'ALL' || viewMode === 'SUPPLIER_DETAIL';
        if (!hasActiveFilter) return list.slice(0, displayLimit);
        return list;
    }, [allBills, activeTab, debouncedSearchId, debouncedSearchQuery, dateRange, selectedTag, viewMode, selectedSupplierId, supplierByName, supplierById, displayLimit, billTypeFilter]);

    const stats = useMemo(() => {
        const total = filteredBills.reduce((acc, b) => acc + (b.totalBillAmount || b.amount || 0), 0);
        const outstanding = filteredBills.reduce((acc, b) => acc + (b.outstandingAmount || 0), 0);
        const cn = filteredBills.reduce((acc, b) => acc + (b.creditNote || 0), 0);
        return { total, outstanding, cn, count: filteredBills.length };
    }, [filteredBills]);

    const availableTags = useMemo(() => {
        const tagSet = new Set<string>();
        allBills.forEach(b => (b.tags || []).forEach(t => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [allBills]);

    const handleOpenForm = (bill?: ExpenseItem, defaultCompany?: string) => {
        setFormGeneratePV(false);
        if (bill) {
            setEditingBill({
                ...bill,
                amount: bill.amount !== undefined ? Math.round(bill.amount * 100) / 100 : 0,
                totalBillAmount: bill.totalBillAmount !== undefined ? Math.round(bill.totalBillAmount * 100) / 100 : 0,
                creditNote: bill.creditNote !== undefined ? Math.round(bill.creditNote * 100) / 100 : 0,
                outstandingAmount: bill.outstandingAmount !== undefined ? Math.round(bill.outstandingAmount * 100) / 100 : 0,
                tags: bill.tags || [],
                particulars: bill.particulars || (bill.category ? getParticularsOptions(bill)[0]?.value : ''),
            });
        } else {
            const defaultTime = new Date().toISOString();
            const defaultDueDate = (() => {
                const d = new Date();
                d.setDate(d.getDate() + 15);
                return d.toISOString().split('T')[0];
            })();
            setEditingBill({ 
                id: '', 
                company: defaultCompany || '', 
                category: 'SUPPLIES', 
                amount: 0, 
                totalBillAmount: 0, 
                outstandingAmount: 0, 
                creditNote: 0, 
                paymentStatus: 'UNPAID', 
                time: defaultTime, 
                dueDate: defaultDueDate, 
                tags: [], 
                linkUrl: '', 
                note: '', 
                paymentMethod: 'BANK_TRANSFER', 
                paidBy: 'COMPANY', 
                isAdvancePayment: false 
            });
        }
        setIsFormOpen(true);
    };

    // 💡 升级核心：处理保存逻辑，特别增加了 options?.forceCommit 重名覆盖控制
    const handleSave = async (options?: { forceCommit?: boolean }) => {
        if (!editingBill.company || editingBill.totalBillAmount === undefined) return alert("Please fill required fields (Payee & Amount)");
        if (editingBill.category === 'MARKETING') {
            if (!editingBill.marketingSubCategory) return alert("⚠️ 营销类账单必须选择「营销类型」！");
            if (editingBill.marketingSubCategory === 'AD_OUTPUT' && !editingBill.adChannel) return alert("⚠️ 广告输出必须选择「广告渠道」！");
        }
        if (editingBill.category === 'BEVERAGE') {
            if (!editingBill.beverageSubCategory) return alert("⚠️ 水吧类账单必须选择「水吧细分」！");
        }
        if (editingBill.category === 'INGREDIENT_SEAFOOD') {
            if (!editingBill.seafoodSubCategory) return alert("⚠️ 海鲜类账单必须选择「海鲜细分」！");
        }
        setIsSaving(true);
        try {
            let finalLinkUrl = editingBill.linkUrl || '';
            
            if ((editingBill as any).pendingFileId) {
                try {
                    try {
                        const { payload: commitData } = await requestApAi('/api/commit-bill', {
                            method: 'POST',
                            body: JSON.stringify({
                                fileId: (editingBill as any).pendingFileId,
                                originalName: (editingBill as any).pendingOriginalName,
                                mimeType: (editingBill as any).pendingMimeType,
                                verifiedVendor: editingBill.company,
                                verifiedDate: editingBill.time,
                                verifiedAmount: editingBill.totalBillAmount,
                                verifiedInvoiceNo: editingBill.invoiceRef || '',
                                forceCommit: options?.forceCommit || false,
                            }),
                        });
                        finalLinkUrl = commitData.finalDriveLink || finalLinkUrl;
                    } catch (commitError: any) {
                        if (commitError?.status === 409 && commitError?.payload?.code === 'DUPLICATE_ARCHIVE_DETECTED') {
                            setIsSaving(false);
                            const duplicateMessage = getApiErrorMessage(commitError.payload, '该账单疑似已经归档。');
                            if (await (window as any).systemDialog.confirm(`⚠️ 历史账单重复警告：\n${duplicateMessage}\n\n点击【确定执行】仍然保存此重复账单；点击【取消】中断入账。`, '应付账款')) {
                                await handleSave({ forceCommit: true });
                            }
                            return;
                        }
                        throw commitError;
                    }
                } catch (commitErr: any) {
                    alert("网盘归档失败: " + commitErr.message);
                    setIsSaving(false);
                    return; 
                }
            }

            const normalizedName = editingBill.company.trim();
            const existingSupplier = suppliers.find(s => s.name.toLowerCase() === normalizedName.toLowerCase());
            if (!existingSupplier) {
                const numericIds = suppliers.map(s => parseInt(s.id)).filter(n => !isNaN(n));
                const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 8000;
                const nextId = (maxId < 8000 ? 8001 : maxId + 1).toString();
                const newSupplier: Supplier = { id: nextId, name: normalizedName, category: 'GENERAL', tags: editingBill.tags || [], contact: '', status: 'ACTIVE', paymentTerm: 'COD', note: 'Auto-created from Accounts Payable' };
                await DataManager.saveSupplier(newSupplier);
                setSuppliers(prev => [...prev, newSupplier]);
                try { sessionStorage.removeItem('klk_ap_suppliers_v1'); } catch {}
            }

            const paymentStatus = editingBill.paymentStatus || 'UNPAID';
            const cn = Math.round((Number(editingBill.creditNote) || 0) * 100) / 100;
            const fullTotal = Math.round((Number(editingBill.totalBillAmount) || 0) * 100) / 100;
            
            let paidAmt = 0;
            if (paymentStatus === 'PAID') {
                paidAmt = Math.round((fullTotal - cn) * 100) / 100;
            } else if (paymentStatus === 'PARTIAL') {
                paidAmt = Math.round((Number(editingBill.amount) || 0) * 100) / 100;
            } else { // 'UNPAID'
                paidAmt = 0;
            }

            const isPaid = paymentStatus === 'PAID';
            const payDate = isPaid ? (editingBill.time || new Date().toISOString()) : undefined;

            let finalTags = editingBill.tags || [];

            const rawBill: ExpenseItem = {
                ...editingBill as ExpenseItem,
                id: editingBill.id || `exp_${Date.now()}`,
                expenseType: 'GENERAL',
                category: editingBill.category || 'SUPPLIES',
                amount: paidAmt,
                totalBillAmount: fullTotal,
                creditNote: cn,
                outstandingAmount: isPaid ? 0 : Math.max(0, Math.round((fullTotal - paidAmt - cn) * 100) / 100),
                time: editingBill.time || new Date().toISOString(),
                company: normalizedName,
                linkUrl: finalLinkUrl,
                paymentMethod: editingBill.paymentMethod || 'BANK_TRANSFER',
                paidBy: editingBill.paidBy || 'COMPANY',
                isAdvancePayment: editingBill.isAdvancePayment || false,
                tags: finalTags,
                paymentDate: payDate
            };
            
            delete (rawBill as any).pendingFileId;
            delete (rawBill as any).pendingOriginalName;
            delete (rawBill as any).pendingMimeType;

            const finalBill = JSON.parse(JSON.stringify(rawBill));
            if (finalBill.outstandingAmount! <= 0.1) finalBill.paymentStatus = 'PAID';
            else if (finalBill.outstandingAmount! < Math.round((fullTotal - cn) * 100) / 100) finalBill.paymentStatus = 'PARTIAL';
            else finalBill.paymentStatus = 'UNPAID';

            await DataManager.saveStandaloneExpense(finalBill); 
            if (finalBill.settlementId) {
                await DataManager.updateExpenseInSettlement(finalBill.settlementId, finalBill); 
            }

            if (!editingBill.id && finalBill.paymentStatus === 'PAID' && formGeneratePV) {
                try {
                    const pvNumber = await DataManager.generatePVNumber(finalBill.paymentDate || finalBill.time);
                    const pv = buildPaymentVoucher({
                        pvNumber,
                        payeeName: finalBill.company,
                        payeeId: suppliers.find(s => s.name === finalBill.company)?.id,
                        paymentMethod: (finalBill.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER'),
                        relatedExpenseIds: [finalBill.id],
                        settlementId: finalBill.settlementId,
                        particulars: [{
                            description: resolveParticulars(finalBill),
                            category: finalBill.category,
                            invoiceRef: resolveInvoiceRef(finalBill),
                            amount: finalBill.amount,
                        }],
                        voucherTitle: (formPVTitle && formPVTitle !== 'AUTO') 
                            ? formPVTitle 
                            : (finalBill.paymentMethod === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER'),
                    });
                    await DataManager.savePaymentVoucher(pv);
                    setPvJustCreated(pv);
                    setExpensesWithPV(prev => {
                        const next = new Set(prev);
                        next.add(finalBill.id);
                        return next;
                    });
                } catch (pvErr) {
                    console.error("PV generation failed (bill still saved)", pvErr);
                    alert("⚠️ 账单已保存，但凭单生成失败。请到「PV 历史」检查。");
                }
            }

            await loadData();
            setIsFormOpen(false);
        } catch (e) { console.error(e); alert("Error saving: " + e); } finally { setIsSaving(false); }
    };

    const handleDeleteBill = async (billId: string) => {
        setIsSaving(true);
        try {
            await deleteDoc(doc(db, 'standalone_expenses', billId));

            const bill = allBills.find(b => b.id === billId);
            if (bill && bill.settlementId) {
                const ref = doc(db, 'settlements', bill.settlementId);
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(ref);
                    if (!snap.exists()) return;
                    const data = snap.data() as SettlementRecord;
                    const newExpenses = (data.expenses || []).filter(e => e.id !== billId);
                    transaction.update(ref, { expenses: newExpenses });
                });
            }

            await loadData();
            setIsFormOpen(false);
        } catch (e) { 
            console.error("Delete failed", e); 
            alert("Delete failed, check console."); 
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleQuickPay = async (options?: { generatePV?: boolean; paymentDate?: string }) => {
        if (!payModalData) return;
        if (!payMethod) return alert("Select Payment Method");

        const bill = payModalData;
        const currentOutstanding = Math.round((bill.outstandingAmount !== undefined ? bill.outstandingAmount : (bill.totalBillAmount || 0)) * 100) / 100;
        
        if (payAmount > currentOutstanding) return alert(`Amount exceeds outstanding balance (Max: ${currentOutstanding})`);

        const newOutstanding = Math.round((currentOutstanding - payAmount) * 100) / 100;
        const newStatus = newOutstanding <= 0.1 ? 'PAID' : 'PARTIAL';
        const paymentDateIso = options?.paymentDate ? `${options.paymentDate}T12:00:00.000Z` : new Date().toISOString();
        const dateOnlyStr = paymentDateIso.split('T')[0];

        setIsSaving(true);
        try {
            if (bill.paymentStatus === 'UNPAID' || !bill.paymentStatus) {
                const updatedBill = {
                    ...bill,
                    amount: payAmount,
                    outstandingAmount: newOutstanding,
                    paymentStatus: newStatus,
                    paymentMethod: payMethod,
                    paymentDate: paymentDateIso,
                    note: (bill.note || '') + `\n[${dateOnlyStr}] Paid RM${payAmount} via ${payMethod}`
                };
                await DataManager.saveStandaloneExpense(updatedBill);
                if (updatedBill.settlementId) await DataManager.updateExpenseInSettlement(updatedBill.settlementId, updatedBill);
            } else {
                const paymentRecord: ExpenseItem = {
                    id: `pay_${bill.id}_${Date.now()}`,
                    category: bill.category,
                    expenseType: 'GENERAL',
                    company: bill.company,
                    amount: payAmount,
                    totalBillAmount: 0, 
                    outstandingAmount: 0,
                    paymentStatus: 'PAID',
                    paymentMethod: payMethod,
                    time: paymentDateIso,
                    note: `[Balance Pay] Ref: ${bill.company} (Inv #${bill.id.slice(-4)})`,
                    paidBy: 'COMPANY'
                };
                await DataManager.saveStandaloneExpense(paymentRecord);

                const updatedTracker = {
                    ...bill,
                    outstandingAmount: newOutstanding,
                    paymentStatus: newStatus,
                    note: (bill.note || '') + `\n[${dateOnlyStr}] Balance Paid RM${payAmount} via ${payMethod}`
                };
                await DataManager.saveStandaloneExpense(updatedTracker);
                if (updatedTracker.settlementId) await DataManager.updateExpenseInSettlement(updatedTracker.settlementId, updatedTracker);
            }

            if (options?.generatePV) {
                try {
                    const pvNumber = await DataManager.generatePVNumber(paymentDateIso);
                    const pv = buildPaymentVoucher({
                        pvNumber,
                        date: paymentDateIso,
                        payeeName: bill.company,
                        payeeId: suppliers.find(s => s.name === bill.company)?.id,
                        paymentMethod: (payMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER'),
                        relatedExpenseIds: [bill.id],
                        settlementId: bill.settlementId,
                        particulars: [{
                            description: `Payment on invoice - ${bill.company} (${dateOnlyStr})`,
                            category: bill.category,
                            invoiceRef: resolveInvoiceRef(bill),
                            amount: payAmount
                        }]
                    });
                    await DataManager.savePaymentVoucher(pv);
                    setPvJustCreated(pv);
                    setExpensesWithPV(prev => {
                        const next = new Set(prev);
                        next.add(bill.id);
                        return next;
                    });
                } catch (pvErr) {
                    console.error("PV generation failed on quick pay", pvErr);
                }
            }

            // Deduct Treasury
            try {
                const numericAmt = payAmount;
                const field = payMethod === 'CASH' ? 'cashBalance' : 'bankBalance';
                const label = `AP Payment: ${bill.company}`;
                await DataManager.adjustTreasuryAndLog(field, -numericAmt, label, payMethod);
            } catch (trErr) {
                console.error("Treasury ledger adjustment failed", trErr);
            }

            await loadData();
            setPayModalData(null);
            setPayMethod('');
        } catch (err) { alert(err); } finally { setIsSaving(false); }
    };

    const handleUndoPayment = async (bill: ExpenseItem) => {
        if (!await (window as any).systemDialog.confirm(`您确定要撤销 ${bill.company} 的已付状态并重新标记为未付吗？`, '应付账款')) return;
        setIsSaving(true);
        try {
            const fullTotal = bill.totalBillAmount || bill.amount || 0;
            const updatedBill = {
                ...bill,
                amount: 0,
                outstandingAmount: fullTotal - (bill.creditNote || 0),
                paymentStatus: 'UNPAID',
                paymentDate: null,
                paymentMethod: null
            };
            await DataManager.saveStandaloneExpense(updatedBill);
            if (updatedBill.settlementId) await DataManager.updateExpenseInSettlement(updatedBill.settlementId, updatedBill);
            await loadData();
        } catch (err) { alert(err); } finally { setIsSaving(false); }
    };

    const toggleSelection = (billId: string) => {
        setSelectedBillIds(prev => {
            const next = new Set(prev);
            if (next.has(billId)) next.delete(billId);
            else next.add(billId);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedBillIds.size === filteredBills.length) {
            setSelectedBillIds(new Set());
        } else {
            setSelectedBillIds(new Set(filteredBills.map(b => b.id)));
        }
    };

    const batchOutstandingAmount = useMemo(() => {
        return Array.from(selectedBillIds).reduce((acc, id) => {
            const b = allBills.find(x => x.id === id);
            return acc + (b ? (b.outstandingAmount || 0) : 0);
        }, 0);
    }, [selectedBillIds, allBills]);

    const batchInvoiceTotal = useMemo(() => {
        return Array.from(selectedBillIds).reduce((acc, id) => {
            const b = allBills.find(x => x.id === id);
            return acc + (b ? (b.totalBillAmount || b.amount || 0) : 0);
        }, 0);
    }, [selectedBillIds, allBills]);

    const batchPaidAmount = useMemo(() => {
        return Array.from(selectedBillIds).reduce((acc, id) => {
            const b = allBills.find(x => x.id === id);
            return acc + (b ? ((b.totalBillAmount || b.amount || 0) - (b.creditNote || 0)) : 0);
        }, 0);
    }, [selectedBillIds, allBills]);

    const allSelectedPaid = useMemo(() => {
        if (selectedBillIds.size === 0) return false;
        return Array.from(selectedBillIds).every(id => {
            const b = allBills.find(x => x.id === id);
            return b && b.paymentStatus === 'PAID';
        });
    }, [selectedBillIds, allBills]);

    const handleBatchPay = async (options?: { bankRef?: string; bankReceiptUrl?: string; soaUrl?: string; paymentDate?: string; generatePV?: boolean }) => {
        if (!payMethod) return alert("Select Payment Method");
        setIsSaving(true);
        try {
            const selectedBills = allBills.filter(b => selectedBillIds.has(b.id));
            const paymentDateIso = options?.paymentDate ? `${options.paymentDate}T12:00:00.000Z` : new Date().toISOString();
            
            for (const bill of selectedBills) {
                const outstanding = bill.outstandingAmount || 0;
                if (outstanding <= 0) continue;

                const updatedBill = {
                    ...bill,
                    amount: (bill.amount || 0) + outstanding,
                    outstandingAmount: 0,
                    paymentStatus: 'PAID',
                    paymentMethod: payMethod,
                    paymentDate: paymentDateIso,
                    documentLink: bill.documentLink || options?.bankReceiptUrl || options?.soaUrl || '',
                    note: (bill.note || '') + `\n[${paymentDateIso.split('T')[0]}] Batch Paid RM${outstanding} via ${payMethod}` + (options?.bankRef ? ` Ref: ${options.bankRef}` : '')
                };
                
                await DataManager.saveStandaloneExpense(updatedBill);
                if (updatedBill.settlementId) await DataManager.updateExpenseInSettlement(updatedBill.settlementId, updatedBill);

                if (options?.generatePV) {
                    try {
                        const pvNumber = await DataManager.generatePVNumber(paymentDateIso);
                        const pv = buildPaymentVoucher({
                            pvNumber,
                            date: paymentDateIso,
                            payeeName: bill.company,
                            payeeId: suppliers.find(s => s.name === bill.company)?.id,
                            paymentMethod: (payMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER'),
                            relatedExpenseIds: [bill.id],
                            settlementId: bill.settlementId,
                            bankRef: options?.bankRef || '',
                            supportingDocLink: options?.bankReceiptUrl || options?.soaUrl || '',
                            particulars: [{
                                description: `Batch Payment on invoice - ${bill.company} (${paymentDateIso.split('T')[0]})` + (options?.bankRef ? ` [Ref: ${options.bankRef}]` : ''),
                                category: bill.category,
                                invoiceRef: resolveInvoiceRef(bill),
                                amount: outstanding
                            }]
                        });
                        await DataManager.savePaymentVoucher(pv);
                    } catch (pvErr) {
                        console.error("Batch single PV gen error (bill saved)", pvErr);
                    }
                }
            }

            try {
                const field = payMethod === 'CASH' ? 'cashBalance' : 'bankBalance';
                await DataManager.adjustTreasuryAndLog(field, -batchOutstandingAmount, `AP Batch Payment (${selectedBills.length} Invs)`, payMethod);
            } catch (trErr) {
                console.error("Treasury adjust ledger failed", trErr);
            }

            alert(`✅ Batch paid ${selectedBills.length} bills successfully!`);
            setSelectedBillIds(new Set());
            setIsBatchPayModalOpen(false);
            await loadData();
        } catch (err) { alert(err); } finally { setIsSaving(false); }
    };

    const handleBatchDelete = async () => {
        setIsSaving(true);
        try {
            const ids = Array.from(selectedBillIds);
            const parentMap = new Map<string, string[]>(); // parent settlementId -> element expense id list
            
            for (const billId of ids) {
                await deleteDoc(doc(db, 'standalone_expenses', billId));
                const bill = allBills.find(b => b.id === billId);
                if (bill && bill.settlementId) {
                    const existing = parentMap.get(bill.settlementId) || [];
                    existing.push(billId);
                    parentMap.set(bill.settlementId, existing);
                }
            }

            for (const [settlementId, toDeleteIds] of Array.from(parentMap.entries())) {
                const ref = doc(db, 'settlements', settlementId);
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(ref);
                    if (!snap.exists()) return;
                    const data = snap.data() as SettlementRecord;
                    const newExpenses = (data.expenses || []).filter(e => !toDeleteIds.includes(e.id));
                    transaction.update(ref, { expenses: newExpenses });
                });
            }

            alert(`✅ 已彻底删除 ${ids.length} 笔账单！`);
            setSelectedBillIds(new Set());
            setIsBatchDeleteModalOpen(false);
            await loadData();
        } catch (err) { 
            console.error(err); 
            alert('删除出错，部分账单可能未完整彻底删除：' + err);
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleExportPDF = (bills: ExpenseItem[]) => {
        setPrintData(bills);
        setIsGeneratingPdf(true);
        setTimeout(async () => {
            const input = actualPrintRef.current;
            if (!input) { setIsGeneratingPdf(false); return; }
            try {
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve());
                    });
                });
                if (document.fonts?.ready) {
                    await document.fonts.ready;
                }
                const canvas = await html2canvas(input, { 
                    scale: 2, 
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: '#ffffff',
                    logging: false,
                    scrollX: 0,
                    scrollY: 0,
                    windowWidth: 794,
                    width: 794,
                    height: input.scrollHeight,
                    removeContainer: true,
                    onclone: clonedDocument => {
                        const clonedElement = clonedDocument.getElementById('accounts-payable-export-root');
                        if (!clonedElement) {
                            throw new Error('Unable to find cloned Accounts Payable export node');
                        }
                        applyResolvedStylesForPdf(input, clonedElement);
                        clonedElement.style.display = 'block';
                        clonedElement.style.width = '794px';
                        clonedElement.style.minHeight = '1123px';
                        clonedElement.style.height = 'auto';
                    },
                });
                const imgData = canvas.toDataURL('image/jpeg', 0.82);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgWidth = 210;
                const pageHeight = 297;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;
                let position = 0;
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
                while (heightLeft > 3) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
                pdf.save(`Accounts_Payable_Sheet_${new Date().toISOString().split('T')[0]}.pdf`);
            } catch (e) {
                console.error('[AP PDF Export error]', e);
                alert('❌ PDF 生成失败 (PDF compile failed): ' + (e?.message || String(e)));
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 500);
    };

    const handleExportSupplierUnpaidPDF = (supplierName: string) => {
        const unpaidBills = allBills.filter(b => b.company === supplierName && b.paymentStatus !== 'PAID');
        if (unpaidBills.length === 0) {
            alert(`✅ 该供应商 (${supplierName}) 暂无未付款账单！\n(All bills are fully paid)`);
            return;
        }
        setPrintMode('SUPPLIER_UNPAID');
        setPrintData(unpaidBills);
        setIsGeneratingPdf(true);
        setTimeout(async () => {
            const input = actualPrintRef.current;
            if (!input) { setIsGeneratingPdf(false); setPrintMode('GENERAL'); return; }
            try {
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve());
                    });
                });
                if (document.fonts?.ready) {
                    await document.fonts.ready;
                }
                const canvas = await html2canvas(input, { 
                    scale: 2, 
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: '#ffffff',
                    logging: false,
                    scrollX: 0,
                    scrollY: 0,
                    windowWidth: 794,
                    width: 794,
                    height: input.scrollHeight,
                    removeContainer: true,
                    onclone: clonedDocument => {
                        const clonedElement = clonedDocument.getElementById('accounts-payable-export-root');
                        if (!clonedElement) {
                            throw new Error('Unable to find cloned Accounts Payable export node');
                        }
                        applyResolvedStylesForPdf(input, clonedElement);
                        clonedElement.style.display = 'block';
                        clonedElement.style.width = '794px';
                        clonedElement.style.minHeight = '1123px';
                        clonedElement.style.height = 'auto';
                    },
                });
                const imgData = canvas.toDataURL('image/jpeg', 0.82);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgWidth = 210;
                const pageHeight = 297;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;
                let position = 0;
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
                while (heightLeft > 3) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
                pdf.save(`Supplier_Unpaid_Statement_${supplierName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
            } catch (e) {
                console.error('[AP Supplier PDF Export error]', e);
                alert('❌ PDF 生成失败 (PDF compile failed): ' + (e?.message || String(e)));
            } finally {
                setIsGeneratingPdf(false);
                setPrintMode('GENERAL');
            }
        }, 500);
    };

    const handleBatchExportPV = async () => {
        const ids = Array.from(selectedBillIds);
        if (ids.length === 0) return;
        setBatchPVProgress({ current: 0, total: ids.length, phase: '🔍 正在检索付款凭单 (PV)' });

        try {
            const allPVs = await DataManager.getPaymentVouchersForExpenses(ids);
            const existingPVs: PaymentVoucher[] = [];
            const missingBills: ExpenseItem[] = [];

            for (const id of ids) {
                const bill = allBills.find(b => b.id === id);
                if (!bill) continue;

                const match = allPVs.find(pv => pv.relatedExpenseIds && pv.relatedExpenseIds.includes(bill.id));
                if (match) {
                    existingPVs.push(match);
                } else {
                    missingBills.push(bill);
                }
            }

            if (missingBills.length > 0) {
                // Find latest date among missing bills to use as default payment date
                const latestDateStr = missingBills.reduce((latest, b) => {
                    const d = (b.paymentDate || b.time || '').split('T')[0];
                    if (!latest || d > latest) return d;
                    return latest;
                }, '');
                setBatchPVBackdateDate(latestDateStr || new Date().toISOString().split('T')[0]);
                setBatchPVProgress(null);
                setBatchPVMissingDialog({ bills: missingBills, existingPVs });
            } else {
                setBatchPVProgress({ current: ids.length, total: ids.length, phase: '📂 开始转换高精 PDF (A4)...' });
                await generateCombinedPV_PDF(existingPVs);
            }
        } catch (err) {
            console.error(err);
            alert('读取 PV 列表出错');
            setBatchPVProgress(null);
        }
    };

    const getInvoicesDateRange = (items: ExpenseItem[]): string => {
        if (!items || items.length === 0) return '';
        const formattedDates: string[] = [];
        items.forEach(b => {
            const raw = b.time || b.paymentDate || '';
            if (!raw) return;
            const matchHyphen = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (matchHyphen) {
                formattedDates.push(matchHyphen[1] + matchHyphen[2] + matchHyphen[3]);
                return;
            }
            const matchSlash = raw.match(/(\d{4})\/(\d{2})\/(\d{2})/);
            if (matchSlash) {
                formattedDates.push(matchSlash[1] + matchSlash[2] + matchSlash[3]);
                return;
            }
            const cleanDigits = raw.replace(/\D/g, '');
            if (cleanDigits.length >= 8) {
                formattedDates.push(cleanDigits.slice(0, 8));
            }
        });
        const uniqueDates = Array.from(new Set(formattedDates)).sort();
        if (uniqueDates.length === 0) return '';
        if (uniqueDates.length === 1) return uniqueDates[0];
        return `${uniqueDates[0]}-${uniqueDates[uniqueDates.length - 1]}`;
    };

    const handleConfirmAutoBackdate = async () => {
        if (!batchPVMissingDialog) return;
        const { bills, existingPVs } = batchPVMissingDialog;
        setBatchPVMissingDialog(null);
        setBatchPVProgress({ current: 0, total: bills.length, phase: '⚙️ 正在自动生成缺失的付款凭单 (PV)' });

        try {
            const newlyCreatedPVs: PaymentVoucher[] = [];
            const generatedIds: string[] = [];
            for (let i = 0; i < bills.length; i++) {
                const bill = bills[i];
                setBatchPVProgress({ current: i + 1, total: bills.length, phase: `⚙️ 正在生成 PV (${bill.company})` });
                
                const pvDate = batchPVBackdateDate ? `${batchPVBackdateDate}T12:00:00.000Z` : (bill.paymentDate || bill.time || new Date().toISOString());
                const pvNumber = await DataManager.generatePVNumber(pvDate);

                const pv = buildPaymentVoucher({
                    pvNumber,
                    payeeName: bill.company,
                    payeeId: suppliers.find(s => s.name === bill.company)?.id,
                    paymentMethod: (bill.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER'),
                    relatedExpenseIds: [bill.id],
                    settlementId: bill.settlementId,
                    isBackdated: true,
                    date: pvDate,
                    particulars: [{
                        description: resolveParticulars(bill),
                        category: bill.category,
                        invoiceRef: resolveInvoiceRef(bill),
                        amount: (bill.totalBillAmount || bill.amount || 0) - (bill.creditNote || 0)
                    }],
                    invoiceDateRange: getInvoicesDateRange([bill]),
                    voucherTitle: batchVoucherTitle === 'AUTO' 
                        ? (bill.paymentMethod === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER') 
                        : batchVoucherTitle
                });

                pv.createdAt = pvDate;
                await DataManager.savePaymentVoucher(pv);
                newlyCreatedPVs.push(pv);
                generatedIds.push(bill.id);
            }

            setExpensesWithPV(prev => {
                const next = new Set(prev);
                generatedIds.forEach(id => next.add(id));
                return next;
            });

            const combinedList = [...existingPVs, ...newlyCreatedPVs];
            combinedList.sort((a,b) => a.pvNumber.localeCompare(b.pvNumber));

            setBatchPVProgress({ current: 0, total: combinedList.length, phase: '📂 开始转换高精 PDF (A4)...' });
            await generateCombinedPV_PDF(combinedList);
        } catch (err) {
            console.error(err);
            alert('补开凭单失败: ' + err);
        } finally {
            setBatchPVProgress(null);
        }
    };

    const handleConfirmGroupVendorPVs = async () => {
        if (!batchPVMissingDialog) return;
        const { bills, existingPVs } = batchPVMissingDialog;
        setBatchPVMissingDialog(null);
        setBatchPVProgress({ current: 0, total: 100, phase: '⚙️ 正在按相同商家合并生成付款凭单 (PV)' });

        try {
            // Group bills by 'company'
            const groups: { [company: string]: ExpenseItem[] } = {};
            bills.forEach(bill => {
                const company = bill.company || '未知商家 / Unnamed Vendor';
                if (!groups[company]) {
                    groups[company] = [];
                }
                groups[company].push(bill);
            });

            const newlyCreatedPVs: PaymentVoucher[] = [];
            const generatedIds: string[] = [];

            const keys = Object.keys(groups);
            for (let i = 0; i < keys.length; i++) {
                const company = keys[i];
                const groupBills = groups[company];
                setBatchPVProgress({ current: Math.round((i / keys.length) * 100), total: 100, phase: `⚙️ 正在生成商家 [${company}] 的合并 PV (${groupBills.length} 笔账单)` });

                // Particulars for each bill in this group
                const particulars = groupBills.map(bill => ({
                    description: resolveParticulars(bill),
                    category: bill.category,
                    invoiceRef: resolveInvoiceRef(bill),
                    amount: (bill.totalBillAmount || bill.amount || 0) - (bill.creditNote || 0)
                }));

                // Get latest date
                const latestDate = groupBills.reduce((latest, b) => {
                    const dateStr = (b.paymentDate || b.time || '').split('T')[0];
                    if (!latest || dateStr > latest) return dateStr;
                    return latest;
                }, '');
                const pvDate = batchPVBackdateDate ? `${batchPVBackdateDate}T12:00:00.000Z` : (latestDate ? `${latestDate}T12:00:00.000Z` : new Date().toISOString());

                const pvNumber = await DataManager.generatePVNumber(pvDate);

                // Determine payment method, if any is BANK_TRANSFER, assume BANK_TRANSFER, else check first bill
                const hasBankTransfer = groupBills.some(b => b.paymentMethod === 'BANK_TRANSFER' || b.paymentMethod === 'ONLINE_TRANSFER' || b.paymentMethod === 'FPX');
                const paymentMethod = hasBankTransfer ? 'BANK_TRANSFER' : (groupBills[0].paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER');

                const pv = buildPaymentVoucher({
                    pvNumber,
                    payeeName: company,
                    payeeId: suppliers.find(s => s.name === company)?.id,
                    paymentMethod,
                    relatedExpenseIds: groupBills.map(b => b.id),
                    settlementId: groupBills[0].settlementId, // use first one's settlement
                    isBackdated: true,
                    date: pvDate,
                    particulars,
                    invoiceDateRange: getInvoicesDateRange(groupBills),
                    voucherTitle: batchVoucherTitle === 'AUTO' 
                        ? (paymentMethod === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER') 
                        : batchVoucherTitle
                });

                pv.createdAt = pvDate;
                await DataManager.savePaymentVoucher(pv);
                newlyCreatedPVs.push(pv);
                groupBills.forEach(b => generatedIds.push(b.id));
            }

            setExpensesWithPV(prev => {
                const next = new Set(prev);
                generatedIds.forEach(id => next.add(id));
                return next;
            });

            const combinedList = [...existingPVs, ...newlyCreatedPVs];
            combinedList.sort((a,b) => a.pvNumber.localeCompare(b.pvNumber));

            setBatchPVProgress({ current: 100, total: 100, phase: '📂 开始转换高精 PDF (A4)...' });
            await generateCombinedPV_PDF(combinedList);
        } catch (err) {
            console.error(err);
            alert('按商家合并生成凭单失败: ' + err);
        } finally {
            setBatchPVProgress(null);
        }
    };

    const handleConfirmMergePettyCash = async () => {
        if (!batchPVMissingDialog) return;
        const { bills, existingPVs } = batchPVMissingDialog;
        setBatchPVMissingDialog(null);
        setBatchPVProgress({ current: 0, total: 1, phase: '⚙️ 正在合并生成一张零用金结算凭单 (PV)' });

        try {
            const particulars = bills.map(bill => {
                const desc = resolveParticulars(bill);
                const combinedDesc = bill.company ? `[${bill.company}] ${desc}` : desc;
                return {
                    description: combinedDesc,
                    category: bill.category,
                    invoiceRef: resolveInvoiceRef(bill),
                    amount: (bill.totalBillAmount || bill.amount || 0) - (bill.creditNote || 0)
                };
            });

            const latestDate = bills.reduce((latest, b) => {
                const dateStr = (b.paymentDate || b.time || '').split('T')[0];
                if (!latest || dateStr > latest) return dateStr;
                return latest;
            }, '');
            const pvDate = batchPVBackdateDate ? `${batchPVBackdateDate}T12:00:00.000Z` : (latestDate ? `${latestDate}T12:00:00.000Z` : new Date().toISOString());

            const pvNumber = await DataManager.generatePVNumber(pvDate);

            const pv = buildPaymentVoucher({
                pvNumber,
                payeeName: mergePayeeName || 'Petty Cash (零用金)',
                paymentMethod: mergePaymentMethod,
                relatedExpenseIds: bills.map(b => b.id),
                isBackdated: true,
                date: pvDate,
                particulars,
                invoiceDateRange: getInvoicesDateRange(bills),
                voucherTitle: batchVoucherTitle === 'AUTO' 
                    ? (mergePaymentMethod === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER') 
                    : batchVoucherTitle
            });

            pv.createdAt = pvDate;
            await DataManager.savePaymentVoucher(pv);

            const generatedIds = bills.map(b => b.id);
            setExpensesWithPV(prev => {
                const next = new Set(prev);
                generatedIds.forEach(id => next.add(id));
                return next;
            });

            const combinedList = [...existingPVs, pv];
            combinedList.sort((a,b) => a.pvNumber.localeCompare(b.pvNumber));

            setBatchPVProgress({ current: 0, total: combinedList.length, phase: '📂 开始转换高精 PDF (A4)...' });
            await generateCombinedPV_PDF(combinedList);
        } catch (err) {
            console.error(err);
            alert('合并补开凭单失败: ' + err);
        } finally {
            setBatchPVProgress(null);
        }
    };

    const generateCombinedPV_PDF = async (vouchers: PaymentVoucher[]) => {
        if (vouchers.length === 0) return;
        const docPDF = new jsPDF('p', 'mm', 'a4');

        try {
            for (let i = 0; i < vouchers.length; i++) {
                const pv = vouchers[i];
                setBatchPVProgress({ current: i + 1, total: vouchers.length, phase: `📄 正在绘制 A4 (纵向) (${pv.pvNumber})` });

                await new Promise<void>((resolve, reject) => {
                    flushSync(() => {
                        setPrintingVoucher(pv);
                    });

                    setTimeout(async () => {
                        const element = voucherRef.current;
                        if (!element) return reject(new Error('No element found'));
                        try {
                            await new Promise<void>((r) => {
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => r());
                                });
                            });
                            if (document.fonts?.ready) {
                                await document.fonts.ready;
                            }
                            
                            const totalPages = Math.max(1, Math.ceil(pv.particulars.length / 8));
                            for (let j = 0; j < totalPages; j++) {
                                const pageElement = document.getElementById(`payment-voucher-export-page-${j}`);
                                if (!pageElement) continue;

                                const canvas = await html2canvas(pageElement, { 
                                    scale: 2, 
                                    useCORS: true, 
                                    allowTaint: false,
                                    backgroundColor: '#ffffff',
                                    logging: false,
                                    scrollX: 0,
                                    scrollY: 0,
                                    windowWidth: 794,
                                    windowHeight: 1123,
                                    width: 794,
                                    height: 1123,
                                    removeContainer: true,
                                    onclone: clonedDocument => {
                                        const clonedElement = clonedDocument.getElementById(`payment-voucher-export-page-${j}`);
                                        if (clonedElement) {
                                            applyResolvedStylesForPdf(pageElement, clonedElement);
                                        }
                                    },
                                });
                                const imgData = canvas.toDataURL('image/jpeg', 0.82);
                                if (i > 0 || j > 0) {
                                    docPDF.addPage('a4', 'p');
                                }
                                docPDF.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                            }
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    }, 100);
                });
            }

            const today = new Date().toISOString().split('T')[0];
            const seqKey = `batch_pv_seq_${today}`;
            const seq = parseInt(localStorage.getItem(seqKey) || '0', 10) + 1;
            localStorage.setItem(seqKey, seq.toString());
            const seqStr = seq.toString().padStart(3, '0');
            
            if (vouchers.length === 1) {
                const voucher = vouchers[0];
                const cleanVendor = voucher.payeeName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                const rangeStr = voucher.invoiceDateRange ? `_(${voucher.invoiceDateRange})` : '';
                docPDF.save(`${voucher.pvNumber}_${cleanVendor}${rangeStr}.pdf`);
            } else {
                const uniquePayees = Array.from(new Set(vouchers.map(v => v.payeeName)));
                if (uniquePayees.length === 1 && uniquePayees[0]) {
                    const cleanVendor = uniquePayees[0].replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                    const allRanges = vouchers.map(v => v.invoiceDateRange).filter(Boolean);
                    const rangeSuffix = allRanges.length > 0 ? `_(${allRanges.join('_')})` : '';
                    docPDF.save(`Batch_PVs_${cleanVendor}${rangeSuffix}.pdf`);
                } else {
                    docPDF.save(`Batch_Payment_Vouchers_${today}_${seqStr}.pdf`);
                }
            }
        } catch (error: unknown) {
            console.error('[AP PDF Export error]', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`❌ 合并付款凭单 PDF 生成失败 (PV PDF compile failed): ${errorMessage}`);
        } finally {
            setBatchPVProgress(null);
            setPrintingVoucher(null);
            setSelectedBillIds(new Set());
        }
    };

    const exportVoucherPDF = (voucher: PaymentVoucher) => {
        setIsGeneratingPdf(true);
        try {
            flushSync(() => {
                setPrintingVoucher(voucher);
            });
        } catch (err) {
            console.warn('[AP] flushSync context warning, falling back to batch update:', err);
            setPrintingVoucher(voucher);
        }

        setTimeout(async () => {
            const input = voucherRef.current;
            if (!input) {
                alert('❌ 无法定位凭单渲染节点 (Could not find PV node). 请关闭历史/补开窗口后重试。');
                setIsGeneratingPdf(false);
                return;
            }
            try {
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve());
                    });
                });
                if (document.fonts?.ready) {
                    await document.fonts.ready;
                }
                
                const totalPages = Math.max(1, Math.ceil(voucher.particulars.length / 8));
                const pdf = new jsPDF('p', 'mm', 'a4');
                
                for (let j = 0; j < totalPages; j++) {
                    const pageElement = document.getElementById(`payment-voucher-export-page-${j}`);
                    if (!pageElement) continue;

                    if (j > 0) {
                        pdf.addPage('a4', 'p');
                    }
                    const canvas = await html2canvas(pageElement, { 
                        scale: 2, 
                        useCORS: true, 
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false,
                        scrollX: 0,
                        scrollY: 0,
                        windowWidth: 794,
                        windowHeight: 1123,
                        width: 794,
                        height: 1123,
                        removeContainer: true,
                        onclone: clonedDocument => {
                            const clonedElement = clonedDocument.getElementById(`payment-voucher-export-page-${j}`);
                            if (clonedElement) {
                                applyResolvedStylesForPdf(pageElement, clonedElement);
                            }
                        },
                    });
                    const imgData = canvas.toDataURL('image/jpeg', 0.82);
                    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                }
                
                const cleanVendor = voucher.payeeName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                const rangeStr = voucher.invoiceDateRange ? `_(${voucher.invoiceDateRange})` : '';
                pdf.save(`${voucher.pvNumber}_${cleanVendor}${rangeStr}.pdf`);
            } catch (error: unknown) {
                console.error('[AP PDF Export error]', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                alert(`❌ 付款凭单 PDF 生成失败 (PV PDF compile failed): ${errorMessage}`);
            } finally {
                setPrintingVoucher(null);
                setIsGeneratingPdf(false);
            }
        }, 150);
    };

    const handleCardPVClick = async (bill: ExpenseItem) => {
        setIsCardPVLoading(bill.id);
        try {
            const matches = await DataManager.getPaymentVouchersForExpenses([bill.id]);
            const match = matches[0] || null;
            if (match) {
                exportVoucherPDF(match);
            } else {
                setGeneratePVForBill(bill);
                setPvGenerateDate((bill.paymentDate || bill.time || '').split('T')[0]);
                setPvVoucherTitle('AUTO');
            }
        } catch (err) {
            console.error(err);
            alert('读取 PV 列表失败');
        } finally {
            setIsCardPVLoading(null);
        }
    };

    const handleSingleBackdatePV = async () => {
        if (!generatePVForBill || !pvGenerateDate) return;
        const bill = generatePVForBill;
        setGeneratePVForBill(null);
        setIsCardPVLoading(bill.id);

        try {
            const pvNumber = await DataManager.generatePVNumber(pvGenerateDate + 'T12:00:00.000Z');
            const pv = buildPaymentVoucher({
                pvNumber,
                payeeName: bill.company,
                payeeId: suppliers.find(s => s.name === bill.company)?.id,
                paymentMethod: (bill.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER'),
                relatedExpenseIds: [bill.id],
                settlementId: bill.settlementId,
                isBackdated: true,
                date: pvGenerateDate + 'T12:00:00.000Z',
                particulars: [{
                    description: resolveParticulars(bill),
                    category: bill.category,
                    invoiceRef: resolveInvoiceRef(bill),
                    amount: (bill.totalBillAmount || bill.amount || 0) - (bill.creditNote || 0)
                }],
                voucherTitle: (pvVoucherTitle && pvVoucherTitle !== 'AUTO') 
                    ? pvVoucherTitle 
                    : (bill.paymentMethod === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER')
            });

            pv.createdAt = pvGenerateDate + 'T12:00:00.000Z';
            await DataManager.savePaymentVoucher(pv);
            exportVoucherPDF(pv);
            setExpensesWithPV(prev => {
                const next = new Set(prev);
                next.add(bill.id);
                return next;
            });
        } catch (err) {
            console.error(err);
            alert('补开凭单失败: ' + err);
        } finally {
            setIsCardPVLoading(null);
        }
    };

    const handleSupplierDetailsClick = (supplierName: string) => {
        const match = Array.from(supplierByName.values()).find(s => s.name === supplierName);
        if (match) {
            setSelectedSupplierId(match.id);
            setViewMode('SUPPLIER_DETAIL');
        }
    };

    const totalInvoicesOutstanding = useMemo(() => {
        const targetList = viewMode === 'SUPPLIER_DETAIL' && selectedSupplierId 
            ? allBills.filter(b => b.company === supplierById.get(selectedSupplierId)?.name)
            : allBills;
        return targetList.reduce((acc, b) => acc + (b.outstandingAmount || 0), 0);
    }, [allBills, viewMode, selectedSupplierId, supplierById]);

    const overdueBillsCount = useMemo(() => {
        return allBills.filter(b => b.paymentStatus !== 'PAID' && new Date() > new Date(b.dueDate || '9999-12-31')).length;
    }, [allBills]);

    const thisMonthOutstanding = useMemo(() => {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const prefix = `${y}-${m}`;
        return allBills.filter(b => (b.time || '').startsWith(prefix)).reduce((acc, b) => acc + (b.outstandingAmount || 0), 0);
    }, [allBills]);

    const showFab = viewMode === 'LIST' && !isFormOpen;

    return (
        <div className="absolute inset-0 bg-[#F5F7FA] z-50 flex flex-col overflow-hidden" id="ap_module_wrapper">
            {/* === MOBILE STICKY HEADER === */}
            <div className="md:hidden bg-[#111111] border-b-[3px] border-[#FFD200] px-4 flex justify-between items-center shrink-0 shadow-lg sticky top-0 z-40 safe-area-top h-[56px]">
                <div className="flex items-center gap-3 min-w-0">
                    {viewMode === 'SUPPLIER_DETAIL' ? (
                        <button onClick={() => { setViewMode('LIST'); setSelectedSupplierId(null); }} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all shrink-0"><ArrowLeft size={20}/></button>
                    ) : (
                        <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all shrink-0"><ArrowLeft size={20}/></button>
                    )}
                    <h2 className="font-serif font-black text-sm text-white tracking-wide whitespace-nowrap truncate">
                        {viewMode === 'SUPPLIER_DETAIL' ? `${supplierById.get(selectedSupplierId!)?.name || '商家'} 对账` : '应付账款 AP'}
                    </h2>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="bg-[#22C55E]/10 text-[#22C55E] text-[10px] px-2.5 py-1 rounded-full font-black flex items-center gap-1 shrink-0 border border-[#22C55E]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse"></span>
                        ONLINE
                    </span>
                    {isBillingCapped && (
                        <span className="bg-[#EF4444]/10 text-[#EF4444] text-[10px] px-2 py-0.5 rounded-full font-black border border-[#EF4444]/20">
                            CAPPED
                        </span>
                    )}
                </div>
            </div>

            {/* === MOBILE KPI SUMMARY STRIP === */}
            <div className="flex md:hidden gap-2 px-4 py-3 bg-[#F6F7FB] border-b border-gray-200 overflow-x-auto scrollbar-hide shrink-0">
                <div className="min-w-[140px] bg-white border border-gray-250/65 rounded-2xl p-3 shadow-xs shrink-0 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">未付款总额</p>
                    <p className="text-sm font-black text-[#EF4444] mt-1">RM {totalInvoicesOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="min-w-[110px] bg-white border border-gray-250/65 rounded-2xl p-3 shadow-xs shrink-0 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">逾期账单</p>
                    <p className="text-sm font-black text-stone-900 mt-1">{overdueBillsCount} 笔</p>
                </div>
                <div className="min-w-[130px] bg-white border border-gray-250/65 rounded-2xl p-3 shadow-xs shrink-0 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">本月待付款</p>
                    <p className="text-sm font-black text-stone-900 mt-1">RM {thisMonthOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
            </div>

            {/* === MOBILE SEARCH + FILTER ROW === */}
            <div className="flex md:hidden items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
                <div className="relative flex-grow">
                    <input 
                        type="text" 
                        className="w-full pl-9 pr-8 py-2.5 bg-[#F6F7FB] border border-gray-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-[#FFD200] transition-colors" 
                        placeholder="搜索商家、备注、或金额..." 
                        value={searchQuery} 
                        onChange={e => { 
                            setSearchQuery(e.target.value); 
                            if(viewMode === 'SUPPLIER_DETAIL') { 
                                setViewMode('LIST'); 
                                setSelectedSupplierId(null); 
                            } 
                        }} 
                        style={{ fontSize: 16 }} 
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Search size={14}/>
                    </div>
                    {searchQuery && (
                        <button 
                            onClick={() => { setSearchQuery(''); }} 
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black p-1"
                        >
                            <X size={12}/>
                        </button>
                    )}
                </div>
                <button 
                    onClick={() => setIsMobileFilterOpen(true)}
                    className="flex items-center gap-1.5 bg-[#111111] hover:bg-black text-[#FFD200] text-xs font-black h-10 px-3.5 rounded-xl transition-all border border-stone-850 shrink-0 active:scale-95"
                >
                    <Filter size={14}/>
                    <span>筛选</span>
                </button>
            </div>

            {/* === MOBILE STATUS SEGMENTED CONTROL === */}
            <div className="block md:hidden px-4 py-2 shrink-0 bg-white border-b border-gray-100">
                <div className="bg-[#E5E7EB]/50 p-1 rounded-[14px] flex h-11 relative">
                    {[
                        { id: 'UNPAID', label: '未付' },
                        { id: 'PAID', label: '已付' },
                        { id: 'ALL', label: `全部 (${filteredBills.length})` }
                    ].map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 flex items-center justify-center text-xs font-black rounded-[11px] transition-all duration-200 z-15 ${isActive ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* === MOBILE FILTER BOTTOM SHEET === */}
            {isMobileFilterOpen && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black/60 z-[100] animate-in fade-in duration-200"
                        onClick={() => setIsMobileFilterOpen(false)}
                    ></div>
                    
                    {/* Slide Up Sheet */}
                    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[24px] max-h-[85vh] overflow-y-auto z-[101] shadow-2xl flex flex-col border-t border-gray-200 animate-in slide-in-from-bottom duration-300 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                            <h3 className="text-sm font-black text-stone-900">高级筛选 Command Center</h3>
                            <button 
                                onClick={() => setIsMobileFilterOpen(false)}
                                className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-stone-500 rounded-full transition-all active:scale-95"
                            >
                                <X size={18}/>
                            </button>
                        </div>
                        
                        <div className="p-5 space-y-5 flex-1">
                            {/* Company Input */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">选择商家 (Company)</label>
                                <select 
                                    value={searchId} 
                                    onChange={e => {
                                        setSearchId(e.target.value);
                                        if(viewMode === 'SUPPLIER_DETAIL') {
                                            setViewMode('LIST');
                                            setSelectedSupplierId(null);
                                        }
                                    }}
                                    className="w-full bg-[#F6F7FB] border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200] transition-colors"
                                    style={{ fontSize: 16 }}
                                >
                                    <option value="">全部商家 (All)</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.id} - {s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Select month */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">按月份筛选 (By Month)</label>
                                <select 
                                    value={currentMonthVal} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val) {
                                            const [yStr, mStr] = val.split('-');
                                            const year = Number(yStr);
                                            const month = Number(mStr);
                                            const startStr = `${yStr}-${mStr}-01`;
                                            const lastDay = new Date(year, month, 0).getDate();
                                            const endStr = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
                                            setDateRange({ start: startStr, end: endStr });
                                        } else {
                                            setDateRange({ start: '', end: '' });
                                        }
                                    }}
                                    className="w-full bg-[#F6F7FB] border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200] transition-colors"
                                    style={{ fontSize: 16 }}
                                >
                                    <option value="">快捷按月选择 Dropdown...</option>
                                    {monthsList.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Custom Date Range */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">自定义日期范围 (Date Range)</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="date" 
                                        value={dateRange.start} 
                                        onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                        className="flex-1 bg-[#F6F7FB] border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                                        style={{ fontSize: 16 }}
                                    />
                                    <span className="text-gray-400 font-bold">-</span>
                                    <input 
                                        type="date" 
                                        value={dateRange.end} 
                                        onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                        className="flex-1 bg-[#F6F7FB] border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                                        style={{ fontSize: 16 }}
                                    />
                                </div>
                            </div>

                            {/* View Filter */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">视图分类 (View Category)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: '常规账单 🏢', value: 'REGULAR', count: billTypeCounts.regular },
                                        { label: '固定支出 📌', value: 'FIXED', count: billTypeCounts.fixed },
                                        { label: '薪资相关 🧠', value: 'SALARY', count: billTypeCounts.salary },
                                        { label: '银行/平台 ⚙️', value: 'PLATFORM', count: billTypeCounts.platform },
                                        { label: '显示全部 📊', value: 'ALL', count: billTypeCounts.total }
                                    ].map(opt => (
                                        <button 
                                            key={opt.value}
                                            onClick={() => setBillTypeFilter(opt.value as any)}
                                            className={`py-3 px-3.5 rounded-xl text-xs font-black transition-all border text-left flex justify-between items-center ${billTypeFilter === opt.value ? 'bg-[#111111] text-white border-transparent shadow-xs' : 'bg-[#F6F7FB] text-stone-600 border-gray-200 hover:bg-gray-100'}`}
                                        >
                                            <span>{opt.label}</span>
                                            <span className="text-[10px] opacity-80">{opt.count}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tags Selection */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">选择标签 (Tag)</label>
                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-[#F6F7FB] rounded-xl border border-gray-200">
                                    <button 
                                        onClick={() => setSelectedTag('ALL')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTag === 'ALL' ? 'bg-[#111111] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                                    >
                                        🔖 ALL
                                    </button>
                                    {availableTags.map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => setSelectedTag(t)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTag === t ? 'bg-[#111111] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                                        >
                                            #{t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Apply & Reset Buttons */}
                        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 grid grid-cols-2 gap-3 mt-4">
                            <button 
                                onClick={() => {
                                    setSearchId('');
                                    setDateRange({ start: '', end: '' });
                                    setSelectedTag('ALL');
                                    setBillTypeFilter('REGULAR');
                                    setIsMobileFilterOpen(false);
                                }}
                                className="py-3 bg-gray-100 hover:bg-gray-200 text-stone-800 rounded-xl text-sm font-black transition-all active:scale-95"
                            >
                                重置
                            </button>
                            <button 
                                onClick={() => setIsMobileFilterOpen(false)}
                                className="py-3 bg-[#111111] text-[#FFD200] hover:bg-black rounded-xl text-sm font-black transition-all active:scale-95 shadow-md"
                            >
                                应用
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* === DESKTOP STICKY HEADER === */}
            <div className="hidden md:flex bg-[#111111] px-5 py-4 justify-between items-center shrink-0 shadow-[0_8px_28px_rgba(17,17,17,0.18)] border-b border-[#FFD200] sticky top-0 z-40 safe-area-top">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    {viewMode === 'SUPPLIER_DETAIL' ? (
                        <button onClick={() => { setViewMode('LIST'); setSelectedSupplierId(null); }} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all shrink-0"><ArrowLeft size={20}/></button>
                    ) : (
                        <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all shrink-0"><ArrowLeft size={20}/></button>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 md:gap-2">
                            <h2 className="font-serif font-black text-sm md:text-2xl text-white tracking-wide whitespace-nowrap truncate">
                                {viewMode === 'SUPPLIER_DETAIL' ? (
                                    <span>{supplierById.get(selectedSupplierId!)?.name || '商家'} 对账单</span>
                                ) : (
                                    <span>应付账款 (AP)</span>
                                )}
                            </h2>
                            {isBillingCapped && (
                                <span className="bg-red-650/90 text-white text-[9px] px-1.5 py-0.5 rounded-full font-serif lowercase tracking-normal scale-90 whitespace-nowrap font-black shrink-0">
                                    capped
                                </span>
                            )}
                        </div>
                        <div className="hidden md:flex items-center gap-1 text-[11px] font-black text-gray-400 uppercase tracking-widest mt-0.5 whitespace-nowrap">
                            <span>AP Ledger &amp; Cash Flow</span>
                        </div>
                    </div>
                </div>
                
                {/* Desktop Header Actions */}
                <div className="flex items-center gap-1.5 md:gap-2">
                    {/* ⚙️ AI 暂存区扫描器 */}
                    <button 
                        onClick={handleAiScanPending}
                        disabled={isAiScanning}
                        className={`h-11 flex items-center gap-2 bg-[#FFD200] hover:bg-[#FFE14D] active:scale-[0.98] text-[#111111] text-xs font-black px-4 rounded-[14px] border border-[#FFD200] shadow-[0_6px_18px_rgba(255,210,0,0.22)] transition-all shrink-0 ${isAiScanning ? 'animate-pulse' : ''}`}
                        title="扫描云端暂存区并利用 AI 解析 (Cloud AP AI Scanner)"
                    >
                        {isAiScanning ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                        <span className="hidden md:inline">AI 扫描</span>
                    </button>

                    {/* 🔧 营销账单批量细分补目工具 */}
                    {unCategorizedMarketingBills.length > 0 && (
                        <button 
                            onClick={() => { setMigrationData({}); setShowMigrationTool(true); }}
                            className="bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-[10px] md:text-xs font-black px-2 py-1.5 md:px-3.5 md:py-2.5 rounded-xl border border-purple-400 shadow-lg transition-all flex items-center gap-1 shrink-0 whitespace-nowrap"
                            title="把历史未分类的 MARKETING 账单一键补营销细分科目"
                        >
                            <span>🔧</span>
                            <span className="hidden md:inline">补类目 ({unCategorizedMarketingBills.length})</span>
                        </button>
                    )}

                    <button 
                        onClick={() => handleOpenForm()} 
                        className="h-11 bg-white/10 hover:bg-white/15 text-white font-black text-xs px-4 rounded-[14px] border border-white/10 transition-all flex items-center gap-2 active:scale-[0.98] shrink-0 whitespace-nowrap"
                    >
                        <Plus size={12}/> 
                        <span className="hidden sm:inline">新增账单</span>
                        <span className="inline sm:hidden">新增</span>
                    </button>

                    <button 
                        onClick={() => setShowBackdate(true)} 
                        className="h-11 bg-white/10 hover:bg-white/15 text-white font-black text-xs px-4 rounded-[14px] border border-white/10 transition-all flex items-center gap-2 active:scale-[0.98] shrink-0 whitespace-nowrap"
                    >
                        <Calendar size={12}/> 
                        <span className="hidden sm:inline">补开 PV</span>
                        <span className="inline sm:hidden">补开</span>
                    </button>
                    <button 
                        onClick={() => setShowPVHistory(true)} 
                        className="h-11 bg-white/10 hover:bg-white/15 text-white font-black text-xs px-4 rounded-[14px] border border-white/10 transition-all flex items-center gap-2 active:scale-[0.98] shrink-0 whitespace-nowrap"
                    >
                        <FileText size={12}/> 
                        <span className="hidden sm:inline">PV 历史</span>
                        <span className="inline sm:hidden">历史</span>
                    </button>
                    <div className="hidden sm:block"><ModuleGuideButton moduleId="ap"/></div>
                </div>
            </div>

            {/* === DESKTOP UPPER SEARCH FILTER TOOLBAR === */}
            <div className="hidden md:flex bg-white border-b border-gray-200 p-3 md:p-4 shrink-0 flex-col gap-3">
                <div className="flex flex-col md:flex-row justify-between gap-3 items-stretch md:items-center">
                    {/* Search grids: Two slots */}
                    <div className="flex flex-row gap-2 flex-grow max-w-2xl">
                        {/* Left grid: Company ID (e.g., 8018) */}
                        <div className="relative w-1/3 min-w-[100px] md:min-w-[130px]">
                            <input 
                                type="text" 
                                className="w-full pl-8 pr-7 py-2.5 md:py-3 bg-gray-50 hover:bg-gray-100 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-[#FFD700] transition-colors" 
                                placeholder="公司 ID (8018)" 
                                value={searchId} 
                                onChange={e => { 
                                    setSearchId(e.target.value); 
                                    if(viewMode === 'SUPPLIER_DETAIL') { 
                                        setViewMode('LIST'); 
                                        setSelectedSupplierId(null); 
                                    } 
                                }} 
                                style={{ fontSize: 16 }} 
                            />
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-[10px] font-bold">ID</div>
                            {searchId && (
                                <button 
                                    onClick={() => { setSearchId(''); }} 
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black p-1"
                                >
                                    <X size={12}/>
                                </button>
                            )}
                        </div>

                        {/* Right grid: Name, Content/Remarks, or Amount */}
                        <div className="relative flex-grow">
                            <input 
                                type="text" 
                                className="w-full pl-9 pr-8 py-2.5 md:py-3 bg-gray-50 hover:bg-gray-100 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-[#FFD700] transition-colors" 
                                placeholder="搜索供应商名、备注、或金额..." 
                                value={searchQuery} 
                                onChange={e => { 
                                    setSearchQuery(e.target.value); 
                                    if(viewMode === 'SUPPLIER_DETAIL') { 
                                        setViewMode('LIST'); 
                                        setSelectedSupplierId(null); 
                                    } 
                                }} 
                                style={{ fontSize: 16 }} 
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <Search size={14}/>
                            </div>
                            {searchQuery && (
                                <button 
                                    onClick={() => { setSearchQuery(''); }} 
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black p-1"
                                >
                                    <X size={12}/>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick date range selector chips */}
                    <div className="flex gap-1.5 items-center overflow-x-auto scrollbar-hide py-1">
                        {/* 电脑端自定义日期范围 (左边展示) */}
                        <div className="hidden md:flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 shrink-0">
                            <span className="text-gray-400 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
                                <Calendar size={11} className="text-gray-400" />
                                过滤范围:
                            </span>
                            <input 
                                type="date" 
                                value={dateRange.start} 
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                                className="bg-transparent border-none text-[10px] font-black p-0 outline-none w-[92px] text-gray-800"
                            />
                            <span className="text-gray-300 text-[10px] font-black">-</span>
                            <input 
                                type="date" 
                                value={dateRange.end} 
                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                                className="bg-transparent border-none text-[10px] font-black p-0 outline-none w-[92px] text-gray-800"
                            />
                        </div>


                        {/* 📅 快捷按月选择 Dropdown */}
                        <div className="relative shrink-0 flex items-center bg-amber-50 hover:bg-amber-100/80 border border-amber-200 rounded-lg px-2 py-0.5 transition-colors h-[28px] md:h-[32px] cursor-pointer">
                            <span className="text-[10px] font-black text-amber-900 mr-1 select-none pointer-events-none">📅</span>
                            <select 
                                value={currentMonthVal} 
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val) {
                                        const [yStr, mStr] = val.split('-');
                                        const year = Number(yStr);
                                        const month = Number(mStr);
                                        const startStr = `${yStr}-${mStr}-01`;
                                        const lastDay = new Date(year, month, 0).getDate();
                                        const endStr = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
                                        setDateRange({ start: startStr, end: endStr });
                                    } else {
                                        setDateRange({ start: '', end: '' });
                                    }
                                }}
                                className="bg-transparent border-none text-[10px] font-black text-amber-900 outline-none cursor-pointer pr-1"
                            >
                                <option value="" className="text-gray-500">快捷选月 (Select Month)...</option>
                                {monthsList.map(m => (
                                    <option key={m.value} value={m.value} className="text-gray-800 font-bold">
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {isBillingCapped && (
                            <button onClick={() => setDateRange({start: '2026-01-01', end: new Date().toISOString().split('T')[0]})} className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black shrink-0">查阅全年</button>
                        )}
                        {dateRange.start && <button onClick={() => setDateRange({start:'', end:''})} className="px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-[10px] rounded-lg shrink-0 flex items-center gap-1">✕ 清空日期</button>}
                    </div>
                </div>

                {/* Optional full custom Datepicker widgets */}
                {showDatePicker ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 animate-in slide-in-from-top-1 md:hidden">
                        <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="p-2 bg-white rounded-lg border text-xs font-bold" />
                        <span className="text-gray-400 font-bold">to</span>
                        <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="p-2 bg-white rounded-lg border text-xs font-bold" />
                        <button onClick={() => setShowDatePicker(false)} className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-black ml-auto">收起</button>
                    </div>
                ) : (
                    <div className="flex flex-row items-center justify-between text-[11px] font-black text-gray-400 gap-1.5 flex-wrap">
                        <button onClick={() => setShowDatePicker(true)} className="hover:text-black flex items-center gap-1 uppercase tracking-wider shrink-0 md:hidden"><Calendar size={12}/> {dateRange.start || dateRange.end ? `${dateRange.start || '始'} - ${dateRange.end || '末'}` : '自定义过滤日期范围'}</button>
                        {totalInvoicesOutstanding > 0 && <span className="text-red-500 shrink-0 md:ml-auto">累计未付款: RM {totalInvoicesOutstanding.toFixed(2)}</span>}
                    </div>
                )}
                
                {/* Row 3: Tabs + Select All */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-nowrap">
                        {TABS.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-3 md:px-6 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black border-b-2 md:border-b-4 transition-all whitespace-nowrap shrink-0 ${activeTab === tab.id ? tab.color : 'bg-white text-gray-400 border-transparent hover:bg-gray-50'}`}>{tab.label.split(' ')[0]}<span className="hidden md:inline"> {tab.label.split(' ').slice(1).join(' ')}</span>{activeTab === tab.id && <span className="bg-white/20 px-1 rounded text-[9px] ml-1">{filteredBills.length}</span>}</button>
                        ))}
                        <div className="h-4 w-px bg-gray-200 shrink-0 mx-0.5"></div>
                        {filteredBills.length > 0 && <button onClick={handleSelectAll} className={`px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all whitespace-nowrap shrink-0 ${selectedBillIds.size > 0 && selectedBillIds.size === filteredBills.length ? 'bg-[#1A1A1A] text-[#FFD700]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}><ListChecks size={12}/> {selectedBillIds.size > 0 ? '取消' : '全选'}</button>}
                        
                        <div className="relative shrink-0 ml-auto"><select value={selectedTag} onChange={e => setSelectedTag(e.target.value)} className="bg-gray-50 border-none rounded-lg pl-2 pr-6 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-[#FFD700] appearance-none"><option value="ALL">🔖 All Tags</option>{availableTags.map(t => <option key={t} value={t}>{t}</option>)}</select><div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><ChevronDown size={10}/></div></div>
                    </div>
                </div>
            </div>

            {/* === MAIN CONTENT === */}
            <div ref={mainScrollRef} className="mobile-fixed-actions-space flex-grow overflow-y-auto p-4 md:p-6 bg-[#F5F7FA] md:pb-32">
                {/* 📊 智能信息导览条 (Dynamic Filter Information Banner) */}
                {!loading && (
                    <>
                        {billTypeFilter === 'SALARY' && (
                            <div className="mb-4 bg-indigo-50/95 border border-indigo-200/60 rounded-xl p-3 md:p-4 flex flex-row items-center justify-between text-xs font-semibold text-indigo-950 gap-3 shadow-xs animate-in slide-in-from-top-1 duration-300 shrink-0">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl shrink-0">🧠</span>
                                    <div className="min-w-0">
                                        <p className="font-black text-indigo-950 truncate">当前正在只显示薪资与员工垫资记录 (共 {filteredBills.length} 笔)</p>
                                        <p className="text-[10px] text-indigo-800/90 truncate">常规商家账单及平台手续费已安全独立隐藏</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setBillTypeFilter('REGULAR')}
                                    className="px-3 py-1.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-800 rounded-lg text-[10px] font-black transition-all active:scale-95 shrink-0 shadow-sm"
                                >
                                    返回常规账单
                                </button>
                            </div>
                        )}

                        {billTypeFilter === 'PLATFORM' && (
                            <div className="mb-4 bg-amber-50/95 border border-amber-200/60 rounded-xl p-3 md:p-4 flex flex-row items-center justify-between text-xs font-semibold text-amber-950 gap-3 shadow-xs animate-in slide-in-from-top-1 duration-300 shrink-0">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl shrink-0">⚙️</span>
                                    <div className="min-w-0">
                                        <p className="font-black text-amber-950 truncate">当前仅显示外卖平台扣款或银行手续费记录 (共 {filteredBills.length} 笔)</p>
                                        <p className="text-[10px] text-amber-800/90 truncate">包括 ShopeeFood、FoodPanda 的广告/异常扣款和银行手续费记录</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setBillTypeFilter('REGULAR')}
                                    className="px-3 py-1.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-800 rounded-lg text-[10px] font-black transition-all active:scale-95 shrink-0 shadow-sm"
                                >
                                    返回常规账单
                                </button>
                            </div>
                        )}

                        {billTypeFilter === 'FIXED' && (
                            <div className="mb-4 bg-teal-50/95 border border-teal-200/60 rounded-xl p-3 md:p-4 flex flex-row items-center justify-between text-xs font-semibold text-teal-950 gap-3 shadow-xs animate-in slide-in-from-top-1 duration-300 shrink-0">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl shrink-0">📌</span>
                                    <div className="min-w-0">
                                        <p className="font-black text-teal-950 truncate">当前仅显示租金、水电等固定支出 (共 {filteredBills.length} 笔)</p>
                                        <p className="text-[10px] text-teal-800/90 truncate">常规账单、薪资发放及平台手续费已安全独立隐藏</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setBillTypeFilter('REGULAR')}
                                    className="px-3 py-1.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-800 rounded-lg text-[10px] font-black transition-all active:scale-95 shrink-0 shadow-sm"
                                >
                                    返回常规账单
                                </button>
                            </div>
                        )}

                        {viewMode === 'SUPPLIER_DETAIL' && selectedSupplierId && (
                            <div className="mb-4 bg-gradient-to-r from-red-50 to-amber-50 border border-red-200/80 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-1 duration-200">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                            对账单视图 / Supplier Statement
                                        </span>
                                        {totalInvoicesOutstanding > 0 ? (
                                            <span className="text-[9px] font-black text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                有未结应付款 Outstanding
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black text-green-800 bg-green-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                账目已结清 Settled
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 mt-1">
                                        🏢 {supplierById.get(selectedSupplierId)?.name || '未知商家'}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-bold">
                                        累计未付款 Outstanding: <span className="font-mono text-red-650 font-black text-sm">RM {totalInvoicesOutstanding.toFixed(2)}</span>
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 shrink-0">
                                    <button
                                        onClick={() => handleExportSupplierUnpaidPDF(supplierById.get(selectedSupplierId!)?.name || '')}
                                        className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-md border border-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                                    >
                                        <FileDown size={14} className="stroke-[3]"/>
                                        <span>批量导出未付账单 (Export Unpaid PDF)</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {loading ? (
                    <div className="flex items-center justify-center h-40"><Loader2 size={32} className="animate-spin text-gray-400"/></div>
                ) : filteredBills.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-300"><Filter size={64} className="mb-4 opacity-20"/><p className="font-black text-sm">没有找到相关账单</p></div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                        {filteredBills.map(bill => {
                            const isPaid = bill.paymentStatus === 'PAID';
                            const isOverdue = !isPaid && new Date() > new Date(bill.dueDate || '9999-12-31');
                            const sup = supplierByName.get(bill.company);
                            const isSelected = selectedBillIds.has(bill.id);
                            return (
                                <div key={bill.id} className={`bg-white rounded-2xl p-3 md:p-5 shadow-sm border-l-4 md:border-l-[6px] transition-all hover:shadow-lg group relative ${isPaid ? 'border-l-green-500' : isOverdue ? 'border-l-red-500' : 'border-l-orange-400'} ${isSelected ? 'ring-2 ring-offset-1 ring-[#FFD700]' : ''}`}>
                                    {/* Top: checkbox + date + link */}
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); toggleSelection(bill.id); }} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-[#1A1A1A] border-[#1A1A1A] text-[#FFD700]' : 'border-gray-300 bg-white'}`}>{isSelected && <CheckSquare size={12} strokeWidth={3}/>}</button>
                                            <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1"><Calendar size={9}/> {bill.time.split('T')[0]}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isPaid && !(bill.id.startsWith('recon_fee_') || ['BANK_FEE', 'MARKETING_FEE', 'PLATFORM_FEE_SHOPEE', 'PLATFORM_FEE_OTHER'].includes(bill.category)) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCardPVClick(bill); }}
                                                    disabled={isCardPVLoading === bill.id}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border transition-all active:scale-95 shrink-0 disabled:opacity-50 ${
                                                        expensesWithPV.has(bill.id)
                                                            ? 'text-[#E65100] bg-[#FFF3E0] border-[#FFB74D] hover:bg-[#FFE0B2]'
                                                            : 'text-gray-500 bg-gray-100 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                                    title={expensesWithPV.has(bill.id) ? "下载或打印已生成的付款凭单 (PV)" : "生成此账单的付款凭单 (PV)"}
                                                >
                                                    {isCardPVLoading === bill.id ? <Loader2 size={11} className="animate-spin"/> : <FileText size={11}/>}
                                                    <span className="text-[10px] font-bold">PV</span>
                                                </button>
                                            )}
                                            {isPaid && (bill.id.startsWith('recon_fee_') || ['BANK_FEE', 'MARKETING_FEE', 'PLATFORM_FEE_SHOPEE', 'PLATFORM_FEE_OTHER'].includes(bill.category)) && (
                                                <span className="text-[8px] font-bold text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-lg shrink-0 select-none cursor-help" title="系统核销手续费/抽佣费用，无需补开纸质 PV (System Auto Fee, No PV Required)">
                                                    无需凭单 (No PV)
                                                 </span>
                                            )}
                                            {bill.linkUrl && <a href={bill.linkUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg border border-blue-200 transition-all active:scale-95 shrink-0"><ExternalLink size={11}/><span className="text-[9px] font-bold">单据</span></a>}
                                        </div>
                                    </div>
                                    {/* Company + tags */}
                                    <div className="mb-2 cursor-pointer" onClick={() => toggleSelection(bill.id)}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-black text-sm md:text-lg text-blue-900 leading-tight truncate">{bill.company}</h4>
                                            {sup && <span className="bg-[#FFD700] text-black text-[9px] font-mono px-1.5 py-0.5 rounded font-black shrink-0">{sup.id}</span>}
                                        </div>
                                        {bill.paidBy && bill.paidBy !== 'COMPANY' && <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold inline-flex items-center gap-1 ${bill.isAdvancePayment ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}><User size={9}/> {bill.paidBy} {bill.isAdvancePayment ? '垫付' : ''}</span>}
                                        <div className="flex flex-wrap gap-1 mt-1 items-center">
                                            {bill.category && <span className="text-[8px] md:text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-100">{FLAT_CATEGORIES.find(c => c.id === bill.category)?.label.split('(')[0] || bill.category}</span>}
                                            {bill.category === 'BEVERAGE' && bill.beverageSubCategory && (
                                                <span className="text-[8px] md:text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-100">{BEVERAGE_SUBCAT_EMOJIS[bill.beverageSubCategory]} {BEVERAGE_SUBCAT_LABELS[bill.beverageSubCategory]}</span>
                                            )}
                                            {bill.category === 'INGREDIENT_SEAFOOD' && bill.seafoodSubCategory && (
                                                <span className="text-[8px] md:text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-100">{SEAFOOD_SUBCAT_EMOJIS[bill.seafoodSubCategory]} {SEAFOOD_SUBCAT_LABELS[bill.seafoodSubCategory]}</span>
                                            )}
                                            {bill.category === 'MARKETING' && bill.marketingSubCategory && (
                                                <span className="text-[8px] md:text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-100">{MARKETING_SUBCAT_EMOJIS[bill.marketingSubCategory]} {MARKETING_SUBCAT_LABELS[bill.marketingSubCategory]}</span>
                                            )}
                                            {bill.category === 'MARKETING' && bill.adChannel && (
                                                <span className="text-[8px] md:text-[9px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-bold border border-sky-100">{AD_CHANNEL_EMOJIS[bill.adChannel]} {AD_CHANNEL_LABELS[bill.adChannel]}</span>
                                            )}
                                            {bill.campaignTag && (
                                                <span className="text-[8px] md:text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold border border-purple-100">🏷️ {bill.campaignTag}</span>
                                            )}
                                            {(bill as any).invoiceRef && (
                                                <span className="text-[8px] md:text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-mono font-bold border border-purple-100" title="Invoice No.">
                                                    INV: {(bill as any).invoiceRef}
                                                </span>
                                            )}
                                            {isPaid && (
                                                <span className={`text-[8px] md:text-[9px] px-1.5 py-0.5 rounded font-bold border inline-flex items-center gap-1 shrink-0 ${
                                                    bill.paymentMethod === 'CASH' 
                                                        ? 'bg-emerald-55 text-emerald-700 border-emerald-250' 
                                                        : 'bg-blue-55 text-blue-700 border-blue-250'
                                                }`}>
                                                    {bill.paymentMethod === 'CASH' ? '💵 Cash' : '🏦 Online Transfer'}
                                                </span>
                                            )}
                                            {(bill.tags || []).slice(0,2).map(t => <span key={t} className="text-[8px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded font-bold">#{t}</span>)}
                                        </div>
                                    </div>
                                    {/* Amount row - inline instead of box */}
                                    <div className="flex items-center justify-between mb-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="text-[10px] text-gray-400 font-bold">
                                            <span>Total: RM {Number(bill.totalBillAmount || bill.amount || 0).toFixed(2)}</span>
                                            {bill.creditNote && bill.creditNote > 0 && (
                                                <span className="text-orange-500 ml-2">CN: -{Number(bill.creditNote).toFixed(2)}</span>
                                            )}
                                        </div>
                                        <div className={`text-sm font-black ${isPaid ? 'text-green-600' : 'text-red-600'}`}>
                                            RM {Number(bill.outstandingAmount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    {/* Action buttons */}
                                    <div className="flex items-center gap-2 mt-2">
                                        {!isPaid ? (
                                            <button 
                                                onClick={() => { setPayModalData(bill); setPayAmount(bill.outstandingAmount || 0); setPayMethod(''); }} 
                                                className="flex-grow bg-[#1A1A1A] text-[#FFD200] py-2.5 px-4 rounded-xl text-xs font-black border border-[#FFD200]/20 shadow-sm hover:bg-black transition-all active:scale-95"
                                            >
                                                Pay Now
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleUndoPayment(bill)} 
                                                className="flex-grow bg-emerald-50 text-emerald-700 border border-emerald-200 py-2.5 px-4 rounded-xl text-[10px] md:text-xs font-black hover:bg-emerald-100 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                                            >
                                                <RotateCcw size={12}/> Undo
                                            </button>
                                        )}
                                        
                                        <button 
                                            onClick={() => handleOpenForm(bill)} 
                                            className="h-10 w-10 flex items-center justify-center bg-gray-100 hover:bg-[#1A1A1A] hover:text-[#FFD200] text-gray-600 rounded-xl transition-all border border-gray-200 shrink-0 active:scale-95"
                                            title="编辑账单"
                                        >
                                            <Edit3 size={15}/>
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {/* Load More */}
                    {!dateRange.start && !dateRange.end && !searchId && !searchQuery && selectedTag === 'ALL' && activeTab === 'ALL' && viewMode !== 'SUPPLIER_DETAIL' && displayLimit < totalLoaded && (
                        <div className="flex flex-col items-center mt-6 gap-2">
                            <p className="text-[10px] text-gray-400 font-bold">显示 {Math.min(displayLimit, totalLoaded)} / {totalLoaded} 笔账单</p>
                            <button onClick={() => setDisplayLimit(prev => prev + 30)} className="px-6 py-3 bg-white border-2 border-gray-200 hover:border-[#FFD700] text-[#1A1A1A] rounded-xl text-xs font-black shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center gap-2">
                                <RefreshCw size={14}/> 加载更多 (Load 30 More)
                            </button>
                        </div>
                    )}
                    </>
                )}
            </div>

            {/* 👑 === MOBILE FAB (+) === 悬浮录入按钮（手机专属） */}
            {showFab && (
                <button
                    onClick={() => handleOpenForm()}
                    className="md:hidden absolute right-4 z-30 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all ring-4 ring-blue-600/20"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
                    aria-label="录入新账单"
                >
                    <Plus size={28} strokeWidth={3}/>
                </button>
            )}

            {/* === FOOTER ACTION PANEL === */}
            <div className="bg-white border-t border-gray-200 shrink-0 w-full z-40 safe-area-bottom">
                <div className="px-3 py-2.5 md:p-4 flex justify-between items-center">
                    <div className="text-[10px] md:text-xs font-bold text-gray-500 shrink-0 font-sans">共 {stats.count} 笔</div>
                    <div className="flex gap-3 md:gap-6 text-right">
                        {stats.cn > 0 && <div><div className="text-[9px] text-gray-400 uppercase font-black">Total Credit</div><div className="text-sm font-black text-orange-600">RM {stats.cn.toFixed(2)}</div></div>}
                        <div><div className="text-[9px] text-gray-400 uppercase font-black">Total Amount</div><div className="text-sm font-black text-[#1A1A1A]">RM {stats.total.toFixed(2)}</div></div>
                        <div><div className="text-[9px] text-gray-400 uppercase font-black">Total Outstanding</div><div className="text-lg font-black text-red-600">RM {stats.outstanding.toFixed(2)}</div></div>
                    </div>
                </div>
            </div>

            {/* === FLOATING BATCH ACTION BAR === */}
            {selectedBillIds.size > 0 && (
                <div className="fixed bottom-6 md:bottom-10 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl lg:max-w-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <div className="bg-[#1C1C1E]/95 backdrop-blur-md text-white p-3 md:p-4 rounded-2xl shadow-2xl flex flex-col md:flex-row justify-between items-center gap-3 border-2 border-[#FFD700]">
                        <div className="flex items-center w-full justify-between md:w-auto md:justify-start gap-3 md:gap-4">
                            <div className="flex items-center gap-2 md:gap-4">
                                <div className={`text-black w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-black animate-bounce shadow-lg text-sm md:text-base ${allSelectedPaid ? 'bg-emerald-400' : 'bg-[#FFD700]'}`}>{selectedBillIds.size}</div>
                                <div>
                                    <p className="text-[9px] md:text-[10px] text-gray-400 uppercase font-bold tracking-widest leading-none mb-1">
                                        {allSelectedPaid ? 'Paid Total' : 'Selected Outstanding'}
                                    </p>
                                    <p className={`text-sm md:text-xl font-mono font-black leading-none ${allSelectedPaid ? 'text-emerald-400' : 'text-[#FFD700]'}`}>
                                        RM {(allSelectedPaid ? batchPaidAmount : batchOutstandingAmount).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedBillIds(new Set())} className="p-2 text-gray-300 hover:text-white rounded-xl bg-white/10 active:scale-95" title="Clear selection"><X size={16}/></button>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <button onClick={() => setSelectedBillIds(new Set())} className="hidden md:block px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 transition-colors">取消</button>

                            <button onClick={() => setIsBatchDeleteModalOpen(true)} className="flex-1 md:flex-none justify-center bg-red-500/15 hover:bg-red-500/25 text-red-400 px-3 py-2.5 rounded-xl text-[11px] md:text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 border border-red-500/30" title="Delete Selected">
                                <Trash2 size={15}/> <span className="inline">删除</span>
                            </button>

                            <button onClick={() => handleExportPDF(allBills.filter(b => selectedBillIds.has(b.id)))} disabled={isGeneratingPdf} className="flex-1 md:flex-none justify-center bg-white/15 hover:bg-white/25 text-[#FFD700] px-3 py-2.5 rounded-xl text-[11px] md:text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50" title="Export Selected PDF">
                                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={15}/>} <span className="inline">PDF</span>
                            </button>

                            {allSelectedPaid ? (
                                <button onClick={handleBatchExportPV} disabled={isGeneratingPdf || !!batchPVProgress} className="flex-[2] md:flex-none justify-center bg-amber-400 text-black px-4 py-2.5 rounded-xl text-xs font-black shadow-lg hover:bg-amber-300 transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50">
                                    <FileText size={15}/> 批量凭单
                                </button>
                            ) : (
                                <button onClick={() => {setIsBatchPayModalOpen(true); setPayMethod('');}} className="flex-[2] md:flex-none justify-center bg-[#FFD700] text-black px-4 py-2.5 rounded-xl text-xs font-black shadow-lg hover:bg-[#FFE66D] transition-all active:scale-95 flex items-center gap-1.5">
                                    <CheckCircle2 size={15}/> 批量支付
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* BATCH PAY MODAL */}
            <BatchPayModal
                isOpen={isBatchPayModalOpen}
                onClose={() => setIsBatchPayModalOpen(false)}
                selectedCount={selectedBillIds.size}
                batchOutstandingAmount={batchOutstandingAmount}
                payMethod={payMethod}
                setPayMethod={setPayMethod}
                onConfirm={(data) => handleBatchPay(data)}
                isSaving={isSaving}
            />

            {/* BATCH DELETE MODAL */}
            <BatchDeleteModal
                isOpen={isBatchDeleteModalOpen}
                onClose={() => setIsBatchDeleteModalOpen(false)}
                selectedCount={selectedBillIds.size}
                batchInvoiceTotal={batchInvoiceTotal}
                onConfirm={handleBatchDelete}
                isSaving={isSaving}
            />

            {/* BILL FORM SIDE DRAWER */}
            <BillFormDrawer
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                editingBill={editingBill}
                setEditingBill={setEditingBill}
                suppliers={suppliers}
                employees={employees}
                isSaving={isSaving}
                onSave={handleSave}
                onDelete={handleDeleteBill}
                generatePV={formGeneratePV}
                setGeneratePV={setFormGeneratePV}
                pvTitle={formPVTitle}
                setPvTitle={setFormPVTitle}
                onNavigateToSelfVoucher={(prefill) => {
                    setIsFormOpen(false); // Close current invoice drawer first
                    if (onNavigateToSelfVoucher) {
                        onNavigateToSelfVoucher(prefill);
                    }
                }}
            />

            {/* QUICK PAY OUTSTANDING MODAL */}
            <QuickPayModal
                bill={payModalData}
                payAmount={payAmount}
                setPayAmount={setPayAmount}
                payMethod={payMethod}
                setPayMethod={setPayMethod}
                onClose={() => { setPayModalData(null); setPayMethod(''); }}
                onConfirm={handleQuickPay}
            />

            {/* BATCH MIGRATION CATEGORY TOOL */}
            <ApMigrationTool
                isOpen={showMigrationTool}
                onClose={() => setShowMigrationTool(false)}
                unCategorizedMarketingBills={unCategorizedMarketingBills}
                migrationData={migrationData}
                setMigrationData={setMigrationData}
                onSave={handleMigrationSave}
                isSaving={isSaving}
            />

            {/* HIDDEN PRINT TEMPLATE */}
            <div style={{ position: 'fixed', top: '0px', left: '0px', zIndex: -9999, pointerEvents: 'none' }}>
                <div id="accounts-payable-export-root" ref={actualPrintRef} className="w-[794px] min-h-[1123px] bg-white p-12 text-black font-sans relative">
                    {printMode === 'SUPPLIER_UNPAID' ? (
                        /* 🧾 供应商未付对账单专属模板 (Supplier Unpaid Statement Template) */
                        <>
                            <div className="flex justify-between items-start border-b-4 border-rose-950 pb-5 mb-8">
                                <div>
                                    <h1 className="text-2xl font-black uppercase tracking-wider text-rose-950 mb-1">未付款账单对账单</h1>
                                    <p className="text-[10px] font-black text-rose-800 uppercase tracking-widest">Unpaid Statement of Accounts</p>
                                    <p className="text-[9px] text-gray-400 font-bold mt-2 font-mono">
                                        导出日期 Date Generated: {new Date().toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-black text-rose-950">{printData[0]?.company || '供应商'}</p>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">金莲记 KIM LIAN KEE</p>
                                    <p className="text-[9px] text-gray-400 font-medium">Finance Ledger Statement</p>
                                </div>
                            </div>

                            {/* 📊 统计区块 */}
                            <div className="grid grid-cols-3 gap-4 mb-8 text-center bg-rose-50/40 p-4 rounded-xl border border-rose-100">
                                <div>
                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">未结单数 Count</p>
                                    <p className="text-lg font-black text-rose-950">{printData.length} 笔</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">账单原始总额 Total</p>
                                    <p className="text-lg font-black text-stone-800 font-mono">RM {printData.reduce((acc,b)=>acc+(b.totalBillAmount || b.amount || 0),0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-rose-800 uppercase tracking-widest mb-1">未付款总额 Outstanding</p>
                                    <p className="text-lg font-black text-red-650 font-mono">RM {printData.reduce((acc,b)=>acc+(b.outstandingAmount||0),0).toFixed(2)}</p>
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
                                    {printData.map((bill, i) => (
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
                                            <td className="p-2.5 text-right font-mono text-orange-650 font-bold">{(bill.creditNote || 0).toFixed(2)}</td>
                                            <td className="p-2.5 text-right font-mono font-black text-red-650 bg-red-50/30">{(bill.outstandingAmount || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* ✍️ 签名确认区域 */}
                            <div className="mt-16 pt-8 border-t border-gray-150 flex justify-between gap-12">
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
                        </>
                    ) : (
                        /* 🗃️ 默认通用 AP 对账单模板 */
                        <>
                            <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                                <div><h1 className="text-4xl font-black uppercase tracking-widest mb-1">Accounts Payable</h1><p className="text-sm font-bold text-gray-500">Generated: {new Date().toLocaleDateString()}</p></div>
                                <div className="text-right"><p className="text-xl font-black">KIM LIAN KEE</p><p className="text-xs font-bold text-gray-400">Finance Department</p></div>
                            </div>
                            <div className="grid grid-cols-4 gap-4 mb-8 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Bills</p><p className="text-xl font-black">{printData.length}</p></div>
                                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total</p><p className="text-xl font-black">RM {printData.reduce((acc,b)=>acc+(b.totalBillAmount || b.amount || 0),0).toFixed(2)}</p></div>
                                <div><p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-1">Total CN</p><p className="text-xl font-black text-orange-600">RM {printData.reduce((acc,b)=>acc+(b.creditNote||0),0).toFixed(2)}</p></div>
                                <div><p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Balance Due</p><p className="text-xl font-black text-red-600">RM {printData.reduce((acc,b)=>acc+(b.outstandingAmount||0),0).toFixed(2)}</p></div>
                            </div>
                            <table className="w-full text-left text-[10px]">
                                <thead className="bg-black text-white">
                                    <tr>
                                        <th className="p-2 uppercase font-bold">Date</th>
                                        <th className="p-2 uppercase font-bold">Supplier / Note</th>
                                        <th className="p-2 uppercase font-bold text-right">Invoice</th>
                                        <th className="p-2 uppercase font-bold text-right">CN</th>
                                        <th className="p-2 uppercase font-bold text-right">Due</th>
                                        <th className="p-2 uppercase font-bold text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {printData.map((bill, i) => (
                                        <tr key={i} className="border-b border-gray-100">
                                            <td className="p-2 font-mono">{bill.time.split('T')[0]}</td>
                                            <td className="p-2">
                                                <div className="font-bold">{bill.company}</div>
                                                <div className="text-[8px] text-gray-400">{bill.note?.slice(0, 40) || '-'}</div>
                                            </td>
                                            <td className="p-2 text-right font-mono">{(bill.totalBillAmount || bill.amount || 0).toFixed(2)}</td>
                                            <td className="p-2 text-right font-mono text-orange-600">{(bill.creditNote || 0).toFixed(2)}</td>
                                            <td className="p-2 text-right font-mono font-bold">{(bill.outstandingAmount || 0).toFixed(2)}</td>
                                            <td className="p-2 text-center font-bold uppercase text-[8px]">{bill.paymentStatus}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between items-end">
                                <div><p className="text-[10px] font-bold uppercase">Prepared By</p><div className="w-48 h-px bg-gray-300 mt-8"></div></div>
                                <div><p className="text-[10px] font-bold uppercase">Approved By</p><div className="w-48 h-px bg-gray-300 mt-8"></div></div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            {/* 👑 HIDDEN VOUCHER TEMPLATE (PV 系统) */}
            {printingVoucher && (() => {
                return (
                    <div style={{ 
                        position: 'fixed', 
                        top: '0px', 
                        left: '0px', 
                        width: '794px', 
                        height: 'auto', 
                        overflow: 'visible', 
                        pointerEvents: 'none',
                        background: '#ffffff',
                        zIndex: -9999
                    }}>
                        <PaymentVoucherTemplate ref={voucherRef} voucher={printingVoucher} />
                    </div>
                );
            })()}

            {/* 👑 PV 历史 modal */}
            {showPVHistory && (
                <PaymentVoucherHistory
                    onClose={() => setShowPVHistory(false)}
                    onReprint={(pv) => exportVoucherPDF(pv)}
                />
            )}
            {/* 👑 v2: 补开旧凭单 */}
            {showBackdate && (
                <BackdatePVModule
                    onClose={() => setShowBackdate(false)}
                    onReprint={(pv) => exportVoucherPDF(pv)}
                />
            )}

            {/* 👑 PV 生成成功提示 */}
            {pvJustCreated && (
                <div className="fixed inset-0 bg-black/70 z-[210] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setPvJustCreated(null)}>
                    <div
                        className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl border-t-4 border-[#FFD700] animate-in slide-in-from-bottom md:zoom-in-95 duration-300 text-center"
                        onClick={e => e.stopPropagation()}
                        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                        <div className="w-14 h-14 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <FileText size={28} />
                        </div>
                        <h3 className="font-black text-lg text-[#1A1A1A] mb-1">付款凭单已生成</h3>
                        <p className="text-2xl font-mono font-black text-[#1A1A1A] my-2">{pvJustCreated.pvNumber}</p>
                        <p className="text-xs text-gray-500 font-bold mb-5">
                            {pvJustCreated.payeeName} · RM {pvJustCreated.totalAmount.toFixed(2)}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setPvJustCreated(null)}
                                className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200"
                            >
                                稍后再说
                            </button>
                            <button
                                onClick={() => { const pv = pvJustCreated; setPvJustCreated(null); exportVoucherPDF(pv); }}
                                className="py-3 bg-[#1A1A1A] text-[#FFD700] font-black rounded-xl text-xs shadow-lg hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <FileDown size={16} /> 下载 PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 👑 v3: 卡片触发的单笔生成 PV 对话框 */}
            {generatePVForBill && (
                <div className="fixed inset-0 bg-black/70 z-[210] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setGeneratePVForBill(null)}>
                    <div
                        className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl border-t-4 border-amber-400 animate-in slide-in-from-bottom md:zoom-in-95 duration-300"
                        onClick={e => e.stopPropagation()}
                        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <History size={28} />
                        </div>
                        <h3 className="font-black text-lg text-[#1A1A1A] mb-1 text-center">为此账单补开 PV</h3>
                        <p className="text-xs text-gray-500 font-bold mb-4 text-center">
                            {generatePVForBill.company} · RM {(generatePVForBill.amount || 0).toFixed(2)}
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 space-y-3">
                            <div>
                                <label className="text-[10px] font-black text-amber-700 uppercase mb-1.5 block">
                                    凭单纸张标题 (Voucher Title)
                                </label>
                                <select
                                    value={pvVoucherTitle}
                                    onChange={e => setPvVoucherTitle(e.target.value)}
                                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-bold outline-none cursor-pointer"
                                >
                                    <option value="AUTO">💡 智能自动识别 (Cash➔CASH VOUCHER, Bank➔PAYMENT VOUCHER)</option>
                                    <option value="CASH VOUCHER">💵 CASH VOUCHER (现金凭单)</option>
                                    <option value="CASH BILL">🧾 CASH BILL (现金账单)</option>
                                    <option value="PAYMENT VOUCHER">🏦 PAYMENT VOUCHER (付款凭单)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-amber-700 uppercase mb-1.5 block">
                                    PV 日期 (对账银行 statement)
                                </label>
                                <input
                                    type="date"
                                    value={pvGenerateDate}
                                    onChange={e => setPvGenerateDate(e.target.value)}
                                    className="w-full p-2.5 bg-white border border-amber-350 rounded-lg text-sm font-black outline-none focus:border-amber-500"
                                    style={{ fontSize: 16 }}
                                />
                                <p className="text-[9px] text-amber-600 mt-1.5 italic">
                                    默认是 invoice 日期。如果实际付款日不同,请改成银行扣款的那天。
                                </p>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-4 text-center italic">
                            生成的 PV 会有 "BACKDATED" 水印,锁定后只能作废不能编辑。
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setGeneratePVForBill(null)}
                                className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSingleBackdatePV}
                                disabled={isCardPVLoading === generatePVForBill.id}
                                className="py-3 bg-amber-400 text-black font-black rounded-xl text-xs shadow-lg hover:bg-amber-300 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isCardPVLoading === generatePVForBill.id ? <Loader2 className="animate-spin w-4 h-4"/> : <FileDown size={16}/>}
                                生成并下载
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 👑 v4: 批量导出 PV - 进度弹窗 */}
            {batchPVProgress && (
                <div className="fixed inset-0 bg-black/70 z-[220] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-8 shadow-2xl text-center max-w-sm w-full">
                        <Loader2 size={40} className="animate-spin text-amber-500 mx-auto mb-3"/>
                        <h3 className="font-black text-base text-[#1A1A1A] mb-2">{batchPVProgress.phase}</h3>
                        <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-amber-500 h-full transition-all duration-300"
                                style={{ width: `${(batchPVProgress.current / Math.max(batchPVProgress.total, 1)) * 100}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-500 font-bold mt-2 font-mono">
                            {batchPVProgress.current} / {batchPVProgress.total}
                        </p>
                    </div>
                </div>
            )}

            {/* 👑 v4: 批量导出 PV - 缺失 PV 确认对话框 */}
            {batchPVMissingDialog && (
                <div className="fixed inset-0 bg-black/70 z-[215] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setBatchPVMissingDialog(null)}>
                    <div
                        className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl border-t-4 border-amber-400 animate-in slide-in-from-bottom md:zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto refine-scroll"
                        onClick={e => e.stopPropagation()}
                        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <History size={28}/>
                        </div>
                        <h3 className="font-black text-lg text-[#1A1A1A] mb-1 text-center">
                            {batchPVMissingDialog.bills.length} 张账单没有 PV
                        </h3>
                        <p className="text-xs text-gray-500 font-bold mb-4 text-center">
                            请选择如何为这些账单补开付款凭单 (PV)：
                        </p>

                        {/* 开单方案切换器 */}
                        <div className="grid grid-cols-3 bg-gray-100 p-1 rounded-xl mb-4 gap-1">
                            <button
                                type="button"
                                onClick={() => setPvMergeMode('separate')}
                                className={`py-2 text-[10px] md:text-xs font-black rounded-lg transition-all flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1 ${pvMergeMode === 'separate' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <span>📋</span>
                                <span className="scale-[0.9] md:scale-100">逐项单开</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPvMergeMode('group_vendor')}
                                className={`py-2 text-[10px] md:text-xs font-black rounded-lg transition-all flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1 ${pvMergeMode === 'group_vendor' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <span>🤝</span>
                                <span className="scale-[0.9] md:scale-100 font-black">同商家合并</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPvMergeMode('merge')}
                                className={`py-2 text-[10px] md:text-xs font-black rounded-lg transition-all flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1 ${pvMergeMode === 'merge' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <span>🪙</span>
                                <span className="scale-[0.9] md:scale-100 font-black">零用金</span>
                            </button>
                        </div>

                        {/* 方案说明/配置 */}
                        {pvMergeMode === 'separate' && (
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-[11px] font-bold text-amber-800 mb-4 animate-in fade-in duration-200 leading-relaxed">
                                💡 <strong>分开放单：</strong>系统将针对每一张缺乏 PV 的账单，使用原商户名单独生成专属的 A4 付款凭单，全部在一份 PDF 中每页单开。
                            </div>
                        )}

                        {pvMergeMode === 'group_vendor' && (
                            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-[11px] font-bold text-emerald-800 mb-4 animate-in fade-in duration-200 leading-relaxed">
                                💡 <strong>同商家合并：</strong>根据【商家/供应商名称】归类。同一个商家的多张账单会自动编入<strong>一张付款凭单 (PV)</strong> 中（多行明细），并打进 PDF，极佳的对账与省纸体验。
                            </div>
                        )}

                        {pvMergeMode === 'merge' && (
                            <div className="space-y-3.5 mb-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-in fade-in duration-200 border-none">
                                <div className="text-[11px] font-bold text-indigo-800 leading-relaxed">
                                    💡 <strong>合并零用金：</strong>适合小额杂支或个人报销。不分商家，将所有缺失的账单合并并入<strong>一张自定义付款人</strong>的付款凭单（PV）中。
                                </div>
                                <div className="border-t border-indigo-100 pt-2">
                                    <label className="text-[10px] font-bold text-indigo-950 uppercase mb-1 block">
                                        领款方 / 报销方 (Payee Reimbursement)
                                    </label>
                                    <select 
                                        className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-xs font-black outline-none cursor-pointer focus:border-indigo-500" 
                                        value={mergePayeeName === 'Petty Cash (零用金)' ? 'PETTY_CASH' : employees.find(e => e.name === mergePayeeName) ? mergePayeeName : 'CUSTOM'} 
                                        onChange={e => {
                                            const v = e.target.value;
                                            if (v === 'PETTY_CASH') {
                                                setMergePayeeName('Petty Cash (零用金)');
                                            } else if (v === 'CUSTOM') {
                                                setMergePayeeName('');
                                            } else {
                                                setMergePayeeName(v);
                                            }
                                        }}
                                    >
                                        <option value="PETTY_CASH">💵 零用金 (Petty Cash)</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.name}>👤 职工: {emp.name}</option>
                                        ))}
                                        <option value="CUSTOM">✍️ 自定义商家/收款方</option>
                                    </select>
                                    
                                    {(!employees.some(emp => emp.name === mergePayeeName) && mergePayeeName !== 'Petty Cash (零用金)') && (
                                        <input 
                                            type="text" 
                                            className="w-full mt-2 p-2.5 bg-white border border-indigo-200 rounded-xl text-xs font-black focus:outline-none focus:ring-2 focus:ring-indigo-100 text-indigo-950"
                                            value={mergePayeeName} 
                                            onChange={e => setMergePayeeName(e.target.value)} 
                                            placeholder="请输入自定义报销人或商家名称"
                                        />
                                    )}
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-indigo-950 uppercase mb-1.5 block">部分/零用金支付方式</label>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => setMergePaymentMethod('CASH')} 
                                            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border ${mergePaymentMethod === 'CASH' ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A] shadow-md' : 'bg-white text-gray-500 border-indigo-100 hover:bg-indigo-50'}`}
                                        >
                                            💵 Cash 现金
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => setMergePaymentMethod('BANK_TRANSFER')} 
                                            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border ${mergePaymentMethod === 'BANK_TRANSFER' ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A] shadow-md' : 'bg-white text-gray-500 border-indigo-100 hover:bg-indigo-50'}`}
                                        >
                                            🏦 Bank 转账
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 👑 凭单标题选择器 */}
                        <div className="bg-indigo-50/40 border border-indigo-100 p-3 rounded-xl mb-3.5 animate-in fade-in">
                            <label className="text-[10px] font-black text-indigo-950 uppercase mb-1.5 block flex items-center gap-1">
                                🏷️ 凭单标题 (Voucher Title)
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBatchVoucherTitle('PAYMENT VOUCHER')}
                                    className={`py-2 rounded-xl text-xs font-black transition-all border ${batchVoucherTitle === 'PAYMENT VOUCHER' ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A] shadow-md' : 'bg-white text-gray-500 border-indigo-100 hover:bg-indigo-50'}`}
                                >
                                    Payment Voucher
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBatchVoucherTitle('CASH VOUCHER')}
                                    className={`py-2 rounded-xl text-xs font-black transition-all border ${batchVoucherTitle === 'CASH VOUCHER' ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A] shadow-md' : 'bg-white text-gray-500 border-indigo-100 hover:bg-indigo-50'}`}
                                >
                                    Cash Voucher
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBatchVoucherTitle('AUTO')}
                                    className={`py-2 rounded-xl text-xs font-black transition-all border ${batchVoucherTitle === 'AUTO' ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A] shadow-md' : 'bg-white text-gray-550 border-indigo-100 hover:bg-indigo-50'}`}
                                >
                                    Auto 自动
                                </button>
                            </div>
                            <p className="text-[9px] text-indigo-800 mt-1.5 font-bold leading-normal">
                                * 选择导出的明细凭单顶部大标题。系统默认选用 <strong>PAYMENT VOUCHER</strong>，也可以更改。
                            </p>
                        </div>

                        {/* 📅 自定义凭单付款日期 */}
                        <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl mb-4">
                            <label className="text-[10px] font-black text-amber-950 uppercase mb-1.5 block flex items-center gap-1">
                                📅 凭单付款日期 (Voucher Date)
                            </label>
                            <input 
                                type="date" 
                                className="w-full p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-black outline-none focus:border-amber-500 text-gray-800"
                                value={batchPVBackdateDate}
                                onChange={e => setBatchPVBackdateDate(e.target.value)}
                            />
                            <p className="text-[9px] text-amber-800 mt-1.5 font-bold leading-normal">
                                * 系统自动推荐了所选账单的最晚日期。您可以点击并自行为这些补开凭单调整实际需要的付款核销日期。
                            </p>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
                            <p className="text-[9px] font-bold text-gray-500 uppercase mb-2">本次补开明细 ({batchPVMissingDialog.bills.length} 笔)</p>
                            {batchPVMissingDialog.bills.map(b => (
                                <div key={b.id} className="flex justify-between py-1 text-[11px] font-bold border-b border-gray-100 last:border-b-0 text-gray-700">
                                    <span className="truncate flex-1">{b.company || '未知商户'}</span>
                                    <span className="text-gray-400 ml-2 shrink-0">{(b.paymentDate || b.time || '').split('T')[0]}</span>
                                    <span className="font-mono text-[#1A1A1A] ml-2 shrink-0">RM {((b.totalBillAmount || b.amount || 0) - (b.creditNote || 0)).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        {batchPVMissingDialog.existingPVs.length > 0 && (
                            <p className="text-[10px] text-emerald-700 mb-3 text-center font-bold">
                                + 已有 {batchPVMissingDialog.existingPVs.length} 张独立 PV 会原样打包进 PDF
                            </p>
                        )}

                        <p className="text-[10px] text-gray-400 mb-4 text-center italic">
                            补开的 PV 均会包含 "BACKDATED" 标识以保持审计合规。
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setBatchPVMissingDialog(null)}
                                className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200"
                            >
                                取消
                            </button>
                            <button
                                onClick={
                                    pvMergeMode === 'merge' 
                                        ? handleConfirmMergePettyCash 
                                        : pvMergeMode === 'group_vendor' 
                                        ? handleConfirmGroupVendorPVs 
                                        : handleConfirmAutoBackdate
                                }
                                className="py-3 bg-amber-400 text-black font-black rounded-xl text-xs shadow-lg hover:bg-amber-300 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <FileDown size={16}/> {pvMergeMode === 'merge' ? '合并导出 A4 PV' : pvMergeMode === 'group_vendor' ? '按供应商合并导出' : '分别补开并导出'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🤖 智能对账中转站 Modal (全新物理解析加固形态) */}
            {isMatchModalOpen && aiScannedData && (() => {
                const scannedVendorKey = normalizeVendorForMatch(aiScannedData.vendor);
                const scannedAmountCents = toMoneyCents(aiScannedData.amount);
                const scannedInvoiceNo = String(aiScannedData.invoice_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                const allPendingBills = allBills.filter(b => b.paymentStatus !== 'PAID');
                const matchedExistingBills = allPendingBills
                    .map(bill => {
                        const billVendorKey = normalizeVendorForMatch(bill.company);
                        const billAmountCents = getBillMatchAmount(bill);
                        const billInvoiceNo = String(bill.invoiceRef || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const vendorMatches = Boolean(scannedVendorKey && billVendorKey) && (
                            billVendorKey.includes(scannedVendorKey) || scannedVendorKey.includes(billVendorKey)
                        );
                        const amountDifferenceCents = scannedAmountCents !== null && billAmountCents !== null
                            ? Math.abs(scannedAmountCents - billAmountCents) : Number.POSITIVE_INFINITY;
                        const amountMatches = amountDifferenceCents <= 2;
                        const invoiceMatches = Boolean(scannedInvoiceNo && billInvoiceNo && scannedInvoiceNo === billInvoiceNo);
                        const score = (vendorMatches ? 50 : 0) + (amountMatches ? 40 : 0) + (invoiceMatches ? 100 : 0);
                        return { bill, score, vendorMatches, amountMatches, invoiceMatches, amountDifferenceCents };
                    })
                    .filter(match => match.invoiceMatches || (match.vendorMatches && match.amountMatches))
                    .sort((a, b) => b.score - a.score || a.amountDifferenceCents - b.amountDifferenceCents)
                    .map(match => match.bill);
                const searchedPendingBills = allPendingBills.filter(b => {
                    if (!reconSearch.trim()) return true;
                    const query = reconSearch.toLowerCase();
                    return (b.company || '').toLowerCase().includes(query) || (b.invoiceRef || '').toLowerCase().includes(query);
                });
                const displayedBills = reconShowAll ? searchedPendingBills : matchedExistingBills;
                
                return (
                    <div className="fixed inset-0 bg-black/80 z-[180] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full max-w-6xl h-[88vh] rounded-[24px] overflow-hidden flex flex-col shadow-[0_28px_90px_rgba(0,0,0,0.35)] border border-white/70">
                            
                            {/* Header 顶栏 */}
                            <div className="bg-[#111111] text-white px-5 py-4 flex justify-between items-center shrink-0 border-b-[3px] border-[#FFD200]">
                                <div>
                                    <h3 className="font-serif font-black text-sm md:text-lg flex items-center gap-2">🤖 AP 智能对账中转站</h3>
                                    <p className="text-[10px] text-gray-400 font-mono">AI 提取预览：{aiScannedData.vendor} · 金额: RM {Number(aiScannedData.amount).toFixed(2)}</p>
                                    <p className="text-[9px] text-[#FFD200]/90 font-bold mt-0.5">智能配对条件：供应商名称 + 金额（允许 ±RM0.02）或 Invoice No. 完全一致</p>
                                </div>
                                <button onClick={() => setIsMatchModalOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white"><X size={18}/></button>
                            </div>

                            {/* 🚨 去重硬拦截：如果 AI 验证此单为指纹完全一致的重复件，置顶红色横幅警告 */}
                            {aiScannedData.isDuplicate && (
                                <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center gap-2 text-red-700 animate-pulse shrink-0">
                                    <AlertTriangle size={16} className="shrink-0 text-red-600"/>
                                    <span className="text-[11px] font-black uppercase tracking-wider">
                                        🚨 [重复单据警告]：系统发现暂存区已存在一张数据指纹完全一致的单据！请格外核对是否重复上传！
                                    </span>
                                </div>
                            )}

                            {/* 工作台主体 */}
                            <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-gray-100">
                                
                                {/* 左侧面板：发票高清看图核对 */}
                                <div className="lg:col-span-5 border-r border-gray-200 flex flex-col h-full bg-[#1A1A1A]">
                                    <div className="bg-gray-900 text-white px-3 py-2 text-[10px] font-black uppercase tracking-wider shrink-0 flex items-center justify-between border-b border-gray-800">
                                        <div className="flex items-center gap-1.5">
                                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            <span>暂存区单据原图核对</span>
                                        </div>
                                    </div>
                                    
                                    <iframe 
                                        src={aiScannedData.tempLink ? aiScannedData.tempLink.replace('/view', '/preview') : ''} 
                                        className="w-full flex-grow border-0 bg-gray-900"
                                        allow="autoplay"
                                    />

                                    {/* 待确认保留 / 废单隔离 */}
                                    <div className="p-3 bg-[#111111] border-t border-white/10 grid grid-cols-2 gap-3 shrink-0">
                                        <button
                                            type="button"
                                            disabled={isHoldingFile || isDeletingFile}
                                            onClick={() => handleHoldPendingFile(
                                                aiScannedData.fileId,
                                                aiScannedData.isDuplicate
                                                    ? 'POSSIBLE_DUPLICATE'
                                                    : aiScannedData.needsReview
                                                    ? (aiScannedData.reviewReason === 'INVALID_OR_MISSING_DATE' ? 'UNCLEAR_DATE' : 'MANUAL_REVIEW_REQUIRED')
                                                    : 'NO_AP_MATCH'
                                            )}
                                            className="min-h-[48px] bg-[#FFD200] hover:bg-[#FFE14D] border border-[#FFD200] text-[#111111] py-3 px-4 rounded-[14px] font-black text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_6px_18px_rgba(255,210,0,0.18)]"
                                        >
                                            {isHoldingFile ? <Loader2 size={15} className="animate-spin"/> : <Archive size={15}/>}
                                            <span>{isHoldingFile ? '正在移入保留区...' : '移入保留区'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isDeletingFile || isHoldingFile}
                                            onClick={() => handleDeletePendingFile(aiScannedData.fileId)}
                                            className="min-h-[48px] bg-white/5 hover:bg-[#EF4444] border border-[#EF4444]/45 text-[#FF7A7A] hover:text-white py-3 px-4 rounded-[14px] font-black text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isDeletingFile ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                                            <span>{isDeletingFile ? '正在废弃...' : '废弃账单'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 对账路向选择 */}
                                <div className="lg:col-span-7 p-6 flex flex-col gap-6 overflow-y-auto h-full">
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-black text-[#111111] uppercase tracking-widest flex items-center gap-1">⬆️ 关联系统内已有账单 (PO单盘点存根)</h4>
                                        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2 max-h-[350px] overflow-y-auto">
                                            <div className="flex border-b border-gray-100 pb-2 mb-2 gap-2">
                                                <button type="button" onClick={() => setReconShowAll(false)} className={`flex-1 py-1.5 px-2 text-[11px] font-black rounded-lg transition-all ${!reconShowAll ? 'bg-[#111111] text-[#FFD200] border border-[#111111] shadow-sm'  : 'text-gray-400'}`}>✨ 智能相似商户 ({matchedExistingBills.length})</button>
                                                <button type="button" onClick={() => setReconShowAll(true)} className={`flex-1 py-1.5 px-2 text-[11px] font-black rounded-lg transition-all ${reconShowAll ? 'bg-[#111111] text-[#FFD200] border border-[#111111] shadow-sm'  : 'text-gray-400'}`}>🔎 我来自主寻找全部待付 ({allPendingBills.length})</button>
                                            </div>

                                            {reconShowAll && (
                                                <div className="mb-3">
                                                    <input type="text" placeholder="🔎 输入检索内容进行人工二次核准..." value={reconSearch} onChange={e => setReconSearch(e.target.value)} className="w-full text-xs px-3 py-2 border border-gray-200 bg-gray-50 rounded-xl outline-none font-extrabold" />
                                                </div>
                                            )}

                                            {displayedBills.length > 0 ? (
                                                displayedBills.map(bill => (
                                                    <div key={bill.id} className="flex justify-between items-center p-3 bg-gray-50 hover:bg-[#FFF9D9] rounded-xl border border-gray-200/60 transition-colors">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs font-black text-[#111111] truncate">{bill.company}</span>
                                                                {bill.invoiceRef && <span className="text-[9px] bg-gray-200/70 text-gray-600 px-1 py-0.5 rounded font-mono font-black">#{bill.invoiceRef}</span>}
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 font-bold mt-0.5">时间: {bill.time?.split('T')[0]} · 待付欠额: <span className="text-red-600 font-mono font-black">RM {Number(bill.outstandingAmount).toFixed(2)}</span></p>
                                                        </div>
                                                        <button 
                                                            onClick={async () => {
                                                                const aiDate = aiScannedData.date?.length === 8
                                                                    ? `${aiScannedData.date.slice(0,4)}-${aiScannedData.date.slice(4,6)}-${aiScannedData.date.slice(6,8)}`
                                                                    : '';
                                                                const existingDate = String(bill.time || '').split('T')[0];
                                                                const aiAmount = Number(aiScannedData.amount || 0);
                                                                const existingAmount = Number(bill.totalBillAmount ?? bill.outstandingAmount ?? bill.amount ?? 0);
                                                                let finalDate = existingDate;

                                                                if (aiDate && aiDate !== existingDate) {
                                                                    const useInvoiceDate = await (window as any).systemDialog.confirm(
                                                                        `账单日期不一致\n\n系统日期：${existingDate || '无'}\n发票日期：${aiDate}\n\n按【确定执行】使用发票日期；按【取消】保留系统日期。`,
                                                                        '应付账款'
                                                                    );
                                                                    if (useInvoiceDate) finalDate = aiDate;
                                                                }
                                                                if (Math.abs(Math.round(aiAmount * 100) - Math.round(existingAmount * 100)) > 2) {
                                                                    alert(`金额不一致，请在编辑页核对：\n系统金额 RM ${existingAmount.toFixed(2)}\n发票金额 RM ${aiAmount.toFixed(2)}`);
                                                                }

                                                                setIsMatchModalOpen(false);
                                                                setEditingBill({
                                                                    ...bill,
                                                                    time: finalDate || bill.time,
                                                                    invoiceRef: aiScannedData.invoice_no !== 'UNKNOWN' ? aiScannedData.invoice_no : (bill.invoiceRef || ''),
                                                                    linkUrl: aiScannedData.tempLink,
                                                                    pendingFileId: aiScannedData.fileId,
                                                                    pendingOriginalName: aiScannedData.originalName,
                                                                    pendingMimeType: aiScannedData.mimeType
                                                                } as any);
                                                                setIsFormOpen(true);
                                                            }}
                                                            className="px-3.5 py-2.5 bg-[#111111] text-[#FFD200] rounded-xl text-[10px] font-black hover:bg-black active:scale-95 shrink-0 ml-3 shadow-sm"
                                                        >
                                                            🔘 选择此单对账补全
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 text-gray-400 italic text-[11px] font-bold">✕ 没有找到任何符合条件的待付账单。</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="relative flex py-2 items-center">
                                        <div className="flex-grow border-t border-dashed border-gray-300"></div>
                                        <span className="flex-shrink mx-4 text-gray-400 text-[10px] font-black tracking-widest">OR</span>
                                        <div className="flex-grow border-t border-dashed border-gray-300"></div>
                                    </div>

                                    <div className="space-y-2 shrink-0">
                                        <h4 className="text-xs font-black text-[#111111] uppercase tracking-widest">⬇️ 录入一笔全新的独立账单 (新消费盲录)</h4>
                                        <div className="bg-[#FFF9D9] rounded-2xl p-4 border border-[#FFD200]/70 text-center">
                                            <p className="text-[11px] text-[#5C4B00] font-bold mb-4">如果是无 PO 单的新增消费（如零散维修），点击下方按钮由 AI 自动填单。</p>
                                            <button 
                                                onClick={() => {
                                                    setIsMatchModalOpen(false);
                                                    setEditingBill({
                                                        id: '',
                                                        company: aiScannedData.vendor !== 'UNKNOWN_VENDOR' ? aiScannedData.vendor : '',
                                                        category: '', 
                                                        amount: 0, 
                                                        totalBillAmount: aiScannedData.amount || 0,
                                                        outstandingAmount: aiScannedData.amount || 0,
                                                        creditNote: 0,
                                                        paymentStatus: 'UNPAID',
                                                        time: (aiScannedData.date && aiScannedData.date.length === 8) 
                                                            ? `${aiScannedData.date.substring(0,4)}-${aiScannedData.date.substring(4,6)}-${aiScannedData.date.substring(6,8)}` 
                                                            : new Date().toISOString().split('T')[0],
                                                        tags: [],
                                                        linkUrl: aiScannedData.tempLink,
                                                        note: '🤖 AI 自动抓取识别盲录入' + (aiScannedData.isDuplicate ? ' [⚠️ 疑似重复件]' : ''),
                                                        paymentMethod: 'BANK_TRANSFER',
                                                        paidBy: 'COMPANY',
                                                        isAdvancePayment: false,
                                                        invoiceRef: aiScannedData.invoice_no !== 'UNKNOWN' ? aiScannedData.invoice_no : '',
                                                        pendingFileId: aiScannedData.fileId,
                                                        pendingOriginalName: aiScannedData.originalName,
                                                        pendingMimeType: aiScannedData.mimeType
                                                    } as any);
                                                    setIsFormOpen(true); 
                                                }}
                                                className="px-6 py-3 bg-[#FFD200] hover:bg-[#FFE14D] text-[#111111] rounded-xl text-xs font-black shadow-[0_6px_18px_rgba(255,210,0,0.22)] border border-[#FFD200]"
                                            >
                                                ⚡ 一键生成全新独立账单
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 📱 手机端底栏固定操作栏 (Sticky Bottom Actions Bar) - 适配 iOS、PWA & Apple HIG */}
            {!isFormOpen && !showBackdate && !showPVHistory && !showMigrationTool && !isBatchPayModalOpen && !isBatchDeleteModalOpen && !payModalData && (
                <div id="ap-sticky-bottom-actions-bar" className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 bg-[#1A1A1A]/95 backdrop-blur-lg border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] rounded-2xl p-3 flex items-center justify-between gap-2.5 font-sans transition-colors duration-200">
                    {/* Main List Mode */}
                    {viewMode === 'LIST' ? (
                        <div className="flex items-center justify-between w-full gap-2 font-sans">
                            {/* 🤖 AI 暂存区扫描 */}
                            <button 
                                id="btn-ap-mobile-ai-scan"
                                onClick={handleAiScanPending}
                                disabled={isAiScanning}
                                className={`flex-1 min-h-[44px] bg-indigo-500/10 border border-indigo-500/20 active:bg-indigo-500/20 rounded-xl flex flex-col items-center justify-center relative cursor-pointer text-indigo-400 disabled:opacity-50 ${isAiScanning ? 'animate-pulse' : ''}`}
                            >
                                <span className="text-[14px]">{isAiScanning ? "⏳" : "🤖"}</span>
                                <span className="text-[9px] font-black tracking-wider text-indigo-300">AI 扫描</span>
                            </button>

                            {/* 📄 PV 历史 */}
                            <button 
                                id="btn-ap-mobile-pv-history"
                                onClick={() => setShowPVHistory(true)}
                                className="flex-1 min-h-[44px] bg-emerald-500/10 border border-emerald-500/20 active:bg-emerald-500/20 rounded-xl flex flex-col items-center justify-center cursor-pointer text-emerald-400"
                            >
                                <span className="text-[14px]">📄</span>
                                <span className="text-[9px] font-black tracking-wider text-emerald-300">PV 历史</span>
                            </button>

                            {/* 📅 补开 PV */}
                            <button 
                                id="btn-ap-mobile-backdate-pv"
                                onClick={() => setShowBackdate(true)}
                                className="flex-1 min-h-[44px] bg-orange-500/10 border border-orange-500/20 active:bg-orange-500/20 rounded-xl flex flex-col items-center justify-center cursor-pointer text-orange-400"
                            >
                                <span className="text-[14px]">📅</span>
                                <span className="text-[9px] font-black tracking-wider text-orange-300">补开 PV</span>
                            </button>

                            {/* ➕ 录入账单 */}
                            <button 
                                id="btn-ap-mobile-add-bill"
                                onClick={() => handleOpenForm()}
                                className="flex-[2] min-h-[44px] bg-[#FFD700] text-black active:bg-[#FFE44D] rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer font-black text-xs"
                            >
                                <Plus size={16} className="stroke-[3]" />
                                <span>录入账单</span>
                            </button>
                        </div>
                    ) : (
                        /* Supplier Detail Account Statement Mode */
                        <div className="flex items-center justify-between w-full gap-2 font-sans">
                            {/* 返回列表 */}
                            <button 
                                id="btn-ap-mobile-back-list"
                                onClick={() => { setViewMode('LIST'); setSelectedSupplierId(null); }}
                                className="flex-1 min-h-[44px] bg-white/5 border border-white/10 active:bg-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer"
                            >
                                <ArrowLeft size={14} className="text-gray-300" />
                                <span className="text-[9px] font-black text-gray-350 tracking-wider">返回列表</span>
                            </button>

                            {/* 为此商家补开 PV */}
                            <button 
                                id="btn-ap-mobile-detail-backdate-pv"
                                onClick={() => setShowBackdate(true)}
                                className="flex-1 min-h-[44px] bg-orange-500/10 border border-orange-500/20 active:bg-orange-500/20 rounded-xl flex flex-col items-center justify-center cursor-pointer text-orange-400"
                            >
                                <span className="text-[14px]">📅</span>
                                <span className="text-[9px] font-black tracking-wider text-orange-300">补开 PV</span>
                            </button>

                            {/* 为此商家录入新账 */}
                            <button 
                                id="btn-ap-mobile-detail-add-bill"
                                onClick={() => {
                                    const supplierName = supplierById.get(selectedSupplierId!)?.name || '';
                                    handleOpenForm(undefined, supplierName);
                                }}
                                className="flex-[2] min-h-[44px] bg-[#FFD700] text-black active:bg-[#FFE44D] rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer font-black text-xs"
                            >
                                <Plus size={16} className="stroke-[3]" />
                                <span>录入新账</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
export default AccountsPayableModule;
