
import React, { useState, useEffect, useRef } from 'react';
import { QueueTicket } from '../types';
import { Utensils, Clock, Bell, Volume2, Play } from 'lucide-react';
import { DataManager } from '../utils/dataManager';

// This component is designed for a 1080p/4K TV Screen
export const QueueDisplay: React.FC = () => {
    const [tickets, setTickets] = useState<QueueTicket[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    
    // TTS State
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const lastAnnouncedId = useRef<string | null>(null);
    const lastAnnouncedTime = useRef<string | null>(null); // NEW: Track time to allow re-calling

    // 1. Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. TTS Helper Function
    const speakTicket = (number: string) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        // Spacing out characters helps TTS pronounce letters and digits clearly
        const readableNumber = number.split('').join(' ');
        const text = `请 ${readableNumber} 号顾客，前往柜台`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN'; 
        utterance.rate = 0.85; 
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    };

    // 3. Data Polling & Audio Trigger from CLOUD
    useEffect(() => {
        const fetchQueue = async () => {
            const parsed = await DataManager.getQueueTickets();
            
            // Find tickets that are actively CALLING
            // Sort by calledAt DESCENDING (Newest first)
            const calling = parsed
                .filter(t => t.status === 'CALLING')
                .sort((a, b) => {
                    const timeA = a.calledAt ? new Date(a.calledAt).getTime() : 0;
                    const timeB = b.calledAt ? new Date(b.calledAt).getTime() : 0;
                    return timeB - timeA;
                });

            setTickets(parsed);

            if (isAudioEnabled && calling.length > 0) {
                const latestTicket = calling[0];
                // Check if ID is different OR timestamp is different (Re-called)
                if (latestTicket.id !== lastAnnouncedId.current || latestTicket.calledAt !== lastAnnouncedTime.current) {
                    console.log("Announcing:", latestTicket.number);
                    speakTicket(latestTicket.number);
                    lastAnnouncedId.current = latestTicket.id;
                    lastAnnouncedTime.current = latestTicket.calledAt || null;
                }
            }
        };

        fetchQueue(); 
        const poller = setInterval(fetchQueue, 2000); 
        return () => clearInterval(poller);
    }, [isAudioEnabled]);

    const handleEnableAudio = () => {
        const utterance = new SpeechSynthesisUtterance("语音系统已启动");
        utterance.lang = 'zh-CN';
        window.speechSynthesis.speak(utterance);
        setIsAudioEnabled(true);
    };

    // ... (Computed Properties logic is same)
    const callingTickets = tickets.filter(t => t.status === 'CALLING').sort((a, b) => {
        const timeA = a.calledAt ? new Date(a.calledAt).getTime() : 0;
        const timeB = b.calledAt ? new Date(b.calledAt).getTime() : 0;
        return timeB - timeA; 
    });
    const waitingTickets = tickets.filter(t => t.status === 'WAITING');
    
    // Sort waiting tickets by creation time (Oldest first) for display order
    const sortedWaiting = waitingTickets.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const waitingA = sortedWaiting.filter(t => t.sizeCategory === 'SMALL');
    const waitingB = sortedWaiting.filter(t => t.sizeCategory === 'MEDIUM');
    const waitingC = sortedWaiting.filter(t => t.sizeCategory === 'LARGE');

    // ... (Render Logic)
    if (!isAudioEnabled) {
        return (
            <div className="w-screen h-screen bg-[#111] text-white flex flex-col items-center justify-center p-8 text-center font-sans">
                <div className="mb-8 p-6 bg-[#C70000] rounded-full shadow-[0_0_50px_rgba(199,0,0,0.5)] animate-pulse"><Volume2 size={64} className="text-[#FFD700]" /></div>
                <h1 className="text-4xl font-black mb-4 font-serif text-[#FFD700]">金莲记排队叫号大屏</h1>
                <p className="text-gray-400 mb-12 text-lg">点击下方按钮以激活语音播报功能<br/>Click to enable audio announcements</p>
                <button onClick={handleEnableAudio} className="bg-white text-black px-12 py-6 rounded-full text-2xl font-bold flex items-center gap-4 hover:scale-105 transition-transform shadow-2xl"><Play size={32} fill="currentColor" /> 启动显示 (Start Display)</button>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen bg-[#111] text-white overflow-hidden flex flex-col font-sans select-none animate-in fade-in duration-1000">
            {/* TOP BAR */}
            <div className="h-24 bg-[#C70000] flex justify-between items-center px-8 shadow-2xl z-10 relative">
                <div className="flex items-center gap-4">
                    <div className="bg-[#FFD700] text-black px-4 py-2 rounded font-black text-2xl shadow-lg font-serif">金莲记</div>
                    <div className="h-8 w-px bg-red-800 mx-2"></div>
                    <div className="text-xl font-bold text-red-100 tracking-widest uppercase">排队叫号系统 (Queue System)</div>
                </div>
                <div className="flex items-center gap-6 text-[#FFD700]">
                    <div className="flex items-center gap-2 bg-black/20 px-3 py-1 rounded-full border border-red-800/50"><Volume2 size={20} className="animate-pulse"/><span className="text-xs font-bold uppercase tracking-wider text-red-200">Voice On</span></div>
                    <div className="flex items-center gap-3"><Clock size={32}/><span className="text-3xl font-mono font-bold">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-grow flex">
                {/* LEFT: CALLING NOW */}
                <div className="w-[60%] bg-[#1A1A1A] p-8 flex flex-col border-r border-gray-800 relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FFD700] to-transparent"></div>
                    <h2 className="text-4xl font-black text-white flex items-center gap-4 mb-8 uppercase tracking-wider"><Bell size={48} className="text-red-500 animate-pulse" /> 请入座 (Now Seating)</h2>
                    <div className="flex-grow flex flex-col gap-6 overflow-hidden">
                        {callingTickets.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50"><Utensils size={120} className="mb-4"/><span className="text-4xl font-bold">暂无呼叫</span></div>
                        ) : (
                            callingTickets.slice(0, 3).map((t, idx) => (
                                <div key={t.id} className={`bg-white rounded-3xl p-8 flex justify-between items-center shadow-[0_0_50px_rgba(255,255,255,0.1)] transform transition-all duration-500 ${idx === 0 ? 'scale-100 border-l-[16px] border-[#C70000]' : 'scale-95 opacity-60'}`}>
                                    <div><div className="text-3xl font-bold text-gray-500 mb-2">号码 (Number)</div><div className="text-[120px] leading-none font-black text-[#1A1A1A] font-mono tracking-tighter">{t.number}</div></div>
                                    <div className="text-right"><div className="bg-[#1A1A1A] text-[#FFD700] px-6 py-2 rounded-full text-2xl font-bold mb-4 inline-block">{t.sizeCategory === 'SMALL' ? '1-2人' : t.sizeCategory === 'MEDIUM' ? '3-4人' : '5人以上'}</div><div className="text-4xl font-bold text-red-600 animate-bounce">请前往柜台</div></div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT: WAITING LIST */}
                <div className="w-[40%] bg-[#222] p-8 flex flex-col">
                    <h2 className="text-3xl font-bold text-gray-400 mb-8 flex items-center gap-3 uppercase tracking-wider border-b border-gray-700 pb-4"><Utensils size={32}/> 等待中 (Waiting)</h2>
                    <div className="flex-grow space-y-8">
                        <div className="bg-[#2A2A2A] rounded-2xl p-6 border-l-4 border-green-500 shadow-lg">
                             <div className="flex justify-between items-end mb-4"><h3 className="text-2xl font-bold text-green-500">小桌 (1-2人)</h3><span className="text-xl text-gray-500">{waitingA.length} 组等待</span></div>
                             <div className="flex flex-wrap gap-3">{waitingA.length === 0 && <span className="text-gray-600 text-lg italic">无需排队</span>}{waitingA.slice(0, 8).map(t => <span key={t.id} className="text-4xl font-mono font-black text-white bg-black/30 px-4 py-2 rounded border border-white/10">{t.number}</span>)}{waitingA.length > 8 && <span className="text-xl text-gray-500 self-center">...</span>}</div>
                        </div>
                        <div className="bg-[#2A2A2A] rounded-2xl p-6 border-l-4 border-blue-500 shadow-lg">
                             <div className="flex justify-between items-end mb-4"><h3 className="text-2xl font-bold text-blue-500">中桌 (3-4人)</h3><span className="text-xl text-gray-500">{waitingB.length} 组等待</span></div>
                             <div className="flex flex-wrap gap-3">{waitingB.length === 0 && <span className="text-gray-600 text-lg italic">无需排队</span>}{waitingB.slice(0, 8).map(t => <span key={t.id} className="text-4xl font-mono font-black text-white bg-black/30 px-4 py-2 rounded border border-white/10">{t.number}</span>)}{waitingB.length > 8 && <span className="text-xl text-gray-500 self-center">...</span>}</div>
                        </div>
                         <div className="bg-[#2A2A2A] rounded-2xl p-6 border-l-4 border-orange-500 shadow-lg">
                             <div className="flex justify-between items-end mb-4"><h3 className="text-2xl font-bold text-orange-500">大桌 (5人+)</h3><span className="text-xl text-gray-500">{waitingC.length} 组等待</span></div>
                             <div className="flex flex-wrap gap-3">{waitingC.length === 0 && <span className="text-gray-600 text-lg italic">无需排队</span>}{waitingC.slice(0, 8).map(t => <span key={t.id} className="text-4xl font-mono font-black text-white bg-black/30 px-4 py-2 rounded border border-white/10">{t.number}</span>)}{waitingC.length > 8 && <span className="text-xl text-gray-500 self-center">...</span>}</div>
                        </div>
                    </div>
                    <div className="mt-8 text-center"><p className="text-xl text-[#FFD700] font-serif font-bold animate-pulse">过号请联系柜台重新取号</p></div>
                </div>
            </div>
        </div>
    );
}
