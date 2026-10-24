// ============================================================================
// 委托任务 / 上报事项：纯函数（不碰资料库，方便测试）
// 设计说明：docs/hr/staff-tasks-design.md（负责人 2026-10-22 批准）
// ============================================================================
import type { Employee, InventoryLog, InventoryLogItem, StockItem } from '../../types';
import { getOrgLevel } from '../orgAccess';
import { applyReceivedStock, getBaseUnit, getCostPerBaseUnit, getCurrentQtyBase, getDisplayToBaseRatio } from '../unitConversion';

export type TaskRepeat = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'EVERY_N';
export type TaskType = 'STOCKTAKE' | 'CLEAN' | 'PURCHASE' | 'REPAIR' | 'CASH' | 'OTHER';
export type TaskStatus = 'OPEN' | 'SUBMITTED' | 'DONE' | 'CANCELLED';
export type StockArea = 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL';

export interface TaskStockLine {
    stockId: string;
    area: StockArea;
    name: string;
    /** 员工输入用的单位与换算（有「显示单位」就用它，否则用基础单位） */
    unit: string;
    ratio: number;
    /** 派任务时系统数量（基础单位），供提交与确认时核对 */
    systemQtyBase: number;
}

export interface TaskPurchaseLine {
    stockId?: string;
    area?: StockArea;
    name: string;
    unit: string;
    ratio: number;
    qty: number;       // 员工输入单位
    amount: number;    // 这一行花多少钱（RM）
}

export interface TaskHistory { at: string; by: string; action: string; note?: string; /** 退回时：被退回的员工 */ employeeId?: string }

export interface StaffTask {
    id: string;
    type: TaskType;
    title: string;
    note?: string;
    translations?: import('./taskTranslation').TaskTranslations;
    assignMode: 'PERSON' | 'DEPT';
    assigneeId?: string;
    assigneeName?: string;
    department?: string;
    /** 'emp:ID' 或 'dept:KITCHEN'，员工页用来查 */
    assigneeKey: string;
    repeat: TaskRepeat;
    /** 每周：星期几（0=日…6=六，可多选） */
    repeatDays?: number[];
    /** 每月：几号（1–31；当月没有这一天就用月底） */
    repeatDate?: number;
    /** 每隔几天（从派的那天起算） */
    repeatEvery?: number;
    dueAt?: string;
    /** 0 = 不用拍照；1–5 = 至少要拍几张 */
    photosRequired: number;
    stockLines?: TaskStockLine[];
    purchaseMode?: 'STOCK' | 'FREE';
    createdBy: string;
    createdByName: string;
    createdAt: string;
    status: TaskStatus;
    /** 重复任务：这次交回是哪一期的（那一期开始的日期） */
    runDate?: string;
    submission?: {
        by: string; byName: string; at: string; note?: string; photoIds: string[];
        /** 盘点：stockId → 点到的数量（员工输入单位） */
        counts?: Record<string, number>;
        /** 盘点交回时系统的数量（基础单位）：确认时用来检查有没有人中途改过库存 */
        qtyAtSubmit?: Record<string, number>;
        purchases?: TaskPurchaseLine[];
        /** 收银点钱：这一天的上班 / 下班金额（仙）；明细在 cash_counts */
        cash?: { openingSen: number; closingSen: number };
    };
    returnNote?: string;
    returnCount: number;
    /** 被退回过的员工（员工档案「记录」用来算退回次数） */
    returnedEmployeeIds: string[];
    reviewedBy?: string;
    reviewedAt?: string;
    history: TaskHistory[];
}

export const canEditAssignedTask = (task: StaffTask, actor: Employee) => task.status === 'OPEN' && !task.submission
    && (task.createdBy === actor.id || ['OWNER', 'BRANCH_MANAGER'].includes(getOrgLevel(actor)));

/** 员工打开表单后若任务被改派或改内容，必须重新读取，避免交回过期盘点。 */
export const submissionConflict = (opened: StaffTask, latest: StaffTask, actor: Employee): string | null => {
    if (latest.status === 'CANCELLED') return '任务已取消';
    if (!assigneeKeysFor(actor).includes(latest.assigneeKey)) return '任务已改派，请重新打开任务列表';
    if ((opened.history?.length || 0) !== (latest.history?.length || 0)
        || opened.history?.at(-1)?.at !== latest.history?.at(-1)?.at) return '任务内容已更新，请重新打开后填写';
    return null;
};

export type MatterCategory = 'BIG_PURCHASE' | 'VIP' | 'EVENT' | 'REPAIR_PRO' | 'OTHER';
export type MatterStatus = 'OPEN' | 'ARRANGED' | 'DONE' | 'DECLINED';
export interface BossMatter {
    id: string;
    title: string;
    category: MatterCategory;
    date?: string;
    note?: string;
    photoIds: string[];
    fromTaskId?: string;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    status: MatterStatus;
    resolution?: string;
    history: TaskHistory[];
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = { STOCKTAKE: '盘点库存', CLEAN: '清洁整理', PURCHASE: '采购', REPAIR: '维修', CASH: '收银点钱', OTHER: '其他' };
export const MATTER_LABEL: Record<MatterCategory, string> = { BIG_PURCHASE: '大件采购', VIP: 'VIP', EVENT: '活动', REPAIR_PRO: '维修（请专业）', OTHER: '其他' };
export const MATTER_STATUS_LABEL: Record<MatterStatus, string> = { OPEN: '待处理', ARRANGED: '已安排', DONE: '已完成', DECLINED: '不处理' };

/** 部门统一：BOH → KITCHEN，FOH → FLOOR */
export const normDept = (d?: string) => {
    const x = (d || '').toUpperCase().trim();
    return x === 'BOH' ? 'KITCHEN' : x === 'FOH' ? 'FLOOR' : x;
};

export const assigneeKeysFor = (e: Pick<Employee, 'id' | 'department'>) => [`emp:${e.id}`, ...(e.department ? [`dept:${normDept(e.department)}`] : [])];

const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const lastDayOfMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/**
 * 重复任务「这一期」从哪一天开始（今天或以前最近一次排到的日子）；单次任务没有期。
 * 每日 = 今天；每周 = 最近一个勾选的星期几；每月 = 最近一次的几号；每隔 N 天 = 从派的那天起每 N 天。
 */
export const currentCycle = (t: Pick<StaffTask, 'repeat' | 'repeatDays' | 'repeatDate' | 'repeatEvery' | 'createdAt'>, today: string): string | null => {
    if (t.repeat === 'DAILY') return today;
    if (t.repeat === 'WEEKLY') {
        const days = t.repeatDays?.length ? t.repeatDays : [weekday(t.createdAt.slice(0, 10))];
        for (let i = 0; i < 7; i++) { const d = addDays(today, -i); if (days.includes(weekday(d))) return d; }
        return null;
    }
    if (t.repeat === 'MONTHLY') {
        const want = t.repeatDate || Number(t.createdAt.slice(8, 10));
        const day = (month: string) => `${month}-${String(Math.min(want, lastDayOfMonth(month))).padStart(2, '0')}`;
        const thisMonth = day(today.slice(0, 7));
        if (thisMonth <= today) return thisMonth;
        const prev = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
        return day(prev);
    }
    if (t.repeat === 'EVERY_N') {
        const n = Math.max(1, Math.round(t.repeatEvery || 1));
        const start = t.createdAt.slice(0, 10);
        const passed = dayDiff(today, start);
        return passed < 0 ? null : addDays(start, passed - (passed % n));
    }
    return null;
};

/** 下一期从哪一天开始（给管理层看「下次」） */
export const nextCycle = (t: Pick<StaffTask, 'repeat' | 'repeatDays' | 'repeatDate' | 'repeatEvery' | 'createdAt'>, today: string): string | null => {
    if (t.repeat === 'ONCE') return null;
    for (let i = 1; i <= 62; i++) { const d = addDays(today, i); if (currentCycle(t, d) === d) return d; }
    return null;
};

/** 今天这个任务算什么状态。重复任务：这一期还没交 = 待做；这一期过了（今天不是开始那天）还没交 = 逾期；第一期还没到 = 未到期 */
export type EffectiveStatus = 'TODO' | 'SUBMITTED' | 'DONE' | 'OVERDUE' | 'UPCOMING' | 'CANCELLED';
export const effectiveStatus = (t: StaffTask, today: string, nowIso: string): EffectiveStatus => {
    if (t.status === 'CANCELLED') return 'CANCELLED';
    if (t.repeat === 'ONCE') {
        if (t.status === 'SUBMITTED') return 'SUBMITTED';
        if (t.status === 'DONE') return 'DONE';
        return t.dueAt && t.dueAt < nowIso ? 'OVERDUE' : 'TODO';
    }
    const cycle = currentCycle(t, today);
    if (!cycle || cycle < t.createdAt.slice(0, 10)) return 'UPCOMING';
    if (t.runDate === cycle) return t.status === 'SUBMITTED' ? 'SUBMITTED' : t.status === 'DONE' ? 'DONE' : 'TODO';
    // 这一期还没交：每日任务当天都算待做；其他重复任务过了开始那天就算逾期
    return t.repeat !== 'DAILY' && cycle < today ? 'OVERDUE' : 'TODO';
};

const WD = ['日', '一', '二', '三', '四', '五', '六'];
/** 「每周一、四」「每月 15 号」这种文字（管理层画面用） */
export const repeatLabel = (t: Pick<StaffTask, 'repeat' | 'repeatDays' | 'repeatDate' | 'repeatEvery'>) =>
    t.repeat === 'DAILY' ? '每日' : t.repeat === 'WEEKLY' ? `每周${(t.repeatDays || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WD[d]).join('、')}`
        : t.repeat === 'MONTHLY' ? `每月 ${t.repeatDate} 号` : t.repeat === 'EVERY_N' ? `每 ${t.repeatEvery} 天` : '单次';

/** 员工输入单位：有显示单位就用显示单位 */
export const countUnitOf = (item: StockItem) => {
    const ratio = item.displayUnit ? getDisplayToBaseRatio(item) : 1;
    return { unit: item.displayUnit && ratio !== 1 ? item.displayUnit : getBaseUnit(item), ratio: item.displayUnit && ratio !== 1 ? ratio : 1 };
};

export const toStockLine = (item: StockItem, area: StockArea): TaskStockLine => ({
    stockId: item.id, area, name: item.name, ...countUnitOf(item), systemQtyBase: getCurrentQtyBase(item),
});

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** 交回前检查：盘点每一项都要填、照片够不够 */
export const validateSubmission = (t: StaffTask, s: { counts?: Record<string, number>; photoCount: number; purchases?: TaskPurchaseLine[]; cash?: { openingSen: number; closingSen: number } }): string | null => {
    if (t.type === 'CASH' && !s.cash) return '请先点上班和下班的金额';
    if (t.photosRequired > 0 && s.photoCount < t.photosRequired) return `要拍至少 ${t.photosRequired} 张照片`;
    if (s.photoCount > 5) return '照片最多 5 张';
    if (t.type === 'STOCKTAKE') {
        const miss = (t.stockLines || []).filter(l => !(Number.isFinite(s.counts?.[l.stockId]) && (s.counts![l.stockId] as number) >= 0));
        if (miss.length) return `还有 ${miss.length} 项没填数量`;
    }
    if (t.type === 'PURCHASE') {
        const rows = s.purchases || [];
        if (!rows.length) return '请填买了什么';
        if (rows.some(r => !(r.qty > 0) || !(r.amount >= 0) || !r.name.trim())) return '每一行都要有名称、数量和金额';
    }
    return null;
};

/** 盘点差异：员工点的（换成基础单位）跟交回时系统数量比；差 30% 以上标红 */
export const STOCKTAKE_ALERT_PCT = 30;
export const stocktakeDiffs = (t: StaffTask) => (t.stockLines || []).map(l => {
    const counted = t.submission?.counts?.[l.stockId];
    const countedBase = counted === undefined ? null : round(counted * l.ratio);
    const system = t.submission?.qtyAtSubmit?.[l.stockId] ?? l.systemQtyBase;
    const pct = countedBase === null ? null : system > 0 ? (countedBase - system) / system * 100 : countedBase > 0 ? 100 : 0;
    return { line: l, countedBase, system, pct, alert: pct !== null && Math.abs(pct) >= STOCKTAKE_ALERT_PCT };
});

/** 确认盘点：算出新的库存数量与库存记录（跟现有盘点同一种格式，V1 看得懂） */
export const buildStocktakeApply = (t: StaffTask, current: Record<string, StockItem>, confirmer: string, nowIso: string, date: string) => {
    const conflicts: string[] = [];
    const updates: { stockId: string; area: StockArea; newQtyBase: number }[] = [];
    const items: InventoryLogItem[] = [];
    for (const d of stocktakeDiffs(t)) {
        const item = current[d.line.stockId];
        if (!item || d.countedBase === null) { conflicts.push(`${d.line.name}：库存里找不到`); continue; }
        const now = getCurrentQtyBase(item);
        if (Math.abs(now - d.system) > 1e-9) conflicts.push(`${d.line.name}：交回后库存从 ${d.system} 变成 ${now}`);
        const cost = getCostPerBaseUnit(item);
        updates.push({ stockId: item.id, area: d.line.area, newQtyBase: d.countedBase });
        items.push({ stockId: item.id, stockName: item.name, oldQty: now, newQty: d.countedBase, diff: round(d.countedBase - now), unit: getBaseUnit(item), cost, valueChange: round((d.countedBase - now) * cost, 2) });
    }
    const log: InventoryLog = { id: `task_${t.id}_${date}`, date, timestamp: nowIso, staffName: `${t.submission?.byName || ''}（${confirmer} 确认）`, totalValueChange: round(items.reduce((s, i) => s + i.valueChange, 0), 2), items, category: '委托盘点', source: 'STOCKTAKE' };
    return { updates, log, conflicts };
};

/** 确认采购（从库存选的）：库存增加、成本移动平均；跟收货同一种记录 */
export const buildPurchaseApply = (t: StaffTask, current: Record<string, StockItem>, confirmer: string, nowIso: string, date: string) => {
    const updates: { stockId: string; area: StockArea; newQtyBase: number; newCostPerBaseUnit: number }[] = [];
    const items: InventoryLogItem[] = [];
    for (const p of t.submission?.purchases || []) {
        if (!p.stockId || !p.area) continue;
        const item = current[p.stockId];
        if (!item) continue;
        const qtyBase = round(p.qty * (p.ratio || 1));
        const r = applyReceivedStock(item, qtyBase, p.amount);
        const old = getCurrentQtyBase(item);
        updates.push({ stockId: item.id, area: p.area, newQtyBase: r.newQtyBase, newCostPerBaseUnit: r.newCostPerBaseUnit });
        items.push({ stockId: item.id, stockName: item.name, oldQty: old, newQty: r.newQtyBase, diff: r.diff, unit: getBaseUnit(item), cost: r.newCostPerBaseUnit, valueChange: round(p.amount, 2), purchaseUnitCost: qtyBase > 0 ? round(p.amount / qtyBase) : 0 });
    }
    const log: InventoryLog = { id: `task_${t.id}_${date}`, date, timestamp: nowIso, staffName: `${t.submission?.byName || ''}（${confirmer} 确认）`, totalValueChange: round(items.reduce((s, i) => s + i.valueChange, 0), 2), items, category: '委托采购', source: 'RECEIVE' };
    return { updates, log };
};

/**
 * 每日消耗：上一次盘点数量 + 之后收货 − 这次点到的数量（基础单位）。
 * logs 是库存记录（盘点 / 收货），找这个品项最近一次盘点（今天以前）。
 */
export const consumptionSinceLast = (logs: InventoryLog[], stockId: string, countedBase: number, beforeIso: string) => {
    const rows = logs.filter(l => l.timestamp < beforeIso).flatMap(l => l.items.filter(i => i.stockId === stockId).map(i => ({ l, i })))
        .sort((a, b) => a.l.timestamp.localeCompare(b.l.timestamp));
    const lastCount = [...rows].reverse().find(r => (r.l.source || 'STOCKTAKE') === 'STOCKTAKE');
    if (!lastCount) return null;
    const received = rows.filter(r => r.l.source === 'RECEIVE' && r.l.timestamp > lastCount.l.timestamp).reduce((s, r) => s + (r.i.diff || 0), 0);
    return { since: lastCount.l.date, lastQty: lastCount.i.newQty, received: round(received), used: round(lastCount.i.newQty + received - countedBase) };
};

export const addHistory = (h: TaskHistory[], by: string, action: string, at: string, note?: string): TaskHistory[] => [...(h || []), note ? { at, by, action, note } : { at, by, action }];

/** 员工本月被退回几次 */
export const monthReturnCount = (tasks: StaffTask[], employeeId: string, month: string) =>
    tasks.reduce((n, t) => n + (t.history || []).filter(h => h.action === 'RETURN' && h.at.startsWith(month) && h.employeeId === employeeId).length, 0);
