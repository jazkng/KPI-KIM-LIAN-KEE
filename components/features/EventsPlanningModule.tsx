
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Target, Megaphone, Calendar, Vote, ThumbsUp, ThumbsDown, 
    TrendingUp, Award, Layout, Plus, Trash2, CheckCircle2, 
    AlertCircle, Users, BarChart3, X, ChevronRight, MessageSquare, Clock, Edit3, DollarSign, PieChart, Flag, Zap, Lightbulb, Calculator, 
    Smartphone, Coffee, Utensils, Star, Flame, Heart, TrendingDown, MapPin,
    Layers, Bike, Globe, Camera, Gift, Truck, ShoppingBag, Video, Smile, ChevronDown, ChevronUp,
    Wrench, Crown, Home, Box, Briefcase, Bus, Activity, Store,
    Play, CheckSquare, Square, MessageCircle
} from 'lucide-react';
import { Proposal, OKR, MarketingCampaign, StoreEvent, Employee, ProposalComment, EventChecklistItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';

interface EventsPlanningModuleProps {
    onClose: () => void;
    currentEmployee?: Employee | null;
    defaultTab?: string; // 👈 把这行加上，让红波浪线消失！
}

// --- UTILS ---
const formatMoney = (n: number) => `RM ${n.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
const INPUT_STYLE = "w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-[#1A1A1A] outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700] transition-all placeholder:font-normal placeholder:text-gray-400";
const LABEL_STYLE = "text-[10px] font-bold text-gray-400 uppercase mb-1.5 block tracking-wide ml-1";

// --- REFINED PROFESSIONAL TEMPLATES (10 ITEMS EACH) ---
const PROPOSAL_TEMPLATES = [
    { title: '中央厨房预制化试点 (Central Prep Pilot)', type: 'EXPANSION', budget: 15000, description: '提议在总店设立集中切配区，统一腌制肉类和熬制酱料，配送至分店。目标：保持百店一味，降低各店 15% 人力成本。', icon: Layers },
    { title: '全店数字化升级 (Digital Transformation)', type: 'POLICY', budget: 8500, description: '引入 AI 智能排队与扫码点餐系统，打通财务后台。目标：提升高峰期翻台率 20%，减少收银坏账风险。', icon: Smartphone },
    { title: '老师傅传帮带激励计划 (Chef Mentorship)', type: 'POLICY', budget: 5000, description: '设立“锅气传承”奖金，鼓励老厨师带徒弟。每培养出一名合格炒锅手，给予师傅额外津贴。目标：解决核心人才断层问题。', icon: Flame },
    { title: '冷冻速食产品线研发 (Frozen Retail Line)', type: 'EXPANSION', budget: 20000, description: '研发冷冻真空包装的福建面酱料包与扣肉，进驻超市与网购平台。目标：开辟第二增长曲线。', icon: ShoppingBag },
    { title: '深夜食堂引流计划 (Late Night Supper)', type: 'MARKETING', budget: 3000, description: '延长周五/周六营业时间至凌晨 3 点，推出“夜猫子套餐”。目标：提升夜间时段营业额 30%。', icon: Clock },
    { title: '吉隆坡商场快闪店 (Mall Pop-up Store)', type: 'EXPANSION', budget: 12000, description: '在 Pavilion 或 Mid Valley 设立短期快闪摊位，测试商场人流对炭炒福建面的接受度，为进驻商场做准备。', icon: Store },
    { title: '厨房设备自动化升级 (Auto-Wok)', type: 'EXPANSION', budget: 35000, description: '引入半自动炒面机辅助非核心菜品，减少对人工的依赖。', icon: Wrench },
    { title: 'VIP 会员制度改革 (Loyalty Program)', type: 'POLICY', budget: 4000, description: '取消实体卡，转为电子会员积分制，增加生日免单福利。目标：提升顾客复购率。', icon: Crown },
    { title: '员工宿舍环境改善 (Dorm Upgrade)', type: 'POLICY', budget: 10000, description: '翻新宿舍，安装新冷气与热水器，改善员工生活质量。目标：降低外籍员工流失率。', icon: Home },
    { title: '百年品牌文化墙建设 (Heritage Branding)', type: 'MARKETING', budget: 8000, description: '在总店设计“金莲记历史文化墙”，展示 1927 年至今的老照片与旧厨具。目标：强化“吉隆坡第一家”的品牌心智，吸引游客打卡。', icon: Award },
];

const OKR_TEMPLATES = [
    { 
        objective: '极致出品与口碑重塑 (Quality & Reputation)', 
        keyResults: [
            { label: 'Google 评分从 4.2 提升至 4.5', target: 4.5, current: 4.2, unit: '⭐' },
            { label: '核心菜品（福建面）退菜率低于 0.5%', target: 0.5, current: 1.2, unit: '%' }
        ],
        icon: Star
    },
    { 
        objective: '外卖业务利润倍增 (Delivery Profitability)', 
        keyResults: [
            { label: '外卖实收毛利提升', target: 25, current: 15, unit: '%' },
            { label: '自营小程序下单占比', target: 30, current: 10, unit: '%' }
        ],
        icon: Bike
    },
    { 
        objective: '绿色降耗中心 (Sustainability)', 
        keyResults: [
            { label: '单店月均水电煤气费下降', target: 10, current: 2, unit: '%' },
            { label: '餐厨垃圾减量指标', target: 20, current: 5, unit: '%' }
        ],
        icon: TrendingDown
    },
    { 
        objective: '月度营收突破 (Revenue Growth)', 
        keyResults: [
            { label: '月营业额达到 RM 500k', target: 500000, current: 380000, unit: 'RM' },
            { label: '客单价 (AOV) 提升至 RM 45', target: 45, current: 32, unit: 'RM' }
        ],
        icon: DollarSign
    },
    { 
        objective: '人才梯队建设 (Talent Retention)', 
        keyResults: [
            { label: '员工流失率控制在 5% 以下', target: 5, current: 12, unit: '%' },
            { label: '培养出 2 名合格二锅', target: 2, current: 0, unit: '人' }
        ],
        icon: Users
    },
    { 
        objective: '新品研发与推广 (New Menu)', 
        keyResults: [
            { label: '推出 2 款爆款新品', target: 2, current: 1, unit: '款' },
            { label: '新品销售占比达到 15%', target: 15, current: 5, unit: '%' }
        ],
        icon: Utensils
    },
    { 
        objective: '社交媒体影响力 (Social Reach)', 
        keyResults: [
            { label: 'FB/IG 粉丝增长', target: 10000, current: 5000, unit: '人' },
            { label: '小红书笔记曝光量', target: 100000, current: 20000, unit: 'View' }
        ],
        icon: Smartphone
    },
    { 
        objective: '库存周转优化 (Inventory)', 
        keyResults: [
            { label: '食材损耗率降至 2% 以下', target: 2, current: 5, unit: '%' },
            { label: '库存周转天数缩短至 5 天', target: 5, current: 9, unit: 'Day' }
        ],
        icon: Box
    },
    { 
        objective: '顾客忠诚度 (Loyalty)', 
        keyResults: [
            { label: '会员复购率', target: 40, current: 25, unit: '%' },
            { label: '新增会员注册数', target: 500, current: 120, unit: '人' }
        ],
        icon: Heart
    },
    { 
        objective: '供应链成本优化 (Supply Chain)', 
        keyResults: [
            { label: '主要食材采购成本下降', target: 5, current: 0, unit: '%' },
            { label: '供应商准时交货率', target: 98, current: 85, unit: '%' }
        ],
        icon: Truck
    },
];

const CAMPAIGN_TEMPLATES = [
    { name: '“寻找失落的锅气”探店计划', platform: 'TIKTOK', budget: 5000, roi: 4.5, icon: Video },
    { name: '社区团购 - 经典冻干即食面包', platform: 'OFFLINE', budget: 2000, roi: 3.0, icon: Users },
    { name: '小红书 - 全马最老牌福建面打卡', platform: 'XIAOHONGSHU', budget: 3000, roi: 5.5, icon: MapPin },
    { name: 'Google Maps 五星好评送饮料', platform: 'OFFLINE', budget: 500, roi: 8.0, icon: Star },
    { name: 'GrabFood 免运费促销周', platform: 'OFFLINE', budget: 1500, roi: 2.5, icon: Bike },
    { name: '美食博主/KOL 邀请试吃会', platform: 'TIKTOK', budget: 4000, roi: 3.5, icon: Camera },
    { name: 'Facebook 广告 - 周末家庭套餐', platform: 'FACEBOOK', budget: 2000, roi: 4.0, icon: Users },
    { name: '国庆节限量版“爱国套餐”', platform: 'OFFLINE', budget: 1000, roi: 3.0, icon: Flag },
    { name: '深夜食堂 - 宵夜时段广告投放', platform: 'FACEBOOK', budget: 1500, roi: 2.8, icon: Clock },
    { name: '企业午餐团餐推广 (Catering)', platform: 'OFFLINE', budget: 500, roi: 5.0, icon: Briefcase },
];

const EVENT_TEMPLATES = [
    { name: '金莲记“锅气之星”厨艺大赛', type: 'TEAM_BUILDING', icon: Award },
    { name: '马来西亚国庆限定 - 蓝白红套餐', type: 'PROMO', icon: Flag },
    { name: '老员工入职周年庆典 (Family Day)', type: 'HOLIDAY', icon: Heart },
    { name: '农历新年 - 醒狮采青开工仪式', type: 'HOLIDAY', icon: Zap },
    { name: '中秋节 - 员工聚餐 & 猜灯谜', type: 'TEAM_BUILDING', icon: Smile },
    { name: '季度全员大会 (Townhall)', type: 'TEAM_BUILDING', icon: Users },
    { name: '年度公司旅游 (Company Trip)', type: 'TEAM_BUILDING', icon: Bus },
    { name: '员工健康检查日', type: 'HOLIDAY', icon: Activity },
    { name: '新菜品鉴会 (VIP Tasting)', type: 'PROMO', icon: Utensils },
    { name: '社区孤老院慈善送餐', type: 'HOLIDAY', icon: Gift },
];

export const EventsPlanningModule: React.FC<EventsPlanningModuleProps> = ({ onClose, currentEmployee }) => {
    const [activeTab, setActiveTab] = useState<'VOTING' | 'OKR' | 'MARKETING' | 'EVENTS'>('VOTING');
    const [loading, setLoading] = useState(true);
    
    // UI State for Collapsible Templates
    const [showTemplates, setShowTemplates] = useState(false);

    // Data State
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [okrs, setOkrs] = useState<OKR[]>([]);
    const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
    const [events, setEvents] = useState<StoreEvent[]>([]);

    // Modals
    const [isProposalModal, setIsProposalModal] = useState(false);
    const [isOKRModal, setIsOKRModal] = useState(false);
    const [isCampaignModal, setIsCampaignModal] = useState(false);
    const [isEventModal, setIsEventModal] = useState(false);

    // Forms
    const [newProposal, setNewProposal] = useState<Partial<Proposal>>({});
    const [newOKR, setNewOKR] = useState<Partial<OKR>>({ keyResults: [] });
    const [newCampaign, setNewCampaign] = useState<Partial<MarketingCampaign>>({});
    const [newEvent, setNewEvent] = useState<Partial<StoreEvent>>({});
    
    // ROI Calculator State
    const [calcRevenue, setCalcRevenue] = useState<string>('');
    
    // NEW: Interactive States
    const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
    const [commentInput, setCommentInput] = useState('');
    
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [newTaskText, setNewTaskText] = useState('');

    // Current User Logic
    const currentUserId = currentEmployee?.id || '001'; 
    const isOwner = currentEmployee?.role?.includes('Owner') || ['001','002','003','004'].includes(currentUserId);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; }
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!isProposalModal && !isOKRModal && !isCampaignModal && !isEventModal) {
            setShowTemplates(false);
        }
    }, [isProposalModal, isOKRModal, isCampaignModal, isEventModal]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [p, o, c, e] = await Promise.all([
                DataManager.getProposals(),
                DataManager.getOKRs(),
                DataManager.getCampaigns(),
                DataManager.getEvents()
            ]);
            setProposals(p);
            setOkrs(o);
            setCampaigns(c);
            setEvents(e);
        } catch (error) {
            console.error("Failed to load strategy data", error);
        } finally {
            setLoading(false);
        }
    };

    // --- VOTING LOGIC ---
    const handleVote = async (proposalId: string, vote: 'APPROVE' | 'REJECT') => {
        if (!isOwner) return alert("⚠️ 仅限股东投票 (Owners Only)");
        
        const proposal = proposals.find(p => p.id === proposalId);
        if (!proposal) return;

        const newApprovals = proposal.votes.approvals.filter(id => id !== currentUserId);
        const newRejections = proposal.votes.rejections.filter(id => id !== currentUserId);

        if (vote === 'APPROVE') newApprovals.push(currentUserId);
        else newRejections.push(currentUserId);

        let newStatus = proposal.status;
        if (newApprovals.length >= 3) newStatus = 'APPROVED';
        if (newRejections.length >= 3) newStatus = 'REJECTED';

        const updatedProposal: Proposal = {
            ...proposal,
            status: newStatus,
            votes: { approvals: newApprovals, rejections: newRejections }
        };

        setProposals(prev => prev.map(p => p.id === proposalId ? updatedProposal : p));
        await DataManager.saveProposal(updatedProposal);
    };

    const handleAddComment = async (proposalId: string) => {
        if (!commentInput.trim()) return;
        const proposal = proposals.find(p => p.id === proposalId);
        if (!proposal) return;

        const newComment: ProposalComment = {
            id: Date.now().toString(),
            author: currentEmployee?.name || 'Shareholder',
            text: commentInput,
            date: new Date().toISOString()
        };

        const updatedProposal = {
            ...proposal,
            comments: [...(proposal.comments || []), newComment]
        };

        setProposals(prev => prev.map(p => p.id === proposalId ? updatedProposal : p));
        await DataManager.saveProposal(updatedProposal);
        setCommentInput('');
    };

    const handleCreateProposal = async () => {
        if (!newProposal.title || newProposal.budget === undefined) return alert("Please fill Title & Budget");
        
        const item: Proposal = {
            id: `prop_${Date.now()}`,
            title: newProposal.title || '',
            description: newProposal.description || '',
            type: newProposal.type || 'POLICY',
            budget: Number(newProposal.budget),
            createdBy: currentEmployee?.name || 'Owner',
            createdAt: new Date().toISOString().split('T')[0],
            deadline: newProposal.deadline || new Date().toISOString().split('T')[0],
            status: 'VOTING',
            votes: { approvals: [], rejections: [] },
            comments: []
        };

        await DataManager.saveProposal(item);
        setIsProposalModal(false);
        setNewProposal({});
        loadData();
    };

    const handleDeleteProposal = async (id: string) => {
        if(!confirm("Delete this proposal?")) return;
        await DataManager.deleteProposal(id);
        loadData();
    };

    // --- OKR LOGIC ---
    const handleCreateOKR = async () => {
        if (!newOKR.objective) return alert("Objective required");
        
        const item: OKR = {
            id: newOKR.id || `okr_${Date.now()}`,
            quarter: newOKR.quarter || '2024 Q3',
            objective: newOKR.objective || '',
            progress: 0,
            status: 'ON_TRACK',
            keyResults: newOKR.keyResults || []
        };
        await DataManager.saveOKR(item);
        setIsOKRModal(false);
        setNewOKR({ keyResults: [] });
        loadData();
    };

    const handleUpdateOKRProgress = async (okr: OKR, krIndex: number, newVal: number) => {
        const updatedKRs = [...okr.keyResults];
        updatedKRs[krIndex].current = newVal;
        const totalProgress = updatedKRs.reduce((sum, kr) => sum + (kr.current / kr.target), 0);
        const avgPercent = Math.round((totalProgress / updatedKRs.length) * 100);
        const updatedOKR = { ...okr, keyResults: updatedKRs, progress: Math.min(100, avgPercent) };
        setOkrs(prev => prev.map(o => o.id === okr.id ? updatedOKR : o));
        await DataManager.saveOKR(updatedOKR);
    };

    const addKeyResult = () => {
        setNewOKR(prev => ({
            ...prev,
            keyResults: [...(prev.keyResults || []), { label: '', target: 100, current: 0, unit: '' }]
        }));
    };

    const handleDeleteOKR = async (id: string) => {
        if(!confirm("Delete this OKR?")) return;
        await DataManager.deleteOKR(id);
        loadData();
    };

    // --- MARKETING LOGIC ---
    const handleCreateCampaign = async () => {
        if (!newCampaign.name || !newCampaign.budget) return alert("Name & Budget required");
        
        const item: MarketingCampaign = {
            id: newCampaign.id || `camp_${Date.now()}`,
            name: newCampaign.name,
            platform: newCampaign.platform || 'FACEBOOK',
            status: 'ACTIVE',
            budget: Number(newCampaign.budget),
            spend: Number(newCampaign.spend) || 0,
            roi: Number(newCampaign.roi) || 0,
            startDate: newCampaign.startDate || new Date().toISOString().split('T')[0],
            endDate: newCampaign.endDate || new Date().toISOString().split('T')[0]
        };

        await DataManager.saveCampaign(item);
        setIsCampaignModal(false);
        setNewCampaign({});
        setCalcRevenue('');
        loadData();
    };

    const handleDeleteCampaign = async (id: string) => {
        if(!confirm("Delete this campaign?")) return;
        await DataManager.deleteCampaign(id);
        loadData();
    };

    const toggleCampaignStatus = async (camp: MarketingCampaign) => {
        const nextStatus = camp.status === 'ACTIVE' ? 'ENDED' : camp.status === 'ENDED' ? 'PLANNED' : 'ACTIVE';
        const updated: MarketingCampaign = { ...camp, status: nextStatus };
        setCampaigns(prev => prev.map(c => c.id === camp.id ? updated : c));
        await DataManager.saveCampaign(updated);
    };

    // --- EVENT LOGIC ---
    const handleCreateEvent = async () => {
        if (!newEvent.name || !newEvent.date) return alert("Name & Date required");
        
        const item: StoreEvent = {
            id: newEvent.id || `evt_${Date.now()}`,
            name: newEvent.name,
            date: newEvent.date,
            type: newEvent.type || 'PROMO',
            status: 'UPCOMING',
            checklist: []
        };
        await DataManager.saveEvent(item);
        setIsEventModal(false);
        setNewEvent({});
        loadData();
    };

    const handleDeleteEvent = async (id: string) => {
        if(!confirm("Delete this event?")) return;
        await DataManager.deleteEvent(id);
        loadData();
    };

    const toggleEventStatus = async (evt: StoreEvent) => {
        const nextStatus = evt.status === 'UPCOMING' ? 'COMPLETED' : 'UPCOMING';
        const updated: StoreEvent = { ...evt, status: nextStatus };
        setEvents(prev => prev.map(e => e.id === evt.id ? updated : e));
        await DataManager.saveEvent(updated);
    };

    const addTaskToEvent = async (evtId: string) => {
        if (!newTaskText.trim()) return;
        const evt = events.find(e => e.id === evtId);
        if (!evt) return;
        
        const newItem: EventChecklistItem = { id: Date.now().toString(), label: newTaskText, done: false };
        const updated = { ...evt, checklist: [...(evt.checklist || []), newItem] };
        
        setEvents(prev => prev.map(e => e.id === evtId ? updated : e));
        await DataManager.saveEvent(updated);
        setNewTaskText('');
    };

    const toggleTaskDone = async (evtId: string, taskId: string) => {
        const evt = events.find(e => e.id === evtId);
        if (!evt || !evt.checklist) return;

        const updatedChecklist = evt.checklist.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
        const updated = { ...evt, checklist: updatedChecklist };

        setEvents(prev => prev.map(e => e.id === evtId ? updated : e));
        await DataManager.saveEvent(updated);
    };


    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            {/* Main Container */}
            <div className="bg-[#F5F7FA] w-full h-[100dvh] md:max-w-7xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* Header */}
                <div className="bg-[#1A1A1A] px-4 pb-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] md:p-5 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700]">
                    <div className="flex items-center gap-2.5 md:gap-4 min-w-0">
                        <div className="bg-[#FFD700] text-black p-2 md:p-3 rounded-xl md:rounded-2xl shadow-lg shrink-0"><Layout size={20} className="md:w-6 md:h-6"/></div>
                        <div className="min-w-0">
                            <h3 className="font-serif font-black text-base md:text-xl tracking-wide truncate">战略与决策中心</h3>
                            <p className="text-[8px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5 truncate">STRATEGY & DIGITAL BOARDROOM</p>
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <ModuleGuideButton module="HR" />
                        <button onClick={onClose} className="mobile-touch-target p-2 hover:bg-white/10 rounded-full flex items-center justify-center"><X size={24}/></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white border-b border-gray-200 px-3 md:px-6 pt-2 md:pt-4 pb-1 md:pb-2 flex gap-2 md:gap-4 overflow-x-auto shrink-0">
                    {[
                        { id: 'VOTING', label: '决策投票 (Boardroom)', icon: Vote },
                        { id: 'OKR', label: '目标规划 (OKR)', icon: Target },
                        { id: 'MARKETING', label: '营销推广 (Marketing)', icon: Megaphone },
                        { id: 'EVENTS', label: '节日活动 (Events)', icon: Calendar }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`min-h-[44px] pb-2 md:pb-3 px-2 text-[11px] md:text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-4 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <tab.icon size={16}/> {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-[#F5F7FA]">
                    
                    {/* --- 1. VOTING (BOARDROOM) --- */}
                    {activeTab === 'VOTING' && (
                        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-[#1A1A1A]">股东提案与表决</h2>
                                    <p className="text-xs text-gray-500 font-bold mt-1">需 3/4 票数通过 (Majority 75% Required)</p>
                                </div>
                                <button onClick={() => { setNewProposal({ type: 'POLICY', budget: 0 }); setIsProposalModal(true); }} className="bg-[#1A1A1A] text-[#FFD700] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg hover:scale-105 transition-transform"><Plus size={16}/> 发起新提案</button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {proposals.length === 0 ? <div className="text-center py-20 text-gray-400 font-bold">暂无提案</div> : proposals.map(p => {
                                    const totalVotes = p.votes.approvals.length + p.votes.rejections.length;
                                    const hasVoted = p.votes.approvals.includes(currentUserId) || p.votes.rejections.includes(currentUserId);
                                    const isOpen = activeProposalId === p.id;

                                    return (
                                        <div key={p.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 relative overflow-hidden group hover:shadow-md transition-all">
                                            {/* Status Banner */}
                                            <div className={`absolute top-0 left-0 w-1.5 h-full ${p.status === 'APPROVED' ? 'bg-green-50' : p.status === 'REJECTED' ? 'bg-red-50' : 'bg-blue-50'}`}></div>
                                            
                                            <div className="flex-grow flex flex-col">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${p.type === 'EXPANSION' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{p.type}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold">Ref: {p.id.slice(-6)} • by {p.createdBy}</span>
                                                    </div>
                                                    <button onClick={() => handleDeleteProposal(p.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                                                </div>
                                                <h3 className="text-lg font-black text-[#1A1A1A] mb-2">{p.title}</h3>
                                                <p className="text-sm text-gray-600 font-medium leading-relaxed mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">{p.description}</p>
                                                
                                                <div className="mt-auto flex items-center justify-between">
                                                     <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                                                        <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded"><Users size={14}/> 预算: RM {p.budget.toLocaleString()}</span>
                                                        <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded"><Clock size={14}/> 截止: {p.deadline}</span>
                                                    </div>
                                                    <button onClick={() => setActiveProposalId(isOpen ? null : p.id)} className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                                                        <MessageCircle size={14}/> {p.comments?.length || 0} 评论 {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                                    </button>
                                                </div>

                                                {/* Discussion Section */}
                                                {isOpen && (
                                                    <div className="mt-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2">
                                                        <p className="text-xs font-black text-gray-400 uppercase mb-3">股东议事厅 (Discussion Board)</p>
                                                        <div className="space-y-3 mb-3 max-h-40 overflow-y-auto pr-2">
                                                            {p.comments?.map(c => (
                                                                <div key={c.id} className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="text-[10px] font-black text-gray-700">{c.author}</span>
                                                                        <span className="text-[9px] text-gray-400">{new Date(c.date).toLocaleDateString()}</span>
                                                                    </div>
                                                                    <p className="text-xs text-gray-600">{c.text}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <input 
                                                                type="text" 
                                                                placeholder="发表评论..." 
                                                                value={commentInput}
                                                                onChange={e => setCommentInput(e.target.value)}
                                                                className="flex-grow bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-blue-400"
                                                                onKeyDown={e => { if(e.key === 'Enter') handleAddComment(p.id); }}
                                                            />
                                                            <button onClick={() => handleAddComment(p.id)} className="bg-blue-600 text-white px-3 rounded-lg text-xs font-bold hover:bg-blue-700">发送</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Voting Section */}
                                            <div className="w-full md:w-64 bg-gray-50 rounded-2xl p-4 flex flex-col justify-between border border-gray-100 shrink-0">
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-black uppercase text-gray-400">Current Votes</span>
                                                        <span className={`text-xs font-black ${p.status === 'APPROVED' ? 'text-green-600' : 'text-blue-600'}`}>{p.votes.approvals.length} / 4 Approved</span>
                                                    </div>
                                                    {/* Progress Bar */}
                                                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden flex mb-4">
                                                        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(p.votes.approvals.length/4)*100}%` }}></div>
                                                        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(p.votes.rejections.length/4)*100}%` }}></div>
                                                    </div>
                                                    
                                                    {/* Avatars */}
                                                    <div className="flex gap-1 mb-4 justify-center">
                                                        {[1,2,3,4].map(i => {
                                                            const id = `00${i}`;
                                                            const votedYes = p.votes.approvals.includes(id);
                                                            const votedNo = p.votes.rejections.includes(id);
                                                            return (
                                                                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${votedYes ? 'bg-green-100 border-green-500 text-green-700' : votedNo ? 'bg-red-100 border-red-500 text-red-700' : 'bg-white border-gray-200 text-gray-300'}`}>
                                                                    {votedYes ? <CheckCircle2 size={14}/> : votedNo ? <X size={14}/> : `B${i}`}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>

                                                {p.status === 'VOTING' ? (
                                                    !hasVoted ? (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button onClick={() => handleVote(p.id, 'APPROVE')} className="bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-sm"><ThumbsUp size={14}/> 同意</button>
                                                            <button onClick={() => handleVote(p.id, 'REJECT')} className="bg-white border border-gray-200 hover:bg-red-50 text-red-500 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1"><ThumbsDown size={14}/> 反对</button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center text-xs font-bold text-gray-400 py-2 bg-gray-100 rounded-xl">您已投票 (Voted)</div>
                                                    )
                                                ) : (
                                                    <div className={`text-center text-xs font-black py-2 uppercase border-2 rounded-xl ${p.status === 'APPROVED' ? 'border-green-200 text-green-600 bg-green-50' : 'border-red-200 text-red-600 bg-red-50'}`}>
                                                        {p.status}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* --- 2. OKR --- */}
                    {activeTab === 'OKR' && (
                        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-black text-[#1A1A1A]">季度目标 (Objectives & Key Results)</h2>
                                <button onClick={() => { setNewOKR({ quarter: '2024 Q3', keyResults: [] }); setIsOKRModal(true); }} className="bg-[#1A1A1A] text-[#FFD700] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg"><Plus size={16}/> 新增目标</button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {okrs.length === 0 ? <div className="col-span-full text-center py-20 text-gray-400 font-bold">暂无 OKR</div> : okrs.map(okr => (
                                    <div key={okr.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className="bg-[#1A1A1A] text-[#FFD700] text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider">{okr.quarter}</span>
                                                <h3 className="font-black text-lg text-[#1A1A1A] mt-2 leading-tight">{okr.objective}</h3>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <button onClick={() => handleDeleteOKR(okr.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm border-4 ${okr.status === 'ON_TRACK' ? 'border-green-100 text-green-600' : 'border-orange-100 text-orange-600'}`}>
                                                    {okr.progress}%
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Main Progress Bar */}
                                        <div className="w-full h-2 bg-gray-100 rounded-full mb-6 overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${okr.status === 'ON_TRACK' ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${okr.progress}%` }}></div>
                                        </div>

                                        <div className="space-y-4">
                                            {okr.keyResults.map((kr, idx) => {
                                                const krProgress = (kr.current / kr.target) * 100;
                                                return (
                                                    <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                        <div className="flex justify-between text-xs font-bold mb-1">
                                                            <span className="text-gray-600">{kr.label}</span>
                                                            <span className="text-[#1A1A1A]">{kr.current} / {kr.target} {kr.unit}</span>
                                                        </div>
                                                        <input 
                                                            type="range" 
                                                            min="0" 
                                                            max={kr.target} 
                                                            value={kr.current} 
                                                            onChange={(e) => handleUpdateOKRProgress(okr, idx, parseInt(e.target.value))}
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- 3. MARKETING --- */}
                    {activeTab === 'MARKETING' && (
                        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-black text-[#1A1A1A]">营销战役 (Campaigns & ROI)</h2>
                                <button onClick={() => { setNewCampaign({ platform: 'FACEBOOK' }); setIsCampaignModal(true); }} className="bg-[#1A1A1A] text-[#FFD700] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg"><Plus size={16}/> 新增战役</button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {campaigns.length === 0 ? <div className="text-center py-20 text-gray-400 font-bold">暂无营销活动</div> : campaigns.map(camp => (
                                    <div key={camp.id} className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-6 group hover:shadow-md transition-all">
                                        <div className={`p-4 rounded-2xl ${camp.platform === 'FACEBOOK' ? 'bg-blue-600' : camp.platform === 'TIKTOK' ? 'bg-black' : camp.platform === 'XIAOHONGSHU' ? 'bg-red-500' : 'bg-gray-600'} text-white shadow-lg`}>
                                            {camp.platform === 'FACEBOOK' ? <Users size={24}/> : <Award size={24}/>}
                                        </div>
                                        
                                        <div className="flex-grow text-center md:text-left">
                                            <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                                                <h3 className="font-black text-lg text-[#1A1A1A]">{camp.name}</h3>
                                                <button onClick={() => toggleCampaignStatus(camp)} className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase cursor-pointer hover:opacity-80 transition-opacity ${camp.status === 'ACTIVE' ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-gray-500'}`}>
                                                    {camp.status}
                                                </button>
                                                <button onClick={() => handleDeleteCampaign(camp.id)} className="text-gray-300 hover:text-red-500 ml-2"><Trash2 size={12}/></button>
                                            </div>
                                            <p className="text-xs text-gray-400 font-mono">{camp.startDate} to {camp.endDate}</p>
                                        </div>

                                        {/* Metrics Grid */}
                                        <div className="grid grid-cols-3 gap-6 w-full md:w-auto bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                            <div className="text-center">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Budget</p>
                                                <p className="text-sm font-black text-[#1A1A1A]">RM {camp.budget}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Spend</p>
                                                <p className="text-sm font-black text-[#1A1A1A]">RM {camp.spend}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">ROI</p>
                                                <p className={`text-xl font-black ${camp.roi >= 2 ? 'text-green-500' : camp.roi > 1 ? 'text-yellow-500' : 'text-red-500'}`}>{camp.roi}x</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- 4. EVENTS --- */}
                    {activeTab === 'EVENTS' && (
                        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-black text-[#1A1A1A]">活动日历 (Event Calendar)</h2>
                                <button onClick={() => { setNewEvent({ type: 'PROMO' }); setIsEventModal(true); }} className="bg-[#1A1A1A] text-[#FFD700] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg"><Plus size={16}/> 新增活动</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {events.length === 0 ? <div className="col-span-full text-center py-20 text-gray-400 font-bold">暂无活动</div> : events.map(evt => {
                                    const isOpen = activeEventId === evt.id;
                                    return (
                                        <div key={evt.id} className={`p-5 rounded-[2rem] border-2 relative overflow-hidden transition-all shadow-sm ${evt.status === 'COMPLETED' ? 'bg-gray-50 border-gray-200' : 'bg-white border-red-100 hover:shadow-lg'}`}>
                                            <div className="absolute top-0 right-0 p-4 opacity-10"><Calendar size={64}/></div>
                                            <div className="relative z-10 flex flex-col h-full">
                                                <div className="flex justify-between items-start mb-2">
                                                    <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{evt.type}</p>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => toggleEventStatus(evt)} className="text-gray-300 hover:text-green-600"><CheckCircle2 size={14}/></button>
                                                        <button onClick={() => handleDeleteEvent(evt.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                                                    </div>
                                                </div>
                                                <h3 className="text-lg font-black text-[#1A1A1A] mb-2 leading-tight min-h-[3rem]">{evt.name}</h3>
                                                <div className="bg-[#1A1A1A] text-white inline-block px-3 py-1 rounded-lg text-xs font-mono font-bold shadow-md w-fit mb-4">
                                                    {evt.date}
                                                </div>
                                                
                                                {/* Checklist Preview / Toggle */}
                                                <div className="mt-auto">
                                                    <button onClick={() => setActiveEventId(isOpen ? null : evt.id)} className="text-xs font-bold text-gray-500 flex items-center gap-1 hover:text-[#1A1A1A]">
                                                        {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} 
                                                        任务清单 ({evt.checklist?.filter(t => t.done).length || 0}/{evt.checklist?.length || 0})
                                                    </button>
                                                    
                                                    {isOpen && (
                                                        <div className="mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100 animate-in slide-in-from-top-2">
                                                            <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                                                                {evt.checklist?.map(task => (
                                                                    <div key={task.id} onClick={() => toggleTaskDone(evt.id, task.id)} className="flex items-center gap-2 cursor-pointer group">
                                                                        {task.done ? <CheckSquare size={14} className="text-green-500"/> : <Square size={14} className="text-gray-400 group-hover:text-black"/>}
                                                                        <span className={`text-xs ${task.done ? 'text-gray-400 line-through' : 'text-gray-700 font-bold'}`}>{task.label}</span>
                                                                    </div>
                                                                ))}
                                                                {(!evt.checklist || evt.checklist.length === 0) && <p className="text-[10px] text-gray-400 italic">暂无任务</p>}
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <input 
                                                                    className="flex-grow bg-white border border-gray-200 rounded px-2 py-1 text-xs outline-none" 
                                                                    placeholder="Add task..." 
                                                                    value={newTaskText} 
                                                                    onChange={e => setNewTaskText(e.target.value)}
                                                                    onKeyDown={e => { if(e.key === 'Enter') addTaskToEvent(evt.id); }}
                                                                />
                                                                <button onClick={() => addTaskToEvent(evt.id)} className="bg-black text-white rounded p-1"><Plus size={14}/></button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {evt.status === 'COMPLETED' && <div className="absolute inset-0 bg-white/50 flex items-center justify-center pointer-events-none"><div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl font-black border-2 border-green-200 transform -rotate-12 shadow-lg">COMPLETED</div></div>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* --- MODALS (Enhanced for Mobile: Bottom Sheet Style) --- */}
            {isProposalModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-lg h-[90vh] md:h-auto md:max-h-[90vh] rounded-t-[2rem] md:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 md:zoom-in-95 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl text-[#1A1A1A]">发起提案</h3><button onClick={() => setIsProposalModal(false)}><X/></button></div>
                        
                        {/* Templates - Collapsible */}
                        <div className="mb-6 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                            <div onClick={() => setShowTemplates(!showTemplates)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors">
                                <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Zap size={12}/> 策划草案模板 (Strategy Templates)</p>
                                {showTemplates ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                            </div>
                            
                            {showTemplates && (
                                <div className="p-4 pt-0 grid grid-cols-1 gap-2 animate-in slide-in-from-top-2">
                                    {PROPOSAL_TEMPLATES.map((t, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => setNewProposal({ ...t as any, deadline: new Date().toISOString().split('T')[0] })} 
                                            className="bg-white border border-gray-200 px-4 py-3 rounded-xl text-left hover:border-[#FFD700] hover:shadow-md transition-all flex items-center gap-3 group"
                                        >
                                            <div className="bg-gray-100 p-2 rounded-lg text-gray-600 group-hover:text-[#1A1A1A]"><t.icon size={18}/></div>
                                            <div>
                                                <p className="text-xs font-black text-[#1A1A1A]">{t.title}</p>
                                                <p className="text-[9px] text-gray-400 line-clamp-1">{t.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div><label className={LABEL_STYLE}>Title (标题)</label><input className={INPUT_STYLE} value={newProposal.title || ''} onChange={e => setNewProposal({...newProposal, title: e.target.value})} placeholder="Proposal Title"/></div>
                            <div><label className={LABEL_STYLE}>Type (类型)</label><select className={INPUT_STYLE} value={newProposal.type} onChange={e => setNewProposal({...newProposal, type: e.target.value as any})}><option value="POLICY">Policy (政策)</option><option value="EXPANSION">Expansion (扩张)</option><option value="MARKETING">Marketing (营销)</option><option value="MENU">Menu (菜单)</option></select></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={LABEL_STYLE}>Budget (RM)</label><input type="number" className={INPUT_STYLE} value={newProposal.budget || ''} onChange={e => setNewProposal({...newProposal, budget: parseFloat(e.target.value)})} placeholder="0.00"/></div>
                                <div><label className={LABEL_STYLE}>Deadline</label><input type="date" className={INPUT_STYLE} value={newProposal.deadline} onChange={e => setNewProposal({...newProposal, deadline: e.target.value})}/></div>
                            </div>
                            <div><label className={LABEL_STYLE}>Description</label><textarea className={`${INPUT_STYLE} h-24 resize-none`} value={newProposal.description || ''} onChange={e => setNewProposal({...newProposal, description: e.target.value})} placeholder="Details..."/></div>
                            <button onClick={handleCreateProposal} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black mt-2 mb-safe">正式发起投票</button>
                        </div>
                    </div>
                </div>
            )}

            {isOKRModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-lg h-[90vh] md:h-auto md:max-h-[90vh] rounded-t-[2rem] md:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 md:zoom-in-95 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl text-[#1A1A1A]">设定 OKR</h3><button onClick={() => setIsOKRModal(false)}><X/></button></div>
                        
                        {/* Templates - Collapsible */}
                        <div className="mb-6 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                            <div onClick={() => setShowTemplates(!showTemplates)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors">
                                <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Target size={12}/> 核心KPI目标模板 (Target Templates)</p>
                                {showTemplates ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                            </div>
                            
                            {showTemplates && (
                                <div className="p-4 pt-0 grid grid-cols-1 gap-2 animate-in slide-in-from-top-2">
                                    {OKR_TEMPLATES.map((t, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => setNewOKR({ ...t as any, id: `okr_${Date.now()}`, quarter: '2024 Q4' })} 
                                            className="bg-white border border-gray-200 px-4 py-3 rounded-xl text-left hover:border-blue-400 hover:shadow-md transition-all flex items-center gap-3 group"
                                        >
                                            <div className="bg-blue-50 p-2 rounded-lg text-blue-600 group-hover:text-blue-800"><t.icon size={18}/></div>
                                            <p className="text-xs font-black text-[#1A1A1A]">{t.objective}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div><label className={LABEL_STYLE}>Objective (目标)</label><input className={INPUT_STYLE} value={newOKR.objective || ''} onChange={e => setNewOKR({...newOKR, objective: e.target.value})} placeholder="e.g. Increase Revenue"/></div>
                            <div><label className={LABEL_STYLE}>Quarter</label><input className={INPUT_STYLE} value={newOKR.quarter} onChange={e => setNewOKR({...newOKR, quarter: e.target.value})} placeholder="2024 Q3"/></div>
                            
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div className="flex justify-between items-center mb-2"><label className={LABEL_STYLE}>Key Results (关键结果)</label><button onClick={addKeyResult} className="text-xs bg-black text-white px-2 py-1 rounded font-bold">+ Add KR</button></div>
                                {newOKR.keyResults?.map((kr, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2">
                                        <input className={`${INPUT_STYLE} flex-grow`} placeholder="Label" value={kr.label} onChange={e => { const k = [...newOKR.keyResults!]; k[idx].label = e.target.value; setNewOKR({...newOKR, keyResults: k}); }} />
                                        <input type="number" className={`${INPUT_STYLE} w-20`} placeholder="Target" value={kr.target} onChange={e => { const k = [...newOKR.keyResults!]; k[idx].target = parseFloat(e.target.value); setNewOKR({...newOKR, keyResults: k}); }} />
                                        <input className={`${INPUT_STYLE} w-16`} placeholder="Unit" value={kr.unit} onChange={e => { const k = [...newOKR.keyResults!]; k[idx].unit = e.target.value; setNewOKR({...newOKR, keyResults: k}); }} />
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleCreateOKR} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black mt-2 mb-safe">部署 OKR</button>
                        </div>
                    </div>
                </div>
            )}

            {isCampaignModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-md h-[90vh] md:h-auto md:max-h-[90vh] rounded-t-[2rem] md:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 md:zoom-in-95 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl text-[#1A1A1A]">新增营销战役</h3><button onClick={() => setIsCampaignModal(false)}><X/></button></div>
                        
                        {/* Templates - Collapsible */}
                        <div className="mb-6 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                            <div onClick={() => setShowTemplates(!showTemplates)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors">
                                <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Megaphone size={12}/> 爆款营销模板 (Marketing Templates)</p>
                                {showTemplates ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                            </div>
                            
                            {showTemplates && (
                                <div className="p-4 pt-0 grid grid-cols-1 gap-2 animate-in slide-in-from-top-2">
                                    {CAMPAIGN_TEMPLATES.map((t, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => setNewCampaign({ ...t as any, startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] })} 
                                            className="bg-white border border-gray-200 px-4 py-3 rounded-xl text-left hover:border-pink-400 hover:shadow-md transition-all flex items-center gap-3 group"
                                        >
                                            <div className="bg-pink-50 p-2 rounded-lg text-pink-600 group-hover:text-pink-800"><t.icon size={18}/></div>
                                            <p className="text-xs font-black text-[#1A1A1A]">{t.name}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div><label className={LABEL_STYLE}>Campaign Name</label><input className={INPUT_STYLE} value={newCampaign.name || ''} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} placeholder="e.g. CNY Promo"/></div>
                            <div><label className={LABEL_STYLE}>Platform</label><select className={INPUT_STYLE} value={newCampaign.platform} onChange={e => setNewCampaign({...newCampaign, platform: e.target.value as any})}><option value="FACEBOOK">Facebook</option><option value="TIKTOK">TikTok</option><option value="XIAOHONGSHU">Xiaohongshu</option><option value="OFFLINE">Offline</option></select></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={LABEL_STYLE}>Budget (RM)</label><input type="number" className={INPUT_STYLE} value={newCampaign.budget || ''} onChange={e => setNewCampaign({...newCampaign, budget: parseFloat(e.target.value)})} placeholder="0.00"/></div>
                                <div><label className={LABEL_STYLE}>Spend (Actual)</label><input type="number" className={INPUT_STYLE} value={newCampaign.spend || ''} onChange={e => setNewCampaign({...newCampaign, spend: parseFloat(e.target.value)})} placeholder="0.00"/></div>
                            </div>
                            
                            {/* ROI Calculator */}
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <label className="text-[10px] font-bold text-blue-700 uppercase mb-1 block flex items-center gap-1"><Calculator size={12}/> ROI 计算器 (ROI Calculator)</label>
                                <div className="flex gap-2 items-center">
                                    <div className="flex-grow">
                                        <input type="number" className={INPUT_STYLE} value={calcRevenue} onChange={e => setCalcRevenue(e.target.value)} placeholder="带来营收 (Generated Revenue)" />
                                    </div>
                                    <button 
                                        onClick={() => { 
                                            const rev = parseFloat(calcRevenue);
                                            const cost = newCampaign.budget || 1;
                                            if(rev >= 0) {
                                                const roiVal = parseFloat((rev/cost).toFixed(2));
                                                setNewCampaign({...newCampaign, roi: roiVal});
                                            }
                                        }} 
                                        className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm"
                                    >
                                        计算
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={LABEL_STYLE}>Start Date</label><input type="date" className={INPUT_STYLE} value={newCampaign.startDate} onChange={e => setNewCampaign({...newCampaign, startDate: e.target.value})} /></div>
                                <div><label className={LABEL_STYLE}>End Date</label><input type="date" className={INPUT_STYLE} value={newCampaign.endDate} onChange={e => setNewCampaign({...newCampaign, endDate: e.target.value})} /></div>
                            </div>
                            <button onClick={handleCreateCampaign} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black mt-2 mb-safe">开启营销计划</button>
                        </div>
                    </div>
                </div>
            )}

            {isEventModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-sm h-[90vh] md:h-auto md:max-h-[90vh] rounded-t-[2rem] md:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 md:zoom-in-95 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl text-[#1A1A1A]">新增活动</h3><button onClick={() => setIsEventModal(false)}><X/></button></div>
                        
                        {/* Templates - Collapsible */}
                        <div className="mb-6 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                            <div onClick={() => setShowTemplates(!showTemplates)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors">
                                <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Calendar size={12}/> 节日与庆典模板 (Event Templates)</p>
                                {showTemplates ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                            </div>
                            
                            {showTemplates && (
                                <div className="p-4 pt-0 grid grid-cols-1 gap-2 animate-in slide-in-from-top-2">
                                    {EVENT_TEMPLATES.map((t, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => setNewEvent({ ...t as any, date: new Date().toISOString().split('T')[0] })} 
                                            className="bg-white border border-gray-200 px-4 py-3 rounded-xl text-left hover:border-rose-400 hover:shadow-md transition-all flex items-center gap-3 group"
                                        >
                                            <div className="bg-rose-50 p-2 rounded-lg text-rose-600 group-hover:text-rose-800"><t.icon size={18}/></div>
                                            <p className="text-xs font-black text-[#1A1A1A]">{t.name}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div><label className={LABEL_STYLE}>Event Name</label><input className={INPUT_STYLE} value={newEvent.name || ''} onChange={e => setNewEvent({...newEvent, name: e.target.value})} placeholder="e.g. Staff Party"/></div>
                            <div><label className={LABEL_STYLE}>Date</label><input type="date" className={INPUT_STYLE} value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} /></div>
                            <div><label className={LABEL_STYLE}>Type</label><select className={INPUT_STYLE} value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value as any})}><option value="PROMO">Promotion (促销)</option><option value="HOLIDAY">Holiday (节日)</option><option value="TEAM_BUILDING">Team Building (团建)</option></select></div>
                            <button onClick={handleCreateEvent} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black mt-2 mb-safe">添加到日历</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
