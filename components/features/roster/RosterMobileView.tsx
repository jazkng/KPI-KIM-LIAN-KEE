import React, { useState, useEffect, useMemo } from 'react';
import { ROSTER_STATUSES } from './rosterConstants';
import { getDayOfWeekText, getEmployeeDept, getDaysInMonth } from './rosterUtils';
import { 
    ChevronLeft, ChevronRight, MessageSquare, ShieldCheck, X, RefreshCw, 
    MoreHorizontal, Download, Save, Send, SlidersHorizontal, 
    CheckSquare
} from 'lucide-react';
import { Employee } from '../../../types';

interface RosterMobileViewProps {
    employees: Employee[];
    monthKey: string;
    roster: Record<string, Record<string, string>>;
    notes: Record<string, string>;
    onChangeCell: (date: string, employeeId: string, status: string) => void;
    onSaveNote: (date: string, employeeId: string, note: string) => void;
    customHolidays?: any[];
    readOnly?: boolean;
    currentView: 'MONTH' | 'WEEK' | 'DAILY' | 'PERSONAL';
    onChangeView: (v: 'MONTH' | 'WEEK' | 'DAILY' | 'PERSONAL') => void;
    deptFilter: string;
    onChangeDeptFilter: (dept: string) => void;
    onChangeMonth: (m: string) => void;
    onRefresh: () => void;
    onClose: () => void;
    status: string;
    isModified: boolean;
    onSaveDraft: () => void;
    onPublishClick: () => void;
    onResetClick: () => void;
    onExportClick: () => void;
    onToggleShiftMode: () => void;
    isMultiShiftMode: boolean;
    onAutoFillWork?: () => void;
    saving: boolean;
    lastSavedAt?: string | null;
    lastSavedBy?: string | null;
}

export const RosterMobileView: React.FC<RosterMobileViewProps> = (props) => {
    const {
        employees, monthKey, roster, notes, onChangeCell, onSaveNote,
        readOnly = false, currentView, onChangeView, deptFilter, onChangeDeptFilter,
        onChangeMonth, onRefresh, onClose, status, isModified,
        onSaveDraft, onPublishClick, onResetClick, onExportClick,
        onToggleShiftMode, isMultiShiftMode, onAutoFillWork, saving
    } = props;

    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');
    
    // Dept filtering
    const filteredEmployees = useMemo(() => {
        if (deptFilter === 'ALL') return activeEmployees;
        return activeEmployees.filter(emp => getEmployeeDept(emp) === deptFilter);
    }, [activeEmployees, deptFilter]);

    // Navigation state
    const [anchorDate, setAnchorDate] = useState<Date>(new Date());
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

    // Sheet state
    const [activeSheetEmpId, setActiveSheetEmpId] = useState<string | null>(null);
    const [sheetNoteText, setSheetNoteText] = useState('');
    const [sheetDate, setSheetDate] = useState<string>('');

    // Sync dates when monthKey shifts
    useEffect(() => {
        const [yr, mo] = monthKey.split('-');
        const d = new Date(parseInt(yr), parseInt(mo) - 1, 1);
        setAnchorDate(d);
        const firstDayStr = `${monthKey}-01`;
        setSelectedDate(firstDayStr);
    }, [monthKey]);

    // Helper functions for Date
    const getMonday = (d: Date): Date => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    };

    const handlePrevDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        const dStr = d.toISOString().split('T')[0];
        setSelectedDate(dStr);
        setAnchorDate(d);
        const newMonthKey = dStr.substring(0, 7);
        if (newMonthKey !== monthKey) onChangeMonth(newMonthKey);
    };

    const handleNextDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        const dStr = d.toISOString().split('T')[0];
        setSelectedDate(dStr);
        setAnchorDate(d);
        const newMonthKey = dStr.substring(0, 7);
        if (newMonthKey !== monthKey) onChangeMonth(newMonthKey);
    };

    const handleGoToday = () => {
        const today = new Date();
        const todayStr = today.toLocaleDateString('en-CA');
        setSelectedDate(todayStr);
        setAnchorDate(today);
        const newMonthKey = todayStr.substring(0, 7);
        if (newMonthKey !== monthKey) onChangeMonth(newMonthKey);
    };

    const handlePrevWeek = () => {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() - 7);
        setAnchorDate(d);
        const newMonthKey = d.toISOString().split('T')[0].substring(0, 7);
        if (newMonthKey !== monthKey) onChangeMonth(newMonthKey);
    };

    const handleNextWeek = () => {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() + 7);
        setAnchorDate(d);
        const newMonthKey = d.toISOString().split('T')[0].substring(0, 7);
        if (newMonthKey !== monthKey) onChangeMonth(newMonthKey);
    };

    const handleOpenSheet = (empId: string, dateStr: string) => {
        setActiveSheetEmpId(empId);
        setSheetDate(dateStr);
        setSheetNoteText(notes[`${dateStr}_${empId}`] || '');
    };

    const handleCloseSheet = () => {
        setActiveSheetEmpId(null);
        setSheetNoteText('');
        setSheetDate('');
    };

    const handleSelectStatus = (statusKey: string) => {
        if (!activeSheetEmpId || !sheetDate) return;
        onChangeCell(sheetDate, activeSheetEmpId, statusKey);
        // Do not close immediately to let them add a note if they want, or we can close it. Let's just close to save clicks.
        handleCloseSheet();
    };

    const handleSaveSheetNote = () => {
        if (!activeSheetEmpId || !sheetDate) return;
        onSaveNote(sheetDate, activeSheetEmpId, sheetNoteText);
        handleCloseSheet();
    };

    const activeSheetEmp = activeSheetEmpId ? employees.find(e => e.id === activeSheetEmpId) : null;

    // Build week days
    const monday = getMonday(anchorDate);
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().split('T')[0];
    });

    const isDraft = status === 'draft';
    const isError = status === 'error';

    return (
        <div className="flex flex-col h-[100dvh] bg-[#F6F7FB] relative overflow-hidden text-gray-900 w-full">
            {/* 1. Compact Header */}
            <div className="shrink-0 bg-gray-900 px-4 py-3 flex items-center justify-between z-20" style={{ minHeight: '64px' }}>
                <div className="flex items-center gap-3">
                    <div className="bg-[#FFD200] text-[#111111] p-2 rounded-lg shadow-md flex-shrink-0">
                        <ShieldCheck size={18} />
                    </div>
                    <div className="min-w-0 flex flex-col justify-center">
                        <h2 className="text-white font-bold text-[15px] leading-tight truncate">排班管理中心</h2>
                        <p className="text-[10px] text-gray-400 font-mono tracking-wider truncate">
                            Roster Desk
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={onRefresh} className="p-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-colors" aria-label="Refresh" style={{ minWidth: '40px', minHeight: '40px' }}>
                        <RefreshCw size={16} className={saving ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={onClose} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full transition-colors" aria-label="Close" style={{ minWidth: '40px', minHeight: '40px' }}>
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* 2. Primary Control Bar */}
            <div className="shrink-0 bg-white px-4 py-2 border-b border-gray-200 flex items-center justify-between z-20">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <input
                            type="month"
                            value={monthKey}
                            onChange={(e) => {
                                if (e.target.value) onChangeMonth(e.target.value);
                            }}
                            className="bg-transparent text-sm font-bold text-gray-900 focus:outline-none max-w-[120px]"
                        />
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isError ? 'bg-red-100 text-red-700' :
                            isDraft ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                            {isError ? '发布失败' : isDraft ? '草稿' : '已发布'}
                        </div>
                    </div>
                    {isModified && (
                        <div className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                            有未保存修改
                        </div>
                    )}
                </div>
                <button 
                    onClick={() => setIsMoreMenuOpen(true)}
                    className="p-2 rounded-lg bg-gray-100 text-gray-700 flex items-center gap-1 text-xs font-semibold active:scale-95 transition-transform"
                    style={{ minHeight: '40px' }}
                >
                    更多 <MoreHorizontal size={14} />
                </button>
            </div>

            {/* 3. View Switcher */}
            <div className="shrink-0 bg-white px-4 py-2 border-b border-gray-200 z-20">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    {[
                        { id: 'WEEK', label: '周' },
                        { id: 'DAILY', label: '每日' },
                        { id: 'MONTH', label: '月' },
                        { id: 'PERSONAL', label: '个人' }
                    ].map(view => (
                        <button
                            key={view.id}
                            onClick={() => onChangeView(view.id as any)}
                            className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                currentView === view.id 
                                    ? 'bg-white text-gray-900 shadow-sm' 
                                    : 'text-gray-500'
                            }`}
                            style={{ minHeight: '40px' }}
                        >
                            {view.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. Department Chips */}
            <div className="shrink-0 bg-white border-b border-gray-200 z-20">
                <div className="flex overflow-x-auto px-4 py-2 gap-2 hide-scrollbar">
                    {['ALL', 'KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER'].map((dept) => {
                        const labels: Record<string, string> = {
                            ALL: '全部', KITCHEN: '厨房', FLOOR: '楼面', BAR: '吧台', 
                            DISHWASH: '洗碗', BACK_OFFICE: '后勤', OTHER: '其他'
                        };
                        const isAct = deptFilter === dept;
                        return (
                            <button
                                key={dept}
                                onClick={() => onChangeDeptFilter(dept)}
                                className={`flex-none px-4 py-1.5 rounded-full text-xs transition-colors ${
                                    isAct
                                        ? 'bg-[#111111] text-[#FFD200] font-bold'
                                        : 'bg-white border border-gray-200 text-gray-600 font-medium'
                                }`}
                                style={{ minHeight: '40px' }}
                            >
                                {labels[dept]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 5. Date Navigation (Sticky above content) */}
            <div className="shrink-0 bg-gray-50 px-4 py-2 border-b border-gray-200 sticky top-0 z-10 flex items-center justify-between shadow-sm">
                <button 
                    onClick={currentView === 'WEEK' ? handlePrevWeek : handlePrevDay}
                    className="p-2 hover:bg-gray-200 rounded-xl text-gray-700 active:scale-95 transition-transform"
                    style={{ minWidth: '44px', minHeight: '44px' }}
                >
                    <ChevronLeft size={20} />
                </button>
                
                <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-gray-900">
                        {currentView === 'WEEK' 
                            ? `${weekDays[0].substring(5).replace('-', '/')} - ${weekDays[6].substring(5).replace('-', '/')}`
                            : `${selectedDate.replace(/-/g, '/')} ${getDayOfWeekText(selectedDate)}`
                        }
                    </span>
                    <button 
                        onClick={handleGoToday}
                        className="text-[10px] text-gray-500 font-semibold px-2 py-0.5 mt-0.5 rounded-md hover:bg-gray-200"
                        style={{ minHeight: '24px' }}
                    >
                        {currentView === 'WEEK' ? '回到本周' : '回到今天'}
                    </button>
                </div>

                <button 
                    onClick={currentView === 'WEEK' ? handleNextWeek : handleNextDay}
                    className="p-2 hover:bg-gray-200 rounded-xl text-gray-700 active:scale-95 transition-transform"
                    style={{ minWidth: '44px', minHeight: '44px' }}
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* 6. Scrollable Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y pb-[calc(100px+env(safe-area-inset-bottom))]">
                <div className="p-4 space-y-4">
                    {filteredEmployees.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">
                            没有找到该部门的员工
                        </div>
                    ) : (
                        currentView === 'DAILY' ? (
                            /* DAILY VIEW: List of employees for a single day */
                            filteredEmployees.map(emp => {
                                const dayRoster = roster[selectedDate] || {};
                                const statusKey = dayRoster[emp.id] || 'UNASSIGNED';
                                const statusConfig = ROSTER_STATUSES[statusKey] || ROSTER_STATUSES.UNASSIGNED;
                                const note = notes[`${selectedDate}_${emp.id}`];

                                return (
                                    <div 
                                        key={emp.id}
                                        onClick={() => !readOnly && handleOpenSheet(emp.id, selectedDate)}
                                        className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-4 active:scale-[0.98] transition-transform"
                                        style={{ minHeight: '80px' }}
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="font-bold text-gray-900 text-sm">{emp.name}</div>
                                                <div className="text-[11px] text-gray-500 mt-0.5">
                                                    {emp.role} · {getEmployeeDept(emp)}
                                                </div>
                                            </div>
                                            {note && (
                                                <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                                                    <MessageSquare size={10} /> 备注
                                                </span>
                                            )}
                                        </div>
                                        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                                            statusKey === 'UNASSIGNED' 
                                                ? 'bg-gray-50 border-gray-200 border-dashed text-gray-500' 
                                                : statusConfig.color
                                        }`}>
                                            <span className="text-xs font-bold">{statusKey === 'UNASSIGNED' ? '未排班' : statusConfig.label}</span>
                                            <span className="text-xs font-semibold px-2 py-1 bg-white/50 rounded-md">
                                                设置班次
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            /* WEEK / MONTH / PERSONAL VIEW: Horizontal Scrolling Days */
                            filteredEmployees.map(emp => {
                                const daysToRender = currentView === 'WEEK' ? weekDays : getDaysInMonth(monthKey);
                                return (
                                    <div 
                                        key={emp.id}
                                        className="bg-white rounded-[16px] shadow-sm border border-gray-100 overflow-hidden"
                                    >
                                        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                                            <div className="font-bold text-gray-900 text-sm">{emp.name}</div>
                                            <div className="text-[11px] text-gray-500 mt-0.5">
                                                {emp.role} · {getEmployeeDept(emp)}
                                            </div>
                                        </div>
                                        <div className="flex overflow-x-auto overscroll-x-contain touch-pan-x flex-nowrap p-3 gap-2 hide-scrollbar">
                                            {daysToRender.map((dateStr: string) => {
                                                const dayRoster = roster[dateStr] || {};
                                                const statusKey = dayRoster[emp.id] || 'UNASSIGNED';
                                                const statusConfig = ROSTER_STATUSES[statusKey] || ROSTER_STATUSES.UNASSIGNED;
                                                const today = new Date().toLocaleDateString('en-CA');
                                                const isToday = dateStr === today;
                                                const dObj = new Date(dateStr);
                                                const dayText = ['日', '一', '二', '三', '四', '五', '六'][dObj.getDay()];
                                                const isOff = statusKey === 'OFF' || statusKey === 'LEAVE' || statusKey === 'MC';
                                                
                                                return (
                                                    <div 
                                                        key={dateStr}
                                                        onClick={() => !readOnly && handleOpenSheet(emp.id, dateStr)}
                                                        className={`flex-none w-[96px] h-[72px] rounded-xl flex flex-col justify-center items-center active:scale-95 transition-transform border ${
                                                            isToday ? 'border-[#FFD200] bg-yellow-50/30' : 'border-transparent'
                                                        } ${
                                                            statusKey === 'UNASSIGNED' 
                                                                ? 'bg-gray-50 border-gray-200 border-dashed text-gray-400' 
                                                                : isOff 
                                                                    ? 'bg-gray-100 text-gray-600'
                                                                    : 'bg-green-50 border-green-100 text-green-800'
                                                        }`}
                                                    >
                                                        <div className="text-[10px] font-medium opacity-80 mb-1">
                                                            {dayText} {dateStr.substring(8, 10)}
                                                        </div>
                                                        <div className="text-xs font-bold tabular-nums text-center px-1">
                                                            {statusKey === 'UNASSIGNED' ? '未排班' : statusConfig.short || statusConfig.label}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )
                    )}
                </div>
            </div>

            {/* 7. Bottom Fixed Action Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)] z-30">
                <div className="p-3 flex items-center gap-3">
                    <button 
                        onClick={onSaveDraft}
                        disabled={saving}
                        className="flex-[4] relative bg-white border border-gray-300 text-gray-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                        style={{ minHeight: '56px' }}
                    >
                        <Save size={18} />
                        {saving ? '保存中...' : '保存草稿'}
                        {isModified && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange-500 border-2 border-white"></span>
                        )}
                    </button>
                    <button 
                        onClick={onPublishClick}
                        className="flex-[6] bg-gray-900 text-[#FFD200] rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
                        style={{ minHeight: '56px' }}
                    >
                        <Send size={18} />
                        发布正式
                    </button>
                </div>
            </div>

            {/* 8. More Options Bottom Sheet */}
            {isMoreMenuOpen && (
                <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setIsMoreMenuOpen(false)} />
                    <div className="relative w-full bg-white rounded-t-[20px] shadow-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-300">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-4 mb-2" />
                        <div className="px-6 py-2 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900 text-base">更多选项</h3>
                            <button onClick={() => setIsMoreMenuOpen(false)} className="p-2 text-gray-400 bg-gray-50 rounded-full" style={{ minWidth: '40px', minHeight: '40px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-2">
                            <button 
                                onClick={() => { onToggleShiftMode(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                            >
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><SlidersHorizontal size={20} /></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-gray-900">{isMultiShiftMode ? '多班次模式 (Multi-Shift)' : '常规单班模式'}</div>
                                    <div className="text-[11px] text-gray-500">点击切换排班模式</div>
                                </div>
                            </button>
                            {onAutoFillWork && (
                                <button 
                                    onClick={() => { onAutoFillWork(); setIsMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-green-50 active:bg-green-100 transition-colors text-left"
                                >
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CheckSquare size={20} /></div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-green-700">一键常规班 (W)</div>
                                        <div className="text-[11px] text-green-600/70">将本月未排班格子全部填为W</div>
                                    </div>
                                </button>
                            )}
                            <button 
                                onClick={() => { onExportClick(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                            >
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Download size={20} /></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-gray-900">导出排班</div>
                                    <div className="text-[11px] text-gray-500">导出 PDF 或 Excel</div>
                                </div>
                            </button>
                            <button 
                                onClick={() => { onResetClick(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors text-left"
                            >
                                <div className="p-2 bg-red-50 text-red-600 rounded-lg"><RefreshCw size={20} /></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-red-600">重置排班</div>
                                    <div className="text-[11px] text-red-500/70">撤销未保存的修改</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 9. Edit Shift Bottom Sheet */}
            {activeSheetEmpId && activeSheetEmp && (
                <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={handleCloseSheet} />
                    <div className="relative w-full bg-white rounded-t-[20px] shadow-2xl flex flex-col max-h-[85dvh]">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-4 mb-2 shrink-0" onClick={handleCloseSheet} />
                        
                        <div className="px-6 pb-3 pt-1 border-b border-gray-100 shrink-0">
                            <h3 className="text-lg font-bold text-gray-900">设置班次</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                {sheetDate} · {activeSheetEmp.name} ({getEmployeeDept(activeSheetEmp)})
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 overscroll-contain">
                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-gray-400 uppercase">选择班次</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.values(ROSTER_STATUSES).map(item => {
                                        const isSel = (roster[sheetDate] || {})[activeSheetEmpId] === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => handleSelectStatus(item.id)}
                                                className={`flex items-center justify-between px-4 py-3.5 rounded-xl border ${
                                                    isSel
                                                        ? 'border-gray-900 bg-gray-900 text-white shadow-md'
                                                        : 'border-gray-200 bg-white active:bg-gray-50 text-gray-700'
                                                } transition-colors`}
                                                style={{ minHeight: '52px' }}
                                            >
                                                <span className="text-sm font-bold">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div className="space-y-3 pb-8">
                                <label className="block text-xs font-bold text-gray-400 uppercase">特殊备注</label>
                                <input
                                    type="text"
                                    placeholder="输入假条或调整原因..."
                                    value={sheetNoteText}
                                    onChange={(e) => setSheetNoteText(e.target.value)}
                                    className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none bg-gray-50"
                                    style={{ minHeight: '48px' }}
                                />
                            </div>
                        </div>

                        <div className="shrink-0 p-4 border-t border-gray-100 pb-[calc(16px+env(safe-area-inset-bottom))] flex gap-3 bg-white">
                            <button 
                                onClick={handleCloseSheet}
                                className="flex-[3] py-3.5 rounded-xl font-bold text-sm bg-gray-100 text-gray-700"
                                style={{ minHeight: '48px' }}
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleSaveSheetNote}
                                className="flex-[7] py-3.5 rounded-xl font-bold text-sm bg-gray-900 text-white shadow-md"
                                style={{ minHeight: '48px' }}
                            >
                                确认保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
