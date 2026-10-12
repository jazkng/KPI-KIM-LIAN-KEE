// ==========================================
// 🏷️ 批量填供应商编号
// ------------------------------------------
// 用途：供应商目录里一堆产品没填 supplierCode（画面显示 NO-CODE），
//      一个个点进去改太慢。这里把它们排成一张表，对着报价单一次填完。
//
// ⚠️ supplierCode 是「供应商自己的产品编号」，会印在采购单 (PO) 上给对方看。
//    系统绝对不会自动生成 —— 编错了对方会对错货。只能从报价单/发票抄。
// ==========================================

import React, { useState, useMemo } from 'react';
import { X, Save, Loader2, Tag, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Supplier, CatalogItem } from '../../../types';

interface BatchSupplierCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier;
    /** 回传「产品 id → 编号」的对照表，由外层写进 catalog 并存档 */
    onSave: (codeMap: Record<string, string>) => Promise<void>;
}

export const BatchSupplierCodeModal: React.FC<BatchSupplierCodeModalProps> = ({
    isOpen, onClose, supplier, onSave,
}) => {
    /** 使用者这次输入的编号，key = 产品 id */
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [keyword, setKeyword] = useState('');
    const [onlyMissing, setOnlyMissing] = useState(true);
    const [saving, setSaving] = useState(false);

    const catalog: CatalogItem[] = supplier.catalog || [];

    const rows = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return catalog
            .filter(item => (onlyMissing ? !item.supplierCode : true))
            .filter(item => !kw || item.name.toLowerCase().includes(kw))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }, [catalog, keyword, onlyMissing]);

    const missingCount = catalog.filter(i => !i.supplierCode).length;

    /** 只送出真的有改动的（避免把原本有的编号覆写成空字串） */
    const changed = useMemo(() => {
        const out: Record<string, string> = {};
        Object.entries(drafts).forEach(([id, val]) => {
            const trimmed = val.trim();
            const original = catalog.find(i => i.id === id)?.supplierCode || '';
            if (trimmed !== original) out[id] = trimmed;
        });
        return out;
    }, [drafts, catalog]);

    /** 同一个供应商里编号重复 —— 通常是抄错行 */
    const duplicates = useMemo(() => {
        const seen: Record<string, string[]> = {};
        catalog.forEach(item => {
            const code = (drafts[item.id] !== undefined ? drafts[item.id] : item.supplierCode || '').trim();
            if (!code) return;
            if (!seen[code]) seen[code] = [];
            seen[code].push(item.name);
        });
        return Object.entries(seen).filter(([, names]) => names.length > 1);
    }, [drafts, catalog]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (Object.keys(changed).length === 0) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            await onSave(changed);
            setDrafts({});
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-0 md:p-6">
            <div className="bg-white w-full md:max-w-3xl md:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">

                {/* 标题列 */}
                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-black text-base text-[#111111] flex items-center gap-2">
                            <Tag size={17} className="text-[#FFD200]" />
                            批量填供应商编号
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {supplier.name} · 共 {catalog.length} 项，其中 <b className="text-orange-600">{missingCount}</b> 项还没编号
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* 说明 */}
                <div className="px-4 md:px-5 pt-3 shrink-0">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                        这里填的是<b>供应商自己的产品编号</b>（他们报价单/发票上印的那个），会印在采购单上给对方看。
                        请对着报价单抄，<b>不要自己编</b> —— 编错了对方会对错货。没有编号的就留空，PO 会改印产品名称。
                    </div>
                </div>

                {/* 筛选 */}
                <div className="px-4 md:px-5 py-3 flex flex-col md:flex-row gap-2 shrink-0">
                    <div className="relative flex-grow">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder="搜产品名称…"
                            className="w-full pl-9 pr-3 min-h-[42px] bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]"
                        />
                    </div>
                    <label className="flex items-center gap-2 px-3 min-h-[42px] bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold cursor-pointer shrink-0">
                        <input
                            type="checkbox"
                            checked={onlyMissing}
                            onChange={e => setOnlyMissing(e.target.checked)}
                            className="accent-[#111111]"
                        />
                        只看没编号的
                    </label>
                </div>

                {/* 表格 */}
                <div className="flex-grow overflow-auto px-4 md:px-5">
                    {rows.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 text-sm font-bold">
                            {onlyMissing && missingCount === 0 ? '✓ 所有产品都有编号了' : '没有符合的产品'}
                        </div>
                    ) : (
                        <table className="w-full text-[12px]">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-gray-500 border-b border-gray-100">
                                    <th className="text-left py-2 font-black text-[9px] uppercase">产品</th>
                                    <th className="text-right py-2 font-black text-[9px] uppercase w-24">单价</th>
                                    <th className="text-left py-2 font-black text-[9px] uppercase w-40 pl-3">供应商编号</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(item => {
                                    const value = drafts[item.id] !== undefined ? drafts[item.id] : (item.supplierCode || '');
                                    const isChanged = changed[item.id] !== undefined;
                                    return (
                                        <tr key={item.id} className="border-b border-gray-50">
                                            <td className="py-2 pr-2">
                                                <div className="font-bold text-[#111111] leading-snug">{item.name}</div>
                                                {!item.supplierCode && (
                                                    <span className="text-[9px] font-mono text-orange-500">NO-CODE</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-right font-mono text-gray-500 whitespace-nowrap">
                                                {Number(item.price || 0).toFixed(2)}
                                                <span className="text-[9px] text-gray-400">/{item.unit}</span>
                                            </td>
                                            <td className="py-2 pl-3">
                                                <input
                                                    value={value}
                                                    onChange={e => setDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                    placeholder="照报价单抄"
                                                    className={`w-full px-2.5 min-h-[40px] border rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-[#FFD200] ${
                                                        isChanged ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'
                                                    }`}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 重复警告 */}
                {duplicates.length > 0 && (
                    <div className="mx-4 md:mx-5 mb-2 bg-red-50 border border-red-200 rounded-xl p-2.5 shrink-0">
                        <div className="text-[11px] font-black text-red-700 flex items-center gap-1.5 mb-1">
                            <AlertTriangle size={13} /> 编号重复
                        </div>
                        {duplicates.map(([code, names]) => (
                            <div key={code} className="text-[10px] text-red-700 leading-relaxed">
                                <b className="font-mono">{code}</b> 同时给了：{names.join('、')}
                            </div>
                        ))}
                        <div className="text-[10px] text-red-600 mt-1">
                            通常是抄错行。仍然可以保存，但下单时对方可能会搞混。
                        </div>
                    </div>
                )}

                {/* 底部 */}
                <div className="p-4 md:p-5 border-t border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="text-[11px] text-gray-500 flex-grow">
                        {Object.keys(changed).length > 0 ? (
                            <span className="text-emerald-700 font-black flex items-center gap-1">
                                <CheckCircle2 size={13} /> 有 {Object.keys(changed).length} 项要更新
                            </span>
                        ) : '还没有改动'}
                    </div>
                    <button onClick={onClose} className="px-4 min-h-[44px] rounded-xl bg-gray-100 text-gray-600 text-xs font-black">
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || Object.keys(changed).length === 0}
                        className="px-5 min-h-[44px] rounded-xl bg-[#111111] text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchSupplierCodeModal;
