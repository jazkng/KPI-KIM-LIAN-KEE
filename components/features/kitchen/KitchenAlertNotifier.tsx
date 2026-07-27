import React, { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Eye, X } from 'lucide-react';
import { Employee, KitchenAlert, KitchenAlertStatus } from '../../../types';
import { KitchenAlertService } from '../../../utils/kitchenAlertService';

const STORE_ID = 'KEPONG';

interface KitchenAlertNotifierProps {
    employee: Employee;
    lang: string;
    disabled?: boolean;
    onOpen: () => void;
}

interface NotificationState {
    alert: KitchenAlert;
    status: Extract<KitchenAlertStatus, 'ACKNOWLEDGED' | 'RESOLVED'>;
}

export const KitchenAlertNotifier: React.FC<KitchenAlertNotifierProps> = ({
    employee,
    lang,
    disabled = false,
    onOpen,
}) => {
    const [notification, setNotification] = useState<NotificationState | null>(null);
    const previousStatusesRef = useRef<Record<string, KitchenAlertStatus>>({});
    const initializedRef = useRef(false);

    useEffect(() => {
        if (disabled) {
            setNotification(null);
            previousStatusesRef.current = {};
            initializedRef.current = false;
            return;
        }

        const unsubscribe = KitchenAlertService.subscribeEmployeeAlerts(
            STORE_ID,
            employee.id,
            alerts => {
                if (initializedRef.current) {
                    const changed = alerts.filter(alert => {
                        const previous = previousStatusesRef.current[alert.id];
                        return previous && previous !== alert.status &&
                            (alert.status === 'ACKNOWLEDGED' || alert.status === 'RESOLVED');
                    });
                    const important = changed.find(alert => alert.status === 'RESOLVED') || changed[0];
                    if (important && (important.status === 'ACKNOWLEDGED' || important.status === 'RESOLVED')) {
                        setNotification({ alert: important, status: important.status });
                        navigator.vibrate?.(important.status === 'RESOLVED' ? [160, 70, 160] : 100);
                    }
                } else {
                    initializedRef.current = true;
                }

                previousStatusesRef.current = Object.fromEntries(
                    alerts.map(alert => [alert.id, alert.status]),
                );
            },
            { onError: error => console.error('Kitchen alert background notifier failed:', error) },
        );

        return unsubscribe;
    }, [disabled, employee.id]);

    useEffect(() => {
        if (!notification) return;
        const timer = window.setTimeout(
            () => setNotification(null),
            notification.status === 'RESOLVED' ? 8000 : 5500,
        );
        return () => window.clearTimeout(timer);
    }, [notification]);

    if (!notification) return null;

    const isResolved = notification.status === 'RESOLVED';
    const text = lang === 'my'
        ? isResolved
            ? `မီးဖိုချောင် ဖြေရှင်းပြီး：${notification.alert.dishName}`
            : `မီးဖိုချောင် လက်ခံပြီး：${notification.alert.dishName}`
        : isResolved
            ? `厨房已经解决：${notification.alert.dishName}`
            : `厨房已经接收：${notification.alert.dishName}`;

    return (
        <div className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 right-3 z-[2500] mx-auto max-w-lg">
            <div className={`rounded-2xl border px-4 py-3.5 shadow-2xl flex items-start gap-3 ${isResolved ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-sky-600 border-sky-500 text-white'}`}>
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    {isResolved ? <CheckCircle2 size={23} /> : <Eye size={22} />}
                </div>
                <button
                    onClick={() => {
                        setNotification(null);
                        onOpen();
                    }}
                    className="min-w-0 flex-1 text-left active:opacity-80"
                >
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70 flex items-center gap-1.5">
                        <BellRing size={12} /> Kitchen Update
                    </p>
                    <p className="mt-1 text-sm font-black leading-5">{text}</p>
                    <p className="mt-1 text-[10px] font-bold text-white/75">
                        Table {notification.alert.tableNo} · Order {notification.alert.orderNo} · {lang === 'my' ? 'ကြည့်ရန် နှိပ်ပါ' : '按这里查看'}
                    </p>
                </button>
                <button
                    onClick={() => setNotification(null)}
                    className="w-9 h-9 rounded-xl bg-black/10 flex items-center justify-center shrink-0 active:bg-black/20"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};
