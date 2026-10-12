import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save, Loader2, Trash2, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import type { Employee } from '../../../types';
import { DIVISION_COLORS, DivisionColor, OrgDivision, newDivision } from '../../../utils/orgDivisions';
import { DEPT_META, OPS_DEPTS } from '../../../utils/orgChartModel';

/**
 * ✏️ 编辑管理层板块：名称、颜色、负责人（可多个）、管哪些部门
 * 部门主管跟员工不用在这里设 —— 他们按员工档案的「组织层级 / 管理部门 / 工作部门」自动排进对应板块。
 */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initial: OrgDivision[];
    /** 自动产生的建议（「重新自动产生」用） */
    suggested: OrgDivision[];
    employees: Employee[];
    onSave: (list: OrgDivision[]) => Promise<void>;
}

const field = 'w-full px-3 rounded-xl border border-gray-200 bg-white font-bold outline-none focus:border-[#0B3B8C]';

export const DivisionEditor: React.FC<Props> = ({ isOpen, onClose, initial, suggested, employees, onSave }) => {
    const [list, setList] = useState<OrgDivision[]>(initial);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) setList(initial.map(d => ({ ...d, leaderIds: [...d.leaderIds], depts: [...d.depts] })));
    }, [isOpen, initial]);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const patch = (id: string, fn: (d: OrgDivision) => OrgDivision) => setList(l => l.map(d => (d.id === id ? fn(d) : d)));
    const move = (i: number, dir: -1 | 1) =>
        setList(l => {
            const j = i + dir;
            if (j < 0 || j >= l.length) return l;
            const n = [...l];
            [n[i], n[j]] = [n[j], n[i]];
            return n;
        });
    const sortedEmps = [...employees].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const deptOwner = (d: string, selfId: string) => list.find(x => x.id !== selfId && x.depts.includes(d));

    const handleSave = async () => {
        if (list.some(d => !d.nameZh.trim() && !d.nameEn.trim())) {
            alert('⚠️ 有板块没有名称');
            return;
        }
        setSaving(true);
        try {
            await onSave(list.map(d => ({ ...d, nameZh: d.nameZh.trim(), nameEn: d.nameEn.trim() })));
            onClose();
        } catch (e) {
            console.error(e);
            alert('❌ 保存失败，请检查网络后重试');
        } finally {
            setSaving(false);
        }
    };

    const swatches = (value: DivisionColor | undefined, onPick: (c: DivisionColor) => void, allowNone?: boolean) => (
        <div className="flex flex-wrap gap-1.5">
            {allowNone && (
                <button type="button" onClick={() => onPick(undefined as any)} className={`h-9 px-2 rounded-lg border-2 text-[11px] font-black ${!value ? 'border-[#111111]' : 'border-gray-200 text-gray-400'}`}>
                    同上
                </button>
            )}
            {(Object.keys(DIVISION_COLORS) as DivisionColor[]).map(c => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onPick(c)}
                    aria-label={DIVISION_COLORS[c].label}
                    className={`w-9 h-9 rounded-lg border-2 ${value === c ? 'border-[#111111] scale-110' : 'border-white'} transition-transform`}
                    style={{ background: DIVISION_COLORS[c].solid }}
                />
            ))}
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm" onClick={() => !saving && onClose()}>
            <div className="bg-[#F6F7FB] w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '92dvh' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                    <div>
                        <h3 className="text-base font-black text-[#111111]">✏️ 编辑管理层板块</h3>
                        <p className="text-[10px] font-bold text-gray-400">负责人可以多个（例如 BEN / VENICE）；部门主管和员工按员工档案自动排进来</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 bg-white border border-gray-200 active:scale-90" aria-label="关闭">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto overscroll-contain px-4 pb-4 space-y-3 flex-1 min-h-0">
                    {list.map((d, i) => {
                        const col = DIVISION_COLORS[d.color];
                        return (
                            <div key={d.id} className="bg-white rounded-2xl border-2 p-3 space-y-3" style={{ borderColor: col.border }}>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-8 rounded-full shrink-0" style={{ background: col.solid }} />
                                    <input value={d.nameZh} onChange={e => patch(d.id, x => ({ ...x, nameZh: e.target.value }))} placeholder="中文名称，例如 厨房管理" className={field} style={{ fontSize: 16, minHeight: 44 }} />
                                    <div className="flex flex-col shrink-0">
                                        <button onClick={() => move(i, -1)} disabled={i === 0} className="w-9 h-[22px] text-gray-400 disabled:opacity-20" aria-label="上移">
                                            <ChevronUp size={16} className="mx-auto" />
                                        </button>
                                        <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="w-9 h-[22px] text-gray-400 disabled:opacity-20" aria-label="下移">
                                            <ChevronDown size={16} className="mx-auto" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => confirm(`删除「${d.nameZh || d.nameEn}」板块？（员工资料不会被删）`) && setList(l => l.filter(x => x.id !== d.id))}
                                        className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-red-500 bg-red-50 border border-red-100 active:scale-90"
                                        aria-label="删除板块"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <input value={d.nameEn} onChange={e => patch(d.id, x => ({ ...x, nameEn: e.target.value }))} placeholder="English, e.g. Kitchen Management" className={field} style={{ fontSize: 16, minHeight: 44 }} />

                                <div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">负责人（可多选）</div>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {d.leaderIds.map(id => {
                                            const e = employees.find(x => x.id === id);
                                            return (
                                                <span key={id} className="inline-flex items-center gap-1 pl-3 pr-1 rounded-full text-sm font-black text-white" style={{ background: col.solid, minHeight: 36 }}>
                                                    {e?.name || id}
                                                    <button onClick={() => patch(d.id, x => ({ ...x, leaderIds: x.leaderIds.filter(y => y !== id) }))} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/25" aria-label="移除">
                                                        <X size={13} />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                        {d.leaderIds.length === 0 && <span className="text-xs font-bold text-gray-400 py-2">还没有负责人</span>}
                                    </div>
                                    <select
                                        value=""
                                        onChange={e => e.target.value && patch(d.id, x => ({ ...x, leaderIds: [...x.leaderIds, e.target.value] }))}
                                        className={field}
                                        style={{ fontSize: 16, minHeight: 44 }}
                                    >
                                        <option value="">+ 加负责人…</option>
                                        {sortedEmps
                                            .filter(e => !d.leaderIds.includes(e.id))
                                            .map(e => (
                                                <option key={e.id} value={e.id}>
                                                    {e.name}（{(e.role || '').split('(')[0].trim()}）
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                <div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">管理的部门（没有部门的板块，例如市场、人事，可以不选）</div>
                                    <div className="flex flex-wrap gap-2">
                                        {OPS_DEPTS.map(dep => {
                                            const on = d.depts.includes(dep);
                                            const other = !on ? deptOwner(dep, d.id) : undefined;
                                            return (
                                                <button
                                                    key={dep}
                                                    type="button"
                                                    onClick={() => {
                                                        if (other && !confirm(`「${DEPT_META[dep].zh}」现在在「${other.nameZh || other.nameEn}」，要移到这个板块吗？`)) return;
                                                        setList(l =>
                                                            l.map(x =>
                                                                x.id === d.id
                                                                    ? { ...x, depts: on ? x.depts.filter(y => y !== dep) : [...x.depts, dep] }
                                                                    : other && x.id === other.id
                                                                      ? { ...x, depts: x.depts.filter(y => y !== dep) }
                                                                      : x,
                                                            ),
                                                        );
                                                    }}
                                                    className="px-3 rounded-xl border-2 font-black text-sm active:scale-95"
                                                    style={{ minHeight: 44, background: on ? col.solid : '#fff', color: on ? '#fff' : '#57534E', borderColor: on ? col.solid : '#E7E5E4' }}
                                                >
                                                    {DEPT_META[dep].emoji} {DEPT_META[dep].zh}
                                                    {other && <span className="text-[10px] font-bold opacity-60 ml-1">（{other.nameZh || other.nameEn}）</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">板块颜色</div>
                                        {swatches(d.color, c => patch(d.id, x => ({ ...x, color: c })))}
                                    </div>
                                    {d.depts.length > 0 && (
                                        <div>
                                            <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">部门面板颜色</div>
                                            {swatches(d.panelColor, c => patch(d.id, x => ({ ...x, panelColor: c || undefined })), true)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    <button
                        onClick={() => setList(l => [...l, newDivision(l.length)])}
                        className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-white text-gray-600 font-black text-sm flex items-center justify-center gap-2 active:scale-[0.99]"
                        style={{ minHeight: 52 }}
                    >
                        <Plus size={16} /> 新增板块
                    </button>
                </div>

                <div className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0 md:rounded-b-2xl flex gap-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                    <button
                        onClick={() => confirm('按员工资料重新自动产生板块？（你现在的设定会被取代，按「保存」才生效）') && setList(suggested)}
                        disabled={saving}
                        className="px-3 rounded-xl border border-gray-200 text-gray-600 font-black text-xs flex items-center gap-1 active:scale-95"
                        style={{ minHeight: 52 }}
                    >
                        <RotateCcw size={14} /> 自动产生
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 bg-[#0B3B8C] text-white rounded-xl font-black text-base flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
                        style={{ minHeight: 52 }}
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 保存
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default DivisionEditor;
