// ============================================================================
// 老板经营驾驶舱 · AI 经营顾问（PR F）—— 服务端纯函数
// ----------------------------------------------------------------------------
// 只接受驾驶舱已计算好的「证据清单」（每项有编号、名称、数值），不接受原始资料。
// 模型必须以 JSON 回答，每一点都要引用证据编号；服务端逐点核对：
//   - 引用的编号必须存在
//   - 文字中的金额、百分比、日期必须出现在所引用的证据里（容许四舍五入）
// 核对不过的说法一律删除，并告诉老板删除了几条、为什么。只读，不写入任何资料。
// ============================================================================

export interface AdvisorEvidence {
    id: string;
    label: string;
    value: string;
    note?: string;
}

export interface AdvisorPoint {
    kind: 'finding' | 'action' | 'gap';
    text: string;
    refs: string[];
}

export interface AdvisorRejected {
    text: string;
    reason: string;
}

export const ADVISOR_LIMITS = {
    maxEvidence: 120,
    maxQuestion: 300,
    maxLabel: 80,
    maxValue: 120,
    maxNote: 400,
    maxPoints: 12,
} as const;

const ID_RE = /^[A-Z]{1,2}\d{1,3}$/;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** 检查并整理前端送来的证据；不合格时回传错误讯息 */
export const sanitizeAdvisorRequest = (body: unknown): { ok: true; question: string; periodLabel: string; evidence: AdvisorEvidence[] } | { ok: false; error: string } => {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (!Array.isArray(b.evidence) || b.evidence.length === 0) return { ok: false, error: '缺少驾驶舱证据清单' };
    if (b.evidence.length > ADVISOR_LIMITS.maxEvidence) return { ok: false, error: '证据项目过多' };
    const seen = new Set<string>();
    const evidence: AdvisorEvidence[] = [];
    for (const raw of b.evidence) {
        const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const id = String(e.id ?? '');
        if (!ID_RE.test(id) || seen.has(id)) return { ok: false, error: `证据编号不正确：${id.slice(0, 10)}` };
        seen.add(id);
        const label = clip(e.label, ADVISOR_LIMITS.maxLabel);
        const value = clip(e.value, ADVISOR_LIMITS.maxValue);
        if (!label || !value) return { ok: false, error: `证据 ${id} 缺少名称或数值` };
        const note = clip(e.note, ADVISOR_LIMITS.maxNote);
        evidence.push(note ? { id, label, value, note } : { id, label, value });
    }
    const question = clip(b.question, ADVISOR_LIMITS.maxQuestion);
    if (!question) return { ok: false, error: '请输入问题' };
    return { ok: true, question, periodLabel: clip(b.periodLabel, 60), evidence };
};

export const buildAdvisorPrompt = (periodLabel: string, evidence: AdvisorEvidence[]) => `
# 角色
你是「金莲记」餐厅老板的经营顾问。你只能根据下方「证据清单」回答，清单是 ERP 驾驶舱已经算好的数字。

# 硬性规则
1. 每一点都必须在 refs 列出所依据的证据编号（例如 ["K1","A2"]），没有依据就不要写。
2. 只能引用证据中出现过的数字、百分比与日期，原样抄写；不要自己相加、相减、换算或推估新数字。
3. 证据标示「预估」「资料不完整」「等待日结」的，要在文字中说明，不能当作已确认。
4. 你是只读顾问：不能声称已修改、写入或执行任何操作；建议只能是「老板可以考虑」的行动。
5. 资料不足以回答时，写一条 kind="gap"，说明缺什么资料。
6. 最多 ${ADVISOR_LIMITS.maxPoints} 点，通常 3–5 点就够；用简体中文，每点一句话，尽量 40 字以内，先讲结论。
7. 建议要具体、可以在餐厅执行（例如哪一天、哪个渠道、哪一项成本），并说明依据的数字。D 开头的证据是从已日结营业日算出的星期、天气、渠道、成本结构。

# 输出格式（只输出 JSON）
{"points":[{"kind":"finding|action|gap","text":"……","refs":["K1"]}]}

# 期间
${periodLabel || '（未提供）'}

# 证据清单
${evidence.map(e => `${e.id} | ${e.label} | ${e.value}${e.note ? ` | ${e.note}` : ''}`).join('\n')}
`.trim();

// ── 数字核对 ──
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const NUM_RE = /-?\d[\d,]*(?:\.\d+)?\s*%?/g;

interface NumToken { value: number; pct: boolean; raw: string }

const numbersIn = (text: string): NumToken[] =>
    (text.replace(DATE_RE, ' ').match(NUM_RE) || []).map(raw => {
        const pct = raw.includes('%');
        return { raw: raw.trim(), pct, value: Number(raw.replace(/[,%\s]/g, '')) };
    }).filter(t => Number.isFinite(t.value));

/** 0–31 的整数（天数、笔数、名次）不当作金额核对 */
const isSmallCount = (t: NumToken) => !t.pct && Number.isInteger(t.value) && Math.abs(t.value) <= 31 && !t.raw.includes('.');

const close = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= 0.5 + Math.abs(b) * 0.005;

export const verifyAdvisorPoints = (raw: unknown, evidence: AdvisorEvidence[]): { points: AdvisorPoint[]; rejected: AdvisorRejected[] } => {
    const byId = new Map(evidence.map(e => [e.id, e]));
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { points?: unknown }).points) ? (raw as { points: unknown[] }).points : null;
    if (!list) return { points: [], rejected: [{ text: '（整段回答）', reason: 'AI 没有按规定格式回答' }] };
    const points: AdvisorPoint[] = [];
    const rejected: AdvisorRejected[] = [];
    for (const item of list.slice(0, ADVISOR_LIMITS.maxPoints * 2)) {
        const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const text = clip(p.text, 400);
        if (!text) continue;
        const kind = p.kind === 'action' || p.kind === 'gap' ? p.kind : 'finding';
        const refs = Array.isArray(p.refs) ? Array.from(new Set(p.refs.map(r => String(r)))) : [];
        if (refs.length === 0) { rejected.push({ text, reason: '没有引用任何证据' }); continue; }
        const unknown = refs.filter(r => !byId.has(r));
        if (unknown.length) { rejected.push({ text, reason: `引用了不存在的证据 ${unknown.join('、')}` }); continue; }
        const cited = refs.map(r => byId.get(r)!);
        const citedText = cited.map(e => `${e.label} ${e.value} ${e.note || ''}`).join(' ');
        const citedNums = numbersIn(citedText);
        const badDate = (text.match(DATE_RE) || []).find(d => !citedText.includes(d));
        if (badDate) { rejected.push({ text, reason: `日期 ${badDate} 不在所引用的证据中` }); continue; }
        const badNum = numbersIn(text).find(t => !isSmallCount(t) && !citedNums.some(c => c.pct === t.pct && close(t.value, c.value)));
        if (badNum) { rejected.push({ text, reason: `数字 ${badNum.raw} 不在所引用的证据中` }); continue; }
        points.push({ kind, text, refs });
        if (points.length >= ADVISOR_LIMITS.maxPoints) break;
    }
    return { points, rejected };
};

/** 解析模型回答（容许被 ```json 包起来） */
export const parseAdvisorJson = (text: string): unknown => {
    const trimmed = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
};
