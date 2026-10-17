// ============================================================================
// 库存编号（stockCode）· 纯函数
// ----------------------------------------------------------------------------
// 两层识别（负责人 2026-10-17 决定，详见 docs/inventory/2026-10-17-stockcode-audit-and-plan.md）：
//   - id：内部识别码 = Firestore 文件 ID，永远不改，供应商连结 / 采购单 / 盘点 / 日志都靠它。
//   - stockCode：给人看的编号，例如 K0001。区域前缀 K 厨房、B 吧台、G 杂项、F 燃料，4 位流水号。
//   - legacyCodes：以前画面上显示过的旧编号（例如 K009、S12），隐藏保存，搜寻仍然找得到。
// 编号一经发出不再重复使用；全部重新连号时按「区域 → 子分类顺序 → 中文名称」排序。
// 这里只有计算，不读写资料库。
// ============================================================================

import type { StockArea } from './stockArea';

export const STOCK_CODE_PREFIX: Record<StockArea, string> = { KITCHEN: 'K', BAR: 'B', GENERAL: 'G', FUEL: 'F' };
export const STOCK_CODE_DIGITS = 4;

const CODE_RE = /^([KBGF])(\d{4,})$/;

export const formatStockCode = (area: StockArea, seq: number): string =>
    `${STOCK_CODE_PREFIX[area]}${String(seq).padStart(STOCK_CODE_DIGITS, '0')}`;

/** 解析编号；不是新格式返回 null */
export const parseStockCode = (code: unknown): { prefix: string; seq: number } | null => {
    const m = CODE_RE.exec(String(code || '').trim().toUpperCase());
    return m ? { prefix: m[1], seq: Number(m[2]) } : null;
};

/** 以前画面上显示过、人看得懂的旧编号（K009、KF01、S12）。系统自动产生的 K_1712345678901 不算。 */
export const isHumanLegacyCode = (id: unknown): boolean => /^[A-Za-z]{1,3}[-_]?\d{1,5}$/.test(String(id || ''));

type CodedItem = { id: string; name?: string; category?: string; stockCode?: string; legacyCodes?: string[] };

/** 卡片上显示的编号；还没配号时显示「未编号」，不再把内部 ID 给员工看 */
export const displayStockCode = (item: Pick<CodedItem, 'stockCode'>): string => item.stockCode || '未编号';

/** 搜寻：名称、编号、旧编号、内部 ID 都找得到 */
export const matchesStockSearch = (item: CodedItem, term: string): boolean => {
    const q = String(term || '').trim().toLowerCase();
    if (!q) return true;
    const hay = [item.name, item.stockCode, item.id, ...(item.legacyCodes || [])];
    return hay.some(v => String(v || '').toLowerCase().includes(q));
};

// ── 命名规范：统一「中文 (English)」，没有品牌例外 ──────────────────────────

const CJK = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

const tidy = (s: string) => s.replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

export type NameIssue = 'MISSING_ENGLISH' | 'MISSING_CHINESE' | 'NEEDS_MANUAL';

export interface NameSuggestion {
    suggested: string | null;   // null = 不需要改，或无法自动建议
    issue?: NameIssue;          // 需要人工补的情况
}

/**
 * 建议的标准名称「中文 (English)」。只处理看得出中英文分界的情况；看不出就不猜，标「需人工命名」。
 * 只产生建议——改名一律由负责人逐项确认。
 */
export const suggestStockName = (rawName: string): NameSuggestion => {
    const name = tidy(String(rawName || ''));
    if (!name) return { suggested: null, issue: 'NEEDS_MANUAL' };
    // 1.5L、500g 这类规格不算英文名称
    const words = name.split(' ').filter(t => !/^\d/.test(t)).join(' ');
    const hasC = CJK.test(words);
    const hasL = LATIN.test(words);
    const result = (s: string): NameSuggestion => ({ suggested: s === rawName ? null : s });

    // 已经有括号：「中文 (English)」或「(English) 中文」「English (中文)」
    const paren = /^(.*?)\s*\(([^()]+)\)\s*(.*)$/.exec(name);
    if (paren) {
        const [, before, inside, after] = paren;
        if (!after && CJK.test(before) && !CJK.test(inside)) return result(`${before} (${inside})`);
        if (!before && after && CJK.test(after) && !CJK.test(inside)) return result(`${after} (${inside})`);
        if (!after && before && !CJK.test(before) && CJK.test(inside) && !LATIN.test(inside)) return result(`${inside} (${before})`);
        if (hasC && hasL) return { suggested: null, issue: 'NEEDS_MANUAL' };
        return { suggested: name === rawName ? null : name, issue: hasC ? 'MISSING_ENGLISH' : 'MISSING_CHINESE' };
    }

    if (hasC && !hasL) return { suggested: name === rawName ? null : name, issue: 'MISSING_ENGLISH' };
    if (hasL && !hasC) return { suggested: name === rawName ? null : name, issue: 'MISSING_CHINESE' };

    // 没括号、中英混写：按空格切开，中文段 + 英文段各自连续才建议；数字开头的规格（1.5L、500g）跟着前一段
    const tokens = name.split(' ');
    const kinds = tokens.map(t => {
        if (/^\d/.test(t) && !CJK.test(t)) return 'N';
        if (CJK.test(t) && LATIN.test(t)) return 'X';
        if (CJK.test(t)) return 'C';
        if (LATIN.test(t)) return 'L';
        return 'N';
    });
    if (kinds.includes('X')) return { suggested: null, issue: 'NEEDS_MANUAL' };
    const resolved = kinds.map((k, i) => {
        if (k !== 'N') return k;
        for (let j = i - 1; j >= 0; j--) if (kinds[j] !== 'N') return kinds[j];
        return kinds.find(x => x !== 'N') || 'N';
    });
    const groups: { kind: string; words: string[] }[] = [];
    tokens.forEach((t, i) => {
        const last = groups[groups.length - 1];
        if (last && last.kind === resolved[i]) last.words.push(t);
        else groups.push({ kind: resolved[i], words: [t] });
    });
    if (groups.length !== 2) return { suggested: null, issue: 'NEEDS_MANUAL' };
    const zh = groups.find(g => g.kind === 'C')!.words.join(' ');
    const en = groups.find(g => g.kind === 'L')!.words.join(' ');
    return result(`${zh} (${en})`);
};

/** 比对重复名称用的键：忽略大小写、空格、标点 */
export const nameKey = (name: string): string =>
    tidy(String(name || '')).toLowerCase().replace(/[\s()\-_.,/·'"]/g, '');

// ── 全部重新连号的计划 ────────────────────────────────────────────────────────

export interface RenumberInput extends CodedItem { area: StockArea }

export interface RenumberRow {
    stockId: string;
    area: StockArea;
    category: string;
    name: string;
    oldDisplay: string;          // 以前画面显示的（旧编号或内部 ID）
    newCode: string;
    legacyCodes: string[];       // 写入后隐藏保存的旧编号
    suggestedName: string | null;
    nameIssue?: NameIssue;
    duplicateNameWith: string[]; // 同名的其他 stockId
}

export interface RenumberPlan {
    rows: RenumberRow[];
    nextSeq: Record<StockArea, number>; // 写入后计数器的值（下一个要发的号码）
    blocked: { stockId: string; reason: string }[]; // 不配号、要先人工处理的
}

/**
 * 产生「全部重新连号」计划。
 * 排序：区域 → 子分类在库存画面上的顺序（不在清单内的分类排最后）→ 中文名称 → 内部 ID。
 * blockedIds：同一 ID 出现在两个区域的复制品，先不配号。
 */
export const planRenumber = (
    items: RenumberInput[],
    sectionOrder: Record<string, string[]>,
    blockedIds: Set<string> = new Set(),
): RenumberPlan => {
    const collator = new Intl.Collator(['zh-Hans-CN', 'en'], { numeric: true, sensitivity: 'base' });
    const areas: StockArea[] = ['KITCHEN', 'BAR', 'GENERAL', 'FUEL'];
    const byKey = new Map<string, string[]>();
    items.forEach(i => {
        const k = nameKey(i.name || '');
        if (!k) return;
        byKey.set(k, [...(byKey.get(k) || []), i.id]);
    });

    const rows: RenumberRow[] = [];
    const blocked: RenumberPlan['blocked'] = [];
    const nextSeq = { KITCHEN: 1, BAR: 1, GENERAL: 1, FUEL: 1 } as Record<StockArea, number>;
    const seen = new Set<string>();

    areas.forEach(area => {
        const order = sectionOrder[area] || [];
        const rank = (cat?: string) => { const i = order.indexOf(String(cat || '')); return i < 0 ? order.length : i; };
        const list = items
            .filter(i => i.area === area)
            .filter(i => {
                if (blockedIds.has(i.id)) { if (!seen.has(i.id)) blocked.push({ stockId: i.id, reason: '同一 ID 同时存在于多个区域，先人工处理' }); seen.add(i.id); return false; }
                if (seen.has(i.id)) return false;
                seen.add(i.id);
                return true;
            })
            .sort((a, b) => rank(a.category) - rank(b.category)
                || collator.compare(a.name || '', b.name || '')
                || collator.compare(a.id, b.id));
        list.forEach(i => {
            const newCode = formatStockCode(area, nextSeq[area]++);
            const legacy = new Set(i.legacyCodes || []);
            if (isHumanLegacyCode(i.id)) legacy.add(i.id);
            if (i.stockCode && i.stockCode !== newCode) legacy.add(i.stockCode);
            legacy.delete(newCode);
            const s = suggestStockName(i.name || '');
            rows.push({
                stockId: i.id, area, category: i.category || '', name: i.name || '',
                oldDisplay: i.stockCode || i.id,
                newCode,
                legacyCodes: [...legacy],
                suggestedName: s.suggested,
                nameIssue: s.issue,
                duplicateNameWith: (byKey.get(nameKey(i.name || '')) || []).filter(id => id !== i.id),
            });
        });
    });
    return { rows, nextSeq, blocked };
};

/** 计划的指纹：写入时比对，确认负责人看过的就是要写的 */
export const planFingerprint = (plan: RenumberPlan): string => {
    const text = plan.rows.map(r => `${r.stockId}>${r.newCode}`).join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `${plan.rows.length}-${(h >>> 0).toString(16)}`;
};

// ── 一般存档不能改编号 ────────────────────────────────────────────────────────

/** 只有配号 / 重新编号工具能写的字段 */
export const STOCK_CODE_FIELDS = ['stockCode', 'stockCodeAssignedAt', 'stockCodeAssignedBy', 'stockCodeSource', 'stockCodeRunId', 'legacyCodes', 'nameHistory'] as const;

/**
 * 一般存档（编辑商品、收货、盘点）时：编号字段一律以资料库现有的为准。
 * 画面上拿到的是旧资料（例如打开编辑窗后别人刚配了号）也不会把编号盖掉或清掉。
 */
export const keepStockCodeFields = <T extends Record<string, any>>(existing: Record<string, any>, next: T): T => {
    const out: Record<string, any> = { ...next };
    STOCK_CODE_FIELDS.forEach(f => {
        if (existing[f] !== undefined) out[f] = existing[f];
        else delete out[f];
    });
    return out as T;
};
