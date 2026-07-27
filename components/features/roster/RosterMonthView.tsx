import React from 'react';
import { RosterCell } from './RosterCell';
import { getDayOfWeekText, getEmployeeDept } from './rosterUtils';
import { AlertCircle } from 'lucide-react';

interface RosterMonthViewProps {
    employees: any[];
    days: string[];
    roster: Record<string, Record<string, string>>;
    notes: Record<string, string>;
    onChangeCell: (date: string, employeeId: string, status: string) => void;
    onOpenPicker: (date: string, employeeId: string, rect: DOMRect) => void;
    onOpenNote: (date: string, employeeId: string) => void;
    customHolidays?: any[];
    minCoverage?: Record<string, number>;
    readOnly?: boolean;
}

export const RosterMonthView: React.FC<RosterMonthViewProps> = ({
    employees,
    days,
    roster,
    notes,
    onChangeCell,
    onOpenPicker,
    onOpenNote,
    customHolidays = [],
    minCoverage = {},
    readOnly = false
}) => {
    // Filter active employees
    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');

    const getHolidayName = (day: string) => {
        const h = customHolidays.find(item => item.date === day);
        return h ? h.name : null;
    };

    // Calculate daily coverage for a department
    const getDailyCoverageCount = (day: string, dept: string) => {
        const dayRoster = roster[day] || {};
        return activeEmployees.filter(emp => {
            if (getEmployeeDept(emp) !== dept) return false;
            const status = dayRoster[emp.id] || 'UNASSIGNED';
            // Count as working if status is standard work or custom shifts (MORNING, AFTERNOON, NIGHT) (UNASSIGNED defaults to WORK)
            return !['OFF', 'LEAVE', 'MC', 'ABSENT', 'PENDING'].includes(status);
        }).length;
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            {/* Scroll Container */}
            <div className="overflow-auto max-h-[640px] relative">
                <table className="w-full border-collapse text-left text-xs min-w-[1200px]">
                    <thead>
                        {/* Row 1: Calendar Days */}
                        <tr className="bg-gray-900 text-white font-semibold height-12 h-12">
                            <th className="sticky left-0 top-0 z-40 bg-gray-900 text-[#FFD200] font-black text-xs px-4 py-2 border-r border-b border-gray-800 text-center w-[140px] whitespace-nowrap">
                                员工信息 (Staff)
                            </th>
                            <th className="sticky left-[140px] top-0 z-40 bg-gray-900 text-gray-300 font-bold px-3 py-2 border-r border-b border-gray-800 text-center w-[110px] whitespace-nowrap">
                                职位/部门 (Role)
                            </th>
                            {days.map((day) => {
                                const dNum = day.split('-')[2];
                                const dInfo = getDayOfWeekText(day);
                                const isWe = dInfo.short === 'Sat' || dInfo.short === 'Sun';
                                const holName = getHolidayName(day);
                                return (
                                    <th 
                                        key={day} 
                                        className={`top-0 z-30 sticky border-b border-r border-gray-800 text-center min-w-[46px] px-1 py-1.5 ${
                                            isWe ? 'bg-gray-800' : 'bg-gray-900'
                                        } ${holName ? 'text-pink-400 font-bold' : ''}`}
                                    >
                                        <div className="font-mono text-sm">{dNum}</div>
                                        <div className="text-[9px] text-gray-400 font-normal">{dInfo.zh}</div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {activeEmployees.map((emp) => {
                            const dept = getEmployeeDept(emp);
                            return (
                                <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors h-14" id={`month-row-${emp.id}`}>
                                    {/* Column 1: Name (sticky) */}
                                    <td className="sticky left-0 z-20 bg-white px-4 py-2 font-bold text-gray-800 border-r border-b border-gray-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)] whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm">{emp.name}</span>
                                            <span className="text-[10px] text-gray-400 font-mono">ID: {emp.id}</span>
                                        </div>
                                    </td>
                                    {/* Column 2: Role (sticky) */}
                                    <td className="sticky left-[140px] z-20 bg-white px-3 py-2 text-gray-500 border-r border-b border-gray-200 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-medium text-gray-700">{emp.role}</span>
                                            <span className="text-[9px] text-gray-400 font-mono bg-gray-100 rounded px-1 w-fit mt-0.5">
                                                {dept}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Calendar cells */}
                                    {days.map((day) => {
                                        const dayRoster = roster[day] || {};
                                        const status = dayRoster[emp.id] || 'UNASSIGNED';
                                        const note = notes[`${day}_${emp.id}`];
                                        const dInfo = getDayOfWeekText(day);
                                        const isWe = dInfo.short === 'Sat' || dInfo.short === 'Sun';
                                        const holName = getHolidayName(day);
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        const isToday = day === todayStr;

                                        return (
                                            <td key={day} className="p-1 border-r border-b border-gray-100 min-w-[46px]" id={`td-${day}-${emp.id}`}>
                                                <RosterCell
                                                    status={status}
                                                    note={note}
                                                    dateStr={day}
                                                    isWeekend={isWe}
                                                    isHoliday={!!holName}
                                                    holidayName={holName}
                                                    isToday={isToday}
                                                    onChangeStatus={(newS) => onChangeCell(day, emp.id, newS)}
                                                    onOpenPicker={(rect) => onOpenPicker(day, emp.id, rect)}
                                                    onOpenNote={() => onOpenNote(day, emp.id)}
                                                    readOnly={readOnly}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}

                        {/* Summary Block: Daily Department Counts & Shortage Warnings */}
                        <tr className="bg-gray-900 text-white font-semibold height-12 border-t-2 border-gray-950">
                            <td colSpan={2} className="sticky left-0 z-20 bg-gray-950 px-4 py-3 font-bold border-r border-gray-800 text-center">
                                部门在岗人数 (Coverage)
                            </td>
                            {days.map((day) => {
                                // Check if any department on this day is understaffed
                                let hasDeficit = false;
                                const depts = ['KITCHEN', 'FLOOR', 'BAR', 'DISH'];
                                depts.forEach(dept => {
                                    const count = getDailyCoverageCount(day, dept);
                                    const min = minCoverage[dept] || 0;
                                    if (count < min) hasDeficit = true;
                                });

                                return (
                                    <td 
                                        key={day} 
                                        className={`border-r border-gray-800 p-1 text-center font-mono align-middle ${
                                            hasDeficit ? 'bg-red-950/70 border-red-900' : 'bg-gray-900'
                                        }`}
                                    >
                                        <div className="flex flex-col items-center justify-center space-y-0.5 text-[9px] font-bold">
                                            {hasDeficit && (
                                                <AlertCircle className="text-red-400 animate-pulse" size={12} />
                                            )}
                                            <div className="text-emerald-400" title="厨房">厨:{getDailyCoverageCount(day, 'KITCHEN')}</div>
                                            <div className="text-sky-400" title="楼面">楼:{getDailyCoverageCount(day, 'FLOOR')}</div>
                                            <div className="text-amber-400" title="吧台">吧:{getDailyCoverageCount(day, 'BAR')}</div>
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Hint guidelines */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-6 text-[11px] text-gray-500 font-medium">
                <p>💡 <span className="font-bold text-gray-700">操作提示 (Tips):</span> 单击任意单元格打开快捷状态面板，双击格子可快速切换 "OFF (休息)" 或 "未排班" 状态。</p>
                <p className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-red-900/30 rounded border border-red-800 inline-block"></span>
                    <span>红色高亮列表示当天在岗人数低于最低安全配额，请及时补齐人手。</span>
                </p>
            </div>
        </div>
    );
};
