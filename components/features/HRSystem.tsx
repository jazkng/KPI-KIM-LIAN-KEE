import '../operations-ui.css';
import React, { useState, useEffect, useCallback } from 'react';
import { Users, User, DollarSign, Briefcase, X, ArrowLeft } from 'lucide-react';
import { Employee, RoleDefinition, RoleGuide } from '../../types';
import { DEFAULT_ROLE_GUIDES, DEFAULT_ROLES, ROLE_SOP_DETAILS } from '../constants';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { HRProfiles } from './hr/HRProfiles';
import { HRPayroll } from './hr/HRPayroll';
import { HRRoleStandards } from './hr/HRRoleStandards';
import { isSystemAdminAccount } from '../../utils/orgAccess';

// iOS 通用样式
const noTap: React.CSSProperties = { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

// Fix #3: localStorage 安全读写
const safeStorage = {
    get: (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch (e) { console.warn(`[Storage] Failed to save "${key}"`, e); } },
};

interface HRSystemProps {
    onClose: () => void;
    currentEmployee?: Employee | null;
}

export const HRSystem: React.FC<HRSystemProps> = ({ onClose, currentEmployee }) => {
    const isSuperAdminMode = isSystemAdminAccount(currentEmployee);
    // 手机版：打开某位员工的档案时，隐藏顶部标题与分页，让档案占满画面（档案自己有返回键）
    const [profileOpen, setProfileOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'PROFILES' | 'PAYROLL' | 'ROLES'>('PROFILES');
    const [payrollMode, setPayrollMode] = useState<'CALC' | 'PARTTIME'>('CALC');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(DEFAULT_ROLES);
    const [roleGuides, setRoleGuides] = useState<Record<string, RoleGuide>>(DEFAULT_ROLE_GUIDES);
    const [roleSops, setRoleSops] = useState<Record<string, any>>(ROLE_SOP_DETAILS);
    const [focusedEmployeeId, setFocusedEmployeeId] = useState<string | null>(null);

    // Fix #1 & #2: isMounted 守卫 + try-catch
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                const cloudStaff = await DataManager.getEmployees();
                if (!isMounted) return;
                setEmployees(cloudStaff);

                // Fix #3: localStorage 读取加保护
                const savedRoles  = safeStorage.get('kepong_erp_roles');
                const savedGuides = safeStorage.get('kepong_erp_role_guides');
                const savedSops   = safeStorage.get('kepong_erp_sop_templates');

                if (savedRoles)  { try { setRoleDefinitions(JSON.parse(savedRoles));  } catch {} }
                if (savedGuides) { try { setRoleGuides(JSON.parse(savedGuides));      } catch {} }
                if (savedSops)   { try { setRoleSops(JSON.parse(savedSops));          } catch {} }
            } catch (err) {
                console.error('HRSystem load failed:', err);
            }
        };
        load();
        return () => { isMounted = false; };
    }, []);

    const handleSaveEmployees = useCallback((newList: Employee[]) => {
        setEmployees(newList);
    }, []);

    const handleSaveRoleConfig = useCallback((guides: Record<string, RoleGuide>, sops: Record<string, any>) => {
        setRoleGuides(guides);
        setRoleSops(sops);
        safeStorage.set('kepong_erp_role_guides', JSON.stringify(guides));
        safeStorage.set('kepong_erp_sop_templates', JSON.stringify(sops));
    }, []);

    const TABS = [
        { id: 'PROFILES' as const, label: '员工档案', Icon: User },
        // 设备户口（DEVICES）已在 V2 停用（负责人 2026-10-21）；设备户口资料保留不动
        { id: 'PAYROLL'  as const, label: '薪资结算', Icon: DollarSign },
        { id: 'ROLES'    as const, label: '职位标准', Icon: Briefcase },
    ];

    return (
        <div className="hr-ui fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-white w-full h-full md:max-w-7xl md:h-[95vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">

                {/* 顶栏 — iOS safe-area */}
                <div className={`bg-[#111111] px-4 pb-4 text-white justify-between items-center shrink-0 border-b-4 border-[#FFD200] safe-area-top ${profileOpen && activeTab === 'PROFILES' ? 'hidden md:flex' : 'flex'}`}>
                    <div className="flex items-center gap-3">
                        <button
                            style={noTap}
                            onClick={onClose}
                            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-white transition-all border border-white/10 shrink-0"
                            aria-label="Back"
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                        <h3 className="font-black text-lg flex items-center gap-2 whitespace-nowrap min-w-0">
                            <Users className="text-[#FFD200] shrink-0" />
                            <span className="hidden md:inline">金莲记EPR · </span>人事中心
                            {isSuperAdminMode && (
                                <span className="text-[9px] md:text-[10px] bg-[#FFD200] text-black px-2 py-1 rounded-full tracking-wider whitespace-nowrap">
                                    ADMIN
                                </span>
                            )}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <ModuleGuideButton module="HR" />
                        <button
                            style={noTap}
                            onClick={onClose}
                            className="hover:bg-white/20 active:bg-white/30 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors select-none"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 导航 Tab — iOS: min-h-[44px] + noTap */}
                <div className={`bg-gray-100 border-b shrink-0 overflow-x-auto ${profileOpen && activeTab === 'PROFILES' ? 'hidden md:flex' : 'flex'}`}
                     style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            style={noTap}
                            onClick={() => { setPayrollMode('CALC'); setActiveTab(tab.id); }}
                            className={`flex-1 py-3 md:py-4 min-h-[48px] px-2 text-xs md:text-sm font-black flex items-center justify-center gap-2 transition-all whitespace-nowrap select-none active:bg-gray-200 ${activeTab === tab.id ? 'bg-white text-black border-b-4 border-[#8B0000]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <tab.Icon size={16} /> {tab.label}
                        </button>
                    ))}
                </div>

                {/* 内容区 */}
                <div className="flex-grow min-h-0 overflow-hidden relative bg-[#F6F7FB]">
                    {activeTab === 'PROFILES' && (
                        <HRProfiles
                            employees={employees}
                            onSave={handleSaveEmployees}
                            currentBossId={currentEmployee?.id}
                            currentEmployee={currentEmployee}
                            isSuperAdminMode={isSuperAdminMode}
                            initialSelectedEmployeeId={focusedEmployeeId}
                            clearInitialSelectedEmployeeId={() => setFocusedEmployeeId(null)}
                            onDetailOpenChange={setProfileOpen}
                        />
                    )}
                    {activeTab === 'PAYROLL' && (
                        <HRPayroll 
                            initialMode={payrollMode}
                            currentEmployee={currentEmployee}
                            employees={employees} 
                            onNavigateToProfile={(empId) => {
                                setFocusedEmployeeId(empId);
                                setActiveTab('PROFILES');
                            }}
                        />
                    )}
                    {activeTab === 'ROLES' && (
                        <HRRoleStandards
                            roleDefinitions={roleDefinitions}
                            roleGuides={roleGuides}
                            roleSops={roleSops}
                            employees={employees}
                            onSave={handleSaveRoleConfig}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
