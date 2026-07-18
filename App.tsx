import React, { useState, useEffect, useCallback } from 'react';
import { isFirebaseInitialized } from './firebaseConfig';
import { PortalRole, Employee, DeviceScreen } from './types';
import { Login } from './components/Login';
import { BossDashboard } from './components/BossDashboard';
import { BossPriorityDashboard } from './components/BossPriorityDashboard';
import { ManagerDashboard } from './components/AdminDashboard';
import { StaffDashboard } from './components/StaffDashboard';
import { ManagementPortal } from './components/management/ManagementPortal';
import { DeviceScreenPortal } from './components/features/device/DeviceScreenPortal';
import { LogOut, Settings, Calculator, Home, User, Sparkles, Target, Layout } from 'lucide-react';
import { StoreConfigModal } from './components/features/StoreConfigModal';
import { AIOperationsAssistant } from './components/features/AIOperationsAssistant';
import { WhatsNewModal } from './components/ui/WhatsNewModal';
import { DataManager } from './utils/dataManager';
import { APP_VERSION } from './constants/versionHistory';
import { getPortalRole } from './utils/orgAccess';
import { SystemDialogProvider } from './components/ui/SystemDialog';

// Fix #8: bossTab 明确类型，消灭 `as any` 逃脱口
// 与 ManagerDashboard 的 initialTab prop 类型保持一致
type BossTab = Parameters<typeof ManagerDashboard>[0]['initialTab'] | null;

// ─────────────────────────────────────────────────────────────────────────────
// Firebase 未初始化提示（Fix #1 前置：抽成独立组件，不再污染主组件的 Hook 顺序）
// ─────────────────────────────────────────────────────────────────────────────
const FirebaseConfigError: React.FC = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F7FB] p-4 text-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border-2 border-[#8B0000]/10">
            <div className="w-20 h-20 bg-[#8B0000]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Settings className="text-[#8B0000] w-10 h-10 animate-spin-slow" />
            </div>
            <h1 className="text-2xl font-black text-[#8B0000] mb-4 font-serif">
                配置未完成 (Config Required)
            </h1>
            <p className="text-gray-600 mb-6 leading-relaxed">
                Firebase 数据库配置未找到。请在 AI Studio 的{' '}
                <span className="font-bold text-[#8B0000]">Settings</span> 菜单中设置以下环境变量：
            </p>
            <div className="bg-gray-50 rounded-xl p-4 text-left font-mono text-xs text-gray-500 mb-6 border border-gray-200 overflow-x-auto">
                <ul className="space-y-1">
                    <li>• VITE_FIREBASE_API_KEY</li>
                    <li>• VITE_FIREBASE_AUTH_DOMAIN</li>
                    <li>• VITE_FIREBASE_PROJECT_ID</li>
                    <li>• VITE_FIREBASE_STORAGE_BUCKET</li>
                    <li>• VITE_FIREBASE_MESSAGING_SENDER_ID</li>
                    <li>• VITE_FIREBASE_APP_ID</li>
                </ul>
            </div>
            <p className="text-sm text-gray-400 italic">设置完成后，请刷新页面。</p>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// localStorage 安全读写（Fix #5）
// ─────────────────────────────────────────────────────────────────────────────
const safeStorage = {
    get: (key: string): string | null => {
        try { return localStorage.getItem(key); } catch { return null; }
    },
    set: (key: string, value: string): void => {
        try { localStorage.setItem(key, value); } catch (e) {
            console.warn(`[Storage] Failed to save "${key}":`, e);
        }
    },
    remove: (key: string): void => {
        try { localStorage.removeItem(key); } catch {}
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
    const [portalMode,      setPortalMode]      = useState<'STAFF' | 'BOSS'>(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
        return params.get('portal') === 'boss' ? 'BOSS' : 'STAFF';
    });

    const [isTVMode,        setIsTVMode]        = useState(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
        return params.get('mode') === 'tv';
    });

    const [isKitchenMode] = useState(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
        return params.get('mode') === 'kitchen';
    });

    const [isDeviceMode] = useState(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
        return params.get('mode') === 'device';
    });

    const [currentUser,     setCurrentUser]     = useState<PortalRole | null>(() => {
        const savedRole = safeStorage.get('kepong_erp_session_role');
        return savedRole ? (savedRole as PortalRole) : null;
    });

    const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(() => {
        const savedEmployee = safeStorage.get('kepong_erp_session_employee');
        if (savedEmployee) {
            try {
                return JSON.parse(savedEmployee) as Employee;
            } catch (e) {
                console.error('Failed to restore employee session', e);
            }
        }
        return null;
    });

    const [bossTab,         setBossTab]         = useState<BossTab>(null);
    const [bossHomeView,    setBossHomeView]    = useState<'PRIORITY' | 'FUNCTIONS'>('PRIORITY');
    const [isConfigOpen,    setIsConfigOpen]    = useState(false);
    const [isAiOpen,        setIsAiOpen]        = useState(false);
    const [showWhatsNew,    setShowWhatsNew]    = useState(false);
    
    // App 启动时只有两个稳定状态: BOOTING 和 READY
    const [bootStatus,      setBootStatus]      = useState<'BOOTING' | 'READY'>('BOOTING');
    const [bossActiveModal, setBossActiveModal] = useState<string>('NONE');

    // Fix #3: checkVersion 移到 useEffect 之前，避免时间死区，且用 useCallback 稳定引用
    const checkVersion = useCallback(() => {
        const lastSeen = safeStorage.get('klk_last_seen_version');
        if (lastSeen !== APP_VERSION) {
            setTimeout(() => setShowWhatsNew(true), 1000);
        }
    }, []);

    // Stable logout callback
    const handleLogout = useCallback(() => {
        console.log('🔄 User logged out. Clearing sessions.');
        setCurrentUser(null);
        setCurrentEmployee(null);
        setBossTab(null);
        safeStorage.remove('kepong_erp_session_role');
        safeStorage.remove('kepong_erp_session_employee');
    }, []);

    // Cloud session synchronization and status checking callback
    const syncEmployeePermissions = useCallback((employeeId: string, currentEmpLocal: Employee) => {
        if (!employeeId) return;
        DataManager.getEmployees()
            .then(employees => {
                const fresh = employees.find(e => e.id === employeeId);
                if (!fresh) {
                    console.log('⚠️ Employee account not found. Logging out...');
                    handleLogout();
                    return;
                }

                // If account is terminated or archived, force immediate logout
                const isStatusInvalid = fresh.status === 'TERMINATED' || fresh.isArchived === true;
                if (isStatusInvalid) {
                    console.log('⚠️ Employee status is terminated or archived. Forcing logout...');
                    handleLogout();
                    return;
                }

                const modulesChanged = JSON.stringify(fresh.allowedModules) !== JSON.stringify(currentEmpLocal.allowedModules);
                const roleChanged    = fresh.role !== currentEmpLocal.role || fresh.orgLevel !== currentEmpLocal.orgLevel || fresh.portalRoleOverride !== currentEmpLocal.portalRoleOverride;
                const nameChanged    = fresh.name !== currentEmpLocal.name || fresh.avatar !== currentEmpLocal.avatar;
                
                const profileChanged =
                    fresh.preferredLanguage !== currentEmpLocal.preferredLanguage ||
                    fresh.department !== currentEmpLocal.department ||
                    fresh.status !== currentEmpLocal.status;

                if (modulesChanged || roleChanged || nameChanged || profileChanged) {
                    console.log('🔄 Profile or permissions updated from cloud. Syncing...');
                    setCurrentEmployee(fresh);
                    safeStorage.set('kepong_erp_session_employee', JSON.stringify(fresh));

                    const newPortalRole = getPortalRole(fresh);
                    setCurrentUser(newPortalRole);
                    safeStorage.set('kepong_erp_session_role', newPortalRole);
                }
            })
            .catch(err => console.error('Cloud permissions sync failed', err));
    }, [handleLogout]);

    // Mount synchronization and READY check
    useEffect(() => {
        if (currentUser && currentEmployee) {
            syncEmployeePermissions(currentEmployee.id, currentEmployee);
        }
        checkVersion();
        setBootStatus('READY');
    }, [checkVersion, syncEmployeePermissions, currentUser, currentEmployee]);

    // Active Window/Tab Focus sync trigger
    useEffect(() => {
        if (currentEmployee) {
            const handleFocus = () => {
                console.log('📱 App window focused. Initiating background permission and status sync...');
                syncEmployeePermissions(currentEmployee.id, currentEmployee);
            };
            window.addEventListener('focus', handleFocus);
            return () => window.removeEventListener('focus', handleFocus);
        }
    }, [currentEmployee, syncEmployeePermissions]);

    // Fix #4: 监听浏览器后退键，同步 portalMode 与 URL
    useEffect(() => {
        const onPopState = () => {
            const params = new URLSearchParams(window.location.search);
            setPortalMode(params.get('portal') === 'boss' ? 'BOSS' : 'STAFF');
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // 监听全局跨模块应收账单导航 (Suppliers -> Accounts Payable)
    useEffect(() => {
        const handleNavigateAP = (e: Event) => {
            const customEvent = e as CustomEvent<{ billId?: string, company?: string, date?: string }>;
            if (customEvent.detail) {
                if (customEvent.detail.billId) {
                    localStorage.setItem('klk_ap_highlight_bill', customEvent.detail.billId);
                }
                if (customEvent.detail.company) {
                    localStorage.setItem('klk_ap_highlight_company', customEvent.detail.company);
                }
                if (customEvent.detail.date) {
                    localStorage.setItem('klk_ap_highlight_date', customEvent.detail.date);
                }
                localStorage.setItem('klk_boss_active_modal', 'AP');
                setBossTab(null);
                window.dispatchEvent(new Event('storage-sync-navigation'));
            }
        };
        window.addEventListener('erp-navigate-ap', handleNavigateAP);
        return () => window.removeEventListener('erp-navigate-ap', handleNavigateAP);
    }, []);

    // 监听 BossDashboard 内部 activeModal 的变化以隐藏底栏
    useEffect(() => {
        const handleModalChange = () => {
            if (typeof window !== 'undefined') {
                setBossActiveModal((window as any).bossActiveModal || 'NONE');
            }
        };
        window.addEventListener('boss-modal-change', handleModalChange);
        return () => window.removeEventListener('boss-modal-change', handleModalChange);
    }, []);

    // ── Fix #1: Firebase 检查移到所有 Hook 之后 ──────────────────────────────
    if (!isFirebaseInitialized) return <FirebaseConfigError />;

    if (isKitchenMode || isTVMode || isDeviceMode) {
        const requestedScreen: DeviceScreen | undefined = isKitchenMode
            ? 'KITCHEN_ALERT'
            : isTVMode
                ? 'QUEUE_DISPLAY'
                : undefined;
        return <DeviceScreenPortal requestedScreen={requestedScreen} />;
    }

    // 固定全屏品牌启动画面 (BOOTING)
    if (bootStatus === 'BOOTING') {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#F6F7FB] z-[99999]">
                <div className="flex flex-col items-center gap-5">
                    {/* 黄色品牌 Logo 容器 */}
                    <div className="w-20 h-20 bg-[#FFD200] rounded-full p-1 shadow-[0_4px_14px_0_rgba(255,210,0,0.3)] flex items-center justify-center overflow-hidden shrink-0 animate-pulse">
                        <img
                            src="https://i.imgur.com/ex06Jva.png"
                            alt="Logo"
                            className="w-full h-full object-contain"
                        />
                    </div>
                    {/* 黑色 Spinner */}
                    <div className="w-8 h-8 rounded-full border-4 border-[#111111]/10 border-t-[#111111] animate-spin" />
                    <p className="text-xs text-[#111111] font-extrabold tracking-[0.2em] uppercase font-sans">Loading</p>
                </div>
            </div>
        );
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleLogin = (role: PortalRole, employee?: Employee) => {
        setCurrentUser(role);
        safeStorage.set('kepong_erp_session_role', role); // Fix #5
        if (employee) {
            setCurrentEmployee(employee);
            safeStorage.set('kepong_erp_session_employee', JSON.stringify(employee));
            // Trigger background permission and status sync immediately
            syncEmployeePermissions(employee.id, employee);
        } else {
            setCurrentEmployee(null);
            safeStorage.remove('kepong_erp_session_employee');
        }
        setBossTab(null);
        setBossHomeView('PRIORITY');
        checkVersion();
    };

    const handleSwitchPortal = (mode: 'STAFF' | 'BOSS') => {
        setPortalMode(mode);
        const url = new URL(window.location.href);
        if (mode === 'BOSS') {
            url.searchParams.set('portal', 'boss');
        } else {
            url.searchParams.delete('portal');
        }
        // Fix #4: pushState 后浏览器后退可被 popstate 监听器捕获并同步
        window.history.pushState({}, '', url);
    };

    const handleCloseWhatsNew = () => {
        setShowWhatsNew(false);
        safeStorage.set('klk_last_seen_version', APP_VERSION);
    };

    // Fix #9: 完整处理所有角色，default 给出明确的 fallback 而非空字符串
    const getRoleName = (role: PortalRole): string => {
        switch (role) {
            case PortalRole.BOSS:
                return currentEmployee ? `${currentEmployee.name} (Owner)` : '老板 (Owner)';
            case PortalRole.MANAGEMENT:
                return currentEmployee ? `${currentEmployee.name} (Management)` : '管理层 (Management)';
            case PortalRole.STAFF:
                return currentEmployee
                    ? `${currentEmployee.name} (ID: ${currentEmployee.id})`
                    : '员工 (Staff)';
            default:
                // Fix #9: 新角色漏加时在 header 显示明显提示，而非静默空白
                return `Unknown Role (${role})`;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex flex-col relative font-sans bg-[#F6F7FB] pb-[calc(env(safe-area-inset-bottom)+4.2rem)] md:pb-0">

            {/* Header（仅登录后且在老板首页时显示，避免电脑端重复顶部栏） */}
            {currentUser === PortalRole.BOSS && !bossTab && (
                <header className="bg-gradient-to-r from-[#8B0000] via-[#A00000] to-[#8B0000] text-[#FFD700]
                                   px-4 pb-2.5 pt-[max(env(safe-area-inset-top),0.5rem)]
                                   md:px-6 md:pb-4 md:pt-[max(env(safe-area-inset-top),1rem)]
                                   hidden md:flex justify-between items-center
                                   shadow-[0_4px_14px_0_rgba(139,0,0,0.3)]
                                   z-30 sticky top-0 border-b border-[#FFD700]/30 relative">

                    {/* 背景纹理 — pointer-events-none 确保不遮挡按钮 */}
                    <div
                        className="absolute inset-0 opacity-10 pointer-events-none"
                        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}
                    />

                    {/* 左：Logo + 角色名及手机端自适应排版 */}
                    <div className="flex items-center gap-3 md:gap-4 relative z-10 w-full justify-between md:justify-start">
                        <div className="flex items-center gap-2.5 md:gap-4">
                            <div className="w-10 h-10 md:w-16 md:h-16 bg-[#8B0000] rounded-full p-1 shadow-lg
                                            border border-[#FFD700] flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                    src="https://i.imgur.com/ex06Jva.png"
                                    alt="Logo"
                                    className="w-full h-full object-contain hover:scale-110 transition-transform"
                                />
                            </div>
                            <div className="flex flex-col justify-center">
                                <h1 className="font-black text-sm md:text-2xl tracking-widest text-[#FFD700] font-serif drop-shadow-md leading-tight">
                                    御膳智控{' '}
                                    <span className="text-[9px] md:text-sm opacity-80 font-sans tracking-normal font-normal text-white">ERP</span>
                                </h1>
                                <span className="text-[9px] md:text-xs text-white/80 font-bold tracking-widest uppercase block truncate max-w-[120px] md:max-w-none">
                                    {getRoleName(currentUser)}
                                </span>
                            </div>
                        </div>

                        {/* 手机端右侧状态徽章：取代繁琐的顶部按钮，腾出双手触控极佳空间 */}
                        <div className="md:hidden flex items-center gap-1.5 bg-[#FFD700]/10 border border-[#FFD700]/30 px-2.5 py-1 rounded-full shrink-0">
                            <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            <span className="text-[9px] text-[#FFD700] font-mono tracking-widest uppercase font-black">ONLINE</span>
                        </div>
                    </div>

                    {/* 桌面端切换选项：仅老板且未进入具体子页时显示 */}
                    {currentUser === PortalRole.BOSS && !bossTab && (
                        <div className="hidden md:flex items-center gap-1 bg-black/40 p-1 rounded-full border border-[#FFD700]/25 relative z-20 mx-4 shrink-0">
                            <button
                                onClick={() => setBossHomeView('PRIORITY')}
                                className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wider transition-all duration-150 outline-none ${
                                    bossHomeView === 'PRIORITY'
                                        ? 'bg-[#FFD200] text-stone-950 shadow-[0_2px_8px_rgba(255,210,0,0.3)]'
                                        : 'text-stone-300 hover:text-[#FFD700]'
                                }`}
                            >
                                经营重点
                            </button>
                            <button
                                onClick={() => setBossHomeView('FUNCTIONS')}
                                className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wider transition-all duration-150 outline-none ${
                                    bossHomeView === 'FUNCTIONS'
                                        ? 'bg-[#FFD200] text-stone-950 shadow-[0_2px_8px_rgba(255,210,0,0.3)]'
                                        : 'text-stone-300 hover:text-[#FFD700]'
                                }`}
                            >
                                全部功能
                            </button>
                        </div>
                    )}

                    {/* 右：操作按钮 — 仅在桌面端显示，手机端移至下方触控区 */}
                    <div className="relative z-10 hidden md:flex items-center gap-1.5 md:gap-2">
                        {currentUser === PortalRole.BOSS && (
                            <>
                                <button
                                    onClick={() => setIsConfigOpen(true)}
                                    className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9
                                               text-white/80 hover:text-[#FFD700] bg-black/20 hover:bg-black/40
                                               rounded-full transition-all active:scale-95 border border-white/10"
                                    title="系统设置 (Config)"
                                >
                                    <Settings size={16} className="md:w-[18px] md:h-[18px]" />
                                </button>
                                <div className="h-5 md:h-6 w-px bg-white/20 mx-0.5 md:mx-1" />
                            </>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center justify-center gap-1.5 md:gap-2 text-[10px] md:text-xs
                                       font-bold text-white/80 hover:text-[#FFD700] bg-black/20 hover:bg-black/40
                                       px-3 py-2 md:px-4 md:py-2 rounded-full transition-all
                                       active:scale-95 border border-white/10"
                        >
                            <span className="hidden sm:inline">退出 (Logout)</span>
                            <LogOut size={14} className="md:w-4 md:h-4" />
                        </button>
                    </div>
                </header>
            )}

            <main className="flex-grow">
                {/* 未登录 */}
                {!currentUser && (
                    <Login
                        onLogin={handleLogin}
                        portalMode={portalMode}
                        onSwitchPortal={handleSwitchPortal}
                    />
                )}

                {/* Boss */}
                {currentUser === PortalRole.BOSS && (
                    <>
                        {!bossTab ? (
                            bossHomeView === 'PRIORITY' ? (
                                <BossPriorityDashboard
                                    onNavigate={tab => setBossTab(tab as BossTab)}
                                    currentEmployee={currentEmployee!}
                                    onOpenConfig={() => setIsConfigOpen(true)}
                                    onLogout={handleLogout}
                                />
                            ) : (
                                <BossDashboard
                                    onNavigate={tab => setBossTab(tab as BossTab)}
                                    currentEmployee={currentEmployee}
                                    onOpenConfig={() => setIsConfigOpen(true)}
                                />
                            )
                        ) : (
                            <ManagerDashboard
                                initialTab={bossTab}
                                onBack={() => setBossTab(null)}
                                isSingleMode={true}
                                onOpenTV={() => setIsTVMode(true)}
                                currentEmployee={currentEmployee}
                                isManagementStaff={true}
                                allowedModules={currentEmployee?.allowedModules}
                            />
                        )}
                        <StoreConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} currentEmployee={currentEmployee} />
                        <AIOperationsAssistant isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
                    </>
                )}

                {/* Management Portal */}
                {currentUser === PortalRole.MANAGEMENT && currentEmployee && (
                    <ManagementPortal employee={currentEmployee} onLogout={handleLogout} />
                )}

                {/* Staff Portal */}
                {currentUser === PortalRole.STAFF && currentEmployee && (
                    <StaffDashboard employee={currentEmployee} />
                )}

                {/* WhatsNewModal */}
                {currentUser && (
                    <WhatsNewModal isOpen={showWhatsNew} onClose={handleCloseWhatsNew} />
                )}
            </main>

            {/* Mobile Bottom Navigation Bar (仅手机端 md:hidden 且登录后且在主页时显示) */}
            {currentUser && currentUser !== PortalRole.MANAGEMENT && currentUser !== PortalRole.STAFF && (currentUser !== PortalRole.BOSS || (!bossTab && bossActiveModal === 'NONE')) && !isAiOpen && !isConfigOpen && (
                <div className="md:hidden fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px]
                                bg-white/70 backdrop-blur-3xl border border-[#FFD200]/60 
                                shadow-[0_8px_30px_rgba(255,210,0,0.15)] z-[110]
                                rounded-[1.25rem] py-1 px-1.5 flex items-center">
                    <div className="w-full">
                        {/* Cozy Navigation Buttons (Human-friendly warm colors, elegant typography, high touch targets) */}
                        <div className="flex justify-between items-center w-full px-2">
                            {currentUser === PortalRole.BOSS ? (
                                <>
                                    {/* 重点 */}
                                    <button
                                        onClick={() => {
                                            setBossTab(null);
                                            setBossHomeView('PRIORITY');
                                        }}
                                        className={`flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl transition-all active:scale-95 shrink-0 ${
                                            !bossTab && bossHomeView === 'PRIORITY'
                                                ? 'text-amber-600'
                                                : 'text-stone-400 active:text-stone-750'
                                        }`}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-all ${!bossTab && bossHomeView === 'PRIORITY' ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-100'}`}>
                                            <Target size={16} className={!bossTab && bossHomeView === 'PRIORITY' ? 'text-amber-600' : ''} />
                                        </div>
                                        <span className={`text-[8.5px] tracking-wider font-extrabold ${!bossTab && bossHomeView === 'PRIORITY' ? 'text-amber-600 font-black' : ''}`}>重点</span>
                                    </button>

                                    {/* 全部功能 */}
                                    <button
                                        onClick={() => {
                                            setBossTab(null);
                                            setBossHomeView('FUNCTIONS');
                                        }}
                                        className={`flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl transition-all active:scale-95 shrink-0 ${
                                            !bossTab && bossHomeView === 'FUNCTIONS'
                                                ? 'text-amber-600'
                                                : 'text-stone-400 active:text-stone-750'
                                        }`}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-all ${!bossTab && bossHomeView === 'FUNCTIONS' ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-100'}`}>
                                            <Layout size={16} className={!bossTab && bossHomeView === 'FUNCTIONS' ? 'text-amber-600' : ''} />
                                        </div>
                                        <span className={`text-[8.5px] tracking-wider font-extrabold ${!bossTab && bossHomeView === 'FUNCTIONS' ? 'text-amber-600 font-black' : ''}`}>全部功能</span>
                                    </button>

                                    {/* AI智脑 */}
                                    <button
                                        onClick={() => setIsAiOpen(true)}
                                        className={`flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl transition-all active:scale-95 shrink-0 ${
                                            isAiOpen
                                                ? 'text-amber-600'
                                                : 'text-stone-400 active:text-stone-750'
                                        }`}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-all ${isAiOpen ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-100'}`}>
                                            <Sparkles size={16} className="text-amber-500 animate-pulse" />
                                        </div>
                                        <span className={`text-[8.5px] tracking-wider font-extrabold ${isAiOpen ? 'text-amber-600 font-black' : ''}`}>AI智脑</span>
                                    </button>

                                    {/* 我的 */}
                                    <button
                                        onClick={() => setIsConfigOpen(true)}
                                        className="flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl text-stone-400 active:text-amber-600 active:scale-95 transition-all shrink-0"
                                    >
                                        <div className="p-1.5 rounded-lg active:bg-stone-100">
                                            <User size={16} />
                                        </div>
                                        <span className="text-[8.5px] tracking-wider font-extrabold">我的</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    {/* 员工及管理层简化底栏：既保证系统一致性，又避开误操作 */}
                                    <div className="text-[10px] font-bold tracking-widest text-stone-600 uppercase font-serif py-1 px-1 truncate flex-grow text-center">
                                        👑 御膳智慧餐饮治理系统
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-1 bg-rose-500/10 text-rose-600 border border-rose-500/20 px-2.5 py-1 rounded-full text-[9px] font-black active:scale-95 active:bg-rose-500/20 transition-all outline-none"
                                    >
                                        <LogOut size={11} />
                                        <span>安全退出</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
