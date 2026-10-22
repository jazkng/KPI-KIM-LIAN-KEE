import React from 'react';
import {
    AlertTriangle, AlarmClock, Banknote, Flag, BookOpen, Calculator, CalendarClock, CalendarOff, CheckSquare, ClipboardCheck, Clock,
    Coffee, CreditCard, Eye, FileText, PenTool, ShoppingCart, Star, Truck, UserX, type LucideIcon,
} from 'lucide-react';
import type { InboxKey } from '../../utils/management/managerInbox';

/**
 * 管理层页面的图标：跟老板页「全部功能」同一套（线条图标 + 淡色底），不再用表情符号。
 * 颜色对照 BossDashboard 的卡片设定。
 */
export interface IconStyle { Icon: LucideIcon; bg: string; fg: string }

export const MODULE_ICON: Record<string, IconStyle> = {
    SETTLEMENT: { Icon: Calculator, bg: 'bg-amber-50', fg: 'text-amber-600' },
    LOGBOOK: { Icon: PenTool, bg: 'bg-orange-50', fg: 'text-orange-500' },
    LOGBOOK_VIEW: { Icon: BookOpen, bg: 'bg-emerald-50', fg: 'text-emerald-500' },
    SOP_INSPECT: { Icon: ClipboardCheck, bg: 'bg-violet-50', fg: 'text-violet-500' },
    INVENTORY_CHECK: { Icon: CheckSquare, bg: 'bg-blue-50', fg: 'text-blue-500' },
    TASK_STOCKTAKE: { Icon: CheckSquare, bg: 'bg-blue-50', fg: 'text-blue-500' },
    INVENTORY_VIEW: { Icon: Eye, bg: 'bg-purple-50', fg: 'text-purple-600' },
    PROCUREMENT: { Icon: ShoppingCart, bg: 'bg-lime-50', fg: 'text-lime-600' },
    SUPPLIER_CONTACTS: { Icon: Truck, bg: 'bg-blue-50', fg: 'text-blue-600' },
    MENU_MANAGEMENT: { Icon: Coffee, bg: 'bg-amber-50', fg: 'text-amber-600' },
    AP: { Icon: CreditCard, bg: 'bg-rose-50', fg: 'text-rose-600' },
    SELF_INVOICE: { Icon: FileText, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
    STAFF_CASH: { Icon: Banknote, bg: 'bg-emerald-50', fg: 'text-emerald-700' },
    ATTENDANCE_CONSOLE: { Icon: Clock, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
    ROSTER: { Icon: CalendarOff, bg: 'bg-rose-50', fg: 'text-rose-500' },
    ASSESSMENT: { Icon: Star, bg: 'bg-cyan-50', fg: 'text-cyan-600' },
};

export const INBOX_ICON: Record<InboxKey, IconStyle> = {
    tasksToConfirm: { Icon: ClipboardCheck, bg: 'bg-amber-50', fg: 'text-amber-600' },
    tasksOverdue: { Icon: AlarmClock, bg: 'bg-rose-50', fg: 'text-rose-600' },
    bossMatters: { Icon: Flag, bg: 'bg-red-50', fg: 'text-red-600' },
    settlementDrafts: MODULE_ICON.SETTLEMENT,
    absences: { Icon: UserX, bg: 'bg-rose-50', fg: 'text-rose-500' },
    lowStock: { Icon: AlertTriangle, bg: 'bg-red-50', fg: 'text-red-600' },
    poToReceive: { Icon: Truck, bg: 'bg-lime-50', fg: 'text-lime-600' },
    inventoryTasks: MODULE_ICON.INVENTORY_CHECK,
    rosterPending: { Icon: CalendarClock, bg: 'bg-rose-50', fg: 'text-rose-500' },
};

const FALLBACK: IconStyle = { Icon: FileText, bg: 'bg-stone-100', fg: 'text-stone-700' };

/** 淡色圆角方块里放线条图标（跟老板页卡片一样） */
export const IconTile: React.FC<{ style?: IconStyle; size?: 'sm' | 'md' }> = ({ style = FALLBACK, size = 'md' }) => {
    const { Icon, bg, fg } = style;
    return <span className={`${size === 'sm' ? 'w-9 h-9 rounded-lg' : 'w-10 h-10 md:w-11 md:h-11 rounded-xl'} ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={size === 'sm' ? 16 : 18} className={fg} />
    </span>;
};

export const moduleIcon = (key: string) => MODULE_ICON[key] || FALLBACK;
