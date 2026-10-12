import { loadExcelJS } from '../../../utils/lazyLibs';
import type ExcelJSNS from 'exceljs';
import type { Employee, ExpenseItem } from "../../../types";

/**
 * 📊 薪资结算 Excel 导出
 *
 * 一个档案 5 张表：
 *   1. 薪资总表        —— 每人收入 / 扣款 / 法定缴款 / 实发 / 付款方式
 *   2. 银行转账清单    —— 只列银行转账的人：银行、户口、金额（给网银批量转账对照用）
 *   3. 现金签收表      —— 只列现金的人 + 签名栏，打印出来给员工签
 *   4. 政府缴纳明细    —— KWSP / PERKESO(SOCSO+EIS+LINDUNG) / LHDN(PCB) 分项合计
 *   5. 兼职明细        —— 当月每一笔兼职工资
 *
 * 纯前端产生，不多读一次 Firestore（用的都是画面上已经载入的资料）。
 */

export interface PayrollExportRow {
  emp: Employee;
  department: string;
  isLocal: boolean;
  entry: {
    basic: number;
    allowance: number;
    extraSubsidy: number;
    ot: number;
    bonus: number;
    otherEarning: number;
    latePenaltyDeducted: number;
    unpaidLeave: number;
    hostelFee: number;
    advanceLoan: number;
    loanRepay: number;
    otherDeduction: number;
    ee_epf: number;
    ee_socso: number;
    ee_eis: number;
    ee_lindung: number;
    ee_pcb: number;
    er_epf: number;
    er_socso: number;
    er_eis: number;
    paymentMethod: "BANK" | "CASH";
    isPaid: boolean;
    paidAt?: string;
    workDays?: number;
    note?: string;
  };
  totals: {
    gross: number;
    deductions: number;
    netPay: number;
    employerCost: number;
    totalCompanyCost: number;
    totalGovtPay: number;
  };
}

export interface PayrollExportInput {
  month: string; // YYYY-MM
  storeName?: string;
  paymentDate?: string;
  rows: PayrollExportRow[];
  partTime: ExpenseItem[];
}

const BLACK = "FF111111";
const GOLD = "FFFFD200";
const MONEY = '#,##0.00;[Red]-#,##0.00;"-"';

const thin = { style: "thin" as const, color: { argb: "FFD9D9D9" } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

function titleBlock(ws: ExcelJSNS.Worksheet, colCount: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, colCount);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Arial", size: 14, bold: true, color: { argb: GOLD } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLACK } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, colCount);
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

function styleBody(ws: ExcelJSNS.Worksheet, fromRow: number, toRow: number, colCount: number, moneyCols: number[]) {
  for (let r = fromRow; r <= toRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 10, ...(cell.font || {}) };
      cell.border = allBorders;
      if (moneyCols.includes(c)) {
        cell.numFmt = MONEY;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (!cell.alignment) {
        cell.alignment = { vertical: "middle" };
      }
    }
    if ((r - fromRow) % 2 === 1) {
      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7FB" } };
      }
    }
  }
}

function totalRow(ws: ExcelJSNS.Worksheet, rowNo: number, colCount: number, label: string, labelCol: number, sumCols: number[], fromRow: number, toRow: number) {
  const row = ws.getRow(rowNo);
  row.getCell(labelCol).value = label;
  sumCols.forEach((c) => {
    const letter = ws.getColumn(c).letter;
    // 👑 同时写入公式 + 算好的结果：iPhone「文件」预览不会重新计算公式，没结果会显示空白
    let result = 0;
    for (let r = fromRow; r <= toRow; r++) {
      const v = ws.getRow(r).getCell(c).value;
      if (typeof v === "number") result += v;
    }
    result = Math.round(result * 100) / 100;
    row.getCell(c).value = toRow >= fromRow
      ? { formula: `SUM(${letter}${fromRow}:${letter}${toRow})`, result }
      : 0;
    row.getCell(c).numFmt = MONEY;
  });
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4B3" } };
    cell.border = { ...allBorders, top: { style: "medium", color: { argb: BLACK } } };
    if (sumCols.includes(c)) cell.alignment = { horizontal: "right" };
  }
  row.height = 22;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function exportPayrollExcel(input: PayrollExportInput) {
  const { month, rows, partTime } = input;
  const store = input.storeName || "Kim Lian Kee (Kepong)";
  const generated = new Date().toLocaleString("en-GB");

  const wb = new (await loadExcelJS()).Workbook();
  wb.creator = "御膳智控 ERP";
  wb.created = new Date();

  const sortedRows = [...rows].sort(
    (a, b) => a.department.localeCompare(b.department) || (a.emp.name || "").localeCompare(b.emp.name || ""),
  );

  // ==================== 1. 薪资总表 ====================
  {
    const headers = [
      "#", "姓名 Name", "部门 Dept", "本地/外劳",
      "底薪 Basic", "津贴 Allow.", "补贴 Subsidy", "加班 OT", "奖金 Bonus", "其他收入 Other",
      "总收入 Gross",
      "迟到 Late", "无薪假 Unpaid", "宿舍 Hostel", "预支 Advance", "欠款扣回 Loan", "其他扣 Other",
      "EPF (员工)", "SOCSO (员工)", "EIS (员工)", "LINDUNG 24J", "PCB",
      "总扣 Deduct", "实发 NET PAY",
      "EPF (公司)", "SOCSO (公司)", "EIS (公司)", "公司总成本 Cost",
      "付款方式 Method", "状态 Status",
    ];
    const ws = wb.addWorksheet("薪资总表", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = headers.map((_, i) => ({
      width: i === 0 ? 4 : i === 1 ? 22 : i === 2 ? 16 : i === 3 ? 8 : 11,
    }));
    titleBlock(ws, headers.length, `${store} — 薪资总表 Payroll Summary ${month}`, `导出时间 ${generated} · 付款日 ${input.paymentDate || "-"} · 金额单位 RM`);
    headerRow(ws, 3, headers);

    sortedRows.forEach((r, i) => {
      const e = r.entry;
      ws.addRow([
        i + 1, r.emp.name, r.department, r.isLocal ? "本地" : "外劳",
        r2(e.basic), r2(e.allowance), r2(e.extraSubsidy), r2(e.ot), r2(e.bonus), r2(e.otherEarning),
        r2(r.totals.gross),
        r2(e.latePenaltyDeducted), r2(e.unpaidLeave), r2(e.hostelFee), r2(e.advanceLoan), r2(e.loanRepay), r2(e.otherDeduction),
        r2(e.ee_epf), r2(e.ee_socso), r2(e.ee_eis), r2(e.ee_lindung), r2(e.ee_pcb),
        r2(r.totals.deductions), r2(r.totals.netPay),
        r2(e.er_epf), r2(e.er_socso), r2(e.er_eis), r2(r.totals.totalCompanyCost),
        e.paymentMethod === "CASH" ? "现金 Cash" : "银行 Bank",
        e.isPaid ? "已发 Paid" : "未发 Unpaid",
      ]);
    });
    const first = 4;
    const last = 3 + sortedRows.length;
    const moneyCols = Array.from({ length: 24 }, (_, i) => i + 5); // E..AB
    styleBody(ws, first, last, headers.length, moneyCols);
    for (let r = first; r <= last; r++) {
      ws.getRow(r).getCell(24).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF047857" } };
      ws.getRow(r).getCell(11).font = { name: "Arial", size: 10, bold: true };
    }
    totalRow(ws, last + 1, headers.length, `合计 TOTAL (${sortedRows.length} 人)`, 2, moneyCols, first, last);
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
  }

  // ==================== 2. 银行转账清单 ====================
  {
    const bankRows = sortedRows.filter((r) => r.entry.paymentMethod !== "CASH" && r.totals.netPay > 0);
    const headers = ["#", "姓名 Beneficiary Name", "银行 Bank", "户口号码 Account No.", "IC / Passport", "金额 Amount (RM)", "Reference", "状态 Status"];
    const ws = wb.addWorksheet("银行转账清单", {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 4 }, { width: 28 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 12 }];
    titleBlock(ws, headers.length, `${store} — 银行转账清单 Bank Transfer List ${month}`, "只列付款方式 = 银行的员工。户口号码以文字格式保存，开头的 0 不会不见。");
    headerRow(ws, 3, headers);
    bankRows.forEach((r, i) => {
      const row = ws.addRow([
        i + 1,
        r.emp.name,
        r.emp.bankName || "⚠️ 未填",
        r.emp.bankAccount || "⚠️ 未填",
        r.emp.icNumber || r.emp.passportNo || "",
        r2(r.totals.netPay),
        `SALARY ${month}`,
        r.entry.isPaid ? "已发" : "未发",
      ]);
      row.getCell(4).numFmt = "@";
      if (!r.emp.bankAccount || !r.emp.bankName) {
        [3, 4].forEach((c) => (row.getCell(c).font = { name: "Arial", size: 10, bold: true, color: { argb: "FFDC2626" } }));
      }
    });
    const first = 4;
    const last = 3 + bankRows.length;
    styleBody(ws, first, last, headers.length, [6]);
    totalRow(ws, last + 1, headers.length, `合计 (${bankRows.length} 人)`, 2, [6], first, last);
  }

  // ==================== 3. 现金签收表 ====================
  {
    const cashRows = sortedRows.filter((r) => r.entry.paymentMethod === "CASH" && r.totals.netPay > 0);
    const headers = ["#", "姓名 Name", "部门 Dept", "实发 Net Pay (RM)", "签收日期 Date", "员工签名 Signature"];
    const ws = wb.addWorksheet("现金签收表", {
      pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 4 }, { width: 26 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 30 }];
    titleBlock(ws, headers.length, `${store} — 现金薪资签收表 Cash Salary Acknowledgement ${month}`, "员工领取现金时请当面点清并签名。I acknowledge receipt of the amount stated.");
    headerRow(ws, 3, headers);
    cashRows.forEach((r, i) => {
      const row = ws.addRow([i + 1, r.emp.name, r.department, r2(r.totals.netPay), "", ""]);
      row.height = 34;
    });
    const first = 4;
    const last = 3 + cashRows.length;
    styleBody(ws, first, last, headers.length, [4]);
    totalRow(ws, last + 1, headers.length, `合计 (${cashRows.length} 人)`, 2, [4], first, last);
    const sig = last + 4;
    ws.getCell(sig, 2).value = "发放人 Paid by: ____________________";
    ws.getCell(sig, 5).value = "核准 Approved by: ____________________";
    ws.getCell(sig, 2).font = { name: "Arial", size: 10 };
    ws.getCell(sig, 5).font = { name: "Arial", size: 10 };
  }

  // ==================== 4. 政府缴纳明细 ====================
  {
    const headers = [
      "#", "姓名 Name", "IC / Passport", "EPF No.", "SOCSO No.", "本地/外劳", "缴款工资 Wage",
      "EPF 员工", "EPF 公司", "SOCSO 员工", "SOCSO 公司", "EIS 员工", "EIS 公司", "LINDUNG 24J (员工)", "PCB",
      "合计 Total",
    ];
    const ws = wb.addWorksheet("政府缴纳明细", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = headers.map((_, i) => ({ width: i === 0 ? 4 : i === 1 ? 28 : i <= 4 ? 18 : 12 }));
    titleBlock(ws, headers.length, `${store} — 政府缴纳明细 Statutory Contributions ${month}`, "KWSP → i-Akaun Majikan ｜ PERKESO (SOCSO + EIS + LINDUNG 24 Jam) → ASSIST ｜ PCB → e-PCB Plus. LINDUNG 24 Jam 由员工全额承担，公司 0。");
    headerRow(ws, 3, headers);
    const govRows = sortedRows.filter(
      (r) => r.totals.totalGovtPay > 0,
    );
    govRows.forEach((r, i) => {
      const e = r.entry;
      const row = ws.addRow([
        i + 1, r.emp.name, r.emp.icNumber || r.emp.passportNo || "", r.emp.epfNo || "", r.emp.socsoNo || "",
        r.isLocal ? "本地" : "外劳",
        r2(Math.max(0, e.basic - e.unpaidLeave)),
        r2(e.ee_epf), r2(e.er_epf), r2(e.ee_socso), r2(e.er_socso), r2(e.ee_eis), r2(e.er_eis), r2(e.ee_lindung), r2(e.ee_pcb),
        r2(r.totals.totalGovtPay),
      ]);
      [3, 4, 5].forEach((c) => (row.getCell(c).numFmt = "@"));
    });
    const first = 4;
    const last = 3 + govRows.length;
    const moneyCols = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    styleBody(ws, first, last, headers.length, moneyCols);
    totalRow(ws, last + 1, headers.length, `合计 (${govRows.length} 人)`, 2, moneyCols, first, last);

    // 按机构汇总 —— 直接对照各缴款网站要付的数
    const sum = (f: (r: PayrollExportRow) => number) => r2(govRows.reduce((s, r) => s + (Number(f(r)) || 0), 0));
    const epf = sum((r) => r.entry.ee_epf + r.entry.er_epf);
    const socso = sum((r) => r.entry.ee_socso + r.entry.er_socso);
    const eis = sum((r) => r.entry.ee_eis + r.entry.er_eis);
    const lindung = sum((r) => r.entry.ee_lindung);
    const pcb = sum((r) => r.entry.ee_pcb);
    const s0 = last + 3;
    const summary: [string, string, number][] = [
      ["KWSP (EPF)", "i-Akaun Majikan", epf],
      ["PERKESO — SOCSO", "ASSIST", socso],
      ["PERKESO — EIS / SIP", "ASSIST", eis],
      ["PERKESO — LINDUNG 24 Jam", "ASSIST（员工全额）", lindung],
      ["LHDN — PCB / MTD", "e-PCB Plus", pcb],
      ["总计 Grand Total", "", r2(epf + socso + eis + lindung + pcb)],
    ];
    ws.getCell(s0, 2).value = "按机构汇总 By Agency";
    ws.getCell(s0, 2).font = { name: "Arial", size: 11, bold: true };
    summary.forEach(([name, portal, amt], i) => {
      const r = s0 + 1 + i;
      ws.getCell(r, 2).value = name;
      ws.getCell(r, 3).value = portal;
      ws.getCell(r, 4).value = amt;
      ws.getCell(r, 4).numFmt = MONEY;
      const isTotal = i === summary.length - 1;
      [2, 3, 4].forEach((c) => {
        const cell = ws.getCell(r, c);
        cell.border = allBorders;
        cell.font = { name: "Arial", size: 10, bold: isTotal };
        if (isTotal) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4B3" } };
      });
    });
  }

  // ==================== 5. 兼职明细 ====================
  {
    const headers = ["#", "日期 Date", "姓名 Name", "上班 In", "下班 Out", "工时 Hours", "时薪 Rate", "另加 Extra", "金额 Amount", "付款 Method", "来源 Source", "备注 Note"];
    const ws = wb.addWorksheet("兼职明细", {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 4 }, { width: 12 }, { width: 22 }, { width: 8 }, { width: 8 }, { width: 9 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 40 }];
    titleBlock(ws, headers.length, `${store} — 兼职明细 Part-Time Wages ${month}`, "兼职当天付现金；已算进财务报表人工成本。");
    headerRow(ws, 3, headers);
    const pts = [...partTime].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    pts.forEach((e, i) => {
      const pt = e.partTime;
      ws.addRow([
        i + 1,
        (e.time || "").slice(0, 10),
        e.company || "",
        pt?.clockIn || "",
        pt?.clockOut || "",
        pt ? Number(pt.hours) || 0 : "",
        pt ? r2(pt.rate) : "",
        pt?.extra ? r2(pt.extra) : "",
        r2(e.amount),
        (e.paymentMethod || "CASH").includes("CASH") ? "现金" : "银行",
        e.id.startsWith("parttime_") ? "兼职登记" : "应付账款(旧)",
        (e.note || "").replace(/^\[.*?\]\s*/, ""),
      ]);
    });
    const first = 4;
    const last = 3 + pts.length;
    styleBody(ws, first, last, headers.length, [7, 8, 9]);
    totalRow(ws, last + 1, headers.length, `合计 (${pts.length} 笔)`, 3, [6, 9], first, last);
    ws.getRow(last + 1).getCell(6).numFmt = "0.00";

    // 每人合计
    const byPerson: Record<string, { hours: number; amount: number; times: number }> = {};
    pts.forEach((e) => {
      const k = e.company || "—";
      byPerson[k] = byPerson[k] || { hours: 0, amount: 0, times: 0 };
      byPerson[k].hours += Number(e.partTime?.hours) || 0;
      byPerson[k].amount += Number(e.amount) || 0;
      byPerson[k].times += 1;
    });
    const p0 = last + 4;
    ws.getCell(p0, 3).value = "每人合计 By Person";
    ws.getCell(p0, 3).font = { name: "Arial", size: 11, bold: true };
    Object.entries(byPerson)
      .sort((a, b) => b[1].amount - a[1].amount)
      .forEach(([name, v], i) => {
        const r = p0 + 1 + i;
        ws.getCell(r, 3).value = name;
        ws.getCell(r, 5).value = `${v.times} 次`;
        ws.getCell(r, 6).value = r2(v.hours);
        ws.getCell(r, 9).value = r2(v.amount);
        ws.getCell(r, 9).numFmt = MONEY;
        [3, 5, 6, 9].forEach((c) => (ws.getCell(r, c).border = allBorders));
      });
  }

  // ==================== 下载 ====================
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `KLK_Payroll_${month}.xlsx`;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // 📱 iPhone 装成 App（主画面图示）时，<a download> 常常没反应 → 用系统分享表单（可存到「文件」或传 WhatsApp）
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
    if (err?.name === "AbortError") return; // 用户自己取消分享
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
