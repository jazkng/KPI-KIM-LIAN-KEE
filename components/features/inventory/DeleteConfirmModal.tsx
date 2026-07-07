import React from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
    itemName?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ itemName, onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center border-t-8 border-red-500 animate-in zoom-in-95">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <Trash2 size={32} className="text-red-600"/>
                </div>
                <h3 className="font-black text-2xl text-[#1A1A1A] mb-2">确认删除?</h3>
                <p className="text-sm text-gray-500 font-bold mb-6">您确定要删除 <span className="text-red-600">{itemName}</span> 吗？<br/>此操作无法撤销。</p>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={onCancel} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors">取消 (Cancel)</button>
                    <button onClick={onConfirm} className="py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2"><Trash2 size={16}/> 确认删除</button>
                </div>
            </div>
        </div>
    );
};