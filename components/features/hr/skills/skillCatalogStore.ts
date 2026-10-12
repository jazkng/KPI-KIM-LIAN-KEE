import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { DEFAULT_SKILL_ITEMS, SkillItem } from '../../../../constants/skillCatalog';

/**
 * ⭐ 工作项目清单：存在 Firestore config/skill_catalog → { items, updatedAt, updatedBy }
 * 还没存过 → 用 constants/skillCatalog.ts 的预设。
 * 一个 session 只读一次（模块级缓存），改完立即更新缓存。
 */

let cache: SkillItem[] | null = null;
let inflight: Promise<SkillItem[]> | null = null;
const listeners = new Set<(items: SkillItem[]) => void>();

const sanitize = (items: any[]): SkillItem[] =>
    (items || [])
        .filter(i => i && typeof i.id === 'string' && typeof i.name === 'string')
        .map(i => ({
            id: i.id,
            name: i.name,
            categories: Array.isArray(i.categories) ? i.categories : [],
            ...(i.active === false ? { active: false } : {}),
        }));

export const loadSkillCatalog = async (): Promise<SkillItem[]> => {
    if (cache) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const snap = await getDoc(doc(db, 'config', 'skill_catalog'));
            const data: any = snap.exists() ? snap.data() : null;
            cache = data && Array.isArray(data.items) && data.items.length > 0 ? sanitize(data.items) : DEFAULT_SKILL_ITEMS;
        } catch (err) {
            console.warn('[skillCatalog] load failed, using defaults', err);
            cache = DEFAULT_SKILL_ITEMS;
        }
        inflight = null;
        return cache!;
    })();
    return inflight;
};

export const saveSkillCatalog = async (items: SkillItem[], updatedBy?: string): Promise<void> => {
    const clean = sanitize(items);
    await setDoc(doc(db, 'config', 'skill_catalog'), {
        items: clean,
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {}),
    });
    cache = clean;
    listeners.forEach(fn => fn(clean));
};

/** React：拿到目前的工作项目清单（第一次会读 Firestore） */
export const useSkillCatalog = (): SkillItem[] => {
    const [items, setItems] = useState<SkillItem[]>(cache || DEFAULT_SKILL_ITEMS);
    const onChange = useCallback((next: SkillItem[]) => setItems(next), []);
    useEffect(() => {
        let alive = true;
        loadSkillCatalog().then(list => alive && setItems(list));
        listeners.add(onChange);
        return () => {
            alive = false;
            listeners.delete(onChange);
        };
    }, [onChange]);
    return items;
};
