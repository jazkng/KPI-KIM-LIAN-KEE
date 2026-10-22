// ============================================================================
// AI 经营顾问 · 图表洞察（纯函数，只读）
// ----------------------------------------------------------------------------
// 全部只用经营中心已经从资料库读到的资料：
//   已日结营业日（BusinessDay）、利润引擎（成本结构 / 保本）、供应商最近进价、班表上班人数。
// 没有资料的项目不计算、不补零、不估计。每一项同时产生编号证据（D1、D2…）交给 AI；
// AI 每一句都要引用编号，服务端核对数字后才显示（见 server/cockpitAdvisor.ts）。
// 「本月异常」也只从这些数字比较出来，每一条都附证据编号、能点回对应的图。
// ============================================================================
import { dailyBreakEvenTargets, type BusinessDay, type ProfitLine, type ProfitStory } from '../businessCenter';
import { WEATHER_OPTIONS, type PurchaseOrder, type Supplier } from '../../types';
import { summarizeFoodPurchases } from './foodPurchases';
import { catalogPerBaseCost } from '../inventory/supplyOptions';
import type { EvidenceItem } from './advisorEvidence';

export type InsightKey = 'breakeven' | 'trend' | 'compare' | 'weekday' | 'weather' | 'channel' | 'cost' | 'food' | 'supplier' | 'staff';

export interface InsightBar {
    label: string;
    value: number;
    sub?: string;
    highlight?: 'best' | 'worst';
    /** 对比值（上月同期），画成淡色柱 */
    compare?: number;
    /** 这根柱子对应的证据编号（AI 引用它时会跳到这根柱子） */
    ref?: string;
}
export interface InsightGauge { done: number; target: number; remaining: number; daysLeft: number; needPerDay: number | null }
export interface Insight {
    key: InsightKey;
    title: string;
    /** 一句话结论（只用下面的数字） */
    headline: string;
    /** RM = 金额；PCT = 每 RM100；CHANGE = 涨跌百分比 */
    unit: 'RM' | 'PCT' | 'CHANGE';
    bars: InsightBar[];
    /** 每根柱子各自按自己与对比值的大小画（不同指标放在同一张图） */
    paired?: boolean;
    gauge?: InsightGauge;
    /** 这张图对应的证据编号 */
    refs: string[];
}
export interface Anomaly {
    tone: 'bad' | 'warn' | 'good';
    text: string;
    key: InsightKey;
    /** 点开时要标出的柱子 */
    bar?: number;
    ref: string;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const round = (n: number) => Math.round(n * 100) / 100;
const rm = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;
const rm2 = (n: number) => `RM ${n.toFixed(2)}`;
const signed = (pct: number) => `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
const avg = (list: number[]) => list.length ? list.reduce((s, n) => s + n, 0) / list.length : 0;
const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay();
const prevMonthOf = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

const markExtremes = (bars: InsightBar[]) => {
    if (bars.length < 2) return bars;
    const max = Math.max(...bars.map(b => b.value)), min = Math.min(...bars.map(b => b.value));
    if (max === min) return bars;
    return bars.map(b => ({ ...b, highlight: b.value === max ? 'best' as const : b.value === min ? 'worst' as const : undefined }));
};

/** 食材 / 人工每 RM100 超过这个数就提醒（跟成本页的「一般餐厅」参考同一套） */
const COST_ALERT: Partial<Record<ProfitLine['key'], number>> = { food: 35, labour: 30 };

export const buildAdvisorInsights = (args: {
    days: BusinessDay[];
    month: string;
    costLines: ProfitLine[];
    revenue: number;
    breakEven?: ProfitStory['breakEven'];
    suppliers?: Supplier[];
    /** 采购单（已收货的才算）：食材明细与单价 */
    purchaseOrders?: PurchaseOrder[];
    /** 班表：{ 日期: 上班人数 }（只算计入员工、排了上班的人） */
    workers?: Record<string, number>;
}) => {
    const { month, costLines, revenue } = args;
    const monthDays = args.days.filter(d => d.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    const lastDate = monthDays.slice(-1)[0]?.date || '';
    const evidence: EvidenceItem[] = [];
    const ev = (label: string, value: string, note?: string) => {
        const id = `D${evidence.length + 1}`;
        evidence.push(note ? { id, label, value, note } : { id, label, value });
        return id;
    };
    const insights: Insight[] = [];
    const anomalies: Anomaly[] = [];

    // ── 保本进度 ──
    const be = args.breakEven;
    if (be && be.target > 0) {
        const pct = Math.min(100, revenue / be.target * 100);
        const refs = [
            ev('本月保本营业额', rm(be.target)),
            ev('本月至今营业额', rm(revenue), `已达保本 ${pct.toFixed(1)}%`),
        ];
        if (be.remaining !== null && be.remaining > 0) refs.push(ev('离保本还差', rm(be.remaining), `本月还剩 ${be.daysLeft} 天`));
        if (be.needPerDayLeft !== null && be.remaining) refs.push(ev('剩下每天要做到', rm(be.needPerDayLeft), be.perDay !== null ? `平时每天保本线 ${rm(be.perDay)}` : undefined));
        // 按星期几调整的保本线（周末高、平日低，全月合计不变）；每根柱 = 那个星期几的保本线
        const bars: InsightBar[] = [];
        if (be.perDay !== null && be.perDay > 0) {
            const plan = dailyBreakEvenTargets({ days: args.days, month, perDay: be.perDay });
            if (plan.weighted) [1, 2, 3, 4, 5, 6, 0].forEach(w => {
                const date = Object.keys(plan.targets).find(d => weekdayOf(d) === w)!;
                const target = plan.targets[date];
                const done = monthDays.filter(d => weekdayOf(d.date) === w).map(d => d.revenue);
                const got = done.length ? round(avg(done)) : null;
                // 柱 = 本月这个星期几的平均营业额（绿 = 达到、红 = 没达到）；淡色 = 保本线
                bars.push({ label: `周${WEEKDAYS[w]}`, value: got ?? 0, compare: target,
                    highlight: got === null ? undefined : got >= target ? 'best' : 'worst',
                    sub: `保本线 ${rm(target)}`,
                    ref: ev(`周${WEEKDAYS[w]}保本线（按星期调整）`, rm(target), got === null ? '本月还没有这天的日结' : `本月周${WEEKDAYS[w]}平均营业额 ${rm(got)}`) });
            });
            refs.push(...bars.map(b => b.ref!));
        }
        insights.push({ key: 'breakeven', title: '保本', unit: 'RM', bars, refs,
            gauge: { done: revenue, target: be.target, remaining: be.remaining ?? 0, daysLeft: be.daysLeft, needPerDay: be.needPerDayLeft },
            headline: be.remaining ? `已达 ${pct.toFixed(0)}%${be.needPerDayLeft !== null ? `，每天还要 ${rm(be.needPerDayLeft)}` : ''}` : '本月已经保本 ✓' });
        if (be.gap !== null && be.gap < 0 && be.remaining) {
            anomalies.push({ tone: 'bad', text: `保本进度落后 ${rm(-be.gap)}`, key: 'breakeven', ref: ev('保本进度落后', rm(-be.gap), '按到今天为止应达到的保本营业额比较') });
        }
    }

    // ── 趋势：最近 14 个已日结的营业日 ──
    const recent = args.days.filter(d => d.date <= lastDate).slice(-14);
    if (recent.length >= 2) {
        const last7 = recent.slice(-7), prev7 = recent.slice(-14, -7);
        const s1 = round(last7.reduce((s, d) => s + d.revenue, 0)), s0 = round(prev7.reduce((s, d) => s + d.revenue, 0));
        const refs = [ev('最近 7 个已日结营业日营业额合计', rm(s1), `${last7[0].date} 至 ${last7[last7.length - 1].date}`)];
        let headline = `最近 ${last7.length} 天合计 ${rm(s1)}`;
        if (prev7.length === 7 && s0 > 0) {
            const change = (s1 - s0) / s0 * 100;
            refs.push(ev('再前 7 个已日结营业日营业额合计', rm(s0), `${prev7[0].date} 至 ${prev7[6].date}`));
            refs.push(ev('最近 7 天对比再前 7 天', `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`));
            headline += `，比再前 7 天${change >= 0 ? '多' : '少'} ${Math.abs(change).toFixed(1)}%`;
        }
        insights.push({ key: 'trend', title: '近期走势', headline, unit: 'RM', refs, bars: recent.map(d => ({ label: d.date.slice(8), value: round(d.revenue), sub: `周${WEEKDAYS[weekdayOf(d.date)]}` })) });
    }

    // ── 上月同期：同样到几号为止 ──
    if (monthDays.length >= 3) {
        const cut = lastDate.slice(8, 10);
        const prevDays = args.days.filter(d => d.date.startsWith(prevMonthOf(month)) && d.date.slice(8, 10) <= cut);
        if (prevDays.length >= 3) {
            const metric = (label: string, pick: (d: BusinessDay) => number | null, fmt: (n: number) => string) => {
                const cur = monthDays.map(pick).filter((v): v is number => v !== null), prev = prevDays.map(pick).filter((v): v is number => v !== null);
                if (!cur.length || !prev.length) return null;
                const c = round(avg(cur)), p = round(avg(prev));
                const change = p > 0 ? (c - p) / p * 100 : null;
                const ref = ev(`本月至今${label}`, `${fmt(c)}（上月同期 ${fmt(p)}${change !== null ? `，${signed(change)}` : ''}）`, `本月 ${cur.length} 天、上月 1 至 ${Number(cut)} 号 ${prev.length} 天`);
                return { label, value: c, compare: p, sub: change !== null ? signed(change) : undefined, ref } as InsightBar;
            };
            const delivery = (d: BusinessDay) => d.revenue - (d.channels.find(c => c.label === '店内')?.amount ?? 0);
            const bars = [
                metric('日均营业额', d => d.revenue, rm),
                metric('店内日均', d => d.channels.find(c => c.label === '店内')?.amount ?? null, rm),
                metric('外卖日均', delivery, rm),
                metric('店内单均', d => d.perBill, rm2),
                metric('人均消费', d => d.perPax, rm2),
            ].filter((b): b is InsightBar => !!b);
            if (bars.length) {
                const main = bars[0];
                insights.push({ key: 'compare', title: '上月同期', unit: 'RM', paired: true, bars, refs: bars.map(b => b.ref!),
                    headline: main.sub ? `日均 ${rm(main.value)}，比上月同期 ${main.sub}` : `日均 ${rm(main.value)}` });
            }
        }
    }

    // ── 星期几：本月各星期的平均营业额 ──
    if (monthDays.length >= 7) {
        const groups = new Map<number, number[]>();
        monthDays.forEach(d => groups.set(weekdayOf(d.date), [...(groups.get(weekdayOf(d.date)) || []), d.revenue]));
        const bars = markExtremes([1, 2, 3, 4, 5, 6, 0].filter(w => groups.has(w)).map(w => ({ label: `周${WEEKDAYS[w]}`, value: round(avg(groups.get(w)!)), sub: `${groups.get(w)!.length} 天` })))
            .map(b => ({ ...b, ref: ev(`本月${b.label}平均营业额`, rm(b.value), `${b.sub}已日结`) }));
        const best = bars.find(b => b.highlight === 'best'), worst = bars.find(b => b.highlight === 'worst');
        insights.push({ key: 'weekday', title: '星期几', unit: 'RM', bars, refs: bars.map(b => b.ref),
            headline: best && worst ? `${best.label}最好 ${rm(best.value)}，${worst.label}最弱 ${rm(worst.value)}` : '各星期差不多' });
    }

    // ── 特别好 / 特别差的日子（跟本月同星期其他日子比） ──
    const odd = monthDays.map(d => {
        const same = monthDays.filter(o => o.date !== d.date && weekdayOf(o.date) === weekdayOf(d.date)).map(o => o.revenue);
        const base = avg(same);
        return same.length && base > 0 ? { d, base, pct: (d.revenue - base) / base * 100 } : null;
    }).filter((x): x is { d: BusinessDay; base: number; pct: number } => !!x);
    const trendIdx = (date: string) => { const i = recent.findIndex(r => r.date === date); return i >= 0 ? i : undefined; };
    const oddRef = (o: { d: BusinessDay; base: number; pct: number }) =>
        ev(`${o.d.date} 营业额`, `${rm(o.d.revenue)}（同星期其他日子平均 ${rm(o.base)}，${signed(o.pct)}）`, `周${WEEKDAYS[weekdayOf(o.d.date)]}`);
    [...odd].filter(o => o.pct <= -30).sort((a, b) => a.pct - b.pct).slice(0, 2).forEach(o =>
        anomalies.push({ tone: 'bad', text: `${md(o.d.date)} 周${WEEKDAYS[weekdayOf(o.d.date)]} 少 ${Math.abs(o.pct).toFixed(0)}%`, key: 'trend', bar: trendIdx(o.d.date), ref: oddRef(o) }));
    [...odd].filter(o => o.pct >= 30).sort((a, b) => b.pct - a.pct).slice(0, 1).forEach(o =>
        anomalies.push({ tone: 'good', text: `${md(o.d.date)} 周${WEEKDAYS[weekdayOf(o.d.date)]} 多 ${o.pct.toFixed(0)}%`, key: 'trend', bar: trendIdx(o.d.date), ref: oddRef(o) }));

    // ── 天气：本月各天气的平均营业额（只算有填天气的日子） ──
    const withWeather = monthDays.filter(d => d.weather);
    const weatherGroups = WEATHER_OPTIONS.map(o => ({ o, list: withWeather.filter(d => d.weather === o.value).map(d => d.revenue) })).filter(g => g.list.length > 0);
    if (weatherGroups.length >= 2) {
        const bars = markExtremes(weatherGroups.map(g => ({ label: g.o.label, value: round(avg(g.list)), sub: `${g.list.length} 天` })))
            .map(b => ({ ...b, ref: ev(`本月「${b.label}」平均营业额`, rm(b.value), `${b.sub}；没填天气的 ${monthDays.length - withWeather.length} 天不算`) }));
        const best = bars.find(b => b.highlight === 'best'), worst = bars.find(b => b.highlight === 'worst');
        insights.push({ key: 'weather', title: '天气', unit: 'RM', bars, refs: bars.map(b => b.ref),
            headline: best && worst ? `${best.label}天平均 ${rm(best.value)}，${worst.label}天 ${rm(worst.value)}` : '天气影响不明显' });
    }

    // ── 渠道：本月店内与各外卖平台 ──
    if (monthDays.length > 0) {
        const totals = new Map<string, number>();
        monthDays.forEach(d => d.channels.forEach(c => totals.set(c.label, (totals.get(c.label) || 0) + c.amount)));
        const all = [...totals.values()].reduce((s, n) => s + n, 0);
        const bars = [...totals.entries()].filter(([, v]) => v > 0).map(([label, v]) => ({ label, value: round(v), sub: all > 0 ? `${(v / all * 100).toFixed(1)}%` : undefined }));
        if (bars.length > 0 && all > 0) {
            const withRefs = bars.map(b => ({ ...b, ref: ev(`本月${b.label}营业额`, rm(b.value), `占本月营业额 ${b.sub}`) }));
            const store = withRefs.find(b => b.label === '店内');
            insights.push({ key: 'channel', title: '渠道', unit: 'RM', bars: withRefs, refs: withRefs.map(b => b.ref),
                headline: store ? `店内占 ${store.sub}，外卖占 ${(100 - Number(store.sub!.replace('%', ''))).toFixed(1)}%` : `外卖占 100.0%` });
        }
    }

    // ── 成本结构：每做 RM100 花在哪里（利润引擎） ──
    const costs = costLines.filter(l => l.per100 !== null && l.amount > 0);
    if (revenue > 0 && costs.length > 0) {
        const bars = costs.map(l => {
            const value = round(l.per100!);
            return { label: l.label, value, sub: rm(l.amount), ref: ev(`本月${l.label}`, `每 RM100 营业额 RM ${value.toFixed(2)}`, `金额 ${rm(l.amount)}`), key: l.key };
        });
        const top = [...bars].sort((a, b) => b.value - a.value)[0];
        insights.push({ key: 'cost', title: '成本结构', unit: 'PCT', bars: bars.map(({ key: _k, ...b }) => b), refs: bars.map(b => b.ref),
            headline: `最大开销是${top.label}，每 RM100 花 RM ${top.value.toFixed(2)}` });
        bars.forEach((b, i) => {
            const limit = COST_ALERT[b.key];
            if (limit && b.value > limit) anomalies.push({ tone: 'warn', text: `${b.label}每 RM100 花 RM ${b.value.toFixed(0)}`, key: 'cost', bar: i, ref: b.ref });
        });
    }

    // ── 食材明细：本月已收货采购单，按品项合计金额与单价（跟上个月单价比） ──
    if (args.purchaseOrders?.length) {
        const food = summarizeFoodPurchases(args.purchaseOrders, month);
        if (food.lines.length) {
            // g / ml 换成 kg / L 显示单价，比较好读
            const per = (l: { unit: string; unitPrice: number | null }) => l.unitPrice === null ? null
                : /^(g|gm|gram)$/i.test(l.unit) ? { v: l.unitPrice * 1000, u: 'kg' } : /^ml$/i.test(l.unit) ? { v: l.unitPrice * 1000, u: 'L' } : { v: l.unitPrice, u: l.unit || '单位' };
            const total = ev('本月采购单已收货食材合计', rm(food.total), `${food.receivedPos} 张已收货采购单、${food.lines.length} 个品项`);
            const top = food.lines.slice(0, 8);
            const bars: InsightBar[] = top.map(l => {
                const p = per(l);
                const price = p ? `RM ${p.v.toFixed(2)}/${p.u}` : '';
                const change = l.change !== null ? `，比上月单价 ${signed(l.change)}` : '';
                return { label: l.name, value: l.spend, sub: [price, l.change !== null ? `上月 ${signed(l.change)}` : ''].filter(Boolean).join(' · ') || `${l.receipts} 次收货`,
                    highlight: l.change !== null && l.change >= 10 ? 'worst' : l.change !== null && l.change <= -10 ? 'best' : undefined,
                    ref: ev(`本月${l.name}进货`, `${rm(l.spend)}${price ? `（单价 ${price}${change}）` : ''}`, `${l.receipts} 次收货`) };
            });
            const share = food.total > 0 ? top[0].spend / food.total * 100 : 0;
            insights.push({ key: 'food', title: '食材明细', unit: 'RM', bars, refs: [total, ...bars.map(b => b.ref!)],
                headline: `最多是${top[0].name} ${rm(top[0].spend)}（占 ${share.toFixed(0)}%）` });
            const jump = top.map((l, i) => ({ l, i })).filter(x => x.l.change !== null && x.l.change >= 10).sort((a, b) => b.l.change! - a.l.change!)[0];
            if (jump) anomalies.push({ tone: 'warn', text: `${jump.l.name} 单价 ${signed(jump.l.change!)}`, key: 'food', bar: jump.i, ref: bars[jump.i].ref! });
        }
    }

    // ── 进货价：最近收货的价钱跟目录价比（两个月内收过货的品项） ──
    if (args.suppliers?.length) {
        const since = `${prevMonthOf(month)}-01`;
        const rows = args.suppliers.flatMap(s => (s.catalog || []).map(c => {
            const got = Number(c.lastReceivedPricePerBase), list = catalogPerBaseCost(c);
            if (!(got > 0) || !list || !c.lastReceivedAt || String(c.lastReceivedAt).slice(0, 10) < since) return null;
            const pct = (got - list) / list * 100;
            return Math.abs(pct) >= 3 ? { name: c.name, supplier: s.name, pct, at: String(c.lastReceivedAt).slice(0, 10) } : null;
        })).filter((r): r is { name: string; supplier: string; pct: number; at: string } => !!r)
            .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 8);
        if (rows.length) {
            const bars: InsightBar[] = rows.map(r => ({ label: r.name, value: round(r.pct), sub: `${r.supplier} · ${md(r.at)}`, highlight: r.pct > 0 ? 'worst' : 'best',
                ref: ev(`${r.name}（${r.supplier}）最近进价对比目录价`, signed(r.pct), `${r.at} 收货`) }));
            const up = rows.filter(r => r.pct > 0);
            insights.push({ key: 'supplier', title: '进货价', unit: 'CHANGE', bars, refs: bars.map(b => b.ref!),
                headline: up.length ? `${up.length} 样比目录贵，最多 ${signed(up[0].pct)}（${up[0].name}）` : '最近进价都没比目录贵' });
            const worst = bars.findIndex(b => b.value >= 10);
            // 食材明细已经提醒过同一样就不重复
            if (worst >= 0 && !anomalies.some(a => a.key === 'food' && a.text.startsWith(`${rows[worst].name} `))) anomalies.push({ tone: 'warn', text: `${rows[worst].name} 进价 ${signed(rows[worst].pct)}`, key: 'supplier', bar: worst, ref: bars[worst].ref! });
        }
    }

    // ── 人效：每位上班员工带来的营业额（按星期几平均） ──
    if (args.workers) {
        const rows = monthDays.filter(d => (args.workers![d.date] || 0) > 0).map(d => ({ d, n: args.workers![d.date] }));
        if (rows.length >= 7) {
            const groups = new Map<number, { per: number[]; n: number[] }>();
            rows.forEach(({ d, n }) => {
                const g = groups.get(weekdayOf(d.date)) || { per: [], n: [] };
                g.per.push(d.revenue / n); g.n.push(n);
                groups.set(weekdayOf(d.date), g);
            });
            const bars = markExtremes([1, 2, 3, 4, 5, 6, 0].filter(w => groups.has(w)).map(w => ({ label: `周${WEEKDAYS[w]}`, value: round(avg(groups.get(w)!.per)), sub: `平均 ${avg(groups.get(w)!.n).toFixed(1)} 人上班` })))
                .map(b => ({ ...b, ref: ev(`本月${b.label}每位上班员工平均营业额`, rm(b.value), b.sub) }));
            const best = bars.find(b => b.highlight === 'best'), worst = bars.find(b => b.highlight === 'worst');
            const overall = round(rows.reduce((s, r) => s + r.d.revenue, 0) / rows.reduce((s, r) => s + r.n, 0));
            const all = ev('本月每位上班员工平均营业额', rm(overall), `按班表，${rows.length} 天`);
            insights.push({ key: 'staff', title: '人效', unit: 'RM', bars, refs: [all, ...bars.map(b => b.ref)],
                headline: best && worst ? `每人 ${rm(overall)}；${best.label}最高，${worst.label}最低` : `每人 ${rm(overall)}` });
        }
    }

    // ── 客人：本月平均人均消费（只算有填人数的日子） ──
    const paxDays = monthDays.filter(d => d.perPax !== null);
    if (paxDays.length > 0) ev('本月平均人均消费', `RM ${avg(paxDays.map(d => d.perPax!)).toFixed(2)}`, `${paxDays.length} 天有填人数`);
    const billDays = monthDays.filter(d => d.perBill !== null);
    if (billDays.length > 0) ev('本月平均店内单均', `RM ${avg(billDays.map(d => d.perBill!)).toFixed(2)}`, `${billDays.length} 天有填单数`);

    const order = { bad: 0, warn: 1, good: 2 };
    return { insights, evidence, anomalies: anomalies.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4), settledDays: monthDays.length };
};
