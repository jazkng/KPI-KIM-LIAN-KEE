// ==========================================
// ⚙️ 销售分类设置
// ------------------------------------------
// 让你自己决定「哪个 SKU 算哪个分类」「报表要摆哪几行」，不用再改代码。
//
// 安全设计：
//   1. 改完先「试算」—— 拿某个月的真实资料跑一遍，看每笔会落到哪里
//   2. 保存前跑检查 —— 重叠、被吃掉的规则、报表漏收的大类都会列出来
//   3. 保存后可「重算历史」—— 用存好的 skuRows 重跑，旧月份跟着更新
//   4. 设定档坏掉或读不到 → 自动退回内建规则，报表不会白屏
// ==========================================

import React, { useState, useEffect, useMemo } from 'react';
import {
    X, Save, Loader2, Settings2, Plus, Trash2, AlertTriangle, CheckCircle2,
    ChevronUp, ChevronDown, RefreshCw, RotateCcw, Play,
} from 'lucide-react';
import { DataManager } from '../../../utils/dataManager';
import { SalesCategoryId, SALES_CATEGORY_LABELS, PrefixRule, ReportGroup } from '../../../constants/salesCategoryRules';
import {
    SalesRulesConfig, BUILTIN_SALES_RULES, normalizeSalesRules, checkSalesRules, RuleIssue,
} from '../../../constants/salesRulesRuntime';
import { StorehubMonthlySales, classifySku, resolveSkuCode, recalcMonth } from '../../../utils/storehubImport';

const CATEGORY_IDS = Object.keys(SALES_CATEGORY_LABELS) as SalesCategoryId[];
const catLabel = (c: SalesCategoryId) => `${SALES_CATEGORY_LABELS[c]?.zh || c} (${SALES_CATEGORY_LABELS[c]?.en || c})`;
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Tab = 'PREFIX' | 'KEYWORD' | 'LAYOUT';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** 保存后通知外层重新载入规则与报表 */
    onSaved: (cfg: SalesRulesConfig) => void;
}

export const SalesRulesSettings: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
    const [tab, setTab] = useState<Tab>('PREFIX');
    const [draft, setDraft] = useState<SalesRulesConfig>(BUILTIN_SALES_RULES);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [months, setMonths] = useState<StorehubMonthlySales[]>([]);
    const [previewMonth, setPreviewMonth] = useState<string>('');
    const [recalcing, setRecalcing] = useState(false);
    const [usingBuiltin, setUsingBuiltin] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        (async () => {
            setLoading(true);
            const [cfg, all] = await Promise.all([
                DataManager.getSalesRulesConfig(),
                DataManager.getAllStorehubSales().catch(() => [] as StorehubMonthlySales[]),
            ]);
            setUsingBuiltin(!cfg);
            setDraft(normalizeSalesRules(cfg));
            setMonths(all);
            setPreviewMonth(all.length > 0 ? all[all.length - 1].month : '');
            setLoading(false);
        })();
    }, [isOpen]);

    const issues: RuleIssue[] = useMemo(() => checkSalesRules(normalizeSalesRules(draft)), [draft]);
    const errorCount = issues.filter(i => i.level === 'ERROR').length;

    // ---------- 试算 ----------
    const preview = useMemo(() => {
        const rec = months.find(m => m.month === previewMonth);
        if (!rec || !Array.isArray(rec.skuRows)) return null;
        const rules = normalizeSalesRules(draft);
        const totals: Record<string, number> = {};
        const changed: { name: string; code: string; from: SalesCategoryId; to: SalesCategoryId; amount: number }[] = [];
        const unclassified: { name: string; code: string; amount: number }[] = [];

        rec.skuRows.forEach(r => {
            const code = r.resolvedCode || resolveSkuCode(r.sku, r.productName);
            const { category } = classifySku(code, r.productName, rules);
            totals[category] = (totals[category] || 0) + r.netSales;
            if (category !== r.category) changed.push({ name: r.productName, code, from: r.category, to: category, amount: r.netSales });
            if (category === 'UNCLASSIFIED') unclassified.push({ name: r.productName, code, amount: r.netSales });
        });
        return { month: rec.month, rowCount: rec.skuRows.length, totals, changed, unclassified };
    }, [months, previewMonth, draft]);

    if (!isOpen) return null;

    // ---------- 前缀规则编辑 ----------
    const setPrefix = (i: number, patch: Partial<PrefixRule>) =>
        setDraft(d => ({ ...d, prefixRules: d.prefixRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
    const movePrefix = (i: number, dir: -1 | 1) =>
        setDraft(d => {
            const list = [...d.prefixRules];
            const j = i + dir;
            if (j < 0 || j >= list.length) return d;
            [list[i], list[j]] = [list[j], list[i]];
            return { ...d, prefixRules: list };
        });

    // ---------- 保存 ----------
    const handleSave = async () => {
        const normalized = normalizeSalesRules({ ...draft, version: (draft.version || 0) + 1, updatedAt: new Date().toISOString() });
        if (errorCount > 0 && !confirm(`有 ${errorCount} 个严重问题（报表会漏钱）。仍然要保存吗？`)) return;
        setSaving(true);
        try {
            await DataManager.saveSalesRulesConfig(normalized);
            setDraft(normalized);
            setUsingBuiltin(false);
            onSaved(normalized);
            alert('✅ 规则已保存。旧月份要跟着变的话，按「重算历史月份」。');
        } finally {
            setSaving(false);
        }
    };

    const handleRecalcAll = async () => {
        if (months.length === 0) return alert('还没有导入任何月份');
        if (!confirm(`用现在保存的规则重算 ${months.length} 个月？\n金额不会变，只会重新分类。`)) return;
        setRecalcing(true);
        try {
            const rules = normalizeSalesRules(draft);
            const lines: string[] = [];
            for (const m of months) {
                const { record, changedRows } = recalcMonth(m, rules);
                if (changedRows > 0) {
                    await DataManager.saveStorehubSales(record);
                    lines.push(`${m.month}：${changedRows} 笔重新分类`);
                } else {
                    lines.push(`${m.month}：没有变化`);
                }
            }
            const all = await DataManager.getAllStorehubSales();
            setMonths(all);
            alert(`✅ 重算完成\n\n${lines.join('\n')}`);
            onSaved(rules);
        } finally {
            setRecalcing(false);
        }
    };

    const handleReset = () => {
        if (!confirm('把所有规则还原成系统内建的那一套？（还没保存前不会影响线上）')) return;
        setDraft(BUILTIN_SALES_RULES);
    };

    const catSelect = (value: SalesCategoryId, onChange: (v: SalesCategoryId) => void, cls = '') => (
        <select value={value} onChange={e => onChange(e.target.value as SalesCategoryId)}
            className={`px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-[#FFD200] ${cls}`}>
            {CATEGORY_IDS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-[170] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-5xl md:rounded-3xl rounded-t-3xl max-h-[94vh] flex flex-col shadow-2xl">

                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-black text-base text-stone-900 flex items-center gap-2">
                            <Settings2 size={17} className="text-[#FFD200]" /> 销售分类设置
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {usingBuiltin ? '目前用系统内建规则' : `目前用自订规则 v${draft.version}${draft.updatedAt ? ` · ${draft.updatedAt.slice(0, 10)}` : ''}`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl shrink-0"><X size={18} /></button>
                </div>

                {/* 分页 */}
                <div className="px-4 md:px-5 pt-3 flex gap-1.5 shrink-0">
                    {([['PREFIX', 'SKU 规则'], ['KEYWORD', '名称关键字'], ['LAYOUT', '报表版面']] as [Tab, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setTab(id)}
                            className={`px-3 h-9 rounded-xl text-xs font-black transition-all ${tab === id ? 'bg-stone-900 text-[#FFD200]' : 'bg-gray-100 text-gray-600'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex-grow flex items-center justify-center py-20"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : (
                    <div className="flex-grow overflow-auto px-4 md:px-5 py-3 space-y-3">

                        {/* ---------- SKU 前缀规则 ---------- */}
                        {tab === 'PREFIX' && (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                                    由上往下比对，<b>第一个命中就停</b>。号码范围留空 = 这个前缀全部。
                                    长前缀（例如 OJ）保存时会自动排到短前缀（J）前面，不用自己记。
                                </div>

                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[12px]">
                                        <thead className="bg-gray-50">
                                            <tr className="text-gray-500">
                                                <th className="text-left p-2 font-black text-[9px] uppercase w-20">前缀</th>
                                                <th className="text-left p-2 font-black text-[9px] uppercase w-32">号码范围</th>
                                                <th className="text-left p-2 font-black text-[9px] uppercase">归到哪个分类</th>
                                                <th className="p-2 w-24"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {draft.prefixRules.map((r, i) => (
                                                <tr key={i} className="border-t border-gray-100">
                                                    <td className="p-1.5">
                                                        <input value={r.prefix} onChange={e => setPrefix(i, { prefix: e.target.value.toUpperCase() })}
                                                            className="w-full px-2 h-9 border border-gray-200 rounded-lg text-xs font-mono font-bold uppercase outline-none focus:ring-2 focus:ring-[#FFD200]" />
                                                    </td>
                                                    <td className="p-1.5">
                                                        <div className="flex items-center gap-1">
                                                            <input type="number" placeholder="全部" value={r.range ? r.range[0] : ''}
                                                                onChange={e => {
                                                                    const v = e.target.value;
                                                                    setPrefix(i, { range: v === '' ? null : [Number(v), r.range ? r.range[1] : Number(v)] });
                                                                }}
                                                                className="w-14 px-1.5 h-9 border border-gray-200 rounded-lg text-xs font-mono text-center outline-none" />
                                                            <span className="text-gray-300">–</span>
                                                            <input type="number" placeholder="全部" value={r.range ? r.range[1] : ''}
                                                                onChange={e => {
                                                                    const v = e.target.value;
                                                                    setPrefix(i, { range: v === '' ? null : [r.range ? r.range[0] : Number(v), Number(v)] });
                                                                }}
                                                                className="w-14 px-1.5 h-9 border border-gray-200 rounded-lg text-xs font-mono text-center outline-none" />
                                                        </div>
                                                    </td>
                                                    <td className="p-1.5">{catSelect(r.category, v => setPrefix(i, { category: v }), 'w-full')}</td>
                                                    <td className="p-1.5">
                                                        <div className="flex items-center gap-0.5 justify-end">
                                                            <button onClick={() => movePrefix(i, -1)} className="w-7 h-7 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500"><ChevronUp size={12} /></button>
                                                            <button onClick={() => movePrefix(i, 1)} className="w-7 h-7 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500"><ChevronDown size={12} /></button>
                                                            <button onClick={() => setDraft(d => ({ ...d, prefixRules: d.prefixRules.filter((_, j) => j !== i) }))}
                                                                className="w-7 h-7 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500"><Trash2 size={12} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button onClick={() => setDraft(d => ({ ...d, prefixRules: [...d.prefixRules, { prefix: '', range: null, category: 'OTHERS' }] }))}
                                    className="h-9 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                                    <Plus size={12} /> 加一条规则
                                </button>

                                {/* 整串对应 */}
                                <div className="pt-2">
                                    <div className="text-[10px] font-black text-gray-500 uppercase mb-1.5">整串 SKU 直接对应（不走前缀）</div>
                                    <div className="space-y-1.5">
                                        {Object.entries(draft.exactRules).map(([k, v]) => (
                                            <div key={k} className="flex items-center gap-1.5">
                                                <input value={k}
                                                    onChange={e => setDraft(d => {
                                                        const next: Record<string, SalesCategoryId> = {};
                                                        Object.entries(d.exactRules).forEach(([kk, vv]) => { next[kk === k ? e.target.value.toUpperCase() : kk] = vv; });
                                                        return { ...d, exactRules: next };
                                                    })}
                                                    className="w-40 px-2 h-9 border border-gray-200 rounded-lg text-xs font-mono font-bold outline-none" />
                                                {catSelect(v, nv => setDraft(d => ({ ...d, exactRules: { ...d.exactRules, [k]: nv } })), 'flex-grow')}
                                                <button onClick={() => setDraft(d => {
                                                    const next = { ...d.exactRules }; delete next[k]; return { ...d, exactRules: next };
                                                })} className="w-9 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0"><Trash2 size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setDraft(d => ({ ...d, exactRules: { ...d.exactRules, [`新项目${Object.keys(d.exactRules).length + 1}`]: 'OTHERS' } }))}
                                        className="mt-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                                        <Plus size={12} /> 加一条
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ---------- 名称关键字 ---------- */}
                        {tab === 'KEYWORD' && (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                                    SKU 编号是 N/A 的产品（白饭、加冰块、荷包蛋…）靠<b>产品名称</b>归类。
                                    多个关键字用逗号分开，命中任何一个就算。由上往下比，第一个命中就停。
                                </div>
                                <div className="space-y-1.5">
                                    {draft.keywordRules.map((r, i) => (
                                        <div key={i} className="flex items-center gap-1.5">
                                            <input value={r.keywords.join(', ')}
                                                onChange={e => setDraft(d => ({
                                                    ...d,
                                                    keywordRules: d.keywordRules.map((x, j) => j === i ? { ...x, keywords: e.target.value.split(',').map(s => s.trim()) } : x),
                                                }))}
                                                placeholder="关键字，逗号分开"
                                                className="flex-grow min-w-0 px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]" />
                                            {catSelect(r.category, v => setDraft(d => ({
                                                ...d, keywordRules: d.keywordRules.map((x, j) => j === i ? { ...x, category: v } : x),
                                            })), 'w-44 shrink-0')}
                                            <button onClick={() => setDraft(d => ({ ...d, keywordRules: d.keywordRules.filter((_, j) => j !== i) }))}
                                                className="w-9 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setDraft(d => ({ ...d, keywordRules: [...d.keywordRules, { keywords: [], category: 'OTHERS' }] }))}
                                    className="h-9 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                                    <Plus size={12} /> 加一条
                                </button>
                            </>
                        )}

                        {/* ---------- 报表版面 ---------- */}
                        {tab === 'LAYOUT' && (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                                    决定报表上要摆哪几行、每行收哪些大类。
                                    <b>每个大类都必须被收进某一行</b>，否则那笔钱不会出现在报表上（下面的检查会提醒）。
                                    勾「在 SHOP LOT 下」的会缩排在 SHOP LOT SALES 底下。
                                </div>
                                {(['groupsSimple', 'groupsDetailed'] as const).map(key => (
                                    <div key={key} className="border border-gray-200 rounded-xl p-3">
                                        <div className="text-[11px] font-black text-stone-800 mb-2">
                                            {key === 'groupsSimple' ? '合计版面 (SIMPLE)' : '细分版面 (DETAILED)'}
                                        </div>
                                        <div className="space-y-2">
                                            {draft[key].map((g, i) => (
                                                <GroupEditor key={`${key}_${i}`} group={g}
                                                    onChange={ng => setDraft(d => ({ ...d, [key]: d[key].map((x, j) => (j === i ? ng : x)) }))}
                                                    onDelete={() => setDraft(d => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }))}
                                                    onMove={dir => setDraft(d => {
                                                        const list = [...d[key]]; const j = i + dir;
                                                        if (j < 0 || j >= list.length) return d;
                                                        [list[i], list[j]] = [list[j], list[i]];
                                                        return { ...d, [key]: list };
                                                    })} />
                                            ))}
                                        </div>
                                        <button onClick={() => setDraft(d => ({
                                            ...d, [key]: [...d[key], { id: `GROUP_${d[key].length + 1}`, label: '新行', members: ['OTHERS'] as SalesCategoryId[], underShopLot: false }],
                                        }))} className="mt-2 h-9 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                                            <Plus size={12} /> 加一行
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}

                        {/* ---------- 检查 ---------- */}
                        <div className="border border-gray-200 rounded-xl p-3">
                            <div className="text-[11px] font-black text-stone-800 mb-1.5">检查结果</div>
                            {issues.length === 0 ? (
                                <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> 没有发现问题</div>
                            ) : (
                                <div className="space-y-1">
                                    {issues.map((it, i) => (
                                        <div key={i} className={`text-[11px] font-bold flex items-start gap-1.5 ${it.level === 'ERROR' ? 'text-red-600' : 'text-orange-600'}`}>
                                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                            <span>{it.level === 'ERROR' ? '【严重】' : '【提醒】'}{it.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ---------- 试算 ---------- */}
                        <div className="border border-gray-200 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-black text-stone-800 flex items-center gap-1.5"><Play size={12} className="text-indigo-500" /> 试算（拿真实资料跑一遍，不会改到东西）</span>
                                <select value={previewMonth} onChange={e => setPreviewMonth(e.target.value)}
                                    className="px-2 h-8 border border-gray-200 rounded-lg text-[11px] font-bold bg-white outline-none">
                                    {months.length === 0 ? <option value="">还没导入月份</option>
                                        : months.map(m => <option key={m.month} value={m.month}>{m.month}</option>)}
                                </select>
                            </div>

                            {!preview ? (
                                <div className="text-[11px] text-gray-400 font-bold">选一个已导入的月份就能试算。</div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-500 font-bold">{preview.month} 共 {preview.rowCount} 笔产品</div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                        {Object.entries(preview.totals).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                                            <div key={c} className={`px-2 py-1.5 rounded-lg border text-[10px] ${c === 'UNCLASSIFIED' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                                                <div className="font-black text-stone-700 truncate">{catLabel(c as SalesCategoryId)}</div>
                                                <div className="font-mono font-black text-stone-900">{money(v)}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {preview.unclassified.length > 0 && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                                            <div className="text-[11px] font-black text-red-700 mb-1">归不了类：{preview.unclassified.length} 项</div>
                                            {preview.unclassified.slice(0, 8).map((u, i) => (
                                                <div key={i} className="text-[10px] text-red-700 font-mono">{u.code || '—'} · {u.name} · {money(u.amount)}</div>
                                            ))}
                                            {preview.unclassified.length > 8 && <div className="text-[10px] text-red-500">…还有 {preview.unclassified.length - 8} 项</div>}
                                        </div>
                                    )}

                                    {preview.changed.length > 0 && (
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                                            <div className="text-[11px] font-black text-indigo-800 mb-1">跟目前存的分类不一样：{preview.changed.length} 笔</div>
                                            {preview.changed.slice(0, 10).map((c, i) => (
                                                <div key={i} className="text-[10px] text-indigo-800">
                                                    <span className="font-mono">{c.code || '—'}</span> {c.name}：
                                                    <b> {SALES_CATEGORY_LABELS[c.from]?.zh || c.from} → {SALES_CATEGORY_LABELS[c.to]?.zh || c.to}</b> ({money(c.amount)})
                                                </div>
                                            ))}
                                            {preview.changed.length > 10 && <div className="text-[10px] text-indigo-500">…还有 {preview.changed.length - 10} 笔</div>}
                                        </div>
                                    )}

                                    {preview.changed.length === 0 && preview.unclassified.length === 0 && (
                                        <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> 这个月每一笔都归得了类，而且跟现在存的一样</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 md:p-5 border-t border-gray-100 flex flex-wrap items-center gap-2 shrink-0">
                    <button onClick={handleReset} className="h-11 px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black flex items-center gap-1.5">
                        <RotateCcw size={13} /> 还原内建
                    </button>
                    <button onClick={handleRecalcAll} disabled={recalcing || months.length === 0}
                        className="h-11 px-3 rounded-xl bg-white border border-gray-200 text-stone-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
                        {recalcing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 重算历史月份 ({months.length})
                    </button>
                    <div className="flex-grow" />
                    <button onClick={onClose} className="h-11 px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">取消</button>
                    <button onClick={handleSave} disabled={saving}
                        className="h-11 px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 保存规则
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 单一报表行的编辑器
// ==========================================
const GroupEditor: React.FC<{
    group: ReportGroup;
    onChange: (g: ReportGroup) => void;
    onDelete: () => void;
    onMove: (dir: -1 | 1) => void;
}> = ({ group, onChange, onDelete, onMove }) => {
    const toggleMember = (c: SalesCategoryId) => {
        const has = group.members.includes(c);
        onChange({ ...group, members: has ? group.members.filter(m => m !== c) : [...group.members, c] });
    };

    return (
        <div className="border border-gray-100 rounded-lg p-2 bg-gray-50/60">
            <div className="flex items-center gap-1.5 mb-1.5">
                <input value={group.label} onChange={e => onChange({ ...group, label: e.target.value })}
                    className="flex-grow min-w-0 px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-[#FFD200]" />
                <label className="flex items-center gap-1 px-2 h-9 bg-white border border-gray-200 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer">
                    <input type="checkbox" checked={group.underShopLot} onChange={e => onChange({ ...group, underShopLot: e.target.checked })} className="accent-stone-900" />
                    SHOP LOT 下
                </label>
                <button onClick={() => onMove(-1)} className="w-8 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 shrink-0"><ChevronUp size={12} /></button>
                <button onClick={() => onMove(1)} className="w-8 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 shrink-0"><ChevronDown size={12} /></button>
                <button onClick={onDelete} className="w-8 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0"><Trash2 size={12} /></button>
            </div>
            <div className="flex flex-wrap gap-1">
                {CATEGORY_IDS.map(c => {
                    const on = group.members.includes(c);
                    return (
                        <button key={c} onClick={() => toggleMember(c)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black border transition-all ${on ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-gray-400 border-gray-200'}`}>
                            {SALES_CATEGORY_LABELS[c]?.zh || c}
                        </button>
                    );
                })}
            </div>
            {group.children && group.children.length > 0 && (
                <div className="mt-1.5 pl-3 border-l-2 border-gray-200 space-y-1">
                    <div className="text-[9px] font-black text-gray-400 uppercase">细分子项（加起来要等于上面）</div>
                    {group.children.map((c, ci) => (
                        <div key={ci} className="flex items-center gap-1.5">
                            <input value={c.label}
                                onChange={e => onChange({ ...group, children: group.children!.map((x, j) => (j === ci ? { ...x, label: e.target.value } : x)) })}
                                className="w-36 px-2 h-8 border border-gray-200 rounded-lg text-[11px] font-bold bg-white outline-none" />
                            <div className="flex flex-wrap gap-1 flex-grow">
                                {group.members.map(m => {
                                    const on = c.members.includes(m);
                                    return (
                                        <button key={m}
                                            onClick={() => onChange({
                                                ...group,
                                                children: group.children!.map((x, j) => j === ci
                                                    ? { ...x, members: on ? x.members.filter(y => y !== m) : [...x.members, m] }
                                                    : x),
                                            })}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-400 border-gray-200'}`}>
                                            {SALES_CATEGORY_LABELS[m]?.zh || m}
                                        </button>
                                    );
                                })}
                            </div>
                            <button onClick={() => onChange({ ...group, children: group.children!.filter((_, j) => j !== ci) })}
                                className="w-8 h-8 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0"><Trash2 size={11} /></button>
                        </div>
                    ))}
                </div>
            )}
            <button onClick={() => onChange({ ...group, children: [...(group.children || []), { id: `SUB_${(group.children || []).length + 1}`, label: '子项', members: [] }] })}
                className="mt-1.5 h-7 px-2 bg-white border border-gray-200 rounded-lg text-[10px] font-black flex items-center gap-1">
                <Plus size={10} /> 加子项
            </button>
        </div>
    );
};

export default SalesRulesSettings;
