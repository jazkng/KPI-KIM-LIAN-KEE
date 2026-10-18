// ============================================================================
// 称重商品（例如花肉：按箱下单、按公斤计价、每箱重量不一样）的收货重量
// ----------------------------------------------------------------------------
// 1. 收货画面的「实际重量」默认填预估重量（箱数 × 每箱预估重量）。收货人没改就送出，
//    库存与应付金额都会按预估算。送出前找出「重量还是预估值」的品项，提醒确认。
// 2. 每次收货把「箱数、实际重量」记在供应商品项的 weightHistory（最近 10 次），
//    用来看每箱实际平均重量，调整预估重量。
// ============================================================================

import type { CatalogItem, WeightReceipt } from '../../types';

export const WEIGHT_HISTORY_LIMIT = 10;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

interface WeightLine {
    name: string;
    billByWeight?: boolean;
    receivedQty?: number;
    receivedWeight?: number;
    orderQty?: number;
    estimatedBaseQty?: number;
    estimatedWeightPerUnit?: number;
}

/** 收货画面一开始会填进去的预估重量（跟两个收货画面的默认值同一算法） */
export const estimatedReceiveWeights = (line: WeightLine): number[] => {
    const perUnit = num(line.estimatedWeightPerUnit) || 1;
    return [num(line.estimatedBaseQty), num(line.orderQty) * perUnit, num(line.receivedQty) * perUnit].filter(v => v > 0);
};

/** 按重量计价、有收货、但实际重量仍等于预估值的品项名称 */
export const findUnchangedWeights = (lines: WeightLine[]): string[] =>
    lines.filter(l => {
        if (!l.billByWeight) return false;
        const w = num(l.receivedWeight);
        if (w <= 0 || num(l.receivedQty) <= 0) return false;
        return estimatedReceiveWeights(l).some(e => Math.abs(e - w) < 0.0005);
    }).map(l => l.name);

export const unchangedWeightMessage = (names: string[]): string | null => {
    if (!names.length) return null;
    return `⚖️ 以下 ${names.length} 个按重量计价的品项，实际重量还是预估值，没有改过：\n\n${names.slice(0, 10).map(n => `· ${n}`).join('\n')}${names.length > 10 ? `\n…还有 ${names.length - 10} 个` : ''}\n\n库存与应付金额会按这个重量计算。请对照单据或磅秤的实际重量。\n\n重量确实就是这个数字？按「确定」继续收货；按「取消」回去修改。`;
};

/** 记一次收货重量：同一张采购单重复收货会取代旧的那笔；保留最近 10 次（新的在前） */
export const appendWeightReceipt = (history: WeightReceipt[] | undefined, r: WeightReceipt): WeightReceipt[] =>
    [{ ...r, packs: round(r.packs), weight: round(r.weight) }, ...(history || []).filter(h => h.poId !== r.poId)].slice(0, WEIGHT_HISTORY_LIMIT);

export interface WeightStats { count: number; avgPerPack: number; minPerPack: number; maxPerPack: number; lastPerPack: number }

export const weightStats = (history: WeightReceipt[] | undefined): WeightStats | null => {
    const per = (history || []).filter(h => num(h.packs) > 0 && num(h.weight) > 0).map(h => num(h.weight) / num(h.packs));
    if (!per.length) return null;
    return {
        count: per.length,
        avgPerPack: round(per.reduce((s, v) => s + v, 0) / per.length, 2),
        minPerPack: round(Math.min(...per), 2),
        maxPerPack: round(Math.max(...per), 2),
        lastPerPack: round(per[0], 2),
    };
};

/** 一行文字：「最近 3 次每箱 19.38–20.48 kg，平均 19.92 kg（预估 20）」 */
export const weightStatsText = (c: Partial<Pick<CatalogItem, 'weightHistory' | 'estimatedWeightPerUnit' | 'billingUnit' | 'pricingUnit' | 'orderUnit' | 'unit'>>): string | null => {
    const s = weightStats(c.weightHistory);
    if (!s) return null;
    const u = c.billingUnit || c.pricingUnit || 'kg';
    const pack = c.orderUnit || c.unit || '箱';
    const range = s.minPerPack === s.maxPerPack ? `${s.minPerPack}` : `${s.minPerPack}–${s.maxPerPack}`;
    return `最近 ${s.count} 次每${pack} ${range} ${u}，平均 ${s.avgPerPack} ${u}${c.estimatedWeightPerUnit ? `（预估 ${c.estimatedWeightPerUnit}）` : ''}`;
};
