/**
 * Utility functions for date manipulation with Asia/Kuala_Lumpur (Malaysia) timezone.
 */

export function getMalaysiaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getBusinessDateString(date: Date = new Date()): string {
  const msiaStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).format(date);
  
  const parts = msiaStr.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+)/);
  if (!parts) {
    return getMalaysiaDateString(date);
  }
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const year = parseInt(parts[3], 10);
  const hour = parseInt(parts[4], 10);
  
  const msiaDate = new Date(year, month - 1, day);
  if (hour < 4) {
    msiaDate.setDate(msiaDate.getDate() - 1);
  }
  
  const y = msiaDate.getFullYear();
  const m = String(msiaDate.getMonth() + 1).padStart(2, '0');
  const d = String(msiaDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


/**
 * 账目日期 → 马来西亚日历日（YYYY-MM-DD）。
 * 带时区的 ISO 时间（…Z / +08:00）先换成马来西亚时间再取日期；没有时区的字串（本地时间或纯日期）原样取前 10 位。
 * 盈亏报表判断「属于哪一天 / 哪个月」一律用这个，避免 UTC 晚上 4 点后的账单被算到前一天（月底就变成上个月）。
 */
export function toMalaysiaDay(value: unknown): string {
  const s = String(value || '');
  if (/T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}
