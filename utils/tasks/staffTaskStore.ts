// ============================================================================
// 委托任务 / 上报事项 / 任务照片：资料库读写
// 新集合（V1 不读不写）：staff_tasks、boss_matters、staff_task_photos
// 只有「确认」盘点 / 采购时才写库存（stock_*）与库存记录（inventory_logs），格式跟现有盘点、收货一样。
// 所有写入都是使用者按按钮才发生，打开页面不写入。
// ============================================================================
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { Employee, InventoryLog, StockItem } from '../../types';
import { DataManager } from '../dataManager';
import {
    addHistory, assigneeKeysFor, canEditAssignedTask, currentCycle, buildPurchaseApply, buildStocktakeApply, submissionConflict, validateSubmission,
    type BossMatter, type MatterStatus, type StaffTask, type StockArea, type TaskPurchaseLine,
} from './staffTaskLogic';

const TASKS = 'staff_tasks', MATTERS = 'boss_matters', PHOTOS = 'staff_task_photos';
const STOCK_COL: Record<StockArea, string> = { KITCHEN: 'stock_kitchen', BAR: 'stock_bar', GENERAL: 'stock_general', FUEL: 'stock_fuel' };
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

export class StockConflictError extends Error {
    constructor(public conflicts: string[]) { super(conflicts.join('\n')); }
}

// ── 照片：压缩成小 JPEG 存在独立文件（每张一份，避免任务文件太大） ──
export const compressPhoto = (file: File, maxDim = 1000, quality = 0.62): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读不到照片'));
    reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('照片格式不支持'));
        img.onload = () => {
            const k = Math.min(1, maxDim / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
});

export const savePhotos = async (ownerId: string, dataUrls: string[], by: string) => {
    const at = new Date().toISOString();
    const ids = dataUrls.map(() => newId('ph'));
    await Promise.all(dataUrls.map((data, i) => setDoc(doc(db, PHOTOS, ids[i]), { id: ids[i], ownerId, by, at, data })));
    return ids;
};

export const loadPhotos = async (ids: string[]) => {
    const snaps = await Promise.all((ids || []).map(id => getDoc(doc(db, PHOTOS, id))));
    return snaps.filter(s => s.exists()).map(s => String(s.data()!.data));
};

// ── 委托任务 ──
export const createTask = async (t: Omit<StaffTask, 'id' | 'createdAt' | 'status' | 'returnCount' | 'returnedEmployeeIds' | 'history'>) => {
    const at = new Date().toISOString();
    const task: StaffTask = { ...t, id: newId('task'), createdAt: at, status: 'OPEN', returnCount: 0, returnedEmployeeIds: [], history: [{ at, by: t.createdByName, action: 'CREATE' }] };
    await setDoc(doc(db, TASKS, task.id), clean(task));
    return task;
};

/** 管理层：最近的任务（新到旧，最多 300） */
export const listRecentTasks = async () => {
    const snap = await getDocs(query(collection(db, TASKS), orderBy('createdAt', 'desc'), limit(300)));
    return snap.docs.map(d => d.data() as StaffTask);
};

const RECURRING = ['DAILY', 'WEEKLY', 'MONTHLY', 'EVERY_N'];
const mergeTasks = (...lists: { docs: { id: string; data: () => unknown }[] }[]) =>
    [...new Map(lists.flatMap(l => l.docs).map(d => [d.id, d.data() as StaffTask])).values()];

/**
 * 还要做的任务：未结束的（待做 / 已交回）＋ 全部重复任务（上一期完成了，这一期仍要做）。
 * 已完成的单次任务不读，所以完成的任务再多，员工页、管理首页打开时读取的数量也不会一直变多。
 * 只用单一栏位条件（不需要新增复合索引）。
 */
export const listActiveTasks = async () => {
    const [active, recurring] = await Promise.all([
        getDocs(query(collection(db, TASKS), where('status', 'in', ['OPEN', 'SUBMITTED']))),
        getDocs(query(collection(db, TASKS), where('repeat', 'in', RECURRING))),
    ]);
    return mergeTasks(active, recurring).filter(t => t.status !== 'CANCELLED');
};

/** 积分：这个月要算的任务 = 还要做的任务 ＋ 本月前一个月起建立的单次任务（含已完成） */
export const listTasksForMonth = async (month: string) => {
    const since = new Date(`${month}-01T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 31);
    const [current, once] = await Promise.all([
        listActiveTasks(),
        getDocs(query(collection(db, TASKS), where('createdAt', '>=', since.toISOString()))),
    ]);
    return [...new Map([...current, ...once.docs.map(d => d.data() as StaffTask)].map(t => [t.id, t])).values()];
};

/** 任务管理须保留所有未结束任务，避免新任务太多时较早的待做事项消失。 */
export const listManageTasks = async () => {
    const [active, recent] = await Promise.all([
        getDocs(query(collection(db, TASKS), where('status', 'in', ['OPEN', 'SUBMITTED']))),
        getDocs(query(collection(db, TASKS), orderBy('createdAt', 'desc'), limit(300))),
    ]);
    return [...new Map([...active.docs, ...recent.docs].map(d => [d.id, d.data() as StaffTask])).values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** 员工：派给自己或自己部门、还要做的任务（不读已完成的单次任务） */
export const listTasksFor = async (e: Pick<Employee, 'id' | 'department'>) => {
    const keys = assigneeKeysFor(e);
    return (await listActiveTasks()).filter(t => keys.includes(t.assigneeKey));
};

const updateTask = (id: string, fn: (t: StaffTask) => Partial<StaffTask>) => runTransaction(db, async tx => {
    const ref = doc(db, TASKS, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('任务不存在');
    const t = snap.data() as StaffTask;
    const patch = fn(t);
    tx.set(ref, clean({ ...t, ...patch }));
    return { ...t, ...patch } as StaffTask;
});

export const startTask = (id: string, actor: Employee) => updateTask(id, t => ({ history: addHistory(t.history, actor.name, 'START', new Date().toISOString()) }));

export const editAssignedTask = (id: string, actor: Employee, changes: Pick<StaffTask, 'title' | 'note' | 'assigneeId' | 'assigneeName' | 'assigneeKey' | 'department' | 'assignMode' | 'repeat' | 'repeatDays' | 'repeatDate' | 'repeatEvery' | 'dueAt' | 'photosRequired' | 'stockLines' | 'translations'>) => updateTask(id, t => {
    if (!canEditAssignedTask(t, actor)) throw new Error('只有派任务的人或店面管理可编辑未交回的任务');
    if (!changes.title.trim() || (t.type === 'STOCKTAKE' && !changes.stockLines?.length)) throw new Error('请填任务内容及盘点品项');
    return { ...changes, history: addHistory(t.history, actor.name, 'EDIT', new Date().toISOString()) };
});

export const submitTask = async (task: StaffTask, actor: Employee, today: string, input: { note?: string; photos: string[]; counts?: Record<string, number>; purchases?: TaskPurchaseLine[] }) => {
    const latest = await getDoc(doc(db, TASKS, task.id));
    if (!latest.exists()) throw new Error('任务不存在');
    const firstConflict = submissionConflict(task, latest.data() as StaffTask, actor);
    if (firstConflict) throw new Error(firstConflict);
    const firstInvalid = validateSubmission(latest.data() as StaffTask, { counts: input.counts, photoCount: input.photos.length, purchases: input.purchases });
    if (firstInvalid) throw new Error(firstInvalid);
    const photoIds = await savePhotos(task.id, input.photos, actor.name);
    // 盘点：记下交回当下的系统数量，确认时用来检查中途有没有人改过库存
    let qtyAtSubmit: Record<string, number> | undefined;
    if (task.type === 'STOCKTAKE') {
        const current = await readStock((task.stockLines || []).map(l => ({ stockId: l.stockId, area: l.area })));
        qtyAtSubmit = Object.fromEntries(Object.entries(current).map(([id, it]) => [id, Number(it.currentQtyBase ?? it.currentQty ?? 0)]));
    }
    const at = new Date().toISOString();
    return updateTask(task.id, t => {
        const conflict = submissionConflict(task, t, actor);
        if (conflict) throw new Error(conflict);
        const invalid = validateSubmission(t, { counts: input.counts, photoCount: input.photos.length, purchases: input.purchases });
        if (invalid) throw new Error(invalid);
        return {
            // 重复任务：记下交的是哪一期（不是交的那天），这样漏掉的那一期补交也对得上
            status: 'SUBMITTED', runDate: t.repeat === 'ONCE' ? today : (currentCycle(t, today) || today), returnNote: undefined,
            submission: { by: actor.id, byName: actor.name, at, note: input.note || undefined, photoIds, counts: input.counts, qtyAtSubmit, purchases: input.purchases },
            history: addHistory(t.history, actor.name, 'SUBMIT', at),
        };
    });
};

export const returnTask = (id: string, actor: Employee, note: string) => updateTask(id, t => {
    if (t.status !== 'SUBMITTED') throw new Error('这个任务现在不能退回');
    const at = new Date().toISOString();
    const emp = t.submission?.by;
    return {
        status: 'OPEN', returnNote: note, returnCount: (t.returnCount || 0) + 1,
        returnedEmployeeIds: emp && !(t.returnedEmployeeIds || []).includes(emp) ? [...(t.returnedEmployeeIds || []), emp] : (t.returnedEmployeeIds || []),
        history: [...(t.history || []), { at, by: actor.name, action: 'RETURN', note, ...(emp ? { employeeId: emp } : {}) }],
    };
});

export const cancelTask = (id: string, actor: Employee) => updateTask(id, t => ({ status: 'CANCELLED', history: addHistory(t.history, actor.name, 'CANCEL', new Date().toISOString()) }));

export const readStock = async (lines: { stockId?: string; area?: StockArea }[]) => {
    const keys = lines.filter(l => l.stockId && l.area);
    const snaps = await Promise.all(keys.map(l => getDoc(doc(db, STOCK_COL[l.area!], l.stockId!))));
    return Object.fromEntries(snaps.filter(s => s.exists()).map(s => [s.id, s.data() as StockItem]));
};

/**
 * 确认任务。盘点 / 从库存选的采购：同一个交易里改库存、写库存记录、把任务标成完成。
 * 盘点交回后库存被别人改过 → 丢 StockConflictError，画面让确认的人看清楚再选「仍然确认」。
 */
export const confirmTask = async (task: StaffTask, actor: Employee, today: string, opts: { force?: boolean } = {}) => {
    const at = new Date().toISOString();
    const stockLines = task.type === 'STOCKTAKE' ? (task.stockLines || []).map(l => ({ stockId: l.stockId, area: l.area }))
        : task.type === 'PURCHASE' && task.purchaseMode === 'STOCK' ? (task.submission?.purchases || []).filter(p => p.stockId && p.area).map(p => ({ stockId: p.stockId, area: p.area }))
            : [];
    let log: InventoryLog | null = null;
    await runTransaction(db, async tx => {
        const tref = doc(db, TASKS, task.id);
        const tsnap = await tx.get(tref);
        if (!tsnap.exists()) throw new Error('任务不存在');
        const t = tsnap.data() as StaffTask;
        if (t.status !== 'SUBMITTED') throw new Error('任务已经被处理过了');
        const refs = stockLines.map(l => ({ ...l, ref: doc(db, STOCK_COL[l.area!], l.stockId!) }));
        const snaps = await Promise.all(refs.map(r => tx.get(r.ref)));
        const current = Object.fromEntries(snaps.filter(s => s.exists()).map(s => [s.id, s.data() as StockItem]));
        if (t.type === 'STOCKTAKE') {
            const r = buildStocktakeApply(t, current, actor.name, at, today);
            if (r.conflicts.length && !opts.force) throw new StockConflictError(r.conflicts);
            r.updates.forEach(u => tx.update(doc(db, STOCK_COL[u.area], u.stockId), { currentQtyBase: u.newQtyBase, currentQty: u.newQtyBase }));
            log = r.log;
        } else if (stockLines.length) {
            const r = buildPurchaseApply(t, current, actor.name, at, today);
            r.updates.forEach(u => tx.update(doc(db, STOCK_COL[u.area], u.stockId), { currentQtyBase: u.newQtyBase, currentQty: u.newQtyBase, costPerBaseUnit: u.newCostPerBaseUnit, cost: u.newCostPerBaseUnit }));
            log = r.log;
        }
        if (log && log.items.length) tx.set(doc(db, 'inventory_logs', log.id), clean(log));
        tx.set(tref, clean({ ...t, status: 'DONE', reviewedBy: actor.name, reviewedAt: at, history: addHistory(t.history, actor.name, opts.force ? 'CONFIRM_FORCE' : 'CONFIRM', at) }));
    });
    DataManager.clearCacheKeys(['stock_', 'inventory_logs_']);
    // 价格历史（跟现有收货一样，失败不影响结果）
    const done = log as InventoryLog | null;
    if (done && done.source === 'RECEIVE') {
        await Promise.all(done.items.map(i => DataManager.appendPriceHistoryEntry(i.stockId, { date: done.date, cost: i.cost, sourceLogId: done.id, timestamp: done.timestamp }).catch(() => undefined)));
    }
};

/** 每日消耗用：最近 21 天的库存记录 */
export const recentInventoryLogs = async (sinceDate: string) => {
    const snap = await getDocs(query(collection(db, 'inventory_logs'), where('date', '>=', sinceDate)));
    return snap.docs.map(d => d.data() as InventoryLog);
};

// ── 上报事项 ──
export const createMatter = async (m: Omit<BossMatter, 'id' | 'createdAt' | 'status' | 'history' | 'photoIds'>, photos: string[] = []) => {
    const at = new Date().toISOString();
    const id = newId('matter');
    const photoIds = photos.length ? await savePhotos(id, photos, m.createdByName) : [];
    const matter: BossMatter = { ...m, id, photoIds, createdAt: at, status: 'OPEN', history: [{ at, by: m.createdByName, action: 'CREATE' }] };
    await setDoc(doc(db, MATTERS, id), clean(matter));
    return matter;
};

export const listMatters = async () => {
    const snap = await getDocs(query(collection(db, MATTERS), orderBy('createdAt', 'desc'), limit(200)));
    return snap.docs.map(d => d.data() as BossMatter);
};

export const countOpenMatters = async () => {
    const snap = await getDocs(query(collection(db, MATTERS), where('status', '==', 'OPEN')));
    return snap.size;
};

export const updateMatter = (id: string, actor: Employee, status: MatterStatus, resolution?: string) => runTransaction(db, async tx => {
    const ref = doc(db, MATTERS, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('事项不存在');
    const m = snap.data() as BossMatter;
    const at = new Date().toISOString();
    tx.set(ref, clean({ ...m, status, resolution: resolution || m.resolution, history: addHistory(m.history, actor.name, status, at, resolution) }));
});

/** 员工档案「记录」：这个员工被退回过的任务 */
export const listTasksReturnedFor = async (employeeId: string) => {
    const snap = await getDocs(query(collection(db, TASKS), where('returnedEmployeeIds', 'array-contains', employeeId)));
    return snap.docs.map(d => d.data() as StaffTask);
};
