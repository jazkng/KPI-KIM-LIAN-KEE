import { describe, expect, it } from 'vitest';
import { buildAlertCenter, DEFAULT_THRESHOLDS, sanitizeThresholds } from '../../utils/cockpit/alertRules';
import { classifyPayables, getEffectiveAPDueDate } from '../../utils/apDueDate';
import type { CockpitResult, Kpi } from '../../utils/cockpit/cockpitMetrics';

const kpi = (key: string, value: number | null, unit: Kpi['unit'] = 'RM'): Kpi => ({
    key, label: key, value, unit, status: 'CONFIRMED', statusNote: '已发放薪资', basis: [], sources: [], rows: [],
});

// 虚构：9/1–9/30；前 7 天（9/17–9/23）每天 3,000，近 7 天（9/24–9/30）每天 2,000
const dailyRevenue: Record<string, number> = {};
for (let d = 1; d <= 30; d++) dailyRevenue[`2026-09-${String(d).padStart(2, '0')}`] = d >= 24 ? 2000 : 3000;

const result = (over: Partial<CockpitResult> = {}): CockpitResult => ({
    period: { start: '2026-09-01', end: '2026-09-30', label: '上月', days: 30, months: ['2026-09'] } as CockpitResult['period'],
    accountingMode: 'ACCRUAL',
    loadedAt: '2026-10-15T00:00:00Z',
    kpis: {
        revenue: kpi('revenue', 80000), labour: kpi('labour', 24000), labourRatio: kpi('labourRatio', 0.3, 'PCT'),
        food: kpi('food', 28000), foodRatio: kpi('foodRatio', 0.35, 'PCT'),
    },
    order: [],
    trend: [],
    alerts: [{ level: 'NORMAL', title: '外送平台款项尚未对账', detail: '3 个平台日未对账', kpi: 'actualProfit' }],
    briefing: [],
    missingDays: [],
    integrity: [],
    extras: {
        grossProfit: 0, partTime: 0, otherLabour: 0, dailyRevenue,
        monthBaseline: { month: '2026-09', daysInMonth: 30, settledDays: 30, projectedRevenue: 80000, foodRate: 0.35, platformRate: 0, labourExOt: 21000, ot: 3000, rent: 0, otherFixed: 0, headcount: 8 },
    },
    context: { labourByMonth: [], employees: [], payrollRecords: [{ month: '2026-09', status: 'POSTED' }] },
    ...over,
});

describe('应付账款到期日（与老板首页共用）', () => {
    it('没有到期日：账单日 + 15 天', () => {
        expect(getEffectiveAPDueDate({ time: '2026-09-20T10:00:00' })).toBe('2026-10-05');
        expect(getEffectiveAPDueDate({ dueDate: '2026-10-20', time: '2026-09-20' })).toBe('2026-10-20');
    });
    it('逾期 / 即将到期分类，金额用未付余额', () => {
        const ap = classifyPayables([
            { company: 'A', dueDate: '2026-10-10', amount: 500, outstandingAmount: 200 },
            { company: 'B', dueDate: '2026-10-18', amount: 300 },
            { company: 'C', dueDate: '2026-11-30', amount: 900 },
            { company: 'D', amount: 50 },
            { company: 'E', dueDate: '2026-10-01', amount: 0, totalBillAmount: 9000 },
            { company: 'F', dueDate: '2026-10-01', amount: 100, outstandingAmount: 0 },
        ], '2026-10-15', 7);
        // E：余额以 totalBillAmount 为准（与应付账款模块相同）；F：余额已为 0，不列入
        expect(ap.overdue.map(r => r.company)).toEqual(['E', 'A']);
        expect(ap.overdueAmount).toBe(9200);
        expect(ap.dueSoon.map(r => r.company)).toEqual(['B']);
        expect(ap.noDueDate).toBe(1);
    });
});

describe('预警中心规则（只读）', () => {
    const base = { today: '2026-10-15', thresholds: DEFAULT_THRESHOLDS, payables: [] };

    it('营业额下降：近 7 天日均比前 7 天低 33.3%，超过 15% × 2 → 高优先级，并附日期与金额依据', () => {
        const c = buildAlertCenter({ ...base, result: result() });
        const a = c.alerts.find(x => x.id === 'revenue-drop')!;
        expect(a.level).toBe('HIGH');
        expect(a.title).toContain('33.3%');
        expect(a.evidence[0]).toContain('2026-09-24 ~ 2026-09-30');
        expect(a.evidence[1]).toContain('2026-09-17 ~ 2026-09-23');
    });

    it('今天尚未日结：以昨天为终点，不把未日结当成下降', () => {
        const daily: Record<string, number> = {};
        for (let d = 1; d <= 14; d++) daily[`2026-10-${String(d).padStart(2, '0')}`] = 3000;
        const r = result({ period: { start: '2026-10-01', end: '2026-10-15', label: '本月', days: 15, months: ['2026-10'] } as CockpitResult['period'], extras: { ...result().extras, dailyRevenue: daily } });
        const c = buildAlertCenter({ ...base, result: r });
        expect(c.alerts.some(x => x.id === 'revenue-drop')).toBe(false);
        expect(c.skipped.some(s => s.rule === '营业额下降')).toBe(false);
    });

    it('日结不足 4 天：不判断，列入「未检查的规则」', () => {
        const c = buildAlertCenter({ ...base, result: result({ extras: { ...result().extras, dailyRevenue: { '2026-09-30': 100 } } }) });
        expect(c.alerts.some(x => x.id === 'revenue-drop')).toBe(false);
        expect(c.skipped.find(s => s.rule === '营业额下降')!.reason).toContain('至少需要 4 天');
    });

    it('人工 / 食材 / OT 没有预设阈值：未设定就不判断', () => {
        const c = buildAlertCenter({ ...base, result: result() });
        expect(c.alerts.some(x => ['labour-ratio', 'food-ratio', 'ot-share'].includes(x.id))).toBe(false);
        expect(c.skipped.map(s => s.rule)).toEqual(expect.arrayContaining(['人工成本率', '食材成本率', 'OT 占人工成本']));
    });

    it('设定阈值后：人工 30% > 28%、食材 35% > 32%、OT 12.5% > 10% 都提醒，并指向分析页', () => {
        const c = buildAlertCenter({ ...base, result: result(), thresholds: { ...DEFAULT_THRESHOLDS, labourRatioMax: 0.28, foodRatioMax: 0.32, otShareMax: 0.1 } });
        expect(c.alerts.find(x => x.id === 'labour-ratio')!.target).toEqual({ kind: 'labour' });
        expect(c.alerts.find(x => x.id === 'food-ratio')!.target).toEqual({ kind: 'food' });
        expect(c.alerts.find(x => x.id === 'ot-share')!.title).toContain('12.5%');
    });

    it('应付账款逾期为高优先级，证据列出供应商、金额与逾期天数', () => {
        const c = buildAlertCenter({ ...base, result: result(), payables: [{ company: '鱼贩', invoiceRef: 'INV-9', dueDate: '2026-10-05', amount: 1200 }] });
        const a = c.alerts.find(x => x.id === 'ap-overdue')!;
        expect(a.level).toBe('HIGH');
        expect(a.evidence[0]).toContain('鱼贩（INV-9）：RM 1,200.00，到期日 2026-10-05，已逾期 10 天');
    });

    it('应付账款读取失败：列入未检查，不当成没有逾期', () => {
        const c = buildAlertCenter({ ...base, result: result(), payables: null, payablesError: '读取逾时' });
        expect(c.skipped.find(s => s.rule === '应付账款到期')!.reason).toContain('读取逾时');
    });

    it('上个月薪资未过账：过了设定日期才提醒', () => {
        const draft = result({ context: { labourByMonth: [], employees: [], payrollRecords: [{ month: '2026-09', status: 'DRAFT' }] } });
        expect(buildAlertCenter({ ...base, result: draft }).alerts.some(x => x.id === 'payroll-not-posted')).toBe(true);
        expect(buildAlertCenter({ ...base, today: '2026-10-05', result: draft }).alerts.some(x => x.id === 'payroll-not-posted')).toBe(false);
        expect(buildAlertCenter({ ...base, result: result() }).alerts.some(x => x.id === 'payroll-not-posted')).toBe(false);
    });

    it('驾驶舱基础预警一并列入，高优先级排在前面', () => {
        const c = buildAlertCenter({ ...base, result: result() });
        expect(c.alerts.some(x => x.title === '外送平台款项尚未对账')).toBe(true);
        const levels = c.alerts.map(a => a.level);
        expect(levels.indexOf('NORMAL')).toBeGreaterThan(levels.lastIndexOf('HIGH'));
    });

    it('阈值清理：不合理的值回到预设，比例留空 = 不检查', () => {
        const t = sanitizeThresholds({ revenueDropPct: -5, labourRatioMax: '', foodRatioMax: 0.3, otShareMax: 7, apDueSoonDays: 'x' });
        expect(t).toEqual({ ...DEFAULT_THRESHOLDS, foodRatioMax: 0.3 });
    });
});
