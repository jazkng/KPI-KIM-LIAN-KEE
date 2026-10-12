/**
 * 财务报告的共用计算
 * ------------------------------------------------------------------
 * 这里只放「纯计算」：输入数字 → 输出数字，不碰 Firestore、不碰 React。
 * 好处是同一条公式全店只有一份，改一次全部报表跟着改，也方便单独验算。
 */

// ==================================================================
// 一、基础工具（原本散在各处、各写各的，统一收在这里）
// ==================================================================

/** 占比：part 占 whole 的百分比。whole 是 0 就回 0，不会变成 Infinity/NaN */
export const pct = (part: number, whole: number): number => {
    const w = Number(whole) || 0;
    if (w <= 0) return 0;
    return ((Number(part) || 0) / w) * 100;
};

/**
 * 增长率：(本期 - 上期) / 上期 × 100
 *
 * ⚠️ 上期是 0 的时候没有「增长几 %」这回事（除以 0），所以回 null，
 *    画面上应该显示「新增」而不是 +100% 或 0%。
 *    旧代码在这个情况有的回 100、有的回 0，两边对不上 —— 新代码一律用这个。
 */
export const growthPct = (current: number, previous: number): number | null => {
    const prev = Number(previous) || 0;
    const cur = Number(current) || 0;
    if (prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
};

/** 给画面用：把 growthPct 的结果转成文字 */
export const formatGrowth = (v: number | null, digits = 1): string => {
    if (v === null) return '新增';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(digits)}%`;
};

/** 日期字串（可能带 T 时间）落在 [start, end] 之内 */
export const inDateRange = (dateStr: string, start: string, end: string): boolean => {
    if (!dateStr) return false;
    const d = String(dateStr).split('T')[0];
    return d >= start && d <= end;
};

/** 两个日期之间有几天（含头含尾） */
export const daysBetween = (start: string, end: string): number => {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86400000) + 1);
};

// ==================================================================
// 二、Prime Cost（食材 + 人工）
// ==================================================================

export type HealthLevel = 'GOOD' | 'OK' | 'WARN' | 'BAD';

export interface PrimeCostResult {
    /** 食材 + 人工 的金额 */
    amount: number;
    /** 占营业额几 % */
    percent: number;
    cogsPercent: number;
    laborPercent: number;
    level: HealthLevel;
    /** 距离目标线还差多少钱（正数 = 超支，负数 = 还有空间） */
    gapToTarget: number;
    targetPercent: number;
}

/**
 * Prime Cost 是餐饮最核心的一个数：食材成本 + 人工成本 占营业额的比例。
 * 业界惯例：≤60% 很好、60–65% 健康、65–70% 偏高、>70% 危险。
 * 单看食材或单看人工都会骗人（例如请少人但外包成本高），要合起来看。
 */
export const calcPrimeCost = (
    cogs: number,
    labor: number,
    revenue: number,
    targetPercent = 65,
): PrimeCostResult => {
    const amount = (Number(cogs) || 0) + (Number(labor) || 0);
    const percent = pct(amount, revenue);
    let level: HealthLevel = 'BAD';
    if (percent <= 60) level = 'GOOD';
    else if (percent <= 65) level = 'OK';
    else if (percent <= 70) level = 'WARN';
    return {
        amount,
        percent,
        cogsPercent: pct(cogs, revenue),
        laborPercent: pct(labor, revenue),
        level,
        gapToTarget: amount - (Number(revenue) || 0) * (targetPercent / 100),
        targetPercent,
    };
};

// ==================================================================
// 三、盈亏平衡点
// ==================================================================

export interface BreakEvenResult {
    /** 一个月要做到多少营业额才不亏 */
    revenueNeeded: number;
    /** 平均一天要做多少 */
    dailyNeeded: number;
    /** 目前做了多少 %（100% = 刚好打平） */
    achievedPercent: number;
    /** 还差多少（负数 = 已经超过打平点） */
    shortfall: number;
    /** 贡献毛利率：每做 100 块，扣掉随销量变动的成本后剩几块 */
    contributionMarginPercent: number;
    /** 固定成本合计（人工 + 营运开销） */
    fixedCost: number;
    /** 已经过了几天 / 这段期间共几天 */
    daysElapsed: number;
    daysInPeriod: number;
    /** 剩下的天数每天要做多少才追得上 */
    dailyNeededForRest: number;
    /** 贡献毛利率 <= 0 时无法计算（成本比收入还高） */
    isValid: boolean;
}

/**
 * 盈亏平衡：固定成本 ÷ 贡献毛利率
 *
 * 变动成本 = 随生意量一起动的（食材、外送平台抽佣）
 * 固定成本 = 生意好坏都要付的（人工、租金、水电、其他营运开销）
 *
 * 人工在餐饮其实是半固定（加班会变），这里归到固定成本，
 * 是餐饮业通用的算法，也比较保守（算出来的打平点会高一点，不会骗自己）。
 */
export const calcBreakEven = (input: {
    revenue: number;
    variableCost: number;   // COGS + 平台抽佣等
    fixedCost: number;      // 人工 + OPEX
    daysElapsed: number;
    daysInPeriod: number;
}): BreakEvenResult => {
    const revenue = Number(input.revenue) || 0;
    const variableCost = Number(input.variableCost) || 0;
    const fixedCost = Number(input.fixedCost) || 0;
    const daysElapsed = Math.max(0, Number(input.daysElapsed) || 0);
    const daysInPeriod = Math.max(1, Number(input.daysInPeriod) || 1);

    const variableRate = revenue > 0 ? variableCost / revenue : 0;
    const contributionMargin = 1 - variableRate;
    const isValid = contributionMargin > 0 && revenue > 0;

    const revenueNeeded = isValid ? fixedCost / contributionMargin : 0;
    const shortfall = revenueNeeded - revenue;
    const daysLeft = Math.max(0, daysInPeriod - daysElapsed);

    return {
        revenueNeeded,
        dailyNeeded: revenueNeeded / daysInPeriod,
        achievedPercent: revenueNeeded > 0 ? (revenue / revenueNeeded) * 100 : 0,
        shortfall,
        contributionMarginPercent: contributionMargin * 100,
        fixedCost,
        daysElapsed,
        daysInPeriod,
        dailyNeededForRest: daysLeft > 0 && shortfall > 0 ? shortfall / daysLeft : 0,
        isValid,
    };
};

// ==================================================================
// 四、菜单工程（单品贡献度）
// ==================================================================

export type MenuQuadrant = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';

export interface MenuItemScore {
    name: string;
    sku: string;
    category: string;
    qty: number;
    netSales: number;
    /** 毛利额。isEstimated=false 时是 StoreHub 的真实成本算的，true 时是用品类毛利率推的 */
    estGrossProfit: number;
    /** 毛利率 % */
    marginPercent: number;
    /** 销量占全部的几 % */
    qtyShare: number;
    quadrant: MenuQuadrant;
    /** true = 毛利是用品类毛利率估的；false = StoreHub 里有设这个商品的成本，是真数字 */
    isEstimated: boolean;
}

export const MENU_QUADRANT_LABEL: Record<MenuQuadrant, string> = {
    STAR: '明星 · 又赚又好卖',
    PLOWHORSE: '金牛 · 好卖但不赚',
    PUZZLE: '问题 · 赚钱但少人点',
    DOG: '瘦狗 · 不赚也不好卖',
};

export const MENU_QUADRANT_ADVICE: Record<MenuQuadrant, string> = {
    STAR: '主推。摆在菜单显眼位置，不要降价，确保出品稳定。',
    PLOWHORSE: '客人爱点但赚得少。想办法降成本或小幅调价，别直接砍掉（它带客流）。',
    PUZZLE: '赚钱却没人点。加强推荐、改名字、调整摆盘或做套餐搭配。',
    DOG: '既不赚也不好卖。考虑下架，或改造成新品，省下备料和库存。',
};

/**
 * 菜单工程四象限：销量高低 × 毛利高低。
 *
 * ⚠️ 系统目前没有「单品成本」（SKU 对不上库存品项），
 *    所以毛利是用该 SKU 所属**品类的毛利率**推算出来的，属于估算值，
 *    每一笔都会带 isEstimated: true，画面上一定要标明。
 *    要变成真实数字，需要先建立 SKU ↔ 库存品项 的对照表。
 */
export const calcMenuEngineering = (
    rows: Array<{
        productName: string;
        sku: string;
        qty: number;
        netSales: number;
        category: string;
        /** StoreHub 里设定的平均成本。> 0 代表这个商品有真实成本，优先用它算毛利 */
        avgCost?: number;
    }>,
    marginPercentByCategory: Record<string, number>,
    opts: { minQty?: number } = {},
): {
    items: MenuItemScore[];
    medianQty: number;
    medianProfit: number;
    counts: Record<MenuQuadrant, number>;
    /** 有几项用了 StoreHub 的真实成本 */
    realCostCount: number;
} => {
    const minQty = opts.minQty ?? 0;
    const valid = (rows || []).filter(r => (Number(r.qty) || 0) > minQty);
    const totalQty = valid.reduce((s, r) => s + (Number(r.qty) || 0), 0);

    const enriched = valid.map(r => {
        const netSales = Number(r.netSales) || 0;
        const qty = Number(r.qty) || 0;
        const avgCost = Number(r.avgCost) || 0;

        // StoreHub 有设这个商品的成本 → 用真数字：毛利 = 净销售 - 单位成本 × 数量
        if (avgCost > 0 && qty > 0) {
            const realProfit = netSales - avgCost * qty;
            return {
                name: r.productName,
                sku: r.sku,
                category: r.category,
                qty,
                netSales,
                estGrossProfit: realProfit,
                marginPercent: pct(realProfit, netSales),
                qtyShare: pct(qty, totalQty),
                isEstimated: false,
            };
        }

        // 没设成本 → 退回用所属品类的毛利率推算
        const marginPercent = Number(marginPercentByCategory[r.category]) || 0;
        return {
            name: r.productName,
            sku: r.sku,
            category: r.category,
            qty,
            netSales,
            estGrossProfit: netSales * (marginPercent / 100),
            marginPercent,
            qtyShare: pct(qty, totalQty),
            isEstimated: true,
        };
    });

    const median = (arr: number[]): number => {
        if (arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };
    const medianQty = median(enriched.map(e => e.qty));
    // ⚠️ 纵轴用「估算毛利额」而不是「毛利率」：
    //    毛利率是按品类给的，同一个品类底下每道菜都一样，切出来毫无区分度
    //    （白饭和招牌炒饭都会落在同一格）。改用毛利额 = 销售额 × 品类毛利率，
    //    卖得多、单价高的菜自然浮上来，也才是老板真正关心的「这道菜替我赚了多少钱」。
    const medianProfit = median(enriched.map(e => e.estGrossProfit));

    const counts: Record<MenuQuadrant, number> = { STAR: 0, PLOWHORSE: 0, PUZZLE: 0, DOG: 0 };
    const items: MenuItemScore[] = enriched.map(e => {
        const hotSeller = e.qty >= medianQty;
        const highProfit = e.estGrossProfit >= medianProfit;
        const quadrant: MenuQuadrant = hotSeller
            ? (highProfit ? 'STAR' : 'PLOWHORSE')
            : (highProfit ? 'PUZZLE' : 'DOG');
        counts[quadrant]++;
        return { ...e, quadrant };
    });

    return {
        items,
        medianQty,
        medianProfit,
        counts,
        realCostCount: items.filter(i => !i.isEstimated).length,
    };
};

// ==================================================================
// 五、存货周转
// ==================================================================

export interface InventoryTurnoverResult {
    /** 手上库存值多少钱 */
    stockValue: number;
    /** 平均一天用掉多少食材 */
    dailyCogs: number;
    /** 现有库存还能撑几天 */
    daysOfSupply: number;
    /** 一年周转几次（越高代表货压得越少） */
    turnsPerYear: number;
    level: HealthLevel;
    isValid: boolean;
}

/**
 * 存货周转。
 * ⚠️ 这里用的是「现在的库存值」而不是期初期末平均，
 *    因为系统没有存库存快照。数字会偏向盘点当下的状态，看趋势可以，别当会计报表用。
 *
 * 天数判读（生鲜为主的餐厅）：≤7 天很好、7–14 健康、14–21 偏多、>21 压货太重。
 */
export const calcInventoryTurnover = (
    stockValue: number,
    cogsInPeriod: number,
    daysInPeriod: number,
): InventoryTurnoverResult => {
    const sv = Number(stockValue) || 0;
    const cogs = Number(cogsInPeriod) || 0;
    const days = Math.max(1, Number(daysInPeriod) || 1);
    const dailyCogs = cogs / days;
    const isValid = dailyCogs > 0;
    const daysOfSupply = isValid ? sv / dailyCogs : 0;

    let level: HealthLevel = 'BAD';
    if (!isValid) level = 'OK';
    else if (daysOfSupply <= 7) level = 'GOOD';
    else if (daysOfSupply <= 14) level = 'OK';
    else if (daysOfSupply <= 21) level = 'WARN';

    return {
        stockValue: sv,
        dailyCogs,
        daysOfSupply,
        turnsPerYear: daysOfSupply > 0 ? 365 / daysOfSupply : 0,
        level,
        isValid,
    };
};

// ==================================================================
// 六、现金流预测
// ==================================================================

export interface CashForecastItem {
    label: string;
    amount: number;
    dueDate?: string;
    kind: 'AP' | 'PAYROLL' | 'RECURRING' | 'OTHER';
}

export interface CashForecastResult {
    cashOnHand: number;
    /** 未来这段期间要付出去的总额 */
    totalDue: number;
    byKind: Record<CashForecastItem['kind'], number>;
    /** 预估期末剩多少（含预估进账） */
    projectedBalance: number;
    /** 负数 = 会不够钱 */
    gap: number;
    /** 照目前的日均营业额，还要做几天生意才补得上缺口 */
    daysToCover: number;
    level: HealthLevel;
    items: CashForecastItem[];
}

/**
 * 未来 N 天的现金流。
 * 进账用「日均营业额 × 天数」推，出账用实际待付的应付帐款 + 薪资 + 经常性账单。
 */
export const calcCashForecast = (input: {
    cashOnHand: number;
    items: CashForecastItem[];
    avgDailyRevenue: number;
    horizonDays: number;
    /** 进账里有多少比例最后会变成现金（扣掉食材、人工等当期就要付的），预设 0.15 */
    cashConversionRate?: number;
}): CashForecastResult => {
    const cashOnHand = Number(input.cashOnHand) || 0;
    const horizon = Math.max(1, Number(input.horizonDays) || 30);
    const rate = input.cashConversionRate ?? 0.15;
    const items = input.items || [];

    const byKind: Record<CashForecastItem['kind'], number> = { AP: 0, PAYROLL: 0, RECURRING: 0, OTHER: 0 };
    let totalDue = 0;
    items.forEach(i => {
        const amt = Number(i.amount) || 0;
        byKind[i.kind] = (byKind[i.kind] || 0) + amt;
        totalDue += amt;
    });

    const expectedInflow = (Number(input.avgDailyRevenue) || 0) * horizon * rate;
    const projectedBalance = cashOnHand + expectedInflow - totalDue;
    const gap = projectedBalance;

    let level: HealthLevel = 'GOOD';
    if (projectedBalance < 0) level = 'BAD';
    else if (totalDue > 0 && projectedBalance < totalDue * 0.25) level = 'WARN';
    else if (totalDue > 0 && projectedBalance < totalDue * 0.5) level = 'OK';

    const dailyCash = (Number(input.avgDailyRevenue) || 0) * rate;
    return {
        cashOnHand,
        totalDue,
        byKind,
        projectedBalance,
        gap,
        daysToCover: projectedBalance < 0 && dailyCash > 0 ? Math.abs(projectedBalance) / dailyCash : 0,
        level,
        items: [...items].sort((a, b) => b.amount - a.amount),
    };
};

// ==================================================================
// 七、健康灯号的共用配色
// ==================================================================

export const HEALTH_STYLE: Record<HealthLevel, { text: string; bg: string; border: string; dot: string; label: string }> = {
    GOOD: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', label: '良好' },
    OK:   { text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500',    label: '正常' },
    WARN: { text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: '偏高' },
    BAD:  { text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     label: '危险' },
};
