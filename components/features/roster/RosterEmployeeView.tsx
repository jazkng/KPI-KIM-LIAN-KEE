import React, { useState } from 'react';
import { getDaysInMonth, getDayOfWeekText, getHolidayName, getEmployeeDept } from './rosterUtils';
import { ROSTER_STATUSES } from './rosterConstants';
import { Calendar, User, Briefcase, Activity, CheckCircle, Clock } from 'lucide-react';

interface RosterEmployeeViewProps {
    employees: any[];
    monthKey: string;
    roster: Record<string, Record<string, string>>;
    notes: Record<string, string>;
    customHolidays?: any[];
}

export const RosterEmployeeView: React.FC<RosterEmployeeViewProps> = ({
    employees,
    monthKey,
    roster,
    notes,
    customHolidays = []
}) => {
    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');
    
    // Track selected employee
    const [selectedEmpId, setSelectedEmpId] = useState<string>(
        activeEmployees[0]?.id || ''
    );

    const selectedEmp = activeEmployees.find(e => e.id === selectedEmpId);

    // Date generation for the selected monthKey
    const days = getDaysInMonth(monthKey);

    // To render a true grid calendar (Mon to Sun), we need to check what day of week the 1st falls on
    // Day index: Monday=1, Tuesday=2, ... Sunday=0 (so we map Sunday=7)
    const getFirstDayOffset = (dateStr: string): number => {
        const date = new Date(dateStr);
        const day = date.getDay(); // 0-6 (Sun-Sat)
        return day === 0 ? 6 : day - 1; // offset: Mon=0, Tue=1 ... Sun=6
    };

    const firstDateStr = days[0] || `${monthKey}-01`;
    const offsetDays = getFirstDayOffset(firstDateStr);

    // Build the grid items (offset padding days + actual days)
    const calendarGrid: { date?: string; isPadding: boolean }[] = [];
    
    // Add prefix padding days from previous month
    for (let i = 0; i < offsetDays; i++) {
        calendarGrid.push({ isPadding: true });
    }

    // Add actual days of the month
    days.forEach(day => {
        calendarGrid.push({ date: day, isPadding: false });
    });

    // Stats calculations
    let workCount = 0;
    let offCount = 0;
    let leaveCount = 0;
    let mcCount = 0;

    if (selectedEmpId) {
        days.forEach(day => {
            const status = (roster[day] || {})[selectedEmpId] || 'UNASSIGNED';
            if (status === 'WORK' || ['MORNING', 'AFTERNOON', 'NIGHT'].includes(status)) workCount++;
            else if (status === 'OFF') offCount++;
            else if (status === 'MC') mcCount++;
            else if (['LEAVE', 'ANNUAL', 'ABSENT'].includes(status)) leaveCount++;
        });
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar employee selector & Stats */}
            <div className="lg:col-span-1 space-y-6">
                {/* Selector */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <User className="text-[#FFD200]" size={16} />
                        选择查阅员工 (Select Employee)
                    </h3>
                    <select
                        value={selectedEmpId}
                        onChange={(e) => setSelectedEmpId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-sm font-bold text-gray-800 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all"
                        id="personal-emp-select"
                    >
                        <option value="">-- 请选择员工 --</option>
                        {activeEmployees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                [{emp.id}] {emp.name} ({emp.role})
                            </option>
                        ))}
                    </select>

                    {selectedEmp && (
                        <div className="pt-2 text-xs space-y-1 text-gray-500 font-medium">
                            <p className="flex justify-between"><span>姓名 (Name):</span> <span className="font-bold text-gray-800">{selectedEmp.name}</span></p>
                            <p className="flex justify-between"><span>工号 (ID):</span> <span className="font-mono font-bold text-gray-800">{selectedEmp.id}</span></p>
                            <p className="flex justify-between"><span>主责 (Role):</span> <span className="font-bold text-gray-800">{selectedEmp.role}</span></p>
                            <p className="flex justify-between"><span>部门 (Dept):</span> <span className="font-bold text-gray-800">{getEmployeeDept(selectedEmp)}</span></p>
                            <p className="flex justify-between"><span>月休天数:</span> <span className="font-bold text-indigo-600">{selectedEmp.monthlyRestDays || 4} 天</span></p>
                        </div>
                    )}
                </div>

                {/* Performance Stats Widget */}
                {selectedEmp && (
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <Activity className="text-gray-600" size={16} />
                            月度排班统计 (Monthly Stats)
                        </h3>

                        <div className="grid grid-cols-2 gap-3 text-center">
                            {/* Worked */}
                            <div className="p-3 bg-green-50/50 border border-green-100 rounded-xl">
                                <p className="text-[10px] text-green-700 font-semibold">排班上班 (Work)</p>
                                <p className="text-xl font-black font-mono text-green-800 mt-1">{workCount} 天</p>
                            </div>

                            {/* OFF */}
                            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                <p className="text-[10px] text-indigo-700 font-semibold">休息天数 (OFF)</p>
                                <p className="text-xl font-black font-mono text-indigo-800 mt-1">
                                    {offCount} / <span className="text-xs text-gray-400">{selectedEmp.monthlyRestDays || 4}</span>
                                </p>
                            </div>

                            {/* MC */}
                            <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl">
                                <p className="text-[10px] text-red-700 font-semibold">病假天数 (MC)</p>
                                <p className="text-xl font-black font-mono text-red-800 mt-1">{mcCount} 天</p>
                            </div>

                            {/* Leaves */}
                            <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                <p className="text-[10px] text-amber-700 font-semibold">事假/年假 (Leaves)</p>
                                <p className="text-xl font-black font-mono text-amber-800 mt-1">{leaveCount} 天</p>
                            </div>
                        </div>

                        {/* Audit check rest */}
                        <div className="pt-2 text-center">
                            {offCount >= (selectedEmp.monthlyRestDays || 4) ? (
                                <div className="p-2 bg-green-50 rounded-lg text-[11px] font-bold text-green-700 flex items-center justify-center gap-1.5 border border-green-100">
                                    <CheckCircle size={14} /> 休息日排期符合规范 (Compliant)
                                </div>
                            ) : (
                                <div className="p-2 bg-red-50 rounded-lg text-[11px] font-bold text-red-600 border border-red-100">
                                    ⚠️ 休息日不足 (缺 { (selectedEmp.monthlyRestDays || 4) - offCount } 天休息)
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column (3 cols width): Desktop Desk Calendar Grid */}
            <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full">
                {/* Calendar Grid */}
                <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <Calendar className="text-gray-600" size={16} />
                            月历视图 (Personal Desk Calendar)
                        </h2>
                        <span className="text-xs text-gray-400 font-mono">{monthKey}</span>
                    </div>

                    <div className="grid grid-cols-7 gap-1 bg-gray-100 p-1 rounded-xl">
                        {/* Column headers (Mon-Sun) */}
                        {['一 (Mon)', '二 (Tue)', '三 (Wed)', '四 (Thu)', '五 (Fri)', '六 (Sat)', '日 (Sun)'].map(header => (
                            <div key={header} className="text-center py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                {header}
                            </div>
                        ))}

                        {/* Calendar days cells */}
                        {calendarGrid.map((cell, idx) => {
                            if (cell.isPadding || !cell.date) {
                                return (
                                    <div 
                                        key={`pad-${idx}`} 
                                        className="bg-gray-50/40 rounded-lg border border-dashed border-gray-100 h-20 md:h-24"
                                    />
                                );
                            }

                            const dayStr = cell.date;
                            const dNum = dayStr.split('-')[2];
                            const statusKey = selectedEmpId ? ((roster[dayStr] || {})[selectedEmpId] || 'UNASSIGNED') : 'UNASSIGNED';
                            const statusConfig = ROSTER_STATUSES[statusKey] || ROSTER_STATUSES.UNASSIGNED;
                            const note = notes[`${dayStr}_${selectedEmpId}`];
                            const holName = getHolidayName(dayStr, customHolidays);
                            const isToday = dayStr === new Date().toISOString().split('T')[0];

                            return (
                                <div
                                    key={dayStr}
                                    className={`relative p-2 rounded-lg border flex flex-col justify-between h-20 md:h-24 transition-all ${
                                        isToday 
                                            ? 'ring-2 ring-[#FFD200] border-[#FFD200] bg-yellow-50/20 z-10' 
                                            : holName 
                                                ? 'border-pink-200 bg-pink-50/10' 
                                                : 'border-gray-200 bg-white hover:bg-gray-50/50'
                                    }`}
                                    id={`personal-cell-${dayStr}`}
                                >
                                    {/* Date Number & Holiday text */}
                                    <div className="flex justify-between items-start">
                                        <span className={`text-xs font-mono font-bold ${isToday ? 'text-[#FFD200]' : holName ? 'text-pink-600' : 'text-gray-800'}`}>
                                            {dNum}
                                        </span>
                                        {holName && (
                                            <span 
                                                className="text-[8px] bg-pink-100 text-pink-700 px-1 rounded-sm max-w-[40px] truncate" 
                                                title={holName}
                                            >
                                                {holName}
                                            </span>
                                        )}
                                    </div>

                                    {/* Status Indicator bubble */}
                                    {selectedEmpId ? (
                                        <div className={`py-1 px-1.5 rounded-md text-[10px] font-bold text-center border ${statusConfig.color}`}>
                                            {statusConfig.label}
                                        </div>
                                    ) : (
                                        <div className="h-6" />
                                    )}

                                    {/* Note hint line at bottom */}
                                    {note ? (
                                        <div className="text-[8px] text-yellow-600 truncate bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200">
                                            ✏️ {note}
                                        </div>
                                    ) : (
                                        <div className="h-2" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
