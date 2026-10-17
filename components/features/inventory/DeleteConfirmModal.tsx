import React, { useMemo, useState } from 'react';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { StockItem } from '../../../types';
import type { LinkAction, LinkedCatalogRef } from '../../../utils/inventory/supplierLinks';
import { displayStockCode, matchesStockSearch } from '../../../utils/inventory/stockCode';

interface DeleteConfirmModalProps {
    itemName?: string;
    /** 正在读取连到这个商品的供应商品项与菜谱 */
    checking?: boolean;
    /** 连到这个商品的供应商品项：有的话必须先选处理方式 */
    linkedItems?: LinkedCatalogRef[];
    /** 用到这个商品的菜谱（只提示，删除后要到智能菜谱更换） */
    recipeNames?: string[];
    /** 改连结可选的其他库存商品 */
    relinkOptions?: StockItem[];
    onConfirm: (action?: LinkAction, newStockId?: string) => void;
    onCancel: () => void;
}

const ACTIONS: { id: LinkAction; label: string; hint: string }[] = [
    { id: 'DELETE_ITEM', label: '一起删除这些供应商品项', hint: '不再向他们采购这样东西' },
    { id: 'UNLINK', label: '解除连结，保留供应商品项', hint: '还会买，但不进库存' },
    { id: 'RELINK', label: '改连结到另一个库存商品', hint: '换成了新商品' },
];

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
    itemName, checking = false, linkedItems = [], recipeNames = [], relinkOptions = [], onConfirm, onCancel,
}) => {
    const [action, setAction] = useState<LinkAction | null>(null);
    const [newStockId, setNewStockId] = useState('');
    const [search, setSearch] = useState('');
    const options = useMemo(() => relinkOptions.filter(s => matchesStockSearch(s, search)).slice(0, 30), [relinkOptions, search]);
    const hasLinks = linkedItems.length > 0;
    const ready = !checking && (!hasLinks || (action !== null && (action !== 'RELINK' || !!newStockId)));

    return (
        <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl text-center border-t-8 border-red-500 animate-in zoom-in-95">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} className="text-red-600"/>
                </div>
                <h3 className="font-black text-2xl text-[#111111] mb-2">确认删除?</h3>
                <p className="text-sm text-gray-500 font-bold mb-4">您确定要删除 <span className="text-red-600">{itemName}</span> 吗？<br/>此操作无法撤销。</p>

                {checking ? (
                    <div className="mb-4 flex items-center justify-center gap-2 text-xs font-bold text-gray-500"><Loader2 size={14} className="animate-spin"/> 检查供应商与菜谱有没有用到这个商品…</div>
                ) : (
                    <>
                        {hasLinks && (
                            <div className="mb-4 space-y-2 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-left">
                                <div className="flex items-center gap-1 text-xs font-black text-orange-800"><AlertTriangle size={14}/> {linkedItems.length} 个供应商品项连到这个商品，请选择怎么处理：</div>
                                <ul className="space-y-0.5 text-[11px] font-bold text-orange-700">
                                    {linkedItems.slice(0, 8).map(l => <li key={l.supplierId + l.itemId}>· {l.supplierName} · {l.itemName}</li>)}
                                    {linkedItems.length > 8 && <li>…还有 {linkedItems.length - 8} 个</li>}
                                </ul>
                                <div className="space-y-1.5 pt-1">
                                    {ACTIONS.map(a => (
                                        <label key={a.id} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 ${action === a.id ? 'border-gray-900 bg-white' : 'border-orange-200 bg-white/60'}`}>
                                            <input type="radio" name="link-action" checked={action === a.id} onChange={() => setAction(a.id)} />
                                            <span className="text-xs font-black text-gray-800">{a.label}<span className="block text-[10px] font-bold text-gray-500">{a.hint}</span></span>
                                        </label>
                                    ))}
                                </div>
                                {action === 'RELINK' && (
                                    <div className="space-y-1.5 pt-1">
                                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索名称或编号…" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-bold" />
                                        <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                                            {options.map(s => (
                                                <button key={s.id} type="button" onClick={() => setNewStockId(s.id)}
                                                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold ${newStockId === s.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                                                    <span className="truncate">{s.name}</span><span className="shrink-0 font-mono text-[10px] opacity-70">{displayStockCode(s)}</span>
                                                </button>
                                            ))}
                                            {options.length === 0 && <div className="px-3 py-2 text-[11px] text-gray-400">找不到</div>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {recipeNames.length > 0 && (
                            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-left text-[11px] font-bold text-red-700">
                                {recipeNames.length} 道菜谱用到这个商品：{recipeNames.slice(0, 6).join('、')}{recipeNames.length > 6 ? '…' : ''}。删除后菜品成本会少算，请到智能菜谱更换食材。
                            </div>
                        )}
                    </>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <button onClick={onCancel} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors">取消 (Cancel)</button>
                    <button disabled={!ready} onClick={() => onConfirm(hasLinks ? action! : undefined, action === 'RELINK' ? newStockId : undefined)}
                        className="py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40"><Trash2 size={16}/> 确认删除</button>
                </div>
            </div>
        </div>
    );
};
