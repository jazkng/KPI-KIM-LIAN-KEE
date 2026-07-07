// ============================================================
// 📂 components/features/RosterModule.tsx — 完整修复与进阶拓展版
// ============================================================
//
// 【新增优化清单】
// ✅ 1. 多班制功能开关 (单班制与多班制无缝热切换，面向未来拓展)
// ✅ 2. 移动端/平板 1-Tap 极速排班 (横向滑动筹码直选，彻底告别多次点击循环)
// ✅ 3. 智能工作日计算 (自动识别早/中/晚/全天均为工作日)
//
// 【保留的原始修复】
// ✅ 月份智能拉取、脏数据检测、防误关提醒、智能云端合并、PDF完美导出
// ============================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Save, FileDown, Loader2, Eraser, X, CheckSquare, Square, Printer, Calendar, User, ArrowLeft, MoreHorizontal, UserX, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
import { Employee, RosterStatus, AppModule } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';

interface RosterModuleProps {
    onClose?: () => void;
    allowedModules?: AppModule[];
}

// --- 进阶类型与常量配置 (支持多班次扩展) ---
// 使用联合类型扩展原有的 RosterStatus 以兼容多班次
export type ExtendedStatus = RosterStatus | 'MORNING' | 'AFTERNOON' | 'NIGHT';

const STATUS_CONFIG: Record<ExtendedStatus, { label: string, color: string, short: string, mobileBg: string }> = {
    // 基础单班制状态
    'WORK': { label: '上班', color: 'text-gray-900', short: '', mobileBg: 'bg-white border-gray-200' },
    'OFF': { label: '休息', color: 'bg-gray-200 text-gray-500', short: 'OFF', mobileBg: 'bg-gray-100 border-gray-300' },
    'LEAVE': { label: '事假', color: 'bg-orange-100 text-orange-700', short: 'UL', mobileBg: 'bg-orange-50 border-orange-200' },
    'MC': { label: '病假', color: 'bg-red-100 text-red-700', short: 'MC', mobileBg: 'bg-red-50 border-red-200' },
    'ANNUAL': { label: '年假', color: 'bg-blue-100 text-blue-700', short: 'AL', mobileBg: 'bg-blue-50 border-blue-200' },
    'ABSENT': { label: '缺席', color: 'bg-purple-100 text-purple-700', short: 'ABS', mobileBg: 'bg-purple-50 border-purple-200' },
    'PENDING': { label: '待定', color: 'bg-yellow-50 text-yellow-700', short: '?', mobileBg: 'bg-yellow-50 border-yellow-200' },
    'HOLIDAY': { label: '公假', color: 'bg-purple-100 text-purple-700', short: 'H', mobileBg: 'bg-purple-50 border-purple-200' },
    // 拓展多班制状态
    'MORNING': { label: '早班', color: 'bg-[#FFD700]/20 text-yellow-700', short: '早', mobileBg: 'bg-yellow-50 border-yellow-200' },
    'AFTERNOON': { label: '中班', color: 'bg-blue-100 text-blue-700', short: '中', mobileBg: 'bg-blue-50 border-blue-200' },
    'NIGHT': { label: '晚班', color: 'bg-indigo-100 text-indigo-700', short: '晚', mobileBg: 'bg-indigo-50 border-indigo-200' },
};

// 单/多班制循环数组
const SINGLE_SHIFT_ORDER: ExtendedStatus[] = ['WORK', 'OFF', 'LEAVE', 'MC', 'ANNUAL', 'HOLIDAY'];
const MULTI_SHIFT_ORDER: ExtendedStatus[] = ['MORNING', 'AFTERNOON', 'NIGHT', 'OFF', 'LEAVE', 'MC', 'ANNUAL', 'HOLIDAY'];

// 判断是否算作上班出勤 (用于统计)
const isWorkShift = (status: ExtendedStatus) => ['WORK', 'MORNING', 'AFTERNOON', 'NIGHT'].includes(status);

const DEPT_THEMES: Record<string, string> = {
    'FLOOR': 'bg-indigo-100 text-indigo-900 border-indigo-300',
    'KITCHEN': 'bg-orange-100 text-orange-900 border-orange-300',
    'BAR': 'bg-cyan-100 text-cyan-900 border-cyan-300',
    'DISH': 'bg-slate-200 text-slate-800 border-slate-300',
    'OTHERS': 'bg-gray-100 text-gray-800 border-gray-300'
};

const getMalaysianHoliday = (date: Date) => {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const dateStr = `${m}-${d}`;
    if (dateStr === '1-1') return "New Year";
    if (dateStr === '5-1') return "Labor Day";
    if (dateStr === '8-31') return "Merdeka";
    if (dateStr === '12-25') return "Christmas";
    if (y === 2025 && dateStr === '1-29') return "CNY";
    if (y === 2025 && dateStr === '10-20') return "Deepavali";
    return null;
};

export const RosterModule: React.FC<RosterModuleProps> = ({ onClose, allowedModules }) => {
    // --- STATE ---
    const [currentDate, setCurrentDate] = useState(new Date());
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [rosterData, setRosterData] = useState<Record<string, Record<string, ExtendedStatus>>>({});
    const [rosterNotes, setRosterNotes] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [showResigned, setShowResigned] = useState(false);
    const [isMultiShiftMode, setIsMultiShiftMode] = useState(false); // ✅ 新增：多班制开关
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [selectedMobileEmployee, setSelectedMobileEmployee] = useState<Employee | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportConfig, setExportConfig] = useState({
        FLOOR: true, KITCHEN: true, BAR: true, DISH: true, OTHERS: true
    });

    const [isDirty, setIsDirty] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<string>('');
    const lastSavedSnapshot = useRef<string>('');

    const printRef = useRef<HTMLDivElement>(null);
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const activeOrder = isMultiShiftMode ? MULTI_SHIFT_ORDER : SINGLE_SHIFT_ORDER; // 动态数组

    // Permission Logic
    const showAll = !allowedModules || allowedModules.length === 0 || allowedModules.includes('ROSTER');
    const showKitchen = showAll || allowedModules.includes('ROSTER_KITCHEN');
    const showFloor = showAll || allowedModules.includes('ROSTER_FLOOR');

    const loadData = useCallback(async (targetMonthKey?: string) => {
        setLoading(true);
        const mk = targetMonthKey || monthKey;
        try {
            const [emps, rData] = await Promise.all([
                DataManager.getEmployees(),
                DataManager.getRosterData(mk)
            ]);
            setEmployees(emps.filter(e => !e.role.includes('Owner')));
            if (rData) {
                setRosterData(rData.roster as any || {});
                setRosterNotes(rData.notes || {});
                lastSavedSnapshot.current = JSON.stringify({ roster: rData.roster || {}, notes: rData.notes || {} });
            }
            setLastSyncTime(new Date().toLocaleTimeString());
            setIsDirty(false);
        } catch (error) {
            console.error('[Roster] Load failed:', error);
            alert('⚠️ 加载排班数据失败，请检查网络后重试');
        } finally {
            setLoading(false);
        }
    }, [monthKey]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isDirty) {
            const shouldSwitch = confirm(
                '⚠️ 当前月份有未保存的排班更改！\n\n' +
                '点击【确定】放弃更改并切换月份\n' +
                '点击【取消】留在当前月份'
            );
            if (!shouldSwitch) return;
        }
        loadData(monthKey);
    }, [monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '您有未保存的排班更改，确定要离开吗？';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const cloudData = await DataManager.getRosterData(monthKey);
            const cloudRoster = cloudData.roster || {};
            
            const mergedRoster = { ...cloudRoster };
            Object.keys(rosterData).forEach(dateStr => {
                if (dateStr.startsWith(monthKey)) {
                    mergedRoster[dateStr] = {
                        ...(cloudRoster[dateStr] || {}),
                        ...rosterData[dateStr]
                    };
                }
            });

            const mergedNotes = { ...(cloudData.notes || {}), ...rosterNotes };

            // 存入时强制转型确保兼容
            await DataManager.saveRosterData(mergedRoster as any, mergedNotes, monthKey);
            
            lastSavedSnapshot.current = JSON.stringify({ roster: mergedRoster, notes: mergedNotes });
            setRosterData(mergedRoster as any);
            setRosterNotes(mergedNotes);
            setIsDirty(false);
            setLastSyncTime(new Date().toLocaleTimeString());
            
            alert("✅ 排班表已保存 (Roster Saved)");
        } catch (e) {
            console.error('[Roster] Save failed:', e);
            alert("❌ 保存失败，请检查网络后重试");
        } finally {
            setIsSaving(false);
        }
    };

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentDate(newDate);
    };

    const getStatus = (dateStr: string, empId: string): ExtendedStatus => {
        return rosterData[dateStr]?.[empId] || 'WORK';
    };

    // ✅ 桌面端：点击循环切换状态
    const toggleStatus = (day: number, empId: string) => {
        const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
        const current = getStatus(dateStr, empId);
        let nextIdx = activeOrder.indexOf(current) + 1;
        if (nextIdx >= activeOrder.length || nextIdx === 0) nextIdx = 0; // 找不到或越界则重置为第一项
        const nextStatus = activeOrder[nextIdx];
        setStatusDirectly(day, empId, nextStatus);
    };

    // ✅ 移动端/平板端：直选设定状态
    const setStatusDirectly = (day: number, empId: string, status: ExtendedStatus) => {
        const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
        setRosterData(prev => ({
            ...prev,
            [dateStr]: {
                ...(prev[dateStr] || {}),
                [empId]: status
            }
        }));
        setIsDirty(true);
    };

    const staffGroups = useMemo(() => {
        const targetEmployees = employees.filter(e => showResigned || !e.isArchived);
        const kitchen = targetEmployees.filter(e => ['CHEF', 'COOK', 'CUTTER', 'KITCHEN', 'HELPER', 'COMMIS', '头手', '帮锅', '厨房', '打荷'].some(k => e.role.toUpperCase().includes(k)));
        const bar = targetEmployees.filter(e => e.role.toUpperCase().includes('BAR') || e.role.includes('水吧'));
        const floor = targetEmployees.filter(e => ['MANAGER', 'SUPERVISOR', 'CAPTAIN', 'WAITER', 'COUNTER', '楼面', '服务'].some(k => e.role.toUpperCase().includes(k)));
        const dish = targetEmployees.filter(e => e.role.toUpperCase().includes('DISH') || e.role.includes('洗碗') || e.role.toUpperCase().includes('CLEANER'));
        const others = targetEmployees.filter(e => !kitchen.includes(e) && !bar.includes(e) && !floor.includes(e) && !dish.includes(e));
        return { kitchen, bar, floor, dish, others };
    }, [employees, showResigned]);

    const handleBatchSet = (status: ExtendedStatus) => {
        if (isWorkShift(status)) {
            const confirmed = confirm(
                "⚠️ 严重警告 (WARNING)\n\n您确定要【重置】本月的排班表吗？\n此操作将覆盖当月所有已排班数据！\n\n确认后需要输入安全密码！"
            );
            if (!confirmed) return;
            const password = prompt("🔒 安全验证\n\n请输入管理员密码以确认重置操作：");
            if (password !== 'KLK2026' && password !== 'reset') {
                alert("❌ 密码错误，操作已取消。");
                return;
            }
        } else {
            if (!confirm(`将本月所有空格设置为 ${STATUS_CONFIG[status].label}?`)) return;
        }

        const newData = { ...rosterData };
        const visibleEmployees = [
            ...(showFloor ? staffGroups.floor : []),
            ...(showKitchen ? staffGroups.kitchen : []),
            ...(showFloor ? staffGroups.bar : []),
            ...(showFloor ? staffGroups.dish : []),
            ...(showFloor ? staffGroups.others : []),
        ];

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
            if (!newData[dateStr]) newData[dateStr] = {};
            visibleEmployees.forEach(emp => {
                newData[dateStr][emp.id] = status;
            });
        }
        setRosterData(newData);
        setIsDirty(true);
    };

    const handleRefresh = async () => {
        if (isDirty) {
            const confirmed = confirm('⚠️ 刷新将丢失未保存的更改，确定继续？');
            if (!confirmed) return;
        }
        await loadData(monthKey);
    };

    const handleClose = () => {
        if (isDirty) {
            const confirmed = confirm('⚠️ 有未保存的排班更改！\n\n点击【确定】放弃更改并关闭\n点击【取消】返回继续编辑');
            if (!confirmed) return;
        }
        onClose?.();
    };

    // --- RENDERERS ---

    // 1. Desktop Table Row Renderer
    const renderTableRows = (staffGroup: Employee[], groupLabel: string, themeKey: string) => {
        if (staffGroup.length === 0) return null;
        return (
            <>
                <tr><td colSpan={daysInMonth + 2} className={`py-2 px-3 text-xs font-black uppercase tracking-[0.2em] ${DEPT_THEMES[themeKey]} border-l-4`}>{groupLabel}</td></tr>
                {staffGroup.map(emp => {
                    const daysArray = Array.from({ length: daysInMonth });
                    let workDaysCount = 0;
                    let offDaysCount = 0;
                    const targetRestDays = emp.monthlyRestDays || 4;

                    daysArray.forEach((_, i) => {
                        const dateStr = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
                        const status = getStatus(dateStr, emp.id);
                        if (isWorkShift(status)) workDaysCount++;
                        if (status === 'OFF') offDaysCount++;
                    });

                    return (
                        <tr key={emp.id} className={`group transition-colors hover:bg-blue-50/40 ${emp.isArchived ? 'opacity-60' : ''}`}>
                            <td className="p-2 w-36 md:w-48 sticky left-0 bg-white z-30 shadow-[2px_0_10px_rgba(0,0,0,0.03)] border-r-2 border-gray-100 group-hover:bg-blue-50/40">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${offDaysCount >= targetRestDays ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <div className="truncate">
                                        <div className="font-bold text-xs md:text-sm text-[#1A1A1A] truncate flex items-center gap-1">
                                            {emp.name}
                                            {emp.isArchived && <span className="text-[8px] bg-red-100 text-red-600 px-1 rounded">离职</span>}
                                        </div>
                                        <div className="text-[9px] text-gray-400 font-mono">#{emp.id}</div>
                                    </div>
                                </div>
                            </td>
                            {daysArray.map((_, i) => {
                                const day = i + 1;
                                const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
                                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                                const dayOfWeek = date.getDay();
                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                const isToday = dateStr === new Date().toISOString().split('T')[0];
                                const status = getStatus(dateStr, emp.id);
                                const conf = STATUS_CONFIG[status];
                                const isBeforeJoin = emp.joinDate > dateStr;
                                const noteKey = `${dateStr}_${emp.id}`;
                                const hasNote = rosterNotes[noteKey];
                                const holiday = getMalaysianHoliday(date);

                                return (
                                    <td 
                                        key={i} 
                                        onClick={() => !isBeforeJoin && toggleStatus(day, emp.id)}
                                        className={`p-0.5 md:p-1 text-center cursor-pointer border-r border-gray-100 transition-all relative
                                            ${isBeforeJoin ? 'bg-gray-50 cursor-not-allowed' : ''}
                                            ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}
                                            ${!isBeforeJoin && holiday ? 'bg-purple-100/50' : ''}
                                            ${!isBeforeJoin && !holiday && isWeekend ? 'bg-red-100/50' : ''}
                                        `}
                                    >
                                        {isBeforeJoin ? (
                                            <span className="text-[9px] text-gray-300 font-mono">N/A</span>
                                        ) : status !== 'WORK' ? (
                                            <div className={`text-[8px] md:text-[10px] font-black rounded-md md:rounded-lg py-1 md:py-1.5 px-0.5 ${conf.color} whitespace-nowrap`}>
                                                {conf.short}
                                            </div>
                                        ) : null}
                                        {hasNote && <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>}
                                    </td>
                                );
                            })}
                            <td className="p-2 text-center sticky right-0 bg-gray-50 z-30 shadow-[-2px_0_10px_rgba(0,0,0,0.03)] border-l-2 border-gray-200 group-hover:bg-blue-50/40">
                                <div className="text-[10px] md:text-xs font-mono">
                                    <span className="font-bold text-gray-600">Work: {workDaysCount}</span><br/>
                                    <span className={`font-black ${offDaysCount >= targetRestDays ? 'text-green-600' : 'text-red-500'}`}>OFF: {offDaysCount}/{targetRestDays}</span>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </>
        );
    };

    // 2. Mobile Renderer (Groups)
    const renderMobileGroup = (group: Employee[], title: string, themeKey: string) => {
        if (group.length === 0) return null;
        return (
            <div className="mb-6">
                <h4 className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg mb-3 flex items-center justify-between border-l-4 ${DEPT_THEMES[themeKey]}`}>
                    {title} <span className="bg-white/50 px-2 py-0.5 rounded text-[10px]">{group.length}</span>
                </h4>
                <div className="space-y-3">
                    {group.map(emp => {
                        const daysArray = Array.from({ length: daysInMonth });
                        const offCount = daysArray.filter((_, i) => getStatus(`${monthKey}-${String(i+1).padStart(2,'0')}`, emp.id) === 'OFF').length;
                        const target = emp.monthlyRestDays || 4;
                        const met = offCount >= target;
                        return (
                            <div key={emp.id} onClick={() => setSelectedMobileEmployee(emp)} className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between active:bg-gray-50 active:scale-[0.99] transition-all ${emp.isArchived ? 'opacity-70' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${emp.isArchived ? 'bg-red-100 text-red-700' : met ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{emp.name.charAt(0)}</div>
                                    <div><div className="font-bold text-sm text-[#1A1A1A] flex items-center gap-2">{emp.name}{emp.isArchived && <span className="text-[8px] bg-red-100 text-red-600 px-1 py-0.5 rounded">离职</span>}</div><div className="text-[10px] text-gray-400 font-mono">#{emp.id}</div></div>
                                </div>
                                <div className="text-right"><div className="text-[9px] text-gray-400 font-bold uppercase">Rest Days</div><div className={`text-sm font-black font-mono ${met ? 'text-green-600' : 'text-red-500'}`}>{offCount} / {target}</div></div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // 3. Mobile Detail View (With 1-Tap Quick Action Chips)
    const renderMobileEmployeeDetail = () => {
        if (!selectedMobileEmployee) return null;
        const emp = selectedMobileEmployee;
        
        return (
            <div className="absolute inset-0 z-50 bg-[#F5F7FA] flex flex-col animate-in slide-in-from-right duration-300">
                <div className="bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0" style={{ padding: 'max(env(safe-area-inset-top, 12px), 12px) 16px 12px 16px' }}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedMobileEmployee(null)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                        <div>
                            <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2">
                                {emp.name} {emp.isArchived && <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded">离职</span>}
                            </h3>
                            <p className="text-xs text-gray-500 font-bold">{emp.role.split('(')[0]}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">OFF Days</p>
                        <p className="text-lg font-black font-mono text-blue-600">
                            {Array.from({ length: daysInMonth }).filter((_, i) => getStatus(`${monthKey}-${String(i+1).padStart(2,'0')}`, emp.id) === 'OFF').length}
                            <span className="text-xs text-gray-300"> / {emp.monthlyRestDays || 4}</span>
                        </p>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}>
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20}/></button>
                            <span className="font-black text-sm uppercase tracking-widest">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20}/></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
                                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                                const dayOfWeek = date.getDay();
                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                const isToday = dateStr === new Date().toISOString().split('T')[0];
                                const status = getStatus(dateStr, emp.id);
                                const conf = STATUS_CONFIG[status];
                                const isBeforeJoin = emp.joinDate > dateStr;
                                const existingNote = rosterNotes[`${dateStr}_${emp.id}`] || '';

                                if (isBeforeJoin) return null;

                                return (
                                    <div key={day} className={`flex flex-col p-3 rounded-xl border-2 transition-all ${conf.mobileBg} ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''} ${isWeekend ? 'border-l-4 border-l-red-300' : ''}`}>
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                                    <div className="text-[8px] font-bold uppercase leading-none">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                                    <div className="text-sm font-black leading-none">{day}</div>
                                                </div>
                                                <div>
                                                    <div className={`text-sm font-black ${isWorkShift(status) && status === 'WORK' ? 'text-gray-400' : conf.color.split(' ')[1] || 'text-gray-900'}`}>
                                                        {conf.label} {conf.short && `(${conf.short})`}
                                                    </div>
                                                    {existingNote && <div className="text-[10px] text-yellow-600 font-bold mt-0.5">📝 {existingNote}</div>}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* ✅ 移动端专属优化：横向滑动快捷 1-Tap 排班筹码 (彻底抛弃循环点击) */}
                                        <div className="mt-3 flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 snap-x">
                                            {activeOrder.map(s => {
                                                const isActive = status === s;
                                                const sConf = STATUS_CONFIG[s];
                                                return (
                                                    <button 
                                                        key={s} 
                                                        onClick={() => setStatusDirectly(day, emp.id, s)}
                                                        className={`px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap snap-start transition-all active:scale-95 shrink-0
                                                            ${isActive ? `bg-white border shadow-sm ${sConf.color.split(' ')[1] || 'text-black'} border-gray-300 ring-2 ring-offset-1 ring-blue-400` : 'bg-gray-100 text-gray-500 border border-transparent'}
                                                        `}
                                                    >
                                                        {sConf.short || sConf.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0" style={{ paddingBottom: 'max(calc(12px + env(safe-area-inset-bottom, 0px)), 12px)' }}>
                    <button onClick={handleSave} disabled={isSaving || !isDirty} className={`w-full py-3.5 rounded-xl font-black text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${isDirty ? 'bg-[#1A1A1A] text-[#FFD700]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                        {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                        {isSaving ? '保存中...' : isDirty ? '💾 保存更改' : '✅ 已保存'}
                    </button>
                </div>
            </div>
        );
    };

    // 4. Print Logic & Renderer
    const executeExportPDF = async () => {
        if (!printRef.current) return;
        setIsGeneratingPdf(true);
        setIsExportModalOpen(false);
        try {
            await new Promise(r => setTimeout(r, 800));
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            const pdf = new jsPDF('l', 'mm', 'a3'); 
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`KLK_Roster_${monthKey}.pdf`);
        } catch (e) { console.error(e); alert("Export Failed"); } finally { setIsGeneratingPdf(false); }
    };

    const renderPrintTableBody = (staffGroup: Employee[]) => {
        return staffGroup.map((emp) => {
            const daysArray = Array.from({ length: daysInMonth });
            let workCount = 0;
            let offCount = 0;

            daysArray.forEach((_, i) => {
                const dateStr = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
                if (emp.joinDate <= dateStr) {
                    const status = getStatus(dateStr, emp.id);
                    if (isWorkShift(status)) workCount++;
                    if (status === 'OFF') offCount++;
                }
            });

            return (
                <tr key={emp.id} className="text-[10px] border-b border-gray-300 break-inside-avoid">
                    <td className="p-2 border-r-2 border-black font-bold text-black whitespace-nowrap bg-white w-48">
                        {emp.name} {emp.isArchived ? '(离职)' : ''} <span className="text-gray-400 ml-1">#{emp.id}</span>
                    </td>
                    {daysArray.map((_, i) => {
                        const dateStr = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
                        const status = getStatus(dateStr, emp.id);
                        const isBeforeJoin = emp.joinDate > dateStr;
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const holiday = getMalaysianHoliday(date);

                        // Calculate custom style classes and text for printed PDF
                        let cellStyle = "p-1 text-center border-r border-gray-200 font-black text-[10px] ";
                        let cellText = "";

                        if (isBeforeJoin) {
                            cellStyle += "bg-stone-50 text-stone-300";
                            cellText = "-";
                        } else {
                            switch (status) {
                                case 'WORK':
                                    if (holiday) {
                                        cellStyle += "bg-purple-100/50 text-purple-800";
                                    } else if (isWeekend) {
                                        cellStyle += "bg-red-100/50 text-rose-800";
                                    } else {
                                        cellStyle += "bg-white text-gray-800";
                                    }
                                    cellText = "";
                                    break;
                                case 'OFF':
                                    cellStyle += isWeekend ? "bg-red-50 text-rose-600 border-red-100" : "bg-stone-100 text-stone-500 border-stone-200";
                                    cellText = "OFF";
                                    break;
                                case 'LEAVE':
                                    cellStyle += "bg-orange-100 text-orange-800 border-orange-200";
                                    cellText = "UL";
                                    break;
                                case 'MC':
                                    cellStyle += "bg-rose-100 text-rose-800 border-rose-200";
                                    cellText = "MC";
                                    break;
                                case 'ANNUAL':
                                    cellStyle += "bg-blue-100 text-blue-800 border-blue-200";
                                    cellText = "AL";
                                    break;
                                case 'ABSENT':
                                    cellStyle += "bg-purple-100 text-purple-800 border-purple-200";
                                    cellText = "ABS";
                                    break;
                                case 'PENDING':
                                    cellStyle += "bg-yellow-50 text-yellow-800 border-yellow-200";
                                    cellText = "?";
                                    break;
                                case 'HOLIDAY':
                                    cellStyle += "bg-purple-100 text-purple-800 border-purple-200";
                                    cellText = "H";
                                    break;
                                case 'MORNING':
                                    cellStyle += "bg-amber-100 text-amber-800 border-amber-200";
                                    cellText = "早";
                                    break;
                                case 'AFTERNOON':
                                    cellStyle += "bg-sky-100 text-sky-800 border-sky-200";
                                    cellText = "中";
                                    break;
                                case 'NIGHT':
                                    cellStyle += "bg-indigo-100 text-indigo-800 border-indigo-200";
                                    cellText = "晚";
                                    break;
                                default:
                                    cellStyle += "bg-white text-gray-800";
                                    cellText = STATUS_CONFIG[status as ExtendedStatus]?.short || String(status);
                            }
                        }

                        return (
                            <td key={i} className={cellStyle}>
                                {cellText}
                            </td>
                        );
                    })}
                    <td className="p-1 text-center border-l-2 border-black font-black text-xs bg-emerald-50 text-emerald-800">{workCount}</td>
                    <td className="p-1 text-center font-black text-xs bg-stone-100 text-stone-600">{offCount}</td>
                </tr>
            );
        });
    };

    const renderPrintSection = (group: Employee[], title: string, themeClass: string) => {
        if (group.length === 0) return null;
        return (
            <>
                <tr><td colSpan={daysInMonth + 3} className={`py-1.5 px-3 text-[10px] font-black uppercase tracking-widest ${themeClass} border-l-4`}>{title}</td></tr>
                {renderPrintTableBody(group)}
            </>
        );
    };

    // --- MAIN RENDER ---
    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-[98vw] md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                <div className="bg-[#1A1A1A] px-4 pb-4 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 shadow-xl z-40 border-b-4 border-[#FFD700]" style={{ paddingTop: 'max(env(safe-area-inset-top, 16px), 16px)' }}>
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                        <div className="flex items-center gap-3">
                            <div className="bg-[#FFD700] text-black p-2 md:p-2.5 rounded-xl shadow-lg"><Calendar size={20} className="md:w-6 md:h-6"/></div>
                            <div>
                                <h3 className="font-serif font-black text-lg md:text-xl tracking-wide text-white">排班管理</h3>
                                <p className="text-[9px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">STAFF SCHEDULING</p>
                            </div>
                        </div>
                        {isMobile && !selectedMobileEmployee && (
                            <div className="flex items-center bg-white/10 rounded-lg p-1">
                                <button onClick={() => changeMonth(-1)} className="p-2 text-white hover:bg-white/20 rounded"><ChevronLeft size={16}/></button>
                                <span className="text-xs font-black text-white w-20 text-center">{currentDate.toLocaleString('default', { month: 'short' })}</span>
                                <button onClick={() => changeMonth(1)} className="p-2 text-white hover:bg-white/20 rounded"><ChevronRight size={16}/></button>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 w-full md:w-auto items-center justify-end overflow-x-auto">
                        {!isMobile && (
                            <div className="flex items-center bg-white/10 rounded-xl p-1 border border-white/10 mr-2">
                                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white/20 text-white rounded-lg transition-all"><ChevronLeft size={20}/></button>
                                <span className="px-4 font-black text-lg min-w-[160px] text-center text-white font-mono">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white/20 text-white rounded-lg transition-all"><ChevronRight size={20}/></button>
                            </div>
                        )}
                        
                        {isDirty && (
                            <div className="flex items-center gap-1.5 bg-yellow-500/20 text-yellow-300 px-3 py-1.5 rounded-lg text-[10px] font-bold animate-pulse">
                                <AlertTriangle size={12}/> 未保存
                            </div>
                        )}

                        {/* ✅ 多班制/单班制 拓展开关 */}
                        <button onClick={() => setIsMultiShiftMode(!isMultiShiftMode)} className={`px-3 md:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${isMultiShiftMode ? 'bg-[#FFD700] text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                            <Layers size={16}/> <span className="hidden md:inline">{isMultiShiftMode ? '多班制: 开' : '多班制: 关'}</span>
                        </button>

                        <button onClick={handleRefresh} disabled={loading} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-xl transition-all active:scale-95" title="刷新数据">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
                        </button>

                        <ModuleGuideButton module="ROSTER" />
                        <button onClick={() => setShowResigned(!showResigned)} className={`px-3 md:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${showResigned ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                            <UserX size={16}/> <span className="hidden md:inline">{showResigned ? '隐藏离职' : '显示离职'}</span>
                        </button>
                        <button onClick={() => handleBatchSet(activeOrder[0])} className="bg-white/10 hover:bg-red-600 text-white px-3 md:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors">
                            <Eraser size={16}/> <span className="hidden md:inline">重置</span>
                        </button>
                        <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPdf} className="bg-white text-[#1A1A1A] hover:bg-[#FFD700] px-3 md:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap active:scale-95">
                            {isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} <span className="hidden md:inline">PDF</span>
                        </button>
                        <button onClick={handleSave} disabled={isSaving || !isDirty} className={`px-3 md:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap active:scale-95 ${isDirty ? 'bg-[#FFD700] text-black hover:bg-yellow-300 shadow-lg' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}>
                            {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} 
                            <span className="hidden md:inline">{isSaving ? '保存中...' : isDirty ? '保存' : '已保存'}</span>
                        </button>
                        <button onClick={handleClose} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20 hover:text-[#FFD700] transition-colors"><X size={18}/></button>
                    </div>
                </div>

                {lastSyncTime && (
                    <div className="bg-gray-50 px-4 py-1 text-[10px] text-gray-400 font-mono flex items-center justify-between border-b border-gray-200">
                        <span>最后同步: {lastSyncTime}</span>
                        <span>月份: {monthKey}</span>
                    </div>
                )}

                <div className="flex-grow overflow-auto relative touch-pan-x touch-pan-y" style={{ paddingBottom: isMobile ? 'max(env(safe-area-inset-bottom, 0px), 0px)' : '0' }}>
                    {isMobile ? (
                        <div className="p-4">
                            {loading ? (
                                <div className="flex items-center justify-center h-40"><Loader2 size={32} className="animate-spin text-gray-300"/></div>
                            ) : (
                                <>
                                    {showFloor && renderMobileGroup(staffGroups.floor, "楼面 (FRONT OF HOUSE)", 'FLOOR')}
                                    {showKitchen && renderMobileGroup(staffGroups.kitchen, "厨房 (BACK OF HOUSE)", 'KITCHEN')}
                                    {showFloor && renderMobileGroup(staffGroups.bar, "水吧 (BAR)", 'BAR')}
                                    {showFloor && renderMobileGroup(staffGroups.dish, "后勤 (CLEANING/DISH)", 'DISH')}
                                    {showFloor && renderMobileGroup(staffGroups.others, "其他 (OTHERS)", 'OTHERS')}
                                </>
                            )}
                        </div>
                    ) : (
                        <table className="w-full border-collapse text-sm">
                            <thead className="sticky top-0 z-30">
                                <tr className="bg-[#1A1A1A]">
                                    <th className="p-2 w-36 md:w-48 text-left text-[10px] uppercase font-bold text-[#FFD700] sticky left-0 top-0 bg-[#1A1A1A] z-40 shadow-[2px_0_10px_rgba(0,0,0,0.05)] border-b-4 border-white/10">Employee</th>
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                                        const dayOfWeek = date.getDay();
                                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                        const isToday = `${monthKey}-${String(i+1).padStart(2,'0')}` === new Date().toISOString().split('T')[0];
                                        const holiday = getMalaysianHoliday(date);
                                        let headerClass = 'border-gray-700 border-b-4 text-white';
                                        if (isToday) headerClass = 'bg-blue-700 text-white border-blue-500 border-b-4';
                                        else if (holiday) headerClass = 'bg-purple-800 text-white border-b-4';
                                        else if (isWeekend) headerClass = 'bg-red-900 text-red-300 border-b-4';

                                        return (
                                            <th key={i} className={`p-1 md:p-2 text-center min-w-[2.5rem] md:min-w-[3.5rem] border-r ${headerClass}`}>
                                                <div className="text-[8px] md:text-[9px] uppercase opacity-80 font-mono tracking-tighter">{date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</div>
                                                <div className="text-xs md:text-sm font-black font-mono">{i + 1}</div>
                                            </th>
                                        );
                                    })}
                                    <th className="p-2 w-24 md:w-28 text-center text-[9px] md:text-[10px] uppercase font-bold text-[#FFD700] sticky right-0 top-0 bg-[#1A1A1A] z-40 shadow-[-2px_0_10px_rgba(0,0,0,0.05)] border-b-4 border-white/10 border-l-2">Summary</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={daysInMonth + 2} className="py-40 text-center"><Loader2 size={48} className="animate-spin mx-auto text-gray-300"/></td></tr>
                                ) : (
                                    <>
                                        {showFloor && renderTableRows(staffGroups.floor, "楼面 (FRONT OF HOUSE)", 'FLOOR')}
                                        {showKitchen && renderTableRows(staffGroups.kitchen, "厨房 (BACK OF HOUSE)", 'KITCHEN')}
                                        {showFloor && renderTableRows(staffGroups.bar, "水吧 (BAR)", 'BAR')}
                                        {showFloor && renderTableRows(staffGroups.dish, "后勤 (CLEANING/DISH)", 'DISH')}
                                        {showFloor && renderTableRows(staffGroups.others, "其他 (OTHERS)", 'OTHERS')}
                                    </>
                                )}
                            </tbody>
                        </table>
                    )}

                    {selectedMobileEmployee && renderMobileEmployeeDetail()}
                </div>

                {isExportModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 border-t-8 border-[#FFD700]">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-xl text-[#1A1A1A]">导出 PDF 配置</h3>
                                <button onClick={() => setIsExportModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                            </div>
                            <p className="text-xs text-gray-500 font-bold mb-4">请选择要包含在报表中的部门:</p>
                            <div className="space-y-2 mb-6">
                                {[
                                    { key: 'FLOOR', label: '楼面 (Floor)' },
                                    { key: 'KITCHEN', label: '厨房 (Kitchen)' },
                                    { key: 'BAR', label: '水吧 (Bar)' },
                                    { key: 'DISH', label: '后勤/洗碗 (Dish/Cleaning)' },
                                    { key: 'OTHERS', label: '其他 (Others)' }
                                ].map(dept => (
                                    <div key={dept.key} onClick={() => setExportConfig(prev => ({ ...prev, [dept.key]: !prev[dept.key as keyof typeof exportConfig] }))} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${exportConfig[dept.key as keyof typeof exportConfig] ? 'border-[#FFD700] bg-yellow-50' : 'border-gray-200 bg-gray-50'}`}>
                                        <span className="text-sm font-bold">{dept.label}</span>
                                        {exportConfig[dept.key as keyof typeof exportConfig] ? <CheckSquare size={20} className="text-[#FFD700]"/> : <Square size={20} className="text-gray-300"/>}
                                    </div>
                                ))}
                            </div>
                            <button onClick={executeExportPDF} disabled={isGeneratingPdf} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-2xl font-black shadow-lg hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2">
                                {isGeneratingPdf ? <Loader2 size={20} className="animate-spin"/> : <FileDown size={20}/>}
                                {isGeneratingPdf ? '生成中...' : '确认导出 PDF'}
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                    <div ref={printRef} className="w-[420mm] bg-white p-10 font-sans text-black">
                        <div className="border-b-4 border-black pb-4 mb-4 flex justify-between items-end">
                            <div>
                                <h1 className="text-3xl font-black uppercase tracking-widest mb-1">STAFF ROSTER</h1>
                                <p className="text-lg font-bold text-gray-500">KIM LIAN KEE (KEPONG)</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Period</p>
                                <p className="text-2xl font-mono font-black">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                            </div>
                        </div>

                        {/* 🎨 Color & Symbol Legend for PDF */}
                        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                            <span className="text-xs font-black uppercase text-stone-500 tracking-wider">图例 (Legend):</span>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-white border border-stone-200 flex items-center justify-center text-[10px] font-black"></span>
                                <span className="text-[10px] font-extrabold text-stone-700">常规上班 (Work / 空白)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-6 h-5 rounded bg-stone-100 text-stone-500 border border-stone-200 flex items-center justify-center text-[9px] font-black">OFF</span>
                                <span className="text-[10px] font-extrabold text-stone-700">休息 (Off Day)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-orange-100 text-orange-800 border border-orange-200 flex items-center justify-center text-[10px] font-black">UL</span>
                                <span className="text-[10px] font-extrabold text-stone-700">事假 (Unpaid)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-rose-100 text-rose-800 border border-rose-200 flex items-center justify-center text-[10px] font-black">MC</span>
                                <span className="text-[10px] font-extrabold text-stone-700">病假 (Medical)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 border border-blue-200 flex items-center justify-center text-[10px] font-black">AL</span>
                                <span className="text-[10px] font-extrabold text-stone-700">年假 (Annual)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-6 h-5 rounded bg-purple-100 text-purple-800 border border-purple-200 flex items-center justify-center text-[9px] font-black">ABS</span>
                                <span className="text-[10px] font-extrabold text-stone-700">缺席 (Absent)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-yellow-50 text-yellow-800 border border-yellow-200 flex items-center justify-center text-[10px] font-black">?</span>
                                <span className="text-[10px] font-extrabold text-stone-700">待定 (Pending)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-purple-100 text-purple-800 border border-purple-200 flex items-center justify-center text-[10px] font-black">H</span>
                                <span className="text-[10px] font-extrabold text-stone-700">公假 (Holiday)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-[10px] font-black">早</span>
                                <span className="text-[10px] font-extrabold text-stone-700">早班 (Morning)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-sky-100 text-sky-800 border border-sky-200 flex items-center justify-center text-[10px] font-black">中</span>
                                <span className="text-[10px] font-extrabold text-stone-700">中班 (Mid)</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-100 shadow-sm">
                                <span className="w-5 h-5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center justify-center text-[10px] font-black">晚</span>
                                <span className="text-[10px] font-extrabold text-stone-700">晚班 (Night)</span>
                            </div>
                        </div>

                        <table className="w-full text-left border-collapse border-2 border-black">
                            <thead>
                                <tr className="bg-[#1A1A1A] text-white text-[9px] uppercase tracking-wider font-mono">
                                    <th className="p-2 w-48 border-r-2 border-white/20">Employee</th>
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                                        const dayOfWeek = date.getDay();
                                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                        const holiday = getMalaysianHoliday(date);
                                        return (
                                            <th key={i} className={`p-1 text-center min-w-[28px] border-r border-white/10 ${holiday ? 'bg-purple-800 text-purple-100' : isWeekend ? 'bg-red-800 text-red-100' : ''}`}>
                                                <div className="text-[7px] opacity-60">{date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</div>
                                                <div className="text-[10px] font-black">{i + 1}</div>
                                            </th>
                                        );
                                    })}
                                    <th className="p-1 text-center min-w-[30px] border-r border-white/20 text-white bg-gray-800">W</th>
                                    <th className="p-1 text-center min-w-[30px] text-white bg-gray-800">OFF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exportConfig.FLOOR && showFloor && renderPrintSection(staffGroups.floor, "FLOOR TEAM", "bg-blue-100 text-blue-900 border-blue-300")}
                                {exportConfig.KITCHEN && showKitchen && renderPrintSection(staffGroups.kitchen, "KITCHEN TEAM", "bg-orange-100 text-orange-900 border-orange-300")}
                                {exportConfig.BAR && showFloor && renderPrintSection(staffGroups.bar, "BAR TEAM", "bg-cyan-100 text-cyan-900 border-cyan-300")}
                                {exportConfig.DISH && showFloor && renderPrintSection(staffGroups.dish, "DISHWASHING", "bg-slate-200 text-slate-900 border-slate-300")}
                                {exportConfig.OTHERS && showFloor && renderPrintSection(staffGroups.others, "OTHERS", "bg-gray-100 text-gray-900 border-gray-300")}
                            </tbody>
                        </table>
                        <div className="mt-12 pt-8 border-t-2 border-black flex justify-between items-end">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest mb-8">Prepared By:</p>
                                <div className="w-64 border-b-2 border-black"></div>
                                <p className="text-[10px] font-bold text-gray-500 mt-2">Manager / Supervisor</p>
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest mb-8">Approved By:</p>
                                <div className="w-64 border-b-2 border-black"></div>
                                <p className="text-[10px] font-bold text-gray-500 mt-2">Owner / Director</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};