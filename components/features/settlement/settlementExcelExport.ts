import { loadExcelJS } from '../../../utils/lazyLibs';
import type ExcelJSNS from 'exceljs';
import type { SettlementRecord } from "../../../types";
import { WEATHER_OPTIONS } from "../../../types";
import { getReconActual } from "../../../utils/settlementRecon";
import { getOps, perPax, perBill, type SettlementOps } from "./settlementOps";

/**
 * 📊 每日结算 —— 批量导出 Excel
 *
 * 一个档案 4 张表：
 *   1. 每日汇总    —— 一天一行：营业额、各付款方式、外卖、现金支出、提支、应余/实点/差异
 *   2. 月度汇总    —— 按月份加总（跨月导出时用来对月报）
 *   3. 现金支出明细 —— 每一笔钱箱现金支出
 *   4. 外卖明细    —— 每个平台 Gross / Net / Ads / 预期 / 核对后实收
 *
 * 数字算法跟「结算单 PDF」完全同一套（getSettlementFigures），导出来跟 PDF 对得上。
 */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export interface SettlementFigures {
  date: string;
  weekday: string;
  weather: string;
  netRevenue: number;
  storeHubTotal: number;
  cash: number;
  tng: number;
  debit: number;
  credit: number;
  amex: number;
  grab: { gross: number; net: number; ads: number; expected: number; actual: number | null; report: number };
  panda: { gross: number; net: number; ads: number; expected: number; actual: number | null; report: number };
  shopee: { gross: number; net: number; ads: number; expected: number; actual: number | null; report: number };
  lalamove: number;
  totalDelivery: number;
  openingCash: number;
  cashExpenses: number;
  ownerWithdrawal: number;
  expectedCash: number;
  closingCash: number;
  variance: number;
  varianceReason: string;
  submittedBy: string;
  expenses: { company: string; item: string; amount: number }[];
  ops: SettlementOps;
  avgPerPax: number | null;
  avgPerBill: number | null;
}

const n = (v: any) => Number(v) || 0;

/** 👑 跟 SettlementModule 结算单 PDF 的算法一模一样，改其中一边记得两边一起改 */
export const getSettlementFigures = (r: SettlementRecord): SettlementFigures => {
  const db = (r.sales?.deliveryBreakdown || {}) as any;
  const recon = (r as any).reconStatus || {};

  const grabGross = n(db.grabGross);
  const rawGrabNet = n(db.grabNet) || n(db.grab);
  const grabNet = rawGrabNet > 0 ? rawGrabNet : grabGross;
  const grabAds = n(db.grabAds);
  const grabExpected = grabNet - grabAds;
  const grabActual = getReconActual(recon, "grab");

  const rawPandaNet = db.pandaNet !== undefined && db.pandaNet !== null ? n(db.pandaNet) : n(db.panda);
  const pandaGross = n(db.pandaGross) || (rawPandaNet > 0 ? rawPandaNet : n(db.panda));
  const pandaNet = rawPandaNet > 0 ? rawPandaNet : pandaGross;
  const pandaAds = n(db.pandaAds);
  const pandaExpected = pandaNet - pandaAds;
  const pandaActual = getReconActual(recon, "panda");

  const rawShopeeNet = db.shopeeNet !== undefined && db.shopeeNet !== null ? n(db.shopeeNet) : n(db.shopee);
  const shopeeGross = n(db.shopeeGross) || (rawShopeeNet > 0 ? rawShopeeNet : 0);
  const shopeeNet = rawShopeeNet > 0 ? rawShopeeNet : shopeeGross;
  const shopeeAds = n(db.shopeeAds);
  const shopeeExpected = shopeeNet - shopeeAds;
  const shopeeActual = getReconActual(recon, "shopee");

  const grabReport = grabActual !== null ? grabActual : grabExpected;
  const pandaReport = pandaActual !== null ? pandaActual : pandaExpected;
  const shopeeReport = shopeeActual !== null ? shopeeActual : shopeeExpected;
  const lalamove = n(db.lalamove);

  const expenses = ((r as any).dayExpenses || []).map((e: any) => ({
    company: e.company || "未知商户",
    item: e.item || "杂物",
    amount: n(e.amount),
  }));
  const cashExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const ownerWithdrawal = n((r as any).ownerWithdrawal);
  const openingCash = n(r.openingCash);
  const cash = n(r.sales?.cash);

  const d = new Date(`${r.date}T00:00:00`);
  const weather = WEATHER_OPTIONS.find((o) => o.value === (r as any).weather);

  return {
    date: r.date,
    weekday: isNaN(d.getTime()) ? "" : `周${WEEKDAYS[d.getDay()]}`,
    weather: weather ? weather.label : "",
    netRevenue: n(r.sales?.total),
    storeHubTotal: n(r.sales?.storeHubTotal),
    cash,
    tng: n(r.sales?.tng),
    debit: n(r.sales?.duitnow),
    credit: n(r.sales?.card),
    amex: n(r.sales?.amex),
    grab: { gross: grabGross, net: grabNet, ads: grabAds, expected: grabExpected, actual: grabActual, report: grabReport },
    panda: { gross: pandaGross, net: pandaNet, ads: pandaAds, expected: pandaExpected, actual: pandaActual, report: pandaReport },
    shopee: { gross: shopeeGross, net: shopeeNet, ads: shopeeAds, expected: shopeeExpected, actual: shopeeActual, report: shopeeReport },
    lalamove,
    totalDelivery: grabReport + pandaReport + shopeeReport + lalamove,
    openingCash,
    cashExpenses,
    ownerWithdrawal,
    expectedCash: openingCash + cash - ownerWithdrawal - cashExpenses,
    closingCash: n(r.closingCash),
    variance: n(r.variance),
    varianceReason: r.varianceReason || "",
    submittedBy: r.submittedBy || "",
    expenses,
    ops: getOps(r),
    avgPerPax: perPax(n(r.sales?.storeHubTotal), getOps(r)),
    avgPerBill: perBill(n(r.sales?.storeHubTotal), getOps(r)),
  };
};

// ---------------------------------------------------------------- 样式工具

const BLACK = "FF111111";
const GOLD = "FFFFD200";
const MONEY = '#,##0.00;[Red]-#,##0.00;"-"';
const thin = { style: "thin" as const, color: { argb: "FFD9D9D9" } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

function titleBlock(ws: ExcelJSNS.Worksheet, cols: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Arial", size: 14, bold: true, color: { argb: GOLD } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLACK } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF666666" } };
  s.alignment = { indent: 1 };
}

function headerRow(ws: ExcelJSNS.Worksheet, rowNo: number, headers: string[]) {
  const row = ws.getRow(rowNo);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = allBorders;
  });
  row.height = 32;
}

function styleBody(ws: ExcelJSNS.Worksheet, from: number, to: number, cols: number, moneyCols: number[]) {
  for (let r = from; r <= to; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 10, ...(cell.font || {}) };
      cell.border = allBorders;
      if (moneyCols.includes(c)) {
        cell.numFmt = MONEY;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (!cell.alignment) {
        cell.alignment = { vertical: "middle" };
      }
      if ((r - from) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7FB" } };
      }
    }
  }
}

/** 合计列：同时写公式 + 算好的结果（iPhone「文件」预览不会重算公式） */
function totalRow(ws: ExcelJSNS.Worksheet, rowNo: number, cols: number, label: string, labelCol: number, sumCols: number[], from: number, to: number) {
  const row = ws.getRow(rowNo);
  row.getCell(labelCol).value = label;
  sumCols.forEach((c) => {
    let result = 0;
    for (let r = from; r <= to; r++) {
      const v = ws.getRow(r).getCell(c).value;
      if (typeof v === "number") result += v;
    }
    const letter = ws.getColumn(c).letter;
    row.getCell(c).value = to >= from ? { formula: `SUM(${letter}${from}:${letter}${to})`, result: r2(result) } : 0;
    row.getCell(c).numFmt = MONEY;
  });
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4B3" } };
    cell.border = { ...allBorders, top: { style: "medium", color: { argb: BLACK } } };
    if (sumCols.includes(c)) cell.alignment = { horizontal: "right" };
  }
  row.height = 22;
}

// ---------------------------------------------------------------- 主函数

export async function exportSettlementsExcel(
  records: SettlementRecord[],
  opts: { from: string; to: string; storeName?: string },
) {
  const store = opts.storeName || "Kim Lian Kee (Kepong)";
  const generated = new Date().toLocaleString("en-GB");
  const rangeText = opts.from === opts.to ? opts.from : `${opts.from} ~ ${opts.to}`;
  const figs = [...records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(getSettlementFigures);

  const wb = new (await loadExcelJS()).Workbook();
  wb.creator = "御膳智控 ERP";
  wb.created = new Date();

  // ==================== 1. 每日汇总 ====================
  {
    const headers = [
      "日期 Date", "星期", "天气",
      "总营业额 Net Revenue", "店内实收 In-Store",
      "现金 Cash", "TNG", "Debit Card", "Credit Card", "Amex",
      "GrabFood", "FoodPanda", "ShopeeFood", "Lalamove", "外卖合计 Delivery",
      "开班备用金 Opening", "现金支出 Expenses", "业主提支 Drawings",
      "应余 Expected", "实点 Actual", "差异 Variance", "差异原因", "提交人",
      "人数 Pax", "单数 Bills", "人均 Avg/Pax", "单均 Avg/Bill", "VIP 新会员", "到店 VIP", "WA 新加入", "WA 订单",
    ];
    const ws = wb.addWorksheet("每日汇总", {
      views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = headers.map((_, i) => ({ width: i === 0 ? 12 : i <= 2 ? 7 : i === 21 ? 24 : i >= 23 ? 10 : 12 }));
    titleBlock(ws, headers.length, `${store} — 每日结算汇总 Daily Settlement ${rangeText}`, `导出时间 ${generated} · 共 ${figs.length} 天 · 金额单位 RM · 外卖为「挤干水分」后金额（已核对的按实际到账）`);
    headerRow(ws, 3, headers);
    figs.forEach((f) => {
      const row = ws.addRow([
        f.date, f.weekday, f.weather,
        r2(f.netRevenue), r2(f.storeHubTotal),
        r2(f.cash), r2(f.tng), r2(f.debit), r2(f.credit), r2(f.amex),
        r2(f.grab.report), r2(f.panda.report), r2(f.shopee.report), r2(f.lalamove), r2(f.totalDelivery),
        r2(f.openingCash), r2(f.cashExpenses), r2(f.ownerWithdrawal),
        r2(f.expectedCash), r2(f.closingCash), r2(f.variance), f.varianceReason, f.submittedBy,
        f.ops.pax || "", f.ops.bills || "",
        f.avgPerPax === null ? "" : f.avgPerPax, f.avgPerBill === null ? "" : f.avgPerBill,
        f.ops.vipNew || "", f.ops.vipVisits || "", f.ops.waJoin || "", f.ops.waOrders || "",
      ]);
      if (f.variance !== 0) {
        row.getCell(21).font = { name: "Arial", size: 10, bold: true, color: { argb: f.variance < 0 ? "FFDC2626" : "FF16A34A" } };
      }
      if (f.weekday === "周六" || f.weekday === "周日") {
        row.getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: "FFB45309" } };
      }
    });
    const first = 4;
    const last = 3 + figs.length;
    const money = Array.from({ length: 18 }, (_, i) => i + 4); // D..U
    styleBody(ws, first, last, headers.length, [...money, 26, 27]);
    for (let r = first; r <= last; r++) {
      ws.getRow(r).getCell(4).font = { name: "Arial", size: 10, bold: true };
      [24, 25, 28, 29, 30, 31].forEach((c) => (ws.getRow(r).getCell(c).alignment = { horizontal: "right" }));
    }
    // 合计：备用金 / 应余 / 实点 是「每天的余额」，加总没有意义，不算
    const sumCols = money.filter((c) => ![16, 19, 20].includes(c));
    totalRow(ws, last + 1, headers.length, `合计 (${figs.length} 天)`, 1, [...sumCols, 24, 25, 28, 29, 30, 31], first, last);
    [24, 25, 28, 29, 30, 31].forEach((c) => (ws.getRow(last + 1).getCell(c).numFmt = "0"));
    // 人均 / 单均 合计：只算「有填人数 / 单数」的那几天，不是把每天的人均加起来
    {
      const paxDays = figs.filter((f) => f.ops.pax > 0);
      const billDays = figs.filter((f) => f.ops.bills > 0);
      const sumPax = paxDays.reduce((s, f) => s + f.ops.pax, 0);
      const sumBills = billDays.reduce((s, f) => s + f.ops.bills, 0);
      const tr = ws.getRow(last + 1);
      tr.getCell(26).value = sumPax > 0 ? r2(paxDays.reduce((s, f) => s + f.storeHubTotal, 0) / sumPax) : "";
      tr.getCell(27).value = sumBills > 0 ? r2(billDays.reduce((s, f) => s + f.storeHubTotal, 0) / sumBills) : "";
      [26, 27].forEach((c) => (tr.getCell(c).numFmt = MONEY));
    }
    if (figs.length > 0) {
      const avgRow = ws.getRow(last + 2);
      avgRow.getCell(1).value = "日均 Avg";
      [4, 5, 6, 15].forEach((c) => {
        const letter = ws.getColumn(c).letter;
        let s = 0;
        figs.forEach((_, i) => { s += Number(ws.getRow(first + i).getCell(c).value) || 0; });
        avgRow.getCell(c).value = { formula: `AVERAGE(${letter}${first}:${letter}${last})`, result: r2(s / figs.length) };
        avgRow.getCell(c).numFmt = MONEY;
      });
      for (let c = 1; c <= headers.length; c++) {
        avgRow.getCell(c).font = { name: "Arial", size: 10, italic: true, color: { argb: "FF6B7280" } };
      }
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
  }

  // ==================== 2. 月度汇总 ====================
  {
    const byMonth = new Map<string, SettlementFigures[]>();
    figs.forEach((f) => {
      const m = f.date.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(f);
    });
    const headers = [
      "月份 Month", "天数", "总营业额", "日均营业额", "店内实收",
      "现金", "TNG", "Debit", "Credit", "Amex",
      "外卖合计", "现金支出", "业主提支", "差异合计", "有差异的天数",
      "人数", "人均消费", "单数", "单均", "VIP 新会员", "到店 VIP", "WA 新加入", "WA 订单",
    ];
    const ws = wb.addWorksheet("月度汇总", {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = headers.map((_, i) => ({ width: i === 0 ? 12 : i === 1 || i === 14 ? 8 : 13 }));
    titleBlock(ws, headers.length, `${store} — 月度汇总 Monthly Summary ${rangeText}`, "由「每日汇总」按月份加总");
    headerRow(ws, 3, headers);
    const sum = (list: SettlementFigures[], f: (x: SettlementFigures) => number) => r2(list.reduce((s, x) => s + f(x), 0));
    Array.from(byMonth.keys()).sort().forEach((m) => {
      const list = byMonth.get(m)!;
      const total = sum(list, (x) => x.netRevenue);
      ws.addRow([
        m, list.length, total, r2(total / list.length), sum(list, (x) => x.storeHubTotal),
        sum(list, (x) => x.cash), sum(list, (x) => x.tng), sum(list, (x) => x.debit), sum(list, (x) => x.credit), sum(list, (x) => x.amex),
        sum(list, (x) => x.totalDelivery), sum(list, (x) => x.cashExpenses), sum(list, (x) => x.ownerWithdrawal),
        sum(list, (x) => x.variance), list.filter((x) => x.variance !== 0).length,
        ...(() => {
          const paxDays = list.filter((x) => x.ops.pax > 0);
          const billDays = list.filter((x) => x.ops.bills > 0);
          const pax = paxDays.reduce((s2, x) => s2 + x.ops.pax, 0);
          const bills = billDays.reduce((s2, x) => s2 + x.ops.bills, 0);
          return [
            pax || "", pax > 0 ? r2(paxDays.reduce((s2, x) => s2 + x.storeHubTotal, 0) / pax) : "",
            bills || "", bills > 0 ? r2(billDays.reduce((s2, x) => s2 + x.storeHubTotal, 0) / bills) : "",
            list.reduce((s2, x) => s2 + x.ops.vipNew, 0) || "",
            list.reduce((s2, x) => s2 + x.ops.vipVisits, 0) || "",
            list.reduce((s2, x) => s2 + x.ops.waJoin, 0) || "",
            list.reduce((s2, x) => s2 + x.ops.waOrders, 0) || "",
          ];
        })(),
      ]);
    });
    const first = 4;
    const last = 3 + byMonth.size;
    const money = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    styleBody(ws, first, last, headers.length, [...money, 17, 19]);
    if (byMonth.size > 1) {
      totalRow(ws, last + 1, headers.length, "合计", 1, money.filter((c) => c !== 4), first, last);
    }
  }

  // ==================== 3. 现金支出明细 ====================
  {
    const headers = ["日期 Date", "星期", "商户 Company", "项目 Item", "金额 Amount"];
    const ws = wb.addWorksheet("现金支出明细", {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 12 }, { width: 7 }, { width: 28 }, { width: 30 }, { width: 14 }];
    titleBlock(ws, headers.length, `${store} — 钱箱现金支出明细 Cash Expenses ${rangeText}`, "结算时从钱箱拿出去的现金（不含业主提支）");
    headerRow(ws, 3, headers);
    let count = 0;
    figs.forEach((f) => f.expenses.forEach((e) => {
      ws.addRow([f.date, f.weekday, e.company, e.item, r2(e.amount)]);
      count++;
    }));
    const first = 4;
    const last = 3 + count;
    styleBody(ws, first, last, headers.length, [5]);
    totalRow(ws, last + 1, headers.length, `合计 (${count} 笔)`, 1, [5], first, last);

    // 业主提支另列，方便对账
    const withdrawals = figs.filter((f) => f.ownerWithdrawal > 0);
    if (withdrawals.length > 0) {
      const w0 = last + 4;
      ws.getCell(w0, 1).value = "业主提支 Owner's Drawings";
      ws.getCell(w0, 1).font = { name: "Arial", size: 11, bold: true };
      withdrawals.forEach((f, i) => {
        const r = w0 + 1 + i;
        ws.getCell(r, 1).value = f.date;
        ws.getCell(r, 2).value = f.weekday;
        ws.getCell(r, 5).value = r2(f.ownerWithdrawal);
        ws.getCell(r, 5).numFmt = MONEY;
        [1, 2, 3, 4, 5].forEach((c) => (ws.getCell(r, c).border = allBorders));
      });
      const tr = w0 + 1 + withdrawals.length;
      totalRow(ws, tr, headers.length, `提支合计 (${withdrawals.length} 天)`, 1, [5], w0 + 1, tr - 1);
    }
  }

  // ==================== 4. 外卖明细 ====================
  {
    const headers = ["日期 Date", "星期", "平台 Platform", "Gross", "Net", "Ads", "预期到账 Expected", "实际到账 Actual", "差额", "状态"];
    const ws = wb.addWorksheet("外卖明细", {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 12 }, { width: 7 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 10 }];
    titleBlock(ws, headers.length, `${store} — 外卖平台明细 Delivery ${rangeText}`, "预期到账 = Net − Ads；已核对的以实际到账为准");
    headerRow(ws, 3, headers);
    let count = 0;
    figs.forEach((f) => {
      const rows: [string, SettlementFigures["grab"]][] = [
        ["GrabFood", f.grab],
        ["FoodPanda", f.panda],
        ["ShopeeFood", f.shopee],
      ];
      rows.forEach(([name, p]) => {
        if (!(p.gross > 0 || p.net > 0 || p.actual !== null)) return;
        const row = ws.addRow([
          f.date, f.weekday, name, r2(p.gross), r2(p.net), r2(p.ads), r2(p.expected),
          p.actual !== null ? r2(p.actual) : "",
          p.actual !== null ? r2(p.actual - p.expected) : "",
          p.actual !== null ? "✅ 已核对" : "待核对",
        ]);
        if (p.actual === null) row.getCell(10).font = { name: "Arial", size: 10, color: { argb: "FFB45309" } };
        count++;
      });
      if (f.lalamove > 0) {
        ws.addRow([f.date, f.weekday, "Lalamove", r2(f.lalamove), r2(f.lalamove), 0, r2(f.lalamove), "", "", "—"]);
        count++;
      }
    });
    const first = 4;
    const last = 3 + count;
    styleBody(ws, first, last, headers.length, [4, 5, 6, 7, 8, 9]);
    totalRow(ws, last + 1, headers.length, `合计 (${count} 笔)`, 1, [4, 5, 6, 7, 8, 9], first, last);
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
  }

  // ==================== 下载 ====================
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `KLK_Settlement_${opts.from}_to_${opts.to}.xlsx`;
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  // 📱 iPhone（尤其是加到主画面的 App）<a download> 常常没反应 → 用系统分享表单（存到「文件」或传 WhatsApp）
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  try {
    const file = new File([blob], filename, { type: blob.type });
    const nav = navigator as any;
    if (isIOS && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    console.warn("Share failed, fallback to download", err);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
