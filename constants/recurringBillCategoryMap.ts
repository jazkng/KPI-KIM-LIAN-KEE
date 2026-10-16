// ============================================================================
// 固定账单（经常性支出）分类 → 应付账款 / 盈亏分类
// ----------------------------------------------------------------------------
// 固定账单付款（bill_payments）存的是固定账单自己的分类（例如 ELECTRICITY_STAFF、SUBSCRIPTION、OTHER），
// 同步到应付账款的镜像（bill_sync_）才换成 AP 分类。传统账目略过镜像、直接计固定账单付款，
// 所以计入时必须用同一份对照，否则宿舍电费 / 水费、订阅、其他固定账单在传统账目里找不到科目、整笔消失。
// ============================================================================
import type { RecurringBillCategory } from '../types';

export const BILL_TO_AP_CATEGORY: Record<RecurringBillCategory, string> = {
    'RENT': 'RENT',
    'RENT_STAFF': 'RENT_STAFF',
    'ELECTRICITY': 'UTILITIES_ELECTRIC',
    'WATER': 'UTILITIES_WATER',
    'ELECTRICITY_STAFF': 'UTILITIES_ELECTRIC_STAFF',
    'WATER_STAFF': 'UTILITIES_WATER_STAFF',
    'INTERNET': 'INTERNET',
    'WASTE': 'WASTE',
    'LICENSE': 'LICENSE',
    'SUBSCRIPTION': 'LICENSE',
    'OTHER': 'SUPPLIES',
};

/** 固定账单付款计入盈亏时用的分类（已是 AP 分类的照原样） */
export const billPaymentCostCategory = (category: unknown): string => {
    const key = String(category || 'OTHER').toUpperCase();
    return (BILL_TO_AP_CATEGORY as Record<string, string>)[key] || key;
};
