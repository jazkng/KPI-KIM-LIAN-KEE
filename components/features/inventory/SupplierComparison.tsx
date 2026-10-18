// 库存编辑窗「供应商比价」：同一样东西各家的包装、价格，最便宜标绿色，可设常用
import React, { useMemo, useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import type { StockItem, Supplier } from '../../../types';
import { cheapestOption, listSupplyOptions, type SupplyOption } from '../../../utils/inventory/supplyOptions';

const STORAGE_LABEL: Record<string, string> = { FROZEN: '冷冻', CHILLED: '冷藏', AMBIENT: '常温' };

interface Props {
    stock: Partial<StockItem> & { id: string };
    suppliers: Supplier[];
    canSetPreferred: boolean;
    onSetPreferred: (option: SupplyOption | null) => Promise<void>;
}

export const SupplierComparison: React.FC<Props> = ({ stock, suppliers, canSetPreferred, onSetPreferred }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const options = useMemo(() => listSupplyOptions(stock, suppliers, true), [stock, suppliers]);
    const active = options.filter(o => o.catalogItem.status !== 'DISCONTINUED');
    const cheapest = cheapestOption(active);
    const base = stock.baseUnit || stock.unit || '';
    const sorted = [...options].sort((a, b) => (a.catalogItem.status === 'DISCONTINUED' ? 1 : 0) - (b.catalogItem.status === 'DISCONTINUED' ? 1 : 0)
        || (a.perBase ?? Infinity) - (b.perBase ?? Infinity));

    const toggle = async (o: SupplyOption) => {
        const key = o.supplier.id + o.catalogItem.id;
        setBusy(key);
        try { await onSetPreferred(o.isPreferred ? null : o); } finally { setBusy(null); }
    };

    if (options.length === 0) {
        return <div className="text-[11px] text-gray-400 italic text-center py-3 bg-gray-50 border border-dashed border-[#E5E7EB] rounded-xl">暂无关联供应商 (No active supplier bindings)</div>;
    }

    return (
        <div className="space-y-2">
            {active.length > 1 && cheapest && (
                <div className="text-[11px] font-bold text-gray-500">
                    {new Set(active.map(o => o.supplier.id)).size} 家供应商 · {active.length} 种包装。最便宜：{cheapest.supplier.name}（RM {cheapest.perBase!.toFixed(4)} / {base}）
                    {!active.some(o => o.isPreferred) && '。没设常用时，补货默认用最便宜的。'}
                </div>
            )}
            {sorted.map(o => {
                const c = o.catalogItem;
                const off = c.status === 'DISCONTINUED';
                const isCheapest = !off && cheapest?.catalogItem.id === c.id && active.length > 1;
                const key = o.supplier.id + c.id;
                const diffPct = cheapest && o.perBase !== null && cheapest.perBase && !isCheapest && !off ? ((o.perBase - cheapest.perBase) / cheapest.perBase) * 100 : null;
                return (
                    <div key={key} className={`rounded-xl border p-2.5 text-xs ${off ? 'border-gray-200 bg-gray-50 opacity-60' : isCheapest ? 'border-green-300 bg-green-50' : 'border-[#E5E7EB] bg-[#F6F7FB]'}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1 font-black text-[#111111]">
                                    <span className="truncate">{o.supplier.name}</span>
                                    {o.isPreferred && <span className="rounded bg-amber-100 px-1 text-[9px] text-amber-800">常用</span>}
                                    {isCheapest && <span className="rounded bg-green-200 px-1 text-[9px] text-green-900">最便宜</span>}
                                    {off && <span className="rounded bg-gray-200 px-1 text-[9px] text-gray-600">停售</span>}
                                </div>
                                <div className="truncate text-[11px] font-bold text-gray-500">{c.name}{c.brand ? ` · ${c.brand}` : ''}{c.spec ? ` · ${c.spec}` : ''}</div>
                            </div>
                            <div className="shrink-0 text-right">
                                <div className="font-mono font-black text-[#111111]">{o.perBase !== null ? `RM ${o.perBase.toFixed(4)}` : '未报价'}</div>
                                <div className="text-[10px] font-bold text-gray-500">每 {base}{diffPct !== null ? ` · 贵 ${diffPct.toFixed(0)}%` : ''}</div>
                            </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-bold text-gray-600">
                            <span>RM {o.packPrice.toFixed(2)} / {o.packUnit}</span>
                            <span>1 {o.packUnit} = {o.packRatio} {base}</span>
                            {c.packDesc && <span>{c.packDesc}</span>}
                            {c.storage && <span>{STORAGE_LABEL[c.storage]}</span>}
                            {c.minOrderQty ? <span>最少 {c.minOrderQty} {o.packUnit}</span> : null}
                            {c.leadTimeDays ? <span>{c.leadTimeDays} 天到货</span> : null}
                            {c.lastReceivedAt && <span className="text-blue-700">最近进价 RM {Number(c.lastReceivedPrice || 0).toFixed(2)}（{c.lastReceivedAt.slice(0, 10)}）</span>}
                            {c.priceUpdatedAt && <span>价格更新 {c.priceUpdatedAt.slice(0, 10)}</span>}
                        </div>
                        {canSetPreferred && !off && (
                            <button type="button" disabled={!!busy} onClick={() => toggle(o)}
                                className={`mt-2 flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-[11px] font-black disabled:opacity-50 ${o.isPreferred ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-gray-300 bg-white text-gray-700'}`}>
                                {busy === key ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} className={o.isPreferred ? 'fill-amber-500 text-amber-500' : ''} />}
                                {o.isPreferred ? '取消常用' : '设为常用'}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
