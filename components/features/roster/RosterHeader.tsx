import React from 'react';
import { 
    Calendar, Clock, SlidersHorizontal, 
    Save, Send, RefreshCw, Download, ToggleLeft, ToggleRight, CheckSquare
} from 'lucide-react';

interface RosterHeaderProps {
    monthKey: string;
    onChangeMonth: (key: string) => void;
    currentView: 'MONTH' | 'WEEK' | 'DAILY' | 'PERSONAL';
    onChangeView: (view: 'MONTH' | 'WEEK' | 'DAILY' | 'PERSONAL') => void;
    deptFilter: string;
    onChangeDeptFilter: (dept: string) => void;
    status: 'DRAFT' | 'PUBLISHED';
    isModified: boolean;
    onSaveDraft: () => void;
    onPublishClick: () => void;
    onResetClick: () => void;
    onExportClick: () => void;
    isMultiShiftMode: boolean;
    onToggleShiftMode: () => void;
    onAutoFillWork?: () => void;
    saving: boolean;
    lastSavedAt?: string | null;
    lastSavedBy?: string | null;
}

export const RosterHeader: React.FC<RosterHeaderProps> = ({
    monthKey,
    onChangeMonth,
    currentView,
    onChangeView,
    deptFilter,
    onChangeDeptFilter,
    status,
    isModified,
    onSaveDraft,
    onPublishClick,
    onResetClick,
    onExportClick,
    isMultiShiftMode,
    onToggleShiftMode,
    onAutoFillWork,
    saving,
    lastSavedAt,
    lastSavedBy
}) => {
    // Generate monthly options for dropdown e.g. from 2026-01 to 2026-12
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);

    return (
        <div className="bg-white border-b border-gray-200 px-6 py-4 space-y-4 shadow-sm">
            {/* Top row: selectors and badges */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Calendar className="text-[#FFD200]" size={24} />
                    <div className="flex items-center gap-2">
                        <select
                            value={monthKey}
                            onChange={(e) => onChangeMonth(e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-sm font-bold text-gray-800 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all"
                            id="header-month-select"
                        >
                            {months.map(m => (
                                <option key={m} value={m}>{m} 排班表</option>
                            ))}
                        </select>

                        {/* Roster state indicator badge */}
                        {isModified ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 animate-pulse border border-orange-200">
                                存在未发布修改 (Unpublished)
                            </span>
                        ) : status === 'PUBLISHED' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                                <CheckSquare size={10} /> 已发布 (Published)
                            </span>
                        ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">
                                草稿状态 (Draft)
                            </span>
                        )}
                    </div>
                </div>

                {/* Desktop view actions */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Auto Fill Work button */}
                    {onAutoFillWork && (
                        <button
                            onClick={onAutoFillWork}
                            className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                            style={{ minHeight: '36px' }}
                            title="将所有未排班单元格填充为常规班(W)"
                            id="autofill-work-btn"
                        >
                            <CheckSquare size={16} />
                            <span>一键常规班</span>
                        </button>
                    )}

                    {/* Multi shift toggle */}
                    <button
                        onClick={onToggleShiftMode}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                            isMultiShiftMode 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                : 'bg-gray-50 border-gray-200 text-gray-600'
                        }`}
                        style={{ minHeight: '36px' }}
                        title="启用多班次(早/中/晚班)或单班次常规排班"
                        id="toggle-shift-mode-btn"
                    >
                        {isMultiShiftMode ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        <span>{isMultiShiftMode ? '多班次模式 (Multi-Shift)' : '常规单班模式'}</span>
                    </button>

                    {/* Reset button */}
                    <button
                        onClick={onResetClick}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        style={{ minHeight: '36px' }}
                        id="header-reset-btn"
                    >
                        <RefreshCw size={14} />
                        <span>重置 (Reset)</span>
                    </button>

                    {/* Export button */}
                    <button
                        onClick={onExportClick}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        style={{ minHeight: '36px' }}
                        id="header-export-btn"
                    >
                        <Download size={14} />
                        <span>导出 (Export)</span>
                    </button>

                    {/* Save Draft */}
                    <button
                        onClick={onSaveDraft}
                        disabled={saving}
                        className="px-4 py-1.5 rounded-lg border border-gray-900 bg-white hover:bg-gray-50 text-gray-900 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        style={{ minHeight: '36px' }}
                        id="header-save-draft-btn"
                    >
                        <Save size={14} />
                        <span>{saving ? '保存中...' : '保存草稿 (Save)'}</span>
                    </button>

                    {/* Publish */}
                    <button
                        onClick={onPublishClick}
                        className="px-4 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                        style={{ minHeight: '36px' }}
                        id="header-publish-btn"
                    >
                        <Send size={14} />
                        <span>发布正式 (Publish)</span>
                    </button>
                </div>
            </div>

            {/* Bottom row: View tabs and Department Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-gray-100">
                {/* View Switchers */}
                <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => onChangeView('MONTH')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            currentView === 'MONTH' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                        style={{ minHeight: '32px' }}
                        id="view-tab-month"
                    >
                        31日大表 (Month)
                    </button>
                    <button
                        onClick={() => onChangeView('WEEK')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            currentView === 'WEEK' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                        style={{ minHeight: '32px' }}
                        id="view-tab-week"
                    >
                        7日周表 (Week)
                    </button>
                    <button
                        onClick={() => onChangeView('DAILY')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            currentView === 'DAILY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                        style={{ minHeight: '32px' }}
                        id="view-tab-daily"
                    >
                        每日分布 (Daily)
                    </button>
                    <button
                        onClick={() => onChangeView('PERSONAL')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            currentView === 'PERSONAL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                        style={{ minHeight: '32px' }}
                        id="view-tab-personal"
                    >
                        个人排班 (Personal)
                    </button>
                </div>

                {/* Department filter row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                        <SlidersHorizontal size={12} />
                        部门筛选:
                    </span>
                    <div className="flex bg-gray-50 border border-gray-100 p-0.5 rounded-lg overflow-x-auto max-w-full">
                        {['ALL', 'KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER'].map((dept) => {
                            const labels: Record<string, string> = {
                                ALL: '全部',
                                KITCHEN: '厨房',
                                FLOOR: '楼面',
                                BAR: '吧台',
                                DISHWASH: '洗碗',
                                BACK_OFFICE: '后勤',
                                OTHER: '其他'
                            };
                            const isAct = deptFilter === dept;
                            return (
                                <button
                                    key={dept}
                                    onClick={() => onChangeDeptFilter(dept)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                                        isAct 
                                            ? 'bg-white border border-gray-200 text-gray-900 shadow-sm font-bold' 
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                    style={{ minHeight: '28px' }}
                                    id={`filter-dept-${dept}`}
                                >
                                    {labels[dept]}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Tiny log status info */}
            {lastSavedAt && (
                <div className="text-[10px] text-gray-400 font-mono text-right flex items-center justify-end gap-1">
                    <Clock size={10} />
                    <span>上次保存: {new Date(lastSavedAt).toLocaleString()} {lastSavedBy ? `由 [${lastSavedBy}]` : ''}</span>
                </div>
            )}
        </div>
    );
};
