// ============================================================================
// 管理层「待我处理」：把系统里真正要管理层动手的事集中起来（只读）
// ----------------------------------------------------------------------------
// 来源（全部只读，不写入任何资料）：
//   日结草稿      settlements.isClosed == false
//   采购待收货    purchase_orders.status == 'ORDERED'
//   盘点任务      inventory_tasks.status == 'PENDING'（L3 只算自己部门的员工）
//   班表待定      roster_months 今天起 7 天内状态为 PENDING 的格子
//   今天缺席      roster_months 今天 MC / LEAVE / ABSENT
//   库存告急      库存品项需要补货（沿用 needsReplenishment）
// 只列有权限的项目；L3 部门负责人只看自己部门。
// 班表直接读 roster_months 文件（不用 getRosterData，那个遇到旧资料会顺手写入迁移）。
// ============================================================================
import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import type { Employee, InventoryTask } from '../../types';
import { DataManager } from '../dataManager';
import { getOrgLevel } from '../orgAccess';
import { needsReplenishment } from '../unitConversion';

export type InboxLang = 'zh' | 'en' | 'my';
export type InboxKey = 'settlementDrafts' | 'poToReceive' | 'inventoryTasks' | 'rosterPending' | 'absences' | 'lowStock';

export interface InboxCounts {
    settlementDrafts?: number;
    poToReceive?: number;
    inventoryTasks?: number;
    rosterPending?: number;
    absences?: { name: string; status: string }[];
    lowStock?: number;
}

export interface InboxItem {
    key: InboxKey;
    title: string;
    /** 一句话：要做什么 */
    sub: string;
    count: number;
    /** 按下去开的模块 */
    target: string;
    /** 有数字时的颜色：urgent = 红，todo = 橘 */
    tone: 'urgent' | 'todo';
    /** 今天缺席的名单 */
    people?: { name: string; status: string }[];
}

const T: Record<InboxKey, Record<InboxLang, [string, (n: number) => string]>> = {
    settlementDrafts: {
        zh: ['日结草稿', n => `${n} 张还没结算`], en: ['Draft settlements', n => `${n} not closed yet`], my: ['နေ့စဉ်ငွေစာရင်း မူကြမ်း', n => `${n} ခု မပိတ်ရသေး`],
    },
    poToReceive: {
        zh: ['采购单待收货', n => `${n} 张已订货，到货后要按收货`], en: ['POs to receive', n => `${n} ordered, receive on arrival`], my: ['လက်ခံရန် အော်ဒါများ', n => `${n} ခု မှာထားပြီး`],
    },
    inventoryTasks: {
        zh: ['盘点任务', n => `${n} 个还没完成`], en: ['Stock-take tasks', n => `${n} not done`], my: ['ပစ္စည်းစာရင်း စစ်ရန်', n => `${n} ခု မပြီးသေး`],
    },
    rosterPending: {
        zh: ['班表待定', n => `未来 7 天有 ${n} 格还没定`], en: ['Roster to confirm', n => `${n} slots in next 7 days`], my: ['အလှည့်ဇယား မသတ်မှတ်ရသေး', n => `ရက် ၇ ရက်အတွင်း ${n} ကွက်`],
    },
    absences: {
        zh: ['今天缺席', n => `${n} 人请假 / 病假 / 缺勤`], en: ['Absent today', n => `${n} on leave / MC / absent`], my: ['ယနေ့ ပျက်ကွက်', n => `${n} ဦး`],
    },
    lowStock: {
        zh: ['库存告急', n => `${n} 样要补货`], en: ['Low stock', n => `${n} items to reorder`], my: ['ပစ္စည်း နည်းနေ', n => `${n} မျိုး ဖြည့်ရန်`],
    },
};

const ORDER: { key: InboxKey; target: string; tone: InboxItem['tone'] }[] = [
    { key: 'settlementDrafts', target: 'SETTLEMENT', tone: 'urgent' },
    { key: 'absences', target: 'ROSTER', tone: 'urgent' },
    { key: 'lowStock', target: 'PROCUREMENT', tone: 'urgent' },
    { key: 'poToReceive', target: 'PROCUREMENT', tone: 'todo' },
    { key: 'inventoryTasks', target: 'INVENTORY_CHECK', tone: 'todo' },
    { key: 'rosterPending', target: 'ROSTER', tone: 'todo' },
];

export const inboxLang = (lang: string): InboxLang => lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh';

/** 纯函数：把读到的数字变成清单。没读（undefined）= 没权限或读失败，不列。有数字的排前面。 */
export const buildInboxItems = (counts: InboxCounts, lang: string): InboxItem[] => {
    const l = inboxLang(lang);
    return ORDER.flatMap(o => {
        const raw = counts[o.key];
        if (raw === undefined) return [];
        const count = Array.isArray(raw) ? raw.length : raw;
        const [title, sub] = T[o.key][l];
        return [{ key: o.key, title, sub: sub(count), count, target: o.target, tone: o.tone, ...(Array.isArray(raw) ? { people: raw } : {}) }];
    }).sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
};

const dateAdd = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/** 纯函数：从班表算今天缺席与未来 7 天待定；deptOf 有值时只算该部门 */
export const rosterSignals = (rosters: Record<string, Record<string, string>>, today: string, keep: (empId: string) => boolean) => {
    const absences = Object.entries(rosters[today] || {}).filter(([id, s]) => keep(id) && ['MC', 'LEAVE', 'ABSENT'].includes(String(s)));
    let pending = 0;
    for (let i = 0; i < 7; i++) Object.entries(rosters[dateAdd(today, i)] || {}).forEach(([id, s]) => { if (keep(id) && s === 'PENDING') pending++; });
    return { absences, pending };
};

const has = (allowed: string[], m: string) => allowed.includes(m);
const count = (q: ReturnType<typeof query>) => getCountFromServer(q).then(s => s.data().count);

export const loadManagerInbox = async (employee: Employee, today: string): Promise<InboxCounts> => {
    const allowed = (employee.allowedModules || []) as string[];
    const isL3 = getOrgLevel(employee) === 'DEPARTMENT_HEAD';
    const dept = (employee.department || 'GENERAL').toUpperCase().trim();
    const canRoster = has(allowed, 'ROSTER') || has(allowed, 'ROSTER_KITCHEN') || has(allowed, 'ROSTER_FLOOR');
    const canInventory = allowed.some(m => m.startsWith('INVENTORY'));
    const canProcure = has(allowed, 'PROCUREMENT') && !(isL3 && (dept === 'FLOOR' || dept === 'FOH'));
    // L3 只读自己部门的库存
    const stockTypes: Array<'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL'> = !isL3 ? ['KITCHEN', 'BAR', 'GENERAL', 'FUEL']
        : dept === 'KITCHEN' || dept === 'BOH' ? ['KITCHEN'] : dept === 'BAR' ? ['BAR'] : dept === 'FLOOR' || dept === 'FOH' ? [] : ['GENERAL', 'FUEL'];

    const months = [...new Set([today.slice(0, 7), dateAdd(today, 6).slice(0, 7)])];
    const [drafts, pos, tasks, rosterDocs, stock, employees] = await Promise.allSettled([
        has(allowed, 'SETTLEMENT') ? count(query(collection(db, 'settlements'), where('isClosed', '==', false))) : Promise.reject(),
        canProcure ? DataManager.getPendingPurchaseOrderCount() : Promise.reject(),
        canInventory ? DataManager.getPendingInventoryTasks() : Promise.reject(),
        canRoster ? Promise.all(months.map(m => getDoc(doc(db, 'roster_months', m)))) : Promise.reject(),
        canInventory || canProcure ? Promise.all(stockTypes.map(t => DataManager.getStock(t).catch(() => []))) : Promise.reject(),
        DataManager.getEmployees(),
    ]);
    const ok = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : undefined;

    const emps = ok(employees) || [];
    const byId = new Map(emps.map(e => [e.id, e]));
    const inDept = (id: string) => !isL3 || (byId.get(id)?.department || '').toUpperCase().trim() === dept;

    const out: InboxCounts = {};
    const d = ok(drafts); if (d !== undefined) out.settlementDrafts = d;
    const p = ok(pos); if (p !== undefined) out.poToReceive = p;
    const t = ok(tasks) as InventoryTask[] | undefined; if (t) out.inventoryTasks = t.filter(x => inDept(x.assigneeId)).length;
    const docs = ok(rosterDocs);
    if (docs) {
        const rosters = Object.assign({}, ...docs.map(s => (s.exists() ? s.data().roster : {}) || {})) as Record<string, Record<string, string>>;
        const r = rosterSignals(rosters, today, inDept);
        out.absences = r.absences.map(([id, s]) => ({ name: byId.get(id)?.name || id, status: String(s) }));
        out.rosterPending = r.pending;
    }
    const st = ok(stock); if (st && stockTypes.length) out.lowStock = st.flat().filter(needsReplenishment).length;
    return out;
};
