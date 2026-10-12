// ============================================================================
// 🏢 管理层板块 (Management Divisions)
// ----------------------------------------------------------------------------
// 组织图：董事会 → 管理层板块 → 部门主管 + 部门员工
//   板块例子：厨房管理（Ben / Venice）、营运管理（Jake / Evelyn）、市场营销管理、人力资源与行政管理
//   · 一个板块 = 名称 + 颜色 + 负责人（可以多个，BOD 也可以）+ 管哪些营运部门
//   · 部门主管（Nai Maung、Kelvin…）= 组织层级 Management、管理部门落在这个板块里的人
//   · 部门员工 = 组织层级 Staff、工作部门落在这个板块里的人
// 存在 Firestore config/org_divisions；还没设定过 → 按员工资料自动产生一份，老板再改。
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Employee } from '../types';
import { getOrgLevel } from './orgAccess';
import { DEPT_META, OPS_DEPTS, deptOf, isOpsDept, managedColumnsOf, resolveTier } from './orgChartModel';

export interface OrgDivision {
    id: string;
    nameZh: string;
    nameEn: string;
    /** 板块方块颜色 */
    color: DivisionColor;
    /** 下面部门面板的颜色（没设定 = 跟板块一样） */
    panelColor?: DivisionColor;
    /** 负责人（员工 id），可以多个 */
    leaderIds: string[];
    /** 管哪些营运部门 */
    depts: string[];
}

export type DivisionColor = 'yellow' | 'green' | 'blue' | 'purple' | 'red' | 'teal' | 'orange' | 'slate';

export const DIVISION_COLORS: Record<DivisionColor, { label: string; solid: string; bg: string; border: string; text: string; soft: string }> = {
    yellow: { label: '黄', solid: '#F5B301', bg: '#FFF9E6', border: '#F7D774', text: '#7A5300', soft: '#FFF3C4' },
    green: { label: '绿', solid: '#1F9D55', bg: '#EEFBF3', border: '#8FD9AE', text: '#14532D', soft: '#D8F5E3' },
    blue: { label: '蓝', solid: '#1D6FD8', bg: '#EEF5FF', border: '#9CC3F5', text: '#103D7A', soft: '#DCEBFF' },
    purple: { label: '紫', solid: '#7C4DDB', bg: '#F5F0FF', border: '#C7B3F5', text: '#4C2A99', soft: '#E9E0FF' },
    red: { label: '红', solid: '#E5294B', bg: '#FFF1F3', border: '#F7A3B2', text: '#8A1230', soft: '#FFE0E6' },
    teal: { label: '青', solid: '#0E9F9A', bg: '#ECFBFA', border: '#8ADBD7', text: '#0B5552', soft: '#D3F5F3' },
    orange: { label: '橙', solid: '#EA7317', bg: '#FFF5EC', border: '#F8C394', text: '#7C3A06', soft: '#FFE6D1' },
    slate: { label: '灰', solid: '#475569', bg: '#F5F7FA', border: '#CBD5E1', text: '#1E293B', soft: '#E7ECF2' },
};
const COLOR_CYCLE: DivisionColor[] = ['yellow', 'green', 'blue', 'purple', 'teal', 'orange', 'red', 'slate'];

const newId = () => `div_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// 自动产生（第一次用，还没存过设定）
// ---------------------------------------------------------------------------

export const suggestDivisions = (employees: Employee[]): OrgDivision[] => {
    const out: OrgDivision[] = [];
    const used = new Set<string>();
    const mgmt = employees.filter(e => resolveTier(e) === 'MANAGEMENT');
    let ci = 0;
    const nextColor = () => COLOR_CYCLE[ci++ % COLOR_CYCLE.length];

    // 1. 部门主管管的部门组合 → 一个板块（例如 厨房；楼面 + 水吧 + 洗碗）
    const groups = new Map<string, string[]>();
    mgmt.forEach(m => {
        const depts = managedColumnsOf(m).filter(c => c.isDept).map(c => c.key);
        if (!depts.length) return;
        const key = [...depts].sort().join('+');
        if (!groups.has(key)) groups.set(key, depts);
    });
    groups.forEach(depts => {
        const fresh = depts.filter(d => !used.has(d));
        if (!fresh.length) return;
        fresh.forEach(d => used.add(d));
        const multi = fresh.length > 1;
        out.push({
            id: newId(),
            nameZh: multi ? '营运管理' : `${DEPT_META[fresh[0]]?.zh || fresh[0]}管理`,
            nameEn: multi ? 'Operations Management' : `${DEPT_META[fresh[0]]?.en || fresh[0]} Management`,
            color: nextColor(),
            leaderIds: [],
            depts: fresh,
        });
    });
    // 2. 还没被管到、但有员工的营运部门
    OPS_DEPTS.forEach(d => {
        if (used.has(d)) return;
        if (!employees.some(e => resolveTier(e) === 'STAFF' && deptOf(e) === d)) return;
        used.add(d);
        out.push({ id: newId(), nameZh: `${DEPT_META[d].zh}管理`, nameEn: `${DEPT_META[d].en} Management`, color: nextColor(), leaderIds: [], depts: [d] });
    });
    // 3. 非营运单位（HR、Accounting…）→ 一人一个板块，负责人就是他
    mgmt.forEach(m => {
        const cols = managedColumnsOf(m);
        if (cols.some(c => c.isDept)) return;
        const c = cols[0];
        out.push({
            id: newId(),
            nameZh: c.title,
            nameEn: c.subtitle || c.title,
            color: nextColor(),
            leaderIds: [m.id],
            depts: [],
        });
    });
    return out;
};

// ---------------------------------------------------------------------------
// 读 / 存（模块级缓存，一个 session 读一次）
// ---------------------------------------------------------------------------

let cache: OrgDivision[] | null | undefined; // undefined = 还没读；null = 读过但没设定
const sanitize = (list: any[]): OrgDivision[] =>
    (list || [])
        .filter(d => d && typeof d.id === 'string')
        .map(d => ({
            id: d.id,
            nameZh: String(d.nameZh || ''),
            nameEn: String(d.nameEn || ''),
            color: (DIVISION_COLORS as any)[d.color] ? d.color : 'slate',
            ...((DIVISION_COLORS as any)[d.panelColor] ? { panelColor: d.panelColor } : {}),
            leaderIds: Array.isArray(d.leaderIds) ? d.leaderIds.filter((x: any) => typeof x === 'string') : [],
            depts: Array.isArray(d.depts) ? d.depts.filter(isOpsDept) : [],
        }));

export const loadDivisions = async (): Promise<OrgDivision[] | null> => {
    if (cache !== undefined) return cache;
    try {
        const snap = await getDoc(doc(db, 'config', 'org_divisions'));
        const data: any = snap.exists() ? snap.data() : null;
        cache = data && Array.isArray(data.divisions) ? sanitize(data.divisions) : null;
    } catch (err) {
        console.warn('[orgDivisions] load failed', err);
        cache = null;
    }
    return cache;
};

export const saveDivisions = async (list: OrgDivision[], updatedBy?: string) => {
    const clean = sanitize(list);
    await setDoc(doc(db, 'config', 'org_divisions'), { divisions: clean, updatedAt: new Date().toISOString(), ...(updatedBy ? { updatedBy } : {}) });
    cache = clean;
};

/** React：拿到板块设定；还没存过 → null（画面用 suggestDivisions 自动产生） */
export const useDivisions = () => {
    const [list, setList] = useState<OrgDivision[] | null | undefined>(cache);
    useEffect(() => {
        let alive = true;
        loadDivisions().then(l => alive && setList(l));
        return () => {
            alive = false;
        };
    }, []);
    const save = useCallback(async (next: OrgDivision[], by?: string) => {
        await saveDivisions(next, by);
        setList(next);
    }, []);
    return { divisions: list, save, loading: list === undefined };
};

// ---------------------------------------------------------------------------
// 组织图资料
// ---------------------------------------------------------------------------

export interface DivisionDeptGroup {
    key: string;
    zh: string;
    en: string;
    emoji: string;
    staff: Employee[];
}

export interface DivisionView {
    def: OrgDivision;
    leaders: Employee[];
    /** 部门主管（Nai Maung、Kelvin…） */
    heads: Employee[];
    depts: DivisionDeptGroup[];
}

export interface DivisionChart {
    bod: Employee[];
    divisions: DivisionView[];
    /** 没被任何板块收到的人（不会消失，放在最后一格「其他」） */
    leftover: { heads: Employee[]; depts: DivisionDeptGroup[] };
}

const byName = (a: Employee, b: Employee) => String(a.name).localeCompare(String(b.name));
const byIdNum = (a: Employee, b: Employee) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a.id).localeCompare(String(b.id));
};

export const buildDivisionChart = (employees: Employee[], defs: OrgDivision[]): DivisionChart => {
    const byId = new Map(employees.map(e => [e.id, e]));
    const bod = employees.filter(e => resolveTier(e) === 'BOD').sort(byName);
    const heads = employees.filter(e => resolveTier(e) === 'MANAGEMENT');
    const staff = employees.filter(e => resolveTier(e) === 'STAFF');
    const placedHeads = new Set<string>();
    const placedStaff = new Set<string>();
    const leaderIds = new Set(defs.flatMap(d => d.leaderIds));

    const groupOf = (d: string, list: Employee[]): DivisionDeptGroup => {
        const m = DEPT_META[d] || { zh: d, en: '', emoji: '•' };
        return {
            key: d,
            zh: m.zh,
            en: m.en,
            emoji: m.emoji,
            // 组长在前，其他按工号
            staff: list.sort((a, b) => Number(getOrgLevel(b) === 'TEAM_LEAD') - Number(getOrgLevel(a) === 'TEAM_LEAD') || byIdNum(a, b)),
        };
    };

    const divisions: DivisionView[] = defs.map(def => {
        const leaders = def.leaderIds.map(id => byId.get(id)).filter(Boolean) as Employee[];
        const dh = heads.filter(h => {
            if (def.leaderIds.includes(h.id)) return false;
            const managed = managedColumnsOf(h).filter(c => c.isDept).map(c => c.key);
            return managed.some(k => def.depts.includes(k));
        });
        dh.forEach(h => placedHeads.add(h.id));
        const depts = def.depts.map(d => {
            const list = staff.filter(s => deptOf(s) === d);
            list.forEach(s => placedStaff.add(s.id));
            return groupOf(d, list);
        });
        return { def, leaders, heads: dh.sort(byName), depts };
    });

    // 管理层的人如果是某个板块的负责人，也算「放好了」
    heads.forEach(h => leaderIds.has(h.id) && placedHeads.add(h.id));
    const leftHeads = heads.filter(h => !placedHeads.has(h.id)).sort(byName);
    const leftStaff = staff.filter(s => !placedStaff.has(s.id));
    const leftDepts = Array.from(new Set(leftStaff.map(deptOf))).map(d => groupOf(d, leftStaff.filter(s => deptOf(s) === d)));

    return { bod, divisions, leftover: { heads: leftHeads, depts: leftDepts } };
};

export const newDivision = (i: number): OrgDivision => ({
    id: newId(),
    nameZh: '新板块',
    nameEn: 'New Division',
    color: COLOR_CYCLE[i % COLOR_CYCLE.length],
    leaderIds: [],
    depts: [],
});
