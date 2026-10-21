// ============================================================================
// AI 呼叫：依序试几个模型，遇到「模型不存在 / 已下架 / 太忙 / 限流」就换下一个
// ----------------------------------------------------------------------------
// 起因：AI 经营顾问固定用 gemini-2.5-flash，旧模型下架或繁忙时整个功能就只剩
// 「AI 服务暂时无法回应」。现在会自动换模型，真的都失败才回报，并说明是哪一类问题。
// 不改变回答内容的核对规则（见 cockpitAdvisor.ts）。
// ============================================================================

export type AiErrorKind = 'MODEL_UNAVAILABLE' | 'BUSY' | 'AUTH' | 'OTHER';

const textOf = (error: unknown) => {
    const e = error as { status?: unknown; code?: unknown; message?: unknown } | null;
    return `${e?.status ?? ''} ${e?.code ?? ''} ${e?.message ?? String(error ?? '')}`.toLowerCase();
};

/** 把 Google AI 的错误归类（只看状态码与讯息，不回传原始讯息给前端） */
export const classifyAiError = (error: unknown): AiErrorKind => {
    const t = textOf(error);
    if (/\b(401|403)\b|api key|api_key|permission|unauthenticated|permission_denied/.test(t)) return 'AUTH';
    if (/\b404\b|not[_ ]found|is not supported|no longer available|deprecated|unknown model|invalid model/.test(t)) return 'MODEL_UNAVAILABLE';
    if (/\b(429|500|503|504)\b|overloaded|unavailable|resource[_ ]exhausted|quota|rate limit|deadline|timeout|internal/.test(t)) return 'BUSY';
    return 'OTHER';
};

export const AI_ERROR_MESSAGE: Record<AiErrorKind, string> = {
    MODEL_UNAVAILABLE: 'AI 模型暂时无法使用（可能已下架），请通知管理员更新模型设定。',
    BUSY: 'AI 服务现在比较忙，请过一会儿再问一次。',
    AUTH: 'AI 金钥或权限有问题，请通知管理员检查伺服器设定。',
    OTHER: 'AI 服务暂时无法回应，请稍后再试。',
};

/** 去掉空的、重复的模型名称 */
export const modelChain = (...models: (string | undefined)[]) =>
    [...new Set(models.map(m => String(m || '').trim()).filter(Boolean))];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 给老板看的错误摘要：只取状态码与讯息前段（Google 的错误讯息不含金钥） */
export const aiErrorSummary = (error: unknown) => {
    const e = error as { status?: unknown; code?: unknown; message?: unknown } | null;
    const code = e?.status ?? e?.code ?? '';
    const msg = String(e?.message ?? error ?? '').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]').replace(/\s+/g, ' ').slice(0, 160);
    return `${code ? `${code} ` : ''}${msg}`.trim();
};

export interface AiAttempt { model: string; kind: AiErrorKind; summary: string }

/** 全部模型都失败时丢出的错误：带着每个模型失败的原因 */
export class AiAllModelsFailed extends Error {
    constructor(public attempts: AiAttempt[]) {
        super(attempts.map(a => `${a.model}: ${a.summary}`).join(' | '));
    }
    /** 每个模型都是金钥 / 权限问题才算 AUTH；有任何一个是下架就算模型问题；否则忙碌 / 其他 */
    get kind(): AiErrorKind {
        const kinds = this.attempts.map(a => a.kind);
        if (kinds.length && kinds.every(k => k === 'AUTH')) return 'AUTH';
        if (kinds.includes('BUSY')) return 'BUSY';
        if (kinds.includes('MODEL_UNAVAILABLE')) return 'MODEL_UNAVAILABLE';
        return kinds.includes('AUTH') ? 'AUTH' : 'OTHER';
    }
}

/**
 * 依序呼叫 run(model)，任何一个成功就回传；每个模型都试过（某些金钥只是没有某个模型的权限），
 * 全部失败才丢出 AiAllModelsFailed（附每个模型的失败原因）。忙碌时换下一个之前先等一下。
 */
export const runWithModelFallback = async <T>(
    models: string[],
    run: (model: string) => Promise<T>,
    opts: { waitMs?: number; log?: (msg: string) => void } = {},
): Promise<{ result: T; model: string }> => {
    const attempts: AiAttempt[] = [];
    for (const [i, model] of models.entries()) {
        try {
            return { result: await run(model), model };
        } catch (error) {
            const kind = classifyAiError(error);
            const summary = aiErrorSummary(error);
            attempts.push({ model, kind, summary });
            opts.log?.(`AI model ${model} failed (${kind}): ${summary}`);
            if (kind === 'BUSY' && i < models.length - 1) await sleep(opts.waitMs ?? 600);
        }
    }
    throw new AiAllModelsFailed(attempts);
};

/** 金钥去掉首尾空白、换行与引号（在 Secret Manager 贴上时常多带一个换行，Google 就会回 401） */
export const normalizeApiKey = (raw: string | undefined) =>
    String(raw ?? '').trim().replace(/^["']+|["']+$/g, '').trim();

/**
 * 描述金钥的「格式」给管理员看，绝不显示金钥内容：
 * 长度、是否 AIza 开头、原始值是否带空白 / 换行 / 引号。
 * Google AI Studio 的金钥通常是 39 个字元、AIza 开头。
 */
export const describeApiKeyShape = (raw: string | undefined) => {
    const value = String(raw ?? '');
    const key = normalizeApiKey(value);
    if (!key) return '金钥格式：伺服器没有读到金钥';
    const notes = [`${key.length} 个字元`, key.startsWith('AIza') ? 'AIza 开头' : '不是 AIza 开头（可能贴错了，例如贴成名称或别的金钥）'];
    if (key.length !== 39) notes.push('一般应为 39 个字元');
    if (value !== key) notes.push('原始值带有空白 / 换行 / 引号（已自动去掉）');
    if (/\s/.test(key)) notes.push('中间有空白');
    return `金钥格式：${notes.join('，')}`;
};
