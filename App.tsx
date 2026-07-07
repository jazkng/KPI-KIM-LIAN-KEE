import React, { useState, useEffect, useCallback } from 'react';
import { isFirebaseInitialized } from './firebaseConfig';
import { UserRole, Employee } from './types';
import { Login } from './components/Login';
import { BossDashboard } from './components/BossDashboard';
import { ManagerDashboard } from './components/AdminDashboard';
import { StaffDashboard } from './components/StaffDashboard';
import { QueueDisplay } from './components/QueueDisplay';
import { LogOut, Settings, Calculator, Home, User, Sparkles } from 'lucide-react';
import { StoreConfigModal } from './components/features/StoreConfigModal';
import { AIOperationsAssistant } from './components/features/AIOperationsAssistant';
import { WhatsNewModal } from './components/ui/WhatsNewModal';
import { DataManager } from './utils/dataManager';
import { APP_VERSION } from './constants/versionHistory';

// Fix #8: bossTab 明确类型，消灭 `as any` 逃脱口
// 与 ManagerDashboard 的 initialTab prop 类型保持一致
type BossTab = Parameters<typeof ManagerDashboard>[0]['initialTab'] | null;

// ─────────────────────────────────────────────────────────────────────────────
// Firebase 未初始化提示（Fix #1 前置：抽成独立组件，不再污染主组件的 Hook 顺序）
// ─────────────────────────────────────────────────────────────────────────────
const FirebaseConfigError: React.FC = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8F8] p-4 text-center">
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
    const [currentUser,     setCurrentUser]     = useState<UserRole | null>(null);
    const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
    const [bossTab,         setBossTab]         = useState<BossTab>(null);
    const [isTVMode,        setIsTVMode]        = useState(false);
    const [isConfigOpen,    setIsConfigOpen]    = useState(false);
    const [isAiOpen,        setIsAiOpen]        = useState(false);
    const [portalMode,      setPortalMode]      = useState<'STAFF' | 'BOSS'>('STAFF');
    const [showWhatsNew,    setShowWhatsNew]    = useState(false);
    // Fix #6: 会话恢复期间显示 loading，防止用旧数据渲染
    const [sessionLoading,  setSessionLoading]  = useState(true);
    const [bossActiveModal, setBossActiveModal] = useState<string>('NONE');

    // Fix #3: checkVersion 移到 useEffect 之前，避免时间死区，且用 useCallback 稳定引用
    const checkVersion = useCallback(() => {
        const lastSeen = safeStorage.get('klk_last_seen_version');
        if (lastSeen !== APP_VERSION) {
            setTimeout(() => setShowWhatsNew(true), 1000);
        }
    }, []);

    // Fix #1: useEffect 无条件放在所有 Hook 之后，不再出现在条件 return 之前
    // Fix #2: isMounted 守卫，防止异步回调在卸载后 setState
    // Fix #3: checkVersion 加入依赖数组
    useEffect(() => {
        let isMounted = true;

        const params = new URLSearchParams(window.location.search);
        if (params.get('portal') === 'boss') setPortalMode('BOSS');
        if (params.get('mode')   === 'tv')   setIsTVMode(true);

        const savedRole     = safeStorage.get('kepong_erp_session_role');
        const savedEmployee = safeStorage.get('kepong_erp_session_employee');

        if (!savedRole) {
            setSessionLoading(false);
            return;
        }

        setCurrentUser(savedRole as UserRole);

        if (savedEmployee) {
            try {
                const parsedEmp: Employee = JSON.parse(savedEmployee);
                if (isMounted) setCurrentEmployee(parsedEmp);

                // 后台静默同步最新权限
                DataManager.getEmployees()
                    .then(employees => {
                        if (!isMounted) return; // Fix #2
                        const fresh = employees.find(e => e.id === parsedEmp.id);
                        if (fresh) {
                            const modulesChanged = JSON.stringify(fresh.allowedModules) !== JSON.stringify(parsedEmp.allowedModules);
                            const roleChanged    = fresh.role !== parsedEmp.role;
                            if (modulesChanged || roleChanged) {
                                console.log('🔄 Permissions updated from cloud. Syncing...');
                                setCurrentEmployee(fresh);
                                safeStorage.set('kepong_erp_session_employee', JSON.stringify(fresh));
                            }
                        }
                    })
                    .catch(err => console.error('Background sync failed', err))
                    .finally(() => { if (isMounted) setSessionLoading(false); });

            } catch (e) {
                console.error('Failed to restore employee session', e);
                if (isMounted) setSessionLoading(false);
            }
        } else {
            setSessionLoading(false);
        }

        checkVersion();
        return () => { isMounted = false; };
    }, [checkVersion]);

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

    if (isTVMode) return <QueueDisplay />;

    // Fix #6: 会话恢复中，渲染最小占位，防止闪烁旧界面
    if (sessionLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FFF8F8]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-4 border-[#8B0000]/20 border-t-[#8B0000] animate-spin" />
                    <p className="text-sm text-gray-400 font-bold tracking-widest uppercase">Loading...</p>
                </div>
            </div>
        );
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleLogin = (role: UserRole, employee?: Employee) => {
        setCurrentUser(role);
        safeStorage.set('kepong_erp_session_role', role); // Fix #5
        if (employee) {
            setCurrentEmployee(employee);
            safeStorage.set('kepong_erp_session_employee', JSON.stringify(employee));
        } else {
            setCurrentEmployee(null);
            safeStorage.remove('kepong_erp_session_employee');
        }
        setBossTab(null);
        checkVersion();
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setCurrentEmployee(null);
        setBossTab(null);
        safeStorage.remove('kepong_erp_session_role');
        safeStorage.remove('kepong_erp_session_employee');
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
    const getRoleName = (role: UserRole): string => {
        switch (role) {
            case UserRole.BOSS:
                return currentEmployee ? `${currentEmployee.name} (Owner)` : '老板 (Owner)';
            case UserRole.MANAGEMENT:
                return currentEmployee ? `${currentEmployee.name} (Management)` : '管理层 (Management)';
            case UserRole.STAFF:
                return currentEmployee
                    ? `${currentEmployee.name} (ID: ${currentEmployee.id})`
                    : '员工 (Staff)';
            default:
                // Fix #9: 新角色漏加时在 header 显示明显提示，而非静默空白
                return `Unknown Role (${role})`;
        }
    };

    // Fix #7: MANAGEMENT 与 STAFF 合并为一个分支
    const isStaffOrManagement =
        (currentUser === UserRole.MANAGEMENT || currentUser === UserRole.STAFF) && !!currentEmployee;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex flex-col relative font-sans bg-[#FFF8F8] pb-[calc(env(safe-area-inset-bottom)+4.2rem)] md:pb-0">

            {/* Header（仅登录后显示） */}
            {currentUser && (
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

                    {/* 右：操作按钮 — 仅在桌面端显示，手机端移至下方触控区 */}
                    <div className="relative z-10 hidden md:flex items-center gap-1.5 md:gap-2">
                        {currentUser === UserRole.BOSS && (
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
                {currentUser === UserRole.BOSS && (
                    <>
                        {!bossTab ? (
                            <BossDashboard
                                onNavigate={tab => setBossTab(tab as BossTab)}
                                currentEmployee={currentEmployee}
                                onOpenConfig={() => setIsConfigOpen(true)}
                            />
                        ) : (
                            <ManagerDashboard
                                initialTab={bossTab}
                                onBack={() => setBossTab(null)}
                                isSingleMode={true}
                                onOpenTV={() => setIsTVMode(true)}
                                currentEmployee={currentEmployee}
                            />
                        )}
                        <StoreConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} currentEmployee={currentEmployee} />
                        <AIOperationsAssistant isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
                    </>
                )}

                {/* Staff / Management */}
                {isStaffOrManagement && (
                    <StaffDashboard employee={currentEmployee!} />
                )}

                {/* WhatsNewModal */}
                {currentUser && (
                    <WhatsNewModal isOpen={showWhatsNew} onClose={handleCloseWhatsNew} />
                )}
            </main>

            {/* Mobile Bottom Navigation Bar (仅手机端 md:hidden 且登录后且在主页时显示) */}
            {currentUser && (currentUser !== UserRole.BOSS || (!bossTab && bossActiveModal === 'NONE')) && !isAiOpen && !isConfigOpen && (
                <div className="md:hidden fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px]
                                bg-white/70 backdrop-blur-3xl border border-white/50 
                                shadow-[0_8px_30px_rgba(0,0,0,0.06)] z-[110]
                                rounded-[1.25rem] py-1 px-1.5 flex items-center">
                    <div className="w-full">
                        {/* Cozy Navigation Buttons (Human-friendly warm colors, elegant typography, high touch targets) */}
                        <div className="flex justify-between items-center w-full">
                            {/* 账户名字模块 (放在最左端，LOGO和Online都去掉了，避免极其狭窄手机端挤压导致显示不全) */}
                            <div className="hidden min-[375px]:flex items-center gap-1 py-0.5 px-1 border-r border-stone-200/50 pr-2 select-none shrink-0">
                                <div className="w-5.5 h-5.5 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 border border-stone-200">
                                    <User size={11} />
                                </div>
                                <div className="flex flex-col items-start leading-[1.1]">
                                    <span className="text-[9px] text-stone-800 font-extrabold truncate max-w-[40px]">
                                        {currentUser === UserRole.BOSS ? 'JAKE' : (currentEmployee?.name || '员工')}
                                    </span>
                                    <span className="text-[7.5px] text-stone-400 font-bold">
                                        {currentUser === UserRole.BOSS ? '老板' : getRoleName(currentUser)}
                                    </span>
                                </div>
                            </div>

                            {currentUser === UserRole.BOSS ? (
                                <>
                                    {/* 首页/全功能看板 */}
                                    <button
                                        onClick={() => setBossTab(null)}
                                        className={`flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl transition-all active:scale-95 shrink-0 ${
                                            !bossTab 
                                                ? 'text-[#8B0000]' 
                                                : 'text-stone-400 active:text-stone-750'
                                        }`}
                                    >
                                        <div className={`p-1 rounded-lg transition-all ${!bossTab ? 'bg-[#8B0000]/10 text-[#8B0000]' : 'active:bg-stone-100'}`}>
                                            <Home size={16} />
                                        </div>
                                        <span className={`text-[8.5px] tracking-wider font-extrabold ${!bossTab ? 'text-[#8B0000] font-black' : ''}`}>控制台</span>
                                    </button>

                                    {/* AI 智脑 */}
                                    <button
                                        onClick={() => setIsAiOpen(true)}
                                        className={`flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl transition-all active:scale-95 shrink-0 ${
                                            isAiOpen 
                                                ? 'text-[#8B0000]' 
                                                : 'text-stone-400 active:text-stone-750'
                                        }`}
                                    >
                                        <div className={`p-1 rounded-lg transition-all ${isAiOpen ? 'bg-[#8B0000]/10 text-[#8B0000]' : 'active:bg-stone-100'}`}>
                                            <Sparkles size={16} className="text-amber-500 animate-pulse" />
                                        </div>
                                        <span className={`text-[8.5px] tracking-wider font-extrabold ${isAiOpen ? 'text-[#8B0000] font-black' : ''}`}>AI 智脑</span>
                                    </button>

                                    {/* 账户/个人设置 */}
                                    <button
                                        onClick={() => setIsConfigOpen(true)}
                                        className="flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl text-stone-400 active:text-[#8B0000] active:scale-95 transition-all shrink-0"
                                    >
                                        <div className="p-1 rounded-lg active:bg-[#8B0000]/10">
                                            <User size={16} />
                                        </div>
                                        <span className="text-[8.5px] tracking-wider font-extrabold">账户</span>
                                    </button>

                                    {/* 退出系统 */}
                                    <button
                                        onClick={handleLogout}
                                        className="flex flex-col items-center gap-0.5 py-0.5 px-1.5 rounded-xl text-rose-500 active:text-rose-600 active:scale-95 transition-all shrink-0"
                                    >
                                        <div className="p-1 rounded-lg active:bg-rose-500/10">
                                            <LogOut size={16} />
                                        </div>
                                        <span className="text-[8.5px] tracking-wider font-extrabold text-rose-550">安全退出</span>
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