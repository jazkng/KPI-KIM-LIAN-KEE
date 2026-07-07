import React from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';

// ============================================================
// 删除商品确认弹窗
// ============================================================
interface DeleteProductModalProps {
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteProductModal: React.FC<DeleteProductModalProps> = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-[#1A1A1A]/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-[2rem] p-6 w-full max-w-xs text-center shadow-2xl">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={32} className="text-rose-500"/></div>
            <h4 className="text-lg font-black text-[#1A1A1A] mb-2">确认删除商品?</h4>
            <p className="text-xs font-medium text-gray-500 mb-6">此操作将从供应目录中移除该商品，不可撤销。</p>
            <div className="grid grid-cols-2 gap-3">
                <button onClick={onCancel} className="py-3 bg-gray-50 font-bold rounded-xl text-xs text-gray-600 hover:bg-gray-100">取消</button>
                <button onClick={onConfirm} className="py-3 bg-rose-600 text-white font-bold rounded-xl text-xs shadow-lg hover:bg-rose-700">确认删除</button>
            </div>
        </div>
    </div>
);

// ============================================================
// 删除采购单确认弹窗
// ============================================================
interface DeletePOModalProps {
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeletePOModal: React.FC<DeletePOModalProps> = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-[#1A1A1A]/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-[2rem] p-6 w-full max-w-xs text-center shadow-2xl">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={32} className="text-rose-500"/></div>
            <h4 className="text-lg font-black text-[#1A1A1A] mb-2">删除采购单?</h4>
            <p className="text-xs font-medium text-gray-500 mb-6">仅删除记录，不会撤销已入库的库存数据。</p>
            <div className="grid grid-cols-2 gap-3">
                <button onClick={onCancel} className="py-3 bg-gray-50 font-bold rounded-xl text-xs text-gray-600 hover:bg-gray-100">取消</button>
                <button onClick={onConfirm} className="py-3 bg-rose-600 text-white font-bold rounded-xl text-xs shadow-lg hover:bg-rose-700">确认删除</button>
            </div>
        </div>
    </div>
);

// ============================================================
// 删除供应商确认弹窗
// ============================================================
interface DeleteSupplierModalProps {
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteSupplierModal: React.FC<DeleteSupplierModalProps> = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-[#1A1A1A]/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-[2rem] p-6 md:p-8 w-full max-w-sm text-center shadow-2xl">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={40} className="text-rose-500"/></div>
            <h4 className="text-xl font-black text-[#1A1A1A] mb-2">彻底删除供应商?</h4>
            <p className="text-sm font-medium text-gray-500 mb-6">
                此操作将删除该供应商及其所有关联产品目录。<br/>历史采购单不受影响，但无法再向其下单。
            </p>
            <div className="grid grid-cols-2 gap-4">
                <button onClick={onCancel} className="py-3.5 bg-gray-50 font-bold rounded-xl text-sm text-gray-600 hover:bg-gray-100">取消</button>
                <button onClick={onConfirm} className="py-3.5 bg-rose-600 text-white font-bold rounded-xl text-sm shadow-[0_4px_12px_rgba(225,29,72,0.3)] hover:bg-rose-700 active:scale-95">彻底删除</button>
            </div>
        </div>
    </div>
);
