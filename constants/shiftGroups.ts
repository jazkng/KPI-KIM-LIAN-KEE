// ============================================================================
// 👥 Group A / Group B
// ----------------------------------------------------------------------------
// 资料库里沿用员工的 shiftGroup（1 / 2），考勤早就用它决定上下班时间：
//   shiftGroup 1（或没设定）= Group A → 「排班设置」的班次 1 时间
//   shiftGroup 2            = Group B → 「排班设置」的班次 2 时间
// 这里只是把画面上的名称统一成 Group A / Group B。
// ============================================================================

export type ShiftGroupKey = 'A' | 'B' | 'NONE';

export const SHIFT_GROUP_META: Record<ShiftGroupKey, { label: string; short: string; fg: string; bg: string; border: string; solid: string }> = {
    A: { label: 'Group A', short: 'A', fg: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD', solid: '#2563EB' },
    B: { label: 'Group B', short: 'B', fg: '#C2410C', bg: '#FFF7ED', border: '#FDBA74', solid: '#EA580C' },
    NONE: { label: '未分组', short: '—', fg: '#78716C', bg: '#F5F5F4', border: '#D6D3D1', solid: '#78716C' },
};

/** 1 → Group A，2 → Group B（数字也收） */
export const shiftGroupLabel = (n?: number) => (n === 2 ? 'Group B' : 'Group A');

/** 组织图用：有明确设定才算 A / B；从没设定过 = 未分组（考勤仍按 A 的时间） */
export const shiftGroupOf = (emp: { shiftGroup?: number }): ShiftGroupKey =>
    emp.shiftGroup === 2 ? 'B' : emp.shiftGroup === 1 ? 'A' : 'NONE';
