import type { SettlementRecord } from '../types';
import { getOps } from '../components/features/settlement/settlementOps';
import { computePnL } from './pnl/engine/pnlEngine';
import { loadCockpitWith, type CockpitDataSource } from './cockpit/cockpitLoader';
import { addDays, daysInMonth, resolvePeriod } from './cockpit/periods';

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
    const channels = [{ label: '店内', amount: store }, { label: 'Grab', amount: pnl.classic.platformGross.grab }, { label: 'Foodpanda', amount: pnl.classic.platformGross.panda }, { label: 'ShopeeFood', amount: pnl.classic.platformGross.shopee }, { label: 'Lalamove', amount: pnl.classic.platformGross.lalamove }];
    const weather = [...new Set(rows.map(r => r.weather).filter(Boolean))];
    return { date, revenue: pnl.revenue, channels, bills, pax, perBill: bills ? store / bills : null, perPax: pax ? store / pax : null,
        weather: weather.length === 1 ? weather[0] : undefined, weatherMixed: weather.length > 1,
        legacyGrab: pnl.reasons.some(r => r.code === 'LEGACY_GRAB') };
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
