import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Calendar, ArrowRight, PieChart, TrendingUp, TrendingDown, Download, Loader2, ListChecks, Info, Users, HelpCircle, Receipt, Briefcase, Wallet, Truck, BarChart3, ChevronRight, AlertCircle, Percent, LayoutList, ChevronLeft, Table2, ExternalLink, ChevronDown, ChevronUp, Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { SettlementRecord, ExpenseItem, BillPaymentRecord, FundTransfer, TreasuryConfig, PayrollRecord, Employee, MARKETING_SUBCAT_LABELS, MARKETING_SUBCAT_EMOJIS, AD_CHANNEL_LABELS, AD_CHANNEL_EMOJIS, BeverageSubCategory, BEVERAGE_SUBCAT_LABELS, BEVERAGE_SUBCAT_EMOJIS, SeafoodSubCategory, SEAFOOD_SUBCAT_LABELS, SEAFOOD_SUBCAT_EMOJIS } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from '../../firebaseConfig';

interface FinancialReportProps {
    onClose: () => void;
}

interface AuditLogItem {
    id: string;
    date: string;
    time: string;
    type: 'IN' | 'OUT' | 'TRANSFER';
    category: string;
    description: string;
    amount: number;
    account: string;
    balance: number; 
}

interface DetailedExpenseItem {
    id: string;
    date: string;
    category: string;
    desc: string;
    amount: number;
    source: string; 
    type: string;
    documentLink?: string;
    // 👑 Phase 2.5: 营销细分透传 (用于钻取弹窗精准过滤)
    marketingSubCategory?: string;
    adChannel?: string;
    // 👑 Seafood & Beverage subcategories
    seafoodSubCategory?: string;
    beverageSubCategory?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    'INGREDIENT_HQ': '食材-总店 (HQ)', 'INGREDIENT_MEAT': '食材-肉类 (Meat)', 'INGREDIENT_SEAFOOD': '食材-海鲜 (Seafood)', 'INGREDIENT_VEG': '食材-蔬果 (Veg)',
    'INGREDIENT_DRY': '食材-干货 (Dry)', 'INGREDIENT_SAUCE': '食材-酱料 (Sauce)', 'INGREDIENT_NOODLE': '食材-面条 (Noodle)', 'INGREDIENT_OIL': '食材-油类 (Oil)', 
    'INGREDIENT_EGG': '食材-蛋类 (Eggs)', 'INGREDIENT_FROZEN': '食材-冷冻品 (Frozen)', 'BEVERAGE': '水吧 (Beverage)', 'INGREDIENT_ICE': '食材-冰块 (Ice)', 'PACKAGING': '包装材料 (Packaging)', 
    'GAS_COGS': '烹饪煤气 (Gas)', 'CHARCOAL': '火炭 (Charcoal)', /* 👈 新增：火炭标签 */ 'SUPPLIER': '一般进货 (General)', 'SUPPLIER_HQ': '总店进货 (HQ)', 'SALARY': '薪资支出 (Salary)',
    'RENT': '租金 (Rent)', 'UTILITIES': '水电杂费 (Utilities)', 'UTILITIES_ELECTRIC': '电费 (Electricity)', 'UTILITIES_WATER': '水费 (Water)', 
    'UTILITIES_GAS': '管道煤气 (Piped Gas)', 'INTERNET': '网络/电话 (Internet)', 'SALES': '营业收入 (Sales)', 'TRANSFER': '资金转账 (Transfer)', 
    'BILL': '固定账单 (Bill)', 'EXPENSE': '杂项支出 (Expense)', 'ADJUSTMENT': '现金调整 (Adjustment)', 'FUND': '资金注入/提取 (Fund)',
    'STAFF_ADVANCE': '员工预支 (Advance)', 'STAFF_MEAL': '员工餐 (Staff Meal)', 'STAFF_ACCOMMODATION': '员工住宿 (Housing)',
    'PAYROLL': '月度薪资 (Payroll)', 'EPF': '公积金 (EPF)', 'SOCSO': '社险 (SOCSO)', 'RENOVATION': '装修 (Renovation)', 
    'EQUIPMENT': '设备 (Equipment)', 'KITCHEN_EQUIPMENT': '厨房设备 (Kitchen)', 'FURNITURE': '家具/桌椅 (Furniture)', 'IT_SYSTEM': '电脑/系统 (IT/POS)', 
    'SIGNAGE': '招牌/装饰 (Signage)', 'MAINTENANCE': '维修/保养/清洁 (Maintenance)', 'PEST_CONTROL': '虫害防治 (Pest)', 'CLEANING': '清洁服务 (Cleaning)',
    'WASTE': '垃圾处理 (Waste)', 'MARKETING': '营销 (Marketing)', 'ADVERTISING': '广告与推广 (Advertising & Promotion)', 'IT_SOFTWARE': '软件与信息技术 (IT & Software)', 'PROFESSIONAL': '专业服务 (Professional)', 'ACCOUNTING': '会计服务 (Accounting)', 
    'INSURANCE': '保险 (Insurance)', 'LICENSE': '执照 (License)', 'LOGISTICS': '物流 (Logistics)', 'DELIVERY_GRAB': '外卖及接送费 (Delivery/Grab/Ride)', 'TRANSPORT': '交通/油费 (Transport)', 
    'PRINTING': '印刷品 (Printing)', 'MISC_OPEX': '其他杂费 (Misc)', 'MBB_COMM': '银行手续费 (Maybank)', 'BANK_FEE': '银行刷卡手续费 (Card MDR)', 
    'DIVIDEND': '股东分红 (Dividend)', 'DEPOSIT': '押金 (Deposit)',
    'PLATFORM_FEE': '平台手续费 (Platform Fee)', 'PLATFORM_FEE_GRAB': 'Grab 抽佣/广告', 'PLATFORM_FEE_PANDA': 'FoodPanda 调节费', 
    'PLATFORM_FEE_SHOPEE': 'ShopeeFood 调节费', 'PLATFORM_FEE_OTHER': '其他平台手续费', 'MARKETING_FEE': '外卖平台扣款/广告',
    
    // 👇 兼容历史数据的遗留 Key (非常重要，切勿删除，否则旧账单在报表里会变英文)
    'ELECTRICITY': '电费 (Electricity)', 
    'WATER': '水费 (Water)',
    'CLEANING_SUPPLY': '清洁药水 (Cleaning Supply)',
    'SUPPLIES': '消耗杂品 (Supplies)',
    'GENERAL': '一般进货 (General)',
};

// 👑 核心分类重构
const categorizeExpense = (category: string) => {
    const c = category?.toUpperCase() || 'OTHER';
    
    // 🚨 修复：拦截资金转移、备用金调整。绝不允许算作 OPEX 烧掉纯利！
    if (['TRANSFER', 'FUND', 'ADJUSTMENT', 'SALES'].some(k => c.includes(k))) return 'IGNORE'; 
    
    if (c.includes('DIVIDEND')) return 'DIVIDEND'; 
    if (c.includes('DEPOSIT')) return 'ASSET'; 
    
    // 👇 修改：在数组中加入了 'CHARCOAL'，确保火炭被正确归类为随销量浮动的成本 (COGS)
    if (['INGREDIENT', 'MEAT', 'SEAFOOD', 'VEG', 'DRY', 'SAUCE', 'NOODLE', 'OIL', 'EGG', 'FROZEN', 'BEVERAGE', 'PACKAGING', 'GAS_COGS', 'CHARCOAL', 'SUPPLIER', 'HQ'].some(k => c.includes(k))) return 'COGS';
    
    if (['SALARY', 'EPF', 'SOCSO', 'ADVANCE', 'COMMISSION', 'STAFF_ADVANCE', 'ALLOWANCE', 'PAYROLL', 'STAFF_MEAL', 'STAFF_ACCOMMODATION'].some(k => c.includes(k))) return 'LABOR';
    if (['EQUIPMENT', 'KITCHEN_EQUIPMENT', 'FURNITURE', 'RENOVATION', 'IT_SYSTEM', 'SIGNAGE'].some(k => c === k)) return 'CAPEX';
    if (['PLATFORM_FEE', 'MARKETING_FEE'].some(k => c.includes(k))) return 'DELIVERY_COST'; 
    return 'OPEX'; 
};

// 大马 2026 公共假期表 (含主要联邦与雪隆假期，防范污染平时均值)
const MY_HOLIDAYS_2026 = [
    '2026-01-01', // New Year's Day (元旦)
    '2026-01-28', // Thaipusam (大宝森节 - 雪隆)
    '2026-02-17', '2026-02-18', // Chinese New Year (农历新年 初一、初二)
    '2026-03-20', // Hari Raya Aidilfitri (开斋节)
    '2026-03-21', // Hari Raya Aidilfitri Holiday (开斋节次日)
    '2026-05-01', // Labour Day (劳动节)
    '2026-05-27', // Hari Raya Haji (哈芝节)
    '2026-05-31', // Wesak Day (卫塞节)
    '2026-06-06', // Agong's Birthday (国家元首诞辰)
    '2026-06-16', // Awal Muharram (回历新年)
    '2026-08-31', // Merdeka Day (国庆日)
    '2026-09-16', // Malaysia Day (马来西亚日)
    '2026-08-25', // Prophet Muhammad's Birthday (穆罕默德诞辰)
    '2026-11-08', // Deepavali (屠妖节)
    '2026-12-11', // Sultan of Selangor's Birthday (雪州苏丹诞辰 - 你的地点在 Sungai Buloh)
    '2026-12-25', // Christmas (圣诞节)
];

interface CostGroup {
    id: string;
    label: string;
    amount: number;
    type: string;
    isPending?: boolean;
    prevAmount?: number;
    pct?: number;
    delta?: number;
    deltaPct?: number;
}

export const FinancialReport: React.FC<FinancialReportProps> = ({ onClose }) => {
    const [settlementRecords, setSettlementRecords] = useState<SettlementRecord[]>([]);
    const [standaloneExpenses, setStandaloneExpenses] = useState<ExpenseItem[]>([]);
    const [billPayments, setBillPayments] = useState<BillPaymentRecord[]>([]);
    const [transfers, setTransfers] = useState<FundTransfer[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [treasuryConfig, setTreasuryConfig] = useState<TreasuryConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    
    const printRef = useRef<HTMLDivElement>(null);
    const printCostRef = useRef<HTMLDivElement>(null);

    const getMonthStartStr = () => {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`; 
    };
    const getTodayStr = () => {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    
    const [startDate, setStartDate] = useState(getMonthStartStr()); 
    const [endDate, setEndDate] = useState(getTodayStr());
    
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SALES' | 'COST' | 'AUDIT' | 'DIVIDEND'>('OVERVIEW');
    const [accountingMode, setAccountingMode] = useState<'ACCRUAL' | 'CASH'>('ACCRUAL');
    
    // 👑 阶段二：4 张主题卡折叠状态
    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
        PNL: true,
        COST: true,
        SALES: true,
        DELIVERY: true,
        UTILS: true
    });
    const toggleCard = (key: string) => {
        setExpandedCards(prev => ({ ...prev, [key]: !prev[key] }));
    };
    const [retentionRate, setRetentionRate] = useState(20); 
    const [detailView, setDetailView] = useState<{ title: string, type: string, items: DetailedExpenseItem[] } | null>(null);
    const [showQuickDates, setShowQuickDates] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    // 👑 Phase 2: 营销钻取展开状态 (一级总营销 + AD_OUTPUT 二级渠道)
    const [marketingExpanded, setMarketingExpanded] = useState(false);
    const [adOutputExpanded, setAdOutputExpanded] = useState(false);
    const [seafoodExpanded, setSeafoodExpanded] = useState(false);
    const [beverageExpanded, setBeverageExpanded] = useState(false);
    const [diagnosisExpanded, setDiagnosisExpanded] = useState(true);

    // 👑 损益全链路级级递减流/瀑布图及模拟沙盒状态 (Waterfall & Simulator Sandbox)
    const [waterfallMode, setWaterfallMode] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');

    const [auditSearch, setAuditSearch] = useState('');
    const [auditFilter, setAuditFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

    // 👑 智能期中薪资测算器状态
    const [calcSelectedEmp, setCalcSelectedEmp] = useState('CUSTOM');
    const [calcBasicSalary, setCalcBasicSalary] = useState(1700);
    const [calcDaysInMonth, setCalcDaysInMonth] = useState(30);
    const [calcWorkedDays, setCalcWorkedDays] = useState(22);
    const [calcAdvance, setCalcAdvance] = useState(0);

    const handleSelectEmpForCalc = (empId: string) => {
        setCalcSelectedEmp(empId);
        if (empId === 'CUSTOM') {
            setCalcBasicSalary(1700);
            setCalcAdvance(0);
            return;
        }
        const emp = (employees || []).find(e => e.id === empId);
        if (emp) {
            setCalcBasicSalary(Number(emp.basicSalary) || 0);
            
            // 查找当月已发预支数据
            let adv = 0;
            const currentMonthPrefix = startDate ? startDate.slice(0, 7) : '';
            const draftRecord = (payrollRecords || []).find(p => p?.id === currentMonthPrefix);
            if (draftRecord) {
                const det = (draftRecord.details || []).find((d: any) => d.employeeId === empId) as any;
                adv = Number(det?.advance || 0);
            }
            setCalcAdvance(adv);
        }
    };

    // 👑 对比月份选择
    const [compareMonth, setCompareMonth] = useState<string>(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // 👑 自动同步对比月份，防范用户往前切换月份时，对比月份依旧停留在未来，导致 Firestore 查询区间非法（下限 > 上限）而拉不出历史数据的 bug
    useEffect(() => {
        if (startDate) {
            const currentStart = new Date(startDate);
            const prevMonthDate = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
            const y = prevMonthDate.getFullYear();
            const m = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
            const targetCompareMonth = `${y}-${m}`;
            
            const currentMonthStr = startDate.slice(0, 7);
            if (compareMonth >= currentMonthStr) {
                setCompareMonth(targetCompareMonth);
            }
        }
    }, [startDate, compareMonth]);

    // 👑 自动读取当前登录员工的实际薪资，并初始化测算器以实现“从实际情况出发”的真实测算
    useEffect(() => {
        if (employees && employees.length > 0) {
            const savedEmployeeStr = localStorage.getItem('kepong_erp_session_employee');
            if (savedEmployeeStr) {
                try {
                    const parsed = JSON.parse(savedEmployeeStr);
                    if (parsed && parsed.id) {
                        const matched = employees.find(e => e.id === parsed.id);
                        if (matched) {
                            setCalcSelectedEmp(matched.id);
                            setCalcBasicSalary(Number(matched.basicSalary) || 1700);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse saved employee session in financial report", e);
                }
            }
        }
    }, [employees]);
    const [costCompareTab, setCostCompareTab] = useState<'ANOMALY' | 'STRUCTURE' | 'SHIFT'>('ANOMALY');
    const [expandedAnomalies, setExpandedAnomalies] = useState<Record<string, boolean>>({});
    const [salesCompareTab, setSalesCompareTab] = useState<'CHANNEL' | 'EFFICIENCY' | 'WEEKLY' | 'TARGET'>('CHANNEL');
    const [customSalesTarget, setCustomSalesTarget] = useState<string>('');
    const getCompareOptions = () => {
        const base = new Date(startDate);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return [
            { key: fmt(new Date(base.getFullYear(), base.getMonth() - 1, 1)), label: '上月' },
            { key: fmt(new Date(base.getFullYear(), base.getMonth() - 2, 1)), label: '前月' },
            { key: fmt(new Date(base.getFullYear() - 1, base.getMonth(), 1)), label: '去年同月' },
        ];
    };

    const handleMonthChange = (delta: number) => {
        const currentStart = new Date(startDate);
        currentStart.setMonth(currentStart.getMonth() + delta);
        const y = currentStart.getFullYear();
        const m = String(currentStart.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, currentStart.getMonth() + 1, 0).getDate();
        setStartDate(`${y}-${m}-01`);
        setEndDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    };

    const prevStartDate = useMemo(() => {
        if (!compareMonth) {
            const d = new Date(startDate);
            const prevMonth = d.getMonth() - 1;
            const prevYear = d.getFullYear();
            const safe = new Date(prevYear, prevMonth + 1, 0);
            const day = Math.min(d.getDate(), safe.getDate());
            return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return `${compareMonth}-01`;
    }, [startDate, compareMonth]);

    const prevEndDate = useMemo(() => {
        if (!compareMonth) {
            const d = new Date(endDate);
            // 👑 防溢出：先把日期设为1号再减月，最后用 min 夹住天数
            const prevMonth = d.getMonth() - 1;
            const prevYear = d.getFullYear();
            const safe = new Date(prevYear, prevMonth + 1, 0); // 上月最后一天
            const day = Math.min(d.getDate(), safe.getDate());
            return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        
        // 计算当前周期天数
        const dCurrentStart = new Date(startDate);
        const dCurrentEnd = new Date(endDate);
        const diffMs = dCurrentEnd.getTime() - dCurrentStart.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // 经过天数
        
        const [pYear, pMonth] = compareMonth.split('-').map(Number);
        const daysInPrevMonth = new Date(pYear, pMonth, 0).getDate();
        const targetDay = Math.min(diffDays, daysInPrevMonth); // 夹住天数，避免越界
        
        return `${pYear}-${String(pMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    }, [startDate, endDate, compareMonth]);
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const endOfDay = `${endDate}T23:59:59`;
                const fetchStart = prevStartDate;

                const [config, payrolls, emps, setSnap, billsSnap, fundsSnap, expSnap1, expSnap2] = await Promise.all([
                    DataManager.getTreasuryConfig(),
                    DataManager.getPayrollRecords(),
                    DataManager.getEmployees(),
                    getDocs(query(collection(db, 'settlements'), where("date", ">=", fetchStart), where("date", "<=", endOfDay))),
                    getDocs(query(collection(db, 'bill_payments'), where("date", ">=", fetchStart), where("date", "<=", endOfDay))),
                    getDocs(query(collection(db, 'fund_transfers'), where("date", ">=", fetchStart), where("date", "<=", endOfDay))),
                    getDocs(query(collection(db, 'standalone_expenses'), where("time", ">=", fetchStart), where("time", "<=", endOfDay))),
                    getDocs(query(collection(db, 'standalone_expenses'), where("paymentDate", ">=", fetchStart), where("paymentDate", "<=", endOfDay)))
                ]);

                const expMap = new Map();
                expSnap1.docs.forEach(d => expMap.set(d.id, { id: d.id, ...d.data() }));
                expSnap2.docs.forEach(d => expMap.set(d.id, { id: d.id, ...d.data() }));
                const mergedExpenses = Array.from(expMap.values()) as ExpenseItem[];

                setSettlementRecords(setSnap.docs.map(d => ({ id: d.id, ...d.data() } as SettlementRecord)));
                setStandaloneExpenses(mergedExpenses);
                setBillPayments(billsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BillPaymentRecord)));
                setTransfers(fundsSnap.docs.map(d => ({ id: d.id, ...d.data() } as FundTransfer)));
                setTreasuryConfig(config);
                setPayrollRecords(payrolls);
                setEmployees(emps);
            } catch (error) {
                console.error("Failed to load financial data", error);
                alert("⚠️ 财务数据拉取异常，请检查网络或联系管理员。");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [startDate, endDate, prevStartDate, prevEndDate]);

    const setQuickDate = (type: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'LAST_MONTH') => {
        const now = new Date();
        let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (type === 'TODAY') {
        } else if (type === 'YESTERDAY') {
            start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1);
        } else if (type === 'WEEK') {
            const day = start.getDay() || 7;
            const monday = new Date(start); monday.setDate(start.getDate() - day + 1);
            const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
            start = monday; end = sunday;
        } else if (type === 'MONTH') {
            start.setDate(1); 
        } else if (type === 'LAST_MONTH') {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        }

        const formatLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setStartDate(formatLocal(start)); setEndDate(formatLocal(end));
    };

    const formatMoney = (amount: number) => `RM ${Number(amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const calculateGrowth = (current: number, prev: number) => {
        if (prev === 0) return current > 0 ? 100 : 0;
        return ((current - prev) / prev) * 100;
    };

    // 👑 核心引擎
    const analytics = useMemo(() => {
        const isCurrentRange = (dateStr: string) => {
            if (!dateStr) return false;
            const d = dateStr.split('T')[0];
            return d >= startDate && d <= endDate;
        };
        const isPrevRange = (dateStr: string) => {
            if (!dateStr) return false;
            const d = dateStr.split('T')[0];
            return d >= prevStartDate && d <= prevEndDate;
        };

        const rev = { cash: 0, tng: 0, debitCard: 0, creditCard: 0, amex: 0, card: 0, deliveryGross: 0, inStoreSales: 0, totalGrossRevenue: 0, variance: 0, refunds: 0 };
        const bdown = { grabGross: 0, grabNet: 0, grabAds: 0, pandaGross: 0, pandaNet: 0, pandaAds: 0, shopeeGross: 0, shopeeNet: 0, shopeeAds: 0, lalamove: 0 };
        let totalCOGS = 0, totalLabor = 0, totalOPEX = 0, totalDeposits = 0, totalCapex = 0, totalDividends = 0;
        let totalPandaFees = 0, totalShopeeFees = 0, totalOtherPlatformFees = 0;
        let totalGrabCommission = 0; // 🚨 新增：按天独立累计抽佣池
        let totalShopeeCommission = 0; // 🚨 新增：Shopee 按天独立累计抽佣池
        let totalPandaCommission = 0; // 🚨 新增：FoodPanda 按天独立累计抽佣池
        const groups: Record<string, CostGroup> = {};
        const prevGroups: Record<string, CostGroup> = {}; // 👑 上期品类级别追踪

        const prev = { totalGrossRevenue: 0, cogs: 0, labor: 0, opex: 0, deliveryDirectCost: 0 };

        const dailySalesMap: Record<string, number> = {};
        const dailyDeliveryMap: Record<string, number> = {};
        let weekendSales = 0, weekendDays = 0;
        let weekdaySales = 0, weekdayDays = 0;
        let holidaySales = 0, holidayDays = 0;

        const addCost = (amount: number, category: string, label: string | undefined, isPending: boolean, isPrev: boolean) => {
            if (!amount && !isPending) return; 
            let catKey = category ? category.toUpperCase() : 'OTHER';
            
            // 👑 1. 历史数据清洗器：强行把老账单的旧 Key 归宗到新体系
            if (catKey === 'ELECTRICITY') catKey = 'UTILITIES_ELECTRIC';
            if (catKey === 'WATER') catKey = 'UTILITIES_WATER';

            const type = categorizeExpense(catKey);
            
            // 🚨 修复：在总账口径彻底屏蔽非经营流水，禁止污染报表
            if (type === 'IGNORE') return; 

            if (isPrev) {
                if (type === 'COGS') prev.cogs += amount;
                else if (type === 'LABOR') prev.labor += amount;
                else if (type === 'OPEX') prev.opex += amount;
                else if (type === 'DELIVERY_COST') prev.deliveryDirectCost += amount;
                // 👑 品类级追踪
                const finalLabelPrev = CATEGORY_LABELS[catKey] || catKey;
                if (!prevGroups[catKey]) prevGroups[catKey] = { id: catKey, label: finalLabelPrev, amount: 0, type };
                prevGroups[catKey].amount += amount;
                return;
            }

            if (type === 'ASSET') totalDeposits += amount;
            else if (type === 'CAPEX') totalCapex += amount;
            else if (type === 'DIVIDEND') totalDividends += amount;
            else if (!isPending) {
                if (type === 'COGS') totalCOGS += amount;
                else if (type === 'LABOR') totalLabor += amount;
                else if (type === 'DELIVERY_COST') {
                    const lowerLabel = (label || '').toUpperCase();
                    if (catKey.includes('PANDA') || lowerLabel.includes('PANDA')) {
                        totalPandaFees += amount;
                    } else if (catKey.includes('SHOPEE') || lowerLabel.includes('SHOPEE')) {
                        totalShopeeFees += amount;
                    } else {
                        totalOtherPlatformFees += amount;
                    }
                } 
                else totalOPEX += amount; 
            }

            const finalLabel = CATEGORY_LABELS[catKey] || catKey;
            if (!groups[catKey]) groups[catKey] = { id: catKey, label: finalLabel, amount: 0, type, isPending };
            groups[catKey].amount += amount;
        };

        settlementRecords.forEach(s => {
            const dStr = s.date.split('T')[0];
            const isCurr = isCurrentRange(dStr);
            const isPrv = isPrevRange(dStr);
            if (!isCurr && !isPrv) return;

            const cashAmt = Number(s.sales?.cash||0);
            const tngAmt = Number(s.sales?.tng||0);
            const duitnowAmt = Number(s.sales?.duitnow||0);
            const cardAmt = Number(s.sales?.card||0);
            const amexAmt = Number(s.sales?.amex||0);
            const refundAmt = Number(s.sales?.refundTotal || 0);
            const varianceAmt = Number(s.variance || 0);

            const posSales = cashAmt + tngAmt + duitnowAmt + cardAmt + amexAmt;
            const netStoreSales = posSales - refundAmt;

            const b: Record<string, any> = s.sales?.deliveryBreakdown || {};
            const gGross = Number(b.grabGross) || 0;
            const pGross = Number(b.pandaGross) || Number(b.panda) || 0;
            const shGross = Number(b.shopeeGross) || Number(b.shopee) || 0;
            const lala = Number(b.lalamove) || 0;
            const dailyDeliveryGross = gGross + pGross + shGross + lala;
            const dailyTotalGross = netStoreSales + dailyDeliveryGross;
            
            const rs = (s as any).reconStatus || {};
            const gNet = (rs.grab !== undefined && typeof rs.grab === 'number') 
                ? Number(rs.grab) 
                : (Number(b.grabNet) || Number(b.grab) || 0);
            const gAds = Number(b.grabAds) || 0;
            
            // 🚨 修复：仅当 gNet 有值(已对账)时才计算差额，防范未对账导致 100% 误判抽佣
            const dailyGrabComm = (gNet > 0 && gGross > gNet) ? (gGross - gNet) : 0;

            const shNet = (rs.shopee !== undefined && typeof rs.shopee === 'number') 
                ? Number(rs.shopee) 
                : (b.shopeeNet !== undefined ? Number(b.shopeeNet) : (Number(b.shopee) || 0));
            const shAds = Number(b.shopeeAds) || 0;
            const dailyShopeeComm = (shNet > 0 && shGross > shNet) ? (shGross - shNet) : 0;

            const pNet = (rs.panda !== undefined && typeof rs.panda === 'number') 
                ? Number(rs.panda) 
                : (b.pandaNet !== undefined ? Number(b.pandaNet) : (Number(b.panda) || 0));
            const pAds = Number(b.pandaAds) || 0;
            const dailyPandaComm = (pNet > 0 && pGross > pNet) ? (pGross - pNet) : 0;

            if (isPrv) {
                prev.totalGrossRevenue += dailyTotalGross;
                prev.deliveryDirectCost += (dailyGrabComm + gAds + dailyShopeeComm + shAds + dailyPandaComm + pAds);
                s.expenses?.forEach(e => addCost(Number(e.amount||0), e.category, e.company || e.note, false, true));
                return;
            }

            rev.cash += cashAmt;
            rev.tng += tngAmt;
            rev.debitCard += duitnowAmt;
            rev.creditCard += cardAmt;
            rev.amex += amexAmt;
            rev.card += (duitnowAmt + cardAmt + amexAmt);
            rev.refunds += refundAmt;
            rev.variance += varianceAmt;
            rev.inStoreSales += netStoreSales;
            rev.deliveryGross += dailyDeliveryGross;
            rev.totalGrossRevenue += dailyTotalGross;

            bdown.grabGross += gGross;
            bdown.grabNet += gNet;
            bdown.grabAds += gAds;
            bdown.pandaGross += pGross;
            bdown.pandaNet += pNet;
            bdown.pandaAds += pAds;
            bdown.shopeeGross += shGross;
            bdown.shopeeNet += shNet;
            bdown.shopeeAds += shAds;
            bdown.lalamove += lala;
            
            totalGrabCommission += dailyGrabComm; // 🚨 将单日核算后的抽佣放入安全池
            totalShopeeCommission += dailyShopeeComm; // 🚨 Shopee 抽佣累计
            totalPandaCommission += dailyPandaComm; // 🚨 FoodPanda 抽佣累计

            dailySalesMap[dStr] = dailyTotalGross;
            dailyDeliveryMap[dStr] = dailyDeliveryGross;
            
            const dayOfWeek = new Date(dStr + 'T00:00:00').getDay();
            if (MY_HOLIDAYS_2026.includes(dStr)) { holidaySales += dailyTotalGross; holidayDays++; }
            else if (dayOfWeek === 0 || dayOfWeek === 6) { weekendSales += dailyTotalGross; weekendDays++; } 
            else { weekdaySales += dailyTotalGross; weekdayDays++; }

            s.expenses?.forEach(e => addCost(Number(e.amount||0), e.category, e.company || e.note, false, false));
        });

        standaloneExpenses.forEach(e => {
            // 👑 2. 总账防重拦截：防止 RecurringBills 自动同步过来的账单被报表算两遍！并且跳过对账生成的手续费记账以便通过动态扣除反映
            if (e.id.startsWith('payroll_') || e.id.startsWith('salary_') || e.settlementId || e.id.startsWith('bill_sync_') || e.id.startsWith('recon_fee_')) return; 

            const dateToUse = accountingMode === 'ACCRUAL' ? e.time : (e.paymentDate || e.time);
            const isCurr = isCurrentRange(dateToUse);
            const isPrv = isPrevRange(dateToUse);
            if (!isCurr && !isPrv) return;

            if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
            const amt = Number(accountingMode === 'ACCRUAL' ? (e.totalBillAmount || e.amount) : e.amount) - Number(e.creditNote || 0);
            
            if (amt > 0) addCost(amt, e.category, e.company || e.note, false, isPrv);
        });

        billPayments.forEach(b => {
            const bAny = b as any;
            if (isCurrentRange(b.date)) addCost(Number(b.amount || 0), b.category, bAny.note || bAny.payee || bAny.companyLabel, false, false);
            else if (isPrevRange(b.date)) addCost(Number(b.amount || 0), b.category, bAny.note || bAny.payee || bAny.companyLabel, false, true);
        });

        const payrollSummary = { monthlyTotal: 0, paidAmount: 0, unpaidAmount: 0, isPosted: false };
        payrollRecords.forEach(p => {
             const effDate = `${p.month}-28`;
             const isCurr = isCurrentRange(effDate);
             const isPrv = isPrevRange(effDate);

             if (p.status === 'POSTED') {
                 const net = Number(p.totalNetPay || 0);
                 const govt = Number(p.totalGovtPay || 0);
                 if (isPrv) {
                     addCost(net, 'PAYROLL', undefined, false, true);
                     if (p.isStatutoryPaid) addCost(govt, 'EPF_SOCSO', undefined, false, true);
                 } else if (isCurr) {
                     addCost(net, 'PAYROLL', `Staff Payroll (${p.month})`, false, false);
                     payrollSummary.monthlyTotal += (net + govt);
                     payrollSummary.paidAmount += net;
                     payrollSummary.isPosted = true;
                     if (p.isStatutoryPaid) {
                         addCost(govt, 'EPF_SOCSO', `Statutory (${p.month})`, false, false);
                         payrollSummary.paidAmount += govt;
                     } else {
                         payrollSummary.unpaidAmount += govt;
                         const pKey = `STAT_PENDING_${p.month}`;
                         if (!groups[pKey]) groups[pKey] = { id: pKey, label: `Statutory (${p.month}) - Draft`, amount: govt, type: 'LABOR', isPending: true };
                     }
                 }
             }
        });

        // 👑 薪资预测数据源 (Forecast Data Source)
        let estimatedPayroll = 0;
        let forecastSource: 'POSTED' | 'DRAFT' | 'BASIC_SALARY' | 'NONE' = 'NONE';

        if (payrollSummary.isPosted) {
            forecastSource = 'POSTED';
        } else if (new Date(endDate).getDate() > 1) {
            // 优先级 1：当月已有 DRAFT payroll 记录 → 用真实编辑数据 (net + govt)
            const currentMonthPrefix = startDate.slice(0, 7);
            const draftRecord = (payrollRecords || []).find(p => p?.id === currentMonthPrefix && p?.status === 'DRAFT');
            if (draftRecord) {
                const draftTotal = Number(draftRecord.totalNetPay || 0) + Number(draftRecord.totalGovtPay || 0);
                if (draftTotal > 0) {
                    estimatedPayroll = draftTotal;
                    forecastSource = 'DRAFT';
                }
            }
            // 优先级 2：fallback 员工档案底薪总和 (注意：字段是 basicSalary, 不是 salary)
            if (estimatedPayroll === 0) {
                estimatedPayroll = employees
                    .filter(e => e.status !== 'TERMINATED' && !e.isArchived)
                    .reduce((acc, e) => acc + (Number((e as any).basicSalary) || 0), 0);
                if (estimatedPayroll > 0) forecastSource = 'BASIC_SALARY';
            }
        }

        // 🚨 修复：废弃原有的全局相减漏洞，直接调用安全累积的抽佣池
        const grabCommission = totalGrabCommission;
        const shopeeCommission = totalShopeeCommission;
        const pandaCommission = totalPandaCommission;
        const totalDeliveryDirectCost = grabCommission + bdown.grabAds + totalPandaFees + pandaCommission + bdown.pandaAds + totalShopeeFees + shopeeCommission + bdown.shopeeAds + totalOtherPlatformFees;
        const netRealizedRevenue = rev.totalGrossRevenue - totalDeliveryDirectCost;
        
        // 👑 每日人工同步与门店支出结算 (Budget and Actual Sync)
        const settledDays = Object.keys(dailySalesMap).length;
        const [yrStr, moStr] = startDate.split('-');
        const yNum = parseInt(yrStr) || 2026;
        const mNum = parseInt(moStr) || 6;
        const daysInMonth = new Date(yNum, mNum, 0).getDate() || 30;
        
        const baseMonthlyLabor = payrollSummary.isPosted 
            ? payrollSummary.monthlyTotal 
            : (estimatedPayroll > 0 
                ? estimatedPayroll 
                : (totalLabor > 0 
                    ? totalLabor 
                    : (employees.filter(e => e.status !== 'TERMINATED' && !e.isArchived).reduce((acc, e) => acc + (Number((e as any).basicSalary) || 0), 0) || 57300)));
        
        const totalLaborSynced = (baseMonthlyLabor / daysInMonth) * settledDays;

        const grossProfit = netRealizedRevenue - totalCOGS; 
        const totalStoreCosts = totalCOGS + totalLaborSynced + totalOPEX; 
        const netProfit = netRealizedRevenue - totalStoreCosts;
        const adjustedNetProfit = netProfit + rev.variance;
        const netCashFlow = adjustedNetProfit - totalCapex - totalDividends;
        const prevNetRealizedRevenue = prev.totalGrossRevenue - prev.deliveryDirectCost;
        const prevStoreCosts = prev.cogs + prev.labor + prev.opex;

        const cogsMargin = netRealizedRevenue > 0 ? (totalCOGS / netRealizedRevenue) * 100 : 0;
        const laborMargin = netRealizedRevenue > 0 ? (totalLaborSynced / netRealizedRevenue) * 100 : 0;
        const opexMargin = netRealizedRevenue > 0 ? (totalOPEX / netRealizedRevenue) * 100 : 0;
        const netMargin = netRealizedRevenue > 0 ? (netProfit / netRealizedRevenue) * 100 : 0;

        // 👑 品类级列表生成 — 注入上期对比数据
        const enrichWithPrev = (list: CostGroup[], totalCurrent: number) => {
            return list.map(g => {
                const prevAmt = prevGroups[g.id]?.amount || 0;
                const delta = g.amount - prevAmt;
                const deltaPct = prevAmt > 0 ? ((g.amount - prevAmt) / prevAmt) * 100 : (g.amount > 0 ? 100 : 0);
                return { ...g, prevAmount: prevAmt, delta, deltaPct, pct: totalCurrent > 0 ? (g.amount / totalCurrent) * 100 : 0 };
            }).sort((a, b) => b.amount - a.amount);
        };

        const cogsList = enrichWithPrev(Object.values(groups).filter(g => g.type === 'COGS'), totalCOGS);
        const laborList = enrichWithPrev(Object.values(groups).filter(g => g.type === 'LABOR'), totalLabor);
        const opexList = enrichWithPrev(Object.values(groups).filter(g => g.type === 'OPEX'), totalOPEX);
        const capexList = Object.values(groups).filter(g => g.type === 'CAPEX').sort((a, b) => b.amount - a.amount);
        const deliveryCostList = Object.values(groups).filter(g => g.type === 'DELIVERY_COST').sort((a, b) => b.amount - a.amount);

        // 👑 Top Movers — 成本涨跌最大的品类
        const allCategoryItems = [...cogsList, ...laborList, ...opexList].filter(g => g.amount > 50 || (g.prevAmount || 0) > 50);
        const topMovers = [...allCategoryItems].sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0)).slice(0, 5);

        // 👑 1. 计算对比结构百分比（百分比点变动）
        const prevCOGSPercent = prevNetRealizedRevenue > 0 ? (prev.cogs / prevNetRealizedRevenue) * 100 : 0;
        const prevLaborPercent = prevNetRealizedRevenue > 0 ? (prev.labor / prevNetRealizedRevenue) * 100 : 0;
        const prevOPEXPercent = prevNetRealizedRevenue > 0 ? (prev.opex / prevNetRealizedRevenue) * 100 : 0;

        const cogsPercentShift = cogsMargin - prevCOGSPercent;
        const laborPercentShift = laborMargin - prevLaborPercent;
        const opexPercentShift = opexMargin - prevOPEXPercent;

        // 👑 2. 自动扫描生成智能对比异常
        const costAnomalies: Array<{
            id: string;
            label: string;
            type: 'SURGE' | 'NEW' | 'DECLINE' | 'STRUCTURE';
            amount: number;
            prevAmount: number;
            delta: number;
            deltaPct: number;
            emoji: string;
            suggest: string;
        }> = [];

        // A. 结构比率偏离预警
        if (Math.abs(cogsPercentShift) > 1.5) {
            costAnomalies.push({
                id: 'STRUCTURE_COGS',
                label: '物料毛利占比 (COGS %)',
                type: 'STRUCTURE',
                amount: cogsMargin,
                prevAmount: prevCOGSPercent,
                delta: cogsPercentShift,
                deltaPct: cogsPercentShift,
                emoji: '⚠️',
                suggest: cogsPercentShift > 0 
                    ? '物料支出占比上升较多。建议检查：1. 进货单价是否有大幅波动；2. 后厨是否存在漏单、员工餐饮浪费或餐份控制偏离。'
                    : '物料占比表现下降，毛利结构改善！请核实：是由于拿到了更好的比价，还是出餐及物料损耗控制得当。'
            });
        }
        if (Math.abs(laborPercentShift) > 1.5) {
            costAnomalies.push({
                id: 'STRUCTURE_LABOR',
                label: '人工总额占比 (Labor %)',
                type: 'STRUCTURE',
                amount: laborMargin,
                prevAmount: prevLaborPercent,
                delta: laborPercentShift,
                deltaPct: laborPercentShift,
                emoji: '⚠️',
                suggest: laborPercentShift > 0
                    ? '人工费用占比飙升。建议审查：1. 闲时工时排班是否冗余；2. 考勤是否有未授权的加班 (Overtime)；3. 结合时段营业额做排班调整。'
                    : '人工占比下降，营运效率提升！请总结本期的高低峰排班优化经验，以便后续月份共享。'
            });
        }

        // B. 扫描品类层级波动
        allCategoryItems.forEach(item => {
            if (item.delta && item.delta > 150 && item.deltaPct && item.deltaPct > 10) {
                let suggest = '建议对该品类的发票与对账单逐笔审计，核对收货单和发票单价是否一致。';
                if (item.id === 'INGREDIENT_SEAFOOD') {
                    suggest = '海鲜物料支出暴增！建议：① 严控每日生鲜库存，缩短囤货周期防腐烂损耗；② 立即联系雪隆备用海鲜商建立询价比价机制。';
                } else if (item.id === 'BEVERAGE') {
                    suggest = '水吧物料消耗大涨！建议：① 抽查水吧茶包、乳制品、糖浆盘点，杜绝漏单或私用；② 规范每杯标准配料。';
                } else if (item.id.includes('UTILITIES_ELECTRIC') || item.id === 'ELECTRICITY') {
                    suggest = '电费大幅上涨！建议：① 检查冰箱、制冷机封条是否老化造成电机漏冷耗电；② 执行打烊断电机制，严防空载开冷气。';
                } else if (item.id === 'MARKETING') {
                    suggest = '推广费膨胀！建议：① 暂停低效线下物料传单印发，资源倾斜到 Grab/Panda 的定点精准引流；② 严格核实投流 ROI。';
                } else if (item.id === 'HQ') {
                    suggest = '总部采购费用增加！建议：① 确认入库和对账单是否有跨月延迟记账；② 严格审核商品直配耗用。';
                } else if (item.id === 'PAYROLL') {
                    suggest = '工资总支出上升！建议：核查当期在职员工人头变动、公假三倍薪资，并评估非必要加班工时。';
                }
                costAnomalies.push({
                    id: item.id,
                    label: item.label,
                    type: 'SURGE',
                    amount: item.amount,
                    prevAmount: item.prevAmount || 0,
                    delta: item.delta,
                    deltaPct: item.deltaPct,
                    emoji: '📈',
                    suggest
                });
            } else if (item.prevAmount === 0 && item.amount > 150) {
                costAnomalies.push({
                    id: item.id,
                    label: item.label,
                    type: 'NEW',
                    amount: item.amount,
                    prevAmount: 0,
                    delta: item.amount,
                    deltaPct: 100,
                    emoji: '🆕',
                    suggest: '本期新出现这笔支出。建议查阅对应科目的账单明细和凭证，核对是一次性店面添置 (Capex) 还是日常运营费用。'
                });
            } else if (item.delta && item.delta < -150 && item.deltaPct && item.deltaPct < -10) {
                costAnomalies.push({
                    id: item.id,
                    label: item.label,
                    type: 'DECLINE',
                    amount: item.amount,
                    prevAmount: item.prevAmount || 0,
                    delta: item.delta,
                    deltaPct: item.deltaPct,
                    emoji: '📉',
                    suggest: '该支出录得大降，开销节支成效明显！请继续保持目前的采购流程与耗用审核。'
                });
            }
        });

        // 👑 薪资预测增强
        const payrollForecast = payrollSummary.isPosted ? payrollSummary.monthlyTotal : estimatedPayroll;
        const afterPayrollNet = payrollSummary.isPosted ? netProfit : (netProfit - estimatedPayroll);
        const activeStaffCount = employees.filter(e => 
            e.status !== 'TERMINATED' && 
            !e.isArchived
        ).length;

        const dailySales = Object.entries(dailySalesMap).map(([date, sales]) => ({ date, sales, delivery: dailyDeliveryMap[date] || 0 })).sort((a, b) => a.date.localeCompare(b.date));
        const bestDay = dailySales.length > 0 ? dailySales.reduce((p, c) => (p.sales > c.sales) ? p : c) : { date: '-', sales: 0 };
        const settlementCount = dailySales.length;
        const avgDailySales = settlementCount > 0 ? rev.totalGrossRevenue / settlementCount : 0;
        
        return {
            revenueDetails: {
                cash: rev.cash, tng: rev.tng, debitCard: rev.debitCard, creditCard: rev.creditCard, amex: rev.amex,
                deliveryGross: rev.deliveryGross, inStoreSales: rev.inStoreSales, totalGrossRevenue: rev.totalGrossRevenue,
                variance: rev.variance, refunds: rev.refunds
            },
            deliveryBreakdown: bdown,
            rev, bdown, payrollSummary, estimatedPayroll, totalDividends,
            pnl: {
                totalGrossRevenue: rev.totalGrossRevenue,
                netRealizedRevenue,
                totalDeliveryDirectCost,
                grabCommission,
                grabAds: bdown.grabAds,
                pandaFees: totalPandaFees,
                pandaCommission,
                pandaAds: bdown.pandaAds,
                shopeeFees: totalShopeeFees,
                shopeeCommission,
                shopeeAds: bdown.shopeeAds,
                otherPlatformFees: totalOtherPlatformFees,
            },
            grossProfit, netProfit, adjustedNetProfit, netCashFlow, netMargin,
            margins: { cogs: cogsMargin, labor: laborMargin, opex: opexMargin },
            costs: { totalCOGS, totalLabor: totalLaborSynced, rawLabor: totalLabor, totalOPEX, totalStoreCosts, totalCapex, totalDeposits },
            lists: { cogsList, laborList, opexList, capexList, deliveryCostList },
            topMovers,
            payrollForecast: { amount: payrollForecast, isPosted: payrollSummary.isPosted, source: forecastSource, afterPayrollNet, activeStaffCount },
            dailySales, avgDailySales, settlementCount,
            insights: {
                avgWeekend: weekendDays > 0 ? weekendSales / weekendDays : 0,
                avgWeekday: weekdayDays > 0 ? weekdaySales / weekdayDays : 0,
                avgHoliday: holidayDays > 0 ? holidaySales / holidayDays : 0,
                bestDay
            },
            mom: {
                revenue: calculateGrowth(rev.totalGrossRevenue, prev.totalGrossRevenue),
                netRealized: calculateGrowth(netRealizedRevenue, prevNetRealizedRevenue),
                storeCosts: calculateGrowth(totalStoreCosts, prevStoreCosts),
                cogs: calculateGrowth(totalCOGS, prev.cogs),
                labor: calculateGrowth(totalLabor, prev.labor),
                opex: calculateGrowth(totalOPEX, prev.opex),
            },
            salesDetails: {
                dineInGross: rev.inStoreSales,
                deliveryGross: rev.deliveryGross,
                dineInPercent: rev.totalGrossRevenue > 0 ? (rev.inStoreSales / rev.totalGrossRevenue) * 100 : 0,
                deliveryPercent: rev.totalGrossRevenue > 0 ? (rev.deliveryGross / rev.totalGrossRevenue) * 100 : 0,
                
                estTngFee: rev.tng * 0.005,
                estDebitFee: rev.debitCard * 0.01,
                estCreditFee: rev.creditCard * 0.015,
                totalEstMdrFee: (rev.tng * 0.005) + (rev.debitCard * 0.01) + (rev.creditCard * 0.015),
                mdrLossPercent: rev.inStoreSales > 0 ? (((rev.tng * 0.005) + (rev.debitCard * 0.01) + (rev.creditCard * 0.015)) / rev.inStoreSales) * 100 : 0,
                
                weekendAvg: weekendDays > 0 ? weekendSales / weekendDays : 0,
                weekdayAvg: weekdayDays > 0 ? weekdaySales / weekdayDays : 0,
                holidayAvg: holidayDays > 0 ? holidaySales / holidayDays : 0,
                weekendSurgeMultiplier: weekdayDays > 0 ? (weekendDays > 0 ? weekendSales / weekendDays : 0) / (weekdaySales / weekdayDays) : 0,
                holidayBoostIndex: weekdayDays > 0 ? (holidayDays > 0 ? holidaySales / holidayDays : 0) / (weekdaySales / weekdayDays) : 0,
                
                grabGrossPct: rev.deliveryGross > 0 ? (bdown.grabGross / rev.deliveryGross) * 100 : 0,
                pandaGrossPct: rev.deliveryGross > 0 ? (bdown.pandaGross / rev.deliveryGross) * 100 : 0,
                shopeeGrossPct: rev.deliveryGross > 0 ? (bdown.shopeeGross / rev.deliveryGross) * 100 : 0,
                
                grabCommissionRate: bdown.grabGross > 0 ? (grabCommission / bdown.grabGross) * 100 : 0,
                pandaCommissionRate: bdown.pandaGross > 0 ? (pandaCommission / bdown.pandaGross) * 100 : 0,
                shopeeCommissionRate: bdown.shopeeGross > 0 ? (shopeeCommission / bdown.shopeeGross) * 100 : 0,
                
                grabAdsDensity: bdown.grabGross > 0 ? (bdown.grabAds / bdown.grabGross) * 100 : 0,
                pandaAdsDensity: bdown.pandaGross > 0 ? (bdown.pandaAds / bdown.pandaGross) * 100 : 0,
                shopeeAdsDensity: bdown.shopeeGross > 0 ? (bdown.shopeeAds / bdown.shopeeGross) * 100 : 0,
                
                grabNetRatio: bdown.grabGross > 0 ? ((bdown.grabNet - bdown.grabAds) / bdown.grabGross) * 100 : 0,
                pandaNetRatio: bdown.pandaGross > 0 ? ((bdown.pandaNet - bdown.pandaAds) / bdown.pandaGross) * 100 : 0,
                shopeeNetRatio: bdown.shopeeGross > 0 ? ((bdown.shopeeNet - bdown.shopeeAds) / bdown.shopeeGross) * 100 : 0,
            },
            comparisonDetails: {
                prevGrossRevenue: prev.totalGrossRevenue,
                prevNetRealizedRevenue,
                prevStoreCosts,
                prevCOGS: prev.cogs,
                prevLabor: prev.labor,
                prevOPEX: prev.opex,
                prevCOGSPercent,
                prevLaborPercent,
                prevOPEXPercent,
                cogsPercentShift,
                laborPercentShift,
                opexPercentShift,
                costAnomalies: costAnomalies.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
            }
        };
    }, [settlementRecords, standaloneExpenses, billPayments, payrollRecords, employees, startDate, endDate, prevStartDate, prevEndDate, accountingMode]);

    // ========== DrillDown ==========
    const getDrillDownData = (criteria: { 
        type?: string, 
        categoryId?: string, 
        marketingFilter?: { subCat?: string, channel?: string },
        seafoodSubCat?: string,
        beverageSubCat?: string
    }) => {
        const rawItems: DetailedExpenseItem[] = [];
        const isInRange = (dateStr: string) => {
            if (!dateStr) return false;
            const d = dateStr.split('T')[0];
            return d >= startDate && d <= endDate;
        };

        const addItem = (item: DetailedExpenseItem) => {
            const itemType = categorizeExpense(item.category);
            if (criteria.type && itemType !== criteria.type) return;
            if (criteria.categoryId && item.category.toUpperCase() !== criteria.categoryId && !criteria.categoryId.startsWith('STAT_PENDING')) return;
            if (criteria.categoryId?.startsWith('STAT_PENDING') && item.id !== criteria.categoryId) return;
            // 👑 Phase 2.5: 营销细分过滤
            if (criteria.marketingFilter) {
                const mf = criteria.marketingFilter;
                if (mf.subCat) {
                    if (item.marketingSubCategory !== mf.subCat) {
                        // 未分类账单专用筛选：subCat === '__UNCATEGORIZED__'
                        if (!(mf.subCat === '__UNCATEGORIZED__' && !item.marketingSubCategory)) return;
                    }
                }
                if (mf.channel && item.adChannel !== mf.channel) return;
            }
            // 👑 Seafood subcategory filter
            if (criteria.seafoodSubCat) {
                if (item.seafoodSubCategory !== criteria.seafoodSubCat) {
                    if (!(criteria.seafoodSubCat === '__UNCATEGORIZED__' && !item.seafoodSubCategory)) return;
                }
            }
            // 👑 Beverage subcategory filter
            if (criteria.beverageSubCat) {
                if (item.beverageSubCategory !== criteria.beverageSubCat) {
                    if (!(criteria.beverageSubCat === '__UNCATEGORIZED__' && !item.beverageSubCategory)) return;
                }
            }
            item.type = itemType;
            rawItems.push(item);
        };

        settlementRecords.forEach(s => {
            const dStr = s.date.split('T')[0];
            if (!isInRange(dStr)) return;
            const bd: Record<string, any> = s.sales?.deliveryBreakdown || {};
            const gGross = Number(bd.grabGross) || 0;
            const gNet = Number(bd.grabNet) || Number(bd.grab) || 0;
            const gAds = Number(bd.grabAds) || 0;
            const comm = gGross > gNet ? (gGross - gNet) : 0;

            if (comm > 0) addItem({ id: `grab_comm_${s.id}`, date: dStr, category: 'PLATFORM_FEE_GRAB', desc: 'GrabFood 基础抽佣 (Settlement)', amount: comm, source: 'Settlement', type: 'DELIVERY_COST' });
            if (gAds > 0) addItem({ id: `grab_ads_${s.id}`, date: dStr, category: 'PLATFORM_FEE_GRAB', desc: 'GrabFood 当班广告 (Settlement)', amount: gAds, source: 'Settlement', type: 'DELIVERY_COST' });

            s.expenses?.forEach((e, idx) => {
                addItem({ 
                    id: `${s.id}_${idx}`, 
                    date: dStr, 
                    category: e.category, 
                    desc: `${e.company || 'Petty Cash'} (from Settlement)`, 
                    amount: Number(e.amount || 0), 
                    source: 'Settlement', 
                    type: '', 
                    documentLink: (e as any).documentLink || (e as any).receiptUrl || '', 
                    marketingSubCategory: (e as any).marketingSubCategory, 
                    adChannel: (e as any).adChannel,
                    seafoodSubCategory: (e as any).seafoodSubCategory,
                    beverageSubCategory: (e as any).beverageSubCategory
                });
            });
        });

        standaloneExpenses.forEach(e => {
            // 👑 3. 明细防重拦截：屏蔽 bill_sync_ 影子文件，防止点开明细弹窗看到两笔一模一样的钱
            if (e.id.startsWith('payroll_') || e.category === 'PAYROLL' || e.id.startsWith('salary_') || e.settlementId || e.id.startsWith('bill_sync_')) return;
            const docLink = (e as any).documentLink || (e as any).receiptUrl || (e as any).link || (e as any).fileUrl || '';

            if (accountingMode === 'ACCRUAL') {
                if (!isInRange(e.time)) return;
                const fullCost = Number(e.totalBillAmount || e.amount || 0) - Number(e.creditNote || 0);
                const statusTag = e.paymentStatus === 'PAID' ? '' : e.paymentStatus === 'PARTIAL' ? ' [部分付]' : ' [未付]';
                addItem({ 
                    id: e.id, 
                    date: e.time.split('T')[0], 
                    category: e.category, 
                    desc: e.company + (e.note ? ` - ${e.note}` : '') + statusTag, 
                    amount: fullCost, 
                    source: 'AP/Voucher', 
                    type: '', 
                    documentLink: docLink, 
                    marketingSubCategory: (e as any).marketingSubCategory, 
                    adChannel: (e as any).adChannel,
                    seafoodSubCategory: (e as any).seafoodSubCategory,
                    beverageSubCategory: (e as any).beverageSubCategory
                });
            } else {
                if (e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                const effectiveDate = e.paymentDate || e.time;
                if (!isInRange(effectiveDate)) return;
                const paidAmt = Number(e.amount || 0) - Number(e.creditNote || 0);
                addItem({ 
                    id: e.id, 
                    date: (effectiveDate).split('T')[0], 
                    category: e.category, 
                    desc: e.company + (e.note ? ` - ${e.note}` : ''), 
                    amount: paidAmt, 
                    source: 'AP/Voucher', 
                    type: '', 
                    documentLink: docLink, 
                    marketingSubCategory: (e as any).marketingSubCategory, 
                    adChannel: (e as any).adChannel,
                    seafoodSubCategory: (e as any).seafoodSubCategory,
                    beverageSubCategory: (e as any).beverageSubCategory
                });
            }
        });

        billPayments.forEach(b => {
            if (!isInRange(b.date)) return;
            addItem({ 
                id: b.id, 
                date: b.date, 
                category: b.category, 
                desc: b.name, 
                amount: Number(b.amount || 0), 
                source: 'Bill Payment', 
                type: '', 
                documentLink: (b as any).documentLink || (b as any).receiptUrl || '',
                seafoodSubCategory: (b as any).seafoodSubCategory,
                beverageSubCategory: (b as any).beverageSubCategory
            });
        });

        payrollRecords.forEach(p => {
             const effectiveDate = `${p.month}-28`;
             if (effectiveDate >= startDate && effectiveDate <= endDate && p.status === 'POSTED') {
                 if (!criteria.categoryId || criteria.categoryId === 'PAYROLL') {
                    addItem({ id: p.id, date: effectiveDate, category: 'PAYROLL', desc: `Net Pay for ${p.month} (Staff: ${p.staffCount})`, amount: Number(p.totalNetPay || 0), source: 'Payroll (Net)', type: 'LABOR' });
                 }
                 if (p.isStatutoryPaid && (!criteria.categoryId || criteria.categoryId === 'EPF_SOCSO')) {
                     addItem({ id: `${p.id}_STAT`, date: effectiveDate, category: 'EPF_SOCSO', desc: `EPF/SOCSO/EIS for ${p.month}`, amount: Number(p.totalGovtPay || 0), source: 'Payroll (Statutory)', type: 'LABOR' });
                 }
                 if (!p.isStatutoryPaid && criteria.categoryId === `STAT_PENDING_${p.month}`) {
                     addItem({ id: `STAT_PENDING_${p.month}`, date: effectiveDate, category: 'EPF_SOCSO', desc: `[DRAFT] Statutory for ${p.month}`, amount: Number(p.totalGovtPay || 0), source: 'Payroll (Pending)', type: 'LABOR' });
                 }
             }
        });

        return rawItems.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };
    
    const handleDrillDown = (criteria: Parameters<typeof getDrillDownData>[0], title: string) => {
        const items = getDrillDownData(criteria);
        setDetailView({ title, type: criteria.type || 'OPEX', items: items || [] });
    };

    const toggleAccordion = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // ========== Audit Data ==========
    const auditData = useMemo(() => {
        const allTx: AuditLogItem[] = [];
        settlementRecords.forEach(s => {
            const dateStr = s.date.split('T')[0];
            if (dateStr >= startDate && dateStr <= endDate) {
                const actualCash = Number(s.sales?.cash || 0) + Number(s.variance || 0);
                if (actualCash !== 0) allTx.push({ id: `c_${s.id}`, date: dateStr, time: s.timestamp || `${dateStr}T12:00`, type: 'IN', category: 'SALES', description: 'Cash Sales (POS)', amount: Math.abs(actualCash), account: 'CASH', balance:0 });
                const bankInc = Number(s.sales?.tng||0) + Number(s.sales?.duitnow||0) + Number(s.sales?.card||0) + Number(s.sales?.amex||0);
                const b: Record<string, any> = s.sales?.deliveryBreakdown || {};
                const delInc = b ? (Number(b.grabGross)||Number(b.grab)||0) + (Number(b.pandaGross)||Number(b.panda)||0) + (Number(b.shopeeGross)||Number(b.shopee)||0) : 0;
                if (bankInc + delInc > 0) allTx.push({ id: `b_${s.id}`, date: dateStr, time: s.timestamp || `${dateStr}T12:00`, type: 'IN', category: 'SALES', description: 'Digital/Delivery Sales', amount: bankInc + delInc, account: 'BANK', balance:0 });
                s.expenses?.forEach((e, i) => allTx.push({ id: `e_${s.id}_${i}`, date: dateStr, time: s.timestamp || `${dateStr}T12:00`, type: 'OUT', category: e.category, description: e.company || 'Petty Expense', amount: Number(e.amount||0), account: 'CASH', balance:0 }));
            }
        });
        standaloneExpenses.forEach(e => {
            const rawD = e.paymentDate || e.time;
            const d = rawD.split('T')[0];
            if (d >= startDate && d <= endDate && e.paymentStatus === 'PAID' && !e.settlementId) {
                allTx.push({ id: e.id, date: d, time: rawD, type: 'OUT', category: e.category, description: e.company, amount: Number(e.amount||0), account: e.paymentMethod || 'BANK', balance:0 });
            }
        });
        billPayments.forEach(b => {
            const bDate = b.date.split('T')[0];
            if (bDate >= startDate && bDate <= endDate) {
                allTx.push({ id: b.id, date: bDate, time: `${bDate}T12:00`, type: 'OUT', category: b.category, description: b.name, amount: Number(b.amount||0), account: b.method || 'BANK', balance:0 });
            }
        });
        transfers.forEach(t => {
            const d = t.date.split('T')[0];
            if (d >= startDate && d <= endDate) {
                // 💡 优化：移除 as any，使用安全的字符串比对
            if (String(t.fromAccount) === 'SHAREHOLDER') allTx.push({ id: t.id, date: d, time: t.date, type: 'IN', category: 'FUND', description: t.note || 'Capital Injection', amount: Number(t.amount||0), account: t.toAccount, balance:0 });
                else allTx.push({ id: t.id, date: d, time: t.date, type: 'TRANSFER', category: 'TRANSFER', description: `${t.fromAccount} → ${t.toAccount}`, amount: Number(t.amount||0), account: t.fromAccount, balance:0 });
            }
        });

        // 👑 智能财务审计补充：将已发放的员工薪资 (Payroll) 纳入借贷流水
        (payrollRecords || []).forEach(p => {
            const rawD = `${p.month}-28`;
            const d = rawD.split('T')[0];
            if (d >= startDate && d <= endDate && p.status === 'POSTED') {
                const totalPayout = Number(p.totalNetPay || 0);
                if (totalPayout > 0) {
                    allTx.push({
                        id: `pay_${p.id}`,
                        date: d,
                        time: `${d}T12:00`,
                        type: 'OUT',
                        category: 'SALARY',
                        description: `员工薪资发放汇总 (Payroll: ${p.id})`,
                        amount: totalPayout,
                        account: 'BANK',
                        balance: 0
                    });
                }
            }
        });

        allTx.sort((a, b) => {
            const tA = new Date(a.time).getTime();
            const tB = new Date(b.time).getTime();
            if (isNaN(tB)) return -1;
            if (isNaN(tA)) return 1;
            return tB - tA;
        });
        
        return allTx.filter(t => {
            if (auditFilter !== 'ALL' && t.type !== auditFilter) return false;
            if (auditSearch && !`${t.description} ${CATEGORY_LABELS[t.category]} ${t.amount}`.toLowerCase().includes(auditSearch.toLowerCase())) return false;
            return true;
        });
    }, [settlementRecords, standaloneExpenses, billPayments, transfers, payrollRecords, startDate, endDate, auditFilter, auditSearch]);

    // 👑 人效部门拆解 (共享给 Page 1 KPI + Page 4 Labor Matrix)
    const laborDeptAnalysis = useMemo(() => {
        const deptMap: Record<string, { cost: number; count: number; names: string[] }> = {
            kitchen: { cost: 0, count: 0, names: [] },
            floor: { cost: 0, count: 0, names: [] },
            bar: { cost: 0, count: 0, names: [] },
            support: { cost: 0, count: 0, names: [] },
            other: { cost: 0, count: 0, names: [] }
        };
        let totalDynamicLabor = 0;
        const currentMonthPrefix = startDate ? startDate.slice(0, 7) : '';

        (payrollRecords || []).forEach(pr => {
            if (!pr || pr.id !== currentMonthPrefix) return;
            (pr.details || []).forEach((d: any) => {
                if (!d) return;
                const emp = (employees || []).find(e => e.id === d.employeeId);
                const cost = Number(d.totalCost || 0);
                const name = emp?.name || d.employeeId || 'Unknown';
                totalDynamicLabor += cost;

                const role = emp ? String(emp.role || '').toUpperCase() : '';
                let dept = 'other';
                if (role.includes('CHEF') || role.includes('COOK') || role.includes('COMMIS') || role.includes('厨房') || role.includes('头手') || role.includes('BOH')) dept = 'kitchen';
                else if (role.includes('BAR') || role.includes('水吧') || role.includes('BEVERAGE')) dept = 'bar';
                else if (role.includes('CLEANER') || role.includes('DISH') || role.includes('后勤')) dept = 'support';
                else if (role.includes('WAITER') || role.includes('CAPTAIN') || role.includes('SUPERVISOR') || role.includes('CASHIER') || role.includes('楼面') || role.includes('FOH')) dept = 'floor';

                deptMap[dept].cost += cost;
                deptMap[dept].count++;
                deptMap[dept].names.push(name);
            });
        });

        const monthlyLaborFull = totalDynamicLabor > 0 ? totalDynamicLabor : (analytics?.costs?.totalLabor || 0);

        // 👑 关键修复：按已结算天数 pro-rate，与营收期间对齐
        // 避免"全月人工 ÷ 19天营收"的错误对比
        const settledDays = analytics?.settlementCount || 0;
        const [yr, mo] = (startDate || '2026-01-01').split('-').map(Number);
        const daysInMonth = (yr && mo) ? new Date(yr, mo, 0).getDate() : 30;
        const proRatedLabor = (settledDays > 0 && settledDays < daysInMonth)
            ? (monthlyLaborFull / daysInMonth) * settledDays
            : monthlyLaborFull;

        const realNetRev = analytics?.pnl?.netRealizedRevenue || 0;
        const netRev = Math.max(realNetRev, 1);
        const laborMarginSynced = realNetRev > 0 ? (proRatedLabor / realNetRev) * 100 : 0;  // 👑 现在用 pro-rated，当没有营收数据时优雅归零

        return { 
            deptMap, 
            totalDynamicLabor,
            actualLabor: proRatedLabor,        // 👑 改为期间分摊值 (主要用于占比计算)
            monthlyLaborFull,                  // 👑 新增：全月人工总额 (用于"Total Labor"展示)
            netRev, 
            hasData: totalDynamicLabor > 0, 
            laborMarginSynced,
            settledDays, 
            daysInMonth
        };
    }, [payrollRecords, employees, startDate, analytics]);

    // 👑 每日人工核算 — 用于推算保本门槛 (Daily Labor Breakdown)
    const dailyLaborBreakdown = useMemo(() => {
        // 👑 数据源优先级：laborDeptAnalysis.actualLabor (DRAFT 实编数据) > payrollForecast.amount (POSTED/基础预估)
        // 👑 三层兜底：DRAFT 真实数据 > Forecast 估算 > Employee 底薪硬扫描
        let monthlyLabor = 0;
        if (laborDeptAnalysis?.totalDynamicLabor && laborDeptAnalysis.totalDynamicLabor > 0) {
            monthlyLabor = laborDeptAnalysis.totalDynamicLabor;
        } else if ((analytics?.payrollForecast?.amount || 0) > 0) {
            monthlyLabor = analytics.payrollForecast.amount;
        } else {
            // 终极兜底：直接扫员工档案底薪 (确保新月份开始第一天就有数据)
            monthlyLabor = (employees || [])
                .filter((e: any) => 
                    e.status !== 'TERMINATED' && 
                    e.status !== 'RESIGNED' &&
                    !e.isArchived
                )
                .reduce((acc: number, e: any) => acc + (Number(e.basicSalary) || 0), 0);
        }
        const staffCount = analytics?.payrollForecast?.activeStaffCount || 0;
        const settledDays = analytics?.settlementCount || 0;

        // 👑 防御：当月天数 (基于 startDate 月份；May → 31, Feb → 28/29)
        const [yr, mo] = (startDate || '2026-01-01').split('-').map(Number);
        const daysInMonth = (yr && mo) ? new Date(yr, mo, 0).getDate() : 30;

        // 每日分摊
        const dailyLabor = daysInMonth > 0 ? monthlyLabor / daysInMonth : 0;
        const perEmployeeDaily = staffCount > 0 ? dailyLabor / staffCount : 0;

        // 期间应承担人工 (1号至已结算天数累计)
        const periodAccrued = dailyLabor * settledDays;

        // 实际期间日均营收
        const avgDailyRevenue = analytics?.avgDailySales || 0;

        // 👑 营收保本门槛公式：R = (Labor + OPEX) / [(1 - COGS%)(1 - Delivery%)]
        const cogsPct = (analytics?.margins?.cogs || 0) / 100;
        const grossRev = Math.max(analytics?.revenueDetails?.totalGrossRevenue || 0, 1);
        const deliveryPct = (analytics?.pnl?.totalDeliveryDirectCost || 0) / grossRev;
        const dailyOpex = settledDays > 0 ? (analytics?.costs?.totalOPEX || 0) / settledDays : 0;

        const grossMargin = Math.max(0.05, (1 - cogsPct) * (1 - deliveryPct)); // 防御除零
        const breakEvenLaborOnly = dailyLabor / grossMargin;
        const breakEvenFull = (dailyLabor + dailyOpex) / grossMargin;

        // 覆盖率：实际日均营收 / 仅人工保本门槛
        const laborCoverageRatio = breakEvenLaborOnly > 0 ? avgDailyRevenue / breakEvenLaborOnly : 0;

        // 👑 月底净利预测 (Project to End-of-Month based on current run-rate)
        const projectedMonthRevenue = avgDailyRevenue * daysInMonth;
        const variableCostRatio = grossRev > 1
            ? ((analytics?.costs?.totalCOGS || 0) + (analytics?.pnl?.totalDeliveryDirectCost || 0)) / grossRev
            : 0;
        const projectedVariableCost = projectedMonthRevenue * variableCostRatio;
        const projectedMonthOpex = dailyOpex * daysInMonth;
        const projectedNetProfit = projectedMonthRevenue - projectedVariableCost - monthlyLabor - projectedMonthOpex;
        const projectedMargin = projectedMonthRevenue > 0 ? (projectedNetProfit / projectedMonthRevenue) * 100 : 0;

        // 👑 缺口/盈余：实际日均 vs 全保本门槛
        const dailyGap = avgDailyRevenue - breakEvenFull;

        // 👑 追赶门槛：剩余天数需要每天做多少才能扳平月底
        const remainingDays = Math.max(daysInMonth - settledDays, 0);
        const monthShortfall = projectedNetProfit < 0 ? -projectedNetProfit : 0;
        const catchUpDailyRevenue = remainingDays > 0 && monthShortfall > 0
            ? avgDailyRevenue + (monthShortfall / remainingDays / Math.max(1 - variableCostRatio, 0.05))
            : 0;

        // 👑 数据完整性标记：必须同时有薪资数据 + 至少1天结算，才能做有意义的预测
        const hasValidData = monthlyLabor > 0 && settledDays > 0 && avgDailyRevenue > 0;
        const hasLaborOnly = monthlyLabor > 0 && settledDays === 0; // 有薪资数据但没结算
        const hasSalesOnly = monthlyLabor === 0 && settledDays > 0; // 有结算但没薪资数据

        return {
            monthlyLabor, staffCount, settledDays, daysInMonth,
            dailyLabor, perEmployeeDaily, periodAccrued,
            avgDailyRevenue, dailyOpex,
            breakEvenLaborOnly, breakEvenFull, laborCoverageRatio,
            projectedMonthRevenue, projectedNetProfit, projectedMargin,
            dailyGap, remainingDays, catchUpDailyRevenue,
            hasValidData, hasLaborOnly, hasSalesOnly,
            isPosted: analytics?.payrollForecast?.isPosted || false
        };
    }, [analytics, startDate, laborDeptAnalysis, employees]);

    // 👑 Phase 2: 营销细分钻取数据 (Marketing Breakdown)
    // 独立扫描原始账单，按 marketingSubCategory / adChannel 聚合
    // 与 analytics 同口径过滤，避免重复计算
    const marketingBreakdown = useMemo(() => {
        const isInRange = (dateStr: string, start: string, end: string) => {
            if (!dateStr) return false;
            const d = dateStr.split('T')[0];
            return d >= start && d <= end;
        };

        const subCatsCur: Record<string, { amount: number; count: number; channels: Record<string, { amount: number; count: number }> }> = {};
        const subCatsPrev: Record<string, { amount: number; count: number; channels: Record<string, { amount: number; count: number }> }> = {};
        let totalMarketingCur = 0;
        let totalMarketingPrev = 0;
        let uncategorizedAmountCur = 0;
        let uncategorizedAmountPrev = 0;
        let uncategorizedCountCur = 0;
        let uncategorizedCountPrev = 0;

        const addMarketing = (bill: any, amount: number, isPrev: boolean) => {
            if (amount <= 0) return;
            const sub = bill.marketingSubCategory;
            if (isPrev) {
                totalMarketingPrev += amount;
                if (!sub) {
                    uncategorizedAmountPrev += amount;
                    uncategorizedCountPrev++;
                    return;
                }
                if (!subCatsPrev[sub]) subCatsPrev[sub] = { amount: 0, count: 0, channels: {} };
                subCatsPrev[sub].amount += amount;
                subCatsPrev[sub].count++;
                if (sub === 'AD_OUTPUT') {
                    const ch = bill.adChannel || 'OTHER';
                    if (!subCatsPrev[sub].channels[ch]) subCatsPrev[sub].channels[ch] = { amount: 0, count: 0 };
                    subCatsPrev[sub].channels[ch].amount += amount;
                    subCatsPrev[sub].channels[ch].count++;
                }
            } else {
                totalMarketingCur += amount;
                if (!sub) {
                    uncategorizedAmountCur += amount;
                    uncategorizedCountCur++;
                    return;
                }
                if (!subCatsCur[sub]) subCatsCur[sub] = { amount: 0, count: 0, channels: {} };
                subCatsCur[sub].amount += amount;
                subCatsCur[sub].count++;
                if (sub === 'AD_OUTPUT') {
                    const ch = bill.adChannel || 'OTHER';
                    if (!subCatsCur[sub].channels[ch]) subCatsCur[sub].channels[ch] = { amount: 0, count: 0 };
                    subCatsCur[sub].channels[ch].amount += amount;
                    subCatsCur[sub].channels[ch].count++;
                }
            }
        };

        // 1. 独立账单 (与 analytics 同口径过滤)
        standaloneExpenses.forEach(e => {
            if (e.id.startsWith('payroll_') || e.id.startsWith('salary_') || e.settlementId || e.id.startsWith('bill_sync_')) return;
            if ((e.category || '').toUpperCase() !== 'MARKETING') return;
            const dateToUse = accountingMode === 'ACCRUAL' ? e.time : (e.paymentDate || e.time);
            const amt = Number(accountingMode === 'ACCRUAL' ? (e.totalBillAmount || e.amount) : e.amount) - Number(e.creditNote || 0);

            if (isInRange(dateToUse, startDate, endDate)) {
                if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                addMarketing(e, amt, false);
            } else if (isInRange(dateToUse, prevStartDate, prevEndDate)) {
                if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                addMarketing(e, amt, true);
            }
        });

        // 2. 结算单内嵌账单
        settlementRecords.forEach(s => {
            const dStr = s.date.split('T')[0];
            if (isInRange(dStr, startDate, endDate)) {
                s.expenses?.forEach((e: any) => {
                    if ((e.category || '').toUpperCase() !== 'MARKETING') return;
                    addMarketing(e, Number(e.amount || 0), false);
                });
            } else if (isInRange(dStr, prevStartDate, prevEndDate)) {
                s.expenses?.forEach((e: any) => {
                    if ((e.category || '').toUpperCase() !== 'MARKETING') return;
                    addMarketing(e, Number(e.amount || 0), true);
                });
            }
        });

        // 排序输出与对比
        const keys = Array.from(new Set([...Object.keys(subCatsCur), ...Object.keys(subCatsPrev)]));
        const subCatList = keys.map(key => {
            const cur = subCatsCur[key] || { amount: 0, count: 0, channels: {} };
            const prev = subCatsPrev[key] || { amount: 0, count: 0, channels: {} };
            const delta = cur.amount - prev.amount;
            const deltaPct = prev.amount > 0 ? (delta / prev.amount) * 100 : 0;

            const chKeys = Array.from(new Set([...Object.keys(cur.channels || {}), ...Object.keys(prev.channels || {})]));
            const channels = chKeys.map(ch => {
                const cvCur = cur.channels[ch] || { amount: 0, count: 0 };
                const cvPrev = prev.channels[ch] || { amount: 0, count: 0 };
                const cvDelta = cvCur.amount - cvPrev.amount;
                const cvDeltaPct = cvPrev.amount > 0 ? (cvDelta / cvPrev.amount) * 100 : 0;
                return {
                    key: ch,
                    amount: cvCur.amount,
                    count: cvCur.count,
                    prevAmount: cvPrev.amount,
                    delta: cvDelta,
                    deltaPct: cvDeltaPct,
                    pct: cur.amount > 0 ? (cvCur.amount / cur.amount) * 100 : 0
                };
            }).sort((a, b) => b.amount - a.amount);

            return {
                key,
                amount: cur.amount,
                count: cur.count,
                prevAmount: prev.amount,
                delta,
                deltaPct,
                pct: totalMarketingCur > 0 ? (cur.amount / totalMarketingCur) * 100 : 0,
                channels
            };
        }).sort((a, b) => b.amount - a.amount);

        const uncategorizedDelta = uncategorizedAmountCur - uncategorizedAmountPrev;
        const uncategorizedDeltaPct = uncategorizedAmountPrev > 0 ? (uncategorizedDelta / uncategorizedAmountPrev) * 100 : 0;

        return {
            totalMarketing: totalMarketingCur,
            prevTotalMarketing: totalMarketingPrev,
            subCatList,
            uncategorizedAmount: uncategorizedAmountCur,
            uncategorizedPrevAmount: uncategorizedAmountPrev,
            uncategorizedDelta,
            uncategorizedDeltaPct,
            uncategorizedCount: uncategorizedCountCur
        };
    }, [standaloneExpenses, settlementRecords, startDate, endDate, prevStartDate, prevEndDate, accountingMode]);

    // 👑 Seafood Breakdown
    const seafoodBreakdown = useMemo(() => {
        const isInRange = (dateStr: string, start: string, end: string) => {
            if (!dateStr) return false;
            const d = dateStr.split('T')[0];
            return d >= start && d <= end;
        };

        const subCatsCur: Record<string, { amount: number; count: number }> = {};
        const subCatsPrev: Record<string, { amount: number; count: number }> = {};
        let totalSeafoodCur = 0;
        let totalSeafoodPrev = 0;
        let uncategorizedAmountCur = 0;
        let uncategorizedAmountPrev = 0;
        let uncategorizedCountCur = 0;
        let uncategorizedCountPrev = 0;

        const addSeafood = (bill: any, amount: number, isPrev: boolean) => {
            if (amount <= 0) return;
            const sub = bill.seafoodSubCategory;
            if (isPrev) {
                totalSeafoodPrev += amount;
                if (!sub) {
                    uncategorizedAmountPrev += amount;
                    uncategorizedCountPrev++;
                    return;
                }
                if (!subCatsPrev[sub]) subCatsPrev[sub] = { amount: 0, count: 0 };
                subCatsPrev[sub].amount += amount;
                subCatsPrev[sub].count++;
            } else {
                totalSeafoodCur += amount;
                if (!sub) {
                    uncategorizedAmountCur += amount;
                    uncategorizedCountCur++;
                    return;
                }
                if (!subCatsCur[sub]) subCatsCur[sub] = { amount: 0, count: 0 };
                subCatsCur[sub].amount += amount;
                subCatsCur[sub].count++;
            }
        };

        // 1. Standalone bills
        standaloneExpenses.forEach(e => {
            if (e.id.startsWith('payroll_') || e.id.startsWith('salary_') || e.settlementId || e.id.startsWith('bill_sync_')) return;
            if ((e.category || '').toUpperCase() !== 'INGREDIENT_SEAFOOD') return;
            const dateToUse = accountingMode === 'ACCRUAL' ? e.time : (e.paymentDate || e.time);
            const amt = Number(accountingMode === 'ACCRUAL' ? (e.totalBillAmount || e.amount) : e.amount) - Number(e.creditNote || 0);

            if (isInRange(dateToUse, startDate, endDate)) {
                if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                addSeafood(e, amt, false);
            } else if (isInRange(dateToUse, prevStartDate, prevEndDate)) {
                if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                addSeafood(e, amt, true);
            }
        });

        // 2. Petty cash in settlement records
        settlementRecords.forEach(s => {
            const dStr = s.date.split('T')[0];
            if (isInRange(dStr, startDate, endDate)) {
                s.expenses?.forEach((e: any) => {
                    if ((e.category || '').toUpperCase() !== 'INGREDIENT_SEAFOOD') return;
                    addSeafood(e, Number(e.amount || 0), false);
                });
            } else if (isInRange(dStr, prevStartDate, prevEndDate)) {
                s.expenses?.forEach((e: any) => {
                    if ((e.category || '').toUpperCase() !== 'INGREDIENT_SEAFOOD') return;
                    addSeafood(e, Number(e.amount || 0), true);
                });
            }
        });

        // 3. Bill payments
        billPayments.forEach(b => {
            if (isInRange(b.date, startDate, endDate)) {
                if ((b.category || '').toUpperCase() !== 'INGREDIENT_SEAFOOD') return;
                addSeafood(b, Number(b.amount || 0), false);
            } else if (isInRange(b.date, prevStartDate, prevEndDate)) {
                if ((b.category || '').toUpperCase() !== 'INGREDIENT_SEAFOOD') return;
                addSeafood(b, Number(b.amount || 0), true);
            }
        });

        const keys = Array.from(new Set([...Object.keys(subCatsCur), ...Object.keys(subCatsPrev)]));
        const subCatList = keys.map(key => {
            const cur = subCatsCur[key] || { amount: 0, count: 0 };
            const prev = subCatsPrev[key] || { amount: 0, count: 0 };
            const delta = cur.amount - prev.amount;
            const deltaPct = prev.amount > 0 ? (delta / prev.amount) * 105 : 0; // standard pct
            return {
                key,
                amount: cur.amount,
                count: cur.count,
                prevAmount: prev.amount,
                delta,
                deltaPct: prev.amount > 0 ? (delta / prev.amount) * 100 : 0,
                pct: totalSeafoodCur > 0 ? (cur.amount / totalSeafoodCur) * 100 : 0
            };
        }).sort((a, b) => b.amount - a.amount);

        const uncategorizedDelta = uncategorizedAmountCur - uncategorizedAmountPrev;
        const uncategorizedDeltaPct = uncategorizedAmountPrev > 0 ? (uncategorizedDelta / uncategorizedAmountPrev) * 100 : 0;

        return {
            totalSeafood: totalSeafoodCur,
            prevTotalSeafood: totalSeafoodPrev,
            subCatList,
            uncategorizedAmount: uncategorizedAmountCur,
            uncategorizedPrevAmount: uncategorizedAmountPrev,
            uncategorizedDelta,
            uncategorizedDeltaPct,
            uncategorizedCount: uncategorizedCountCur
        };
    }, [standaloneExpenses, settlementRecords, billPayments, startDate, endDate, prevStartDate, prevEndDate, accountingMode]);

    // 👑 Beverage Breakdown
    const beverageBreakdown = useMemo(() => {
        const isInRange = (dateStr: string, start: string, end: string) => {
            if (!dateStr) return false;
            const d = dateStr.split('T')[0];
            return d >= start && d <= end;
        };

        const subCatsCur: Record<string, { amount: number; count: number }> = {};
        const subCatsPrev: Record<string, { amount: number; count: number }> = {};
        let totalBeverageCur = 0;
        let totalBeveragePrev = 0;
        let uncategorizedAmountCur = 0;
        let uncategorizedAmountPrev = 0;
        let uncategorizedCountCur = 0;
        let uncategorizedCountPrev = 0;

        const addBeverage = (bill: any, amount: number, isPrev: boolean) => {
            if (amount <= 0) return;
            const sub = bill.beverageSubCategory;
            if (isPrev) {
                totalBeveragePrev += amount;
                if (!sub) {
                    uncategorizedAmountPrev += amount;
                    uncategorizedCountPrev++;
                    return;
                }
                if (!subCatsPrev[sub]) subCatsPrev[sub] = { amount: 0, count: 0 };
                subCatsPrev[sub].amount += amount;
                subCatsPrev[sub].count++;
            } else {
                totalBeverageCur += amount;
                if (!sub) {
                    uncategorizedAmountCur += amount;
                    uncategorizedCountCur++;
                    return;
                }
                if (!subCatsCur[sub]) subCatsCur[sub] = { amount: 0, count: 0 };
                subCatsCur[sub].amount += amount;
                subCatsCur[sub].count++;
            }
        };

        // 1. Standalone bills
        standaloneExpenses.forEach(e => {
            if (e.id.startsWith('payroll_') || e.id.startsWith('salary_') || e.settlementId || e.id.startsWith('bill_sync_')) return;
            if ((e.category || '').toUpperCase() !== 'BEVERAGE') return;
            const dateToUse = accountingMode === 'ACCRUAL' ? e.time : (e.paymentDate || e.time);
            const amt = Number(accountingMode === 'ACCRUAL' ? (e.totalBillAmount || e.amount) : e.amount) - Number(e.creditNote || 0);

            if (isInRange(dateToUse, startDate, endDate)) {
                if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                addBeverage(e, amt, false);
            } else if (isInRange(dateToUse, prevStartDate, prevEndDate)) {
                if (accountingMode === 'CASH' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PARTIAL') return;
                addBeverage(e, amt, true);
            }
        });

        // 2. Petty cash in settlement records
        settlementRecords.forEach(s => {
            const dStr = s.date.split('T')[0];
            if (isInRange(dStr, startDate, endDate)) {
                s.expenses?.forEach((e: any) => {
                    if ((e.category || '').toUpperCase() !== 'BEVERAGE') return;
                    addBeverage(e, Number(e.amount || 0), false);
                });
            } else if (isInRange(dStr, prevStartDate, prevEndDate)) {
                s.expenses?.forEach((e: any) => {
                    if ((e.category || '').toUpperCase() !== 'BEVERAGE') return;
                    addBeverage(e, Number(e.amount || 0), true);
                });
            }
        });

        // 3. Bill payments
        billPayments.forEach(b => {
            if (isInRange(b.date, startDate, endDate)) {
                if ((b.category || '').toUpperCase() !== 'BEVERAGE') return;
                addBeverage(b, Number(b.amount || 0), false);
            } else if (isInRange(b.date, prevStartDate, prevEndDate)) {
                if ((b.category || '').toUpperCase() !== 'BEVERAGE') return;
                addBeverage(b, Number(b.amount || 0), true);
            }
        });

        const keys = Array.from(new Set([...Object.keys(subCatsCur), ...Object.keys(subCatsPrev)]));
        const subCatList = keys.map(key => {
            const cur = subCatsCur[key] || { amount: 0, count: 0 };
            const prev = subCatsPrev[key] || { amount: 0, count: 0 };
            const delta = cur.amount - prev.amount;
            const deltaPct = prev.amount > 0 ? (delta / prev.amount) * 100 : 0;
            return {
                key,
                amount: cur.amount,
                count: cur.count,
                prevAmount: prev.amount,
                delta,
                deltaPct,
                pct: totalBeverageCur > 0 ? (cur.amount / totalBeverageCur) * 100 : 0
            };
        }).sort((a, b) => b.amount - a.amount);

        const uncategorizedDelta = uncategorizedAmountCur - uncategorizedAmountPrev;
        const uncategorizedDeltaPct = uncategorizedAmountPrev > 0 ? (uncategorizedDelta / uncategorizedAmountPrev) * 100 : 0;

        return {
            totalBeverage: totalBeverageCur,
            prevTotalBeverage: totalBeveragePrev,
            subCatList,
            uncategorizedAmount: uncategorizedAmountCur,
            uncategorizedPrevAmount: uncategorizedAmountPrev,
            uncategorizedDelta,
            uncategorizedDeltaPct,
            uncategorizedCount: uncategorizedCountCur
        };
    }, [standaloneExpenses, settlementRecords, billPayments, startDate, endDate, prevStartDate, prevEndDate, accountingMode]);

    // 👑 同步后的 KPI 评估 (给 PDF Page 1 用)
    const syncedLaborEval = laborDeptAnalysis.laborMarginSynced > 25
        ? { label: '偏高 (HIGH)', color: 'text-red-600 bg-red-50 border-red-200' }
        : laborDeptAnalysis.laborMarginSynced < 18
        ? { label: '过低 (LOW)', color: 'text-orange-600 bg-orange-50 border-orange-200' }
        : { label: '平稳 (NORMAL)', color: 'text-green-600 bg-green-50 border-green-200' };

    // ========== CSV Export ==========
    const handleExportCSV = () => {
        const pnl = analytics.pnl;
        const cost = analytics.costs;

        const rows = [
            ['KIM LIAN KEE - 财务核算报表 (Financial Report)'],
            ['期间 (Period)', `${startDate} to ${endDate}`],
            ['核算模式 (Mode)', accountingMode === 'ACCRUAL' ? '权责发生制 (Accrual)' : '收付实现制 (Cash Basis)'],
            [],
            ['【 1. 营业总收入 (GROSS REVENUE) 】', '金额 (RM)'],
            ['账面总营业额 (Total Gross Revenue)', pnl.totalGrossRevenue.toFixed(2)],
            [' - 门店营业额 (In-Store Sales)', analytics.revenueDetails.inStoreSales.toFixed(2)],
            [' - 外卖账面总计 (Delivery Gross)', analytics.revenueDetails.deliveryGross.toFixed(2)],
            [],
            ['【 2. 外卖专属损耗 (DELIVERY COSTS) 】', '金额 (RM)'],
            ['外卖总损耗 (Total Delivery Cost)', pnl.totalDeliveryDirectCost.toFixed(2)],
            [' - Grab 基础抽佣', pnl.grabCommission.toFixed(2)],
            [' - Grab 广告费', pnl.grabAds.toFixed(2)],
            [' - FoodPanda 抽佣/调节费', pnl.pandaFees.toFixed(2)],
            [' - ShopeeFood 抽佣/调节费', pnl.shopeeFees.toFixed(2)],
            [' - 其他平台费用', pnl.otherPlatformFees.toFixed(2)],
            [],
            ['【 3. 真实可用收入 (NET REALIZED REVENUE) 】', '金额 (RM)'],
            ['净营业收入 (真实落袋资金)', pnl.netRealizedRevenue.toFixed(2)],
            [],
            ['【 4. 门店运营支出 (STORE OPEX) 】', '金额 (RM)', '占净营收比例 (%)'],
            ['销货成本 (Total COGS)', cost.totalCOGS.toFixed(2), analytics.margins.cogs.toFixed(2) + '%'],
            ['人工成本 (Total Labor)', cost.totalLabor.toFixed(2), analytics.margins.labor.toFixed(2) + '%'],
            ['运营杂费 (Total OPEX)', cost.totalOPEX.toFixed(2), analytics.margins.opex.toFixed(2) + '%'],
            ['资本支出 (CAPEX - 资产)', cost.totalCapex.toFixed(2), '-'],
            [],
            ['【 5. 每日人工核算 (DAILY LABOR BREAKDOWN) 】', '金额 (RM)', '说明'],
            ['当月薪资总额', dailyLaborBreakdown.monthlyLabor.toFixed(2), dailyLaborBreakdown.isPosted ? '已结账' : '预估'],
            ['当月天数', dailyLaborBreakdown.daysInMonth, '天'],
            ['在职员工数', dailyLaborBreakdown.staffCount, '名'],
            ['每日人工成本 (Daily Labor)', dailyLaborBreakdown.dailyLabor.toFixed(2), `月薪 ÷ ${dailyLaborBreakdown.daysInMonth}天`],
            ['人均每日 (Per-Employee Daily)', dailyLaborBreakdown.perEmployeeDaily.toFixed(2), '每员工每天'],
            ['已结算天数', dailyLaborBreakdown.settledDays, '天'],
            ['期间累计应承担人工', dailyLaborBreakdown.periodAccrued.toFixed(2), `${dailyLaborBreakdown.settledDays} 天 × Daily Labor`],
            ['期间实际日均营收', dailyLaborBreakdown.avgDailyRevenue.toFixed(2), '已结算天数日均'],
            [],
            ['【 6. 每日保本门槛 (BREAK-EVEN THRESHOLD) 】', '金额 (RM)', '说明'],
            ['仅覆盖人工的日营收门槛', dailyLaborBreakdown.breakEvenLaborOnly.toFixed(2), 'DailyLabor ÷ (1-COGS%)(1-Delivery%)'],
            ['含 OPEX 完整保本日营收', dailyLaborBreakdown.breakEvenFull.toFixed(2), '(DailyLabor+DailyOPEX) ÷ 毛利率'],
            ['日均覆盖率 (实际 ÷ 仅人工门槛)', dailyLaborBreakdown.laborCoverageRatio.toFixed(2) + 'x',
                !dailyLaborBreakdown.hasValidData ? '📊 数据不足' :
                dailyLaborBreakdown.laborCoverageRatio >= 1.8 ? '✅ 健康' :
                dailyLaborBreakdown.laborCoverageRatio >= 1.2 ? '⚠️ 紧张' :
                dailyLaborBreakdown.laborCoverageRatio >= 1.0 ? '🟠 危险' : '🚨 亏损中'],
            [],
            ['【 7. 月底预测 (END-OF-MONTH FORECAST) 】', '金额 (RM)', '说明'],
            ['月底预估营收', dailyLaborBreakdown.projectedMonthRevenue.toFixed(2), `日均 × ${dailyLaborBreakdown.daysInMonth}天`],
            ['月底预估净利', dailyLaborBreakdown.projectedNetProfit.toFixed(2), 
                dailyLaborBreakdown.projectedNetProfit >= 0 ? '✅ 预计盈利' : '🚨 预计亏损'],
            ['月底预估净利率', dailyLaborBreakdown.projectedMargin.toFixed(2) + '%', '-'],
            ['剩余天数', dailyLaborBreakdown.remainingDays, `${dailyLaborBreakdown.daysInMonth} - ${dailyLaborBreakdown.settledDays}`],
            ['扳平方案 (剩余天数每日需做)', dailyLaborBreakdown.catchUpDailyRevenue > 0 ? dailyLaborBreakdown.catchUpDailyRevenue.toFixed(2) : '-',
                dailyLaborBreakdown.projectedNetProfit < 0 ? '⚡ 拯救方案' : '✅ 已盈利无需扳平'],
            [],
            ['【 8. 核心利润指标 (KPI) 】', '金额 (RM)', '净盈利率 (%)'],
            ['门店毛利 (Gross Profit)', analytics.grossProfit.toFixed(2), (pnl.netRealizedRevenue ? (analytics.grossProfit / pnl.netRealizedRevenue * 100) : 0).toFixed(2) + '%'],
            ['经营净利 (Net Profit)', analytics.netProfit.toFixed(2), analytics.netMargin.toFixed(2) + '%'],
            ['真实可用现金流 (Net Cash Flow)', analytics.netCashFlow.toFixed(2), '-'],
        ];

        const csvContent = rows.map(e => e.map(item => `"${String(item).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `P&L_Report_${startDate}_${endDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ========== PDF Export (3 pages) ==========
    const handleExportPDF = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        try {
            await new Promise(r => setTimeout(r, 800));
            const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#F5F7FA', windowWidth: 1000 });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            
            // 👑 800px 宽对应的标准 A4 高度为 1131px
            const domPageHeightPixels = 1131 * 2; 
            const pdfPageHeight = (domPageHeightPixels * pdfWidth) / canvas.width; 
            
            let heightLeft = canvas.height;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
            heightLeft -= domPageHeightPixels;
            
            while (heightLeft > 0) {
                position -= pdfPageHeight; 
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
                heightLeft -= domPageHeightPixels;
            }
            
            pdf.save(`P&L_Report_${startDate}_to_${endDate}.pdf`);
        } catch (e) { 
            console.error(e); alert("Export failed"); 
        } finally { setIsExporting(false); }
    };

    // 👑 开销对比 PDF
    const handleExportCostPDF = async () => {
        if (!printCostRef.current) return; setIsExporting(true);
        try {
            await new Promise(r => setTimeout(r, 800));
            const canvas = await html2canvas(printCostRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1000 });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pw = pdf.internal.pageSize.getWidth();
            
            // 👑 850px 宽对应的标准 A4 高度为 1202px (修复底部溢出重影的终极关键)
            const domPageHeightPixels = 1202 * 2; 
            const pdfPageHeight = (domPageHeightPixels * pw) / canvas.width; 
            
            let hl = canvas.height, pos = 0;
            
            pdf.addImage(imgData, 'JPEG', 0, pos, pw, (canvas.height * pw) / canvas.width);
            hl -= domPageHeightPixels;
            
            while (hl > 0) { 
                pos -= pdfPageHeight; 
                pdf.addPage(); 
                pdf.addImage(imgData, 'JPEG', 0, pos, pw, (canvas.height * pw) / canvas.width); 
                hl -= domPageHeightPixels; 
            }
            
            pdf.save(`Cost_Comparison_${startDate.slice(0, 7)}_vs_${compareMonth}.pdf`);
        } catch (e) { console.error(e); alert("Export failed"); }
        finally { setIsExporting(false); }
    };

    // Formatter Helpers
    const prevPeriodLabel = `${new Date(prevStartDate).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})} to ${new Date(prevEndDate).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}`;

    const renderMoM = (pct: number, invertColor: boolean = false) => {
        if (pct === 0 || !isFinite(pct)) return null;
        const isPositive = pct > 0;
        const isGood = invertColor ? !isPositive : isPositive;
        return (
            <div className="flex flex-col items-end shrink-0">
                <span className={`text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isPositive ? '↗' : '↘'} {Math.abs(pct).toFixed(1)}%
                </span>
                <span className="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap hidden sm:block">vs {prevPeriodLabel}</span>
            </div>
        );
    };

    // AI Evaluations for PDF
    const cogsEval = analytics.margins.cogs > 40 ? { label: '偏高 (HIGH)', color: 'text-red-600 bg-red-50 border-red-200' } : analytics.margins.cogs < 30 ? { label: '过低 (LOW)', color: 'text-orange-600 bg-orange-50 border-orange-200' } : { label: '平稳 (NORMAL)', color: 'text-green-600 bg-green-50 border-green-200' };
    const laborEval = analytics.margins.labor > 25 ? { label: '偏高 (HIGH)', color: 'text-red-600 bg-red-50 border-red-200' } : analytics.margins.labor < 18 ? { label: '过低 (LOW)', color: 'text-orange-600 bg-orange-50 border-orange-200' } : { label: '平稳 (NORMAL)', color: 'text-green-600 bg-green-50 border-green-200' };
    const opexEval = analytics.margins.opex > 15 ? { label: '偏高 (HIGH)', color: 'text-red-600 bg-red-50 border-red-200' } : { label: '平稳 (NORMAL)', color: 'text-green-600 bg-green-50 border-green-200' };
    const netEval = analytics.netMargin > 20 ? { label: '优秀 (EXCELLENT)', color: 'text-emerald-700 bg-emerald-50 border-emerald-300' } : analytics.netMargin > 10 ? { label: '平稳 (NORMAL)', color: 'text-blue-700 bg-blue-50 border-blue-300' } : analytics.netMargin > 0 ? { label: '偏低 (LOW)', color: 'text-orange-700 bg-orange-50 border-orange-300' } : { label: '亏损 (LOSS)', color: 'text-red-700 bg-red-50 border-red-300' };

    // ========== 📐 Mobile-Friendly Revenue Line Item Component ==========
    const RevenueLineItem = ({ label, shortLabel, pct, amount, className = '' }: { label: string, shortLabel: string, pct: number, amount: number, className?: string }) => (
        <div className={`flex items-center justify-between mb-2.5 sm:mb-3 gap-2 ${className}`}>
            <span className="font-bold text-gray-500 text-xs sm:text-sm min-w-0 leading-tight">
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{label}</span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-[9px] sm:text-[10px] bg-gray-100 px-1 sm:px-1.5 py-0.5 rounded font-bold text-gray-500 tabular-nums">{pct.toFixed(1)}%</span>
                <span className="font-mono font-bold text-[#1A1A1A] text-xs sm:text-sm tabular-nums">{formatMoney(amount)}</span>
            </div>
        </div>
    );

    // 👑 嵌套品类对比行组件（比如：海鲜、水吧、营销细分）— 带迷你对比条
    const SubComparisonRow = ({ label, amount, prevAmount = 0, delta = 0, deltaPct = 0, pct = 0, onClick, bgTheme = "blue" }: {
        label: string,
        amount: number,
        prevAmount?: number,
        delta?: number,
        deltaPct?: number,
        pct?: number,
        onClick: () => void,
        bgTheme?: "blue" | "indigo" | "amber"
    }) => {
        const maxVal = Math.max(amount, prevAmount, 1);
        const curW = Math.max(4, (amount / maxVal) * 100);
        const prvW = Math.max(2, (prevAmount / maxVal) * 100);
        const isUp = delta > 0;
        const isNew = prevAmount === 0 && amount > 0;

        let bgBarCur = "bg-blue-300/60";
        let borderTheme = "border-blue-100/80 hover:bg-blue-50/40";
        if (bgTheme === "indigo") {
            bgBarCur = "bg-indigo-300/60";
            borderTheme = "border-indigo-150 hover:bg-indigo-50/40";
        } else if (bgTheme === "amber") {
            bgBarCur = "bg-amber-300/60";
            borderTheme = "border-amber-150 hover:bg-amber-50/40";
        }

        return (
            <div onClick={onClick} className={`bg-white p-2.5 sm:p-3 rounded-xl border ${borderTheme} cursor-pointer transition-all active:scale-[0.985] group`}>
                <div className="flex justify-between items-center gap-2 mb-1">
                    <span className="text-gray-650 group-hover:text-gray-900 min-w-0 truncate text-[11px] sm:text-xs font-bold leading-tight flex items-center gap-1">
                        {label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {!isNew && delta !== 0 && (
                            <span className={`text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                {isUp ? '↑' : '↓'} {Math.abs(deltaPct).toFixed(0)}%
                            </span>
                        )}
                        {isNew && <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1 py-0.5 rounded">NEW</span>}
                        <span className="font-mono text-gray-900 tabular-nums text-[11px] sm:text-xs font-black">{formatMoney(amount)}</span>
                        <ChevronRight size={10} className="text-gray-300 group-hover:text-gray-500 shrink-0"/>
                    </div>
                </div>
                {/* 迷你对比条 */}
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-50 rounded-full overflow-hidden relative border border-gray-100/50">
                        {prevAmount > 0 && <div className="absolute inset-y-0 left-0 bg-gray-200/50 rounded-full transition-all" style={{ width: `${prvW}%` }} />}
                        <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${isUp ? 'bg-red-300' : prevAmount > 0 ? 'bg-green-300' : bgBarCur}`} style={{ width: `${curW}%` }} />
                    </div>
                    <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-medium shrink-0 tabular-nums text-gray-400">
                        <span>占 {pct.toFixed(0)}%</span>
                        {prevAmount > 0 && (
                            <span className="text-gray-400 font-mono pl-1 border-l border-gray-100">上期: {prevAmount.toFixed(0)}</span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

// 👑 品类对比行组件 — 带迷你对比条
    const ComparisonRow = ({ g, onClick, accentHover }: { g: CostGroup, onClick: () => void, accentHover: string }) => {
        const prevAmt = g.prevAmount || 0;
        const delta = g.delta || 0;
        const deltaPct = g.deltaPct || 0;
        const maxVal = Math.max(g.amount, prevAmt, 1);
        const curW = Math.max(4, (g.amount / maxVal) * 100);
        const prvW = Math.max(2, (prevAmt / maxVal) * 100);
        const isUp = delta > 0;
        const isNew = prevAmt === 0 && g.amount > 0;

        return (
            <div onClick={onClick} className={`p-2.5 sm:p-3 ${accentHover} rounded-xl cursor-pointer transition-colors group active:scale-[0.98]`}>
                <div className="flex justify-between items-center gap-2 mb-1.5">
                    <span className="text-gray-600 group-hover:text-gray-900 min-w-0 truncate text-xs sm:text-sm font-bold">{g.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {!isNew && delta !== 0 && (
                            <span className={`text-[8px] sm:text-[9px] font-black px-1 py-0.5 rounded-full whitespace-nowrap ${isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                {isUp ? '↑' : '↓'} {Math.abs(deltaPct).toFixed(0)}%
                            </span>
                        )}
                        {isNew && <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1 py-0.5 rounded">NEW</span>}
                        <span className="font-mono text-[#1A1A1A] tabular-nums text-xs sm:text-sm font-bold">{formatMoney(g.amount)}</span>
                        <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-500"/>
                    </div>
                </div>
                {/* Mini comparison bar */}
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                        {prevAmt > 0 && <div className="absolute inset-y-0 left-0 bg-gray-300/40 rounded-full transition-all" style={{ width: `${prvW}%` }} />}
                        <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${isUp ? 'bg-red-300/60' : prevAmt > 0 ? 'bg-green-300/60' : 'bg-blue-300/60'}`} style={{ width: `${curW}%` }} />
                    </div>
                    {prevAmt > 0 && <span className="text-[8px] text-gray-400 font-mono shrink-0 tabular-nums whitespace-nowrap">prev: {(prevAmt >= 1000) ? `${(prevAmt/1000).toFixed(1)}k` : prevAmt.toFixed(0)}</span>}
                </div>
            </div>
        );
    };

    // 👑 横向柱状对比行
    const HBarRow = ({ g, onClick }: { g: CostGroup, onClick: () => void }) => {
        const prevAmt = g.prevAmount || 0;
        const delta = g.delta || 0;
        const deltaPct = g.deltaPct || 0;
        const maxVal = Math.max(g.amount, prevAmt, 1);
        const isUp = delta > 0;
        const isNew = prevAmt === 0 && g.amount > 0;
        return (
            <div onClick={onClick} className="py-2.5 sm:py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50/50 active:scale-[0.99] transition-all group px-1">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                    <span className="text-xs sm:text-sm font-bold text-gray-700 group-hover:text-[#1A1A1A] min-w-0 truncate flex-1">{g.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isNew ? <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">NEW</span>
                         : delta !== 0 && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{isUp ? '+' : ''}{deltaPct.toFixed(0)}%</span>}
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500"/>
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-gray-400 w-8 shrink-0 text-right">本月</span>
                        <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden"><div className={`h-full rounded ${isUp ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(2, (g.amount / maxVal) * 100)}%` }}></div></div>
                        <span className="text-[10px] sm:text-xs font-mono font-black text-[#1A1A1A] w-24 sm:w-28 text-right tabular-nums shrink-0">{formatMoney(g.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-gray-400 w-8 shrink-0 text-right">对比</span>
                        <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden"><div className="h-full bg-gray-300 rounded" style={{ width: `${Math.max(prevAmt > 0 ? 2 : 0, (prevAmt / maxVal) * 100)}%` }}></div></div>
                        <span className="text-[10px] sm:text-xs font-mono font-bold text-gray-400 w-24 sm:w-28 text-right tabular-nums shrink-0">{prevAmt > 0 ? formatMoney(prevAmt) : '-'}</span>
                    </div>
                </div>
            </div>
        );
    };

    // 👑 对比月份选择器
    const CompareSelector = () => (
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-200 shadow-sm mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#FFD700] shrink-0"/>
                    <span className="text-xs sm:text-sm font-black text-[#1A1A1A] uppercase tracking-wider">对比月份</span>
                </div>
                <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
                    {getCompareOptions().map(opt => (
                        <button key={opt.key} onClick={() => setCompareMonth(opt.key)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all active:scale-95 border ${compareMonth === opt.key ? 'bg-[#1A1A1A] text-[#FFD700] border-[#1A1A1A]' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                            {opt.label}
                        </button>
                    ))}
                    <input type="month" value={compareMonth} onChange={e => setCompareMonth(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold border border-gray-200 bg-gray-50 outline-none focus:border-[#1A1A1A] cursor-pointer w-32 sm:w-36"/>
                </div>
            </div>
            <p className="text-[9px] font-bold text-gray-400 mt-2">当前: {startDate.slice(0, 7)} vs 对比: {compareMonth}</p>
        </div>
    );

    // ========== 📐 Section Header Component ==========
    const SectionHeader = ({ num, bgColor, textColor, title, shortTitle, momValue, invertMoM = false }: { num: number, bgColor: string, textColor: string, title: string, shortTitle: string, momValue?: number, invertMoM?: boolean }) => (
        <div className="flex items-center justify-between mb-3 sm:mb-4 border-b border-gray-100 pb-2 sm:pb-3 gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full ${bgColor} ${textColor} flex items-center justify-center font-black text-[10px] sm:text-xs shrink-0`}>{num}</span>
                <h4 className="font-black text-[11px] sm:text-sm md:text-base text-[#1A1A1A] uppercase tracking-wider sm:tracking-widest leading-tight">
                    <span className="sm:hidden">{shortTitle}</span>
                    <span className="hidden sm:inline">{title}</span>
                </h4>
            </div>
            {momValue !== undefined && renderMoM(momValue, invertMoM)}
        </div>
    );

    return (
        
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:w-[95vw] md:h-[92vh] lg:max-w-7xl md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* --- HEADER --- */}
                <div className="bg-[#1A1A1A] px-3 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-4 sm:pb-4 sm:pt-[max(env(safe-area-inset-top),1rem)] md:px-5 md:pb-5 md:pt-[max(env(safe-area-inset-top),1.25rem)] flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700]">
                    <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                        <div className="bg-[#FFD700] text-black p-1.5 sm:p-2 md:p-2.5 rounded-lg sm:rounded-xl shadow-lg shrink-0"><PieChart size={18} className="sm:w-5 sm:h-5 md:w-6 md:h-6"/></div>
                        <div className="min-w-0">
                            <h3 className="font-serif font-black text-sm sm:text-base md:text-xl tracking-wide truncate">财务审计报表</h3>
                            <p className="text-[8px] sm:text-[9px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">FINANCIAL INTELLIGENCE</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
                        <button onClick={handleExportCSV} className="bg-[#1A1A1A] hover:bg-black text-[#FFD700] px-3 md:px-4 py-2 rounded-xl text-[10px] md:text-xs font-black items-center gap-2 shadow-lg transition-all active:scale-95 border border-[#FFD700]/30 hidden sm:flex">
                            <Table2 size={16}/> 导出 P&L (CSV)
                        </button>
                        <button onClick={handleExportPDF} disabled={isExporting} className="bg-white/10 hover:bg-white/20 text-white px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] md:text-xs font-bold flex items-center gap-1 sm:gap-1.5 md:gap-2 transition-all active:scale-95">
                            {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} <span className="hidden sm:inline">导出</span> PDF
                        </button>
                        <button onClick={onClose} className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors active:scale-95 -mr-0.5"><X size={20} className="sm:w-6 sm:h-6"/></button>
                    </div>
                </div>

                {/* --- DATE PICKER --- */}
                <div className="bg-white border-b border-gray-200 p-2.5 sm:p-3 md:p-4 flex flex-col md:flex-row gap-2.5 sm:gap-3 md:gap-4 shrink-0 shadow-sm z-10 items-center justify-between">
                    <div className="flex items-center bg-[#1A1A1A] rounded-xl p-1 shadow-inner border border-gray-800 w-full md:w-auto justify-between md:justify-start">
                        <button onClick={() => handleMonthChange(-1)} className="p-1.5 sm:p-2 text-gray-400 hover:text-[#FFD700] hover:bg-white/10 rounded-lg active:scale-95"><ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
                        <div className="flex flex-col items-center px-3 sm:px-4 md:px-6">
                            <div className="flex items-center gap-1.5 sm:gap-2 text-[#FFD700]"><Calendar size={12} className="sm:w-3.5 sm:h-3.5" /><span className="font-black text-xs sm:text-sm tracking-wider uppercase">{new Date(startDate).toLocaleString('en-US', { month: 'short', year: 'numeric' })}</span></div>
                            <span className="text-[8px] sm:text-[9px] text-gray-500 font-mono mt-0.5">{startDate} ~ {endDate}</span>
                        </div>
                        <button onClick={() => handleMonthChange(1)} className="p-1.5 sm:p-2 text-gray-400 hover:text-[#FFD700] hover:bg-white/10 rounded-lg active:scale-95"><ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
                    </div>

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-4 w-full md:w-auto">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 sm:gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1.5 sm:p-2 px-2 sm:px-3 flex-grow justify-center">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[10px] sm:text-[11px] md:text-xs font-bold outline-none w-full min-w-[80px] sm:min-w-[90px] cursor-pointer text-center text-gray-600"/>
                                <ArrowRight size={10} className="text-gray-300 shrink-0 sm:w-3 sm:h-3"/>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[10px] sm:text-[11px] md:text-xs font-bold outline-none w-full min-w-[80px] sm:min-w-[90px] cursor-pointer text-center text-gray-600"/>
                            </div>
                            <button onClick={() => setShowQuickDates(!showQuickDates)} className={`md:hidden px-2.5 py-1.5 rounded-xl border transition-all shrink-0 text-[10px] font-black tracking-widest ${showQuickDates ? 'bg-[#1A1A1A] text-[#FFD700]' : 'bg-gray-100 text-gray-500'}`}>快捷</button>
                        </div>
                        <div className={`${showQuickDates ? 'grid grid-cols-3' : 'hidden'} md:flex gap-1.5 md:gap-1 bg-gray-100 p-1.5 md:p-1 rounded-xl w-full md:w-auto animate-in slide-in-from-top-2 md:animate-none`}>
                            {[{ key: 'YESTERDAY', label: '昨日' }, { key: 'TODAY', label: '今日' }, { key: 'WEEK', label: '本周' }, { key: 'MONTH', label: '本月' }, { key: 'LAST_MONTH', label: '上月' }].map(t => (
                                <button key={t.key} onClick={() => { setQuickDate(t.key as any); setShowQuickDates(false); }} className="flex-1 md:flex-none px-2 py-1.5 md:py-1.5 bg-white shadow-sm rounded-lg text-[10px] font-bold text-gray-600 hover:text-[#1A1A1A] hover:bg-gray-50 active:scale-95 text-center truncate">{t.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* 👑 阶段一：模式切换器（从 Tab 内搬上来 + 加 Tooltip + 改人话标签） */}
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1 sm:p-1.5 px-2 sm:px-3 w-full md:w-auto justify-between md:justify-start shrink-0">
                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                            <span className="text-[9px] sm:text-[10px] text-gray-500 font-bold whitespace-nowrap">看账模式</span>
                            <span 
                                title={'业务发生：含未付供应商账单（看本月做了多少生意）\n现金实收：仅看已付款（看实际有多少钱进出）'}
                                className="bg-gray-200 hover:bg-gray-300 text-gray-500 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full inline-flex items-center justify-center text-[8px] sm:text-[9px] font-bold cursor-help transition-colors italic"
                            >i</span>
                        </div>
                        <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                            <button onClick={() => setAccountingMode('ACCRUAL')} className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black transition-all whitespace-nowrap ${accountingMode === 'ACCRUAL' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>业务发生</button>
                            <button onClick={() => setAccountingMode('CASH')} className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black transition-all whitespace-nowrap ${accountingMode === 'CASH' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>现金实收</button>
                        </div>
                    </div>
                </div>

                {/* --- SMART TAB BAR NAVIGATION (Apple HIG Touch target optimized: 44px height) --- */}
                <div className="bg-[#1A1A1A] border-b border-gray-800 px-2 py-1.5 shrink-0 sticky top-0 z-20 flex overflow-x-auto scrollbar-none items-center shadow-lg">
                    <div className="flex bg-[#2D2D2D] p-1 rounded-xl gap-1 w-full max-w-4xl mx-auto min-h-[44px]">
                        {([
                            { id: 'OVERVIEW', label: '📊 损益概览', desc: 'P&L Summary' },
                            { id: 'SALES', label: '💰 多维营收', desc: 'Sales Metrics' },
                            { id: 'COST', label: '🍗 开销审计', desc: 'Cost & Margin' },
                            { id: 'AUDIT', label: '🔍 审计流水', desc: 'Audit Ledger' },
                            { id: 'DIVIDEND', label: '👑 分红预算', desc: 'Dividend Plan' }
                        ] as const).map(tab => (
                             <button
                                 key={tab.id}
                                 type="button"
                                 onClick={() => {
                                     setActiveTab(tab.id);
                                     if (tab.id === 'OVERVIEW') {
                                         setExpandedCards(prev => ({ ...prev, PNL: true, DELIVERY: true }));
                                     } else if (tab.id === 'SALES') {
                                         setExpandedCards(prev => ({ ...prev, SALES: true }));
                                     } else if (tab.id === 'COST') {
                                         setExpandedCards(prev => ({ ...prev, COST: true, DELIVERY: true }));
                                     }
                                 }}
                                className={`flex-1 py-1 px-1.5 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center min-h-[38px] active:scale-95 cursor-pointer ${
                                    activeTab === tab.id
                                        ? 'bg-[#FFD700] text-black shadow-md'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <span className="text-[10px] sm:text-[11.5px] font-black whitespace-nowrap">{tab.label}</span>
                                <span className="text-[7.5px] opacity-75 font-mono hidden sm:inline">{tab.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* --- CONTENT AREA --- */}
                <div className="flex-grow overflow-y-auto p-2.5 sm:p-3 md:p-4 lg:p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] bg-[#F5F7FA] touch-pan-y">
                    {loading && standaloneExpenses.length === 0 && settlementRecords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-60 gap-3">
                            <Loader2 size={36} className="animate-spin text-amber-500"/>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest animate-pulse">正在提取财务审计数据...</p>
                        </div>
                    ) : (
                        <div className={`max-w-5xl mx-auto relative transition-all duration-300 ${loading ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
                            {loading && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-[#FFD700] text-[10px] font-black px-4 py-2 rounded-full shadow-2xl z-[999] flex items-center gap-2 border border-[#FFD700]/30 animate-bounce">
                                    <Loader2 size={12} className="animate-spin text-[#FFD700]"/>
                                    <span>同步最新数据中...</span>
                                </div>
                            )}
                            
                            {/* 👑 阶段二：KPI 驾驶舱 — 始终显示在所有卡片之上 */}
                            <div className="space-y-3 sm:space-y-4 md:space-y-5">
                                <div className="bg-[#1A1A1A] rounded-2xl sm:rounded-3xl p-4 sm:p-5 md:p-6 shadow-xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-48 h-48 bg-[#FFD700] opacity-5 rounded-full blur-3xl pointer-events-none"></div>

                                        <div className="flex justify-between items-end mb-3 sm:mb-4 relative z-10">
                                            <div>
                                                <p className="text-[#FFD700] text-[10px] sm:text-xs font-black tracking-widest uppercase">本月驾驶舱 · Dashboard</p>
                                                <p className="text-[8px] sm:text-[9px] text-gray-500 font-mono mt-0.5">As of {endDate}</p>
                                            </div>
                                            {(() => {
                                                // 👑 月初保护：少于 10 天数据不评级（数据不够稳定）
                                                const daysCount = analytics.settlementCount || 0;
                                                if (daysCount < 10) {
                                                    return (
                                                        <div className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border text-gray-500 bg-white/5 border-white/10">
                                                            <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider opacity-70 leading-none">数据积累中</p>
                                                            <p className="text-base sm:text-lg font-black font-mono leading-none mt-0.5">{daysCount}/10</p>
                                                        </div>
                                                    );
                                                }
                                                const anyDanger = analytics.margins.cogs > 45 || laborDeptAnalysis.laborMarginSynced > 32 || analytics.margins.opex > 22;
                                                const allHealthy = analytics.margins.cogs <= 45 && laborDeptAnalysis.laborMarginSynced <= 32 && analytics.margins.opex <= 22;
                                                const grade = anyDanger ? 'C' : !allHealthy ? 'B' : analytics.netMargin > 15 ? 'A+' : 'A';
                                                const gradeColor = anyDanger ? 'text-red-400 bg-red-500/15 border-red-500/30' : !allHealthy ? 'text-orange-400 bg-orange-500/15 border-orange-500/30' : 'text-green-400 bg-green-500/15 border-green-500/30';
                                                return (
                                                    <div className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border ${gradeColor}`}>
                                                        <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider opacity-70 leading-none">本月评级</p>
                                                        <p className="text-base sm:text-lg font-black font-mono leading-none mt-0.5">{grade}</p>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* 5 个核心 KPI */}
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-2.5 mb-4 sm:mb-5 relative z-10">
                                            {/* 总流水 */}
                                            <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-white/10">
                                                <p className="text-gray-400 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mb-1">总流水</p>
                                                <p className="text-white text-base sm:text-lg font-mono font-black tabular-nums leading-none">{(analytics.pnl.totalGrossRevenue/1000).toFixed(1)}k</p>
                                                <p className="text-gray-500 text-[8px] sm:text-[9px] mt-1 font-mono">RM Gross</p>
                                            </div>
                                            {/* 纯营收（金色高亮） */}
                                            <div className="bg-[#FFD700]/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-[#FFD700]/30">
                                                <p className="text-[#FFD700] text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mb-1">纯营收</p>
                                                <p className="text-[#FFD700] text-base sm:text-lg font-mono font-black tabular-nums leading-none">{(analytics.pnl.netRealizedRevenue/1000).toFixed(1)}k</p>
                                                <p className="text-amber-600 text-[8px] sm:text-[9px] mt-1">挤干外卖水分</p>
                                            </div>
                                            {/* 净利润 */}
                                            <div className={`rounded-lg sm:rounded-xl p-2.5 sm:p-3 border ${analytics.netProfit >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                                <p className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mb-1 ${analytics.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>净利润</p>
                                                <p className={`text-base sm:text-lg font-mono font-black tabular-nums leading-none ${analytics.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(analytics.netProfit/1000).toFixed(1)}k</p>
                                                <p className={`text-[8px] sm:text-[9px] mt-1 font-mono ${analytics.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net Profit</p>
                                            </div>
                                            {/* 净利率 */}
                                            <div className={`rounded-lg sm:rounded-xl p-2.5 sm:p-3 border ${analytics.netMargin >= 10 ? 'bg-green-500/10 border-green-500/30' : analytics.netMargin >= 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                                <p className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mb-1 ${analytics.netMargin >= 10 ? 'text-green-400' : analytics.netMargin >= 0 ? 'text-orange-400' : 'text-red-400'}`}>净利率</p>
                                                <p className={`text-base sm:text-lg font-mono font-black tabular-nums leading-none ${analytics.netMargin >= 10 ? 'text-green-400' : analytics.netMargin >= 0 ? 'text-orange-400' : 'text-red-400'}`}>{analytics.netMargin.toFixed(1)}%</p>
                                                <p className={`text-[8px] sm:text-[9px] mt-1 ${analytics.netMargin >= 20 ? 'text-green-600' : analytics.netMargin >= 10 ? 'text-green-600' : analytics.netMargin >= 0 ? 'text-orange-600' : 'text-red-600'}`}>{analytics.netMargin >= 20 ? '优秀' : analytics.netMargin >= 10 ? '健康' : analytics.netMargin >= 0 ? '偏低' : '亏损'}</p>
                                            </div>
                                            {/* vs 上月（手机端横跨2列） */}
                                            <div className={`col-span-2 md:col-span-1 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border ${analytics.mom.revenue >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                                <p className="text-gray-400 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mb-1">vs 上月</p>
                                                <p className={`text-base sm:text-lg font-mono font-black tabular-nums leading-none ${analytics.mom.revenue >= 0 ? 'text-green-400' : 'text-red-400'}`}>{analytics.mom.revenue >= 0 ? '↗' : '↘'} {Math.abs(analytics.mom.revenue).toFixed(1)}%</p>
                                                <p className={`text-[8px] sm:text-[9px] mt-1 ${analytics.mom.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>{analytics.mom.revenue >= 0 ? '营收增长' : '营收下滑'}</p>
                                            </div>
                                        </div>

                                        {/* 三大成本健康度微缩条 */}
                                        <div className="bg-white/5 rounded-lg sm:rounded-xl p-3 sm:p-3.5 border border-white/10 relative z-10">
                                            <div className="flex justify-between items-center mb-2.5 sm:mb-3">
                                                <p className="text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">三大成本健康度</p>
                                                <p className="text-[8px] sm:text-[9px] text-gray-500 font-mono">点击钻取明细 →</p>
                                            </div>

                                            <div className="space-y-2 sm:space-y-2.5">
                                                {[
                                                    { label: 'COGS', pct: analytics.margins.cogs, scale: 60, lowMark: 28, highMark: 45, type: 'COGS' as const, drillTitle: '销货成本 (COGS)' },
                                                    { label: 'Labor', pct: laborDeptAnalysis.laborMarginSynced, scale: 50, lowMark: 18, highMark: 32, type: 'LABOR' as const, drillTitle: '人工薪资 (Labor)' },
                                                    { label: 'OPEX', pct: analytics.margins.opex, scale: 40, lowMark: 0, highMark: 22, type: 'OPEX' as const, drillTitle: '门店运营支出 (OPEX)' }
                                                ].map(b => {
                                                    const isWarn = b.pct > b.highMark;
                                                    const isLow = b.label !== 'OPEX' && b.pct < b.lowMark;
                                                    const color = isWarn ? '#EF4444' : isLow ? '#F59E0B' : '#10B981';
                                                    const tagText = isWarn ? '偏高' : isLow ? '偏低' : '健康';
                                                    const tagBg = isWarn ? 'bg-red-500/15 text-red-400 border-red-500/30' : isLow ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-green-500/15 text-green-400 border-green-500/30';
                                                    const barWidth = Math.min(100, (b.pct / b.scale) * 100);
                                                    const lowMarkPos = (b.lowMark / b.scale) * 100;
                                                    const highMarkPos = (b.highMark / b.scale) * 100;
                                                    return (
                                                        <div key={b.label} onClick={() => handleDrillDown({ type: b.type }, b.drillTitle)} className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 active:scale-[0.98] transition-all">
                                                            <span className="text-gray-300 text-[10px] sm:text-xs font-bold w-12 sm:w-14 shrink-0">{b.label}</span>
                                                            <div className="flex-1 h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden relative">
                                                                <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barWidth}%`, background: color }}></div>
                                                                {b.lowMark > 0 && <div className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${lowMarkPos}%` }}></div>}
                                                                <div className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${highMarkPos}%` }}></div>
                                                            </div>
                                                            <span className="font-mono text-[10px] sm:text-xs font-bold w-10 sm:w-12 text-right tabular-nums shrink-0" style={{ color }}>{b.pct.toFixed(1)}%</span>
                                                            <span className={`text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded border ${tagBg} shrink-0`}>{tagText}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="flex justify-between items-center mt-2 sm:mt-2.5 pt-2 border-t border-white/5">
                                                <p className="text-gray-500 text-[8px] sm:text-[9px] font-mono leading-tight">| 标记 = 健康区间</p>
                                                <div className="flex gap-2 sm:gap-3">
                                                    <span className="text-gray-500 text-[8px] sm:text-[9px]"><span style={{ color: '#10B981' }}>●</span> 健康</span>
                                                    <span className="text-gray-500 text-[8px] sm:text-[9px]"><span style={{ color: '#F59E0B' }}>●</span> 留意</span>
                                                    <span className="text-gray-500 text-[8px] sm:text-[9px]"><span style={{ color: '#EF4444' }}>●</span> 警告</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                {/* ━━━━━━━ 👑 智能财务诊断与经营预警雷达 ━━━━━━━ */}
                                {activeTab === 'OVERVIEW' && (
                                    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden relative mb-4">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
                                    <button 
                                        type="button"
                                        onClick={() => setDiagnosisExpanded(v => !v)} 
                                        className="w-full p-4 flex items-center justify-between hover:bg-amber-50/10 active:bg-amber-50/20 transition-all cursor-pointer min-h-[44px]"
                                    >
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs sm:text-base shrink-0 shadow-sm">💡</div>
                                            <div className="text-left min-w-0">
                                                <div className="font-black text-sm sm:text-base text-gray-900 flex items-center gap-1.5 leading-tight">
                                                    <span>智能财务诊断与经营预警雷达</span>
                                                </div>
                                                <div className="text-[10px] sm:text-xs text-gray-400 font-bold truncate">结合销货、佣工、配送和周频的自动数据诊断建议</div>
                                            </div>
                                        </div>
                                        {diagnosisExpanded ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
                                    </button>

                                    {diagnosisExpanded && (
                                        <div className="border-t border-amber-100 p-3 sm:p-4 bg-amber-50/10 space-y-3 sm:space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                                
                                                {/* 1. COGS 菜品及水吧销货成本诊断 */}
                                                {(() => {
                                                    const cogsPct = analytics.margins.cogs;
                                                    const isHigh = cogsPct > 45;
                                                    const isLow = cogsPct < 28;
                                                    
                                                    let statusText = "健康";
                                                    let severityColor = "border-emerald-100 bg-emerald-50/30 text-emerald-950";
                                                    let badgeColor = "bg-emerald-500 text-white";
                                                    let icon = "✅";
                                                    
                                                    if (isHigh) {
                                                        statusText = "毛利流失警告";
                                                        severityColor = "border-rose-150 bg-rose-50/15 text-rose-950";
                                                        badgeColor = "bg-rose-550 text-white";
                                                        icon = "🚨";
                                                    } else if (isLow) {
                                                        statusText = "高毛利运营";
                                                        severityColor = "border-amber-100 bg-amber-50/15 text-amber-950";
                                                        badgeColor = "bg-amber-550 text-gray-950";
                                                        icon = "⚠️";
                                                    }
                                                    
                                                    const topSeafood = analytics.lists?.cogsList?.find(c => c.id === 'INGREDIENT_SEAFOOD');
                                                    const topBeverage = analytics.lists?.cogsList?.find(c => c.id === 'BEVERAGE');

                                                    return (
                                                        <div className={`p-3 rounded-xl border ${severityColor} space-y-1.5`}>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs sm:text-sm font-black flex items-center gap-1">{icon} 菜品成本占流水比分摊 (COGS)</span>
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badgeColor}`}>{statusText}</span>
                                                            </div>
                                                            <div className="space-y-1 text-[11px] sm:text-xs leading-relaxed text-gray-650 font-semibold">
                                                                <p className="font-black text-gray-800">
                                                                    本期销货成本占比分摊为 <span className="font-mono text-xs sm:text-sm font-black text-rose-850">{cogsPct.toFixed(1)}%</span>
                                                                    {isHigh ? "，偏高建议调价或严控采购耗损。" : isLow ? "，由于主营产品结构的高获利点（如水吧咖啡、海鲜特选配比）或应付漏盘点，利润护城河较厚。" : "，整体处于 28% ~ 45% 的科学控制中。"}
                                                                </p>
                                                                {isHigh && (
                                                                    <div className="mt-1 bg-white/70 p-2.5 rounded-lg border border-red-50 text-[10px] sm:text-[11px] text-gray-700 font-bold space-y-1">
                                                                        <p className="text-red-750">⚠️ F&B 厨房升级建议: </p>
                                                                        <p>1. 建议将供应链物料领用改采用周配制与定额领料，降低周中厨房食材多余囤积造成的常温/冷库耗损；</p>
                                                                        {topSeafood && <p>2. 当前海鲜类支出中 【{topSeafood.label}】 消费最高（占比 {topSeafood.pct.toFixed(0)}%），建议启动定向询盘议价或锁定特惠主供应商协议价格；</p>}
                                                                        {topBeverage && <p>3. 水吧大项中 【{topBeverage.label}】 支出最为突出，请财务人员和店主加强抽查冲调比配方的理论耗用与实际核差。</p>}
                                                                    </div>
                                                                )}
                                                                {isLow && (
                                                                    <p className="text-[10px] sm:text-[11px] text-gray-500 italic mt-1">💡 检查建议: 销货成本低于常值。1. 检查进店供应商应付发票 (AP Bills) 是否漏填、跨月；2. 审查后厨份量标准是否有客诉，防止客流复购率在不知觉中遭受侵蚀。</p>
                                                                )}
                                                                {!isHigh && !isLow && (
                                                                    <p className="text-[10px] sm:text-[11px] text-emerald-700 font-semibold mt-1">✨ 当前菜品出产和耗用掌控优异。二级水吧与大头海鲜等主分类采办配对健康，建议继续严格执行月度常规盘点。</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* 2. Labor 人工成本诊断 */}
                                                {(() => {
                                                    const laborMarginVal = laborDeptAnalysis?.laborMarginSynced || 0;
                                                    const isHigh = laborMarginVal > 32;
                                                    const isLow = laborMarginVal < 18;
                                                    
                                                    let statusText = "健康";
                                                    let severityColor = "border-emerald-100 bg-emerald-50/30 text-emerald-950";
                                                    let badgeColor = "bg-emerald-500 text-white";
                                                    let icon = "✅";
                                                    
                                                    if (isHigh) {
                                                        statusText = "高人效红牌";
                                                        severityColor = "border-rose-150 bg-rose-50/15 text-rose-950";
                                                        badgeColor = "bg-rose-550 text-white";
                                                        icon = "🚨";
                                                    } else if (isLow) {
                                                        statusText = "工时数据漏录/用工缺口";
                                                        severityColor = "border-amber-100 bg-amber-50/15 text-amber-950";
                                                        badgeColor = "bg-amber-550 text-gray-950";
                                                        icon = "⚠️";
                                                    }

                                                    return (
                                                        <div className={`p-3 rounded-xl border ${severityColor} space-y-1.5`}>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs sm:text-sm font-black flex items-center gap-1">{icon} 人工薪资 (Labor)</span>
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badgeColor}`}>{statusText}</span>
                                                            </div>
                                                            <div className="space-y-1 text-[11px] sm:text-xs leading-relaxed text-gray-650 font-semibold">
                                                                <p className="font-black text-gray-800">
                                                                    本期人效成本占比分摊为 <span className="font-mono text-xs sm:text-sm font-black text-amber-750">{laborMarginVal.toFixed(1)}%</span>
                                                                    {isHigh ? "，高出租金和经营承载比率。" : isLow ? "，处于超负荷低安全区。" : "，配置在 18% ~ 32% 黄金结构内。"}
                                                                </p>
                                                                {isHigh && (
                                                                    <div className="mt-1 bg-white/60 p-2.5 rounded-lg border border-red-50 text-[10px] sm:text-[11px] text-gray-700 font-bold space-y-1">
                                                                        <p className="text-red-750">⚠️ 排班与薪酬结构升级政策: </p>
                                                                        <p>1. 固定佣工重叠。建议对周一至周三非活跃经营日的非营业峰谷（如下午 14:00-17:00）多设“一人前厅”单人守护，将厨房备料移入午前提前消化；</p>
                                                                        <p>2. 当前人效日均开支 RM {formatMoney(dailyLaborBreakdown.perEmployeeDaily)}，可合理提倡基础工兼职化，并使用前厅销售提成变固定转浮动提振士气。</p>
                                                                    </div>
                                                                )}
                                                                {isLow && (
                                                                    <p className="text-[10px] sm:text-[11px] text-gray-500 italic mt-1">💡 检查建议: 1. 请在 Payroll 管理端核实当月员工出勤及补贴、扣减是否准确完成并予以 PAID 确认。</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* 3. Delivery Cost 外卖配送与引流扣减分析 */}
                                                {(() => {
                                                    const deliveryPct = (analytics.revenueDetails?.totalGrossRevenue || 0) > 0 ? ((analytics.revenueDetails?.deliveryGross || 0) / (analytics.revenueDetails?.totalGrossRevenue || 1) * 100) : 0;
                                                    const isHigh = deliveryPct > 20;
                                                    
                                                    let statusText = "配送占比适中";
                                                    let severityColor = "border-zinc-150 bg-zinc-55/10 text-zinc-950";
                                                    let badgeColor = "bg-zinc-100 text-zinc-700";
                                                    
                                                    if (isHigh) {
                                                        statusText = "高外卖依赖(佣扣侵蚀)";
                                                        severityColor = "border-indigo-150 bg-indigo-50/15 text-indigo-950";
                                                        badgeColor = "bg-indigo-650 text-white";
                                                    }
                                                    
                                                    return (
                                                        <div className={`p-3 rounded-xl border ${severityColor} space-y-1.5`}>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs sm:text-sm font-black flex items-center gap-1">🛵 外卖配送及佣金扣减</span>
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badgeColor}`}>{statusText}</span>
                                                            </div>
                                                            <div className="space-y-1 text-[11px] sm:text-xs leading-relaxed text-gray-650 font-semibold">
                                                                <p className="font-black text-gray-800">
                                                                    配送及外送引流成本占总流水流水占比为 <span className="font-mono text-xs sm:text-sm font-black text-indigo-850">{deliveryPct.toFixed(1)}%</span>。
                                                                </p>
                                                                {isHigh ? (
                                                                    <div className="mt-1 bg-white/60 p-2.5 rounded-lg border border-indigo-50 text-[10px] sm:text-[11px] text-gray-700 font-bold space-y-1">
                                                                        <p className="text-indigo-750">⚠️ 配送升级策略建议: </p>
                                                                        <p>1. 外卖佣费点位高。建议推出高客单价的“三人/五人商务家庭桶套餐”，通过搭配高利润无糖茶饮和即食甜点，分摊配送固定佣扣；</p>
                                                                        <p>2. 平日引流可加入特定的限时商区“免起送自提专案”，使社群用户向直营线上通道迁移。</p>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-[10px] sm:text-[11px] text-gray-500 font-medium mt-1">堂食聚客和散客买单比例健康，外卖佣金成本几乎未稀释店里利润主干，摆脱了外卖流量算法和强制溢价抽成的制约。</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* 4. Weekly Cycle 周期性经营诊断 */}
                                                {(() => {
                                                    const weekendAvg = analytics?.insights?.avgWeekend || 0;
                                                    const weekdayAvg = analytics?.insights?.avgWeekday || 0;
                                                    const ratio = weekdayAvg > 0 ? (weekendAvg / weekdayAvg) : 1;
                                                    const isWeekendStrong = ratio > 1.15;
                                                    const isWeekdayStrong = ratio < 0.9;
                                                    
                                                    let statusText = "全时段均匀";
                                                    let severityColor = "border-zinc-150 bg-zinc-55/10 text-zinc-950";
                                                    let icon = "📊";
                                                    
                                                    if (isWeekendStrong) {
                                                        statusText = "周末经济爆火";
                                                        severityColor = "border-amber-100 bg-amber-50/15 text-amber-950";
                                                        icon = "🎉";
                                                    } else if (isWeekdayStrong) {
                                                        statusText = "白领办公主力客";
                                                        severityColor = "border-blue-105 bg-blue-50/15 text-blue-950";
                                                        icon = "💼";
                                                    }

                                                    return (
                                                        <div className={`p-3 rounded-xl border ${severityColor} space-y-1.5`}>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs sm:text-sm font-black flex items-center gap-1">{icon} 日常营收周期评估</span>
                                                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{statusText}</span>
                                                            </div>
                                                            <div className="space-y-1 text-[11px] sm:text-xs leading-relaxed text-gray-650 font-semibold">
                                                                {weekendAvg > 0 && weekdayAvg > 0 ? (
                                                                    <>
                                                                        <p className="font-black text-gray-800">
                                                                            周末日均 RM <span className="font-mono">{weekendAvg.toFixed(0)}</span> vs 工作日日均 RM <span className="font-mono">{weekdayAvg.toFixed(0)}</span> (系数差值 <span className="font-mono text-xs sm:text-sm font-black text-amber-800">{ratio.toFixed(2)}倍</span>)。
                                                                        </p>
                                                                        {isWeekendStrong && (
                                                                            <p className="text-[10px] sm:text-[11px] text-amber-800 font-bold mt-1 bg-white/60 p-2 rounded-lg border border-amber-100">
                                                                                💡 排班提议: 周末客群极其依赖。前厅及收银等人员请向“周五夜市-周日全天”重点加仓排班。平日(周一至周四)则果断下调15-20%兼职工时，预防空负荷人工成本摩擦。
                                                                            </p>
                                                                        )}
                                                                        {isWeekdayStrong && (
                                                                            <p className="text-[10px] sm:text-[11px] text-blue-800 font-bold mt-1 bg-white/60 p-2 rounded-lg border border-blue-100">
                                                                                💡 提振提议: 商务顾客为主。周六日店铺铺租闲置。可制定特定“周末会员日”，不定期推出家庭团聚饮品免费升大杯或特种海鲜买一赠一，调动假日沉睡流量。
                                                                            </p>
                                                                        )}
                                                                        {!isWeekendStrong && !isWeekdayStrong && (
                                                                            <p className="text-[10px] sm:text-[11px] text-zinc-650 italic mt-1">
                                                                                客流曲线极度顺滑。这意味顾客复购粘性、日常高频率刚需用餐属性极其稳固，基本免受大商区特定通勤周期影响，抗业务震荡基础非常好。
                                                                            </p>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <p className="text-[10px] sm:text-[11px] text-gray-400 italic">正在持续搜集周内各阶段经营指标，请导入结算数据，报表会自动开始两端人效与特定套餐排程评估。</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                            </div>
                                            
                                            {/* 月底亏损一键追赶目标测算提示 */}
                                            {dailyLaborBreakdown.hasValidData && dailyLaborBreakdown.projectedNetProfit < 0 && dailyLaborBreakdown.remainingDays > 0 && (
                                                <div className="bg-rose-50 border-2 border-rose-350 rounded-xl p-3 sm:p-4 text-xs space-y-2">
                                                    <p className="text-rose-955 font-black text-sm flex items-center gap-1">🎯 营业追赶目标与月底扭亏测算</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-gray-700 font-bold text-center">
                                                        <div className="bg-white p-2 rounded-lg border border-rose-100">
                                                            <p className="text-[9px] text-gray-500 font-black">满账预估缺口</p>
                                                            <p className="text-xs sm:text-sm font-mono font-black text-rose-650 tabular-nums">{formatMoney(Math.abs(dailyLaborBreakdown.projectedNetProfit))}</p>
                                                        </div>
                                                        <div className="bg-white p-2 rounded-lg border border-rose-100">
                                                            <p className="text-[9px] text-gray-500 font-black">当月剩余时间</p>
                                                            <p className="text-xs sm:text-sm font-mono font-black text-gray-950 tabular-nums">{dailyLaborBreakdown.remainingDays} 天</p>
                                                        </div>
                                                        <div className="bg-white p-2 rounded-lg border border-rose-100">
                                                            <p className="text-[9px] text-gray-500 font-black">扭亏追赶单日达成目标</p>
                                                            <p className="text-xs sm:text-sm font-mono font-black text-rose-700 tabular-nums">{formatMoney(dailyLaborBreakdown.catchUpDailyRevenue)}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] sm:text-[11px] text-rose-800 font-bold mt-1.5 leading-relaxed bg-white/70 p-2 rounded-lg border border-rose-100/60 shadow-sm">
                                                        💡 扭亏回本极速路径: 相较目前的日营业额主线 RM {formatMoney(dailyLaborBreakdown.avgDailyRevenue)}，只需在余下的较短天数内，每天利用高毛利水吧加赠券、外卖首单特惠引流新客、或企业宴席团配提前交付，多获得少量高热流水，便能成功护航全月财务扳平，撤回盈利绿化带以上。
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                )}

                                {/* ━━━━━━━ 卡 1：损益 P&L ━━━━━━━ */}
                                {activeTab === 'OVERVIEW' && (
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <button onClick={() => toggleCard('PNL')} className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors">
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1A1A1A] text-[#FFD700] flex items-center justify-center font-black text-xs sm:text-sm shrink-0">P</div>
                                            <div className="text-left min-w-0">
                                                <div className="font-black text-sm sm:text-base text-[#1A1A1A]">损益 P&L</div>
                                                <div className="text-[10px] sm:text-xs text-gray-400 font-bold truncate">本月净利 {formatMoney(analytics.netProfit)} · 净利率 {analytics.netMargin.toFixed(1)}%</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${analytics.netProfit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{analytics.netProfit >= 0 ? '+' : ''}{(analytics.netProfit/1000).toFixed(1)}k</span>
                                            {expandedCards.PNL ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                                        </div>
                                    </button>
                                     {expandedCards.PNL && (
                                         <div className="border-t border-gray-100 p-3 sm:p-4 space-y-3 sm:space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">

                                             {/* 👑 增设：损益全链路金流级级递减瀑布图 (P&L Progressive Waterfall) */}
                                             <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3.5 sm:p-4 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                                                 <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
                                                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                                     <div>
                                                         <div className="flex items-center gap-1.5">
                                                             <span className="text-xs sm:text-sm font-black text-gray-900">📊 损益金流递减级联瀑布图</span>
                                                             <span className="text-[8px] sm:text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">Interactive</span>
                                                         </div>
                                                         <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold mt-0.5">以营业总流水为 100% 基准，向下递减分析各层级损耗与各项核心开销占比：</p>
                                                     </div>
                                                     <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm self-start sm:self-center">
                                                         <button 
                                                             type="button"
                                                             onClick={() => setWaterfallMode('AMOUNT')} 
                                                             className={`px-2 py-1 rounded text-[9px] sm:text-[10px] font-black transition-all ${waterfallMode === 'AMOUNT' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                         >
                                                             金额
                                                         </button>
                                                         <button 
                                                             type="button"
                                                             onClick={() => setWaterfallMode('PERCENT')} 
                                                             className={`px-2 py-1 rounded text-[9px] sm:text-[10px] font-black transition-all ${waterfallMode === 'PERCENT' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                         >
                                                             占比
                                                         </button>
                                                     </div>
                                                 </div>

                                                 {/* Waterfall cascading steps */}
                                                 <div className="space-y-2 sm:space-y-2.5">
                                                     {(() => {
                                                         const totalGross = analytics.pnl.totalGrossRevenue || 1;
                                                         const deliveryCost = analytics.pnl.totalDeliveryDirectCost;
                                                         const netRealized = analytics.pnl.netRealizedRevenue;
                                                         const cogs = analytics.costs.totalCOGS;
                                                         const labor = laborDeptAnalysis.actualLabor || 0;
                                                         const opex = analytics.costs.totalOPEX;
                                                         const netProfit = analytics.netProfit;
                                                         const netCash = analytics.netCashFlow;

                                                         const getBarWidth = (val: number) => {
                                                             return Math.max(2, Math.min(100, (Math.abs(val) / totalGross) * 100));
                                                         };

                                                         const steps = [
                                                             {
                                                                 title: '营业总流水 (Gross Revenue)',
                                                                 desc: '门店堂食与外卖渠道账面总流水之和',
                                                                 amount: totalGross,
                                                                 color: 'bg-blue-500',
                                                                 textColor: 'text-blue-700 font-black',
                                                                 pct: '100%',
                                                                 type: 'INCOME',
                                                                 emoji: '💰'
                                                             },
                                                             {
                                                                 title: '外卖平台渠道损耗 (Platform Fees)',
                                                                 desc: '各平台(Grab/Panda/Shopee)抽佣、派送费、平台广告及调节费',
                                                                 amount: -deliveryCost,
                                                                 color: 'bg-rose-400',
                                                                 textColor: 'text-rose-600 font-bold',
                                                                 pct: `-${((deliveryCost / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'EXPENSE',
                                                                 emoji: '🛵'
                                                             },
                                                             {
                                                                 title: '实收落袋总额 (Net Realized Revenue)',
                                                                 desc: '挤干外卖渠道扣费、真正到账的实际营业资金',
                                                                 amount: netRealized,
                                                                 color: 'bg-blue-600',
                                                                 textColor: 'text-blue-800 font-black',
                                                                 pct: `${((netRealized / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'INTERMEDIATE',
                                                                 emoji: '📥'
                                                             },
                                                             {
                                                                 title: '原材料物料成本 (COGS)',
                                                                 desc: '厨房食材消耗、原料采购、饮品制作及后厨耗损等直接成本',
                                                                 amount: -cogs,
                                                                 color: 'bg-amber-500',
                                                                 textColor: 'text-amber-700 font-bold',
                                                                 pct: `-${((cogs / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'EXPENSE',
                                                                 emoji: '🥩'
                                                             },
                                                             {
                                                                 title: '员工人工薪资总额 (Labor Costs)',
                                                                 desc: '员工底薪、提成、加班费、公积金等期间分摊值 (含预估)',
                                                                 amount: -labor,
                                                                 color: 'bg-amber-500',
                                                                 textColor: 'text-amber-700 font-bold',
                                                                 pct: `-${((labor / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'EXPENSE',
                                                                 emoji: '🧑‍🍳'
                                                             },
                                                             {
                                                                 title: '门店日常运营杂费 (OPEX)',
                                                                 desc: '铺位租金、商业水电费、营销推广费、执照事务行政开支等',
                                                                 amount: -opex,
                                                                 color: 'bg-amber-500',
                                                                 textColor: 'text-amber-700 font-bold',
                                                                 pct: `-${((opex / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'EXPENSE',
                                                                 emoji: '⚡'
                                                             },
                                                             {
                                                                 title: '本月经营净利润 (Net Profit)',
                                                                 desc: '门店全部日常运营指标统算后的最终盈利结果',
                                                                 amount: netProfit,
                                                                 color: netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500',
                                                                 textColor: netProfit >= 0 ? 'text-emerald-700 font-black' : 'text-red-700 font-black',
                                                                 pct: `${((netProfit / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'RESULT',
                                                                 emoji: netProfit >= 0 ? '📈' : '📉'
                                                             },
                                                             {
                                                                 title: '自由现金流 (Net Cash Flow)',
                                                                 desc: '经营净利外计入现金盘点差异，并抵扣资产性购置与分红派发',
                                                                 amount: netCash,
                                                                 color: netCash >= 0 ? 'bg-purple-500' : 'bg-red-600',
                                                                 textColor: netCash >= 0 ? 'text-purple-700 font-black' : 'text-red-800 font-black',
                                                                 pct: `${((netCash / totalGross) * 100).toFixed(1)}%`,
                                                                 type: 'FINAL',
                                                                 emoji: '🏦'
                                                             }
                                                         ];

                                                         return steps.map((item, idx) => {
                                                             const isMinus = item.amount < 0;
                                                             const widthVal = getBarWidth(item.amount);
                                                             const valueText = waterfallMode === 'AMOUNT' 
                                                                 ? `${isMinus ? '-' : '+'}${formatMoney(Math.abs(item.amount))}` 
                                                                 : item.pct;

                                                             return (
                                                                 <div key={idx} className="bg-white rounded-xl p-2 sm:p-2.5 border border-gray-100 hover:border-gray-200 transition-all flex flex-col gap-1 shadow-xs">
                                                                     <div className="flex justify-between items-start gap-1.5">
                                                                         <div className="flex gap-1.5 min-w-0">
                                                                             <span className="text-xs sm:text-sm mt-0.5">{item.emoji}</span>
                                                                             <div className="min-w-0">
                                                                                 <div className="text-[10px] sm:text-[11px] font-black text-gray-800 leading-tight truncate">{item.title}</div>
                                                                                 <div className="text-[8px] sm:text-[9px] text-gray-400 font-bold truncate leading-none mt-0.5">{item.desc}</div>
                                                                             </div>
                                                                         </div>
                                                                         <div className="shrink-0 text-right">
                                                                             <span className={`text-[10px] sm:text-xs font-mono font-black ${item.textColor}`}>{valueText}</span>
                                                                         </div>
                                                                     </div>
                                                                     <div className="w-full h-1.5 sm:h-2 bg-gray-50 rounded-full overflow-hidden mt-1 relative border border-gray-100">
                                                                         <div 
                                                                             className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                                                                             style={{ width: `${widthVal}%` }}
                                                                         />
                                                                     </div>
                                                                 </div>
                                                             );
                                                         });
                                                     })()}
                                                 </div>
                                             </div>

                                    {/* Layer 1: Gross */}
                                    <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                                        <SectionHeader num={1} bgColor="bg-blue-100" textColor="text-blue-700" title="营业总收入 (Gross Revenue)" shortTitle="营业总收入" momValue={analytics.mom.revenue} />
                                        
                                        <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-2">
                                            <span className="font-bold text-gray-500 text-xs sm:text-sm min-w-0 leading-tight">门店终端营收 (In-Store)</span>
                                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                <span className="text-[9px] sm:text-[10px] bg-gray-100 px-1 sm:px-1.5 py-0.5 rounded font-bold text-gray-500 tabular-nums">{((analytics.revenueDetails.inStoreSales / analytics.pnl.totalGrossRevenue) * 100 || 0).toFixed(1)}%</span>
                                                <span className="font-mono font-bold text-[#1A1A1A] text-xs sm:text-sm tabular-nums">{formatMoney(analytics.revenueDetails.inStoreSales)}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="pt-2.5 sm:pt-3 border-t border-dashed border-gray-200 flex justify-between items-center mt-2">
                                            <span className="text-[10px] sm:text-xs font-black text-gray-400 uppercase">Total In-Store (纯门店收入)</span>
                                            <span className="font-mono text-lg sm:text-xl font-black text-[#1A1A1A] tabular-nums">{formatMoney(analytics.revenueDetails.inStoreSales)}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-center -my-1 sm:-my-2 relative z-10"><TrendingDown size={20} className="sm:w-6 sm:h-6 text-gray-300"/></div>

                                    {/* Layer 2: Delivery Profitability (重命名并移入Gross) */}
                                    <div className="bg-orange-50/50 p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-orange-100 shadow-sm">
                                        <div className="flex justify-between items-center mb-3 sm:mb-4 border-b border-orange-200/50 pb-2 sm:pb-3 gap-2">
                                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center font-black text-[10px] sm:text-xs shrink-0">2</span>
                                                <h4 className="font-black text-[11px] sm:text-sm md:text-base text-orange-900 uppercase tracking-wider sm:tracking-widest leading-tight">
                                                    <span className="sm:hidden">外卖盈亏分析</span>
                                                    <span className="hidden sm:inline">外卖盈亏分析 (Delivery Profitability)</span>
                                                </h4>
                                            </div>
                                            <button onClick={() => handleDrillDown({ type: 'DELIVERY_COST' }, '外卖损耗明细')} className="text-[9px] sm:text-[10px] bg-orange-100 text-orange-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-bold active:scale-95 transition-transform border border-orange-200 shrink-0">查看明细</button>
                                        </div>
                                        
                                        {/* 👑 移入这里的账面总计 */}
                                        <div className="bg-white p-3 rounded-xl border border-orange-100 mb-3 flex justify-between items-center shadow-sm">
                                            <span className="font-black text-orange-900 text-xs sm:text-sm">外卖账面总流水 (Delivery Gross)</span>
                                            <span className="font-mono font-black text-orange-600 text-sm sm:text-base tabular-nums">+{formatMoney(analytics.revenueDetails.deliveryGross)}</span>
                                        </div>

                                        <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm pl-2 pr-2">
                                            {analytics.pnl.grabCommission > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - Grab 抽佣</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.grabCommission)}</span></div>}
                                            {analytics.pnl.grabAds > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - Grab 广告</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.grabAds)}</span></div>}
                                            
                                            {analytics.pnl.pandaCommission > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - FoodPanda 抽佣</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.pandaCommission)}</span></div>}
                                            {analytics.pnl.pandaAds > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - FoodPanda 广告</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.pandaAds)}</span></div>}
                                            {analytics.pnl.pandaFees > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - FoodPanda 调节费/服务自单</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.pandaFees)}</span></div>}
                                            
                                            {analytics.pnl.shopeeCommission > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - ShopeeFood 抽佣</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.shopeeCommission)}</span></div>}
                                            {analytics.pnl.shopeeAds > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - ShopeeFood 广告</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.shopeeAds)}</span></div>}
                                            {analytics.pnl.shopeeFees > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - ShopeeFood 平台费/调节费</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.shopeeFees)}</span></div>}
                                            
                                            {analytics.pnl.otherPlatformFees > 0 && <div className="flex justify-between items-center gap-2"><span className="font-bold text-orange-700/80 min-w-0 truncate"> - 其他平台费用</span><span className="font-mono font-bold text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.pnl.otherPlatformFees)}</span></div>}
                                        </div>
                                        <div className="pt-2.5 sm:pt-3 border-t border-orange-200 flex justify-between items-center mt-2 sm:mt-3 gap-2">
                                            <span className="text-[10px] sm:text-xs font-black text-orange-600 uppercase tracking-widest">= 真实落袋 (Net Delivery)</span>
                                            <span className="font-mono text-base sm:text-lg font-black text-orange-600 shrink-0 tabular-nums">{formatMoney(Math.max(0, analytics.revenueDetails.deliveryGross - analytics.pnl.totalDeliveryDirectCost))}</span>
                                        </div>
                                    </div>

                                    {/* Layer 3: Net Realized */}
                                    <div className="bg-[#1A1A1A] p-5 sm:p-6 md:p-8 rounded-2xl sm:rounded-[2rem] shadow-xl relative overflow-hidden my-3 sm:my-4 md:my-6 flex flex-col items-center justify-center">
                                        <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-[#FFD700] opacity-10 rounded-full blur-3xl pointer-events-none"></div>
                                        
                                        <div className="relative z-10 w-full">
                                            <div className="flex justify-between items-start w-full mb-2 gap-2">
                                                <div className="text-left min-w-0">
                                                    <p className="text-[10px] sm:text-xs md:text-sm font-black text-[#FFD700] uppercase tracking-wider sm:tracking-widest leading-tight">
                                                        <span className="sm:hidden">3. 纯营收</span>
                                                        <span className="hidden sm:inline">3. 纯营收 (扣完外卖损耗)</span>
                                                    </p>
                                                    <p className="text-[9px] sm:text-[10px] text-gray-400 mt-1 leading-tight">真正落袋的资金池</p>
                                                </div>
                                                <div className="shrink-0">
                                                    {renderMoM(analytics.mom.netRealized)}
                                                </div>
                                            </div>
                                            <p className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white font-mono tracking-tighter mt-3 sm:mt-4 text-center tabular-nums">{formatMoney(analytics.pnl.netRealizedRevenue)}</p>
                                        </div>
                                    </div>

                                    {/* Layer 4: OPEX */}
                                    <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200 shadow-sm">
                                        <SectionHeader num={4} bgColor="bg-red-100" textColor="text-red-700" title="门店各项支出 (Store Costs)" shortTitle="门店支出" momValue={analytics.mom.storeCosts} invertMoM={true} />
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 md:gap-4 mb-3 sm:mb-4">
                                            <div className="p-2.5 sm:p-3 bg-gray-50 rounded-xl border border-gray-100 flex sm:flex-col justify-between sm:justify-start items-center sm:items-stretch gap-2">
                                                <div className="flex sm:flex-col items-center sm:items-start gap-1.5 sm:gap-0 min-w-0">
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase shrink-0">COGS</span>
                                                    <div className="sm:hidden">{renderMoM(analytics.mom.cogs, true)}</div>
                                                    <div className="hidden sm:flex sm:justify-between sm:items-start sm:mb-1 sm:mt-1">{renderMoM(analytics.mom.cogs, true)}</div>
                                                </div>
                                                <div className="text-right sm:text-left">
                                                    <div className="font-mono text-sm sm:text-base md:text-lg font-black text-[#1A1A1A] tabular-nums">{formatMoney(analytics.costs.totalCOGS)}</div>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-red-400 bg-red-50 px-1 sm:px-1.5 py-0.5 rounded inline-block mt-0.5">占 {analytics.margins.cogs.toFixed(1)}%</span>
                                                </div>
                                            </div>
                                            <div className="p-2.5 sm:p-3 bg-gray-50 rounded-xl border border-gray-100 flex sm:flex-col justify-between sm:justify-start items-center sm:items-stretch gap-2">
                                                <div className="flex sm:flex-col items-center sm:items-start gap-1.5 sm:gap-0 min-w-0">
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase shrink-0">Labor</span>
                                                    <div className="sm:hidden">{renderMoM(analytics.mom.labor, true)}</div>
                                                    <div className="hidden sm:flex sm:justify-between sm:items-start sm:mb-1 sm:mt-1">{renderMoM(analytics.mom.labor, true)}</div>
                                                </div>
                                                <div className="text-right sm:text-left">
                                                    <div className="font-mono text-sm sm:text-base md:text-lg font-black text-[#1A1A1A] tabular-nums">{formatMoney(analytics.costs.totalLabor)}</div>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-red-400 bg-red-50 px-1 sm:px-1.5 py-0.5 rounded inline-block mt-0.5">占 {analytics.margins.labor.toFixed(1)}%</span>
                                                </div>
                                            </div>
                                            <div className="p-2.5 sm:p-3 bg-gray-50 rounded-xl border border-gray-100 flex sm:flex-col justify-between sm:justify-start items-center sm:items-stretch gap-2">
                                                <div className="flex sm:flex-col items-center sm:items-start gap-1.5 sm:gap-0 min-w-0">
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase shrink-0">OPEX</span>
                                                    <div className="sm:hidden">{renderMoM(analytics.mom.opex, true)}</div>
                                                    <div className="hidden sm:flex sm:justify-between sm:items-start sm:mb-1 sm:mt-1">{renderMoM(analytics.mom.opex, true)}</div>
                                                </div>
                                                <div className="text-right sm:text-left">
                                                    <div className="font-mono text-sm sm:text-base md:text-lg font-black text-[#1A1A1A] tabular-nums">{formatMoney(analytics.costs.totalOPEX)}</div>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-red-400 bg-red-50 px-1 sm:px-1.5 py-0.5 rounded inline-block mt-0.5">占 {analytics.margins.opex.toFixed(1)}%</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-2.5 sm:pt-3 border-t border-gray-200 flex justify-between items-center mt-2">
                                            <span className="text-[10px] sm:text-xs font-black text-red-800 uppercase">Total Store Costs</span>
                                            <span className="font-mono text-lg sm:text-xl font-black text-red-800 tabular-nums">-{formatMoney(analytics.costs.totalStoreCosts)}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-center -my-1 sm:-my-2 relative z-10"><TrendingDown size={20} className="sm:w-6 sm:h-6 text-gray-300"/></div>

                                    {/* Layer 5: Net Profit */}
                                    <div className={`${analytics.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border shadow-sm`}>
                                        <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 border-b border-emerald-200/50 pb-2 sm:pb-3">
                                            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-black text-[10px] sm:text-xs shrink-0 ${analytics.netProfit >= 0 ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`}>5</span>
                                            <h4 className={`font-black text-[11px] sm:text-sm md:text-base uppercase tracking-wider sm:tracking-widest leading-tight ${analytics.netProfit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                                                <span className="sm:hidden">经营净利润</span>
                                                <span className="hidden sm:inline">经营净利润 (Net Profit)</span>
                                            </h4>
                                        </div>
                                        <div className="flex justify-between items-center mb-2 sm:mb-3 gap-2">
                                            <span className={`text-[10px] sm:text-xs font-bold leading-tight ${analytics.netProfit >= 0 ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                                                <span className="sm:hidden">毛利润 (Gross)</span>
                                                <span className="hidden sm:inline">毛利润 (Gross) = Net Realized - COGS</span>
                                            </span>
                                            <span className={`font-mono text-xs sm:text-sm font-bold shrink-0 tabular-nums ${analytics.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{formatMoney(analytics.grossProfit)}</span>
                                        </div>
                                        <div className={`pt-3 sm:pt-4 pb-2 border-t mt-2 sm:mt-3 flex justify-between items-end gap-2 ${analytics.netProfit >= 0 ? 'border-emerald-200' : 'border-red-200'}`}>
                                            <div className="min-w-0">
                                                <span className={`text-[10px] sm:text-xs font-black ${analytics.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>净利润 (Net Profit)</span>
                                                <p className={`text-[9px] sm:text-[10px] font-bold mt-0.5 sm:mt-1 ${analytics.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>净利率: {analytics.netMargin.toFixed(1)}%</p>
                                            </div>
                                            <span className={`font-mono text-xl sm:text-2xl md:text-3xl font-black tracking-tighter shrink-0 tabular-nums ${analytics.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(analytics.netProfit)}</span>
                                        </div>
                                        
                                        {(analytics.revenueDetails.variance !== 0 || analytics.costs.totalCapex > 0 || analytics.totalDividends > 0) && (
                                            <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-dashed border-gray-300/50 space-y-1 sm:space-y-1.5">
                                                {analytics.revenueDetails.variance !== 0 && (
                                                    <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-gray-500 gap-2">
                                                        <span>+ 现金盘点差异</span>
                                                        <span className="font-mono shrink-0 tabular-nums">{analytics.revenueDetails.variance > 0 ? '+' : ''}{formatMoney(analytics.revenueDetails.variance)}</span>
                                                    </div>
                                                )}
                                                {analytics.costs.totalCapex > 0 && (
                                                    <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-gray-500 gap-2">
                                                        <span>- 资产性支出 (CAPEX)</span>
                                                        <span className="font-mono shrink-0 tabular-nums">-{formatMoney(analytics.costs.totalCapex)}</span>
                                                    </div>
                                                )}
                                                {analytics.totalDividends > 0 && (
                                                    <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-blue-500 gap-2">
                                                        <span>- 股东分红支出 (DIVIDEND)</span>
                                                        <span className="font-mono shrink-0 tabular-nums">-{formatMoney(analytics.totalDividends)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center text-[10px] sm:text-xs font-black text-[#1A1A1A] pt-1 gap-2">
                                                    <span className="leading-tight">= 真实可支配现金流</span>
                                                    <span className="font-mono text-sm sm:text-base shrink-0 tabular-nums">{formatMoney(analytics.netCashFlow)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                
                                        </div>
                                    )}
                                </div>
                                )}
                                {/* ━━━━━━━ 卡 1 结束 ━━━━━━━ */}



                                {/* ━━━━━━━ 卡 2：收款 Sales ━━━━━━━ */}
                                {activeTab === 'SALES' && (
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <button onClick={() => toggleCard('SALES')} className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors">
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs sm:text-sm shrink-0">¥</div>
                                            <div className="text-left min-w-0">
                                                <div className="font-black text-sm sm:text-base text-[#1A1A1A]">收款 Sales</div>
                                                <div className="text-[10px] sm:text-xs text-gray-400 font-bold truncate">日均 {formatMoney(analytics.avgDailySales)} · 最佳日 {formatMoney(analytics.insights.bestDay.sales)} · {analytics.settlementCount}天</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {analytics.mom.revenue !== 0 && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${analytics.mom.revenue >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{analytics.mom.revenue >= 0 ? '↗' : '↘'}{Math.abs(analytics.mom.revenue).toFixed(0)}%</span>}
                                            {expandedCards.SALES ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                                        </div>
                                    </button>
                                    {expandedCards.SALES && (
                                        <div className="border-t border-gray-100 p-3 sm:p-4 animate-in slide-in-from-top-1 fade-in duration-200">

                            {/* 卡 2 内容（原 SALES Tab 内容 — 不动） */}
                            {true && (
                                <div className="space-y-4 sm:space-y-5 md:space-y-6 animate-in fade-in slide-in-from-right-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
                                        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between col-span-2">
                                            <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">总账面流水 (Gross Revenue)</span>
                                            <div className="flex justify-between items-end mt-2 gap-2">
                                                <span className="font-mono text-xl sm:text-2xl md:text-3xl font-black text-[#1A1A1A] tracking-tighter tabular-nums">{formatMoney(analytics.rev.totalGrossRevenue)}</span>
                                                {renderMoM(analytics.mom.revenue)}
                                            </div>
                                        </div>
                                        <div className="bg-blue-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-blue-100 shadow-sm">
                                            <span className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-widest block mb-1 sm:mb-2">最佳销售日</span>
                                            <span className="font-bold text-[#1A1A1A] block text-xs sm:text-sm">{analytics.insights.bestDay.date}</span>
                                            <span className="font-mono font-black text-blue-700 text-sm sm:text-lg tabular-nums">{formatMoney(analytics.insights.bestDay.sales)}</span>
                                        </div>
                                        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm">
                                            <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1 sm:mb-2">日均产出</span>
                                            <div className="space-y-0.5 sm:space-y-1">
                                                <div className="flex justify-between text-[10px] sm:text-xs font-bold"><span className="text-gray-500">工作日</span><span className="font-mono tabular-nums">{formatMoney(analytics.insights.avgWeekday)}</span></div>
                                                <div className="flex justify-between text-[10px] sm:text-xs font-bold"><span className="text-red-500">周末</span><span className="font-mono text-red-600 tabular-nums">{formatMoney(analytics.insights.avgWeekend)}</span></div>
                                                <div className="flex justify-between text-[10px] sm:text-xs font-bold"><span className="text-purple-500">假期</span><span className="font-mono text-purple-600 tabular-nums">{formatMoney(analytics.insights.avgHoliday)}</span></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 每日柱状图 */}
                                    <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200 shadow-sm">
                                        <h4 className="font-black text-xs sm:text-sm text-[#1A1A1A] mb-3 sm:mb-4 uppercase tracking-wider sm:tracking-widest flex items-center gap-2"><BarChart3 size={14} className="sm:w-4 sm:h-4"/> 每日营收趋势</h4>
                                        <div className="w-full overflow-x-auto scrollbar-hide -mx-1 px-1">
                                            <div className="min-w-[350px]">
                                                {(() => {
                                                    const data = analytics.dailySales;
                                                    const maxVal = Math.max(...data.map(d => d.sales), 1);
                                                    const chartH = 120;
                                                    const barW = Math.max(12, Math.min(36, (550 / (data.length || 1)) - 3));
                                                    return (
                                                        <div>
                                                            <div className="flex items-end gap-[2px] sm:gap-1 justify-center border-b border-gray-100 pb-2" style={{ height: chartH + 20 }}>
                                                                {data.map((d, i) => {
                                                                    const h = Math.max(3, (d.sales / maxVal) * chartH);
                                                                    const dayOfWeek = new Date(d.date + 'T00:00:00').getDay();
                                                                    const isHoliday = MY_HOLIDAYS_2026.includes(d.date);
                                                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                                                    const isToday = d.date === getTodayStr();
                                                                    
                                                                    let barColor = 'bg-blue-300 group-hover:bg-blue-500';
                                                                    let textColor = 'text-blue-600';
                                                                    if (isToday) barColor = 'bg-blue-500';
                                                                    else if (isHoliday) { barColor = 'bg-purple-400 group-hover:bg-purple-500'; textColor = 'text-purple-600'; }
                                                                    else if (isWeekend) { barColor = 'bg-red-400 group-hover:bg-red-500'; textColor = 'text-red-500'; }

                                                                    return (
                                                                        <div key={i} className="flex flex-col items-center gap-0.5 sm:gap-1 group" style={{ width: barW }}>
                                                                            <span className={`text-[7px] sm:text-[8px] font-mono font-bold opacity-0 group-hover:opacity-100 transition-opacity ${textColor}`}>{d.sales >= 1000 ? `${(d.sales/1000).toFixed(1)}k` : d.sales.toFixed(0)}</span>
                                                                            <div className={`w-full rounded-t-sm sm:rounded-t-md transition-all ${barColor}`} style={{ height: h }} title={`${d.date}: RM ${d.sales.toFixed(2)}`}></div>
                                                                            <span className={`text-[6px] sm:text-[7px] font-mono ${isToday ? 'text-blue-600 font-black' : 'text-gray-400'}`}>{d.date.slice(8)}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="flex justify-between items-center mt-2 sm:mt-3 px-1">
                                                                <span className="text-[8px] sm:text-[9px] text-gray-400 font-bold">📊 {data.length}天 · 日均 {formatMoney(analytics.avgDailySales)}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 sm:gap-3 mt-2 sm:mt-3">
                                            <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 flex items-center gap-1"><div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-300 rounded"></div> 工作日</span>
                                            <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 flex items-center gap-1"><div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-400 rounded"></div> 周末</span>
                                            <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 flex items-center gap-1"><div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded"></div> 假期</span>
                                        </div>
                                    </div>

                                    {/* 支付构成 */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] border border-gray-200 shadow-sm">
                                            <h4 className="font-bold text-xs sm:text-sm text-[#1A1A1A] flex items-center gap-2 mb-3 sm:mb-4"><Wallet size={14} className="text-gray-400 sm:w-4 sm:h-4"/> 堂食收款</h4>
                                            <div className="space-y-1.5 sm:space-y-2">
                                                <div className="flex justify-between items-center bg-gray-50 p-2.5 sm:p-3 rounded-xl border border-gray-100"><span className="text-xs sm:text-sm font-bold text-gray-600">Cash (现金)</span><span className="font-mono font-black text-sm sm:text-lg text-[#1A1A1A] tabular-nums">{formatMoney(analytics.revenueDetails.cash)}</span></div>
                                                <div className="flex justify-between items-center bg-gray-50 p-2.5 sm:p-3 rounded-xl border border-gray-100"><span className="text-xs sm:text-sm font-bold text-gray-600">TNG eWallet</span><span className="font-mono font-black text-sm sm:text-lg text-[#1A1A1A] tabular-nums">{formatMoney(analytics.revenueDetails.tng)}</span></div>
                                                <div className="flex justify-between items-center bg-gray-50 p-2.5 sm:p-3 rounded-xl border border-gray-100"><span className="text-xs sm:text-sm font-bold text-gray-600">Debit Card</span><span className="font-mono font-black text-sm sm:text-lg text-[#1A1A1A] tabular-nums">{formatMoney(analytics.revenueDetails.debitCard)}</span></div>
                                                <div className="flex justify-between items-center bg-gray-50 p-2.5 sm:p-3 rounded-xl border border-gray-100"><span className="text-xs sm:text-sm font-bold text-gray-600">Credit Card</span><span className="font-mono font-black text-sm sm:text-lg text-[#1A1A1A] tabular-nums">{formatMoney(analytics.revenueDetails.creditCard)}</span></div>
                                            </div>
                                        </div>
                                        <div className="bg-orange-50 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] border border-orange-100 shadow-sm flex flex-col justify-between">
                                            <div>
                                                <h4 className="font-bold text-xs sm:text-sm text-orange-900 flex items-center gap-2 mb-3 sm:mb-4"><Truck size={14} className="text-orange-500 sm:w-4 sm:h-4"/> 外卖平台</h4>
                                                <p className="text-xl sm:text-2xl font-black font-mono text-orange-800 mb-3 sm:mb-4 tabular-nums">{formatMoney(analytics.revenueDetails.deliveryGross)}</p>
                                                <div className="space-y-2 sm:space-y-3">
                                                    {/* 👑 GrabFood 折叠面板 (Enhanced Platform Drill-down) */}
                                                    <div 
                                                        className="bg-white p-2.5 sm:p-3 rounded-xl border border-orange-100 cursor-pointer hover:bg-orange-50/50 active:scale-[0.99] transition-all group"
                                                        onClick={() => toggleAccordion('GRAB_DETAILS')}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs sm:text-sm font-bold text-orange-800 flex items-center gap-1.5">
                                                                GrabFood {!expandedSections['GRAB_DETAILS'] ? ' (净结转)' : ' (账面流水)'}
                                                                <div className="bg-orange-100 text-orange-600 rounded p-0.5 group-hover:bg-orange-200 transition-colors">
                                                                    {expandedSections['GRAB_DETAILS'] ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                                                </div>
                                                            </span>
                                                            <span className="font-mono font-black text-sm sm:text-lg text-orange-900 tabular-nums">
                                                                {formatMoney(expandedSections['GRAB_DETAILS'] ? analytics.deliveryBreakdown.grabGross : (analytics.deliveryBreakdown.grabNet - analytics.deliveryBreakdown.grabAds))}
                                                            </span>
                                                        </div>
                                                        
                                                        {expandedSections['GRAB_DETAILS'] && (
                                                            <div className="mt-3 pt-2.5 border-t border-dashed border-orange-200 space-y-2 animate-in slide-in-from-top-2">
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                    <span className="font-bold text-gray-500">Net Sales (账面销售额)</span>
                                                                    <span className="font-mono font-bold text-gray-700">{formatMoney(analytics.deliveryBreakdown.grabGross)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                    <span className="font-bold text-red-500">Deduction (平台抽佣)</span>
                                                                    <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.grabCommission)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs bg-green-50 p-1.5 rounded-lg border border-green-100">
                                                                    <span className="font-black text-green-700">Net Earnings (净回款)</span>
                                                                    <span className="font-mono font-black text-green-700">{formatMoney(analytics.deliveryBreakdown.grabNet)}</span>
                                                                </div>
                                                                {analytics.pnl.grabAds > 0 && (
                                                                    <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                        <span className="font-bold text-orange-500">Advertisements (广告费)</span>
                                                                        <span className="font-mono font-bold text-orange-600">-{formatMoney(analytics.pnl.grabAds)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 👑 FoodPanda 折叠面板 (FoodPanda Detailed Card) */}
                                                    <div 
                                                        className="bg-white p-2.5 sm:p-3 rounded-xl border border-orange-100 cursor-pointer hover:bg-orange-50/50 active:scale-[0.99] transition-all group"
                                                        onClick={() => toggleAccordion('PANDA_DETAILS')}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs sm:text-sm font-bold text-orange-850 flex items-center gap-1.5">
                                                                FoodPanda {!expandedSections['PANDA_DETAILS'] ? ' (净结转)' : ' (账面流水)'}
                                                                <div className="bg-orange-100 text-orange-650 rounded p-0.5 group-hover:bg-orange-200 transition-colors">
                                                                    {expandedSections['PANDA_DETAILS'] ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                                                </div>
                                                            </span>
                                                            <span className="font-mono font-black text-sm sm:text-lg text-orange-950 tabular-nums">
                                                                {formatMoney(expandedSections['PANDA_DETAILS'] ? analytics.deliveryBreakdown.pandaGross : (analytics.deliveryBreakdown.pandaNet - analytics.deliveryBreakdown.pandaAds))}
                                                            </span>
                                                        </div>
                                                        
                                                        {expandedSections['PANDA_DETAILS'] && (
                                                            <div className="mt-3 pt-2.5 border-t border-dashed border-orange-200 space-y-2 animate-in slide-in-from-top-2">
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                    <span className="font-bold text-gray-500">Net Sales (账面销售额)</span>
                                                                    <span className="font-mono font-bold text-gray-700">{formatMoney(analytics.deliveryBreakdown.pandaGross)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                    <span className="font-bold text-red-500">Deduction (平台抽佣)</span>
                                                                    <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.pandaCommission)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs bg-pink-50 p-1.5 rounded-lg border border-pink-100">
                                                                    <span className="font-black text-pink-700">Net Earnings (净回款)</span>
                                                                    <span className="font-mono font-black text-pink-700">{formatMoney(analytics.deliveryBreakdown.pandaNet)}</span>
                                                                </div>
                                                                {analytics.pnl.pandaAds > 0 && (
                                                                    <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                        <span className="font-bold text-red-500">Advertisements (平台广告费)</span>
                                                                        <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.pandaAds)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 👑 ShopeeFood 折叠面板 (ShopeeFood Detailed Card) */}
                                                    <div 
                                                        className="bg-white p-2.5 sm:p-3 rounded-xl border border-orange-100 cursor-pointer hover:bg-orange-50/50 active:scale-[0.99] transition-all group"
                                                        onClick={() => toggleAccordion('SHOPEE_DETAILS')}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs sm:text-sm font-bold text-orange-850 flex items-center gap-1.5">
                                                                ShopeeFood {!expandedSections['SHOPEE_DETAILS'] ? ' (净结转)' : ' (账面流水)'}
                                                                <div className="bg-orange-100 text-orange-650 rounded p-0.5 group-hover:bg-orange-200 transition-colors">
                                                                    {expandedSections['SHOPEE_DETAILS'] ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                                                </div>
                                                            </span>
                                                            <span className="font-mono font-black text-sm sm:text-lg text-orange-950 tabular-nums">
                                                                {formatMoney(expandedSections['SHOPEE_DETAILS'] ? analytics.deliveryBreakdown.shopeeGross : (analytics.deliveryBreakdown.shopeeNet - analytics.deliveryBreakdown.shopeeAds))}
                                                            </span>
                                                        </div>
                                                        
                                                        {expandedSections['SHOPEE_DETAILS'] && (
                                                            <div className="mt-3 pt-2.5 border-t border-dashed border-orange-200 space-y-2 animate-in slide-in-from-top-2">
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                    <span className="font-bold text-gray-500">Net Sales (账面销售额)</span>
                                                                    <span className="font-mono font-bold text-gray-700">{formatMoney(analytics.deliveryBreakdown.shopeeGross)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                    <span className="font-bold text-red-500">Deduction (平台抽佣)</span>
                                                                    <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.shopeeCommission)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] sm:text-xs bg-orange-50/60 p-1.5 rounded-lg border border-orange-100">
                                                                    <span className="font-black text-orange-700">Net Earnings (结转及净回款)</span>
                                                                    <span className="font-mono font-black text-orange-850">{formatMoney(analytics.deliveryBreakdown.shopeeNet)}</span>
                                                                </div>
                                                                {analytics.pnl.shopeeAds > 0 && (
                                                                    <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                                                        <span className="font-bold text-red-450">Advertisements (平台广告费)</span>
                                                                        <span className="font-mono font-bold text-red-500">-{formatMoney(analytics.pnl.shopeeAds)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 sm:space-y-3 mt-4 sm:mt-6 border-t border-orange-200/50 pt-3 sm:pt-4">
                                                <div className="flex justify-between items-center bg-green-50/50 p-2.5 sm:p-3 rounded-xl border border-green-200">
                                                    <span className="text-[10px] sm:text-xs font-bold text-green-800">三平台净回款预测 (Net Platforms Payout)</span>
                                                    <span className="font-mono font-black text-xs sm:text-sm text-green-700 tabular-nums">
                                                        {formatMoney(
                                                            (analytics.deliveryBreakdown.grabNet - analytics.pnl.grabAds) + 
                                                            (analytics.deliveryBreakdown.pandaNet - analytics.pnl.pandaAds) + 
                                                            (analytics.deliveryBreakdown.shopeeNet - analytics.pnl.shopeeAds)
                                                        )}
                                                    </span>
                                                </div>
                                                {analytics.deliveryBreakdown.lalamove > 0 && (
                                                    <div className="flex justify-between items-center bg-blue-50/50 p-2.5 sm:p-3 rounded-xl border border-blue-200">
                                                        <span className="text-[10px] sm:text-xs font-bold text-blue-800">Lalamove 自配净回款 (Lalamove Net Delivery)</span>
                                                        <span className="font-mono font-black text-xs sm:text-sm text-blue-700 tabular-nums">{formatMoney(analytics.deliveryBreakdown.lalamove)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center bg-red-50/50 p-2.5 sm:p-3 rounded-xl border border-red-200">
                                                    <span className="text-[10px] sm:text-xs font-bold text-red-800">抽佣/广告估算</span>
                                                    <span className="font-mono font-black text-xs sm:text-sm text-red-600 tabular-nums">-{formatMoney(analytics.pnl.totalDeliveryDirectCost)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 🧭 多维营收智控罗盘 (Multi-Dimensional Sales Compass) */}
                                    <div className="mt-4 sm:mt-6 border-t border-gray-100 pt-4 sm:pt-6">
                                        <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/40 rounded-2xl border border-blue-100 p-4 sm:p-5">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl">🧭</span>
                                                    <div>
                                                        <h4 className="font-black text-sm text-gray-900 tracking-wide uppercase">多维营收智控罗盘</h4>
                                                        <p className="text-[10px] text-gray-400 font-bold">Multi-Dimensional Sales Compass</p>
                                                    </div>
                                                </div>
                                                {/* iOS Segments style tab list */}
                                                <div className="bg-gray-100 p-0.5 rounded-lg flex w-full sm:w-auto overflow-x-auto scrollbar-hide">
                                                    {(['CHANNEL', 'EFFICIENCY', 'WEEKLY', 'TARGET'] as const).map((tab) => {
                                                        const labels = {
                                                            CHANNEL: '🛰️ 渠道深度',
                                                            EFFICIENCY: '💳 通路效能',
                                                            WEEKLY: '📈 周期律动',
                                                            TARGET: '🎯 达成罗盘',
                                                        };
                                                        const active = salesCompareTab === tab;
                                                        return (
                                                            <button
                                                                key={tab}
                                                                onClick={() => setSalesCompareTab(tab)}
                                                                className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-black whitespace-nowrap transition-all ${
                                                                    active 
                                                                        ? 'bg-white text-blue-700 shadow-sm' 
                                                                        : 'text-gray-500 hover:text-gray-800'
                                                                }`}
                                                                style={{ minHeight: '32px' }}
                                                            >
                                                                {labels[tab]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Subtab 1: CHANNEL */}
                                            {salesCompareTab === 'CHANNEL' && (
                                                <div className="space-y-4 animate-in fade-in duration-200">
                                                    {/* Channels visual bar */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
                                                            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></div>堂食终端 ({analytics.salesDetails.dineInPercent.toFixed(1)}%)</span>
                                                            <span className="flex items-center gap-1 text-orange-600"><div className="w-2.5 h-2.5 bg-orange-400 rounded-sm"></div>外卖服务 ({analytics.salesDetails.deliveryPercent.toFixed(1)}%)</span>
                                                        </div>
                                                        {/* Dual-progress capsule bar */}
                                                        <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
                                                            <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${analytics.salesDetails.dineInPercent}%` }}></div>
                                                            <div className="bg-orange-400 h-full transition-all duration-500" style={{ width: `${analytics.salesDetails.deliveryPercent}%` }}></div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3 mt-3.5 border-t border-gray-50 pt-3">
                                                            <div>
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase block">堂食流水 (In-Store)</span>
                                                                <span className="text-sm font-mono font-black text-blue-800">{formatMoney(analytics.salesDetails.dineInGross)}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase block">外卖流水 (Delivery)</span>
                                                                <span className="text-sm font-mono font-black text-orange-700">{formatMoney(analytics.salesDetails.deliveryGross)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Health indicator score */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-xs font-black text-gray-800">🎯 经营渠道平衡指数</span>
                                                            {analytics.salesDetails.dineInPercent >= 60 ? (
                                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">健康度：极佳 (Dine-in Heavy)</span>
                                                            ) : analytics.salesDetails.dineInPercent >= 40 ? (
                                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">健康度：良好 (Balanced)</span>
                                                            ) : (
                                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">健康度：重度依赖外卖 (Delivery Heavy)</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-600 leading-relaxed">
                                                            {analytics.salesDetails.dineInPercent >= 60 ? (
                                                                `当前堂食占比 ${analytics.salesDetails.dineInPercent.toFixed(1)}%，门店具备极高的核心控流能力。由于堂食无平台佣金损耗，利润率得到最大化保障。建议：通过门店客勤维护、推行积分会员，进一步锁定线下私域。`
                                                            ) : analytics.salesDetails.dineInPercent >= 40 ? (
                                                                `当前堂食与外卖处于 ${analytics.salesDetails.dineInPercent.toFixed(1)}% : ${analytics.salesDetails.deliveryPercent.toFixed(1)}% 的平衡结构。该状态兼具堂食的高毛利和外卖的跨区覆盖率。建议：保持该配比，将外卖视为爆款引流的沙盒，在店内进行利润收割。`
                                                            ) : (
                                                                `当前外卖占比高达 ${analytics.salesDetails.deliveryPercent.toFixed(1)}%。外卖的高返点和平台抽佣正在侵蚀门店净利率。建议：① 强力推行“堂食专属优惠套餐”，引流外卖老客到店自提；② 精细化外卖菜单（提升高溢价单品占比，适当调价补偿佣金扣点）。`
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Subtab 2: EFFICIENCY */}
                                            {salesCompareTab === 'EFFICIENCY' && (
                                                <div className="space-y-4 animate-in fade-in duration-200">
                                                    {/* Payment Gateway efficiency */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <h5 className="text-xs font-black text-gray-800 mb-2.5 flex items-center gap-1.5">
                                                            💳 堂食收款通道效能评估
                                                        </h5>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-xs items-center p-1.5 hover:bg-gray-50 rounded transition-colors">
                                                                <span className="font-bold text-gray-600">TNG eWallet (估算费率 0.5%)</span>
                                                                <div className="text-right">
                                                                    <span className="font-mono text-gray-800 font-bold mr-3">{formatMoney(analytics.revenueDetails.tng)}</span>
                                                                    <span className="font-mono text-red-500 text-[10px]">-{formatMoney(analytics.salesDetails.estTngFee)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-xs items-center p-1.5 hover:bg-gray-50 rounded transition-colors">
                                                                <span className="font-bold text-gray-600">Debit Card (估算费率 1.0%)</span>
                                                                <div className="text-right">
                                                                    <span className="font-mono text-gray-800 font-bold mr-3">{formatMoney(analytics.revenueDetails.debitCard)}</span>
                                                                    <span className="font-mono text-red-500 text-[10px]">-{formatMoney(analytics.salesDetails.estDebitFee)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-xs items-center p-1.5 hover:bg-gray-50 rounded transition-colors">
                                                                <span className="font-bold text-gray-600">Credit Card (估算费率 1.5%)</span>
                                                                <div className="text-right">
                                                                    <span className="font-mono text-gray-800 font-bold mr-3">{formatMoney(analytics.revenueDetails.creditCard)}</span>
                                                                    <span className="font-mono text-red-500 text-[10px]">-{formatMoney(analytics.salesDetails.estCreditFee)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-xs items-center p-1.5 bg-yellow-50/50 rounded border border-yellow-100">
                                                                <span className="font-bold text-yellow-850 flex items-center gap-1">💵 现金账面差异 (风险盘点差)</span>
                                                                <span className="font-mono text-amber-700 font-black">{formatMoney(analytics.revenueDetails.variance)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 pt-2.5 border-t border-gray-100 flex justify-between items-center text-xs">
                                                            <span className="font-black text-gray-800">线下综合结算成本损耗 (Est. MDR Loss)</span>
                                                            <span className="font-mono font-black text-red-600">{formatMoney(analytics.salesDetails.totalEstMdrFee)} (占 {analytics.salesDetails.mdrLossPercent.toFixed(2)}%)</span>
                                                        </div>
                                                    </div>

                                                    {/* Delivery Platform efficiency ranking */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <h5 className="text-xs font-black text-gray-800 mb-2.5 flex items-center gap-1.5">
                                                            🛸 三大外卖渠道抽佣与实得率对比
                                                        </h5>
                                                        <div className="space-y-3">
                                                            {/* GrabFood */}
                                                            {analytics.deliveryBreakdown.grabGross > 0 && (
                                                                <div className="p-2 rounded-lg bg-gray-50/50 border border-gray-100">
                                                                    <div className="flex justify-between items-center text-xs mb-1">
                                                                        <span className="font-black text-green-700">GrabFood 绿色通道</span>
                                                                        <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold">最终实得率：{analytics.salesDetails.grabNetRatio.toFixed(1)}%</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
                                                                        <div>账面流水: <span className="font-mono text-gray-800 font-bold">{formatMoney(analytics.deliveryBreakdown.grabGross)}</span></div>
                                                                        <div>抽佣率: <span className="font-mono text-red-500 font-bold">{analytics.salesDetails.grabCommissionRate.toFixed(1)}%</span></div>
                                                                        <div>投流占比: <span className="font-mono text-amber-600 font-bold">{analytics.salesDetails.grabAdsDensity.toFixed(1)}%</span></div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {/* FoodPanda */}
                                                            {analytics.deliveryBreakdown.pandaGross > 0 && (
                                                                <div className="p-2 rounded-lg bg-gray-50/50 border border-gray-100">
                                                                    <div className="flex justify-between items-center text-xs mb-1">
                                                                        <span className="font-black text-pink-700">FoodPanda 粉色通道</span>
                                                                        <span className="text-[10px] bg-pink-100 text-pink-800 px-1.5 py-0.5 rounded font-bold">最终实得率：{analytics.salesDetails.pandaNetRatio.toFixed(1)}%</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
                                                                        <div>账面流水: <span className="font-mono text-gray-800 font-bold">{formatMoney(analytics.deliveryBreakdown.pandaGross)}</span></div>
                                                                        <div>抽佣率: <span className="font-mono text-red-500 font-bold">{analytics.salesDetails.pandaCommissionRate.toFixed(1)}%</span></div>
                                                                        <div>投流占比: <span className="font-mono text-amber-600 font-bold">{analytics.salesDetails.pandaAdsDensity.toFixed(1)}%</span></div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {/* ShopeeFood */}
                                                            {analytics.deliveryBreakdown.shopeeGross > 0 && (
                                                                <div className="p-2 rounded-lg bg-gray-50/50 border border-gray-100">
                                                                    <div className="flex justify-between items-center text-xs mb-1">
                                                                        <span className="font-black text-orange-750">ShopeeFood 橙色通道</span>
                                                                        <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-bold">最终实得率：{analytics.salesDetails.shopeeNetRatio.toFixed(1)}%</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
                                                                        <div>账面流水: <span className="font-mono text-gray-800 font-bold">{formatMoney(analytics.deliveryBreakdown.shopeeGross)}</span></div>
                                                                        <div>抽佣率: <span className="font-mono text-red-500 font-bold">{analytics.salesDetails.shopeeCommissionRate.toFixed(1)}%</span></div>
                                                                        <div>投流占比: <span className="font-mono text-amber-600 font-bold">{analytics.salesDetails.shopeeAdsDensity.toFixed(1)}%</span></div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 font-bold mt-2.5 leading-tight">
                                                            💡 提示：实得率代表每做100令吉生意，最终真实结转到店的令吉数（已抵扣抽佣与平台推广费）。实得率越高代表平台经营效率越好。
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Subtab 3: WEEKLY */}
                                            {salesCompareTab === 'WEEKLY' && (
                                                <div className="space-y-4 animate-in fade-in duration-200">
                                                    {/* Cyclic chart stats */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <h5 className="text-xs font-black text-gray-800 mb-3 flex items-center gap-1.5">
                                                            📊 经营周期评估与乘数
                                                        </h5>
                                                        <div className="grid grid-cols-3 gap-2 text-center mb-3">
                                                            <div className="p-2 bg-gray-50 rounded-lg border border-gray-100">
                                                                <span className="text-[9px] text-gray-400 font-bold block">工作日均 (Mon-Fri)</span>
                                                                <span className="font-mono text-xs sm:text-sm font-black text-gray-800">{formatMoney(analytics.salesDetails.weekdayAvg)}</span>
                                                            </div>
                                                            <div className="p-2 bg-red-50 rounded-lg border border-red-100">
                                                                <span className="text-[9px] text-red-500 font-bold block">周末日均 (Sat-Sun)</span>
                                                                <span className="font-mono text-xs sm:text-sm font-black text-red-700">{formatMoney(analytics.salesDetails.weekendAvg)}</span>
                                                            </div>
                                                            <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
                                                                <span className="text-[9px] text-purple-500 font-bold block">公假特定日均</span>
                                                                <span className="font-mono text-xs sm:text-sm font-black text-purple-700">{formatMoney(analytics.salesDetails.holidayAvg)}</span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2 pt-2 border-t border-gray-50">
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="font-bold text-gray-600">周末爆发系数 (Weekend Surge Multiplier)</span>
                                                                <span className="font-mono font-black text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                                                    {analytics.salesDetails.weekendSurgeMultiplier > 0 ? `${analytics.salesDetails.weekendSurgeMultiplier.toFixed(2)}x` : 'N/A'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="font-bold text-gray-600">节日提振系数 (Holiday Boost Index)</span>
                                                                <span className="font-mono font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                                                                    {analytics.salesDetails.holidayBoostIndex > 0 ? `${analytics.salesDetails.holidayBoostIndex.toFixed(2)}x` : 'N/A'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Cyclic suggestion */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <span className="text-xs font-black text-gray-800 flex items-center gap-1 mb-1.5">💡 排班与物料诊断意见</span>
                                                        <p className="text-xs text-gray-600 leading-relaxed">
                                                            {analytics.salesDetails.weekendSurgeMultiplier >= 1.4 ? (
                                                                `周末日均比工作日高出 ${((analytics.salesDetails.weekendSurgeMultiplier - 1) * 100).toFixed(0)}%。本月周末潮汐效应极为显著。排班建议：周六周日执行“双倍备料”与“巅峰重叠排班”，工作日进行轮休；周五下午必须完成核心食材（海鲜/生鲜）及冷链盘点，避免周末断料错失高毛利营收。`
                                                            ) : analytics.salesDetails.weekendSurgeMultiplier >= 1.0 ? (
                                                                `周末爆发系数为 ${analytics.salesDetails.weekendSurgeMultiplier.toFixed(2)}x，日常客流波动平滑，周中周末差距较小。排班与物料采购应当保持均匀节拍，避免周末过度囤货导致周一原材料积压损耗。`
                                                            ) : (
                                                                `周末爆发系数低于 1.0 (当前 ${analytics.salesDetails.weekendSurgeMultiplier.toFixed(2)}x)。这表明门店可能处于典型的商务办公区，周末人流大幅流失。建议：周末进行极简排班以压低人工开支，或在周六、周日推出针对周边社区、家庭客群的“周末家庭分享外卖特惠”，对冲办公客流流失。`
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Subtab 4: TARGET */}
                                            {salesCompareTab === 'TARGET' && (
                                                <div className="space-y-4 animate-in fade-in duration-200">
                                                    {/* Target settings inputs */}
                                                    <div className="bg-white p-3.5 rounded-xl border border-blue-50 shadow-sm">
                                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-3">
                                                            <div>
                                                                <span className="text-xs font-black text-gray-800 block">🎯 自定义本期业绩目标</span>
                                                                <span className="text-[10px] text-gray-400 font-bold">设定月度总营收考核目标 (RM)</span>
                                                            </div>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">RM</span>
                                                                <input
                                                                    type="number"
                                                                    placeholder={`${(dailyLaborBreakdown.breakEvenFull * dailyLaborBreakdown.daysInMonth * 1.2).toFixed(0)} (推荐)`}
                                                                    value={customSalesTarget}
                                                                    onChange={(e) => setCustomSalesTarget(e.target.value)}
                                                                    className="pl-8 pr-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 font-mono font-bold text-[#1A1A1A] w-full sm:w-40"
                                                                    style={{ minHeight: '36px' }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Target numbers & break-even calculation */}
                                                        {(() => {
                                                            const targetSales = Number(customSalesTarget) || (dailyLaborBreakdown.breakEvenFull * dailyLaborBreakdown.daysInMonth * 1.2);
                                                            const totalGross = analytics.rev.totalGrossRevenue;
                                                            const projected = dailyLaborBreakdown.projectedMonthRevenue;
                                                            const progressPct = targetSales > 0 ? (totalGross / targetSales) * 100 : 0;
                                                            const expectedPct = dailyLaborBreakdown.daysInMonth > 0 ? (analytics.settlementCount / dailyLaborBreakdown.daysInMonth) * 100 : 0;
                                                            const paceRatio = progressPct / Math.max(1, expectedPct);

                                                            const daysRemaining = Math.max(0, dailyLaborBreakdown.daysInMonth - analytics.settlementCount);
                                                            const neededDaily = daysRemaining > 0 ? Math.max(0, targetSales - totalGross) / daysRemaining : 0;

                                                            return (
                                                                <div className="space-y-3 pt-2.5 border-t border-gray-100">
                                                                    <div className="flex justify-between text-xs font-bold text-gray-500">
                                                                        <span>目标总业绩: {formatMoney(targetSales)}</span>
                                                                        <span>已结算进度: {analytics.settlementCount}/{dailyLaborBreakdown.daysInMonth}天 ({expectedPct.toFixed(0)}%)</span>
                                                                    </div>
                                                                    {/* Progress visual bar */}
                                                                    <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div className="bg-gradient-to-r from-blue-400 to-blue-600 h-full rounded-full transition-all duration-500 flex items-center pl-3" style={{ width: `${Math.min(100, progressPct)}%` }}>
                                                                            <span className="text-[10px] text-white font-black font-mono">{progressPct.toFixed(1)}%</span>
                                                                        </div>
                                                                        {/* Mark the time-to-date mark */}
                                                                        <div className="absolute top-0 bottom-0 w-0.5 bg-red-400" style={{ left: `${expectedPct}%` }} title={`时间进度标线：${expectedPct.toFixed(0)}%`}></div>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                                                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                                                            <span className="text-[10px] text-gray-400 font-bold block">月底预测总营收</span>
                                                                            <span className="font-mono text-sm font-black text-gray-800">{formatMoney(projected)}</span>
                                                                        </div>
                                                                        <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                                                                            <span className="text-[10px] text-blue-600 font-bold block">剩余每日应达成额</span>
                                                                            <span className="font-mono text-sm font-black text-blue-800">{daysRemaining > 0 ? formatMoney(neededDaily) : '已达标'}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3.5 rounded-xl border mt-2 flex items-center gap-3 bg-white border-blue-50 shadow-sm">
                                                                        <div className="text-2xl">
                                                                            {paceRatio >= 1.05 ? '🚀' : paceRatio >= 0.95 ? '✅' : '⚠️'}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <span className="text-xs font-black text-gray-800 block">目标达成节奏状态</span>
                                                                            <p className="text-xs text-gray-500 mt-0.5 leading-tight">
                                                                                {paceRatio >= 1.05 ? (
                                                                                    `当前进度快于时间进度线 ${((paceRatio - 1) * 100).toFixed(1)}%！本期业绩大涨，正在超额狂奔。加油！`
                                                                                ) : paceRatio >= 0.95 ? (
                                                                                    `当前进度完全咬合时间进度线，月底大概率完美达成业绩。请稳固当前的营销势头。`
                                                                                ) : (
                                                                                    `当前进度滞后时间进度线 ${((1 - paceRatio) * 100).toFixed(1)}%。若要达标，剩余 ${daysRemaining}天 日均必须保证 ${formatMoney(neededDaily)}。建议本周立即采取主动引流措施！`
                                                                                )}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                                        </div>
                                    )}
                                </div>
                                )}
                                {/* ━━━━━━━ 卡 2 结束 ━━━━━━━ */}

                                {/* ━━━━━━━ 卡 3：开销 Cost ━━━━━━━ */}
                                {activeTab === 'COST' && (
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <button onClick={() => toggleCard('COST')} className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors">
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-black text-xs sm:text-sm shrink-0">$</div>
                                            <div className="text-left min-w-0">
                                                <div className="font-black text-sm sm:text-base text-[#1A1A1A]">开销 Cost</div>
                                                <div className="text-[10px] sm:text-xs text-gray-400 font-bold truncate">三大成本 {formatMoney(analytics.costs.totalStoreCosts)} · COGS {analytics.margins.cogs.toFixed(1)}% · Labor {laborDeptAnalysis.laborMarginSynced.toFixed(1)}%</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {analytics.mom.storeCosts !== 0 && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${analytics.mom.storeCosts > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{analytics.mom.storeCosts > 0 ? '↗' : '↘'}{Math.abs(analytics.mom.storeCosts).toFixed(0)}%</span>}
                                            {expandedCards.COST ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                                        </div>
                                    </button>
                                    {expandedCards.COST && (
                                        <div className="border-t border-gray-100 p-3 sm:p-4 animate-in slide-in-from-top-1 fade-in duration-200">

                            {/* 卡 3 内容（原 COST Tab 内容 — 不动） */}
                            {true && (
                                <div className="space-y-4 sm:space-y-5 md:space-y-6 animate-in fade-in slide-in-from-right-4">
                                    <div className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[9px] sm:text-[10px] font-bold leading-tight ${accountingMode === 'ACCRUAL' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                                        <Info size={11} className="shrink-0 sm:w-3 sm:h-3"/>
                                        {accountingMode === 'ACCRUAL' ? '📋 权责发生制 — 含未付账单，按收货日归入' : '💰 收付实现制 — 仅显示已付款费用'}
                                    </div>

                                    {/* 👑 对比月份选择器 */}
                                    <CompareSelector/>

                                    {/* ━━━━━━━ 👑 智能开销对比与异常诊断罗盘 (iOS Premium Style) ━━━━━━━ */}
                                    {(() => {
                                        const comp = analytics.comparisonDetails;
                                        if (!comp) return null;
                                        
                                        const shiftColor = (v: number, invert = false) => {
                                            if (Math.abs(v) < 0.1) return 'text-gray-400';
                                            const isGood = invert ? v > 0 : v < 0;
                                            return isGood ? 'text-green-600 font-bold' : 'text-red-600 font-bold';
                                        };
                                        const shiftBg = (v: number, invert = false) => {
                                            if (Math.abs(v) < 0.1) return 'bg-gray-50';
                                            const isGood = invert ? v > 0 : v < 0;
                                            return isGood ? 'bg-green-50/60 border-green-100' : 'bg-red-50/50 text-red-900 border-red-100';
                                        };

                                        return (
                                            <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
                                                {/* 头部 & 快捷选项卡 (Apple Pill Style) */}
                                                <div className="p-3 sm:p-4 border-b border-gray-100">
                                                    <div className="flex items-center justify-between gap-2 mb-3">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <div className="w-5 h-5 rounded-lg bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] font-black">研</div>
                                                            <h4 className="font-black text-xs sm:text-sm uppercase tracking-wider text-[#1A1A1A] truncate">开销对比智能诊断罗盘</h4>
                                                        </div>
                                                        <span className="text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                                            智控诊断
                                                        </span>
                                                    </div>

                                                    {/* 大拇指高效切换栏 - 完美适配 44px HIG 热区 */}
                                                    <div className="grid grid-cols-3 gap-1 bg-gray-105 p-1 rounded-xl">
                                                        <button 
                                                            type="button"
                                                            onClick={() => setCostCompareTab('ANOMALY')}
                                                            className={`py-2 text-[10px] sm:text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 min-h-[38px] ${
                                                                costCompareTab === 'ANOMALY' 
                                                                    ? 'bg-white text-gray-900 shadow-sm' 
                                                                    : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                                                            }`}
                                                        >
                                                            <span>🚨 异常看诊</span>
                                                            {comp.costAnomalies.length > 0 && (
                                                                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                                                                    {comp.costAnomalies.length}
                                                                </span>
                                                            )}
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setCostCompareTab('STRUCTURE')}
                                                            className={`py-2 text-[10px] sm:text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 min-h-[38px] ${
                                                                costCompareTab === 'STRUCTURE' 
                                                                    ? 'bg-white text-gray-900 shadow-sm' 
                                                                    : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                                                            }`}
                                                        >
                                                            <span>📊 结构偏移</span>
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setCostCompareTab('SHIFT')}
                                                            className={`py-2 text-[10px] sm:text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 min-h-[38px] ${
                                                                costCompareTab === 'SHIFT' 
                                                                    ? 'bg-white text-gray-900 shadow-sm' 
                                                                    : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                                                            }`}
                                                        >
                                                            <span>⚖️ 账目轧差</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* 选项卡内容区 */}
                                                <div className="p-3 sm:p-4 space-y-3">
                                                    {/* TAB 1: 异常看诊 */}
                                                    {costCompareTab === 'ANOMALY' && (
                                                        <div className="space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                            {comp.costAnomalies.length === 0 ? (
                                                                <div className="bg-emerald-50/50 p-4 rounded-xl border border-dashed border-emerald-200 text-center py-6">
                                                                    <p className="text-xl">🎉</p>
                                                                    <p className="text-xs sm:text-sm font-black text-emerald-800 mt-1">各项开销极其平稳</p>
                                                                    <p className="text-[10px] text-gray-400 font-bold mt-1">未检测到任何异常成本飙升或结构性失控</p>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <p className="text-[9px] text-gray-450 font-extrabold uppercase tracking-wide px-1">点击下方任何一个波动项，查看智能诊断与行动方案</p>
                                                                    {comp.costAnomalies.map((item: any) => {
                                                                        const isExpanded = !!expandedAnomalies[item.id];
                                                                        const isUp = item.delta > 0;
                                                                        const isStructure = item.type === 'STRUCTURE';
                                                                        const isDecline = item.type === 'DECLINE';
                                                                        
                                                                        let badgeColor = "bg-red-50 text-red-600 border-red-100";
                                                                        let badgeLabel = "异常暴涨";
                                                                        if (item.type === 'NEW') {
                                                                            badgeColor = "bg-blue-50 text-blue-600 border-blue-100";
                                                                            badgeLabel = "本期新增";
                                                                        } else if (isStructure) {
                                                                            badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                                                                            badgeLabel = "结构偏离";
                                                                        } else if (isDecline) {
                                                                            badgeColor = "bg-green-50 text-green-700 border-green-200";
                                                                            badgeLabel = "节支降耗";
                                                                        }

                                                                        return (
                                                                            <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:border-gray-300 transition-all">
                                                                                {/* 点击大热区 */}
                                                                                <div 
                                                                                    onClick={() => setExpandedAnomalies(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                                                                    className="p-3 cursor-pointer flex items-center justify-between gap-2 hover:bg-gray-50/50 active:bg-gray-50"
                                                                                >
                                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                                        <span className="text-base shrink-0">{item.emoji}</span>
                                                                                        <div className="min-w-0 text-left">
                                                                                            <div className="font-black text-xs sm:text-sm text-gray-900 truncate leading-tight">{item.label}</div>
                                                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${badgeColor} tracking-wide shrink-0`}>
                                                                                                    {badgeLabel}
                                                                                                </span>
                                                                                                <span className="text-[9px] font-mono text-gray-400 font-bold shrink-0">
                                                                                                    本期: {isStructure ? `${item.amount.toFixed(1)}%` : formatMoney(item.amount)}
                                                                                                </span>
                                                                                                {item.prevAmount > 0 && (
                                                                                                    <span className="text-[9px] font-mono text-gray-400 shrink-0">
                                                                                                        (对: {isStructure ? `${item.prevAmount.toFixed(1)}%` : formatMoney(item.prevAmount)})
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                                        <div className="text-right">
                                                                                            <div className={`text-xs font-mono font-black ${isDecline ? 'text-green-600' : isStructure ? (isUp ? 'text-red-600' : 'text-green-600') : 'text-red-600'}`}>
                                                                                                {isStructure 
                                                                                                    ? `${isUp ? '+' : ''}${item.delta.toFixed(1)}%` 
                                                                                                    : `${isUp ? '+' : ''}${formatMoney(item.delta)}`
                                                                                                }
                                                                                            </div>
                                                                                            {item.prevAmount > 0 && !isStructure && (
                                                                                                <div className={`text-[8px] font-extrabold ${isDecline ? 'text-green-500' : 'text-red-500'}`}>
                                                                                                    {isDecline ? '↓' : '↑'} {Math.abs(item.deltaPct).toFixed(0)}%
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="text-gray-350 hover:text-gray-500 transition-colors">
                                                                                            {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {/* 展开的诊断处方与快捷穿透 (iOS Fluid Animation) */}
                                                                                {isExpanded && (
                                                                                    <div className={`border-t border-gray-150 p-3 text-left animate-in slide-in-from-top-1 fade-in duration-200 ${
                                                                                        isDecline ? 'bg-green-50/20' : isStructure ? 'bg-amber-50/20' : 'bg-red-50/10'
                                                                                    }`}>
                                                                                        <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm text-[11px] sm:text-xs leading-relaxed text-gray-600">
                                                                                            <span className="font-extrabold text-[#1A1A1A] block mb-1">📋 智能优化药方建议：</span>
                                                                                            {item.suggest}
                                                                                        </div>
                                                                                        
                                                                                        {/* 穿透控制 */}
                                                                                        {!isStructure && (
                                                                                            <div className="mt-2.5 flex justify-end">
                                                                                                <button 
                                                                                                    type="button"
                                                                                                    onClick={() => handleDrillDown({ categoryId: item.id }, item.label)}
                                                                                                    className="px-2.5 py-1.5 bg-[#1A1A1A] text-[#FFD700] rounded-lg text-[10px] sm:text-xs font-black shadow active:scale-95 transition-all flex items-center gap-1"
                                                                                                >
                                                                                                    <span>🔍 穿透审查该科目收支明细</span>
                                                                                                    <ChevronRight size={10}/>
                                                                                                </button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* TAB 2: 结构偏移 (Stacked Capsule Compare) */}
                                                    {costCompareTab === 'STRUCTURE' && (
                                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                            <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-3.5">
                                                                {/* 1. 当前月堆叠占比 */}
                                                                <div>
                                                                    <div className="flex justify-between items-center text-[10px] sm:text-xs font-black text-[#1A1A1A] mb-1.5">
                                                                        <span>本月成本结构 ({startDate.slice(0, 7)})</span>
                                                                        <span className="font-mono text-gray-500">满月净利: {analytics.margins.cogs + analytics.margins.labor + analytics.margins.opex < 100 ? `${(100 - (analytics.margins.cogs + analytics.margins.labor + analytics.margins.opex)).toFixed(1)}%` : '0%'}</span>
                                                                    </div>
                                                                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex text-[8px] sm:text-[9px] font-bold text-white text-center leading-5 relative">
                                                                        <div className="bg-red-400 h-full transition-all flex items-center justify-center shrink-0" style={{ width: `${Math.max(12, analytics.margins.cogs)}%` }}>
                                                                            COGS {analytics.margins.cogs.toFixed(0)}%
                                                                        </div>
                                                                        <div className="bg-purple-400 h-full transition-all flex items-center justify-center shrink-0 border-l border-white/40" style={{ width: `${Math.max(12, analytics.margins.labor)}%` }}>
                                                                            Labor {analytics.margins.labor.toFixed(0)}%
                                                                        </div>
                                                                        <div className="bg-blue-400 h-full transition-all flex items-center justify-center shrink-0 border-l border-white/40" style={{ width: `${Math.max(12, analytics.margins.opex)}%` }}>
                                                                            OPEX {analytics.margins.opex.toFixed(0)}%
                                                                        </div>
                                                                        {100 - (analytics.margins.cogs + analytics.margins.labor + analytics.margins.opex) > 0 && (
                                                                            <div className="bg-emerald-400 text-emerald-950 h-full transition-all flex items-center justify-center border-l border-white/40 flex-1 min-w-[20px]">
                                                                                利润 {(100 - (analytics.margins.cogs + analytics.margins.labor + analytics.margins.opex)).toFixed(0)}%
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* 2. 对比月堆叠占比 */}
                                                                <div>
                                                                    <div className="flex justify-between items-center text-[10px] sm:text-xs font-black text-gray-500 mb-1.5">
                                                                        <span>对比月成本结构 ({compareMonth})</span>
                                                                        <span className="font-mono text-gray-400">满月净利: {comp.prevCOGSPercent + comp.prevLaborPercent + comp.prevOPEXPercent < 100 ? `${(100 - (comp.prevCOGSPercent + comp.prevLaborPercent + comp.prevOPEXPercent)).toFixed(1)}%` : '0%'}</span>
                                                                    </div>
                                                                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex text-[8px] sm:text-[9px] font-bold text-white text-center leading-5 relative">
                                                                        <div className="bg-red-300/80 h-full transition-all flex items-center justify-center shrink-0" style={{ width: `${Math.max(12, comp.prevCOGSPercent)}%` }}>
                                                                            COGS {comp.prevCOGSPercent.toFixed(0)}%
                                                                        </div>
                                                                        <div className="bg-purple-300/80 h-full transition-all flex items-center justify-center shrink-0 border-l border-white/40" style={{ width: `${Math.max(12, comp.prevLaborPercent)}%` }}>
                                                                            Labor {comp.prevLaborPercent.toFixed(0)}%
                                                                        </div>
                                                                        <div className="bg-blue-300/80 h-full transition-all flex items-center justify-center shrink-0 border-l border-white/40" style={{ width: `${Math.max(12, comp.prevOPEXPercent)}%` }}>
                                                                            OPEX {comp.prevOPEXPercent.toFixed(0)}%
                                                                        </div>
                                                                        {100 - (comp.prevCOGSPercent + comp.prevLaborPercent + comp.prevOPEXPercent) > 0 && (
                                                                            <div className="bg-emerald-300/80 text-emerald-950 h-full transition-all flex items-center justify-center border-l border-white/40 flex-1 min-w-[20px]">
                                                                                利润 {(100 - (comp.prevCOGSPercent + comp.prevLaborPercent + comp.prevOPEXPercent)).toFixed(0)}%
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 3. 核心变动分析 */}
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <div className={`p-2.5 rounded-xl border text-center ${shiftBg(comp.cogsPercentShift)}`}>
                                                                    <p className="text-[8px] font-extrabold uppercase tracking-wide text-red-700">COGS占比变动</p>
                                                                    <p className="text-sm font-mono font-black mt-1 tabular-nums">{comp.cogsPercentShift > 0 ? '+' : ''}{comp.cogsPercentShift.toFixed(1)}%</p>
                                                                    <p className="text-[7px] text-gray-400 mt-0.5">占营比：对较</p>
                                                                </div>
                                                                <div className={`p-2.5 rounded-xl border text-center ${shiftBg(comp.laborPercentShift)}`}>
                                                                    <p className="text-[8px] font-extrabold uppercase tracking-wide text-purple-700">Labor占比变动</p>
                                                                    <p className="text-sm font-mono font-black mt-1 tabular-nums">{comp.laborPercentShift > 0 ? '+' : ''}{comp.laborPercentShift.toFixed(1)}%</p>
                                                                    <p className="text-[7px] text-gray-400 mt-0.5">占营比：对较</p>
                                                                </div>
                                                                <div className={`p-2.5 rounded-xl border text-center ${shiftBg(comp.opexPercentShift)}`}>
                                                                    <p className="text-[8px] font-extrabold uppercase tracking-wide text-blue-700">OPEX占比变动</p>
                                                                    <p className="text-sm font-mono font-black mt-1 tabular-nums">{comp.opexPercentShift > 0 ? '+' : ''}{comp.opexPercentShift.toFixed(1)}%</p>
                                                                    <p className="text-[7px] text-gray-400 mt-0.5">占营比：对较</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* TAB 3: 账目轧差 (Comparison Table) */}
                                                    {costCompareTab === 'SHIFT' && (
                                                        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                                                                <table className="w-full text-left border-collapse text-[11px] sm:text-xs">
                                                                    <thead>
                                                                        <tr className="bg-gray-50 border-b border-gray-200 font-black text-gray-600">
                                                                            <th className="p-2 sm:p-2.5">核心大类成本</th>
                                                                            <th className="p-2 sm:p-2.5 text-right font-mono">本月 ({startDate.slice(5, 7)})</th>
                                                                            <th className="p-2 sm:p-2.5 text-right font-mono text-gray-400">对比 ({compareMonth.slice(5, 7)})</th>
                                                                            <th className="p-2 sm:p-2.5 text-right font-mono">净变动 (RM / %)</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100 font-medium">
                                                                        {/* COGS */}
                                                                        <tr onClick={() => handleDrillDown({ type: 'COGS' }, '销货成本 (COGS)')} className="hover:bg-gray-50/50 cursor-pointer">
                                                                            <td className="p-2 sm:p-2.5 text-gray-750 font-bold flex items-center gap-1 text-[11px]">
                                                                                <span className="text-red-500">🔴</span> 销货成本 COGS
                                                                            </td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono font-bold tabular-nums text-gray-900">{formatMoney(analytics.costs.totalCOGS)}</td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono text-gray-400 tabular-nums">{formatMoney(comp.prevCOGS)}</td>
                                                                            <td className={`p-2 sm:p-2.5 text-right font-mono tabular-nums`}>
                                                                                <span className={shiftColor(analytics.costs.totalCOGS - comp.prevCOGS)}>{analytics.costs.totalCOGS >= comp.prevCOGS ? '+' : ''}{formatMoney(analytics.costs.totalCOGS - comp.prevCOGS)}</span>
                                                                                <span className="text-[8px] text-gray-400 block font-bold">
                                                                                    {analytics.costs.totalCOGS >= comp.prevCOGS ? '↑' : '↓'} {comp.prevCOGS > 0 ? (((analytics.costs.totalCOGS - comp.prevCOGS) / comp.prevCOGS) * 100).toFixed(0) : '0'}%
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                        {/* Labor */}
                                                                        <tr onClick={() => handleDrillDown({ type: 'LABOR' }, '人工薪资 (Labor)')} className="hover:bg-gray-50/50 cursor-pointer">
                                                                            <td className="p-2 sm:p-2.5 text-gray-755 font-bold flex items-center gap-1 text-[11px]">
                                                                                <span className="text-purple-500">🟣</span> 人工成本 Labor
                                                                            </td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono font-bold tabular-nums text-gray-900">{formatMoney(analytics.costs.totalLabor)}</td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono text-gray-400 tabular-nums">{formatMoney(comp.prevLabor)}</td>
                                                                            <td className={`p-2 sm:p-2.5 text-right font-mono tabular-nums`}>
                                                                                <span className={shiftColor(analytics.costs.totalLabor - comp.prevLabor)}>{analytics.costs.totalLabor >= comp.prevLabor ? '+' : ''}{formatMoney(analytics.costs.totalLabor - comp.prevLabor)}</span>
                                                                                <span className="text-[8px] text-gray-400 block font-bold">
                                                                                    {analytics.costs.totalLabor >= comp.prevLabor ? '↑' : '↓'} {comp.prevLabor > 0 ? (((analytics.costs.totalLabor - comp.prevLabor) / comp.prevLabor) * 100).toFixed(0) : '0'}%
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                        {/* OPEX */}
                                                                        <tr onClick={() => handleDrillDown({ type: 'OPEX' }, '纯门店运营支出 (Store OPEX)')} className="hover:bg-gray-50/50 cursor-pointer">
                                                                            <td className="p-2 sm:p-2.5 text-gray-750 font-bold flex items-center gap-1 text-[11px]">
                                                                                <span className="text-blue-500">🔵</span> 运营支出 OPEX
                                                                            </td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono font-bold tabular-nums text-gray-900">{formatMoney(analytics.costs.totalOPEX)}</td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono text-gray-400 tabular-nums">{formatMoney(comp.prevOPEX)}</td>
                                                                            <td className={`p-2 sm:p-2.5 text-right font-mono tabular-nums`}>
                                                                                <span className={shiftColor(analytics.costs.totalOPEX - comp.prevOPEX)}>{analytics.costs.totalOPEX >= comp.prevOPEX ? '+' : ''}{formatMoney(analytics.costs.totalOPEX - comp.prevOPEX)}</span>
                                                                                <span className="text-[8px] text-gray-400 block font-bold">
                                                                                    {analytics.costs.totalOPEX >= comp.prevOPEX ? '↑' : '↓'} {comp.prevOPEX > 0 ? (((analytics.costs.totalOPEX - comp.prevOPEX) / comp.prevOPEX) * 100).toFixed(0) : '0'}%
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                        {/* Total Store Costs */}
                                                                        <tr className="bg-gray-50 font-black border-t border-gray-200">
                                                                            <td className="p-2 sm:p-2.5 text-gray-900 flex items-center gap-1 text-[11px]">
                                                                                <span className="text-gray-900">👑</span> 店面支出总额
                                                                            </td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono tabular-nums text-[#1A1A1A]">{formatMoney(analytics.costs.totalStoreCosts)}</td>
                                                                            <td className="p-2 sm:p-2.5 text-right font-mono text-gray-400 tabular-nums">{formatMoney(comp.prevStoreCosts)}</td>
                                                                            <td className={`p-2 sm:p-2.5 text-right font-mono tabular-nums`}>
                                                                                <span className={shiftColor(analytics.costs.totalStoreCosts - comp.prevStoreCosts)}>{analytics.costs.totalStoreCosts >= comp.prevStoreCosts ? '+' : ''}{formatMoney(analytics.costs.totalStoreCosts - comp.prevStoreCosts)}</span>
                                                                                <span className="text-[8px] text-gray-400 block font-bold">
                                                                                    {analytics.costs.totalStoreCosts >= comp.prevStoreCosts ? '↑' : '↓'} {comp.prevStoreCosts > 0 ? (((analytics.costs.totalStoreCosts - comp.prevStoreCosts) / comp.prevStoreCosts) * 100).toFixed(0) : '0'}%
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <p className="text-[9px] text-gray-400 font-bold px-1 uppercase">注：人工成本 (Labor) 已通过“当期实际营业天数”进行折算对齐，确保对比口径等价无漏洞。</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <button onClick={() => handleDrillDown({ type: 'DELIVERY_COST' }, '外卖专属损耗')} className="w-full bg-orange-50 p-3.5 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl border border-orange-200 text-left hover:shadow-md transition-all active:scale-[0.98] group flex justify-between items-center gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[9px] sm:text-[10px] font-bold text-orange-600 uppercase mb-0.5 sm:mb-1">Delivery Costs (外卖损耗)</p>
                                            <p className="text-lg sm:text-xl md:text-2xl font-black text-orange-900 font-mono tracking-tighter tabular-nums">{formatMoney(analytics.pnl.totalDeliveryDirectCost)}</p>
                                            <p className="text-[8px] sm:text-[9px] text-orange-500 mt-0.5 sm:mt-1 leading-tight">含 Grab 抽佣/广告与延后对账费用</p>
                                        </div>
                                        <ChevronRight size={18} className="text-orange-300 group-hover:text-orange-500 transition-colors shrink-0 sm:w-5 sm:h-5"/>
                                    </button>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
                                        <button onClick={() => handleDrillDown({ type: 'COGS' }, '销货成本 (COGS)')} className="bg-red-50 p-3 sm:p-3.5 md:p-5 rounded-xl sm:rounded-2xl md:rounded-[2rem] border border-red-100 text-left hover:shadow-md transition-all active:scale-[0.98] group">
                                            <div className="flex justify-between items-center mb-1 sm:mb-2 gap-1"><p className="text-[9px] sm:text-[10px] font-bold text-red-600 uppercase truncate">COGS</p>{renderMoM(analytics.mom.cogs, true)}</div>
                                            <p className="text-base sm:text-lg md:text-2xl font-black text-[#1A1A1A] font-mono tracking-tighter tabular-nums">{formatMoney(analytics.costs.totalCOGS)}</p>
                                        </button>
                                        <button onClick={() => handleDrillDown({ type: 'LABOR' }, '人工薪资 (Labor)')} className="bg-purple-50 p-3 sm:p-3.5 md:p-5 rounded-xl sm:rounded-2xl md:rounded-[2rem] border border-purple-100 text-left hover:shadow-md transition-all active:scale-[0.98] group">
                                            <div className="flex justify-between items-center mb-1 sm:mb-2 gap-1"><p className="text-[9px] sm:text-[10px] font-bold text-purple-600 uppercase truncate">Labor</p>{renderMoM(analytics.mom.labor, true)}</div>
                                            <p className="text-base sm:text-lg md:text-2xl font-black text-[#1A1A1A] font-mono tracking-tighter tabular-nums">{formatMoney(analytics.costs.totalLabor)}</p>
                                        </button>
                                        <button onClick={() => handleDrillDown({ type: 'OPEX' }, '纯门店运营支出 (Store OPEX)')} className="bg-blue-50 p-3 sm:p-3.5 md:p-5 rounded-xl sm:rounded-2xl md:rounded-[2rem] border border-blue-100 text-left hover:shadow-md transition-all active:scale-[0.98] group">
                                            <div className="flex justify-between items-center mb-1 sm:mb-2 gap-1"><p className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase truncate">OPEX</p>{renderMoM(analytics.mom.opex, true)}</div>
                                            <p className="text-base sm:text-lg md:text-2xl font-black text-[#1A1A1A] font-mono tracking-tighter tabular-nums">{formatMoney(analytics.costs.totalOPEX)}</p>
                                        </button>
                                        <button onClick={() => handleDrillDown({ type: 'CAPEX' }, '资本支出 (CAPEX)')} className="bg-gray-100 p-3 sm:p-3.5 md:p-5 rounded-xl sm:rounded-2xl md:rounded-[2rem] border border-gray-200 text-left hover:shadow-md transition-all active:scale-[0.98] group">
                                            <div className="flex justify-between items-center mb-1 sm:mb-2 gap-1"><p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase truncate">CAPEX</p></div>
                                            <p className="text-base sm:text-lg md:text-2xl font-black text-[#1A1A1A] font-mono tracking-tighter tabular-nums">{formatMoney(analytics.costs.totalCapex)}</p>
                                        </button>
                                    </div>

                                    {/* 👑 TOP MOVERS — 品类涨跌排行 */}
                                    {analytics.topMovers && analytics.topMovers.length > 0 && (
                                        <div className="bg-gradient-to-r from-gray-50 to-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm">
                                            <h4 className="text-[10px] sm:text-xs font-black text-[#1A1A1A] uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <TrendingUp size={14} className="text-orange-500"/> 成本变动排行 (vs 上月)
                                            </h4>
                                            <div className="space-y-1.5">
                                                {analytics.topMovers.map((g: any) => {
                                                    const delta = g.delta || 0;
                                                    const isUp = delta > 0;
                                                    return (
                                                        <div key={g.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isUp ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                                    {isUp ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                                                                </span>
                                                                <span className="text-xs font-bold text-gray-700 truncate">{g.label}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className={`text-[10px] font-black tabular-nums ${isUp ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {isUp ? '+' : '-'}{formatMoney(Math.abs(delta))}
                                                                </span>
                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                                    {isUp ? '↑' : '↓'}{Math.abs(g.deltaPct || 0).toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* 👑 薪资预测增强卡片 — 同步 Payroll */}
                                    <div className="bg-purple-50/80 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-sm border border-purple-200 border-dashed">
                                        <h4 className="font-black text-xs sm:text-sm uppercase tracking-wider mb-3 flex items-center gap-2 text-purple-800"><Users size={16} className="text-purple-500"/> 员工薪资预测</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                                            {/* 薪资总额 */}
                                            <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm">
                                                <p className="text-[9px] text-purple-600 font-bold mb-1">
                                                    {analytics.payrollForecast.source === 'POSTED' ? '✅ 已结账 (Actual)' :
                                                     analytics.payrollForecast.source === 'DRAFT' ? '📝 草稿数据 (Live Draft)' :
                                                     analytics.payrollForecast.source === 'BASIC_SALARY' ? '⏳ 预估 (Forecast)' :
                                                     '❓ 无数据'}
                                                </p>
                                                <p className={`text-lg sm:text-xl font-mono font-black tabular-nums ${analytics.payrollForecast.isPosted ? 'text-purple-900' : 'text-purple-400'}`}>
                                                    {formatMoney(analytics.payrollForecast.amount)}
                                                </p>
                                                <p className="text-[8px] text-gray-400 mt-1">{analytics.payrollForecast.activeStaffCount} 名在职</p>
                                            </div>
                                            {/* 扣薪后剩余 */}
                                            <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm">
                                                <p className="text-[9px] text-gray-500 font-bold mb-1">
                                                    {analytics.payrollForecast.isPosted ? '净利润 (已含薪资)' : '扣薪后预估净利'}
                                                </p>
                                                <p className={`text-lg sm:text-xl font-mono font-black tabular-nums ${analytics.payrollForecast.afterPayrollNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                    {formatMoney(analytics.payrollForecast.isPosted ? analytics.netProfit : analytics.payrollForecast.afterPayrollNet)}
                                                </p>
                                                {analytics.payrollForecast.source === 'DRAFT' && <p className="text-[8px] text-blue-500 mt-1">📝 Payroll 草稿实时同步</p>}
                                                {analytics.payrollForecast.source === 'BASIC_SALARY' && <p className="text-[8px] text-orange-500 mt-1">⚠️ 未结账，基于底薪预估</p>}
                                                {analytics.payrollForecast.source === 'NONE' && <p className="text-[8px] text-red-500 mt-1">🚨 当月暂无薪资数据</p>}
                                            </div>
                                            {/* 薪资占比 */}
                                            <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm">
                                                <p className="text-[9px] text-gray-500 font-bold mb-1">薪资占净营收</p>
                                                <p className="text-lg sm:text-xl font-mono font-black text-purple-700 tabular-nums">
                                                    {analytics.pnl.netRealizedRevenue > 0 ? ((analytics.payrollForecast.amount / analytics.pnl.netRealizedRevenue) * 100).toFixed(1) : '0.0'}%
                                                </p>
                                                <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                                                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, analytics.pnl.netRealizedRevenue > 0 ? (analytics.payrollForecast.amount / analytics.pnl.netRealizedRevenue) * 100 : 0)}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 👑 每日人工核算 — 保本门槛计算器 */}
                                    <div className="bg-amber-50/80 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-sm border border-amber-300 border-dashed">
                                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                            <h4 className="font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 text-amber-800">
                                                <BarChart3 size={16} className="text-amber-600"/> 人均 / 每日人工核算
                                            </h4>
                                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                                月薪 ÷ {dailyLaborBreakdown.daysInMonth}天 · 已结算 {dailyLaborBreakdown.settledDays} 天
                                            </span>
                                        </div>

                                        {/* Row 1: 每日 / 人均 / 期间应承担 */}
                                        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
                                            <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-amber-200">
                                                <p className="text-[9px] text-amber-700 font-bold mb-1 uppercase">每日人工成本</p>
                                                <p className="text-sm sm:text-lg font-mono font-black text-amber-900 tabular-nums">{formatMoney(dailyLaborBreakdown.dailyLabor)}</p>
                                                <p className="text-[8px] text-gray-400 mt-1">月薪 ÷ {dailyLaborBreakdown.daysInMonth} 天</p>
                                            </div>
                                            <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-amber-200">
                                                <p className="text-[9px] text-amber-700 font-bold mb-1 uppercase">人均每日</p>
                                                <p className="text-sm sm:text-lg font-mono font-black text-amber-900 tabular-nums">{formatMoney(dailyLaborBreakdown.perEmployeeDaily)}</p>
                                                <p className="text-[8px] text-gray-400 mt-1">{dailyLaborBreakdown.staffCount} 名 / 每天</p>
                                            </div>
                                            <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-amber-200">
                                                <p className="text-[9px] text-amber-700 font-bold mb-1 uppercase">期间累计应承担</p>
                                                <p className="text-sm sm:text-lg font-mono font-black text-amber-900 tabular-nums">{formatMoney(dailyLaborBreakdown.periodAccrued)}</p>
                                                <p className="text-[8px] text-gray-400 mt-1">1号 至今 共 {dailyLaborBreakdown.settledDays} 天</p>
                                            </div>
                                        </div>

                                        {/* Row 2: 保本门槛 — 黑金核心 */}
                                        <div className="bg-[#1A1A1A] p-3 sm:p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1">
                                                <p className="text-[10px] sm:text-[11px] font-black text-[#FFD700] uppercase tracking-wider">💡 每日营收保本门槛</p>
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                                                    !dailyLaborBreakdown.hasValidData ? 'bg-gray-500 text-white' :
                                                    dailyLaborBreakdown.laborCoverageRatio >= 1.8 ? 'bg-emerald-500 text-white' :
                                                    dailyLaborBreakdown.laborCoverageRatio >= 1.2 ? 'bg-amber-400 text-amber-900' :
                                                    dailyLaborBreakdown.laborCoverageRatio >= 1.0 ? 'bg-orange-500 text-white' :
                                                    'bg-red-600 text-white'
                                                }`}>
                                                    {!dailyLaborBreakdown.hasValidData ? '📊 数据不足' :
                                                     dailyLaborBreakdown.laborCoverageRatio >= 1.8 ? '✅ 健康' :
                                                     dailyLaborBreakdown.laborCoverageRatio >= 1.2 ? '⚠️ 紧张' :
                                                     dailyLaborBreakdown.laborCoverageRatio >= 1.0 ? '🟠 危险' :
                                                     '🚨 亏损中'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                                <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-700">
                                                    <p className="text-[8px] text-gray-400 font-bold mb-0.5 uppercase">仅覆盖人工</p>
                                                    <p className="text-sm sm:text-base font-mono font-black text-[#FFD700] tabular-nums">{formatMoney(dailyLaborBreakdown.breakEvenLaborOnly)}</p>
                                                </div>
                                                <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-700">
                                                    <p className="text-[8px] text-gray-400 font-bold mb-0.5 uppercase">含 OPEX 全保本</p>
                                                    <p className="text-sm sm:text-base font-mono font-black text-white tabular-nums">{formatMoney(dailyLaborBreakdown.breakEvenFull)}</p>
                                                </div>
                                            </div>
                                            <div className="mt-2.5 pt-2.5 border-t border-gray-700 flex items-center justify-between flex-wrap gap-1">
                                                <p className="text-[9px] text-gray-400 font-bold uppercase">期间实际日均营收</p>
                                                <p className={`text-sm sm:text-base font-mono font-black tabular-nums ${
                                                    dailyLaborBreakdown.avgDailyRevenue >= dailyLaborBreakdown.breakEvenFull ? 'text-emerald-400' :
                                                    dailyLaborBreakdown.avgDailyRevenue >= dailyLaborBreakdown.breakEvenLaborOnly ? 'text-amber-300' :
                                                    'text-red-400'
                                                }`}>
                                                    {formatMoney(dailyLaborBreakdown.avgDailyRevenue)}
                                                </p>
                                            </div>
                                            {analytics.payrollForecast.source === 'DRAFT' && (
                                                <p className="text-[8px] text-blue-300 mt-2 font-bold">📝 数值基于 Payroll 草稿实时数据 (含 OT/津贴/扣款) — 比底薪更准</p>
                                            )}
                                            {analytics.payrollForecast.source === 'BASIC_SALARY' && (
                                                <p className="text-[8px] text-orange-300 mt-2 font-bold">⚠️ 当月薪资未编辑，数值基于在职员工底薪预估</p>
                                            )}
                                        </div>

                                        {/* 👑 智能期中薪资与预支计算器 (Interactive Pro-rata Payroll Estimator) */}
                                        <div className="mt-3 bg-purple-50 p-3 sm:p-4 rounded-xl border border-purple-200 shadow-sm">
                                            <div className="flex items-center justify-between mb-1">
                                                <h5 className="text-[10px] sm:text-[11px] font-black uppercase text-purple-900 tracking-wider flex items-center gap-1">
                                                    💼 期中薪资与预支计算器 (Pro-rata Estimator)
                                                </h5>
                                                <span className="text-[8px] bg-purple-200 text-purple-850 font-extrabold px-1.5 py-0.5 rounded leading-none">EA 1955 规范</span>
                                            </div>
                                            <p className="text-[9px] text-gray-500 mb-2 leading-tight">
                                                未满工作月(Incomplete Month)底薪按当前选择天数折算，智能扣除该员工当月在人事中心已预支的薪金。
                                            </p>

                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                                                {/* 员工快速选取 */}
                                                <div className="col-span-2">
                                                    <label className="text-[8px] font-bold text-gray-500 uppercase block mb-0.5">选择在职员工 (同步人事档案)</label>
                                                    <select 
                                                        className="w-full bg-white p-1 rounded border border-gray-200 text-[10px] font-bold outline-none focus:ring-1 focus:ring-purple-400"
                                                        value={calcSelectedEmp}
                                                        onChange={e => handleSelectEmpForCalc(e.target.value)}
                                                    >
                                                        <option value="CUSTOM">-- 自定义测算实例 (RM 1,700 示例) --</option>
                                                        {(employees || []).filter((emp: any) => emp.status !== 'TERMINATED' && !emp.isArchived).map((emp: any) => (
                                                            <option key={emp.id} value={emp.id}>{emp.name} (底薪: RM {Number(emp.basicSalary).toFixed(0)})</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* 月薪基数 */}
                                                <div>
                                                    <label className="text-[8px] font-bold text-gray-500 uppercase block mb-0.5">月本位底薪 (RM)</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-white p-1 rounded border border-gray-200 text-[10px] font-mono font-bold outline-none focus:ring-1 focus:ring-purple-400"
                                                        value={calcBasicSalary}
                                                        onChange={e => { setCalcSelectedEmp('CUSTOM'); setCalcBasicSalary(parseFloat(e.target.value) || 0); }}
                                                    />
                                                </div>

                                                {/* 当月总天数 */}
                                                <div>
                                                    <label className="text-[8px] font-bold text-gray-500 uppercase block mb-0.5">当月工作基数天数</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-white p-1 rounded border border-gray-200 text-[10px] font-mono font-bold outline-none"
                                                        value={calcDaysInMonth}
                                                        onChange={e => setCalcDaysInMonth(parseInt(e.target.value) || 30)}
                                                    />
                                                </div>

                                                {/* 工作截止号 */}
                                                <div>
                                                    <label className="text-[8px] font-bold text-purple-700 uppercase block mb-0.5">做到几号 (截止日天数)</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-white p-1 rounded border border-purple-300 text-[11px] font-mono font-black text-purple-800 outline-none"
                                                        value={calcWorkedDays}
                                                        onChange={e => setCalcWorkedDays(parseInt(e.target.value) || 22)}
                                                    />
                                                </div>

                                                {/* 已领预支 */}
                                                <div>
                                                    <label className="text-[8px] font-bold text-red-500 uppercase block mb-0.5">已预支金额 (RM)</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-white p-1 rounded border border-red-200 text-[10px] font-mono font-bold text-red-600 outline-none"
                                                        value={calcAdvance}
                                                        onChange={e => setCalcAdvance(parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>

                                            {/* 计算器核心结果渲染 */}
                                            {(() => {
                                                const proRatedBasic = (calcBasicSalary / calcDaysInMonth) * calcWorkedDays;
                                                const netPayable = Math.max(0, proRatedBasic - calcAdvance);
                                                return (
                                                    <div className="bg-[#1A1A1A] text-white rounded-lg p-2 flex justify-between items-center text-xs border border-gray-800 mt-2">
                                                        <div className="space-y-0.5">
                                                            <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider font-mono">
                                                                (RM {calcBasicSalary.toFixed(0)} ÷ {calcDaysInMonth}天) × {calcWorkedDays}天 {calcAdvance > 0 ? ` - 预支 RM ${calcAdvance.toFixed(0)}` : ''}
                                                            </div>
                                                            <div className="flex gap-2 text-[9px] text-[#FFD700]">
                                                                <span>应付底薪: <span className="font-mono font-bold text-white">RM {proRatedBasic.toFixed(2)}</span></span>
                                                                {calcAdvance > 0 && <span>已扣减预支: <span className="font-mono font-bold text-red-400">-RM {calcAdvance.toFixed(2)}</span></span>}
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-[7px] text-emerald-400 font-black uppercase">本期大概付款工资</p>
                                                            <p className="text-sm font-mono font-extrabold text-emerald-400 tabular-nums">RM {netPayable.toFixed(2)}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* 👑 月底净利预测 + 缺口提示 */}
                                        <div className={`mt-3 p-3 sm:p-3.5 rounded-xl border-2 ${
                                            !dailyLaborBreakdown.hasValidData ? 'bg-gray-50 border-gray-300' :
                                            dailyLaborBreakdown.projectedNetProfit >= 0 ? 'bg-emerald-50 border-emerald-300' :
                                            'bg-red-50 border-red-300'
                                        }`}>
                                            {!dailyLaborBreakdown.hasValidData ? (
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[11px] font-black text-gray-600 uppercase tracking-wider">📊 数据不足以预测</p>
                                                    <p className="text-[9px] text-gray-500 font-bold">
                                                        {dailyLaborBreakdown.hasLaborOnly ? '请先录入本月结算数据' :
                                                         dailyLaborBreakdown.hasSalesOnly ? '请先在 Payroll 编辑当月薪资' :
                                                         '请录入薪资 + 结算数据'}
                                                    </p>
                                                </div>
                                            ) : (
                                            <>
                                            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                                                <p className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider ${
                                                    dailyLaborBreakdown.projectedNetProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
                                                }`}>📈 月底预测 ({dailyLaborBreakdown.daysInMonth}天满月推算)</p>
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                                                    dailyLaborBreakdown.projectedNetProfit >= 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                                                }`}>
                                                    {dailyLaborBreakdown.projectedNetProfit >= 0 ? '✅ 预计盈利' : '🚨 预计亏损'}
                                                </span>
                                            </div>
                                            {/* 👑 iOS 适配：手机竖排(标签左/数值右)，sm+ 才恢复三列 — 防大额溢出重叠 */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                                                <div className="flex justify-between items-center sm:block bg-white/50 sm:bg-transparent rounded-lg px-2 py-1.5 sm:p-0">
                                                    <p className="text-[9px] text-gray-500 font-bold uppercase shrink-0">月底预估营收</p>
                                                    <p className="text-sm sm:text-lg font-mono font-black text-gray-800 tabular-nums">{formatMoney(dailyLaborBreakdown.projectedMonthRevenue)}</p>
                                                </div>
                                                <div className="flex justify-between items-center sm:block bg-white/50 sm:bg-transparent rounded-lg px-2 py-1.5 sm:p-0">
                                                    <p className="text-[9px] text-gray-500 font-bold uppercase shrink-0">月底预估净利</p>
                                                    <p className={`text-sm sm:text-lg font-mono font-black tabular-nums ${
                                                        dailyLaborBreakdown.projectedNetProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                                                    }`}>{formatMoney(dailyLaborBreakdown.projectedNetProfit)}</p>
                                                </div>
                                                <div className="flex justify-between items-center sm:block bg-white/50 sm:bg-transparent rounded-lg px-2 py-1.5 sm:p-0">
                                                    <p className="text-[9px] text-gray-500 font-bold uppercase shrink-0">预估净利率</p>
                                                    <p className={`text-sm sm:text-lg font-mono font-black tabular-nums ${
                                                        dailyLaborBreakdown.projectedMargin >= 0 ? 'text-emerald-700' : 'text-red-600'
                                                    }`}>{dailyLaborBreakdown.projectedMargin.toFixed(1)}%</p>
                                                </div>
                                            </div>

                                            {/* 缺口/扳平提示 */}
                                            {dailyLaborBreakdown.projectedNetProfit < 0 && dailyLaborBreakdown.remainingDays > 0 && (
                                                <div className="mt-2.5 pt-2.5 border-t border-red-200">
                                                    <p className="text-[10px] sm:text-[11px] font-black text-red-700">
                                                        ⚡ 扳平方案：剩余 <span className="text-base">{dailyLaborBreakdown.remainingDays}</span> 天 每日需做 <span className="font-mono text-base">{formatMoney(dailyLaborBreakdown.catchUpDailyRevenue)}</span> 才能月底回本
                                                    </p>
                                                </div>
                                            )}
                                            {dailyLaborBreakdown.dailyGap < 0 && dailyLaborBreakdown.projectedNetProfit >= 0 && (
                                                <div className="mt-2.5 pt-2.5 border-t border-amber-200">
                                                    <p className="text-[10px] sm:text-[11px] font-black text-amber-700">
                                                        ⚠️ 当前日均比全保本门槛缺 <span className="font-mono">{formatMoney(Math.abs(dailyLaborBreakdown.dailyGap))}</span>/天 (靠月初存货撑住)
                                                    </p>
                                                </div>
                                            )}
                                            {dailyLaborBreakdown.dailyGap > 0 && (
                                                <div className="mt-2.5 pt-2.5 border-t border-emerald-200">
                                                    <p className="text-[10px] sm:text-[11px] font-black text-emerald-700">
                                                        ✅ 当前日均超出全保本 <span className="font-mono">{formatMoney(dailyLaborBreakdown.dailyGap)}</span>/天 — 健康跑道
                                                    </p>
                                                </div>
                                            )}
                                            </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                        {/* COGS Accordion */}
                                        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200">
                                            <div className="flex justify-between items-center cursor-pointer select-none group" onClick={() => toggleAccordion('COGS')}>
                                                <h4 className="font-black text-xs sm:text-sm text-[#1A1A1A] uppercase tracking-wider sm:tracking-widest border-b-2 border-transparent group-hover:border-red-500 pb-1 transition-all">COGS 明细</h4>
                                                {expandedSections['COGS'] ? <ChevronUp size={18} className="text-gray-400 sm:w-5 sm:h-5"/> : <ChevronDown size={18} className="text-gray-400 group-hover:text-red-500 sm:w-5 sm:h-5"/>}
                                            </div>
                                            {expandedSections['COGS'] && (
                                                <div className="space-y-1.5 sm:space-y-2 mt-3 sm:mt-4 max-h-[400px] overflow-y-auto touch-pan-y animate-in slide-in-from-top-2 border-t border-gray-100 pt-3 sm:pt-4">
                                                    {analytics.lists.cogsList.map((g: any) => {
                                                        // 👑 Seafood Breakdown Card
                                                        if (g.id === 'INGREDIENT_SEAFOOD') {
                                                            const sb = seafoodBreakdown;
                                                            return (
                                                                <div key={g.id} className="mb-1.5 rounded-xl border border-blue-200 overflow-hidden bg-blue-50/40">
                                                                    {/* 一级：海鲜总额 */}
                                                                    <div onClick={() => setSeafoodExpanded(v => !v)} className="p-2.5 sm:p-3 cursor-pointer hover:bg-blue-50 transition-colors active:scale-[0.99]">
                                                                        <div className="flex justify-between items-center gap-2">
                                                                            <span className="text-xs sm:text-sm font-black text-blue-900 flex items-center gap-1.5">
                                                                                {seafoodExpanded ? <ChevronUp size={14} className="text-blue-500"/> : <ChevronDown size={14} className="text-blue-500"/>}
                                                                                🦑 {g.label}
                                                                            </span>
                                                                            <span className="font-mono text-xs sm:text-sm font-black text-blue-900 tabular-nums">{formatMoney(g.amount)}</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* 展开：海鲜二级细分 */}
                                                                    {seafoodExpanded && (
                                                                        <div className="px-2 pb-2 space-y-1.5 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                            {sb.subCatList.length === 0 && sb.uncategorizedAmount === 0 && (
                                                                                <p className="text-[10px] text-gray-400 italic text-center py-2 font-bold">本期无海鲜细分明细</p>
                                                                            )}
                                                                            {sb.subCatList.map(sc => (
                                                                                <SubComparisonRow
                                                                                    key={sc.key}
                                                                                    label={`${SEAFOOD_SUBCAT_EMOJIS[sc.key as keyof typeof SEAFOOD_SUBCAT_EMOJIS] || '🦐'} ${SEAFOOD_SUBCAT_LABELS[sc.key as keyof typeof SEAFOOD_SUBCAT_LABELS] || sc.key}`}
                                                                                    amount={sc.amount}
                                                                                    prevAmount={sc.prevAmount}
                                                                                    delta={sc.delta}
                                                                                    deltaPct={sc.deltaPct}
                                                                                    pct={sc.pct}
                                                                                    bgTheme="blue"
                                                                                    onClick={() => handleDrillDown({ categoryId: 'INGREDIENT_SEAFOOD', seafoodSubCat: sc.key }, `${SEAFOOD_SUBCAT_EMOJIS[sc.key as keyof typeof SEAFOOD_SUBCAT_EMOJIS] || '🦐'} ${SEAFOOD_SUBCAT_LABELS[sc.key as keyof typeof SEAFOOD_SUBCAT_LABELS] || sc.key}`)}
                                                                                />
                                                                            ))}

                                                                            {/* 未分类海鲜 */}
                                                                            {sb.uncategorizedAmount > 0 && (
                                                                                <div onClick={() => handleDrillDown({ categoryId: 'INGREDIENT_SEAFOOD', seafoodSubCat: '__UNCATEGORIZED__' }, '❓ 未分类海鲜')} className="bg-gray-50 hover:bg-gray-100 p-2.5 rounded-xl border border-dashed border-gray-200 cursor-pointer transition-all flex justify-between items-center text-[10px] sm:text-xs">
                                                                                    <span className="font-bold text-gray-500 flex items-center gap-1.5">
                                                                                        ❓ 未细分海鲜 ({sb.uncategorizedCount}笔)
                                                                                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">回 AP 补类目</span>
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {sb.uncategorizedPrevAmount > 0 && sb.uncategorizedDelta !== 0 && (
                                                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${sb.uncategorizedDelta > 0 ? 'bg-red-55 text-red-600' : 'bg-green-55 text-green-600'}`}>
                                                                                                {sb.uncategorizedDelta > 0 ? '↑' : '↓'} {Math.abs(sb.uncategorizedDeltaPct).toFixed(0)}%
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="font-mono text-gray-700 font-bold">{formatMoney(sb.uncategorizedAmount)}</span>
                                                                                        {sb.uncategorizedPrevAmount > 0 && (
                                                                                            <span className="text-gray-400 font-mono text-[9px] border-l border-gray-200 pl-1.5">上期: {sb.uncategorizedPrevAmount.toFixed(0)}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        // 👑 Beverage Breakdown Card
                                                        if (g.id === 'BEVERAGE') {
                                                            const bb = beverageBreakdown;
                                                            return (
                                                                <div key={g.id} className="mb-1.5 rounded-xl border border-indigo-200 overflow-hidden bg-indigo-50/40">
                                                                    {/* 一级：水吧总额 */}
                                                                    <div onClick={() => setBeverageExpanded(v => !v)} className="p-2.5 sm:p-3 cursor-pointer hover:bg-indigo-50 transition-colors active:scale-[0.99]">
                                                                        <div className="flex justify-between items-center gap-2">
                                                                            <span className="text-xs sm:text-sm font-black text-indigo-900 flex items-center gap-1.5">
                                                                                {beverageExpanded ? <ChevronUp size={14} className="text-indigo-500"/> : <ChevronDown size={14} className="text-indigo-500"/>}
                                                                                🥤 {g.label}
                                                                            </span>
                                                                            <span className="font-mono text-xs sm:text-sm font-black text-indigo-900 tabular-nums">{formatMoney(g.amount)}</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* 展开：水吧二级细分 */}
                                                                    {beverageExpanded && (
                                                                        <div className="px-2 pb-2 space-y-1.5 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                            {bb.subCatList.length === 0 && bb.uncategorizedAmount === 0 && (
                                                                                <p className="text-[10px] text-gray-400 italic text-center py-2 font-bold">本期无水吧细分明细</p>
                                                                            )}
                                                                            {bb.subCatList.map(sc => (
                                                                                <SubComparisonRow
                                                                                    key={sc.key}
                                                                                    label={`${BEVERAGE_SUBCAT_EMOJIS[sc.key as keyof typeof BEVERAGE_SUBCAT_EMOJIS] || '🍹'} ${BEVERAGE_SUBCAT_LABELS[sc.key as keyof typeof BEVERAGE_SUBCAT_LABELS] || sc.key}`}
                                                                                    amount={sc.amount}
                                                                                    prevAmount={sc.prevAmount}
                                                                                    delta={sc.delta}
                                                                                    deltaPct={sc.deltaPct}
                                                                                    pct={sc.pct}
                                                                                    bgTheme="indigo"
                                                                                    onClick={() => handleDrillDown({ categoryId: 'BEVERAGE', beverageSubCat: sc.key }, `${BEVERAGE_SUBCAT_EMOJIS[sc.key as keyof typeof BEVERAGE_SUBCAT_EMOJIS] || '🍹'} ${BEVERAGE_SUBCAT_LABELS[sc.key as keyof typeof BEVERAGE_SUBCAT_LABELS] || sc.key}`)}
                                                                                />
                                                                            ))}

                                                                            {/* 未分类水吧 */}
                                                                            {bb.uncategorizedAmount > 0 && (
                                                                                <div onClick={() => handleDrillDown({ categoryId: 'BEVERAGE', beverageSubCat: '__UNCATEGORIZED__' }, '❓ 未分类水吧')} className="bg-gray-50 hover:bg-gray-100 p-2.5 rounded-xl border border-dashed border-gray-200 cursor-pointer transition-all flex justify-between items-center text-[10px] sm:text-xs">
                                                                                    <span className="font-bold text-gray-500 flex items-center gap-1.5">
                                                                                        ❓ 未细分水吧 ({bb.uncategorizedCount}笔)
                                                                                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">回 AP 补类目</span>
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {bb.uncategorizedPrevAmount > 0 && bb.uncategorizedDelta !== 0 && (
                                                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${bb.uncategorizedDelta > 0 ? 'bg-red-55 text-red-600' : 'bg-green-55 text-green-600'}`}>
                                                                                                {bb.uncategorizedDelta > 0 ? '↑' : '↓'} {Math.abs(bb.uncategorizedDeltaPct).toFixed(0)}%
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="font-mono text-gray-700 font-bold">{formatMoney(bb.uncategorizedAmount)}</span>
                                                                                        {bb.uncategorizedPrevAmount > 0 && (
                                                                                            <span className="text-gray-400 font-mono text-[9px] border-l border-gray-200 pl-1.5">上期: {bb.uncategorizedPrevAmount.toFixed(0)}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        // 其他 COGS 正常渲染
                                                        return <ComparisonRow key={g.id} g={g} onClick={() => handleDrillDown({ categoryId: g.id }, g.label)} accentHover="hover:bg-red-50"/>;
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Labor & OPEX Accordion */}
                                        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200">
                                            <div className="flex justify-between items-center cursor-pointer select-none group" onClick={() => toggleAccordion('OPEX')}>
                                                <h4 className="font-black text-xs sm:text-sm text-[#1A1A1A] uppercase tracking-wider sm:tracking-widest border-b-2 border-transparent group-hover:border-blue-500 pb-1 transition-all">Labor & OPEX 明细</h4>
                                                {expandedSections['OPEX'] ? <ChevronUp size={18} className="text-gray-400 sm:w-5 sm:h-5"/> : <ChevronDown size={18} className="text-gray-400 group-hover:text-blue-500 sm:w-5 sm:h-5"/>}
                                            </div>
                                            {expandedSections['OPEX'] && (
                                                <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4 max-h-[400px] overflow-y-auto touch-pan-y animate-in slide-in-from-top-2 border-t border-gray-100 pt-3 sm:pt-4">
                                                    <div>
                                                        <p className="text-[9px] sm:text-[10px] font-black text-purple-600 uppercase pl-2 mb-1.5 sm:mb-2">Labor Details</p>
                                                        {analytics.lists.laborList.map((g: any) => (
                                                            <ComparisonRow key={g.id} g={g} onClick={() => handleDrillDown({ categoryId: g.id }, g.label)} accentHover={g.isPending ? 'hover:bg-gray-50 opacity-60' : 'hover:bg-purple-50'}/>
                                                        ))}
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] sm:text-[10px] font-black text-blue-600 uppercase pl-2 mb-1.5 sm:mb-2">Store OPEX Details</p>
                                                        {analytics.lists.opexList.map((g: any) => {
                                                            // 👑 Phase 2: 营销品类 → 渲染可展开的细分层级卡
                                                            if (g.id === 'MARKETING') {
                                                                const mb = marketingBreakdown;
                                                                return (
                                                                    <div key={g.id} className="mb-1.5 rounded-xl border border-amber-200 overflow-hidden bg-amber-50/40">
                                                                        {/* 一级：营销总额 */}
                                                                        <div onClick={() => setMarketingExpanded(v => !v)} className="p-2.5 sm:p-3 cursor-pointer hover:bg-amber-50 transition-colors active:scale-[0.99]">
                                                                            <div className="flex justify-between items-center gap-2">
                                                                                <span className="text-xs sm:text-sm font-black text-amber-900 flex items-center gap-1.5">
                                                                                    {marketingExpanded ? <ChevronUp size={14} className="text-amber-500"/> : <ChevronDown size={14} className="text-amber-500"/>}
                                                                                    📣 {g.label}
                                                                                </span>
                                                                                <span className="font-mono text-xs sm:text-sm font-black text-amber-900 tabular-nums">{formatMoney(g.amount)}</span>
                                                                            </div>
                                                                        </div>

                                                                        {/* 展开：6 个一级细分 */}
                                                                        {marketingExpanded && (
                                                                            <div className="px-2 pb-2 space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                                {mb.subCatList.length === 0 && mb.uncategorizedAmount === 0 && (
                                                                                    <p className="text-[10px] text-gray-400 italic text-center py-2">本期无营销明细</p>
                                                                                )}
                                                                                {mb.subCatList.map(sc => {
                                                                                    const isAd = sc.key === 'AD_OUTPUT';
                                                                                    return (
                                                                                        <div key={sc.key} className="bg-white rounded-lg border border-amber-100">
                                                                                            {/* 二级：细分类型 */}
                                                                                            <div
                                                                                                onClick={() => isAd ? setAdOutputExpanded(v => !v) : handleDrillDown({ categoryId: 'MARKETING', marketingFilter: { subCat: sc.key } }, `${MARKETING_SUBCAT_EMOJIS[sc.key as keyof typeof MARKETING_SUBCAT_EMOJIS]} ${MARKETING_SUBCAT_LABELS[sc.key as keyof typeof MARKETING_SUBCAT_LABELS]}`)}
                                                                                                className="flex justify-between items-center gap-2 p-2 sm:p-2.5 cursor-pointer hover:bg-amber-50/60 rounded-lg transition-colors active:scale-[0.99]"
                                                                                            >
                                                                                                <span className="text-[11px] sm:text-xs font-bold text-gray-700 flex items-center gap-1 min-w-0">
                                                                                                    {isAd && (adOutputExpanded ? <ChevronUp size={12} className="text-sky-500 shrink-0"/> : <ChevronDown size={12} className="text-sky-500 shrink-0"/>)}
                                                                                                    <span className="truncate">{MARKETING_SUBCAT_EMOJIS[sc.key as keyof typeof MARKETING_SUBCAT_EMOJIS]} {MARKETING_SUBCAT_LABELS[sc.key as keyof typeof MARKETING_SUBCAT_LABELS]}</span>
                                                                                                </span>
                                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                                    <span className="text-[8px] sm:text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold tabular-nums">{sc.pct.toFixed(0)}%</span>
                                                                                                    <span className="font-mono text-[11px] sm:text-xs font-black text-gray-800 tabular-nums">{formatMoney(sc.amount)}</span>
                                                                                                    {!isAd && <ChevronRight size={11} className="text-gray-300"/>}
                                                                                                </div>
                                                                                            </div>

                                                                                            {/* 三级：AD_OUTPUT 渠道明细 */}
                                                                                            {isAd && adOutputExpanded && (
                                                                                                <div className="px-2 pb-2 space-y-0.5 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                                                    {sc.channels.length === 0 && <p className="text-[9px] text-gray-400 italic pl-4 py-1">无渠道明细</p>}
                                                                                                    {sc.channels.map(ch => (
                                                                                                        <div
                                                                                                            key={ch.key}
                                                                                                            onClick={() => handleDrillDown({ categoryId: 'MARKETING', marketingFilter: { subCat: 'AD_OUTPUT', channel: ch.key } }, `${AD_CHANNEL_EMOJIS[ch.key as keyof typeof AD_CHANNEL_EMOJIS]} ${AD_CHANNEL_LABELS[ch.key as keyof typeof AD_CHANNEL_LABELS]}`)}
                                                                                                            className="flex justify-between items-center gap-2 py-1.5 pl-5 pr-2 ml-1 border-l-2 border-sky-200 cursor-pointer hover:bg-sky-50/60 rounded-r-lg transition-colors active:scale-[0.99]"
                                                                                                        >
                                                                                                            <span className="text-[10px] sm:text-[11px] font-bold text-sky-700 min-w-0 truncate">{AD_CHANNEL_EMOJIS[ch.key as keyof typeof AD_CHANNEL_EMOJIS]} {AD_CHANNEL_LABELS[ch.key as keyof typeof AD_CHANNEL_LABELS]}</span>
                                                                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                                                                <span className="text-[8px] bg-sky-100 text-sky-700 px-1 py-0.5 rounded font-bold tabular-nums">{ch.pct.toFixed(0)}%</span>
                                                                                                                <span className="font-mono text-[10px] sm:text-[11px] font-black text-sky-800 tabular-nums">{formatMoney(ch.amount)}</span>
                                                                                                                <ChevronRight size={10} className="text-sky-300"/>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                })}

                                                                                {/* 未分类提醒 */}
                                                                                {mb.uncategorizedAmount > 0 && (
                                                                                    <div onClick={() => handleDrillDown({ categoryId: 'MARKETING', marketingFilter: { subCat: '__UNCATEGORIZED__' } }, '❓ 未分类营销')} className="flex justify-between items-center gap-2 p-2 sm:p-2.5 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                                                                                        <span className="text-[11px] sm:text-xs font-bold text-gray-500 flex items-center gap-1">❓ 未分类 ({mb.uncategorizedCount}笔) <span className="text-[8px] text-amber-600">回 AP 补类目</span></span>
                                                                                        <span className="font-mono text-[11px] sm:text-xs font-black text-gray-500 tabular-nums">{formatMoney(mb.uncategorizedAmount)}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }
                                                            // 其他 OPEX 品类正常渲染
                                                            return <ComparisonRow key={g.id} g={g} onClick={() => handleDrillDown({ categoryId: g.id }, g.label)} accentHover="hover:bg-blue-50"/>;
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 👑 导出对比 PDF */}
                                    <button onClick={handleExportCostPDF} disabled={isExporting} className="w-full bg-[#1A1A1A] text-[#FFD700] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-50">
                                        {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} 导出开销对比 PDF ({startDate.slice(0, 7)} vs {compareMonth})
                                    </button>
                                </div>
                            )}

                                        </div>
                                    )}
                                </div>
                                )}
                                {/* ━━━━━━━ 卡 3 结束 ━━━━━━━ */}

                                {/* ━━━━━━━ 卡 4：外卖损耗 Delivery ━━━━━━━ */}
                                {(activeTab === 'OVERVIEW' || activeTab === 'COST') && (
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <button onClick={() => toggleCard('DELIVERY')} className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors">
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xs sm:text-sm shrink-0">D</div>
                                            <div className="text-left min-w-0">
                                                <div className="font-black text-sm sm:text-base text-[#1A1A1A]">外卖损耗</div>
                                                <div className="text-[10px] sm:text-xs text-gray-400 font-bold truncate">总损耗 {formatMoney(analytics.pnl.totalDeliveryDirectCost)} · 占外卖流水 {(analytics.revenueDetails.deliveryGross > 0 ? (analytics.pnl.totalDeliveryDirectCost / analytics.revenueDetails.deliveryGross * 100) : 0).toFixed(1)}%</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {analytics.revenueDetails.deliveryGross > 0 && (() => {
                                                const drainPct = (analytics.pnl.totalDeliveryDirectCost / analytics.revenueDetails.deliveryGross * 100);
                                                const tagColor = drainPct > 35 ? 'bg-red-50 text-red-700' : drainPct > 30 ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700';
                                                return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${tagColor}`}>{drainPct.toFixed(0)}%</span>;
                                            })()}
                                            {expandedCards.DELIVERY ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                                        </div>
                                    </button>
                                    {expandedCards.DELIVERY && (
                                        <div className="border-t border-gray-100 p-3 sm:p-4 space-y-3 animate-in slide-in-from-top-1 fade-in duration-200">

                                            {/* 外卖总览 */}
                                            <div className="bg-orange-50 rounded-2xl border border-orange-200 p-4">
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <p className="text-[9px] font-black text-orange-600 uppercase tracking-wider">外卖账面</p>
                                                        <p className="text-base sm:text-lg font-black font-mono text-orange-900 mt-1 tabular-nums">{formatMoney(analytics.revenueDetails.deliveryGross)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-red-600 uppercase tracking-wider">总损耗</p>
                                                        <p className="text-base sm:text-lg font-black font-mono text-red-700 mt-1 tabular-nums">-{formatMoney(analytics.pnl.totalDeliveryDirectCost)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-green-700 uppercase tracking-wider">实际到手</p>
                                                        <p className="text-base sm:text-lg font-black font-mono text-green-700 mt-1 tabular-nums">{formatMoney(Math.max(0, analytics.revenueDetails.deliveryGross - analytics.pnl.totalDeliveryDirectCost))}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 三平台损耗对比 */}
                                            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
                                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">三平台损耗率</p>
                                                {[
                                                    { name: 'GrabFood', gross: analytics.deliveryBreakdown.grabGross, drain: analytics.pnl.grabCommission + analytics.pnl.grabAds },
                                                    { name: 'FoodPanda', gross: analytics.deliveryBreakdown.pandaGross, drain: analytics.pnl.pandaFees + analytics.pnl.pandaCommission + analytics.pnl.pandaAds },
                                                    { name: 'ShopeeFood', gross: analytics.deliveryBreakdown.shopeeGross, drain: analytics.pnl.shopeeFees + analytics.pnl.shopeeCommission + analytics.pnl.shopeeAds }
                                                ].map(p => {
                                                    if (p.gross === 0) return null;
                                                    const drainPct = (p.drain / p.gross) * 100;
                                                    const barColor = drainPct > 35 ? '#EF4444' : drainPct > 25 ? '#F59E0B' : '#10B981';
                                                    return (
                                                        <div key={p.name} className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-gray-600 w-16 sm:w-20 shrink-0">{p.name}</span>
                                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
                                                                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, drainPct)}%`, background: barColor }}></div>
                                                            </div>
                                                            <span className="font-mono text-xs font-black w-12 text-right tabular-nums" style={{ color: barColor }}>{drainPct.toFixed(1)}%</span>
                                                            <span className="text-[10px] font-bold text-gray-400 w-16 text-right shrink-0 hidden sm:inline">-{formatMoney(p.drain).replace('RM ', '')}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Grab 抽佣+广告拆解 */}
                                            {analytics.deliveryBreakdown.grabGross > 0 && (
                                                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">GrabFood 损耗拆解</p>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-600">基础抽佣</span>
                                                        <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.grabCommission)} ({(analytics.pnl.grabCommission/analytics.deliveryBreakdown.grabGross*100).toFixed(1)}%)</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-600">广告费</span>
                                                        <span className="font-mono font-bold text-orange-600">-{formatMoney(analytics.pnl.grabAds)} ({(analytics.pnl.grabAds/analytics.deliveryBreakdown.grabGross*100).toFixed(1)}%)</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* FoodPanda 抽佣+广告及杂费拆解 */}
                                            {analytics.deliveryBreakdown.pandaGross > 0 && (
                                                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 font-sans">FoodPanda 损耗拆解</p>
                                                    {analytics.pnl.pandaCommission > 0 && (
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600">基础抽佣</span>
                                                            <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.pandaCommission)} ({(analytics.pnl.pandaCommission/analytics.deliveryBreakdown.pandaGross*100).toFixed(1)}%)</span>
                                                        </div>
                                                    )}
                                                    {analytics.pnl.pandaAds > 0 && (
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600 font-sans">平台广告费</span>
                                                            <span className="font-mono font-bold text-orange-600">-{formatMoney(analytics.pnl.pandaAds)} ({(analytics.pnl.pandaAds/analytics.deliveryBreakdown.pandaGross*100).toFixed(1)}%)</span>
                                                        </div>
                                                    )}
                                                    {analytics.pnl.pandaFees > 0 && (
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600 font-bold">调节费与杂支出 (Standalone Bills)</span>
                                                            <span className="font-mono font-bold text-red-700">-{formatMoney(analytics.pnl.pandaFees)} ({(analytics.pnl.pandaFees/analytics.deliveryBreakdown.pandaGross*100).toFixed(1)}%)</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-xs font-bold pt-1 border-t border-dashed border-gray-100">
                                                        <span className="text-gray-700 font-sans">总实际损耗</span>
                                                        <span className="font-mono text-red-600">-{formatMoney(analytics.pnl.pandaCommission + analytics.pnl.pandaAds + analytics.pnl.pandaFees)} ({((analytics.pnl.pandaCommission + analytics.pnl.pandaAds + analytics.pnl.pandaFees)/analytics.deliveryBreakdown.pandaGross*100).toFixed(1)}%)</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ShopeeFood 抽佣+广告及杂费拆解 */}
                                            {analytics.deliveryBreakdown.shopeeGross > 0 && (
                                                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 font-sans">ShopeeFood 损耗拆解</p>
                                                    {analytics.pnl.shopeeCommission > 0 && (
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600">基础抽佣</span>
                                                            <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.shopeeCommission)} ({(analytics.pnl.shopeeCommission/analytics.deliveryBreakdown.shopeeGross*100).toFixed(1)}%)</span>
                                                        </div>
                                                    )}
                                                    {analytics.pnl.shopeeAds > 0 && (
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600 font-sans">平台广告费</span>
                                                            <span className="font-mono font-bold text-orange-600">-{formatMoney(analytics.pnl.shopeeAds)} ({(analytics.pnl.shopeeAds/analytics.deliveryBreakdown.shopeeGross*100).toFixed(1)}%)</span>
                                                        </div>
                                                    )}
                                                    {analytics.pnl.shopeeFees > 0 && (
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600 font-bold">平台服务/调节费 (Standalone Bills)</span>
                                                            <span className="font-mono font-bold text-red-700">-{formatMoney(analytics.pnl.shopeeFees)} ({(analytics.pnl.shopeeFees/analytics.deliveryBreakdown.shopeeGross*100).toFixed(1)}%)</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-xs font-bold pt-1 border-t border-dashed border-gray-100">
                                                        <span className="text-gray-700 font-sans">总实际损耗</span>
                                                        <span className="font-mono text-red-600">-{formatMoney(analytics.pnl.shopeeCommission + analytics.pnl.shopeeAds + analytics.pnl.shopeeFees)} ({((analytics.pnl.shopeeCommission + analytics.pnl.shopeeAds + analytics.pnl.shopeeFees)/analytics.deliveryBreakdown.shopeeGross*100).toFixed(1)}%)</span>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    )}
                                </div>
                                )}
                                {/* ━━━━━━━ 卡 4 结束 ━━━━━━━ */}

                                {/* ━━━━━━━ 月底工具 1：审计流水 ━━━━━━━ */}
                                {activeTab === 'AUDIT' && (
                                <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4">
                                        <div className="bg-green-50 p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl border border-green-100 text-center"><p className="text-[8px] sm:text-[10px] font-bold text-green-600 uppercase mb-0.5 sm:mb-1">进账</p><p className="font-mono font-black text-green-700 text-xs sm:text-base md:text-lg tabular-nums">RM {auditData.filter(t=>t.type==='IN').reduce((sum,t)=>sum+t.amount,0).toLocaleString()}</p></div>
                                        <div className="bg-red-50 p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl border border-red-100 text-center"><p className="text-[8px] sm:text-[10px] font-bold text-red-600 uppercase mb-0.5 sm:mb-1">出账</p><p className="font-mono font-black text-red-700 text-xs sm:text-base md:text-lg tabular-nums">RM {auditData.filter(t=>t.type==='OUT').reduce((sum,t)=>sum+t.amount,0).toLocaleString()}</p></div>
                                        <div className="bg-gray-100 p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl border border-gray-200 text-center"><p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase mb-0.5 sm:mb-1">笔数</p><p className="font-mono font-black text-gray-700 text-xs sm:text-base md:text-lg">{auditData.length}</p></div>
                                    </div>

                                    <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[500px] sm:h-[600px]">
                                        <div className="bg-gray-50/50 p-3 sm:p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center justify-between shrink-0">
                                            <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto">
                                                {['ALL', 'IN', 'OUT'].map(f => (
                                                    <button key={f} onClick={() => setAuditFilter(f as any)} className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-colors ${auditFilter === f ? 'bg-[#1A1A1A] text-[#FFD700]' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                                                        {f === 'ALL' ? '全部' : f === 'IN' ? '进账' : '支出'}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="relative w-full sm:w-64">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:w-4 sm:h-4"/>
                                                <input type="text" placeholder="搜索..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg sm:rounded-xl pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
                                            </div>
                                        </div>

                                        <div className="overflow-y-auto flex-grow divide-y divide-gray-100 touch-pan-y">
                                            {auditData.length === 0 ? (
                                                <div className="p-12 sm:p-20 text-center text-gray-400 text-xs sm:text-sm font-bold italic">未找到匹配的流水记录</div>
                                            ) : auditData.map((log, idx) => (
                                                <div key={idx} className="px-3 py-2.5 sm:p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group gap-2">
                                                    <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl flex items-center justify-center font-black text-[9px] sm:text-[10px] shrink-0 ${log.type === 'IN' ? 'bg-green-100 text-green-700' : log.type === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{log.type}</div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                                                                <span className="font-bold text-[#1A1A1A] text-[11px] sm:text-xs md:text-sm truncate max-w-[120px] sm:max-w-none">{CATEGORY_LABELS[log.category] || log.category}</span>
                                                                <span className="text-[8px] sm:text-[9px] text-gray-400 font-mono bg-gray-100 px-1 py-0.5 rounded shrink-0">{log.date}</span>
                                                            </div>
                                                            <div className="text-[9px] sm:text-[10px] md:text-xs text-gray-500 font-medium mt-0.5 truncate max-w-[150px] sm:max-w-[200px] md:max-w-md">{log.description}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className={`font-mono font-black text-xs sm:text-sm md:text-base tabular-nums ${log.type === 'IN' ? 'text-green-600' : log.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`}>{log.type === 'IN' ? '+' : log.type === 'OUT' ? '-' : '⇄'}{formatMoney(log.amount).replace('RM ','')}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 月底工具 2：分红计算（原 DIVIDEND Tab 内容 — 不动） */}
                            {activeTab === 'DIVIDEND' && (
                                <div className="space-y-4 sm:space-y-5 md:space-y-6 animate-in fade-in slide-in-from-right-4">
                                    <div className="bg-[#1A1A1A] p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] shadow-xl text-white relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-emerald-500 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
                                        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                                            <div><h3 className="font-black text-base sm:text-lg md:text-xl flex items-center gap-2 text-[#FFD700]"><Briefcase size={20} className="sm:w-6 sm:h-6"/> 股东分红计算器</h3><p className="text-[10px] sm:text-xs text-white/60 mt-1">Dividend Distribution Planner</p></div>
                                            <div className="sm:text-right">
                                                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50">真实可支配现金</p>
                                                <p className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${analytics.netCashFlow >= 0 ? 'text-white' : 'text-red-400'}`}>{formatMoney(analytics.netCashFlow)}</p>
                                                {analytics.costs.totalCapex > 0 && (<p className="text-[9px] text-red-400 mt-1">已扣除 CAPEX: {formatMoney(analytics.costs.totalCapex)}</p>)}
                                            </div>
                                        </div>
                                        <div className="mt-6 sm:mt-8 bg-white/10 p-3 sm:p-4 rounded-xl border border-white/10">
                                            <div className="flex justify-between text-[10px] sm:text-xs font-bold mb-2">
                                                <span>预留: <span className="text-[#FFD700]">{retentionRate}%</span></span>
                                                <span>可分红: {100 - retentionRate}%</span>
                                            </div>
                                            <input type="range" min="0" max="100" step="5" value={retentionRate} onChange={(e) => setRetentionRate(parseInt(e.target.value))} className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FFD700]"/>
                                        </div>
                                    </div>

                                    {analytics.netCashFlow <= 0 ? (
                                        <div className="text-center py-12 sm:py-20 bg-gray-50 rounded-2xl sm:rounded-[2rem] border border-gray-200">
                                            <AlertCircle size={36} className="mx-auto text-gray-300 mb-3 sm:mb-4 sm:w-12 sm:h-12"/>
                                            <h3 className="text-sm sm:text-lg font-black text-gray-400">本期无可用现金流，无法计算分红</h3>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                            <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200 shadow-sm flex flex-col justify-center items-center text-center">
                                                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">预留储备金</p>
                                                <p className="text-2xl sm:text-3xl font-black text-blue-600 font-mono mb-3 sm:mb-4 tabular-nums">{formatMoney(analytics.netCashFlow * (retentionRate / 100))}</p>
                                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${retentionRate}%` }}></div></div>
                                            </div>
                                            <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-[2rem] border border-gray-200 shadow-sm flex flex-col justify-center items-center text-center">
                                                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">最终可分红</p>
                                                <p className="text-2xl sm:text-3xl font-black text-green-600 font-mono mb-3 sm:mb-4 tabular-nums">{formatMoney(analytics.netCashFlow * ((100 - retentionRate) / 100))}</p>
                                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${100 - retentionRate}%` }}></div></div>
                                            </div>
                                            <div className="col-span-full">
                                                <h4 className="text-xs sm:text-sm font-black text-[#1A1A1A] uppercase tracking-wider sm:tracking-widest mb-3 sm:mb-4 ml-2 flex items-center gap-2"><Users size={14} className="sm:w-4 sm:h-4"/> 股东分配明细</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                                    {(() => {
                                                        const activeShareholders = (treasuryConfig?.shareholders && treasuryConfig.shareholders.length > 0)
                                                            ? treasuryConfig.shareholders
                                                            : [
                                                                { id: 'sh-1', name: 'Alvin (Founder)', equityPercentage: 40, role: 'Managing Partner' },
                                                                { id: 'sh-2', name: 'Darren (Co-Owner)', equityPercentage: 30, role: 'Operations' },
                                                                { id: 'sh-3', name: 'Marcus (Partner)', equityPercentage: 30, role: 'Finance' }
                                                              ];
                                                        const distributableTotal = analytics.netCashFlow * ((100 - retentionRate) / 100);
                                                        return activeShareholders.map(sh => {
                                                            const equityPercentage = sh.equityPercentage > 0 ? sh.equityPercentage : (100 / activeShareholders.length);
                                                            const shareAmount = distributableTotal * (equityPercentage / 100);
                                                            return (
                                                                <div key={sh.id} className="bg-white p-3.5 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl border border-gray-200 hover:border-[#FFD700] shadow-sm flex items-center justify-between group transition-all gap-2">
                                                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#1A1A1A] text-[#FFD700] flex items-center justify-center font-black text-xs sm:text-sm border shadow-sm shrink-0">{(sh.name || 'U').charAt(0)}</div>
                                                                        <div className="min-w-0">
                                                                            <div className="font-bold text-xs sm:text-sm text-[#1A1A1A] truncate">{sh.name || 'Unknown'}</div>
                                                                            <div className="flex items-center gap-1 mt-0.5">
                                                                                <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded truncate shrink-0">{equityPercentage.toFixed(0)}% 股权比例</span>
                                                                                {sh.role && <span className="text-[9px] text-gray-500 font-bold truncate">({sh.role})</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <div className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase">分配分红</div>
                                                                        <div className="text-sm sm:text-base md:text-lg font-mono font-black text-green-700 tabular-nums">{formatMoney(shareAmount)}</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                                
                                                {analytics.totalDividends > 0 && (
                                                    <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-xl flex justify-between items-center gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-xs sm:text-sm font-black text-orange-800">本期已入账分红支出</p>
                                                            <p className="text-[9px] sm:text-[10px] text-orange-600 mt-0.5 leading-tight">未计入门店 OPEX</p>
                                                        </div>
                                                        <span className="font-mono text-base sm:text-xl font-black text-orange-800 shrink-0 tabular-nums">-{formatMoney(analytics.totalDividends)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            </div>
                            {/* 阶段二：KPI 驾驶舱 + 卡片网格 全部结束 */}

                             {/* 🌟 6页级全维度商业洞察 PDF 引擎 (Business Intelligence PDF) 🌟 */}
                            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                                <div ref={printRef} className="w-[800px] bg-[#F5F7FA] font-sans text-black relative flex flex-col" style={{ width: '800px' }}>
 
                                    {/* ═══════════ PAGE 1: EXECUTIVE SUMMARY (紧凑版) ═══════════ */}
                                    <div className="px-10 pt-8 pb-6 bg-white flex flex-col justify-between" style={{ height: '1122px', borderBottom: '1px dashed #e5e7eb' }}>
                                        <div>
                                            {/* Header */}
                                            <div className="flex justify-between items-end border-b-4 border-[#1A1A1A] pb-4 mb-5">
                                                <div>
                                                    <h1 className="text-3xl font-black uppercase tracking-widest mb-1 text-[#1A1A1A]">P&L Report</h1>
                                                    <p className="text-sm font-bold text-[#FFD700] uppercase tracking-widest">KIM LIAN KEE (KEPONG)</p>
                                                    <p className="text-[10px] font-bold text-gray-400 mt-1">BUSINESS INTELLIGENCE & AUDIT</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold uppercase text-[#1A1A1A]">{startDate} <span className="text-gray-400 mx-1">TO</span> {endDate}</p>
                                                    <p className="text-[10px] text-gray-500 mt-1 font-bold bg-gray-100 px-2 py-0.5 rounded inline-block">{accountingMode === 'ACCRUAL' ? 'Accrual (权责发生制)' : 'Cash (收付实现制)'}</p>
                                                    <p className="text-[9px] text-gray-400 mt-1">Generated: {new Date().toLocaleString('en-US', { hour12: false })}</p>
                                                </div>
                                            </div>
 
                                            {/* KPI 4-box */}
                                            <h2 className="text-base font-black uppercase tracking-widest border-l-4 border-[#FFD700] pl-2 mb-3 text-[#1A1A1A]">Executive Summary</h2>
                                            <div className="grid grid-cols-2 gap-3 mb-5">
                                                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Total Gross Revenue (总流水)</p>
                                                    <p className="text-2xl font-black font-mono text-[#1A1A1A]">{formatMoney(analytics?.pnl?.totalGrossRevenue || 0)}</p>
                                                </div>
                                                <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200">
                                                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Net Realized Revenue (纯营收)</p>
                                                    <p className="text-2xl font-black font-mono text-blue-800">{formatMoney(analytics?.pnl?.netRealizedRevenue || 0)}</p>
                                                </div>
                                                <div className={`${(analytics?.netProfit || 0) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} p-3.5 rounded-xl border`}>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${(analytics?.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Net Profit (经营净利)</p>
                                                    <p className={`text-2xl font-black font-mono ${(analytics?.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(analytics?.netProfit || 0)}</p>
                                                </div>
                                                <div className="bg-[#1A1A1A] text-white p-3.5 rounded-xl">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Net Cash Flow (净现金流)</p>
                                                    <p className={`text-2xl font-black font-mono ${(analytics?.netCashFlow || 0) >= 0 ? 'text-[#FFD700]' : 'text-red-400'}`}>{formatMoney(analytics?.netCashFlow || 0)}</p>
                                                </div>
                                            </div>
 
                                            {/* P&L Waterfall */}
                                            <h2 className="text-base font-black uppercase tracking-widest border-l-4 border-[#FFD700] pl-2 mb-3 text-[#1A1A1A]">P&L Waterfall (损益瀑布)</h2>
                                            <div className="space-y-1 text-sm mb-5">
                                                <div className="flex justify-between py-1.5 border-b border-gray-100"><span className="font-bold text-gray-600">门店堂食 (In-Store)</span><span className="font-mono font-bold">{formatMoney(analytics?.revenueDetails?.inStoreSales || 0)}</span></div>
                                                <div className="flex justify-between py-1.5 border-b border-gray-100"><span className="font-bold text-gray-600">外卖账面 (Delivery Gross)</span><span className="font-mono font-bold">{formatMoney(analytics?.revenueDetails?.deliveryGross || 0)}</span></div>
                                                <div className="flex justify-between py-1.5 border-b border-gray-100"><span className="font-bold text-orange-600">- 外卖损耗 (Platform Drain)</span><span className="font-mono font-bold text-orange-600">-{formatMoney(analytics?.pnl?.totalDeliveryDirectCost || 0)}</span></div>
                                                <div className="flex justify-between py-2 bg-blue-50 px-3 rounded-lg border border-blue-200"><span className="font-black text-blue-800">= 纯营收 (Net Realized)</span><span className="font-mono font-black text-blue-800 text-base">{formatMoney(analytics?.pnl?.netRealizedRevenue || 0)}</span></div>
                                                <div className="flex justify-between py-1.5 border-b border-gray-100"><span className="font-bold text-red-600">- COGS ({(analytics?.margins?.cogs || 0).toFixed(1)}%)</span><span className="font-mono font-bold text-red-600">-{formatMoney(analytics?.costs?.totalCOGS || 0)}</span></div>
                                                <div className="flex justify-between py-1.5 border-b border-gray-100"><span className="font-bold text-red-600">- Labor ({laborDeptAnalysis.laborMarginSynced.toFixed(1)}%)</span><span className="font-mono font-bold text-red-600">-{formatMoney(laborDeptAnalysis.actualLabor)}</span></div>
                                                <div className="flex justify-between py-1.5 border-b border-gray-100"><span className="font-bold text-red-600">- OPEX ({(analytics?.margins?.opex || 0).toFixed(1)}%)</span><span className="font-mono font-bold text-red-600">-{formatMoney(analytics?.costs?.totalOPEX || 0)}</span></div>
                                                <div className={`flex justify-between py-2 px-3 rounded-lg border ${(analytics?.netProfit || 0) >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                                                    <span className={`font-black ${(analytics?.netProfit || 0) >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>= 经营净利 (Net Profit)</span>
                                                    <span className={`font-mono font-black text-lg ${(analytics?.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(analytics?.netProfit || 0)}</span>
                                                </div>
                                                {(analytics?.costs?.totalCapex || 0) > 0 && (
                                                    <div className="flex justify-between py-1.5 text-gray-500"><span className="font-bold">- CAPEX (资产)</span><span className="font-mono font-bold">-{formatMoney(analytics.costs.totalCapex)}</span></div>
                                                )}
                                                {(analytics?.totalDividends || 0) > 0 && (
                                                <div className="flex justify-between py-1.5 text-blue-600">
                                                    <span className="font-bold">- DIVIDEND (已派发分红)</span>
                                                    <span className="font-mono font-bold">-{formatMoney(analytics.totalDividends)}</span>
                                                </div>
                                            )}
                                            </div>
 
                                            {/* KPI Evaluation - 同步 Labor */}
                                            <h2 className="text-base font-black uppercase tracking-widest border-l-4 border-[#FFD700] pl-2 mb-3 text-[#1A1A1A]">AI KPI Evaluation (健康度)</h2>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="border border-gray-200 rounded-lg p-2.5 flex justify-between items-center bg-white">
                                                    <div><p className="text-[11px] font-black uppercase">COGS 占比</p><p className="text-lg font-mono font-black">{Number(analytics?.margins?.cogs || 0).toFixed(1)}%</p></div>
                                                    <div className={`px-2 py-1 rounded-md font-black text-[10px] uppercase border ${cogsEval?.color || ''}`}>{cogsEval?.label || 'N/A'}</div>
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-2.5 flex justify-between items-center bg-white">
                                                    <div>
                                                        <p className="text-[11px] font-black uppercase">Labor 占比</p>
                                                        <p className="text-lg font-mono font-black">{laborDeptAnalysis.laborMarginSynced.toFixed(1)}%</p>
                                                        {!laborDeptAnalysis.hasData && <p className="text-[8px] text-orange-500 font-bold">⚠️ 预估</p>}
                                                    </div>
                                                    <div className={`px-2 py-1 rounded-md font-black text-[10px] uppercase border ${syncedLaborEval?.color || ''}`}>{syncedLaborEval?.label || 'N/A'}</div>
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-2.5 flex justify-between items-center bg-white">
                                                    <div><p className="text-[11px] font-black uppercase">OPEX 占比</p><p className="text-lg font-mono font-black">{Number(analytics?.margins?.opex || 0).toFixed(1)}%</p></div>
                                                    <div className={`px-2 py-1 rounded-md font-black text-[10px] uppercase border ${opexEval?.color || ''}`}>{opexEval?.label || 'N/A'}</div>
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-2.5 flex justify-between items-center bg-white">
                                                    <div><p className="text-[11px] font-black uppercase">净盈利率</p><p className="text-lg font-mono font-black">{Number(analytics?.netMargin || 0).toFixed(1)}%</p></div>
                                                    <div className={`px-2 py-1 rounded-md font-black text-[10px] uppercase border ${netEval?.color || ''}`}>{netEval?.label || 'N/A'}</div>
                                                </div>
                                            </div>

                                            {/* 👑 每日保本门槛 — 醒目条 */}
                                            <div className="mt-3 bg-[#1A1A1A] rounded-lg p-3 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black text-[#FFD700] uppercase tracking-wider">💡 每日营收保本门槛</span>
                                                    <span className="text-[9px] text-gray-400">详见 Page 4</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-[8px] text-gray-400 font-bold uppercase">仅人工</p>
                                                        <p className="text-base font-mono font-black text-[#FFD700] tabular-nums leading-tight">{formatMoney(dailyLaborBreakdown.breakEvenLaborOnly)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[8px] text-gray-400 font-bold uppercase">全保本</p>
                                                        <p className="text-base font-mono font-black text-white tabular-nums leading-tight">{formatMoney(dailyLaborBreakdown.breakEvenFull)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[8px] text-gray-400 font-bold uppercase">实际日均</p>
                                                        <p className={`text-base font-mono font-black tabular-nums leading-tight ${
                                                            dailyLaborBreakdown.avgDailyRevenue >= dailyLaborBreakdown.breakEvenFull ? 'text-emerald-400' :
                                                            dailyLaborBreakdown.avgDailyRevenue >= dailyLaborBreakdown.breakEvenLaborOnly ? 'text-amber-300' :
                                                            'text-red-400'
                                                        }`}>{formatMoney(dailyLaborBreakdown.avgDailyRevenue)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-center text-gray-400 text-[10px] font-mono">- PAGE 1 OF 6 -</div>
                                    </div>
 
                                    {/* ═══════════ PAGE 2: DETAILED COST BREAKDOWN ═══════════ */}
                                    <div className="px-10 pt-8 pb-6 bg-white flex flex-col justify-between" style={{ height: '1122px', borderBottom: '1px dashed #e5e7eb' }}>
                                        <div>
                                            <h2 className="text-xl font-black uppercase tracking-widest border-b-4 border-[#1A1A1A] pb-3 mb-5 text-[#1A1A1A]">Cost Structure Breakdown (成本结构拆解)</h2>
 
                                            {/* COGS */}
                                            <div className="mb-4">
                                                <div className="flex justify-between items-end mb-2 border-b-2 border-red-300 pb-1.5">
                                                    <h3 className="text-sm font-black text-red-700 uppercase tracking-widest">1. COGS 销货成本</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-red-500">({(analytics?.margins?.cogs || 0).toFixed(1)}%)</span>
                                                        <span className="text-base font-black font-mono text-red-700">-{formatMoney(analytics?.costs?.totalCOGS || 0)}</span>
                                                    </div>
                                                </div>
                                                <table className="w-full">
                                                    <tbody>
                                                        {(analytics?.lists?.cogsList || []).slice(0, 10).map((g: any, i: number) => (
                                                            <tr key={i} className="border-b border-gray-100">
                                                                <td className="py-1 pl-3 font-bold text-gray-700 text-[11px]">{g.label}</td>
                                                                <td className="py-1 text-right font-mono text-[11px] text-gray-600 w-24">{formatMoney(g.amount)}</td>
                                                                <td className="py-1 text-right text-[10px] text-gray-400 font-bold w-14">{(g.pct || 0).toFixed(1)}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
 
                                            {/* Labor */}
                                            <div className="mb-4">
                                                <div className="flex justify-between items-end mb-2 border-b-2 border-purple-300 pb-1.5">
                                                    <h3 className="text-sm font-black text-purple-700 uppercase tracking-widest">2. Labor 人工成本</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-purple-500">({laborDeptAnalysis.laborMarginSynced.toFixed(1)}%)</span>
                                                        <span className="text-base font-black font-mono text-purple-700">-{formatMoney(laborDeptAnalysis.actualLabor)}</span>
                                                    </div>
                                                </div>
                                                <table className="w-full">
                                                    <tbody>
                                                        {(analytics?.lists?.laborList || []).map((g: any, i: number) => (
                                                            <tr key={i} className="border-b border-gray-100">
                                                                <td className="py-1 pl-3 font-bold text-gray-700 text-[11px]">{g.label} {g.isPending ? <span className="text-orange-500">(Draft)</span> : ''}</td>
                                                                <td className="py-1 text-right font-mono text-[11px] text-gray-600 w-24">{formatMoney(g.amount)}</td>
                                                                <td className="py-1 text-right text-[10px] text-gray-400 font-bold w-14">{(g.pct || 0).toFixed(1)}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
 
                                            {/* OPEX */}
                                            <div className="mb-4">
                                                <div className="flex justify-between items-end mb-2 border-b-2 border-blue-300 pb-1.5">
                                                    <h3 className="text-sm font-black text-blue-700 uppercase tracking-widest">3. Store OPEX 运营杂费</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-blue-500">({(analytics?.margins?.opex || 0).toFixed(1)}%)</span>
                                                        <span className="text-base font-black font-mono text-blue-700">-{formatMoney(analytics?.costs?.totalOPEX || 0)}</span>
                                                    </div>
                                                </div>
                                                <table className="w-full">
                                                    <tbody>
                                                        {(analytics?.lists?.opexList || []).slice(0, 10).map((g: any, i: number) => (
                                                            <tr key={i} className="border-b border-gray-100">
                                                                <td className="py-1 pl-3 font-bold text-gray-700 text-[11px]">{g.label}</td>
                                                                <td className="py-1 text-right font-mono text-[11px] text-gray-600 w-24">{formatMoney(g.amount)}</td>
                                                                <td className="py-1 text-right text-[10px] text-gray-400 font-bold w-14">{(g.pct || 0).toFixed(1)}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
 
                                            {/* CAPEX */}
                                            {(analytics?.costs?.totalCapex || 0) > 0 && (
                                                <div className="flex justify-between items-center p-2.5 bg-gray-100 rounded-lg border border-gray-200 mb-3">
                                                    <span className="text-xs font-black text-gray-600 uppercase">4. CAPEX (资本支出 - 不入P&L)</span>
                                                    <span className="text-base font-black font-mono text-gray-600">-{formatMoney(analytics.costs.totalCapex)}</span>
                                                </div>
                                            )}
 
                                            {/* Grand Total */}
                                            <div className="flex justify-between items-center p-3.5 bg-[#1A1A1A] rounded-xl mt-3">
                                                <span className="text-xs font-black text-[#FFD700] uppercase tracking-widest">TOTAL STORE COSTS</span>
                                                <span className="text-xl font-black font-mono text-white">-{formatMoney(analytics?.costs?.totalStoreCosts || 0)}</span>
                                            </div>
                                        </div>
                                        <div className="text-center text-gray-400 text-[10px] font-mono">- PAGE 2 OF 6 -</div>
                                    </div>
 
                                    {/* ═══════════ PAGE 3: DELIVERY PROFITABILITY + 抽佣% ═══════════ */}
                                    <div className="px-10 pt-8 pb-6 bg-white flex flex-col justify-between" style={{ height: '1122px', borderBottom: '1px dashed #e5e7eb' }}>
                                        <div>
                                            <h2 className="text-xl font-black uppercase tracking-widest border-b-4 border-orange-500 pb-3 mb-5 text-[#1A1A1A]">Delivery Profitability (外卖渠道损耗)</h2>
 
                                            {/* Summary bar */}
                                            <div className="bg-orange-50 rounded-2xl border border-orange-200 p-5 mb-5">
                                                <div className="grid grid-cols-3 gap-5">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-orange-600 uppercase">Gross Platform Sales</p>
                                                        <p className="text-2xl font-black font-mono text-orange-900 mt-1">{formatMoney(analytics?.revenueDetails?.deliveryGross || 0)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-red-600 uppercase">Total Drain (抽佣+广告)</p>
                                                        <p className="text-2xl font-black font-mono text-red-700 mt-1">-{formatMoney(analytics?.pnl?.totalDeliveryDirectCost || 0)}</p>
                                                        <p className="text-sm font-black text-red-500 mt-1">
                                                            占外卖流水 {((analytics?.revenueDetails?.deliveryGross || 0) > 0 ? ((analytics?.pnl?.totalDeliveryDirectCost || 0) / (analytics?.revenueDetails?.deliveryGross || 1) * 100) : 0).toFixed(1)}%
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-green-700 uppercase">Actual Take-Home</p>
                                                        <p className="text-2xl font-black font-mono text-green-700 mt-1">{formatMoney((analytics?.revenueDetails?.deliveryGross || 0) - (analytics?.pnl?.totalDeliveryDirectCost || 0))}</p>
                                                    </div>
                                                </div>
                                            </div>
 
                                            <h3 className="text-base font-black text-[#1A1A1A] border-l-4 border-orange-500 pl-3 mb-3">Platform Breakdown (各平台明细)</h3>
 
                                            {/* GrabFood */}
                                            {(() => {
                                                const gGross = analytics?.deliveryBreakdown?.grabGross || 0;
                                                const gComm = analytics?.pnl?.grabCommission || 0;
                                                const gAds = analytics?.pnl?.grabAds || 0;
                                                const gNet = analytics?.deliveryBreakdown?.grabNet || 0;
                                                const gTotalDrain = gComm + gAds;
                                                const gCommPct = gGross > 0 ? (gComm / gGross * 100) : 0;
                                                const gAdsPct = gGross > 0 ? (gAds / gGross * 100) : 0;
                                                const gTotalDrainPct = gGross > 0 ? (gTotalDrain / gGross * 100) : 0;
                                                return (
                                                    <div className="border border-gray-200 rounded-xl p-4 mb-4">
                                                        <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                                                            <span className="font-black text-lg text-green-700">GrabFood</span>
                                                            <span className="font-mono font-black text-lg">Gross: {formatMoney(gGross)}</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="font-bold text-red-600">Base Commission (基础抽佣)</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-red-500 bg-red-50 px-2 py-0.5 rounded">{gCommPct.toFixed(1)}%</span>
                                                                    <span className="font-mono font-bold text-red-600 w-28 text-right">-{formatMoney(gComm)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span className="font-bold text-orange-500">Advertisements (广告费)</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded">{gAdsPct.toFixed(1)}%</span>
                                                                    <span className="font-mono font-bold text-orange-600 w-28 text-right">-{formatMoney(gAds)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-sm font-black pt-2 border-t border-gray-100">
                                                                <span className="text-red-800">综合获客成本 (Total Drain)</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`text-xs font-black px-2 py-0.5 rounded ${gTotalDrainPct > 35 ? 'bg-red-100 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{gTotalDrainPct.toFixed(1)}%</span>
                                                                    <span className="font-mono text-red-700 w-28 text-right">-{formatMoney(gTotalDrain)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-sm font-black text-green-800 pt-2 border-t border-gray-200 bg-green-50 -mx-4 px-4 py-2 rounded-b-xl -mb-4">
                                                                <span>Net Payout (结转到账 - 已扣广告)</span>
                                                                <span className="font-mono text-lg">{formatMoney(gNet - gAds)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
 
                                            {/* Panda & Shopee */}
                                            {/* FoodPanda 独立区块 */}
                                            {(() => {
                                                const pGross = analytics?.deliveryBreakdown?.pandaGross || 0;
                                                const pFees = analytics?.pnl?.pandaFees || 0;
                                                const pCommPct = pGross > 0 ? (pFees / pGross * 100) : 0;
                                                const pNet = pGross - pFees;
                                                if (pGross === 0 && pFees === 0) return null;
                                                return (
                                                    <div className="border border-gray-200 rounded-xl p-4 mb-4">
                                                        <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                                                            <span className="font-black text-lg text-pink-600">FoodPanda</span>
                                                            <span className="font-mono font-black text-lg">Gross: {formatMoney(pGross)}</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="font-bold text-red-600">抽佣/调节费 (Commission)</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-red-500 bg-red-50 px-2 py-0.5 rounded">{pCommPct.toFixed(1)}%</span>
                                                                    <span className="font-mono font-bold text-red-600 w-28 text-right">-{formatMoney(pFees)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-sm font-black text-green-800 pt-2 border-t border-gray-200 bg-green-50 -mx-4 px-4 py-2 rounded-b-xl -mb-4">
                                                                <span>Net Payout (结转到账)</span>
                                                                <span className="font-mono text-lg">{formatMoney(pNet)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* ShopeeFood 独立区块 */}
                                            {(() => {
                                                const shGross = analytics?.deliveryBreakdown?.shopeeGross || 0;
                                                const shFees = analytics?.pnl?.shopeeFees || 0;
                                                const shCommPct = shGross > 0 ? (shFees / shGross * 100) : 0;
                                                const shNet = shGross - shFees;
                                                if (shGross === 0 && shFees === 0) return null;
                                                return (
                                                    <div className="border border-gray-200 rounded-xl p-4 mb-4">
                                                        <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                                                            <span className="font-black text-lg text-orange-600">ShopeeFood</span>
                                                            <span className="font-mono font-black text-lg">Gross: {formatMoney(shGross)}</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="font-bold text-red-600">抽佣/调节费 (Commission)</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-red-500 bg-red-50 px-2 py-0.5 rounded">{shCommPct.toFixed(1)}%</span>
                                                                    <span className="font-mono font-bold text-red-600 w-28 text-right">-{formatMoney(shFees)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between text-sm font-black text-green-800 pt-2 border-t border-gray-200 bg-green-50 -mx-4 px-4 py-2 rounded-b-xl -mb-4">
                                                                <span>Net Payout (结转到账)</span>
                                                                <span className="font-mono text-lg">{formatMoney(shNet)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* 其他平台费用（兜底） */}
                                            {(analytics?.pnl?.otherPlatformFees || 0) > 0 && (
                                                <div className="border border-gray-200 rounded-xl p-3 mb-5 flex justify-between items-center">
                                                    <span className="font-bold text-red-600 text-sm">其他平台费用 (Other Platform Fees)</span>
                                                    <span className="font-mono font-bold text-red-600">-{formatMoney(analytics.pnl.otherPlatformFees)}</span>
                                                </div>
                                            )}
 
                                            {/* Business Insight */}
                                            {(() => {
                                                const grabGross = analytics?.deliveryBreakdown?.grabGross || 0;
                                                const grabCostRatio = grabGross > 0 ? (((analytics?.pnl?.grabCommission || 0) + (analytics?.pnl?.grabAds || 0)) / grabGross) * 100 : 0;
                                                const deliveryShareOfRevenue = (analytics?.pnl?.totalGrossRevenue || 0) > 0 ? ((analytics?.revenueDetails?.deliveryGross || 0) / (analytics?.pnl?.totalGrossRevenue || 1) * 100) : 0;
                                                return (
                                                    <div className="bg-[#1A1A1A] p-4 rounded-xl text-white">
                                                        <h3 className="font-black text-[#FFD700] mb-2 text-xs uppercase">💡 Delivery Insight</h3>
                                                        <p className="text-xs text-gray-300 leading-relaxed">
                                                            外卖占总流水 <span className="font-bold text-white text-sm">{deliveryShareOfRevenue.toFixed(1)}%</span>，
                                                            GrabFood 综合获客成本 <span className="font-bold text-white text-sm">{grabCostRatio.toFixed(1)}%</span>。
                                                            {grabCostRatio > 35 ? ' ⚠️ 获客成本极高！建议重新评估外卖定价与广告 ROAS。' : ' 平台开销可控，注意保持毛利率。'}
                                                        </p>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="text-center text-gray-400 text-[10px] font-mono">- PAGE 3 OF 6 -</div>
                                    </div>
 
                                    {/* ═══════════ PAGE 4: LABOR + DEPARTMENT + NAMES ═══════════ */}
                                    <div className="px-10 pt-8 pb-6 bg-white flex flex-col justify-between" style={{ height: '1122px', borderBottom: '1px dashed #e5e7eb' }}>
                                        <div>
                                            <h2 className="text-xl font-black uppercase tracking-widest border-b-4 border-purple-600 pb-3 mb-5 text-[#1A1A1A]">Labor Efficiency Matrix (人效与部门拆解)</h2>
 
                                            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 mb-3">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">Monthly Labor (全月人工)</p>
                                                        <p className="text-2xl font-black font-mono text-purple-900">{formatMoney(laborDeptAnalysis.monthlyLaborFull)}</p>
                                                        <p className="text-[8px] text-gray-500 font-bold mt-0.5">基于 Payroll 全月数据</p>
                                                        {!laborDeptAnalysis.hasData && <p className="text-[9px] text-orange-500 font-bold mt-1">⚠️ 薪资未结账，基于底薪预估</p>}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">期间占比 ({laborDeptAnalysis.settledDays}/{laborDeptAnalysis.daysInMonth}天)</p>
                                                        <p className="text-2xl font-black font-mono text-purple-900">{laborDeptAnalysis.laborMarginSynced.toFixed(1)}%</p>
                                                        <p className="text-[8px] text-gray-500 font-bold mt-0.5">分摊后 ÷ 期间营收</p>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-purple-200 grid grid-cols-2 gap-3 text-[10px]">
                                                    <div>
                                                        <span className="text-gray-500 font-bold uppercase">期间分摊人工</span>
                                                        <span className="block font-mono font-black text-purple-700 text-base">{formatMoney(laborDeptAnalysis.actualLabor)}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-gray-500 font-bold uppercase">已记账金额</span>
                                                        <span className="block font-mono font-black text-purple-700 text-base">{formatMoney(analytics?.costs?.totalLabor || 0)}</span>
                                                        <span className="text-[8px] text-gray-400">(预支等真实流水)</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 👑 每日人工核算 — PDF 浓缩版 */}
                                            <div className="bg-amber-50 rounded-xl border border-amber-300 p-3 mb-5">
                                                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-amber-200">
                                                    <h3 className="text-[11px] font-black text-amber-800 uppercase tracking-widest">Daily Labor Breakdown · 每日核算</h3>
                                                    <span className="text-[9px] font-bold text-amber-700">月薪÷{dailyLaborBreakdown.daysInMonth}天 · 已结算{dailyLaborBreakdown.settledDays}天</span>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2 mb-2">
                                                    <div className="bg-white p-2 rounded border border-amber-200">
                                                        <p className="text-[8px] text-amber-700 font-bold uppercase">每日人工</p>
                                                        <p className="text-sm font-mono font-black text-amber-900 tabular-nums">{formatMoney(dailyLaborBreakdown.dailyLabor)}</p>
                                                    </div>
                                                    <div className="bg-white p-2 rounded border border-amber-200">
                                                        <p className="text-[8px] text-amber-700 font-bold uppercase">人均每日</p>
                                                        <p className="text-sm font-mono font-black text-amber-900 tabular-nums">{formatMoney(dailyLaborBreakdown.perEmployeeDaily)}</p>
                                                        <p className="text-[7px] text-gray-400">{dailyLaborBreakdown.staffCount} 人</p>
                                                    </div>
                                                    <div className="bg-white p-2 rounded border border-amber-200">
                                                        <p className="text-[8px] text-amber-700 font-bold uppercase">期间累计</p>
                                                        <p className="text-sm font-mono font-black text-amber-900 tabular-nums">{formatMoney(dailyLaborBreakdown.periodAccrued)}</p>
                                                    </div>
                                                    <div className="bg-white p-2 rounded border border-amber-200">
                                                        <p className="text-[8px] text-amber-700 font-bold uppercase">日均营收</p>
                                                        <p className="text-sm font-mono font-black text-emerald-700 tabular-nums">{formatMoney(dailyLaborBreakdown.avgDailyRevenue)}</p>
                                                    </div>
                                                </div>
                                                <div className="bg-[#1A1A1A] p-2.5 rounded">
                                                    <div className="flex justify-between items-center mb-1.5">
                                                        <span className="text-[9px] font-black text-[#FFD700] uppercase tracking-wider">💡 每日营收保本门槛</span>
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                            dailyLaborBreakdown.laborCoverageRatio >= 1.8 ? 'bg-emerald-500 text-white' :
                                                            dailyLaborBreakdown.laborCoverageRatio >= 1.2 ? 'bg-amber-400 text-amber-900' :
                                                            dailyLaborBreakdown.laborCoverageRatio >= 1.0 ? 'bg-orange-500 text-white' :
                                                            'bg-red-600 text-white'
                                                        }`}>
                                                            {dailyLaborBreakdown.laborCoverageRatio >= 1.8 ? '✅ 健康' :
                                                             dailyLaborBreakdown.laborCoverageRatio >= 1.2 ? '⚠️ 紧张' :
                                                             dailyLaborBreakdown.laborCoverageRatio >= 1.0 ? '🟠 危险' : '🚨 亏损'}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <p className="text-[7px] text-gray-400 font-bold uppercase">仅覆盖人工</p>
                                                            <p className="text-sm font-mono font-black text-[#FFD700] tabular-nums">{formatMoney(dailyLaborBreakdown.breakEvenLaborOnly)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[7px] text-gray-400 font-bold uppercase">含 OPEX 全保本</p>
                                                            <p className="text-sm font-mono font-black text-white tabular-nums">{formatMoney(dailyLaborBreakdown.breakEvenFull)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {laborDeptAnalysis.hasData ? (
                                                <div>
                                                    <h3 className="text-sm font-black text-[#1A1A1A] border-l-4 border-purple-600 pl-3 mb-3">Department Breakdown</h3>
 
                                                    {[
                                                        { key: 'kitchen', emoji: '🔥', label: '厨房产出 (Kitchen/BOH)' },
                                                        { key: 'floor', emoji: '🍽️', label: '楼面服务 (Floor/FOH)' },
                                                        { key: 'bar', emoji: '🧋', label: '水吧制作 (Bar/Beverage)' },
                                                        { key: 'support', emoji: '🧹', label: '清洁后勤 (Support)' },
                                                        { key: 'other', emoji: '📦', label: '其他/管理 (Admin/Other)' }
                                                    ].map(dept => {
                                                        const d = laborDeptAnalysis.deptMap[dept.key];
                                                        if (!d || d.count === 0) return null;
                                                        return (
                                                            <div key={dept.key} className="mb-3 border border-gray-200 rounded-xl overflow-hidden">
                                                                <div className="flex justify-between items-center bg-gray-50 px-4 py-2 border-b border-gray-200">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm">{dept.emoji}</span>
                                                                        <span className="font-black text-xs text-[#1A1A1A]">{dept.label}</span>
                                                                        <span className="text-[9px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">{d.count} 人</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono font-black text-xs text-[#1A1A1A]">{formatMoney(d.cost)}</span>
                                                                        <span className="text-[10px] font-bold text-gray-500">{((d.cost / laborDeptAnalysis.netRev) * 100).toFixed(1)}%</span>
                                                                    </div>
                                                                </div>
                                                                <div className="px-4 py-1.5 bg-white">
                                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                                        {d.names.map((name: string, ni: number) => (
                                                                            <span key={ni} className="text-[9px] text-gray-500 font-medium">{name}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
 
                                                    <div className="mt-3 bg-purple-50 p-3 rounded-xl border border-purple-200">
                                                        <h3 className="font-black text-purple-900 mb-1 text-[11px] uppercase">💡 Labor KPI</h3>
                                                        <p className="text-[10px] text-purple-800 leading-relaxed">
                                                            餐饮业健康人工成本控制在纯营收 <span className="font-black">18%-22%</span>。当前 <span className="font-black">{laborDeptAnalysis.laborMarginSynced.toFixed(1)}%</span>。
                                                            {laborDeptAnalysis.laborMarginSynced > 25 ? ' ⚠️ 偏高，建议审核排班与加班费。' : laborDeptAnalysis.laborMarginSynced < 18 ? ' ⚠️ 偏低，可能人力不足。' : ' ✅ 健康范围。'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-8 text-center text-gray-400 italic border-2 border-dashed border-gray-200 rounded-xl">
                                                    本月暂无薪资结算明细，无法拆解部门成本。<br/>
                                                    <span className="text-[10px]">请先到 Payroll 模块结算当月薪资后重新导出。</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-center text-gray-400 text-[10px] font-mono">- PAGE 4 OF 6 -</div>
                                    </div>
 
                                    {/* ═══════════ PAGE 5: REVENUE ANALYTICS + DAILY TREND ═══════════ */}
                                    <div className="px-10 pt-8 pb-6 bg-white flex flex-col justify-between" style={{ height: '1122px', borderBottom: '1px dashed #e5e7eb' }}>
                                        <div>
                                            <h2 className="text-xl font-black uppercase tracking-widest border-b-4 border-blue-600 pb-3 mb-5 text-[#1A1A1A]">Revenue Analytics (营收分析)</h2>
 
                                            {/* Daily summary cards */}
                                            <div className="grid grid-cols-4 gap-3 mb-5">
                                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-center">
                                                    <p className="text-[9px] font-bold text-blue-600 uppercase mb-1">日均产出</p>
                                                    <p className="text-lg font-black font-mono text-blue-800">{formatMoney(analytics?.avgDailySales || 0)}</p>
                                                    <p className="text-[9px] text-gray-500 mt-0.5">{analytics?.settlementCount || 0} 天</p>
                                                </div>
                                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center">
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase mb-1">平日日均</p>
                                                    <p className="text-lg font-black font-mono text-[#1A1A1A]">{formatMoney(analytics?.insights?.avgWeekday || 0)}</p>
                                                </div>
                                                <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-center">
                                                    <p className="text-[9px] font-bold text-red-500 uppercase mb-1">周末日均</p>
                                                    <p className="text-lg font-black font-mono text-red-700">{formatMoney(analytics?.insights?.avgWeekend || 0)}</p>
                                                </div>
                                                <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-center">
                                                    <p className="text-[9px] font-bold text-purple-500 uppercase mb-1">假期日均</p>
                                                    <p className="text-lg font-black font-mono text-purple-700">{formatMoney(analytics?.insights?.avgHoliday || 0)}</p>
                                                </div>
                                            </div>
 
                                            {/* Best day */}
                                            <div className="bg-gradient-to-r from-[#FFD700]/10 to-transparent p-3 rounded-xl border border-[#FFD700]/30 mb-4 flex justify-between items-center">
                                                <div>
                                                    <p className="text-[9px] font-bold text-[#B8860B] uppercase">Best Revenue Day</p>
                                                    <p className="text-sm font-black text-[#1A1A1A] mt-0.5">{analytics?.insights?.bestDay?.date || '-'}</p>
                                                </div>
                                                <p className="text-xl font-black font-mono text-[#1A1A1A]">{formatMoney(analytics?.insights?.bestDay?.sales || 0)}</p>
                                            </div>
 
                                            {/* Daily revenue table */}
                                            <h3 className="text-sm font-black text-[#1A1A1A] border-l-4 border-blue-600 pl-3 mb-2">Daily Revenue Log</h3>
                                            <div className="max-h-[750px] overflow-hidden">
                                                <table className="w-full text-[10px]">
                                                    <thead><tr className="bg-gray-100 border-y border-gray-300">
                                                        <th className="p-1.5 text-left font-bold w-16">Date</th>
                                                        <th className="p-1.5 text-left font-bold w-12">Day</th>
                                                        <th className="p-1.5 text-right font-bold w-28">Revenue (RM)</th>
                                                        <th className="p-1.5 text-left font-bold">Visual</th>
                                                    </tr></thead>
                                                    <tbody>
                                                        {(analytics?.dailySales || []).map((d: any, i: number) => {
                                                            const maxVal = Math.max(...(analytics?.dailySales || []).map((x: any) => x.sales), 1);
                                                            const pct = (d.sales / maxVal) * 100;
                                                            const dayOfWeek = new Date(d.date + 'T00:00:00').getDay();
                                                            const isHol = MY_HOLIDAYS_2026.includes(d.date);
                                                            const isWknd = dayOfWeek === 0 || dayOfWeek === 6;
                                                            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                                                            const barColor = isHol ? 'bg-purple-400' : isWknd ? 'bg-red-400' : 'bg-blue-400';
                                                            const tagColor = isHol ? 'text-purple-600' : isWknd ? 'text-red-500' : 'text-gray-500';
                                                            return (
                                                                <tr key={i} className="border-b border-gray-100">
                                                                    <td className="py-0.5 px-1.5 font-mono text-gray-600">{d.date.slice(5)}</td>
                                                                    <td className={`py-0.5 px-1.5 font-bold ${tagColor}`}>周{dayNames[dayOfWeek]}{isHol ? ' 🎌' : ''}</td>
                                                                    <td className="py-0.5 px-1.5 text-right font-mono font-bold text-[#1A1A1A]">{formatMoney(d.sales)}</td>
                                                                    <td className="py-0.5 px-1.5">
                                                                        <div className="w-full h-2.5 bg-gray-100 rounded-sm overflow-hidden">
                                                                            <div className={`h-full ${barColor} rounded-sm relative overflow-hidden`} style={{ width: `${Math.max(2, pct)}%` }}>
                                                                                {(d as any).delivery > 0 && (
                                                                                    <div className="absolute top-0 right-0 bottom-0 bg-orange-400" style={{ width: `${Math.min(100, ((d as any).delivery / Math.max(d.sales, 1)) * 100)}%` }}></div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
 
                                            {/* Insight */}
                                            {(() => {
                                                const avgWk = Number(analytics?.insights?.avgWeekday || 0);
                                                const avgWknd = Number(analytics?.insights?.avgWeekend || 0);
                                                const diffPct = avgWk > 0 ? ((avgWknd - avgWk) / avgWk) * 100 : 0;
                                                return (
                                                    <>
                                                        <div className="flex gap-4 mt-3 mb-2">
                                                            <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1"><div className="w-3 h-2.5 bg-blue-400 rounded-sm"></div> 工作日 (堂食)</span>
                                                            <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1"><div className="w-3 h-2.5 bg-red-400 rounded-sm"></div> 周末 (堂食)</span>
                                                            <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1"><div className="w-3 h-2.5 bg-purple-400 rounded-sm"></div> 假期 (堂食)</span>
                                                            <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1"><div className="w-3 h-2.5 bg-orange-400 rounded-sm"></div> 外卖平台</span>
                                                        </div>
                                                        <div className="bg-[#1A1A1A] p-3 rounded-xl text-white">
                                                            <p className="text-[10px] text-gray-300 leading-relaxed">
                                                                💡 周末产出比平日高 <span className="font-bold text-[#FFD700] text-xs">{diffPct.toFixed(1)}%</span>。
                                                                {diffPct > 40 ? ' 建议平日推出午市套餐填补产能空缺；周末全力保障后厨备货。' : ' 日常与周末流量平稳，注重核心客户维护。'}
                                                                {' '}橙色区域代表外卖平台占比，平日外卖依赖度更高时应重点关注平台获客成本。
                                                            </p>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div className="text-center text-gray-400 text-[10px] font-mono">- PAGE 5 OF 6 -</div>
                                    </div>
 
                                    {/* ═══════════ PAGE 6: AI RECOMMENDATIONS + SIGNATURE ═══════════ */}
                                    <div className="px-10 pt-8 pb-6 bg-white flex flex-col justify-between" style={{ height: '1122px' }}>
                                        <div>
                                            <h2 className="text-xl font-black uppercase tracking-widest border-b-4 border-emerald-600 pb-3 mb-5 text-[#1A1A1A]">AI Business Recommendations (经营建议)</h2>
 
                                            {/* 月度评级 */}
                                            <div className={`p-4 rounded-xl mb-5 border-2 ${(analytics?.netMargin || 0) > 20 ? 'bg-emerald-50 border-emerald-300' : (analytics?.netMargin || 0) > 10 ? 'bg-blue-50 border-blue-300' : (analytics?.netMargin || 0) > 0 ? 'bg-orange-50 border-orange-300' : 'bg-red-50 border-red-300'}`}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="font-black text-sm uppercase">本月经营评级</h3>
                                                    <span className={`text-base font-black px-3 py-1 rounded-lg ${netEval?.color || ''}`}>{netEval?.label || 'N/A'}</span>
                                                </div>
                                                <div className="grid grid-cols-4 gap-3 text-center">
                                                    <div><p className="text-[8px] text-gray-500 font-bold">总流水</p><p className="text-xs font-mono font-black">{formatMoney(analytics?.pnl?.totalGrossRevenue || 0)}</p></div>
                                                    <div><p className="text-[8px] text-gray-500 font-bold">纯营收</p><p className="text-xs font-mono font-black">{formatMoney(analytics?.pnl?.netRealizedRevenue || 0)}</p></div>
                                                    <div><p className="text-[8px] text-gray-500 font-bold">净利</p><p className="text-xs font-mono font-black">{formatMoney(analytics?.netProfit || 0)}</p></div>
                                                    <div><p className="text-[8px] text-gray-500 font-bold">净利率</p><p className="text-xs font-mono font-black">{(analytics?.netMargin || 0).toFixed(1)}%</p></div>
                                                </div>
                                            </div>
 
                                            {/* 具体建议 */}
                                            <h3 className="text-sm font-black text-[#1A1A1A] border-l-4 border-emerald-600 pl-3 mb-3">Actionable Recommendations</h3>
                                            <div className="space-y-2.5 mb-5">
                                                {/* COGS */}
                                                {(() => {
                                                    const cogsM = analytics?.margins?.cogs || 0;
                                                    const top3 = (analytics?.lists?.cogsList || []).slice(0, 3);
                                                    const biggestMover = (analytics?.topMovers || []).find((m: any) => m.type === 'COGS' && (m.delta || 0) > 0);
                                                    return (
                                                        <div className="border border-gray-200 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${cogsM > 40 ? 'bg-red-100 text-red-700' : cogsM > 35 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                                    {cogsM > 40 ? '🔴 警告' : cogsM > 35 ? '🟡 留意' : '🟢 健康'}
                                                                </span>
                                                                <span className="text-xs font-black text-[#1A1A1A]">食材成本 (COGS {cogsM.toFixed(1)}%)</span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-600 leading-relaxed">
                                                                Top 3 消耗品类: {top3.map((g: any) => `${(g.label || '').split(' ')[0]}(${(g.pct || 0).toFixed(0)}%)`).join('、')}。
                                                                {biggestMover ? ` 本月涨幅最大: ${(biggestMover.label || '').split(' ')[0]} (+${formatMoney(Math.abs(biggestMover.delta))}, ↑${Math.abs(biggestMover.deltaPct || 0).toFixed(0)}%)。` : ''}
                                                                {cogsM > 40 ? ' 行动: ①与头三大供应商重新议价，争取 3-5% 折让 ②厨房实施每周盘点制度，追踪损耗率 ③评估高成本菜品是否需要调价或替换食材。'
                                                                 : cogsM > 35 ? ' 行动: ①关注季节性涨价品类，提前锁定价格 ②对比多家供应商报价，建立备选清单。'
                                                                 : ' 控制良好。建议: ①维持目前采购议价能力 ②关注季节性食材波动，雨季/节日前提前备货。'}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Labor */}
                                                {(() => {
                                                    const labM = laborDeptAnalysis.laborMarginSynced;
                                                    const staffCount = analytics?.payrollForecast?.activeStaffCount || 0;
                                                    const biggestDept = Object.entries(laborDeptAnalysis.deptMap).sort((a, b) => b[1].cost - a[1].cost)[0];
                                                    return (
                                                        <div className="border border-gray-200 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${labM > 25 ? 'bg-red-100 text-red-700' : labM < 18 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                                    {labM > 25 ? '🔴 偏高' : labM < 18 ? '🟡 偏低' : '🟢 健康'}
                                                                </span>
                                                                <span className="text-xs font-black text-[#1A1A1A]">人力效率 (Labor {labM.toFixed(1)}% · {staffCount}人)</span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-600 leading-relaxed">
                                                                {biggestDept ? `最大部门支出: ${biggestDept[0]} (${formatMoney((biggestDept[1] as any).cost)}, ${(biggestDept[1] as any).count}人)。` : ''}
                                                                {labM > 25
                                                                    ? ` 行动: ①审核周一至周三排班是否可精简 1-2 人 ②检查加班费是否超标(特别是厨房) ③评估兼职比例是否合理。`
                                                                    : labM < 18
                                                                    ? ' 行动: ①评估现有人手是否导致服务品质下降 ②检查客诉数据与翻台速度 ③考虑招聘兼职补充高峰段。'
                                                                    : ` 行动: ①定期做员工满意度调查，核心员工保留策略 ②评估是否有岗位可通过流程优化减少依赖。`}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Delivery */}
                                                {(() => {
                                                    const deliveryPct = (analytics?.pnl?.totalGrossRevenue || 0) > 0 ? ((analytics?.revenueDetails?.deliveryGross || 0) / (analytics?.pnl?.totalGrossRevenue || 1) * 100) : 0;
                                                    const grabDrainPct = (analytics?.deliveryBreakdown?.grabGross || 0) > 0 ? (((analytics?.pnl?.grabCommission || 0) + (analytics?.pnl?.grabAds || 0)) / (analytics?.deliveryBreakdown?.grabGross || 1) * 100) : 0;
                                                    const grabAdsPct = (analytics?.deliveryBreakdown?.grabGross || 0) > 0 ? ((analytics?.pnl?.grabAds || 0) / (analytics?.deliveryBreakdown?.grabGross || 1) * 100) : 0;
                                                    const actualTakeHome = (analytics?.revenueDetails?.deliveryGross || 0) - (analytics?.pnl?.totalDeliveryDirectCost || 0);
                                                    const takeHomePct = (analytics?.revenueDetails?.deliveryGross || 0) > 0 ? (actualTakeHome / (analytics?.revenueDetails?.deliveryGross || 1) * 100) : 0;
                                                    return (
                                                        <div className="border border-gray-200 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${grabDrainPct > 35 ? 'bg-red-100 text-red-700' : grabDrainPct > 30 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                                    {grabDrainPct > 35 ? '🔴 高成本' : grabDrainPct > 30 ? '🟡 留意' : '🟢 可控'}
                                                                </span>
                                                                <span className="text-xs font-black text-[#1A1A1A]">外卖渠道 (占总流水 {deliveryPct.toFixed(1)}% · 实得率 {takeHomePct.toFixed(1)}%)</span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-600 leading-relaxed">
                                                                Grab 综合获客成本 {grabDrainPct.toFixed(1)}% (基础抽佣+广告)，其中广告占 {grabAdsPct.toFixed(1)}%。
                                                                每 RM100 外卖流水实际到手 RM{takeHomePct.toFixed(0)}。
                                                                {grabDrainPct > 35
                                                                    ? ` 行动: ①本月暂停/减半 Grab 广告预算，观察自然单量跌幅 ②外卖菜品加价 10-15% 覆盖抽佣成本 ③建立 WhatsApp 自营接单渠道(周边 3KM 老客户)，每单节省 25-30% 抽佣。`
                                                                    : grabDrainPct > 30
                                                                    ? ` 行动: ①追踪广告 ROAS，暂停转化率 <2% 的关键词 ②评估 Panda/Shopee 低量平台是否值得维护(人力/出错成本) ③外卖专属套餐提高客单价摊薄固定抽佣。`
                                                                    : ` 外卖成本可控。建议: ①定期核对各平台结算对账单 ②关注平台政策调整(抽佣变化/新收费项) ③高峰时段优先堂食订单保障出餐效率。`}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Revenue Pattern */}
                                                {(() => {
                                                    const avgWk = Number(analytics?.insights?.avgWeekday || 0);
                                                    const avgWknd = Number(analytics?.insights?.avgWeekend || 0);
                                                    const diffPct = avgWk > 0 ? ((avgWknd - avgWk) / avgWk) * 100 : 0;
                                                    const avgDaily = analytics?.avgDailySales || 0;
                                                    const targetMonthly = avgDaily * 30;
                                                    return (
                                                        <div className="border border-gray-200 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">📊 营收模式</span>
                                                                <span className="text-xs font-black text-[#1A1A1A]">日均 {formatMoney(avgDaily)} · 周末溢价 +{diffPct.toFixed(0)}%</span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-600 leading-relaxed">
                                                                {diffPct > 50
                                                                    ? `平日与周末落差极大(${diffPct.toFixed(0)}%)，平日产能严重空转。行动: ①推出周一至周四 11:30-14:00 午市商务套餐(RM15-18) ②外卖平台平日投放 RM5 减免券拉升单量 ③平日排班精简 20%，节省人力。`
                                                                    : diffPct > 30
                                                                    ? `周末高于平日 ${diffPct.toFixed(0)}%，可优化平日产出。行动: ①针对附近办公楼推 Group Order 团餐 ②与外卖平台协商平日流量扶持 ③考虑周二/三限时优惠培养回头客。`
                                                                    : `日常营收波动平稳。行动: ①通过菜单工程提升高毛利菜品曝光率 ②关注客单价趋势，必要时推组合套餐 ③保持核心客户维护(会员/老客)。`}
                                                                {` 按当前日均推算，月度潜在营收约 ${formatMoney(targetMonthly)}。`}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                {/* OPEX */}
                                                <div className="border border-gray-200 rounded-lg p-3">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${(analytics?.margins?.opex || 0) > 15 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                            {(analytics?.margins?.opex || 0) > 15 ? '🟡 留意' : '🟢 正常'}
                                                        </span>
                                                        <span className="text-xs font-black text-[#1A1A1A]">运营杂费 (OPEX {(analytics?.margins?.opex || 0).toFixed(1)}%)</span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-600 leading-relaxed">
                                                        {(analytics?.margins?.opex || 0) > 15
                                                            ? `行动: ①逐项审核水电煤气，检查是否有漏水/设备老化导致异常消耗 ②维修费用若持续偏高，评估设备更换 ROI ③清洁/虫控等外包合约是否到期可重新议价。`
                                                            : `运营杂费控制良好。建议: ①定期检查水电表读数，预防异常 ②评估年度合约(保险/网络)是否有更优方案 ③建立 RM500+ 支出审批制度。`}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Action Items */}
                                            <div className="bg-[#1A1A1A] p-4 rounded-xl text-white">
                                                <h3 className="font-black text-[#FFD700] text-xs uppercase mb-2">📌 下月重点行动 (Priority Action Items)</h3>
                                                <div className="space-y-1.5 text-[10px] text-gray-300">
                                                    {(() => {
                                                        const items: string[] = [];
                                                        const cogsM = analytics?.margins?.cogs || 0;
                                                        const labM = laborDeptAnalysis.laborMarginSynced;
                                                        const grabDrainPct = (analytics?.deliveryBreakdown?.grabGross || 0) > 0 ? (((analytics?.pnl?.grabCommission || 0) + (analytics?.pnl?.grabAds || 0)) / (analytics?.deliveryBreakdown?.grabGross || 1) * 100) : 0;

                                                        // 按严重程度排序
                                                        if (cogsM > 40) items.push(`🔴 [紧急] 食材成本 ${cogsM.toFixed(1)}% 超标 → 本周内约见 Top 3 供应商议价，目标降至 38% 以下`);
                                                        if (labM > 25) items.push(`🔴 [紧急] 人力成本 ${labM.toFixed(1)}% 偏高 → 本周重审排班表，优先精简周一至周三非高峰时段`);
                                                        if (grabDrainPct > 35) items.push(`🔴 [紧急] Grab 获客成本 ${grabDrainPct.toFixed(1)}% → 本周将广告预算减半，观察 7 天自然单量变化`);
                                                        
                                                        if (cogsM > 35 && cogsM <= 40) items.push(`🟡 [本月] 食材成本 ${cogsM.toFixed(1)}% 接近警戒线 → 建立每周盘点制度，追踪 Top 5 食材消耗`);
                                                        if (labM < 18) items.push(`🟡 [本月] 人力成本 ${labM.toFixed(1)}% 偏低 → 检查客诉率与出餐速度，评估是否需要补充人手`);
                                                        
                                                        items.push('📋 [常规] 核对所有外卖平台当月结算对账单，确认抽佣金额与系统记录一致');
                                                        items.push('📋 [常规] 确保所有 RM500+ 支出均已上传收据凭证，完善审计合规');
                                                        if (!laborDeptAnalysis.hasData) items.push('⚠️ [系统] 尽快完成当月薪资结算(Payroll模块)，确保报表数据准确');
                                                        items.push('📋 [常规] 每周五下午检查下周食材备货清单，预防周末断货风险');

                                                        return items.map((item, i) => <p key={i}>{item}</p>);
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
 
                                        {/* Signature */}
                                        <div>
                                            <div className="pt-6 border-t border-black flex justify-between px-8 mb-4">
                                                <div className="text-center"><div className="w-44 h-px bg-black mb-2"></div><p className="text-[11px] font-black uppercase tracking-widest">Prepared By</p><p className="text-[9px] text-gray-500 mt-0.5">御膳智控 (AI Financial Core)</p></div>
                                                <div className="text-center"><div className="w-44 h-px bg-black mb-2"></div><p className="text-[11px] font-black uppercase tracking-widest">Reviewed By</p><p className="text-[9px] text-gray-500 mt-0.5">Director / Owner</p></div>
                                            </div>
                                            <div className="text-center text-gray-400 text-[10px] font-mono">- PAGE 6 OF 6 - END OF REPORT -</div>
                                        </div>
                                    </div>
 
                                </div>
                            </div>

                            {/* 👑 开销对比 PDF 隐藏区域 */}
                            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                                <div ref={printCostRef} className="w-[850px] bg-[#F5F7FA] font-sans text-black relative flex flex-col" style={{ width: '850px' }}>
                                    {(() => {
                                        const cogsCur = analytics.costs.totalCOGS;
                                        const cogsPrev = analytics.lists.cogsList.reduce((sum, g) => sum + (g.prevAmount || 0), 0);
                                        const cogsDelta = cogsCur - cogsPrev;
                                        const cogsPct = cogsPrev > 0 ? (cogsDelta / cogsPrev) * 100 : 0;

                                        const laborOpexList = [...analytics.lists.laborList, ...analytics.lists.opexList];
                                        const loCur = analytics.costs.totalLabor + analytics.costs.totalOPEX;
                                        const loPrev = laborOpexList.reduce((sum, g) => sum + (g.prevAmount || 0), 0);
                                        const loDelta = loCur - loPrev;
                                        const loPct = loPrev > 0 ? (loDelta / loPrev) * 100 : 0;

                                        const grandCur = cogsCur + loCur;
                                        const grandPrev = cogsPrev + loPrev;
                                        const grandDelta = grandCur - grandPrev;
                                        const grandPct = grandPrev > 0 ? (grandDelta / grandPrev) * 100 : 0;

                                        // 将数据切分为两座绝对不可逾越的“孤岛”
                                        const cogsSectionItems: any[] = [
                                            { isHeader: true, title: 'COGS Breakdown (销货成本)', color: 'border-red-500' },
                                            ...analytics.lists.cogsList.map(g => ({ ...g, isRow: true })),
                                            { isSubTotal: true, title: 'Total COGS (总销货成本)', cur: cogsCur, prev: cogsPrev, delta: cogsDelta, pct: cogsPct }
                                        ];

                                        const laborOpexSectionItems: any[] = [
                                            { isHeader: true, title: 'Labor & OPEX Breakdown (人工与运营)', color: 'border-blue-500' },
                                            ...laborOpexList.map(g => ({ ...g, isRow: true })),
                                            { isSubTotal: true, title: 'Total Labor & OPEX (总人工与运营)', cur: loCur, prev: loPrev, delta: loDelta, pct: loPct },
                                            { isGrandTotal: true, title: 'GRAND TOTAL (门店总支出)', cur: grandCur, prev: grandPrev, delta: grandDelta, pct: grandPct }
                                        ];

                                        // 3. 防切割分页引擎 (基于 A4 比例，每页容量从 18 提升到 20)
                                        const PAGE_SIZE = 20;
                                        const pages: any[][] = [];
                                        
                                        // 核心算法：独立装填，绝不跨区。只要是大类切换，必定触发新的一页。
                                        const chunkItems = (items: any[]) => {
                                            let currentPage: any[] = [];
                                            let currentWeight = 0;
                                            items.forEach(item => {
                                                const weight = item.isHeader ? 2.5 : item.isSubTotal ? 2 : item.isGrandTotal ? 3 : 1;
                                                if (currentWeight + weight > PAGE_SIZE) {
                                                    pages.push(currentPage);
                                                    currentPage = [item];
                                                    currentWeight = weight;
                                                } else {
                                                    currentPage.push(item);
                                                    currentWeight += weight;
                                                }
                                            });
                                            if (currentPage.length > 0) pages.push(currentPage);
                                        };

                                        chunkItems(cogsSectionItems);
                                        chunkItems(laborOpexSectionItems);

                                        return pages.map((pageData, pageIndex) => (
                                            // 👇 强制设置高度为 1202px，与 A4 的真实几何比例完美咬合
                                            <div key={pageIndex} className="p-10 bg-white flex flex-col justify-between" style={{ height: '1202px', borderBottom: '1px dashed #e5e7eb', boxSizing: 'border-box' }}>
                                                <div>
                                                    {pageIndex === 0 && (
                                                        <div className="flex justify-between items-end border-b-4 border-[#1A1A1A] pb-6 mb-8">
                                                            <div>
                                                                <h1 className="text-3xl font-black uppercase tracking-widest mb-2 text-[#1A1A1A]">开销对比报表</h1>
                                                                <p className="text-sm font-bold text-gray-500">COST COMPARISON REPORT · KIM LIAN KEE</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-lg font-bold text-[#1A1A1A]">{startDate.slice(0, 7)} <span className="text-gray-400 mx-1">vs</span> {compareMonth}</p>
                                                                <p className="text-xs text-gray-500 mt-2 font-bold bg-gray-100 px-3 py-1 rounded inline-block">Mode: {accountingMode === 'ACCRUAL' ? 'Accrual (权责发生制)' : 'Cash (收付实现制)'}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* 加了 whitespace-nowrap 强制不换行，且拓宽了主容器至 850px */}
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="bg-gray-100 border-y border-black">
                                                                <th className="p-3 text-left font-black w-1/3">品类 (Category)</th>
                                                                <th className="p-3 text-right font-black whitespace-nowrap">本月 ({startDate.slice(0, 7)})</th>
                                                                <th className="p-3 text-right font-black whitespace-nowrap">对比 ({compareMonth})</th>
                                                                <th className="p-3 text-right font-black whitespace-nowrap">变动 (Delta)</th>
                                                                <th className="p-3 text-right font-black whitespace-nowrap">%</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {pageData.map((item, idx) => {
                                                                if (item.isHeader) {
                                                                    return (
                                                                        <tr key={`h-${idx}`}>
                                                                            <td colSpan={5} className="pt-8 pb-3">
                                                                                <h3 className={`text-lg font-black uppercase border-l-4 ${item.color} pl-3 text-[#1A1A1A]`}>{item.title}</h3>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                }
                                                                if (item.isRow) {
                                                                    return (
                                                                        <tr key={item.id} className="border-b border-gray-200">
                                                                            <td className="p-3 font-bold text-[#1A1A1A] pr-4">{item.label}</td>
                                                                            <td className="p-3 text-right font-mono text-[#1A1A1A] whitespace-nowrap">{formatMoney(item.amount)}</td>
                                                                            <td className="p-3 text-right font-mono text-gray-500 whitespace-nowrap">{(item.prevAmount || 0) > 0 ? formatMoney(item.prevAmount) : '-'}</td>
                                                                            <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${(item.delta || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                {(item.delta || 0) > 0 ? '+' : ''}{formatMoney(item.delta || 0)}
                                                                            </td>
                                                                            <td className={`p-3 text-right font-bold whitespace-nowrap ${(item.deltaPct || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                {(item.deltaPct || 0) > 0 ? '+' : ''}{(item.deltaPct || 0).toFixed(1)}%
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                }
                                                                if (item.isSubTotal) {
                                                                    return (
                                                                        <tr key={`st-${idx}`} className="bg-gray-50 border-y border-gray-300">
                                                                            <td className="p-3 font-black text-[#1A1A1A] text-right">{item.title} :</td>
                                                                            <td className="p-3 text-right font-mono font-black text-[#1A1A1A] whitespace-nowrap">{formatMoney(item.cur)}</td>
                                                                            <td className="p-3 text-right font-mono font-bold text-gray-500 whitespace-nowrap">{item.prev > 0 ? formatMoney(item.prev) : '-'}</td>
                                                                            <td className={`p-3 text-right font-mono font-black whitespace-nowrap ${item.delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                {item.delta > 0 ? '+' : ''}{formatMoney(item.delta)}
                                                                            </td>
                                                                            <td className={`p-3 text-right font-black whitespace-nowrap ${item.pct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                {item.pct > 0 ? '+' : ''}{item.pct.toFixed(1)}%
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                }
                                                                if (item.isGrandTotal) {
                                                                    return (
                                                                        <tr key={`gt-${idx}`} className="bg-[#1A1A1A] text-white">
                                                                            <td className="p-4 font-black text-right text-lg text-[#FFD700]">{item.title} :</td>
                                                                            <td className="p-4 text-right font-mono font-black text-lg whitespace-nowrap">{formatMoney(item.cur)}</td>
                                                                            <td className="p-4 text-right font-mono font-bold text-gray-400 whitespace-nowrap">{item.prev > 0 ? formatMoney(item.prev) : '-'}</td>
                                                                            <td className={`p-4 text-right font-mono font-black whitespace-nowrap ${item.delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                                                {item.delta > 0 ? '+' : ''}{formatMoney(item.delta)}
                                                                            </td>
                                                                            <td className={`p-4 text-right font-black whitespace-nowrap ${item.pct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                                                {item.pct > 0 ? '+' : ''}{item.pct.toFixed(1)}%
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                }
                                                                return null;
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                
                                                <div>
                                                    {pageIndex === pages.length - 1 && (
                                                        <div className="pt-8 flex justify-between px-10 mb-8">
                                                            <div className="text-center"><div className="w-48 h-px bg-[#1A1A1A] mb-3"></div><p className="text-sm font-black uppercase text-[#1A1A1A]">Prepared By</p></div>
                                                            <div className="text-center"><div className="w-48 h-px bg-[#1A1A1A] mb-3"></div><p className="text-sm font-black uppercase text-[#1A1A1A]">Approved By</p></div>
                                                        </div>
                                                    )}
                                                    <div className="text-center text-gray-400 text-xs font-mono">- PAGE {pageIndex + 1} OF {pages.length} -</div>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>

                        </div>
                    )}
                </div>

                {/* ========== DetailView Modal ========== */}
                {detailView && (
                    <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full h-full md:h-auto md:rounded-[2rem] md:w-[95vw] md:max-w-4xl shadow-2xl flex flex-col md:max-h-[90vh] overflow-hidden">
                            <div className="p-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:p-4 sm:pt-[max(env(safe-area-inset-top),1rem)] md:p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/50 shrink-0 gap-2">
                                <div className="min-w-0 flex-1"><h3 className="font-black text-base sm:text-lg md:text-xl text-[#1A1A1A] flex items-center gap-1.5 sm:gap-2"><Receipt size={18} className="text-gray-400 shrink-0 sm:w-5 sm:h-5 md:w-6 md:h-6"/><span className="truncate">{detailView?.title}</span></h3><p className="text-[10px] sm:text-xs text-gray-500 font-bold mt-0.5 sm:mt-1 uppercase tracking-widest">{detailView?.items?.length} 条记录</p></div>
                                <button onClick={() => setDetailView(null)} className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-gray-200 bg-gray-100 rounded-full active:scale-95 transition-all shrink-0"><X size={20} className="sm:w-[22px] sm:h-[22px]"/></button>
                            </div>
                            <div className="flex-grow overflow-y-auto touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                                <table className="w-full text-left text-sm hidden md:table">
                                    <thead className="bg-gray-100 text-gray-500 font-bold text-xs uppercase sticky top-0 z-10 border-b border-gray-200"><tr><th className="p-4">Date</th><th className="p-4">Description / Payee</th><th className="p-4">Source</th><th className="p-4 text-right">Amount</th><th className="p-4 w-12">Doc</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {detailView?.items?.length === 0 ? (<tr><td colSpan={5} className="p-10 text-center text-gray-400 italic">无相关记录</td></tr>) : (
                                            detailView?.items?.map((item) => (
                                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="p-4 font-mono text-gray-600 whitespace-nowrap">{item.date}</td>
                                                    <td className="p-4"><div className="font-bold text-[#1A1A1A]">{item.desc}</div><div className="text-[10px] text-gray-400 font-mono mt-0.5">{item.id}</div></td>
                                                    <td className="p-4"><span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${item.source === 'Settlement' ? 'bg-orange-50 text-orange-700' : item.source.startsWith('Payroll') ? 'bg-purple-50 text-purple-700' : item.source === 'Bill Payment' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{item.source}</span></td>
                                                    <td className="p-4 text-right font-mono font-black text-[#1A1A1A]">RM {Number(item.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                    <td className="p-4">{item.documentLink ? (<a href={item.documentLink} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" title="查看原档"><ExternalLink size={14} className="text-blue-600"/></a>) : null}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                                <div className="md:hidden">
                                    {detailView?.items?.length === 0 ? (<div className="p-10 text-center text-gray-400 italic text-sm">无相关记录</div>) : (
                                        <div className="divide-y divide-gray-100">
                                            {detailView?.items?.map((item) => (
                                                <div key={item.id} className="px-3 py-2.5 sm:p-4 hover:bg-gray-50/50 transition-colors">
                                                    <div className="flex items-center justify-between mb-1 sm:mb-1.5 gap-2">
                                                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0"><span className="text-[10px] sm:text-[11px] font-mono font-bold text-gray-500">{item.date}</span><span className={`text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase shrink-0 ${item.source === 'Settlement' ? 'bg-orange-50 text-orange-700' : item.source.startsWith('Payroll') ? 'bg-purple-50 text-purple-700' : item.source === 'Bill Payment' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{item.source}</span></div>
                                                        <span className="font-mono font-black text-[#1A1A1A] text-xs sm:text-sm shrink-0 tabular-nums">RM {Number(item.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                    </div>
                                                    <p className="text-xs sm:text-sm font-bold text-[#1A1A1A] leading-snug">{item.desc}</p>
                                                    <div className="flex items-center justify-between mt-1 sm:mt-1.5">
                                                        <span className="text-[9px] sm:text-[10px] text-gray-400 font-mono truncate max-w-[60%] sm:max-w-[70%]">{item.id}</span>
                                                        {item.documentLink ? (<a href={item.documentLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-blue-600 bg-blue-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg active:scale-95 transition-transform" onClick={(e) => e.stopPropagation()}><ExternalLink size={10} className="sm:w-[11px] sm:h-[11px]"/> 原档</a>) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:p-4 sm:pb-[max(env(safe-area-inset-bottom),1rem)] bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
                                <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase">Total</span>
                                <span className="text-lg sm:text-xl font-black font-mono text-[#1A1A1A] tabular-nums">RM {Number(detailView?.items?.reduce((sum, i) => sum + (i.amount || 0), 0) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};