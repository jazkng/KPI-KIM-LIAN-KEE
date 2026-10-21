import { describe, expect, it } from 'vitest';
import { AiAllModelsFailed, aiErrorSummary, classifyAiError, modelChain, runWithModelFallback } from '../../server/aiFallback';

describe('classifyAiError', () => {
    it('分类', () => {
        expect(classifyAiError({ status: 404, message: 'models/gemini-2.5-flash is not found' })).toBe('MODEL_UNAVAILABLE');
        expect(classifyAiError({ status: 503, message: 'The model is overloaded' })).toBe('BUSY');
        expect(classifyAiError({ status: 429, message: 'RESOURCE_EXHAUSTED' })).toBe('BUSY');
        expect(classifyAiError({ status: 400, message: 'API key not valid' })).toBe('AUTH');
        expect(classifyAiError(new Error('boom'))).toBe('OTHER');
    });
});

describe('runWithModelFallback', () => {
    it('第一个模型下架 → 换下一个成功', async () => {
        const tried: string[] = [];
        const r = await runWithModelFallback(modelChain('old', '', 'new', 'old'), async m => {
            tried.push(m);
            if (m === 'old') throw { status: 404, message: 'not found' };
            return 'ok';
        }, { waitMs: 0 });
        expect(r).toEqual({ result: 'ok', model: 'new' });
        expect(tried).toEqual(['old', 'new']);
    });
    it('某个模型没有权限 → 继续试下一个', async () => {
        const r = await runWithModelFallback(['a', 'b'], async m => { if (m === 'a') throw { status: 403, message: 'PERMISSION_DENIED' }; return 'ok'; }, { waitMs: 0 });
        expect(r.model).toBe('b');
    });
    it('全部失败：附每个模型的原因；全是权限问题才算 AUTH', async () => {
        const all403 = await runWithModelFallback(['a', 'b'], async () => { throw { status: 403, message: 'PERMISSION_DENIED' }; }, { waitMs: 0 }).catch(e => e);
        expect(all403).toBeInstanceOf(AiAllModelsFailed);
        expect(all403.kind).toBe('AUTH');
        expect(all403.message).toBe('a: 403 PERMISSION_DENIED | b: 403 PERMISSION_DENIED');
        const mixed = await runWithModelFallback(['a', 'b'], async m => { throw m === 'a' ? { status: 403, message: 'denied' } : { status: 404, message: 'not found' }; }, { waitMs: 0 }).catch(e => e);
        expect(mixed.kind).toBe('MODEL_UNAVAILABLE');
    });
    it('错误摘要不会带出金钥', () => {
        expect(aiErrorSummary({ status: 400, message: 'API key AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123456 not valid' })).toBe('400 API key [key] not valid');
    });
});
