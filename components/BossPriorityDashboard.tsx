import { HolidayCalendarBadge } from './ui/HolidayCalendarBadge';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    FileBarChart, CreditCard, Wallet, ShieldCheck, Banknote,
    AlertTriangle, TrendingUp, ChevronRight, RefreshCw, Gauge,
    CalendarDays, Sun, CloudSun, CloudRain, CloudLightning, Crown, HeartHandshake, ShoppingBag, MessageCircle, ListChecks, LayoutGrid
} from 'lucide-react';
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { getSettlementFigures } from './features/settlement/settlementExcelExport';
import { getOps, perPax } from './features/settlement/settlementOps';
import { Employee, SettlementRecord, ExpenseItem } from '../types';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { DataManager } from '../utils/dataManager';
import { needsReplenishment } from '../utils/unitConversion';
import { getEffectiveAPDueDate, shiftDate } from '../utils/apDueDate';
import { getMalaysiaDateString } from '../utils/dateHelper';

// 👑 关闭弹窗后重抓首页数据的冷却时间（毫秒）。首页一趟 fetchData 要读十几个集合，
//    没有节流的话每关一次 Modal 就重读一次，是日常操作中最高频的 Firestore 浪费。
const MODAL_REFETCH_COOLDOWN_MS = 60 * 1000;

// Import Modals so we can open them directly from the Priority Dashboard
import { canUseBossTarget } from '../utils/bossPortalAccess';
import { HRSystem, MenuManagement, RecurringBillsModule, OrgChart, FinancialReport, LabourProfitDashboard, BossCockpit, AttendanceConsole, AccountsPayableModule, TreasuryModule, WarrantyModule, EventsPlanningModule, PriceMonitorModule, EmployeeAssessmentModule, TranslationManager, SelfInvoiceModule, DailyBusinessReportModal, AIOperationsAssistant } from './lazyModules';
import { canManageStockCodes } from '../utils/inventory/stockCodeAccess';
import { isFrozenBill } from '../utils/ap/frozenBills';

interface BossPriorityDashboardProps {
    currentEmployee: Employee;
    onNavigate: (tab: string) => void;
    onOpenConfig?: () => void;
    onLogout?: () => void;
}

type ActiveModal = 'NONE' | 'HR' | 'MENU' | 'BILLS' | 'ORG' | 'REPORTS' | 'LABOUR_PROFIT' | 'BOSS_COCKPIT' | 'ATTENDANCE' | 'AP' | 'TREASURY' | 'WARRANTY' | 'PLANNING' | 'PRICE_MONITOR' | 'ASSESSMENT' | 'TRANSLATION' | 'SELF_INVOICE' | 'DAILY_REPORT';


const sortSettlementsNewestFirst = (records: SettlementRecord[]): SettlementRecord[] =>
    [...records].sort((a, b) => {
        const dateOrder = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateOrder !== 0) return dateOrder;
        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });

// ============================================================================
// 🎨 经营重点 · 共用小元件（统一卡片 / 标题 / 涨跌标签）
// ============================================================================
const C = {
    ink: '#1C1917',
    sub: '#57534E',
    muted: '#A8A29E',
    line: '#C4BEB6',
    week: '#D9A300', // 这一周（品牌金，深一阶，图上看得清）
    weekFocus: '#B88600', // 当天
    lastWeek: '#8E9AAD', // 上周同一天（灰蓝，跟金色分得开）
};

const fmtRM = (n: number, digits = 0) =>
    (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v));

/** 涨跌小标签：绿=涨、红=跌，同时带箭头和文字（不靠颜色单独表达） */
const Delta: React.FC<{ pct: number | null; suffix?: string; size?: 'sm' | 'md'; invert?: boolean }> = ({ pct, suffix, size = 'sm', invert }) => {
    if (pct === null || !Number.isFinite(pct)) return <span className="text-[11px] font-semibold text-stone-400">没有对照</span>;
    const up = pct >= 0;
    const good = invert ? !up : up;
    const flat = Math.abs(pct) < 0.5;
    const tone = flat ? 'bg-stone-100 text-stone-600' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
    return (
        <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-bold tabular-nums ${size === 'md' ? 'text-[13px]' : 'text-[11px]'} ${tone}`}>
            {flat ? '—' : up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%{suffix ? <span className="ml-0.5 font-semibold opacity-75">{suffix}</span> : null}
        </span>
    );
};

const CardTitle: React.FC<{ icon: React.ReactNode; title: string; sub?: React.ReactNode; right?: React.ReactNode }> = ({ icon, title, sub, right }) => (
    <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-stone-300 bg-stone-100 text-stone-700">{icon}</span>
            <div className="min-w-0">
                <h3 className="truncate text-[15px] font-extrabold tracking-tight text-stone-900">{title}</h3>
                {sub && <div className="mt-0.5 truncate text-[12px] font-medium text-stone-500">{sub}</div>}
            </div>
        </div>
        {right}
    </div>
);

const CARD = 'rounded-[22px] border-[1.5px] border-[#B9B2A9] bg-white shadow-[0_1px_3px_rgba(28,25,23,0.10),0_12px_30px_-14px_rgba(28,25,23,0.25)]';

/** 一句话结论：营业额变化 + 原因（人数还是人均）+ 本周累计 */
const buildDailyInsight = (x: {
    weekday: string;
    diffPct: number | null;
    pax: number;
    lastPax: number;
    perPax: number | null;
    lastPerPax: number | null;
    wtdDiffPct: number | null;
    weekLabel: string;
}): { tone: 'good' | 'bad' | 'flat'; text: string } => {
    if (x.diffPct === null) {
        return { tone: 'flat', text: `上${x.weekday}没有结算记录，暂时没有对照。` };
    }
    const up = x.diffPct >= 0;
    const parts: string[] = [`比上${x.weekday}${up ? '多' : '少'} ${Math.abs(x.diffPct).toFixed(1)}%`];
    // 原因：人数变化 vs 人均变化，哪个影响大说哪个
    if (x.pax > 0 && x.lastPax > 0 && x.perPax !== null && x.lastPerPax !== null) {
        const paxPct = ((x.pax - x.lastPax) / x.lastPax) * 100;
        const ppPct = ((x.perPax - x.lastPerPax) / x.lastPerPax) * 100;
        if (Math.abs(paxPct) >= Math.abs(ppPct)) {
            parts.push(`主要是堂食客人${paxPct >= 0 ? '多' : '少'}了 ${Math.abs(x.pax - x.lastPax)} 人`);
        } else {
            parts.push(`客人差不多，人均${ppPct >= 0 ? '多' : '少'}花 RM ${Math.abs(x.perPax - x.lastPerPax).toFixed(2)}`);
        }
    }
    let text = parts.join('，');
    if (x.wtdDiffPct !== null && x.weekLabel) {
        const wUp = x.wtdDiffPct >= 0;
        text += `；${x.weekLabel}累计${wUp ? '比上周同期多' : '比上周同期少'} ${Math.abs(x.wtdDiffPct).toFixed(1)}%`;
    }
    return { tone: Math.abs(x.diffPct) < 0.5 ? 'flat' : up ? 'good' : 'bad', text: text + '。' };
};

export const BossPriorityDashboard: React.FC<BossPriorityDashboardProps> = ({ currentEmployee, onNavigate, onOpenConfig, onLogout }) => {
    // 🔐 权限闸门：L1 老板全开；L2 等按 allowedModules 勾选
    const canUse = React.useCallback(
        (target: string) => canUseBossTarget(currentEmployee, target),
        [currentEmployee],
    );
    const openModule = React.useCallback((target: string, run: () => void) => {
        if (!canUse(target)) {
            alert('你没有此功能的权限，请联系老板开通。');
            return;
        }
        run();
    }, [canUse]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');
    const [aiOpen, setAiOpen] = useState(false);

    // States for holding loaded database values
    const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
    // 上个月整月结算（只拿来算「本月 vs 上月同期」；首页预设只抓最近 30 张，月初时上个月前几天会缺）
    const [prevMonthSettlements, setPrevMonthSettlements] = useState<SettlementRecord[]>([]);
    const [pendingPOCount, setPendingPOCount] = useState<number>(0);
    const [, setLowStockCount] = useState<number | null>(null);
    const [criticalLowStockCount, setCriticalLowStockCount] = useState<number | null>(null);
    const [absentCount, setAbsentCount] = useState<number | null>(null);
    const [pendingBillsCount, setPendingBillsCount] = useState<number | null>(null);
    const [pendingBillsAmount, setPendingBillsAmount] = useState<number | null>(null);
    const [overdueBillsCount, setOverdueBillsCount] = useState<number | null>(null);
    const [overdueBillsAmount, setOverdueBillsAmount] = useState<number | null>(null);
    const [, setUnacknowledgedLogsCount] = useState<number | null>(null);
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
    // 👑 记录上次全量抓取的时间，用来节流「关闭弹窗后重抓」
    const lastFetchAtRef = useRef<number>(0);

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
            // 不能用「本机时间 + 时区差」再 toISOString：在马来西亚的手机上会在 00:00–08:00 算成前一天
            const todayStr = getMalaysiaDateString();
            const [yr, mo, dd] = todayStr.split('-').map(Number);
            const todayMidnight = new Date(yr, mo - 1, dd);
            const pm = new Date(yr, mo - 2, 1);
            const pmStr = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}`;

            // ⚡ iOS 性能：以下各项读取彼此独立，先同时发出，避免手机网络上一个等一个。
            //    取用结果的顺序与错误处理维持原样（某项失败时，后续项目的结果照旧不采用）。
            //    先挂上空的 catch，只为避免「未处理的 rejection」警告；await 时仍会抛出原错误。
            const early = <T,>(promise: Promise<T>): Promise<T> => { promise.catch(() => undefined); return promise; };
            const settlementsRead = early(DataManager.getSettlements());
            const prevMonthRead = early(DataManager.getSettlements(pmStr));
            const pendingPORead = early(DataManager.getPendingPurchaseOrderCount());
            const stockRead = early(Promise.all([
                DataManager.getStock('KITCHEN'),
                DataManager.getStock('BAR'),
                DataManager.getStock('GENERAL'),
                DataManager.getStock('FUEL')
            ]));
            const rosterRead = early(DataManager.getRosterData());
            const billsRead = early(DataManager.getRecurringBills());
            const logsRead = early(DataManager.getRecentLogs(30));
            const unpaidExpensesRead = early(getDocs(query(
                collection(db, 'standalone_expenses'),
                where('paymentStatus', 'in', ['UNPAID', 'PARTIAL'])
            )));

            // 1. Fetch settlements
            const fetchedSettlements = await settlementsRead;
            setSettlements(fetchedSettlements);
            try {
                setPrevMonthSettlements(await prevMonthRead);
            } catch (e) {
                console.warn('prev month settlements failed', e);
            }

            // 2. Count only purchase orders that are still waiting to be received.
            // This uses a Firestore server-side aggregation instead of downloading
            // up to 200 complete purchase-order documents.
            const pendingPurchaseOrders = await pendingPORead;
            setPendingPOCount(pendingPurchaseOrders);

            // 3. Fetch Stock and compute low stock count
            const [kitchenStock, barStock, generalStock, fuelStock] = await stockRead;
            const combinedStock = [...kitchenStock, ...barStock, ...generalStock, ...fuelStock];
            const lowStockItems = combinedStock.filter(needsReplenishment);
            setLowStockCount(lowStockItems.length);
            setCriticalLowStockCount(lowStockItems.filter(item => item.isKeyItem).length);

            // 4. Fetch Roster and compute absent count for today
            try {
                const rosterRes = await rosterRead;
                const todayRoster = rosterRes.roster?.[todayStr] || {};
                const abCount = Object.values(todayRoster).filter((s: any) => s === 'MC' || s === 'ABSENT').length;
                setAbsentCount(abCount);
            } catch (e) {
                console.error('Failed to parse roster MC status', e);
                setAbsentCount(0);
            }

            // 5. Fetch recurring bills and check due status
            try {
                const bills = await billsRead;
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
                    const diff = Math.round((due.getTime() - todayMidnight.getTime()) / 86400000);
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
                const logs = await logsRead;
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
                const expensesSnap = await unpaidExpensesRead;
                const apItems = expensesSnap.docs
                    .map(doc => doc.data() as ExpenseItem)
                    .filter(e => !isFrozenBill(e)); // 冻结的应付账款不计入
                
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
            lastFetchAtRef.current = Date.now();   // 👑 盖时间戳，供冷却判断
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
            // 👑 关闭弹窗就全量重抓，一趟 fetchData 要读 settlements + 四个 stock 集合
            //    + roster + recurring_bills + logs + 未付支出。一天开关几十次Modal 就是几十趟。
            //    加 60 秒冷却：刚抓过就跳过，手动下拉刷新 (handleRefresh) 不受限制。
            const now = Date.now();
            if (now - lastFetchAtRef.current < MODAL_REFETCH_COOLDOWN_MS) return;
            void fetchData();
        }
    }, [activeModal]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
    };

    // Calculate dates for Malaysia (UTC+8) timezone
    const tzDates = useMemo(() => {
        // 马来西亚今天的日期（原本的算法在马来西亚的手机上，凌晨 00:00–08:00 会算成前一天，
        // 结果当晚结算完的营业日在经营日报里看不到）
        const todayStr = getMalaysiaDateString();
        const yesterdayStr = shiftDate(todayStr, -1);
        const dayBeforeYesterdayStr = shiftDate(todayStr, -2);
        const lastWeekSameDayStr = shiftDate(todayStr, -8);

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

    // 本月累计 vs 上个月同一段日子（例如 10/1–10/4 对 9/1–9/4）
    const monthCompare = useMemo(() => {
        const prefix = tzDates.todayStr.substring(0, 7);
        const monthRecs = settlements.filter(r => r.date.startsWith(prefix));
        if (!monthRecs.length) return null;
        const lastDay = monthRecs.reduce((m, r) => (r.date > m ? r.date : m), '');
        const dayNum = Number(lastDay.slice(8, 10));
        const [y, m] = prefix.split('-').map(Number);
        const prev = new Date(y, m - 2, 1);
        const prevPrefix = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        const sum = (list: SettlementRecord[]) => list.reduce((a, r) => a + getSettlementFigures(r).netRevenue, 0);
        const cur = sum(monthRecs);
        const prevPool = new Map<string, SettlementRecord>();
        [...prevMonthSettlements, ...settlements].forEach(r => r.date.startsWith(prevPrefix) && prevPool.set(r.date, r));
        const prevRecs = Array.from(prevPool.values()).filter(r => Number(r.date.slice(8, 10)) <= dayNum);
        const last = sum(prevRecs);
        return {
            cur,
            last,
            diffPct: last > 0 ? ((cur - last) / last) * 100 : null,
            span: `${m}/1–${m}/${dayNum}`,
            prevLabel: `${prev.getMonth() + 1}/1–${prev.getMonth() + 1}/${dayNum}`,
            dailyAvg: cur / monthRecs.length,
        };
    }, [settlements, prevMonthSettlements, tzDates.todayStr]);

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

    // 📊 昨日经营日报：只放「真实数据」——营业额、客人、现金支出（不再估算结余 / 单数）
    const dailyReportSummary = useMemo(() => {
        if (settlements.length === 0) return null;

        // 显示最新一天已结算的营业日（刚结算完就看得到；还没结算就显示前一个营业日）
        const activeRecord = sortSettlementsNewestFirst(settlements.filter(s => s.date <= tzDates.todayStr))[0]
            || sortSettlementsNewestFirst(settlements)[0];
        if (!activeRecord) return null;

        const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekdayOf = (dateStr: string) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return WEEKDAYS[new Date(y, (m || 1) - 1, d || 1).getDay()] || '';
        };
        const byDate = new Map(settlements.map(r => [r.date, r]));

        const isYesterday = activeRecord.date === tzDates.yesterdayStr;
        const isToday = activeRecord.date === tzDates.todayStr;
        const f = getSettlementFigures(activeRecord);
        const ops = getOps(activeRecord);
        const revenue = f.netRevenue;

        // 对比上周同一天（例如 周二 对 上周二）
        const lastWeekDate = shiftDate(activeRecord.date, -7);
        const lastWeekRecord = byDate.get(lastWeekDate);
        const lastWeekRevenue = lastWeekRecord ? getSettlementFigures(lastWeekRecord).netRevenue : 0;
        const lastWeekDiffPct = lastWeekRevenue > 0 ? ((revenue - lastWeekRevenue) / lastWeekRevenue) * 100 : null;

        const [, mm, dd] = activeRecord.date.split('-');
        const formattedDate = `${parseInt(mm, 10)}月${parseInt(dd, 10)}日 ${weekdayOf(activeRecord.date)}`;

        // 近 7 天营业额 + 上周同日（虚线）
        const trend = Array.from({ length: 7 }, (_, i) => {
            const d = shiftDate(activeRecord.date, -6 + i);
            const rec = byDate.get(d);
            const prev = byDate.get(shiftDate(d, -7));
            const [, m2, d2] = d.split('-');
            return {
                day: `${parseInt(m2, 10)}/${parseInt(d2, 10)}`,
                wk: weekdayOf(d).replace('周', ''),
                date: d,
                revenue: rec ? Math.round(getSettlementFigures(rec).netRevenue) : null,
                lastWeek: prev ? Math.round(getSettlementFigures(prev).netRevenue) : null,
                isTarget: d === activeRecord.date,
            };
        });

        // ── 上周同一天的客人 / 人均 / 单数（拿来解释营业额为什么变）──
        const lwOps = lastWeekRecord ? getOps(lastWeekRecord) : null;
        const lwPerPax = lastWeekRecord && lwOps ? perPax(getSettlementFigures(lastWeekRecord).storeHubTotal, lwOps) : null;
        const curPerPax = perPax(f.storeHubTotal, ops);

        // ── 本周累计（周一 → 这一天）对比上周同期 ──
        const [ay, am, ad] = activeRecord.date.split('-').map(Number);
        const dayIdx = (new Date(ay, am - 1, ad).getDay() + 6) % 7; // 周一 = 0
        let wtd = 0;
        let wtdLast = 0;
        let wtdDays = 0;
        for (let i = 0; i <= dayIdx; i++) {
            const d = shiftDate(activeRecord.date, -i);
            const cur = byDate.get(d);
            const prev = byDate.get(shiftDate(d, -7));
            if (cur) { wtd += getSettlementFigures(cur).netRevenue; wtdDays++; }
            if (prev) wtdLast += getSettlementFigures(prev).netRevenue;
        }
        const wtdDiffPct = wtdLast > 0 ? ((wtd - wtdLast) / wtdLast) * 100 : null;

        const extra = {
            lastWeekPax: lwOps?.pax || 0,
            lastWeekPerPax: lwPerPax,
            lastWeekBills: lwOps?.bills || 0,
            wtd,
            wtdLast,
            wtdDays,
            wtdDiffPct,
            weekLabel: dayIdx === 0 ? '周一' : `周一至${weekdayOf(activeRecord.date)}`,
            netCash: revenue - f.cashExpenses,
            storePct: revenue > 0 ? (f.storeHubTotal / revenue) * 100 : 0,
            topExpenses3: [...f.expenses].sort((x, y) => y.amount - x.amount).slice(0, 3),
            insight: buildDailyInsight({
                weekday: weekdayOf(activeRecord.date),
                diffPct: lastWeekRevenue > 0 ? ((revenue - lastWeekRevenue) / lastWeekRevenue) * 100 : null,
                pax: ops.pax,
                lastPax: lwOps?.pax || 0,
                perPax: curPerPax,
                lastPerPax: lwPerPax,
                wtdDiffPct,
                weekLabel: dayIdx === 0 ? '' : `周一至${weekdayOf(activeRecord.date)}`,
            }),
        };

        return {
            dateStr: activeRecord.date,
            formattedDate,
            weekday: weekdayOf(activeRecord.date),
            isYesterday,
            isToday,
            revenue,
            storeTotal: f.storeHubTotal,
            deliveryTotal: f.totalDelivery,
            lastWeekRevenue,
            lastWeekDiffPct,
            ops,
            perPax: perPax(f.storeHubTotal, ops),
            cashExpenses: f.cashExpenses,
            expenseCount: f.expenses.length,
            expensePct: revenue > 0 ? (f.cashExpenses / revenue) * 100 : null,
            topExpenses: [...f.expenses].sort((x, y) => y.amount - x.amount).slice(0, 2),
            trend,
            weather: activeRecord.weather,
            ...extra,
        };
    }, [settlements, tzDates]);

    // Handle modal render map
    const renderModal = () => {
        const close = () => setActiveModal('NONE');
        const modalMap: Record<string, React.ReactElement> = {
            'HR': <HRSystem onClose={close} currentEmployee={currentEmployee} />,
            'MENU': <MenuManagement onClose={close} />,
            'BILLS': <RecurringBillsModule onClose={close} />,
            'ORG': <OrgChart onClose={close} />,
            'REPORTS': <FinancialReport onClose={close} />,
            'LABOUR_PROFIT': <LabourProfitDashboard onClose={close} />,
            'BOSS_COCKPIT': <BossCockpit onClose={close} />,
            'ATTENDANCE': <AttendanceConsole onClose={close} currentEmployee={currentEmployee} />,
            'AP': <AccountsPayableModule onClose={close} canFreeze={canManageStockCodes(currentEmployee, !currentEmployee)} onNavigateToSelfVoucher={(prefill) => {
                localStorage.setItem('klk_prefill_self_invoice', JSON.stringify(prefill));
                setActiveModal('SELF_INVOICE');
            }} />,
            'TREASURY': <TreasuryModule onClose={close} />,
            'WARRANTY': <WarrantyModule onClose={close} />,
            'PLANNING': <EventsPlanningModule onClose={close} currentEmployee={currentEmployee} defaultTab='VOTE' />,
            'PRICE_MONITOR': <PriceMonitorModule onClose={close} />,
            'ASSESSMENT': <EmployeeAssessmentModule onClose={close} currentEmployee={currentEmployee} />,
            'TRANSLATION': <TranslationManager onClose={close} />,
            'SELF_INVOICE': <SelfInvoiceModule onClose={close} />,
            'DAILY_REPORT': (
                <DailyBusinessReportModal
                    isOpen={activeModal === 'DAILY_REPORT'}
                    onClose={close}
                    settlements={settlements}
                    initialDate={dailyReportSummary?.dateStr}
                    onNavigateToSettlement={(date) => {
                        close();
                        onNavigate('SETTLEMENT');
                    }}
                    onNavigateToReports={() => {
                        close();
                        setActiveModal('REPORTS');
                    }}
                    onSettlementUpdated={() => {
                        void fetchData();
                    }}
                />
            )
        };
        return activeModal !== 'NONE' ? modalMap[activeModal] : null;
    };

    return (
        <div className="w-full min-h-screen bg-[#F6F7FB] px-4 md:px-6 lg:px-8 pb-[calc(env(safe-area-inset-bottom)+8rem)] md:pb-14" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
            <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
                
                <div className="flex min-h-[64px] items-center justify-between gap-3 py-1">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFD200] text-[#111111] shadow-[0_8px_20px_rgba(255,210,0,0.22)]">
                                <Gauge size={21} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-[19px] md:text-2xl font-black text-stone-950 tracking-tight">经营重点</h1>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                                    <span className="truncate">先看结果，再处理待办</span>
                                    <span className="md:hidden shrink-0 text-stone-300">·</span>
                                    <span className="md:hidden shrink-0 text-stone-400">
                                        {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2.5">
                        <div className="hidden md:block text-right">
                            <p className="text-xs font-black tracking-wider text-stone-400">最后更新</p>
                            <p className="text-xs font-bold text-stone-600">
                                {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                            </p>
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={loading || refreshing}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-stone-300 bg-white text-stone-600 shadow-sm outline-none transition-all active:scale-95 active:bg-stone-50 disabled:opacity-50"
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
                        <div className="h-36 rounded-2xl border border-stone-300 bg-white"></div>
                        <div className="bg-white rounded-3xl p-6 h-60 border border-stone-300/50"></div>
                    </div>
                ) : (
                    <>
                        {/* ═══ 经营驾驶舱入口（利润、保本、人工、食材，同财务报表口径）═══ */}
                        {canUse('BOSS_COCKPIT') && (
                            <button
                                onClick={() => setActiveModal('BOSS_COCKPIT')}
                                className="mb-4 flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-left text-white shadow-sm active:bg-stone-800"
                            >
                                <Gauge size={22} className="shrink-0 text-[#FFD200]" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-base font-black">经营驾驶舱</span>
                                    <span className="block truncate text-xs font-medium text-white/70">实际与预估利润 · 保本营业额 · 人工与食材成本</span>
                                </span>
                                <ChevronRight size={18} className="shrink-0 text-white/60" />
                            </button>
                        )}
                        {/* ═══ 第一排：经营日报（左，大）＋ 本月 / 应付账款（右）═══ */}
                        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                            {dailyReportSummary && (() => {
                                const r = dailyReportSummary;
                                const paxDiff = r.ops.pax > 0 && r.lastWeekPax > 0 ? ((r.ops.pax - r.lastWeekPax) / r.lastWeekPax) * 100 : null;
                                const ppDiff = r.perPax !== null && r.lastWeekPerPax ? ((r.perPax - r.lastWeekPerPax) / r.lastWeekPerPax) * 100 : null;
                                const billDiff = r.ops.bills > 0 && r.lastWeekBills > 0 ? ((r.ops.bills - r.lastWeekBills) / r.lastWeekBills) * 100 : null;
                                const weekTotal = r.trend.reduce((a, d) => a + (d.revenue || 0), 0);
                                const lastWeekTotal = r.trend.reduce((a, d) => a + (d.lastWeek || 0), 0);
                                const toneDot = r.insight.tone === 'good' ? 'bg-emerald-500' : r.insight.tone === 'bad' ? 'bg-rose-500' : 'bg-stone-400';
                                const WEATHER: Record<string, { label: string; Icon: typeof Sun }> = {
                                    SUNNY: { label: '晴', Icon: Sun },
                                    CLOUDY: { label: '多云', Icon: CloudSun },
                                    RAIN: { label: '雨', Icon: CloudRain },
                                    HEAVY_RAIN: { label: '大雨', Icon: CloudLightning },
                                };
                                const weather = r.weather ? WEATHER[r.weather] : undefined;
                                return (
                                    <article className={`${CARD} lg:col-span-7 xl:col-span-8 overflow-hidden flex flex-col`}>
                                        {/* 标题 */}
                                        <div className="flex items-start justify-between gap-3 px-5 pt-4 md:px-6 md:pt-5">
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-stone-300 bg-stone-100 text-stone-700"><CalendarDays size={18} /></span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h2 className="whitespace-nowrap text-[15px] font-extrabold tracking-tight text-stone-900">经营日报</h2>
                                                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${r.isYesterday || r.isToday ? 'bg-[#FFD200] text-stone-900' : 'bg-stone-100 text-stone-600'}`}>
                                                            {r.isToday ? '今天' : r.isYesterday ? '昨天' : '最新营业日'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-[12px] font-medium text-stone-500 tabular-nums">
                                                        {r.formattedDate}
                                                        {weather && (
                                                            <span className="inline-flex items-center gap-1 text-stone-400">
                                                                <weather.Icon size={13} /> {weather.label}
                                                            </span>
                                                        )}
                                                    </p>
                                                <HolidayCalendarBadge date={r.dateStr}/>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setActiveModal('DAILY_REPORT')}
                                                className="inline-flex min-h-[40px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-stone-300 bg-white px-3 text-[12.5px] font-bold text-stone-700 transition-colors hover:bg-stone-50 active:bg-stone-100"
                                            >
                                                详细分析 <ChevronRight size={15} className="text-stone-400" />
                                            </button>
                                        </div>

                                        {/* 一句话结论 */}
                                        <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-2xl bg-stone-50 px-4 py-2.5 md:mx-6">
                                            <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${toneDot}`} />
                                            <p className="text-[13.5px] font-medium leading-relaxed text-stone-700">{r.insight.text}</p>
                                        </div>

                                        {/* 营业额 + 本周累计 */}
                                        <div className="grid grid-cols-1 gap-5 px-5 pt-4 sm:grid-cols-[1.25fr_1fr] md:px-6">
                                            <div>
                                                <p className="text-[12px] font-semibold text-stone-500">营业额</p>
                                                <div className="mt-1.5 flex items-baseline gap-1.5">
                                                    <span className="text-[13px] font-bold text-stone-400">RM</span>
                                                    <span className="text-[clamp(2rem,7vw,2.6rem)] font-extrabold leading-none tracking-[-0.03em] text-stone-900 tabular-nums">
                                                        {fmtRM(r.revenue, 2)}
                                                    </span>
                                                </div>
                                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                    <Delta pct={r.lastWeekDiffPct} size="md" />
                                                    <span className="whitespace-nowrap text-[12px] font-medium text-stone-500 tabular-nums">上{r.weekday} RM {fmtRM(r.lastWeekRevenue)}</span>
                                                </div>
                                            </div>
                                            <div className="sm:border-l sm:border-stone-300 sm:pl-5">
                                                <p className="whitespace-nowrap text-[12px] font-semibold text-stone-500">本周累计 <span className="font-medium text-stone-400">· {r.weekLabel}</span></p>
                                                <div className="mt-1.5 flex items-baseline gap-1.5">
                                                    <span className="text-[12px] font-bold text-stone-400">RM</span>
                                                    <span className="text-[26px] font-extrabold leading-none tracking-[-0.02em] text-stone-900 tabular-nums">{fmtRM(r.wtd)}</span>
                                                </div>
                                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                    <Delta pct={r.wtdDiffPct} />
                                                    <span className="whitespace-nowrap text-[12px] font-medium text-stone-500 tabular-nums">上周同期 RM {fmtRM(r.wtdLast)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 客人 / 人均 / 单数 / 现金支出 */}
                                        <div className="mx-5 mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border-[1.5px] border-[#B9B2A9] sm:grid-cols-4 md:mx-6">
                                            {[
                                                { label: '堂食客人', value: r.ops.pax > 0 ? `${r.ops.pax}` : '—', unit: r.ops.pax > 0 ? '人' : '', delta: paxDiff, note: r.lastWeekPax > 0 ? `上${r.weekday} ${r.lastWeekPax}` : '' },
                                                { label: '人均消费', value: r.perPax !== null ? r.perPax.toFixed(2) : '—', unit: '', prefix: r.perPax !== null ? 'RM' : '', delta: ppDiff, note: r.lastWeekPerPax ? `上${r.weekday} ${r.lastWeekPerPax.toFixed(2)}` : '' },
                                                { label: '单数', value: r.ops.bills > 0 ? `${r.ops.bills}` : '—', unit: r.ops.bills > 0 ? '单' : '', delta: billDiff, note: r.lastWeekBills > 0 ? `上${r.weekday} ${r.lastWeekBills}` : '' },
                                                { label: '现金支出', value: fmtRM(r.cashExpenses), unit: '', prefix: 'RM', delta: null, note: r.expensePct !== null ? `占营业额 ${r.expensePct.toFixed(0)}%` : '', isCost: true },
                                            ].map((m, i) => (
                                                <div key={m.label} className={`px-4 py-3.5 ${i % 2 === 1 ? 'border-l border-stone-300' : ''} ${i >= 2 ? 'border-t border-stone-300 sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
                                                    <p className="text-[12px] font-semibold text-stone-500">{m.label}</p>
                                                    <p className="mt-1 flex items-baseline gap-1 tabular-nums">
                                                        {m.prefix && <span className="text-[11px] font-bold text-stone-400">{m.prefix}</span>}
                                                        <span className="text-[20px] font-extrabold tracking-tight text-stone-900">{m.value}</span>
                                                        {m.unit && <span className="text-[12px] font-semibold text-stone-400">{m.unit}</span>}
                                                    </p>
                                                    <div className="mt-1.5 flex flex-col items-start gap-1">
                                                        {m.isCost ? (
                                                            <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600 tabular-nums">{m.note || '—'}</span>
                                                        ) : (
                                                            <Delta pct={m.delta} />
                                                        )}
                                                        <span className="whitespace-nowrap text-[11px] font-medium text-stone-400 tabular-nums">{m.isCost ? `净现金 ${fmtRM(r.netCash)}` : m.note || '\u00A0'}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* 店内 / 外卖 比例 + 现金支出明细 + 顾客 */}
                                        <div className="grid grid-cols-1 gap-4 px-5 pt-4 md:grid-cols-2 md:px-6">
                                            <div>
                                                <div className="flex items-center justify-between text-[12px] font-semibold text-stone-500">
                                                    <span>营业额组成</span>
                                                    <span className="tabular-nums text-stone-400">RM {fmtRM(r.revenue)}</span>
                                                </div>
                                                <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
                                                    <div className="h-full rounded-l-full bg-stone-800" style={{ width: `${r.storePct}%` }} />
                                                    {r.deliveryTotal > 0 && <div className="h-full flex-1 rounded-r-full bg-[#D9A300]" />}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-stone-600 tabular-nums">
                                                    <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 rounded-full bg-stone-800" />店内 RM {fmtRM(r.storeTotal)} <span className="text-stone-400">{r.storePct.toFixed(0)}%</span></span>
                                                    {r.deliveryTotal > 0 && <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 rounded-full bg-[#D9A300]" />外卖 RM {fmtRM(r.deliveryTotal)} <span className="text-stone-400">{(100 - r.storePct).toFixed(0)}%</span></span>}
                                                </div>
                                                {(r.ops.vipNew > 0 || r.ops.vipVisits > 0 || r.ops.waOrders > 0 || r.ops.waJoin > 0) && (
                                                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                                                        {[
                                                            { label: '会员到店', value: r.ops.vipVisits, Icon: Crown },
                                                            { label: '熟客', value: r.ops.vipNew, Icon: HeartHandshake },
                                                            { label: 'WA 订单', value: r.ops.waOrders, Icon: ShoppingBag },
                                                            { label: 'WA 新进群', value: r.ops.waJoin, Icon: MessageCircle },
                                                        ].map(c => (
                                                            <div key={c.label} className="flex items-center justify-between gap-2 rounded-xl border border-stone-300 px-2.5 py-1.5">
                                                                <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-stone-600">
                                                                    <c.Icon size={14} className="shrink-0 text-stone-500" /> {c.label}
                                                                </span>
                                                                <span className="text-[13px] font-extrabold text-stone-900 tabular-nums">{c.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between text-[12px] font-semibold text-stone-500">
                                                    <span>现金支出明细 {r.expenseCount > 0 && <span className="text-stone-400">· {r.expenseCount} 笔</span>}</span>
                                                    <span className="tabular-nums text-stone-400">净现金 RM {fmtRM(r.netCash)}</span>
                                                </div>
                                                {r.expenseCount === 0 ? (
                                                    <p className="mt-2 text-[12px] font-medium text-stone-400">这天没有现金支出</p>
                                                ) : (
                                                    <ul className="mt-1.5 divide-y divide-stone-300">
                                                        {r.topExpenses3.map((e, i) => (
                                                            <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                                                                <span className="min-w-0 truncate font-medium text-stone-700">{e.company || e.item || '未注明'}</span>
                                                                <span className="shrink-0 font-semibold text-stone-900 tabular-nums">{fmtRM(e.amount, 2)}</span>
                                                            </li>
                                                        ))}
                                                        {r.expenseCount > 3 && <li className="py-1.5 text-[12px] font-medium text-stone-400">另外 {r.expenseCount - 3} 笔，看详细分析</li>}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>

                                        {/* 近 7 天：这一周 vs 上周同一天（并排柱） */}
                                        <div className="mt-4 flex flex-1 flex-col border-t-[1.5px] border-[#B9B2A9] px-5 pb-5 pt-4 md:px-6 md:pb-5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-[13px] font-bold text-stone-800">近 7 天营业额</p>
                                                <div className="flex items-center gap-3.5 text-[12px] font-medium text-stone-600 tabular-nums">
                                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: C.week }} />这 7 天 RM {fmtRM(weekTotal)}</span>
                                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: C.lastWeek }} />上周 RM {fmtRM(lastWeekTotal)}</span>
                                                </div>
                                            </div>
                                            <div className="mt-3 h-[180px] w-full lg:h-auto lg:min-h-[180px] lg:flex-1">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={r.trend} margin={{ top: 18, right: 0, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                                                        <CartesianGrid vertical={false} stroke={C.line} />
                                                        <YAxis width={36} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                                        <XAxis
                                                            dataKey="day"
                                                            interval={0}
                                                            axisLine={false}
                                                            tickLine={false}
                                                            height={36}
                                                            tick={({ x, y, payload, index }: any) => {
                                                                const row = r.trend[index];
                                                                return (
                                                                    <g transform={`translate(${x},${y})`}>
                                                                        <text dy={12} textAnchor="middle" fontSize={11} fontWeight={row?.isTarget ? 800 : 600} fill={row?.isTarget ? C.ink : C.muted}>{payload.value}</text>
                                                                        <text dy={25} textAnchor="middle" fontSize={10} fill={row?.isTarget ? C.sub : '#C4C0BB'}>{row?.wk}</text>
                                                                    </g>
                                                                );
                                                            }}
                                                        />
                                                        <RechartsTooltip
                                                            cursor={{ fill: 'rgba(28,25,23,0.04)', radius: 8 } as any}
                                                            content={({ active, payload }: any) => {
                                                                if (!active || !payload?.length) return null;
                                                                const row = payload[0].payload;
                                                                const diff = row.revenue !== null && row.lastWeek ? ((row.revenue - row.lastWeek) / row.lastWeek) * 100 : null;
                                                                return (
                                                                    <div className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[12px] shadow-lg">
                                                                        <p className="font-bold text-stone-900">{row.day} 周{row.wk}</p>
                                                                        <p className="mt-1 flex items-center gap-1.5 tabular-nums text-stone-700"><span className="h-2 w-2 rounded-[2px]" style={{ background: C.week }} />这天 {row.revenue === null ? '没有结算' : `RM ${fmtRM(row.revenue)}`}</p>
                                                                        <p className="flex items-center gap-1.5 tabular-nums text-stone-500"><span className="h-2 w-2 rounded-[2px]" style={{ background: C.lastWeek }} />上周 {row.lastWeek === null ? '没有结算' : `RM ${fmtRM(row.lastWeek)}`}</p>
                                                                        {diff !== null && <div className="mt-1.5"><Delta pct={diff} /></div>}
                                                                    </div>
                                                                );
                                                            }}
                                                        />
                                                        <Bar dataKey="lastWeek" fill={C.lastWeek} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                                                        <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                                                            {r.trend.map((d, i) => (
                                                                <Cell key={i} fill={d.isTarget ? C.weekFocus : C.week} />
                                                            ))}
                                                            <LabelList
                                                                dataKey="revenue"
                                                                content={({ x, y, width, value, index }: any) =>
                                                                    r.trend[index]?.isTarget && value ? (
                                                                        <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={800} fill={C.ink}>{fmtK(value)}</text>
                                                                    ) : null
                                                                }
                                                            />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <p className="mt-2 text-[11.5px] font-medium text-stone-400">数字全部来自每天的结算单 · 点柱子看当天和上周对比</p>
                                        </div>
                                    </article>
                                );
                            })()}

                            {/* 右栏 */}
                            <div className={`grid grid-cols-1 gap-4 content-start ${dailyReportSummary ? 'lg:col-span-5 xl:col-span-4' : 'lg:col-span-12 md:grid-cols-2'}`}>
                                {/* 本月累计 */}
                                <article className={`${CARD} p-4 md:p-5`}>
                                    <CardTitle
                                        icon={<TrendingUp size={18} />}
                                        title="本月累计营业额"
                                        sub={kpiMetrics.monthSettlementsCount > 0 ? `已结算 ${kpiMetrics.monthSettlementsCount} 天 · 日均 RM ${fmtRM(monthCompare?.dailyAvg || 0)}` : '这个月还没有结算'}
                                    />
                                    <div className="mt-4 flex items-baseline gap-1.5">
                                        <span className="text-[13px] font-bold text-stone-400">RM</span>
                                        <span className="text-[30px] font-extrabold leading-none tracking-[-0.03em] text-stone-900 tabular-nums">
                                            {monthCompare ? fmtRM(monthCompare.cur) : '--'}
                                        </span>
                                    </div>
                                    {monthCompare && monthCompare.last > 0 && (
                                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                            <Delta pct={monthCompare.diffPct} />
                                            <span className="whitespace-nowrap text-[12px] font-medium text-stone-500 tabular-nums">上月同期 {monthCompare.prevLabel} RM {fmtRM(monthCompare.last)}</span>
                                        </div>
                                    )}
                                    {kpiMetrics.monthTotalSales !== null && (
                                        <div className="mt-4">
                                            <div className="flex items-center justify-between text-[12px] font-semibold text-stone-500">
                                                <span>目标 RM {fmtRM(monthlyBudget)}</span>
                                                <span className="tabular-nums text-stone-900">{dashboardFinancials.monthlyProgress}%</span>
                                            </div>
                                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-300">
                                                <div className="h-full rounded-full bg-[#D9A300]" style={{ width: `${Math.min(100, dashboardFinancials.monthlyProgress)}%` }} />
                                            </div>
                                            {dashboardFinancials.projectedMonthSales !== null && (
                                                <p className="mt-2 text-[12px] font-medium text-stone-500 tabular-nums">照这个速度，月底约 RM {fmtRM(dashboardFinancials.projectedMonthSales)}</p>
                                            )}
                                        </div>
                                    )}
                                </article>

                                {/* 应付账款（合并：总额 + 逾期 + 分布） */}
                                {(() => {
                                    const total = dashboardFinancials.outstandingAmount;
                                    const overdue = paymentMetrics.overdueAmount;
                                    const soon = paymentMetrics.dueSoonAmount;
                                    const later = Math.max(0, total - overdue - soon);
                                    const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
                                    const rows = [
                                        { key: 'overdue', label: '已逾期', icon: '⚠️', amount: overdue, count: paymentMetrics.overdueCount, color: '#E5484D', text: 'text-rose-700' },
                                        { key: 'soon', label: '7 天内到期', icon: '⏳', amount: soon, count: paymentMetrics.dueSoonCount, color: '#F5A524', text: 'text-amber-700' },
                                        { key: 'later', label: '还没到期', icon: '✓', amount: later, count: null as number | null, color: '#30A46C', text: 'text-emerald-700' },
                                    ];
                                    return (
                                        <button type="button" onClick={() => openModule('AP', () => setActiveModal('AP'))} className={`${CARD} w-full p-4 md:p-5 text-left transition-transform active:scale-[0.995]`}>
                                            <CardTitle
                                                icon={<CreditCard size={18} />}
                                                title="应付账款"
                                                sub={`${dashboardFinancials.outstandingCount} 笔未付`}
                                                right={<ChevronRight size={18} className="mt-2 text-stone-300" />}
                                            />
                                            <div className="mt-4 flex items-baseline gap-1.5">
                                                <span className="text-[13px] font-bold text-stone-400">RM</span>
                                                <span className="text-[30px] font-extrabold leading-none tracking-[-0.03em] text-stone-900 tabular-nums">{fmtRM(total, 2)}</span>
                                            </div>
                                            {total > 0 && (
                                                <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
                                                    {rows.filter(x => x.amount > 0).map(x => (
                                                        <div key={x.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${pct(x.amount)}%`, background: x.color }} />
                                                    ))}
                                                </div>
                                            )}
                                            <ul className="mt-3 space-y-1.5">
                                                {rows.map(x => (
                                                    <li key={x.key} className="flex items-center justify-between gap-3 text-[12.5px]">
                                                        <span className="flex items-center gap-2 font-medium text-stone-600">
                                                            <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
                                                            {x.label}
                                                            {x.count ? <span className="text-stone-400">· {x.count} 笔</span> : null}
                                                        </span>
                                                        <span className={`font-semibold tabular-nums ${x.key === 'overdue' && x.amount > 0 ? 'text-rose-700' : 'text-stone-900'}`}>RM {fmtRM(x.amount)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            {paymentMetrics.overdueCount > 0 && (
                                                <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] font-semibold text-rose-800">
                                                    <AlertTriangle size={15} className="shrink-0" />
                                                    <span>{paymentMetrics.overdueCount} 笔已逾期，点这里去处理</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })()}

                                {/* 需要留意（精简清单） */}
                                <article className={`${CARD} p-4 md:p-5`}>
                                    <CardTitle icon={<ListChecks size={18} />} title="需要留意" right={<span className="mt-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">实时</span>} />
                                    <ul className="mt-3 divide-y divide-stone-200">
                                        {[
                                            { label: '近 30 天结算差额', value: varianceMetrics.count, unit: '天', alert: varianceMetrics.count > 0, hint: varianceMetrics.count > 0 ? `合计 RM ${fmtRM(varianceMetrics.amount, 2)}` : '都对得上' },
                                            { label: '核心物料低库存', value: criticalLowStockCount ?? 0, unit: '款', alert: (criticalLowStockCount ?? 0) > 0, hint: (criticalLowStockCount ?? 0) > 0 ? '要补货' : '充足' },
                                            { label: '今天请假 / 缺勤', value: absentCount ?? 0, unit: '人', alert: (absentCount ?? 0) > 0, hint: (absentCount ?? 0) > 0 ? '留意人手' : '全员到齐' },
                                            { label: '采购单等收货', value: pendingPOCount, unit: '张', alert: false, hint: pendingPOCount > 0 ? '货到记得点收' : '没有' },
                                        ].map(row => (
                                            <li key={row.label} className="flex items-center gap-2.5 py-2.5">
                                                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${row.alert ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {row.alert ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block whitespace-nowrap text-[13px] font-semibold text-stone-800">{row.label}</span>
                                                    <span className="block whitespace-nowrap text-[11.5px] font-medium text-stone-500">{row.hint}</span>
                                                </span>
                                                <span className="shrink-0 text-[16px] font-extrabold text-stone-900 tabular-nums">
                                                    {row.value}<span className="ml-0.5 text-[11px] font-semibold text-stone-400">{row.unit}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>

                            </div>
                        </section>

                                {/* 快速查看：整排小方块 */}
                                <section className={`${CARD} p-4 md:p-5`}>
                                    <CardTitle icon={<LayoutGrid size={18} />} title="快速查看" />
                                    <div className="mt-3 grid grid-cols-1 overflow-hidden rounded-2xl border border-stone-300 divide-y divide-stone-300 sm:grid-cols-3 lg:grid-cols-6 sm:gap-2 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0">
                                        {[
                                            { label: '网站订单', target: 'ONLINE_ORDERS', Icon: ShoppingBag, action: () => onNavigate('ONLINE_ORDERS') },
                                            { label: '营业报表', target: 'REPORTS', Icon: FileBarChart, action: () => setActiveModal('REPORTS') },
                                            { label: '人工与盈利', target: 'LABOUR_PROFIT', Icon: TrendingUp, action: () => setActiveModal('LABOUR_PROFIT') },
                                            { label: '资金状况', target: 'TREASURY', Icon: Wallet, action: () => setActiveModal('TREASURY') },
                                            { label: '成本监控', target: 'PRICE_MONITOR', Icon: TrendingUp, action: () => setActiveModal('PRICE_MONITOR') },
                                            { label: '兼职与预支', target: 'STAFF_CASH', Icon: Banknote, action: () => onNavigate('STAFF_CASH') },
                                        ].filter(link => canUse(link.target)).map(link => (
                                            <button key={link.label} onClick={link.action} className="flex min-h-[48px] items-center gap-2.5 bg-white px-3.5 text-[13.5px] font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:bg-stone-100 sm:justify-center sm:gap-2 sm:rounded-2xl sm:border sm:border-stone-300 sm:bg-stone-50 sm:px-1 sm:text-[13px]">
                                                <link.Icon size={18} className="shrink-0 text-stone-600" />
                                                <span className="flex-1 whitespace-nowrap text-left sm:flex-none">{link.label}</span>
                                                <ChevronRight size={16} className="text-stone-300 sm:hidden" />
                                            </button>
                                        ))}
                                    </div>
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
