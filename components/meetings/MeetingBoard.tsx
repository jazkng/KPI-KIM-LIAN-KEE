import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, QrCode, RefreshCw, Users } from 'lucide-react';
import type { Employee } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { shortName } from '../../utils/hr/hrOverview';
import {
    checkinColor, COLOR_CLASS, defaultAttendees, MEETING_LABEL, meetingQrUrl, myTime, startableTypes, validateMeeting,
    type Meeting, type MeetingCheckin, type MeetingType,
} from '../../utils/meetings/meetingLogic';
import { createMeeting, listCheckins, listRecentMeetings, setMeetingStatus } from '../../utils/meetings/meetingStore';
import { Chips, Field, inputCls, Sheet } from '../tasks/TaskForms';
import { QrImage } from './QrImage';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const dateText = (d: string) => { const [y, m, day] = d.split('-').map(Number); return `${m}/${day}（${WD[new Date(y, m - 1, day).getDay()]}）`; };

/** 发起人用：会议列表、发起、看签到名单、打印墙上 QR。L4 以下不会看到这个卡片。 */
export const MeetingBoard: React.FC<{ actor: Employee }> = ({ actor }) => {
    const types = startableTypes(actor);
    const [meetings, setMeetings] = useState<Meeting[] | null>(null);
    const [reload, setReload] = useState(0);
    const [creating, setCreating] = useState(false);
    const [open, setOpen] = useState<Meeting | null>(null);
    const [printing, setPrinting] = useState(false);
    useEffect(() => {
        let on = true;
        listRecentMeetings().then(m => on && setMeetings(m.filter(x => x.status !== 'CANCELLED' && types.includes(x.type)))).catch(() => on && setMeetings([]));
        return () => { on = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]);
    if (!types.length) return null;
    const today = getMalaysiaDateString();
    const upcoming = (meetings || []).filter(m => m.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const past = (meetings || []).filter(m => m.date < today).slice(0, 6);

    const Row = (m: Meeting) => <button key={m.id} onClick={() => setOpen(m)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-stone-200 text-left active:bg-stone-50">
        <span className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-black ${m.type === 'MANAGEMENT' ? 'bg-stone-900 text-[#FFD200]' : 'bg-amber-50 text-amber-800'}`}>{m.type === 'MANAGEMENT' ? '管理层' : '店面'}</span>
        <span className="flex-1 min-w-0"><b className="block text-sm font-black text-stone-900">{dateText(m.date)} {m.start}–{m.end}</b>
            <small className="block text-xs text-stone-500 font-semibold">{m.attendeeIds.length} 人 · {m.status === 'ENDED' ? '已结束' : m.date === today ? '今天' : '未开始'}</small></span>
    </button>;

    return <div className="space-y-2.5">
        <div className="flex items-center gap-2">
            <h3 className="flex-1 text-sm font-black text-stone-800 flex items-center gap-1.5"><Users size={15} /> 会议</h3>
            <button onClick={() => setPrinting(true)} className="h-9 px-3 rounded-lg border border-stone-200 bg-white text-xs font-black text-stone-700 flex items-center gap-1"><QrCode size={14} />墙上 QR</button>
            <button onClick={() => setCreating(true)} className="h-9 px-3 rounded-lg bg-stone-900 text-[#FFD200] text-xs font-black flex items-center gap-1"><Plus size={14} />发起</button>
            <button onClick={() => setReload(v => v + 1)} className="w-9 h-9 rounded-lg grid place-items-center text-stone-400" aria-label="刷新"><RefreshCw size={14} /></button>
        </div>
        {meetings === null ? <p className="text-xs text-stone-400">读取中…</p>
            : !upcoming.length && !past.length ? <p className="text-xs text-stone-400">还没有会议</p>
                : <>{upcoming.map(Row)}{past.length > 0 && <details><summary className="text-xs font-bold text-stone-400 py-1">以前的会议</summary><div className="space-y-2 mt-1">{past.map(Row)}</div></details>}</>}
        {creating && <MeetingCreateSheet actor={actor} types={types} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setReload(v => v + 1); }} />}
        {open && <MeetingDetailSheet meeting={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); setReload(v => v + 1); }} />}
        {printing && <QrPrintSheet types={types} onClose={() => setPrinting(false)} />}
    </div>;
};

const useEmployees = () => {
    const [list, setList] = useState<Employee[]>([]);
    useEffect(() => { DataManager.getEmployees().then(l => setList(l.filter(e => !e.isArchived && e.status !== 'TERMINATED'))).catch(() => setList([])); }, []);
    return list;
};

const MeetingCreateSheet: React.FC<{ actor: Employee; types: MeetingType[]; onClose: () => void; onDone: () => void }> = ({ actor, types, onClose, onDone }) => {
    const employees = useEmployees();
    const [type, setType] = useState<MeetingType>(types.includes('STORE') ? 'STORE' : types[0]);
    const [date, setDate] = useState(getMalaysiaDateString());
    const [start, setStart] = useState('10:00');
    const [end, setEnd] = useState('11:00');
    const [picked, setPicked] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false), [err, setErr] = useState('');
    const attendees = picked ?? defaultAttendees(employees, type);
    const toggle = (id: string) => setPicked(attendees.includes(id) ? attendees.filter(x => x !== id) : [...attendees, id]);
    const save = async () => {
        const problem = validateMeeting({ date, start, end, attendeeIds: attendees });
        if (problem) return setErr(problem);
        setBusy(true); setErr('');
        try { await createMeeting({ type, date, start, end, attendeeIds: attendees, createdBy: actor.id, createdByName: actor.name }); onDone(); }
        catch (e: any) { setErr(e?.message || '建立失败'); } finally { setBusy(false); }
    };
    const sorted = useMemo(() => [...employees].sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name)), [employees]);
    return <Sheet title="发起会议" onClose={onClose} footer={<>
        {err && <p className="mb-2 text-sm font-bold text-rose-600">{err}</p>}
        <button onClick={save} disabled={busy} className="w-full min-h-[52px] rounded-2xl bg-stone-900 text-[#FFD200] font-black disabled:opacity-50">{busy ? '建立中…' : '建立会议'}</button>
    </>}>
        {types.length > 1 && <Field label="会议"><Chips value={type} options={types.map(t => ({ v: t, label: MEETING_LABEL[t] }))} onChange={t => { setType(t); setPicked(null); }} /></Field>}
        <Field label={`日期 · 星期${WD[new Date(date).getDay()] || ''}`}><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
            <Field label="开始"><input type="time" value={start} onChange={e => setStart(e.target.value)} className={inputCls} /></Field>
            <Field label="结束"><input type="time" value={end} onChange={e => setEnd(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label={`出席名单 · ${attendees.length} 人（点名字可以加减）`}>
            <div className="flex flex-wrap gap-1.5">
                {sorted.map(e => <button key={e.id} type="button" onClick={() => toggle(e.id)}
                    className={`min-h-[36px] px-3 rounded-full text-[13px] font-bold border ${attendees.includes(e.id) ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-stone-500 border-stone-200'}`}>{shortName(e)}</button>)}
            </div>
        </Field>
        <p className="text-xs text-stone-500">员工在开始前 15 分钟到结束之间扫墙上的「{MEETING_LABEL[type]}」QR 就算签到。</p>
    </Sheet>;
};

const MeetingDetailSheet: React.FC<{ meeting: Meeting; onClose: () => void; onChanged: () => void }> = ({ meeting: m, onClose, onChanged }) => {
    const employees = useEmployees();
    const [checkins, setCheckins] = useState<MeetingCheckin[] | null>(null);
    const [reload, setReload] = useState(0);
    useEffect(() => { let on = true; listCheckins(m.id).then(c => on && setCheckins(c)).catch(() => on && setCheckins([])); return () => { on = false; }; }, [m.id, reload]);
    const byEmp = Object.fromEntries((checkins || []).map(c => [c.employeeId, c]));
    const name = (id: string) => { const e = employees.find(x => x.id === id); return e ? shortName(e) : id; };
    const rows = m.attendeeIds.map(id => ({ id, c: byEmp[id], t: byEmp[id] ? myTime(new Date(byEmp[id].checkedInAt)) : null }))
        .sort((a, b) => (a.t || '99').localeCompare(b.t || '99'));
    const done = rows.filter(r => r.c).length;
    const setStatus = async (s: Meeting['status']) => { await setMeetingStatus(m.id, s); onChanged(); };
    return <Sheet title={`${MEETING_LABEL[m.type]} · ${dateText(m.date)}`} onClose={onClose} footer={m.status === 'OPEN' ? <div className="flex gap-2">
        {!checkins?.length && <button onClick={() => setStatus('CANCELLED')} className="flex-1 min-h-[48px] rounded-2xl bg-stone-100 text-stone-600 font-black">取消会议</button>}
        <button onClick={() => setStatus('ENDED')} className="flex-[2] min-h-[48px] rounded-2xl bg-stone-900 text-[#FFD200] font-black">结束会议</button>
    </div> : undefined}>
        <div className="flex items-center justify-between">
            <p className="text-sm font-black text-stone-700">{m.start}–{m.end} · 已签 {done}/{m.attendeeIds.length}</p>
            <button onClick={() => setReload(v => v + 1)} className="h-9 px-3 rounded-lg border border-stone-200 bg-white text-xs font-black flex items-center gap-1"><RefreshCw size={13} />刷新</button>
        </div>
        <div className="flex gap-1.5 text-[11px] font-bold">
            {([['GREEN', '准时'], ['YELLOW', '10 分钟内'], ['ORANGE', '更晚'], ['GRAY', '没签']] as const).map(([c, l]) => <span key={c} className={`px-2 py-0.5 rounded-md border ${COLOR_CLASS[c]}`}>{l}</span>)}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
            {rows.map(r => <div key={r.id} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${COLOR_CLASS[checkinColor(m.start, r.t)]}`}>
                <b className="text-sm font-black truncate">{name(r.id)}</b><span className="text-sm font-black tabular-nums">{r.t || '—'}</span>
            </div>)}
        </div>
    </Sheet>;
};

/** 打印墙上用的固定 QR（每种会议一张） */
const QrPrintSheet: React.FC<{ types: MeetingType[]; onClose: () => void }> = ({ types, onClose }) => {
    const [type, setType] = useState<MeetingType>(types.includes('STORE') ? 'STORE' : types[0]);
    const url = meetingQrUrl(type, window.location.origin);
    const print = () => {
        const img = document.querySelector<HTMLImageElement>('#meeting-qr-print img');
        const w = window.open('', '_blank');
        if (!w || !img) return;
        w.document.write(`<!doctype html><title>${MEETING_LABEL[type]} QR</title><body style="margin:0;font-family:sans-serif;text-align:center;padding:40px">
            <h1 style="font-size:44px;margin:0 0 8px">${MEETING_LABEL[type]} 签到</h1>
            <p style="font-size:20px;margin:0 0 24px">Meeting check-in · 用手机相机扫描，登录后按「签到」</p>
            <img src="${img.src}" style="width:420px;height:420px" />
            <p style="font-size:16px;color:#666;margin-top:16px">只在会议时间内有效 · 金莲记</p></body>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };
    return <Sheet title="墙上 QR" onClose={onClose} footer={<button onClick={print} className="w-full min-h-[52px] rounded-2xl bg-stone-900 text-[#FFD200] font-black flex items-center justify-center gap-2"><Printer size={18} />打印</button>}>
        {types.length > 1 && <Chips value={type} options={types.map(t => ({ v: t, label: MEETING_LABEL[t] }))} onChange={setType} />}
        <div id="meeting-qr-print" className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-2">
            <b className="block text-xl font-black">{MEETING_LABEL[type]} 签到</b>
            <QrImage text={url} size={600} className="mx-auto w-64 h-64" />
            <p className="text-[11px] text-stone-400 break-all">{url}</p>
        </div>
        <p className="text-xs text-stone-500">这张码固定不变，打印一次贴墙就可以一直用。每次开会只要在上面「发起」设定日期和时间。</p>
    </Sheet>;
};
