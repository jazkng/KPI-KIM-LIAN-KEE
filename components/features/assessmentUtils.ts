import { 
    Employee, 
    EmployeeRank, 
    QuarterKey, 
    AssessmentRecordV2, 
    MetricScoreV2,
    EmployeeAssessmentSummary 
} from '../../types';
import { 
    JobCategory, 
    JOB_METRICS, 
    GRADE_TIERS, 
    GradeTier,
    classifyJob,
    JOB_CATEGORY_SORT,
    DEPARTMENT_SORT
} from './assessmentConfig';

// 💡 提取统一的等级标签类型
export type GradeLabel = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

// ============================================================================
// 1. 季度计算 (Quarter Math)
// ============================================================================

/** 根据日期计算属于哪个季度 (用于:今天在哪个评分期) */
export const getQuarterFromDate = (date: Date): QuarterKey => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    
    // 评分期规则：
    // 1月1-15日   → 评上一年 Q4
    // 4月1-15日   → 评今年 Q1
    // 7月1-15日   → 评今年 Q2
    // 10月1-15日  → 评今年 Q3
    
    // 找出"当前正在评的"季度
    if (month === 1) return `${year - 1}-Q4` as QuarterKey;
    if (month >= 4 && month <= 6) return `${year}-Q1` as QuarterKey;   // Q1 评分期是4月，但若落在5-6月算"已错过"
    if (month >= 7 && month <= 9) return `${year}-Q2` as QuarterKey;
    if (month >= 10 && month <= 12) return `${year}-Q3` as QuarterKey;
    return `${year}-Q1` as QuarterKey; // 2-3月过渡期，算 Q1
};

/** 判断某个日期是否在季度评分窗口期内 (评分期:每季首月 1-15 日) */
export const isInAssessmentWindow = (date: Date = new Date()): boolean => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const isQuarterStartMonth = [1, 4, 7, 10].includes(month);
    return isQuarterStartMonth && day >= 1 && day <= 15;
};

/** 获取评分窗口的剩余天数 (不在窗口期返回 0) */
export const getWindowRemainingDays = (date: Date = new Date()): number => {
    if (!isInAssessmentWindow(date)) return 0;
    return 15 - date.getDate();
};

/** 获取下一个评分窗口的开始日期 */
export const getNextWindowStart = (date: Date = new Date()): Date => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    if (month < 4) return new Date(year, 3, 1);        // 下一个是 4月 (Q1)
    if (month < 7) return new Date(year, 6, 1);        // 下一个是 7月 (Q2)
    if (month < 10) return new Date(year, 9, 1);       // 下一个是 10月 (Q3)
    return new Date(year + 1, 0, 1);                   // 下一个是明年 1月 (Q4)
};

/** 季度 key 转中文显示 */
export const formatQuarter = (quarter: QuarterKey): string => {
    const [year, q] = quarter.split('-');
    return `${year} 年 ${q}`;
};

/** 获取上一个季度 */
export const getPreviousQuarter = (quarter: QuarterKey): QuarterKey => {
    const [yearStr, qStr] = quarter.split('-');
    const year = parseInt(yearStr);
    const q = parseInt(qStr.replace('Q', ''));
    
    if (q === 1) return `${year - 1}-Q4` as QuarterKey;
    return `${year}-Q${q - 1}` as QuarterKey;
};

/** 季度 key 对应的月份范围描述 */
export const getQuarterMonthRange = (quarter: QuarterKey): string => {
    const q = quarter.split('-')[1];
    const ranges: Record<string, string> = {
        'Q1': '1-3 月',
        'Q2': '4-6 月',
        'Q3': '7-9 月',
        'Q4': '10-12 月'
    };
    return ranges[q] || '';
};

// ============================================================================
// 2. Grade / Score 转换
// ============================================================================

/** 从任意分数 → Grade (用于 UI 显示) */
export const getGradeFromScore = (score: number): GradeTier => {
    // 💡 适配：最高到 S 档，不启用 SS / SSS
    if (score >= 81) return GRADE_TIERS[2];   // S: 81 - 100+
    if (score >= 61) return GRADE_TIERS[3];   // A: 61 - 80
    if (score >= 41) return GRADE_TIERS[4];   // B: 41 - 60
    if (score >= 21) return GRADE_TIERS[5];   // C: 21 - 40
    return GRADE_TIERS[6];                    // D: 0 - 20
};

/** 从 Grade label → Tier 定义 */
export const getTierByLabel = (label: GradeLabel): GradeTier => {
    return GRADE_TIERS.find(t => t.label === label) || GRADE_TIERS[6];
};

/** 从 Grade label → 分数 */
export const gradeToScore = (label: GradeLabel): number => {
    return getTierByLabel(label).score;
};

// ============================================================================
// 3. 评分权限判定与三大等级定义
// ============================================================================

export type AssessPermission = 
    | 'NONE'              // 无权评
    | 'INITIAL'           // 可做初评
    | 'OVERRIDE'          // 可覆盖任何人 (TOP 专用)
    | 'VIEW_OWN';         // 只能看自己的评分 (普通员工)

/** 获取员工评测等级：
 * 第一等级是老板 (1)
 * 第二等级是管理层 (2)
 * 第三等级是员工 (3)
 */
export const getEmployeeLevel = (emp: Employee): 1 | 2 | 3 => {
    const rank = emp.rank || 'CREW';
    if (rank === 'TOP' || (emp.role || '').includes('Owner') || (emp.role || '').includes('老板')) {
        return 1;
    }
    if (['MANAGEMENT', 'HEAD', 'PIC'].includes(rank) || (emp.role || '').includes('经理') || (emp.role || '').includes('主管')) {
        return 2;
    }
    return 3;
};

/** 判断 rater 对 target 的评分权限 */
export const getAssessPermission = (rater: Employee, target: Employee): AssessPermission => {
    // 自己不能评自己
    if (rater.id === target.id) return 'VIEW_OWN';
    
    // 目标员工被豁免 (Part-time)
    if (target.assessmentExempt) return 'NONE';
    
    const raterLevel = getEmployeeLevel(rater);
    const targetLevel = getEmployeeLevel(target);
    
    // ========================================================================
    // 第一等级：老板 (Level 1) → 全员覆盖/评分权
    // ========================================================================
    if (raterLevel === 1) {
        // 老板不能评价自己 (前面已拦截)。如果目标也是老板 (Level 1)，但该目标拥有具体的可评职务，则允许进行评分
        if (targetLevel === 1) {
            const targetCat = getJobCategoryForEmployee(target);
            if (targetCat !== 'OWNER' && targetCat !== 'PART_TIME') {
                return 'OVERRIDE';
            }
            return 'NONE';
        }
        return 'OVERRIDE';
    }
    
    // ========================================================================
    // 第二等级：管理层 (Level 2) → 可以评价第三等级
    // ========================================================================
    if (raterLevel === 2) {
        // 如果老板为该管理层员工配置了专属的评测对象名单，则遵循专属名单
        if (rater.assessmentTargets && rater.assessmentTargets.length > 0) {
            if (rater.assessmentTargets.includes(target.id)) {
                return 'INITIAL';
            }
            return 'NONE';
        }
        
        // 默认情况下：第二等级（管理层）可以评价所有的第三等级（员工）
        if (targetLevel === 3) {
            return 'INITIAL';
        }
        return 'NONE';
    }
    
    // ========================================================================
    // 第三等级：员工 (Level 3) → 无评分权
    // ========================================================================
    return 'NONE';
};

/** 获取 rater 可评的所有员工 */
export const getAssessableTargets = (rater: Employee, allEmployees: Employee[]): Employee[] => {
    return allEmployees.filter(emp => {
        if (emp.isArchived) return false;
        
        // 自己不能评自己
        if (rater.id === emp.id) return false;
        
        // 🚫 如果是老板（Level 1），则无需被评，不显示在评测目标中
        if (getEmployeeLevel(emp) === 1) {
            return false;
        }
        
        const perm = getAssessPermission(rater, emp);
        return perm === 'INITIAL' || perm === 'OVERRIDE';
    });
};

/** 判断员工能否进入评分模块 */
export const canAccessAssessmentModule = (emp: Employee): boolean => {
    const level = getEmployeeLevel(emp);
    // 第一等级（老板）和第二等级（管理层）有评分权
    return level === 1 || level === 2;
};

// ============================================================================
// 4. 综合分计算
// ============================================================================

/** 计算一个 metrics 数组的平均分 (4 项平均) */
export const calculateOverallScore = (metrics: MetricScoreV2[]): number => {
    if (!metrics || metrics.length === 0) return 0;
    const activeMetrics = metrics.filter(m => !m.skipped);
    if (activeMetrics.length === 0) return 0;
    const sum = activeMetrics.reduce((s, m) => s + m.score, 0);
    return Math.round(sum / activeMetrics.length);
};

/** 计算多角色评测的综合得分与明细 */
export const calculateMultiRaterTotals = (record: AssessmentRecordV2) => {
    const initialScore = record.initialRating?.overallScore || 0;
    const raterName = record.initialRating?.raterName || '';
    const hasInitial = !!record.initialRating;
    
    // 获取所有非跳过且已评的老板分数
    const bossRatingsList = Object.values(record.bossRatings || {});
    const activeBossRatings = bossRatingsList.filter(b => !b.skipped);
    
    const activeBossScores = activeBossRatings.map(b => b.overallScore);
    const bossesCount = activeBossScores.length;
    const bossesSum = activeBossScores.reduce((sum, s) => sum + s, 0);
    const bossesAverage = bossesCount > 0 ? Math.round(bossesSum / bossesCount) : 0;
    
    // 综合计算：管理层评分 (50%) + 老板评分平均值 (50%) 合并
    let finalScore = 0;
    if (hasInitial && bossesCount > 0) {
        finalScore = Math.round(initialScore * 0.5 + bossesAverage * 0.5);
    } else if (hasInitial) {
        finalScore = initialScore;
    } else if (bossesCount > 0) {
        finalScore = bossesAverage;
    } else if (record.ownerOverride) {
        finalScore = record.ownerOverride.overallScore;
    }
    
    // 总评分人数
    const totalRaters = (hasInitial ? 1 : 0) + bossesCount;
    
    return {
        initialScore,
        hasInitial,
        raterName,
        activeBossRatings,
        bossesCount,
        bossesAverage,
        finalScore,
        totalRaters
    };
};

/** 从 AssessmentRecordV2 取最终分 (支持多老板评分综合计算) */
export const getFinalScoreFromRecord = (record: AssessmentRecordV2): number => {
    return calculateMultiRaterTotals(record).finalScore;
};

/** 检查一次评分是否完整 (4 项都填了) */
export const isRatingComplete = (
    employeeJobCategory: JobCategory,
    metrics: MetricScoreV2[]
): { complete: boolean; missingKeys: string[] } => {
    const requiredMetrics = JOB_METRICS[employeeJobCategory]?.metrics || [];
    const requiredKeys = requiredMetrics.map(m => m.key);
    const filledKeys = metrics.map(m => m.metricKey);
    const missingKeys = requiredKeys.filter(k => !filledKeys.includes(k));
    return { complete: missingKeys.length === 0, missingKeys };
};

/** 检查 C 或 D 档备注是否都填了 */
export const validateCGradeNotes = (metrics: MetricScoreV2[]): { valid: boolean; missingMetricKeys: string[] } => {
    const missing = metrics
        .filter(m => (m.grade === 'C' || m.grade === 'D') && (!m.note || m.note.trim().length === 0))
        .map(m => m.metricKey);
    return { valid: missing.length === 0, missingMetricKeys: missing };
};

// ============================================================================
// 5. 汇总与年度报告
// ============================================================================

/** 从一组评分记录生成员工汇总 */
export const buildAssessmentSummary = (
    records: AssessmentRecordV2[]
): EmployeeAssessmentSummary => {
    if (!records || records.length === 0) {
        return { quarterHistory: [] };
    }
    
    // 按 quarter 降序排序
    const sorted = [...records].sort((a, b) => b.quarter.localeCompare(a.quarter));
    const latest = sorted[0];
    
    // 最近 4 个季度走势
    const quarterHistory = sorted.slice(0, 4).map(r => ({
        quarter: r.quarter,
        score: r.finalScore,
        grade: r.finalGrade
    }));
    
    const summary: EmployeeAssessmentSummary = {
        currentQuarter: latest.quarter,
        currentScore: latest.finalScore,
        currentGrade: latest.finalGrade,
        quarterHistory
    };
    
    // 年度平均：如果最近 4 个季度同一年，自动算
    const currentYear = parseInt(latest.quarter.split('-')[0]);
    const sameYearRecords = sorted.filter(r => r.quarter.startsWith(currentYear.toString()));
    
    if (sameYearRecords.length >= 4) {
        const avgScore = Math.round(
            sameYearRecords.reduce((s, r) => s + r.finalScore, 0) / sameYearRecords.length
        );
        // 💡 确保这里赋的值一定是 S | A | B | C，符合我们收紧后的类型
        const avgGrade = getGradeFromScore(avgScore).label as GradeLabel;
        
        summary.yearlyAverage = {
            year: currentYear,
            avgScore,
            avgGrade,
            recommendation: getYearlyRecommendation(avgScore, sameYearRecords)
        };
    }
    
    return summary;
};

/** 根据年度分和季度走势生成决策建议 */
export const getYearlyRecommendation = (
    avgScore: number,
    records: AssessmentRecordV2[]
): 'PROMOTE' | 'RAISE' | 'MAINTAIN' | 'WATCH' | 'PIP' => {
    const grade = getGradeFromScore(avgScore).label;
    const hasConsecutiveC = checkConsecutive(records, 'C', 2);
    const hasConsecutiveD = checkConsecutive(records, 'D', 2);
    const hasConsecutiveSSS = checkConsecutive(records, 'SSS', 2);
    const hasConsecutiveSS = checkConsecutive(records, 'SS', 2);
    const hasConsecutiveS = checkConsecutive(records, 'S', 2);
    
    if (hasConsecutiveC || hasConsecutiveD) return 'PIP';           // 连 2 季 C/D -> PIP
    if (hasConsecutiveSSS || hasConsecutiveSS || hasConsecutiveS) return 'PROMOTE';       // 连 2 季 S/SS/SSS -> 升职候选
    if (['SSS', 'SS', 'S'].includes(grade)) return 'PROMOTE';
    if (grade === 'A') return 'RAISE';
    if (grade === 'B') return 'MAINTAIN';
    return 'WATCH';                               // C/D 但不连续 -> 观察
};

/** 检查是否有连续 N 季度同 Grade */
const checkConsecutive = (
    records: AssessmentRecordV2[],
    grade: GradeLabel,
    n: number
): boolean => {
    const sorted = [...records].sort((a, b) => a.quarter.localeCompare(b.quarter));
    let streak = 0;
    for (const r of sorted) {
        if (r.finalGrade === grade) {
            streak++;
            if (streak >= n) return true;
        } else {
            streak = 0;
        }
    }
    return false;
};

/** 决策建议的显示文本 */
export const getRecommendationLabel = (rec: string): { label: string; color: string; action: string } => {
    const map: Record<string, { label: string; color: string; action: string }> = {
        'PROMOTE':  { label: '建议升职', color: 'bg-purple-100 text-purple-700', action: '进入升职候选名单' },
        'RAISE':    { label: '建议加薪', color: 'bg-green-100 text-green-700',   action: '下次调薪加 3-7%' },
        'MAINTAIN': { label: '维持现状', color: 'bg-blue-100 text-blue-700',     action: '通胀调整即可' },
        'WATCH':    { label: '列入观察', color: 'bg-orange-100 text-orange-700', action: '安排 1-on-1 谈话' },
        'PIP':      { label: '启动 PIP', color: 'bg-red-100 text-red-700',       action: '启动绩效改进计划或考虑替换' }
    };
    return map[rec] || map['MAINTAIN'];
};

// ============================================================================
// 6. 评分状态查询辅助
// ============================================================================

/** 查找某员工在某季度的评分记录 */
export const findRecordForQuarter = (
    records: AssessmentRecordV2[] | undefined,
    quarter: QuarterKey
): AssessmentRecordV2 | undefined => {
    return records?.find(r => r.quarter === quarter);
};

/** 判断员工本季度是否已评 */
export const isAssessedForQuarter = (
    records: AssessmentRecordV2[] | undefined,
    quarter: QuarterKey
): boolean => {
    const rec = findRecordForQuarter(records, quarter);
    return !!rec && (rec.status === 'SUBMITTED' || rec.status === 'OVERRIDDEN' || rec.status === 'FINALIZED');
};

/** 判断员工本季度评分状态 (给 UI 显示徽章用) */
export type QuarterlyStatus = 
    | 'NOT_STARTED'   // 未开始
    | 'DRAFT'         // 草稿 (初评未提交)
    | 'SUBMITTED'     // 初评已提交
    | 'OVERRIDDEN'    // 老板已覆盖
    | 'FINALIZED'     // 季度结束锁定
    | 'EXEMPT';       // 豁免 (Part-time)

export const getQuarterlyStatus = (
    employee: Employee,
    quarter: QuarterKey
): QuarterlyStatus => {
    if (employee.assessmentExempt) return 'EXEMPT';
    const rec = findRecordForQuarter(employee.assessmentRecordsV2, quarter);
    if (!rec) return 'NOT_STARTED';
    
    // 💡 消除强制转型，采用安全验证。
    const validStatuses: QuarterlyStatus[] = ['DRAFT', 'SUBMITTED', 'OVERRIDDEN', 'FINALIZED'];
    if (validStatuses.includes(rec.status as QuarterlyStatus)) {
        return rec.status as QuarterlyStatus;
    }
    return 'NOT_STARTED'; 
};

/** 岗位分类 (helper 复用 classifyJob, 考虑豁免) */
export const getJobCategoryForEmployee = (emp: Employee): JobCategory => {
    if (emp.assessmentExempt) return 'PART_TIME';
    if (emp.rank === 'TOP') return 'OWNER';
    return classifyJob(emp.role);
};

// ============================================================================
// 员工排序 (按岗位优先级从上到下)
// ============================================================================

/** 员工列表按岗位优先级排序 */
export const sortEmployeesByJobPriority = (employees: Employee[]): Employee[] => {
    return [...employees].sort((a, b) => {
        const catA = getJobCategoryForEmployee(a);
        const catB = getJobCategoryForEmployee(b);
        const priA = JOB_CATEGORY_SORT[catA] ?? 9999;
        const priB = JOB_CATEGORY_SORT[catB] ?? 9999;
        if (priA !== priB) return priA - priB;
        
        // 同岗位内按 ID 排序 (资历: ID 小的靠前)
        const idA = parseInt(a.id) || 9999;
        const idB = parseInt(b.id) || 9999;
        return idA - idB;
    });
};