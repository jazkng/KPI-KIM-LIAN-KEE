import { collection, getDocs, limit, orderBy, query, startAfter, where, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { LogEntry } from '../../types';
import { validLogRange } from './reportModel';

export const readLogDateRange = async (db: Firestore, start: string, end: string): Promise<LogEntry[]> => {
    if (!validLogRange(start, end)) throw new Error('请选择有效的起止日期。');
    const base = [where('date', '>=', start), where('date', '<=', end), orderBy('date', 'desc')];
    const rows: LogEntry[] = [];
    let cursor: QueryDocumentSnapshot | undefined;
    for (;;) {
        const snapshot = await getDocs(query(collection(db, 'logs'), ...base, ...(cursor ? [startAfter(cursor)] : []), limit(100)));
        rows.push(...snapshot.docs.map(item => ({ ...item.data(), id: item.data().id || item.id } as LogEntry)));
        if (rows.length > 2000) throw new Error('所选范围超过 2000 条，请缩短日期后导出，避免遗漏。');
        if (snapshot.size < 100) return rows;
        cursor = snapshot.docs[snapshot.docs.length - 1];
    }
};
