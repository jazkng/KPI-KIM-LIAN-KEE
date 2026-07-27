import React, { useState } from 'react';
import { getEmployeeDept, getDeptLabel } from './rosterUtils';
import { ROSTER_STATUSES } from './rosterConstants';
import { Users, Clock, ShieldAlert, CheckCircle, Save, Settings2, Sliders } from 'lucide-react';

interface RosterDailyCoverageProps {
    employees: any[];
    monthKey: string;
    roster: Record<string, Record<string, string>>;
    minCoverage: Record<string, number>;
    shiftTimes: Record<string, string>;
    onSaveConfig: (newMinCoverage: Record<string, number>, newShiftTimes: Record<string, string>) => void;
}

export const RosterDailyCoverage: React.FC<RosterDailyCoverageProps> = ({
    employees,
    monthKey,
    roster,
    minCoverage,
    shiftTimes,
    onSaveConfig
}) => {
    // Determine list of days in this month Key
    const [yr, mo] = monthKey.split('-');
    const daysInMonthCount = new Date(parseInt(yr), parseInt(mo), 0).getDate();
    const days = Array.from({ length: daysInMonthCount }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);

    // Track chosen date
    const [selectedDate, setSelectedDate] = useState<string>(days[0] || `${monthKey}-01`);

    // Edit states for dynamic configurations
    const [editMinCoverage, setEditMinCoverage] = useState<Record<string, number>>({ ...minCoverage });
    const [editShiftTimes, setEditShiftTimes] = useState<Record<string, string>>({ ...shiftTimes });
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Sync settings if props change
    React.useEffect(() => {
        setEditMinCoverage({ ...minCoverage });
        setEditShiftTimes({ ...shiftTimes });
    }, [minCoverage, shiftTimes]);

    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');
    const dayRoster = roster[selectedDate] || {};

    // Grouping employees by their scheduled roster status on selectedDate
    const groupMorning: any[] = [];
    const groupAfternoon: any[] = [];
    const groupNight: any[] = [];
    const groupWork: any[] = [];
    const groupOff: any[] = []; // OFF, LEAVE, MC, ABSENT

    activeEmployees.forEach(emp => {
        const status = dayRoster[emp.id] || 'UNASSIGNED';
        const empWithStatus = { ...emp, statusKey: status };

        if (status === 'MORNING') groupMorning.push(empWithStatus);
        else if (status === 'AFTERNOON') groupAfternoon.push(empWithStatus);
        else if (status === 'NIGHT') groupNight.push(empWithStatus);
        else if (status === 'WORK') groupWork.push(empWithStatus);
        else if (['OFF', 'LEAVE', 'MC', 'ABSENT', 'ANNUAL', 'HOLIDAY'].includes(status)) {
            groupOff.push(empWithStatus);
        }
    });

    // Calculate live department coverage
    const getDeptWorkingCount = (dept: string) => {
        return activeEmployees.filter(emp => {
            if (getEmployeeDept(emp) !== dept) return false;
            const status = dayRoster[emp.id] || 'UNASSIGNED';
            return !['OFF', 'LEAVE', 'MC', 'ABSENT', 'UNASSIGNED', 'PENDING'].includes(status);
        }).length;
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            await onSaveConfig(editMinCoverage, editShiftTimes);
            alert('人员配额与班次时间已保存至云端 (Configurations saved to cloud)');
        } catch (e) {
            console.error(e);
        } finally {
            setIsSavingSettings(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column (2 cols width on lg): Shifts breakdown list */}
            <div className="lg:col-span-2 space-y-6">
                {/* Date Selector Banner */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-base font-bold text-gray-800">在岗值班明细 (Duty Roster Breakdown)</h3>
                        <p className="text-xs text-gray-400 mt-0.5">查看和校验每日具体班次的分配细节</p>
                    </div>
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-gray-50 border border-gray-200 text-sm font-bold text-gray-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all w-full md:w-48"
                        id="daily-date-select"
                    >
                        {days.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>

                {/* Shift Panels */}
                <div className="space-y-4">
                    {/* MORNING SHIFT */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="text-amber-600" size={16} />
                                <span className="font-bold text-amber-900 text-sm">早班 (Morning Shift)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded-full">
                                {shiftTimes.MORNING}
                            </span>
                        </div>
                        <div className="p-4">
                            {groupMorning.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">无人员安排 (No staff assigned)</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupMorning.map(emp => (
                                        <div key={emp.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-xs flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">{emp.name}</p>
                                                <p className="text-gray-400 font-mono text-[10px] mt-0.5">{emp.role}</p>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[9px]">
                                                {getEmployeeDept(emp)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* AFTERNOON SHIFT */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="text-sky-600" size={16} />
                                <span className="font-bold text-sky-900 text-sm">中班 (Afternoon Shift)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-sky-700 bg-sky-100/50 px-2 py-0.5 rounded-full">
                                {shiftTimes.AFTERNOON}
                            </span>
                        </div>
                        <div className="p-4">
                            {groupAfternoon.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">无人员安排 (No staff assigned)</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupAfternoon.map(emp => (
                                        <div key={emp.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-xs flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">{emp.name}</p>
                                                <p className="text-gray-400 font-mono text-[10px] mt-0.5">{emp.role}</p>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold text-[9px]">
                                                {getEmployeeDept(emp)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* NIGHT SHIFT */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="text-indigo-600" size={16} />
                                <span className="font-bold text-indigo-900 text-sm">晚班 (Night Shift)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100/50 px-2 py-0.5 rounded-full">
                                {shiftTimes.NIGHT}
                            </span>
                        </div>
                        <div className="p-4">
                            {groupNight.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">无人员安排 (No staff assigned)</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupNight.map(emp => (
                                        <div key={emp.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-xs flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">{emp.name}</p>
                                                <p className="text-gray-400 font-mono text-[10px] mt-0.5">{emp.role}</p>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[9px]">
                                                {getEmployeeDept(emp)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* GENERAL WORK */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 bg-green-50 border-b border-green-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="text-green-600" size={16} />
                                <span className="font-bold text-green-900 text-sm">常规班 (General Work)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-green-700 bg-green-100/50 px-2 py-0.5 rounded-full">
                                常规时间 (General Hours)
                            </span>
                        </div>
                        <div className="p-4">
                            {groupWork.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">无人员安排 (No staff assigned)</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupWork.map(emp => (
                                        <div key={emp.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-xs flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">{emp.name}</p>
                                                <p className="text-gray-400 font-mono text-[10px] mt-0.5">{emp.role}</p>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-bold text-[9px]">
                                                {getEmployeeDept(emp)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* REST DAYS AND ABSENCES */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 bg-gray-100 border-b border-gray-200 flex items-center gap-2">
                            <Users className="text-gray-600" size={16} />
                            <span className="font-bold text-gray-800 text-sm">休息/假期 (Off-duty & Leaves)</span>
                        </div>
                        <div className="p-4">
                            {groupOff.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">全员在岗</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupOff.map(emp => {
                                        const statItem = ROSTER_STATUSES[emp.statusKey] || ROSTER_STATUSES.OFF;
                                        return (
                                            <div key={emp.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-xs flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-gray-500 line-through">{emp.name}</p>
                                                    <p className="text-gray-400 font-mono text-[10px] mt-0.5">{emp.role}</p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${statItem.color}`}>
                                                    {statItem.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column (1 col): Staffing Demand Settings */}
            <div className="space-y-6">
                {/* Daily Coverage Audit Widget */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <Sliders className="text-gray-600" size={16} />
                        值班人手状态 (Audit Panel)
                    </h3>

                    <div className="space-y-3.5">
                        {['KITCHEN', 'FLOOR', 'BAR', 'DISH'].map(dept => {
                            const current = getDeptWorkingCount(dept);
                            const minRequired = minCoverage[dept] || 0;
                            const isShort = current < minRequired;

                            return (
                                <div key={dept} className={`p-3 rounded-xl border transition-colors flex justify-between items-center ${
                                    isShort ? 'bg-red-50 border-red-200 text-red-900' : 'bg-gray-50 border-gray-100 text-gray-800'
                                }`}>
                                    <div>
                                        <p className="text-xs font-bold">{getDeptLabel(dept)}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">目标需求: {minRequired} 人</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-base font-black font-mono ${isShort ? 'text-red-600' : 'text-gray-900'}`}>
                                            {current} / {minRequired}
                                        </span>
                                        <div className="mt-0.5 flex justify-end">
                                            {isShort ? (
                                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-500 animate-pulse">
                                                    <ShieldAlert size={10} /> 缺人警告!
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-green-600">
                                                    <CheckCircle size={10} /> 达标
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Configuration editor panel */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                        <Settings2 className="text-[#FFD200]" size={18} />
                        <h3 className="text-sm font-bold text-gray-800">
                            排班配额与班次设置
                        </h3>
                    </div>

                    {/* Department Thresholds */}
                    <div className="space-y-3">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            各部门每日最低在岗人数 (Min Demand)
                        </p>
                        {['KITCHEN', 'FLOOR', 'BAR', 'DISH'].map(dept => (
                            <div key={dept} className="flex items-center justify-between gap-4 text-xs">
                                <span className="font-semibold text-gray-700">{getDeptLabel(dept)}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    value={editMinCoverage[dept] ?? 0}
                                    onChange={(e) => setEditMinCoverage({
                                        ...editMinCoverage,
                                        [dept]: Math.max(0, parseInt(e.target.value) || 0)
                                    })}
                                    className="w-16 px-2 py-1 border border-gray-200 rounded text-center font-bold focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all"
                                    id={`input-demand-${dept}`}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Shift Times */}
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            班次工作时间设定 (Shift Hours)
                        </p>
                        {['MORNING', 'AFTERNOON', 'NIGHT'].map(shift => {
                            const labels: Record<string, string> = {
                                MORNING: '早班时间:',
                                AFTERNOON: '中班时间:',
                                NIGHT: '晚班时间:'
                            };
                            return (
                                <div key={shift} className="flex flex-col gap-1 text-xs">
                                    <span className="font-semibold text-gray-600">{labels[shift]}</span>
                                    <input
                                        type="text"
                                        value={editShiftTimes[shift] ?? ''}
                                        placeholder="e.g. 10:00-18:00"
                                        onChange={(e) => setEditShiftTimes({
                                            ...editShiftTimes,
                                            [shift]: e.target.value
                                        })}
                                        className="w-full px-3 py-1.5 border border-gray-200 rounded font-mono focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all"
                                        id={`input-time-${shift}`}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    <button
                        onClick={handleSaveSettings}
                        disabled={isSavingSettings}
                        className="w-full mt-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-gray-900/10 transition-colors disabled:opacity-50"
                        style={{ minHeight: '44px' }}
                        id="save-settings-btn"
                    >
                        <Save size={14} />
                        {isSavingSettings ? '正在保存...' : '保存配额与班次 (Save Config)'}
                    </button>
                </div>
            </div>
        </div>
    );
};
