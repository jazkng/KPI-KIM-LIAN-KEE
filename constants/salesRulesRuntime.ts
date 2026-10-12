// ==========================================
// ⚙️ 销售分类规则 — 执行期设定
// ------------------------------------------
// 原本 SKU→分类、报表分组都写死在 salesCategoryRules.ts。
// 这里把它们变成「可以被设定档覆盖」的执行期规则：
//
//   1. 没有设定档 / 设定档坏掉 → 自动用 salesCategoryRules.ts 的内建规则（保底）
//   2. 有设定档 → 用使用者自己排的
//
// ⚠️ 改规则只影响「之后的分类计算」。已经导入的月份存的是 categoryTotals，
//    要让旧月份跟着变，必须用存好的 skuRows 重算（见 recalcMonth）。
// ==========================================

import {
    SalesCategoryId,
    PrefixRule,
    ReportGroup,
    SKU_PREFIX_RULES,
    SKU_EXACT_RULES,
    NAME_KEYWORD_RULES,
    REPORT_GROUPS_SIMPLE,
    REPORT_GROUPS_DETAILED,
} from './salesCategoryRules';

export interface KeywordRuleConfig {
    keywords: string[];
    category: SalesCategoryId;
    note?: string;
}

export interface SalesRulesConfig {
    /** 每次保存 +1，方便日后排查是哪一版算出来的 */
    version: number;
    prefixRules: PrefixRule[];
    exactRules: Record<string, SalesCategoryId>;
    keywordRules: KeywordRuleConfig[];
    groupsSimple: ReportGroup[];
    groupsDetailed: ReportGroup[];
    updatedAt?: string;
    updatedBy?: string;
}

/** 内建规则 —— 设定档不存在或坏掉时的保底 */
export const BUILTIN_SALES_RULES: SalesRulesConfig = {
    version: 0,
    prefixRules: SKU_PREFIX_RULES,
    exactRules: SKU_EXACT_RULES,
    keywordRules: NAME_KEYWORD_RULES.map(r => ({ keywords: r.keywords, category: r.category, note: r.note })),
    groupsSimple: REPORT_GROUPS_SIMPLE,
    groupsDetailed: REPORT_GROUPS_DETAILED,
};

// ==========================================
// 正规化：把使用者填的东西整理成安全可用的形状
// ------------------------------------------
// - 前缀一律大写去空白
// - 前缀长的排前面（'OJ' 必须比 'J' 先比对，不靠使用者自己记顺序）
// - range 数字颠倒了自动对调
// - 明显坏掉的行直接丢掉，不让它污染分类
// ==========================================
export const normalizeSalesRules = (raw: Partial<SalesRulesConfig> | null | undefined): SalesRulesConfig => {
    if (!raw) return BUILTIN_SALES_RULES;

    const prefixRules: PrefixRule[] = Array.isArray(raw.prefixRules)
        ? raw.prefixRules
              .map(r => {
                  const prefix = String(r?.prefix ?? '').trim().toUpperCase();
                  if (!prefix || !r?.category) return null;
                  let range: [number, number] | null = null;
                  if (Array.isArray(r.range) && r.range.length === 2) {
                      const a = Number(r.range[0]);
                      const b = Number(r.range[1]);
                      if (!isNaN(a) && !isNaN(b)) range = a <= b ? [a, b] : [b, a];
                  }
                  return { prefix, range, category: r.category as SalesCategoryId };
              })
              .filter((x): x is PrefixRule => x !== null)
              // 长前缀优先，同长度维持原顺序
              .sort((a, b) => b.prefix.length - a.prefix.length)
        : BUILTIN_SALES_RULES.prefixRules;

    const exactRules: Record<string, SalesCategoryId> = {};
    const rawExact = raw.exactRules && typeof raw.exactRules === 'object' ? raw.exactRules : BUILTIN_SALES_RULES.exactRules;
    Object.entries(rawExact).forEach(([k, v]) => {
        const key = String(k).trim().toUpperCase();
        if (key && v) exactRules[key] = v as SalesCategoryId;
    });

    const keywordRules: KeywordRuleConfig[] = Array.isArray(raw.keywordRules)
        ? raw.keywordRules
              .map(r => ({
                  keywords: (Array.isArray(r?.keywords) ? r.keywords : [])
                      .map(k => String(k).trim())
                      .filter(k => k !== ''),
                  category: r?.category as SalesCategoryId,
                  note: r?.note,
              }))
              .filter(r => r.keywords.length > 0 && !!r.category)
        : BUILTIN_SALES_RULES.keywordRules;

    const fixGroups = (groups: any, fallback: ReportGroup[]): ReportGroup[] => {
        if (!Array.isArray(groups) || groups.length === 0) return fallback;
        const out = groups
            .map((g: any) => {
                const members = (Array.isArray(g?.members) ? g.members : []).filter(Boolean);
                if (!g?.id || !g?.label || members.length === 0) return null;
                const children = Array.isArray(g.children)
                    ? g.children
                          .map((c: any) => ({
                              id: c?.id,
                              label: c?.label,
                              members: (Array.isArray(c?.members) ? c.members : []).filter(Boolean),
                              note: c?.note,
                          }))
                          .filter((c: any) => c.id && c.label && c.members.length > 0)
                    : undefined;
                return {
                    id: String(g.id),
                    label: String(g.label),
                    members,
                    underShopLot: !!g.underShopLot,
                    ...(children && children.length > 0 ? { children } : {}),
                };
            })
            .filter(Boolean) as ReportGroup[];
        return out.length > 0 ? out : fallback;
    };

    return {
        version: Number(raw.version) || 0,
        prefixRules,
        exactRules,
        keywordRules,
        groupsSimple: fixGroups(raw.groupsSimple, BUILTIN_SALES_RULES.groupsSimple),
        groupsDetailed: fixGroups(raw.groupsDetailed, BUILTIN_SALES_RULES.groupsDetailed),
        updatedAt: raw.updatedAt,
        updatedBy: raw.updatedBy,
    };
};

// ==========================================
// 目前生效的规则（模组层单例）
// ==========================================
let ACTIVE: SalesRulesConfig = BUILTIN_SALES_RULES;

export const getActiveSalesRules = (): SalesRulesConfig => ACTIVE;
export const setActiveSalesRules = (cfg: Partial<SalesRulesConfig> | null | undefined): SalesRulesConfig => {
    ACTIVE = normalizeSalesRules(cfg);
    return ACTIVE;
};
export const resetSalesRulesToBuiltin = (): SalesRulesConfig => {
    ACTIVE = BUILTIN_SALES_RULES;
    return ACTIVE;
};
export const isUsingBuiltinRules = (): boolean => ACTIVE === BUILTIN_SALES_RULES;

// ==========================================
// 检查：保存前先看有没有明显问题
// ------------------------------------------
// 回传的都是「提醒」，不阻止保存 —— 有些重叠是刻意的。
// ==========================================
export interface RuleIssue {
    level: 'ERROR' | 'WARN';
    message: string;
}

export const checkSalesRules = (cfg: SalesRulesConfig): RuleIssue[] => {
    const issues: RuleIssue[] = [];

    // 1. 同前缀同范围重复 —— 后面那条永远不会生效
    const seen: Record<string, string> = {};
    cfg.prefixRules.forEach(r => {
        const key = `${r.prefix}|${r.range ? `${r.range[0]}-${r.range[1]}` : 'ALL'}`;
        if (seen[key]) {
            issues.push({ level: 'WARN', message: `规则重复：${key} 同时指向「${seen[key]}」和「${r.category}」，只有上面那条会生效` });
        } else {
            seen[key] = r.category;
        }
    });

    // 2. 同前缀的「全部」规则排在范围规则前面 → 范围规则会被吃掉
    cfg.prefixRules.forEach((r, i) => {
        if (r.range !== null) return;
        const laterRanged = cfg.prefixRules.slice(i + 1).find(x => x.prefix === r.prefix && x.range !== null);
        if (laterRanged) {
            issues.push({
                level: 'WARN',
                message: `「${r.prefix}(全部)→${r.category}」排在「${r.prefix}${laterRanged.range![0]}-${laterRanged.range![1]}→${laterRanged.category}」前面，后面那条永远抓不到`,
            });
        }
    });

    // 3. 数字范围重叠
    const byPrefix: Record<string, PrefixRule[]> = {};
    cfg.prefixRules.forEach(r => {
        if (r.range === null) return;
        (byPrefix[r.prefix] = byPrefix[r.prefix] || []).push(r);
    });
    Object.entries(byPrefix).forEach(([prefix, list]) => {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i].range!;
                const b = list[j].range!;
                if (a[0] <= b[1] && b[0] <= a[1] && list[i].category !== list[j].category) {
                    issues.push({
                        level: 'WARN',
                        message: `${prefix} 的范围重叠：${a[0]}-${a[1]}(${list[i].category}) 与 ${b[0]}-${b[1]}(${list[j].category})，重叠部分算前者`,
                    });
                }
            }
        }
    });

    // 4. 报表分组：有大类没被任何一组收进去 → 那笔钱会在报表上消失
    const checkCoverage = (groups: ReportGroup[], name: string) => {
        const covered = new Set(groups.flatMap(g => g.members));
        const used = new Set(cfg.prefixRules.map(r => r.category));
        Object.values(cfg.exactRules).forEach(c => used.add(c));
        cfg.keywordRules.forEach(r => used.add(r.category));
        used.add('UNCLASSIFIED');
        const missing = Array.from(used).filter(c => !covered.has(c as SalesCategoryId));
        if (missing.length > 0) {
            issues.push({ level: 'ERROR', message: `${name} 没有收进这些大类：${missing.join('、')} —— 这些钱不会出现在报表上` });
        }
        // 子项加起来要等于父项
        groups.forEach(g => {
            if (!g.children || g.children.length === 0) return;
            const kids = [...g.children.flatMap(c => c.members)].sort().join(',');
            const par = [...g.members].sort().join(',');
            if (kids !== par) {
                issues.push({ level: 'ERROR', message: `${name} 的「${g.label}」细分子项跟合计对不上（子项：${kids || '空'} / 合计：${par}）` });
            }
        });
    };
    checkCoverage(cfg.groupsSimple, '合计版面');
    checkCoverage(cfg.groupsDetailed, '细分版面');

    return issues;
};
