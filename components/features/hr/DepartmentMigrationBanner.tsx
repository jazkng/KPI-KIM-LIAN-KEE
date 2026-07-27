import React, { useState, useMemo } from 'react';
import { ArrowRight, Loader2, CheckCircle, SlidersHorizontal, X } from 'lucide-react';
import { DataManager } from '../../../utils/dataManager';
import { Employee } from '../../../types';

interface DepartmentMigrationBannerProps {
    employees: Employee[];
    onMigrationComplete: () => void;
}

// 统一部门枚举和推荐映射
export const DEPARTMENTS = [
    { value: 'OWNER', label: '老板级别 (Owner)', color: 'bg-amber-50 text-amber-800 border-amber-100' },
    { value: 'KITCHEN', label: '厨房 (Kitchen)', color: 'bg-orange-50 text-orange-800 border-orange-100' },
    { value: 'FLOOR', label: '楼面 (Floor)', color: 'bg-purple-50 text-purple-800 border-purple-100' },
    { value: 'BAR', label: '吧台 (Bar)', color: 'bg-blue-50 text-blue-800 border-blue-100' },
    { value: 'DISHWASH', label: '洗碗 (Dishwash)', color: 'bg-teal-50 text-teal-800 border-teal-100' },
    { value: 'BACK_OFFICE', label: '后勤 (Back Office)', color: 'bg-indigo-50 text-indigo-800 border-indigo-100' },
    { value: 'OTHER', label: '其他 (Other)', color: 'bg-gray-50 text-gray-800 border-gray-100' }
];

export function getRecommendedDept(role: string): 'KITCHEN' | 'FLOOR' | 'BAR' | 'DISHWASH' | 'BACK_OFFICE' | 'OTHER' | 'OWNER' {
    const r = (role || '').toUpperCase();
    
    // 0. Owner / Boss
    if (r.includes('OWNER') || r.includes('老板') || r.includes('JAKE')) {
        return 'OWNER';
    }
    
    // 1. Back Office / HR / Store Management
    if (
        r.includes('HR') || 
        r.includes('FINANCE') || 
        r.includes('OFFICE') || 
        r.includes('人事') || 
        r.includes('财务') || 
        r.includes('后台') ||
        r.includes('店面管理') ||
        r.includes('STORE MANAGEMENT') ||
        r.includes('M_STORE') ||
        r.includes('M_HR')
    ) {
        return 'BACK_OFFICE';
    }
    
    // 2. Kitchen (BOH, Chef, Cook, Cutter, Fryer, Runner, Helper, Apprentice, etc.)
    if (
        r.includes('CHEF') || 
        r.includes('COOK') || 
        r.includes('CUTTER') || 
        r.includes('FRYER') || 
        r.includes('COMMIS') || 
        r.includes('RUNNER') || 
        r.includes('HELPER') || 
        r.includes('APPRENTICE') || 
        r.includes('头手') || 
        r.includes('帮锅') || 
        r.includes('占板') || 
        r.includes('马王') || 
        r.includes('厨房') ||
        r.includes('炸炉') ||
        r.includes('摆盘') ||
        r.includes('切配')
    ) {
        return 'KITCHEN';
    }
    
    // 3. Dishwash / Cleaning
    if (
        r.includes('DISH') || 
        r.includes('WASH') || 
        r.includes('CLEAN') || 
        r.includes('洗') || 
        r.includes('清洁')
    ) {
        return 'DISHWASH';
    }
    
    // 4. Bar / Drinks
    if (
        r.includes('BAR') || 
        r.includes('WATER') || 
        r.includes('茶') || 
        r.includes('水')
    ) {
        return 'BAR';
    }
    
    // 5. Floor / Front of House (Manager, Supervisor, Counter, Cashier, Captain, Waiter, Part-Time, etc.)
    if (
        r.includes('FLOOR') || 
        r.includes('MANAGER') || 
        r.includes('SUPERVISOR') || 
        r.includes('COUNTER') || 
        r.includes('CASHIER') || 
        r.includes('CAPTAIN') || 
        r.includes('WAITER') || 
        r.includes('PART') || 
        r.includes('DELIVERY') || 
        r.includes('ORDER') || 
        r.includes('CHECKER') || 
        r.includes('经理') || 
        r.includes('主管') || 
        r.includes('柜台') || 
        r.includes('收银') || 
        r.includes('写单') || 
        r.includes('服务') || 
        r.includes('兼职') || 
        r.includes('外卖') || 
        r.includes('看单')
    ) {
        return 'FLOOR';
    }
    
    return 'OTHER';
}

export const DepartmentMigrationBanner: React.FC<DepartmentMigrationBannerProps> = ({ employees, onMigrationComplete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [selectedMapping, setSelectedMapping] = useState<Record<string, string>>({});

    // 筛选出部门不规范、为空或为 GENERAL 的员工 (排除 Owner 职位)
    const legacyEmployees = useMemo(() => {
        return employees.filter(emp => {
            const isOwner = emp.role && emp.role.includes('Owner');
            if (isOwner) return false;
            
            const dept = emp.department as string | undefined;
            const isLegacy = !dept || dept === 'GENERAL' || !['KITCHEN', 'FLOOR', 'BAR', 'DISHWASH', 'BACK_OFFICE', 'OTHER', 'OWNER'].includes(dept);
            return isLegacy;
        });
    }, [employees]);

    // 打开模态框时，初始化默认的推荐部门
    const handleOpenMigration = () => {
        const initialMapping: Record<string, string> = {};
        legacyEmployees.forEach(emp => {
            initialMapping[emp.id] = getRecommendedDept(emp.role || '');
        });
        setSelectedMapping(initialMapping);
        setShowModal(true);
    };

    const handleConfirmMigration = async () => {
        setIsSaving(true);
        try {
            // 执行批量转换
            const updatedEmployees = legacyEmployees.map(emp => ({
                ...emp,
                department: (selectedMapping[emp.id] || getRecommendedDept(emp.role || '')) as any
            }));

            // 批量写入
            await Promise.all(updatedEmployees.map(emp => DataManager.saveEmployee(emp)));
            
            // 清理缓存并通知父组件刷新
            DataManager.clearCacheKeys(['employees']);
            onMigrationComplete();
            
            setSuccessMsg('🎉 员工部门数据规范化转换成功！');
            setTimeout(() => {
                setShowModal(false);
                setSuccessMsg('');
            }, 2000);
        } catch (error) {
            console.error('Migration failed:', error);
            alert('转换失败，请重试');
        } finally {
            setIsSaving(false);
        }
    };

    if (legacyEmployees.length === 0) return null;

    return (
        <>
            {/* iOS 顶端极简通知横幅 */}
            <div className="w-full bg-[#8B0000] text-[#FFD200] px-4 py-3 shadow-md flex items-center justify-between transition-all animate-fade-in text-xs font-bold shrink-0 md:rounded-2xl md:mb-4 border border-[#8B0000]/20">
                <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center animate-pulse text-sm">
                        ⚠️
                    </div>
                    <span>
                        检测到 <span className="underline font-black text-white">{legacyEmployees.length}</span> 名员工的部门分类不规范 (GENERAL 或未分类)。
                    </span>
                </div>
                <button 
                    onClick={handleOpenMigration}
                    className="bg-[#FFD200] hover:bg-yellow-400 active:scale-95 text-[#8B0000] px-3.5 py-1.5 rounded-full font-black tracking-wide shadow-sm transition-transform shrink-0"
                    style={{ minHeight: '32px' }}
                >
                    立即转换 (Convert)
                </button>
            </div>

            {/* 确认列表弹窗 (Confirmation Dialog - iOS Style) */}
            {showModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
                    <div className="bg-[#F6F7FB] dark:bg-stone-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-white/40 overflow-hidden flex flex-col my-8" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
                        {/* Header */}
                        <div className="p-6 bg-gradient-to-r from-[#8B0000] to-[#A00000] text-white flex justify-between items-center relative shrink-0">
                            <div>
                                <h3 className="text-lg font-black tracking-wide flex items-center gap-2">
                                    <SlidersHorizontal size={18} />
                                    部门数据规范化转换 (Data Normalization)
                                </h3>
                                <p className="text-[10px] text-white/70 font-medium mt-1">为了保证排班、绩效及考勤模块的数据一致，请确认以下转换建议：</p>
                            </div>
                            <button 
                                onClick={() => !isSaving && setShowModal(false)}
                                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-90"
                                disabled={isSaving}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Body - Employees Scrollable List */}
                        <div className="p-5 overflow-y-auto flex-grow space-y-3 custom-scrollbar">
                            {successMsg ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                                    <CheckCircle size={48} className="text-green-500 animate-bounce" />
                                    <p className="text-sm font-black text-gray-800">{successMsg}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">
                                        待转换员工列表 ({legacyEmployees.length} 人)
                                    </div>

                                    <div className="space-y-2">
                                        {legacyEmployees.map((emp) => {
                                            const recommended = getRecommendedDept(emp.role || '');
                                            const currentVal = selectedMapping[emp.id] || recommended;

                                            return (
                                                <div 
                                                    key={emp.id}
                                                    className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-gray-800 text-sm">{emp.name}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono">ID: {emp.id}</span>
                                                        </div>
                                                        <div className="text-[11px] font-bold text-gray-500 mt-1">
                                                            职位 (Role): <span className="text-gray-700">{emp.role || '未设定'}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2.5 shrink-0">
                                                        <span className="bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                                                            {emp.department || 'GENERAL'}
                                                        </span>
                                                        <ArrowRight size={14} className="text-gray-300" />
                                                        
                                                        {/* 管理员可以核对或自主下拉调整，非常周全 */}
                                                        <select
                                                            value={currentVal}
                                                            onChange={(e) => setSelectedMapping({
                                                                ...selectedMapping,
                                                                [emp.id]: e.target.value
                                                            })}
                                                            className="bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-[#8B0000]/20 focus:border-[#8B0000] cursor-pointer"
                                                            style={{ minWidth: '130px', minHeight: '32px' }}
                                                        >
                                                            {DEPARTMENTS.map((dept) => (
                                                                <option key={dept.value} value={dept.value}>
                                                                    {dept.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer Buttons */}
                        {!successMsg && (
                            <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3 shrink-0 rounded-b-[2.5rem]">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-800 rounded-full transition-colors active:scale-95"
                                    disabled={isSaving}
                                    style={{ minHeight: '40px' }}
                                >
                                    取消 (Cancel)
                                </button>
                                <button
                                    onClick={handleConfirmMigration}
                                    className="bg-[#111111] hover:bg-black text-[#FFD200] px-6 py-2.5 rounded-full font-black text-xs shadow-md transition-all active:scale-95 flex items-center gap-2"
                                    disabled={isSaving}
                                    style={{ minHeight: '40px' }}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            正在转换...
                                        </>
                                    ) : (
                                        '确认批量转换 (Confirm)'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
