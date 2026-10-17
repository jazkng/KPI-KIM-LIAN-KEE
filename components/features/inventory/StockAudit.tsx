// 库存资料审计（只读）：列出会让收货、盘点、成本、编号出错的资料问题，不修改任何资料。
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, RefreshCw, FileSpreadsheet, ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react';
import type { Employee } from '../../../types';
import { canUseBossTarget } from '../../../utils/bossPortalAccess';
import { canManageStockCodes } from '../../../utils/inventory/stockCodeAccess';
import { InventoryModule, SupplierModule, MenuManagement, StockCodeMigration } from '../../lazyModules';
import { db } from '../../../firebaseConfig';
import { CATEGORY_SECTIONS } from './inventoryConstants';
import { auditStock, loadStockAuditInput, type AuditFinding, type AuditSeverity, type AuditTarget } from '../../../utils/inventory/stockAudit';

const SECTIONS = Object.fromEntries(Object.entries(CATEGORY_SECTIONS).map(([k, v]) => [k, v.map(s => s.id)]));
const SEV: Record<AuditSeverity, { label: string; cls: string }> = {
    HIGH: { label: '高 · 会出错', cls: 'bg-red-50 text-red-700 border-red-200' },
    MEDIUM: { label: '中 · 要留意', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    LOW: { label: '低 · 整理用', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
};

const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const TARGET_LABEL: Record<AuditTarget['kind'], string> = { STOCK: '打开商品', SUPPLIER: '打开供应商', MENU: '打开菜谱', TASKS: '打开盘点任务', CODES: '打开编号整理' };

/** 「去处理」能不能用：跟各画面原本的权限一样 */
const canGo = (employee: Employee | null | undefined, t: AuditTarget): boolean => {
    if (t.kind === 'SUPPLIER') return canUseBossTarget(employee, 'SUPPLIER_CONTACTS');
    if (t.kind === 'MENU') return canUseBossTarget(employee, 'MENU');
    if (t.kind === 'CODES') return canManageStockCodes(employee);
    return canUseBossTarget(employee, 'INVENTORY_VIEW');
};

export const StockAudit: React.FC<{ onClose: () => void; currentEmployee?: Employee | null }> = ({ onClose, currentEmployee }) => {
    const [goto, setGoto] = useState<AuditTarget | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [findings, setFindings] = useState<AuditFinding[]>([]);
    const [checkedAt, setCheckedAt] = useState('');
    const [severity, setSeverity] = useState<AuditSeverity | 'ALL'>('ALL');
    const [open, setOpen] = useState<Record<string, boolean>>({});

    const run = async () => {
        setLoading(true); setError('');
        try {
            setFindings(auditStock(await loadStockAuditInput(db, SECTIONS)));
            setCheckedAt(new Date().toLocaleString('zh-CN', { hour12: false }));
        } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
    };
    useEffect(() => { run(); }, []);
    // 处理完回来：重新检查一次
    const back = () => { setGoto(null); run(); };

    const counts = useMemo(() => ({
        HIGH: findings.filter(f => f.severity === 'HIGH').length,
        MEDIUM: findings.filter(f => f.severity === 'MEDIUM').length,
        LOW: findings.filter(f => f.severity === 'LOW').length,
    }), [findings]);
    const groups = useMemo(() => {
        const list = findings.filter(f => severity === 'ALL' || f.severity === severity);
        const map = new Map<string, AuditFinding[]>();
        list.forEach(f => map.set(f.title, [...(map.get(f.title) || []), f]));
        return [...map.entries()];
    }, [findings, severity]);

    const exportCsv = () => {
        const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = findings.map(f => [SEV[f.severity].label, f.title, f.subject, f.detail, f.stockId || ''].map(esc).join(','));
        download(`库存资料审计-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [['等级', '问题', '对象', '说明', '内部 ID'].map(esc).join(','), ...rows].join('\n'));
    };

    if (goto) {
        const backBar = (
            <button onClick={back} className="fixed left-3 z-[400] flex min-h-[44px] items-center gap-1 rounded-full bg-stone-900 px-4 text-sm font-black text-white shadow-lg" style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                <ArrowLeft size={16} /> 回到库存资料审计
            </button>
        );
        return (
            <div className="fixed inset-0 z-[310] overflow-auto bg-white">
                {goto.kind === 'STOCK' && <InventoryModule employee={currentEmployee || undefined} initialMode="MASTER" initialStockView={goto.area} initialEditStockId={goto.stockId} onClose={back} />}
                {goto.kind === 'TASKS' && <InventoryModule employee={currentEmployee || undefined} initialMode="MASTER" initialViewType="TASKS" onClose={back} />}
                {goto.kind === 'SUPPLIER' && <SupplierModule isModal onClose={back} initialSupplierId={goto.supplierId} initialCatalogItemId={goto.catalogItemId} />}
                {goto.kind === 'MENU' && <MenuManagement onClose={back} initialMenuItemId={goto.menuId} />}
                {goto.kind === 'CODES' && <StockCodeMigration operatorName={currentEmployee?.name || '负责人'} onClose={back} onChanged={() => {}} />}
                {backBar}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white px-4 pb-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">库存资料审计</h2>
                        <p className="truncate text-[11px] font-bold text-stone-500">只读 · 找出会让收货、盘点、成本、编号出错的资料问题</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X size={20} className="mx-auto" /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button onClick={run} disabled={loading} className="flex min-h-[40px] items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-black text-white disabled:opacity-50">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 重新检查
                    </button>
                    <button onClick={exportCsv} disabled={loading || !findings.length} className="flex min-h-[40px] items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 text-sm font-black text-green-700 disabled:opacity-50">
                        <FileSpreadsheet size={14} /> 下载（Excel）
                    </button>
                    {checkedAt && <span className="text-[11px] font-bold text-stone-400">检查时间 {checkedAt}</span>}
                </div>
            </header>

            <div className="mx-auto w-full max-w-4xl flex-1 space-y-3 overflow-y-auto p-4">
                {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">读取失败：{error}</div>}
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-stone-500"><Loader2 className="animate-spin" size={18} /> 读取库存、供应商、采购单、菜谱、盘点任务（只读）…</div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(k => (
                                <button key={k} onClick={() => setSeverity(k)}
                                    className={`rounded-2xl border p-3 text-left ${severity === k ? 'border-stone-900 ring-2 ring-stone-900' : 'border-stone-200'} ${k === 'ALL' ? 'bg-white' : SEV[k].cls}`}>
                                    <div className="text-[11px] font-black">{k === 'ALL' ? '全部' : SEV[k].label}</div>
                                    <div className="text-2xl font-black">{k === 'ALL' ? findings.length : counts[k]}</div>
                                </button>
                            ))}
                        </div>
                        {!error && findings.length === 0 && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-black text-green-700">没有发现问题 ✓</div>}
                        {groups.map(([title, list]) => {
                            const isOpen = open[title] ?? list[0].severity === 'HIGH';
                            return (
                                <section key={title} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                                    <button onClick={() => setOpen(p => ({ ...p, [title]: !isOpen }))} className="flex min-h-[52px] w-full items-center gap-2 px-3 text-left">
                                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${SEV[list[0].severity].cls}`}>{SEV[list[0].severity].label.split(' ')[0]}</span>
                                        <span className="min-w-0 flex-1 text-sm font-black">{title}</span>
                                        <span className="shrink-0 text-sm font-black text-stone-500">{list.length}</span>
                                    </button>
                                    {isOpen && (
                                        <div className="divide-y divide-stone-100 border-t border-stone-100">
                                            {list.slice(0, 300).map((f, i) => (
                                                <div key={i} className="flex items-center gap-2 px-3 py-2">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-xs font-black">{f.subject}</div>
                                                        <div className="mt-0.5 text-[11px] font-bold text-stone-500">{f.detail}</div>
                                                    </div>
                                                    {f.target && canGo(currentEmployee, f.target) && (
                                                        <button onClick={() => setGoto(f.target!)} className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-full border border-stone-300 bg-white px-3 text-[11px] font-black text-stone-700 hover:border-stone-900" title={TARGET_LABEL[f.target.kind]}>
                                                            去处理 <ArrowRight size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {list.length > 300 && <div className="px-3 py-2 text-[11px] font-bold text-stone-400">另有 {list.length - 300} 项，请下载 Excel 查看</div>}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
};
