import type { MeetingType } from '../../utils/meetings/meetingLogic';

/** 扫到签到码（或从 QR 链接打开）→ 通知 App 打开签到页 */
export const CHECKIN_EVENT = 'klk-meeting-checkin';
export const requestCheckin = (type: MeetingType, via: 'CAMERA' | 'APP_SCAN') =>
    window.dispatchEvent(new CustomEvent(CHECKIN_EVENT, { detail: { type, via } }));
