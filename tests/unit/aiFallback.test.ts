import { describe, expect, it } from 'vitest';
import { classifyAiError, modelChain, runWithModelFallback } from '../../server/aiFallback';

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
    it('金钥问题不再换模型，直接失败', async () => {
        const tried: string[] = [];
        await expect(runWithModelFallback(['a', 'b'], async m => { tried.push(m); throw { status: 403, message: 'PERMISSION_DENIED' }; }, { waitMs: 0 })).rejects.toBeTruthy();
        expect(tried).toEqual(['a']);
    });
    it('全部失败时丢出最后一个错误', async () => {
        await expect(runWithModelFallback(['a', 'b'], async m => { throw { status: 503, message: `busy ${m}` }; }, { waitMs: 0 })).rejects.toMatchObject({ message: 'busy b' });
    });
});
