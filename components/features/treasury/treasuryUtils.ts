export const generateMonthsRange = (
  startMonth: string,
  endMonth: string,
): string[] => {
  const list: string[] = [];
  let [sY, sM] = startMonth.split("-").map(Number);
  const [eY, eM] = endMonth.split("-").map(Number);

  while (sY < eY || (sY === eY && sM <= eM)) {
    list.push(`${sY}-${String(sM).padStart(2, "0")}`);
    sM++;
    if (sM > 12) {
      sM = 1;
      sY++;
    }
  }
  return list;
};

export const formatMoney = (n: number): string =>
  `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
};

export const getMonthLabel = (monthStr: string): string => {
  if (!monthStr || monthStr.length < 7) return "";
  const [year, month] = monthStr.split("-");
  return `${year}年${month}月`;
};

export const getPreviousMonth = (monthStr: string): string => {
  if (!monthStr || !monthStr.includes("-")) return monthStr;
  let [year, month] = monthStr.split("-").map(Number);
  month--;
  if (month < 1) {
    month = 12;
    year--;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
};

export const getNextMonth = (monthStr: string): string => {
  if (!monthStr || !monthStr.includes("-")) return monthStr;
  let [year, month] = monthStr.split("-").map(Number);
  month++;
  if (month > 12) {
    month = 1;
    year++;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
};

export const normalizeShareholderName = (id: string, name: string): string => {
  const map: Record<string, string> = {
    "001": "Ben",
    "002": "Jake",
    "003": "Jeffrey",
  };
  return map[id] || name || "Shareholder";
};

export const cleanTransactionNote = (note?: string): string => {
  if (!note) return "";
  return note.trim().replace(/\s+/g, " ");
};

export const calculatePercentage = (value: number, total: number): number => {
  if (!total) return 0;
  return (value / total) * 100;
};

// 👑 对账用 CSV 生成器 (LedgerModal 单月导出 与 区间导出 共用同一份逻辑)
// 注意：期初结转 (INIT) 是显示用虚拟行，不是真实交易，一律排除。
export const buildLedgerCsv = (
  items: Array<{
    id?: string;
    date?: string;
    desc?: string;
    category?: string;
    account?: string;
    type: "IN" | "OUT";
    amount: number;
  }>,
  defaultAccount: string,
): { csv: string; count: number; totalIn: number; totalOut: number } => {
  const realItems = items.filter(
    (item) => item.category !== "INIT" && item.id !== "init",
  );

  const escapeCsv = (val: any) => {
    const s = val === undefined || val === null ? "" : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const sorted = [...realItems].sort((a, b) =>
    (a.date || "").localeCompare(b.date || ""),
  );

  const header = [
    "日期 Date",
    "摘要 Description",
    "分类 Category",
    "账户 Account",
    "方向 Type",
    "流入 In",
    "流出 Out",
    "金额 Amount",
    "记录ID Ref",
  ];

  const rows: string[][] = sorted.map((item) => [
    item.date || "",
    item.desc || "",
    item.category || "",
    item.account || defaultAccount,
    item.type,
    item.type === "IN" ? item.amount.toFixed(2) : "",
    item.type === "OUT" ? item.amount.toFixed(2) : "",
    item.amount.toFixed(2),
    item.id || "",
  ]);

  const totalIn = sorted
    .filter((i) => i.type === "IN")
    .reduce((a, b) => a + b.amount, 0);
  const totalOut = sorted
    .filter((i) => i.type === "OUT")
    .reduce((a, b) => a + b.amount, 0);

  rows.push([]);
  rows.push([
    "合计 TOTAL (不含期初结转)",
    "",
    "",
    "",
    "",
    totalIn.toFixed(2),
    totalOut.toFixed(2),
    (totalIn - totalOut).toFixed(2),
    "",
  ]);

  const csv = [header, ...rows]
    .map((r) => r.map(escapeCsv).join(","))
    .join("\r\n");

  return { csv, count: sorted.length, totalIn, totalOut };
};

// 触发浏览器下载 CSV (BOM 确保 Excel 中文不乱码)
export const downloadCsv = (csvBody: string, filename: string): void => {
  const blob = new Blob(["\uFEFF" + csvBody], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
