import React, { useState, useEffect, useRef } from 'react';
import { 
    FileText, Plus, Search, X, Save, Trash2, Calendar, Download, 
    Sparkles, RefreshCw, Printer, AlertCircle, CheckCircle2, User, Phone, 
    FileSignature, Coins, Receipt, HelpCircle, ArrowLeftRight, HardDrive,
    ExternalLink, FileCheck, Loader2
} from 'lucide-react';
import { SelfIssuedVoucher, SelfVoucherItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { numberToWords, COMPANY_INFO } from '../../utils/paymentVoucherUtils';

// Preset default voucher values for quick-fill
const QUICK_CONTENT_PRESETS = [
    { description: '运输路费 / Transport charges (Raw Materials Delivery)', qty: 1, unitPrice: 150, unit: '趟' },
    { description: '临时小额买菜 / Minor cash purchase for urgent ingredients', qty: 1, unitPrice: 45, unit: '次' },
    { description: '临时杂工清洁费 / One-time helper cleaning fee & maintenance', qty: 1, unitPrice: 120, unit: '次' },
    { description: '五金配件买螺丝没有单据 / Hardwares & screws replacement (No original receipt)', qty: 1, unitPrice: 28, unit: '组' },
    { description: '紧急运货冰块 / Urgent ice bags delivery', qty: 4, unitPrice: 12, unit: '包' },
];

interface SelfInvoiceModuleProps {
    onClose: () => void;
}

export const SelfInvoiceModule: React.FC<SelfInvoiceModuleProps> = ({ onClose }) => {
    const [vouchers, setVouchers] = useState<SelfIssuedVoucher[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
    const [isFormOpen, setIsFormOpen] = useState(false);
    
    // Core edit form state
    const [editingVoucher, setEditingVoucher] = useState<Partial<SelfIssuedVoucher>>({});
    const [voucherItems, setVoucherItems] = useState<SelfVoucherItem[]>([]);
    const [apPrefillRef, setApPrefillRef] = useState<{ company: string; date: string; totalAmount: number; particulars: string; billRefId: string } | null>(null);
    
    // Status controls
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState<string | null>(null); // holds voucherId when downloading
    const [previewVoucher, setPreviewVoucher] = useState<SelfIssuedVoucher | null>(null);
    const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
    const [capturedImgUrl, setCapturedImgUrl] = useState<string | null>(null);
    const [isGeneratingImg, setIsGeneratingImg] = useState(false);

    // Filter controls
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('ALL');

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
    const [savedPayees, setSavedPayees] = useState<{name: string, phone: string, type: 'INDIVIDUAL' | 'AGENT' | 'DRIVER' | 'INFORMAL_VENDOR'}[]>(() => {
        try {
            const stored = localStorage.getItem('klk_starred_payees');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    });

    // Google Drive integration state
    const [driveState, setDriveState] = useState<'IDLE' | 'GENERATING' | 'SHARING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [driveToken, setDriveToken] = useState<string | null>(null);
    const [driveError, setDriveError] = useState<string | null>(null);

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

    const toggleStarPayee = (name: string, phone: string, type: 'INDIVIDUAL' | 'AGENT' | 'DRIVER' | 'INFORMAL_VENDOR') => {
        if (!name.trim()) return;
        const index = savedPayees.findIndex(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
        let updated = [...savedPayees];
        if (index > -1) {
            updated.splice(index, 1);
        } else {
            updated.push({ name: name.trim(), phone: phone.trim(), type });
        }
        setSavedPayees(updated);
        localStorage.setItem('klk_starred_payees', JSON.stringify(updated));
    };

    const isPayeeStarred = (name: string) => {
        if (!name) return false;
        return savedPayees.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    };

    const handleSaveToDrive = async (voucher: SelfIssuedVoucher) => {
        setDriveError(null);
        setDriveState('GENERATING');
        
        try {
            // Step 1: Generate A5 PDF Blob just like download handler
            const captureNode = document.getElementById(`a5-capture-global`);
            if (!captureNode) {
                throw new Error("找不到 A5 页面渲染节点，请确保凭单在预览中显示。");
            }
            
            await new Promise((resolve) => setTimeout(resolve, 300));
            
            const canvas = await html2canvas(captureNode, {
                scale: 2.2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: 595,
                windowHeight: 842,
            });
            
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('p', 'mm', 'a5');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
            
            const pdfBlob = pdf.output('blob');
            const safePayee = voucher.payeeName.replace(/[\s\W]+/g, '_');
            const fileName = `VOUCHER_${voucher.voucherNo}_${safePayee}.pdf`;

            // Step 2: Create a native Shareable File object
            const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

            setDriveState('SHARING');

            // Step 3: Check if browser supports Web Share API with Files
            const canShare = navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] });

            if (canShare) {
                // Trigger the system native share sheet!
                await navigator.share({
                    files: [pdfFile],
                    title: fileName,
                    text: `金莲记甲洞(Kim Lian Kee Kepong) - 自制凭单号: ${voucher.voucherNo}`
                });
                setDriveState('SUCCESS');
                setTimeout(() => setDriveState('IDLE'), 3000);
            } else {
                // Fallback for Desktop/Non-supporting browsers: Download automatically
                const downloadUrl = URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(downloadUrl);

                setDriveState('SUCCESS');
                setDriveError("电脑端已自动下载！请直接将 PDF 文件拖拽存入您的 Google Drive。");
                setTimeout(() => {
                    setDriveState('IDLE');
                    setDriveError(null);
                }, 7000);
            }
        } catch (uploadErr: any) {
            console.error(uploadErr);
            setDriveState('ERROR');
            setDriveError("生成凭单 PDF 失败: " + (uploadErr.message || uploadErr));
            setTimeout(() => setDriveState('IDLE'), 4000);
        }
    };

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
            { description: '临时现付支出 / Urgent cash purchase particulars', qty: 1, unitPrice: 50, unit: '次', amount: 50 }
        ]);
        setIsFormOpen(true);
    };

    const handleOpenEdit = (voucher: SelfIssuedVoucher) => {
        setEditingVoucher({ ...voucher });
        setVoucherItems([...voucher.items]);
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

            const canvas = await html2canvas(captureNode, {
                scale: 2.2, // high-res crisp typography
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: 595,
                windowHeight: 842,
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
        } catch (e) {
            console.error("A5 PDF Generation Error: ", e);
            alert("导出 PDF 失败，外部字体或CDN渲染延迟，请重试。");
        } finally {
            setIsExporting(null);
        }
    };

    // Generate high-resolution image for mobile saving
    const handleGenerateMobileImage = async (voucher: SelfIssuedVoucher) => {
        setIsGeneratingImg(true);
        setPreviewVoucher(voucher);
        setCapturedImgUrl(null); // Reset
        try {
            const captureNode = document.getElementById(`a5-capture-global`);
            if (!captureNode) {
                alert("找不到导出节点，请稍候重试！");
                return;
            }

            // Wait a tiny bit for layout stability
            await new Promise((resolve) => setTimeout(resolve, 300));

            const canvas = await html2canvas(captureNode, {
                scale: 2.5, // Even higher resolution for crisp mobile long-press image saving
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: 595,
                windowHeight: 842,
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            setCapturedImgUrl(imgData);
        } catch (e) {
            console.error("Mobile Image Generation Error: ", e);
            alert("生成图片失败，请重试。");
        } finally {
            setIsGeneratingImg(false);
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
            case 'PURCHASE_RECEIPT': return { text: '双色收据 (供应商未开单)', color: 'bg-green-100 text-green-850 border-green-200', icon: FileText };
            default: return { text: '内部自制票据', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: FileText };
        }
    };

    // Style colors and properties mapper for A4 templates
    const getStyleConfig = (style: string) => {
        switch (style) {
            case 'VINTAGE_GOLD':
                return {
                    bgClass: 'bg-[#FDFBF7]',
                    borderClass: 'border-2 border-[#D4AF37]',
                    textTitleClass: 'text-[#8B6508] font-serif',
                    accentColor: '#D4AF37', // Gold 
                    headerBg: 'bg-[#F5ECE1]',
                    tableHeaderBg: 'bg-[#F0E2D1] text-[#6E470B]',
                    stampText: 'KIM LIAN KEE PAID',
                    stampColor: 'border-red-500/70 text-red-500/70',
                    fontSans: 'font-serif',
                };
            case 'MODERN_DARK':
                return {
                    bgClass: 'bg-white',
                    borderClass: 'border-2 border-slate-800',
                    textTitleClass: 'text-slate-900 font-sans tracking-wider',
                    accentColor: '#1E293B', // Slate gray
                    headerBg: 'bg-slate-100',
                    tableHeaderBg: 'bg-slate-800 text-white',
                    stampText: 'APPROVED & ISSUED',
                    stampColor: 'border-blue-600/70 text-blue-600/70',
                    fontSans: 'font-sans',
                };
            case 'TRADITIONAL_CARBON':
                return {
                    bgClass: 'bg-[#FFF8FA]', // Carbon pink tint
                    borderClass: 'border-2 border-dashed border-pink-400',
                    textTitleClass: 'text-pink-800 font-mono font-bold uppercase',
                    accentColor: '#EC4899', // Pink
                    headerBg: 'bg-pink-50',
                    tableHeaderBg: 'bg-pink-100 text-pink-900',
                    stampText: 'CASH RECEIVED / PAID',
                    stampColor: 'border-cyan-500/80 text-cyan-500/80',
                    fontSans: 'font-mono',
                };
            case 'CASH_BILL_GREEN':
                return {
                    bgClass: 'bg-[#FCFFF9]',
                    borderClass: 'border-2 border-[#094F2B]',
                    textTitleClass: 'text-[#094F2B] font-sans font-bold',
                    accentColor: '#094F2B', // Forest green
                    headerBg: 'bg-[#8BC43F]/20',
                    tableHeaderBg: 'bg-[#094F2B] text-white',
                    stampText: 'VERIFIED PAID',
                    stampColor: 'border-[#094F2B]/65 text-[#094F2B]/65',
                    fontSans: 'font-sans',
                };
            case 'EMERALD_CLEAN':
                return {
                    bgClass: 'bg-[#F4FAF6]',
                    borderClass: 'border-2 border-emerald-600',
                    textTitleClass: 'text-emerald-900 font-sans font-bold',
                    accentColor: '#059669', // Emerald
                    headerBg: 'bg-emerald-50',
                    tableHeaderBg: 'bg-emerald-700 text-white',
                    stampText: 'KIM LIAN KEE PAID',
                    stampColor: 'border-emerald-500 text-emerald-500',
                    fontSans: 'font-sans',
                };
            default:
                return {
                    bgClass: 'bg-white',
                    borderClass: 'border border-gray-300',
                    textTitleClass: 'text-gray-900 font-sans',
                    accentColor: '#4b5563',
                    headerBg: 'bg-gray-100',
                    tableHeaderBg: 'bg-gray-100 text-gray-800',
                    stampText: 'PROCESSED',
                    stampColor: 'border-red-400 text-red-400',
                    fontSans: 'font-sans',
                };
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-7xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* Header */}
                <div className="bg-[#1A1A1A] px-4 pb-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700] safe-area-top">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#FFD700] text-black p-2.5 rounded-xl shadow-lg">
                            <Sparkles size={24} className="animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-serif font-black text-xl tracking-wide flex items-center gap-2">
                                自制对账收据联 & 支出凭单工具
                                <span className="bg-amber-400 text-black text-[9px] px-2 py-0.5 rounded-full font-sans font-black">A5 PDF 下载</span>
                            </h3>
                            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">SELF-ISSUED VOUCHERS / DRIVERS BILL CREATOR</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full select-none transition-all active:scale-90">
                        <X size={20}/>
                    </button>
                </div>

                {/* Main Body Grid */}
                <div className="flex-grow overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* Left Column: List and Management */}
                    <div className="w-full lg:w-5/12 border-r border-gray-200 flex flex-col bg-white overflow-hidden">
                        
                        {/* Search and Filters */}
                        <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-3 shrink-0">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                <div className="relative sm:col-span-6 col-span-1">
                                    <Search className="absolute left-3 top-3 text-gray-400" size={16}/>
                                    <input 
                                        type="text" 
                                        placeholder="搜索收款人、单号或备注内容..." 
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none shadow-sm h-full"
                                    />
                                </div>
                                <div className="sm:col-span-6 col-span-1 flex gap-1.5">
                                    <button 
                                        onClick={handleOpenCreateNew}
                                        className="flex-1 bg-[#1A1A1A] text-[#FFD700] font-bold text-xs px-2.5 py-2.5 rounded-xl hover:bg-black transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 active:scale-95 min-h-[44px]"
                                    >
                                        <Plus size={14} className="bg-[#FFD700] text-black rounded-full" />
                                        单张手工录入
                                    </button>
                                    <button 
                                        onClick={() => setIsBulkGeneratorOpen(true)}
                                        className="flex-1 bg-amber-400 text-black font-extrabold text-xs px-2.5 py-2.5 rounded-xl hover:bg-amber-500 transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 active:scale-95 min-h-[44px]"
                                    >
                                        <Sparkles size={14} className="animate-pulse" />
                                        智能批量快速生成
                                    </button>
                                </div>
                            </div>

                            {/* Company and Date Range Multi-Filters */}
                            <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-2.5 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">🛡️ 记账度量控制 Filter Dashboard</span>
                                    {(startDate || endDate || selectedCompanyFilter !== 'ALL') && (
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setStartDate('');
                                                setEndDate('');
                                                setSelectedCompanyFilter('ALL');
                                            }}
                                            className="text-[9px] font-extrabold text-red-605 text-red-650 hover:underline"
                                        >
                                            重置 Reset
                                        </button>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    {/* Company selector */}
                                    <div className="flex flex-col gap-1">
                                        <span className="font-bold text-gray-400">选择公司 Issuer:</span>
                                        <select
                                            value={selectedCompanyFilter}
                                            onChange={e => setSelectedCompanyFilter(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1.5 focus:ring-1 focus:ring-amber-400 text-[10px] font-bold outline-none"
                                        >
                                            <option value="ALL">🏢 全部公司 (All)</option>
                                            {Array.from(new Set(vouchers.map(v => v.companyName || '金莲记甲洞(Kim Lian Kee - Kepong)'))).map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Date selectors */}
                                    <div className="flex flex-col gap-1">
                                        <span className="font-bold text-gray-400">日期区间 Date Range:</span>
                                        <div className="flex items-center gap-1">
                                            <input 
                                                type="date"
                                                value={startDate}
                                                onChange={e => setStartDate(e.target.value)}
                                                className="bg-gray-50 border border-gray-200 rounded-lg p-1 w-full text-[9px] outline-none font-mono"
                                            />
                                            <span className="text-gray-400 text-[8px]">-</span>
                                            <input 
                                                type="date"
                                                value={endDate}
                                                onChange={e => setEndDate(e.target.value)}
                                                className="bg-gray-50 border border-gray-200 rounded-lg p-1 w-full text-[9px] outline-none font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Auditor Statement & total filtered sum */}
                                <div className="bg-amber-50/55 p-2 rounded-lg border border-amber-100 flex items-center justify-between text-[11px] font-bold sm:flex-row flex-col gap-1 text-center sm:text-left">
                                    <span className="text-gray-500 font-bold block">本期对账总额 Total Sum:</span>
                                    <span className="text-red-650 text-red-600 font-extrabold font-mono text-xs">
                                        RM {filteredTotalSum.toFixed(2)}
                                        <span className="text-[9px] text-gray-400 font-normal ml-1">({filteredVouchers.length} 张单)</span>
                                    </span>
                                </div>

                                {/* Select All & Batch action button */}
                                {filteredVouchers.length > 0 && (
                                    <div className="flex items-center justify-between border-t border-gray-200/50 pt-2 text-[10px]">
                                        <label className="flex items-center gap-1.5 font-bold text-gray-500 cursor-pointer select-none">
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
                                                    className="bg-[#1A1A1A] hover:bg-black text-[#FFD700] px-2.5 py-1 rounded-lg font-extrabold text-[9px] active:scale-95 transition-all flex items-center gap-1"
                                                >
                                                    <Printer size={10}/>
                                                    <span>批量打印 ({selectedVoucherIds.length})</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Categorization filter */}
                            <div className="flex gap-1 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
                                {[
                                    { id: 'ALL', label: '全部' },
                                    { id: 'CASH_BILL', label: '🧾 现金账单 (Cash Bill)' },
                                    { id: 'PAYMENT_VOUCHER', label: '💶 付款证明' },
                                    { id: 'DELIVERY_RECEIPT', label: '🚚 运费单' },
                                    { id: 'CASH_VOUCHER', label: '🪙 现金条' },
                                    { id: 'PURCHASE_RECEIPT', label: '🛒 无单采买' },
                                ].map(btn => (
                                    <button
                                        key={btn.id}
                                        type="button"
                                        onClick={() => setSelectedTypeFilter(btn.id)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all whitespace-nowrap active:scale-95 ${
                                            selectedTypeFilter === btn.id 
                                            ? 'bg-amber-400 text-black border-amber-400 shadow-sm' 
                                            : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-100'
                                        }`}
                                    >
                                        {btn.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Vouchers List */}
                        <div className="flex-grow overflow-y-auto p-3 space-y-2.5 bg-gray-50/50">
                            {filteredVouchers.length === 0 ? (
                                <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-inner">
                                    <div className="text-4xl mb-3">📬</div>
                                    <p className="text-xs text-gray-400 font-bold">没有找到自制凭单记录</p>
                                    <p className="text-[10px] text-gray-400 mt-1">此工具用于由于运输承运商、买菜无票等情况需要手工补充规范化对账单据的场景。</p>
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
                                            className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 relative group ${
                                                isCurrentPreview 
                                                ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white shadow-lg shadow-black/10' 
                                                : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start gap-2">
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
                                                        isCurrentPreview ? 'bg-white/10 text-amber-300 border-white/10' : typeMeta.color
                                                    }`}>
                                                        <TypeIcon size={10} />
                                                        {typeMeta.text}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-mono font-bold tracking-tight opacity-70">
                                                    {v.voucherNo}
                                                </span>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={12} className={isCurrentPreview ? 'text-amber-400' : 'text-gray-400'} />
                                                    <h4 className="font-extrabold text-sm truncate">
                                                        {v.payeeName || '未知收款方'}
                                                    </h4>
                                                </div>
                                                {v.payeePhone && (
                                                    <p className={`text-[10px] flex items-center gap-1 mt-0.5 font-mono ${isCurrentPreview ? 'text-gray-300' : 'text-gray-400'}`}>
                                                        <Phone size={10} /> {v.payeePhone}
                                                    </p>
                                                )}
                                                {v.notes && (
                                                    <p className={`text-[10px] mt-2 line-clamp-1 italic ${isCurrentPreview ? 'text-gray-300' : 'text-gray-400'}`}>
                                                        {v.notes.replace(/吉隆坡金莲记/g, '金莲记甲洞')}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="border-t border-dashed mt-2 pt-2 flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 font-mono">
                                                        <Calendar size={11} className="opacity-60" />
                                                        <span className="text-[10px] opacity-70">{v.date}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[9px] block opacity-60">凭单总额 Amount</span>
                                                        <span className={`text-sm font-serif font-black ${isCurrentPreview ? 'text-amber-300' : 'text-red-650 text-red-600'}`}>
                                                            RM {v.totalAmount.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Apple HIG Tactile Touch Handles (>=44px) - Touch friendly */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 border-t border-gray-150 pt-2 shrink-0">
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPreviewVoucher(v);
                                                            setIsMobilePreviewOpen(true);
                                                        }}
                                                        className={`py-2 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px] ${
                                                            isCurrentPreview 
                                                            ? 'bg-amber-400 text-black hover:bg-amber-500' 
                                                            : 'bg-amber-50 text-amber-900 border border-amber-200/55 hover:bg-amber-100'
                                                        }`}
                                                    >
                                                        <Printer size={13} />
                                                        <span>A5 预览/下载 PDF</span>
                                                    </button>
                                                    
                                                    <div className="flex gap-1.5">
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenEdit(v);
                                                            }}
                                                            className={`flex-grow py-2 px-2 rounded-xl border font-bold text-[11px] transition-all flex items-center justify-center active:scale-95 min-h-[44px] ${
                                                                isCurrentPreview 
                                                                ? 'bg-white/10 text-white border-white/20 hover:bg-white/20' 
                                                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            <span>编辑</span>
                                                        </button>
                                                        
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(v.id);
                                                            }}
                                                            className="p-2.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-xl flex items-center justify-center active:scale-95 min-h-[44px] transition-all border border-red-100 shrink-0"
                                                            title="删除"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
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
                                <div className="bg-white border-b border-gray-200 p-4 shrink-0 flex items-center justify-between shadow-sm z-10">
                                    <div className="min-w-0">
                                        <h5 className="font-bold text-xs text-gray-500 uppercase font-mono tracking-wider">A5 模板即时预览区 Previewing</h5>
                                        <h4 className="font-black text-sm text-gray-800 truncate mt-0.5">
                                            {previewVoucher.voucherNo} ({getVoucherTypeLabel(previewVoucher.voucherType).text})
                                        </h4>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {driveError && (
                                            <span className="text-[10px] bg-red-50 text-red-600 px-2.5 py-1 rounded-lg font-black max-w-[150px] truncate" title={driveError}>
                                                ⚠️ {driveError}
                                            </span>
                                        )}
                                        
                                        <div className="hidden sm:flex bg-gray-100 p-1 rounded-xl border border-gray-200 gap-1 text-[10px]">
                                            <span className="px-2 py-0.5 bg-white rounded-lg shadow-xs font-bold text-slate-800">
                                                样式Style: {previewVoucher.templateStyle}
                                            </span>
                                        </div>

                                        {/* Save to Drive Button */}
                                        <button 
                                            onClick={() => handleSaveToDrive(previewVoucher)}
                                            disabled={driveState !== 'IDLE' && driveState !== 'ERROR'}
                                            className={`px-3 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-md ${
                                                driveState === 'SUCCESS' && !driveError
                                                    ? 'bg-emerald-500 text-white shadow-emerald-500/25'
                                                    : driveState === 'SUCCESS' && driveError
                                                    ? 'bg-amber-500 text-white shadow-amber-500/25'
                                                    : driveState === 'ERROR'
                                                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/25'
                                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/25'
                                            } min-h-[36px]`}
                                        >
                                            {driveState === 'IDLE' && (
                                                <>
                                                    <HardDrive size={14} />
                                                    原生分享 / 存入 Drive
                                                </>
                                            )}
                                            {driveState === 'GENERATING' && (
                                                <>
                                                    <RefreshCw size={13} className="animate-spin" />
                                                    渲染 PDF...
                                                </>
                                            )}
                                            {driveState === 'SHARING' && (
                                                <>
                                                    <RefreshCw size={13} className="animate-spin" />
                                                    唤起分享...
                                                </>
                                            )}
                                            {driveState === 'SUCCESS' && (
                                                <>
                                                    <span>✅ 成功导出!</span>
                                                </>
                                            )}
                                            {driveState === 'ERROR' && (
                                                <>
                                                    <HardDrive size={14} />
                                                    生成失败 (点击重试)
                                                </>
                                            )}
                                        </button>

                                        <button 
                                            onClick={() => handleDownloadA5PDF(previewVoucher)}
                                            disabled={!!isExporting}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 active:scale-95 shadow-md shadow-emerald-600/10 min-h-[36px]"
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
                                    <div className="p-3 bg-white shadow-xl hover:shadow-2xl transition-all duration-300 rounded-lg max-w-full overflow-x-auto">
                                        
                                        <div className="min-w-[595px]">
                                            <A5VoucherDocument voucher={previewVoucher} />
                                        </div>
                                        
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center text-center p-8 text-gray-400">
                                <div className="p-6 bg-slate-50 border-2 border-dashed border-gray-200 rounded-[2rem] max-w-sm flex flex-col items-center shadow-inner">
                                    <span className="text-4xl animate-bounce mb-3">📄</span>
                                    <h4 className="font-black text-[#1A1A1A] text-sm">选择左侧凭单，在此即时看单</h4>
                                    <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
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
                {previewVoucher && (
                    <div 
                        id="a5-capture-global"
                        style={{ 
                            width: '595px', 
                            height: '842px', 
                            position: 'absolute', 
                            top: '0', 
                            left: '0', 
                            background: '#ffffff', 
                            color: '#000000',
                            zIndex: -99, // Completely layered behind all other backdrops (which have zIndex >= 100)
                            pointerEvents: 'none',
                            opacity: 0.99, // keep visible for render layout paint but visually hidden under background layers
                        }}
                    >
                        {/* Perfect standard full size rendering */}
                        <A5VoucherDocument voucher={previewVoucher} isForActualExport={true} />
                    </div>
                )}

                {/* FLOATING BULK VOUCHERS BAR */}
                {selectedVoucherIds.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-white rounded-2xl px-5 py-3.5 shadow-2xl flex items-center justify-between gap-5 z-[110] border border-stone-800 animate-in slide-in-from-bottom duration-300 w-[92%] max-w-lg">
                        <div className="text-xs font-black">
                            已选择 <span className="text-amber-400 font-mono text-sm">{selectedVoucherIds.length}</span> 项自制凭证
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                onClick={() => setSelectedVoucherIds([])}
                                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer"
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
                    <div className="fixed inset-0 bg-black/75 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={() => setIsBulkGeneratorOpen(false)}>
                        <div 
                            className="bg-white w-full sm:max-w-xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[100vh] sm:max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
                        >
                            {/* Modal Header */}
                            <div className="bg-[#1A1A1A] p-4 text-white flex justify-between items-center border-b-4 border-amber-400 shrink-0 safe-area-top">
                                <div className="flex items-center gap-2 text-left">
                                    <div className="bg-amber-400 text-black p-1.5 rounded-lg">
                                        <Sparkles size={20} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <h3 className="font-serif font-black text-sm sm:text-base tracking-wide text-white">⚡ 智能对账补充凭单批量快速生成器</h3>
                                        <p className="text-[10px] text-gray-400">Bulk Self-Issued Voucher Smart Generator</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsBulkGeneratorOpen(false)} className="p-2 min-w-[44px] min-h-[44px] hover:bg-white/10 rounded-full flex items-center justify-center transition-all select-none">
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
                                    <label className="font-extrabold text-gray-600 block">📅 日期选择模式 Date Selection Mode</label>
                                    <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setBulkGenDateMode('AUTO')}
                                            className={`py-2 rounded-lg font-bold transition-all text-center text-xs active:scale-95 ${
                                                bulkGenDateMode === 'AUTO'
                                                ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                            }`}
                                        >
                                            🤖 智能均匀散布 (Auto Spacing)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBulkGenDateMode('MANUAL')}
                                            className={`py-2 rounded-lg font-bold transition-all text-center text-xs active:scale-95 ${
                                                bulkGenDateMode === 'MANUAL'
                                                ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
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
                                            <label className="font-extrabold text-gray-600 block">📅 选择目标月份 Target Month</label>
                                            <input 
                                                type="month" 
                                                value={bulkGenMonth} 
                                                onChange={e => setBulkGenMonth(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-400 focus:border-transparent font-bold outline-none font-mono text-sm min-h-[44px]"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-gray-600 block">🔢 计划生成张数 Total Sheets</label>
                                            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-1.5 py-1 min-h-[44px]">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setBulkGenCount(prev => Math.max(1, prev - 1))}
                                                    className="w-8 h-8 rounded-lg bg-white shadow-xs border border-gray-150 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 min-w-[32px] min-h-[32px]"
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
                                                    className="w-8 h-8 rounded-lg bg-white shadow-xs border border-gray-150 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 min-w-[32px] min-h-[32px]"
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
                                                <label className="font-extrabold text-gray-600 block">📅 选择目标月份 Target Month</label>
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
                                                <label className="font-extrabold text-gray-600 block">🔢 已选生成张数 Selected Sheets</label>
                                                <div className="w-full bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-center font-black font-mono text-base min-h-[44px]">
                                                    {bulkGenSelectedDays.length} 张单据
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="font-extrabold text-gray-600 block">🎯 点选具体日期 Target Days (请在下方网格中点击选择)</label>
                                                <span className="text-[10px] text-gray-400 font-bold">按月历天数点击</span>
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
                                                                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
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
                                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 active:scale-95 min-h-[36px]"
                                                >
                                                    📅 选单数日 (Odds)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('EVEN')}
                                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 active:scale-95 min-h-[36px]"
                                                >
                                                    📅 选双数日 (Evens)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('MON_WED_FRI')}
                                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 active:scale-95 min-h-[36px]"
                                                >
                                                    📅 选一三五 (Mon/Wed/Fri)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectPresetDays('CLEAR')}
                                                    className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-[10px] font-bold text-red-600 active:scale-95 min-h-[36px] ml-auto"
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
                                        <label className="font-extrabold text-gray-600">👤 收款人/临时供应商 Payee Name</label>
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
                                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
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
                                        <label className="font-extrabold text-gray-600 block">📁 凭单类别 Voucher Type</label>
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
                                        <label className="font-extrabold text-gray-600 block">🎭 收款人身份 Identity</label>
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
                                    <h4 className="font-extrabold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                        <span>🛍️ 基准货品与单价基数 Base Items Particulars</span>
                                    </h4>

                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between items-center">
                                            <label className="font-extrabold text-gray-600">货品明细 Description</label>
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
                                                        className="px-1.5 py-0.5 text-[8px] bg-white hover:bg-gray-100 border border-gray-200 rounded text-gray-500 font-extrabold"
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
                                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-amber-400 min-h-[40px]"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-2.5 text-xs">
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-gray-600 block">基础数量 Qty</label>
                                            <input 
                                                type="number" 
                                                min="1"
                                                value={bulkGenItemQty} 
                                                onChange={e => setBulkGenItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-full bg-white border border-gray-200 rounded-xl p-2 font-extrabold font-mono text-sm outline-none min-h-[40px]"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-gray-600 block">基准单价 Unit Price</label>
                                            <div className="relative">
                                                <span className="absolute left-2.5 top-2.5 text-gray-400 font-bold text-[10px]">RM</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={bulkGenItemUnitPrice} 
                                                    onChange={e => setBulkGenItemUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                                                    className="w-full bg-white border border-gray-200 rounded-xl pl-8 pr-2 py-2 font-extrabold font-mono text-sm outline-none min-h-[40px]"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="font-extrabold text-gray-600 block">单位 Unit</label>
                                            <input 
                                                type="text" 
                                                placeholder="包/趟/箱" 
                                                value={bulkGenItemUnit} 
                                                onChange={e => setBulkGenItemUnit(e.target.value)}
                                                className="w-full bg-white border border-gray-200 rounded-xl p-2 font-bold outline-none min-h-[40px]"
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
                                                <span className="text-[10px] text-gray-400 block font-normal leading-relaxed">
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
                                            <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-150 animate-in slide-in-from-top-1">
                                                <span className="text-[10px] font-bold text-gray-500 shrink-0">波动限度 Range:</span>
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
                                                <div key={item.id} className="bg-white p-3 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-2.5 items-start sm:items-center justify-between text-xs shadow-xs">
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="font-mono text-[10px] text-gray-400 font-black w-5 text-center">#{index + 1}</span>
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

                                                    <div className="flex items-center gap-2 flex-grow w-full sm:w-auto">
                                                        {/* Qty edit */}
                                                        <div className="flex items-center gap-1 w-20 shrink-0">
                                                            <span className="text-[10px] text-gray-400 font-bold shrink-0">数:</span>
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
                                                            <span className="text-[10px] text-gray-400 font-bold shrink-0">单价:</span>
                                                            <div className="relative w-full">
                                                                <span className="absolute left-1.5 top-2 text-gray-400 font-bold text-[9px]">RM</span>
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
                                                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 border-gray-100 pt-2 sm:pt-0 shrink-0">
                                                        <div className="text-right">
                                                            <span className="text-[9px] text-gray-400 font-bold block leading-none">总计 Amount</span>
                                                            <span className="font-mono text-xs font-black text-amber-600 leading-normal">
                                                                RM {item.amount.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setBulkPreviewItems(bulkPreviewItems.filter(draft => draft.id !== item.id));
                                                            }}
                                                            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center font-bold active:scale-95 min-h-[34px] min-w-[34px]"
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
                                        <label className="font-extrabold text-gray-600 block">🎨 模板视觉风格 Theme Style</label>
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
                                        <label className="font-extrabold text-gray-600 block">🏢 出账主体 Company / Issuer</label>
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
                                    <label className="font-extrabold text-gray-600 block">✍️ 内部备注/单据说明 Notes</label>
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
                            <div className="p-4 border-t border-gray-150 bg-gray-50 flex gap-3 shrink-0">
                                <button 
                                    type="button" 
                                    onClick={() => setIsBulkGeneratorOpen(false)}
                                    className="flex-1 py-3 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-extrabold text-xs rounded-xl transition-all active:scale-95 min-h-[44px]"
                                >
                                    取消 Cancel
                                </button>
                                <button 
                                    type="button" 
                                    onClick={handleBulkGenerate}
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-[#1A1A1A] hover:bg-black text-[#FFD700] font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 min-h-[44px]"
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
                            <div className="w-full lg:w-96 bg-white border-b lg:border-b-0 lg:border-r border-stone-200 p-5 md:p-6 overflow-y-auto max-h-[40vh] lg:max-h-[92vh] space-y-4 shrink-0 text-left">
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
                                            <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
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
                                            <div key={v.id} className="batch-print-page bg-white p-6 shadow-md rounded-2xl border border-stone-200 relative max-w-[595px] mx-auto overflow-hidden">
                                                <div className="flex justify-between items-center border-b pb-2 mb-4 text-[10px] text-gray-450 font-mono print:hidden">
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
                            className="bg-[#1A1A1A] p-4 flex justify-between items-center text-white shrink-0 border-b border-amber-400" 
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
                                className="p-2.5 hover:bg-white/10 rounded-full transition-transform active:scale-90"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Interactive scroll-scale canvas container */}
                        <div 
                            className="flex-grow overflow-auto p-4 flex items-center justify-center bg-zinc-900/60"
                            onClick={() => setIsMobilePreviewOpen(false)}
                        >
                            <div 
                                className="p-3 bg-white rounded-xl shadow-2xl max-w-full overflow-auto scale-90 sm:scale-100 origin-center" 
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="min-w-[595px]">
                                    <A5VoucherDocument voucher={previewVoucher} />
                                </div>
                            </div>
                        </div>

                        {/* Bottom Action Footer Sheet (Apple HIG Compliant, >=44px controls) */}
                        <div 
                            className="bg-[#1A1A1A] p-5 border-t border-white/10 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]" 
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center text-xs text-gray-300 font-mono tracking-tight px-1">
                                <span className="opacity-80">对账模具 Style: {previewVoucher.templateStyle}</span>
                                <span className="text-amber-400 font-bold text-sm">RM {previewVoucher.totalAmount.toFixed(2)}</span>
                            </div>
                            
                            {/* Mobile Smart High-Res Image Saver Button */}
                            <button
                                onClick={() => handleGenerateMobileImage(previewVoucher)}
                                disabled={isGeneratingImg}
                                className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-500 text-black rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[44px]"
                            >
                                {isGeneratingImg ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        正在生成超清 A5 图片...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={14} />
                                        手机端推荐：生成高清 A5 表单 (长按保存/分享)
                                    </>
                                )}
                            </button>

                            {/* Mobile Google Drive Button */}
                            <button 
                                onClick={() => handleSaveToDrive(previewVoucher)}
                                disabled={driveState !== 'IDLE' && driveState !== 'ERROR'}
                                className={`w-full py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[44px] shadow-lg ${
                                    driveState === 'SUCCESS' && !driveError
                                        ? 'bg-emerald-500 text-white'
                                        : driveState === 'SUCCESS' && driveError
                                        ? 'bg-amber-500 text-white'
                                        : driveState === 'ERROR'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            >
                                {driveState === 'IDLE' && (
                                    <>
                                        <HardDrive size={14} />
                                        🌐 系统原生分享 / 存入 Google Drive
                                    </>
                                )}
                                {driveState === 'GENERATING' && (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        正在生成高清 A5 PDF 并优化排版...
                                    </>
                                )}
                                {driveState === 'SHARING' && (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        正在唤起系统分享菜单 (免登免密)...
                                    </>
                                )}
                                {driveState === 'SUCCESS' && (
                                    <>
                                        <span>✅ 成功拉起！请选择分享或存入云盘</span>
                                    </>
                                )}
                                {driveState === 'ERROR' && (
                                    <>
                                        <span>❌ 发生错误 (点击重试)</span>
                                    </>
                                )}
                            </button>

                            <div className="grid grid-cols-2 gap-3 pb-2">
                                <button
                                    onClick={() => setIsMobilePreviewOpen(false)}
                                    className="py-3 px-4 border border-white/20 hover:border-white/40 text-white rounded-xl font-bold text-xs active:scale-95 transition-all min-h-[44px]"
                                >
                                    返回列表
                                </button>
                                <button
                                    onClick={() => handleDownloadA5PDF(previewVoucher)}
                                    disabled={!!isExporting}
                                    className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[44px]"
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
                            className="bg-white rounded-3xl p-5 md:p-6 shadow-2xl max-w-sm sm:max-w-md w-full flex flex-col items-center space-y-4 animate-in slide-in-from-bottom"
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
                                <p className="text-[10px] text-amber-850 font-medium leading-relaxed">
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
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-2 py-1 rounded font-bold pointer-events-none">
                                    📱 手机端长按此图保存
                                </div>
                            </div>
                            
                            <button
                                onClick={() => setCapturedImgUrl(null)}
                                className="w-full py-3 bg-[#1A1A1A] hover:bg-black text-white font-black text-xs rounded-xl transition-all active:scale-95"
                            >
                                返回预览
                            </button>
                        </div>
                    </div>
                )}

                {/* 👑 === EDIT FORM MODAL === Bottom Sheet on mobile / Center on desktop */}
                {isFormOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in" onClick={handleCloseForm}>
                        <div className="bg-white w-full md:max-w-4xl rounded-t-[2.2rem] md:rounded-[2.2rem] p-5 md:p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300 max-h-[95vh] md:max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
                            {/* Drag handle */}
                            <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-1 sticky top-0"></div>

                            <div className="flex justify-between items-center mb-5 pb-2 border-b border-gray-100">
                                <h3 className="font-serif font-black text-lg text-[#1A1A1A] flex items-center gap-2">
                                    ✍️ {editingVoucher.id ? '编辑自制凭单内容' : '新开自制凭单/收据'}
                                </h3>
                                <button onClick={handleCloseForm} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                    <X size={18}/>
                                </button>
                            </div>

                            {/* 💡 Accounts Payable Prefill Context Banner */}
                            {apPrefillRef && (
                                <div className="mb-5 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/80 rounded-2xl p-4 text-xs animate-in slide-in-from-top-2 shadow-sm">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2 font-black text-emerald-800">
                                            <span>💡 正在基于应付账款一键生成现金核销凭单 (AP Cash Bill Prefill)</span>
                                            <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded text-[8px] font-bold">参考资料 Reference Panel</span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => setApPrefillRef(null)} 
                                            className="text-gray-400 hover:text-gray-650 font-bold hover:underline transition-colors"
                                            title="关闭并隐藏此块参考信息"
                                        >
                                            关闭参考 [✕]
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-gray-700 font-medium">
                                        <div>
                                            <span className="text-gray-400 font-bold">供应商 Company / Supplier:</span>
                                            <div className="font-extrabold text-[#1A1A1A] text-sm mt-0.5">{apPrefillRef.company || '未指定供应商'}</div>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 font-bold">账单核对金额 Total Amount:</span>
                                            <div className="font-mono font-extrabold text-blue-700 text-sm mt-0.5">RM {Number(apPrefillRef.totalAmount || 0).toFixed(2)}</div>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 font-bold">记账日期 Invoice Date:</span>
                                            <div className="font-mono font-extrabold text-gray-800 text-sm mt-0.5">{apPrefillRef.date}</div>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 font-bold">账账关联 ID AP Ref ID:</span>
                                            <div className="font-mono text-gray-500 mt-0.5 truncate">{apPrefillRef.billRefId || '-'}</div>
                                        </div>
                                    </div>
                                    <div className="mt-2.5 pt-2 border-t border-dashed border-gray-200 text-gray-500 flex flex-col gap-1">
                                        <span className="text-gray-400 font-bold">账单备注/事由 Particulars:</span>
                                        <div className="mt-0.5 font-bold text-gray-700 leading-relaxed text-[11px]">{apPrefillRef.particulars}</div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 text-left">
                                
                                {/* Fields details */}
                                <div className="md:col-span-12 space-y-3.5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                        
                                        {/* Type */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">凭单类型 Voucher Type</label>
                                            <select 
                                                value={editingVoucher.voucherType}
                                                onChange={e => {
                                                    const vt = e.target.value as any;
                                                    let ts = editingVoucher.templateStyle;
                                                    if (vt === 'PURCHASE_RECEIPT') ts = 'CASH_BILL_GREEN';
                                                    else if (vt === 'PAYMENT_VOUCHER') ts = 'MODERN_DARK';
                                                    else if (vt === 'CASH_VOUCHER') ts = 'VINTAGE_GOLD';
                                                    else if (vt === 'DELIVERY_RECEIPT') ts = 'EMERALD_CLEAN';
                                                    else if (vt === 'CASH_BILL') ts = 'TRADITIONAL_CARBON';
                                                    
                                                    const autoNo = generateSequenceNoForDate(editingVoucher.date, vt);
                                                    setEditingVoucher({ 
                                                        ...editingVoucher, 
                                                        voucherType: vt, 
                                                        templateStyle: ts as any,
                                                        voucherNo: autoNo
                                                    });
                                                }}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-bold animate-pulse-once"
                                            >
                                                <option value="PURCHASE_RECEIPT">🟢 双色收据 (供应商未开单)</option>
                                                <option value="PAYMENT_VOUCHER">🌌 极简黑 (员工薪资)</option>
                                                <option value="CASH_VOUCHER">⚜️ 经典黄 (个人/Agent)</option>
                                                <option value="DELIVERY_RECEIPT">☘️ 交易绿 (运输)</option>
                                                <option value="CASH_BILL">🎟️ 三联红 (金莲记自开收据 - 收入)</option>
                                            </select>
                                        </div>

                                        {/* Template selector */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">视觉风格 Style</label>
                                            <select 
                                                value={editingVoucher.templateStyle}
                                                onChange={e => {
                                                    const ts = e.target.value as any;
                                                    let vt = editingVoucher.voucherType;
                                                    if (ts === 'CASH_BILL_GREEN') vt = 'PURCHASE_RECEIPT';
                                                    else if (ts === 'MODERN_DARK') vt = 'PAYMENT_VOUCHER';
                                                    else if (ts === 'VINTAGE_GOLD') vt = 'CASH_VOUCHER';
                                                    else if (ts === 'EMERALD_CLEAN') vt = 'DELIVERY_RECEIPT';
                                                    else if (ts === 'TRADITIONAL_CARBON') vt = 'CASH_BILL';
                                                     
                                                    const autoNo = generateSequenceNoForDate(editingVoucher.date, vt);
                                                    setEditingVoucher({ 
                                                        ...editingVoucher, 
                                                        templateStyle: ts, 
                                                        voucherType: vt as any,
                                                        voucherNo: autoNo
                                                    });
                                                }}
                                                className="w-full bg-white border border-[#FFD700] rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-bold text-amber-900"
                                            >
                                                <option value="CASH_BILL_GREEN">🟢 双色收据 (供应商未开单)</option>
                                                <option value="MODERN_DARK">🌌 极简黑 (员工薪资)</option>
                                                <option value="VINTAGE_GOLD">⚜️ 经典黄 (个人/Agent)</option>
                                                <option value="EMERALD_CLEAN">☘️ 交易绿 (运输)</option>
                                                <option value="TRADITIONAL_CARBON">🎟️ 三联红 (金莲记自开收据 - 收入)</option>
                                            </select>
                                        </div>

                                        {/* Payment Method Option */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">支付方式 Payment</label>
                                            <select 
                                                value={editingVoucher.paymentMethod || 'CASH'}
                                                onChange={e => setEditingVoucher({ ...editingVoucher, paymentMethod: e.target.value as any })}
                                                className="w-full bg-white border border-red-200 rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-bold text-red-700"
                                            >
                                                <option value="CASH">💵 现金 (Cash)</option>
                                                <option value="ONLINE_TRANSFER">🏦 网上转账 (Online)</option>
                                            </select>
                                        </div>

                                        {/* Date */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">日期 Date</label>
                                            <input 
                                                type="date"
                                                value={editingVoucher.date}
                                                onChange={e => {
                                                    const newDate = e.target.value;
                                                    const autoNo = generateSequenceNoForDate(newDate);
                                                    setEditingVoucher({ 
                                                        ...editingVoucher, 
                                                        date: newDate,
                                                        voucherNo: autoNo 
                                                    });
                                                }}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-mono"
                                            />
                                        </div>

                                        {/* Invoice Num */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">单号 No.</label>
                                            <input 
                                                type="text"
                                                value={editingVoucher.voucherNo}
                                                onChange={e => setEditingVoucher({ ...editingVoucher, voucherNo: e.target.value })}
                                                className="w-full bg-white border border-gray-205 border-gray-200 rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-mono font-bold"
                                                placeholder="例: KLK-SELF-1"
                                            />
                                        </div>
                                    </div>

                                    {/* Company name and payee name */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="sm:col-span-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">开具主体公司名 Issuer Company Name</label>
                                            <input 
                                                type="text"
                                                value={editingVoucher.companyName}
                                                onChange={e => setEditingVoucher({ ...editingVoucher, companyName: e.target.value })}
                                                className="w-full bg-[#FAFAFA] border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-bold"
                                                placeholder="输入金莲记甲洞或者其他公司公司名"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">制单经办人 Prepared By</label>
                                            <input 
                                                type="text"
                                                value={editingVoucher.preparedBy}
                                                onChange={e => setEditingVoucher({ ...editingVoucher, preparedBy: e.target.value })}
                                                className="w-full bg-[#FAFAFA] border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-mono"
                                                placeholder="如: Jaz"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block">收款人/对方姓名 Payee Name (⚠️ 必须填写)</label>
                                                {editingVoucher.payeeName?.trim() && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleStarPayee(
                                                            editingVoucher.payeeName || '',
                                                            editingVoucher.payeePhone || '',
                                                            editingVoucher.payeeType || 'DRIVER'
                                                        )}
                                                        className="text-[10px] flex items-center gap-1 font-extrabold text-amber-600 hover:text-amber-700 transition-colors"
                                                    >
                                                        {isPayeeStarred(editingVoucher.payeeName || '') ? '⭐️ 已收藏 Starred' : '☆ 收藏此收款人 Star'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <input 
                                                    type="text"
                                                    value={editingVoucher.payeeName}
                                                    onChange={e => setEditingVoucher({ ...editingVoucher, payeeName: e.target.value })}
                                                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl pl-3 pr-10 py-2.5 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-bold placeholder-gray-400"
                                                    placeholder="输入运输司机名/购买无发票商家名"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => toggleStarPayee(
                                                        editingVoucher.payeeName || '',
                                                        editingVoucher.payeePhone || '',
                                                        editingVoucher.payeeType || 'DRIVER'
                                                    )}
                                                    className="absolute right-3 top-2.5 text-amber-500 hover:scale-110 active:scale-95 transition-transform"
                                                    title="收藏/取消收藏收款人"
                                                >
                                                    {isPayeeStarred(editingVoucher.payeeName || '') ? '★' : '☆'}
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">联系电话 / 车牌号 Payee Contact / Vehicle No.</label>
                                            <input 
                                                type="text"
                                                value={editingVoucher.payeePhone}
                                                onChange={e => setEditingVoucher({ ...editingVoucher, payeePhone: e.target.value })}
                                                className="w-full bg-[#FAFAFA] border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-amber-400 outline-none font-mono"
                                                placeholder="输入司机电话或车牌号 (如: WXX 1234)"
                                            />
                                        </div>
                                    </div>

                                    {/* Starred Payees Quick Selection list */}
                                    {savedPayees.length > 0 && (
                                        <div className="bg-amber-50/20 p-2.5 rounded-xl border border-dashed border-amber-200/50">
                                            <span className="text-[9px] font-black text-amber-800 uppercase block mb-1.5 flex items-center gap-1">⭐️ 常用速填 Starred Payees (点击一键填入):</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {savedPayees.map((p, pIdx) => (
                                                    <button
                                                        key={pIdx}
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingVoucher({
                                                                ...editingVoucher,
                                                                payeeName: p.name,
                                                                payeePhone: p.phone,
                                                                payeeType: p.type
                                                            });
                                                        }}
                                                        className="bg-white hover:bg-amber-50 border border-amber-200/70 text-[9px] font-bold text-gray-700 px-2 py-1 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                                                    >
                                                        🧑 {p.name} {p.phone ? `(${p.phone})` : ''}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 👑 IMPORTANT: User-requested Partner Type selection for Self-Issued logic */}
                                    <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100 space-y-3">
                                       <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                                           <span>💡 对方资质与代开声明 Partners & Self-Billing Statement</span>
                                       </div>
                                       <p className="text-[10px] text-gray-600 leading-normal">
                                           对方如果是个人或手写单Agent（无注册公司），系统将协助您以<b>“金莲记甲洞(Kim Lian Kee - Kepong)”名义代开发票凭证 (Self-Billing / Recipient-Created Bill)</b>。此功能将在 A5 PDF 中显化“由于交易商无注册公司，故由我司代开凭单进行对账”的声明，确保企业做账规范合法。
                                       </p>

                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                           {/* Payee Type Selector */}
                                           <div>
                                               <label className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block">对方身份属性 / Partner Type</label>
                                               <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                   {[
                                                       { id: 'DRIVER', label: '🚚 承运司机 Lorry Driver' },
                                                       { id: 'AGENT', label: '👤 临时 Agent (无公司)' },
                                                       { id: 'INDIVIDUAL', label: '🧑 个人散工 Individual' },
                                                       { id: 'INFORMAL_VENDOR', label: '🏪 零散商贩 Unregistered' }
                                                   ].map(opt => (
                                                       <button
                                                           key={opt.id}
                                                           type="button"
                                                           onClick={() => setEditingVoucher({ ...editingVoucher, payeeType: opt.id as any })}
                                                           className={`p-2 rounded-xl border text-left font-bold transition-all flex flex-col justify-center gap-0.5 active:scale-95 min-h-[44px] ${
                                                               (editingVoucher.payeeType || 'DRIVER') === opt.id
                                                               ? 'bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-400'
                                                               : 'bg-white text-gray-600 border-gray-200'
                                                           }`}
                                                       >
                                                           {opt.label}
                                                       </button>
                                                   ))}
                                               </div>
                                           </div>

                                           {/* Self billing mode toggle */}
                                           <div>
                                               <label className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block">代开备案确认 / Self-Billing Confirmation</label>
                                               <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                   <button
                                                       type="button"
                                                       onClick={() => setEditingVoucher({ ...editingVoucher, isSelfIssued: true })}
                                                       className={`p-2 rounded-xl border font-bold text-center active:scale-95 min-h-[44px] flex items-center justify-center ${
                                                           editingVoucher.isSelfIssued !== false
                                                           ? 'bg-emerald-50 text-emerald-900 border-emerald-400 ring-2 ring-emerald-400'
                                                           : 'bg-white text-gray-450 border-gray-200'
                                                       }`}
                                                   >
                                                       <div>
                                                           <div className="text-[11px]">✍️ 启动代开声明</div>
                                                           <span className="text-[8px] font-normal text-emerald-600 block mt-0.5">防手写单篡改・用于做账</span>
                                                       </div>
                                                   </button>
                                                   <button
                                                       type="button"
                                                       onClick={() => setEditingVoucher({ ...editingVoucher, isSelfIssued: false })}
                                                       className={`p-2 rounded-xl border font-bold text-center active:scale-95 min-h-[44px] flex items-center justify-center ${
                                                           editingVoucher.isSelfIssued === false
                                                           ? 'bg-gray-100 text-gray-800 border-gray-400 ring-2 ring-gray-400'
                                                           : 'bg-white text-gray-450 border-gray-200'
                                                       }`}
                                                   >
                                                       <div>
                                                           <div className="text-[11px]">📄 普通自制收据</div>
                                                           <span className="text-[8px] font-normal text-gray-400 block mt-0.5">只作为备考流水备注</span>
                                                       </div>
                                                   </button>
                                               </div>
                                           </div>
                                       </div>
                                    </div>

                                    {/* Items Table Description Generator */}
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden mt-3 shadow-inner bg-white">
                                        <div className="bg-gray-100 p-2 px-3 text-[10px] font-bold text-gray-500 uppercase flex justify-between items-center border-b border-gray-200">
                                            <span>账目明细条款 Particulars Table</span>
                                            <button 
                                                onClick={handleAddItemRow}
                                                className="bg-[#1A1A1A] hover:bg-black text-white px-2.5 py-1 text-[9px] font-black rounded-lg flex items-center gap-1"
                                            >
                                                添加空行 +
                                            </button>
                                        </div>

                                        <div className="p-3 space-y-2 max-h-[250px] overflow-y-auto">
                                            {voucherItems.map((item, idx) => (
                                                <div key={idx} className="flex flex-col sm:flex-row gap-2 border-b border-gray-100 pb-2 sm:pb-0 sm:border-0 items-center justify-between">
                                                    
                                                    {/* Row Description with quick fill preset */}
                                                    <div className="w-full sm:flex-grow">
                                                        <div className="flex gap-1 items-center">
                                                            <span className="text-[9px] font-mono text-gray-400 font-bold shrink-0">#{idx + 1}</span>
                                                            <input 
                                                                type="text"
                                                                value={item.description}
                                                                onChange={e => handleItemChange(idx, 'description', e.target.value)}
                                                                placeholder="填入内容明细描述，或使用下方快捷选项填入"
                                                                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-amber-400 outline-none"
                                                            />
                                                        </div>
                                                        {/* Quick fill buttons */}
                                                        {(!item.description) && (
                                                            <div className="flex flex-wrap gap-1 mt-1 pl-4">
                                                                {QUICK_CONTENT_PRESETS.map((preset, pIdx) => (
                                                                    <button
                                                                        key={pIdx}
                                                                        onClick={() => handleQuickPresetFill(idx, preset)}
                                                                        className="bg-gray-100 hover:bg-amber-100 hover:text-amber-900 border border-gray-200/50 text-[8px] font-extrabold text-gray-600 px-1.5 py-0.5 rounded-md truncate max-w-[150px]"
                                                                        title={preset.description}
                                                                    >
                                                                        ⚡ {preset.description.split('/')[0].trim()} (RM {preset.unitPrice})
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-2 w-full sm:w-auto shrink-0 items-center">
                                                        
                                                        {/* Unit */}
                                                        <div className="w-16">
                                                            <input 
                                                                type="text"
                                                                value={item.unit || ''}
                                                                onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                                                                placeholder="单位"
                                                                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-1.5 py-1.5 text-xs text-center focus:ring-1 focus:ring-amber-400 outline-none"
                                                            />
                                                        </div>

                                                        {/* Qty */}
                                                        <div className="w-14">
                                                            <input 
                                                                type="number"
                                                                value={item.qty}
                                                                onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                                                                placeholder="数量"
                                                                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-1.5 py-1.5 text-xs text-center focus:ring-1 focus:ring-amber-400 outline-none font-mono"
                                                            />
                                                        </div>

                                                        {/* Unit price */}
                                                        <div className="w-24">
                                                            <div className="relative">
                                                                <span className="absolute left-1.5 top-1.5 text-[10px] text-gray-400 font-mono">RM</span>
                                                                <input 
                                                                    type="number"
                                                                    value={item.unitPrice || ''}
                                                                    onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)}
                                                                    placeholder="单价"
                                                                    className="w-full pl-6 pr-2 bg-gray-50/50 border border-gray-200 rounded-xl py-1.5 text-xs focus:ring-1 focus:ring-amber-400 outline-none font-mono text-right"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Row subtotal output */}
                                                        <div className="w-20 text-right font-mono font-bold text-xs pr-1">
                                                            RM {(item.qty * item.unitPrice).toFixed(2)}
                                                        </div>

                                                        {/* Delete button */}
                                                        <button 
                                                            disabled={voucherItems.length <= 1}
                                                            onClick={() => handleRemoveItemRow(idx)}
                                                            className={`p-1.5 rounded-lg border flex items-center justify-center shrink-0 ${
                                                                voucherItems.length <= 1 
                                                                ? 'text-gray-200 border-gray-100 bg-gray-50 cursor-not-allowed' 
                                                                : 'text-red-500 hover:bg-red-50 hover:text-red-600 border-red-100 bg-red-50/20 active:scale-95 transition-all'
                                                            }`}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="bg-slate-50 p-3 px-4 border-t border-gray-200 flex flex-col sm:flex-row sm:justify-between items-center gap-2">
                                            <span className="text-[10px] text-gray-400 font-bold font-mono">总共包含 {voucherItems.length} 行条款</span>
                                            <div className="text-right">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase mr-2">凭证总值 GRAND TOTAL:</span>
                                                <span className="font-serif font-black text-rose-600 text-lg">
                                                    RM {calculateTotal(voucherItems).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">财务特别备考/审核批注 Note & Terms</label>
                                        <textarea 
                                            rows={2}
                                            value={editingVoucher.notes || ''}
                                            onChange={e => setEditingVoucher({ ...editingVoucher, notes: e.target.value })}
                                            className="w-full bg-[#FAFAFA] border border-gray-200 rounded-2xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-400 outline-none placeholder-gray-300"
                                            placeholder="比如: 说明此次支出没有获得正式单据的原因，运输司机的具体出车路线或事件证明说明..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Footer actions with Apple HIG touch sizes >= 44px */}
                            <div className="mt-6 pt-3 border-t border-gray-100 flex gap-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shrink-0">
                                <button 
                                    type="button"
                                    onClick={handleCloseForm} 
                                    className="px-6 py-3 border border-gray-200 text-gray-500 hover:text-gray-700 font-bold rounded-2xl text-xs active:scale-95 transition-all min-h-[44px] flex items-center justify-center font-sans"
                                >
                                    取消编辑
                                </button>
                                <button 
                                    type="button"
                                    onClick={handleSave} 
                                    disabled={isSaving}
                                    className="flex-grow bg-[#1A1A1A] hover:bg-black text-[#FFD700] py-3 rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[44px] font-sans"
                                >
                                    {isSaving ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <Save size={14} />
                                    )}
                                    保存此单据 & 导入后台库
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── CUSTOM REUSABLE A5 SHEETS RENDERING ENGINE ──
interface A5VoucherDocumentProps {
    voucher: SelfIssuedVoucher;
    isForActualExport?: boolean;
}

const A5VoucherDocument: React.FC<A5VoucherDocumentProps> = ({ voucher, isForActualExport = false }) => {
    // Styling values
    const styleConfig = (() => {
        switch (voucher.templateStyle) {
            case 'VINTAGE_GOLD':
                return {
                    bgClass: 'bg-[#FDFBF7]',
                    borderClass: 'border-[4px] border-double border-[#C5A059]',
                    textTitleClass: 'text-[#614713]',
                    accentColor: '#D4AF37', // Gold 
                    headerBg: 'bg-[#F2E5CE]',
                    tableHeaderBg: 'bg-[#ECCF9B] text-[#553C0C]',
                    stampText: 'KIM LIAN KEE PAID',
                    stampColor: 'border-red-500/70 text-red-500/70',
                    fontSans: 'font-serif',
                };
            case 'MODERN_DARK':
                return {
                    bgClass: 'bg-white',
                    borderClass: 'border-[2px] border-slate-800',
                    textTitleClass: 'text-slate-900',
                    accentColor: '#1E293B', // Slate gray
                    headerBg: 'bg-slate-100',
                    tableHeaderBg: 'bg-slate-800 text-white',
                    stampText: 'APPROVED & COGS PAID',
                    stampColor: 'border-[#1E293B]/60 text-[#1E293B]/60',
                    fontSans: 'font-sans',
                };
            case 'TRADITIONAL_CARBON':
                return {
                    bgClass: 'bg-[#FFFCFC]', // Carbon pink tint
                    borderClass: 'border-2 border-dashed border-red-300',
                    textTitleClass: 'text-red-700',
                    accentColor: '#EC4899', // Pink
                    headerBg: 'bg-red-50/60',
                    tableHeaderBg: 'bg-red-100/80 text-red-900',
                    stampText: 'CASH RECEIVED PAID',
                    stampColor: 'border-cyan-500/60 text-cyan-500/60',
                    fontSans: 'font-mono',
                };
            case 'CASH_BILL_GREEN':
                return {
                    bgClass: 'bg-[#FCFFF9]',
                    borderClass: 'border-[3px] border-[#094F2B]',
                    textTitleClass: 'text-[#094F2B]',
                    accentColor: '#094F2B',
                    headerBg: 'bg-[#8BC43F]/20',
                    tableHeaderBg: 'bg-[#094F2B] text-white',
                    stampText: 'VERIFIED PAID',
                    stampColor: 'border-[#094F2B]/65 text-[#094F2B]/65',
                    fontSans: 'font-sans',
                };
            case 'EMERALD_CLEAN':
                return {
                    bgClass: 'bg-white',
                    borderClass: 'border-[2px] border-emerald-700',
                    textTitleClass: 'text-emerald-900',
                    accentColor: '#047857', // Emerald
                    headerBg: 'bg-emerald-50',
                    tableHeaderBg: 'bg-emerald-700 text-white',
                    stampText: 'KIM LIAN KEE PAID',
                    stampColor: 'border-emerald-500 text-emerald-500',
                    fontSans: 'font-sans',
                };
        }
    })();

    const voucherTitle = (() => {
        const prefix = voucher.isSelfIssued !== false ? 'RECIPIENT-CREATED: ' : '';
        switch (voucher.voucherType) {
            case 'CASH_BILL': return 'CASH BILL';
            case 'PAYMENT_VOUCHER': return `${prefix}PAYMENT VOUCHER`;
            case 'DELIVERY_RECEIPT': return `${prefix}DELIVERY / TRANSPORT FREIGHT RECEIPT`;
            case 'CASH_VOUCHER': return `${prefix}CASH COMPENSATIVE RECEIPT`;
            case 'PURCHASE_RECEIPT': return `${prefix}SELF-ISSUED COGS PURCHASE SLIP`;
            default: return `${prefix}INTERNAL SETTLEMENT VOUCHER`;
        }
    })();

    // Sum
    const totalAmount = voucher.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);

    if (voucher.templateStyle === 'CASH_BILL_GREEN') {
        return (
            <div 
                className="w-[595px] h-[842px] p-7 flex flex-col justify-between tracking-normal leading-normal bg-white relative font-sans border-[3px] border-[#094F2B]"
                style={{ 
                    boxSizing: 'border-box',
                    color: '#1A3322',
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }}
            >
                {/* Visual Header Ribbon Top Curve */}
                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-r from-[#094F2B] via-[#8BC43F] to-[#094F2B]"></div>

                {/* Main Content Area */}
                <div className="flex flex-col gap-4 mt-2">
                    
                    {/* Header Row: Title & Shields */}
                    <div className="flex justify-between items-start border-b border-emerald-100 pb-3">
                        <div>
                            {/* Giant Title Style matching the Uploaded Image */}
                            <div className="flex flex-col">
                                <h1 className="text-[26px] font-black tracking-tight leading-none text-[#094F2B] font-sans italic">
                                    CASH BILL /
                                </h1>
                                <h1 className="text-[26px] font-black tracking-tight leading-none text-[#8BC43F] font-sans italic mt-1 uppercase">
                                    {voucher.voucherType === 'CASH_BILL' ? 'INVOICE' : voucher.voucherType.replace(/_/g, ' ')}
                                </h1>
                            </div>
                            <span className="text-[7.5px] text-gray-400 block tracking-wider uppercase font-extrabold font-mono mt-1.5">
                                Official Internal Accounting Proof & Receipts
                            </span>
                        </div>

                        {/* Top-Right Shield Logo */}
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <span className="text-[7.5px] text-gray-400 font-bold block uppercase">Vou. Serial No.</span>
                                <span className="font-mono text-xs font-black text-red-600 tracking-wider">
                                    {voucher.voucherNo}
                                </span>
                            </div>
                            <div className="w-11 h-11 bg-white rounded-xl shadow-sm border border-emerald-50 flex items-center justify-center p-1">
                                <svg className="w-full h-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M50 5C50 5 85 15 85 45C85 75 50 95 50 95C50 95 15 75 15 45C15 15 50 5 50 5Z" fill="#094F2B"/>
                                    <path d="M50 15C50 15 75 22.5 75 45C75 67.5 50 82.5 50 82.5C50 82.5 25 67.5 25 45C25 22.5 50 15 50 15Z" fill="#8BC43F" opacity="0.9"/>
                                    <polygon points="50,30 53,38 62,38 55,43 57,51 50,46 43,51 45,43 38,38 47,38" fill="white" />
                                    <polygon points="35,46 37,51 43,51 38,54 39,60 35,56 31,60 32,54 27,51 33,51" fill="white" opacity="0.9"/>
                                    <polygon points="65,46 67,51 73,51 68,54 69,60 65,56 61,60 62,54 57,51 63,51" fill="white" opacity="0.9"/>
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Metadata Section: PAYMENT INFO (RECIPIENT) Only (Full-Width) */}
                    <div className="mt-1 bg-gradient-to-r from-emerald-50/10 to-transparent p-3 rounded-2xl border border-emerald-500/10">
                        <div className="bg-[#094F2B] text-white font-black text-[9px] px-3 py-1 rounded-full inline-block uppercase tracking-wider mb-2">
                            PAYMENT INFO (RECIPIENT)
                        </div>
                        <div className="grid grid-cols-12 gap-4 mt-1 text-[10.5px]">
                            {/* Left Column in PAYMENT INFO */}
                            <div className="col-span-7 text-left space-y-1.5 pr-2">
                                <p className="text-gray-755 leading-tight flex">
                                    <span className="font-extrabold text-gray-400 w-20 shrink-0">Recipient:</span>
                                    <span className="font-black text-[#094F2B] leading-snug">{voucher.payeeName}</span>
                                </p>
                                <p className="text-gray-750 leading-tight flex">
                                    <span className="font-extrabold text-gray-400 w-20 shrink-0">Customer/ID:</span>
                                    <span className="font-semibold text-gray-800 leading-snug">{voucher.payeePhone || 'Casual Partner / Unregistered'}</span>
                                </p>
                            </div>
                            
                            {/* Right Column in PAYMENT INFO */}
                            <div className="col-span-5 text-left pl-4 border-l border-emerald-100 space-y-1.5">
                                <p className="text-gray-750 leading-tight flex">
                                    <span className="font-extrabold text-gray-400 w-20 shrink-0">Pay Date:</span>
                                    <span className="font-mono font-bold text-gray-800">{voucher.date}</span>
                                </p>
                                <p className="text-gray-750 leading-tight flex">
                                    <span className="font-extrabold text-gray-400 w-20 shrink-0">Voucher No:</span>
                                    <span className="font-mono font-black text-red-650 underline decoration-dotted decoration-red-300">{voucher.voucherNo}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Table Container exactly as shown in the requested layout representation */}
                    <div className="mt-1 border border-emerald-500/10 rounded-2xl overflow-hidden shadow-sm bg-white">
                        <table className="w-full text-left font-sans border-collapse text-[10px]">
                            <thead>
                                <tr className="bg-[#094F2B] text-white">
                                    <th className="p-2 text-center font-black w-8">NO</th>
                                    <th className="p-2 text-left font-black">SERVICE / PRODUCT DESCRIPTION</th>
                                    <th className="p-2 text-center font-black w-10">QTY</th>
                                    <th className="p-2 text-right font-black w-20">RATE (RM)</th>
                                    <th className="p-2 text-right font-black w-24">AMOUNT (RM)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100/50">
                                {voucher.items.map((item, index) => (
                                    <tr key={index} className="hover:bg-emerald-50/5">
                                        <td className="p-2 text-center font-mono font-bold text-gray-400 border-r border-[#094F2B]/5">
                                            {index + 1}
                                        </td>
                                        <td className="p-2 font-bold text-slate-800 border-r border-[#094F2B]/5">
                                            {item.description || ' (No Description Provided) '}
                                            {item.unit ? <span className="text-[8px] text-gray-400 ml-1 select-none">({item.unit})</span> : null}
                                        </td>
                                        <td className="p-2 text-center font-mono font-bold text-[#1A3322] border-r border-[#094F2B]/5">
                                            {item.qty}
                                        </td>
                                        <td className="p-2 text-right font-mono text-gray-650 border-r border-[#094F2B]/5">
                                            {Number(item.unitPrice || 0).toFixed(2)}
                                        </td>
                                        <td className="p-2 text-right font-mono font-black text-slate-900 bg-emerald-50/5">
                                            {(Number(item.qty || 0) * Number(item.unitPrice || 0)).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                                
                                {/* Fill spacing empty rows exactly like classic paper receipts */}
                                {Array.from({ length: Math.max(1, 4 - voucher.items.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="opacity-40">
                                        <td className="p-2 text-center border-r border-[#094F2B]/5">&nbsp;</td>
                                        <td className="p-2 border-r border-[#094F2B]/5">&nbsp;</td>
                                        <td className="p-2 border-r border-[#094F2B]/5">&nbsp;</td>
                                        <td className="p-2 border-r border-[#094F2B]/5">&nbsp;</td>
                                        <td className="p-2 bg-emerald-50/5">&nbsp;</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom-right AMOUNT PAID Pill */}
                    <div className="flex justify-between items-center mt-1.5 px-1.5">
                        <div className="text-[8.5px] text-gray-400 leading-tight pr-5 flex-grow text-left">
                            {voucher.isSelfIssued !== false ? (
                                <p className="font-semibold text-[#094F2B]/80 font-sans">
                                    ✍️ 代开凭单说明: 由于收款商户属非注册实体，此单为吉隆坡金莲记代开发票对账专用。
                                </p>
                            ) : (
                                <p className="font-semibold text-gray-400 font-sans">
                                    * 内部结算说明: 账目经出纳系统自动审核并发放，直接列入当月损耗/费用账册备份。
                                </p>
                            )}
                        </div>
                        
                        <div className="flex items-stretch border-[1.5px] border-[#094F2B] rounded-2xl overflow-hidden shadow-sm h-10 w-fit shrink-0 font-sans">
                            <div className="bg-[#8BC43F] text-[#094F2B]/90 font-black text-[10.5px] px-4 flex items-center justify-center uppercase tracking-wider">
                                Amount Paid
                            </div>
                            <div className="bg-[#FCFFF9] px-5 flex items-center justify-center font-mono font-black text-[14.5px] text-[#094F2B] border-l border-[#094F2B] min-w-[125px] text-right justify-end select-all">
                                RM {totalAmount.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    {/* Additional Notes Container */}
                    {voucher.notes && (
                        <div className="bg-[#FCFFF9] border border-emerald-500/10 rounded-xl p-2.5 text-[8.5px] text-left">
                            <span className="font-black text-[#094F2B] uppercase tracking-wider block mb-0.5">Note / Remark 财务稽核附注:</span>
                            <p className="text-gray-650 italic leading-snug">
                                {voucher.notes}
                            </p>
                        </div>
                    )}
                </div>

                {/* Bottom Section: Footer Legalities, Signature Lines, Green Curved Wave Decoration */}
                <div className="flex flex-col mt-auto pt-3 border-t border-dashed border-emerald-200/50">
                    <div className="grid grid-cols-12 gap-4 text-left">
                        {/* Terms and Conditions Block */}
                        <div className="col-span-7 pr-4">
                            <h4 className="font-extrabold text-[#094F2B] text-[8.5px] uppercase tracking-widest mb-1.5">Terms & Conditions</h4>
                            <ol className="list-decimal pl-3 text-[7.5px] leading-relaxed text-gray-400 font-semibold space-y-0.5">
                                <li>This self-issued voucher serves as an official proof of internal settlement and tax deduction for auditing purposes.</li>
                                <li>The recipient bears full responsibility for confirming the accuracy of the items, descriptions, and unit prices listed.</li>
                                <li>This ledger system is managed directly by the corporate finance department of Kim Lian Kee (Kepong) with complete change-logs.</li>
                                <li>This voucher is prepared in duplicate. The original copy is held for audit, and the duplicate is filed by the buyer.</li>
                            </ol>
                        </div>

                        {/* Signatures Field Block */}
                        <div className="col-span-5 pl-4 border-l border-emerald-50 flex flex-col justify-between">
                            <div>
                                <h4 className="font-extrabold text-[#094F2B] text-[8.5px] uppercase tracking-widest mb-1">Disbursement Options</h4>
                                <div className="text-[8px] space-y-0.5 font-bold">
                                    <p className="text-gray-500">Method: <span className="text-red-650 font-mono font-black">{voucher.paymentMethod === 'ONLINE_TRANSFER' ? '🏦 BANK TRANSFER' : '💵 CASH PAYMENT'}</span></p>
                                    <p className="text-gray-500">Approver: <span className="text-gray-800">{voucher.approvedBy || 'SYSTEM'}</span></p>
                                </div>
                            </div>

                            <div className="mt-3">
                                <div className="text-[7.5px] text-gray-400 font-black uppercase mb-1">SIGNATED BY:</div>
                                <div className="border-b border-[#094F2B]/35 w-full pb-3 text-center">
                                    &nbsp;
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Standard Legal Footer Ribbon in Deep Green & Lime */}
                    <div className="mt-5 -mx-7 -mb-7 rounded-b-2xl overflow-hidden shadow-md">
                        <div className="bg-[#094F2B] h-6 px-4 flex items-center justify-between text-[7px] text-white font-mono uppercase tracking-widest relative">
                            {/* Accent Lime line in ribbon */}
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#8BC43F]"></div>
                            <span>Payment Options / System Generated</span>
                            <span>Kim Lian Kee (Kepong) ERP Dashboard</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div 
            className={`w-[595px] h-[842px] p-6 flex flex-col justify-between tracking-normal leading-normal relative ${styleConfig.bgClass} ${styleConfig.borderClass} ${styleConfig.fontSans}`}
            style={{ 
                boxSizing: 'border-box',
                color: '#111111'
            }}
        >
            {/* Watermark diagonal text */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] select-none pointer-events-none transform -rotate-45 font-black text-4xl text-gray-500 tracking-wider">
                {voucher.templateStyle === 'TRADITIONAL_CARBON' ? 'KIM LIAN KEE OFFICIAL RECEIPT' : 'KIM LIAN KEE INTERNAL USE ONLY'}
            </div>

            {/* Top Sheet */}
            <div>
                {/* A5 Document Header Brand */}
                <div className="flex justify-between items-start border-b border-gray-350 pb-3">
                    <div>
                        <h2 className="text-[9px] tracking-widest font-bold uppercase text-[#8B6508]">
                            {voucher.templateStyle === 'TRADITIONAL_CARBON' ? 'Official Revenue Receipt / 金莲记正式自开收据：收入' : 'Payment Verification Proof / 内部收付凭证证明'}
                        </h2>
                        <h1 className="text-xl font-serif font-black tracking-tight mt-0.5 text-slate-900 select-all">
                            {voucher.templateStyle === 'TRADITIONAL_CARBON' ? '吉隆坡金莲记 (KIM LIAN KEE)' : (voucher.companyName || '').replace(/吉隆坡金莲记/g, '金莲记甲洞')}
                        </h1>
                        <p className="text-[8px] text-gray-500 mt-0.5 uppercase font-medium tracking-wider">
                            {voucher.templateStyle === 'TRADITIONAL_CARBON' ? 'Official Financial Receipt Reference' : 'Internal Disbursement Voucher Ref'}
                        </p>
                    </div>

                    <div className="text-right flex flex-col items-end">
                        <span className="inline-flex items-center justify-center bg-red-600 text-white font-mono font-bold text-[8px] px-2.5 h-5 rounded-sm tracking-widest uppercase leading-none" style={{ backgroundColor: '#dc2626' }}>
                            {voucher.isSelfIssued !== false ? 'RECIPIENT-CREATED' : 'INTERNAL RECORD'}
                        </span>
                        <div className="mt-2 text-right">
                            <span className="text-[8px] text-gray-400 block font-bold">VOUCHER NO.</span>
                            <span className="font-mono text-xs font-black text-red-600 tracking-wider">
                                {voucher.voucherNo}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Voucher Title Sheet */}
                <div className={`${styleConfig.headerBg} p-2 text-center my-3 rounded-sm border border-slate-200 shadow-sm`}>
                    <h2 className={`font-serif font-black text-sm tracking-wide uppercase ${styleConfig.textTitleClass}`}>
                        {voucherTitle}
                    </h2>
                </div>

                {/* Secondary Meta details Block */}
                {voucher.voucherType === 'CASH_BILL' ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10.5px] mt-2.5 bg-[#F2FAF5] p-3 border border-emerald-100 rounded-lg">
                        <div className="space-y-2 text-left">
                            <div className="flex pb-1 border-b border-gray-200">
                                <span className="text-gray-400 font-bold w-20">
                                    {voucher.templateStyle === 'TRADITIONAL_CARBON' ? 'Seller (Issuer):' : 'Vendor Name:'}
                                </span>
                                <span className="font-extrabold flex-grow pb-0.5 text-slate-900 leading-tight">
                                    {voucher.templateStyle === 'TRADITIONAL_CARBON' ? '吉隆坡金莲记 (KIM LIAN KEE)' : voucher.payeeName}
                                </span>
                            </div>
                            <div className="flex pb-1 border-b border-gray-200">
                                <span className="text-gray-400 font-bold w-20">
                                    {voucher.templateStyle === 'TRADITIONAL_CARBON' ? 'Buyer (Customer):' : 'Buyer Name:'}
                                </span>
                                <span className="font-extrabold flex-grow pb-0.5 text-slate-800">
                                    {voucher.templateStyle === 'TRADITIONAL_CARBON' ? voucher.payeeName : '金莲记甲洞 (Kim Lian Kee - Kepong)'}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2 text-left">
                            <div className="flex pb-1 border-b border-gray-200">
                                <span className="text-gray-400 font-bold w-20">Bill Date:</span>
                                <span className="font-mono font-extrabold flex-grow pb-0.5 text-slate-850">
                                    {voucher.date}
                                </span>
                            </div>
                            <div className="flex pb-1 border-b border-gray-200">
                                <span className="text-gray-400 font-bold w-20">Paid Method:</span>
                                <span className="font-extrabold flex-grow pb-0.5 text-[#059669] uppercase font-sans text-[10px]">
                                    {voucher.paymentMethod === 'ONLINE_TRANSFER' ? '🏦 Online Bank Transfer' : '💵 Cash Payment'}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px] mt-2.5 bg-slate-50/70 p-3 border border-slate-100 rounded-sm">
                        <div className="space-y-1.5 text-left">
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Payer / Buyer:</span>
                                <span className="font-bold border-b border-gray-300 flex-grow pb-0.5 text-slate-800">
                                    金莲记甲洞(Kim Lian Kee - Kepong)
                                </span>
                            </div>
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Payee / Driver:</span>
                                <span className="font-bold border-b border-gray-300 flex-grow pb-0.5 text-slate-900">
                                    {voucher.payeeName}
                                </span>
                            </div>
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Payee Status:</span>
                                <span className="font-bold border-b border-gray-300 flex-grow pb-0.5 text-amber-800 font-sans text-[9px]">
                                    {voucher.payeeType === 'DRIVER' && '🚚 Driver (Unregistered)'}
                                    {voucher.payeeType === 'AGENT' && '👤 Agent (Unregistered)'}
                                    {voucher.payeeType === 'INDIVIDUAL' && '🧑 Casual Individual'}
                                    {voucher.payeeType === 'INFORMAL_VENDOR' && '🏪 Informal Vendor'}
                                    {!voucher.payeeType && '👤 Informal Partner'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-left">
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Voucher Date:</span>
                                <span className="font-mono font-bold border-b border-gray-300 flex-grow pb-0.5 text-slate-850">
                                    {voucher.date}
                                </span>
                            </div>
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Voucher Type:</span>
                                <span className="font-bold border-b border-gray-300 flex-grow pb-0.5 text-slate-800">
                                    {voucher.voucherType === 'PAYMENT_VOUCHER' && 'Recipient Payment'}
                                    {voucher.voucherType === 'DELIVERY_RECEIPT' && 'Transport Freight'}
                                    {voucher.voucherType === 'CASH_VOUCHER' && 'Cash Compensative'}
                                    {voucher.voucherType === 'PURCHASE_RECEIPT' && 'COGS Purchase Slip'}
                                </span>
                            </div>
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Compliance:</span>
                                <span className="font-bold border-b border-gray-300 flex-grow pb-0.5 text-emerald-700 font-sans text-[9px]">
                                    {voucher.isSelfIssued !== false 
                                        ? '✍️ RECIPIENT BILL' 
                                        : '📄 INTERNAL RECORD'}
                                </span>
                            </div>
                            <div className="flex border-b border-gray-100 pb-0.5">
                                <span className="text-gray-400 font-bold w-20">Method/Terms:</span>
                                <span className="font-bold border-b border-gray-300 flex-grow pb-0.5 text-red-600 font-sans text-[9px] uppercase tracking-wider">
                                    {voucher.paymentMethod === 'ONLINE_TRANSFER' ? '🏦 Online Transfer' : '💵 Cash Payment'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Particulars Table */}
                <table className="w-full text-left font-sans border-collapse mt-4 text-[10px]">
                    <thead>
                        <tr className={`${styleConfig.tableHeaderBg}`}>
                            <th className="p-1.5 border-b border-gray-300 w-8 text-center font-bold">No.</th>
                            <th className="p-1.5 border-b border-gray-300 font-bold">Particulars / Description</th>
                            <th className="p-1.5 border-b border-gray-300 w-20 text-center font-bold">Unit Type</th>
                            <th className="p-1.5 border-b border-gray-300 w-12 text-center font-bold">Qty</th>
                            <th className="p-1.5 border-b border-gray-300 w-24 text-right font-bold">Unit Price</th>
                            <th className="p-1.5 border-b border-gray-300 w-24 text-right font-bold">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {voucher.items.map((item, index) => (
                            <tr key={index} className="border-b border-gray-200">
                                <td className="p-1.5 text-center font-mono font-bold text-gray-500">
                                    {index + 1}
                                </td>
                                <td className="p-1.5 font-bold text-gray-800">
                                    {item.description || ' (Unnamed Item Details) '}
                                </td>
                                <td className="p-1.5 text-center font-bold text-gray-500">
                                    {item.unit || 'PCS'}
                                </td>
                                <td className="p-1.5 text-center font-mono font-bold text-gray-800">
                                    {item.qty}
                                </td>
                                <td className="p-1.5 text-right font-mono text-gray-755">
                                    RM {Number(item.unitPrice || 0).toFixed(2)}
                                </td>
                                <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                                    RM {(Number(item.qty || 0) * Number(item.unitPrice || 0)).toFixed(2)}
                                </td>
                            </tr>
                        ))}
                        
                        {/* Empty padding rows to make A5 sheet look full-scale and extremely professional */}
                        {Array.from({ length: Math.max(1, 3 - voucher.items.length) }).map((_, i) => (
                            <tr key={`empty-${i}`} className="border-b border-gray-100/50">
                                <td className="p-1.5 text-center">&nbsp;</td>
                                <td className="p-1.5">&nbsp;</td>
                                <td className="p-1.5">&nbsp;</td>
                                <td className="p-1.5">&nbsp;</td>
                                <td className="p-1.5">&nbsp;</td>
                                <td className="p-1.5">&nbsp;</td>
                            </tr>
                        ))}

                        {/* Grand Total Row */}
                        <tr className="bg-slate-50 border-t-2 border-gray-300">
                            <td colSpan={4} className="p-2 text-right font-bold text-[#1A1A1A] text-[10px] font-sans uppercase tracking-wider">
                                GRAND TOTAL (MALAYSIAN RINGGIT):
                            </td>
                            <td colSpan={2} className="p-2 text-right">
                                <div className="text-[8px] text-gray-400 uppercase tracking-wider font-bold">RM (MYR)</div>
                                <span className="font-serif font-black text-[#1A1A1A] text-sm select-all text-red-600 font-bold">
                                    RM {totalAmount.toFixed(2)}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Additional notes container */}
                {(voucher.notes || voucher.isSelfIssued !== false) && (
                    <div className="mt-3 space-y-1.5">
                        {voucher.notes && (
                            <div className="border border-gray-200 rounded-sm p-2.5 text-[9px] font-mono bg-[#FAFAFA]">
                                <span className="font-bold text-gray-500 block mb-0.5">Note / Remark Details:</span>
                                <p className="text-gray-700 italic leading-relaxed">
                                    {(voucher.notes || '')
                                        .replace(/吉隆坡金莲记/g, '金莲记甲洞')
                                        .replace(/此单据属于吉隆坡金莲记/g, '此单据属于金莲记甲洞')}
                                </p>
                            </div>
                        )}
                        {voucher.voucherType !== 'CASH_BILL' && voucher.isSelfIssued !== false && (
                            <div className="border border-amber-300/40 rounded-sm p-2 text-[8px] bg-amber-50/10 text-amber-900 leading-normal font-sans">
                                <span className="font-bold text-amber-950 block mb-0.5">✍️ RECIPIENT-CREATED BILL DECLARATION / 自制凭证对账声明</span>
                                <p className="text-gray-500">
                                    本凭据由买方代开，主要作为向独立个人或未注册商户支付劳务、运输等费用后的内部收付证明及审计备查。
                                    (This recipient-created voucher is generated by the buyer as internal disbursement proof for audit records.)
                                </p>
                            </div>
                        )}
                        {voucher.voucherType === 'CASH_BILL' && (
                            <div className="border border-emerald-300/40 rounded-sm p-2 text-[8px] bg-emerald-50/10 text-emerald-900 leading-normal font-sans">
                                <span className="font-bold text-emerald-900 block mb-0.5">✨ CASH BILL DISBURSEMENT PROOF / 现金核销收付证明</span>
                                <p className="text-gray-500">
                                    本凭单作为现金发放、转账对账及常规业务采购的内部结算对账核销凭证。(This generated cash voucher serves as solid internal proof of payment for regulatory clearance.)
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Signature Seals Sheet */}
            <div className="mt-4">
                <div className="grid grid-cols-3 gap-4 text-center text-[10px]">
                    
                    {/* Prepared By */}
                    <div className="flex flex-col items-center">
                        <div className="h-10 w-full border-b border-gray-450 flex items-end justify-center pb-1 relative">
                            {/* Dummy organic font text for visual quality */}
                            <span className="font-serif italic text-blue-600/60 font-black text-xs absolute bottom-0.5">
                                {voucher.preparedBy}
                            </span>
                        </div>
                        <span className="text-[8px] mt-1 block font-extrabold text-gray-500 uppercase tracking-wider">
                            PREPARED BY
                        </span>
                        <span className="text-[7px] text-gray-400 block font-mono">({voucher.preparedBy})</span>
                    </div>

                    {/* Approved By */}
                    <div className="flex flex-col items-center">
                        <div className="h-10 w-full border-b border-gray-450 flex items-end justify-center pb-1 relative">
                            {/* Seal stamp visual decoration */}
                            <div className={`absolute -top-3 rounded-full border border-dashed ${styleConfig.stampColor} p-1 px-2.5 uppercase text-[7px] font-black -rotate-6 animate-pulse select-none`}>
                                {styleConfig.stampText}
                            </div>
                            <span className="font-serif italic text-gray-650 text-xs">
                                {voucher.approvedBy || 'Approved'}
                            </span>
                        </div>
                        <span className="text-[8px] mt-1 block font-extrabold text-gray-500 uppercase tracking-wider">
                            APPROVED BY
                        </span>
                    </div>

                    {/* Receiver Signature */}
                    <div className="flex flex-col items-center">
                        <div className="h-10 w-full border-b border-gray-450 flex items-end justify-center pb-1 px-2 relative">
                            <span className="text-[8px] text-gray-400 italic absolute bottom-0.5 text-center">
                                (TAP OR SIGN RECV)
                            </span>
                        </div>
                        <span className="text-[8px] mt-1 block font-extrabold text-gray-500 uppercase tracking-wider">
                            PAYEE RECEIVED / SIGN
                        </span>
                        <span className="text-[7px] text-gray-400 block font-mono">({voucher.payeeName})</span>
                    </div>
                </div>

                {/* Footer legalities */}
                <div className="border-t border-gray-200 pt-1.5 mt-4">
                    <div className="flex justify-between items-center text-[7px] text-gray-400 font-mono uppercase tracking-wider leading-none">
                        <span>PRINTED SYSTEM-GENERATED NO SIGNATURE REQUIRED</span>
                        <span>CONFIDENTIAL - FOR KIM LIAN KEE AUDIT RECORD</span>
                        <span>PAGE 1 OF 1</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

