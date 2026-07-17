import React, { useState } from 'react';
import { X, ShieldAlert, Check, RefreshCw, KeyRound } from 'lucide-react';
import { Employee, OrgLevel } from '../../../types';
import { getOrgLevel, getOrgLevelLabel } from '../../../utils/orgAccess';

interface RosterResetDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onReset: (authorizedBy: string) => void;
    employees: Employee[];
}

export const RosterResetDialog: React.FC<RosterResetDialogProps> = ({
    isOpen,
    onClose,
    onReset,
    employees
}) => {
    const authorizedLevels = new Set<OrgLevel>([
        'OWNER',
        'BRANCH_MANAGER',
        'DEPARTMENT_HEAD'
    ]);
    const managers = employees
        .filter(e =>
            authorizedLevels.has(getOrgLevel(e)) &&
            e.status !== 'TERMINATED' &&
            !e.isArchived
        )
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    const [selectedManagerId, setSelectedManagerId] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleVerifyAndReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!selectedManagerId) {
            setError('请选择授权管理员。');
            return;
        }

        if (!pin.trim()) {
            setError('请输入 4 位数字密码 (PIN)。');
            return;
        }

        const managerObj = managers.find(m => m.id === selectedManagerId);
        if (!managerObj) {
            setError('授权管理员档案失效。');
            return;
        }

        // Verify PIN
        setLoading(true);
        setTimeout(() => {
            const expectedPin = managerObj.pin || '1234'; // fallback if somehow not set
            if (pin.trim() === expectedPin) {
                onReset(managerObj.name);
                onClose();
            } else {
                setError('验证失败：授权 PIN 密码错误！');
            }
            setLoading(false);
        }, 600);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-red-50 border-b border-red-100">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="text-red-600" size={18} />
                        <div>
                            <h3 className="font-bold text-red-900 text-sm">高危操作：清空排班表</h3>
                            <p className="text-xs text-red-500 font-mono">清空后所有格子将恢复为未排班</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-red-100 rounded-full text-red-400 hover:text-red-700 transition-colors"
                        id="close-reset-dialog"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleVerifyAndReset} className="p-6 space-y-4">
                    {/* Safety notice */}
                    <div className="p-4 rounded-xl bg-red-50/50 border border-red-100 text-xs text-red-800 space-y-1">
                        <p className="font-bold">⚠️ 操作警示 (Danger Zone):</p>
                        <p>该操作将永久清除当前月份选择的所有格子，并删除全部排班备注！</p>
                        <p className="font-semibold text-red-700">清空前系统将自动进行云端冷备份，并生成安全审计日志 (Audit Log)。</p>
                    </div>

                    {/* Administrator selector */}
                    <div className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            授权管理员 (Authorized Manager)
                        </label>
                        <select
                            value={selectedManagerId}
                            onChange={(e) => {
                                setSelectedManagerId(e.target.value);
                                setError('');
                            }}
                            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                            id="reset-manager-select"
                        >
                            <option value="">-- 请选择授权人 --</option>
                            {managers.map(m => (
                                <option key={m.id} value={m.id}>
                                    [{getOrgLevelLabel(m)}] {m.name} · {m.role}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* PIN validation */}
                    <div className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                            <KeyRound size={12} />
                            安全 PIN 密码 (4-Digit PIN)
                        </label>
                        <input
                            type="password"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            maxLength={8}
                            placeholder="请输入您的 4-8 位 PIN 密码"
                            value={pin}
                            onChange={(e) => {
                                setPin(e.target.value);
                                setError('');
                            }}
                            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all tracking-widest placeholder-gray-400"
                            id="reset-pin-input"
                        />
                        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
                    </div>

                    {/* Footer buttons */}
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                            style={{ minHeight: '44px' }}
                            id="cancel-reset-btn"
                        >
                            取消 (Cancel)
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-red-600/10 disabled:opacity-50"
                            style={{ minHeight: '44px' }}
                            id="confirm-reset-btn"
                        >
                            {loading ? (
                                <RefreshCw className="animate-spin" size={14} />
                            ) : (
                                <RefreshCw size={14} />
                            )}
                            执行清空与备份 (Reset & Backup)
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
