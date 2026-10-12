import React, { useState, useEffect, useMemo } from 'react';
import { Building, Zap, Gauge, Wrench, Users, Trash2, Plus, DollarSign, X, CheckCircle2, History, AlertTriangle, FileCheck, Banknote, Droplets, Wifi, CalendarDays, ArrowRight, Edit3, Layers, ShieldCheck, Copy, Link as LinkIcon, PiggyBank, Archive, Loader2, Clipboard, ExternalLink, ChevronLeft, ChevronRight, Search, ArrowLeft , MoreVertical } from 'lucide-react';
import { RecurringBill, BillPaymentRecord, RecurringBillCategory, ExpenseItem, BillCostShare } from '../../types';
import { MeterBackfillModal, METER_CATEGORIES } from './recurring/MeterBackfillModal';
import { BillDataFixModal, VENDOR_OPTIONS, CATEGORY_VENDOR, looksLikeAccountNo } from './recurring/BillDataFixModal';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { numberToWords, COMPANY_INFO } from '../../utils/paymentVoucherUtils';
import { guardWrite } from '../../utils/readOnlyMode';

interface RecurringBillsModuleProps {
    onClose: () => void;
}

// === CATEGORY MAP: RecurringBill → AP ExpenseItem ===
const BILL_TO_AP_CATEGORY: Record<RecurringBillCategory, string> = {
    'RENT': 'RENT',
    'RENT_STAFF': 'RENT_STAFF',
    'ELECTRICITY': 'UTILITIES_ELECTRIC',
    'WATER': 'UTILITIES_WATER',
    'ELECTRICITY_STAFF': 'UTILITIES_ELECTRIC_STAFF',
    'WATER_STAFF': 'UTILITIES_WATER_STAFF',
    'INTERNET': 'INTERNET',
    'WASTE': 'WASTE',
    'LICENSE': 'LICENSE',
    'SUBSCRIPTION': 'LICENSE',
    'OTHER': 'SUPPLIES',
};

const CATEGORY_CONFIG: Record<RecurringBillCategory, { label: string, icon: any, color: string, unit?: string, text: string }> = {
    'RENT': { label: '租金', text: 'RENT', icon: Building, color: 'bg-blue-50 text-blue-600 border-blue-200' },
    'RENT_STAFF': { label: '宿舍租金', text: 'RENT-STAFF', icon: Building, color: 'bg-violet-50 text-violet-700 border-violet-200' },
    'ELECTRICITY': { label: '电费', text: 'ELECTRIC', icon: Zap, color: 'bg-yellow-50 text-yellow-600 border-yellow-200', unit: 'kWh' },
    'WATER': { label: '水费', text: 'WATER', icon: Droplets, color: 'bg-cyan-50 text-cyan-600 border-cyan-200', unit: 'm³' },
    'ELECTRICITY_STAFF': { label: '宿舍电费', text: 'ELEC-STAFF', icon: Zap, color: 'bg-amber-50 text-amber-700 border-amber-200', unit: 'kWh' },
    'WATER_STAFF': { label: '宿舍水费', text: 'WATER-STAFF', icon: Droplets, color: 'bg-sky-50 text-sky-700 border-sky-200', unit: 'm³' },
    'INTERNET': { label: '网络', text: 'WIFI', icon: Wifi, color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    'WASTE': { label: '垃圾费', text: 'WASTE', icon: Trash2, color: 'bg-gray-50 text-gray-600 border-gray-200' },
    'LICENSE': { label: '执照/SST', text: 'LICENSE', icon: ShieldCheck, color: 'bg-orange-50 text-orange-600 border-orange-200' },
    'SUBSCRIPTION': { label: '系统订阅', text: 'SUB', icon: Layers, color: 'bg-purple-50 text-purple-600 border-purple-200' },
    'OTHER': { label: '其他', text: 'OTHER', icon: Banknote, color: 'bg-green-50 text-green-600 border-green-200' },
};

export const RecurringBillsModule: React.FC<RecurringBillsModuleProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'MONTHLY' | 'YEARLY' | 'HISTORY'>('MONTHLY');
    const [bills, setBills] = useState<RecurringBill[]>([]);
    const [payments, setPayments] = useState<BillPaymentRecord[]>([]);
    const [, setLoading] = useState(true);
    
    // View State
    const [isAddMode, setIsAddMode] = useState(false);
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    
    // Form States
    const [billForm, setBillForm] = useState<Partial<RecurringBill>>({});
    
    // Pay Modal State
    const [payingBill, setPayingBill] = useState<RecurringBill | null>(null);
    const [payAmount, setPayAmount] = useState<number>(0);
    const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [payMethod, setPayMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
    const [payRef, setPayRef] = useState('');
    const [payLink, setPayLink] = useState(''); // NEW: Link URL State
    const [meterReadings, setMeterReadings] = useState<{ prev: string, curr: string }>({ prev: '', curr: '' });
    const [payUsage, setPayUsage] = useState<string>('');
    /** 他人分摊（代收代付）明细 */
    const [payShares, setPayShares] = useState<BillCostShare[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // EDIT MODE: editing an existing payment record
    /** 哪张卡片的「⋯」菜单是打开的。卡片太窄塞不下 5 个按钮，次要操作全收进菜单里 */
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
    /**
     * 这一笔支付记录要记在哪个会计科目。
     * 预设跟账单主档一样，但可以单独改 —— 以前是写死 payingBill.category，
     * 历史记录记错科目就只能去改主档，一改就连以后的都跟着变。
     */
    const [payCategory, setPayCategory] = useState<RecurringBillCategory | ''>('');
    
    // HISTORY FILTER: month filter + search + pagination
    const [historyMonth, setHistoryMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [historySearch, setHistorySearch] = useState('');
    const [historyLimit, setHistoryLimit] = useState(50);
    const [showAllHistory, setShowAllHistory] = useState(false);

    // BILL FILTER: search for active bills
    const [billSearch, setBillSearch] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // === BATCH BILL GENERATION STATES ===
    const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
    const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
    const [bulkPayMethod, setBulkPayMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
    const [bulkBillsData, setBulkBillsData] = useState<Array<{ billId: string; name: string; amount: number; date: string; ref: string; category: string; payableTo: string }>>([]);

    // === BATCH PAYMENT SELECTION STATES ===
    const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

    // === 补录仪表读数 ===
    const [isMeterBackfillOpen, setIsMeterBackfillOpen] = useState(false);

    // === 账单资料修正（收款商/账号填错格、名称统一） ===
    const [isBillFixOpen, setIsBillFixOpen] = useState(false);

    // === 补记以前的账单（已缴的账单还要再补记一期） ===
    const [isBackdateMode, setIsBackdateMode] = useState(false);
    /** 使用者手动改过「上次读数」就不再自动覆盖 */
    const [meterPrevTouched, setMeterPrevTouched] = useState(false);

    // === BATCH VOUCHER GENERATION STATES ===
    const [isBatchVoucherModalOpen, setIsBatchVoucherModalOpen] = useState(false);
    const [batchVoucherType, setBatchVoucherType] = useState<'PV' | 'RECEIPT'>('RECEIPT');
    const [batchVoucherTitle, setBatchVoucherTitle] = useState('OFFICIAL RECEIPT');
    const [batchVoucherPreparedBy, setBatchVoucherPreparedBy] = useState('Admin Office');
    const [batchVoucherCheckedBy, setBatchVoucherCheckedBy] = useState('Financial Manager');
    const [batchVoucherApprovedBy, setBatchVoucherApprovedBy] = useState('Managing Director');
    const [batchVoucherChopEnabled, setBatchVoucherChopEnabled] = useState(true);

    // === VOUCHER GENERATION STATES ===
    const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
    const [voucherPayment, setVoucherPayment] = useState<BillPaymentRecord | null>(null);
    const [voucherType, setVoucherType] = useState<'PV' | 'RECEIPT'>('PV');
    const [voucherTitle, setVoucherTitle] = useState('');
    const [voucherNo, setVoucherNo] = useState('');
    const [voucherPayeeName, setVoucherPayeeName] = useState('');
    const [voucherPreparedBy, setVoucherPreparedBy] = useState('Admin');
    const [voucherCheckedBy, setVoucherCheckedBy] = useState('Manager');
    const [voucherApprovedBy, setVoucherApprovedBy] = useState('Director');
    const [voucherChopEnabled, setVoucherChopEnabled] = useState(true);

    const handleCopyText = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Clear batch selection when tab changes
    useEffect(() => {
        setSelectedBillIds([]);
    }, [activeTab, billSearch]);

    // Clear batch selection when filter conditions change
    useEffect(() => {
        setSelectedPaymentIds([]);
    }, [activeTab, historyMonth, historySearch, showAllHistory]);

    // Auto-calculate usage when readings change
    useEffect(() => {
        if (meterReadings.curr && meterReadings.prev) {
            const curr = parseFloat(meterReadings.curr);
            const prev = parseFloat(meterReadings.prev);
            if (!isNaN(curr) && !isNaN(prev)) {
                const diff = curr - prev;
                setPayUsage(diff > 0 ? diff.toFixed(2) : '0');
            }
        }
    }, [meterReadings]);

    // 改了交易日期 → 重新带出「那个日期之前」的上次读数（使用者手动填过就不动）
    useEffect(() => {
        if (!isPayModalOpen || !payingBill) return;
        if (meterPrevTouched) return;
        if (!METER_CATEGORIES.includes(String(payingBill.category))) return;
        const carried = getLastMeterCurr(payingBill.id, editingPaymentId || undefined, payDate);
        setMeterReadings(prev => {
            const next = carried !== undefined ? String(carried) : '';
            return prev.prev === next ? prev : { ...prev, prev: next };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payDate, isPayModalOpen, payingBill?.id, meterPrevTouched, editingPaymentId]);

    const ensureAllPaymentsSynced = async (billsList: RecurringBill[], paymentsList: BillPaymentRecord[]) => {
        try {
            const { query, collection, where, getDocs } = await import('firebase/firestore');
            const { db: fireDb } = await import('../../firebaseConfig');

            // 1. Fetch all existing synced expenses to know what is already there
            const q = query(
                collection(fireDb, 'standalone_expenses'),
                where('id', '>=', 'bill_sync_'),
                where('id', '<=', 'bill_sync_\uf8ff')
            );
            const snap = await getDocs(q);
            const syncedIds = new Set<string>();
            snap.forEach(doc => {
                syncedIds.add(doc.id);
            });

            // 2. Identify payments that are NOT synced yet
            const missingPayments = paymentsList.filter(p => !syncedIds.has(`bill_sync_${p.id}`));

            if (missingPayments.length > 0) {
                console.log(`Auto-repairing sync: found ${missingPayments.length} missing payments in AP.`);
                for (const p of missingPayments) {
                    const bill = billsList.find(b => b.id === p.billId);
                    const apCategory = BILL_TO_AP_CATEGORY[p.category] || 'SUPPLIES';
                    const rawExpense: ExpenseItem = {
                        id: `bill_sync_${p.id}`,
                        category: apCategory,
                        expenseType: 'RECURRING',
                        company: bill?.payableTo || bill?.name || p.name,
                        amount: p.amount || 0,
                        paymentStatus: 'PAID',
                        paymentMethod: p.method as any,
                        time: p.date,
                        note: `[经常性支出] ${p.name}${p.referenceNo ? ` | Ref: ${p.referenceNo}` : ''}${p.usage ? ` | Usage: ${p.usage} ${CATEGORY_CONFIG[p.category]?.unit || ''}` : ''}`,
                        paidBy: p.method === 'CASH' ? 'SHOP_CASH' : 'COMPANY',
                        linkUrl: p.linkUrl || undefined,
                        tags: ['RECURRING_BILL'],
                    };
                    const expense = JSON.parse(JSON.stringify(rawExpense));
                    await DataManager.saveStandaloneExpense(expense);
                }
                console.log(`Successfully synced ${missingPayments.length} missing payments.`);
            }
        } catch (error) {
            console.error("Auto-sync back-repair failed", error);
        }
    };

    const loadData = async () => {
        setLoading(true);
        const b = await DataManager.getRecurringBills();
        const p = await DataManager.getBillPayments();
        setBills(b);
        setPayments(p.sort((a,b) => b.date.localeCompare(a.date)));
        setLoading(false);

        // Background heal/sync
        ensureAllPaymentsSynced(b, p);
    };

    // --- QUICK ADD / EDIT ---
    const startAdd = (type: 'MONTHLY' | 'YEARLY') => {
        const defaultCat = type === 'MONTHLY' ? 'OTHER' : 'SUBSCRIPTION';
        setBillForm({ 
            category: defaultCat, 
            name: '',
            type: type,
            dueDay: 1,
            dueMonth: type === 'YEARLY' ? 1 : undefined,
            amount: 0,
            reminderDays: type === 'YEARLY' ? 30 : 3
        });
        setIsAddMode(true);
    };

    /**
     * 换分类时自动带出收款商。
     * 只在「收款商还空着」或「原本就是上一个分类自动带的那个公司」时覆盖 ——
     * 使用者自己打过的名字不会被冲掉。
     */
    const handleCategoryChange = (nextCategory: RecurringBillCategory) => {
        setBillForm(prev => {
            const current = (prev.payableTo || '').trim();
            const prevAuto = CATEGORY_VENDOR[(prev.category || 'OTHER') as RecurringBillCategory] || '';
            const nextAuto = CATEGORY_VENDOR[nextCategory] || '';
            const canOverwrite = current === '' || current === prevAuto;
            return {
                ...prev,
                category: nextCategory,
                payableTo: canOverwrite && nextAuto ? nextAuto : prev.payableTo,
            };
        });
    };

    const startEdit = (bill: RecurringBill) => {
        setBillForm({ ...bill });
        setIsAddMode(true);
    };

    const handleSaveBill = async () => {
    if (!guardWrite('保存账单')) return;
        if (!billForm.name) return alert("Please enter a name");
        
        const rawBill: RecurringBill = {
            id: billForm.id || `bill_${Date.now()}`,
            name: billForm.name,
            amount: Number(billForm.amount) || 0,
            type: billForm.type || 'MONTHLY',
            dueDay: Number(billForm.dueDay) || 1,
            dueMonth: billForm.type === 'YEARLY' ? Number(billForm.dueMonth) : undefined,
            category: billForm.category || 'OTHER',
            isActive: true,
            lastPaidDate: billForm.lastPaidDate,
            reminderDays: Number(billForm.reminderDays) || (billForm.type === 'YEARLY' ? 30 : 3),
            isArchived: false,
            
            accountNumber: billForm.accountNumber,
            payableTo: billForm.payableTo,
            paymentLink: billForm.paymentLink,
            contractStart: billForm.contractStart,
            contractEnd: billForm.contractEnd,
            depositAmount: Number(billForm.depositAmount) || 0,
            softLimit: Number(billForm.softLimit) || 0,
            hardLimit: Number(billForm.hardLimit) || 0
        };

        // Sanitize to remove undefined
        const newBill = JSON.parse(JSON.stringify(rawBill));

        await DataManager.saveRecurringBill(newBill);
        setBillForm({});
        setIsAddMode(false);
        loadData();
    };

    const handleDeleteBill = async (id: string) => {
    if (!guardWrite('删除账单')) return;
        if (!confirm("Confirm delete?")) return;
        await DataManager.deleteRecurringBill(id);
        loadData();
    };

    // --- PAYMENT LOGIC ---
    /**
     * 同一张账单「这个日期之前」最近一期的本次读数 —— 用来自动带出这期的「上次」。
     * 补记以前的账单时，带出来的是那个时间点之前的读数，不是最新那一期。
     */
    const getLastMeterCurr = (billId: string, excludePaymentId?: string, beforeDate?: string): number | undefined => {
        const prevRecords = payments
            .filter(p => p.billId === billId && p.id !== excludePaymentId && typeof p.meterCurr === 'number')
            .filter(p => !beforeDate || p.date <= beforeDate)
            .sort((a, b) => b.date.localeCompare(a.date));
        return prevRecords.length > 0 ? prevRecords[0].meterCurr : undefined;
    };

    /** backdate = true：这张账单这个月已经缴过了，但还要补记以前那一期 */
    const openPayModal = (bill: RecurringBill, backdate: boolean = false) => {
        setPayingBill(bill);
        setPayAmount(backdate ? 0 : (bill.amount || 0));
        const today = new Date().toISOString().split('T')[0];
        setPayDate(today);
        setPayRef('');
        setPayLink(''); // Reset Link
        // 水电类：把上一期的「本次读数」自动带进「上次」，省一次手抄
        const carried = METER_CATEGORIES.includes(String(bill.category))
            ? getLastMeterCurr(bill.id, undefined, today)
            : undefined;
        setMeterReadings({ prev: carried !== undefined ? String(carried) : '', curr: '' });
        setMeterPrevTouched(false);
        setPayUsage('');
        setPayShares([]);
        setPayCategory(bill.category);
        setEditingPaymentId(null); // New payment mode
        setIsBackdateMode(backdate);
        setIsPayModalOpen(true);
    };

    // EDIT existing payment — prefill modal with existing data
    const openEditPayment = (payment: BillPaymentRecord) => {
        const bill = bills.find(b => b.id === payment.billId);
        setPayingBill(bill || { id: payment.billId, name: payment.name, amount: payment.amount, type: 'MONTHLY', dueDay: 1, category: payment.category, isActive: true, reminderDays: 3, isArchived: false } as RecurringBill);
        setPayAmount(payment.amount);
        setPayDate(payment.date);
        setPayMethod(payment.method as any);
        setPayRef(payment.referenceNo || '');
        setPayLink(payment.linkUrl || '');
        setPayUsage(payment.usage?.toString() || '');
        // 回填仪表读数；旧记录没存过 prev 的，用同账单上一期的「本次」补上
        const fallbackPrev = payment.meterPrev === undefined || payment.meterPrev === null
            ? getLastMeterCurr(payment.billId, payment.id, payment.date)
            : undefined;
        setMeterReadings({
            prev: payment.meterPrev !== undefined && payment.meterPrev !== null
                ? String(payment.meterPrev)
                : (fallbackPrev !== undefined ? String(fallbackPrev) : ''),
            curr: payment.meterCurr !== undefined && payment.meterCurr !== null ? String(payment.meterCurr) : '',
        });
        setPayShares(Array.isArray(payment.costShares) ? payment.costShares.map(x => ({ ...x })) : []);
        // 原本就存过上次读数的，不让日期变动去覆盖它
        setMeterPrevTouched(payment.meterPrev !== undefined && payment.meterPrev !== null);
        setPayCategory((payment.category as RecurringBillCategory) || payment.billId && bills.find(b => b.id === payment.billId)?.category || 'OTHER');
        setEditingPaymentId(payment.id); // Edit mode
        setIsBackdateMode(false);
        setIsPayModalOpen(true);
    };

    const handlePasteLink = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setPayLink(text);
        } catch (err) {
            alert("Clipboard permission denied");
        }
    };

    /** 分摊合计（只算填了金额的） */
    const shareTotal = payShares.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    /** 净成本 = 我实际承担的部分 */
    const netCost = (payAmount || 0) - shareTotal;

    /** 以前填过的分摊方，拿来做下拉建议 */
    const payerSuggestions = useMemo(() => {
        const set = new Set<string>();
        payments.forEach(p => (p.costShares || []).forEach(cs => { if (cs.payer?.trim()) set.add(cs.payer.trim()); }));
        return Array.from(set).sort();
    }, [payments]);

    const addShareRow = () => setPayShares(prev => [...prev, { id: `cs_${Date.now()}_${prev.length}`, payer: '', amount: 0, received: false }]);
    const updateShareRow = (id: string, patch: Partial<BillCostShare>) =>
        setPayShares(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
    const removeShareRow = (id: string) => setPayShares(prev => prev.filter(x => x.id !== id));

    const confirmPayment = async () => {
        if (!payingBill) return;
        
        setIsSubmitting(true);
        try {
            const paymentId = editingPaymentId || `pay_${Date.now()}`;
            // 这一笔要记在哪个科目：有选就用选的，没选才跟账单主档
            const effectiveCategory: RecurringBillCategory =
                (payCategory as RecurringBillCategory) || payingBill.category;
            // 分摊：丢掉没填名字也没填金额的空行
            const cleanShares: BillCostShare[] = payShares
                .filter(x => (x.payer || '').trim() !== '' || Number(x.amount) > 0)
                .map(x => ({
                    id: x.id,
                    payer: (x.payer || '').trim() || '未填名称',
                    amount: Number(x.amount) || 0,
                    received: !!x.received,
                    ...(x.received && x.receivedDate ? { receivedDate: x.receivedDate } : {}),
                }));
            const cleanShareTotal = cleanShares.reduce((sum, x) => sum + x.amount, 0);
            
            const rawRecord: BillPaymentRecord = {
                id: paymentId,
                billId: payingBill.id,
                name: payingBill.name,
                amount: payAmount || 0,
                date: payDate,
                category: effectiveCategory,
                method: payMethod,
                referenceNo: payRef,
                usage: payUsage ? parseFloat(payUsage) : undefined,
                usageUnit: CATEGORY_CONFIG[effectiveCategory]?.unit,
                meterPrev: meterReadings.prev !== '' && !isNaN(parseFloat(meterReadings.prev)) ? parseFloat(meterReadings.prev) : undefined,
                meterCurr: meterReadings.curr !== '' && !isNaN(parseFloat(meterReadings.curr)) ? parseFloat(meterReadings.curr) : undefined,
                costShares: cleanShares.length > 0 ? cleanShares : undefined,
                linkUrl: payLink
            };

            const record = JSON.parse(JSON.stringify(rawRecord));
            await DataManager.saveBillPayment(record);
            
            // === AP SYNC: Create/Update matching ExpenseItem in standalone_expenses ===
            const apId = `bill_sync_${paymentId}`;
            const apCategory = BILL_TO_AP_CATEGORY[effectiveCategory] || 'SUPPLIES';
            const rawExpense: ExpenseItem = {
                id: apId,
                category: apCategory,
                expenseType: 'RECURRING',
                company: payingBill.payableTo || payingBill.name,
                amount: payAmount || 0,
                paymentStatus: 'PAID',
                paymentMethod: payMethod as any,
                time: payDate,
                note: `[经常性支出] ${payingBill.name}${payRef ? ` | Ref: ${payRef}` : ''}${payUsage ? ` | Usage: ${payUsage} ${CATEGORY_CONFIG[effectiveCategory]?.unit || ''}` : ''}${cleanShareTotal > 0 ? ` | 他人分摊: ${cleanShareTotal.toFixed(2)}（本店净负担 ${((payAmount || 0) - cleanShareTotal).toFixed(2)}）` : ''}`,
                paidBy: payMethod === 'CASH' ? 'SHOP_CASH' : 'COMPANY',
                linkUrl: payLink || undefined,
                tags: ['RECURRING_BILL'],
            };
            const expense = JSON.parse(JSON.stringify(rawExpense));
            await DataManager.saveStandaloneExpense(expense);
            
            // Update last paid date on the bill itself
            // 补记以前那一期时，不可以把 lastPaidDate 往回拉（会让账单又变成 UNPAID）
            if (!editingPaymentId) {
                const existingLast = payingBill.lastPaidDate || '';
                if (!existingLast || payDate >= existingLast) {
                    const rawUpdatedBill = { ...payingBill, lastPaidDate: payDate };
                    const updatedBill = JSON.parse(JSON.stringify(rawUpdatedBill));
                    await DataManager.saveRecurringBill(updatedBill);
                }
            }
            
            setIsPayModalOpen(false);
            setPayingBill(null);
            setEditingPaymentId(null);
            alert(editingPaymentId ? "✅ 已更新支付记录 (Payment Updated)" : "✅ 支付已记录 (Payment Recorded)");
            loadData();
        } catch (error: any) {
            console.error("Payment failed", error);
            alert(`❌ 支付失败 (Failed): ${error.message || 'Data Error'}. Please try again.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeletePayment = async (id: string) => {
    if (!guardWrite('删除付款记录')) return;
        if(!confirm("确认删除此支付记录？\n(AP同步记录也会一并删除)")) return;
        
        // Delete the payment record
        await DataManager.deleteBillPayment(id);
        
        // Also delete the synced AP expense
        try {
            const { deleteDoc: delDoc, doc: docRef } = await import('firebase/firestore');
            const { db: fireDb } = await import('../../firebaseConfig');
            await delDoc(docRef(fireDb, 'standalone_expenses', `bill_sync_${id}`));
        } catch (e) { console.warn("AP sync cleanup skipped", e); }
        
        loadData();
    };

    const handleBulkDeletePayments = async () => {
    if (!guardWrite('批量删除付款')) return;
        if (selectedPaymentIds.length === 0) return alert("请先选择要删除的记录");
        if (!confirm(`⚠️ 确认批量删除这 ${selectedPaymentIds.length} 条支付记录吗？\n此操作不可撤销，且会一并删除 A/P 模块中对应的同步支出记账。`)) return;

        setLoading(true);
        try {
            const { deleteDoc: delDoc, doc: docRef } = await import('firebase/firestore');
            const { db: fireDb } = await import('../../firebaseConfig');

            for (const id of selectedPaymentIds) {
                await DataManager.deleteBillPayment(id);
                try {
                    await delDoc(docRef(fireDb, 'standalone_expenses', `bill_sync_${id}`));
                } catch (e) {
                    console.warn("AP sync cleanup failed for " + id, e);
                }
            }
            setSelectedPaymentIds([]);
            alert(`✅ 成功批量删除 ${selectedPaymentIds.length} 条付款记录！`);
            loadData();
        } catch (error: any) {
            console.error("Bulk delete failed", error);
            alert(`❌ 批量删除失败: ${error.message || '未知错误'}`);
        } finally {
            setLoading(false);
        }
    };

    /**
     * 账单资料修正：只改「名称 / 收款商 / 收款账户」三栏。
     * syncPaymentNames = true 时，连带把旧支付记录的 name 改掉（金额一概不动）。
     */
    const handleSaveBillFix = async (
        rows: Array<{ id: string; name: string; payableTo: string; accountNumber: string }>,
        syncPaymentNames: boolean,
    ) => {
        if (rows.length === 0) return;
        const renamed: Record<string, string> = {};
        for (const row of rows) {
            const bill = bills.find(b => b.id === row.id);
            if (!bill) continue;
            if ((bill.name || '') !== row.name) renamed[row.id] = row.name;
            const merged = JSON.parse(JSON.stringify({
                ...bill,
                name: row.name,
                payableTo: row.payableTo,
                accountNumber: row.accountNumber,
            }));
            await DataManager.saveRecurringBill(merged);
        }

        let touchedPayments = 0;
        if (syncPaymentNames && Object.keys(renamed).length > 0) {
            const targets = payments.filter(p => renamed[p.billId] && p.name !== renamed[p.billId]);
            for (const pay of targets) {
                const merged = JSON.parse(JSON.stringify({ ...pay, name: renamed[pay.billId] }));
                await DataManager.saveBillPayment(merged);
                touchedPayments++;
            }
        }

        alert(`✅ 已修正 ${rows.length} 张账单${touchedPayments > 0 ? `，并更新 ${touchedPayments} 条支付记录的名称` : ''}`);
        loadData();
    };

    /** 补录仪表读数：只写 meterPrev / meterCurr，其他栏位原样保留 */
    const handleSaveMeterBackfill = async (readingMap: Record<string, { meterPrev?: number; meterCurr?: number }>) => {
        const ids = Object.keys(readingMap);
        if (ids.length === 0) return;
        for (const id of ids) {
            const original = payments.find(p => p.id === id);
            if (!original) continue;
            const merged = JSON.parse(JSON.stringify({ ...original, ...readingMap[id] }));
            await DataManager.saveBillPayment(merged);
        }
        alert(`✅ 已补录 ${ids.length} 条记录的仪表读数`);
        loadData();
    };

    const openVoucherModal = (payment: BillPaymentRecord) => {
        setVoucherPayment(payment);
        setVoucherType('PV'); // default to Payment Voucher
        
        const b = bills.find(x => x.id === payment.billId);
        setVoucherPayeeName(b?.payableTo || b?.name || payment.name);
        
        const dateStr = payment.date.replace(/-/g, '');
        const randId = payment.id.slice(-4).toUpperCase();
        setVoucherNo(`PV-${dateStr}-${randId}`);
        setVoucherTitle(payment.method === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER');
        
        setVoucherPreparedBy(localStorage.getItem('user_display_name') || 'Admin Office');
        setVoucherCheckedBy('Financial Manager');
        setVoucherApprovedBy('Managing Director');
        setVoucherChopEnabled(true);
        
        setIsVoucherModalOpen(true);
    };

    const handleVoucherTypeChange = (type: 'PV' | 'RECEIPT') => {
        setVoucherType(type);
        if (!voucherPayment) return;
        const dateStr = voucherPayment.date.replace(/-/g, '');
        const randId = voucherPayment.id.slice(-4).toUpperCase();
        if (type === 'PV') {
            setVoucherTitle(voucherPayment.method === 'CASH' ? 'CASH VOUCHER' : 'PAYMENT VOUCHER');
            setVoucherNo(`PV-${dateStr}-${randId}`);
        } else {
            setVoucherTitle('OFFICIAL RECEIPT');
            setVoucherNo(`REC-${dateStr}-${randId}`);
        }
    };

    // --- BATCH VOUCHER GENERATION HANDLERS ---
    const openBatchVoucherModal = () => {
        if (selectedPaymentIds.length === 0) {
            alert("请先选择要生成收据的支付记录");
            return;
        }
        setBatchVoucherType('RECEIPT');
        setBatchVoucherTitle('OFFICIAL RECEIPT');
        setBatchVoucherPreparedBy(localStorage.getItem('user_display_name') || 'Admin Office');
        setBatchVoucherCheckedBy('Financial Manager');
        setBatchVoucherApprovedBy('Managing Director');
        setBatchVoucherChopEnabled(true);
        setIsBatchVoucherModalOpen(true);
    };

    const handleBatchVoucherTypeChange = (type: 'PV' | 'RECEIPT') => {
        setBatchVoucherType(type);
        if (type === 'PV') {
            setBatchVoucherTitle('PAYMENT VOUCHER');
        } else {
            setBatchVoucherTitle('OFFICIAL RECEIPT');
        }
    };

    // 👑 Custom print handler to dynamically set the document.title (which determines PDF filename)
    const printSingleVoucher = () => {
        if (!voucherPayment) return;
        const oldTitle = document.title;
        const dateFormatted = voucherPayment.date.replace(/-/g, '');
        const categoryName = (voucherPayment.category || 'OTHER').toUpperCase();
        // Format price cleanly. If it's a whole number, omit decimals, else show exact number
        const amtStr = voucherPayment.amount % 1 === 0 ? voucherPayment.amount.toFixed(0) : voucherPayment.amount.toString();
        const pdfName = `${dateFormatted}_${categoryName}_RM${amtStr}`;
        
        document.title = pdfName;
        window.print();
        setTimeout(() => {
            document.title = oldTitle;
        }, 1000);
    };

    const printBatchVouchers = () => {
        if (selectedPaymentIds.length === 0) return;
        const oldTitle = document.title;
        const selectedPayments = payments.filter(p => selectedPaymentIds.includes(p.id));
        if (selectedPayments.length > 0) {
            const firstPay = selectedPayments[0];
            const dateFormatted = firstPay.date.replace(/-/g, '').substring(0, 6); // YearMonth e.g. 202607
            const totalAmount = selectedPayments.reduce((acc, p) => acc + p.amount, 0);
            const amtStr = totalAmount % 1 === 0 ? totalAmount.toFixed(0) : totalAmount.toString();
            document.title = `${dateFormatted}_BATCH_${selectedPayments.length}PCS_RM${amtStr}`;
        }
        window.print();
        setTimeout(() => {
            document.title = oldTitle;
        }, 1000);
    };

    // --- BATCH BILL GENERATION HANDLERS ---
    const getStandardDueDate = (bill: RecurringBill) => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const monthStr = month < 10 ? `0${month}` : `${month}`;
        
        if (bill.type === 'MONTHLY') {
            const day = bill.dueDay || 10;
            const dayStr = day < 10 ? `0${day}` : `${day}`;
            return `${year}-${monthStr}-${dayStr}`;
        } else {
            return `${year}-12-31`; // standard license due end of year
        }
    };

    const openBulkPayModal = () => {
        const list = bills.filter(b => selectedBillIds.includes(b.id));
        const data = list.map(b => {
            const due = getStandardDueDate(b);
            return {
                billId: b.id,
                name: b.name,
                amount: b.amount,
                date: due,
                ref: '',
                category: b.category,
                payableTo: b.payableTo || b.name
            };
        });
        setBulkBillsData(data);
        setIsBulkPayModalOpen(true);
    };

    const updateBulkItemAmount = (billId: string, val: string) => {
        setBulkBillsData(prev => prev.map(item => item.billId === billId ? { ...item, amount: parseFloat(val) || 0 } : item));
    };

    const updateBulkItemDate = (billId: string, val: string) => {
        setBulkBillsData(prev => prev.map(item => item.billId === billId ? { ...item, date: val } : item));
    };

    const updateBulkItemRef = (billId: string, val: string) => {
        setBulkBillsData(prev => prev.map(item => item.billId === billId ? { ...item, ref: val } : item));
    };

    const handleBulkPaySubmit = async () => {
    if (!guardWrite('批量付款')) return;
        setIsSubmitting(true);
        try {
            for (const item of bulkBillsData) {
                const bill = bills.find(b => b.id === item.billId);
                if (!bill) continue;

                const paymentId = `pmt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                const newPayment: BillPaymentRecord = {
                    id: paymentId,
                    billId: item.billId,
                    name: item.name,
                    category: item.category as any,
                    amount: item.amount,
                    date: item.date,
                    method: bulkPayMethod as any,
                    referenceNo: item.ref
                };

                // Update bill last paid date & amount
                const updatedBill: RecurringBill = {
                    ...bill,
                    lastPaidDate: item.date
                };

                await DataManager.saveBillPayment(newPayment);
                await DataManager.saveRecurringBill(updatedBill);
            }

            setIsBulkPayModalOpen(false);
            setSelectedBillIds([]);
            await loadData();
            alert("🎉 批量记账成功！已自动更新账单状态并在对账历史中生成了凭据。");
        } catch (e) {
            console.error("Failed to batch pay", e);
            alert("❌ 批量记账失败");
        } finally {
            setIsSubmitting(false);
        }
    };

    const getVoucherNo = (payment: BillPaymentRecord, type: 'PV' | 'RECEIPT') => {
        const dateStr = payment.date.replace(/-/g, '');
        const randId = payment.id.slice(-4).toUpperCase();
        const prefix = type === 'PV' ? 'PV' : 'REC';
        return `${prefix}-${dateStr}-${randId}`;
    };

    // --- HELPERS ---
    const checkStatus = (bill: RecurringBill) => {
        if (!bill.lastPaidDate) return 'UNPAID';
        const today = new Date();
        const lastPaid = new Date(bill.lastPaidDate);
        
        if (bill.type === 'MONTHLY') {
            const isSameMonth = lastPaid.getMonth() === today.getMonth() && lastPaid.getFullYear() === today.getFullYear();
            return isSameMonth ? 'PAID' : 'UNPAID';
        } else {
            const isSameYear = lastPaid.getFullYear() === today.getFullYear();
            // Check renewal logic (e.g. within 11 months for yearly is ok? assume same year payment covers it)
            return isSameYear ? 'PAID' : 'UNPAID';
        }
    };

    const isOverdue = (bill: RecurringBill) => {
        const s = checkStatus(bill);
        if (s === 'PAID') return false;
        
        const today = new Date();
        const currentDay = today.getDate();
        if (bill.type === 'MONTHLY') {
            return currentDay > bill.dueDay;
        } else {
            // YEARLY
            const currentMonth = today.getMonth() + 1;
            if (bill.dueMonth) {
                if (currentMonth > bill.dueMonth) return true;
                if (currentMonth === bill.dueMonth) return currentDay > bill.dueDay;
            }
            return false;
        }
    };

    const latestPaymentMap = useMemo(() => {
        const map: Record<string, BillPaymentRecord> = {};
        // since payments sorted newest first in loadData
        payments.forEach(p => {
            if (!map[p.billId]) {
                map[p.billId] = p;
            }
        });
        return map;
    }, [payments]);

    const filteredBills = useMemo(() => {
        let list = bills.filter(b => b.type === activeTab);
        if (billSearch) {
            const q = billSearch.toLowerCase();
            list = list.filter(b => 
                b.name.toLowerCase().includes(q) || 
                b.accountNumber?.toLowerCase().includes(q) || 
                b.payableTo?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [bills, activeTab, billSearch]);

    const billsSummary = useMemo(() => {
        let totalActive = 0;
        let totalAmount = 0;
        let unpaidCount = 0;
        let unpaidAmount = 0;
        let paidCount = 0;
        let paidAmount = 0;
        
        bills.filter(b => b.type === activeTab).forEach(b => {
            totalActive++;
            totalAmount += b.amount || 0;
            const s = checkStatus(b);
            if (s === 'PAID') {
                paidCount++;
                const lPay = latestPaymentMap[b.id];
                paidAmount += lPay?.amount || b.amount || 0;
            } else {
                unpaidCount++;
                unpaidAmount += b.amount || 0;
            }
        });

        return { totalActive, totalAmount, unpaidCount, unpaidAmount, paidCount, paidAmount };
    }, [bills, activeTab, latestPaymentMap]);

    // HISTORY: Filtered + paginated payments
    const filteredPayments = useMemo(() => {
        let list = payments;
        
        // Month filter (unless showing all)
        if (!showAllHistory && historyMonth) {
            list = list.filter(p => p.date.startsWith(historyMonth));
        }
        
        // Search filter
        if (historySearch) {
            const q = historySearch.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.referenceNo?.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
        }
        
        return list;
    }, [payments, historyMonth, historySearch, showAllHistory]);
    
    const displayedPayments = filteredPayments.slice(0, historyLimit);
    const hasMorePayments = filteredPayments.length > historyLimit;
    
    // History month totals
    const historyMonthTotal = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const handleSelectPaymentToggle = (id: string) => {
        setSelectedPaymentIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(x => x !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const isAllSelected = useMemo(() => {
        if (displayedPayments.length === 0) return false;
        return displayedPayments.every(p => selectedPaymentIds.includes(p.id));
    }, [displayedPayments, selectedPaymentIds]);

    const handleSelectAllToggle = () => {
        if (isAllSelected) {
            setSelectedPaymentIds(prev => prev.filter(id => !displayedPayments.some(dp => dp.id === id)));
        } else {
            setSelectedPaymentIds(prev => {
                const copy = [...prev];
                displayedPayments.forEach(dp => {
                    if (!copy.includes(dp.id)) {
                        copy.push(dp.id);
                    }
                });
                return copy;
            });
        }
    };
    
    const handleHistoryMonthChange = (delta: number) => {
        const [y, m] = historyMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setHistoryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        setHistoryLimit(50);
    };
    
    // Purge old records (archive)
    const handlePurgeOld = async () => {
        const cutoff = prompt("删除多久以前的记录？\n请输入月数 (例如: 12 = 一年前)", "12");
        if (!cutoff) return;
        const months = parseInt(cutoff);
        if (isNaN(months) || months < 3) return alert("最少保留3个月");
        
        const cutDate = new Date();
        cutDate.setMonth(cutDate.getMonth() - months);
        const cutStr = cutDate.toISOString().split('T')[0];
        
        const toDelete = payments.filter(p => p.date < cutStr);
        if (toDelete.length === 0) return alert("没有需要清理的旧记录");
        
        if (!confirm(`确认删除 ${toDelete.length} 条 ${cutStr} 之前的记录？\n\n⚠️ 此操作不可撤销！\n(已同步到应付账款的记录不受影响)`)) return;
        
        for (const p of toDelete) {
            await DataManager.deleteBillPayment(p.id);
        }
        alert(`✅ 已清理 ${toDelete.length} 条旧记录`);
        loadData();
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F6F7FB] w-full h-full md:max-w-5xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* HEADER */}
                <div className="sticky top-0 z-50 bg-[#111111] px-4 py-2.5 flex justify-between items-center text-white shrink-0 border-b border-white/10 safe-area-top">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose}
                            style={{ touchAction: 'manipulation' }}
                            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-white transition-all border border-white/10 shrink-0"
                            aria-label="Back"
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                        <div>
                            <h3 className="font-sans font-extrabold text-sm tracking-tight leading-none">经常性支出管理</h3>
                            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5 leading-none">Recurring Bills</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <ModuleGuideButton module="BILLS" />
                        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full select-none transition-colors" title="Close">
                            <X size={18}/>
                        </button>
                    </div>
                </div>

                {/* TABS */}
                <div className="bg-white border-b border-gray-200 p-2 flex shrink-0">
                    <div className="bg-gray-100 p-1 rounded-xl flex w-full gap-1">
                        <button 
                            onClick={() => setActiveTab('MONTHLY')} 
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center justify-center gap-1 ${
                                activeTab === 'MONTHLY' 
                                    ? 'bg-[#111111] text-white shadow-xs ring-1 ring-[#FFD200]/30 border-b-2 border-[#FFD200]' 
                                    : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            月度账单 (Monthly)
                        </button>
                        <button 
                            onClick={() => setActiveTab('YEARLY')} 
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center justify-center gap-1 ${
                                activeTab === 'YEARLY' 
                                    ? 'bg-[#111111] text-white shadow-xs ring-1 ring-[#FFD200]/30 border-b-2 border-[#FFD200]' 
                                    : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            年度执照 (Yearly)
                        </button>
                        <button 
                            onClick={() => setActiveTab('HISTORY')} 
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center justify-center gap-1 ${
                                activeTab === 'HISTORY' 
                                    ? 'bg-[#111111] text-white shadow-xs ring-1 ring-[#FFD200]/30 border-b-2 border-[#FFD200]' 
                                    : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            支付记录 (History)
                        </button>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-32">
                    
                    {/* BILLS GRID */}
                    {(activeTab === 'MONTHLY' || activeTab === 'YEARLY') && (
                        <div className="space-y-4 md:space-y-5 animate-in fade-in duration-300">
                            
                            {/* SUMMARY DASHBOARD */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Unpaid Card - Large (Red) */}
                                <div className="md:col-span-2 bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
                                    <div>
                                        <span className="text-[10px] font-extrabold text-red-700 tracking-wider uppercase">待缴账单 (UNPAID)</span>
                                        <div className="text-2xl md:text-3xl font-mono font-black text-red-700 mt-1 leading-none">
                                            RM {billsSummary.unpaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-red-600 font-bold mt-2.5 flex items-center gap-1.5 leading-none">
                                        <AlertTriangle size={12} className="text-red-500"/> {billsSummary.unpaidCount} Bills Remaining
                                    </div>
                                </div>
                                
                                {/* Small Cards Column */}
                                <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                                    {/* Paid Card (Green) */}
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex flex-col justify-center shadow-xs">
                                        <span className="text-[9px] font-extrabold text-emerald-600 tracking-wider uppercase">已缴 (PAID)</span>
                                        <div className="text-base font-mono font-black text-emerald-800 mt-1 leading-none">
                                            RM {billsSummary.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <span className="text-[9px] text-emerald-600 font-bold mt-1 leading-none">
                                            {billsSummary.paidCount} Paid
                                        </span>
                                    </div>
                                    
                                    {/* Total Card (Blue) */}
                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex flex-col justify-center shadow-xs">
                                        <span className="text-[9px] font-extrabold text-blue-600 tracking-wider uppercase">总额 (TOTAL)</span>
                                        <div className="text-base font-mono font-black text-blue-800 mt-1 leading-none">
                                            RM {billsSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <span className="text-[9px] text-blue-600 font-bold mt-1 leading-none">
                                            {billsSummary.totalActive} Registered
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Search Bar & Add Button merged in one row */}
                            <div className="flex gap-2 items-center justify-between pb-1 shrink-0">
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3 top-3 text-gray-400" size={14}/>
                                    <input 
                                        type="text" 
                                        placeholder="搜索固定账单名称、账户或缴付商..." 
                                        value={billSearch} 
                                        onChange={e => setBillSearch(e.target.value)} 
                                        className="w-full pl-9 pr-14 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD200] focus:bg-white transition-all shadow-xs placeholder-gray-500"
                                        style={{ minHeight: '40px' }}
                                    />
                                    {billSearch && (
                                        <button onClick={() => setBillSearch('')} className="absolute right-3 top-0 text-gray-500 hover:text-gray-600 text-xs font-bold h-10 flex items-center select-none">
                                            清除
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => setIsBillFixOpen(true)}
                                    className="h-10 px-3 bg-white hover:bg-gray-50 text-stone-700 border border-gray-200 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-xs"
                                    title="账单资料修正（收款商/账号填错格、名称统一）"
                                    style={{ minHeight: '40px' }}
                                >
                                    <Wrench size={14} className="text-orange-500"/>
                                    <span className="hidden md:inline">修正资料</span>
                                </button>
                                <button 
                                    onClick={() => startAdd(activeTab)} 
                                    className="w-10 h-10 bg-[#FFD200] hover:bg-[#EEC600] text-black active:scale-95 transition-all rounded-xl flex items-center justify-center shadow-xs shrink-0"
                                    title={`添加${activeTab === 'MONTHLY' ? '月度账单' : '年度执照'}`}
                                    style={{ minWidth: '40px', minHeight: '40px' }}
                                >
                                    <Plus size={20} strokeWidth={2.5}/>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {filteredBills.length === 0 ? (
                                    <div className="col-span-full bg-white border border-dashed border-stone-200 rounded-2xl py-12 px-4 text-center">
                                        <div className="w-12 h-12 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Archive size={20} className="text-stone-400"/>
                                        </div>
                                        <p className="text-xs text-stone-500 font-bold mb-1">暂无相关的固定账单记录</p>
                                        <p className="text-[10px] text-stone-400">点击“添加”按钮或清空搜索过滤词</p>
                                    </div>
                                ) : (
                                    filteredBills.map(bill => {
                                        const status = checkStatus(bill);
                                        const overdue = isOverdue(bill);
                                        const isSelected = selectedBillIds.includes(bill.id);
                                        const conf = CATEGORY_CONFIG[bill.category] || CATEGORY_CONFIG['OTHER'];
                                        const Icon = conf.icon;
                                        const latestPay = latestPaymentMap[bill.id];
                                        
                                        return (
                                            <div 
                                                key={bill.id} 
                                                onClick={() => {
                                                    if (status === 'UNPAID') {
                                                        setSelectedBillIds(prev => 
                                                            prev.includes(bill.id) ? prev.filter(id => id !== bill.id) : [...prev, bill.id]
                                                        );
                                                    }
                                                }}
                                                className={`bg-white border rounded-2xl p-3.5 flex flex-col justify-between transition-all duration-200 relative shadow-xs hover:shadow-sm cursor-pointer select-none min-h-[190px] h-full ${
                                                    isSelected
                                                        ? 'border-[#FFD200] ring-2 ring-[#FFD200]/20 bg-[#FFD200]/5'
                                                        : status === 'PAID' 
                                                            ? 'border-emerald-100 bg-white' 
                                                            : overdue 
                                                                ? 'border-rose-200 bg-white' 
                                                                : 'border-gray-200'
                                                }`}
                                            >
                                                {/* Top Row: Category Flag & Controls */}
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-1.5">
                                                        {status === 'UNPAID' && (
                                                            <div 
                                                                className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                                                                    isSelected 
                                                                        ? 'bg-stone-950 border-stone-950 text-white' 
                                                                        : 'bg-white border-stone-300 group-hover:border-stone-400'
                                                                }`}
                                                            >
                                                                {isSelected && (
                                                                    <div className="w-1.5 h-1.5 bg-[#FFD200] rounded-xs" />
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className={`p-1.5 rounded-lg border ${conf.color} shrink-0 flex items-center justify-center w-7 h-7`}>
                                                            <Icon size={12}/>
                                                        </div>
                                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">{conf.label}</span>
                                                    </div>
                                                    {/* Status Badge */}
                                                    <div className="shrink-0">
                                                        {status === 'PAID' ? (
                                                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md select-none flex items-center gap-0.5 whitespace-nowrap">
                                                                <CheckCircle2 size={8} strokeWidth={4}/> PAID
                                                            </span>
                                                        ) : overdue ? (
                                                            <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md select-none flex items-center gap-0.5 whitespace-nowrap animate-pulse">
                                                                <AlertTriangle size={8}/> OVERDUE
                                                            </span>
                                                        ) : (
                                                            <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md select-none whitespace-nowrap">
                                                                UNPAID
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
 
                                                {/* Middle: Name & Payee */}
                                                <div className="min-w-0 mt-1">
                                                    <h4 className="font-extrabold text-stone-900 text-sm leading-tight tracking-tight truncate">
                                                        {bill.name}
                                                    </h4>
                                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                                        <p
                                                            className={`text-[11px] font-medium truncate ${looksLikeAccountNo(bill.payableTo) ? 'text-orange-600 font-bold' : 'text-gray-500'}`}
                                                            title={looksLikeAccountNo(bill.payableTo) ? '这格是「收款商公司名」，现在填的像是账号 —— 点编辑改一下' : (bill.payableTo || '')}
                                                        >
                                                            {bill.payableTo || '-'}
                                                        </p>
                                                        {/* Mini advanced tags aligned right next to subtext to save space */}
                                                        <div className="flex gap-1 shrink-0">
                                                            {bill.depositAmount && bill.depositAmount > 0 ? (
                                                                <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-bold px-1 rounded flex items-center gap-0.5" title="Deposit">
                                                                    <PiggyBank size={8}/> RM {bill.depositAmount}
                                                                </span>
                                                            ) : null}
                                                            {bill.softLimit && bill.softLimit > 0 ? (
                                                                <span className="bg-stone-50 text-stone-600 border border-stone-200 text-[8px] font-bold px-1 rounded flex items-center gap-0.5" title="Warning Limit">
                                                                    Limit RM {bill.softLimit}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Divider */}
                                                <div className="border-t border-gray-100 my-2"></div>

                                                {/* ─────────────────────────────────────────────
                                                    金额区：独占整行，永远不会被按钮挤到
                                                   ───────────────────────────────────────────── */}
                                                <div className="min-w-0 mt-auto select-none">
                                                    <span className="text-[8px] uppercase font-bold text-gray-400 tracking-wider block">
                                                        Amount
                                                    </span>
                                                    <span className="text-lg font-mono font-black text-stone-900 leading-none mt-0.5 block truncate">
                                                        RM {(bill.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>

                                                    {bill.accountNumber ? (
                                                        <div className="flex items-center gap-1 text-gray-500 font-mono text-[9px] mt-1 leading-none">
                                                            <span className="truncate" title={bill.accountNumber}>{bill.accountNumber}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleCopyText(bill.accountNumber || '', bill.id);
                                                                }}
                                                                className="text-gray-400 hover:text-stone-800 p-0.5 bg-gray-50 border border-gray-200 rounded active:scale-90 shrink-0"
                                                                title="Copy Account"
                                                            >
                                                                {copiedId === bill.id ? (
                                                                    <span className="text-[7px] text-green-600 font-black px-0.5">Copied</span>
                                                                ) : (
                                                                    <Copy size={8}/>
                                                                )}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-400 italic block mt-1 leading-none">No Account</span>
                                                    )}
                                                </div>

                                                {/* ─────────────────────────────────────────────
                                                    操作区：一个主按钮 + 一个「⋯」菜单，永远只有两个元素
                                                    （以前并排 5 个按钮，窄卡片塞不下会溢出到卡片外面）
                                                   ───────────────────────────────────────────── */}
                                                <div className="flex items-center gap-1.5 mt-2.5" onClick={e => e.stopPropagation()}>
                                                    {status === 'UNPAID' ? (
                                                        <button
                                                            onClick={() => openPayModal(bill)}
                                                            className="flex-1 min-w-0 h-9 bg-[#FFD200] hover:bg-[#E5C100] text-black active:scale-95 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 transition-all shadow-sm"
                                                        >
                                                            <DollarSign size={12} strokeWidth={3}/> 付款 Pay
                                                        </button>
                                                    ) : (
                                                        <div className="flex-1 min-w-0 h-9 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1">
                                                            <CheckCircle2 size={12} strokeWidth={3}/> 已付款
                                                        </div>
                                                    )}

                                                    {/* 「⋯」更多操作 */}
                                                    <div className="relative shrink-0">
                                                        <button
                                                            onClick={() => setOpenMenuId(openMenuId === bill.id ? null : bill.id)}
                                                            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                                                                openMenuId === bill.id
                                                                    ? 'bg-stone-900 border-stone-900 text-white'
                                                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                            }`}
                                                            title="更多操作"
                                                        >
                                                            <MoreVertical size={14}/>
                                                        </button>

                                                        {openMenuId === bill.id && (
                                                            <>
                                                                {/* 点空白处关掉菜单 */}
                                                                <div
                                                                    className="fixed inset-0 z-30"
                                                                    onClick={() => setOpenMenuId(null)}
                                                                />
                                                                <div className="absolute bottom-full right-0 mb-1.5 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-40 overflow-hidden py-1">
                                                                    <button
                                                                        onClick={() => { setOpenMenuId(null); startEdit(bill); }}
                                                                        className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50 active:bg-gray-100 text-left min-h-[44px] md:min-h-0"
                                                                    >
                                                                        <Edit3 size={13} className="text-gray-400 shrink-0"/> 编辑账单
                                                                    </button>

                                                                    {bill.paymentLink && (
                                                                        <a
                                                                            href={bill.paymentLink}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            onClick={() => setOpenMenuId(null)}
                                                                            className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50 active:bg-gray-100 min-h-[44px] md:min-h-0"
                                                                        >
                                                                            <LinkIcon size={13} className="text-gray-400 shrink-0"/> 官方缴费网站
                                                                        </a>
                                                                    )}

                                                                    {status === 'PAID' && latestPay?.linkUrl && (
                                                                        <a
                                                                            href={latestPay.linkUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            onClick={() => setOpenMenuId(null)}
                                                                            className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 min-h-[44px] md:min-h-0"
                                                                        >
                                                                            <Clipboard size={13} className="text-blue-400 shrink-0"/> 查看单据
                                                                        </a>
                                                                    )}

                                                                    <button
                                                                        onClick={() => { setOpenMenuId(null); openPayModal(bill, true); }}
                                                                        className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] font-bold text-amber-700 hover:bg-amber-50 active:bg-amber-100 text-left min-h-[44px] md:min-h-0"
                                                                    >
                                                                        <History size={13} className="text-amber-500 shrink-0"/> 补记以前的账单
                                                                    </button>

                                                                    <div className="border-t border-gray-100 my-1" />

                                                                    <button
                                                                        onClick={() => { setOpenMenuId(null); handleDeleteBill(bill.id); }}
                                                                        className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] font-bold text-red-600 hover:bg-red-50 active:bg-red-100 text-left min-h-[44px] md:min-h-0"
                                                                    >
                                                                        <Trash2 size={13} className="text-red-400 shrink-0"/> 删除账单
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {bill.lastPaidDate && (
                                                    <div className="mt-1.5 text-[8px] text-gray-400 font-medium flex items-center gap-1 select-all">
                                                        <History size={8} className="shrink-0"/>
                                                        <span>Last: {bill.lastPaidDate} {latestPay?.amount ? `(RM ${latestPay.amount})` : ''}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* HISTORY LIST - ENHANCED */}
                    {activeTab === 'HISTORY' && (
                        <div className="space-y-4">
                            {/* History Controls */}
                            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                                <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
                                    {/* Month Navigator */}
                                    <button 
                                        onClick={() => handleHistoryMonthChange(-1)} 
                                        className="p-1.5 bg-white rounded-lg border border-gray-200/50 hover:bg-gray-50 active:scale-95 shadow-xs transition-all text-gray-600"
                                        title="Previous Month"
                                    >
                                        <ChevronLeft size={14}/>
                                    </button>
                                    <div className="flex items-center gap-1.5 bg-transparent px-2 text-stone-800">
                                        <CalendarDays size={12} className="text-gray-400"/>
                                        <input 
                                            type="month" 
                                            value={historyMonth} 
                                            onChange={e => { setHistoryMonth(e.target.value); setHistoryLimit(50); }} 
                                            className="bg-transparent font-extrabold text-xs outline-none w-28 text-center cursor-pointer text-stone-900"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => handleHistoryMonthChange(1)} 
                                        className="p-1.5 bg-white rounded-lg border border-gray-200/50 hover:bg-gray-50 active:scale-95 shadow-xs transition-all text-gray-600"
                                        title="Next Month"
                                    >
                                        <ChevronRight size={14}/>
                                    </button>
                                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                                    <button 
                                        onClick={() => setShowAllHistory(!showAllHistory)} 
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                            showAllHistory 
                                                ? 'bg-stone-900 text-white shadow-xs' 
                                                : 'bg-white text-gray-600 hover:text-stone-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        {showAllHistory ? 'All Time' : 'By Month'}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap md:flex-nowrap">
                                    <div className="relative flex-grow md:w-44">
                                        <Search className="absolute left-3 top-2.5 text-gray-400" size={13}/>
                                        <input 
                                            type="text" 
                                            placeholder="Search history..." 
                                            value={historySearch} 
                                            onChange={e => setHistorySearch(e.target.value)} 
                                            className="w-full pl-8 pr-3 h-9 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-stone-400 transition-all shadow-2xs"
                                        />
                                    </div>
                                    
                                    <button
                                        onClick={() => setIsMeterBackfillOpen(true)}
                                        className="h-9 px-3 bg-white hover:bg-gray-50 text-stone-700 border border-gray-200 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-2xs"
                                        title="补录仪表读数"
                                    >
                                        <Gauge size={13} className="text-indigo-500"/>
                                        <span className="hidden md:inline">补录读数</span>
                                    </button>

                                    {selectedPaymentIds.length > 0 ? (
                                        <button 
                                            onClick={handleBulkDeletePayments} 
                                            className="h-9 px-3.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[11px] rounded-xl active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                                        >
                                            <Trash2 size={12} strokeWidth={2.5}/>
                                            <span>Delete ({selectedPaymentIds.length})</span>
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={handlePurgeOld} 
                                            className="w-9 h-9 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl flex items-center justify-center transition-all shrink-0 active:scale-95" 
                                            title="Purge Old Records"
                                        >
                                            <Trash2 size={13}/>
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* Month Summary */}
                            <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs">
                                <div className="text-[11px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
                                    <span>{showAllHistory ? 'All History Records' : `${historyMonth} Monthly Spending`}</span>
                                    {selectedPaymentIds.length > 0 && (
                                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[9px] font-black animate-pulse">
                                            Selected {selectedPaymentIds.length}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[11px] text-gray-500 font-bold bg-gray-100 px-2.5 py-1 rounded-lg">{filteredPayments.length} records</span>
                                    <span className="text-lg font-mono font-black text-stone-900">RM {historyMonthTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                                {/* Mobile: Card layout */}
                                <div className="md:hidden divide-y divide-gray-100 bg-white">
                                    {displayedPayments.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 italic text-sm">No payment records found</div>
                                    ) : displayedPayments.map(p => {
                                        const isChecked = selectedPaymentIds.includes(p.id);
                                        return (
                                            <div 
                                                key={p.id} 
                                                onClick={() => handleSelectPaymentToggle(p.id)}
                                                className={`p-3.5 flex items-start gap-1 cursor-pointer transition-colors ${isChecked ? 'bg-red-50/10' : 'hover:bg-gray-50/50'}`}
                                            >
                                                {/* Mobile Touch-Friendly Checkbox Area */}
                                                <div 
                                                    className="flex items-center justify-center shrink-0 pr-1.5"
                                                    style={{ width: '40px', height: '40px' }}
                                                    onClick={(e) => { e.stopPropagation(); handleSelectPaymentToggle(p.id); }}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isChecked} 
                                                        onChange={() => {}} 
                                                        className="w-4.5 h-4.5 accent-red-600 rounded bg-gray-50 border-gray-300"
                                                    />
                                                </div>
                                                
                                                <div className="flex-grow min-w-0" onClick={(e) => { e.stopPropagation(); handleSelectPaymentToggle(p.id); }}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="font-extrabold text-xs text-stone-900 truncate block max-w-[150px]">{p.name}</span>
                                                        <span className="text-[7.5px] text-gray-500 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded font-black uppercase tracking-wider shrink-0">{p.category}</span>
                                                    </div>
                                                    <div className="text-[9px] text-gray-400 font-mono font-bold leading-none">{p.date} • {p.method?.replace('_', ' ')}</div>
                                                    {p.referenceNo && <div className="text-[9px] text-gray-500 font-semibold mt-1 leading-none">Ref: {p.referenceNo}</div>}
                                                    {p.usage && <div className="text-[9px] text-indigo-600 font-black mt-1 bg-indigo-50 px-1.5 py-0.5 rounded inline-block leading-none">Usage: {p.usage} {p.usageUnit}</div>}
                                                    {typeof p.meterPrev === 'number' && typeof p.meterCurr === 'number' && (
                                                        <div className="text-[9px] font-mono font-black text-stone-600 mt-1 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded inline-block leading-none ml-1">
                                                            {p.meterPrev} &rarr; {p.meterCurr}
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => { e.stopPropagation(); }}>
                                                    <span className="font-mono font-black text-xs text-stone-900">RM {p.amount.toFixed(2)}</span>
                                                    <div className="flex gap-1 mt-1">
                                                        <button 
                                                            onClick={() => openVoucherModal(p)} 
                                                            className="w-7 h-7 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-lg flex items-center justify-center transition-all"
                                                            title="Voucher / Receipt"
                                                        >
                                                            <FileCheck size={11}/>
                                                        </button>
                                                        {p.linkUrl && (
                                                            <a 
                                                                href={p.linkUrl} 
                                                                target="_blank" 
                                                                rel="noreferrer" 
                                                                className="w-7 h-7 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all"
                                                            >
                                                                <ExternalLink size={11}/>
                                                            </a>
                                                        )}
                                                        <button 
                                                            onClick={() => openEditPayment(p)} 
                                                            className="w-7 h-7 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all"
                                                        >
                                                            <Edit3 size={11}/>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeletePayment(p.id)} 
                                                            className="w-7 h-7 bg-red-50 text-red-500 border border-red-100 rounded-lg flex items-center justify-center hover:bg-red-100 transition-all"
                                                        >
                                                            <Trash2 size={11}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                {/* Desktop: Table layout */}
                                <table className="w-full text-left hidden md:table bg-white">
                                    <thead className="bg-gray-50/70 text-[10px] text-gray-400 font-extrabold uppercase border-b border-gray-200 select-none tracking-wider">
                                        <tr>
                                            <th className="p-3 w-12 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isAllSelected} 
                                                    onChange={handleSelectAllToggle}
                                                    className="w-4 h-4 accent-red-600 cursor-pointer rounded"
                                                />
                                            </th>
                                            <th className="p-3 w-28">Date</th>
                                            <th className="p-3">Bill Name</th>
                                            <th className="p-3 text-center w-28">Method</th>
                                            <th className="p-3 text-right w-32">Amount</th>
                                            <th className="p-3 text-center w-36">Ref No</th>
                                            <th className="p-3 text-center w-48">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs divide-y divide-gray-100">
                                        {displayedPayments.length === 0 ? (
                                            <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic font-semibold">No payment records found</td></tr>
                                        ) : (
                                            displayedPayments.map(p => {
                                                const isChecked = selectedPaymentIds.includes(p.id);
                                                return (
                                                    <tr 
                                                        key={p.id} 
                                                        onClick={() => handleSelectPaymentToggle(p.id)}
                                                        className={`transition-colors cursor-pointer ${isChecked ? 'bg-red-50/10' : 'hover:bg-gray-50/40'}`}
                                                    >
                                                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isChecked} 
                                                                onChange={() => handleSelectPaymentToggle(p.id)}
                                                                className="w-4 h-4 accent-red-600 cursor-pointer rounded"
                                                            />
                                                        </td>
                                                        <td className="p-3 font-mono text-[11px] text-gray-400 font-medium">{p.date}</td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-extrabold text-stone-900 whitespace-nowrap">{p.name}</span>
                                                                <span className="text-[8px] text-gray-500 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded font-black uppercase tracking-wider">{p.category}</span>
                                                                {p.usage && <span className="text-[8px] text-indigo-600 font-black bg-indigo-50 px-1.5 py-0.5 rounded">Usage: {p.usage} {p.usageUnit}</span>}
                                                                {typeof p.meterPrev === 'number' && typeof p.meterCurr === 'number' && (
                                                                    <span className="text-[8px] font-mono font-black text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                        {p.meterPrev} &rarr; {p.meterCurr}
                                                                    </span>
                                                                )}
                                                                {(() => {
                                                                    const st = (p.costShares || []).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
                                                                    if (st <= 0) return null;
                                                                    const unpaid = (p.costShares || []).filter(x => !x.received).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
                                                                    return (
                                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap ${unpaid > 0 ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}
                                                                            title={(p.costShares || []).map(x => `${x.payer} ${Number(x.amount).toFixed(2)}${x.received ? ' 已收' : ' 未收'}`).join('\n')}>
                                                                            分摊 -{st.toFixed(2)} · 净 {(Number(p.amount || 0) - st).toFixed(2)}{unpaid > 0 ? ` · 未收 ${unpaid.toFixed(2)}` : ''}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wide">{p.method?.replace('_', ' ')}</td>
                                                        <td className="p-3 text-right font-mono font-black text-stone-900">RM {p.amount.toFixed(2)}</td>
                                                        <td className="p-3 text-center text-xs text-stone-500 font-bold">
                                                            <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                <span className="font-mono text-xs">{p.referenceNo || '-'}</span>
                                                                {p.linkUrl && (
                                                                    <a href={p.linkUrl} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-stone-900 bg-gray-50 p-1 rounded-lg border border-gray-200 transition-colors" title="View Receipt">
                                                                        <ExternalLink size={10}/>
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button 
                                                                    onClick={() => openVoucherModal(p)} 
                                                                    className="h-7 px-2.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all flex items-center gap-1 font-bold text-[10px]" 
                                                                    title="Voucher / Receipt"
                                                                >
                                                                    <FileCheck size={11}/>
                                                                    <span>Voucher</span>
                                                                </button>
                                                                <button 
                                                                    onClick={() => openEditPayment(p)} 
                                                                    className="w-7 h-7 text-gray-500 hover:text-stone-900 hover:bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center transition-all" 
                                                                    title="Edit"
                                                                >
                                                                    <Edit3 size={11}/>
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeletePayment(p.id)} 
                                                                    className="w-7 h-7 text-red-500 hover:bg-red-50 border border-red-200 rounded-lg flex items-center justify-center transition-all" 
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 size={11}/>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Load More */}
                            {hasMorePayments && (
                                <button onClick={() => setHistoryLimit(prev => prev + 50)} className="w-full py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors">
                                    加载更多 ({filteredPayments.length - historyLimit} remaining)
                                </button>
                            )}
                            
                            {/* AP Sync Indicator */}
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                                <CheckCircle2 size={16} className="text-green-600 shrink-0"/>
                                <p className="text-[10px] text-green-700 font-bold">支付记录已自动同步至应付账款 (AP) 模块，分类标记为 <span className="bg-green-100 px-1.5 py-0.5 rounded">RECURRING_BILL</span></p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ADD/EDIT MODAL */}
                {isAddMode && (
                    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
 <div className="bg-white w-full max-w-lg rounded-2xl p-6 md:p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-extrabold text-lg text-[#111111] flex items-center gap-2">
                                    <Layers size={18} className="text-stone-700"/>
                                    {billForm.id ? '编辑固定账单 (Edit Bill) ' : '新增固定账单 (New Bill) '}
                                </h3>
                                <button onClick={() => setIsAddMode(false)} style={{ minHeight: '44px', minWidth: '44px' }} className="hover:bg-stone-100 rounded-full flex items-center justify-center text-stone-500"><X size={18}/></button>
                            </div>
                            
                            <div className="space-y-5">
                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block">账单名称 (Bill Name)</label>
                                    <input 
                                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none focus:border-[#FFD200]" 
                                        value={billForm.name || ''} 
                                        onChange={e => setBillForm({...billForm, name: e.target.value})} 
                                        placeholder="例如：店内TNB、宿舍TNB、店内水费、宿舍水费..." 
                                    />
                                    <p className="text-[10px] text-gray-400 font-bold mt-1 leading-relaxed">
                                        名称用来分「哪个单位」——「店内TNB / 宿舍TNB」；公司名（TNB）填在下面的收款商栏。
                                    </p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3.5">
                                    <div>
                                        <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1 block">对应分类 (category)</label>
                                        <select 
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none" 
                                            value={billForm.category || 'OTHER'} 
                                            onChange={e => handleCategoryChange(e.target.value as RecurringBillCategory)}
                                        >
                                            {Object.entries(CATEGORY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1 block">标准款额 (Standard RM)</label>
                                        <input 
                                            type="number" 
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none" 
                                            value={billForm.amount || ''} 
                                            onChange={e => setBillForm({...billForm, amount: parseFloat(e.target.value) || 0})} 
                                            placeholder="变动用额请输入 0" 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3.5">
                                    <div>
                                        <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1 block">周期类别</label>
                                        <select 
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none animate-in duration-200" 
                                            value={billForm.type || 'MONTHLY'} 
                                            onChange={e => setBillForm({...billForm, type: e.target.value as any})}
                                        >
                                            <option value="MONTHLY">Monthly (月度)</option>
                                            <option value="YEARLY">Yearly (年度)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1 block">预计截止日</label>
                                        <input 
                                            type="number" 
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none" 
                                            value={billForm.dueDay || 1} 
                                            onChange={e => setBillForm({...billForm, dueDay: parseInt(e.target.value) || 1})} 
                                            placeholder="1-28号" 
                                        />
                                    </div>
                                    {billForm.type === 'YEARLY' && (
                                        <div className="animate-in slide-in-from-right duration-200">
                                            <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1 block">截止月份 (Month)</label>
                                            <input 
                                                type="number" 
                                                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none" 
                                                value={billForm.dueMonth || 1} 
                                                onChange={e => setBillForm({...billForm, dueMonth: parseInt(e.target.value) || 1})} 
                                                placeholder="1-12" 
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                                    <div>
                                        <label className="text-[10px] font-extrabold text-stone-500 mb-1 block">收款商官方公司 (Pay To)</label>
                                        <input 
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs md:text-sm outline-none" 
                                            value={billForm.payableTo || ''} 
                                            onChange={e => setBillForm({...billForm, payableTo: e.target.value})} 
                                            placeholder="例如: TNB, Air Selangor, Maxis..." 
                                            list="vendor-options-form"
                                        />
                                        <datalist id="vendor-options-form">
                                            {VENDOR_OPTIONS.map(v => <option key={v} value={v} />)}
                                        </datalist>
                                        {looksLikeAccountNo(billForm.payableTo) ? (
                                            <p className="text-[10px] text-orange-600 font-black mt-1 flex items-start gap-1 leading-relaxed">
                                                <AlertTriangle size={11} className="shrink-0 mt-0.5"/>
                                                这看起来是账号。这格填<b>公司名</b>（TNB / Air Selangor），账号请填右边那格。
                                            </p>
                                        ) : (
                                            <p className="text-[10px] text-gray-400 font-bold mt-1">填公司名，不是账号。</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-extrabold text-stone-500 mb-1 block">收款账户 (Account Number)</label>
                                        <input 
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold font-mono text-xs md:text-sm outline-none" 
                                            value={billForm.accountNumber || ''} 
                                            onChange={e => setBillForm({...billForm, accountNumber: e.target.value})} 
                                            placeholder="缴费所需银行/机构账户" 
                                        />
                                    </div>
                                </div>

                                {/* Advanced Option divider */}
                                <div className="border-t border-stone-100 pt-3.5 space-y-3 mt-1">
                                    <div className="text-xs font-black text-stone-900 flex items-center gap-1.5 select-none">
                                        <div className="w-1.5 h-3 bg-[#FFD200] rounded-sm"></div>
                                        <span>高级与备忘配置 (Advanced & Alerting Config)</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                        <div>
                                            <label className="text-[10px] font-bold text-stone-500 mb-1 block">官方缴费网址 (Portal URL)</label>
                                            <input 
                                                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs outline-none focus:border-[#FFD200]" 
                                                value={billForm.paymentLink || ''} 
                                                onChange={e => setBillForm({...billForm, paymentLink: e.target.value})} 
                                                placeholder="https://www.mytnb.com.my" 
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-stone-500 mb-1 block">已有押金 (Deposit Balance)</label>
                                            <input 
                                                type="number" 
                                                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs outline-none focus:border-[#FFD200]" 
                                                value={billForm.depositAmount || ''} 
                                                onChange={e => setBillForm({...billForm, depositAmount: parseFloat(e.target.value) || 0})} 
                                                placeholder="RM" 
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                        <div>
                                            <label className="text-[10px] font-bold text-stone-500 mb-1 block">额度偏高警戒值 (Warning ceiling)</label>
                                            <input 
                                                type="number" 
                                                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs outline-none focus:border-[#FFD200]" 
                                                value={billForm.softLimit || ''} 
                                                onChange={e => setBillForm({...billForm, softLimit: parseFloat(e.target.value) || 0})} 
                                                placeholder="超出此额将标记报警红字" 
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-stone-500 mb-1 block text-stone-500">截止前提醒天数 (Alert days)</label>
                                            <input 
                                                type="number" 
                                                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs outline-none focus:border-[#FFD200]" 
                                                value={billForm.reminderDays || ''} 
                                                onChange={e => setBillForm({...billForm, reminderDays: parseInt(e.target.value) || 3})} 
                                                placeholder="3 天" 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleSaveBill} 
                                    style={{ minHeight: '48px' }}
                                    className="w-full py-3.5 bg-stone-900 text-[#FFD200] hover:bg-black rounded-xl font-black text-sm shadow-md transition-all active:scale-[0.98] mt-5 uppercase tracking-wider"
                                >
                                    💾 保存账单信息 (Save Bill Outline)
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* PAY MODAL */}
                {isPayModalOpen && payingBill && (
                    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-6 md:p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                            <h3 className="font-extrabold text-xl text-stone-900 mb-1">
                                {editingPaymentId ? '编辑支付记录 (Edit Payment)' : isBackdateMode ? '补记以前的账单 (Back-record)' : '支付账单 (Pay Bill)'}
                            </h3>
                            <p className="text-xs font-bold text-stone-500 mb-3">{payingBill.name}</p>
                            {isBackdateMode && (
                                <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 font-bold leading-relaxed">
                                    这张账单本期已经缴过了。这里是<b>另外补记一笔</b> —— 请把日期改成那一期的实际付款日，金额照那张账单填。
                                    补记比较旧的日期不会影响账单现在的「已缴」状态。
                                </div>
                            )}
                            
                            <div className="space-y-4">
                                {/* Auto Meter Calc for Utilities */}
                                {METER_CATEGORIES.includes(String(payingBill.category)) && (
                                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/60 shadow-xs mb-3">
                                        <p className="text-[10px] font-extrabold text-stone-600 uppercase mb-2 flex items-center gap-1">仪表读数 Meter Reading ({CATEGORY_CONFIG[payingBill.category].unit})</p>
                                        <div className="flex gap-3.5 items-center">
                                            <div className="w-full">
                                                <span className="text-[9px] font-bold text-stone-400 block mb-0.5">上次 Prev</span>
                                                <input type="number" placeholder="Prev" className="w-full p-2.5 bg-white border border-stone-200 rounded text-xs font-bold text-center outline-none focus:border-[#FFD200]" value={meterReadings.prev} onChange={e => { setMeterPrevTouched(true); setMeterReadings({...meterReadings, prev: e.target.value}); }} />
                                            </div>
                                            <ArrowRight size={14} className="text-stone-400 shrink-0 mt-3"/>
                                            <div className="w-full">
                                                <span className="text-[9px] font-bold text-stone-400 block mb-0.5">本次 Curr</span>
                                                <input type="number" placeholder="Curr" className="w-full p-2.5 bg-white border border-stone-200 rounded text-xs font-bold text-center outline-none focus:border-[#FFD200]" value={meterReadings.curr} onChange={e => setMeterReadings({...meterReadings, curr: e.target.value})} />
                                            </div>
                                        </div>
                                        {payUsage && <p className="text-right text-[11px] font-black text-stone-900 mt-2 bg-stone-100 py-1 px-2 rounded">用额 Usage: {payUsage}</p>}
                                    </div>
                                )}

                                {/* 🟢 这一笔记在哪个科目 —— 可以跟账单主档不一样 */}
                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block">
                                        对应分类 (Category)
                                    </label>
                                    <select
                                        value={payCategory || payingBill.category}
                                        onChange={e => setPayCategory(e.target.value as RecurringBillCategory)}
                                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none focus:border-[#FFD200] text-[16px] md:text-sm"
                                        style={{ minHeight: '48px' }}
                                    >
                                        {(Object.keys(CATEGORY_CONFIG) as RecurringBillCategory[]).map(key => (
                                            <option key={key} value={key}>
                                                {CATEGORY_CONFIG[key].label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-gray-400 font-bold mt-1 leading-relaxed">
                                        只改这一笔的记账科目，不会动到账单主档
                                        {payCategory && payCategory !== payingBill.category && (
                                            <span className="text-amber-600">
                                                {" "}· 目前跟主档「{CATEGORY_CONFIG[payingBill.category]?.label}」不一样
                                            </span>
                                        )}
                                    </p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block">Amount (支付款额 - RM)</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-3.5 bg-stone-50 border border-stone-200 rounded-xl font-black text-2xl outline-none focus:border-[#FFD200] transition-all" 
                                        value={payAmount || ''} 
                                        onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} 
                                    />
                                    <p className="text-[10px] text-gray-400 font-bold mt-1">整张账单的实付金额（含其他商家分摊的部分）。</p>
                                </div>

                                {/* 他人分摊（代收代付）：整张先付，之后跟其他商家收回来 */}
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-extrabold text-stone-600 uppercase flex items-center gap-1.5">
                                            <Users size={12} className="text-indigo-500"/> 他人分摊 (代收代付)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={addShareRow}
                                            className="h-7 px-2.5 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg text-[10px] font-black text-stone-700 flex items-center gap-1"
                                        >
                                            <Plus size={11}/> 加一行
                                        </button>
                                    </div>

                                    {payShares.length === 0 ? (
                                        <p className="text-[10px] text-gray-400 font-bold leading-relaxed">
                                            整张账单都是本店的就不用填。若有其他商家分摊（例如电费 7000 里有 3000 是别家的），按「加一行」填进去 —— 财报的成本只会算本店那部分。
                                        </p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {payShares.map(row => (
                                                <div key={row.id} className="flex items-center gap-1.5">
                                                    <input
                                                        list="share-payer-options"
                                                        value={row.payer}
                                                        onChange={e => updateShareRow(row.id, { payer: e.target.value })}
                                                        placeholder="谁分摊"
                                                        className="flex-grow min-w-0 px-2 h-9 bg-white border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-[#FFD200]"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={row.amount || ''}
                                                        onChange={e => updateShareRow(row.id, { amount: parseFloat(e.target.value) || 0 })}
                                                        placeholder="RM"
                                                        className="w-24 shrink-0 px-2 h-9 bg-white border border-stone-200 rounded-lg text-xs font-mono font-bold text-right outline-none focus:border-[#FFD200]"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => updateShareRow(row.id, { received: !row.received, receivedDate: !row.received ? payDate : undefined })}
                                                        className={`h-9 px-2 shrink-0 rounded-lg text-[10px] font-black border transition-all ${
                                                            row.received
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-white text-gray-400 border-stone-200'
                                                        }`}
                                                        title={row.received ? '已收到这笔钱' : '还没收到'}
                                                    >
                                                        {row.received ? '已收' : '未收'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeShareRow(row.id)}
                                                        className="w-9 h-9 shrink-0 bg-white text-red-500 border border-red-100 rounded-lg flex items-center justify-center"
                                                    >
                                                        <Trash2 size={12}/>
                                                    </button>
                                                </div>
                                            ))}
                                            <datalist id="share-payer-options">
                                                {payerSuggestions.map(v => <option key={v} value={v} />)}
                                            </datalist>

                                            <div className="pt-2 mt-1 border-t border-stone-200 flex items-center justify-between">
                                                <span className="text-[10px] font-extrabold text-stone-500 uppercase">本店净负担 (计入成本)</span>
                                                <span className={`font-mono font-black text-sm ${netCost < 0 ? 'text-red-600' : 'text-stone-900'}`}>
                                                    RM {netCost.toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-gray-400 font-mono text-right">
                                                {(payAmount || 0).toFixed(2)} − 分摊 {shareTotal.toFixed(2)}
                                            </div>
                                            {netCost < 0 && (
                                                <div className="text-[10px] text-red-600 font-black flex items-center gap-1">
                                                    <AlertTriangle size={11}/> 分摊比实付金额还多，请检查
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block">Date (交易日期)</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-sm outline-none focus:border-[#FFD200] transition-all" 
                                        value={payDate} 
                                        onChange={e => setPayDate(e.target.value)} 
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block">Reference / Receipt No. (收据参考号)</label>
                                    <input 
                                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-sm outline-none focus:border-[#FFD200] transition-all" 
                                        value={payRef} 
                                        onChange={e => setPayRef(e.target.value)} 
                                        placeholder="例如：RECP-99786..." 
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block">Payment Method (资金来源)</label>
                                    <select 
                                        value={payMethod} 
                                        onChange={e => setPayMethod(e.target.value as any)} 
                                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-sm outline-none focus:border-[#FFD200] transition-all"
                                    >
                                        <option value="BANK_TRANSFER">Bank Transfer (银行转账)</option>
                                        <option value="CASH">Cash (现金支付)</option>
                                        <option value="CHEQUE">Cheque (支票)</option>
                                        <option value="DUITNOW">DuitNow / QR</option>
                                    </select>
                                    <p className="text-[9px] text-stone-400 mt-1 italic font-semibold">
                                        {payMethod === 'CASH' ? 'Will deduct from Treasury CASH balance.' : 'Will deduct from Treasury BANK balance.'}
                                    </p>
                                </div>

                                {/* Link / Receipt URL Input */}
                                <div>
                                    <label className="text-[10px] font-extrabold text-stone-500 uppercase mb-1.5 block flex items-center gap-1"><LinkIcon size={12}/> Receipt / Document Link (收据/凭证链接)</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            className="flex-grow p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD200] transition-all" 
                                            value={payLink} 
                                            onChange={e => setPayLink(e.target.value)} 
                                            placeholder="https://drive.google.com/..." 
                                        />
                                        <button onClick={handlePasteLink} className="p-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl active:scale-95 transition-all" title="Paste from Clipboard">
                                            <Clipboard size={16}/>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button onClick={() => setIsPayModalOpen(false)} className="py-3 bg-gray-100 text-gray-500 font-bold rounded-xl text-sm" disabled={isSubmitting}>Cancel</button>
                                    <button 
                                        onClick={confirmPayment} 
                                        disabled={isSubmitting}
                                        className="py-3 bg-green-500 text-white font-bold rounded-xl text-sm shadow-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? <Loader2 size={16} className="animate-spin"/> : null}
                                        {isSubmitting ? 'Processing...' : editingPaymentId ? 'Update Payment' : 'Confirm Pay'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* VOUCHER GENERATOR SCREEN/MODAL */}
                {isVoucherModalOpen && voucherPayment && (
                    <div className="fixed inset-0 bg-black/60 z-[160] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
                        <style>{`
                            @media print {
                                body * { visibility: hidden !important; }
                                #printable-voucher, #printable-voucher * { 
                                    visibility: visible !important; 
                                }
                                #printable-voucher { 
                                    position: absolute !important; 
                                    top: 0 !important; 
                                    left: 0 !important; 
                                    width: 100% !important; 
                                    height: auto !important; 
                                    background: white !important; 
                                    padding: 10mm !important; 
                                    box-shadow: none !important; 
                                    margin: 0 !important;
                                    color: black !important; 
                                }
                                .print-no-break {
                                    page-break-inside: avoid !important;
                                }
                            }
                        `}</style>

                        <div className="bg-stone-100 dark:bg-stone-100 text-stone-900 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row max-h-[92vh] border border-stone-300 animate-in zoom-in-95">
                            
                            {/* Left Config Panel */}
                            <div className="w-full lg:w-96 bg-white border-b lg:border-b-0 lg:border-r border-stone-200/80 p-5 md:p-6 overflow-y-auto max-h-[40vh] lg:max-h-[92vh] space-y-4 shrink-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-black text-base text-stone-800 flex items-center gap-1.5">
                                        <FileCheck size={18} className="text-indigo-600"/>
                                        <span>凭证与收据自制工具</span>
                                    </h3>
                                    <span className="bg-stone-100 text-stone-500 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">BETA</span>
                                </div>
                                <p className="text-[10px] text-stone-400 font-bold leading-normal">
                                    可实时调整记账名称、签发编号、收款主体、制单人员等信息，并支持连接无线打印机直接输出标准的 A4 实体纸质单据。
                                </p>

                                <hr className="border-stone-100" />

                                <div className="space-y-3">
                                    {/* Document Type Selector */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">文书类型 Document Type</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => handleVoucherTypeChange('PV')}
                                                className={`py-2 px-1 rounded-xl text-xs font-black border transition-all ${voucherType === 'PV' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100/50'}`}
                                            >
                                                支出凭单 (PV)
                                            </button>
                                            <button 
                                                onClick={() => handleVoucherTypeChange('RECEIPT')}
                                                className={`py-2 px-1 rounded-xl text-xs font-black border transition-all ${voucherType === 'RECEIPT' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100/50'}`}
                                            >
                                                收款收据 (REC)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Editable Document Title */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">文书标题 Voucher Title</label>
                                        <input 
                                            type="text" 
                                            value={voucherTitle} 
                                            onChange={e => setVoucherTitle(e.target.value.toUpperCase())}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Editable Serial No */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">凭单编号 Document No.</label>
                                        <input 
                                            type="text" 
                                            value={voucherNo} 
                                            onChange={e => setVoucherNo(e.target.value.toUpperCase())}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Editable Payee/Payor */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">
                                            {voucherType === 'PV' ? '收款人 Payable To' : '付款人 Received From'}
                                        </label>
                                        <input 
                                            type="text" 
                                            value={voucherPayeeName} 
                                            onChange={e => setVoucherPayeeName(e.target.value)}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Prepared By / Checked By / Approved By Signatories */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">制单人 Prepared By</label>
                                            <input 
                                                type="text" 
                                                value={voucherPreparedBy} 
                                                onChange={e => setVoucherPreparedBy(e.target.value)}
                                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-bold outline-none focus:border-stone-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">审核人 Checked By</label>
                                            <input 
                                                type="text" 
                                                value={voucherCheckedBy} 
                                                onChange={e => setVoucherCheckedBy(e.target.value)}
                                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-bold outline-none focus:border-stone-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">批准人 Approved By</label>
                                        <input 
                                            type="text" 
                                            value={voucherApprovedBy} 
                                            onChange={e => setVoucherApprovedBy(e.target.value)}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Action Toggles */}
                                    <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                                        <span className="text-[11px] font-black text-stone-600">模拟财务已付讫印章</span>
                                        <label className="relative inline-flex items-center cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={voucherChopEnabled} 
                                                onChange={() => setVoucherChopEnabled(!voucherChopEnabled)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>
                                </div>

                                <div className="pt-3 grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setIsVoucherModalOpen(false)} 
                                        className="py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center"
                                        style={{ minHeight: '44px' }}
                                    >
                                        关闭窗口
                                    </button>
                                    <button 
                                        onClick={printSingleVoucher} 
                                        className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-1"
                                        style={{ minHeight: '44px' }}
                                    >
                                        <ExternalLink size={13}/>
                                        打印支出单据
                                    </button>
                                </div>
                            </div>

                            {/* Right Live Document Preview Box */}
                            <div className="flex-grow p-6 md:p-8 overflow-y-auto bg-stone-200/50 flex justify-center items-start">
                                
                                {/* HIGH QUALITY PRINTABLE WHITE SHEET */}
                                <div 
                                    id="printable-voucher" 
                                    className="w-full max-w-2xl bg-white border border-stone-300 rounded-3xl p-10 text-black select-all relative overflow-hidden"
                                    style={{ minHeight: '135mm' }} /* Optimized classic receipt paper size height */
                                >
                                    
                                    {/* Background simulated red receipt stamp chop */}
                                    {voucherChopEnabled && (
                                        <div className="absolute right-12 top-24 select-none z-10 pointer-events-none transform rotate-12 opacity-80 scale-100 transition-all duration-300">
                                            <div className="w-24 h-24 rounded-full border-4 border-double border-red-500 p-1 flex flex-col justify-center items-center text-center font-black">
                                                <div className="text-[10px] border-b border-red-500 tracking-wider">KIM LIAN KEE</div>
                                                <div className="text-xs uppercase text-red-500 font-bold tracking-tight">APPROVED</div>
                                                <div className="text-[8px] tracking-widest text-red-400">財務已訖</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Document Header Section */}
                                    <div className="border-b-2 border-stone-900 pb-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <h1 className="font-extrabold text-xl tracking-tight text-stone-950 uppercase">
                                                {COMPANY_INFO.name}
                                            </h1>
                                            <p className="text-[9px] text-stone-400 font-extrabold tracking-wide uppercase">
                                                KIM LIAN KEE RESTAURANT GROUP &bull; 对账付款收据联
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <h2 className="font-black text-sm tracking-wider text-stone-900 border-2 border-stone-900 px-3 py-1 rounded inline-block uppercase">
                                                {voucherTitle || 'RECONCILIATION RECEIPT'}
                                            </h2>
                                        </div>
                                    </div>

                                    {/* Core Details Grid */}
                                    <div className="space-y-5 mb-8 text-xs">
                                        <div className="grid grid-cols-2 gap-4 border-b border-stone-200 pb-3">
                                            <div>
                                                <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider mb-0.5">对账日期 DATE</span>
                                                <span className="text-xs font-mono font-black text-stone-900">{voucherPayment.date}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider mb-0.5">单据编号 RECEIPT NO</span>
                                                <span className="text-xs font-mono font-black text-stone-900">{voucherNo}</span>
                                            </div>
                                        </div>

                                        <div className="border-b border-stone-200 pb-3">
                                            <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider mb-0.5">款项用途与对账内容 CONTENT / PARTICULARS</span>
                                            <div className="text-xs font-black text-stone-900 mt-0.5">
                                                {bills.find(b => b.id === voucherPayment.billId)?.name || voucherPayment.name} ({voucherPayment.category})
                                            </div>
                                            <div className="text-[10px] text-stone-400 font-bold mt-1">
                                                SST / Standard payment voucher verified & compiled under transaction ID {voucherPayment.id}. 
                                                {voucherPayment.referenceNo ? ` | Ref No: ${voucherPayment.referenceNo}` : ''}
                                            </div>
                                        </div>

                                        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                                <span className="text-[9px] font-black uppercase text-stone-500 block tracking-wider">支付总额 AMOUNT</span>
                                                <span className="text-[10px] font-black text-stone-800 uppercase tracking-tight italic mt-0.5 block truncate">
                                                    {numberToWords(voucherPayment.amount)} ONLY
                                                </span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-base font-mono font-black text-stone-950 bg-stone-200 px-4 py-1.5 rounded-xl border border-stone-200 block">
                                                    RM {voucherPayment.amount.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Signatures Fields block */}
                                    <div className="grid grid-cols-2 gap-8 pt-10 border-t border-dashed border-stone-200 mt-12 text-center print-no-break">
                                        <div className="flex flex-col justify-end h-20">
                                            <div className="font-mono text-xs font-bold text-stone-800 underline decoration-stone-300 underline-offset-4">{voucherPreparedBy}</div>
                                            <div className="border-t border-stone-400 pt-1 text-[10px] font-black uppercase text-stone-500">AUTHORIZED SIGNATURE</div>
                                            <span className="text-[8px] text-stone-400 font-bold block">(批准/制单人签名)</span>
                                        </div>
                                        <div className="flex flex-col justify-end h-20">
                                            <div className="border-t border-stone-400 pt-1 text-[10px] font-black uppercase text-stone-500">RECIPIENT / PAYEE SIGNATURE</div>
                                            <span className="text-[8px] text-stone-400 font-bold block">(收款/交接人签名)</span>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-4 border-t border-stone-100 text-[8px] text-stone-400 text-center uppercase tracking-widest leading-relaxed">
                                        SYSTEM SECURITY SECURED TRANS-LOG &bull; SYSTEM CODE: {voucherPayment.id}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {/* FLOATING BULK RECEIPTS BAR */}
                {selectedPaymentIds.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-white rounded-2xl px-5 py-3.5 shadow-2xl flex items-center justify-between gap-5 z-[110] border border-stone-800 animate-in slide-in-from-bottom duration-300 w-[92%] max-w-lg">
                        <div className="text-xs font-black">
                            已选择 <span className="text-[#FFD200] font-mono text-sm">{selectedPaymentIds.length}</span> 项付款记录
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                onClick={() => setSelectedPaymentIds([])}
                                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-800 text-stone-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer"
                                style={{ minHeight: '36px' }}
                            >
                                取消
                            </button>
                            <button 
                                onClick={openBatchVoucherModal}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[11px] transition-all shadow-md flex items-center gap-1 cursor-pointer"
                                style={{ minHeight: '36px' }}
                            >
                                <FileCheck size={12}/>
                                <span>一键生成对账收据联</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* FLOATING BULK BILLS BAR */}
                {selectedBillIds.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-950 text-white rounded-2xl px-5 py-3.5 shadow-2xl flex items-center justify-between gap-5 z-[110] border border-stone-800 animate-in slide-in-from-bottom duration-300 w-[92%] max-w-lg">
                        <div className="text-xs font-black">
                            已选择 <span className="text-[#FFD200] font-mono text-sm">{selectedBillIds.length}</span> 项待缴账单
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                onClick={() => setSelectedBillIds([])}
                                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-800 text-stone-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer"
                                style={{ minHeight: '36px' }}
                            >
                                取消
                            </button>
                            <button 
                                onClick={openBulkPayModal}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-[11px] transition-all shadow-md flex items-center gap-1 cursor-pointer"
                                style={{ minHeight: '36px' }}
                            >
                                <DollarSign size={12}/>
                                <span>一键登记批量付款</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* BATCH PAYMENT MODAL */}
                {isBulkPayModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
                        <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-8 shadow-2xl animate-in zoom-in-95 my-8 max-h-[90vh] flex flex-col">
                            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4 shrink-0">
                                <div>
                                    <h3 className="font-extrabold text-lg md:text-xl text-stone-900 flex items-center gap-2">
                                        <Layers className="text-stone-900" size={20}/>
                                        <span>批量账单付款登记</span>
                                    </h3>
                                    <p className="text-xs text-stone-400 font-bold mt-1">您正在为已勾选的 {bulkBillsData.length} 项账单批量登记付款</p>
                                </div>
                                <button 
                                    onClick={() => setIsBulkPayModalOpen(false)} 
                                    className="p-1.5 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition-colors"
                                >
                                    <X size={18}/>
                                </button>
                            </div>

                            {/* GLOBAL METHOD */}
                            <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 mb-4 shrink-0">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <span className="text-xs font-extrabold text-stone-700 block">统一付款方式 (Global Payment Method)</span>
                                        <span className="text-[10px] text-stone-400 font-medium">应用于以下所有待缴项目</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setBulkPayMethod('BANK_TRANSFER')}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                                                bulkPayMethod === 'BANK_TRANSFER' 
                                                    ? 'bg-stone-950 text-white border-stone-950 shadow-xs' 
                                                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                                            }`}
                                        >
                                            🏦 银行转账
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setBulkPayMethod('CASH')}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                                                bulkPayMethod === 'CASH' 
                                                    ? 'bg-stone-950 text-white border-stone-950 shadow-xs' 
                                                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                                            }`}
                                        >
                                            💵 现金支付
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* BILLS LIST */}
                            <div className="flex-grow overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                                {bulkBillsData.map((item, idx) => {
                                    const conf = CATEGORY_CONFIG[item.category as RecurringBillCategory] || CATEGORY_CONFIG['OTHER'];
                                    const Icon = conf.icon;
                                    return (
                                        <div key={item.billId} className="border border-stone-100 rounded-2xl p-4 bg-white hover:border-stone-200 hover:shadow-xs transition-all space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg border ${conf.color} shrink-0`}>
                                                        <Icon size={12}/>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-extrabold text-xs text-stone-900">{item.name}</h4>
                                                        <span className="text-[9px] text-stone-400 font-semibold">{item.payableTo ? `收款商: ${item.payableTo}` : '其他经常性支出'}</span>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md font-bold">项目 #{idx + 1}</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                {/* Amount */}
                                                <div>
                                                    <span className="text-[9px] font-extrabold text-stone-500 block mb-1">实付金额 (Amount RM)</span>
                                                    <input 
                                                        type="number" 
                                                        value={item.amount || ''} 
                                                        onChange={e => updateBulkItemAmount(item.billId, e.target.value)}
                                                        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold font-mono outline-none focus:border-[#FFD200] text-stone-900"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                {/* Date */}
                                                <div>
                                                    <span className="text-[9px] font-extrabold text-stone-500 block mb-1">付款日期 (Date)</span>
                                                    <input 
                                                        type="date" 
                                                        value={item.date} 
                                                        onChange={e => updateBulkItemDate(item.billId, e.target.value)}
                                                        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD200] text-stone-900"
                                                    />
                                                </div>
                                                {/* Ref */}
                                                <div>
                                                    <span className="text-[9px] font-extrabold text-stone-500 block mb-1">转账单号 (Ref No.)</span>
                                                    <input 
                                                        type="text" 
                                                        value={item.ref} 
                                                        onChange={e => updateBulkItemRef(item.billId, e.target.value)}
                                                        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD200] text-stone-900"
                                                        placeholder="例如: txn_1029384"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* SUBMIT BUTTONS */}
                            <div className="border-t border-stone-100 pt-4 mt-4 flex gap-3 shrink-0">
                                <button 
                                    onClick={() => setIsBulkPayModalOpen(false)} 
                                    className="flex-1 py-3 bg-stone-50 hover:bg-stone-100 text-stone-500 font-bold rounded-xl text-xs transition-colors"
                                    disabled={isSubmitting}
                                >
                                    取消 (Cancel)
                                </button>
                                <button 
                                    onClick={handleBulkPaySubmit} 
                                    disabled={isSubmitting || bulkBillsData.some(item => !item.amount || item.amount <= 0)}
                                    className="flex-2 py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl text-xs shadow-lg transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin"/> : null}
                                    {isSubmitting ? '正在登记支付...' : `确认支付这 ${bulkBillsData.length} 笔账单 (Confirm Pay)`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* BATCH VOUCHER / RECEIPTS GENERATOR MODAL */}
                {isBatchVoucherModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[160] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
                        <style>{`
                            @media print {
                                body * { visibility: hidden !important; }
                                #printable-batch-vouchers, #printable-batch-vouchers * { 
                                    visibility: visible !important; 
                                }
                                #printable-batch-vouchers { 
                                    position: absolute !important; 
                                    top: 0 !important; 
                                    left: 0 !important; 
                                    width: 100% !important; 
                                    background: white !important; 
                                    color: black !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                }
                                .batch-print-page {
                                    page-break-after: always !important;
                                    page-break-inside: avoid !important;
                                    border: none !important;
                                    box-shadow: none !important;
                                    padding: 12mm 10mm !important;
                                    margin-bottom: 0 !important;
                                    background: white !important;
                                }
                            }
                        `}</style>

                        <div className="bg-stone-100 dark:bg-stone-100 text-stone-900 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row max-h-[92vh] border border-stone-300 animate-in zoom-in-95">
                            
                            {/* Left Config Panel */}
                            <div className="w-full lg:w-96 bg-white border-b lg:border-b-0 lg:border-r border-stone-200/80 p-5 md:p-6 overflow-y-auto max-h-[40vh] lg:max-h-[92vh] space-y-4 shrink-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-black text-base text-stone-800 flex items-center gap-1.5">
                                        <FileCheck size={18} className="text-indigo-600"/>
                                        <span>批量对账收据自制工具</span>
                                    </h3>
                                    <span className="bg-stone-100 text-stone-500 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">BATCH</span>
                                </div>
                                <p className="text-[10px] text-stone-400 font-bold leading-normal">
                                    已自动加载选中的 {selectedPaymentIds.length} 条付款记录。点击打印将自动以“一页一单”格式成套输出，无需单独按键生成。
                                </p>

                                <hr className="border-stone-100" />

                                <div className="space-y-3">
                                    {/* Document Type Selector */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">文书类型 Document Type</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => handleBatchVoucherTypeChange('PV')}
                                                className={`py-2 px-1 rounded-xl text-xs font-black border transition-all ${batchVoucherType === 'PV' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100/50'}`}
                                            >
                                                支出凭单 (PV)
                                            </button>
                                            <button 
                                                onClick={() => handleBatchVoucherTypeChange('RECEIPT')}
                                                className={`py-2 px-1 rounded-xl text-xs font-black border transition-all ${batchVoucherType === 'RECEIPT' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100/50'}`}
                                            >
                                                收款收据 (REC)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Editable Document Title */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">文书标题 Voucher Title</label>
                                        <input 
                                            type="text" 
                                            value={batchVoucherTitle} 
                                            onChange={e => setBatchVoucherTitle(e.target.value.toUpperCase())}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Signatories */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">制单人 Prepared By</label>
                                            <input 
                                                type="text" 
                                                value={batchVoucherPreparedBy} 
                                                onChange={e => setBatchVoucherPreparedBy(e.target.value)}
                                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-bold outline-none focus:border-stone-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">审核人 Checked By</label>
                                            <input 
                                                type="text" 
                                                value={batchVoucherCheckedBy} 
                                                onChange={e => setBatchVoucherCheckedBy(e.target.value)}
                                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-bold outline-none focus:border-stone-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-stone-500 uppercase mb-1 block">批准人 Approved By</label>
                                        <input 
                                            type="text" 
                                            value={batchVoucherApprovedBy} 
                                            onChange={e => setBatchVoucherApprovedBy(e.target.value)}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Action Toggles */}
                                    <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                                        <span className="text-[11px] font-black text-stone-600">模拟财务已付讫印章</span>
                                        <label className="relative inline-flex items-center cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={batchVoucherChopEnabled} 
                                                onChange={() => setBatchVoucherChopEnabled(!batchVoucherChopEnabled)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>
                                </div>

                                <div className="pt-3 grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setIsBatchVoucherModalOpen(false)} 
                                        className="py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center"
                                        style={{ minHeight: '44px' }}
                                    >
                                        关闭窗口
                                    </button>
                                    <button 
                                        onClick={printBatchVouchers} 
                                        className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-1"
                                        style={{ minHeight: '44px' }}
                                    >
                                        <ExternalLink size={13}/>
                                        打印成套单据 ({selectedPaymentIds.length}张)
                                    </button>
                                </div>
                            </div>

                            {/* Right Live Document Preview Box (Batch) */}
                            <div className="flex-grow p-6 md:p-8 overflow-y-auto bg-stone-200/50 space-y-6">
                                <div id="printable-batch-vouchers" className="w-full max-w-2xl mx-auto space-y-6">
                                    {payments.filter(p => selectedPaymentIds.includes(p.id)).map((p) => {
                                        const currentVoucherNo = getVoucherNo(p, batchVoucherType);
                                        return (
                                            <div 
                                                key={p.id} 
                                                className="batch-print-page bg-white border border-stone-300 rounded-3xl p-10 text-black select-all relative overflow-hidden"
                                                style={{ minHeight: '135mm' }}
                                            >
                                                {/* Background simulated red receipt stamp chop */}
                                                {batchVoucherChopEnabled && (
                                                    <div className="absolute right-12 top-24 select-none z-10 pointer-events-none transform rotate-12 opacity-80 scale-100 transition-all duration-300">
                                                        <div className="w-24 h-24 rounded-full border-4 border-double border-red-500 p-1 flex flex-col justify-center items-center text-center font-black">
                                                            <div className="text-[10px] border-b border-red-500 tracking-wider">KIM LIAN KEE</div>
                                                            <div className="text-xs uppercase text-red-500 font-bold tracking-tight">APPROVED</div>
                                                            <div className="text-[8px] tracking-widest text-red-400">財務已訖</div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Document Header Section */}
                                                <div className="border-b-2 border-stone-900 pb-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <h1 className="font-extrabold text-xl tracking-tight text-stone-950 uppercase">
                                                            {COMPANY_INFO.name}
                                                        </h1>
                                                        <p className="text-[9px] text-stone-400 font-extrabold tracking-wide uppercase">
                                                            KIM LIAN KEE RESTAURANT GROUP &bull; 对账付款收据联
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <h2 className="font-black text-sm tracking-wider text-stone-900 border-2 border-stone-900 px-3 py-1 rounded inline-block uppercase">
                                                            {batchVoucherTitle || 'RECONCILIATION RECEIPT'}
                                                        </h2>
                                                    </div>
                                                </div>

                                                {/* Core Details Grid */}
                                                <div className="space-y-5 mb-8 text-xs">
                                                    <div className="grid grid-cols-2 gap-4 border-b border-stone-200 pb-3">
                                                        <div>
                                                            <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider mb-0.5">对账日期 DATE</span>
                                                            <span className="text-xs font-mono font-black text-stone-900">{p.date}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider mb-0.5">单据编号 RECEIPT NO</span>
                                                            <span className="text-xs font-mono font-black text-stone-900">{currentVoucherNo}</span>
                                                        </div>
                                                    </div>

                                                    <div className="border-b border-stone-200 pb-3">
                                                        <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider mb-0.5">款项用途与对账内容 CONTENT / PARTICULARS</span>
                                                        <div className="text-xs font-black text-stone-900 mt-0.5">
                                                            {bills.find(b => b.id === p.billId)?.name || p.name} ({p.category})
                                                        </div>
                                                        <div className="text-[10px] text-stone-400 font-bold mt-1">
                                                            SST / Standard payment voucher verified & compiled under transaction ID {p.id}. 
                                                            {p.referenceNo ? ` | Ref No: ${p.referenceNo}` : ''}
                                                        </div>
                                                    </div>

                                                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <span className="text-[9px] font-black uppercase text-stone-500 block tracking-wider">支付总额 AMOUNT</span>
                                                            <span className="text-[10px] font-black text-stone-800 uppercase tracking-tight italic mt-0.5 block truncate">
                                                                {numberToWords(p.amount)} ONLY
                                                            </span>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className="text-base font-mono font-black text-stone-950 bg-stone-200 px-4 py-1.5 rounded-xl border border-stone-200 block">
                                                                RM {p.amount.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Signatures Fields block */}
                                                <div className="grid grid-cols-2 gap-8 pt-10 border-t border-dashed border-stone-200 mt-12 text-center print-no-break">
                                                    <div className="flex flex-col justify-end h-20">
                                                        <div className="font-mono text-xs font-bold text-stone-800 underline decoration-stone-300 underline-offset-4">{batchVoucherPreparedBy}</div>
                                                        <div className="border-t border-stone-400 pt-1 text-[10px] font-black uppercase text-stone-500">AUTHORIZED SIGNATURE</div>
                                                        <span className="text-[8px] text-stone-400 font-bold block">(批准/制单人签名)</span>
                                                    </div>
                                                    <div className="flex flex-col justify-end h-20">
                                                        <div className="border-t border-stone-400 pt-1 text-[10px] font-black uppercase text-stone-500">RECIPIENT / PAYEE SIGNATURE</div>
                                                        <span className="text-[8px] text-stone-400 font-bold block">(收款/交接人签名)</span>
                                                    </div>
                                                </div>

                                                <div className="mt-8 pt-4 border-t border-stone-100 text-[8px] text-stone-400 text-center uppercase tracking-widest leading-relaxed">
                                                    SYSTEM SECURITY SECURED TRANS-LOG &bull; SYSTEM CODE: {p.id}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 账单资料修正 */}
                {isBillFixOpen && (
                    <BillDataFixModal
                        isOpen={isBillFixOpen}
                        onClose={() => setIsBillFixOpen(false)}
                        bills={bills}
                        payments={payments}
                        onSave={handleSaveBillFix}
                    />
                )}

                {/* 补录仪表读数 */}
                {isMeterBackfillOpen && (
                    <MeterBackfillModal
                        isOpen={isMeterBackfillOpen}
                        onClose={() => setIsMeterBackfillOpen(false)}
                        payments={payments}
                        onSave={handleSaveMeterBackfill}
                    />
                )}

            </div>
        </div>
    );
};