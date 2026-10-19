// ============================================================================
// 供应商列表的「分类」：把会计科目（INGREDIENT_SEAFOOD、GAS_COGS…）归成负责人看得懂的几大类，
// 并把科目代码翻成中文短名。只用于显示与筛选，不改供应商资料、不影响记账。
// ============================================================================

import type { ExpenseItem, Supplier } from '../../types';
import { ACCOUNTING_CATEGORIES_OPTIONS } from '../../components/features/supplier/supplierConstants';

export type SupplierGroupId = 'MEAT' | 'SEAFOOD' | 'VEG' | 'NOODLE' | 'DRY' | 'FUEL' | 'PACKAGING' | 'BAR' | 'CLEANING' | 'OTHER';

export const SUPPLIER_GROUPS: { id: SupplierGroupId; label: string; icon: string; color: string }[] = [
    { id: 'MEAT', label: '肉类', icon: '🥩', color: 'bg-red-50 text-red-700 border-red-200' },
    { id: 'SEAFOOD', label: '海鲜类', icon: '🦐', color: 'bg-sky-50 text-sky-700 border-sky-200' },
    { id: 'VEG', label: '蔬果类', icon: '🥬', color: 'bg-green-50 text-green-700 border-green-200' },
    { id: 'NOODLE', label: '面类', icon: '🍜', color: 'bg-orange-50 text-orange-800 border-orange-200' },
    { id: 'DRY', label: '干货杂货', icon: '🧂', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { id: 'FUEL', label: '燃料类', icon: '🔥', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { id: 'PACKAGING', label: '包装类', icon: '📦', color: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
    { id: 'BAR', label: '水吧类', icon: '🥤', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'CLEANING', label: '清洁维修', icon: '🧽', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    { id: 'OTHER', label: '其他', icon: '🏷️', color: 'bg-gray-50 text-gray-700 border-gray-200' },
];

const GROUP_OF_CATEGORY: Record<string, SupplierGroupId> = {
    INGREDIENT_MEAT: 'MEAT',
    INGREDIENT_SEAFOOD: 'SEAFOOD', INGREDIENT_SEAFOOD_PROCESSED: 'SEAFOOD', INGREDIENT_LALA: 'SEAFOOD',
    INGREDIENT_VEG: 'VEG',
    INGREDIENT_DRY: 'DRY', INGREDIENT_SAUCE: 'DRY', INGREDIENT_EGG: 'DRY', INGREDIENT_NOODLE: 'NOODLE', INGREDIENT_HQ: 'DRY', INGREDIENT_OIL: 'DRY', SUPPLIER: 'DRY',
    GAS_COGS: 'FUEL', CHARCOAL: 'FUEL',
    PACKAGING: 'PACKAGING',
    BEVERAGE: 'BAR', INGREDIENT_ICE: 'BAR',
    MAINTENANCE: 'CLEANING', SUPPLIES: 'CLEANING',
};

export const supplierGroupOf = (category?: string): SupplierGroupId => GROUP_OF_CATEGORY[String(category || '').toUpperCase()] || 'OTHER';
export const supplierGroupInfo = (id: SupplierGroupId) => SUPPLIER_GROUPS.find(g => g.id === id)!;

const LABELS: Record<string, string> = Object.fromEntries(
    Object.values(ACCOUNTING_CATEGORIES_OPTIONS).flat().map(o => [o.id, o.label]),
);

/** 科目代码 → 中文短名：「食材-海鲜 (Seafood)」→「海鲜」；认不得就原样 */
export const categoryShortLabel = (category?: string): string => {
    const id = String(category || '');
    const full = LABELS[id] || LABELS[id.toUpperCase()];
    if (!full) return id;
    return full.replace(/\s*[（(].*$/, '').replace(/^食材-/, '').trim() || full;
};

/** 每家供应商的未付款（按名称对应，跟供应商详情页「欠款」同一算法） */
export const outstandingBySupplier = (suppliers: Pick<Supplier, 'id' | 'name'>[], bills: Pick<ExpenseItem, 'company' | 'outstandingAmount'>[]): Record<string, number> => {
    const byName = new Map<string, number>();
    bills.forEach(b => {
        const amt = Number(b.outstandingAmount) || 0;
        if (amt <= 0 || !b.company) return;
        byName.set(b.company, (byName.get(b.company) || 0) + amt);
    });
    const out: Record<string, number> = {};
    suppliers.forEach(s => { const v = byName.get(s.name); if (v) out[s.id] = Math.round(v * 100) / 100; });
    return out;
};
