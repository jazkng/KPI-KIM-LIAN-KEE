// ==========================================
// 🔗 批量关联库存品项
// ------------------------------------------
// 问题：收货时系统要靠「供应商产品 → 库存品项」的关联 (linkedStockId) 才知道
//      要把货加到哪一格库存。没关联的品项会被静默跳过 —— 收货单存了、账单也出了，
//      唯独库存原地不动 (ProcurementModule.tsx:1275 的 if (inventoryId) 没有 else)。
//
// 同一样东西跟不同供应商买是没问题的：每个供应商的产品各自关联到同一个库存品项即可。
// 麻烦的只是要一个个点，所以这里把它们集中成一张表。
//
// ⚠️ 换算比例 (1 采购单位 = 几个基础单位) 一定要对。
//    买「1 箱 = 24 罐」填 24；填错的话收一箱只会加 1 罐，或者加 24 箱。
// ==========================================

import React, { useState, useMemo } from 'react';
import {
    X, Save, Loader2, Link2, Search, AlertTriangle, CheckCircle2, Wand2,
} from 'lucide-react';
import { Supplier, StockItem, CatalogItem } from '../../../types';

/** 酒 + 罐装水的判定：科目、库存分类、名称关键字三者取其一 */
const DRINK_CATEGORIES = ['BEVERAGE_ALCOHOL', 'BEVERAGE_CANNED', 'RTD', 'DRINK'];
const DRINK_KEYWORDS = [
    'CARLSBERG', 'TIGER', 'GUINESS', 'GUINNESS', 'HEINEKEN', 'ANCHOR', 'SKOL', 'STOUT',
    '啤酒', '虎牌', '罐装', '罐', 'COCA', 'COKE', '可乐', '100PLUS', '100 PLUS',
    'SPRITE', '雪碧', 'PEPSI', 'F&N', 'FANTA', '汽水', 'SOFT DRINK', 'CAN',
];

const norm = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9一-龥]/g, '');

export const isDrinkItem = (name?: string, category?: string): boolean => {
    if (category && DRINK_CATEGORIES.includes(String(category).toUpperCase())) return true;
    const n = norm(name);
    return DRINK_KEYWORDS.some(k => n.includes(norm(k)));
};

/**
 * 名称相似度：共同字元片段占比。
 * 只用来「推荐」，一律要人确认才会存 —— 猜错了关联到别的品项，收货会加错库存。
 */
const similarity = (a: string, b: string): number => {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return 0.9;
    // 双字元片段重叠率
    const grams = (s: string) => {
        const out = new Set<string>();
        for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
        return out;
    };
    const gx = grams(x);
    const gy = grams(y);
    if (gx.size === 0 || gy.size === 0) return 0;
    let hit = 0;
    gx.forEach(g => { if (gy.has(g)) hit++; });
    return hit / Math.max(gx.size, gy.size);
};

export interface StockLinkChange {
    supplierId: string;
    catalogItemId: string;
    stockId: string;
    purchaseUnitName?: string;
    toBaseRatio?: number;
    baseUnit?: string;
}

interface Row {
    supplier: Supplier;
    item: CatalogItem;
    suggestion?: StockItem;
    score: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    suppliers: Supplier[];
    allStockList: StockItem[];
    onSave: (changes: StockLinkChange[]) => Promise<void>;
}

export const BatchStockLinkModal: React.FC<Props> = ({ isOpen, onClose, suppliers, allStockList, onSave }) => {
    const [onlyDrinks, setOnlyDrinks] = useState(true);
    const [keyword, setKeyword] = useState('');
    const [picks, setPicks] = useState<Record<string, string>>({});        // rowKey → stockId
    const [ratios, setRatios] = useState<Record<string, string>>({});      // rowKey → 换算
    const [saving, setSaving] = useState(false);

    const rowKey = (supplierId: string, itemId: string) => `${supplierId}::${itemId}`;

    /** 所有「还没关联库存」的供应商产品 */
    const rows: Row[] = useMemo(() => {
        const out: Row[] = [];
        suppliers.forEach(sup => {
            (sup.catalog || []).forEach(item => {
                if (item.linkedStockId) return;                    // 已关联的不列
                if (onlyDrinks && !isDrinkItem(item.name, item.category)) return;
                if (keyword && !`${item.name} ${sup.name}`.toLowerCase().includes(keyword.toLowerCase())) return;

                let best: StockItem | undefined;
                let bestScore = 0;
                allStockList.forEach(s => {
                    const sc = similarity(item.name, s.name);
                    if (sc > bestScore) { bestScore = sc; best = s; }
                });
                out.push({ supplier: sup, item, suggestion: bestScore >= 0.45 ? best : undefined, score: bestScore });
            });
        });
        return out.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name) || a.item.name.localeCompare(b.item.name));
    }, [suppliers, allStockList, onlyDrinks, keyword]);

    const unlinkedTotal = useMemo(
        () => suppliers.reduce((n, s) => n + (s.catalog || []).filter(i => !i.linkedStockId).length, 0),
        [suppliers]
    );

    /** 这一行最终会用哪个库存品项（使用者选的优先，其次是推荐） */
    const chosenOf = (r: Row): string => {
        const k = rowKey(r.supplier.id, r.item.id);
        if (picks[k] !== undefined) return picks[k];
        return '';   // 预设不自动带入推荐 —— 猜错会加错库存，一律要人点
    };

    const ratioOf = (r: Row, stockId: string): string => {
        const k = rowKey(r.supplier.id, r.item.id);
        if (ratios[k] !== undefined) return ratios[k];
        if (!stockId) return '';
        const stock = allStockList.find(s => s.id === stockId);
        const pu = stock?.purchaseUnits?.find(p => p.id === stock?.defaultPurchaseUnitId) || stock?.purchaseUnits?.[0];
        const guess = r.item.toBaseRatio || pu?.toBaseRatio || stock?.displayToBaseRatio || 1;
        return String(guess);
    };

    const changes: StockLinkChange[] = useMemo(() => {
        return rows
            .map(r => {
                const stockId = chosenOf(r);
                if (!stockId) return null;
                const stock = allStockList.find(s => s.id === stockId);
                const ratioNum = parseFloat(ratioOf(r, stockId));
                return {
                    supplierId: r.supplier.id,
                    catalogItemId: r.item.id,
                    stockId,
                    purchaseUnitName: r.item.purchaseUnitName || r.item.unit,
                    toBaseRatio: !isNaN(ratioNum) && ratioNum > 0 ? ratioNum : 1,
                    baseUnit: stock?.baseUnit || stock?.unit || 'pcs',
                } as StockLinkChange;
            })
            .filter((x): x is StockLinkChange => x !== null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, picks, ratios, allStockList]);

    const badRatioCount = changes.filter(c => !c.toBaseRatio || c.toBaseRatio <= 0).length;

    if (!isOpen) return null;

    /** 一键采用所有推荐（仍然要按保存才会写进去） */
    const applyAllSuggestions = () => {
        const next = { ...picks };
        rows.forEach(r => {
            if (r.suggestion && !next[rowKey(r.supplier.id, r.item.id)]) {
                next[rowKey(r.supplier.id, r.item.id)] = r.suggestion.id;
            }
        });
        setPicks(next);
    };

    const handleSave = async () => {
        if (changes.length === 0) { onClose(); return; }
        const badRatio = changes.filter(c => (c.toBaseRatio || 0) === 1)
            .filter(c => {
                const r = rows.find(x => x.item.id === c.catalogItemId && x.supplier.id === c.supplierId);
                return r && /箱|CTN|CARTON|CASE|打|DOZEN/i.test(r.item.unit || r.item.purchaseUnitName || '');
            });
        if (badRatio.length > 0 && !confirm(
            `有 ${badRatio.length} 项的采购单位看起来是「箱 / 打」，但换算填 1。\n` +
            `这样收 1 箱只会加 1 个到库存。确定要这样存吗？`
        )) return;

        setSaving(true);
        try {
            await onSave(changes);
            setPicks({});
            setRatios({});
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[170] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-5xl md:rounded-3xl rounded-t-3xl max-h-[94vh] flex flex-col shadow-2xl">

                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-black text-base text-stone-900 flex items-center gap-2">
                            <Link2 size={17} className="text-[#FFD200]" /> 批量关联库存品项
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            全部供应商共 <b className="text-orange-600">{unlinkedTotal}</b> 个产品还没关联库存
                            {onlyDrinks && <>，目前只显示酒 + 罐装水：<b>{rows.length}</b> 项</>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl shrink-0"><X size={18} /></button>
                </div>

                <div className="px-4 md:px-5 pt-3 shrink-0">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                        没关联的产品，<b>收货时不会加进库存</b>，而且不会报错。同一样东西跟不同供应商买没问题 ——
                        每个供应商的产品各自关联到<b>同一个库存品项</b>就好。
                        <br />
                        <b>换算</b>＝ 1 个采购单位等于几个基础单位。买「1 箱 24 罐」就填 <b>24</b>，填错库存会整个歪掉。
                    </div>
                </div>

                <div className="px-4 md:px-5 py-3 flex flex-col md:flex-row gap-2 shrink-0">
                    <label className="flex items-center gap-2 px-3 h-10 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold cursor-pointer shrink-0">
                        <input type="checkbox" checked={onlyDrinks} onChange={e => setOnlyDrinks(e.target.checked)} className="accent-stone-900" />
                        只看酒 + 罐装水
                    </label>
                    <div className="relative flex-grow">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={keyword} onChange={e => setKeyword(e.target.value)}
                            placeholder="搜产品或供应商名称…"
                            className="w-full pl-9 pr-3 h-10 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]" />
                    </div>
                    <button onClick={applyAllSuggestions}
                        className="h-10 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5 shrink-0">
                        <Wand2 size={13} className="text-indigo-500" /> 采用全部推荐
                    </button>
                </div>

                <div className="flex-grow overflow-auto px-4 md:px-5">
                    {rows.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 text-sm font-bold">
                            {onlyDrinks ? '✓ 酒和罐装水的产品都关联好了（或者还没建这些产品）' : '✓ 所有产品都关联好了'}
                        </div>
                    ) : (
                        <div className="space-y-2 pb-2">
                            {rows.map(r => {
                                const k = rowKey(r.supplier.id, r.item.id);
                                const chosen = chosenOf(r);
                                const ratio = ratioOf(r, chosen);
                                const stock = allStockList.find(s => s.id === chosen);
                                return (
                                    <div key={k} className={`border rounded-xl p-2.5 ${chosen ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                            <span className="font-black text-xs text-stone-900 whitespace-nowrap">{r.item.name}</span>
                                            <span className="text-[9px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">{r.supplier.name}</span>
                                            <span className="text-[9px] font-mono text-gray-400">采购单位：{r.item.purchaseUnitName || r.item.unit || '-'}</span>
                                            {r.suggestion && !chosen && (
                                                <button onClick={() => setPicks(p => ({ ...p, [k]: r.suggestion!.id }))}
                                                    className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                                                    推荐：{r.suggestion.name}（{Math.round(r.score * 100)}%）点这里采用
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2">
                                            <div>
                                                <label className="text-[9px] font-black text-gray-400 uppercase block mb-0.5">关联到库存品项</label>
                                                <select value={chosen}
                                                    onChange={e => setPicks(p => ({ ...p, [k]: e.target.value }))}
                                                    className="w-full px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-[#FFD200]">
                                                    <option value="">— 先不关联 —</option>
                                                    {allStockList.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}（{s.id}）· 基础单位 {s.baseUnit || s.unit}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-gray-400 uppercase block mb-0.5">换算 (1 采购单位 = ?)</label>
                                                <input type="number" value={ratio} disabled={!chosen}
                                                    onChange={e => setRatios(p => ({ ...p, [k]: e.target.value }))}
                                                    className="w-full px-2 h-9 border border-gray-200 rounded-lg text-xs font-mono font-bold text-right outline-none focus:ring-2 focus:ring-[#FFD200] disabled:bg-gray-50" />
                                            </div>
                                        </div>

                                        {chosen && (
                                            <div className="text-[10px] text-gray-500 font-bold mt-1">
                                                收 1 {r.item.purchaseUnitName || r.item.unit || '单位'} → 库存加
                                                <b className="text-stone-900"> {ratio || 1} {stock?.baseUnit || stock?.unit || 'pcs'}</b>
                                                {(parseFloat(ratio) === 1 && /箱|CTN|CARTON|CASE|打|DOZEN/i.test(r.item.unit || r.item.purchaseUnitName || '')) && (
                                                    <span className="text-orange-600 ml-1">⚠ 采购单位像是整箱，换算却是 1，确认一下</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 md:p-5 border-t border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="text-[11px] flex-grow font-bold">
                        {changes.length > 0 ? (
                            <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13} /> 有 {changes.length} 项要关联</span>
                        ) : <span className="text-gray-500">还没选任何一项</span>}
                        {badRatioCount > 0 && (
                            <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {badRatioCount} 项换算无效</span>
                        )}
                    </div>
                    <button onClick={onClose} className="h-11 px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">取消</button>
                    <button onClick={handleSave} disabled={saving || changes.length === 0}
                        className="h-11 px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 保存关联
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchStockLinkModal;
