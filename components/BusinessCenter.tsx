import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Settings, LogOut, TrendingUp, Users, LayoutGrid, CloudRain, Sun, CloudSun, CloudLightning, X } from 'lucide-react';
import type { Employee } from '../types';
import { WEATHER_OPTIONS, SPECIAL_CONDITION_OPTIONS } from '../types';
import { canUseBossTarget } from '../utils/bossPortalAccess';
import { getBusinessDateString } from '../utils/dateHelper';
import { browserCockpitSource } from '../utils/cockpit/loadCockpit';
import { addDays, daysInMonth } from '../utils/cockpit/periods';
import { holidayLabel } from '../utils/holidays/malaysiaHolidays';
import { loadBusinessCenterWith, type BusinessCenterData, type BusinessDay } from '../utils/businessCenter';
import { COCKPIT_STATUS_LABEL, type Kpi } from '../utils/cockpit/cockpitMetrics';
import { buildAdvisorEvidence } from '../utils/cockpit/advisorEvidence';
import { AIOperationsAssistant, HRSystem, RecurringBillsModule, TreasuryModule } from './lazyModules';
import './businessCenter.css';

interface Props {
    currentEmployee: Employee;
    section: 'business' | 'hr';
    onSection: (section: 'PRIORITY' | 'HR' | 'FUNCTIONS') => void;
    onNavigate: (tab: string) => void;
    onOpenConfig: () => void;
    onLogout: () => void;
    loadData?: typeof loadBusinessCenterWith;
}
const money = (n: number | null) => n === null ? '—' : `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const format = (k?: Kpi) => !k || k.value === null ? '—' : k.unit === 'PCT' ? `${(k.value * 100).toFixed(1)}%` : k.unit === 'DAYS' ? `${k.value} 天` : money(k.value);
const Status = ({ k }: { k?: Kpi }) => k ? <span className={`bc-status bc-status-${k.status}`}>{COCKPIT_STATUS_LABEL[k.status]}</span> : null;
const shiftMonth = (month: string, by: number) => addDays(`${month}-01`, by < 0 ? -1 : daysInMonth(month)).slice(0, 7);

export const BusinessCenter: React.FC<Props> = ({ currentEmployee, section, onSection, onNavigate, onOpenConfig, onLogout, loadData = loadBusinessCenterWith }) => {
    const today = getBusinessDateString();
    const [month, setMonth] = useState(today.slice(0, 7));
    const [tab, setTab] = useState<'sales' | 'profit' | 'cash'>('sales');
    const [dataRecord, setData] = useState<BusinessCenterData | null>(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0);
    const [chart, setChart] = useState<'week' | 'month'>('week');
    const [accountModal, setAccountModal] = useState<'TREASURY' | 'BILLS' | null>(null);
    const [detail, setDetail] = useState<Kpi | null>(null), [hrOpen, setHrOpen] = useState(false), [aiOpen, setAiOpen] = useState(false);
    const can = (target: string) => canUseBossTarget(currentEmployee, target);
    const reportsAllowed = can('REPORTS'), settlementAllowed = can('DAILY_REPORT');
    const [loadedFor, setLoadedFor] = useState('');
    const data = reportsAllowed && section === 'business' && dataRecord?.month === month && loadedFor === currentEmployee.id ? dataRecord : null;
    useEffect(() => {
        setDetail(null); setAiOpen(false);
        if (!reportsAllowed || section !== 'business') { setData(null); setLoading(false); return; }
        let active = true;
        setLoading(true); setError(''); setData(null); setSelectedDate('');
        const timer = setTimeout(() => { if (active) { active = false; setLoading(false); setError('读取逾时，请检查网络后重试。'); } }, 25000);
        loadData(browserCockpitSource, month, today).then(value => {
            if (!active) return;
            setLoadedFor(currentEmployee.id); setData(value);
            setSelectedDate(value.days.filter(d => d.date.startsWith(month) && d.date <= value.result.period.end).slice(-1)[0]?.date || '');
        }).catch(() => { if (active) setError('暂时无法读取资料，请检查网络或账号权限。'); })
            .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
        return () => { active = false; clearTimeout(timer); };
    }, [month, today, reportsAllowed, section, revision, currentEmployee.id, loadData]);
    useEffect(() => { if (hrOpen && !canUseBossTarget(currentEmployee, 'HR')) setHrOpen(false); }, [currentEmployee, hrOpen]);
    const k = data?.result.kpis;
    const monthDays = data?.days.filter(d => d.date.startsWith(month) && d.date <= data.result.period.end) || [];
    const day = monthDays.find(d => d.date === selectedDate);
    const previous = day && data?.days.find(d => d.date === addDays(day.date, -7));
    const salesEmpty = !loading && !!data && monthDays.length === 0;
    const navigate = (target: string) => { if (can(target)) onNavigate(target); };
    const metric = (key: string) => k?.[key] && <button className="bc-metric" onClick={() => setDetail(k[key])}><span>{k[key].label}</span><strong>{format(k[key])}</strong><Status k={k[key]} /></button>;

    return <div className="bc-shell">
        <aside className="bc-sidebar"><div className="bc-brand"><b>御膳智控</b><small>金莲记 · 经营工作空间</small></div>
            <button className={section === 'business' ? 'active' : ''} onClick={() => onSection('PRIORITY')}><TrendingUp size={19} />经营中心</button>
            <button className={section === 'hr' ? 'active' : ''} onClick={() => onSection('HR')}><Users size={19} />人事</button>
            <button onClick={() => onSection('FUNCTIONS')}><LayoutGrid size={19} />全部功能</button>
            <small className="bc-account">{currentEmployee.name}</small>
        </aside>
        <div className="bc-workspace"><header className="bc-header"><div><b>{section === 'hr' ? '人事中心' : '经营中心'}</b><small>{currentEmployee.name} · 金莲记</small></div><div className="bc-header-actions">
            {section === 'business' && reportsAllowed && <button aria-label="重新读取经营资料" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>}
            <button onClick={onOpenConfig} aria-label="设置"><Settings size={18} /></button><button onClick={onLogout} aria-label="退出登录"><LogOut size={18} /></button>
        </div></header>
        <main className="bc-main">
            {section === 'hr' ? <><h1>人事中心</h1><p className="bc-muted">沿用现有员工档案与排班。</p><div className="bc-hr-grid">
                {can('HR') && <button className="bc-card bc-hr-entry" onClick={() => setHrOpen(true)}><Users size={26} /><b>员工档案</b><span>档案、薪资与职位标准 <ChevronRight size={16} /></span></button>}
                {can('ROSTER') && <button className="bc-card bc-hr-entry" onClick={() => navigate('ROSTER')}><LayoutGrid size={26} /><b>排班</b><span>查看与安排班表 <ChevronRight size={16} /></span></button>}
                {!can('HR') && !can('ROSTER') && <p className="bc-card">当前账号未获人事模块权限。</p>}
            </div></> : <>
                <div className="bc-toolbar"><span>经营月份</span><button aria-label="上一个月" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft size={17} /></button><input aria-label="经营月份" type="month" value={month} max={today.slice(0, 7)} min="2000-01" onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value <= today.slice(0, 7)) setMonth(e.target.value); }} /><button aria-label="下一个月" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight size={17} /></button></div>
                <nav className="bc-tabs" aria-label="经营中心视图">{([['sales', '销售概况'], ['profit', '成本与利润'], ['cash', '现金与账款']] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
                {!reportsAllowed ? <p className="bc-card">当前账号未获经营报表权限。其他已授权模块可从「全部功能」进入。</p> : <>
                    {loading && <div className="bc-card bc-loading" role="status">正在读取已结算记录、成本与薪资…</div>}
                    {error && <div role="alert" className="bc-card bc-error">{error}<button onClick={() => setRevision(v => v + 1)}>重试</button></div>}
                    {data && k && <>
                        {data.draftCount > 0 && <p className="bc-warning">月度报表沿用现有利润引擎，包含 {data.draftCount} 笔未结算记录，金额待核对；下方日报只显示已结算日。</p>}
                        {salesEmpty && <div className="bc-empty bc-card">本月暂无已结算营业额；未结算日期不当作 0。</div>}
                        {tab === 'sales' && <>
                            <div className="bc-overview"><div><section className="bc-card"><div className="bc-card-heading"><h2>经营日报</h2><select aria-label="选择已结算日" value={selectedDate} disabled={!monthDays.length} onChange={e => setSelectedDate(e.target.value)}>{!monthDays.length && <option value="">未结算</option>}{monthDays.map(d => <option key={d.date} value={d.date}>{d.date.slice(5).replace('-', '月')}日</option>)}</select></div>
                                {day ? <><div className="bc-sales-hero"><div><small>{day.date} · 已结算</small>{settlementAllowed && <span className="bc-weather">{day.weather === 'SUNNY' ? <Sun size={17} /> : day.weather === 'CLOUDY' ? <CloudSun size={17} /> : day.weather === 'HEAVY_RAIN' ? <CloudLightning size={17} /> : day.weather === 'RAIN' ? <CloudRain size={17} /> : null}{WEATHER_OPTIONS.find(w => w.value === day.weather)?.label || (day.weatherMixed ? '天气记录不同' : '天气未填写')}</span>}</div><strong>{money(day.revenue)}</strong><p>{previous && previous.revenue > 0 ? `较上周同日${day.revenue >= previous.revenue ? '增加' : '减少'} ${money(Math.abs(day.revenue - previous.revenue))}（${(Math.abs(day.revenue - previous.revenue) / previous.revenue * 100).toFixed(1)}%）` : '暂无上周同日对照'}</p></div>
                                    {settlementAllowed && <><div className="bc-daily-kpis">{[['店内单数', day.bills ?? '待补'], ['店内单均', money(day.perBill)], ['堂食人数', day.pax ?? '待补'], ['人均消费', money(day.perPax)]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
                                        <div className="bc-daily-kpis bc-community" aria-label="熟客与 WhatsApp">{[['熟客', day.community.regulars], ['VIP 到店', day.community.vipVisits], ['WA 新加入', day.community.waJoin], ['WA 订单', day.community.waOrders]].map(([label, value]) => <div key={label}><span>{label}</span><b>{Number(value) > 0 ? value : '—'}</b></div>)}</div>
                                        <RevenueComposition day={day} /></>}
                                    {settlementAllowed && <div className="bc-environment" aria-label="营业日环境因素">{day.holiday && <span className="bc-holiday" title={day.holiday.about}>假日 · {holidayLabel(day.holiday)}</span>}{SPECIAL_CONDITION_OPTIONS.filter(o => day.specialConditions.includes(o.value)).map(o => <span key={o.value}>{o.label}</span>)}{!day.holidayYearCovered && <small>该年假日日历待补充</small>}{day.tomorrowHoliday && <small>次日假日 · {holidayLabel(day.tomorrowHoliday)}</small>}</div>}
                                    {day.legacyGrab && <p className="bc-warning">旧记录缺 Grab 总额，沿用利润引擎暂计净额；待核对。</p>}
                                </> : <p className="bc-muted">本月暂无已结算日报。</p>}
                            </section>{day && settlementAllowed && <details className="bc-channel-details"><summary>各渠道订单与均价 <span>展开明细</span></summary><table><thead><tr><th>渠道</th><th>销售额</th><th>单数</th><th>单均</th></tr></thead><tbody>{day.channels.map(c => <tr key={c.label}><td>{c.label}</td><td>{money(c.amount)}</td><td>{c.needsReview ? '待核对' : c.orders ?? '待补'}</td><td>{money(c.average)}</td></tr>)}</tbody></table><p>单均＝同渠道销售额÷完成单数。缺单数显示待补；有销售额但单数为0需核对。日报只读。</p></details>}</div>
                            <aside><section className="bc-card"><div className="bc-card-heading"><h2>本月经营</h2><small>{data.result.period.start.slice(5)}–{data.result.period.end.slice(5)}</small></div><button className="bc-month-revenue" onClick={() => setDetail(k.revenue)}><span>累计营业额</span><b>{format(k.revenue)}</b><Status k={k.revenue} /></button>
                                <div className="bc-cost-bars">{['foodRatio', 'labourRatio'].map(key => k[key] && <button key={key} onClick={() => setDetail(k[key])}><span>{k[key].label}</span><b>{format(k[key])}</b><i><em style={{ width: `${Math.max(0, Math.min(100, (k[key].value ?? 0) * 100))}%` }} /></i><Status k={k[key]} /></button>)}</div><button className="bc-month-profit" onClick={() => setDetail(k.actualProfit)}><span>经营利润 <Status k={k.actualProfit} /></span><b>{format(k.actualProfit)}</b></button><div className="bc-links"><button onClick={() => setTab('profit')}>成本明细 ↗</button><button onClick={() => setTab('cash')}>现金与账款 ↗</button></div></section>
                                <section className="bc-card bc-advice"><h2>经营提示</h2><p>{data.result.briefing[0] || '请先核对当前期间的资料完整性。'}</p>{data.result.alerts.slice(0, 2).map(a => <p key={a.title}>{a.title}</p>)}<button disabled={!can('AI_ASSISTANT')} onClick={() => setAiOpen(true)}>查看 AI 经营建议 ↗</button></section>
                            </aside></div>
                            <div className="bc-chart-tabs"><button aria-pressed={chart === 'week'} onClick={() => setChart('week')}>近7天对比</button><button aria-pressed={chart === 'month'} onClick={() => setChart('month')}>本月与保本</button></div>
                            <div className={`bc-charts bc-show-${chart}`}><BusinessChart days={data.days} month={month} end={monthDays.slice(-1)[0]?.date || data.result.period.end} kind="week" onSelect={setSelectedDate} /><BusinessChart days={data.days} month={month} end={data.result.period.end} kind="month" breakEven={k.breakEvenDay} onSelect={setSelectedDate} onDetail={setDetail} /></div>
                        </>}
                        {tab === 'profit' && <><div className="bc-metric-grid">{['actualProfit', 'revenue', 'food', 'foodRatio', 'labour', 'labourRatio', 'grossMargin', 'netMargin', 'breakEvenDay', 'breakEvenMonth'].map(key => <React.Fragment key={key}>{metric(key)}</React.Fragment>)}</div><section className="bc-card bc-integrity"><h2>资料完整性</h2>{data.result.integrity.map(item => <details key={item.label}><summary>{item.ok ? '✓' : '!'} {item.label}</summary><p>{item.detail}</p></details>)}</section></>}
                        {tab === 'cash' && <section className="bc-card"><h2>现金与账款</h2><p className="bc-muted">按实际收付款查看；销售和经营利润仍使用业务发生制。</p><div className="bc-hr-grid">{[['TREASURY', '资金与现金'], ['AP', '应付账款'], ['BILLS', '经常性支出']].map(([target, label]) => can(target) && <button key={target} className="bc-cash-entry" onClick={() => { if (!can(target)) return; if (target === 'AP') navigate('AP'); else setAccountModal(target as 'TREASURY' | 'BILLS'); }}>{label}<ChevronRight size={16} /></button>)}</div><p className="bc-muted">打开现有账款模块，保留原来的操作与记录。</p></section>}
                        <details className="bc-sources"><summary>数据依据与口径</summary><p>来源：现有日结、应付账款、固定账单与薪资。营业额使用利润引擎：店内扣退款后金额＋外卖平台总额；抽佣和广告单列成本。旧 Grab 缺总额时沿用引擎暂计净额并提示。日报仅显示已结算记录；月度金额沿用原引擎，若存在未结算记录会单独提示。缺记录不作 0；食材是采购成本，不代表实际耗用。更新于 {new Date(data.result.loadedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Kuala_Lumpur' })}。</p></details>
                    </>}
                </>}
            </>}
        </main></div>
        {accountModal === 'TREASURY' && can('TREASURY') && <TreasuryModule onClose={() => setAccountModal(null)} />}
        {accountModal === 'BILLS' && can('BILLS') && <RecurringBillsModule onClose={() => setAccountModal(null)} />}
        {detail && data && reportsAllowed && section === 'business' && <MetricDialog kpi={detail} onClose={() => setDetail(null)} />}
        {hrOpen && can('HR') && <HRSystem currentEmployee={currentEmployee} onClose={() => setHrOpen(false)} />}
        {aiOpen && reportsAllowed && can('AI_ASSISTANT') && data && <AIOperationsAssistant isOpen onClose={() => setAiOpen(false)} advisor={{ periodLabel: data.result.period.label, evidence: buildAdvisorEvidence(data.result, null), onOpenKpi: key => { setAiOpen(false); if (k?.[key]) setDetail(k[key]); } }} />}
    </div>;
};

const RevenueComposition = ({ day }: { day: BusinessDay }) => {
    const store = day.channels[0].amount, delivery = day.revenue - store;
    const valid = day.revenue > 0 && store >= 0 && delivery >= 0;
    return <div className="bc-composition"><h3>营业额组成</h3>{valid && <div className="bc-stack" role="img" aria-label={`店内 ${(store / day.revenue * 100).toFixed(1)}%，外卖 ${(delivery / day.revenue * 100).toFixed(1)}%`}><i style={{ width: `${store / day.revenue * 100}%` }} /><i style={{ width: `${delivery / day.revenue * 100}%` }} /></div>}<div className="bc-composition-legend">{[['店内', store], ['外卖', delivery]].map(([label, value]) => <div key={label}><span>{label}</span><b>{money(Number(value))}</b>{valid && <small>{(Number(value) / day.revenue * 100).toFixed(1)}%</small>}</div>)}</div></div>;
};

const MetricDialog = ({ kpi, onClose }: { kpi: Kpi; onClose: () => void }) => {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); }, []);
    return <dialog ref={ref} className="bc-dialog" onCancel={onClose} onClose={onClose}><header><h2>{kpi.label}</h2><button onClick={onClose} aria-label="关闭计算依据"><X size={20} /></button></header><strong>{format(kpi)}</strong><Status k={kpi} /><p>{kpi.statusNote}</p>{kpi.basis.map(line => <p key={line}>{line}</p>)}<table><tbody>{kpi.rows.map((row, i) => <tr key={i}><td>{row.label}{row.note && <small>{row.note}</small>}</td><td>{money(row.amount)}</td></tr>)}</tbody></table><p>{kpi.sources.map(s => `${s.label}${s.count === undefined ? '' : ` · ${s.count}笔`}`).join('；')}</p></dialog>;
};

const BusinessChart = ({ days, month, end, kind, breakEven, onSelect, onDetail }: { days: BusinessDay[]; month: string; end: string; kind: 'week' | 'month'; breakEven?: Kpi; onSelect: (date: string) => void; onDetail?: (k: Kpi) => void }) => {
    const [table, setTable] = useState(false);
    const byDate = useMemo(() => new Map(days.map(d => [d.date, d.revenue])), [days]);
    const dates = kind === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(end, i - 6)) : Array.from({ length: Number(end.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    const max = Math.max(1, ...dates.flatMap(date => [byDate.get(date) ?? 0, kind === 'week' ? byDate.get(addDays(date, -7)) ?? 0 : 0]), breakEven?.value ?? 0) * 1.15;
    const w = 700, h = 260, left = 48, base = 215, height = 180, step = (w - left - 15) / dates.length;
    const y = (v: number) => base - v / max * height;
    const currentComplete = dates.every(date => byDate.has(date));
    const previousComplete = dates.every(date => byDate.has(addDays(date, -7)));
    const sum = (shift: number) => dates.reduce((n, date) => n + (byDate.get(addDays(date, shift)) ?? 0), 0);
    return <section className={`bc-card bc-chart bc-chart-${kind}`}><div className="bc-card-heading"><h2>{kind === 'week' ? '近7天营业额' : '每日营业额与保本线'}</h2><button onClick={() => setTable(v => !v)}>{table ? '图表' : '表格'}</button></div>
        {kind === 'week' ? <div className="bc-chart-legend"><span>本7天 {currentComplete ? money(sum(0)) : '资料未齐'}</span><span>前7天 {previousComplete ? money(sum(-7)) : '资料未齐'}</span></div> : breakEven && <button className="bc-be" onClick={() => onDetail?.(breakEven)}>每日保本 {format(breakEven)} <Status k={breakEven} /></button>}
        {table ? <div className="bc-chart-table"><table><thead><tr><th>营业日</th><th>营业额</th>{kind === 'week' && <th>上周同日</th>}</tr></thead><tbody>{dates.map(date => <tr key={date}><td>{date.slice(5)}</td><td>{byDate.has(date) ? money(byDate.get(date)!) : '未结算'}</td>{kind === 'week' && <td>{byDate.has(addDays(date, -7)) ? money(byDate.get(addDays(date, -7))!) : '未结算'}</td>}</tr>)}</tbody></table></div> : <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={kind === 'week' ? '近7天与上周同日营业额对比；缺记录为空，非零' : '本月已结算营业额与预估保本线'}>
            {[0, .5, 1].map(t => <g key={t}><line x1={left} x2={w - 10} y1={y(max * t)} y2={y(max * t)} stroke="#e6e8ec" /><text x={left - 8} y={y(max * t) + 4} textAnchor="end">{(max * t / 1000).toFixed(1)}k</text></g>)}
            {dates.map((date, i) => { const value = byDate.get(date), prev = byDate.get(addDays(date, -7)), x = left + step * i + 5, bar = kind === 'week' ? step * .32 : step * .7; return <g key={date}>
                {kind === 'week' && prev !== undefined && <rect x={x} y={y(Math.max(0, prev))} width={bar} height={Math.max(0, prev) / max * height} rx="3" fill="#a3adbd"><title>{addDays(date, -7)} {money(prev)}</title></rect>}
                {value !== undefined ? <g role="button" tabIndex={0} aria-label={`${date} ${money(value)}，查看日报`} onClick={() => date.startsWith(month) && onSelect(date)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (date.startsWith(month)) onSelect(date); } }}><rect x={x + (kind === 'week' ? bar + 2 : 0)} y={y(Math.max(0, value))} width={bar} height={Math.max(2, Math.max(0, value) / max * height)} rx="3" fill="#c7a04b" /><title>{date} {money(value)}</title></g> : <text x={x + step * .3} y={base - 5} textAnchor="middle">—</text>}
                {(kind === 'week' || i % 4 === 0 || i === dates.length - 1) && <text x={x + step * .3} y={base + 22} textAnchor="middle">{date.slice(5)}</text>}
            </g>; })}
            {kind === 'month' && breakEven?.value !== null && breakEven?.value !== undefined && <line x1={left} x2={w - 10} y1={y(breakEven.value)} y2={y(breakEven.value)} stroke="#53645e" strokeWidth="2" strokeDasharray="6 4" />}
        </svg>}
        <small className="bc-chart-note">{kind === 'week' ? '金色：本7天 · 灰蓝：前7天；缺记录不按零计算。' : '虚线：预估每日保本；空白为未结算。负销售额请查看表格。'}</small>
    </section>;
};
