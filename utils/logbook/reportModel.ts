import type { LogEntry } from '../../types';

export const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const validLogRange = (start: string, end: string) => /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end;
export type LogReportFilter = 'ALL' | 'HIGH_PRIORITY' | 'COMPLAINT';
export const filterLogReport = (logs: LogEntry[], start: string, end: string, filter: LogReportFilter) => {
    if (!validLogRange(start, end)) throw new Error('请选择有效的起止日期。');
    return logs.filter(log => log.date >= start && log.date <= end
        && (filter !== 'HIGH_PRIORITY' || log.priority === 'HIGH')
        && (filter !== 'COMPLAINT' || log.category === 'COMPLAINT'))
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
};
export const logReportSummary = (logs: LogEntry[]) => ({ total: logs.length, open: logs.filter(l => l.status !== 'RESOLVED').length, urgent: logs.filter(l => l.priority === 'HIGH').length, complaints: logs.filter(l => l.category === 'COMPLAINT').length });

export const logReportSections = (logs: LogEntry[]) => logs.flatMap((log, index) => {
    const text = [`问题：${log.issue || '未填写'}`, `处理：${log.action || '未填写'}`,
        ...(log.replies || []).map(reply => `跟进：${reply.content || ''}`)].join('\n\n');
    const chars = Array.from(text);
    const chunks: string[] = [];
    let chunk = '', breaks = 0;
    for (const char of chars) {
        chunk += char; if (char === '\n') breaks++;
        if (Array.from(chunk).length >= 500 || breaks >= 12) { chunks.push(chunk); chunk = ''; breaks = 0; }
    }
    if (chunk) chunks.push(chunk);
    return chunks.map((body, part) => ({ log, number: index + 1, part: part + 1, parts: chunks.length, body }));
});
