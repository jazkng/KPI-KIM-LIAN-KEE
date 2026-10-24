import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, Flag, RefreshCw, Sparkles, Settings, LogOut, TrendingUp, Users, LayoutGrid, CloudRain, Sun, CloudSun, CloudLightning, X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Employee } from '../types';
import { WEATHER_OPTIONS, SPECIAL_CONDITION_OPTIONS } from '../types';
import { canUseBossTarget } from '../utils/bossPortalAccess';
import { getBusinessDateString } from '../utils/dateHelper';
import { browserCockpitSource } from '../utils/cockpit/loadCockpit';
import { addDays, daysInMonth } from '../utils/cockpit/periods';
import { holidayLabel } from '../utils/holidays/malaysiaHolidays';
import { dailyBreakEvenTargets, loadBusinessCenterWith, profitStory, type BusinessCenterData, type BusinessDay, type ProfitStory } from '../utils/businessCenter';
import { COCKPIT_STATUS_LABEL, type Kpi } from '../utils/cockpit/cockpitMetrics';
import { buildAdvisorEvidence } from '../utils/cockpit/advisorEvidence';
import { HRSystem, RecurringBillsModule, TreasuryModule } from './lazyModules';
import { AdvisorPanel } from './advisor/AdvisorPanel';
import { MeetingBoard } from './meetings/MeetingBoard';
import { PointsBoard } from './points/PointsBoard';
import { isHygieneHr } from '../utils/points/hygieneAccess';
import { startableTypes } from '../utils/meetings/meetingLogic';
import { TaskBoard } from './tasks/TaskBoard';
import { countOpenMatters } from '../utils/tasks/staffTaskStore';
import { buildAdvisorInsights, type Anomaly } from '../utils/cockpit/advisorInsights';
import { loadAdvisorSources, type AdvisorSources } from '../utils/cockpit/advisorSources';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DataManager } from '../utils/dataManager';
import { summarizePayables, unpaidRecurringBills, latestClosing, payThisWeek, type PayRow } from '../utils/cashOverview';
import { HrOverviewPanel } from './hr/HrOverviewPanel';
import './businessCenter.css';

interface Props {
    currentEmployee: Employee;
    section: 'business' | 'hr';
    onSection: (section: 'PRIORITY' | 'HR' | 'FUNCTIONS') => void;
    onNavigate: (tab: string) => void;
    onOpenConfig: () => void;
    onLogout: () => void;
    loadData?: typeof loadBusinessCenterWith;
    /** 通知铃铛：放在设置和退出中间 */
    notifications?: React.ReactNode;
    /** 数字变了就打开 AI 经营顾问（老板长按「扫一扫」3 秒） */
    aiSignal?: number;
}
/** 日报小格子：标签已经说明是金额，不再加 RM */
const plain = (n: number | null) => n === null ? '—' : n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number | null) => n === null ? '—' : `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const format = (k?: Kpi) => !k || k.value === null ? '—' : k.unit === 'PCT' ? `${(k.value * 100).toFixed(1)}%` : k.unit === 'DAYS' ? `${k.value} 天` : money(k.value);
const Status = ({ k }: { k?: Kpi }) => k ? <span className={`bc-status bc-status-${k.status}`}>{COCKPIT_STATUS_LABEL[k.status]}</span> : null;
const shiftMonth = (month: string, by: number) => addDays(`${month}-01`, by < 0 ? -1 : daysInMonth(month)).slice(0, 7);

export const BusinessCenter: React.FC<Props> = ({ currentEmployee, section, onSection, onNavigate, onOpenConfig, onLogout, loadData = loadBusinessCenterWith, notifications, aiSignal = 0 }) => {
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
    useEffect(() => { if (aiSignal > 0) setAiOpen(true); }, [aiSignal]);
    // 上报事项（只读计数）：有待处理的就在经营中心最上面提醒
    const [openMatters, setOpenMatters] = useState(0);
    useEffect(() => { let on = true; countOpenMatters().then(n => on && setOpenMatters(n)).catch(() => undefined); return () => { on = false; }; }, [section]);
    // AI 顾问打开时才读供应商最近进价、本月班表（只读；读失败就不显示那张图）
    const [advisorSources, setAdvisorSources] = useState<AdvisorSources | null>(null);
    useEffect(() => {
        if (!aiOpen) { setAdvisorSources(null); return; }
        let active = true;
        loadAdvisorSources(month, { suppliers: can('SUPPLIER_CONTACTS'), roster: can('ROSTER'), purchases: can('PROCUREMENT'), inventory: can('PRICE_MONITOR') }).then(v => { if (active) setAdvisorSources(v); }).catch(() => { if (active) setAdvisorSources({}); });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiOpen, month]);
    const k = data?.result.kpis;
    // AI 顾问入口：先算「本月要注意」给入口预览（只用已读到的资料，不读额外资料）
    const [aiFocus, setAiFocus] = useState<Anomaly | null>(null);
    const aiPreview = useMemo(() => {
        if (!data) return [];
        const story = profitStory(data.result, month, today);
        return buildAdvisorInsights({ days: data.days, month, costLines: story.lines, revenue: story.revenue, breakEven: story.breakEven }).anomalies;
    }, [data, month, today]);
    const monthDays = data?.days.filter(d => d.date.startsWith(month) && d.date <= data.result.period.end) || [];
    const day = monthDays.find(d => d.date === selectedDate);
    const previous = day && data?.days.find(d => d.date === addDays(day.date, -7));
    const salesEmpty = !loading && !!data && monthDays.length === 0;
    const navigate = (target: string) => { if (can(target)) onNavigate(target); };
    // 「给会计看的原始数字」照旧用利润引擎（营业额含平台总额）
    const raw = data?.rawResult.kpis;
    const metric = (key: string) => raw?.[key] && <button className="bc-metric" onClick={() => setDetail(raw[key])}><span>{raw[key].label}</span><strong>{format(raw[key])}</strong><Status k={raw[key]} /></button>;

    return <div className="bc-shell">
        <aside className="bc-sidebar"><div className="bc-brand"><b>御膳智控</b><small>金莲记 · 经营工作空间</small></div>
            <button className={section === 'business' ? 'active' : ''} onClick={() => onSection('PRIORITY')}><TrendingUp size={19} />经营中心</button>
            <button className={section === 'hr' ? 'active' : ''} onClick={() => onSection('HR')}><Users size={19} />人事</button>
            <button onClick={() => onSection('FUNCTIONS')}><LayoutGrid size={19} />全部功能</button>
            <small className="bc-account">{currentEmployee.name}</small>
        </aside>
        <div className="bc-workspace"><header className="bc-header"><div><b>{section === 'hr' ? '人事中心' : '经营中心'}</b><small>{currentEmployee.name} · 金莲记</small></div><div className="bc-header-actions">
            {section === 'business' && reportsAllowed && <button aria-label="重新读取经营资料" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>}
            <button onClick={onOpenConfig} aria-label="设置"><Settings size={18} /></button>{notifications}<button onClick={onLogout} aria-label="退出登录"><LogOut size={18} /></button>
        </div></header>
        <main className="bc-main">
            {section === 'hr' ? <>
                <HrOverviewPanel today={today} canHr={can('HR')} canRoster={can('ROSTER')} canStaffCash={can('STAFF_CASH')} onOpenHr={() => setHrOpen(true)} onOpenRoster={() => navigate('ROSTER')} onOpenStaffCash={() => navigate('STAFF_CASH')} />
                {/* 委托任务与上报事项（老板也可以派任务、处理上报事项） */}
                <section className="bc-card bc-tasks" id="bc-tasks"><div className="bc-card-heading"><h2><ClipboardList size={17} /> 任务</h2></div><TaskBoard actor={currentEmployee} /></section>
                {startableTypes(currentEmployee).length > 0 && <section className="bc-card bc-tasks"><MeetingBoard actor={currentEmployee} /></section>}
                {isHygieneHr(currentEmployee) && <section className="bc-card bc-tasks"><PointsBoard actor={currentEmployee} /></section>}
            </> : <>
                {openMatters > 0 && <button className="bc-matter-banner" onClick={() => { onSection('HR'); setTimeout(() => document.getElementById('bc-tasks')?.scrollIntoView({ behavior: 'smooth' }), 300); }}><Flag size={18} /><span><b>上报事项 {openMatters} 件</b><small>员工 / 管理层上报、等你处理的事</small></span><ChevronRight size={18} /></button>}
                {reportsAllowed && can('AI_ASSISTANT') && <button className="bc-ai-banner" disabled={!data} onClick={() => { setAiFocus(null); setAiOpen(true); }}>
                    <span className="bc-ai-icon"><Sparkles size={20} /></span>
                    <span className="bc-ai-text"><b>AI 经营顾问</b><small>{!data ? '读取中…' : aiPreview.length ? `本月 ${aiPreview.length} 件事要注意` : '图表看本月生意，也可以直接问'}</small></span>
                    {aiPreview.length > 0 && <span className="bc-ai-chips">{aiPreview.slice(0, 3).map((a, i) => <i key={i} role="button" tabIndex={0} className={`is-${a.tone}`} onClick={e => { e.stopPropagation(); setAiFocus(a); setAiOpen(true); }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setAiFocus(a); setAiOpen(true); } }}>{a.text}</i>)}</span>}
                    <ChevronRight size={18} className="bc-ai-go" />
                </button>}
                <div className="bc-toolbar"><span>经营月份</span><button aria-label="上一个月" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft size={17} /></button><input aria-label="经营月份" type="month" value={month} max={today.slice(0, 7)} min="2000-01" onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value <= today.slice(0, 7)) setMonth(e.target.value); }} /><button aria-label="下一个月" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight size={17} /></button></div>
                <nav className="bc-tabs" aria-label="经营中心视图">{([['sales', '销售概况'], ['profit', '成本与利润'], ['cash', '现金与账款']] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
                {!reportsAllowed ? <p className="bc-card">当前账号未获经营报表权限。其他已授权模块可从「全部功能」进入。</p> : <>
                    {loading && <div className="bc-card bc-loading" role="status">正在读取已结算记录、成本与薪资…</div>}
                    {error && <div role="alert" className="bc-card bc-error">{error}<button onClick={() => setRevision(v => v + 1)}>重试</button></div>}
                    {data && k && <>
                        {data.draftCount > 0 && tab !== 'cash' && <p className="bc-warning">月度报表沿用现有利润引擎，包含 {data.draftCount} 笔未结算记录，金额待核对；下方日报只显示已结算日。</p>}
                        {salesEmpty && tab === 'sales' && <div className="bc-empty bc-card">本月暂无已结算营业额；未结算日期不当作 0。</div>}
                        {tab === 'sales' && <>
                            <div className="bc-overview"><div><section className="bc-card"><div className="bc-card-heading"><h2>经营日报</h2><select aria-label="选择已结算日" value={selectedDate} disabled={!monthDays.length} onChange={e => setSelectedDate(e.target.value)}>{!monthDays.length && <option value="">未结算</option>}{monthDays.map(d => <option key={d.date} value={d.date}>{d.date.slice(5).replace('-', '月')}日</option>)}</select></div>
                                {day ? <><div className="bc-sales-hero"><div><small>{day.date} · 已结算</small>{settlementAllowed && <span className="bc-weather">{day.weather === 'SUNNY' ? <Sun size={17} /> : day.weather === 'CLOUDY' ? <CloudSun size={17} /> : day.weather === 'HEAVY_RAIN' ? <CloudLightning size={17} /> : day.weather === 'RAIN' ? <CloudRain size={17} /> : null}{WEATHER_OPTIONS.find(w => w.value === day.weather)?.label || (day.weatherMixed ? '天气记录不同' : '天气未填写')}</span>}</div><strong>{money(day.revenue)}</strong><p>{previous && previous.revenue > 0 ? `较上周同日${day.revenue >= previous.revenue ? '增加' : '减少'} ${money(Math.abs(day.revenue - previous.revenue))}（${(Math.abs(day.revenue - previous.revenue) / previous.revenue * 100).toFixed(1)}%）` : '暂无上周同日对照'}</p></div>
                                    {settlementAllowed && <><div className="bc-daily-kpis">{[['店内单数', day.bills ?? '待补'], ['店内单均', plain(day.perBill)], ['堂食人数', day.pax ?? '待补'], ['人均消费', plain(day.perPax)]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
                                        <div className="bc-daily-kpis bc-community" aria-label="熟客与 WhatsApp">{[['熟客', day.community.regulars], ['VIP 到店', day.community.vipVisits], ['WA 新加入', day.community.waJoin], ['WA 订单', day.community.waOrders]].map(([label, value]) => <div key={label}><span>{label}</span><b>{Number(value) > 0 ? value : '—'}</b></div>)}</div>
                                        <RevenueComposition day={day} /></>}
                                    {settlementAllowed && <div className="bc-environment" aria-label="营业日环境因素">{day.holiday && <span className="bc-holiday" title={day.holiday.about}>假日 · {holidayLabel(day.holiday)}</span>}{SPECIAL_CONDITION_OPTIONS.filter(o => day.specialConditions.includes(o.value)).map(o => <span key={o.value}>{o.label}</span>)}{!day.holidayYearCovered && <small>该年假日日历待补充</small>}{day.tomorrowHoliday && <small>次日假日 · {holidayLabel(day.tomorrowHoliday)}</small>}</div>}
                                    {day.legacyGrab && <p className="bc-warning">旧记录缺 Grab 总额，沿用利润引擎暂计净额；待核对。</p>}
                                </> : <p className="bc-muted">本月暂无已结算日报。</p>}
                            </section>{day && settlementAllowed && <details className="bc-channel-details"><summary>各渠道订单与均价 <span>展开明细</span></summary><table><thead><tr><th>渠道</th><th>销售额</th><th>单数</th><th>单均</th></tr></thead><tbody>{day.channels.map(c => <tr key={c.label}><td>{c.label}</td><td>{money(c.amount)}</td><td>{c.needsReview ? '待核对' : c.orders ?? '待补'}</td><td>{money(c.average)}</td></tr>)}</tbody></table><p>单均＝同渠道销售额÷完成单数。缺单数显示待补；有销售额但单数为0需核对。日报只读。</p></details>}</div>
                            <aside><section className="bc-card"><div className="bc-card-heading"><h2>本月经营</h2><small>{data.result.period.start.slice(5)}–{data.result.period.end.slice(5)}</small></div><button className="bc-month-revenue" onClick={() => setDetail(k.revenue)}><span>累计营业额</span><b>{format(k.revenue)}</b><Status k={k.revenue} /></button>
                                <div className="bc-cost-bars">{([['foodRatio', 'food'], ['labourRatio', 'labour']] as const).map(([key, amountKey]) => k[key] && <button key={key} onClick={() => setDetail(k[key])}><span>{k[key].label}</span><b>{format(k[key])}</b>{k[amountKey] && <small className="bc-cost-amount">{format(k[amountKey])}</small>}<i><em style={{ width: `${Math.max(0, Math.min(100, (k[key].value ?? 0) * 100))}%` }} /></i><Status k={k[key]} /></button>)}{(() => { const opex = profitStory(data.result, month, today).lines.find(l => l.key === 'opex'); return opex && <button onClick={() => k.actualProfit && setDetail(k.actualProfit)}><span>经营费用率</span><b>{opex.per100 === null ? '—' : `${opex.per100.toFixed(1)}%`}</b><small className="bc-cost-amount">{money(opex.amount)}</small><i><em style={{ width: `${Math.max(0, Math.min(100, opex.per100 ?? 0))}%` }} /></i><span className="bc-status">租金水电等</span></button>; })()}</div><button className={`bc-month-profit${(k.actualProfit?.value ?? 0) < 0 ? ' is-loss' : ''}`} onClick={() => setDetail(k.actualProfit)}><span>经营利润 <Status k={k.actualProfit} /></span><b>{format(k.actualProfit)}</b></button><div className="bc-links"><button onClick={() => setTab('profit')}>成本明细 ↗</button><button onClick={() => setTab('cash')}>现金与账款 ↗</button></div></section>
                            </aside></div>
                            <div className="bc-chart-tabs"><button aria-pressed={chart === 'week'} onClick={() => setChart('week')}>近7天对比</button><button aria-pressed={chart === 'month'} onClick={() => setChart('month')}>本月与保本</button></div>
                            <div className={`bc-charts bc-show-${chart}`}><BusinessChart days={data.days} month={month} end={monthDays.slice(-1)[0]?.date || data.result.period.end} kind="week" onSelect={setSelectedDate} /><BusinessChart days={data.days} month={month} end={data.result.period.end} kind="month" breakEven={k.breakEvenDay} onSelect={setSelectedDate} onDetail={setDetail} /></div>
                        </>}
                        {tab === 'profit' && <><ProfitView story={profitStory(data.result, month, today)} month={month} integrity={data.result.integrity} onDetail={key => k[key] && setDetail(k[key])} />
                            <details className="bc-card bc-all-metrics"><summary>全部指标（给会计看的原始数字）</summary><div className="bc-metric-grid">{['actualProfit', 'revenue', 'food', 'foodRatio', 'labour', 'labourRatio', 'grossMargin', 'netMargin', 'breakEvenDay', 'breakEvenMonth'].map(key => <React.Fragment key={key}>{metric(key)}</React.Fragment>)}</div></details></>}
                        {tab === 'cash' && <CashView today={today} canAP={can('AP')} canBills={can('BILLS')} canTreasury={can('TREASURY')} onOpen={target => { if (!can(target)) return; if (target === 'AP') navigate('AP'); else setAccountModal(target as 'TREASURY' | 'BILLS'); }} />}
                        <details className="bc-sources"><summary>数据依据与口径</summary><p>来源：现有日结、应付账款、固定账单与薪资。营业额＝店内实收＋外卖实收（跟每日结算一样；外卖实收已扣平台抽成与广告，所以不再另列平台成本，利润不变）。「全部指标」照旧显示利润引擎的原始数字（外卖用平台总额）。旧 Grab 缺总额时沿用引擎暂计净额并提示。日报仅显示已结算记录；月度金额沿用原引擎，若存在未结算记录会单独提示。缺记录不作 0；食材是采购成本，不代表实际耗用。更新于 {new Date(data.result.loadedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Kuala_Lumpur' })}。</p></details>
                    </>}
                </>}
            </>}
        </main></div>
        {accountModal === 'TREASURY' && can('TREASURY') && <TreasuryModule onClose={() => setAccountModal(null)} />}
        {accountModal === 'BILLS' && can('BILLS') && <RecurringBillsModule onClose={() => setAccountModal(null)} />}
        {detail && data && reportsAllowed && section === 'business' && <MetricDialog kpi={detail} onClose={() => setDetail(null)} />}
        {hrOpen && can('HR') && <HRSystem currentEmployee={currentEmployee} onClose={() => setHrOpen(false)} />}
        {aiOpen && reportsAllowed && can('AI_ASSISTANT') && data && (() => {
            const story = profitStory(data.result, month, today);
            const extra = buildAdvisorInsights({ days: data.days, month, costLines: story.lines, revenue: story.revenue, breakEven: story.breakEven, suppliers: advisorSources?.suppliers, workers: advisorSources?.workers, purchaseOrders: advisorSources?.purchaseOrders, inventory: advisorSources?.inventory });
            return <AdvisorPanel focusAnomaly={aiFocus} periodLabel={data.result.period.label} insights={extra.insights} anomalies={extra.anomalies} settledDays={extra.settledDays} loadingMore={!advisorSources}
                evidence={[...buildAdvisorEvidence(data.result, null), ...extra.evidence, ...(advisorSources?.inventoryError ? [{id:'ST99',label:'库存成本资料',value:'未读取',note:advisorSources.inventoryError}] : [])]}
                onClose={() => setAiOpen(false)} onOpenKpi={key => { setAiOpen(false); if (k?.[key]) setDetail(k[key]); }} />;
        })()}
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
    const [beMode, setBeMode] = useState<'weekday' | 'flat'>('weekday');
    const byDate = useMemo(() => new Map(days.map(d => [d.date, d.revenue])), [days]);
    const dates = kind === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(end, i - 6)) : Array.from({ length: Number(end.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    // 每日保本线：按星期几调整（周末目标高、平日低，全月合计不变）；资料不够就每天一样
    const be = kind === 'month' && breakEven?.value !== null && breakEven?.value !== undefined ? breakEven.value : null;
    const plan = useMemo(() => be === null ? null : dailyBreakEvenTargets({ days, month, perDay: be, mode: beMode }), [days, month, be, beMode]);
    const target = (date: string) => plan?.targets[date] ?? be ?? 0;
    const max = Math.max(1, ...dates.flatMap(date => [byDate.get(date) ?? 0, kind === 'week' ? byDate.get(addDays(date, -7)) ?? 0 : 0, be === null ? 0 : target(date)])) * 1.15;
    const w = 700, h = 260, left = 48, base = 215, height = 180, step = (w - left - 15) / dates.length;
    const y = (v: number) => base - v / max * height;
    const currentComplete = dates.every(date => byDate.has(date));
    const previousComplete = dates.every(date => byDate.has(addDays(date, -7)));
    const sum = (shift: number) => dates.reduce((n, date) => n + (byDate.get(addDays(date, shift)) ?? 0), 0);
    // 本月与保本：白话总结（每天要做多少、几天达标、累计比保本多 / 少多少）
    const settled = dates.filter(date => byDate.has(date));
    const hit = be === null ? 0 : settled.filter(date => (byDate.get(date) ?? 0) >= target(date)).length;
    const settledTarget = settled.reduce((n, date) => n + target(date), 0);
    const gap = be === null ? 0 : sum(0) - settledTarget;
    const barColor = (date: string, v: number) => be !== null && v < target(date) ? '#d08a7e' : '#c7a04b';
    const weekdayTargets = plan?.weighted ? [1, 2, 3, 4, 5, 6, 0].map(w => ({ w, v: Object.entries(plan.targets).find(([d]) => new Date(`${d}T00:00:00`).getDay() === w)?.[1] ?? 0 })) : [];
    return <section className={`bc-card bc-chart bc-chart-${kind}`}><div className="bc-card-heading"><h2>{kind === 'week' ? '近7天营业额' : '每天有没有做到保本？'}</h2><button onClick={() => setTable(v => !v)}>{table ? '图表' : '表格'}</button></div>
        {kind === 'week' ? <div className="bc-chart-legend"><span>本7天 {currentComplete ? money(sum(0)) : '资料未齐'}</span><span>前7天 {previousComplete ? money(sum(-7)) : '资料未齐'}</span></div> : breakEven && <>
            <div className="bc-be-row">
                <button className="bc-be" onClick={() => onDetail?.(breakEven)}>{plan?.weighted ? <>保本线按星期调整</> : <>每天要做到 {format(breakEven)} 才不亏</>} <Status k={breakEven} /></button>
                {be !== null && <div className="bc-be-mode" role="group" aria-label="保本线算法">{(['weekday', 'flat'] as const).map(m => <button key={m} aria-pressed={beMode === m} onClick={() => setBeMode(m)}>{m === 'weekday' ? '按星期' : '平均'}</button>)}</div>}
            </div>
            {weekdayTargets.length > 0 && <div className="bc-be-week">{weekdayTargets.map(({ w, v }) => <span key={w} className={w === 0 || w === 6 ? 'is-weekend' : ''}><small>{'日一二三四五六'[w]}</small>{v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}</span>)}</div>}
            {beMode === 'weekday' && plan && !plan.weighted && <p className="bc-be-story">日结资料还不够（要 14 天以上、每个星期几至少 2 天），先按平均算。</p>}
            {be !== null && settled.length > 0 && <p className="bc-be-story">已结算 <b>{settled.length}</b> 天：<b className="is-ok">{hit} 天达到</b>、<b className="is-low">{settled.length - hit} 天没达到</b>。累计营业额 {money(sum(0))}，比 {settled.length} 天的保本 {money(settledTarget)} <b className={gap >= 0 ? 'is-ok' : 'is-low'}>{gap >= 0 ? '多' : '少'} {money(Math.abs(gap))}</b>。</p>}
        </>}
        {table ? <div className="bc-chart-table"><table><thead><tr><th>营业日</th><th>营业额</th>{kind === 'week' && <th>上周同日</th>}{kind === 'month' && be !== null && <th>保本线</th>}</tr></thead><tbody>{dates.map(date => <tr key={date}><td>{date.slice(5)}</td><td>{byDate.has(date) ? money(byDate.get(date)!) : '未结算'}</td>{kind === 'week' && <td>{byDate.has(addDays(date, -7)) ? money(byDate.get(addDays(date, -7))!) : '未结算'}</td>}{kind === 'month' && be !== null && <td className={byDate.has(date) ? (byDate.get(date)! >= target(date) ? 'is-ok' : 'is-low') : ''}>{money(target(date))}</td>}</tr>)}</tbody></table></div> : <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={kind === 'week' ? '近7天与上周同日营业额对比；缺记录为空，非零' : '本月已结算营业额与预估保本线'}>
            {[0, .5, 1].map(t => <g key={t}><line x1={left} x2={w - 10} y1={y(max * t)} y2={y(max * t)} stroke="#e6e8ec" /><text x={left - 8} y={y(max * t) + 4} textAnchor="end">{(max * t / 1000).toFixed(1)}k</text></g>)}
            {dates.map((date, i) => { const value = byDate.get(date), prev = byDate.get(addDays(date, -7)), x = left + step * i + 5, bar = kind === 'week' ? step * .32 : step * .7; return <g key={date}>
                {kind === 'week' && prev !== undefined && <rect x={x} y={y(Math.max(0, prev))} width={bar} height={Math.max(0, prev) / max * height} rx="3" fill="#a3adbd"><title>{addDays(date, -7)} {money(prev)}</title></rect>}
                {value !== undefined ? <g role="button" tabIndex={0} aria-label={`${date} ${money(value)}，查看日报`} onClick={() => date.startsWith(month) && onSelect(date)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (date.startsWith(month)) onSelect(date); } }}><rect x={x + (kind === 'week' ? bar + 2 : 0)} y={y(Math.max(0, value))} width={bar} height={Math.max(2, Math.max(0, value) / max * height)} rx="3" fill={kind === 'month' ? barColor(date, value) : '#c7a04b'} /><title>{date} {money(value)}</title></g> : <text x={x + step * .3} y={base - 5} textAnchor="middle">—</text>}
                {(kind === 'week' || i % 4 === 0 || i === dates.length - 1) && <text x={x + step * .3} y={base + 22} textAnchor="middle">{date.slice(5)}</text>}
            </g>; })}
            {kind === 'month' && be !== null && (plan?.weighted
                ? <path d={dates.map((date, i) => `${i ? 'L' : 'M'}${left + step * i} ${y(target(date))} L${left + step * (i + 1)} ${y(target(date))}`).join(' ')} fill="none" stroke="#53645e" strokeWidth="2" strokeDasharray="6 4" />
                : <line x1={left} x2={w - 10} y1={y(be)} y2={y(be)} stroke="#53645e" strokeWidth="2" strokeDasharray="6 4" />)}
        </svg>}
        <small className="bc-chart-note">{kind === 'week' ? '金色：本7天 · 灰蓝：前7天；缺记录不按零计算。' : plan?.weighted ? `金色＝达到当天保本 · 红色＝没达到 · 虚线＝每天的保本线（按过去 ${plan.sampleDays} 天各星期几的生意比例分配，全月合计不变）；空白为未结算。` : '金色＝达到保本 · 红色＝没达到 · 虚线＝每日保本线（固定开销 ÷ 天数，按目前成本率估算）；空白为未结算。'}</small>
    </section>;
};

/** 资料待补时，告诉老板去哪里补 */
const FIX_HINT: Record<string, string> = {
    '每日结算': '每日结算 → 补上缺的日子',
    '外送平台对账': '每日结算 → 历史 → 批量核对，填平台实际到账',
    '薪资': '人事 → 员工档案补底薪；月底发薪后会变成实际数字',
    '经营费用': '应付账款 / 经常性支出 → 记录租金、水电等账单',
    '食材采购': '应付账款 → 记录供应商的食材账单',
};

/** 成本与利润：白话版。数字全部来自利润引擎，点任何一行看计算依据。 */
const ProfitView = ({ story, month, integrity, onDetail }: { story: ProfitStory; month: string; integrity: { label: string; ok: boolean; detail: string }[]; onDetail: (key: string) => void }) => {
    const m = Number(month.slice(5));
    const amt = (n: number) => `RM ${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const be = story.breakEven;
    return <div className="bc-profit">
        <section className={`bc-card bc-profit-hero ${story.isProfit ? 'is-profit' : 'is-loss'}`}>
            <small>{m} 月{story.monthDone ? '' : '截至目前'}</small>
            <h2>{story.isProfit ? '赚了' : '亏了'} <strong>{amt(story.profit)}</strong></h2>
            {story.profitPer100 !== null && <p>每做 RM100 生意，{story.isProfit ? `最后留下 RM${story.profitPer100.toFixed(2)}` : `反而倒贴 RM${Math.abs(story.profitPer100).toFixed(2)}`}。</p>}
            <p className="bc-profit-final">{story.isFinal ? '这是最终数字：月份已结束，资料都齐了。' : `还不是最终数字${story.monthDone ? '' : '：月份还没结束'}${story.pending.length ? `${story.monthDone ? '：' : '，'}还有 ${story.pending.length} 项资料待补（看最下面）` : ''}。`}</p>
        </section>

        <section className="bc-card">
            <div className="bc-card-heading"><h2>钱去了哪里</h2><small>点任何一行看怎么算</small></div>
            <div className="bc-statement">
                <button className="bc-statement-row is-total" onClick={() => onDetail('revenue')}><span><b>营业额</b><small>店内实收 + 外卖实收（跟每日结算一样）</small></span><em /><strong>{amt(story.revenue)}</strong></button>
                {story.lines.map(l => <button key={l.key} className="bc-statement-row" onClick={() => onDetail(l.kpi)}>
                    <span><b>− {l.label}</b><small>{l.hint}</small></span>
                    <em>{l.per100 !== null && <>每 RM100 花 <i>RM{l.per100.toFixed(2)}</i>{l.reference && <u>{l.reference}</u>}</>}</em>
                    <strong>{amt(l.amount)}</strong>
                </button>)}
                <button className={`bc-statement-row is-result ${story.isProfit ? 'is-profit' : 'is-loss'}`} onClick={() => onDetail('actualProfit')}><span><b>= {story.isProfit ? '赚' : '亏'}</b></span><em>{story.profitPer100 !== null && <>每 RM100 {story.isProfit ? '留下' : '倒贴'} <i>RM{Math.abs(story.profitPer100).toFixed(2)}</i></>}</em><strong>{story.isProfit ? '' : '−'}{amt(story.profit)}</strong></button>
            </div>
            {story.revenue > 0 && <div className="bc-split" role="img" aria-label="每 RM100 营业额的去向">
                {story.lines.filter(l => l.amount > 0 && l.per100).map(l => <i key={l.key} className={`bc-split-${l.key}`} style={{ flexGrow: l.amount }} title={`${l.label} RM${l.per100!.toFixed(2)}`} />)}
                {story.isProfit && story.profit > 0 && <i className="bc-split-profit" style={{ flexGrow: story.profit }} title="留下的利润" />}
            </div>}
            {story.revenue > 0 && <div className="bc-split-legend">{story.lines.filter(l => l.amount > 0).map(l => <span key={l.key}><i className={`bc-split-${l.key}`} />{l.label}</span>)}{story.isProfit && story.profit > 0 && <span><i className="bc-split-profit" />利润</span>}</div>}
        </section>

        {be && <section className="bc-card bc-breakeven">
            <div className="bc-card-heading"><h2>要做多少生意才不亏</h2><button onClick={() => onDetail('breakEvenMonth')}>怎么算 ↗</button></div>
            <p className="bc-be-line">这个月要做到 <b>{amt(be.target)}</b> 才打平{be.perDay !== null && <>（平均每天 <b>{amt(be.perDay)}</b>）</>}。</p>
            <div className="bc-be-bar"><i style={{ width: `${be.progress * 100}%` }} /></div>
            <div className="bc-be-legend"><span>已经做了 {amt(story.revenue)}</span><span>{Math.round(be.progress * 100)}%</span></div>
            {story.monthDone
                ? <p className="bc-be-line">{story.revenue >= be.target ? `超过保本 ${amt(story.revenue - be.target)}。` : `还差 ${amt(be.target - story.revenue)} 才打平。`}</p>
                : <>
                    {be.gap !== null && be.remaining !== 0 && <p className="bc-be-line">{be.gap >= 0 ? <>比打平的进度<b className="is-good">超前 {amt(be.gap)}</b>。</> : <>比打平的进度<b className="is-bad">落后 {amt(be.gap)}</b>（照已经结算的天数，本来应该做到更多）。</>}</p>}
                    {be.remaining !== null && be.remaining > 0 && be.needPerDayLeft !== null && <p className="bc-be-line">剩下 {be.daysLeft} 天（含今天），每天要做 <b>{amt(be.needPerDayLeft)}</b> 才能打平。</p>}
                    {be.remaining === 0 && <p className="bc-be-line"><b className="is-good">这个月已经过了保本线</b>，之后每一单都在赚。</p>}
                </>}
            <p className="bc-muted">保本额 =（员工薪资 + 租金水电等固定开销）÷ 扣掉食材和外卖抽成后剩下的比例。</p>
        </section>}

        <details className="bc-card bc-why">
            <summary>{story.pending.length ? <><AlertCircle size={16} />为什么还不是最终数字？（{story.pending.length} 项待补）</> : <><CheckCircle2 size={16} />资料检查：都齐了</>}</summary>
            <ul>{integrity.map(i => <li key={i.label} className={i.ok ? 'ok' : 'bad'}>{i.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}<b>{i.label}</b><span>{i.detail}{!i.ok && FIX_HINT[i.label] && <small>怎么补：{FIX_HINT[i.label]}</small>}</span></li>)}</ul>
        </details>
    </div>;
};

/** 现金与账款：要付的钱一眼看完（只读），点一行打开原来的模块处理 */
const CashView = ({ today, canAP, canBills, canTreasury, onOpen }: { today: string; canAP: boolean; canBills: boolean; canTreasury: boolean; onOpen: (target: 'AP' | 'BILLS' | 'TREASURY') => void }) => {
    type Data = { ap: ReturnType<typeof summarizePayables> | null; bills: PayRow[] | null; closing: ReturnType<typeof latestClosing> | undefined };
    const [data, setData] = useState<Data | null>(null);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let active = true;
        setData(null); setError('');
        Promise.all([
            canAP ? getDocs(query(collection(db, 'standalone_expenses'), where('paymentStatus', 'in', ['UNPAID', 'PARTIAL']))).then(snap => summarizePayables(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)), today)) : Promise.resolve(null),
            canBills ? DataManager.getRecurringBills().then(b => unpaidRecurringBills(b as any, today)) : Promise.resolve(null),
            canTreasury ? getDocs(collection(db, 'treasury_monthly_closings')).then(snap => latestClosing(snap.docs.map(d => d.data() as any))) : Promise.resolve(undefined),
        ]).then(([ap, bills, closing]) => { if (active) setData({ ap, bills, closing }); })
            .catch(() => { if (active) setError('暂时无法读取账款资料，请检查网络后重试。'); });
        return () => { active = false; };
    }, [today, canAP, canBills, canTreasury, reload]);

    const amt = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const when = (r: PayRow) => r.days < 0 ? `逾期 ${-r.days} 天` : r.days === 0 ? '今天到期' : `${r.days} 天后`;
    if (!canAP && !canBills && !canTreasury) return <p className="bc-card">当前账号未获账款或资金模块权限。</p>;
    if (error) return <div role="alert" className="bc-card bc-error">{error}<button onClick={() => setReload(v => v + 1)}>重试</button></div>;
    if (!data) return <div className="bc-card bc-loading" role="status">正在读取未付账单与资金…</div>;

    const { ap, bills, closing } = data;
    const overdueBills = (bills || []).filter(b => b.days < 0);
    const soonBills = (bills || []).filter(b => b.days >= 0 && b.days <= 7);
    const overdue = [...(ap?.overdue || []), ...overdueBills].sort((a, b) => a.days - b.days);
    const soon = [...(ap?.dueSoon || []), ...soonBills].sort((a, b) => a.days - b.days);
    const week = ap ? payThisWeek(ap, bills || []) : soon.concat(overdue).reduce((n, r) => n + r.amount, 0);
    const Row = ({ r }: { r: PayRow }) => <button className="bc-pay-row" onClick={() => onOpen(r.kind === 'AP' ? 'AP' : 'BILLS')}>
        <span><b>{r.name}</b><small>{r.kind === 'BILL' ? '固定账单' : '应付账款'}{r.note ? ` · ${r.note}` : ''} · 到期 {r.due.slice(5)}</small></span>
        <em className={r.days < 0 ? 'is-late' : ''}>{when(r)}</em><strong>{amt(r.amount)}</strong></button>;
    const List = ({ rows, empty, limit = 8 }: { rows: PayRow[]; empty: string; limit?: number }) => rows.length === 0 ? <p className="bc-muted">{empty}</p> : <div className="bc-pay-list">{rows.slice(0, limit).map(r => <Row key={`${r.kind}-${r.id}`} r={r} />)}{rows.length > limit && <p className="bc-muted">还有 {rows.length - limit} 笔，打开模块看全部。</p>}</div>;

    return <div className="bc-cash">
        <p className="bc-muted bc-cash-asof">以今天（{today.slice(5).replace('-', '/')}）为准，不受上面的月份影响。</p>
        <div className="bc-cash-tiles">
            <section className={`bc-card bc-cash-tile ${overdue.length ? 'is-late' : ''}`}><span>已逾期未付</span><strong>{amt(overdue.reduce((n, r) => n + r.amount, 0))}</strong><small>{overdue.length ? `${overdue.length} 笔，最久逾期 ${-overdue[0].days} 天` : '没有逾期'}</small></section>
            <section className="bc-card bc-cash-tile"><span>这 7 天要付（含逾期）</span><strong>{amt(week)}</strong><small>{soon.length} 笔即将到期</small></section>
            {ap && <section className="bc-card bc-cash-tile"><span>应付账款未付总额</span><strong>{amt(ap.total)}</strong><small>{ap.count} 张账单（不含冻结）</small></section>}
            {canTreasury && <section className="bc-card bc-cash-tile"><span>{closing ? `${Number(closing.month.slice(5))} 月底资金${closing.counted ? '（实点）' : ''}` : '月底资金'}</span><strong>{closing ? amt(closing.total) : '—'}</strong><small>{closing ? `现金 ${amt(closing.cash)} · 银行 ${amt(closing.bank)}` : '还没有做过月结'}</small></section>}
        </div>
        <div className="bc-cash-grid">
            <section className="bc-card"><div className="bc-card-heading"><h2>已逾期，先处理</h2><small>点一行去付款</small></div><List rows={overdue} empty="没有逾期的账单。" /></section>
            <section className="bc-card"><div className="bc-card-heading"><h2>7 天内到期</h2></div><List rows={soon} empty="这 7 天没有要到期的账单。" /></section>
        </div>
        <section className="bc-card"><div className="bc-card-heading"><h2>打开模块处理</h2></div><div className="bc-cash-links">
            {canAP && <button onClick={() => onOpen('AP')}><b>应付账款</b><small>供应商账单、付款、开 PV</small><ChevronRight size={16} /></button>}
            {canBills && <button onClick={() => onOpen('BILLS')}><b>经常性支出</b><small>租金、水电等固定账单</small><ChevronRight size={16} /></button>}
            {canTreasury && <button onClick={() => onOpen('TREASURY')}><b>资金与现金</b><small>现金、银行流水与月结</small><ChevronRight size={16} /></button>}
        </div><p className="bc-muted">这里只看不改；付款、记账都在原来的模块里做。销售和经营利润仍按业务发生制计算。</p></section>
    </div>;
};
