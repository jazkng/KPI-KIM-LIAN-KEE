export interface ShiftConfig {
    id: string;
    name: string;
    time: string;
    color: string;
}

export interface RosterStatusItem {
    id: string;
    label: string;
    short: string;
    color: string;
    mobileBg: string;
    isShift?: boolean;
}

export const ROSTER_STATUSES: Record<string, RosterStatusItem> = {
    UNASSIGNED: {
        id: 'UNASSIGNED',
        label: '未排班',
        short: '—',
        color: 'bg-gray-50 text-gray-400 border-gray-100',
        mobileBg: 'bg-gray-50/50 border-dashed border-gray-200 text-gray-300'
    },
    WORK: {
        id: 'WORK',
        label: '常规班',
        short: 'W',
        color: 'bg-green-50 text-green-700 border-green-200',
        mobileBg: 'bg-green-50/40 border-green-200 text-green-700'
    },
    MORNING: {
        id: 'MORNING',
        label: '早班',
        short: '早',
        color: 'bg-amber-50 text-amber-800 border-amber-200',
        mobileBg: 'bg-amber-50/40 border-amber-200 text-amber-800',
        isShift: true
    },
    AFTERNOON: {
        id: 'AFTERNOON',
        label: '中班',
        short: '中',
        color: 'bg-sky-50 text-sky-800 border-sky-200',
        mobileBg: 'bg-sky-50/40 border-sky-200 text-sky-800',
        isShift: true
    },
    NIGHT: {
        id: 'NIGHT',
        label: '晚班',
        short: '晚',
        color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        mobileBg: 'bg-indigo-50/40 border-indigo-200 text-indigo-800',
        isShift: true
    },
    OFF: {
        id: 'OFF',
        label: '休息',
        short: 'OFF',
        color: 'bg-gray-100 text-gray-500 border-gray-200 font-bold',
        mobileBg: 'bg-gray-100 border-gray-300 text-gray-500 font-bold'
    },
    LEAVE: {
        id: 'LEAVE',
        label: '事假 (UL)',
        short: 'UL',
        color: 'bg-orange-50 text-orange-700 border-orange-200',
        mobileBg: 'bg-orange-50/40 border-orange-200 text-orange-700'
    },
    MC: {
        id: 'MC',
        label: '病假 (MC)',
        short: 'MC',
        color: 'bg-red-50 text-red-700 border-red-200 font-medium',
        mobileBg: 'bg-red-50/40 border-red-200 text-red-700 font-medium'
    },
    ANNUAL: {
        id: 'ANNUAL',
        label: '年假 (AL)',
        short: 'AL',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        mobileBg: 'bg-blue-50/40 border-blue-200 text-blue-700'
    },
    ABSENT: {
        id: 'ABSENT',
        label: '缺席',
        short: 'ABS',
        color: 'bg-purple-50 text-purple-700 border-purple-200 font-semibold',
        mobileBg: 'bg-purple-50/40 border-purple-200 text-purple-700 font-semibold'
    },
    PENDING: {
        id: 'PENDING',
        label: '待定',
        short: '?',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        mobileBg: 'bg-yellow-50/40 border-yellow-200 text-yellow-700'
    },
    HOLIDAY: {
        id: 'HOLIDAY',
        label: '公假',
        short: 'H',
        color: 'bg-pink-50 text-pink-700 border-pink-200',
        mobileBg: 'bg-pink-50/40 border-pink-200 text-pink-700'
    }
};

// Default dynamic Malaysian Holidays
export interface HolidayItem {
    date: string;
    name: string;
}

export const DEFAULT_MALAYSIAN_HOLIDAYS: HolidayItem[] = [
    { date: '2026-01-01', name: 'New Year Day' },
    { date: '2026-02-17', name: 'Chinese New Year' },
    { date: '2026-02-18', name: 'Chinese New Year 2nd Day' },
    { date: '2026-05-01', name: 'Labour Day' },
    { date: '2026-05-31', name: 'Wesak Day' },
    { date: '2026-06-03', name: 'Agong Birthday' },
    { date: '2026-08-31', name: 'Merdeka Day' },
    { date: '2026-09-16', name: 'Malaysia Day' },
    { date: '2026-12-25', name: 'Christmas Day' }
];

export const DEFAULT_SHIFT_TIMES = {
    MORNING: '10:00–18:00',
    AFTERNOON: '14:00–22:00',
    NIGHT: '17:00–01:00'
};

export const DEFAULT_MIN_COVERAGE: Record<string, number> = {
    'KITCHEN': 3,
    'FLOOR': 2,
    'BAR': 1,
    'DISHWASH': 1,
    'BACK_OFFICE': 1,
    'OTHER': 1
};
