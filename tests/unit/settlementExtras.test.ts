import { describe, it, expect } from 'vitest';
import { getExtras, extrasUpdate, platformsWithSales, applyExtrasLocally } from '../../components/features/settlement/settlementExtras';
import { dailyBusiness } from '../../utils/businessCenter';
import type { SettlementRecord } from '../../types';

const rec = (extra: any = {}) => ({
  id: 's1', date: '2026-10-18', isClosed: true,
  sales: { cash: 100, tng: 0, card: 0, duitnow: 0, amex: 0, total: 300, storeHubTotal: 100, deliveryBreakdown: { grabGross: 150, grabNet: 120, grabAds: 0, pandaGross: 0, panda: 0, shopee: 0, lalamove: 30, ...(extra.db || {}) } },
  ...extra.top,
} as unknown as SettlementRecord);

describe('结算补填', () => {
  it('reads old records with nothing filled', () => {
    expect(getExtras(rec())).toEqual({ weather: '', specialConditions: [], orders: {} });
  });

  it('only lists platforms that had sales', () => {
    expect(platformsWithSales(rec()).map(p => p.key)).toEqual(['grabOrders', 'lalamoveOrders']);
  });

  it('writes only the changed fields, as field paths', () => {
    const r = rec({ top: { weather: 'SUNNY' }, db: { grabOrders: 0 } });
    const orig = getExtras(r);
    const upd = extrasUpdate(orig, { weather: 'RAIN', specialConditions: ['HAZE'], orders: { grabOrders: 25 } });
    expect(upd).toEqual({ weather: 'RAIN', specialConditions: ['HAZE'], 'sales.deliveryBreakdown.grabOrders': 25 });
    expect(extrasUpdate(orig, orig)).toEqual({});
  });

  it('never blanks out existing data', () => {
    const r = rec({ top: { weather: 'CLOUDY' }, db: { grabOrders: 12 } });
    const upd = extrasUpdate(getExtras(r), { weather: '', specialConditions: [], orders: { grabOrders: undefined } });
    expect(upd).toEqual({});
  });

  it('applies the update locally without touching amounts', () => {
    const r = rec();
    const next = applyExtrasLocally(r, { weather: 'RAIN', 'sales.deliveryBreakdown.lalamoveOrders': 3 }) as any;
    expect(next.weather).toBe('RAIN');
    expect(next.sales.deliveryBreakdown.lalamoveOrders).toBe(3);
    expect(next.sales.deliveryBreakdown.grabGross).toBe(150);
    expect((r as any).weather).toBeUndefined();
  });
});

describe('经营中心：熟客与 WhatsApp', () => {
  it('sums 熟客 / VIP / WhatsApp across records of the same day', () => {
    const a = rec({ top: { ops: { vipNew: 5, vipVisits: 2, waJoin: 1, waOrders: 3 } } });
    const b = rec({ top: { id: 's2', ops: { vipNew: 1, waOrders: 2 } } });
    expect(dailyBusiness([a, b], '2026-10-18')!.community).toEqual({ regulars: 6, vipVisits: 2, waJoin: 1, waOrders: 5 });
  });
});
