// ==========================================
// 🎓 技能总表 + 批量录入
// ------------------------------------------
// 一页看完谁 L1 谁 L4，也可以直接在这里一次过把全部人的等级打进系统，
// 不用一个个点进员工档案。改完按「保存」才写进去（只写有改动的人）。
// ==========================================

import React, { useState, useMemo } from 'react';
import { X, Search, Save, Loader2, Grid3x3, RotateCcw, Archive } from 'lucide-react';
import { Employee } from '../../../types';
import { DataManager } from '../../../utils/dataManager';
import { SKILL_LEVELS } from '../../../constants/hrSkill';
import { HR_DEPARTMENTS } from './HRExportDialog';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employees: Employee[];
    onSave: (employees: Employee[]) => void;
}

/** 未评级也要有个格子放，排在四个等级后面 */
const UNRATED = 0;

export const HRSkillMatrix: React.FC<Props> = ({ isOpen, onClose, employees, onSave }) => {
    /** 草稿：empId → 等级(1-4) 或 0(未评)。只放「改过的人」 */
    const [draft, setDraft] = useState<Record<string, number>>({});
    const [search, setSearch] = useState('');
    const [showResigned, setShowResigned] = useState(false);
    const [filterLevel, setFilterLevel] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);

    const deptOf = (e: Employee) => (e.department && HR_DEPARTMENTS.some(d => d.id === e.department) ? e.department : 'OTHER');

    /** 画面上该显示的等级：草稿优先，没改过就看档案 */
    const levelOf = (e: Employee): number => (draft[e.id] !== undefined ? draft[e.id] : (e.skillLevel || UNRATED));

    const visible = useMemo(() => {
        const kw = search.trim().toLowerCase();
        return employees
            .filter(e => (showResigned ? true : !e.isArchived))
            .filter(e => !kw || e.name?.toLowerCase().includes(kw) || String(e.id).includes(kw))
            .sort((a, b) => {
                const da = HR_DEPARTMENTS.findIndex(d => d.id === deptOf(a));
                const db = HR_DEPARTMENTS.findIndex(d => d.id === deptOf(b));
                if (da !== db) return da - db;
                return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
            });
    }, [employees, search, showResigned]);

    /** 统计条：每个等级几人（不受 filterLevel 影响，不然点了就看不到别的数字） */
    const counts = useMemo(() => {
        const m: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
        visible.forEach(e => { m[levelOf(e)] = (m[levelOf(e)] || 0) + 1; });
        return m;
    }, [visible, draft]);

    const groups = useMemo(() => {
        const rows = filterLevel === null ? visible : visible.filter(e => levelOf(e) === filterLevel);
        return HR_DEPARTMENTS
            .map(d => ({ id: d.id, label: d.label, rows: rows.filter(e => deptOf(e) === d.id) }))
            .filter(g => g.rows.length > 0);
    }, [visible, filterLevel, draft]);

    /** 真正有变动的人（草稿值 !== 档案值） */
    const changed = useMemo(() => {
        return Object.entries(draft).filter(([id, lv]) => {
            const emp = employees.find(e => e.id === id);
            if (!emp) return false;
            return (emp.skillLevel || UNRATED) !== lv;
        });
    }, [draft, employees]);

    if (!isOpen) return null;

    const setLevel = (empId: string, lv: number) => {
        setDraft(prev => {
            const next = { ...prev };
            // 再点一次同一级 = 清掉（变回未评）
            const cur = next[empId] !== undefined ? next[empId] : (employees.find(e => e.id === empId)?.skillLevel || UNRATED);
            next[empId] = cur === lv ? UNRATED : lv;
            return next;
        });
    };

    const handleSave = async () => {
        if (changed.length === 0) return;
        if (!confirm(`确定把 ${changed.length} 位员工的技能等级存进系统？\n（只会写这 ${changed.length} 笔，没改动的人不动）`)) return;
        setBusy(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const updatedList = employees.map(e => {
                const hit = changed.find(([id]) => id === e.id);
                if (!hit) return e;
                const lv = hit[1];
                return lv === UNRATED
                    ? ({ ...e, skillLevel: undefined, skillLevelDate: undefined } as Employee)
                    : ({ ...e, skillLevel: lv as 1 | 2 | 3 | 4, skillLevelDate: today } as Employee);
            });
            const toWrite = updatedList.filter(e => changed.some(([id]) => id === e.id));
            await Promise.all(toWrite.map(e => DataManager.saveEmployee(e)));
            onSave(updatedList);
            setDraft({});
            alert(`✅ 已保存 ${toWrite.length} 位员工的技能等级`);
        } catch (err: any) {
            console.error('技能等级批量保存失败', err);
            alert(`❌ 保存失败：${err?.message || '未知错误'}\n（可能有部分已经写进去了，请重新打开这个画面核对）`);
        } finally {
            setBusy(false);
        }
    };

    const handleClose = () => {
        if (changed.length > 0 && !confirm(`还有 ${changed.length} 个改动没保存，确定关掉？改动会丢失。`)) return;
        setDraft({});
        onClose();
    };

    const STAT_CELLS = [
        { lv: UNRATED, label: '未评', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
        ...SKILL_LEVELS.map(s => ({ lv: s.level as number, label: `L${s.level} ${s.zh}`, cls: s.cls })),
    ];

    return (
        <div className="fixed inset-0 bg-black/60 z-[170] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-5xl md:rounded-3xl rounded-t-3xl max-h-[94vh] flex flex-col shadow-2xl">

                {/* 标题 */}
                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-black text-base text-stone-900 flex items-center gap-2">
                            <Grid3x3 size={17} className="text-[#FFD200]" /> 技能总表 / 批量录入
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {visible.length} 人 · 点等级直接改，改完按保存
                            {changed.length > 0 && <b className="text-orange-600"> · {changed.length} 个未保存</b>}
                        </p>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex justify-center items-center shrink-0"><X size={18} /></button>
                </div>

                {/* 统计 + 搜索 */}
                <div className="px-4 md:px-5 py-3 border-b border-gray-100 shrink-0 space-y-3">
                    <div className="grid grid-cols-5 gap-1.5">
                        {STAT_CELLS.map(c => {
                            const on = filterLevel === c.lv;
                            return (
                                <button key={c.lv} onClick={() => setFilterLevel(on ? null : c.lv)}
                                    className={`rounded-xl border px-1 py-2 text-center transition-all active:scale-95 ${c.cls} ${on ? 'ring-2 ring-offset-1 ring-stone-500' : 'opacity-90'}`}>
                                    <div className="text-base font-black tabular-nums leading-none">{counts[c.lv] || 0}</div>
                                    <div className="text-[9px] font-black mt-1 leading-tight">{c.label}</div>
                                </button>
                            );
                        })}
                    </div>
                    {filterLevel !== null && (
                        <button onClick={() => setFilterLevel(null)} className="text-[10px] font-black text-indigo-600 flex items-center gap-1">
                            <RotateCcw size={11} /> 取消筛选，看全部
                        </button>
                    )}
                    <div className="flex flex-col md:flex-row gap-2">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名 / 工号..."
                                className="w-full pl-9 pr-3 bg-gray-100 rounded-xl font-bold text-stone-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#FFD200]/40"
                                style={{ fontSize: '16px', minHeight: '44px' }} />
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer select-none px-1 min-h-[44px]">
                            <input type="checkbox" checked={showResigned} onChange={e => setShowResigned(e.target.checked)} className="w-4 h-4 rounded accent-[#111111]" />
                            <Archive size={13} /> 含离职
                        </label>
                    </div>
                </div>

                {/* 名单 */}
                <div className="flex-grow overflow-auto px-4 md:px-5 py-3 space-y-5">
                    {groups.length === 0 && (
                        <div className="text-center py-10 text-gray-400 text-xs font-bold">没有符合条件的员工</div>
                    )}
                    {groups.map(g => (
                        <div key={g.id}>
                            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur py-1 mb-1.5 flex items-center justify-between">
                                <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">{g.label}</span>
                                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[10px] font-bold">{g.rows.length}</span>
                            </div>
                            <div className="space-y-1.5">
                                {g.rows.map(e => {
                                    const lv = levelOf(e);
                                    const isDirty = draft[e.id] !== undefined && (e.skillLevel || UNRATED) !== draft[e.id];
                                    return (
                                        <div key={e.id}
                                            className={`rounded-xl border px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-2 transition-all ${
                                                isDirty ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200 bg-white'
                                            } ${e.isArchived ? 'opacity-60' : ''}`}>

                                            {/* 人 */}
                                            <div className="min-w-0 flex-1 flex items-center gap-2">
                                                <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-black bg-gray-100 text-gray-500 border border-gray-200">{e.id}</span>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-black text-stone-900 truncate">{e.name}</div>
                                                    <div className="text-[10px] font-bold text-gray-400 truncate">
                                                        {e.role || '-'}
                                                        {(e.secondaryRoles || []).length > 0 && <span className="text-gray-300"> · 副职 {(e.secondaryRoles || []).join('、')}</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 四个等级按钮 */}
                                            <div className="grid grid-cols-4 gap-1 md:flex md:gap-1 shrink-0">
                                                {SKILL_LEVELS.map(s => {
                                                    const on = lv === s.level;
                                                    return (
                                                        <button key={s.level} onClick={() => setLevel(e.id, s.level)}
                                                            title={`${s.zh} (${s.en}) — ${s.desc}`}
                                                            className={`rounded-lg border text-[11px] font-black transition-all active:scale-95 px-2 ${
                                                                on ? s.cls + ' ring-2 ring-offset-1 ring-stone-400' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                                                            }`}
                                                            style={{ minHeight: '40px', minWidth: '44px' }}>
                                                            L{s.level}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 底部 */}
                <div className="p-4 md:p-5 border-t border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="text-[11px] text-gray-500 font-bold flex-grow min-w-0">
                        {changed.length === 0
                            ? <>没有改动</>
                            : <>有 <b className="text-orange-600">{changed.length}</b> 位员工要更新（只写这几笔）</>}
                    </div>
                    <button onClick={handleClose} className="h-11 px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-black shrink-0">关闭</button>
                    <button onClick={handleSave} disabled={busy || changed.length === 0}
                        className="h-11 px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40 shrink-0">
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HRSkillMatrix;
