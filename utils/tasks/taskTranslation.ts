export type TaskLanguage = 'zh' | 'en' | 'my';
export type TaskTranslations = Record<TaskLanguage, { title: string; note?: string }>;

export const taskLanguage = (value: string): TaskLanguage => value === 'my' ? 'my' : value === 'en' ? 'en' : 'zh';

export const taskText = (task: { title: string; note?: string; translations?: TaskTranslations }, language: string) =>
    task.translations?.[taskLanguage(language)] || { title: task.title, note: task.note };

const sourceLanguage = (text: string): TaskLanguage => /[\u1000-\u109f]/.test(text) ? 'my' : /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en';

export async function translateTask(title: string, note: string, previous?: { title: string; note?: string; translations?: TaskTranslations }, request: typeof fetch = fetch): Promise<TaskTranslations> {
    if (previous?.title === title && (previous.note || '') === note && previous.translations) return previous.translations;
    const original = [title.trim(), note.trim()];
    const source = sourceLanguage(original.join(' '));
    const result = { zh: { title: '', note: '' }, en: { title: '', note: '' }, my: { title: '', note: '' } } as TaskTranslations;
    result[source] = { title: original[0], note: original[1] || undefined };
    await Promise.all((['zh', 'en', 'my'] as const).filter(lang => lang !== source).map(async targetLang => {
        const response = await request('/api/gemini/translate-my', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: original.filter(Boolean), targetLang, contentType: 'management_instruction', audience: 'employee', tone: 'clear_actionable' }),
        });
        if (!response.ok) throw new Error('任务翻译失败，请稍后重试，任务尚未发布');
        const body = await response.json();
        if (!Array.isArray(body.translations) || body.translations.length !== original.filter(Boolean).length || body.translations.some((s: unknown) => typeof s !== 'string' || !s.trim()))
            throw new Error('任务翻译内容不完整，任务尚未发布');
        result[targetLang] = { title: body.translations[0].trim(), note: original[1] ? body.translations[1].trim() : undefined };
    }));
    return result;
}
