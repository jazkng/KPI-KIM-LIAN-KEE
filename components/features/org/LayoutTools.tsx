import React, { useMemo, useState } from 'react';
import { X, Trash2, EyeOff, Eye, Spline, UserPlus, Search } from 'lucide-react';
import type { Employee } from '../../../types';
import { LINK_COLORS, LINK_STYLES } from '../../../utils/orgChartLayout';
import type { LinkColor, LinkStyle, OrgAssistant, OrgChartLayout, OrgExtraLink, OrgNodeKey } from '../../../utils/orgChartLayout';

/**
 * 🎛️ 组织图「自由调整」的操作介面（图表本体在 OrgChart.tsx）
 *   · NodeSheet：点图上一个人 / 板块后，底部跳出的动作选单
 *   · LinkSheet：设定一条连线（实线虚线、颜色、箭头、标签、删除）
 *   · AssistantSheet：帮某个管理员加协助者
 *   · LayoutDrawer：全部调整的清单（可以一项一项拿掉）
 */

export interface PickedNode {
    key: OrgNodeKey;
    label: string;
    /** emp = 员工；div = 管理层板块；panel = 部门面板；asst = 协助者小卡 */
    kind: 'emp' | 'div' | 'panel' | 'asst';
    empId?: string;
    /** 这个点可以挂协助者（董事 / 板块 / 部门主管） */
    canAssist: boolean;
}

const Sheet: React.FC<{ title: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-stone-200 bg-white p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-[15px] font-extrabold text-stone-900">{title}</div>
                <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-stone-400 hover:bg-stone-100" aria-label="关闭">
                    <X size={18} />
                </button>
            </div>
            <div className="mt-3">{children}</div>
        </div>
    </div>
);

const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean }> = ({ icon, label, sub, onClick, danger }) => (
    <button
        onClick={onClick}
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition-colors ${danger ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-stone-200 text-stone-800 hover:bg-stone-50'}`}
    >
        <span className="shrink-0 text-stone-500">{icon}</span>
        <span className="min-w-0">
            <span className="block text-[14px] font-bold">{label}</span>
            {sub && <span className="block text-[12px] font-medium text-stone-500">{sub}</span>}
        </span>
    </button>
);

// ---------------------------------------------------------------------------

export const NodeSheet: React.FC<{
    node: PickedNode;
    positionHidden: boolean;
    onTogglePosition: () => void;
    onStartLink: () => void;
    onAddAssistant: () => void;
    onClose: () => void;
}> = ({ node, positionHidden, onTogglePosition, onStartLink, onAddAssistant, onClose }) => (
    <Sheet title={<>调整 · <span className="text-stone-600">{node.label}</span></>} onClose={onClose}>
        <div className="space-y-2">
            {node.kind === 'emp' && (
                <ActionBtn
                    icon={positionHidden ? <Eye size={18} /> : <EyeOff size={18} />}
                    label={positionHidden ? '显示职位' : '隐藏职位'}
                    sub={positionHidden ? '恢复显示职位文字' : '人还在图上，只是不显示职位文字'}
                    onClick={onTogglePosition}
                />
            )}
            <ActionBtn icon={<Spline size={18} />} label="从这里拉一条线" sub="接着在图上点另一个人或方块" onClick={onStartLink} />
            {node.canAssist && <ActionBtn icon={<UserPlus size={18} />} label="加协助者" sub="小卡挂在旁边，例如助理、副手" onClick={onAddAssistant} />}
        </div>
    </Sheet>
);

// ---------------------------------------------------------------------------

export const LinkSheet: React.FC<{
    link: OrgExtraLink;
    fromLabel: string;
    toLabel: string;
    onChange: (patch: Partial<OrgExtraLink>) => void;
    onDelete: () => void;
    onClose: () => void;
}> = ({ link, fromLabel, toLabel, onChange, onDelete, onClose }) => {
    const [label, setLabel] = useState(link.label || '');
    return (
        <Sheet
            title={
                <>
                    连线 · <span className="text-stone-600">{fromLabel}</span> <span className="text-stone-400">→</span> <span className="text-stone-600">{toLabel}</span>
                </>
            }
            onClose={onClose}
        >
            <div className="space-y-3.5">
                <div>
                    <p className="mb-1.5 text-[12px] font-semibold text-stone-500">线条</p>
                    <div className="grid grid-cols-3 gap-1.5">
                        {(Object.keys(LINK_STYLES) as LinkStyle[]).map(s => (
                            <button key={s} onClick={() => onChange({ style: s })} className={`flex min-h-[44px] items-center justify-center rounded-xl border ${link.style === s ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-700'}`}>
                                <svg width="46" height="10" aria-hidden>
                                    <path d="M2 5 C 14 -2, 32 12, 44 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray={LINK_STYLES[s].dash} strokeLinecap="round" />
                                </svg>
                                <span className="ml-1.5 text-[13px] font-bold">{LINK_STYLES[s].label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="mb-1.5 text-[12px] font-semibold text-stone-500">颜色</p>
                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(LINK_COLORS) as LinkColor[]).map(c => (
                            <button
                                key={c}
                                onClick={() => onChange({ color: c })}
                                className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold ${link.color === c ? 'border-stone-900 ring-2 ring-stone-900/10' : 'border-stone-200'}`}
                            >
                                <span className="h-3.5 w-3.5 rounded-full" style={{ background: LINK_COLORS[c].stroke }} />
                                {LINK_COLORS[c].label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        onBlur={() => label !== (link.label || '') && onChange({ label: label.trim() || undefined })}
                        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        maxLength={24}
                        placeholder="线上的字（选填），例如 协助、汇报、支援"
                        className="min-h-[46px] flex-1 rounded-xl border border-stone-200 px-3 text-[16px] font-medium"
                    />
                    <button
                        onClick={() => onChange({ arrow: !link.arrow })}
                        className={`min-h-[46px] shrink-0 rounded-xl border px-3 text-[13px] font-bold ${link.arrow ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}
                    >
                        {link.arrow ? '有箭头' : '无箭头'}
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={onDelete} className="flex min-h-[46px] items-center gap-1.5 rounded-xl border border-rose-200 px-3.5 text-[13px] font-bold text-rose-700 hover:bg-rose-50">
                        <Trash2 size={15} /> 删除这条线
                    </button>
                    <button onClick={onClose} className="min-h-[46px] flex-1 rounded-xl bg-stone-900 text-[14px] font-bold text-white">
                        完成
                    </button>
                </div>
            </div>
        </Sheet>
    );
};

// ---------------------------------------------------------------------------

const TITLE_CHIPS = ['协助', '助理', 'PA', '副手', '代理'];

export const AssistantSheet: React.FC<{
    anchorLabel: string;
    employees: Employee[];
    exclude: string[];
    onSave: (empId: string, title: string) => void;
    onClose: () => void;
}> = ({ anchorLabel, employees, exclude, onSave, onClose }) => {
    const [q, setQ] = useState('');
    const [pick, setPick] = useState('');
    const [title, setTitle] = useState('协助');
    const list = useMemo(() => {
        const k = q.trim().toLowerCase();
        return employees
            .filter(e => !exclude.includes(e.id))
            .filter(e => !k || e.name.toLowerCase().includes(k) || String(e.id).toLowerCase().includes(k))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [employees, exclude, q]);
    return (
        <Sheet title={<>加协助者 · <span className="text-stone-600">{anchorLabel}</span></>} onClose={onClose}>
            <div className="space-y-3">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜名字 / 工号" className="min-h-[46px] w-full rounded-xl border border-stone-200 pl-9 pr-3 text-[16px]" />
                </div>
                <div className="max-h-[34dvh] overflow-y-auto rounded-2xl border border-stone-100">
                    {list.map(e => (
                        <button key={e.id} onClick={() => setPick(e.id)} className={`flex min-h-[46px] w-full items-center justify-between gap-2 border-b border-stone-100 px-3.5 text-left last:border-b-0 ${pick === e.id ? 'bg-amber-50' : 'hover:bg-stone-50'}`}>
                            <span className="text-[14px] font-bold text-stone-800">
                                {e.name} <span className="text-[12px] font-medium text-stone-400">#{e.id}</span>
                            </span>
                            {pick === e.id && <span className="text-[12px] font-bold text-amber-700">已选</span>}
                        </button>
                    ))}
                    {list.length === 0 && <p className="p-4 text-center text-[13px] text-stone-400">找不到</p>}
                </div>
                <div>
                    <p className="mb-1.5 text-[12px] font-semibold text-stone-500">小卡上的称呼</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TITLE_CHIPS.map(t => (
                            <button key={t} onClick={() => setTitle(t)} className={`min-h-[40px] rounded-xl border px-3 text-[13px] font-bold ${title === t ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-700'}`}>
                                {t}
                            </button>
                        ))}
                        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={16} className="min-h-[40px] w-28 rounded-xl border border-stone-200 px-2.5 text-[16px]" aria-label="自订称呼" />
                    </div>
                </div>
                <button disabled={!pick || !title.trim()} onClick={() => onSave(pick, title.trim())} className="min-h-[48px] w-full rounded-xl bg-stone-900 text-[14px] font-bold text-white disabled:opacity-40">
                    加上去
                </button>
            </div>
        </Sheet>
    );
};

// ---------------------------------------------------------------------------

export const LayoutDrawer: React.FC<{
    layout: OrgChartLayout;
    labelOf: (key: OrgNodeKey) => string;
    nameOf: (empId: string) => string;
    onShowPosition: (empId: string) => void;
    onEditLink: (link: OrgExtraLink) => void;
    onDeleteLink: (id: string) => void;
    onDeleteAssistant: (a: OrgAssistant) => void;
    onClose: () => void;
}> = ({ layout, labelOf, nameOf, onShowPosition, onEditLink, onDeleteLink, onDeleteAssistant, onClose }) => {
    const Section: React.FC<{ title: string; count: number; empty: string; children: React.ReactNode }> = ({ title, count, empty, children }) => (
        <section>
            <h4 className="mb-2 flex items-center justify-between text-[13px] font-bold text-stone-800">
                {title} <span className="text-[12px] font-medium text-stone-400">{count}</span>
            </h4>
            {count === 0 ? <p className="rounded-xl bg-stone-50 px-3 py-3 text-[12.5px] text-stone-400">{empty}</p> : <div className="space-y-1.5">{children}</div>}
        </section>
    );
    const Row: React.FC<{ children: React.ReactNode; actions: React.ReactNode }> = ({ children, actions }) => (
        <div className="flex min-h-[48px] items-center justify-between gap-2 rounded-xl border border-stone-200 px-3">
            <div className="min-w-0 truncate text-[13px] font-semibold text-stone-700">{children}</div>
            <div className="flex shrink-0 gap-1">{actions}</div>
        </div>
    );
    const small = 'min-h-[36px] rounded-lg px-2.5 text-[12px] font-bold';
    return (
        <div className="fixed inset-0 z-[65] flex justify-end bg-black/20" onClick={onClose}>
            <aside onClick={e => e.stopPropagation()} className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                    <h3 className="text-[16px] font-extrabold text-stone-900">全部调整</h3>
                    <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-stone-100" aria-label="关闭">
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
                    <Section title="额外连线" count={layout.links.length} empty="还没有。在图上点一个人 →「从这里拉一条线」。">
                        {layout.links.map(l => (
                            <Row
                                key={l.id}
                                actions={
                                    <>
                                        <button onClick={() => onEditLink(l)} className={`${small} border border-stone-200 text-stone-700`}>改</button>
                                        <button onClick={() => onDeleteLink(l.id)} className={`${small} text-rose-600 hover:bg-rose-50`} aria-label="删除"><Trash2 size={14} /></button>
                                    </>
                                }
                            >
                                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LINK_COLORS[l.color].stroke }} />
                                {labelOf(l.from)} → {labelOf(l.to)}
                                {l.label && <span className="text-stone-400"> · {l.label}</span>}
                            </Row>
                        ))}
                    </Section>
                    <Section title="协助者" count={layout.assistants.length} empty="还没有。在图上点一个管理员 →「加协助者」。">
                        {layout.assistants.map(a => (
                            <Row key={a.id} actions={<button onClick={() => onDeleteAssistant(a)} className={`${small} text-rose-600 hover:bg-rose-50`} aria-label="删除"><Trash2 size={14} /></button>}>
                                {nameOf(a.empId)} <span className="text-stone-400">（{a.title}）→ {labelOf(a.anchor)}</span>
                            </Row>
                        ))}
                    </Section>
                    <Section title="隐藏职位的人" count={layout.hiddenPositions.length} empty="没有。在图上点一个人 →「隐藏职位」。">
                        {layout.hiddenPositions.map(id => (
                            <Row key={id} actions={<button onClick={() => onShowPosition(id)} className={`${small} border border-stone-200 text-stone-700`}>显示</button>}>
                                {nameOf(id)}
                            </Row>
                        ))}
                    </Section>
                </div>
            </aside>
        </div>
    );
};
