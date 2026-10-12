import React, { useState, useMemo, useEffect } from 'react';
import { 
    X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
    ArrowUpRight, Store, Receipt, Calendar, Edit3, Check, BarChart2, LineChart as LineChartIcon,
    PieChart as PieChartLucide, GitCompare
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend
} from 'recharts';
import { SettlementRecord, ExpenseItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface DailyBusinessReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    settlements: SettlementRecord[];
    initialDate?: string;
    onNavigateToSettlement?: (date: string) => void;
    onNavigateToReports?: () => void;
    onSettlementUpdated?: () => void;
}

// Format local currency
const fmt = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Shift date helper YYYY-MM-DD
const shiftDays = (dateStr: string, days: number): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
};

// Day of week in Chinese
const getDayOfWeekName = (dateStr: string): string => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return days[date.getDay()] || '';
};

// Weather emoji helper
const getWeatherLabel = (weather?: string): { text: string; emoji: string } => {
    switch (weather) {
        case 'SUNNY': return { text: '晴朗', emoji: '☀️' };
        case 'CLOUDY': return { text: '多云', emoji: '⛅' };
        case 'RAIN': return { text: '下雨', emoji: '🌧️' };
        case 'HEAVY_RAIN': return { text: '暴雨', emoji: '⛈️' };
        default: return { text: '正常', emoji: '🌤️' };
    }
};

// Recharts 自定义移动端友好 Tooltip
const ChartCustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#111111]/95 backdrop-blur-md text-white p-2.5 rounded-xl shadow-xl border border-stone-800 text-xs font-sans space-y-1 z-50">
                <p className="font-bold text-stone-300 text-[11px] border-b border-stone-800 pb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5 font-medium" style={{ color: entry.color }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                            {entry.name}:
                        </span>
                        <span className="font-mono font-black text-white">
                            RM {Number(entry.value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// 客户来源环形图 Tooltip
const PieCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const item = payload[0];
        return (
            <div className="bg-[#111111]/95 backdrop-blur-md text-white p-2.5 rounded-xl shadow-xl border border-stone-800 text-xs font-sans space-y-1 z-50">
                <p className="font-bold text-stone-300 text-[11px] border-b border-stone-800 pb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.payload?.color || item.color }}></span>
                    {item.name}
                </p>
                <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-stone-400 font-medium">客流贡献:</span>
                    <span className="font-mono font-black text-white">{item.value} 人</span>
                </div>
                {item.payload?.desc && (
                    <p className="text-[10px] text-stone-400 mt-0.5">{item.payload.desc}</p>
                )}
            </div>
        );
    }
    return null;
};

// 本周与上周同期同比 Tooltip
const WowCustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#111111]/95 backdrop-blur-md text-white p-2.5 rounded-xl shadow-xl border border-stone-800 text-xs font-sans space-y-1 z-50 min-w-[170px]">
                <p className="font-bold text-stone-300 text-[11px] border-b border-stone-800 pb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={`wow-item-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5 font-medium" style={{ color: entry.color }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                            {entry.name}:
                        </span>
                        <span className="font-mono font-black text-white">
                            RM {Number(entry.value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const DailyBusinessReportModal: React.FC<DailyBusinessReportModalProps> = ({
    isOpen,
    onClose,
    settlements,
    initialDate,
    onNavigateToSettlement,
    onNavigateToReports,
    onSettlementUpdated
}) => {
    // Determine Malaysia (UTC+8) yesterday
    const defaultYesterday = useMemo(() => {
        const now = new Date();
        const utc8 = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3600000 * 8));
        const yesterday = new Date(utc8.getTime() - 86400000);
        return yesterday.toISOString().split('T')[0];
    }, []);

    // Active settlements list (with fallback fetch)
    const [allSettlements, setAllSettlements] = useState<SettlementRecord[]>(settlements || []);

    useEffect(() => {
        if (settlements && settlements.length > 0) {
            setAllSettlements(settlements);
        } else if (isOpen) {
            DataManager.getSettlements().then(res => {
                if (res && res.length > 0) {
                    setAllSettlements(res);
                }
            }).catch(e => console.error('Failed to load settlements for daily report:', e));
        }
    }, [settlements, isOpen]);

    // Active selected date
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
            return initialDate;
        }
        // If yesterday's settlement exists, select it; otherwise select the newest settlement date
        const list = settlements && settlements.length > 0 ? settlements : [];
        const hasYesterday = list.some(s => s.date === defaultYesterday);
        if (hasYesterday || list.length === 0) {
            return defaultYesterday;
        }
        return list[0]?.date || defaultYesterday;
    });

    // Update selectedDate if initialDate changes
    useEffect(() => {
        if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
            setSelectedDate(initialDate);
        }
    }, [initialDate]);

    // Standalone expenses for the active date
    const [dayExpenses, setDayExpenses] = useState<ExpenseItem[]>([]);

    // Edit order count state
    const [isEditingOrders, setIsEditingOrders] = useState(false);
    const [customOrderCount, setCustomOrderCount] = useState<string>('');
    const [savingOrders, setSavingOrders] = useState(false);

    // 图表模式：'COMPARISON' 对比柱状图 | 'TREND' 7日走势图 | 'WOW' 本周与上周同比
    const [chartMode, setChartMode] = useState<'COMPARISON' | 'TREND' | 'WOW'>('COMPARISON');
    // 同比指标查看焦点：'ALL' 全部 | 'REVENUE' 营收同比 | 'PROFIT' 利润同比
    const [wowMetricFocus, setWowMetricFocus] = useState<'ALL' | 'REVENUE' | 'PROFIT'>('ALL');

    // Fetch standalone expenses for selected date
    useEffect(() => {
        if (!isOpen || !selectedDate) return;
        let isMounted = true;

        const fetchDayExpenses = async () => {
            try {
                const qExp = query(
                    collection(db, 'standalone_expenses'),
                    where('time', '>=', `${selectedDate}T00:00:00`),
                    where('time', '<=', `${selectedDate}T23:59:59`)
                );
                const snap = await getDocs(qExp);
                if (isMounted) {
                    const items = snap.docs.map(d => d.data() as ExpenseItem);
                    setDayExpenses(items);
                }
            } catch (err) {
                console.error('Failed to load standalone expenses for daily report:', err);
                if (isMounted) setDayExpenses([]);
            }
        };

        fetchDayExpenses();
        return () => { isMounted = false; };
    }, [isOpen, selectedDate]);

    // Current settlement record
    const currentSettlement = useMemo(() => {
        return allSettlements.find(s => s.date === selectedDate);
    }, [allSettlements, selectedDate]);

    // Previous day settlement record
    const prevDayDate = useMemo(() => shiftDays(selectedDate, -1), [selectedDate]);
    const prevDaySettlement = useMemo(() => {
        return allSettlements.find(s => s.date === prevDayDate);
    }, [allSettlements, prevDayDate]);

    // Same day last week settlement record
    const lastWeekSameDate = useMemo(() => shiftDays(selectedDate, -7), [selectedDate]);
    const lastWeekSettlement = useMemo(() => {
        return allSettlements.find(s => s.date === lastWeekSameDate);
    }, [allSettlements, lastWeekSameDate]);

    // Financial breakdown for current selected day
    const metrics = useMemo(() => {
        if (!currentSettlement) {
            return {
                isSettled: false,
                revenue: 0,
                inStoreSales: 0,
                deliveryGross: 0,
                directCashExpenses: 0,
                standaloneExpensesTotal: 0,
                platformDeductions: 0,
                totalExpenses: 0,
                estimatedCogs: 0,
                grossProfit: 0,
                netProfit: 0,
                profitMargin: 0,
                orderCount: 0,
                averageTicket: 0,
                isOrderCountEstimated: true,
                paymentMethods: {
                    cash: 0,
                    tng: 0,
                    duitnow: 0,
                    card: 0,
                    amex: 0
                },
                deliveryBreakdown: {
                    grab: 0,
                    panda: 0,
                    shopee: 0,
                    lalamove: 0,
                    grabAds: 0,
                    pandaAds: 0,
                    shopeeAds: 0
                },
                variance: 0,
                weather: undefined
            };
        }

        const sales = currentSettlement.sales || {
            total: 0,
            storeHubTotal: 0,
            cash: 0,
            tng: 0,
            duitnow: 0,
            card: 0,
            amex: 0
        };
        const revenue = Number(sales.total) || 0;

        // In-store vs Delivery
        const inStoreSales = (Number(sales.cash) || 0) + (Number(sales.tng) || 0) + (Number(sales.duitnow) || 0) + (Number(sales.card) || 0) + (Number(sales.amex) || 0);
        const deliveryBreakdown = sales.deliveryBreakdown || {
            grab: 0,
            panda: 0,
            shopee: 0,
            lalamove: 0,
            grabAds: 0,
            pandaAds: 0,
            shopeeAds: 0
        };
        const deliveryGross = (Number(deliveryBreakdown.grabGross || deliveryBreakdown.grab) || 0)
            + (Number(deliveryBreakdown.pandaGross || deliveryBreakdown.panda) || 0)
            + (Number(deliveryBreakdown.shopeeGross || deliveryBreakdown.shopee) || 0)
            + (Number(deliveryBreakdown.lalamove) || 0);

        // Platform deductions
        const platformDeductions = (Number(deliveryBreakdown.grabAds) || 0)
            + (Number(deliveryBreakdown.pandaAds) || 0)
            + (Number(deliveryBreakdown.shopeeAds) || 0);

        // Direct cash expenses from settlement
        const shiftExpensesList = currentSettlement.expenses || [];
        const dayExpensesList = currentSettlement.dayExpenses || [];
        const directCashExpenses = [...shiftExpensesList, ...dayExpensesList].reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0);

        // Standalone expenses from database
        const standaloneTotal = dayExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        // Estimated Food Cost (COGS): Standard F&B benchmark 35% if no specific purchase entry today
        const actualFoodExpenses = dayExpenses
            .filter(e => ['INGREDIENT', 'MEAT', 'SEAFOOD', 'VEG', 'DRY', 'SAUCE', 'NOODLE', 'OIL', 'EGG', 'FROZEN', 'BEVERAGE', 'SUPPLIER'].some(k => (e.category || '').toUpperCase().includes(k)))
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        
        const estimatedCogs = actualFoodExpenses > 0 ? actualFoodExpenses : revenue * 0.35;

        // Total known expenses
        const totalExpenses = directCashExpenses + standaloneTotal + platformDeductions;

        // Gross Profit = Revenue - COGS
        const grossProfit = Math.max(0, revenue - estimatedCogs);

        // Net Operating Profit = Revenue - Total Expenses (or COGS + shift cash expenses + platform ads)
        const netProfit = revenue - estimatedCogs - directCashExpenses - platformDeductions;
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        // Order Count and Average Ticket (客单价)
        const customerCount = Number((currentSettlement as any).customerCount || (currentSettlement as any).guestCount) || 0;
        const vipCount = Number((currentSettlement as any).vipCount) || 0;
        const whatsappNewCount = Number((currentSettlement as any).whatsappNewCount) || 0;

        let orderCount = currentSettlement.orderCount;
        let isOrderCountEstimated = false;

        if (!orderCount || orderCount <= 0) {
            if (customerCount > 0) {
                orderCount = customerCount;
            } else {
                // Estimate based on standard casual dining average ticket (~RM 42/order)
                orderCount = Math.max(1, Math.round(revenue / 42));
                isOrderCountEstimated = true;
            }
        }

        const averageTicket = revenue > 0 && orderCount > 0 ? revenue / orderCount : 0;

        return {
            isSettled: true,
            revenue,
            inStoreSales,
            deliveryGross,
            directCashExpenses,
            standaloneExpensesTotal: standaloneTotal,
            platformDeductions,
            totalExpenses,
            estimatedCogs,
            grossProfit,
            netProfit,
            profitMargin,
            orderCount,
            averageTicket,
            isOrderCountEstimated,
            customerCount,
            vipCount,
            whatsappNewCount,
            paymentMethods: {
                cash: Number(sales.cash) || 0,
                tng: Number(sales.tng) || 0,
                duitnow: Number(sales.duitnow) || 0,
                card: Number(sales.card) || 0,
                amex: Number(sales.amex) || 0
            },
            deliveryBreakdown: {
                grab: Number(deliveryBreakdown.grabGross || deliveryBreakdown.grab) || 0,
                panda: Number(deliveryBreakdown.pandaGross || deliveryBreakdown.panda) || 0,
                shopee: Number(deliveryBreakdown.shopeeGross || deliveryBreakdown.shopee) || 0,
                lalamove: Number(deliveryBreakdown.lalamove) || 0,
                grabAds: Number(deliveryBreakdown.grabAds) || 0,
                pandaAds: Number(deliveryBreakdown.pandaAds) || 0,
                shopeeAds: Number(deliveryBreakdown.shopeeAds) || 0
            },
            variance: Number(currentSettlement.variance) || 0,
            weather: currentSettlement.weather
        };
    }, [currentSettlement, dayExpenses]);

    // Financial extractor helper for chart records
    const getRecordFinancials = (rec?: SettlementRecord | null) => {
        if (!rec) return { revenue: 0, netProfit: 0, averageTicket: 0, orderCount: 0, customerCount: 0, vipCount: 0, whatsappNewCount: 0 };
        const rev = Number(rec.sales?.total || 0);
        const cogs = rev * 0.35;
        const shiftExp = [...(rec.expenses || []), ...(rec.dayExpenses || [])].reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0);
        const db = rec.sales?.deliveryBreakdown || {} as any;
        const ads = (Number(db.grabAds) || 0) + (Number(db.pandaAds) || 0) + (Number(db.shopeeAds) || 0);
        const profit = rev > 0 ? (rev - cogs - shiftExp - ads) : 0;
        const custCount = Number((rec as any).customerCount || (rec as any).guestCount || 0);
        let orders = rec.orderCount || custCount;
        if (!orders || orders <= 0) {
            orders = rev > 0 ? Math.max(1, Math.round(rev / 42)) : 0;
        }
        const ticket = rev > 0 && orders > 0 ? rev / orders : 0;
        return {
            revenue: Math.round(rev),
            netProfit: Math.round(profit),
            averageTicket: Math.round(ticket * 10) / 10,
            orderCount: orders,
            customerCount: custCount,
            vipCount: Number((rec as any).vipCount) || 0,
            whatsappNewCount: Number((rec as any).whatsappNewCount) || 0
        };
    };

    // Comparison chart data (昨日/当前选定 vs 前一天 vs 上周同日)
    const comparisonChartData = useMemo(() => {
        const cur = getRecordFinancials(currentSettlement);
        const prev = getRecordFinancials(prevDaySettlement);
        const lastWk = getRecordFinancials(lastWeekSettlement);

        return [
            {
                name: '昨日/选定',
                date: selectedDate,
                '营收': cur.revenue,
                '利润': cur.netProfit,
                '客单价': cur.averageTicket,
            },
            {
                name: '前一天',
                date: prevDayDate,
                '营收': prev.revenue,
                '利润': prev.netProfit,
                '客单价': prev.averageTicket,
            },
            {
                name: '上周同日',
                date: lastWeekSameDate,
                '营收': lastWk.revenue,
                '利润': lastWk.netProfit,
                '客单价': lastWk.averageTicket,
            }
        ];
    }, [currentSettlement, prevDaySettlement, lastWeekSettlement, selectedDate, prevDayDate, lastWeekSameDate]);

    // 7-day trend chart data (包含每日营收、净利润、客单价走势)
    const trendChartData = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = shiftDays(selectedDate, -6 + i);
            const rec = allSettlements.find(s => s.date === d);
            const fin = getRecordFinancials(rec);
            const dParts = d.split('-');
            const shortDate = dParts.length === 3 ? `${parseInt(dParts[1], 10)}/${parseInt(dParts[2], 10)}` : d;
            const dayName = getDayOfWeekName(d).replace('星期', '周');
            return {
                date: d,
                label: `${shortDate} ${dayName}`,
                '营收': fin.revenue,
                '利润': fin.netProfit,
                '客单价': fin.averageTicket,
                isCurrent: d === selectedDate
            };
        });
    }, [allSettlements, selectedDate]);

    // 客户来源结构数据 (Donut PieChart) - 优化营销渠道效果评估
    const customerSourceData = useMemo(() => {
        const total = metrics.customerCount > 0 ? metrics.customerCount : (metrics.orderCount > 0 ? metrics.orderCount : 0);
        const vip = Math.max(0, metrics.vipCount || 0);
        const wa = Math.max(0, metrics.whatsappNewCount || 0);
        // 直接到店客流 = 总客流扣除 VIP 会员与 WhatsApp 私域活动
        const direct = Math.max(0, total - vip - wa);

        const sum = direct + vip + wa;
        const directPct = sum > 0 ? ((direct / sum) * 100).toFixed(1) : '0.0';
        const vipPct = sum > 0 ? ((vip / sum) * 100).toFixed(1) : '0.0';
        const waPct = sum > 0 ? ((wa / sum) * 100).toFixed(1) : '0.0';

        const rawItems = [
            { name: '直接到店', value: direct, color: '#2563EB', key: 'direct', emoji: '🚶‍♂️', role: '自然客流', desc: '门市散客及街边自然进店消费' },
            { name: 'VIP 转化', value: vip, color: '#D97706', key: 'vip', emoji: '👑', role: '忠诚复购', desc: '金莲记高价值会员卡及熟客' },
            { name: 'WhatsApp 推广', value: wa, color: '#059669', key: 'wa', emoji: '💬', role: '私域拉新', desc: '社群推广、私域活动与裂变引流' },
        ];
        const chartItems = rawItems.filter(item => item.value > 0);

        return {
            total,
            direct,
            vip,
            wa,
            sum,
            directPct,
            vipPct,
            waPct,
            chartItems: chartItems.length > 0 ? chartItems : [
                { name: '待录入客流', value: 1, color: '#E5E7EB', key: 'empty', emoji: '⏳', role: '待录入', desc: '可通过每日结算或批量核对补齐客流' }
            ],
            hasRealData: sum > 0
        };
    }, [metrics.customerCount, metrics.vipCount, metrics.whatsappNewCount, metrics.orderCount]);

    // 财务数据同比分析数据 (Week-over-Week 本周与上周同期对比)
    const wowChartData = useMemo(() => {
        let thisWeekTotalRev = 0;
        let lastWeekTotalRev = 0;
        let thisWeekTotalProfit = 0;
        let lastWeekTotalProfit = 0;

        const list = Array.from({ length: 7 }, (_, i) => {
            const thisDate = shiftDays(selectedDate, -6 + i);
            const lastDate = shiftDays(thisDate, -7);

            const thisRec = allSettlements.find(s => s.date === thisDate);
            const lastRec = allSettlements.find(s => s.date === lastDate);

            const thisFin = getRecordFinancials(thisRec);
            const lastFin = getRecordFinancials(lastRec);

            thisWeekTotalRev += thisFin.revenue;
            lastWeekTotalRev += lastFin.revenue;
            thisWeekTotalProfit += thisFin.netProfit;
            lastWeekTotalProfit += lastFin.netProfit;

            const dayOfWeek = getDayOfWeekName(thisDate).replace('星期', '周');
            const dParts = thisDate.split('-');
            const shortDate = dParts.length === 3 ? `${parseInt(dParts[1], 10)}/${parseInt(dParts[2], 10)}` : thisDate;

            return {
                dayLabel: `${dayOfWeek} (${shortDate})`,
                shortDay: dayOfWeek,
                thisDate,
                lastDate,
                '本周营收': thisFin.revenue,
                '上周同期营收': lastFin.revenue,
                '本周利润': thisFin.netProfit,
                '上周同期利润': lastFin.netProfit,
                revDiff: thisFin.revenue - lastFin.revenue,
                profitDiff: thisFin.netProfit - lastFin.netProfit,
                isCurrentDay: thisDate === selectedDate
            };
        });

        const revGrowthPct = lastWeekTotalRev > 0 ? ((thisWeekTotalRev - lastWeekTotalRev) / lastWeekTotalRev) * 100 : null;
        const profitGrowthPct = lastWeekTotalProfit > 0 ? ((thisWeekTotalProfit - lastWeekTotalProfit) / lastWeekTotalProfit) * 100 : null;

        return {
            list,
            thisWeekTotalRev,
            lastWeekTotalRev,
            thisWeekTotalProfit,
            lastWeekTotalProfit,
            revGrowthPct,
            profitGrowthPct
        };
    }, [allSettlements, selectedDate]);

    // Comparison with last week
    const lastWeekDiff = useMemo(() => {
        if (!lastWeekSettlement || !metrics.revenue) return null;
        const lastWeekRevenue = Number(lastWeekSettlement.sales?.total) || 0;
        if (lastWeekRevenue <= 0) return null;
        const diffAmount = metrics.revenue - lastWeekRevenue;
        const diffPercent = ((diffAmount) / lastWeekRevenue) * 100;
        return { diffAmount, diffPercent, lastWeekRevenue };
    }, [lastWeekSettlement, metrics.revenue]);

    // Comparison with previous day
    const prevDayDiff = useMemo(() => {
        if (!prevDaySettlement || !metrics.revenue) return null;
        const prevRevenue = Number(prevDaySettlement.sales?.total) || 0;
        if (prevRevenue <= 0) return null;
        const diffAmount = metrics.revenue - prevRevenue;
        const diffPercent = ((diffAmount) / prevRevenue) * 100;
        return { diffAmount, diffPercent, prevRevenue };
    }, [prevDaySettlement, metrics.revenue]);

    // Handle saving custom order count
    const handleSaveOrderCount = async () => {
        if (!currentSettlement) return;
        const num = parseInt(customOrderCount, 10);
        if (isNaN(num) || num < 0) {
            alert('⚠️ 请输入合法的订单单数');
            return;
        }

        setSavingOrders(true);
        try {
            const updated = {
                ...currentSettlement,
                orderCount: num
            };
            await DataManager.saveSettlement(updated);
            setIsEditingOrders(false);
            if (onSettlementUpdated) {
                onSettlementUpdated();
            }
        } catch (e) {
            console.error('Failed to update orderCount', e);
            alert('❌ 保存失败，请检查网络');
        } finally {
            setSavingOrders(false);
        }
    };

    if (!isOpen) return null;

    const weatherInfo = getWeatherLabel(metrics.weather);
    const dayOfWeek = getDayOfWeekName(selectedDate);
    const isYesterday = selectedDate === defaultYesterday;

    return (
        <div 
            className="fixed inset-0 z-[220] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-[#F8F9FA] rounded-t-[2rem] md:rounded-[2rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] md:max-h-[88vh] overflow-hidden border border-stone-200"
                onClick={e => e.stopPropagation()}
            >
                {/* 顶部标题栏：带安全区域 */}
                <div className="bg-[#111111] text-white px-5 py-4 border-b border-stone-800 flex items-center justify-between shrink-0 safe-area-top">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#FFD200] text-stone-950 flex items-center justify-center font-black shadow-md shrink-0">
                            📊
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base md:text-lg font-black tracking-tight text-white truncate">
                                    经营日报 · 财务简报
                                </h2>
                                {isYesterday && (
                                    <span className="text-[10px] font-black bg-[#FFD200] text-stone-950 px-2 py-0.5 rounded-full shrink-0">
                                        昨日
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-stone-400 font-medium truncate mt-0.5">
                                实时营收、利润核算与客单分析
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-stone-300 flex items-center justify-center transition-colors min-h-[44px] min-w-[44px] shrink-0"
                        aria-label="关闭"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 日期选择控制器 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                    <button
                        onClick={() => setSelectedDate(shiftDays(selectedDate, -1))}
                        className="flex items-center justify-center w-10 h-10 rounded-xl border border-stone-200 text-stone-700 active:scale-95 active:bg-stone-100 transition-all min-h-[44px] min-w-[44px]"
                        title="前一天"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <div className="flex items-center gap-2 text-center">
                        <Calendar size={15} className="text-stone-400 shrink-0" />
                        <span className="text-sm font-black text-stone-900 font-mono tracking-tight">
                            {selectedDate}
                        </span>
                        <span className="text-xs font-bold text-stone-500">
                            ({dayOfWeek})
                        </span>
                        <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                            {weatherInfo.emoji} {weatherInfo.text}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setSelectedDate(shiftDays(selectedDate, 1))}
                            disabled={selectedDate >= defaultYesterday}
                            className="flex items-center justify-center w-10 h-10 rounded-xl border border-stone-200 text-stone-700 active:scale-95 active:bg-stone-100 disabled:opacity-30 disabled:pointer-events-none transition-all min-h-[44px] min-w-[44px]"
                            title="后一天"
                        >
                            <ChevronRight size={18} />
                        </button>
                        
                        {!isYesterday && (
                            <button
                                onClick={() => setSelectedDate(defaultYesterday)}
                                className="px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-black border border-amber-200 active:scale-95 transition-all min-h-[44px] flex items-center"
                            >
                                回到昨日
                            </button>
                        )}
                    </div>
                </div>

                {/* 滚动内容区 */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                    {!metrics.isSettled ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                            <div className="text-3xl">📝</div>
                            <h3 className="text-base font-black text-amber-900">
                                {selectedDate} 尚未提交结账
                            </h3>
                            <p className="text-xs text-amber-700 leading-relaxed max-w-md mx-auto">
                                当日结算单可能仍在当班中或暂未录入。您可以点击上方按钮切换至其他已结算日期，或前往“每日结算”进行结账操作。
                            </p>
                            {onNavigateToSettlement && (
                                <button
                                    onClick={() => {
                                        onClose();
                                        onNavigateToSettlement(selectedDate);
                                    }}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-950 text-[#FFD200] font-black rounded-xl text-xs active:scale-95 transition-all min-h-[44px]"
                                >
                                    <Edit3 size={15} /> 前往结账录入
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* 三大关键财务指标大卡 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* 1. 营业收入 */}
                                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-black text-stone-400 tracking-wider">
                                            营业总收入
                                        </span>
                                        <span className="text-stone-400">💵</span>
                                    </div>
                                    <div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xs font-black text-stone-400 font-mono">RM</span>
                                            <strong className="text-2xl font-black text-stone-950 font-mono tracking-tight">
                                                {fmt(metrics.revenue)}
                                            </strong>
                                        </div>
                                        <div className="mt-2 text-[10px] text-stone-500 font-semibold space-y-0.5">
                                            <div className="flex justify-between">
                                                <span>堂食实收:</span>
                                                <span className="font-mono font-bold text-stone-800">RM {fmt(metrics.inStoreSales)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>平台外卖:</span>
                                                <span className="font-mono font-bold text-stone-800">RM {fmt(metrics.deliveryGross)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {(lastWeekDiff || prevDayDiff) && (
                                        <div className="mt-3 pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-1 text-[10px] font-black">
                                            {lastWeekDiff && (
                                                <div className={`flex items-center gap-0.5 ${
                                                    lastWeekDiff.diffPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                }`}>
                                                    {lastWeekDiff.diffPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                    <span>
                                                        {lastWeekDiff.diffPercent >= 0 ? '+' : ''}{lastWeekDiff.diffPercent.toFixed(1)}% 上周同日
                                                    </span>
                                                </div>
                                            )}
                                            {prevDayDiff && (
                                                <span className="text-stone-400 font-bold">
                                                    较前日 {prevDayDiff.diffPercent >= 0 ? '+' : ''}{prevDayDiff.diffPercent.toFixed(1)}%
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 2. 经营利润 */}
                                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-black text-stone-400 tracking-wider">
                                            经营净利润
                                        </span>
                                        <span className="text-stone-400">📈</span>
                                    </div>
                                    <div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xs font-black text-stone-400 font-mono">RM</span>
                                            <strong className={`text-2xl font-black font-mono tracking-tight ${
                                                metrics.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                            }`}>
                                                {fmt(metrics.netProfit)}
                                            </strong>
                                        </div>
                                        <div className="mt-2 text-[10px] text-stone-500 font-semibold space-y-0.5">
                                            <div className="flex justify-between">
                                                <span>净利润率:</span>
                                                <span className={`font-mono font-black ${metrics.profitMargin >= 25 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                    {metrics.profitMargin.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>原料/食材预估:</span>
                                                <span className="font-mono font-bold text-stone-800">RM {fmt(metrics.estimatedCogs)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400 font-bold">
                                        <span>毛利 RM {fmt(metrics.grossProfit)}</span>
                                        <span className="text-stone-300">· 餐饮健康度</span>
                                    </div>
                                </div>

                                {/* 3. 平均客单价 */}
                                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-black text-stone-400 tracking-wider">
                                            平均客单价 (ATV)
                                        </span>
                                        <span className="text-stone-400">🍽️</span>
                                    </div>
                                    <div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xs font-black text-stone-400 font-mono">RM</span>
                                            <strong className="text-2xl font-black text-stone-950 font-mono tracking-tight">
                                                {fmt(metrics.averageTicket)}
                                            </strong>
                                            <span className="text-[10px] font-bold text-stone-400 ml-1">/ 单</span>
                                        </div>
                                        <div className="mt-2 text-[10px] text-stone-500 font-semibold flex items-center justify-between">
                                            <span>
                                                总单数: <b className="font-mono font-black text-stone-800">{metrics.orderCount}</b> 单
                                                {metrics.isOrderCountEstimated && <span className="text-[9px] text-stone-400 ml-1">(预估)</span>}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setCustomOrderCount(String(metrics.orderCount));
                                                    setIsEditingOrders(true);
                                                }}
                                                className="text-amber-600 font-bold hover:underline flex items-center gap-0.5 text-[10px]"
                                            >
                                                <Edit3 size={11} /> 调整单数
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center gap-1.5 text-[10px]">
                                        <span className={`px-2 py-0.5 rounded-full font-black text-[9px] ${
                                            metrics.averageTicket >= 40 
                                                ? 'bg-emerald-50 text-emerald-700' 
                                                : metrics.averageTicket >= 30 
                                                    ? 'bg-amber-50 text-amber-700' 
                                                    : 'bg-rose-50 text-rose-700'
                                        }`}>
                                            {metrics.averageTicket >= 40 ? '高价值' : metrics.averageTicket >= 30 ? '标准区间' : '客单偏低'}
                                        </span>
                                        <span className="text-stone-400 text-[9px]">建议提升酒水点单</span>
                                    </div>
                                </div>
                            </div>

                            {/* 调整单数的小弹层 */}
                            {isEditingOrders && (
                                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-amber-900 block mb-1">
                                            修正当日实际订单笔数 (POS单数)：
                                        </label>
                                        <input
                                            type="number"
                                            value={customOrderCount}
                                            onChange={e => setCustomOrderCount(e.target.value)}
                                            className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-400"
                                            placeholder="输入实际单数，如 145"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex items-center gap-1.5 self-end">
                                        <button
                                            onClick={handleSaveOrderCount}
                                            disabled={savingOrders}
                                            className="px-3 py-1.5 bg-stone-900 text-[#FFD200] rounded-xl text-xs font-black flex items-center gap-1 min-h-[36px] active:scale-95"
                                        >
                                            <Check size={14} /> 保存
                                        </button>
                                        <button
                                            onClick={() => setIsEditingOrders(false)}
                                            className="px-3 py-1.5 bg-stone-200 text-stone-700 rounded-xl text-xs font-bold min-h-[36px]"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 👥 每日结算新增：客流与私域运营数据 (整齐排列：客户人数、VIP人数、WhatsApp新增人数) */}
                            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base">👥</span>
                                        <h4 className="text-xs font-black text-stone-950">
                                            客流与私域运营 (Customer & Traffic)
                                        </h4>
                                    </div>
                                    <span className="text-[10px] text-stone-400 font-bold">
                                        每日结算同步
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2.5">
                                    {/* 客户人数 */}
                                    <div className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-center flex flex-col justify-between">
                                        <p className="text-[10px] font-bold text-stone-500">👥 客户总人数</p>
                                        <div className="my-1">
                                            <span className="font-mono text-lg font-black text-stone-950">
                                                {metrics.customerCount > 0 ? metrics.customerCount : (metrics.orderCount > 0 ? metrics.orderCount : 0)}
                                            </span>
                                            <span className="text-[10px] font-normal text-stone-400 ml-0.5">人</span>
                                        </div>
                                        <p className="text-[9px] text-stone-400 font-medium">
                                            {metrics.customerCount > 0 ? '到店总客流' : '以订单数估算'}
                                        </p>
                                    </div>

                                    {/* VIP人数 */}
                                    <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100 text-center flex flex-col justify-between">
                                        <p className="text-[10px] font-bold text-amber-800">👑 VIP 人数</p>
                                        <div className="my-1">
                                            <span className="font-mono text-lg font-black text-amber-950">
                                                {metrics.vipCount}
                                            </span>
                                            <span className="text-[10px] font-normal text-amber-700 ml-0.5">人</span>
                                        </div>
                                        <p className="text-[9px] text-amber-700 font-medium">
                                            {metrics.customerCount > 0 && metrics.vipCount > 0
                                                ? `占比 ${((metrics.vipCount / metrics.customerCount) * 100).toFixed(0)}%`
                                                : '会员到店复购'}
                                        </p>
                                    </div>

                                    {/* WhatsApp 新增人数 */}
                                    <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100 text-center flex flex-col justify-between">
                                        <p className="text-[10px] font-bold text-emerald-800">💬 WA 新增</p>
                                        <div className="my-1">
                                            <span className="font-mono text-lg font-black text-emerald-950">
                                                +{metrics.whatsappNewCount}
                                            </span>
                                            <span className="text-[10px] font-normal text-emerald-700 ml-0.5">人</span>
                                        </div>
                                        <p className="text-[9px] text-emerald-700 font-medium">私域留存沉淀</p>
                                    </div>
                                </div>

                                {metrics.customerCount > 0 && metrics.revenue > 0 && (
                                    <div className="bg-stone-50/70 p-2.5 rounded-xl border border-stone-200/60 flex items-center justify-between text-xs">
                                        <span className="text-stone-500 font-bold text-[11px]">人均客单产出 (Rev/Pax):</span>
                                        <span className="font-mono font-black text-stone-900">
                                            RM {(metrics.revenue / metrics.customerCount).toFixed(2)} / 人
                                        </span>
                                    </div>
                                )}

                                {/* 🎯 客户来源结构圆形图表 (PieChart) - 优化老板对营销渠道效果的量化评估 */}
                                <div className="mt-3 pt-3 border-t border-stone-100 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <PieChartLucide size={14} className="text-stone-800" />
                                            <h5 className="text-[11px] font-black text-stone-900">
                                                今日新增客户来源结构 (Acquisition Channels)
                                            </h5>
                                        </div>
                                        <span className="text-[9px] font-bold text-stone-400">
                                            渠道转化量化评估
                                        </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-stone-50/70 p-3 rounded-2xl border border-stone-200/60">
                                        {/* 左侧：环形饼图 (Donut PieChart) */}
                                        <div className="relative w-[170px] h-[155px] flex items-center justify-center shrink-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Tooltip content={<PieCustomTooltip />} />
                                                    <Pie
                                                        data={customerSourceData.chartItems}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={44}
                                                        outerRadius={68}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                    >
                                                        {customerSourceData.chartItems.map((entry, index) => (
                                                            <Cell key={`pie-cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                            {/* 环心指标提示 */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                                                <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider">总客流</span>
                                                <span className="font-mono text-base font-black text-stone-950 leading-none mt-0.5">
                                                    {customerSourceData.total}
                                                </span>
                                                <span className="text-[9px] text-stone-400">人</span>
                                            </div>
                                        </div>

                                        {/* 右侧：三大渠道量化评估卡片 (整齐排列) */}
                                        <div className="flex-1 w-full space-y-1.5 min-w-0">
                                            {/* 1. 直接到店 */}
                                            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-stone-200/80 shadow-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
                                                    <div className="truncate">
                                                        <span className="text-[11px] font-black text-stone-800 block leading-tight">
                                                            🚶‍♂️ 直接到店 (Walk-in)
                                                        </span>
                                                        <span className="text-[9px] text-stone-400 block leading-tight">
                                                            散客与街边自然进店
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="font-mono text-xs font-black text-stone-950">
                                                        {customerSourceData.direct} 人
                                                    </span>
                                                    <span className="text-[9px] font-bold text-blue-600 ml-1.5 bg-blue-50 px-1.5 py-0.5 rounded">
                                                        {customerSourceData.directPct}%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 2. VIP 转化 */}
                                            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-amber-200/80 shadow-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                                                    <div className="truncate">
                                                        <span className="text-[11px] font-black text-stone-800 block leading-tight">
                                                            👑 VIP 转化 (VIP Member)
                                                        </span>
                                                        <span className="text-[9px] text-amber-700 block leading-tight">
                                                            会员到店与熟客复购
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="font-mono text-xs font-black text-amber-950">
                                                        {customerSourceData.vip} 人
                                                    </span>
                                                    <span className="text-[9px] font-bold text-amber-800 ml-1.5 bg-amber-50 px-1.5 py-0.5 rounded">
                                                        {customerSourceData.vipPct}%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 3. WhatsApp 推广 */}
                                            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-emerald-200/80 shadow-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
                                                    <div className="truncate">
                                                        <span className="text-[11px] font-black text-stone-800 block leading-tight">
                                                            💬 WhatsApp 推广 (WA Promo)
                                                        </span>
                                                        <span className="text-[9px] text-emerald-700 block leading-tight">
                                                            私域营销与专属促活
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="font-mono text-xs font-black text-emerald-950">
                                                        {customerSourceData.wa} 人
                                                    </span>
                                                    <span className="text-[9px] font-bold text-emerald-800 ml-1.5 bg-emerald-50 px-1.5 py-0.5 rounded">
                                                        {customerSourceData.waPct}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 📈 财务数据可视化图表 (Recharts 可视化分析) */}
                            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">📊</span>
                                            <h4 className="text-xs font-black text-stone-950">
                                                财务数据可视化 (Visual Analytics)
                                            </h4>
                                        </div>
                                        <p className="text-[10px] text-stone-400 font-bold mt-0.5">
                                            营收、利润与客单价直观波动比对
                                        </p>
                                    </div>

                                    {/* 视图切换按钮：保证 Apple HIG 44px 触控，整齐排列 */}
                                    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl self-start sm:self-auto border border-stone-200/80">
                                        <button
                                            type="button"
                                            onClick={() => setChartMode('COMPARISON')}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all min-h-[44px] sm:min-h-[36px] ${
                                                chartMode === 'COMPARISON'
                                                    ? 'bg-stone-950 text-[#FFD200] shadow-sm'
                                                    : 'text-stone-600 hover:text-stone-950 active:bg-stone-200'
                                            }`}
                                        >
                                            <BarChart2 size={13} />
                                            <span>对比柱状图</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChartMode('TREND')}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all min-h-[44px] sm:min-h-[36px] ${
                                                chartMode === 'TREND'
                                                    ? 'bg-stone-950 text-[#FFD200] shadow-sm'
                                                    : 'text-stone-600 hover:text-stone-950 active:bg-stone-200'
                                            }`}
                                        >
                                            <LineChartIcon size={13} />
                                            <span>7日走势图</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChartMode('WOW')}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all min-h-[44px] sm:min-h-[36px] ${
                                                chartMode === 'WOW'
                                                    ? 'bg-stone-950 text-[#FFD200] shadow-sm'
                                                    : 'text-stone-600 hover:text-stone-950 active:bg-stone-200'
                                            }`}
                                        >
                                            <GitCompare size={13} />
                                            <span>周同比折线</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 图表主体展示 */}
                                <div className="w-full pt-1">
                                    {chartMode === 'COMPARISON' ? (
                                        <div>
                                            <div className="flex items-center justify-between text-[11px] text-stone-500 mb-2 px-1">
                                                <span className="font-bold">昨日 vs 前一日 vs 上周同日</span>
                                                <span className="text-[10px] text-stone-400">单位: RM (林吉特)</span>
                                            </div>
                                            <div className="h-[220px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart
                                                        data={comparisonChartData}
                                                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                        <XAxis 
                                                            dataKey="name" 
                                                            tick={{ fontSize: 11, fontWeight: 700, fill: '#374151' }}
                                                            axisLine={{ stroke: '#E5E7EB' }}
                                                            tickLine={false}
                                                        />
                                                        <YAxis 
                                                            tick={{ fontSize: 9, fill: '#9CA3AF' }} 
                                                            tickFormatter={(v) => `${v}`}
                                                            axisLine={false}
                                                            tickLine={false}
                                                        />
                                                        <Tooltip content={<ChartCustomTooltip />} />
                                                        <Legend 
                                                            verticalAlign="top" 
                                                            height={28}
                                                            wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} 
                                                        />
                                                        <Bar dataKey="营收" fill="#111111" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                        <Bar dataKey="利润" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                        <Bar dataKey="客单价" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    ) : chartMode === 'TREND' ? (
                                        <div>
                                            <div className="flex items-center justify-between text-[11px] text-stone-500 mb-2 px-1">
                                                <span className="font-bold">近 7 天每日经营波动轨迹</span>
                                                <span className="text-[10px] text-stone-400">单位: RM (林吉特)</span>
                                            </div>
                                            <div className="h-[220px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart
                                                        data={trendChartData}
                                                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                        <XAxis 
                                                            dataKey="label" 
                                                            tick={{ fontSize: 9, fontWeight: 700, fill: '#4B5563' }}
                                                            axisLine={{ stroke: '#E5E7EB' }}
                                                            tickLine={false}
                                                        />
                                                        <YAxis 
                                                            tick={{ fontSize: 9, fill: '#9CA3AF' }} 
                                                            tickFormatter={(v) => `${v}`}
                                                            axisLine={false}
                                                            tickLine={false}
                                                        />
                                                        <Tooltip content={<ChartCustomTooltip />} />
                                                        <Legend 
                                                            verticalAlign="top" 
                                                            height={28}
                                                            wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} 
                                                        />
                                                        <Line 
                                                            type="monotone" 
                                                            dataKey="营收" 
                                                            stroke="#111111" 
                                                            strokeWidth={2.5} 
                                                            dot={{ r: 3, fill: '#111111' }} 
                                                            activeDot={{ r: 5 }} 
                                                        />
                                                        <Line 
                                                            type="monotone" 
                                                            dataKey="利润" 
                                                            stroke="#10B981" 
                                                            strokeWidth={2.5} 
                                                            dot={{ r: 3, fill: '#10B981' }} 
                                                            activeDot={{ r: 5 }} 
                                                        />
                                                        <Line 
                                                            type="monotone" 
                                                            dataKey="客单价" 
                                                            stroke="#F59E0B" 
                                                            strokeWidth={2} 
                                                            strokeDasharray="4 4"
                                                            dot={{ r: 3, fill: '#F59E0B' }} 
                                                            activeDot={{ r: 4 }} 
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    ) : (
                                        /* 📊 周同比分析折线图 (本周 vs 上周同期) */
                                        <div>
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-stone-500 mb-2.5 px-1">
                                                <div>
                                                    <span className="font-bold text-stone-900">本周与上周同期走势同比 (WoW 同期对比)</span>
                                                    <span className="text-[10px] text-stone-400 block sm:inline sm:ml-2">
                                                        实线: 本周 · 虚线: 上周同期
                                                    </span>
                                                </div>

                                                {/* 指标单选开关 (满足 44px / 36px 触控标准) */}
                                                <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-xl border border-stone-200/70 self-start sm:self-auto">
                                                    <button
                                                        type="button"
                                                        onClick={() => setWowMetricFocus('ALL')}
                                                        className={`px-2.5 py-1.5 text-[10px] font-black rounded-lg transition-all min-h-[32px] ${
                                                            wowMetricFocus === 'ALL' ? 'bg-stone-950 text-[#FFD200] shadow-xs' : 'text-stone-600 hover:text-stone-900'
                                                        }`}
                                                    >
                                                        全部
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setWowMetricFocus('REVENUE')}
                                                        className={`px-2.5 py-1.5 text-[10px] font-black rounded-lg transition-all min-h-[32px] ${
                                                            wowMetricFocus === 'REVENUE' ? 'bg-stone-950 text-[#FFD200] shadow-xs' : 'text-stone-600 hover:text-stone-900'
                                                        }`}
                                                    >
                                                        营收走势
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setWowMetricFocus('PROFIT')}
                                                        className={`px-2.5 py-1.5 text-[10px] font-black rounded-lg transition-all min-h-[32px] ${
                                                            wowMetricFocus === 'PROFIT' ? 'bg-stone-950 text-[#FFD200] shadow-xs' : 'text-stone-600 hover:text-stone-900'
                                                        }`}
                                                    >
                                                        净利走势
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 7日同比关键指标统计条 (整齐排列) */}
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/80">
                                                    <div className="flex items-center justify-between text-[10px]">
                                                        <span className="text-stone-500 font-bold">7日累计营收同比</span>
                                                        {wowChartData.revGrowthPct !== null && (
                                                            <span className={`font-mono font-black ${wowChartData.revGrowthPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                                {wowChartData.revGrowthPct >= 0 ? '↑ +' : '↓ '}{wowChartData.revGrowthPct.toFixed(1)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex items-baseline justify-between">
                                                        <span className="font-mono text-xs font-black text-stone-900">
                                                            本周 RM {wowChartData.thisWeekTotalRev.toLocaleString()}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-stone-400">
                                                            上周 RM {wowChartData.lastWeekTotalRev.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/80">
                                                    <div className="flex items-center justify-between text-[10px]">
                                                        <span className="text-stone-500 font-bold">7日累计利润同比</span>
                                                        {wowChartData.profitGrowthPct !== null && (
                                                            <span className={`font-mono font-black ${wowChartData.profitGrowthPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                                {wowChartData.profitGrowthPct >= 0 ? '↑ +' : '↓ '}{wowChartData.profitGrowthPct.toFixed(1)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex items-baseline justify-between">
                                                        <span className="font-mono text-xs font-black text-emerald-800">
                                                            本周 RM {wowChartData.thisWeekTotalProfit.toLocaleString()}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-stone-400">
                                                            上周 RM {wowChartData.lastWeekTotalProfit.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 同比折线图 */}
                                            <div className="h-[220px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart
                                                        data={wowChartData.list}
                                                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                        <XAxis 
                                                            dataKey="shortDay" 
                                                            tick={{ fontSize: 10, fontWeight: 700, fill: '#374151' }}
                                                            axisLine={{ stroke: '#E5E7EB' }}
                                                            tickLine={false}
                                                        />
                                                        <YAxis 
                                                            tick={{ fontSize: 9, fill: '#9CA3AF' }} 
                                                            tickFormatter={(v) => `${v}`}
                                                            axisLine={false}
                                                            tickLine={false}
                                                        />
                                                        <Tooltip content={<WowCustomTooltip />} />
                                                        <Legend 
                                                            verticalAlign="top" 
                                                            height={28}
                                                            wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                                                        />
                                                        
                                                        {(wowMetricFocus === 'ALL' || wowMetricFocus === 'REVENUE') && (
                                                            <>
                                                                <Line 
                                                                    type="monotone" 
                                                                    dataKey="本周营收" 
                                                                    stroke="#111111" 
                                                                    strokeWidth={2.5} 
                                                                    dot={{ r: 3, fill: '#111111' }} 
                                                                    activeDot={{ r: 5 }} 
                                                                />
                                                                <Line 
                                                                    type="monotone" 
                                                                    dataKey="上周同期营收" 
                                                                    stroke="#9CA3AF" 
                                                                    strokeWidth={2} 
                                                                    strokeDasharray="4 4"
                                                                    dot={{ r: 2.5, fill: '#9CA3AF' }} 
                                                                    activeDot={{ r: 4 }} 
                                                                />
                                                            </>
                                                        )}

                                                        {(wowMetricFocus === 'ALL' || wowMetricFocus === 'PROFIT') && (
                                                            <>
                                                                <Line 
                                                                    type="monotone" 
                                                                    dataKey="本周利润" 
                                                                    stroke="#10B981" 
                                                                    strokeWidth={2.5} 
                                                                    dot={{ r: 3, fill: '#10B981' }} 
                                                                    activeDot={{ r: 5 }} 
                                                                />
                                                                <Line 
                                                                    type="monotone" 
                                                                    dataKey="上周同期利润" 
                                                                    stroke="#6EE7B7" 
                                                                    strokeWidth={2} 
                                                                    strokeDasharray="4 4"
                                                                    dot={{ r: 2.5, fill: '#6EE7B7' }} 
                                                                    activeDot={{ r: 4 }} 
                                                                />
                                                            </>
                                                        )}
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 渠道营收分布 */}
                            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <Store size={16} className="text-stone-800" />
                                        <h4 className="text-xs font-black text-stone-950">
                                            渠道营收细分 (Payment & Platforms)
                                        </h4>
                                    </div>
                                    <span className="text-[10px] text-stone-400 font-bold">
                                        堂食与外卖构成
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div className="bg-stone-50 rounded-xl p-2.5">
                                        <p className="text-[9px] font-bold text-stone-400">现金 Cash</p>
                                        <p className="font-mono text-xs font-black text-stone-900 mt-0.5">
                                            RM {fmt(metrics.paymentMethods.cash)}
                                        </p>
                                    </div>
                                    <div className="bg-stone-50 rounded-xl p-2.5">
                                        <p className="text-[9px] font-bold text-stone-400">TNG eWallet</p>
                                        <p className="font-mono text-xs font-black text-stone-900 mt-0.5">
                                            RM {fmt(metrics.paymentMethods.tng)}
                                        </p>
                                    </div>
                                    <div className="bg-stone-50 rounded-xl p-2.5">
                                        <p className="text-[9px] font-bold text-stone-400">DuitNow / QR</p>
                                        <p className="font-mono text-xs font-black text-stone-900 mt-0.5">
                                            RM {fmt(metrics.paymentMethods.duitnow)}
                                        </p>
                                    </div>
                                    <div className="bg-stone-50 rounded-xl p-2.5">
                                        <p className="text-[9px] font-bold text-stone-400">银行卡 Card</p>
                                        <p className="font-mono text-xs font-black text-stone-900 mt-0.5">
                                            RM {fmt(metrics.paymentMethods.card + metrics.paymentMethods.amex)}
                                        </p>
                                    </div>
                                </div>

                                {/* 外卖平台 */}
                                <div className="grid grid-cols-3 gap-2 pt-1">
                                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5">
                                        <p className="text-[9px] font-black text-emerald-800">GrabFood</p>
                                        <p className="font-mono text-xs font-black text-emerald-950 mt-0.5">
                                            RM {fmt(metrics.deliveryBreakdown.grab)}
                                        </p>
                                        {metrics.deliveryBreakdown.grabAds > 0 && (
                                            <p className="text-[9px] text-rose-600 font-bold mt-0.5">
                                                -广告 RM {fmt(metrics.deliveryBreakdown.grabAds)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="bg-pink-50/70 border border-pink-100 rounded-xl p-2.5">
                                        <p className="text-[9px] font-black text-pink-800">FoodPanda</p>
                                        <p className="font-mono text-xs font-black text-pink-950 mt-0.5">
                                            RM {fmt(metrics.deliveryBreakdown.panda)}
                                        </p>
                                        {metrics.deliveryBreakdown.pandaAds > 0 && (
                                            <p className="text-[9px] text-rose-600 font-bold mt-0.5">
                                                -广告 RM {fmt(metrics.deliveryBreakdown.pandaAds)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="bg-orange-50/70 border border-orange-100 rounded-xl p-2.5">
                                        <p className="text-[9px] font-black text-orange-800">ShopeeFood</p>
                                        <p className="font-mono text-xs font-black text-orange-950 mt-0.5">
                                            RM {fmt(metrics.deliveryBreakdown.shopee)}
                                        </p>
                                        {metrics.deliveryBreakdown.shopeeAds > 0 && (
                                            <p className="text-[9px] text-rose-600 font-bold mt-0.5">
                                                -广告 RM {fmt(metrics.deliveryBreakdown.shopeeAds)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 成本与收银交班 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* 支出与平台费用 */}
                                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                                        <h4 className="text-xs font-black text-stone-900">
                                            支出明细 (Daily Expenses)
                                        </h4>
                                        <span className="text-[10px] text-stone-400 font-bold">
                                            共 RM {fmt(metrics.directCashExpenses + metrics.standaloneExpensesTotal)}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between py-1 border-b border-stone-50">
                                            <span className="text-stone-500 font-medium">钱箱直接现金支出:</span>
                                            <span className="font-mono font-bold text-stone-900">
                                                RM {fmt(metrics.directCashExpenses)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-stone-50">
                                            <span className="text-stone-500 font-medium">独立账单/发票入账:</span>
                                            <span className="font-mono font-bold text-stone-900">
                                                RM {fmt(metrics.standaloneExpensesTotal)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-1">
                                            <span className="text-stone-500 font-medium">平台推广与广告扣款:</span>
                                            <span className="font-mono font-bold text-stone-900">
                                                RM {fmt(metrics.platformDeductions)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 收银对账差异 */}
                                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                                        <h4 className="text-xs font-black text-stone-900">
                                            收银盘点与交班 (Audit & Shift)
                                        </h4>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                            Math.abs(metrics.variance) < 5 
                                                ? 'bg-emerald-50 text-emerald-700' 
                                                : 'bg-rose-50 text-rose-700'
                                        }`}>
                                            {Math.abs(metrics.variance) < 5 ? '平账正常' : '存在差异'}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between py-1 border-b border-stone-50">
                                            <span className="text-stone-500 font-medium">盘点差异 (Variance):</span>
                                            <span className={`font-mono font-black ${
                                                metrics.variance === 0 
                                                    ? 'text-emerald-700' 
                                                    : metrics.variance > 0 
                                                        ? 'text-blue-700' 
                                                        : 'text-rose-700'
                                            }`}>
                                                {metrics.variance > 0 ? '+' : ''}RM {fmt(metrics.variance)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-stone-50">
                                            <span className="text-stone-500 font-medium">打烊结账提交人:</span>
                                            <span className="font-bold text-stone-800">
                                                {currentSettlement.submittedBy || '店长 / 收银员'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-1">
                                            <span className="text-stone-500 font-medium">营业日状态:</span>
                                            <span className="font-bold text-emerald-700 flex items-center gap-1">
                                                <Check size={13} /> 已完成日结封账
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* 底部功能条：符合 Apple HIG 规范，保证 44px 触控，处理 iOS 底部横条 */}
                <div className="bg-white border-t border-stone-200 px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-2 safe-area-bottom pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                    <div className="flex items-center gap-2">
                        {onNavigateToSettlement && metrics.isSettled && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onNavigateToSettlement(selectedDate);
                                }}
                                className="px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-800 text-xs font-black active:scale-95 active:bg-stone-100 transition-all min-h-[44px] flex items-center gap-1.5"
                            >
                                <Receipt size={15} /> 查看结算单据
                            </button>
                        )}
                        {onNavigateToReports && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onNavigateToReports();
                                }}
                                className="px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-800 text-xs font-black active:scale-95 active:bg-stone-100 transition-all min-h-[44px] flex items-center gap-1.5"
                            >
                                <ArrowUpRight size={15} /> 完整财务报表
                            </button>
                        )}
                    </div>

                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-stone-900 text-[#FFD200] font-black rounded-xl text-xs active:scale-95 transition-all min-h-[44px] shadow-sm ml-auto"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};
