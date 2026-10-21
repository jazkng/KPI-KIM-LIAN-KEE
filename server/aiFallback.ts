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

/**
 * 依序呼叫 run(model)：
 * - 模型不存在 / 忙碌 → 换下一个模型（忙碌时先等一下）
 * - 金钥 / 权限问题 → 换模型也没用，直接失败
 */
export const runWithModelFallback = async <T>(
    models: string[],
    run: (model: string) => Promise<T>,
    opts: { waitMs?: number; log?: (msg: string) => void } = {},
): Promise<{ result: T; model: string }> => {
    let lastError: unknown = new Error('没有可用的模型');
    for (const [i, model] of models.entries()) {
        try {
            return { result: await run(model), model };
        } catch (error) {
            lastError = error;
            const kind = classifyAiError(error);
            opts.log?.(`AI model ${model} failed (${kind}): ${String((error as Error)?.message || error).slice(0, 200)}`);
            if (kind === 'AUTH') break;
            if (kind === 'BUSY' && i < models.length - 1) await sleep(opts.waitMs ?? 600);
        }
    }
    throw lastError;
};
