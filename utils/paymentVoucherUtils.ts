// ============================================================
// paymentVoucherUtils.ts  (v4 — Staff name handling)
//
// v4 改动:
// - getDefaultParticulars 接受 payeeName 参数
// - SALARY / STAFF_ADVANCE 类别会自动带上员工名: "Staff salary advance - Karatul Aini"
// - resolveParticulars 传入 bill.company 当 payeeName
//
// 📁 utils/paymentVoucherUtils.ts
// ============================================================

import { ExpenseItem } from '../types';

// ============================================================
// 公司信息
// ============================================================
export const COMPANY_INFO = {
    name: 'KIM LIAN KEE (KEPONG) SDN. BHD.',
    registrationNo: '202501051840 (1653247-X)',
    address: 'PT709, Jalan Kuang Bertam 3, Taman Kepong, 52100 Kepong, W.P. Kuala Lumpur.',
};

// ============================================================
// Types
// ============================================================
export interface PVParticular {
    description: string;
    category?: string;
    invoiceRef?: string;
    amount: number;
}

export interface PaymentVoucher {
    pvNumber: string;
    isBackdated?: boolean;
    date: string;
    payeeName: string;
    payeeId?: string;
    particulars: PVParticular[];
    totalAmount: number;
    amountInWords: string;
    paymentMethod: 'CASH' | 'BANK_TRANSFER';
    bankRef?: string;
    relatedExpenseIds: string[];
    settlementId?: string;
    preparedBy?: string;
    checkedBy?: string;
    approvedBy?: string;
    supportingDocLink?: string;
    createdAt: string;
    status: 'ACTIVE' | 'VOID' | 'LOCKED';
    voidedAt?: string;
    voidReason?: string;
    backdateGeneratedAt?: string;
    invoiceDateRange?: string; // 👑 新增：账单日期范围，例如 20260102-20260124，方便Google Drive对账
    voucherTitle?: string; // 👑 新增：自定义凭单标题（CASH VOUCHER / CASH BILL / PAYMENT VOUCHER）
}

// ============================================================
// English amount-in-words
// ============================================================
const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n: number): string {
    let str = '';
    if (n >= 100) {
        str += ONES[Math.floor(n / 100)] + ' Hundred';
        n %= 100;
        if (n > 0) str += ' ';
    }
    if (n >= 20) {
        str += TENS[Math.floor(n / 10)];
        if (n % 10 > 0) str += ' ' + ONES[n % 10];
    } else if (n > 0) {
        str += ONES[n];
    }
    return str;
}

export function numberToWords(amount: number): string {
    if (isNaN(amount) || amount < 0) return 'Invalid Amount';
    const rounded = Math.round(amount * 100) / 100;
    const ringgit = Math.floor(rounded);
    const cents = Math.round((rounded - ringgit) * 100);
    let words: string;
    if (ringgit === 0) {
        words = 'Zero';
    } else {
        const millions = Math.floor(ringgit / 1_000_000);
        const thousands = Math.floor((ringgit % 1_000_000) / 1000);
        const remainder = ringgit % 1000;
        const parts: string[] = [];
        if (millions > 0) parts.push(threeDigitsToWords(millions) + ' Million');
        if (thousands > 0) parts.push(threeDigitsToWords(thousands) + ' Thousand');
        if (remainder > 0) parts.push(threeDigitsToWords(remainder));
        words = parts.join(' ');
    }
    let result = `Ringgit Malaysia ${words}`;
    if (cents > 0) result += ` And Cents ${threeDigitsToWords(cents)}`;
    result += ' Only';
    return result;
}

// ============================================================
// 👑 Particulars templates
// ============================================================
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

function getMonthLabel(isoDate: string): string {
    try {
        const d = new Date(isoDate);
        return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
        return '';
    }
}

/**
 * 👑 v4: 第三个参数 payeeName (员工名) 让薪资类自动带上员工名
 * 用法:
 *   getDefaultParticulars('STAFF_ADVANCE', '2026-05-16', 'Karatul Aini')
 *   => "Staff salary advance - Karatul Aini"
 */
export function getDefaultParticulars(categoryId: string, isoDate: string, payeeName?: string): string {
    const month = getMonthLabel(isoDate);
    const m = month ? ` for ${month}` : '';

    // 👑 v4: 员工相关类别 - 带上员工名
    const staffName = (payeeName && payeeName !== 'COMPANY' && payeeName.trim()) ? payeeName.trim() : '';
    const who = staffName ? ` - ${staffName}` : '';

    if (categoryId === 'SALARY') {
        return `Staff salary${who}${month ? ' (' + month + ')' : ''}`;
    }
    if (categoryId === 'STAFF_ADVANCE') {
        return `Staff salary advance${who}`;
    }

    const map: Record<string, string> = {
        // COGS
        INGREDIENT_HQ: `Supply of ingredients from HQ${m}`,
        INGREDIENT_MEAT: `Supply of meat${m}`,
        INGREDIENT_SEAFOOD: `Supply of seafood${m}`,
        INGREDIENT_VEG: `Supply of vegetables and fruits${m}`,
        INGREDIENT_DRY: `Supply of dry goods${m}`,
        INGREDIENT_SAUCE: `Supply of sauces and condiments${m}`,
        INGREDIENT_EGG: `Supply of eggs${m}`,
        INGREDIENT_NOODLE: `Supply of noodles${m}`,
        BEVERAGE: `Supply of beverages${m}`,
        PACKAGING: `Supply of packaging materials${m}`,
        GAS_COGS: `Cooking gas refill`,
        CHARCOAL: `Supply of charcoal`,
        SUPPLIER: `Supply of goods${m}`,
        // OPEX
        RENT: `Shop rental${m}`,
        UTILITIES: `Utility charges${m}`,
        STAFF_MEAL: `Staff meal expenses${m}`,
        MAINTENANCE: `Repair and maintenance services`,
        MARKETING: `Marketing and advertising expenses`,
        PROFESSIONAL: `Professional services fee`,
        SUPPLIES: `Cleaning and office supplies`,
        LICENSE: `License and subscription fee`,
        LOGISTICS: `Logistics and delivery charges`,
        // CAPEX
        EQUIPMENT: `Purchase of equipment`,
        RENOVATION: `Renovation work`,
        DEPOSIT: `Refundable deposit`,
    };
    return map[categoryId] || `Payment for goods / services`;
}

// ============================================================
// 👑 Particulars decision
// ============================================================
export function resolveParticulars(bill: ExpenseItem): string {
    const p = (bill as any).particulars?.trim?.();
    let desc = 'Payment for goods / services';
    if (p) {
        desc = p;
    } else if (bill.category) {
        // 👑 v4: 把 bill.company (收款人) 传进去给薪资类用
        const tpl = getDefaultParticulars(
            bill.category,
            bill.time || bill.paymentDate || new Date().toISOString(),
            bill.company
        );
        if (tpl) desc = tpl;
    } else if (bill.note?.trim()) {
        desc = bill.note.trim();
    }

    // 📅 自动提取账单具体交易日期 (YYYY-MM-DD) 并追加，用于应付明细对账
    const rawDate = bill.time || bill.paymentDate;
    if (rawDate) {
        let datePart = '';
        if (rawDate.includes('T')) {
            datePart = rawDate.split('T')[0];
        } else {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) {
                datePart = d.toISOString().split('T')[0];
            } else {
                datePart = rawDate.trim();
            }
        }
        
        if (datePart && datePart.length >= 8) {
            // 确保描述内没有包含类似日期格式（YYYY-MM-DD 或 DD/MM/YYYY）才追加，避免重复。
            if (!/\d{4}-\d{2}-\d{2}/.test(desc) && !/\d{2}\/\d{2}\/\d{4}/.test(desc)) {
                desc = `${desc} (${datePart})`;
            }
        }
    }
    return desc;
}

export function resolveInvoiceRef(bill: ExpenseItem): string {
    const ref = (bill as any).invoiceRef?.trim?.();
    if (ref) return ref;
    return `#${bill.id.slice(-8)}`;
}

// ============================================================
// Builder
// ============================================================
export function buildPaymentVoucher(params: {
    pvNumber: string;
    payeeName: string;
    payeeId?: string;
    particulars: PVParticular[];
    paymentMethod: 'CASH' | 'BANK_TRANSFER';
    relatedExpenseIds: string[];
    date?: string;
    settlementId?: string;
    bankRef?: string;
    preparedBy?: string;
    checkedBy?: string;
    approvedBy?: string;
    supportingDocLink?: string;
    isBackdated?: boolean;
    invoiceDateRange?: string; // 👑 新增
    voucherTitle?: string; // 👑 新增
}): PaymentVoucher {
    const totalAmount = params.particulars.reduce((sum, p) => sum + (p.amount || 0), 0);
    const nowIso = new Date().toISOString();
    const raw: PaymentVoucher = {
        pvNumber: params.pvNumber,
        isBackdated: params.isBackdated || false,
        date: params.date || nowIso,
        payeeName: params.payeeName,
        payeeId: params.payeeId,
        particulars: params.particulars,
        totalAmount,
        amountInWords: numberToWords(totalAmount),
        paymentMethod: params.paymentMethod,
        bankRef: params.bankRef || '',
        relatedExpenseIds: params.relatedExpenseIds,
        settlementId: params.settlementId,
        preparedBy: params.preparedBy || '',
        checkedBy: params.checkedBy || '',
        approvedBy: params.approvedBy || '',
        supportingDocLink: params.supportingDocLink || '',
        createdAt: nowIso,
        status: params.isBackdated ? 'LOCKED' : 'ACTIVE',
        backdateGeneratedAt: params.isBackdated ? nowIso : undefined,
        invoiceDateRange: params.invoiceDateRange,
        voucherTitle: params.voucherTitle,
    };
    return JSON.parse(JSON.stringify(raw));
}

export function billsToParticulars(bills: ExpenseItem[]): PVParticular[] {
    return bills.map(b => ({
        description: resolveParticulars(b),
        category: b.category,
        invoiceRef: resolveInvoiceRef(b),
        amount: b.outstandingAmount ?? b.totalBillAmount ?? b.amount ?? 0,
    }));
}

// ============================================================
// 👑 Backdate grouping
// ============================================================
export interface BackdatePVGroup {
    dateKey: string;
    payeeName: string;
    paymentMethod: 'CASH' | 'BANK_TRANSFER';
    bills: ExpenseItem[];
    totalAmount: number;
}

export function groupBillsForBackdate(bills: ExpenseItem[]): BackdatePVGroup[] {
    const map = new Map<string, BackdatePVGroup>();
    for (const b of bills) {
        const dateStr = (b.paymentDate || b.time || '').split('T')[0];
        if (!dateStr) continue;
        const method: 'CASH' | 'BANK_TRANSFER' =
            b.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER';
        const key = `${dateStr}__${b.company}__${method}`;
        if (!map.has(key)) {
            map.set(key, {
                dateKey: dateStr,
                payeeName: b.company,
                paymentMethod: method,
                bills: [],
                totalAmount: 0,
            });
        }
        const g = map.get(key)!;
        g.bills.push(b);
        g.totalAmount += (b.amount || 0);
    }
    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}