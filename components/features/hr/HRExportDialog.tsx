// ==========================================
// 📤 员工名录导出
// ------------------------------------------
// 按「导出」后先选：格式(Excel/PDF) → 部门 → 在职/离职 → 要哪些栏位。
//
// ⚠️ 薪资、银行账号、EPF/SOCSO、IC 都是敏感资料，预设「不导出」。
//    勾了会跳警告，档名也会标 CONFIDENTIAL，避免随手传给不该看的人。
//
// ID 和姓名是锁定的，一定会导出（不然对不上人）。
// ==========================================

import { html2canvas, loadJsPDF } from '../../../utils/lazyLibs';
import React, { useState, useMemo, useRef } from 'react';
import {
    X, Download, Loader2, FileSpreadsheet, FileText, Lock, AlertTriangle, CheckSquare, Square, ClipboardList,
} from 'lucide-react';
import { applyResolvedStylesForPdf, waitForPdfFonts } from '../../../utils/pdfStyleResolver';
import { Employee } from '../../../types';
import { skillLevelText, picAreasText, picAverage, SKILL_LEVELS } from '../../../constants/hrSkill';

export const HR_DEPARTMENTS = [
    { id: 'OWNER', label: '老板级别 (Owner)' },
    { id: 'KITCHEN', label: '厨房 (Kitchen)' },
    { id: 'FLOOR', label: '楼面 (Floor)' },
    { id: 'BAR', label: '吧台 (Bar)' },
    { id: 'DISHWASH', label: '洗碗 (Dishwash)' },
    { id: 'BACK_OFFICE', label: '后勤 (Back Office)' },
    { id: 'OTHER', label: '其他 (Other)' },
] as const;

type FieldGroupId = 'BASIC' | 'CONTACT' | 'IDENTITY' | 'SALARY' | 'BANK' | 'STATUTORY' | 'HEALTH' | 'EXIT';

interface FieldDef {
    key: string;
    label: string;
    group: FieldGroupId;
    /** 锁定 = 一定导出，不能取消 */
    locked?: boolean;
    /** 长文字栏（副职 / PIC）：PDF 要给它宽一点，不然挤成一条线 */
    wide?: boolean;
    get: (e: Employee) => string | number;
}

const dash = (v: any) => (v === undefined || v === null || v === '' ? '-' : v);

/** 年资：几年几个月 */
const tenureOf = (joinDate?: string): string => {
    if (!joinDate) return '-';
    const d = new Date(joinDate);
    if (isNaN(d.getTime())) return '-';
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months--;
    if (months < 0) return '-';
    return `${Math.floor(months / 12)}年${months % 12}个月`;
};

export const EXPORT_FIELDS: FieldDef[] = [
    { key: 'id',            label: '工号 (ID)',       group: 'BASIC', locked: true, get: e => e.id },
    { key: 'name',          label: '姓名 (Name)',         group: 'BASIC', locked: true, get: e => e.name },
    { key: 'role',          label: '职位 (Role)',         group: 'BASIC', get: e => dash(e.role) },
    { key: 'secondaryRoles', label: '副职 (Secondary)',  group: 'BASIC', wide: true, get: e => dash((e.secondaryRoles || []).join('、')) },
    { key: 'department',    label: '部门 (Dept)',         group: 'BASIC', get: e => dash(HR_DEPARTMENTS.find(d => d.id === e.department)?.label || e.department) },
    { key: 'status',        label: '状态 (Status)',       group: 'BASIC', get: e => dash(e.status) },
    { key: 'joinDate',      label: '入职日期 (Join)',     group: 'BASIC', get: e => dash(e.joinDate) },
    { key: 'tenure',        label: '年资 (Tenure)',       group: 'BASIC', get: e => tenureOf(e.joinDate) },
    { key: 'skillLevel',    label: '技能等级 (Skill Level)', group: 'BASIC', get: e => skillLevelText(e.skillLevel) },
    { key: 'picAreas',      label: 'PIC 负责项目',          group: 'BASIC', wide: true, get: e => picAreasText(e.picAreas) },
    { key: 'picAvg',        label: 'PIC 平均分',            group: 'BASIC', get: e => { const a = picAverage(e.picAreas); return a === null ? '-' : a.toFixed(1); } },
    { key: 'specialSkills', label: '专业能力 (Special Skills)', group: 'BASIC', wide: true, get: e => dash(e.specialSkills) },

    { key: 'phone',         label: '电话 (Phone)',        group: 'CONTACT', get: e => dash(e.phone) },
    { key: 'address',       label: '地址 (Address)',      group: 'CONTACT', get: e => dash(e.address) },
    { key: 'emergencyName', label: '紧急联络人',           group: 'CONTACT', get: e => dash(e.emergencyName) },
    { key: 'emergencyPhone',label: '紧急联络电话',          group: 'CONTACT', get: e => dash(e.emergencyPhone) },

    { key: 'icNumber',      label: 'IC / 护照',            group: 'IDENTITY', get: e => dash(e.icNumber || e.passportNo) },
    { key: 'nationality',   label: '国籍 (Nationality)',   group: 'IDENTITY', get: e => dash(e.nationality) },
    { key: 'gender',        label: '性别 (Gender)',        group: 'IDENTITY', get: e => dash(e.gender) },
    { key: 'dateOfBirth',   label: '出生日期 (DOB)',       group: 'IDENTITY', get: e => dash(e.dateOfBirth) },
    { key: 'workPermitNo',  label: '工作准证号',            group: 'IDENTITY', get: e => dash(e.workPermitNo) },
    { key: 'workPermitExpiry', label: '准证到期',           group: 'IDENTITY', get: e => dash(e.workPermitExpiry) },

    { key: 'basicSalary',   label: '底薪 (Basic Salary)',  group: 'SALARY', get: e => Number(e.basicSalary || 0) },
    { key: 'salaryMode',    label: '薪资模式',              group: 'SALARY', get: e => dash(e.salaryMode) },
    { key: 'monthlyRestDays', label: '每月休息日',           group: 'SALARY', get: e => dash(e.monthlyRestDays) },
    { key: 'hasHostel',     label: '有宿舍',                group: 'SALARY', get: e => (e.hasHostel ? '是' : '否') },

    { key: 'bankName',      label: '银行 (Bank)',          group: 'BANK', get: e => dash(e.bankName) },
    { key: 'bankAccount',   label: '银行账号',              group: 'BANK', get: e => dash(e.bankAccount) },

    { key: 'epfNo',         label: 'EPF No',               group: 'STATUTORY', get: e => dash(e.epfNo) },
    { key: 'socsoNo',       label: 'SOCSO No',             group: 'STATUTORY', get: e => dash(e.socsoNo) },
    { key: 'eisNo',         label: 'EIS No',               group: 'STATUTORY', get: e => dash(e.eisNo) },

    { key: 'typhoidExpiry', label: '伤寒针到期',            group: 'HEALTH', get: e => dash(e.typhoidExpiry) },
    { key: 'foodHandlingDate', label: '食物处理课程',        group: 'HEALTH', get: e => dash(e.foodHandlingDate) },

    { key: 'terminationDate', label: '离职日期',            group: 'EXIT', get: e => dash(e.terminationDate) },
    { key: 'terminationReason', label: '离职原因',          group: 'EXIT', get: e => dash(e.terminationReason) },
];

const GROUP_META: { id: FieldGroupId; label: string; sensitive?: boolean }[] = [
    { id: 'BASIC',     label: '基本资料' },
    { id: 'CONTACT',   label: '联络方式' },
    { id: 'IDENTITY',  label: '身份证件', sensitive: true },
    { id: 'SALARY',    label: '薪资', sensitive: true },
    { id: 'BANK',      label: '银行账户', sensitive: true },
    { id: 'STATUTORY', label: '法定号码 (EPF/SOCSO/EIS)', sensitive: true },
    { id: 'HEALTH',    label: '健康证明 (Typhoid / Food Handling)' },
    { id: 'EXIT',      label: '离职资料' },
];

const SENSITIVE_GROUPS: FieldGroupId[] = ['IDENTITY', 'SALARY', 'BANK', 'STATUTORY'];

/** 预设勾选：基本资料全开、电话开，敏感的一律关 */
const DEFAULT_KEYS = new Set([
    'id', 'name', 'role', 'secondaryRoles', 'department', 'status', 'joinDate', 'tenure', 'phone',
]);

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employees: Employee[];
}

export const HRExportDialog: React.FC<Props> = ({ isOpen, onClose, employees }) => {
    const [format, setFormat] = useState<'EXCEL' | 'PDF' | 'SKILL_FORM'>('EXCEL');
    const [depts, setDepts] = useState<string[]>(HR_DEPARTMENTS.map(d => d.id));
    const [scope, setScope] = useState<'ACTIVE' | 'RESIGNED' | 'ALL'>('ACTIVE');
    const [keys, setKeys] = useState<Set<string>>(new Set(DEFAULT_KEYS));
    const [busy, setBusy] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const deptOf = (e: Employee) => (e.department && HR_DEPARTMENTS.some(d => d.id === e.department) ? e.department : 'OTHER');

    const rowsData = useMemo(() => {
        return employees
            .filter(e => (scope === 'ALL' ? true : scope === 'ACTIVE' ? !e.isArchived : !!e.isArchived))
            .filter(e => depts.includes(deptOf(e)))
            .sort((a, b) => {
                const da = HR_DEPARTMENTS.findIndex(d => d.id === deptOf(a));
                const db = HR_DEPARTMENTS.findIndex(d => d.id === deptOf(b));
                if (da !== db) return da - db;
                return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
            });
    }, [employees, scope, depts]);

    const selectedFields = useMemo(
        () => EXPORT_FIELDS.filter(f => f.locked || keys.has(f.key)),
        [keys]
    );

    const hasSensitive = useMemo(
        () => selectedFields.some(f => SENSITIVE_GROUPS.includes(f.group)),
        [selectedFields]
    );

    // 📐 版面重量：长文字栏（副职 / PIC 负责项目）算两栏，
    //    不然 8 栏里塞了两条长句子，直版 PDF 会挤成一条线看不清。
    const layoutWeight = useMemo(
        () => selectedFields.length + selectedFields.filter(f => f.wide).length,
        [selectedFields]
    );
    // 📝 技能评定表：固定 5 栏的空白列印表，不吃上面的栏位勾选，一律直版
    const isSkillForm = format === 'SKILL_FORM';
    const isLandscape = !isSkillForm && layoutWeight > 7;

    /**
     * 技能评定表用：按部门分组（沿用上面已排好序的 rowsData）。
     * 每个部门是一个「不可拆的块」，所以块不能比一张 A4 还高 ——
     * 超过 SKILL_ROWS_PER_BLOCK 人就自动拆成「(续 2/2)」，表头会重印一次。
     * A4 直版可用高度约 1040px，一行约 33px，18 行 ≈ 640px，安全。
     */
    const skillFormGroups = useMemo(() => {
        const SKILL_ROWS_PER_BLOCK = 18;
        const out: { key: string; label: string; rows: Employee[]; withBlanks: boolean }[] = [];
        HR_DEPARTMENTS.forEach(d => {
            const all = rowsData.filter(e => deptOf(e) === d.id);
            if (all.length === 0) return;
            const parts = Math.ceil(all.length / SKILL_ROWS_PER_BLOCK);
            for (let i = 0; i < parts; i++) {
                out.push({
                    key: `${d.id}_${i}`,
                    label: parts > 1 ? `${d.label}（续 ${i + 1}/${parts}）` : d.label,
                    rows: all.slice(i * SKILL_ROWS_PER_BLOCK, (i + 1) * SKILL_ROWS_PER_BLOCK),
                    withBlanks: i === parts - 1,   // 空白行只加在最后一段
                });
            }
        });
        return out;
    }, [rowsData]);

    const deptCount = useMemo(() => {
        const m: Record<string, number> = {};
        employees
            .filter(e => (scope === 'ALL' ? true : scope === 'ACTIVE' ? !e.isArchived : !!e.isArchived))
            .forEach(e => { const d = deptOf(e); m[d] = (m[d] || 0) + 1; });
        return m;
    }, [employees, scope]);

    if (!isOpen) return null;

    const toggleKey = (k: string) => setKeys(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    const toggleGroup = (g: FieldGroupId) => {
        const groupKeys = EXPORT_FIELDS.filter(f => f.group === g && !f.locked).map(f => f.key);
        const allOn = groupKeys.every(k => keys.has(k));
        setKeys(prev => {
            const next = new Set(prev);
            groupKeys.forEach(k => (allOn ? next.delete(k) : next.add(k)));
            return next;
        });
    };

    const fileStamp = () => {
        const d = new Date().toISOString().split('T')[0];
        if (isSkillForm) return `Employee_Skill_Level_Form_${d}`;
        return `Staff_Directory_${d}${hasSensitive ? '_CONFIDENTIAL' : ''}`;
    };

    const guard = (): boolean => {
        if (rowsData.length === 0) { alert('⚠️ 这些条件下没有员工，请先调整部门或在职/离职筛选。'); return false; }
        if (!isSkillForm && hasSensitive && !confirm('这次导出包含敏感资料（薪资 / 银行 / IC / 法定号码）。\n档名会标上 CONFIDENTIAL。确定继续？')) return false;
        return true;
    };

    // ---------- Excel ----------
    const exportExcel = async () => {
        if (!guard()) return;
        setBusy(true);
        try {
            const ExcelJS = await import('exceljs');
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('员工名录');

            ws.addRow(selectedFields.map(f => f.label));
            const head = ws.getRow(1);
            head.font = { bold: true, color: { argb: 'FF111111' } };
            head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD200' } };
            head.alignment = { vertical: 'middle' };
            head.height = 22;

            rowsData.forEach(e => ws.addRow(selectedFields.map(f => f.get(e))));

            selectedFields.forEach((f, i) => {
                const col = ws.getColumn(i + 1);
                const maxLen = Math.max(
                    String(f.label).length,
                    ...rowsData.map(e => String(f.get(e)).length)
                );
                col.width = Math.min(40, Math.max(10, maxLen + 4));
                if (f.key === 'basicSalary') col.numFmt = '#,##0.00';
            });
            ws.views = [{ state: 'frozen', ySplit: 1 }];
            ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: selectedFields.length } };

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileStamp()}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            onClose();
        } catch (err: any) {
            console.error('Excel 导出失败', err);
            alert(`❌ Excel 导出失败：${err?.message || '未知错误'}`);
        } finally {
            setBusy(false);
        }
    };

    // ---------- PDF ----------
    const exportPdf = async () => {
        if (!guard()) return;
        setBusy(true);
        try {
            await new Promise(r => setTimeout(r, 120));
            await waitForPdfFonts();
            const containerEl = printRef.current;
            if (!containerEl) throw new Error('找不到列印区块');

            const containerTop = containerEl.getBoundingClientRect().top;
            const atomicTops = Array.from(containerEl.querySelectorAll('[data-pdf-atomic="true"]'))
                .map(el => el.getBoundingClientRect().top - containerTop)
                .sort((a, b) => a - b);

            const canvas = await html2canvas(containerEl, {
                scale: 2, useCORS: true, backgroundColor: '#ffffff',
                onclone: clonedDoc => {
                    const cloned = clonedDoc.getElementById('hr-export-print-root');
                    if (cloned) applyResolvedStylesForPdf(containerEl, cloned as HTMLElement);
                },
            });

            const pxScale = canvas.width / containerEl.offsetWidth;
            const cuts = atomicTops.map(t => Math.round(t * pxScale));

            // 栏位多的时候用横版，不然挤成一团（长文字栏算两栏）
            const pdf = new (await loadJsPDF())(isLandscape ? 'l' : 'p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const pageHeightPx = Math.floor((pdfHeight * canvas.width) / pdfWidth);

            let done = 0;
            let page = 0;
            while (done < canvas.height) {
                const maxCut = Math.min(done + pageHeightPx, canvas.height);
                let end = maxCut;
                if (maxCut < canvas.height) {
                    const cands = cuts.filter(p => p > done && p <= maxCut);
                    if (cands.length > 0) end = cands[cands.length - 1];
                    if (end <= done) end = maxCut;
                }
                const h = end - done;
                const pc = document.createElement('canvas');
                pc.width = canvas.width;
                pc.height = h;
                const ctx = pc.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, pc.width, pc.height);
                    ctx.drawImage(canvas, 0, done, canvas.width, h, 0, 0, canvas.width, h);
                }
                if (page > 0) pdf.addPage();
                pdf.addImage(pc.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pdfWidth, (h * pdfWidth) / canvas.width);
                done = end;
                page++;
            }
            pdf.save(`${fileStamp()}.pdf`);
            onClose();
        } catch (err: any) {
            console.error('PDF 导出失败', err);
            alert(`❌ PDF 导出失败：${err?.message || '未知错误'}`);
        } finally {
            setBusy(false);
        }
    };

    const scopeLabel = scope === 'ACTIVE' ? '在职' : scope === 'RESIGNED' ? '离职' : '在职 + 离职';
    const printWidth = isLandscape ? 1123 : 794;   // A4 横版 / 直版

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-[170] flex items-end md:items-center justify-center p-0 md:p-6 backdrop-blur-sm">
                <div className="bg-white w-full md:max-w-3xl md:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">

                    <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-100 shrink-0">
                        <div>
                            <h3 className="font-black text-base text-stone-900 flex items-center gap-2">
                                <Download size={17} className="text-[#FFD200]" /> 导出员工名录
                            </h3>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                                {scopeLabel} · {depts.length} 个部门 · <b className="text-stone-800">{rowsData.length} 人</b> · {selectedFields.length} 个栏位
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><X size={18} /></button>
                    </div>

                    <div className="flex-grow overflow-auto px-4 md:px-5 py-3 space-y-4">

                        {/* 格式 */}
                        <div>
                            <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">1. 导出格式</div>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setFormat('EXCEL')}
                                    className={`h-14 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-black transition-all ${format === 'EXCEL' ? 'border-stone-900 bg-stone-900 text-[#FFD200]' : 'border-gray-200 bg-white text-gray-600'}`}>
                                    <FileSpreadsheet size={16} /> Excel (.xlsx)
                                </button>
                                <button onClick={() => setFormat('PDF')}
                                    className={`h-14 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-black transition-all ${format === 'PDF' ? 'border-stone-900 bg-stone-900 text-[#FFD200]' : 'border-gray-200 bg-white text-gray-600'}`}>
                                    <FileText size={16} /> PDF
                                </button>
                            </div>
                            <button onClick={() => setFormat('SKILL_FORM')}
                                className={`mt-2 w-full h-14 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-black transition-all ${format === 'SKILL_FORM' ? 'border-stone-900 bg-stone-900 text-[#FFD200]' : 'border-gray-200 bg-white text-gray-600'}`}>
                                <ClipboardList size={16} /> 技能评定表（空白·给员工自己填）
                            </button>
                            <p className="text-[10px] text-gray-400 font-bold mt-1">
                                {isSkillForm
                                    ? '固定版面的 A4 直版列印表：等级说明 + 按部门列出工号／姓名／岗位／副职，「目前等级」留空白让员工自己填，最后有签名栏。不吃下面的栏位勾选。'
                                    : 'Excel 可以再排序筛选；PDF 适合列印或给外部看。栏位多时 PDF 自动转横版（副职 / PIC 这类长文字栏算两栏）。'}
                            </p>
                        </div>

                        {/* 范围 */}
                        <div>
                            <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">2. 员工范围</div>
                            <div className="flex gap-1.5">
                                {([['ACTIVE', '在职'], ['RESIGNED', '离职'], ['ALL', '全部']] as const).map(([id, label]) => (
                                    <button key={id} onClick={() => setScope(id)}
                                        className={`min-h-[44px] md:min-h-0 flex-1 h-10 rounded-xl text-xs font-black transition-all ${scope === id ? 'bg-[#FFD200] text-stone-900' : 'bg-gray-100 text-gray-600'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 部门 */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="text-[10px] font-black text-gray-400 uppercase">3. 部门</div>
                                <button onClick={() => setDepts(depts.length === HR_DEPARTMENTS.length ? [] : HR_DEPARTMENTS.map(d => d.id))}
                                    className="text-[10px] font-black text-indigo-600 min-h-[44px] md:min-h-0">
                                    {depts.length === HR_DEPARTMENTS.length ? '全部取消' : '全选'}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                                {HR_DEPARTMENTS.map(d => {
                                    const on = depts.includes(d.id);
                                    const n = deptCount[d.id] || 0;
                                    return (
                                        <button key={d.id}
                                            onClick={() => setDepts(prev => on ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                                            className={`min-h-[44px] md:min-h-0 h-10 px-2 rounded-xl border text-[11px] font-black flex items-center justify-between gap-1 transition-all ${on ? 'border-stone-900 bg-stone-50 text-stone-900' : 'border-gray-200 bg-white text-gray-400'}`}>
                                            <span className="flex items-center gap-1 truncate">
                                                {on ? <CheckSquare size={13} /> : <Square size={13} />}
                                                <span className="truncate">{d.label}</span>
                                            </span>
                                            <span className="font-mono shrink-0">{n}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 栏位 */}
                        <div className={isSkillForm ? 'hidden' : ''}>
                            <div className="text-[10px] font-black text-gray-400 uppercase mb-1.5">4. 要导出哪些内容</div>
                            <div className="space-y-2">
                                {GROUP_META.map(g => {
                                    const fields = EXPORT_FIELDS.filter(f => f.group === g.id);
                                    const selectable = fields.filter(f => !f.locked);
                                    const allOn = selectable.length > 0 && selectable.every(f => keys.has(f.key));
                                    return (
                                        <div key={g.id} className={`border rounded-xl p-2.5 ${g.sensitive ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200'}`}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[11px] font-black text-stone-800 flex items-center gap-1">
                                                    {g.label}
                                                    {g.sensitive && <span className="text-[9px] text-orange-700 bg-orange-100 border border-orange-200 px-1 rounded">敏感</span>}
                                                </span>
                                                {selectable.length > 0 && (
                                                    <button onClick={() => toggleGroup(g.id)} className="text-[10px] font-black text-indigo-600 min-h-[44px] md:min-h-0">
                                                        {allOn ? '全部取消' : '整组选'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {fields.map(f => {
                                                    const on = f.locked || keys.has(f.key);
                                                    return (
                                                        <button key={f.key}
                                                            onClick={() => !f.locked && toggleKey(f.key)}
                                                            disabled={f.locked}
                                                            className={`min-h-[44px] md:min-h-0 px-2 py-1 rounded-lg text-[10px] font-black border flex items-center gap-1 transition-all ${
                                                                f.locked ? 'bg-stone-900 text-[#FFD200] border-stone-900 cursor-not-allowed'
                                                                : on ? 'bg-white text-stone-900 border-stone-400'
                                                                : 'bg-white text-gray-300 border-gray-200'
                                                            }`}>
                                                            {f.locked && <Lock size={9} />}
                                                            {f.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {!isSkillForm && hasSensitive && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] text-red-800 font-bold flex items-start gap-1.5">
                                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                这次会导出敏感资料（薪资 / 银行 / IC / 法定号码）。档名会自动加上 CONFIDENTIAL，请注意别传错人。
                            </div>
                        )}
                    </div>

                    <div className="p-4 md:p-5 border-t border-gray-100 flex items-center gap-3 shrink-0">
                        <div className="text-[11px] text-gray-500 font-bold flex-grow">
                            {isSkillForm
                                ? <>将列印 <b className="text-stone-900">{rowsData.length}</b> 人 · {skillFormGroups.length} 张表</>
                                : <>将导出 <b className="text-stone-900">{rowsData.length}</b> 人 × {selectedFields.length} 栏</>}
                        </div>
                        <button onClick={onClose} className="h-11 px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">取消</button>
                        <button onClick={format === 'EXCEL' ? exportExcel : exportPdf} disabled={busy || rowsData.length === 0}
                            className="h-11 px-5 rounded-xl bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-2 disabled:opacity-40">
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                            导出 {format === 'EXCEL' ? 'Excel' : format === 'SKILL_FORM' ? '技能评定表' : 'PDF'}
                        </button>
                    </div>
                </div>
            </div>

            {/* 隐藏的列印区块（PDF 用） */}
            <div style={{ position: 'fixed', top: 0, left: '-99999px', zIndex: -1 }}>
                <div ref={printRef} id="hr-export-print-root"
                    style={{ width: `${printWidth}px` }}
                    className="bg-white p-10 font-sans text-black">
                    {isSkillForm ? (
                        <>
                            {/* ===== 技能评定表（空白，给员工自己填） ===== */}
                            <div data-pdf-atomic="true" className="text-center border-b-2 border-black pb-3 mb-4">
                                <h1 className="text-xl font-black tracking-widest">员工技能等级表 / Employee Skill Level</h1>
                                <p className="text-[10px] font-bold text-gray-500 mt-1">KIM LIAN KEE · {new Date().toLocaleDateString()} · {scopeLabel} {rowsData.length} 人</p>
                            </div>

                            <div data-pdf-atomic="true" className="mb-5">
                                <table className="w-full text-left border border-black" style={{ fontSize: '10px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr className="bg-black text-white">
                                            <th className="border border-black px-2 py-1 text-center" style={{ width: '10%' }}>Level</th>
                                            <th className="border border-black px-2 py-1" style={{ width: '18%' }}>中文</th>
                                            <th className="border border-black px-2 py-1" style={{ width: '24%' }}>English</th>
                                            <th className="border border-black px-2 py-1">能力说明</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SKILL_LEVELS.map(lv => (
                                            <tr key={lv.level}>
                                                <td className="border border-black px-2 py-1 text-center font-black">{lv.level}</td>
                                                <td className="border border-black px-2 py-1 font-bold">{lv.zh}</td>
                                                <td className="border border-black px-2 py-1">{lv.en}</td>
                                                <td className="border border-black px-2 py-1">{lv.desc}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-[10px] font-bold mt-2">
                                    👉 请在「目前等级」栏填上 1 / 2 / 3 / 4，填好后交回人事部。
                                    Please write your level (1–4) in the “Current Level” column and return this form to HR.
                                </p>
                            </div>

                            {skillFormGroups.map(g => (
                                // 👑 整个部门（标题 + 表格）是一个不可拆的块：
                                //    以前标题和表格各自是切页点，结果「洗碗」标题留在上一页、
                                //    表格跑去下一页。现在只能在部门之间切，不会再断开。
                                <div key={g.key} className="mb-5" data-pdf-atomic="true">
                                    <h2 className="text-sm font-black uppercase tracking-widest mb-1.5">
                                        {g.label} · {g.rows.length} 人
                                    </h2>
                                    <table className="w-full text-left border-2 border-black" style={{ fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border border-black px-2 py-1.5 font-black text-center" style={{ width: '12%' }}>员工工号</th>
                                                <th className="border border-black px-2 py-1.5 font-black" style={{ width: '28%' }}>员工姓名 / Name</th>
                                                <th className="border border-black px-2 py-1.5 font-black" style={{ width: '22%' }}>岗位 / Position</th>
                                                <th className="border border-black px-2 py-1.5 font-black" style={{ width: '22%' }}>副职 / Secondary</th>
                                                <th className="border border-black px-2 py-1.5 font-black text-center" style={{ width: '16%' }}>目前等级<br/>Current Level</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {g.rows.map(e => (
                                                <tr key={e.id}>
                                                    <td className="border border-black px-2 py-2 text-center font-mono">{e.id}</td>
                                                    <td className="border border-black px-2 py-2 font-bold" style={{ wordBreak: 'break-word' }}>{e.name}</td>
                                                    <td className="border border-black px-2 py-2" style={{ wordBreak: 'break-word' }}>{e.role || ''}</td>
                                                    <td className="border border-black px-2 py-2" style={{ wordBreak: 'break-word' }}>{(e.secondaryRoles || []).join('、')}</td>
                                                    <td className="border border-black px-2 py-2">&nbsp;</td>
                                                </tr>
                                            ))}
                                            {/* 留 3 行空白给新人 / 临时工手写（只加在部门的最后一段） */}
                                            {g.withBlanks && [0, 1, 2].map(n => (
                                                <tr key={`blank_${n}`}>
                                                    <td className="border border-black px-2 py-2">&nbsp;</td>
                                                    <td className="border border-black px-2 py-2">&nbsp;</td>
                                                    <td className="border border-black px-2 py-2">&nbsp;</td>
                                                    <td className="border border-black px-2 py-2">&nbsp;</td>
                                                    <td className="border border-black px-2 py-2">&nbsp;</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}

                            <div data-pdf-atomic="true" className="pt-8 flex justify-between gap-8" style={{ fontSize: '11px' }}>
                                <div className="flex-1">
                                    <div className="border-b border-black h-8"></div>
                                    <p className="font-bold mt-1">员工签名 / Employee Signature</p>
                                </div>
                                <div className="flex-1">
                                    <div className="border-b border-black h-8"></div>
                                    <p className="font-bold mt-1">日期 / Date</p>
                                </div>
                                <div className="flex-1">
                                    <div className="border-b border-black h-8"></div>
                                    <p className="font-bold mt-1">主管确认 / Supervisor</p>
                                </div>
                            </div>
                            <div data-pdf-atomic="true" className="pt-6 text-center">
                                <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-300">Kim Lian Kee · Internal Use Only</p>
                            </div>
                        </>
                    ) : (
                    <>
                        <div data-pdf-atomic="true" className="border-b-2 border-black pb-4 mb-5 flex justify-between items-end">
                            <div>
                                <h1 className="text-2xl font-black uppercase tracking-widest mb-1">Kim Lian Kee</h1>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em]">Employee Directory</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-gray-400">{new Date().toLocaleDateString()}</p>
                                <p className="text-xs font-black">{scopeLabel} · {rowsData.length} 人</p>
                                <p className="text-[9px] font-bold text-gray-400">
                                    {depts.length === HR_DEPARTMENTS.length ? '全部部门' : HR_DEPARTMENTS.filter(d => depts.includes(d.id)).map(d => d.label.split(' ')[0]).join('、')}
                                </p>
                            </div>
                        </div>

                        {hasSensitive && (
                            <div data-pdf-atomic="true" className="mb-3 border border-red-300 bg-red-50 px-3 py-1.5 text-[10px] font-black text-red-800 uppercase tracking-widest">
                                Confidential — contains salary / bank / identity data
                            </div>
                        )}

                        <table className="w-full text-left" style={{ fontSize: layoutWeight > 9 ? '9px' : '11px', tableLayout: 'fixed' }}>
                            <thead>
                                <tr data-pdf-atomic="true" className="border-b-2 border-black">
                                    {selectedFields.map(f => (
                                        <th key={f.key} className="py-1.5 pr-2 uppercase font-black align-bottom"
                                            style={{ width: `${(f.wide ? 2 : 1) / layoutWeight * 100}%`, wordBreak: 'break-word' }}>
                                            {f.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rowsData.map(e => (
                                    <tr key={e.id} data-pdf-atomic="true" className="border-b border-gray-100">
                                        {selectedFields.map(f => (
                                            <td key={f.key} className={`py-2 pr-2 align-top ${f.key === 'id' || f.key === 'basicSalary' ? 'font-mono' : ''} ${f.key === 'name' ? 'font-bold' : 'text-gray-700'}`}
                                                style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                                {f.key === 'basicSalary' ? `RM ${Number(e.basicSalary || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : String(f.get(e))}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div data-pdf-atomic="true" className="pt-8 pb-2 text-center">
                            <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-gray-300">Confidential • Internal Use Only</p>
                        </div>
                    </>
                    )}
                </div>
            </div>
        </>
    );
};

export default HRExportDialog;
