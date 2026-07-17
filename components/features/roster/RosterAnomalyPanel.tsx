import React, { useState } from 'react';
import { RosterAnomaly, getDeptLabel } from './rosterUtils';
import { ShieldAlert, AlertTriangle, CheckCircle, Search, Filter, AlertCircle } from 'lucide-react';

interface RosterAnomalyPanelProps {
    anomalies: RosterAnomaly[];
    onLocateDate?: (date: string, employeeId?: string) => void;
}

export const RosterAnomalyPanel: React.FC<RosterAnomalyPanelProps> = ({
    anomalies,
    onLocateDate
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('ALL');

    // Filter rules
    const filtered = anomalies.filter(a => {
        const matchesSearch = a.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (a.employeeName && a.employeeName.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (filterType === 'ALL') return matchesSearch;
        if (filterType === 'ERROR') return matchesSearch && a.severity === 'error';
        if (filterType === 'WARNING') return matchesSearch && a.severity === 'warning';
        return matchesSearch && a.type === filterType;
    });

    const errorCount = anomalies.filter(a => a.severity === 'error').length;
    const warnCount = anomalies.filter(a => a.severity === 'warning').length;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldAlert className={errorCount > 0 ? 'text-red-500 animate-pulse' : 'text-gray-500'} size={20} />
                    <h3 className="font-bold text-gray-800 text-sm">排班异常检测 (Live Audit)</h3>
                </div>
                <div className="flex gap-1.5">
                    {errorCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                            {errorCount} 错误
                        </span>
                    )}
                    {warnCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold">
                            {warnCount} 警告
                        </span>
                    )}
                    {anomalies.length === 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold flex items-center gap-1">
                            <CheckCircle size={10} /> 完美
                        </span>
                    )}
                </div>
            </div>

            {/* Filter toolbar */}
            <div className="p-3 border-b border-gray-100 bg-white space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={14} />
                    <input
                        type="text"
                        placeholder="搜索异常、员工名字..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all"
                        id="anomaly-search"
                    />
                </div>
                <div className="flex flex-wrap gap-1">
                    <button
                        onClick={() => setFilterType('ALL')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            filterType === 'ALL' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        全部 ({anomalies.length})
                    </button>
                    <button
                        onClick={() => setFilterType('ERROR')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            filterType === 'ERROR' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                    >
                        严重错误 ({errorCount})
                    </button>
                    <button
                        onClick={() => setFilterType('WARNING')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            filterType === 'WARNING' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                        }`}
                    >
                        警告 ({warnCount})
                    </button>
                    <button
                        onClick={() => setFilterType('UNDERSTAFFED')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            filterType === 'UNDERSTAFFED' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        }`}
                    >
                        缺人警告
                    </button>
                    <button
                        onClick={() => setFilterType('UNASSIGNED')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            filterType === 'UNASSIGNED' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                        }`}
                    >
                        未排班
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CheckCircle className="text-green-500 mb-2" size={32} />
                        <p className="text-sm font-semibold text-gray-700">未发现任何排班异常</p>
                        <p className="text-xs text-gray-400 mt-1">当前排班完全符合部门与合规要求！</p>
                    </div>
                ) : (
                    filtered.map((item) => {
                        const isError = item.severity === 'error';
                        return (
                            <div
                                key={item.id}
                                onClick={() => item.date && onLocateDate?.(item.date, item.employeeId)}
                                className={`p-3 rounded-xl border transition-all text-xs flex gap-2.5 ${
                                    isError
                                        ? 'bg-red-50/50 border-red-200 hover:bg-red-50 cursor-pointer'
                                        : 'bg-yellow-50/30 border-yellow-200 hover:bg-yellow-50/60 cursor-pointer'
                                }`}
                                id={`anomaly-item-${item.id}`}
                            >
                                <div className="mt-0.5">
                                    {isError ? (
                                        <AlertCircle className="text-red-500 flex-shrink-0" size={16} />
                                    ) : (
                                        <AlertTriangle className="text-yellow-600 flex-shrink-0" size={16} />
                                    )}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <p className={`font-semibold ${isError ? 'text-red-900' : 'text-yellow-900'}`}>
                                        {item.message}
                                    </p>
                                    <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium">
                                        <span>类别: {item.type}</span>
                                        {item.date && (
                                            <span className="bg-white/80 px-1.5 py-0.5 rounded border font-mono">
                                                定位格 (Click to Locate)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
