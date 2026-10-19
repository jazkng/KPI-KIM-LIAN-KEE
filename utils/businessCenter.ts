import { SPECIAL_CONDITION_OPTIONS, type SettlementRecord } from '../types';
import { getOps } from '../components/features/settlement/settlementOps';
import { computePnL } from './pnl/engine/pnlEngine';
import { loadCockpitWith, type CockpitDataSource } from './cockpit/cockpitLoader';
import { addDays, daysInMonth, resolvePeriod } from './cockpit/periods';
import { getMalaysiaHoliday, hasHolidayDataForYear } from './holidays/malaysiaHolidays';

export const businessMonthPeriod = (month: string, today: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today.slice(0, 7)) throw new Error('请选择有效的经营月份');
    return resolvePeriod('CUSTOM', today, { start: `${month}-01`, end: month === today.slice(0, 7) ? today : `${month}-${daysInMonth(month)}` });
};

export const dailyBusiness = (records: SettlementRecord[], date: string) => {
    const rows = records.filter(r => r.isClosed !== false && String(r.date).slice(0, 10) === date);
    if (!rows.length) return null;
    const pnl = computePnL({ settlements: rows, standaloneExpenses: [], billPayments: [], employees: [], payrollRecords: [] }, date, date, date);
    const ops = rows.map(getOps);
    const count = (key: 'bills' | 'pax') => ops.every(o => o[key] > 0) ? ops.reduce((n, o) => n + o[key], 0) : null;
    const bills = count('bills'), pax = count('pax'), store = pnl.classic.inStoreSales;
    const perRecord = rows.length === 1 ? [pnl] : rows.map(r => computePnL({ settlements: [r], standaloneExpenses: [], billPayments: [], employees: [], payrollRecords: [] }, date, date, date));
    const platform = (label: string, grossKey: 'grab' | 'panda' | 'shopee' | 'lalamove', key: 'grabOrders' | 'pandaOrders' | 'shopeeOrders' | 'lalamoveOrders') => {
        const values = rows.map(r => r.sales?.deliveryBreakdown?.[key]);
        const complete = values.every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
        return { label, amount: pnl.classic.platformGross[grossKey], orders: complete ? values.reduce<number>((n, v) => n + v!, 0) : null,
            needsReview: values.some((v, i) => v === 0 && perRecord[i].classic.platformGross[grossKey] !== 0) };
    };
    const channels = [{ label: '店内', amount: store, orders: bills, needsReview: false }, platform('Grab', 'grab', 'grabOrders'), platform('Foodpanda', 'panda', 'pandaOrders'), platform('ShopeeFood', 'shopee', 'shopeeOrders'), platform('Lalamove', 'lalamove', 'lalamoveOrders')].map(c => ({ ...c, average: !c.needsReview && c.orders && c.orders > 0 ? c.amount / c.orders : null }));
    const weather = [...new Set(rows.map(r => r.weather).filter(Boolean))];
    return { date, revenue: pnl.revenue, channels, bills, pax, perBill: bills ? store / bills : null, perPax: pax ? store / pax : null,
        weather: weather.length === 1 ? weather[0] : undefined, weatherMixed: weather.length > 1,
        legacyGrab: pnl.reasons.some(r => r.code === 'LEGACY_GRAB'),
        specialConditions: SPECIAL_CONDITION_OPTIONS.filter(o => rows.some(r => Array.isArray(r.specialConditions) && r.specialConditions.includes(o.value))).map(o => o.value),
        holiday: getMalaysiaHoliday(date), tomorrowHoliday: getMalaysiaHoliday(addDays(date, 1)), holidayYearCovered: hasHolidayDataForYear(date.slice(0, 4)) };
};

export const buildBusinessDays = (records: SettlementRecord[]) => [...new Set(records.filter(r => r.isClosed !== false).map(r => String(r.date).slice(0, 10)))].sort().map(date => dailyBusiness(records, date)!);

export const loadBusinessCenterWith = async (source: CockpitDataSource, month: string, today: string) => {
    const period = businessMonthPeriod(month, today);
    let settlements: SettlementRecord[] = [];
    const result = await loadCockpitWith({ ...source, getPnLRawRange: async (start, end) => {
        const raw = await source.getPnLRawRange(start < addDays(period.start, -14) ? start : addDays(period.start, -14), end);
        settlements = raw.settlements;
        return raw;
    } }, period, today, 'ACCRUAL');
    const draftCount = settlements.filter(r => r.isClosed === false && String(r.date).slice(0, 10) >= period.start && String(r.date).slice(0, 10) <= period.end).length;
    return { month, result, draftCount, days: buildBusinessDays(settlements) };
};

export type BusinessCenterData = Awaited<ReturnType<typeof loadBusinessCenterWith>>;
export type BusinessDay = NonNullable<ReturnType<typeof dailyBusiness>>;
