import React from 'react';
import { X, Send, UserCheck } from 'lucide-react';
import { Employee, InventoryTask } from '../../../types';
import { FREQ_OPTIONS, INPUT_STYLE, LABEL_STYLE } from './inventoryConstants';

interface AssignModalProps {
    selectedCount: number;
    staffList: Employee[];
    selectedAssignee: string;
    onAssigneeChange: (id: string) => void;
    assignFrequency: number;
    onFrequencyChange: (freq: number) => void;
    activeTasks: InventoryTask[];
    onConfirm: () => void;
    onClose: () => void;
}

export const AssignModal: React.FC<AssignModalProps> = ({
    selectedCount, staffList, selectedAssignee, onAssigneeChange,
    assignFrequency, onFrequencyChange, activeTasks, onConfirm, onClose
}) => {
    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="font-black text-xl text-[#1A1A1A]">指派常驻任务</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl mb-4 text-xs text-indigo-700">
                    <span className="font-bold">💡 常驻模式：</span> 指派后按设定频率重复，直到您手动取消。
                </div>
                <p className="text-sm text-gray-500 mb-4 font-bold">已选 {selectedCount} 个物品</p>
                
                <div className="mb-4">
                    <label className={LABEL_STYLE}>Assign To (指派给)</label>
                    <select value={selectedAssignee} onChange={e => onAssigneeChange(e.target.value)} className={INPUT_STYLE}>
                        <option value="">Select Staff...</option>
                        {staffList.map(s => {
                            const hasPending = activeTasks.some(t => t.assigneeId === s.id);
                            return (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.role.split('(')[0]}) {hasPending ? '📋 已有任务' : ''}
                                </option>
                            );
                        })}
                    </select>
                </div>

                <div className="mb-4">
                    <label className={LABEL_STYLE}>盘点频率</label>
                    <div className="grid grid-cols-3 gap-2">
                        {FREQ_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => onFrequencyChange(opt.value)}
                                className={`p-3 rounded-xl border-2 text-center transition-all ${assignFrequency === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <div className="font-black text-sm text-[#1A1A1A]">{opt.label}</div>
                                <div className="text-[10px] text-gray-400">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {selectedAssignee && activeTasks.some(t => t.assigneeId === selectedAssignee && t.checkFrequency === assignFrequency) && (
                    <div className="mb-4 bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-700">
                        <div className="flex items-center gap-2 font-bold">
                            <UserCheck size={14}/>
                            <span>该员工已有同频率的任务，将自动合并</span>
                        </div>
                        <p className="text-[10px] mt-1 text-blue-500">新选物品将自动追加到现有任务中。</p>
                    </div>
                )}

                <button onClick={onConfirm} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Send size={18}/> 确认指派
                </button>
            </div>
        </div>
    );
};