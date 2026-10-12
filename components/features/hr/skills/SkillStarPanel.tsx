import React, { useMemo } from 'react';
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
import { getSkillLevel } from '../../../../constants/hrSkill';

/**
 * ⭐ 员工档案 → 工作能力
 * 主职 / 副职各一张卡，每个工作项目直接点星星评分（手机单手也好按）。
 * 同一个项目出现在两个职位里，分数共用。
 */

interface Props {
    employee: Partial<Employee>;
    catalog: SkillItem[];
    /** 老板 / 管理员：可以给 ★4、★5，也可以改工作项目清单 */
    canRateHigh: boolean;
    onRate: (itemId: string, level: StarLevel | null) => void;
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

export const SkillStarPanel: React.FC<Props> = ({ employee, catalog, canRateHigh, onRate, onOpenPrint, onOpenCatalog, saving }) => {
    const positions = useMemo(() => getEmployeePositions(employee, catalog), [employee.role, employee.secondaryRoles, catalog]);
    const ratings = employee.skillRatings || {};
    const primary = positions.find(p => p.isPrimary);
    const primarySummary = primary ? summarizeItems(primary.items, ratings) : null;
    const hasAnyRating = Object.keys(ratings).length > 0;
    const legacy = getSkillLevel(employee.skillLevel);

    const handleTap = (itemId: string, lv: StarLevel) => {
        const cur = ratings[itemId]?.level;
        if (!canRateHigh && lv > MAX_STAR_FOR_SUPERVISOR) {
            alert(`⚠️ ★4、★5 只有老板 / 管理员可以给。\n主管最多评到 ★${MAX_STAR_FOR_SUPERVISOR}。`);
            return;
        }
        if (!canRateHigh && cur && cur > MAX_STAR_FOR_SUPERVISOR) {
            alert('⚠️ 这一项已经是 ★4 以上（老板评的），主管不能修改。');
            return;
        }
        onRate(itemId, cur === lv ? null : lv);
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
                        className="flex items-center gap-1 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-[11px] font-black active:scale-95 min-h-[36px]"
                        title="打印纸本评分表"
                    >
                        <Printer size={13} /> 评分表
                    </button>
                    {onOpenCatalog && (
                        <button
                            type="button"
                            onClick={onOpenCatalog}
                            className="flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 min-h-[36px] min-w-[36px]"
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
                                        const lv = r?.level || 0;
                                        const shared = item.categories.filter(c => positions.some(p => p.category === c)).length > 1;
                                        return (
                                            <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[13px] font-black text-[#111111] leading-tight">
                                                        {item.name}
                                                        {shared && <span className="ml-1 text-[9px] font-bold text-blue-500 align-middle">共用</span>}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-gray-400 leading-tight mt-0.5">
                                                        {lv ? `${STAR_LEVELS[lv - 1].zh}${r?.ratedAt ? ` · ${r.ratedAt.slice(5)}` : ''}${r?.ratedBy ? ` · ${r.ratedBy}` : ''}` : '未评'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center shrink-0" role="radiogroup" aria-label={item.name}>
                                                    {[1, 2, 3, 4, 5].map(n => {
                                                        const locked = !canRateHigh && n > MAX_STAR_FOR_SUPERVISOR;
                                                        const on = n <= lv;
                                                        return (
                                                            <button
                                                                key={n}
                                                                type="button"
                                                                onClick={() => handleTap(item.id, n as StarLevel)}
                                                                aria-label={`${item.name} ★${n}`}
                                                                aria-checked={lv === n}
                                                                role="radio"
                                                                className="w-9 h-10 md:w-8 md:h-9 flex items-center justify-center active:scale-90 transition-transform"
                                                            >
                                                                <Star
                                                                    size={22}
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

            <p className="text-[10px] text-gray-400 font-bold mt-3">
                💡 点星星直接保存；再点同一颗 = 清除。{!canRateHigh && ` 主管最多给 ★${MAX_STAR_FOR_SUPERVISOR}。`}
            </p>
            {!hasAnyRating && legacy && (
                <p className="text-[10px] text-gray-400 font-bold mt-1">
                    旧版技能等级：{legacy.zh}（{legacy.en}）{employee.skillLevelDate ? ` · ${employee.skillLevelDate}` : ''} —— 逐项评分后就不再使用
                </p>
            )}
        </div>
    );
};

export default SkillStarPanel;
