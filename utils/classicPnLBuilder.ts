// ==========================================
// 📒 传统账目 — 报表建构器
// ------------------------------------------
// 把销售 (StoreHub) + 成本 (系统支出) 组成一张传统账本的行。
// 画面渲染和 Excel 导出共用这里，确保两边数字永远一致。
// ==========================================

import { StorehubMonthlySales, scaleToInStore } from './storehubImport';
import { getActiveSalesRules } from '../constants/salesRulesRuntime';
import {
    SalesCategoryId,

} from '../constants/salesCategoryRules';
import {
    CLASSIC_COST_LINES,
    SECTION_LABELS,
    ClassicCostSection,
    LABOR_DEPT_LINES,
    LABOR_DEPT_UNASSIGNED,
    CATEGORY_MARGIN_PAIRS,
    CategoryMarginPair,
    type ClassicCostLine,
} from '../constants/classicPnLCostMap';
import { categorizeExpense } from './monthlyPnLAggregator';

/** 部门薪资：department 值 → 金额。key 'UNASSIGNED' 表示没填 department 的 */
export type LaborByDept = Record<string, number>;

export interface PlatformGross {
    grab: number;
    shopee: number;
    panda: number;
    lalamove: number;
}

/** 系统支出分类的金额（catKey → 金额），由 FinancialReport 的 lists 摊平而来 */
export type CostByCategory = Record<string, number>;

export interface ClassicRow {
    id: string;
    label: string;
    /** 0 = 大项(SALES/COST/…)，1 = 科目，2 = 细项 */
    level: 0 | 1 | 2;
    amount: number;
    /** 占销售额比例；大项与科目才算 */
    ratio: number | null;
    /** 大项行，画面上要粗体 + 底色 */
    isSection: boolean;
    /** 说明文字，画面上「科目说明」区会列出来 */
    note?: string;
    /** true = 这行有问题要注意，画面标 ⚠ */
    warn?: boolean;
    /** 这一行是推算值不是实数 */
    isEstimated?: boolean;
}

export interface ClassicPnLData {
    month: string;
    rows: ClassicRow[];
    salesTotal: number;
    costTotal: number;
    personalTotal: number;
    /** SELLING & DISTRIBUTION（平台抽佣 + 推广）*/
    sellingTotal: number;
    operationTotal: number;
    capexTotal: number;
    /** 毛利 = SALES − COST */
    grossProfit: number;
    /** 净利 = SALES − COST − PERSONAL − OPERATION（不扣 CAPEX） */
    netProfit: number;
    inStoreRatio: number | null;
    hasStorehubData: boolean;
}

export interface BuildClassicPnLInput {
    month: string;
    storehub: StorehubMonthlySales | null;
    platformGross: PlatformGross;
    costByCategory: CostByCategory;
    viewMode: 'SIMPLE' | 'DETAILED';
    channelMode: 'IN_STORE' | 'ALL_CHANNEL';
    /** 关掉就不产生 COST / PERSONAL / OPERATION 三段 */
    includeCost?: boolean;
    /**
     * 成本明细模式：
     *   'SUMMARY'  = 只显示科目行（海鲜一行合计）
     *   'DETAILED' = 有子行的科目展开（海鲜拆成鱼/虾/Sotong/Lala/加工品）
     * ⚠️ 子行只是拆解，不加进小计。
     */
    costDetailMode?: 'SUMMARY' | 'DETAILED';
    /**
     * 部门薪资明细（来自薪资单 + 员工 department 栏位）。
     * ⚠️ 这是 LABOUR CHARGES 的拆解，不会加进任何小计。
     */
    laborByDept?: LaborByDept;
    /**
     * 每日结算的店内收款净额（cash + tng + card − refund）。
     * 👑 这是 SHOP LOT SALES 的权威来源 —— 每日结算是照 StoreHub 和平台后台填的，以它为准。
     * StoreHub 的 SKU 报表只负责「这些钱是卖什么赚的」，不负责金额本身。
     */
    inStoreSales: number;
}

const sumSources = (cost: CostByCategory, sources: string[]): number =>
    sources.reduce((s, k) => s + (cost[k] || 0), 0);

/** 没有对应科目的分类，按性质放进现有的「其他」科目（不新增行，保留传统排版） */
const FALLBACK_LINE: Record<string, { line: string; child?: string }> = {
    COGS: { line: 'INGREDIENTS', child: 'ING_OTHERS' },
    OPEX: { line: 'OTHER_OPEX' },
    DELIVERY_COST: { line: 'OTHER_OPEX' },
    LABOR: { line: 'LABOUR_CHARGES' },
};
const MAPPED_KEYS = new Set(CLASSIC_COST_LINES.flatMap(l => l.sources));

/**
 * 传统账目实际使用的科目：对照表 + 没有对应科目的分类（2026-10-16 起不再整笔消失）。
 * 以前不在对照表的分类（例如 SUBSCRIPTION、OFFICE_SUPPLY）在财务报表首页有计入净利，传统账目却整笔不见。
 * 现在按 categorizeExpense 的性质并入 INGREDIENTS（其他）/ OTHER OPERATING EXPENSES / LABOUR CHARGES，
 * 并在该行的提示列出是哪些分类。转账、押金、借款、分红、资产（IGNORE / ASSET / DIVIDEND / CAPEX）照旧不计。
 */
/** 某个分类在传统账目进哪一行（含后备行）；不计的分类回 null */
export const classicLineOf = (key: string): { line: ClassicCostLine; folded: boolean } | null => {
    const direct = CLASSIC_COST_LINES.find(l => l.sources.includes(key));
    if (direct) return { line: direct, folded: false };
    const fb = FALLBACK_LINE[categorizeExpense(key)];
    const line = fb && CLASSIC_COST_LINES.find(l => l.id === fb.line);
    return line ? { line, folded: true } : null;
};

export const classicLinesFor = (costByCategory: CostByCategory): { lines: ClassicCostLine[]; folded: { key: string; lineId: string }[] } => {
    const folded = Object.keys(costByCategory)
        .filter(k => Math.abs(costByCategory[k] || 0) > 0.005 && !MAPPED_KEYS.has(k) && FALLBACK_LINE[categorizeExpense(k)])
        .map(k => ({ key: k, lineId: FALLBACK_LINE[categorizeExpense(k)].line, child: FALLBACK_LINE[categorizeExpense(k)].child }));
    if (!folded.length) return { lines: CLASSIC_COST_LINES, folded: [] };
    const lines = CLASSIC_COST_LINES.map(l => {
        const mine = folded.filter(x => x.lineId === l.id);
        if (!mine.length) return l;
        const keys = mine.map(x => x.key);
        return {
            ...l,
            sources: [...l.sources, ...keys],
            note: `${l.note ? `${l.note}。` : ''}⚠️ 含没有对应科目的分类：${keys.join('、')}`,
            warn: true,
            children: l.children?.map(c => {
                const extra = mine.filter(x => x.child === c.id).map(x => x.key);
                return extra.length ? { ...c, sources: [...c.sources, ...extra] } : c;
            }),
        };
    });
    return { lines, folded: folded.map(({ key, lineId }) => ({ key, lineId })) };
};

/** LABOUR CHARGES 各来源科目的中文名，给「记账来源拆解」用 */
const LABOUR_SOURCE_LABEL: Record<string, string> = {
    SALARY: '薪资 SALARY（兼职等）',
    PAYROLL: '薪资入账 PAYROLL',
    EPF: '公积金 EPF/KWSP',
    SOCSO: '社险 SOCSO/PERKESO',
    EPF_SOCSO: '法定缴款（EPF/SOCSO/EIS/LINDUNG/PCB）',
    EIS: '就业保险 EIS',
    LINDUNG: 'LINDUNG 24 Jam (SKBBK)',
    PCB: '所得税 PCB',
    STAFF_ADVANCE: '员工预支 STAFF ADVANCE',
    STAFF_MEAL: '员工餐 STAFF MEAL',
    ALLOWANCE: '津贴 ALLOWANCE',
    COMMISSION: '佣金 COMMISSION',
};

export const buildClassicPnL = (input: BuildClassicPnLInput): ClassicPnLData => {
    const {
        month, storehub, platformGross, costByCategory, viewMode, channelMode,
        includeCost = true, laborByDept, inStoreSales, costDetailMode = 'SUMMARY',
    } = input;
    const rows: ClassicRow[] = [];

    // ==========================================
    // SALES
    // ------------------------------------------
    // 金额以「每日结算」为准（它照 StoreHub + 平台后台填，是权威）：
    //   PLATFORM SALES = 每日结算的平台 Gross
    //   SHOP LOT SALES = 每日结算的店内收款净额
    // StoreHub SKU 报表只用来把 SHOP LOT 拆成品类，不决定总额。
    // ==========================================
    const platformTotal =
        platformGross.grab + platformGross.shopee + platformGross.panda + platformGross.lalamove;

    let groupRows: {
        id: string; label: string; amount: number; underShopLot: boolean;
        children?: { id: string; label: string; amount: number; note?: string }[];
    }[] = [];
    const isEstimated = channelMode === 'IN_STORE' && !!storehub;

    // 品类缩放比例 = 每日结算店内收款 ÷ SKU 报表全渠道合计
    // （两边都是店内价口径，平台加价不影响这个比例）
    let categoryRatio: number | null = null;
    if (storehub && storehub.totals.allChannelNet > 0) {
        categoryRatio = inStoreSales / storehub.totals.allChannelNet;
    }

    if (storehub) {
        const base: Record<SalesCategoryId, number> =
            channelMode === 'IN_STORE' && categoryRatio !== null
                ? scaleToInStore(storehub.categoryTotals, categoryRatio)
                : storehub.categoryTotals;

        // 版面走「执行期设定」：使用者在设定页排过就用他的，没有就用内建
        const activeRules = getActiveSalesRules();
        const defs = viewMode === 'SIMPLE' ? activeRules.groupsSimple : activeRules.groupsDetailed;
        groupRows = defs.map(g => ({
            id: g.id,
            label: g.label,
            amount: g.members.reduce((s, m) => s + (base[m] || 0), 0),
            underShopLot: g.underShopLot,
            children: (g.children || []).map(c => ({
                id: c.id,
                label: c.label,
                amount: c.members.reduce((s, m) => s + (base[m] || 0), 0),
                note: c.note,
            })),
        }));
    }

    const rawShopLot = groupRows.filter(g => g.underShopLot).reduce((s, g) => s + g.amount, 0);
    const rawSide = groupRows.filter(g => !g.underShopLot).reduce((s, g) => s + g.amount, 0);

    // 店内总额一律用每日结算的数字。
    // 有 SKU 报表且是店内推算模式 → 品类拆解加总本来就等于它；
    // 没 SKU 报表 → SHOP LOT 仍显示每日结算的金额，只是没有品类明细。
    const useSettlementTotal = channelMode === 'IN_STORE' || !storehub;
    const shopLotTotal = useSettlementTotal ? inStoreSales - rawSide : rawShopLot;
    const sideTotal = rawSide;

    const salesTotal = platformTotal + shopLotTotal + sideTotal;
    const r = (v: number) => (salesTotal > 0 ? v / salesTotal : null);

    rows.push({ id: 'SALES', label: 'SALES', level: 0, amount: salesTotal, ratio: salesTotal > 0 ? 1 : null, isSection: true });

    rows.push({ id: 'PLATFORM_SALES', label: 'PLATFORM SALES', level: 1, amount: platformTotal, ratio: r(platformTotal), isSection: false });
    ([
        { id: 'GRAB', label: 'Grab', v: platformGross.grab },
        { id: 'SHOPEE', label: 'ShopeeFood', v: platformGross.shopee },
        { id: 'PANDA', label: 'FoodPanda', v: platformGross.panda },
        { id: 'LALAMOVE', label: 'Lalamove', v: platformGross.lalamove },
    ]).filter(x => x.v !== 0).forEach(x => {
        rows.push({ id: `PLAT_${x.id}`, label: x.label, level: 2, amount: x.v, ratio: r(x.v), isSection: false });
    });

    rows.push({
        id: 'SHOP_LOT_SALES', label: 'SHOP LOT SALES', level: 1,
        amount: shopLotTotal, ratio: r(shopLotTotal), isSection: false,
        note: storehub ? undefined : '金额来自每日结算，正确。但这个月还没导入 StoreHub SKU 报表，所以没有品类明细。',
        warn: !storehub,
    });
    groupRows.filter(g => g.underShopLot).forEach(g => {
        rows.push({ id: `SL_${g.id}`, label: g.label, level: 2, amount: g.amount, ratio: r(g.amount), isSection: false, isEstimated });
    });
    groupRows.filter(g => !g.underShopLot).forEach(g => {
        rows.push({ id: `SD_${g.id}`, label: g.label, level: 1, amount: g.amount, ratio: r(g.amount), isSection: false, isEstimated });
        // 细分子项只在有定义时展开（合计模式的 defs 没有 children）
        (g.children || []).forEach(c => {
            rows.push({
                id: `SD_${g.id}_${c.id}`, label: c.label, level: 2,
                amount: c.amount, ratio: r(c.amount), isSection: false, isEstimated,
                note: c.note,
            });
        });
    });

    // ==========================================
    // COST / PERSONAL / OPERATION / CAPEX
    // ==========================================
    let costTotal = 0, personalTotal = 0, sellingTotal = 0, operationTotal = 0, capexTotal = 0;

    if (includeCost) {
        const sectionOrder: ClassicCostSection[] = ['COST', 'PERSONAL', 'SELLING', 'OPERATION', 'CAPEX'];
        const sectionSums: Record<ClassicCostSection, number> = { COST: 0, PERSONAL: 0, SELLING: 0, OPERATION: 0, CAPEX: 0 };
        const { lines: costLines } = classicLinesFor(costByCategory);

        // 先算各段小计
        costLines.forEach(line => {
            sectionSums[line.section] += sumSources(costByCategory, line.sources);
        });

        sectionOrder.forEach(sec => {
            const total = sectionSums[sec];
            rows.push({
                id: `SEC_${sec}`,
                label: SECTION_LABELS[sec],
                level: 0,
                amount: total,
                ratio: r(total),
                isSection: true,
            });
            costLines.filter(l => l.section === sec).forEach(line => {
                const amt = sumSources(costByCategory, line.sources);
                rows.push({
                    id: line.id,
                    label: line.label,
                    level: 1,
                    amount: amt,
                    ratio: r(amt),
                    isSection: false,
                    note: line.note,
                    warn: line.warn,
                });

                // 📊 细分模式：有 children 的科目展开成 level 2 子行（纯拆解，不进小计）
                if (costDetailMode === 'DETAILED' && line.children && line.children.length > 0) {
                    line.children.forEach(child => {
                        const childAmt = sumSources(costByCategory, child.sources);
                        rows.push({
                            id: child.id,
                            label: child.label,
                            level: 2,
                            amount: childAmt,
                            ratio: r(childAmt),
                            isSection: false,
                            note: child.note,
                        });
                    });
                }

                // 👥 LABOUR CHARGES 底下挂部门明细（level 2，纯拆解，不进小计）
                if (line.id === 'LABOUR_CHARGES' && laborByDept) {
                    LABOR_DEPT_LINES.forEach(d => {
                        const v = d.departments.reduce((s, k) => s + (laborByDept[k] || 0), 0);
                        rows.push({
                            id: d.id,
                            label: d.label,
                            level: 2,
                            amount: v,
                            ratio: r(v),
                            isSection: false,
                        });
                    });
                    const unassigned = laborByDept['UNASSIGNED'] || 0;
                    if (unassigned > 0) {
                        rows.push({
                            id: LABOR_DEPT_UNASSIGNED.id,
                            label: LABOR_DEPT_UNASSIGNED.label,
                            level: 2,
                            amount: unassigned,
                            ratio: r(unassigned),
                            isSection: false,
                            warn: true,
                            note: '这些员工的档案没填 department，也猜不出来。去「员工档案」补上部门就会自动归位。金额没有消失，只是还没分类。',
                        });
                    }

                    // 👑 2026-09 改版：部门明细改用「净发 + 预支」口径，
                    //    加上底下的兼职薪资和员工餐，正好 = LABOUR CHARGES，老板可以直接加起来对。
                    //    （以前部门用「雇佣总成本」含雇主公积金，跟 LABOUR CHARGES 口径不同，永远差一截）
                    //    这两行不管有没有差额都要显示，不然老板看不到兼职和员工餐。
                    const COVERED_BY_DEPT = ['PAYROLL', 'STAFF_ADVANCE'];
                    const srcRows = (line.sources || [])
                        .filter(key => !COVERED_BY_DEPT.includes(key))
                        .map(key => ({ key, value: costByCategory[key] || 0 }))
                        .filter(x => Math.abs(x.value) > 0.005)
                        .sort((a, b) => b.value - a.value);

                    srcRows.forEach(x => {
                        rows.push({
                            id: `LABOUR_SRC_${x.key}`,
                            label: `${LABOUR_SOURCE_LABEL[x.key] || x.key}`,
                            level: 2,
                            amount: x.value,
                            ratio: r(x.value),
                            isSection: false,
                        });
                    });

                    // 全部拆解行（部门 + 上面这几笔）理论上要正好等于 LABOUR CHARGES。
                    // 对不上才提示，让老板知道有钱没归位。
                    const deptSum = Object.values(laborByDept).reduce((s, v) => s + v, 0);
                    const srcSum = srcRows.reduce((s, x) => s + x.value, 0);
                    const gap = Number((amt - deptSum - srcSum).toFixed(2));
                    if (deptSum > 0 && Math.abs(gap) > 1) {
                        rows.push({
                            id: 'LABOUR_GAP',
                            label: '　　⚠ 对不上的差额（请检查）',
                            level: 2,
                            amount: gap,
                            ratio: r(gap),
                            isSection: false,
                            warn: true,
                            note: `上面的部门明细 + 这几笔加起来是 ${(deptSum + srcSum).toFixed(2)}，但 LABOUR CHARGES 是 ${amt.toFixed(2)}，差 ${gap.toFixed(2)}。正常情况应该是 0，有数字代表有薪资或支出没有归到部门。`,
                        });
                    }
                }
            });
        });

        costTotal = sectionSums.COST;
        personalTotal = sectionSums.PERSONAL;
        sellingTotal = sectionSums.SELLING;
        operationTotal = sectionSums.OPERATION;
        capexTotal = sectionSums.CAPEX;
    }

    const grossProfit = salesTotal - costTotal;
    // ⚠️ 新增 SELLING 段之后，净利一定要一起扣，不然会被高估
    const netProfit = salesTotal - costTotal - personalTotal - sellingTotal - operationTotal;

    if (includeCost) {
        rows.push({ id: 'GROSS_PROFIT', label: 'GROSS PROFIT (毛利)', level: 0, amount: grossProfit, ratio: r(grossProfit), isSection: true });
        rows.push({ id: 'NET_PROFIT', label: 'NET PROFIT (净利)', level: 0, amount: netProfit, ratio: r(netProfit), isSection: true });
    }

    return {
        month,
        rows,
        salesTotal,
        costTotal,
        personalTotal,
        sellingTotal,
        operationTotal,
        capexTotal,
        grossProfit,
        netProfit,
        inStoreRatio: categoryRatio,
        hasStorehubData: !!storehub,
    };
};

// ==========================================
// 📊 品类毛利
// ------------------------------------------
// 销售用「全渠道」原始数字（不缩放），因为成本涵盖所有渠道卖出去的东西。
// 拿店内推算的销售去除以全部成本，毛利率会被低估。
// ==========================================
export interface CategoryMarginRow {
    id: string;
    label: string;
    sales: number;
    cost: number;
    profit: number;
    /** 毛利率 = 毛利 ÷ 销售；销售为 0 时为 null */
    marginPct: number | null;
    note?: string;
    /** 有销售但完全没成本，或反过来 —— 通常代表账单科目还没选对 */
    warn: boolean;
    warnReason?: string;
}

export const buildCategoryMargins = (
    storehub: StorehubMonthlySales | null,
    costByCategory: CostByCategory,
    /** 合计模式会把带 summaryGroup 的品类并成一行（例如果汁/茶/罐装水/饮料 → 饮料合计） */
    detailMode: 'SUMMARY' | 'DETAILED' = 'DETAILED'
): CategoryMarginRow[] => {
    // 合计模式：先把同一个 summaryGroup 的 pair 合并成一个虚拟 pair
    const effectivePairs: CategoryMarginPair[] = (() => {
        if (detailMode !== 'SUMMARY') return CATEGORY_MARGIN_PAIRS;
        const out: CategoryMarginPair[] = [];
        const groupIndex: Record<string, number> = {};
        CATEGORY_MARGIN_PAIRS.forEach(pair => {
            const g = pair.summaryGroup;
            if (!g) { out.push(pair); return; }
            if (groupIndex[g.id] === undefined) {
                groupIndex[g.id] = out.length;
                out.push({
                    id: g.id,
                    label: g.label,
                    note: g.note,
                    salesCategories: [...pair.salesCategories],
                    costCategories: [...pair.costCategories],
                });
            } else {
                const merged = out[groupIndex[g.id]];
                merged.salesCategories = [...merged.salesCategories, ...pair.salesCategories];
                merged.costCategories = [...merged.costCategories, ...pair.costCategories];
            }
        });
        return out;
    })();

    return effectivePairs.map(pair => {
        const sales = storehub
            ? pair.salesCategories.reduce((s, k) => s + (storehub.categoryTotals[k as SalesCategoryId] || 0), 0)
            : 0;
        const cost = pair.costCategories.reduce((s, k) => s + (costByCategory[k] || 0), 0);
        const profit = sales - cost;
        const marginPct = sales > 0 ? profit / sales : null;

        let warn = false;
        let warnReason: string | undefined;
        if (sales > 0 && cost === 0) {
            warn = true;
            warnReason = '有销售但这个科目完全没有进货记录 —— 账单可能还挂在旧的「水吧」科目下，或这个月真的没进货。';
        } else if (cost > 0 && sales === 0) {
            warn = true;
            warnReason = '有进货但没有销售 —— 可能是这个月还没导入 StoreHub SKU 报表。';
        } else if (marginPct !== null && marginPct < 0) {
            warn = true;
            warnReason = '毛利是负的 —— 进货远大于卖出，可能是囤货，或科目归错。';
        }

        return { id: pair.id, label: pair.label, sales, cost, profit, marginPct, note: pair.note, warn, warnReason };
    });
};

/**
 * 判断一个日期区间是不是「完整的一个月」。
 * StoreHub 的 SKU 报表都是整月导出的，区间不是整月就跟它口径不同，
 * 品类比例会算错。
 */
export const isFullMonthRange = (start: string, end: string): boolean => {
    if (!start || !end) return false;
    if (start.slice(0, 7) !== end.slice(0, 7)) return false;
    if (!start.endsWith('-01')) return false;
    const [y, m] = start.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return Number(end.slice(8, 10)) >= lastDay;
};

/** 区间标签：整月显示 '2026-07'，否则显示 '2026-07-01 ~ 07-15' */
export const rangeLabel = (start: string, end: string): string => {
    if (!start || !end) return '—';
    if (isFullMonthRange(start, end)) return start.slice(0, 7);
    if (start.slice(0, 7) === end.slice(0, 7)) return `${start} ~ ${end.slice(8, 10)}`;
    return `${start} ~ ${end}`;
};

/**
 * 口径检查：每日结算的店内收款 vs StoreHub SKU 报表合计。
 * 两者相除就是品类缩放比例，正常应该落在 0.6–1.0 之间
 * （店内占大部分，平台占一到三成）。
 * 跑出区间通常代表：日期区间不是整月、某个月的 CSV 传错、或有日子漏结算。
 */
export const checkRatioSanity = (
    inStoreSales: number,
    allChannelNet: number
): { ratio: number | null; ok: boolean; reason?: string } => {
    if (allChannelNet <= 0) return { ratio: null, ok: true };
    const ratio = inStoreSales / allChannelNet;
    if (ratio > 1.02) {
        return {
            ratio, ok: false,
            reason: '每日结算的店内收款比整份 SKU 报表还高。可能是 SKU 报表传错月份，或每日结算重复计了某几天。',
        };
    }
    if (ratio < 0.4) {
        return {
            ratio, ok: false,
            reason: '店内收款只占 SKU 报表的四成不到。可能是日期区间不是整月（例如只选了半个月），或有很多天漏做每日结算。',
        };
    }
    return { ratio, ok: true };
};

/** 把 FinancialReport 的 lists 摊平成 catKey → 金额 */
export const flattenCostGroups = (
    lists: { id: string; amount: number }[][]
): CostByCategory => {
    const out: CostByCategory = {};
    lists.forEach(list => {
        (list || []).forEach(g => {
            out[g.id] = (out[g.id] || 0) + g.amount;
        });
    });
    return out;
};

/** 同上，但取上期金额 (prevAmount)，给并排比较用 */
export const flattenCostGroupsPrev = (
    lists: { id: string; prevAmount?: number }[][]
): CostByCategory => {
    const out: CostByCategory = {};
    lists.forEach(list => {
        (list || []).forEach(g => {
            out[g.id] = (out[g.id] || 0) + (g.prevAmount || 0);
        });
    });
    return out;
};
