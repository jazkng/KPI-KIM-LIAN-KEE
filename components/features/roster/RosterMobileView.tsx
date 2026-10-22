import React, { useState, useEffect, useMemo } from 'react';
import { ROSTER_STATUSES } from './rosterConstants';
import { getEmployeeDept, getDaysInMonth, groupEmployeesByDept, countMonthRestDays } from './rosterUtils';
import {
    ChevronLeft, ChevronRight, MessageSquare, X, RefreshCw,
    MoreHorizontal, Download, Save, Send, SlidersHorizontal,
    CheckSquare, ArrowLeft, Hand
} from 'lucide-react';
import { Employee } from '../../../types';
import { shortName } from '../../../utils/hr/hrOverview';

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

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const DEPTS: [string, string][] = [['ALL', '全部'], ['KITCHEN', '厨房'], ['FLOOR', '楼面'], ['BAR', '吧台'], ['DISHWASH', '洗碗'], ['BACK_OFFICE', '后勤'], ['OTHER', '其他']];

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免马来西亚早上 8 点前变成前一天） */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const weekdayOf = (s: string) => parseYmd(s).getDay();
const getMonday = (d: Date): Date => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };

const statusOf = (roster: Record<string, Record<string, string>>, date: string, empId: string) => (roster[date] || {})[empId] || 'UNASSIGNED';
const cfgOf = (key: string) => ROSTER_STATUSES[key] || ROSTER_STATUSES.UNASSIGNED;

/** 名字旁边：本月已排休息天数 / 每月应休天数 */
const RestDays: React.FC<{ emp: any; roster: any; monthKey: string }> = ({ emp, roster, monthKey }) => {
    const rest = countMonthRestDays(roster, monthKey, emp.id);
    const target = emp.monthlyRestDays ?? 4;
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${rest === target ? 'bg-green-50 text-green-700' : rest > target ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
            休 {rest}/{target}
        </span>
    );
};

export const RosterMobileView: React.FC<RosterMobileViewProps> = (props) => {
    const {
        employees, monthKey, roster, notes, onChangeCell, onSaveNote,
        readOnly = false, currentView, onChangeView, deptFilter, onChangeDeptFilter,
        onChangeMonth, onRefresh, onClose, status, isModified,
        onSaveDraft, onPublishClick, onResetClick, onExportClick,
        onToggleShiftMode, isMultiShiftMode, onAutoFillWork, saving
    } = props;

    const today = ymd(new Date());
    const activeEmployees = useMemo(() => employees.filter(e => !e.isArchived && e.status !== 'TERMINATED'), [employees]);
    const filteredEmployees = useMemo(() => deptFilter === 'ALL' ? activeEmployees : activeEmployees.filter(emp => getEmployeeDept(emp) === deptFilter), [activeEmployees, deptFilter]);
    const groups = useMemo(() => groupEmployeesByDept(filteredEmployees), [filteredEmployees]);

    // 日视图看哪一天；周视图看 selectedDate 所在的那一周
    const [selectedDate, setSelectedDate] = useState<string>(today);
    const [personalEmpId, setPersonalEmpId] = useState<string>('');
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    // 快速填班：选了一个班次后，点格子直接填上，不用每格开窗
    const [brush, setBrush] = useState<string | null>(null);

    const [activeSheetEmpId, setActiveSheetEmpId] = useState<string | null>(null);
    const [sheetNoteText, setSheetNoteText] = useState('');
    const [sheetDate, setSheetDate] = useState<string>('');

    // 换月份：本月 → 今天；其他月份 → 1 号
    useEffect(() => {
        setSelectedDate(prev => prev.startsWith(monthKey) ? prev : today.startsWith(monthKey) ? today : `${monthKey}-01`);
    }, [monthKey, today]);

    const personalEmp = filteredEmployees.find(e => e.id === personalEmpId) || filteredEmployees[0];

    const goDate = (dStr: string) => {
        setSelectedDate(dStr);
        if (dStr.substring(0, 7) !== monthKey) onChangeMonth(dStr.substring(0, 7));
    };
    const shiftMonth = (n: number) => {
        const [y, m] = monthKey.split('-').map(Number);
        const d = new Date(y, m - 1 + n, 1);
        onChangeMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };
    const isMonthNav = currentView === 'MONTH' || currentView === 'PERSONAL';
    const handlePrev = () => isMonthNav ? shiftMonth(-1) : goDate(addDays(selectedDate, currentView === 'WEEK' ? -7 : -1));
    const handleNext = () => isMonthNav ? shiftMonth(1) : goDate(addDays(selectedDate, currentView === 'WEEK' ? 7 : 1));

    const weekDays = useMemo(() => {
        const monday = ymd(getMonday(parseYmd(selectedDate)));
        return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    }, [selectedDate]);
    const monthDays = useMemo(() => getDaysInMonth(monthKey), [monthKey]);

    const [yr, mo] = monthKey.split('-');
    const navLabel = currentView === 'WEEK'
        ? `${weekDays[0].substring(5).replace('-', '/')} – ${weekDays[6].substring(5).replace('-', '/')}`
        : currentView === 'DAILY'
            ? `${parseInt(selectedDate.substring(5, 7))}月${parseInt(selectedDate.substring(8))}日 周${WEEKDAY[weekdayOf(selectedDate)]}`
            : `${yr}年${parseInt(mo)}月`;
    const atToday = isMonthNav ? today.startsWith(monthKey) : currentView === 'WEEK' ? weekDays.includes(today) : selectedDate === today;

    const handleOpenSheet = (empId: string, dateStr: string) => {
        setActiveSheetEmpId(empId);
        setSheetDate(dateStr);
        setSheetNoteText(notes[`${dateStr}_${empId}`] || '');
    };
    const handleCloseSheet = () => { setActiveSheetEmpId(null); setSheetNoteText(''); setSheetDate(''); };
    const handleSelectStatus = (statusKey: string) => {
        if (!activeSheetEmpId || !sheetDate) return;
        onChangeCell(sheetDate, activeSheetEmpId, statusKey);
        handleCloseSheet();
    };
    const handleSaveSheetNote = () => {
        if (!activeSheetEmpId || !sheetDate) return;
        onSaveNote(sheetDate, activeSheetEmpId, sheetNoteText);
        handleCloseSheet();
    };
    /** 点格子：有选快速班次就直接填（再点一次同样的 = 清掉），没有就开窗 */
    const tapCell = (empId: string, dateStr: string) => {
        if (readOnly) return;
        if (brush) {
            onChangeCell(dateStr, empId, statusOf(roster, dateStr, empId) === brush && brush !== 'UNASSIGNED' ? 'UNASSIGNED' : brush);
            return;
        }
        handleOpenSheet(empId, dateStr);
    };

    const activeSheetEmp = activeSheetEmpId ? employees.find(e => e.id === activeSheetEmpId) : null;
    const brushOptions = ['WORK', ...(isMultiShiftMode ? ['MORNING', 'AFTERNOON', 'NIGHT'] : []), 'OFF', 'MC', 'LEAVE', 'ANNUAL', 'HOLIDAY', 'UNASSIGNED'];

    const isDraft = status === 'draft';
    const isError = status === 'error';

    /** 一格班次：只显示简写，颜色跟班次 */
    const renderCell = (empId: string, dateStr: string, wide: boolean) => {
        const key = statusOf(roster, dateStr, empId);
        const cfg = cfgOf(key);
        const hasNote = !!notes[`${dateStr}_${empId}`];
        return (
            <button type="button" onClick={() => tapCell(empId, dateStr)}
                className={`relative ${wide ? 'w-full' : 'w-10'} h-10 rounded-lg border text-[11px] font-black tabular-nums active:scale-95 transition-transform ${key === 'UNASSIGNED' ? 'border-dashed border-gray-200 bg-white text-gray-300' : cfg.color} ${dateStr === today ? 'ring-2 ring-[#FFD200]' : ''}`}>
                {key === 'UNASSIGNED' ? '·' : cfg.short}
                {hasNote && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </button>
        );
    };

    /** 周 / 月：员工一行、日期一列；日期只在表头出现一次 */
    const renderGrid = (days: string[]) => {
        const wide = days.length <= 7;
        return (
            <table className={`border-separate border-spacing-0 ${wide ? 'w-full' : ''}`}>
                    <thead>
                        <tr>
                            <th className="sticky left-0 top-0 z-30 bg-[#F6F7FB] min-w-[72px] max-w-[72px]" />
                            {days.map(d => {
                                const wd = weekdayOf(d);
                                return (
                                    <th key={d} className={`sticky top-0 z-20 bg-[#F6F7FB] px-0.5 pt-1 pb-1.5 text-center ${wide ? '' : 'min-w-[44px]'}`}>
                                        <div className={`mx-auto w-10 rounded-lg py-0.5 ${d === today ? 'bg-[#FFD200] text-[#111111]' : wd === 0 || wd === 6 ? 'text-rose-500' : 'text-gray-500'}`}>
                                            <div className="text-[10px] font-bold leading-tight">{WEEKDAY[wd]}</div>
                                            <div className="text-[13px] font-black leading-tight">{parseInt(d.substring(8))}</div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map(group => (
                            <React.Fragment key={group.dept}>
                                <tr>
                                    <td colSpan={days.length + 1} className="pt-3 pb-1">
                                        <span className="sticky left-0 inline-block px-1 text-xs font-black text-gray-700">{group.label} <span className="text-gray-400 font-bold">· {group.employees.length} 人</span></span>
                                    </td>
                                </tr>
                                {group.employees.map(emp => (
                                    <tr key={emp.id}>
                                        <td className="sticky left-0 z-10 bg-[#F6F7FB] pr-1.5 py-0.5 min-w-[72px] max-w-[72px]">
                                            <div className="text-[13px] font-black text-gray-900 truncate leading-tight">{shortName(emp)}</div>
                                            <RestDays emp={emp} roster={roster} monthKey={monthKey} />
                                        </td>
                                        {days.map(d => (
                                            <td key={d} className="px-px py-0.5 text-center">
                                                {renderCell(emp.id, d, wide)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
            </table>
        );
    };

    const renderDaily = () => (
        <div className="space-y-3">
            {groups.map(group => (
                <div key={group.dept} className="space-y-1.5">
                    <div className="px-1 text-xs font-black text-gray-700">{group.label} <span className="text-gray-400 font-bold">· {group.employees.length} 人</span></div>
                    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                        {group.employees.map(emp => {
                            const key = statusOf(roster, selectedDate, emp.id);
                            const cfg = cfgOf(key);
                            const note = notes[`${selectedDate}_${emp.id}`];
                            return (
                                <button key={emp.id} type="button" onClick={() => tapCell(emp.id, selectedDate)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-gray-50" style={{ minHeight: '52px' }}>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-1.5"><b className="text-sm font-black text-gray-900 truncate">{shortName(emp)}</b><RestDays emp={emp} roster={roster} monthKey={monthKey} /></span>
                                        {note && <span className="block text-[11px] text-amber-700 font-semibold truncate"><MessageSquare size={10} className="inline" /> {note}</span>}
                                    </span>
                                    <span className={`min-w-[64px] px-2.5 py-1.5 rounded-lg border text-xs font-black text-center ${key === 'UNASSIGNED' ? 'border-dashed border-gray-200 text-gray-400' : cfg.color}`}>
                                        {key === 'UNASSIGNED' ? '未排' : cfg.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );

    /** 个人：选一个人，看整个月的日历 */
    const renderPersonal = () => {
        if (!personalEmp) return null;
        const lead = (weekdayOf(monthDays[0]) + 6) % 7; // 周一开头
        return (
            <div className="space-y-3">
                <div className="flex overflow-x-auto gap-1.5 hide-scrollbar -mx-2 px-2">
                    {filteredEmployees.map(emp => (
                        <button key={emp.id} type="button" onClick={() => setPersonalEmpId(emp.id)}
                            className={`flex-none px-3 rounded-full text-[13px] font-bold border ${emp.id === personalEmp.id ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : 'bg-white text-gray-600 border-gray-200'}`} style={{ minHeight: '36px' }}>
                            {shortName(emp)}
                        </button>
                    ))}
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <b className="text-sm font-black text-gray-900">{personalEmp.name}</b>
                        <RestDays emp={personalEmp} roster={roster} monthKey={monthKey} />
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                        {['一', '二', '三', '四', '五', '六', '日'].map((w, i) => <div key={w} className={`text-[10px] font-bold ${i >= 5 ? 'text-rose-500' : 'text-gray-400'}`}>{w}</div>)}
                        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
                        {monthDays.map(d => {
                            const key = statusOf(roster, d, personalEmp.id);
                            const cfg = cfgOf(key);
                            return (
                                <button key={d} type="button" onClick={() => tapCell(personalEmp.id, d)}
                                    className={`h-12 rounded-lg border flex flex-col items-center justify-center active:scale-95 ${key === 'UNASSIGNED' ? 'border-dashed border-gray-200 text-gray-300' : cfg.color} ${d === today ? 'ring-2 ring-[#FFD200]' : ''}`}>
                                    <span className="text-[10px] font-bold opacity-70 leading-none">{parseInt(d.substring(8))}</span>
                                    <span className="text-[12px] font-black leading-tight">{key === 'UNASSIGNED' ? '·' : cfg.short}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-[#F6F7FB] relative overflow-hidden text-gray-900 w-full">
            {/* 1. 标题列：返回 · 排班 · 状态 · 刷新 · 更多 */}
            <div className="shrink-0 bg-gray-900 px-3 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] flex items-center gap-2 z-20">
                <button onClick={onClose} className="w-10 h-10 bg-gray-800 text-gray-200 rounded-full flex items-center justify-center shrink-0" aria-label="Back" id="roster-back-btn">
                    <ArrowLeft size={18} className="stroke-[2.5]" />
                </button>
                <h2 className="text-white font-black text-[16px] truncate">排班</h2>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${isError ? 'bg-red-100 text-red-700' : isDraft ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                    {isError ? '发布失败' : isDraft ? '草稿' : '已发布'}
                </span>
                {isModified && <span className="text-[11px] text-orange-300 font-bold shrink-0 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />未保存</span>}
                <div className="flex-1" />
                <button onClick={onRefresh} className="w-10 h-10 bg-gray-800 text-gray-300 rounded-lg flex items-center justify-center shrink-0" aria-label="Refresh">
                    <RefreshCw size={16} className={saving ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => setIsMoreMenuOpen(true)} className="w-10 h-10 bg-gray-800 text-gray-300 rounded-lg flex items-center justify-center shrink-0" aria-label="More">
                    <MoreHorizontal size={18} />
                </button>
            </div>

            {/* 2. 视图 + 部门 + 日期，同一块白底 */}
            <div className="shrink-0 bg-white border-b border-gray-200 z-20 px-3 pt-2 pb-2 space-y-2">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    {([['WEEK', '周'], ['MONTH', '月'], ['DAILY', '日'], ['PERSONAL', '个人']] as const).map(([id, label]) => (
                        <button key={id} onClick={() => onChangeView(id)}
                            className={`flex-1 rounded-lg text-sm font-bold transition-all ${currentView === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`} style={{ minHeight: '36px' }}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex overflow-x-auto gap-1.5 hide-scrollbar">
                    {DEPTS.map(([dept, label]) => (
                        <button key={dept} onClick={() => onChangeDeptFilter(dept)}
                            className={`flex-none px-3.5 rounded-full text-xs transition-colors ${deptFilter === dept ? 'bg-[#111111] text-[#FFD200] font-bold' : 'bg-white border border-gray-200 text-gray-600 font-medium'}`} style={{ minHeight: '34px' }}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handlePrev} className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center active:scale-95" aria-label="Previous"><ChevronLeft size={20} /></button>
                    <label className="relative flex-1 text-center">
                        <span className="text-[15px] font-black text-gray-900">{navLabel}</span>
                        {/* 点日期可以直接跳到别的月份 / 日子 */}
                        {isMonthNav
                            ? <input type="month" value={monthKey} onChange={e => e.target.value && onChangeMonth(e.target.value)} className="absolute inset-0 opacity-0" aria-label="选择月份" />
                            : <input type="date" value={selectedDate} onChange={e => e.target.value && goDate(e.target.value)} className="absolute inset-0 opacity-0" aria-label="选择日期" />}
                    </label>
                    {!atToday && <button onClick={() => isMonthNav ? onChangeMonth(today.substring(0, 7)) : goDate(today)} className="px-2.5 h-8 rounded-lg bg-[#FFD200] text-[#111111] text-xs font-black">今天</button>}
                    <button onClick={handleNext} className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center active:scale-95" aria-label="Next"><ChevronRight size={20} /></button>
                </div>
                {!readOnly && (
                    <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
                        <span className="flex-none flex items-center gap-1 text-[11px] font-bold text-gray-400 pr-0.5"><Hand size={12} />快速填</span>
                        {brushOptions.map(key => {
                            const cfg = cfgOf(key);
                            const on = brush === key;
                            return (
                                <button key={key} type="button" onClick={() => setBrush(on ? null : key)}
                                    className={`flex-none px-2.5 rounded-lg border text-xs font-black ${on ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : key === 'UNASSIGNED' ? 'bg-white border-dashed border-gray-300 text-gray-500' : cfg.color}`} style={{ minHeight: '32px' }}>
                                    {key === 'UNASSIGNED' ? '清除' : cfg.short}
                                </button>
                            );
                        })}
                    </div>
                )}
                {brush && <p className="text-[11px] font-bold text-amber-700">点格子直接填「{brush === 'UNASSIGNED' ? '清除' : cfgOf(brush).label}」，再点一次取消。用完再按一次上面的按钮关掉。</p>}
            </div>

            {/* 3. 内容 */}
            <div className="flex-1 min-h-0 overflow-auto overscroll-contain pb-[calc(96px+env(safe-area-inset-bottom))]">
                <div className="px-2 py-3">
                    {filteredEmployees.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">没有找到该部门的员工</div>
                    ) : currentView === 'DAILY' ? renderDaily()
                        : currentView === 'PERSONAL' ? renderPersonal()
                        : renderGrid(currentView === 'WEEK' ? weekDays : monthDays)}
                </div>
            </div>

            {/* 4. 底部：保存 / 发布 */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)] z-30">
                <div className="p-3 flex items-center gap-3">
                    <button onClick={onSaveDraft} disabled={saving}
                        className="flex-[4] relative bg-white border border-gray-300 text-gray-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50" style={{ minHeight: '52px' }}>
                        <Save size={18} />
                        {saving ? '保存中...' : '保存草稿'}
                        {isModified && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange-500 border-2 border-white"></span>}
                    </button>
                    <button onClick={onPublishClick}
                        className="flex-[6] bg-gray-900 text-[#FFD200] rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md" style={{ minHeight: '52px' }}>
                        <Send size={18} />
                        发布正式
                    </button>
                </div>
            </div>

            {/* 5. 更多 */}
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
                            <button onClick={() => { onToggleShiftMode(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><SlidersHorizontal size={20} /></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-gray-900">{isMultiShiftMode ? '多班次模式（早 / 中 / 晚）' : '常规单班模式'}</div>
                                    <div className="text-[11px] text-gray-500">点击切换排班模式</div>
                                </div>
                            </button>
                            {onAutoFillWork && (
                                <button onClick={() => { onAutoFillWork(); setIsMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-green-50 active:bg-green-100 transition-colors text-left">
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CheckSquare size={20} /></div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-green-700">一键常规班 (W)</div>
                                        <div className="text-[11px] text-green-600/70">将本月未排班格子全部填为W</div>
                                    </div>
                                </button>
                            )}
                            <button onClick={() => { onExportClick(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Download size={20} /></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-gray-900">导出排班</div>
                                    <div className="text-[11px] text-gray-500">导出 PDF 或 Excel</div>
                                </div>
                            </button>
                            <button onClick={() => { onResetClick(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors text-left">
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

            {/* 6. 设置一格班次 */}
            {activeSheetEmpId && activeSheetEmp && (
                <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={handleCloseSheet} />
                    <div className="relative w-full bg-white rounded-t-[20px] shadow-2xl flex flex-col max-h-[85dvh]">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-4 mb-2 shrink-0" onClick={handleCloseSheet} />
                        <div className="px-5 pb-3 pt-1 border-b border-gray-100 shrink-0">
                            <h3 className="text-lg font-black text-gray-900">{shortName(activeSheetEmp)}</h3>
                            <p className="text-xs font-bold text-gray-500 mt-0.5">{parseInt(sheetDate.substring(5, 7))}月{parseInt(sheetDate.substring(8))}日 周{WEEKDAY[weekdayOf(sheetDate)]}</p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 overscroll-contain">
                            <div className="grid grid-cols-3 gap-2">
                                {Object.values(ROSTER_STATUSES).map(item => {
                                    const isSel = statusOf(roster, sheetDate, activeSheetEmpId) === item.id;
                                    return (
                                        <button key={item.id} onClick={() => handleSelectStatus(item.id)}
                                            className={`px-2 py-2.5 rounded-xl border text-sm font-bold ${isSel ? 'border-gray-900 bg-gray-900 text-white shadow-md' : item.id === 'UNASSIGNED' ? 'border-dashed border-gray-300 text-gray-500' : item.color}`}
                                            style={{ minHeight: '48px' }}>
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-400">备注</label>
                                <input type="text" placeholder="假条或调整原因…" value={sheetNoteText} onChange={(e) => setSheetNoteText(e.target.value)}
                                    className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none bg-gray-50" style={{ minHeight: '48px' }} />
                            </div>
                        </div>
                        <div className="shrink-0 p-4 border-t border-gray-100 pb-[calc(16px+env(safe-area-inset-bottom))] flex gap-3 bg-white">
                            <button onClick={handleCloseSheet} className="flex-[3] rounded-xl font-bold text-sm bg-gray-100 text-gray-700" style={{ minHeight: '48px' }}>取消</button>
                            <button onClick={handleSaveSheetNote} className="flex-[7] rounded-xl font-bold text-sm bg-gray-900 text-white shadow-md" style={{ minHeight: '48px' }}>保存备注</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
