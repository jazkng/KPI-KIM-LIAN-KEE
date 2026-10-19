import type { PicArea } from './constants/hrSkill';

// Determines which dashboard experience opens after login. This is not an organization level.
export enum PortalRole {
  BOSS = 'BOSS',
  MANAGEMENT = 'MANAGEMENT',
  STAFF = 'STAFF'
}

export type AppLanguage = 'zh_en' | 'en' | 'my';

export const normalizeLanguage = (
  language?: string | null
): AppLanguage => {
  if (language === 'en') return 'en';
  if (language === 'my') return 'my';

  // 兼容旧版的 zh 和 zh_en
  if (language === 'zh' || language === 'zh_en') {
    return 'zh_en';
  }

  return 'zh_en';
};

// Compatibility alias while App.tsx and Login.tsx are migrated one file at a time.
export { PortalRole as UserRole };

export type StaffRole = string;

// Legacy organization rank retained for existing Firestore records and current modules.
export type EmployeeRank = 'TOP' | 'MANAGEMENT' | 'HEAD' | 'PIC' | 'CREW';

// New single source of truth for the five-level organization model.
export type OrgLevel =
  | 'OWNER'
  | 'BRANCH_MANAGER'
  /**
   * 幕僚 / 旁支单位（会计、顾问这类）。
   * 层级上跟门店管理平行，但「不直接管理门店」——
   * 组织图会画在主干旁边、用虚线连接，底下不接部门。
   */
  | 'STAFF_SUPPORT'
  | 'DEPARTMENT_HEAD'
  | 'TEAM_LEAD'
  | 'CREW';

// System access is independent from organization level.
export type SystemRole = 'STANDARD_USER' | 'SYSTEM_ADMIN';

// Inventory access is intentionally separate from PortalRole and allowedModules.
// PortalRole chooses the dashboard, allowedModules chooses the module, and this
// structure controls what a person may do inside inventory.
export type InventoryScope = 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL';

export type InventoryPermission =
  | 'VIEW_STOCK'
  | 'EXECUTE_STOCKTAKE'
  | 'ADD_ITEM'
  | 'EDIT_BASIC_INFO'
  | 'EDIT_MIN_LEVEL'
  | 'EDIT_COUNT_UNIT_CONVERSION'
  | 'EDIT_PURCHASE_UNIT_CONVERSION'
  | 'EDIT_BASE_UNIT'
  | 'EDIT_COST'
  | 'DEACTIVATE_ITEM';

export interface InventoryAccessConfig {
    version?: 1;
    scopes: InventoryScope[];
    permissions: Partial<Record<InventoryPermission, boolean>>;
}

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
    /** LINDUNG 24 Jam (SKBBK) —— 员工全额承担，雇主 0 */
    ee_lindung?: number;
    hasLindung?: boolean;
    ee_pcb?: number;
    /** 本月从薪水扣回的欠款 */
    loanRepay?: number;
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
    // ── V2：FACE3000 审核导入（全部选填，V1 不读也不影响）──
    /** 主管已豁免当天迟到：薪资不按这笔记录扣迟到款 */
    lateExcused?: boolean;
    /** 主管批准的加班分钟数（没批准就没有这个栏位） */
    approvedOtMinutes?: number;
    /** 哪一次导入写入的 */
    importBatchId?: string;
    reviewedBy?: string;
    reviewedAt?: string;
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

// ELECTRICITY_STAFF / WATER_STAFF = 员工宿舍的独立电表/水表账单，
// 跟店面分开记，传统账目的「UTINITY CHARGES STAFF」才有数。
export type RecurringBillCategory = 'RENT' | 'RENT_STAFF' | 'ELECTRICITY' | 'WATER' | 'ELECTRICITY_STAFF' | 'WATER_STAFF' | 'INTERNET' | 'WASTE' | 'LICENSE' | 'SUBSCRIPTION' | 'OTHER';
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

/** ⭐ 工作能力星级：一个工作项目的评分（定义见 constants/skillCatalog.ts） */
export interface SkillRating {
    level: 1 | 2 | 3 | 4 | 5;
    /** YYYY-MM-DD */
    ratedAt: string;
    ratedBy?: string;
}

/** ⭐ 改分记录（看进步趋势 / 查谁改的） */
export interface SkillRatingLog {
    itemId: string;
    /** 改之前（没有 = 第一次评） */
    from?: number;
    /** 改之后（没有 = 清除） */
    to?: number;
    /** ISO 时间 */
    at: string;
    by?: string;
}

export interface Employee {
    id: string;
    name: string;
    role: string;
    department?: 'KITCHEN' | 'FLOOR' | 'BAR' | 'DISHWASH' | 'BACK_OFFICE' | 'OTHER' | 'OWNER';
    secondaryRoles?: string[]; // <--- 新增：用于存储多项副职
    pin?: string;
    status: 'CONFIRMED' | 'PROBATION' | 'TERMINATED';
    orgLevel?: OrgLevel;
    systemRole?: SystemRole;
    /** Optional exception set by SYSTEM_ADMIN; otherwise portal follows orgLevel automatically. */
    portalRoleOverride?: PortalRole;
    /** Legacy compatibility only. New code should read orgLevel. */
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
    /** 只读模式：可查看已授权模块，但不能新增／修改／删除（前端层防护） */
    readOnlyAccess?: boolean;
    /** Direct inventory switches configured by the owner/system administrator. */
    inventoryAccess?: InventoryAccessConfig;
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
    /** 🎓 技能等级 1-4（学习/辅助/独立/熟练）—— 定义见 constants/hrSkill.ts */
    skillLevel?: 1 | 2 | 3 | 4;
    /** 技能等级最后评定日期 YYYY-MM-DD */
    skillLevelDate?: string;
    /** 🧹 PIC：这个人本身负责什么 + 每项评分 */
    picAreas?: PicArea[];
    /** ⭐ 工作能力星级：工作项目 id → 评分 */
    skillRatings?: Record<string, SkillRating>;
    /** ⭐ 改分记录（最新在前，最多留 300 笔） */
    skillRatingLog?: SkillRatingLog[];
    workPermitNo?: string;
    workPermitExpiry?: string;
    eisNo?: string;
    probationEndDate?: string;
    contractEndDate?: string;
    attributes?: EmployeeAttributes;
    assessmentHistory?: AssessmentRecord[]; 
    assessmentYearlyLimit?: number; 
    assessmentTargets?: string[]; 
    preferredLanguage?: AppLanguage; // 🟢 Myanmar & English language support
    
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
    isPayrollEligible?: boolean; // 新增：是否参与薪资结算 (接收薪资)
    shiftGroup?: number; // 新增：班次人群 (1 = 班次1, 2 = 班次2)
    /** 考勤机（FACE3000-U）上的员工编号；没设定时以员工 ID 比对（V2 新增，选填） */
    attendanceDeviceNo?: string;

    // 🏢 组织架构图（只影响组织图显示，不影响权限 orgLevel、薪资 / 报表用的 department）
    /** BOD / MANAGEMENT / STAFF；没设定 = 按 orgLevel 自动判断（见 utils/orgChartModel.ts） */
    orgChartTier?: 'BOD' | 'MANAGEMENT' | 'STAFF';
    /** 组织图上显示的职位名称，例如「Head Chef」「Accounting」；没设定 = 用 role */
    orgPosition?: string;
    /** 负责单位（管理层用）：HR、Accounting、Marketing…；厨房 / 楼面等营运部门直接用 department */
    orgUnit?: string;
    /** 管理层负责的营运部门（可以多个，例如 Kelvin = 楼面 + 水吧 + 洗碗）；没设定 = 自己的 department */
    orgManagesDepts?: string[];
    /** 直属上司（员工 id）；没设定 = 自动接到同部门的管理层 */
    reportsTo?: string;
    /** 第二身份，例如「Personal Assistant」 */
    orgSecondaryRole?: string;
    /** 第二身份汇报对象（员工 id），例如 Ben —— 组织图用虚线表示，不影响正式汇报线 */
    orgSecondaryReportsTo?: string;
    loanRecords?: LoanRecord[];
    terminationType?: 'RESIGNED' | 'FIRED' | 'CONTRACT_END' | 'ABSCONDED';
    noticeDate?: string;
    settlementStatus?: 'PENDING' | 'SETTLED';
    hasKitchenAlertPermission?: boolean; // 🟢 是否有通知厨房功能权限
    /** 💳 薪资默认付款方式 —— 薪资结算会自动带入，不用每个月重新按 */
    payrollPaymentMethod?: 'BANK' | 'CASH';
    /** 🛡️ 本地员工已向 PERKESO 申请退出 LINDUNG 24 Jam（外劳强制参加，此栏无效） */
    lindungOptOut?: boolean;
}

export interface StoreConfig {
    businessDayCutoff: number;
    timeZoneOffset: number;
    googleScriptUrl?: string;
    cloudinaryCloudName?: string;
    cloudinaryUploadPreset?: string;
    logoUrl?: string;
    headerLogoUrl?: string;
    appIconUrl?: string;
    receiptLogoUrl?: string;
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

/** 兼职账目的一次更正：谁、什么时候、为什么，改之前 / 之后 */
export interface PartTimeRevision {
    at: string;
    actorId: string;
    actorName: string;
    reason: string;
    before: { amount: number; totalBillAmount?: number; time?: string; paymentDate?: string; note?: string; partTime?: any };
    after: { amount: number; totalBillAmount?: number; time?: string; paymentDate?: string; note?: string; partTime?: any };
}

export interface ExpenseItem {
    id: string;
    category: string;
    expenseType: 'CASH_OUT' | 'GENERAL' | 'RECURRING' | 'SALARY';
    company: string;
    amount: number;
    paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL';
    /** 应付账款冻结（V2）：疑似错误、暂不处理；冻结的账单不计入任何财务计算。只新增可选字段，V1 会忽略 */
    frozen?: boolean;
    frozenAt?: string;
    frozenBy?: string;
    frozenReason?: string;
    frozenHistory?: { action: 'FREEZE' | 'UNFREEZE'; at: string; by: string; reason?: string }[];
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
    /**
     * 👑 成本科目拆分 V1
     * 用途：供应商同时卖多类产品时（菜+水果、肉+蛋），把一张账单拆到多个会计科目，
     *      让财务报告的成本细分变准。
     *
     * ⚠️ 拆分「不改变任何金额」—— amount、totalBillAmount、付款记录、凭单、金库全部不受影响，
     *    它只是给报表看的标签。所以已付的旧账也能安全回头补拆分。
     *
     * 规则：splits 金额加总必须等于 totalBillAmount，保存时强制校验。
     *      报表入账时若实际金额与总额不同（部分付款、扣了 credit note），
     *      会按 splits 比例分摊，不会算错总数。
     */
    categorySplits?: CategorySplit[];
    /**
     * ⏱️ 兼职日薪登记（薪资结算 →「兼职」分页写入，id 以 parttime_ 开头）
     * 金额 amount = hours × rate + extra；这里只是留底给报表/导出用
     */
    partTime?: {
        employeeId?: string;
        hours: number;
        rate: number;
        extra?: number;
        extraNote?: string;
        clockIn?: string;
        clockOut?: string;
    };
    /** 兼职账目更正记录（PartTimeCorrection 写入；最新在最后） */
    partTimeRevisions?: PartTimeRevision[];
    /** 👥 预支 / 兼职：对应的员工 id（旧资料没有，靠 company = 名字对应） */
    employeeId?: string;
    /** 👥 谁登记的（主管「兼职与预支」页面写入，打印单据时预填主管签名栏） */
    recordedBy?: { id: string; name: string };
}

/** 成本科目拆分的一行 */
export interface CategorySplit {
    /** 会计科目 key，对应 apConstants 的 ACCOUNTING_CATEGORIES id */
    category: string;
    /** 该科目分到的金额 */
    amount: number;
    /** 选填备注，例如「猪肉 12kg」 */
    note?: string;
    /**
     * true = 这是「主科目」那一行，金额由系统自动算（总额 − 其他科目合计）。
     * 使用者只填例外的科目，主科目吃剩下的余额。
     */
    isMain?: boolean;
}

/** 每日结算的天气状况 */
export type WeatherCondition = 'SUNNY' | 'CLOUDY' | 'RAIN' | 'HEAVY_RAIN';

export const WEATHER_OPTIONS: Array<{ value: WeatherCondition; label: string; en: string }> = [
  { value: 'SUNNY',      label: '晴',   en: 'Sunny' },
  { value: 'CLOUDY',     label: '阴',   en: 'Cloudy' },
  { value: 'RAIN',       label: '雨',   en: 'Rain' },
  { value: 'HEAVY_RAIN', label: '大雨', en: 'Heavy Rain' },
];

/** 每日结算的特殊情况（可多选，和天气分开存：天气照常选晴/阴/雨，烟霾等另外勾） */
export type SpecialCondition = 'HAZE' | 'HEATWAVE' | 'FLOOD' | 'POWER_CUT' | 'ROAD_CLOSURE';

export const SPECIAL_CONDITION_OPTIONS: Array<{ value: SpecialCondition; label: string; en: string; emoji: string }> = [
  { value: 'HAZE',         label: '烟霾',     en: 'Haze',         emoji: '🌫️' },
  { value: 'HEATWAVE',     label: '酷热',     en: 'Heatwave',     emoji: '🥵' },
  { value: 'FLOOD',        label: '水灾/淹水', en: 'Flood',        emoji: '🌊' },
  { value: 'POWER_CUT',    label: '停电/停水', en: 'Power/Water Cut', emoji: '🔌' },
  { value: 'ROAD_CLOSURE', label: '封路/活动', en: 'Road Closure / Event', emoji: '🚧' },
];

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
      /** 各平台单数（选填，旧记录没有） */
      grabOrders?: number;
      pandaOrders?: number;
      shopeeOrders?: number;
      lalamoveOrders?: number;
    };
  };
  expenses: any[]; 
  variance: number;
  varianceReason?: string;
  /** 当日天气状况（可选） */
  weather?: WeatherCondition;
  /** 当日特殊情况（烟霾、停电…，可多选，选填） */
  specialConditions?: SpecialCondition[];
  submittedBy: string;
  isClosed: boolean;
  createdAt?: string;
  dayExpenses?: any[];
  ownerWithdrawal?: number;
  
  // 🟢 加入下面这一行，允许记录核销状态
  reconStatus?: Record<string, boolean>; 
    /** 总单数（每日营业报告可手动填） */
    orderCount?: number;
    /** 每日营运数据：人数 / 单数 / VIP / WhatsApp（读取请用 settlementOps.getOps） */
    ops?: { pax?: number; bills?: number; vipNew?: number; vipVisits?: number; waJoin?: number; waOrders?: number };
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
    /** 仪表读数：上次 / 本次（水电类账单才有，编辑时用来回填） */
    meterPrev?: number;
    meterCurr?: number;
    /**
     * 他人分摊（代收代付）：整张账单我先全额付给 TNB，
     * 其中一部分是其他商家分摊的，之后收回来。
     * 财务报告的成本 = amount − 分摊合计；amount 本身保持全额（现金流对得上）。
     */
    costShares?: BillCostShare[];
    linkUrl?: string;
}

/** 账单的他人分摊明细（代收代付） */
export interface BillCostShare {
    id: string;
    /** 分摊方，例如「隔壁 A 商家」 */
    payer: string;
    amount: number;
    /** 钱收回来了没 */
    received?: boolean;
    receivedDate?: string;
}

export interface UomOption {
    label: string;
    value: string;
    ratio: number;
    price?: number;
}

export interface UnitConversionRule {
    id: string;
    unitName: string;
    unitType: 'PURCHASE' | 'STORAGE' | 'RECIPE';
    toBaseRatio: number;
    pricePerUnit?: number;
    isDefaultPurchase?: boolean;
    toDisplayRatio?: number;
    conversionMode?: 'FIXED' | 'ACTUAL_WEIGHT';
}

export interface StockItem {
    id: string;
    name: string;
    /** 使用说明（选填，例如稀释比例、用法）；没有就空白。V2 新增，V1 会忽略 */
    description?: string;
    category: string;
    unit: string; // Legacy field
    maxQty: number; // Legacy field
    minLevel: number; // Legacy field
    currentQty: number; // Legacy field
    cost: number; // Legacy field
    isKeyItem: boolean;
    image?: string;
    uomOptions?: UomOption[]; // Legacy support
    weightPerUnit?: number; // Legacy support
    conversionUnit?: string; // Legacy support
    
    // New unified ERP inventory fields
    baseUnit?: string;
    currentQtyBase?: number;
    minLevelBase?: number;
    maxQtyBase?: number;
    costPerBaseUnit?: number;
    purchaseUnits?: UnitConversionRule[];
    defaultPurchaseUnitId?: string;
    yieldPercent?: number;
    overheadPercent?: number;
    sstPercent?: number;
    
    // Display/ordering unit fields for 3-layer system
    displayUnit?: string;
    displayToBaseRatio?: number;
    preferredStockViewUnit?: 'BASE' | 'DISPLAY';

    // Conversion Modes (FIXED vs ACTUAL_WEIGHT)
    conversionMode?: 'FIXED' | 'ACTUAL_WEIGHT';
    inventoryUnit?: string;
    purchaseUnit?: string;
    pricingUnit?: string;
    pricePerPricingUnit?: number;
    requiresActualWeightOnReceive?: boolean;
    currentWeightQty?: number;
    weightUnit?: string;

    // 库存编号（2026-10-17，全部可选；V1 不认得也不影响）。id 永远不改，stockCode 是给人看的编号。
    stockCode?: string;              // 例如 K0001（K 厨房 / B 吧台 / G 杂项 / F 燃料）
    stockCodeAssignedAt?: string;
    stockCodeAssignedBy?: string;
    stockCodeSource?: 'MIGRATION' | 'AUTO' | 'MANUAL';
    stockCodeRunId?: string;         // 由哪一次重新编号写入（回滚用）
    legacyCodes?: string[];          // 以前显示过的旧编号，隐藏保存，搜寻仍然找得到
    nameHistory?: { name: string; changedAt: string; changedBy: string; runId?: string }[];

    /** 常用供应商与包装（2026-10-18，可选）：补货默认用这家；没设时用每基础单位最便宜的 */
    preferredSupply?: { supplierId: string; catalogItemId: string; setAt?: string; setBy?: string };
}

/** stock_codes/{code}：编号登记表，一个编号只属于一个商品，发出后不再重复使用 */
export interface StockCodeRecord {
    code: string;
    stockId: string;
    area: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL';
    status: 'ACTIVE' | 'RETIRED';
    assignedAt: string;
    assignedBy: string;
    source: 'MIGRATION' | 'AUTO' | 'MANUAL';
    runId?: string;
}

/** stock_code_counters/{K|B|G|F}：下一个要发的号码 */
export interface StockCodeCounter {
    prefix: string;
    nextSeq: number;
    updatedAt: string;
}

/** stock_code_migration_runs/{runId}：每次重新编号的执行记录 */
export interface StockCodeMigrationRun {
    id: string;
    startedAt: string;
    finishedAt?: string;
    by: string;
    planHash: string;
    total: number;
    done: number;
    skipped: number;
    failed: number;
    renamed: number;
    status: 'RUNNING' | 'DONE' | 'PARTIAL' | 'ROLLED_BACK';
    countersBefore: Record<string, number | null>;
    countersAfter: Record<string, number>;
    backupSummary?: { collection: string; count: number; sha256: string }[];
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
    /** 收货记录才有：这次的进货单价（每基础单位）。cost 一律是平均成本，与盘点记录同口径 */
    purchaseUnitCost?: number;
}

export interface InventoryLog {
    id: string;
    date: string;
    timestamp: string;
    staffName: string;
    totalValueChange: number;
    items: InventoryLogItem[];
    category: string;
    // 收货记录（2026-10-18 起，可选；以前只有盘点会写库存记录）
    source?: 'STOCKTAKE' | 'RECEIVE';
    poId?: string;
    supplierName?: string;
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

    // Prompt 3 additions
    linkedPurchaseUnitId?: string;
    purchaseUnitName?: string;
    toBaseRatio?: number;
    baseUnit?: string;
    displayUnit?: string;
    displayToBaseRatio?: number;
    pricePerPurchaseUnit?: number;
    costPerBaseUnit?: number;

    pricingMode?: 'FIXED_UNIT' | 'WEIGHT_BASED';
    orderUnit?: string;
    billingUnit?: string;
    pricePerBillingUnit?: number;
    estimatedWeightPerUnit?: number;

    conversionMode?: 'FIXED' | 'ACTUAL_WEIGHT';
    purchaseUnit?: string;
    pricingUnit?: string;
    pricePerPricingUnit?: number;

    // 供应商目录强化（2026-10-18，全部可选；V1 不认得也照常运作）
    packDesc?: string;            // 包装说明，例如「24 瓶 × 320ml」
    brand?: string;
    spec?: string;                // 规格
    storage?: 'FROZEN' | 'CHILLED' | 'AMBIENT';
    minOrderQty?: number;         // 最少订购量（以这个品项的包装计）
    leadTimeDays?: number;        // 下单到货天数
    status?: 'ACTIVE' | 'DISCONTINUED';
    note?: string;
    priceUpdatedAt?: string;      // 目录价格最后修改
    lastReceivedPrice?: number;   // 最近一次实际收货：每包装价格
    lastReceivedPricePerBase?: number;
    lastReceivedAt?: string;
    lastReceivedPoId?: string;
    weightHistory?: WeightReceipt[]; // 称重品项：最近 10 次收货的箱数与实际重量（新的在前）
}

export interface WeightReceipt {
    at: string;
    poId: string;
    packs: number;   // 收到几个下单单位（例如 1 CTN）
    weight: number;  // 实际重量（计价单位，例如 19.38 kg）
}

export interface SupplierBank {
    bankName: string;      // 收款银行 (e.g. Public Bank)
    accountName: string;   // 专名 / 户名 (e.g. WENG FATT FOOD INDUSTRY)
    accountNo: string;     // 卡号 / 账号 (e.g. 5123456789)
}

export interface Supplier {
    id: string;
    name: string;
    /** 主统驭科目（单选，沿用原本逻辑） */
    category: string;
    /**
     * 👑 常用科目（多选）V1
     * 这个供应商平常会卖到的其他科目。例如 EK Fresh 同时卖蔬菜和水果。
     * ⚠️ 纯粹是「开单时的便利提示」—— 不影响任何金额与记账逻辑，
     *    只让应付账款拆分科目的下拉把这几个排在最上面，不用在长列表里找。
     */
    secondaryCategories?: string[];
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
    purchaseUnitId?: string;
    purchaseUnitName?: string;
    toBaseRatio?: number;
    receivedBaseQty?: number;
    costPerBaseUnitAtReceive?: number;

    pricingMode?: 'FIXED_UNIT' | 'WEIGHT_BASED';
    orderUnit?: string;
    billingUnit?: string;
    billingUnitPrice?: number;
    estimatedWeightPerUnit?: number;
    estimatedBaseQty?: number;
    receivedQty?: number;
    receivedWeight?: number;
    finalUnitPrice?: number;
    finalLineTotal?: number;

    purchaseUnitQty?: number;
    purchaseUnitCost?: number;
    purchaseUnitToBaseRatio?: number;
    baseUnit?: string;
    baseQty?: number;
    costPerBaseUnitAtOrder?: number;
    totalCost?: number;

    conversionMode?: 'FIXED' | 'ACTUAL_WEIGHT';
    pricingUnit?: string;
    pricePerPricingUnit?: number;
    estimatedWeight?: number | null;
    estimatedTotal?: number | null;
    actualWeight?: number | null;
    finalCost?: number | null;
    status?: string;
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
    /** Final figures captured when management confirms the delivery. */
    totalReceived?: number;
    receivedTax?: number;
    receivedDelivery?: number;
    receivedAt?: string;
    receivedBy?: string;
    cancelledAt?: string;
    cancelledBy?: string;
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

// ==========================================
// 厨房急单协同台 (Kitchen Alert)
// ==========================================

/** 楼面通知厨房的事项类型。 */
export type KitchenAlertType =
    | 'RUSH'       // 催菜 / 加急
    | 'MISSING'    // 漏单
    | 'WRONG'      // 做错
    | 'REMAKE'     // 重做
    | 'NOTICE';    // 特别注意

/** NOTICE 为一般注意，URGENT 为需要厨房优先处理。 */
export type KitchenAlertPriority = 'NOTICE' | 'URGENT';

/**
 * NEW          楼面刚提交，厨房尚未接收
 * ACKNOWLEDGED 厨房已经看到并开始处理
 * RESOLVED     厨房已完成处理
 * CANCELLED    楼面或授权人员取消
 */
export type KitchenAlertStatus =
    | 'NEW'
    | 'ACKNOWLEDGED'
    | 'RESOLVED'
    | 'CANCELLED';

/** 执行厨房通知动作的员工资料快照，避免员工日后改名影响历史记录。 */
export interface KitchenAlertActor {
    id: string;
    name: string;
}

/**
 * Firestore 路径: kitchen_alerts/{id}
 * 一道菜对应一条记录，厨房可逐道接收和解决。
 */
export interface KitchenAlert {
    id: string;
    schemaVersion: 1;
    storeId: string;
    businessDate: string; // Malaysia 营业日 YYYY-MM-DD；凌晨 4 点前归前一天

    tableNo: string;
    orderNo: string;
    dishId?: string;
    dishName: string;
    size?: string;
    quantity: number;
    note?: string;

    alertType: KitchenAlertType;
    priority: KitchenAlertPriority;
    status: KitchenAlertStatus;
    /** 供厨房大屏只监听未完成记录，避免历史越来越多时增加读取量。 */
    isActive: boolean;

    createdById: string;
    createdByName: string;
    createdAt: string;
    updatedAt: string;

    acknowledgedById?: string;
    acknowledgedByName?: string;
    acknowledgedAt?: string;

    resolvedById?: string;
    resolvedByName?: string;
    resolvedAt?: string;
    resolutionNote?: string;

    cancelledById?: string;
    cancelledByName?: string;
    cancelledAt?: string;
    cancelReason?: string;
}

/** 楼面提交新厨房通知时需要的字段。 */
export interface CreateKitchenAlertInput {
    storeId: string;
    tableNo: string;
    orderNo?: string;
    dishId?: string;
    dishName: string;
    size?: string;
    quantity: number;
    note?: string;
    alertType: KitchenAlertType;
    priority: KitchenAlertPriority;
    createdBy: KitchenAlertActor;
    businessDate?: string;
}

/** 厨房历史记录查询条件。 */
export interface KitchenAlertHistoryFilter {
    storeId: string;
    businessDate: string;
    status?: KitchenAlertStatus;
    createdById?: string;
    tableNo?: string;
    orderNo?: string;
    maxRecords?: number;
}

// ==========================================
// 现场设备户口 (Device Account)
// ==========================================

/** 设备可进入的专用画面。设备户口不会继承员工权限。 */
export type DeviceScreen =
    | 'KITCHEN_ALERT'
    | 'QUEUE_DISPLAY';

export type DeviceAccountStatus = 'ACTIVE' | 'DISABLED';

/** 创建或修改设备的管理人员快照。 */
export interface DeviceAccountActor {
    id: string;
    name: string;
}

/**
 * Firestore 路径: device_accounts/{deviceId}
 * 此资料与 Employee 完全分开，不参与考勤、排班、工资、KPI 或人数统计。
 * PIN 摘要属于服务内部字段，不会出现在此公开类型中。
 */
export interface DeviceAccount {
    id: string;
    schemaVersion: 1;
    deviceCode: string;
    deviceName: string;
    storeId: string;
    status: DeviceAccountStatus;

    allowedScreens: DeviceScreen[];
    defaultScreen: DeviceScreen;
    location?: string;
    notes?: string;

    /** 每次停用、换 PIN 或撤销会话都会增加，用于让旧设备会话失效。 */
    sessionVersion: number;
    lastLoginAt?: string;
    lastSeenAt?: string;
    currentScreen?: DeviceScreen;

    createdById: string;
    createdByName: string;
    createdAt: string;
    updatedById: string;
    updatedByName: string;
    updatedAt: string;
}

export interface CreateDeviceAccountInput {
    deviceCode: string;
    deviceName: string;
    storeId: string;
    pin: string;
    allowedScreens: DeviceScreen[];
    defaultScreen: DeviceScreen;
    location?: string;
    notes?: string;
    createdBy: DeviceAccountActor;
}

export interface UpdateDeviceAccountInput {
    deviceName?: string;
    storeId?: string;
    allowedScreens?: DeviceScreen[];
    defaultScreen?: DeviceScreen;
    location?: string;
    notes?: string;
    status?: DeviceAccountStatus;
}

/** 设备 PIN 验证成功后保存在该设备浏览器的最小会话资料。 */
export interface DeviceSession {
    schemaVersion: 1;
    deviceId: string;
    deviceCode: string;
    deviceName: string;
    storeId: string;
    allowedScreens: DeviceScreen[];
    defaultScreen: DeviceScreen;
    sessionVersion: number;
    sessionToken: string;
    loginAt: string;
}

export interface RoleDefinition {
    id: string;
    title: string;
    department: 'MANAGEMENT' | 'FOH' | 'BOH';
    orgLevel?: OrgLevel;
    /** Legacy role grouping retained until constants/staff.ts is migrated. */
    rankCategory?: 'MANAGEMENT' | 'MID_LEVEL' | 'ENTRY_LEVEL';
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

export type LogStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

export interface OperationalLogReply {
    id: string;
    authorId: string;
    authorName: string;
    authorOrgLevel?: OrgLevel;
    authorDepartment?: Employee['department'];
    content: string;
    createdAt: string;
    editedAt?: string;
    legacy?: boolean;
}

export interface OperationalLogReadReceipt {
    employeeId: string;
    employeeName: string;
    readAt: string;
    legacy?: boolean;
}

export interface LogEntry {
    id: string;
    date: string;
    time: string;
    issue: string;
    action: string;
    category: LogCategory;
    priority: LogPriority;
    status: LogStatus;
    creatorId?: string;
    creatorName: string;
    creatorDepartment?: Employee['department'];
    image?: string;
    replies?: OperationalLogReply[];
    readReceipts?: OperationalLogReadReceipt[];
    assignedEmployeeId?: string;
    assignedEmployeeName?: string;
    assignedDepartment?: Employee['department'];
    updatedAt?: string;
    resolvedById?: string;
    resolvedByName?: string;
    resolvedAt?: string;
    /** Legacy single-reader fields kept for old Firestore records. */
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    misconduct?: MisconductRecord; // NEW FIELD
}

export type NotificationEventType =
    | 'LOGBOOK_NEW'
    | 'LOGBOOK_REPLY'
    | 'LOGBOOK_ASSIGNED'
    | 'LOGBOOK_STATUS';

export interface LocalizedNotificationText {
    zh_en: string;
    en: string;
    my: string;
}

export interface SystemNotification {
    id: string;
    recipientEmployeeId: string;
    recipientName: string;
    eventType: NotificationEventType;
    module: 'LOGBOOK';
    entityId: string;
    title: LocalizedNotificationText;
    message: LocalizedNotificationText;
    actorId: string;
    actorName: string;
    priority: LogPriority;
    createdAt: string;
    readAt?: string;
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

// 👑 自开凭单 (Self-Issued Voucher / Invoice)
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
