import * as React from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { ExpenseItem, MarketingSubCategory, AdChannel, MARKETING_SUBCAT_LABELS, MARKETING_SUBCAT_EMOJIS, AD_CHANNEL_LABELS, AD_CHANNEL_EMOJIS } from '../../../types';

interface ApMigrationToolProps {
    isOpen: boolean;
    onClose: () => void;
    unCategorizedMarketingBills: ExpenseItem[];
    migrationData: Record<string, { subCat?: MarketingSubCategory; channel?: AdChannel; tag?: string; }>;
    setMigrationData: React.Dispatch<React.SetStateAction<Record<string, { subCat?: MarketingSubCategory; channel?: AdChannel; tag?: string; }>>>;
    onSave: () => void;
    isSaving: boolean;
}

export const ApMigrationTool: React.FC<ApMigrationToolProps> = ({
    isOpen,
    onClose,
    unCategorizedMarketingBills,
    migrationData,
    setMigrationData,
    onSave,
    isSaving,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-[220] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div className="bg-white w-full md:max-w-3xl h-[90vh] md:max-h-[85vh] rounded-t-3xl md:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="bg-[#111111] text-white p-4 flex justify-between items-center shrink-0 border-b-4 border-amber-400">
                    <div>
                        <h3 className="font-black text-lg flex items-center gap-2">🔧 营销账单批量补类目</h3>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{unCategorizedMarketingBills.length} 条历史账单待分类</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg"><X size={20}/></button>
                </div>

                <div className="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 bg-gray-50" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {unCategorizedMarketingBills.map(bill => {
                        const data = migrationData[bill.id] || {};
                        return (
                            <div key={bill.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2 pb-2 border-b border-gray-100">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-[#111111] truncate">{bill.company}</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{bill.time?.split('T')[0]} · {bill.note?.slice(0, 30) || '—'}</p>
                                    </div>
                                    <span className="text-base font-mono font-black text-amber-700 shrink-0 ml-2">RM {Number(bill.totalBillAmount || bill.amount || 0).toFixed(2)}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <select
                                        value={data.subCat || ''}
                                        onChange={e => setMigrationData(m => ({
                                            ...m,
                                            [bill.id]: {
                                                ...m[bill.id],
                                                subCat: (e.target.value as MarketingSubCategory) || undefined,
                                                channel: e.target.value === 'AD_OUTPUT' ? m[bill.id]?.channel : undefined
                                            }
                                        }))}
                                        className="p-2 border-2 border-amber-200 rounded-lg text-xs font-bold focus:border-amber-500 outline-none"
                                    >
                                        <option value="">— 选择类型 —</option>
                                        {(Object.keys(MARKETING_SUBCAT_LABELS) as MarketingSubCategory[]).map(k => (
                                            <option key={k} value={k}>{MARKETING_SUBCAT_EMOJIS[k]} {MARKETING_SUBCAT_LABELS[k]}</option>
                                        ))}
                                    </select>
                                    {data.subCat === 'AD_OUTPUT' ? (
                                        <select
                                            value={data.channel || ''}
                                            onChange={e => setMigrationData(m => ({
                                                ...m,
                                                [bill.id]: { ...m[bill.id], channel: (e.target.value as AdChannel) || undefined }
                                            }))}
                                            className="p-2 border-2 border-sky-200 rounded-lg text-xs font-bold focus:border-sky-500 outline-none"
                                        >
                                            <option value="">— 选择渠道 —</option>
                                            {(Object.keys(AD_CHANNEL_LABELS) as AdChannel[]).map(k => (
                                                <option key={k} value={k}>{AD_CHANNEL_EMOJIS[k]} {AD_CHANNEL_LABELS[k]}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input 
                                            type="text" 
                                            value={data.tag || ''} 
                                            onChange={e => setMigrationData(m => ({ ...m, [bill.id]: { ...m[bill.id], tag: e.target.value } }))} 
                                            placeholder="🏷️ Campaign 标签 (可选)" 
                                            style={{ fontSize: 16 }} 
                                            className="p-2 border border-gray-200 rounded-lg text-xs outline-none" 
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 bg-white border-t-2 border-gray-200 flex items-center justify-between shrink-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
                    <p className="text-[10px] text-gray-500 font-bold">✅ 已填 <span className="text-amber-600 text-sm font-black">{Object.values(migrationData).filter(d => d.subCat).length}</span> / {unCategorizedMarketingBills.length}</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-black hover:bg-gray-200">取消</button>
                        <button 
                            onClick={onSave} 
                            disabled={isSaving || Object.values(migrationData).filter(d => d.subCat).length === 0} 
                            className="px-4 py-2 bg-[#111111] text-[#FFD200] rounded-lg text-xs font-black hover:bg-black disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} 批量保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
