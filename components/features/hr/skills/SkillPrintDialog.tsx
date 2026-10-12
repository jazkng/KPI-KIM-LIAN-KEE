import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { jsPDF } from 'jspdf';
import { X, Printer, Loader2, User, Users, Share2 } from 'lucide-react';
import type { Employee } from '../../../../types';
import { SKILL_CATEGORIES, SkillItem, categoryLabel, itemsForCategory } from '../../../../constants/skillCatalog';
import type { JobCategory } from '../../assessmentConfig';
import {
    buildDepartmentSheets,
    buildPersonalSheet,
    deliverPdf,
    employeesForCategory,
    renderSheetsToPdf,
} from './skillPrintSheets';

/**
 * 🖨 打印纸本评分表
 *  个人评分表：这位 / 全部在职员工（一人一张）
 *  部门总表：勾选职位（一个职位一张）
 */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employees: Employee[];
    catalog: SkillItem[];
    /** 从某个员工档案打开 → 预设只印这位 */
    currentEmployee?: Partial<Employee> | null;
}

const defaultPeriod = () => {
    const d = new Date();
    return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
};

export const SkillPrintDialog: React.FC<Props> = ({ isOpen, onClose, employees, catalog, currentEmployee }) => {
    const active = useMemo(() => employees.filter(e => !e.isArchived), [employees]);
    const [mode, setMode] = useState<'PERSONAL' | 'DEPT'>('PERSONAL');
    const [who, setWho] = useState<'ONE' | 'ALL'>('ONE');
    const [cats, setCats] = useState<JobCategory[]>([]);
    const [period, setPeriod] = useState(defaultPeriod());
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [pending, setPending] = useState<{ pdf: jsPDF; name: string } | null>(null);

    const catCounts = useMemo(
        () =>
            SKILL_CATEGORIES.map(c => ({ cat: c, people: employeesForCategory(active, c).length, items: itemsForCategory(catalog, c).length })).filter(
                x => x.people > 0 && x.items > 0,
            ),
        [active, catalog],
    );

    useEffect(() => {
        if (!isOpen) return;
        setWho(currentEmployee?.id ? 'ONE' : 'ALL');
        setCats(catCounts.map(x => x.cat));
        setProgress('');
        setPending(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    const pageCount =
        mode === 'PERSONAL'
            ? who === 'ONE'
                ? currentEmployee?.id
                    ? 1
                    : 0
                : active.length
            : cats.length;

    const handleGenerate = async () => {
        if (busy || pageCount === 0) return;
        setBusy(true);
        setPending(null);
        try {
            let pages: string[] = [];
            let name = '';
            const p = period.trim();
            if (mode === 'PERSONAL') {
                const list = who === 'ONE' && currentEmployee ? [currentEmployee] : [...active].sort((a, b) => String(a.id).localeCompare(String(b.id)));
                pages = list.map(e => buildPersonalSheet(e, catalog, p));
                name = who === 'ONE' ? `技能评分表_${currentEmployee?.name || ''}_${p}.pdf` : `技能评分表_全员_${p}.pdf`;
            } else {
                const ordered = SKILL_CATEGORIES.filter(c => cats.includes(c));
                pages = ordered.flatMap(c => buildDepartmentSheets(active, catalog, c, p));
                name = `技能评分表_部门总表_${p}.pdf`;
            }
            name = name.replace(/[\\/:*?"<>|\s]+/g, '_');
            const pdf = await renderSheetsToPdf(pages, (d, t) => setProgress(`产生中 ${d}/${t} 页…`));
            setProgress('');
            const ok = await deliverPdf(pdf, name);
            if (!ok) setPending({ pdf, name });
        } catch (err) {
            console.error('Skill sheet PDF failed', err);
            alert('❌ 评分表产生失败，请重试');
            setProgress('');
        } finally {
            setBusy(false);
        }
    };

    if (!isOpen) return null;

    const seg = (on: boolean) =>
        `flex-1 rounded-xl border-2 font-black text-sm min-h-[48px] flex items-center justify-center gap-1.5 active:scale-95 transition-all ${
            on ? 'bg-[#111111] border-[#111111] text-[#FFD200]' : 'bg-white border-gray-200 text-gray-700'
        }`;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm" onClick={() => !busy && onClose()}>
            <div
                className="bg-[#F6F7FB] w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col"
                style={{ maxHeight: '92dvh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-[#111111] text-[#FFD200] p-2 rounded-xl">
                            <Printer size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-[#111111]">打印评分表</h3>
                            <p className="text-[10px] font-bold text-gray-400">纸上填好，再照着在系统里点星星</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={busy} className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 bg-white border border-gray-200 active:scale-90" aria-label="关闭">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto overscroll-contain px-4 pb-4 space-y-4">
                    <div className="flex gap-2">
                        <button className={seg(mode === 'PERSONAL')} onClick={() => setMode('PERSONAL')}>
                            <User size={16} /> 个人评分表
                        </button>
                        <button className={seg(mode === 'DEPT')} onClick={() => setMode('DEPT')}>
                            <Users size={16} /> 部门总表
                        </button>
                    </div>

                    {mode === 'PERSONAL' ? (
                        <div className="space-y-2">
                            <p className="text-[11px] font-bold text-gray-500">一人一张：主职 + 副职全部项目，每项圈 1–5，附「上次」分数参考。</p>
                            <div className="flex gap-2">
                                {currentEmployee?.id && (
                                    <button className={seg(who === 'ONE')} onClick={() => setWho('ONE')}>
                                        只印 {currentEmployee.name}
                                    </button>
                                )}
                                <button className={seg(who === 'ALL')} onClick={() => setWho('ALL')}>
                                    全部在职（{active.length} 人）
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[11px] font-bold text-gray-500">一个职位一张：员工一行、项目一格，直接写数字。</p>
                            <div className="grid grid-cols-1 gap-1.5">
                                {catCounts.map(({ cat, people }) => {
                                    const on = cats.includes(cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => setCats(on ? cats.filter(c => c !== cat) : [...cats, cat])}
                                            className={`flex items-center justify-between px-3 rounded-xl border-2 min-h-[46px] font-black text-sm active:scale-[0.99] ${
                                                on ? 'border-[#111111] bg-white text-[#111111]' : 'border-gray-200 bg-white text-gray-400'
                                            }`}
                                        >
                                            <span>
                                                {on ? '☑' : '☐'} {categoryLabel(cat)}
                                            </span>
                                            <span className="text-[11px] font-bold text-gray-400">{people} 人</span>
                                        </button>
                                    );
                                })}
                                {catCounts.length === 0 && <p className="text-xs font-bold text-gray-400 text-center py-4">没有员工对应到有工作项目的职位</p>}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">评分期间（印在表头）</label>
                        <input
                            value={period}
                            onChange={e => setPeriod(e.target.value)}
                            className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                            style={{ fontSize: '16px', minHeight: '48px' }}
                        />
                    </div>
                </div>

                <div className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0 md:rounded-b-2xl space-y-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                    {progress && <p className="text-xs font-bold text-gray-500 text-center">{progress}</p>}
                    {pending && (
                        <button
                            onClick={async () => {
                                const p = pending;
                                setPending(null);
                                await deliverPdf(p.pdf, p.name);
                            }}
                            className="w-full bg-emerald-600 text-white rounded-xl font-black text-base flex items-center justify-center gap-2 min-h-[52px] active:scale-[0.98]"
                        >
                            <Share2 size={18} /> 已产生 · 点这里打印 / 分享
                        </button>
                    )}
                    <button
                        onClick={handleGenerate}
                        disabled={busy || pageCount === 0}
                        className="w-full bg-[#111111] text-[#FFD200] rounded-xl font-black text-base flex items-center justify-center gap-2 min-h-[52px] active:scale-[0.98] disabled:opacity-40"
                    >
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                        产生 PDF · {pageCount} 张{mode === 'DEPT' ? '起' : ''}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default SkillPrintDialog;
