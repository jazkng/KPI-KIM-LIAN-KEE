import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BellRing,
    CheckCircle2,
    ChefHat,
    Clock3,
    Minus,
    Plus,
    RotateCcw,
    Search,
    Send,
    Utensils,
    XCircle,
    Zap,
} from 'lucide-react';
import { Employee, KitchenAlert, KitchenAlertStatus, KitchenAlertType, MenuItem } from '../../../types';
import { INITIAL_MENU_ITEMS } from '../../../constants/menu';
import { DataManager } from '../../../utils/dataManager';
import {
    KitchenAlertService,
    KitchenAlertValidationError,
} from '../../../utils/kitchenAlertService';

interface KitchenAlertModuleProps {
    employee: Employee;
    lang: 'zh' | 'my';
}

type ViewMode = 'CREATE' | 'MY_ALERTS';
type ToastState = { text: string; tone: 'SUCCESS' | 'INFO' | 'ERROR' } | null;

const STORE_ID = 'KEPONG';

const ALERT_TYPE_OPTIONS: Array<{
    value: KitchenAlertType;
    zh: string;
    my: string;
    icon: React.ElementType;
}> = [
    { value: 'RUSH', zh: '催菜 / Rush', my: 'အမြန်လုပ်ရန် / Rush', icon: Zap },
    { value: 'MISSING', zh: '漏单 / Missing', my: 'အော်ဒါကျန် / Missing', icon: AlertTriangle },
    { value: 'WRONG', zh: '做错 / Wrong', my: 'မှားယွင်း / Wrong', icon: XCircle },
    { value: 'REMAKE', zh: '重做 / Remake', my: 'ပြန်လုပ်ရန် / Remake', icon: RotateCcw },
    { value: 'NOTICE', zh: '特别注意 / Notice', my: 'အထူးသတိ / Notice', icon: BellRing },
];

const formatElapsed = (createdAt: string, nowMs: number, lang: 'zh' | 'my'): string => {
    const createdMs = new Date(createdAt).getTime();
    if (!Number.isFinite(createdMs)) return '--';
    const minutes = Math.max(0, Math.floor((nowMs - createdMs) / 60000));
    if (minutes < 1) return lang === 'my' ? 'ယခုလေးတင်' : '刚刚';
    return lang === 'my' ? `${minutes} မိနစ်` : `${minutes} 分钟`;
};

const getStatusMeta = (status: KitchenAlertStatus, lang: 'zh' | 'my') => {
    switch (status) {
        case 'NEW':
            return {
                label: lang === 'my' ? 'မီးဖိုချောင် လက်ခံရန်စောင့်နေသည်' : '等待厨房接收 / Waiting Kitchen',
                className: 'bg-amber-50 text-amber-700 border-amber-200',
                dot: 'bg-amber-500',
            };
        case 'ACKNOWLEDGED':
            return {
                label: lang === 'my' ? 'မီးဖိုချောင် စတင်လုပ်နေသည်' : '厨房处理中 / Processing',
                className: 'bg-blue-50 text-blue-700 border-blue-200',
                dot: 'bg-blue-500',
            };
        case 'RESOLVED':
            return {
                label: lang === 'my' ? 'ဖြေရှင်းပြီး' : '已经解决 / Resolved',
                className: 'bg-green-50 text-green-700 border-green-200',
                dot: 'bg-green-500',
            };
        case 'CANCELLED':
            return {
                label: lang === 'my' ? 'ပယ်ဖျက်ပြီး' : '已经取消 / Cancelled',
                className: 'bg-gray-100 text-gray-500 border-gray-200',
                dot: 'bg-gray-400',
            };
    }
};

export const KitchenAlertModule: React.FC<KitchenAlertModuleProps> = ({ employee, lang }) => {
    const tr = (zh: string, my: string) => {
        if (lang === 'my') return my;
        // Mapping of Chinese text to its English counterpart for bilingual display
        const translations: Record<string, string> = {
            '通知厨房': '通知厨房 / Kitchen Alert',
            '发出通知': '发出通知 / Send Alert',
            '我的通知': '我的通知 / My Alerts',
            '订单资料': '订单资料 / Order Info',
            '必填': '必填 / Required',
            '桌号': '桌号 / Table No.',
            '菜单名称或编号': '菜单名称或编号 / Menu Name or No.',
            '输入 A01、福建面……': '输入 A01、福建面…… / Enter A01, Hokkien Mee...',
            '菜单中找不到，将使用你输入的菜名': '菜单中找不到，将使用你输入的菜名 / Not found, using custom name',
            '大小': '大小 / Size',
            '大小（选填）': '大小（选填） / Size (Optional)',
            '数量': '数量 / Qty',
            '通知原因': '通知原因 / Issue Type',
            '一般注意': '一般注意 / Notice',
            '紧急处理': '紧急处理 / Urgent',
            '备注（选填）': '备注（选填） / Note (Optional)',
            '例如：客人已经等很久、少辣、重新做……': '例如：等很久、少辣、重做 / Customer waiting, less spicy, remake...',
            '正在通知厨房……': '正在通知厨房…… / Sending Alert...',
            '立即通知厨房': '立即通知厨房 / Send Alert Now',
            '我今天发出的通知': '我今天发出的通知 / My Sent Alerts Today',
            '正在同步……': '正在同步…… / Syncing...',
            '今天还没有通知厨房': '今天还没有通知厨房 / No Alerts Sent Today',
            '发出第一项通知': '发出第一项通知 / Send First Alert',
            '输入错了，取消': '输错取消 / Cancel Alert',
            '厨房接收人': '厨房接收人 / Chef',
            '完成处理': '完成处理 / Resolved',
            '已通知厨房。桌号与菜单单号已保留，可继续添加下一道菜。': '已通知厨房 / Kitchen Notified. Table details kept.',
            '提交失败，请检查网络后再试。': '提交失败，请检查网络 / Submit failed, check connection.'
        };
        return translations[zh] || zh;
    };

    const [viewMode, setViewMode] = useState<ViewMode>('CREATE');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [menuLoading, setMenuLoading] = useState(true);
    const [dishQuery, setDishQuery] = useState('');
    const [selectedDish, setSelectedDish] = useState<MenuItem | null>(null);
    const [showDishResults, setShowDishResults] = useState(false);

    const [tableNo, setTableNo] = useState('');
    const [orderNo, setOrderNo] = useState('');
    const [size, setSize] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [alertType, setAlertType] = useState<KitchenAlertType>('RUSH');
    const [priority, setPriority] = useState<'NOTICE' | 'URGENT'>('NOTICE');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const [myAlerts, setMyAlerts] = useState<KitchenAlert[]>([]);
    const [alertsLoading, setAlertsLoading] = useState(true);
    const [syncError, setSyncError] = useState('');
    const [toast, setToast] = useState<ToastState>(null);
    const [nowMs, setNowMs] = useState(Date.now());
    const previousStatuses = useRef<Record<string, KitchenAlertStatus>>({});

    useEffect(() => {
        let active = true;
        const loadMenu = async () => {
            setMenuLoading(true);
            try {
                const cloudMenu = await DataManager.getMenu();
                if (!active) return;
                setMenuItems(cloudMenu.length > 0 ? cloudMenu : INITIAL_MENU_ITEMS);
            } catch (error) {
                console.error('Kitchen alert menu load failed:', error);
                if (active) setMenuItems(INITIAL_MENU_ITEMS);
            } finally {
                if (active) setMenuLoading(false);
            }
        };
        loadMenu();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        setAlertsLoading(true);
        const unsubscribe = KitchenAlertService.subscribeEmployeeAlerts(
            STORE_ID,
            employee.id,
            alerts => {
                const previous = previousStatuses.current;
                alerts.forEach(alert => {
                    const oldStatus = previous[alert.id];
                    if (!oldStatus || oldStatus === alert.status) return;

                    if (alert.status === 'ACKNOWLEDGED') {
                        setToast({
                            tone: 'INFO',
                            text: tr(`厨房已接收 / Acknowledged: ${alert.dishName}`, `မီးဖိုချောင် လက်ခံပြီး：${alert.dishName}`),
                        });
                    }
                    if (alert.status === 'RESOLVED') {
                        navigator.vibrate?.([120, 60, 120]);
                        setToast({
                            tone: 'SUCCESS',
                            text: tr(`厨房已解决 / Resolved: ${alert.dishName}`, `မီးဖိုချောင် ဖြေရှင်းပြီး：${alert.dishName}`),
                        });
                    }
                });

                previousStatuses.current = Object.fromEntries(
                    alerts.map(alert => [alert.id, alert.status]),
                );
                setMyAlerts(alerts);
                setSyncError('');
                setAlertsLoading(false);
            },
            {
                onError: error => {
                    console.error('Kitchen alert sync failed:', error);
                    setSyncError(tr('暂时无法同步厨房通知 / Failed to sync alerts', 'မီးဖိုချောင် အသိပေးချက်များ ချိတ်ဆက်မရပါ။'));
                    setAlertsLoading(false);
                },
            },
        );

        return unsubscribe;
    }, [employee.id, lang]);

    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 3500);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const filteredMenu = useMemo(() => {
        const term = dishQuery.trim().toLowerCase();
        const source = term
            ? menuItems.filter(item => `${item.id} ${item.name}`.toLowerCase().includes(term))
            : menuItems;
        return source.slice(0, 8);
    }, [dishQuery, menuItems]);

    const activeAlertCount = myAlerts.filter(alert => alert.isActive).length;

    const selectDish = (item: MenuItem) => {
        setSelectedDish(item);
        setDishQuery(item.name);
        setSize(item.variants?.[0]?.label || '');
        setShowDishResults(false);
        setFormError('');
    };

    const handleDishInput = (value: string) => {
        setDishQuery(value);
        if (selectedDish && value !== selectedDish.name) {
            setSelectedDish(null);
            setSize('');
        }
        setShowDishResults(true);
    };

    const resetDishFields = () => {
        setDishQuery('');
        setSelectedDish(null);
        setSize('');
        setQuantity(1);
        setAlertType('RUSH');
        setPriority('NOTICE');
        setNote('');
        setFormError('');
    };

    const handleSubmit = async () => {
        if (submitting) return;
        setSubmitting(true);
        setFormError('');
        try {
            await KitchenAlertService.createAlert({
                storeId: STORE_ID,
                tableNo,
                orderNo,
                dishId: selectedDish?.id,
                dishName: selectedDish?.name || dishQuery,
                size,
                quantity,
                note,
                alertType,
                priority,
                createdBy: { id: employee.id, name: employee.name },
            });

            navigator.vibrate?.(80);
            setToast({
                tone: 'SUCCESS',
                text: tr('已通知厨房。桌号与菜单单号已保留，可继续添加下一道菜。', 'မီးဖိုချောင်သို့ ပို့ပြီးပါပြီ။ နောက်ဟင်းပွဲကို ဆက်ထည့်နိုင်သည်။'),
            });
            resetDishFields();
        } catch (error) {
            const message = error instanceof KitchenAlertValidationError
                ? error.message
                : tr('提交失败，请检查网络后再试。', 'ပို့၍မရပါ။ အင်တာနက်ကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။');
            setFormError(message);
            setToast({ tone: 'ERROR', text: message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (alert: KitchenAlert) => {
        const confirmed = await (window as any).systemDialog.confirm(
            tr(`确定取消“${alert.dishName}”的厨房通知吗？ / Cancel this alert?`, `“${alert.dishName}” အသိပေးချက်ကို ပယ်ဖျက်မလား？`),
            '厨房管理'
        );
        if (!confirmed) return;
        try {
            await KitchenAlertService.cancelAlert(
                alert.id,
                { id: employee.id, name: employee.name },
                tr('楼面输入错误 / Staff input error', 'ရှေ့တန်းမှ မှားယွင်းထည့်သွင်းခြင်း'),
            );
            setToast({ tone: 'INFO', text: tr('通知已取消 / Alert cancelled', 'အသိပေးချက် ပယ်ဖျက်ပြီး') });
        } catch (error) {
            setToast({
                tone: 'ERROR',
                text: error instanceof Error ? error.message : tr('取消失败 / Cancel failed', 'ပယ်ဖျက်မရပါ'),
            });
        }
    };

    return (
        <div className="min-h-screen bg-[#F6F7FB] text-[#111111] pb-[calc(env(safe-area-inset-bottom)+6rem)]">
            {toast && (
                <div className={`fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 right-3 z-[1000] mx-auto max-w-lg rounded-2xl border px-4 py-3 shadow-xl flex items-start gap-3 animate-in slide-in-from-top-3 ${
                    toast.tone === 'SUCCESS'
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : toast.tone === 'ERROR'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                    {toast.tone === 'SUCCESS' ? <CheckCircle2 size={20} /> : toast.tone === 'ERROR' ? <AlertTriangle size={20} /> : <BellRing size={20} />}
                    <p className="text-sm font-bold leading-5 flex-1">{toast.text}</p>
                    <button onClick={() => setToast(null)} className="p-1 rounded-lg active:bg-black/5" aria-label="Close"><XCircle size={17} /></button>
                </div>
            )}

            <div className="max-w-xl mx-auto px-3 pt-3 space-y-4">
                <section className="rounded-3xl bg-[#111111] text-white overflow-hidden shadow-lg border border-black/10">
                    <div className="p-5 relative">
                        <div className="absolute -right-8 -top-10 w-32 h-32 rounded-full bg-[#FFD200]/15" />
                        <div className="relative flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-[#FFD200] text-[#111111] flex items-center justify-center shadow-sm shrink-0">
                                    <ChefHat size={23} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h1 className="text-lg font-black tracking-tight">{tr('通知厨房', 'မီးဖိုချောင်သို့ အသိပေးရန်')}</h1>
                                    <p className="text-[10px] text-white/55 font-bold uppercase tracking-[0.16em] mt-0.5">Kitchen Alert · Kepong</p>
                                </div>
                            </div>
                            <div className="rounded-full bg-white/10 border border-white/10 px-2.5 py-1.5 flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${syncError ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
                                <span className="text-[9px] font-black uppercase">{syncError ? 'Offline' : 'Live'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 bg-white/5 p-1.5 border-t border-white/10">
                        <button
                            onClick={() => setViewMode('CREATE')}
                            className={`min-h-12 rounded-2xl px-3 text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${viewMode === 'CREATE' ? 'bg-[#FFD200] text-[#111111] shadow-sm' : 'text-white/60'}`}
                        >
                            <Send size={16} /> {tr('发出通知', 'အသိပေးချက်ပို့ရန်')}
                        </button>
                        <button
                            onClick={() => setViewMode('MY_ALERTS')}
                            className={`min-h-12 rounded-2xl px-3 text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${viewMode === 'MY_ALERTS' ? 'bg-white text-[#111111] shadow-sm' : 'text-white/60'}`}
                        >
                            <Clock3 size={16} /> {tr('我的通知', 'ကျွန်ုပ်၏အသိပေးချက်')}
                            {activeAlertCount > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{activeAlertCount}</span>}
                        </button>
                    </div>
                </section>

                {syncError && (
                    <div className="rounded-2xl bg-red-50 border border-red-200 p-3 flex items-start gap-2 text-red-700">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <p className="text-xs font-bold leading-5">{syncError}</p>
                    </div>
                )}

                {viewMode === 'CREATE' ? (
                    <div className="space-y-4">
                        <section className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-black">{tr('订单资料', 'အော်ဒါအချက်အလက်')}</h2>
                                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">Table & Order Information</p>
                                </div>
                                <span className="text-[9px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-full">* {tr('必填', 'လိုအပ်')}</span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <label className="space-y-1.5">
                                    <span className="text-[10px] font-black text-gray-500 uppercase">{tr('桌号', 'စားပွဲနံပါတ်')} *</span>
                                    <input
                                        value={tableNo}
                                        onChange={event => setTableNo(event.target.value.toUpperCase())}
                                        inputMode="text"
                                        autoComplete="off"
                                        placeholder="A12"
                                        className="w-full h-14 rounded-2xl bg-[#F6F7FB] border-2 border-transparent focus:border-[#FFD200] outline-none px-4 text-lg font-black uppercase"
                                    />
                                </label>
                            </div>
                        </section>

                        <section className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-4 space-y-4">
                            <div>
                                <h2 className="text-sm font-black">{tr('菜品资料', 'ဟင်းပွဲအချက်အလက်')}</h2>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Dish, Size & Quantity</p>
                            </div>

                            <div className="relative">
                                <label className="text-[10px] font-black text-gray-500 uppercase block mb-1.5">{tr('菜单名称或编号', 'ဟင်းပွဲအမည် သို့မဟုတ် နံပါတ်')} *</label>
                                <div className="relative">
                                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={dishQuery}
                                        onChange={event => handleDishInput(event.target.value)}
                                        onFocus={() => setShowDishResults(true)}
                                        autoComplete="off"
                                        placeholder={tr('输入 A01、福建面……', 'A01 သို့မဟုတ် ဟင်းပွဲအမည် ရိုက်ပါ')}
                                        className="w-full h-14 rounded-2xl bg-[#F6F7FB] border-2 border-transparent focus:border-[#FFD200] outline-none pl-11 pr-4 text-sm font-bold"
                                    />
                                </div>

                                {showDishResults && !menuLoading && (
                                    <div className="absolute z-40 left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-2xl bg-white border border-gray-200 shadow-2xl p-1.5">
                                        {filteredMenu.length > 0 ? filteredMenu.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => selectDish(item)}
                                                className="w-full min-h-12 rounded-xl px-3 py-2.5 text-left flex items-center gap-3 hover:bg-[#FFD200]/10 active:bg-[#FFD200]/20"
                                            >
                                                <span className="w-10 h-10 rounded-xl bg-[#111111] text-[#FFD200] text-[10px] font-black flex items-center justify-center shrink-0">{item.id}</span>
                                                <span className="text-xs font-bold leading-4 text-[#111111]">{item.name}</span>
                                            </button>
                                        )) : (
                                            <button
                                                onClick={() => setShowDishResults(false)}
                                                className="w-full rounded-xl p-4 text-left bg-amber-50 border border-amber-100"
                                            >
                                                <p className="text-xs font-black text-amber-800">{tr('菜单中找不到，将使用你输入的菜名', 'မီနူးတွင်မရှိပါ၊ ရိုက်ထားသောအမည်ကို သုံးမည်')}</p>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectedDish && selectedDish.variants.length > 0 && (
                                <div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase block mb-2">{tr('大小', 'အရွယ်အစား')}</span>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        {selectedDish.variants.map(variant => (
                                            <button
                                                key={variant.label}
                                                onClick={() => setSize(variant.label)}
                                                className={`shrink-0 min-h-11 px-4 rounded-xl border-2 text-xs font-black active:scale-95 transition-all ${size === variant.label ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : 'bg-white text-gray-600 border-gray-200'}`}
                                            >
                                                {variant.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!selectedDish && dishQuery.trim() && (
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-black text-gray-500 uppercase">{tr('大小（选填）', 'အရွယ်အစား（မဖြည့်လည်းရ）')}</span>
                                    <input
                                        value={size}
                                        onChange={event => setSize(event.target.value)}
                                        placeholder="S / M / L"
                                        className="w-full h-12 rounded-2xl bg-[#F6F7FB] border-2 border-transparent focus:border-[#FFD200] outline-none px-4 text-sm font-bold"
                                    />
                                </label>
                            )}

                            <div className="flex items-center justify-between rounded-2xl bg-[#F6F7FB] p-3">
                                <div>
                                    <p className="text-xs font-black">{tr('数量', 'အရေအတွက်')}</p>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase">Quantity</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setQuantity(value => Math.max(1, value - 1))}
                                        className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 shadow-sm"
                                        aria-label="Decrease quantity"
                                    ><Minus size={21} /></button>
                                    <span className="w-10 text-center text-2xl font-black tabular-nums">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(value => Math.min(99, value + 1))}
                                        className="w-12 h-12 rounded-2xl bg-[#FFD200] border border-[#FFD200] flex items-center justify-center active:scale-90 shadow-sm"
                                        aria-label="Increase quantity"
                                    ><Plus size={21} /></button>
                                </div>
                            </div>
                        </section>

                        <section className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-4 space-y-4">
                            <div>
                                <h2 className="text-sm font-black">{tr('通知原因', 'အသိပေးရသည့်အကြောင်း')}</h2>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Issue Type & Priority</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {ALERT_TYPE_OPTIONS.map(option => {
                                    const Icon = option.icon;
                                    const selected = alertType === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => setAlertType(option.value)}
                                            className={`min-h-12 rounded-2xl border-2 px-3 flex items-center gap-2 text-left active:scale-[0.97] transition-all ${selected ? 'bg-[#FFD200]/15 border-[#FFD200] text-[#111111]' : 'bg-white border-gray-200 text-gray-500'}`}
                                        >
                                            <Icon size={17} className={selected ? 'text-amber-600' : 'text-gray-400'} />
                                            <span className="text-[11px] font-black">{lang === 'my' ? option.my : option.zh}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F6F7FB] p-1.5">
                                <button
                                    onClick={() => setPriority('NOTICE')}
                                    className={`min-h-12 rounded-xl text-xs font-black transition-all ${priority === 'NOTICE' ? 'bg-white text-[#111111] shadow-sm border border-gray-200' : 'text-gray-400'}`}
                                >{tr('一般注意', 'ပုံမှန်သတိ')} · Notice</button>
                                <button
                                    onClick={() => setPriority('URGENT')}
                                    className={`min-h-12 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${priority === 'URGENT' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-400'}`}
                                ><AlertTriangle size={15} /> {tr('紧急处理', 'အရေးပေါ်')} · Urgent</button>
                            </div>

                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-black text-gray-500 uppercase">{tr('备注（选填）', 'မှတ်ချက်（မဖြည့်လည်းရ）')}</span>
                                <textarea
                                    value={note}
                                    onChange={event => setNote(event.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    placeholder={tr('例如：客人已经等很久、少辣、重新做……', 'ဥပမာ：ဧည့်သည်စောင့်နေတာကြာပြီ၊ အစပ်လျှော့……')}
                                    className="w-full rounded-2xl bg-[#F6F7FB] border-2 border-transparent focus:border-[#FFD200] outline-none p-3.5 text-sm font-medium resize-none"
                                />
                                <div className="text-right text-[9px] text-gray-400 font-bold">{note.length}/500</div>
                            </label>
                        </section>

                        {formError && (
                            <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-red-700 flex items-start gap-2">
                                <AlertTriangle size={18} className="shrink-0" />
                                <p className="text-xs font-bold leading-5">{formError}</p>
                            </div>
                        )}

                        <div className="sticky bottom-2 z-30 rounded-3xl bg-white/95 backdrop-blur-xl border border-gray-200 shadow-[0_14px_40px_rgba(0,0,0,0.16)] p-2">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full min-h-14 rounded-2xl bg-[#FFD200] text-[#111111] font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <><span className="w-5 h-5 rounded-full border-2 border-black/20 border-t-black animate-spin" /> {tr('正在通知厨房……', 'မီးဖိုချောင်သို့ ပို့နေသည်……')}</>
                                ) : (
                                    <><BellRing size={20} strokeWidth={2.5} /> {tr('立即通知厨房', 'မီးဖိုချောင်သို့ ချက်ချင်းပို့ရန်')} <span className="text-[10px] opacity-50">Send Alert</span></>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div>
                                <h2 className="text-sm font-black">{tr('我今天发出的通知', 'ယနေ့ပို့ထားသော အသိပေးချက်များ')}</h2>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Live Kitchen Status</p>
                            </div>
                            <span className="text-[10px] font-black bg-white border border-gray-200 rounded-full px-2.5 py-1">{myAlerts.length}</span>
                        </div>

                        {alertsLoading ? (
                            <div className="bg-white rounded-3xl border border-gray-200 p-10 flex flex-col items-center gap-3">
                                <span className="w-7 h-7 rounded-full border-3 border-gray-200 border-t-[#FFD200] animate-spin" />
                                <p className="text-xs font-bold text-gray-400">{tr('正在同步……', 'ချိတ်ဆက်နေသည်……')}</p>
                            </div>
                        ) : myAlerts.length === 0 ? (
                            <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center">
                                <Utensils size={42} className="mx-auto text-gray-200 mb-3" />
                                <h3 className="text-sm font-black text-gray-500">{tr('今天还没有通知厨房', 'ယနေ့ မီးဖိုချောင်သို့ အသိပေးချက်မရှိသေးပါ')}</h3>
                                <button onClick={() => setViewMode('CREATE')} className="mt-4 min-h-11 px-5 rounded-xl bg-[#FFD200] text-[#111111] text-xs font-black active:scale-95">
                                    {tr('发出第一项通知', 'ပထမအသိပေးချက် ပို့ရန်')}
                                </button>
                            </div>
                        ) : myAlerts.map(alert => {
                            const statusMeta = getStatusMeta(alert.status, lang);
                            const typeMeta = ALERT_TYPE_OPTIONS.find(option => option.value === alert.alertType);
                            return (
                                <article
                                    key={alert.id}
                                    className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${alert.priority === 'URGENT' && alert.isActive ? 'border-red-300 ring-2 ring-red-50' : 'border-gray-200'}`}
                                >
                                    <div className={`h-1.5 ${alert.status === 'RESOLVED' ? 'bg-green-500' : alert.status === 'ACKNOWLEDGED' ? 'bg-blue-500' : alert.status === 'CANCELLED' ? 'bg-gray-300' : alert.priority === 'URGENT' ? 'bg-red-500' : 'bg-[#FFD200]'}`} />
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className="w-14 h-14 rounded-2xl bg-[#111111] text-[#FFD200] flex flex-col items-center justify-center shrink-0">
                                                    <span className="text-[8px] font-bold uppercase opacity-60">Table</span>
                                                    <span className="text-lg font-black leading-5 truncate max-w-[3rem]">{alert.tableNo}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-sm font-black leading-5 text-[#111111]">{alert.dishName}</h3>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                        {alert.size && <span className="text-[10px] font-black bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{alert.size}</span>}
                                                        <span className="text-[10px] font-black bg-[#FFD200]/20 text-amber-800 px-2 py-1 rounded-lg">× {alert.quantity}</span>
                                                        {alert.priority === 'URGENT' && <span className="text-[10px] font-black bg-red-50 text-red-600 px-2 py-1 rounded-lg">URGENT</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400 shrink-0">{formatElapsed(alert.createdAt, nowMs, lang)}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F6F7FB] p-3">
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 uppercase">Order No.</p>
                                                <p className="text-xs font-black mt-0.5 truncate">{alert.orderNo}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 uppercase">Issue Type</p>
                                                <p className="text-xs font-black mt-0.5 truncate">{typeMeta ? (lang === 'my' ? typeMeta.my : typeMeta.zh) : alert.alertType}</p>
                                            </div>
                                        </div>

                                        {alert.note && (
                                            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                                                <p className="text-[9px] text-amber-600 font-black uppercase mb-1">Note</p>
                                                <p className="text-xs font-bold text-amber-900 leading-5">{alert.note}</p>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between gap-3">
                                            <div className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 ${statusMeta.className}`}>
                                                <span className={`w-2 h-2 rounded-full ${statusMeta.dot} ${alert.isActive ? 'animate-pulse' : ''}`} />
                                                <span className="text-[10px] font-black">{statusMeta.label}</span>
                                            </div>
                                            {alert.status === 'NEW' && (
                                                <button
                                                    onClick={() => handleCancel(alert)}
                                                    className="min-h-10 px-3 rounded-xl border border-red-100 bg-red-50 text-red-600 text-[10px] font-black active:scale-95"
                                                >{tr('输入错了，取消', 'မှားထည့်၊ ပယ်ဖျက်')}</button>
                                            )}
                                        </div>

                                        {alert.status === 'ACKNOWLEDGED' && alert.acknowledgedByName && (
                                            <p className="text-[10px] text-blue-600 font-bold">{tr('厨房接收人', 'မီးဖိုချောင် လက်ခံသူ')}：{alert.acknowledgedByName}</p>
                                        )}
                                        {alert.status === 'RESOLVED' && (
                                            <div className="flex items-center gap-2 text-green-700">
                                                <CheckCircle2 size={17} />
                                                <p className="text-[10px] font-black">{tr('完成处理', 'ဖြေရှင်းပြီး')} · {alert.resolvedByName || 'Kitchen'}</p>
                                            </div>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>
        </div>
    );
};

