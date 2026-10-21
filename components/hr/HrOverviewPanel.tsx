import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { AlertCircle, Cake, ChevronRight, LayoutGrid, RefreshCw, Users, Wallet } from 'lucide-react';
import { db } from '../../firebaseConfig';
import type { ExpenseItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { buildHrOverview, summarizeStaffCash, ROSTER_STATUS_LABEL, type HrOverview, type PersonLine, type StaffCashMonth } from '../../utils/hr/hrOverview';

interface Props {
    today: string;
    canHr: boolean;
    canRoster: boolean;
    canStaffCash: boolean;
    onOpenHr: () => void;
    onOpenRoster: () => void;
    onOpenStaffCash: () => void;
}

const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** 只读：直接读 roster_months 这一个月的文件（不用 getRosterData，那个在旧资料时会顺手写入迁移） */
const readDayRoster = async (today: string): Promise<Record<string, string> | null> => {
    const snap = await getDoc(doc(db, 'roster_months', today.slice(0, 7)));
    if (!snap.exists()) return null;
    return (snap.data().roster || {})[today] || {};
};

const readStaffCash = async (month: string): Promise<StaffCashMonth> => {
    const [adv, sal] = await Promise.all([
        getDocs(query(collection(db, 'standalone_expenses'), where('category', '==', 'STAFF_ADVANCE'))),
        getDocs(query(collection(db, 'standalone_expenses'), where('category', '==', 'SALARY'))),
    ]);
    return summarizeStaffCash({
        advances: adv.docs.map(d => d.data() as ExpenseItem),
        salaries: sal.docs.map(d => d.data() as ExpenseItem),
        month,
    });
};

const Chips = ({ list, off }: { list: PersonLine[]; off?: boolean }) => <ul className={`hr-people${off ? ' is-off' : ''}`}>
    {list.map(p => <li key={p.employeeId}><b>{p.name}</b>{ROSTER_STATUS_LABEL[p.status] && <small>{ROSTER_STATUS_LABEL[p.status]}</small>}</li>)}
</ul>;

export const HrOverviewPanel: React.FC<Props> = ({ today, canHr, canRoster, canStaffCash, onOpenHr, onOpenRoster, onOpenStaffCash }) => {
    const [data, setData] = useState<HrOverview | null>(null);
    const [cash, setCash] = useState<StaffCashMonth | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!canHr && !canRoster && !canStaffCash) return;
        let active = true;
        setLoading(true); setError('');
        (async () => {
            if (reload) DataManager.clearCacheKeys(['employees']);
            const [emp, roster, staffCash] = await Promise.allSettled([
                DataManager.getEmployees(),
                canRoster ? readDayRoster(today) : Promise.resolve(null),
                canStaffCash ? readStaffCash(today.slice(0, 7)) : Promise.resolve(null),
            ]);
            if (!active) return;
            if (emp.status === 'rejected') { setError('读取员工资料失败，请稍后再试。'); setLoading(false); return; }
            setData(buildHrOverview({ employees: emp.value, today, dayRoster: roster.status === 'fulfilled' ? roster.value : null }));
            setCash(staffCash.status === 'fulfilled' ? staffCash.value : null);
            setLoading(false);
        })();
        return () => { active = false; };
    }, [today, canHr, canRoster, canStaffCash, reload]);

    if (!canHr && !canRoster && !canStaffCash) return <p className="bc-card">当前账号未获人事模块权限。</p>;

    return <div className="hr-overview">
        <div className="hr-toolbar"><span>{today}</span>
            <button aria-label="重新读取人事资料" disabled={loading} onClick={() => setReload(v => v + 1)}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {error && <p className="bc-card bc-error"><span><AlertCircle size={16} /> {error}</span><button onClick={() => setReload(v => v + 1)}>重试</button></p>}
        {!data && !error && <div className="bc-loading">读取中…</div>}
        {data && <>
            <div className="bc-metric-grid hr-metrics">
                <div className="bc-metric"><span>在职员工</span><strong>{data.active}</strong><small>试用期 {data.probation} 人{canHr ? ` · 月薪底薪 ${money(data.monthlySalaryTotal)}` : ''}</small></div>
                {canRoster && <div className="bc-metric"><span>今天上班 / 休息</span><strong>{data.working ?? '—'}<em> / {data.off ?? '—'}</em></strong><small>{data.hasRoster ? '按今天班表' : '本月班表还没建立'}</small></div>}
                {canStaffCash && <div className="bc-metric"><span>本月预支</span><strong>{cash ? money(cash.advanceTotal) : '—'}</strong><small>{cash ? `${cash.advanceCount} 笔` : '读取失败'}</small></div>}
                {canStaffCash && <div className="bc-metric"><span>本月兼职</span><strong>{cash ? money(cash.partTimeTotal) : '—'}</strong><small>{cash ? `${cash.partTimeCount} 笔` : '读取失败'}</small></div>}
            </div>

            <div className="hr-grid">
                {canRoster && <section className="bc-card hr-today">
                    <div className="bc-card-heading"><h2><LayoutGrid size={17} /> 今天班表</h2><button className="hr-link" onClick={onOpenRoster}>排班 <ChevronRight size={14} /></button></div>
                    {!data.hasRoster && <p className="bc-muted">本月班表还没建立，下面只列各部门人数。</p>}
                    {data.depts.map(d => <div key={d.dept} className="hr-dept">
                        <h3><span>{d.label}</span><small>{data.hasRoster ? <>上班 <b>{d.working.length}</b> · 休息 <b>{d.off.length}</b>{d.unassigned.length > 0 && <> · 未排 {d.unassigned.length}</>}</> : <>{d.total} 人</>}</small></h3>
                        {data.hasRoster && <>
                            {d.working.length > 0 && <Chips list={d.working} />}
                            {d.off.length > 0 && <Chips list={d.off} off />}
                        </>}
                    </div>)}
                </section>}

                <div className="hr-side">
                    {canStaffCash && <section className="bc-card">
                        <div className="bc-card-heading"><h2><Wallet size={17} /> 兼职与预支</h2><button className="hr-link" onClick={onOpenStaffCash}>打开 <ChevronRight size={14} /></button></div>
                        {!cash ? <p className="bc-muted">读取失败。</p> : <>
                            <ul className="hr-depts">
                                <li><span>本月预支</span><b>{money(cash.advanceTotal)} · {cash.advanceCount} 笔</b></li>
                                <li><span>本月兼职</span><b>{money(cash.partTimeTotal)} · {cash.partTimeCount} 笔</b></li>
                            </ul>
                            {cash.topAdvances.length > 0 && <>
                                <h3 className="hr-sub">本月预支最多</h3>
                                <ul className="hr-depts">{cash.topAdvances.map(a => <li key={a.name}><span>{a.name}</span><b>{money(a.amount)}</b></li>)}</ul>
                            </>}
                        </>}
                    </section>}

                    {canHr && <section className="bc-card">
                        <div className="bc-card-heading"><h2><Users size={17} /> 员工档案</h2><button className="hr-link" onClick={onOpenHr}>打开 <ChevronRight size={14} /></button></div>
                        <h3 className="hr-sub"><Cake size={14} /> 本月生日</h3>
                        {data.birthdays.length === 0 ? <p className="bc-muted">本月没有员工生日（或没填出生日期）。</p> : <ul className="hr-people">
                            {data.birthdays.map(b => <li key={b.employeeId}><b>{b.name}{b.isToday ? ' 🎂 今天' : ''}</b><small>{b.day}</small></li>)}
                        </ul>}
                    </section>}
                </div>
            </div>
        </>}
    </div>;
};
