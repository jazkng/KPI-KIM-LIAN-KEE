// ============================================================================
// 委托任务 / 上报事项：纯函数（不碰资料库，方便测试）
// 设计说明：docs/hr/staff-tasks-design.md（负责人 2026-10-22 批准）
// ============================================================================
import type { Employee, InventoryLog, InventoryLogItem, StockItem } from '../../types';
import { applyReceivedStock, getBaseUnit, getCostPerBaseUnit, getCurrentQtyBase, getDisplayToBaseRatio } from '../unitConversion';

export type TaskType = 'STOCKTAKE' | 'CLEAN' | 'PURCHASE' | 'REPAIR' | 'OTHER';
export type TaskStatus = 'OPEN' | 'SUBMITTED' | 'DONE' | 'CANCELLED';
export type StockArea = 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL';

export interface TaskStockLine {
    stockId: string;
    area: StockArea;
    name: string;
    /** 员工输入用的单位与换算（有「显示单位」就用它，否则用基础单位） */
    unit: string;
    ratio: number;
    /** 派任务时系统数量（基础单位），只给管理层对照，员工画面不显示 */
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
    assignMode: 'PERSON' | 'DEPT';
    assigneeId?: string;
    assigneeName?: string;
    department?: string;
    /** 'emp:ID' 或 'dept:KITCHEN'，员工页用来查 */
    assigneeKey: string;
    repeat: 'ONCE' | 'DAILY';
    dueAt?: string;
    /** 0 = 不用拍照；1–5 = 至少要拍几张 */
    photosRequired: number;
    stockLines?: TaskStockLine[];
    purchaseMode?: 'STOCK' | 'FREE';
    createdBy: string;
    createdByName: string;
    createdAt: string;
    status: TaskStatus;
    /** 每日任务：这次交回是哪一天的 */
    runDate?: string;
    submission?: {
        by: string; byName: string; at: string; note?: string; photoIds: string[];
        /** 盘点：stockId → 点到的数量（员工输入单位） */
        counts?: Record<string, number>;
        /** 盘点交回时系统的数量（基础单位）：确认时用来检查有没有人中途改过库存 */
        qtyAtSubmit?: Record<string, number>;
        purchases?: TaskPurchaseLine[];
    };
    returnNote?: string;
    returnCount: number;
    /** 被退回过的员工（员工档案「记录」用来算退回次数） */
    returnedEmployeeIds: string[];
    reviewedBy?: string;
    reviewedAt?: string;
    history: TaskHistory[];
}

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

export const TASK_TYPE_LABEL: Record<TaskType, string> = { STOCKTAKE: '盘点库存', CLEAN: '清洁整理', PURCHASE: '采购', REPAIR: '维修', OTHER: '其他' };
export const MATTER_LABEL: Record<MatterCategory, string> = { BIG_PURCHASE: '大件采购', VIP: 'VIP', EVENT: '活动', REPAIR_PRO: '维修（请专业）', OTHER: '其他' };
export const MATTER_STATUS_LABEL: Record<MatterStatus, string> = { OPEN: '待处理', ARRANGED: '已安排', DONE: '已完成', DECLINED: '不处理' };

/** 部门统一：BOH → KITCHEN，FOH → FLOOR */
export const normDept = (d?: string) => {
    const x = (d || '').toUpperCase().trim();
    return x === 'BOH' ? 'KITCHEN' : x === 'FOH' ? 'FLOOR' : x;
};

export const assigneeKeysFor = (e: Pick<Employee, 'id' | 'department'>) => [`emp:${e.id}`, ...(e.department ? [`dept:${normDept(e.department)}`] : [])];

/** 今天这个任务算什么状态（每日任务：前几天交的不算今天） */
export type EffectiveStatus = 'TODO' | 'SUBMITTED' | 'DONE' | 'OVERDUE' | 'CANCELLED';
export const effectiveStatus = (t: StaffTask, today: string, nowIso: string): EffectiveStatus => {
    if (t.status === 'CANCELLED') return 'CANCELLED';
    const stale = t.repeat === 'DAILY' && t.runDate !== today;
    const status = stale ? 'OPEN' : t.status;
    if (status === 'SUBMITTED') return 'SUBMITTED';
    if (status === 'DONE') return 'DONE';
    if (t.repeat === 'ONCE' && t.dueAt && t.dueAt < nowIso) return 'OVERDUE';
    return 'TODO';
};

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
export const validateSubmission = (t: StaffTask, s: { counts?: Record<string, number>; photoCount: number; purchases?: TaskPurchaseLine[] }): string | null => {
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
