import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, Send, X, Sparkles, RefreshCw, User, MessageSquare, Terminal, AlertCircle, Play, 
    TrendingUp, Shield, BarChart3, HelpCircle, Mic, MicOff, Volume2
} from 'lucide-react';
import { DataManager } from '../../utils/dataManager';

interface AIAssistantProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
}

export const AIOperationsAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(false);
    const [systemContext, setSystemContext] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Voice recognition states
    const [isListening, setIsListening] = useState(false);
    const [micSupported, setMicSupported] = useState(true);
    const recognitionRef = useRef<any>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);

    // Initial Welcome Message
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: 'welcome',
                    role: 'assistant',
                    text: '您好！我是您的**御膳智控智能脑库**。当前已切换并深层对齐为「金莲记 Kepong 分店（Kim Lian Kee Kepong）」的餐饮财务专职智脑。我已安全接入您的 ERP 后台，可随时为您提供**餐饮账单对账**、**食材成本波动预警**、**免单合规稽查**、以及**前后台满勤及加班计提核算**。您可以直接输入或点击下方的快捷智能决策按钮开始盘查。',
                    timestamp: new Date()
                }
            ]);
        }
    }, [messages]);

    // Initialize Speech Recognition
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setMicSupported(false);
            return;
        }

        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'zh-CN';

        rec.onstart = () => {
            setIsListening(true);
        };

        rec.onresult = (event: any) => {
            const resultText = event.results[0][0].transcript;
            if (resultText) {
                setInput(prev => (prev.trim() + ' ' + resultText).trim());
            }
        };

        rec.onerror = (e: any) => {
            console.error("Speech Recognition Error:", e.error);
            if (e.error === 'not-allowed') {
                setError("麦克风使用权限已被拒绝，请在系统或浏览器设置中允许此网站录音。");
            } else {
                setError(`语音输入遇到问题: ${e.error}`);
            }
            setIsListening(false);
        };

        rec.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = rec;
    }, []);

    const toggleListening = () => {
        if (!micSupported || !recognitionRef.current) {
            alert("目前您的浏览器/设备暂不支持 Web 语音录入功能，请在 iOS Safari 14.5+ 或最新版的 Chrome 浏览器中尝试。");
            return;
        }

        setError(null);
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            try {
                recognitionRef.current.start();
            } catch (err) {
                console.error("Failed to start voice:", err);
                setIsListening(false);
            }
        }
    };

    // Gather Live System Data Context on Mount & Open
    const loadSystemContext = async () => {
        setDataLoading(true);
        setError(null);
        try {
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];

            // Aggregating core data collections concurrently
            const [
                kitchenStock,
                barStock,
                generalStock,
                rosterResponse,
                logs,
                treasury,
                transfers,
                settlements
            ] = await Promise.allSettled([
                DataManager.getStock('KITCHEN'),
                DataManager.getStock('BAR'),
                DataManager.getStock('GENERAL'),
                DataManager.getRosterData(),
                DataManager.getLogs(),
                DataManager.getTreasuryConfig(),
                DataManager.getFundTransfers(),
                DataManager.getSettlements()
            ]);

            const aggregatedContext: any = {
                fetchTime: new Date().toLocaleString(),
                currentDate: dateStr
            };

            // Format Inventory Data safely
            const inventory: any[] = [];
            if (kitchenStock.status === 'fulfilled') inventory.push(...kitchenStock.value.map(i => ({ ...i, category: '厨房' })));
            if (barStock.status === 'fulfilled') inventory.push(...barStock.value.map(i => ({ ...i, category: '吧台' })));
            if (generalStock.status === 'fulfilled') inventory.push(...generalStock.value.map(i => ({ ...i, category: '通用' })));
            
            aggregatedContext.inventory = {
                totalLineItems: inventory.length,
                lowStockItems: inventory.filter(i => i.currentQty <= (i.minLevel || 0)).map(i => ({
                    name: i.name,
                    category: i.category,
                    qty: i.currentQty,
                    unit: i.unit || '件',
                    min: i.minLevel || 0,
                    deficit: (i.minLevel || 0) - i.currentQty
                }))
            };

            // Format Treasury Data safely
            if (treasury.status === 'fulfilled' && treasury.value) {
                aggregatedContext.treasury = {
                    initialCash: treasury.value.initialCash || 0,
                    initialBank: treasury.value.initialBank || 0
                };
            }

            // Format Transfers
            if (transfers.status === 'fulfilled') {
                aggregatedContext.recentFundTransfers = transfers.value.slice(0, 10).map(t => ({
                    date: t.date,
                    amount: t.amount,
                    type: t.type,
                    note: t.note || '',
                    from: t.fromAccount,
                    to: t.toAccount
                }));
            }

            // Format Roster & Absence
            if (rosterResponse.status === 'fulfilled' && rosterResponse.value) {
                const todayRoster = rosterResponse.value.roster[dateStr] || {};
                const absentStaff: string[] = [];
                Object.entries(todayRoster).forEach(([empName, status]) => {
                    if (status === 'MC' || status === 'ABSENT' || status === 'LEAVE') {
                        absentStaff.push(`${empName} (${status})`);
                    }
                });
                aggregatedContext.attendance = {
                     absentCount: absentStaff.length,
                     absentPersonnel: absentStaff
                };
            }

            // Format Unchecked Logs safely
            if (logs.status === 'fulfilled') {
                const todayLogs = logs.value.filter(l => l.date === dateStr);
                const unreadLogs = todayLogs.filter(l => !l.acknowledgedBy);
                aggregatedContext.logs = {
                    todayTotal: todayLogs.length,
                    unreadCount: unreadLogs.length,
                    unreadList: unreadLogs.map(l => ({
                         reporter: l.creatorName || '匿名员工',
                         type: l.category,
                         text: `${l.issue || ''}${l.action ? '; 采取行动: ' + l.action : ''}`,
                         priority: l.priority || 'NORMAL'
                    }))
                };
            }

            // Format Daily Settlements safely for Gemini (查收入数据)
            if (settlements.status === 'fulfilled' && settlements.value) {
                aggregatedContext.dailySettlements = settlements.value.slice(0, 15).map(s => ({
                    date: s.date,
                    salesTotal: s.sales?.total || 0,
                    storeHubTotal: s.sales?.storeHubTotal || 0,
                    cashSales: s.sales?.cash || 0,
                    tngSales: s.sales?.tng || 0,
                    duitnowSales: s.sales?.duitnow || 0,
                    cardSales: s.sales?.card || 0,
                    refundTotal: s.sales?.refundTotal || 0,
                    variance: s.variance || 0,
                    varianceReason: s.varianceReason || '',
                    submittedBy: s.submittedBy || ''
                }));
            }

            setSystemContext(aggregatedContext);
        } catch (err: any) {
             console.error("Context gather failed", err);
             setError("系统运营数据采集失败，可尝试手动刷新。");
        } finally {
             setDataLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadSystemContext();
        }
    }, [isOpen]);

    useEffect(() => {
        // Scroll to bottom on updates
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = async (customMessage?: string) => {
        const textToSend = (customMessage || input).trim();
        if (!textToSend) return;

        if (!customMessage) setInput('');

        // 1. Add user message
        const userMsg: ChatMessage = {
            id: Math.random().toString(),
            role: 'user',
            text: textToSend,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            // Send to secure server proxy
            const response = await fetch("/api/gemini/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: textToSend,
                    contextData: systemContext,
                    previousMessages: messages.slice(-10).map(m => ({
                        role: m.role,
                        text: m.text
                    }))
                }),
            });

            if (!response.ok) {
                 const errResult = await response.json().catch(() => ({}));
                 throw new Error(errResult.error || `Server status ${response.status}`);
            }

            const data = await response.json();
            
            const assistantMsg: ChatMessage = {
                 id: Math.random().toString(),
                 role: 'assistant',
                 text: data.text || '助理未返回任何解答，请稍后再试。',
                 timestamp: new Date()
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            console.error("AI Assistant Error:", err);
            const errModelMsg: ChatMessage = {
                 id: Math.random().toString(),
                 role: 'assistant',
                 text: `⚠️ **连接错误**: ${err.message || "无法联系 AI 决策端，请确认后端部署正常并配置了 GEMINI_API_KEY。"}`,
                 timestamp: new Date()
            };
            setMessages(prev => [...prev, errModelMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handlePreset = (presetText: string) => {
        handleSend(presetText);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/92 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xl animate-in fade-in duration-300">
            
            {/* Modal Body Container with High-End Glassmorphism and Fine Gold-Trim Edge */}
            <div className="bg-[#0E0E10]/95 w-full sm:max-w-xl h-[95vh] sm:h-[85vh] sm:rounded-3xl rounded-t-[2rem] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.15)] relative border-t border-stone-800/80 sm:border border-stone-800/70 text-stone-100 font-sans">
                
                {/* Visual Accent Glow Top-Right */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFD700]/5 rounded-full blur-3xl pointer-events-none z-0"></div>

                {/* Header Section */}
                <div 
                    style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} 
                    className="bg-stone-900/60 backdrop-blur-md border-b border-stone-850/60 px-5 pb-4 flex justify-between items-center shrink-0 relative z-10"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-tr from-[#3a3518] to-[#1a180f] p-2.5 rounded-2xl border border-[#FFD700]/35 shadow-inner">
                            <Bot className="text-[#FFD700] animate-pulse" size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-white text-base tracking-wide">AI 智控脑库</h3>
                                <span className="bg-gradient-to-r from-stone-700 to-stone-850 text-[#FFD700] text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm border border-[#FFD700]/30 font-mono">BETA</span>
                            </div>
                            <p className="text-[10px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                {dataLoading ? 'SYNCING DATABASE...' : 'REAL-TIME ERP SECURED'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={loadSystemContext}
                            style={{ minWidth: '44px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                            className="w-11 h-11 flex items-center justify-center bg-stone-850/60 hover:bg-stone-800 active:scale-95 text-stone-400 hover:text-[#FFD700] border border-stone-800/50 rounded-full transition-all"
                            title="重新同步最新业务数据"
                            disabled={dataLoading}
                        >
                            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin text-[#FFD700]' : ''}`} />
                        </button>
                        <button 
                            onClick={onClose}
                            style={{ minWidth: '44px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                            className="w-11 h-11 flex items-center justify-center bg-stone-850/60 hover:bg-stone-800 active:scale-95 text-stone-400 hover:text-white border border-stone-800/50 rounded-full transition-all"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Database Sync Status Indicator */}
                <div className="bg-[#050506] px-5 py-2 text-[10px] text-stone-500 font-mono flex items-center justify-between border-b border-stone-900/40 shrink-0 select-none relative z-10">
                    <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${systemContext ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`}></span>
                        数据中心连通性: {systemContext ? `${systemContext.fetchTime}` : '等候校准...'}
                    </span>
                    <span className="text-[#FFD700]/70 font-bold">Gemini 智力引擎 active 🌐</span>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="p-3 bg-red-950/45 border-b border-red-900/50 text-red-400 text-xs flex items-center gap-2 shrink-0 relative z-10 animate-slide-in">
                        <AlertCircle className="shrink-0" size={14} />
                        <span className="font-semibold">{error}</span>
                    </div>
                )}

                {/* Message Log Canvas */}
                <div className="flex-grow overflow-y-auto p-5 space-y-5 bg-stone-950/30 relative z-10">
                    {messages.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={`flex gap-3 max-w-[88%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                        >
                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border shadow-md transition-all ${
                                msg.role === 'user' 
                                  ? 'bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/20' 
                                  : 'bg-stone-900 text-stone-300 border-stone-800'
                            }`}>
                                {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                            </div>

                            {/* Text Body */}
                            <div className="flex flex-col space-y-1">
                                <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-lg ${
                                    msg.role === 'user'
                                      ? 'bg-gradient-to-r from-[#FFD700] to-[#E5A93C] text-black font-extrabold rounded-tr-none'
                                      : 'bg-stone-900/90 border border-stone-850/85 text-stone-100 rounded-tl-none whitespace-pre-wrap'
                                }`}>
                                    {/* Handle bold text markdown manually with high-contrast formatting */}
                                    {msg.text.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} className={`font-black ${msg.role === 'user' ? 'text-black underline decoration-stone-900' : 'text-[#FFD700]'}`}>{part}</strong> : part)}
                                </div>
                                <span className={`text-[9px] font-mono select-none px-1.5 ${msg.role === 'user' ? 'text-right text-stone-600' : 'text-stone-500'}`}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}

                    {/* AI Loading indicator */}
                    {loading && (
                        <div className="flex gap-3 max-w-[85%] mr-auto items-center animate-pulse">
                            <div className="w-9 h-9 rounded-2xl bg-stone-900 text-stone-300 border border-stone-800 flex items-center justify-center shrink-0">
                                <Bot size={15} className="animate-spin text-[#FFD700]" />
                            </div>
                            <div className="bg-stone-900 border border-stone-850 text-stone-400 text-xs px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                <Sparkles size={13} className="text-[#FFD700] animate-bounce" />
                                <span className="font-medium">智脑正在秒级调度实时账单与库存数据，思考中...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Preset Fast Actions / Suggestion Widgets (THUMB PRESETS) */}
                {!loading && (
                    <div className="px-5 py-3 bg-[#0E0E10] border-t border-stone-900 shrink-0 select-none relative z-10">
                        <div className="flex items-center gap-1.5 mb-2 px-0.5">
                            <Sparkles size={12} className="text-[#FFD700]" />
                            <span className="text-[10px] uppercase font-bold text-stone-400 tracking-widest block">智能决策预设 (Thumb actions)</span>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-none snap-x">
                            <button
                                onClick={() => handlePreset('📊 帮我盘点今日营收与差额，对比POS系统原始流水与各银行及外卖平台 GrabFood / Foodpanda 真实的 Net Payout 净进账')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1E2E24] active:scale-95 text-xs text-emerald-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                📊 今日营收与对账摘要
                            </button>
                            <button
                                onClick={() => handlePreset('📉 检查最近30天内后厨核心原材料价格波动状况，并评估招牌菜品（如福建面、月光河）在堂食与外卖单盘的边际贡献率（净利润）')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#2A2020] active:scale-95 text-xs text-rose-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                📉 食材成本波动预警
                            </button>
                            <button
                                onClick={() => handlePreset('🔍 智能交叉审计：审阅店长今天运营日志里的记录（如砂锅打碎、免单、赔偿等），并与财务流水中的免单退款进行合规对账')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1A2835] active:scale-95 text-xs text-sky-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                🔍 免单与日志财务稽查
                            </button>
                            <button
                                onClick={() => handlePreset('👥 检查前台、后厨及外籍员工的工时与加班满勤计提状况。同时，算算EPF、SOCSO、EIS，并说明在OPEX日常纯利润中如何独立割除“分红(Dividend)”与“押金(Deposit)”以保持隔离')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1A2534] active:scale-95 text-xs text-indigo-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                👥 前后台薪资与计提核算
                            </button>
                        </div>
                    </div>
                )}

                {/* Input Tray Block with iOS Safe Area support */}
                <div 
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }} 
                    className="p-4 bg-stone-900 border-t border-stone-850 shrink-0 relative z-20"
                >
                    {/* Floating Audio Recording Wave Indicator Overlay */}
                    {isListening && (
                        <div className="absolute left-1/2 -translate-x-1/2 -top-16 bg-stone-950 border border-[#FFD700]/30 shadow-2xl backdrop-blur-md rounded-full px-5 py-2.5 flex items-center gap-3 animate-bounce">
                            <span className="relative flex h-3 w-3 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFD700] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FFD700]"></span>
                            </span>
                            <div className="flex gap-0.5 items-center justify-center px-1">
                                <span className="w-1 h-3 bg-[#FFD700] rounded-full animate-pulse inline-block"></span>
                                <span className="w-1 h-5 bg-[#FFD700] rounded-full animate-pulse inline-block delay-75"></span>
                                <span className="w-1 h-2 bg-[#FFD700] rounded-full animate-pulse inline-block delay-150"></span>
                                <span className="w-1 h-6 bg-[#FFD700] rounded-full animate-pulse inline-block delay-200"></span>
                                <span className="w-1 h-3 bg-[#FFD700] rounded-full animate-pulse inline-block delay-300"></span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-[#FFD700] font-black tracking-widest uppercase">语音聆听中 | 说完请再点麦克风结束 </p>
                        </div>
                    )}

                    <div className="flex items-center gap-2.5 bg-[#050506] border border-stone-800/70 rounded-2xl p-2 shadow-inner">
                        <Terminal size={14} className="text-[#FFD705] shrink-0 ml-1.5" />
                        
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={isListening ? "话筒静候中..." : "提问例如: 本月库存缺口最大的是什么？"}
                            disabled={loading || isListening}
                            className="bg-transparent flex-grow font-extrabold text-xs sm:text-sm text-stone-100 outline-none placeholder:text-stone-600 py-1"
                        />

                        {/* HIGH-GRADE TRANSCRIPTION MICROPHONE BUTTON FOR iOS / MOBILE */}
                        {micSupported ? (
                            <button
                                onClick={toggleListening}
                                style={{ minWidth: '44px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all border shrink-0 ${
                                    isListening 
                                      ? 'bg-rose-500 border-rose-400 text-white animate-pulse shadow-lg shadow-rose-500/20' 
                                      : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-white hover:border-[#FFD700]/30 hover:bg-[#FFD700]/5'
                                }`}
                                title={isListening ? "停止麦克风" : "立即语音录入提问"}
                            >
                                <Mic size={18} />
                            </button>
                        ) : (
                            <div 
                                className="w-9 h-9 flex items-center justify-center text-stone-700 select-none border border-transparent"
                                title="此设备暂不支持Web Speech录音"
                            >
                                <MicOff size={16} />
                            </div>
                        )}

                        <button
                            onClick={() => handleSend()}
                            disabled={loading || !input.trim() || isListening}
                            style={{ minWidth: '44px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                            className={`w-11 h-11 rounded-xl font-bold text-xs flex items-center justify-center transition-all mr-0.5 shrink-0 ${
                                input.trim() && !isListening
                                  ? 'bg-gradient-to-r from-[#FFD700] to-[#E5A93C] text-black hover:brightness-110 active:scale-95' 
                                  : 'bg-stone-900 border border-stone-800 text-stone-600 cursor-not-allowed'
                            }`}
                        >
                            <Send size={15} />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

