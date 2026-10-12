import { useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { Employee, ExpenseItem } from '../../../types';
import { DataManager } from '../../../utils/dataManager';

const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((out, key) => ({ ...out, [key]: v[key] }), {}) : v);

export function PartTimeCorrection({ expense, actor, onClose, onSaved }: {
  expense: ExpenseItem; actor?: Employee | null; onClose: () => void; onSaved: (value: ExpenseItem) => void;
}) {
  const [date, setDate] = useState(expense.time.slice(0, 10));
  const [hours, setHours] = useState(String(expense.partTime?.hours ?? ''));
  const [rate, setRate] = useState(String(expense.partTime?.rate ?? ''));
  const [extra, setExtra] = useState(String(expense.partTime?.extra ?? 0));
  const [directAmount, setDirectAmount] = useState(String(expense.amount));
  const [note, setNote] = useState(expense.partTime && expense.note?.startsWith('[Part-Time]') ? expense.note.split(' · ').slice(1).join(' · ') : expense.note || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = Math.round((expense.partTime ? Number(hours) * Number(rate) + Number(extra) : Number(directAmount)) * 100) / 100;
  const linkedBill = expense.paymentStatus !== 'PAID' || !!expense.isAdvancePayment || !!expense.creditNote || !!expense.categorySplits?.length || Number(expense.outstandingAmount || 0) > 0 || (expense.totalBillAmount != null && expense.totalBillAmount !== expense.amount);
  const valid = !linkedBill && !actor?.readOnlyAccess && !!actor?.id && /^\d{4}-\d{2}-\d{2}$/.test(date) && reason.trim().length > 0 && Number.isFinite(amount) && amount > 0 &&
    (!expense.partTime || (Number(hours) > 0 && Number(hours) <= 24 && Number(rate) >= 0 && Number(extra) >= 0));
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      const next: ExpenseItem = {
        ...expense, amount, totalBillAmount: expense.totalBillAmount == null ? undefined : amount, time: `${date}${expense.time.slice(10) || 'T12:00:00.000Z'}`, note: expense.partTime ? `[Part-Time] ${hours}h × RM${Number(rate).toFixed(2)} + RM${Number(extra).toFixed(2)}${note ? ` · ${note}` : ''}` : note,
        partTime: expense.partTime ? { ...expense.partTime, hours: Number(hours), rate: Number(rate), extra: Number(extra), clockIn: Number(hours) === expense.partTime.hours ? expense.partTime.clockIn : undefined, clockOut: Number(hours) === expense.partTime.hours ? expense.partTime.clockOut : undefined } : undefined,
      };
      const snapshot = (v: ExpenseItem) => DataManager.removeUndefined({ amount: v.amount, totalBillAmount: v.totalBillAmount, time: v.time, paymentDate: v.paymentDate, note: v.note, partTime: v.partTime });
      next.partTimeRevisions = [...(expense.partTimeRevisions || []), {
        at: new Date().toISOString(), actorId: actor!.id, actorName: actor!.name,
        reason: reason.trim(), before: snapshot(expense), after: snapshot(next),
      }];
      await runTransaction(db, async tx => {
        const ref = doc(db, 'standalone_expenses', expense.id);
        const latest = await tx.get(ref);
        if (!latest.exists() || canonical(latest.data()) !== canonical(DataManager.removeUndefined(expense)))
          throw new Error('这笔账目已被其他人修改。请关闭窗口、刷新月份后重试。');
        tx.set(ref, DataManager.removeUndefined(next));
      });
      onSaved(next);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };
  const field = 'w-full mt-1 min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-base text-[#111111]';
  return <div className="fixed inset-0 z-[350] bg-black/50 p-2 md:p-6 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="correction-title">
    <div className="bg-[#F6F7FB] rounded-2xl w-full max-w-xl max-h-[94dvh] flex flex-col shadow-xl">
      <div className="p-4 border-b flex items-center justify-between gap-3"><div><h3 id="correction-title" className="font-bold text-lg">更正兼职账目 · {expense.company}</h3><p className="text-sm text-gray-500">同一笔账更新金额，保留更正前后记录</p></div><button disabled={busy} onClick={onClose} className="min-h-[44px] px-3">关闭</button></div>
      <div className="p-4 space-y-4 overflow-y-auto min-h-0 text-sm">
        <div className="p-3 bg-white rounded-xl">原金额 RM {Number(expense.amount).toFixed(2)} · 付款日期 {expense.paymentDate || '未记录'}<p className="text-gray-500 mt-1">更正工作日期不会改变原付款日期和付款状态。</p></div>
        <label className="block">工作／入账日期<input aria-label="工作日期" type="date" value={date} onChange={e => setDate(e.target.value)} className={field}/></label>
        {expense.partTime ? <div className="grid grid-cols-3 gap-3">{[['工时', hours, setHours], ['时薪 RM', rate, setRate], ['另加 RM', extra, setExtra]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<input aria-label={String(label)} type="number" min="0" step="0.01" value={String(value)} onChange={e => (setter as (v: string) => void)(e.target.value)} className={field}/></label>)}</div> : <label className="block">金额 RM<input aria-label="金额" type="number" min="0.01" step="0.01" value={directAmount} onChange={e => setDirectAmount(e.target.value)} className={field}/></label>}
        <label className="block">账目备注<textarea value={note} onChange={e => setNote(e.target.value)} className={field + ' py-2'} /></label>
        <label className="block">更正原因（必填）<textarea aria-label="更正原因" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={field + ' py-2'} /></label>
        {!!expense.partTimeRevisions?.length && <details><summary className="cursor-pointer py-2">查看 {expense.partTimeRevisions.length} 次更正记录</summary>{expense.partTimeRevisions.map((r, i) => <div key={i} className="p-3 bg-white mt-2 rounded-xl"><b>{r.actorName}</b> · {new Date(r.at).toLocaleString()}<p>RM {r.before.amount.toFixed(2)} → RM {r.after.amount.toFixed(2)}</p><p>{r.reason}</p></div>)}</details>}
        {linkedBill && <p className="text-red-600">这笔记录涉及未付余额、预支、贷项或科目拆分，请从应付账款更正，以保持关联账目一致。</p>}
        {actor?.readOnlyAccess && <p className="text-red-600">当前账号仅可查看，不能更正账目。</p>}
        {!actor?.id && <p className="text-red-600">无法识别当前操作人，请重新登录后更正。</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </div>
      <div className="p-4 border-t bg-white rounded-b-2xl flex items-center justify-between gap-3"><b>更正后 RM {Number.isFinite(amount) ? amount.toFixed(2) : '—'}</b><button disabled={!valid || busy} onClick={save} className="min-h-[44px] bg-[#FFD200] rounded-xl px-4 font-bold disabled:opacity-40">{busy ? '保存中…' : '保存更正'}</button></div>
    </div>
  </div>;
}
