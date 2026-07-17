import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
    Clock, LogIn, LogOut, User, Search, CheckCircle2, AlertCircle, Calendar, X, 
    History, Briefcase, Coffee, Edit3, Lock, AlertTriangle, ListChecks, FileBarChart, 
    CheckSquare, XCircle, TrendingUp, ChefHat, Utensils, Trash2, Check, ArrowRight, 
    CalendarOff, Palmtree, Home, Zap, ChevronDown, Users, FileDown, Loader2, Droplets 
} from 'lucide-react';
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
import { Employee, AttendanceRecord, RosterStatus } from '../../types';
import { 
    DataManager, 
    AttendanceShiftSettings, 
    DEFAULT_ATTENDANCE_SETTINGS, 
    getTargetShiftForDate, 
    getAttendanceStatus 
} from '../../utils/dataManager';
import { AttendanceSettingsModal } from './AttendanceSettingsModal';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas-pro';
import { applyResolvedStylesForPdf } from '../../utils/pdfStyleResolver';


interface AttendanceConsoleProps {
    onClose: () => void;
}

// --- CONSTANTS ---
const STANDARD_WORK_HOURS = 10;
const DEFAULT_LOCAL_REST = 4;
const DEFAULT_FOREIGN_REST = 2;

let currentShiftSettings = DEFAULT_ATTENDANCE_SETTINGS;

/** 合并考勤记录：如果同一个人在同一天既有手机打卡又有打卡机导入，优先使用打卡机记录 */
export const mergeAttendanceRecords = (raw: AttendanceRecord[]): AttendanceRecord[] => {
    const mergedMap = new Map<string, AttendanceRecord>();
    raw.forEach(rec => {
        const key = `${rec.employeeId}_${rec.date}`;
        const existing = mergedMap.get(key);
        if (!existing) {
            mergedMap.set(key, rec);
        } else {
            // 优先选择 face_machine，或者非 app source
            if (rec.source === 'face_machine' && existing.source !== 'face_machine') {
                mergedMap.set(key, rec);
            }
        }
    });
    return Array.from(mergedMap.values());
};

/** 获取指定日期的上班时间 */
const getShiftStart = (dateStr: string, shiftGroup = 1): Date => {
    return getTargetShiftForDate(dateStr, currentShiftSettings, shiftGroup).checkIn;
};

/** 获取指定日期的下班时间 */
const getShiftEnd = (dateStr: string, shiftGroup = 1): Date => {
    return getTargetShiftForDate(dateStr, currentShiftSettings, shiftGroup).checkOut;
};

/** 计算单次迟到分钟数 (clockIn - shiftStart, 负数=0) */
const calculateLateMinutes = (clockInDate: Date, dateStr: string, shiftGroup = 1): number => {
    const shift = getTargetShiftForDate(dateStr, currentShiftSettings, shiftGroup);
    return Math.max(0, Math.floor((clockInDate.getTime() - shift.checkIn.getTime()) / 60000));
};

const getRosterBadge = (status: RosterStatus) => {
    switch (status) {
        case 'OFF': return { label: '休息 (OFF)', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Home };
        case 'MC': return { label: '病假 (MC)', color: 'bg-orange-50 text-orange-600 border-orange-200', icon: AlertCircle };
        case 'ANNUAL': return { label: '年假 (AL)', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: Palmtree };
        case 'LEAVE': return { label: '事假 (UL)', color: 'bg-red-50 text-red-600 border-red-200', icon: CalendarOff };
        case 'ABSENT': return { label: '缺席 (ABS)', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: XCircle };
        default: return null;
    }
};

// ============================================================
// ROLL CALL MODAL
// ============================================================
const RollCallModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    staffList: Employee[];
    todayRecords: AttendanceRecord[];
    dateStr: string;
    onUpdate: () => void;
    dailyRoster: Record<string, RosterStatus>; 
}> = ({ isOpen, onClose, staffList, todayRecords, dateStr, onUpdate, dailyRoster }) => {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
    const [customTimeId, setCustomTimeId] = useState<string | null>(null);
    const [customTimeValue, setCustomTimeValue] = useState<string>(() => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    });

    if (!isOpen) return null;

    const handleQuickPresent = async (emp: Employee) => {
        setProcessingId(emp.id);
        const inTime = getShiftStart(dateStr, emp.shiftGroup || 1);
        const outTime = getShiftEnd(dateStr, emp.shiftGroup || 1);

        const inStr = inTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const outStr = outTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        const duration = Math.max(0, Math.floor((outTime.getTime() - inTime.getTime()) / 60000));

        const newRecord: AttendanceRecord = {
            id: `${dateStr}_${emp.id}`,
            employeeId: emp.id,
            employeeName: emp.name,
            date: dateStr,
            clockIn: inTime.toISOString(),
            clockOut: outTime.toISOString(),
            durationMinutes: duration,
            status: 'COMPLETED',
            notes: 'Manager Quick Check (全天)',
            allTimes: [inStr, outStr]
        };

        await DataManager.saveAttendance(newRecord);
        await onUpdate();
        setProcessingId(null);
    };

    const handleTimeClockIn = async (emp: Employee) => {
        if (!customTimeValue) return;
        setProcessingId(emp.id);
        try {
            const [hh, mm] = customTimeValue.split(':').map(Number);
            const clockInDate = new Date(dateStr);
            clockInDate.setHours(hh, mm, 0, 0);
            if (hh < 12) clockInDate.setDate(clockInDate.getDate() + 1);

            const lateMinutes = calculateLateMinutes(clockInDate, dateStr, emp.shiftGroup || 1);
            const isLate = lateMinutes > currentShiftSettings.graceMinutes;

            const targetOutTime = getShiftEnd(dateStr, emp.shiftGroup || 1);

            const durationMinutes = Math.floor((targetOutTime.getTime() - clockInDate.getTime()) / 60000);

            const inStr = clockInDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const outStr = targetOutTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const newRecord: AttendanceRecord = {
                id: `${dateStr}_${emp.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                date: dateStr,
                clockIn: clockInDate.toISOString(),
                clockOut: targetOutTime.toISOString(), 
                durationMinutes: Math.max(0, durationMinutes),
                status: isLate ? 'LATE' : 'COMPLETED', 
                notes: `Manual Time In (Auto-out @ ${currentShiftSettings.weekdayCheckOut})`,
                allTimes: [inStr, outStr]
            };

            await DataManager.saveAttendance(newRecord);
            await onUpdate();
        } catch (error) {
            console.error(error);
        } finally {
            setProcessingId(null);
            setCustomTimeId(null);
        }
    };

    const confirmMarkAbsent = async () => {
        if (!deleteCandidateId) return;
        setProcessingId(deleteCandidateId);
        await DataManager.deleteAttendance(`${dateStr}_${deleteCandidateId}`);
        await onUpdate();
        setProcessingId(null);
        setDeleteCandidateId(null);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[95vh] md:max-h-[90vh] relative">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-3xl">
                    <div>
                        <h3 className="font-black text-2xl text-[#1A1A1A]">快速点名 (Roll Call)</h3>
                        <p className="text-sm text-gray-500 font-bold mt-1">{dateStr} • {staffList.length} Staff</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white hover:bg-gray-100 rounded-full shadow-sm"><X size={24}/></button>
                </div>
                
                <div className="flex-grow overflow-y-auto p-2.5 bg-[#F5F7FA]">
                    <div className="grid grid-cols-2 gap-2">
                    {staffList.filter(s => !s.isAttendanceExempt).map(staff => {
                        const record = todayRecords.find(r => r.employeeId === staff.id);
                        const isPresent = !!record;
                        const planStatus = dailyRoster[staff.id] || 'WORK';
                        const rosterBadge = getRosterBadge(planStatus);

                        return (
                            <div key={staff.id} className={`flex flex-col gap-2 p-2.5 rounded-xl border shadow-sm transition-all ${isPresent ? 'bg-white border-green-200' : 'bg-white border-gray-200'}`}>
                                <div className="flex items-center gap-2">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 overflow-hidden ${isPresent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                        {staff.avatar ? <img src={staff.avatar} className="w-full h-full object-cover rounded-full"/> : staff.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-bold text-xs text-[#1A1A1A] truncate leading-tight">{staff.name}</h4>
                                        <p className="text-[9px] text-gray-400 font-bold truncate">{(staff.role || '').split('(')[0]}</p>
                                        {rosterBadge && planStatus !== 'WORK' && (
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold border ${rosterBadge.color} mt-0.5 inline-block`}>{rosterBadge.label}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {processingId === staff.id ? (
                                        <div className="flex-1 flex justify-center py-1"><Loader2 size={18} className="animate-spin text-gray-400"/></div>
                                    ) : isPresent ? (
                                        <div className="flex items-center gap-1.5 w-full">
                                            <span className="flex-1 bg-green-50 text-green-700 py-1.5 rounded-lg text-[11px] font-bold text-center flex items-center justify-center gap-1"><CheckCircle2 size={12}/> Present</span>
                                            <button onClick={() => setDeleteCandidateId(staff.id)} disabled={!!processingId} className="p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 border border-red-100 shrink-0">
                                                <X size={14}/>
                                            </button>
                                        </div>
                                    ) : customTimeId === staff.id ? (
                                        <div className="flex items-center gap-1.5 w-full animate-in fade-in bg-gray-50 p-1.5 rounded-lg">
                                            <input type="time" value={customTimeValue} onChange={(e) => setCustomTimeValue(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold flex-1 min-w-0 outline-none focus:border-[#FFD700]"/>
                                            <button onClick={() => handleTimeClockIn(staff)} disabled={!!processingId} className="bg-green-500 text-white p-2 rounded-lg hover:bg-green-600 shrink-0"><Check size={16} strokeWidth={3}/></button>
                                            <button onClick={() => setCustomTimeId(null)} className="bg-white text-gray-500 p-2 rounded-lg hover:bg-gray-200 shrink-0"><X size={16}/></button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-1.5 w-full">
                                            <button onClick={() => { setCustomTimeId(staff.id); const now = new Date(); setCustomTimeValue(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`); }} disabled={!!processingId || !!customTimeId} className="flex-1 py-2.5 min-h-[40px] bg-white border border-gray-200 text-gray-600 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95">
                                                <Clock size={13}/> 打卡
                                            </button>
                                            <button onClick={() => handleQuickPresent(staff)} disabled={!!processingId || !!customTimeId} className="flex-1 py-2.5 min-h-[40px] bg-green-500 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95">
                                                <CheckCircle2 size={13}/> 全天
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>

                <div className="pb-[env(safe-area-inset-bottom)]" />

                {deleteCandidateId && (
                    <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center p-6 rounded-3xl backdrop-blur-sm">
                        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={28} className="text-red-500"/></div>
                            <h4 className="font-black text-lg mb-2">撤回打卡 (Undo Clock In)?</h4>
                            <p className="text-sm text-gray-500 mb-6">将删除 <span className="font-bold text-black">{staffList.find(s => s.id === deleteCandidateId)?.name}</span> 的考勤记录</p>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setDeleteCandidateId(null)} className="py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl font-bold text-sm">取消</button>
                                <button onClick={confirmMarkAbsent} className="py-4 bg-red-600 text-white hover:bg-red-700 rounded-2xl font-bold text-sm shadow-xl">确认删除</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================
// COMPLIANCE REPORT MODAL
// ============================================================
const ComplianceReportModal: React.FC<{ isOpen: boolean; onClose: () => void; staffList: Employee[]; }> = ({ isOpen, onClose, staffList }) => {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (isOpen) loadReport(); }, [isOpen, month]);

    const loadReport = async () => {
        setLoading(true);
        try {
            const data = await DataManager.getAttendanceByMonth(month);
            setRecords(mergeAttendanceRecords(data));
        } catch (error) {
            console.error("Failed to load compliance report", error);
            alert("读取报表失败");
        } finally {
            setLoading(false);
        }
    };

    const reportData = useMemo(() => {
        const daysInMonth = new Date(parseInt(month.slice(0,4)), parseInt(month.slice(5,7)), 0).getDate();
        return staffList.filter(s => !s.isAttendanceExempt && (!s.joinDate || s.joinDate.slice(0, 7) <= month)).map(emp => {
            const empRecords = records.filter(r => r.employeeId === emp.id);
            const totalMinutes = empRecords.reduce((sum, r) => sum + (r.durationMinutes || 0), 0);
            const daysWorked = empRecords.length;
            const lateCount = empRecords.filter(r => r.status === 'LATE').length;
            const isLocal = (emp.nationality || '').includes('Malaysian') || (emp.nationality || '').includes('🇲🇾');
            
            const restDaysQuota = emp.monthlyRestDays ?? (isLocal ? DEFAULT_LOCAL_REST : DEFAULT_FOREIGN_REST);
            const targetDays = daysInMonth - restDaysQuota;
            
            return { emp, daysWorked, targetDays, totalHours: totalMinutes/60, metDays: daysWorked >= targetDays, isLocal, lateCount, restDaysQuota };
        }).sort((a,b) => (a.metDays === b.metDays) ? 0 : a.metDays ? -1 : 1);
    }, [staffList, records, month]);

    const handleExportPDF = async () => {
        if (!printRef.current) return;
        setIsGeneratingPdf(true);
        try {
            await new Promise(r => setTimeout(r, 500)); 
            const canvas = await html2canvas(printRef.current, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('attendance-print-root');
                    const originalEl = document.getElementById('attendance-print-root');
                    if (originalEl && clonedEl) {
                        applyResolvedStylesForPdf(originalEl as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const pdf = new jsPDF('p', 'mm', 'a4'); 
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Attendance_Report_${month}.pdf`);
        } catch (e) {
            console.error(e);
            alert("PDF Export Failed");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[95vh] md:max-h-[90vh]">
                <div className="p-4 md:p-6 border-b border-gray-100 shrink-0">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 md:gap-4">
                            <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><FileBarChart size={20}/></div>
                            <h3 className="font-black text-base md:text-xl text-[#1A1A1A]">达标检查</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleExportPDF} disabled={isGeneratingPdf} className="flex items-center gap-1 bg-[#1A1A1A] text-[#FFD700] px-3 py-2 rounded-lg text-[10px] md:text-xs font-bold shadow-md disabled:opacity-50">
                                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} PDF
                            </button>
                            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none w-32 md:w-auto"/>
                            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={18}/></button>
                        </div>
                    </div>
                </div>
                <div className="flex-grow overflow-auto p-0">
                    {loading ? (
                        <div className="p-8 text-center text-gray-400">Loading...</div>
                    ) : (
                        <>
                            <div className="md:hidden p-3 space-y-2">
                                {reportData.map(row => (
                                    <div key={row.emp.id} className={`p-3 rounded-xl border-2 ${row.metDays ? 'border-green-100 bg-white' : 'border-red-100 bg-red-50/30'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-black shrink-0">{row.emp.name.charAt(0)}</div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-sm text-[#1A1A1A] truncate">{row.emp.name}</div>
                                                    <div className="text-[9px] text-gray-400 flex items-center gap-1">
                                                        {(row.emp.role || '').split('(')[0]}
                                                        <span className={`px-1 py-0.5 rounded text-[8px] font-black ${row.isLocal ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{row.isLocal ? 'L' : 'F'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {row.metDays ? (
                                                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100 flex items-center gap-1 shrink-0"><CheckCircle2 size={10}/> 达标</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 flex items-center gap-1 shrink-0"><XCircle size={10}/> 缺{row.targetDays - row.daysWorked}天</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5">
                                            <span>出勤 <span className="font-black text-[#1A1A1A] text-xs">{row.daysWorked}</span>/{row.targetDays}天</span>
                                            <span>工时 <span className="font-black text-[#1A1A1A] text-xs">{row.totalHours.toFixed(0)}h</span></span>
                                            {row.lateCount > 0 && <span className="text-red-500 font-bold">迟到{row.lateCount}次</span>}
                                            <span className="text-gray-400">休{row.restDaysQuota}天</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <table className="w-full text-left text-sm hidden md:table">
                                <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-gray-200">
                                    <tr><th className="p-4 bg-gray-50">Employee</th><th className="p-4 text-center bg-gray-50">Type / Quota</th><th className="p-4 text-center bg-gray-50">Days Worked</th><th className="p-4 text-center bg-gray-50">Late</th><th className="p-4 text-center bg-gray-50">Total Hours</th><th className="p-4 text-center bg-gray-50">Status</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {reportData.map(row => (
                                        <tr key={row.emp.id} className="hover:bg-gray-50/50">
                                            <td className="p-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-black">{row.emp.name.charAt(0)}</div><div><div className="font-bold text-[#1A1A1A]">{row.emp.name}</div><div className="text-[10px] text-gray-400">{(row.emp.role || '').split('(')[0]}</div></div></div></td>
                                            <td className="p-4 text-center">
                                                <span className={`text-[9px] px-2 py-1 rounded font-black uppercase ${row.isLocal ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{row.isLocal ? 'Local' : 'Foreign'}</span>
                                                <div className="text-[9px] text-gray-400 mt-1 font-bold">Quota: {row.restDaysQuota} Off</div>
                                            </td>
                                            <td className="p-4 text-center"><div className="font-mono font-bold text-base">{row.daysWorked} <span className="text-gray-300 text-xs">/ {row.targetDays}</span></div></td>
                                            <td className="p-4 text-center"><span className={`font-mono font-bold ${row.lateCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>{row.lateCount}</span></td>
                                            <td className="p-4 text-center"><div className="font-mono font-bold text-base">{row.totalHours.toFixed(1)}h</div><div className="text-[9px] text-gray-400">Avg {(row.daysWorked > 0 ? row.totalHours/row.daysWorked : 0).toFixed(1)}h</div></td>
                                            <td className="p-4 text-center">{row.metDays ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100"><CheckCircle2 size={12}/> 达标</span> : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100"><XCircle size={12}/> 缺 {row.targetDays - row.daysWorked} 天</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>

                <div className="pb-[env(safe-area-inset-bottom)]" />
            </div>

            {/* HIDDEN PRINT TEMPLATE */}
            <div style={{ position: 'fixed', top: '0px', left: '0px', zIndex: -9999, pointerEvents: 'none' }}>
                <div ref={printRef} id="attendance-print-root" className="w-[210mm] min-h-[297mm] bg-white p-12 font-sans text-black relative">
                    <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-widest mb-1">Attendance Report</h1>
                            <p className="text-xs font-bold text-gray-500">KIM LIAN KEE (KEPONG)</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-black uppercase">{month}</p>
                            <p className="text-xs font-mono text-gray-400">Generated: {new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <table className="w-full text-left text-xs mb-8">
                        <thead className="bg-black text-white">
                            <tr>
                                <th className="p-2 uppercase font-black">Employee</th>
                                <th className="p-2 uppercase font-black text-center">Type</th>
                                <th className="p-2 uppercase font-black text-center">Quota (Off)</th>
                                <th className="p-2 uppercase font-black text-center">Days Worked</th>
                                <th className="p-2 uppercase font-black text-center">Target</th>
                                <th className="p-2 uppercase font-black text-center">Late</th>
                                <th className="p-2 uppercase font-black text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {reportData.map((row, i) => (
                                <tr key={i} className="break-inside-avoid">
                                    <td className="p-2 font-bold">{row.emp.name}</td>
                                    <td className="p-2 text-center">{row.isLocal ? 'Local' : 'Foreign'}</td>
                                    <td className="p-2 text-center font-mono">{row.restDaysQuota} Days</td>
                                    <td className="p-2 text-center font-mono font-bold">{row.daysWorked}</td>
                                    <td className="p-2 text-center font-mono text-gray-500">{row.targetDays}</td>
                                    <td className={`p-2 text-center font-mono font-bold ${row.lateCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{row.lateCount}</td>
                                    <td className="p-2 text-center font-bold">{row.metDays ? 'MET' : 'FAILED'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="border-t-2 border-black pt-2 mt-auto">
                        <div className="flex justify-between items-end mt-12">
                            <div><p className="text-[10px] font-bold uppercase tracking-widest">Verified By (HR/Manager)</p><div className="w-48 border-b border-black mt-8"></div></div>
                            <div><p className="text-[10px] font-bold uppercase tracking-widest">Approved By (Owner)</p><div className="w-48 border-b border-black mt-8"></div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// SECURITY PIN MODAL
// ============================================================
const SecurityPinModal: React.FC<{ isOpen: boolean; onClose: () => void; onSuccess: () => void; employeeName: string; targetPin: string; }> = ({ isOpen, onClose, onSuccess, employeeName, targetPin }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { if (isOpen) { setPin(''); setError(''); } }, [isOpen]);
    const handleVerify = () => { if (pin === targetPin) { onSuccess(); onClose(); } else { setError('Wrong PIN'); setPin(''); } };
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-t-3xl md:rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-2xl flex flex-col items-center border-t-8 border-[#FFD700] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
                <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mb-6"><Lock size={40} className="text-yellow-600"/></div>
                <h3 className="font-black text-2xl text-[#1A1A1A] mb-2">身份验证</h3>
                <p className="text-sm text-gray-500 font-bold mb-8">请输入 <span className="text-black bg-gray-100 px-2 py-0.5 rounded">{employeeName}</span> 的密码</p>
                <input type="password" value={pin} onChange={e => { setPin(e.target.value); setError(''); }} className="w-full p-5 bg-gray-50 rounded-2xl text-center text-3xl font-black tracking-[0.5em] outline-none border-2 focus:border-[#FFD700] mb-6 shadow-inner" placeholder="••••" autoFocus />
                {error && <p className="text-red-500 text-sm font-bold mb-6 animate-pulse flex items-center gap-2"><AlertCircle size={16}/> {error}</p>}
                <div className="grid grid-cols-2 gap-4 w-full">
                    <button onClick={onClose} className="py-4 min-h-[44px] bg-gray-100 rounded-2xl font-bold text-gray-600 text-sm hover:bg-gray-200">取消</button>
                    <button onClick={handleVerify} disabled={!pin} className="py-4 min-h-[44px] bg-[#1A1A1A] text-[#FFD700] rounded-2xl font-bold shadow-xl disabled:opacity-50 text-sm hover:scale-105 transition-transform">确认 (Confirm)</button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// EDIT RECORD MODAL
// ============================================================
const EditRecordModal: React.FC<{ isOpen: boolean; onClose: () => void; record: AttendanceRecord; shiftGroup?: number; onSave: (updated: AttendanceRecord) => void; }> = ({ isOpen, onClose, record, shiftGroup = 1, onSave }) => {
    const [punchTimes, setPunchTimes] = useState<string[]>([]);
    
    useEffect(() => { 
        if (isOpen && record) { 
            if (record.allTimes && record.allTimes.length > 0) {
                setPunchTimes([...record.allTimes]);
            } else {
                const initial: string[] = [];
                if (record.clockIn) {
                    initial.push(new Date(record.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
                }
                if (record.clockOut) {
                    const outStr = new Date(record.clockOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    const inStr = record.clockIn ? new Date(record.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                    if (outStr !== inStr) {
                        initial.push(outStr);
                    }
                }
                setPunchTimes(initial.length > 0 ? initial : ['']);
            }
        } 
    }, [isOpen, record]);
    
    const handleSave = () => {
        const cleanTimes = punchTimes.map(t => t.trim()).filter(Boolean);
        if (cleanTimes.length === 0) {
            alert('请至少添加一个有效的打卡时间');
            return;
        }

        // Calculate ISO strings and handle cross-midnight sequences
        let currentDayOffset = 0;
        let prevMinutes = -1;
        const isoTimes = cleanTimes.map((timeStr, idx) => {
            const [hh, mm] = timeStr.split(':').map(Number);
            const currentMinutes = hh * 60 + mm;
            if (idx > 0 && currentMinutes < prevMinutes) {
                // If time goes backward compared to the previous punch, it has crossed midnight
                currentDayOffset = 1;
            }
            prevMinutes = currentMinutes;
            const d = new Date(record.date);
            d.setHours(hh, mm, 0, 0);
            if (currentDayOffset > 0) {
                d.setDate(d.getDate() + currentDayOffset);
            }
            return d.toISOString();
        });

        const newIn = isoTimes[0];
        const newOut = isoTimes.length > 1 ? isoTimes[isoTimes.length - 1] : '';

        const duration = newOut ? Math.floor((new Date(newOut).getTime() - new Date(newIn).getTime()) / 60000) : 0;
        const calc = getAttendanceStatus(newIn, newOut || null, record.date, currentShiftSettings, shiftGroup);
        const status = calc.status;

        onSave({ 
            ...record, 
            clockIn: newIn, 
            clockOut: newOut || '', 
            durationMinutes: duration, 
            status,
            allTimes: cleanTimes // Save the multi-punch sequence
        }); 
        onClose();
    };
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-t-3xl md:rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl pb-[max(env(safe-area-inset-bottom),1.5rem)] flex flex-col max-h-[90vh]">
                <h3 className="font-black text-2xl text-[#1A1A1A] mb-2 shrink-0">修正考勤记录</h3>
                <p className="text-xs text-gray-400 mb-6 shrink-0 font-bold uppercase tracking-wider">
                    员工: {record.employeeName} | 日期: {record.date}
                </p>
                
                <div className="space-y-4 mb-6 overflow-y-auto flex-1 pr-1 max-h-[50vh]">
                    {punchTimes.map((time, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                            <span className="text-xs font-black text-gray-400 w-14 shrink-0 font-mono">
                                打卡 {idx + 1}
                            </span>
                            <input 
                                type="time" 
                                value={time} 
                                onChange={e => {
                                    const updated = [...punchTimes];
                                    updated[idx] = e.target.value;
                                    setPunchTimes(updated);
                                }} 
                                className="flex-1 p-3 bg-white rounded-xl font-mono text-lg font-bold border-2 border-gray-200 outline-none focus:border-[#FFD700]" 
                            />
                            {punchTimes.length > 1 && (
                                <button 
                                    onClick={() => setPunchTimes(punchTimes.filter((_, i) => i !== idx))}
                                    className="p-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl font-bold text-xs shrink-0 transition-colors"
                                >
                                    删除
                                </button>
                            )}
                        </div>
                    ))}

                    <button 
                        onClick={() => setPunchTimes([...punchTimes, ''])}
                        className="w-full py-3 bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-200 rounded-2xl text-xs font-bold text-gray-500 transition-colors flex items-center justify-center gap-1 active:scale-98"
                    >
                        + 增加打卡段 (Add punch point)
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 shrink-0">
                    <button onClick={onClose} className="py-4 min-h-[44px] bg-gray-100 rounded-2xl font-bold text-gray-600 transition-all hover:bg-gray-200 active:scale-95">
                        取消
                    </button>
                    <button onClick={handleSave} className="py-4 min-h-[44px] bg-[#1A1A1A] text-[#FFD700] rounded-2xl font-bold shadow-lg transition-all hover:bg-black active:scale-95">
                        保存修正
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// MULTI-PUNCH DISTRIBUTOR HELPER
// ============================================================
const distributeTimes = (times: string[]) => {
    const res = { amIn: '—', amOut: '—', pmIn: '—', pmOut: '—', otIn: '—', otOut: '—' };
    if (!times || times.length === 0) return res;
    
    const toMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    
    if (times.length === 4) {
        res.amIn = times[0];
        res.amOut = times[1];
        res.pmIn = times[2];
        res.pmOut = times[3];
    } else if (times.length === 2) {
        const m0 = toMins(times[0]);
        const m1 = toMins(times[1]);
        if (m0 < 720) { // before 12:00
            res.amIn = times[0];
            if (m1 < 900) { // before 15:00
                res.amOut = times[1];
            } else {
                res.pmOut = times[1];
            }
        } else {
            res.pmIn = times[0];
            res.pmOut = times[1];
        }
    } else if (times.length === 1) {
        const m0 = toMins(times[0]);
        if (m0 < 720) {
            res.amIn = times[0];
        } else {
            res.pmIn = times[0];
        }
    } else {
        const slots = ['amIn', 'amOut', 'pmIn', 'pmOut', 'otIn', 'otOut'];
        times.forEach((t, i) => {
            if (i < slots.length) {
                (res as any)[slots[i]] = t;
            }
        });
    }
    return res;
};

// ============================================================
// EMPLOYEE MONTHLY SHEET MODAL
// ============================================================
const EmployeeMonthlySheetModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    employee: Employee;
    selectedMonth: string;
    onMonthChange: (newMonth: string) => void;
    records: AttendanceRecord[];
    roster: Record<string, Record<string, RosterStatus>>;
    onEditRow: (record: AttendanceRecord) => void;
}> = ({ isOpen, onClose, employee, selectedMonth, onMonthChange, records, roster, onEditRow }) => {
    const printAreaRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    if (!isOpen) return null;

    const [yr, mo] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    
    const cellPadding = isExporting ? "p-1" : "p-2";
    
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayChinese = ['日', '一', '二', '三', '四', '五', '六'];

    const handlePrevMonth = () => {
        let newMo = mo - 1;
        let newYr = yr;
        if (newMo === 0) {
            newMo = 12;
            newYr -= 1;
        }
        onMonthChange(`${newYr}-${String(newMo).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        let newMo = mo + 1;
        let newYr = yr;
        if (newMo === 13) {
            newMo = 1;
            newYr += 1;
        }
        onMonthChange(`${newYr}-${String(newMo).padStart(2, '0')}`);
    };

    const handleExportPDF = async () => {
        if (!printAreaRef.current) return;
        setIsExporting(true);
        try {
            await new Promise(r => setTimeout(r, 600));
            const canvas = await html2canvas(printAreaRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                windowWidth: 1000,
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('monthly-attendance-print-block');
                    const originalEl = document.getElementById('monthly-attendance-print-block');
                    if (originalEl && clonedEl) {
                        applyResolvedStylesForPdf(originalEl as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            });
            const imgData = canvas.toDataURL("image/jpeg", 1.0);
            const pdf = new jsPDF("p", "mm", "a4");
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            // Calculate scale factors for both axes to fit completely on one A4 page
            const scaleX = pdfWidth / canvas.width;
            const scaleY = pdfHeight / canvas.height;
            // Use the smaller scale factor to ensure everything is covered and nothing is cut off
            const scale = Math.min(scaleX, scaleY);
            
            const finalWidth = canvas.width * scale;
            const finalHeight = canvas.height * scale;
            
            // Center the image on the PDF page
            const xOffset = (pdfWidth - finalWidth) / 2;
            const yOffset = (pdfHeight - finalHeight) / 2;
            
            pdf.addImage(imgData, "JPEG", xOffset, yOffset, finalWidth, finalHeight);
            pdf.save(`Attendance_${selectedMonth}_${employee.name}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Export PDF Failed");
        } finally {
            setIsExporting(false);
        }
    };

    const workedDays = records.filter(r => (r.allTimes && r.allTimes.length > 0) || r.clockIn).length;
    const lateDays = records.filter(r => r.status === 'LATE' || r.status === 'COMPLETED_LATE').length;

    return (
        <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col h-[100vh] md:h-[90vh] relative overflow-hidden">
                
                {/* Header (Non-printing) */}
                <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center bg-gray-50 shrink-0 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#1A1A1A] text-[#FFD700] rounded-2xl flex items-center justify-center font-black">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <h3 className="font-black text-lg md:text-xl text-[#1A1A1A]">月度考勤明细表 (Monthly Attendance)</h3>
                            <p className="text-xs text-gray-500 font-bold">员工: {employee.name} | ID: {employee.id}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-1 py-1 shadow-sm shrink-0">
                            <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 font-bold">&lt;</button>
                            <span className="font-black text-sm md:text-base px-3 text-gray-800 font-mono">{selectedMonth}</span>
                            <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 font-bold">&gt;</button>
                        </div>

                        <button 
                            onClick={handleExportPDF} 
                            disabled={isExporting}
                            className="bg-[#1A1A1A] text-[#FFD700] hover:bg-black px-4 py-2.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 active:scale-95 transition-transform shrink-0 disabled:opacity-50"
                        >
                            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14}/>}
                            导出 PDF
                        </button>
                        
                        <button onClick={onClose} className="p-2.5 bg-white border hover:bg-gray-100 rounded-xl shadow-sm shrink-0"><X size={18}/></button>
                    </div>
                </div>

                {/* Main Scroll Container */}
                <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-gray-100/50">
                    
                    {/* Print Area Wrapper */}
                    <div 
                        ref={printAreaRef} 
                        className={`bg-white text-black max-w-[850px] mx-auto rounded-2xl border border-gray-200 shadow-sm font-sans ${isExporting ? 'p-4 md:p-4' : 'p-6 md:p-10'}`}
                        id="monthly-attendance-print-block"
                    >
                        {/* Print Header */}
                        <div className={`border-b-4 border-black flex justify-between items-start ${isExporting ? 'pb-2 mb-3' : 'pb-4 mb-6'}`}>
                            <div>
                                <h1 className="text-2xl font-black uppercase tracking-wider text-[#1A1A1A]">KIM LIAN KEE (金莲记)</h1>
                                <p className="text-xs text-gray-500 font-black tracking-widest mt-0.5 uppercase">Monthly Attendance Record • 员工月度打卡表</p>
                                <div className={`grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-700 ${isExporting ? 'mt-2' : 'mt-4'}`}>
                                    <div><span className="text-gray-400 font-bold uppercase">Name (姓名):</span> <span className="font-black">{employee.name}</span></div>
                                    <div><span className="text-gray-400 font-bold uppercase">No (工号):</span> <span className="font-mono font-black">{employee.id}</span></div>
                                    <div><span className="text-gray-400 font-bold uppercase">Department (部门):</span> <span className="font-bold">{(employee.role || 'Admin/FOH').split('(')[0]}</span></div>
                                    <div><span className="text-gray-400 font-bold uppercase">Period (期间):</span> <span className="font-mono font-black">{selectedMonth}-01 ~ {selectedMonth}-{daysInMonth}</span></div>
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <div className="bg-yellow-100 text-yellow-800 font-black text-[10px] px-3 py-1 rounded border border-yellow-200 uppercase tracking-widest mb-2">
                                    Attendance Template
                                </div>
                                <p className="text-[10px] text-gray-400 font-mono">Printed: {new Date().toLocaleDateString()}</p>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="border border-black overflow-hidden rounded">
                            <table className={`w-full border-collapse text-center ${isExporting ? 'text-[9.5px]' : 'text-xs'}`}>
                                <thead className="bg-[#1A1A1A] text-white">
                                    <tr className="border-b border-black">
                                        <th className={`${cellPadding} border-r border-black font-black w-24`}>日期 / 星期<br/>(Date / Day)</th>
                                        <th className={`${cellPadding} border-r border-black font-black`} colSpan={2}>上午 (AM)<br/><span className="text-[9px] font-normal">Check In / Out</span></th>
                                        <th className={`${cellPadding} border-r border-black font-black`} colSpan={2}>下午 (PM)<br/><span className="text-[9px] font-normal">Check In / Out</span></th>
                                        <th className={`${cellPadding} border-r border-black font-black`} colSpan={2}>加班 (OT)<br/><span className="text-[9px] font-normal">Check In / Out</span></th>
                                        <th className={`${cellPadding} border-r border-black font-black w-20`}>出勤状态<br/>(Status)</th>
                                        {!isExporting && <th className="p-2 font-black w-16">操作</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: daysInMonth }, (_, index) => {
                                        const d = index + 1;
                                        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                                        const dateObj = new Date(`${dStr}T00:00:00`);
                                        const dowIdx = dateObj.getDay();
                                        const isWeekend = dowIdx === 0 || dowIdx === 6;
                                        const dayLabel = `${String(d).padStart(2, '0')} ${weekdayNames[dowIdx]}`;

                                        const rec = records.find(r => r.date === dStr);
                                        const rosterStatus = roster[dStr]?.[employee.id] || 'WORK';
                                        
                                        let recordTimes = rec?.allTimes || [];
                                        if (recordTimes.length === 0 && rec) {
                                            if (rec.clockIn) {
                                                try {
                                                    recordTimes.push(new Date(rec.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
                                                } catch (e) {
                                                    console.warn("Invalid clockIn", rec.clockIn);
                                                }
                                            }
                                            if (rec.clockOut) {
                                                try {
                                                    const outStr = new Date(rec.clockOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                                    const inStr = rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                                                    if (outStr !== inStr) {
                                                        recordTimes.push(outStr);
                                                    }
                                                } catch (e) {
                                                    console.warn("Invalid clockOut", rec.clockOut);
                                                }
                                            }
                                        }
                                        const punches = distributeTimes(recordTimes);

                                        let statusNode = <span className="text-green-700 font-black">✓ 出勤</span>;
                                        let rowBg = isWeekend ? "bg-red-50/40" : "bg-white";
                                        
                                        if (rosterStatus === 'OFF') {
                                            statusNode = <span className="text-gray-400 font-bold bg-gray-100 px-1.5 py-0.5 rounded">OFF 休</span>;
                                            rowBg = "bg-gray-100/50";
                                        } else if (rosterStatus === 'MC') {
                                            statusNode = <span className="text-orange-700 font-bold bg-orange-50 px-1.5 py-0.5 rounded">MC 病假</span>;
                                        } else if (rosterStatus === 'ANNUAL') {
                                            statusNode = <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded">AL 年假</span>;
                                        } else if (rosterStatus === 'LEAVE') {
                                            statusNode = <span className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded">UL 事假</span>;
                                        } else if (rosterStatus === 'ABSENT') {
                                            statusNode = <span className="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded">ABS 缺席</span>;
                                        } else if (!rec) {
                                            statusNode = <span className="text-gray-300 italic">未打卡</span>;
                                        } else if (rec.status === 'LATE' || rec.status === 'COMPLETED_LATE') {
                                            statusNode = <span className="text-red-600 font-black">迟到 Late</span>;
                                         } else if (rec.status === 'EARLY_OUT') {
                                             statusNode = <span className="text-amber-600 font-black">早退 Early</span>;
                                         } else if (rec.status === 'LATE_AND_EARLY') {
                                             statusNode = <span className="text-red-700 font-black bg-red-50 px-1.5 py-0.5 rounded">迟到+早退 L/E</span>;
                                        }

                                        return (
                                            <tr key={d} className={`border-b border-gray-300 last:border-0 hover:bg-gray-50/80 transition-colors ${rowBg}`}>
                                                <td className={`${cellPadding} border-r border-gray-300 font-bold font-mono ${isWeekend ? 'text-red-500 bg-red-50/30' : 'text-gray-700'}`}>
                                                    {dayLabel} {weekdayChinese[dowIdx]}
                                                </td>

                                                <td className={`${cellPadding} border-r border-gray-200 font-mono font-bold text-gray-700 text-center`}>{punches.amIn}</td>
                                                <td className={`${cellPadding} border-r border-gray-300 font-mono text-gray-500 text-center`}>{punches.amOut}</td>

                                                <td className={`${cellPadding} border-r border-gray-200 font-mono font-bold text-gray-700 text-center`}>{punches.pmIn}</td>
                                                <td className={`${cellPadding} border-r border-gray-300 font-mono text-gray-500 text-center`}>{punches.pmOut}</td>

                                                <td className={`${cellPadding} border-r border-gray-200 font-mono font-bold text-orange-600 text-center`}>{punches.otIn}</td>
                                                <td className={`${cellPadding} border-r border-gray-300 font-mono text-gray-500 text-center`}>{punches.otOut}</td>

                                                <td className={`${cellPadding} border-r border-gray-300 font-bold text-center`}>
                                                    {statusNode}
                                                </td>

                                                {!isExporting && (
                                                    <td className="p-2 text-center">
                                                        <button 
                                                            onClick={() => {
                                                                const recordForDate = rec || {
                                                                    id: `${dStr}_${employee.id}`,
                                                                    employeeId: employee.id,
                                                                    employeeName: employee.name,
                                                                    date: dStr,
                                                                    clockIn: '',
                                                                    clockOut: '',
                                                                    durationMinutes: 0,
                                                                    status: 'PRESENT' as const,
                                                                    notes: 'Manual Monthly Edit'
                                                                };
                                                                onEditRow(recordForDate as AttendanceRecord);
                                                            }}
                                                            className="p-1.5 bg-gray-100 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded transition-colors"
                                                            title="修改此日打卡时间"
                                                        >
                                                            <Edit3 size={13} />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className={`${isExporting ? 'mt-4 pt-4' : 'mt-8 pt-8'} border-t border-dashed border-gray-300 grid grid-cols-2 gap-12 text-xs`}>
                            <div className={`flex flex-col justify-end ${isExporting ? 'min-h-[50px]' : 'min-h-[80px]'}`}>
                                <div className="border-b border-black w-48 mb-1"></div>
                                <p className="font-bold text-gray-600 uppercase text-[9px]">Employee's Signature (员工签名)</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">Date: __________________</p>
                            </div>
                            <div className={`flex flex-col justify-end items-end ${isExporting ? 'min-h-[50px]' : 'min-h-[80px]'} text-right`}>
                                <div className="border-b border-black w-48 mb-1"></div>
                                <p className="font-bold text-gray-600 uppercase text-[9px]">Verified by HR Manager (经手经理)</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">Date: __________________</p>
                            </div>
                        </div>

                        <div className={`${isExporting ? 'mt-4 p-2' : 'mt-6 p-3'} bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-500 flex justify-between items-center font-bold`}>
                            <div>Worked Days (工作天数): <span className="text-black font-black font-mono text-sm">{workedDays} Days</span></div>
                            <div>Late Days (迟到天数): <span className="text-red-600 font-black font-mono text-sm">{lateDays} Times</span></div>
                            <div className="text-[9px] text-gray-400">Kim Lian Kee Kepong Admin Portal</div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
};

// ============================================================
// MAIN COMPONENT 
// ============================================================
export const AttendanceConsole: React.FC<AttendanceConsoleProps> = ({ onClose }) => {
    const [staffList, setStaffList] = useState<Employee[]>([]);
    const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
    const [dailyRoster, setDailyRoster] = useState<Record<string, RosterStatus>>({}); 
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string>('');

    const [shiftSettings, setShiftSettings] = useState<AttendanceShiftSettings>(DEFAULT_ATTENDANCE_SETTINGS);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const currentDateStaffList = useMemo(() => {
        return staffList.filter(s => !s.joinDate || s.joinDate <= selectedDate);
    }, [staffList, selectedDate]);

    useEffect(() => {
        const fetchSettings = async () => {
            const s = await DataManager.getAttendanceSettings();
            if (s) {
                setShiftSettings(s);
                currentShiftSettings = s;
            }
        };
        fetchSettings();
    }, []);

    // Interaction States
    const [securityModalOpen, setSecurityModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<{ type: 'IN' | 'OUT', employee: Employee } | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
    const [showRollCall, setShowRollCall] = useState(false);
    const [showReport, setShowReport] = useState(false);
    
    // 👑 人脸打卡机导入状态
    const [isFaceImportOpen, setIsFaceImportOpen] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [importPreviews, setImportPreviews] = useState<any[]>([]);
    const [isSavingImport, setIsSavingImport] = useState(false);
    
    // Monthly Sheet States & Loaders
    const [selectedMonthlyEmployee, setSelectedMonthlyEmployee] = useState<Employee | null>(null);
    const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
    const [monthlyRoster, setMonthlyRoster] = useState<Record<string, Record<string, RosterStatus>>>({});
    const [monthlySelectedMonth, setMonthlySelectedMonth] = useState<string>('');

    const loadMonthlyData = useCallback(async () => {
        if (!selectedMonthlyEmployee || !monthlySelectedMonth) return;
        setIsLoading(true);
        try {
            const [records, { roster }] = await Promise.all([
                DataManager.getAttendanceByMonth(monthlySelectedMonth),
                DataManager.getRosterData(monthlySelectedMonth)
            ]);
            const filtered = mergeAttendanceRecords(records).filter(r => r.employeeId === selectedMonthlyEmployee.id);
            setMonthlyRecords(filtered);
            setMonthlyRoster(roster || {});
        } catch (error) {
            console.error("loadMonthlyData failed:", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedMonthlyEmployee, monthlySelectedMonth]);

    useEffect(() => {
        loadMonthlyData();
    }, [loadMonthlyData]);

    useEffect(() => {
        if (selectedDate) {
            setMonthlySelectedMonth(selectedDate.slice(0, 7));
        }
    }, [selectedDate]);
    
    // Batch Menu State
    const [showBatchMenu, setShowBatchMenu] = useState(false);
    const batchMenuRef = useRef<HTMLDivElement>(null);
    const mobileBatchMenuRef = useRef<HTMLDivElement>(null);

    const staffCacheRef = useRef<{ data: Employee[]; ts: number } | null>(null);
    const STAFF_CACHE_TTL = 5 * 60 * 1000;

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const insideBatch = batchMenuRef.current && batchMenuRef.current.contains(event.target as Node);
            const insideMobileBatch = mobileBatchMenuRef.current && mobileBatchMenuRef.current.contains(event.target as Node);
            if (!insideBatch && !insideMobileBatch) {
                setShowBatchMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
    useEffect(() => { const dateStr = getBusinessDate(); setSelectedDate(dateStr); loadData(dateStr); }, []);

    const getBusinessDate = () => { const now = new Date(); if (now.getHours() < 4) now.setDate(now.getDate() - 1); return now.toISOString().split('T')[0]; };
    
    const loadData = useCallback(async (dateStr: string, forceRefreshStaff = false) => {
        setIsLoading(true);
        try {
            const now = Date.now();
            const cacheValid = staffCacheRef.current && 
                              (now - staffCacheRef.current.ts < STAFF_CACHE_TTL) && 
                              !forceRefreshStaff;

            if (!cacheValid) {
                const allStaff = await DataManager.getEmployees();
                const filtered = allStaff.filter(s => !s.isArchived && !(s.role || '').includes('Owner'));
                staffCacheRef.current = { data: filtered, ts: now };
                setStaffList(filtered);
            }

            const [attendanceData, { roster }] = await Promise.all([
                DataManager.getAttendanceByDate(dateStr),
                DataManager.getRosterData()
            ]);

            setTodayRecords(mergeAttendanceRecords(attendanceData));
            setDailyRoster(roster[dateStr] || {});
        } catch (error) {
            console.error("loadData failed:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // === 人脸打卡机数据解析与导入助手 ===
    const findMatchedEmployeeLocal = (excelName: string, systemEmployees: Employee[]) => {
        const cleanExcel = excelName.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!cleanExcel) return null;

        // 精确匹配
        let match = systemEmployees.find(
            (e) => e.name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanExcel,
        );
        if (match) return match;

        // 包含匹配
        match = systemEmployees.find((e) => {
            const sysClean = e.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            return sysClean.includes(cleanExcel) || cleanExcel.includes(sysClean);
        });
        return match || null;
    };

    const constructPunchTimesLocal = (
        dateStr: string,
        firstTime: string,
        lastTime: string,
    ) => {
        const [inH, inM] = firstTime.split(":").map(Number);
        const clockInISO = `${dateStr}T${String(inH).padStart(2, "0")}:${String(inM).padStart(2, "0")}:00`;

        let clockOutISO = "";
        let durationMinutes = 0;
        if (lastTime && lastTime !== firstTime) {
            const [outH, outM] = lastTime.split(":").map(Number);
            const clockInVal = inH * 60 + inM;
            const clockOutVal = outH * 60 + outM;

            if (clockOutVal < clockInVal) {
                // 跨凌晨班
                const nextDate = new Date(`${dateStr}T00:00:00`);
                nextDate.setDate(nextDate.getDate() + 1);
                const nextDateStr = nextDate.toISOString().split("T")[0];
                clockOutISO = `${nextDateStr}T${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}:00`;
            } else {
                clockOutISO = `${dateStr}T${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}:00`;
            }
            durationMinutes = Math.max(
                0,
                Math.floor(
                    (new Date(clockOutISO).getTime() - new Date(clockInISO).getTime()) /
                    60000,
                ),
            );
        } else {
            clockOutISO = clockInISO;
            durationMinutes = 0;
        }

        return { clockInISO, clockOutISO, durationMinutes };
    };

    const handleFileChangeLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsing(true);
        setParseError(null);
        setImportPreviews([]);

        try {
            const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
            const reader = new FileReader();
            
            reader.onload = async (evt) => {
                try {
                    const arrayBuffer = evt.target?.result as ArrayBuffer;

                    if (isPdf) {
                        

                        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                        const pdf = await loadingTask.promise;
                        const numPages = pdf.numPages;

                        const extractTimes = (cellText: string): string[] => {
                            const times: string[] = [];
                            if (!cellText) return times;
                            const timeRegex = /\b([0-2]?\d):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\b/gi;
                            let match;
                            while ((match = timeRegex.exec(cellText)) !== null) {
                                let hour = parseInt(match[1], 10);
                                const minute = match[2];
                                const ampm = match[4];
                                if (ampm) {
                                    if (ampm.toLowerCase() === "pm" && hour < 12) {
                                        hour += 12;
                                    } else if (ampm.toLowerCase() === "am" && hour === 12) {
                                        hour = 0;
                                    }
                                }
                                times.push(`${String(hour).padStart(2, "0")}:${minute}`);
                            }
                            return times;
                        };

                        const allParsedEmployees: Map<string, { scannerId: string; scannerName: string; daysMap: Map<number, Set<string>> }> = new Map();

                        for (let p = 1; p <= numPages; p++) {
                            const page = await pdf.getPage(p);
                            const textContent = await page.getTextContent();
                            const items = textContent.items as any[];
                            if (!items || items.length === 0) continue;

                            const pageItems = items.map(item => ({
                                str: String(item.str || "").trim(),
                                x: item.transform[4],
                                y: item.transform[5],
                                width: item.width || 0,
                                height: item.height || 0
                            })).filter(item => item.str.length > 0);

                            const pageLines: { y: number; items: typeof pageItems; text: string }[] = [];
                            pageItems.forEach(item => {
                                let foundLine = pageLines.find(l => Math.abs(l.y - item.y) < 10);
                                if (foundLine) {
                                    foundLine.items.push(item);
                                } else {
                                    pageLines.push({ y: item.y, items: [item], text: "" });
                                }
                            });
                            pageLines.sort((a, b) => b.y - a.y);
                            
                            let pageDayXMap: { [dayNum: number]: number } = {};
                            let hasPageDayHeader = false;

                            for (const line of pageLines) {
                                const tempMap: { [dayNum: number]: number } = {};
                                let consecDays = 0;
                                line.items.forEach(item => {
                                    const tokens = item.str.trim().split(/\s+/);
                                    if (tokens.length === 1) {
                                        const val = tokens[0];
                                        const match = val.match(/^0?([1-9]|[12]\d|3[01])$/);
                                        if (match) {
                                            const day = Number(match[1]);
                                            tempMap[day] = item.x;
                                            consecDays++;
                                        }
                                    } else {
                                        const itemWidth = item.width || 0;
                                        const textLen = item.str.length || 1;
                                        let currentIdx = 0;
                                        tokens.forEach(token => {
                                            const match = token.match(/^0?([1-9]|[12]\d|3[01])$/);
                                            if (match) {
                                                const day = Number(match[1]);
                                                const charOffset = item.str.indexOf(token, currentIdx);
                                                if (charOffset !== -1) {
                                                    currentIdx = charOffset + token.length;
                                                }
                                                const pct = charOffset / textLen;
                                                const estimatedX = item.x + pct * itemWidth;
                                                tempMap[day] = estimatedX;
                                                consecDays++;
                                            }
                                        });
                                    }
                                });
                                if (consecDays >= 12) {
                                    pageDayXMap = tempMap;
                                    hasPageDayHeader = true;
                                    break;
                                }
                            }

                            const extractDayFromRow = (rowItems: typeof pageItems, rowStr: string): number | null => {
                                const dayWeekMatch = rowStr.match(/\b(0?[1-9]|[1-2]\d|3[01])\s*(Mo|Tu|We|Th|Fr|Sa|Su)\b/i);
                                if (dayWeekMatch) {
                                    return parseInt(dayWeekMatch[1], 10);
                                }

                                const sorted = [...rowItems].sort((a, b) => a.x - b.x);
                                for (let i = 0; i < Math.min(3, sorted.length); i++) {
                                    const val = sorted[i].str.trim();
                                    if (/^\d+$/.test(val)) {
                                        const num = parseInt(val, 10);
                                        if (num >= 1 && num <= 31) {
                                            return num;
                                        }
                                    }
                                }
                                return null;
                            };

                            const rawHeadersList: { id: string; name: string; x: number; y: number }[] = [];

                            pageItems.forEach((item) => {
                                const txt = item.str;
                                const idMatch = txt.match(/No\s*[:：]?\s*(\d+)/i) || txt.match(/工号\s*[:：]?\s*(\d+)/i) || txt.match(/ID\s*[:：]?\s*(\d+)/i);
                                if (idMatch) {
                                    const empId = idMatch[1];
                                    const nameMatch = txt.match(/Name\s*[:：]?\s*([^:：\r\n]+)/i) || txt.match(/姓名\s*[:：]?\s*([^:：\r\n]+)/);
                                    let empName = "";
                                    if (nameMatch) {
                                        const rawName = nameMatch[1].trim();
                                        empName = rawName.split(/\s+(?:Dept|部门|工号|No|ID|Date)\b/i)[0].trim();
                                    }

                                    if (!empName) {
                                        const sameRowItems = pageItems.filter(other => Math.abs(other.y - item.y) < 10 && other !== item);
                                        sameRowItems.sort((a, b) => a.x - b.x);
                                        const jointStr = sameRowItems.map(o => o.str).join(" ");
                                        const rowNameMatch = jointStr.match(/Name\s*[:：]?\s*([^:：\r\n]+)/i) || jointStr.match(/姓名\s*[:：]?\s*([^:：\r\n]+)/);
                                        if (rowNameMatch) {
                                            const rawName = rowNameMatch[1].trim();
                                            empName = rawName.split(/\s+(?:Dept|部门|工号|No|ID|Date)\b/i)[0].trim();
                                        } else {
                                            const possibleNameItem = sameRowItems.find(o => 
                                                /[a-zA-Z\u4e00-\u9fa5]+/.test(o.str) && 
                                                !o.str.toLowerCase().includes("dept") && 
                                                !o.str.toLowerCase().includes("no") && 
                                                !o.str.toLowerCase().includes("admin") && 
                                                !o.str.toLowerCase().includes("boh")
                                            );
                                            if (possibleNameItem) {
                                                empName = possibleNameItem.str;
                                            }
                                        }
                                    }

                                    empName = empName.replace(/^[:：\s]+/, "").trim();

                                    rawHeadersList.push({
                                        id: empId,
                                        name: empName || `员工 ${empId}`,
                                        x: item.x,
                                        y: item.y
                                    });
                                }
                            });

                            // Always run separate item fallback sweep to maximize coverage
                            for (let i = 0; i < pageItems.length; i++) {
                                const item = pageItems[i];
                                const txt = item.str.trim();
                                if (/^(No|ID|工号|No\.)$/i.test(txt)) {
                                    const nextItems = pageItems.filter(o => Math.abs(o.y - item.y) < 10 && o.x > item.x);
                                    nextItems.sort((a, b) => a.x - b.x);
                                    if (nextItems.length > 0) {
                                        // Find first next item with a numeric ID
                                        const possibleIdItem = nextItems.find(o => {
                                            const clean = o.str.replace(/^[:：\s]+/, "").trim();
                                            return /^\d{3,8}$/.test(clean);
                                        });
                                        if (possibleIdItem) {
                                            const empId = possibleIdItem.str.replace(/^[:：\s]+/, "").trim();
                                            let empName = "";
                                            
                                            // Find the label "Name" or "姓名" and extract subsequent alphabetical string
                                            const nameLabelIdx = nextItems.findIndex(o => /^(Name|姓名)$/i.test(o.str.replace(/^[:：\s]+/, "")));
                                            if (nameLabelIdx !== -1) {
                                                const afterNameItems = nextItems.slice(nameLabelIdx + 1);
                                                const nameItem = afterNameItems.find(o => 
                                                    /[a-zA-Z\u4e00-\u9fa5]+/.test(o.str) && 
                                                    !o.str.toLowerCase().includes("dept") && 
                                                    !o.str.toLowerCase().includes("no") && 
                                                    !o.str.toLowerCase().includes("admin") && 
                                                    !o.str.toLowerCase().includes("boh")
                                                );
                                                if (nameItem) {
                                                    empName = nameItem.str;
                                                }
                                            }
                                            
                                            empName = empName.replace(/^[:：\s]+/, "").trim();
                                            rawHeadersList.push({
                                                id: empId,
                                                name: empName || `员工 ${empId}`,
                                                x: item.x,
                                                y: item.y
                                            });
                                        }
                                    }
                                }
                            }

                            // Deduplicate headers by employee ID
                            const uniqueHeadersMap = new Map<string, { id: string; name: string; x: number; y: number }>();
                            rawHeadersList.forEach(h => {
                                const cleanId = String(h.id).trim();
                                if (!uniqueHeadersMap.has(cleanId)) {
                                    uniqueHeadersMap.set(cleanId, h);
                                } else {
                                    const existing = uniqueHeadersMap.get(cleanId)!;
                                    const existingIsGeneric = existing.name.includes("员工") || existing.name.includes("Date") || existing.name.includes("2026");
                                    const newIsBetter = !(h.name.includes("员工") || h.name.includes("Date") || h.name.includes("2026"));
                                    if (existingIsGeneric && newIsBetter) {
                                        uniqueHeadersMap.set(cleanId, h);
                                    }
                                }
                            });

                            const headers = Array.from(uniqueHeadersMap.values());

                            if (headers.length === 0) continue;

                            const hasSideBySide = headers.some(h1 => 
                                headers.some(h2 => h1 !== h2 && Math.abs(h1.y - h2.y) < 30)
                            );

                            if (hasSideBySide) {
                                headers.sort((a, b) => a.x - b.x);

                                const midpoints: number[] = [];
                                for (let hIdx = 0; hIdx < headers.length - 1; hIdx++) {
                                    midpoints.push((headers[hIdx].x + headers[hIdx + 1].x) / 2);
                                }

                                for (let i = 0; i < headers.length; i++) {
                                    const header = headers[i];
                                    const xStart = (i === 0) ? 0 : midpoints[i - 1];
                                    const xEnd = (i === headers.length - 1) ? Infinity : midpoints[i];

                                    const colItems = pageItems.filter(item => item.x >= xStart && item.x < xEnd);

                                    const rows: { y: number; items: typeof colItems }[] = [];
                                    colItems.forEach(item => {
                                        let foundRow = rows.find(r => Math.abs(r.y - item.y) < 10);
                                        if (foundRow) {
                                            foundRow.items.push(item);
                                        } else {
                                            rows.push({ y: item.y, items: [item] });
                                        }
                                    });

                                    rows.sort((a, b) => b.y - a.y);

                                    const key = header.id ? `id_${header.id}` : `name_${header.name.toLowerCase()}`;
                                    if (!allParsedEmployees.has(key)) {
                                        allParsedEmployees.set(key, {
                                            scannerName: header.name,
                                            scannerId: header.id,
                                            daysMap: new Map()
                                        });
                                    }
                                    const empData = allParsedEmployees.get(key)!;

                                    rows.forEach(r => {
                                        r.items.sort((a, b) => a.x - b.x);
                                        const rowStr = r.items.map(o => o.str).join(" ");
                                        const dayNum = extractDayFromRow(r.items, rowStr);

                                        if (dayNum !== null) {
                                            const times = extractTimes(rowStr);
                                            if (times.length > 0) {
                                                if (!empData.daysMap.has(dayNum)) {
                                                    empData.daysMap.set(dayNum, new Set());
                                                }
                                                times.forEach(t => empData.daysMap.get(dayNum)!.add(t));
                                            }
                                        }
                                    });
                                }
                            } else {
                                headers.sort((a, b) => b.y - a.y);

                                for (let i = 0; i < headers.length; i++) {
                                    const header = headers[i];
                                    const yStart = header.y;
                                    const yEnd = (i < headers.length - 1) ? headers[i + 1].y : -Infinity;

                                    const empItems = pageItems.filter(item => item.y < yStart && item.y > yEnd);

                                    const rows: { y: number; items: typeof empItems }[] = [];
                                    empItems.forEach(item => {
                                        let foundRow = rows.find(r => Math.abs(r.y - item.y) < 10);
                                        if (foundRow) {
                                            foundRow.items.push(item);
                                        } else {
                                            rows.push({ y: item.y, items: [item] });
                                        }
                                    });

                                    let blockDayXMap: { [dayNum: number]: number } = {};
                                    let maxConsecDays = 0;
                                    let bestDayRowY = -1;

                                    rows.forEach(r => {
                                        const tempMap: { [dayNum: number]: number } = {};
                                        let consecDays = 0;
                                        r.items.forEach(item => {
                                            const tokens = item.str.trim().split(/\s+/);
                                            if (tokens.length === 1) {
                                                const val = tokens[0];
                                                const match = val.match(/^0?([1-9]|[12]\d|3[01])$/);
                                                if (match) {
                                                    const day = Number(match[1]);
                                                    tempMap[day] = item.x;
                                                    consecDays++;
                                                }
                                            } else {
                                                const itemWidth = item.width || 0;
                                                const textLen = item.str.length || 1;
                                                let currentIdx = 0;
                                                tokens.forEach(token => {
                                                    const match = token.match(/^0?([1-9]|[12]\d|3[01])$/);
                                                    if (match) {
                                                        const day = Number(match[1]);
                                                        const charOffset = item.str.indexOf(token, currentIdx);
                                                        if (charOffset !== -1) {
                                                            currentIdx = charOffset + token.length;
                                                        }
                                                        const pct = charOffset / textLen;
                                                        const estimatedX = item.x + pct * itemWidth;
                                                        tempMap[day] = estimatedX;
                                                        consecDays++;
                                                    }
                                                });
                                            }
                                        });
                                        if (consecDays > maxConsecDays && consecDays >= 5) {
                                            maxConsecDays = consecDays;
                                            blockDayXMap = tempMap;
                                            bestDayRowY = r.y;
                                        }
                                    });

                                    const key = header.id ? `id_${header.id}` : `name_${header.name.toLowerCase()}`;
                                    if (!allParsedEmployees.has(key)) {
                                        allParsedEmployees.set(key, {
                                            scannerName: header.name,
                                            scannerId: header.id,
                                            daysMap: new Map()
                                        });
                                    }
                                    const empData = allParsedEmployees.get(key)!;

                                    const activeDayXMap = hasPageDayHeader ? pageDayXMap : (maxConsecDays >= 5 ? blockDayXMap : null);

                                    if (activeDayXMap) {
                                        empItems.forEach(item => {
                                            const txt = item.str.trim();
                                            if (txt.toLowerCase().includes("no") || txt.toLowerCase().includes("name") || txt.toLowerCase().includes("dept")) return;
                                            
                                            const timesWithCoords: { time: string; x: number }[] = [];
                                            const timeRegex = /\b([0-2]?\d):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\b/gi;
                                            let match;
                                            const itemWidth = item.width || 0;
                                            const textLen = item.str.length || 1;
                                            
                                            while ((match = timeRegex.exec(txt)) !== null) {
                                                let hour = parseInt(match[1], 10);
                                                const minute = match[2];
                                                const ampm = match[4];
                                                if (ampm) {
                                                    if (ampm.toLowerCase() === "pm" && hour < 12) {
                                                        hour += 12;
                                                    } else if (ampm.toLowerCase() === "am" && hour === 12) {
                                                        hour = 0;
                                                    }
                                                }
                                                const timeStr = `${String(hour).padStart(2, "0")}:${minute}`;
                                                const charOffset = match.index;
                                                const pct = charOffset / textLen;
                                                const estimatedX = item.x + pct * itemWidth;
                                                timesWithCoords.push({ time: timeStr, x: estimatedX });
                                            }

                                            timesWithCoords.forEach(({ time, x }) => {
                                                let closestDayNum = -1;
                                                let minDistance = Infinity;

                                                Object.entries(activeDayXMap).forEach(([dStr, dayX]) => {
                                                    const dayNum = Number(dStr);
                                                    const dist = Math.abs(x - dayX);
                                                    if (dist < minDistance) {
                                                        minDistance = dist;
                                                        closestDayNum = dayNum;
                                                    }
                                                });

                                                if (closestDayNum !== -1 && minDistance < 40) {
                                                    if (!empData.daysMap.has(closestDayNum)) {
                                                        empData.daysMap.set(closestDayNum, new Set());
                                                    }
                                                    empData.daysMap.get(closestDayNum)!.add(time);
                                                }
                                            });
                                        });
                                    } else {
                                        rows.forEach(r => {
                                            r.items.sort((a, b) => a.x - b.x);
                                            const rowStr = r.items.map(o => o.str).join(" ");
                                            const dayNum = extractDayFromRow(r.items, rowStr);

                                            if (dayNum !== null) {
                                                const times = extractTimes(rowStr);
                                                if (times.length > 0) {
                                                    if (!empData.daysMap.has(dayNum)) {
                                                        empData.daysMap.set(dayNum, new Set());
                                                    }
                                                    times.forEach(t => empData.daysMap.get(dayNum)!.add(t));
                                                }
                                            }
                                        });
                                    }
                                }
                            }
                        }

                        const parsedResult: any[] = [];
                        allParsedEmployees.forEach((empData) => {
                            const rowsList: { day: number; times: string[] }[] = [];
                            empData.daysMap.forEach((timesSet, dayNum) => {
                                const rawOrderTimes = Array.from(timesSet);
                                rowsList.push({
                                    day: dayNum,
                                    times: rawOrderTimes
                                });
                            });

                            rowsList.sort((a, b) => a.day - b.day);

                            if (rowsList.length > 0) {
                                parsedResult.push({
                                    scannerName: empData.scannerName,
                                    scannerId: empData.scannerId,
                                    rows: rowsList
                                });
                            }
                        });

                        const finalMatches = parsedResult.map((item) => {
                            let matchedSystemEmp: Employee | null = null;
                            if (item.scannerId) {
                                const cleanScannerId = String(item.scannerId).trim();
                                matchedSystemEmp = staffList.find(
                                    (e) => String(e.id).trim() === cleanScannerId
                                ) || null;
                            }

                            if (!matchedSystemEmp && item.scannerName) {
                                matchedSystemEmp = findMatchedEmployeeLocal(
                                    item.scannerName,
                                    staffList,
                                );
                            }

                            return {
                                scannerName: item.scannerName,
                                scannerId: item.scannerId,
                                systemEmployee: matchedSystemEmp,
                                rawRows: item.rows,
                                selected: !!matchedSystemEmp,
                            };
                        });

                        setImportPreviews(finalMatches);
                    } else {
                        // FACE3000-U USB Excel (.xls/.xlsx) monthly attendance report
                        const workbook = XLSX.read(arrayBuffer, {
                            type: "array",
                            cellDates: true,
                            raw: true,
                        });

                        const normalizeCellText = (value: unknown): string =>
                            value === null || value === undefined ? "" : String(value).trim();

                        const parseExcelTime = (value: unknown): string | null => {
                            if (value === null || value === undefined || value === "") return null;

                            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                                return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
                            }

                            if (typeof value === "number" && Number.isFinite(value)) {
                                // Excel stores a time-only cell as a fraction of one day.
                                const dayFraction = ((value % 1) + 1) % 1;
                                const totalMinutes = Math.round(dayFraction * 24 * 60) % (24 * 60);
                                return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
                            }

                            const text = normalizeCellText(value);
                            const match = text.match(/\b([0-2]?\d):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM)?\b/i);
                            if (!match) return null;

                            let hour = Number(match[1]);
                            const minute = Number(match[2]);
                            const ampm = match[3]?.toUpperCase();
                            if (ampm === "PM" && hour < 12) hour += 12;
                            if (ampm === "AM" && hour === 12) hour = 0;
                            if (hour > 23) return null;
                            return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                        };

                        const parseMonthFromSheet = (rows: unknown[][]): string | null => {
                            for (const row of rows.slice(0, 8)) {
                                for (const value of row || []) {
                                    const text = normalizeCellText(value);
                                    const match = text.match(/(20\d{2})[\/-](0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])/);
                                    if (match) {
                                        return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
                                    }
                                }
                            }
                            return null;
                        };

                        const parsedEmployees = new Map<string, {
                            scannerId: string;
                            scannerName: string;
                            sourceMonth: string | null;
                            daysMap: Map<number, string[]>;
                        }>();

                        workbook.SheetNames
                            .filter((sheetName) => !/^(summary|logs?)$/i.test(sheetName.trim()))
                            .forEach((sheetName) => {
                                const sheet = workbook.Sheets[sheetName];
                                if (!sheet) return;

                                const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
                                    header: 1,
                                    raw: true,
                                    defval: "",
                                    blankrows: false,
                                });
                                if (rows.length === 0) return;

                                const sourceMonth = parseMonthFromSheet(rows);
                                const maxColumns = Math.max(...rows.map((row) => row.length), 0);

                                // FACE3000-U places up to three employees side by side, 15 columns per block.
                                for (let baseColumn = 0; baseColumn < maxColumns; baseColumn += 15) {
                                    const nameLabel = normalizeCellText(rows[2]?.[baseColumn + 8]);
                                    const idLabel = normalizeCellText(rows[3]?.[baseColumn + 8]);
                                    const scannerName = normalizeCellText(rows[2]?.[baseColumn + 9]);
                                    const scannerId = normalizeCellText(rows[3]?.[baseColumn + 9]).replace(/\.0$/, "");

                                    if (!scannerName && !scannerId) continue;
                                    if (nameLabel && !/^name$/i.test(nameLabel)) continue;
                                    if (idLabel && !/^(no|id|no\.)$/i.test(idLabel)) continue;

                                    const key = scannerId
                                        ? `id_${scannerId}`
                                        : `name_${scannerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

                                    if (!parsedEmployees.has(key)) {
                                        parsedEmployees.set(key, {
                                            scannerId,
                                            scannerName: scannerName || `员工 ${scannerId}`,
                                            sourceMonth,
                                            daysMap: new Map(),
                                        });
                                    }

                                    const employeeData = parsedEmployees.get(key)!;
                                    if (!employeeData.sourceMonth && sourceMonth) employeeData.sourceMonth = sourceMonth;

                                    // Daily rows begin at Excel row 12 (zero-based index 11).
                                    for (let rowIndex = 11; rowIndex < rows.length; rowIndex++) {
                                        const row = rows[rowIndex] || [];
                                        const dayCell = normalizeCellText(row[baseColumn]);
                                        const dayMatch = dayCell.match(/^0?([1-9]|[12]\d|3[01])(?:\s|$)/);
                                        if (!dayMatch) continue;

                                        const day = Number(dayMatch[1]);
                                        const timeOffsets = [1, 3, 6, 8, 10, 12];
                                        const times: string[] = [];

                                        timeOffsets.forEach((offset) => {
                                            const time = parseExcelTime(row[baseColumn + offset]);
                                            if (time && !times.includes(time)) times.push(time);
                                        });

                                        if (times.length === 0) continue;

                                        const existing = employeeData.daysMap.get(day) || [];
                                        times.forEach((time) => {
                                            if (!existing.includes(time)) existing.push(time);
                                        });
                                        employeeData.daysMap.set(day, existing);
                                    }
                                }
                            });

                        const parsedResult = Array.from(parsedEmployees.values())
                            .map((employeeData) => ({
                                scannerName: employeeData.scannerName,
                                scannerId: employeeData.scannerId,
                                sourceMonth: employeeData.sourceMonth,
                                rows: Array.from(employeeData.daysMap.entries())
                                    .map(([day, times]) => ({ day, times }))
                                    .sort((a, b) => a.day - b.day),
                            }))
                            .filter((item) => item.rows.length > 0);

                        if (parsedResult.length === 0) {
                            throw new Error("未在 Excel 中找到 FACE3000-U 考勤记录");
                        }

                        const finalMatches = parsedResult.map((item) => {
                            let matchedSystemEmp: Employee | null = null;
                            if (item.scannerId) {
                                const cleanScannerId = String(item.scannerId).trim();
                                matchedSystemEmp = staffList.find(
                                    (employee) => String(employee.id).trim() === cleanScannerId,
                                ) || null;
                            }

                            if (!matchedSystemEmp && item.scannerName) {
                                matchedSystemEmp = findMatchedEmployeeLocal(item.scannerName, staffList);
                            }

                            return {
                                scannerName: item.scannerName,
                                scannerId: item.scannerId,
                                sourceMonth: item.sourceMonth,
                                systemEmployee: matchedSystemEmp,
                                rawRows: item.rows,
                                selected: !!matchedSystemEmp,
                            };
                        });

                        setImportPreviews(finalMatches);
                    }
                } catch (err) {
                    console.error(err);
                    setParseError("解析打卡文件失败，请确保格式正确且包含对应的考勤打卡信息。");
                } finally {
                    setIsParsing(false);
                }
            };

            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.error(err);
            setParseError("读取文件失败，请重试");
            setIsParsing(false);
        }
    };

    const handleSaveImportLocal = async () => {
        const selectedPreviews = importPreviews.filter((p) => p.selected && p.systemEmployee);
        if (selectedPreviews.length === 0) {
            alert("请选择至少一个有效匹配的员工进行导入。");
            return;
        }

        setIsSavingImport(true);
        try {
            let totalSaved = 0;
            for (const preview of selectedPreviews) {
                const emp = preview.systemEmployee;
                const targetMonth = preview.sourceMonth || selectedDate.slice(0, 7);
                for (const row of preview.rawRows) {
                    const dateStr = `${targetMonth}-${String(row.day).padStart(2, "0")}`;
                    const times = row.times;
                    if (times.length === 0) continue;

                    const firstTime = times[0];
                    const lastTime = times[times.length - 1];
                    const { clockInISO, clockOutISO, durationMinutes } =
                        constructPunchTimesLocal(dateStr, firstTime, lastTime);

                    const calc = getAttendanceStatus(clockInISO, clockOutISO, dateStr, shiftSettings, emp.shiftGroup || 1);
                    const status = calc.status;

                    const record: AttendanceRecord = {
                        id: `attendance_${emp.id}_${dateStr}_face`, // 🤖 独立后缀保存，绝对安全
                        employeeId: emp.id,
                        employeeName: emp.name,
                        date: dateStr,
                        clockIn: clockInISO,
                        clockOut: clockOutISO,
                        durationMinutes: durationMinutes,
                        status: status,
                        source: "face_machine",
                        notes: `人脸打卡机导入 (工号: ${preview.scannerId || "N/A"})`,
                        allTimes: times, // 保存所有打卡时间
                    };

                    await DataManager.saveAttendance(record);
                    totalSaved++;
                }
            }

            alert(
                `🎉 成功导入了 ${selectedPreviews.length} 名员工，共 ${totalSaved} 条打卡记录！\n系统已自动覆盖合并。`,
            );
            setIsFaceImportOpen(false);
            setImportPreviews([]);
            await loadData(selectedDate);
        } catch (err) {
            console.error("Error saving import", err);
            alert("保存打卡记录失败: " + (err as Error).message);
        } finally {
            setIsSavingImport(false);
        }
    };

    const initiateClockAction = (employee: Employee, type: 'IN' | 'OUT') => { 
        setPendingAction({ type, employee }); 
        setSecurityModalOpen(true); 
    };
    
    const executeClockAction = async () => {
        if (!pendingAction) return;
        const { employee, type } = pendingAction;
        const now = new Date();
        const dateStr = selectedDate; 
        
        const shift = getTargetShiftForDate(dateStr, currentShiftSettings, employee.shiftGroup || 1);
        
        if (type === 'IN') {
            const lateMinutes = calculateLateMinutes(now, dateStr, employee.shiftGroup || 1);
            const isLate = lateMinutes > currentShiftSettings.graceMinutes;
            
            const targetOutTime = shift.checkOut;
            const durationMinutes = Math.floor((targetOutTime.getTime() - now.getTime()) / 60000);

            const inStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const outStr = targetOutTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const newRecord: AttendanceRecord = { 
                id: `${dateStr}_${employee.id}`, 
                employeeId: employee.id, 
                employeeName: employee.name, 
                date: dateStr, 
                clockIn: now.toISOString(), 
                clockOut: targetOutTime.toISOString(), 
                durationMinutes: Math.max(0, durationMinutes), 
                status: isLate ? 'LATE' : 'COMPLETED', 
                notes: `Auto-Clocked Out @ ${shift.checkOutStr}`,
                allTimes: [inStr, outStr]
            };
            
            await DataManager.saveAttendance(newRecord);
            setTodayRecords(prev => [...prev, newRecord]);
        } else {
            const record = todayRecords.find(r => r.employeeId === employee.id);
            if (!record) return;
            const duration = Math.floor((now.getTime() - new Date(record.clockIn).getTime()) / 60000);
            
            const inStr = new Date(record.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const outStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const calc = getAttendanceStatus(record.clockIn, now.toISOString(), dateStr, currentShiftSettings, employee.shiftGroup || 1);

            // 💡 安全类型约束
            const newRecord: AttendanceRecord = { 
                ...record, 
                clockOut: now.toISOString(), 
                durationMinutes: duration, 
                status: calc.status,
                allTimes: [inStr, outStr]
            };
            
            await DataManager.saveAttendance(newRecord);
            setTodayRecords(prev => prev.map(r => r.id === record.id ? newRecord : r));
        }
        setPendingAction(null);
    };

    // 💡 提取安全的 Role 判读函数，防止空指针崩溃
    const safeRole = (role?: string) => (role || '').toUpperCase();
    const getBatchGroup = (role?: string): 'FLOOR' | 'KITCHEN' => {
        const r = safeRole(role);
        if (['MANAGER', 'SUPERVISOR', 'COUNTER', 'CAPTAIN', 'WAITER', 'CLEANER', 'PART_TIME', 'BAR', 'DISH', '水吧', '洗碗'].some(k => r.includes(k))) {
            return 'FLOOR';
        }
        return 'KITCHEN';
    };

    const handleBatchClockIn = async (targetGroup: 'FLOOR' | 'KITCHEN' | 'ALL') => {
        setShowBatchMenu(false); 

        const eligibleStaff = currentDateStaffList.filter(staff => {
            if (staff.isAttendanceExempt) return false;
            const hasRecord = todayRecords.some(r => r.employeeId === staff.id);
            if (hasRecord) return false;
            const status = dailyRoster[staff.id];
            if (status && ['OFF', 'MC', 'LEAVE', 'ABSENT', 'ANNUAL'].includes(status)) return false;
            if (targetGroup !== 'ALL') {
                const staffGroup = getBatchGroup(staff.role);
                if (staffGroup !== targetGroup) return false;
            }
            return true;
        });

        if (eligibleStaff.length === 0) {
            alert(`没有需要打卡的${targetGroup === 'FLOOR' ? '楼面' : targetGroup === 'KITCHEN' ? '厨房' : ''}员工 (No eligible staff)`);
            return;
        }

        const groupName = targetGroup === 'FLOOR' ? '楼面+水吧+洗碗' : targetGroup === 'KITCHEN' ? '厨房核心' : '全员';
        if (!confirm(`确定要为 ${eligibleStaff.length} 位 [${groupName}] 员工一键打卡吗？\n(Batch Clock In for ${eligibleStaff.length} staff?)`)) return;

        setIsLoading(true);
        try {
            const clockInTime = getShiftStart(selectedDate); 
            const clockOutTime = new Date(selectedDate);
            clockOutTime.setDate(clockOutTime.getDate() + 1);
            clockOutTime.setHours(2, 0, 0, 0);

            const inStr = clockInTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const outStr = clockOutTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const updates = eligibleStaff.map(staff => {
                const newRecord: AttendanceRecord = {
                    id: `${selectedDate}_${staff.id}`,
                    employeeId: staff.id,
                    employeeName: staff.name,
                    date: selectedDate,
                    clockIn: clockInTime.toISOString(),
                    clockOut: clockOutTime.toISOString(),
                    durationMinutes: 600, 
                    status: 'COMPLETED',
                    notes: `Batch Auto-In (${groupName})`,
                    allTimes: [inStr, outStr]
                };
                return DataManager.saveAttendance(newRecord);
            });

            await Promise.all(updates);
            await loadData(selectedDate);
            alert(`✅ 已为 ${eligibleStaff.length} 位员工打卡`);
        } catch (error) {
            console.error(error);
            alert("Batch operation failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value;
        setSelectedDate(newDate);
        loadData(newDate);
    };

    const saveEditedRecord = async (updated: AttendanceRecord) => {
        await DataManager.saveAttendance(updated);
        setTodayRecords(prev => {
            const exists = prev.some(r => r.id === updated.id);
            if (exists) {
                return prev.map(r => r.id === updated.id ? updated : r);
            } else {
                return updated.date === selectedDate ? [...prev, updated] : prev;
            }
        });
        loadMonthlyData();
    };

    const toggleExemptStatus = async (staff: Employee) => {
        if (!confirm(`确定要将 ${staff.name} 设为 ${staff.isAttendanceExempt ? '需要打卡' : '免打卡 (无需考勤)'} 吗？`)) return;
        setIsLoading(true);
        try {
            const updatedStaff = { ...staff, isAttendanceExempt: !staff.isAttendanceExempt };
            await DataManager.saveEmployee(updatedStaff);
            setStaffList(prev => prev.map(s => s.id === staff.id ? updatedStaff : s));
            if (staffCacheRef.current) {
                staffCacheRef.current.data = staffCacheRef.current.data.map(
                    s => s.id === staff.id ? updatedStaff : s
                );
            }
        } catch (e) {
            console.error(e);
            alert('状态更新失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStaffShiftGroup = async (staff: Employee, newGroup: number) => {
        setIsLoading(true);
        try {
            const updatedStaff = { ...staff, shiftGroup: newGroup };
            await DataManager.saveEmployee(updatedStaff);
            setStaffList(prev => prev.map(s => s.id === staff.id ? updatedStaff : s));
            if (staffCacheRef.current) {
                staffCacheRef.current.data = staffCacheRef.current.data.map(
                    s => s.id === staff.id ? updatedStaff : s
                );
            }
        } catch (e) {
            console.error(e);
            alert('班次更新失败');
        } finally {
            setIsLoading(false);
        }
    };

    const filteredStaff = currentDateStaffList.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.includes(searchTerm));
    
    // --- FOUR-TIER ROLE CLASSIFICATION (With Safe Validation) ---
    const isWaterBar = (role?: string) => ['BAR', '水吧'].some(r => safeRole(role).includes(r));
    const isDishwasher = (role?: string) => ['DISH', '洗碗', 'CLEANER', '清洁', '后勤'].some(r => safeRole(role).includes(r));
    const isFOH = (role?: string) => ['MANAGER', 'SUPERVISOR', 'COUNTER', 'CAPTAIN', 'WAITER', 'PART_TIME'].some(r => safeRole(role).includes(r)) && !isWaterBar(role) && !isDishwasher(role);
    const isBOH = (role?: string) => !isFOH(role) && !isWaterBar(role) && !isDishwasher(role);

    const fohStaff = filteredStaff.filter(s => isFOH(s.role));
    const waterBarStaff = filteredStaff.filter(s => isWaterBar(s.role));
    const dishwasherStaff = filteredStaff.filter(s => isDishwasher(s.role));
    const bohStaff = filteredStaff.filter(s => isBOH(s.role));

    const sortStaff = (list: Employee[]) => {
        return list.sort((a, b) => {
            const recA = todayRecords.find(r => r.employeeId === a.id);
            const recB = todayRecords.find(r => r.employeeId === b.id);
            const statusA = recA ? (recA.clockOut ? 2 : 0) : 1; 
            const statusB = recB ? (recB.clockOut ? 2 : 0) : 1;
            return statusA - statusB;
        });
    };

    const sortedFOH = sortStaff(fohStaff);
    const sortedWaterBar = sortStaff(waterBarStaff);
    const sortedDishwasher = sortStaff(dishwasherStaff);
    const sortedBOH = sortStaff(bohStaff);

    const renderStaffCard = (staff: Employee) => {
        const record = todayRecords.find(r => r.employeeId === staff.id);
        const isCompleted = !!(record && record.clockOut); 
        const isLate = record && (record.status === 'LATE' || record.status === 'COMPLETED_LATE'); 
        
        const now = new Date();
        // 💡 替换非空断言，增加安全的 && 判断
        const isActiveShift = isCompleted && record?.clockOut && new Date(record.clockOut).getTime() > now.getTime();

        const planStatus = dailyRoster[staff.id] || 'WORK'; 
        const isPlannedOff = planStatus !== 'WORK';
        const rosterBadge = getRosterBadge(planStatus);

        return (
            <div key={staff.id} className={`p-3 md:p-5 rounded-2xl md:rounded-3xl border-2 transition-all shadow-sm flex flex-col justify-between gap-2 md:gap-4 group relative overflow-hidden active:scale-[0.98] ${
                isActiveShift ? 'bg-white border-green-400 ring-2 ring-green-100' : 
                isCompleted ? 'bg-gray-50 border-gray-200 opacity-80' : 
                isPlannedOff ? 'bg-gray-50 border-gray-200 opacity-75' : 
                'bg-white border-gray-100 hover:border-gray-300'
            }`}>
                <div className={`absolute top-0 left-0 w-full h-1.5 ${isActiveShift ? 'bg-green-500' : isCompleted ? 'bg-blue-400' : isPlannedOff ? 'bg-gray-300' : 'bg-gray-200'}`}></div>
                
                <div 
                    className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setSelectedMonthlyEmployee(staff)}
                    title="点击查看此员工月度考勤明细"
                >
                    <div className={`w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center font-black text-sm md:text-lg shrink-0 border-2 md:border-4 overflow-hidden ${isActiveShift ? 'border-green-100 text-green-700 bg-green-50' : 'border-gray-100 bg-gray-100 text-gray-400'}`}>
                        {staff.avatar ? <img src={staff.avatar} className="w-full h-full object-cover"/> : staff.name.charAt(0)}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black text-sm md:text-lg text-[#1A1A1A] leading-none">{staff.name}</h3>
                            <button 
                                onClick={(e) => { e.stopPropagation(); toggleExemptStatus(staff); }} 
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-colors shadow-sm active:scale-95 ${staff.isAttendanceExempt ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                            >
                                {staff.isAttendanceExempt ? '免打卡' : '设为免打卡'}
                            </button>
                            <select
                                value={staff.shiftGroup || 1}
                                onClick={(e) => e.stopPropagation()}
                                onChange={async (e) => {
                                    e.stopPropagation();
                                    const val = Number(e.target.value);
                                    await handleUpdateStaffShiftGroup(staff, val);
                                }}
                                className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-yellow-50 text-yellow-800 border border-yellow-200 shadow-sm outline-none cursor-pointer"
                            >
                                <option value={1}>班次 1</option>
                                <option value={2}>班次 2</option>
                            </select>
                        </div>
                        <p className="text-xs text-gray-400 font-bold mt-1">{(staff.role || '').split('(')[0]}</p>
                        {isLate && <span className="text-[9px] text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded-full border border-red-100">迟到 (Late)</span>}
                        {rosterBadge && isPlannedOff && <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${rosterBadge.color} ml-1`}>{rosterBadge.label}</span>}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    {staff.isAttendanceExempt ? (
                        <div className="flex-grow flex items-center justify-between gap-2">
                            <span className="flex-1 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border border-blue-100 justify-center">
                                <CheckCircle2 size={16}/> 无需打卡 (Exempt)
                            </span>
                            <button 
                                onClick={() => setSelectedMonthlyEmployee(staff)} 
                                className="p-2.5 bg-gray-100 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl transition-colors"
                                title="月度考勤明细"
                            >
                                <Calendar size={16}/>
                            </button>
                        </div>
                    ) : isCompleted ? (
                        <>
                            <div className="flex flex-col">
                                {isActiveShift ? (
                                    <div className="text-green-600 font-bold text-xs flex items-center gap-1">
                                        <Clock size={12} className="animate-spin-slow"/> 
                                        Working until 2AM
                                    </div>
                                ) : (
                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Shift Ended</span>
                                )}
                                <span className="text-sm font-black text-gray-700 font-mono">
                                    {record?.allTimes && record.allTimes.length > 0 ? (
                                        record.allTimes.join(' • ')
                                    ) : (
                                        `${new Date(record?.clockIn || '').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - ${record?.clockOut ? new Date(record.clockOut).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '02:00'}`
                                    )}
                                </span>
                            </div>
                            <div className="flex gap-1.5 items-center">
                                <span className="bg-blue-50 text-blue-600 px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12}/> Done</span>
                                <button onClick={() => { setEditingRecord(record as AttendanceRecord); setEditModalOpen(true); }} className="p-2 bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600"><Edit3 size={15}/></button>
                                <button 
                                    onClick={() => setSelectedMonthlyEmployee(staff)} 
                                    className="p-2 bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                                    title="月度考勤明细"
                                >
                                    <Calendar size={15}/>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="text-xs font-bold text-gray-300 italic">{isPlannedOff ? 'Scheduled OFF' : 'Not Started'}</span>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => initiateClockAction(staff, 'IN')} className={`border-2 text-sm font-bold px-4 py-3 md:px-6 md:py-2.5 min-h-[44px] rounded-xl transition-all shadow-sm flex items-center gap-2 ${isPlannedOff ? 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100' : 'bg-white border-gray-200 text-gray-600 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
                                    <LogIn size={16}/> {isPlannedOff ? '加班 (OT)' : '上班 (In)'}
                                </button>
                                {record && (
                                    <button onClick={() => { setEditingRecord(record as AttendanceRecord); setEditModalOpen(true); }} className="p-2 bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600"><Edit3 size={15}/></button>
                                )}
                                <button 
                                    onClick={() => setSelectedMonthlyEmployee(staff)} 
                                    className="p-2.5 bg-gray-100 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl transition-colors"
                                    title="月度考勤明细"
                                >
                                    <Calendar size={15}/>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const handleResetMonthlyAttendance = async () => {
        const targetMonth = selectedDate.slice(0, 7); // yyyy-mm
        if (!await (window as any).systemDialog.confirm(`⚠️ 确定要清空 ${targetMonth} 的所有考勤记录吗？\n此操作不可撤销，且会删除该月所有员工的打卡数据，建议仅在数据完全错误需要重新导入时使用。`, '考勤指挥台')) {
            return;
        }
        
        setIsLoading(true);
        try {
            const records = await DataManager.getAttendanceByMonth(targetMonth);
            if (records.length === 0) {
                await (window as any).systemDialog.alert(`✅ ${targetMonth} 目前没有打卡记录。`, '考勤指挥台');
                return;
            }
            
            let deleted = 0;
            for (const record of records) {
                await DataManager.deleteAttendance(record.id);
                deleted++;
            }
            
            await loadData(selectedDate);
            await (window as any).systemDialog.alert(`✅ 已成功清除 ${targetMonth} 的 ${deleted} 条考勤记录。`, '考勤指挥台');
        } catch (e: any) {
            console.error("Failed to reset monthly attendance", e);
            await (window as any).systemDialog.alert(`❌ 清除失败：${e.message}`, '考勤指挥台');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#F6F7FB] z-[100] flex flex-col animate-in fade-in duration-200 font-sans">
            <div className="bg-[#111111] text-white shrink-0 border-b-4 border-[#FFD200] px-4 md:px-5 h-[56px] md:h-16 flex justify-between items-center z-20 sticky top-0 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                    {onClose && (
                        <button 
                            onClick={onClose} 
                            className="md:hidden w-11 h-11 bg-white/10 hover:bg-red-500 hover:text-white rounded-xl flex items-center justify-center transition-colors text-gray-300 shrink-0"
                            id="mobile-close-btn"
                        >
                            <X size={18}/>
                        </button>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">⏱️</span>
                        <div className="min-w-0">
                            <h2 className="text-sm md:text-xl font-black text-white truncate">考勤指挥台</h2>
                            <p className="text-[8px] text-gray-400 font-mono tracking-widest uppercase mt-0.5 truncate">Central Attendance Control</p>
                        </div>
                    </div>
                </div>
                {/* Desktop Buttons */}
                <div className="hidden md:flex items-center gap-3">
                    <div className="relative shrink-0" ref={batchMenuRef}>
                        <button 
                            onClick={() => setShowBatchMenu(!showBatchMenu)} 
                            disabled={isLoading} 
                            className="bg-[#FFD200] text-black hover:bg-white px-5 py-3 rounded-2xl text-sm font-bold transition-all border border-[#FFD200] flex items-center gap-2 active:scale-95 shadow-lg whitespace-nowrap"
                        >
                            <Zap size={14} fill="currentColor"/> <span>一键开工</span> <ChevronDown size={14} className={`transition-transform ${showBatchMenu ? 'rotate-180' : ''}`}/>
                        </button>
                        {showBatchMenu && (
                            <div className="absolute top-full mt-2 right-0 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 min-w-[200px] overflow-hidden animate-in fade-in slide-in-from-top-2">
                                <button onClick={() => handleBatchClockIn('FLOOR')} className="w-full px-5 py-4 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors">
                                    <Briefcase size={18} className="text-yellow-600"/><div><span className="text-sm text-[#111111] font-bold">楼面开工</span><p className="text-[10px] text-gray-400">FOH + Bar + Dish</p></div>
                                </button>
                                <button onClick={() => handleBatchClockIn('KITCHEN')} className="w-full px-5 py-4 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors">
                                    <ChefHat size={18} className="text-orange-600"/><div><span className="text-sm text-[#111111] font-bold">厨房开工</span><p className="text-[10px] text-gray-400">Kitchen Core</p></div>
                                </button>
                                <button onClick={() => handleBatchClockIn('ALL')} className="w-full px-5 py-4 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors">
                                    <Users size={18} className="text-blue-600"/><div><span className="text-sm text-[#111111]">全员开工</span><p className="text-[10px] text-gray-400">All Staff</p></div>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={() => setShowRollCall(true)} className="bg-white/10 hover:bg-white/20 px-5 py-3 rounded-2xl text-sm font-bold transition-all border border-white/10 flex items-center gap-2 active:scale-95 whitespace-nowrap"><ListChecks size={14}/> 点名</button>
                        <button onClick={() => setShowReport(true)} className="bg-white/10 hover:bg-white/20 px-5 py-3 rounded-2xl text-sm font-bold transition-all border border-white/10 flex items-center gap-2 active:scale-95 whitespace-nowrap"><FileBarChart size={14}/> 达标</button>
                        <button onClick={() => setIsSettingsOpen(true)} className="bg-white/10 hover:bg-white/20 px-5 py-3 rounded-2xl text-sm font-bold transition-all border border-white/10 flex items-center gap-2 active:scale-95 whitespace-nowrap"><Clock size={14}/> 排班设置</button>
                        <button onClick={handleResetMonthlyAttendance} className="bg-rose-600 hover:bg-rose-500 px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-md flex items-center gap-2 active:scale-95 whitespace-nowrap text-white"><Trash2 size={14}/> 重置本月</button>
                        <button onClick={() => setIsFaceImportOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-md flex items-center gap-2 active:scale-95 whitespace-nowrap text-white"><Calendar size={14}/> 导入打卡</button>
                    </div>
                    <div className="h-10 w-px bg-white/10 mx-2"></div>
                    {onClose && <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-colors shrink-0"><X size={20}/></button>}
                </div>
                {/* Mobile Right Close Button */}
                <div className="md:hidden flex items-center shrink-0">
                    {onClose && (
                        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-red-500 rounded-xl transition-colors text-gray-300 shrink-0 active:scale-95"><X size={18}/></button>
                    )}
                </div>
            </div>

            {/* 手机端 Action Chips 横向滚动条 */}
            <div className="md:hidden bg-[#F6F7FB] px-4 pt-3 pb-1 shrink-0 z-10 overflow-hidden">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 flex-nowrap" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="relative shrink-0" ref={mobileBatchMenuRef}>
                        <button 
                            onClick={() => setShowBatchMenu(!showBatchMenu)} 
                            disabled={isLoading} 
                            className="bg-[#FFD200] text-black active:bg-yellow-400 px-4 py-2.5 rounded-xl text-xs font-black border border-[#FFD200]/30 flex items-center gap-1.5 shadow-sm min-h-[44px] whitespace-nowrap"
                        >
                            <Zap size={12} fill="currentColor"/> <span>一键开工</span> <ChevronDown size={12} className={`transition-transform ${showBatchMenu ? 'rotate-180' : ''}`}/>
                        </button>
                        {showBatchMenu && (
                            <div className="absolute top-full mt-2 left-0 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[60] min-w-[200px] overflow-hidden animate-in fade-in slide-in-from-top-2">
                                <button onClick={() => { handleBatchClockIn('FLOOR'); setShowBatchMenu(false); }} className="w-full px-5 py-4 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors">
                                    <Briefcase size={18} className="text-yellow-600"/><div><span className="text-xs text-[#111111] font-bold">楼面开工</span><p className="text-[10px] text-gray-400">FOH + Bar + Dish</p></div>
                                </button>
                                <button onClick={() => { handleBatchClockIn('KITCHEN'); setShowBatchMenu(false); }} className="w-full px-5 py-4 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors">
                                    <ChefHat size={18} className="text-orange-600"/><div><span className="text-xs text-[#111111] font-bold">厨房开工</span><p className="text-[10px] text-gray-400">Kitchen Core</p></div>
                                </button>
                                <button onClick={() => { handleBatchClockIn('ALL'); setShowBatchMenu(false); }} className="w-full px-5 py-4 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors">
                                    <Users size={18} className="text-blue-600"/><div><span className="text-xs text-[#111111]">全员开工</span><p className="text-[10px] text-gray-400">All Staff</p></div>
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <button onClick={() => setShowRollCall(true)} className="bg-white hover:bg-gray-50 border border-[#E5E7EB] text-gray-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm min-h-[44px] whitespace-nowrap"><ListChecks size={12}/> 点名</button>
                    <button onClick={() => setShowReport(true)} className="bg-white hover:bg-gray-50 border border-[#E5E7EB] text-gray-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm min-h-[44px] whitespace-nowrap"><FileBarChart size={12}/> 达标</button>
                    <button onClick={() => setIsSettingsOpen(true)} className="bg-white hover:bg-gray-50 border border-[#E5E7EB] text-gray-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm min-h-[44px] whitespace-nowrap"><Clock size={12}/> 排班设置</button>
                    <button onClick={handleResetMonthlyAttendance} className="bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm min-h-[44px] whitespace-nowrap"><Trash2 size={12}/> 重置本月</button>
                    <button onClick={() => setIsFaceImportOpen(true)} className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm min-h-[44px] whitespace-nowrap"><Calendar size={12}/> 导入打卡</button>
                </div>
            </div>

            {/* Toolbar / Control Card */}
            <div className="bg-[#F6F7FB] md:bg-white px-4 md:px-6 py-2 md:py-4 shrink-0 z-10">
                <div className="bg-white md:bg-transparent p-3 md:p-0 rounded-2xl border border-[#E5E7EB] md:border-none shadow-sm md:shadow-none flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4">
                    <div className="flex items-center justify-between w-full md:w-auto gap-2">
                        <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-255 shrink-0">
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate()-1); setSelectedDate(d.toISOString().split('T')[0]); loadData(d.toISOString().split('T')[0]); }} className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-lg text-gray-500 active:scale-95"><TrendingUp size={16} className="rotate-180"/></button>
                            <input type="date" value={selectedDate} onChange={handleDateChange} className="bg-transparent font-black text-xs md:text-lg outline-none text-center w-28 md:w-40 text-[#111111] font-mono" />
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate()+1); setSelectedDate(d.toISOString().split('T')[0]); loadData(d.toISOString().split('T')[0]); }} className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-lg text-gray-500 active:scale-95"><TrendingUp size={16}/></button>
                        </div>
                        
                        <div className="flex gap-1.5 text-[10px] md:text-sm font-bold shrink-0">
                            <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1.5 rounded-xl border border-green-150"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>{todayRecords.filter(r => r.clockOut && new Date(r.clockOut).getTime() > new Date().getTime()).length} 在岗</span>
                            <span className="flex items-center gap-1 bg-gray-50 text-gray-600 px-2 py-1.5 rounded-xl border border-gray-150"><div className="w-2 h-2 rounded-full bg-gray-400"></div>{todayRecords.length} 记录</span>
                        </div>
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3.5 top-3 text-gray-400" size={16}/>
                        <input type="text" placeholder="搜索员工名称..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-3 py-2.5 md:py-3 bg-gray-50 border border-gray-255 md:border-none md:bg-gray-100 rounded-xl text-xs md:text-sm font-bold focus:bg-white focus:border-[#FFD200] focus:ring-4 focus:ring-[#FFD200]/10 transition-all outline-none min-h-[44px]"/>
                    </div>
                </div>
            </div>

            {/* Staff Grid */}
            <div className="flex-grow overflow-y-auto bg-[#F5F7FA]">
                <div className="p-4 md:p-8 pb-[max(env(safe-area-inset-bottom),2rem)] grid grid-cols-1 gap-8">
                    {isLoading ? <div className="text-center py-20 text-gray-400 font-bold animate-pulse text-lg">Loading Staff Data...</div> : (
                        <>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 mb-2 pb-2 border-b-2 border-gray-100">
                                    <div className="p-2 md:p-2.5 bg-yellow-100 text-yellow-700 rounded-lg md:rounded-xl"><Briefcase size={18} className="md:w-6 md:h-6"/></div>
                                    <h3 className="font-black text-gray-800 text-base md:text-xl tracking-tight">楼面团队 (FOH)</h3>
                                    <span className="bg-gray-200 text-gray-600 text-xs font-black px-3 py-1 rounded-full">{sortedFOH.length}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {sortedFOH.map(renderStaffCard)}
                                    {sortedFOH.length === 0 && <div className="text-center py-12 text-gray-400 text-sm font-bold italic col-span-full bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">No FOH Staff Found</div>}
                                </div>
                            </div>

                            {(sortedWaterBar.length > 0 || searchTerm) && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 mb-2 pb-2 border-b-2 border-gray-100 mt-4">
                                        <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl"><Coffee size={24}/></div>
                                        <h3 className="font-black text-gray-800 text-xl tracking-tight">水吧团队 (Water Bar)</h3>
                                        <span className="bg-gray-200 text-gray-600 text-xs font-black px-3 py-1 rounded-full">{sortedWaterBar.length}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {sortedWaterBar.map(renderStaffCard)}
                                    </div>
                                </div>
                            )}

                            {(sortedDishwasher.length > 0 || searchTerm) && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 mb-2 pb-2 border-b-2 border-gray-100 mt-4">
                                        <div className="p-2.5 bg-cyan-100 text-cyan-600 rounded-xl"><Droplets size={24}/></div>
                                        <h3 className="font-black text-gray-800 text-xl tracking-tight">洗碗/清洁 (Dishwasher)</h3>
                                        <span className="bg-gray-200 text-gray-600 text-xs font-black px-3 py-1 rounded-full">{sortedDishwasher.length}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {sortedDishwasher.map(renderStaffCard)}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center gap-3 mb-2 pb-2 border-b-2 border-gray-100 mt-4">
                                    <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl"><ChefHat size={24}/></div>
                                    <h3 className="font-black text-gray-800 text-xl tracking-tight">厨房团队 (BOH)</h3>
                                    <span className="bg-gray-200 text-gray-600 text-xs font-black px-3 py-1 rounded-full">{sortedBOH.length}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {sortedBOH.map(renderStaffCard)}
                                    {sortedBOH.length === 0 && <div className="text-center py-12 text-gray-400 text-sm font-bold italic col-span-full bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">No BOH Staff Found</div>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            <SecurityPinModal isOpen={securityModalOpen} onClose={() => setSecurityModalOpen(false)} onSuccess={executeClockAction} employeeName={pendingAction?.employee.name || ''} targetPin={pendingAction?.employee.pin || '0000'} />
            {editingRecord && <EditRecordModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} record={editingRecord} onSave={saveEditedRecord} />}
            <RollCallModal isOpen={showRollCall} onClose={() => setShowRollCall(false)} staffList={currentDateStaffList} todayRecords={todayRecords} dateStr={selectedDate} onUpdate={async () => {
                const freshAttendance = await DataManager.getAttendanceByDate(selectedDate);
                setTodayRecords(mergeAttendanceRecords(freshAttendance));
            }} dailyRoster={dailyRoster} />
            <ComplianceReportModal isOpen={showReport} onClose={() => setShowReport(false)} staffList={staffList} />
            <AttendanceSettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)} 
                settings={shiftSettings} 
                onSave={(newSettings) => {
                    setShiftSettings(newSettings);
                    currentShiftSettings = newSettings;
                }} 
            />
            
            {selectedMonthlyEmployee && (
                <EmployeeMonthlySheetModal
                    isOpen={!!selectedMonthlyEmployee}
                    onClose={() => setSelectedMonthlyEmployee(null)}
                    employee={selectedMonthlyEmployee}
                    selectedMonth={monthlySelectedMonth}
                    onMonthChange={setMonthlySelectedMonth}
                    records={monthlyRecords}
                    roster={monthlyRoster}
                    onEditRow={(rec) => {
                        setEditingRecord(rec);
                        setEditModalOpen(true);
                    }}
                />
            )}

            {/* === FACE ATTENDANCE IMPORT MODAL === */}
            {isFaceImportOpen && (
                <div className="fixed inset-0 bg-black/60 z-[320] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
                        {/* Header */}
                        <div className="p-5 border-b border-gray-150 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
                                    <span>📅</span> 导入人脸打卡数据
                                </h3>
                                <p className="text-[10px] text-gray-500 font-bold mt-0.5 uppercase tracking-wide">
                                    Import Face Scanner Attendance ({selectedDate.slice(0, 7)})
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsFaceImportOpen(false);
                                    setImportPreviews([]);
                                    setParseError(null);
                                }}
                                className="p-3 text-gray-500 hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                                style={{ minWidth: "44px", minHeight: "44px" }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-[#1A1A1A]">
                            {/* Tips */}
                            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 flex gap-3">
                                <span className="text-lg">💡</span>
                                <div className="space-y-1">
                                    <p className="font-bold">
                                        数据双源高精度融合 (Dual-Source Syncing):
                                    </p>
                                    <p className="leading-relaxed">
                                        导入打卡机数据将<b>自动覆盖合并</b>
                                        该员工同日期的旧考勤（若有）。系统优先采用打卡机（Face
                                        Machine）的精准打卡，APP打卡作为第二辅助，绝对安全，绝不丢失任何数据！
                                    </p>
                                </div>
                            </div>

                            {/* Dropzone */}
                            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center bg-gray-50/50 hover:bg-gray-50 transition-all cursor-pointer relative min-h-[140px] flex items-center justify-center">
                                <input
                                    type="file"
                                    accept=".pdf,.xlsx,.xls"
                                    onChange={handleFileChangeLocal}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                                <div className="flex flex-col items-center gap-2">
                                    <span className="text-3xl">📂</span>
                                    <span className="font-black text-sm text-gray-700">
                                        拖拽或点击选择打卡机导出的 PDF 或 Excel 报表
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-bold">
                                        自动识别文件类型，智能提取考勤数据并建立多维度匹配模型
                                    </span>
                                </div>
                            </div>

                            {/* Parsing State */}
                            {isParsing && (
                                <div className="flex flex-col items-center justify-center py-8 gap-3">
                                    <Loader2 className="animate-spin text-blue-600" size={32} />
                                    <span className="text-xs font-black text-gray-500">
                                        正在极速解析打卡数据，并自动建立多维度姓名匹配模型...
                                    </span>
                                </div>
                            )}

                            {parseError && (
                                <div className="bg-red-50 text-red-800 border border-red-100 rounded-xl p-4 text-xs font-bold">
                                    ⚠️ {parseError}
                                </div>
                            )}

                            {/* Match Previews */}
                            {importPreviews.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                            <span>📋</span> 识别与绑定名单 ({importPreviews.length}{" "}
                                            人)
                                        </h4>
                                        <button
                                            onClick={() => {
                                                const allSelected = importPreviews.every(
                                                    (p) => p.selected,
                                                );
                                                setImportPreviews((prev) =>
                                                    prev.map((p) => ({ ...p, selected: !allSelected })),
                                                );
                                            }}
                                            className="text-[10px] font-black text-blue-600 hover:underline"
                                        >
                                            全选 / 反选
                                        </button>
                                    </div>

                                    <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[280px] overflow-y-auto shadow-inner bg-gray-50">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                                    <th className="p-3 w-10">选择</th>
                                                    <th className="p-3">打卡机姓名 (No.)</th>
                                                    <th className="p-3">绑定系统员工</th>
                                                    <th className="p-3 text-center">打卡天数</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 text-xs bg-white">
                                                {importPreviews.map((item, index) => {
                                                    const isMatched = !!item.systemEmployee;
                                                    return (
                                                        <tr
                                                            key={index}
                                                            className={`hover:bg-gray-50/50 ${isMatched ? "" : "bg-amber-50/30"}`}
                                                        >
                                                            <td className="p-3 text-center">
                                                                <button
                                                                    onClick={() => {
                                                                        if (!item.systemEmployee) {
                                                                            alert("请先绑定系统员工后再选择导入。");
                                                                            return;
                                                                        }
                                                                        setImportPreviews((prev) =>
                                                                            prev.map((p, idx) =>
                                                                                idx === index
                                                                                    ? { ...p, selected: !p.selected }
                                                                                    : p,
                                                                            ),
                                                                        );
                                                                    }}
                                                                    className="p-1.5 focus:outline-none"
                                                                    style={{
                                                                        minWidth: "32px",
                                                                        minHeight: "32px",
                                                                    }}
                                                                >
                                                                    {item.selected ? (
                                                                        <CheckCircle2
                                                                            className="text-emerald-600 mx-auto"
                                                                            size={18}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-4.5 h-4.5 rounded-full border border-gray-300 mx-auto" />
                                                                    )}
                                                                </button>
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="font-bold text-gray-800">
                                                                    {item.scannerName}
                                                                </div>
                                                                {item.scannerId && (
                                                                    <div className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">
                                                                        工号 No: {item.scannerId}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="p-3">
                                                                {isMatched ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                                                                            <span>✅</span> 已自动匹配:{" "}
                                                                            {item.systemEmployee?.name}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => {
                                                                                setImportPreviews((prev) =>
                                                                                    prev.map((p, idx) =>
                                                                                        idx === index
                                                                                            ? {
                                                                                                    ...p,
                                                                                                    systemEmployee: null,
                                                                                                    selected: false,
                                                                                                }
                                                                                            : p,
                                                                                    ),
                                                                                );
                                                                            }}
                                                                            className="text-[10px] text-gray-400 hover:text-red-500 underline ml-1"
                                                                        >
                                                                            解绑
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <select
                                                                        value={item.systemEmployee?.id || ""}
                                                                        onChange={(e) => {
                                                                            const empId = e.target.value;
                                                                            const selectedEmp =
                                                                                staffList.find((x) => x.id === empId) ||
                                                                                null;
                                                                            setImportPreviews((prev) =>
                                                                                prev.map((p, idx) => {
                                                                                    if (idx === index) {
                                                                                        return {
                                                                                            ...p,
                                                                                            systemEmployee: selectedEmp,
                                                                                            selected: !!selectedEmp,
                                                                                        };
                                                                                    }
                                                                                    return p;
                                                                                }),
                                                                            );
                                                                        }}
                                                                        className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-black outline-none text-amber-900 w-full"
                                                                        style={{ minHeight: "38px" }}
                                                                    >
                                                                        <option value="">
                                                                            ⚠️ 未找到匹配，请手动匹配...
                                                                        </option>
                                                                        {staffList.map((e) => (
                                                                            <option key={e.id} value={e.id}>
                                                                                {e.name} {e.isArchived ? "(离职)" : ""}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-center font-mono font-black text-gray-600">
                                                                {item.rawRows.length} 天
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="p-5 border-t border-gray-150 bg-gray-50 flex gap-3 justify-end shrink-0">
                            <button
                                onClick={() => {
                                    setIsFaceImportOpen(false);
                                    setImportPreviews([]);
                                    setParseError(null);
                                }}
                                className="px-5 py-3 rounded-xl border border-gray-200 bg-white font-bold text-xs text-gray-500 active:scale-95 transition-all"
                                style={{ minHeight: "44px" }}
                            >
                                取消 (Cancel)
                            </button>
                            <button
                                onClick={handleSaveImportLocal}
                                disabled={
                                    isSavingImport ||
                                    importPreviews.filter((p) => p.selected && p.systemEmployee)
                                        .length === 0
                                }
                                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-lg active:scale-95 transition-all flex items-center gap-2 disabled:opacity-40"
                                style={{ minHeight: "44px" }}
                            >
                                {isSavingImport ? (
                                    <>
                                        <Loader2 className="animate-spin" size={14} />
                                        正在导入并自动融合...
                                    </>
                                ) : (
                                    <>
                                        🚀 确认导入并融合{" "}
                                        {
                                            importPreviews.filter(
                                                (p) => p.selected && p.systemEmployee,
                                            ).length
                                        }{" "}
                                        人
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};