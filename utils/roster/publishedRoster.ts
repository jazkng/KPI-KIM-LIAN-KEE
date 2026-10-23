// 员工只看「已发布」的排班（负责人 2026-10-23）。
// 排班管理的草稿和正式排班存在同一份 roster_months/{月份}，所以发布时另存一份
// publishedRoster / publishedNotes（新增的选填字段，V1 不读，照旧读 roster）。

type Grid = Record<string, Record<string, string>>;
type Notes = Record<string, string>;
export type MonthDoc = { roster?: Grid; notes?: Notes; status?: string; publishedRoster?: Grid; publishedNotes?: Notes };

/** 存档时要带上的已发布版本；undefined = 这个月还没发布过（Firestore 不收 undefined，调用方要略过） */
export const nextPublished = (current: MonthDoc | null, next: { status: string; roster: Grid; notes: Notes }): { publishedRoster: Grid; publishedNotes: Notes } | undefined => {
    if (next.status === 'PUBLISHED') return { publishedRoster: next.roster, publishedNotes: next.notes };
    if (!current) return undefined;
    if (current.publishedRoster) return { publishedRoster: current.publishedRoster, publishedNotes: current.publishedNotes || {} };
    // 这次改动之前已发布的月份：存草稿前的内容就是正式版
    if (current.status !== 'DRAFT') return { publishedRoster: current.roster || {}, publishedNotes: current.notes || {} };
    return undefined;
};

/** 员工看的版本；null = 这份文件里没有正式版，改看旧的 roster/main（发布时会同步过去） */
export const publishedView = (data: MonthDoc): { roster: Grid; notes: Notes } | null => {
    if (data.publishedRoster) return { roster: data.publishedRoster, notes: data.publishedNotes || {} };
    if (data.status !== 'DRAFT') return { roster: data.roster || {}, notes: data.notes || {} };
    return null;
};
