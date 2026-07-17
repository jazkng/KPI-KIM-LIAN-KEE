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
