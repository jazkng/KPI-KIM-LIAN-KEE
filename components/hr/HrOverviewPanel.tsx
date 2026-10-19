import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AlertCircle, Cake, CalendarClock, ChevronRight, Clock, LayoutGrid, RefreshCw, Users } from 'lucide-react';
import { db } from '../../firebaseConfig';
import { DataManager } from '../../utils/dataManager';
import { buildHrOverview, DEPT_LABEL, EXPIRY_LABEL, ROSTER_STATUS_LABEL, type HrOverview, type PersonLine } from '../../utils/hr/hrOverview';

interface Props {
    today: string;
    canHr: boolean;
    canRoster: boolean;
    onOpenHr: () => void;
    onOpenRoster: () => void;
}

const money = (n: number) => `RM ${n.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
const daysText = (d: number) => d < 0 ? `已过 ${-d} 天` : d === 0 ? '今天' : `${d} 天后`;

/** 只读：直接读 roster_months 这一个月的文件（不用 getRosterData，那个在旧资料时会顺手写入迁移） */
const readDayRoster = async (today: string): Promise<Record<string, string> | null> => {
    const snap = await getDoc(doc(db, 'roster_months', today.slice(0, 7)));
    if (!snap.exists()) return null;
    return (snap.data().roster || {})[today] || {};
};

const People = ({ list }: { list: PersonLine[] }) => list.length === 0 ? <p className="bc-muted">没有</p> : <ul className="hr-people">
    {list.map(p => <li key={p.employeeId}><b>{p.name}</b><small>{DEPT_LABEL[p.dept] || p.dept}{p.status && ROSTER_STATUS_LABEL[p.status] ? ` · ${ROSTER_STATUS_LABEL[p.status]}` : ''}</small></li>)}
</ul>;

export const HrOverviewPanel: React.FC<Props> = ({ today, canHr, canRoster, onOpenHr, onOpenRoster }) => {
    const [data, setData] = useState<HrOverview | null>(null);
    const [rosterMissing, setRosterMissing] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!canHr && !canRoster) return;
        let active = true;
        setLoading(true); setError('');
        (async () => {
            if (reload) DataManager.clearCacheKeys(['employees']);
            const [emp, roster, att] = await Promise.allSettled([
                DataManager.getEmployees(),
                canRoster ? readDayRoster(today) : Promise.resolve(null),
                DataManager.getAttendanceByDate(today),
            ]);
            if (!active) return;
            if (emp.status === 'rejected') { setError('读取员工资料失败，请稍后再试。'); setLoading(false); return; }
            const dayRoster = roster.status === 'fulfilled' ? roster.value : null;
            setRosterMissing(canRoster && roster.status === 'fulfilled' && roster.value === null);
            setData(buildHrOverview({
                employees: emp.value, today, dayRoster,
                attendance: att.status === 'fulfilled' ? att.value : null,
            }));
            setLoading(false);
        })();
        return () => { active = false; };
    }, [today, canHr, canRoster, reload]);

    if (!canHr && !canRoster) return <p className="bc-card">当前账号未获人事模块权限。</p>;

    const r = data?.roster, a = data?.attendance;
    const working = r ? Object.entries(r.working.reduce<Record<string, PersonLine[]>>((g, p) => { (g[p.status] ||= []).push(p); return g; }, {})) : [];

    return <div className="hr-overview">
        <div className="hr-toolbar"><span>{today} · 只读概况</span>
            <button aria-label="重新读取人事资料" disabled={loading} onClick={() => setReload(v => v + 1)}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {error && <p className="bc-card bc-error"><span><AlertCircle size={16} /> {error}</span><button onClick={() => setReload(v => v + 1)}>重试</button></p>}
        {!data && !error && <div className="bc-loading">读取中…</div>}
        {data && <>
            <div className="bc-metric-grid hr-metrics">
                <div className="bc-metric"><span>在职员工</span><strong>{data.active}</strong><small>试用期 {data.probation} 人</small></div>
                {canRoster && <div className="bc-metric"><span>今天上班</span><strong>{r ? r.working.length : '—'}</strong><small>{r ? `休息 / 请假 ${r.off.length} · 未排班 ${r.unassigned}` : '本月班表还没建立'}</small></div>}
                <div className="bc-metric"><span>今天已打卡</span><strong>{a ? a.clockedIn : '—'}</strong><small>{a ? `迟到 ${a.late} 人` : '读取打卡失败'}</small></div>
                {canHr && <div className="bc-metric"><span>月薪底薪合计</span><strong>{money(data.monthlySalaryTotal)}</strong><small>只算月薪制，不含津贴 / 加班</small></div>}
            </div>

            <div className="hr-grid">
                {canRoster && <section className="bc-card">
                    <div className="bc-card-heading"><h2><LayoutGrid size={17} /> 今天班表</h2><button className="hr-link" onClick={onOpenRoster}>排班 <ChevronRight size={14} /></button></div>
                    {!r ? <p className="bc-muted">{rosterMissing ? '本月班表还没建立。' : '读取班表失败。'}</p> : <>
                        {working.length === 0 && <p className="bc-muted">今天没有人排班上班。</p>}
                        {working.map(([status, list]) => <div key={status} className="hr-group"><h3>{ROSTER_STATUS_LABEL[status] || status} · {list.length}</h3><People list={list.map(p => ({ ...p, status: '' }))} /></div>)}
                        <div className="hr-group"><h3>休息 / 请假 · {r.off.length}</h3><People list={r.off} /></div>
                        {a && a.notClockedIn.length > 0 && <div className="hr-group hr-warn"><h3><Clock size={14} /> 排了班但还没打卡 · {a.notClockedIn.length}</h3><People list={a.notClockedIn} /></div>}
                    </>}
                </section>}

                {canHr && <section className="bc-card">
                    <div className="bc-card-heading"><h2><CalendarClock size={17} /> 到期提醒</h2><small>60 天内</small></div>
                    {data.expiries.length === 0 ? <p className="bc-muted">60 天内没有准证、伤寒针、合约或试用期到期。</p> : <ul className="hr-expiry">
                        {data.expiries.map(x => <li key={`${x.employeeId}_${x.kind}`} className={x.daysLeft < 0 ? 'is-over' : x.daysLeft <= 14 ? 'is-soon' : ''}>
                            <b>{x.name}</b><span>{EXPIRY_LABEL[x.kind]}</span><small>{x.date} · {daysText(x.daysLeft)}</small>
                        </li>)}
                    </ul>}
                    <button className="hr-link" onClick={onOpenHr}>员工档案 <ChevronRight size={14} /></button>
                </section>}

                <section className="bc-card">
                    <div className="bc-card-heading"><h2><Users size={17} /> 部门人数</h2></div>
                    <ul className="hr-depts">{data.byDept.map(d => <li key={d.dept}><span>{d.label}</span><b>{d.count}</b></li>)}</ul>
                    {canHr && <>
                        <h3 className="hr-sub"><Cake size={14} /> 本月生日</h3>
                        {data.birthdays.length === 0 ? <p className="bc-muted">本月没有员工生日（或没填出生日期）。</p> : <ul className="hr-people">
                            {data.birthdays.map(b => <li key={b.employeeId}><b>{b.name}{b.isToday ? ' 🎂 今天' : ''}</b><small>{b.day}</small></li>)}
                        </ul>}
                    </>}
                </section>
            </div>
        </>}
    </div>;
};
