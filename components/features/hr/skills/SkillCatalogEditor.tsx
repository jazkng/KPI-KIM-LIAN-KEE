import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save, Loader2, Link2, Trash2, RotateCcw } from 'lucide-react';
import {
    DEFAULT_SKILL_ITEMS,
    SKILL_CATEGORIES,
    SkillItem,
    categoryLabel,
    itemsForCategory,
} from '../../../../constants/skillCatalog';
import type { JobCategory } from '../../assessmentConfig';
import { saveSkillCatalog } from './skillCatalogStore';

/**
 * ⚙️ 工作项目设定（只有老板 / 管理员）
 * - 改名、移出、新增
 * - 「共用」：把别的职位已有的项目加进来（分数共用，例如「看单」= 打荷 + 马王）
 * - 移出后如果不属于任何职位 → 停用（旧分数保留，不会删）
 */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    catalog: SkillItem[];
    updatedBy?: string;
}

const newId = () => `sk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const SkillCatalogEditor: React.FC<Props> = ({ isOpen, onClose, catalog, updatedBy }) => {
    const [draft, setDraft] = useState<SkillItem[]>(catalog);
    const [cat, setCat] = useState<JobCategory>(SKILL_CATEGORIES[0]);
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setDraft(catalog.map(i => ({ ...i, categories: [...i.categories] })));
            setNewName('');
        }
    }, [isOpen, catalog]);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    const items = useMemo(() => itemsForCategory(draft, cat), [draft, cat]);
    const shareable = useMemo(
        () => draft.filter(i => i.active !== false && !i.categories.includes(cat)),
        [draft, cat],
    );
    const dirty = JSON.stringify(draft) !== JSON.stringify(catalog);

    const patch = (id: string, fn: (i: SkillItem) => SkillItem) => setDraft(d => d.map(i => (i.id === id ? fn(i) : i)));

    const rename = (id: string, name: string) => patch(id, i => ({ ...i, name }));

    const removeFromCat = (id: string) =>
        patch(id, i => {
            const categories = i.categories.filter(c => c !== cat);
            return categories.length ? { ...i, categories } : { ...i, categories, active: false };
        });

    const addNew = () => {
        const name = newName.trim();
        if (!name) return;
        if (items.some(i => i.name === name)) {
            alert('⚠️ 这个职位已经有这个项目了');
            return;
        }
        // 同名的停用项目 → 重新启用（旧分数接回来）
        const old = draft.find(i => i.name === name && i.active === false);
        if (old) {
            patch(old.id, i => ({ ...i, active: undefined, categories: Array.from(new Set([...i.categories, cat])) }));
        } else {
            setDraft(d => [...d, { id: newId(), name, categories: [cat] }]);
        }
        setNewName('');
    };

    const share = (id: string) => {
        if (!id) return;
        patch(id, i => ({ ...i, categories: [...i.categories, cat] }));
    };

    const move = (id: string, dir: -1 | 1) => {
        setDraft(d => {
            const idxs = d.map((i, k) => (i.active !== false && i.categories.includes(cat) ? k : -1)).filter(k => k >= 0);
            const pos = idxs.findIndex(k => d[k].id === id);
            const swapPos = pos + dir;
            if (pos < 0 || swapPos < 0 || swapPos >= idxs.length) return d;
            const next = [...d];
            const a = idxs[pos];
            const b = idxs[swapPos];
            [next[a], next[b]] = [next[b], next[a]];
            return next;
        });
    };

    const handleSave = async () => {
        if (draft.some(i => i.active !== false && !i.name.trim())) {
            alert('⚠️ 有项目没有名称');
            return;
        }
        setSaving(true);
        try {
            await saveSkillCatalog(draft.map(i => ({ ...i, name: i.name.trim() })), updatedBy);
            onClose();
        } catch (err) {
            console.error(err);
            alert('❌ 保存失败，请检查网络后重试');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (!confirm('恢复成系统预设清单？\n你新增的项目会被停用（分数保留）。')) return;
        const defaults = new Map(DEFAULT_SKILL_ITEMS.map(i => [i.id, i]));
        setDraft([
            ...DEFAULT_SKILL_ITEMS.map(i => ({ ...i, categories: [...i.categories] })),
            ...draft.filter(i => !defaults.has(i.id)).map(i => ({ ...i, active: false as const })),
        ]);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm" onClick={() => !saving && onClose()}>
            <div
                className="bg-[#F6F7FB] w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col"
                style={{ maxHeight: '92dvh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                    <div>
                        <h3 className="text-base font-black text-[#111111]">⚙️ 工作项目设定</h3>
                        <p className="text-[10px] font-bold text-gray-400">每个职位 3–5 项，写「看得到的实际工作」</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 bg-white border border-gray-200 active:scale-90" aria-label="关闭">
                        <X size={18} />
                    </button>
                </div>

                {/* 职位类别 */}
                <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 shrink-0 scrollbar-hide">
                    {SKILL_CATEGORIES.map(c => {
                        const n = itemsForCategory(draft, c).length;
                        return (
                            <button
                                key={c}
                                onClick={() => setCat(c)}
                                className={`shrink-0 px-3 rounded-xl text-xs font-black border min-h-[40px] whitespace-nowrap ${
                                    cat === c ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : 'bg-white text-gray-600 border-gray-200'
                                }`}
                            >
                                {categoryLabel(c)} <span className="opacity-60">{n}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="overflow-y-auto overscroll-contain px-4 pb-4 space-y-2 flex-1 min-h-0">
                    {items.length === 0 && <p className="text-xs font-bold text-gray-400 text-center py-6">这个职位还没有项目</p>}
                    {items.map((item, k) => {
                        const others = item.categories.filter(c => c !== cat);
                        return (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-2.5">
                                <div className="flex items-center gap-1.5">
                                    <div className="flex flex-col shrink-0">
                                        <button onClick={() => move(item.id, -1)} disabled={k === 0} className="w-8 h-6 text-gray-400 disabled:opacity-20 text-xs" aria-label="上移">▲</button>
                                        <button onClick={() => move(item.id, 1)} disabled={k === items.length - 1} className="w-8 h-6 text-gray-400 disabled:opacity-20 text-xs" aria-label="下移">▼</button>
                                    </div>
                                    <input
                                        value={item.name}
                                        onChange={e => rename(item.id, e.target.value)}
                                        className="flex-1 min-w-0 px-3 rounded-lg border border-gray-200 font-bold outline-none focus:border-[#111111]"
                                        style={{ fontSize: '16px', minHeight: '44px' }}
                                    />
                                    <button onClick={() => removeFromCat(item.id)} className="w-11 h-11 shrink-0 rounded-lg flex items-center justify-center text-red-500 bg-red-50 border border-red-100 active:scale-90" aria-label="移出">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                {others.length > 0 && (
                                    <p className="text-[10px] font-bold text-blue-600 mt-1.5 ml-9 flex items-center gap-1 flex-wrap">
                                        <Link2 size={10} /> 共用：{others.map(c => categoryLabel(c)).join('、')}（改名会一起改）
                                    </p>
                                )}
                            </div>
                        );
                    })}

                    {/* 新增 */}
                    <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-2.5 space-y-2">
                        <div className="flex gap-1.5">
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addNew();
                                    }
                                }}
                                placeholder="新增项目，例如：外卖打包"
                                className="flex-1 min-w-0 px-3 rounded-lg border border-gray-200 font-bold outline-none focus:border-[#111111]"
                                style={{ fontSize: '16px', minHeight: '44px' }}
                            />
                            <button onClick={addNew} className="px-3 rounded-lg bg-[#FFD200] text-black font-black shrink-0 active:scale-95 flex items-center gap-1 min-h-[44px]">
                                <Plus size={16} /> 加
                            </button>
                        </div>
                        {shareable.length > 0 && (
                            <select
                                value=""
                                onChange={e => share(e.target.value)}
                                className="w-full px-3 rounded-lg border border-gray-200 bg-white font-bold text-gray-600 outline-none"
                                style={{ fontSize: '16px', minHeight: '44px' }}
                            >
                                <option value="">🔗 从其他职位加入（分数共用）…</option>
                                {shareable.map(i => (
                                    <option key={i.id} value={i.id}>
                                        {i.name} —— {i.categories.map(c => categoryLabel(c).split(' ').slice(1).join(' ')).join('、')}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <div className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0 md:rounded-b-2xl flex gap-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                    <button onClick={handleReset} disabled={saving} className="px-3 rounded-xl border border-gray-200 text-gray-600 font-black text-xs flex items-center gap-1 min-h-[52px] active:scale-95">
                        <RotateCcw size={14} /> 预设
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className="flex-1 bg-[#111111] text-[#FFD200] rounded-xl font-black text-base flex items-center justify-center gap-2 min-h-[52px] active:scale-[0.98] disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 保存清单
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default SkillCatalogEditor;
