
import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Plus, Search, X, Save, Trash2, Calendar, Link as LinkIcon, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { WarrantyRecord } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';

interface WarrantyModuleProps {
    onClose: () => void;
}

export const WarrantyModule: React.FC<WarrantyModuleProps> = ({ onClose }) => {
    const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    
    // Form State
    const [form, setForm] = useState<Partial<WarrantyRecord>>({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const data = await DataManager.getWarranties();
        setWarranties(data.sort((a,b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()));
    };

    const handleSave = async () => {
        if (!form.productName || !form.expiryDate) return alert("Product Name and Expiry Date are required");
        
        const newRecord: WarrantyRecord = {
            id: form.id || `war_${Date.now()}`,
            productName: form.productName,
            purchaseDate: form.purchaseDate || new Date().toISOString().split('T')[0],
            expiryDate: form.expiryDate,
            linkUrl: form.linkUrl || '',
            notes: form.notes || ''
        };

        await DataManager.saveWarranty(newRecord);
        setForm({});
        setIsFormOpen(false);
        loadData();
        alert("✅ 保修记录已保存 (Warranty Saved)");
    };

    const handleDelete = async (id: string) => {
        if (!confirm("确定删除此记录吗？")) return;
        await DataManager.deleteWarranty(id);
        loadData();
    };

    const filteredList = warranties.filter(w => 
        w.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        w.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate Status
    const getStatus = (expiryDate: string) => {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { label: 'EXPIRED', color: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle };
        if (diffDays <= 30) return { label: `EXPIRING (${diffDays}d)`, color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertTriangle };
        return { label: 'ACTIVE', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 };
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-5xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* Header */}
                <div className="bg-[#1A1A1A] px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700]">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#FFD700] text-black p-2.5 rounded-xl shadow-lg"><ShieldCheck size={24}/></div>
                        <div>
                            <h3 className="font-serif font-black text-xl tracking-wide">保修记录管理</h3>
                            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">WARRANTY TRACKER</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* We reuse SUPPLIER guide as generic help for now, or create new later */}
                        <ModuleGuideButton module="SUPPLIER" /> 
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20}/></button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-32">
                    
                    {/* Controls */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-grow">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
                            <input 
                                type="text" 
                                placeholder="搜索产品名称..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#FFD700]"
                            />
                        </div>
                        <button onClick={() => { setForm({}); setIsFormOpen(true); }} className="bg-[#1A1A1A] text-[#FFD700] px-6 py-3 rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 hover:bg-black transition-colors">
                            <Plus size={16}/> 新增记录
                        </button>
                    </div>

                    {/* List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredList.map(item => {
                            const status = getStatus(item.expiryDate);
                            const StatusIcon = status.icon;

                            return (
                                <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between hover:border-[#FFD700] transition-colors group">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-black text-lg text-[#1A1A1A] leading-tight">{item.productName}</h4>
                                            <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                        </div>
                                        
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase mb-4 ${status.color}`}>
                                            <StatusIcon size={12}/> {status.label}
                                        </div>

                                        <div className="space-y-2 text-xs text-gray-600">
                                            <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                                                <span className="text-gray-400 flex items-center gap-1"><Calendar size={12}/> Purchase Date</span>
                                                <span className="font-mono font-bold">{item.purchaseDate}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                                                <span className="text-gray-400 flex items-center gap-1"><ShieldCheck size={12}/> Expiry Date</span>
                                                <span className="font-mono font-bold text-[#1A1A1A]">{item.expiryDate}</span>
                                            </div>
                                        </div>
                                        
                                        {item.notes && <div className="mt-3 text-xs text-gray-500 italic bg-gray-50 p-2 rounded-lg">{item.notes}</div>}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                                        <button onClick={() => { setForm(item); setIsFormOpen(true); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-xl text-xs font-bold transition-colors">编辑 (Edit)</button>
                                        {item.linkUrl && (
                                            <a href={item.linkUrl} target="_blank" rel="noreferrer" className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 border border-blue-100">
                                                <LinkIcon size={12}/> Drive Link <ExternalLink size={10}/>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        {filteredList.length === 0 && (
                            <div className="col-span-full text-center py-20 text-gray-400 text-sm font-bold">暂无保修记录</div>
                        )}
                    </div>
                </div>

                {/* ADD/EDIT MODAL */}
                {isFormOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-in zoom-in-95">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-xl text-[#1A1A1A]">{form.id ? '编辑保修记录' : '新增保修记录'}</h3>
                                <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                            </div>
                            
                            <div className="space-y-4">
                                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Product Name (产品名称)</label><input className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border-2 border-transparent focus:border-[#FFD700]" value={form.productName || ''} onChange={e => setForm({...form, productName: e.target.value})} placeholder="e.g. 2-Door Chiller" /></div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Purchase Date</label><input type="date" className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none" value={form.purchaseDate || ''} onChange={e => setForm({...form, purchaseDate: e.target.value})} /></div>
                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Expiry Date</label><input type="date" className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none" value={form.expiryDate || ''} onChange={e => setForm({...form, expiryDate: e.target.value})} /></div>
                                </div>

                                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block flex items-center gap-1"><LinkIcon size={12}/> Document Link (Google Drive)</label><input className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none" value={form.linkUrl || ''} onChange={e => setForm({...form, linkUrl: e.target.value})} placeholder="https://drive.google.com/..." /></div>
                                
                                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Notes</label><textarea className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none h-20 resize-none" value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Serial Number, Supplier Contact..." /></div>

                                <button onClick={handleSave} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black mt-4 flex items-center justify-center gap-2">
                                    <Save size={18}/> 保存 (Save)
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
