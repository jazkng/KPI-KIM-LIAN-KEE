// ==========================================
// 🛡️ 每日结算 — 核对（对账）共用逻辑
// ------------------------------------------
// 以前「单笔核对」和「历史列表」各自算一遍应收金额，两边容易算不一样。
// 现在统一在这里算，明细弹窗、历史卡片、批量核对三个地方共用同一份。
//
// 自动平账费用的 ID 规则（重要）：
//   recon_fee_<结算ID>_<通道key>
// 旧版本会在后面再加一个时间戳，所以重新核对时会产生第二笔重复费用。
// clearReconFees() 用前缀范围查询把「旧的带时间戳」和「新的固定 ID」一次清掉，
// 再按新差额重新写一笔 —— 改多少次都不会重复记账。
// ==========================================

import { SettlementRecord, ExpenseItem } from '../types';
import { DataManager } from './dataManager';

export type ReconChannelKey = 'tng' | 'debit' | 'credit' | 'amex' | 'grab' | 'panda' | 'shopee';

export interface ReconChannel {
    key: ReconChannelKey;
    label: string;
    /** 系统预估应该入账多少（外卖已扣广告费） */
    expected: number;
    /** 未扣任何费用的原始金额 */
    gross: number;
    /** 已核对时的实收金额；没核对过 = null */
    actual: number | null;
    isReconciled: boolean;
    /** 平台通道（差额记 MARKETING_FEE），非平台记 BANK_FEE */
    isPlatform: boolean;
}

export const isChannelReconciled = (reconStatus: any, key: string): boolean => {
    const val = reconStatus?.[key];
    return val === true || (typeof val === 'number');
};

export const getReconActual = (reconStatus: any, key: string): number | null => {
    const val = reconStatus?.[key];
    if (typeof val === 'number') return val;
    return null;
};

const num = (v: any): number => Number(v) || 0;

/** 一笔结算 → 七个核对通道（金额是 0 的也会回，由画面自己决定要不要显示） */
export const getReconChannels = (record: SettlementRecord): ReconChannel[] => {
    const rs = (record as any).reconStatus || {};
    const d = (record.sales.deliveryBreakdown || {}) as any;

    // 外卖：Net 没填就用 Gross 兜底，再扣广告费
    const grabNet = num(d.grabNet) > 0 ? num(d.grabNet) : (num(d.grabGross) || num(d.grab));
    const pandaNet = num(d.pandaNet) > 0 ? num(d.pandaNet) : (num(d.pandaGross) || num(d.panda));
    const shopeeNet = num(d.shopeeNet) > 0 ? num(d.shopeeNet) : (num(d.shopeeGross) || num(d.shopee));

    const raw: { key: ReconChannelKey; label: string; expected: number; gross: number; isPlatform: boolean }[] = [
        { key: 'tng',    label: 'TNG eWallet',     expected: num(record.sales.tng),     gross: num(record.sales.tng),     isPlatform: false },
        { key: 'debit',  label: 'Debit / DuitNow', expected: num(record.sales.duitnow), gross: num(record.sales.duitnow), isPlatform: false },
        { key: 'credit', label: 'Credit Card',     expected: num(record.sales.card),    gross: num(record.sales.card),    isPlatform: false },
        { key: 'amex',   label: 'Amex',            expected: num(record.sales.amex),    gross: num(record.sales.amex),    isPlatform: false },
        { key: 'grab',   label: 'GrabFood',        expected: grabNet - num(d.grabAds),   gross: num(d.grabGross) || grabNet,   isPlatform: true },
        { key: 'panda',  label: 'FoodPanda',       expected: pandaNet - num(d.pandaAds), gross: num(d.pandaGross) || pandaNet, isPlatform: true },
        { key: 'shopee', label: 'ShopeeFood',      expected: shopeeNet - num(d.shopeeAds), gross: num(d.shopeeGross) || shopeeNet, isPlatform: true },
    ];

    return raw.map(c => ({
        ...c,
        expected: Number(c.expected.toFixed(2)),
        actual: getReconActual(rs, c.key),
        isReconciled: isChannelReconciled(rs, c.key),
    }));
};

/** 这笔结算还有没有该核对而没核对的通道（金额 0 的不算） */
export const hasPendingRecon = (record: SettlementRecord): boolean =>
    getReconChannels(record).some(c => c.expected > 0 && !c.isReconciled);

export const RECON_FEE_ID = (settlementId: string, key: string) => `recon_fee_${settlementId}_${key}`;

/**
 * 核对 / 重新核对一个通道。
 * 会先清掉这个通道以前产生的自动平账费用（含旧版带时间戳的），再按新差额写一笔。
 * 回传新的 reconStatus，呼叫端自己更新画面。
 */
export const applyRecon = async (
    record: SettlementRecord,
    channel: { key: string; label: string; expected: number },
    actual: number,
): Promise<Record<string, any>> => {
    const expected = Number(Number(channel.expected).toFixed(2));
    const actualNum = Number(Number(actual).toFixed(2));
    const diff = Number((expected - actualNum).toFixed(2));
    const isPlatform = ['grab', 'panda', 'shopee'].includes(channel.key);

    // 1️⃣ 先清掉旧的自动平账费用（重新核对时不会重复记账）
    await DataManager.clearReconFees(record.id, channel.key);

    // 2️⃣ 有差额才记费用
    if (diff > 0) {
        const expense: ExpenseItem = {
            id: RECON_FEE_ID(record.id, channel.key),
            category: isPlatform ? 'MARKETING_FEE' : 'BANK_FEE',
            expenseType: 'GENERAL',
            company: `${channel.label} (${isPlatform ? '广告/异常扣款' : '银行手续费'})`,
            amount: diff,
            totalBillAmount: diff,
            outstandingAmount: 0,
            paymentStatus: 'PAID',
            paymentMethod: 'BANK_TRANSFER',
            time: `${record.date}T12:00:00.000Z`,
            createdAt: new Date().toISOString(),
            note: `[系统自动平账] 预期记账: ${expected} | 实收: ${actualNum} | ${channel.label}`,
            paidBy: 'COMPANY',
        } as ExpenseItem;
        await DataManager.saveStandaloneExpense(expense);
    }

    // 3️⃣ 写回核对状态
    const rs = { ...((record as any).reconStatus || {}), [channel.key]: actualNum };
    await DataManager.updateSettlementReconStatus(record.id, rs);
    return rs;
};

/**
 * 直接编辑结算金额后，重算 总额 / POS 总额 / 现金差异。
 * 公式跟当班提交时用的是同一套（见 SettlementModule 的 totals）。
 */
export const recalcSettlement = (r: SettlementRecord): SettlementRecord => {
    const s = r.sales;
    const d = (s.deliveryBreakdown || {}) as any;
    const posSales = num(s.cash) + num(s.tng) + num(s.duitnow) + num(s.card) + num(s.amex);

    const grabNet = num(d.grabNet) > 0 ? num(d.grabNet) : num(d.grabGross);
    const pandaNet = num(d.pandaNet) > 0 ? num(d.pandaNet) : num(d.pandaGross);
    const shopeeNet = num(d.shopeeNet) > 0 ? num(d.shopeeNet) : num(d.shopeeGross);
    const grab = grabNet - num(d.grabAds);
    const panda = pandaNet - num(d.pandaAds);
    const shopee = shopeeNet - num(d.shopeeAds);
    const delivery = grab + panda + shopee + num(d.lalamove);

    const dayExpenses = ((r as any).dayExpenses || []) as any[];
    const totalDayExpenses = dayExpenses.reduce((sum, e) => sum + num(e.amount), 0);
    const expectedCash = num(r.openingCash) + num(s.cash) - totalDayExpenses - num((r as any).ownerWithdrawal);
    const variance = Number((num(r.closingCash) - expectedCash).toFixed(2));

    return {
        ...r,
        variance,
        sales: {
            ...s,
            total: Number((posSales + delivery).toFixed(2)),
            storeHubTotal: Number(posSales.toFixed(2)),
            deliveryBreakdown: { ...d, grabNet, pandaNet, shopeeNet, grab, panda, shopee },
        },
    };
};
