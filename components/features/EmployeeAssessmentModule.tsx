import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, Award, Users, ChefHat, Coffee, User, Wrench, 
    Clock, AlertTriangle, CheckCircle2, Lock, Search,
    TrendingUp, Shield, Calendar, Loader2, Info, ChevronRight,
    HelpCircle
} from 'lucide-react';
import { Employee, QuarterKey } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { 
    JOB_METRICS, 
    JobCategory,
    GRADE_TIERS
} from './assessmentConfig';
import { 
    getQuarterFromDate,
    isInAssessmentWindow,
    getWindowRemainingDays,
    getNextWindowStart,
    formatQuarter,
    getQuarterMonthRange,
    getAssessPermission,
    getAssessableTargets,
    canAccessAssessmentModule,
    getQuarterlyStatus,
    getJobCategoryForEmployee,
    QuarterlyStatus,
    getTierByLabel,
    sortEmployeesByJobPriority,
    getPreviousQuarter,
    getEmployeeLevel
} from './assessmentUtils';
import { AssessmentForm } from './AssessmentForm';
import { AssessmentRecordV2 } from '../../types';

interface EmployeeAssessmentModuleProps {
    onClose: () => void;
    currentEmployee?: Employee | null;
}

// ============================================================================
// 辅助 UI 组件
// ============================================================================

/** 季度状态徽章 */
const StatusBadge: React.FC<{ status: QuarterlyStatus }> = ({ status }) => {
    // 💡 优化：去除 any，换成严格的 React.ElementType
    const config: Record<QuarterlyStatus, { label: string; color: string; icon: React.ElementType }> = {
        NOT_STARTED:  { label: '未评',   color: 'bg-gray-100 text-gray-500 border-gray-200',      icon: Clock },
        DRAFT:        { label: '草稿',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Info },
        SUBMITTED:    { label: '已提交', color: 'bg-blue-50 text-blue-700 border-blue-200',       icon: CheckCircle2 },
        OVERRIDDEN:   { label: '已覆盖', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Shield },
        FINALIZED:    { label: '已锁定', color: 'bg-green-50 text-green-700 border-green-200',    icon: Lock },
        EXEMPT:       { label: '豁免',   color: 'bg-gray-50 text-gray-400 border-gray-100',       icon: Ban_Icon }
    };
    const c = config[status];
    const Icon = c.icon; // 💡 必须大写开头，React 才能识别为组件
    return (
        <div className={`px-2 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 ${c.color}`}>
            <Icon size={10}/> {c.label}
        </div>
    );
};

// Ban icon helper (因为 lucide-react 的 Ban 名字会跟 CSS 冲突)
function Ban_Icon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
}

/** 部门图标 */
const DepartmentIcon: React.FC<{ dept: string; size?: number }> = ({ dept, size = 16 }) => {
    if (dept === 'KITCHEN') return <ChefHat size={size}/>;
    if (dept === 'BAR') return <Coffee size={size}/>;
    if (dept === 'FLOOR') return <User size={size}/>;
    if (dept === 'LOGISTICS') return <Wrench size={size}/>;
    return <Users size={size}/>;
};

// ============================================================================
// 主组件
// ============================================================================

export const EmployeeAssessmentModule: React.FC<EmployeeAssessmentModuleProps> = ({ onClose, currentEmployee }) => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showGuide, setShowGuide] = useState(false);
    
    // ⭐ 评分表单状态
    const [assessingEmployee, setAssessingEmployee] = useState<Employee | null>(null);
    const [existingRecords, setExistingRecords] = useState<Record<string, AssessmentRecordV2>>({});

    // ⚙️ 评测关系配置 Drawer 状态 (Level 1 老板专属功能)
    const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
    const [configTab, setConfigTab] = useState<'RELATIONS' | 'MERGE' | 'EXEMPT'>('RELATIONS');
    const [selectedRater, setSelectedRater] = useState<Employee | null>(null);
    const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
    const [savingConfig, setSavingConfig] = useState(false);

    // 🚫 忽略/免评设置状态
    const [updatingExemptId, setUpdatingExemptId] = useState<string | null>(null);

    const handleToggleExempt = async (emp: Employee) => {
        setUpdatingExemptId(emp.id);
        try {
            const updatedEmp = {
                ...emp,
                assessmentExempt: !emp.assessmentExempt
            };
            await DataManager.saveEmployee(updatedEmp);
            setEmployees(prev => prev.map(e => e.id === emp.id ? updatedEmp : e));
        } catch (err) {
            console.error(err);
            alert("❌ 操作失败，请重试");
        } finally {
            setUpdatingExemptId(null);
        }
    };

    // 👥 账户合并状态 (老板专属)
    const [mergeSourceId, setMergeSourceId] = useState<string>('');
    const [mergeTargetId, setMergeTargetId] = useState<string>('');
    const [merging, setMerging] = useState(false);

    const handleMergeAccounts = async () => {
        if (!mergeSourceId || !mergeTargetId) {
            alert("请同时选择需要清理的重复档案和需要保留的正确档案");
            return;
        }
        if (mergeSourceId === mergeTargetId) {
            alert("不可合并相同的档案对象");
            return;
        }

        const sourceEmp = employees.find(e => e.id === mergeSourceId);
        const targetEmp = employees.find(e => e.id === mergeTargetId);

        if (!sourceEmp || !targetEmp) {
            alert("档案不存在，请重试");
            return;
        }

        if (!confirm(`⚠️ 确认执行档案合并与清理？\n\n【将被删除/清理的重复档案】：${sourceEmp.name} (ID: ${sourceEmp.id})\n【将被保留的正确档案】：${targetEmp.name} (ID: ${targetEmp.id})\n\n合并后，重复档案的所有评测历史、违纪警告、部门权限等都将无缝转移到正确档案中，且重复档案会被永久删除！`)) {
            return;
        }

        setMerging(true);
        try {
            // 合并评测历史 V2
            const sourceV2 = sourceEmp.assessmentRecordsV2 || [];
            const targetV2 = targetEmp.assessmentRecordsV2 || [];
            const combinedV2Map = new Map<string, any>();
            targetV2.forEach(r => combinedV2Map.set(`${r.quarter}_${r.initialRating?.raterId || 'unknown'}`, r));
            sourceV2.forEach(r => {
                const key = `${r.quarter}_${r.initialRating?.raterId || 'unknown'}`;
                if (!combinedV2Map.has(key)) {
                    combinedV2Map.set(key, r);
                }
            });

            // 合并模块权限
            const sourceModules = sourceEmp.allowedModules || [];
            const targetModules = targetEmp.allowedModules || [];
            const combinedModules = Array.from(new Set([...sourceModules, ...targetModules]));

            // 合并警告历史
            const sourceWarnings = sourceEmp.warningHistory || [];
            const targetWarnings = targetEmp.warningHistory || [];
            const combinedWarnings = [...targetWarnings, ...sourceWarnings];

            // 合并薪水历史
            const sourceSalary = sourceEmp.salaryHistory || [];
            const targetSalary = targetEmp.salaryHistory || [];
            const combinedSalary = [...targetSalary, ...sourceSalary];

            // 构建合并后的主账号对象
            const updatedTarget: Employee = {
                ...targetEmp,
                assessmentRecordsV2: Array.from(combinedV2Map.values()),
                allowedModules: combinedModules,
                warningHistory: combinedWarnings,
                salaryHistory: combinedSalary
            };

            if (sourceEmp.avatar && !targetEmp.avatar) {
                updatedTarget.avatar = sourceEmp.avatar;
            }

            // 1. 保存正确档案
            await DataManager.saveEmployee(updatedTarget);
            
            // 2. 删除重复档案
            await DataManager.deleteEmployee(sourceEmp.id);

            // 3. 更新本地状态
            setEmployees(prev => prev.filter(e => e.id !== sourceEmp.id).map(e => e.id === targetEmp.id ? updatedTarget : e));

            alert(`🎉 合并成功！已成功将 [${sourceEmp.name}] 的所有数据合并至 [${targetEmp.name}]，重复档案已安全清理。`);

            // 4. 判断是否清理了当前登录账户
            if (currentEmployee && currentEmployee.id === sourceEmp.id) {
                alert("💡 您当前登录的是已被清理的重复档案。系统将自动切换登录为合并后的正确主档案，并将为您刷新页面！");
                localStorage.setItem('kepong_erp_session_employee', JSON.stringify(updatedTarget));
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }

            setIsConfigDrawerOpen(false);
            setMergeSourceId('');
            setMergeTargetId('');
        } catch (err) {
            console.error("Merge error:", err);
            alert("❌ 合并清理失败，请重试");
        } finally {
            setMerging(false);
        }
    };

    // ============================================================================
    // 季度信息
    // ============================================================================
    const today = new Date();
    const currentQuarter: QuarterKey = getQuarterFromDate(today);
    const inWindow = isInAssessmentWindow(today);
    const remainingDays = getWindowRemainingDays(today);
    const nextWindowStart = getNextWindowStart(today);

    // ============================================================================
    // 权限判断
    // ============================================================================
    const hasAccess = useMemo(() => {
        if (!currentEmployee) return false;
        return canAccessAssessmentModule(currentEmployee);
    }, [currentEmployee]);

    // 💡 优化：使用 unified getEmployeeLevel 判定老板身份 (Level 1)
    const isOwner = useMemo(() => {
        if (!currentEmployee) return false;
        return getEmployeeLevel(currentEmployee) === 1;
    }, [currentEmployee]);

    // ============================================================================
    // 加载数据
    // ============================================================================
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // 并行拉取: 员工 + 当前季度评分 + 上季度评分 (用于显示走势)
            const prevQuarter = getPreviousQuarter(currentQuarter);
            const [empData, currentRecords, prevRecords] = await Promise.all([
                DataManager.getEmployees(),
                DataManager.getAssessmentRecordsByQuarter(currentQuarter),
                DataManager.getAssessmentRecordsByQuarter(prevQuarter)
            ]);
            
            // 构建 employee.id → records 的映射
            const recordsByEmp: Record<string, AssessmentRecordV2[]> = {};
            [...currentRecords, ...prevRecords].forEach((r: any) => {
                if (!recordsByEmp[r.employeeId]) recordsByEmp[r.employeeId] = [];
                recordsByEmp[r.employeeId].push(r as AssessmentRecordV2);
            });
            
            // 把评分记录 merge 到 employee 对象上
            const merged = empData
                .filter(e => !e.isArchived)
                .map(emp => ({
                    ...emp,
                    assessmentRecordsV2: recordsByEmp[emp.id] || emp.assessmentRecordsV2 || []
                }));
            
            setEmployees(merged);
            
            // 同时构建 existingRecords 映射 (打开评分表单时用)
            const existingMap: Record<string, AssessmentRecordV2> = {};
            currentRecords.forEach((r: any) => {
                existingMap[r.employeeId] = r as AssessmentRecordV2;
            });
            setExistingRecords(existingMap);
            
        } catch (e) {
            console.error('Load data failed:', e);
        } finally {
            setLoading(false);
        }
    };

    // ============================================================================
    // 计算可评对象
    // ============================================================================
    const assessableTargets = useMemo(() => {
        if (!currentEmployee) return [];
        return getAssessableTargets(currentEmployee, employees);
    }, [currentEmployee, employees]);

    // ============================================================================
    // 筛选 & 搜索
    // ============================================================================
    const filteredTargets = useMemo(() => {
        if (!searchTerm) return assessableTargets;
        const s = searchTerm.toLowerCase();
        return assessableTargets.filter(e => 
            e.name.toLowerCase().includes(s) || e.id.includes(s)
        );
    }, [assessableTargets, searchTerm]);

    // ============================================================================
    // 分组 (按评测三大等级)
    // ============================================================================
    const groupedByLevel = useMemo(() => {
        const groups = {
            1: [] as Employee[], // 第一等级：老板
            2: [] as Employee[], // 第二等级：管理层
            3: [] as Employee[], // 第三等级：普通员工
            EXEMPT: [] as Employee[] // 豁免人员（如兼职）
        };

        const isRaterManagement = currentEmployee ? getEmployeeLevel(currentEmployee) === 2 : false;
        const activeEmployees = employees.filter(e => {
            if (e.isArchived) return false;
            const lvl = getEmployeeLevel(e);
            if (lvl === 1) return false;
            // 如果是管理层，只看第三等级 (Level 3)
            if (isRaterManagement && lvl !== 3) return false;
            return true;
        });
        
        const filtered = searchTerm ? activeEmployees.filter(emp => {
            const s = searchTerm.toLowerCase();
            return emp.name.toLowerCase().includes(s) || emp.id.toLowerCase().includes(s) || (emp.role || '').toLowerCase().includes(s);
        }) : activeEmployees;

        filtered.forEach(emp => {
            if (emp.assessmentExempt) {
                groups.EXEMPT.push(emp);
            } else {
                const lvl = getEmployeeLevel(emp);
                if (lvl === 1) {
                    groups[1].push(emp);
                } else if (lvl === 2) {
                    groups[2].push(emp);
                } else {
                    groups[3].push(emp);
                }
            }
        });

        // 🔄 每组按岗位优先级 + ID 排序
        groups[1] = sortEmployeesByJobPriority(groups[1]);
        groups[2] = sortEmployeesByJobPriority(groups[2]);
        groups[3] = sortEmployeesByJobPriority(groups[3]);
        groups.EXEMPT = sortEmployeesByJobPriority(groups.EXEMPT);

        return groups;
    }, [employees, searchTerm, currentEmployee]);

    // ============================================================================
    // 我的评分进度统计
    // ============================================================================
    const myProgress = useMemo(() => {
        const total = assessableTargets.filter(e => !e.assessmentExempt).length;
        let completed = 0;
        assessableTargets.forEach(emp => {
            if (emp.assessmentExempt) return;
            const status = getQuarterlyStatus(emp, currentQuarter);
            if (status === 'SUBMITTED' || status === 'OVERRIDDEN' || status === 'FINALIZED') {
                completed++;
            }
        });
        return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
    }, [assessableTargets, currentQuarter]);

    // ============================================================================
    // 老板看的全店进度
    // ============================================================================
    const globalProgress = useMemo(() => {
        if (!isOwner) return null;
        const allAssessable = employees.filter(e => !e.assessmentExempt && !e.isArchived && getJobCategoryForEmployee(e) !== 'OWNER');
        let completed = 0;
        allAssessable.forEach(emp => {
            const status = getQuarterlyStatus(emp, currentQuarter);
            if (status === 'SUBMITTED' || status === 'OVERRIDDEN' || status === 'FINALIZED') {
                completed++;
            }
        });
        return { 
            total: allAssessable.length, 
            completed, 
            percent: allAssessable.length > 0 ? Math.round((completed / allAssessable.length) * 100) : 0 
        };
    }, [isOwner, employees, currentQuarter]);

    // ============================================================================
    // 员工点击处理
    // ============================================================================
    const handleSelectEmployee = (emp: Employee) => {
        if (!currentEmployee) return;

        if (emp.assessmentExempt) {
            alert(`ℹ️ ${emp.name} 属于兼职员工，已豁免季度评分`);
            return;
        }

        const raterLevel = getEmployeeLevel(currentEmployee);
        const targetLevel = getEmployeeLevel(emp);
        const isRaterManagement = raterLevel === 2;

        // 🔒 权限控制：管理层不能看自己或其他管理人员的分数
        if (isRaterManagement && targetLevel !== 3) {
            alert(`🔒 权限受限：管理层不能查看自己或其他管理层人员的分数。您仅有权评测及查看第三等级（普通员工）的评分。`);
            return;
        }

        const perm = getAssessPermission(currentEmployee, emp);
        if (perm === 'INITIAL' || perm === 'OVERRIDE') {
            setAssessingEmployee(emp);
        } else {
            if (emp.id === currentEmployee.id) {
                alert(`ℹ️ 这是您本人的卡片。普通员工只能通过「我的档案」查看已锁定的季度综合评分结果。`);
            } else {
                alert(`🔒 权限限制：当前评测体系划分为三大等级：\n- 第一等级（老板）可评测/覆盖管理层与员工；\n- 第二等级（管理层）可评价第三等级员工（或老板指定的专属对象）；\n- 第三等级（普通员工）暂无任何评分权。`);
            }
        }
    };
    
    const handleAssessmentSaved = (record: AssessmentRecordV2) => {
        // 1. 更新 employees 数组 (用于列表 UI 立即反映新状态)
        setEmployees(prev => prev.map(e => {
            if (e.id !== record.employeeId) return e;
            const oldRecords = e.assessmentRecordsV2 || [];
            const filtered = oldRecords.filter(r => r.quarter !== record.quarter);
            return { ...e, assessmentRecordsV2: [...filtered, record] };
        }));
        
        // 2. 更新 existingRecords 映射 (用于打开表单时预填)
        setExistingRecords(prev => ({ ...prev, [record.employeeId]: record }));
        
        // 3. 关闭表单
        setAssessingEmployee(null);
    };

    // ============================================================================
    // Render: 无权限
    // ============================================================================
    if (!hasAccess) {
        return (
            <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in duration-200">
                <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={32} className="text-gray-400"/>
                    </div>
                    <h3 className="font-black text-xl text-[#1A1A1A] mb-2">无评分权限</h3>
                    <p className="text-sm text-gray-500 font-bold mb-6">
                        您当前的职级为 <span className="text-[#1A1A1A]">{currentEmployee?.rank || 'CREW'}</span>，暂无权限使用评测系统。
                    </p>
                    <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                        评分系统仅对 TOP / MANAGEMENT / HEAD / PIC 开放。<br/>
                        如需评分权限，请联系管理层调整组织职级。
                    </p>
                    <button 
                        onClick={onClose} 
                        className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black shadow-lg active:scale-95 transition-transform"
                    >
                        返回
                    </button>
                </div>
            </div>
        );
    }

    // ============================================================================
    // Render: 主界面
    // ============================================================================
    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-6xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* ========== Header ========== */}
                <div className="bg-[#1A1A1A] px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] md:px-5 md:pb-5 md:pt-[max(env(safe-area-inset-top),1.25rem)] flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700]">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD700] text-black p-2 rounded-xl shadow-lg"><Award size={20}/></div>
                        <div>
                            <h3 className="font-serif font-black text-lg tracking-wide">季度评测</h3>
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Quarterly Assessment</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowGuide(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-[#FFD700]">
                            <HelpCircle size={22}/>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X size={24}/>
                        </button>
                    </div>
                </div>

                {/* ========== Content ========== */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-5">
                    
                    {/* ---- 季度信息 Banner ---- */}
                    <div className={`rounded-2xl p-5 border-2 ${inWindow ? 'bg-gradient-to-br from-[#1A1A1A] to-[#2A2A2A] border-[#FFD700] text-white' : 'bg-white border-gray-200 text-gray-700'}`}>
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${inWindow ? 'text-[#FFD700]' : 'text-gray-400'}`}>
                                    {inWindow ? '📋 当前评分期' : '⏸ 评分窗口未开启'}
                                </div>
                                <h2 className={`text-2xl font-black ${inWindow ? 'text-white' : 'text-[#1A1A1A]'}`}>
                                    {formatQuarter(currentQuarter)}
                                </h2>
                                <p className={`text-xs font-bold mt-1 ${inWindow ? 'text-white/60' : 'text-gray-500'}`}>
                                    评测 {getQuarterMonthRange(currentQuarter)} 的表现
                                </p>
                            </div>
                            {inWindow && (
                                <div className="text-right">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-[#FFD700]">剩余</div>
                                    <div className="text-3xl font-black text-white font-mono">{remainingDays}</div>
                                    <div className="text-[10px] font-bold text-white/60 uppercase">天</div>
                                </div>
                            )}
                        </div>
                        
                        {!inWindow && (
                            <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl text-xs text-gray-600">
                                <div className="flex items-center gap-2 mb-1">
                                    <Calendar size={14} className="text-gray-400"/>
                                    <span className="font-black">下次评分期</span>
                                </div>
                                <p className="font-bold text-[#1A1A1A]">
                                    {nextWindowStart.getFullYear()} 年 {nextWindowStart.getMonth() + 1} 月 1 日 — 15 日
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ---- 我的进度 ---- */}
                    {myProgress.total > 0 && (
                        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><TrendingUp size={14}/></div>
                                    <h4 className="text-xs font-black text-[#1A1A1A] uppercase tracking-widest">我的评分任务</h4>
                                </div>
                                <div className="text-xs font-black text-[#1A1A1A]">
                                    {myProgress.completed} / {myProgress.total}
                                </div>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all ${myProgress.percent === 100 ? 'bg-green-500' : myProgress.percent >= 50 ? 'bg-blue-500' : 'bg-orange-400'}`}
                                    style={{ width: `${myProgress.percent}%` }}
                                />
                            </div>
                            <div className="text-[10px] text-gray-400 font-bold mt-2">
                                {myProgress.percent === 100 ? '✅ 全部完成' : `剩余 ${myProgress.total - myProgress.completed} 人待评`}
                            </div>
                        </div>
                    )}

                    {/* ---- 老板看全店进度 ---- */}
                    {isOwner && globalProgress && (
                        <div className="bg-[#1A1A1A] text-white rounded-2xl p-5 border border-gray-800 shadow-lg">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-[#FFD700]/20 rounded-lg text-[#FFD700]"><Users size={14}/></div>
                                    <h4 className="text-xs font-black text-[#FFD700] uppercase tracking-widest">全店进度 (Owner View)</h4>
                                </div>
                                <div className="text-xs font-black text-white">
                                    {globalProgress.completed} / {globalProgress.total}
                                </div>
                            </div>
                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div 
                                    className="h-full rounded-full bg-[#FFD700] transition-all"
                                    style={{ width: `${globalProgress.percent}%` }}
                                />
                            </div>
                            <div className="text-[10px] text-white/60 font-bold mt-2">
                                全店 {globalProgress.percent}% 已评 · {globalProgress.total - globalProgress.completed} 人待评
                            </div>
                        </div>
                    )}

                    {/* ---- 搜索和关系配置工具栏 ---- */}
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                        <div className="relative flex-grow">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                            <input 
                                type="text" 
                                placeholder="搜索员工姓名或 ID..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#FFD700] transition-all"
                                style={{ fontSize: '16px', minHeight: '44px' }}
                            />
                        </div>
                        {isOwner && (
                            <button
                                onClick={() => {
                                    setIsConfigDrawerOpen(true);
                                    const firstL2 = employees.find(e => getEmployeeLevel(e) === 2);
                                    if (firstL2) {
                                        setSelectedRater(firstL2);
                                        setSelectedTargets(firstL2.assessmentTargets || []);
                                    }
                                }}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#FFD700] text-black font-black rounded-xl shadow-sm hover:bg-[#FFE44D] active:scale-95 transition-all text-xs"
                                style={{ minHeight: '44px' }}
                                id="btn-config-assessment-relations"
                            >
                                <span>⚙️ 评测关系配置</span>
                            </button>
                        )}
                    </div>

                    {/* ---- 员工列表 ---- */}
                    {loading ? (
                        <div className="py-20 text-center">
                            <Loader2 size={32} className="animate-spin mx-auto text-gray-300"/>
                            <p className="text-xs text-gray-400 font-bold mt-3">加载员工数据...</p>
                        </div>
                    ) : employees.filter(e => !e.isArchived).length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-2xl border border-gray-200">
                            <Lock size={40} className="mx-auto text-gray-300 mb-3"/>
                            <p className="font-black text-sm text-[#1A1A1A] mb-1">无在职人员信息</p>
                            <p className="text-xs text-gray-400 font-bold">请检查档案或联系管理员</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* 第二等级：管理层 */}
                            {groupedByLevel[2].length > 0 && (
                                <div className="space-y-3" id="level-2-management-section">
                                    <div className="bg-[#1A1A1A]/5 p-3 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">💼</span>
                                            <div>
                                                <h5 className="text-xs font-black text-[#1A1A1A] tracking-wider">第二等级：管理层 / 评分人</h5>
                                                <p className="text-[9px] text-gray-500 font-bold">负责日常运营工作考核，允许评价第三等级员工</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 sm:self-center">
                                            {groupedByLevel[2].length} 人
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {groupedByLevel[2].map(emp => (
                                            <EmployeeCard 
                                                key={emp.id} 
                                                emp={emp} 
                                                rater={currentEmployee!}
                                                quarter={currentQuarter}
                                                onClick={() => handleSelectEmployee(emp)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 第三等级：普通员工 */}
                            {groupedByLevel[3].length > 0 && (
                                <div className="space-y-3" id="level-3-staff-section">
                                    <div className="bg-[#1A1A1A]/5 p-3 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">👥</span>
                                            <div>
                                                <h5 className="text-xs font-black text-[#1A1A1A] tracking-wider">第三等级：普通员工 / 被评人</h5>
                                                <p className="text-[9px] text-gray-500 font-bold">接受管理层的日常评分与技能季度考核</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 sm:self-center">
                                            {groupedByLevel[3].length} 人
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {groupedByLevel[3].map(emp => (
                                            <EmployeeCard 
                                                key={emp.id} 
                                                emp={emp} 
                                                rater={currentEmployee!}
                                                quarter={currentQuarter}
                                                onClick={() => handleSelectEmployee(emp)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 兼职豁免区 */}
                            {groupedByLevel.EXEMPT.length > 0 && (
                                <div className="space-y-3" id="exempt-staff-section">
                                    <div className="bg-gray-50 p-3 rounded-xl border border-dashed border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">🚫</span>
                                            <div>
                                                <h5 className="text-xs font-black text-gray-400 tracking-wider">兼职豁免区 (Exempt)</h5>
                                                <p className="text-[9px] text-gray-400 font-bold">兼职及临时职位，已自动豁免本季季度评分</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 sm:self-center">
                                            {groupedByLevel.EXEMPT.length} 人
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                        {groupedByLevel.EXEMPT.map(emp => (
                                            <div 
                                                key={emp.id} 
                                                className="bg-gray-50/50 p-3 rounded-xl border border-gray-100 opacity-60"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-black text-gray-400 overflow-hidden shrink-0">
                                                        {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer"/> : emp.name.charAt(0)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-gray-600 truncate">{emp.name}</p>
                                                        <p className="text-[9px] font-bold text-gray-400">兼职 · 豁免评分</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ========== 评测关系配置 Drawer (老板专属) ========== */}
                {isConfigDrawerOpen && isOwner && (
                    <div className="fixed inset-0 bg-black/80 z-[150] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full h-[90vh] md:max-w-3xl md:h-[80vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl relative animate-in slide-in-from-bottom">
                            
                            {/* Drawer Header */}
                            <div className="bg-[#1A1A1A] p-4 md:p-5 flex justify-between items-center text-white border-b-4 border-[#FFD700] shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="bg-[#FFD700] text-black p-2 rounded-xl"><Users size={18}/></div>
                                    <div>
                                        <h4 className="font-serif font-black text-base tracking-wide">⚙️ 评测与账户配置中心</h4>
                                        <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Assessment & Accounts Configuration</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        setIsConfigDrawerOpen(false);
                                        setSelectedRater(null);
                                    }} 
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <X size={20}/>
                                </button>
                            </div>

                            {/* Tab Row */}
                            <div className="bg-gray-100 p-2 flex border-b border-gray-200 shrink-0 gap-2">
                                <button
                                    onClick={() => setConfigTab('RELATIONS')}
                                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all text-center ${
                                        configTab === 'RELATIONS' 
                                            ? 'bg-white text-stone-900 shadow-sm' 
                                            : 'text-gray-500 hover:text-stone-900 hover:bg-white/50'
                                    }`}
                                    style={{ minHeight: '36px' }}
                                >
                                    ⚙️ 评分权限及对象配对
                                </button>
                                <button
                                    onClick={() => setConfigTab('MERGE')}
                                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all text-center ${
                                        configTab === 'MERGE' 
                                            ? 'bg-white text-stone-900 shadow-sm' 
                                            : 'text-gray-500 hover:text-stone-900 hover:bg-white/50'
                                    }`}
                                    style={{ minHeight: '36px' }}
                                >
                                    👥 重复账户合并清理
                                </button>
                                <button
                                    onClick={() => setConfigTab('EXEMPT')}
                                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all text-center ${
                                        configTab === 'EXEMPT' 
                                            ? 'bg-white text-stone-900 shadow-sm' 
                                            : 'text-gray-500 hover:text-stone-900 hover:bg-white/50'
                                    }`}
                                    style={{ minHeight: '36px' }}
                                >
                                    🚫 忽略评分豁免设置
                                </button>
                            </div>

                            {/* Drawer Content */}
                            {configTab === 'RELATIONS' ? (
                                <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
                                    
                                    {/* Step 1: Select Rater */}
                                    <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col overflow-hidden shrink-0">
                                        <div className="p-3 bg-gray-50 border-b border-gray-100 shrink-0">
                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">第一步：选择管理层/评分人</span>
                                        </div>
                                        <div className="flex-grow overflow-y-auto p-3 space-y-2">
                                            {employees
                                                .filter(e => !e.isArchived && getEmployeeLevel(e) === 2)
                                                .map(e => {
                                                    const isSelected = selectedRater?.id === e.id;
                                                    return (
                                                        <button
                                                            key={e.id}
                                                            onClick={() => {
                                                                setSelectedRater(e);
                                                                setSelectedTargets(e.assessmentTargets || []);
                                                            }}
                                                            className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                                                                isSelected 
                                                                    ? 'bg-blue-50 border-blue-500 shadow-sm' 
                                                                    : 'bg-white border-gray-100 hover:border-gray-200'
                                                            }`}
                                                            style={{ minHeight: '44px' }}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="font-black text-xs text-[#1A1A1A] truncate">{e.name}</div>
                                                                <div className="text-[10px] text-gray-400 font-bold">{e.role || '管理层'}</div>
                                                            </div>
                                                            {isSelected && <ChevronRight size={16} className="text-blue-500 shrink-0"/>}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>

                                    {/* Step 2: Configure Targets */}
                                    <div className="flex-grow flex flex-col overflow-hidden">
                                        <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0">
                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                                {selectedRater ? `第二步：选择 ${selectedRater.name} 的评测对象` : '请先在左侧选择一个评分人'}
                                            </span>
                                            {selectedRater && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const l3Ids = employees.filter(e => !e.isArchived && getEmployeeLevel(e) === 3).map(e => e.id);
                                                            setSelectedTargets(l3Ids);
                                                        }}
                                                        className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded"
                                                    >
                                                        全选员工
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedTargets([])}
                                                        className="text-[10px] font-black bg-gray-100 text-gray-600 px-2 py-1 rounded"
                                                    >
                                                        清空
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-grow overflow-y-auto p-4 space-y-4">
                                            {selectedRater ? (
                                                <div className="space-y-4">
                                                    {/* Category: Level 3 employees */}
                                                    <div>
                                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                                            第三等级员工 (可评测)
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {employees
                                                                .filter(e => !e.isArchived && getEmployeeLevel(e) === 3)
                                                                .map(e => {
                                                                    const isChecked = selectedTargets.includes(e.id);
                                                                    return (
                                                                        <button
                                                                            key={e.id}
                                                                            onClick={() => {
                                                                                if (isChecked) {
                                                                                    setSelectedTargets(prev => prev.filter(id => id !== e.id));
                                                                                } else {
                                                                                    setSelectedTargets(prev => [...prev, e.id]);
                                                                                }
                                                                            }}
                                                                            className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                                                                                isChecked 
                                                                                    ? 'bg-green-50 border-green-500 text-green-800' 
                                                                                    : 'bg-white border-gray-100'
                                                                            }`}
                                                                            style={{ minHeight: '44px' }}
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <div className="font-black text-xs truncate">{e.name}</div>
                                                                                <div className="text-[9px] text-gray-400 font-bold">{e.role}</div>
                                                                            </div>
                                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 bg-white'}`}>
                                                                                {isChecked && (
                                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                                    </svg>
                                                                                )}
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                                                    <Users size={48} className="text-gray-200 mb-3"/>
                                                    <p className="text-xs font-bold">请从左侧选择一个管理层人员，开始为其配置允许评测的普通员工对象。</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : configTab === 'MERGE' ? (
                                <div className="flex-grow flex flex-col p-5 overflow-y-auto bg-gray-50/50 space-y-5">
                                    <div className="bg-amber-550/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
                                        <span className="text-xl shrink-0">💡</span>
                                        <div>
                                            <h5 className="text-xs font-black text-amber-800">关于重复档案合并与清理</h5>
                                            <p className="text-[10px] text-amber-700 font-medium leading-relaxed mt-1">
                                                如果系统中存在同一个人拥有两个账号（例如：<span className="font-bold">JAKE</span> 和 <span className="font-bold">Jake Ng</span>，或者 <span className="font-bold">AI Ching</span> 和 <span className="font-bold">Evelyn</span>），您可以使用此工具进行一键合并清理：
                                            </p>
                                            <ul className="text-[10px] text-amber-700 font-medium list-disc list-inside mt-1.5 space-y-1">
                                                <li>被合并的重复档案将被<span className="font-bold text-red-650">永久删除</span>；</li>
                                                <li>重复档案关联的<span className="font-bold">评测分数、管理模块权限、违纪警告、薪水记录</span>将自动全部合并转移至保留的正确档案；</li>
                                                <li>若您当前登录的是被清理的那个重复账号，系统将自动帮您安全切换并登录为正确账号。</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Dropdown 1: Source */}
                                        <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col space-y-2">
                                            <label className="text-[11px] font-black text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                                                <span>🚨 第一步：选择需要清理的重复账号</span>
                                            </label>
                                            <p className="text-[9px] text-gray-400 font-bold">该账号在合并后会被永久删除，其所有数据将被移出。</p>
                                            <select
                                                value={mergeSourceId}
                                                onChange={e => setMergeSourceId(e.target.value)}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-stone-900 outline-none focus:ring-1 focus:ring-red-500"
                                                style={{ minHeight: '44px' }}
                                            >
                                                <option value="">-- 请选择要清理的重复账户 --</option>
                                                {employees
                                                    .filter(e => !e.isArchived)
                                                    .map(e => (
                                                        <option key={e.id} value={e.id} disabled={e.id === mergeTargetId}>
                                                            👤 {e.name} ({e.role || '未分类'} · ID: {e.id})
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>

                                        {/* Dropdown 2: Target */}
                                        <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col space-y-2">
                                            <label className="text-[11px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                                                <span>✅ 第二步：选择保留的正确主账号</span>
                                            </label>
                                            <p className="text-[9px] text-gray-400 font-bold">该账号将被保留，并继承被合并账号的所有历史与权限。</p>
                                            <select
                                                value={mergeTargetId}
                                                onChange={e => setMergeTargetId(e.target.value)}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-stone-900 outline-none focus:ring-1 focus:ring-emerald-500"
                                                style={{ minHeight: '44px' }}
                                            >
                                                <option value="">-- 请选择要保留的正确主账户 --</option>
                                                {employees
                                                    .filter(e => !e.isArchived)
                                                    .map(e => (
                                                        <option key={e.id} value={e.id} disabled={e.id === mergeSourceId}>
                                                            🌟 {e.name} ({e.role || '主账号'} · ID: {e.id})
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Preview Area */}
                                    {mergeSourceId && mergeTargetId && (
                                        <div className="bg-stone-900 text-white p-4 rounded-2xl space-y-3 border-l-4 border-yellow-500 animate-in fade-in zoom-in-95">
                                            <h6 className="text-[10px] font-black uppercase tracking-wider text-yellow-450">⚠️ 合并效果预览 (Merge Preview)</h6>
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                                                <div className="flex-1">
                                                    <p className="text-[10px] text-red-400 font-bold uppercase">❌ 将被永久清理删除</p>
                                                    <p className="text-xs font-black mt-0.5">{employees.find(e => e.id === mergeSourceId)?.name}</p>
                                                    <p className="text-[9px] text-white/50">{employees.find(e => e.id === mergeSourceId)?.role}</p>
                                                </div>
                                                <div className="flex items-center justify-center text-yellow-450 text-xl font-bold">➡️</div>
                                                <div className="flex-1 text-right sm:text-right">
                                                    <p className="text-[10px] text-emerald-400 font-bold uppercase">🌟 将接收数据并保留</p>
                                                    <p className="text-xs font-black mt-0.5">{employees.find(e => e.id === mergeTargetId)?.name}</p>
                                                    <p className="text-[9px] text-white/50">{employees.find(e => e.id === mergeTargetId)?.role}</p>
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-white/60 leading-relaxed font-bold">
                                                💡 提示：点击下方“执行一键合并清理”按钮后，系统将在后台自动合并两者数据，整个过程仅需1秒，安全不丢数据。
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-grow flex flex-col p-5 overflow-y-auto bg-gray-50/50 space-y-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
                                        <span className="text-xl shrink-0">💡</span>
                                        <div>
                                            <h5 className="text-xs font-black text-blue-800">关于评分忽略/豁免设置</h5>
                                            <p className="text-[10px] text-blue-700 font-medium leading-relaxed mt-1">
                                                如果您（老板）认为某些员工（如兼职、特殊顾问、或自愿不想要参与本季度考核的成员）暂不需要参与季度考核，可以在下方将其勾选为<span className="font-bold text-red-600">“忽略/豁免评分”</span>：
                                            </p>
                                            <ul className="text-[10px] text-blue-700 font-medium list-disc list-inside mt-1.5 space-y-1">
                                                <li>被忽略的员工将<span className="font-bold">不显示</span>在管理层的待评分列表和评分统计看板中；</li>
                                                <li>豁免后，该员工的任何季度考核均不会被视为“未完成/拖欠”，保护考核统计数据的真实性；</li>
                                                <li>您可以随时再次取消勾选，恢复其正常季度考评。</li>
                                            </ul>
                                        </div>
                                    </div>

                                    {/* 员工列表 */}
                                    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                                        <div className="p-3 bg-gray-50 flex items-center justify-between shrink-0">
                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">在职员工列表 ({employees.filter(e => !e.isArchived && (getEmployeeLevel(e) !== 1 || getJobCategoryForEmployee(e) !== 'OWNER')).length} 人)</span>
                                            <span className="text-[10px] text-gray-400 font-bold">点击滑块即时保存</span>
                                        </div>
                                        <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-50">
                                            {employees
                                                .filter(e => !e.isArchived && (getEmployeeLevel(e) !== 1 || getJobCategoryForEmployee(e) !== 'OWNER'))
                                                .map(e => {
                                                    const isExempt = !!e.assessmentExempt;
                                                    const isUpdating = updatingExemptId === e.id;
                                                    return (
                                                        <div 
                                                            key={e.id}
                                                            className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                                                                isExempt ? 'bg-red-50/30' : 'hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-black text-xs text-[#1A1A1A]">{e.name}</span>
                                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                                        getEmployeeLevel(e) === 1
                                                                            ? 'bg-amber-100 text-amber-700'
                                                                            : getEmployeeLevel(e) === 2 
                                                                                ? 'bg-blue-100 text-blue-700' 
                                                                                : 'bg-stone-100 text-stone-600'
                                                                    }`}>
                                                                        {getEmployeeLevel(e) === 1 ? '老板' : getEmployeeLevel(e) === 2 ? '管理层' : '普通员工'}
                                                                    </span>
                                                                    {isExempt && (
                                                                        <span className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                                                            🚫 已忽略/免评
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[10px] text-gray-400 mt-0.5">{e.role || '未设置岗位'} · ID: {e.id}</p>
                                                            </div>

                                                            <button
                                                                disabled={isUpdating}
                                                                onClick={() => handleToggleExempt(e)}
                                                                className={`w-12 h-6 rounded-full p-0.5 transition-colors relative flex items-center ${
                                                                    isExempt ? 'bg-red-500' : 'bg-gray-200'
                                                                } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                style={{ minWidth: '48px', minHeight: '24px' }}
                                                            >
                                                                <span 
                                                                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform flex items-center justify-center ${
                                                                        isExempt ? 'translate-x-6' : 'translate-x-0'
                                                                    }`}
                                                                >
                                                                    {isUpdating && <Loader2 size={10} className="animate-spin text-stone-500" />}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Drawer Footer */}
                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                                <div className="text-xs text-gray-400 font-bold">
                                    {configTab === 'RELATIONS' 
                                        ? (selectedRater && `已选择 ${selectedTargets.length} 个评测对象`)
                                        : (mergeSourceId && mergeTargetId ? '准备合并清理' : '请选择需要配置的档案')
                                    }
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setIsConfigDrawerOpen(false);
                                            setSelectedRater(null);
                                        }}
                                        className="px-4 py-2 text-xs font-black text-gray-500 bg-white border border-gray-200 rounded-xl active:scale-95 transition-all"
                                        style={{ minHeight: '44px' }}
                                    >
                                        取消
                                    </button>
                                    {configTab === 'RELATIONS' ? (
                                        <button
                                            disabled={!selectedRater || savingConfig}
                                            onClick={async () => {
                                                if (!selectedRater) return;
                                                setSavingConfig(true);
                                                try {
                                                    const updatedRater = {
                                                        ...selectedRater,
                                                        assessmentTargets: selectedTargets
                                                    };
                                                    await DataManager.saveEmployee(updatedRater);
                                                    setEmployees(prev => prev.map(e => e.id === updatedRater.id ? updatedRater : e));
                                                    alert(`✅ 已成功保存 ${selectedRater.name} 的评测对象关系！`);
                                                    setIsConfigDrawerOpen(false);
                                                    setSelectedRater(null);
                                                } catch (err) {
                                                    console.error(err);
                                                    alert("❌ 保存失败，请重试");
                                                } finally {
                                                    setSavingConfig(false);
                                                }
                                            }}
                                            className={`px-6 py-2 text-xs font-black rounded-xl active:scale-95 transition-all flex items-center gap-1.5 ${
                                                selectedRater 
                                                    ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' 
                                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            }`}
                                            style={{ minHeight: '44px' }}
                                        >
                                            {savingConfig ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    <span>正在保存...</span>
                                                </>
                                            ) : (
                                                <span>保存评测关系</span>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            disabled={!mergeSourceId || !mergeTargetId || merging}
                                            onClick={handleMergeAccounts}
                                            className={`px-6 py-2 text-xs font-black rounded-xl active:scale-95 transition-all flex items-center gap-1.5 ${
                                                mergeSourceId && mergeTargetId
                                                    ? 'bg-red-600 text-white shadow-md hover:bg-red-700' 
                                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            }`}
                                            style={{ minHeight: '44px' }}
                                        >
                                            {merging ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    <span>正在合并清理...</span>
                                                </>
                                            ) : (
                                                <span>🔥 执行一键合并清理</span>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========== 评分表单 ========== */}
                {assessingEmployee && currentEmployee && (
                    <AssessmentForm
                        employee={assessingEmployee}
                        currentEmployee={currentEmployee}
                        quarter={currentQuarter}
                        existingRecord={existingRecords[assessingEmployee.id]}
                        onClose={() => setAssessingEmployee(null)}
                        onSaved={handleAssessmentSaved}
                    />
                )}
                
                {/* ========== Guide Modal ========== */}
                {showGuide && (
                    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowGuide(false)}>
                        <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 bg-[#1A1A1A] text-[#FFD700] rounded-full flex items-center justify-center mx-auto mb-3">
                                    <HelpCircle size={28}/>
                                </div>
                                <h2 className="text-xl font-black text-[#1A1A1A]">评分系统说明</h2>
                            </div>

                            <div className="space-y-3 text-sm text-gray-600 leading-relaxed mb-6">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <p className="font-black text-[#1A1A1A] mb-1">📅 季度评测</p>
                                    <p className="text-xs">每季度评一次，评分窗口为每季首月 1-15 日。Q1 = 1-3月, Q2 = 4-6月, 以此类推。</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <p className="font-black text-[#1A1A1A] mb-1">🎯 4 项指标</p>
                                    <p className="text-xs">每个岗位有 3 项专属核心能力 + 1 项通用纪律底线，共 4 项。不同岗位的指标不同。</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <p className="font-black text-[#1A1A1A] mb-1">🏆 5 档评分</p>
                                    <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                                        {GRADE_TIERS.filter(t => t.label !== 'SSS' && t.label !== 'SS').map(t => (
                                            <div key={t.label} className={`p-2 rounded border ${t.color}`}>
                                                <div className="font-black">{t.label} ({t.score}分)</div>
                                                <div className="opacity-70">{t.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <p className="font-black text-[#1A1A1A] mb-1">⚠️ C 档必填备注</p>
                                    <p className="text-xs">打 C 档时必须说明具体原因，作为 HR 档案证据。</p>
                                </div>
                            </div>

                            <button 
                                onClick={() => setShowGuide(false)} 
                                className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black shadow-lg active:scale-95"
                            >
                                我明白了
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// 员工卡片子组件
// ============================================================================

interface EmployeeCardProps {
    emp: Employee;
    rater: Employee;
    quarter: QuarterKey;
    onClick: () => void;
}

const EmployeeCard: React.FC<EmployeeCardProps> = ({ emp, rater, quarter, onClick }) => {
    const category = getJobCategoryForEmployee(emp);
    const jobDef = JOB_METRICS[category];
    const status = getQuarterlyStatus(emp, quarter);
    const perm = getAssessPermission(rater, emp);
    const canAssess = perm === 'INITIAL' || perm === 'OVERRIDE';
    
    // 上个季度的分数 (如果有)
    const lastRecord = emp.assessmentRecordsV2 && emp.assessmentRecordsV2.length > 0
        ? [...emp.assessmentRecordsV2].sort((a, b) => b.quarter.localeCompare(a.quarter))[0]
        : null;

    const raterLevel = getEmployeeLevel(rater);
    const targetLevel = getEmployeeLevel(emp);
    const hideScore = raterLevel === 2 && targetLevel !== 3;

    return (
        <button 
            onClick={onClick}
            className={`p-4 rounded-2xl border transition-all text-left w-full ${
                canAssess 
                    ? 'bg-white border-gray-100 shadow-sm active:scale-[0.98] cursor-pointer hover:border-gray-200' 
                    : 'bg-gray-50/60 border-gray-100/50 opacity-80 cursor-default'
            }`}
        >
            <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-400 overflow-hidden border border-white shadow-sm shrink-0">
                    {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer"/> : emp.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-black text-sm text-[#1A1A1A] truncate">{emp.name}</h4>
                        <StatusBadge status={status}/>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase truncate mt-0.5">
                        {/* 💡 优化：安全切割字符串 */}
                        {jobDef?.emoji} {jobDef?.label || (emp.role || '未分配').split('(')[0]}
                    </p>
                </div>
            </div>
            
            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                {hideScore ? (
                    <span className="text-[10px] text-gray-400 font-bold italic flex items-center gap-1">
                        <Lock size={10} className="text-gray-400 shrink-0"/> 🔒 仅限查看第三等级分数
                    </span>
                ) : lastRecord ? (
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-gray-400 font-bold">上季:</span>
                        <span className={`px-1.5 py-0.5 rounded font-black border ${getTierByLabel(lastRecord.finalGrade).color}`}>
                            {lastRecord.finalGrade} · {lastRecord.finalScore}
                        </span>
                    </div>
                ) : (
                    <span className="text-[10px] text-gray-300 font-bold italic">无历史记录</span>
                )}
                
                <div className="flex items-center gap-0.5 text-xs font-bold">
                    {canAssess ? (
                        <span className="text-blue-600 flex items-center gap-0.5">
                            {status === 'NOT_STARTED' ? '进行评分' : '修改评分'} <ChevronRight size={14}/>
                        </span>
                    ) : (
                        <span className="text-gray-400 flex items-center gap-0.5">
                            <Lock size={10}/> 只读/不可评
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
};