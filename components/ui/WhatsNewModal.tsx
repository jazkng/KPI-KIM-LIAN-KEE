import React, { useState } from 'react';
import { X, Gift, Sparkles, Check, ChevronRight, Layers, Smartphone, Globe, Bot, ShieldCheck, ArrowRight, BookOpen } from 'lucide-react';
import { APP_VERSION, VERSION_HISTORY, SYSTEM_PHASES } from '../../constants/versionHistory';

interface WhatsNewModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState<'PHASES' | 'SPOTLIGHT' | 'CHANGELOG'>('PHASES');
    const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<string>('ALL');
    const [expandedPhaseId, setExpandedPhaseId] = useState<string>('PHASE_4');

    const filteredLogs = selectedPhaseFilter === 'ALL' 
        ? VERSION_HISTORY 
        : VERSION_HISTORY.filter(log => log.phaseId === selectedPhaseFilter);

    const currentPhase = SYSTEM_PHASES.find(p => p.status === 'CURRENT') || SYSTEM_PHASES[3];

    return (
        <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-3 md:p-4 backdrop-blur-sm animate-in zoom-in duration-300">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh] border border-stone-200">
                
                {/* Header with Dark Gold Aesthetic */}
                <div className="bg-gradient-to-r from-[#111111] to-[#262626] p-5 md:p-6 text-white relative overflow-hidden shrink-0 border-b-4 border-[#FFD200]">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-[#FFD200] opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                    <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5">
                            <div className="bg-[#FFD200] text-black p-3 rounded-2xl shadow-xl shrink-0 flex items-center justify-center min-w-[48px] min-h-[48px]">
                                <Gift size={28} strokeWidth={2.5}/>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="bg-[#FFD200] text-black text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                        演进中心 Evolution
                                    </span>
                                    <span className="text-xs font-black text-[#FFD200] bg-white/10 px-2 py-0.5 rounded-md font-mono">
                                        v{APP_VERSION}
                                    </span>
                                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                                        {currentPhase.titleZh.split('：')[0]}
                                    </span>
                                </div>
                                <h2 className="text-xl md:text-2xl font-black tracking-wide text-white">金莲记 ERP 阶段化演进架构</h2>
                                <p className="text-xs text-stone-400 font-medium mt-0.5">What's New in Kim Lian Kee Group ERP</p>
                            </div>
                        </div>

                        {/* Top Close Button for HIG Mobile Touch */}
                        <button 
                            onClick={onClose}
                            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
                            aria-label="Close"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 mt-5 overflow-x-auto scrollbar-hide pt-1 pb-1">
                        <button
                            onClick={() => setActiveTab('PHASES')}
                            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shrink-0 ${
                                activeTab === 'PHASES'
                                    ? 'bg-[#FFD200] text-black shadow-lg scale-102'
                                    : 'bg-white/10 text-stone-300 hover:bg-white/20'
                            }`}
                        >
                            <Layers size={16} />
                            <span>阶段演进路线图 ({SYSTEM_PHASES.length} 阶段)</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('SPOTLIGHT')}
                            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shrink-0 ${
                                activeTab === 'SPOTLIGHT'
                                    ? 'bg-[#FFD200] text-black shadow-lg scale-102'
                                    : 'bg-white/10 text-stone-300 hover:bg-white/20'
                            }`}
                        >
                            <Sparkles size={16} />
                            <span>阶段四亮点 (v2.0)</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('CHANGELOG')}
                            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shrink-0 ${
                                activeTab === 'CHANGELOG'
                                    ? 'bg-[#FFD200] text-black shadow-lg scale-102'
                                    : 'bg-white/10 text-stone-300 hover:bg-white/20'
                            }`}
                        >
                            <BookOpen size={16} />
                            <span>详细版本日志</span>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 bg-stone-50/50">
                    
                    {/* TAB 1: PHASES ROADMAP */}
                    {activeTab === 'PHASES' && (
                        <div className="space-y-4">
                            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3">
                                <div className="text-2xl shrink-0">🎯</div>
                                <div className="text-xs">
                                    <p className="font-black text-amber-900 mb-0.5">从阶段 1 到阶段 4 全流程升级就绪</p>
                                    <p className="text-amber-700 leading-relaxed font-medium">
                                        系统已完成“核心基座”、“供应链精细成本”及“数字董事会”演进，当前处于 <strong className="font-extrabold text-amber-950">阶段四 (iOS 移动 HIG / 三语 / Gemini AI)</strong> 运行状态。
                                    </p>
                                </div>
                            </div>

                            {/* Phase Cards Timeline */}
                            <div className="space-y-3">
                                {SYSTEM_PHASES.map((phase) => {
                                    const isCurrent = phase.status === 'CURRENT';
                                    const isExpanded = expandedPhaseId === phase.id;

                                    return (
                                        <div 
                                            key={phase.id}
                                            className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                                                isCurrent 
                                                    ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-md' 
                                                    : 'border-stone-200 hover:border-stone-300 shadow-sm'
                                            }`}
                                        >
                                            <button
                                                onClick={() => setExpandedPhaseId(isExpanded ? '' : phase.id)}
                                                className="w-full text-left p-4 min-h-[56px] flex items-center justify-between gap-3 active:bg-stone-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                                                        isCurrent ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'
                                                    }`}>
                                                        {phase.icon}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                                                                phase.status === 'CURRENT'
                                                                    ? 'bg-amber-500 text-white'
                                                                    : phase.status === 'COMPLETED'
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : 'bg-stone-100 text-stone-500'
                                                            }`}>
                                                                {phase.badge}
                                                            </span>
                                                            <span className="text-xs font-mono font-bold text-stone-400">{phase.period}</span>
                                                        </div>
                                                        <h3 className="font-black text-sm text-stone-900 truncate">
                                                            {phase.titleZh}
                                                        </h3>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <ChevronRight 
                                                        size={18} 
                                                        className={`text-stone-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-stone-900' : ''}`}
                                                    />
                                                </div>
                                            </button>

                                            {/* Phase Detail Section */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 pt-1 border-t border-stone-100 bg-stone-50/50 space-y-3">
                                                    <p className="text-xs font-medium text-stone-600 leading-relaxed bg-white p-3 rounded-xl border border-stone-200/60">
                                                        {phase.summary}
                                                    </p>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {phase.features.map((feat, fIdx) => (
                                                            <div key={fIdx} className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs flex items-start gap-2.5">
                                                                <span className="text-base shrink-0 mt-0.5">{feat.icon}</span>
                                                                <div>
                                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                                        <h4 className="text-xs font-extrabold text-stone-900">{feat.title}</h4>
                                                                        {feat.tag && (
                                                                            <span className="text-[9px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.2 rounded">
                                                                                {feat.tag}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[11px] text-stone-500 font-medium leading-normal">{feat.desc}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* TAB 2: PHASE 4 FEATURE SPOTLIGHT */}
                    {activeTab === 'SPOTLIGHT' && (
                        <div className="space-y-4">
                            <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl p-5 relative overflow-hidden shadow-lg border-b-2 border-amber-400">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles size={20} className="text-[#FFD200]" />
                                    <span className="text-xs font-black text-[#FFD200] uppercase tracking-wider">最新阶段核心重磅</span>
                                </div>
                                <h3 className="text-lg font-black text-white">阶段四：iOS HIG 移动端、三语架构与 Gemini AI</h3>
                                <p className="text-xs text-stone-300 mt-1 font-medium leading-relaxed">
                                    我们已重构核心前端交互与 AI 业务层，全面提升手机大拇指操作效率与跨国员工协同。
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {/* Feature 1: iOS & PWA */}
                                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 font-bold">
                                            <Smartphone size={20} />
                                        </div>
                                        <h4 className="font-black text-sm text-stone-900 mb-1">📱 iOS HIG & PWA 移动适配</h4>
                                        <p className="text-xs text-stone-600 font-medium leading-relaxed">
                                            适配安全区域 (`env(safe-area-inset-*)`)，所有按钮触控目标≥44px，单手大拇指底部 Tab 栏顺畅连招。
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold text-blue-600">
                                        <span>Apple HIG 规范</span>
                                        <span>100% 触控无障</span>
                                    </div>
                                </div>

                                {/* Feature 2: Multi-Lang */}
                                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 font-bold">
                                            <Globe size={20} />
                                        </div>
                                        <h4 className="font-black text-sm text-stone-900 mb-1">🌐 员工端三语控制台</h4>
                                        <p className="text-xs text-stone-600 font-medium leading-relaxed">
                                            完美覆盖 中文 (ZH)、英文 (EN)、缅甸语 (MY)，SOP、排班、考勤与提示卡一键语言翻译。
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold text-emerald-600">
                                        <span>ZH / EN / MY</span>
                                        <span>无缝沟通</span>
                                    </div>
                                </div>

                                {/* Feature 3: Gemini AI */}
                                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3 font-bold">
                                            <Bot size={20} />
                                        </div>
                                        <h4 className="font-black text-sm text-stone-900 mb-1">🤖 Gemini 2.5/Flash AI 诊断</h4>
                                        <p className="text-xs text-stone-600 font-medium leading-relaxed">
                                            提供 AI 损益 (P&L Advisor) 诊断、语音巡店问答以及发票照片智能识别入账。
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold text-purple-600">
                                        <span>Smart AI</span>
                                        <span>精准提效</span>
                                    </div>
                                </div>

                                {/* Feature 4: AP Automation */}
                                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 font-bold">
                                            <ShieldCheck size={20} />
                                        </div>
                                        <h4 className="font-black text-sm text-stone-900 mb-1">⚡ AP 8000+ 供应商映射</h4>
                                        <p className="text-xs text-stone-600 font-medium leading-relaxed">
                                            支持自动识别 8000+ 供应商库 (Evo Print, EK Fresh, Choi Seng, Restoran Noble 等)。
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold text-amber-600">
                                        <span>Auto Mapping</span>
                                        <span>精准对账</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: DETAILED CHANGELOG */}
                    {activeTab === 'CHANGELOG' && (
                        <div className="space-y-4">
                            {/* Filter Bar */}
                            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                                <span className="text-xs font-bold text-stone-400 shrink-0 mr-1">筛选阶段:</span>
                                <button
                                    onClick={() => setSelectedPhaseFilter('ALL')}
                                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                                        selectedPhaseFilter === 'ALL'
                                            ? 'bg-stone-900 text-white'
                                            : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                                    }`}
                                >
                                    全部阶段 ({VERSION_HISTORY.length})
                                </button>
                                {SYSTEM_PHASES.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedPhaseFilter(p.id)}
                                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                                            selectedPhaseFilter === p.id
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                                        }`}
                                    >
                                        阶段 {p.phaseNum}
                                    </button>
                                ))}
                            </div>

                            {/* Timeline List */}
                            <div className="space-y-4">
                                {filteredLogs.map((log, idx) => (
                                    <div key={log.version} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs relative">
                                        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-stone-100 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base font-black text-stone-900">v{log.version}</span>
                                                <span className="text-[10px] font-mono bg-stone-100 text-stone-500 px-2 py-0.5 rounded font-bold">
                                                    {log.date}
                                                </span>
                                                <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                                    {log.phaseName.split('：')[0]}
                                                </span>
                                            </div>
                                            {idx === 0 && selectedPhaseFilter === 'ALL' && (
                                                <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded font-black uppercase tracking-wider">
                                                    Latest
                                                </span>
                                            )}
                                        </div>

                                        <ul className="space-y-2">
                                            {log.changes.map((change, cIdx) => (
                                                <li key={cIdx} className="flex items-start gap-2.5 text-xs text-stone-700 font-medium leading-relaxed">
                                                    <span className="mt-0.5 text-emerald-600 shrink-0">
                                                        <Check size={14} strokeWidth={3} />
                                                    </span>
                                                    <span>{change}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer with HIG Button */}
                <div className="p-4 border-t border-stone-200 bg-white shrink-0 pb-safe">
                    <button 
                        onClick={onClose} 
                        className="w-full min-h-[52px] bg-[#111111] hover:bg-black text-[#FFD200] rounded-2xl font-black text-base shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <span>我明白了，开启 ERP 系统 (Got it)</span>
                        <ArrowRight size={18} />
                    </button>
                </div>

            </div>
        </div>
    );
};
