import * as React from 'react';
import { useState } from 'react';
import { X, Link as LinkIcon, Clipboard, Loader2, Save, Trash2, Tag, ExternalLink, MessageSquare, Layers, Scissors, FileText, DollarSign } from 'lucide-react';
import { ExpenseItem, Supplier, Employee, MarketingSubCategory, AdChannel, MARKETING_SUBCAT_LABELS, MARKETING_SUBCAT_EMOJIS, AD_CHANNEL_LABELS, AD_CHANNEL_EMOJIS, BeverageSubCategory, BEVERAGE_SUBCAT_LABELS, BEVERAGE_SUBCAT_EMOJIS, SeafoodSubCategory, SEAFOOD_SUBCAT_LABELS, SEAFOOD_SUBCAT_EMOJIS } from '../../../types';
import { ACCOUNTING_CATEGORIES, getGoogleDriveEmbedUrl, getParticularsOptions } from './apConstants';

interface BillFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    editingBill: Partial<ExpenseItem>;
    setEditingBill: React.Dispatch<React.SetStateAction<Partial<ExpenseItem>>>;
    suppliers: Supplier[];
    employees: Employee[];
    isSaving: boolean;
    onSave: () => void;
    onDelete: (billId: string) => void;
    generatePV: boolean;
    setGeneratePV: React.Dispatch<React.SetStateAction<boolean>>;
    pvTitle?: string;
    setPvTitle?: (title: string) => void;
    onNavigateToSelfVoucher?: (prefillData: { company: string; date: string; totalAmount: number; particulars: string; billRefId: string }) => void;
}

const getDefaultDueDate = (dateValue: unknown, days = 15): string => {
    const datePart = String(dateValue || '').split('T')[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (!match) return '';

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const BillFormDrawer: React.FC<BillFormDrawerProps> = ({
    isOpen,
    onClose,
    editingBill,
    setEditingBill,
    suppliers,
    employees,
    isSaving,
    onSave,
    onDelete,
    generatePV,
    setGeneratePV,
    pvTitle,
    setPvTitle,
    onNavigateToSelfVoucher,
}) => {
    const [newTagInput, setNewTagInput] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    if (!isOpen) return null;

    const embedUrl = getGoogleDriveEmbedUrl(editingBill.linkUrl);
    const hasPreview = !!embedUrl;

    const handlePasteLink = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setEditingBill(prev => ({ ...prev, linkUrl: text }));
        } catch (err) {
            alert("Clipboard permission denied");
        }
    };

    const handleAddCustomTag = () => {
        if (!newTagInput.trim()) return;
        const current = editingBill.tags || [];
        const cleanTag = newTagInput.trim();
        if (!current.includes(cleanTag)) {
            setEditingBill(prev => ({ ...prev, tags: [...current, cleanTag] }));
        }
        setNewTagInput('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        const current = editingBill.tags || [];
        setEditingBill(prev => ({ ...prev, tags: current.filter(t => t !== tagToRemove) }));
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[150] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div 
                className={`bg-white w-full rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300 max-h-[92vh] md:max-h-[90vh] overflow-y-auto relative transition-all duration-300 ${hasPreview ? 'md:max-w-6xl md:w-full' : 'md:max-w-lg'}`} 
                onClick={e => e.stopPropagation()} 
                style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
            >
                {/* Drag handle (mobile only) */}
                <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-1 sticky top-0"></div>

                <div className="flex justify-between items-center mb-6 pb-2 border-b border-gray-100">
                    <h3 className="font-serif font-black text-lg md:text-xl text-[#111111] flex items-center gap-2">
                        {editingBill.id ? '📝 编辑应付账款' : '➕ 录入全新账单'}
                        {hasPreview && <span className="bg-emerald-100 text-emerald-800 text-[9px] px-2 py-0.5 rounded-full font-serif font-bold animate-pulse">📄 已关联对账凭单</span>}
                    </h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>
                
                <div className={hasPreview ? 'grid grid-cols-1 lg:grid-cols-12 gap-6' : 'space-y-4'}>
                    <div className={hasPreview ? 'lg:col-span-6 space-y-4' : 'space-y-4'}>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center justify-between">
                                <span>Company / Supplier (自动创建供应商)</span>
                                {editingBill.company?.trim() ? (
                                    (() => {
                                        const matched = suppliers.find(s => s.name.trim().toLowerCase() === editingBill.company!.trim().toLowerCase());
                                        return matched ? (
                                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-black tracking-wider border border-emerald-200">
                                                ✅ 已记录 (ID: {matched.id})
                                            </span>
                                        ) : (
                                            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-black tracking-wider border border-amber-200">
                                                🆕 新开供应商
                                            </span>
                                        );
                                    })()
                                ) : null}
                            </label>
                            <input 
                                list="suppliers_list" 
                                className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none border-2 border-transparent focus:border-[#FFD200]" 
                                value={editingBill.company || ''} 
                                onChange={e => setEditingBill(prev => ({ ...prev, company: e.target.value }))} 
                                placeholder="Type name..." 
                            />
                            <datalist id="suppliers_list">
                                {[...suppliers].sort((a,b) => a.name.localeCompare(b.name)).map(s => (
                                    <option key={s.id} value={s.name}>{s.id} - {s.name}</option>
                                ))}
                            </datalist>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Date</label>
                                <input 
                                    type="date" 
                                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none" 
                                    value={editingBill.time?.split('T')[0] || ''} 
                                    onChange={e => {
                                        const newDate = e.target.value;
                                        setEditingBill(prev => {
                                            const next = { ...prev, time: newDate };
                                            const previousAutoDueDate = getDefaultDueDate(prev.time);
                                            const shouldKeepAutomaticDueDate = !prev.dueDate || prev.dueDate === previousAutoDueDate;
                                            if (newDate && prev.paymentStatus !== 'PAID' && shouldKeepAutomaticDueDate) {
                                                next.dueDate = getDefaultDueDate(newDate);
                                            }
                                            return next;
                                        });
                                    }} 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Due Date</label>
                                {editingBill.paymentStatus !== 'PAID' ? (
                                    <input 
                                        type="date" 
                                        className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none" 
                                        value={editingBill.dueDate || ''} 
                                        onChange={e => setEditingBill(prev => ({...prev, dueDate: e.target.value}))} 
                                    />
                                ) : (
                                    <div className="w-full p-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs border border-emerald-100">
                                        已付款，无需到期日
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Supplier Invoice No. */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                                Invoice No. (供应商发票号 - 可选)
                            </label>
                            <input
                                type="text"
                                className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none border-2 border-transparent focus:border-[#FFD200]"
                                value={editingBill.invoiceRef || ''}
                                onChange={e => setEditingBill(prev => ({ ...prev, invoiceRef: e.target.value }))}
                                placeholder="例如: INV-2026-0451"
                                style={{ fontSize: 16 }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                                    Invoice Total (RM)
                                </label>
                                <input 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 rounded-xl font-black text-lg outline-none focus:bg-white focus:ring-2 focus:ring-[#FFD200]" 
                                    value={editingBill.totalBillAmount || ''} 
                                    onChange={e => setEditingBill(prev => ({...prev, totalBillAmount: parseFloat(e.target.value) || 0}))} 
                                    placeholder="0.00" 
                                />
                            </div>
                            <div className="bg-orange-50 p-2 rounded-xl border border-orange-100">
                                <label className="text-[10px] font-black text-orange-600 uppercase mb-1 block flex items-center gap-1">
                                    <Scissors size={10}/> Credit Note / 折扣
                                </label>
                                <input 
                                    type="number" 
                                    className="w-full p-1 bg-white rounded-lg font-black text-base text-orange-700 outline-none" 
                                    value={editingBill.creditNote || ''} 
                                    onChange={e => setEditingBill(prev => ({...prev, creditNote: parseFloat(e.target.value) || 0}))} 
                                    placeholder="0.00" 
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block flex items-center gap-1">
                                <LinkIcon size={12}/> Document Link (Google Drive / Photo)
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-grow p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none" 
                                    value={editingBill.linkUrl || ''} 
                                    onChange={e => setEditingBill(prev => ({...prev, linkUrl: e.target.value}))} 
                                    placeholder="https://..." 
                                />
                                <button onClick={handlePasteLink} className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200" title="Paste Link">
                                    <Clipboard size={16}/>
                                </button>
                            </div>

                            {!editingBill.linkUrl && onNavigateToSelfVoucher && (
                                <div className="mt-2 text-left bg-[#F2FAF5] border border-emerald-200/60 rounded-xl p-3 animate-in fade-in duration-200">
                                    <span className="text-[10px] font-black text-emerald-800 block mb-1">💡 暂无发票或收条单据备份？</span>
                                    <p className="text-[9px] text-emerald-700/90 leading-normal mb-2.5">
                                        您可以直接由此账款数据<strong>【一键生成内部 Cash Bill (现金凭单)】</strong>，数据将自动同步过去：
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const prefillData = {
                                                company: editingBill.company || '',
                                                date: editingBill.time?.split('T')[0] || new Date().toISOString().split('T')[0],
                                                totalAmount: editingBill.totalBillAmount || 0,
                                                particulars: `To pay for invoice entry ${editingBill.invoiceRef || ''} under category ${editingBill.category || ''}`,
                                                billRefId: editingBill.id || ''
                                            };
                                            onNavigateToSelfVoucher(prefillData);
                                        }}
                                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[10.5px] font-extrabold px-3.5 py-2 rounded-xl shadow-sm transition-all min-h-[36px]"
                                    >
                                        ✍️ 自动生成/自行开新单 Create Cash Bill
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 relative">
                            <label className="text-[10px] font-black text-blue-600 uppercase mb-2 block flex items-center gap-1">
                                <Tag size={12}/> 标签管理 (Tags)
                            </label>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {(editingBill.tags || []).map(tag => (
                                    <span key={tag} className="bg-white text-black px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-gray-200 shadow-sm">
                                        #{tag} 
                                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-600 ml-1 bg-gray-100 rounded-full p-0.5">
                                            <X size={10}/>
                                        </button>
                                    </span>
                                ))}
                                {(!editingBill.tags || editingBill.tags.length === 0) && (
                                    <span className="text-xs text-gray-400 italic">暂无标签</span>
                                )}
                            </div>
                            <div className="flex gap-2 mb-3">
                                <input 
                                    type="text" 
                                    value={newTagInput} 
                                    onChange={(e) => setNewTagInput(e.target.value)} 
                                    className="flex-grow p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all" 
                                    placeholder="输入新标签..." 
                                    onKeyDown={e => { if(e.key === 'Enter') handleAddCustomTag(); }} 
                                />
                                <button onClick={handleAddCustomTag} className="bg-blue-600 text-white px-3 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition-colors">
                                    添加 (Add)
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-blue-600 uppercase mb-1 block flex items-center gap-1">
                                    <Layers size={12}/> Category (会计科目 - 必选)
                                </label>
                                <select
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200] text-[#111111]"
                                    value={editingBill.category || ''}
                                    onChange={e => {
                                        const newCat = e.target.value;
                                        setEditingBill(prev => ({
                                            ...prev,
                                            category: newCat,
                                            ...(newCat !== 'MARKETING'
                                                ? { marketingSubCategory: undefined, adChannel: undefined, campaignTag: undefined }
                                                : {}),
                                            ...(newCat !== 'BEVERAGE'
                                                ? { beverageSubCategory: undefined }
                                                : {}),
                                            ...(newCat !== 'INGREDIENT_SEAFOOD'
                                                ? { seafoodSubCategory: undefined }
                                                : {})
                                        }));
                                    }}
                                >
                                    <option value="">-- Select Category --</option>
                                    {Object.entries(ACCOUNTING_CATEGORIES).map(([group, { options }]) => (
                                        <optgroup key={group} label={group}>
                                            {options.map(opt => (
                                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            {/* BEVERAGE CATEGORY SUBOPTIONS */}
                            {editingBill.category === 'BEVERAGE' && (
                                <div className="p-3 bg-amber-50 border-2 border-amber-200 rounded-xl space-y-3 animate-in slide-in-from-top-1">
                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                        👑 水吧细分 (必填 REQUIRED)
                                    </p>

                                    <div>
                                        <select
                                            value={editingBill.beverageSubCategory || ''}
                                            onChange={e => {
                                                const sub = e.target.value as BeverageSubCategory;
                                                const shortDate = (editingBill.time || new Date().toISOString()).split('T')[0];
                                                
                                                let autoParticulars = '';
                                                if (sub === 'FRUIT') autoParticulars = `Fruits - Beverage ingredients (${shortDate})`;
                                                else if (sub === 'CANNED') autoParticulars = `Canned Drinks - Beverage supply (${shortDate})`;
                                                else if (sub === 'ALCOHOL') autoParticulars = `Alcoholic Beverages - Bar replenishment (${shortDate})`;
                                                else if (sub === 'TEA') autoParticulars = `Teas - Premium tea leaves supply (${shortDate})`;
                                                else if (sub === 'HERBAL') autoParticulars = `Herbal Tea - Traditional brewing ingredients (${shortDate})`;

                                                setEditingBill(prev => ({
                                                    ...prev,
                                                    beverageSubCategory: sub || undefined,
                                                    particulars: autoParticulars || prev.particulars
                                                }));
                                            }}
                                            className="w-full p-3 bg-white border-2 border-amber-300 rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-[#111111]"
                                        >
                                            <option value="">— 请选择水吧细分 —</option>
                                            {(Object.keys(BEVERAGE_SUBCAT_LABELS) as BeverageSubCategory[]).map(k => (
                                                <option key={k} value={k}>{BEVERAGE_SUBCAT_EMOJIS[k]} {BEVERAGE_SUBCAT_LABELS[k]}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* SEAFOOD CATEGORY SUBOPTIONS */}
                            {editingBill.category === 'INGREDIENT_SEAFOOD' && (
                                <div className="p-3 bg-amber-50 border-2 border-amber-200 rounded-xl space-y-3 animate-in slide-in-from-top-1">
                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                        👑 海鲜细分 (必填 REQUIRED)
                                    </p>

                                    <div>
                                        <select
                                            value={editingBill.seafoodSubCategory || ''}
                                            onChange={e => {
                                                const sub = e.target.value as SeafoodSubCategory;
                                                const shortDate = (editingBill.time || new Date().toISOString()).split('T')[0];
                                                
                                                let autoParticulars = '';
                                                if (sub === 'FISH') autoParticulars = `Fish - Seafood purchase (${shortDate})`;
                                                else if (sub === 'SHRIMP') autoParticulars = `Prawn/Shrimp - Seafood purchase (${shortDate})`;
                                                else if (sub === 'SOTONG') autoParticulars = `Sotong/Squid - Seafood purchase (${shortDate})`;
                                                else if (sub === 'LALA') autoParticulars = `Lala (Shellfish) - Seafood purchase (${shortDate})`;
                                                else if (sub === 'SHRIMP_SOTONG') autoParticulars = `Prawn & Sotong - Seafood purchase (${shortDate})`;
                                                else if (sub === 'PROCESSED') autoParticulars = `Processed Seafood - Seafood purchase (${shortDate})`;

                                                setEditingBill(prev => ({
                                                    ...prev,
                                                    seafoodSubCategory: sub || undefined,
                                                    particulars: autoParticulars || prev.particulars
                                                }));
                                            }}
                                            className="w-full p-3 bg-white border-2 border-amber-300 rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-[#111111]"
                                        >
                                            <option value="">— 请选择海鲜细分 —</option>
                                            {(Object.keys(SEAFOOD_SUBCAT_LABELS) as SeafoodSubCategory[]).map(k => (
                                                <option key={k} value={k}>{SEAFOOD_SUBCAT_EMOJIS[k]} {SEAFOOD_SUBCAT_LABELS[k]}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* MARKETING CATEGORY SUBOPTIONS */}
                            {editingBill.category === 'MARKETING' && (
                                <div className="p-3 bg-amber-50 border-2 border-amber-200 rounded-xl space-y-3 animate-in slide-in-from-top-1">
                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                        👑 营销细分 (必填 Required)
                                    </p>

                                    <div>
                                        <label className="text-[10px] font-bold text-amber-800 uppercase mb-1.5 block">
                                            营销类型 <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={editingBill.marketingSubCategory || ''}
                                            onChange={e => {
                                                const sub = e.target.value as MarketingSubCategory;
                                                setEditingBill(prev => ({
                                                    ...prev,
                                                    marketingSubCategory: sub || undefined,
                                                    adChannel: sub === 'AD_OUTPUT' ? prev.adChannel : undefined
                                                }));
                                            }}
                                            className="w-full p-3 bg-white border-2 border-amber-300 rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-[#111111]"
                                        >
                                            <option value="">— 请选择营销类型 —</option>
                                            {(Object.keys(MARKETING_SUBCAT_LABELS) as MarketingSubCategory[]).map(k => (
                                                <option key={k} value={k}>{MARKETING_SUBCAT_EMOJIS[k]} {MARKETING_SUBCAT_LABELS[k]}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {editingBill.marketingSubCategory === 'AD_OUTPUT' && (
                                        <div className="pl-3 border-l-2 border-amber-400 animate-in slide-in-from-top-1">
                                            <label className="text-[10px] font-bold text-amber-800 uppercase mb-1.5 block">
                                                📡 广告渠道 <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={editingBill.adChannel || ''}
                                                onChange={e => setEditingBill(prev => ({ ...prev, adChannel: (e.target.value as AdChannel) || undefined }))}
                                                className="w-full p-3 bg-white border-2 border-amber-300 rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-[#111111]"
                                            >
                                                <option value="">— 请选择渠道 —</option>
                                                {(Object.keys(AD_CHANNEL_LABELS) as AdChannel[]).map(k => (
                                                    <option key={k} value={k}>{AD_CHANNEL_EMOJIS[k]} {AD_CHANNEL_LABELS[k]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-[10px] font-bold text-gray-600 uppercase mb-1.5 block">
                                            🏷️ Campaign 标签 (可选)
                                        </label>
                                        <input
                                            type="text"
                                            value={editingBill.campaignTag || ''}
                                            onChange={e => setEditingBill(prev => ({ ...prev, campaignTag: e.target.value }))}
                                            placeholder="例：Mothers Day 2026 / Ramadan Promo"
                                            maxLength={50}
                                            style={{ fontSize: 16 }}
                                            className="w-full p-3 bg-white border border-gray-300 rounded-xl text-xs font-bold outline-none focus:border-amber-400"
                                        />
                                        <p className="text-[9px] text-gray-400 mt-1">💡 同一活动多笔账单用相同标签，战略板会自动聚合 ROI</p>
                                    </div>
                                </div>
                            )}

                            {/* Particulars with recommendation chips */}
                            <div>
                                <label className="text-[10px] font-bold text-amber-700 uppercase mb-1.5 block flex items-center gap-1">
                                    <FileText size={12}/> Particulars of Payment (PV 上显示)
                                </label>
                                {editingBill.category && (() => {
                                    const opts = getParticularsOptions(editingBill);
                                    return (
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                            {opts.map((opt, i) => {
                                                const isActive = editingBill.particulars === opt.value;
                                                return (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => setEditingBill(prev => ({ ...prev, particulars: opt.value }))}
                                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 flex items-center gap-1 ${
                                                            isActive
                                                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                                                : 'bg-amber-55 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                        }`}
                                                        title={opt.value}
                                                    >
                                                        {i === 0 && <span>⭐</span>}
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                            {editingBill.particulars && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingBill(prev => ({ ...prev, particulars: '' }))}
                                                    className="px-2 py-1 rounded-lg text-[10px] font-bold border border-gray-200 bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-400 hover:border-red-200 transition-all"
                                                >
                                                    ✕ 清除
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                                <input
                                    type="text"
                                    className={`w-full p-3 bg-white rounded-xl text-xs font-bold outline-none transition-all border-2 ${
                                        editingBill.particulars
                                            ? 'border-amber-400 focus:ring-2 focus:ring-amber-200'
                                            : 'border-amber-100 focus:border-amber-300 focus:ring-2 focus:ring-amber-100'
                                    }`}
                                    value={editingBill.particulars || ''}
                                    onChange={e => setEditingBill(prev => ({ ...prev, particulars: e.target.value }))}
                                    placeholder={editingBill.category ? getParticularsOptions(editingBill)[0]?.value : 'Payment for goods / services'}
                                    style={{ fontSize: 16 }}
                                />
                                <p className="text-[9px] text-gray-400 mt-1 italic">
                                    ⭐ = 推荐默认。点芯片一键填入，也可直接输入自定义。留空则 PV 自动套用 ⭐ 模板。
                                </p>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block flex items-center gap-1">
                                    <MessageSquare size={12}/> Note
                                </label>
                                <textarea
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none resize-none h-20"
                                    placeholder="Notes..."
                                    value={editingBill.note || ''}
                                    onChange={e => setEditingBill(prev => ({...prev, note: e.target.value}))}
                                />
                            </div>
                        </div>

                        <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 space-y-4">
                            <h4 className="text-xs font-black text-orange-800 uppercase flex items-center gap-2">
                                <DollarSign size={14}/> Payment Details
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-orange-700 uppercase mb-1 block">Status</label>
                                    <select 
                                        className="w-full p-2 bg-white border border-orange-200 rounded-lg text-xs font-bold outline-none" 
                                        value={editingBill.paymentStatus || 'UNPAID'} 
                                        onChange={e => {
                                            const nextStatus = e.target.value as ExpenseItem['paymentStatus'];
                                            setEditingBill(prev => ({
                                                ...prev,
                                                paymentStatus: nextStatus,
                                                dueDate: nextStatus !== 'PAID' && !prev.dueDate
                                                    ? getDefaultDueDate(prev.time)
                                                    : prev.dueDate,
                                            }));
                                        }}
                                    >
                                        <option value="UNPAID">UNPAID (未付)</option>
                                        <option value="PAID">PAID (已付)</option>
                                        <option value="PARTIAL">PARTIAL (部分)</option>
                                    </select>
                                </div>
                            </div>
                            
                            {editingBill.paymentStatus === 'PAID' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <div>
                                        <label className="text-[10px] font-bold text-orange-700 uppercase mb-2 block">Method (支付方式)</label>
                                        <div className="flex gap-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setEditingBill(prev => ({...prev, paymentMethod: 'BANK_TRANSFER'}))} 
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${editingBill.paymentMethod === 'BANK_TRANSFER' ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-md' : 'bg-white text-gray-500 border-orange-200 hover:bg-orange-50'}`}
                                            >
                                                🏦 Bank 转账
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => setEditingBill(prev => ({...prev, paymentMethod: 'CASH'}))} 
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${editingBill.paymentMethod === 'CASH' ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-white text-gray-500 border-orange-200 hover:bg-orange-50'}`}
                                            >
                                                💵 Cash 现金
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-orange-700 uppercase mb-1 block">Paid By (Who?)</label>
                                        <select 
                                            className="w-full p-2 bg-white border border-orange-200 rounded-lg text-xs font-bold outline-none" 
                                            value={editingBill.paidBy || 'COMPANY'} 
                                            onChange={e => setEditingBill(prev => ({...prev, paidBy: e.target.value}))}
                                        >
                                            <option value="COMPANY">Company (公款)</option>
                                            {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                                        </select>
                                        {editingBill.paidBy && editingBill.paidBy !== 'COMPANY' && (
                                            <label className="flex items-center gap-2 mt-2 text-xs font-bold text-orange-800 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={editingBill.isAdvancePayment || false} 
                                                    onChange={e => setEditingBill(prev => ({...prev, isAdvancePayment: e.target.checked}))} 
                                                    className="accent-orange-600"
                                                />
                                                Mark as Staff Advance (垫付)
                                            </label>
                                        )}
                                    </div>
                                    {/* 📅 自定义凭单选项 */}
                                    {!editingBill.id && (
                                        <div className="space-y-2">
                                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl mt-2 animate-in fade-in duration-200">
                                                <input 
                                                    type="checkbox" 
                                                    id="form_generate_pv"
                                                    checked={generatePV}
                                                    onChange={e => setGeneratePV(e.target.checked)}
                                                    className="w-4 h-4 text-amber-600 border-amber-400 rounded focus:ring-amber-500 cursor-pointer mt-0.5"
                                                />
                                                <label htmlFor="form_generate_pv" className="text-xs font-black text-amber-950 cursor-pointer flex flex-col">
                                                    <span>同时自动生成付款核销凭单 (Generate PV)</span>
                                                    <span className="text-[9px] text-amber-800 font-medium font-normal mt-0.5">勾选后本次新录入已付账单将自动关联生成付款凭单 (PV)。若不勾选，将纯粹作为已付账单录入，不衍生凭单。</span>
                                                </label>
                                            </div>
                                            {generatePV && pvTitle && setPvTitle && (
                                                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl animate-in slide-in-from-top-1 space-y-1">
                                                    <label className="text-[10px] font-black text-amber-800 uppercase block">
                                                        凭单纸张标题 (Document Title)
                                                    </label>
                                                    <select
                                                        value={pvTitle}
                                                        onChange={e => setPvTitle(e.target.value)}
                                                        className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-bold outline-none cursor-pointer"
                                                    >
                                                        <option value="AUTO">💡 智能自动选择 (Cash➔CASH VOUCHER, Bank➔PAYMENT VOUCHER)</option>
                                                        <option value="CASH VOUCHER">💵 CASH VOUCHER (现金凭单)</option>
                                                        <option value="CASH BILL">🧾 CASH BILL (现金账单)</option>
                                                        <option value="PAYMENT VOUCHER">🏦 PAYMENT VOUCHER (付款凭单)</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {editingBill.paymentStatus === 'PARTIAL' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <div>
                                        <label className="text-[10px] font-bold text-orange-700 uppercase mb-1.5 block">
                                            Paid Amount (已付部分金额 - RM)
                                        </label>
                                        <input 
                                            type="number" 
                                            className="w-full p-2.5 bg-white border border-orange-300 rounded-xl text-xs font-black text-orange-950 focus:outline-none focus:ring-2 focus:ring-orange-200"
                                            value={editingBill.amount || ''} 
                                            onChange={e => setEditingBill(prev => ({...prev, amount: parseFloat(e.target.value) || 0}))} 
                                            placeholder="输入已支付的部分金额"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-orange-700 uppercase mb-2 block">Method (部分支付方式)</label>
                                        <div className="flex gap-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setEditingBill(prev => ({...prev, paymentMethod: 'BANK_TRANSFER'}))} 
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${editingBill.paymentMethod === 'BANK_TRANSFER' ? 'bg-[#111111] text-[#FFD200] border-[#111111] shadow-md' : 'bg-white text-gray-500 border-orange-200 hover:bg-orange-50'}`}
                                            >
                                                🏦 Bank 转账
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => setEditingBill(prev => ({...prev, paymentMethod: 'CASH'}))} 
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${editingBill.paymentMethod === 'CASH' ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-white text-gray-500 border-orange-200 hover:bg-orange-50'}`}
                                            >
                                                💵 Cash 现金
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-orange-700 uppercase mb-1 block">Paid By (Who?)</label>
                                        <select 
                                            className="w-full p-2 bg-white border border-orange-200 rounded-lg text-xs font-bold outline-none" 
                                            value={editingBill.paidBy || 'COMPANY'} 
                                            onChange={e => setEditingBill(prev => ({...prev, paidBy: e.target.value}))}
                                        >
                                            <option value="COMPANY">Company (公款)</option>
                                            {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                                        </select>
                                        {editingBill.paidBy && editingBill.paidBy !== 'COMPANY' && (
                                            <label className="flex items-center gap-2 mt-2 text-xs font-bold text-orange-800 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={editingBill.isAdvancePayment || false} 
                                                    onChange={e => setEditingBill(prev => ({...prev, isAdvancePayment: e.target.checked}))} 
                                                    className="accent-orange-600"
                                                />
                                                Mark as Staff Advance (垫付)
                                            </label>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex gap-3">
                            {editingBill.id && (
                                <button 
                                    onClick={() => setShowDeleteConfirm(true)} 
                                    className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors"
                                >
                                    <Trash2 size={20}/>
                                </button>
                            )}
                            <button 
                                onClick={onSave} 
                                disabled={isSaving} 
                                className="flex-grow bg-[#111111] text-[#FFD200] py-4 rounded-2xl font-black text-lg shadow-lg hover:bg-black flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 size={20} className="animate-spin"/> : <Save size={20}/>} 保存账单
                            </button>
                        </div>
                    </div>

                    {/* Right portion: embed file viewing */}
                    {hasPreview && (
                        <div className="lg:col-span-6 flex flex-col bg-gray-950/5 border border-gray-200/60 rounded-2xl overflow-hidden h-full min-h-[480px] lg:min-h-[550px] sticky top-0 bg-gray-50/50 shadow-inner animate-in fade-in duration-300">
                            <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                                    <span className="text-xs font-black text-gray-700 truncate">对账看图核对中 (Google Drive)"</span>
                                </div>
                                <a 
                                    href={editingBill.linkUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-xl transition-all active:scale-95 shrink-0"
                                >
                                    <ExternalLink size={11} className="stroke-[3]"/> 浏览器直接打开
                                </a>
                            </div>
                            <div className="flex-grow w-full bg-white relative min-h-[450px] lg:min-h-[500px]">
                                <iframe 
                                    src={embedUrl}
                                    className="w-full h-[550px] lg:h-[620px] border-0 rounded-b-2xl object-contain bg-gray-50/20"
                                    allow="autoplay; encrypted-media"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* NESTED LOCAL DELETE CONFIRM MODAL */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 z-[160] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDeleteConfirm(false)}>
                    <div 
                        className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-2xl text-center border-t-4 border-red-500 animate-in slide-in-from-bottom md:zoom-in-95 duration-300" 
                        onClick={e => e.stopPropagation()} 
                        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 -mt-2"></div>
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                            <Trash2 size={32}/>
                        </div>
                        <h3 className="font-black text-xl text-[#111111] mb-2">确认删除此账单?</h3>
                        <p className="text-xs text-gray-500 font-bold mb-6">此操作无法撤销。如果属于结算单条目，将会通过事务安全剔除。</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setShowDeleteConfirm(false)} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-200">
                                取消
                            </button>
                            <button 
                                onClick={() => {
                                    if (editingBill.id) onDelete(editingBill.id);
                                    setShowDeleteConfirm(false);
                                }} 
                                disabled={isSaving} 
                                className="py-3 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 shadow-lg flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="animate-spin w-4 h-4"/> : '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
