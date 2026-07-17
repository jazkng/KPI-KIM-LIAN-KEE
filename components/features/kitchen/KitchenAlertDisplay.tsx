import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BellRing,
    CalendarDays,
    CheckCircle2,
    ChefHat,
    Clock3,
    Eye,
    Flame,
    History,
    Maximize2,
    RefreshCw,
    Search,
    TimerReset,
    UserRound,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { KitchenAlert, KitchenAlertActor, KitchenAlertStatus, KitchenAlertType } from '../../../types';
import { KitchenAlertService } from '../../../utils/kitchenAlertService';
import { getBusinessDateString } from '../../../utils/dateHelper';

const STORE_ID = 'KEPONG';
const OPERATOR_STORAGE_KEY = 'klk_kitchen_display_operator';

const TYPE_META: Record<KitchenAlertType, { label: string; english: string; tone: string }> = {
    RUSH: { label: '催菜', english: 'Rush', tone: 'bg-orange-100 text-orange-800 border-orange-200' },
    MISSING: { label: '漏单', english: 'Missing', tone: 'bg-rose-100 text-rose-800 border-rose-200' },
    WRONG: { label: '做错', english: 'Wrong', tone: 'bg-violet-100 text-violet-800 border-violet-200' },
    REMAKE: { label: '重做', english: 'Remake', tone: 'bg-red-100 text-red-800 border-red-200' },
    NOTICE: { label: '注意', english: 'Notice', tone: 'bg-sky-100 text-sky-800 border-sky-200' },
};

type ConnectionState = 'CONNECTING' | 'ONLINE' | 'OFFLINE';
type DisplayView = 'ACTIVE' | 'HISTORY';
type HistoryStatusFilter = 'ALL' | KitchenAlertStatus;

const HISTORY_STATUS_META: Record<KitchenAlertStatus, { label: string; className: string }> = {
    NEW: { label: '待接收', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    ACKNOWLEDGED: { label: '处理中', className: 'bg-sky-100 text-sky-800 border-sky-200' },
    RESOLVED: { label: '已解决', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    CANCELLED: { label: '已取消', className: 'bg-stone-100 text-stone-600 border-stone-200' },
};

const safeGetOperatorName = (): string => {
    try {
        return localStorage.getItem(OPERATOR_STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

const formatClock = (date: Date): string => new Intl.DateTimeFormat('zh-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
}).format(date);

const formatCreatedTime = (isoTime: string): string => {
    const date = new Date(isoTime);
    if (Number.isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('zh-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
};

const getElapsed = (isoTime: string, now: Date): { label: string; minutes: number } => {
    const createdAt = new Date(isoTime).getTime();
    if (Number.isNaN(createdAt)) return { label: '刚刚', minutes: 0 };

    const totalMinutes = Math.max(0, Math.floor((now.getTime() - createdAt) / 60000));
    if (totalMinutes < 1) return { label: '刚刚', minutes: 0 };
    if (totalMinutes < 60) return { label: `${totalMinutes} 分钟`, minutes: totalMinutes };

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return {
        label: minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`,
        minutes: totalMinutes,
    };
};

const formatElapsedClock = (isoTime: string | undefined, now: Date): string => {
    if (!isoTime) return '00:00';
    const startedAt = new Date(isoTime).getTime();
    if (!Number.isFinite(startedAt)) return '00:00';

    const totalSeconds = Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getReadableError = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return '操作失败，请检查网络后再试。';
};

const getResolutionMinutes = (alert: KitchenAlert): number | null => {
    if (!alert.resolvedAt) return null;
    const createdAt = new Date(alert.createdAt).getTime();
    const resolvedAt = new Date(alert.resolvedAt).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(resolvedAt) || resolvedAt < createdAt) return null;
    return Math.max(0, Math.round((resolvedAt - createdAt) / 60000));
};

const formatDuration = (minutes: number | null): string => {
    if (minutes === null) return '—';
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} 小时 ${remainder} 分` : `${hours} 小时`;
};

export const KitchenAlertDisplay: React.FC = () => {
    const [alerts, setAlerts] = useState<KitchenAlert[]>([]);
    const [operatorName, setOperatorName] = useState(safeGetOperatorName);
    const [operatorDraft, setOperatorDraft] = useState(safeGetOperatorName);
    const [isStarted, setIsStarted] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
    const [workingIds, setWorkingIds] = useState<Set<string>>(() => new Set());
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [now, setNow] = useState(new Date());
    const [displayView, setDisplayView] = useState<DisplayView>('ACTIVE');
    const [historyDate, setHistoryDate] = useState(getBusinessDateString);
    const [historyRecords, setHistoryRecords] = useState<KitchenAlert[]>([]);
    const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>('ALL');
    const [historySearch, setHistorySearch] = useState('');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    const audioContextRef = useRef<AudioContext | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const previousAlertIdsRef = useRef<Set<string>>(new Set());
    const hasReceivedInitialSnapshotRef = useRef(false);
    const isStartedRef = useRef(isStarted);
    const soundEnabledRef = useRef(soundEnabled);

    useEffect(() => { isStartedRef.current = isStarted; }, [isStarted]);
    useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const getAudioContext = useCallback(async (): Promise<AudioContext | null> => {
        if (typeof window === 'undefined') return null;
        const AudioContextClass = window.AudioContext ||
            (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return null;

        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContextClass();
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    const playAlertTone = useCallback(async () => {
        const context = await getAudioContext();
        if (!context) return;

        [0, 0.24, 0.48].forEach((delay, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = index === 2 ? 'square' : 'sine';
            oscillator.frequency.setValueAtTime(index === 2 ? 1046 : 880, context.currentTime + delay);
            gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.28, context.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.18);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(context.currentTime + delay);
            oscillator.stop(context.currentTime + delay + 0.2);
        });
    }, [getAudioContext]);

    const announceAlerts = useCallback((newAlerts: KitchenAlert[]) => {
        if (!newAlerts.length || !isStartedRef.current || !soundEnabledRef.current) return;

        void playAlertTone();
        if (!('speechSynthesis' in window)) return;

        const announcement = newAlerts.slice(0, 3).map(alert => {
            const typeLabel = TYPE_META[alert.alertType]?.label || '厨房通知';
            return `${alert.tableNo}号桌，${alert.dishName}，${typeLabel}`;
        }).join('。');
        const remaining = newAlerts.length > 3 ? `。另外还有${newAlerts.length - 3}项通知` : '';
        const utterance = new SpeechSynthesisUtterance(`新厨房通知。${announcement}${remaining}`);
        utterance.lang = 'zh-HK';
        utterance.rate = 0.9;
        utterance.volume = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }, [playAlertTone]);

    useEffect(() => {
        setConnectionState(navigator.onLine ? 'CONNECTING' : 'OFFLINE');
        const unsubscribe = KitchenAlertService.subscribeActiveAlerts(
            STORE_ID,
            nextAlerts => {
                setConnectionState('ONLINE');
                setErrorMessage('');

                const nextIds = new Set(nextAlerts.map(alert => alert.id));
                if (hasReceivedInitialSnapshotRef.current) {
                    const newAlerts = nextAlerts.filter(alert => !previousAlertIdsRef.current.has(alert.id));
                    announceAlerts(newAlerts);
                } else {
                    hasReceivedInitialSnapshotRef.current = true;
                }
                previousAlertIdsRef.current = nextIds;
                setAlerts(nextAlerts);
            },
            error => {
                setConnectionState('OFFLINE');
                setErrorMessage(`无法连接厨房通知：${error.message}`);
            },
        );

        const handleOnline = () => setConnectionState('CONNECTING');
        const handleOffline = () => setConnectionState('OFFLINE');
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [announceAlerts]);

    const requestWakeLock = useCallback(async () => {
        const wakeLock = navigator.wakeLock;
        if (!wakeLock || document.visibilityState !== 'visible') return;

        try {
            if (wakeLockRef.current && !wakeLockRef.current.released) return;
            const sentinel = await wakeLock.request('screen');
            wakeLockRef.current = sentinel;
            sentinel.addEventListener('release', () => {
                if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
            });
        } catch (error) {
            console.warn('Kitchen display wake lock unavailable:', error);
        }
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isStartedRef.current) {
                void requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            void wakeLockRef.current?.release();
            wakeLockRef.current = null;
        };
    }, [requestWakeLock]);

    useEffect(() => {
        if (!successMessage) return;
        const timer = window.setTimeout(() => setSuccessMessage(''), 3500);
        return () => window.clearTimeout(timer);
    }, [successMessage]);

    const actor = useMemo<KitchenAlertActor>(() => ({
        id: 'KITCHEN_DISPLAY',
        name: operatorName.trim() || '厨房处理台',
    }), [operatorName]);

    const pendingAlerts = useMemo(
        () => alerts.filter(alert => alert.status === 'NEW'),
        [alerts],
    );
    const inProgressAlerts = useMemo(
        () => alerts.filter(alert => alert.status === 'ACKNOWLEDGED'),
        [alerts],
    );
    const urgentCount = pendingAlerts.filter(alert => alert.priority === 'URGENT').length;
    const newCount = pendingAlerts.length;
    const acknowledgedCount = inProgressAlerts.length;
    const oldestPendingAt = useMemo(() => {
        const timestamps = pendingAlerts
            .map(alert => new Date(alert.createdAt).getTime())
            .filter(Number.isFinite);
        if (!timestamps.length) return undefined;
        return new Date(Math.min(...timestamps)).toISOString();
    }, [pendingAlerts]);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const records = await KitchenAlertService.getHistory({
                storeId: STORE_ID,
                businessDate: historyDate,
                maxRecords: 500,
            });
            setHistoryRecords(records);
        } catch (error) {
            console.error('Kitchen alert history load failed:', error);
            setHistoryError('无法读取历史记录，请检查网络后再试。');
        } finally {
            setHistoryLoading(false);
        }
    }, [historyDate]);

    useEffect(() => {
        if (isStarted && displayView === 'HISTORY') void loadHistory();
    }, [displayView, isStarted, loadHistory]);

    const filteredHistoryRecords = useMemo(() => {
        const term = historySearch.trim().toLowerCase();
        return historyRecords.filter(alert => {
            if (historyStatus !== 'ALL' && alert.status !== historyStatus) return false;
            if (!term) return true;
            const searchable = [
                alert.tableNo,
                alert.orderNo,
                alert.dishName,
                alert.createdByName,
                alert.acknowledgedByName,
                alert.resolvedByName,
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(term);
        });
    }, [historyRecords, historySearch, historyStatus]);

    const historySummary = useMemo(() => {
        const resolved = historyRecords.filter(alert => alert.status === 'RESOLVED');
        const cancelled = historyRecords.filter(alert => alert.status === 'CANCELLED').length;
        const durations = resolved
            .map(getResolutionMinutes)
            .filter((value): value is number => value !== null);
        const averageMinutes = durations.length
            ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
            : null;
        return {
            total: historyRecords.length,
            resolved: resolved.length,
            cancelled,
            averageMinutes,
        };
    }, [historyRecords]);

    const handleStart = async () => {
        const cleanedName = operatorDraft.trim().replace(/\s+/g, ' ');
        if (!cleanedName) {
            setErrorMessage('请先输入厨房操作人姓名。');
            return;
        }

        try {
            localStorage.setItem(OPERATOR_STORAGE_KEY, cleanedName);
        } catch {}

        setOperatorName(cleanedName);
        setErrorMessage('');
        setIsStarted(true);
        isStartedRef.current = true;
        await getAudioContext();
        await requestWakeLock();
        void playAlertTone();
    };

    const toggleSound = async () => {
        const nextValue = !soundEnabled;
        setSoundEnabled(nextValue);
        soundEnabledRef.current = nextValue;
        if (nextValue) {
            await getAudioContext();
            void playAlertTone();
        } else if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    };

    const toggleFullscreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            console.warn('Fullscreen unavailable:', error);
        }
    };

    const setWorking = (alertId: string, isWorking: boolean) => {
        setWorkingIds(current => {
            const next = new Set(current);
            if (isWorking) next.add(alertId);
            else next.delete(alertId);
            return next;
        });
    };

    const handleAcknowledge = async (alert: KitchenAlert) => {
        setWorking(alert.id, true);
        setErrorMessage('');
        try {
            await KitchenAlertService.acknowledgeAlert(alert.id, actor);
            setSuccessMessage(`${alert.tableNo}号桌 · ${alert.dishName} 已接收处理`);
        } catch (error) {
            setErrorMessage(getReadableError(error));
        } finally {
            setWorking(alert.id, false);
        }
    };

    const handleResolve = async (alert: KitchenAlert) => {
        setWorking(alert.id, true);
        setErrorMessage('');
        try {
            await KitchenAlertService.resolveAlert(alert.id, actor);
            setSuccessMessage(`${alert.tableNo}号桌 · ${alert.dishName} 已解决，楼面会马上看到`);
        } catch (error) {
            setErrorMessage(getReadableError(error));
        } finally {
            setWorking(alert.id, false);
        }
    };

    const renderAlertCard = (alert: KitchenAlert) => {
        const isPending = alert.status === 'NEW';
        const isWorking = workingIds.has(alert.id);
        const isUrgent = alert.priority === 'URGENT';
        const waiting = getElapsed(alert.createdAt, now);
        const isOverdue = isPending && waiting.minutes >= 5;
        const isWarning = isPending && waiting.minutes >= 3;
        const typeMeta = TYPE_META[alert.alertType] || TYPE_META.NOTICE;
        const timerStart = isPending ? alert.createdAt : (alert.acknowledgedAt || alert.createdAt);
        const timerLabel = isPending ? '等待时间 / Wait Time' : '处理时间 / Process Time';
        const timerTone = isPending
            ? (isUrgent || isOverdue
                ? 'bg-red-600 text-white border-red-500'
                : isWarning
                    ? 'bg-amber-400 text-[#111111] border-amber-300'
                    : 'bg-white/8 text-white border-white/10')
            : 'bg-sky-500/15 text-sky-200 border-sky-400/25';
        const borderTone = isPending
            ? (isUrgent || isOverdue ? 'border-red-500/80' : isWarning ? 'border-amber-400/70' : 'border-[#FFD200]/45')
            : 'border-sky-400/45';

        return (
            <article
                key={alert.id}
                className={`relative overflow-hidden rounded-[1.5rem] border bg-[#1B1B1E] shadow-[0_18px_45px_rgba(0,0,0,0.24)] ${borderTone}`}
            >
                {(isUrgent || isOverdue) && isPending && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-red-500 animate-pulse" />
                )}

                <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center shrink-0 ${isPending ? 'bg-[#FFD200] text-[#111111]' : 'bg-sky-500 text-white'}`}>
                                <span className="text-[9px] font-black uppercase tracking-[0.16em] opacity-60">桌号 / Table</span>
                                <span className="max-w-[64px] truncate text-3xl sm:text-4xl font-black leading-none mt-1">{alert.tableNo}</span>
                            </div>

                            <div className="min-w-0 pt-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {isUrgent && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-white">
                                            <Flame size={12} fill="currentColor" /> 紧急 / URGENT
                                        </span>
                                    )}
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${typeMeta.tone}`}>
                                        {typeMeta.label} · {typeMeta.english}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${isPending ? 'border-[#FFD200]/30 bg-[#FFD200]/10 text-[#FFD200]' : 'border-sky-400/25 bg-sky-400/10 text-sky-200'}`}>
                                        {isPending ? <BellRing size={12} /> : <Eye size={12} />}
                                        {isPending ? '待接收 / Pending' : '处理中 / Active'}
                                    </span>
                                </div>
                                <h2 className="mt-2 text-xl sm:text-2xl font-black leading-tight text-white break-words">
                                    {alert.dishName}
                                </h2>
                                <p className="mt-1 text-xs font-bold text-stone-500 truncate">单号 / Order No. {alert.orderNo}</p>
                            </div>
                        </div>

                        <div className={`shrink-0 min-w-[88px] rounded-xl border px-2.5 py-2 text-right ${timerTone}`}>
                            <div className="text-[9px] font-black tracking-wider opacity-65">{timerLabel}</div>
                            <div className="mt-0.5 font-mono text-lg sm:text-xl font-black tabular-nums leading-none">
                                {formatElapsedClock(timerStart, now)}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2.5">
                            <div className="text-[9px] font-black tracking-wider text-stone-500">数量 / QTY</div>
                            <div className="mt-0.5 text-xl font-black text-white">× {alert.quantity}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2.5">
                            <div className="text-[9px] font-black tracking-wider text-stone-500">大小 / SIZE</div>
                            <div className="mt-1 truncate text-sm font-black text-stone-200">{alert.size || '—'}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2.5">
                            <div className="text-[9px] font-black tracking-wider text-stone-500">提交 / CREATED AT</div>
                            <div className="mt-1 text-sm font-black text-stone-200">{formatCreatedTime(alert.createdAt)}</div>
                        </div>
                    </div>

                    {alert.note && (
                        <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-3">
                            <div className="text-[9px] font-black tracking-wider text-amber-300">楼面备注 / NOTE</div>
                            <p className="mt-1 text-sm sm:text-base leading-relaxed font-black text-amber-50 whitespace-pre-wrap break-words">
                                {alert.note}
                            </p>
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-stone-500">
                        <span>楼面 / Staff：<span className="text-stone-300">{alert.createdByName}</span></span>
                        {!isPending && (
                            <span>处理人 / Chef：<span className="text-sky-300">{alert.acknowledgedByName || operatorName}</span></span>
                        )}
                    </div>
                </div>

                <div className="border-t border-white/8 p-3 sm:p-4">
                    {isPending ? (
                        <button
                            onClick={() => void handleAcknowledge(alert)}
                            disabled={isWorking}
                            className="min-h-16 w-full rounded-2xl bg-[#FFD200] px-4 py-3 text-base sm:text-lg font-black text-[#111111] shadow-[0_10px_28px_rgba(255,210,0,0.2)] transition-all hover:bg-[#E8BF00] active:scale-[0.99] disabled:opacity-50"
                        >
                            {isWorking ? '正在接收 / Accepting…' : '开始处理 / Accept Alert'}
                        </button>
                    ) : (
                        <button
                            onClick={() => void handleResolve(alert)}
                            disabled={isWorking}
                            className="min-h-16 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base sm:text-lg font-black text-white shadow-[0_10px_28px_rgba(5,150,105,0.2)] transition-all hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <CheckCircle2 size={23} />
                            {isWorking ? '正在保存 / Saving…' : '处理完成 / Mark Resolved'}
                        </button>
                    )}
                </div>
            </article>
        );
    };

    if (!isStarted) {
        return (
            <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center px-4 py-8 safe-area-top safe-area-bottom">
                <div className="w-full max-w-lg rounded-[2rem] bg-white text-[#111111] p-6 sm:p-9 shadow-2xl border border-white/10">
                    <div className="w-20 h-20 rounded-[1.6rem] bg-[#FFD200] flex items-center justify-center mb-6 shadow-[0_12px_35px_rgba(255,210,0,0.35)]">
                        <ChefHat size={42} strokeWidth={2.4} />
                    </div>
                    <p className="text-xs font-black tracking-[0.24em] text-stone-400 uppercase mb-2">Kim Lian Kee · Kepong</p>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight">厨房通知处理台 / Kitchen Alert Display</h1>
                    <p className="mt-2 text-xs sm:text-sm text-stone-500 font-bold uppercase tracking-wider">Receiver Board</p>

                    <div className="mt-6 rounded-2xl bg-[#FFF8D6] border border-[#FFD200]/50 p-4 flex gap-3">
                        <BellRing className="text-amber-600 shrink-0 mt-0.5" size={22} />
                        <p className="text-xs leading-5 font-bold text-stone-700">
                            启动后会实时接收楼面通知、播放提示音，并尽量保持屏幕常亮。<br />
                            <span className="text-stone-500">Upon start, this board will sync real-time alerts, play audio alerts, and keep screen awake.</span>
                        </p>
                    </div>

                    <label className="block mt-6">
                        <span className="block text-sm font-black mb-2">厨房操作人姓名 / Operator Name</span>
                        <div className="relative">
                            <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={21} />
                            <input
                                value={operatorDraft}
                                onChange={event => setOperatorDraft(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') void handleStart(); }}
                                maxLength={100}
                                autoComplete="name"
                                placeholder="Ah Ming / Kitchen Head Chef"
                                className="w-full h-14 rounded-2xl border-2 border-stone-200 bg-stone-50 pl-12 pr-4 text-sm font-bold outline-none focus:border-[#FFD200] focus:bg-white transition-colors"
                            />
                        </div>
                        <span className="block mt-2 text-xs text-stone-400 font-semibold">记录由谁处理 / Action logged with this name.</span>
                    </label>

                    {errorMessage && (
                        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs font-bold text-red-700">
                            {errorMessage}
                        </div>
                    )}

                    <button
                        onClick={() => void handleStart()}
                        className="mt-6 w-full min-h-14 rounded-2xl bg-[#FFD200] text-[#111111] px-5 py-4 text-base font-black shadow-[0_10px_24px_rgba(255,210,0,0.28)] hover:bg-[#E9C000] active:scale-[0.98] transition-all"
                    >
                        启动厨房处理台 / Start Kitchen Display
                    </button>
                    <p className="mt-4 text-center text-[10px] text-stone-400 font-semibold">设备户口已验证 / Device Account Verified</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`h-full min-h-screen overflow-y-auto text-[#111111] ${displayView === 'ACTIVE' ? 'bg-[#0B0B0C]' : 'bg-[#F3F4F6]'}`}>
            <header className="sticky top-0 z-40 border-b border-white/10 bg-[#111111]/95 text-white shadow-2xl backdrop-blur safe-area-top">
                <div className="mx-auto max-w-[2000px] px-3 sm:px-5 lg:px-7 py-2.5 sm:py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-[0.9rem] bg-[#FFD200] text-[#111111] flex items-center justify-center shrink-0 shadow-[0_8px_24px_rgba(255,210,0,0.18)]">
                                <ChefHat size={27} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg sm:text-xl font-black leading-tight">厨房通知处理台 / Kitchen Alerts</h1>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-stone-400">
                                    {connectionState === 'ONLINE' ? (
                                        <><Wifi size={13} className="text-emerald-400" /> <span className="text-emerald-400">实时连接 / Online</span></>
                                    ) : connectionState === 'CONNECTING' ? (
                                        <><RefreshCw size={13} className="text-amber-300 animate-spin" /> <span className="text-amber-300">连接中 / Syncing</span></>
                                    ) : (
                                        <><WifiOff size={13} className="text-red-400" /> <span className="text-red-400">连接中断 / Offline</span></>
                                    )}
                                    <span className="text-stone-600">·</span>
                                    <span className="truncate">{operatorName}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            <div className="hidden md:flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 font-mono text-sm font-black tabular-nums">
                                <Clock3 size={16} className="text-[#FFD200]" />
                                {formatClock(now)}
                            </div>
                            <button
                                onClick={() => void toggleSound()}
                                className={`h-10 min-w-10 rounded-xl border px-2.5 flex items-center justify-center gap-2 transition-colors ${soundEnabled ? 'bg-[#FFD200] text-[#111111] border-[#FFD200]' : 'bg-white/5 text-stone-400 border-white/10'}`}
                                title={soundEnabled ? '关闭声音 / Mute' : '开启声音 / Unmute'}
                            >
                                {soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
                                <span className="hidden xl:inline text-xs font-black">{soundEnabled ? '声音开启 / Sound On' : '已静音 / Muted'}</span>
                            </button>
                            <button
                                onClick={() => void toggleFullscreen()}
                                className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 text-stone-300 flex items-center justify-center hover:bg-white/10"
                                title="全屏 / Fullscreen"
                            >
                                <Maximize2 size={19} />
                            </button>
                            <button
                                onClick={() => {
                                    setOperatorDraft(operatorName);
                                    setIsStarted(false);
                                    isStartedRef.current = false;
                                }}
                                className="h-10 rounded-xl bg-white/5 border border-white/10 px-2.5 sm:px-3 text-xs font-black text-stone-300 hover:bg-white/10 flex items-center gap-1.5"
                                title="更换操作人 / Switch Staff"
                            >
                                <UserRound size={17} />
                                <span className="hidden lg:inline">更换操作人 / Switch Staff</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-2.5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5">
                        <div className="flex gap-2 overflow-x-auto pb-0.5 xl:pb-0">
                            <div className={`h-10 shrink-0 rounded-xl border px-3 flex items-center gap-2 ${urgentCount > 0 ? 'bg-red-500/18 border-red-400/35 text-red-300' : 'bg-white/[0.04] border-white/8 text-stone-500'}`}>
                                <Flame size={15} />
                                <span className="text-[10px] font-black tracking-wider">紧急 / URGENT</span>
                                <span className="text-lg font-black leading-none">{urgentCount}</span>
                            </div>
                            <div className="h-10 shrink-0 rounded-xl border border-[#FFD200]/25 bg-[#FFD200]/10 px-3 text-[#FFD200] flex items-center gap-2">
                                <BellRing size={15} />
                                <span className="text-[10px] font-black tracking-wider">待接收 / NEW</span>
                                <span className="text-lg font-black leading-none">{newCount}</span>
                            </div>
                            <div className="h-10 shrink-0 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 text-sky-300 flex items-center gap-2">
                                <Eye size={15} />
                                <span className="text-[10px] font-black tracking-wider">处理中 / ACTIVE</span>
                                <span className="text-lg font-black leading-none">{acknowledgedCount}</span>
                            </div>
                            <div className={`h-10 shrink-0 rounded-xl border px-3 flex items-center gap-2 ${oldestPendingAt ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-white/8 bg-white/[0.04] text-stone-500'}`}>
                                <Clock3 size={15} />
                                <span className="text-[10px] font-black tracking-wider">最久等待 / OLDEST</span>
                                <span className="font-mono text-base font-black tabular-nums">{oldestPendingAt ? formatElapsedClock(oldestPendingAt, now) : '--:--'}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1 xl:w-[360px] shrink-0">
                            <button
                                onClick={() => setDisplayView('ACTIVE')}
                                className={`min-h-9 rounded-lg px-3 text-xs font-black flex items-center justify-center gap-2 transition-all ${displayView === 'ACTIVE' ? 'bg-[#FFD200] text-[#111111]' : 'text-stone-400 hover:bg-white/5'}`}
                            >
                                <BellRing size={15} /> 工作台 / Workboard
                                {alerts.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">{alerts.length}</span>}
                            </button>
                            <button
                                onClick={() => setDisplayView('HISTORY')}
                                className={`min-h-9 rounded-lg px-3 text-xs font-black flex items-center justify-center gap-2 transition-all ${displayView === 'HISTORY' ? 'bg-white text-[#111111]' : 'text-stone-400 hover:bg-white/5'}`}
                            >
                                <History size={15} /> 历史记录 / History
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {(errorMessage || successMessage) && (
                <div className="sticky top-[1px] z-30 px-4 sm:px-6 lg:px-8 pt-3">
                    {errorMessage && (
                        <div className="max-w-4xl mx-auto rounded-2xl bg-red-600 text-white px-4 py-3 shadow-xl flex items-center gap-3 font-bold">
                            <AlertTriangle size={21} className="shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}
                    {successMessage && (
                        <div className="max-w-4xl mx-auto rounded-2xl bg-emerald-600 text-white px-4 py-3 shadow-xl flex items-center gap-3 font-bold">
                            <CheckCircle2 size={21} className="shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}
                </div>
            )}

            <main className={`px-3 sm:px-5 lg:px-7 py-4 sm:py-5 safe-area-bottom ${displayView === 'ACTIVE' ? 'mx-auto w-full max-w-[2000px]' : ''}`}>
                {displayView === 'HISTORY' ? (
                    <div className="max-w-7xl mx-auto space-y-5">
                        <section className="rounded-[1.6rem] bg-white border border-stone-200 shadow-sm p-4 sm:p-5">
                            <div className="flex flex-col xl:flex-row xl:items-end gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <History size={22} className="text-amber-500" />
                                        <h2 className="text-xl font-black">厨房通知历史记录</h2>
                                    </div>
                                    <p className="mt-1 text-xs font-bold text-stone-400">每项通知、接收人、解决人和处理时间都会保留。</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-[180px_180px_minmax(220px,1fr)_auto] gap-2.5 xl:w-auto">
                                    <label className="relative">
                                        <CalendarDays size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                        <input
                                            type="date"
                                            value={historyDate}
                                            onChange={event => setHistoryDate(event.target.value)}
                                            className="w-full h-12 rounded-xl border-2 border-stone-200 bg-stone-50 pl-10 pr-3 text-sm font-black outline-none focus:border-[#FFD200]"
                                        />
                                    </label>

                                    <select
                                        value={historyStatus}
                                        onChange={event => setHistoryStatus(event.target.value as HistoryStatusFilter)}
                                        className="h-12 rounded-xl border-2 border-stone-200 bg-stone-50 px-3 text-sm font-black outline-none focus:border-[#FFD200]"
                                    >
                                        <option value="ALL">全部状态</option>
                                        <option value="NEW">待接收</option>
                                        <option value="ACKNOWLEDGED">处理中</option>
                                        <option value="RESOLVED">已解决</option>
                                        <option value="CANCELLED">已取消</option>
                                    </select>

                                    <label className="relative">
                                        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                                        <input
                                            value={historySearch}
                                            onChange={event => setHistorySearch(event.target.value)}
                                            placeholder="搜索桌号、单号、菜名或员工"
                                            className="w-full h-12 rounded-xl border-2 border-stone-200 bg-stone-50 pl-10 pr-3 text-sm font-bold outline-none focus:border-[#FFD200]"
                                        />
                                    </label>

                                    <button
                                        onClick={() => void loadHistory()}
                                        disabled={historyLoading}
                                        className="h-12 rounded-xl bg-[#111111] text-white px-4 font-black flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                                    >
                                        <RefreshCw size={17} className={historyLoading ? 'animate-spin' : ''} /> 刷新
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-2xl bg-[#111111] text-white p-4 border border-black">
                                <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider">全部通知</p>
                                <p className="mt-1 text-3xl font-black">{historySummary.total}</p>
                            </div>
                            <div className="rounded-2xl bg-emerald-50 text-emerald-800 p-4 border border-emerald-200">
                                <p className="text-[10px] font-black uppercase tracking-wider">已经解决</p>
                                <p className="mt-1 text-3xl font-black">{historySummary.resolved}</p>
                            </div>
                            <div className="rounded-2xl bg-stone-100 text-stone-700 p-4 border border-stone-200">
                                <p className="text-[10px] font-black uppercase tracking-wider">已经取消</p>
                                <p className="mt-1 text-3xl font-black">{historySummary.cancelled}</p>
                            </div>
                            <div className="rounded-2xl bg-amber-50 text-amber-800 p-4 border border-amber-200">
                                <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><TimerReset size={13} /> 平均解决时间</p>
                                <p className="mt-1 text-xl sm:text-2xl font-black">{formatDuration(historySummary.averageMinutes)}</p>
                            </div>
                        </section>

                        {historyError && (
                            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 font-bold flex items-center gap-2">
                                <AlertTriangle size={20} /> {historyError}
                            </div>
                        )}

                        {historyLoading ? (
                            <div className="rounded-[1.6rem] bg-white border border-stone-200 p-12 flex flex-col items-center gap-3">
                                <RefreshCw size={32} className="text-amber-500 animate-spin" />
                                <p className="text-sm font-black text-stone-400">正在读取记录……</p>
                            </div>
                        ) : filteredHistoryRecords.length === 0 ? (
                            <div className="rounded-[1.6rem] bg-white border-2 border-dashed border-stone-300 p-12 text-center">
                                <History size={44} className="mx-auto text-stone-300" />
                                <h3 className="mt-3 text-lg font-black text-stone-600">没有符合条件的记录</h3>
                                <p className="mt-1 text-sm font-semibold text-stone-400">可以更换日期、状态或搜索内容。</p>
                            </div>
                        ) : (
                            <section className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <p className="text-sm font-black text-stone-600">显示 {filteredHistoryRecords.length} 项记录</p>
                                    <p className="text-xs font-bold text-stone-400">营业日：{historyDate}</p>
                                </div>
                                {filteredHistoryRecords.map(alert => {
                                    const statusMeta = HISTORY_STATUS_META[alert.status];
                                    const typeMeta = TYPE_META[alert.alertType] || TYPE_META.NOTICE;
                                    const resolutionMinutes = getResolutionMinutes(alert);
                                    return (
                                        <article key={alert.id} className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden">
                                            <div className={`h-1 ${alert.status === 'RESOLVED' ? 'bg-emerald-500' : alert.status === 'CANCELLED' ? 'bg-stone-300' : alert.status === 'ACKNOWLEDGED' ? 'bg-sky-500' : 'bg-[#FFD200]'}`} />
                                            <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                                                <div className="flex items-start gap-3 min-w-0 lg:w-[34%]">
                                                    <div className="w-14 h-14 rounded-2xl bg-[#111111] text-[#FFD200] flex flex-col items-center justify-center shrink-0">
                                                        <span className="text-[8px] font-bold text-white/50 uppercase">Table</span>
                                                        <span className="text-xl font-black max-w-[3rem] truncate">{alert.tableNo}</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-base sm:text-lg font-black break-words">{alert.dishName}</h3>
                                                        <p className="mt-1 text-xs font-bold text-stone-400 truncate">Order {alert.orderNo}</p>
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${typeMeta.tone}`}>{typeMeta.label}</span>
                                                            {alert.size && <span className="rounded-lg bg-stone-100 px-2 py-1 text-[10px] font-black">{alert.size}</span>}
                                                            <span className="rounded-lg bg-[#FFD200]/20 px-2 py-1 text-[10px] font-black">× {alert.quantity}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                                                    <div>
                                                        <p className="text-[9px] font-black text-stone-400 uppercase">提交</p>
                                                        <p className="mt-1 text-xs font-black truncate">{alert.createdByName}</p>
                                                        <p className="text-[10px] font-bold text-stone-400">{formatCreatedTime(alert.createdAt)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-stone-400 uppercase">厨房接收</p>
                                                        <p className="mt-1 text-xs font-black truncate">{alert.acknowledgedByName || '—'}</p>
                                                        <p className="text-[10px] font-bold text-stone-400">{alert.acknowledgedAt ? formatCreatedTime(alert.acknowledgedAt) : '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-stone-400 uppercase">完成处理</p>
                                                        <p className="mt-1 text-xs font-black truncate">{alert.resolvedByName || alert.cancelledByName || '—'}</p>
                                                        <p className="text-[10px] font-bold text-stone-400">{alert.resolvedAt ? formatCreatedTime(alert.resolvedAt) : alert.cancelledAt ? formatCreatedTime(alert.cancelledAt) : '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-stone-400 uppercase">处理时间</p>
                                                        <p className="mt-1 text-xs font-black">{formatDuration(resolutionMinutes)}</p>
                                                    </div>
                                                </div>

                                                <div className="lg:w-28 flex lg:flex-col items-center lg:items-end justify-between gap-2">
                                                    <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-black ${statusMeta.className}`}>{statusMeta.label}</span>
                                                    {alert.priority === 'URGENT' && <span className="text-[10px] font-black text-red-600">URGENT</span>}
                                                </div>
                                            </div>
                                            {alert.note && (
                                                <div className="border-t border-stone-100 bg-amber-50/60 px-4 sm:px-5 py-3 text-xs font-bold text-stone-700">
                                                    <span className="text-amber-700 font-black">备注：</span>{alert.note}
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </section>
                        )}
                    </div>
                ) : alerts.length === 0 ? (
                    <section className="min-h-[42vh] rounded-[1.75rem] border border-white/10 bg-[#151517] px-6 py-12 text-center flex flex-col items-center justify-center shadow-[0_24px_70px_rgba(0,0,0,0.2)]">
                        <div className="w-20 h-20 rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-400 flex items-center justify-center">
                            <CheckCircle2 size={40} strokeWidth={2.2} />
                        </div>
                        <h2 className="mt-5 text-2xl sm:text-3xl font-black text-white">厨房通知已清空 / No Pending Alerts</h2>
                        <p className="mt-2 text-sm sm:text-base font-semibold text-stone-500">楼面提交后会自动显示，不需要刷新 / Real-time updates automatically load here.</p>
                        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-xs font-bold text-stone-400">
                            {connectionState === 'ONLINE' ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-red-400" />}
                            {connectionState === 'ONLINE' ? '实时连接正常 / Real-time Online' : '连接暂时中断 / Disconnected'}
                            <span className="text-stone-700">·</span>
                            {formatClock(now)}
                        </div>
                    </section>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] gap-4 lg:gap-5 items-start">
                        <section className="rounded-[1.75rem] border border-[#FFD200]/15 bg-[#141416] p-3 sm:p-4 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
                            <div className="mb-3 flex items-center justify-between gap-3 px-1 sm:px-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 rounded-xl bg-[#FFD200] text-[#111111] flex items-center justify-center">
                                        <BellRing size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-base sm:text-lg font-black text-white">待接收 / Pending Alerts</h2>
                                        <p className="text-[11px] font-bold text-stone-500">按等待时间处理，紧急优先 / Ordered by time, urgent first</p>
                                    </div>
                                </div>
                                <span className="min-w-9 h-9 rounded-full bg-[#FFD200]/12 border border-[#FFD200]/20 px-2 text-[#FFD200] flex items-center justify-center text-lg font-black">{newCount}</span>
                            </div>

                            {pendingAlerts.length === 0 ? (
                                <div className="min-h-44 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] flex flex-col items-center justify-center px-5 py-8 text-center">
                                    <CheckCircle2 size={30} className="text-emerald-400" />
                                    <p className="mt-3 text-sm font-black text-stone-300">没有等待接收的通知 / No Pending Alerts</p>
                                    <p className="mt-1 text-xs font-semibold text-stone-600">新的楼面通知会出现在这里 / New alerts will appear here instantly</p>
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4">
                                    {pendingAlerts.map(renderAlertCard)}
                                </div>
                            )}
                        </section>

                        <section className="rounded-[1.75rem] border border-sky-400/15 bg-[#141416] p-3 sm:p-4 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
                            <div className="mb-3 flex items-center justify-between gap-3 px-1 sm:px-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                                        <Eye size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-base sm:text-lg font-black text-white">处理中 / In Progress</h2>
                                        <p className="text-[11px] font-bold text-stone-500">处理完成后通知楼面 / Mark done to notify staff</p>
                                    </div>
                                </div>
                                <span className="min-w-9 h-9 rounded-full bg-sky-400/10 border border-sky-400/20 px-2 text-sky-300 flex items-center justify-center text-lg font-black">{acknowledgedCount}</span>
                            </div>

                            {inProgressAlerts.length === 0 ? (
                                <div className="min-h-44 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] flex flex-col items-center justify-center px-5 py-8 text-center">
                                    <Eye size={30} className="text-sky-400/70" />
                                    <p className="mt-3 text-sm font-black text-stone-300">目前没有正在处理 / None Active</p>
                                    <p className="mt-1 text-xs font-semibold text-stone-600">按“开始处理”后会移到这里 / Click Accept on left cards to start</p>
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4">
                                    {inProgressAlerts.map(renderAlertCard)}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
};
