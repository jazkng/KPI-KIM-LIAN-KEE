// ============================================================================
// 全部重新连号 · 资料库操作（只在负责人按下确认后执行）
// ----------------------------------------------------------------------------
// 流程：读取（只读）→ 下载备份并重新读档确认 → 预览 → 写入 → 校验 →（必要时）按 runId 回滚。
// 写入原则（docs/inventory/2026-10-17-stockcode-audit-and-plan.md 第 6 节）：
//   - 只用 update 写编号字段（以及负责人逐项勾选的新名称），绝不整份覆盖，不碰 id / 数量 / 成本 / 单位 / 分类。
//   - 每批一个交易；写入前再检查一次，已有别的编号或编号被占用就跳过并记录。
//   - 每个商品的结果记在 stock_code_migration_runs/{runId}/items/{stockId}，可用同一 runId 续跑、可回滚。
// 自动化测试只在 Emulator（demo-klk-erp）执行。
// ============================================================================

import {
    collection, deleteDoc, deleteField, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, type Firestore,
} from 'firebase/firestore';
import type { StockCodeMigrationRun } from '../../types';
import { STOCK_AREA_COLLECTION, STOCK_AREAS, type StockArea } from './stockArea';
import {
    STOCK_CODE_COUNTERS_COLLECTION, STOCK_CODE_PREFIX, STOCK_CODE_RUNS_COLLECTION, STOCK_CODES_COLLECTION,
    planFingerprint, type RenumberInput, type RenumberPlan,
} from './stockCode';

export const RUNS = STOCK_CODE_RUNS_COLLECTION;
export const CODES = STOCK_CODES_COLLECTION;
export const COUNTERS = STOCK_CODE_COUNTERS_COLLECTION;
const BATCH = 100; // 每个商品 3 读 3 写，100 个一批，低于 Firestore 交易 500 写入上限

// ── 读取（只读） ─────────────────────────────────────────────────────────────

export interface StockSnapshot {
    items: RenumberInput[];
    /** 同一 ID 出现在两个区域，或文件 ID 与资料里的 id 不一致：不配号，要人工处理 */
    blockedIds: Set<string>;
    problems: { stockId: string; message: string }[];
    raw: Record<string, { id: string; data: Record<string, any> }[]>;
}

export const loadStockSnapshot = async (db: Firestore): Promise<StockSnapshot> => {
    const raw: StockSnapshot['raw'] = {};
    const items: RenumberInput[] = [];
    const areasById = new Map<string, StockArea[]>();
    const problems: StockSnapshot['problems'] = [];
    const blockedIds = new Set<string>();
    for (const area of STOCK_AREAS) {
        const col = STOCK_AREA_COLLECTION[area];
        const snap = await getDocs(collection(db, col));
        raw[col] = snap.docs.map(d => ({ id: d.id, data: d.data() }));
        snap.docs.forEach(d => {
            const data = d.data();
            const id = String(data.id || d.id);
            if (data.id && data.id !== d.id) {
                blockedIds.add(id);
                problems.push({ stockId: id, message: `文件 ID「${d.id}」与资料里的 id 不一致（${col}）` });
            }
            areasById.set(id, [...(areasById.get(id) || []), area]);
            items.push({ id, area, name: data.name, category: data.category, stockCode: data.stockCode, legacyCodes: data.legacyCodes });
        });
    }
    areasById.forEach((areas, id) => {
        if (areas.length > 1) {
            blockedIds.add(id);
            problems.push({ stockId: id, message: `同一 ID 同时存在于：${areas.join('、')}` });
        }
    });
    return { items, blockedIds, problems, raw };
};

// ── 备份 ─────────────────────────────────────────────────────────────────────

export const BACKUP_COLLECTIONS = [...STOCK_AREAS.map(a => STOCK_AREA_COLLECTION[a]), CODES, COUNTERS];

export interface BackupFile {
    kind: 'klk-stock-backup';
    createdAt: string;
    createdBy: string;
    collections: Record<string, { count: number; sha256: string; docs: { id: string; data: Record<string, any> }[] }>;
}

const sha256 = async (text: string): Promise<string> => {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

const canonical = (docs: { id: string; data: Record<string, any> }[]) => {
    const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys)
        : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
    return JSON.stringify([...docs].sort((a, b) => a.id.localeCompare(b.id)).map(sortKeys));
};

export const createBackup = async (db: Firestore, by: string): Promise<BackupFile> => {
    const collections: BackupFile['collections'] = {};
    for (const col of BACKUP_COLLECTIONS) {
        const snap = await getDocs(collection(db, col));
        // 先转成 JSON 再算校验码：日期等特殊型别下载后读回来要一模一样
        const docs = JSON.parse(JSON.stringify(snap.docs.map(d => ({ id: d.id, data: d.data() }))));
        collections[col] = { count: docs.length, sha256: await sha256(canonical(docs)), docs };
    }
    return { kind: 'klk-stock-backup', createdAt: new Date().toISOString(), createdBy: by, collections };
};

/** 重新读入下载的备份档：内容完整（SHA-256 相符），而且文件数与资料库现在一致，才算可用 */
export const checkBackupFile = async (db: Firestore, text: string): Promise<{ ok: boolean; messages: string[]; backup?: BackupFile }> => {
    const messages: string[] = [];
    let backup: BackupFile;
    try { backup = JSON.parse(text); } catch { return { ok: false, messages: ['不是有效的备份档（JSON 读不出来）'] }; }
    if (backup?.kind !== 'klk-stock-backup') return { ok: false, messages: ['不是库存备份档'] };
    let ok = true;
    for (const col of BACKUP_COLLECTIONS) {
        const part = backup.collections?.[col];
        if (!part) { ok = false; messages.push(`${col}：备份档缺少这个集合`); continue; }
        const hash = await sha256(canonical(part.docs));
        if (hash !== part.sha256 || part.docs.length !== part.count) { ok = false; messages.push(`${col}：内容与校验码不符，档案可能损坏`); continue; }
        const live = (await getDocs(collection(db, col))).size;
        if (live !== part.count) { ok = false; messages.push(`${col}：备份 ${part.count} 笔，资料库现在 ${live} 笔，请重新备份`); continue; }
        messages.push(`${col}：${part.count} 笔 ✓`);
    }
    return { ok, messages, backup };
};

// ── 写入 ─────────────────────────────────────────────────────────────────────

export interface ApplyOptions {
    runId: string;
    by: string;
    /** 负责人勾选要改的名称：stockId → 新名称 */
    renames?: Record<string, string>;
    backupSummary?: { collection: string; count: number; sha256: string }[];
    onProgress?: (done: number, total: number) => void;
}

export interface ApplyResult { done: number; skipped: number; failed: number; renamed: number; messages: string[] }

const readCounters = async (db: Firestore): Promise<Record<string, number | null>> => {
    const out: Record<string, number | null> = {};
    for (const area of STOCK_AREAS) {
        const p = STOCK_CODE_PREFIX[area];
        const s = await getDoc(doc(db, COUNTERS, p));
        out[p] = s.exists() ? Number(s.data().nextSeq) : null;
    }
    return out;
};

export const applyRenumberPlan = async (db: Firestore, plan: RenumberPlan, opts: ApplyOptions): Promise<ApplyResult> => {
    const { runId, by, renames = {} } = opts;
    const planHash = planFingerprint(plan);
    const runRef = doc(db, RUNS, runId);
    const existingRun = await getDoc(runRef);
    const counters = await readCounters(db);

    if (existingRun.exists()) {
        const r = existingRun.data() as StockCodeMigrationRun;
        if (r.planHash !== planHash) throw new Error('这个执行编号对应的是另一份计划，不能续跑');
        if (r.status === 'DONE' || r.status === 'ROLLED_BACK') throw new Error(`这次执行已经是「${r.status}」状态`);
    } else {
        if (Object.values(counters).some(v => v !== null)) throw new Error('资料库已经有编号计数器（已经重新编号过），不能再执行全部重新连号');
        const run: StockCodeMigrationRun = {
            id: runId, startedAt: new Date().toISOString(), by, planHash, total: plan.rows.length,
            done: 0, skipped: 0, failed: 0, renamed: 0, status: 'RUNNING',
            countersBefore: counters, countersAfter: {},
            ...(opts.backupSummary ? { backupSummary: opts.backupSummary } : {}),
        };
        await setDoc(runRef, run);
    }

    const result: ApplyResult = { done: 0, skipped: 0, failed: 0, renamed: 0, messages: [] };
    const now = new Date().toISOString();
    for (let i = 0; i < plan.rows.length; i += BATCH) {
        const chunk = plan.rows.slice(i, i + BATCH);
        const part = await runTransaction(db, async tx => {
            const refs = chunk.map(r => ({
                item: doc(db, STOCK_AREA_COLLECTION[r.area], r.stockId),
                code: doc(db, CODES, r.newCode),
                rec: doc(db, RUNS, runId, 'items', r.stockId),
            }));
            const snaps = await Promise.all(refs.map(async r => ({
                item: await tx.get(r.item), code: await tx.get(r.code), rec: await tx.get(r.rec),
            })));
            const out: ApplyResult = { done: 0, skipped: 0, failed: 0, renamed: 0, messages: [] };
            chunk.forEach((row, idx) => {
                const s = snaps[idx];
                const ref = refs[idx];
                if (s.rec.exists() && s.rec.data().status === 'DONE') { out.done++; return; } // 续跑：已完成
                const fail = (status: 'SKIPPED' | 'FAILED', message: string) => {
                    if (status === 'SKIPPED') out.skipped++; else out.failed++;
                    out.messages.push(`${row.name}（${row.stockId}）：${message}`);
                    tx.set(ref.rec, { stockId: row.stockId, area: row.area, code: row.newCode, status, message, at: now });
                };
                if (!s.item.exists()) return fail('FAILED', '找不到这个商品（可能刚被删除）');
                const data = s.item.data();
                if (data.stockCode && data.stockCode !== row.newCode) return fail('SKIPPED', `已经有编号 ${data.stockCode}`);
                if (s.code.exists() && s.code.data().stockId !== row.stockId) return fail('FAILED', `编号 ${row.newCode} 已被 ${s.code.data().stockId} 使用`);

                const legacy = [...new Set([...(data.legacyCodes || []), ...row.legacyCodes])].filter(c => c !== row.newCode);
                const update: Record<string, any> = {
                    stockCode: row.newCode, stockCodeAssignedAt: now, stockCodeAssignedBy: by,
                    stockCodeSource: 'MIGRATION', stockCodeRunId: runId, legacyCodes: legacy,
                };
                const newName = renames[row.stockId]?.trim();
                let renamed = false;
                if (newName && newName !== data.name) {
                    if (data.name !== row.name) {
                        out.messages.push(`${row.name}（${row.stockId}）：名称在预览后被改过，没有改名`);
                    } else {
                        update.name = newName;
                        update.nameHistory = [...(data.nameHistory || []), { name: data.name, changedAt: now, changedBy: by, runId }];
                        renamed = true;
                        out.renamed++;
                    }
                }
                tx.update(ref.item, update);
                tx.set(ref.code, { code: row.newCode, stockId: row.stockId, area: row.area, status: 'ACTIVE', assignedAt: now, assignedBy: by, source: 'MIGRATION', runId });
                tx.set(ref.rec, {
                    stockId: row.stockId, area: row.area, code: row.newCode, status: 'DONE', at: now,
                    prevLegacyCodes: data.legacyCodes ?? null,
                    ...(renamed ? { prevName: data.name, newName, prevNameHistory: data.nameHistory ?? null } : {}),
                });
                out.done++;
            });
            return out;
        });
        result.done += part.done; result.skipped += part.skipped; result.failed += part.failed; result.renamed += part.renamed;
        result.messages.push(...part.messages);
        opts.onProgress?.(Math.min(i + BATCH, plan.rows.length), plan.rows.length);
    }

    // 计数器：下一个要发的号码（只往前推）
    const countersAfter: Record<string, number> = {};
    for (const area of STOCK_AREAS) {
        const p = STOCK_CODE_PREFIX[area];
        const next = Math.max(plan.nextSeq[area], (await readCounters(db))[p] ?? 1);
        countersAfter[p] = next;
        await setDoc(doc(db, COUNTERS, p), { prefix: p, nextSeq: next, updatedAt: new Date().toISOString() });
    }
    await updateDoc(runRef, {
        finishedAt: new Date().toISOString(), countersAfter,
        done: result.done, skipped: result.skipped, failed: result.failed, renamed: result.renamed,
        status: result.failed > 0 ? 'PARTIAL' : 'DONE',
    });
    return result;
};

// ── 校验 ─────────────────────────────────────────────────────────────────────

export interface VerifyCheck { label: string; ok: boolean; detail: string }

const qtyOf = (d: Record<string, any>) => Number(d.currentQtyBase ?? d.currentQty ?? 0) || 0;
const valueOf = (d: Record<string, any>) => qtyOf(d) * (Number(d.costPerBaseUnit ?? d.cost ?? 0) || 0);
const round = (n: number) => Math.round(n * 100) / 100;

export const verifyRenumber = async (db: Firestore, plan: RenumberPlan, backup: BackupFile): Promise<VerifyCheck[]> => {
    const checks: VerifyCheck[] = [];
    const snap = await loadStockSnapshot(db);
    for (const area of STOCK_AREAS) {
        const col = STOCK_AREA_COLLECTION[area];
        const before = backup.collections[col]?.docs || [];
        const after = snap.raw[col];
        const qb = round(before.reduce((s, d) => s + qtyOf(d.data), 0)), qa = round(after.reduce((s, d) => s + qtyOf(d.data), 0));
        const vb = round(before.reduce((s, d) => s + valueOf(d.data), 0)), va = round(after.reduce((s, d) => s + valueOf(d.data), 0));
        checks.push({ label: `${col} 文件数`, ok: before.length === after.length, detail: `${before.length} → ${after.length}` });
        checks.push({ label: `${col} 数量总和`, ok: qb === qa, detail: `${qb} → ${qa}` });
        checks.push({ label: `${col} 库存金额`, ok: vb === va, detail: `RM ${vb} → RM ${va}` });
    }
    const byId = new Map(snap.items.map(i => [i.id, i]));
    const missing = plan.rows.filter(r => byId.get(r.stockId)?.stockCode !== r.newCode);
    checks.push({ label: '每个商品都拿到计划的编号', ok: missing.length === 0, detail: missing.length ? `${missing.length} 个没有：${missing.slice(0, 5).map(r => r.name).join('、')}` : `${plan.rows.length} 个 ✓` });
    const codes = snap.items.map(i => i.stockCode).filter(Boolean) as string[];
    const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
    checks.push({ label: '编号没有重复', ok: dup.length === 0, detail: dup.length ? `重复：${[...new Set(dup)].join('、')}` : `${codes.length} 个编号 ✓` });
    const reg = (await getDocs(collection(db, CODES))).docs.map(d => d.data());
    const regMismatch = reg.filter(r => byId.get(r.stockId)?.stockCode !== r.code);
    checks.push({ label: '编号登记表与商品一致', ok: regMismatch.length === 0, detail: regMismatch.length ? `${regMismatch.length} 笔不一致` : `${reg.length} 笔 ✓` });
    return checks;
};

// ── 回滚 ─────────────────────────────────────────────────────────────────────

export const rollbackRenumber = async (db: Firestore, runId: string): Promise<{ reverted: number; messages: string[] }> => {
    const runRef = doc(db, RUNS, runId);
    const runSnap = await getDoc(runRef);
    if (!runSnap.exists()) throw new Error('找不到这次执行记录');
    const run = runSnap.data() as StockCodeMigrationRun;
    if (run.status === 'ROLLED_BACK') throw new Error('这次执行已经回滚过');
    const others = (await getDocs(collection(db, CODES))).docs.filter(d => d.data().runId !== runId);
    if (others.length) throw new Error(`重新编号之后又发出了 ${others.length} 个新编号，不能整批回滚（会造成编号重复使用），请联络开发处理`);

    const recs = (await getDocs(collection(db, RUNS, runId, 'items'))).docs.map(d => d.data()).filter(r => r.status === 'DONE');
    const messages: string[] = [];
    let reverted = 0;
    for (let i = 0; i < recs.length; i += BATCH) {
        const chunk = recs.slice(i, i + BATCH);
        reverted += await runTransaction(db, async tx => {
            const refs = chunk.map(r => ({
                item: doc(db, STOCK_AREA_COLLECTION[r.area as StockArea], r.stockId),
                code: doc(db, CODES, r.code),
                rec: doc(db, RUNS, runId, 'items', r.stockId),
            }));
            const snaps = await Promise.all(refs.map(async r => ({ item: await tx.get(r.item), code: await tx.get(r.code) })));
            let n = 0;
            chunk.forEach((r, idx) => {
                const s = snaps[idx];
                if (s.item.exists() && s.item.data().stockCodeRunId === runId) {
                    const d = s.item.data();
                    const undo: Record<string, any> = {
                        stockCode: deleteField(), stockCodeAssignedAt: deleteField(), stockCodeAssignedBy: deleteField(),
                        stockCodeSource: deleteField(), stockCodeRunId: deleteField(),
                        legacyCodes: r.prevLegacyCodes ?? deleteField(),
                    };
                    if (r.newName) {
                        if (d.name === r.newName) {
                            undo.name = r.prevName;
                            undo.nameHistory = r.prevNameHistory ?? deleteField();
                        } else {
                            messages.push(`${r.stockId}：名称在重新编号后又被改过，保留现在的名称`);
                        }
                    }
                    tx.update(refs[idx].item, undo);
                    n++;
                } else {
                    messages.push(`${r.stockId}：编号已不是这次写入的，没有动`);
                }
                if (s.code.exists() && s.code.data().runId === runId) tx.delete(refs[idx].code);
                tx.update(refs[idx].rec, { status: 'ROLLED_BACK', rolledBackAt: new Date().toISOString() });
            });
            return n;
        });
    }
    for (const [p, v] of Object.entries(run.countersBefore || {})) {
        if (v === null) await deleteDoc(doc(db, COUNTERS, p));
        else await setDoc(doc(db, COUNTERS, p), { prefix: p, nextSeq: v, updatedAt: new Date().toISOString() });
    }
    await updateDoc(runRef, { status: 'ROLLED_BACK', rolledBackAt: new Date().toISOString() });
    return { reverted, messages };
};
