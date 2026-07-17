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

