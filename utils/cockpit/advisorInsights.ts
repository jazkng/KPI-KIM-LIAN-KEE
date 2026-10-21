// ============================================================================
// AI 经营顾问 · 图表洞察（纯函数，只读）
// ----------------------------------------------------------------------------
// 全部只用经营中心已经从资料库读到的「已日结」营业日（BusinessDay）与利润引擎结果：
//   趋势、星期几、天气、渠道、成本结构。
// 没有资料的项目不计算、不补零、不估计。每一项同时产生编号证据（D1、D2…）交给 AI；
// AI 每一句都要引用编号，服务端核对数字后才显示（见 server/cockpitAdvisor.ts）。
// ============================================================================
import type { BusinessDay, ProfitLine } from '../businessCenter';
import { WEATHER_OPTIONS } from '../../types';
import type { EvidenceItem } from './advisorEvidence';

export type InsightKey = 'trend' | 'weekday' | 'weather' | 'channel' | 'cost';

export interface InsightBar { label: string; value: number; sub?: string; highlight?: 'best' | 'worst' }
export interface Insight {
    key: InsightKey;
    title: string;
    /** 一句话结论（只用下面 bars 里的数字） */
    headline: string;
    unit: 'RM' | 'PCT';
    bars: InsightBar[];
    /** 这张图对应的证据编号 */
    refs: string[];
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const round = (n: number) => Math.round(n * 100) / 100;
const rm = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;
const avg = (list: number[]) => list.length ? list.reduce((s, n) => s + n, 0) / list.length : 0;
const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay();

const markExtremes = (bars: InsightBar[]) => {
    if (bars.length < 2) return bars;
    const max = Math.max(...bars.map(b => b.value)), min = Math.min(...bars.map(b => b.value));
    if (max === min) return bars;
    return bars.map(b => ({ ...b, highlight: b.value === max ? 'best' as const : b.value === min ? 'worst' as const : undefined }));
};

export const buildAdvisorInsights = (args: { days: BusinessDay[]; month: string; costLines: ProfitLine[]; revenue: number }) => {
    const { month, costLines, revenue } = args;
    const monthDays = args.days.filter(d => d.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    const evidence: EvidenceItem[] = [];
    const ev = (label: string, value: string, note?: string) => {
        const id = `D${evidence.length + 1}`;
        evidence.push(note ? { id, label, value, note } : { id, label, value });
        return id;
    };
    const insights: Insight[] = [];

    // ── 趋势：最近 14 个已日结的营业日 ──
    const recent = args.days.filter(d => d.date <= (monthDays.slice(-1)[0]?.date || '')).slice(-14);
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

    // ── 星期几：本月各星期的平均营业额 ──
    if (monthDays.length >= 7) {
        const groups = new Map<number, number[]>();
        monthDays.forEach(d => groups.set(weekdayOf(d.date), [...(groups.get(weekdayOf(d.date)) || []), d.revenue]));
        const bars = markExtremes([1, 2, 3, 4, 5, 6, 0].filter(w => groups.has(w)).map(w => ({ label: `周${WEEKDAYS[w]}`, value: round(avg(groups.get(w)!)), sub: `${groups.get(w)!.length} 天` })));
        const refs = bars.map(b => ev(`本月${b.label}平均营业额`, rm(b.value), `${b.sub}已日结`));
        const best = bars.find(b => b.highlight === 'best'), worst = bars.find(b => b.highlight === 'worst');
        insights.push({ key: 'weekday', title: '星期几', unit: 'RM', bars, refs,
            headline: best && worst ? `${best.label}最好 ${rm(best.value)}，${worst.label}最弱 ${rm(worst.value)}` : '各星期差不多' });
    }

    // ── 天气：本月各天气的平均营业额（只算有填天气的日子） ──
    const withWeather = monthDays.filter(d => d.weather);
    const weatherGroups = WEATHER_OPTIONS.map(o => ({ o, list: withWeather.filter(d => d.weather === o.value).map(d => d.revenue) })).filter(g => g.list.length > 0);
    if (weatherGroups.length >= 2) {
        const bars = markExtremes(weatherGroups.map(g => ({ label: g.o.label, value: round(avg(g.list)), sub: `${g.list.length} 天` })));
        const refs = bars.map(b => ev(`本月「${b.label}」平均营业额`, rm(b.value), `${b.sub}；没填天气的 ${monthDays.length - withWeather.length} 天不算`));
        const best = bars.find(b => b.highlight === 'best'), worst = bars.find(b => b.highlight === 'worst');
        insights.push({ key: 'weather', title: '天气', unit: 'RM', bars, refs,
            headline: best && worst ? `${best.label}天平均 ${rm(best.value)}，${worst.label}天 ${rm(worst.value)}` : '天气影响不明显' });
    }

    // ── 渠道：本月店内与各外卖平台 ──
    if (monthDays.length > 0) {
        const totals = new Map<string, number>();
        monthDays.forEach(d => d.channels.forEach(c => totals.set(c.label, (totals.get(c.label) || 0) + c.amount)));
        const all = [...totals.values()].reduce((s, n) => s + n, 0);
        const bars = [...totals.entries()].filter(([, v]) => v > 0).map(([label, v]) => ({ label, value: round(v), sub: all > 0 ? `${(v / all * 100).toFixed(1)}%` : undefined }));
        if (bars.length > 0 && all > 0) {
            const refs = bars.map(b => ev(`本月${b.label}营业额`, rm(b.value), `占本月营业额 ${b.sub}`));
            const store = bars.find(b => b.label === '店内');
            insights.push({ key: 'channel', title: '渠道', unit: 'RM', bars, refs,
                headline: store ? `店内占 ${store.sub}，外卖占 ${(100 - Number(store.sub!.replace('%', ''))).toFixed(1)}%` : `外卖占 100.0%` });
        }
    }

    // ── 成本结构：每做 RM100 花在哪里（利润引擎） ──
    const costs = costLines.filter(l => l.per100 !== null && l.amount > 0);
    if (revenue > 0 && costs.length > 0) {
        const bars = costs.map(l => ({ label: l.label, value: round(l.per100!), sub: rm(l.amount) }));
        const refs = bars.map(b => ev(`本月${b.label}`, `每 RM100 营业额 RM ${b.value.toFixed(2)}`, `金额 ${b.sub}`));
        const top = [...bars].sort((a, b) => b.value - a.value)[0];
        insights.push({ key: 'cost', title: '成本结构', unit: 'PCT', bars, refs,
            headline: `最大开销是${top.label}，每 RM100 花 RM ${top.value.toFixed(2)}` });
    }

    // ── 客人：本月平均人均消费（只算有填人数的日子） ──
    const paxDays = monthDays.filter(d => d.perPax !== null);
    if (paxDays.length > 0) ev('本月平均人均消费', `RM ${avg(paxDays.map(d => d.perPax!)).toFixed(2)}`, `${paxDays.length} 天有填人数`);
    const billDays = monthDays.filter(d => d.perBill !== null);
    if (billDays.length > 0) ev('本月平均店内单均', `RM ${avg(billDays.map(d => d.perBill!)).toFixed(2)}`, `${billDays.length} 天有填单数`);

    return { insights, evidence, settledDays: monthDays.length };
};
