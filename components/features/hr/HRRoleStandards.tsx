import React, { useState, useCallback, useMemo } from 'react';
import {
    Briefcase, BookOpen, Sparkles, AlertOctagon, Save, RotateCcw, ChevronRight,
    ClipboardList, Sun, Moon, Plus, ArrowLeft, X, ChevronDown, User,
} from 'lucide-react';
import { RoleDefinition, RoleGuide, Employee, SOPItem } from '../../../types';
import { DEFAULT_ROLE_GUIDES, ROLE_SOP_DETAILS } from '../../constants';
import { mapRoleToCode } from '../../utils';
import { DataManager } from '../../../utils/dataManager';

// iOS 通用样式
const noTap: React.CSSProperties = { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

interface HRRoleStandardsProps {
    roleDefinitions: RoleDefinition[];
    roleGuides: Record<string, RoleGuide>;
    roleSops: Record<string, any>;
    employees: Employee[];
    onSave: (guides: Record<string, RoleGuide>, sops: Record<string, any>) => void;
}

type SelectionType = 'ROLE' | 'EMPLOYEE';

// Fix #3: getEmployeeMatches 移至组件外 — 避免每次 render 重建
const getEmployeeMatches = (employees: Employee[], roleTitle: string): Employee[] =>
    employees.filter(e => !e.isArchived && e.role === roleTitle);

// Fix #1: 自定义确认弹窗，替代 confirm()
interface ConfirmModalState {
    open: boolean;
    title: string;
    body: string;
    onConfirm: () => void;
}

export const HRRoleStandards: React.FC<HRRoleStandardsProps> = ({
    roleDefinitions, roleGuides, roleSops, employees, onSave,
}) => {
    const [selectedId,      setSelectedId]      = useState<string | null>(null);
    const [selectionType,   setSelectionType]   = useState<SelectionType>('ROLE');
    const [expandedRoles,   setExpandedRoles]   = useState<Record<string, boolean>>({});
    const [draftGuide,      setDraftGuide]      = useState<RoleGuide | null>(null);
    const [draftSop,        setDraftSop]        = useState<any>(null);
    const [isSaving,        setIsSaving]        = useState(false);
    // Fix #1: 自定义确认弹窗状态
    const [confirmModal,    setConfirmModal]    = useState<ConfirmModalState>({
        open: false, title: '', body: '', onConfirm: () => {},
    });

    const selectedRoleDef   = selectionType === 'ROLE'     ? roleDefinitions.find(r => r.id === selectedId)  : null;
    const selectedEmployee  = selectionType === 'EMPLOYEE' ? employees.find(e => e.id === selectedId)        : null;

    const toggleRoleExpand = useCallback((roleId: string) => {
        setExpandedRoles(prev => ({ ...prev, [roleId]: !prev[roleId] }));
    }, []);

    const handleSelectRole = useCallback((role: RoleDefinition) => {
        setSelectedId(role.id);
        setSelectionType('ROLE');
        const guide = roleGuides[role.title] || DEFAULT_ROLE_GUIDES[role.title];
        const safeGuide = { ...guide, employeeRules: guide.employeeRules || [], salaryRange: guide.salaryRange || { min: 1800, max: 2500 } };
        const srcCode = mapRoleToCode(role.title);
        const sop = roleSops[srcCode] || { start: { title: 'Opening', tasks: [] }, end: { title: 'Closing', tasks: [] } };
        setDraftGuide(JSON.parse(JSON.stringify(safeGuide)));
        setDraftSop(JSON.parse(JSON.stringify(sop)));
    }, [roleGuides, roleSops]);

    const handleSelectEmployee = useCallback((emp: Employee, parentRole: RoleDefinition) => {
        setSelectedId(emp.id);
        setSelectionType('EMPLOYEE');
        let guide = emp.customGuide;
        let sop   = emp.customSop;
        if (!guide) guide = roleGuides[parentRole.title] || DEFAULT_ROLE_GUIDES[parentRole.title];
        if (!sop)   { const code = mapRoleToCode(parentRole.title); sop = roleSops[code] || { start: { title: 'Opening', tasks: [] }, end: { title: 'Closing', tasks: [] } }; }
        const safeGuide = { ...guide, employeeRules: guide?.employeeRules || [], salaryRange: guide?.salaryRange || { min: 0, max: 0 } };
        setDraftGuide(JSON.parse(JSON.stringify(safeGuide)));
        setDraftSop(JSON.parse(JSON.stringify(sop)));
    }, [roleGuides, roleSops]);

    // Fix #2: try-catch on all async saves
    const handleSave = useCallback(async () => {
        if (!draftGuide || !draftSop) return;
        setIsSaving(true);
        try {
            if (selectionType === 'ROLE' && selectedRoleDef) {
                const updatedGuides = { ...roleGuides, [selectedRoleDef.title]: draftGuide };
                const updatedSops   = { ...roleSops,   [mapRoleToCode(selectedRoleDef.title)]: draftSop };
                await DataManager.saveRoleConfig(updatedGuides, updatedSops);
                onSave(updatedGuides, updatedSops);
                alert(`✅ [${selectedRoleDef.title}] 全局标准已同步`);
            } else if (selectionType === 'EMPLOYEE' && selectedEmployee) {
                const updated: Employee = { ...selectedEmployee, customGuide: draftGuide, customSop: draftSop };
                await DataManager.saveEmployee(updated);
                alert(`✅ [${selectedEmployee.name}] 的个人标准已保存`);
            }
        } catch (err: any) {
            console.error('Save role config failed:', err);
            alert(`❌ 保存失败: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    }, [draftGuide, draftSop, selectionType, selectedRoleDef, selectedEmployee, roleGuides, roleSops, onSave]);

    // Fix #1: 移除 confirm()，改用自定义弹窗
    const handleResetIndividual = useCallback(() => {
        if (selectionType !== 'EMPLOYEE' || !selectedEmployee) return;
        setConfirmModal({
            open: true,
            title: '恢复通用标准?',
            body: `确定要移除 ${selectedEmployee.name} 的个人定制，恢复为职位通用标准吗？`,
            onConfirm: async () => {
                setConfirmModal(c => ({ ...c, open: false }));
                setIsSaving(true);
                try {
                    const updated: Employee = { ...selectedEmployee, customGuide: undefined, customSop: undefined };
                    await DataManager.saveEmployee(updated);
                    const parentRole = roleDefinitions.find(r => r.title === selectedEmployee.role);
                    if (parentRole) handleSelectEmployee(updated, parentRole);
                    alert('✅ 已恢复为通用标准');
                } catch (err: any) {
                    alert(`❌ 重置失败: ${err.message || 'Unknown error'}`);
                } finally {
                    setIsSaving(false);
                }
            },
        });
    }, [selectionType, selectedEmployee, roleDefinitions, handleSelectEmployee]);

    const handleResetGlobal = useCallback(() => {
        setConfirmModal({
            open: true,
            title: '重置全局标准?',
            body: '确定要重置所有职位标准吗？注意：这不会影响已设置个人标准的员工。',
            onConfirm: async () => {
                setConfirmModal(c => ({ ...c, open: false }));
                setIsSaving(true);
                try {
                    await DataManager.saveRoleConfig(DEFAULT_ROLE_GUIDES, ROLE_SOP_DETAILS);
                    onSave(DEFAULT_ROLE_GUIDES, ROLE_SOP_DETAILS);
                    setSelectedId(null);
                    alert('✅ 全局标准已重置');
                } catch (err: any) {
                    alert(`❌ 重置失败: ${err.message || 'Unknown error'}`);
                } finally {
                    setIsSaving(false);
                }
            },
        });
    }, [onSave]);

    // Fix #4: useCallback 包裹所有 task handlers
    const addTask = useCallback((type: 'start' | 'end') => {
        setDraftSop((prev: any) => ({
            ...prev,
            [type]: { ...prev[type], tasks: [...(prev[type]?.tasks || []), { label: '', standard: '', why: '' }] },
        }));
    }, []);

    const removeTask = useCallback((type: 'start' | 'end', index: number) => {
        setDraftSop((prev: any) => {
            const tasks = [...prev[type].tasks];
            tasks.splice(index, 1);
            return { ...prev, [type]: { ...prev[type], tasks } };
        });
    }, []);

    const updateTask = useCallback((type: 'start' | 'end', index: number, field: string, val: string) => {
        setDraftSop((prev: any) => {
            const tasks = [...prev[type].tasks];
            tasks[index] = { ...tasks[index], [field]: val };
            return { ...prev, [type]: { ...prev[type], tasks } };
        });
    }, []);

    return (
        <div className="flex h-full w-full overflow-hidden bg-gray-50 flex-col md:flex-row min-h-0">

            {/* Sidebar */}
            <div className={`w-full md:w-80 bg-white border-r flex-col shrink-0 h-full min-h-0 ${selectedId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b flex justify-between items-center bg-white shrink-0">
                    <div>
                        <h3 className="font-black text-sm text-[#1A1A1A] uppercase tracking-widest">职位标准</h3>
                        <p className="text-[10px] text-gray-400 font-bold">可针对个人单独设置</p>
                    </div>
                    {/* iOS: 扩大热区 */}
                    <button
                        style={noTap}
                        onClick={handleResetGlobal}
                        disabled={isSaving}
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 active:text-red-700 transition-colors rounded-full hover:bg-red-50 select-none"
                        title="重置全局"
                    >
                        <RotateCcw size={16} />
                    </button>
                </div>

                <div
                    className="flex-grow overflow-y-auto p-2 space-y-2"
                    style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom, 0px))', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                >
                    {roleDefinitions.map(role => {
                        const roleStaff  = getEmployeeMatches(employees, role.title);
                        const isExpanded = expandedRoles[role.id];
                        const isSelRole  = selectionType === 'ROLE' && selectedId === role.id;

                        return (
                            <div key={role.id} className="space-y-1">
                                <div className="flex items-center gap-1">
                                    <button
                                        style={noTap}
                                        onClick={() => toggleRoleExpand(role.id)}
                                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-black active:text-black rounded select-none"
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    <button
                                        style={noTap}
                                        onClick={() => handleSelectRole(role)}
                                        className={`flex-grow text-left p-3 min-h-[44px] rounded-xl border transition-all active:scale-[0.97] select-none ${isSelRole ? 'border-[#8B0000] bg-[#FFF5F5] text-[#8B0000] shadow-sm' : 'border-transparent hover:bg-gray-50 bg-white'}`}
                                    >
                                        <div className="font-black text-xs flex items-center justify-between">
                                            <span className="flex items-center gap-2"><Briefcase size={14} /> {role.title}</span>
                                            {roleStaff.length > 0 && (
                                                <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px]">{roleStaff.length}</span>
                                            )}
                                        </div>
                                    </button>
                                </div>

                                {isExpanded && roleStaff.length > 0 && (
                                    <div className="pl-8 space-y-1 border-l-2 border-gray-100 ml-4">
                                        {roleStaff.map(emp => {
                                            const isSelEmp  = selectionType === 'EMPLOYEE' && selectedId === emp.id;
                                            const hasCustom = !!emp.customSop;
                                            return (
                                                <button
                                                    key={emp.id}
                                                    style={noTap}
                                                    onClick={() => handleSelectEmployee(emp, role)}
                                                    className={`w-full text-left p-2.5 min-h-[44px] rounded-lg text-xs font-bold flex items-center justify-between transition-colors select-none active:scale-[0.97] ${isSelEmp ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    <span className="flex items-center gap-2"><User size={12} /> {emp.name}</span>
                                                    {hasCustom && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div className={`flex-grow overflow-y-auto bg-gray-50 h-full min-h-0 ${!selectedId ? 'hidden md:block' : 'block'}`}>
                {selectedId && draftGuide && draftSop ? (
                    <div className="max-w-4xl mx-auto space-y-6"
                         style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom, 0px))' }}>

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-4 shadow-sm">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <button
                                        style={noTap}
                                        onClick={() => setSelectedId(null)}
                                        className="md:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-full select-none"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            {selectionType === 'EMPLOYEE'
                                                ? <User size={18} className="text-blue-600" />
                                                : <Briefcase size={18} className="text-[#8B0000]" />}
                                            <h2 className="text-sm md:text-xl font-black text-[#1A1A1A] truncate max-w-[200px] md:max-w-none">
                                                {selectionType === 'EMPLOYEE' ? selectedEmployee?.name : selectedRoleDef?.title}
                                            </h2>
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold ml-7">
                                            {selectionType === 'EMPLOYEE' ? '个人专属标准 (Individual)' : '职位通用标准 (Global Role)'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    {selectionType === 'EMPLOYEE' && selectedEmployee?.customSop && (
                                        <button
                                            style={noTap}
                                            onClick={handleResetIndividual}
                                            disabled={isSaving}
                                            className="flex-1 md:flex-none bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 px-4 py-2.5 min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-2 select-none disabled:opacity-50"
                                        >
                                            <RotateCcw size={14} /> 重置默认
                                        </button>
                                    )}
                                    <button
                                        style={noTap}
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="flex-1 md:flex-none bg-[#1A1A1A] text-[#FFD700] px-4 md:px-6 py-2.5 min-h-[44px] rounded-xl font-black shadow-lg flex items-center justify-center gap-2 text-xs active:scale-95 transition-transform select-none disabled:opacity-50"
                                    >
                                        <Save size={16} /> {isSaving ? '保存中...' : '保存设定'}
                                    </button>
                                </div>
                            </div>

                            {selectionType === 'EMPLOYEE' && (
                                <div className="mt-3 bg-blue-50 text-blue-800 px-3 py-2 rounded-lg text-xs font-bold border border-blue-100 flex items-center gap-2">
                                    <Sparkles size={14} /> 提示：您正在编辑该员工的个人标准。保存后将覆盖职位默认设置。
                                </div>
                            )}
                        </div>

                        <div className="px-4 space-y-6">
                            {/* 岗位职责 */}
                            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                <h3 className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-2 mb-4 tracking-widest"><BookOpen size={14} /> 岗位职责与守则</h3>
                                <textarea
                                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-xs font-bold h-24 mb-4 outline-none focus:ring-1 focus:ring-[#FFD700]/30 resize-none"
                                    value={draftGuide.description}
                                    onChange={e => setDraftGuide({ ...draftGuide, description: e.target.value })}
                                    placeholder="职责描述..."
                                />
                                <textarea
                                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-xs font-bold h-32 outline-none focus:ring-1 focus:ring-[#FFD700]/30 resize-none"
                                    value={draftGuide.employeeRules?.join('\n') || ''}
                                    onChange={e => setDraftGuide({ ...draftGuide, employeeRules: e.target.value.split('\n') })}
                                    placeholder="每行一个员工守则..."
                                />
                            </div>

                            {/* 核心价值 & 安全红线 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                    <h3 className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-2 mb-4 tracking-widest"><Sparkles size={14} /> 核心价值</h3>
                                    <input
                                        className="w-full p-4 min-h-[44px] bg-gray-50 border-none rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-gray-100 transition-all"
                                        value={draftGuide.coreValue}
                                        onChange={e => setDraftGuide({ ...draftGuide, coreValue: e.target.value })}
                                    />
                                </div>
                                <div className="bg-red-50 p-6 rounded-[2rem] shadow-sm border border-red-100">
                                    <h3 className="text-[10px] font-black uppercase text-red-400 flex items-center gap-2 mb-4 tracking-widest"><AlertOctagon size={14} /> 安全红线</h3>
                                    <input
                                        className="w-full p-4 min-h-[44px] bg-white border-none rounded-2xl text-xs font-bold text-red-700 outline-none focus:ring-2 focus:ring-red-200 transition-all"
                                        value={draftGuide.safetyRedLine}
                                        onChange={e => setDraftGuide({ ...draftGuide, safetyRedLine: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* 开铺 SOP */}
                            <SopSection
                                type="start"
                                label="开铺 SOP 任务"
                                color="orange"
                                Icon={Sun}
                                tasks={draftSop.start?.tasks || []}
                                onAdd={() => addTask('start')}
                                onRemove={idx => removeTask('start', idx)}
                                onUpdate={(idx, field, val) => updateTask('start', idx, field, val)}
                            />

                            {/* 打烊 SOP */}
                            <SopSection
                                type="end"
                                label="打烊 SOP 任务"
                                color="blue"
                                Icon={Moon}
                                tasks={draftSop.end?.tasks || []}
                                onAdd={() => addTask('end')}
                                onRemove={idx => removeTask('end', idx)}
                                onUpdate={(idx, field, val) => updateTask('end', idx, field, val)}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-20">
                        <ClipboardList size={64} />
                        <p className="font-bold mt-4 uppercase tracking-widest">请选择左侧的职位或员工</p>
                    </div>
                )}
            </div>

            {/* Fix #1: 自定义确认弹窗 */}
            {confirmModal.open && (
                <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div
                        className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95"
                        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                    >
                        <h4 className="font-black text-xl text-[#1A1A1A] mb-2">{confirmModal.title}</h4>
                        <p className="text-sm text-gray-500 mb-6">{confirmModal.body}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                style={noTap}
                                onClick={() => setConfirmModal(c => ({ ...c, open: false }))}
                                className="py-3 min-h-[48px] bg-gray-100 font-bold rounded-xl text-sm active:bg-gray-200 select-none"
                            >
                                取消
                            </button>
                            <button
                                style={noTap}
                                onClick={confirmModal.onConfirm}
                                className="py-3 min-h-[48px] bg-[#8B0000] text-white font-bold rounded-xl text-sm active:bg-red-900 select-none"
                            >
                                确认
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── SopSection: 抽离为子组件减少 HRRoleStandards 的 JSX 长度 ──────────────────
interface SopSectionProps {
    type: 'start' | 'end';
    label: string;
    color: 'orange' | 'blue';
    Icon: React.ElementType;
    tasks: { label: string; standard: string; why: string }[];
    onAdd: () => void;
    onRemove: (idx: number) => void;
    onUpdate: (idx: number, field: string, val: string) => void;
}
const noTapLocal: React.CSSProperties = { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

const SopSection: React.FC<SopSectionProps> = ({ label, color, Icon, tasks, onAdd, onRemove, onUpdate }) => {
    const ring   = color === 'orange' ? 'border-orange-100' : 'border-blue-100';
    const title  = color === 'orange' ? 'text-orange-500'   : 'text-blue-500';
    const addBtn = color === 'orange' ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 active:bg-orange-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200';
    const hover  = color === 'orange' ? 'hover:border-orange-100' : 'hover:border-blue-100';

    return (
        <div className={`bg-white p-6 rounded-[2rem] border shadow-sm ${ring}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className={`text-[10px] font-black uppercase flex items-center gap-2 tracking-widest ${title}`}>
                    <Icon size={14} /> {label}
                </h3>
                <button style={noTapLocal} onClick={onAdd} className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors select-none ${addBtn}`}>
                    <Plus size={16} />
                </button>
            </div>
            <div className="space-y-3">
                {tasks.map((task, idx) => (
                    <div
                        key={idx}
                        className={`bg-gray-50 p-3 rounded-2xl grid grid-cols-1 gap-2 relative group hover:shadow-md transition-all border border-transparent ${hover}`}
                    >
                        <input
                            className="w-full bg-white p-2.5 min-h-[40px] rounded-xl text-xs font-black border-none outline-none"
                            placeholder="任务名"
                            value={task.label}
                            onChange={e => onUpdate(idx, 'label', e.target.value)}
                        />
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                className="flex-1 bg-white p-2.5 min-h-[40px] rounded-xl text-[10px] border-none outline-none"
                                placeholder="标准 (Standard)"
                                value={task.standard}
                                onChange={e => onUpdate(idx, 'standard', e.target.value)}
                            />
                            <input
                                className="flex-1 bg-white p-2.5 min-h-[40px] rounded-xl text-[10px] border-none outline-none italic"
                                placeholder="目的 (Why?)"
                                value={task.why}
                                onChange={e => onUpdate(idx, 'why', e.target.value)}
                            />
                        </div>
                        <button
                            style={noTapLocal}
                            onClick={() => onRemove(idx)}
                            className="absolute -right-2 -top-2 bg-white text-red-500 p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-full shadow-sm border opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity select-none"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
