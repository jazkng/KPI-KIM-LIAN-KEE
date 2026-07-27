import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, Send, X, Sparkles, RefreshCw, User, Terminal, AlertCircle, Mic, MicOff, Lock
} from 'lucide-react';
import { DataManager } from '../../utils/dataManager';
import { getMalaysiaDateString } from '../../utils/dateHelper';

function normalizeInventoryForAI(item: any) {
  const currentQtyBase = Number(
    item.currentQtyBase ??
    item.currentQty ??
    0
  );

  const minLevelBase = Number(
    item.minLevelBase ??
    item.minLevel ??
    0
  );

  const maxQtyBase = Number(
    item.maxQtyBase ??
    item.maxQty ??
    0
  );

  const baseUnit =
    item.baseUnit ??
    item.unit ??
    'unit';

  const displayToBaseRatio = Number(
    item.displayToBaseRatio ??
    1
  );

  const safeDisplayRatio =
    displayToBaseRatio > 0
      ? displayToBaseRatio
      : 1;

  const displayUnit =
    item.displayUnit ??
    baseUnit;

  const currentQtyDisplay =
    currentQtyBase / safeDisplayRatio;

  return {
    id: item.id,
    name: item.name,
    category: item.category,

    currentQtyBase,
    minLevelBase,
    maxQtyBase,
    baseUnit,

    currentQtyDisplay,
    displayUnit,
    displayToBaseRatio: safeDisplayRatio,

    isLowStock:
      currentQtyBase <= minLevelBase,

    deficitBase:
      Math.max(
        0,
        minLevelBase - currentQtyBase
      ),
  };
}

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
                    text: '您好！我是您的 **AI 经营助手**。\n\n我可以根据当前已接入的数据，协助检查：\n\n• 今日营业与结算摘要\n• 厨房、吧台及通用库存\n• 低库存与安全库存风险\n• 当日日志及异常记录\n• 最近资金转账记录\n\n尚未接入的分析会明确标记为“待接入”，不会推测或编造金额。',
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
            const dateStr = getMalaysiaDateString();

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
            
            const normalizedInventory = inventory.map(normalizeInventoryForAI);

            aggregatedContext.inventory = {
                totalLineItems: normalizedInventory.length,
                lowStockItems: normalizedInventory.filter(i => i.isLowStock).map(i => ({
                    name: i.name,
                    category: i.category,
                    currentQtyBase: i.currentQtyBase,
                    minLevelBase: i.minLevelBase,
                    baseUnit: i.baseUnit,
                    currentQtyDisplay: i.currentQtyDisplay,
                    displayUnit: i.displayUnit,
                    displayToBaseRatio: i.displayToBaseRatio,
                    isLowStock: i.isLowStock,
                    deficitBase: i.deficitBase
                })),
                allNormalizedItems: normalizedInventory.map(i => ({
                    name: i.name,
                    category: i.category,
                    currentQtyBase: i.currentQtyBase,
                    minLevelBase: i.minLevelBase,
                    baseUnit: i.baseUnit,
                    currentQtyDisplay: i.currentQtyDisplay,
                    displayUnit: i.displayUnit,
                    displayToBaseRatio: i.displayToBaseRatio,
                    isLowStock: i.isLowStock,
                    deficitBase: i.deficitBase
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
                const recentSettlements = [...settlements.value]
                    .sort((a, b) => {
                        const dateA = a.date ? String(a.date) : (a.createdAt ? String(a.createdAt) : '');
                        const dateB = b.date ? String(b.date) : (b.createdAt ? String(b.createdAt) : '');
                        return dateB.localeCompare(dateA);
                    })
                    .slice(0, 30);

                aggregatedContext.dailySettlements = recentSettlements.map(s => ({
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
        <div className="fixed inset-0 bg-black/92 z-[300] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xl animate-in fade-in duration-300">
            
            {/* Modal Body Container with High-End Glassmorphism and Fine Gold-Trim Edge */}
            <div className="bg-[#0E0E10]/95 w-full md:max-w-xl h-[95vh] md:h-[85vh] md:rounded-3xl rounded-t-[2rem] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(255,210,0,0.15)] relative border-t border-stone-800/80 md:border border-stone-800/70 text-stone-100 font-sans">
                
                {/* Visual Accent Glow Top-Right */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFD200]/5 rounded-full blur-3xl pointer-events-none z-0"></div>

                {/* Header Section */}
                <div 
                    style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} 
                    className="bg-stone-900/60 backdrop-blur-md border-b border-stone-900/60 px-5 pb-4 flex justify-between items-center shrink-0 relative z-10"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-tr from-[#3a3518] to-[#1a180f] p-2.5 rounded-2xl border border-[#FFD200]/35 shadow-inner">
                            <Bot className="text-[#FFD200] animate-pulse" size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-white text-base tracking-wide">AI 智控脑库</h3>
                                <span className="bg-gradient-to-r from-stone-700 to-stone-900 text-[#FFD200] text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm border border-[#FFD200]/30 font-mono">BETA</span>
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
                            className="w-11 h-11 flex items-center justify-center bg-stone-900/60 hover:bg-stone-800 active:scale-95 text-stone-400 hover:text-[#FFD200] border border-stone-800/50 rounded-full transition-all"
                            title="重新同步最新业务数据"
                            disabled={dataLoading}
                        >
                            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin text-[#FFD200]' : ''}`} />
                        </button>
                        <button 
                            onClick={onClose}
                            style={{ minWidth: '44px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                            className="w-11 h-11 flex items-center justify-center bg-stone-900/60 hover:bg-stone-800 active:scale-95 text-stone-400 hover:text-white border border-stone-800/50 rounded-full transition-all"
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
                    <span className="text-[#FFD200]/70 font-bold">Gemini 智力引擎 active 🌐</span>
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
                    {/* Data Sync Status Card */}
                    <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl p-4 shadow-md space-y-3 mb-4 shrink-0">
                        <div className="flex items-center justify-between border-b border-stone-800/50 pb-2">
                            <span className="text-xs font-black text-stone-200 tracking-wide flex items-center gap-1.5">
                                <Sparkles size={14} className="text-[#FFD200]" />
                                经营脑库数据接入状态
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">Sync Status</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[11px] leading-relaxed">
                            <div>
                                <span className="text-[9px] text-emerald-400 font-bold block mb-1 uppercase tracking-wider">✓ 已接入 (Active)</span>
                                <ul className="space-y-0.5 text-stone-300 font-medium">
                                    <li className="flex items-center gap-1 text-emerald-500">
                                        ✓ <span className="text-stone-300">库存数据</span>
                                    </li>
                                    <li className="flex items-center gap-1 text-emerald-500">
                                        ✓ <span className="text-stone-300">每日结算</span>
                                    </li>
                                    <li className="flex items-center gap-1 text-emerald-500">
                                        ✓ <span className="text-stone-300">运营日志</span>
                                    </li>
                                    <li className="flex items-center gap-1 text-emerald-500">
                                        ✓ <span className="text-stone-300">当日排班</span>
                                    </li>
                                    <li className="flex items-center gap-1 text-emerald-500">
                                        ✓ <span className="text-stone-300">最近资金转账</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="border-l border-stone-800/60 pl-3">
                                <span className="text-[9px] text-stone-500 font-bold block mb-1 uppercase tracking-wider">○ 待接入 (Pending)</span>
                                <ul className="space-y-0.5 text-stone-500 font-medium">
                                    <li className="flex items-center gap-1">
                                        <Lock size={10} /> 采购价格历史
                                    </li>
                                    <li className="flex items-center gap-1">
                                        <Lock size={10} /> 菜谱与菜品毛利
                                    </li>
                                    <li className="flex items-center gap-1">
                                        <Lock size={10} /> 外卖平台净入账
                                    </li>
                                    <li className="flex items-center gap-1">
                                        <Lock size={10} /> 薪资及法定缴纳
                                    </li>
                                    <li className="flex items-center gap-1">
                                        <Lock size={10} /> 应付账款
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {messages.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={`flex gap-3 max-w-[88%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                        >
                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border shadow-md transition-all ${
                                msg.role === 'user' 
                                  ? 'bg-[#FFD200]/10 text-[#FFD200] border-[#FFD200]/20' 
                                  : 'bg-stone-900 text-stone-300 border-stone-800'
                            }`}>
                                {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                            </div>

                            {/* Text Body */}
                            <div className="flex flex-col space-y-1">
                                <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-lg ${
                                    msg.role === 'user'
                                      ? 'bg-gradient-to-r from-[#FFD200] to-[#E5A93C] text-black font-extrabold rounded-tr-none'
                                      : 'bg-stone-900/90 border border-stone-900/85 text-stone-100 rounded-tl-none whitespace-pre-wrap'
                                }`}>
                                    {/* Handle bold text markdown manually with high-contrast formatting */}
                                    {msg.text.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} className={`font-black ${msg.role === 'user' ? 'text-black underline decoration-stone-900' : 'text-[#FFD200]'}`}>{part}</strong> : part)}
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
                                <Bot size={15} className="animate-spin text-[#FFD200]" />
                            </div>
                            <div className="bg-stone-900 border border-stone-900 text-stone-400 text-xs px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                <Sparkles size={13} className="text-[#FFD200] animate-bounce" />
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
                            <Sparkles size={12} className="text-[#FFD200]" />
                            <span className="text-[10px] uppercase font-bold text-stone-400 tracking-widest block">智能决策预设 (Thumb actions)</span>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-none snap-x">
                            <button
                                onClick={() => handlePreset('📊 帮我分析今日的餐饮经营与对账，检查营业额（salesTotal）与各结算方式对账状况。')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1E2E24] active:scale-95 text-xs text-emerald-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                📊 今日经营与对账摘要
                            </button>
                            <button
                                onClick={() => handlePreset('📉 请帮我检查当前的库存数据，列出低于安全库存（minLevelBase）的低库存项，并以基础单位（Base Unit）进行计算。')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1E252E] active:scale-95 text-xs text-amber-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                📉 低库存精准检查
                            </button>
                            <button
                                onClick={() => handlePreset('🔍 检查今天的运营日志，交叉稽查当日是否发生任何异常、投诉或免单记录。')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1A2835] active:scale-95 text-xs text-sky-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                🔍 当日日志异常检查
                            </button>
                            <button
                                onClick={() => handlePreset('💰 总结分析最近的资金转账流水和账户余额。')}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900 hover:bg-[#1A2534] active:scale-95 text-xs text-indigo-300 font-extrabold px-3.5 py-2 rounded-xl border border-stone-800/80 font-medium transition-all"
                            >
                                💰 资金与转账摘要
                            </button>

                            {/* Disabled/Pending Buttons */}
                            <button
                                onClick={() => setError("此分析需要先接入「采购价格历史数据」，目前暂未开放。")}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900/40 text-stone-600 text-xs px-3.5 py-2 rounded-xl border border-stone-900 flex items-center gap-1 cursor-not-allowed transition-all"
                            >
                                <Lock size={10} /> 成本波动 · 待接入
                            </button>
                            <button
                                onClick={() => setError("此分析需要先接入「菜谱配比与菜品售价」，目前暂未开放。")}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900/40 text-stone-600 text-xs px-3.5 py-2 rounded-xl border border-stone-900 flex items-center gap-1 cursor-not-allowed transition-all"
                            >
                                <Lock size={10} /> 菜品毛利 · 待接入
                            </button>
                            <button
                                onClick={() => setError("此分析需要先接入「GrabFood/Foodpanda 实际结算单」，目前暂未开放。")}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900/40 text-stone-600 text-xs px-3.5 py-2 rounded-xl border border-stone-900 flex items-center gap-1 cursor-not-allowed transition-all"
                            >
                                <Lock size={10} /> 外卖对账 · 待接入
                            </button>
                            <button
                                onClick={() => setError("此分析需要先接入「员工考勤、薪资计算与法定EPF/SOCSO比例」，目前暂未开放。")}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900/40 text-stone-600 text-xs px-3.5 py-2 rounded-xl border border-stone-900 flex items-center gap-1 cursor-not-allowed transition-all"
                            >
                                <Lock size={10} /> 薪资计提 · 待接入
                            </button>
                            <button
                                onClick={() => setError("此分析需要先接入「应付账款和发票」，目前暂未开放。")}
                                style={{ minHeight: '38px', WebkitTapHighlightColor: 'transparent' }}
                                className="snap-start shrink-0 bg-stone-900/40 text-stone-600 text-xs px-3.5 py-2 rounded-xl border border-stone-900 flex items-center gap-1 cursor-not-allowed transition-all"
                            >
                                <Lock size={10} /> 应付账款 · 待接入
                            </button>
                        </div>
                    </div>
                )}

                {/* Input Tray Block with iOS Safe Area support */}
                <div 
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }} 
                    className="p-4 bg-stone-900 border-t border-stone-900 shrink-0 relative z-20"
                >
                    {/* Floating Audio Recording Wave Indicator Overlay */}
                    {isListening && (
                        <div className="absolute left-1/2 -translate-x-1/2 -top-16 bg-stone-950 border border-[#FFD200]/30 shadow-2xl backdrop-blur-md rounded-full px-5 py-2.5 flex items-center gap-3 animate-bounce">
                            <span className="relative flex h-3 w-3 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFD200] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FFD200]"></span>
                            </span>
                            <div className="flex gap-0.5 items-center justify-center px-1">
                                <span className="w-1 h-3 bg-[#FFD200] rounded-full animate-pulse inline-block"></span>
                                <span className="w-1 h-5 bg-[#FFD200] rounded-full animate-pulse inline-block delay-75"></span>
                                <span className="w-1 h-2 bg-[#FFD200] rounded-full animate-pulse inline-block delay-150"></span>
                                <span className="w-1 h-6 bg-[#FFD200] rounded-full animate-pulse inline-block delay-200"></span>
                                <span className="w-1 h-3 bg-[#FFD200] rounded-full animate-pulse inline-block delay-300"></span>
                            </div>
                            <p className="text-[10px] md:text-xs text-[#FFD200] font-black tracking-widest uppercase">语音聆听中 | 说完请再点麦克风结束 </p>
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
                            className="bg-transparent flex-grow font-extrabold text-xs md:text-sm text-stone-100 outline-none placeholder:text-stone-600 py-1"
                        />

                        {/* HIGH-GRADE TRANSCRIPTION MICROPHONE BUTTON FOR iOS / MOBILE */}
                        {micSupported ? (
                            <button
                                onClick={toggleListening}
                                style={{ minWidth: '44px', minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all border shrink-0 ${
                                    isListening 
                                      ? 'bg-rose-500 border-rose-400 text-white animate-pulse shadow-lg shadow-rose-500/20' 
                                      : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-white hover:border-[#FFD200]/30 hover:bg-[#FFD200]/5'
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
                                  ? 'bg-gradient-to-r from-[#FFD200] to-[#E5A93C] text-black hover:brightness-110 active:scale-95' 
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

