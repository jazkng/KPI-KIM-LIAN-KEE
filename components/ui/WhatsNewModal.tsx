
import React from 'react';
import { X, Gift, BookOpen, Check, Printer, Filter, EyeOff } from 'lucide-react';
import { APP_VERSION, VERSION_HISTORY } from '../../constants/versionHistory';

interface WhatsNewModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const latestUpdate = VERSION_HISTORY.find(v => v.version === APP_VERSION);

    return (
        <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header with flashy background */}
                <div className="bg-gradient-to-r from-[#1A1A1A] to-[#2A2A2A] p-6 text-white relative overflow-hidden shrink-0 border-b-4 border-[#FFD700]">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFD700] opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                    <div className="relative z-10 flex items-start gap-4">
                        <div className="bg-[#FFD700] text-black p-3 rounded-2xl shadow-lg animate-bounce">
                            <Gift size={32} strokeWidth={2.5}/>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-[#FFD700] text-black text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">New Update</span>
                                <span className="text-sm font-bold text-gray-400">v{APP_VERSION}</span>
                            </div>
                            <h2 className="text-2xl font-black tracking-wide">系统更新已就绪!</h2>
                            <p className="text-xs text-gray-400 font-medium mt-1">What's New in Kim Lian Kee ERP</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-y-auto p-6 space-y-6">
                    
                    {/* 1. Feature Spotlight (Visual Guide for PDF) */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-4">
                            <BookOpen size={18} className="text-blue-600"/>
                            <h3 className="font-black text-blue-800 text-sm uppercase tracking-widest">新功能教学 (Feature Spotlight)</h3>
                        </div>
                        
                        <div className="space-y-4">
                            <h4 className="text-lg font-black text-[#1A1A1A]">🖨️ 如何使用“库存 PDF 高级导出”?</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-gray-500">1</div>
                                    <p className="text-xs font-bold text-gray-700">进入库存总览</p>
                                    <p className="text-[10px] text-gray-400 mt-1">点击 Master 模式右上角的 <Printer size={10} className="inline"/> 按钮</p>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-gray-500">2</div>
                                    <p className="text-xs font-bold text-gray-700">配置导出选项</p>
                                    <div className="flex justify-center gap-1 mt-1">
                                        <Filter size={10} className="text-blue-500"/>
                                        <EyeOff size={10} className="text-red-500"/>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">勾选部门 / 隐藏金额</p>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-gray-500">3</div>
                                    <p className="text-xs font-bold text-gray-700">下载 PDF</p>
                                    <p className="text-[10px] text-gray-400 mt-1">系统自动排版 A4 并下载</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Changelog List */}
                    <div>
                        <h3 className="font-black text-sm text-gray-400 uppercase tracking-widest mb-3">详细更新日志 (Changelog)</h3>
                        <div className="space-y-3">
                            {latestUpdate?.changes.map((change, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="mt-0.5 bg-green-100 text-green-600 rounded-full p-1 shrink-0">
                                        <Check size={12} strokeWidth={3}/>
                                    </div>
                                    <p className="text-xs font-bold text-gray-700 leading-relaxed">{change}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-white shrink-0">
                    <button 
                        onClick={onClose} 
                        className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black transition-transform active:scale-[0.98]"
                    >
                        我明白了，开始使用 (Got it)
                    </button>
                </div>

            </div>
        </div>
    );
};
