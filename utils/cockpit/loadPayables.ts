// ============================================================================
// 预警中心 · 未付应付账款读取（只读）
// 与老板首页相同的查询：standalone_expenses 中 paymentStatus 为 UNPAID / PARTIAL。
// 一律向伺服器读取，离线时报错，不用可能不完整的快取判断逾期。
// ============================================================================
import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { PayableLike } from '../apDueDate';

const TIMEOUT_MS = 20000;

export const loadUnpaidPayables = async (): Promise<PayableLike[]> => {
    const read = getDocsFromServer(query(collection(db, 'standalone_expenses'), where('paymentStatus', 'in', ['UNPAID', 'PARTIAL'])));
    const snap = await Promise.race([
        read,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('读取逾时，请检查网络')), TIMEOUT_MS)),
    ]);
    return snap.docs.map(d => {
        const x = d.data() as Record<string, unknown>;
        return {
            id: d.id,
            dueDate: x.dueDate,
            time: x.time,
            amount: Number(x.amount) || 0,
            outstandingAmount: x.outstandingAmount === undefined || x.outstandingAmount === null ? undefined : Number(x.outstandingAmount) || 0,
            totalBillAmount: x.totalBillAmount === undefined || x.totalBillAmount === null ? undefined : Number(x.totalBillAmount) || 0,
            company: typeof x.company === 'string' ? x.company : undefined,
            category: typeof x.category === 'string' ? x.category : undefined,
            invoiceRef: typeof x.invoiceRef === 'string' ? x.invoiceRef : undefined,
        };
    });
};
