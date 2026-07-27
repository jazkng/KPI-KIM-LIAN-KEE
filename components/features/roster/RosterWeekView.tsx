import React, { useState, useEffect } from 'react';
import { RosterCell } from './RosterCell';
import { getDayOfWeekText, getEmployeeDept } from './rosterUtils';
import { ChevronLeft, ChevronRight, Calendar, AlertCircle } from 'lucide-react';

interface RosterWeekViewProps {
    employees: any[];
    monthKey: string;
    roster: Record<string, Record<string, string>>;
    notes: Record<string, string>;
    onChangeCell: (date: string, employeeId: string, status: string) => void;
    onOpenPicker: (date: string, employeeId: string, rect: DOMRect) => void;
    onOpenNote: (date: string, employeeId: string) => void;
    customHolidays?: any[];
    minCoverage?: Record<string, number>;
    readOnly?: boolean;
}

export const RosterWeekView: React.FC<RosterWeekViewProps> = ({
    employees,
    monthKey,
    roster,
    notes,
    onChangeCell,
    onOpenPicker,
    onOpenNote,
    customHolidays = [],
    minCoverage = {},
    readOnly = false
}) => {
    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');

    // State for the active starting date of the 7-day view
    const [anchorDate, setAnchorDate] = useState<Date>(new Date());

    // Sync anchorDate when month changes
    useEffect(() => {
        const [yr, mo] = monthKey.split('-');
        setAnchorDate(new Date(parseInt(yr), parseInt(mo) - 1, 1));
    }, [monthKey]);

    // Get the Monday of the week containing anchorDate
    const getMonday = (d: Date): Date => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        return new Date(date.setDate(diff));
    };

    const monday = getMonday(anchorDate);

    // Generate the 7 days of this week
    const weekDays: string[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, '0');
        const date = String(day.getDate()).padStart(2, '0');
        weekDays.push(`${year}-${month}-${date}`);
    }

    const handlePrevWeek = () => {
        const newD = new Date(monday);
        newD.setDate(monday.getDate() - 7);
        setAnchorDate(newD);
    };

    const handleNextWeek = () => {
        const newD = new Date(monday);
        newD.setDate(monday.getDate() + 7);
        setAnchorDate(newD);
    };

    const getHolidayName = (day: string) => {
        const h = customHolidays.find(item => item.date === day);
        return h ? h.name : null;
    };

    const getDailyCoverageCount = (day: string, dept: string) => {
        const dayRoster = roster[day] || {};
        return activeEmployees.filter(emp => {
            if (getEmployeeDept(emp) !== dept) return false;
            const status = dayRoster[emp.id] || 'UNASSIGNED';
            return !['OFF', 'LEAVE', 'MC', 'ABSENT', 'PENDING'].includes(status);
        }).length;
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            {/* Week Controller Header */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Calendar className="text-gray-600" size={16} />
                    <span className="text-xs font-bold text-gray-700">
                        当前周期: {weekDays[0]} ~ {weekDays[6]}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handlePrevWeek}
                        className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                        title="上一周 (Prev Week)"
                        id="prev-week-btn"
                        style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={() => setAnchorDate(new Date())}
                        className="px-2.5 py-1 text-xs border border-gray-200 hover:bg-gray-100 rounded-lg font-semibold text-gray-600 transition-colors"
                        id="current-week-btn"
                        style={{ minHeight: '32px' }}
                    >
                        回到本周
                    </button>
                    <button
                        onClick={handleNextWeek}
                        className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                        title="下一周 (Next Week)"
                        id="next-week-btn"
                        style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Week Table */}
            <div className="overflow-auto max-h-[500px]">
                <table className="w-full border-collapse text-left text-xs min-w-[700px]">
                    <thead>
                        <tr className="bg-gray-900 text-white font-semibold height-12 h-12">
                            <th className="sticky left-0 top-0 z-40 bg-gray-900 text-[#FFD200] font-black text-xs px-4 py-2 border-r border-b border-gray-800 text-center w-[140px] whitespace-nowrap">
                                员工信息 (Staff)
                            </th>
                            <th className="sticky left-[140px] top-0 z-40 bg-gray-900 text-gray-300 font-bold px-3 py-2 border-r border-b border-gray-800 text-center w-[100px] whitespace-nowrap">
                                职位/部门
                            </th>
                            {weekDays.map((day) => {
                                const dInfo = getDayOfWeekText(day);
                                const isWe = dInfo.short === 'Sat' || dInfo.short === 'Sun';
                                const holName = getHolidayName(day);
                                const dNum = day.split('-')[2];
                                const mNum = day.split('-')[1];
                                return (
                                    <th 
                                        key={day} 
                                        className={`top-0 sticky border-b border-r border-gray-800 text-center px-1 py-1.5 ${
                                            isWe ? 'bg-gray-800' : 'bg-gray-900'
                                        } ${holName ? 'text-pink-400 font-bold' : ''}`}
                                    >
                                        <div className="font-mono text-sm">{mNum}/{dNum}</div>
                                        <div className="text-[10px] text-gray-400 font-normal">{dInfo.zh}</div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {activeEmployees.map((emp) => {
                            const dept = getEmployeeDept(emp);
                            return (
                                <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors h-14">
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

                                    {/* 7 columns */}
                                    {weekDays.map((day) => {
                                        const dayRoster = roster[day] || {};
                                        const status = dayRoster[emp.id] || 'UNASSIGNED';
                                        const note = notes[`${day}_${emp.id}`];
                                        const dInfo = getDayOfWeekText(day);
                                        const isWe = dInfo.short === 'Sat' || dInfo.short === 'Sun';
                                        const holName = getHolidayName(day);
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        const isToday = day === todayStr;

                                        return (
                                            <td key={day} className="p-1.5 border-r border-b border-gray-100">
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

                        {/* Summary coverage */}
                        <tr className="bg-gray-900 text-white font-semibold border-t-2 border-gray-950">
                            <td colSpan={2} className="sticky left-0 z-20 bg-gray-950 px-4 py-3 font-bold border-r border-gray-800 text-center">
                                部门在岗数 (Coverage)
                            </td>
                            {weekDays.map((day) => {
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
                                            <div className="text-emerald-400">厨:{getDailyCoverageCount(day, 'KITCHEN')}</div>
                                            <div className="text-sky-400">楼:{getDailyCoverageCount(day, 'FLOOR')}</div>
                                            <div className="text-amber-400">吧:{getDailyCoverageCount(day, 'BAR')}</div>
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};
