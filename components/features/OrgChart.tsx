import { html2canvas, loadJsPDF } from '../../utils/lazyLibs';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, ZoomIn, ZoomOut, Maximize2, Users, LayoutGrid, Check, SlidersHorizontal, ListChecks } from 'lucide-react';
import { Employee } from '../../types';
import { getOrgLevel } from '../../utils/orgAccess';
import { DataManager, AttendanceShiftSettings, DEFAULT_ATTENDANCE_SETTINGS } from '../../utils/dataManager';
import { waitForPdfFonts, prepareClonedDocumentForPdf } from '../../utils/pdfStyleResolver';
import { SHIFT_GROUP_META, shiftGroupOf, ShiftGroupKey } from '../../constants/shiftGroups';
import { resolveTier, resolvePosition, secondaryBadge, deptOf, DEPT_META } from '../../utils/orgChartModel';
import { useDivisions, suggestDivisions, buildDivisionChart, DIVISION_COLORS } from '../../utils/orgDivisions';
import type { DivisionView } from '../../utils/orgDivisions';
import { DivisionEditor } from './org/DivisionEditor';
import { useOrgLayout, curveBetween, LINK_COLORS, LINK_STYLES, newLayoutId } from '../../utils/orgChartLayout';
import type { OrgAssistant, OrgExtraLink, OrgNodeKey } from '../../utils/orgChartLayout';
import { NodeSheet, LinkSheet, AssistantSheet, LayoutDrawer } from './org/LayoutTools';
import type { PickedNode } from './org/LayoutTools';

/**
 * 🏢 组织架构图：BOD → MANAGEMENT → DEPARTMENTS → STAFF
 *
 *  - 层级、负责单位、直属上司、第二身份全部来自员工档案（utils/orgChartModel.ts），不 hardcode 名字
 *  - 管理层跟它管的部门排在同一直栏，线一路往下：负责人 → 部门 → 员工
 *  - 第二身份（例如 Venice = PA to Ben）用细虚线 + 徽章，不影响正式汇报线
 *  - 按 Group：Group A / Group B 两大栏；分组模式可以直接点 A / B
 *
 * 图表本体全部 inline style + SVG 连线，画面跟导出 PDF 是同一份 DOM。
 */

interface OrgChartProps {
    onClose: () => void;
}

const FONT = `'Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei',system-ui,sans-serif`;
const INK = '#1C1917';
const MUTED = '#78716C';
const PA_COLOR = '#B45309';

const fmtShift = (inT?: string, outT?: string, brOn?: boolean, brS?: string, brE?: string) =>
    `${inT || '—'} – ${outT || '—'}${brOn && brS && brE ? `　休息 ${brS} – ${brE}` : ''}`;

// ---------------------------------------------------------------------------
// 小零件（inline style）
// ---------------------------------------------------------------------------

const GroupBadge: React.FC<{ g: ShiftGroupKey }> = ({ g }) => {
    const m = SHIFT_GROUP_META[g];
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 24,
                height: 20,
                padding: '0 6px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 900,
                color: m.fg,
                background: m.bg,
                border: `1px solid ${m.border}`,
                whiteSpace: 'nowrap',
            }}
        >
            {m.short}
        </span>
    );
};

type Tone = 'bod' | 'mgmt' | 'normal';

const PersonCard: React.FC<{
    emp: Employee;
    tone?: Tone;
    title?: string; // 主标题下第一行（BOD = Board of Director）
    tags?: React.ReactNode;
    showGroup?: boolean;
    assignMode?: boolean;
    saving?: boolean;
    onAssign?: (emp: Employee, g: 1 | 2) => void;
    hidePosition?: boolean;
}> = ({ emp, tone = 'normal', title, tags, showGroup = true, assignMode, saving, onAssign, hidePosition }) => {
    const pos = resolvePosition(emp);
    const g = shiftGroupOf(emp);
    const toneStyle: React.CSSProperties =
        tone === 'bod'
            ? { background: '#FFFBEA', border: '1.5px solid #FFD200' }
            : tone === 'mgmt'
              ? { background: '#F8FAFC', border: '1.5px solid #64748B' }
              : { background: '#FFFFFF', border: '1px solid #E7E5E4' };
    return (
        <div
            data-org-node={`emp-${emp.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, ...toneStyle, opacity: saving ? 0.5 : 1, position: 'relative' }}
        >
            <div
                style={{
                    width: tone === 'normal' ? 30 : 36,
                    height: tone === 'normal' ? 30 : 36,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 900,
                    color: tone === 'bod' ? '#92400E' : tone === 'mgmt' ? '#FFFFFF' : '#57534E',
                    background: tone === 'bod' ? '#FFD200' : tone === 'mgmt' ? '#334155' : '#F5F5F4',
                    overflow: 'hidden',
                }}
            >
                {emp.avatar ? (
                    <img src={emp.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} crossOrigin="anonymous" />
                ) : (
                    (emp.name || '?').trim().charAt(0).toUpperCase()
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: tone === 'normal' ? 14 : 15, fontWeight: 900, color: INK, lineHeight: 1.25, wordBreak: 'break-word' }}>{emp.name}</div>
                {title && <div style={{ fontSize: 11.5, fontWeight: 800, color: '#92400E', lineHeight: 1.35, marginTop: 1 }}>{title}</div>}
                {!hidePosition && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, lineHeight: 1.3, marginTop: 1 }}>
                        {pos.zh || pos.en}
                        {pos.zh && pos.en && <span style={{ color: '#A8A29E', fontWeight: 500 }}> · {pos.en}</span>}
                    </div>
                )}
                {tags && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{tags}</div>}
            </div>
            {assignMode && onAssign ? (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {([1, 2] as const).map(n => {
                        const key: ShiftGroupKey = n === 1 ? 'A' : 'B';
                        const on = g === key;
                        const m = SHIFT_GROUP_META[key];
                        return (
                            <button
                                key={n}
                                type="button"
                                disabled={saving}
                                onClick={e => {
                                    e.stopPropagation();
                                    if (!on) onAssign(emp, n);
                                }}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    color: on ? '#FFFFFF' : m.fg,
                                    background: on ? m.solid : '#FFFFFF',
                                    border: `1.5px solid ${on ? m.solid : m.border}`,
                                }}
                                aria-label={`${emp.name} 设为 ${m.label}`}
                                aria-pressed={on}
                            >
                                {m.short}
                            </button>
                        );
                    })}
                </div>
            ) : (
                showGroup && g !== 'NONE' && <GroupBadge g={g} />
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// SVG 连线（量每个节点的位置，跟着画面重算；导出时一起被截图）
// ---------------------------------------------------------------------------

interface Seg {
    d: string;
    dashed?: boolean;
    dash?: string;
    color?: string;
    width?: number;
    label?: { x: number; y: number; text: string };
    /** 箭头（实心三角形） */
    arrow?: string;
    /** 底下垫一条白边，压在卡片上也看得清 */
    halo?: boolean;
}

interface HL {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
}

const relRect = (el: HTMLElement, root: HTMLElement) => {
    let x = 0;
    let y = 0;
    let n: HTMLElement | null = el;
    while (n && n !== root) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
};

// ---------------------------------------------------------------------------

export const OrgChart: React.FC<OrgChartProps> = ({ onClose }) => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [shiftSettings, setShiftSettings] = useState<AttendanceShiftSettings>(DEFAULT_ATTENDANCE_SETTINGS);
    const [view, setView] = useState<'DEPT' | 'GROUP'>('DEPT');
    const [assignMode, setAssignMode] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [scale, setScale] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 0.5 : 1));
    const [isExporting, setIsExporting] = useState(false);
    const [segs, setSegs] = useState<Seg[]>([]);
    const [hls, setHls] = useState<HL[]>([]);
    // 🎛️ 自由调整
    const { layout, update: updateLayout, saving: layoutSaving } = useOrgLayout();
    const [editMode, setEditMode] = useState(false);
    const [picked, setPicked] = useState<PickedNode | null>(null);
    const [linkFrom, setLinkFrom] = useState<PickedNode | null>(null);
    const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
    const [assistFor, setAssistFor] = useState<PickedNode | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });
    const chartRef = useRef<HTMLDivElement>(null);
    const treeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        DataManager.getEmployees()
            .then(list => setEmployees(list || []))
            .catch(console.error)
            .finally(() => setLoaded(true));
        DataManager.getAttendanceSettings()
            .then(s => s && setShiftSettings({ ...DEFAULT_ATTENDANCE_SETTINGS, ...s }))
            .catch(() => {});
    }, []);

    const active = useMemo(() => employees.filter(e => !e.isArchived && e.status !== 'TERMINATED'), [employees]);
    const { divisions: savedDivisions, save: saveDivisionList } = useDivisions();
    const [showDivisionEditor, setShowDivisionEditor] = useState(false);
    const suggested = useMemo(() => suggestDivisions(active), [active]);
    const divisionDefs = savedDivisions || suggested;
    const divChart = useMemo(() => buildDivisionChart(active, divisionDefs), [active, divisionDefs]);
    const allDivs: DivisionView[] = useMemo(() => {
        const list = [...divChart.divisions];
        if (divChart.leftover.heads.length || divChart.leftover.depts.length) {
            list.push({
                def: { id: '__other', nameZh: '其他', nameEn: 'Others', color: 'slate', leaderIds: [], depts: [] },
                leaders: [],
                heads: divChart.leftover.heads,
                depts: divChart.leftover.depts,
            });
        }
        return list;
    }, [divChart]);

    /** 排班分组：BOD 以外的人 */
    const groupable = useMemo(() => active.filter(e => resolveTier(e) !== 'BOD'), [active]);
    const counts = useMemo(() => {
        const c = { A: 0, B: 0, NONE: 0 };
        groupable.forEach(e => c[shiftGroupOf(e)]++);
        return c;
    }, [groupable]);

    const handleAssign = async (emp: Employee, n: 1 | 2) => {
        setSavingId(emp.id);
        const updated = { ...emp, shiftGroup: n } as Employee;
        setEmployees(list => list.map(e => (e.id === emp.id ? updated : e)));
        try {
            await DataManager.saveEmployee(updated);
        } catch (err) {
            console.error(err);
            setEmployees(list => list.map(e => (e.id === emp.id ? emp : e)));
            alert('❌ 分组没存到，请检查网络后再点一次');
        } finally {
            setSavingId(null);
        }
    };

    const hiddenPos = useMemo(() => new Set(layout.hiddenPositions), [layout.hiddenPositions]);
    const cardProps = (emp: Employee) => ({ emp, assignMode, saving: savingId === emp.id, onAssign: handleAssign, hidePosition: hiddenPos.has(emp.id) });
    const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
    const assistantsOf = (anchor: OrgNodeKey) => layout.assistants.filter(a => a.anchor === anchor && empById.has(a.empId));

    /** 图上节点 key → 显示名称 */
    const labelOf = (key: OrgNodeKey): string => {
        const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        if (kind === 'emp') return empById.get(id)?.name || id;
        if (kind === 'div' || kind === 'panel') {
            const d = allDivs.find(x => x.def.id === id);
            return d ? `${d.def.nameZh}${kind === 'panel' ? '（部门）' : ''}` : '（已删除的板块）';
        }
        if (kind === 'asst') {
            const a = layout.assistants.find(x => x.id === id);
            return a ? `${empById.get(a.empId)?.name || a.empId}（${a.title}）` : '（已删除的协助者）';
        }
        return key;
    };

    /** 点到的 DOM → 图上节点 */
    const nodeFromEl = (el: HTMLElement | null): PickedNode | null => {
        const hit = el?.closest('[data-org-node]') as HTMLElement | null;
        const raw = hit?.getAttribute('data-org-node') || '';
        const m = raw.match(/^(emp|div|panel|asst)-(.+)$/);
        if (!m) return null;
        const kind = m[1] as PickedNode['kind'];
        const key = `${kind}:${m[2]}`;
        let canAssist = kind === 'div';
        if (kind === 'emp') {
            const e = empById.get(m[2]);
            canAssist = !!e && resolveTier(e) !== 'STAFF';
        }
        return { key, kind, label: labelOf(key), empId: kind === 'emp' ? m[2] : undefined, canAssist };
    };

    const handleChartClick = (ev: React.MouseEvent) => {
        if (!editMode || view !== 'DEPT') return;
        const n = nodeFromEl(ev.target as HTMLElement);
        if (!n) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (linkFrom) {
            if (n.key === linkFrom.key) return;
            const link: OrgExtraLink = { id: newLayoutId('ln'), from: linkFrom.key, to: n.key, style: 'dashed', color: 'amber', arrow: true };
            updateLayout(l => ({ ...l, links: [...l.links, link] }));
            setLinkFrom(null);
            setEditingLinkId(link.id);
            return;
        }
        setPicked(n);
    };

    const editingLink = layout.links.find(l => l.id === editingLinkId) || null;
    const patchLink = (id: string, patch: Partial<OrgExtraLink>) => updateLayout(l => ({ ...l, links: l.links.map(x => (x.id === id ? { ...x, ...patch } : x)) }));
    const deleteLink = (id: string) => updateLayout(l => ({ ...l, links: l.links.filter(x => x.id !== id) }));
    const deleteAssistant = (a: OrgAssistant) =>
        updateLayout(l => ({
            ...l,
            assistants: l.assistants.filter(x => x.id !== a.id),
            // 连到这张小卡的线一起拿掉
            links: l.links.filter(x => x.from !== `asst:${a.id}` && x.to !== `asst:${a.id}`),
        }));
    const togglePosition = (empId: string) =>
        updateLayout(l => ({ ...l, hiddenPositions: l.hiddenPositions.includes(empId) ? l.hiddenPositions.filter(x => x !== empId) : [...l.hiddenPositions, empId] }));

    // -----------------------------------------------------------------------
    // 连线：BOD → 每栏第一个节点（管理层或部门）；管理层 → 部门；第二身份虚线
    // -----------------------------------------------------------------------
    useLayoutEffect(() => {
        const root = treeRef.current;
        if (!root || view !== 'DEPT') {
            setSegs([]);
            return;
        }
        const compute = () => {
            const q = (id: string) => root.querySelector(`[data-org-node="${id}"]`) as HTMLElement | null;
            const out: Seg[] = [];
            const bodEl = q('bod-row');
            const pill = q('mgmt-pill');
            // 董事会 → 管理层标签
            if (bodEl && pill) {
                const b = relRect(bodEl, root);
                const p = relRect(pill, root);
                out.push({ d: `M ${b.x + b.w / 2} ${b.y + b.h} V ${p.y}` });
            }
            // 管理层标签 → 每个板块（横线贴在板块上方）
            const divs = allDivs.map(d => q(`div-${d.def.id}`)).filter(Boolean).map(el => relRect(el as HTMLElement, root));
            if (pill && divs.length) {
                const p = relRect(pill, root);
                const top = Math.min(...divs.map(d => d.y));
                const barY = top - 8;
                const xs = divs.map(d => d.x + d.w / 2);
                out.push({ d: `M ${p.x + p.w / 2} ${p.y + p.h} V ${barY}` });
                out.push({ d: `M ${Math.min(...xs)} ${barY} H ${Math.max(...xs)}` });
                divs.forEach(d => out.push({ d: `M ${d.x + d.w / 2} ${barY} V ${d.y}` }));
            }
            // 板块 → 部门面板
            allDivs.forEach(d => {
                const a1 = q(`div-${d.def.id}`);
                const b1 = q(`panel-${d.def.id}`);
                if (!a1 || !b1) return;
                const ar = relRect(a1, root);
                const br = relRect(b1, root);
                out.push({ d: `M ${ar.x + ar.w / 2} ${ar.y + ar.h} V ${br.y}`, color: DIVISION_COLORS[d.def.color].solid });
            });
            // 🎛️ 额外连线（曲线）
            const nodeOf = (key: OrgNodeKey): HTMLElement | null => {
                const i = key.indexOf(':');
                const kind = key.slice(0, i);
                const id = key.slice(i + 1);
                if (kind === 'emp') {
                    const direct = q(`emp-${id}`);
                    if (direct) return direct;
                    // 板块负责人没有自己的方块 → 接到他的板块
                    const d = allDivs.find(x => x.def.leaderIds.includes(id));
                    if (d) return q(`div-${d.def.id}`);
                    const a = layout.assistants.find(x => x.empId === id);
                    return a ? q(`asst-${a.id}`) : null;
                }
                return q(`${kind}-${id}`);
            };
            layout.links.forEach(l => {
                const a = nodeOf(l.from);
                const b = nodeOf(l.to);
                if (!a || !b || a === b) return;
                const c = curveBetween(relRect(a, root), relRect(b, root));
                const stroke = LINK_COLORS[l.color].stroke;
                out.push({
                    d: c.d,
                    color: stroke,
                    width: 2.5,
                    dash: LINK_STYLES[l.style].dash,
                    arrow: l.arrow ? c.arrow : undefined,
                    label: l.label ? { x: c.mid[0], y: c.mid[1], text: l.label } : undefined,
                });
            });
            setSegs(out);
            // 选取中的节点：外框高亮
            const marks: HL[] = [];
            const addHL = (n: PickedNode | null, color: string) => {
                if (!n) return;
                const el = nodeOf(n.key);
                if (!el) return;
                const rr = relRect(el, root);
                marks.push({ ...rr, color });
            };
            addHL(picked, '#2563EB');
            addHL(linkFrom, '#B45309');
            setHls(marks);
            setSvgSize({ w: root.scrollWidth, h: root.scrollHeight });
        };
        compute();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => compute()) : null;
        ro?.observe(root);
        (document as any).fonts?.ready?.then?.(() => compute());
        return () => ro?.disconnect();
    }, [allDivs, view, assignMode, loaded, layout, picked, linkFrom]);

    // -----------------------------------------------------------------------
    // 导出：跟画面同一份 DOM（先回到 100%、关掉分组按钮）
    // -----------------------------------------------------------------------
    const handleExport = async () => {
        if (!chartRef.current || isExporting) return;
        setIsExporting(true);
        const prevScale = scale;
        const prevAssign = assignMode;
        setScale(1);
        setAssignMode(false);
        setPicked(null);
        setLinkFrom(null);
        try {
            await new Promise(r => setTimeout(r, 200));
            await waitForPdfFonts();
            const canvas = await html2canvas(chartRef.current!, {
                backgroundColor: '#FFFFFF',
                scale: 2,
                useCORS: true,
                onclone: async doc => {
                    await prepareClonedDocumentForPdf(doc);
                },
            });
            const ratio = canvas.width / canvas.height;
            const pdf = new (await loadJsPDF())({ orientation: ratio > 1 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
            const PW = pdf.internal.pageSize.getWidth();
            const PH = pdf.internal.pageSize.getHeight();
            const M = 8;
            const availW = PW - M * 2;
            const availH = PH - M * 2 - 4;
            let w = availW;
            let h = w / ratio;
            if (h > availH) {
                h = availH;
                w = h * ratio;
            }
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (PW - w) / 2, M, w, h, undefined, 'FAST');
            pdf.setFontSize(7);
            pdf.setTextColor(160, 160, 160);
            pdf.text('Generated by Yushan ERP', PW / 2, PH - M + 3, { align: 'center' });
            const d = new Date();
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            pdf.save(`OrgChart_${view === 'GROUP' ? 'GroupAB_' : ''}${ds}.pdf`);
        } catch (e) {
            console.error(e);
            alert('导出失败 (Export Failed)');
        } finally {
            setScale(prevScale);
            setAssignMode(prevAssign);
            setIsExporting(false);
        }
    };

    // -----------------------------------------------------------------------
    // 图表内容
    // -----------------------------------------------------------------------
    const today = new Date();
    const dateLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const staffTotal = active.filter(e => resolveTier(e) === 'STAFF').length;
    const mgmtTotal = active.filter(e => resolveTier(e) === 'MANAGEMENT').length;
    const titleBlock = (
        <div style={{ marginBottom: 22 }}>
            <div style={{ background: '#0B3B8C', color: '#FFFFFF', borderRadius: 16, padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, boxShadow: '0 3px 10px rgba(11,59,140,0.25)' }}>
                <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2 }}>{view === 'GROUP' ? '分组安排' : '组织架构图'}</span>
                <span style={{ width: 2, height: 30, background: 'rgba(255,255,255,0.6)' }} />
                <span style={{ fontSize: 28, fontWeight: 900 }}>{view === 'GROUP' ? 'Group A / Group B' : 'Organisation Chart'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 12, fontWeight: 800, color: '#64748B', flexWrap: 'wrap' }}>
                <span>金莲记 KIM LIAN KEE · KEPONG</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {view === 'GROUP' ? (
                        <>
                            <GroupBadge g="A" /> {counts.A} 人 <GroupBadge g="B" /> {counts.B} 人{counts.NONE > 0 && <span>· 未分组 {counts.NONE}</span>}
                        </>
                    ) : (
                        <>在职 {active.length} 人 · 董事 {divChart.bod.length} · 管理层 {mgmtTotal} · 员工 {staffTotal}</>
                    )}
                    <span style={{ color: '#CBD5E1' }}>|</span> {dateLabel}
                </span>
            </div>
        </div>
    );

    // ---- 按部门（正式架构）：董事会 → 管理层板块 → 部门主管 + 部门员工 ----
    const NAVY = '#0B3B8C';
    const BOD_COLORS = ['yellow', 'green', 'blue', 'purple', 'teal', 'orange'] as const;

    const Pill: React.FC<{ zh: string; en: string; nodeId?: string }> = ({ zh, en, nodeId }) => (
        <div
            data-org-node={nodeId}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: NAVY, color: '#FFFFFF', borderRadius: 999, padding: '7px 24px', fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(11,59,140,0.25)' }}
        >
            <span>{zh}</span>
            <span style={{ fontWeight: 700, fontSize: 14, opacity: 0.95 }}>{en}</span>
        </div>
    );

    const PersonIcon: React.FC<{ color: string; size: number; emp?: Employee }> = ({ color, size, emp }) => (
        <div style={{ width: size, height: size, borderRadius: 999, background: color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.08)' }}>
            {emp?.avatar ? (
                <img src={emp.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} crossOrigin="anonymous" />
            ) : (
                <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="8" r="4.2" fill="#FFFFFF" />
                    <path d="M3.5 21c0-4.6 3.8-7.6 8.5-7.6s8.5 3 8.5 7.6z" fill="#FFFFFF" />
                </svg>
            )}
        </div>
    );

    const posText = (e: Employee) => {
        if (hiddenPos.has(e.id)) return { en: '', zh: '' };
        const p = resolvePosition(e);
        return { en: p.en || p.zh, zh: p.zh && p.en ? p.zh : '' };
    };

    /** 部门员工一行：工号 · 名字 · 英文职位 · 中文职位 */
    const StaffRow: React.FC<{ e: Employee; c: (typeof DIVISION_COLORS)['red'] }> = ({ e, c }) => {
        const p = posText(e);
        const g = shiftGroupOf(e);
        const lead = getOrgLevel(e) === 'TEAM_LEAD';
        const badge = secondaryBadge(e, active);
        return (
            <div data-org-node={`emp-${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: savingId === e.id ? 0.5 : 1 }}>
                <span
                    style={{ minWidth: 38, height: 22, padding: '0 6px', borderRadius: 999, background: c.soft, color: c.text, fontSize: 11, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', flexShrink: 0 }}
                >
                    {e.id}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#0F2A5C', lineHeight: 1.25, wordBreak: 'break-word' }}>
                        {e.name}
                        {lead && <span style={{ marginLeft: 5, fontSize: 9.5, fontWeight: 900, color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 4, padding: '0 4px', verticalAlign: 'middle' }}>组长</span>}
                        {badge && <span style={{ marginLeft: 5, fontSize: 9.5, fontWeight: 900, color: PA_COLOR, border: `1px dashed ${PA_COLOR}`, borderRadius: 4, padding: '0 4px', verticalAlign: 'middle' }}>{badge}</span>}
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748B', lineHeight: 1.3 }}>{p.en}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1E293B', whiteSpace: 'nowrap', flexShrink: 0 }}>{p.zh}</div>
                {assignMode ? (
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {([1, 2] as const).map(n => {
                            const key: ShiftGroupKey = n === 1 ? 'A' : 'B';
                            const on = g === key;
                            const m = SHIFT_GROUP_META[key];
                            return (
                                <button
                                    key={n}
                                    type="button"
                                    disabled={savingId === e.id}
                                    onClick={ev => {
                                        ev.stopPropagation();
                                        if (!on) handleAssign(e, n);
                                    }}
                                    style={{ width: 36, height: 36, borderRadius: 9, fontSize: 13, fontWeight: 900, cursor: 'pointer', color: on ? '#FFF' : m.fg, background: on ? m.solid : '#FFF', border: `1.5px solid ${on ? m.solid : m.border}` }}
                                    aria-label={`${e.name} 设为 ${m.label}`}
                                    aria-pressed={on}
                                >
                                    {m.short}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    g !== 'NONE' && <GroupBadge g={g} />
                )}
            </div>
        );
    };

    /** 部门主管卡（Nai Maung、Kelvin…） */
    const HeadCard: React.FC<{ e: Employee; c: (typeof DIVISION_COLORS)['red'] }> = ({ e, c }) => {
        const p = posText(e);
        const g = shiftGroupOf(e);
        const badge = secondaryBadge(e, active);
        return (
            <div data-org-node={`emp-${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FFFFFF', border: `1.5px solid ${c.border}`, borderRadius: 14, padding: '10px 12px' }}>
                <PersonIcon color={c.solid} size={44} emp={e} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#0F2A5C', textTransform: 'uppercase', lineHeight: 1.2 }}>{e.name}</div>
                    {p.en && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginTop: 2 }}>{p.en}</div>}
                    {p.zh && <div style={{ fontSize: 12.5, fontWeight: 900, color: '#1E293B' }}>{p.zh}</div>}
                    {badge && <div style={{ marginTop: 3, fontSize: 10, fontWeight: 900, color: PA_COLOR, border: `1px dashed ${PA_COLOR}`, borderRadius: 5, padding: '0 5px', display: 'inline-block' }}>{badge}</div>}
                </div>
                {g !== 'NONE' && !assignMode && <GroupBadge g={g} />}
            </div>
        );
    };

    const DeptBar: React.FC<{ title: string; en: string; emoji: string; count?: number; c: (typeof DIVISION_COLORS)['red']; big?: boolean }> = ({ title, en, emoji, count, c, big }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.solid, color: '#FFFFFF', borderRadius: 12, padding: big ? '8px 14px 8px 8px' : '6px 12px 6px 6px' }}>
            <div style={{ width: big ? 38 : 32, height: big ? 38 : 32, borderRadius: 999, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: big ? 19 : 16, flexShrink: 0 }}>{emoji}</div>
            <div style={{ flex: 1, minWidth: 0, fontWeight: 900, fontSize: big ? 16 : 13.5, lineHeight: 1.2 }}>
                {title} <span style={{ fontWeight: 700, fontSize: big ? 13 : 11.5, opacity: 0.95 }}>{en}</span>
            </div>
            {count !== undefined && <span style={{ fontWeight: 900, fontSize: big ? 18 : 15, color: '#FFF6C8' }}>{count} 人</span>}
        </div>
    );

    /** 协助者小卡（挂在管理员旁边） */
    const ASSIST_W = 168;
    const AssistantCard: React.FC<{ a: OrgAssistant; c: (typeof DIVISION_COLORS)['red'] }> = ({ a, c }) => {
        const e = empById.get(a.empId);
        if (!e) return null;
        const p = posText(e);
        return (
            <div data-org-node={`asst-${a.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: `1.5px dashed ${c.solid}`, borderRadius: 12, padding: '7px 9px', width: ASSIST_W, boxSizing: 'border-box' }}>
                <PersonIcon color={c.solid} size={30} emp={e} />
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 900, color: '#FFFFFF', background: c.solid, borderRadius: 4, padding: '0 5px', lineHeight: '15px' }}>{a.title}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#0F2A5C', lineHeight: 1.2, marginTop: 2, wordBreak: 'break-word' }}>{e.name}</div>
                    {(p.en || p.zh) && <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748B', lineHeight: 1.25 }}>{p.zh || p.en}</div>}
                </div>
            </div>
        );
    };
    /** 把协助者挂在节点右边：节点 ─ 小卡 */
    const withAssist = (anchor: OrgNodeKey, node: React.ReactNode, c: (typeof DIVISION_COLORS)['red']) => {
        const list = assistantsOf(anchor);
        if (!list.length) return node;
        return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>{node}</div>
                <div style={{ width: 16, borderTop: `2px dashed ${c.solid}`, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {list.map(a => (
                        <AssistantCard key={a.id} a={a} c={c} />
                    ))}
                </div>
            </div>
        );
    };
    const hasAssist = (d: DivisionView) => assistantsOf(`div:${d.def.id}`).length > 0 || d.heads.some(h => assistantsOf(`emp:${h.id}`).length > 0);

    const divColW = (d: DivisionView) => (d.depts.length > 0 || d.heads.length > 0 ? 340 : 250) + (hasAssist(d) ? ASSIST_W + 16 : 0);
    const gridCols = allDivs.map(d => `${divColW(d)}px`).join(' ');
    const DIV_GAP = 14;

    const deptView = (
        <div ref={treeRef} onClickCapture={handleChartClick} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: editMode ? 'pointer' : undefined }}>
            <svg width={svgSize.w} height={svgSize.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 3 }} aria-hidden>
                {segs.map((s, i) => (
                    <g key={i}>
                        {s.halo && <path d={s.d} fill="none" stroke="#FFFFFF" strokeWidth={(s.width || 2.5) + 4} strokeLinecap="round" opacity={0.9} />}
                        <path d={s.d} fill="none" stroke={s.color || NAVY} strokeWidth={s.width || 2.5} strokeDasharray={s.dash || (s.dashed ? '5 4' : undefined)} strokeLinecap="round" />
                        {s.arrow && <path d={s.arrow} fill={s.color || NAVY} />}
                        {s.label && (
                            <g>
                                <rect
                                    x={s.label.x - (s.label.text.length * 12 + 16) / 2}
                                    y={s.label.y - 11}
                                    width={s.label.text.length * 12 + 16}
                                    height={22}
                                    rx={11}
                                    fill="#FFFFFF"
                                    stroke={s.color || NAVY}
                                    strokeWidth={1.5}
                                />
                                <text x={s.label.x} y={s.label.y + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill={s.color || NAVY} fontFamily={FONT}>
                                    {s.label.text}
                                </text>
                            </g>
                        )}
                    </g>
                ))}
                {hls.map((h, i) => (
                    <rect key={`hl${i}`} x={h.x - 4} y={h.y - 4} width={h.w + 8} height={h.h + 8} rx={14} fill="none" stroke={h.color} strokeWidth={3} strokeDasharray="6 4" />
                ))}
            </svg>

            {/* 1. 董事会 */}
            <div style={{ position: 'relative', paddingTop: 18 }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                    <Pill zh="董事会" en="Board of Directors" />
                </div>
                <div data-org-node="bod-row" style={{ display: 'flex', alignItems: 'stretch', background: '#F4F8FF', border: '2px solid #9CC3F5', borderRadius: 18, padding: '30px 18px 16px', position: 'relative', zIndex: 1 }}>
                    {divChart.bod.length === 0 && <div style={{ padding: '8px 24px', color: '#94A3B8', fontWeight: 700 }}>还没有设定 BOD（员工档案 → 组织层级）</div>}
                    {divChart.bod.map((e, i) => {
                        const c = DIVISION_COLORS[BOD_COLORS[i % BOD_COLORS.length]];
                        const p = posText(e);
                        return (
                            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 26px', borderLeft: i ? '1.5px solid #C9DBF5' : 'none', minWidth: 210 }}>
                                {withAssist(
                                    `emp:${e.id}`,
                                    <div data-org-node={`emp-${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 10 }}>
                                        <PersonIcon color={c.solid} size={56} emp={e} />
                                        <div>
                                            <div style={{ fontSize: 19, fontWeight: 900, color: '#0F2A5C', textTransform: 'uppercase', lineHeight: 1.15 }}>{e.name}</div>
                                            {p.en && <div style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', marginTop: 3 }}>{p.en}</div>}
                                            {p.zh && <div style={{ fontSize: 13.5, fontWeight: 900, color: '#1E293B' }}>{p.zh}</div>}
                                        </div>
                                    </div>,
                                    c,
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. 管理层 */}
            {allDivs.length > 0 && (
                <>
                    <div style={{ height: 22 }} />
                    <div style={{ position: 'relative', paddingTop: 18 }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                            <Pill zh="管理层" en="Management" nodeId="mgmt-pill" />
                        </div>
                        <div style={{ background: '#F4F8FF', border: '2px solid #9CC3F5', borderRadius: 18, padding: '34px 14px 14px', position: 'relative', zIndex: 1 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: DIV_GAP, alignItems: 'stretch' }}>
                                {allDivs.map(d => {
                                    const c = DIVISION_COLORS[d.def.color];
                                    const names = d.leaders.map(l => l.name.toUpperCase());
                                    const box = (() => {
                                    return withAssist(
                                        `div:${d.def.id}`,
                                        <div
                                            key={d.def.id}
                                            data-org-node={`div-${d.def.id}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 12, background: c.bg, border: `2px solid ${c.border}`, borderRadius: 14, padding: '12px 14px' }}
                                        >
                                            <PersonIcon color={c.solid} size={52} emp={d.leaders.length === 1 ? d.leaders[0] : undefined} />
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: names.length > 1 ? 17 : 16, fontWeight: 900, color: '#0F2A5C', lineHeight: 1.2, wordBreak: 'break-word' }}>
                                                    {names.length ? (
                                                        names.map((n, i) => (
                                                            <React.Fragment key={n + i}>
                                                                {i > 0 && <span style={{ color: c.solid, margin: '0 5px' }}>/</span>}
                                                                {n}
                                                            </React.Fragment>
                                                        ))
                                                    ) : (
                                                        <span style={{ color: '#94A3B8', fontSize: 13 }}>未设定负责人</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginTop: 3 }}>{d.def.nameEn}</div>
                                                <div style={{ fontSize: 13.5, fontWeight: 900, color: '#1E293B' }}>{d.def.nameZh}</div>
                                            </div>
                                        </div>,
                                        c,
                                    );
                                    })();
                                    return <React.Fragment key={d.def.id}>{box}</React.Fragment>;
                                })}
                            </div>
                        </div>
                    </div>

                    {/* 3. 部门面板（板块下面） */}
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: DIV_GAP, alignItems: 'start', padding: '0 16px', marginTop: 18 }}>
                        {allDivs.map(d => {
                            if (d.depts.length === 0 && d.heads.length === 0) return <div key={d.def.id} />;
                            const c = DIVISION_COLORS[d.def.panelColor || d.def.color];
                            return (
                                <div key={d.def.id} data-org-node={`panel-${d.def.id}`} style={{ border: `2px solid ${c.border}`, borderRadius: 16, background: c.bg, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <DeptBar title={d.def.nameZh} en={d.def.nameEn} emoji={d.depts.length === 1 ? DEPT_META[d.depts[0].key]?.emoji || '🏢' : '🏢'} c={c} big />
                                    {d.heads.map(h => (
                                        <React.Fragment key={h.id}>{withAssist(`emp:${h.id}`, <HeadCard e={h} c={c} />, c)}</React.Fragment>
                                    ))}
                                    {d.depts.map(g => (
                                        <div key={g.key} style={{ background: '#FFFFFF', border: `1.5px solid ${c.border}`, borderRadius: 12, padding: 6 }}>
                                            <DeptBar title={g.zh} en={g.en} emoji={g.emoji} count={g.staff.length} c={c} />
                                            <div style={{ marginTop: 4 }}>
                                                {g.staff.map(s => (
                                                    <StaffRow key={s.id} e={s} c={c} />
                                                ))}
                                                {g.staff.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 700, textAlign: 'center', padding: 8 }}>暂无员工</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );

    // ---- 按 Group ----
    const groupPanel = (g: ShiftGroupKey) => {
        const m = SHIFT_GROUP_META[g];
        const list = groupable.filter(e => shiftGroupOf(e) === g);
        const n = g === 'B' ? '2' : '';
        const s: any = shiftSettings;
        const weekend = fmtShift(s[`weekendCheckIn${n}`], s[`weekendCheckOut${n}`], s[`enableWeekendBreak${n}`], s[`weekendBreakStart${n}`], s[`weekendBreakEnd${n}`]);
        const weekday = fmtShift(s[`weekdayCheckIn${n}`], s[`weekdayCheckOut${n}`], s[`enableWeekdayBreak${n}`], s[`weekdayBreakStart${n}`], s[`weekdayBreakEnd${n}`]);
        const keyOf = (e: Employee) => (resolveTier(e) === 'MANAGEMENT' ? 'MANAGER' : deptOf(e));
        const order = ['MANAGER', 'KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER', 'OWNER', 'UNASSIGNED'];
        const rank = (k: string) => (order.indexOf(k) === -1 ? 99 : order.indexOf(k));
        const keys = Array.from(new Set(list.map(keyOf))).sort((a, b) => rank(a) - rank(b));
        return (
            <div key={g} style={{ width: g === 'NONE' ? 310 : 430, border: `2px solid ${m.border}`, borderRadius: 18, overflow: 'hidden', background: '#FFFFFF' }}>
                <div style={{ background: m.solid, color: '#FFFFFF', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 22, fontWeight: 900 }}>{m.label}</span>
                        <span style={{ fontSize: 16, fontWeight: 900 }}>{list.length} 人</span>
                    </div>
                    {g !== 'NONE' ? (
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 5, lineHeight: 1.55 }}>
                            周末　{weekend}
                            <br />
                            平日　{weekday}
                        </div>
                    ) : (
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 5 }}>还没分组 · 考勤暂按 Group A 时间计算</div>
                    )}
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {list.length === 0 && <div style={{ fontSize: 13, color: '#A8A29E', fontWeight: 700, textAlign: 'center', padding: 12 }}>还没有人</div>}
                    {keys.map(k => {
                        const meta = k === 'MANAGER' ? { zh: '管理层', en: 'Management', emoji: '👔' } : DEPT_META[k] || { zh: k, en: '', emoji: '•' };
                        const people = list.filter(e => keyOf(e) === k);
                        return (
                            <div key={k}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 900, color: INK, margin: '0 2px 6px', borderBottom: '1px solid #F5F5F4', paddingBottom: 4 }}>
                                    <span>
                                        {meta.emoji} {meta.zh} <span style={{ color: '#A8A29E', fontWeight: 700 }}>{meta.en}</span>
                                    </span>
                                    <span style={{ color: MUTED }}>{people.length} 人</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: g === 'NONE' || assignMode ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                                    {people.map(e => (
                                        <PersonCard key={e.id} {...cardProps(e)} showGroup={false} tone={k === 'MANAGER' ? 'mgmt' : 'normal'} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const groupView = (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', justifyContent: 'center' }}>
            {groupPanel('A')}
            {groupPanel('B')}
            {counts.NONE > 0 && groupPanel('NONE')}
        </div>
    );

    const legend = (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', marginTop: 24, fontSize: 11, fontWeight: 700, color: '#A8A29E' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <GroupBadge g="A" /> Group A
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <GroupBadge g="B" /> Group B
            </span>
            {view === 'DEPT' && <span>左边圆圈 = 工号 · 板块负责人在「编辑管理层」设定 · 部门主管 / 员工跟着员工档案</span>}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 font-sans">
            {/* Header */}
            <div className="shrink-0 bg-stone-950 px-3 md:px-6 py-2.5 shadow-xl z-20 flex flex-wrap items-center gap-2 justify-between" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onClose}
                        style={{ touchAction: 'manipulation' }}
                        className="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-white border border-white/10 shrink-0"
                        aria-label="Back"
                    >
                        <ArrowLeft size={20} strokeWidth={2.5} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-white font-black text-sm tracking-wide truncate">组织架构图</h2>
                        <p className="text-stone-400 text-[10px] font-bold truncate">BOD → 管理层 → 部门 → 员工 · 资料来自员工档案</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-white/10 rounded-xl p-1">
                        <button onClick={() => setView('DEPT')} className={`px-3 min-h-[40px] rounded-lg text-xs font-black flex items-center gap-1.5 ${view === 'DEPT' ? 'bg-white text-stone-950' : 'text-stone-300'}`}>
                            <LayoutGrid size={14} /> 组织架构
                        </button>
                        <button onClick={() => setView('GROUP')} className={`px-3 min-h-[40px] rounded-lg text-xs font-black flex items-center gap-1.5 ${view === 'GROUP' ? 'bg-white text-stone-950' : 'text-stone-300'}`}>
                            <Users size={14} /> 按 Group
                        </button>
                    </div>
                    {view === 'DEPT' && (
                        <button
                            onClick={() => setShowDivisionEditor(true)}
                            className="px-3 min-h-[44px] rounded-xl text-xs font-black flex items-center gap-1.5 border bg-white/10 text-white border-white/10"
                        >
                            ✏️ 编辑管理层
                        </button>
                    )}
                    {view === 'DEPT' && (
                        <button
                            onClick={() => {
                                setEditMode(v => !v);
                                setPicked(null);
                                setLinkFrom(null);
                                setEditingLinkId(null);
                                setAssistFor(null);
                                setAssignMode(false);
                            }}
                            className={`px-3 min-h-[44px] rounded-xl text-xs font-black flex items-center gap-1.5 border ${
                                editMode ? 'bg-[#FFD200] text-stone-950 border-[#FFD200]' : 'bg-white/10 text-white border-white/10'
                            }`}
                        >
                            {editMode ? <Check size={14} /> : <SlidersHorizontal size={14} />} {editMode ? '调整完成' : '自由调整'}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setAssignMode(v => !v);
                            setEditMode(false);
                            setPicked(null);
                            setLinkFrom(null);
                        }}
                        className={`px-3 min-h-[44px] rounded-xl text-xs font-black flex items-center gap-1.5 border ${
                            assignMode ? 'bg-[#FFD200] text-stone-950 border-[#FFD200]' : 'bg-white/10 text-white border-white/10'
                        }`}
                    >
                        {assignMode ? <Check size={14} /> : <span>A/B</span>} {assignMode ? '分组完成' : '分组'}
                    </button>
                    <div className="flex items-center bg-white/10 rounded-xl p-1">
                        <button onClick={() => setScale(s => Math.max(0.3, +(s - 0.1).toFixed(2)))} className="w-9 h-9 flex items-center justify-center text-stone-300 hover:text-white rounded-lg" aria-label="缩小">
                            <ZoomOut size={16} />
                        </button>
                        <button onClick={() => setScale(1)} className="w-9 h-9 flex items-center justify-center text-stone-300 hover:text-white rounded-lg" aria-label="原尺寸">
                            <Maximize2 size={16} />
                        </button>
                        <button onClick={() => setScale(s => Math.min(2, +(s + 0.1).toFixed(2)))} className="w-9 h-9 flex items-center justify-center text-stone-300 hover:text-white rounded-lg" aria-label="放大">
                            <ZoomIn size={16} />
                        </button>
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="min-h-[44px] px-4 rounded-xl bg-[#FFD200] text-stone-950 font-black text-xs flex items-center gap-2 hover:bg-[#ffe14d] disabled:opacity-60"
                    >
                        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {isExporting ? '导出中…' : '导出 PDF'}
                    </button>
                </div>
            </div>

            {assignMode && (
                <div className="shrink-0 bg-[#FFF8D6] border-b border-[#FFD200] px-4 py-2 text-xs font-bold text-stone-700 leading-relaxed">
                    在每个人旁边点 <b className="text-blue-700">A</b> 或 <b className="text-orange-600">B</b>，马上保存。Group A = 考勤的班次 1，Group B = 班次 2；上下班时间在「考勤 → 排班设置」改。
                </div>
            )}

            {editMode && view === 'DEPT' && (
                <div className={`shrink-0 border-b px-4 py-2 text-xs font-bold leading-relaxed flex flex-wrap items-center gap-x-3 gap-y-1.5 ${linkFrom ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
                    {linkFrom ? (
                        <>
                            <span>
                                拉线中：从 <b>{linkFrom.label}</b> 出发 → 现在点<b>终点</b>（另一个人、板块、部门或协助者）
                            </span>
                            <button onClick={() => setLinkFrom(null)} className="min-h-[36px] rounded-lg border border-amber-300 bg-white px-3 text-amber-900">
                                取消
                            </button>
                        </>
                    ) : (
                        <>
                            <span>点图上任何一个人或方块：隐藏职位、拉线、加协助者。改了马上保存，全公司看到同一份。</span>
                            <button onClick={() => setDrawerOpen(true)} className="min-h-[36px] rounded-lg border border-blue-200 bg-white px-3 flex items-center gap-1.5 text-blue-900">
                                <ListChecks size={14} /> 全部调整（{layout.links.length + layout.assistants.length + layout.hiddenPositions.length}）
                            </button>
                        </>
                    )}
                    {layoutSaving && <span className="text-stone-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 保存中…</span>}
                </div>
            )}

            {/* Canvas */}
            <div className="flex-1 overflow-auto relative bg-stone-100" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div style={{ zoom: scale } as React.CSSProperties} className="p-4 md:p-10">
                    <div style={{ display: 'flex', justifyContent: 'center', minWidth: 'max-content' }}>
                        <div ref={chartRef} id="org-chart-container" style={{ background: '#FFFFFF', borderRadius: 20, padding: 28, fontFamily: FONT, color: INK, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            {titleBlock}
                            {!loaded ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#A8A29E', fontWeight: 700 }}>载入中…</div>
                            ) : active.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#A8A29E', fontWeight: 700 }}>没有在职员工</div>
                            ) : view === 'DEPT' ? (
                                deptView
                            ) : (
                                groupView
                            )}
                            {legend}
                        </div>
                    </div>
                </div>
            </div>

            {editMode && picked && !linkFrom && (
                <NodeSheet
                    node={picked}
                    positionHidden={!!picked.empId && hiddenPos.has(picked.empId)}
                    onTogglePosition={() => picked.empId && togglePosition(picked.empId)}
                    onStartLink={() => {
                        setLinkFrom(picked);
                        setPicked(null);
                    }}
                    onAddAssistant={() => {
                        setAssistFor(picked);
                        setPicked(null);
                    }}
                    onClose={() => setPicked(null)}
                />
            )}
            {editingLink && (
                <LinkSheet
                    key={editingLink.id}
                    link={editingLink}
                    fromLabel={labelOf(editingLink.from)}
                    toLabel={labelOf(editingLink.to)}
                    onChange={patch => patchLink(editingLink.id, patch)}
                    onDelete={() => {
                        deleteLink(editingLink.id);
                        setEditingLinkId(null);
                    }}
                    onClose={() => setEditingLinkId(null)}
                />
            )}
            {assistFor && (
                <AssistantSheet
                    anchorLabel={assistFor.label}
                    employees={active}
                    exclude={[...(assistFor.empId ? [assistFor.empId] : []), ...assistantsOf(assistFor.key).map(a => a.empId)]}
                    onSave={(empId, title) => {
                        const a: OrgAssistant = { id: newLayoutId('as'), anchor: assistFor.key, empId, title };
                        updateLayout(l => ({ ...l, assistants: [...l.assistants, a] }));
                        setAssistFor(null);
                    }}
                    onClose={() => setAssistFor(null)}
                />
            )}
            {drawerOpen && (
                <LayoutDrawer
                    layout={layout}
                    labelOf={labelOf}
                    nameOf={id => empById.get(id)?.name || id}
                    onShowPosition={id => togglePosition(id)}
                    onEditLink={l => {
                        setDrawerOpen(false);
                        setEditingLinkId(l.id);
                    }}
                    onDeleteLink={deleteLink}
                    onDeleteAssistant={deleteAssistant}
                    onClose={() => setDrawerOpen(false)}
                />
            )}

            {showDivisionEditor && (
                <DivisionEditor
                    isOpen={showDivisionEditor}
                    onClose={() => setShowDivisionEditor(false)}
                    initial={divisionDefs}
                    suggested={suggested}
                    employees={active}
                    onSave={list => saveDivisionList(list)}
                />
            )}
        </div>
    );
};

export default OrgChart;
