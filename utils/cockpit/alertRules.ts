// ============================================================================
// 老板经营驾驶舱 · 预警中心规则（PR E1）
// ----------------------------------------------------------------------------
// 纯函数，只读。输入：驾驶舱计算结果 + 未付应付账款 + 老板在本机设定的阈值。
// 每条预警都附「证据」（日期、金额、比例与计算方式），并指向可以查看明细的画面。
// 人工、食材、OT 比例没有预设阈值：老板没有设定就不判断（不使用任何预设比例）。
// 阈值只存在这台装置（localStorage），不写入资料库。
// ============================================================================
import type { CockpitResult } from './cockpitMetrics';
import { addDays } from './periods';
import { classifyPayables, type PayableLike } from '../apDueDate';

export interface AlertThresholds {
    /** 近 7 天日均营业额比前 7 天下降超过这个百分比（例 15 = 15%） */
    revenueDropPct: number;
    /** 人工成本率上限（0–1）；null = 未设定，不判断 */
    labourRatioMax: number | null;
    /** OT 占人工成本比例上限（0–1）；null = 未设定 */
    otShareMax: number | null;
    /** 食材采购成本率上限（0–1）；null = 未设定 */
    foodRatioMax: number | null;
    /** 应付账款「即将到期」的天数 */
    apDueSoonDays: number;
    /** 每月几号之后，上个月薪资仍未过账就提醒 */
    payrollPostByDay: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
    revenueDropPct: 15,
    labourRatioMax: null,
    otShareMax: null,
    foodRatioMax: null,
    apDueSoonDays: 7,
    payrollPostByDay: 7,
};

export type AlertTarget =
    | { kind: 'kpi'; key: string }
    | { kind: 'labour' }
    | { kind: 'food' }
    | { kind: 'sim' };

export interface CenterAlert {
    id: string;
    level: 'HIGH' | 'NORMAL';
    category: '营业额' | '利润' | '保本' | '人工' | '食材' | '应付账款' | '资料完整性';
    title: string;
    detail: string;
    /** 可追溯的依据（日期、金额、计算方式） */
    evidence: string[];
    target?: AlertTarget;
}

export interface AlertCenterInput {
    result: CockpitResult;
    today: string;
    thresholds: AlertThresholds;
    /** 未付 / 部分付款账单；null = 读取失败或尚未读取 */
    payables: PayableLike[] | null;
    payablesError?: string | null;
}

export interface AlertCenter {
    alerts: CenterAlert[];
    /** 因资料不足或未设定阈值而没有判断的规则（让老板知道哪些没检查） */
    skipped: { rule: string; reason: string }[];
}

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const BASE_CATEGORY: Record<string, CenterAlert['category']> = {
    revenue: '资料完整性',
    projectedProfit: '利润',
    breakEvenGap: '保本',
    actualProfit: '资料完整性',
    labour: '人工',
    food: '食材',
};

const sumWindow = (daily: Record<string, number>, start: string, end: string) => {
    let total = 0;
    let days = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
        if (daily[d] === undefined) continue;
        total += daily[d];
        days++;
    }
    return { total, days, avg: days > 0 ? total / days : 0 };
};

/** 薪资月份 YYYY-MM 的上一个月 */
const prevMonth = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const buildAlertCenter = ({ result, today, thresholds: t, payables, payablesError }: AlertCenterInput): AlertCenter => {
    const alerts: CenterAlert[] = [];
    const skipped: AlertCenter['skipped'] = [];
    const k = result.kpis;

    // ── 驾驶舱基础预警（未日结、预计亏损、落后保本、未对账、缺底薪、无采购）──
    result.alerts.forEach((a, i) => {
        alerts.push({
            id: `base:${a.kpi || i}:${a.title}`,
            level: a.level,
            category: BASE_CATEGORY[a.kpi || ''] || '资料完整性',
            title: a.title,
            detail: a.detail,
            evidence: [a.detail, `期间：${result.period.label}（${result.period.start} ~ ${result.period.end}）`],
            target: a.kpi && k[a.kpi] ? { kind: 'kpi', key: a.kpi } : undefined,
        });
    });

    // ── 营业额下降：近 7 天 vs 前 7 天（每段至少 4 天有日结，按有日结的天数算日均）──
    {
        const daily = result.extras.dailyRevenue;
        // 今天尚未日结时，以昨天为终点，避免把「还没日结」当成下降
        const end = result.period.end < today ? result.period.end : today;
        const anchor = end === today && daily[today] === undefined ? addDays(today, -1) : end;
        const last = sumWindow(daily, addDays(anchor, -6), anchor);
        const prev = sumWindow(daily, addDays(anchor, -13), addDays(anchor, -7));
        if (last.days < 4 || prev.days < 4 || prev.avg <= 0) {
            skipped.push({ rule: '营业额下降', reason: `近 7 天 ${last.days} 天、前 7 天 ${prev.days} 天有日结，每段至少需要 4 天` });
        } else {
            const drop = (prev.avg - last.avg) / prev.avg;
            if (drop * 100 >= t.revenueDropPct) {
                alerts.push({
                    id: 'revenue-drop',
                    level: drop * 100 >= t.revenueDropPct * 2 ? 'HIGH' : 'NORMAL',
                    category: '营业额',
                    title: `近 7 天营业额下降 ${(drop * 100).toFixed(1)}%`,
                    detail: `日均 ${rm(last.avg)}，前 7 天日均 ${rm(prev.avg)}`,
                    evidence: [
                        `近 7 天 ${addDays(anchor, -6)} ~ ${anchor}：${rm(last.total)} ÷ ${last.days} 个有日结的日子 = 日均 ${rm(last.avg)}`,
                        `前 7 天 ${addDays(anchor, -13)} ~ ${addDays(anchor, -7)}：${rm(prev.total)} ÷ ${prev.days} 天 = 日均 ${rm(prev.avg)}`,
                        `阈值：下降 ${t.revenueDropPct}% 以上提醒，${t.revenueDropPct * 2}% 以上列为高优先级（可调整）`,
                        '营业额与财务报表同口径（POS − 退款 + 外送平台总额 + Lalamove）',
                    ],
                    target: { kind: 'kpi', key: 'revenue' },
                });
            }
        }
    }

    // ── 人工成本率 ──
    const labourRatio = k.labourRatio?.value ?? null;
    if (t.labourRatioMax === null) skipped.push({ rule: '人工成本率', reason: '未设定阈值（不使用预设比例）' });
    else if (labourRatio === null) skipped.push({ rule: '人工成本率', reason: '期间没有营业额，无法计算' });
    else if (labourRatio > t.labourRatioMax) {
        alerts.push({
            id: 'labour-ratio',
            level: 'NORMAL',
            category: '人工',
            title: `人工成本率 ${pct(labourRatio)}，高于设定 ${pct(t.labourRatioMax)}`,
            detail: `人工成本 ${rm(k.labour.value ?? 0)}（${k.labour.statusNote}）`,
            evidence: [
                `人工成本率 = 人工成本 ${rm(k.labour.value ?? 0)} ÷ 营业额 ${rm(k.revenue?.value ?? 0)}`,
                `人工成本状态：${k.labour.statusNote}`,
                `阈值 ${pct(t.labourRatioMax)} 由您在本装置设定`,
            ],
            target: { kind: 'labour' },
        });
    }

    // ── OT 占人工成本（期末所在月份）──
    const mb = result.extras.monthBaseline;
    const monthLabour = mb.labourExOt + mb.ot;
    if (t.otShareMax === null) skipped.push({ rule: 'OT 占人工成本', reason: '未设定阈值（不使用预设比例）' });
    else if (monthLabour <= 0) skipped.push({ rule: 'OT 占人工成本', reason: `${mb.month} 没有人工成本资料` });
    else if (mb.ot / monthLabour > t.otShareMax) {
        alerts.push({
            id: 'ot-share',
            level: 'NORMAL',
            category: '人工',
            title: `${mb.month} OT 占人工成本 ${pct(mb.ot / monthLabour)}`,
            detail: `OT ${rm(mb.ot)}，高于设定 ${pct(t.otShareMax)}`,
            evidence: [
                `OT 占比 = OT ${rm(mb.ot)} ÷ 当月人工成本 ${rm(monthLabour)}（雇主总成本，含兼职与员工餐）`,
                '薪资尚未过账的月份，OT 为预估值；考勤导入的 OT 不会自动计入薪资',
                `阈值 ${pct(t.otShareMax)} 由您在本装置设定`,
            ],
            target: { kind: 'labour' },
        });
    }

    // ── 食材采购成本率 ──
    const foodRatio = k.foodRatio?.value ?? null;
    if (t.foodRatioMax === null) skipped.push({ rule: '食材成本率', reason: '未设定阈值（不使用预设比例）' });
    else if (foodRatio === null) skipped.push({ rule: '食材成本率', reason: '期间没有营业额，无法计算' });
    else if (foodRatio > t.foodRatioMax) {
        alerts.push({
            id: 'food-ratio',
            level: 'NORMAL',
            category: '食材',
            title: `食材采购成本率 ${pct(foodRatio)}，高于设定 ${pct(t.foodRatioMax)}`,
            detail: `采购 ${rm(k.food?.value ?? 0)}（采购口径，不是耗用）`,
            evidence: [
                `食材成本率 = 食材采购 ${rm(k.food?.value ?? 0)} ÷ 营业额 ${rm(k.revenue?.value ?? 0)}`,
                '采购集中在本期也会推高比例；实际耗用需要月底库存快照（目前资料不完整）',
                `阈值 ${pct(t.foodRatioMax)} 由您在本装置设定`,
            ],
            target: { kind: 'food' },
        });
    }

    // ── 应付账款逾期 / 即将到期（以今天为准，与所选期间无关）──
    if (payables === null) {
        skipped.push({ rule: '应付账款到期', reason: payablesError ? `读取失败：${payablesError}` : '尚未读取' });
    } else {
        const ap = classifyPayables(payables, today, t.apDueSoonDays);
        const line = (r: (typeof ap.overdue)[number]) =>
            `${r.company || '未填供应商'}${r.invoiceRef ? `（${r.invoiceRef}）` : ''}：${rm(r.outstanding)}，到期日 ${r.due}${r.days < 0 ? `，已逾期 ${-r.days} 天` : r.days === 0 ? '，今天到期' : `，${r.days} 天后到期`}`;
        const note = '没有填到期日的账单，以账单日 + 15 天视为到期日（与老板首页相同）';
        if (ap.overdue.length > 0) {
            alerts.push({
                id: 'ap-overdue',
                level: 'HIGH',
                category: '应付账款',
                title: `${ap.overdue.length} 笔应付账款已逾期`,
                detail: `合计未付 ${rm(ap.overdueAmount)}`,
                evidence: [...ap.overdue.slice(0, 8).map(line), ...(ap.overdue.length > 8 ? [`另有 ${ap.overdue.length - 8} 笔`] : []), note],
            });
        }
        if (ap.dueSoon.length > 0) {
            alerts.push({
                id: 'ap-due-soon',
                level: 'NORMAL',
                category: '应付账款',
                title: `${ap.dueSoon.length} 笔应付账款 ${t.apDueSoonDays} 天内到期`,
                detail: `合计 ${rm(ap.dueSoonAmount)}`,
                evidence: [...ap.dueSoon.slice(0, 8).map(line), ...(ap.dueSoon.length > 8 ? [`另有 ${ap.dueSoon.length - 8} 笔`] : []), note],
            });
        }
    }

    // ── 上个月薪资尚未过账（以今天为准）──
    const records = result.context?.payrollRecords;
    if (!records) {
        skipped.push({ rule: '薪资过账', reason: '没有薪资资料' });
    } else {
        const lastMonth = prevMonth(today.slice(0, 7));
        const dayOfMonth = Number(today.slice(8, 10));
        const rec = records.find(r => r.month === lastMonth);
        if (dayOfMonth > t.payrollPostByDay && rec?.status !== 'POSTED') {
            alerts.push({
                id: 'payroll-not-posted',
                level: 'NORMAL',
                category: '人工',
                title: `${lastMonth} 薪资尚未过账`,
                detail: rec ? `薪资记录状态：${rec.status || '未标示'}` : '没有该月薪资记录',
                evidence: [
                    `今天 ${today}，已过每月 ${t.payrollPostByDay} 号`,
                    rec ? `payroll 记录 ${lastMonth} 状态为 ${rec.status || '未标示'}` : `payroll 集合中没有 ${lastMonth} 的记录`,
                    '未过账月份的人工成本是依员工资料预估，利润不会标为已确认',
                ],
                target: { kind: 'kpi', key: 'labour' },
            });
        }
    }

    const order = { HIGH: 0, NORMAL: 1 } as const;
    alerts.sort((a, b) => order[a.level] - order[b.level]);
    return { alerts, skipped };
};

// ── 阈值：只存在这台装置 ──
const STORAGE_KEY = 'klk.cockpit.alertThresholds.v1';

export const sanitizeThresholds = (raw: unknown): AlertThresholds => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const num = (v: unknown, min: number, max: number, fallback: number) => {
        const n = Number(v);
        return v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    const ratio = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v, 0.001, 1, NaN) || null);
    return {
        revenueDropPct: num(r.revenueDropPct, 1, 100, DEFAULT_THRESHOLDS.revenueDropPct),
        labourRatioMax: ratio(r.labourRatioMax),
        otShareMax: ratio(r.otShareMax),
        foodRatioMax: ratio(r.foodRatioMax),
        apDueSoonDays: Math.round(num(r.apDueSoonDays, 1, 60, DEFAULT_THRESHOLDS.apDueSoonDays)),
        payrollPostByDay: Math.round(num(r.payrollPostByDay, 1, 28, DEFAULT_THRESHOLDS.payrollPostByDay)),
    };
};

export const loadThresholds = (): AlertThresholds => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return sanitizeThresholds(raw ? JSON.parse(raw) : {});
    } catch {
        return { ...DEFAULT_THRESHOLDS };
    }
};

export const saveThresholds = (t: AlertThresholds) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeThresholds(t)));
    } catch {
        // 私密浏览等情况：只在这次使用中生效
    }
};
