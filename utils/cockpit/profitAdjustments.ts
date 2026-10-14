// ============================================================================
// 老板经营驾驶舱 · 利润引擎修正（PR B）
// ----------------------------------------------------------------------------
// 财务报表（FinancialReport / aggregateMonth）有几处已知口径缺口。驾驶舱在自己的计算里修正，
// 财务报表本身不改（避免影响现有报表与导出），并把每一项差异列出，方便对账：
//
// 1. 外送平台扣款：未对账的日子，财务报表用「平台净额（未扣广告）」算抽佣，广告没被扣到。
//    驾驶舱：已对账 → 总额 − 实收；未对账 → 总额 −（净额 − 广告），并标为预估。
// 2. 收款手续费：对账时自动建立的 recon_fee_*（BANK_FEE：TNG / 卡 / DuitNow 实收少于记账）
//    被财务报表整批略过。这是真实成本，驾驶舱计入。
//    平台通道的 recon_fee_（MARKETING_FEE）已经反映在「总额 − 实收」里，不再重复计入。
// 3. 日结钱箱现金支出（dayExpenses）：钱实际已从钱箱付出，但没有分类、财务报表未计入。驾驶舱计入。
//
// 纯函数，不读写资料库。
// ============================================================================

const num = (v: unknown): number => Number(v) || 0;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export const PLATFORMS = ['grab', 'panda', 'shopee'] as const;
const LABEL: Record<(typeof PLATFORMS)[number], string> = { grab: 'GrabFood', panda: 'Foodpanda', shopee: 'ShopeeFood' };

export interface ProfitAdjustments {
    /** 正确的外送平台扣款合计（抽佣 + 广告 + 异常扣款） */
    platformCost: number;
    /** 财务报表口径算出的平台扣款（对照用） */
    platformCostReport: number;
    /** 有平台营业额但尚未对账的「日 × 平台」数 */
    unreconciledPlatformDays: number;
    platformRows: { label: string; amount: number; note?: string }[];
    /** 收款手续费（非平台的对账差额） */
    bankFees: number;
    bankFeeCount: number;
    /** 日结钱箱现金支出 */
    pettyCash: number;
    pettyCashCount: number;
}

/** 与 aggregateMonth 相同的平台扣款算法（对照用） */
const reportPlatformCost = (b: any, rs: any) => {
    let total = 0;
    const pick = (key: string, fallback: number) => (typeof rs?.[key] === 'number' ? Number(rs[key]) : fallback);
    const g = num(b.grabGross), gNetRaw = pick('grab', num(b.grabNet) || num(b.grab)), gNet = gNetRaw > 0 ? gNetRaw : g;
    const p = num(b.pandaGross) || num(b.panda), pNetRaw = pick('panda', b.pandaNet !== undefined ? num(b.pandaNet) : num(b.panda)), pNet = pNetRaw > 0 ? pNetRaw : p;
    const s = num(b.shopeeGross) || num(b.shopee), sNetRaw = pick('shopee', b.shopeeNet !== undefined ? num(b.shopeeNet) : num(b.shopee)), sNet = sNetRaw > 0 ? sNetRaw : s;
    const comm = [[g, gNet, num(b.grabAds)], [p, pNet, num(b.pandaAds)], [s, sNet, num(b.shopeeAds)]] as const;
    comm.forEach(([gross, net, ads]) => {
        const c = net > 0 && gross > net ? gross - net : 0;
        total += Math.max(0, c - ads) + ads;
    });
    return total;
};

export const computeProfitAdjustments = (
    settlements: { date?: string; sales?: any; dayExpenses?: any[]; reconStatus?: any }[],
    expenses: { id?: string; category?: string; time?: string; amount?: number }[],
    start: string,
    end: string,
): ProfitAdjustments => {
    const inRange = (d?: string) => {
        const day = String(d || '').slice(0, 10);
        return !!day && day >= start && day <= end;
    };
    const perPlatform: Record<string, { amount: number; unreconciled: number }> = {};
    let platformCost = 0;
    let platformCostReport = 0;
    let unreconciledPlatformDays = 0;
    let pettyCash = 0;
    let pettyCashCount = 0;

    settlements.forEach(s => {
        if (!inRange(s.date)) return;
        const b = s.sales?.deliveryBreakdown || {};
        const rs = (s as any).reconStatus || {};
        PLATFORMS.forEach(ch => {
            // 总额定义与 aggregateMonth 相同：Grab 只看 grabGross；Panda / Shopee 无总额时退回旧栏位
            const gross = ch === 'grab' ? num(b.grabGross) : num(b[`${ch}Gross`]) || num(b[ch]);
            const netField = num(b[`${ch}Net`]);
            const net = netField > 0 ? netField : gross;
            const ads = num(b[`${ch}Ads`]);
            if (gross === 0 && ads === 0) return;
            const actual = typeof rs[ch] === 'number' ? Number(rs[ch]) : null;
            const deduction = Math.max(0, actual !== null ? gross - actual : gross - (net - ads));
            const slot = (perPlatform[ch] ||= { amount: 0, unreconciled: 0 });
            slot.amount += deduction;
            if (actual === null && gross > 0) { slot.unreconciled += 1; unreconciledPlatformDays += 1; }
            platformCost += deduction;
        });
        platformCostReport += reportPlatformCost(b, rs);
        (s.dayExpenses || []).forEach(e => {
            const a = num(e?.amount);
            if (a > 0) { pettyCash += a; pettyCashCount += 1; }
        });
    });

    let bankFees = 0;
    let bankFeeCount = 0;
    expenses.forEach(e => {
        if (!String(e?.id || '').startsWith('recon_fee_')) return;
        if (String(e?.category || '').toUpperCase() !== 'BANK_FEE') return; // 平台通道的差额已含在「总额 − 实收」
        if (!inRange(e.time)) return;
        bankFees += num(e.amount);
        bankFeeCount += 1;
    });

    return {
        platformCost: round2(platformCost),
        platformCostReport: round2(platformCostReport),
        unreconciledPlatformDays,
        platformRows: PLATFORMS.filter(ch => perPlatform[ch]).map(ch => ({
            label: LABEL[ch],
            amount: round2(perPlatform[ch].amount),
            ...(perPlatform[ch].unreconciled ? { note: `${perPlatform[ch].unreconciled} 天未对账，按平台报表（净额 − 广告）预估` } : {}),
        })),
        bankFees: round2(bankFees),
        bankFeeCount,
        pettyCash: round2(pettyCash),
        pettyCashCount,
    };
};
