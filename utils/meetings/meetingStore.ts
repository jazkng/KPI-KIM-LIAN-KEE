// ============================================================================
// 会议签到：资料库读写
// 新集合（V1 不读不写）：meetings、meeting_checkins
// 写入只在按「建立会议 / 签到 / 结束」时发生；签到时间用服务器时间。
// ============================================================================
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { Employee } from '../../types';
import { checkinDocId, checkinProblem, findActiveMeeting, type Meeting, type MeetingCheckin, type MeetingType } from './meetingLogic';

const MEETINGS = 'meetings', CHECKINS = 'meeting_checkins';
const newId = () => `mtg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const createMeeting = async (m: Omit<Meeting, 'id' | 'status' | 'createdAt'>) => {
    const meeting: Meeting = { ...m, id: newId(), status: 'OPEN', createdAt: new Date().toISOString() };
    await setDoc(doc(db, MEETINGS, meeting.id), JSON.parse(JSON.stringify(meeting)));
    return meeting;
};

/** 最近的会议（新到旧） */
export const listRecentMeetings = async (max = 60) => {
    const snap = await getDocs(query(collection(db, MEETINGS), orderBy('date', 'desc'), limit(max)));
    return snap.docs.map(d => d.data() as Meeting);
};

export const listMeetingsOn = async (date: string) => {
    const snap = await getDocs(query(collection(db, MEETINGS), where('date', '==', date)));
    return snap.docs.map(d => d.data() as Meeting);
};

export const setMeetingStatus = (id: string, status: Meeting['status']) => updateDoc(doc(db, MEETINGS, id), { status });

const toCheckin = (data: any): MeetingCheckin => ({
    id: data.id, meetingId: data.meetingId, employeeId: data.employeeId, employeeName: data.employeeName, via: data.via,
    checkedInAt: data.serverAt?.toDate ? data.serverAt.toDate().toISOString() : data.clientAt,
});

export const listCheckins = async (meetingId: string) => {
    const snap = await getDocs(query(collection(db, CHECKINS), where('meetingId', '==', meetingId)));
    return snap.docs.map(d => toCheckin(d.data()));
};

/** 某员工某段日期的签到（以后积分用） */
export const listCheckinsFor = async (employeeId: string) => {
    const snap = await getDocs(query(collection(db, CHECKINS), where('employeeId', '==', employeeId)));
    return snap.docs.map(d => toCheckin(d.data()));
};

export type CheckinResult =
    | { ok: true; meeting: Meeting; checkin: MeetingCheckin; already: boolean }
    | { ok: false; reason: 'NO_MEETING' | 'NOT_INVITED'; meeting: Meeting | null };

/** 找现在正在开的这种会议，签到（同一人同一场只记一次） */
export const checkInNow = async (type: MeetingType, emp: Pick<Employee, 'id' | 'name'>, date: string, time: string, via: MeetingCheckin['via']): Promise<CheckinResult> => {
    const meeting = findActiveMeeting(await listMeetingsOn(date), type, date, time);
    const problem = checkinProblem(meeting, emp.id);
    if (problem || !meeting) return { ok: false, reason: problem || 'NO_MEETING', meeting };
    const ref = doc(db, CHECKINS, checkinDocId(meeting.id, emp.id));
    const already = await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (snap.exists()) return true;
        tx.set(ref, { id: ref.id, meetingId: meeting.id, meetingType: meeting.type, meetingDate: meeting.date, employeeId: emp.id, employeeName: emp.name, via, clientAt: new Date().toISOString(), serverAt: serverTimestamp() });
        return false;
    });
    const saved = await getDoc(ref);
    return { ok: true, meeting, checkin: toCheckin(saved.data()), already };
};
