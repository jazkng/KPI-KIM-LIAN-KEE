// ============================================================================
// FACE3000-U 考勤审核导入 + 人工成本分析（Issue #8）
// ----------------------------------------------------------------------------
// 流程：选档 → 解析 Logs 原始打卡 → 以员工编号对应 ERP 员工 → 营业日配对（跨午夜）
//      → 列出异常（漏打卡、迟到、早退、加班、过长班次）→ 主管逐项或批量处理
//      → 全部处理完才能「确认审核」→ 人工成本、人工成本率、保本营业额
// 选档与预览只在浏览器内处理，不会写入任何资料；只有按下「确认审核」才储存，
// 而且只存入 V2 的 attendance_reviews，不写入、不覆盖、不删除 V1 的 attendance，不影响薪资。
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, Loader2, X } from 'lucide-react';
import type { Employee, PayrollRecord } from '../../../types';
import { DataManager, type AttendanceShiftSettings } from '../../../utils/dataManager';
import { loadXLSX } from '../../../utils/lazyLibs';
import { isCalendarMonth, parseFace3000Workbook, type Face3000Import, type SheetRows } from '../../../utils/attendance/face3000';
import {
    ALLOWED_ACTIONS,
    DEFAULT_REVIEW_OPTIONS,
    buildAttendanceRecords,
    buildReview,
    type ExceptionType,
    type Resolution,
    type ReviewEmployee,
    type ReviewException,
} from '../../../utils/attendance/shiftReview';
import { analyseLabour, buildLabourCosts } from '../../../utils/labour/labourCost';
import { aggregateMonth } from '../../../utils/monthlyPnLAggregator';

interface Props {
    employees: Employee[];
    shiftSettings: AttendanceShiftSettings;
    currentEmployee?: Employee | null;
    initialFile?: File | null;
    /** 已解析好的资料（例如由 PDF 转来），一样要经过审核 */
    initialData?: Face3000Import | null;
    /** 预先对应好的机器编号 → 员工 ID（PDF 以姓名对应的结果） */
    initialManualMatches?: Record<string, string>;
    onClose: () => void;
    onSaved?: () => void;
}

const TYPE_LABEL: Record<ExceptionType, string> = {
    MISSING_PUNCH: '漏打卡',
    LATE: '迟到',
    EARLY_LEAVE: '早退',
    OVERTIME: '加班',
    LONG_SHIFT: '班次过长',
};

const ACTION_LABEL: Record<Resolution['action'], string> = {
    ADD_TIME: '补上时间',
    MARK_ABSENT: '不算出勤',
    CONFIRM: '确认',
    EXCUSE: '豁免',
    APPROVE: '批准',
    REJECT: '不批准',
};

const hours = (min: number) => (min / 60).toFixed(1);

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isDone = (ex: ReviewException) =>
    !!ex.resolution && ALLOWED_ACTIONS[ex.type].includes(ex.resolution.action) && (ex.resolution.action !== 'EXCUSE' || !!ex.resolution.note?.trim());

export const FaceImportReview: React.FC<Props> = ({ employees, shiftSettings, currentEmployee, initialFile, initialData, initialManualMatches, onClose, onSaved }) => {
    const [data, setData] = useState<Face3000Import | null>(initialData || null);
    const [fileName, setFileName] = useState(initialData ? 'PDF 报表' : '');
    // 同一次审核重试时沿用同一个导入记录 ID
    const [batchId, setBatchId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
    const [manualMatches, setManualMatches] = useState<Record<string, string>>(initialManualMatches || {});
    const [cutoff, setCutoff] = useState(DEFAULT_REVIEW_OPTIONS.businessDayCutoff);
    const [otThreshold, setOtThreshold] = useState(DEFAULT_REVIEW_OPTIONS.otThresholdMinutes);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [onlyOpen, setOnlyOpen] = useState(true);
    const [tab, setTab] = useState<'REVIEW' | 'LABOUR'>('REVIEW');
    const [reviewerName, setReviewerName] = useState(currentEmployee?.name || '');
    const [savedCount, setSavedCount] = useState<number | null>(null);
    const [bulkNote, setBulkNote] = useState('');

    const readFile = async (file: File) => {
        setError(null);
        setBusy('解析中…');
        setData(null);
        setResolutions({});
        setManualMatches({});
        setSavedCount(null);
        try {
            const XLSX = await loadXLSX();
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const sheets: Record<string, SheetRows> = {};
            wb.SheetNames.forEach((n: string) => {
                sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }) as SheetRows;
            });
            setData(parseFace3000Workbook(sheets));
            setFileName(file.name);
        } catch (e) {
            setError((e as Error).message || '无法解析这个档案');
        } finally {
            setBusy(null);
        }
    };

    useEffect(() => {
        if (initialFile) readFile(initialFile);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFile]);

    const review = useMemo(
        () =>
            data
                ? buildReview(data, employees, { shiftSettings, businessDayCutoff: cutoff, otThresholdMinutes: otThreshold }, resolutions, manualMatches)
                : null,
        [data, employees, shiftSettings, cutoff, otThreshold, resolutions, manualMatches],
    );

    const resolve = (key: string, resolution: Resolution | null) =>
        setResolutions(prev => {
            const next = { ...prev };
            if (resolution) next[key] = resolution;
            else delete next[key];
            return next;
        });

    /** 批量处理：只处理尚未处理的同类异常；豁免必须填原因 */
    const bulkResolve = (type: ExceptionType, action: Resolution['action'], scope?: ReviewEmployee) => {
        if (!review) return;
        if (action === 'EXCUSE' && !bulkNote.trim()) {
            setError('批量豁免需要先在「批量原因」填写原因');
            return;
        }
        const targets = (scope ? [scope] : review.employees)
            .flatMap(e => e.days.flatMap(d => d.exceptions))
            .filter(ex => ex.type === type && !isDone(ex));
        setResolutions(prev => {
            const next = { ...prev };
            targets.forEach(ex => {
                next[ex.key] = action === 'EXCUSE' ? { action, note: bulkNote.trim() } : ({ action } as Resolution);
            });
            return next;
        });
        setError(null);
    };

    const openByType = useMemo(() => {
        const counts: Partial<Record<ExceptionType, number>> = {};
        review?.employees.forEach(e => e.days.forEach(d => d.exceptions.forEach(ex => {
            if (!isDone(ex)) counts[ex.type] = (counts[ex.type] || 0) + 1;
        })));
        return counts;
    }, [review]);

    const unmatchedPending = review ? review.unmatched.filter(u => manualMatches[u.deviceNo] === undefined).length : 0;
    const canSave = !!review && review.openExceptionCount === 0 && unmatchedPending === 0 && !!reviewerName.trim() && savedCount === null;

    const handleSave = async () => {
        if (!review || !data || !canSave) return;
        const records = (() => {
            try {
                return buildAttendanceRecords(review, {
                    batchId: '',
                    reviewedBy: reviewerName.trim(),
                    reviewedAt: new Date().toISOString(),
                });
            } catch (e) {
                setError((e as Error).message);
                return null;
            }
        })();
        if (!records) return;
        const ok = window.confirm(
            `确认 ${review.employees.length} 位员工、${records.length} 天的审核结果？\n\n` +
                `区间：${data.periodStart} ~ ${data.periodEnd}\n` +
                '审核结果只存入 V2（考勤审核记录），不会改动现有考勤、迟到扣款、薪资或加班费。',
        );
        if (!ok) return;
        setBusy('写入中…');
        try {
            const id = batchId || `face_${data.periodStart}_${Date.now()}`;
            setBatchId(id);
            const stamped = records.map(r => ({ ...r, importBatchId: id }));
            const decisions: Record<string, number> = {};
            review.employees.forEach(e => e.days.forEach(d => d.exceptions.forEach(ex => {
                const k = `${ex.type}:${ex.resolution?.action}`;
                decisions[k] = (decisions[k] || 0) + 1;
            })));
            await DataManager.saveAttendanceReview(stamped, {
                id,
                source: 'FACE3000_XLS',
                fileName,
                periodStart: data.periodStart,
                periodEnd: data.periodEnd,
                businessDayCutoff: cutoff,
                otThresholdMinutes: otThreshold,
                employeeCount: review.employees.length,
                skippedDeviceNos: review.unmatched.map(u => u.deviceNo),
                recordCount: stamped.length,
                decisions,
                reviewedBy: reviewerName.trim(),
                reviewedById: currentEmployee?.id || null,
                reviewedAt: new Date().toISOString(),
            });
            setSavedCount(stamped.length);
            onSaved?.();
        } catch (e) {
            setError(`储存失败：${(e as Error).message}。可以再按一次「确认审核」重试：同样的记录会覆盖，不会重复。`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[330] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4">
            <div className="flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-gray-900 shadow-2xl md:max-w-5xl md:rounded-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-4">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-black"><FileSpreadsheet size={20} /> FACE3000 考勤预览与审核</h3>
                        <p className="text-[11px] font-bold text-gray-500">
                            {data ? `${fileName} · ${data.periodStart} ~ ${data.periodEnd}` : '选择打卡机汇出的 .XLS 档（含 Summary、Logs）'}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-3 text-gray-500 hover:bg-gray-100" aria-label="关闭"><X size={20} /></button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    {!data && (
                        <label className="relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                            <input
                                type="file"
                                accept=".xls,.xlsx"
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}
                            />
                            <FileSpreadsheet size={32} className="text-emerald-600" />
                            <span className="text-sm font-black">点击选择 FACE3000-U 考勤档</span>
                            <span className="text-[11px] font-bold text-gray-400">档案只在这台装置上解析，按「确认审核」之前不会储存任何资料；确认后也只存入 V2，不改动现有考勤与薪资</span>
                        </label>
                    )}

                    {busy && <div className="flex items-center gap-2 text-sm font-bold text-gray-500"><Loader2 className="animate-spin" size={16} /> {busy}</div>}
                    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}

                    {review && data && (
                        <>
                            {data.warnings.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                    {data.warnings.map(w => <div key={w}>⚠️ {w}</div>)}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                <Stat label="已对应员工" value={`${review.employees.length}`} />
                                <Stat label="对不上编号" value={`${review.unmatched.length}`} tone={unmatchedPending ? 'warn' : undefined} />
                                <Stat label="待处理异常" value={`${review.openExceptionCount} / ${review.totalExceptionCount}`} tone={review.openExceptionCount ? 'warn' : 'ok'} />
                                <Stat label="营业日分界" value={cutoff} />
                            </div>

                            <div className="flex gap-2">
                                {(['REVIEW', 'LABOUR'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setTab(t)}
                                        className={`min-h-[44px] rounded-xl px-4 text-sm font-black ${tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
                                    >
                                        {t === 'REVIEW' ? '考勤审核' : '人工成本与盈利'}
                                    </button>
                                ))}
                            </div>

                            {tab === 'REVIEW' ? (
                                <>
                                    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 p-3 text-xs">
                                        <label className="flex flex-col gap-1 font-bold text-gray-600">
                                            营业日分界（此时间前的打卡算前一天）
                                            <input type="time" value={cutoff} onChange={e => e.target.value && setCutoff(e.target.value)} className="rounded-lg border px-2 py-2" />
                                        </label>
                                        <label className="flex flex-col gap-1 font-bold text-gray-600">
                                            加班起算（比班表晚几分钟）
                                            <input type="number" min={0} value={otThreshold} onChange={e => setOtThreshold(Math.max(0, Number(e.target.value) || 0))} className="w-24 rounded-lg border px-2 py-2" />
                                        </label>
                                        <span className="text-gray-400">班表沿用「考勤设定」：平日 {shiftSettings.weekdayCheckIn}–{shiftSettings.weekdayCheckOut}，周末 {shiftSettings.weekendCheckIn}–{shiftSettings.weekendCheckOut}，宽限 {shiftSettings.graceMinutes} 分钟</span>
                                    </div>

                                    {review.unmatched.length > 0 && (
                                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                            <p className="text-sm font-black text-amber-900">以下机器编号对不上 ERP 员工（员工 ID 或「考勤机编号」），请手动对应或略过：</p>
                                            {review.unmatched.map(u => (
                                                <div key={u.deviceNo} className="flex flex-wrap items-center gap-2 text-sm">
                                                    <span className="font-mono font-bold">#{u.deviceNo}</span>
                                                    <span>{u.deviceName} · {u.department} · {u.days.length} 天有打卡</span>
                                                    <select
                                                        value={manualMatches[u.deviceNo] ?? '__pending'}
                                                        onChange={e => setManualMatches(prev => ({ ...prev, [u.deviceNo]: e.target.value === '__pending' ? undefined as any : e.target.value }))}
                                                        className="min-h-[40px] rounded-lg border px-2"
                                                    >
                                                        <option value="__pending">— 请选择 —</option>
                                                        <option value="">略过此人（不导入）</option>
                                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}（{e.id}）</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                            <span className="text-gray-600">批量处理（只套用到尚未处理的项目）：</span>
                                            <input value={bulkNote} onChange={e => setBulkNote(e.target.value)} placeholder="批量原因（豁免必填）" className="min-h-[36px] rounded-lg border px-2" />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(Object.keys(TYPE_LABEL) as ExceptionType[]).filter(t => openByType[t]).map(t => (
                                                <div key={t} className="flex flex-wrap items-center gap-1 rounded-lg bg-gray-50 px-2 py-1 text-xs">
                                                    <span className="font-black">{TYPE_LABEL[t]} {openByType[t]}</span>
                                                    {ALLOWED_ACTIONS[t].filter(a => a !== 'ADD_TIME').map(a => (
                                                        <button key={a} onClick={() => bulkResolve(t, a)} className="min-h-[32px] rounded-md border border-gray-300 bg-white px-2 font-bold hover:bg-gray-100">
                                                            全部{ACTION_LABEL[a]}
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                            {review.openExceptionCount === 0 && <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> 所有异常已处理</span>}
                                        </div>
                                        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> 只显示有待处理异常的日子
                                        </label>
                                    </div>

                                    <div className="divide-y rounded-xl border border-gray-200">
                                        {review.employees.map(emp => (
                                            <EmployeeRow
                                                key={emp.deviceNo}
                                                emp={emp}
                                                open={expanded === emp.deviceNo}
                                                onToggle={() => setExpanded(expanded === emp.deviceNo ? null : emp.deviceNo)}
                                                onlyOpen={onlyOpen}
                                                resolve={resolve}
                                            />
                                        ))}
                                    </div>
                                </>
                            ) : (
                                isCalendarMonth(data.periodStart, data.periodEnd) ? (
                                    <LabourPanel month={data.periodStart.slice(0, 7)} employees={employees} review={review} />
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        这份档案的区间是 {data.periodStart} ~ {data.periodEnd}，不是完整的一个月。
                                        薪资与营业额都以月计，混在一起会算错，所以只在「1 号到月底」的档案计算人工成本。考勤审核与导入不受影响。
                                    </div>
                                )
                            )}
                        </>
                    )}
                </div>

                {review && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 p-4">
                        {savedCount !== null ? (
                            <span className="flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={16} /> 已储存 {savedCount} 天的审核结果（未改动现有考勤与薪资）</span>
                        ) : (
                            <>
                                {!currentEmployee && (
                                    <input value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="审核主管姓名（必填）" className="min-h-[44px] rounded-xl border px-3 text-sm" />
                                )}
                                <span className="text-xs font-bold text-gray-500">
                                    {review.openExceptionCount > 0
                                        ? `还有 ${review.openExceptionCount} 项异常待处理`
                                        : unmatchedPending > 0
                                            ? `还有 ${unmatchedPending} 个编号待对应`
                                            : !reviewerName.trim()
                                                ? '请填写审核主管'
                                                : '可以导入'}
                                </span>
                                <button
                                    disabled={!canSave || !!busy}
                                    onClick={handleSave}
                                    className="min-h-[44px] rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                                >
                                    确认审核
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const Stat: React.FC<{ label: string; value: string; tone?: 'warn' | 'ok' }> = ({ label, value, tone }) => (
    <div className={`rounded-xl border p-3 ${tone === 'warn' ? 'border-amber-300 bg-amber-50' : tone === 'ok' ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
        <div className="text-[11px] font-bold text-gray-500">{label}</div>
        <div className="text-lg font-black">{value}</div>
    </div>
);

const EmployeeRow: React.FC<{
    emp: ReviewEmployee;
    open: boolean;
    onToggle: () => void;
    onlyOpen: boolean;
    resolve: (key: string, r: Resolution | null) => void;
}> = ({ emp, open, onToggle, onlyOpen, resolve }) => {
    const days = onlyOpen ? emp.days.filter(d => d.exceptions.some(ex => !isDone(ex))) : emp.days;
    return (
        <div>
            <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 p-3 text-left text-sm hover:bg-gray-50">
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-black">{emp.employee?.name}</span>
                <span className="font-mono text-xs text-gray-500">#{emp.deviceNo}</span>
                {emp.inactive && <span className="rounded bg-gray-200 px-1.5 text-[11px] font-bold">已离职/封存</span>}
                <span className="text-xs text-gray-500">{emp.totals.daysWorked} 天 · {hours(emp.totals.workedMinutes)} 小时 · 加班 {hours(emp.totals.approvedOtMinutes)} 小时（已批准）</span>
                {emp.totals.openExceptions > 0 ? (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800"><AlertTriangle size={12} /> {emp.totals.openExceptions}</span>
                ) : (
                    <CheckCircle2 size={16} className="ml-auto text-emerald-600" />
                )}
            </button>
            {open && (
                <div className="space-y-2 bg-gray-50/60 p-3">
                    {emp.previousPeriodPunches.length > 0 && (
                        <p className="text-[11px] text-gray-500">属于上个区间的打卡（不导入）：{emp.previousPeriodPunches.join('、')}</p>
                    )}
                    {days.length === 0 && <p className="text-xs text-gray-500">没有待处理的日子。</p>}
                    {days.map(day => (
                        <div key={day.businessDate} className="rounded-lg border border-gray-200 bg-white p-2 text-xs">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-black">{day.businessDate}</span>
                                <span className="font-mono">{day.punches.join('  ') || '—'}</span>
                                <span className="text-gray-500">班表 {day.scheduledIn}–{day.scheduledOut}</span>
                                <span className="text-gray-500">{day.markedAbsent ? '不算出勤' : day.incomplete ? '待补打卡' : `${hours(day.workedMinutes)} 小时`}</span>
                            </div>
                            {day.exceptions.map(ex => (
                                <ExceptionControl key={ex.key} ex={ex} resolve={resolve} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ExceptionControl: React.FC<{ ex: ReviewException; resolve: (key: string, r: Resolution | null) => void }> = ({ ex, resolve }) => {
    const [time, setTime] = useState(ex.resolution?.action === 'ADD_TIME' ? ex.resolution.time : '');
    const [note, setNote] = useState(ex.resolution && 'note' in ex.resolution ? ex.resolution.note || '' : '');
    const done = isDone(ex);
    return (
        <div className={`mt-1 flex flex-wrap items-center gap-2 rounded-md p-1.5 ${done ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <span className="font-black">{TYPE_LABEL[ex.type]}</span>
            <span className="text-gray-600">{ex.message}</span>
            {ALLOWED_ACTIONS[ex.type].includes('ADD_TIME') && (
                <>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} className="rounded border px-1 py-1" />
                    <button
                        disabled={!time}
                        onClick={() => resolve(ex.key, { action: 'ADD_TIME', time, note })}
                        className="rounded border border-gray-300 bg-white px-2 py-1 font-bold disabled:opacity-40"
                    >
                        补上时间
                    </button>
                </>
            )}
            {ALLOWED_ACTIONS[ex.type].includes('EXCUSE') && (
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="原因（豁免必填）" className="rounded border px-1 py-1" />
            )}
            {ALLOWED_ACTIONS[ex.type].filter(a => a !== 'ADD_TIME').map(a => (
                <button
                    key={a}
                    disabled={a === 'EXCUSE' && !note.trim()}
                    onClick={() => resolve(ex.key, a === 'EXCUSE' ? { action: a, note: note.trim() } : ({ action: a, note: note.trim() || undefined } as Resolution))}
                    className={`rounded border px-2 py-1 font-bold disabled:opacity-40 ${ex.resolution?.action === a ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white'}`}
                >
                    {ACTION_LABEL[a]}
                </button>
            ))}
            {ex.resolution && (
                <button onClick={() => resolve(ex.key, null)} className="text-gray-400 underline">撤销</button>
            )}
        </div>
    );
};

/** 人工成本与盈利：读取当月营业额与已发放薪资，计算后只显示，不写入 */
const LabourPanel: React.FC<{ month: string; employees: Employee[]; review: NonNullable<ReturnType<typeof buildReview>> }> = ({ month, employees, review }) => {
    const [loading, setLoading] = useState(true);
    const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
    const [revenue, setRevenue] = useState({ amount: 0, days: 0 });
    const [loadError, setLoadError] = useState<string | null>(null);
    const [variablePct, setVariablePct] = useState(35);
    const [otherFixed, setOtherFixed] = useState(0);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [records, settlements] = await Promise.all([DataManager.getPayrollRecords(), DataManager.getSettlements(month)]);
                if (!alive) return;
                const agg = aggregateMonth(month, { settlements, standaloneExpenses: [], billPayments: [], payrollRecords: [], employees });
                const platform = agg.platformGross.grab + agg.platformGross.shopee + agg.platformGross.panda + agg.platformGross.lalamove;
                const days = new Set(settlements.map(s => String(s.date || '').slice(0, 10)).filter(d => d.startsWith(month))).size;
                setPayroll(records || []);
                setRevenue({ amount: agg.inStoreSales + platform, days });
            } catch (e) {
                if (alive) setLoadError(`读取营业额或薪资失败：${(e as Error).message}`);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [month, employees]);

    const analysis = useMemo(() => {
        const attendance: Record<string, { daysWorked: number; workedMinutes: number; approvedOtMinutes: number }> = {};
        review.employees.forEach(e => { attendance[e.employee!.id] = e.totals; });
        const costs = buildLabourCosts(month, employees, attendance, payroll);
        const [y, m] = month.split('-').map(Number);
        const reasons: string[] = [];
        if (review.openExceptionCount > 0) reasons.push(`考勤还有 ${review.openExceptionCount} 项异常未处理`);
        return analyseLabour(
            month,
            costs,
            {
                revenue: revenue.amount,
                revenueDays: revenue.days,
                daysInMonth: new Date(y, m, 0).getDate(),
                variableCostRatio: variablePct / 100,
                otherFixedCosts: otherFixed,
                manualInputs: ['食材等变动成本率', '其他固定成本'],
            },
            reasons,
        );
    }, [review, employees, payroll, revenue, variablePct, otherFixed, month]);

    if (loading) return <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> 读取营业额与薪资…</div>;

    return (
        <div className="space-y-3">
            {loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}
            {analysis.isEstimate && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-black">⚠️ 估算值（资料不完整）</p>
                    {analysis.estimateReasons.map(r => <div key={r}>· {r}</div>)}
                </div>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="雇主人工成本" value={rm(analysis.labourCost)} />
                <Stat label="人工成本率" value={analysis.labourCostRatio === null ? '—' : `${(analysis.labourCostRatio * 100).toFixed(1)}%`} />
                <Stat label="保本营业额" value={analysis.breakEvenRevenue === null ? '—' : rm(analysis.breakEvenRevenue)} />
                <Stat label="预估利润" value={rm(analysis.projectedProfit)} tone={analysis.projectedProfit < 0 ? 'warn' : 'ok'} />
            </div>
            <div className="grid gap-3 rounded-xl border border-gray-200 p-3 text-xs md:grid-cols-3">
                <div>
                    <div className="font-bold text-gray-500">营业额（结算记录，{revenue.days} 天）</div>
                    <div className="text-base font-black">{rm(analysis.revenueActual)}</div>
                    {analysis.revenueProjected !== analysis.revenueActual && <div className="text-gray-500">整月推估 {rm(analysis.revenueProjected)}</div>}
                </div>
                <label className="flex flex-col gap-1 font-bold text-gray-500">
                    食材等变动成本率（%）
                    <input type="number" min={0} max={95} value={variablePct} onChange={e => setVariablePct(Math.min(95, Math.max(0, Number(e.target.value) || 0)))} className="rounded-lg border px-2 py-2 text-gray-900" />
                </label>
                <label className="flex flex-col gap-1 font-bold text-gray-500">
                    其他固定成本 RM（租金、水电…，不含薪资）
                    <input type="number" min={0} value={otherFixed} onChange={e => setOtherFixed(Math.max(0, Number(e.target.value) || 0))} className="rounded-lg border px-2 py-2 text-gray-900" />
                </label>
            </div>
            <p className="text-[11px] text-gray-500">
                雇主人工成本 = 应发薪资（底薪 + 固定津贴）+ 雇主 EPF / SOCSO / EIS。已批准加班规则待确认，暂不计入（已发薪资里的加班照实计入）。员工自付的 EPF / SOCSO / EIS / LINDUNG（合计 {rm(analysis.employeeDeductions)}）已含在应发薪资内，不重复计算。已发放的薪资以实际数字为准。
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-left text-gray-500">
                        <tr>
                            <th className="p-2">员工</th><th className="p-2">来源</th><th className="p-2 text-right">底薪</th><th className="p-2 text-right">加班</th>
                            <th className="p-2 text-right">津贴</th><th className="p-2 text-right">雇主 EPF</th><th className="p-2 text-right">雇主 SOCSO</th><th className="p-2 text-right">雇主 EIS</th>
                            <th className="p-2 text-right">雇主成本</th><th className="p-2 text-right">员工自付</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {analysis.employees.map(c => (
                            <tr key={c.employeeId}>
                                <td className="p-2 font-bold">{c.employeeName}{c.notes.length > 0 && <span className="block font-normal text-amber-700">{c.notes.join('；')}</span>}</td>
                                <td className="p-2">{c.source === 'PAYROLL' ? '已发薪' : '估算'}</td>
                                <td className="p-2 text-right">{c.basic.toFixed(2)}</td>
                                <td className="p-2 text-right">{c.overtime.toFixed(2)}</td>
                                <td className="p-2 text-right">{c.allowance.toFixed(2)}</td>
                                <td className="p-2 text-right">{c.employerEpf.toFixed(2)}</td>
                                <td className="p-2 text-right">{c.employerSocso.toFixed(2)}</td>
                                <td className="p-2 text-right">{c.employerEis.toFixed(2)}</td>
                                <td className="p-2 text-right font-black">{c.employerCost.toFixed(2)}</td>
                                <td className="p-2 text-right text-gray-500">{c.employeeDeductions.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
