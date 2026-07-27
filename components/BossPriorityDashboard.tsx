import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Users, Crown, Banknote, Coffee, Truck, Armchair, CheckSquare, PenTool, BookOpen, CalendarOff, 
    ClipboardCheck, Layout, Box, Eye, FileBarChart, Clock, CreditCard, Wallet, ShieldCheck,
    AlertTriangle, ShoppingCart, Megaphone, Target, PartyPopper, Vote, TrendingUp, Award, Languages, X,
    FileText, Calculator, Bell, ChevronRight, TrendingDown, RefreshCw, Sparkles, UserCheck, DollarSign, LogOut,
    Activity, CalendarClock, CircleDollarSign, Gauge, ArrowUpRight, ListChecks, Store, Boxes, Receipt, UserRoundCheck
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Employee, SettlementRecord, ExpenseItem } from '../types';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { DataManager } from '../utils/dataManager';
import { needsReplenishment } from '../utils/unitConversion';

// Import Modals so we can open them directly from the Priority Dashboard
import { HRSystem } from './features/HRSystem';
import { MenuManagement } from './features/MenuManagement';
import { RecurringBillsModule } from './features/RecurringBillsModule';
import { OrgChart } from './features/OrgChart';
import { FinancialReport } from './features/FinancialReport';
import { AttendanceConsole } from './features/AttendanceConsole';
import { AccountsPayableModule } from './features/ap/AccountsPayableModule';
import { TreasuryModule } from './features/TreasuryModule'; 
import { WarrantyModule } from './features/WarrantyModule'; 
import { EventsPlanningModule } from './features/EventsPlanningModule';
import { PriceMonitorModule } from './features/PriceMonitorModule'; 
import { EmployeeAssessmentModule } from './features/EmployeeAssessmentModule';
import { TranslationManager } from './features/TranslationManager'; 
import { SelfInvoiceModule } from './features/SelfInvoiceModule';
import { AIOperationsAssistant } from './features/AIOperationsAssistant';

interface BossPriorityDashboardProps {
    currentEmployee: Employee;
    onNavigate: (tab: string) => void;
    onOpenConfig?: () => void;
    onLogout?: () => void;
}

type ActiveModal = 'NONE' | 'HR' | 'MENU' | 'BILLS' | 'ORG' | 'REPORTS' | 'ATTENDANCE' | 'AP' | 'TREASURY' | 'WARRANTY' | 'PLANNING' | 'PRICE_MONITOR' | 'ASSESSMENT' | 'TRANSLATION' | 'SELF_INVOICE';

interface ToDoItem {
    id: string;
    title: string;
    count: number;
    amount?: number;
    description: string;
    severity: 'EMERGENCY' | 'WARNING' | 'NORMAL';
    category: 'SALES' | 'FINANCE' | 'INVENTORY' | 'PEOPLE' | 'OPERATIONS';
    decisionLevel: 'BOSS' | 'MANAGEMENT' | 'WATCH';
    score: number;
    impactLabel?: string;
    deadlineLabel?: string;
    ownerLabel: string;
    actionLabel: string;
    onClick: () => void;
}

const normalizeDateOnly = (value: unknown): string => {
    const datePart = String(value || '').split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
};

const shiftDate = (dateValue: unknown, days: number): string => {
    const datePart = normalizeDateOnly(dateValue);
    if (!datePart) return '';
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (!Number.isFinite(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getEffectiveAPDueDate = (item: ExpenseItem): string =>
    normalizeDateOnly(item.dueDate) || shiftDate(item.time, 15);

const sortSettlementsNewestFirst = (records: SettlementRecord[]): SettlementRecord[] =>
    [...records].sort((a, b) => {
        const dateOrder = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateOrder !== 0) return dateOrder;
        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });

export const BossPriorityDashboard: React.FC<BossPriorityDashboardProps> = ({ currentEmployee, onNavigate, onOpenConfig, onLogout }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');
    const [aiOpen, setAiOpen] = useState(false);

    // States for holding loaded database values
    const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
    const [pendingPOCount, setPendingPOCount] = useState<number>(0);
    const [lowStockCount, setLowStockCount] = useState<number | null>(null);
    const [criticalLowStockCount, setCriticalLowStockCount] = useState<number | null>(null);
    const [absentCount, setAbsentCount] = useState<number | null>(null);
    const [pendingBillsCount, setPendingBillsCount] = useState<number | null>(null);
    const [pendingBillsAmount, setPendingBillsAmount] = useState<number | null>(null);
    const [overdueBillsCount, setOverdueBillsCount] = useState<number | null>(null);
    const [overdueBillsAmount, setOverdueBillsAmount] = useState<number | null>(null);
    const [unacknowledgedLogsCount, setUnacknowledgedLogsCount] = useState<number | null>(null);
    const [unpaidAPCount, setUnpaidAPCount] = useState<number | null>(null);
    const [unpaidAPAmount, setUnpaidAPAmount] = useState<number | null>(null);
    const [dueSoonAPCount, setDueSoonAPCount] = useState<number | null>(null);
    const [dueSoonAPAmount, setDueSoonAPAmount] = useState<number | null>(null);
    const [overdueAPCount, setOverdueAPCount] = useState<number | null>(null);
    const [overdueAPAmount, setOverdueAPAmount] = useState<number | null>(null);
    const [totalUnpaidBillsCount, setTotalUnpaidBillsCount] = useState<number | null>(null);
    const [totalUnpaidBillsAmount, setTotalUnpaidBillsAmount] = useState<number | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
    const [monthlyBudget] = useState<number>(150000); // 默认每月目标 RM 150,000
    const previousActiveModalRef = useRef<ActiveModal>('NONE');

    // Notify parent App.tsx when activeModal changes (for hiding bottom navigation)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).bossActiveModal = activeModal;
            window.dispatchEvent(new Event('boss-modal-change'));
        }
    }, [activeModal]);

    const fetchData = async () => {
        try {
            // Get today's Malaysia (UTC+8) date string
            const now = new Date();
            const utc8 = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3600000 * 8));
            const todayStr = utc8.toISOString().split('T')[0];
            const yr = utc8.getFullYear();
            const mo = utc8.getMonth() + 1;

            // 1. Fetch settlements
            const fetchedSettlements = await DataManager.getSettlements();
            setSettlements(fetchedSettlements);

            // 2. Count only purchase orders that are still waiting to be received.
            // This uses a Firestore server-side aggregation instead of downloading
            // up to 200 complete purchase-order documents.
            const pendingPurchaseOrders = await DataManager.getPendingPurchaseOrderCount();
            setPendingPOCount(pendingPurchaseOrders);

            // 3. Fetch Stock and compute low stock count
            const [kitchenStock, barStock, generalStock, fuelStock] = await Promise.all([
                DataManager.getStock('KITCHEN'),
                DataManager.getStock('BAR'),
                DataManager.getStock('GENERAL'),
                DataManager.getStock('FUEL')
            ]);
            const combinedStock = [...kitchenStock, ...barStock, ...generalStock, ...fuelStock];
            const lowStockItems = combinedStock.filter(needsReplenishment);
            setLowStockCount(lowStockItems.length);
            setCriticalLowStockCount(lowStockItems.filter(item => item.isKeyItem).length);

            // 4. Fetch Roster and compute absent count for today
            try {
                const rosterRes = await DataManager.getRosterData();
                const todayRoster = rosterRes.roster?.[todayStr] || {};
                const abCount = Object.values(todayRoster).filter((s: any) => s === 'MC' || s === 'ABSENT').length;
                setAbsentCount(abCount);
            } catch (e) {
                console.error('Failed to parse roster MC status', e);
                setAbsentCount(0);
            }

            // 5. Fetch recurring bills and check due status
            try {
                const bills = await DataManager.getRecurringBills();
                let dueBills = 0;
                let dueBillsAmount = 0;
                let overdueBills = 0;
                let overdueAmount = 0;
                let totalUnpaidCount = 0;
                let totalUnpaidAmount = 0;
                bills.forEach((bill: any) => {
                    if (bill.isActive === false || bill.isArchived === true) return;
                    let due: Date | null = null;
                    let isPaid = false;
                    if (bill.type === 'YEARLY') {
                        due = new Date(yr, (bill.dueMonth || 1) - 1, bill.dueDay || 1);
                        const lastYr = bill.lastPaidDate ? new Date(bill.lastPaidDate).getFullYear() : 0;
                        isPaid = lastYr >= yr;
                    } else if (bill.type === 'MONTHLY') {
                        due = new Date(yr, mo - 1, bill.dueDay || 1);
                        isPaid = bill.lastPaidDate ? (() => { const d = new Date(bill.lastPaidDate); return d.getFullYear() === yr && d.getMonth() + 1 === mo; })() : false;
                    }
                    if (!due || isPaid) return;
                    const amount = Number(bill.amount) || 0;
                    totalUnpaidCount++;
                    totalUnpaidAmount += amount;
                    const diff = Math.ceil((due.getTime() - utc8.getTime()) / 86400000);
                    if (diff < 0) {
                        overdueBills++;
                        overdueAmount += amount;
                    } else if (diff <= 7) {
                        dueBills++;
                        dueBillsAmount += amount;
                    }
                });
                setTotalUnpaidBillsCount(totalUnpaidCount);
                setTotalUnpaidBillsAmount(totalUnpaidAmount);
                setPendingBillsCount(dueBills);
                setPendingBillsAmount(dueBillsAmount);
                setOverdueBillsCount(overdueBills);
                setOverdueBillsAmount(overdueAmount);
            } catch (e) {
                console.error('Failed to parse recurring bills', e);
                setPendingBillsCount(0);
                setPendingBillsAmount(0);
                setOverdueBillsCount(0);
                setOverdueBillsAmount(0);
                setTotalUnpaidBillsCount(0);
                setTotalUnpaidBillsAmount(0);
            }

            // 6. Check the boss's unread state in the latest 30 operational logs.
            // The notification centre also keeps the latest 30 items, so the
            // dashboard no longer downloads 200 complete log documents.
            try {
                const logs = await DataManager.getRecentLogs(30);
                const unackCount = logs.filter(log =>
                    !(log.readReceipts || []).some(receipt => receipt.employeeId === currentEmployee.id)
                ).length;
                setUnacknowledgedLogsCount(unackCount);
            } catch (e) {
                console.error('Failed to parse logs count', e);
                setUnacknowledgedLogsCount(0);
            }

            // 7. Fetch standalone expenses to get Accounts Payable (AP) statistics
            try {
                const unpaidExpensesQuery = query(
                    collection(db, 'standalone_expenses'),
                    where('paymentStatus', 'in', ['UNPAID', 'PARTIAL'])
                );
                const expensesSnap = await getDocs(unpaidExpensesQuery);
                const apItems = expensesSnap.docs
                    .map(doc => doc.data() as ExpenseItem);
                
                setUnpaidAPCount(apItems.length);
                const unpaidTotal = apItems.reduce((acc, item) => acc + (item.outstandingAmount !== undefined ? item.outstandingAmount : item.amount), 0);
                setUnpaidAPAmount(unpaidTotal);

                const todayStart = new Date(`${todayStr}T00:00:00`);
                let dueSoonCount = 0;
                let dueSoonAmount = 0;
                let overdueCount = 0;
                let overdueAmount = 0;
                apItems.forEach(item => {
                    const effectiveDueDate = getEffectiveAPDueDate(item);
                    if (!effectiveDueDate) return;
                    const dueDate = new Date(`${effectiveDueDate}T00:00:00`);
                    if (!Number.isFinite(dueDate.getTime())) return;
                    const diffDays = Math.round((dueDate.getTime() - todayStart.getTime()) / 86400000);
                    const amount = Number(item.outstandingAmount !== undefined ? item.outstandingAmount : item.amount) || 0;
                    if (diffDays < 0) {
                        overdueCount++;
                        overdueAmount += amount;
                    } else if (diffDays <= 7) {
                        dueSoonCount++;
                        dueSoonAmount += amount;
                    }
                });
                setDueSoonAPCount(dueSoonCount);
                setDueSoonAPAmount(dueSoonAmount);
                setOverdueAPCount(overdueCount);
                setOverdueAPAmount(overdueAmount);
            } catch (e) {
                console.error('Failed to query standalone_expenses for AP', e);
                setUnpaidAPCount(0);
                setUnpaidAPAmount(0);
                setDueSoonAPCount(0);
                setDueSoonAPAmount(0);
                setOverdueAPCount(0);
                setOverdueAPAmount(0);
            }

        } catch (error) {
            console.error('Failed to load priority dashboard data:', error);
        } finally {
            setLastUpdatedAt(new Date());
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();

        const handleSettlementsUpdated = () => {
            void fetchData();
        };
        window.addEventListener('klk-settlements-updated', handleSettlementsUpdated);
        return () => window.removeEventListener('klk-settlements-updated', handleSettlementsUpdated);
    }, []);

    useEffect(() => {
        const previousModal = previousActiveModalRef.current;
        previousActiveModalRef.current = activeModal;
        if (previousModal !== 'NONE' && activeModal === 'NONE') {
            void fetchData();
        }
    }, [activeModal]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
    };

    // Calculate dates for Malaysia (UTC+8) timezone
    const tzDates = useMemo(() => {
        const now = new Date();
        const utc8 = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3600000 * 8));
        const todayStr = utc8.toISOString().split('T')[0];

        const yesterday = new Date(utc8.getTime() - 86400000);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const dayBeforeYesterday = new Date(utc8.getTime() - (86400000 * 2));
        const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];

        const lastWeekSameDay = new Date(utc8.getTime() - (86400000 * 8));
        const lastWeekSameDayStr = lastWeekSameDay.toISOString().split('T')[0];

        const firstDayOfMonth = `${todayStr.substring(0, 8)}01`;

        return { todayStr, yesterdayStr, dayBeforeYesterdayStr, lastWeekSameDayStr, firstDayOfMonth };
    }, [settlements]);

    // Compute KPI metrics safely
    const kpiMetrics = useMemo(() => {
        if (settlements.length === 0) {
            return {
                todaySales: null,
                lastWeekSales: null,
                salesDiffPercent: null,
                weeklySalesTrend: [] as number[],
                monthTotalSales: null,
                monthSettlementsCount: 0,
                activeDateStr: ''
            };
        }

        // Always display the newest completed business day, including a settlement submitted today.
        const sortedSettlements = sortSettlementsNewestFirst(settlements);
        const todayRecord = sortedSettlements[0];
        const lastWeekBusinessDate = shiftDate(todayRecord?.date, -7);
        const lastWeekRecord = lastWeekBusinessDate
            ? sortedSettlements.find(r => r.date === lastWeekBusinessDate)
            : undefined;

        const todaySales = todayRecord ? todayRecord.sales.total : null;
        const lastWeekSales = lastWeekRecord ? lastWeekRecord.sales.total : null;

        let salesDiffPercent: number | null = null;
        if (todaySales !== null && lastWeekSales !== null && lastWeekSales > 0) {
            salesDiffPercent = Math.round(((todaySales - lastWeekSales) / lastWeekSales) * 100);
        }

        // Generate the sales trend for the last 7 available settlement entries (reversed to chronological order)
        const weeklySalesTrend = sortedSettlements
            .slice(0, 7)
            .map(r => r.sales.total)
            .reverse();
            
        const recentSalesData = sortedSettlements.slice(0, 7).reverse().map(s => {
            const parts = s.date.split('-');
            return {
                name: parts.length === 3 ? `${parts[1]}/${parts[2]}` : s.date,
                Sales: s.sales.total
            };
        });

        // Calculate month-to-date sales and settlement counts
        const currentMonthPrefix = tzDates.todayStr.substring(0, 7);
        const monthRecords = settlements.filter(r => r.date.startsWith(currentMonthPrefix));
        const monthTotalSales = monthRecords.length > 0 ? monthRecords.reduce((acc, r) => acc + r.sales.total, 0) : null;
        const monthSettlementsCount = monthRecords.length;

        // Extract and format the active date of the displayed record (e.g. "2026-07-14" to "7月14日")
        let activeDateStr = '';
        if (todayRecord) {
            const parts = todayRecord.date.split('-');
            if (parts.length === 3) {
                activeDateStr = `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
            } else {
                activeDateStr = todayRecord.date;
            }
        }

        return {
            todaySales,
            lastWeekSales,
            salesDiffPercent,
            weeklySalesTrend,
            recentSalesData,
            monthTotalSales,
            monthSettlementsCount,
            activeDateStr
        };
    }, [settlements, tzDates]);

    const varianceMetrics = useMemo(() => {
        const cutoff = new Date(`${tzDates.todayStr}T00:00:00`);
        cutoff.setDate(cutoff.getDate() - 30);
        const records = settlements.filter(record => {
            const recordDate = new Date(`${record.date}T00:00:00`);
            return Number.isFinite(recordDate.getTime())
                && recordDate >= cutoff
                && Math.abs(record.variance) > 0.01;
        });
        return {
            count: records.length,
            amount: records.reduce((sum, record) => sum + Math.abs(record.variance), 0),
        };
    }, [settlements, tzDates.todayStr]);

    const paymentMetrics = useMemo(() => ({
        dueSoonCount: (dueSoonAPCount || 0) + (pendingBillsCount || 0),
        dueSoonAmount: (dueSoonAPAmount || 0) + (pendingBillsAmount || 0),
        overdueCount: (overdueAPCount || 0) + (overdueBillsCount || 0),
        overdueAmount: (overdueAPAmount || 0) + (overdueBillsAmount || 0),
    }), [dueSoonAPCount, pendingBillsCount, dueSoonAPAmount, pendingBillsAmount, overdueAPCount, overdueBillsCount, overdueAPAmount, overdueBillsAmount]);

    const dashboardFinancials = useMemo(() => {
        const outstandingAmount = (totalUnpaidBillsAmount || 0) + (unpaidAPAmount || 0);
        const outstandingCount = (totalUnpaidBillsCount || 0) + (unpaidAPCount || 0);
        const monthTotal = kpiMetrics.monthTotalSales || 0;

        return {
            outstandingAmount,
            outstandingCount,
            nonOverdueAmount: Math.max(0, outstandingAmount - paymentMetrics.overdueAmount),
            monthlyProgress: monthlyBudget > 0 ? Math.round((monthTotal / monthlyBudget) * 100) : 0,
            projectedMonthSales: kpiMetrics.monthSettlementsCount > 0
                ? (monthTotal / kpiMetrics.monthSettlementsCount) * 30
                : null,
        };
    }, [totalUnpaidBillsAmount, unpaidAPAmount, totalUnpaidBillsCount, unpaidAPCount, paymentMetrics.overdueAmount, kpiMetrics.monthTotalSales, kpiMetrics.monthSettlementsCount, monthlyBudget]);

    // Build a scored decision queue. Boss decisions and management follow-up are separated.
    const toDoItems = useMemo(() => {
        const list: ToDoItem[] = [];

        if (varianceMetrics.count > 0) {
            list.push({
                id: 'settlement_variance',
                title: '最近30天仍有结算差异',
                count: varianceMetrics.count,
                amount: varianceMetrics.amount,
                description: `${varianceMetrics.count} 笔日结存在差异，合计影响 RM ${varianceMetrics.amount.toFixed(2)}。建议先检查金额最大的记录。`,
                severity: 'EMERGENCY',
                category: 'FINANCE',
                decisionLevel: 'BOSS',
                score: 100 + Math.min(varianceMetrics.amount / 100, 20),
                impactLabel: `影响 RM ${varianceMetrics.amount.toFixed(2)}`,
                deadlineLabel: '今天处理',
                ownerLabel: '老板 / 财务',
                actionLabel: '审核差异',
                onClick: () => onNavigate('SETTLEMENT')
            });
        }

        if (paymentMetrics.overdueCount > 0) {
            list.push({
                id: 'payments_overdue',
                title: '付款已经逾期',
                count: paymentMetrics.overdueCount,
                amount: paymentMetrics.overdueAmount,
                description: `${paymentMetrics.overdueCount} 笔供应商或固定支出已经超过到期日，未付金额 RM ${paymentMetrics.overdueAmount.toFixed(2)}。`,
                severity: 'EMERGENCY',
                category: 'FINANCE',
                decisionLevel: 'BOSS',
                score: 96 + Math.min(paymentMetrics.overdueAmount / 1000, 20),
                impactLabel: `逾期 RM ${paymentMetrics.overdueAmount.toFixed(2)}`,
                deadlineLabel: '立即安排',
                ownerLabel: '老板 / 应付账款',
                actionLabel: '安排付款',
                onClick: () => setActiveModal('AP')
            });
        }

        if (kpiMetrics.salesDiffPercent !== null && kpiMetrics.salesDiffPercent <= -10) {
            list.push({
                id: 'sales_decline',
                title: '营业额低于上周同日',
                count: Math.abs(kpiMetrics.salesDiffPercent),
                description: `最新日结营业额比上周同一天低 ${Math.abs(kpiMetrics.salesDiffPercent)}%。建议检查午市、晚市或外卖渠道变化。`,
                severity: 'WARNING',
                category: 'SALES',
                decisionLevel: 'BOSS',
                score: 88 + Math.min(Math.abs(kpiMetrics.salesDiffPercent), 20),
                impactLabel: `同比 -${Math.abs(kpiMetrics.salesDiffPercent)}%`,
                deadlineLabel: '今日复盘',
                ownerLabel: '老板 / 店长',
                actionLabel: '分析营业',
                onClick: () => setActiveModal('REPORTS')
            });
        }

        if (paymentMetrics.dueSoonCount > 0) {
            const needsBossDecision = paymentMetrics.dueSoonAmount >= 5000;
            list.push({
                id: 'payments_due_7d',
                title: '未来7天需要安排付款',
                count: paymentMetrics.dueSoonCount,
                amount: paymentMetrics.dueSoonAmount,
                description: `${paymentMetrics.dueSoonCount} 笔供应商账单或固定支出将在7天内到期，预计需要 RM ${paymentMetrics.dueSoonAmount.toFixed(2)}。`,
                severity: needsBossDecision ? 'WARNING' : 'NORMAL',
                category: 'FINANCE',
                decisionLevel: needsBossDecision ? 'BOSS' : 'MANAGEMENT',
                score: 76 + Math.min(paymentMetrics.dueSoonAmount / 1000, 18),
                impactLabel: `需预留 RM ${paymentMetrics.dueSoonAmount.toFixed(2)}`,
                deadlineLabel: '未来7天',
                ownerLabel: needsBossDecision ? '老板 / 财务' : '应付账款',
                actionLabel: '查看账期',
                onClick: () => setActiveModal('AP')
            });
        }

        if (criticalLowStockCount !== null && criticalLowStockCount > 0) {
            list.push({
                id: 'critical_stock',
                title: '关键物料低于安全库存',
                count: criticalLowStockCount,
                description: `${criticalLowStockCount} 款标记为关键物料的库存已经低于安全线，需要优先确认补货。`,
                severity: 'EMERGENCY',
                category: 'INVENTORY',
                decisionLevel: 'MANAGEMENT',
                score: 92 + Math.min(criticalLowStockCount, 10),
                impactLabel: `${criticalLowStockCount} 款关键物料`,
                deadlineLabel: '今天补货',
                ownerLabel: '管理层 / 采购',
                actionLabel: '处理补货',
                onClick: () => onNavigate('INVENTORY_VIEW')
            });
        }

        const normalLowStockCount = Math.max(0, (lowStockCount || 0) - (criticalLowStockCount || 0));
        if (normalLowStockCount > 0) {
            list.push({
                id: 'normal_stock',
                title: '普通物料需要补货',
                count: normalLowStockCount,
                description: `${normalLowStockCount} 款普通库存低于补货线，由管理层按采购周期处理。`,
                severity: 'NORMAL',
                category: 'INVENTORY',
                decisionLevel: 'MANAGEMENT',
                score: 58 + Math.min(normalLowStockCount, 15),
                deadlineLabel: '按采购周期',
                ownerLabel: '管理层 / 采购',
                actionLabel: '查看库存',
                onClick: () => onNavigate('INVENTORY_VIEW')
            });
        }

        if (absentCount !== null && absentCount > 0) {
            list.push({
                id: 'employee_absent',
                title: '今日排班出现缺席',
                count: absentCount,
                description: `${absentCount} 名排班员工为MC或缺席状态，请管理层确认是否已经安排顶班。`,
                severity: 'WARNING',
                category: 'PEOPLE',
                decisionLevel: 'MANAGEMENT',
                score: 72 + Math.min(absentCount * 3, 15),
                deadlineLabel: '本班次前',
                ownerLabel: '店长 / HR',
                actionLabel: '确认顶班',
                onClick: () => setActiveModal('ATTENDANCE')
            });
        }

        if (pendingPOCount > 0) {
            list.push({
                id: 'po_ordered',
                title: '采购单等待收货确认',
                count: pendingPOCount,
                description: `${pendingPOCount} 张已下单采购单尚未完成收货与入库确认。`,
                severity: 'NORMAL',
                category: 'OPERATIONS',
                decisionLevel: 'MANAGEMENT',
                score: 55 + Math.min(pendingPOCount, 12),
                deadlineLabel: '到货后确认',
                ownerLabel: '管理层 / 收货人',
                actionLabel: '进行收货',
                onClick: () => onNavigate('PROCUREMENT')
            });
        }

        if (unacknowledgedLogsCount !== null && unacknowledgedLogsCount > 0) {
            list.push({
                id: 'unacknowledged_logs',
                title: '交接日志尚未阅读',
                count: unacknowledgedLogsCount,
                description: `最近30条店面交接日志中，有 ${unacknowledgedLogsCount} 条你尚未阅读；普通记录不会升级为老板紧急事项。`,
                severity: 'NORMAL',
                category: 'OPERATIONS',
                decisionLevel: 'WATCH',
                score: 38 + Math.min(unacknowledgedLogsCount, 15),
                deadlineLabel: '24小时内',
                ownerLabel: '店长 / 管理层',
                actionLabel: '阅读日志',
                onClick: () => onNavigate('LOGBOOK_VIEW')
            });
        }

        const laterAPCount = Math.max(0, (unpaidAPCount || 0) - (dueSoonAPCount || 0) - (overdueAPCount || 0));
        if (laterAPCount > 0) {
            list.push({
                id: 'ap_later',
                title: '未到期应付账款',
                count: laterAPCount,
                amount: unpaidAPAmount || 0,
                description: `${laterAPCount} 笔未付款账单尚未进入7天到期窗口，先列入观察，不作为紧急事项。`,
                severity: 'NORMAL',
                category: 'FINANCE',
                decisionLevel: 'WATCH',
                score: 30,
                impactLabel: `全部未结 RM ${(unpaidAPAmount || 0).toFixed(2)}`,
                deadlineLabel: '按账期观察',
                ownerLabel: '应付账款',
                actionLabel: '查看账单',
                onClick: () => setActiveModal('AP')
            });
        }

        return list.sort((a, b) => b.score - a.score);
    }, [varianceMetrics, paymentMetrics, kpiMetrics.salesDiffPercent, criticalLowStockCount, lowStockCount, absentCount, pendingPOCount, unacknowledgedLogsCount, unpaidAPCount, unpaidAPAmount, dueSoonAPCount, overdueAPCount]);

    const bossDecisionItems = useMemo(
        () => toDoItems.filter(item => item.decisionLevel === 'BOSS').slice(0, 3),
        [toDoItems],
    );
    const bossDecisionCount = useMemo(
        () => toDoItems.filter(item => item.decisionLevel === 'BOSS').length,
        [toDoItems],
    );
    const managementItems = useMemo(
        () => toDoItems.filter(item => item.decisionLevel === 'MANAGEMENT'),
        [toDoItems],
    );
    const watchItems = useMemo(
        () => toDoItems.filter(item => item.decisionLevel === 'WATCH'),
        [toDoItems],
    );

    // Handle modal render map
    const renderModal = () => {
        const close = () => setActiveModal('NONE');
        const modalMap: Record<string, React.ReactElement> = {
            'HR': <HRSystem onClose={close} currentEmployee={currentEmployee} />,
            'MENU': <MenuManagement onClose={close} />,
            'BILLS': <RecurringBillsModule onClose={close} />,
            'ORG': <OrgChart onClose={close} />,
            'REPORTS': <FinancialReport onClose={close} />,
            'ATTENDANCE': <AttendanceConsole onClose={close} />,
            'AP': <AccountsPayableModule onClose={close} onNavigateToSelfVoucher={(prefill) => {
                localStorage.setItem('klk_prefill_self_invoice', JSON.stringify(prefill));
                setActiveModal('SELF_INVOICE');
            }} />,
            'TREASURY': <TreasuryModule onClose={close} />,
            'WARRANTY': <WarrantyModule onClose={close} />,
            'PLANNING': <EventsPlanningModule onClose={close} currentEmployee={currentEmployee} defaultTab='VOTE' />,
            'PRICE_MONITOR': <PriceMonitorModule onClose={close} />,
            'ASSESSMENT': <EmployeeAssessmentModule onClose={close} currentEmployee={currentEmployee} />,
            'TRANSLATION': <TranslationManager onClose={close} />,
            'SELF_INVOICE': <SelfInvoiceModule onClose={close} />
        };
        return activeModal !== 'NONE' ? modalMap[activeModal] : null;
    };

    return (
        <div className="w-full min-h-screen bg-[#F6F7F9] px-4 sm:px-6 lg:px-8 pb-[calc(env(safe-area-inset-bottom)+8rem)] md:pb-14" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
            <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
                
                <div className="flex min-h-[64px] items-center justify-between gap-3 py-1">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFD200] text-[#171717] shadow-[0_8px_20px_rgba(255,210,0,0.22)]">
                                <Gauge size={21} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-[19px] sm:text-2xl font-black text-stone-950 tracking-tight">金莲记 ERP 经营看盘</h1>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-stone-500">
                                    <span className="truncate">实时经营分析与关键指标汇总</span>
                                    <span className="sm:hidden shrink-0 text-stone-300">·</span>
                                    <span className="sm:hidden shrink-0 text-stone-400">
                                        {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2.5">
                        <div className="hidden sm:block text-right">
                            <p className="text-[9px] font-black tracking-wider text-stone-400">最后更新</p>
                            <p className="text-xs font-bold text-stone-600">
                                {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                            </p>
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={loading || refreshing}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white text-stone-600 shadow-sm outline-none transition-all active:scale-95 active:bg-stone-50 disabled:opacity-50"
                            title="刷新数据"
                        >
                            <RefreshCw size={18} className={`${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Loading skeleton loader */}
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-52 rounded-[1.75rem] bg-stone-900/90"></div>
                        <div className="grid h-44 grid-cols-2 gap-3">
                            {[1, 2].map(i => (
                                <div key={i} className="bg-stone-100 rounded-2xl"></div>
                            ))}
                        </div>
                        <div className="h-36 rounded-2xl border border-stone-200 bg-white"></div>
                        <div className="bg-white rounded-3xl p-6 h-60 border border-stone-200/50"></div>
                    </div>
                ) : (
                    <>
                        {/* 经营结果：统一为主指标 → 异常 → 账款摘要的阅读顺序 */}
                        <section className="space-y-3">
                            <div className="relative overflow-hidden rounded-[1.75rem] border border-stone-800 bg-[#171717] p-5 text-white shadow-[0_18px_45px_rgba(23,23,23,0.16)] sm:p-6">
                                <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#FFD200]/10 blur-2xl" />
                                <div className="relative flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-[11px] font-black tracking-[0.14em] text-stone-400">本月累计营业额</p>
                                        <div className="mt-3 flex items-baseline gap-2 whitespace-nowrap">
                                            <span className="text-sm font-black text-[#FFD200]">RM</span>
                                            <strong className="text-[clamp(2rem,9vw,3rem)] font-black leading-none tracking-[-0.04em] text-white">
                                                {kpiMetrics.monthTotalSales !== null ? kpiMetrics.monthTotalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                                            </strong>
                                        </div>
                                    </div>
                                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFD200] text-stone-950 shadow-[0_8px_24px_rgba(255,210,0,0.24)]"><TrendingUp size={21} strokeWidth={2.5} /></span>
                                </div>
                                {kpiMetrics.monthTotalSales !== null && (
                                    <div className="relative mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                        <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
                                            <span className="text-stone-300">目标 RM {monthlyBudget.toLocaleString()}</span>
                                            <span className="rounded-full bg-[#FFD200] px-2.5 py-1 font-black text-stone-950">{dashboardFinancials.monthlyProgress}%</span>
                                        </div>
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                                            <div className={`h-full rounded-full ${kpiMetrics.monthTotalSales >= monthlyBudget ? 'bg-emerald-400' : 'bg-[#FFD200]'}`} style={{ width: `${Math.min(100, dashboardFinancials.monthlyProgress)}%` }} />
                                        </div>
                                        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-bold">
                                            <span className="text-stone-400">已结算 {kpiMetrics.monthSettlementsCount} 天</span>
                                            {dashboardFinancials.projectedMonthSales !== null && <span className="text-right text-[#FFD200]">预计月底 RM {dashboardFinancials.projectedMonthSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button type="button" onClick={() => onNavigate('SETTLEMENT')} className="flex min-h-[172px] min-w-0 flex-col rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-[0_8px_24px_rgba(28,25,23,0.06)] transition-all active:scale-[0.985]">
                                    <div className="flex min-h-10 items-start justify-between gap-2">
                                        <span className="pt-1 text-[11px] font-black leading-4 text-stone-500">最新已结营业额</span>
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#FFF8D6] text-amber-700"><Store size={17} /></span>
                                    </div>
                                    <div className="mt-4 flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                                        <span className="text-[11px] font-black text-stone-400">RM</span>
                                        <strong className="min-w-0 text-[clamp(1.25rem,5.2vw,1.8rem)] font-black leading-none tracking-[-0.035em] text-stone-950">{kpiMetrics.todaySales !== null ? kpiMetrics.todaySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}</strong>
                                    </div>
                                    <div className="mt-auto pt-4">
                                        <p className="text-[10px] font-bold text-stone-400">{kpiMetrics.activeDateStr || '暂无结算'} · Kepong</p>
                                        {kpiMetrics.salesDiffPercent !== null && <p className={`mt-1.5 inline-flex rounded-lg px-2 py-1 text-[10px] font-black ${kpiMetrics.salesDiffPercent >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{kpiMetrics.salesDiffPercent >= 0 ? '↑' : '↓'} {Math.abs(kpiMetrics.salesDiffPercent).toFixed(1)}% 较上周同日</p>}
                                    </div>
                                </button>

                                <button type="button" onClick={() => setActiveModal('AP')} className={`flex min-h-[172px] min-w-0 flex-col rounded-2xl border p-4 text-left shadow-[0_8px_24px_rgba(28,25,23,0.06)] transition-all active:scale-[0.985] ${paymentMetrics.overdueCount > 0 ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
                                    <div className="flex min-h-10 items-start justify-between gap-2">
                                        <span className={`pt-1 text-[11px] font-black leading-4 ${paymentMetrics.overdueCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>已逾期付款</span>
                                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white ${paymentMetrics.overdueCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{paymentMetrics.overdueCount > 0 ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}</span>
                                    </div>
                                    <div className="mt-4 flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                                        <span className={`text-[11px] font-black ${paymentMetrics.overdueCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>RM</span>
                                        <strong className={`min-w-0 text-[clamp(1.25rem,5.2vw,1.8rem)] font-black leading-none tracking-[-0.035em] ${paymentMetrics.overdueCount > 0 ? 'text-rose-950' : 'text-emerald-950'}`}>{paymentMetrics.overdueAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </div>
                                    <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                                        <p className={`text-[10px] font-black leading-4 ${paymentMetrics.overdueCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{paymentMetrics.overdueCount > 0 ? `${paymentMetrics.overdueCount} 笔需立即处理` : '目前没有逾期款项'}</p>
                                        <ChevronRight size={15} className={paymentMetrics.overdueCount > 0 ? 'text-rose-300' : 'text-emerald-300'} />
                                    </div>
                                </button>
                            </div>

                            <button type="button" onClick={() => setActiveModal('AP')} className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-[0_8px_24px_rgba(28,25,23,0.05)] transition-all active:scale-[0.99] sm:p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-black tracking-wide text-stone-500">应付账款总额</p>
                                        <div className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap">
                                            <span className="text-xs font-black text-stone-400">RM</span>
                                            <strong className="text-[clamp(1.65rem,7vw,2.25rem)] font-black leading-none tracking-[-0.04em] text-stone-950">{dashboardFinancials.outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                        </div>
                                    </div>
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700"><CalendarClock size={19} /></span>
                                </div>
                                <div className="mt-4 grid grid-cols-3 divide-x divide-stone-200 rounded-xl bg-stone-50 px-2 py-3">
                                    <div className="px-2"><p className="text-[9px] font-bold text-stone-400">待付款</p><p className="mt-1 text-xs font-black text-stone-800">{dashboardFinancials.outstandingCount} 笔</p></div>
                                    <div className="px-2"><p className="text-[9px] font-bold text-stone-400">7天内到期</p><p className="mt-1 truncate text-xs font-black text-amber-700">RM {paymentMetrics.dueSoonAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
                                    <div className="px-2"><p className="text-[9px] font-bold text-stone-400">未逾期</p><p className="mt-1 truncate text-xs font-black text-emerald-700">RM {dashboardFinancials.nonOverdueAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
                                </div>
                            </button>
                        </section>

                        {/* 图表与快速查看 */}
                        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)] gap-4">
                            {/* 左侧：图表区 */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="rounded-3xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp size={18} className="text-stone-900" />
                                                <h3 className="text-base font-black text-stone-950">近7天营业趋势</h3>
                                            </div>
                                            <span className="rounded-full bg-stone-100 px-3 py-1 text-[10px] font-black text-stone-600">营业额 (RM)</span>
                                        </div>
                                        <div className="h-[240px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={kpiMetrics.recentSalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                                                    <RechartsTooltip 
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                                        itemStyle={{ color: '#171717' }}
                                                        formatter={(value: number) => [`RM ${value.toFixed(2)}`, '营业额']}
                                                    />
                                                    <Area type="monotone" dataKey="Sales" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* 2nd Custom Chart: Accounts Payable Aging & Cash Flow Projection */}
                                    <div className="rounded-3xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <CreditCard size={18} className="text-stone-900" />
                                                <h3 className="text-base font-black text-stone-950">应付账款与挂账分布</h3>
                                            </div>
                                            <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-[10px] font-black">债务分析</span>
                                        </div>
                                        <div className="h-[240px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart 
                                                    data={[
                                                        { name: '已逾期账单', 金额: paymentMetrics.overdueAmount, fill: '#ef4444' },
                                                        { name: '7天内到期', 金额: paymentMetrics.dueSoonAmount, fill: '#f59e0b' },
                                                        { name: '未到期挂账', 金额: Math.max(0, ((totalUnpaidBillsAmount || 0) + (unpaidAPAmount || 0)) - paymentMetrics.dueSoonAmount - paymentMetrics.overdueAmount), fill: '#10b981' }
                                                    ]}
                                                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                                                    <RechartsTooltip 
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                                        itemStyle={{ color: '#171717' }}
                                                        formatter={(value: number) => [`RM ${value.toFixed(2)}`, '欠款金额']}
                                                    />
                                                    <Bar dataKey="金额" radius={[8, 8, 0, 0]} barSize={42}>
                                                        {[
                                                            { fill: '#ef4444' },
                                                            { fill: '#f59e0b' },
                                                            { fill: '#10b981' }
                                                        ].map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 右侧：经营健康与快捷入口 */}
                            <aside className="space-y-4">
                                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Gauge size={18} className="text-stone-900" />
                                            <h3 className="text-sm font-black text-stone-950">经营健康</h3>
                                        </div>
                                        <span className="text-[10px] font-black text-stone-400">实时检查</span>
                                    </div>
                                    <div className="mt-4 space-y-2.5">
                                        {[
                                            { label: '近 30 天结算差异', value: `${varianceMetrics.count} 笔`, alert: varianceMetrics.count > 0 },
                                            { label: '核心物料低库存', value: `${criticalLowStockCount ?? 0} 款`, alert: (criticalLowStockCount ?? 0) > 0 },
                                            { label: '今日缺勤', value: `${absentCount ?? 0} 人`, alert: (absentCount ?? 0) > 0 },
                                            { label: '采购单待收货', value: `${pendingPOCount} 张`, alert: false }
                                        ].map(row => (
                                            <div key={row.label} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-3">
                                                <span className="text-[11px] font-bold text-stone-500">{row.label}</span>
                                                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${row.alert ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                                    <h3 className="text-sm font-black text-stone-950">快速查看</h3>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {[
                                            { label: '营业报表', Icon: FileBarChart, action: () => setActiveModal('REPORTS') },
                                            { label: '资金状况', Icon: Wallet, action: () => setActiveModal('TREASURY') },
                                            { label: '成本监控', Icon: TrendingUp, action: () => setActiveModal('PRICE_MONITOR') },
                                            { label: '员工表现', Icon: Award, action: () => setActiveModal('ASSESSMENT') }
                                        ].map(link => (
                                            <button key={link.label} onClick={link.action} className="flex min-h-14 items-center justify-between rounded-xl border border-stone-200 px-3 text-left text-[11px] font-black text-stone-700 active:scale-[0.98]">
                                                <span className="flex items-center gap-2"><link.Icon size={16} /> {link.label}</span>
                                                <ChevronRight size={14} className="text-stone-300" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </aside>
                        </section>
                    </>
                )}
            </div>

            {/* Modals rendering area */}
            {renderModal()}

            {/* AI Assistant dialog */}
            <AIOperationsAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />
        </div>
    );
};