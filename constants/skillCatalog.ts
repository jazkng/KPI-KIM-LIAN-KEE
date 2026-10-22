// ============================================================================
// ⭐ 工作能力星级 (Skill Stars)
// ----------------------------------------------------------------------------
// 职位（主职 / 副职）→ 工作项目 → 每一项评 ★1–★5
//   ★1 新手 · ★2 需人带 · ★3 独立 · ★4 可教人 · ★5 大师
//
// 用「星级」而不是 L1–L5，是为了不跟组织职级 (L1–L5) 撞名。
// 同一个工作项目可以属于好几个职位（例如「看单 / 叫单」= 打荷 + 马王），
// 分数只存一份，所有职位共用。
//
// 职位怎么对应到工作项目：沿用季度考核的 classifyJob(职位名称) → 岗位类别。
// 清单可以在系统里自己改（存在 Firestore config/skill_catalog），
// 这里只是第一次使用时的预设。
// ============================================================================

import { classifyJob, JOB_METRICS, JobCategory } from '../components/features/assessmentConfig';
import type { SkillRating, SkillRatingLog } from '../types';

export type StarLevel = 1 | 2 | 3 | 4 | 5;  // 与 types.ts SkillRating.level 相同

export interface StarLevelDef {
    level: StarLevel;
    zh: string;
    en: string;
    desc: string;
    /** 画面配色 (Tailwind) */
    cls: string;
}

export const STAR_LEVELS: StarLevelDef[] = [
    { level: 1, zh: '新手',   en: 'Beginner',  desc: '完全没有经验，在学',           cls: 'bg-gray-100 text-gray-700 border-gray-300' },
    { level: 2, zh: '需人带', en: 'Guided',    desc: '会做，但要有人看着 / 指导',     cls: 'bg-orange-100 text-orange-800 border-orange-300' },
    { level: 3, zh: '独立',   en: 'Independent', desc: '完全可以自己搞定，达到标准',  cls: 'bg-blue-100 text-blue-800 border-blue-300' },
    { level: 4, zh: '可教人', en: 'Trainer',   desc: '熟练到可以带新人',             cls: 'bg-green-100 text-green-800 border-green-300' },
    { level: 5, zh: '大师',   en: 'Master',    desc: '能定标准、改良做法、训练整个团队', cls: 'bg-amber-100 text-amber-800 border-amber-400' },
];

export const getStarLevel = (lv?: number): StarLevelDef | null =>
    STAR_LEVELS.find(s => s.level === lv) || null;

/** ★★★☆☆ */
export const starText = (lv?: number): string =>
    lv && lv >= 1 && lv <= 5 ? '★'.repeat(lv) + '☆'.repeat(5 - lv) : '—';

/** 主管最多给到 ★3；★4、★5 只有老板 / 管理员 */
export const MAX_STAR_FOR_SUPERVISOR: StarLevel = 3;

/** 达到「独立」才算这一项能顶 */
export const READY_STAR: StarLevel = 3;

// ---------------------------------------------------------------------------
// 工作项目
// ---------------------------------------------------------------------------

export interface SkillItem {
    id: string;
    name: string;
    /** 属于哪些岗位类别（classifyJob 的结果） */
    categories: JobCategory[];
    /** false = 停用（旧分数保留，只是不再显示） */
    active?: boolean;
}

export type { SkillRating, SkillRatingLog };

/** 有工作项目的岗位类别（顺序 = 画面 / 打印的顺序） */
export const SKILL_CATEGORIES: JobCategory[] = [
    'KITCHEN_HEAD',
    'KITCHEN_SECOND',
    'KITCHEN_PREP',
    'KITCHEN_FRY',
    'KITCHEN_RUNNER',
    'BAR',
    'FLOOR_MANAGER',
    'FLOOR_CASHIER',
    'FLOOR_WAITER',
    'LOGISTICS_CLEAN',
] as JobCategory[];

export const categoryLabel = (cat: JobCategory | string): string => {
    const m = (JOB_METRICS as any)[cat];
    return m ? `${m.emoji} ${m.label}` : String(cat);
};

export const DEFAULT_SKILL_ITEMS: SkillItem[] = [
    // 👨‍🍳 头手 / 行政总厨
    { id: 'kh_main_wok',     name: '主炒出餐',          categories: ['KITCHEN_HEAD'] },
    { id: 'kh_taste',        name: '口味把关',          categories: ['KITCHEN_HEAD'] },
    { id: 'kh_open_close',   name: '开档 / 收档安排',    categories: ['KITCHEN_HEAD'] },
    { id: 'kh_ordering',     name: '订货 / 库存',        categories: ['KITCHEN_HEAD'] },
    { id: 'manage_team',     name: '管理属下',          categories: ['KITCHEN_HEAD', 'FLOOR_MANAGER'] },
    // 🔥 帮锅 / 厨师
    { id: 'wok_cook',        name: '炒锅出餐',          categories: ['KITCHEN_SECOND'] },
    { id: 'peak_wok',        name: '高峰期顶锅',        categories: ['KITCHEN_SECOND'] },
    { id: 'kitchen_prep',    name: '备料',              categories: ['KITCHEN_SECOND'] },
    { id: 'kitchen_hygiene', name: '厨房卫生',          categories: ['KITCHEN_SECOND', 'KITCHEN_RUNNER'] },
    // 🔪 占板
    { id: 'cutting',         name: '切配',              categories: ['KITCHEN_PREP'] },
    { id: 'ingredient_prep', name: '配料准备',          categories: ['KITCHEN_PREP', 'KITCHEN_FRY'] },
    { id: 'fifo',            name: '食材保鲜 / 先进先出', categories: ['KITCHEN_PREP'] },
    { id: 'receiving',       name: '收货检查',          categories: ['KITCHEN_PREP'] },
    // 🍳 打荷
    { id: 'order_reading',   name: '看单 / 叫单',        categories: ['KITCHEN_FRY', 'KITCHEN_RUNNER'] },
    { id: 'fryer',           name: '炸炉',              categories: ['KITCHEN_FRY'] },
    { id: 'plating',         name: '摆盘出菜',          categories: ['KITCHEN_FRY'] },
    // 🏃 马王 / 厨房帮手
    { id: 'runner',          name: '传递 / 跑腿',        categories: ['KITCHEN_RUNNER'] },
    { id: 'simple_prep',     name: '洗切简单备料',      categories: ['KITCHEN_RUNNER'] },
    // 🥤 水吧
    { id: 'drinks',          name: '饮料出品',          categories: ['BAR'] },
    { id: 'bar_peak',        name: '高峰期出单',        categories: ['BAR'] },
    { id: 'bar_stock',       name: '物料准备 / 控制',    categories: ['BAR'] },
    { id: 'bar_equipment',   name: '设备清洁',          categories: ['BAR'] },
    // 💳 柜台 / 收银
    { id: 'cashier',         name: '收银结账',          categories: ['FLOOR_CASHIER'] },
    { id: 'e_payment',       name: '电子付款（卡 / TNG）', categories: ['FLOOR_CASHIER'] },
    { id: 'delivery_orders', name: '外卖平台接单',      categories: ['FLOOR_CASHIER'] },
    { id: 'daily_closing',   name: '日结对账',          categories: ['FLOOR_CASHIER'] },
    // 🛎️ 写单 / 服务员
    { id: 'order_taking',    name: '写单点单',          categories: ['FLOOR_WAITER'] },
    { id: 'upsell',          name: '推荐菜式',          categories: ['FLOOR_WAITER'] },
    { id: 'serving',         name: '传菜',              categories: ['FLOOR_WAITER'] },
    { id: 'table_turn',      name: '清台翻台',          categories: ['FLOOR_WAITER'] },
    { id: 'complaints',      name: '处理客诉',          categories: ['FLOOR_WAITER', 'FLOOR_MANAGER'] },
    // 👔 经理 / 主管
    { id: 'scheduling',      name: '排班调度',          categories: ['FLOOR_MANAGER'] },
    { id: 'open_close_store', name: '开店 / 关店',       categories: ['FLOOR_MANAGER'] },
    { id: 'closing_review',  name: '日结审核',          categories: ['FLOOR_MANAGER'] },
    // 🧹 清洁 / 洗碗
    { id: 'dishwash',        name: '洗碗消毒',          categories: ['LOGISTICS_CLEAN'] },
    { id: 'public_clean',    name: '公共区清洁',        categories: ['LOGISTICS_CLEAN'] },
    { id: 'garbage',         name: '垃圾处理',          categories: ['LOGISTICS_CLEAN'] },
] as SkillItem[];

export const itemsForCategory = (catalog: SkillItem[], cat: JobCategory | string): SkillItem[] =>
    catalog.filter(i => i.active !== false && i.categories.includes(cat as JobCategory));

// ---------------------------------------------------------------------------
// 员工 → 职位 → 工作项目
// ---------------------------------------------------------------------------

export interface EmployeePosition {
    /** 员工档案里写的职位名称 */
    title: string;
    isPrimary: boolean;
    category: JobCategory;
    items: SkillItem[];
}

interface HasRoles {
    role?: string;
    secondaryRoles?: string[];
}

/**
 * 主职在前，副职在后。
 * 两个职位落在同一个岗位类别（例如「行政总厨」+「头手」）只显示一次。
 */
export const getEmployeePositions = (emp: HasRoles, catalog: SkillItem[]): EmployeePosition[] => {
    const titles: { title: string; isPrimary: boolean }[] = [];
    if (emp.role) titles.push({ title: emp.role, isPrimary: true });
    (emp.secondaryRoles || []).forEach(t => {
        if (t && t !== emp.role) titles.push({ title: t, isPrimary: false });
    });
    const seen = new Set<string>();
    const out: EmployeePosition[] = [];
    titles.forEach(({ title, isPrimary }) => {
        const category = classifyJob(title);
        if (seen.has(category)) return;
        seen.add(category);
        out.push({ title, isPrimary, category, items: itemsForCategory(catalog, category) });
    });
    return out;
};

export type PositionStatus = 'UNRATED' | 'READY' | 'NOT_READY' | 'NO_ITEMS';

export interface PositionSummary {
    status: PositionStatus;
    /** 已评项目数 */
    rated: number;
    total: number;
    /** ≥★3 的项目数 */
    ready: number;
    /** 已评项目的平均星 */
    avg: number | null;
}

export const summarizeItems = (
    items: SkillItem[],
    ratings?: Record<string, SkillRating>,
): PositionSummary => {
    const total = items.length;
    if (total === 0) return { status: 'NO_ITEMS', rated: 0, total: 0, ready: 0, avg: null };
    const levels = items.map(i => ratings?.[i.id]?.level).filter((v): v is StarLevel => !!v);
    const rated = levels.length;
    const ready = levels.filter(v => v >= READY_STAR).length;
    const avg = rated ? levels.reduce((s, v) => s + v, 0) / rated : null;
    let status: PositionStatus = 'NOT_READY';
    if (rated === 0) status = 'UNRATED';
    else if (ready === total) status = 'READY';
    return { status, rated, total, ready, avg };
};

/** 技能分 = 主职工作项目的平均星（没评过 = null） */
export const primarySkillScore = (
    emp: HasRoles & { skillRatings?: Record<string, SkillRating> },
    catalog: SkillItem[],
): number | null => {
    const primary = getEmployeePositions(emp, catalog).find(p => p.isPrimary);
    if (!primary) return null;
    return summarizeItems(primary.items, emp.skillRatings).avg;
};

/** 每个职位（主职、副职）各自的平均星：{ 职位名称: 平均星 }，没评过的职位不会出现 */
export const positionSkillScores = (
    emp: HasRoles & { skillRatings?: Record<string, SkillRating> },
    catalog: SkillItem[],
): Record<string, number> => {
    const out: Record<string, number> = {};
    getEmployeePositions(emp, catalog).forEach(p => {
        const avg = summarizeItems(p.items, emp.skillRatings).avg;
        if (avg !== null) out[p.title] = avg;
    });
    return out;
};
