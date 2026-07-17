import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, UserCircle2, Building2, Medal, ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { Employee, OrgLevel } from '../../types';
import { getOrgLevel } from '../../utils/orgAccess';
import { DataManager } from '../../utils/dataManager';
import html2canvas from 'html2canvas-pro';

interface OrgChartProps {
    onClose: () => void;
}

const DEPT_ORDER = ['KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER'];
const DEPT_NAMES: Record<string, string> = {
    'KITCHEN': '厨房 (Kitchen)',
    'FLOOR': '楼面 (Floor)',
    'BAR': '水吧 (Bar)',
    'DISHWASH': '洗碗 (Dishwash)',
    'BACK_OFFICE': '办公室 (Back Office)',
    'OTHER': '其他 (Other)',
};

const EmployeeCard = ({ emp, variant }: { emp: Employee, variant: string }) => {
    let bg = 'bg-white border-stone-200';
    let icon = <UserCircle2 size={18} className="text-stone-400" />;
    
    if (variant === 'OWNER') {
        bg = 'bg-[#FFD200]/10 border-[#FFD200] shadow-sm';
        icon = <Medal size={18} className="text-amber-600" />;
    } else if (variant === 'BRANCH_MANAGER') {
        bg = 'bg-blue-50 border-blue-200 shadow-sm';
        icon = <Building2 size={18} className="text-blue-600" />;
    } else if (variant === 'DEPARTMENT_HEAD') {
        bg = 'bg-stone-50 border-stone-300';
    }

    return (
        <div className={`w-full relative flex items-center gap-3 p-3.5 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md ${bg}`}>
            <div className="shrink-0 w-10 h-10 rounded-full bg-white border border-stone-100 flex items-center justify-center shadow-sm">
                {icon}
            </div>
            <div className="flex-1 min-w-0 text-left">
                <div className="font-black text-sm text-stone-900 truncate">{emp.name}</div>
                <div className="text-[11px] font-bold text-stone-500 truncate">{emp.role}</div>
            </div>
        </div>
    );
};

export const OrgChart: React.FC<OrgChartProps> = ({ onClose }) => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [scale, setScale] = useState(1);
    
    useEffect(() => {
        DataManager.getEmployees().then(setEmployees).catch(console.error);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [startY, setStartY] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - containerRef.current.offsetLeft);
        setStartY(e.pageY - containerRef.current.offsetTop);
        setScrollLeft(containerRef.current.scrollLeft);
        setScrollTop(containerRef.current.scrollTop);
    };

    const handleMouseLeave = () => setIsDragging(false);
    const handleMouseUp = () => setIsDragging(false);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !containerRef.current) return;
        e.preventDefault();
        const x = e.pageX - containerRef.current.offsetLeft;
        const y = e.pageY - containerRef.current.offsetTop;
        const walkX = (x - startX) * 1.5;
        const walkY = (y - startY) * 1.5;
        containerRef.current.scrollLeft = scrollLeft - walkX;
        containerRef.current.scrollTop = scrollTop - walkY;
    };

    const activeEmployees = useMemo(() => {
        return employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');
    }, [employees]);

    const getEmps = (level: OrgLevel, dept?: string) => {
        return activeEmployees.filter(e => {
            const l = getOrgLevel(e);
            if (l !== level) return false;
            if (dept) {
                const empDept = e.department || 'UNASSIGNED';
                return empDept === dept;
            }
            return true;
        });
    };

    const L1 = getEmps('OWNER');
    const L2 = getEmps('BRANCH_MANAGER');

    const activeDepts = useMemo(() => {
        const depts = new Set<string>();
        activeEmployees.forEach(e => {
            const l = getOrgLevel(e);
            if (l === 'DEPARTMENT_HEAD' || l === 'TEAM_LEAD' || l === 'CREW') {
                depts.add(e.department || 'UNASSIGNED');
            }
        });
        
        return Array.from(depts).sort((a, b) => {
            const idxA = DEPT_ORDER.indexOf(a);
            const idxB = DEPT_ORDER.indexOf(b);
            if (idxA === -1 && idxB === -1) return a.localeCompare(b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    }, [activeEmployees]);

    const renderDeptLevel = (dept: string, level: OrgLevel, title: string) => {
        const emps = getEmps(level, dept);
        if (emps.length === 0) return null;
        
        return (
            <div className="w-full bg-white/60 border border-stone-200/60 rounded-[1.25rem] p-2 pb-3 relative">
                <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest text-center py-2">
                    {title}
                </div>
                <div className="flex flex-col gap-2">
                    {emps.map(emp => <EmployeeCard key={emp.id} emp={emp} variant={level} />)}
                </div>
            </div>
        );
    };

    const handleExport = async () => {
        const el = document.getElementById('org-chart-container');
        if (!el) return;
        try {
            const canvas = await html2canvas(el, { backgroundColor: '#f5f5f4', scale: 2 });
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `OrgChart_${new Date().toISOString().split('T')[0]}.png`;
            a.click();
        } catch (e) {
            console.error(e);
            alert("导出失败 (Export Failed)");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 font-sans">
            <style dangerouslySetInnerHTML={{__html: `
                .org-tree { display: flex; justify-content: center; }
                .org-tree ul { padding-top: 24px; position: relative; transition: all 0.5s; display: flex; justify-content: center; margin: 0; padding-left: 0; }
                .org-tree li { flex-direction: column; align-items: center; text-align: center; list-style-type: none; position: relative; padding: 24px 8px 0 8px; display: flex; }
                .org-tree li::before, .org-tree li::after { content: ''; position: absolute; top: 0; right: 50%; border-top: 2px solid #d6d3d1; width: 50%; height: 24px; }
                .org-tree li::after { right: auto; left: 50%; border-left: 2px solid #d6d3d1; }
                .org-tree li:only-child::after, .org-tree li:only-child::before { display: none; }
                .org-tree li:only-child { padding-top: 0; }
                .org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
                .org-tree li:last-child::before { border-right: 2px solid #d6d3d1; border-radius: 0 8px 0 0; }
                .org-tree li:first-child::after { border-radius: 8px 0 0 0; }
                .org-tree ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 2px solid #d6d3d1; width: 0; height: 24px; margin-left: -1px; }
                .org-tree > ul { padding-top: 0; }
                .org-tree > ul > li { padding-top: 0; }
                .org-tree > ul::before { display: none; }
            `}} />

            {/* Header */}
            <div className="h-16 shrink-0 bg-stone-950 flex items-center justify-between px-6 shadow-xl z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors">
                        <X size={20} />
                    </button>
                    <div>
                        <h2 className="text-white font-black text-sm tracking-wide">组织架构图 (Org Chart)</h2>
                        <p className="text-stone-400 text-[10px] font-bold">自动同步人事数据</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white/10 rounded-xl p-1">
                        <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-1.5 text-stone-300 hover:text-white rounded-lg hover:bg-white/10"><ZoomOut size={16} /></button>
                        <button onClick={() => setScale(1)} className="p-1.5 text-stone-300 hover:text-white rounded-lg hover:bg-white/10"><Maximize2 size={16} /></button>
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-1.5 text-stone-300 hover:text-white rounded-lg hover:bg-white/10"><ZoomIn size={16} /></button>
                    </div>
                    <button onClick={handleExport} className="h-9 px-4 rounded-xl bg-[#FFD200] text-stone-950 font-black text-xs flex items-center gap-2 hover:bg-[#ffe14d] transition-colors">
                        <Download size={14} /> 导出
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div 
                ref={containerRef}
                className={`flex-1 overflow-auto relative bg-stone-100 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
            >
                <div className="min-w-max min-h-max p-12 lg:p-24 flex justify-center items-start origin-top" style={{ transform: `scale(${scale})` }}>
                    
                    <div id="org-chart-container" className="org-tree p-12 bg-stone-100 rounded-3xl">
                        <ul>
                            <li>
                                {/* ROOT */}
                                <div className="inline-flex flex-col gap-5 items-center z-10 relative">
                                    <div className="text-[10px] font-black text-stone-400 tracking-[0.2em] uppercase">决策层 / Executive Board</div>
                                    <div className="flex gap-4 justify-center flex-wrap w-max">
                                        {L1.length > 0 ? (
                                            L1.map(e => <div key={e.id} className="w-56"><EmployeeCard emp={e} variant="OWNER" /></div>)
                                        ) : (
                                            <div className="w-56 p-4 rounded-2xl border-2 border-dashed border-stone-300 text-stone-400 text-xs font-bold text-center">暂无决策层</div>
                                        )}
                                    </div>
                                </div>

                                {L2.length > 0 && (
                                    <div className="flex flex-col items-center mt-4">
                                        <div className="w-px h-8 bg-stone-300" />
                                        <div className="inline-flex flex-col gap-4 items-center mt-4">
                                            <div className="text-[10px] font-black text-stone-400 tracking-[0.2em] uppercase">门店管理 / Branch Management</div>
                                            <div className="flex gap-4 justify-center flex-wrap w-max">
                                                {L2.map(e => <div key={e.id} className="w-56"><EmployeeCard emp={e} variant="BRANCH_MANAGER" /></div>)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* DEPARTMENTS TREE */}
                                {activeDepts.length > 0 && (
                                    <ul>
                                        {activeDepts.map(dept => (
                                            <li key={dept}>
                                                <div className="inline-flex flex-col items-center w-[260px]">
                                                    <div className="bg-stone-900 text-white px-5 py-2.5 rounded-2xl font-black text-sm mb-6 shadow-xl shadow-stone-300/50 w-full text-center tracking-wide">
                                                        {DEPT_NAMES[dept] || dept}
                                                    </div>
                                                    
                                                    <div className="flex flex-col gap-4 w-full pb-4">
                                                        {renderDeptLevel(dept, 'DEPARTMENT_HEAD', 'L3 部门负责人')}
                                                        {renderDeptLevel(dept, 'TEAM_LEAD', 'L4 组长 / 当班负责')}
                                                        {renderDeptLevel(dept, 'CREW', 'L5 员工')}
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        </ul>
                    </div>

                </div>
            </div>
        </div>
    );
};
