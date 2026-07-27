import React, { useState, useEffect } from 'react';
import { X, Clock, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { DataManager, AttendanceShiftSettings, PenaltyTier } from '../../utils/dataManager';

interface AttendanceSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AttendanceShiftSettings;
    onSave: (newSettings: AttendanceShiftSettings) => void;
}

export const AttendanceSettingsModal: React.FC<AttendanceSettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [weekdayIn, setWeekdayIn] = useState(settings.weekdayCheckIn);
    const [weekdayOut, setWeekdayOut] = useState(settings.weekdayCheckOut);
    const [weekendIn, setWeekendIn] = useState(settings.weekendCheckIn);
    const [weekendOut, setWeekendOut] = useState(settings.weekendCheckOut);
    
    // Break 1
    const [enableWeekdayBreak, setEnableWeekdayBreak] = useState(settings.enableWeekdayBreak ?? false);
    const [weekdayBreakStart, setWeekdayBreakStart] = useState(settings.weekdayBreakStart || '17:00');
    const [weekdayBreakEnd, setWeekdayBreakEnd] = useState(settings.weekdayBreakEnd || '18:00');
    const [enableWeekendBreak, setEnableWeekendBreak] = useState(settings.enableWeekendBreak ?? false);
    const [weekendBreakStart, setWeekendBreakStart] = useState(settings.weekendBreakStart || '17:00');
    const [weekendBreakEnd, setWeekendBreakEnd] = useState(settings.weekendBreakEnd || '18:00');

    // Shift 2
    const [weekdayIn2, setWeekdayIn2] = useState(settings.weekdayCheckIn2 || '09:00');
    const [weekdayOut2, setWeekdayOut2] = useState(settings.weekdayCheckOut2 || '18:00');
    const [weekendIn2, setWeekendIn2] = useState(settings.weekendCheckIn2 || '09:00');
    const [weekendOut2, setWeekendOut2] = useState(settings.weekendCheckOut2 || '18:00');

    // Break 2
    const [enableWeekdayBreak2, setEnableWeekdayBreak2] = useState(settings.enableWeekdayBreak2 ?? false);
    const [weekdayBreakStart2, setWeekdayBreakStart2] = useState(settings.weekdayBreakStart2 || '12:00');
    const [weekdayBreakEnd2, setWeekdayBreakEnd2] = useState(settings.weekdayBreakEnd2 || '13:00');
    const [enableWeekendBreak2, setEnableWeekendBreak2] = useState(settings.enableWeekendBreak2 ?? false);
    const [weekendBreakStart2, setWeekendBreakStart2] = useState(settings.weekendBreakStart2 || '12:00');
    const [weekendBreakEnd2, setWeekendBreakEnd2] = useState(settings.weekendBreakEnd2 || '13:00');

    // Switches
    const [enableLateCheck, setEnableLateCheck] = useState(settings.enableLateCheck ?? true);
    const [enableEarlyCheck, setEnableEarlyCheck] = useState(settings.enableEarlyCheck ?? true);
    const [enableLateEarlyCheck, setEnableLateEarlyCheck] = useState(settings.enableLateEarlyCheck ?? true);

    const [hasSpecial, setHasSpecial] = useState(settings.hasSpecialPeriod);
    const [specialStart, setSpecialStart] = useState(settings.specialStartDate || '');
    const [specialEnd, setSpecialEnd] = useState(settings.specialEndDate || '');
    const [specialIn, setSpecialIn] = useState(settings.specialCheckIn || '15:00');
    const [specialOut, setSpecialOut] = useState(settings.specialCheckOut || '02:00');
    
    const [grace, setGrace] = useState(settings.graceMinutes);
    const [enablePenalty, setEnablePenalty] = useState(settings.enablePenaltyRules ?? true);
    const [tiers, setTiers] = useState<PenaltyTier[]>([]);
    
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    // Active tab to switch between editing Shift 1 and Shift 2
    const [activeShiftTab, setActiveShiftTab] = useState<'SHIFT_1' | 'SHIFT_2'>('SHIFT_1');

    useEffect(() => {
        if (isOpen) {
            setWeekdayIn(settings.weekdayCheckIn);
            setWeekdayOut(settings.weekdayCheckOut);
            setWeekendIn(settings.weekendCheckIn);
            setWeekendOut(settings.weekendCheckOut);
            
            setEnableWeekdayBreak(settings.enableWeekdayBreak ?? false);
            setWeekdayBreakStart(settings.weekdayBreakStart || '17:00');
            setWeekdayBreakEnd(settings.weekdayBreakEnd || '18:00');
            setEnableWeekendBreak(settings.enableWeekendBreak ?? false);
            setWeekendBreakStart(settings.weekendBreakStart || '17:00');
            setWeekendBreakEnd(settings.weekendBreakEnd || '18:00');

            setWeekdayIn2(settings.weekdayCheckIn2 || '09:00');
            setWeekdayOut2(settings.weekdayCheckOut2 || '18:00');
            setWeekendIn2(settings.weekendCheckIn2 || '09:00');
            setWeekendOut2(settings.weekendCheckOut2 || '18:00');

            setEnableWeekdayBreak2(settings.enableWeekdayBreak2 ?? false);
            setWeekdayBreakStart2(settings.weekdayBreakStart2 || '12:00');
            setWeekdayBreakEnd2(settings.weekdayBreakEnd2 || '13:00');
            setEnableWeekendBreak2(settings.enableWeekendBreak2 ?? false);
            setWeekendBreakStart2(settings.weekendBreakStart2 || '12:00');
            setWeekendBreakEnd2(settings.weekendBreakEnd2 || '13:00');

            setEnableLateCheck(settings.enableLateCheck ?? true);
            setEnableEarlyCheck(settings.enableEarlyCheck ?? true);
            setEnableLateEarlyCheck(settings.enableLateEarlyCheck ?? true);

            setHasSpecial(settings.hasSpecialPeriod);
            setSpecialStart(settings.specialStartDate || '');
            setSpecialEnd(settings.specialEndDate || '');
            setSpecialIn(settings.specialCheckIn || '15:00');
            setSpecialOut(settings.specialCheckOut || '02:00');
            setGrace(settings.graceMinutes);
            setEnablePenalty(settings.enablePenaltyRules ?? true);
            setTiers(settings.penaltyTiers ?? [
                { id: "tier_1", lateMinutes: 15, deductionType: 'AMOUNT', deductionAmount: 5 },
                { id: "tier_2", lateMinutes: 30, deductionType: 'AMOUNT', deductionAmount: 15 },
                { id: "tier_3", lateMinutes: 60, deductionType: 'HALF_DAY', deductionAmount: 0 }
            ]);
            setSuccess(false);
        }
    }, [isOpen, settings]);

    const handleAddTier = () => {
        const newId = `tier_${Date.now()}`;
        setTiers([...tiers, { id: newId, lateMinutes: 45, deductionType: 'AMOUNT', deductionAmount: 10 }]);
    };

    const handleRemoveTier = (id: string) => {
        setTiers(tiers.filter(t => t.id !== id));
    };

    const handleTierChange = (id: string, field: keyof PenaltyTier, value: any) => {
        setTiers(tiers.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    if (!isOpen) return null;

    const handleSaveClick = async () => {
        // Validate
        if (hasSpecial) {
            if (!specialStart || !specialEnd) {
                alert('请填写完整的特定日期范围开始和结束日期');
                return;
            }
            if (specialStart > specialEnd) {
                alert('结束日期不能早于开始日期');
                return;
            }
        }

        setSaving(true);
        try {
            const updated: AttendanceShiftSettings = {
                weekdayCheckIn: weekdayIn,
                weekdayCheckOut: weekdayOut,
                weekendCheckIn: weekendIn,
                weekendCheckOut: weekendOut,
                
                enableWeekdayBreak,
                weekdayBreakStart,
                weekdayBreakEnd,
                enableWeekendBreak,
                weekendBreakStart,
                weekendBreakEnd,

                weekdayCheckIn2: weekdayIn2,
                weekdayCheckOut2: weekdayOut2,
                weekendCheckIn2: weekendIn2,
                weekendCheckOut2: weekendOut2,

                enableWeekdayBreak2,
                weekdayBreakStart2,
                weekdayBreakEnd2,
                enableWeekendBreak2,
                weekendBreakStart2,
                weekendBreakEnd2,

                enableLateCheck,
                enableEarlyCheck,
                enableLateEarlyCheck,

                hasSpecialPeriod: hasSpecial,
                specialStartDate: hasSpecial ? specialStart : '',
                specialEndDate: hasSpecial ? specialEnd : '',
                specialCheckIn: hasSpecial ? specialIn : '',
                specialCheckOut: hasSpecial ? specialOut : '',
                graceMinutes: Number(grace),
                enablePenaltyRules: enablePenalty,
                penaltyTiers: tiers
            };

            await DataManager.saveAttendanceSettings(updated);
            onSave(updated);
            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 1000);
        } catch (error) {
            console.error('Save settings failed:', error);
            alert('保存设置失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl flex flex-col border-t-8 border-[#FFD200] overflow-hidden max-h-[90vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-yellow-50 text-yellow-600 rounded-xl">
                            <Clock size={24}/>
                        </div>
                        <div>
                            <h3 className="font-black text-xl text-[#111111]">考勤排班与规则设置</h3>
                            <p className="text-xs text-gray-400 font-bold mt-0.5">Configure shifts, special dates, and grace thresholds</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                        <X size={20}/>
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-grow overflow-y-auto p-6 space-y-6">
                    
                    {/* Standard Weekday/Weekend Shifts */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                            <h4 className="font-black text-sm text-[#111111] flex items-center gap-2 uppercase tracking-wider">
                                <span>🕒 基础周排班时间 (Weekly Shift)</span>
                            </h4>
                            {/* Shift tabs */}
                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setActiveShiftTab('SHIFT_1')}
                                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${activeShiftTab === 'SHIFT_1' ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    班次 1 (默认)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveShiftTab('SHIFT_2')}
                                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${activeShiftTab === 'SHIFT_2' ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    班次 2 (人群)
                                </button>
                            </div>
                        </div>

                        {activeShiftTab === 'SHIFT_1' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                                {/* Weekdays Shift 1 */}
                                <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-4">
                                    <span className="text-xs font-black text-gray-500 block">工作日班次 (周一至周五)</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应上班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekdayIn} 
                                                onChange={e => setWeekdayIn(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应下班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekdayOut} 
                                                onChange={e => setWeekdayOut(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Weekday Break Shift */}
                                    <div className="pt-2 border-t border-dashed border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-gray-400">☕ 启用中途休息时间</span>
                                            <input 
                                                type="checkbox"
                                                checked={enableWeekdayBreak}
                                                onChange={e => setEnableWeekdayBreak(e.target.checked)}
                                                className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                            />
                                        </div>
                                        {enableWeekdayBreak && (
                                            <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-1 duration-150">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">休息/离岗时间</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekdayBreakStart} 
                                                        onChange={e => setWeekdayBreakStart(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">回岗/重新上班</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekdayBreakEnd} 
                                                        onChange={e => setWeekdayBreakEnd(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Weekends Shift 1 */}
                                <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-4">
                                    <span className="text-xs font-black text-red-500 block">休息日班次 (周六至周日)</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应上班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekendIn} 
                                                onChange={e => setWeekendIn(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应下班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekendOut} 
                                                onChange={e => setWeekendOut(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Weekend Break Shift */}
                                    <div className="pt-2 border-t border-dashed border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-gray-400">☕ 启用中途休息时间</span>
                                            <input 
                                                type="checkbox"
                                                checked={enableWeekendBreak}
                                                onChange={e => setEnableWeekendBreak(e.target.checked)}
                                                className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                            />
                                        </div>
                                        {enableWeekendBreak && (
                                            <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-1 duration-150">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">休息/离岗时间</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekendBreakStart} 
                                                        onChange={e => setWeekendBreakStart(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">回岗/重新上班</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekendBreakEnd} 
                                                        onChange={e => setWeekendBreakEnd(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                                {/* Weekdays Shift 2 */}
                                <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-4">
                                    <span className="text-xs font-black text-gray-500 block">工作日班次 2 (周一至周五)</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应上班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekdayIn2} 
                                                onChange={e => setWeekdayIn2(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应下班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekdayOut2} 
                                                onChange={e => setWeekdayOut2(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Weekday Break Shift 2 */}
                                    <div className="pt-2 border-t border-dashed border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-gray-400">☕ 启用中途休息时间</span>
                                            <input 
                                                type="checkbox"
                                                checked={enableWeekdayBreak2}
                                                onChange={e => setEnableWeekdayBreak2(e.target.checked)}
                                                className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                            />
                                        </div>
                                        {enableWeekdayBreak2 && (
                                            <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-1 duration-150">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">休息/离岗时间</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekdayBreakStart2} 
                                                        onChange={e => setWeekdayBreakStart2(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">回岗/重新上班</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekdayBreakEnd2} 
                                                        onChange={e => setWeekdayBreakEnd2(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Weekends Shift 2 */}
                                <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-4">
                                    <span className="text-xs font-black text-red-500 block">休息日班次 2 (周六至周日)</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应上班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekendIn2} 
                                                onChange={e => setWeekendIn2(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">应下班时间</label>
                                            <input 
                                                type="time" 
                                                value={weekendOut2} 
                                                onChange={e => setWeekendOut2(e.target.value)} 
                                                className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Weekend Break Shift 2 */}
                                    <div className="pt-2 border-t border-dashed border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-gray-400">☕ 启用中途休息时间</span>
                                            <input 
                                                type="checkbox"
                                                checked={enableWeekendBreak2}
                                                onChange={e => setEnableWeekendBreak2(e.target.checked)}
                                                className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                            />
                                        </div>
                                        {enableWeekendBreak2 && (
                                            <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-1 duration-150">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">休息/离岗时间</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekendBreakStart2} 
                                                        onChange={e => setWeekendBreakStart2(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">回岗/重新上班</label>
                                                    <input 
                                                        type="time" 
                                                        value={weekendBreakEnd2} 
                                                        onChange={e => setWeekendBreakEnd2(e.target.value)} 
                                                        className="w-full bg-white p-2 rounded-lg border border-gray-200 text-xs font-black outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Specific Date-Range Shift Settings */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                            <h4 className="font-black text-sm text-[#111111] flex items-center gap-2 uppercase tracking-wider">
                                <span>📅 特定日期时间规则 (Date Range Override)</span>
                            </h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={hasSpecial} 
                                    onChange={e => setHasSpecial(e.target.checked)} 
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FFD200]"></div>
                            </label>
                        </div>

                        {hasSpecial ? (
                            <div className="bg-yellow-50/40 p-4 rounded-2xl border border-yellow-100 space-y-4 animate-in fade-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 block mb-1">特定日期：开始</label>
                                        <input 
                                            type="date" 
                                            value={specialStart} 
                                            onChange={e => setSpecialStart(e.target.value)} 
                                            className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-xs md:text-sm font-black focus:border-[#FFD200] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 block mb-1">特定日期：结束</label>
                                        <input 
                                            type="date" 
                                            value={specialEnd} 
                                            onChange={e => setSpecialEnd(e.target.value)} 
                                            className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-xs md:text-sm font-black focus:border-[#FFD200] outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 block mb-1">特定日期：上班时间</label>
                                        <input 
                                            type="time" 
                                            value={specialIn} 
                                            onChange={e => setSpecialIn(e.target.value)} 
                                            className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 block mb-1">特定日期：下班时间</label>
                                        <input 
                                            type="time" 
                                            value={specialOut} 
                                            onChange={e => setSpecialOut(e.target.value)} 
                                            className="w-full bg-white p-2.5 rounded-xl border border-gray-200 text-sm font-black focus:border-[#FFD200] outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">特定日期 override 未启用。启用后可设定某一个特定日期范围内（比如大型节日、特定促销周）的应上班、下班时间。</p>
                        )}
                    </div>

                    {/* Grace threshold settings */}
                    <div className="space-y-4">
                        <h4 className="font-black text-sm text-[#111111] flex items-center gap-2 pb-1.5 border-b border-gray-100 uppercase tracking-wider">
                            <span>⏱️ 考勤宽限与迟到判定 (Grace Period)</span>
                        </h4>
                        
                        <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <span className="text-xs font-black text-gray-600 block">考勤迟到/早退宽限额度 (分钟)</span>
                                    <p className="text-[11px] text-gray-400 mt-0.5">少于或等于此额度，考勤状态仍判定为 “正常 (Completed)”</p>
                                </div>
                                <div className="w-24 flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-inner shrink-0">
                                    <input 
                                        type="number" 
                                        min="0"
                                        max="60"
                                        value={grace} 
                                        onChange={e => setGrace(Number(e.target.value))} 
                                        className="w-full text-center font-black text-sm outline-none bg-transparent"
                                    />
                                    <span className="text-xs font-bold text-gray-400 shrink-0">分</span>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-dashed border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Late Check Switch */}
                                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-gray-700">迟到开关</span>
                                        <span className="text-[9px] text-gray-400 font-bold">启用后计算迟到</span>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={enableLateCheck}
                                        onChange={e => setEnableLateCheck(e.target.checked)}
                                        className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                    />
                                </div>

                                {/* Early Out Check Switch */}
                                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-gray-700">早退开关</span>
                                        <span className="text-[9px] text-gray-400 font-bold">启用后计算早退</span>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={enableEarlyCheck}
                                        onChange={e => setEnableEarlyCheck(e.target.checked)}
                                        className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                    />
                                </div>

                                {/* Late & Early Out Check Switch */}
                                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-gray-700">迟到早退并存</span>
                                        <span className="text-[9px] text-gray-400 font-bold">总计迟到和早退</span>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={enableLateEarlyCheck}
                                        onChange={e => setEnableLateEarlyCheck(e.target.checked)}
                                        className="rounded text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Late Penalty Rules */}
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                            <h4 className="font-black text-sm text-[#111111] flex items-center gap-2 uppercase tracking-wider">
                                <span>🪙 迟到扣薪规则 (Late Penalty Rules)</span>
                            </h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={enablePenalty} 
                                    onChange={e => setEnablePenalty(e.target.checked)} 
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FFD200]"></div>
                            </label>
                        </div>

                        {enablePenalty ? (
                            <div className="space-y-3">
                                {tiers.map((tier, index) => (
                                    <div key={tier.id} className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs font-black text-gray-700">阶梯 {index + 1}：</span>
                                            <span className="text-xs text-gray-500 font-bold">迟到超过</span>
                                            <div className="w-20 flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-gray-200 shadow-inner">
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    value={tier.lateMinutes}
                                                    onChange={e => handleTierChange(tier.id, 'lateMinutes', Number(e.target.value))}
                                                    className="w-full text-center font-black text-xs outline-none bg-transparent"
                                                />
                                                <span className="text-[10px] font-bold text-gray-400 shrink-0">分钟</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3">
                                            <select
                                                value={tier.deductionType}
                                                onChange={e => handleTierChange(tier.id, 'deductionType', e.target.value)}
                                                className="bg-white px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-black outline-none focus:border-[#FFD200]"
                                            >
                                                <option value="AMOUNT">每次扣除固定金额 (RM)</option>
                                                <option value="HALF_DAY">扣除半天薪资 / Half-Day Absent</option>
                                                <option value="FULL_DAY">扣除一天薪资 / Full-Day Absent</option>
                                            </select>

                                            {tier.deductionType === 'AMOUNT' && (
                                                <div className="w-28 flex items-center gap-1 bg-white px-2 py-1.5 rounded-xl border border-gray-200 shadow-inner">
                                                    <span className="text-xs font-black text-gray-400">RM</span>
                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={tier.deductionAmount}
                                                        onChange={e => handleTierChange(tier.id, 'deductionAmount', Number(e.target.value))}
                                                        className="w-full text-center font-black text-xs outline-none bg-transparent"
                                                    />
                                                </div>
                                            )}

                                            <button 
                                                onClick={() => handleRemoveTier(tier.id)}
                                                className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-colors shrink-0"
                                                title="删除阶梯"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={handleAddTier}
                                    className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#FFD200] hover:bg-yellow-50/10 text-gray-500 hover:text-yellow-600 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} />
                                    <span>添加扣款阶梯 (Add Penalty Tier)</span>
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">迟到扣薪规则未启用。启用后可根据迟到分钟数执行阶梯式薪资扣减惩罚。</p>
                        )}
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
                    <button 
                        onClick={onClose} 
                        disabled={saving}
                        className="px-5 py-3 rounded-xl font-bold text-gray-500 text-sm hover:bg-gray-200 transition-colors"
                    >
                        关闭
                    </button>
                    <button 
                        onClick={handleSaveClick} 
                        disabled={saving || success}
                        className="px-6 py-3 bg-[#111111] text-[#FFD200] rounded-xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 text-sm min-w-[120px] justify-center disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <Loader2 size={16} className="animate-spin text-[#FFD200]"/>
                                <span>保存中...</span>
                            </>
                        ) : success ? (
                            <>
                                <Check size={16} className="text-[#FFD200]"/>
                                <span>已保存</span>
                            </>
                        ) : (
                            <span>保存设置</span>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
};
