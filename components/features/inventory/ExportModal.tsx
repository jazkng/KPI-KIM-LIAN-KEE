import React from 'react';
// 新增: 引入 Table 图标用于 Excel 按钮
import { X, Printer, FileDown, Loader2, CheckSquare, Square, Table } from 'lucide-react'; 

// 新增: 直接定义四大主区域的正确名称，替换掉你原本 CATEGORY_SECTIONS 导致的 Bug
const MAIN_VIEW_LABELS: Record<string, string> = {
    KITCHEN: '厨房 (Kitchen)',
    BAR: '水吧 (Bar)',
    GENERAL: '后勤 (General)',
    FUEL: '燃料 (Fuel)'
};

interface ExportConfig {
    categories: { KITCHEN: boolean; BAR: boolean; GENERAL: boolean; FUEL: boolean };
    showCost: boolean;
    lowStockOnly: boolean;
}

interface ExportModalProps {
    exportConfig: ExportConfig;
    isGeneratingPdf: boolean;
    isGeneratingExcel?: boolean; // 新增: Excel 生成状态
    onCategoryToggle: (key: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL') => void;
    onConfigChange: (config: ExportConfig) => void;
    onExport: () => void;
    onExportExcel?: () => void; // 新增: Excel 导出触发器
    onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
    exportConfig, isGeneratingPdf, isGeneratingExcel, onCategoryToggle, onConfigChange, onExport, onExportExcel, onClose
}) => {
    // 提取公共禁用状态
    const isExportDisabled = !Object.values(exportConfig.categories).some(Boolean) || isGeneratingPdf || isGeneratingExcel;

    return (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 border-t-8 border-[#1A1A1A]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-xl text-[#1A1A1A] flex items-center gap-2"><Printer size={20}/> 导出库存报表</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                </div>

                <div className="space-y-6 mb-6">
                    <div>
                        <label className="text-xs font-black text-gray-400 uppercase mb-3 block">选择导出区域 (Categories)</label>
                        <div className="space-y-2">
                            {Object.entries(exportConfig.categories).map(([key, checked]) => (
                                <div key={key} onClick={() => onCategoryToggle(key as 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL')}
                                    className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-300'}`}>
                                    {/* 替换: 使用正确的名称映射表解决生鲜/茶叶的显示 Bug */}
                                    <span className="font-bold text-sm text-[#1A1A1A]">{MAIN_VIEW_LABELS[key] || key} 区域</span>
                                    {checked ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20} className="text-gray-300"/>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase mb-1 block">高级选项 (Options)</label>
                        <div onClick={() => onConfigChange({...exportConfig, showCost: !exportConfig.showCost})}
                            className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${exportConfig.showCost ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-300'}`}>
                            <div>
                                <span className="font-bold text-sm text-[#1A1A1A]">显示成本与价值 (Show Value)</span>
                                <p className="text-[10px] text-gray-500 mt-0.5">适合财务/老板查阅</p>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${exportConfig.showCost ? 'bg-green-500' : 'bg-gray-300'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${exportConfig.showCost ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <div onClick={() => onConfigChange({...exportConfig, lowStockOnly: !exportConfig.lowStockOnly})}
                            className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${exportConfig.lowStockOnly ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-300'}`}>
                            <div>
                                <span className="font-bold text-sm text-[#1A1A1A]">仅导出缺货 (Low Stock Only)</span>
                                <p className="text-[10px] text-gray-500 mt-0.5">适合快速补货</p>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${exportConfig.lowStockOnly ? 'bg-red-500' : 'bg-gray-300'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${exportConfig.lowStockOnly ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 替换: 将原本的一个按钮，切分成左右两个按钮（Excel / PDF） */}
                <div className="flex gap-2">
                    <button onClick={onExportExcel} disabled={isExportDisabled}
                        className="flex-1 py-4 bg-[#10B981] text-white rounded-2xl font-black text-sm shadow-lg hover:bg-[#059669] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100">
                        {isGeneratingExcel ? <Loader2 size={20} className="animate-spin"/> : <Table size={20}/>} 
                        导出 Excel
                    </button>

                    <button onClick={onExport} disabled={isExportDisabled}
                        className="flex-1 py-4 bg-[#1A1A1A] text-[#FFD700] rounded-2xl font-black text-sm shadow-lg hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100">
                        {isGeneratingPdf ? <Loader2 size={20} className="animate-spin"/> : <FileDown size={20}/>} 
                        导出 PDF
                    </button>
                </div>

            </div>
        </div>
    );
};