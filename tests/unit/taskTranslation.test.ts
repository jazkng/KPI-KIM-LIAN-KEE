import { describe, expect, it, vi } from 'vitest';
import { taskText, translateTask } from '../../utils/tasks/taskTranslation';

describe('task translations', () => {
    it('translates title and note before saving and displays the selected language', async () => {
        const request = vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            return { ok: true, json: async () => ({ translations: body.targetLang === 'en' ? ['Count water', 'Check every box'] : ['ရေကို ရေတွက်ပါ', 'သေတ္တာတိုင်း စစ်ပါ'] }) } as Response;
        });
        const translations = await translateTask('盘点罐装水', '检查每箱', undefined, request as typeof fetch);
        expect(request).toHaveBeenCalledTimes(2);
        expect(translations.zh.title).toBe('盘点罐装水');
        expect(taskText({ title: '盘点罐装水', translations }, 'my').title).toBe('ရေကို ရေတွက်ပါ');
        await translateTask('盘点罐装水', '检查每箱', { title: '盘点罐装水', note: '检查每箱', translations }, request as typeof fetch);
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('does not publish a task when a translation is incomplete', async () => {
        const request = vi.fn(async () => ({ ok: true, json: async () => ({ translations: [''] }) } as Response));
        await expect(translateTask('Clean fridge', '', undefined, request as typeof fetch)).rejects.toThrow('任务翻译内容不完整');
    });
});
