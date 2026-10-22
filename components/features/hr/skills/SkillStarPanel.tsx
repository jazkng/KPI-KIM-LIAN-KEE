import React, { useMemo, useState } from 'react';
import { Star, Lock, Printer, Settings2, CheckCircle2, AlertTriangle, Target } from 'lucide-react';
import type { Employee } from '../../../../types';
import {
    STAR_LEVELS,
    MAX_STAR_FOR_SUPERVISOR,
    SkillItem,
    StarLevel,
    categoryLabel,
    getEmployeePositions,
    summarizeItems,
} from '../../../../constants/skillCatalog';

/**
 * ⭐ 员工档案 → 工作能力
 * 主职 / 副职各一张卡；同一个项目出现在两个职位里，分数共用。
 * 负责人 2026-10-23：
 *   - 要按「编辑」才能评分；
 *   - 第一次评分先点星星，按「决定」才算评完；
 *   - 评完之后只能升级或降级，而且要写原因。
 * 技能星级是个人能力，不算积分。
 */

interface Props {
    employee: Partial<Employee>;
    catalog: SkillItem[];
    /** 老板 / 管理员：可以给 ★4、★5，也可以改工作项目清单 */
    canRateHigh: boolean;
    /** 正在编辑（没按编辑只能看） */
    editing: boolean;
    /** 存评分：第一次评（不用原因）或升级 / 降级（要原因） */
    onCommit: (changes: { itemId: string; level: StarLevel; reason?: string }[]) => void;
    onOpenPrint: () => void;
    onOpenCatalog?: () => void;
    /** 正在存 */
    saving?: boolean;
}

const statusChip = (s: ReturnType<typeof summarizeItems>) => {
    if (s.status === 'READY')
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={11} /> 可独立顶位
            </span>
        );
    if (s.status === 'NOT_READY')
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle size={11} /> 还不能独立 · {s.ready}/{s.total} 项达标
            </span>
        );
    if (s.status === 'UNRATED')
        return <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-gray-50 text-gray-400 border border-gray-200">未评</span>;
    return null;
};

export const SkillStarPanel: React.FC<Props> = ({ employee, catalog, canRateHigh, editing, onCommit, onOpenPrint, onOpenCatalog, saving }) => {
    const positions = useMemo(() => getEmployeePositions(employee, catalog), [employee.role, employee.secondaryRoles, catalog]);
    const ratings = employee.skillRatings || {};
    const primary = positions.find(p => p.isPrimary);
    const primarySummary = primary ? summarizeItems(primary.items, ratings) : null;

    // 第一次评分的草稿（按「决定」才存）
    const [draft, setDraft] = useState<Record<string, StarLevel>>({});
    // 已评过的项目：要升级 / 降级时先写原因
    const [change, setChange] = useState<{ itemId: string; name: string; from: StarLevel; to: StarLevel } | null>(null);
    const [reason, setReason] = useState('');
    const draftCount = Object.keys(draft).length;

    const handleTap = (itemId: string, name: string, lv: StarLevel) => {
        if (!editing) return;
        const cur = ratings[itemId]?.level;
        if (!canRateHigh && lv > MAX_STAR_FOR_SUPERVISOR) {
            alert(`⚠️ ★4、★5 只有老板 / 管理员可以给。\n主管最多评到 ★${MAX_STAR_FOR_SUPERVISOR}。`);
            return;
        }
        if (!canRateHigh && cur && cur > MAX_STAR_FOR_SUPERVISOR) {
            alert('⚠️ 这一项已经是 ★4 以上（老板评的），主管不能修改。');
            return;
        }
        if (!cur) { setDraft(d => ({ ...d, [itemId]: lv })); return; }
        if (cur === lv) return;
        setReason('');
        setChange({ itemId, name, from: cur, to: lv });
    };
    const commitDraft = () => {
        onCommit(Object.entries(draft).map(([itemId, level]) => ({ itemId, level })));
        setDraft({});
    };

    return (
        <div>
            {/* 标题 + 动作 */}
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Target size={14} className="text-[#FFD200]" /> 工作能力 (Skill Stars)
                    {saving && <span className="text-[10px] normal-case tracking-normal text-gray-400 font-bold">保存中…</span>}
                </h4>
                <div className="flex items-center gap-1.5">
                    {primarySummary && primarySummary.avg !== null && (
                        <span className="text-[11px] font-black text-stone-800 bg-[#FFD200]/30 border border-[#FFD200] px-2 py-1 rounded-lg whitespace-nowrap">
                            主职 ★{primarySummary.avg.toFixed(1)}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onOpenPrint}
                        className="flex items-center gap-1 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-[11px] font-black active:scale-95 min-h-[44px]"
                        title="打印纸本评分表"
                    >
                        <Printer size={13} /> 评分表
                    </button>
                    {onOpenCatalog && (
                        <button
                            type="button"
                            onClick={onOpenCatalog}
                            className="flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 min-h-[44px] min-w-[44px]"
                            title="工作项目设定"
                            aria-label="工作项目设定"
                        >
                            <Settings2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* 星级说明 */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4 text-[10px] font-bold text-gray-500">
                {STAR_LEVELS.map(s => (
                    <span key={s.level} className="whitespace-nowrap">
                        <span className="text-amber-500">★{s.level}</span> {s.zh}
                        {!canRateHigh && s.level > MAX_STAR_FOR_SUPERVISOR && <Lock size={9} className="inline ml-0.5 -mt-0.5 text-gray-300" />}
                    </span>
                ))}
            </div>

            {positions.length === 0 && (
                <p className="text-xs font-bold text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                    还没设定职位
                </p>
            )}

            <div className="space-y-3">
                {positions.map(pos => {
                    const s = summarizeItems(pos.items, ratings);
                    return (
                        <div key={pos.category} className={`rounded-2xl border ${pos.isPrimary ? 'border-[#FFD200] bg-[#FFFBEA]' : 'border-gray-200 bg-white'}`}>
                            <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 flex-wrap">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${pos.isPrimary ? 'bg-[#111111] text-[#FFD200]' : 'bg-gray-100 text-gray-500'}`}>
                                            {pos.isPrimary ? '⭐ 主职' : '副职'}
                                        </span>
                                        <span className="text-sm font-black text-[#111111] truncate">{pos.title.split('(')[0].trim() || pos.title}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">{categoryLabel(pos.category)}</p>
                                </div>
                                {statusChip(s)}
                            </div>

                            {pos.items.length === 0 ? (
                                <p className="px-3 pb-3 text-[11px] font-bold text-gray-400">
                                    这个职位还没有对应的工作项目{onOpenCatalog ? '（按右上角 ⚙️ 可以设定）' : ''}
                                </p>
                            ) : (
                                <div className="divide-y divide-gray-100 border-t border-gray-100">
                                    {pos.items.map(item => {
                                        const r = ratings[item.id];
                                        const pending = draft[item.id];
                                        const lv = pending || r?.level || 0;
                                        const shared = item.categories.filter(c => positions.some(p => p.category === c)).length > 1;
                                        return (
                                            <div key={item.id} className={`flex flex-col md:flex-row md:items-center justify-between gap-1 md:gap-1.5 pl-3 pr-1.5 py-2 md:py-1 ${pending ? 'bg-amber-50' : ''}`}>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[13px] font-black text-[#111111] leading-tight">
                                                        {item.name}
                                                        {shared && <span className="ml-1 text-[9px] font-bold text-blue-500 align-middle">共用</span>}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-gray-400 leading-tight mt-0.5">
                                                        {pending ? `待决定：${STAR_LEVELS[pending - 1].zh}` : lv ? `${STAR_LEVELS[lv - 1].zh}${r?.ratedAt ? ` · ${r.ratedAt.slice(5)}` : ''}${r?.ratedBy ? ` · ${r.ratedBy}` : ''}` : '未评'}
                                                    </p>
                                                </div>
                                                <div className={`flex items-center shrink-0 ${editing ? '' : 'opacity-80'}`} role="radiogroup" aria-label={item.name}>
                                                    {[1, 2, 3, 4, 5].map(n => {
                                                        const locked = !canRateHigh && n > MAX_STAR_FOR_SUPERVISOR;
                                                        const on = n <= lv;
                                                        return (
                                                            <button
                                                                key={n}
                                                                type="button"
                                                                onClick={() => handleTap(item.id, item.name, n as StarLevel)}
                                                                disabled={!editing}
                                                                aria-label={`${item.name} ★${n}`}
                                                                aria-checked={lv === n}
                                                                role="radio"
                                                                className="w-10 h-10 md:w-9 md:h-9 flex items-center justify-center active:scale-90 transition-transform disabled:active:scale-100"
                                                            >
                                                                <Star
                                                                    size={21}
                                                                    strokeWidth={2}
                                                                    className={on ? 'text-amber-400 fill-amber-400' : locked ? 'text-gray-200' : 'text-gray-300'}
                                                                />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {editing && draftCount > 0 && (
                <div className="sticky bottom-2 mt-3 flex gap-2 rounded-2xl bg-[#111111] p-2 shadow-xl">
                    <button type="button" onClick={() => setDraft({})} className="flex-1 min-h-[46px] rounded-xl bg-white/10 text-white text-sm font-black">取消</button>
                    <button type="button" onClick={commitDraft} className="flex-[2] min-h-[46px] rounded-xl bg-[#FFD200] text-[#111111] text-sm font-black">决定（{draftCount} 项）</button>
                </div>
            )}
            <p className="text-[10px] text-gray-400 font-bold mt-3">
                {editing
                    ? `💡 没评过的项目：点星星后按「决定」。已评过的：点别的星星 = 升级 / 降级，要写原因。${!canRateHigh ? ` 主管最多给 ★${MAX_STAR_FOR_SUPERVISOR}。` : ''}`
                    : '💡 按右上角「编辑」才能评分。技能星级是个人能力，不算积分。'}
            </p>

            {change && (
                <div className="fixed inset-0 z-[300] bg-black/50 flex items-end md:items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setChange(null); }}>
                    <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl p-5 space-y-3 shadow-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                        <b className="block text-base font-black">{change.to > change.from ? '升级' : '降级'}：{change.name}</b>
                        <p className="text-sm font-bold text-stone-600">★{change.from} {STAR_LEVELS[change.from - 1].zh} → <span className={change.to > change.from ? 'text-emerald-600' : 'text-rose-600'}>★{change.to} {STAR_LEVELS[change.to - 1].zh}</span></p>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
                            className="w-full rounded-xl border border-gray-200 p-3 text-[16px] outline-none focus:border-amber-400"
                            placeholder={change.to > change.from ? '原因（例如：已经可以独立做炒锅出餐）' : '原因（例如：最近常出错，需要人带）'} />
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setChange(null)} className="flex-1 min-h-[46px] rounded-xl bg-stone-100 text-stone-600 font-black">取消</button>
                            <button type="button" disabled={!reason.trim()} onClick={() => { onCommit([{ itemId: change.itemId, level: change.to, reason: reason.trim() }]); setChange(null); }}
                                className="flex-[2] min-h-[46px] rounded-xl bg-[#111111] text-[#FFD200] font-black disabled:opacity-40">确定{change.to > change.from ? '升级' : '降级'}</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SkillStarPanel;
