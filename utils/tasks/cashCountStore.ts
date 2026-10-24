// 收银点钱：资料存取（cash_counts，新集合；V1 不读）
import { collection, doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { Employee } from '../../types';
import { cashCountId, cashTotalSen, type CashCountRecord, type CashCounts, type CashSide } from './cashCount';
import type { StaffTask } from './staffTaskLogic';

const COL = 'cash_counts';
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

export const getCashCount = async (date: string, taskId: string): Promise<CashCountRecord | null> => {
    const snap = await getDoc(doc(db, COL, cashCountId(date, taskId)));
    return snap.exists() ? (snap.data() as CashCountRecord) : null;
};

const side = (counts: CashCounts, actor: Employee): CashSide => ({ counts, totalSen: cashTotalSen(counts), by: actor.id, byName: actor.name, at: new Date().toISOString() });

/** 上班点钱：下班还没点之前可以重新保存（以最后一次为准） */
export const saveOpening = (task: StaffTask, actor: Employee, date: string, counts: CashCounts) => runTransaction(db, async tx => {
    const ref = doc(db, COL, cashCountId(date, task.id));
    const cur = (await tx.get(ref)).data() as CashCountRecord | undefined;
    if (cur?.closing) throw new Error('今天已经收班，不能再改上班金额');
    const rec: CashCountRecord = { id: cashCountId(date, task.id), taskId: task.id, taskTitle: task.title, date, opening: side(counts, actor) };
    tx.set(ref, clean(rec));
    return rec;
});

/** 下班点钱：要先有上班金额 */
export const saveClosing = (task: StaffTask, actor: Employee, date: string, counts: CashCounts) => runTransaction(db, async tx => {
    const ref = doc(db, COL, cashCountId(date, task.id));
    const cur = (await tx.get(ref)).data() as CashCountRecord | undefined;
    if (!cur?.opening) throw new Error('请先点上班的金额');
    const closing = side(counts, actor);
    const rec: CashCountRecord = { ...cur, closing, diffSen: closing.totalSen - cur.opening.totalSen };
    tx.set(ref, clean(rec));
    return rec;
});

/** 管理层：这个任务的点钱记录（新到旧，最近 31 天） */
export const listCashCounts = async (taskId: string) => {
    const snap = await getDocs(query(collection(db, COL), where('taskId', '==', taskId)));
    return snap.docs.map(d => d.data() as CashCountRecord).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31);
};
