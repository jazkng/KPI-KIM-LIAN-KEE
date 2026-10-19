/**
 * 📝 结算补填：外卖单数 / 天气 / 特殊情况
 *
 * 已结算的日子事后补资料用。只写有改动的栏位（Firestore 栏位路径更新），
 * 不碰营业额、核对状态、营运数据等其他资料；全部是选填栏位，V1 不受影响。
 */
import type { SettlementRecord, SpecialCondition, WeatherCondition } from '../../../types';
import { SPECIAL_CONDITION_OPTIONS, WEATHER_OPTIONS } from '../../../types';

export type OrdersKey = 'grabOrders' | 'pandaOrders' | 'shopeeOrders' | 'lalamoveOrders';

export const EXTRA_PLATFORMS: { key: OrdersKey; label: string; sales: (d: any) => number }[] = [
  { key: 'grabOrders', label: 'Grab', sales: d => Number(d.grabGross) || Number(d.grabNet) || Number(d.grab) || 0 },
  { key: 'pandaOrders', label: 'Panda', sales: d => Number(d.pandaGross) || Number(d.pandaNet) || Number(d.panda) || 0 },
  { key: 'shopeeOrders', label: 'Shopee', sales: d => Number(d.shopeeGross) || Number(d.shopeeNet) || Number(d.shopee) || 0 },
  { key: 'lalamoveOrders', label: 'Lalamove', sales: d => Number(d.lalamove) || 0 },
];

export interface SettlementExtras {
  weather: WeatherCondition | '';
  specialConditions: SpecialCondition[];
  /** undefined = 没记录过（画面显示空白） */
  orders: Partial<Record<OrdersKey, number>>;
}

const VALID_WEATHER = new Set(WEATHER_OPTIONS.map(o => o.value));
const VALID_SPECIAL = new Set(SPECIAL_CONDITION_OPTIONS.map(o => o.value));

export const getExtras = (r: SettlementRecord): SettlementExtras => {
  const d = (r.sales?.deliveryBreakdown || {}) as any;
  const orders: Partial<Record<OrdersKey, number>> = {};
  EXTRA_PLATFORMS.forEach(p => {
    const v = d[p.key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) orders[p.key] = Math.round(v);
  });
  const w = (r as any).weather;
  const sc = (r as any).specialConditions;
  return {
    weather: VALID_WEATHER.has(w) ? w : '',
    specialConditions: Array.isArray(sc) ? sc.filter((v: any) => VALID_SPECIAL.has(v)) : [],
    orders,
  };
};

/** 有销售额的平台（补填时只显示这些，没生意的平台不用填） */
export const platformsWithSales = (r: SettlementRecord) => {
  const d = (r.sales?.deliveryBreakdown || {}) as any;
  return EXTRA_PLATFORMS.map(p => ({ ...p, amount: p.sales(d) })).filter(p => p.amount > 0);
};

const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * 算出要写进 Firestore 的栏位（只含改动的）。没有改动 → 空物件。
 * 天气清空不写（不把旧资料改成空白）；单数清空也不写。
 */
export const extrasUpdate = (orig: SettlementExtras, draft: SettlementExtras): Record<string, any> => {
  const out: Record<string, any> = {};
  if (draft.weather && draft.weather !== orig.weather) out.weather = draft.weather;
  if (!sameList(orig.specialConditions, draft.specialConditions)) out.specialConditions = [...draft.specialConditions];
  EXTRA_PLATFORMS.forEach(p => {
    const v = draft.orders[p.key];
    if (v === undefined) return;
    const n = Math.max(0, Math.round(v));
    if (n !== orig.orders[p.key]) out[`sales.deliveryBreakdown.${p.key}`] = n;
  });
  return out;
};

/** 把更新套回本地记录（画面即时刷新用） */
export const applyExtrasLocally = (r: SettlementRecord, upd: Record<string, any>): SettlementRecord => {
  const next: any = { ...r, sales: { ...r.sales, deliveryBreakdown: { ...(r.sales?.deliveryBreakdown || {}) } } };
  Object.entries(upd).forEach(([k, v]) => {
    if (k.startsWith('sales.deliveryBreakdown.')) next.sales.deliveryBreakdown[k.split('.')[2]] = v;
    else next[k] = v;
  });
  return next;
};
