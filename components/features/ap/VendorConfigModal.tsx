// ==========================================
// 🗂️ 供应商归档设定
// ------------------------------------------
// 以前 AI 服务的供应商清单和别名表写死在 api-server.js 里，
// 加一家供应商就要改代码 + 重新部署 Cloud Run。
// 现在存成 Drive 上的 JSON，这里改完立即生效。
//
// ⚠️ 设定存在 Firestore，不存 Drive —— Service Account 没有 Drive 储存配额，
//    在 Drive 建有内容的档案一定失败（只有资料夹能建，因为是 0 bytes）。
// ⚠️ 清单空了不给存 —— 空清单代表所有账单都掉进零用金。
// ==========================================

import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Plus, Trash2, Search, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { DataManager } from '../../../utils/dataManager';

interface SupplierRow {
    id: string;
    folderName: string;
    keywords: string[];
}
interface AliasRow {
    match: string[];
    name: string;
    supplierId: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** 复用 AccountsPayableModule 里的 requestApAi */
    request: (path: string, init?: RequestInit) => Promise<{ payload: any }>;
    /** 保存后通知外层重新载入设定 */
    onSaved?: () => void;
}

export const VendorConfigModal: React.FC<Props> = ({ isOpen, onClose, request, onSaved }) => {
    const [tab, setTab] = useState<'SUPPLIERS' | 'ALIASES'>('SUPPLIERS');
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [aliases, setAliases] = useState<AliasRow[]>([]);
    const [builtin, setBuiltin] = useState<{ suppliers: any; aliases: any } | null>(null);
    const [source, setSource] = useState<string>('');
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        setLoadError('');
        // 内建表跟 AI 服务拿（当「还原内建」的基准），自订设定从 Firestore 拿
        Promise.all([
            request('/api/vendor-config'),
            DataManager.getApVendorConfig(),
        ])
            .then(([{ payload }, saved]) => {
                const builtinSuppliers = payload.builtinSuppliers || {};
                const builtinAliases = payload.builtinAliases || [];
                setBuiltin({ suppliers: builtinSuppliers, aliases: builtinAliases });

                const useSuppliers = saved?.suppliers && Object.keys(saved.suppliers).length > 0
                    ? saved.suppliers : builtinSuppliers;
                const useAliases = Array.isArray(saved?.aliases) && saved.aliases.length > 0
                    ? saved.aliases : builtinAliases;

                setSuppliers(Object.entries(useSuppliers).map(([id, cfg]: any) => ({
                    id, folderName: cfg.folderName, keywords: cfg.keywords || [],
                })).sort((a, b) => a.id.localeCompare(b.id)));
                setAliases(useAliases.map((a: any) => ({
                    match: a.match || [], name: a.name || '', supplierId: a.supplierId || '',
                })));
                setSource(saved?.suppliers ? 'custom' : 'builtin');
            })
            .catch(err => setLoadError(err?.message || '读取失败'))
            .finally(() => setLoading(false));
    }, [isOpen]);

    const filteredSuppliers = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        if (!q) return suppliers;
        return suppliers.filter(s =>
            s.id.includes(q) || s.folderName.toLowerCase().includes(q) ||
            s.keywords.some(k => k.toLowerCase().includes(q))
        );
    }, [suppliers, keyword]);

    /** 同一个 ID 出现两次 / 资料夹名重复 —— 会归错档 */
    const issues = useMemo(() => {
        const out: string[] = [];
        const idSeen: Record<string, number> = {};
        const folderSeen: Record<string, number> = {};
        suppliers.forEach(s => {
            idSeen[s.id] = (idSeen[s.id] || 0) + 1;
            folderSeen[s.folderName] = (folderSeen[s.folderName] || 0) + 1;
            if (!/^\d{3,6}$/.test(s.id)) out.push(`ID「${s.id}」不是 3–6 位数字，保存时会被丢掉`);
            if (!s.folderName.trim()) out.push(`ID ${s.id} 没有资料夹名，保存时会被丢掉`);
            if (s.keywords.filter(Boolean).length === 0) out.push(`ID ${s.id} 没有任何关键字，永远配不到`);
        });
        Object.entries(idSeen).forEach(([id, n]) => { if (n > 1) out.push(`ID ${id} 重复 ${n} 次`); });
        Object.entries(folderSeen).forEach(([f, n]) => { if (n > 1 && f) out.push(`资料夹名「${f}」重复 ${n} 次`); });
        // 同一个关键字放在两家 → 归档时会互抢
        const kwOwner: Record<string, string> = {};
        suppliers.forEach(s => s.keywords.forEach(k => {
            const key = k.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]/g, '');
            if (!key) return;
            if (kwOwner[key] && kwOwner[key] !== s.id) out.push(`关键字「${k.trim()}」同时在 ${kwOwner[key]} 和 ${s.id}，会互抢`);
            else kwOwner[key] = s.id;
        }));
        return out;
    }, [suppliers]);

    if (!isOpen) return null;

    const handleSave = async () => {
        const body = {
            suppliers: Object.fromEntries(
                suppliers
                    .filter(s => /^\d{3,6}$/.test(s.id) && s.folderName.trim() && s.keywords.filter(Boolean).length > 0)
                    .map(s => [s.id, { folderName: s.folderName.trim(), keywords: s.keywords.map(k => k.trim()).filter(Boolean) }])
            ),
            aliases: aliases
                .filter(a => a.name.trim() && a.match.filter(Boolean).length > 0)
                .map(a => ({ match: a.match.map(m => m.trim()).filter(Boolean), name: a.name.trim(), supplierId: a.supplierId.trim() })),
        };
        if (Object.keys(body.suppliers).length === 0) {
            alert('供应商清单是空的，不给保存 —— 空清单等于所有账单都掉进零用金。');
            return;
        }
        setSaving(true);
        try {
            await DataManager.saveApVendorConfig({ ...body, updatedAt: new Date().toISOString() });
            alert(`✅ 已保存：${Object.keys(body.suppliers).length} 家供应商、${body.aliases.length} 条别名。下次扫描与归档立即生效。`);
            onSaved?.();
            onClose();
        } catch (err: any) {
            alert(`保存失败：${err?.message || '未知错误'}`);
        } finally {
            setSaving(false);
        }
    };

    const restoreBuiltin = () => {
        if (!builtin) return;
        if (!confirm('用代码里的内建清单覆盖目前编辑中的内容？（还没按保存前不影响线上）')) return;
        setSuppliers(Object.entries(builtin.suppliers || {}).map(([id, cfg]: any) => ({
            id, folderName: cfg.folderName, keywords: cfg.keywords || [],
        })).sort((a, b) => a.id.localeCompare(b.id)));
        setAliases((builtin.aliases || []).map((a: any) => ({ match: a.match || [], name: a.name || '', supplierId: a.supplierId || '' })));
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[190] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-4xl md:rounded-3xl rounded-t-3xl max-h-[94vh] flex flex-col shadow-2xl">

                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="font-black text-base text-stone-900">供应商归档设定</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {source === 'custom'
                                ? `目前用自订设定 · ${suppliers.length} 家 · ${aliases.length} 条别名`
                                : '目前用代码内建的清单（还没保存过自订设定）'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
                </div>

                <div className="px-4 md:px-5 pt-3 flex gap-1.5 shrink-0">
                    {([['SUPPLIERS', `供应商清单 (${suppliers.length})`], ['ALIASES', `别名 (${aliases.length})`]] as const).map(([id, label]) => (
                        <button key={id} onClick={() => setTab(id as any)}
                            className={`px-3 h-9 rounded-xl text-xs font-black ${tab === id ? 'bg-stone-900 text-[#FFD200]' : 'bg-gray-100 text-gray-600'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex-grow flex items-center justify-center py-20"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : loadError ? (
                    <div className="flex-grow flex items-center justify-center py-20 px-6 text-center">
                        <div>
                            <AlertTriangle className="mx-auto text-red-500 mb-2" />
                            <p className="text-xs font-bold text-red-700">读取失败：{loadError}</p>
                            <p className="text-[11px] text-gray-500 mt-1">AI 服务可能还没部署这个版本。</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-grow overflow-auto px-4 md:px-5 py-3 space-y-2">
                        {tab === 'SUPPLIERS' && (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                                    关键字比对会<b>忽略大小写、空格、括号、标点</b>，所以「FULLY FISHERY」就能配到「Fully Fishery (M) Sdn Bhd」。
                                    资料夹名前面的 4 位数字会自动去掉当作档名的供应商片段。
                                </div>
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜 ID / 资料夹 / 关键字…"
                                        className="w-full pl-9 pr-3 h-10 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]" />
                                </div>
                                {filteredSuppliers.map((sup) => {
                                    const realIdx = suppliers.findIndex(x => x === sup);
                                    return (
                                        <div key={realIdx} className="border border-gray-200 rounded-xl p-2.5 grid grid-cols-1 md:grid-cols-[80px_1fr_1fr_36px] gap-2 items-start">
                                            <input value={sup.id}
                                                onChange={e => setSuppliers(p => p.map((x, i) => i === realIdx ? { ...x, id: e.target.value } : x))}
                                                placeholder="8204"
                                                className="px-2 h-9 border border-gray-200 rounded-lg text-xs font-mono font-bold outline-none" />
                                            <input value={sup.folderName}
                                                onChange={e => setSuppliers(p => p.map((x, i) => i === realIdx ? { ...x, folderName: e.target.value } : x))}
                                                placeholder="8204_FULLY_FISHERY_M_SDN_BHD"
                                                className="px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none" />
                                            <input value={sup.keywords.join(', ')}
                                                onChange={e => setSuppliers(p => p.map((x, i) => i === realIdx ? { ...x, keywords: e.target.value.split(',') } : x))}
                                                placeholder="关键字，逗号分开"
                                                className="px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none" />
                                            <button onClick={() => setSuppliers(p => p.filter((_, i) => i !== realIdx))}
                                                className="w-9 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500"><Trash2 size={12} /></button>
                                        </div>
                                    );
                                })}
                                <button onClick={() => setSuppliers(p => [...p, { id: '', folderName: '', keywords: [] }])}
                                    className="h-9 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                                    <Plus size={12} /> 加一家供应商
                                </button>
                            </>
                        )}

                        {tab === 'ALIASES' && (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                                    AI 每次读出来的写法不一样（MR DIY / MR D.I.Y / Ong Tuang Chuan），这里统一成正式名称。
                                    比对同样忽略大小写和标点。
                                </div>
                                {aliases.map((a, i) => (
                                    <div key={i} className="border border-gray-200 rounded-xl p-2.5 grid grid-cols-1 md:grid-cols-[1fr_1fr_80px_36px] gap-2">
                                        <input value={a.match.join(', ')}
                                            onChange={e => setAliases(p => p.map((x, j) => j === i ? { ...x, match: e.target.value.split(',') } : x))}
                                            placeholder="要抓的写法，逗号分开"
                                            className="px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none" />
                                        <input value={a.name}
                                            onChange={e => setAliases(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                                            placeholder="统一成的正式名称"
                                            className="px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none" />
                                        <input value={a.supplierId}
                                            onChange={e => setAliases(p => p.map((x, j) => j === i ? { ...x, supplierId: e.target.value } : x))}
                                            placeholder="ID"
                                            className="px-2 h-9 border border-gray-200 rounded-lg text-xs font-mono outline-none" />
                                        <button onClick={() => setAliases(p => p.filter((_, j) => j !== i))}
                                            className="w-9 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500"><Trash2 size={12} /></button>
                                    </div>
                                ))}
                                <button onClick={() => setAliases(p => [...p, { match: [], name: '', supplierId: '' }])}
                                    className="h-9 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                                    <Plus size={12} /> 加一条别名
                                </button>
                            </>
                        )}

                        <div className="border border-gray-200 rounded-xl p-3">
                            <div className="text-[11px] font-black text-stone-800 mb-1.5">检查结果</div>
                            {issues.length === 0 ? (
                                <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> 没有发现问题</div>
                            ) : (
                                issues.map((it, i) => (
                                    <div key={i} className="text-[11px] text-orange-600 font-bold flex items-start gap-1.5">
                                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />{it}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 md:p-5 border-t border-gray-100 flex items-center gap-2 shrink-0">
                    <button onClick={restoreBuiltin} disabled={!builtin}
                        className="h-11 px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
                        <RotateCcw size={13} /> 还原内建
                    </button>
                    <div className="flex-grow" />
                    <button onClick={onClose} className="h-11 px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">取消</button>
                    <button onClick={handleSave} disabled={saving || loading || !!loadError}
                        className="h-11 px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 保存并生效
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VendorConfigModal;
