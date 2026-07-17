import React, { useState } from 'react';
import { X, Save, Trash2, MessageSquare } from 'lucide-react';

interface RosterNoteEditorProps {
    isOpen: boolean;
    onClose: () => void;
    initialValue: string;
    onSave: (value: string) => void;
    employeeName: string;
    date: string;
}

export const RosterNoteEditor: React.FC<RosterNoteEditorProps> = ({
    isOpen,
    onClose,
    initialValue,
    onSave,
    employeeName,
    date
}) => {
    const [note, setNote] = useState(initialValue);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="text-yellow-500" size={18} />
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">编辑排班备注 (Edit Note)</h3>
                            <p className="text-xs text-gray-400 font-mono">{date} · {employeeName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                        id="close-note-editor"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                        备注内容 (Note Content)
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="请输入备注，例如：‘请假事由’、‘调班：调至中班’等..."
                        className="w-full h-32 p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none resize-none transition-all placeholder-gray-400"
                        maxLength={200}
                        id="note-textarea"
                        autoFocus
                    />
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] text-gray-400">最大 200 字</span>
                        {note && (
                            <button
                                type="button"
                                onClick={() => {
                                    setNote('');
                                }}
                                className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
                                id="clear-note-text"
                            >
                                <Trash2 size={12} />
                                清空内容
                            </button>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                        style={{ minHeight: '44px' }}
                        id="cancel-note-btn"
                    >
                        取消 (Cancel)
                    </button>
                    <button
                        onClick={() => {
                            onSave(note.trim());
                            onClose();
                        }}
                        className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-gray-900/10"
                        style={{ minHeight: '44px' }}
                        id="save-note-btn"
                    >
                        <Save size={14} />
                        保存备注 (Save)
                    </button>
                </div>
            </div>
        </div>
    );
};
