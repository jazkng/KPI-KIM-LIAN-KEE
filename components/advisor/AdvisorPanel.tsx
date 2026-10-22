import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Lightbulb, Loader2, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { EvidenceItem } from '../../utils/cockpit/advisorEvidence';
import type { Anomaly, Insight, InsightKey } from '../../utils/cockpit/advisorInsights';

/**
 * AI 经营顾问（明亮版）
 * 最上面：本月异常（点一下跳到对应的图、标出那根柱子）。
 * 中间：只用资料库资料算出的图表（保本 / 走势 / 上月同期 / 星期 / 天气 / 渠道 / 成本 / 进货价 / 人效），点柱子看数字。
 * 下面：AI 建议。只把编号证据交给 AI；服务端核对每一句的编号与数字，对不上的会删掉。
 * 点 AI 回答下面的依据，会跳到那张图、标出那根柱子。同一个问题这次打开期间不再重问。
 */

interface Point { kind: 'finding' | 'action' | 'gap'; text: string; refs: string[] }
interface Answer { points: Point[]; rejected: number }

interface Props {
    periodLabel: string;
    insights: Insight[];
    anomalies?: Anomaly[];
    evidence: EvidenceItem[];
    settledDays: number;
    /** 供应商 / 班表还在读 */
    loadingMore?: boolean;
    onClose: () => void;
    onOpenKpi?: (key: string) => void;
}

const PRESETS = [
    { label: '最该做的 3 件事', q: '根据证据，我这个月最该做的 3 件事是什么？每件事一句话。' },
    { label: '哪里可以省钱', q: '根据成本结构和进货价证据，哪一项最值得先检查？' },
    { label: '哪天要加强', q: '根据星期几、天气和人效的证据，哪几天生意最弱、可以加强什么？' },
    { label: '比上个月', q: '根据上月同期的证据，这个月哪里变好、哪里变差？' },
];

const KIND: Record<Point['kind'], { label: string; cls: string; Icon: typeof Lightbulb }> = {
    action: { label: '建议', cls: 'is-action', Icon: Lightbulb },
    finding: { label: '发现', cls: 'is-finding', Icon: CheckCircle2 },
    gap: { label: '缺资料', cls: 'is-gap', Icon: CircleAlert },
};

const money = (v: number) => `RM ${Math.round(v).toLocaleString('en-MY')}`;
const fmt = (v: number, unit: Insight['unit'], label = '') => unit === 'CHANGE' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
    : unit === 'PCT' ? `RM ${v.toFixed(2)}`
    : /单均|人均/.test(label) ? `RM ${v.toFixed(2)}` : money(v);

const Gauge = ({ g }: { g: NonNullable<Insight['gauge']> }) => {
    const pct = g.target > 0 ? Math.min(100, g.done / g.target * 100) : 0;
    return <div className="adv-gauge">
        <div className="adv-gauge-track"><em style={{ width: `${pct}%` }} className={pct >= 100 ? 'is-done' : ''} /><b>{pct.toFixed(0)}%</b></div>
        <div className="adv-gauge-legend">
            <span><small>已做</small>{money(g.done)}</span>
            <span><small>保本</small>{money(g.target)}</span>
            {g.remaining > 0 && <span><small>还差 · {g.daysLeft} 天</small>{money(g.remaining)}</span>}
            {g.remaining > 0 && g.needPerDay !== null && <span className="is-key"><small>每天要</small>{money(g.needPerDay)}</span>}
        </div>
    </div>;
};

const BarChart = ({ insight, picked, onPick }: { insight: Insight; picked: number | null; onPick: (i: number | null) => void }) => {
    const max = Math.max(1, ...insight.bars.map(b => Math.max(Math.abs(b.value), b.compare ?? 0)));
    const many = insight.bars.length > 8;
    const h = (v: number, own: number) => `${Math.max(3, Math.abs(v) / (insight.paired ? Math.max(1, own) : max) * 100)}%`;
    const bar = picked !== null ? insight.bars[picked] : null;
    return <div className="adv-chart">
        <div className={`adv-bars${many ? ' is-many' : ''}${insight.unit === 'CHANGE' ? ' is-change' : ''}`} role="list">
            {insight.bars.map((b, i) => {
                const own = Math.max(Math.abs(b.value), b.compare ?? 0);
                return <button key={`${b.label}${i}`} role="listitem" type="button" onClick={() => onPick(i === picked ? null : i)}
                    className={`adv-bar ${b.highlight ? `is-${b.highlight}` : ''} ${picked === i ? 'is-picked' : ''}`} aria-label={`${b.label} ${fmt(b.value, insight.unit, b.label)}`}>
                    <span className="adv-bar-track">
                        {b.compare !== undefined && <i style={{ height: h(b.compare, own) }} />}
                        <em style={{ height: h(b.value, own) }} />
                    </span>
                    {(insight.paired || insight.unit === 'CHANGE') && <strong className={b.value < 0 || (b.sub || '').startsWith('-') ? 'is-down' : 'is-up'}>{insight.unit === 'CHANGE' ? fmt(b.value, 'CHANGE') : b.sub || ''}</strong>}
                    <small>{b.label}</small>
                </button>;
            })}
        </div>
        {insight.paired && <p className="adv-legend"><i className="is-now" /> 本月 <i className="is-prev" /> 上月同期</p>}
        <p className="adv-pick">{bar
            ? <><b>{bar.label}</b> {fmt(bar.value, insight.unit, bar.label)}{insight.unit === 'PCT' ? ' / 每 RM100' : ''}{bar.compare !== undefined && insight.paired ? ` · 上月 ${fmt(bar.compare, insight.unit, bar.label)}` : ''}{bar.sub && !insight.paired ? ` · ${bar.sub}` : ''}</>
            : <span>点柱子看数字</span>}</p>
    </div>;
};

export const AdvisorPanel: React.FC<Props> = ({ periodLabel, insights, anomalies = [], evidence, settledDays, loadingMore, onClose, onOpenKpi }) => {
    const [active, setActive] = useState<InsightKey | null>(insights[0]?.key ?? null);
    const [picked, setPicked] = useState<number | null>(null);
    const [question, setQuestion] = useState('');
    const [asked, setAsked] = useState('');
    const [loading, setLoading] = useState(false);
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [error, setError] = useState('');
    const [errorDetail, setErrorDetail] = useState('');
    const cache = useRef(new Map<string, Answer>());
    const dialog = useRef<HTMLDialogElement>(null);
    const chartRef = useRef<HTMLElement>(null);
    useEffect(() => { dialog.current?.showModal(); }, []);
    // 资料读完多了图（进货价、人效）时，若原本选的图不见了，回到第一张
    useEffect(() => { if (!insights.some(i => i.key === active)) setActive(insights[0]?.key ?? null); }, [insights, active]);

    const insight = insights.find(i => i.key === active) || null;
    const refTarget = useMemo(() => {
        const m = new Map<string, { key: InsightKey; bar: number | null }>();
        insights.forEach(i => {
            i.refs.forEach(r => m.set(r, { key: i.key, bar: null }));
            i.bars.forEach((b, idx) => { if (b.ref) m.set(b.ref, { key: i.key, bar: idx }); });
        });
        anomalies.forEach(a => { if (!m.has(a.ref)) m.set(a.ref, { key: a.key, bar: a.bar ?? null }); });
        return m;
    }, [insights, anomalies]);
    const byId = useMemo(() => new Map(evidence.map(e => [e.id, e])), [evidence]);

    const show = (key: InsightKey, bar: number | null) => {
        setActive(key); setPicked(bar);
        chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const ask = async (q: string, shown?: string) => {
        const text = q.trim();
        if (!text || loading) return;
        setAsked(shown || text); setError(''); setErrorDetail('');
        const hit = cache.current.get(text);
        if (hit) { setAnswer(hit); setQuestion(''); return; }
        setLoading(true); setAnswer(null);
        try {
            const response = await fetch('/api/ai/cockpit-advisor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text, periodLabel, evidence: evidence.map(({ id, label, value, note }) => ({ id, label, value, note })) }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { setErrorDetail(String(data.detail || '')); throw new Error(data.error || `服务暂时无法回应（${response.status}）`); }
            const result = { points: Array.isArray(data.points) ? data.points : [], rejected: Array.isArray(data.rejected) ? data.rejected.length : 0 };
            cache.current.set(text, result);
            setAnswer(result);
            setQuestion('');
        } catch (e: any) {
            setError(e?.message || '请稍后再试');
        } finally {
            setLoading(false);
        }
    };

    const openRef = (id: string) => {
        const t = refTarget.get(id);
        if (t) { show(t.key, t.bar); return; }
        const kpiKey = byId.get(id)?.kpiKey;
        if (kpiKey && onOpenKpi) onOpenKpi(kpiKey);
    };

    return <dialog ref={dialog} className="adv-dialog" onClose={onClose} onCancel={onClose}>
        <header className="adv-head">
            <div><b><Sparkles size={17} /> AI 经营顾问</b><small>{periodLabel} · {settledDays} 天已日结</small></div>
            <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="adv-body">
            {anomalies.length > 0 && <section className="adv-card adv-alerts">
                <h2><CircleAlert size={16} /> 本月要注意</h2>
                <div>{anomalies.map((a, i) => <button key={i} className={`is-${a.tone}`} onClick={() => show(a.key, a.bar ?? null)}>{a.text}</button>)}</div>
            </section>}

            {insights.length === 0 ? <p className="adv-empty">本月已日结的资料还不够画图。</p> : <section className="adv-card" ref={chartRef}>
                <nav className="adv-tabs">{insights.map(i => <button key={i.key} aria-pressed={i.key === active} onClick={() => show(i.key, null)}>{i.title}</button>)}
                    {loadingMore && <span className="adv-tab-loading"><Loader2 size={12} className="animate-spin" /></span>}</nav>
                {insight && <>
                    <h3>{insight.headline}</h3>
                    {insight.gauge && <Gauge g={insight.gauge} />}
                    {insight.bars.length > 0 && <>
                        {insight.key === 'breakeven' && <p className="adv-legend"><i className="is-good" /> 达到 <i className="is-bad" /> 没达到 <i className="is-prev" /> 保本线（按星期）</p>}
                        <BarChart insight={insight} picked={picked} onPick={setPicked} />
                    </>}
                </>}
            </section>}

            <section className="adv-card">
                <h2><Lightbulb size={16} /> 问 AI</h2>
                <div className="adv-presets">{PRESETS.map(p => <button key={p.label} disabled={loading} onClick={() => ask(p.q, p.label)}>{p.label}</button>)}</div>
                <form className="adv-ask" onSubmit={e => { e.preventDefault(); ask(question); }}>
                    <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={300} placeholder="自己问，例如：为什么周二生意弱？" />
                    <button type="submit" disabled={loading || !question.trim()} aria-label="发送">{loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
                </form>

                {loading && <p className="adv-muted"><Loader2 size={14} className="animate-spin" /> 正在根据资料回答…</p>}
                {error && <div className="adv-error"><p>{error}</p>{errorDetail && <details className="adv-error-detail"><summary>错误代码（给管理员看）</summary><pre>{errorDetail}</pre></details>}</div>}
                {answer && <div className="adv-answer">
                    <p className="adv-q">「{asked}」</p>
                    {answer.points.length === 0 && <p className="adv-muted">没有能核对依据的回答，换个问法试试。</p>}
                    {answer.points.map((p, i) => {
                        const k = KIND[p.kind] || KIND.finding;
                        return <div key={i} className={`adv-point ${k.cls}`}>
                            <span className="adv-kind"><k.Icon size={13} /> {k.label}</span>
                            <p>{p.text}</p>
                            <div className="adv-refs">{p.refs.map(r => <button key={r} className={refTarget.has(r) ? 'is-chart' : ''} title={byId.get(r) ? `${byId.get(r)!.label}：${byId.get(r)!.value}` : r} onClick={() => openRef(r)}>{refTarget.has(r) ? '📊 ' : ''}{byId.get(r)?.label || r}</button>)}</div>
                        </div>;
                    })}
                    {answer.rejected > 0 && <p className="adv-muted">已删掉 {answer.rejected} 句对不上资料的说法。</p>}
                </div>}
            </section>

            <p className="adv-foot"><ShieldCheck size={13} /> 只用资料库里的真实资料；AI 每句都要附依据，数字对不上的会被删掉。</p>
        </div>
    </dialog>;
};
