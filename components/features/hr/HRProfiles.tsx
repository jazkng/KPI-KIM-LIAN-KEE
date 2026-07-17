import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Plus, Search, Edit3, Save, Trash2, ArrowLeft, CheckCircle2, Clock, Ban, Lock, Camera, ChevronUp, ChevronDown, Trophy, Shield, ShieldCheck, Settings2, Syringe, GraduationCap, Shirt, Ruler, Weight, History, Hash, HardDrive, LogOut, FileDown, Loader2, X, MapPin, Mail, Phone, Calendar, Briefcase, CreditCard, Eye, EyeOff, Activity, AlertTriangle, Zap, ClipboardList, Stethoscope, BookOpen, Printer, Archive, Home, CalendarDays, MessageSquarePlus, ThumbsUp, ThumbsDown, StickyNote, Crown, Image as ImageIcon, Medal, Layout, CheckSquare, Square, Star, Settings, Wallet } from 'lucide-react';
import { Employee, EmployeeAttributes, AppModule, WarningRecord, SalaryRecord, AttendanceRecord, ReviewRecord, LoanRecord, AssessmentRecordV2, InventoryAccessConfig, PortalRole } from '../../../types';
import { DataManager } from '../../../utils/dataManager';
import { uploadToCloudinary } from '../../utils';
import { DEFAULT_ROLES, NATIONALITY_OPTS, BANK_OPTIONS, MODULE_DEFINITIONS } from '../../constants';
import { AssessmentHistoryPanel } from '../AssessmentHistoryPanel';
import { JOB_METRICS, EMPLOYEE_DIMENSIONS, MANAGEMENT_DIMENSIONS, classifyJob } from '../assessmentConfig';
import { DepartmentMigrationBanner, DEPARTMENTS, getRecommendedDept } from './DepartmentMigrationBanner';
import { getOrgLevel, getOrgLevelLabel, getPortalRole, ORG_LEVEL_OPTIONS, PORTAL_ROLE_OPTIONS } from '../../../utils/orgAccess';
import { INVENTORY_PERMISSION_LABELS, INVENTORY_PERMISSIONS, INVENTORY_SCOPE_LABELS, resolveInventoryAccess } from '../../../utils/inventoryAccess';
import { InventoryAccessModal } from './InventoryAccessModal';

import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas-pro';
import { applyResolvedStylesForPdf } from '../../../utils/pdfStyleResolver';


// --- SHARED HELPERS (SYNCED WITH ASSESSMENT MODULE) ---
const getAverageScore = (attrs?: EmployeeAttributes) => {
    if (!attrs) return 0;
    const values = Object.values(attrs);
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round(sum / values.length);
};

const ABILITY_TIERS = [
    { label: 'SSS', score: 100, desc: '卓越传奇 (Legendary)', color: 'bg-amber-100 text-amber-800 border-amber-300 ring-amber-500', icon: Trophy },
    { label: 'SS',  score: 95,  desc: '翘楚之秀 (Elite)', color: 'bg-rose-100 text-rose-700 border-rose-200 ring-rose-500', icon: Crown },
    { label: 'S',   score: 85,  desc: '模范标兵 (Model)', color: 'bg-purple-100 text-purple-700 border-purple-200 ring-purple-500', icon: Medal },
    { label: 'A',   score: 70,  desc: '核心骨干 (Excellent)', color: 'bg-green-100 text-green-700 border-green-200 ring-green-500', icon: Star },
    { label: 'B',   score: 50,  desc: '合格称职 (Competent)', color: 'bg-blue-100 text-blue-700 border-blue-200 ring-blue-500', icon: CheckCircle2 },
    { label: 'C',   score: 30,  desc: '有待整改 (Needs Improvement)', color: 'bg-orange-100 text-orange-700 border-orange-200 ring-orange-500', icon: AlertTriangle },
    { label: 'D',   score: 10,  desc: '不合格 (Fail)', color: 'bg-red-100 text-red-700 border-red-200 ring-red-500', icon: X },
];

const ATTRIBUTE_CONFIG: Record<string, { label: string; desc: string }> = {
    efficiency: { label: '工作效率 (Efficiency)', desc: '出餐/服务速度，动作麻利程度' },
    service: { label: '服务态度 (Service)', desc: '对待客人的礼貌、微笑与耐心' },
    culinary: { label: '岗位技能 (Skill)', desc: '烹饪火候 / 摆盘 / 清洁标准' },
    leadership: { label: '团队配合 (Teamwork)', desc: '与同事沟通协作，不计较，服从安排' },
    discipline: { label: '纪律考勤 (Discipline)', desc: '不迟到早退，遵守公司 S.O.P' }
};

const getGradeInfo = (score: number) => {
    if (score >= 100) return ABILITY_TIERS[0];  // SSS
    if (score >= 90) return ABILITY_TIERS[1];   // SS
    if (score >= 80) return ABILITY_TIERS[2];   // S
    if (score >= 60) return ABILITY_TIERS[3];   // A
    if (score >= 40) return ABILITY_TIERS[4];   // B
    if (score >= 20) return ABILITY_TIERS[5];   // C
    return ABILITY_TIERS[6];                    // D
};

const InputField = ({ label, value, onChange, placeholder, type = "text", isEditing, className = "" }: any) => (
    <div className={className}>
        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{label}</label>
        {isEditing ? (
            <input 
                type={type} 
                value={value || ''} 
                onChange={onChange} 
                inputMode={type === 'number' ? 'decimal' : undefined}
                className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#1A1A1A] outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/50 transition-all" 
                style={{ fontSize: '16px', minHeight: '48px' }}
                placeholder={placeholder} 
            />
        ) : (
            <div className="text-sm font-bold text-[#1A1A1A] p-2 border border-transparent break-words min-h-[36px]">{value || '-'}</div>
        )}
    </div>
);

const SelectField = ({ label, value, onChange, options, isEditing }: any) => (
    <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{label}</label>
        {isEditing ? (
            <select 
                value={value || ''} 
                onChange={onChange} 
                className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#1A1A1A] outline-none focus:border-[#FFD700]"
                style={{ fontSize: '16px', minHeight: '48px' }}
            >
                <option value="">Select...</option>
                {options.map((opt: any) => {
                    const val = typeof opt === 'string' ? opt : opt.value;
                    const lab = typeof opt === 'string' ? opt : opt.label;
                    return <option key={val} value={val}>{lab}</option>;
                })}
            </select>
        ) : (
            <div className="text-sm font-bold text-[#1A1A1A] p-2 border border-transparent truncate">{
                typeof options[0] === 'string' ? (value || '-') : (options.find((o: any) => o.value === value)?.label || value || '-')
            }</div>
        )}
    </div>
);

const AbilityRadar = ({ attributes }: { attributes?: EmployeeAttributes }) => {
    const isAssessing = !attributes || Object.keys(attributes).length === 0 || Object.values(attributes).every((val: number) => val === 0);
    const avgScore = getAverageScore(attributes);
    const overallGrade = getGradeInfo(avgScore);

    if (isAssessing) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 min-h-[180px] animate-in fade-in">
                <div className="bg-white p-4 rounded-full shadow-sm mb-3 border border-gray-100"><ClipboardList size={28} className="text-gray-300"/></div>
                <span className="text-sm font-black text-gray-500">评估中... (Assessing)</span>
                <span className="text-[10px] text-gray-400 mt-1 font-bold bg-white px-2 py-0.5 rounded border border-gray-100">暂无评分数据 (No Data)</span>
            </div>
        );
    }
    
    return (
        <div className="space-y-3">
             <div className={`p-3 rounded-xl border flex items-center justify-between ${overallGrade.color.replace('text-', 'bg-opacity-10 text-')}`}>
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg bg-white shadow-sm ${overallGrade.color.split(' ')[1]}`}>
                        <overallGrade.icon size={16}/>
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase opacity-60">Overall Grade</p>
                        <p className="text-lg font-black leading-none">{overallGrade.label}-Tier</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase opacity-60">Score</p>
                    <p className="text-lg font-mono font-black leading-none">{avgScore}</p>
                </div>
             </div>

            <div className="grid grid-cols-1 gap-2">
                {Object.entries(attributes!).map(([key, val]) => {
                    const config = ATTRIBUTE_CONFIG[key] || { label: key, desc: '' };
                    const grade = getGradeInfo(val as number);
                    return (
                        <div key={key} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                            <div className="flex flex-col"><span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{config.label.split('(')[0]}</span><span className="text-[8px] text-gray-400 font-bold">{config.label.split('(')[1]?.replace(')', '')}</span></div>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm border ${grade.color} shadow-sm`}>{grade.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const AbilityAssessmentModal = ({ isOpen, onClose, attributes, onChange }: any) => {
    if (!isOpen) return null;
    const isUnset = !attributes || Object.values(attributes as Record<string, number>).every((v: number) => v === 0);
    const attrs = !isUnset ? attributes : { efficiency: 60, service: 60, culinary: 60, leadership: 60, discipline: 60 };
    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="bg-[#1A1A1A] p-4 flex justify-between items-center text-white shrink-0"><h3 className="font-black text-lg flex items-center gap-2"><Trophy size={18} className="text-[#FFD700]"/> 能力评估 (Assessment)</h3><button onClick={onClose}><X size={20} className="text-white/50 hover:text-white"/></button></div>
                <div className="p-6 overflow-y-auto space-y-6 bg-gray-50 flex-grow">
                    {Object.keys(attrs).map(key => {
                        const config = ATTRIBUTE_CONFIG[key] || { label: key, desc: 'N/A' };
                        const currentVal = attrs[key as keyof EmployeeAttributes];
                        return (
                            <div key={key} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="mb-3"><h4 className="text-sm font-black text-[#1A1A1A]">{config.label}</h4><p className="text-[10px] text-gray-400 font-bold mt-0.5">{config.desc}</p></div>
                                <div className="flex justify-between gap-1">{ABILITY_TIERS.slice().reverse().map(tier => { const isSelected = getGradeInfo(currentVal).label === tier.label; return (<button key={tier.label} onClick={() => onChange({...attrs, [key]: tier.score})} className={`flex-1 py-2 rounded-lg flex flex-col items-center justify-center border-2 transition-all active:scale-95 ${isSelected ? `${tier.color} ring-2 ring-offset-1 border-transparent shadow-md font-black` : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100'}`}><span className="text-sm">{tier.label}</span>{isSelected && <span className="text-[8px] uppercase mt-0.5">{tier.desc.split(' ')[0]}</span>}</button>) })}</div>
                            </div>
                        );
                    })}
                </div>
                <div className="p-4 bg-white border-t border-gray-100 shrink-0"><button onClick={onClose} className="w-full bg-[#1A1A1A] hover:bg-black text-[#FFD700] py-4 rounded-xl font-black shadow-lg transition-colors flex items-center justify-center gap-2"><CheckCircle2 size={18}/> 完成评估 (Complete)</button></div>
            </div>
        </div>
    );
};

// --- UPDATED SYSTEM ACCESS MODAL WITH GROUPING ---
const SystemAccessModal = ({ isOpen, onClose, allowedModules, onToggle, assessmentTargets, onUpdateTargets, allEmployees }: any) => {
    const [isTargetConfigOpen, setIsTargetConfigOpen] = useState(false);

    if (!isOpen) return null;

    const MODULE_GROUPS = [
        {
            title: '核心管理 (Core Management)',
            modules: ['HR_FILES', 'REPORTS', 'ASSESSMENT', 'TREASURY', 'AP', 'BILLS', 'DAILY_ALERT', 'SELF_INVOICE'] as AppModule[],
            color: 'bg-red-50 text-red-700 border-red-100'
        },
        {
            title: '日常运营 (Daily Operations)',
            modules: ['SETTLEMENT', 'ATTENDANCE_CONSOLE', 'ROSTER','ROSTER_KITCHEN', 'LOGBOOK', 'SOP_INSPECT', 'QUEUE_MANAGER', 'KITCHEN_ALERT'] as AppModule[],
            color: 'bg-blue-50 text-blue-700 border-blue-100'
        },
        {
            title: '供应链与产品 (Supply & Product)',
            modules: ['PROCUREMENT', 'SUPPLIER_CONTACTS', 'MENU_MANAGEMENT', 'INVENTORY_VIEW', 'INVENTORY_CHECK'] as AppModule[],
            color: 'bg-orange-50 text-orange-700 border-orange-100'
        },
        {
            title: '库存区域 (Inventory Areas)',
            modules: ['INVENTORY_KITCHEN', 'INVENTORY_BAR', 'INVENTORY_GENERAL', 'INVENTORY_FUEL'] as AppModule[],
            color: 'bg-green-50 text-green-700 border-green-100'
        }
    ];

    const toggleGroup = (groupModules: AppModule[]) => {
        const allSelected = groupModules.every(m => allowedModules.includes(m));
        if (allSelected) {
            groupModules.forEach(m => { if (allowedModules.includes(m)) onToggle(m); });
        } else {
            groupModules.forEach(m => { if (!allowedModules.includes(m)) onToggle(m); });
        }
    };

    const AssessmentTargetSelector = () => {
        const groupedStaff = { 'KITCHEN': [], 'FLOOR': [], 'BAR': [], 'CLEANER': [] } as any;
        const currentTargets = assessmentTargets || [];

        allEmployees.forEach((e: Employee) => {
            if (e.isArchived || e.role.includes('Owner')) return;
            const r = e.role.toUpperCase();
            if (r.includes('CHEF') || r.includes('COOK') || r.includes('KITCHEN') || r.includes('头手') || r.includes('厨房')) groupedStaff['KITCHEN'].push(e);
            else if (r.includes('BAR') || r.includes('水吧')) groupedStaff['BAR'].push(e);
            else if (r.includes('CLEANER') || r.includes('DISH') || r.includes('洗碗')) groupedStaff['CLEANER'].push(e);
            else groupedStaff['FLOOR'].push(e);
        });

        const toggleTarget = (id: string) => {
            if (currentTargets.includes(id)) {
                onUpdateTargets(currentTargets.filter((t: string) => t !== id));
            } else {
                onUpdateTargets([...currentTargets, id]);
            }
        };

        const toggleGroupTargets = (groupKey: string) => {
            const groupIds = groupedStaff[groupKey].map((e: Employee) => e.id);
            const allIn = groupIds.every((id: string) => currentTargets.includes(id));
            
            if (allIn) {
                onUpdateTargets(currentTargets.filter((id: string) => !groupIds.includes(id)));
            } else {
                const toAdd = groupIds.filter((id: string) => !currentTargets.includes(id));
                onUpdateTargets([...currentTargets, ...toAdd]);
            }
        };

        return (
            <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-right">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h4 className="font-black text-lg">评测对象配置 (Targets)</h4>
                        <p className="text-xs text-gray-500">勾选该员工允许评测的人员</p>
                    </div>
                    <button onClick={() => setIsTargetConfigOpen(false)} className="bg-gray-200 p-2 rounded-full"><X size={20}/></button>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-6">
                    {Object.keys(groupedStaff).map(key => (
                        <div key={key}>
                             <div className="flex justify-between items-center mb-2">
                                <h5 className="font-black text-xs text-gray-500 uppercase tracking-widest">{key} TEAM</h5>
                                <button onClick={() => toggleGroupTargets(key)} className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded">Toggle All</button>
                             </div>
                             <div className="grid grid-cols-2 gap-2">
                                 {groupedStaff[key].map((e: Employee) => (
                                     <button 
                                        key={e.id} 
                                        onClick={() => toggleTarget(e.id)}
                                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${currentTargets.includes(e.id) ? 'bg-green-50 border-green-500 text-green-800' : 'bg-white border-gray-200 text-gray-500'}`}
                                     >
                                         <span className="text-xs font-bold truncate">{e.name}</span>
                                         {currentTargets.includes(e.id) && <CheckCircle2 size={14}/>}
                                     </button>
                                 ))}
                             </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t"><button onClick={() => setIsTargetConfigOpen(false)} className="w-full bg-[#1A1A1A] text-white py-3 rounded-xl font-bold">完成配置 (Done)</button></div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative">
                
                {isTargetConfigOpen && <AssessmentTargetSelector />}

                <div className="p-6 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                    <h3 className="font-black text-xl flex items-center gap-2"><Shield size={24} className="text-blue-600"/> 系统权限配置 (Access)</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-400"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto bg-[#F5F7FA] space-y-6">
                    {MODULE_GROUPS.map(group => {
                        const allSelected = group.modules.every(m => allowedModules.includes(m));
                        return (
                            <div key={group.title} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                <div className={`px-4 py-3 flex justify-between items-center border-b ${group.color} ${group.title.includes('Core') ? 'border-red-100' : 'border-gray-100'}`}>
                                    <h4 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                        <Layout size={14}/> {group.title}
                                    </h4>
                                    <button 
                                        onClick={() => toggleGroup(group.modules)}
                                        className="text-[10px] font-bold bg-white/50 px-2 py-1 rounded hover:bg-white transition-colors flex items-center gap-1"
                                    >
                                        {allSelected ? <CheckSquare size={12}/> : <Square size={12}/>} {allSelected ? '取消全选' : '全选'}
                                    </button>
                                </div>
                                <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {group.modules.map(mod => {
                                        const def = MODULE_DEFINITIONS[mod];
                                        if (!def) return null;
                                        const isSelected = allowedModules.includes(mod);
                                        return (
                                            <div 
                                                key={mod} 
                                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isSelected ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white shadow-md' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'}`}
                                            >
                                                <div 
                                                    className="flex-grow flex items-center gap-3 cursor-pointer"
                                                    onClick={() => onToggle(mod)} 
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white/20 text-[#FFD700]' : 'bg-gray-100 text-gray-400'}`}>
                                                        <def.icon size={16}/>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-[#1A1A1A]'}`}>{def.label.split('(')[0]}</div>
                                                        <div className={`text-[9px] truncate ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>{def.desc}</div>
                                                    </div>
                                                </div>
                                                
                                                {mod === 'ASSESSMENT' && isSelected && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setIsTargetConfigOpen(true); }}
                                                        className="p-1.5 bg-white/20 hover:bg-white/40 rounded-lg text-[#FFD700] ml-2"
                                                        title="配置评测对象"
                                                    >
                                                        <Settings size={14}/>
                                                    </button>
                                                )}

                                                <div className="ml-auto pointer-events-none">
                                                    {isSelected ? <CheckCircle2 size={16} className="text-green-400"/> : <div className="w-4 h-4 rounded-full border-2 border-gray-200"></div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 bg-white border-t border-gray-100 shrink-0">
                    <button onClick={onClose} className="w-full bg-[#1A1A1A] text-[#FFD700] py-4 rounded-xl font-black text-lg shadow-lg hover:bg-black transition-transform active:scale-[0.98]">
                        保存配置 (Save Configuration)
                    </button>
                </div>
            </div>
        </div>
    );
};
const getRoleChinese = (role?: string) => {
    if (!role) return '未分配'; // 💡 加上空值保护
    const match = role.match(/[（(]([^)）]+)[)）]/);
    return match ? match[1] : role;
};
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const DISCIPLINARY_TYPES = [{id: 'VERBAL', label: '口头警告 (Verbal)', color: 'text-yellow-600 bg-yellow-50'}, {id: 'WRITTEN', label: '书面警告 (Written)', color: 'text-orange-600 bg-orange-50'}, {id: 'FINAL', label: '最后警告 (Final)', color: 'text-red-600 bg-red-50'}];
const TERMINATION_TYPES = [
    { id: 'RESIGNED', label: '自辞 (Resigned)', color: 'bg-blue-50 text-blue-700', icon: '✋' },
    { id: 'FIRED', label: '辞退 (Fired)', color: 'bg-red-50 text-red-700', icon: '🚫' },
    { id: 'CONTRACT_END', label: '合约到期 (Contract End)', color: 'bg-gray-50 text-gray-700', icon: '📄' },
    { id: 'ABSCONDED', label: '旷工离职 (Absconded)', color: 'bg-orange-50 text-orange-700', icon: '💨' }
];

interface HRProfilesProps {
    employees: Employee[];
    onSave: (employees: Employee[]) => void;
    currentBossId?: string;
    currentEmployee?: Employee | null;  // ⭐ 用于评分系统 (决定是否能覆盖)
    isSuperAdminMode?: boolean;
    initialSelectedEmployeeId?: string | null;
    clearInitialSelectedEmployeeId?: () => void;
}

export const HRProfiles: React.FC<HRProfilesProps> = ({ 
    employees, 
    onSave, 
    currentBossId, 
    currentEmployee,
    isSuperAdminMode = false,
    initialSelectedEmployeeId,
    clearInitialSelectedEmployeeId
}) => {
    const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [form, setForm] = useState<Partial<Employee>>({});
    const [isUploading, setIsUploading] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [showResigned, setShowResigned] = useState(false); 
    const fileInputRef = useRef<HTMLInputElement>(null);
    const printRef = useRef<HTMLDivElement>(null); 
    const singleProfileRef = useRef<HTMLDivElement>(null); 
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingSinglePdf, setIsGeneratingSinglePdf] = useState(false);
    const [isSalaryExpanded, setIsSalaryExpanded] = useState(false);
    const [showAbilityModal, setShowAbilityModal] = useState(false);
    const [showAccessModal, setShowAccessModal] = useState(false);
    const [showInventoryAccessModal, setShowInventoryAccessModal] = useState(false);
    const [showWarningInput, setShowWarningInput] = useState(false);
    const [warnType, setWarnType] = useState('VERBAL');
    const [warnReason, setWarnReason] = useState('');
    const [showTerminateModal, setShowTerminateModal] = useState(false);
    const [terminationData, setTerminationData] = useState({ reason: '', date: new Date().toISOString().split('T')[0], noticeDate: '', type: 'RESIGNED' as string });
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [viewImage, setViewImage] = useState<string | null>(null);
    const [mobileDetailTab, setMobileDetailTab] = useState<'basic' | 'salary' | 'records'>('basic');

    // Auto focus when navigating from payroll tab
    useEffect(() => {
        if (initialSelectedEmployeeId) {
            const emp = employees.find(e => e.id === initialSelectedEmployeeId);
            if (emp) {
                setSelectedEmpId(emp.id);
                setIsEditing(false);
                setIsSalaryExpanded(false);
                setShowWarningInput(false);
                setShowPin(false);
                
                const copy = JSON.parse(JSON.stringify(emp));
                copy.orgLevel = getOrgLevel(copy);
                if (!copy.salaryMode) copy.salaryMode = copy.role.includes('Part-Time') || copy.role.includes('兼职') ? 'HOURLY' : 'MONTHLY';
                if (!copy.salaryHistory) copy.salaryHistory = [];
                if (!copy.warningHistory) copy.warningHistory = [];
                if (!copy.reviews) copy.reviews = [];
                if (!copy.allowedModules) copy.allowedModules = [];
                if (!copy.assessmentTargets) copy.assessmentTargets = [];
                if (!copy.loanRecords) copy.loanRecords = [];
                setForm(copy);
                
                if (emp.isArchived) {
                    setShowResigned(true);
                }
            }
            if (clearInitialSelectedEmployeeId) {
                clearInitialSelectedEmployeeId();
            }
        }
    }, [initialSelectedEmployeeId, employees, clearInitialSelectedEmployeeId]);
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [loanFormState, setLoanFormState] = useState({ type: 'BORROW' as 'BORROW' | 'REPAY', amount: 0, note: '', via: 'CASH' });
    
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewFormState, setReviewFormState] = useState({ content: '', type: 'NOTE' as 'PRAISE' | 'CRITICISM' | 'NOTE', image: '' });
    const reviewFileInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingReviewImage, setIsUploadingReviewImage] = useState(false);
    
    const [attendanceSnapshot, setAttendanceSnapshot] = useState<{ late: number, lateDates: string[], absent: number, work: number }>({ late: 0, lateDates: [], absent: 0, work: 0 });
    const [latestV2Assessment, setLatestV2Assessment] = useState<AssessmentRecordV2 | null>(null);
    const [loadingAssessment, setLoadingAssessment] = useState(false);

    const activeDimensions = useMemo(() => {
        const category = classifyJob(form.role || '');
        const jobDef = JOB_METRICS[category];
        const metrics = jobDef?.metrics && jobDef.metrics.length > 0 ? jobDef.metrics : EMPLOYEE_DIMENSIONS;
        
        return metrics.map((m) => {
            let score = 0;
            if (latestV2Assessment) {
                // 1. 获取管理层初评得分
                const initialScore = latestV2Assessment.initialRating?.metrics?.find(s => s.metricKey === m.key)?.score;
                const hasInitial = initialScore !== undefined;

                // 2. 获取所有非跳过的老板评分
                const activeBosses = Object.values(latestV2Assessment.bossRatings || {}).filter(b => !b.skipped);
                const bossScores = activeBosses
                    .map(b => b.metrics?.find(s => s.metricKey === m.key)?.score)
                    .filter((v): v is number => v !== undefined);
                const bossesCount = bossScores.length;
                const bossesAverage = bossesCount > 0 ? Math.round(bossScores.reduce((sum, s) => sum + s, 0) / bossesCount) : 0;

                // 3. 按照 50% 初评 + 50% 老板平均分 进行综合加权，与 calculateMultiRaterTotals 逻辑保持 100% 物理同步
                if (hasInitial && bossesCount > 0) {
                    score = Math.round(initialScore * 0.5 + bossesAverage * 0.5);
                } else if (hasInitial) {
                    score = initialScore;
                } else if (bossesCount > 0) {
                    score = bossesAverage;
                } else if (latestV2Assessment.ownerOverride) {
                    const override = latestV2Assessment.ownerOverride.metrics?.find(s => s.metricKey === m.key);
                    if (override) score = override.score;
                }
            } else {
                const legacy = (form.attributes || {}) as any;
                if (m.key === 'job_capability') {
                    score = legacy.efficiency || legacy.culinary || 0;
                } else if (m.key === 'loyalty') {
                    score = legacy.discipline || 0;
                } else if (m.key === 'teamwork') {
                    score = legacy.service || legacy.leadership || 0;
                } else if (m.key === 'personal_grooming') {
                    score = legacy.discipline || 0;
                } else {
                    score = 0;
                }
            }
            return {
                ...m,
                score
            };
        });
    }, [form.role, latestV2Assessment, form.attributes]);

    const v2OverallScore = useMemo(() => {
        if (latestV2Assessment) {
            return latestV2Assessment.finalScore || 0;
        }
        if (activeDimensions.length > 0) {
            const sum = activeDimensions.reduce((s, d) => s + d.score, 0);
            return Math.round(sum / activeDimensions.length);
        }
        return 0;
    }, [latestV2Assessment, activeDimensions]);

    const v2OverallGradeInfo = useMemo(() => {
        if (latestV2Assessment && latestV2Assessment.finalGrade) {
            return ABILITY_TIERS.find(t => t.label === latestV2Assessment.finalGrade) || ABILITY_TIERS[3];
        }
        return getGradeInfo(v2OverallScore);
    }, [latestV2Assessment, v2OverallScore]);

    const filteredEmployees = useMemo(() => {
        return employees.filter(e => {
            const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.includes(searchTerm);
            const archiveMatch = showResigned ? e.isArchived : !e.isArchived;
            return matchesSearch && archiveMatch;
        });
    }, [employees, searchTerm, showResigned]);

    const groupedEmployees = useMemo(() => {
        const groups: Record<string, Employee[]> = { 
            'OWNER': [],
            'KITCHEN': [], 
            'FLOOR': [], 
            'BAR': [], 
            'DISHWASH': [], 
            'BACK_OFFICE': [], 
            'OTHER': [] 
        };
        filteredEmployees.forEach(emp => {
            let dept = emp.department;
            if (!dept) {
                if (emp.role && (emp.role.includes('Owner') || emp.role.includes('老板') || emp.id === '002')) {
                    dept = 'OWNER';
                } else {
                    dept = getRecommendedDept(emp.role || '');
                }
            }
            const groupKey = groups[dept] ? dept : 'OTHER';
            groups[groupKey].push(emp);
        });
        Object.keys(groups).forEach(key => groups[key].sort((a, b) => parseInt(a.id) - parseInt(b.id)));
        return groups;
    }, [filteredEmployees]);

    const SECTIONS = [
        { id: 'OWNER', label: '👑 老板级别 (Owner)', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-100' },
        { id: 'KITCHEN', label: '🍳 厨房 (Kitchen)', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-100' },
        { id: 'FLOOR', label: '🛎️ 楼面 (Floor)', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-100' },
        { id: 'BAR', label: '🥤 吧台 (Bar)', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-100' },
        { id: 'DISHWASH', label: '🧹 洗碗 (Dishwash)', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-100' },
        { id: 'BACK_OFFICE', label: '💼 后勤 (Back Office)', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-100' },
        { id: 'OTHER', label: '🛡️ 其他 (Other)', bg: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-100' },
    ];

    useEffect(() => {
        if (!selectedEmpId) return;
        
        const fetchAttendance = async () => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const records = await DataManager.getAttendanceByMonth(currentMonth);
            const myRecords = records.filter(r => r.employeeId === selectedEmpId);
            
            let late = 0;
            const lateDates: string[] = [];
            let absent = 0; 
            let work = 0;

            myRecords.forEach(r => {
                if (r.status === 'LATE') {
                    late++;
                    lateDates.push(r.date.split('-')[2]);
                } else if (r.status === 'ABSENT') {
                    absent++;
                }
                if (r.clockIn) work++;
            });

            setAttendanceSnapshot({ late, lateDates, absent, work });
        };
        fetchAttendance();

    }, [selectedEmpId]);

    useEffect(() => {
        if (!selectedEmpId) {
            setLatestV2Assessment(null);
            return;
        }
        const loadLatestV2 = async () => {
            setLoadingAssessment(true);
            try {
                const data = await DataManager.getAssessmentRecordsByEmployee(selectedEmpId);
                const sorted = (data as AssessmentRecordV2[]).sort(
                    (a, b) => (b.quarter || '').localeCompare(a.quarter || '')
                );
                if (sorted.length > 0) {
                    setLatestV2Assessment(sorted[0]);
                } else {
                    setLatestV2Assessment(null);
                }
            } catch (err) {
                console.error("Failed to load latest V2 assessment:", err);
                setLatestV2Assessment(null);
            } finally {
                setLoadingAssessment(false);
            }
        };
        loadLatestV2();
    }, [selectedEmpId]);

    // 👑 iOS 优化：任何 modal 打开时，锁定 body 滚动
    useEffect(() => {
        const anyModalOpen = showAbilityModal || showAccessModal || showInventoryAccessModal || showTerminateModal || showDeleteModal || showLoanModal || showReviewModal || !!viewImage;
        if (anyModalOpen) {
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            return () => {
                const savedY = document.body.style.top;
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.width = '';
                window.scrollTo(0, parseInt(savedY || '0') * -1);
            };
        }
    }, [showAbilityModal, showAccessModal, showInventoryAccessModal, showTerminateModal, showDeleteModal, showLoanModal, showReviewModal, viewImage]);

    const handleSelect = (emp: Employee) => {
        setSelectedEmpId(emp.id);
        const copy = JSON.parse(JSON.stringify(emp));
                copy.orgLevel = getOrgLevel(copy);
        if (!copy.salaryMode) copy.salaryMode = copy.role.includes('Part-Time') || copy.role.includes('兼职') ? 'HOURLY' : 'MONTHLY';
        if (!copy.salaryHistory) copy.salaryHistory = [];
        if (!copy.warningHistory) copy.warningHistory = [];
        if (!copy.reviews) copy.reviews = [];
        if (!copy.allowedModules) copy.allowedModules = [];
        if (!copy.assessmentTargets) copy.assessmentTargets = [];
        if (!copy.loanRecords) copy.loanRecords = [];
        setForm(copy);
        setIsEditing(false);
        setIsSalaryExpanded(false);
        setShowWarningInput(false);
        setShowPin(false);
    };

    const handleAddNew = () => {
        const validIds = employees.map(e => parseInt(e.id)).filter(n => !isNaN(n));
        const sequenceIds = validIds.filter(n => n >= 1000 && n < 9000);
        const maxId = sequenceIds.length > 0 ? Math.max(...sequenceIds) : 1019;
        const newId = (maxId + 1).toString();
        const newEmp: Partial<Employee> = { 
            id: newId, 
            name: '', 
            role: 'Part-Time (兼职)', 
            status: 'PROBATION', 
            orgLevel: 'CREW',
            rank: 'CREW', 
            level: 'Probation', 
            phone: '', 
            joinDate: new Date().toISOString().split('T')[0], 
            nationality: 'Malaysian 🇲🇾', 
            basicSalary: 0, 
            salaryMode: 'MONTHLY', 
            allowedModules: [], 
            assessmentTargets: [],
            moduleProficiency: {}, 
            pin: '0000', 
            salaryHistory: [], 
            warningHistory: [], 
            reviews: [], 
            monthlyRestDays: 4, 
            hasHostel: false,
            preferredLanguage: 'zh_en'
        };
        setForm(newEmp);
        setSelectedEmpId(newId);
        setIsEditing(true);
    };

    const handleSaveForm = async () => {
        if (!form.name || !form.id) return alert("姓名和ID必填");
        const newEmployee = form as Employee;
        await DataManager.saveEmployee(newEmployee);
        const existingIdx = employees.findIndex(e => e.id === newEmployee.id);
        let newList;
        if (existingIdx >= 0) { newList = [...employees]; newList[existingIdx] = newEmployee; } else { newList = [...employees, newEmployee]; }
        onSave(newList);
        setIsEditing(false);
        alert("✅ 档案已保存 (Saved)");
    };

    const handleReviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setIsUploadingReviewImage(true); try { const url = await uploadToCloudinary(file); setReviewFormState(prev => ({ ...prev, image: url })); } catch (error) { alert('Upload Failed'); } finally { setIsUploadingReviewImage(false); if(reviewFileInputRef.current) reviewFileInputRef.current.value = ''; } };
    const handleAddReview = async () => { if (!reviewFormState.content.trim()) return; const newReview: ReviewRecord = { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], author: currentBossId ? 'Manager' : 'Admin', content: reviewFormState.content, type: reviewFormState.type, image: reviewFormState.image }; const updatedReviews = [newReview, ...(form.reviews || [])]; const updatedEmp = { ...form, reviews: updatedReviews } as Employee; await DataManager.saveEmployee(updatedEmp); setForm(updatedEmp); const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e); onSave(newList); setReviewFormState({ content: '', type: 'NOTE', image: '' }); };
    const handleDeleteReview = async (reviewId: string) => { if (!confirm("确定删除此条评语?")) return; const updatedReviews = (form.reviews || []).filter(r => r.id !== reviewId); const updatedEmp = { ...form, reviews: updatedReviews } as Employee; await DataManager.saveEmployee(updatedEmp); setForm(updatedEmp); const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e); onSave(newList); };
    const handleResetPin = () => { if(confirm(`Reset PIN for ${form.name} to 0000?`)) { setForm({ ...form, pin: '0000' }); alert("PIN Reset to 0000. Please save."); } };
    
    // --- LOAN HANDLERS ---
    const loanBalance = useMemo(() => {
        return (form.loanRecords || []).reduce((sum, r) => sum + (r.type === 'BORROW' ? r.amount : -r.amount), 0);
    }, [form.loanRecords]);
    
    const handleAddLoan = async () => {
        if (!loanFormState.amount || loanFormState.amount <= 0) return alert("请输入金额");
        if (loanFormState.type === 'REPAY' && loanFormState.amount > loanBalance) return alert(`还款金额不能超过欠款余额 RM ${loanBalance.toFixed(2)}`);
        const newRecord: LoanRecord = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            type: loanFormState.type,
            amount: loanFormState.amount,
            note: loanFormState.note || (loanFormState.type === 'BORROW' ? '借款' : '还款'),
            via: loanFormState.via
        };
        const updatedRecords = [newRecord, ...(form.loanRecords || [])];
        const updatedEmp = { ...form, loanRecords: updatedRecords } as Employee;
        await DataManager.saveEmployee(updatedEmp);
        setForm(updatedEmp);
        const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e);
        onSave(newList);
        setLoanFormState({ type: 'BORROW', amount: 0, note: '', via: 'CASH' });
        setShowLoanModal(false);
    };
    const handleDeleteLoan = async (loanId: string) => {
        if (!confirm("确定删除此借还款记录?")) return;
        const updatedRecords = (form.loanRecords || []).filter(r => r.id !== loanId);
        const updatedEmp = { ...form, loanRecords: updatedRecords } as Employee;
        await DataManager.saveEmployee(updatedEmp);
        setForm(updatedEmp);
        const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e);
        onSave(newList);
    };
    const handleTerminateClick = () => { 
        setTerminationData({ 
            reason: '', 
            date: new Date().toISOString().split('T')[0],  // 最后工作日默认今天（保持原逻辑）
            noticeDate: '',  // 通知日期留空，提醒用户这是回溯场景
            type: 'RESIGNED' 
        }); 
        setShowTerminateModal(true); 
    };
    const confirmTermination = async () => { 
        if (!terminationData.reason) return alert("请填写离职原因 (Reason required)"); 
        const updated = { 
            ...form, 
            status: 'TERMINATED', 
            isArchived: true, 
            terminationReason: terminationData.reason, 
            terminationDate: terminationData.date, 
            terminationType: terminationData.type,
            noticeDate: terminationData.noticeDate,
            settlementStatus: loanBalance > 0 ? 'PENDING' : 'SETTLED'
        }; 
        setForm(updated as Employee); 
        await DataManager.saveEmployee(updated as Employee); 
        const newList = employees.map(e => e.id === updated.id ? updated as Employee : e); 
        onSave(newList); 
        setShowTerminateModal(false); 
        setIsEditing(false); 
        alert(`✅ 员工已离职归档${loanBalance > 0 ? `\n⚠️ 该员工仍欠 RM ${loanBalance.toFixed(2)}，结算状态：待处理` : ''}`); 
    };
    const handleRestore = async () => { if (!confirm("确认复职该员工? (Restore Employee?)")) return; const updated = { ...form, status: 'PROBATION', isArchived: false, terminationReason: undefined, terminationDate: undefined }; setForm(updated as Employee); await DataManager.saveEmployee(updated as Employee); const newList = employees.map(e => e.id === updated.id ? updated as Employee : e); onSave(newList); setIsEditing(false); alert("✅ 员工已复职 (Restored)"); };
    const confirmDelete = async () => { if (!selectedEmpId || !form.name) return; try { await DataManager.deleteEmployee(selectedEmpId); const newList = employees.filter(e => e.id !== selectedEmpId); onSave(newList); setSelectedEmpId(null); setIsEditing(false); setShowDeleteModal(false); alert("✅ 档案已永久删除 (Deleted)"); } catch (e) { console.error(e); alert("❌ 删除失败 (Delete Failed)"); } };
    const addSalaryRecord = () => { const amountStr = prompt("输入新薪资 (New Amount):", form.basicSalary?.toString()); const reason = prompt("调整原因 (Reason):", "Annual Increment"); if(amountStr && reason) { const amount = parseFloat(amountStr); const newRecord: SalaryRecord = { date: new Date().toISOString().split('T')[0], amount: amount, adjustment: amount - (form.basicSalary || 0), percentage: 0, reason: reason }; setForm({ ...form, basicSalary: amount, salaryHistory: [newRecord, ...(form.salaryHistory || [])] }); } };
    const deleteSalaryRecord = (index: number) => { if(!form.salaryHistory) return; if(!confirm("确定删除此薪资记录? (Confirm Delete?)")) return; const newHistory = [...form.salaryHistory]; newHistory.splice(index, 1); setForm({...form, salaryHistory: newHistory}); };
    const confirmAddWarning = () => { if(!warnReason) return alert("请填写原因"); const newWarning: WarningRecord = { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], type: warnType as any, reason: warnReason, issuer: currentBossId || 'Admin' }; setForm({ ...form, warningHistory: [newWarning, ...(form.warningHistory || [])] }); setShowWarningInput(false); setWarnReason(''); };
    const handleToggleModule = (mod: AppModule) => {
        const current = form.allowedModules || [];
        let nextModules;
        if(current.includes(mod)) {
            nextModules = current.filter(m => m !== mod);
        } else {
            nextModules = [...current, mod];
        }
        setForm({
            ...form,
            allowedModules: nextModules,
            hasKitchenAlertPermission: nextModules.includes('KITCHEN_ALERT')
        });
    };
    const handleUpdateAssessmentTargets = (targets: string[]) => { setForm({ ...form, assessmentTargets: targets }); };
    const handleApplyInventoryAccess = (inventoryAccess: InventoryAccessConfig) => { setForm({ ...form, inventoryAccess }); };

    const canConfigureInventoryAccess = isSuperAdminMode || Boolean(
        currentEmployee && getPortalRole(currentEmployee) === PortalRole.BOSS
    );
    const resolvedInventoryAccess = resolveInventoryAccess(form as Employee);
    const enabledInventoryPermissions = INVENTORY_PERMISSIONS.filter(permission => resolvedInventoryAccess.permissions[permission]);
    
    const getTenure = (dateStr: string) => { if(!dateStr) return '-'; const start = new Date(dateStr); const now = new Date(); const diffTime = Math.abs(now.getTime() - start.getTime()); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); if(diffDays < 30) return `${diffDays} Days`; if(diffDays < 365) return `${Math.floor(diffDays/30)} Months`; return `${(diffDays/365).toFixed(1)} Years`; };
    const handleExportPDF = async () => { 
        if (!printRef.current) return; 
        setIsGeneratingPdf(true); 
        try { 
            await new Promise(resolve => setTimeout(resolve, 100)); 
            const canvas = await html2canvas(printRef.current, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('hr-profiles-all-export-root');
                    if (printRef.current && clonedEl) {
                        applyResolvedStylesForPdf(printRef.current as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            }); 
            const imgData = canvas.toDataURL('image/jpeg', 1.0); 
            const pdf = new jsPDF('p', 'mm', 'a4'); 
            const pdfWidth = pdf.internal.pageSize.getWidth(); 
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width; 
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight); 
            pdf.save(`Staff_Directory_${new Date().toISOString().split('T')[0]}.pdf`); 
        } catch (err) { 
            console.error("PDF Gen Error:", err); 
            alert("PDF 生成失败，请重试。"); 
        } finally { 
            setIsGeneratingPdf(false); 
        } 
    };
    const handleExportSinglePDF = async () => {
        if (!singleProfileRef.current || !form.id) return;
        setIsGeneratingSinglePdf(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            const canvas = await html2canvas(singleProfileRef.current, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById('hr-profile-single-export-root');
                    if (singleProfileRef.current && clonedEl) {
                        applyResolvedStylesForPdf(singleProfileRef.current as HTMLElement, clonedEl as HTMLElement);
                    }
                }
            });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Profile_${form.name}_${form.id}.pdf`);
        } catch (err) {
            console.error("Single PDF Gen Error:", err);
            alert("档案生成失败，请重试。");
        } finally {
            setIsGeneratingSinglePdf(false);
        }
    };

    // ✅ FIX: Added return statement and wrapped all JSX in a single parent container
    return (
        <div className="flex h-full overflow-hidden relative">

            {/* 🍎 iOS 优化版侧边栏 (Sidebar) */}
            <div className={`w-full md:w-80 lg:w-96 bg-[#F8F9FA] border-r border-gray-200 flex flex-col shrink-0 h-full relative ${selectedEmpId ? 'hidden md:flex' : 'flex'}`}>
                
                {/* 顶部操作区 (带 iOS 毛玻璃效果) */}
                <div className="sticky top-0 z-20 bg-[#F8F9FA]/80 backdrop-blur-xl border-b border-gray-200/60 p-4 pb-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-black text-xl text-[#1A1A1A] tracking-tight">员工通讯录</h3>
                        <div className="flex gap-2">
                            <button onClick={handleExportPDF} disabled={isGeneratingPdf} className="w-8 h-8 flex items-center justify-center bg-gray-200/80 hover:bg-blue-100 text-gray-700 hover:text-blue-700 rounded-full transition-all active:scale-90" title="导出名录">
                                {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                            </button>
                            <button onClick={handleAddNew} className="w-8 h-8 flex items-center justify-center bg-[#1A1A1A] text-[#FFD700] rounded-full hover:bg-black transition-all active:scale-90 shadow-md">
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                    
                    {/* iOS 风格搜索框 */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="搜索姓名 / ID..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-200/60 border-transparent rounded-xl font-medium text-[#1A1A1A] placeholder-gray-500 outline-none focus:bg-white focus:border-[#FFD700] focus:ring-2 focus:ring-[#FFD700]/30 transition-all"
                            style={{ fontSize: '16px', minHeight: '40px' }}
                        />
                    </div>
                    
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer pl-1 active:opacity-70 select-none">
                        <input type="checkbox" checked={showResigned} onChange={e => { setShowResigned(e.target.checked); setSelectedEmpId(null); }} className="w-4 h-4 rounded text-[#1A1A1A] focus:ring-[#1A1A1A] accent-[#1A1A1A]" />
                        <Archive size={14} /> {showResigned ? '仅显示已离职档案' : '隐藏已离职员工'}
                    </label>
                </div>

                {/* 员工列表区 */}
                <div className="flex-grow overflow-y-auto p-3 space-y-6 pb-safe mb-8 custom-scrollbar">
                    <DepartmentMigrationBanner
                        employees={employees}
                        onMigrationComplete={() => {
                            DataManager.getEmployees().then(updatedList => {
                                onSave(updatedList);
                            });
                        }}
                    />
                    {filteredEmployees.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            <Search size={32} className="mb-2 opacity-20" />
                            <span className="text-xs font-bold">无匹配的员工数据</span>
                        </div>
                    ) : (
                        SECTIONS.map(section => {
                            const items = groupedEmployees[section.id];
                            if (!items || items.length === 0) return null;
                            
                            return (
                                <div key={section.id} className="space-y-2">
                                    {/* 部门 Header */}
                                    <div className="sticky top-0 z-10 bg-[#F8F9FA]/90 backdrop-blur-md py-1 px-1 flex items-center justify-between">
                                        <span className={`text-xs font-black uppercase tracking-wider ${section.text}`}>
                                            {section.label}
                                        </span>
                                        <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                            {items.length}
                                        </span>
                                    </div>
                                    
                                    {/* 员工卡片 (iOS 圆角风格) */}
                                    <div className="space-y-1.5">
                                        {items.map(emp => {
                                            const isSelected = selectedEmpId === emp.id;
                                            const isTerminated = emp.status === 'TERMINATED' || emp.isArchived;
                                            
                                            return (
                                                <div 
                                                    key={emp.id} 
                                                    onClick={() => handleSelect(emp)} 
                                                    className={`group relative p-3 rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.98] flex items-center gap-3 border ${
                                                        isSelected 
                                                        ? 'bg-[#1A1A1A] text-white border-black shadow-lg shadow-black/10' 
                                                        : 'bg-white text-gray-700 border-gray-100 hover:border-gray-300 hover:shadow-sm'
                                                    } ${isTerminated ? 'opacity-60 grayscale' : ''}`}
                                                >
                                                    {/* 头像 */}
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 overflow-hidden shadow-sm ${
                                                        isSelected ? 'bg-gray-800 text-[#FFD700] ring-2 ring-[#FFD700]' : 'bg-gray-100 text-gray-400'
                                                    }`}>
                                                        {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" /> : (emp.name || 'U').charAt(0)}
                                                    </div>
                                                    
                                                    <div className="min-w-0 flex-grow space-y-1">
                                                        {/* 第一行：名字 + 警告标识 */}
                                                        <div className="flex justify-between items-center">
                                                            <div className={`text-sm font-black truncate ${isSelected ? 'text-white' : 'text-[#1A1A1A]'}`}>
                                                                {emp.name}
                                                            </div>
                                                            <div className="flex gap-1 shrink-0">
                                                                {(emp as any).loanRecords?.reduce((s: number, r: any) => s + (r.type === 'BORROW' ? r.amount : -r.amount), 0) > 0 && (
                                                                    <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-md text-[9px] font-black shadow-sm">欠</span>
                                                                )}
                                                                {emp.isArchived && (emp as any).settlementStatus === 'PENDING' && (
                                                                    <span className="bg-orange-400 text-white px-1.5 py-0.5 rounded-md text-[9px] font-black shadow-sm">⏳</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        {/* 第二行：主职 */}
                                                        <div className={`text-[11px] font-bold truncate ${isSelected ? 'text-[#FFD700]' : 'text-gray-500'}`}>
                                                            {getRoleChinese(emp.role)}
                                                        </div>

                                                        {/* 副职 badges */}
                                                        {(emp as any).secondaryRoles && (emp as any).secondaryRoles.length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {(emp as any).secondaryRoles.slice(0, 2).map((sr: string) => (
                                                                    <span
                                                                        key={sr}
                                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                                                            isSelected
                                                                            ? 'bg-white/15 text-white/70'
                                                                            : 'bg-gray-100 text-gray-500 border border-gray-200'
                                                                        }`}
                                                                    >
                                                                        {getRoleChinese(sr)}
                                                                    </span>
                                                                ))}
                                                                {(emp as any).secondaryRoles.length > 2 && (
                                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                                                        isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                                                                    }`}>
                                                                        +{(emp as any).secondaryRoles.length - 2}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* 第三行：状态与职级 (Soft Badges) */}
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {getOrgLevel(emp) !== 'CREW' && (
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                                                    getOrgLevel(emp) === 'OWNER' ? 'bg-[#FFD700] text-black' : 
                                                                    isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                                                                }`}>
                                                                    {getOrgLevelLabel(emp)}
                                                                </span>
                                                            )}
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                                                isSelected ? 'bg-white/20 text-white' : 
                                                                emp.status === 'CONFIRMED' ? 'bg-green-50 text-green-600' : 
                                                                emp.status === 'TERMINATED' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                                                            }`}>
                                                                {emp.status === 'CONFIRMED' ? '正式' : emp.status === 'TERMINATED' ? '离职' : '试用'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Detail View */}
            <div className={`flex-grow flex flex-col h-full bg-[#F5F7FA] overflow-y-auto relative ${!selectedEmpId ? 'hidden md:flex' : 'flex'}`}>
                {!selectedEmpId ? (
                    <div className="m-auto text-gray-400 flex flex-col items-center gap-4 px-6 text-center max-w-xs md:max-w-sm">
                        <div className="w-24 h-24 bg-gray-200/60 rounded-full flex items-center justify-center animate-pulse shrink-0">
                            <User size={48} className="opacity-20"/>
                        </div>
                        <p className="font-bold tracking-widest uppercase text-xs leading-relaxed">
                            Select an employee from the directory to view details
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Header Section */}
                        <div className={`bg-gradient-to-br p-5 pb-20 md:p-6 md:pb-28 relative shadow-lg shrink-0 ${form.isArchived ? 'from-gray-800 to-gray-900 grayscale' : 'from-[#1A1A1A] to-[#2A2A2A]'}`}>
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                            
                            {/* 顶部按钮栏 */}
                            <div className="flex justify-between items-start relative z-10 text-white gap-3">
                                <button onClick={() => setSelectedEmpId(null)} className="md:hidden p-2 -ml-2 bg-white/10 rounded-full hover:bg-white/20 active:scale-95 transition-all shrink-0">
                                    <ArrowLeft size={20}/>
                                </button>
                                
                                <div className="flex items-center justify-end gap-2 ml-auto flex-nowrap overflow-x-auto scrollbar-hide">
                                    {/* 借款按钮 —— 新加到前面，用户问过借款功能在哪 */}
                                    {!isEditing && !form.isArchived && (
                                        <button onClick={() => setShowLoanModal(true)} className="relative p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center gap-1.5 active:scale-95 shrink-0" title="借还款">
                                            <Wallet size={14}/>
                                            {loanBalance > 0 && (
                                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black flex items-center justify-center">!</span>
                                            )}
                                        </button>
                                    )}
                                    <button onClick={() => setShowReviewModal(true)} className="p-2 sm:px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shrink-0" title="记录评语">
                                        <MessageSquarePlus size={14}/> <span className="hidden sm:inline">评语</span>
                                    </button>
                                    <button onClick={handleExportSinglePDF} disabled={isGeneratingSinglePdf} className="p-2 sm:px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shrink-0" title="导出档案">
                                        {isGeneratingSinglePdf ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} <span className="hidden sm:inline">导出</span>
                                    </button>
                                    {isEditing ? (
                                        <>
                                            <button onClick={() => setIsEditing(false)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white active:scale-95 shrink-0">取消</button>
                                            <button onClick={handleSaveForm} className="px-4 py-2 bg-[#FFD700] hover:bg-[#E5C100] text-black rounded-xl text-xs font-black shadow-lg flex items-center gap-1.5 active:scale-95 shrink-0"><Save size={14}/> 保存</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setIsEditing(true)} className="px-3 py-2 bg-white text-black rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 hover:bg-gray-100 active:scale-95 shrink-0"><Edit3 size={14}/> 编辑</button>
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 md:mt-2 text-white relative z-10">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight flex items-center gap-3 break-all">
                                        {form.name || 'New Staff'}
                                    </h1>
                                    
                                    {v2OverallGradeInfo.label !== 'Fail' && (
                                        <div className={`px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-black uppercase flex items-center gap-1 border ${v2OverallGradeInfo.color} bg-opacity-100 shadow-lg shrink-0`}>
                                            {React.createElement(v2OverallGradeInfo.icon, { size: 12 })}
                                            {v2OverallGradeInfo.label}
                                        </div>
                                    )}
                                    {form.isArchived && <span className="bg-red-600 text-white text-[10px] md:text-xs px-2 py-1 rounded font-bold uppercase tracking-wider shrink-0">已离职</span>}
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-y-3 gap-x-4 mt-3 text-white/70 text-[10px] md:text-xs font-bold uppercase tracking-widest">
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <span className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md shrink-0">
                                            <Hash size={12}/> ID: {isEditing ? (<input value={form.id} onChange={e => setForm({...form, id: e.target.value})} className="bg-transparent border-b border-white/30 w-16 px-1 outline-none text-white font-mono" style={{ fontSize: '16px' }} inputMode="numeric"/>) : (form.id)}
                                        </span>
                                        <span className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md shrink-0">
                                            <Clock size={12}/> {getTenure(form.joinDate || '')}
                                        </span>
                                    </div>

                                    {/* 职位与副职编辑区 */}
                                    {isEditing ? (
                                        <div className="flex flex-col gap-3 w-full bg-black/20 p-3 rounded-xl border border-white/10 mt-1">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <span className="shrink-0 text-[#FFD700]">主职 (Primary):</span>
                                                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 outline-none font-bold w-full sm:w-auto" style={{ fontSize: '16px', minHeight: '40px' }}>
                                                    {DEFAULT_ROLES.map(r => <option key={r.id} value={r.title} className="text-black">{r.title}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:items-center gap-2 flex-wrap">
                                                <span className="shrink-0 text-white/70 mt-1 sm:mt-0">副职 (Secondary):</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {form.secondaryRoles?.map(sr => (
                                                        <span key={sr} className="bg-blue-500/20 text-blue-200 px-2 py-1 rounded-lg border border-blue-500/30 flex items-center gap-1 shrink-0">
                                                            {sr.split('(')[0]}
                                                            <button onClick={() => setForm({...form, secondaryRoles: form.secondaryRoles!.filter(r => r !== sr)})} className="hover:text-red-400 ml-1 p-0.5 active:scale-90"><X size={12}/></button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <select value="" onChange={e => { const newRole = e.target.value; if (newRole && !form.secondaryRoles?.includes(newRole) && newRole !== form.role) { setForm({...form, secondaryRoles: [...(form.secondaryRoles || []), newRole]}); } }} className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 outline-none font-bold cursor-pointer w-full sm:w-auto mt-1 sm:mt-0" style={{ fontSize: '16px', minHeight: '40px' }}>
                                                    <option value="" className="text-black">+ 添加副职</option>
                                                    {DEFAULT_ROLES.filter(r => r.title !== form.role && !form.secondaryRoles?.includes(r.title)).map(r => <option key={r.id} value={r.title} className="text-black">{r.title}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 mt-2 w-full">
                                            {/* 主职 + 副职 (统一 flex-wrap 布局，桌面端不再浪费空间) */}
                                            <div className="flex items-start gap-2 flex-wrap">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-white/40 w-8 shrink-0 mt-1.5">主职</span>
                                                <span className="bg-[#FFD700] text-black px-3 py-1.5 rounded-lg font-black text-xs shadow-md">
                                                    {form.role}
                                                </span>
                                                {form.secondaryRoles && form.secondaryRoles.length > 0 && (
                                                    <>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40 shrink-0 mt-1.5 ml-2 border-l border-white/20 pl-3">副职</span>
                                                        {form.secondaryRoles.map(sr => (
                                                            <span key={sr} className="bg-white/10 text-white/80 px-3 py-1.5 rounded-lg border border-white/20 text-xs font-bold shrink-0">
                                                                {sr}
                                                            </span>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="px-4 md:px-8 -mt-16 pb-20 space-y-6 relative z-10 max-w-6xl mx-auto w-full">
                            {form.isArchived && (<div className="bg-red-50 border-l-4 border-red-500 p-4 md:p-6 rounded-r-xl shadow-sm flex items-start gap-4"><div className="p-2 bg-red-100 rounded-full text-red-600 shrink-0"><Ban size={24}/></div><div><h4 className="text-red-800 font-black text-base md:text-lg">此员工已离职</h4><p className="text-red-600 text-xs md:text-sm font-bold mt-1">离职日期: {form.terminationDate || '未知'}</p><div className="mt-2 text-red-700 text-xs bg-white/50 p-3 rounded-lg border border-red-100 italic">"{form.terminationReason || '无记录原因'}"</div></div></div>)}

                            {/* Mobile-only tab switcher */}
                            <div className="flex md:hidden bg-white/90 backdrop-blur-md p-1 rounded-2xl border border-gray-200 sticky top-14 z-30 mb-4 gap-1 shadow-sm">
                                <button 
                                    onClick={() => setMobileDetailTab('basic')} 
                                    className={`flex-1 py-2.5 text-center rounded-xl text-xs font-black transition-all ${mobileDetailTab === 'basic' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    个人档案
                                </button>
                                <button 
                                    onClick={() => setMobileDetailTab('salary')} 
                                    className={`flex-1 py-2.5 text-center rounded-xl text-xs font-black transition-all ${mobileDetailTab === 'salary' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    薪资法定
                                </button>
                                <button 
                                    onClick={() => setMobileDetailTab('records')} 
                                    className={`flex-1 py-2.5 text-center rounded-xl text-xs font-black transition-all ${mobileDetailTab === 'records' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    评估记录
                                </button>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                                {/* 左侧列：头像、考勤、薪资卡片 */}
                                <div className="xl:col-span-4 flex flex-col gap-6">
                                    <div className={`bg-white rounded-[2rem] p-6 shadow-sm border border-gray-200 flex-col items-center justify-center relative overflow-hidden group ${mobileDetailTab === 'basic' ? 'flex' : 'hidden md:flex'}`}>
                                        <div className="relative w-32 h-32 md:w-40 md:h-40 mb-4 cursor-pointer" onClick={() => isEditing && fileInputRef.current?.click()}>
                                            <div className={`w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 shadow-xl bg-gray-100 relative z-10 ${form.isArchived ? 'border-gray-300 grayscale' : 'border-white'}`}>
                                                {form.avatar ? <img src={form.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl md:text-5xl text-gray-300 font-black">{(form.name || 'U').charAt(0)}</div>}
                                            </div>
                                            {isEditing && <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white z-20"><Camera size={24}/></div>}
                                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if(!file) return; setIsUploading(true); try { const url = await uploadToCloudinary(file); setForm({...form, avatar: url}); } catch(err) { alert("Upload Failed"); } finally { setIsUploading(false); } }} />
                                        </div>
                                        <div className="flex gap-2 flex-wrap justify-center">
                                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shrink-0 ${form.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : form.status === 'TERMINATED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {form.status === 'CONFIRMED' ? <CheckCircle2 size={12}/> : form.status === 'TERMINATED' ? <LogOut size={12}/> : <Clock size={12}/>}
                                                {form.status}
                                            </div>
                                            {form.orgLevel && (
                                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border shrink-0 ${getOrgLevel(form as Employee) === 'OWNER' ? 'bg-gray-800 text-[#FFD700] border-gray-800' : getOrgLevel(form as Employee) === 'BRANCH_MANAGER' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : getOrgLevel(form as Employee) === 'DEPARTMENT_HEAD' ? 'bg-red-100 text-red-700 border-red-200' : getOrgLevel(form as Employee) === 'TEAM_LEAD' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                    <Medal size={12}/> {getOrgLevelLabel(form as Employee)}
                                                </div>
                                            )}
                                            <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-blue-50 text-blue-700 shrink-0">{form.nationality}</div>
                                        </div>
                                    </div>
                                    
                                    <div className={`rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 transition-all ${attendanceSnapshot.late > 0 ? 'bg-red-50 border-red-200' : 'bg-white'} ${mobileDetailTab === 'basic' ? 'block' : 'hidden md:block'}`}>
                                        <h4 className={`text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${attendanceSnapshot.late > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                            <CalendarDays size={14}/> 本月考勤 (This Month)
                                        </h4>
                                        <div className="flex justify-between text-center mb-4 gap-2">
                                            <div className="flex-1">
                                                <div className={`text-xl md:text-2xl font-black ${attendanceSnapshot.late > 0 ? 'text-red-600' : 'text-gray-800'}`}>{attendanceSnapshot.late}</div>
                                                <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase">Late</div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-xl md:text-2xl font-black text-gray-800">{attendanceSnapshot.absent}</div>
                                                <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase">Absent</div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-xl md:text-2xl font-black text-green-600">{attendanceSnapshot.work}</div>
                                                <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase">Work Days</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'basic' ? 'block' : 'hidden md:block'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Lock size={14}/> 登录密码 (Access PIN)</h4>
                                        <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between border border-gray-100">
                                            <div className="flex items-center gap-3"><div className="p-2 bg-white rounded-xl shadow-sm"><Lock size={16} className="text-gray-400"/></div><div><p className="text-[10px] font-bold text-gray-400 uppercase">PIN CODE</p><p className="text-lg font-mono font-black text-[#1A1A1A] tracking-widest">{showPin ? (form.pin || '0000') : '••••'}</p></div></div>
                                            <button onClick={() => setShowPin(!showPin)} className="p-2 text-gray-400 hover:text-black transition-colors active:scale-90">{showPin ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                                        </div>
                                    </div>

                                    {/* 薪水卡片 */}
                                    <div className={`bg-[#1A1A1A] rounded-[2rem] shadow-lg text-white relative overflow-hidden group transition-all duration-300 ${form.isArchived ? 'grayscale opacity-80' : ''} ${mobileDetailTab === 'salary' ? 'block' : 'hidden md:block'}`}>
                                        <button onClick={() => setIsSalaryExpanded(!isSalaryExpanded)} className="w-full p-4 md:p-6 flex justify-between items-center text-left relative z-10 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 pr-2">
                                                <div className="p-2 bg-white/10 rounded-full text-[#FFD700] shrink-0"><div className="font-mono text-lg leading-none">$</div></div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] font-bold text-[#FFD700] uppercase tracking-widest truncate">Salary ({form.salaryMode || 'MONTHLY'})</p>
                                                    <p className="text-base md:text-xl font-mono font-black text-white truncate tabular-nums">RM {(form.basicSalary || 0).toLocaleString()}</p>
                                                    {/* 辅助信息做成 inline 小字，不再抢位置 */}
                                                    <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-white/50">
                                                        <span className="flex items-center gap-1">
                                                            <span className="text-white/30">休</span>
                                                            <span className="text-white/70">{form.monthlyRestDays || '-'}d</span>
                                                        </span>
                                                        <span className="w-px h-3 bg-white/20"/>
                                                        <span className="flex items-center gap-1">
                                                            <Home size={10} className={form.hasHostel ? "text-green-400" : "text-white/30"} />
                                                            <span className={form.hasHostel ? "text-green-400" : "text-white/40"}>{form.hasHostel ? '宿舍' : '无宿舍'}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-white/50 pl-2">
                                                {isSalaryExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                                            </div>
                                        </button>
                                        
                                        {isSalaryExpanded && (
                                            <div className="px-4 md:px-6 pb-6 relative z-10 animate-in slide-in-from-top-2">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                                    <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                                                        <label className="text-[10px] font-bold text-[#FFD700] uppercase mb-1 block">Monthly Rest Days</label>
                                                        {isEditing ? (
                                                            <select value={form.monthlyRestDays || 4} onChange={e => setForm({...form, monthlyRestDays: parseInt(e.target.value)})} className="bg-white/10 text-white font-bold rounded p-2 w-full outline-none border border-white/20" style={{ fontSize: '16px', minHeight: '40px' }}>
                                                                <option className="text-black" value={2}>2 Days</option>
                                                                <option className="text-black" value={3}>3 Days</option>
                                                                <option className="text-black" value={4}>4 Days</option>
                                                            </select>
                                                        ) : (
                                                            <p className="text-sm font-bold text-white">{form.monthlyRestDays || '-'} Days</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 flex items-center justify-between">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-[#FFD700] uppercase mb-1 block">Hostel</label>
                                                            <div className="text-xs font-bold text-white flex items-center gap-1 mt-0.5">
                                                                <Home size={14} className={form.hasHostel ? "text-green-400" : "text-white/40"}/> 
                                                                <span className={form.hasHostel ? "text-green-400" : "text-white/40"}>{form.hasHostel ? 'Provided' : 'No'}</span>
                                                            </div>
                                                        </div>
                                                        {isEditing && (
                                                            <input type="checkbox" checked={form.hasHostel || false} onChange={e => setForm({...form, hasHostel: e.target.checked})} className="w-5 h-5 accent-green-500 cursor-pointer" />
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 👑 Payroll Eligibility Toggle */}
                                                <div className="bg-white/10 p-3 rounded-xl border border-white/10 flex items-center justify-between mb-4">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-[#FFD700] uppercase mb-1 block">薪资结算资格 (Payroll Eligibility)</label>
                                                        <div className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5">
                                                            <Wallet size={14} className={(form.isPayrollEligible !== undefined ? form.isPayrollEligible : !(form.role || '').includes('Owner')) ? "text-green-400" : "text-white/40"}/> 
                                                            <span className={(form.isPayrollEligible !== undefined ? form.isPayrollEligible : !(form.role || '').includes('Owner')) ? "text-green-400" : "text-white/40"}>
                                                                {(form.isPayrollEligible !== undefined ? form.isPayrollEligible : !(form.role || '').includes('Owner')) ? '参与月度薪资结算 (Eligible)' : '豁免/不参与薪资结算 (Exempt)'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {isEditing && (
                                                        <input 
                                                            type="checkbox" 
                                                            checked={form.isPayrollEligible !== undefined ? form.isPayrollEligible : !(form.role || '').includes('Owner')} 
                                                            onChange={e => setForm({...form, isPayrollEligible: e.target.checked})} 
                                                            className="w-5 h-5 accent-green-500 cursor-pointer animate-pulse" 
                                                        />
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-end justify-between gap-3 mb-4 bg-white/5 p-3 rounded-xl">
                                                    <div className="flex-1 w-full sm:w-auto">
                                                         <label className="text-[10px] font-bold text-[#FFD700] uppercase mb-1 block">Basic Salary / Mode</label>
                                                         {isEditing ? (
                                                             <div className="flex flex-wrap items-center gap-2">
                                                                 <select value={form.salaryMode || 'MONTHLY'} onChange={(e) => setForm({...form, salaryMode: e.target.value as any})} className="bg-white/10 text-[#FFD700] font-bold uppercase tracking-widest border border-white/20 rounded px-2 py-2 outline-none cursor-pointer" style={{ fontSize: '16px', minHeight: '40px' }}>
                                                                     <option value="MONTHLY" className="text-black">Monthly</option>
                                                                     <option value="DAILY" className="text-black">Daily</option>
                                                                     <option value="HOURLY" className="text-black">Hourly</option>
                                                                 </select>
                                                                 <div className="flex items-center gap-1.5">
                                                                    <span className="text-sm text-white/50 font-bold">$</span>
                                                                    <input type="number" inputMode="decimal" value={form.basicSalary || 0} onChange={e => setForm({...form, basicSalary: parseFloat(e.target.value)})} className="bg-white/10 text-white rounded px-2 py-2 outline-none w-28 font-mono font-bold" style={{ fontSize: '16px', minHeight: '40px' }} />
                                                                 </div>
                                                             </div>
                                                         ) : (
                                                             <div className="text-xl md:text-2xl font-mono font-black break-all">RM {(form.basicSalary || 0).toLocaleString()}</div>
                                                         )}
                                                    </div>
                                                    {isEditing && <button onClick={addSalaryRecord} className="text-[10px] bg-[#FFD700] text-black px-3 py-2 rounded-lg font-bold shadow-md active:scale-95 transition-all shrink-0">+ Increment</button>}
                                                </div>
                                                
                                                <div className="space-y-3 pt-4 border-t border-white/10 mb-4">
                                                    <div className="flex flex-wrap justify-between items-center text-xs gap-2"><span className="text-white/60 shrink-0">Bank</span>{isEditing ? <select value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} className="bg-white/10 text-white rounded p-2 outline-none flex-1 max-w-[180px]" style={{ fontSize: '16px', minHeight: '40px' }}><option value="">Select</option>{BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}</select> : <span className="font-bold">{form.bankName || '-'}</span>}</div>
                                                    <div className="flex flex-wrap justify-between items-center text-xs gap-2"><span className="text-white/60 shrink-0">Account</span>{isEditing ? <input value={form.bankAccount || ''} onChange={e => setForm({...form, bankAccount: e.target.value})} className="bg-white/10 text-white rounded p-2 outline-none flex-1 max-w-[180px] text-right font-mono" style={{ fontSize: '16px', minHeight: '40px' }} inputMode="numeric" /> : <span className="font-mono font-bold">{form.bankAccount || '-'}</span>}</div>
                                                </div>

                                                <div className="pt-2 border-t border-white/10">
                                                    <p className="text-[9px] font-bold text-white/40 uppercase mb-2">History</p>
                                                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">{form.salaryHistory?.length === 0 && <p className="text-[10px] text-white/30 italic">No records</p>}{form.salaryHistory?.map((rec, idx) => (<div key={idx} className="flex justify-between items-center text-[10px] bg-white/5 p-2 rounded gap-2"><div><div className="font-bold text-white/80">{rec.date}</div><div className="text-white/50">{rec.reason}</div></div><div className="text-right shrink-0"><div className="font-mono font-bold text-[#FFD700]">RM {rec.amount}</div><div className={`${rec.adjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>{rec.adjustment >= 0 ? '+' : ''}{rec.adjustment}</div></div>{isEditing && <button onClick={() => deleteSalaryRecord(idx)} className="text-red-400 ml-2 p-1 active:scale-90"><Trash2 size={12}/></button>}</div>))}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 专业能力 (Special Skills) */}
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'salary' ? 'block' : 'hidden md:block'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Trophy size={14} className="text-[#FFD700]"/> 专业能力 (Special Skills)
                                        </h4>
                                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                            {isEditing ? (
                                                <div className="flex flex-col gap-1.5">
                                                    <textarea 
                                                        value={form.specialSkills || ''} 
                                                        onChange={e => setForm({...form, specialSkills: e.target.value})} 
                                                        placeholder="请填写员工专业技能，如：会电工、会养鱼、会剖鱼、修水管等 (使用空格、逗号或顿号隔开)..." 
                                                        className="bg-white text-gray-800 border border-gray-200 rounded-xl p-3 outline-none w-full text-sm resize-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all font-medium" 
                                                        rows={3}
                                                    />
                                                    <span className="text-[10px] text-gray-400 font-bold">💡 支持多项专业技能，输入后用空格、逗号或顿号隔开会自动生成标签</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {form.specialSkills ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {form.specialSkills.split(/[,，、\s]+/).filter(Boolean).map((skill, index) => (
                                                                <span key={index} className="px-3 py-1.5 bg-stone-100 hover:bg-[#FFD700]/10 text-stone-800 hover:text-stone-900 border border-stone-200 hover:border-[#FFD700]/30 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-default">
                                                                    ✨ {skill}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 italic">暂未登记专业能力 (No skills defined yet)</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="xl:col-span-8 flex flex-col gap-6">
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'basic' ? 'block' : 'hidden md:block'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><User size={14}/> 个人档案 (Personal)</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-3">
                                            <InputField label="全名 (Full Name)" value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} placeholder="Name" isEditing={isEditing} />
                                            <InputField label="IC / Passport" value={form.icNumber} onChange={(e: any) => setForm({...form, icNumber: e.target.value})} placeholder="ID" isEditing={isEditing} />
                                            <InputField label="手机 (Phone)" value={form.phone} onChange={(e: any) => setForm({...form, phone: e.target.value})} placeholder="012..." isEditing={isEditing} />
                                            <SelectField label="性别 (Gender)" value={form.gender} onChange={(e: any) => setForm({...form, gender: e.target.value})} options={['Male', 'Female']} isEditing={isEditing} />
                                            <SelectField label="国籍 (Nationality)" value={form.nationality} onChange={(e: any) => setForm({...form, nationality: e.target.value})} options={NATIONALITY_OPTS} isEditing={isEditing} />
                                            <SelectField label="雇佣状态 (Status)" value={form.status} onChange={(e: any) => setForm({...form, status: e.target.value})} options={[{label:'正式 (Confirmed)', value:'CONFIRMED'}, {label:'试用 (Probation)', value:'PROBATION'}, {label:'离职 (Terminated)', value:'TERMINATED'}]} isEditing={isEditing} />
                                            <SelectField label={isSuperAdminMode ? "组织职级 (Org Level)" : "组织职级 (只读)"} value={form.orgLevel || getOrgLevel(form as Employee)} onChange={(e: any) => setForm({...form, orgLevel: e.target.value})} options={ORG_LEVEL_OPTIONS} isEditing={isEditing && isSuperAdminMode} />
                                            <SelectField label={isSuperAdminMode ? "系统入口特殊覆盖 (Portal Override)" : "系统入口 (自动)"} value={isSuperAdminMode ? (form.portalRoleOverride || "") : getPortalRole(form as Employee)} onChange={(e: any) => setForm({...form, portalRoleOverride: e.target.value || undefined})} options={isSuperAdminMode ? [{label: `跟随职级（自动：${getPortalRole(form as Employee)}）`, value: ""}, ...PORTAL_ROLE_OPTIONS] : PORTAL_ROLE_OPTIONS} isEditing={isEditing && isSuperAdminMode} />
                                            <SelectField 
                                                label="工作部门 (Department)" 
                                                value={form.department || getRecommendedDept(form.role || '')} 
                                                onChange={(e: any) => setForm({...form, department: e.target.value})} 
                                                options={DEPARTMENTS.map(d => ({ label: d.label, value: d.value }))} 
                                                isEditing={isEditing} 
                                            />
                                            <div className="grid grid-cols-2 gap-2"><InputField label="身高 (cm)" type="number" value={form.height} onChange={(e: any) => setForm({...form, height: parseInt(e.target.value)})} placeholder="cm" isEditing={isEditing} /><InputField label="体重 (kg)" type="number" value={form.weight} onChange={(e: any) => setForm({...form, weight: parseInt(e.target.value)})} placeholder="kg" isEditing={isEditing} /></div>
                                            <SelectField label="制服尺寸 (Size)" value={form.shirtSize} onChange={(e: any) => setForm({...form, shirtSize: e.target.value})} options={SHIRT_SIZES} isEditing={isEditing} />
                                            <InputField label="入职日期 (Join Date)" value={form.joinDate} onChange={(e: any) => setForm({...form, joinDate: e.target.value})} type="date" isEditing={isEditing} />
                                            <SelectField label="首选语言 (Preferred Lang)" value={form.preferredLanguage || 'zh_en'} onChange={(e: any) => setForm({...form, preferredLanguage: e.target.value})} options={[{label:'中英文 (ZH / EN)', value:'zh_en'}, {label:'缅甸文 (Burmese / MY)', value:'my'}]} isEditing={isEditing} />
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-gray-50"><InputField label="住址 (Address)" value={form.address} onChange={(e: any) => setForm({...form, address: e.target.value})} placeholder="Full Address" isEditing={isEditing} /></div>
                                    </div>
 
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'salary' ? 'block' : 'hidden md:block'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Briefcase size={14}/> 政府与卫生 (Govt & Health)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-blue-50 rounded text-blue-600"><Shield size={14}/></div><span className="text-xs font-bold text-gray-700">法定缴纳 (Statutory)</span></div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><InputField label="EPF No" value={form.epfNo} onChange={(e: any) => setForm({...form, epfNo: e.target.value})} placeholder="KWSP" isEditing={isEditing} /><InputField label="SOCSO No" value={form.socsoNo} onChange={(e: any) => setForm({...form, socsoNo: e.target.value})} placeholder="PERKESO" isEditing={isEditing} /></div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-green-50 rounded text-green-600"><Stethoscope size={14}/></div><span className="text-xs font-bold text-gray-700">卫生认证 (Health)</span></div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><InputField label="打针有效 (Typhoid)" value={form.typhoidExpiry} onChange={(e: any) => setForm({...form, typhoidExpiry: e.target.value})} type="date" isEditing={isEditing} /><InputField label="餐馆课程 (Course Date)" value={form.foodHandlingDate} onChange={(e: any) => setForm({...form, foodHandlingDate: e.target.value})} type="date" isEditing={isEditing} /></div>
                                            </div>
                                        </div>
                                    </div>
 
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'basic' ? 'block' : 'hidden md:block'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Phone size={14}/> 紧急联系人 (Emergency Contact)</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><InputField label="联系人姓名 (Name)" value={form.emergencyName} onChange={(e: any) => setForm({...form, emergencyName: e.target.value})} placeholder="Relative Name" isEditing={isEditing} /><InputField label="联系电话 (Phone)" value={form.emergencyPhone} onChange={(e: any) => setForm({...form, emergencyPhone: e.target.value})} placeholder="Emergency Phone" isEditing={isEditing} /></div>
                                    </div>
 
                                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 items-start ${mobileDetailTab === 'records' ? 'grid' : 'hidden md:grid'}`}>
                                        <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Trophy size={14}/> 季度评分 (Assessment)
                                                </h4>
                                                <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">V2</span>
                                            </div>
                                            {selectedEmpId && (
                                                <AssessmentHistoryPanel 
                                                    employee={form as Employee}
                                                    currentEmployee={currentEmployee}
                                                    onAssessmentUpdated={(record) => {
                                                        setLatestV2Assessment(record);
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
                                            <div className="flex justify-between items-center mb-4"><h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Shield size={14}/> 系统权限 (Access)</h4>{isEditing && <button onClick={() => setShowAccessModal(true)} className="text-[10px] bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-bold active:scale-95">Config</button>}</div>
                                            <div className="flex flex-wrap gap-2 mb-4">{(!form.allowedModules || form.allowedModules.length === 0) && <span className="text-xs text-gray-400 italic">No access granted</span>}{form.allowedModules?.map(mod => (<span key={mod} className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">{MODULE_DEFINITIONS[mod]?.label.split('(')[0]}</span>))}</div>
                                            
                                            {/* 🟢 新增：通知厨房专属快捷权限配置 */}
                                            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                                <div className="min-w-0 pr-2">
                                                    <span className="text-xs font-black text-gray-700 block">通知厨房功能权限 (Kitchen Alert)</span>
                                                    <span className="text-[10px] font-bold text-gray-400 block truncate">允许该员工发送和处理厨房紧急通知</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={!isEditing}
                                                    onClick={() => {
                                                        const current = form.allowedModules || [];
                                                        const hasAlert = current.includes('KITCHEN_ALERT');
                                                        let nextModules;
                                                        if (hasAlert) {
                                                            nextModules = current.filter(m => m !== 'KITCHEN_ALERT');
                                                        } else {
                                                            nextModules = [...current, 'KITCHEN_ALERT'];
                                                        }
                                                        setForm({
                                                            ...form,
                                                            allowedModules: nextModules,
                                                            hasKitchenAlertPermission: !hasAlert
                                                        });
                                                    }}
                                                    className={`h-8 px-3 rounded-xl text-[10px] font-black transition-colors ${
                                                        (form.allowedModules || []).includes('KITCHEN_ALERT')
                                                            ? 'bg-[#FFD200] text-[#111111]'
                                                            : 'bg-gray-100 text-gray-400'
                                                    } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'}`}
                                                >
                                                    {(form.allowedModules || []).includes('KITCHEN_ALERT') ? '已开启 / Enabled' : '未开启 / Disabled'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'records' ? 'block' : 'hidden md:block'}`}>
                                        <div className="flex items-start justify-between gap-3 mb-4">
                                            <div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={14}/> 库存权限 (Inventory Access)</h4>
                                                <p className="mt-1 text-[10px] font-bold text-gray-400">控制库存范围与具体操作，不改变员工看到的其他模块</p>
                                            </div>
                                            {isEditing && canConfigureInventoryAccess && (
                                                <button onClick={() => setShowInventoryAccessModal(true)} className="min-h-[40px] shrink-0 rounded-xl bg-[#1A1A1A] px-3 text-[10px] font-black text-[#FFD700] active:scale-95">设置</button>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <p className="mb-1.5 text-[10px] font-black text-gray-400">管理范围</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {resolvedInventoryAccess.scopes.length === 0 && <span className="text-xs italic text-gray-400">未设置范围</span>}
                                                    {resolvedInventoryAccess.scopes.map(scope => (
                                                        <span key={scope} className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700">{INVENTORY_SCOPE_LABELS[scope]}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="mb-1.5 text-[10px] font-black text-gray-400">已开启操作 · {enabledInventoryPermissions.length}/{INVENTORY_PERMISSIONS.length}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {enabledInventoryPermissions.length === 0 && <span className="text-xs italic text-gray-400">未开启操作权限</span>}
                                                    {enabledInventoryPermissions.map(permission => (
                                                        <span key={permission} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">{INVENTORY_PERMISSION_LABELS[permission]}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            {isEditing && !canConfigureInventoryAccess && <p className="rounded-xl bg-gray-50 p-3 text-[10px] font-bold text-gray-400">只有老板或超级管理员可以修改库存权限。</p>}
                                        </div>
                                    </div>
 
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'records' ? 'block' : 'hidden md:block'}`}>
                                        <div className="flex justify-between items-center mb-6"><h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={14}/> 奖惩记录 (Disciplinary)</h4>{isEditing && !showWarningInput && <button onClick={() => setShowWarningInput(true)} className="text-[10px] bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold border border-red-100 hover:bg-red-100 active:scale-95">+ Add Warning</button>}</div>
                                        {showWarningInput && (<div className="bg-red-50 p-4 rounded-xl mb-4 border border-red-100 animate-in slide-in-from-top-2"><div className="flex gap-2 mb-3">{DISCIPLINARY_TYPES.map(t => (<button key={t.id} onClick={() => setWarnType(t.id)} className={`flex-1 py-2.5 text-[10px] font-bold rounded-lg transition-colors active:scale-95 ${warnType === t.id ? 'bg-red-600 text-white' : 'bg-white text-gray-500 border'}`}>{t.label}</button>))}</div><input className="w-full p-3 border border-gray-200 rounded-lg mb-3 bg-white text-[#1A1A1A] outline-none" style={{ fontSize: '16px', minHeight: '48px' }} placeholder="违规原因 (e.g. Late, Mistakes)" value={warnReason} onChange={e => setWarnReason(e.target.value)} /><div className="flex gap-2"><button onClick={() => setShowWarningInput(false)} className="flex-1 py-3 bg-white text-gray-500 text-xs rounded-lg font-bold active:scale-95">Cancel</button><button onClick={confirmAddWarning} className="flex-1 py-3 bg-red-600 text-white text-xs rounded-lg font-bold active:scale-95">Confirm</button></div></div>)}
                                        <div className="space-y-3">{(!form.warningHistory || form.warningHistory.length === 0) && <p className="text-center text-xs text-gray-300 italic py-4">无违规记录 (Clean Record)</p>}{form.warningHistory?.map((warn, idx) => { const typeConfig = DISCIPLINARY_TYPES.find(t => t.id === warn.type); return (<div key={idx} className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-xl border border-gray-100"><div className="flex items-center gap-3"><div className={`text-[10px] font-black px-2 py-1.5 rounded uppercase shrink-0 ${typeConfig?.color}`}>{typeConfig?.label}</div><div className="min-w-0"><div className="text-xs font-bold text-[#1A1A1A] break-words">{warn.reason}</div><div className="text-[10px] text-gray-400 mt-0.5">{warn.date} • by {warn.issuer}</div></div></div>{isEditing && <button onClick={() => { const h = [...(form.warningHistory||[])]; h.splice(idx,1); setForm({...form, warningHistory: h}); }} className="text-gray-300 hover:text-red-500 p-2 active:scale-90"><Trash2 size={16}/></button>}</div>); })}</div>
                                    </div>

                                    {isEditing && (
                                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                                            <button onClick={handleResetPin} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"><Lock size={14}/> 重置密码 (Reset PIN)</button>
                                            {form.isArchived ? (
                                                <button onClick={handleRestore} className="flex-1 py-3.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"><CheckCircle2 size={14}/> 复职 (Restore)</button>
                                            ) : (
                                                <button onClick={handleTerminateClick} className="flex-1 py-3.5 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"><Ban size={14}/> 离职 (Terminate)</button>
                                            )}
                                            <button onClick={() => setShowDeleteModal(true)} className="flex-1 py-3.5 bg-red-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors hover:bg-red-700 shadow-md active:scale-[0.98]"><Trash2 size={14}/> 永久删除</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
            
            {/* Review Modal */}
            {showReviewModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-xl text-[#1A1A1A]">员工表现评语 (Reviews)</h3>
                            <button onClick={() => setShowReviewModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                        </div>
                        
                        <div className="flex-grow overflow-y-auto space-y-3 mb-6 pr-2">
                            {(!form.reviews || form.reviews.length === 0) && (
                                <div className="text-center py-10 text-gray-400 italic text-sm">暂无评语记录</div>
                            )}
                            {form.reviews?.map(review => (
                                <div key={review.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100 relative group">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black flex items-center gap-1 ${
                                                review.type === 'PRAISE' ? 'bg-green-100 text-green-700' : 
                                                review.type === 'CRITICISM' ? 'bg-red-100 text-red-700' : 
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {review.type === 'PRAISE' && <ThumbsUp size={10}/>}
                                                {review.type === 'CRITICISM' && <ThumbsDown size={10}/>}
                                                {review.type === 'NOTE' && <StickyNote size={10}/>}
                                                {review.type === 'PRAISE' ? '表扬' : review.type === 'CRITICISM' ? '改进' : '备注'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-mono">{review.date}</span>
                                        </div>
                                        <button onClick={() => handleDeleteReview(review.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                    <p className="text-sm font-bold text-gray-700 whitespace-pre-wrap">{review.content}</p>
                                    {review.image && (
                                        <div className="mt-2 relative group/img cursor-pointer" onClick={() => setViewImage(review.image || null)}>
                                            <img src={review.image} className="w-20 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-90 transition-opacity" />
                                            <div className="absolute top-0 left-0 bg-black/40 w-20 h-20 rounded-lg flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                <Eye size={16} className="text-white"/>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-gray-100 pt-4 space-y-3">
                            <div className="flex gap-2">
                                <button onClick={() => setReviewFormState({...reviewFormState, type: 'PRAISE'})} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${reviewFormState.type === 'PRAISE' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-gray-50 text-gray-500'}`}><ThumbsUp size={14}/> 表扬 (Praise)</button>
                                <button onClick={() => setReviewFormState({...reviewFormState, type: 'NOTE'})} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${reviewFormState.type === 'NOTE' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' : 'bg-gray-50 text-gray-500'}`}><StickyNote size={14}/> 备注 (Note)</button>
                                <button onClick={() => setReviewFormState({...reviewFormState, type: 'CRITICISM'})} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${reviewFormState.type === 'CRITICISM' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-gray-50 text-gray-500'}`}><ThumbsDown size={14}/> 待改进 (Improve)</button>
                            </div>
                            <textarea 
                                value={reviewFormState.content}
                                onChange={e => setReviewFormState({...reviewFormState, content: e.target.value})}
                                className="w-full p-3 bg-white border-2 border-gray-200 rounded-xl font-bold outline-none focus:border-[#1A1A1A] h-24 resize-none placeholder:font-normal"
                                style={{ fontSize: '16px' }}
                                placeholder="请输入评语内容..."
                            />
                            
                            <div className="flex gap-2 items-center">
                                <div className="relative">
                                    {reviewFormState.image ? (
                                        <div className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden relative group">
                                            <img src={reviewFormState.image} className="w-full h-full object-cover"/>
                                            <button 
                                                onClick={() => setReviewFormState(prev => ({...prev, image: ''}))}
                                                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12} className="text-white"/>
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => reviewFileInputRef.current?.click()}
                                            disabled={isUploadingReviewImage}
                                            className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
                                        >
                                            {isUploadingReviewImage ? <Loader2 size={16} className="animate-spin text-gray-400"/> : <Camera size={18} className="text-gray-500"/>}
                                        </button>
                                    )}
                                    <input type="file" ref={reviewFileInputRef} className="hidden" accept="image/*" onChange={handleReviewImageUpload} />
                                </div>
                                
                                <button onClick={handleAddReview} disabled={isUploadingReviewImage} className="flex-grow bg-[#1A1A1A] text-[#FFD700] py-3 rounded-xl font-black shadow-lg hover:bg-black transition-all disabled:opacity-70">
                                    {isUploadingReviewImage ? 'Uploading...' : '提交记录 (Add Record)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Image Viewer */}
            {viewImage && (
                <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setViewImage(null)}>
                    <button className="absolute top-4 right-4 text-white/50 hover:text-white p-2" onClick={() => setViewImage(null)}>
                        <X size={32}/>
                    </button>
                    <img src={viewImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()}/>
                </div>
            )}

            {/* @ts-ignore */}
            <AbilityAssessmentModal 
                isOpen={showAbilityModal} 
                onClose={() => setShowAbilityModal(false)} 
                attributes={form.attributes} 
                onChange={(newAttr: any) => setForm({...form, attributes: newAttr})} 
            />
            
            {/* @ts-ignore */}
            <SystemAccessModal 
                isOpen={showAccessModal} 
                onClose={() => setShowAccessModal(false)} 
                allowedModules={form.allowedModules || []} 
                onToggle={(mod: any) => handleToggleModule(mod)}
                assessmentTargets={form.assessmentTargets || []}
                onUpdateTargets={handleUpdateAssessmentTargets}
                allEmployees={employees}
            />

            {form.id && form.name && (
                <InventoryAccessModal
                    isOpen={showInventoryAccessModal}
                    employee={form as Employee}
                    onClose={() => setShowInventoryAccessModal(false)}
                    onApply={handleApplyInventoryAccess}
                />
            )}

            {/* Terminate Modal */}
            {showTerminateModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="bg-[#1A1A1A] p-5 text-center shrink-0">
                            <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-3"><LogOut size={28}/></div>
                            <h3 className="font-black text-xl text-white mb-1">办理离职手续</h3>
                            <p className="text-xs text-gray-400 font-bold">{form.name || 'Unknown'} • {(form.role || '未分配').split('(')[0]}</p>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto flex-grow">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">离职类型 (Type)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {TERMINATION_TYPES.map(t => (
                                        <button key={t.id} onClick={() => setTerminationData({...terminationData, type: t.id})} className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border-2 transition-all ${terminationData.type === t.id ? `${t.color} border-current ring-1 ring-current shadow-sm` : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'}`}>
                                            <span className="text-base">{t.icon}</span> {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">📅 通知日期 (Notice Date)</label>
                                    <p className="text-[9px] text-gray-400 mb-1">员工说不做的日期</p>
                                    <input type="date" value={terminationData.noticeDate} onChange={e => setTerminationData({...terminationData, noticeDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-gray-400" style={{ fontSize: '16px', minHeight: '48px' }}/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">🚪 最后工作日 (Last Day)</label>
                                    <p className="text-[9px] text-gray-400 mb-1">实际最后上班日</p>
                                    <input type="date" value={terminationData.date} onChange={e => setTerminationData({...terminationData, date: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-gray-400" style={{ fontSize: '16px', minHeight: '48px' }}/>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">离职原因 (Reason)</label>
                                <textarea value={terminationData.reason} onChange={e => setTerminationData({...terminationData, reason: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none h-20 resize-none focus:border-gray-400 transition-colors" style={{ fontSize: '16px' }} placeholder="请输入原因..."/>
                            </div>
                            
                            {loanBalance > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-red-500"/><span className="text-sm font-black text-red-700">该员工仍有欠款</span></div>
                                    <div className="text-2xl font-mono font-black text-red-600 mb-1">RM {loanBalance.toFixed(2)}</div>
                                    <p className="text-[10px] text-red-500 font-bold">离职后结算状态将标记为「待结算」，请在薪资结算时处理</p>
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
                                <p className="font-bold mb-1">💡 回溯录入说明：</p>
                                <p className="text-blue-600">通知日期和最后工作日可设为<b>过去的日期</b>。例如员工2月28日说不做了，你3月6日才录入，只需把通知日期设为2月28日即可。系统会正确记录时间线。</p>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 border-t grid grid-cols-2 gap-3 shrink-0">
                            <button onClick={() => setShowTerminateModal(false)} className="py-3 bg-white text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-100 border border-gray-200">取消</button>
                            <button onClick={confirmTermination} className="py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 shadow-lg flex items-center justify-center gap-2"><LogOut size={16}/> 确认离职</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 text-center border-t-8 border-red-600">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce"><Trash2 size={32} className="text-red-600"/></div>
                        <h3 className="font-black text-2xl text-[#1A1A1A] mb-2">确认永久删除?</h3>
                        <p className="text-sm text-gray-500 font-bold mb-6">此操作将永久移除该员工的所有资料、薪资记录且<span className="text-red-600 underline">无法恢复</span>。</p>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => setShowDeleteModal(false)} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-200">取消 (Cancel)</button>
                            <button onClick={confirmDelete} className="py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 shadow-xl">确认删除 (Delete)</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loan Modal */}
            {showLoanModal && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="bg-[#1A1A1A] p-4 flex justify-between items-center text-white shrink-0">
                            <h3 className="font-black text-lg flex items-center gap-2"><Wallet size={18} className="text-[#FFD700]"/> 借还款记录 (Loan Tracker)</h3>
                            <button onClick={() => setShowLoanModal(false)}><X size={20} className="text-white/50 hover:text-white"/></button>
                        </div>
                        
                        <div className={`p-4 text-center ${loanBalance > 0 ? 'bg-red-50' : loanBalance < 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <div className="text-[10px] font-bold text-gray-400 uppercase">{form.name} — 当前欠款余额</div>
                            <div className={`text-3xl font-mono font-black mt-1 ${loanBalance > 0 ? 'text-red-600' : loanBalance < 0 ? 'text-green-600' : 'text-gray-400'}`}>RM {Math.abs(loanBalance).toFixed(2)}</div>
                            <div className="text-[10px] mt-1 text-gray-400 font-bold">
                                总借: RM {(form.loanRecords || []).filter(r => r.type === 'BORROW').reduce((s,r) => s+r.amount, 0).toFixed(2)} | 
                                总还: RM {(form.loanRecords || []).filter(r => r.type === 'REPAY').reduce((s,r) => s+r.amount, 0).toFixed(2)}
                            </div>
                        </div>

                        <div className="p-4 border-b bg-gray-50 space-y-3">
                            <div className="flex gap-2">
                                <button onClick={() => setLoanFormState({...loanFormState, type: 'BORROW'})} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${loanFormState.type === 'BORROW' ? 'bg-red-100 text-red-700 ring-2 ring-red-400' : 'bg-white text-gray-400 border'}`}><span className="text-sm">💰</span> 借款 (Borrow)</button>
                                <button onClick={() => setLoanFormState({...loanFormState, type: 'REPAY'})} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${loanFormState.type === 'REPAY' ? 'bg-green-100 text-green-700 ring-2 ring-green-400' : 'bg-white text-gray-400 border'}`}><span className="text-sm">💸</span> 还款 (Repay)</button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">金额 (Amount)</label>
                                    <input type="number" inputMode="decimal" value={loanFormState.amount || ''} onChange={e => setLoanFormState({...loanFormState, amount: parseFloat(e.target.value) || 0})} className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold outline-none focus:border-gray-400" style={{ fontSize: '16px', minHeight: '48px' }} placeholder="RM 0.00"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">方式 (Via)</label>
                                    <select value={loanFormState.via} onChange={e => setLoanFormState({...loanFormState, via: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold outline-none" style={{ fontSize: '16px', minHeight: '48px' }}>
                                        <option value="CASH">现金 Cash</option>
                                        <option value="BANK">银行 Bank</option>
                                        <option value="SALARY_DEDUCT">薪资扣除 Salary</option>
                                        <option value="TNG">TNG</option>
                                    </select>
                                </div>
                            </div>
                            <input value={loanFormState.note} onChange={e => setLoanFormState({...loanFormState, note: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold outline-none focus:border-gray-400" style={{ fontSize: '16px', minHeight: '48px' }} placeholder="备注 (e.g. 紧急家事, 月薪扣回...)"/>
                            <button onClick={handleAddLoan} className={`w-full py-3 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${loanFormState.type === 'BORROW' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                                {loanFormState.type === 'BORROW' ? '确认借款 (+Borrow)' : '确认还款 (-Repay)'}
                            </button>
                        </div>

                        <div className="flex-grow overflow-y-auto p-4 space-y-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">历史记录 (History)</p>
                            {(!form.loanRecords || form.loanRecords.length === 0) && <div className="text-center py-8 text-gray-300 italic text-sm">暂无记录</div>}
                            {(form.loanRecords || []).map((rec, idx) => {
                                const runningBalance = (form.loanRecords || []).slice(idx).reduce((sum, r) => sum + (r.type === 'BORROW' ? r.amount : -r.amount), 0);
                                return (
                                    <div key={rec.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${rec.type === 'BORROW' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{rec.type === 'BORROW' ? '借' : '还'}</div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-[#1A1A1A] truncate">{rec.note || '-'}</div>
                                                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                                    <span className="font-mono">{rec.date}</span>
                                                    {rec.via && <span className="bg-gray-100 px-1 rounded text-[9px]">{rec.via}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-2 shrink-0">
                                            <div>
                                                <div className={`text-sm font-mono font-bold ${rec.type === 'BORROW' ? 'text-red-600' : 'text-green-600'}`}>{rec.type === 'BORROW' ? '+' : '-'}RM {rec.amount.toFixed(2)}</div>
                                                <div className="text-[9px] font-mono text-gray-400">余额: RM {runningBalance.toFixed(2)}</div>
                                            </div>
                                            <button onClick={() => handleDeleteLoan(rec.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            
            {/* 🟢 HIDDEN PRINT SECTION (ALL LIST) */}
            <div style={{ position: 'absolute', top: 0, left: '-9999px' }}>
                <div ref={printRef} id="hr-profiles-all-export-root" className="w-[794px] bg-white p-10 font-sans text-black min-h-[1123px] relative">
                    <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-widest mb-1">Kim Lian Kee</h1>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.3em]">Employee Directory</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-gray-400">{new Date().toLocaleDateString()}</p>
                            <p className="text-sm font-black">Total Staff: {filteredEmployees.length}</p>
                        </div>
                    </div>
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b-2 border-black">
                                <th className="py-2 uppercase font-black">ID</th>
                                <th className="py-2 uppercase font-black">Name</th>
                                <th className="py-2 uppercase font-black">Role</th>
                                <th className="py-2 uppercase font-black">Phone</th>
                                <th className="py-2 uppercase font-black">Status</th>
                                <th className="py-2 uppercase font-black">Join Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.map((emp) => (
                                <tr key={emp.id} className="border-b border-gray-100">
                                    <td className="py-3 font-mono font-bold text-gray-500">{emp.id}</td>
                                    <td className="py-3 font-bold">{emp.name}</td>
                                    <td className="py-3 font-medium text-gray-700">{(emp.role || '未分配').split('(')[0]}</td>
                                    <td className="py-3 font-mono">{emp.phone || '-'}</td>
                                    <td className="py-3"><span className={`px-1 py-0.5 rounded text-[10px] font-bold uppercase ${emp.status === 'CONFIRMED' ? 'bg-green-100' : 'bg-gray-100'}`}>{emp.status}</span></td>
                                    <td className="py-3 font-mono text-gray-500">{emp.joinDate}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="absolute bottom-10 left-0 w-full text-center">
                        <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-gray-300">Confidential • Internal Use Only</p>
                    </div>
                </div>
            </div>
            
            {/* 🟢 HIDDEN PRINT SECTION (SINGLE PROFILE PDF) */}
            <div style={{ position: 'absolute', top: 0, left: '-9999px' }}>
                <div ref={singleProfileRef} id="hr-profile-single-export-root" className="w-[794px] h-[1123px] bg-white p-10 font-sans text-black relative flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-start border-b-4 border-[#8B0000] pb-4 mb-5">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-wider text-[#1A1A1A] mb-1">{form.name || 'EMPLOYEE NAME'}</h1>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{form.role || 'ROLE'}</p>
                            <div className="mt-3 flex gap-3 text-[10px] font-mono text-gray-600">
                                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">ID: {form.id}</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">JOINED: {form.joinDate}</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">STATUS: {form.status}</span>
                            </div>
                        </div>
                        <div className="w-20 h-20 bg-gray-100 border-2 border-gray-300 flex items-center justify-center overflow-hidden rounded-xl shadow-sm">
                            {form.avatar ? <img src={form.avatar} className="w-full h-full object-cover" /> : <span className="text-3xl text-gray-400 font-black">{(form.name || 'U').charAt(0)}</span>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-10 gap-y-5 flex-1">
                        <div className="col-span-2">
                            <h3 className="text-xs font-black uppercase border-b-2 border-gray-200 pb-1.5 mb-2.5 text-[#8B0000]">Personal Information (基本资料)</h3>
                            <div className="grid grid-cols-3 gap-y-3 text-[11px]">
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">IC / Passport</span><span className="font-mono font-bold text-xs">{form.icNumber || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Phone</span><span className="font-mono font-bold text-xs">{form.phone || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Nationality</span><span className="font-bold text-xs">{form.nationality || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Gender</span><span className="font-bold text-xs">{form.gender || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Shirt Size</span><span className="font-bold text-xs">{form.shirtSize || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Preferred Lang</span><span className="font-bold text-xs">{form.preferredLanguage === 'my' ? '缅甸文优先 (Burmese)' : '中英文混合 (Chinese/English)'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Tenure</span><span className="font-bold text-xs">{getTenure(form.joinDate || '')}</span></div>
                                <div className="col-span-3"><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Address</span><span className="font-bold text-xs">{form.address || '-'}</span></div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-black uppercase border-b-2 border-gray-200 pb-1.5 mb-2.5 text-[#8B0000]">Statutory & Salary (薪资与法定)</h3>
                            <div className="space-y-2 text-[11px] bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Basic Salary</span><span className="font-mono font-black text-xs">RM {form.basicSalary?.toLocaleString() || '0'}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Salary Mode</span><span className="font-bold text-xs">{form.salaryMode}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Rest Days</span><span className="font-bold text-xs">{form.monthlyRestDays || '-'} Days</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Bank Name</span><span className="font-bold text-xs">{form.bankName || '-'}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Bank Account</span><span className="font-mono font-bold text-xs">{form.bankAccount || '-'}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>EPF No</span><span className="font-mono font-bold text-xs">{form.epfNo || '-'}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>SOCSO No</span><span className="font-mono font-bold text-xs">{form.socsoNo || '-'}</span></div>
                                <div className="flex justify-between text-red-900 font-bold text-[10px]"><span>Special Skills (技能)</span><span className="text-right font-sans text-xs truncate max-w-[120px]" title={form.specialSkills}>{form.specialSkills || '-'}</span></div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-black uppercase border-b-2 border-gray-200 pb-1.5 mb-2.5 text-[#8B0000]">Health & Emergency (卫生与紧急)</h3>
                            <div className="space-y-3 text-[11px]">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-red-50 p-2.5 rounded-xl border border-red-100">
                                        <span className="block text-red-400 font-bold uppercase text-[9px] mb-1">Emergency Contact</span>
                                        <span className="font-black text-xs text-red-900 block">{form.emergencyName || '-'}</span>
                                        <span className="font-mono font-bold text-[11px] text-red-700 block mt-1">{form.emergencyPhone || '-'}</span>
                                    </div>
                                    <div className="bg-green-50 p-2.5 rounded-xl border border-green-100">
                                        <span className="block text-green-600 font-bold uppercase text-[9px] mb-1">Health Validations</span>
                                        <div className="flex justify-between items-center mb-1"><span className="text-green-800 text-[10px]">Typhoid:</span> <span className="font-mono font-bold text-green-900 text-[10px]">{form.typhoidExpiry || '-'}</span></div>
                                        <div className="flex justify-between items-center"><span className="text-green-800 text-[10px]">Course:</span> <span className="font-mono font-bold text-green-900 text-[10px]">{form.foodHandlingDate || '-'}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2 bg-[#FDFDFD] border border-gray-100 rounded-2xl p-4 shadow-sm">
                            <div className="flex justify-between items-center border-b-2 border-gray-200 pb-1.5 mb-2.5">
                                <h3 className="text-xs font-black uppercase text-[#8B0000]">6维能力度量图 (Performance Assessment)</h3>
                                <span className="text-[9px] font-black bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100 uppercase">
                                    V2 2026 Model ({latestV2Assessment?.quarter || '暂无评定'})
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-12 gap-4 items-center">
                                {/* SVG Radar Chart */}
                                <div className="col-span-5 flex justify-center items-center">
                                    <div className="relative w-[280px] h-[200px]">
                                        <svg className="w-full h-full" viewBox="-40 0 280 200">
                                            {/* Grid Levels */}
                                            {[20, 40, 60, 80, 100].map((level) => {
                                                const levelPoints = activeDimensions.map((_, idx) => {
                                                    const angle = (2 * Math.PI / 6) * idx - Math.PI / 2;
                                                    const radius = (level / 100) * 55;
                                                    return `${100 + radius * Math.cos(angle)},${100 + radius * Math.sin(angle)}`;
                                                });
                                                return (
                                                    <g key={level}>
                                                        <polygon
                                                            points={levelPoints.join(' ')}
                                                            fill="none"
                                                            stroke={level === 100 ? "#9CA3AF" : "#E5E7EB"}
                                                            strokeWidth={level === 100 ? "1.5" : "0.75"}
                                                            strokeDasharray={level === 100 ? "0" : "2,2"}
                                                        />
                                                        <text
                                                            x="100"
                                                            y={100 - (level / 100) * 55 - 2}
                                                            textAnchor="middle"
                                                            className="text-[6px] font-bold fill-gray-400 font-mono"
                                                        >
                                                            {level}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {/* Axes */}
                                            {activeDimensions.map((_, idx) => {
                                                const angle = (2 * Math.PI / 6) * idx - Math.PI / 2;
                                                const outerX = 100 + 55 * Math.cos(angle);
                                                const outerY = 100 + 55 * Math.sin(angle);
                                                return (
                                                    <line
                                                        key={idx}
                                                        x1="100"
                                                        y1="100"
                                                        x2={outerX}
                                                        y2={outerY}
                                                        stroke="#D1D5DB"
                                                        strokeWidth="0.75"
                                                    />
                                                );
                                            })}

                                            {/* Filled Radar Area */}
                                            {activeDimensions.length > 0 && (
                                                <>
                                                    <polygon
                                                        points={activeDimensions.map((d, idx) => {
                                                            const angle = (2 * Math.PI / 6) * idx - Math.PI / 2;
                                                            const radius = (d.score / 100) * 55;
                                                            return `${100 + radius * Math.cos(angle)},${100 + radius * Math.sin(angle)}`;
                                                        }).join(' ')}
                                                        fill="rgba(139, 0, 0, 0.12)"
                                                        stroke="#8B0000"
                                                        strokeWidth="2"
                                                    />
                                                    {activeDimensions.map((d, idx) => {
                                                        const angle = (2 * Math.PI / 6) * idx - Math.PI / 2;
                                                        const radius = (d.score / 100) * 55;
                                                        const cx = 100 + radius * Math.cos(angle);
                                                        const cy = 100 + radius * Math.sin(angle);
                                                        return (
                                                            <circle
                                                                key={idx}
                                                                cx={cx}
                                                                cy={cy}
                                                                r="2"
                                                                className="fill-white stroke-[#8B0000] stroke-[1.5]"
                                                            />
                                                        );
                                                    })}
                                                </>
                                            )}

                                            {/* Dimension Text Labels */}
                                            {activeDimensions.map((d, idx) => {
                                                const angle = (2 * Math.PI / 6) * idx - Math.PI / 2;
                                                const labelRadius = 55 + 20; // 75 radius, clear of the 55px grid
                                                const x = 100 + labelRadius * Math.cos(angle);
                                                const y = 100 + labelRadius * Math.sin(angle);

                                                let textAnchor: 'start' | 'end' | 'middle' = "middle";
                                                if (Math.cos(angle) > 0.1) textAnchor = "start";
                                                else if (Math.cos(angle) < -0.1) textAnchor = "end";

                                                const cleanLabel = d.label.split('(')[0];
                                                const dimensionEnglishLabels: Record<string, string> = {
                                                    loyalty: "Loyalty & Execution",
                                                    adaptability: "Adaptability",
                                                    teamwork: "Teamwork",
                                                    personal_grooming: "Grooming & Ethics",
                                                    job_capability: "Job Capability",
                                                    mentorship: "Mentorship",
                                                    stress_handling: "Stress Handling",
                                                };
                                                const engLabel = dimensionEnglishLabels[d.key] || "";

                                                return (
                                                    <g key={d.key}>
                                                        {/* White outline/halo for Chinese */}
                                                        <text
                                                            x={x}
                                                            y={y - 1}
                                                            textAnchor={textAnchor}
                                                            className="text-[7.5px] font-black tracking-tight"
                                                            stroke="#ffffff"
                                                            strokeWidth="3.5"
                                                            strokeLinejoin="round"
                                                            paintOrder="stroke"
                                                            opacity="0.95"
                                                        >
                                                            {cleanLabel}
                                                        </text>
                                                        {/* Crisp main Chinese text */}
                                                        <text
                                                            x={x}
                                                            y={y - 1}
                                                            textAnchor={textAnchor}
                                                            className="text-[7.5px] font-black fill-gray-700 tracking-tight"
                                                        >
                                                            {cleanLabel}
                                                        </text>

                                                        {/* White outline/halo for English */}
                                                        <text
                                                            x={x}
                                                            y={y + 6}
                                                            textAnchor={textAnchor}
                                                            className="text-[5.5px] font-bold tracking-tight font-sans"
                                                            stroke="#ffffff"
                                                            strokeWidth="3"
                                                            strokeLinejoin="round"
                                                            paintOrder="stroke"
                                                            opacity="0.95"
                                                        >
                                                            {engLabel}
                                                        </text>
                                                        {/* Crisp main English text */}
                                                        <text
                                                            x={x}
                                                            y={y + 6}
                                                            textAnchor={textAnchor}
                                                            className="text-[5.5px] font-bold fill-gray-400 font-sans tracking-tight"
                                                        >
                                                            {engLabel}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                </div>

                                {/* Dimension Details List */}
                                <div className="col-span-7 space-y-1">
                                    {activeDimensions.map((d) => {
                                        const grade = getGradeInfo(d.score);
                                        return (
                                            <div key={d.key} className="flex items-center justify-between bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1 leading-normal mb-1">
                                                        <span className="text-[9px] font-black text-gray-800">{d.label.split('(')[0]}</span>
                                                        {d.label.includes('(') && (
                                                            <span className="text-[7px] text-gray-400 font-bold">{d.label.split('(')[1]?.replace(')', '')}</span>
                                                        )}
                                                    </div>
                                                    {/* Progress bar */}
                                                    <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden mt-1.5">
                                                        <div 
                                                            className="h-full bg-[#8B0000] rounded-full" 
                                                            style={{ width: `${d.score}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                                                    <span className="text-[9px] font-mono font-bold text-gray-600">{d.score}分</span>
                                                    <span className={`w-4 h-4 rounded flex items-center justify-center font-black text-[8px] border ${grade.color} shadow-sm`}>
                                                        {grade.label}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2">
                            <h3 className="text-xs font-black uppercase border-b-2 border-gray-200 pb-1 mb-2 text-[#8B0000]">Disciplinary Record (纪律记录)</h3>
                            {(!form.warningHistory || form.warningHistory.length === 0) ? (
                                <p className="text-[10px] text-gray-400 italic bg-gray-50 p-2 rounded-xl text-center border border-dashed border-gray-200">无违规记录 (Clean Record)</p>
                            ) : (
                                <table className="w-full text-left text-[9px] border border-gray-200 rounded-xl overflow-hidden">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="p-1.5 border-b border-gray-200">Date</th>
                                            <th className="p-1.5 border-b border-gray-200">Type</th>
                                            <th className="p-1.5 border-b border-gray-200">Reason</th>
                                            <th className="p-1.5 border-b border-gray-200">Issuer</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {form.warningHistory.slice(0, 2).map((w, i) => (
                                            <tr key={i} className="border-b border-gray-100 last:border-0">
                                                <td className="p-1.5 font-mono text-gray-600">{w.date}</td>
                                                <td className="p-1.5 font-bold uppercase">{w.type}</td>
                                                <td className="p-1.5 font-medium">{w.reason}</td>
                                                <td className="p-1.5 text-gray-500">{w.issuer}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-end shrink-0">
                        <div>
                            <p className="text-sm font-black uppercase tracking-widest text-[#8B0000]">Kim Lian Kee</p>
                            <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">Human Resources Department</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[8px] text-gray-400 uppercase mb-0.5">Generated on {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Confidential Document</p>
                        </div>
                    </div>
                </div>
            </div>

        </div> // ✅ End of return root div
    ); // ✅ End of return statement
}; // ✅ End of component
