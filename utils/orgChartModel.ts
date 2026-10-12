// ============================================================================
// 🏢 组织架构模型：BOD → MANAGEMENT → DEPARTMENTS → STAFF
// ----------------------------------------------------------------------------
// 跟权限无关：
//   · orgLevel（L1–L5）继续决定系统权限 / 入口，这里不改它
//   · department 继续给薪资、P&L、排班用，这里只读
// 组织图专用栏位（types.ts → Employee）：
//   orgChartTier / orgPosition / orgUnit / reportsTo / orgSecondaryRole / orgSecondaryReportsTo
// 没有设定的人按 orgLevel 自动判断，所以旧资料不用改也能画。
// ============================================================================

import type { Employee } from '../types';
import { getOrgLevel } from './orgAccess';

export type OrgTier = 'BOD' | 'MANAGEMENT' | 'STAFF';

export const ORG_TIER_OPTIONS: { value: OrgTier; label: string; short: string }[] = [
    { value: 'BOD', label: 'BOD 董事 (Board of Directors)', short: 'BOD' },
    { value: 'MANAGEMENT', label: 'Management 管理层', short: 'Management' },
    { value: 'STAFF', label: 'Staff 员工', short: 'Staff' },
];

/** 管理层「负责单位」的建议选项（可以自己打别的） */
export const ORG_UNIT_SUGGESTIONS = ['Accounting 会计', 'HR 人事', 'Marketing 市场', 'Purchasing 采购', 'Operations 营运'];

/** 营运部门（有员工的部门）—— 跟 department 栏位一致 */
export const OPS_DEPTS = ['KITCHEN', 'FLOOR', 'BAR', 'DISHWASH'] as const;
export const DEPT_META: Record<string, { zh: string; en: string; emoji: string }> = {
    KITCHEN: { zh: '厨房', en: 'Kitchen', emoji: '🍳' },
    FLOOR: { zh: '楼面', en: 'Floor', emoji: '🛎️' },
    BAR: { zh: '水吧', en: 'Bar', emoji: '🥤' },
    DISHWASH: { zh: '洗碗 / 清洁', en: 'Dishwash / Cleaning', emoji: '🧽' },
    BACK_OFFICE: { zh: '后勤', en: 'Back Office', emoji: '💼' },
    OTHER: { zh: '其他', en: 'Other', emoji: '•' },
    OWNER: { zh: '老板', en: 'Owner', emoji: '👑' },
    UNASSIGNED: { zh: '未分部门', en: 'Unassigned', emoji: '?' },
};
const DEPT_ORDER = ['KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER', 'OWNER', 'UNASSIGNED'];

/** 组织层级：有设定用设定；没有就按权限职级推断 */
export const resolveTier = (e: Partial<Employee>): OrgTier => {
    if (e.orgChartTier === 'BOD' || e.orgChartTier === 'MANAGEMENT' || e.orgChartTier === 'STAFF') return e.orgChartTier;
    const lv = getOrgLevel(e as Employee);
    if (lv === 'OWNER') return 'BOD';
    if (lv === 'BRANCH_MANAGER' || lv === 'STAFF_SUPPORT' || lv === 'DEPARTMENT_HEAD') return 'MANAGEMENT';
    return 'STAFF';
};

export const isTierAuto = (e: Partial<Employee>) => !e.orgChartTier;

/** 「Kitchen Cook (厨师)」→ { zh: '厨师', en: 'Kitchen Cook' } */
export const splitRole = (role?: string) => {
    const r = (role || '').trim();
    const m = r.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (m) return { zh: m[2].trim(), en: m[1].trim() };
    return /[一-鿿]/.test(r) ? { zh: r, en: '' } : { zh: '', en: r };
};

/** 组织图上显示的职位 */
export const resolvePosition = (e: Partial<Employee>) => {
    if (e.orgPosition && e.orgPosition.trim()) return { zh: '', en: e.orgPosition.trim(), custom: true };
    return { ...splitRole(e.role), custom: false };
};

export const deptOf = (e: Partial<Employee>) => e.department || 'UNASSIGNED';
export const isOpsDept = (d?: string) => !!d && (OPS_DEPTS as readonly string[]).includes(d);

export interface OrgColumn {
    /** 栏位 key：营运部门 = department；其他 = 'UNIT:<名称>' */
    key: string;
    title: string;
    subtitle: string;
    emoji: string;
    /** 这一栏的员工（只有营运部门才有） */
    staff: Employee[];
    /** 是不是营运部门（有「部门」方块） */
    isDept: boolean;
}

/** 管理层方块：可以横跨好几个部门（例如 Kelvin 管楼面 + 水吧 + 洗碗） */
export interface MgmtBlock {
    key: string;
    /** 覆盖的栏位 index（含），用来排版 */
    colStart: number;
    colEnd: number;
    /** 实际管的栏位 key（连线只接这些） */
    covers: string[];
    managers: Employee[];
    /** 非营运单位（HR / Accounting…）的标题 */
    unitTitle?: string;
    unitSubtitle?: string;
    unitEmoji?: string;
}

export interface SecondaryLink {
    fromId: string; // 第二身份汇报对象（例如 Ben）
    toId: string; // 本人（例如 Venice）
    label: string; // 例如「PA」
}

export interface OrgChartData {
    bod: Employee[];
    columns: OrgColumn[];
    mgmt: MgmtBlock[];
    secondary: SecondaryLink[];
    /** 员工的直属上司跟部门负责人不同时，显示「汇报：X」 */
    reportsToName: Record<string, string>;
}

const byName = (a: Employee, b: Employee) => String(a.name).localeCompare(String(b.name));

type ColKey = { key: string; title: string; subtitle: string; emoji: string; isDept: boolean };

const deptCol = (d: string): ColKey => {
    const m = DEPT_META[d] || { zh: d, en: '', emoji: '•' };
    return { key: d, title: m.zh, subtitle: m.en, emoji: m.emoji, isDept: true };
};

/** 管理层管哪些栏：有勾「管理部门」用那些；否则营运部门 = 自己部门；其他 = 负责单位 / 职位 */
export const managedColumnsOf = (e: Partial<Employee>): ColKey[] => {
    const picked = (e.orgManagesDepts || []).filter(isOpsDept);
    if (picked.length) return picked.map(deptCol);
    const d = deptOf(e);
    if (!e.orgUnit && isOpsDept(d)) return [deptCol(d)];
    const unit = (e.orgUnit || '').trim();
    if (unit) {
        const m = unit.match(/^(.*?)\s+([\u4e00-\u9fff].*)$/); // 「Accounting 会计」
        return [{ key: `UNIT:${unit}`, title: m ? m[2] : unit, subtitle: m ? m[1] : '', emoji: '🗂️', isDept: false }];
    }
    const pos = resolvePosition(e);
    const t = pos.zh || pos.en || DEPT_META[d]?.zh || '管理';
    return [{ key: `UNIT:${t}`, title: t, subtitle: pos.zh ? pos.en : '', emoji: '🗂️', isDept: false }];
};

/** 把在职员工整理成组织图需要的结构（不 hardcode 任何名字） */
export const buildOrgChart = (employees: Employee[]): OrgChartData => {
    const bod = employees.filter(e => resolveTier(e) === 'BOD').sort(byName);
    const mgmtPeople = employees.filter(e => resolveTier(e) === 'MANAGEMENT').sort(byName);
    const staff = employees.filter(e => resolveTier(e) === 'STAFF');
    const byId = new Map(employees.map(e => [e.id, e]));

    // 1. 栏位：员工所在部门 + 管理层管的部门 / 单位
    const colMap = new Map<string, OrgColumn>();
    const ensure = (k: ColKey) => {
        if (!colMap.has(k.key)) colMap.set(k.key, { ...k, staff: [] });
        return colMap.get(k.key)!;
    };
    const managed = new Map<string, ColKey[]>();
    mgmtPeople.forEach(m => {
        const cols = managedColumnsOf(m);
        managed.set(m.id, cols);
        cols.forEach(ensure);
    });
    staff.forEach(s => ensure(deptCol(deptOf(s))).staff.push(s));

    const columns = Array.from(colMap.values()).sort((a, b) => {
        const ia = DEPT_ORDER.indexOf(a.key);
        const ib = DEPT_ORDER.indexOf(b.key);
        return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib) || a.title.localeCompare(b.title);
    });
    columns.forEach(c => c.staff.sort((a, b) => Number(getOrgLevel(b) === 'TEAM_LEAD') - Number(getOrgLevel(a) === 'TEAM_LEAD') || byName(a, b)));
    const idx = new Map(columns.map((c, i) => [c.key, i]));

    // 2. 管理层方块：管同一组部门的人放同一格
    const blockMap = new Map<string, MgmtBlock>();
    mgmtPeople.forEach(m => {
        const cols = managed.get(m.id) || [];
        const covers = cols.map(c => c.key).sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
        const key = covers.join('+');
        if (!blockMap.has(key)) {
            const is = covers.map(k => idx.get(k) ?? 0);
            const unit = cols.length === 1 && !cols[0].isDept ? cols[0] : null;
            blockMap.set(key, {
                key,
                colStart: Math.min(...is),
                colEnd: Math.max(...is),
                covers,
                managers: [],
                unitTitle: unit?.title,
                unitSubtitle: unit?.subtitle,
                unitEmoji: unit?.emoji,
            });
        }
        blockMap.get(key)!.managers.push(m);
    });
    const mgmt = Array.from(blockMap.values()).sort((a, b) => a.colStart - b.colStart || a.colEnd - b.colEnd);

    // 3. 直属上司跟该栏负责人不同 → 标出来
    const headsOf = (colKey: string) => new Set(mgmt.filter(b => b.covers.includes(colKey)).flatMap(b => b.managers.map(m => m.id)));
    const reportsToName: Record<string, string> = {};
    columns.forEach(c => {
        const heads = headsOf(c.key);
        c.staff.forEach(s => {
            if (s.reportsTo && !heads.has(s.reportsTo) && byId.has(s.reportsTo)) reportsToName[s.id] = byId.get(s.reportsTo)!.name;
        });
    });
    mgmtPeople.forEach(m => {
        const boss = m.reportsTo ? byId.get(m.reportsTo) : undefined;
        if (boss && resolveTier(boss) !== 'BOD') reportsToName[m.id] = boss.name;
    });

    const secondary: SecondaryLink[] = employees
        .filter(e => e.orgSecondaryReportsTo && byId.has(e.orgSecondaryReportsTo) && e.orgSecondaryReportsTo !== e.id)
        .map(e => ({ fromId: e.orgSecondaryReportsTo!, toId: e.id, label: shortRole(e.orgSecondaryRole) }));

    return { bod, columns, mgmt, secondary, reportsToName };
};

/** 「Personal Assistant」→「PA」，其他照原文 */
export const shortRole = (r?: string) => {
    const t = (r || '').trim();
    if (!t) return '';
    if (/personal\s*assistant/i.test(t) || /私人助理|助理/.test(t)) return 'PA';
    return t;
};

/** 第二身份的徽章文字：「PA to BEN」 */
export const secondaryBadge = (e: Partial<Employee>, all: Employee[]) => {
    if (!e.orgSecondaryRole && !e.orgSecondaryReportsTo) return '';
    const who = all.find(x => x.id === e.orgSecondaryReportsTo);
    const role = shortRole(e.orgSecondaryRole) || '协助';
    return who ? `${role} to ${who.name}` : role;
};
