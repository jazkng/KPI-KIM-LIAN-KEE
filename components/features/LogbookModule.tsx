import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    BookOpen, AlertCircle, CheckCircle2, Clock, Trash2, Shield, AlertTriangle,
    FileText, Camera, X, Loader2, ChevronDown, Zap, PenTool, Maximize2,
    Lightbulb, Edit3, Gavel, Coins, Check, Calendar, Languages,
} from 'lucide-react';
import { LogEntry, LogCategory, LogPriority, Employee, MisconductRecord } from '../../types';
import { uploadToCloudinary } from '../utils';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LogbookModuleProps {
    viewOnly?: boolean;
    currentEmployee?: Employee;
}

type MisconductType = 'SMALL' | 'MEDIUM' | 'BIG';
type QuickDateType  = 'TODAY' | 'YESTERDAY' | '7DAYS' | 'THIS_MONTH' | 'LAST_MONTH';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const getCategoryLabel = (cat: LogCategory) => {
    switch (cat) {
        case 'VIP':       return { label: 'VIP 接待', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', Icon: Zap };
        case 'COMPLAINT': return { label: '客诉处理', color: 'bg-red-100 text-red-800 border-red-200',          Icon: AlertCircle };
        case 'REPAIR':    return { label: '设备维修', color: 'bg-orange-100 text-orange-800 border-orange-200', Icon: PenTool };
        default:          return { label: '日常记录', color: 'bg-gray-100 text-gray-800 border-gray-200',       Icon: FileText };
    }
};

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

// Fix #misc: 替换 React.createElement，改用函数调用方式的 JSX 包装
const CategoryIcon = ({ cat }: { cat: LogCategory }) => {
    const { Icon } = getCategoryLabel(cat);
    return <Icon size={10} />;
};

// iOS: WebkitTapHighlightColor 内联样式常量，统一管理
const noTapHighlight: React.CSSProperties = { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export const LogbookModule: React.FC<LogbookModuleProps> = ({ viewOnly = false, currentEmployee }) => {

    const [logs,          setLogs]          = useState<LogEntry[]>([]);
    const [isLoading,     setIsLoading]     = useState(true);   // Fix #7: 加载状态
    const [activeFilter,  setActiveFilter]  = useState<'ALL' | 'HIGH_PRIORITY' | 'COMPLAINT'>('ALL');
    const [employees,     setEmployees]     = useState<Employee[]>([]);
    const [translations,  setTranslations]  = useState<Record<string, { issue: string; action: string; loading?: boolean; error?: string }>>({});

    // 日期筛选 — 默认近 7 天
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
        const today   = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        return { start: toDateStr(weekAgo), end: toDateStr(today) };
    });
    const [showDatePicker, setShowDatePicker] = useState(false);

    const applyQuickDate = useCallback((type: QuickDateType) => {
        const now = new Date();
        const s   = new Date(now);
        const e   = new Date(now);
        if      (type === 'YESTERDAY')   { s.setDate(now.getDate() - 1); e.setDate(now.getDate() - 1); }
        else if (type === '7DAYS')       { s.setDate(now.getDate() - 7); }
        else if (type === 'THIS_MONTH')  { s.setDate(1); e.setMonth(e.getMonth() + 1); e.setDate(0); }
        else if (type === 'LAST_MONTH')  { s.setDate(1); s.setMonth(s.getMonth() - 1); e.setDate(0); }
        // TODAY: s = e = today，已是初始值，无需额外处理
        setDateRange({ start: toDateStr(s), end: toDateStr(e) });
        setShowDatePicker(false);
    }, []);

    // 表单状态
    const [form, setForm] = useState<{
        issue: string; action: string; category: LogCategory; priority: LogPriority; image: string;
    }>({ issue: '', action: '', category: 'OTHER', priority: 'NORMAL', image: '' });

    // 违规表单（老板专用）
    const [showMisconduct, setShowMisconduct] = useState(false);
    const [misconductForm, setMisconductForm] = useState<{
        empId: string; type: MisconductType; fine: string;  // Fix #misc: 移除 as any
    }>({ empId: '', type: 'SMALL', fine: '' });

    const [isUploading,  setIsUploading]  = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 弹窗状态
    const [deleteCandidateId,       setDeleteCandidateId]       = useState<string | null>(null);
    const [viewImage,               setViewImage]               = useState<string | null>(null);
    const [solutionModalOpen,       setSolutionModalOpen]       = useState(false);
    const [selectedLogForSolution,  setSelectedLogForSolution]  = useState<LogEntry | null>(null);
    const [solutionText,            setSolutionText]            = useState('');

    // 权限判断
    const isOwner = !!(
        currentEmployee?.role?.includes('Owner') ||
        currentEmployee?.role?.includes('老板')
    );

    const canEditSolution = useMemo(() => {
        if (!currentEmployee?.role) return false;
        const r = String(currentEmployee.role).toUpperCase();
        return r.includes('OWNER') || r.includes('老板') ||
               r.includes('MANAGER') || r.includes('经理') ||
               r.includes('SUPERVISOR') || r.includes('主管');
    }, [currentEmployee]);

    const handleTranslateToBurmese = async (log: LogEntry) => {
        if (translations[log.id]?.loading) return;

        setTranslations(prev => ({
            ...prev,
            [log.id]: { issue: '', action: '', loading: true }
        }));

        try {
            const textsToTranslate = [log.issue];
            if (log.action) {
                textsToTranslate.push(log.action);
            }

            const res = await fetch('/api/gemini/translate-my', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: textsToTranslate,
                    context: '餐饮工作日志，需要翻译成适合缅甸员工理解的厨房/店面工作用语'
                })
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }

            const translatedTexts = data.translations || [];
            setTranslations(prev => ({
                ...prev,
                [log.id]: {
                    issue: translatedTexts[0] || '',
                    action: translatedTexts[1] || '',
                    loading: false
                }
            }));
        } catch (err: any) {
            console.error('Translation failed:', err);
            setTranslations(prev => ({
                ...prev,
                [log.id]: {
                    issue: '',
                    action: '',
                    loading: false,
                    error: err.message || '翻译失败'
                }
            }));
        }
    };

    // ── Fix #3: isMounted 守卫，防止卸载后 setState ───────────────────────────
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            setIsLoading(true);
            try {
                const [l, e] = await Promise.all([
                    DataManager.getLogs(),
                    DataManager.getEmployees(),
                ]);
                if (!isMounted) return;
                setLogs(l || []);
                // Fix #2: (emp.role || '') 防止 undefined.includes 崩溃
                setEmployees((e || []).filter(
                    emp => !emp.isArchived && !(emp.role || '').includes('Owner')
                ));
            } catch (err) {
                console.error('LogbookModule load error:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, []);

    // ── 图片上传 ──────────────────────────────────────────────────────────────
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            setForm(prev => ({ ...prev, image: url }));
        } catch {
            alert('Upload Failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Fix #4: 提交改用乐观更新，取消提交后多余的 getLogs() ─────────────────
    const handleAddLog = async () => {
        if (!form.issue.trim()) return alert('请填写发生事项 (Issue)');
        setIsSubmitting(true);
        try {
            let misconductData: MisconductRecord | undefined;
            if (showMisconduct && misconductForm.empId) {
                const emp = employees.find(e => e.id === misconductForm.empId);
                if (emp) {
                    misconductData = {
                        employeeId:   emp.id,
                        employeeName: emp.name,
                        type:         misconductForm.type,
                        fineAmount:   misconductForm.fine ? parseFloat(misconductForm.fine) : 0,
                    };
                }
            }

            const newEntry: LogEntry = {
                id:          Date.now().toString(),
                date:        toDateStr(new Date()),
                time:        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                issue:       form.issue,
                action:      form.action,
                category:    form.category,
                priority:    form.priority,
                status:      'PENDING',
                creatorName: currentEmployee?.name || 'Staff',
                image:       form.image || '',
                misconduct:  misconductData,
            };

            const safeEntry: LogEntry = JSON.parse(JSON.stringify(newEntry));
            await DataManager.addLog(safeEntry);

            // 乐观更新：新日志插到最前面，省去第二次 getLogs 读取
            setLogs(prev => [safeEntry, ...prev]);

            setForm({ issue: '', action: '', category: 'OTHER', priority: 'NORMAL', image: '' });
            setMisconductForm({ empId: '', type: 'SMALL', fine: '' });
            setShowMisconduct(false);
            alert('✅ 日志已提交 (已自动处理违规记录)');
        } catch (error: any) {
            console.error('Submit Log Error:', error);
            alert(`提交失败: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Fix #5: confirmDelete 加 try-catch，失败时恢复列表 ───────────────────
    const confirmDelete = async () => {
        if (!deleteCandidateId) return;
        const backup = [...logs];
        setLogs(prev => prev.filter(l => l.id !== deleteCandidateId));
        setDeleteCandidateId(null);
        try {
            await DataManager.deleteLog(deleteCandidateId);
        } catch (err) {
            console.error('Delete failed:', err);
            setLogs(backup);                // 回滚
            alert('删除失败，请重试');
        }
    };

    // ── Fix #2 (handleAcknowledge): 乐观更新 + 失败回滚 ─────────────────────
    const handleAcknowledge = async (id: string) => {
        const viewerName = currentEmployee?.name || 'Manager';
        const now        = new Date().toISOString();
        const backup     = [...logs];
        setLogs(prev => prev.map(log =>
            log.id === id ? { ...log, acknowledgedBy: viewerName, acknowledgedAt: now } : log
        ));
        try {
            await DataManager.acknowledgeLog(id, viewerName);
        } catch (err) {
            console.error('Acknowledge failed:', err);
            setLogs(backup);               // 回滚
            alert('标记已阅失败，请重试');
        }
    };

    const openSolutionModal = (log: LogEntry) => {
        setSelectedLogForSolution(log);
        setSolutionText(log.action || '');
        setSolutionModalOpen(true);
    };

    // ── Fix #1: 改用 updateLog 而非 addLog，防止创建重复记录 ─────────────────
    const handleSaveSolution = async () => {
        if (!selectedLogForSolution) return;
        const updated: LogEntry = { ...selectedLogForSolution, action: solutionText };
        const backup = [...logs];
        setLogs(prev => prev.map(l => l.id === updated.id ? updated : l));
        setSolutionModalOpen(false);
        setSelectedLogForSolution(null);
        setSolutionText('');
        try {
            // 优先使用 updateLog；若 DataManager 暂不支持则回退到 addLog（会覆盖同 id）
            if (typeof (DataManager as any).updateLog === 'function') {
                await (DataManager as any).updateLog(updated);
            } else {
                await DataManager.addLog(updated);
            }
        } catch (err) {
            console.error('Save solution failed:', err);
            setLogs(backup);
            alert('保存失败，请重试');
        }
    };

    // ── Fix #6: 排序 — 最新日志显示在最前 ───────────────────────────────────
    const filteredLogs = useMemo(() => {
        let list = [...logs];
        if (dateRange.start) list = list.filter(l => l.date >= dateRange.start);
        if (dateRange.end)   list = list.filter(l => l.date <= dateRange.end);
        if (activeFilter === 'HIGH_PRIORITY') list = list.filter(l => l.priority === 'HIGH');
        if (activeFilter === 'COMPLAINT')     list = list.filter(l => l.category === 'COMPLAINT');
        // 按日期+时间降序，最新优先
        list.sort((a, b) => {
            const da = `${a.date} ${a.time || ''}`;
            const db = `${b.date} ${b.time || ''}`;
            return db.localeCompare(da);
        });
        return list;
    }, [logs, dateRange, activeFilter]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        /*
         * iOS 适配：
         *  - pb-safe 兼容 Home Indicator
         *  - overflow-x-hidden 防弹性滚动溢出
         */
        <div
            className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-x-hidden"
            style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
        >

            {/* ── ADD LOG FORM ──────────────────────────────────────────────── */}
            {!viewOnly && (
                <div className="bg-white p-5 rounded-2xl shadow-lg border border-[#FFD700]/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FFD700] to-[#1A1A1A]" />
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-black text-[#1A1A1A] flex items-center gap-2">
                            <BookOpen size={20} className="text-[#FFD700] fill-current" />
                            新增日志 (New Log)
                        </h3>
                        <ModuleGuideButton module="LOGBOOK" dark />
                    </div>

                    <div className="space-y-4">
                        {/* 分类 & 优先级 */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* iOS: select 最小高度 44px */}
                            <select
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value as LogCategory })}
                                style={noTapHighlight}
                                className="w-full p-3 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD700]"
                            >
                                <option value="OTHER">📝 日常记录 (General)</option>
                                <option value="COMPLAINT">😡 客诉处理 (Complaint)</option>
                                <option value="REPAIR">🔧 设备维修 (Repair)</option>
                                <option value="VIP">👑 VIP 接待 (VIP)</option>
                            </select>
                            <select
                                value={form.priority}
                                onChange={e => setForm({ ...form, priority: e.target.value as LogPriority })}
                                style={noTapHighlight}
                                className={`w-full p-3 min-h-[44px] border rounded-xl text-xs font-bold outline-none focus:border-[#FFD700] ${form.priority === 'HIGH' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 border-gray-200'}`}
                            >
                                <option value="NORMAL">🟢 普通 (Normal)</option>
                                <option value="HIGH">🔴 紧急/重要 (High)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block pl-1">发生了什么? (Issue)</label>
                            <textarea
                                value={form.issue}
                                onChange={e => setForm({ ...form, issue: e.target.value })}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-[#FFD700] transition-colors resize-none h-20 placeholder:font-normal"
                                placeholder="例如：2号桌客人投诉福建面太咸..."
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block pl-1">采取了什么行动? (Action Taken)</label>
                            <textarea
                                value={form.action}
                                onChange={e => setForm({ ...form, action: e.target.value })}
                                className="w-full p-3 bg-green-50/50 border border-green-100 rounded-xl text-sm font-bold outline-none focus:border-green-400 transition-colors resize-none h-16 placeholder:font-normal text-green-800"
                                placeholder="例如：立即重做一份，并赠送凉茶致歉..."
                            />
                        </div>

                        {/* 违规处罚（老板专用） */}
                        {isOwner && (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                <label className="flex items-center gap-2 text-xs font-black text-red-700 cursor-pointer select-none min-h-[44px]" style={noTapHighlight}>
                                    <input
                                        type="checkbox"
                                        checked={showMisconduct}
                                        onChange={e => setShowMisconduct(e.target.checked)}
                                        className="accent-red-600 w-4 h-4"
                                    />
                                    <Gavel size={14} /> 记录违规与处罚 (Discipline)
                                </label>

                                {showMisconduct && (
                                    <div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">Staff (责任人)</label>
                                            <select
                                                value={misconductForm.empId}
                                                onChange={e => setMisconductForm({ ...misconductForm, empId: e.target.value })}
                                                style={noTapHighlight}
                                                className="w-full p-2.5 min-h-[44px] bg-white border border-red-200 rounded-lg text-xs font-bold outline-none"
                                            >
                                                <option value="">Select Staff...</option>
                                                {/* Fix #4: (e.role || '') 防止 split 崩溃 */}
                                                {employees.map(e => (
                                                    <option key={e.id} value={e.id}>
                                                        {e.name} ({(e.role || '').split('(')[0].trim()})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">Severity (错误等级)</label>
                                            <div className="flex gap-2">
                                                {([
                                                    { id: 'SMALL'  as MisconductType, l: '小错 (5x)', c: 'bg-blue-100 text-blue-700 border-blue-200' },
                                                    { id: 'MEDIUM' as MisconductType, l: '中错 (3x)', c: 'bg-orange-100 text-orange-700 border-orange-200' },
                                                    { id: 'BIG'    as MisconductType, l: '大错 (1x)', c: 'bg-red-600 text-white border-red-600' },
                                                ] as const).map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        style={noTapHighlight}
                                                        onClick={() => setMisconductForm({ ...misconductForm, type: opt.id })}
                                                        className={`flex-1 py-3 min-h-[44px] rounded-lg text-[10px] font-bold border transition-all select-none active:scale-95 ${misconductForm.type === opt.id ? opt.c : 'bg-white text-gray-500 border-gray-200'}`}
                                                    >
                                                        {opt.l}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-1 text-[9px] text-red-500 italic">
                                                {misconductForm.type === 'SMALL'  && '累计 5 次触发黄色警告 (Yellow Warning)'}
                                                {misconductForm.type === 'MEDIUM' && '累计 3 次触发黄色警告 (Yellow Warning)'}
                                                {misconductForm.type === 'BIG'    && '直接触发黄色警告 (Direct Warning)'}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold text-red-400 uppercase mb-1 flex items-center gap-1">
                                                <Coins size={10} /> Fine (罚款 - Optional)
                                            </label>
                                            <input
                                                type="number"
                                                value={misconductForm.fine}
                                                onChange={e => setMisconductForm({ ...misconductForm, fine: e.target.value })}
                                                className="w-full p-2.5 min-h-[44px] bg-white border border-red-200 rounded-lg text-xs font-bold outline-none"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 图片 + 提交 */}
                        <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                                {form.image ? (
                                    <div className="w-14 h-14 rounded-lg border border-gray-200 overflow-hidden relative group cursor-pointer">
                                        <img
                                            src={form.image}
                                            className="w-full h-full object-cover"
                                            // Fix #8: 加空值检查
                                            onClick={() => form.image && setViewImage(form.image)}
                                            alt="preview"
                                        />
                                        <button
                                            onClick={() => setForm(prev => ({ ...prev, image: '' }))}
                                            style={noTapHighlight}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity select-none"
                                        >
                                            <X size={16} className="text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        style={noTapHighlight}
                                        className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center border border-dashed border-gray-300 hover:bg-gray-200 active:bg-gray-300 transition-colors select-none"
                                    >
                                        {isUploading
                                            ? <Loader2 size={18} className="animate-spin text-gray-400" />
                                            : <Camera size={20} className="text-gray-400" />}
                                    </button>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </div>
                            <button
                                onClick={handleAddLog}
                                disabled={isUploading || isSubmitting}
                                style={noTapHighlight}
                                className="flex-grow bg-[#1A1A1A] text-[#FFD700] h-14 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 hover:bg-black disabled:opacity-50 disabled:scale-100 select-none"
                            >
                                {isSubmitting
                                    ? <Loader2 size={20} className="animate-spin" />
                                    : '提交记录 (Submit)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LOG LIST ──────────────────────────────────────────────────── */}
            <div className="space-y-4">

                {/* 日期筛选栏 */}
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 space-y-2">
                    {/* iOS: overflow-x-auto + -webkit-overflow-scrolling */}
                    <div
                        className="flex items-center gap-1.5 overflow-x-auto"
                        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                    >
                        {([
                            { label: '今日',  value: 'TODAY'      },
                            { label: '昨日',  value: 'YESTERDAY'  },
                            { label: '近7天', value: '7DAYS'      },
                            { label: '本月',  value: 'THIS_MONTH' },
                            { label: '上月',  value: 'LAST_MONTH' },
                        ] as { label: string; value: QuickDateType }[]).map(item => (
                            <button
                                key={item.value}
                                onClick={() => applyQuickDate(item.value)}
                                style={noTapHighlight}
                                className="px-3 py-2 min-h-[44px] bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 rounded-lg text-[10px] font-bold whitespace-nowrap text-gray-500 transition-all shrink-0 select-none"
                            >
                                {item.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowDatePicker(p => !p)}
                            style={noTapHighlight}
                            className={`px-3 py-2 min-h-[44px] rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 transition-all select-none ${dateRange.start ? 'bg-blue-600 text-white border border-blue-600' : 'bg-white border border-gray-200 text-gray-500 hover:bg-blue-50'}`}
                        >
                            <Calendar size={10} />
                            {dateRange.start && dateRange.end
                                ? `${dateRange.start.slice(5)} ~ ${dateRange.end.slice(5)}`
                                : '自选日期'}
                        </button>
                        {(dateRange.start || dateRange.end) && (
                            <button
                                onClick={() => { setDateRange({ start: '', end: '' }); setShowDatePicker(false); }}
                                style={noTapHighlight}
                                className="p-2 min-w-[44px] min-h-[44px] hover:bg-gray-100 active:bg-gray-200 rounded-full text-gray-400 shrink-0 flex items-center justify-center select-none"
                            >
                                <X size={12} />
                            </button>
                        )}
                        <span className="text-[10px] text-gray-400 font-bold ml-auto shrink-0">{filteredLogs.length} 笔</span>
                    </div>

                    {showDatePicker && (
                        <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-1">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="flex-1 bg-white text-xs font-bold p-2 min-h-[44px] outline-none rounded-lg border border-blue-200 text-center"
                            />
                            <span className="text-gray-400 text-xs font-bold shrink-0">至</span>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="flex-1 bg-white text-xs font-bold p-2 min-h-[44px] outline-none rounded-lg border border-blue-200 text-center"
                            />
                            <button
                                onClick={() => setShowDatePicker(false)}
                                style={noTapHighlight}
                                className="p-2.5 min-w-[44px] min-h-[44px] bg-blue-600 active:bg-blue-700 text-white rounded-lg shrink-0 flex items-center justify-center select-none"
                            >
                                <CheckCircle2 size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* 分类 tab */}
                <div className="flex bg-gray-200/60 p-1 rounded-xl w-fit shadow-inner border border-gray-200">
                    {([
                        { key: 'ALL'           as const, label: '全部日志 (All)',      extra: '' },
                        { key: 'HIGH_PRIORITY' as const, label: '紧急 (High)',         extra: 'text-red-600' },
                        { key: 'COMPLAINT'     as const, label: '客诉 (Complaint)',    extra: 'text-orange-600' },
                    ]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            style={noTapHighlight}
                            className={`px-3 md:px-4 py-2 min-h-[44px] rounded-lg text-xs font-bold transition-all select-none active:scale-95 ${activeFilter === tab.key ? `bg-white shadow-sm ${tab.extra || 'text-[#1A1A1A]'}` : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Fix #7: Loading 状态 */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 size={28} className="animate-spin text-gray-300" />
                        <p className="text-xs text-gray-400 font-bold">加载日志中...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 font-bold text-sm bg-white rounded-2xl border-2 border-dashed border-gray-200">
                        该分类下暂无日志
                    </div>
                ) : (
                    filteredLogs.map(log => {
                        const catInfo      = getCategoryLabel(log.category);
                        const isAcknowledged = !!log.acknowledgedBy;

                        return (
                            <div
                                key={log.id}
                                className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all border-l-4 ${log.priority === 'HIGH' ? 'border-l-red-500' : 'border-l-gray-300'} ${isAcknowledged ? 'opacity-75' : ''}`}
                            >
                                <div className="p-4">
                                    {/* 头部：分类 badge + 时间 + 删除 */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 mr-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border ${catInfo.color}`}>
                                                <CategoryIcon cat={log.category} /> {catInfo.label}
                                            </span>
                                            {log.priority === 'HIGH' && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white animate-pulse">紧急</span>
                                            )}
                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                <Clock size={10} /> {log.date} {log.time}
                                            </span>
                                        </div>
                                        {/* iOS: 删除按钮扩大热区 */}
                                        {!viewOnly && (
                                            <button
                                                onClick={() => setDeleteCandidateId(log.id)}
                                                style={noTapHighlight}
                                                className="w-11 h-11 flex items-center justify-center text-gray-300 hover:text-red-500 active:text-red-600 rounded-full hover:bg-red-50 active:bg-red-100 transition-colors select-none shrink-0"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex gap-3">
                                        <div className="flex-grow space-y-2 min-w-0">
                                            <h5 className="font-bold text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap break-words">
                                                {log.issue}
                                            </h5>

                                            {/* Action */}
                                            {log.action ? (
                                                <div className="bg-green-50/50 p-2 rounded-lg border border-green-100/50 flex gap-2 items-start group/action relative">
                                                    <CheckCircle2 size={14} className="text-green-600 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-green-800 font-medium leading-relaxed flex-grow break-words">{log.action}</p>
                                                    {viewOnly && canEditSolution && (
                                                        <button
                                                            onClick={() => openSolutionModal(log)}
                                                            style={noTapHighlight}
                                                            className="opacity-0 group-hover/action:opacity-100 active:opacity-100 transition-opacity text-[10px] text-green-600 absolute top-2 right-2 bg-white/80 px-2 py-1 min-h-[28px] rounded shadow-sm select-none"
                                                        >
                                                            <Edit3 size={10} />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                viewOnly && canEditSolution && (
                                                    <button
                                                        onClick={() => openSolutionModal(log)}
                                                        style={noTapHighlight}
                                                        className="w-full mt-2 py-3 min-h-[44px] bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-yellow-100 active:bg-yellow-200 transition-colors select-none"
                                                    >
                                                        <Lightbulb size={14} /> 💡 提出解决方案
                                                    </button>
                                                )
                                            )}

                                            {/* 违规记录 */}
                                            {log.misconduct && (
                                                <div className="bg-red-50 p-2 rounded-lg border border-red-100 mt-2">
                                                    <div className="flex justify-between items-center text-[10px] font-black text-red-700 uppercase mb-1">
                                                        <span className="flex items-center gap-1"><Gavel size={10} /> 违规记录</span>
                                                        <span>{log.misconduct.type}</span>
                                                    </div>
                                                    <p className="text-xs text-red-800 font-bold">{log.misconduct.employeeName}</p>
                                                    {!!log.misconduct.fineAmount && (
                                                        <p className="text-[10px] text-red-600 mt-0.5">罚款: RM {log.misconduct.fineAmount}</p>
                                                    )}
                                                    {log.misconduct.actionResult && (
                                                        <p className="text-[10px] text-red-500 mt-1 italic">{log.misconduct.actionResult}</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* 缅甸文翻译展示 */}
                                            {translations[log.id] && (
                                                <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                                                    {translations[log.id].loading ? (
                                                        <div className="flex items-center gap-1.5 text-xs text-amber-700 font-bold bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/30">
                                                            <Loader2 size={12} className="animate-spin text-amber-500" />
                                                            <span>正在翻译成缅甸文 (Translating)...</span>
                                                        </div>
                                                    ) : translations[log.id].error ? (
                                                        <div className="text-[10px] text-red-500 font-bold bg-red-50 p-2 rounded-lg border border-red-100">
                                                            ⚠️ 翻译失败 (Failed): {translations[log.id].error}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-amber-50/40 border border-amber-200/30 p-3 rounded-xl space-y-2">
                                                            <div className="flex items-center gap-1.5 text-[10px] text-amber-800 font-black tracking-wider uppercase">
                                                                <span>🇲🇲 缅甸文翻译 (Burmese Translation)</span>
                                                            </div>
                                                            <p className="text-xs text-stone-800 font-semibold leading-relaxed break-words whitespace-pre-wrap">
                                                                {translations[log.id].issue}
                                                            </p>
                                                            {translations[log.id].action && (
                                                                <div className="bg-emerald-50/40 p-2 rounded-lg border border-emerald-100/50 flex gap-1.5 items-start mt-1.5">
                                                                    <CheckCircle2 size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                                                                    <p className="text-xs text-emerald-800 font-medium leading-relaxed break-words whitespace-pre-wrap">
                                                                        {translations[log.id].action}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* 底部：记录人 + 已阅 */}
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-gray-100">
                                                    <Shield size={10} /> 记录人: {log.creatorName}
                                                </span>

                                                {/* 缅甸文翻译按钮 */}
                                                {!translations[log.id]?.issue && !translations[log.id]?.loading && (
                                                    <button
                                                        onClick={() => handleTranslateToBurmese(log)}
                                                        style={noTapHighlight}
                                                        className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200/40 px-2 py-1 min-h-[32px] rounded flex items-center gap-1.5 shadow-sm active:scale-95 hover:bg-amber-100/60 transition-all select-none cursor-pointer"
                                                    >
                                                        <Languages size={11} />
                                                        🇲🇲 翻译 (Burmese)
                                                    </button>
                                                )}

                                                {isAcknowledged ? (
                                                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-blue-100">
                                                        <CheckCircle2 size={10} /> {log.acknowledgedBy} 已阅
                                                    </span>
                                                ) : (
                                                    viewOnly && canEditSolution && (
                                                        <button
                                                            onClick={() => handleAcknowledge(log.id)}
                                                            style={noTapHighlight}
                                                            className="text-[10px] text-white font-bold bg-blue-500 px-2.5 py-1.5 min-h-[32px] rounded flex items-center gap-1 shadow-sm active:scale-95 hover:bg-blue-600 transition-all select-none"
                                                        >
                                                            <Check size={10} /> 标记已阅
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </div>

                                        {/* 附图 — iOS: cursor-zoom-in 在移动端显示为放大镜 */}
                                        {log.image && (
                                            <div
                                                className="w-20 h-20 rounded-lg bg-gray-100 border border-gray-200 shrink-0 overflow-hidden cursor-zoom-in relative group"
                                                onClick={() => setViewImage(log.image || null)}
                                                style={noTapHighlight}
                                            >
                                                <img
                                                    src={log.image}
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                                    alt="log"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                    <Maximize2 size={16} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ── MODALS ────────────────────────────────────────────────────── */}

            {/* 图片放大 */}
            {viewImage && (
                <div
                    className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
                    onClick={() => setViewImage(null)}
                >
                    <img
                        src={viewImage}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()}
                        alt="full"
                    />
                </div>
            )}

            {/* 解决方案编辑 */}
            {solutionModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
                    <div
                        className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl"
                        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                    >
                        <h4 className="font-black text-[#1A1A1A] mb-3">编辑解决方案</h4>
                        <textarea
                            value={solutionText}
                            onChange={e => setSolutionText(e.target.value)}
                            className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm font-bold outline-none h-32 resize-none mb-4 focus:border-green-400"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setSolutionModalOpen(false); setSelectedLogForSolution(null); setSolutionText(''); }}
                                style={noTapHighlight}
                                className="flex-1 py-3 min-h-[48px] bg-gray-100 font-bold rounded-xl text-sm active:bg-gray-200 select-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveSolution}
                                style={noTapHighlight}
                                className="flex-[2] py-3 min-h-[48px] bg-green-600 text-white font-bold rounded-xl text-sm active:bg-green-700 select-none"
                            >
                                确认保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 删除确认 */}
            {deleteCandidateId && (
                <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4">
                    <div
                        className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl"
                        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                    >
                        <h4 className="text-xl font-black mb-1">确认删除?</h4>
                        <p className="text-xs text-gray-400 mb-4">此操作无法撤销</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setDeleteCandidateId(null)}
                                style={noTapHighlight}
                                className="py-3 min-h-[48px] bg-gray-100 font-bold rounded-xl text-sm active:bg-gray-200 select-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmDelete}
                                style={noTapHighlight}
                                className="py-3 min-h-[48px] bg-red-600 text-white font-bold rounded-xl text-sm active:bg-red-700 select-none"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
