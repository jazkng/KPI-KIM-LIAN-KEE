// ============================================================================
// 库存资料审计 · 只读
// ----------------------------------------------------------------------------
// 找出会让收货、盘点、成本、编号出错的资料问题，只列出来，不修改任何资料。
// 检查项目（编号计划第 2 步，docs/inventory/2026-10-17-stockcode-audit-and-plan.md）：
//   高：同 ID 复制品、文件 ID 不一致、供应商连结断掉、未收货采购单对不上库存、编号重复 / 登记表不一致
//   中：分类与所在区域不符、认不得的分类、菜谱 / 盘点任务指向不存在的商品、负数库存、同名商品、未编号
//   低：供应商品项没连结库存、库存没有任何供应商、缺单位、名称格式
// ============================================================================

import { collection, getDocs, query, where, type Firestore, type Query } from 'firebase/firestore';
import { STOCK_AREA_COLLECTION, STOCK_AREAS, areaOfCategory, type StockArea } from './stockArea';
import { STOCK_CODE_COUNTERS_COLLECTION, STOCK_CODES_COLLECTION, nameKey, suggestStockName } from './stockCode';
import { catalogPerBaseCost } from './supplyOptions';

export type AuditSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

/** 「去处理」要打开的画面 */
export type AuditTarget =
    | { kind: 'STOCK'; area: StockArea; stockId: string }
    | { kind: 'SUPPLIER'; supplierId: string; catalogItemId?: string }
    | { kind: 'MENU'; menuId: string }
    | { kind: 'TASKS' }
    | { kind: 'CODES' };

/** 跟未收货采购单有关的问题：画面上可以直接「取消这张采购单」 */
export interface AuditPoRef { id: string; supplierName: string; date: string; ageDays: number | null }

export interface AuditFinding {
    target?: AuditTarget;
    po?: AuditPoRef;
    severity: AuditSeverity;
    type: string;
    title: string;        // 问题类别（同一类会归在一起）
    subject: string;      // 哪个商品 / 单据
    detail: string;       // 说明与建议处理方式
    stockId?: string;
}

type Doc = { id: string; data: Record<string, any> };

export interface StockAuditInput {
    stock: Record<StockArea, Doc[]>;
    suppliers: Doc[];
    openPurchaseOrders: Doc[];
    menu: Doc[];
    pendingTasks: Doc[];
    codes: Doc[];
    hasCounters: boolean;
    /** 每个区域在库存画面上的子分类 */
    sections: Record<string, string[]>;
    /** 今天（YYYY-MM-DD），用来算采购单放了几天；测试时固定 */
    today?: string;
}

export const TYPE_LABEL: Record<string, string> = {
    DUPLICATE_ID: '同一 ID 出现在多个区域（复制品）',
    DOC_ID_MISMATCH: '文件 ID 与资料里的 id 不一致',
    BROKEN_SUPPLIER_LINK: '供应商品项连结的库存已不存在',
    OPEN_PO_UNRESOLVED: '未收货的采购单：品项找不到对应库存',
    OPEN_PO_UNLINKED: '未收货的采购单：品项没连结库存（收货不会加库存）',
    STALE_PO: '超过 30 天还没收货的采购单',
    PRICE_DRIFT: '最近进价跟目录价格差超过 10%',
    PREFERRED_GONE: '常用供应商已失效',
    PACK_NAME_CLASH: '同名包装、大小不同',
    STALE_PRICE: '目录价格超过 90 天没更新',
    CODE_DUPLICATE: '编号重复',
    CODE_REGISTRY_MISMATCH: '编号登记表与商品不一致',
    AREA_MISMATCH: '分类与所在区域不符',
    UNKNOWN_CATEGORY: '认不得的分类',
    BROKEN_RECIPE: '菜谱用到的库存已不存在',
    BROKEN_TASK: '盘点任务里的商品已不存在',
    NEGATIVE_QTY: '库存数量是负数',
    SAME_NAME: '同名商品（可能重复建立）',
    MISSING_CODE: '还没有编号',
    UNLINKED_CATALOG: '供应商品项没连结库存',
    NO_SUPPLIER: '库存没有任何供应商连结',
    MISSING_UNIT: '缺基础单位',
    NAME_FORMAT: '名称不是「中文 (English)」',
};

const AREA_LABEL: Record<StockArea, string> = { KITCHEN: '厨房', BAR: '水吧', GENERAL: '后勤', FUEL: '燃料' };
const SEVERITY_RANK: Record<AuditSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const auditStock = (input: StockAuditInput): AuditFinding[] => {
    const out: AuditFinding[] = [];
    const byId = new Map<string, { area: StockArea; data: Record<string, any> }[]>();
    const add = (severity: AuditSeverity, type: string, subject: string, detail: string, stockId?: string, target?: AuditTarget, po?: AuditPoRef) =>
        out.push({ severity, type, title: TYPE_LABEL[type] || type, subject, detail, ...(stockId ? { stockId } : {}), ...(target ? { target } : {}), ...(po ? { po } : {}) });
    const stockTarget = (id: string): AuditTarget | undefined => { const e = byId.get(id)?.[0]; return e ? { kind: 'STOCK', area: e.area, stockId: id } : undefined; };

    // ── 库存本身 ──
    STOCK_AREAS.forEach(area => (input.stock[area] || []).forEach(d => {
        const id = String(d.data.id || d.id);
        byId.set(id, [...(byId.get(id) || []), { area, data: d.data }]);
        if (d.data.id && d.data.id !== d.id) {
            add('HIGH', 'DOC_ID_MISMATCH', `${d.data.name || id}`, `${STOCK_AREA_COLLECTION[area]} 文件「${d.id}」里的 id 是「${d.data.id}」。写入会用 id 当文件名，可能产生另一份资料。请管理员人工处理。`, id, { kind: 'STOCK', area, stockId: id });
        }
    }));
    const label = (id: string) => { const e = byId.get(id)?.[0]; return e ? `${e.data.name || id}${e.data.stockCode ? `（${e.data.stockCode}）` : ''}` : id; };

    byId.forEach((entries, id) => {
        if (entries.length > 1) {
            const qty = entries.map(e => `${AREA_LABEL[e.area]} ${Number(e.data.currentQtyBase ?? e.data.currentQty ?? 0)}`).join('、');
            add('HIGH', 'DUPLICATE_ID', label(id), `同时存在于：${qty}。收货与盘点会被拦下，需决定保留哪一份。`, id, stockTarget(id));
        }
        const { area, data } = entries[0];
        const catArea = areaOfCategory(data.category);
        if (!catArea) add('MEDIUM', 'UNKNOWN_CATEGORY', label(id), `分类「${data.category ?? '（空白）'}」系统认不得，在采购筛选、补货里可能找不到。`, id, stockTarget(id));
        else if (catArea !== area) add('MEDIUM', 'AREA_MISMATCH', label(id), `放在${AREA_LABEL[area]}，但分类「${data.category}」属于${AREA_LABEL[catArea]}。写入仍会写回${AREA_LABEL[area]}；建议改分类或确认放置区域。`, id, stockTarget(id));
        else if (!(input.sections[area] || []).includes(String(data.category))) add('LOW', 'UNKNOWN_CATEGORY', label(id), `分类「${data.category}」不在${AREA_LABEL[area]}的分类清单里，库存画面可能归到「其他」。`, id, stockTarget(id));
        const qty = Number(data.currentQtyBase ?? data.currentQty ?? 0);
        if (qty < 0) add('MEDIUM', 'NEGATIVE_QTY', label(id), `目前数量 ${qty}。可能是盘点或收货单位换算错误。`, id, stockTarget(id));
        if (!data.baseUnit && !data.unit) add('LOW', 'MISSING_UNIT', label(id), '没有基础单位，成本与数量换算可能出错。', id, stockTarget(id));
        if (!data.stockCode && input.hasCounters && entries.length === 1) add('MEDIUM', 'MISSING_CODE', label(id), '已经执行过全部重新连号，这个商品还没有编号。可在「库存编号整理 → 为未编号商品配号」补上。', id, { kind: 'CODES' });
        const ns = suggestStockName(String(data.name || ''));
        if (ns.suggested || ns.issue) add('LOW', 'NAME_FORMAT', label(id), ns.suggested ? `建议改成「${ns.suggested}」` : ns.issue === 'MISSING_ENGLISH' ? '缺英文名' : ns.issue === 'MISSING_CHINESE' ? '缺中文名' : '需人工命名', id, stockTarget(id));
    });

    // 同名
    const byName = new Map<string, string[]>();
    byId.forEach((entries, id) => { const k = nameKey(entries[0].data.name || ''); if (k) byName.set(k, [...(byName.get(k) || []), id]); });
    byName.forEach(ids => {
        if (ids.length < 2) return;
        add('MEDIUM', 'SAME_NAME', ids.map(label).join(' / '), `${ids.length} 个商品名称相同，${ids.map(i => AREA_LABEL[byId.get(i)![0].area]).join('、')}。若是同一样东西，库存与成本会分散在几份里。`, undefined, stockTarget(ids[0]));
    });

    // 编号
    const byCode = new Map<string, string[]>();
    byId.forEach((entries, id) => { const c = entries[0].data.stockCode; if (c) byCode.set(c, [...(byCode.get(c) || []), id]); });
    byCode.forEach((ids, code) => { if (ids.length > 1) add('HIGH', 'CODE_DUPLICATE', code, `编号 ${code} 同时用在：${ids.map(label).join('、')}`, undefined, { kind: 'CODES' }); });
    input.codes.forEach(c => {
        const rec = c.data;
        const holder = byId.get(String(rec.stockId))?.[0];
        if (rec.status === 'RETIRED') return;
        if (!holder) add('HIGH', 'CODE_REGISTRY_MISMATCH', String(rec.code || c.id), `登记给 ${rec.stockId}，但这个商品已不存在。`, undefined, { kind: 'CODES' });
        else if (holder.data.stockCode !== (rec.code || c.id)) add('HIGH', 'CODE_REGISTRY_MISMATCH', String(rec.code || c.id), `登记给 ${label(String(rec.stockId))}，但商品上的编号是「${holder.data.stockCode || '（没有）'}」。`, String(rec.stockId), { kind: 'CODES' });
    });

    // ── 供应商 ──
    const linked = new Set<string>();
    const catalogById = new Map<string, { supplier: string; supplierId: string; item: Record<string, any> }>();
    input.suppliers.forEach(s => {
        const catalog: Record<string, any>[] = s.data.catalog || [];
        const unlinked: string[] = [];
        catalog.forEach(item => {
            catalogById.set(String(item.id), { supplier: s.data.name || s.id, supplierId: String(s.data.id || s.id), item });
            if (!item.linkedStockId) { unlinked.push(item.name); return; }
            linked.add(String(item.linkedStockId));
            if (!byId.has(String(item.linkedStockId))) {
                add('HIGH', 'BROKEN_SUPPLIER_LINK', `${s.data.name || s.id} · ${item.name}`, `连结到 ${item.linkedStockId}，但库存里没有这个商品。收货时库存不会增加。请在供应商品项重新选择连结；不再采购的话删除这个品项。`, undefined, { kind: 'SUPPLIER', supplierId: String(s.data.id || s.id), catalogItemId: String(item.id) });
            }
        });
        if (unlinked.length && s.data.status !== 'INACTIVE') {
            add('LOW', 'UNLINKED_CATALOG', `${s.data.name || s.id}`, `${unlinked.length} 个品项没连结库存：${unlinked.slice(0, 6).join('、')}${unlinked.length > 6 ? '…' : ''}`, undefined, { kind: 'SUPPLIER', supplierId: String(s.data.id || s.id) });
        }
    });
    byId.forEach((entries, id) => {
        if (!linked.has(id)) add('LOW', 'NO_SUPPLIER', label(id), `没有任何供应商品项连结到这个商品（市场临时采购的可以忽略）。`, id, stockTarget(id));
    });

    // ── 未收货采购单 ──
    const today = input.today || new Date().toISOString().slice(0, 10);
    const daysSince = (date: string): number | null => {
        const d = String(date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
        return Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
    };
    const suppliersById = new Map(input.suppliers.map(s => [String(s.data.id || s.id), s]));

    // ── 供应商比价资料 ──
    const optionsByStock = new Map<string, { supplierId: string; supplierName: string; item: Record<string, any> }[]>();
    input.suppliers.forEach(s => (s.data.catalog || []).forEach((item: Record<string, any>) => {
        if (!item.linkedStockId || item.status === 'DISCONTINUED') return;
        const k = String(item.linkedStockId);
        optionsByStock.set(k, [...(optionsByStock.get(k) || []), { supplierId: String(s.data.id || s.id), supplierName: String(s.data.name || s.id), item }]);
        const supTarget: AuditTarget = { kind: 'SUPPLIER', supplierId: String(s.data.id || s.id), catalogItemId: String(item.id) };
        const subject = `${s.data.name || s.id} · ${item.name}`;
        const catalogBase = catalogPerBaseCost(item as any);
        const lastBase = Number(item.lastReceivedPricePerBase);
        if (catalogBase && lastBase > 0) {
            const pct = ((lastBase - catalogBase) / catalogBase) * 100;
            if (Math.abs(pct) > 10) add('MEDIUM', 'PRICE_DRIFT', subject, `目录 RM ${catalogBase.toFixed(4)}，${String(item.lastReceivedAt || '').slice(0, 10)} 实际进价 RM ${lastBase.toFixed(4)}（每基础单位 ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%）。补货估价会不准，请更新目录价格。`, undefined, supTarget);
        }
        const updated = daysSince(String(item.priceUpdatedAt || ''));
        if (updated !== null && updated > 90) add('LOW', 'STALE_PRICE', subject, `目录价格 ${String(item.priceUpdatedAt).slice(0, 10)} 之后没有更新（${updated} 天），请跟供应商确认现价。`, undefined, supTarget);
    }));
    optionsByStock.forEach((opts, stockId) => {
        if (!byId.has(stockId)) return;
        const byUnit = new Map<string, Set<number>>();
        opts.forEach(o => {
            if (o.item.pricingMode === 'WEIGHT_BASED' || o.item.conversionMode === 'ACTUAL_WEIGHT') return;
            const unit = String(o.item.purchaseUnitName || o.item.unit || '').trim().toLowerCase();
            if (!unit) return;
            byUnit.set(unit, new Set([...(byUnit.get(unit) || []), Number(o.item.toBaseRatio) || 1]));
        });
        byUnit.forEach((ratios, unit) => {
            if (ratios.size > 1) add('LOW', 'PACK_NAME_CLASH', label(stockId), `几家供应商都叫「${unit.toUpperCase()}」，但 1 ${unit.toUpperCase()} = ${[...ratios].sort((a, b) => a - b).join(' / ')}。系统已按各家自己的包装计算；下单时看清楚是哪一家，也可以在包装说明写清楚。`, stockId, stockTarget(stockId));
        });
    });
    byId.forEach((entries, id) => {
        const pref = entries[0].data.preferredSupply;
        if (!pref?.supplierId) return;
        const sup = suppliersById.get(String(pref.supplierId));
        const item = (sup?.data.catalog || []).find((c: Record<string, any>) => String(c.id) === String(pref.catalogItemId));
        const why = !sup ? '供应商已删除' : !item ? '供应商品项已删除' : item.linkedStockId !== id ? '供应商品项已改连到别的商品' : item.status === 'DISCONTINUED' ? '供应商品项已停售' : null;
        if (why) add('MEDIUM', 'PREFERRED_GONE', label(id), `${why}；补货会改用最便宜的那家。请在库存编辑窗「供应商比价」重新设常用。`, id, stockTarget(id));
    });
    input.openPurchaseOrders.forEach(po => {
        const poId = String(po.data.id || po.id);
        const date = String(po.data.date || '').slice(0, 10);
        const ageDays = daysSince(date);
        const supplierName = String(po.data.supplierName || po.data.supplierId || '');
        const poRef: AuditPoRef = { id: poId, supplierName, date, ageDays };
        const ageText = date ? `（${date} 下单${ageDays !== null ? `，已 ${ageDays} 天` : ''}）` : '';
        const lines: Record<string, any>[] = po.data.items || [];
        if (ageDays !== null && ageDays > 30) {
            add('MEDIUM', 'STALE_PO', `${supplierName} · ${poId}`, `${date} 下单，已 ${ageDays} 天还没在系统收货，共 ${lines.length} 个品项。货早就收了的话取消这张单（不要再按收货，以免多出一笔应付账款）；还没到货就跟供应商确认。`, undefined, undefined, poRef);
        }
        const supplierCatalog: Record<string, any>[] = suppliersById.get(String(po.data.supplierId || ''))?.data.catalog || [];
        lines.forEach(line => {
            const sid = String(line.stockId || '');
            const subject = `${supplierName} · ${poId} · ${line.name}`;
            const cat = catalogById.get(sid);
            const poTarget: AuditTarget | undefined = cat ? { kind: 'SUPPLIER', supplierId: cat.supplierId, catalogItemId: String(cat.item.id) }
                : po.data.supplierId ? { kind: 'SUPPLIER', supplierId: String(po.data.supplierId) } : undefined;
            if (cat) {
                if (!cat.item.linkedStockId) add('MEDIUM', 'OPEN_PO_UNLINKED', subject, `供应商品项没连结库存，收货后库存不会增加${ageText}。`, undefined, poTarget, poRef);
                else if (!byId.has(String(cat.item.linkedStockId))) add('HIGH', 'OPEN_PO_UNRESOLVED', subject, `供应商品项连结的 ${cat.item.linkedStockId} 已不存在${ageText}。`, undefined, poTarget, poRef);
                return;
            }
            if (byId.has(sid)) return;
            // 供应商现在有同名品项：多半是品项重建过，采购单还记着旧代码
            const sameName = supplierCatalog.find(c => nameKey(String(c.name || '')) === nameKey(String(line.name || '')));
            const hint = sameName
                ? `供应商现在有同名品项「${sameName.name}」，品项多半重建过，这张单还记着旧代码。`
                : `供应商目前没有这个品项。`;
            add('HIGH', 'OPEN_PO_UNRESOLVED', subject, `品项代码「${sid}」找不到，收货时库存不会增加${ageText}。${hint}货已收 → 取消这张单；还没到 → 取消后用现在的品项重新下单。`, undefined, poTarget, poRef);
        });
    });

    // ── 菜谱、盘点任务 ──
    input.menu.forEach(m => {
        (m.data.variants || []).forEach((v: Record<string, any>) => (v.recipe || []).forEach((ing: Record<string, any>) => {
            if (ing.stockId && !byId.has(String(ing.stockId))) {
                add('MEDIUM', 'BROKEN_RECIPE', `${m.data.name}${v.label ? `（${v.label}）` : ''} · ${ing.stockName || ing.stockId}`, `配方用到的 ${ing.stockId} 已不存在，菜品成本会少算。请在智能菜谱重新选择食材。`, undefined, { kind: 'MENU', menuId: String(m.data.id || m.id) });
            }
        }));
    });
    input.pendingTasks.forEach(t => {
        const missing = (t.data.items || []).filter((i: Record<string, any>) => !byId.has(String(i.stockId)));
        if (missing.length) add('MEDIUM', 'BROKEN_TASK', `盘点任务 ${t.id}（${t.data.assigneeName || ''}）`, `${missing.length} 个商品已不存在：${missing.slice(0, 5).map((i: any) => i.stockName).join('、')}。执行时会自动略过。`, undefined, { kind: 'TASKS' });
    });

    return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.title.localeCompare(b.title) || a.subject.localeCompare(b.subject));
};

/** 只读载入审计所需资料 */
export const loadStockAuditInput = async (db: Firestore, sections: Record<string, string[]>): Promise<StockAuditInput> => {
    const docs = async (q: Query): Promise<Doc[]> => (await getDocs(q)).docs.map(d => ({ id: d.id, data: d.data() }));
    const stock = {} as Record<StockArea, Doc[]>;
    for (const area of STOCK_AREAS) stock[area] = await docs(collection(db, STOCK_AREA_COLLECTION[area]));
    const [suppliers, openPurchaseOrders, menu, pendingTasks, codes, counters] = await Promise.all([
        docs(collection(db, 'suppliers')),
        docs(query(collection(db, 'purchase_orders'), where('status', '==', 'ORDERED'))),
        docs(collection(db, 'menu')),
        docs(query(collection(db, 'inventory_tasks'), where('status', '==', 'PENDING'))),
        docs(collection(db, STOCK_CODES_COLLECTION)),
        docs(collection(db, STOCK_CODE_COUNTERS_COLLECTION)),
    ]);
    return { stock, suppliers, openPurchaseOrders, menu, pendingTasks, codes, hasCounters: counters.length > 0, sections };
};
