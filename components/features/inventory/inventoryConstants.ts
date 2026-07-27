// inventory/inventoryConstants.ts
// 共用常量、工具函数、类型

export const CATEGORY_SECTIONS: Record<string, { id: string, label: string, color: string }[]> = {
    'KITCHEN': [
        { id: 'FRESH', label: '生鲜 (Fresh)', color: 'bg-red-50 text-red-700' },
        { id: 'MEAT', label: '肉类 (Meat)', color: 'bg-red-50 text-red-700' },
        { id: 'SEAFOOD', label: '海鲜 (Seafood)', color: 'bg-blue-50 text-blue-700' },
        { id: 'VEG', label: '蔬果 (Veg)', color: 'bg-green-50 text-green-700' },
        { id: 'NOODLE', label: '面食 (Noodle)', color: 'bg-yellow-50 text-yellow-700' },
        { id: 'SAUCE', label: '酱料 (Sauce)', color: 'bg-orange-50 text-orange-700' },
        { id: 'DRY', label: '干货 (Dry)', color: 'bg-amber-50 text-amber-700' },
        { id: 'HQ', label: '总店 (HQ)', color: 'bg-purple-50 text-purple-700' },
    ],
    'BAR': [
        { id: 'TEA', label: '茶叶 (Tea)', color: 'bg-green-50 text-green-700' },
        { id: 'FRUIT', label: '水果 (Fruit)', color: 'bg-orange-50 text-orange-700' },
        { id: 'RTD', label: '罐装 (Drinks)', color: 'bg-blue-50 text-blue-700' },
        { id: 'MISC', label: '其他 (Misc)', color: 'bg-gray-50 text-gray-700' },
        { id: 'DRINK', label: '饮品 (Drink)', color: 'bg-blue-50 text-blue-700' }
    ],
    'GENERAL': [
        { id: 'PACKAGING', label: '包装 (Pack)', color: 'bg-yellow-50 text-yellow-700' },
        { id: 'CLEANING', label: '清洁 (Clean)', color: 'bg-cyan-50 text-cyan-700' },
        { id: 'TOOLS', label: '工具 (Tools)', color: 'bg-gray-50 text-gray-700' },
        { id: 'WASTE', label: '耗材 (Waste)', color: 'bg-gray-50 text-gray-700' },
        { id: 'GENERAL', label: '杂项 (General)', color: 'bg-gray-50 text-gray-700' },
    ],
    'FUEL': [
        { id: 'GAS', label: '煤气 (Gas)', color: 'bg-indigo-50 text-indigo-700' },
        { id: 'CHARCOAL', label: '木炭 (Charcoal)', color: 'bg-slate-100 text-slate-700' },
        { id: 'OIL', label: '柴油/油 (Oil)', color: 'bg-orange-50 text-orange-700' }
    ]
};

export const getCategoryLabel = (catId: string): string => {
    for (const group of Object.values(CATEGORY_SECTIONS)) {
        const found = group.find(c => c.id === catId);
        if (found) return found.label;
    }
    return catId;
};

export const getCategoryColor = (catId: string): string => {
    for (const group of Object.values(CATEGORY_SECTIONS)) {
        const found = group.find(c => c.id === catId);
        if (found) return found.color;
    }
    return 'bg-gray-50 text-gray-700';
};

export const getToday = () => new Date().toISOString().split('T')[0];
export const getYesterday = () => new Date(Date.now() - 86400000).toISOString().split('T')[0];
export const daysBetween = (d1: string, d2: string) => Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);

export const FREQ_OPTIONS = [
    { value: 1, label: '每天', desc: 'Daily' },
    { value: 2, label: '每2天', desc: 'Every 2 days' },
    { value: 3, label: '每3天', desc: 'Every 3 days' },
    { value: 7, label: '每周', desc: 'Weekly' },
    { value: 14, label: '每2周', desc: 'Bi-weekly' },
    { value: 30, label: '每月', desc: 'Monthly' },
];

export const INPUT_STYLE = "w-full p-3 bg-white border border-gray-300 rounded-xl text-sm font-bold text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all placeholder:font-normal placeholder:text-gray-400";
export const LABEL_STYLE = "text-[10px] font-bold text-gray-400 uppercase mb-1.5 block tracking-wide";

// 共用类型
export interface TaskCompletion {
    id: string;
    taskId: string;
    assigneeId: string;
    assigneeName: string;
    date: string;
    completedAt: string;
    items: { stockId: string; stockName: string; countedQty?: number }[];
}