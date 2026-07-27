import { db } from '../firebaseConfig';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc, getCountFromServer, query, where, writeBatch, updateDoc, runTransaction, limit, orderBy, onSnapshot, startAfter } from 'firebase/firestore';
import { 
    Employee, SettlementRecord, ExpenseItem, RecurringBill, 
    BillPaymentRecord, StockItem, Supplier, PurchaseOrder, 
    MenuItem, QueueTicket, QueueSize, LogEntry, RoleGuide, PayrollRecord, 
    StoreConfig, AttendanceRecord, SystemBackup, TreasuryConfig, FundTransfer,
    WarrantyRecord, InventoryLog, InventoryTask,
    Proposal, OKR, MarketingCampaign, StoreEvent,
    MisconductRecord, WarningRecord,
    TaskCompletion,
    StockPriceEntry, StockPriceHistory,
    SelfIssuedVoucher, AppLanguage, LogStatus, OperationalLogReply,
    OperationalLogReadReceipt, SystemNotification
} from "../types";
import { APP_VERSION } from "../constants/versionHistory";
import { PaymentVoucher } from "./paymentVoucherUtils";
import { normalizeInventoryItem } from "./unitConversion";
import { normalizeEmployeeOrgFields } from "./orgAccess";
import { buildOperationalLogNotifications } from "./notificationUtils";
import { getBusinessDateString } from "./dateHelper";

const withoutUndefined = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;

const getLegacyLogTimestamp = (log: LogEntry): string => {
    if (log.updatedAt) return log.updatedAt;
    if (log.acknowledgedAt) return log.acknowledgedAt;
    return `${log.date} ${log.time || '00:00'}`;
};

const normalizeOperationalLog = (rawLog: LogEntry): LogEntry => {
    const replies = [...(rawLog.replies || [])];
    const readReceipts = [...(rawLog.readReceipts || [])];

    if (rawLog.action?.trim() && replies.length === 0) {
        replies.push({
            id: `legacy-${rawLog.id}`,
            authorId: 'LEGACY',
            authorName: '旧系统记录',
            content: rawLog.action.trim(),
            createdAt: getLegacyLogTimestamp(rawLog),
            legacy: true,
        });
    }

    if (rawLog.acknowledgedBy && readReceipts.length === 0) {
        readReceipts.push({
            employeeId: `legacy-${rawLog.acknowledgedBy}`,
            employeeName: rawLog.acknowledgedBy,
            readAt: rawLog.acknowledgedAt || getLegacyLogTimestamp(rawLog),
            legacy: true,
        });
    }

    return {
        ...rawLog,
        status: rawLog.status === 'RESOLVED'
            ? 'RESOLVED'
            : rawLog.status === 'IN_PROGRESS'
                ? 'IN_PROGRESS'
                : 'PENDING',
        replies,
        readReceipts,
    };
};

export class DataManager {

    // ==========================================
    // 🛡️ 智能读配额优化与并发行程缓存 (Smart Read Cache System)
    // ==========================================
    private static cache: Record<string, { data: any; timestamp: number }> = {};
    private static cachedPromises: Record<string, Promise<any>> = {};
    private static defaultTTL = 90 * 1000; // 90 seconds in-memory TTL

    private static getCachedData<T>(key: string, ttl: number = DataManager.defaultTTL): T | null {
        const cachedItem = DataManager.cache[key];
        if (cachedItem && (Date.now() - cachedItem.timestamp < ttl)) {
            return cachedItem.data as T;
        }
        return null;
    }

    private static setCachedData(key: string, data: any): void {
        DataManager.cache[key] = { data, timestamp: Date.now() };
    }

    public static clearCacheKeys(keysGlob: string[]): void {
        keysGlob.forEach(pattern => {
            Object.keys(DataManager.cache).forEach(k => {
                if (k.toLowerCase().includes(pattern.toLowerCase())) {
                    delete DataManager.cache[k];
                    delete DataManager.cachedPromises[k];
                }
            });
        });
    }

    private static async runWithCache<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number = DataManager.defaultTTL
    ): Promise<T> {
        const cached = DataManager.getCachedData<T>(key, ttl);
        if (cached !== null) {
            return cached;
        }
        if (DataManager.cachedPromises[key]) {
            return DataManager.cachedPromises[key];
        }
        const promise = fetcher().then(data => {
            DataManager.setCachedData(key, data);
            delete DataManager.cachedPromises[key];
            return data;
        }).catch(err => {
            delete DataManager.cachedPromises[key];
            throw err;
        });

        DataManager.cachedPromises[key] = promise;
        return promise;
    }

    // ==========================================
    // 🟢 结算并发与防重逻辑
    // ==========================================
    static async checkSettlementExists(date: string): Promise<boolean> {
        const q = query(collection(db, 'settlements'), where('date', '==', date), limit(1));
        const snap = await getDocs(q);
        return !snap.empty;
    }

    static async executeSettlementTransaction(record: SettlementRecord): Promise<void> {
        const settlementRef = doc(db, 'settlements', record.id);
        const activeShiftRef = doc(db, 'config', 'active_shift');
        await runTransaction(db, async (transaction) => {
            const historyRef = collection(db, 'settlements');
            const q = query(historyRef, where('date', '==', record.date), limit(1));
            const existingDocs = await getDocs(q); 
            if (!existingDocs.empty) {
                throw new Error(`DATE_ALREADY_SETTLED:${record.date}`);
            }
            transaction.set(settlementRef, record);
            if (record.expenses && record.expenses.length > 0) {
                record.expenses.forEach(exp => {
                    const expRef = doc(db, 'standalone_expenses', exp.id as string);
                    transaction.set(expRef, { ...exp, settlementId: record.id });
                });
            }
            transaction.delete(activeShiftRef);
        });
    }

    // ==========================================
    // 🟢 员工与违纪
    // ==========================================
    static async getEmployees(): Promise<Employee[]> {
        return DataManager.runWithCache('employees', async () => {
            const snap = await getDocs(collection(db, 'employees'));
            return snap.docs.map(d => normalizeEmployeeOrgFields(d.data() as Employee));
        });
    }
    static async getEmployeeById(id: string): Promise<Employee | null> {
        if (!id) return null;
        const snap = await getDoc(doc(db, 'employees', id));
        if (!snap.exists()) return null;

        const employee = snap.data() as Employee;
        return normalizeEmployeeOrgFields({
            ...employee,
            id: employee.id || snap.id,
        });
    }
    static async getEmployeesByIds(ids: string[]): Promise<Employee[]> {
        const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
        if (uniqueIds.length === 0) return [];

        const employees = await Promise.all(
            uniqueIds.map(id => DataManager.getEmployeeById(id).catch(() => null))
        );
        return employees.filter((employee): employee is Employee => employee !== null);
    }
    static async saveEmployee(employee: Employee): Promise<void> {
        await setDoc(doc(db, 'employees', employee.id), normalizeEmployeeOrgFields(employee));
        DataManager.clearCacheKeys(['employees']);
    }
    static async deleteEmployee(id: string): Promise<void> {
        await deleteDoc(doc(db, 'employees', id));
        DataManager.clearCacheKeys(['employees']);
    }

    static async updateEmployeePreferredLanguage(
        employeeId: string,
        preferredLanguage: AppLanguage
    ): Promise<void> {
        await updateDoc(doc(db, 'employees', employeeId), {
            preferredLanguage
        });
        DataManager.clearCacheKeys(['employees']);
    }

    static async updateEmployeeMisconduct(empId: string, type: 'SMALL' | 'MEDIUM' | 'BIG', issue: string, fine?: number): Promise<string> {
        const empRef = doc(db, 'employees', empId);
        let finalResultMsg = '';
        await runTransaction(db, async (transaction) => {
            const empSnap = await transaction.get(empRef);
            if (!empSnap.exists()) {
                finalResultMsg = 'Employee not found';
                return;
            }
            const emp = empSnap.data() as Employee;
            const stats = JSON.parse(JSON.stringify(emp.misconductStats || { smallCount: 0, mediumCount: 0, yellowCount: 0 }));
            const warnings = JSON.parse(JSON.stringify(emp.warningHistory || []));
            const attributes = JSON.parse(JSON.stringify(emp.attributes || { efficiency: 60, service: 60, culinary: 60, leadership: 60, discipline: 60 }));
            let resultMsg = '';
            let triggerYellow = false;
            let triggerRed = false;
            if (type === 'SMALL') {
                stats.smallCount += 1;
                if (stats.smallCount >= 5) {
                    stats.smallCount = 0; 
                    triggerYellow = true;
                    resultMsg = '⚠️ 累计 5 小错 -> 触发黄色警告 (Yellow Warning)';
                } else {
                    resultMsg = `⚠️ 记 1 小错 (当前: ${stats.smallCount}/5)`;
                }
            } else if (type === 'MEDIUM') {
                stats.mediumCount += 1;
                if (stats.mediumCount >= 3) {
                    stats.mediumCount = 0; 
                    triggerYellow = true;
                    resultMsg = '⚠️ 累计 3 中错 -> 触发黄色警告 (Yellow Warning)';
                } else {
                    resultMsg = `⚠️ 记 1 中错 (当前: ${stats.mediumCount}/3)`;
                }
            } else if (type === 'BIG') {
                triggerYellow = true;
                resultMsg = '🛑 大错 -> 直接触发黄色警告 (Direct Yellow Warning)';
            }
            const today = new Date().toISOString().split('T')[0];
            if (triggerYellow) {
                stats.yellowCount += 1;
                warnings.unshift({
                    id: `warn_${Date.now()}_${Math.random().toString(36).substring(2,7)}`, 
                    date: today, type: 'WRITTEN',
                    reason: `[System] ${resultMsg} - ${issue}`, issuer: 'System (Logbook)', fineAmount: fine
                });
                attributes.discipline = Math.max(0, attributes.discipline - 10);
                if (stats.yellowCount >= 3) {
                    stats.yellowCount = 0;
                    triggerRed = true;
                    resultMsg += ' -> 累计 3 黄 -> 🔴 触发红色警告 (Red Warning)';
                }
            }
            if (triggerRed) {
                warnings.unshift({
                    id: `warn_red_${Date.now()}_${Math.random().toString(36).substring(2,7)}`, 
                    date: today, type: 'FINAL', 
                    reason: `[System] 3 Yellow Warnings Triggered Red Warning - ${issue}`, issuer: 'System (Logbook)', fineAmount: 0 
                });
                attributes.discipline = Math.max(0, attributes.discipline - 20); 
            }
            if (!triggerYellow && !triggerRed) {
                 warnings.unshift({
                    id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2,7)}`, 
                    date: today, type: 'VERBAL', 
                    reason: `[Mistake: ${type}] ${issue}`, issuer: 'System (Logbook)', fineAmount: fine
                });
                attributes.discipline = Math.max(0, attributes.discipline - (type === 'MEDIUM' ? 3 : 1));
            }
            transaction.update(empRef, { misconductStats: stats, warningHistory: warnings, attributes: attributes });
            finalResultMsg = resultMsg;
        });
        DataManager.clearCacheKeys(['employees']);
        return finalResultMsg;
    }

    // ==========================================
    // 🟢 SETTLEMENTS
    // ==========================================
    static async getSettlements(monthStr?: string, forBackup: boolean = false): Promise<SettlementRecord[]> {
        const colRef = collection(db, 'settlements');
        let q;
        if (forBackup) {
            q = colRef;
        } else if (monthStr) {
            q = query(colRef, where('date', '>=', `${monthStr}-01`), where('date', '<=', `${monthStr}-31`), orderBy('date', 'desc'), limit(31));
        } else {
            q = query(colRef, orderBy('date', 'desc'), limit(30));
        }
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as SettlementRecord).sort((a, b) => b.date.localeCompare(a.date)); 
    }
    static async saveSettlement(record: SettlementRecord): Promise<void> { await setDoc(doc(db, 'settlements', record.id), record); }
    static async deleteSettlement(id: string): Promise<void> {
        await deleteDoc(doc(db, 'settlements', id));
        try {
            const colRef = collection(db, 'standalone_expenses');
            const q = query(colRef, where('id', '>=', `recon_fee_${id}`), where('id', '<=', `recon_fee_${id}\uf8ff`));
            const snap = await getDocs(q);
            const batch = writeBatch(db);
            snap.docs.forEach(d => {
                batch.delete(d.ref);
            });
            await batch.commit();
            console.log(`[deleteSettlement] Auto-cleaned ${snap.size} recon fee expenses for settlement ${id}`);
        } catch (err) {
            console.error('[deleteSettlement] Error auto-cleaning related expenses:', err);
        }
    }
    static async updateSettlementReconStatus(settlementId: string, reconStatus: Record<string, boolean>): Promise<void> {
        await updateDoc(doc(db, 'settlements', settlementId), { reconStatus });
    }
    static async updateExpenseInSettlement(settlementId: string, expense: ExpenseItem): Promise<void> {
        const ref = doc(db, 'settlements', settlementId);
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists()) return;
            const data = snap.data() as SettlementRecord;
            const idx = data.expenses.findIndex(e => e.id === expense.id);
            if (idx >= 0) data.expenses[idx] = expense;
            else data.expenses.push(expense);
            transaction.set(ref, data);
        });
    }

    // ==========================================
    // 🟢 财务与支出
    // ==========================================
    static async getRecurringBills(): Promise<RecurringBill[]> {
        const snap = await getDocs(collection(db, 'recurring_bills'));
        return snap.docs.map(d => d.data() as RecurringBill);
    }
    static async saveRecurringBill(bill: RecurringBill): Promise<void> { await setDoc(doc(db, 'recurring_bills', bill.id), bill); }
    static async deleteRecurringBill(id: string): Promise<void> { await deleteDoc(doc(db, 'recurring_bills', id)); }

    static async getBillPayments(forBackup: boolean = false): Promise<BillPaymentRecord[]> {
        const colRef = collection(db, 'bill_payments');
        const q = forBackup ? colRef : query(colRef, orderBy('date', 'desc'), limit(300));
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as BillPaymentRecord);
    }
    static async saveBillPayment(payment: BillPaymentRecord): Promise<void> { await setDoc(doc(db, 'bill_payments', payment.id), payment); }
    static async deleteBillPayment(id: string): Promise<void> { await deleteDoc(doc(db, 'bill_payments', id)); }

    static async getWarranties(): Promise<WarrantyRecord[]> {
        const snap = await getDocs(collection(db, 'warranties'));
        return snap.docs.map(d => d.data() as WarrantyRecord);
    }
    static async saveWarranty(record: WarrantyRecord): Promise<void> { await setDoc(doc(db, 'warranties', record.id), record); }
    static async deleteWarranty(id: string): Promise<void> { await deleteDoc(doc(db, 'warranties', id)); }
    static async saveStandaloneExpense(expense: ExpenseItem): Promise<void> { await setDoc(doc(db, 'standalone_expenses', expense.id), DataManager.removeUndefined(expense)); }

    // ==========================================
    // 🟢 进销存 与 缓存优化区
    // ==========================================
    static async getStockItemsByIds(stockIds: string[]): Promise<StockItem[]> {
        const colNames = ['stock_kitchen', 'stock_bar', 'stock_general', 'stock_fuel'] as const;
        const results: StockItem[] = [];
        const uniqueIds = Array.from(new Set(stockIds)).filter(Boolean);
        if (uniqueIds.length === 0) return [];

        await Promise.all(uniqueIds.map(async (stockId) => {
            const cacheKey = `stock_item_${stockId}`;
            const cached = DataManager.getCachedData<StockItem>(cacheKey);
            if (cached) {
                results.push(cached);
                return;
            }

            for (const col of colNames) {
                const d = await getDoc(doc(db, col, stockId));
                if (d.exists()) {
                    const item = d.data() as StockItem;
                    // Apply backward compatibility fallback
                    if (!item.baseUnit) {
                        item.baseUnit = item.unit || '';
                        item.currentQtyBase = item.currentQty ?? 0;
                        item.minLevelBase = item.minLevel ?? 0;
                        item.maxQtyBase = item.maxQty ?? 0;
                        item.costPerBaseUnit = item.cost ?? 0;
                        item.yieldPercent = item.yieldPercent ?? 100;
                        item.overheadPercent = item.overheadPercent ?? 0;
                    }
                    if (!item.displayUnit) {
                        item.displayUnit = item.baseUnit;
                    }
                    if (item.displayToBaseRatio === undefined || item.displayToBaseRatio === null || isNaN(item.displayToBaseRatio) || item.displayToBaseRatio <= 0) {
                        item.displayToBaseRatio = 1;
                    }
                    if (!item.preferredStockViewUnit) {
                        item.preferredStockViewUnit = 'BASE';
                    }
                    DataManager.setCachedData(cacheKey, item);
                    results.push(item);
                    break;
                }
            }
        }));

        return results;
    }

    static async searchStockByName(keyword: string): Promise<StockItem[]> {
        const key = `search_stock_by_name_${keyword}`;
        const cached = DataManager.getCachedData<StockItem[]>(key, 120 * 1000);
        if (cached) return cached;

        const [k, b, g, f] = await Promise.all([
            DataManager.getStock('KITCHEN'),
            DataManager.getStock('BAR'),
            DataManager.getStock('GENERAL'),
            DataManager.getStock('FUEL')
        ]);
        const all = [...k, ...b, ...g, ...f];
        
        const normKeyword = keyword.trim().toLowerCase().replace(/[\s\(\)\-\_\\\/（）［］［］【】\[\]\{\}]/g, '');
        const results = all.filter(item => {
            const name = (item.name || '').trim().toLowerCase().replace(/[\s\(\)\-\_\\\/（）［］［］【】\[\]\{\}]/g, '');
            return name.includes(normKeyword);
        });

        DataManager.setCachedData(key, results);
        return results;
    }

    static async getStock(type: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL'): Promise<StockItem[]> {
        let colName = 'stock_general';
        if (type === 'KITCHEN') colName = 'stock_kitchen';
        if (type === 'BAR') colName = 'stock_bar';
        if (type === 'FUEL') colName = 'stock_fuel';
        return DataManager.runWithCache(`stock_${colName}`, async () => {
            const snap = await getDocs(collection(db, colName));
            return snap.docs.map(d => {
                const item = d.data() as StockItem;
                // Add the id from the document reference if not already on the item
                if (!item.id) {
                    item.id = d.id;
                }
                const normalized = normalizeInventoryItem(item);
                return normalized as unknown as StockItem;
            });
        });
    }
    static async saveStockItem(type: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL', item: StockItem): Promise<void> {
        let colName = 'stock_general';
        if (type === 'KITCHEN') colName = 'stock_kitchen';
        if (type === 'BAR') colName = 'stock_bar';
        if (type === 'FUEL') colName = 'stock_fuel';
        
        // Ensure legacy fields are synced for backward compatibility
        const baseUnit = item.baseUnit || item.unit || '';
        const currentQtyBase = item.currentQtyBase ?? item.currentQty ?? 0;
        const minLevelBase = item.minLevelBase ?? item.minLevel ?? 0;
        const maxQtyBase = item.maxQtyBase ?? item.maxQty ?? 0;
        const costPerBaseUnit = item.costPerBaseUnit ?? item.cost ?? 0;
        
        const syncedItem: StockItem = {
            ...item,
            unit: baseUnit,
            currentQty: currentQtyBase,
            minLevel: minLevelBase,
            maxQty: maxQtyBase,
            cost: costPerBaseUnit,
            // Sync purchaseUnits to legacy uomOptions
            uomOptions: item.purchaseUnits ? item.purchaseUnits.map(pu => ({
                label: pu.unitName,
                value: pu.unitName,
                ratio: pu.toBaseRatio,
                price: pu.pricePerUnit
            })) : item.uomOptions
        };

        const docRef = doc(db, colName, syncedItem.id);
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(docRef);
            const existingData = snap.exists() ? snap.data() : {};
            transaction.set(docRef, { ...existingData, ...syncedItem });
        });
        DataManager.clearCacheKeys(['stock_']);
    }
    static async deleteStockItem(type: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL', id: string): Promise<void> {
        let colName = 'stock_general';
        if (type === 'KITCHEN') colName = 'stock_kitchen';
        if (type === 'BAR') colName = 'stock_bar';
        if (type === 'FUEL') colName = 'stock_fuel';
        await deleteDoc(doc(db, colName, id));
        DataManager.clearCacheKeys(['stock_']);
    }
    static async batchUpdateStock(type: 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL', items: (StockItem & { diff?: number })[]): Promise<void> {
        let colName = 'stock_general';
        if (type === 'KITCHEN') colName = 'stock_kitchen';
        if (type === 'BAR') colName = 'stock_bar';
        if (type === 'FUEL') colName = 'stock_fuel';
        await runTransaction(db, async (transaction) => {
            const reads = await Promise.all(items.map(item => transaction.get(doc(db, colName, item.id))));
            items.forEach((item, idx) => {
                const ref = doc(db, colName, item.id);
                const currentDBData = reads[idx].exists() ? reads[idx].data() : {};
                
                let finalQty = item.currentQtyBase !== undefined ? item.currentQtyBase : (item.currentQty ?? 0);
                if (item.diff !== undefined) {
                    const latestQty = typeof currentDBData.currentQtyBase === 'number' 
                        ? currentDBData.currentQtyBase 
                        : (typeof currentDBData.currentQty === 'number' ? currentDBData.currentQty : 0);
                    finalQty = latestQty + item.diff;
                }
                
                const finalQtyVal = Math.max(0, finalQty);
                const { diff, ...cleanItem } = item;
                
                const baseUnitVal = cleanItem.baseUnit || cleanItem.unit || 'pcs';
                const costVal = cleanItem.costPerBaseUnit ?? cleanItem.cost ?? 0;

                transaction.set(ref, { 
                    ...currentDBData, 
                    ...cleanItem, 
                    currentQty: finalQtyVal,
                    currentQtyBase: finalQtyVal,
                    unit: baseUnitVal,
                    baseUnit: baseUnitVal,
                    cost: costVal,
                    costPerBaseUnit: costVal
                });
            });
        });
        DataManager.clearCacheKeys(['stock_']);
    }

    static async getInventoryTasks(): Promise<InventoryTask[]> {
        return DataManager.runWithCache('inventory_tasks', async () => {
            const q = query(collection(db, 'inventory_tasks'), orderBy('createdAt', 'desc'), limit(100));
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data() as InventoryTask).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        });
    }
    static async getPendingInventoryTasks(): Promise<InventoryTask[]> {
        return DataManager.runWithCache('inventory_tasks_pending', async () => {
            const q = query(
                collection(db, 'inventory_tasks'),
                where('status', '==', 'PENDING'),
                limit(100)
            );
            const snap = await getDocs(q);
            return snap.docs
                .map(d => d.data() as InventoryTask)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }, 60 * 1000);
    }
    static async getPendingInventoryTaskCount(): Promise<number> {
        const q = query(
            collection(db, 'inventory_tasks'),
            where('status', '==', 'PENDING')
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    }
    static async saveInventoryTask(task: InventoryTask): Promise<void> {
        await setDoc(doc(db, 'inventory_tasks', task.id), task);
        DataManager.clearCacheKeys(['inventory_tasks']);
    }

    static async getTranslations(lang: string): Promise<Record<string, Record<string, string>>> {
        return DataManager.runWithCache(`translations_${lang}`, async () => {
            const snap = await getDoc(doc(db, 'translations', lang));
            if (snap.exists()) return snap.data() as Record<string, Record<string, string>>;
            return { items: {}, categories: {}, units: {}, ui: {} };
        }, 180 * 1000); // 3 minutes TTL for translation strings
    }
    static async saveTranslations(lang: string, data: Record<string, Record<string, string>>): Promise<void> {
        await setDoc(doc(db, 'translations', lang), data);
        DataManager.clearCacheKeys([`translations_${lang}`]);
    }
    static async deleteInventoryTask(id: string): Promise<void> {
        await deleteDoc(doc(db, 'inventory_tasks', id));
        DataManager.clearCacheKeys(['inventory_tasks']);
    }

    static async getInventoryLogs(limitCount: number = 50): Promise<InventoryLog[]> {
        return DataManager.runWithCache(`inventory_logs_${limitCount}`, async () => {
            const q = query(collection(db, 'inventory_logs'), orderBy('timestamp', 'desc'), limit(limitCount));
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data() as InventoryLog).sort((a,b) => b.timestamp.localeCompare(a.timestamp));
        }, 60 * 1000); // 1 minute TTL for logs
    }

    static async saveInventoryLog(log: InventoryLog): Promise<void> {
        await setDoc(doc(db, 'inventory_logs', log.id), log);
        DataManager.clearCacheKeys(['inventory_logs_']);
        try {
            if (log.items && Array.isArray(log.items)) {
                await Promise.all(log.items.map((item: any) => {
                    if (!item.stockId || item.cost == null) return Promise.resolve();
                    return this.appendPriceHistoryEntry(item.stockId, {
                        date: log.date,
                        cost: item.cost,
                        sourceLogId: log.id,
                        timestamp: log.timestamp || new Date().toISOString()
                    });
                }));
            }
        } catch (e) {
            console.warn('[PriceHistory Sync] Non-fatal:', e);
        }
    }

    // ==========================================
    // 🟢 价格历史 V3
    // ==========================================
    static async appendPriceHistoryEntry(
        stockId: string,
        entry: { date: string; cost: number; sourceLogId: string; timestamp?: string }
    ): Promise<void> {
        if (!stockId || entry.cost == null || !entry.sourceLogId) return;
        const ref = doc(db, 'stock_price_history', stockId);
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            const existing = snap.exists() 
                ? (snap.data() as StockPriceHistory)
                : { stockId, entries: [], lastEntryDate: '', lastEntryCost: 0, lastUpdated: '' };
            const newEntry: StockPriceEntry = {
                date: entry.date,
                cost: entry.cost,
                sourceLogId: entry.sourceLogId,
                timestamp: entry.timestamp || new Date().toISOString()
            };
            let entries = [...(existing.entries || [])];
            const existingIdx = entries.findIndex(e => e.sourceLogId === entry.sourceLogId);
            if (existingIdx >= 0) entries[existingIdx] = newEntry;
            else entries.push(newEntry);
            entries.sort((a, b) => a.date.localeCompare(b.date));
            if (entries.length > 2000) entries = entries.slice(-2000);
            const lastEntry = entries[entries.length - 1];
            transaction.set(ref, {
                stockId, entries,
                lastEntryDate: lastEntry.date,
                lastEntryCost: lastEntry.cost,
                lastUpdated: new Date().toISOString()
            });
        });
    }

    static async getPriceHistory(stockId: string): Promise<StockPriceHistory | null> {
        if (!stockId) return null;
        const snap = await getDoc(doc(db, 'stock_price_history', stockId));
        return snap.exists() ? (snap.data() as StockPriceHistory) : null;
    }

    static async getRecentPriceChanges(cutoffDate?: string): Promise<StockPriceHistory[]> {
        const colRef = collection(db, 'stock_price_history');
        const q = cutoffDate 
            ? query(colRef, where('lastEntryDate', '>=', cutoffDate))
            : query(colRef);
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as StockPriceHistory);
    }

    static async removePriceHistoryEntry(stockId: string, sourceLogId: string): Promise<void> {
        if (!stockId || !sourceLogId) return;
        const ref = doc(db, 'stock_price_history', stockId);
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists()) return;
            const data = snap.data() as StockPriceHistory;
            const filtered = (data.entries || []).filter(e => e.sourceLogId !== sourceLogId);
            if (filtered.length === 0) {
                transaction.delete(ref);
                return;
            }
            const lastEntry = filtered[filtered.length - 1];
            transaction.set(ref, {
                stockId: data.stockId,
                entries: filtered,
                lastEntryDate: lastEntry.date,
                lastEntryCost: lastEntry.cost,
                lastUpdated: new Date().toISOString()
            });
        });
    }

    static async removeItemFromLog(logId: string, stockId: string): Promise<void> {
        if (!logId || !stockId) throw new Error('logId 和 stockId 不能为空');
        const logRef = doc(db, 'inventory_logs', logId);
        const snap = await getDoc(logRef);
        if (!snap.exists()) throw new Error(`进货记录 ${logId} 不存在`);
        const data = snap.data();
        const items: any[] = data.items || [];
        const filtered = items.filter(i => i.stockId !== stockId);
        if (filtered.length === items.length) throw new Error(`该记录中没有找到商品 ${stockId}`);
        if (filtered.length === 0) {
            await deleteDoc(logRef);
        } else {
            await updateDoc(logRef, {
                items: filtered,
                modifiedAt: new Date().toISOString(),
                modifiedReason: `Removed item ${stockId} (price correction)`,
            });
        }
    }

    static async removeWrongPriceRecord(logId: string, stockId: string): Promise<void> {
        await this.removeItemFromLog(logId, stockId);
        await this.removePriceHistoryEntry(stockId, logId);
    }

    static async migratePriceHistoryFromLogs(
        onProgress?: (current: number, total: number, label: string) => void
    ): Promise<{ stockItems: number; totalEntries: number; logsScanned: number; errors: string[] }> {
        const errors: string[] = [];
        onProgress?.(0, 100, '正在读取全部进货记录...');
        const allLogsSnap = await getDocs(collection(db, 'inventory_logs'));
        const logs = allLogsSnap.docs.map(d => d.data() as InventoryLog);
        onProgress?.(20, 100, `已读取 ${logs.length} 条记录，正在分组...`);
        const grouped: Record<string, StockPriceEntry[]> = {};
        let totalEntries = 0;
        logs.forEach(log => {
            if (!log.items || !Array.isArray(log.items)) return;
            log.items.forEach((item: any) => {
                if (!item.stockId || item.cost == null) return;
                if (!grouped[item.stockId]) grouped[item.stockId] = [];
                grouped[item.stockId].push({
                    date: log.date, cost: item.cost,
                    sourceLogId: log.id,
                    timestamp: log.timestamp || log.date
                });
                totalEntries++;
            });
        });
        onProgress?.(40, 100, `分组完成，共 ${Object.keys(grouped).length} 个商品...`);
        const stockIds = Object.keys(grouped);
        stockIds.forEach(sid => {
            const seen = new Set<string>();
            grouped[sid] = grouped[sid]
                .filter(e => {
                    if (seen.has(e.sourceLogId)) return false;
                    seen.add(e.sourceLogId);
                    return true;
                })
                .sort((a, b) => a.date.localeCompare(b.date));
        });
        const batchSize = 400;
        let written = 0;
        for (let i = 0; i < stockIds.length; i += batchSize) {
            const chunk = stockIds.slice(i, i + batchSize);
            const batch = writeBatch(db);
            chunk.forEach(stockId => {
                const entries = grouped[stockId];
                if (entries.length === 0) return;
                const lastEntry = entries[entries.length - 1];
                batch.set(doc(db, 'stock_price_history', stockId), {
                    stockId, entries,
                    lastEntryDate: lastEntry.date,
                    lastEntryCost: lastEntry.cost,
                    lastUpdated: new Date().toISOString()
                });
            });
            try {
                await batch.commit();
                written += chunk.length;
                onProgress?.(40 + Math.floor((written / stockIds.length) * 60), 100, `已写入 ${written}/${stockIds.length} 个商品...`);
            } catch (e) {
                errors.push(`批次 ${Math.floor(i / batchSize) + 1} 失败: ${(e as Error).message}`);
            }
        }
        onProgress?.(100, 100, '完成！');
        return { stockItems: written, totalEntries, logsScanned: logs.length, errors };
    }

    // ==========================================
    // 🟢 采购与供应商
    // ==========================================
    static async getSuppliers(): Promise<Supplier[]> {
        return DataManager.runWithCache('suppliers', async () => {
            const snap = await getDocs(collection(db, 'suppliers'));
            return snap.docs.map(d => d.data() as Supplier);
        });
    }
    static async saveSupplier(supplier: Supplier): Promise<void> {
        await setDoc(doc(db, 'suppliers', supplier.id), supplier);
        DataManager.clearCacheKeys(['suppliers']);
    }
    static async deleteSupplier(id: string): Promise<void> {
        await deleteDoc(doc(db, 'suppliers', id));
        DataManager.clearCacheKeys(['suppliers']);
    }

    /**
     * 👑 一键规格化与合并大写重复供应商 (Enterprise Duplicate Merge & Normalization)
     * 同时修复: 关联的独立账单 (standalone_expenses / 应付账款) 及采购订单 (purchase_orders)
     */
    static async mergeAndCapitalizeSuppliers(
        plans: { masterId: string; duplicateIds: string[]; targetName: string }[],
        onProgress?: (step: string) => void
    ): Promise<void> {
        onProgress?.("正在加载最新供应商数据...");
        const allSuppliersSnap = await getDocs(collection(db, 'suppliers'));
        const allSuppliers = allSuppliersSnap.docs.map(d => d.data() as Supplier);
        const suppliersMap = new Map(allSuppliers.map(s => [s.id, s]));

        const nameMapping = new Map<string, string>(); // 映射旧名称 -> 目标大写名称
        const idMapping = new Map<string, string>();     // 映射旧ID -> 新Master ID
        const namesToQuery = new Set<string>();

        plans.forEach(p => {
            const master = suppliersMap.get(p.masterId);
            if (!master) return;
            
            nameMapping.set(master.name, p.targetName);
            namesToQuery.add(master.name);
            namesToQuery.add(p.targetName);

            p.duplicateIds.forEach(dupId => {
                const dup = suppliersMap.get(dupId);
                if (dup) {
                    nameMapping.set(dup.name, p.targetName);
                    namesToQuery.add(dup.name);
                }
                idMapping.set(dupId, p.masterId);
            });
        });

        onProgress?.("正在合并供应商档案并统一转换大写...");
        const supplierBatch = writeBatch(db);

        for (const p of plans) {
            const master = suppliersMap.get(p.masterId);
            if (!master) continue;

            const mergedCatalog = master.catalog ? [...master.catalog] : [];
            const mergedTags = new Set<string>(master.tags || []);
            let mergedContact = master.contact || '';
            let mergedContactPerson = master.contactPerson || '';
            let mergedEmail = master.email || '';
            let mergedAddress = master.address || '';
            let mergedBankAccount = master.bankAccount || '';
            let mergedSsm = master.ssmNumber || '';
            let mergedSst = master.sstNumber || '';
            let mergedNote = master.note || '';

            p.duplicateIds.forEach(dupId => {
                const dup = suppliersMap.get(dupId);
                if (!dup) return;

                if (dup.catalog) {
                    dup.catalog.forEach(item => {
                        const exists = mergedCatalog.some(c => 
                            c.id === item.id || 
                            c.name.trim().toUpperCase() === item.name.trim().toUpperCase()
                        );
                        if (!exists) {
                            mergedCatalog.push(item);
                        }
                    });
                }

                if (dup.tags) {
                    dup.tags.forEach(t => mergedTags.add(t));
                }

                if (!mergedContact && dup.contact) mergedContact = dup.contact;
                if (!mergedContactPerson && dup.contactPerson) mergedContactPerson = dup.contactPerson;
                if (!mergedEmail && dup.email) mergedEmail = dup.email;
                if (!mergedAddress && dup.address) mergedAddress = dup.address;
                if (!mergedBankAccount && dup.bankAccount) mergedBankAccount = dup.bankAccount;
                if (!mergedSsm && dup.ssmNumber) mergedSsm = dup.ssmNumber;
                if (!mergedSst && dup.sstNumber) mergedSst = dup.sstNumber;
                if (!mergedNote && dup.note) mergedNote = dup.note;

                // 删除被合并的多余档案
                supplierBatch.delete(doc(db, 'suppliers', dupId));
            });

            const updatedMaster: Supplier = {
                ...master,
                name: p.targetName,
                catalog: mergedCatalog,
                tags: Array.from(mergedTags),
                contact: mergedContact,
                contactPerson: mergedContactPerson,
                email: mergedEmail,
                address: mergedAddress,
                bankAccount: mergedBankAccount,
                ssmNumber: mergedSsm,
                sstNumber: mergedSst,
                note: mergedNote 
                    ? `${mergedNote}\n[系统合并大写于 ${new Date().toLocaleDateString()}]` 
                    : `[系统合并大写于 ${new Date().toLocaleDateString()}]`,
            };

            supplierBatch.set(doc(db, 'suppliers', p.masterId), updatedMaster);
        }

        await supplierBatch.commit();

        if (namesToQuery.size > 0) {
            onProgress?.("正在检索并对齐所有相关应付账款账单...");
            const expenseSnap = await getDocs(collection(db, 'standalone_expenses'));
            let expenseCount = 0;
            let expenseBatch = writeBatch(db);

            // 构建不区分字母大小写的映射缓存
            const lowerNameMapping = new Map<string, string>();
            nameMapping.forEach((val, key) => {
                lowerNameMapping.set(key.toLowerCase().trim(), val);
            });

            expenseSnap.docs.forEach(d => {
                const exp = d.data() as ExpenseItem;
                const expCompanyLower = (exp.company || '').toLowerCase().trim();
                
                // 校验是否匹配到任何需要大写及清洗的旧商户别名
                let matchedTarget: string | null = null;
                if (lowerNameMapping.has(expCompanyLower)) {
                    matchedTarget = lowerNameMapping.get(expCompanyLower)!;
                } else {
                    for (const p of plans) {
                        const targetLower = p.targetName.toLowerCase().trim();
                        if (expCompanyLower === targetLower) { matchedTarget = p.targetName; break; }
                        
                        const masterLower = (suppliersMap.get(p.masterId)?.name || '').toLowerCase().trim();
                        if (expCompanyLower === masterLower) { matchedTarget = p.targetName; break; }

                        const matchedDup = p.duplicateIds.some(dupId => {
                            const dup = suppliersMap.get(dupId);
                            return dup && (dup.name.toLowerCase().trim() === expCompanyLower);
                        });
                        if (matchedDup) { matchedTarget = p.targetName; break; }
                    }
                }

                if (matchedTarget && exp.company !== matchedTarget) {
                    expenseBatch.update(d.ref, { company: matchedTarget });
                    expenseCount++;
                    if (expenseCount % 450 === 0) {
                        expenseBatch.commit();
                        expenseBatch = writeBatch(db);
                    }
                }
            });

            if (expenseCount % 450 !== 0) {
                await expenseBatch.commit();
            }

            // 👑 级联清洗：历史日账嵌套支出 (Settlement Nested Expenses)
            onProgress?.("正在核对并统一历史日对账单嵌套支出...");
            const stlSnap = await getDocs(collection(db, 'settlements'));
            for (const d of stlSnap.docs) {
                const s = d.data();
                if (s.expenses && Array.isArray(s.expenses)) {
                    let updated = false;
                    const newExpenses = s.expenses.map((exp: any) => {
                        const expCompanyLower = (exp.company || '').toLowerCase().trim();
                        let matchedTarget: string | null = null;
                        if (lowerNameMapping.has(expCompanyLower)) {
                            matchedTarget = lowerNameMapping.get(expCompanyLower)!;
                        } else {
                            for (const p of plans) {
                                if (expCompanyLower === p.targetName.toLowerCase().trim()) { matchedTarget = p.targetName; break; }
                            }
                        }
                        if (matchedTarget && exp.company !== matchedTarget) {
                            updated = true;
                            return { ...exp, company: matchedTarget };
                        }
                        return exp;
                    });
                    
                    if (updated) {
                        await setDoc(doc(db, 'settlements', d.id), { expenses: newExpenses }, { merge: true });
                    }
                }
            }
        }

        onProgress?.("正在校正受影响的采购订单名称...");
        const poBatch = writeBatch(db);
        const poSnap = await getDocs(collection(db, 'purchase_orders'));
        let poCount = 0;

        // 统一不区分大小写的名字清单
        const allTargetLowerNames = Array.from(namesToQuery).map(n => n.toLowerCase().trim());

        poSnap.forEach(d => {
            const po = d.data() as PurchaseOrder;
            let needsUpdate = false;
            let updatedSupId = po.supplierId;
            let updatedSupName = po.supplierName;

            const currentNameLower = (po.supplierName || '').toLowerCase().trim();

            if (idMapping.has(po.supplierId)) {
                updatedSupId = idMapping.get(po.supplierId)!;
                needsUpdate = true;
            }

            // 匹配大写或旧别名名称
            let matchedTargetName: string | null = null;
            plans.forEach(p => {
                const targetLower = p.targetName.toLowerCase().trim();
                if (currentNameLower === targetLower) { matchedTargetName = p.targetName; }
                const masterLower = (suppliersMap.get(p.masterId)?.name || '').toLowerCase().trim();
                if (currentNameLower === masterLower) { matchedTargetName = p.targetName; }
                p.duplicateIds.forEach(dupId => {
                    const dup = suppliersMap.get(dupId);
                    if (dup && dup.name.toLowerCase().trim() === currentNameLower) { matchedTargetName = p.targetName; }
                });
            });

            if (matchedTargetName) {
                if (po.supplierName !== matchedTargetName) {
                    updatedSupName = matchedTargetName;
                    needsUpdate = true;
                }
            } else if (po.supplierName && po.supplierName !== po.supplierName.toUpperCase()) {
                updatedSupName = po.supplierName.toUpperCase();
                needsUpdate = true;
            }

            if (needsUpdate) {
                poBatch.update(d.ref, {
                    supplierId: updatedSupId,
                    supplierName: updatedSupName
                });
                poCount++;
            }
        });

        if (poCount > 0) {
            await poBatch.commit();
        }

        // 👑 级联清洗：付款凭单 (Payment Vouchers - PV)
        onProgress?.("正在同步已签发付款凭单 (PV) 收款人名称...");
        const pvSnap = await getDocs(collection(db, 'payment_vouchers'));
        const pvBatch = writeBatch(db);
        let pvCount = 0;

        pvSnap.docs.forEach(d => {
            const pv = d.data();
            const currentPayeeLower = (pv.payeeName || '').toLowerCase().trim();
            
            let matchedTargetId: string | null = null;
            let matchedTargetName: string | null = null;

            plans.forEach(p => {
                const targetLower = p.targetName.toLowerCase().trim();
                const isMatchId = p.duplicateIds.includes(pv.payeeId) || pv.payeeId === p.masterId;
                const isMatchName = currentPayeeLower === targetLower || 
                                     currentPayeeLower === (suppliersMap.get(p.masterId)?.name || '').toLowerCase().trim() ||
                                     p.duplicateIds.some(dupId => (suppliersMap.get(dupId)?.name || '').toLowerCase().trim() === currentPayeeLower);

                if (isMatchId || isMatchName) {
                    matchedTargetId = p.masterId;
                    matchedTargetName = p.targetName;
                }
            });

            if (matchedTargetName) {
                pvBatch.update(d.ref, {
                    payeeId: matchedTargetId || pv.payeeId,
                    payeeName: matchedTargetName
                });
                pvCount++;
            }
        });

        if (pvCount > 0) {
            await pvBatch.commit();
        }

        // 清空缓存
        DataManager.clearCacheKeys(['suppliers', 'standalone_expenses']);
        onProgress?.("同步完毕！所有供应商及关联应付账单列表、日结支出、采购单与PV已完美对账大写。");
    }

    static async getPurchaseOrders(forBackup: boolean = false): Promise<PurchaseOrder[]> {
        const colRef = collection(db, 'purchase_orders');
        const q = forBackup ? colRef : query(colRef, orderBy('date', 'desc'), limit(200));
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as PurchaseOrder);
    }
    static async getPendingPurchaseOrderCount(): Promise<number> {
        return DataManager.runWithCache('purchase_orders_pending_count', async () => {
            const pendingQuery = query(
                collection(db, 'purchase_orders'),
                where('status', '==', 'ORDERED')
            );
            const snapshot = await getCountFromServer(pendingQuery);
            return snapshot.data().count;
        });
    }
    static async savePurchaseOrder(po: PurchaseOrder): Promise<void> {
        await setDoc(doc(db, 'purchase_orders', po.id), DataManager.removeUndefined(po));
        DataManager.clearCacheKeys(['purchase_orders_pending_count']);
    }
    static async deletePurchaseOrder(id: string): Promise<void> {
        await deleteDoc(doc(db, 'purchase_orders', id));
        DataManager.clearCacheKeys(['purchase_orders_pending_count']);
    }

    // ==========================================
    // 🟢 菜单与排队
    // ==========================================
    static async getMenu(): Promise<MenuItem[]> {
        const snap = await getDocs(collection(db, 'menu'));
        return snap.docs.map(d => d.data() as MenuItem);
    }
    static async saveMenu(items: MenuItem[]): Promise<void> {
        const batch = writeBatch(db);
        items.forEach(item => { batch.set(doc(db, 'menu', item.id), item); });
        await batch.commit();
    }
    static async deleteMenuItem(id: string): Promise<void> { await deleteDoc(doc(db, 'menu', id)); }

    static async getQueueTickets(): Promise<QueueTicket[]> {
        const snap = await getDocs(collection(db, 'queue_tickets'));
        return snap.docs.map(d => d.data() as QueueTicket);
    }
    static async issueQueueTicket(input: {
        sizeCategory: QueueSize;
        pax: number;
        phone?: string;
        minimumSequence?: number;
    }): Promise<QueueTicket> {
        const prefix = input.sizeCategory === 'LARGE'
            ? 'C'
            : input.sizeCategory === 'MEDIUM'
                ? 'B'
                : 'A';
        const businessDate = getBusinessDateString();
        const counterRef = doc(db, 'queue_counters', businessDate);
        const ticketRef = doc(collection(db, 'queue_tickets'));

        return runTransaction(db, async transaction => {
            const counterSnapshot = await transaction.get(counterRef);
            const savedSequence = Number(counterSnapshot.data()?.[prefix] || 0);
            const minimumSequence = Math.max(0, Number(input.minimumSequence || 0));
            const nextSequence = Math.max(savedSequence, minimumSequence) + 1;
            const now = new Date().toISOString();

            const ticket: QueueTicket = {
                id: ticketRef.id,
                number: `${prefix}${String(nextSequence).padStart(3, '0')}`,
                sizeCategory: input.sizeCategory,
                pax: input.pax,
                status: 'WAITING',
                createdAt: now,
            };

            const normalizedPhone = input.phone?.trim();
            if (normalizedPhone) {
                ticket.phone = normalizedPhone;
            }

            transaction.set(counterRef, {
                businessDate,
                [prefix]: nextSequence,
                updatedAt: now,
            }, { merge: true });
            transaction.set(ticketRef, {
                ...ticket,
                businessDate,
                sequence: nextSequence,
            });

            return ticket;
        });
    }
    static async saveQueueTicket(ticket: QueueTicket): Promise<void> { await setDoc(doc(db, 'queue_tickets', ticket.id), ticket); }
    static async clearQueue(): Promise<void> {
        const snap = await getDocs(collection(db, 'queue_tickets'));
        const batchSize = 450;

        for (let index = 0; index < snap.docs.length; index += batchSize) {
            const batch = writeBatch(db);
            snap.docs.slice(index, index + batchSize).forEach(queueDoc => {
                batch.delete(queueDoc.ref);
            });
            await batch.commit();
        }

        await deleteDoc(doc(db, 'queue_counters', getBusinessDateString()));
    }

    // ==========================================
    // 🟢 交接日志
    // ==========================================
    static async getLogs(forBackup: boolean = false): Promise<LogEntry[]> {
        const colRef = collection(db, 'logs');
        const q = forBackup ? colRef : query(colRef, orderBy('id', 'desc'), limit(200));
        const snap = await getDocs(q);
        return snap.docs
            .map(d => normalizeOperationalLog(d.data() as LogEntry))
            .sort((a,b) => b.id.localeCompare(a.id));
    }
    static async getRecentLogs(limitCount: number = 30, beforeId?: string): Promise<LogEntry[]> {
        const safeLimit = Math.max(1, Math.min(100, Math.floor(limitCount)));
        const logsRef = collection(db, 'logs');
        const recentQuery = beforeId
            ? query(
                logsRef,
                orderBy('id', 'desc'),
                startAfter(beforeId),
                limit(safeLimit)
            )
            : query(
                logsRef,
                orderBy('id', 'desc'),
                limit(safeLimit)
            );
        const snapshot = await getDocs(recentQuery);
        return snapshot.docs
            .map(item => normalizeOperationalLog(item.data() as LogEntry))
            .sort((a, b) => b.id.localeCompare(a.id));
    }
    static async getLogsByDateRange(
        startDate: string,
        endDate: string,
        limitCount: number = 100,
    ): Promise<LogEntry[]> {
        if (!startDate || !endDate) return [];
        const safeLimit = Math.max(1, Math.min(100, Math.floor(limitCount)));
        const rangeQuery = query(
            collection(db, 'logs'),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            orderBy('date', 'desc'),
            limit(safeLimit),
        );
        const snapshot = await getDocs(rangeQuery);
        return snapshot.docs
            .map(item => normalizeOperationalLog(item.data() as LogEntry))
            .sort((a, b) => {
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;
                return (b.time || '').localeCompare(a.time || '');
            });
    }
    static async getLogById(id: string): Promise<LogEntry | null> {
        if (!id) return null;
        const snapshot = await getDoc(doc(db, 'logs', id));
        if (!snapshot.exists()) return null;
        const rawLog = snapshot.data() as LogEntry;
        return normalizeOperationalLog({
            ...rawLog,
            id: rawLog.id || snapshot.id,
        });
    }
    static async getOperationalLogCountByDate(date: string): Promise<number> {
        if (!date) return 0;
        const q = query(
            collection(db, 'logs'),
            where('date', '==', date)
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    }
    static async addLog(
        log: LogEntry,
        notificationContext?: { actor: Employee; employees: Employee[] },
    ): Promise<LogEntry> {
        if (log.misconduct) {
             const resultMsg = await this.updateEmployeeMisconduct(log.misconduct.employeeId, log.misconduct.type, log.issue, log.misconduct.fineAmount);
             log.misconduct.actionResult = resultMsg;
        }

        const normalized = normalizeOperationalLog(log);
        const notifications = notificationContext
            ? buildOperationalLogNotifications(
                { type: 'LOGBOOK_NEW', eventId: `log-new-${normalized.id}` },
                normalized,
                notificationContext.actor,
                notificationContext.employees,
                normalized.updatedAt || new Date().toISOString(),
            )
            : [];

        await runTransaction(db, async transaction => {
            transaction.set(doc(db, 'logs', normalized.id), withoutUndefined(normalized));
            notifications.forEach(notification => {
                transaction.set(
                    doc(db, 'notifications', notification.id),
                    withoutUndefined(notification),
                );
            });
        });

        return normalized;
    }
    static async deleteLog(id: string): Promise<void> { await deleteDoc(doc(db, 'logs', id)); }

    static async appendLogReply(
        logId: string,
        reply: OperationalLogReply,
        actor: Employee,
        employees: Employee[],
    ): Promise<LogEntry> {
        const logRef = doc(db, 'logs', logId);
        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(logRef);
            if (!snapshot.exists()) throw new Error('Operational log not found');

            const current = normalizeOperationalLog(snapshot.data() as LogEntry);
            if ((current.replies || []).some(item => item.id === reply.id)) {
                return current;
            }

            const updated: LogEntry = {
                ...current,
                replies: [...(current.replies || []), withoutUndefined(reply)],
                updatedAt: reply.createdAt,
            };
            const notifications = buildOperationalLogNotifications(
                { type: 'LOGBOOK_REPLY', eventId: `log-reply-${reply.id}`, reply },
                updated,
                actor,
                employees,
                reply.createdAt,
            );

            transaction.set(logRef, withoutUndefined(updated));
            notifications.forEach(notification => {
                transaction.set(
                    doc(db, 'notifications', notification.id),
                    withoutUndefined(notification),
                );
            });
            return updated;
        });
    }

    static async markLogRead(
        logId: string,
        employee: Employee,
    ): Promise<LogEntry> {
        const logRef = doc(db, 'logs', logId);
        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(logRef);
            if (!snapshot.exists()) throw new Error('Operational log not found');

            const current = normalizeOperationalLog(snapshot.data() as LogEntry);
            const existing = (current.readReceipts || []).find(
                receipt => receipt.employeeId === employee.id,
            );
            if (existing) return current;

            const receipt: OperationalLogReadReceipt = {
                employeeId: employee.id,
                employeeName: employee.name,
                readAt: new Date().toISOString(),
            };
            const updated: LogEntry = {
                ...current,
                readReceipts: [...(current.readReceipts || []), receipt],
                updatedAt: receipt.readAt,
            };
            transaction.set(logRef, withoutUndefined(updated));
            return updated;
        });
    }

    static async assignLog(
        logId: string,
        assignee: Employee | null,
        actor: Employee,
        employees: Employee[],
    ): Promise<LogEntry> {
        const logRef = doc(db, 'logs', logId);
        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(logRef);
            if (!snapshot.exists()) throw new Error('Operational log not found');

            const current = normalizeOperationalLog(snapshot.data() as LogEntry);
            const nextAssigneeId = assignee?.id || '';
            if ((current.assignedEmployeeId || '') === nextAssigneeId) return current;

            const now = new Date().toISOString();
            const updated: LogEntry = {
                ...current,
                assignedEmployeeId: assignee?.id,
                assignedEmployeeName: assignee?.name,
                assignedDepartment: assignee?.department,
                updatedAt: now,
            };

            transaction.set(logRef, withoutUndefined(updated));
            if (assignee) {
                const notifications = buildOperationalLogNotifications(
                    {
                        type: 'LOGBOOK_ASSIGNED',
                        eventId: `log-assigned-${logId}-${now}`,
                        assignedEmployeeId: assignee.id,
                    },
                    updated,
                    actor,
                    employees,
                    now,
                );
                notifications.forEach(notification => {
                    transaction.set(
                        doc(db, 'notifications', notification.id),
                        withoutUndefined(notification),
                    );
                });
            }
            return updated;
        });
    }

    static async updateLogStatus(
        logId: string,
        status: LogStatus,
        actor: Employee,
        employees: Employee[],
    ): Promise<LogEntry> {
        const logRef = doc(db, 'logs', logId);
        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(logRef);
            if (!snapshot.exists()) throw new Error('Operational log not found');

            const current = normalizeOperationalLog(snapshot.data() as LogEntry);
            if (current.status === status) return current;

            const now = new Date().toISOString();
            const updated: LogEntry = {
                ...current,
                status,
                updatedAt: now,
                resolvedAt: status === 'RESOLVED' ? now : undefined,
                resolvedById: status === 'RESOLVED' ? actor.id : undefined,
                resolvedByName: status === 'RESOLVED' ? actor.name : undefined,
            };
            const notifications = buildOperationalLogNotifications(
                {
                    type: 'LOGBOOK_STATUS',
                    eventId: `log-status-${logId}-${now}`,
                    status,
                },
                updated,
                actor,
                employees,
                now,
            );

            transaction.set(logRef, withoutUndefined(updated));
            notifications.forEach(notification => {
                transaction.set(
                    doc(db, 'notifications', notification.id),
                    withoutUndefined(notification),
                );
            });
            return updated;
        });
    }

    /** Legacy compatibility for older callers. */
    static async acknowledgeLog(id: string, name: string): Promise<void> {
        await updateDoc(doc(db, 'logs', id), {
            acknowledgedBy: name,
            acknowledgedAt: new Date().toISOString(),
        });
    }

    static subscribeNotifications(
        employeeId: string,
        onChange: (notifications: SystemNotification[]) => void,
        onError?: (error: Error) => void,
    ): () => void {
        const notificationQuery = query(
            collection(db, 'notifications'),
            where('recipientEmployeeId', '==', employeeId),
            orderBy('createdAt', 'desc'),
            limit(30),
        );

        return onSnapshot(
            notificationQuery,
            snapshot => {
                const notifications = snapshot.docs
                    .map(item => item.data() as SystemNotification);
                onChange(notifications);
            },
            error => {
                console.error('[Notifications] subscription failed:', error);
                onError?.(error);
            },
        );
    }

    static async markNotificationRead(notificationId: string): Promise<void> {
        await updateDoc(doc(db, 'notifications', notificationId), {
            readAt: new Date().toISOString(),
        });
    }

    static async markAllNotificationsRead(notificationIds: string[]): Promise<void> {
        if (notificationIds.length === 0) return;
        const now = new Date().toISOString();
        const batch = writeBatch(db);
        notificationIds.forEach(notificationId => {
            batch.update(doc(db, 'notifications', notificationId), { readAt: now });
        });
        await batch.commit();
    }

    // ==========================================
    // 🟢 考勤与排班
    // ==========================================
    static async getPayrollRecords(): Promise<PayrollRecord[]> {
        const snap = await getDocs(collection(db, 'payroll'));
        return snap.docs.map(d => d.data() as PayrollRecord);
    }
    static async savePayrollRecord(record: PayrollRecord): Promise<void> { await setDoc(doc(db, 'payroll', record.id), record); }

    static async getActiveShift(): Promise<any | null> {
        const d = await getDoc(doc(db, 'config', 'active_shift'));
        return d.exists() ? d.data() : null;
    }
    static async saveActiveShift(data: any): Promise<void> { await setDoc(doc(db, 'config', 'active_shift'), data); }
    static async clearActiveShift(): Promise<void> { await deleteDoc(doc(db, 'config', 'active_shift')); }

    static async getRosterConfig(): Promise<any | null> {
        try {
            const d = await getDoc(doc(db, 'config', 'roster'));
            return d.exists() ? d.data() : null;
        } catch (e) {
            console.error('[RosterConfig] failed to fetch:', e);
            return null;
        }
    }
    static async saveRosterConfig(config: any): Promise<void> {
        await setDoc(doc(db, 'config', 'roster'), config, { merge: true });
    }

    static async getRosterData(monthKey?: string): Promise<{
        roster: any;
        notes: any;
        monthKey?: string;
        rosterVersion?: number;
        status?: 'DRAFT' | 'PUBLISHED';
        publishedAt?: string | null;
        publishedBy?: string | null;
        lastSavedAt?: string | null;
        lastSavedBy?: string | null;
        revision?: number;
        shiftMode?: 'SINGLE' | 'MULTI';
    }> {
        if (monthKey) {
            try {
                const monthDoc = await getDoc(doc(db, 'roster_months', monthKey));
                if (monthDoc.exists()) {
                    const data = monthDoc.data();
                    return {
                        roster: data.roster || {},
                        notes: data.notes || {},
                        monthKey: data.monthKey || monthKey,
                        rosterVersion: data.rosterVersion || 1, // legacy month = version 1
                        status: data.status || 'PUBLISHED', // legacy saved data considered published
                        publishedAt: data.publishedAt || null,
                        publishedBy: data.publishedBy || null,
                        lastSavedAt: data.lastSavedAt || null,
                        lastSavedBy: data.lastSavedBy || null,
                        revision: data.revision || 1,
                        shiftMode: data.shiftMode || 'SINGLE'
                    };
                }
                const legacyRoster = await getDoc(doc(db, 'roster', 'main'));
                const legacyNotes = await getDoc(doc(db, 'roster', 'notes'));
                if (legacyRoster.exists()) {
                    const allRoster = legacyRoster.data() || {};
                    const allNotes = legacyNotes.exists() ? legacyNotes.data() || {} : {};
                    const monthRoster: Record<string, any> = {};
                    const monthNotes: Record<string, any> = {};
                    Object.keys(allRoster).forEach(dateStr => { if (dateStr.startsWith(monthKey)) monthRoster[dateStr] = allRoster[dateStr]; });
                    Object.keys(allNotes).forEach(key => { if (key.startsWith(monthKey)) monthNotes[key] = allNotes[key]; });
                    if (Object.keys(monthRoster).length > 0) {
                        const initData = {
                            roster: monthRoster,
                            notes: monthNotes,
                            monthKey,
                            rosterVersion: 1, // mark as legacy migrated
                            status: 'PUBLISHED' as const,
                            lastSavedAt: new Date().toISOString(),
                            revision: 1,
                            shiftMode: 'SINGLE' as const
                        };
                        await setDoc(doc(db, 'roster_months', monthKey), initData);
                        return initData;
                    }
                }
                return {
                    roster: {},
                    notes: {},
                    monthKey,
                    rosterVersion: 2, // new months default to version 2
                    status: 'DRAFT',
                    publishedAt: null,
                    publishedBy: null,
                    lastSavedAt: null,
                    lastSavedBy: null,
                    revision: 0,
                    shiftMode: 'SINGLE'
                };
            } catch (error) {
                console.error(`[Roster] Failed to load month ${monthKey}:`, error);
                return { roster: {}, notes: {}, monthKey, rosterVersion: 2, status: 'DRAFT', revision: 0, shiftMode: 'SINGLE' };
            }
        }
        const r = await getDoc(doc(db, 'roster', 'main'));
        const n = await getDoc(doc(db, 'roster', 'notes'));
        return { roster: r.exists() ? r.data() : {}, notes: n.exists() ? n.data() : {} };
    }

    static async saveRosterData(
        roster: any,
        notes: any,
        monthKey?: string,
        meta?: {
            status?: 'DRAFT' | 'PUBLISHED';
            publishedAt?: string | null;
            publishedBy?: string | null;
            lastSavedBy?: string | null;
            rosterVersion?: number;
            shiftMode?: 'SINGLE' | 'MULTI';
        },
        expectedRevision?: number
    ): Promise<any> {
        if (monthKey) {
            const monthRoster: Record<string, any> = {};
            const monthNotes: Record<string, any> = {};
            Object.keys(roster).forEach(dateStr => { if (dateStr.startsWith(monthKey)) monthRoster[dateStr] = roster[dateStr]; });
            Object.keys(notes).forEach(key => { if (key.startsWith(monthKey)) monthNotes[key] = notes[key]; });
            const monthRef = doc(db, 'roster_months', monthKey);
            
            const result = await runTransaction(db, async (transaction) => {
                const current = await transaction.get(monthRef);
                const currentData = current.exists() ? current.data() : {};
                
                // Concurrency clash checking
                if (expectedRevision !== undefined && currentData.revision !== undefined && currentData.revision !== expectedRevision) {
                    throw new Error('CONCURRENCY_CONFLICT');
                }
                
                const nextRevision = (currentData.revision || 0) + 1;
                const newStatus = meta?.status ?? currentData.status ?? 'DRAFT';
                
                const finalDoc = {
                    monthKey,
                    roster: { ...(currentData.roster || {}), ...monthRoster },
                    notes: { ...(currentData.notes || {}), ...monthNotes },
                    rosterVersion: meta?.rosterVersion ?? currentData.rosterVersion ?? 2,
                    status: newStatus,
                    publishedAt: meta?.publishedAt !== undefined ? meta.publishedAt : (currentData.publishedAt ?? null),
                    publishedBy: meta?.publishedBy !== undefined ? meta.publishedBy : (currentData.publishedBy ?? null),
                    lastSavedAt: new Date().toISOString(),
                    lastSavedBy: meta?.lastSavedBy ?? currentData.lastSavedBy ?? null,
                    revision: nextRevision,
                    shiftMode: meta?.shiftMode ?? currentData.shiftMode ?? 'SINGLE'
                };
                
                transaction.set(monthRef, finalDoc);
                return finalDoc;
            });

            // If the status is PUBLISHED, we sync it to the legacy global documents (so other dashboards see it)
            if (result.status === 'PUBLISHED') {
                try {
                    await setDoc(doc(db, 'roster', 'main'), roster, { merge: true });
                    await setDoc(doc(db, 'roster', 'notes'), notes, { merge: true });
                } catch (e) {
                    console.warn('[Roster] Legacy sync failed:', e);
                }
            }
            return result;
        } else {
            await setDoc(doc(db, 'roster', 'main'), roster, { merge: true });
            await setDoc(doc(db, 'roster', 'notes'), notes, { merge: true });
            return { roster, notes };
        }
    }

    static async getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
        const q = query(collection(db, 'attendance'), where('date', '==', date));
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as AttendanceRecord);
    }
    static async getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<AttendanceRecord | null> {
        if (!employeeId || !date) return null;
        const q = query(
            collection(db, 'attendance'),
            where('employeeId', '==', employeeId),
            where('date', '==', date),
            limit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;

        const attendance = snap.docs[0].data() as AttendanceRecord;
        return {
            ...attendance,
            id: attendance.id || snap.docs[0].id,
        };
    }
    static async getAttendanceByMonth(month: string): Promise<AttendanceRecord[]> {
        const q = query(collection(db, 'attendance'), where('date', '>=', `${month}-01`), where('date', '<=', `${month}-31`));
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as AttendanceRecord);
    }
    static async saveAttendance(record: AttendanceRecord): Promise<void> { await setDoc(doc(db, 'attendance', record.id), record); }
    static async deleteAttendance(id: string): Promise<void> { await deleteDoc(doc(db, 'attendance', id)); }

    // ==========================================
    // 🟢 门店配置与资金
    // ==========================================
    static async getConfig(): Promise<StoreConfig | null> {
        const d = await getDoc(doc(db, 'config', 'store'));
        return d.exists() ? d.data() as StoreConfig : null;
    }
    static async saveConfig(config: StoreConfig): Promise<void> { await setDoc(doc(db, 'config', 'store'), config); }
    
    static async getAttendanceSettings(): Promise<AttendanceShiftSettings | null> {
        const d = await getDoc(doc(db, 'config', 'attendance_settings'));
        return d.exists() ? d.data() as AttendanceShiftSettings : null;
    }
    static async saveAttendanceSettings(settings: AttendanceShiftSettings): Promise<void> { 
        await setDoc(doc(db, 'config', 'attendance_settings'), settings); 
    }
    
    static async getRoleConfig(): Promise<{ guides?: Record<string, RoleGuide>, sops?: Record<string, any> } | null> {
        const d = await getDoc(doc(db, 'config', 'roles'));
        return d.exists() ? d.data() : null;
    }
    static async saveRoleConfig(guides: Record<string, RoleGuide>, sops: Record<string, any>): Promise<void> { await setDoc(doc(db, 'config', 'roles'), { guides, sops }); }

    static async getSOPProgress(date: string, empId: string): Promise<any[]> {
        const d = await getDoc(doc(db, 'sop_progress', `${date}_${empId}`));
        return d.exists() ? d.data().items : null;
    }
    static async saveSOPProgress(date: string, empId: string, items: any[]): Promise<void> { await setDoc(doc(db, 'sop_progress', `${date}_${empId}`), { items }); }

    static async getTreasuryConfig(): Promise<TreasuryConfig | null> {
        const d = await getDoc(doc(db, 'config', 'treasury'));
        return d.exists() ? d.data() as TreasuryConfig : null;
    }
    static async saveTreasuryConfig(config: TreasuryConfig): Promise<void> { await setDoc(doc(db, 'config', 'treasury'), config); }
    
    static async getFundTransfers(forBackup: boolean = false): Promise<FundTransfer[]> {
        const colRef = collection(db, 'fund_transfers');
        const q = forBackup ? colRef : query(colRef, orderBy('date', 'desc'), limit(300));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data() as FundTransfer).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    static async saveFundTransfer(transfer: FundTransfer): Promise<void> { await setDoc(doc(db, 'fund_transfers', transfer.id), transfer); }
    static async deleteFundTransfer(id: string): Promise<void> { await deleteDoc(doc(db, 'fund_transfers', id)); }

    // ==========================================
    // 🟢 任务打卡
    // ==========================================
    static async getTaskCompletions(date: string): Promise<TaskCompletion[]> {
        try {
            const q = query(collection(db, 'task_completions'), where('date', '==', date));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data() as TaskCompletion);
        } catch (error) {
            console.error("Error fetching task completions for date:", error);
            return [];
        }
    }
    static async getTaskCompletionsByRange(startDate: string, endDate: string): Promise<TaskCompletion[]> {
        try {
            const q = query(collection(db, 'task_completions'),
                where('date', '>=', startDate), where('date', '<=', endDate),
                orderBy('date', 'desc'), limit(100));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data() as TaskCompletion);
        } catch (error) {
            console.error("Error fetching task completions by range:", error);
            return [];
        }
    }
    static async saveTaskCompletion(completion: TaskCompletion): Promise<void> {
        try {
            const docId = completion.id || `${completion.date}_GENERAL`; 
            const finalData = { ...completion, id: docId, updatedAt: new Date().toISOString() };
            const ref = doc(db, 'task_completions', docId);
            await setDoc(ref, finalData, { merge: true });
        } catch (error) {
            console.error("Error saving task completion:", error);
            throw error;
        }
    }

    // ==========================================
    // 🟢 战略规划
    // ==========================================
    static async getProposals(): Promise<Proposal[]> {
        const snap = await getDocs(collection(db, 'strategy_proposals'));
        return snap.docs.map(d => d.data() as Proposal).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    static async saveProposal(proposal: Proposal): Promise<void> { await setDoc(doc(db, 'strategy_proposals', proposal.id), proposal); }
    static async deleteProposal(id: string): Promise<void> { await deleteDoc(doc(db, 'strategy_proposals', id)); }

    static async getOKRs(): Promise<OKR[]> {
        const snap = await getDocs(collection(db, 'strategy_okrs'));
        return snap.docs.map(d => d.data() as OKR);
    }
    static async saveOKR(okr: OKR): Promise<void> { await setDoc(doc(db, 'strategy_okrs', okr.id), okr); }
    static async deleteOKR(id: string): Promise<void> { await deleteDoc(doc(db, 'strategy_okrs', id)); }

    static async getCampaigns(): Promise<MarketingCampaign[]> {
        const snap = await getDocs(collection(db, 'strategy_campaigns'));
        return snap.docs.map(d => d.data() as MarketingCampaign).sort((a, b) => b.startDate.localeCompare(a.startDate));
    }
    static async saveCampaign(campaign: MarketingCampaign): Promise<void> { await setDoc(doc(db, 'strategy_campaigns', campaign.id), campaign); }
    static async deleteCampaign(id: string): Promise<void> { await deleteDoc(doc(db, 'strategy_campaigns', id)); }

    static async getEvents(): Promise<StoreEvent[]> {
        const snap = await getDocs(collection(db, 'strategy_events'));
        return snap.docs.map(d => d.data() as StoreEvent).sort((a, b) => a.date.localeCompare(b.date));
    }
    static async saveEvent(event: StoreEvent): Promise<void> { await setDoc(doc(db, 'strategy_events', event.id), event); }
    static async deleteEvent(id: string): Promise<void> { await deleteDoc(doc(db, 'strategy_events', id)); }

    // ==========================================
    // 🟢 Assessment V2
    // ==========================================
    // 🟢 Boss Ratings Collection V2 (Data Isolation)
    static async getBossAssessmentRating(employeeId: string, quarter: string, bossId: string): Promise<any | null> {
        try {
            const docId = `${employeeId}_${quarter}_${bossId}`;
            const d = await getDoc(doc(db, 'assessment_boss_ratings', docId));
            return d.exists() ? d.data() : null;
        } catch (e) {
            console.error('getBossAssessmentRating failed:', e);
            return null;
        }
    }

    static async saveBossAssessmentRating(employeeId: string, quarter: string, bossId: string, rating: any): Promise<void> {
        try {
            const docId = `${employeeId}_${quarter}_${bossId}`;
            const rawRecord = { 
                ...rating, 
                id: docId, 
                employeeId, 
                quarter, 
                ownerId: bossId, // critical for security rules
                updatedAt: new Date().toISOString() 
            };
            const finalRecord = DataManager.removeUndefined(rawRecord);
            await setDoc(doc(db, 'assessment_boss_ratings', docId), finalRecord);
        } catch (e) {
            console.error('saveBossAssessmentRating failed:', e);
            throw e;
        }
    }

    static async getAllBossAssessmentRatings(employeeId: string, quarter: string): Promise<any[]> {
        try {
            const q = query(
                collection(db, 'assessment_boss_ratings'), 
                where('employeeId', '==', employeeId),
                where('quarter', '==', quarter)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.error('getAllBossAssessmentRatings failed:', e);
            return [];
        }
    }

    static async getBossRatingsForOwner(bossId: string, quarter: string): Promise<any[]> {
        try {
            const q = query(
                collection(db, 'assessment_boss_ratings'),
                where('ownerId', '==', bossId),
                where('quarter', '==', quarter)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.error('getBossRatingsForOwner failed:', e);
            return [];
        }
    }

    static async getAssessmentRecord(employeeId: string, quarter: string): Promise<any | null> {
        try {
            const docId = `${employeeId}_${quarter}`;
            const d = await getDoc(doc(db, 'assessment_records', docId));
            return d.exists() ? d.data() : null;
        } catch (e) {
            console.error('getAssessmentRecord failed:', e);
            return null;
        }
    }
    static async getAssessmentRecordsByQuarter(quarter: string): Promise<any[]> {
        try {
            const q = query(collection(db, 'assessment_records'), where('quarter', '==', quarter));
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.error('getAssessmentRecordsByQuarter failed:', e);
            return [];
        }
    }
    static async getAssessmentRecordsByEmployee(employeeId: string): Promise<any[]> {
        try {
            const q = query(collection(db, 'assessment_records'), where('employeeId', '==', employeeId));
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data()).sort((a: any, b: any) => (b.quarter || '').localeCompare(a.quarter || ''));
        } catch (e) {
            console.error('getAssessmentRecordsByEmployee failed:', e);
            return [];
        }
    }
    static removeUndefined(obj: any): any {
        if (obj === null || obj === undefined) {
            return null;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => DataManager.removeUndefined(item));
        }
        if (typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const val = obj[key];
                    if (val !== undefined) {
                        newObj[key] = DataManager.removeUndefined(val);
                    }
                }
            }
            return newObj;
        }
        return obj;
    }
    static async saveAssessmentRecord(record: any): Promise<void> {
        try {
            const docId = `${record.employeeId}_${record.quarter}`;
            const rawRecord = { ...record, id: docId, updatedAt: new Date().toISOString() };
            const finalRecord = DataManager.removeUndefined(rawRecord);
            await setDoc(doc(db, 'assessment_records', docId), finalRecord);
        } catch (e) {
            console.error('saveAssessmentRecord failed:', e);
            throw e;
        }
    }
    static async deleteAssessmentRecord(employeeId: string, quarter: string): Promise<void> {
        const docId = `${employeeId}_${quarter}`;
        await deleteDoc(doc(db, 'assessment_records', docId));
    }

    // ==========================================
    // 🟢 备份与恢复
    // ==========================================
    static async syncLocalToCloud(data: any): Promise<void> {
        if(data && Array.isArray(data)) {
            const batch = writeBatch(db);
            data.forEach((emp: Employee) => {
                batch.set(doc(db, 'employees', emp.id), emp);
            });
            await batch.commit();
        }
    }
    static async resetToDefaults(type: string): Promise<boolean> {
        let col = '';
        if (type === 'INVENTORY') col = 'stock_kitchen'; 
        if (type === 'SUPPLIERS') col = 'suppliers';
        if (col) {
            const snap = await getDocs(collection(db, col));
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            return true;
        }
        return false;
    }
    static async cleanupOldBackups(): Promise<void> {
        try {
            const snap = await getDocs(collection(db, 'system_backups'));
            const backups = snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemBackup));
            backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            if (backups.length > 7) {
                const toDelete = backups.slice(7);
                const batch = writeBatch(db);
                toDelete.forEach(bk => { if (bk.id) batch.delete(doc(db, 'system_backups', bk.id)); });
                await batch.commit();
                console.log(`🧹 Cleaned up ${toDelete.length} old backups.`);
            }
        } catch (e) { console.error("Cleanup Failed:", e); }
    }

    static async getAvailableBackups(): Promise<SystemBackup[]> {
        const snap = await getDocs(collection(db, 'system_backups'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemBackup)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    static async exportSystemData(): Promise<SystemBackup> {
        const [
            employees, settlements, recurringBills, billPayments, stockKitchen, stockBar, stockGeneral, stockFuel,
            suppliers, purchaseOrders, menu, queue, logs, payroll, attendance, roster, config,
            treasuryConfig, fundTransfers, warranties, standaloneExpenses, proposals, okrs, campaigns, events,
            taskCompletions, assessmentRecords,
            stockPriceHistory,
            paymentVouchers
        ] = await Promise.all([
            this.getEmployees(), 
            this.getSettlements(undefined, true),
            this.getRecurringBills(), 
            this.getBillPayments(true),
            this.getStock('KITCHEN'), this.getStock('BAR'), this.getStock('GENERAL'), this.getStock('FUEL'),
            this.getSuppliers(), 
            this.getPurchaseOrders(true),
            this.getMenu(), this.getQueueTickets(),
            this.getLogs(true),
            this.getPayrollRecords(), 
            getDocs(collection(db, 'attendance')).then(s => s.docs.map(d => d.data() as AttendanceRecord)),
            this.getRosterData(), this.getConfig(), this.getTreasuryConfig(), 
            this.getFundTransfers(true),
            this.getWarranties(), 
            getDocs(collection(db, 'standalone_expenses')).then(s => s.docs.map(d => d.data() as ExpenseItem)),
            this.getProposals(), this.getOKRs(), this.getCampaigns(), this.getEvents(),
            getDocs(collection(db, 'task_completions')).then(s => s.docs.map(d => d.data() as TaskCompletion)),
            getDocs(collection(db, 'assessment_records')).then(s => s.docs.map(d => d.data())),
            getDocs(collection(db, 'stock_price_history')).then(s => s.docs.map(d => d.data() as StockPriceHistory)),
            getDocs(collection(db, 'payment_vouchers')).then(s => s.docs.map(d => d.data() as PaymentVoucher))
        ]);

        return {
            version: APP_VERSION, timestamp: new Date().toISOString(),
            data: {
                employees, settlements, recurringBills, billPayments, stockKitchen, stockBar, stockGeneral, stockFuel,
                suppliers, purchaseOrders, menu, queue, logs, payroll, attendance, roster, config,
                treasuryConfig: treasuryConfig || undefined, fundTransfers: fundTransfers || undefined, warranties: warranties || undefined,
                standaloneExpenses: standaloneExpenses || [], strategy: { proposals, okrs, campaigns, events },
                taskCompletions: taskCompletions || [],
                assessmentRecords: assessmentRecords || [],
                stockPriceHistory: stockPriceHistory || [],
                paymentVouchers: paymentVouchers || []
            } as any
        };
    }

    static async restoreSystem(backup: SystemBackup): Promise<void> {
        const data: any = backup.data;
        if (!data) throw new Error("Invalid Backup Data");

        const clearCol = async (path: string) => {
            const snap = await getDocs(collection(db, path));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        };

        const restoreCol = async (path: string, items: any[]) => {
            if (!items || items.length === 0) return;
            const chunks = [];
            for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(item => { 
                    const docId = item.id || item.stockId || item.pvNumber;
                    if(docId) batch.set(doc(db, path, docId), item); 
                });
                await batch.commit();
            }
        };

        await Promise.all([
            clearCol('employees'), clearCol('settlements'), clearCol('recurring_bills'), clearCol('bill_payments'), clearCol('stock_kitchen'), clearCol('stock_bar'),
            clearCol('stock_general'), clearCol('stock_fuel'), clearCol('suppliers'), clearCol('purchase_orders'), clearCol('menu'), clearCol('queue_tickets'),
            clearCol('logs'), clearCol('payroll'), clearCol('attendance'), clearCol('fund_transfers'), clearCol('standalone_expenses'), clearCol('warranties'),
            clearCol('strategy_proposals'), clearCol('strategy_okrs'), clearCol('strategy_campaigns'), clearCol('strategy_events'),
            clearCol('task_completions'),
            clearCol('assessment_records'),
            clearCol('stock_price_history'),
            clearCol('payment_vouchers')
        ]);

        await Promise.all([
            restoreCol('employees', data.employees), restoreCol('settlements', data.settlements), restoreCol('recurring_bills', data.recurringBills), restoreCol('bill_payments', data.billPayments),
            restoreCol('stock_kitchen', data.stockKitchen), restoreCol('stock_bar', data.stockBar), restoreCol('stock_general', data.stockGeneral), restoreCol('stock_fuel', data.stockFuel || []),
            restoreCol('suppliers', data.suppliers), restoreCol('purchase_orders', data.purchaseOrders), restoreCol('menu', data.menu), restoreCol('queue_tickets', data.queue),
            restoreCol('logs', data.logs), restoreCol('payroll', data.payroll), restoreCol('attendance', data.attendance),
            setDoc(doc(db, 'roster', 'main'), data.roster?.roster || {}), setDoc(doc(db, 'roster', 'notes'), data.roster?.notes || {}),
            (async () => {
                const rosterAll = data.roster?.roster || {};
                const notesAll = data.roster?.notes || {};
                const buckets: Record<string, { roster: any, notes: any }> = {};
                Object.keys(rosterAll).forEach(d => { const mk = d.substring(0,7); if(!buckets[mk]) buckets[mk]={roster:{},notes:{}}; buckets[mk].roster[d]=rosterAll[d]; });
                Object.keys(notesAll).forEach(k => { const mk = k.substring(0,7); if(!buckets[mk]) buckets[mk]={roster:{},notes:{}}; buckets[mk].notes[k]=notesAll[k]; });
                await Promise.all(Object.entries(buckets).map(([mk, bd]) => setDoc(doc(db, 'roster_months', mk), { roster: bd.roster, notes: bd.notes, migratedAt: new Date().toISOString() })));
            })(),
            setDoc(doc(db, 'config', 'store'), data.config || {}),
            data.treasuryConfig ? setDoc(doc(db, 'config', 'treasury'), data.treasuryConfig) : Promise.resolve(),
            restoreCol('fund_transfers', data.fundTransfers || []), restoreCol('standalone_expenses', data.standaloneExpenses || []), restoreCol('warranties', data.warranties || []),
            data.strategy ? Promise.all([ restoreCol('strategy_proposals', data.strategy.proposals || []), restoreCol('strategy_okrs', data.strategy.okrs || []), restoreCol('strategy_campaigns', data.strategy.campaigns || []), restoreCol('strategy_events', data.strategy.events || []) ]) : Promise.resolve(),
            restoreCol('task_completions', data.taskCompletions || []),
            restoreCol('assessment_records', data.assessmentRecords || []),
            restoreCol('stock_price_history', data.stockPriceHistory || []),
            restoreCol('payment_vouchers', data.paymentVouchers || [])
        ]);
    }

    // ==========================================
    // 👑 Payment Voucher (付款凭单)
    // ==========================================

    static async generatePVNumber(dateSource?: Date | string | null): Promise<string> {
        let dateObj = new Date();
        if (dateSource) {
            dateObj = typeof dateSource === 'string' ? new Date(dateSource) : dateSource;
            if (isNaN(dateObj.getTime())) {
                dateObj = new Date();
            }
        }
        const monthKey = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        const counterRef = doc(db, 'config', 'pv_counter');
        const seq = await runTransaction(db, async (tx) => {
            const snap = await tx.get(counterRef);
            const data = snap.exists() ? (snap.data() as Record<string, number>) : {};
            const next = (data[monthKey] || 0) + 1;
            tx.set(counterRef, { [monthKey]: next }, { merge: true });
            return next;
        });
        return `PV${monthKey}-${String(seq).padStart(4, '0')}`;
    }

    static async generateBackdatePVNumber(monthKey: string): Promise<string> {
        if (!/^\d{6}$/.test(monthKey)) throw new Error(`Invalid monthKey: ${monthKey}`);
        const counterRef = doc(db, 'config', 'pvb_counter');
        const seq = await runTransaction(db, async (tx) => {
            const snap = await tx.get(counterRef);
            const data = snap.exists() ? (snap.data() as Record<string, number>) : {};
            const next = (data[monthKey] || 0) + 1;
            tx.set(counterRef, { [monthKey]: next }, { merge: true });
            return next;
        });
        return `PVB${monthKey}-${String(seq).padStart(4, '0')}`;
    }

    static async savePaymentVoucher(pv: PaymentVoucher): Promise<void> {
        await setDoc(doc(db, 'payment_vouchers', pv.pvNumber), pv);
    }

    static async getPaymentVouchersForExpenses(expenseIds: string[]): Promise<PaymentVoucher[]> {
        if (!expenseIds || expenseIds.length === 0) return [];
        const chunks: string[][] = [];
        for (let i = 0; i < expenseIds.length; i += 10) {
            chunks.push(expenseIds.slice(i, i + 10));
        }
        const results: PaymentVoucher[] = [];
        for (const chunk of chunks) {
            const q = query(
                collection(db, 'payment_vouchers'),
                where('relatedExpenseIds', 'array-contains-any', chunk)
            );
            const snap = await getDocs(q);
            snap.forEach(d => {
                results.push(d.data() as PaymentVoucher);
            });
        }
        const seen = new Set<string>();
        return results.filter(pv => {
            if (seen.has(pv.pvNumber)) return false;
            seen.add(pv.pvNumber);
            return true;
        });
    }

    static async getPaymentVouchers(opts?: {
        payeeName?: string;
        max?: number;
    }): Promise<PaymentVoucher[]> {
        const max = opts?.max ?? 100;
        let q;
        if (opts?.payeeName) {
            q = query(collection(db, 'payment_vouchers'),
                where('payeeName', '==', opts.payeeName),
                orderBy('date', 'desc'), limit(max));
        } else {
            q = query(collection(db, 'payment_vouchers'), orderBy('date', 'desc'), limit(max));
        }
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as PaymentVoucher);
    }

    static async getPaymentVoucher(pvNumber: string): Promise<PaymentVoucher | null> {
        const snap = await getDoc(doc(db, 'payment_vouchers', pvNumber));
        return snap.exists() ? (snap.data() as PaymentVoucher) : null;
    }

    static async voidPaymentVoucher(pvNumber: string, reason: string): Promise<void> {
        const ref = doc(db, 'payment_vouchers', pvNumber);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new Error(`PV ${pvNumber} not found`);
            tx.update(ref, {
                status: 'VOID',
                voidedAt: new Date().toISOString(),
                voidReason: reason,
            });
        });
    }

    static async voidPaymentVouchersByExpenseId(expenseId: string, reason: string = '账单已撤销或删除 (Bill Reverted/Deleted)'): Promise<void> {
        const q = query(collection(db, 'payment_vouchers'),
            where('relatedExpenseIds', 'array-contains', expenseId),
            where('status', '!=', 'VOID'));
        const snap = await getDocs(q);
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach(d => {
            batch.update(d.ref, {
                status: 'VOID',
                voidedAt: new Date().toISOString(),
                voidReason: reason
            });
        });
        await batch.commit();
    }

    static async getBillsForBackdate(startDate: string, endDate: string): Promise<ExpenseItem[]> {
        const qBills = query(collection(db, 'standalone_expenses'),
            where('paymentStatus', '==', 'PAID'),
            where('time', '>=', startDate),
            where('time', '<=', endDate + 'T23:59:59'),
            orderBy('time', 'desc'),
            limit(8000));
        const billsSnap = await getDocs(qBills);
        const bills = billsSnap.docs.map(d => d.data() as ExpenseItem);
        if (bills.length === 0) return [];

        const qPV = query(collection(db, 'payment_vouchers'),
            where('date', '>=', startDate),
            where('date', '<=', endDate + 'T23:59:59'));
        const pvSnap = await getDocs(qPV);
        const usedExpenseIds = new Set<string>();
        pvSnap.forEach(d => {
            const pv = d.data() as PaymentVoucher;
            if (pv.status === 'VOID') return;
            (pv.relatedExpenseIds || []).forEach(id => usedExpenseIds.add(id));
        });

        return bills.filter(b => {
            if (usedExpenseIds.has(b.id)) return false;
            const isSystemFeeBill = b.id.startsWith('recon_fee_') || ['BANK_FEE', 'MARKETING_FEE', 'PLATFORM_FEE_SHOPEE', 'PLATFORM_FEE_OTHER'].includes(b.category);
            return !isSystemFeeBill;
        });
    }
    // ============================================================
// 把这个方法【贴进】 utils/dataManager.ts 的 DataManager class
// 放在 getBillsForBackdate 下面就行
// ============================================================

    /**
     * 👑 v3: 根据账单 ID 查找最新的关联 PV (排除作废的)
     * 用于 AP 卡片上「下载 PV」按钮 — 点击时才查询，省 Firestore 读取
     */
    static async findPVByExpenseId(expenseId: string): Promise<PaymentVoucher | null> {
        const q = query(
            collection(db, 'payment_vouchers'),
            where('relatedExpenseIds', 'array-contains', expenseId),
            limit(10)
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;
        const pvs = snap.docs
            .map(d => d.data() as PaymentVoucher)
            .filter(pv => pv.status !== 'VOID')
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // 取最新的
        return pvs[0] || null;
    }

    static async deletePaymentVoucher(pvNumber: string): Promise<void> {
        await deleteDoc(doc(db, 'payment_vouchers', pvNumber));
    }

    static async getPVCounterDocument(): Promise<Record<string, number>> {
        const snap = await getDoc(doc(db, 'config', 'pv_counter'));
        return snap.exists() ? (snap.data() as Record<string, number>) : {};
    }

    static async savePVCounterDocument(data: Record<string, number>): Promise<void> {
        await setDoc(doc(db, 'config', 'pv_counter'), data);
    }

    // ==========================================
    // 👑 自制凭单 (Self-Issued Voucher)
    // ==========================================
    static async getSelfIssuedVouchers(): Promise<SelfIssuedVoucher[]> {
        try {
            const snap = await getDocs(collection(db, 'self_issued_vouchers'));
            return snap.docs.map(d => d.data() as SelfIssuedVoucher);
        } catch (e) {
            console.warn("Firebase not active; reading vouchers from localstorage fallback.", e);
            const local = localStorage.getItem('klk_self_issued_vouchers');
            return local ? JSON.parse(local) : [];
        }
    }

    static async saveSelfIssuedVoucher(voucher: SelfIssuedVoucher): Promise<void> {
        try {
            await setDoc(doc(db, 'self_issued_vouchers', voucher.id), voucher);
        } catch (e) {
            console.warn("Firebase not active; storing voucher in localstorage fallback.", e);
        }
        // Sync to localStorage
        const local = localStorage.getItem('klk_self_issued_vouchers');
        const list: SelfIssuedVoucher[] = local ? JSON.parse(local) : [];
        const idx = list.findIndex(v => v.id === voucher.id);
        if (idx >= 0) {
            list[idx] = voucher;
        } else {
            list.push(voucher);
        }
        localStorage.setItem('klk_self_issued_vouchers', JSON.stringify(list));
    }

    static async deleteSelfIssuedVoucher(id: string): Promise<void> {
        try {
            await deleteDoc(doc(db, 'self_issued_vouchers', id));
        } catch (e) {
            console.warn("Firebase not active or delete error; deleting from local fallback.", e);
        }
        const local = localStorage.getItem('klk_self_issued_vouchers');
        if (local) {
            const list: SelfIssuedVoucher[] = JSON.parse(local);
            const filtered = list.filter(v => v.id !== id);
            localStorage.setItem('klk_self_issued_vouchers', JSON.stringify(filtered));
        }
    }
}

// 👑 员工排班与考勤时间/迟到早退判定规则配置
export interface PenaltyTier {
    id: string;
    lateMinutes: number;
    deductionType: 'AMOUNT' | 'HALF_DAY' | 'FULL_DAY';
    deductionAmount: number; // RM
}

export interface AttendanceShiftSettings {
    weekdayCheckIn: string;   // e.g. "15:00"
    weekdayCheckOut: string;  // e.g. "02:00"
    weekendCheckIn: string;   // e.g. "11:00"
    weekendCheckOut: string;  // e.g. "02:00"
    
    // 中途休息设置 (周一至周五)
    enableWeekdayBreak?: boolean;
    weekdayBreakStart?: string;
    weekdayBreakEnd?: string;
    
    // 中途休息设置 (周六至周日)
    enableWeekendBreak?: boolean;
    weekendBreakStart?: string;
    weekendBreakEnd?: string;

    // 班次 2 人群的设置
    weekdayCheckIn2?: string;   // e.g. "09:00"
    weekdayCheckOut2?: string;  // e.g. "18:00"
    weekendCheckIn2?: string;   // e.g. "09:00"
    weekendCheckOut2?: string;  // e.g. "18:00"

    enableWeekdayBreak2?: boolean;
    weekdayBreakStart2?: string;
    weekdayBreakEnd2?: string;
    enableWeekendBreak2?: boolean;
    weekendBreakStart2?: string;
    weekendBreakEnd2?: string;

    hasSpecialPeriod: boolean;
    specialStartDate?: string; // e.g. "2026-07-01"
    specialEndDate?: string;   // e.g. "2026-07-15"
    specialCheckIn?: string;   // e.g. "10:00"
    specialCheckOut?: string;  // e.g. "22:00"
    graceMinutes: number;      // e.g. 10
    enablePenaltyRules?: boolean;
    penaltyTiers?: PenaltyTier[];

    // 迟到/早退判定开关
    enableLateCheck?: boolean;       // 迟到开关 (默认 true)
    enableEarlyCheck?: boolean;      // 早退开关 (默认 true)
    enableLateEarlyCheck?: boolean;  // 迟到早退并存开关 (默认 true)
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceShiftSettings = {
    weekdayCheckIn: "15:00",
    weekdayCheckOut: "02:00",
    weekendCheckIn: "11:00",
    weekendCheckOut: "02:00",
    enableWeekdayBreak: false,
    weekdayBreakStart: "17:00",
    weekdayBreakEnd: "18:00",
    enableWeekendBreak: false,
    weekendBreakStart: "17:00",
    weekendBreakEnd: "18:00",

    // 班次 2 默认值
    weekdayCheckIn2: "09:00",
    weekdayCheckOut2: "18:00",
    weekendCheckIn2: "09:00",
    weekendCheckOut2: "18:00",
    enableWeekdayBreak2: false,
    weekdayBreakStart2: "12:00",
    weekdayBreakEnd2: "13:00",
    enableWeekendBreak2: false,
    weekendBreakStart2: "12:00",
    weekendBreakEnd2: "13:00",

    hasSpecialPeriod: false,
    specialStartDate: "",
    specialEndDate: "",
    specialCheckIn: "15:00",
    specialCheckOut: "02:00",
    graceMinutes: 15,
    enablePenaltyRules: true,
    penaltyTiers: [
        { id: "tier_1", lateMinutes: 15, deductionType: 'AMOUNT', deductionAmount: 5 },
        { id: "tier_2", lateMinutes: 30, deductionType: 'AMOUNT', deductionAmount: 15 },
        { id: "tier_3", lateMinutes: 60, deductionType: 'HALF_DAY', deductionAmount: 0 }
    ],
    enableLateCheck: true,
    enableEarlyCheck: true,
    enableLateEarlyCheck: true
};

export const getTargetShiftForDate = (dateStr: string, settings: AttendanceShiftSettings, shiftGroup: number = 1) => {
    const isGrp2 = shiftGroup === 2;
    let checkInTimeStr = isGrp2 ? (settings.weekdayCheckIn2 || "09:00") : settings.weekdayCheckIn;
    let checkOutTimeStr = isGrp2 ? (settings.weekdayCheckOut2 || "18:00") : settings.weekdayCheckOut;
    
    if (settings.hasSpecialPeriod && settings.specialStartDate && settings.specialEndDate) {
        if (dateStr >= settings.specialStartDate && dateStr <= settings.specialEndDate) {
            checkInTimeStr = settings.specialCheckIn || (isGrp2 ? (settings.weekdayCheckIn2 || "09:00") : settings.weekdayCheckIn);
            checkOutTimeStr = settings.specialCheckOut || (isGrp2 ? (settings.weekdayCheckOut2 || "18:00") : settings.weekdayCheckOut);
        } else {
            const d = new Date(`${dateStr}T00:00:00`);
            const dow = d.getDay(); // 0=Sun, 6=Sat
            const isWeekend = dow === 0 || dow === 6;
            if (isWeekend) {
                checkInTimeStr = isGrp2 ? (settings.weekendCheckIn2 || "09:00") : settings.weekendCheckIn;
                checkOutTimeStr = isGrp2 ? (settings.weekendCheckOut2 || "18:00") : settings.weekendCheckOut;
            }
        }
    } else {
        const d = new Date(`${dateStr}T00:00:00`);
        const dow = d.getDay(); // 0=Sun, 6=Sat
        const isWeekend = dow === 0 || dow === 6;
        if (isWeekend) {
            checkInTimeStr = isGrp2 ? (settings.weekendCheckIn2 || "09:00") : settings.weekendCheckIn;
            checkOutTimeStr = isGrp2 ? (settings.weekendCheckOut2 || "18:00") : settings.weekendCheckOut;
        }
    }
    
    const checkInDate = new Date(`${dateStr}T00:00:00`);
    const [inHour, inMinute] = checkInTimeStr.split(':').map(Number);
    checkInDate.setHours(inHour, inMinute, 0, 0);
    
    const checkOutDate = new Date(`${dateStr}T00:00:00`);
    const [outHour, outMinute] = checkOutTimeStr.split(':').map(Number);
    checkOutDate.setHours(outHour, outMinute, 0, 0);
    
    if (outHour < inHour || (outHour < 12 && inHour >= 12)) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
    }
    
    return {
        checkIn: checkInDate,
        checkOut: checkOutDate,
        checkInStr: checkInTimeStr,
        checkOutStr: checkOutTimeStr
    };
};

export const getAttendanceStatus = (
    clockInISO: string | undefined | null,
    clockOutISO: string | undefined | null,
    dateStr: string,
    settings: AttendanceShiftSettings,
    shiftGroup: number = 1
): {
    status: 'COMPLETED' | 'LATE' | 'EARLY_OUT' | 'LATE_AND_EARLY';
    lateMinutes: number;
    earlyOutMinutes: number;
    isLate: boolean;
    isEarlyOut: boolean;
} => {
    const shift = getTargetShiftForDate(dateStr, settings, shiftGroup);
    
    // Evaluation switches
    const globalLateEnabled = (settings.enableLateCheck ?? true) && (settings.enableLateEarlyCheck ?? true);
    const globalEarlyEnabled = (settings.enableEarlyCheck ?? true) && (settings.enableLateEarlyCheck ?? true);

    let isLate = false;
    let lateMinutes = 0;
    if (clockInISO && globalLateEnabled) {
        const clockInDate = new Date(clockInISO);
        lateMinutes = Math.max(0, Math.floor((clockInDate.getTime() - shift.checkIn.getTime()) / 60000));
        isLate = lateMinutes > settings.graceMinutes;
    }
    
    let isEarlyOut = false;
    let earlyOutMinutes = 0;
    if (clockOutISO && globalEarlyEnabled) {
        const clockOutDate = new Date(clockOutISO);
        earlyOutMinutes = Math.max(0, Math.floor((shift.checkOut.getTime() - clockOutDate.getTime()) / 60000));
        isEarlyOut = earlyOutMinutes > settings.graceMinutes;
    }
    
    let status: 'COMPLETED' | 'LATE' | 'EARLY_OUT' | 'LATE_AND_EARLY' = 'COMPLETED';
    if (isLate && isEarlyOut) {
        status = 'LATE_AND_EARLY';
    } else if (isLate) {
        status = 'LATE';
    } else if (isEarlyOut) {
        status = 'EARLY_OUT';
    }
    
    return {
        status,
        lateMinutes,
        earlyOutMinutes,
        isLate,
        isEarlyOut
    };
};
