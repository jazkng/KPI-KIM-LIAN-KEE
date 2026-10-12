// ==========================================
// 🔢 补录仪表读数
// ------------------------------------------
// 用途：8 月之前记的水电账单只存了「用额 Usage」，没存上次/本次读数。
//      这里把这些记录按「账单 + 日期由旧到新」排成一张表，一次补完。
//
// ⚠️ 这里只补读数，不会改金额、日期、用额 —— 账已经付了，金额是照账单来的。
//    如果补进去的 (本次 - 上次) 跟原本存的用额对不上，会标橙色提醒，但不会自动改用额。
// ==========================================

import React, { useState, useMemo } from 'react';
import { X, Save, Loader2, Gauge, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import { BillPaymentRecord } from '../../../types';

/** 有仪表读数的账单分类 */
export const METER_CATEGORIES = ['ELECTRICITY', 'WATER', 'ELECTRICITY_STAFF', 'WATER_STAFF'];

export interface MeterDraft { prev: string; curr: string; }

interface MeterBackfillModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 全部支付记录，内部自己筛水电类 */
    payments: BillPaymentRecord[];
    /** 回传「记录 id → 读数」，由外层写进 Firestore */
    onSave: (readingMap: Record<string, { meterPrev?: number; meterCurr?: number }>) => Promise<void>;
}

const num = (s: string): number | undefined => {
    const t = s.trim();
    if (t === '') return undefined;
    const n = parseFloat(t);
    return isNaN(n) ? undefined : n;
};

export const MeterBackfillModal: React.FC<MeterBackfillModalProps> = ({
    isOpen, onClose, payments, onSave,
}) => {
    const [drafts, setDrafts] = useState<Record<string, MeterDraft>>({});
    const [onlyMissing, setOnlyMissing] = useState(true);
    const [autoChain, setAutoChain] = useState(true);
    const [saving, setSaving] = useState(false);

    /** 水电类记录，按「账单 → 日期由旧到新」排好，方便一期一期往下填 */
    const meterPayments = useMemo(() => {
        return payments
            .filter(p => METER_CATEGORIES.includes(String(p.category)))
            .slice()
            .sort((a, b) => {
                const byBill = String(a.billId).localeCompare(String(b.billId));
                if (byBill !== 0) return byBill;
                return a.date.localeCompare(b.date);
            });
    }, [payments]);

    /**
     * 逐行算出「实际会显示/保存的值」。
     * 顺序很重要：上一行的本次读数会串到下一行的上次读数（同一张账单才串）。
     */
    const rows = useMemo(() => {
        const lastCurrByBill: Record<string, number | undefined> = {};
        const out = meterPayments.map(p => {
            const d = drafts[p.id];
            const storedPrev = typeof p.meterPrev === 'number' ? p.meterPrev : undefined;
            const storedCurr = typeof p.meterCurr === 'number' ? p.meterCurr : undefined;

            let prev = d?.prev !== undefined ? num(d.prev) : storedPrev;
            const curr = d?.curr !== undefined ? num(d.curr) : storedCurr;

            // 上次读数没填 → 用同一张账单上一期的本次读数
            let chained = false;
            if (prev === undefined && autoChain && lastCurrByBill[p.billId] !== undefined) {
                prev = lastCurrByBill[p.billId];
                chained = true;
            }
            if (curr !== undefined) lastCurrByBill[p.billId] = curr;

            const hadBoth = storedPrev !== undefined && storedCurr !== undefined;
            const diff = prev !== undefined && curr !== undefined ? curr - prev : undefined;
            const storedUsage = typeof p.usage === 'number' ? p.usage : undefined;

            return {
                p, prev, curr, chained, hadBoth, diff, storedUsage,
                prevText: d?.prev !== undefined ? d.prev : (storedPrev !== undefined ? String(storedPrev) : ''),
                currText: d?.curr !== undefined ? d.curr : (storedCurr !== undefined ? String(storedCurr) : ''),
                negative: diff !== undefined && diff < 0,
                mismatch: diff !== undefined && storedUsage !== undefined && Math.abs(diff - storedUsage) > 0.01,
            };
        });
        return onlyMissing ? out.filter(r => !r.hadBoth) : out;
    }, [meterPayments, drafts, autoChain, onlyMissing]);

    const missingCount = meterPayments.filter(
        p => !(typeof p.meterPrev === 'number' && typeof p.meterCurr === 'number')
    ).length;

    /** 只送出跟原本不一样的（含 autoChain 串出来的上次读数） */
    const changed = useMemo(() => {
        const out: Record<string, { meterPrev?: number; meterCurr?: number }> = {};
        rows.forEach(r => {
            const storedPrev = typeof r.p.meterPrev === 'number' ? r.p.meterPrev : undefined;
            const storedCurr = typeof r.p.meterCurr === 'number' ? r.p.meterCurr : undefined;
            if (r.prev === storedPrev && r.curr === storedCurr) return;
            if (r.prev === undefined && r.curr === undefined) return;
            const entry: { meterPrev?: number; meterCurr?: number } = {};
            if (r.prev !== undefined) entry.meterPrev = r.prev;
            if (r.curr !== undefined) entry.meterCurr = r.curr;
            out[r.p.id] = entry;
        });
        return out;
    }, [rows]);

    const problemCount = rows.filter(r => r.negative).length;

    if (!isOpen) return null;

    const setDraft = (id: string, key: keyof MeterDraft, value: string) => {
        setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || { prev: undefined as any, curr: undefined as any }), [key]: value } }));
    };

    const handleSave = async () => {
        if (Object.keys(changed).length === 0) { onClose(); return; }
        setSaving(true);
        try {
            await onSave(changed);
            setDrafts({});
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[160] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-3xl md:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">

                {/* 标题 */}
                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-black text-base text-stone-900 flex items-center gap-2">
                            <Gauge size={17} className="text-[#FFD200]" />
                            补录仪表读数 (Backfill Meter)
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            水电类记录共 {meterPayments.length} 条，其中 <b className="text-orange-600">{missingCount}</b> 条还没有完整读数
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl shrink-0"><X size={18} /></button>
                </div>

                {/* 说明 */}
                <div className="px-4 md:px-5 pt-3 shrink-0">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                        这里<b>只补读数</b>，不会动金额、日期和已存的用额。
                        补完 (本次 − 上次) 若跟原本的用额对不上，会标橙色提醒 —— 那通常是抄错行，请自己核对账单。
                    </div>
                </div>

                {/* 选项 */}
                <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 shrink-0">
                    <label className="flex items-center gap-2 px-3 h-9 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold cursor-pointer">
                        <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="accent-stone-900" />
                        只看缺读数的
                    </label>
                    <label className="flex items-center gap-2 px-3 h-9 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold cursor-pointer">
                        <input type="checkbox" checked={autoChain} onChange={e => setAutoChain(e.target.checked)} className="accent-stone-900" />
                        <Link2 size={12} className="text-indigo-500" />
                        自动串联上一期（上次读数 = 上一期的本次）
                    </label>
                </div>

                {/* 表格 */}
                <div className="flex-grow overflow-auto px-4 md:px-5">
                    {rows.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 text-sm font-bold">
                            {onlyMissing && missingCount === 0 ? '✓ 所有水电记录都有读数了' : '没有水电类记录'}
                        </div>
                    ) : (
                        <table className="w-full text-[12px]">
                            <thead className="sticky top-0 bg-white z-10">
                                <tr className="text-gray-500 border-b border-gray-100">
                                    <th className="text-left py-2 font-black text-[9px] uppercase">账单 / 日期</th>
                                    <th className="text-left py-2 font-black text-[9px] uppercase w-28 pl-2">上次 Prev</th>
                                    <th className="text-left py-2 font-black text-[9px] uppercase w-28 pl-2">本次 Curr</th>
                                    <th className="text-right py-2 font-black text-[9px] uppercase w-32">算出 / 原用额</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.p.id} className="border-b border-gray-50 align-top">
                                        <td className="py-2 pr-2">
                                            <div className="font-bold text-stone-900 leading-snug">{r.p.name}</div>
                                            <div className="text-[9px] font-mono text-gray-400">{r.p.date} · RM {Number(r.p.amount || 0).toFixed(2)}</div>
                                        </td>
                                        <td className="py-2 pl-2">
                                            <input
                                                type="number"
                                                value={r.prevText}
                                                placeholder={r.chained && r.prev !== undefined ? String(r.prev) : '上次'}
                                                onChange={e => setDraft(r.p.id, 'prev', e.target.value)}
                                                className={`w-full px-2 h-9 border rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-[#FFD200] ${
                                                    r.chained ? 'border-indigo-300 bg-indigo-50/50 placeholder:text-indigo-500 placeholder:font-bold' : 'border-gray-200 bg-white'
                                                }`}
                                            />
                                            {r.chained && <div className="text-[8px] text-indigo-600 font-black mt-0.5">自动串联</div>}
                                        </td>
                                        <td className="py-2 pl-2">
                                            <input
                                                type="number"
                                                value={r.currText}
                                                placeholder="本次"
                                                onChange={e => setDraft(r.p.id, 'curr', e.target.value)}
                                                className="w-full px-2 h-9 border border-gray-200 bg-white rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-[#FFD200]"
                                            />
                                        </td>
                                        <td className="py-2 text-right whitespace-nowrap">
                                            <div className={`font-mono font-black text-xs ${
                                                r.negative ? 'text-red-600' : r.mismatch ? 'text-orange-600' : 'text-stone-900'
                                            }`}>
                                                {r.diff !== undefined ? r.diff.toFixed(2) : '—'}
                                            </div>
                                            <div className="text-[9px] font-mono text-gray-400">
                                                原 {r.storedUsage !== undefined ? r.storedUsage : '—'} {r.p.usageUnit || ''}
                                            </div>
                                            {r.negative && <div className="text-[8px] text-red-600 font-black">本次比上次小</div>}
                                            {!r.negative && r.mismatch && <div className="text-[8px] text-orange-600 font-black">跟原用额对不上</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 底部 */}
                <div className="p-4 md:p-5 border-t border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="text-[11px] text-gray-500 flex-grow">
                        {problemCount > 0 && (
                            <span className="text-red-600 font-black flex items-center gap-1 mb-0.5">
                                <AlertTriangle size={12} /> {problemCount} 条读数倒退
                            </span>
                        )}
                        {Object.keys(changed).length > 0 ? (
                            <span className="text-emerald-700 font-black flex items-center gap-1">
                                <CheckCircle2 size={13} /> 有 {Object.keys(changed).length} 条要更新
                            </span>
                        ) : '还没有改动'}
                    </div>
                    <button onClick={onClose} className="px-4 h-11 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">取消</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || Object.keys(changed).length === 0}
                        className="px-5 h-11 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        保存读数
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MeterBackfillModal;
