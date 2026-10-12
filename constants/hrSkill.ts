// ==========================================
// 🎓 员工技能等级 + PIC 负责项目
// ------------------------------------------
// 技能等级照老板给的《员工技能等级表 / Employee Skill Level》：
//   1 学习级 In Training   — 需要教导，不能独立完成
//   2 辅助级 Limited       — 基本会做，但还需要指导
//   3 独立级 Unsupervised  — 可以独立完成，达到标准
//   4 熟练级 Operator      — 完全掌握，可以教导其他员工
// 一个员工只有「一个」总等级（不按岗位分开评）。
//
// PIC = 这个人本身负责什么（个人清洁、冰箱、垃圾房…），每项可以打分。
// ==========================================

export type SkillLevel = 1 | 2 | 3 | 4;

export interface SkillLevelDef {
    level: SkillLevel;
    zh: string;
    en: string;
    desc: string;
    /** 画面上的配色 (Tailwind) */
    cls: string;
    /** PDF / Excel 用的纯文字 */
    text: string;
}

export const SKILL_LEVELS: SkillLevelDef[] = [
    { level: 1, zh: '学习级', en: 'In Training',  desc: '需要教导，不能独立完成',   cls: 'bg-gray-100 text-gray-700 border-gray-300',       text: 'L1 学习级 (In Training)' },
    { level: 2, zh: '辅助级', en: 'Limited',      desc: '基本会做，但还需要指导',   cls: 'bg-orange-100 text-orange-800 border-orange-300', text: 'L2 辅助级 (Limited)' },
    { level: 3, zh: '独立级', en: 'Unsupervised', desc: '可以独立完成，达到标准',   cls: 'bg-blue-100 text-blue-800 border-blue-300',       text: 'L3 独立级 (Unsupervised)' },
    { level: 4, zh: '熟练级', en: 'Operator',     desc: '完全掌握，可以教导其他员工', cls: 'bg-green-100 text-green-800 border-green-300',   text: 'L4 熟练级 (Operator)' },
];

export const getSkillLevel = (lv?: number): SkillLevelDef | null =>
    SKILL_LEVELS.find(s => s.level === lv) || null;

/** 导出用：没评过就回 '-' */
export const skillLevelText = (lv?: number): string => getSkillLevel(lv)?.text || '-';

// ---------- PIC 负责项目 ----------

export interface PicArea {
    id: string;
    /** 项目名称，例如「个人清洁」 */
    name: string;
    /** 评分 1-5；没评过 = undefined */
    score?: number;
    note?: string;
    /** 最后评分日期 YYYY-MM-DD */
    ratedAt?: string;
    /** 谁评的 */
    ratedBy?: string;
}

/** 常用负责项目，老板也可以自己打字新增 */
export const DEFAULT_PIC_AREAS: string[] = [
    '个人清洁 (Personal Hygiene)',
    '制服仪容 (Uniform)',
    '工作区清洁 (Work Area)',
    '冰箱 / 冷库 (Chiller & Freezer)',
    '干货存放 (Dry Store)',
    '垃圾房 (Garbage Room)',
    '厕所清洁 (Toilet)',
    '器具保养 (Equipment Care)',
    '开档准备 (Opening Prep)',
    '收档清洁 (Closing Clean)',
    '消防与安全 (Fire & Safety)',
    '灭虫记录 (Pest Control)',
];

export const PIC_SCORE_LABELS: Record<number, string> = {
    1: '差 (Poor)',
    2: '待改进 (Below)',
    3: '合格 (OK)',
    4: '良好 (Good)',
    5: '优秀 (Excellent)',
};

/** 平均分；没有任何评分回 null */
export const picAverage = (areas?: PicArea[]): number | null => {
    const scored = (areas || []).filter(a => typeof a.score === 'number' && a.score! > 0);
    if (scored.length === 0) return null;
    return scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length;
};

/** 导出用：「个人清洁 4★、垃圾房 3★」 */
export const picAreasText = (areas?: PicArea[]): string => {
    if (!areas || areas.length === 0) return '-';
    return areas
        .map(a => `${a.name.split('(')[0].trim()}${a.score ? ` ${a.score}★` : ''}`)
        .join('、');
};
