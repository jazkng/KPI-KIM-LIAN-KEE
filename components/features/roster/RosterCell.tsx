import React, { useRef } from 'react';
import { ROSTER_STATUSES } from './rosterConstants';
import { MessageSquare, Calendar } from 'lucide-react';

interface RosterCellProps {
    status: string;
    note?: string;
    dateStr: string;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
    isToday: boolean;
    onChangeStatus: (newStatus: string) => void;
    onOpenPicker: (rect: DOMRect) => void;
    onOpenNote: () => void;
    readOnly?: boolean;
}

export const RosterCell: React.FC<RosterCellProps> = ({
    status,
    note,
    dateStr,
    isWeekend,
    isHoliday,
    holidayName,
    isToday,
    onChangeStatus,
    onOpenPicker,
    onOpenNote,
    readOnly = false
}) => {
    const cellRef = useRef<HTMLDivElement>(null);
    const longPressTimeout = useRef<any>(null);

    const activeStatus = ROSTER_STATUSES[status] || ROSTER_STATUSES.UNASSIGNED;

    // Handle desktop double click to toggle OFF status immediately
    const handleDoubleClick = (e: React.MouseEvent) => {
        if (readOnly) return;
        e.preventDefault();
        if (status === 'OFF') {
            onChangeStatus('UNASSIGNED');
        } else {
            onChangeStatus('OFF');
        }
    };

    // Handle single click to open Picker
    const handleClick = (e: React.MouseEvent) => {
        if (readOnly) return;
        e.preventDefault();
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            onOpenPicker(rect);
        }
    };

    // Mobile touch events: supports simple tap and long press
    const handleTouchStart = () => {
        if (readOnly) return;
        longPressTimeout.current = setTimeout(() => {
            if (cellRef.current) {
                const rect = cellRef.current.getBoundingClientRect();
                onOpenPicker(rect);
            }
        }, 600); // 600ms long press
    };

    const handleTouchEnd = () => {
        if (longPressTimeout.current) {
            clearTimeout(longPressTimeout.current);
        }
    };

    // Styling logic
    let bgClass = activeStatus.color;
    let borderClass = 'border-gray-200';
    let ringClass = '';

    if (isToday) {
        ringClass = 'ring-2 ring-[#FFD200] ring-offset-1 z-10';
        borderClass = 'border-[#FFD200]';
    } else if (isHoliday) {
        borderClass = 'border-pink-300';
    } else if (isWeekend) {
        borderClass = 'border-gray-300';
    }

    return (
        <div
            ref={cellRef}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={`relative flex flex-col items-center justify-center w-full h-12 md:h-14 border rounded-lg cursor-pointer transition-all select-none ${bgClass} ${borderClass} ${ringClass} group`}
            title={holidayName ? `公假: ${holidayName}` : undefined}
            id={`roster-cell-${dateStr}`}
        >
            {/* Short Status text */}
            <span className="text-sm font-bold tracking-tight">{activeStatus.short}</span>

            {/* Note indicator in corner */}
            {note && (
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenNote();
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 text-gray-900 flex items-center justify-center rounded-full border border-white shadow-sm hover:scale-110 transition-transform"
                    title={note}
                    id={`cell-note-dot-${dateStr}`}
                >
                    <MessageSquare size={8} />
                </div>
            )}

            {/* Holiday mini indicator */}
            {isHoliday && (
                <div className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 bg-pink-500 rounded-full animate-ping" />
            )}

            {/* Hover help tip (desktop only) */}
            <div className="hidden group-hover:block absolute bottom-full mb-1 bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-20 pointer-events-none whitespace-nowrap">
                {activeStatus.label} {note ? `(有备注: ${note.substring(0,8)}...)` : ''}
                <div className="text-[8px] text-gray-400">单点修改 · 双击休息</div>
            </div>
        </div>
    );
};
