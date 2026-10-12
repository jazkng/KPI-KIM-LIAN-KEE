// ============================================================================
// 🎛️ 组织图「自由调整」设定（全公司同一份，存在 Firestore config/org_chart_layout）
// ----------------------------------------------------------------------------
//  · hiddenPositions：这些人在组织图上不显示职位文字（人还在）
//  · links：额外连线（曲线），点两个人连起来，可设实线/虚线、颜色、箭头、标签
//  · assistants：协助者小卡，挂在管理员（董事 / 管理层板块 / 部门主管）旁边
// 只影响组织图的画法，不改员工档案、不影响权限和薪资。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/** 图上的一个点：员工（emp:ID）、管理层板块（div:ID）、部门面板（panel:ID）、协助者小卡（asst:ID） */
export type OrgNodeKey = string;

export type LinkStyle = 'solid' | 'dashed' | 'dotted';
export type LinkColor = 'navy' | 'amber' | 'red' | 'green' | 'purple' | 'gray';

export const LINK_COLORS: Record<LinkColor, { label: string; stroke: string }> = {
    navy: { label: '深蓝', stroke: '#0B3B8C' },
    amber: { label: '橙', stroke: '#B45309' },
    red: { label: '红', stroke: '#DC2626' },
    green: { label: '绿', stroke: '#15803D' },
    purple: { label: '紫', stroke: '#7C3AED' },
    gray: { label: '灰', stroke: '#64748B' },
};

export const LINK_STYLES: Record<LinkStyle, { label: string; dash?: string }> = {
    solid: { label: '实线' },
    dashed: { label: '虚线', dash: '8 6' },
    dotted: { label: '点线', dash: '1.5 6' },
};

export interface OrgExtraLink {
    id: string;
    from: OrgNodeKey;
    to: OrgNodeKey;
    style: LinkStyle;
    color: LinkColor;
    arrow: boolean;
    label?: string;
}

export interface OrgAssistant {
    id: string;
    /** 挂在谁旁边：emp:ID（董事 / 部门主管）或 div:ID（管理层板块） */
    anchor: OrgNodeKey;
    empId: string;
    /** 小卡上的标题，例如「协助」「助理」「PA」 */
    title: string;
}

export interface OrgChartLayout {
    hiddenPositions: string[];
    links: OrgExtraLink[];
    assistants: OrgAssistant[];
}

export const EMPTY_LAYOUT: OrgChartLayout = { hiddenPositions: [], links: [], assistants: [] };

export const newLayoutId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const isKey = (k: any) => typeof k === 'string' && /^(emp|div|panel|asst):.+/.test(k);

export const sanitizeLayout = (raw: any): OrgChartLayout => ({
    hiddenPositions: Array.isArray(raw?.hiddenPositions) ? Array.from(new Set(raw.hiddenPositions.filter((x: any) => typeof x === 'string'))) : [],
    links: (Array.isArray(raw?.links) ? raw.links : [])
        .filter((l: any) => l && typeof l.id === 'string' && isKey(l.from) && isKey(l.to) && l.from !== l.to)
        .map((l: any) => ({
            id: l.id,
            from: l.from,
            to: l.to,
            style: (LINK_STYLES as any)[l.style] ? l.style : 'dashed',
            color: (LINK_COLORS as any)[l.color] ? l.color : 'amber',
            arrow: l.arrow !== false,
            ...(l.label ? { label: String(l.label).slice(0, 24) } : {}),
        })),
    assistants: (Array.isArray(raw?.assistants) ? raw.assistants : [])
        .filter((a: any) => a && typeof a.id === 'string' && isKey(a.anchor) && typeof a.empId === 'string')
        .map((a: any) => ({ id: a.id, anchor: a.anchor, empId: a.empId, title: String(a.title || '协助').slice(0, 16) })),
});

let cache: OrgChartLayout | undefined;

export const loadOrgLayout = async (): Promise<OrgChartLayout> => {
    if (cache) return cache;
    try {
        const snap = await getDoc(doc(db, 'config', 'org_chart_layout'));
        cache = snap.exists() ? sanitizeLayout(snap.data()) : EMPTY_LAYOUT;
    } catch (err) {
        console.warn('[orgChartLayout] load failed', err);
        cache = EMPTY_LAYOUT;
    }
    return cache;
};

export const saveOrgLayout = async (layout: OrgChartLayout) => {
    const clean = sanitizeLayout(layout);
    await setDoc(doc(db, 'config', 'org_chart_layout'), { ...clean, updatedAt: new Date().toISOString() });
    cache = clean;
    return clean;
};

/** React：读设定；update() 先改画面再存，存失败就退回去 */
export const useOrgLayout = () => {
    const [layout, setLayout] = useState<OrgChartLayout>(cache || EMPTY_LAYOUT);
    const ref = useRef<OrgChartLayout>(layout);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let alive = true;
        loadOrgLayout().then(l => {
            if (!alive) return;
            ref.current = l;
            setLayout(l);
        });
        return () => {
            alive = false;
        };
    }, []);
    const update = useCallback(async (fn: (prev: OrgChartLayout) => OrgChartLayout) => {
        const before = ref.current;
        const next = sanitizeLayout(fn(before));
        ref.current = next;
        setLayout(next);
        setSaving(true);
        try {
            await saveOrgLayout(next);
        } catch (err) {
            console.error('[orgChartLayout] save failed', err);
            ref.current = before;
            setLayout(before);
            alert('❌ 组织图调整没存到，请检查网络后再试');
        } finally {
            setSaving(false);
        }
    }, []);
    return { layout, update, saving };
};

// ---------------------------------------------------------------------------
// 曲线：两个方块之间画一条三次贝兹曲线（上下关系走上下边，左右关系走左右边）
// ---------------------------------------------------------------------------
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const curveBetween = (A: Box, B: Box) => {
    const acx = A.x + A.w / 2;
    const acy = A.y + A.h / 2;
    const bcx = B.x + B.w / 2;
    const bcy = B.y + B.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;
    let p0: [number, number];
    let p1: [number, number];
    let p2: [number, number];
    let p3: [number, number];
    const vertical = Math.abs(dy) > Math.abs(dx) * 0.6 && Math.abs(dy) > (A.h + B.h) / 2;
    if (vertical) {
        const s = dy > 0 ? 1 : -1;
        p0 = [acx, s > 0 ? A.y + A.h : A.y];
        p3 = [bcx, s > 0 ? B.y : B.y + B.h];
        const k = Math.max(36, Math.abs(p3[1] - p0[1]) * 0.5);
        p1 = [p0[0], p0[1] + s * k];
        p2 = [p3[0], p3[1] - s * k];
    } else {
        const s = dx > 0 ? 1 : -1;
        p0 = [s > 0 ? A.x + A.w : A.x, acy];
        p3 = [s > 0 ? B.x : B.x + B.w, bcy];
        const k = Math.max(36, Math.abs(p3[0] - p0[0]) * 0.5);
        p1 = [p0[0] + s * k, p0[1]];
        p2 = [p3[0] - s * k, p3[1]];
    }
    const d = `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;
    const mid: [number, number] = [(p0[0] + 3 * p1[0] + 3 * p2[0] + p3[0]) / 8, (p0[1] + 3 * p1[1] + 3 * p2[1] + p3[1]) / 8];
    // 箭头：沿着曲线最后一段的方向
    let ux = p3[0] - p2[0];
    let uy = p3[1] - p2[1];
    const len = Math.hypot(ux, uy) || 1;
    ux /= len;
    uy /= len;
    const L = 10;
    const W = 5;
    const bx = p3[0] - ux * L;
    const by = p3[1] - uy * L;
    const arrow = `M ${p3[0]} ${p3[1]} L ${bx - uy * W} ${by + ux * W} L ${bx + uy * W} ${by - ux * W} Z`;
    return { d, mid, arrow };
};
