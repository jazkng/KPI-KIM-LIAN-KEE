// ============================================================================
// 收银点钱（任务类型 CASH）：纯函数，不碰资料库
// 负责人 2026-10-24：面额照建议、一天一次（上班点一次、下班点一次）、只是记录（不接日结、不提醒），
// 派给谁由派任务的人决定。设计：docs/hr/cash-count-task-design.md
// 金额一律用「仙」（整数）计算，避免小数误差。
// ============================================================================

export interface Denomination { sen: number; label: string; coin: boolean }
export const DENOMINATIONS: Denomination[] = [
    { sen: 10000, label: 'RM 100', coin: false },
    { sen: 5000, label: 'RM 50', coin: false },
    { sen: 2000, label: 'RM 20', coin: false },
    { sen: 1000, label: 'RM 10', coin: false },
    { sen: 500, label: 'RM 5', coin: false },
    { sen: 100, label: 'RM 1', coin: false },
    { sen: 50, label: '50 sen', coin: true },
    { sen: 20, label: '20 sen', coin: true },
    { sen: 10, label: '10 sen', coin: true },
    { sen: 5, label: '5 sen', coin: true },
];

/** 面额（仙，字串）→ 张数 / 个数 */
export type CashCounts = Record<string, number>;

export interface CashSide { counts: CashCounts; totalSen: number; by: string; byName: string; at: string }

/** cash_counts/{日期}_{任务 ID}：每天一笔，永久保留（重复任务本身每天会被下一期覆盖） */
export interface CashCountRecord {
    id: string;
    taskId: string;
    taskTitle: string;
    date: string;
    opening?: CashSide;
    closing?: CashSide;
    /** 下班 − 上班（仙） */
    diffSen?: number;
}

export const cashCountId = (date: string, taskId: string) => `${date}_${taskId}`;

/** 只留下合法的面额与非负整数 */
export const cleanCounts = (raw: Record<string, string | number | undefined>): CashCounts => {
    const out: CashCounts = {};
    for (const d of DENOMINATIONS) {
        const v = raw[String(d.sen)];
        const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
        if (String(v ?? '').trim() !== '' && Number.isInteger(n) && n >= 0) out[String(d.sen)] = n;
    }
    return out;
};

export const cashTotalSen = (counts: CashCounts) =>
    DENOMINATIONS.reduce((s, d) => s + d.sen * (Number.isInteger(counts[String(d.sen)]) && counts[String(d.sen)] >= 0 ? counts[String(d.sen)] : 0), 0);

/** 至少要填一个面额（全部空白 = 还没点） */
export const countsEntered = (counts: CashCounts) => Object.keys(counts).length > 0;

export const formatRm = (sen: number) => `${sen < 0 ? '−' : ''}RM ${(Math.abs(sen) / 100).toFixed(2)}`;
