/**
 * 📊 每日营运数据 (Operations) —— 顾客人数 / 单数 / VIP / WhatsApp
 *
 * 存在 settlement 记录的 `ops` 栏位（旧记录没有 → 全部当 0，画面显示「—」）。
 * 故意不改 types.ts 的 SettlementRecord，用 getOps() 读取，旧资料完全兼容。
 *
 * 人均消费 = 店内实收 (storeHubTotal) ÷ 堂食人数
 *   —— 外卖没有「人数」，放进来会把人均撑高，所以只用店内实收。
 * 单均    = 店内实收 ÷ 单数
 */

export interface SettlementOps {
  /** 堂食顾客人数 */
  pax: number;
  /** 单数（开了几张单） */
  bills: number;
  /** 熟客人数（栏位名沿用 vipNew；2026-10 起画面改叫「熟客」） */
  vipNew: number;
  /** 到店 VIP（当天来吃的 VIP 人次） */
  vipVisits: number;
  /** WhatsApp 社群新加入人数 */
  waJoin: number;
  /** WhatsApp 下单数 */
  waOrders: number;
}

export const EMPTY_OPS: SettlementOps = {
  pax: 0,
  bills: 0,
  vipNew: 0,
  vipVisits: 0,
  waJoin: 0,
  waOrders: 0,
};

export const OPS_FIELDS: { key: keyof SettlementOps; label: string; short: string }[] = [
  { key: "pax", label: "顾客人数 (Pax)", short: "人数" },
  { key: "bills", label: "单数 (Bills)", short: "单数" },
  { key: "vipNew", label: "熟客", short: "熟客" }, // 栏位名沿用 vipNew（V1 兼容），画面一律叫「熟客」
  { key: "vipVisits", label: "到店 VIP", short: "VIP到店" },
  { key: "waJoin", label: "WhatsApp 新加入", short: "WA新加入" },
  { key: "waOrders", label: "WhatsApp 订单", short: "WA订单" },
];

const n = (v: any) => {
  const x = Number(v);
  return isFinite(x) && x > 0 ? x : 0;
};

/** 先看 ops 栏位；旧版本 / 别的工具如果把人数直接存在记录最外层（pax、customerCount…），也一起读进来 */
const pick = (o: any, r: any, keys: string[]) => {
  for (const k of keys) {
    const v = n(o?.[k]);
    if (v > 0) return v;
  }
  for (const k of keys) {
    const v = n(r?.[k]);
    if (v > 0) return v;
  }
  return 0;
};

export const getOps = (record: any): SettlementOps => {
  const o = record?.ops || {};
  return {
    pax: pick(o, record, ["pax", "customerCount", "customers", "guestCount", "guests", "paxCount", "headcount"]),
    bills: pick(o, record, ["bills", "billCount", "orderCount", "transactions", "receiptCount"]),
    vipNew: pick(o, record, ["vipNew", "newVip", "vipNewMembers"]),
    vipVisits: pick(o, record, ["vipVisits", "vipCount", "vip"]),
    waJoin: pick(o, record, ["waJoin", "whatsappJoin", "whatsappNew", "waNew"]),
    waOrders: pick(o, record, ["waOrders", "whatsappOrders", "whatsappOrderCount"]),
  };
};

export const hasOps = (ops: SettlementOps) => Object.values(ops).some((v) => v > 0);

/** 人均消费（没有人数 → null，画面显示「—」而不是 0 或 Infinity） */
export const perPax = (storeHubTotal: number, ops: SettlementOps): number | null =>
  ops.pax > 0 ? Math.round((Number(storeHubTotal) / ops.pax) * 100) / 100 : null;

/** 单均 */
export const perBill = (storeHubTotal: number, ops: SettlementOps): number | null =>
  ops.bills > 0 ? Math.round((Number(storeHubTotal) / ops.bills) * 100) / 100 : null;

export const fmtMoneyOrDash = (v: number | null) => (v === null ? "—" : v.toFixed(2));
