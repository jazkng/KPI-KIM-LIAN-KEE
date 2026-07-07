export enum UserRole {
  BOSS = 'BOSS',
  MANAGEMENT = 'MANAGEMENT',
  STAFF = 'STAFF'
}

export type StaffRole = string;

// NEW: Org Rank Definition
export type EmployeeRank = 'TOP' | 'MANAGEMENT' | 'HEAD' | 'PIC' | 'CREW';

export interface PayrollRecordDetail {
    employeeId: string;
    employeeName: string;
    basicSalary: number;
    allowance: number;
    extraSubsidy?: number; // 🟢 新增：补贴 (油费等额外)
    ot?: number;
    bonus?: number;
    otherEarning?: number;
    otherEarningNote?: string;
    penalty: number;
    unpaidLeave?: number;
    hostelFee?: number;    // 🟢 新增：住宿费
    advanceLoan: number;
    otherDeduction?: number;
    otherDeductionNote?: string;
    ee_epf: number;
    ee_socso: number;
    ee_eis?: number;
    ee_pcb?: number;
    er_epf: number;
    er_socso: number;
    er_eis: number;
    netPay: number;
    totalCost: number;
    note?: string;
    paymentMethod?: 'BANK' | 'CASH' | 'CHEQUE';
    proRateMode?: '26_DAYS' | 'CALENDAR_DAYS' | 'WORKABLE_DAYS';
    workDays?: number;
    paymentExpenseId?: string;
    isPaid?: boolean;
    paidAt?: string;
}

export interface PayrollRecord {
    id: string;
    month: string;
    totalAmount: number;
    totalNetPay: number;
    totalGovtPay: number;
    staffCount: number;
    status: 'POSTED' | 'DRAFT';
    isStatutoryPaid?: boolean;
    details: PayrollRecordDetail[];
    partTimeDetails?: any[];
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    clockIn: string;
    clockOut: string;
    durationMinutes: number;
    status: 'PRESENT' | 'LATE' | 'COMPLETED' | 'ABSENT' | 'COMPLETED_LATE' | 'EARLY_OUT' | 'LATE_AND_EARLY';
    notes?: string;
    source?: 'app' | 'face_machine';
    allTimes?: string[]; // 👑 新增：支持多段打卡时间，可存储多次进/出时间列表 (e.g. ["14:55", "18:02", "18:58", "01:15"])
}


/**
 * 单条价格历史条目（精简版 - 只存最关键字段）
 * 大小：~80-100 bytes/条
 */
export interface StockPriceEntry {
    date: string;           // YYYY-MM-DD，进货日期
    cost: number;           // 当时的成本价
    sourceLogId: string;    // 来源 inventory_log ID（用于追溯与删除）
    timestamp: string;      // ISO 时间戳（精确排序）
}
 
/**
 * 单商品的完整价格历史文档
 * 路径：stock_price_history/{stockId}
 * 大小限制：1MB ≈ 10,000条 ≈ 27年每日进货
 */
export interface StockPriceHistory {
    stockId: string;
    entries: StockPriceEntry[];
    lastEntryDate: string;      // 👑 关键：用于 where('lastEntryDate', '>=', cutoff) 高效筛选
    lastEntryCost: number;      // 最新条目的价格（冗余字段，省查询）
    lastUpdated: string;        // ISO 时间戳
}
 
import type { AppModule } from './components/constants';
export type { AppModule };

export type RosterStatus = 'WORK' | 'OFF' | 'LEAVE' | 'MC' | 'ANNUAL' | 'ABSENT' | 'PENDING' | 'HOLIDAY';

export type LogCategory = 'VIP' | 'COMPLAINT' | 'REPAIR' | 'OTHER';
export type LogPriority = 'NORMAL' | 'HIGH';

export type QueueSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type QueueStatus = 'WAITING' | 'CALLING' | 'SEATED' | 'CANCELLED';

export type RecurringBillCategory = 'RENT' | 'ELECTRICITY' | 'WATER' | 'INTERNET' | 'WASTE' | 'LICENSE' | 'SUBSCRIPTION' | 'OTHER';
export type RecurringBillType = 'MONTHLY' | 'YEARLY';

export type AllowanceKey = 'ATTENDANCE' | 'MEAL' | 'HOSTEL' | 'OTHER';

// 👑 营销一级分类
export type MarketingSubCategory = 
  | 'TRAINING'              // 人力培训
  | 'AD_OUTPUT'             // 广告输出 (需要再选渠道)
  | 'PROMO_EQUIPMENT'       // 宣传器材
  | 'PROMO_COST'            // 宣传成本
  | 'PRO_TEAM'              // 专业团队
  | 'MKT_SUBSCRIPTION'      // 营销订阅
  | 'PRINTING';             // 印刷成本 (包含全部的印刷费用和Banner，挂条等)

// 👑 广告渠道 (仅当 subCategory === 'AD_OUTPUT' 时需要)
export type AdChannel = 
  | 'GOOGLE'
  | 'META'                  // FB + IG 合并
  | 'XHS'                   // 小红书
  | 'TIKTOK'
  | 'DZDP'                  // 大众点评
  | 'SHOPEE'                // Shopee Ads
  | 'YOUTUBE'
  | 'OTHER';

// 中文标签映射
export const MARKETING_SUBCAT_LABELS: Record<MarketingSubCategory, string> = {
  TRAINING: '人力培训',
  AD_OUTPUT: '广告输出',
  PROMO_EQUIPMENT: '宣传器材',
  PROMO_COST: '宣传成本',
  PRO_TEAM: '专业团队',
  MKT_SUBSCRIPTION: '营销订阅',
  PRINTING: '印刷成本 (含全部印刷费/Banner/挂条等)'
};

export const AD_CHANNEL_LABELS: Record<AdChannel, string> = {
  GOOGLE: 'Google Ads',
  META: 'Facebook / Instagram',
  XHS: '小红书',
  TIKTOK: 'TikTok',
  DZDP: '大众点评',
  SHOPEE: 'Shopee Ads',
  YOUTUBE: 'YouTube',
  OTHER: '其他渠道'
};

// 👑 营销细分 EMOJI (UI 视觉用)
export const MARKETING_SUBCAT_EMOJIS: Record<MarketingSubCategory, string> = {
  TRAINING: '👥',
  AD_OUTPUT: '📢',
  PROMO_EQUIPMENT: '🎪',
  PROMO_COST: '🎁',
  PRO_TEAM: '🎬',
  MKT_SUBSCRIPTION: '📅',
  PRINTING: '🖨️',
};

// 👑 广告渠道 EMOJI
export const AD_CHANNEL_EMOJIS: Record<AdChannel, string> = {
  GOOGLE: '🔍',
  META: '📘',
  XHS: '📕',
  TIKTOK: '🎵',
  DZDP: '⭐',
  SHOPEE: '🧡',
  YOUTUBE: '▶️',
  OTHER: '📌',
};

// 👑 渠道品牌色 (战略板热力图 Phase 3 用)
export const AD_CHANNEL_COLORS: Record<AdChannel, string> = {
  GOOGLE: '#4285F4',
  META: '#1877F2',
  XHS: '#FF2442',
  TIKTOK: '#000000',
  DZDP: '#FFC107',
  SHOPEE: '#EE4D2D',
  YOUTUBE: '#FF0000',
  OTHER: '#6B7280',
};

// 👑 水吧细分类别
export type BeverageSubCategory = 'FRUIT' | 'CANNED' | 'ALCOHOL' | 'TEA' | 'HERBAL' | 'POWDER' | 'MILK' | 'OTHER';
export const BEVERAGE_SUBCAT_LABELS: Record<BeverageSubCategory, string> = {
  FRUIT: '水果',
  CANNED: '罐装饮料',
  ALCOHOL: '酒类',
  TEA: '茶类',
  HERBAL: '凉茶原料',
  POWDER: '冲调粉料 (美禄/咖啡粉)',
  MILK: '炼奶/淡奶 (乳制品)',
  OTHER: '其他水吧原料'
};
export const BEVERAGE_SUBCAT_EMOJIS: Record<BeverageSubCategory, string> = {
  FRUIT: '🍎',
  CANNED: '🥤',
  ALCOHOL: '🍺',
  TEA: '🍵',
  HERBAL: '🌿',
  POWDER: '☕',
  MILK: '🥛',
  OTHER: '🧉'
};

// 👑 海鲜细分类别
export type SeafoodSubCategory = 'FISH' | 'SHRIMP' | 'SOTONG' | 'LALA' | 'SHRIMP_SOTONG' | 'PROCESSED';
export const SEAFOOD_SUBCAT_LABELS: Record<SeafoodSubCategory, string> = {
  FISH: '鱼类 (Fish)',
  SHRIMP: '虾类 (Prawn)',
  SOTONG: 'Sotong (苏东/鱿鱼)',
  LALA: 'Lala (贝类/螺类)',
  SHRIMP_SOTONG: '虾和Sotong (历史记录)',
  PROCESSED: '加工品 (Processed)'
};
export const SEAFOOD_SUBCAT_EMOJIS: Record<SeafoodSubCategory, string> = {
  FISH: '🐟',
  SHRIMP: '🦐',
  SOTONG: '🦑',
  LALA: '🐚',
  SHRIMP_SOTONG: '🦐🦑',
  PROCESSED: '🍥'
};

export interface EmployeeAttributes {
    efficiency: number;
    service: number;
    culinary: number;
    leadership: number;
    discipline: number;
}

// ========================================================================
// 🗄️ LEGACY: Old Assessment Record (保留读取旧数据用)
// ========================================================================
export interface AssessmentRecord {
    raterId: string;
    raterName: string;
    raterRole: 'OWNER' | 'STAFF';
    date: string;
    scores: EmployeeAttributes;
}

// ========================================================================
// ✨ V2 Assessment System - 季度评分系统 (2026 起启用)
// 说明:
//   - 按岗位动态 4 项指标 (3 核心 + 1 通用纪律底线)
//   - 4 档位: S(100) / A(75) / B(50) / C(25)
//   - 两层评分: HEAD/PIC 初评 → TOP 可覆盖 (覆盖必填原因)
//   - 季度周期强制评 (Q1/Q2/Q3/Q4)
// ========================================================================

// 季度标识：如 "2026-Q2"
export type QuarterKey = `${number}-Q${1 | 2 | 3 | 4}`;

// 单项指标打分
export interface MetricScoreV2 {
    metricKey: string;              // 对应 assessmentConfig.ts 的 MetricDef.key
    grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    score: number;                  // 120 / 110 / 95 / 75 / 55 / 35 / 15
    note?: string;                  // C 档必填，其他选填
    skipped?: boolean;              // 🟢 新增：支持特定项被老板跳过不评分
}

// 一轮完整评分
export interface AssessmentRecordV2 {
    id: string;                     // 建议格式: `${employeeId}_${quarter}` 保证唯一
    quarter: QuarterKey;
    employeeId: string;
    employeeName: string;
    jobCategory: string;            // 评分时固定快照 (员工换岗不影响历史)
    
    // 初评 (直属上级 / 可选，允许老板先评分)
    initialRating?: {
        raterId: string;
        raterName: string;
        raterRank: EmployeeRank;    // 'HEAD' | 'MANAGEMENT' | 'PIC'
        date: string;
        metrics: MetricScoreV2[];   // 岗位特定项
        overallScore: number;       // 平均分
    };
    
    // 老板覆盖 (可选)
    ownerOverride?: {
        ownerId: string;
        ownerName: string;
        date: string;
        metrics: MetricScoreV2[];
        overallScore: number;
        overrideReason: string;     // 🔴 必填
    };

    // 🟢 新增：支持多老板（4位老板）独立评分与备注
    bossRatings?: Record<string, {
        ownerId: string;
        ownerName: string;
        date: string;
        metrics: MetricScoreV2[];
        overallScore: number;
        skipped?: boolean;
        comment?: string;
    }>;
    
    // 最终结果 (冗余字段方便查询, = override ?? initial)
    finalScore: number;
    finalGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    
    // 状态机
    status: 'DRAFT' | 'SUBMITTED' | 'OVERRIDDEN' | 'FINALIZED';
    // DRAFT      = 初评草稿 (未提交)
    // SUBMITTED  = 初评已提交，等老板审
    // OVERRIDDEN = 老板已覆盖
    // FINALIZED  = 季度结束锁定 (不可再改)
}

// 员工档案上的评分汇总 (方便列表页/档案页快速显示，不用每次翻历史记录)
export interface EmployeeAssessmentSummary {
    currentQuarter?: QuarterKey;
    currentScore?: number;
    currentGrade?: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    
    // 近 4 个季度走势
    quarterHistory: {
        quarter: QuarterKey;
        score: number;
        grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    }[];
    
    // 年度平均 (Q4 结束后自动计算)
    yearlyAverage?: {
        year: number;
        avgScore: number;
        avgGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
        recommendation: 'PROMOTE' | 'RAISE' | 'MAINTAIN' | 'WATCH' | 'PIP';
    };
}

export interface WarningRecord {
    id: string;
    date: string;
    type: 'VERBAL' | 'WRITTEN' | 'FINAL'; // Mapped: Verbal (Record), Written (Yellow), Final (Red)
    reason: string;
    issuer: string;
    fineAmount?: number; // Added fine support
}

export interface SalaryRecord {
    date: string;
    amount: number;
    adjustment: number;
    percentage: number;
    reason: string;
}

export interface ReviewRecord {
    id: string;
    date: string;
    author: string;
    content: string;
    type: 'PRAISE' | 'CRITICISM' | 'NOTE';
    image?: string;
}

export interface CustomAllowance {
    id: string;
    amount: number;
    isActive: boolean;
}

// Ensure RoleGuide and SOP types are available
export interface RoleGuide {
    description: string;
    coreValue: string;
    safetyRedLine: string;
    duties: string[];
    troubleshooting: { issue: string; solution: string }[];
    salaryRange: { min: number; max: number };
    employeeRules: string[];
    specialIncentive: string;
    enabledAllowances: AllowanceKey[];
    probationExpectation: string;
    confirmedExpectation: string;
}

export interface SOPItem {
    id: string;
    label: string;
    completed: boolean;
    standard?: string;
    why?: string;
    isSystemTask?: boolean;
}

// NEW: Tracking stats for auto-calculation
export interface MisconductStats {
    smallCount: number;  // 5 triggers Yellow
    mediumCount: number; // 3 triggers Yellow
    yellowCount: number; // 3 triggers Red
}

export interface LoanRecord {
    id: string;
    date: string;
    type: 'BORROW' | 'REPAY';
    amount: number;
    note: string;
    via?: string; // e.g. 'CASH', 'BANK', 'SALARY_DEDUCT'
}

export interface Employee {
    id: string;
    name: string;
    role: string;
    secondaryRoles?: string[]; // <--- 新增：用于存储多项副职
    pin?: string;
    status: 'CONFIRMED' | 'PROBATION' | 'TERMINATED';
    rank?: EmployeeRank; 
    level: string; 
    basicSalary: number;
    salaryMode?: 'MONTHLY' | 'DAILY' | 'HOURLY';
    phone: string;
    icNumber?: string; 
    joinDate: string;
    absentDays: number;
    gender: 'Male' | 'Female';
    nationality: string;
    age?: number;
    email?: string;
    address?: string;
    avatar?: string;
    allowedModules?: AppModule[];
    moduleProficiency?: Record<string, number>;
    salaryHistory?: SalaryRecord[];
    warningHistory?: WarningRecord[];
    reviews?: ReviewRecord[];
    monthlyRestDays?: number;
    hasHostel?: boolean;
    isArchived?: boolean;
    terminationReason?: string;
    terminationDate?: string;
    bankName?: string;
    bankAccount?: string;
    epfNo?: string;
    socsoNo?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    typhoidExpiry?: string;
    foodHandlingDate?: string;
    dateOfBirth?: string;
    passportNo?: string;
    specialSkills?: string; // 专业技能 / 技能特长 (如：电工、养鱼、剖鱼)
    workPermitNo?: string;
    workPermitExpiry?: string;
    eisNo?: string;
    probationEndDate?: string;
    contractEndDate?: string;
    attributes?: EmployeeAttributes;
    assessmentHistory?: AssessmentRecord[]; 
    assessmentYearlyLimit?: number; 
    assessmentTargets?: string[]; 
    
    // ✨ V2 新增 (季度评分系统)
    assessmentRecordsV2?: AssessmentRecordV2[];
    assessmentSummary?: EmployeeAssessmentSummary;
    assessmentExempt?: boolean;             // true = 豁免评分 (Part-time)
    
    shirtSize?: string;
    height?: number;
    weight?: number;
    isQualityStaff?: boolean;
    hasEPF?: boolean;
    customAllowances?: CustomAllowance[];
    customGuide?: RoleGuide; 
    customSop?: { start: { title: string, tasks: SOPItem[] }, end: { title: string, tasks: SOPItem[] } };
    misconductStats?: MisconductStats;
    isAttendanceExempt?: boolean; // 新增：免打卡标记
    shiftGroup?: number; // 新增：班次人群 (1 = 班次1, 2 = 班次2)
    loanRecords?: LoanRecord[];
    terminationType?: 'RESIGNED' | 'FIRED' | 'CONTRACT_END' | 'ABSCONDED';
    noticeDate?: string;
    settlementStatus?: 'PENDING' | 'SETTLED';
}

export interface StoreConfig {
    businessDayCutoff: number;
    timeZoneOffset: number;
    googleScriptUrl?: string;
    cloudinaryCloudName?: string;
    cloudinaryUploadPreset?: string;
    googleDriveUrl?: string;
    storeName?: string;
    storeAddress?: string;
    storeHours?: string;
    storePhone?: string;
    language?: string;
    currency?: string;
    printerSettings?: string;
    geminiApiKey?: string;
    claudeApiKey?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
    firebaseApiKey?: string;
    firebaseProjectId?: string;
    appForceUpdate?: boolean;
    systemLogLevel?: string;
    
    // Attendance methods (Toggles)
    enablePinClock?: boolean;
    enableSelfieClock?: boolean;
    enableGpsClock?: boolean;
    enableQrClock?: boolean;
    enableWifiClock?: boolean;
    enableAttendanceDeduction?: boolean;
    latePenaltyMode?: 'FULL' | 'HALF' | 'WARN_ONLY';
    pdfPenaltyMode?: 'SHOW_AND_DEDUCT' | 'SHOW_BUT_NO_DEDUCT' | 'HIDE';
}

export interface SystemBackup {
    id?: string;
    version: string;
    timestamp: string;
    autoGenerated?: boolean;
    data: any;
}

export interface Shareholder {
    id: string;
    name: string;
    investmentAmount: number;
    equityPercentage: number;
    role?: string;
}

export interface TreasuryConfig {
    initialDate: string;
    initialCash: number;
    initialBank: number;
    shareholders: Shareholder[];
}

export interface FundTransfer {
    id: string;
    date: string;
    amount: number;
    fromAccount: 'CASH' | 'BANK' | 'SHAREHOLDER' | 'OTHER';
    toAccount: 'CASH' | 'BANK' | 'SHAREHOLDER';
    type: 'DEPOSIT' | 'WITHDRAWAL';
    note?: string;
    createdAt?: string;
}

export interface ExpenseItem {
    id: string;
    category: string;
    expenseType: 'CASH_OUT' | 'GENERAL' | 'RECURRING' | 'SALARY';
    company: string;
    amount: number;
    paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL';
    paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'DUITNOW';
    time: string;
    createdAt?: string;  // 👑 加这行：审计时间戳(实际操作发生的时间)
    note?: string;
    paidBy?: 'COMPANY' | 'SHOP_CASH' | string;
    isAdvancePayment?: boolean;
    totalBillAmount?: number;
    outstandingAmount?: number;
    creditNote?: number;
    dueDate?: string;
    linkUrl?: string;
    tags?: string[];
    settlementId?: string;
    paymentDate?: string;
    // 👑 PV V2 新增
    invoiceRef?: string;       // Supplier 真实 invoice 号 (如 INV-2026-0451)
    particulars?: string;      // 做账用的英文 Particulars (覆盖默认模板)
    // 👑 营销细分 V1 新增 (仅 category === 'MARKETING' 时启用)
    marketingSubCategory?: MarketingSubCategory;
    adChannel?: AdChannel;     // 仅 marketingSubCategory === 'AD_OUTPUT' 时启用
    campaignTag?: string;      // 自由标签 (如 "Mothers Day 2026")
    // 👑 水吧/海鲜细分 V1 新增
    beverageSubCategory?: BeverageSubCategory;
    seafoodSubCategory?: SeafoodSubCategory;
}

export interface SettlementRecord {
  id: string;
  date: string;
  timestamp: string;
  openingCash: number;
  closingCash: number;
  sales: {
    total: number;
    storeHubTotal: number;
    refundTotal?: number;
    cash: number;
    tng: number;
    duitnow: number;
    card: number;
    amex?: number;
    deliveryBreakdown?: {
      grab: number;
      panda: number;
      shopee: number;
      lalamove: number;
      grabGross?: number;
      grabNet?: number;
      grabAds?: number;
      pandaGross?: number;
      pandaNet?: number;
      pandaAds?: number;
      shopeeGross?: number;
      shopeeNet?: number;
      shopeeAds?: number;
    };
  };
  expenses: any[]; 
  variance: number;
  varianceReason?: string;
  submittedBy: string;
  isClosed: boolean;
  createdAt?: string;
  dayExpenses?: any[];
  ownerWithdrawal?: number;
  
  // 🟢 加入下面这一行，允许记录核销状态
  reconStatus?: Record<string, boolean>; 
}

export interface RecurringBill {
    id: string;
    name: string;
    amount: number;
    type: RecurringBillType;
    dueDay: number;
    dueMonth?: number;
    category: RecurringBillCategory;
    isActive: boolean;
    lastPaidDate?: string;
    reminderDays: number;
    isArchived: boolean;
    accountNumber?: string;
    payableTo?: string;
    paymentLink?: string;
    contractStart?: string;
    contractEnd?: string;
    depositAmount?: number;
    softLimit?: number;
    hardLimit?: number;
}

export interface BillPaymentRecord {
    id: string;
    billId: string;
    name: string;
    amount: number;
    date: string;
    category: RecurringBillCategory;
    method: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'DUITNOW';
    referenceNo?: string;
    usage?: number;
    usageUnit?: string;
    linkUrl?: string;
}

export interface UomOption {
    label: string;
    value: string;
    ratio: number;
    price?: number;
}

export interface StockItem {
    id: string;
    name: string;
    category: string;
    unit: string;
    maxQty: number;
    minLevel: number;
    currentQty: number;
    cost: number;
    isKeyItem: boolean;
    image?: string;
    uomOptions?: UomOption[];
    weightPerUnit?: number;
    conversionUnit?: string;
}

export interface InventoryLogItem {
    stockId: string;
    stockName: string;
    oldQty: number;
    newQty: number;
    diff: number;
    unit: string;
    cost: number;
    valueChange: number;
}

export interface InventoryLog {
    id: string;
    date: string;
    timestamp: string;
    staffName: string;
    totalValueChange: number;
    items: InventoryLogItem[];
    category: string;
}

export interface InventoryTaskItem {
    stockId: string;
    stockName: string;
    category: string;
    currentQty: number;
    countedQty?: number;
}

export interface InventoryTask {
    id: string;
    createdAt: string;
    creatorId: string;
    creatorName: string;
    assigneeId: string;
    assigneeName: string;
    status: 'PENDING' | 'COMPLETED';
    items: InventoryTaskItem[];
    completedAt?: string;
    checkFrequency?: any;
}

export interface CatalogItem {
    id: string;
    name: string;
    unit: string;
    price: number;
    category: string;
    uomOptions: UomOption[];
    linkedStockId?: string;
    supplierCode?: string;
}

export interface SupplierBank {
    bankName: string;      // 收款银行 (e.g. Public Bank)
    accountName: string;   // 专名 / 户名 (e.g. WENG FATT FOOD INDUSTRY)
    accountNo: string;     // 卡号 / 账号 (e.g. 5123456789)
}

export interface Supplier {
    id: string;
    name: string;
    category: string;
    tags: string[];
    contact: string;
    contactPerson?: string;
    email?: string;
    note?: string;
    paymentTerm: string;
    status: 'ACTIVE' | 'INACTIVE';
    address?: string;
    catalog?: CatalogItem[];
    bankAccount?: string;
    bankAccounts?: SupplierBank[];
    ssmNumber?: string;
    sstNumber?: string;
    deliverySchedule?: string;
    minOrderValue?: number;
    website?: string;
    isFavorite?: boolean; 
    restDayNote?: string; 
}

export interface PurchaseOrderItem {
    stockId: string;
    name: string;
    orderQty: number;
    unit: string;
    ratio: number;
    cost: number;
    supplierCode?: string;
}

export interface PurchaseOrder {
    id: string;
    supplierId: string;
    supplierName: string;
    date: string;
    status: 'ORDERED' | 'RECEIVED' | 'CANCELLED';
    items: PurchaseOrderItem[];
    totalEstimated: number;
    createdBy?: string;
}

export interface MenuIngredient {
    stockId: string;
    stockName: string;
    qty: number;              // 实际用量 (用于成本计算)
    unit: string;             // 实际单位 (跟 stock 一致, kg / g / btl / pkt 等)
    costPerUnit: number;
 
    // 👑 V2 配方增强
    order?: number;           // 顺序号 (1-based, 保存时自动重排)
    spec?: string;            // 食材规格 (如 "大只虾"、"自制猪油")
    time?: number;            // 处理时间 (分钟)
    note?: string;            // 单食材注解
    step?: string;            // 该食材做法步骤
    youtubeUrl?: string;      // 单食材参考视频
 
    // 👑 V2.1 份数双轨 (给厨房看的份量描述, 不影响成本计算)
    // 例: 虾 5只 (实际 50g) → pieceQty=5, pieceUnit='只', qty=50, unit='g'
    pieceQty?: number;        // 份数 (5)
    pieceUnit?: string;       // 份数单位 (只 / 片 / 段 / 粒 / 条 / 瓣 / 朵 / 支 / 根 / 个 / 块 / 包 / 把 / 颗 / 份)
    piecesPerKg?: number;     // 👑 V2.2 自动重量与件数换算: 每 1kg 对应的件数 (如 45 只)
    yieldPercent?: number;    // 👑 V3: 出成率 / 净料率 % (Yield %, e.g. 80% represents 20% prep loss/trimming waste)
}

export interface MenuVariant {
    label: string;
    price: number;
    cost: number;
    recipe?: MenuIngredient[];
    overheadMarginPercent?: number; // 👑 V3: 杂项与调料损耗缓冲率 % (Overhead Margin %, e.g. 5% to account for salt, oil, seasonings & minor waste)

    // 👑 V2 规格层级做法 / 视频
    method?: string;          // 整体做法 (按步骤换行)
    youtubeUrl?: string;      // YouTube 教学视频
    totalTime?: number;       // 总用时 (分钟)
    variantNote?: string;     // 规格备注
}

export interface MenuItem {
    id: string;
    name: string;
    category: string;
    variants: MenuVariant[];
    options: string[];
    image?: string;
}

export interface MenuCategory {
    id: string;
    label: string;
}

export interface QueueTicket {
    id: string;
    number: string;
    sizeCategory: QueueSize;
    pax: number;
    status: QueueStatus;
    createdAt: string;
    calledAt?: string;
    phone?: string;
}

export interface RoleDefinition {
    id: string;
    title: string;
    department: 'MANAGEMENT' | 'FOH' | 'BOH';
    rankCategory: 'MANAGEMENT' | 'MID_LEVEL' | 'ENTRY_LEVEL';
    duties: string[];
    allowedModules: AppModule[];
}

// NEW: Misconduct Data on Log
export interface MisconductRecord {
    employeeId: string;
    employeeName: string;
    type: 'SMALL' | 'MEDIUM' | 'BIG';
    fineAmount?: number;
    actionResult?: string; // e.g., "Triggered Yellow Warning"
}

export interface LogEntry {
    id: string;
    date: string;
    time: string;
    issue: string;
    action: string;
    category: LogCategory;
    priority: LogPriority;
    status: 'PENDING' | 'RESOLVED';
    creatorName: string;
    image?: string;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    misconduct?: MisconductRecord; // NEW FIELD
}

export interface WarrantyRecord {
    id: string;
    productName: string;
    purchaseDate: string;
    expiryDate: string;
    linkUrl?: string;
    notes?: string;
}

export interface ProposalComment {
    id: string;
    author: string;
    text: string;
    date: string;
}

export interface Proposal {
    id: string;
    title: string;
    description: string;
    type: 'EXPANSION' | 'POLICY' | 'MARKETING' | 'MENU';
    budget: number;
    createdBy: string;
    createdAt: string;
    deadline: string;
    status: 'VOTING' | 'APPROVED' | 'REJECTED';
    votes: { approvals: string[], rejections: string[] };
    comments: ProposalComment[];
}

export interface OKRKeyResult {
    label: string;
    target: number;
    current: number;
    unit: string;
}

export interface OKR {
    id: string;
    quarter: string;
    objective: string;
    progress: number;
    status: 'ON_TRACK' | 'AT_RISK' | 'BEHIND';
    keyResults: OKRKeyResult[];
}

export interface MarketingCampaign {
    id: string;
    name: string;
    platform: 'FACEBOOK' | 'TIKTOK' | 'XIAOHONGSHU' | 'OFFLINE';
    status: 'ACTIVE' | 'PLANNED' | 'ENDED';
    budget: number;
    spend: number;
    roi: number;
    startDate: string;
    endDate: string;
}

export interface EventChecklistItem {
    id: string;
    label: string;
    done: boolean;
}

export interface StoreEvent {
    id: string;
    name: string;
    date: string;
    type: 'PROMO' | 'HOLIDAY' | 'TEAM_BUILDING';
    status: 'UPCOMING' | 'COMPLETED';
    checklist?: EventChecklistItem[];
}

// ==========================================
// 任务打卡/SOP完成记录 (按天/岗位聚合，防 Firebase 计费爆炸)
// ==========================================
export interface TaskCompletion {
    id: string;          // 建议格式: "YYYY-MM-DD_ROSTER-ID" 或 "YYYY-MM-DD_DEPARTMENT"
    date: string;        // "YYYY-MM-DD" 用于范围查询
    department?: string; // 归属部门或岗位 (可选)
    tasks: Record<string, {  // Key 为具体任务的 ID
        completedBy: string; // 员工姓名或 ID
        completedAt: string; // ISO 时间戳
        status: 'COMPLETED' | 'SKIPPED' | 'FAILED' | 'PENDING';
        notes?: string;      // 异常备注
        photoUrl?: string;   // SOP 拍照留底 (可选)
    }>;
    updatedAt: string;   // 最后更新时间
}

// 👑 自制凭单 (Self-Issued Voucher / Invoice)
export interface SelfVoucherItem {
    description: string;
    qty: number;
    unitPrice: number;
    amount: number;
    unit?: string; // 选填单位如 "趟", "件", "kg" 等
}

export interface SelfIssuedVoucher {
    id: string;
    voucherType: 'CASH_BILL' | 'PAYMENT_VOUCHER' | 'DELIVERY_RECEIPT' | 'CASH_VOUCHER' | 'PURCHASE_RECEIPT'; // 凭单类型
    companyName: string; // 公司名称
    date: string;        // 日期 YYYY-MM-DD
    voucherNo: string;   // 凭单号 / Invoice No
    payeeName: string;   // 收款人/司机姓名/收款机构
    payeePhone?: string; // 电话(选填)
    payeeType?: 'INDIVIDUAL' | 'AGENT' | 'DRIVER' | 'INFORMAL_VENDOR'; // 收款人身份属性: 个人、未注册Agent、外包司机、零星商家
    isSelfIssued?: boolean; // 是否属于金莲记甲洞代开发票 (Self-Issued/Recipient-Created Bill)
    items: SelfVoucherItem[]; // 特殊明细内容
    totalAmount: number; // 金额总值
    preparedBy: string;  // 制单人 (如 "老板", "Jaz")
    approvedBy: string;  // 审核/批准人
    notes?: string;      // 额外说明/备注
    templateStyle: 'VINTAGE_GOLD' | 'MODERN_DARK' | 'TRADITIONAL_CARBON' | 'EMERALD_CLEAN' | 'CASH_BILL_GREEN'; // 开单模具风格
    paymentMethod?: 'CASH' | 'ONLINE_TRANSFER'; // 支付方式: 现金/网上转账
    createdAt: string;   // 审计时间戳
}
