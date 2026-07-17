import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, X, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Employee, AppModule } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { DepartmentMigrationBanner } from './hr/DepartmentMigrationBanner';

// Import our modular sub-components
import { RosterHeader } from './roster/RosterHeader';
import { RosterMonthView } from './roster/RosterMonthView';
import { RosterWeekView } from './roster/RosterWeekView';
import { RosterDailyCoverage } from './roster/RosterDailyCoverage';
import { RosterEmployeeView } from './roster/RosterEmployeeView';
import { RosterMobileView } from './roster/RosterMobileView';
import { RosterStatusPicker } from './roster/RosterStatusPicker';
import { RosterNoteEditor } from './roster/RosterNoteEditor';
import { RosterAnomalyPanel } from './roster/RosterAnomalyPanel';
import { RosterPublishDialog } from './roster/RosterPublishDialog';
import { RosterResetDialog } from './roster/RosterResetDialog';
import { RosterExportModal, ExportOptions } from './roster/RosterExportModal';

// Import our utilities
import { 
    getDaysInMonth, 
    runRosterCheck, 
    getEmployeeDept
} from './roster/rosterUtils';
import { DEFAULT_MALAYSIAN_HOLIDAYS } from './roster/rosterConstants';
import { exportRosterToExcel } from './roster/rosterExcelExport';
import { exportRosterToPdf } from './roster/rosterPdfExport';

interface RosterModuleProps {
    onClose?: () => void;
    allowedModules?: AppModule[];
}

export const RosterModule: React.FC<RosterModuleProps> = ({ onClose, allowedModules }) => {
    // --- Basic States ---
    const [monthKey, setMonthKey] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [roster, setRoster] = useState<Record<string, Record<string, string>>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    
    // Cloud states loaded from database
    const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
    const [revision, setRevision] = useState<number>(0);
    const [publishedAt, setPublishedAt] = useState<string | null>(null);
    const [publishedBy, setPublishedBy] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [lastSavedBy, setLastSavedBy] = useState<string | null>(null);
    
    // Status Trackers
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [isModified, setIsModified] = useState<boolean>(false);
    
    // Responsive view mode
    const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
    const [currentView, setCurrentView] = useState<'MONTH' | 'WEEK' | 'DAILY' | 'PERSONAL'>(
        window.innerWidth < 768 ? 'WEEK' : 'MONTH'
    );
    const [deptFilter, setDeptFilter] = useState<string>('ALL');

    // Configuration states (loaded from config/roster in Firestore)
    const [minCoverage, setMinCoverage] = useState<Record<string, number>>({
        KITCHEN: 3,
        FLOOR: 2,
        BAR: 1,
        DISHWASH: 1
    });
    const [shiftTimes, setShiftTimes] = useState<Record<string, string>>({
        MORNING: '10:00-18:00',
        AFTERNOON: '14:00-22:00',
        NIGHT: '17:00-01:00'
    });
    const [isMultiShiftMode, setIsMultiShiftMode] = useState<boolean>(false);

    // Modal Overlays
    const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
    const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
    const [pickerTarget, setPickerTarget] = useState<{ date: string; employeeId: string } | null>(null);

    const [isNoteOpen, setIsNoteOpen] = useState<boolean>(false);
    const [noteTarget, setNoteTarget] = useState<{ date: string; employeeId: string } | null>(null);

    const [isPublishOpen, setIsPublishOpen] = useState<boolean>(false);
    const [isResetOpen, setIsResetOpen] = useState<boolean>(false);
    const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

    // Monitor resize
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile && currentView === 'MONTH') {
                setCurrentView('WEEK'); // default mobile to Week View for optimal HIG
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [currentView]);

    // Load configurations and employee list on mount
    const loadInitialMeta = useCallback(async () => {
        try {
            const [emps, config] = await Promise.all([
                DataManager.getEmployees(),
                DataManager.getRosterConfig()
            ]);
            // Remove owner roles from operational list
            setEmployees(emps.filter(e => !e.role.includes('Owner')));

            if (config) {
                if (config.minCoverage) setMinCoverage(config.minCoverage);
                if (config.shiftTimes) setShiftTimes(config.shiftTimes);
            } else {
                // Provision default config if empty in Firestore
                await DataManager.saveRosterConfig({
                    minCoverage: { KITCHEN: 3, FLOOR: 2, BAR: 1, DISHWASH: 1 },
                    shiftTimes: { MORNING: '10:00-18:00', AFTERNOON: '14:00-22:00', NIGHT: '17:00-01:00' }
                });
            }
        } catch (err) {
            console.error('[RosterModule] Load initial meta failed:', err);
        }
    }, []);

    // Load active month's roster data
    const loadRosterForMonth = useCallback(async (targetMonth: string) => {
        setLoading(true);
        setIsModified(false);
        try {
            const data = await DataManager.getRosterData(targetMonth);
            setRoster(data.roster || {});
            setNotes(data.notes || {});
            setStatus(data.status || 'DRAFT');
            setRevision(data.revision || 0);
            setPublishedAt(data.publishedAt || null);
            setPublishedBy(data.publishedBy || null);
            setLastSavedAt(data.lastSavedAt || null);
            setLastSavedBy(data.lastSavedBy || null);
            setIsMultiShiftMode(data.shiftMode === 'MULTI');
        } catch (err) {
            console.error('[RosterModule] Load roster failed:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInitialMeta();
    }, [loadInitialMeta]);

    useEffect(() => {
        loadRosterForMonth(monthKey);
    }, [monthKey, loadRosterForMonth]);

    // Warn managers of unsaved adjustments on exit
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isModified) {
                e.preventDefault();
                e.returnValue = '您有未保存的排班更改，确定要离开吗？';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isModified]);

    // --- Actions ---

    // Save configurations
    const handleSaveConfig = async (newMin: Record<string, number>, newTimes: Record<string, string>) => {
        try {
            await DataManager.saveRosterConfig({
                minCoverage: newMin,
                shiftTimes: newTimes
            });
            setMinCoverage(newMin);
            setShiftTimes(newTimes);
        } catch (err) {
            console.error('[RosterModule] Save roster config failed:', err);
            throw err;
        }
    };

    // Toggle multi-shift mode
    const handleToggleShiftMode = () => {
        setIsMultiShiftMode(!isMultiShiftMode);
        setIsModified(true);
    };

    // On-the-fly grid cell update
    const handleUpdateCell = (date: string, empId: string, newStatus: string) => {
        setRoster(prev => ({
            ...prev,
            [date]: {
                ...(prev[date] || {}),
                [empId]: newStatus
            }
        }));
        setIsModified(true);
    };

    // Auto Fill Work
    const handleAutoFillWork = async () => {
        if (!await (window as any).systemDialog.confirm("确定要将本月所有【未排班】的格子一键填充为【常规班 (W)】吗？\n(Auto-fill all unassigned cells to 'WORK')", "排班管理")) {
            return;
        }

        const days = getDaysInMonth(monthKey);
        const activeEmployees = employees.filter(e => e.status !== 'TERMINATED');

        setRoster(prev => {
            const next = { ...prev };
            days.forEach(d => {
                const dateStr = d;
                if (!next[dateStr]) next[dateStr] = {};
                
                activeEmployees.forEach(emp => {
                    const currentStatus = next[dateStr][emp.id] || 'UNASSIGNED';
                    if (currentStatus === 'UNASSIGNED') {
                        next[dateStr][emp.id] = 'WORK';
                    }
                });
            });
            return next;
        });
        setIsModified(true);
    };

    // Note saving from inline popup or bottom sheet
    const handleSaveNote = (date: string, empId: string, noteText: string) => {
        const key = `${date}_${empId}`;
        setNotes(prev => {
            const next = { ...prev };
            if (!noteText.trim()) {
                delete next[key];
            } else {
                next[key] = noteText.trim();
            }
            return next;
        });
        setIsModified(true);
    };

    // Save Draft
    const handleSaveDraft = async () => {
        setSaving(true);
        try {
            const result = await DataManager.saveRosterData(
                roster,
                notes,
                monthKey,
                {
                    status: 'DRAFT',
                    shiftMode: isMultiShiftMode ? 'MULTI' : 'SINGLE',
                    lastSavedBy: 'MANAGEMENT_DRAFT'
                },
                revision
            );
            setRevision(result.revision);
            setStatus(result.status);
            setLastSavedAt(result.lastSavedAt);
            setLastSavedBy(result.lastSavedBy);
            setIsModified(false);
            await (window as any).systemDialog.alert('✅ 草稿已安全保存至云端 (Draft Saved)', "排班管理");
        } catch (err: any) {
            if (err.message === 'CONCURRENCY_CONFLICT') {
                await (window as any).systemDialog.alert('⚠️ 保存冲突：有其他管理员修改了此排班表。请点击刷新按钮合并最新数据。', "排班管理");
            } else {
                await (window as any).systemDialog.alert('❌ 保存失败，请检查网络后重试。', "排班管理");
            }
        } finally {
            setSaving(false);
        }
    };

    // Complete official Publish
    const handleConfirmPublish = async (publisherName: string) => {
        setSaving(true);
        try {
            const nowStr = new Date().toISOString();
            const result = await DataManager.saveRosterData(
                roster,
                notes,
                monthKey,
                {
                    status: 'PUBLISHED',
                    publishedAt: nowStr,
                    publishedBy: publisherName,
                    lastSavedBy: publisherName,
                    shiftMode: isMultiShiftMode ? 'MULTI' : 'SINGLE'
                },
                revision
            );
            setRevision(result.revision);
            setStatus(result.status);
            setPublishedAt(result.publishedAt);
            setPublishedBy(result.publishedBy);
            setLastSavedAt(result.lastSavedAt);
            setLastSavedBy(result.lastSavedBy);
            setIsModified(false);

            // Insert system Audit Log
            try {
                const now = new Date();
                await DataManager.addLog({
                    id: `log_${Date.now()}`,
                    date: now.toISOString().split('T')[0],
                    time: now.toTimeString().split(' ')[0].substring(0, 5),
                    issue: `管理员 [${publisherName}] 发布了 ${monthKey} 正式排班表 (修订版本: ${result.revision})`,
                    action: `系统已同步该排班版本，可供考勤打卡模块与员工端面板读取。`,
                    category: 'OTHER',
                    priority: 'NORMAL',
                    status: 'RESOLVED',
                    creatorName: publisherName
                });
            } catch (le) {
                console.warn('[RosterModule] Audit log silent failure:', le);
            }

            await (window as any).systemDialog.alert(`🎉 ${monthKey} 正式排班表已发布成功！所有考勤打卡模块与员工端已完成同步。`, "排班管理");
        } catch (err: any) {
            if (err.message === 'CONCURRENCY_CONFLICT') {
                await (window as any).systemDialog.alert('⚠️ 发布冲突：检测到云端有更新的排班修订。请点击刷新以拉取最新数据。', "排班管理");
            } else {
                await (window as any).systemDialog.alert('❌ 发布失败，请检查网络后重试。', "排班管理");
            }
        } finally {
            setSaving(false);
        }
    };

    // Secure database-authenticated Reset
    const handleConfirmReset = async (authorizedBy: string) => {
        setSaving(true);
        try {
            // Cold Cloud Backup: write copy under backup key
            const now = Date.now();
            const backupDoc = {
                monthKey: `${monthKey}_backup_${now}`,
                roster,
                notes,
                backedUpAt: new Date().toISOString(),
                backedUpBy: authorizedBy,
                originalRevision: revision
            };
            // Save to backing sub-document
            await DataManager.saveRosterData(roster, notes, `${monthKey}_bk_${now}`, {
                status: 'DRAFT',
                lastSavedBy: `BACKUP_${authorizedBy}`
            });

            // Erase grids
            setRoster({});
            setNotes({});
            setIsModified(true);

            await (window as any).systemDialog.alert(`⚠️ 排班表已被 [${authorizedBy}] 清空。已为您在云端创建冷备份 [备份ID: ${now}]。请编辑后点击保存或发布。`, "排班管理");
        } catch (err) {
            console.error('[RosterModule] Reset failed:', err);
            await (window as any).systemDialog.alert('❌ 重置操作失败，请检查网络重试。', "排班管理");
        } finally {
            setSaving(false);
        }
    };

    // Excel Export Trigger
    const handleExportExcel = async (opts: ExportOptions) => {
        const days = getDaysInMonth(monthKey);
        try {
            await exportRosterToExcel(monthKey, employees, days, roster, notes, opts);
        } catch (e) {
            console.error('[RosterModule] Excel export failed:', e);
            await (window as any).systemDialog.alert('❌ 导出 Excel 失败，请检查数据完整性', "排班管理");
        }
    };

    // PDF Export Trigger
    const handleExportPdf = async (opts: ExportOptions) => {
        const days = getDaysInMonth(monthKey);
        try {
            await exportRosterToPdf(monthKey, employees, days, roster, notes, opts);
        } catch (e) {
            console.error('[RosterModule] PDF export failed:', e);
            await (window as any).systemDialog.alert('❌ 导出 PDF 失败，请重试', "排班管理");
        }
    };

    // --- Inline Picker Coordinates Controller ---
    const handleOpenPicker = (date: string, empId: string, rect: DOMRect) => {
        setPickerTarget({ date, employeeId: empId });
        setPickerRect(rect);
        setIsPickerOpen(true);
    };

    const handleSelectPickerStatus = (statusKey: string) => {
        if (!pickerTarget) return;
        handleUpdateCell(pickerTarget.date, pickerTarget.employeeId, statusKey);
        setIsPickerOpen(false);
    };

    // --- Note Editor Controller ---
    const handleOpenNote = (date: string, empId: string) => {
        setNoteTarget({ date, employeeId: empId });
        setIsNoteOpen(true);
    };

    // --- Filter logic ---
    const filteredEmployees = useMemo(() => {
        if (deptFilter === 'ALL') return employees;
        return employees.filter(emp => getEmployeeDept(emp) === deptFilter);
    }, [employees, deptFilter]);

    // --- Anomaly Detection Audit ---
    const daysList = useMemo(() => getDaysInMonth(monthKey), [monthKey]);
    const anomalies = useMemo(() => {
        return runRosterCheck(filteredEmployees, daysList, roster, minCoverage);
    }, [filteredEmployees, daysList, roster, minCoverage]);

    const handleCloseModule = async () => {
        if (isModified) {
            const leave = await (window as any).systemDialog.confirm('⚠️ 有未保存的排班修改！\n\n确定放弃修改并关闭吗？', '排班管理');
            if (!leave) return;
        }
        onClose?.();
    };

    return (
        <div className="fixed inset-0 bg-gray-950/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#F6F7FB] w-full h-full md:max-w-[98vw] md:h-[95vh] md:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative">
                {/* Header Section (Desktop Only) */}
                <div className="hidden md:flex shrink-0 bg-gray-900 px-6 py-4 items-center justify-between border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD200] text-[#111111] p-2.5 rounded-xl shadow-md">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-base">排班管理中心 (Roster Desk)</h2>
                            <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">
                                Kim Lian Kee Kepong · Management Console
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => loadRosterForMonth(monthKey)}
                            className="p-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-colors"
                            title="刷新数据"
                            id="global-refresh-btn"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={handleCloseModule}
                            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full transition-colors"
                            id="global-close-btn"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Sub-header controls (Desktop Only) */}
                <div className="hidden md:block">
                    <RosterHeader
                        monthKey={monthKey}
                        onChangeMonth={setMonthKey}
                        currentView={currentView}
                        onChangeView={setCurrentView}
                        deptFilter={deptFilter}
                        onChangeDeptFilter={setDeptFilter}
                        status={status}
                        isModified={isModified}
                        onSaveDraft={handleSaveDraft}
                        onPublishClick={() => setIsPublishOpen(true)}
                        onResetClick={() => setIsResetOpen(true)}
                        onExportClick={() => setIsExportOpen(true)}
                        isMultiShiftMode={isMultiShiftMode}
                        onToggleShiftMode={handleToggleShiftMode}
                        onAutoFillWork={handleAutoFillWork}
                        saving={saving}
                        lastSavedAt={lastSavedAt}
                        lastSavedBy={lastSavedBy}
                    />
                </div>

                {/* Main Content Scrollable Area */}
                <div className="flex-grow flex flex-col min-h-0 relative">
                    {!loading && (
                        <div className="hidden md:block">
                            <DepartmentMigrationBanner
                                employees={employees}
                                onMigrationComplete={loadInitialMeta}
                            />
                        </div>
                    )}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40 space-y-3">
                            <Loader2 className="animate-spin text-gray-400" size={36} />
                            <p className="text-xs text-gray-400 font-semibold">正在同步云端排班计划 (Syncing data)...</p>
                        </div>
                    ) : isMobile ? (
                        /* Mobile View Container */
                        <RosterMobileView
                            employees={employees}
                            monthKey={monthKey}
                            roster={roster}
                            notes={notes}
                            onChangeCell={handleUpdateCell}
                            onSaveNote={handleSaveNote}
                            customHolidays={DEFAULT_MALAYSIAN_HOLIDAYS}
                            readOnly={false}
                            currentView={currentView}
                            onChangeView={setCurrentView}
                            deptFilter={deptFilter}
                            onChangeDeptFilter={setDeptFilter}
                            onChangeMonth={setMonthKey}
                            onRefresh={() => loadRosterForMonth(monthKey)}
                            onClose={handleCloseModule}
                            status={status}
                            isModified={isModified}
                            onSaveDraft={handleSaveDraft}
                            onPublishClick={() => setIsPublishOpen(true)}
                            onResetClick={() => setIsResetOpen(true)}
                            onExportClick={() => setIsExportOpen(true)}
                            onToggleShiftMode={handleToggleShiftMode}
                            isMultiShiftMode={isMultiShiftMode}
                            onAutoFillWork={handleAutoFillWork}
                            saving={saving}
                            lastSavedAt={lastSavedAt}
                            lastSavedBy={lastSavedBy}
                        />
                    ) : (
                        /* Desktop Views Layout */
                        <div className="hidden md:block flex-grow overflow-y-auto p-4 md:p-6 space-y-6">
                            <div className="space-y-6">
                            {/* Selected Roster View Grid */}
                            {currentView === 'MONTH' && (
                                <RosterMonthView
                                    employees={filteredEmployees}
                                    days={daysList}
                                    roster={roster}
                                    notes={notes}
                                    onChangeCell={handleUpdateCell}
                                    onOpenPicker={handleOpenPicker}
                                    onOpenNote={handleOpenNote}
                                    customHolidays={DEFAULT_MALAYSIAN_HOLIDAYS}
                                    minCoverage={minCoverage}
                                    readOnly={false}
                                />
                            )}

                            {currentView === 'WEEK' && (
                                <RosterWeekView
                                    employees={filteredEmployees}
                                    monthKey={monthKey}
                                    roster={roster}
                                    notes={notes}
                                    onChangeCell={handleUpdateCell}
                                    onOpenPicker={handleOpenPicker}
                                    onOpenNote={handleOpenNote}
                                    customHolidays={DEFAULT_MALAYSIAN_HOLIDAYS}
                                    minCoverage={minCoverage}
                                    readOnly={false}
                                />
                            )}

                            {currentView === 'DAILY' && (
                                <RosterDailyCoverage
                                    employees={employees}
                                    monthKey={monthKey}
                                    roster={roster}
                                    minCoverage={minCoverage}
                                    shiftTimes={shiftTimes}
                                    onSaveConfig={handleSaveConfig}
                                />
                            )}

                            {currentView === 'PERSONAL' && (
                                <RosterEmployeeView
                                    employees={filteredEmployees}
                                    monthKey={monthKey}
                                    roster={roster}
                                    notes={notes}
                                    customHolidays={DEFAULT_MALAYSIAN_HOLIDAYS}
                                />
                            )}

                            {/* Verification & Warnings Dashboard (Disabled per user request) */}
                        </div>
                    </div>
                )}
            </div>
        </div>

            {/* --- Modals and Overlays --- */}

            {/* 1. Desktop Context Status Picker Popover */}
            {isPickerOpen && pickerRect && pickerTarget && (
                <div 
                    className="fixed inset-0 z-[150] bg-transparent"
                    onClick={() => setIsPickerOpen(false)}
                >
                    <div 
                        className="absolute shadow-2xl rounded-xl z-[160]"
                        style={{
                            top: `${pickerRect.bottom + window.scrollY}px`,
                            left: `${Math.min(window.innerWidth - 300, Math.max(16, pickerRect.left + window.scrollX))}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <RosterStatusPicker
                            currentStatus={roster[pickerTarget.date]?.[pickerTarget.employeeId] || 'UNASSIGNED'}
                            onSelect={handleSelectPickerStatus}
                            onClose={() => setIsPickerOpen(false)}
                            hasNote={!!notes[`${pickerTarget.date}_${pickerTarget.employeeId}`]}
                            onEditNote={() => {
                                setIsPickerOpen(false);
                                handleOpenNote(pickerTarget.date, pickerTarget.employeeId);
                            }}
                            employeeName={employees.find(e => e.id === pickerTarget.employeeId)?.name || ''}
                            date={pickerTarget.date}
                        />
                    </div>
                </div>
            )}

            {/* 2. Cell Note Editor Modal */}
            {isNoteOpen && noteTarget && (
                <RosterNoteEditor
                    isOpen={isNoteOpen}
                    onClose={() => setIsNoteOpen(false)}
                    onSave={(text) => handleSaveNote(noteTarget.date, noteTarget.employeeId, text)}
                    initialValue={notes[`${noteTarget.date}_${noteTarget.employeeId}`] || ''}
                    employeeName={employees.find(e => e.id === noteTarget.employeeId)?.name || ''}
                    date={noteTarget.date}
                />
            )}

            {/* 3. Pre-publish Validation Audit Confirmation Overlay */}
            {isPublishOpen && (
                <RosterPublishDialog
                    isOpen={isPublishOpen}
                    onClose={() => setIsPublishOpen(false)}
                    onPublish={handleConfirmPublish}
                    anomalies={anomalies}
                    monthKey={monthKey}
                />
            )}

            {/* 4. PIN-authenticated Cloud Backup and Reset dialog */}
            {isResetOpen && (
                <RosterResetDialog
                    isOpen={isResetOpen}
                    onClose={() => setIsResetOpen(false)}
                    onReset={handleConfirmReset}
                    employees={employees}
                />
            )}

            {/* 5. Export choices Modal */}
            {isExportOpen && (
                <RosterExportModal
                    isOpen={isExportOpen}
                    onClose={() => setIsExportOpen(false)}
                    onExportExcel={handleExportExcel}
                    onExportPdf={handleExportPdf}
                    monthKey={monthKey}
                />
            )}
        </div>
    );
};
