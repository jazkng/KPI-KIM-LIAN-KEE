import React, { useState } from 'react';
import { X, FileSpreadsheet, FileText, Settings, HelpCircle, Download } from 'lucide-react';

interface RosterExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExportExcel: (options: ExportOptions) => void;
    onExportPdf: (options: ExportOptions) => void;
    monthKey: string;
}

export interface ExportOptions {
    showEmployeeId: boolean;
    showSignatures: boolean;
    includeLegend: boolean;
    isLandscape: boolean;
}

export const RosterExportModal: React.FC<RosterExportModalProps> = ({
    isOpen,
    onClose,
    onExportExcel,
    onExportPdf,
    monthKey
}) => {
    const [options, setOptions] = useState<ExportOptions>({
        showEmployeeId: true,
        showSignatures: true,
        includeLegend: true,
        isLandscape: true
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Settings className="text-gray-900" size={18} />
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">排班导出中心 (Export Hub)</h3>
                            <p className="text-xs text-gray-400 font-mono">月份: {monthKey}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                        id="close-export-modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content / Options */}
                <div className="p-6 space-y-5">
                    <p className="text-xs text-gray-400 leading-relaxed">
                        请配置您导出的 PDF 报表与 Excel 工作簿的属性：
                    </p>

                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        {/* Show employee ID */}
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={options.showEmployeeId}
                                onChange={(e) => setOptions({ ...options, showEmployeeId: e.target.checked })}
                                className="w-4.5 h-4.5 text-[#FFD200] rounded focus:ring-2 focus:ring-[#FFD200] border-gray-300 transition-all accent-gray-900"
                                id="chk-show-emp-id"
                            />
                            <div>
                                <p className="text-xs font-bold text-gray-800">显示员工编号 (Show Employee ID)</p>
                                <p className="text-[10px] text-gray-400">在报表第一列显示 3 位工号，方便薪资审计</p>
                            </div>
                        </label>

                        {/* Show Signature blocks */}
                        <label className="flex items-center gap-3 cursor-pointer select-none pt-2 border-t border-gray-100">
                            <input
                                type="checkbox"
                                checked={options.showSignatures}
                                onChange={(e) => setOptions({ ...options, showSignatures: e.target.checked })}
                                className="w-4.5 h-4.5 text-[#FFD200] rounded focus:ring-2 focus:ring-[#FFD200] border-gray-300 transition-all accent-gray-900"
                                id="chk-show-signatures"
                            />
                            <div>
                                <p className="text-xs font-bold text-gray-800">绘制签字落款栏 (Signature Block)</p>
                                <p className="text-[10px] text-gray-400">在底部渲染 [编制人]、[复核人] 与 [批准人] 的签字虚线</p>
                            </div>
                        </label>

                        {/* Include Legends */}
                        <label className="flex items-center gap-3 cursor-pointer select-none pt-2 border-t border-gray-100">
                            <input
                                type="checkbox"
                                checked={options.includeLegend}
                                onChange={(e) => setOptions({ ...options, includeLegend: e.target.checked })}
                                className="w-4.5 h-4.5 text-[#FFD200] rounded focus:ring-2 focus:ring-[#FFD200] border-gray-300 transition-all accent-gray-900"
                                id="chk-include-legend"
                            />
                            <div>
                                <p className="text-xs font-bold text-gray-800">附加班次与状态说明 (Roster Legend)</p>
                                <p className="text-[10px] text-gray-400">附带 W-常规, OFF-休息, MC-病假 等缩写中英文对照</p>
                            </div>
                        </label>
                    </div>

                    {/* Export Action Grid */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        {/* Excel */}
                        <button
                            type="button"
                            onClick={() => {
                                onExportExcel(options);
                                onClose();
                            }}
                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 text-xs font-bold gap-2 transition-all group hover:scale-[1.02]"
                            style={{ minHeight: '90px' }}
                            id="export-excel-submit"
                        >
                            <FileSpreadsheet className="text-emerald-600 group-hover:scale-110 transition-transform" size={28} />
                            <span>导出 Excel 电子表</span>
                        </button>

                        {/* PDF */}
                        <button
                            type="button"
                            onClick={() => {
                                onExportPdf(options);
                                onClose();
                            }}
                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-800 text-xs font-bold gap-2 transition-all group hover:scale-[1.02]"
                            style={{ minHeight: '90px' }}
                            id="export-pdf-submit"
                        >
                            <FileText className="text-red-600 group-hover:scale-110 transition-transform" size={28} />
                            <span>导出 高清 PDF (A3)</span>
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                        style={{ minHeight: '44px' }}
                    >
                        关闭 (Close)
                    </button>
                </div>
            </div>
        </div>
    );
};
