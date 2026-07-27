import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Bell,
    BookOpen,
    CheckCheck,
    Loader2,
    MessageCircle,
    UserCheck,
    Volume2,
    VolumeX,
    X,
} from 'lucide-react';
import {
    AppLanguage,
    Employee,
    normalizeLanguage,
    SystemNotification,
} from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getLocalizedNotificationText } from '../../utils/notificationUtils';
import {
    getNewForegroundNotifications,
    isNotificationSoundReady,
    isNotificationSoundSupported,
    playNotificationChime,
    unlockNotificationSound,
} from '../../utils/notificationSound';

type NotificationFilter = 'ALL' | 'UNREAD' | 'LOGBOOK';

interface NotificationCenterProps {
    employee: Employee;
    onOpenLog: (logId: string) => void;
    variant?: 'light' | 'dark' | 'floating';
    className?: string;
}

const UI_COPY: Record<AppLanguage, {
    notifications: string;
    all: string;
    unread: string;
    logbook: string;
    markAll: string;
    empty: string;
    close: string;
    live: string;
    soundOn: string;
    soundOff: string;
    enableSound: string;
}> = {
    zh_en: {
        notifications: '通知中心',
        all: '全部',
        unread: '未读',
        logbook: '运营日志',
        markAll: '全部已读',
        empty: '暂时没有通知',
        close: '关闭',
        live: '实时更新',
        soundOn: '通知声音已开启',
        soundOff: '通知声音已关闭',
        enableSound: '开启通知声音',
    },
    en: {
        notifications: 'Notifications',
        all: 'All',
        unread: 'Unread',
        logbook: 'Logbook',
        markAll: 'Mark all read',
        empty: 'No notifications yet',
        close: 'Close',
        live: 'Live updates',
        soundOn: 'Notification sound on',
        soundOff: 'Notification sound off',
        enableSound: 'Enable notification sound',
    },
    my: {
        notifications: 'အသိပေးချက်များ',
        all: 'အားလုံး',
        unread: 'မဖတ်ရသေး',
        logbook: 'လုပ်ငန်းမှတ်တမ်း',
        markAll: 'အားလုံး ဖတ်ပြီး',
        empty: 'အသိပေးချက် မရှိသေးပါ',
        close: 'ပိတ်ရန်',
        live: 'တိုက်ရိုက် အပ်ဒိတ်',
        soundOn: 'အသိပေးသံ ဖွင့်ထားသည်',
        soundOff: 'အသိပေးသံ ပိတ်ထားသည်',
        enableSound: 'အသိပေးသံ ဖွင့်ရန်',
    },
};

const SOUND_PREFERENCE_PREFIX = 'klk_notification_sound_';

const readSoundPreference = (employeeId: string): boolean => {
    try {
        return localStorage.getItem(`${SOUND_PREFERENCE_PREFIX}${employeeId}`) !== 'off';
    } catch {
        return true;
    }
};

const saveSoundPreference = (employeeId: string, enabled: boolean) => {
    try {
        localStorage.setItem(
            `${SOUND_PREFERENCE_PREFIX}${employeeId}`,
            enabled ? 'on' : 'off',
        );
    } catch {
        // Private browsing or restricted storage must not disable notifications.
    }
};

const getNotificationIcon = (notification: SystemNotification) => {
    switch (notification.eventType) {
        case 'LOGBOOK_REPLY':
            return MessageCircle;
        case 'LOGBOOK_ASSIGNED':
            return UserCheck;
        case 'LOGBOOK_STATUS':
            return CheckCheck;
        case 'LOGBOOK_NEW':
        default:
            return notification.priority === 'HIGH' ? AlertTriangle : BookOpen;
    }
};

const formatTime = (value: string, language: AppLanguage): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const locale = language === 'my' ? 'my-MM' : language === 'en' ? 'en-MY' : 'zh-MY';
    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
    employee,
    onOpenLog,
    variant = 'light',
    className = '',
}) => {
    const language = normalizeLanguage(employee.preferredLanguage);
    const copy = UI_COPY[language];
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState<NotificationFilter>('ALL');
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => readSoundPreference(employee.id));
    const [isSoundReady, setIsSoundReady] = useState(() => isNotificationSoundReady());
    const soundEnabledRef = useRef(soundEnabled);
    const knownNotificationIdsRef = useRef<Set<string>>(new Set());
    const hasInitialSnapshotRef = useRef(false);
    const subscriptionStartedAtRef = useRef(Date.now());
    const soundSupported = isNotificationSoundSupported();

    const enableNotificationSound = useCallback(async () => {
        const ready = await unlockNotificationSound();
        setIsSoundReady(ready);
        return ready;
    }, []);

    useEffect(() => {
        const enabled = readSoundPreference(employee.id);
        setSoundEnabled(enabled);
        soundEnabledRef.current = enabled;
        setIsSoundReady(isNotificationSoundReady());
    }, [employee.id]);

    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    useEffect(() => {
        if (!soundEnabled || isSoundReady || !soundSupported) return;

        let active = true;
        const unlockFromInteraction = () => {
            void unlockNotificationSound().then(ready => {
                if (active) setIsSoundReady(ready);
            });
        };

        window.addEventListener('pointerdown', unlockFromInteraction, {
            capture: true,
            once: true,
        });
        window.addEventListener('keydown', unlockFromInteraction, {
            capture: true,
            once: true,
        });
        return () => {
            active = false;
            window.removeEventListener('pointerdown', unlockFromInteraction, true);
            window.removeEventListener('keydown', unlockFromInteraction, true);
        };
    }, [isSoundReady, soundEnabled, soundSupported]);

    useEffect(() => {
        setIsConnecting(true);
        hasInitialSnapshotRef.current = false;
        knownNotificationIdsRef.current = new Set();
        subscriptionStartedAtRef.current = Date.now();

        const unsubscribe = DataManager.subscribeNotifications(
            employee.id,
            next => {
                if (!hasInitialSnapshotRef.current) {
                    knownNotificationIdsRef.current = new Set(next.map(item => item.id));
                    hasInitialSnapshotRef.current = true;
                } else {
                    const newlyArrived = getNewForegroundNotifications(
                        knownNotificationIdsRef.current,
                        next,
                        subscriptionStartedAtRef.current,
                    );
                    knownNotificationIdsRef.current = new Set(next.map(item => item.id));

                    if (soundEnabledRef.current && newlyArrived.length > 0) {
                        const urgent = newlyArrived.some(item => item.priority === 'HIGH');
                        playNotificationChime(urgent);
                        setIsSoundReady(isNotificationSoundReady());
                    }
                }
                setNotifications(next);
                setIsConnecting(false);
            },
            () => setIsConnecting(false),
        );
        return unsubscribe;
    }, [employee.id]);

    useEffect(() => {
        const syncSoundState = () => {
            setIsSoundReady(isNotificationSoundReady());
        };
        document.addEventListener('visibilitychange', syncSoundState);
        return () => document.removeEventListener('visibilitychange', syncSoundState);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen]);

    const unreadCount = useMemo(
        () => notifications.filter(notification => !notification.readAt).length,
        [notifications],
    );

    const filteredNotifications = useMemo(() => {
        if (filter === 'UNREAD') {
            return notifications.filter(notification => !notification.readAt);
        }
        if (filter === 'LOGBOOK') {
            return notifications.filter(notification => notification.module === 'LOGBOOK');
        }
        return notifications;
    }, [filter, notifications]);

    const handleOpenNotification = async (notification: SystemNotification) => {
        if (!notification.readAt) {
            const readAt = new Date().toISOString();
            setNotifications(current => current.map(item =>
                item.id === notification.id ? { ...item, readAt } : item
            ));
            DataManager.markNotificationRead(notification.id).catch(error => {
                console.error('Failed to mark notification as read:', error);
            });
        }
        setIsOpen(false);
        onOpenLog(notification.entityId);
    };

    const handleMarkAllRead = async () => {
        const unreadIds = notifications
            .filter(notification => !notification.readAt)
            .map(notification => notification.id);
        if (unreadIds.length === 0) return;

        const before = notifications;
        const readAt = new Date().toISOString();
        setNotifications(current => current.map(notification => (
            notification.readAt ? notification : { ...notification, readAt }
        )));
        setIsMarkingAll(true);
        try {
            await DataManager.markAllNotificationsRead(unreadIds);
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
            setNotifications(before);
        } finally {
            setIsMarkingAll(false);
        }
    };

    const handleToggleSound = () => {
        const nextEnabled = !soundEnabled;
        setSoundEnabled(nextEnabled);
        soundEnabledRef.current = nextEnabled;
        saveSoundPreference(employee.id, nextEnabled);

        if (nextEnabled) {
            void enableNotificationSound();
        }
    };

    const handleOpenCenter = () => {
        if (soundEnabled && !isSoundReady) {
            void enableNotificationSound();
        }
        setIsOpen(true);
    };

    const floatingClass = variant === 'floating'
        ? 'fixed top-[max(1rem,env(safe-area-inset-top))] right-4 z-[145]'
        : 'relative';
    const buttonTheme = variant === 'dark' || variant === 'floating'
        ? 'bg-[#111111] text-[#FFD200] border-white/15 shadow-lg'
        : 'bg-white text-stone-700 border-stone-200 shadow-sm';

    return (
        <div className={`${floatingClass} ${className}`}>
            <button
                type="button"
                onClick={handleOpenCenter}
                className={`relative w-11 h-11 rounded-full border flex items-center justify-center active:scale-95 transition-transform outline-none ${buttonTheme}`}
                aria-label={`${copy.notifications}${unreadCount ? ` (${unreadCount})` : ''}`}
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-[#EF4444] text-white rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-black leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {soundEnabled && soundSupported && !isSoundReady && !isOpen && (
                <button
                    type="button"
                    onClick={() => void enableNotificationSound()}
                    className="absolute top-[calc(100%+0.5rem)] right-0 min-h-[38px] px-3 rounded-xl bg-[#FFD200] text-[#111111] border border-black/10 shadow-lg flex items-center gap-1.5 whitespace-nowrap text-[10px] font-black active:scale-95 transition-transform"
                >
                    <Volume2 size={14} />
                    {copy.enableSound}
                </button>
            )}

            {isOpen && (
                <div
                    className="fixed inset-0 z-[1200] bg-black/55 backdrop-blur-[2px] flex items-end md:items-center justify-center md:p-5"
                    onMouseDown={event => {
                        if (event.currentTarget === event.target) setIsOpen(false);
                    }}
                >
                    <section className="w-full md:max-w-lg bg-[#F6F7FB] rounded-t-[28px] md:rounded-[28px] shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
                        <header className="bg-white px-5 pt-5 pb-4 border-b border-[#E5E7EB]">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-xl bg-[#FFD200] text-[#111111] flex items-center justify-center">
                                            <Bell size={17} />
                                        </div>
                                        <div>
                                            <h2 className="text-base font-black text-[#111111]">
                                                {copy.notifications}
                                            </h2>
                                            <p className="text-[10px] font-bold text-[#22C55E] flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                                                {copy.live}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {soundSupported && (
                                        <button
                                            type="button"
                                            onClick={handleToggleSound}
                                            className={`relative w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                                                soundEnabled
                                                    ? 'bg-[#FFD200]/20 text-amber-700'
                                                    : 'bg-stone-100 text-stone-400'
                                            }`}
                                            aria-label={soundEnabled ? copy.soundOn : copy.soundOff}
                                            title={soundEnabled ? copy.soundOn : copy.soundOff}
                                        >
                                            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                                            {soundEnabled && !isSoundReady && (
                                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                                            )}
                                        </button>
                                    )}
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMarkAllRead}
                                            disabled={isMarkingAll}
                                            className="min-h-[40px] px-3 rounded-xl text-[10px] font-black text-stone-700 bg-stone-100 active:bg-stone-200 disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {isMarkingAll
                                                ? <Loader2 size={13} className="animate-spin" />
                                                : <CheckCheck size={13} />}
                                            {copy.markAll}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="w-10 h-10 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center active:bg-stone-200"
                                        aria-label={copy.close}
                                    >
                                        <X size={17} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 mt-4 p-1 bg-stone-100 rounded-xl">
                                {([
                                    ['ALL', copy.all],
                                    ['UNREAD', `${copy.unread}${unreadCount ? ` ${unreadCount}` : ''}`],
                                    ['LOGBOOK', copy.logbook],
                                ] as Array<[NotificationFilter, string]>).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setFilter(value)}
                                        className={`min-h-[38px] px-2 rounded-lg text-[10px] font-black transition-all ${
                                            filter === value
                                                ? 'bg-white text-[#111111] shadow-sm'
                                                : 'text-stone-500'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </header>

                        <div className="overflow-y-auto px-4 py-4 space-y-2.5" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
                            {isConnecting ? (
                                <div className="py-16 flex flex-col items-center gap-3 text-stone-400">
                                    <Loader2 size={24} className="animate-spin" />
                                    <span className="text-xs font-bold">{copy.live}</span>
                                </div>
                            ) : filteredNotifications.length === 0 ? (
                                <div className="py-16 text-center">
                                    <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-[#E5E7EB] flex items-center justify-center text-stone-300">
                                        <Bell size={23} />
                                    </div>
                                    <p className="mt-3 text-xs font-bold text-stone-400">{copy.empty}</p>
                                </div>
                            ) : (
                                filteredNotifications.map(notification => {
                                    const Icon = getNotificationIcon(notification);
                                    const isUnread = !notification.readAt;
                                    return (
                                        <button
                                            type="button"
                                            key={notification.id}
                                            onClick={() => handleOpenNotification(notification)}
                                            className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                                                isUnread
                                                    ? 'bg-white border-[#FFD200]/70 shadow-[0_8px_24px_rgba(17,17,17,0.06)]'
                                                    : 'bg-white/65 border-[#E5E7EB]'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                    notification.priority === 'HIGH'
                                                        ? 'bg-red-50 text-[#EF4444]'
                                                        : 'bg-[#FFD200]/20 text-stone-800'
                                                }`}>
                                                    <Icon size={18} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <h3 className="text-xs font-black text-[#111111] leading-snug">
                                                            {getLocalizedNotificationText(notification.title, language)}
                                                        </h3>
                                                        {isUnread && (
                                                            <span className="w-2 h-2 mt-1 rounded-full bg-[#EF4444] shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="mt-1 text-[11px] font-medium text-stone-600 leading-relaxed line-clamp-2">
                                                        {getLocalizedNotificationText(notification.message, language)}
                                                    </p>
                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                        <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                                                            {copy.logbook}
                                                        </span>
                                                        <time className="text-[9px] font-bold text-stone-400">
                                                            {formatTime(notification.createdAt, language)}
                                                        </time>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};
