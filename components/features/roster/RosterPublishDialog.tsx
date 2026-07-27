import React from 'react';
import { X, Send, CheckCircle } from 'lucide-react';
import { RosterAnomaly } from './rosterUtils';

interface RosterPublishDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onPublish: (publisherName: string) => void;
    anomalies: RosterAnomaly[];
    monthKey: string;
}

export const RosterPublishDialog: React.FC<RosterPublishDialogProps> = ({
    isOpen,
    onClose,
    onPublish,
    anomalies,
    monthKey
}) => {
    const [publisher, setPublisher] = React.useState('');
    const [error, setError] = React.useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!publisher.trim()) {
            setError('请输入您的姓名以确认发布。');
            return;
        }
        onPublish(publisher.trim());
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Send className="text-gray-900" size={18} />
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">发布排班 (Publish Roster)</h3>
                            <p className="text-xs text-gray-400 font-mono">发布月份: {monthKey}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                        id="close-publish-dialog"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Status Info */}
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 space-y-2">
                        <p className="font-semibold text-gray-800">关于发布正式排班：</p>
                        <p>1. 发布后，员工将可在其端系统查阅正式排班及出勤计划。</p>
                        <p>2. 发布操作会同步更新全局排班主文件，确保考勤打卡模块获取正确的班次预设。</p>
                    </div>

                    {/* Pre-flight Audit (Simplified per user request) */}
                    <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-xs flex items-center gap-2.5 text-green-800 font-bold">
                        <CheckCircle className="text-green-600" size={18} />
                        <span>排班表已就绪，请输入签名完成发布。</span>
                    </div>

                    {/* Publisher Input */}
                    <div className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            发布人签名 (Signature)
                        </label>
                        <input
                            type="text"
                            placeholder="请输入您的名字 (e.g. JAKE)"
                            value={publisher}
                            onChange={(e) => {
                                setPublisher(e.target.value);
                                setError('');
                            }}
                            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FFD200] focus:border-transparent outline-none transition-all placeholder-gray-400"
                            id="publisher-name-input"
                        />
                        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                            style={{ minHeight: '44px' }}
                            id="cancel-publish-btn"
                        >
                            取消 (Cancel)
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-gray-900/10"
                            style={{ minHeight: '44px' }}
                            id="confirm-publish-btn"
                        >
                            <Send size={14} />
                            确认发布 (Publish Now)
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
