import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Lightbulb, Loader2, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { EvidenceItem } from '../../utils/cockpit/advisorEvidence';
import type { Insight, InsightKey } from '../../utils/cockpit/advisorInsights';

/**
 * AI 经营顾问（明亮版）
 * 上面：只用资料库已日结资料算出的图表（趋势 / 星期 / 天气 / 渠道 / 成本），点柱子看数字。
 * 下面：AI 建议。只把编号证据交给 AI；服务端核对每一句的编号与数字，对不上的会删掉。
 */

interface Point { kind: 'finding' | 'action' | 'gap'; text: string; refs: string[] }

interface Props {
    periodLabel: string;
    insights: Insight[];
    evidence: EvidenceItem[];
    settledDays: number;
    onClose: () => void;
    onOpenKpi?: (key: string) => void;
}

const PRESETS = [
    { label: '最该做的 3 件事', q: '根据证据，我这个月最该做的 3 件事是什么？每件事一句话。' },
    { label: '哪里可以省钱', q: '根据成本结构证据，哪一项成本最值得先检查？' },
    { label: '哪天要加强', q: '根据星期几和天气的证据，哪几天生意最弱、可以考虑加强什么？' },
    { label: '外卖表现', q: '根据渠道证据，外卖和店内的比例说明了什么？' },
];

const KIND: Record<Point['kind'], { label: string; cls: string; Icon: typeof Lightbulb }> = {
    action: { label: '建议', cls: 'is-action', Icon: Lightbulb },
    finding: { label: '发现', cls: 'is-finding', Icon: CheckCircle2 },
    gap: { label: '缺资料', cls: 'is-gap', Icon: CircleAlert },
};

const fmt = (v: number, unit: Insight['unit']) => unit === 'PCT' ? `RM ${v.toFixed(2)}` : `RM ${Math.round(v).toLocaleString('en-MY')}`;

const BarChart = ({ insight }: { insight: Insight }) => {
    const [picked, setPicked] = useState<number | null>(null);
    useEffect(() => setPicked(null), [insight.key]);
    const max = Math.max(1, ...insight.bars.map(b => b.value));
    const many = insight.bars.length > 8;
    return <div className="adv-chart">
        <div className={`adv-bars${many ? ' is-many' : ''}`} role="list">
            {insight.bars.map((b, i) => <button key={`${b.label}${i}`} role="listitem" type="button" onClick={() => setPicked(i === picked ? null : i)}
                className={`adv-bar ${b.highlight ? `is-${b.highlight}` : ''} ${picked === i ? 'is-picked' : ''}`} aria-label={`${b.label} ${fmt(b.value, insight.unit)}`}>
                <span className="adv-bar-track"><em style={{ height: `${Math.max(3, b.value / max * 100)}%` }} /></span>
                <small>{b.label}</small>
            </button>)}
        </div>
        <p className="adv-pick">{picked !== null
            ? <><b>{insight.bars[picked].label}</b> {fmt(insight.bars[picked].value, insight.unit)}{insight.unit === 'PCT' ? ' / 每 RM100' : ''}{insight.bars[picked].sub ? ` · ${insight.bars[picked].sub}` : ''}</>
            : <span>点柱子看数字</span>}</p>
    </div>;
};

export const AdvisorPanel: React.FC<Props> = ({ periodLabel, insights, evidence, settledDays, onClose, onOpenKpi }) => {
    const [active, setActive] = useState<InsightKey | null>(insights[0]?.key ?? null);
    const [question, setQuestion] = useState('');
    const [asked, setAsked] = useState('');
    const [loading, setLoading] = useState(false);
    const [points, setPoints] = useState<Point[] | null>(null);
    const [rejected, setRejected] = useState(0);
    const [error, setError] = useState('');
    const [errorDetail, setErrorDetail] = useState('');
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialog.current?.showModal(); }, []);

    const insight = insights.find(i => i.key === active) || null;
    const refOwner = useMemo(() => {
        const m = new Map<string, InsightKey>();
        insights.forEach(i => i.refs.forEach(r => m.set(r, i.key)));
        return m;
    }, [insights]);
    const byId = useMemo(() => new Map(evidence.map(e => [e.id, e])), [evidence]);

    const ask = async (q: string, shown?: string) => {
        const text = q.trim();
        if (!text || loading) return;
        setAsked(shown || text); setLoading(true); setError(''); setErrorDetail(''); setPoints(null); setRejected(0);
        try {
            const response = await fetch('/api/ai/cockpit-advisor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text, periodLabel, evidence: evidence.map(({ id, label, value, note }) => ({ id, label, value, note })) }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { setErrorDetail(String(data.detail || '')); throw new Error(data.error || `服务暂时无法回应（${response.status}）`); }
            setPoints(Array.isArray(data.points) ? data.points : []);
            setRejected(Array.isArray(data.rejected) ? data.rejected.length : 0);
            setQuestion('');
        } catch (e: any) {
            setError(e?.message || '请稍后再试');
        } finally {
            setLoading(false);
        }
    };

    const openRef = (id: string) => {
        const owner = refOwner.get(id);
        if (owner) { setActive(owner); return; }
        const kpiKey = byId.get(id)?.kpiKey;
        if (kpiKey && onOpenKpi) onOpenKpi(kpiKey);
    };

    return <dialog ref={dialog} className="adv-dialog" onClose={onClose} onCancel={onClose}>
        <header className="adv-head">
            <div><b><Sparkles size={17} /> AI 经营顾问</b><small>{periodLabel} · {settledDays} 天已日结</small></div>
            <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="adv-body">
            {insights.length === 0 ? <p className="adv-empty">本月已日结的资料还不够画图。</p> : <section className="adv-card">
                <nav className="adv-tabs">{insights.map(i => <button key={i.key} aria-pressed={i.key === active} onClick={() => setActive(i.key)}>{i.title}</button>)}</nav>
                {insight && <>
                    <h3>{insight.headline}</h3>
                    <BarChart insight={insight} />
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
                {points && <div className="adv-answer">
                    <p className="adv-q">「{asked}」</p>
                    {points.length === 0 && <p className="adv-muted">没有能核对依据的回答，换个问法试试。</p>}
                    {points.map((p, i) => {
                        const k = KIND[p.kind] || KIND.finding;
                        return <div key={i} className={`adv-point ${k.cls}`}>
                            <span className="adv-kind"><k.Icon size={13} /> {k.label}</span>
                            <p>{p.text}</p>
                            <div className="adv-refs">{p.refs.map(r => <button key={r} title={byId.get(r) ? `${byId.get(r)!.label}：${byId.get(r)!.value}` : r} onClick={() => openRef(r)}>{byId.get(r)?.label || r}</button>)}</div>
                        </div>;
                    })}
                    {rejected > 0 && <p className="adv-muted">已删掉 {rejected} 句对不上资料的说法。</p>}
                </div>}
            </section>

            <p className="adv-foot"><ShieldCheck size={13} /> 只用资料库里已日结的真实资料；AI 每句都要附依据，数字对不上的会被删掉。</p>
        </div>
    </dialog>;
};
