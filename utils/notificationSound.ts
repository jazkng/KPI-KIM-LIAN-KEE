import { SystemNotification } from '../types';

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebkitAudio = Window & typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
};

let sharedAudioContext: AudioContext | null = null;
let lastPlayedAt = 0;

const getAudioContextConstructor = (): AudioContextConstructor | null => {
    if (typeof window === 'undefined') return null;
    return window.AudioContext
        || (window as WindowWithWebkitAudio).webkitAudioContext
        || null;
};

const getOrCreateAudioContext = (): AudioContext | null => {
    if (sharedAudioContext?.state === 'closed') {
        sharedAudioContext = null;
    }
    if (sharedAudioContext) return sharedAudioContext;

    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) return null;
    sharedAudioContext = new AudioContextClass();
    return sharedAudioContext;
};

const scheduleTone = (
    context: AudioContext,
    frequency: number,
    delay: number,
    duration: number,
    volume: number,
) => {
    const startsAt = context.currentTime + delay;
    const endsAt = startsAt + duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.02);
};

export const isNotificationSoundSupported = (): boolean =>
    getAudioContextConstructor() !== null;

export const isNotificationSoundReady = (): boolean =>
    sharedAudioContext?.state === 'running';

/**
 * Must be called from a click, touch or key interaction on browsers that
 * enforce media autoplay restrictions (notably iOS Safari and installed PWAs).
 */
export const unlockNotificationSound = async (): Promise<boolean> => {
    try {
        const context = getOrCreateAudioContext();
        if (!context) return false;

        if (context.state === 'suspended') {
            await context.resume();
        }
        if (context.state !== 'running') return false;

        // A nearly silent, very short tone completes the iOS audio unlock
        // without producing an audible notification during setup.
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.015);
        return true;
    } catch (error) {
        console.warn('[Notifications] unable to unlock notification sound:', error);
        return false;
    }
};

/**
 * Plays one compact two-tone chime. Several notifications arriving in the same
 * Firestore snapshot intentionally produce only one sound.
 */
export const playNotificationChime = (urgent = false): boolean => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return false;
    }

    const context = sharedAudioContext;
    if (!context || context.state !== 'running') return false;

    const now = Date.now();
    if (now - lastPlayedAt < 1200) return false;
    lastPlayedAt = now;

    try {
        const volume = urgent ? 0.13 : 0.09;
        scheduleTone(context, urgent ? 698.46 : 659.25, 0, 0.18, volume);
        scheduleTone(context, urgent ? 1046.5 : 987.77, 0.13, 0.32, volume * 0.92);
        return true;
    } catch (error) {
        console.warn('[Notifications] unable to play notification sound:', error);
        return false;
    }
};

/**
 * Returns only notifications that genuinely arrived after this component
 * established its initial snapshot. Old unread items and self-notifications
 * are deliberately excluded.
 */
export const getNewForegroundNotifications = (
    knownIds: ReadonlySet<string>,
    notifications: SystemNotification[],
    subscriptionStartedAt: number,
): SystemNotification[] => {
    const earliestAllowedTime = subscriptionStartedAt - 5000;

    return notifications.filter(notification => {
        if (knownIds.has(notification.id) || notification.readAt) return false;
        if (notification.actorId === notification.recipientEmployeeId) return false;

        const createdAt = new Date(notification.createdAt).getTime();
        return Number.isFinite(createdAt) && createdAt >= earliestAllowedTime;
    });
};
