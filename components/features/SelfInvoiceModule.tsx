import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    FileText, Plus, Search, X, Save, Trash2, Calendar, Download, 
    Sparkles, RefreshCw, Printer, User, Coins, Receipt, ArrowLeft, ArrowLeftRight, ChevronDown, SlidersHorizontal
} from 'lucide-react';
import { SelfIssuedVoucher, SelfVoucherItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { applyResolvedStylesForPdf, waitForPdfFonts } from '../../utils/pdfStyleResolver';

// Preset default voucher values for quick-fill
const QUICK_CONTENT_PRESETS = [
    { description: '运输路费 / Transport charges (Raw Materials Delivery)', qty: 1, unitPrice: 150, unit: '趟' },
    { description: '临时小额买菜 / Minor cash purchase for urgent ingredients', qty: 1, unitPrice: 45, unit: '次' },
    { description: '临时杂工清洁费 / One-time helper cleaning fee & maintenance', qty: 1, unitPrice: 120, unit: '次' },
    { description: '五金配件买螺丝没有单据 / Hardwares & screws replacement (No original receipt)', qty: 1, unitPrice: 28, unit: '组' },
    { description: '紧急运货冰块 / Urgent ice bags delivery', qty: 4, unitPrice: 12, unit: '包' },
];

const VOUCHER_TYPE_FILTERS = [
    { id: 'ALL', label: '全部' },
    { id: 'CASH_BILL', label: '现金账单' },
    { id: 'PAYMENT_VOUCHER', label: '付款证明' },
    { id: 'DELIVERY_RECEIPT', label: '运费单' },
    { id: 'CASH_VOUCHER', label: '现金条' },
    { id: 'PURCHASE_RECEIPT', label: '无单采买' },
];

interface SelfInvoiceModuleProps {
    onClose: () => void;
}

export const SelfInvoiceModule: React.FC<SelfInvoiceModuleProps> = ({ onClose }) => {
    const [vouchers, setVouchers] = useState<SelfIssuedVoucher[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [entryMode, setEntryMode] = useState<'QUICK' | 'ITEMIZED'>('QUICK');
    const [showAdvancedFields, setShowAdvancedFields] = useState(false);
    
    // Core edit form state
    const [editingVoucher, setEditingVoucher] = useState<Partial<SelfIssuedVoucher>>({});
    const [voucherItems, setVoucherItems] = useState<SelfVoucherItem[]>([]);
    const [apPrefillRef, setApPrefillRef] = useState<{ company: string; date: string; totalAmount: number; particulars: string; billRefId: string } | null>(null);
    
    // Status controls
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState<string | null>(null); // holds voucherId when downloading
    const [previewVoucher, setPreviewVoucher] = useState<SelfIssuedVoucher | null>(null);
    const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
    const [mobilePreviewScale, setMobilePreviewScale] = useState(() =>
        typeof window === 'undefined' ? 1 : Math.min(1, Math.max(0.45, (window.innerWidth - 24) / 595))
    );
    const [capturedImgUrl, setCapturedImgUrl] = useState<string | null>(null);
    const [, ] = useState(false);

    // Filter controls
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('ALL');
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);

    // === BATCH PRINT STATES ===
    const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
    const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
    const [batchVoucherTitle, setBatchVoucherTitle] = useState('RECONCILIATION RECEIPT / VOUCHER');
    const [batchVoucherPreparedBy, setBatchVoucherPreparedBy] = useState('Admin Office');
    const [batchVoucherCheckedBy, setBatchVoucherCheckedBy] = useState('Financial Manager');
    const [batchVoucherApprovedBy, setBatchVoucherApprovedBy] = useState('Managing Director');
    const [batchVoucherChopEnabled, setBatchVoucherChopEnabled] = useState(true);

    // === BULK SMART GENERATOR STATES ===
    const [isBulkGeneratorOpen, setIsBulkGeneratorOpen] = useState(false);
    const [bulkGenPayeeName, setBulkGenPayeeName] = useState('');
    const [bulkGenPayeePhone, setBulkGenPayeePhone] = useState('');
    const [bulkGenPayeeType, setBulkGenPayeeType] = useState<'INDIVIDUAL' | 'AGENT' | 'DRIVER' | 'INFORMAL_VENDOR'>('INFORMAL_VENDOR');
    const [bulkGenVoucherType, setBulkGenVoucherType] = useState<'CASH_BILL' | 'PAYMENT_VOUCHER' | 'DELIVERY_RECEIPT' | 'CASH_VOUCHER' | 'PURCHASE_RECEIPT'>('PURCHASE_RECEIPT');
    const [bulkGenCompanyName, setBulkGenCompanyName] = useState('金莲记甲洞(Kim Lian Kee - Kepong)');
    const [bulkGenTemplateStyle, setBulkGenTemplateStyle] = useState<'VINTAGE_GOLD' | 'MODERN_DARK' | 'TRADITIONAL_CARBON' | 'EMERALD_CLEAN' | 'CASH_BILL_GREEN'>('CASH_BILL_GREEN');
    const [bulkGenNotes, setBulkGenNotes] = useState('批量自动生成账单明细。');
    const [bulkGenMonth, setBulkGenMonth] = useState(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    });
    const [bulkGenCount, setBulkGenCount] = useState(13); // Default 13 sheets (like the user's Fish Cake example)
    const [bulkGenItemDesc, setBulkGenItemDesc] = useState('');
    const [bulkGenItemQty, setBulkGenItemQty] = useState(1);
    const [bulkGenItemUnitPrice, setBulkGenItemUnitPrice] = useState(50);
    const [bulkGenItemUnit, setBulkGenItemUnit] = useState('次');
    const [bulkGenEnableFluctuation, setBulkGenEnableFluctuation] = useState(true);
    const [bulkGenAmountFluctuation, setBulkGenAmountFluctuation] = useState(8); // +/- 8% realistic price variation
    const [bulkGenDateMode, setBulkGenDateMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
    const [bulkGenSelectedDays, setBulkGenSelectedDays] = useState<number[]>([]);
    const [bulkPreviewItems, setBulkPreviewItems] = useState<{
        id: string;
        date: string;
        qty: number;
        unitPrice: number;
        amount: number;
    }[]>([]);

    // Starred Payee List Persistence
    const [savedPayees, ] = useState<{name: string, phone: string, type: 'INDIVIDUAL' | 'AGENT' | 'DRIVER' | 'INFORMAL_VENDOR'}[]>(() => {
        try {
            const stored = localStorage.getItem('klk_starred_payees');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    });

    // Google Drive integration state
    const [, ] = useState<'IDLE' | 'GENERATING' | 'SHARING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [, ] = useState<string | null>(null);

    // Initial load
    useEffect(() => {
        loadVouchers();
    }, []);

    // Clear selection when filters change
    useEffect(() => {
        setSelectedVoucherIds([]);
    }, [searchTerm, selectedTypeFilter, selectedCompanyFilter, startDate, endDate]);

    useEffect(() => {
        if (!isBulkGeneratorOpen) {
            setBulkPreviewItems([]);
        }
    }, [isBulkGeneratorOpen]);

    useEffect(() => {
        const updateMobilePreviewScale = () => {
            setMobilePreviewScale(Math.min(1, Math.max(0.45, (window.innerWidth - 24) / 595)));
        };
        updateMobilePreviewScale();
        window.addEventListener('resize', updateMobilePreviewScale);
        return () => window.removeEventListener('resize', updateMobilePreviewScale);
    }, []);

    const loadVouchers = async () => {
        const list = await DataManager.getSelfIssuedVouchers();
        // Sanitize any historically saved "吉隆坡金莲记" to "金莲记甲洞"
        const sanitized = list.map(v => ({
            ...v,
            companyName: (v.companyName || '').replace(/吉隆坡金莲记/g, '金莲记甲洞')
        }));
        // Sort newest first
        const sortedList = sanitized.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setVouchers(sortedList);

        // 👑 Check for prefilled data from Accounts Payable (AP) to avoid race conditions
        try {
            const prefillStr = localStorage.getItem('klk_prefill_self_invoice');
            if (prefillStr) {
                const prefill = JSON.parse(prefillStr);
                setApPrefillRef(prefill); // Store reference for side-by-side verification banner

                const todayStr = prefill.date || new Date().toISOString().split('T')[0];
                const payeeName = prefill.company || prefill.payeeName || '';
                const totalAmt = Number(prefill.totalAmount || prefill.amount || 0);
                const particularsDesc = prefill.particulars || prefill.description || '采购物品支出 (COGS Purchase)';
                
                // Helper to generate seq no over the list we just fetched
                const dateStr = todayStr.replace(/-/g, '').substring(2); // e.g. "260622"
                const sameDayVouchers = sortedList.filter(v => v.date === todayStr);
                let nextSeq = 1;
                if (sameDayVouchers.length > 0) {
                    const seqs = sameDayVouchers.map(v => {
                        if (!v.voucherNo) return 0;
                        const parts = v.voucherNo.split('-');
                        const lastPart = parts[parts.length - 1];
                        const parsed = parseInt(lastPart, 10);
                        return isNaN(parsed) ? 0 : parsed;
                    });
                    const maxSeq = Math.max(...seqs, 0);
                    nextSeq = maxSeq + 1;
                }
                const seqStr = nextSeq < 10 ? `0${nextSeq}` : String(nextSeq);
                const autoNo = `PR-${dateStr}-${seqStr}`;

                setEditingVoucher({
                    id: `vouc_${Date.now()}`,
                    voucherType: 'PURCHASE_RECEIPT',
                    companyName: '金莲记甲洞(Kim Lian Kee - Kepong)',
                    date: todayStr,
                    voucherNo: autoNo,
                    payeeName: payeeName,
                    payeePhone: '',
                    payeeType: 'INFORMAL_VENDOR',
                    isSelfIssued: true,
                    preparedBy: 'Jaz',
                    approvedBy: 'Approved by Management',
                    paymentMethod: 'CASH',
                    notes: `This supplier purchased billing transaction is generated automatically to cover zero-receipt ingredients/COGS purchase under compliance (Linked to AP Entry: ${prefill.billRefId || ''}).`,
                    templateStyle: 'CASH_BILL_GREEN',
                });

                setVoucherItems([
                    { 
                        description: particularsDesc, 
                        qty: 1, 
                        unitPrice: totalAmt, 
                        unit: '项', 
                        amount: totalAmt 
                    }
                ]);

                setIsFormOpen(true); // Automatically open the creator form
            }
        } catch (e) {
            console.error("Failed to parse prefill self invoice", e);
        }
    };

    const generateSequenceNoForDate = (targetDate: string, vType?: string): string => {
        const dateStr = targetDate.replace(/-/g, '').substring(2); // e.g. "260622" (YYMMDD)
        // Filter vouchers that have the exact same date
        const sameDayVouchers = vouchers.filter(v => v.date === targetDate);
        
        let nextSeq = 1;
        if (sameDayVouchers.length > 0) {
            // Find the highest sequence number for that day
            const seqs = sameDayVouchers.map(v => {
                if (!v.voucherNo) return 0;
                const parts = v.voucherNo.split('-');
                const lastPart = parts[parts.length - 1];
                const parsed = parseInt(lastPart, 10);
                return isNaN(parsed) ? 0 : parsed;
            });
            const maxSeq = Math.max(...seqs, 0);
            nextSeq = maxSeq + 1;
        }
        
        // Format as 2-digit sequential index (e.g. "01", "02") to be shorter and cleaner
        const seqStr = nextSeq < 10 ? `0${nextSeq}` : String(nextSeq);
        const typeSelected = vType || editingVoucher?.voucherType || 'CASH_BILL';
        
        let prefix = 'CB';
        if (typeSelected === 'PAYMENT_VOUCHER') prefix = 'PV';
        else if (typeSelected === 'DELIVERY_RECEIPT') prefix = 'DR';
        else if (typeSelected === 'CASH_VOUCHER') prefix = 'CV';
        else if (typeSelected === 'PURCHASE_RECEIPT') prefix = 'PR';
        
        return `${prefix}-${dateStr}-${seqStr}`;
    };

    const handleOpenCreateNew = () => {
        // Auto-generate sequential invoice/voucher number for today
        const todayStr = new Date().toISOString().split('T')[0];
        const autoNo = generateSequenceNoForDate(todayStr, 'PURCHASE_RECEIPT');

        setEditingVoucher({
            id: `vouc_${Date.now()}`,
            voucherType: 'PURCHASE_RECEIPT',
            companyName: '金莲记甲洞(Kim Lian Kee - Kepong)',
            date: todayStr,
            voucherNo: autoNo,
            payeeName: '',
            payeePhone: '',
            payeeType: 'INFORMAL_VENDOR',
            isSelfIssued: true,
            preparedBy: 'Jaz',
            approvedBy: 'Approved by Management',
            paymentMethod: 'CASH',
            notes: 'This cash bill is created to cover local cash transaction or driver freight fee for accounting reference.',
            templateStyle: 'CASH_BILL_GREEN',
        });
        setVoucherItems([
            { description: '', qty: 1, unitPrice: 0, unit: '项', amount: 0 }
        ]);
        setEntryMode('QUICK');
        setShowAdvancedFields(false);
        setIsFormOpen(true);
    };

    const handleOpenEdit = (voucher: SelfIssuedVoucher) => {
        setEditingVoucher({ ...voucher });
        setVoucherItems([...voucher.items]);
        setEntryMode(voucher.items.length > 1 ? 'ITEMIZED' : 'QUICK');
        setShowAdvancedFields(false);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setApPrefillRef(null);
        localStorage.removeItem('klk_prefill_self_invoice');
    };

    const handleAddItemRow = () => {
        setVoucherItems([
            ...voucherItems,
            { description: '', qty: 1, unitPrice: 0, unit: '件', amount: 0 }
        ]);
    };

    const handleQuickPresetFill = (idx: number, preset: typeof QUICK_CONTENT_PRESETS[0]) => {
        const list = [...voucherItems];
        list[idx] = {
            ...list[idx],
            description: preset.description,
            qty: preset.qty,
            unitPrice: preset.unitPrice,
            unit: preset.unit,
            amount: preset.qty * preset.unitPrice
        };
        setVoucherItems(list);
    };

    const handleRemoveItemRow = (index: number) => {
        if (voucherItems.length <= 1) return;
        setVoucherItems(voucherItems.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: keyof SelfVoucherItem, val: string | number) => {
        const list = [...voucherItems];
        const item = { ...list[index], [field]: val };
        
        // Re-calc amount
        const qty = field === 'qty' ? Number(val) : Number(item.qty || 0);
        const price = field === 'unitPrice' ? Number(val) : Number(item.unitPrice || 0);
        item.amount = Math.round((qty * price) * 100) / 100;
        
        list[index] = item;
        setVoucherItems(list);
    };

    const handleSave = async () => {
        if (!editingVoucher.payeeName?.trim()) {
            alert("⚠️ 请填写收款人 / 临时司机姓名");
            return;
        }
        if (!editingVoucher.voucherNo?.trim()) {
            alert("⚠️ 请填写凭单单号");
            return;
        }

        setIsSaving(true);
        try {
            const finalItems = voucherItems.map(item => {
                const qtyVal = Number(item.qty || 0);
                const priceVal = Number(item.unitPrice || 0);
                return {
                    ...item,
                    qty: qtyVal,
                    unitPrice: priceVal,
                    amount: Math.round((qtyVal * priceVal) * 100) / 100
                };
            });
            const total = finalItems.reduce((sum, item) => sum + item.amount, 0);

            const record: SelfIssuedVoucher = {
                id: editingVoucher.id || `vouc_${Date.now()}`,
                voucherType: editingVoucher.voucherType || 'PAYMENT_VOUCHER',
                companyName: editingVoucher.companyName || '金莲记甲洞(Kim Lian Kee - Kepong)',
                date: editingVoucher.date || new Date().toISOString().split('T')[0],
                voucherNo: editingVoucher.voucherNo,
                payeeName: editingVoucher.payeeName,
                payeePhone: editingVoucher.payeePhone || '',
                payeeType: editingVoucher.payeeType || 'DRIVER',
                isSelfIssued: editingVoucher.isSelfIssued ?? true,
                items: finalItems,
                totalAmount: total,
                preparedBy: editingVoucher.preparedBy || 'Jaz',
                approvedBy: editingVoucher.approvedBy || '',
                paymentMethod: editingVoucher.paymentMethod || 'CASH',
                notes: editingVoucher.notes || '',
                templateStyle: editingVoucher.templateStyle || 'VINTAGE_GOLD',
                createdAt: editingVoucher.createdAt || new Date().toISOString(),
            };

            await DataManager.saveSelfIssuedVoucher(record);
            setIsFormOpen(false);
            setApPrefillRef(null);
            localStorage.removeItem('klk_prefill_self_invoice');
            loadVouchers();
            setPreviewVoucher(record);
            alert("✨ 凭单保存成功！您可以点击预览下载高清晰 A5 印刷格式。");
        } catch (error) {
            console.error(error);
            alert("❌ 保存失败，请检查数据。");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("⚠️ 确定要删除该张自制凭单记录吗？删除后将无法恢复。")) return;
        await DataManager.deleteSelfIssuedVoucher(id);
        if (previewVoucher?.id === id) setPreviewVoucher(null);
        loadVouchers();
    };

    // Calculate sum helper
    const calculateTotal = (items: SelfVoucherItem[]) => {
        return items.reduce((sum, i) => sum + (i.qty * i.unitPrice), 0);
    };

    // Export high-resolution A5 Size PDF
    const handleDownloadA5PDF = async (voucher: SelfIssuedVoucher) => {
        setIsExporting(voucher.id);
        setPreviewVoucher(voucher); // Explicitly ensure preview synced for capturing
        try {
            // Locate offscreen A5 rendering container
            const captureNode = document.getElementById(`a5-capture-global`);
            if (!captureNode) {
                alert("找不到导出节点，请稍候重试！");
                return;
            }

            // Wait a tiny bit for layout stability of the offscreen node
            await new Promise((resolve) => setTimeout(resolve, 300));

            await waitForPdfFonts();
            const canvas = await html2canvas(captureNode, {
                scale: 2.2, // high-res crisp typography
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: 595,
                windowHeight: 842,
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('a5-capture-global');
                    const originalEl = document.getElementById('a5-capture-global');
                    if (originalEl && clonedEl) {
                        applyResolvedStylesForPdf(originalEl as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            // Change page format to A5 size
            const pdf = new jsPDF('p', 'mm', 'a5');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
            
            // Format filename safely
            const safePayee = voucher.payeeName.replace(/[\s\W]+/g, '_');
            pdf.save(`VOUCHER_${voucher.voucherNo}_${safePayee}.pdf`);
        } catch (e: any) {
            console.error("A5 PDF Generation Error: ", e);
            alert("PDF生成错误: " + (e?.message || e?.toString() || JSON.stringify(e)));
        } finally {
            setIsExporting(null);
        }
    };

    const filteredVouchers = vouchers.filter(v => {
        const matchesSearch = v.payeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              v.voucherNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (v.notes && v.notes.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesType = selectedTypeFilter === 'ALL' || v.voucherType === selectedTypeFilter;
        
        const matchesCompany = selectedCompanyFilter === 'ALL' || v.companyName === selectedCompanyFilter;
        
        const matchesStartDate = !startDate || v.date >= startDate;
        const matchesEndDate = !endDate || v.date <= endDate;
        
        return matchesSearch && matchesType && matchesCompany && matchesStartDate && matchesEndDate;
    });

    const filteredTotalSum = filteredVouchers.reduce((sum, v) => sum + (v.totalAmount || 0), 0);

    // === BATCH SELECTION HANDLERS ===
    const handleSelectVoucherToggle = (id: string) => {
        setSelectedVoucherIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(x => x !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const isAllVouchersSelected = filteredVouchers.length > 0 && filteredVouchers.every(v => selectedVoucherIds.includes(v.id));

    const handleSelectAllVouchersToggle = () => {
        if (isAllVouchersSelected) {
            setSelectedVoucherIds([]);
        } else {
            setSelectedVoucherIds(filteredVouchers.map(v => v.id));
        }
    };

    const handleBatchDeleteVouchers = async () => {
        if (selectedVoucherIds.length === 0) return;
        if (!confirm(`⚠️ 确定要批量删除这 ${selectedVoucherIds.length} 张自制凭单记录吗？此操作不可恢复！`)) return;
        
        setIsSaving(true);
        try {
            for (const id of selectedVoucherIds) {
                await DataManager.deleteSelfIssuedVoucher(id);
            }
            setSelectedVoucherIds([]);
            await loadVouchers();
            if (previewVoucher && selectedVoucherIds.includes(previewVoucher.id)) {
                setPreviewVoucher(null);
            }
            alert("✨ 批量删除成功！");
        } catch (e) {
            console.error("Batch delete vouchers failed", e);
            alert("❌ 批量删除失败");
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenBatchPrintModal = () => {
        if (selectedVoucherIds.length === 0) {
            alert("请先选择要批量打印/生成的自制凭单");
            return;
        }
        setBatchVoucherTitle('RECONCILIATION RECEIPT / VOUCHER');
        setBatchVoucherPreparedBy(localStorage.getItem('user_display_name') || 'Admin Office');
        setBatchVoucherCheckedBy('Financial Manager');
        setBatchVoucherApprovedBy('Managing Director');
        setBatchVoucherChopEnabled(true);
        setIsBatchPrintModalOpen(true);
    };

    const generateDraftVouchers = () => {
        if (!bulkGenPayeeName.trim()) {
            alert("⚠️ 请填写收款人/供应商名称 (如: Fish Cake Supplier)");
            return;
        }
        if (!bulkGenItemDesc.trim()) {
            alert("⚠️ 请填写货品明细 (如: Fish Cake / 鱼饼)");
            return;
        }
        
        if (bulkGenDateMode === 'MANUAL' && bulkGenSelectedDays.length === 0) {
            alert("⚠️ 请在下方的日历/日期网格中，点击选择至少一个需要生成凭单的日期！");
            return;
        }

        if (bulkGenDateMode === 'AUTO' && bulkGenCount <= 0) {
            alert("⚠️ 请输入要生成的凭单张数 (e.g. 13)");
            return;
        }

        const [yearStr, monthStr] = bulkGenMonth.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let generatedDates: string[] = [];
        
        if (bulkGenDateMode === 'MANUAL') {
            generatedDates = bulkGenSelectedDays.map(day => {
                return `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
            });
        } else {
            if (bulkGenCount === 1) {
                const day = Math.floor(daysInMonth / 2) || 1;
                const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                generatedDates.push(dateStr);
            } else {
                const interval = (daysInMonth - 2) / (bulkGenCount - 1);
                for (let i = 0; i < bulkGenCount; i++) {
                    let dayFloat = 1 + i * interval;
                    let day = Math.round(dayFloat);
                    if (i > 0 && i < bulkGenCount - 1) {
                        const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
                        day = Math.max(1, Math.min(daysInMonth, day + jitter));
                    }
                    const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                    generatedDates.push(dateStr);
                }
            }
        }

        generatedDates.sort();

        const draftItems = generatedDates.map((targetDate, i) => {
            let qty = Number(bulkGenItemQty || 1);
            let unitPrice = Number(bulkGenItemUnitPrice || 0);

            if (bulkGenEnableFluctuation) {
                const fluctuationPercent = (Math.random() * 2 - 1) * (bulkGenAmountFluctuation / 100);
                unitPrice = unitPrice * (1 + fluctuationPercent);
                unitPrice = Math.round(unitPrice * 100) / 100;
                
                if (qty > 3) {
                    const maxQtyChange = Math.floor(qty * 0.12);
                    if (maxQtyChange > 0) {
                        const qtyChange = Math.floor(Math.random() * (maxQtyChange * 2 + 1)) - maxQtyChange;
                        qty = qty + qtyChange;
                    }
                }
            }

            const amount = Math.round((qty * unitPrice) * 100) / 100;

            return {
                id: `draft_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
                date: targetDate,
                qty,
                unitPrice,
                amount
            };
        });

        setBulkPreviewItems(draftItems);
    };

    const handleBulkGenerate = async () => {
        if (!bulkGenPayeeName.trim()) {
            alert("⚠️ 请填写收款人/供应商名称 (如: Fish Cake Supplier)");
            return;
        }
        if (!bulkGenItemDesc.trim()) {
            alert("⚠️ 请填写货品明细 (如: Fish Cake / 鱼饼)");
            return;
        }
        
        if (bulkPreviewItems.length === 0) {
            if (bulkGenDateMode === 'MANUAL' && bulkGenSelectedDays.length === 0) {
                alert("⚠️ 请在下方的日历/日期网格中，点击选择至少一个需要生成凭单的日期！");
                return;
            }

            if (bulkGenDateMode === 'AUTO' && bulkGenCount <= 0) {
                alert("⚠️ 请输入要生成的凭单张数 (e.g. 13)");
                return;
            }
        }

        setIsSaving(true);
        try {
            let currentVouchers = [...vouchers];
            const newlyCreatedVoucherIds: string[] = [];
            let totalToGenerateCount = 0;

            if (bulkPreviewItems.length > 0) {
                // Use customized preview items
                totalToGenerateCount = bulkPreviewItems.length;
                for (let i = 0; i < bulkPreviewItems.length; i++) {
                    const previewItem = bulkPreviewItems[i];
                    const targetDate = previewItem.date;
                    
                    const sameDayVouchers = currentVouchers.filter(v => v.date === targetDate);
                    let nextSeq = 1;
                    if (sameDayVouchers.length > 0) {
                        const seqs = sameDayVouchers.map(v => {
                            if (!v.voucherNo) return 0;
                            const parts = v.voucherNo.split('-');
                            const lastPart = parts[parts.length - 1];
                            const parsed = parseInt(lastPart, 10);
                            return isNaN(parsed) ? 0 : parsed;
                        });
                        const maxSeq = Math.max(...seqs, 0);
                        nextSeq = maxSeq + 1;
                    }
                    const seqStr = nextSeq < 10 ? `0${nextSeq}` : String(nextSeq);
                    
                    let prefix = 'CB';
                    if (bulkGenVoucherType === 'PAYMENT_VOUCHER') prefix = 'PV';
                    else if (bulkGenVoucherType === 'DELIVERY_RECEIPT') prefix = 'DR';
                    else if (bulkGenVoucherType === 'CASH_VOUCHER') prefix = 'CV';
                    else if (bulkGenVoucherType === 'PURCHASE_RECEIPT') prefix = 'PR';

                    const dateStrForNo = targetDate.replace(/-/g, '').substring(2);
                    const voucherNo = `${prefix}-${dateStrForNo}-${seqStr}`;

                    const qty = previewItem.qty;
                    const unitPrice = previewItem.unitPrice;
                    const amount = previewItem.amount;

                    const newVoucher: SelfIssuedVoucher = {
                        id: `vouc_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
                        voucherType: bulkGenVoucherType,
                        companyName: bulkGenCompanyName,
                        date: targetDate,
                        voucherNo,
                        payeeName: bulkGenPayeeName,
                        payeePhone: bulkGenPayeePhone,
                        payeeType: bulkGenPayeeType,
                        isSelfIssued: true,
                        items: [
                            {
                                description: bulkGenItemDesc,
                                qty,
                                unitPrice,
                                amount,
                                unit: bulkGenItemUnit || undefined
                            }
                        ],
                        totalAmount: amount,
                        preparedBy: localStorage.getItem('user_display_name') || 'Admin Office',
                        approvedBy: 'Financial Manager',
                        notes: bulkGenNotes || '批量智能快速生成的对账补充单据。',
                        templateStyle: bulkGenTemplateStyle,
                        createdAt: new Date().toISOString(),
                    };

                    await DataManager.saveSelfIssuedVoucher(newVoucher);
                    currentVouchers.push(newVoucher);
                    newlyCreatedVoucherIds.push(newVoucher.id);
                }
            } else {
                // Standard automatic generation path
                const [yearStr, monthStr] = bulkGenMonth.split('-');
                const year = parseInt(yearStr, 10);
                const month = parseInt(monthStr, 10) - 1;

                const daysInMonth = new Date(year, month + 1, 0).getDate();

                let generatedDates: string[] = [];
                
                if (bulkGenDateMode === 'MANUAL') {
                    generatedDates = bulkGenSelectedDays.map(day => {
                        return `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                    });
                } else {
                    if (bulkGenCount === 1) {
                        const day = Math.floor(daysInMonth / 2) || 1;
                        const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                        generatedDates.push(dateStr);
                    } else {
                        const interval = (daysInMonth - 2) / (bulkGenCount - 1);
                        for (let i = 0; i < bulkGenCount; i++) {
                            let dayFloat = 1 + i * interval;
                            let day = Math.round(dayFloat);
                            if (i > 0 && i < bulkGenCount - 1) {
                                const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
                                day = Math.max(1, Math.min(daysInMonth, day + jitter));
                            }
                            const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                            generatedDates.push(dateStr);
                        }
                    }
                }

                generatedDates.sort();
                totalToGenerateCount = generatedDates.length;

                for (let i = 0; i < generatedDates.length; i++) {
                    const targetDate = generatedDates[i];
                    
                    const sameDayVouchers = currentVouchers.filter(v => v.date === targetDate);
                    let nextSeq = 1;
                    if (sameDayVouchers.length > 0) {
                        const seqs = sameDayVouchers.map(v => {
                            if (!v.voucherNo) return 0;
                            const parts = v.voucherNo.split('-');
                            const lastPart = parts[parts.length - 1];
                            const parsed = parseInt(lastPart, 10);
                            return isNaN(parsed) ? 0 : parsed;
                        });
                        const maxSeq = Math.max(...seqs, 0);
                        nextSeq = maxSeq + 1;
                    }
                    const seqStr = nextSeq < 10 ? `0${nextSeq}` : String(nextSeq);
                    
                    let prefix = 'CB';
                    if (bulkGenVoucherType === 'PAYMENT_VOUCHER') prefix = 'PV';
                    else if (bulkGenVoucherType === 'DELIVERY_RECEIPT') prefix = 'DR';
                    else if (bulkGenVoucherType === 'CASH_VOUCHER') prefix = 'CV';
                    else if (bulkGenVoucherType === 'PURCHASE_RECEIPT') prefix = 'PR';

                    const dateStrForNo = targetDate.replace(/-/g, '').substring(2);
                    const voucherNo = `${prefix}-${dateStrForNo}-${seqStr}`;

                    let qty = Number(bulkGenItemQty || 1);
                    let unitPrice = Number(bulkGenItemUnitPrice || 0);

                    if (bulkGenEnableFluctuation) {
                        const fluctuationPercent = (Math.random() * 2 - 1) * (bulkGenAmountFluctuation / 100);
                        unitPrice = unitPrice * (1 + fluctuationPercent);
                        unitPrice = Math.round(unitPrice * 100) / 100;
                        
                        if (qty > 3) {
                            const maxQtyChange = Math.floor(qty * 0.12);
                            if (maxQtyChange > 0) {
                                const qtyChange = Math.floor(Math.random() * (maxQtyChange * 2 + 1)) - maxQtyChange;
                                qty = qty + qtyChange;
                            }
                        }
                    }

                    const amount = Math.round((qty * unitPrice) * 100) / 100;

                    const newVoucher: SelfIssuedVoucher = {
                        id: `vouc_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
                        voucherType: bulkGenVoucherType,
                        companyName: bulkGenCompanyName,
                        date: targetDate,
                        voucherNo,
                        payeeName: bulkGenPayeeName,
                        payeePhone: bulkGenPayeePhone,
                        payeeType: bulkGenPayeeType,
                        isSelfIssued: true,
                        items: [
                            {
                                description: bulkGenItemDesc,
                                qty,
                                unitPrice,
                                amount,
                                unit: bulkGenItemUnit || undefined
                            }
                        ],
                        totalAmount: amount,
                        preparedBy: localStorage.getItem('user_display_name') || 'Admin Office',
                        approvedBy: 'Financial Manager',
                        notes: bulkGenNotes || '批量智能快速生成的对账补充单据。',
                        templateStyle: bulkGenTemplateStyle,
                        createdAt: new Date().toISOString(),
                    };

                    await DataManager.saveSelfIssuedVoucher(newVoucher);
                    currentVouchers.push(newVoucher);
                    newlyCreatedVoucherIds.push(newVoucher.id);
                }
            }

            await loadVouchers();
            setIsBulkGeneratorOpen(false);
            
            // Auto-select newly generated ones for immediate batch print or view
            setSelectedVoucherIds(newlyCreatedVoucherIds);

            // Set the first generated voucher as preview
            const firstGen = currentVouchers.find(v => v.id === newlyCreatedVoucherIds[0]);
            if (firstGen) {
                setPreviewVoucher(firstGen);
            }

            alert(`🎉 成功智能批量生成 ${totalToGenerateCount} 张自制凭单！\n已自动为您全选这 ${totalToGenerateCount} 张单据，您可以立刻点击“批量打印”成套输出 A5 账单！`);
        } catch (error) {
            console.error("Bulk generate failed", error);
            alert("❌ 批量生成凭单失败，请重试。");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSelectPresetDays = (presetType: 'ODD' | 'EVEN' | 'MON_WED_FRI' | 'CLEAR') => {
        const [yStr, mStr] = bulkGenMonth.split('-');
        const y = parseInt(yStr, 10) || 2026;
        const m = (parseInt(mStr, 10) - 1) || 4;
        const totalDays = new Date(y, m + 1, 0).getDate();
        
        if (presetType === 'CLEAR') {
            setBulkGenSelectedDays([]);
            return;
        }

        let days: number[] = [];
        for (let d = 1; d <= totalDays; d++) {
            if (presetType === 'ODD' && d % 2 !== 0) {
                days.push(d);
            } else if (presetType === 'EVEN' && d % 2 === 0) {
                days.push(d);
            } else if (presetType === 'MON_WED_FRI') {
                const dateObj = new Date(y, m, d);
                const dayOfWeek = dateObj.getDay();
                if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
                    days.push(d);
                }
            }
        }
        setBulkGenSelectedDays(days);
    };

    const getVoucherTypeLabel = (type: string) => {
        switch (type) {
            case 'CASH_BILL': return { text: '三联红 (金莲记自开收据 - 收入)', color: 'bg-red-100 text-red-800 border-red-200', icon: Receipt };
            case 'PAYMENT_VOUCHER': return { text: '极简黑 (员工薪资)', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: Coins };
            case 'DELIVERY_RECEIPT': return { text: '交易绿 (运输)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: ArrowLeftRight };
            case 'CASH_VOUCHER': return { text: '经典黄 (个人/Agent)', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Receipt };
            case 'PURCHASE_RECEIPT': return { text: '双色收据 (供应商未开单)', color: 'bg-green-100 text-green-900 border-green-200', icon: FileText };
            default: return { text: '内部自制票据', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: FileText };
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F6F7FB] w-full h-full md:max-w-7xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* Compact mobile-first header */}
                <header className="shrink-0 bg-[#FFFFFF] border-b border-[#E5E7EB] safe-area-top">
                    <div className="px-3 md:px-4 pt-2 pb-3 flex items-center gap-2.5">
                        <button
                            onClick={onClose || (() => window.history.back())}
                            style={{ touchAction: 'manipulation' }}
                            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#F6F7FB] hover:bg-[#E5E7EB] text-[#111111] rounded-2xl transition-all active:scale-95 shrink-0 border border-[#E5E7EB]"
                            aria-label="Back"
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                        <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-[#FFD200] text-[#111111] flex items-center justify-center shadow-[0_6px_18px_rgba(255,210,0,0.28)] shrink-0">
                            <Receipt size={20} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h1 className="text-[16px] md:text-xl font-black tracking-tight text-[#111111] truncate">自制账单</h1>
                                <span className="px-2 py-0.5 rounded-full bg-[#FFF8D6] text-[#7A6100] text-[9px] font-extrabold whitespace-nowrap hidden md:inline-block">A5 凭单</span>
                            </div>
                            <p className="text-[10px] md:text-[11px] text-[#6B7280] truncate">补录无原始单据的支出与对账记录</p>
                        </div>
                        <button aria-label="关闭" onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[#4B5563] bg-[#F6F7FB] hover:bg-[#E5E7EB] rounded-2xl select-none transition-all active:scale-95 shrink-0">
                            <X size={20}/>
                        </button>
                    </div>
                    <div className="h-1 bg-[#FFD200]" />
                </header>

                {/* Main Body Grid */}
                <div className="flex-grow overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* Left Column: List and Management */}
                    <div className="w-full lg:w-5/12 border-r border-gray-200 flex flex-col bg-[#ffffff] overflow-hidden">
                        
                        {/* Search and Filters */}
                        <div className="p-4 bg-[#F6F7FB] border-b border-[#E5E7EB] space-y-3 shrink-0">
                            <div className="grid grid-cols-[1fr_1fr_48px] gap-2">
                                <div className="contents">
                                    <button 
                                        onClick={handleOpenCreateNew}
                                        className="flex-1 bg-[#111111] text-[#FFD200] font-extrabold text-xs px-3 py-3 rounded-2xl hover:bg-black transition-all shadow-[0_4px_12px_rgba(17,17,17,0.12)] flex items-center justify-center gap-2 shrink-0 active:scale-[0.98] min-h-[48px]"
                                    >
                                        <Plus size={16} />
                                        新建账单
                                    </button>
                                    <button 
                                        onClick={() => setIsBulkGeneratorOpen(true)}
                                        className="flex-1 bg-[#FFD200] text-[#111111] font-extrabold text-xs px-3 py-3 rounded-2xl hover:bg-[#E5C100] transition-all shadow-[0_4px_14px_rgba(255,210,0,0.25)] flex items-center justify-center gap-2 shrink-0 active:scale-[0.98] min-h-[48px]"
                                    >
                                        <Sparkles size={16} />
                                        批量生成
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="搜索与筛选"
                                        title="搜索与筛选"
                                        onClick={() => setIsMobileFiltersOpen(value => !value)}
                                        className={`relative w-12 h-12 rounded-2xl border flex items-center justify-center transition-all active:scale-95 ${
                                            isMobileFiltersOpen || searchTerm || startDate || endDate || selectedCompanyFilter !== 'ALL'
                                                ? 'bg-[#FFF9DF] border-[#FFD200] text-[#111111]'
                                                : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563]'
                                        }`}
                                    >
                                        <SlidersHorizontal size={19}/>
                                        {(searchTerm || startDate || endDate || selectedCompanyFilter !== 'ALL') && (
                                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#EF4444] ring-2 ring-[#FFFFFF]"/>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Company and Date Range Multi-Filters */}
                            <div className={`${isMobileFiltersOpen ? 'block' : 'hidden'} bg-[#FFFFFF] p-3.5 rounded-2xl border border-[#E5E7EB] space-y-3 shadow-[0_2px_10px_rgba(17,17,17,0.04)]`}>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-extrabold text-[#111111] flex items-center gap-1.5"><Search size={14} className="text-[#9A7D00]"/> 搜索与筛选</span>
                                    {(searchTerm || startDate || endDate || selectedCompanyFilter !== 'ALL') && (
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setSearchTerm('');
                                                setStartDate('');
                                                setEndDate('');
                                                setSelectedCompanyFilter('ALL');
                                            }}
                                            className="text-[9px] font-extrabold text-red-600 text-red-700 hover:underline"
                                        >
                                            重置 Reset
                                        </button>
                                    )}
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-[#9CA3AF]" size={16}/>
                                    <input
                                        type="text"
                                        placeholder="搜索收款人、单号或备注..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full min-h-[42px] pl-9 pr-3 bg-[#F6F7FB] border border-[#E5E7EB] rounded-xl text-[11px] outline-none focus:ring-2 focus:ring-[#FFD200]"
                                    />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
                                    {/* Company selector */}
                                    <div className="flex flex-col gap-1">
                                        <span className="font-bold text-[#6B7280]">公司</span>
                                        <select
                                            value={selectedCompanyFilter}
                                            onChange={e => setSelectedCompanyFilter(e.target.value)}
                                            className="w-full min-h-[42px] bg-[#F6F7FB] border border-[#E5E7EB] rounded-xl px-3 focus:ring-2 focus:ring-[#FFD200] text-[11px] font-bold outline-none"
                                        >
                                            <option value="ALL">🏢 全部公司 (All)</option>
                                            {Array.from(new Set(vouchers.map(v => v.companyName || '金莲记甲洞(Kim Lian Kee - Kepong)'))).map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Date selectors */}
                                    <div className="flex flex-col gap-1">
                                        <span className="font-bold text-[#6B7280]">日期范围</span>
                                        <div className="flex items-center gap-1">
                                            <input 
                                                type="date"
                                                value={startDate}
                                                onChange={e => setStartDate(e.target.value)}
                                                className="bg-[#F6F7FB] border border-[#E5E7EB] rounded-xl px-2 min-h-[42px] w-full text-[10px] outline-none font-mono focus:ring-2 focus:ring-[#FFD200]"
                                            />
                                            <span className="text-[#9ca3af] text-[8px]">-</span>
                                            <input 
                                                type="date"
                                                value={endDate}
                                                onChange={e => setEndDate(e.target.value)}
                                                className="bg-[#F6F7FB] border border-[#E5E7EB] rounded-xl px-2 min-h-[42px] w-full text-[10px] outline-none font-mono focus:ring-2 focus:ring-[#FFD200]"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Auditor Statement & total filtered sum */}
                                <div className="flex bg-[#FFF9DF] px-3.5 py-2.5 rounded-xl border border-[#F4E6A2] items-center justify-between gap-3 text-left">
                                    <div><span className="text-[#6B7280] text-[9px] font-bold block">本期合计</span><span className="text-[#111111] text-[11px] font-extrabold">{filteredVouchers.length} 张账单</span></div>
                                    <span className="text-[#111111] font-black font-mono text-[15px]">
                                        RM {filteredTotalSum.toFixed(2)}
                                    </span>
                                </div>

                                {/* Select All & Batch action button */}
                                {filteredVouchers.length > 0 && (
                                    <div className="flex items-center justify-between border-t border-gray-200/50 pt-2 text-[10px]">
                                        <label className="flex items-center gap-1.5 font-bold text-[#6b7280] cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={isAllVouchersSelected} 
                                                onChange={handleSelectAllVouchersToggle}
                                                className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
                                            />
                                            <span>全选本期 ({filteredVouchers.length})</span>
                                        </label>
                                        
                                        {selectedVoucherIds.length > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={handleBatchDeleteVouchers}
                                                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-2.5 py-1 rounded-lg font-extrabold text-[9px] active:scale-95 transition-all"
                                                >
                                                    批量删除 ({selectedVoucherIds.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleOpenBatchPrintModal}
                                                    className="bg-[#111111] hover:bg-black text-[#FFD200] px-2.5 py-1 rounded-lg font-extrabold text-[9px] active:scale-95 transition-all flex items-center gap-1"
                                                >
                                                    <Printer size={10}/>
                                                    <span>批量打印 ({selectedVoucherIds.length})</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Compact voucher type dropdown */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsTypeFilterOpen(value => !value)}
                                    aria-expanded={isTypeFilterOpen}
                                    className="min-h-[40px] w-full px-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] flex items-center justify-between text-[11px] font-extrabold text-[#111111] active:scale-[0.99] transition-all"
                                >
                                    <span className="flex items-center gap-2">
                                        <Receipt size={14} className="text-[#9A7D00]"/>
                                        {VOUCHER_TYPE_FILTERS.find(item => item.id === selectedTypeFilter)?.label || '全部'}
                                    </span>
                                    <ChevronDown size={15} className={`text-[#6B7280] transition-transform ${isTypeFilterOpen ? 'rotate-180' : ''}`}/>
                                </button>
                                {isTypeFilterOpen && (
                                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 p-2 bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl shadow-[0_12px_30px_rgba(17,17,17,0.14)] grid grid-cols-2 gap-1.5">
                                        {VOUCHER_TYPE_FILTERS.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTypeFilter(item.id);
                                                    setIsTypeFilterOpen(false);
                                                }}
                                                className={`min-h-[40px] px-3 rounded-xl text-left text-[11px] font-bold transition-all ${
                                                    selectedTypeFilter === item.id
                                                        ? 'bg-[#FFD200] text-[#111111]'
                                                        : 'bg-[#F6F7FB] text-[#4B5563] hover:bg-[#E5E7EB]'
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Vouchers List */}
                        <div className="flex-grow overflow-y-auto p-3 space-y-2.5 bg-gray-50/50">
                            {filteredVouchers.length === 0 ? (
                                <div className="text-center py-16 px-4 bg-[#ffffff] rounded-2xl border border-gray-100 shadow-inner">
                                    <div className="text-4xl mb-3">📬</div>
                                    <p className="text-xs text-[#9ca3af] font-bold">没有找到自制凭单记录</p>
                                    <p className="text-[10px] text-[#9ca3af] mt-1">此工具用于由于运输承运商、买菜无票等情况需要手工补充规范化对账单据的场景。</p>
                                    <button 
                                        onClick={handleOpenCreateNew} 
                                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-2 border border-amber-200 rounded-xl"
                                    >
                                        <Plus size={14}/> 录入首张自制单据
                                    </button>
                                </div>
                            ) : (
                                filteredVouchers.map(v => {
                                    const typeMeta = getVoucherTypeLabel(v.voucherType);
                                    const TypeIcon = typeMeta.icon;
                                    const isCurrentPreview = previewVoucher?.id === v.id;
                                    
                                    return (
                                        <div
                                            key={v.id}
                                            onClick={() => setPreviewVoucher(v)}
                                            className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 relative group ${
                                                isCurrentPreview 
                                                ? 'bg-[#FFF9DF] border-[#FFD200] text-[#111111] shadow-[0_6px_18px_rgba(255,210,0,0.16)] ring-1 ring-[#FFD200]/30' 
                                                : 'bg-[#ffffff] border-gray-200 hover:border-gray-300 shadow-sm'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedVoucherIds.includes(v.id)} 
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            handleSelectVoucherToggle(v.id);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer shrink-0"
                                                    />
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold border uppercase flex items-center gap-1 shrink-0 ${
                                                        isCurrentPreview ? 'bg-[#FFD200] text-[#111111] border-[#FFD200]' : typeMeta.color
                                                    }`}>
                                                        <TypeIcon size={10} />
                                                        {typeMeta.text}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-3 min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <User size={11} className={isCurrentPreview ? 'text-[#9A7D00]' : 'text-[#9ca3af]'} />
                                                    <h4 className="font-extrabold text-[13px] truncate">
                                                        {v.payeeName || '未知收款方'}
                                                    </h4>
                                                </div>
                                                <span className={`text-[13px] font-sans font-black whitespace-nowrap ${isCurrentPreview ? 'text-[#111111]' : 'text-[#EF4444]'}`}>
                                                    RM {v.totalAmount.toFixed(2)}
                                                </span>
                                            </div>

                                            <div className="border-t border-[#E5E7EB] pt-2 flex flex-col gap-2">
                                                <div className="flex items-center justify-between gap-3 text-[10px] text-[#6B7280] font-mono">
                                                    <span className="flex items-center gap-1.5">
                                                        <Calendar size={11}/>
                                                        {v.date}
                                                    </span>
                                                    <span className="font-bold truncate">{v.voucherNo}</span>
                                                </div>

                                                {/* Apple HIG Tactile Touch Handles (>=44px) - Touch friendly */}
                                                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 border-t border-[#E5E7EB] pt-2 shrink-0">
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPreviewVoucher(v);
                                                            setIsMobilePreviewOpen(true);
                                                        }}
                                                        className={`py-2 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px] ${
                                                            isCurrentPreview 
                                                                ? 'bg-[#FFD200] text-[#111111] hover:bg-[#E5C100]' 
                                                            : 'bg-amber-50 text-amber-900 border border-amber-200/55 hover:bg-amber-100'
                                                        }`}
                                                    >
                                                        <Printer size={13} />
                                                        <span>预览 PDF</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="编辑"
                                                        title="编辑"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenEdit(v);
                                                        }}
                                                        className="w-11 h-11 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-[#4B5563] transition-all flex items-center justify-center active:scale-95 hover:bg-[#E5E7EB]"
                                                    >
                                                        <FileText size={15}/>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="删除"
                                                        title="删除"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(v.id);
                                                        }}
                                                        className="w-11 h-11 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center justify-center active:scale-95 transition-all border border-red-100"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Right Column: High Fidelity Real-time Render & Print Preview */}
                    <div className="hidden md:flex flex-grow lg:w-7/12 bg-slate-100 flex-col overflow-hidden relative">
                        {previewVoucher ? (
                            <div className="flex-grow flex flex-col overflow-hidden">
                                
                                {/* Info bar & Download */}
                                <div className="bg-[#ffffff] border-b border-gray-200 p-4 shrink-0 flex items-center justify-between shadow-sm z-10">
                                    <div className="min-w-0">
                                        <h5 className="font-bold text-xs text-[#6b7280] uppercase font-mono tracking-wider">A5 模板即时预览区 Previewing</h5>
                                        <h4 className="font-black text-sm text-gray-800 truncate mt-0.5">
                                            {previewVoucher.voucherNo} ({getVoucherTypeLabel(previewVoucher.voucherType).text})
                                        </h4>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="hidden md:flex bg-gray-100 p-1 rounded-xl border border-gray-200 gap-1 text-[10px]">
                                            <span className="px-2 py-0.5 bg-[#ffffff] rounded-lg shadow-xs font-bold text-slate-800">
                                                样式Style: {previewVoucher.templateStyle}
                                            </span>
                                        </div>

                                        <button 
                                            onClick={() => handleDownloadA5PDF(previewVoucher)}
                                            disabled={!!isExporting}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-[#ffffff] px-3.5 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 active:scale-95 shadow-md shadow-emerald-600/10 min-h-[44px]"
                                        >
                                            {isExporting === previewVoucher.id ? (
                                                <>
                                                    <RefreshCw size={14} className="animate-spin" />
                                                    渲染 A5...
                                                </>
                                            ) : (
                                                <>
                                                    <Download size={14} />
                                                    下载 A5 PDF
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* PDF document viewing canvas container */}
                                <div className="flex-grow p-6 overflow-y-auto flex justify-center bg-slate-200/60 shadow-inner">
                                    
                                    {/* Scaled viewport preview card */}
                                    <div className="p-3 bg-[#ffffff] shadow-xl hover:shadow-2xl transition-all duration-300 rounded-lg max-w-full overflow-x-auto">
                                        
                                        <div className="min-w-[595px]">
                                            <A5VoucherDocument voucher={previewVoucher} />
                                        </div>
                                        
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center text-center p-8 text-[#9ca3af]">
                                <div className="p-6 bg-slate-50 border-2 border-dashed border-gray-200 rounded-[2rem] max-w-sm flex flex-col items-center shadow-inner">
                                    <span className="text-4xl animate-bounce mb-3">📄</span>
                                    <h4 className="font-black text-[#111111] text-sm">选择左侧凭单，在此即时看单</h4>
                                    <p className="text-[11px] text-[#9ca3af] mt-2 leading-relaxed">
                                        预览器将使用真实的 A5 网格重配比例。支持**仿古金殿风**、**现代硬朗风**、以及**复写票据风**等多套模具，点击即可转换为正规 A5 PDF，完美符合备查凭证。
                                    </p>
                                    <button 
                                        onClick={handleOpenCreateNew}
                                        className="mt-4 bg-amber-400 text-black font-black text-xs px-4 py-2 rounded-xl"
                                    >
                                        立即创建一份
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SINGLE HIGH-RES CAPTURE CONTAINER FOR COGS/SELF-INV PDF EXPORT ── */}
                {/* 
                     We render exactly ONE targeted preview voucher in an offscreen node.
                     This guarantees standard A5 w-[595px] h-[842px] size is rendered completely 
                     independent of the device size, browser zooming, or responsive layout constraints,
                     allowing perfect layout structure capture in html2canvas without taint complications.
                 */}
                {previewVoucher && createPortal(
                    <div 
                        id="a5-capture-global"
                        style={{ 
                            width: '595px', 
                            height: '842px', 
                            position: 'absolute', 
                            top: '0', 
                            left: '0px', 
                            background: '#ffffff', 
                            color: '#000000',
                            zIndex: -9999,
                            pointerEvents: 'none'
                        }}
                    >
                        {/* Perfect standard full size rendering */}
                        <A5VoucherDocument voucher={previewVoucher} isForActualExport={true} />
                    </div>,
                    document.body
                )}

                {/* FLOATING BULK VOUCHERS BAR */}
                {selectedVoucherIds.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-[#ffffff] rounded-2xl px-5 py-3.5 shadow-2xl flex items-center justify-between gap-5 z-[110] border border-stone-800 animate-in slide-in-from-bottom duration-300 w-[92%] max-w-lg">
                        <div className="text-xs font-black">
                            已选择 <span className="text-amber-400 font-mono text-sm">{selectedVoucherIds.length}</span> 项自制凭证
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                onClick={() => setSelectedVoucherIds([])}
                                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-[#ffffff] rounded-xl text-[11px] font-black transition-all cursor-pointer"
                                style={{ minHeight: '36px' }}
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleOpenBatchPrintModal}
                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-black rounded-xl text-[11px] transition-all shadow-md flex items-center gap-1 cursor-pointer"
                                style={{ minHeight: '36px' }}
                            >
                                <Printer size={12}/>
                                <span>批量打印 ({selectedVoucherIds.length}张)</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* BULK SMART GENERATOR OVERLAY */}
                {isBulkGeneratorOpen && (
                    <div className="fixed inset-0 bg-black/75 z-[210] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={() => setIsBulkGeneratorOpen(false)}>
                        <div 
                            className="bg-[#ffffff] w-full md:max-w-xl md:rounded-3xl shadow-2xl flex flex-col max-h-[100vh] md:max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
                        >
                            {/* Modal Header */}
                            <div className="bg-[#111111] p-4 text-[#ffffff] flex justify-between items-center border-b-4 border-amber-400 shrink-0 safe-area-top">
                                <div className="flex items-center gap-2 text-left">
                                    <div className="bg-amber-400 text-black p-1.5 rounded-lg">
                                        <Sparkles size={20} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <h3 className="font-serif font-black text-sm md:text-base tracking-wide text-[#ffffff]">⚡ 智能对账补充凭单批量快速生成器</h3>
                                        <p className="text-[10px] text-[#9ca3af]">Bulk Self-Issued Voucher Smart Generator</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsBulkGeneratorOpen(false)} className="p-2 min-w-[44px] min-h-[44px] hover:bg-[#ffffff]/10 rounded-full flex items-center justify-center transition-all select-none">
                                    <X size={18}/>
                                </button>
                            </div>

                            {/* Modal Form Scroll Area */}
                            <div className="flex-grow overflow-y-auto p-4 md:p-5 space-y-4 text-left">
                                <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 text-xs text-amber-900 leading-relaxed font-semibold">
                                    💡 <strong>使用场景：</strong>针对没有正规发票的采买，例如菜市场采购的 <strong>鱼饼 Fish Cake</strong> 或临时运输费，您可以一键在选定月份按天均匀分布生成多份自制凭单，免除手工一份份重复输入的痛苦！
                                </div>

                                {/* Date selection mode picker */}
                                <div className="space-y-1.5 text-xs">
                                    <label className="font-extrabold text-[#4b5563] block">📅 日期选择模式 Date Selection Mode</label>
                                    <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setBulkGenDateMode('AUTO')}
                                            className={`py-2 rounded-lg font-bold transition-all text-center text-xs active:scale-95 ${
                                                bulkGenDateMode === 'AUTO'
                                                ? 'bg-[#111111] text-[#FFD200] shadow-sm'
                                                : 'text-[#6b7280] hover:text-gray-800 hover:bg-gray-50'
                                            }`}
                                        >
                                            🤖 智能均匀散布 (Auto Spacing)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBulkGenDateMode('MANUAL')}
                                            className={`py-2 rounded-lg font-bold transition-all text-center text-xs active:scale-95 ${
                                                bulkGenDateMode === 'MANUAL'
                                                ? 'bg-[#111111] text-[#FFD200] shadow-sm'
                                                : 'text-[#6b7280] hover:text-gray-800 hover:bg-gray-50'
                                            }`}
                                        >
                                            📆 手动指定日期 (Custom Pick)
                                        </button>
                                    </div>
                                </div>

                                {/* Row 1: Month and Count / Calendar Grid based on mode */}
                                {bulkGenDateMode === 'AUTO' ? (
                                    <div className="grid grid-cols-2 gap-3 text-xs animate-in fade-in duration-100">
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-[#4b5563] block">📅 选择目标月份 Target Month</label>
                                            <input 
                                                type="month" 
                                                value={bulkGenMonth} 
                                                onChange={e => setBulkGenMonth(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-400 focus:border-transparent font-bold outline-none font-mono text-sm min-h-[44px]"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-[#4b5563] block">🔢 计划生成张数 Total Sheets</label>
                                            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-1.5 py-1 min-h-[44px]">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setBulkGenCount(prev => Math.max(1, prev - 1))}
                                                    className="w-8 h-8 rounded-lg bg-[#ffffff] shadow-xs border border-gray-200 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 min-w-[32px] min-h-[32px]"
                                                >
                                                    -
                                                </button>
                                                <input 
                                                    type="number" 
                                                    min="1" 
                                                    max="31" 
                                                    value={bulkGenCount}
                                                    onChange={e => setBulkGenCount(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                                                    className="w-full bg-transparent text-center font-extrabold font-mono text-base outline-none border-none py-1"
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={() => setBulkGenCount(prev => Math.min(31, prev + 1))}
                                                    className="w-8 h-8 rounded-lg bg-[#ffffff] shadow-xs border border-gray-200 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 min-w-[32px] min-h-[32px]"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 text-xs animate-in fade-in duration-100">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="font-extrabold text-[#4b5563] block">📅 选择目标月份 Target Month</label>
                                                <input 
                                                    type="month" 
                                                    value={bulkGenMonth} 
                                                    onChange={e => {
                                                        setBulkGenMonth(e.target.value);
                                                        setBulkGenSelectedDays([]); // reset days on month change
                                                    }}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-400 focus:border-transparent font-bold outline-none font-mono text-sm min-h-[44px]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="font-extrabold text-[#4b5563] block">🔢 已选生成张数 Selected Sheets</label>
                                                <div className="w-full bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-center font-black font-mono text-base min-h-[44px]">
                                                    {bulkGenSelectedDays.length} 张单据
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="font-extrabold text-[#4b5563] block">🎯 点选具体日期 Target Days (请在下方网格中点击选择)</label>
                                                <span className="text-[10px] text-[#9ca3af] font-bold">按月历天数点击</span>
                                            </div>
                                            
                                            {/* Days Calendar-Style Grid */}
                                            <div className="grid grid-cols-7 gap-1.5 p-3 bg-gray-50 border border-gray-200 rounded-2xl max-h-56 overflow-y-auto">
                                                {(() => {
                                                    const [yStr, mStr] = bulkGenMonth.split('-');
                                                    const y = parseInt(yStr, 10) || 2026;
                                                    const m = (parseInt(mStr, 10) - 1) || 4;
                                                    const totalDays = new Date(y, m + 1, 0).getDate();
                                                    
                                                    return Array.from({ length: totalDays }, (_, idx) => {
                                                        const dayNum = idx + 1;
                                                        const isSelected = bulkGenSelectedDays.includes(dayNum);
                                                        return (
                                                            <button
                                                                key={dayNum}
                                                                type="button"
                                                                onClick={() => {
                                                                    setBulkGenSelectedDays(prev => {
                                                                        if (prev.includes(dayNum)) {
                                                                            return prev.filter(d => d !== dayNum);
                                                                        } else {
                                                                            return [...prev, dayNum].sort((a,b) => a - b);
                                                                        }
                                                                    });
                                                                }}
                                                                className={`h-10 w-full rounded-xl font-mono font-black text-xs transition-all flex items-center justify-center border active:scale-95 ${
                                                                    isSelected
                                                                    ? 'bg-amber-400 border-amber-400 text-black shadow-md ring-2 ring-amber-400/20'
                                                                    : 'bg-[#ffffff] border-gray-200 text-gray-700 hover:border-gray-300'
                                                                }`}
                                                            >
                                                                {dayNum}
                                                            </button>
                                                        );
                                                    });
                                                })()}
                                            </div>

                                            {/* Preset Day Helper Buttons */}
                                            <div className="flex flex-wrap gap-1.5 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('ODD')}
                                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-[10px] font-bold text-[#4b5563] active:scale-95 min-h-[44px]"
                                                >
                                                    📅 选单数日 (Odds)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('EVEN')}
                                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-[10px] font-bold text-[#4b5563] active:scale-95 min-h-[44px]"
                                                >
                                                    📅 选双数日 (Evens)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('MON_WED_FRI')}
                                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-[10px] font-bold text-[#4b5563] active:scale-95 min-h-[44px]"
                                                >
                                                    📅 选一三五 (Mon/Wed/Fri)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('CLEAR')}
                                                    className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-[10px] font-bold text-red-600 active:scale-95 min-h-[44px] ml-auto"
                                                >
                                                    🧹 清除所选 (Clear)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Payee Info & Saved Payee Quick Selector */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <label className="font-extrabold text-[#4b5563]">👤 收款人/临时供应商 Payee Name</label>
                                        {savedPayees.length > 0 && (
                                            <span className="text-[10px] text-amber-600 font-extrabold">⭐️ 支持星标常用人</span>
                                        )}
                                    </div>
                                    
                                    <input 
                                        type="text" 
                                        placeholder="例如：Fish Cake Supplier / 鱼饼摊贩" 
                                        value={bulkGenPayeeName} 
                                        onChange={e => setBulkGenPayeeName(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none min-h-[44px]"
                                    />

                                    {/* Starred payees selector bar */}
                                    {savedPayees.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto pb-1">
                                            {savedPayees.map(p => (
                                                <button
                                                    key={p.name}
                                                    type="button"
                                                    onClick={() => {
                                                        setBulkGenPayeeName(p.name);
                                                        setBulkGenPayeePhone(p.phone);
                                                        setBulkGenPayeeType(p.type);
                                                    }}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all active:scale-95 ${
                                                        bulkGenPayeeName.trim().toLowerCase() === p.name.trim().toLowerCase()
                                                        ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-xs'
                                                        : 'bg-[#ffffff] border-gray-200 text-[#4b5563] hover:bg-gray-50'
                                                    }`}
                                                >
                                                    ⭐️ {p.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Payee Type and Voucher Type */}
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="space-y-1">
                                        <label className="font-extrabold text-[#4b5563] block">📁 凭单类别 Voucher Type</label>
                                        <select
                                            value={bulkGenVoucherType}
                                            onChange={e => setBulkGenVoucherType(e.target.value as any)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]"
                                        >
                                            <option value="PURCHASE_RECEIPT">🧾 双色收据 (供应商未开单 / PURCHASE_RECEIPT)</option>
                                            <option value="CASH_VOUCHER">🪙 现金条 (CASH_VOUCHER)</option>
                                            <option value="CASH_BILL">🛑 三联红自开收据 (CASH_BILL)</option>
                                            <option value="DELIVERY_RECEIPT">🚚 交易绿运费单 (DELIVERY_RECEIPT)</option>
                                            <option value="PAYMENT_VOUCHER">💶 极简黑员工薪资 (PAYMENT_VOUCHER)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="font-extrabold text-[#4b5563] block">🎭 收款人身份 Identity</label>
                                        <select
                                            value={bulkGenPayeeType}
                                            onChange={e => setBulkGenPayeeType(e.target.value as any)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]"
                                        >
                                            <option value="INFORMAL_VENDOR">🏪 零星摊贩/菜市买手 (INFORMAL_VENDOR)</option>
                                            <option value="DRIVER">🚚 运输外包司机 (DRIVER)</option>
                                            <option value="INDIVIDUAL">👤 临时兼职/个人 (INDIVIDUAL)</option>
                                            <option value="AGENT">🪙 代理商/未注册Agent (AGENT)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Item Particulars Specification */}
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                                    <h4 className="font-extrabold text-xs text-[#6b7280] uppercase tracking-wider flex items-center gap-1">
                                        <span>🛍️ 基准货品与单价基数 Base Items Particulars</span>
                                    </h4>

                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between items-center">
                                            <label className="font-extrabold text-[#4b5563]">货品明细 Description</label>
                                            <div className="flex gap-1">
                                                {['鱼饼 / Fish Cake', '黄面 / Yellow Noodles', '路费 / Transport', '冰块 / Ice Bags'].map(itemText => (
                                                    <button
                                                        key={itemText}
                                                        type="button"
                                                        onClick={() => {
                                                            setBulkGenItemDesc(itemText);
                                                            if (itemText.includes('鱼饼')) {
                                                                setBulkGenItemUnit('包');
                                                                setBulkGenItemUnitPrice(15.00);
                                                            } else if (itemText.includes('黄面')) {
                                                                setBulkGenItemUnit('箱');
                                                                setBulkGenItemUnitPrice(12.00);
                                                            } else if (itemText.includes('路费')) {
                                                                setBulkGenItemUnit('趟');
                                                                setBulkGenItemUnitPrice(150.00);
                                                            } else if (itemText.includes('冰块')) {
                                                                setBulkGenItemUnit('包');
                                                                setBulkGenItemUnitPrice(6.00);
                                                            }
                                                        }}
                                                        className="px-1.5 py-0.5 text-[8px] bg-[#ffffff] hover:bg-gray-100 border border-gray-200 rounded text-[#6b7280] font-extrabold"
                                                    >
                                                        {itemText.split('/')[0]}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="输入货品名称, 如: Fish Cake" 
                                            value={bulkGenItemDesc} 
                                            onChange={e => setBulkGenItemDesc(e.target.value)}
                                            className="w-full bg-[#ffffff] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-amber-400 min-h-[40px]"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-2.5 text-xs">
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-[#4b5563] block">基础数量 Qty</label>
                                            <input 
                                                type="number" 
                                                min="1"
                                                value={bulkGenItemQty} 
                                                onChange={e => setBulkGenItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-full bg-[#ffffff] border border-gray-200 rounded-xl p-2 font-extrabold font-mono text-sm outline-none min-h-[40px]"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-[#4b5563] block">基准单价 Unit Price</label>
                                            <div className="relative">
                                                <span className="absolute left-2.5 top-2.5 text-[#9ca3af] font-bold text-[10px]">RM</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={bulkGenItemUnitPrice} 
                                                    onChange={e => setBulkGenItemUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                                                    className="w-full bg-[#ffffff] border border-gray-200 rounded-xl pl-8 pr-2 py-2 font-extrabold font-mono text-sm outline-none min-h-[40px]"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-[#4b5563] block">单位 Unit</label>
                                            <input 
                                                type="text" 
                                                placeholder="包/趟/箱" 
                                                value={bulkGenItemUnit} 
                                                onChange={e => setBulkGenItemUnit(e.target.value)}
                                                className="w-full bg-[#ffffff] border border-gray-200 rounded-xl p-2 font-bold outline-none min-h-[40px]"
                                            />
                                        </div>
                                    </div>

                                    {/* Fluctuations Control */}
                                    <div className="border-t border-gray-200/60 pt-3 flex flex-col gap-2">
                                        <label className="flex items-center justify-between cursor-pointer select-none">
                                            <div className="space-y-0.5">
                                                <span className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                                                    ✨ 开启智能随机价格与重量波动
                                                </span>
                                                <span className="text-[10px] text-[#9ca3af] block font-normal leading-relaxed">
                                                    自动对每张单据的价格/数量进行微小随机波动（使审计对账极其真实自然，拒绝千篇一律的一致）
                                                </span>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={bulkGenEnableFluctuation} 
                                                onChange={e => setBulkGenEnableFluctuation(e.target.checked)}
                                                className="w-5 h-5 text-amber-500 accent-amber-500 rounded cursor-pointer shrink-0"
                                            />
                                        </label>

                                        {bulkGenEnableFluctuation && (
                                            <div className="flex items-center gap-3 bg-[#ffffff] p-2 rounded-xl border border-gray-200 animate-in slide-in-from-top-1">
                                                <span className="text-[10px] font-bold text-[#6b7280] shrink-0">波动限度 Range:</span>
                                                <input 
                                                    type="range" 
                                                    min="3" 
                                                    max="20" 
                                                    value={bulkGenAmountFluctuation}
                                                    onChange={e => setBulkGenAmountFluctuation(parseInt(e.target.value))}
                                                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-200 rounded-lg"
                                                />
                                                <span className="text-xs font-mono font-black text-amber-600 shrink-0">
                                                    ±{bulkGenAmountFluctuation}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* BULK PREVIEW & MANUALLY TWEAK INDIVIDUAL PRICES */}
                                {bulkPreviewItems.length > 0 ? (
                                    <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wider flex items-center gap-1">
                                                <span>📋 调整生成清单 (Draft Vouchers Preview)</span>
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={() => setBulkPreviewItems([])}
                                                className="text-[10px] text-red-600 font-extrabold hover:underline"
                                            >
                                                🧹 清空重设 (Reset)
                                            </button>
                                        </div>
                                        
                                        <p className="text-[10px] text-amber-800 leading-relaxed">
                                            💡 <strong>高级控制：</strong>您可以直接修改下方各张凭证的<strong>具体日期、数量、价格</strong>。点击右侧的 ❌ 可排除该单。
                                        </p>

                                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                            {bulkPreviewItems.map((item, index) => (
                                                <div key={item.id} className="bg-[#ffffff] p-3 rounded-xl border border-gray-200 flex flex-col md:flex-row gap-2.5 items-start md:items-center justify-between text-xs shadow-xs">
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="font-mono text-[10px] text-[#9ca3af] font-black w-5 text-center">#{index + 1}</span>
                                                        <input 
                                                            type="date"
                                                            value={item.date}
                                                            onChange={e => {
                                                                const updated = bulkPreviewItems.map(draft => 
                                                                    draft.id === item.id ? { ...draft, date: e.target.value } : draft
                                                                );
                                                                setBulkPreviewItems(updated);
                                                            }}
                                                            className="bg-gray-50 border border-gray-200 rounded-lg p-1.5 font-bold font-mono text-xs outline-none focus:ring-1 focus:ring-amber-400 max-w-[125px] min-h-[34px]"
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-grow w-full md:w-auto">
                                                        {/* Qty edit */}
                                                        <div className="flex items-center gap-1 w-20 shrink-0">
                                                            <span className="text-[10px] text-[#9ca3af] font-bold shrink-0">数:</span>
                                                            <input 
                                                                type="number"
                                                                min="1"
                                                                value={item.qty}
                                                                onChange={e => {
                                                                    const newQty = Math.max(1, parseInt(e.target.value) || 1);
                                                                    const updated = bulkPreviewItems.map(draft => 
                                                                        draft.id === item.id ? { ...draft, qty: newQty, amount: Math.round((newQty * draft.unitPrice) * 100) / 100 } : draft
                                                                    );
                                                                    setBulkPreviewItems(updated);
                                                                }}
                                                                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1 font-extrabold font-mono text-center text-xs outline-none min-h-[34px]"
                                                            />
                                                        </div>

                                                        {/* Price edit */}
                                                        <div className="flex items-center gap-1 flex-grow">
                                                            <span className="text-[10px] text-[#9ca3af] font-bold shrink-0">单价:</span>
                                                            <div className="relative w-full">
                                                                <span className="absolute left-1.5 top-2 text-[#9ca3af] font-bold text-[9px]">RM</span>
                                                                <input 
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={item.unitPrice}
                                                                    onChange={e => {
                                                                        const newPrice = Math.max(0, parseFloat(e.target.value) || 0);
                                                                        const updated = bulkPreviewItems.map(draft => 
                                                                            draft.id === item.id ? { ...draft, unitPrice: newPrice, amount: Math.round((draft.qty * newPrice) * 100) / 100 } : draft
                                                                        );
                                                                        setBulkPreviewItems(updated);
                                                                    }}
                                                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-6 pr-1 py-1 font-extrabold font-mono text-xs outline-none min-h-[34px]"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Amount & Delete */}
                                                    <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto border-t md:border-t-0 border-gray-100 pt-2 md:pt-0 shrink-0">
                                                        <div className="text-right">
                                                            <span className="text-[9px] text-[#9ca3af] font-bold block leading-none">总计 Amount</span>
                                                            <span className="font-mono text-xs font-black text-amber-600 leading-normal">
                                                                RM {item.amount.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setBulkPreviewItems(bulkPreviewItems.filter(draft => draft.id !== item.id));
                                                            }}
                                                            className="w-11 h-11 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center font-bold active:scale-95 min-h-[44px] min-w-[44px]"
                                                        >
                                                            <X size={12}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-1 flex justify-center">
                                        <button
                                            type="button"
                                            onClick={generateDraftVouchers}
                                            className="w-full py-3 bg-amber-50 hover:bg-amber-100 border-2 border-dashed border-amber-300 text-amber-950 font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-95 min-h-[44px]"
                                        >
                                            <Sparkles size={14} className="text-amber-500 animate-bounce" />
                                            <span>📋 生成预览清单并微调价格/日期 (Generate Preview & Edit)</span>
                                        </button>
                                    </div>
                                )}

                                {/* Custom Config: Style and Company Name */}
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="space-y-1">
                                        <label className="font-extrabold text-[#4b5563] block">🎨 模板视觉风格 Theme Style</label>
                                        <select
                                            value={bulkGenTemplateStyle}
                                            onChange={e => setBulkGenTemplateStyle(e.target.value as any)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]"
                                        >
                                            <option value="CASH_BILL_GREEN">🟩 金莲记甲洞绿色联 (CASH_BILL_GREEN)</option>
                                            <option value="VINTAGE_GOLD">🟨 复古描边香槟金 (VINTAGE_GOLD)</option>
                                            <option value="MODERN_DARK">⬛ 高雅工业简约黑 (MODERN_DARK)</option>
                                            <option value="TRADITIONAL_CARBON">🟥 双联粉红无碳复写 (TRADITIONAL_CARBON)</option>
                                            <option value="EMERALD_CLEAN">🟩 清新翡翠商务绿 (EMERALD_CLEAN)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="font-extrabold text-[#4b5563] block">🏢 出账主体 Company / Issuer</label>
                                        <select
                                            value={bulkGenCompanyName}
                                            onChange={e => setBulkGenCompanyName(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]"
                                        >
                                            <option value="金莲记甲洞(Kim Lian Kee - Kepong)">金莲记甲洞 (Kepong)</option>
                                            <option value="KIM LIAN KEE RESTAURANT SDN BHD">KIM LIAN KEE RESTAURANT (Group)</option>
                                            <option value="甲洞大排档 (Kepong Food Stall Office)">甲洞大排档 Office</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Notes field */}
                                <div className="space-y-1 text-xs">
                                    <label className="font-extrabold text-[#4b5563] block">✍️ 内部备注/单据说明 Notes</label>
                                    <input 
                                        type="text" 
                                        placeholder="例如：五月份菜市采购小额补充自制收据凭单，以现金支付结清。" 
                                        value={bulkGenNotes} 
                                        onChange={e => setBulkGenNotes(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 min-h-[40px]"
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3 shrink-0">
                                <button 
                                    type="button" 
                                    onClick={() => setIsBulkGeneratorOpen(false)}
                                    className="flex-1 py-3 bg-[#ffffff] hover:bg-gray-100 border border-gray-300 text-gray-700 font-extrabold text-xs rounded-xl transition-all active:scale-95 min-h-[44px]"
                                >
                                    取消 Cancel
                                </button>
                                <button 
                                    type="button" 
                                    onClick={handleBulkGenerate}
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-[#111111] hover:bg-black text-[#FFD200] font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 min-h-[44px]"
                                >
                                    {isSaving ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            正在生成中...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={14} />
                                            <span>
                                                {bulkPreviewItems.length > 0 
                                                    ? `确认并保存 ${bulkPreviewItems.length} 张微调单据` 
                                                    : `一键智能生成 ${bulkGenDateMode === 'MANUAL' ? bulkGenSelectedDays.length : bulkGenCount} 张单据`
                                                }
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* BATCH PRINT PREVIEW & GENERATOR MODAL */}
                {isBatchPrintModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
                        <style>{`
                            @media print {
                                @page {
                                    size: A5 portrait;
                                    margin: 0;
                                }
                                body * { visibility: hidden !important; }
                                #printable-batch-self-vouchers, #printable-batch-self-vouchers * { 
                                    visibility: visible !important; 
                                }
                                #printable-batch-self-vouchers { 
                                    position: absolute !important; 
                                    top: 0 !important; 
                                    left: 0 !important; 
                                    width: 148mm !important; 
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
                                    padding: 0 !important;
                                    margin: 0 !important;
                                    background: white !important;
                                    width: 148mm !important;
                                    height: 210mm !important;
                                    position: relative !important;
                                    overflow: hidden !important;
                                }
                                .batch-document-content {
                                    transform: scale(0.88) !important;
                                    transform-origin: top center !important;
                                    margin: 5mm auto 0 auto !important;
                                    display: block !important;
                                    width: 595px !important;
                                    height: 842px !important;
                                }
                            }
                        `}</style>

                        <div className="bg-stone-100 dark:bg-stone-100 text-stone-900 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row max-h-[92vh] border border-stone-300 animate-in zoom-in-95">
                            
                            {/* Left Config Panel */}
                            <div className="w-full lg:w-96 bg-[#ffffff] border-b lg:border-b-0 lg:border-r border-stone-200 p-5 md:p-6 overflow-y-auto max-h-[40vh] lg:max-h-[92vh] space-y-4 shrink-0 text-left">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-black text-base text-stone-800 flex items-center gap-1.5">
                                        <Printer size={18} className="text-amber-500"/>
                                        <span>批量自制凭单对账工具</span>
                                    </h3>
                                    <span className="bg-stone-100 text-stone-500 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">BATCH</span>
                                </div>
                                <p className="text-[10px] text-stone-400 font-bold leading-normal">
                                    已自动加载选中的 {selectedVoucherIds.length} 张自制凭单/收据记录。点击打印将自动以“一页一单（A5）”格式成套输出，无需单独按键生成。
                                </p>

                                <hr className="border-stone-100" />

                                <div className="space-y-3">
                                    {/* Editable Document Title */}
                                    <div>
                                        <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">批量覆盖标题 Voucher Title Override</label>
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
                                            <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">制单人 Prepared By</label>
                                            <input 
                                                type="text" 
                                                value={batchVoucherPreparedBy} 
                                                onChange={e => setBatchVoucherPreparedBy(e.target.value)}
                                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-bold outline-none focus:border-stone-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">审核人 Checked By</label>
                                            <input 
                                                type="text" 
                                                value={batchVoucherCheckedBy} 
                                                onChange={e => setBatchVoucherCheckedBy(e.target.value)}
                                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-bold outline-none focus:border-stone-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">批准人 Approved By</label>
                                        <input 
                                            type="text" 
                                            value={batchVoucherApprovedBy} 
                                            onChange={e => setBatchVoucherApprovedBy(e.target.value)}
                                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-stone-400"
                                        />
                                    </div>

                                    {/* Action Toggles */}
                                    <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                                        <span className="text-[11px] font-black text-stone-600">显示财务已付讫印章 (Paid Stamp)</span>
                                        <label className="relative inline-flex items-center cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={batchVoucherChopEnabled} 
                                                onChange={() => setBatchVoucherChopEnabled(!batchVoucherChopEnabled)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#ffffff] after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                        </label>
                                    </div>
                                </div>

                                <div className="pt-3 grid grid-cols-2 gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setIsBatchPrintModalOpen(false)} 
                                        className="py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center"
                                        style={{ minHeight: '44px' }}
                                    >
                                        关闭窗口
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => window.print()} 
                                        className="py-3 bg-amber-500 hover:bg-amber-600 text-black font-extrabold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1"
                                        style={{ minHeight: '44px' }}
                                    >
                                        <Printer size={13}/>
                                        打印成套单据 ({selectedVoucherIds.length}张)
                                    </button>
                                </div>
                            </div>

                            {/* Right Live Document Preview Box (Batch) */}
                            <div className="flex-grow p-6 md:p-8 overflow-y-auto bg-stone-200/50 space-y-6">
                                <div id="printable-batch-self-vouchers" className="w-full max-w-2xl mx-auto space-y-6">
                                    {vouchers.filter(v => selectedVoucherIds.includes(v.id)).map((v) => {
                                        // Override the signature properties with our batch inputs
                                        const overridenVoucher = {
                                            ...v,
                                            preparedBy: batchVoucherPreparedBy || v.preparedBy,
                                            approvedBy: batchVoucherApprovedBy || v.approvedBy,
                                        };
                                        return (
                                            <div key={v.id} className="batch-print-page bg-[#ffffff] p-6 shadow-md rounded-2xl border border-stone-200 relative max-w-[595px] mx-auto overflow-hidden">
                                                <div className="flex justify-between items-center border-b pb-2 mb-4 text-[10px] text-gray-500 font-mono print:hidden">
                                                    <span>批量对账打印 (Batch Print Proof)</span>
                                                    <span>单号 Ref: {v.voucherNo}</span>
                                                </div>
                                                <div className="batch-document-content">
                                                    <A5VoucherDocument voucher={overridenVoucher} isForActualExport={true} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 📱 Mobile Responsive Full-screen Preview Modal Overlay */}
                {isMobilePreviewOpen && previewVoucher && (
                    <div 
                        className="fixed inset-0 bg-black/95 z-[300] flex flex-col backdrop-blur-md animate-in fade-in" 
                        onClick={() => setIsMobilePreviewOpen(false)}
                    >
                        {/* Drawer Header */}
                        <div 
                            className="bg-[#111111] px-4 py-3 flex justify-between items-center text-[#ffffff] shrink-0 border-b border-[#FFD200]" 
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="min-w-0">
                                <span className="text-[9px] bg-amber-400 text-black px-2 py-0.5 rounded-full font-black uppercase tracking-wider block w-max mb-1">
                                    A5 凭证移动预览 / Mobile AirPrint
                                </span>
                                <h4 className="font-serif font-black text-sm truncate text-amber-100">
                                    {previewVoucher.voucherNo}
                                </h4>
                            </div>
                            <button 
                                onClick={() => setIsMobilePreviewOpen(false)} 
                                className="p-2.5 hover:bg-[#ffffff]/10 rounded-full transition-transform active:scale-90"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Width-aware A5 preview: always fits the mobile viewport horizontally */}
                        <div 
                            className="flex-grow min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 flex items-start justify-center bg-zinc-900/60"
                            onClick={() => setIsMobilePreviewOpen(false)}
                        >
                            <div
                                className="relative shrink-0 bg-[#FFFFFF] shadow-2xl overflow-hidden"
                                style={{
                                    width: `${595 * mobilePreviewScale}px`,
                                    height: `${842 * mobilePreviewScale}px`
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div
                                    className="absolute left-0 top-0 w-[595px] h-[842px] origin-top-left"
                                    style={{ transform: `scale(${mobilePreviewScale})` }}
                                >
                                    <A5VoucherDocument voucher={previewVoucher} />
                                </div>
                            </div>
                        </div>

                        {/* Bottom Action Footer Sheet (Apple HIG Compliant, >=44px controls) */}
                        <div 
                            className="bg-[#111111] px-4 pt-3 border-t border-white/10 space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]" 
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center text-xs font-mono px-1">
                                <span className="text-gray-400">凭单金额</span>
                                <span className="text-[#FFD200] font-black text-sm">RM {previewVoucher.totalAmount.toFixed(2)}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setIsMobilePreviewOpen(false)}
                                    className="py-3 px-4 border border-white/20 hover:border-white/40 text-[#ffffff] rounded-xl font-bold text-xs active:scale-95 transition-all min-h-[44px]"
                                >
                                    返回列表
                                </button>
                                <button
                                    onClick={() => handleDownloadA5PDF(previewVoucher)}
                                    disabled={!!isExporting}
                                    className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-[#ffffff] rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[44px]"
                                >
                                    {isExporting === previewVoucher.id ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            正在渲染 A5...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={14} />
                                            下载 A5 PDF
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 📸 Image Save Helper Modal - Opens when capturedImgUrl is available */}
                {capturedImgUrl && (
                    <div 
                        className="fixed inset-0 bg-black/95 z-[500] flex flex-col items-center justify-center p-4 backdrop-blur-lg animate-in zoom-in duration-250"
                        onClick={() => setCapturedImgUrl(null)}
                    >
                        <div 
                            className="bg-[#ffffff] rounded-3xl p-5 md:p-6 shadow-2xl max-w-sm md:max-w-md w-full flex flex-col items-center space-y-4 animate-in slide-in-from-bottom"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center w-full pb-2 border-b border-gray-100">
                                <span className="font-sans font-black text-xs text-gray-800 flex items-center gap-1.5">
                                    <Sparkles size={16} className="text-amber-500 animate-pulse" />
                                    超清对账单图片已渲染完成
                                </span>
                                <button 
                                    onClick={() => setCapturedImgUrl(null)} 
                                    className="p-1 px-3 bg-gray-100 hover:bg-gray-200 rounded-full font-black text-xs"
                                >
                                    关闭 Close
                                </button>
                            </div>

                            {/* Info Tips Panel */}
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left">
                                <span className="text-[11px] block font-black text-amber-900 mb-1">
                                    💡 手机端保存/分享说明:
                                </span>
                                <p className="text-[10px] text-amber-900 font-medium leading-relaxed">
                                    我们已将凭单转为高清 A5 尺寸图像。请在手机屏幕上<strong>【长按下方图片】</strong>即可：
                                    <strong className="text-red-700 font-extrabold block mt-1">
                                        👉 选择【发送给朋友】(直接微信/WhatsApp发送) <br/>
                                        👉 选择【保存到手机相册 / 保存图片】
                                    </strong>
                                    此方式完全无损，在手机上做账或分享给司机完全不变形不白屏！
                                </p>
                            </div>

                            {/* Viewable Saveable Image wrapper */}
                            <div className="w-full max-h-[42vh] overflow-y-auto border-4 border-amber-300 rounded-2xl bg-slate-50 relative">
                                <img 
                                    src={capturedImgUrl} 
                                    alt="Super clear Voucher Document" 
                                    className="w-full h-auto object-contain select-none pointer-events-auto"
                                    referrerPolicy="no-referrer"
                                />
                                <div className="absolute top-2 right-2 bg-black/60 text-[#ffffff] text-[9px] px-2 py-1 rounded font-bold pointer-events-none">
                                    📱 手机端长按此图保存
                                </div>
                            </div>
                            
                            <button
                                onClick={() => setCapturedImgUrl(null)}
                                className="w-full py-3 bg-[#111111] hover:bg-black text-[#ffffff] font-black text-xs rounded-xl transition-all active:scale-95"
                            >
                                返回预览
                            </button>
                        </div>
                    </div>
                )}

                {/* SIMPLIFIED CREATE / EDIT FORM */}
                {isFormOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm" onClick={handleCloseForm}>
                        <div className="bg-[#F6F7FB] w-full md:max-w-3xl rounded-t-[28px] md:rounded-[28px] shadow-2xl max-h-[96vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#ffffff] px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-base md:text-lg font-black text-[#111111]">{editingVoucher.createdAt ? '编辑凭单' : '新建支出凭单'}</h3>
                                    <p className="text-[11px] text-[#6b7280] mt-0.5">先填写收款人、用途与金额，其余资料按需要展开。</p>
                                </div>
                                <button onClick={handleCloseForm} className="w-11 h-11 rounded-full bg-[#F6F7FB] flex items-center justify-center text-[#4b5563]"><X size={18}/></button>
                            </div>

                            <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4">
                                {apPrefillRef && (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-emerald-800">已从应付账款带入资料</p>
                                            <p className="text-[11px] text-emerald-700 mt-1 truncate">{apPrefillRef.company} · RM {Number(apPrefillRef.totalAmount || 0).toFixed(2)}</p>
                                            <p className="text-[10px] text-emerald-600 mt-1 line-clamp-2">{apPrefillRef.particulars}</p>
                                        </div>
                                        <button onClick={() => setApPrefillRef(null)} className="text-emerald-700 text-[10px] font-bold shrink-0">隐藏</button>
                                    </div>
                                )}

                                <div className="bg-[#ffffff] rounded-2xl border border-[#E5E7EB] shadow-sm p-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-[#4b5563] block mb-1.5">收款人 / Payee *</label>
                                            <input value={editingVoucher.payeeName || ''} onChange={e => setEditingVoucher({...editingVoucher, payeeName:e.target.value})} placeholder="司机、员工或临时供应商名称" className="w-full h-12 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-sm font-semibold outline-none focus:border-[#FFD200] focus:bg-[#ffffff]"/>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-[#4b5563] block mb-1.5">日期 / Date</label>
                                            <input type="date" value={editingVoucher.date || ''} onChange={e => { const date=e.target.value; setEditingVoucher({...editingVoucher,date,voucherNo:generateSequenceNoForDate(date)}); }} className="w-full h-12 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-sm font-semibold outline-none focus:border-[#FFD200]"/>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 bg-[#F6F7FB] p-1 rounded-xl">
                                        <button type="button" onClick={() => setEntryMode('QUICK')} className={`h-11 rounded-lg text-xs font-black transition-all ${entryMode==='QUICK'?'bg-[#ffffff] text-[#111111] shadow-sm':'text-[#6b7280]'}`}>快速金额</button>
                                        <button type="button" onClick={() => setEntryMode('ITEMIZED')} className={`h-11 rounded-lg text-xs font-black transition-all ${entryMode==='ITEMIZED'?'bg-[#ffffff] text-[#111111] shadow-sm':'text-[#6b7280]'}`}>详细项目</button>
                                    </div>

                                    {entryMode === 'QUICK' ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[11px] font-bold text-[#4b5563] block mb-1.5">支出说明 / Purpose *</label>
                                                <input value={voucherItems[0]?.description || ''} onChange={e => handleItemChange(0,'description',e.target.value)} placeholder="例如：甲洞至半山芭送货费" className="w-full h-12 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-sm outline-none focus:border-[#FFD200]"/>
                                                <div className="flex gap-1.5 overflow-x-auto mt-2 pb-1">
                                                    {QUICK_CONTENT_PRESETS.map((preset,idx)=><button key={idx} type="button" onClick={()=>handleQuickPresetFill(0,preset)} className="shrink-0 px-3 py-1.5 rounded-lg bg-[#FFF8D6] text-[#5F4B00] text-[10px] font-bold border border-[#FFD200]/40">{preset.description.split('/')[0].trim()}</button>)}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-bold text-[#4b5563] block mb-1.5">总金额 / Amount *</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-3.5 text-sm font-black text-[#6b7280]">RM</span>
                                                    <input type="number" step="0.01" value={voucherItems[0]?.unitPrice || ''} onChange={e => { handleItemChange(0,'qty',1); handleItemChange(0,'unitPrice',e.target.value); }} className="w-full h-14 pl-11 pr-3 rounded-xl border border-[#FFD200] bg-[#FFFDF3] text-2xl font-black tabular-nums outline-none" placeholder="0.00"/>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {voucherItems.map((item,idx)=><div key={idx} className="rounded-2xl border border-[#E5E7EB] p-3 bg-[#ffffff] space-y-3">
                                                <div className="flex justify-between items-center"><span className="text-xs font-black">项目 {idx+1}</span><button disabled={voucherItems.length<=1} onClick={()=>handleRemoveItemRow(idx)} className="w-11 h-11 rounded-lg bg-red-50 text-red-500 flex items-center justify-center disabled:opacity-30"><Trash2 size={14}/></button></div>
                                                <input value={item.description} onChange={e=>handleItemChange(idx,'description',e.target.value)} placeholder="项目说明" className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs outline-none focus:border-[#FFD200]"/>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <input type="number" value={item.qty} onChange={e=>handleItemChange(idx,'qty',e.target.value)} placeholder="数量" className="h-11 px-2 rounded-xl border border-[#E5E7EB] text-xs text-center"/>
                                                    <input value={item.unit || ''} onChange={e=>handleItemChange(idx,'unit',e.target.value)} placeholder="单位" className="h-11 px-2 rounded-xl border border-[#E5E7EB] text-xs text-center"/>
                                                    <input type="number" value={item.unitPrice || ''} onChange={e=>handleItemChange(idx,'unitPrice',e.target.value)} placeholder="单价" className="h-11 px-2 rounded-xl border border-[#E5E7EB] text-xs text-right"/>
                                                </div>
                                                <div className="text-right text-xs font-black tabular-nums">小计 RM {Number(item.amount || 0).toFixed(2)}</div>
                                            </div>)}
                                            <button type="button" onClick={handleAddItemRow} className="w-full h-11 rounded-xl border border-dashed border-[#FFD200] bg-[#FFFDF3] text-xs font-black text-[#5F4B00] flex items-center justify-center gap-1"><Plus size={14}/> 添加项目</button>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between bg-[#111111] text-[#ffffff] rounded-2xl px-4 py-3">
                                        <span className="text-xs text-gray-300">凭单总额</span>
                                        <span className="text-xl font-black text-[#FFD200] tabular-nums">RM {calculateTotal(voucherItems).toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="bg-[#ffffff] rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                                    <button type="button" onClick={()=>setShowAdvancedFields(!showAdvancedFields)} className="w-full min-h-[52px] px-4 flex items-center justify-between text-left">
                                        <span className="flex items-center gap-2 text-xs font-black text-[#111111]"><SlidersHorizontal size={15}/> 更多资料与财务设置</span>
                                        <ChevronDown size={17} className={`transition-transform ${showAdvancedFields?'rotate-180':''}`}/>
                                    </button>
                                    {showAdvancedFields && <div className="p-4 pt-0 border-t border-[#E5E7EB] grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div><label className="text-[10px] font-bold text-[#6b7280] block mb-1">凭单类型</label><select value={editingVoucher.voucherType || 'PURCHASE_RECEIPT'} onChange={e=>{const vt=e.target.value as any;setEditingVoucher({...editingVoucher,voucherType:vt,voucherNo:generateSequenceNoForDate(editingVoucher.date || new Date().toISOString().split('T')[0],vt)});}} className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs font-bold"><option value="PURCHASE_RECEIPT">临时采购</option><option value="DELIVERY_RECEIPT">司机及运输费</option><option value="PAYMENT_VOUCHER">员工或个人代付</option><option value="CASH_VOUCHER">一般现金支出</option><option value="CASH_BILL">自开收入收据</option></select></div>
                                        <div><label className="text-[10px] font-bold text-[#6b7280] block mb-1">付款方式</label><select value={editingVoucher.paymentMethod || 'CASH'} onChange={e=>setEditingVoucher({...editingVoucher,paymentMethod:e.target.value as any})} className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs font-bold"><option value="CASH">现金</option><option value="ONLINE_TRANSFER">银行转账</option></select></div>
                                        <div><label className="text-[10px] font-bold text-[#6b7280] block mb-1">联系电话 / 车牌号</label><input value={editingVoucher.payeePhone || ''} onChange={e=>setEditingVoucher({...editingVoucher,payeePhone:e.target.value})} className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs"/></div>
                                        <div><label className="text-[10px] font-bold text-[#6b7280] block mb-1">凭单编号</label><input value={editingVoucher.voucherNo || ''} onChange={e=>setEditingVoucher({...editingVoucher,voucherNo:e.target.value})} className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs font-mono font-bold"/></div>
                                        <div><label className="text-[10px] font-bold text-[#6b7280] block mb-1">制单人</label><input value={editingVoucher.preparedBy || ''} onChange={e=>setEditingVoucher({...editingVoucher,preparedBy:e.target.value})} className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs"/></div>
                                        <div><label className="text-[10px] font-bold text-[#6b7280] block mb-1">批准人</label><input value={editingVoucher.approvedBy || ''} onChange={e=>setEditingVoucher({...editingVoucher,approvedBy:e.target.value})} className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs"/></div>
                                        <div className="md:col-span-2"><label className="text-[10px] font-bold text-[#6b7280] block mb-1">备注</label><textarea rows={2} value={editingVoucher.notes || ''} onChange={e=>setEditingVoucher({...editingVoucher,notes:e.target.value})} className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] text-xs" placeholder="仅填写必要的内部说明"/></div>
                                    </div>}
                                </div>
                            </div>

                            <div className="bg-[#ffffff] border-t border-[#E5E7EB] p-4 flex gap-3 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                                <button onClick={handleCloseForm} className="w-28 h-12 rounded-xl border border-[#E5E7EB] text-[#4b5563] text-xs font-bold">取消</button>
                                <button onClick={handleSave} disabled={isSaving} className="flex-1 h-12 rounded-xl bg-[#FFD200] text-[#111111] text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">{isSaving?<RefreshCw size={15} className="animate-spin"/>:<Save size={15}/>} 保存凭单</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── SIMPLIFIED A5 VOUCHER DOCUMENT ──
interface A5VoucherDocumentProps {
    voucher: SelfIssuedVoucher;
    isForActualExport?: boolean;
}

const A5VoucherDocument: React.FC<A5VoucherDocumentProps> = ({ voucher }) => {
    const totalAmount = voucher.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
    const titleMap: Record<string, string> = {
        PURCHASE_RECEIPT: '采购支出凭单',
        DELIVERY_RECEIPT: '司机 / 运输费凭单',
        PAYMENT_VOUCHER: '付款凭单',
        CASH_VOUCHER: '现金支出凭单',
        CASH_BILL: '自开收款收据',
    };
    const paymentText = voucher.paymentMethod === 'ONLINE_TRANSFER' ? '银行转账' : '现金';

    return (
        <div className="w-[595px] h-[842px] bg-[#ffffff] text-[#111111] p-9 flex flex-col font-sans" style={{ boxSizing:'border-box', fontFamily:'Inter, PingFang SC, system-ui, sans-serif' }}>
            <div className="h-2 bg-[#FFD200] rounded-full mb-7" />

            <div className="flex items-start justify-between border-b-2 border-[#111111] pb-5">
                <div>
                    <h1 className="text-[22px] font-black tracking-tight">kim lian kee Group</h1>
                    <p className="text-[9px] text-[#6b7280] mt-1">{(voucher.companyName || '金莲记甲洞').replace(/吉隆坡金莲记/g,'金莲记甲洞')}</p>
                </div>
                <div className="text-right">
                    <h2 className="text-[16px] font-black">{titleMap[voucher.voucherType] || '支出凭单'}</h2>
                    <p className="font-mono text-[10px] font-bold mt-2">{voucher.voucherNo}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 py-6 text-[11px]">
                <div><span className="text-[#6b7280] block text-[9px] mb-1">日期 DATE</span><strong>{voucher.date}</strong></div>
                <div><span className="text-[#6b7280] block text-[9px] mb-1">付款方式 PAYMENT</span><strong>{paymentText}</strong></div>
                <div className="col-span-2"><span className="text-[#6b7280] block text-[9px] mb-1">收款人 PAYEE</span><strong className="text-[14px]">{voucher.payeeName}</strong>{voucher.payeePhone && <span className="text-[#6b7280] ml-3">{voucher.payeePhone}</span>}</div>
            </div>

            <div className="border border-[#E5E7EB] rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-[10px]">
                    <thead className="bg-[#111111] text-[#ffffff]">
                        <tr><th className="p-3 w-8 text-center">#</th><th className="p-3">支出项目 / PARTICULARS</th><th className="p-3 w-12 text-center">数量</th><th className="p-3 w-20 text-right">单价</th><th className="p-3 w-24 text-right">金额</th></tr>
                    </thead>
                    <tbody>
                        {voucher.items.map((item,index)=><tr key={index} className="border-b border-[#E5E7EB] last:border-b-0">
                            <td className="p-3 text-center text-[#6b7280]">{index+1}</td>
                            <td className="p-3 font-semibold">{item.description || '-'}</td>
                            <td className="p-3 text-center font-mono">{Number(item.qty || 0)}{item.unit ? ` ${item.unit}` : ''}</td>
                            <td className="p-3 text-right font-mono">{Number(item.unitPrice || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-black">{(Number(item.qty || 0)*Number(item.unitPrice || 0)).toFixed(2)}</td>
                        </tr>)}
                    </tbody>
                </table>
            </div>

            <div className="mt-5 flex justify-end">
                <div className="rounded-2xl border-2 border-[#111111] overflow-hidden flex items-stretch">
                    <div className="bg-[#FFD200] px-5 py-3 text-[11px] font-black flex items-center">总金额 TOTAL</div>
                    <div className="px-6 py-3 text-[20px] font-black font-mono min-w-[170px] text-right">RM {totalAmount.toFixed(2)}</div>
                </div>
            </div>

            {voucher.notes && <div className="mt-5 rounded-xl bg-[#F6F7FB] border border-[#E5E7EB] p-3 text-[9px] text-[#4b5563]"><strong className="text-[#111111]">备注：</strong> {voucher.notes.replace(/吉隆坡金莲记/g,'金莲记甲洞')}</div>}

            <div className="mt-auto">
                <p className="text-[9px] text-[#6b7280] mb-8">本凭单作为该笔付款的内部记录及收款证明。</p>
                <div className="grid grid-cols-3 gap-7 text-center">
                    <div><div className="h-12 border-b border-[#6b7280] flex items-end justify-center pb-1 text-[10px] font-semibold">{voucher.preparedBy || ''}</div><p className="text-[8px] font-bold mt-2">经手人 PREPARED BY</p></div>
                    <div><div className="h-12 border-b border-[#6b7280]"></div><p className="text-[8px] font-bold mt-2">收款人签名 PAYEE</p></div>
                    <div><div className="h-12 border-b border-[#6b7280] flex items-end justify-center pb-1 text-[10px] font-semibold">{voucher.approvedBy || ''}</div><p className="text-[8px] font-bold mt-2">批准人 APPROVED BY</p></div>
                </div>
                <div className="mt-8 pt-3 border-t border-[#E5E7EB] flex justify-between text-[7px] text-[#9ca3af] font-mono"><span>System record</span><span>{voucher.voucherNo}</span></div>
            </div>
        </div>
   );
};
