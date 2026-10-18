// 供应商比价总表（只读）：同一样东西各家价格，最便宜 / 最贵 / 价差 / 常用是否最便宜，可下载 Excel
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import type { StockItem, Supplier } from '../../../types';
import { STOCK_AREA_COLLECTION, STOCK_AREAS } from '../../../utils/inventory/stockArea';
import { buildSupplierPriceReport, type PriceReportRow } from '../../../utils/inventory/supplierPriceReport';

const AREA_LABEL: Record<string, string> = { KITCHEN: '厨房', BAR: '水吧', GENERAL: '后勤', FUEL: '燃料' };
type Filter = 'MULTI' | 'NOT_CHEAPEST' | 'ALL';

export const SupplierPriceReport: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [rows, setRows] = useState<PriceReportRow[]>([]);
    const [filter, setFilter] = useState<Filter>('MULTI');

    const run = async () => {
        setLoading(true); setError('');
        try {
            const stocks: { area: typeof STOCK_AREAS[number]; item: StockItem }[] = [];
            for (const area of STOCK_AREAS) {
                const snap = await getDocs(collection(db, STOCK_AREA_COLLECTION[area]));
                snap.docs.forEach(d => stocks.push({ area, item: { ...(d.data() as StockItem), id: String(d.data().id || d.id) } }));
            }
            const suppliers = (await getDocs(collection(db, 'suppliers'))).docs.map(d => ({ ...(d.data() as Supplier), id: String(d.data().id || d.id) }));
            setRows(buildSupplierPriceReport(stocks, suppliers));
        } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
    };
    useEffect(() => { run(); }, []);

    const shown = useMemo(() => rows.filter(r => filter === 'ALL' ? true : filter === 'MULTI' ? r.supplierCount > 1 || r.packCount > 1 : r.preferredIsCheapest === false), [rows, filter]);
    const counts = { multi: rows.filter(r => r.supplierCount > 1 || r.packCount > 1).length, notCheapest: rows.filter(r => r.preferredIsCheapest === false).length };

    const exportCsv = () => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['区域', '编号', '商品', '基础单位', '供应商数', '包装数', '最便宜', '最便宜价/基础单位', '最贵', '最贵价/基础单位', '价差%', '常用', '常用价/基础单位', '常用是最便宜', '常用多付/基础单位', '最旧价格更新'];
        const lines = shown.map(r => [AREA_LABEL[r.area], r.stockCode || '', r.name, r.baseUnit, r.supplierCount, r.packCount,
            r.cheapest ? `${r.cheapest.supplier} · ${r.cheapest.item}` : '', r.cheapest?.perBase ?? '',
            r.priciest ? `${r.priciest.supplier} · ${r.priciest.item}` : '', r.priciest?.perBase ?? '', r.spreadPct ?? '',
            r.preferred ? `${r.preferred.supplier} · ${r.preferred.item}` : '', r.preferred?.perBase ?? '',
            r.preferredIsCheapest === null ? '' : r.preferredIsCheapest ? '是' : '否', r.preferredExtraPerBase ?? '', r.oldestPriceUpdate || ''].map(esc).join(','));
        const url = URL.createObjectURL(new Blob(['﻿' + [header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `供应商比价-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white px-4 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">供应商比价总表</h2>
                        <p className="truncate text-[11px] font-bold text-stone-500">只读 · 同一样东西各家每基础单位价格（包装不同也能比）</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {([['MULTI', `多家 / 多包装 ${counts.multi}`], ['NOT_CHEAPEST', `常用不是最便宜 ${counts.notCheapest}`], ['ALL', `全部 ${rows.length}`]] as [Filter, string][]).map(([k, l]) => (
                        <button key={k} onClick={() => setFilter(k)} className={`min-h-[40px] rounded-full px-4 text-sm font-black ${filter === k ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>{l}</button>
                    ))}
                    <button onClick={run} disabled={loading} className="flex min-h-[40px] items-center gap-1 rounded-full border border-stone-300 bg-white px-4 text-sm font-black disabled:opacity-50">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 重新读取
                    </button>
                    <button onClick={exportCsv} disabled={loading || !shown.length} className="flex min-h-[40px] items-center gap-1 rounded-full border border-green-200 bg-green-50 px-4 text-sm font-black text-green-700 disabled:opacity-50">
                        <FileSpreadsheet size={14} /> 下载（Excel）
                    </button>
                </div>
            </header>
            <div className="mx-auto w-full max-w-5xl flex-1 space-y-2 overflow-y-auto p-4">
                {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">读取失败：{error}</div>}
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-stone-500"><Loader2 className="animate-spin" size={18} /> 读取库存与供应商（只读）…</div>
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm font-bold text-stone-500">没有资料</div>
                ) : shown.map(r => (
                    <div key={r.stockId} className="rounded-2xl border border-stone-200 bg-white p-3 text-xs">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="min-w-0 font-black text-sm">{r.name} <span className="font-mono text-[11px] font-bold text-stone-400">{r.stockCode || ''} · {AREA_LABEL[r.area]}</span></div>
                            <div className="text-[11px] font-black text-stone-500">{r.supplierCount} 家 · {r.packCount} 种包装{r.spreadPct !== null ? ` · 价差 ${r.spreadPct}%` : ''}</div>
                        </div>
                        <div className="mt-1.5 grid gap-1 font-bold sm:grid-cols-3">
                            {r.cheapest && <div className="rounded-lg bg-green-50 px-2 py-1 text-green-800">最便宜：{r.cheapest.supplier} · RM {r.cheapest.perBase.toFixed(4)}/{r.baseUnit}</div>}
                            {r.priciest && r.spreadPct !== null && <div className="rounded-lg bg-stone-100 px-2 py-1 text-stone-700">最贵：{r.priciest.supplier} · RM {r.priciest.perBase.toFixed(4)}/{r.baseUnit}</div>}
                            <div className={`rounded-lg px-2 py-1 ${r.preferredIsCheapest === false ? 'bg-amber-50 text-amber-800' : 'bg-stone-50 text-stone-600'}`}>
                                {r.preferred ? `常用：${r.preferred.supplier}${r.preferredExtraPerBase ? `（每${r.baseUnit}多 RM ${r.preferredExtraPerBase.toFixed(4)}）` : ''}` : '没设常用（补货用最便宜）'}
                            </div>
                        </div>
                        {r.oldestPriceUpdate && <div className="mt-1 text-[10px] font-bold text-stone-400">最旧的价格更新：{r.oldestPriceUpdate}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
};
