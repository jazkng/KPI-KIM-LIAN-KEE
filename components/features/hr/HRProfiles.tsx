import { html2canvas, loadJsPDF } from '../../../utils/lazyLibs';
import { TaskReturnStats } from '../../tasks/TaskReturnStats';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Plus, Search, Edit3, Save, Trash2, ArrowLeft, CheckCircle2, Clock, Ban, Lock, Camera, ChevronUp, ChevronDown, Trophy, Shield, ShieldCheck, Hash, LogOut, FileDown, Loader2, X, Phone, Briefcase, Eye, EyeOff, AlertTriangle, Stethoscope, Printer, Archive, Home, CalendarDays, MessageSquarePlus, ThumbsUp, ThumbsDown, StickyNote, Medal, Layout, CheckSquare, Square, Settings, Wallet, Grid3x3 } from 'lucide-react';
import { Employee, AppModule, WarningRecord, SalaryRecord, ReviewRecord, LoanRecord, InventoryAccessConfig, PortalRole } from '../../../types';
import { DataManager } from '../../../utils/dataManager';
import { uploadToCloudinary } from '../../utils';
import { DEFAULT_ROLES, NATIONALITY_OPTS, BANK_OPTIONS, MODULE_DEFINITIONS } from '../../constants';
import { DepartmentMigrationBanner, DEPARTMENTS, getRecommendedDept } from './DepartmentMigrationBanner';
import { getOrgLevel, getOrgLevelLabel, getPortalRole, ORG_LEVEL_OPTIONS, PORTAL_ROLE_OPTIONS } from '../../../utils/orgAccess';
import { INVENTORY_PERMISSION_LABELS, INVENTORY_PERMISSIONS, INVENTORY_SCOPE_LABELS, resolveInventoryAccess } from '../../../utils/inventoryAccess';
import { InventoryAccessModal } from './InventoryAccessModal';
import { DEFAULT_PIC_AREAS, PicArea } from '../../../constants/hrSkill';

import { applyResolvedStylesForPdf, waitForPdfFonts } from '../../../utils/pdfStyleResolver';
import { HRExportDialog } from './HRExportDialog';
import { HRSkillMatrix } from './HRSkillMatrix';
import { SkillStarPanel } from './skills/SkillStarPanel';
import { SkillCatalogEditor } from './skills/SkillCatalogEditor';
import { SkillPrintDialog } from './skills/SkillPrintDialog';
import { useSkillCatalog } from './skills/skillCatalogStore';
import { countLateEarly, type LateEarlyCounts } from '../../../utils/hr/attendanceCounts';
import { EmployeePointsCard } from '../../points/EmployeePointsCard';
import { positionSkillScores, getEmployeePositions, getStarLevel } from '../../../constants/skillCatalog';
import { SHIFT_GROUP_META, shiftGroupOf } from '../../../constants/shiftGroups';
import { resolveTier, ORG_TIER_OPTIONS, ORG_UNIT_SUGGESTIONS, OPS_DEPTS, DEPT_META as ORG_DEPT_META } from '../../../utils/orgChartModel';
import type { StarLevel } from '../../../constants/skillCatalog';
import { isRetiredModule, withoutRetiredModules } from '../../../utils/retiredModules';

/** 「中文 (English)」→ 中文在上，英文在下（较小） */
const BiLabel = ({ text, tone = 'light' }: { text: string; tone?: 'light' | 'dark' }) => {
    const m = /^(.*?)\s*\(([^()]*)\)\s*(.*)$/.exec(text || '');
    const zh = m ? `${m[1]}${m[3] ? ` ${m[3]}` : ''}`.trim() : text;
    const en = m ? m[2] : '';
    return (
        <label className="block mb-1 leading-tight">
            <span className={`block text-[12px] md:text-[11px] font-bold ${tone === 'dark' ? 'text-[#FFD200]' : 'text-gray-600'}`}>{zh}</span>
            {en && <span className={`block text-[10px] font-medium mt-0.5 ${tone === 'dark' ? 'text-white/50' : 'text-gray-400'}`}>{en}</span>}
        </label>
    );
};

const InputField = ({ label, value, onChange, placeholder, type = "text", isEditing, className = "" }: any) => (
    <div className={className}>
        <BiLabel text={label} />
        {isEditing ? (
            <input 
                type={type} 
                value={value || ''} 
                onChange={onChange} 
                inputMode={type === 'number' ? 'decimal' : undefined}
                className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#111111] outline-none focus:border-[#FFD200] focus:ring-1 focus:ring-[#FFD200]/50 transition-all" 
                style={{ fontSize: '16px', minHeight: '48px' }}
                placeholder={placeholder} 
            />
        ) : (
            <div className="text-sm font-bold text-[#111111] py-1.5 md:p-2 border border-transparent break-words min-h-[32px] md:min-h-[36px]">{value || '-'}</div>
        )}
    </div>
);

const SelectField = ({ label, value, onChange, options, isEditing }: any) => (
    <div>
        <BiLabel text={label} />
        {isEditing ? (
            <select 
                value={value || ''} 
                onChange={onChange} 
                className="w-full p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#111111] outline-none focus:border-[#FFD200]"
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
            <div className="text-sm font-bold text-[#111111] py-1.5 md:p-2 border border-transparent break-words leading-snug">{
                typeof options[0] === 'string' ? (value || '-') : (options.find((o: any) => o.value === value)?.label || value || '-')
            }</div>
        )}
    </div>
);


// --- UPDATED SYSTEM ACCESS MODAL WITH GROUPING ---
const SystemAccessModal = ({ isOpen, onClose, allowedModules, onToggle, assessmentTargets, onUpdateTargets, allEmployees, readOnlyAccess, onToggleReadOnly }: any) => {
    const [isTargetConfigOpen, setIsTargetConfigOpen] = useState(false);

    if (!isOpen) return null;

    const MODULE_GROUPS = [
        {
            title: '核心管理 (Core Management)',
            modules: ['HR_FILES', 'REPORTS', 'TREASURY', 'AP', 'BILLS', 'DAILY_ALERT', 'SELF_INVOICE'] as AppModule[],
            color: 'bg-red-50 text-red-700 border-red-100'
        },
        {
            title: '日常运营 (Daily Operations)',
            modules: ['SETTLEMENT', 'ATTENDANCE_CONSOLE', 'ROSTER','ROSTER_KITCHEN', 'LOGBOOK', 'SOP_INSPECT', 'QUEUE_MANAGER', 'ONLINE_ORDERS', 'STAFF_CASH'] as AppModule[],
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
        },
        {
            title: '决策与其他 (Planning & Others)',
            modules: ['PLANNING', 'PRICE_MONITOR', 'ORG_CHART', 'TRANSLATION', 'WARRANTY', 'AI_ASSISTANT', 'ROSTER_FLOOR'] as AppModule[],
            color: 'bg-purple-50 text-purple-700 border-purple-100'
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
                    <button onClick={() => setIsTargetConfigOpen(false)} className="bg-gray-200 p-2 rounded-full min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><X size={20}/></button>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-6">
                    {Object.keys(groupedStaff).map(key => (
                        <div key={key}>
                             <div className="flex justify-between items-center mb-2">
                                <h5 className="font-black text-xs text-gray-500 uppercase tracking-widest">{key} TEAM</h5>
                                <button onClick={() => toggleGroupTargets(key)} className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded min-h-[44px] md:min-h-0">Toggle All</button>
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
                <div className="p-4 border-t"><button onClick={() => setIsTargetConfigOpen(false)} className="w-full bg-[#111111] text-white py-3 rounded-xl font-bold">完成配置 (Done)</button></div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] md:max-h-[90vh] overflow-hidden relative">
                
                {isTargetConfigOpen && <AssessmentTargetSelector />}

                <div className="p-6 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                    <h3 className="font-black text-xl flex items-center gap-2"><Shield size={24} className="text-blue-600"/> 系统权限配置 (Access)</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><X size={20} className="text-gray-400"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto bg-[#F6F7FB] space-y-6">
                    {/* 🔒 只读模式开关 */}
                    <div className={`rounded-2xl border-2 p-4 transition-all ${readOnlyAccess ? 'bg-amber-50 border-amber-400' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h4 className="font-black text-sm flex items-center gap-2">
                                    <Shield size={14} className={readOnlyAccess ? 'text-amber-600' : 'text-gray-400'} />
                                    只读模式 (Read-only Access)
                                </h4>
                                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                    开启后，此员工可以查看上面已勾选的模块，但<b>不能新增、修改或删除</b>任何资料。适合会计或外部人员。
                                </p>
                                <p className="text-[10px] text-amber-700 mt-1.5 leading-relaxed">
                                    ⚠️ 这是App界面层的防护，不是数据库层。懂技术的人仍可能绕过。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToggleReadOnly?.(!readOnlyAccess)}
                                className={`min-h-[44px] md:min-h-0 shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                    readOnlyAccess ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
                                }`}
                            >
                                {readOnlyAccess ? '已开启' : '已关闭'}
                            </button>
                        </div>
                    </div>

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
                                        className="text-[10px] font-bold bg-white/50 px-2 py-1 rounded hover:bg-white transition-colors flex items-center gap-1 min-h-[44px] md:min-h-0"
                                    >
                                        {allSelected ? <CheckSquare size={12}/> : <Square size={12}/>} {allSelected ? '取消全选' : '全选'}
                                    </button>
                                </div>
                                <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {group.modules.map(mod => {
                                        const def = MODULE_DEFINITIONS[mod];
                                        if (!def || isRetiredModule(mod)) return null;
                                        const isSelected = allowedModules.includes(mod);
                                        return (
                                            <div 
                                                key={mod} 
                                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isSelected ? 'bg-[#111111] border-[#111111] text-white shadow-md' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'}`}
                                            >
                                                <div 
                                                    className="flex-grow flex items-center gap-3 cursor-pointer"
                                                    onClick={() => onToggle(mod)} 
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white/20 text-[#FFD200]' : 'bg-gray-100 text-gray-400'}`}>
                                                        <def.icon size={16}/>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-[#111111]'}`}>{def.label.split('(')[0]}</div>
                                                        <div className={`text-[9px] truncate ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>{def.desc}</div>
                                                    </div>
                                                </div>
                                                
                                                {mod === 'ASSESSMENT' && isSelected && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setIsTargetConfigOpen(true); }}
                                                        className="p-1.5 bg-white/20 hover:bg-white/40 rounded-lg text-[#FFD200] ml-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
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
                    <button onClick={onClose} className="w-full bg-[#111111] text-[#FFD200] py-4 rounded-xl font-black text-lg shadow-lg hover:bg-black transition-transform active:scale-[0.98]">
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
/** 员工档案分页（手机与电脑同一套） */
type DetailTab = 'basic' | 'salary' | 'skills' | 'access' | 'records';
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
    { id: 'basic', label: '资料' },
    { id: 'salary', label: '薪资' },
    { id: 'skills', label: '技能' },
    { id: 'access', label: '权限' },
    { id: 'records', label: '记录' },
];

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
    /** 打开 / 关闭某位员工的档案（手机版用来隐藏人事中心的分页列，让档案更大） */
    onDetailOpenChange?: (open: boolean) => void;
}

export const HRProfiles: React.FC<HRProfilesProps> = ({ 
    employees, 
    onSave, 
    currentBossId, 
    currentEmployee,
    isSuperAdminMode = false,
    initialSelectedEmployeeId,
    clearInitialSelectedEmployeeId,
    onDetailOpenChange,
}) => {
    const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [listMoreOpen, setListMoreOpen] = useState(false);
    useEffect(() => { onDetailOpenChange?.(!!selectedEmpId); }, [selectedEmpId, onDetailOpenChange]);
    const [form, setForm] = useState<Partial<Employee>>({});
    const [newPicName, setNewPicName] = useState('');
    const [newSecondaryRole, setNewSecondaryRole] = useState('');   // 👑 自己打字新增副职
    // ⭐ 工作能力星级
    const skillCatalog = useSkillCatalog();
    const [showSkillPrint, setShowSkillPrint] = useState(false);
    const [showSkillCatalog, setShowSkillCatalog] = useState(false);
    const [skillSaving, setSkillSaving] = useState(false);
    // 📱 手机版：往下滑后头部收起，只留名字 + 编辑
    const [headerCollapsed, setHeaderCollapsed] = useState(false);
    const detailScrollRef = useRef<HTMLDivElement>(null);
    // 换人 → 回到最上面，头部展开
    useEffect(() => {
        setHeaderCollapsed(false);
        if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
    }, [selectedEmpId]);
    const [, setIsUploading] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [showResigned, setShowResigned] = useState(false); 
    const fileInputRef = useRef<HTMLInputElement>(null);
    const printRef = useRef<HTMLDivElement>(null); 
    const [isExportOpen, setIsExportOpen] = useState(false);   // 导出选项弹窗
    const [isSkillMatrixOpen, setIsSkillMatrixOpen] = useState(false);   // 技能总表 / 批量录入
    const singleProfileRef = useRef<HTMLDivElement>(null); 
    const [isGeneratingSinglePdf, setIsGeneratingSinglePdf] = useState(false);
    const [isSalaryExpanded, setIsSalaryExpanded] = useState(false);
    const [showAccessModal, setShowAccessModal] = useState(false);
    const [showInventoryAccessModal, setShowInventoryAccessModal] = useState(false);
    const [showWarningInput, setShowWarningInput] = useState(false);
    const [warnType, setWarnType] = useState('VERBAL');
    const [warnReason, setWarnReason] = useState('');
    const [showTerminateModal, setShowTerminateModal] = useState(false);
    const [terminationData, setTerminationData] = useState({ reason: '', date: new Date().toISOString().split('T')[0], noticeDate: '', type: 'RESIGNED' as string });
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [viewImage, setViewImage] = useState<string | null>(null);
    const [mobileDetailTab, setMobileDetailTab] = useState<DetailTab>('basic');

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
    
    const [attendanceSnapshot, setAttendanceSnapshot] = useState<LateEarlyCounts>({ late: 0, early: 0, lastLate: '', lastEarly: '' });

    const filteredEmployees = useMemo(() => {
        return employees.filter(e => {
            const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.includes(searchTerm);
            const archiveMatch = showResigned ? e.isArchived : !e.isArchived;
            return matchesSearch && archiveMatch;
        });
    }, [employees, searchTerm, showResigned]);

    // ✅ Directory export always includes everyone (still respects the search box),
    // split into Active vs Resigned so departed staff are never silently dropped.
    const exportActiveEmployees = useMemo(() => {
        return employees
            .filter(e => !e.isArchived && (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.includes(searchTerm)))
            .sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }, [employees, searchTerm]);

    const exportResignedEmployees = useMemo(() => {
        return employees
            .filter(e => e.isArchived && (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.includes(searchTerm)))
            .sort((a, b) => (b.terminationDate || '').localeCompare(a.terminationDate || ''));
    }, [employees, searchTerm]);

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
        
        // 累计迟到 / 早退次数（本月明细在薪资结算导出，这里只做记录）
        let on = true;
        const fetchAttendance = async () => {
            const records = await DataManager.getAttendanceByEmployee(selectedEmpId).catch(() => []);
            if (on) setAttendanceSnapshot(countLateEarly(records));
        };
        fetchAttendance();
        return () => { on = false; };
    }, [selectedEmpId]);


    // 👑 iOS 优化：任何 modal 打开时，锁定 body 滚动
    useEffect(() => {
        const anyModalOpen = showAccessModal || showInventoryAccessModal || showTerminateModal || showDeleteModal || showLoanModal || showReviewModal || !!viewImage;
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
    }, [showAccessModal, showInventoryAccessModal, showTerminateModal, showDeleteModal, showLoanModal, showReviewModal, viewImage]);

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
        if (!form.name || !form.id) return alert("⚠️ 姓名和工号必填");
        const newEmployee = form as Employee;
        await DataManager.saveEmployee(newEmployee);
        const existingIdx = employees.findIndex(e => e.id === newEmployee.id);
        let newList;
        if (existingIdx >= 0) { newList = [...employees]; newList[existingIdx] = newEmployee; } else { newList = [...employees, newEmployee]; }
        onSave(newList);
        setIsEditing(false);
        alert("✅ 档案已保存 (Saved)");
    };

    const handleReviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setIsUploadingReviewImage(true); try { const url = await uploadToCloudinary(file); setReviewFormState(prev => ({ ...prev, image: url })); } catch (error) { alert('❌ 上传失败'); } finally { setIsUploadingReviewImage(false); if(reviewFileInputRef.current) reviewFileInputRef.current.value = ''; } };
    const handleAddReview = async () => { if (!reviewFormState.content.trim()) return; const newReview: ReviewRecord = { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], author: currentBossId ? 'Manager' : 'Admin', content: reviewFormState.content, type: reviewFormState.type, image: reviewFormState.image }; const updatedReviews = [newReview, ...(form.reviews || [])]; const updatedEmp = { ...form, reviews: updatedReviews } as Employee; await DataManager.saveEmployee(updatedEmp); setForm(updatedEmp); const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e); onSave(newList); setReviewFormState({ content: '', type: 'NOTE', image: '' }); };
    const handleDeleteReview = async (reviewId: string) => { if (!confirm("确定删除此条评语?")) return; const updatedReviews = (form.reviews || []).filter(r => r.id !== reviewId); const updatedEmp = { ...form, reviews: updatedReviews } as Employee; await DataManager.saveEmployee(updatedEmp); setForm(updatedEmp); const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e); onSave(newList); };
    const handleResetPin = () => { if(confirm(`Reset PIN for ${form.name} to 0000?`)) { setForm({ ...form, pin: '0000' }); alert("✅ PIN 已重置为 0000，记得按保存"); } };
    
    // --- LOAN HANDLERS ---
    const loanBalance = useMemo(() => {
        return (form.loanRecords || []).reduce((sum, r) => sum + (r.type === 'BORROW' ? r.amount : -r.amount), 0);
    }, [form.loanRecords]);
    
    const handleAddLoan = async () => {
        if (!loanFormState.amount || loanFormState.amount <= 0) return alert("⚠️ 请输入金额");
        if (loanFormState.type === 'REPAY' && loanFormState.amount > loanBalance) return alert(`⚠️ 还款金额不能超过欠款余额 RM ${loanBalance.toFixed(2)}`);
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

        // 👑 同步资金管理：借出 = 现金支出 (STAFF_LOAN)，还款 = 现金流入 (代收)
        // id 用 loanRecord.id 派生，方便删除记录时反向同步删掉对应的资金流水
        if (newRecord.type === 'BORROW') {
            await DataManager.saveStandaloneExpense({
                id: `loan_${newRecord.id}`,
                category: 'STAFF_LOAN',
                expenseType: 'CASH_OUT',
                company: form.name || '',
                amount: newRecord.amount,
                note: `员工借款 - ${form.name}${newRecord.note ? `: ${newRecord.note}` : ''}`,
                time: newRecord.date,
                createdAt: new Date().toISOString(),
                paymentMethod: newRecord.via === 'BANK' ? 'BANK_TRANSFER' : newRecord.via === 'TNG' ? 'DUITNOW' : 'CASH',
                paymentStatus: 'PAID',
            });
        } else {
            await DataManager.saveFundTransfer({
                id: `loanrepay_${newRecord.id}`,
                date: newRecord.date,
                amount: newRecord.amount,
                fromAccount: 'OTHER',
                toAccount: newRecord.via === 'BANK' ? 'BANK' : 'CASH',
                type: 'DEPOSIT',
                note: `[员工还款] ${form.name}${newRecord.note ? `: ${newRecord.note}` : ''}`,
            });
        }

        setLoanFormState({ type: 'BORROW', amount: 0, note: '', via: 'CASH' });
        setShowLoanModal(false);
    };
    const handleDeleteLoan = async (loanId: string) => {
        if (!confirm("确定删除此借还款记录?\n\n资金管理里对应的现金流水也会一并删除。")) return;
        const targetRecord = (form.loanRecords || []).find(r => r.id === loanId);
        const updatedRecords = (form.loanRecords || []).filter(r => r.id !== loanId);
        const updatedEmp = { ...form, loanRecords: updatedRecords } as Employee;
        await DataManager.saveEmployee(updatedEmp);
        setForm(updatedEmp);
        const newList = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e);
        onSave(newList);

        // 👑 反向同步：删记录时把对应的资金流水也删掉，避免账对不上
        if (targetRecord?.type === 'BORROW') {
            await DataManager.deleteStandaloneExpense(`loan_${loanId}`);
        } else if (targetRecord?.type === 'REPAY') {
            await DataManager.deleteFundTransfer(`loanrepay_${loanId}`);
        }
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
        if (!terminationData.reason) return alert("⚠️ 请填写离职原因"); 
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
    const handleRestore = async () => {
        if (!confirm("确认复职该员工? (Restore Employee?)")) return;
        // 👑 不可以写 undefined 进 Firestore（会整个抛错），直接把这两个 key 拿掉，
        //    setDoc 整份覆盖时等于把栏位删掉。
        const { terminationReason, terminationDate, ...rest } = form as any;
        const updated = { ...rest, status: 'PROBATION', isArchived: false } as Employee;
        try {
            await DataManager.saveEmployee(updated);
            setForm(updated);
            const newList = employees.map(e => e.id === updated.id ? updated : e);
            onSave(newList);
            setIsEditing(true);   // 留在编辑模式，可以接着改资料再按「保存」
            alert("✅ 员工已复职 (Restored)\n可以继续修改资料，改完按「保存」。");
        } catch (e: any) {
            console.error('复职失败', e);
            alert(`❌ 复职失败：${e?.message || '未知错误'}`);
        }
    };
    const confirmDelete = async () => { if (!selectedEmpId || !form.name) return; try { await DataManager.deleteEmployee(selectedEmpId); const newList = employees.filter(e => e.id !== selectedEmpId); onSave(newList); setSelectedEmpId(null); setIsEditing(false); setShowDeleteModal(false); alert("✅ 档案已永久删除 (Deleted)"); } catch (e) { console.error(e); alert("❌ 删除失败 (Delete Failed)"); } };
    const addSalaryRecord = () => { const amountStr = prompt("输入新薪资 (New Amount):", form.basicSalary?.toString()); const reason = prompt("调整原因 (Reason):", "Annual Increment"); if(amountStr && reason) { const amount = parseFloat(amountStr); const newRecord: SalaryRecord = { date: new Date().toISOString().split('T')[0], amount: amount, adjustment: amount - (form.basicSalary || 0), percentage: 0, reason: reason }; setForm({ ...form, basicSalary: amount, salaryHistory: [newRecord, ...(form.salaryHistory || [])] }); } };
    const deleteSalaryRecord = (index: number) => { if(!form.salaryHistory) return; if(!confirm("确定删除此薪资记录? (Confirm Delete?)")) return; const newHistory = [...form.salaryHistory]; newHistory.splice(index, 1); setForm({...form, salaryHistory: newHistory}); };
    const confirmAddWarning = () => { if(!warnReason) return alert("⚠️ 请填写原因"); const newWarning: WarningRecord = { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], type: warnType as any, reason: warnReason, issuer: currentBossId || 'Admin' }; setForm({ ...form, warningHistory: [newWarning, ...(form.warningHistory || [])] }); setShowWarningInput(false); setWarnReason(''); };
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
    /** 👑 新增副职：下拉选的、自己打的都走这里，统一去重 */
    const handleAddSecondaryRole = (raw: string) => {
        const name = (raw || '').trim();
        if (!name) return;
        if (name === form.role) { alert('⚠️ 这个已经是主职了，不用再加一次'); return; }
        if ((form.secondaryRoles || []).includes(name)) { alert('⚠️ 这个副职已经加过了'); return; }
        setForm({ ...form, secondaryRoles: [...(form.secondaryRoles || []), name] });
        setNewSecondaryRole('');
    };

    const handleUpdateAssessmentTargets = (targets: string[]) => { setForm({ ...form, assessmentTargets: targets }); };
    const handleApplyInventoryAccess = (inventoryAccess: InventoryAccessConfig) => { setForm({ ...form, inventoryAccess }); };


    // ---------- 🧹 PIC 负责项目 ----------
    const handleAddPicArea = (name: string) => {
        const clean = (name || '').trim();
        if (!clean) return;
        if ((form.picAreas || []).some(a => a.name === clean)) { alert('⚠️ 这个负责项目已经加过了'); return; }
        const next: PicArea[] = [...(form.picAreas || []), { id: `PIC_${Date.now()}`, name: clean }];
        setForm({ ...form, picAreas: next });
        setNewPicName('');
    };
    const handleRemovePicArea = (id: string) => {
        setForm({ ...form, picAreas: (form.picAreas || []).filter(a => a.id !== id) });
    };

    /** 外劳：国籍不是马来西亚 → 显示 / 编辑护照号码 */
    const isForeignWorker = !!form.nationality && !/malaysia/i.test(form.nationality);

    /** ⭐ 老板 / 管理员：可以给 ★4、★5，也可以改工作项目清单 */
    const canRateSkillHigh = isSuperAdminMode || Boolean(
        currentEmployee && (getPortalRole(currentEmployee) === PortalRole.BOSS || getOrgLevel(currentEmployee) === 'OWNER')
    );

    // 连续快速点星星时，用 ref 拿「最新」的 form，避免后一下盖掉前一下
    const skillFormRef = useRef(form);
    skillFormRef.current = form;
    const skillSaveChain = useRef<Promise<void>>(Promise.resolve());

    const handleRateSkill = (itemId: string, level: StarLevel | null) => {
        const cur = skillFormRef.current;
        if (!cur.id) return;
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const by = currentEmployee?.name || (isSuperAdminMode ? 'Admin' : 'Manager');
        const prev = cur.skillRatings?.[itemId]?.level;
        const ratings = { ...(cur.skillRatings || {}) };
        if (level) ratings[itemId] = { level, ratedAt: today, ratedBy: by };
        else delete ratings[itemId];
        const logEntry: any = { itemId, at: now.toISOString(), by };
        if (prev) logEntry.from = prev;
        if (level) logEntry.to = level;
        const updated = { ...cur, skillRatings: ratings, skillRatingLog: [logEntry, ...(cur.skillRatingLog || [])].slice(0, 300) } as Employee;
        skillFormRef.current = updated;
        setForm(updated);
        // 编辑中 → 跟「保存」一起存；没在编辑 → 马上存
        if (isEditing) return;
        setSkillSaving(true);
        skillSaveChain.current = skillSaveChain.current
            .then(async () => {
                const latest = skillFormRef.current as Employee;
                await DataManager.saveEmployee(latest);
                onSave(employees.map(e => (e.id === latest.id ? { ...e, skillRatings: latest.skillRatings, skillRatingLog: latest.skillRatingLog } : e)));
            })
            .catch(err => {
                console.error('Save skill rating failed', err);
                alert('❌ 评分没存到，请检查网络后再点一次');
            })
            .finally(() => setSkillSaving(false));
    };

    const canConfigureInventoryAccess = isSuperAdminMode || Boolean(
        currentEmployee && getPortalRole(currentEmployee) === PortalRole.BOSS
    );
    const resolvedInventoryAccess = resolveInventoryAccess(form as Employee);
    const enabledInventoryPermissions = INVENTORY_PERMISSIONS.filter(permission => resolvedInventoryAccess.permissions[permission]);
    
    const getTenure = (dateStr: string) => { if(!dateStr) return '-'; const start = new Date(dateStr); const now = new Date(); const diffTime = Math.abs(now.getTime() - start.getTime()); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); if(diffDays < 30) return `${diffDays} Days`; if(diffDays < 365) return `${Math.floor(diffDays/30)} Months`; return `${(diffDays/365).toFixed(1)} Years`; };
    // 旧的「一键导出 PDF」已被 HRExportDialog 取代（可选格式 / 部门 / 栏位）

    const handleExportSinglePDF = async () => {
        if (!singleProfileRef.current || !form.id) return;
        setIsGeneratingSinglePdf(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await waitForPdfFonts();
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
            
            const pdf = new (await loadJsPDF())('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Profile_${form.name}_${form.id}.pdf`);
        } catch (err) {
            console.error("Single PDF Gen Error:", err);
            alert("❌ 档案生成失败，请重试");
        } finally {
            setIsGeneratingSinglePdf(false);
        }
    };

    // ✅ FIX: Added return statement and wrapped all JSX in a single parent container
    return (
        <div className="flex h-full overflow-hidden relative">

            {/* 🍎 iOS 优化版侧边栏 (Sidebar) */}
            <div className={`w-full md:w-80 lg:w-96 bg-[#F6F7FB] border-r border-gray-200 flex flex-col shrink-0 h-full relative ${selectedEmpId ? 'hidden md:flex' : 'flex'}`}>
                
                {/* 顶部：只留一行；新增 / 打印 / 技能总表 / 搜寻 / 在职·已离职 都收进「更多」 */}
                <div className="sticky top-0 z-20 bg-[#F6F7FB]/90 backdrop-blur-xl border-b border-gray-200/60 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 text-sm font-black text-[#111111] truncate">
                            {showResigned ? '已离职' : '在职员工'} · {filteredEmployees.length} 人
                            {searchTerm && <span className="ml-1.5 text-xs font-bold text-amber-700">「{searchTerm}」</span>}
                        </div>
                        <button type="button" onClick={() => setListMoreOpen(v => !v)} aria-expanded={listMoreOpen}
                            className={`shrink-0 min-h-[40px] px-3 rounded-xl text-xs font-black flex items-center gap-1 border ${listMoreOpen ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : 'bg-white text-gray-700 border-gray-200'}`}>
                            更多 {listMoreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    </div>
                    {listMoreOpen && (
                        <div className="mt-2.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input type="text" placeholder="搜索姓名 / ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl font-medium text-[#111111] placeholder-gray-500 outline-none focus:border-[#FFD200] focus:ring-2 focus:ring-[#FFD200]/30"
                                    style={{ fontSize: '16px', minHeight: '40px' }} />
                            </div>
                            <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-200/60 p-1">
                                {([[false, '在职员工'], [true, '已离职']] as const).map(([v, label]) => (
                                    <button key={label} type="button" onClick={() => { setShowResigned(v); setSelectedEmpId(null); }}
                                        className={`min-h-[40px] rounded-lg text-[13px] font-black flex items-center justify-center gap-1.5 ${showResigned === v ? 'bg-white text-[#111111] shadow-sm' : 'text-gray-500'}`}>
                                        {v && <Archive size={14} />}{label}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                <button onClick={() => { setListMoreOpen(false); handleAddNew(); }} className="min-h-[44px] rounded-xl bg-[#111111] text-[#FFD200] text-xs font-black flex items-center justify-center gap-1"><Plus size={15} /> 新增</button>
                                <button onClick={() => { setListMoreOpen(false); setIsExportOpen(true); }} className="min-h-[44px] rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-black flex items-center justify-center gap-1"><Printer size={14} /> 打印</button>
                                <button onClick={() => { setListMoreOpen(false); setIsSkillMatrixOpen(true); }} className="min-h-[44px] rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-black flex items-center justify-center gap-1"><Grid3x3 size={14} /> 技能总表</button>
                            </div>
                        </div>
                    )}
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
                                    <div className="sticky top-0 z-10 bg-[#F6F7FB]/90 backdrop-blur-md py-1 px-1 flex items-center justify-between">
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
                                            // 主职 / 副职各自的平均星（评过才有）
                                            const scores = positionSkillScores(emp, skillCatalog);
                                            const starOf = (title: string) => scores[title] !== undefined ? ` ★${scores[title].toFixed(1)}` : '';

                                            return (
                                                <div 
                                                    key={emp.id} 
                                                    onClick={() => handleSelect(emp)} 
                                                    className={`group relative p-3 rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.98] flex items-center gap-3 border ${
                                                        isSelected 
                                                        ? 'bg-[#111111] text-white border-black shadow-lg shadow-black/10' 
                                                        : 'bg-white text-gray-700 border-gray-100 hover:border-gray-300 hover:shadow-sm'
                                                    } ${isTerminated ? 'opacity-60 grayscale' : ''}`}
                                                >
                                                    {/* 头像 */}
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 overflow-hidden shadow-sm ${
                                                        isSelected ? 'bg-gray-800 text-[#FFD200] ring-2 ring-[#FFD200]' : 'bg-gray-100 text-gray-400'
                                                    }`}>
                                                        {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" /> : (emp.name || 'U').charAt(0)}
                                                    </div>
                                                    
                                                    <div className="min-w-0 flex-grow space-y-1">
                                                        {/* 第一行：工号 + 名字 + 警告标识 */}
                                                        <div className="flex justify-between items-center gap-2">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-black ${isSelected ? 'bg-white/15 text-[#FFD200]' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                                                    {emp.id}
                                                                </span>
                                                                <div className={`text-sm font-black truncate ${isSelected ? 'text-white' : 'text-[#111111]'}`}>
                                                                    {emp.name}
                                                                </div>
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
                                                        
                                                        {/* 第二行：主职（评过星就显示「厨师 ★3.5」） */}
                                                        <div className={`text-[11px] font-bold truncate ${isSelected ? 'text-[#FFD200]' : 'text-gray-500'}`}>
                                                            {getRoleChinese(emp.role)}
                                                            {starOf(emp.role) && <span className={`font-black ${isSelected ? 'text-[#FFD200]' : 'text-amber-700'}`}>{starOf(emp.role)}</span>}
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
                                                                        {getRoleChinese(sr)}{starOf(sr)}
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
                                                            {shiftGroupOf(emp) !== 'NONE' && (() => {
                                                                const g = SHIFT_GROUP_META[shiftGroupOf(emp)];
                                                                return (
                                                                    <span title="排班分组（跟考勤同步）" className="text-[9px] px-1.5 py-0.5 rounded-md font-black tracking-wider border"
                                                                        style={isSelected ? { background: 'rgba(255,255,255,0.2)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' } : { background: g.bg, color: g.fg, borderColor: g.border }}>
                                                                        {g.label}
                                                                    </span>
                                                                );
                                                            })()}
                                                            {getOrgLevel(emp) !== 'CREW' && (
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                                                    getOrgLevel(emp) === 'OWNER' ? 'bg-[#FFD200] text-black' : 
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
            <div
                ref={detailScrollRef}
                onScroll={e => {
                    const collapsed = (e.currentTarget as HTMLDivElement).scrollTop > 140;
                    if (collapsed !== headerCollapsed) setHeaderCollapsed(collapsed);
                }}
                className={`flex-grow flex flex-col h-full bg-[#F6F7FB] overflow-y-auto overflow-x-hidden overscroll-x-none relative ${!selectedEmpId ? 'hidden md:flex' : 'flex'}`}
            >
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
                        {/* 📱 手机版：往下滑后出现的精简头部（名字 + 编辑） */}
                        <div className="md:hidden sticky top-0 z-40 h-0">
                            <div
                                className={`absolute inset-x-0 top-0 h-14 flex items-center gap-2 px-3 bg-[#111111] text-white shadow-lg transition-transform duration-200 ${headerCollapsed ? 'translate-y-0' : '-translate-y-full pointer-events-none'}`}
                                aria-hidden={!headerCollapsed}
                            >
                                <button onClick={() => setSelectedEmpId(null)} className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center bg-white/10 active:scale-95 shrink-0" aria-label="返回">
                                    <ArrowLeft size={18}/>
                                </button>
                                <p className="flex-1 min-w-0 font-black text-base truncate">{form.name || 'New Staff'}</p>
                                {isEditing ? (
                                    <>
                                        <button onClick={() => setIsEditing(false)} className="px-3 h-11 bg-white/10 rounded-xl text-xs font-bold active:scale-95 shrink-0">取消</button>
                                        <button onClick={handleSaveForm} className="px-4 h-11 bg-[#FFD200] text-black rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 shrink-0"><Save size={14}/> 保存</button>
                                    </>
                                ) : (
                                    <button onClick={() => setIsEditing(true)} className="px-3 h-11 bg-white text-black rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 shrink-0"><Edit3 size={14}/> 编辑</button>
                                )}
                            </div>
                        </div>

                        {/* Header Section */}
                        <div className={`bg-gradient-to-br p-5 pb-20 md:p-6 md:pb-28 relative overflow-hidden shadow-lg shrink-0 ${form.isArchived ? 'from-gray-800 to-gray-900 grayscale' : 'from-[#111111] to-[#2A2A2A]'}`}>
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                            
                            {/* 顶部按钮栏 */}
                            <div className="flex justify-between items-start relative z-10 text-white gap-3">
                                <button onClick={() => setSelectedEmpId(null)} className="md:hidden p-2 -ml-2 bg-white/10 rounded-full hover:bg-white/20 active:scale-95 transition-all shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center">
                                    <ArrowLeft size={20}/>
                                </button>
                                
                                <div className="flex items-center justify-end gap-2 ml-auto flex-nowrap overflow-x-auto scrollbar-hide">
                                    {/* 借款按钮 —— 新加到前面，用户问过借款功能在哪 */}
                                    {!isEditing && !form.isArchived && (
                                        <button onClick={() => setShowLoanModal(true)} className="relative p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center gap-1.5 active:scale-95 shrink-0 min-h-[44px] md:min-h-0" title="借还款">
                                            <Wallet size={14}/>
                                            {loanBalance > 0 && (
                                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black flex items-center justify-center">!</span>
                                            )}
                                        </button>
                                    )}
                                    <button onClick={() => setShowReviewModal(true)} className="p-2 md:px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shrink-0 min-h-[44px] md:min-h-0" title="记录评语">
                                        <MessageSquarePlus size={14}/> <span className="hidden md:inline">评语</span>
                                    </button>
                                    <button onClick={handleExportSinglePDF} disabled={isGeneratingSinglePdf} className="p-2 md:px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shrink-0 min-h-[44px] md:min-h-0" title="导出档案">
                                        {isGeneratingSinglePdf ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} <span className="hidden md:inline">导出</span>
                                    </button>
                                    {isEditing ? (
                                        <>
                                            <button onClick={() => setIsEditing(false)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white active:scale-95 shrink-0 min-h-[44px] md:min-h-0">取消</button>
                                            <button onClick={handleSaveForm} className="px-4 py-2 bg-[#FFD200] hover:bg-[#E5C100] text-black rounded-xl text-xs font-black shadow-lg flex items-center gap-1.5 active:scale-95 shrink-0 min-h-[44px] md:min-h-0"><Save size={14}/> 保存</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setIsEditing(true)} className="px-3 py-2 bg-white text-black rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 hover:bg-gray-100 active:scale-95 shrink-0 min-h-[44px] md:min-h-0"><Edit3 size={14}/> 编辑</button>
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 md:mt-2 text-white relative z-10">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight flex items-center gap-3 break-all">
                                        {form.name || 'New Staff'}
                                    </h1>
                                    
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
                                            <div className="flex flex-col md:flex-row md:items-center gap-2">
                                                <span className="shrink-0 text-[#FFD200]">主职 (Primary):</span>
                                                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 outline-none font-bold w-full md:w-auto" style={{ fontSize: '16px', minHeight: '40px' }}>
                                                    {DEFAULT_ROLES.map(r => <option key={r.id} value={r.title} className="text-black">{r.title}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex flex-col md:flex-row md:items-start md:items-center gap-2 flex-wrap">
                                                <span className="shrink-0 text-white/70 mt-1 md:mt-0">副职 (Secondary):</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {form.secondaryRoles?.map(sr => (
                                                        <span key={sr} className="bg-blue-500/20 text-blue-200 px-2 py-1 rounded-lg border border-blue-500/30 flex items-center gap-1 shrink-0">
                                                            {sr.split('(')[0]}
                                                            <button onClick={() => setForm({...form, secondaryRoles: form.secondaryRoles!.filter(r => r !== sr)})} className="hover:text-red-400 ml-1 p-0.5 active:scale-90 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><X size={12}/></button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto mt-1 md:mt-0">
                                                    <select value="" onChange={e => handleAddSecondaryRole(e.target.value)}
                                                        className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 outline-none font-bold cursor-pointer w-full md:w-auto"
                                                        style={{ fontSize: '16px', minHeight: '40px' }}>
                                                        <option value="" className="text-black">+ 从职位列表选</option>
                                                        {DEFAULT_ROLES.filter(r => r.title !== form.role && !form.secondaryRoles?.includes(r.title)).map(r => <option key={r.id} value={r.title} className="text-black">{r.title}</option>)}
                                                    </select>
                                                    {/* 👑 列表里没有的，自己打 */}
                                                    <div className="flex gap-1.5 w-full md:w-auto">
                                                        <input
                                                            value={newSecondaryRole}
                                                            onChange={e => setNewSecondaryRole(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSecondaryRole(newSecondaryRole); } }}
                                                            placeholder="自己打，例如：打荷"
                                                            className="flex-1 min-w-0 md:w-[150px] bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-2 outline-none font-bold focus:border-[#FFD200]"
                                                            style={{ fontSize: '16px', minHeight: '40px' }} />
                                                        <button onClick={() => handleAddSecondaryRole(newSecondaryRole)}
                                                            className="px-3 rounded-lg bg-[#FFD200] text-black font-black shrink-0 active:scale-95 flex items-center justify-center"
                                                            style={{ minHeight: '40px' }}>
                                                            <Plus size={16}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 mt-2 w-full">
                                            {/* 主职 + 副职 (统一 flex-wrap 布局，桌面端不再浪费空间) */}
                                            <div className="flex items-start gap-2 flex-wrap">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-white/40 w-8 shrink-0 mt-1.5">主职</span>
                                                <span className="bg-[#FFD200] text-black px-3 py-1.5 rounded-lg font-black text-xs shadow-md">
                                                    {form.role}
                                                </span>
                                                {shiftGroupOf(form) !== 'NONE' && (
                                                    <span className="px-3 py-1.5 rounded-lg font-black text-xs shadow-md text-white" style={{ background: SHIFT_GROUP_META[shiftGroupOf(form)].solid }} title="排班分组（跟考勤、组织图同步）">
                                                        {SHIFT_GROUP_META[shiftGroupOf(form)].label}
                                                    </span>
                                                )}
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

                            {/* 分页：手机与电脑同一套，一次只看一类资料 */}
                            <div className="grid grid-cols-5 bg-white/95 backdrop-blur-md p-1 rounded-2xl border border-gray-200 sticky top-14 md:top-2 z-30 mb-4 gap-1 shadow-sm">
                                {DETAIL_TABS.map(t => (
                                    <button key={t.id} onClick={() => setMobileDetailTab(t.id)}
                                        className={`min-h-[44px] py-2.5 text-center rounded-xl text-[13px] font-black transition-all ${mobileDetailTab === t.id ? 'bg-[#111111] text-[#FFD200] shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                                {/* 左侧列：头像、考勤、薪资卡片 */}
                                <div className="xl:col-span-4 flex flex-col gap-6">
                                    <div className={`bg-white rounded-[2rem] p-4 md:p-6 shadow-sm border border-gray-200 flex-row md:flex-col items-center justify-start md:justify-center gap-4 md:gap-0 relative overflow-hidden group ${mobileDetailTab === 'basic' ? 'flex' : 'hidden'}`}>
                                        <div className="relative w-20 h-20 md:w-40 md:h-40 md:mb-4 cursor-pointer shrink-0" onClick={() => isEditing && fileInputRef.current?.click()}>
                                            <div className={`w-20 h-20 md:w-40 md:h-40 rounded-full overflow-hidden border-4 shadow-xl bg-gray-100 relative z-10 ${form.isArchived ? 'border-gray-300 grayscale' : 'border-white'}`}>
                                                {form.avatar ? <img src={form.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl md:text-5xl text-gray-300 font-black">{(form.name || 'U').charAt(0)}</div>}
                                            </div>
                                            {isEditing && <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-white z-20"><Camera size={24}/></div>}
                                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if(!file) return; setIsUploading(true); try { const url = await uploadToCloudinary(file); setForm({...form, avatar: url}); } catch(err) { alert("❌ 上传失败"); } finally { setIsUploading(false); } }} />
                                        </div>
                                        <div className="flex gap-2 flex-wrap justify-start md:justify-center min-w-0">
                                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shrink-0 ${form.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : form.status === 'TERMINATED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {form.status === 'CONFIRMED' ? <CheckCircle2 size={12}/> : form.status === 'TERMINATED' ? <LogOut size={12}/> : <Clock size={12}/>}
                                                {form.status}
                                            </div>
                                            {form.orgLevel && (
                                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border shrink-0 ${getOrgLevel(form as Employee) === 'OWNER' ? 'bg-gray-800 text-[#FFD200] border-gray-800' : getOrgLevel(form as Employee) === 'BRANCH_MANAGER' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : getOrgLevel(form as Employee) === 'DEPARTMENT_HEAD' ? 'bg-red-100 text-red-700 border-red-200' : getOrgLevel(form as Employee) === 'TEAM_LEAD' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                    <Medal size={12}/> {getOrgLevelLabel(form as Employee)}
                                                </div>
                                            )}
                                            <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-blue-50 text-blue-700 shrink-0">{form.nationality}</div>
                                        </div>
                                    </div>
                                    
                                    <div className={`rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 transition-all bg-white ${mobileDetailTab === 'records' ? 'block' : 'hidden'}`}>
                                        <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-gray-400">
                                            <CalendarDays size={14}/> 考勤记录 (累计)
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-center">
                                            {([['迟到次数', 'Late', attendanceSnapshot.late, attendanceSnapshot.lastLate], ['早退次数', 'Early out', attendanceSnapshot.early, attendanceSnapshot.lastEarly]] as const).map(([zh, en, n, last]) => (
                                                <div key={en} className={`rounded-2xl p-3 border ${n > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                                                    <div className={`text-2xl font-black tabular-nums ${n > 0 ? 'text-red-600' : 'text-gray-800'}`}>{n}</div>
                                                    <div className="text-[11px] font-bold text-gray-600">{zh} <span className="text-gray-400">{en}</span></div>
                                                    {last && <div className="text-[10px] text-gray-400 mt-0.5">最近 {last}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {mobileDetailTab === 'records' && selectedEmpId && <EmployeePointsCard employee={form as Employee} />}

                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'access' ? 'block' : 'hidden'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Lock size={14}/> <span className="leading-tight">登录密码<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Access PIN</span></span></h4>
                                        <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between border border-gray-100">
                                            <div className="flex items-center gap-3"><div className="p-2 bg-white rounded-xl shadow-sm"><Lock size={16} className="text-gray-400"/></div><div><p className="text-[10px] font-bold text-gray-400 uppercase">PIN CODE</p><p className="text-lg font-mono font-black text-[#111111] tracking-widest">{showPin ? (form.pin || '0000') : '••••'}</p></div></div>
                                            <button onClick={() => setShowPin(!showPin)} className="p-2 text-gray-400 hover:text-black transition-colors active:scale-90 min-h-[44px] md:min-h-0">{showPin ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                                        </div>
                                    </div>

                                    {/* 薪水卡片 */}
                                    <div className={`bg-[#111111] rounded-[2rem] shadow-lg text-white relative overflow-hidden group transition-all duration-300 ${form.isArchived ? 'grayscale opacity-80' : ''} ${mobileDetailTab === 'salary' ? 'block' : 'hidden'}`}>
                                        <button onClick={() => setIsSalaryExpanded(!isSalaryExpanded)} className="w-full p-4 md:p-6 flex justify-between items-center text-left relative z-10 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 pr-2">
                                                <div className="p-2 bg-white/10 rounded-full text-[#FFD200] shrink-0"><div className="font-mono text-lg leading-none">$</div></div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] font-bold text-[#FFD200] uppercase tracking-widest truncate">Salary ({form.salaryMode || 'MONTHLY'})</p>
                                                    <p className="text-base md:text-xl font-mono font-black text-white truncate tabular-nums">RM {(form.basicSalary || 0).toLocaleString()}</p>
                                                    {/* 辅助信息做成 inline 小字，不再抢位置 */}
                                                    <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-white/50">
                                                        <span className="flex items-center gap-1">
                                                            <span className="text-white/30">休</span>
                                                            <span className="text-white/70">{form.monthlyRestDays ?? 4}d</span>
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
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                                    <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                                                        <BiLabel tone="dark" text="Monthly Rest Days" />
                                                        {isEditing ? (
                                                            <select value={form.monthlyRestDays || 4} onChange={e => setForm({...form, monthlyRestDays: parseInt(e.target.value)})} className="bg-white/10 text-white font-bold rounded p-2 w-full outline-none border border-white/20" style={{ fontSize: '16px', minHeight: '40px' }}>
                                                                <option className="text-black" value={2}>2 Days</option>
                                                                <option className="text-black" value={3}>3 Days</option>
                                                                <option className="text-black" value={4}>4 Days</option>
                                                            </select>
                                                        ) : (
                                                            <p className="text-sm font-bold text-white">{form.monthlyRestDays ?? 4} Days</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 flex items-center justify-between">
                                                        <div>
                                                            <BiLabel tone="dark" text="Hostel" />
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
                                                        <BiLabel tone="dark" text="薪资结算资格 (Payroll Eligibility)" />
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
                                                    <div className="flex-1 w-full md:w-auto">
                                                         <BiLabel tone="dark" text="Basic Salary / Mode" />
                                                         {isEditing ? (
                                                             <div className="flex flex-wrap items-center gap-2">
                                                                 <select value={form.salaryMode || 'MONTHLY'} onChange={(e) => setForm({...form, salaryMode: e.target.value as any})} className="bg-white/10 text-[#FFD200] font-bold uppercase tracking-widest border border-white/20 rounded px-2 py-2 outline-none cursor-pointer" style={{ fontSize: '16px', minHeight: '40px' }}>
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
                                                    {isEditing && <button onClick={addSalaryRecord} className="text-[10px] bg-[#FFD200] text-black px-3 py-2 rounded-lg font-bold shadow-md active:scale-95 transition-all shrink-0 min-h-[44px] md:min-h-0">+ Increment</button>}
                                                </div>
                                                
                                                <div className="space-y-3 pt-4 border-t border-white/10 mb-4">
                                                    <div className="flex flex-wrap justify-between items-center text-xs gap-2"><span className="text-white/60 shrink-0">Bank</span>{isEditing ? <select value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} className="bg-white/10 text-white rounded p-2 outline-none flex-1 max-w-[180px]" style={{ fontSize: '16px', minHeight: '40px' }}><option value="">Select</option>{BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}</select> : <span className="font-bold">{form.bankName || '-'}</span>}</div>
                                                    <div className="flex flex-wrap justify-between items-center text-xs gap-2"><span className="text-white/60 shrink-0">Account</span>{isEditing ? <input value={form.bankAccount || ''} onChange={e => setForm({...form, bankAccount: e.target.value})} className="bg-white/10 text-white rounded p-2 outline-none flex-1 max-w-[180px] text-right font-mono" style={{ fontSize: '16px', minHeight: '40px' }} inputMode="numeric" /> : <span className="font-mono font-bold">{form.bankAccount || '-'}</span>}</div>
                                                </div>

                                                {/* 💳 薪资付款方式 + 🛡️ LINDUNG 24 Jam —— 薪资结算会自动带入 */}
                                                <div className="space-y-3 pb-4 mb-4 border-b border-white/10">
                                                    <div className="flex flex-wrap justify-between items-center text-xs gap-2">
                                                        <span className="text-white/60 shrink-0">薪资付款方式</span>
                                                        {isEditing ? (
                                                            <div className="flex bg-white/10 rounded-lg p-0.5">
                                                                {(['BANK', 'CASH'] as const).map(m => (
                                                                    <button key={m} type="button" onClick={() => setForm({ ...form, payrollPaymentMethod: m })}
                                                                        className={`px-3 rounded-md font-black min-h-[40px] ${(form.payrollPaymentMethod || 'BANK') === m ? (m === 'BANK' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'text-white/50'}`}>
                                                                        {m === 'BANK' ? '🏦 银行' : '💵 现金'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="font-bold">{(form.payrollPaymentMethod || 'BANK') === 'CASH' ? '💵 现金' : '🏦 银行转账'}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap justify-between items-center text-xs gap-2">
                                                        <span className="text-white/60 shrink-0">LINDUNG 24 Jam</span>
                                                        {isEditing ? (
                                                            <div className="flex bg-white/10 rounded-lg p-0.5">
                                                                <button type="button" onClick={() => setForm({ ...form, lindungOptOut: false })}
                                                                    className={`px-3 rounded-md font-black min-h-[40px] ${!form.lindungOptOut ? 'bg-[#FFD200] text-black' : 'text-white/50'}`}>扣</button>
                                                                <button type="button" onClick={() => setForm({ ...form, lindungOptOut: true })}
                                                                    className={`px-3 rounded-md font-black min-h-[40px] ${form.lindungOptOut ? 'bg-white text-black' : 'text-white/50'}`}>不扣</button>
                                                            </div>
                                                        ) : (
                                                            <span className="font-bold">{form.lindungOptOut ? '不扣' : '扣'}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="pt-2 border-t border-white/10">
                                                    <p className="text-[9px] font-bold text-white/40 uppercase mb-2">History</p>
                                                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">{form.salaryHistory?.length === 0 && <p className="text-[10px] text-white/30 italic">No records</p>}{form.salaryHistory?.map((rec, idx) => (<div key={idx} className="flex justify-between items-center text-[10px] bg-white/5 p-2 rounded gap-2"><div><div className="font-bold text-white/80">{rec.date}</div><div className="text-white/50">{rec.reason}</div></div><div className="text-right shrink-0"><div className="font-mono font-bold text-[#FFD200]">RM {rec.amount}</div><div className={`${rec.adjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>{rec.adjustment >= 0 ? '+' : ''}{rec.adjustment}</div></div>{isEditing && <button onClick={() => deleteSalaryRecord(idx)} className="text-red-400 ml-2 p-1 active:scale-90 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><Trash2 size={12}/></button>}</div>))}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                </div>

                                <div className="xl:col-span-8 flex flex-col gap-6">
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'basic' ? 'block' : 'hidden'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2"><User size={14}/> <span className="leading-tight">个人档案<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Personal</span></span></h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-4">
                                            <InputField label="全名 (Full Name)" value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} placeholder="Name" isEditing={isEditing} />
                                            <InputField label="昵称 (Nickname)" value={form.nickname || ''} onChange={(e: any) => setForm({...form, nickname: e.target.value})} placeholder="例如：阿明" isEditing={isEditing} />
                                            {isForeignWorker
                                                ? <InputField label="护照号码 (Passport)" value={form.passportNo || (isEditing ? '' : form.icNumber)} onChange={(e: any) => setForm({...form, passportNo: e.target.value})} placeholder="Passport No" isEditing={isEditing} />
                                                : <InputField label="IC 号码 (MyKad)" value={form.icNumber} onChange={(e: any) => setForm({...form, icNumber: e.target.value})} placeholder="900101-14-5555" isEditing={isEditing} />}
                                            <InputField label="手机 (Phone)" value={form.phone} onChange={(e: any) => setForm({...form, phone: e.target.value})} placeholder="012..." isEditing={isEditing} />
                                            <SelectField label="性别 (Gender)" value={form.gender} onChange={(e: any) => setForm({...form, gender: e.target.value})} options={['Male', 'Female']} isEditing={isEditing} />
                                            <SelectField label="国籍 (Nationality)" value={form.nationality} onChange={(e: any) => setForm({...form, nationality: e.target.value})} options={NATIONALITY_OPTS} isEditing={isEditing} />
                                            <SelectField label="雇佣状态 (Status)" value={form.status} onChange={(e: any) => setForm({...form, status: e.target.value})} options={[{label:'正式 (Confirmed)', value:'CONFIRMED'}, {label:'试用 (Probation)', value:'PROBATION'}, {label:'离职 (Terminated)', value:'TERMINATED'}]} isEditing={isEditing} />
                                            {/* 不计入员工：资料留在档案（例如老板），但不算人数、不排班、人事中心不显示 */}
                                            <div>
                                                <BiLabel text="计入员工 (Staff count)" />
                                                {isEditing ? (
                                                    <label className={`flex items-center justify-between gap-3 rounded-xl border px-3 min-h-[48px] cursor-pointer ${form.excludeFromStaff ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                                                        <span className="text-xs font-bold text-[#111111] leading-tight">不计入员工<span className="block text-[10px] font-medium text-gray-500">不算人数、不排班</span></span>
                                                        <input type="checkbox" checked={!!form.excludeFromStaff} onChange={e => setForm({...form, excludeFromStaff: e.target.checked})} className="w-5 h-5 accent-orange-500 cursor-pointer shrink-0" />
                                                    </label>
                                                ) : (
                                                    <div className={`text-sm font-bold py-1.5 md:p-2 border border-transparent min-h-[32px] md:min-h-[36px] ${form.excludeFromStaff ? 'text-orange-600' : 'text-[#111111]'}`}>{form.excludeFromStaff ? '不计入员工' : '计入'}</div>
                                                )}
                                            </div>
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
                                            <SelectField label="语言 (Language)" value={form.preferredLanguage || 'zh_en'} onChange={(e: any) => setForm({...form, preferredLanguage: e.target.value})} options={[{label:'中英双语 (ZH / EN)', value:'zh_en'}, {label:'English Only (EN)', value:'en'}, {label:'မြန်မာ (Burmese / MY)', value:'my'}]} isEditing={isEditing} />
                                            {/* 👥 排班分组：跟考勤（班次 1 / 2）、组织图同一个栏位 */}
                                            <div>
                                                <BiLabel text="排班分组 (Group)" />
                                                {isEditing ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {([1, 2] as const).map(n => {
                                                            const key = n === 1 ? 'A' : 'B';
                                                            const m = SHIFT_GROUP_META[key];
                                                            const on = form.shiftGroup === n;
                                                            return (
                                                                <button key={n} type="button"
                                                                    onClick={() => setForm({ ...form, shiftGroup: on ? undefined : n })}
                                                                    className="rounded-xl border-2 font-black text-sm active:scale-95 transition-all"
                                                                    style={{ minHeight: 48, background: on ? m.solid : '#fff', color: on ? '#fff' : m.fg, borderColor: on ? m.solid : m.border }}>
                                                                    {m.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm font-bold py-1.5 md:p-2 min-h-[32px] md:min-h-[36px]">
                                                        {shiftGroupOf(form) === 'NONE'
                                                            ? <span className="text-gray-400">未分组（考勤按 Group A 时间）</span>
                                                            : <span style={{ color: SHIFT_GROUP_META[shiftGroupOf(form)].fg }}>{SHIFT_GROUP_META[shiftGroupOf(form)].label}</span>}
                                                    </div>
                                                )}
                                                {isEditing && <p className="text-[10px] text-gray-400 font-bold mt-1">跟考勤、组织图同步；再点一次 = 取消分组</p>}
                                            </div>
                                            {/* 🏢 组织架构图设定：BOD → 管理层 → 部门 → 员工（不影响权限职级、薪资部门） */}
                                            <div className="col-span-2 md:col-span-3 border-t border-gray-100 pt-4 mt-1">
                                                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                                                    <span className="text-xs font-black text-gray-700">🏢 组织架构图 (Org Chart)</span>
                                                    <span className="text-[10px] font-bold text-gray-400">只影响组织图显示，不改权限、不改薪资部门</span>
                                                </div>
                                                <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-4">
                                                    {(() => {
                                                        const autoTier = resolveTier({ ...form, orgChartTier: undefined });
                                                        const tierNow = resolveTier(form);
                                                        const others = employees.filter(x => x.id !== form.id && !x.isArchived).sort((a, b) => String(a.name).localeCompare(String(b.name)));
                                                        const nameOf = (id?: string) => employees.find(x => x.id === id)?.name;
                                                        const sel = 'w-full p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#111111] outline-none focus:border-[#FFD200]';
                                                        const view = (v?: string, fallback = '-') => <div className="text-sm font-bold text-[#111111] py-1.5 md:p-2 min-h-[32px] md:min-h-[36px] break-words">{v || <span className="text-gray-400">{fallback}</span>}</div>;
                                                        const tierLabel = (t: string) => ORG_TIER_OPTIONS.find(o => o.value === t)?.short || t;
                                                        return (
                                                            <>
                                                                <div>
                                                                    <BiLabel text="组织层级 (Level)" />
                                                                    {isEditing ? (
                                                                        <select value={form.orgChartTier || ''} onChange={e => setForm({ ...form, orgChartTier: (e.target.value || undefined) as any })} className={sel} style={{ fontSize: '16px', minHeight: '48px' }}>
                                                                            <option value="">自动（按职级：{tierLabel(autoTier)}）</option>
                                                                            {ORG_TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                                        </select>
                                                                    ) : view(`${tierLabel(tierNow)}${form.orgChartTier ? '' : '（自动）'}`)}
                                                                </div>
                                                                <InputField label="组织图职位 (Position)" value={form.orgPosition} onChange={(e: any) => setForm({ ...form, orgPosition: e.target.value || undefined })} placeholder={`留空 = ${(form.role || '').split('(')[0].trim() || '职位'}`} isEditing={isEditing} />
                                                                {(tierNow === 'MANAGEMENT' || form.orgUnit) && (
                                                                    <div>
                                                                        <BiLabel text="负责单位 (Unit)" />
                                                                        {isEditing ? (
                                                                            <>
                                                                                <input list="org-unit-suggestions" value={form.orgUnit || ''} onChange={e => setForm({ ...form, orgUnit: e.target.value || undefined })} placeholder="留空 = 按工作部门（厨房 / 楼面…）" className={sel} style={{ fontSize: '16px', minHeight: '48px' }} />
                                                                                <datalist id="org-unit-suggestions">{ORG_UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}</datalist>
                                                                            </>
                                                                        ) : view(form.orgUnit, '按工作部门')}
                                                                    </div>
                                                                )}
                                                                {tierNow === 'MANAGEMENT' && (
                                                                    <div className="col-span-2 xl:col-span-3">
                                                                        <BiLabel text="管理部门 (Manages) · 可多选" />
                                                                        {isEditing ? (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {OPS_DEPTS.map(d => {
                                                                                    const list = form.orgManagesDepts || [];
                                                                                    const on = list.includes(d);
                                                                                    return (
                                                                                        <button key={d} type="button"
                                                                                            onClick={() => {
                                                                                                const next = on ? list.filter(x => x !== d) : [...list, d];
                                                                                                setForm({ ...form, orgManagesDepts: next.length ? next : undefined });
                                                                                            }}
                                                                                            className={`px-4 rounded-xl border-2 font-black text-sm active:scale-95 transition-all ${on ? 'bg-[#111111] border-[#111111] text-[#FFD200]' : 'bg-white border-gray-200 text-gray-600'}`}
                                                                                            style={{ minHeight: 44 }}>
                                                                                            {ORG_DEPT_META[d].emoji} {ORG_DEPT_META[d].zh}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        ) : view((form.orgManagesDepts || []).map(d => ORG_DEPT_META[d]?.zh || d).join('、'), '按工作部门 / 负责单位')}
                                                                        {isEditing && <p className="text-[10px] text-gray-400 font-bold mt-1">例如楼面主管同时管水吧、洗碗：三个都选，组织图上他的格子会横跨这三个部门。都不选 = 按工作部门。</p>}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <BiLabel text="直属上司 (Reports To)" />
                                                                    {isEditing ? (
                                                                        <select value={form.reportsTo || ''} onChange={e => setForm({ ...form, reportsTo: e.target.value || undefined })} className={sel} style={{ fontSize: '16px', minHeight: '48px' }}>
                                                                            <option value="">自动（{tierNow === 'STAFF' ? '同部门的管理层' : tierNow === 'MANAGEMENT' ? 'BOD' : '—'}）</option>
                                                                            {others.map(x => <option key={x.id} value={x.id}>{x.name}（{(x.role || '').split('(')[0].trim()}）</option>)}
                                                                        </select>
                                                                    ) : view(nameOf(form.reportsTo), '自动')}
                                                                </div>
                                                                <InputField label="第二身份 (2nd Role)" value={form.orgSecondaryRole} onChange={(e: any) => setForm({ ...form, orgSecondaryRole: e.target.value || undefined })} placeholder="例如：Personal Assistant" isEditing={isEditing} />
                                                                <div>
                                                                    <BiLabel text="第二身份汇报给" />
                                                                    {isEditing ? (
                                                                        <select value={form.orgSecondaryReportsTo || ''} onChange={e => setForm({ ...form, orgSecondaryReportsTo: e.target.value || undefined })} className={sel} style={{ fontSize: '16px', minHeight: '48px' }}>
                                                                            <option value="">没有</option>
                                                                            {others.map(x => <option key={x.id} value={x.id}>{x.name}（{(x.role || '').split('(')[0].trim()}）</option>)}
                                                                        </select>
                                                                    ) : view(nameOf(form.orgSecondaryReportsTo), '没有')}
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {isEditing && <p className="text-[10px] text-gray-400 font-bold mt-2">「工作部门」决定他排在组织图哪一栏（厨房 / 楼面…）；第二身份在组织图上用虚线 + 徽章表示，例如「PA to BEN」。</p>}
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-gray-50"><InputField label="住址 (Address)" value={form.address} onChange={(e: any) => setForm({...form, address: e.target.value})} placeholder="Full Address" isEditing={isEditing} /></div>
                                    </div>
 
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'salary' ? 'block' : 'hidden'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2"><Briefcase size={14}/> <span className="leading-tight">政府与卫生<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Govt & Health</span></span></h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-blue-50 rounded text-blue-600"><Shield size={14}/></div><span className="text-xs font-bold text-gray-700">法定缴纳 (Statutory)</span></div>
                                                <div className="grid grid-cols-2 gap-4"><InputField label="EPF No" value={form.epfNo} onChange={(e: any) => setForm({...form, epfNo: e.target.value})} placeholder="KWSP" isEditing={isEditing} /><InputField label="SOCSO No" value={form.socsoNo} onChange={(e: any) => setForm({...form, socsoNo: e.target.value})} placeholder="PERKESO" isEditing={isEditing} /></div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-green-50 rounded text-green-600"><Stethoscope size={14}/></div><span className="text-xs font-bold text-gray-700">卫生认证 (Health)</span></div>
                                                <div className="grid grid-cols-2 gap-4"><InputField label="打针有效 (Typhoid)" value={form.typhoidExpiry} onChange={(e: any) => setForm({...form, typhoidExpiry: e.target.value})} type="date" isEditing={isEditing} /><InputField label="餐馆课程 (Course Date)" value={form.foodHandlingDate} onChange={(e: any) => setForm({...form, foodHandlingDate: e.target.value})} type="date" isEditing={isEditing} /></div>
                                            </div>
                                        </div>
                                    </div>
 
                                    {/* ⭐ 工作能力 + 🧹 PIC 负责项目 */}
                                    <div className={`bg-white rounded-[2rem] p-3 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'skills' ? 'block' : 'hidden'}`}>
                                        {/* ⭐ 工作能力星级：主职 / 副职 → 工作项目 → ★1–★5 */}
                                        <SkillStarPanel
                                            employee={form}
                                            catalog={skillCatalog}
                                            canRateHigh={canRateSkillHigh}
                                            onRate={handleRateSkill}
                                            onOpenPrint={() => setShowSkillPrint(true)}
                                            onOpenCatalog={canRateSkillHigh ? () => setShowSkillCatalog(true) : undefined}
                                            saving={skillSaving}
                                        />

                                        {/* ---- PIC 负责项目 ---- */}
                                        <div className="flex items-center justify-between gap-2 mt-6 mb-3 pt-5 border-t border-gray-100 flex-wrap">
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <CheckSquare size={14} className="text-[#FFD200]"/> 负责项目 (PIC)
                                            </h4>
                                            {(form.picAreas || []).length > 0 && <span className="text-[11px] font-bold text-gray-500">{(form.picAreas || []).length} 项</span>}
                                        </div>

                                        {(!form.picAreas || form.picAreas.length === 0) ? (
                                            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-5 text-center">
                                                <span className="text-[11px] text-gray-400 font-bold">暂未指派负责项目 (No PIC area)</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {(form.picAreas || []).map(area => (
                                                    <div key={area.id} className="bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="text-[13px] font-bold text-stone-800 leading-snug break-words min-w-0">{area.name}</span>
                                                            {isEditing && (
                                                                <button onClick={() => handleRemovePicArea(area.id)}
                                                                    className="text-gray-400 hover:text-red-500 shrink-0 active:scale-90 flex items-center justify-center min-h-[40px] min-w-[40px] -my-2 -mr-2" aria-label="移除负责项目">
                                                                    <Trash2 size={15}/>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {isEditing && (
                                            <div className="mt-3 flex flex-col md:flex-row gap-2">
                                                <select value="" onChange={e => { if (e.target.value) handleAddPicArea(e.target.value); }}
                                                    className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-2 font-bold text-gray-700 outline-none focus:border-stone-400"
                                                    style={{ fontSize: '16px', minHeight: '44px' }}>
                                                    <option value="">+ 从常用项目选</option>
                                                    {DEFAULT_PIC_AREAS.filter(n => !(form.picAreas || []).some(a => a.name === n)).map(n => (
                                                        <option key={n} value={n}>{n}</option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2 flex-1 min-w-0">
                                                    <input value={newPicName} onChange={e => setNewPicName(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPicArea(newPicName); } }}
                                                        placeholder="自己打，例如：鱼缸清洁"
                                                        className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3 font-bold text-gray-800 outline-none focus:border-stone-400"
                                                        style={{ fontSize: '16px', minHeight: '44px' }} />
                                                    <button onClick={() => handleAddPicArea(newPicName)}
                                                        className="px-4 rounded-xl bg-stone-900 text-[#FFD200] font-black active:scale-95 shrink-0 flex items-center justify-center"
                                                        style={{ minHeight: '44px' }}>
                                                        <Plus size={16}/>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
 
                                    {/* 其他专长（备注），放在技能星级之后 */}
                                    <div className={`bg-white rounded-[2rem] p-3 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'skills' ? 'block' : 'hidden'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Trophy size={14} className="text-[#FFD200]"/> 其他专长（备注）
                                        </h4>
                                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                            {isEditing ? (
                                                <div className="flex flex-col gap-1.5">
                                                    <textarea 
                                                        value={form.specialSkills || ''} 
                                                        onChange={e => setForm({...form, specialSkills: e.target.value})} 
                                                        placeholder="请填写员工专业技能，如：会电工、会养鱼、会剖鱼、修水管等 (使用空格、逗号或顿号隔开)..." 
                                                        className="bg-white text-gray-800 border border-gray-200 rounded-xl p-3 outline-none w-full resize-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all font-medium text-[16px] md:text-sm" 
                                                        rows={3} />
                                                    <span className="text-[10px] text-gray-400 font-bold">💡 支持多项专业技能，输入后用空格、逗号或顿号隔开会自动生成标签</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {form.specialSkills ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {form.specialSkills.split(/[,，、\s]+/).filter(Boolean).map((skill, index) => (
                                                                <span key={index} className="px-3 py-1.5 bg-stone-100 hover:bg-[#FFD200]/10 text-stone-800 hover:text-stone-900 border border-stone-200 hover:border-[#FFD200]/30 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-default">
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


                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'basic' ? 'block' : 'hidden'}`}>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2"><Phone size={14}/> <span className="leading-tight">紧急联系人<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Emergency Contact</span></span></h4>
                                        <div className="grid grid-cols-2 gap-4 md:gap-6"><InputField label="联系人姓名 (Name)" value={form.emergencyName} onChange={(e: any) => setForm({...form, emergencyName: e.target.value})} placeholder="Relative Name" isEditing={isEditing} /><InputField label="联系电话 (Phone)" value={form.emergencyPhone} onChange={(e: any) => setForm({...form, emergencyPhone: e.target.value})} placeholder="Emergency Phone" isEditing={isEditing} /></div>
                                    </div>
 
                                    <div className={mobileDetailTab === 'access' ? 'block' : 'hidden'}>
                                        <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
                                            <div className="flex justify-between items-center mb-4"><h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Shield size={14}/> <span className="leading-tight">系统权限<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Access</span></span></h4>{isEditing && <button onClick={() => setShowAccessModal(true)} className="text-[10px] bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-bold active:scale-95 min-h-[44px] md:min-h-0">Config</button>}</div>
                                            <div className="flex flex-wrap gap-2 mb-4">{(!form.allowedModules || form.allowedModules.length === 0) && <span className="text-xs text-gray-400 italic">No access granted</span>}{withoutRetiredModules(form.allowedModules).map(mod => (<span key={mod} className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">{MODULE_DEFINITIONS[mod]?.label.split('(')[0]}</span>))}</div>
                                            
                                        </div>
                                    </div>

                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'access' ? 'block' : 'hidden'}`}>
                                        <div className="flex items-start justify-between gap-3 mb-4">
                                            <div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={14}/> <span className="leading-tight">库存权限<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Inventory Access</span></span></h4>
                                                <p className="mt-1 text-[10px] font-bold text-gray-400">控制库存范围与具体操作，不改变员工看到的其他模块</p>
                                            </div>
                                            {isEditing && canConfigureInventoryAccess && (
                                                <button onClick={() => setShowInventoryAccessModal(true)} className="min-h-[40px] shrink-0 rounded-xl bg-[#111111] px-3 text-[10px] font-black text-[#FFD200] active:scale-95 min-h-[44px] md:min-h-0">设置</button>
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
 
                                    <div className={`bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200 ${mobileDetailTab === 'records' ? 'block' : 'hidden'}`}>
                                        {form.id && <TaskReturnStats employeeId={form.id} />}
                                        <div className="flex justify-between items-center mb-6"><h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={14}/> <span className="leading-tight">奖惩记录<span className="block text-[9px] font-medium tracking-normal normal-case text-gray-300 mt-0.5">Disciplinary</span></span></h4>{isEditing && !showWarningInput && <button onClick={() => setShowWarningInput(true)} className="text-[10px] bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold border border-red-100 hover:bg-red-100 active:scale-95 min-h-[44px] md:min-h-0">+ Add Warning</button>}</div>
                                        {showWarningInput && (<div className="bg-red-50 p-4 rounded-xl mb-4 border border-red-100 animate-in slide-in-from-top-2"><div className="flex gap-2 mb-3">{DISCIPLINARY_TYPES.map(t => (<button key={t.id} onClick={() => setWarnType(t.id)} className={`min-h-[44px] md:min-h-0 flex-1 py-2.5 text-[10px] font-bold rounded-lg transition-colors active:scale-95 ${warnType === t.id ? 'bg-red-600 text-white' : 'bg-white text-gray-500 border'}`}>{t.label}</button>))}</div><input className="w-full p-3 border border-gray-200 rounded-lg mb-3 bg-white text-[#111111] outline-none" style={{ fontSize: '16px', minHeight: '48px' }} placeholder="违规原因 (e.g. Late, Mistakes)" value={warnReason} onChange={e => setWarnReason(e.target.value)} /><div className="flex gap-2"><button onClick={() => setShowWarningInput(false)} className="flex-1 py-3 bg-white text-gray-500 text-xs rounded-lg font-bold active:scale-95">Cancel</button><button onClick={confirmAddWarning} className="flex-1 py-3 bg-red-600 text-white text-xs rounded-lg font-bold active:scale-95">Confirm</button></div></div>)}
                                        <div className="space-y-3">{(!form.warningHistory || form.warningHistory.length === 0) && <p className="text-center text-xs text-gray-300 italic py-4">无违规记录 (Clean Record)</p>}{form.warningHistory?.map((warn, idx) => { const typeConfig = DISCIPLINARY_TYPES.find(t => t.id === warn.type); return (<div key={idx} className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-xl border border-gray-100"><div className="flex items-center gap-3"><div className={`text-[10px] font-black px-2 py-1.5 rounded uppercase shrink-0 ${typeConfig?.color}`}>{typeConfig?.label}</div><div className="min-w-0"><div className="text-xs font-bold text-[#111111] break-words">{warn.reason}</div><div className="text-[10px] text-gray-400 mt-0.5">{warn.date} • by {warn.issuer}</div></div></div>{isEditing && <button onClick={() => { const h = [...(form.warningHistory||[])]; h.splice(idx,1); setForm({...form, warningHistory: h}); }} className="text-gray-300 hover:text-red-500 p-2 active:scale-90 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><Trash2 size={16}/></button>}</div>); })}</div>
                                    </div>

                                    {isEditing && mobileDetailTab === 'access' && (
                                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col md:flex-row gap-3">
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
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[92vh] md:max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-xl text-[#111111]">员工表现评语 (Reviews)</h3>
                            <button onClick={() => setShowReviewModal(false)} className="p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><X size={20}/></button>
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
                                        <button onClick={() => handleDeleteReview(review.id)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center">
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
                                <button onClick={() => setReviewFormState({...reviewFormState, type: 'PRAISE'})} className={`min-h-[44px] md:min-h-0 flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${reviewFormState.type === 'PRAISE' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-gray-50 text-gray-500'}`}><ThumbsUp size={14}/> 表扬 (Praise)</button>
                                <button onClick={() => setReviewFormState({...reviewFormState, type: 'NOTE'})} className={`min-h-[44px] md:min-h-0 flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${reviewFormState.type === 'NOTE' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' : 'bg-gray-50 text-gray-500'}`}><StickyNote size={14}/> 备注 (Note)</button>
                                <button onClick={() => setReviewFormState({...reviewFormState, type: 'CRITICISM'})} className={`min-h-[44px] md:min-h-0 flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${reviewFormState.type === 'CRITICISM' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-gray-50 text-gray-500'}`}><ThumbsDown size={14}/> 待改进 (Improve)</button>
                            </div>
                            <textarea 
                                value={reviewFormState.content}
                                onChange={e => setReviewFormState({...reviewFormState, content: e.target.value})}
                                className="w-full p-3 bg-white border-2 border-gray-200 rounded-xl font-bold outline-none focus:border-[#111111] h-24 resize-none placeholder:font-normal"
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
                                                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
                                            >
                                                <X size={12} className="text-white"/>
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => reviewFileInputRef.current?.click()}
                                            disabled={isUploadingReviewImage}
                                            className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors min-h-[44px] md:min-h-0"
                                        >
                                            {isUploadingReviewImage ? <Loader2 size={16} className="animate-spin text-gray-400"/> : <Camera size={18} className="text-gray-500"/>}
                                        </button>
                                    )}
                                    <input type="file" ref={reviewFileInputRef} className="hidden" accept="image/*" onChange={handleReviewImageUpload} />
                                </div>
                                
                                <button onClick={handleAddReview} disabled={isUploadingReviewImage} className="flex-grow bg-[#111111] text-[#FFD200] py-3 rounded-xl font-black shadow-lg hover:bg-black transition-all disabled:opacity-70">
                                    {isUploadingReviewImage ? 'Uploading...' : '提交记录 (Add Record)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Image Viewer */}
            {viewImage && (
                <div 
                    className="fixed inset-0 bg-black/95 z-[300] flex flex-col items-center justify-between p-4 md:p-6 animate-in fade-in duration-200 select-none cursor-pointer" 
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 16px), 16px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
                    }}
                    onClick={() => setViewImage(null)}
                >
                    <div className="w-full max-w-4xl flex items-center justify-between z-10 shrink-0 py-1">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setViewImage(null); }}
                            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2.5 rounded-full backdrop-blur-md border border-white/20 transition-all shadow-xl active:scale-95 text-sm font-bold cursor-pointer min-h-[44px] md:min-h-0"
                        >
                            <ArrowLeft size={20} className="stroke-[2.5]" />
                            <span>返回 (Back)</span>
                        </button>
                        <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setViewImage(null); }}
                            className="bg-white/20 hover:bg-white/30 text-white p-2.5 rounded-full backdrop-blur-md border border-white/20 transition-all shadow-xl active:scale-95 flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"
                        >
                            <X size={22} className="stroke-[2.5]"/>
                        </button>
                    </div>
                    <div className="flex-1 w-full max-w-4xl flex items-center justify-center my-2 overflow-hidden">
                        <img src={viewImage} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10" onClick={() => setViewImage(null)}/>
                    </div>
                    <p className="text-xs text-gray-400 font-semibold tracking-wide shrink-0">点击屏幕任意位置或按钮即可返回 (Tap anywhere to close)</p>
                </div>
            )}

            
            {/* @ts-ignore */}
            <SystemAccessModal 
                isOpen={showAccessModal} 
                onClose={() => setShowAccessModal(false)} 
                allowedModules={form.allowedModules || []} 
                onToggle={(mod: any) => handleToggleModule(mod)}
                assessmentTargets={form.assessmentTargets || []}
                onUpdateTargets={handleUpdateAssessmentTargets}
                allEmployees={employees}
                readOnlyAccess={!!form.readOnlyAccess}
                onToggleReadOnly={(next: boolean) => setForm({ ...form, readOnlyAccess: next })}
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
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl animate-in zoom-in-95 max-h-[92vh] md:max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="bg-[#111111] p-5 text-center shrink-0">
                            <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-3"><LogOut size={28}/></div>
                            <h3 className="font-black text-xl text-white mb-1">办理离职手续</h3>
                            <p className="text-xs text-gray-400 font-bold">{form.name || 'Unknown'} • {(form.role || '未分配').split('(')[0]}</p>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto flex-grow">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">离职类型 (Type)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {TERMINATION_TYPES.map(t => (
                                        <button key={t.id} onClick={() => setTerminationData({...terminationData, type: t.id})} className={`min-h-[44px] md:min-h-0 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border-2 transition-all ${terminationData.type === t.id ? `${t.color} border-current ring-1 ring-current shadow-sm` : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'}`}>
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
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 text-center border-t-8 border-red-600 max-h-[92vh] overflow-y-auto">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce"><Trash2 size={32} className="text-red-600"/></div>
                        <h3 className="font-black text-2xl text-[#111111] mb-2">确认永久删除?</h3>
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
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl animate-in zoom-in-95 max-h-[92vh] md:max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="bg-[#111111] p-4 flex justify-between items-center text-white shrink-0">
                            <h3 className="font-black text-lg flex items-center gap-2"><Wallet size={18} className="text-[#FFD200]"/> 借还款记录 (Loan Tracker)</h3>
                            <button onClick={() => setShowLoanModal(false)} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><X size={20} className="text-white/50 hover:text-white"/></button>
                        </div>
                        
                        <div className={`p-4 text-center ${loanBalance > 0 ? 'bg-red-50' : loanBalance < 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <div className="text-[10px] font-bold text-gray-400 uppercase">{form.name} — 欠款余额</div>
                            <div className={`text-3xl font-mono font-black mt-1 ${loanBalance > 0 ? 'text-red-600' : loanBalance < 0 ? 'text-green-600' : 'text-gray-400'}`}>RM {Math.abs(loanBalance).toFixed(2)}</div>
                            <div className="text-[10px] mt-1 text-gray-400 font-bold">
                                总借: RM {(form.loanRecords || []).filter(r => r.type === 'BORROW').reduce((s,r) => s+r.amount, 0).toFixed(2)} | 
                                总还: RM {(form.loanRecords || []).filter(r => r.type === 'REPAY').reduce((s,r) => s+r.amount, 0).toFixed(2)}
                            </div>
                        </div>

                        <div className="p-4 border-b bg-gray-50 space-y-3">
                            <div className="flex gap-2">
                                <button onClick={() => setLoanFormState({...loanFormState, type: 'BORROW'})} className={`min-h-[44px] md:min-h-0 flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${loanFormState.type === 'BORROW' ? 'bg-red-100 text-red-700 ring-2 ring-red-400' : 'bg-white text-gray-400 border'}`}><span className="text-sm">💰</span> 借款 (Borrow)</button>
                                <button onClick={() => setLoanFormState({...loanFormState, type: 'REPAY'})} className={`min-h-[44px] md:min-h-0 flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${loanFormState.type === 'REPAY' ? 'bg-green-100 text-green-700 ring-2 ring-green-400' : 'bg-white text-gray-400 border'}`}><span className="text-sm">💸</span> 还款 (Repay)</button>
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
                                                <div className="text-xs font-bold text-[#111111] truncate">{rec.note || '-'}</div>
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
                                            <button onClick={() => handleDeleteLoan(rec.id)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center"><Trash2 size={12}/></button>
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
                    <div data-pdf-atomic="true" className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-widest mb-1">Kim Lian Kee</h1>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.3em]">Employee Directory</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-gray-400">{new Date().toLocaleDateString()}</p>
                            <p className="text-sm font-black">Total Staff: {exportActiveEmployees.length + exportResignedEmployees.length}</p>
                            <p className="text-[10px] font-bold text-gray-400">在职 Active: {exportActiveEmployees.length} · 离职 Resigned: {exportResignedEmployees.length}</p>
                        </div>
                    </div>

<div className="overflow-x-auto">                    <table className="w-full min-w-[420px] text-left text-xs">
                        <thead>
                            <tr data-pdf-atomic="true" className="border-b-2 border-black">
                                <th className="py-2 uppercase font-black">ID</th>
                                <th className="py-2 uppercase font-black">Name</th>
                                <th className="py-2 uppercase font-black">Role</th>
                                <th className="py-2 uppercase font-black">Status</th>
                                <th className="py-2 uppercase font-black">Join Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {exportActiveEmployees.map((emp) => (
                                <tr key={emp.id} data-pdf-atomic="true" className="border-b border-gray-100">
                                    <td className="py-3 font-mono font-bold text-gray-500">{emp.id}</td>
                                    <td className="py-3 font-bold">{emp.name}</td>
                                    <td className="py-3 font-medium text-gray-700">{(emp.role || '未分配').split('(')[0]}</td>
                                    <td className="py-3"><span className={`px-1 py-0.5 rounded text-[10px] font-bold uppercase ${emp.status === 'CONFIRMED' ? 'bg-green-100' : 'bg-gray-100'}`}>{emp.status}</span></td>
                                    <td className="py-3 font-mono text-gray-500">{emp.joinDate}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table></div>

                    {exportResignedEmployees.length > 0 && (
                        <div className="mt-8">
                            <div data-pdf-atomic="true" className="border-b-2 border-[#8B0000] pb-2 mb-2 flex items-end justify-between">
                                <h2 className="text-sm font-black uppercase tracking-widest text-[#8B0000]">离职员工 Resigned Staff</h2>
                                <span className="text-[10px] font-bold text-gray-400">{exportResignedEmployees.length} 人</span>
                            </div>
<div className="overflow-x-auto">                            <table className="w-full min-w-[420px] text-left text-xs">
                                <thead>
                                    <tr data-pdf-atomic="true" className="border-b-2 border-black">
                                        <th className="py-2 uppercase font-black">ID</th>
                                        <th className="py-2 uppercase font-black">Name</th>
                                        <th className="py-2 uppercase font-black">Role</th>
                                        <th className="py-2 uppercase font-black">Join Date</th>
                                        <th className="py-2 uppercase font-black">Resigned On</th>
                                        <th className="py-2 uppercase font-black">Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {exportResignedEmployees.map((emp) => (
                                        <tr key={emp.id} data-pdf-atomic="true" className="border-b border-gray-100 bg-red-50/40">
                                            <td className="py-3 font-mono font-bold text-gray-500">{emp.id}</td>
                                            <td className="py-3 font-bold">{emp.name}</td>
                                            <td className="py-3 font-medium text-gray-700">{(emp.role || '未分配').split('(')[0]}</td>
                                            <td className="py-3 font-mono text-gray-500">{emp.joinDate}</td>
                                            <td className="py-3 font-mono text-gray-500">{emp.terminationDate || '-'}</td>
                                            <td className="py-3 text-gray-600">{emp.terminationReason || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>
                        </div>
                    )}

                    <div data-pdf-atomic="true" className="pt-10 pb-2 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-gray-300">Confidential • Internal Use Only</p>
                    </div>
                </div>
            </div>
            
            {isExportOpen && (
                <HRExportDialog
                    isOpen={isExportOpen}
                    onClose={() => setIsExportOpen(false)}
                    employees={employees}
                />
            )}

            {showSkillPrint && (
                <SkillPrintDialog
                    isOpen={showSkillPrint}
                    onClose={() => setShowSkillPrint(false)}
                    employees={employees.map(e => (e.id === form.id ? ({ ...e, ...form } as Employee) : e))}
                    catalog={skillCatalog}
                    currentEmployee={selectedEmpId ? form : null}
                />
            )}

            {showSkillCatalog && (
                <SkillCatalogEditor
                    isOpen={showSkillCatalog}
                    onClose={() => setShowSkillCatalog(false)}
                    catalog={skillCatalog}
                    updatedBy={currentEmployee?.name || (isSuperAdminMode ? 'Admin' : undefined)}
                />
            )}

            {isSkillMatrixOpen && (
                <HRSkillMatrix
                    isOpen={isSkillMatrixOpen}
                    onClose={() => setIsSkillMatrixOpen(false)}
                    employees={employees}
                    onSave={(list) => {
                        onSave(list);
                        // 当前打开的档案也要跟着更新，不然画面还是旧等级
                        if (selectedEmpId) {
                            const fresh = list.find(e => e.id === selectedEmpId);
                            if (fresh) setForm(fresh);
                        }
                    }}
                />
            )}

            {/* 🟢 HIDDEN PRINT SECTION (SINGLE PROFILE PDF) */}
            <div style={{ position: 'absolute', top: 0, left: '-9999px' }}>
                <div ref={singleProfileRef} id="hr-profile-single-export-root" className="w-[794px] h-[1123px] bg-white p-10 font-sans text-black relative flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-start border-b-4 border-[#8B0000] pb-4 mb-5">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-wider text-[#111111] mb-1">{form.name || 'EMPLOYEE NAME'}</h1>
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
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">{isForeignWorker ? 'Passport' : 'IC'}</span><span className="font-mono font-bold text-xs">{(isForeignWorker ? (form.passportNo || form.icNumber) : form.icNumber) || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Phone</span><span className="font-mono font-bold text-xs">{form.phone || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Nationality</span><span className="font-bold text-xs">{form.nationality || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Gender</span><span className="font-bold text-xs">{form.gender || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Shirt Size</span><span className="font-bold text-xs">{form.shirtSize || '-'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Preferred Lang</span><span className="font-bold text-xs">{form.preferredLanguage === 'my' ? 'မြန်မာ (Burmese)' : form.preferredLanguage === 'en' ? 'English Only' : '中英双语 (ZH / EN)'}</span></div>
                                <div><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Tenure</span><span className="font-bold text-xs">{getTenure(form.joinDate || '')}</span></div>
                                <div className="col-span-3"><span className="block text-gray-400 font-bold uppercase text-[9px] mb-0.5">Address</span><span className="font-bold text-xs">{form.address || '-'}</span></div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-black uppercase border-b-2 border-gray-200 pb-1.5 mb-2.5 text-[#8B0000]">Statutory & Salary (薪资与法定)</h3>
                            <div className="space-y-2 text-[11px] bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Basic Salary</span><span className="font-mono font-black text-xs">RM {form.basicSalary?.toLocaleString() || '0'}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Salary Mode</span><span className="font-bold text-xs">{form.salaryMode}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Rest Days</span><span className="font-bold text-xs">{form.monthlyRestDays ?? 4} Days</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Bank Name</span><span className="font-bold text-xs">{form.bankName || '-'}</span></div>
                                <div className="flex justify-between border-b border-gray-200 pb-1"><span>Bank Account</span><span className="font-mono font-bold text-xs">{form.bankAccount || '-'}</span></div>
                                {/* 外劳不用 KWSP / PERKESO，导出时不印 */}
                                {/malaysia|🇲🇾/i.test(form.nationality || '') && <>
                                    <div className="flex justify-between border-b border-gray-200 pb-1"><span>EPF No</span><span className="font-mono font-bold text-xs">{form.epfNo || '-'}</span></div>
                                    <div className="flex justify-between border-b border-gray-200 pb-1"><span>SOCSO No</span><span className="font-mono font-bold text-xs">{form.socsoNo || '-'}</span></div>
                                </>}
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

                        <div className="col-span-2">
                            <h3 className="text-xs font-black uppercase border-b-2 border-gray-200 pb-1.5 mb-2.5 text-[#8B0000]">岗位技能 (Skill Stars)</h3>
                            {(() => {
                                const positions = getEmployeePositions(form, skillCatalog);
                                const ratings = form.skillRatings || {};
                                const rated = positions.flatMap(pos => pos.items.filter(it => ratings[it.id]?.level).map(it => ({ pos, it, lv: ratings[it.id]!.level })));
                                if (rated.length === 0) return <p className="text-[10px] text-gray-400 italic bg-gray-50 p-2 rounded-xl text-center border border-dashed border-gray-200">还没有评技能星级</p>;
                                return (
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                                        {rated.map(({ pos, it, lv }) => (
                                            <div key={`${pos.category}-${it.id}`} className="flex items-center justify-between border-b border-gray-100 py-1">
                                                <span className="font-bold text-gray-800 truncate pr-2">{it.name}</span>
                                                <span className="shrink-0 whitespace-nowrap"><span className="text-[#C99A00]">{'★'.repeat(lv)}</span><span className="text-gray-300">{'★'.repeat(5 - lv)}</span> <span className="text-gray-500">{getStarLevel(lv)?.zh}</span></span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
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