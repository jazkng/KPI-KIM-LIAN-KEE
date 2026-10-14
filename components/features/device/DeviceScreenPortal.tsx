import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    ChefHat,
    Eye,
    EyeOff,
    Home,
    KeyRound,
    ListOrdered,
    Loader2,
    LogOut,
    MonitorSmartphone,
    RefreshCw,
    Settings,
    ShieldCheck,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import { DeviceScreen, DeviceSession, DeviceAccount } from '../../../types';
import {
    DeviceAccountAuthError,
    DeviceAccountService,
} from '../../../utils/deviceAccountService';
import { currentSignedInDeviceId, deviceLogin, fetchLoginDevices, serverAuthEnabled, serverSignOut } from '../../../utils/auth/serverAuth';
import { QueueDisplay } from '../../QueueDisplay';

const SESSION_STORAGE_KEY = 'klk_device_session_v2';

type PortalStatus = 'CHECKING' | 'LOGIN' | 'READY' | 'VERIFY_ERROR';

interface DeviceScreenPortalProps {
    requestedScreen?: DeviceScreen;
}

const SCREEN_META: Record<DeviceScreen, {
    label: string;
    shortLabel: string;
    Icon: typeof ChefHat;
}> = {
    // 已在 V2 停用：保留名称只为了辨识旧设备户口
    KITCHEN_ALERT: {
        label: '厨房急单荧幕（已停用）',
        shortLabel: '厨房急单（停用）',
        Icon: ChefHat,
    },
    QUEUE_DISPLAY: {
        label: '等待／叫号荧幕',
        shortLabel: '等待叫号',
        Icon: ListOrdered,
    },
};

const safeStorage = {
    get(): DeviceSession | null {
        try {
            const raw = localStorage.getItem(SESSION_STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw) as DeviceSession;
        } catch {
            return null;
        }
    },
    set(session: DeviceSession): void {
        try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)); } catch {}
    },
    remove(): void {
        try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
    },
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return '设备登录失败，请检查网络后再试';
};

const updateModeUrl = (screen: DeviceScreen) => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', DeviceAccountService.getScreenMode(screen));
    window.history.replaceState({}, '', url);
};

export const DeviceScreenPortal: React.FC<DeviceScreenPortalProps> = ({ requestedScreen }) => {
    const [status, setStatus] = useState<PortalStatus>('CHECKING');
    const [session, setSession] = useState<DeviceSession | null>(null);
    const [activeScreen, setActiveScreen] = useState<DeviceScreen>(requestedScreen || 'QUEUE_DISPLAY');
    const [deviceCode, setDeviceCode] = useState('');
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [connectionOnline, setConnectionOnline] = useState(navigator.onLine);
    const [menuOpen, setMenuOpen] = useState(false);
    const [allDevices, setAllDevices] = useState<DeviceAccount[]>([]);
    const [, setLoadingDevices] = useState(false);

    const enterScreen = useCallback((nextSession: DeviceSession, preferred?: DeviceScreen) => {
        const target = preferred && nextSession.allowedScreens.includes(preferred)
            ? preferred
            : nextSession.defaultScreen;
        setSession(nextSession);
        setActiveScreen(target);
        setStatus('READY');
        setErrorMessage('');
        updateModeUrl(target);
    }, []);

    const clearSession = useCallback((reason = '') => {
        safeStorage.remove();
        // CHG-05b：服务端登录时一并登出设备身份
        void serverAuthEnabled.then(enabled => { if (enabled) void serverSignOut(); });
        setSession(null);
        setMenuOpen(false);
        setPin('');
        setErrorMessage(reason);
        setStatus('LOGIN');
    }, []);

    const restoreSession = useCallback(async () => {
        const savedSession = safeStorage.get();
        if (!savedSession) {
            setStatus('LOGIN');
            return;
        }

        setStatus('CHECKING');
        setErrorMessage('');
        try {
            // CHG-05b：服务端登录开通时，Firebase 设备身份必须就是本机记住的设备，否则重新登录
            if (await serverAuthEnabled && (await currentSignedInDeviceId()) !== savedSession.deviceId) {
                clearSession('请重新登录设备');
                return;
            }
            const account = await DeviceAccountService.validateSession(savedSession);
            const refreshedSession: DeviceSession = {
                ...savedSession,
                deviceCode: account.deviceCode,
                deviceName: account.deviceName,
                storeId: account.storeId,
                allowedScreens: account.allowedScreens,
                defaultScreen: account.defaultScreen,
                sessionVersion: account.sessionVersion,
            };
            safeStorage.set(refreshedSession);
            enterScreen(refreshedSession, requestedScreen);
        } catch (error) {
            if (error instanceof DeviceAccountAuthError) {
                clearSession(error.message);
            } else {
                setErrorMessage('暂时无法验证设备，请检查网络连接后重试。');
                setStatus('VERIFY_ERROR');
            }
        }
    }, [clearSession, enterScreen, requestedScreen]);

    useEffect(() => {
        void restoreSession();
    }, [restoreSession]);

    useEffect(() => {
        if (status !== 'LOGIN') return;
        setLoadingDevices(true);
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        const subscribeLegacy = () => DeviceAccountService.subscribeDeviceAccounts(
            devices => {
                const active = devices.filter(d => d.status === 'ACTIVE');
                setAllDevices(active);
                setLoadingDevices(false);
            },
            {
                storeId: 'KEPONG',
                onError: (err) => {
                    console.error('Failed to subscribe device accounts:', err);
                    setLoadingDevices(false);
                }
            }
        );
        void serverAuthEnabled.then(enabled => {
            if (cancelled) return;
            if (!enabled) { unsubscribe = subscribeLegacy(); return; }
            // CHG-05b：登录前不读 Firestore，名单由服务端提供（不含 PIN 哈希）
            fetchLoginDevices('KEPONG')
                .then(devices => { if (!cancelled) setAllDevices(devices); })
                .catch(err => console.error('Failed to load devices:', err))
                .finally(() => { if (!cancelled) setLoadingDevices(false); });
        });
        return () => { cancelled = true; unsubscribe?.(); };
    }, [status]);

    // 👑 用 ref 保存最新 session。effect 若直接依赖 session 物件，
    //    回呼里 setSession 换新物件 → effect 重跑 → 重新订阅 → 又收到一次快照 → 再 setSession…
    //    每绕一圈就多一次 Firestore 读取，这就是 device_accounts 读写暴量的放大器。
    const sessionRef = useRef<DeviceSession | null>(null);
    useEffect(() => { sessionRef.current = session; }, [session]);

    // 👑 写 localStorage 移到独立 effect，不要放在 setSession 的 updater 里（updater 必须是纯函数）
    useEffect(() => {
        if (session) safeStorage.set(session);
    }, [session]);

    // 👑 只在「真的换了设备 / 换了会话版本 / 换了 token」时才重新订阅
    const subscribedDeviceId = session?.deviceId;
    const subscribedVersion = session?.sessionVersion;
    const subscribedToken = session?.sessionToken;

    useEffect(() => {
        if (status !== 'READY') return;
        const activeSession = sessionRef.current;
        if (!activeSession) return;

        return DeviceAccountService.subscribeSession(
            activeSession,
            account => {
                setConnectionOnline(navigator.onLine);
                setSession(current => {
                    if (!current || current.deviceId !== activeSession.deviceId) return current;
                    const screensUnchanged = current.allowedScreens.length === account.allowedScreens.length
                        && current.allowedScreens.every((screen, index) => screen === account.allowedScreens[index]);
                    if (
                        current.deviceCode === account.deviceCode
                        && current.deviceName === account.deviceName
                        && current.storeId === account.storeId
                        && current.defaultScreen === account.defaultScreen
                        && current.sessionVersion === account.sessionVersion
                        && screensUnchanged
                    ) {
                        return current;
                    }
                    return {
                        ...current,
                        deviceCode: account.deviceCode,
                        deviceName: account.deviceName,
                        storeId: account.storeId,
                        allowedScreens: account.allowedScreens,
                        defaultScreen: account.defaultScreen,
                        sessionVersion: account.sessionVersion,
                    };
                });
            },
            error => {
                if (error instanceof DeviceAccountAuthError) {
                    clearSession(error.message);
                } else {
                    console.error('Device session subscription failed:', error);
                    setConnectionOnline(false);
                }
            },
        );
    }, [clearSession, status, subscribedDeviceId, subscribedVersion, subscribedToken]);

    useEffect(() => {
        if (status !== 'READY' || !session || session.allowedScreens.includes(activeScreen)) return;
        const fallbackScreen = session.allowedScreens.includes(session.defaultScreen)
            ? session.defaultScreen
            : session.allowedScreens[0];
        if (!fallbackScreen) {
            clearSession('这个设备没有可使用的画面，请联系管理员。');
            return;
        }
        setActiveScreen(fallbackScreen);
        updateModeUrl(fallbackScreen);
    }, [activeScreen, clearSession, session, status]);

    useEffect(() => {
        const handleOnline = () => setConnectionOnline(true);
        const handleOffline = () => setConnectionOnline(false);

        setConnectionOnline(navigator.onLine);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleLogin = async () => {
        if (!deviceCode.trim()) {
            setErrorMessage('请输入设备编号');
            return;
        }
        if (!/^\d{4,8}$/.test(pin)) {
            setErrorMessage('设备 PIN 必须是 4 至 8 位数字');
            return;
        }

        setSubmitting(true);
        setErrorMessage('');
        try {
            const nextSession = (await serverAuthEnabled)
                ? await deviceLogin(deviceCode, pin)
                : await DeviceAccountService.authenticate(deviceCode, pin);
            safeStorage.set(nextSession);
            enterScreen(nextSession, requestedScreen);
            setPin('');
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setSubmitting(false);
        }
    };

    const switchScreen = (screen: DeviceScreen) => {
        if (!session?.allowedScreens.includes(screen)) return;
        setActiveScreen(screen);
        setMenuOpen(false);
        updateModeUrl(screen);
    };

    const returnToMainLogin = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('mode');
        window.location.assign(url.toString());
    };

    if (status === 'CHECKING') {
        return (
            <div className="min-h-screen bg-[#111111] text-white flex flex-col items-center justify-center px-5 text-center">
                <div className="w-20 h-20 rounded-[1.6rem] bg-[#FFD200] text-black flex items-center justify-center shadow-[0_15px_45px_rgba(255,210,0,0.32)]">
                    <MonitorSmartphone size={42} />
                </div>
                <Loader2 size={30} className="animate-spin text-[#FFD200] mt-7" />
                <p className="font-black text-lg mt-4">正在验证设备户口</p>
                <p className="text-sm text-stone-400 font-bold mt-1">Checking device session...</p>
            </div>
        );
    }

    if (status === 'VERIFY_ERROR') {
        return (
            <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center px-4 py-8 safe-area-top safe-area-bottom">
                <div className="w-full max-w-md rounded-[2rem] bg-white text-[#111111] p-6 md:p-8 shadow-2xl text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-red-100 text-red-700 flex items-center justify-center"><WifiOff size={32} /></div>
                    <h1 className="text-2xl font-black mt-5">设备验证暂时失败</h1>
                    <p className="text-sm text-stone-500 font-bold leading-6 mt-2">{errorMessage}</p>
                    <button onClick={() => void restoreSession()} className="w-full min-h-14 mt-6 rounded-2xl bg-[#FFD200] font-black flex items-center justify-center gap-2">
                        <RefreshCw size={18} /> 重新验证
                    </button>
                    <button onClick={() => clearSession()} className="w-full min-h-12 mt-2 rounded-2xl text-stone-500 font-black">改用其他设备户口</button>
                </div>
            </div>
        );
    }

    if (status === 'LOGIN') {
        const requestedMeta = SCREEN_META[requestedScreen || 'QUEUE_DISPLAY'];
        return (
            <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center px-4 py-8 safe-area-top safe-area-bottom">
                <div className="w-full max-w-lg rounded-[2rem] bg-white text-[#111111] p-6 md:p-9 shadow-2xl border border-white/10">
                    <div className="flex items-start justify-between gap-4">
                        <div className="w-20 h-20 rounded-[1.6rem] bg-[#FFD200] flex items-center justify-center shadow-[0_12px_35px_rgba(255,210,0,0.35)]">
                            <MonitorSmartphone size={42} strokeWidth={2.4} />
                        </div>
                        <span className="rounded-full bg-emerald-50 text-emerald-800 px-3 py-1.5 text-[10px] font-black flex items-center gap-1.5">
                            <ShieldCheck size={13} /> 专用设备
                        </span>
                    </div>

                    <p className="text-xs font-black tracking-[0.24em] text-stone-400 uppercase mt-6 mb-2">Kim Lian Kee · Device Access</p>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight">设备户口登录</h1>
                    <p className="mt-2 text-sm text-stone-500 font-semibold">Device Account Login</p>

                    <div className="mt-6 rounded-2xl bg-[#FFF8D6] border border-[#FFD200]/50 p-4 flex items-center gap-3">
                        <requestedMeta.Icon className="text-amber-700 shrink-0" size={23} />
                        <div>
                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">准备进入</p>
                            <p className="font-black text-stone-800 mt-0.5">{requestedMeta.label}</p>
                        </div>
                    </div>

                    {/* Active Device Quick Selector */}
                    {allDevices.length > 0 && (
                        <div className="mt-6 p-4 rounded-2xl bg-stone-50 border border-stone-200">
                            <span className="block text-xs font-black text-stone-500 uppercase tracking-[0.1em] mb-2.5">
                                快捷选择设备 ID (Select Device ID)
                            </span>
                            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                                {allDevices.map(device => {
                                    const isSelected = deviceCode === device.deviceCode;
                                    return (
                                        <button
                                            key={device.id}
                                            type="button"
                                            onClick={() => setDeviceCode(device.deviceCode)}
                                            className={`p-2.5 rounded-xl border text-left flex flex-col transition-all active:scale-95 ${
                                                isSelected
                                                    ? 'border-[#FFD200] bg-amber-50/70 text-amber-900 ring-2 ring-[#FFD200]'
                                                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                                            }`}
                                        >
                                            <span className="font-black text-xs truncate w-full">{device.deviceName}</span>
                                            <span className="font-mono text-[10px] text-stone-500 truncate w-full mt-0.5">{device.deviceCode}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <label className="block mt-6">
                        <span className="block text-sm font-black mb-2">设备编号 / 登入 ID</span>
                        <div className="relative">
                            <MonitorSmartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={21} />
                            <input
                                value={deviceCode}
                                onChange={event => setDeviceCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40))}
                                onKeyDown={event => { if (event.key === 'Enter') void handleLogin(); }}
                                autoCapitalize="characters"
                                autoComplete="username"
                                placeholder="请输入登入 ID，例如 KITCHEN-01"
                                className="w-full h-14 rounded-2xl border-2 border-stone-200 bg-stone-50 pl-12 pr-4 text-base font-black font-mono uppercase outline-none focus:border-[#FFD200] focus:bg-white transition-colors"
                            />
                        </div>
                    </label>

                    <label className="block mt-4">
                        <span className="block text-sm font-black mb-2">设备 PIN</span>
                        <div className="relative">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={21} />
                            <input
                                type={showPin ? 'text' : 'password'}
                                inputMode="numeric"
                                autoComplete="current-password"
                                value={pin}
                                onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                                onKeyDown={event => { if (event.key === 'Enter') void handleLogin(); }}
                                placeholder="4 至 8 位数字"
                                className="w-full h-14 rounded-2xl border-2 border-stone-200 bg-stone-50 pl-12 pr-14 text-base font-black tracking-[0.2em] outline-none focus:border-[#FFD200] focus:bg-white transition-colors"
                            />
                            <button type="button" onClick={() => setShowPin(previous => !previous)} className="absolute right-1 top-1 min-w-[48px] min-h-[48px] flex items-center justify-center text-stone-500" aria-label={showPin ? '隐藏 PIN' : '显示 PIN'}>
                                {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </label>

                    {errorMessage && (
                        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700 flex items-start gap-2">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" /> {errorMessage}
                        </div>
                    )}

                    <button
                        onClick={() => void handleLogin()}
                        disabled={submitting}
                        className="mt-6 w-full min-h-14 rounded-2xl bg-[#FFD200] text-[#111111] px-5 py-4 text-base font-black shadow-[0_10px_24px_rgba(255,210,0,0.28)] hover:bg-[#E9C000] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {submitting ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
                        {submitting ? '正在验证...' : '登录并进入荧幕'}
                    </button>

                    <button onClick={returnToMainLogin} className="w-full min-h-12 mt-2 rounded-2xl text-stone-500 font-black text-sm flex items-center justify-center gap-2">
                        <Home size={16} /> 返回员工／老板登录
                    </button>
                    <p className="mt-3 text-center text-[11px] text-stone-400 font-semibold">设备编号与 PIN 由老板在人事中心 → 设备户口建立。</p>
                </div>
            </div>
        );
    }

    if (!session) return null;

    return (
        <div className="relative min-h-screen">
            {activeScreen === 'KITCHEN_ALERT' ? (
                // 厨房急单荧幕已在 V2 停用；资料与设备户口保留，只是不再显示
                <div className="flex min-h-screen items-center justify-center bg-[#111111] px-6 text-center text-white">
                    <div className="max-w-md space-y-3">
                        <ChefHat size={48} className="mx-auto text-stone-500" />
                        <p className="text-xl font-black">厨房急单荧幕已停用</p>
                        <p className="text-sm text-stone-400">此功能在 ERP V2 不再提供。若这台设备也能显示等待／叫号，请在下方切换；否则请联络负责人。</p>
                        {session.allowedScreens.includes('QUEUE_DISPLAY') && (
                            <button onClick={() => setActiveScreen('QUEUE_DISPLAY')} className="mt-2 min-h-12 rounded-2xl bg-[#FFD200] px-5 font-black text-[#111111]">切换到等待／叫号荧幕</button>
                        )}
                    </div>
                </div>
            ) : <QueueDisplay />}

            {!connectionOnline && (
                <div className="fixed top-[max(env(safe-area-inset-top),0.5rem)] left-1/2 -translate-x-1/2 z-[600] rounded-full bg-red-700 text-white px-4 py-2 text-xs font-black shadow-xl flex items-center gap-2">
                    <WifiOff size={15} /> 网络已中断，恢复后自动连接
                </div>
            )}

            <button
                onClick={() => setMenuOpen(previous => !previous)}
                className="fixed right-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-[610] min-w-[46px] min-h-[46px] rounded-full bg-black/80 text-white border border-white/20 shadow-2xl backdrop-blur flex items-center justify-center hover:bg-black"
                title="设备设置"
            >
                {connectionOnline ? <Settings size={20} /> : <WifiOff size={20} className="text-red-300" />}
            </button>

            {menuOpen && (
                <div className="fixed inset-0 z-[620] bg-black/40 backdrop-blur-[2px]" onMouseDown={event => {
                    if (event.currentTarget === event.target) setMenuOpen(false);
                }}>
                    <div className="absolute right-3 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+3.5rem)] w-[min(92vw,360px)] rounded-3xl bg-white text-[#111111] shadow-2xl border overflow-hidden">
                        <div className="bg-[#111111] text-white px-5 py-4 flex items-start justify-between gap-3 border-b-4 border-[#FFD200]">
                            <div className="min-w-0">
                                <p className="font-black truncate">{session.deviceName}</p>
                                <p className="font-mono text-[11px] text-stone-400 font-bold mt-1">{session.deviceCode}</p>
                            </div>
                            <button onClick={() => setMenuOpen(false)} className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center hover:bg-white/10"><X size={18} /></button>
                        </div>

                        <div className="p-4">
                            <div className={`rounded-xl px-3 py-2.5 text-xs font-black flex items-center gap-2 ${connectionOnline ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                                {connectionOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                                {connectionOnline ? '网络正常 · 会话已验证' : '网络中断 · 恢复后自动连接'}
                            </div>

                            {session.allowedScreens.length > 1 && (
                                <div className="mt-4">
                                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-2">切换画面</p>
                                    <div className="space-y-2">
                                        {session.allowedScreens.map(screen => {
                                            const meta = SCREEN_META[screen];
                                            const selected = screen === activeScreen;
                                            return (
                                                <button key={screen} onClick={() => switchScreen(screen)} className={`w-full min-h-[46px] rounded-xl px-3 font-black text-sm flex items-center gap-3 border-2 ${selected ? 'border-[#FFD200] bg-yellow-50' : 'border-stone-200'}`}>
                                                    <meta.Icon size={18} />
                                                    <span className="flex-1 text-left">{meta.label}</span>
                                                    {selected && <span className="text-[10px] text-amber-700">使用中</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <button onClick={() => clearSession('设备已经退出，请重新登录。')} className="w-full min-h-[48px] mt-4 rounded-xl bg-red-50 text-red-800 font-black flex items-center justify-center gap-2">
                                <LogOut size={17} /> 退出此设备
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};