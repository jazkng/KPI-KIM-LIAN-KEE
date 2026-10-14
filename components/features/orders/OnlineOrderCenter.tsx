// ============================================================================
// ERP 网站订单中心（Issue #8 · 任务四）
// ----------------------------------------------------------------------------
// 顾客在 kimliankee.app 下的订单（由公开 API 写入 online_orders）在这里由店员处理：
// 接单 / 拒单 / 开始备餐 / 备餐完成 / 顾客取走 / 取消，以及「已在 POS 收款」或免单。
// - 不使用旧的 Kitchen Alert；备餐状态就在这里管理。
// - 网站订单金额不计入营业额：顾客在柜台用 POS 结账，营业额以 POS 日结为准。
// - 每个操作都在交易内写审计事件；电话预设只显示末 4 码。
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Loader2, Phone, X } from 'lucide-react';
import type { Employee } from '../../../types';
import { db } from '../../../firebaseConfig';
import { getBusinessDateString } from '../../../utils/dateHelper';
import { playNotificationChime, unlockNotificationSound } from '../../../utils/notificationSound';
import {
    ACTION_LABEL,
    PAYMENT_LABEL,
    STATUS_LABEL,
    availableActions,
    formatSen,
    maskPhone,
    summariseOrders,
    type OnlineOrder,
    type OrderStatus,
    type StaffAction,
    ONLINE_ORDER_STAFF_ACTIONS_ENABLED,
} from '../../../utils/onlineOrders/orderModel';
import { performOrderAction, subscribeOrdersByBusinessDate } from '../../../utils/onlineOrders/orderService';

interface Props {
    onClose?: () => void;
    currentEmployee?: Employee | null;
}

type Tab = 'PENDING' | 'ACTIVE' | 'READY' | 'DONE' | 'CLOSED';

const TABS: { key: Tab; label: string; statuses: OrderStatus[] }[] = [
    { key: 'PENDING', label: '待确认', statuses: ['PENDING_CONFIRMATION'] },
    { key: 'ACTIVE', label: '备餐中', statuses: ['ACCEPTED', 'PREPARING'] },
    { key: 'READY', label: '可取餐', statuses: ['READY'] },
    { key: 'DONE', label: '已取走', statuses: ['COMPLETED'] },
    { key: 'CLOSED', label: '拒单/取消', statuses: ['REJECTED', 'CANCELLED', 'EXPIRED'] },
];

const STATUS_STYLE: Partial<Record<OrderStatus, string>> = {
    PENDING_CONFIRMATION: 'bg-amber-100 text-amber-800',
    ACCEPTED: 'bg-sky-100 text-sky-800',
    PREPARING: 'bg-sky-100 text-sky-800',
    READY: 'bg-emerald-100 text-emerald-800',
    COMPLETED: 'bg-stone-200 text-stone-700',
};

const NEEDS_REASON: StaffAction[] = ['REJECT', 'CANCEL', 'WAIVE'];
const PRIMARY: StaffAction[] = ['ACCEPT', 'START_PREPARING', 'MARK_READY', 'COMPLETE'];

const timeOf = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
};

export const OnlineOrderCenter: React.FC<Props> = ({ onClose, currentEmployee }) => {
    const [businessDate, setBusinessDate] = useState(getBusinessDateString());
    const [orders, setOrders] = useState<OnlineOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('PENDING');
    const [soundOn, setSoundOn] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [dialog, setDialog] = useState<{ order: OnlineOrder; action: StaffAction } | null>(null);
    const lastPending = useRef<Set<string> | null>(null);
    const soundRef = useRef(false);
    useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

    const actor = currentEmployee
        ? { id: currentEmployee.id, name: currentEmployee.name, orgLevel: currentEmployee.orgLevel }
        : null;

    useEffect(() => {
        setLoading(true);
        setError(null);
        lastPending.current = null;
        const unsub = subscribeOrdersByBusinessDate(
            db,
            businessDate,
            list => {
                setOrders(list);
                setLoading(false);
                // 新的待确认订单 → 提示音（第一次载入不响）
                const pending = new Set(list.filter(o => o.status === 'PENDING_CONFIRMATION').map(o => o.id));
                if (lastPending.current && [...pending].some(id => !lastPending.current!.has(id)) && soundRef.current) playNotificationChime(true);
                lastPending.current = pending;
            },
            e => {
                setError(`读取订单失败：${e.message}`);
                setLoading(false);
            },
        );
        return unsub;
    }, [businessDate]);

    const summary = useMemo(() => summariseOrders(orders), [orders]);
    const visible = useMemo(() => {
        const statuses = TABS.find(t => t.key === tab)!.statuses;
        return orders.filter(o => statuses.includes(o.status));
    }, [orders, tab]);
    const tabCount = (t: (typeof TABS)[number]) => orders.filter(o => t.statuses.includes(o.status)).length;

    const run = async (order: OnlineOrder, action: StaffAction, input: { reason?: string; posReceiptNo?: string } = {}) => {
        if (!actor || !ONLINE_ORDER_STAFF_ACTIONS_ENABLED) return;
        setBusyId(order.id);
        setError(null);
        try {
            await performOrderAction(db, order.id, action, actor, { ...input, storeId: 'KEPONG' });
            setDialog(null);
        } catch (e) {
            setError((e as Error).message || '操作失败');
        } finally {
            setBusyId(null);
        }
    };

    const onAction = (order: OnlineOrder, action: StaffAction) => {
        if (NEEDS_REASON.includes(action) || action === 'MARK_PAID') setDialog({ order, action });
        else run(order, action);
    };

    return (
        <div className="flex min-h-full flex-col bg-stone-50 text-stone-900">
            <header className="sticky top-0 z-10 space-y-3 border-b border-stone-200 bg-white px-4 py-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-black">网站订单</h2>
                        <p className="text-[11px] font-bold text-stone-500">kimliankee.app 的顾客订单 · 不计入营业额（以 POS 日结为准）</p>
                    </div>
                    <button
                        onClick={async () => { if (!soundOn) await unlockNotificationSound(); setSoundOn(v => !v); }}
                        className={`min-h-[44px] min-w-[44px] rounded-xl ${soundOn ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'}`}
                        aria-label={soundOn ? '关闭新单提示音' : '开启新单提示音'}
                    >
                        {soundOn ? <Bell className="mx-auto" size={18} /> : <BellOff className="mx-auto" size={18} />}
                    </button>
                    <input type="date" value={businessDate} onChange={e => e.target.value && setBusinessDate(e.target.value)} className="min-h-[44px] rounded-xl border border-stone-300 px-2 text-sm font-bold" aria-label="营业日" />
                    {onClose && (
                        <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-stone-500 hover:bg-stone-100" aria-label="关闭"><X className="mx-auto" size={20} /></button>
                    )}
                </div>
                <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-black ${tab === t.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
                        >
                            {t.label} {tabCount(t) > 0 && <span className="ml-1 opacity-80">{tabCount(t)}</span>}
                        </button>
                    ))}
                </nav>
            </header>

            <main className="flex-1 space-y-3 p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                {!ONLINE_ORDER_STAFF_ACTIONS_ENABLED && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">
                        🔒 预览模式：接单、备餐、取餐、标记收款等操作暂未启用，只能查看订单。
                        <span className="block font-medium">启用前需完成：① 后台权限（正式 Rules 与员工身份）② 网站订单 API 与订单去重验证。负责人确认后开启。</span>
                    </div>
                )}
                {!actor && <div className="rounded-xl border border-stone-200 bg-white p-3 text-xs font-bold text-stone-500">目前没有登录身份，只能查看订单。</div>}
                {summary.collectedUnpaid > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                        ⚠️ 有 {summary.collectedUnpaid} 张订单顾客已取走，但还没标记「已在 POS 收款」，请核对 POS。
                    </div>
                )}
                {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
                {loading && <div className="flex items-center gap-2 text-sm font-bold text-stone-500"><Loader2 size={16} className="animate-spin" /> 读取中…</div>}
                {!loading && visible.length === 0 && <div className="py-10 text-center text-sm font-bold text-stone-400">这个分类没有订单</div>}

                {visible.map(order => (
                    <OrderCard key={order.id} order={order} actions={actor ? availableActions(order, actor) : []} busy={busyId === order.id} locked={!ONLINE_ORDER_STAFF_ACTIONS_ENABLED} onAction={a => onAction(order, a)} />
                ))}

                <p className="pt-2 text-[11px] leading-relaxed text-stone-500">
                    网站订单只是顾客的点单，提交订单不等于付款。顾客在柜台以 POS 结账后，请按「已在 POS 收款」并填写 POS 单号；
                    营业额一律以 POS 日结为准，这里的金额不计入营业额或损益。今日已在 POS 结账 {summary.paidAtPosCount} 单。
                </p>
            </main>

            {dialog && (
                <ActionDialog
                    order={dialog.order}
                    action={dialog.action}
                    busy={busyId === dialog.order.id}
                    onCancel={() => setDialog(null)}
                    onConfirm={input => run(dialog.order, dialog.action, input)}
                />
            )}
        </div>
    );
};

const OrderCard: React.FC<{ order: OnlineOrder; actions: StaffAction[]; busy: boolean; locked?: boolean; onAction: (a: StaffAction) => void }> = ({ order, actions, busy, locked, onAction }) => {
    const [showPhone, setShowPhone] = useState(false);
    const primary = actions.filter(a => PRIMARY.includes(a));
    const secondary = actions.filter(a => !PRIMARY.includes(a));
    return (
        <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black">{order.orderNo}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_STYLE[order.status] || 'bg-red-100 text-red-700'}`}>{STATUS_LABEL[order.status]}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${order.paymentStatus === 'UNPAID' ? 'bg-stone-100 text-stone-600' : 'bg-emerald-100 text-emerald-800'}`}>{PAYMENT_LABEL[order.paymentStatus]}</span>
                <span className="ml-auto text-xs font-bold text-stone-500">下单 {timeOf(order.createdAt)}</span>
            </div>
            <div className="mt-1 text-sm font-bold text-stone-700">
                取餐：{order.pickup?.type === 'SCHEDULED' && order.pickup.time ? `预约 ${timeOf(order.pickup.time)}` : '尽快'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">{order.customer?.name}</span>
                {showPhone ? (
                    <a href={`tel:${order.customer?.phone}`} className="flex items-center gap-1 font-bold text-sky-700"><Phone size={14} /> {order.customer?.phone}</a>
                ) : (
                    <button onClick={() => setShowPhone(true)} className="min-h-[32px] rounded-lg bg-stone-100 px-2 text-xs font-bold text-stone-600">{maskPhone(order.customer?.phone)} · 显示电话</button>
                )}
            </div>

            <ul className="mt-3 divide-y divide-stone-100 rounded-xl bg-stone-50">
                {order.lines?.map((l, i) => (
                    <li key={i} className="flex gap-3 px-3 py-2 text-sm">
                        <span className="font-black">{l.quantity}×</span>
                        <div className="min-w-0 flex-1">
                            <div className="font-bold">{l.itemName} <span className="font-normal text-stone-500">{l.variantLabel}</span></div>
                            {(l.optionLabels?.length > 0 || l.note) && (
                                <div className="text-xs text-stone-500">{[...(l.optionLabels || []), l.note].filter(Boolean).join(' · ')}</div>
                            )}
                        </div>
                        <span className="text-xs text-stone-500">{formatSen(l.lineTotalSen)}</span>
                    </li>
                ))}
            </ul>
            {order.orderNote && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">备注：{order.orderNote}</p>}
            <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-xs text-stone-500">订单金额（顾客须在柜台结账）</span>
                <span className="font-black">{formatSen(order.totals?.totalSen)}</span>
            </div>
            {order.reason && <p className="mt-1 text-xs text-red-600">原因：{order.reason}</p>}
            {order.posReceiptNo && <p className="mt-1 text-xs text-emerald-700">POS 单号：{order.posReceiptNo}</p>}

            {actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {primary.map(a => (
                        <button key={a} disabled={busy || locked} title={locked ? '预览模式：操作暂未启用' : undefined} onClick={() => onAction(a)} className="min-h-[48px] flex-1 rounded-xl bg-stone-900 px-4 text-sm font-black text-white disabled:opacity-50">
                            {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : ACTION_LABEL[a]}
                        </button>
                    ))}
                    {secondary.map(a => (
                        <button key={a} disabled={busy || locked} title={locked ? '预览模式：操作暂未启用' : undefined} onClick={() => onAction(a)} className={`min-h-[48px] rounded-xl border px-4 text-sm font-bold disabled:opacity-50 ${a === 'MARK_PAID' ? 'border-emerald-300 text-emerald-800' : 'border-stone-300 text-stone-600'}`}>
                            {ACTION_LABEL[a]}
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
};

const ActionDialog: React.FC<{
    order: OnlineOrder;
    action: StaffAction;
    busy: boolean;
    onCancel: () => void;
    onConfirm: (input: { reason?: string; posReceiptNo?: string }) => void;
}> = ({ order, action, busy, onCancel, onConfirm }) => {
    const [value, setValue] = useState('');
    const isPaid = action === 'MARK_PAID';
    return (
        <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 md:items-center">
            <div className="w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 md:rounded-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                <h3 className="text-lg font-black">{ACTION_LABEL[action]} · {order.orderNo}</h3>
                <p className="text-sm text-stone-600">
                    {isPaid
                        ? '请先在 POS 为这张订单结账，再填写 POS 单号。一张 POS 单只能对应一张网站订单。'
                        : action === 'WAIVE'
                            ? '免单只限管理层以上，须填写原因，会写入审计记录。'
                            : '原因会显示给顾客，并写入审计记录。'}
                </p>
                <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={isPaid ? 'POS 单号，例如 R00123' : '原因'}
                    className="min-h-[48px] w-full rounded-xl border border-stone-300 px-3 text-base"
                />
                <div className="flex gap-2">
                    <button onClick={onCancel} className="min-h-[48px] flex-1 rounded-xl border border-stone-300 font-bold text-stone-600">返回</button>
                    <button
                        disabled={!value.trim() || busy}
                        onClick={() => onConfirm(isPaid ? { posReceiptNo: value } : { reason: value })}
                        className="min-h-[48px] flex-1 rounded-xl bg-stone-900 font-black text-white disabled:opacity-40"
                    >
                        {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : '确认'}
                    </button>
                </div>
            </div>
        </div>
    );
};
