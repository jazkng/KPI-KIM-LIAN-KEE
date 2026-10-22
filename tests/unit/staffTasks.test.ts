import { describe, expect, it } from 'vitest';
import {
    buildPurchaseApply, buildStocktakeApply, consumptionSinceLast, currentCycle, effectiveStatus, monthReturnCount, nextCycle, repeatLabel,
    stocktakeDiffs, toStockLine, validateSubmission, type StaffTask,
} from '../../utils/tasks/staffTaskLogic';

const base = (p: Partial<StaffTask> = {}): StaffTask => ({
    id: 't1', type: 'CLEAN', title: '清理冷房', assignMode: 'PERSON', assigneeId: 'e1', assigneeName: 'Ali', assigneeKey: 'emp:e1',
    repeat: 'ONCE', photosRequired: 0, createdBy: 'm1', createdByName: 'Kelvin', createdAt: '2026-10-22T01:00:00Z',
    status: 'OPEN', returnCount: 0, returnedEmployeeIds: [], history: [], ...p,
});
const pork = { id: 's1', name: '猪肉', category: 'KF', currentQtyBase: 10000, baseUnit: 'g', displayUnit: 'kg', displayToBaseRatio: 1000, costPerBaseUnit: 0.02 } as any;
const rice = { id: 's2', name: '白米', category: 'KD', currentQtyBase: 20, baseUnit: 'kg', costPerBaseUnit: 3 } as any;

describe('effectiveStatus', () => {
    it('单次：过期未交 = 逾期；交了 = 待确认', () => {
        expect(effectiveStatus(base({ dueAt: '2026-10-22T05:00:00Z' }), '2026-10-22', '2026-10-22T06:00:00Z')).toBe('OVERDUE');
        expect(effectiveStatus(base({ status: 'SUBMITTED' }), '2026-10-22', '2026-10-22T06:00:00Z')).toBe('SUBMITTED');
    });
    it('每日：昨天完成的，今天又是待做', () => {
        const t = base({ repeat: 'DAILY', status: 'DONE', runDate: '2026-10-21' });
        expect(effectiveStatus(t, '2026-10-22', '2026-10-22T06:00:00Z')).toBe('TODO');
        expect(effectiveStatus({ ...t, runDate: '2026-10-22' }, '2026-10-22', '2026-10-22T06:00:00Z')).toBe('DONE');
    });
});

describe('validateSubmission', () => {
    it('要拍照就要够张数，最多 5 张', () => {
        expect(validateSubmission(base({ photosRequired: 2 }), { photoCount: 1 })).toBe('要拍至少 2 张照片');
        expect(validateSubmission(base(), { photoCount: 6 })).toBe('照片最多 5 张');
        expect(validateSubmission(base({ photosRequired: 2 }), { photoCount: 2 })).toBeNull();
    });
    it('盘点每一项都要填', () => {
        const t = base({ type: 'STOCKTAKE', stockLines: [toStockLine(pork, 'KITCHEN'), toStockLine(rice, 'KITCHEN')] });
        expect(validateSubmission(t, { photoCount: 0, counts: { s1: 8 } })).toBe('还有 1 项没填数量');
    });
});

describe('盘点确认', () => {
    const t = base({ type: 'STOCKTAKE', stockLines: [toStockLine(pork, 'KITCHEN'), toStockLine(rice, 'KITCHEN')], status: 'SUBMITTED',
        submission: { by: 'e1', byName: 'Ali', at: '2026-10-22T05:00:00Z', photoIds: [], counts: { s1: 6, s2: 19 }, qtyAtSubmit: { s1: 10000, s2: 20 } } });
    it('显示单位换算（kg→g），差 30% 以上标红', () => {
        const d = stocktakeDiffs(t);
        expect(d[0]).toMatchObject({ countedBase: 6000, system: 10000, alert: true });
        expect(d[1].alert).toBe(false);
    });
    it('库存数量改成点到的数，写一笔盘点记录', () => {
        const r = buildStocktakeApply(t, { s1: pork, s2: rice }, 'Kelvin', '2026-10-22T06:00:00Z', '2026-10-22');
        expect(r.conflicts).toEqual([]);
        expect(r.updates).toEqual([{ stockId: 's1', area: 'KITCHEN', newQtyBase: 6000 }, { stockId: 's2', area: 'KITCHEN', newQtyBase: 19 }]);
        expect(r.log).toMatchObject({ source: 'STOCKTAKE', totalValueChange: -83 });
    });
    it('交回后库存被改过 → 冲突', () => {
        const r = buildStocktakeApply(t, { s1: { ...pork, currentQtyBase: 12000 }, s2: rice }, 'Kelvin', 'x', '2026-10-22');
        expect(r.conflicts[0]).toContain('猪肉');
    });
});

describe('采购确认', () => {
    it('从库存选：数量相加、成本移动平均，写收货记录', () => {
        const t = base({ type: 'PURCHASE', purchaseMode: 'STOCK', status: 'SUBMITTED',
            submission: { by: 'e1', byName: 'Ali', at: 'x', photoIds: [], purchases: [{ stockId: 's2', area: 'KITCHEN', name: '白米', unit: 'kg', ratio: 1, qty: 20, amount: 80 }] } });
        const r = buildPurchaseApply(t, { s2: rice }, 'Kelvin', 'x', '2026-10-22');
        expect(r.updates[0]).toMatchObject({ newQtyBase: 40, newCostPerBaseUnit: 3.5 });
        expect(r.log.source).toBe('RECEIVE');
    });
});

describe('每日消耗与退回次数', () => {
    const logs = [
        { id: 'a', date: '2026-10-20', timestamp: '2026-10-20T10:00:00Z', staffName: '', totalValueChange: 0, category: '', source: 'STOCKTAKE', items: [{ stockId: 's2', newQty: 30, diff: 0 }] },
        { id: 'b', date: '2026-10-21', timestamp: '2026-10-21T10:00:00Z', staffName: '', totalValueChange: 0, category: '', source: 'RECEIVE', items: [{ stockId: 's2', newQty: 40, diff: 10 }] },
    ] as any;
    it('上次点 30 + 收货 10 − 今天点 25 = 用了 15', () => {
        expect(consumptionSinceLast(logs, 's2', 25, '2026-10-22T00:00:00Z')).toEqual({ since: '2026-10-20', lastQty: 30, received: 10, used: 15 });
    });
    it('本月被退回几次', () => {
        const t = base({ history: [{ at: '2026-10-05T00:00:00Z', by: 'K', action: 'RETURN', employeeId: 'e1' }, { at: '2026-09-30T00:00:00Z', by: 'K', action: 'RETURN', employeeId: 'e1' }] });
        expect(monthReturnCount([t], 'e1', '2026-10')).toBe(1);
    });
});

describe('重复任务的每一期', () => {
    const created = '2026-10-01T02:00:00Z'; // 星期四
    const t = (p: Partial<StaffTask>) => base({ createdAt: created, ...p });
    const now = '2026-10-22T06:00:00Z';
    it('每周一、四：今天（10/22 星期四）是新的一期；10/21 星期三算到 10/19 星期一那期', () => {
        const w = t({ repeat: 'WEEKLY', repeatDays: [1, 4] });
        expect(currentCycle(w, '2026-10-22')).toBe('2026-10-22');
        expect(currentCycle(w, '2026-10-21')).toBe('2026-10-19');
        expect(repeatLabel(w)).toBe('每周一、四');
        expect(nextCycle(w, '2026-10-22')).toBe('2026-10-26');
    });
    it('每周：上一期没交，过了开始那天就算逾期；交了这一期就是待确认', () => {
        const w = t({ repeat: 'WEEKLY', repeatDays: [1] });
        expect(effectiveStatus(w, '2026-10-21', now)).toBe('OVERDUE');
        expect(effectiveStatus({ ...w, status: 'SUBMITTED', runDate: '2026-10-19' }, '2026-10-21', now)).toBe('SUBMITTED');
        expect(effectiveStatus(w, '2026-10-19', now)).toBe('TODO');
    });
    it('每月 31 号：小月用月底；第一期还没到 = 未到期', () => {
        const m = t({ repeat: 'MONTHLY', repeatDate: 31 });
        expect(currentCycle(m, '2026-11-30')).toBe('2026-11-30');
        expect(currentCycle(m, '2026-11-15')).toBe('2026-10-31');
        expect(effectiveStatus(m, '2026-10-15', now)).toBe('UPCOMING');
    });
    it('每隔 3 天：从派的那天起算', () => {
        const n = t({ repeat: 'EVERY_N', repeatEvery: 3 });
        expect(currentCycle(n, '2026-10-05')).toBe('2026-10-04');
        expect(currentCycle(n, '2026-10-07')).toBe('2026-10-07');
        expect(repeatLabel(n)).toBe('每 3 天');
    });
});
