// ==========================================
// 🧹 账单资料修正
// ------------------------------------------
// 用途：一次把填错格的账单资料整理好 ——
//   1. 「收款商」栏填成账号的，把值搬去「收款账户」，收款商改回公司名
//   2. 账单名称统一成「店内XXX / 宿舍XXX」，一眼看出是哪个单位的
//
// ⚠️ 这里改的是账单档案本身。所有建议值都可以在保存前直接改，
//    不勾的那行完全不动。支付记录里的名称预设「不动」，要勾才会一起改。
// ==========================================

import React, { useState, useMemo } from 'react';
import { X, Save, Loader2, Wrench, AlertTriangle, ArrowRight } from 'lucide-react';
import { RecurringBill, BillPaymentRecord, RecurringBillCategory } from '../../../types';

/** 「收款商」栏位填成一串数字 —— 十有八九是把账号填错格了 */
export const looksLikeAccountNo = (v?: string) => !!v && /^[0-9][0-9\s-]{5,}$/.test(v.trim());

/** 各分类惯用的收款公司，用来给建议值（可改） */
export const CATEGORY_VENDOR: Partial<Record<RecurringBillCategory, string>> = {
    ELECTRICITY: 'TNB',
    ELECTRICITY_STAFF: 'TNB',
    WATER: 'Air Selangor',
    WATER_STAFF: 'Air Selangor',
    INTERNET: 'Maxis',
};

/** 收款商下拉建议清单（使用者仍然可以自己打字） */
export const VENDOR_OPTIONS = [
    'TNB', 'Air Selangor', 'Maxis', 'TIME', 'Unifi',
    'Indah Water', 'Alam Flora', 'DBKL', 'Cash',
];

/** 宿舍类分类 → 名称前缀「宿舍」，其余「店内」 */
const isStaffCategory = (c: string) => c.endsWith('_STAFF');

/** 租金没有 _STAFF 分类，只能从名称看是不是宿舍的 */
const STAFF_NAME_HINTS = ['宿舍', '员工', 'STAFF', 'HOSTEL', 'DORM'];
const nameLooksStaff = (name: string) => {
    const upper = (name || '').toUpperCase();
    return STAFF_NAME_HINTS.some(h => upper.includes(h));
};

export interface BillFixRow {
    id: string;
    original: RecurringBill;
    name: string;
    payableTo: string;
    accountNumber: string;
    reasons: string[];
}

interface BillDataFixModalProps {
    isOpen: boolean;
    onClose: () => void;
    bills: RecurringBill[];
    payments: BillPaymentRecord[];
    onSave: (
        rows: Array<{ id: string; name: string; payableTo: string; accountNumber: string }>,
        syncPaymentNames: boolean,
    ) => Promise<void>;
}

/** 算出这张账单的建议值 + 为什么要改。allBills 用来避免改成跟别张同名 */
const buildSuggestion = (bill: RecurringBill, allBills: RecurringBill[]): BillFixRow => {
    const reasons: string[] = [];
    let payableTo = (bill.payableTo || '').trim();
    let accountNumber = (bill.accountNumber || '').trim();
    let name = (bill.name || '').trim();

    // 1) 收款商填成账号 → 搬去账户栏
    if (looksLikeAccountNo(payableTo)) {
        if (!accountNumber) {
            accountNumber = payableTo;
            reasons.push('账号搬到「收款账户」');
        } else {
            reasons.push('收款商填成账号（账户栏已有值，账号不搬，请自行核对）');
        }
        payableTo = '';
    }

    // 2) 收款商空的 → 用分类惯用公司名补上
    const vendor = CATEGORY_VENDOR[bill.category];
    if (!payableTo || payableTo === '-') {
        if (vendor) {
            payableTo = vendor;
            reasons.push(`收款商补上「${vendor}」`);
        }
    }

    // 3) 名称统一成「店内XXX / 宿舍XXX」
    //    水电网络：用收款公司名（店内TNB / 宿舍TNB）
    //    租金：公司名是房东，不适合当名称，改用「店内租金 / 宿舍租金」
    let suggestedName = '';
    if (vendor && (bill.category.startsWith('ELECTRICITY') || bill.category.startsWith('WATER'))) {
        suggestedName = `${isStaffCategory(bill.category) ? '宿舍' : '店内'}${vendor}`;
    } else if (bill.category === 'RENT') {
        suggestedName = `${nameLooksStaff(bill.name) ? '宿舍' : '店内'}租金`;
    }

    if (suggestedName && name !== suggestedName) {
        // 已经有别张账单叫这个名字就不改，免得两张同名分不出来
        const clash = allBills.some(b => b.id !== bill.id && (b.name || '').trim() === suggestedName);
        if (clash) {
            reasons.push(`名称建议「${suggestedName}」，但已有同名账单，保留原名`);
        } else {
            name = suggestedName;
            reasons.push(`名称改成「${suggestedName}」`);
        }
    }

    return { id: bill.id, original: bill, name, payableTo, accountNumber, reasons };
};

export const BillDataFixModal: React.FC<BillDataFixModalProps> = ({
    isOpen, onClose, bills, payments, onSave,
}) => {
    const suggestions = useMemo(() => bills.map(b => buildSuggestion(b, bills)), [bills]);

    /** 有建议改动的账单，预设勾选 */
    const proposed = useMemo(() => suggestions.filter(r => r.reasons.length > 0), [suggestions]);

    const [drafts, setDrafts] = useState<Record<string, { name: string; payableTo: string; accountNumber: string }>>({});
    const [picked, setPicked] = useState<Record<string, boolean> | null>(null);
    const [syncPaymentNames, setSyncPaymentNames] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [saving, setSaving] = useState(false);

    const rows = showAll ? suggestions : proposed;

    const isPicked = (id: string) => (picked === null ? proposed.some(r => r.id === id) : !!picked[id]);

    const valueOf = (r: BillFixRow) => drafts[r.id] || { name: r.name, payableTo: r.payableTo, accountNumber: r.accountNumber };

    /** 勾选中、且真的跟原本不一样的那几行 */
    const changes = useMemo(() => {
        return rows
            .filter(r => isPicked(r.id))
            .map(r => ({ r, v: valueOf(r) }))
            .filter(({ r, v }) =>
                v.name !== (r.original.name || '') ||
                v.payableTo !== (r.original.payableTo || '') ||
                v.accountNumber !== (r.original.accountNumber || '')
            )
            .map(({ r, v }) => ({ id: r.id, name: v.name, payableTo: v.payableTo, accountNumber: v.accountNumber }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, drafts, picked]);

    /** 改名会连带影响几条支付记录 */
    const affectedPaymentCount = useMemo(() => {
        const renamed = new Set(
            changes.filter(c => c.name !== (bills.find(b => b.id === c.id)?.name || '')).map(c => c.id)
        );
        return payments.filter(p => renamed.has(p.billId)).length;
    }, [changes, payments, bills]);

    if (!isOpen) return null;

    const setDraft = (id: string, key: 'name' | 'payableTo' | 'accountNumber', value: string, base: BillFixRow) => {
        setDrafts(prev => ({ ...prev, [id]: { ...valueOf(base), ...(prev[id] || {}), [key]: value } }));
    };

    const togglePick = (id: string) => {
        setPicked(prev => {
            const base = prev === null
                ? Object.fromEntries(suggestions.map(r => [r.id, proposed.some(x => x.id === r.id)]))
                : { ...prev };
            base[id] = !base[id];
            return base;
        });
    };

    const handleSave = async () => {
        if (changes.length === 0) { onClose(); return; }
        setSaving(true);
        try {
            await onSave(changes, syncPaymentNames);
            setDrafts({});
            setPicked(null);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[160] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-4xl md:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">

                <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-black text-base text-stone-900 flex items-center gap-2">
                            <Wrench size={17} className="text-[#FFD200]" />
                            账单资料修正 (Fix Bill Data)
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            共 {bills.length} 张账单，其中 <b className="text-orange-600">{proposed.length}</b> 张建议修正
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl shrink-0"><X size={18} /></button>
                </div>

                <div className="px-4 md:px-5 pt-3 shrink-0">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 leading-relaxed">
                        建议值<b>都可以直接改</b>，不勾的那行完全不动。
                        这里只改账单档案，<b>不会动金额、分类、支付记录的金额</b>。
                    </div>
                </div>

                <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 shrink-0">
                    <label className="flex items-center gap-2 px-3 h-9 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold cursor-pointer">
                        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="accent-stone-900" />
                        显示全部账单（含没问题的）
                    </label>
                </div>

                <div className="flex-grow overflow-auto px-4 md:px-5">
                    {rows.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 text-sm font-bold">✓ 没有发现要修正的账单</div>
                    ) : (
                        <div className="space-y-2.5 pb-2">
                            {rows.map(r => {
                                const v = valueOf(r);
                                const on = isPicked(r.id);
                                return (
                                    <div key={r.id} className={`border rounded-xl p-3 ${on ? 'border-stone-300 bg-white' : 'border-gray-100 bg-gray-50/60 opacity-60'}`}>
                                        <div className="flex items-start gap-2.5">
                                            <input
                                                type="checkbox"
                                                checked={on}
                                                onChange={() => togglePick(r.id)}
                                                className="w-4 h-4 accent-stone-900 mt-1 shrink-0 cursor-pointer"
                                            />
                                            <div className="min-w-0 flex-grow">
                                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                                    <span className="font-black text-xs text-stone-900 whitespace-nowrap">{r.original.name}</span>
                                                    <span className="text-[8px] text-gray-500 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded font-black uppercase">{r.original.category}</span>
                                                    {r.reasons.map((reason, i) => (
                                                        <span key={i} className="text-[9px] text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded font-bold">{reason}</span>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase block mb-0.5">账单名称</label>
                                                        <input
                                                            value={v.name}
                                                            onChange={e => setDraft(r.id, 'name', e.target.value, r)}
                                                            className="w-full px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]"
                                                        />
                                                        {v.name !== (r.original.name || '') && (
                                                            <div className="text-[9px] text-gray-400 font-mono mt-0.5 truncate flex items-center gap-1">
                                                                {r.original.name} <ArrowRight size={8} className="shrink-0"/> <b className="text-emerald-700">{v.name}</b>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase block mb-0.5">收款商 (公司名)</label>
                                                        <input
                                                            list="vendor-options"
                                                            value={v.payableTo}
                                                            onChange={e => setDraft(r.id, 'payableTo', e.target.value, r)}
                                                            className="w-full px-2 h-9 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD200]"
                                                        />
                                                        {looksLikeAccountNo(v.payableTo) && (
                                                            <div className="text-[9px] text-red-600 font-black mt-0.5 flex items-center gap-1">
                                                                <AlertTriangle size={9}/> 还是账号
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase block mb-0.5">收款账户</label>
                                                        <input
                                                            value={v.accountNumber}
                                                            onChange={e => setDraft(r.id, 'accountNumber', e.target.value, r)}
                                                            className="w-full px-2 h-9 border border-gray-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-[#FFD200]"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 支付记录连动 */}
                <div className="px-4 md:px-5 pt-2 shrink-0">
                    <label className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer ${syncPaymentNames ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                        <input
                            type="checkbox"
                            checked={syncPaymentNames}
                            onChange={e => setSyncPaymentNames(e.target.checked)}
                            className="accent-stone-900 mt-0.5 shrink-0"
                        />
                        <span className="text-[11px] font-bold text-stone-700 leading-relaxed">
                            同时把<b>以前的支付记录</b>名称一起改（会动到 {affectedPaymentCount} 条记录）
                            <span className="block text-[10px] text-gray-500 font-medium mt-0.5">
                                不勾：旧记录保留当时的名称，新记的才用新名 —— 已经列印给会计的凭单对得上。
                                勾了：整个历史统一新名，但跟已列印的旧凭单会对不上。金额一律不动。
                            </span>
                        </span>
                    </label>
                </div>

                <div className="p-4 md:p-5 flex items-center gap-3 shrink-0">
                    <div className="text-[11px] text-gray-500 flex-grow font-bold">
                        {changes.length > 0 ? <span className="text-emerald-700">有 {changes.length} 张账单要更新</span> : '还没有改动'}
                    </div>
                    <button onClick={onClose} className="px-4 h-11 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">取消</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || changes.length === 0}
                        className="px-5 h-11 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        保存修正
                    </button>
                </div>

                {/* 收款商下拉建议（可自订，打字不受限） */}
                <datalist id="vendor-options">
                    {VENDOR_OPTIONS.map(v => <option key={v} value={v} />)}
                </datalist>
            </div>
        </div>
    );
};

export default BillDataFixModal;
