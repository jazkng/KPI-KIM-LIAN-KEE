// supplier/supplierConstants.ts
// 共用常量、类型、样式

import { PurchaseOrderItem, UomOption } from '../../../types';
import { CATEGORY_SECTIONS } from '../inventory/inventoryConstants';

export const ITEMS_PER_PAGE = 20;

export const DEFAULT_UOMS: UomOption[] = [
    { label: 'Base Unit', value: 'BASE', ratio: 1 },
];

// ⚡ 从 inventoryConstants 统一引用，避免两处维护不同步
export const INVENTORY_CATEGORIES = Object.entries(CATEGORY_SECTIONS).map(([key, sections]) => ({
    label: key === 'KITCHEN' ? 'Kitchen (厨房)' : key === 'BAR' ? 'Bar (水吧)' : key === 'GENERAL' ? 'General (后勤)' : 'Fuel (燃料)',
    options: sections.map(s => ({ id: s.id, label: s.label }))
}));

export const ACCOUNTING_CATEGORIES_OPTIONS = {
    'COGS (销货成本)': [
        { id: 'INGREDIENT_HQ', label: '食材-总店 (HQ Ingredients)' },
        { id: 'INGREDIENT_MEAT', label: '食材-肉类 (Meat)' },
        { id: 'INGREDIENT_SEAFOOD', label: '食材-海鲜 (Seafood)' },
        { id: 'INGREDIENT_VEG', label: '食材-蔬果 (Veg)' },
        { id: 'INGREDIENT_DRY', label: '食材-干货 (Dry)' },
        { id: 'INGREDIENT_SAUCE', label: '食材-酱料 (Sauce)' },
        { id: 'INGREDIENT_EGG', label: '食材-蛋类 (Egg)' },          // 新增
        { id: 'INGREDIENT_NOODLE', label: '食材-面类 (Noodle)' },    // 新增
        { id: 'BEVERAGE', label: '水吧 (Beverage)' },
        { id: 'INGREDIENT_ICE', label: '食材-冰块 (Ice)' },
        { id: 'PACKAGING', label: '包装材料 (Packaging)' },
        { id: 'GAS_COGS', label: '烹饪煤气 (Cooking Gas)' },
        { id: 'CHARCOAL', label: '火炭 (Charcoal)' },                // 新增
        { id: 'SUPPLIER', label: '一般进货 (General)' }
    ],
    'OPEX (营运开支)': [
        { id: 'RENT', label: '租金 (Rent)' },
        { id: 'UTILITIES', label: '水电费 (Utilities)' },
        { id: 'SALARY', label: '薪资 (Salary)' },
        { id: 'STAFF_MEAL', label: '员工餐 (Staff Meal)' },
        { id: 'MAINTENANCE', label: '维修/保养/清洁 (Maintenance)' },
        { id: 'MARKETING', label: '营销广告 (Marketing)' },
        { id: 'ADVERTISING', label: '广告与推广 (Advertising & Promotion)' },
        { id: 'IT_SOFTWARE', label: '软件与信息技术 (IT & Software)' },
        { id: 'PROFESSIONAL', label: '专业服务/律师 (Professional/Legal)' },
        { id: 'SUPPLIES', label: '杂项耗材 (Supplies - Cleaning/Office)' },
        { id: 'LICENSE', label: '执照/订阅 (License/Sub)' },
        { id: 'LOGISTICS', label: '物流运输 (Logistics)' },
        { id: 'DELIVERY_GRAB', label: '外卖及接送费 (Delivery/Grab/Transport)' }
    ],
    'CAPEX (资产)': [
        { id: 'EQUIPMENT', label: '设备采购 (Equipment)' },
        { id: 'RENOVATION', label: '装修工程 (Renovation)' },
        { id: 'DEPOSIT', label: '押金 (Deposit)' }
    ]
};

// 子分类 → 主分类 映射表
export const CATEGORY_MAP: Record<string, string> = {
    'FRESH': 'KITCHEN', 'DRY': 'KITCHEN', 'SAUCE': 'KITCHEN', 'MEAT': 'KITCHEN',
    'VEG': 'KITCHEN', 'SEAFOOD': 'KITCHEN', 'NOODLE': 'KITCHEN', 'HQ': 'KITCHEN',
    'TEA': 'BAR', 'RTD': 'BAR', 'FRUIT': 'BAR', 'MISC': 'BAR', 'DRINK': 'BAR',
    'PACKAGING': 'GENERAL', 'GENERAL': 'GENERAL', 'TOOLS': 'GENERAL', 'CLEANING': 'GENERAL', 'WASTE': 'GENERAL',
    'GAS': 'FUEL', 'FUEL': 'FUEL', 'CHARCOAL': 'FUEL', 'OIL': 'FUEL', 'DIESEL': 'FUEL', 'PETROL': 'FUEL'
};

export const SUP_INPUT_STYLE = "w-full p-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm font-bold text-[#1A1A1A] outline-none focus:bg-white focus:border-[#FFD700] focus:ring-4 focus:ring-[#FFD700]/10 transition-all placeholder:font-normal placeholder:text-gray-400";
export const SUP_LABEL_STYLE = "text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block ml-1";

export interface SupplierReceivedItem extends PurchaseOrderItem {
    receivedQty: number;
    finalCost: number;
    billByWeight?: boolean;
    receivedWeight?: number;
}
