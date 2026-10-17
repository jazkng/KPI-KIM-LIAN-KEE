// 数据审查中心：所有「审查 / 对账 / 资料整理」工具集中在这里（负责人 2026-10-17 要求）。
// 每个工具沿用原本的权限：财务审查跟「财务报表」权限；库存编号整理只给负责人与系统管理员。
import React, { useState } from 'react';
import { X, Scale, ListChecks, Hash, ChevronRight, Lock, type LucideIcon } from 'lucide-react';
import type { Employee } from '../../../types';
import { canUseBossTarget } from '../../../utils/bossPortalAccess';
import { canManageStockCodes } from '../../../utils/inventory/stockCodeAccess';
import { PnLReconciliation, ExpenseAudit, StockCodeMigration } from '../../lazyModules';

type ToolId = 'PNL_RECON' | 'EXPENSE_AUDIT' | 'STOCK_CODES';

interface ToolDef {
    id: ToolId;
    group: string;
    title: string;
    desc: string;
    icon: LucideIcon;
    writes: boolean; // 会不会写入资料（只读工具与会写入的工具分开标示）
    allowed: (employee: Employee | null | undefined) => boolean;
}

export const DATA_TOOLS: ToolDef[] = [
    { id: 'PNL_RECON', group: '财务', title: '盈亏对账', desc: '修改前（A/B/C）与经营盈亏引擎并列，差额逐项拆解', icon: Scale, writes: false, allowed: e => canUseBossTarget(e, 'PNL_RECON') },
    { id: 'EXPENSE_AUDIT', group: '财务', title: '杂项费用审计', desc: '逐笔检查应付账款 / 独立支出在传统账目的去向', icon: ListChecks, writes: false, allowed: e => canUseBossTarget(e, 'EXPENSE_AUDIT') },
    { id: 'STOCK_CODES', group: '库存', title: '库存编号整理', desc: '全部重新连号、名称统一「中文 (English)」、未编号商品补配号、回滚', icon: Hash, writes: true, allowed: e => canManageStockCodes(e) },
];

export const canOpenDataTools = (employee: Employee | null | undefined): boolean => DATA_TOOLS.some(t => t.allowed(employee));

interface Props { currentEmployee?: Employee | null; onClose: () => void }

export const DataToolsHub: React.FC<Props> = ({ currentEmployee, onClose }) => {
    const [open, setOpen] = useState<ToolId | null>(null);
    const back = () => setOpen(null);

    if (open === 'PNL_RECON') return <PnLReconciliation onClose={back} />;
    if (open === 'EXPENSE_AUDIT') return <ExpenseAudit onClose={back} />;
    if (open === 'STOCK_CODES') return <StockCodeMigration operatorName={currentEmployee?.name || '负责人'} onClose={back} onChanged={() => {}} />;

    const groups = [...new Set(DATA_TOOLS.map(t => t.group))];
    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white px-4 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">数据审查中心</h2>
                        <p className="truncate text-[11px] font-bold text-stone-500">审查、对账、资料整理工具集中在这里</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>
            </header>
            <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 overflow-y-auto p-4">
                {groups.map(g => (
                    <section key={g} className="space-y-2">
                        <h3 className="px-1 text-xs font-black uppercase tracking-widest text-stone-400">{g}</h3>
                        {DATA_TOOLS.filter(t => t.group === g).map(t => {
                            const ok = t.allowed(currentEmployee);
                            const Icon = t.icon;
                            return (
                                <button key={t.id} disabled={!ok} onClick={() => setOpen(t.id)}
                                    className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-stone-400 disabled:opacity-50">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-800"><Icon size={20} /></div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-black">
                                            {t.title}
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${t.writes ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{t.writes ? '会写入 · 需确认' : '只读'}</span>
                                        </div>
                                        <div className="mt-0.5 text-xs font-bold text-stone-500">{ok ? t.desc : '只有负责人或系统管理员可以使用'}</div>
                                    </div>
                                    {ok ? <ChevronRight size={18} className="shrink-0 text-stone-400" /> : <Lock size={16} className="shrink-0 text-stone-400" />}
                                </button>
                            );
                        })}
                    </section>
                ))}
            </div>
        </div>
    );
};
