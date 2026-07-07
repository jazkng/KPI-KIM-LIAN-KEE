
import React, { useState, useEffect, useMemo } from 'react';
import { Armchair, Users, Bell, Trash2, CheckCircle, RotateCcw, Tv, Plus, User, Clock, Check, X, Phone, UserPlus, Volume2 } from 'lucide-react';
import { QueueTicket, QueueSize, QueueStatus } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';

interface QueueManagerProps {
    onOpenTV: () => void;
}

export const QueueManager: React.FC<QueueManagerProps> = ({ onOpenTV }) => {
    const [tickets, setTickets] = useState<QueueTicket[]>([]);
    const [paxInput, setPaxInput] = useState<string>('');
    const [phoneInput, setPhoneInput] = useState<string>('');
    
    useEffect(() => {
        // Initial load
        loadQueue();
        // Poll for updates
        const interval = setInterval(loadQueue, 3000); 
        return () => clearInterval(interval);
    }, []);

    const loadQueue = async () => {
        const data = await DataManager.getQueueTickets();
        // Sort by created time
        setTickets(data.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    };

    // --- LOGIC: TICKET GENERATION ---
    const issueTicket = async (paxOverride?: number) => {
        const pax = paxOverride || parseInt(paxInput);
        if (isNaN(pax) || pax <= 0) return alert("请输入有效人数");

        // 1. Fetch LATEST data to minimize race conditions
        const latestTickets = await DataManager.getQueueTickets();

        let sizeCategory: QueueSize = 'SMALL';
        let prefix = 'A';
        if (pax >= 5) {
            sizeCategory = 'LARGE';
            prefix = 'C';
        } else if (pax >= 3) {
            sizeCategory = 'MEDIUM';
            prefix = 'B';
        }

        const sameTypeTickets = latestTickets.filter(t => t.number.startsWith(prefix));
        const lastTicket = sameTypeTickets.length > 0 
            ? [...sameTypeTickets].sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0]
            : null;
        
        let nextNum = 1;
        if (lastTicket) {
            // Robust parsing: Extract digits from "A001" -> 1
            const numPart = lastTicket.number.replace(/\D/g, '');
            nextNum = parseInt(numPart) + 1;
        }
        
        const formattedNum = `${prefix}${String(nextNum).padStart(3, '0')}`;

        const newTicket: QueueTicket = {
            id: Date.now().toString(),
            number: formattedNum,
            sizeCategory,
            pax,
            status: 'WAITING',
            createdAt: new Date().toISOString(),
            phone: phoneInput || undefined
        };

        await DataManager.saveQueueTicket(newTicket);
        await loadQueue();
        
        // Success Feedback
        alert(`✅ 取号成功 (Issued)!\n\n号码: ${formattedNum}\n人数: ${pax} 位`);

        setPaxInput('');
        setPhoneInput('');
    };

    // --- LOGIC: ACTIONS ---
    const updateStatus = async (id: string, status: QueueStatus) => {
        const ticket = tickets.find(t => t.id === id);
        if (ticket) {
            const updated = { 
                ...ticket, 
                status, 
                // Update timestamp if calling (triggers re-announce on TV)
                calledAt: status === 'CALLING' ? new Date().toISOString() : ticket.calledAt 
            };
            // Optimistic update
            setTickets(prev => prev.map(t => t.id === id ? updated : t));
            await DataManager.saveQueueTicket(updated);
        }
    };

    const clearQueue = async () => {
        if (confirm("确定要清空所有排队记录吗？(Reset all)\n此操作将重置号码从 001 开始。")) {
            await DataManager.clearQueue();
            loadQueue();
        }
    };

    // --- COMPUTED ---
    const activeTickets = tickets.filter(t => t.status === 'WAITING' || t.status === 'CALLING');
    
    // Stats: Only count WAITING (True Backlog)
    const waitingOnly = tickets.filter(t => t.status === 'WAITING');
    const groupedWaiting = useMemo(() => ({
        A: waitingOnly.filter(t => t.sizeCategory === 'SMALL'),
        B: waitingOnly.filter(t => t.sizeCategory === 'MEDIUM'),
        C: waitingOnly.filter(t => t.sizeCategory === 'LARGE'),
    }), [waitingOnly]);

    return (
        <div className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-24">
            {/* HEADER */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                 <div className="flex items-center gap-3">
                    <div className="bg-black p-2 rounded-xl text-[#FFD700]"><Armchair size={24} /></div>
                    <div><h3 className="font-black text-xl text-[#1A1A1A]">排队取号系统</h3><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Queue Control Center</p></div>
                 </div>
                 <div className="flex gap-2 w-full md:w-auto">
                    <ModuleGuideButton module="QUEUE" dark />
                    <button onClick={onOpenTV} className="flex-1 md:flex-none bg-[#1A1A1A] text-[#FFD700] px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"><Tv size={18}/> 启动电视大屏</button>
                    <button onClick={clearQueue} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors" title="重置排队 (Reset Queue)"><RotateCcw size={18}/></button>
                 </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT: ISSUE TICKET PANEL */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 sticky top-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Plus size={14}/> 快速取号 (Issue Ticket)</h4>
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: '1-2人', pax: 2, icon: User, color: 'border-green-200 text-green-700 bg-green-50' },
                                    { label: '3-4人', pax: 4, icon: Users, color: 'border-blue-200 text-blue-700 bg-blue-50' },
                                    { label: '5人+', pax: 6, icon: UserPlus, color: 'border-orange-200 text-orange-700 bg-orange-50' },
                                ].map((btn, idx) => (
                                    <button key={idx} onClick={() => issueTicket(btn.pax)} className={`flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all active:scale-95 ${btn.color} hover:shadow-md`}>
                                        <btn.icon size={24} className="mb-1" /><span className="text-[10px] font-black uppercase">{btn.label}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="h-px bg-gray-100"></div>
                            <div className="space-y-4">
                                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">人数 (Pax Count)</label><input type="number" value={paxInput} onChange={e => setPaxInput(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-2xl font-black text-center focus:border-[#FFD700] outline-none transition-all" placeholder="0"/></div>
                                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">手机号 (Phone - Optional)</label><input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-[#FFD700]" placeholder="012..."/></div>
                                <button onClick={() => issueTicket()} disabled={!paxInput} className="w-full py-4 bg-black text-[#FFD700] rounded-2xl font-black text-lg shadow-xl active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center gap-2">确认发号 (Confirm)</button>
                            </div>
                        </div>
                    </div>
                    
                    {/* STATS MINI CARD */}
                    <div className="bg-[#1A1A1A] p-4 rounded-2xl text-white">
                        <div className="text-[10px] text-gray-400 uppercase font-bold text-center mb-2">当前排队人数 (Waiting Only)</div>
                        <div className="flex justify-around items-center text-center">
                            <div><div className="text-green-500 text-lg font-black">{groupedWaiting.A.length}</div><div className="text-[8px] text-gray-400 uppercase">A 小桌</div></div>
                            <div className="w-px h-6 bg-gray-700"></div>
                            <div><div className="text-blue-500 text-lg font-black">{groupedWaiting.B.length}</div><div className="text-[8px] text-gray-400 uppercase">B 中桌</div></div>
                            <div className="w-px h-6 bg-gray-700"></div>
                            <div><div className="text-orange-500 text-lg font-black">{groupedWaiting.C.length}</div><div className="text-[8px] text-gray-400 uppercase">C 大桌</div></div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: QUEUE LIST PANEL */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center px-1">
                        <h4 className="font-bold text-[#1A1A1A] flex items-center gap-2"><Clock size={16}/> 待入座列表 ({activeTickets.length})</h4>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Sorted by Waiting Time</div>
                    </div>
                    <div className="space-y-3">
                        {activeTickets.length === 0 ? (
                            <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                                <Armchair size={48} className="text-gray-200 mb-2"/>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">目前无人在排队</p>
                            </div>
                        ) : (
                            activeTickets.map(ticket => {
                                const isCalling = ticket.status === 'CALLING';
                                const timeWaiting = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000);
                                return (
                                    <div key={ticket.id} className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition-all flex flex-col md:flex-row items-center justify-between gap-4 ${isCalling ? 'border-red-500 ring-4 ring-red-50 bg-red-50/10' : 'border-gray-50'}`}>
                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                            <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-black font-mono shadow-inner ${ticket.sizeCategory === 'SMALL' ? 'bg-green-100 text-green-800' : ticket.sizeCategory === 'MEDIUM' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>{ticket.number}</div>
                                            <div>
                                                <div className="flex items-center gap-2"><span className="font-black text-xl text-black">{ticket.pax}人</span><span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter bg-gray-100 px-1.5 py-0.5 rounded">{ticket.sizeCategory === 'SMALL' ? '小桌' : ticket.sizeCategory === 'MEDIUM' ? '中桌' : '大桌'}</span></div>
                                                <div className="flex items-center gap-3 mt-0.5"><div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold"><Clock size={10}/> {timeWaiting}m 之前</div>{ticket.phone && (<div className="flex items-center gap-1 text-[10px] text-blue-500 font-mono font-bold"><Phone size={10}/> {ticket.phone}</div>)}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <button onClick={() => updateStatus(ticket.id, 'CALLING')} className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isCalling ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-[#1A1A1A] hover:text-white'}`}><Volume2 size={18}/><span>{isCalling ? '重呼 (Recall)' : '呼叫 (Call)'}</span></button>
                                            <button onClick={() => updateStatus(ticket.id, 'SEATED')} className="flex-1 md:flex-none bg-green-500 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:bg-green-600 active:scale-95 transition-all"><Check size={20} strokeWidth={3}/><span>入座</span></button>
                                            <button onClick={() => updateStatus(ticket.id, 'CANCELLED')} className="p-3 text-gray-300 hover:text-red-500 transition-colors bg-white hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100"><X size={20}/></button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
