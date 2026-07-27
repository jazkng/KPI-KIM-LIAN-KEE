import React from 'react';
import { ROSTER_STATUSES } from './rosterConstants';
import { X, MessageSquare } from 'lucide-react';

interface RosterStatusPickerProps {
    currentStatus: string;
    onSelect: (status: string) => void;
    onClose: () => void;
    hasNote: boolean;
    onEditNote: () => void;
    employeeName: string;
    date: string;
}

export const RosterStatusPicker: React.FC<RosterStatusPickerProps> = ({
    currentStatus,
    onSelect,
    onClose,
    hasNote,
    onEditNote,
    employeeName,
    date
}) => {
    return (
        <div className="p-4 w-full max-w-xs bg-white rounded-xl shadow-xl border border-gray-200">
            {/* Header info */}
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-gray-100">
                <div>
                    <p className="text-xs text-gray-400 font-mono">{date}</p>
                    <p className="text-sm font-semibold text-gray-800">{employeeName}</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    id={`close-picker-${employeeName}-${date}`}
                >
                    <X size={16} />
                </button>
            </div>

            {/* Grid of status buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
                {Object.values(ROSTER_STATUSES).map((item) => {
                    const isSelected = currentStatus === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                onSelect(item.id);
                                onClose();
                            }}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                                isSelected
                                    ? 'border-gray-800 bg-gray-900 text-white ring-2 ring-gray-900/10'
                                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                            }`}
                            style={{ minHeight: '44px' }}
                            id={`status-opt-${item.id}`}
                        >
                            <span className="truncate">{item.label}</span>
                            <span className={`w-5 h-5 flex items-center justify-center rounded-md text-[10px] uppercase font-mono ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                            }`}>
                                {item.short}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Note & Custom details */}
            <div className="border-t border-gray-100 pt-3 flex gap-2">
                <button
                    onClick={() => {
                        onEditNote();
                        onClose();
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        hasNote
                            ? 'bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                    style={{ minHeight: '44px' }}
                    id={`edit-note-btn-${employeeName}-${date}`}
                >
                    <MessageSquare size={14} />
                    {hasNote ? '查看/编辑备注' : '添加备注'}
                </button>
            </div>
        </div>
    );
};
