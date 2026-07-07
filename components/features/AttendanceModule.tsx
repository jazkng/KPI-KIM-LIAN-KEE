
import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, UserCheck } from 'lucide-react';
import { AttendanceRecord, Employee } from '../../types';
import { DataManager } from '../../utils/dataManager';

// HELPERS (加入默认值与防呆保护，防止数据库脏数据导致 NaN)
const formatDuration = (minutes: number = 0) => {
    const safeMinutes = Math.max(0, minutes || 0);
    const hrs = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    return `${hrs}h ${mins}m`;
};

// COMPONENT
// Simplified Props: We only need employee because manager mode is gone.
interface AttendanceModuleProps {
    employee?: Employee; 
}

export const AttendanceModule: React.FC<AttendanceModuleProps> = ({ employee }) => {
    const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [allowedMethods, setAllowedMethods] = useState<{name: string, icon: string}[]>([]);
    
    // Real-time clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Load store configuration for attendance channels
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const cfg = await DataManager.getConfig();
                const methods = [];
                if (!cfg) {
                    methods.push({ name: 'PIN码验证', icon: '🔐' });
                } else {
                    if (cfg.enablePinClock !== false) methods.push({ name: 'PIN码验证', icon: '🔐' });
                    if (cfg.enableSelfieClock) methods.push({ name: '拍照自拍', icon: '📸' });
                    if (cfg.enableGpsClock) methods.push({ name: 'GPS定位', icon: '📍' });
                    if (cfg.enableQrClock) methods.push({ name: '扫码打卡', icon: '🔍' });
                    if (cfg.enableWifiClock) methods.push({ name: '店内WiFi', icon: '📶' });
                }
                setAllowedMethods(methods);
            } catch (e) {
                console.error("Failed to fetch config inside AttendanceModule:", e);
                setAllowedMethods([{ name: 'PIN码验证', icon: '🔐' }]);
            }
        };
        fetchConfig();
    }, []);

    // Load Data
    useEffect(() => {
        if (employee) {
            loadStaffToday(employee.id);
        }
    }, [employee]);

    const loadStaffToday = async (empId: string) => {
        const date = getBusinessDate(); 
        const records = await DataManager.getAttendanceByDate(date);
        const myRecord = records.find(r => r.employeeId === empId);
        setTodayRecord(myRecord || null);
    };

    const getBusinessDate = () => {
        const now = new Date();
        if (now.getHours() < 4) now.setDate(now.getDate() - 1);
        return now.toISOString().split('T')[0];
    };

    if (!employee) return null;

    // 拦截免打卡人员
    if (employee.isAttendanceExempt) {
        return (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-6 relative overflow-hidden flex justify-between items-center">
                <div>
                    <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2">
                        <CheckCircle2 size={20} className="text-blue-500"/> 
                        考勤状态 (Attendance)
                    </h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">您已被设为无需打卡人员</p>
                </div>
                <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl border border-blue-100 font-black text-xs shadow-sm">
                    免打卡 (Exempt)
                </div>
            </div>
        );
    }
    const isClockedIn = !!todayRecord;
    const isCompleted = !!todayRecord?.clockOut;

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-6 relative overflow-hidden">
            <div className="flex justify-between items-center relative z-10">
                <div>
                    <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2">
                        <Clock size={20} className={isClockedIn ? "text-green-500" : "text-gray-400"}/> 
                        考勤状态 (Attendance)
                    </h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">
                        {currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
                    </p>
                    {allowedMethods.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap max-w-xs sm:max-w-md">
                            {allowedMethods.map((m, idx) => (
                                <span key={idx} className="bg-stone-50 text-stone-650 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-stone-200" title={m.name}>
                                    {m.icon} {m.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* READ ONLY STATUS DISPLAY */}
                <div>
                    {!isClockedIn ? (
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                <Clock size={12}/> 等待经理打卡
                            </span>
                        </div>
                    ) : !isCompleted ? (
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-[10px] text-green-600 font-bold uppercase">Working</p>
                                <p className="text-xs font-black">{new Date(todayRecord?.clockIn || new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 animate-pulse">
                                <UserCheck size={20}/>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl border border-blue-100 flex items-center gap-2">
                            <CheckCircle2 size={18}/>
                            <div>
                                <p className="text-xs font-black">今日已结束</p>
                                <p className="text-[10px] font-bold">工时: {formatDuration(todayRecord?.durationMinutes)}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* Visual indicator bar at bottom */}
            <div className={`absolute bottom-0 left-0 h-1 w-full ${!isClockedIn ? 'bg-gray-200' : isCompleted ? 'bg-blue-500' : 'bg-green-500 animate-pulse'}`}></div>
        </div>
    );
};
