import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import type { Employee } from '../../types';
import { getMalaysiaDateString } from '../../utils/dateHelper';
import { checkinColor, COLOR_CLASS, findActiveMeeting, MEETING_LABEL, myTime, type Meeting, type MeetingType } from '../../utils/meetings/meetingLogic';
import { checkInNow, listMeetingsOn, type CheckinResult } from '../../utils/meetings/meetingStore';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const dateText = (d: string) => { const [y, m, day] = d.split('-').map(Number); return `${m}/${day}（${WD[new Date(y, m - 1, day).getDay()]}）`; };

/** 扫到签到码后的画面：显示是哪一场，按「签到」才写入 */
export const CheckinScreen: React.FC<{ type: MeetingType; via: 'CAMERA' | 'APP_SCAN'; employee: Employee; onClose: () => void }> = ({ type, via, employee, onClose }) => {
    const today = getMalaysiaDateString();
    const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<CheckinResult | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        let on = true;
        listMeetingsOn(today).then(list => on && setMeeting(findActiveMeeting(list, type, today, myTime()))).catch(() => on && setMeeting(null));
        return () => { on = false; };
    }, [today, type]);

    const go = async () => {
        setBusy(true); setErr('');
        try { setResult(await checkInNow(type, employee, today, myTime(), via)); }
        catch (e: any) { setErr(e?.message || '签到失败，请再试一次'); }
        finally { setBusy(false); }
    };

    const invited = meeting ? meeting.attendeeIds.includes(employee.id) : false;
    const body = () => {
        if (result?.ok) {
            const t = myTime(new Date(result.checkin.checkedInAt));
            return <div className="text-center space-y-3">
                <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
                <p className="text-lg font-black text-stone-900">{result.already ? '你已经签到了' : '签到成功'}</p>
                <span className={`inline-block px-4 py-2 rounded-xl border text-2xl font-black tabular-nums ${COLOR_CLASS[checkinColor(result.meeting.start, t)]}`}>{t}</span>
                <p className="text-sm font-bold text-stone-500">{MEETING_LABEL[result.meeting.type]} · {dateText(result.meeting.date)} {result.meeting.start}–{result.meeting.end}</p>
            </div>;
        }
        if (meeting === undefined) return <p className="text-center text-stone-400"><Loader2 className="inline animate-spin" /></p>;
        if (!meeting || (result && result.ok === false && result.reason === 'NO_MEETING')) return <div className="text-center space-y-3">
            <XCircle size={52} className="mx-auto text-stone-300" />
            <p className="text-lg font-black text-stone-800">现在没有{MEETING_LABEL[type]}</p>
            <p className="text-sm text-stone-500">只有在会议时间内（开始前 15 分钟起）扫码才有效。</p>
        </div>;
        if (!invited || (result && !result.ok)) return <div className="text-center space-y-3">
            <XCircle size={52} className="mx-auto text-rose-400" />
            <p className="text-lg font-black text-stone-800">你不在这场会议的名单</p>
            <p className="text-sm text-stone-500">{MEETING_LABEL[meeting.type]} · {dateText(meeting.date)} {meeting.start}–{meeting.end}<br />有问题请找发起人：{meeting.createdByName}</p>
        </div>;
        return <div className="text-center space-y-4">
            <p className="text-sm font-black text-stone-500">{employee.name} · {employee.id}</p>
            <p className="text-2xl font-black text-stone-900">{MEETING_LABEL[meeting.type]}</p>
            <p className="text-base font-bold text-stone-600">{dateText(meeting.date)} {meeting.start}–{meeting.end}</p>
            <button onClick={go} disabled={busy} className="w-full min-h-[56px] rounded-2xl bg-stone-900 text-[#FFD200] text-lg font-black disabled:opacity-50">{busy ? '签到中…' : '签到'}</button>
            {err && <p className="text-sm font-bold text-rose-600">{err}</p>}
        </div>;
    };

    return createPortal(
        <div className="fixed inset-0 z-[350] bg-black/55 flex items-end md:items-center justify-center">
            <div className="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4 shadow-2xl">
                <div className="flex justify-between items-center">
                    <b className="text-base font-black">会议签到</b>
                    <button onClick={onClose} className="w-10 h-10 rounded-xl bg-stone-100 grid place-items-center" aria-label="关闭"><X size={18} /></button>
                </div>
                {body()}
            </div>
        </div>, document.body);
};
