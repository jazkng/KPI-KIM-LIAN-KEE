import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    X, MousePointer2, GitMerge, Trash2, Save, RefreshCw,
    ChevronLeft, ChevronRight, Type, Square, Loader2, Layers,
    Plus, Copy, FileDown, Check, Users, Search, ZoomIn, ZoomOut,
    RotateCcw, RotateCw, Maximize2, User, BarChart2, Globe, DollarSign,
    Grid, Edit3, ChevronDown, ChevronUp, Menu, Grip,
} from 'lucide-react';
import { Employee } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// ─── TYPES ───────────────────────────────────────────────
interface OrgChartProps { onClose: () => void; }
type ToolMode = 'select' | 'connect';
type HandleDir = 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 's' | 'n';

interface ONode {
    id: string;
    kind: 'dept' | 'employee' | 'role' | 'bonus';
    x: number; y: number;
    cw?: number; ch?: number;
    label?: string; color?: string;
    memberEmpIds?: string[];
    empId?: string;
    selectedRoles?: string[];
    showRestDays?: boolean;
    showAccommodation?: boolean;
    showBonusPool?: boolean;
    overrideRestDays?: string;
    overrideAccommodation?: string;
    overrideBonusPool?: string;
    deptShowRoles?: boolean;
    deptShowRestDays?: boolean;
    deptShowAccommodation?: boolean;
    deptShowBonusPool?: boolean;
    bonusAmounts?: Record<string, string>;
    collapsed?: boolean;
}
type Anchor = 'top' | 'bottom' | 'left' | 'right';
interface OEdge { id: string; from: string; to: string; color: string; fromAnchor?: Anchor; toAnchor?: Anchor; }
interface Page  { id: string; name: string; nodes: ONode[]; edges: OEdge[]; }

// ─── CONSTANTS ───────────────────────────────────────────
const CANVAS_W  = 3200;
const CANVAS_H  = 2400;
const LS_KEY    = 'epr_orgchart_v5';
const SNAP_SIZE = 20; 
const DRAG_THRESHOLD = 5; 
const PALETTE   = ['#6366F1','#F59E0B','#10B981','#EF4444','#8B5CF6','#06B6D4','#EC4899','#64748B'];
const BASE_ROLES = [
    'Store Manager','Operations Supervisor','Head Chef','Asst Chef',
    'Captain','Waiter','Water Bar','Cleaner','Dishwasher',
    'Kitchen Cook','Kitchen Cutter','Commis / Runner','Kitchen PIC',
];

function uid() { return Math.random().toString(36).slice(2, 9); }
function snap(v: number) { return Math.round(v / SNAP_SIZE) * SNAP_SIZE; }

// ─── MOBILE DETECT ──────
function useIsMobile() {
    const [m, setM] = useState(false);
    useEffect(() => {
        const check = () => setM(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return m;
}

// ─── HR DATA HELPERS ──────
function getEmpRestDays(emp: Employee | undefined): string {
    if (!emp) return '';
    const days = (emp as any).monthlyRestDays;
    if (days !== undefined && days !== null) return `${days} 天/月`;
    return '';
}
function getEmpHostel(emp: Employee | undefined): string {
    if (!emp) return '';
    const h = (emp as any).hasHostel;
    if (h === true) return '有 (Yes)';
    if (h === false) return '无 (No)';
    return '';
}
function getEmpRole(emp: Employee | undefined): string {
    if (!emp) return '';
    return emp.role?.split('(')[0]?.trim() || '';
}
function getEmpSecondaryRoles(emp: Employee | undefined): string[] {
    if (!emp) return [];
    return ((emp as any).secondaryRoles || []) as string[];
}
function effectiveRestDays(node: ONode, emp: Employee | undefined): string {
    if (node.overrideRestDays !== undefined && node.overrideRestDays !== '') return node.overrideRestDays;
    return getEmpRestDays(emp) || 'N/A';
}
function effectiveHostel(node: ONode, emp: Employee | undefined): string {
    if (node.overrideAccommodation !== undefined && node.overrideAccommodation !== '') return node.overrideAccommodation;
    return getEmpHostel(emp) || 'N/A';
}

// ─── NODE SIZING ─────────────────────────────────────────
function autoW(n: ONode) { return n.kind === 'employee' ? 280 : n.kind === 'dept' ? 320 : n.kind === 'bonus' ? 260 : 180; }
function autoH(n: ONode, empMap?: Record<string, Employee>) {
    if (n.kind === 'bonus') {
        // 奖金池：标题行 + 每个成员一行 + 底部输入
        const members = n.memberEmpIds?.length ?? 0;
        return 56 + Math.max(1, members) * 36 + 8;
    }
    if (n.kind === 'dept') {
        if (n.collapsed) return 60;
        const members = n.memberEmpIds?.length ?? 0;
        let perRow = 48;
        if (n.deptShowRoles) {
            perRow += 18;
            if (empMap) {
                const hasAnySecondary = (n.memberEmpIds ?? []).some(eid => getEmpSecondaryRoles(empMap[eid]).length > 0);
                if (hasAnySecondary) perRow += 16;
            }
        }
        if (n.deptShowRestDays)      perRow += 18;
        if (n.deptShowAccommodation) perRow += 18;
        if (n.deptShowBonusPool)     perRow += 18;
        return 64 + Math.max(1, members) * perRow;
    }
    if (n.kind === 'employee') {
        let h = 110;
        if (empMap && n.empId) {
            const emp = empMap[n.empId];
            if (getEmpSecondaryRoles(emp).length > 0) h += 24;
        }
        if ((n.selectedRoles?.length ?? 0) > 0) h += 32;
        if (n.showRestDays)      h += 32;
        if (n.showAccommodation) h += 32;
        if (n.showBonusPool)     h += 32;
        return h;
    }
    return 38;
}
function nW(n: ONode) { return n.cw ?? autoW(n); }
function nH(n: ONode, empMap?: Record<string, Employee>) { return n.ch ?? autoH(n, empMap); }
function nCentre(n: ONode, empMap?: Record<string, Employee>) { return { cx: n.x + nW(n) / 2, cy: n.y + nH(n, empMap) / 2 }; }

// ── 锚点位置计算 ──
const ANCHORS: Anchor[] = ['top', 'bottom', 'left', 'right'];
function anchorPos(n: ONode, anchor: Anchor, empMap?: Record<string, Employee>): { x: number; y: number } {
    const w = nW(n), h = nH(n, empMap);
    switch (anchor) {
        case 'top':    return { x: n.x + w / 2, y: n.y };
        case 'bottom': return { x: n.x + w / 2, y: n.y + h };
        case 'left':   return { x: n.x,         y: n.y + h / 2 };
        case 'right':  return { x: n.x + w,     y: n.y + h / 2 };
    }
}

// 自动选择最近锚点对
function bestAnchors(fn: ONode, tn: ONode, empMap?: Record<string, Employee>): { fa: Anchor; ta: Anchor } {
    let best = { fa: 'bottom' as Anchor, ta: 'top' as Anchor, dist: Infinity };
    for (const fa of ANCHORS) {
        const fp = anchorPos(fn, fa, empMap);
        for (const ta of ANCHORS) {
            const tp = anchorPos(tn, ta, empMap);
            const d = Math.abs(fp.x - tp.x) + Math.abs(fp.y - tp.y);
            if (d < best.dist) best = { fa, ta, dist: d };
        }
    }
    return { fa: best.fa, ta: best.ta };
}

// 正交路径 SVG path (从锚点出发，带中间转弯)
function orthoPath(p1: { x: number; y: number }, a1: Anchor, p2: { x: number; y: number }, a2: Anchor): string {
    const GAP = 30; // 从锚点延伸的最小距离
    // 计算出发方向的延伸点
    const ext = (p: { x: number; y: number }, a: Anchor, g: number) => {
        switch (a) {
            case 'top':    return { x: p.x, y: p.y - g };
            case 'bottom': return { x: p.x, y: p.y + g };
            case 'left':   return { x: p.x - g, y: p.y };
            case 'right':  return { x: p.x + g, y: p.y };
        }
    };
    const e1 = ext(p1, a1, GAP);
    const e2 = ext(p2, a2, GAP);

    // 如果是纵向连接 (bottom→top 最常见的组织架构)
    if ((a1 === 'bottom' && a2 === 'top') || (a1 === 'top' && a2 === 'bottom')) {
        const midY = (e1.y + e2.y) / 2;
        return `M${p1.x},${p1.y} L${e1.x},${e1.y} L${e1.x},${midY} L${e2.x},${midY} L${e2.x},${e2.y} L${p2.x},${p2.y}`;
    }
    // 横向连接
    if ((a1 === 'right' && a2 === 'left') || (a1 === 'left' && a2 === 'right')) {
        const midX = (e1.x + e2.x) / 2;
        return `M${p1.x},${p1.y} L${e1.x},${e1.y} L${midX},${e1.y} L${midX},${e2.y} L${e2.x},${e2.y} L${p2.x},${p2.y}`;
    }
    // 其他混合方向：用三段折线
    return `M${p1.x},${p1.y} L${e1.x},${e1.y} L${e2.x},${e2.y} L${p2.x},${p2.y}`;
}

function bBox(ns: ONode[], empMap?: Record<string, Employee>) {
    if (!ns.length) return { x: 0, y: 0, w: 800, h: 600 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + nW(n)); y1 = Math.max(y1, n.y + nH(n, empMap)); }
    const p = 100;
    return { x: Math.max(0, x0 - p), y: Math.max(0, y0 - p), w: x1 - x0 + p*2, h: y1 - y0 + p*2 };
}

const newPage = (n = 1): Page => ({ id: uid(), name: `架构图 ${n}`, nodes: [], edges: [] });

// ─── HISTORY ──────────────────────────────────────────────
interface Snap { nodes: ONode[]; edges: OEdge[]; }

// ═══════════════════════════════════════════════════════
export const OrgChart: React.FC<OrgChartProps> = ({ onClose }) => {

    const isMobile = useIsMobile();

    const [employees,    setEmployees]    = useState<Employee[]>([]);
    const [pages,        setPages]        = useState<Page[]>([newPage()]);
    const [pageIdx,      setPageIdx]      = useState(0);
    const [mode,         setMode]         = useState<ToolMode>('select');
    const [selected,     setSelected]     = useState<string | null>(null);
    const [connectFrom,  setConnectFrom]  = useState<string | null>(null);
    const [connectFromAnchor, setConnectFromAnchor] = useState<Anchor | null>(null);
    const [lineColor,    setLineColor]    = useState(PALETTE[0]);
    const [leftOpen,     setLeftOpen]     = useState(false); // 手机默认关闭
    const [showExport,   setShowExport]   = useState(false);
    const [exportIds,    setExportIds]    = useState<Set<string>>(new Set());
    const [isExporting,  setIsExporting]  = useState(false);
    const [isDirty,      setIsDirty]      = useState(false);
    const [saving,       setSaving]       = useState(false);
    const [mousePos,     setMousePos]     = useState({ x: 0, y: 0 });
    const [renamingPg,   setRenamingPg]   = useState<string | null>(null);
    const [empSearch,    setEmpSearch]    = useState('');
    const [zoom,         setZoom]         = useState(1);
    const [flashId,      setFlashId]      = useState<string | null>(null);
    const [showTips,     setShowTips]     = useState(false);
    const [view,         setView]         = useState<'canvas' | 'analytics'>('canvas');
    const [snapEnabled,  setSnapEnabled]  = useState(true);
    const [editingField, setEditingField] = useState<{ nodeId: string; field: 'restDays' | 'accommodation' | 'bonusPool' } | null>(null);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showPropSheet, setShowPropSheet] = useState(false);

    const historyRef  = useRef<Snap[]>([]);
    const futureRef   = useRef<Snap[]>([]);

    const dragRef   = useRef<{
        nodeId: string; msx: number; msy: number; nsx: number; nsy: number;
        activated: boolean;
    } | null>(null);
    const resizeRef = useRef<{
        nodeId: string; dir: HandleDir;
        msx: number; msy: number;
        ox: number; oy: number; ow: number; oh: number;
    } | null>(null);
    // 双指缩放
    const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

    const pageIdxRef   = useRef(0);
    const canvasScroll = useRef<HTMLDivElement>(null);
    const canvasEl     = useRef<HTMLDivElement>(null);

    pageIdxRef.current = pageIdx;

    const currentPage = pages[pageIdx] ?? pages[0];
    const nodes       = currentPage?.nodes ?? [];
    const edges       = currentPage?.edges ?? [];

    const pushHistory = useCallback(() => {
        const pg = pages[pageIdxRef.current];
        if (!pg) return;
        historyRef.current = [...historyRef.current.slice(-30), { nodes: pg.nodes, edges: pg.edges }];
        futureRef.current  = [];
    }, [pages]);

    const mutate = useCallback((field: 'nodes' | 'edges', fn: (a: any[]) => any[], pushH = true) => {
        if (pushH) pushHistory();
        setPages(prev => prev.map((p, i) => i === pageIdxRef.current
            ? { ...p, [field]: fn(p[field]) } : p));
        setIsDirty(true);
    }, [pushHistory]);

    const setNodes = useCallback((fn: (a: ONode[]) => ONode[], ph = true) => mutate('nodes', fn as any, ph), [mutate]);
    const setEdges = useCallback((fn: (a: OEdge[]) => OEdge[], ph = true) => mutate('edges', fn as any, ph), [mutate]);
    const updateNode = useCallback((id: string, patch: Partial<ONode>) =>
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n)), [setNodes]);

    const undo = useCallback(() => {
        if (!historyRef.current.length) return;
        const pg = pages[pageIdx];
        futureRef.current = [{ nodes: pg.nodes, edges: pg.edges }, ...futureRef.current.slice(0, 30)];
        const s = historyRef.current[historyRef.current.length - 1];
        historyRef.current = historyRef.current.slice(0, -1);
        setPages(prev => prev.map((p, i) => i === pageIdx ? { ...p, ...s } : p));
        setIsDirty(true);
    }, [pages, pageIdx]);

    const redo = useCallback(() => {
        if (!futureRef.current.length) return;
        const pg = pages[pageIdx];
        historyRef.current = [...historyRef.current.slice(-30), { nodes: pg.nodes, edges: pg.edges }];
        const s = futureRef.current[0];
        futureRef.current = futureRef.current.slice(1);
        setPages(prev => prev.map((p, i) => i === pageIdx ? { ...p, ...s } : p));
        setIsDirty(true);
    }, [pages, pageIdx]);

    useEffect(() => {
        DataManager.getEmployees().then(d => setEmployees(d.filter(e => !e.isArchived)));
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) { const s = JSON.parse(raw); if (s.pages?.length) setPages(s.pages); }
        } catch {}
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try { localStorage.setItem(LS_KEY, JSON.stringify({ pages })); } catch {}
        await new Promise(r => setTimeout(r, 400));
        setSaving(false); setIsDirty(false);
    }, [pages]);

    const empMap = useMemo(() => {
        const m: Record<string, Employee> = {};
        employees.forEach(e => { m[e.id] = e; });
        return m;
    }, [employees]);

    const empIdsOnCanvas = useMemo(() => {
        const s = new Set<string>();
        nodes.forEach(n => {
            if (n.kind === 'employee' && n.empId) s.add(n.empId);
            if ((n.kind === 'dept' || n.kind === 'bonus') && n.memberEmpIds) n.memberEmpIds.forEach(id => s.add(id));
        });
        return s;
    }, [nodes]);

    const allRoles = useMemo(() => {
        const s = new Set(BASE_ROLES);
        employees.forEach(e => s.add(e.role.split('(')[0].trim()));
        return Array.from(s);
    }, [employees]);

    const filteredEmps = useMemo(() => {
        const q = empSearch.toLowerCase();
        return q ? employees.filter(e => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)) : employees;
    }, [employees, empSearch]);

    const toCanvas = useCallback((cx: number, cy: number) => {
        const w = canvasScroll.current;
        if (!w) return { x: cx, y: cy };
        const r = w.getBoundingClientRect();
        return { x: (cx - r.left + w.scrollLeft) / zoom, y: (cy - r.top + w.scrollTop) / zoom };
    }, [zoom]);

    const centreOfScroll = useCallback(() => {
        const w = canvasScroll.current;
        if (!w) return { x: 600, y: 400 };
        return { x: (w.scrollLeft + w.clientWidth / 2) / zoom, y: (w.scrollTop + w.clientHeight / 2) / zoom };
    }, [zoom]);

    const addEmployee = useCallback((emp: Employee) => {
        pushHistory();
        const { x, y } = centreOfScroll();
        const id = uid();
        setNodes(prev => [...prev, {
            id, kind: 'employee', empId: emp.id,
            x: snap(x - 130 + (Math.random() - 0.5) * 80),
            y: snap(y - 55 + (Math.random() - 0.5) * 60),
            overrideRestDays: getEmpRestDays(emp) || '',
            overrideAccommodation: getEmpHostel(emp) || '',
        }], false);
        setFlashId(id);
        setTimeout(() => setFlashId(null), 1400);
        setSelected(id);
        if (isMobile) setLeftOpen(false); // 手机添加后自动关闭抽屉
        setTimeout(() => {
            const w = canvasScroll.current;
            if (!w) return;
            w.scrollTo({ left: x * zoom - w.clientWidth / 2, top: y * zoom - w.clientHeight / 2, behavior: 'smooth' });
        }, 80);
    }, [setNodes, centreOfScroll, pushHistory, zoom, isMobile]);

    const addBox = useCallback((kind: 'dept' | 'role' | 'bonus') => {
        pushHistory();
        const { x, y } = centreOfScroll();
        const id = uid();
        const w = kind === 'dept' ? 280 : kind === 'bonus' ? 240 : 160;
        const h = kind === 'dept' ? 80 : kind === 'bonus' ? 60 : 38;
        setNodes(prev => [...prev, {
            id, kind,
            label: kind === 'dept' ? '新部门' : kind === 'bonus' ? '奖金池' : '职位名称',
            color: kind === 'bonus' ? '#F59E0B' : PALETTE[0],
            memberEmpIds: (kind === 'dept' || kind === 'bonus') ? [] : undefined,
            x: snap(x - w / 2), y: snap(y - h / 2),
            ...(kind === 'dept' ? { deptShowRoles: true, deptShowRestDays: false, deptShowAccommodation: false } : {}),
        }], false);
        setFlashId(id);
        setTimeout(() => setFlashId(null), 1400);
        setSelected(id);
        if (isMobile) setShowMobileMenu(false);
    }, [setNodes, centreOfScroll, pushHistory, isMobile]);

    const deleteSelected = useCallback(() => {
        if (!selected) return;
        pushHistory();
        setNodes(prev => prev.filter(n => n.id !== selected), false);
        setEdges(prev => prev.filter(e => e.from !== selected && e.to !== selected), false);
        setSelected(null);
        setShowPropSheet(false);
        setIsDirty(true);
    }, [selected, setNodes, setEdges, pushHistory]);

    const deleteEdge = useCallback((eid: string, ev: React.MouseEvent | React.TouchEvent) => {
        ev.stopPropagation();
        pushHistory();
        setEdges(prev => prev.filter(e => e.id !== eid), false);
    }, [setEdges, pushHistory]);

    // 选中节点后，手机自动弹出属性面板
    useEffect(() => {
        if (selected && isMobile) setShowPropSheet(true);
        if (!selected) setShowPropSheet(false);
    }, [selected, isMobile]);

    const handleAnchorClick = useCallback((ev: React.MouseEvent | React.TouchEvent, nodeId: string, anchor: Anchor) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (mode !== 'connect') return;
        if (!connectFrom) {
            setConnectFrom(nodeId);
            setConnectFromAnchor(anchor);
            return;
        }
        if (connectFrom === nodeId) { setConnectFrom(null); setConnectFromAnchor(null); return; }
        const fa = connectFromAnchor ?? 'bottom';
        setEdges(prev => {
            if (prev.find(e => (e.from === connectFrom && e.to === nodeId) || (e.from === nodeId && e.to === connectFrom)))
                return (setConnectFrom(null), setConnectFromAnchor(null), prev);
            pushHistory();
            return [...prev, { id: uid(), from: connectFrom, to: nodeId, color: lineColor, fromAnchor: fa, toAnchor: anchor }];
        }, false);
        setConnectFrom(null); setConnectFromAnchor(null);
    }, [mode, connectFrom, connectFromAnchor, lineColor, setEdges, pushHistory]);

    const handleNodeClick = useCallback((ev: React.MouseEvent | React.TouchEvent, nodeId: string) => {
        ev.stopPropagation();
        if (mode === 'connect') {
            if (!connectFrom) { setConnectFrom(nodeId); setConnectFromAnchor(null); return; }
            if (connectFrom === nodeId) { setConnectFrom(null); setConnectFromAnchor(null); return; }
            // 自动选最佳锚点
            const fn = nodes.find(n => n.id === connectFrom);
            const tn = nodes.find(n => n.id === nodeId);
            const fa = connectFromAnchor ?? (fn && tn ? bestAnchors(fn, tn, empMap).fa : 'bottom');
            const ta = fn && tn ? bestAnchors(fn, tn, empMap).ta : 'top';
            setEdges(prev => {
                if (prev.find(e => (e.from === connectFrom && e.to === nodeId) || (e.from === nodeId && e.to === connectFrom)))
                    return (setConnectFrom(null), setConnectFromAnchor(null), prev);
                pushHistory();
                return [...prev, { id: uid(), from: connectFrom, to: nodeId, color: lineColor, fromAnchor: fa, toAnchor: ta }];
            }, false);
            setConnectFrom(null); setConnectFromAnchor(null);
        } else {
            setSelected(p => p === nodeId ? null : nodeId);
        }
    }, [mode, connectFrom, connectFromAnchor, lineColor, setEdges, pushHistory, nodes, empMap]);

    // ── 统一的 pointer down (mouse + touch) ──
    const handleNodeDown = useCallback((clientX: number, clientY: number, nodeId: string) => {
        if (mode !== 'select') return;
        const n = nodes.find(x => x.id === nodeId);
        if (!n) return;
        dragRef.current = { nodeId, msx: clientX, msy: clientY, nsx: n.x, nsy: n.y, activated: false };
    }, [mode, nodes]);

    const handleResizeDown = useCallback((clientX: number, clientY: number, nodeId: string, dir: HandleDir) => {
        const n = nodes.find(x => x.id === nodeId);
        if (!n) return;
        pushHistory();
        resizeRef.current = {
            nodeId, dir,
            msx: clientX, msy: clientY,
            ox: n.x, oy: n.y,
            ow: nW(n), oh: nH(n, empMap),
        };
    }, [nodes, pushHistory, empMap]);

    const handlePointerMove = useCallback((clientX: number, clientY: number) => {
        if (mode === 'connect' && connectFrom) setMousePos(toCanvas(clientX, clientY));

        if (dragRef.current) {
            const d = dragRef.current;
            const dx = (clientX - d.msx) / zoom;
            const dy = (clientY - d.msy) / zoom;

            if (!d.activated) {
                const dist = Math.sqrt((clientX - d.msx) ** 2 + (clientY - d.msy) ** 2);
                if (dist < DRAG_THRESHOLD) return;
                d.activated = true;
                pushHistory();
            }

            let nx = Math.max(0, d.nsx + dx);
            let ny = Math.max(0, d.nsy + dy);
            if (snapEnabled) { nx = snap(nx); ny = snap(ny); }

            setNodes(prev => prev.map(n =>
                n.id === d.nodeId ? { ...n, x: nx, y: ny } : n
            ), false);
            return;
        }

        if (resizeRef.current) {
            const r = resizeRef.current;
            const dx = (clientX - r.msx) / zoom;
            const dy = (clientY - r.msy) / zoom;
            const MIN = 80;
            let nx = r.ox, ny = r.oy, nw = r.ow, nh = r.oh;

            if (r.dir.includes('e'))  nw = Math.max(MIN, r.ow + dx);
            if (r.dir.includes('s'))  nh = Math.max(MIN, r.oh + dy);
            if (r.dir.includes('w')) { nw = Math.max(MIN, r.ow - dx); if (nw > MIN) nx = r.ox + dx; }
            if (r.dir.includes('n')) { nh = Math.max(MIN, r.oh - dy); if (nh > MIN) ny = r.oy + dy; }

            if (snapEnabled) { nx = snap(nx); ny = snap(ny); nw = snap(nw); nh = snap(nh); }

            setNodes(prev => prev.map(n =>
                n.id === r.nodeId ? { ...n, x: nx, y: ny, cw: nw, ch: nh } : n
            ), false);
        }
    }, [mode, connectFrom, zoom, toCanvas, setNodes, pushHistory, snapEnabled]);

    // ── Mouse handlers ──
    const handleMouseMove = useCallback((ev: React.MouseEvent) => {
        handlePointerMove(ev.clientX, ev.clientY);
    }, [handlePointerMove]);

    const handleMouseUp = useCallback(() => {
        dragRef.current   = null;
        resizeRef.current = null;
    }, []);

    // ── Touch handlers for canvas ──
    const handleTouchMove = useCallback((ev: React.TouchEvent) => {
        if (ev.touches.length === 2) {
            // 双指缩放
            const dx = ev.touches[0].clientX - ev.touches[1].clientX;
            const dy = ev.touches[0].clientY - ev.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (pinchRef.current) {
                const scale = dist / pinchRef.current.dist;
                setZoom(Math.max(0.3, Math.min(2, +(pinchRef.current.zoom * scale).toFixed(2))));
            } else {
                pinchRef.current = { dist, zoom };
            }
            return;
        }
        if (ev.touches.length === 1) {
            handlePointerMove(ev.touches[0].clientX, ev.touches[0].clientY);
        }
    }, [handlePointerMove, zoom]);

    const handleTouchEnd = useCallback(() => {
        dragRef.current   = null;
        resizeRef.current = null;
        pinchRef.current  = null;
    }, []);

    const handleCanvasCk = useCallback(() => {
        if (mode === 'connect') { setConnectFrom(null); setConnectFromAnchor(null); return; }
        setSelected(null);
        setEditingField(null);
    }, [mode]);

    const syncHRData = useCallback(async (nodeId: string, empId: string) => {
        try {
            const allEmps = await DataManager.getEmployees();
            const emp = allEmps.find(e => e.id === empId);
            if (!emp) return;
            updateNode(nodeId, {
                overrideRestDays: getEmpRestDays(emp) || '',
                overrideAccommodation: getEmpHostel(emp) || '',
            });
        } catch {}
    }, [updateNode]);

    const addPage = useCallback(() => {
        const p = newPage(pages.length + 1);
        setPages(prev => [...prev, p]);
        setPageIdx(pages.length);
        setSelected(null); setConnectFrom(null); setConnectFromAnchor(null); setIsDirty(true);
    }, [pages.length]);

    const copyPage = useCallback(() => {
        const src = pages[pageIdx];
        const idMap: Record<string, string> = {};
        const newNodes = src.nodes.map(n => { const nid = uid(); idMap[n.id] = nid; return { ...n, id: nid }; });
        const newEdges = src.edges.filter(e => idMap[e.from] && idMap[e.to]).map(e => ({ ...e, id: uid(), from: idMap[e.from], to: idMap[e.to] }));
        const pg: Page = { id: uid(), name: `${src.name} (复制)`, nodes: newNodes, edges: newEdges };
        setPages(prev => [...prev, pg]);
        setPageIdx(pages.length);
        setSelected(null); setIsDirty(true);
    }, [pages, pageIdx]);

    const deletePage = useCallback(() => {
        if (pages.length <= 1) return;
        if (!window.confirm(`删除「${currentPage.name}」?`)) return;
        setPages(prev => prev.filter((_, i) => i !== pageIdx));
        setPageIdx(Math.max(0, pageIdx - 1));
        setIsDirty(true);
    }, [pages, pageIdx, currentPage]);

    const handleExport = useCallback(async () => {
        if (!exportIds.size) return;
        setIsExporting(true); setShowExport(false);
        setSelected(null); setConnectFrom(null); setConnectFromAnchor(null); setMode('select');
        const savedIdx = pageIdxRef.current;
        const originalZoom = zoom;
        setZoom(1);
        await new Promise(r => setTimeout(r, 300)); 

        try {
            // ── 预转换所有头像为 base64，解决跨域图片丢失 ──
            const imgElements = canvasEl.current?.querySelectorAll('img') ?? [];
            const originalSrcs = new Map<HTMLImageElement, string>();
            await Promise.all(Array.from(imgElements).map(async (img) => {
                if (!img.src || img.src.startsWith('data:')) return;
                try {
                    originalSrcs.set(img, img.src);
                    const resp = await fetch(img.src, { mode: 'cors' });
                    const blob = await resp.blob();
                    const dataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    img.src = dataUrl;
                } catch {
                    // 如果 fetch 失败，画一个占位色块
                    try {
                        const c = document.createElement('canvas');
                        c.width = 64; c.height = 64;
                        const ctx = c.getContext('2d')!;
                        ctx.fillStyle = '#E5E7EB';
                        ctx.fillRect(0, 0, 64, 64);
                        ctx.fillStyle = '#9CA3AF';
                        ctx.font = 'bold 24px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('?', 32, 32);
                        img.src = c.toDataURL();
                    } catch {}
                }
            }));
            await new Promise(r => setTimeout(r, 200));

            const pdf = new jsPDF('l', 'mm', 'a4');
            const toExport = pages.filter(p => exportIds.has(p.id));
            for (let i = 0; i < toExport.length; i++) {
                const pg   = toExport[i];
                const pIdx = pages.findIndex(p => p.id === pg.id);
                setPageIdx(pIdx);
                await new Promise(r => setTimeout(r, 900));
                if (!canvasEl.current) continue;
                const bb = bBox(pg.nodes, empMap);
                const canvas = await html2canvas(canvasEl.current, {
                    scale: 2.5, 
                    useCORS: true, 
                    allowTaint: true,
                    backgroundColor: '#F8F9FC', 
                    logging: false,
                    x: bb.x, y: bb.y, width: bb.w, height: bb.h,
                    windowWidth: CANVAS_W, 
                    windowHeight: CANVAS_H,
                    onclone: (clonedDoc) => {
                        // 确保克隆文档中所有图片可见
                        const imgs = clonedDoc.querySelectorAll('img');
                        imgs.forEach(img => { img.crossOrigin = 'anonymous'; });
                    }
                });
                if (i > 0) pdf.addPage();
                const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
                const ratio = Math.min((pw - 16) / canvas.width, (ph - 16) / canvas.height);
                const w = canvas.width * ratio, h = canvas.height * ratio;
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
                pdf.setFontSize(7); pdf.setTextColor(180); pdf.text(pg.name, 5, ph - 3);
            }
            pdf.save(`OrgChart_${new Date().toISOString().split('T')[0]}.pdf`);

            // ── 恢复原始图片 URL ──
            originalSrcs.forEach((src, img) => { img.src = src; });
        } catch (err) { console.error(err); alert('导出失败'); }
        setZoom(originalZoom);
        setPageIdx(savedIdx);
        setIsExporting(false);
    }, [exportIds, pages, zoom, empMap]);

    useEffect(() => {
        const h = (ev: KeyboardEvent) => {
            if (['INPUT','TEXTAREA'].includes((ev.target as HTMLElement)?.tagName)) return;
            if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) { deleteSelected(); return; }
            if (ev.key === 'Escape') { setSelected(null); setConnectFrom(null); setConnectFromAnchor(null); setMode('select'); setEditingField(null); setShowMobileMenu(false); return; }
            if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.shiftKey ? redo() : undo(); return; }
            if ((ev.ctrlKey || ev.metaKey) && ev.key === 'y') { redo(); return; }
            if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') { ev.preventDefault(); handleSave(); return; }
            if (ev.key === 'v' || ev.key === 'V') { setMode('select'); setConnectFrom(null); setConnectFromAnchor(null); return; }
            if (ev.key === 'c' && !ev.ctrlKey && !ev.metaKey) { setMode('connect'); setSelected(null); return; }
            if (ev.key === 'g' || ev.key === 'G') { setSnapEnabled(p => !p); return; }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [deleteSelected, undo, redo, handleSave, selected]);

    useEffect(() => {
        const el = canvasScroll.current;
        if (!el) return;
        const h = (ev: WheelEvent) => {
            if (!ev.ctrlKey && !ev.metaKey) return;
            ev.preventDefault();
            setZoom(z => {
                const nz = Math.max(0.3, Math.min(2, z - ev.deltaY * 0.002));
                return +nz.toFixed(2);
            });
        };
        el.addEventListener('wheel', h, { passive: false });
        return () => el.removeEventListener('wheel', h);
    }, []);

    const selectedNode = nodes.find(n => n.id === selected);

    // ── Resize Handles ──
    const ResizeHandles = ({ node }: { node: ONode }) => {
        const w = nW(node), h = nH(node, empMap);
        const sz = isMobile ? 18 : 12;
        const off = isMobile ? -9 : -6;
        const handles: { dir: HandleDir; x: number; y: number; cursor: string }[] = [
            { dir: 'se', x: w + off, y: h + off, cursor: 'se-resize' },
            { dir: 'sw', x: off,     y: h + off, cursor: 'sw-resize' },
            { dir: 'ne', x: w + off, y: off,     cursor: 'ne-resize' },
            { dir: 'nw', x: off,     y: off,     cursor: 'nw-resize' },
        ];
        if (!isMobile) {
            handles.push(
                { dir: 'e',  x: w - 5, y: h/2-5, cursor: 'e-resize' },
                { dir: 'w',  x: -5,   y: h/2-5, cursor: 'w-resize' },
                { dir: 's',  x: w/2-5, y: h-5,  cursor: 's-resize' },
                { dir: 'n',  x: w/2-5, y: -5,   cursor: 'n-resize' },
            );
        }
        return (
            <>
                {handles.map(hd => (
                    <div key={hd.dir}
                        style={{
                            position: 'absolute', left: hd.x, top: hd.y,
                            width: sz, height: sz,
                            backgroundColor: 'white',
                            border: '2.5px solid #6366F1',
                            borderRadius: 4,
                            cursor: hd.cursor,
                            zIndex: 30,
                            touchAction: 'none',
                        }}
                        onMouseDown={ev => { ev.stopPropagation(); ev.preventDefault(); handleResizeDown(ev.clientX, ev.clientY, node.id, hd.dir); }}
                        onTouchStart={ev => { ev.stopPropagation(); const t = ev.touches[0]; handleResizeDown(t.clientX, t.clientY, node.id, hd.dir); }}
                    />
                ))}
            </>
        );
    };

    // ── Inline Edit ──
    const InlineEdit = ({ nodeId, field, value, placeholder, icon }: {
        nodeId: string; field: 'restDays' | 'accommodation' | 'bonusPool'; value: string; placeholder: string; icon: string;
    }) => {
        const isEditing = editingField?.nodeId === nodeId && editingField?.field === field;
        const propKey: keyof ONode = field === 'restDays' ? 'overrideRestDays' : field === 'bonusPool' ? 'overrideBonusPool' : 'overrideAccommodation';

        if (isEditing) {
            return (
                <div className="px-3 pb-1 flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                    <span className="text-[12px] shrink-0">{icon}</span>
                    <input
                        autoFocus
                        className="flex-1 text-[11px] font-bold text-gray-700 bg-yellow-50 border border-yellow-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-400 min-w-0"
                        defaultValue={value === 'N/A' ? '' : value}
                        placeholder={placeholder}
                        onBlur={ev => { updateNode(nodeId, { [propKey]: ev.target.value } as Partial<ONode>); setEditingField(null); }}
                        onKeyDown={ev => {
                            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                            if (ev.key === 'Escape') setEditingField(null);
                        }}
                    />
                </div>
            );
        }
        return (
            <div
                className="px-3 pb-1.5 flex items-center gap-1.5 shrink-0 cursor-pointer group/edit hover:bg-gray-50 rounded mx-1.5"
                onClick={e => { e.stopPropagation(); setEditingField({ nodeId, field }); }}
                onMouseDown={e => e.stopPropagation()}
                title="点击编辑">
                <span className="text-[12px] shrink-0">{icon}</span>
                <span className="text-[11px] text-gray-600 font-bold truncate flex-1">{value}</span>
                <Edit3 size={10} className="text-gray-200 group-hover/edit:text-indigo-400 shrink-0" />
            </div>
        );
    };

    // ══════════ RENDER ══════════
    return (
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-0 md:p-3 backdrop-blur-sm">
            <div className="bg-[#F8F9FC] w-full h-full md:max-w-7xl md:h-[95vh] md:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
                 style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif' }}>

                {/* ══════ HEADER ══════ */}
                <div className="bg-[#1A1A2E] px-3 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] flex items-center gap-2 text-white shrink-0 border-b border-[#2D2D44] z-20">
                    {/* 左：标题 */}
                    <div className="flex items-center gap-1.5 mr-auto min-w-0">
                        <Layers size={14} className="text-amber-400 shrink-0" />
                        <span className="font-bold text-[13px] text-white truncate">组织架构</span>
                    </div>

                    {/* 桌面端：完整工具 */}
                    {!isMobile && (
                        <>
                            <div className="flex gap-0.5 bg-white/8 p-0.5 rounded-lg">
                                <TBtn active={view === 'canvas'} onClick={() => setView('canvas')} title="画布"><Layers size={13} /></TBtn>
                                <TBtn active={view === 'analytics'} onClick={() => setView('analytics')} title="分析"><BarChart2 size={13} /></TBtn>
                            </div>

                            <div className="w-px h-5 bg-white/10" />

                            <button onClick={undo} title="撤销" className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"><RotateCcw size={13} /></button>
                            <button onClick={redo} title="重做" className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"><RotateCw size={13} /></button>

                            <div className="w-px h-5 bg-white/10" />

                            <div className="flex gap-0.5 bg-white/8 p-0.5 rounded-lg">
                                <TBtn active={mode === 'select'} onClick={() => { setMode('select'); setConnectFrom(null); setConnectFromAnchor(null); }} title="选择 (V)"><MousePointer2 size={13} /></TBtn>
                                <TBtn active={mode === 'connect'} onClick={() => { setMode('connect'); setSelected(null); }} title="连线 (C)"><GitMerge size={13} /></TBtn>
                            </div>

                            {mode === 'connect' && (
                                <div className="flex items-center gap-0.5 bg-white/8 px-1.5 py-1 rounded-lg">
                                    {PALETTE.map(c => (
                                        <button key={c} onClick={() => setLineColor(c)}
                                            className={`w-4 h-4 rounded-full border-2 transition-transform ${lineColor === c ? 'border-white scale-125' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }} />
                                    ))}
                                </div>
                            )}

                            <div className="w-px h-5 bg-white/10" />

                            <button onClick={() => addBox('dept')}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0">
                                <Square size={11} /> 部门
                            </button>
                            <button onClick={() => addBox('role')}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0">
                                <Type size={11} /> 职位
                            </button>
                            <button onClick={() => addBox('bonus')}
                                className="bg-amber-500 hover:bg-amber-400 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0">
                                <DollarSign size={11} /> 奖金池
                            </button>

                            {selected && (
                                <button onClick={deleteSelected}
                                    className="bg-red-500/80 hover:bg-red-500 text-white px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0">
                                    <Trash2 size={11} /> 删除
                                </button>
                            )}

                            <div className="w-px h-5 bg-white/10" />

                            <button onClick={() => setSnapEnabled(p => !p)} title="网格吸附 (G)"
                                className={`p-1.5 rounded-lg transition-all ${snapEnabled ? 'bg-amber-400 text-black' : 'text-white/30 hover:text-white hover:bg-white/10'}`}>
                                <Grid size={13} />
                            </button>

                            <div className="flex items-center gap-0.5 bg-white/8 rounded-lg p-0.5">
                                <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))} className="p-1 text-white/60 hover:text-white rounded"><ZoomOut size={12} /></button>
                                <span className="text-[10px] font-bold text-white/50 w-8 text-center">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))} className="p-1 text-white/60 hover:text-white rounded"><ZoomIn size={12} /></button>
                                <button onClick={() => setZoom(1)} className="p-1 text-white/30 hover:text-white rounded text-[8px] font-bold">1:1</button>
                            </div>

                            <div className="w-px h-5 bg-white/10" />

                            <button onClick={() => { setShowExport(true); setExportIds(new Set([currentPage.id])); }}
                                disabled={isExporting}
                                className="bg-white/8 hover:bg-white/15 text-white px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-50">
                                {isExporting ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />} 导出
                            </button>

                            <button onClick={handleSave} disabled={saving}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-all ${isDirty ? 'bg-amber-400 text-black' : 'bg-white/8 text-white/40'}`}>
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                {saving ? '…' : isDirty ? '保存*' : '已存'}
                            </button>
                        </>
                    )}

                    {/* 移动端：精简按钮 */}
                    {isMobile && (
                        <>
                            <div className="flex gap-0.5 bg-white/8 p-0.5 rounded-lg">
                                <TBtn active={view === 'canvas'} onClick={() => setView('canvas')} title="画布"><Layers size={14} /></TBtn>
                                <TBtn active={view === 'analytics'} onClick={() => setView('analytics')} title="分析"><BarChart2 size={14} /></TBtn>
                            </div>

                            <button onClick={handleSave} disabled={saving}
                                className={`p-2 rounded-lg transition-all ${isDirty ? 'bg-amber-400 text-black' : 'text-white/40'}`}>
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            </button>

                            <button onClick={() => setShowMobileMenu(p => !p)}
                                className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg">
                                <Menu size={16} />
                            </button>
                        </>
                    )}

                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full shrink-0"><X size={14} /></button>
                </div>

                {/* ══════ 移动端菜单弹出层 ══════ */}
                {isMobile && showMobileMenu && (
                    <div className="absolute top-12 right-2 z-50 bg-[#1A1A2E] border border-[#2D2D44] rounded-xl shadow-2xl p-3 w-56 animate-in slide-in-from-top-2 fade-in duration-150"
                        style={{ marginTop: 'env(safe-area-inset-top, 0)' }}>
                        <div className="space-y-1.5">
                            <MMenuItem icon={<MousePointer2 size={14} />} label="选择模式" active={mode === 'select'}
                                onClick={() => { setMode('select'); setConnectFrom(null); setConnectFromAnchor(null); setShowMobileMenu(false); }} />
                            <MMenuItem icon={<GitMerge size={14} />} label="连线模式" active={mode === 'connect'}
                                onClick={() => { setMode('connect'); setSelected(null); setShowMobileMenu(false); }} />

                            <div className="h-px bg-white/10 my-1" />

                            <MMenuItem icon={<Square size={14} />} label="添加部门" onClick={() => addBox('dept')} />
                            <MMenuItem icon={<Type size={14} />} label="添加职位" onClick={() => addBox('role')} />
                            <MMenuItem icon={<DollarSign size={14} />} label="添加奖金池" onClick={() => addBox('bonus')} />
                            <MMenuItem icon={<User size={14} />} label="员工列表" onClick={() => { setLeftOpen(true); setShowMobileMenu(false); }} />

                            <div className="h-px bg-white/10 my-1" />

                            <MMenuItem icon={<RotateCcw size={14} />} label="撤销" onClick={() => { undo(); setShowMobileMenu(false); }} />
                            <MMenuItem icon={<RotateCw size={14} />} label="重做" onClick={() => { redo(); setShowMobileMenu(false); }} />
                            <MMenuItem icon={<Grid size={14} />} label={`网格吸附 ${snapEnabled ? '✓' : ''}`} active={snapEnabled}
                                onClick={() => setSnapEnabled(p => !p)} />

                            {selected && (
                                <>
                                    <div className="h-px bg-white/10 my-1" />
                                    <MMenuItem icon={<Trash2 size={14} />} label="删除选中" className="text-red-400"
                                        onClick={() => { deleteSelected(); setShowMobileMenu(false); }} />
                                </>
                            )}

                            <div className="h-px bg-white/10 my-1" />

                            <MMenuItem icon={<FileDown size={14} />} label="导出 PDF"
                                onClick={() => { setShowExport(true); setExportIds(new Set([currentPage.id])); setShowMobileMenu(false); }} />

                            {mode === 'connect' && (
                                <>
                                    <div className="h-px bg-white/10 my-1" />
                                    <p className="text-[9px] text-white/30 font-bold px-1">线条颜色</p>
                                    <div className="flex gap-1.5 px-1 py-1">
                                        {PALETTE.map(c => (
                                            <button key={c} onClick={() => setLineColor(c)}
                                                className={`w-6 h-6 rounded-full border-2 ${lineColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
                {isMobile && showMobileMenu && (
                    <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)} />
                )}

                <div className="flex flex-1 overflow-hidden relative">

                    {view === 'analytics' && <AnalyticsPanel employees={employees} />}

                    {view === 'canvas' && (<>

                    {/* ══════ 左侧员工列表（桌面=侧边栏，手机=覆盖抽屉） ══════ */}
                    {!isMobile && (
                        <div className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200 z-20 ${leftOpen ? 'w-52' : 'w-9'}`}>
                            <button onClick={() => setLeftOpen(p => !p)}
                                className="flex items-center justify-between px-2.5 py-2.5 border-b border-gray-100 hover:bg-gray-50 text-[10px] font-bold text-gray-400 shrink-0">
                                {leftOpen && <span className="flex items-center gap-1"><User size={11} /> 员工列表</span>}
                                {leftOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                            </button>
                            {leftOpen && <EmpList employees={filteredEmps} empSearch={empSearch} setEmpSearch={setEmpSearch} empIdsOnCanvas={empIdsOnCanvas} addEmployee={addEmployee} onRefresh={() => DataManager.getEmployees().then(d => setEmployees(d.filter(e => !e.isArchived)))} />}
                        </div>
                    )}

                    {/* 手机端：覆盖式抽屉 */}
                    {isMobile && leftOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setLeftOpen(false)} />
                            <div className="absolute left-0 top-0 bottom-0 w-[72vw] max-w-[300px] bg-white z-40 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
                                <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
                                    <span className="text-[12px] font-bold text-gray-600 flex items-center gap-1.5"><User size={12} /> 员工列表</span>
                                    <button onClick={() => setLeftOpen(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                                </div>
                                <EmpList employees={filteredEmps} empSearch={empSearch} setEmpSearch={setEmpSearch} empIdsOnCanvas={empIdsOnCanvas} addEmployee={addEmployee} onRefresh={() => DataManager.getEmployees().then(d => setEmployees(d.filter(e => !e.isArchived)))} />
                            </div>
                        </>
                    )}

                    {/* ══════ 画布区域 ══════ */}
                    <div className="flex-1 flex flex-col overflow-hidden">

                        {mode === 'connect' && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                                <div className="bg-indigo-600 text-white text-[11px] font-semibold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                                    <GitMerge size={11} />
                                    {connectFrom ? '点第二个节点完成连线' : '点选第一个节点'}
                                </div>
                            </div>
                        )}

                        <div ref={canvasScroll}
                            className="flex-1 overflow-auto relative"
                            style={{
                                background: '#F8F9FC',
                                backgroundImage: 'radial-gradient(circle,#d1d5db 0.8px,transparent 0.8px)',
                                backgroundSize: `${SNAP_SIZE}px ${SNAP_SIZE}px`,
                                touchAction: 'pan-x pan-y', // 允许原生滚动，双指由 JS 接管
                            }}>

                            <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative' }}>
                                <div ref={canvasEl}
                                    style={{
                                        width: CANVAS_W, height: CANVAS_H,
                                        position: 'absolute', top: 0, left: 0,
                                        transformOrigin: 'top left',
                                        transform: `scale(${zoom})`,
                                        userSelect: 'none',
                                    }}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleTouchEnd}
                                    onTouchCancel={handleTouchEnd}
                                    onClick={handleCanvasCk}>

                                    {/* SVG 连线层 */}
                                    <svg style={{ position: 'absolute', inset: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: 'none', overflow: 'visible' }}>
                                        <defs>
                                            {PALETTE.map(c => (
                                                <marker key={c} id={`arr5-${c.replace('#','')}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                                                    <path d="M0,0 L7,3.5 L0,7 Z" fill={c} />
                                                </marker>
                                            ))}
                                        </defs>
                                        {edges.map(edge => {
                                            const fn = nodes.find(n => n.id === edge.from);
                                            const tn = nodes.find(n => n.id === edge.to);
                                            if (!fn || !tn) return null;
                                            // 使用存储的锚点或自动计算最佳锚点
                                            const { fa, ta } = edge.fromAnchor && edge.toAnchor
                                                ? { fa: edge.fromAnchor, ta: edge.toAnchor }
                                                : bestAnchors(fn, tn, empMap);
                                            const p1 = anchorPos(fn, fa, empMap);
                                            const p2 = anchorPos(tn, ta, empMap);
                                            const pathD = orthoPath(p1, fa, p2, ta);
                                            // 删除按钮放在路径中点
                                            const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                                            return (
                                                <g key={edge.id} style={{ pointerEvents: 'all' }}>
                                                    <path d={pathD} stroke="transparent" strokeWidth={isMobile ? 28 : 16}
                                                        fill="none" style={{ cursor: 'pointer' }}
                                                        onClick={ev => deleteEdge(edge.id, ev)} />
                                                    <path d={pathD} stroke={edge.color} strokeWidth={2.5}
                                                        fill="none" strokeLinejoin="round"
                                                        markerEnd={`url(#arr5-${edge.color.replace('#','')})`}
                                                        style={{ pointerEvents: 'none' }} />
                                                    {/* 起点/终点锚点圆 — 导出时隐藏 */}
                                                    {!isExporting && (
                                                        <>
                                                            <circle cx={p1.x} cy={p1.y} r={4} fill={edge.color} opacity={0.5} style={{ pointerEvents: 'none' }} />
                                                            <circle cx={p2.x} cy={p2.y} r={4} fill={edge.color} opacity={0.5} style={{ pointerEvents: 'none' }} />
                                                        </>
                                                    )}
                                                    {/* 删除按钮 — 导出时隐藏 */}
                                                    {!isExporting && (
                                                        <g style={{ cursor: 'pointer' }} onClick={ev => deleteEdge(edge.id, ev)}>
                                                            <circle cx={mx} cy={my} r={isMobile ? 11 : 8} fill="white" stroke={edge.color} strokeWidth={1.5} />
                                                            <text x={mx} y={my + (isMobile ? 4.5 : 3.5)} textAnchor="middle" fontSize={isMobile ? '13' : '10'} fontWeight="bold" fill={edge.color}>×</text>
                                                        </g>
                                                    )}
                                                </g>
                                            );
                                        })}
                                        {/* 连线模式预览线 — 导出时隐藏 */}
                                        {!isExporting && mode === 'connect' && connectFrom && (() => {
                                            const fn = nodes.find(n => n.id === connectFrom);
                                            if (!fn) return null;
                                            const fa = connectFromAnchor ?? 'bottom';
                                            const p1 = anchorPos(fn, fa, empMap);
                                            return <line x1={p1.x} y1={p1.y} x2={mousePos.x} y2={mousePos.y}
                                                stroke={lineColor} strokeWidth={2} strokeDasharray="6 4" opacity={0.7}
                                                style={{ pointerEvents: 'none' }} />;
                                        })()}
                                    </svg>

                                    {/* ── 节点渲染 ── */}
                                    {nodes.map(node => {
                                        const w = nW(node), h = nH(node, empMap);
                                        const isSel   = selected    === node.id;
                                        const isConn  = connectFrom === node.id;
                                        const isFlash = flashId     === node.id;
                                        const shadow  = isExporting
                                            ? '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'
                                            : isSel
                                            ? '0 0 0 3px #6366F1, 0 8px 28px rgba(99,102,241,0.25)'
                                            : isConn
                                            ? `0 0 0 3px ${lineColor}`
                                            : isFlash
                                            ? '0 0 0 3px #6366F1, 0 6px 24px rgba(99,102,241,0.4)'
                                            : '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)';

                                        return (
                                            <div key={node.id}
                                                style={{
                                                    position: 'absolute', left: node.x, top: node.y,
                                                    width: w, minHeight: h,
                                                    cursor: mode === 'select' ? 'grab' : 'pointer',
                                                    zIndex: isSel || isConn ? 20 : 10,
                                                    boxShadow: shadow,
                                                    borderRadius: node.kind === 'role' ? 10 : 14,
                                                    transition: 'box-shadow 0.15s',
                                                    touchAction: 'none', // 阻止节点区域的原生滚动
                                                }}
                                                onClick={e => handleNodeClick(e, node.id)}
                                                onMouseDown={e => { e.stopPropagation(); e.preventDefault(); handleNodeDown(e.clientX, e.clientY, node.id); }}
                                                onTouchStart={e => {
                                                    if (e.touches.length !== 1) return;
                                                    e.stopPropagation();
                                                    const t = e.touches[0];
                                                    handleNodeDown(t.clientX, t.clientY, node.id);
                                                    // 长按等同点击选中
                                                    if (mode === 'connect') handleNodeClick(e, node.id);
                                                }}>

                                                {/* ─ DEPT ─ */}
                                                {node.kind === 'dept' && (
                                                    <div className="rounded-[14px] overflow-hidden border border-gray-200/80 bg-white h-full flex flex-col">
                                                        <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ backgroundColor: node.color ?? '#6366F1' }}>
                                                            <span className="font-bold text-[14px] text-white break-words leading-snug">{node.label}</span>
                                                            <div className="flex items-center gap-1 shrink-0 ml-1">
                                                                <span className="text-[11px] text-white/80 font-semibold">{node.memberEmpIds?.length ?? 0}</span>
                                                                <Users size={13} className="text-white/80" />
                                                                <button
                                                                    className="text-white/60 hover:text-white p-0.5"
                                                                    onMouseDown={e => e.stopPropagation()}
                                                                    onTouchStart={e => e.stopPropagation()}
                                                                    onClick={e => { e.stopPropagation(); updateNode(node.id, { collapsed: !node.collapsed }); }}>
                                                                    {node.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {!node.collapsed && (
                                                            <>
                                                                <div className="h-px shrink-0" style={{ backgroundColor: `${node.color ?? '#6366F1'}20` }} />
                                                                <div className="px-3 py-2 space-y-2 overflow-hidden flex-1">
                                                                    {!(node.memberEmpIds?.length) && (
                                                                        <p className="text-[10px] text-gray-300 italic font-semibold text-center py-2">选中后右侧添加员工</p>
                                                                    )}
                                                                    {(node.memberEmpIds ?? []).map(eid => {
                                                                        const e = empMap[eid];
                                                                        const secRoles = getEmpSecondaryRoles(e);
                                                                        return (
                                                                            <div key={eid} className="flex flex-col gap-1 pb-1.5 border-b border-gray-50 last:border-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[12px] font-bold text-gray-500 border border-gray-200">
                                                                                        {e?.avatar ? <img src={e.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt="" /> : (e?.name.charAt(0) ?? '?')}
                                                                                    </div>
                                                                                    <span className="text-[14px] font-semibold text-gray-700 flex-1 break-words whitespace-normal leading-snug">{e?.name ?? eid}</span>
                                                                                    {node.deptShowRoles && e && (
                                                                                        <span className="text-[11px] font-semibold text-indigo-400 shrink-0 whitespace-nowrap">{getEmpRole(e)}</span>
                                                                                    )}
                                                                                    <button className="text-gray-200 hover:text-red-400 text-[16px] leading-none shrink-0 px-1"
                                                                                        onMouseDown={ev => ev.stopPropagation()}
                                                                                        onTouchStart={ev => ev.stopPropagation()}
                                                                                        onClick={ev => { ev.stopPropagation(); updateNode(node.id, { memberEmpIds: (node.memberEmpIds ?? []).filter(i => i !== eid) }); }}>
                                                                                        ×
                                                                                    </button>
                                                                                </div>
                                                                                {node.deptShowRoles && secRoles.length > 0 && (
                                                                                    <div className="flex flex-wrap gap-1 pl-10">
                                                                                        {secRoles.map(sr => (
                                                                                            <span key={sr} className="text-[9px] font-bold bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">{sr.split('(')[0].trim()}</span>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                                {node.deptShowRestDays && (
                                                                                    <div className="flex items-center gap-1.5 pl-10">
                                                                                        <span className="text-[10px] text-gray-300">🌙</span>
                                                                                        <span className="text-[10px] text-gray-500 font-semibold truncate">{getEmpRestDays(e) || 'N/A'}</span>
                                                                                    </div>
                                                                                )}
                                                                                {node.deptShowAccommodation && (
                                                                                    <div className="flex items-center gap-1.5 pl-10">
                                                                                        <span className="text-[10px] text-gray-300">🏠</span>
                                                                                        <span className="text-[10px] text-gray-500 font-semibold truncate">{getEmpHostel(e) || 'N/A'}</span>
                                                                                    </div>
                                                                                )}
                                                                                {node.deptShowBonusPool && (
                                                                                    <div className="flex items-center gap-1.5 pl-10">
                                                                                        <span className="text-[10px] text-gray-300">💰</span>
                                                                                        <span className="text-[10px] text-amber-600 font-semibold truncate italic">{''}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ─ EMPLOYEE ─ */}
                                                {node.kind === 'employee' && (() => {
                                                    const emp = empMap[node.empId!];
                                                    if (!emp) return (
                                                        <div className="bg-white rounded-[14px] border border-dashed border-gray-200 flex items-center justify-center p-3 h-full">
                                                            <span className="text-[12px] text-gray-300 font-semibold">员工已移除</span>
                                                        </div>
                                                    );
                                                    return (
                                                        <div className="bg-white rounded-[14px] border border-gray-200/80 overflow-hidden h-full flex flex-col">
                                                            <div className="flex items-center gap-3 px-3 pt-3 pb-2 shrink-0">
                                                                <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[20px] font-bold text-gray-500 border-2 border-gray-200">
                                                                    {emp.avatar ? <img src={emp.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt={emp.name} /> : emp.name.charAt(0)}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-[18px] font-bold text-[#1A1A2E] leading-tight break-words">{emp.name}</div>
                                                                    <div className="text-[13px] text-gray-400 font-medium mt-0.5 break-words">{getEmpRole(emp)}</div>
                                                                    {getEmpSecondaryRoles(emp).length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                                            {getEmpSecondaryRoles(emp).map(sr => (
                                                                                <span key={sr} className="text-[9px] font-bold bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">{sr.split('(')[0].trim()}</span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {emp.rank && emp.rank !== 'CREW' && (
                                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded mt-1.5 inline-block uppercase ${emp.rank === 'TOP' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                            {emp.rank}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {(node.selectedRoles?.length ?? 0) > 0 && (
                                                                <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
                                                                    {node.selectedRoles!.map(r => (
                                                                        <span key={r} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">{r}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {node.showRestDays && (
                                                                <InlineEdit nodeId={node.id} field="restDays" value={effectiveRestDays(node, emp)} placeholder="如: 4 天/月" icon="🌙" />
                                                            )}
                                                            {node.showAccommodation && (
                                                                <InlineEdit nodeId={node.id} field="accommodation" value={effectiveHostel(node, emp)} placeholder="有/无宿舍" icon="🏠" />
                                                            )}
                                                            {node.showBonusPool && (
                                                                <InlineEdit nodeId={node.id} field="bonusPool" value={node.overrideBonusPool || ''} placeholder="奖金池（留空）" icon="💰" />
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* ─ ROLE ─ */}
                                                {node.kind === 'role' && (
                                                    <div className="h-full flex items-center justify-center rounded-[10px] border-2 font-semibold text-[14px] px-4"
                                                        style={{ borderColor: node.color ?? '#6366F1', color: node.color ?? '#6366F1', backgroundColor: `${node.color ?? '#6366F1'}0C` }}>
                                                        <span className="break-words text-center">{node.label}</span>
                                                    </div>
                                                )}

                                                {/* ─ BONUS POOL ─ */}
                                                {node.kind === 'bonus' && (
                                                    <div className="rounded-[14px] overflow-hidden border-2 border-amber-300 bg-white h-full flex flex-col">
                                                        <div className="flex items-center justify-between px-3 py-2 shrink-0 bg-gradient-to-r from-amber-400 to-amber-500">
                                                            <span className="font-bold text-[13px] text-white flex items-center gap-1.5">💰 {node.label}</span>
                                                            <span className="text-[11px] text-white/80 font-semibold">{node.memberEmpIds?.length ?? 0} 人</span>
                                                        </div>
                                                        <div className="px-2 py-1.5 space-y-1 overflow-hidden flex-1">
                                                            {!(node.memberEmpIds?.length) && (
                                                                <p className="text-[10px] text-gray-300 italic font-semibold text-center py-2">选中 → 右侧添加员工</p>
                                                            )}
                                                            {(node.memberEmpIds ?? []).map(eid => {
                                                                const e = empMap[eid];
                                                                const amt = node.bonusAmounts?.[eid] ?? '';
                                                                return (
                                                                    <div key={eid} className="flex items-center gap-1.5 py-1 border-b border-gray-50 last:border-0">
                                                                        <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold text-gray-500 border border-gray-200">
                                                                            {e?.avatar ? <img src={e.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt="" /> : (e?.name?.charAt(0) ?? '?')}
                                                                        </div>
                                                                        <span className="text-[12px] font-semibold text-gray-700 flex-1 min-w-0 break-words whitespace-normal">{e?.name ?? eid}</span>
                                                                        <input
                                                                            className="w-20 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-right focus:outline-none focus:border-amber-400 shrink-0 placeholder:text-amber-300"
                                                                            placeholder="RM"
                                                                            value={amt}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            onTouchStart={e => e.stopPropagation()}
                                                                            onChange={ev => {
                                                                                const newAmounts = { ...(node.bonusAmounts ?? {}), [eid]: ev.target.value };
                                                                                updateNode(node.id, { bonusAmounts: newAmounts });
                                                                            }}
                                                                        />
                                                                        <button className="text-gray-200 hover:text-red-400 text-[14px] leading-none shrink-0 px-0.5"
                                                                            onMouseDown={ev => ev.stopPropagation()}
                                                                            onTouchStart={ev => ev.stopPropagation()}
                                                                            onClick={ev => { ev.stopPropagation(); updateNode(node.id, { memberEmpIds: (node.memberEmpIds ?? []).filter(i => i !== eid) }); }}>
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {/* 总计行 */}
                                                        {(node.memberEmpIds?.length ?? 0) > 0 && (
                                                            <div className="px-3 py-1.5 border-t border-amber-200 bg-amber-50/50 flex items-center justify-between shrink-0">
                                                                <span className="text-[10px] font-bold text-amber-600">合计</span>
                                                                <span className="text-[12px] font-black text-amber-700">
                                                                    RM {((node.memberEmpIds ?? []).reduce((sum, eid) => sum + (parseFloat(node.bonusAmounts?.[eid] ?? '0') || 0), 0)).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {!isExporting && isSel && mode === 'select' && <ResizeHandles node={node} />}

                                                {/* 连线模式：显示4个锚点 */}
                                                {!isExporting && mode === 'connect' && (() => {
                                                    const nw = nW(node), nh = nH(node, empMap);
                                                    const sz = isMobile ? 16 : 12;
                                                    const anchors: { a: Anchor; x: number; y: number }[] = [
                                                        { a: 'top',    x: nw / 2 - sz / 2, y: -sz / 2 },
                                                        { a: 'bottom', x: nw / 2 - sz / 2, y: nh - sz / 2 },
                                                        { a: 'left',   x: -sz / 2,         y: nh / 2 - sz / 2 },
                                                        { a: 'right',  x: nw - sz / 2,     y: nh / 2 - sz / 2 },
                                                    ];
                                                    return anchors.map(({ a, x, y }) => (
                                                        <div key={a}
                                                            style={{
                                                                position: 'absolute', left: x, top: y,
                                                                width: sz, height: sz,
                                                                borderRadius: '50%',
                                                                backgroundColor: (connectFrom === node.id && connectFromAnchor === a) ? lineColor : 'white',
                                                                border: `2.5px solid ${lineColor}`,
                                                                cursor: 'crosshair',
                                                                zIndex: 35,
                                                                touchAction: 'none',
                                                                transition: 'transform 0.1s',
                                                            }}
                                                            className="hover:scale-150"
                                                            onMouseDown={e => e.stopPropagation()}
                                                            onTouchStart={e => e.stopPropagation()}
                                                            onClick={e => handleAnchorClick(e, node.id, a)}
                                                        />
                                                    ));
                                                })()}
                                            </div>
                                        );
                                    })}

                                    {!nodes.length && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="bg-white/90 rounded-2xl px-8 py-6 text-center border border-gray-200 shadow-sm max-w-[280px]">
                                                <p className="text-3xl mb-3">🗂️</p>
                                                <p className="text-sm font-semibold text-gray-500">
                                                    {isMobile ? '点右上角菜单添加部门/职位' : '从左侧添加员工，或点击顶栏「部门/职位」'}
                                                </p>
                                                {!isMobile && <p className="text-xs text-gray-300 font-medium mt-2">V=选择 C=连线 G=吸附 Del=删除 Ctrl+Z=撤销</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── 底部页面栏 ── */}
                        <div className="bg-[#1A1A2E] px-3 py-1.5 flex items-center gap-1 shrink-0 overflow-x-auto border-t border-[#2D2D44]"
                            style={{ paddingBottom: isMobile ? 'max(0.375rem, env(safe-area-inset-bottom))' : '0.375rem' }}>
                            
                            {/* 手机端：员工列表快捷按钮 */}
                            {isMobile && (
                                <button onClick={() => setLeftOpen(true)}
                                    className="bg-indigo-600 text-white p-1.5 rounded-lg mr-1 shrink-0">
                                    <Users size={13} />
                                </button>
                            )}

                            {pages.map((pg, i) => (
                                renamingPg === pg.id
                                    ? <input key={pg.id} autoFocus
                                        className="text-[10px] font-bold bg-amber-400 text-black rounded px-2 py-0.5 w-24 focus:outline-none shrink-0"
                                        defaultValue={pg.name}
                                        onBlur={ev => {
                                            setPages(prev => prev.map((p, j) => j === i ? { ...p, name: ev.target.value || pg.name } : p));
                                            setRenamingPg(null); setIsDirty(true);
                                        }}
                                        onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); if (ev.key === 'Escape') setRenamingPg(null); }} />
                                    : <button key={pg.id}
                                        onClick={() => { setPageIdx(i); setSelected(null); setConnectFrom(null); setConnectFromAnchor(null); }}
                                        onDoubleClick={() => setRenamingPg(pg.id)}
                                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all truncate max-w-[120px] shrink-0 ${i === pageIdx ? 'bg-white/15 text-white' : 'text-white/30 hover:bg-white/10 hover:text-white/60'}`}>
                                        {pg.name}
                                    </button>
                            ))}
                            <button onClick={addPage}  title="新建" className="text-white/30 hover:text-white p-1 rounded"><Plus size={12} /></button>
                            <button onClick={copyPage} title="复制" className="text-white/30 hover:text-white p-1 rounded"><Copy size={12} /></button>
                            {pages.length > 1 && (
                                <button onClick={deletePage} title="删除" className="text-white/20 hover:text-red-400 p-1 rounded"><Trash2 size={11} /></button>
                            )}

                            {/* 缩放快捷（手机端） */}
                            {isMobile && (
                                <div className="flex items-center gap-0.5 ml-auto bg-white/8 rounded-lg p-0.5 shrink-0">
                                    <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.15).toFixed(2)))} className="p-1 text-white/50 rounded"><ZoomOut size={12} /></button>
                                    <span className="text-[9px] font-bold text-white/40 w-7 text-center">{Math.round(zoom * 100)}%</span>
                                    <button onClick={() => setZoom(z => Math.min(2, +(z + 0.15).toFixed(2)))} className="p-1 text-white/50 rounded"><ZoomIn size={12} /></button>
                                </div>
                            )}

                            {!isMobile && (
                                <span className="text-[8px] text-white/15 font-bold shrink-0 ml-auto hidden md:block">双击标签重命名 · Ctrl+滚轮缩放</span>
                            )}
                        </div>
                    </div>

                    {/* ══════ 右侧属性面板（桌面=侧栏，手机=底部弹出Sheet） ══════ */}
                    {selectedNode && mode === 'select' && !isMobile && (
                        <div className="bg-white border-l border-gray-200 w-56 flex flex-col shrink-0 overflow-y-auto z-20 animate-in slide-in-from-right-4 fade-in duration-150">
                            <PropPanel node={selectedNode} empMap={empMap} allRoles={allRoles} employees={employees}
                                updateNode={updateNode} deleteSelected={deleteSelected} setSelected={setSelected}
                                syncHRData={syncHRData} editingField={editingField} setEditingField={setEditingField} />
                        </div>
                    )}

                    {/* 手机端：底部弹出 Sheet */}
                    {selectedNode && mode === 'select' && isMobile && showPropSheet && (
                        <>
                            <div className="fixed inset-0 bg-black/30 z-30" onClick={() => { setSelected(null); setShowPropSheet(false); }} />
                            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-200"
                                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
                                <div className="flex justify-center py-2 shrink-0">
                                    <div className="w-10 h-1 bg-gray-200 rounded-full" />
                                </div>
                                <div className="overflow-y-auto flex-1">
                                    <PropPanel node={selectedNode} empMap={empMap} allRoles={allRoles} employees={employees}
                                        updateNode={updateNode} deleteSelected={deleteSelected} setSelected={setSelected}
                                        syncHRData={syncHRData} editingField={editingField} setEditingField={setEditingField} />
                                </div>
                            </div>
                        </>
                    )}

                    </>) /* end canvas view */}

                </div>

                {/* ══════ 导出弹窗 ══════ */}
                {showExport && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center backdrop-blur-sm" onClick={() => setShowExport(false)}>
                        <div className={`bg-white shadow-2xl p-5 w-full animate-in fade-in ${isMobile ? 'rounded-t-2xl max-w-full' : 'rounded-2xl w-80 zoom-in-95'}`}
                            style={isMobile ? { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' } : undefined}
                            onClick={e => e.stopPropagation()}>
                            <h4 className="font-bold text-sm text-gray-800 mb-1 flex items-center gap-2">
                                <FileDown size={14} className="text-indigo-500" /> 选择导出页面
                            </h4>
                            <p className="text-[9px] text-gray-400 font-medium mb-3">每页 = PDF 一页</p>
                            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
                                {pages.map(pg => (
                                    <button key={pg.id}
                                        onClick={() => setExportIds(prev => { const s = new Set(prev); s.has(pg.id) ? s.delete(pg.id) : s.add(pg.id); return s; })}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${exportIds.has(pg.id) ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200 hover:border-indigo-200'}`}>
                                        <Checkbox checked={exportIds.has(pg.id)} />
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-bold text-gray-700 truncate">{pg.name}</div>
                                            <div className="text-[9px] text-gray-400">{pg.nodes.length} 节点 · {pg.edges.length} 连线</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowExport(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-[11px] font-bold">取消</button>
                                <button onClick={handleExport} disabled={!exportIds.size}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5">
                                    <FileDown size={11} /> 导出 ({exportIds.size})
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showTips && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm" onClick={() => setShowTips(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl p-5 w-80 animate-in zoom-in-95 fade-in" onClick={e => e.stopPropagation()}>
                            <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">💡 功能建议</h4>
                            <div className="space-y-2 text-[11px] text-gray-600 font-medium">
                                {[
                                    ['🖼', '图片背景 / 公司 Logo 水印'],
                                    ['📌', '节点备注 / 注释气泡'],
                                    ['🎨', '自定义节点边框样式'],
                                    ['📎', '员工节点 → 显示电话 / 入职日期'],
                                    ['📐', '对齐辅助线'],
                                    ['📤', '导出为 PNG'],
                                    ['🔒', '节点锁定'],
                                    ['🌙', '深色模式'],
                                    ['👥', '多人实时协作'],
                                ].map(([icon, text]) => (
                                    <div key={text as string} className="flex items-start gap-2 p-2 bg-gray-50 rounded-xl">
                                        <span>{icon}</span><span>{text}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setShowTips(false)} className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-xl text-[11px] font-bold">关闭</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════
// 抽取的子组件
// ═══════════════════════════════════════════════════════

// ── 员工列表（复用于桌面侧栏和手机抽屉） ──
const EmpList: React.FC<{
    employees: Employee[]; empSearch: string; setEmpSearch: (s: string) => void;
    empIdsOnCanvas: Set<string>; addEmployee: (e: Employee) => void; onRefresh: () => void;
}> = ({ employees, empSearch, setEmpSearch, empIdsOnCanvas, addEmployee, onRefresh }) => (
    <>
        <div className="px-2.5 pt-2.5 pb-1 flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                <Search size={10} className="text-gray-300 shrink-0" />
                <input
                    className="flex-1 bg-transparent text-[11px] font-medium text-gray-700 focus:outline-none placeholder:text-gray-300 w-full"
                    placeholder="搜索员工..."
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)} />
            </div>
            <button onClick={onRefresh} title="刷新" className="text-gray-300 hover:text-indigo-400 p-1.5">
                <RefreshCw size={11} />
            </button>
        </div>
        <div className="overflow-y-auto flex-1 px-2 pb-2 space-y-1 mt-1">
            {employees.map(emp => {
                const onCanvas = empIdsOnCanvas.has(emp.id);
                return (
                    <button key={emp.id} onClick={() => addEmployee(emp)}
                        className={`w-full flex items-center gap-2 p-2 rounded-xl border cursor-pointer active:scale-[0.97] text-left transition-all group
                            ${onCanvas
                                ? 'bg-gray-50 border-gray-100 opacity-40'
                                : 'bg-white border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50'
                            }`}>
                        <div className="w-7 h-7 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold text-gray-500 border border-gray-200">
                            {emp.avatar ? <img src={emp.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt={emp.name} /> : emp.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold text-gray-800 truncate">{emp.name}</div>
                            <div className="text-[9px] text-gray-400 truncate">{emp.role.split('(')[0]}</div>
                        </div>
                        {onCanvas
                            ? <Check size={10} className="text-emerald-400 shrink-0" />
                            : <Plus size={10} className="text-gray-200 group-hover:text-indigo-400 shrink-0" />
                        }
                    </button>
                );
            })}
            {!employees.length && (
                <p className="text-[10px] text-gray-300 text-center py-4 font-semibold">
                    {empSearch ? '无匹配结果' : '暂无员工'}
                </p>
            )}
        </div>
    </>
);

// ── 属性面板（复用于桌面侧栏和手机 Sheet） ──
const PropPanel: React.FC<{
    node: ONode; empMap: Record<string, Employee>; allRoles: string[]; employees: Employee[];
    updateNode: (id: string, patch: Partial<ONode>) => void; deleteSelected: () => void;
    setSelected: (s: string | null) => void; syncHRData: (nid: string, eid: string) => void;
    editingField: { nodeId: string; field: 'restDays' | 'accommodation' | 'bonusPool' } | null;
    setEditingField: (f: { nodeId: string; field: 'restDays' | 'accommodation' | 'bonusPool' } | null) => void;
}> = ({ node, empMap, allRoles, employees, updateNode, deleteSelected, setSelected, syncHRData }) => {

    return (
        <>
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    {node.kind === 'dept' ? '部门属性' : node.kind === 'employee' ? '员工节点' : node.kind === 'bonus' ? '奖金池' : '职位属性'}
                </span>
                <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>
            </div>

            {node.kind === 'dept' && (
                <div className="p-3 space-y-3 overflow-y-auto flex-1">
                    <div>
                        <Label>部门名称</Label>
                        <input autoFocus
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-[12px] font-semibold focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 mt-1"
                            value={node.label ?? ''}
                            onChange={e => updateNode(node.id, { label: e.target.value })} />
                    </div>
                    <div>
                        <Label>颜色</Label>
                        <div className="grid grid-cols-4 gap-2 mt-1.5">
                            {PALETTE.map(c => (
                                <button key={c} onClick={() => updateNode(node.id, { color: c })}
                                    className={`w-9 h-9 rounded-lg border-2 transition-all ${node.color === c ? 'border-gray-700 scale-110 shadow-sm' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }} />
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label>显示字段</Label>
                        <div className="space-y-1.5 mt-1">
                            <Toggle active={!!node.deptShowRoles} onClick={() => updateNode(node.id, { deptShowRoles: !node.deptShowRoles })} label="👤 显示职位" />
                            <Toggle active={!!node.deptShowRestDays} onClick={() => updateNode(node.id, { deptShowRestDays: !node.deptShowRestDays })} label="🌙 显示休息天" />
                            <Toggle active={!!node.deptShowAccommodation} onClick={() => updateNode(node.id, { deptShowAccommodation: !node.deptShowAccommodation })} label="🏠 显示宿舍" />
                            <Toggle active={!!node.deptShowBonusPool} onClick={() => updateNode(node.id, { deptShowBonusPool: !node.deptShowBonusPool })} label="💰 显示奖金池" />
                        </div>
                    </div>
                    <div>
                        <Label>员工成员</Label>
                        <div className="space-y-1 mt-1 max-h-52 overflow-y-auto">
                            {employees.map(emp => {
                                const inDept = (node.memberEmpIds ?? []).includes(emp.id);
                                return (
                                    <button key={emp.id}
                                        onClick={() => {
                                            const cur = node.memberEmpIds ?? [];
                                            updateNode(node.id, { memberEmpIds: inDept ? cur.filter(i => i !== emp.id) : [...cur, emp.id] });
                                        }}
                                        className={`w-full flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all ${inDept ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40'}`}>
                                        <div className="w-5 h-5 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[8px] font-bold text-gray-500 border border-gray-200">
                                            {emp.avatar ? <img src={emp.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt={emp.name} /> : emp.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] font-semibold text-gray-700 truncate block">{emp.name}</span>
                                            <span className="text-[8px] text-gray-400 truncate block">{emp.role.split('(')[0]}</span>
                                        </div>
                                        {inDept && <Check size={10} className="text-indigo-500 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <DelBtn onClick={deleteSelected} />
                </div>
            )}

            {node.kind === 'employee' && (() => {
                const emp = empMap[node.empId!];
                return (
                    <div className="p-3 space-y-3 overflow-y-auto flex-1">
                        {emp && (
                            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-2.5">
                                <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold text-gray-500">
                                    {emp.avatar ? <img src={emp.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt={emp.name} /> : emp.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[12px] font-bold text-gray-800 truncate">{emp.name}</div>
                                    <div className="text-[9px] text-gray-400 truncate">{emp.role.split('(')[0]}</div>
                                </div>
                            </div>
                        )}
                        <div>
                            <Label>职位标签 (多选)</Label>
                            <div className="space-y-1 mt-1 max-h-44 overflow-y-auto">
                                {allRoles.map(role => {
                                    const on = (node.selectedRoles ?? []).includes(role);
                                    return (
                                        <button key={role}
                                            onClick={() => {
                                                const cur = node.selectedRoles ?? [];
                                                updateNode(node.id, { selectedRoles: on ? cur.filter(r => r !== role) : [...cur, role] });
                                            }}
                                            className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left text-[10px] font-semibold transition-all ${on ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200'}`}>
                                            <Checkbox checked={on} />
                                            <span className="truncate">{role}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <Label>额外信息</Label>
                            <div className="space-y-1.5 mt-1">
                                <Toggle active={!!node.showRestDays} onClick={() => updateNode(node.id, { showRestDays: !node.showRestDays })} label="🌙 休息天数" />
                                <Toggle active={!!node.showAccommodation} onClick={() => updateNode(node.id, { showAccommodation: !node.showAccommodation })} label="🏠 宿舍 (Hostel)" />
                                <Toggle active={!!node.showBonusPool} onClick={() => updateNode(node.id, { showBonusPool: !node.showBonusPool })} label="💰 奖金池 (Bonus)" />
                            </div>
                        </div>

                        {(node.showRestDays || node.showAccommodation || node.showBonusPool) && (
                            <div>
                                <Label>编辑字段</Label>
                                <div className="space-y-2 mt-1">
                                    {node.showRestDays && (
                                        <div>
                                            <span className="text-[8px] text-gray-400 font-bold block mb-0.5">🌙 休息天数</span>
                                            <input
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold focus:outline-none focus:border-indigo-400"
                                                value={node.overrideRestDays ?? getEmpRestDays(emp)}
                                                placeholder="如: 4 天/月"
                                                onChange={e => updateNode(node.id, { overrideRestDays: e.target.value })}
                                            />
                                            <span className="text-[7px] text-gray-300">HR: {getEmpRestDays(emp) || '无'}</span>
                                        </div>
                                    )}
                                    {node.showAccommodation && (
                                        <div>
                                            <span className="text-[8px] text-gray-400 font-bold block mb-0.5">🏠 宿舍</span>
                                            <input
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold focus:outline-none focus:border-indigo-400"
                                                value={node.overrideAccommodation ?? getEmpHostel(emp)}
                                                placeholder="有/无宿舍"
                                                onChange={e => updateNode(node.id, { overrideAccommodation: e.target.value })}
                                            />
                                            <span className="text-[7px] text-gray-300">HR: {getEmpHostel(emp) || '无'}</span>
                                        </div>
                                    )}
                                    {node.showBonusPool && (
                                        <div>
                                            <span className="text-[8px] text-gray-400 font-bold block mb-0.5">💰 奖金池 (Bonus Pool)</span>
                                            <input
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold focus:outline-none focus:border-amber-400"
                                                value={node.overrideBonusPool ?? ''}
                                                placeholder="留空 / 输入金额"
                                                onChange={e => updateNode(node.id, { overrideBonusPool: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    {node.empId && (
                                        <button
                                            onClick={() => syncHRData(node.id, node.empId!)}
                                            className="w-full text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-all">
                                            <RefreshCw size={10} /> 从 HR 同步
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <Label>大小</Label>
                            <button onClick={() => updateNode(node.id, { cw: undefined, ch: undefined })}
                                className="mt-1 text-[10px] text-gray-400 hover:text-indigo-500 font-semibold flex items-center gap-1">
                                <Maximize2 size={10} /> 重置为自动大小
                            </button>
                        </div>
                        <DelBtn onClick={deleteSelected} />
                    </div>
                );
            })()}

            {node.kind === 'role' && (
                <div className="p-3 space-y-3">
                    <div>
                        <Label>职位名称</Label>
                        <input autoFocus
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-[12px] font-semibold focus:outline-none focus:border-emerald-400 mt-1"
                            value={node.label ?? ''}
                            onChange={e => updateNode(node.id, { label: e.target.value })} />
                    </div>
                    <div>
                        <Label>颜色</Label>
                        <div className="grid grid-cols-4 gap-2 mt-1.5">
                            {PALETTE.map(c => (
                                <button key={c} onClick={() => updateNode(node.id, { color: c })}
                                    className={`w-9 h-9 rounded-lg border-2 transition-all ${node.color === c ? 'border-gray-700 scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }} />
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label>大小</Label>
                        <button onClick={() => updateNode(node.id, { cw: undefined, ch: undefined })}
                            className="mt-1 text-[10px] text-gray-400 hover:text-emerald-500 font-semibold flex items-center gap-1">
                            <Maximize2 size={10} /> 重置为自动大小
                        </button>
                    </div>
                    <DelBtn onClick={deleteSelected} />
                </div>
            )}

            {node.kind === 'bonus' && (
                <div className="p-3 space-y-3 overflow-y-auto flex-1">
                    <div>
                        <Label>奖金池名称</Label>
                        <input autoFocus
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-[12px] font-semibold focus:outline-none focus:border-amber-400 mt-1"
                            value={node.label ?? ''}
                            onChange={e => updateNode(node.id, { label: e.target.value })} />
                    </div>
                    <div>
                        <Label>员工成员 (点击添加/移除)</Label>
                        <div className="space-y-1 mt-1 max-h-52 overflow-y-auto">
                            {employees.map(emp => {
                                const inPool = (node.memberEmpIds ?? []).includes(emp.id);
                                return (
                                    <button key={emp.id}
                                        onClick={() => {
                                            const cur = node.memberEmpIds ?? [];
                                            updateNode(node.id, { memberEmpIds: inPool ? cur.filter(i => i !== emp.id) : [...cur, emp.id] });
                                        }}
                                        className={`w-full flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all ${inPool ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-100 hover:border-amber-200 hover:bg-amber-50/40'}`}>
                                        <div className="w-5 h-5 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[8px] font-bold text-gray-500 border border-gray-200">
                                            {emp.avatar ? <img src={emp.avatar} crossOrigin="anonymous" className="w-full h-full object-cover" alt={emp.name} /> : emp.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] font-semibold text-gray-700 truncate block">{emp.name}</span>
                                        </div>
                                        {inPool && <Check size={10} className="text-amber-500 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <Label>大小</Label>
                        <button onClick={() => updateNode(node.id, { cw: undefined, ch: undefined })}
                            className="mt-1 text-[10px] text-gray-400 hover:text-amber-500 font-semibold flex items-center gap-1">
                            <Maximize2 size={10} /> 重置为自动大小
                        </button>
                    </div>
                    <DelBtn onClick={deleteSelected} />
                </div>
            )}
        </>
    );
};
const AnalyticsPanel: React.FC<{ employees: Employee[] }> = ({ employees }) => {
    const active = employees.filter(e => !e.isArchived && !e.role.includes('Owner'));
    const totalCost   = active.reduce((s, e) => s + (e.basicSalary || 0), 0);
    const localCount  = active.filter(e => (e.nationality ?? '').toLowerCase().includes('malaysian')).length;
    const foreignCount = active.length - localCount;

    const roleMap: Record<string, { count: number; total: number; names: { name: string; salary: number }[] }> = {};
    active.forEach(e => {
        const role = e.role.split('(')[0].trim();
        if (!roleMap[role]) roleMap[role] = { count: 0, total: 0, names: [] };
        roleMap[role].count++;
        roleMap[role].total += e.basicSalary || 0;
        roleMap[role].names.push({ name: e.name, salary: e.basicSalary || 0 });
    });
    const roles = Object.entries(roleMap).sort((a, b) => b[1].total - a[1].total);

    const natMap: Record<string, number> = {};
    active.forEach(e => { const n = e.nationality || 'Unknown'; natMap[n] = (natMap[n] || 0) + 1; });
    const natList = Object.entries(natMap).sort((a, b) => b[1] - a[1]);

    const StatCard = ({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) => (
        <div className="rounded-xl p-4 border bg-white border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-xl font-bold ${accent ? 'text-emerald-600' : 'text-[#1A1A2E]'}`}>{value}</p>
            {sub && <p className="text-[10px] text-gray-400 font-medium mt-1">{sub}</p>}
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto bg-[#F8F9FC] p-4 md:p-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="总人数" value={active.length.toString()} sub="Active staff" />
                <StatCard label="月薪总成本" value={`RM ${totalCost.toLocaleString()}`} sub="Monthly payroll" accent />
                <StatCard label="本地员工" value={localCount.toString()} sub={`${Math.round(localCount / Math.max(active.length, 1) * 100)}%`} />
                <StatCard label="外籍员工" value={foreignCount.toString()} sub={`${Math.round(foreignCount / Math.max(active.length, 1) * 100)}%`} />
            </div>

            <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <BarChart2 size={13} /> 职位详情
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {roles.map(([role, data]) => (
                        <div key={role} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                                <div>
                                    <p className="text-sm font-bold text-[#1A1A2E]">{role}</p>
                                    <p className="text-[10px] text-gray-400 font-medium">RM {data.total.toLocaleString()}/mo</p>
                                </div>
                                <div className="w-7 h-7 bg-[#1A1A2E] rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0">{data.count}</div>
                            </div>
                            <div className="px-4 py-2 space-y-1.5">
                                {data.names.map((n, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                                            <span className="text-[11px] font-medium text-gray-600 truncate">{n.name}</span>
                                        </div>
                                        <span className="text-[11px] font-mono font-medium text-gray-500 shrink-0 ml-2">RM {n.salary.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Globe size={13} /> 国籍分布
                </h3>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {natList.map(([nat, cnt], i) => {
                        const pct = Math.round(cnt / Math.max(active.length, 1) * 100);
                        return (
                            <div key={nat} className={`flex items-center gap-3 px-4 py-3 ${i < natList.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                <span className="text-sm font-medium text-gray-700 w-36 shrink-0 truncate">{nat}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                    <div className="h-2 rounded-full bg-[#1A1A2E]" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-bold text-gray-500 w-14 text-right shrink-0">{cnt} <span className="text-gray-300">({pct}%)</span></span>
                            </div>
                        );
                    })}
                    {!natList.length && <p className="text-xs text-gray-300 italic text-center py-6">暂无数据</p>}
                </div>
            </div>

            <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <DollarSign size={13} /> 薪资区间
                </h3>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {[
                        { label: '≥ RM 4,000', filter: (s: number) => s >= 4000, color: 'bg-purple-500' },
                        { label: 'RM 3,000 – 3,999', filter: (s: number) => s >= 3000 && s < 4000, color: 'bg-indigo-500' },
                        { label: 'RM 2,000 – 2,999', filter: (s: number) => s >= 2000 && s < 3000, color: 'bg-blue-400' },
                        { label: 'RM 1,000 – 1,999', filter: (s: number) => s >= 1000 && s < 2000, color: 'bg-emerald-400' },
                        { label: '< RM 1,000', filter: (s: number) => s < 1000, color: 'bg-gray-300' },
                    ].map((band, i, arr) => {
                        const cnt = active.filter(e => band.filter(e.basicSalary || 0)).length;
                        const pct = Math.round(cnt / Math.max(active.length, 1) * 100);
                        return (
                            <div key={band.label} className={`flex items-center gap-3 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                <div className={`w-2.5 h-2.5 rounded-full ${band.color} shrink-0`} />
                                <span className="text-[11px] font-medium text-gray-600 w-40 shrink-0">{band.label}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                    <div className={`h-2 rounded-full ${band.color}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-bold text-gray-500 w-14 text-right shrink-0">{cnt} <span className="text-gray-300">({pct}%)</span></span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ── 移动端菜单项 ──
const MMenuItem: React.FC<{
    icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; className?: string;
}> = ({ icon, label, onClick, active, className }) => (
    <button onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-left ${active ? 'bg-amber-400/20 text-amber-300' : 'text-white/60 hover:bg-white/8 hover:text-white'} ${className || ''}`}>
        {icon}
        <span className="text-[12px] font-semibold">{label}</span>
    </button>
);

// ── 共用小组件 ──
const TBtn: React.FC<{ active: boolean; onClick: () => void; title: string; children: React.ReactNode }> = ({ active, onClick, title, children }) => (
    <button onClick={onClick} title={title}
        className={`p-1.5 rounded-lg transition-all ${active ? 'bg-amber-400 text-black' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}>
        {children}
    </button>
);
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">{children}</span>
);
const DelBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button onClick={onClick} className="w-full bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-xl py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all">
        <Trash2 size={11} /> 删除节点
    </button>
);
const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
    <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'}`}>
        {checked && <Check size={10} className="text-white" />}
    </div>
);
const Toggle: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
    <button onClick={onClick}
        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl border transition-all ${active ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200 hover:border-emerald-200'}`}>
        <span className={`text-[10px] font-semibold ${active ? 'text-emerald-700' : 'text-gray-500'}`}>{label}</span>
        <div className={`w-8 h-4.5 rounded-full transition-all flex items-center ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
            <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all mx-0.5 ${active ? 'translate-x-3.5' : ''}`} />
        </div>
    </button>
);