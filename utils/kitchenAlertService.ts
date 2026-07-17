import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
    CreateKitchenAlertInput,
    KitchenAlert,
    KitchenAlertActor,
    KitchenAlertHistoryFilter,
    KitchenAlertStatus,
} from '../types';
import { getBusinessDateString } from './dateHelper';

const COLLECTION_NAME = 'kitchen_alerts';
const ACTIVE_STATUSES: KitchenAlertStatus[] = ['NEW', 'ACKNOWLEDGED'];
const ALERT_TYPES = ['RUSH', 'MISSING', 'WRONG', 'REMAKE', 'NOTICE'] as const;
const ALERT_PRIORITIES = ['NOTICE', 'URGENT'] as const;

export type KitchenAlertListener = (alerts: KitchenAlert[]) => void;
export type KitchenAlertErrorListener = (error: Error) => void;

/** UI 可直接显示此错误的信息，不需要把 Firestore 的内部错误暴露给员工。 */
export class KitchenAlertValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'KitchenAlertValidationError';
    }
}

export class KitchenAlertTransitionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'KitchenAlertTransitionError';
    }
}

const cleanText = (
    value: string | undefined,
    label: string,
    maxLength: number,
    required = false,
): string | undefined => {
    const cleaned = value?.trim().replace(/\s+/g, ' ');
    if (required && !cleaned) {
        throw new KitchenAlertValidationError(`${label} is required / 请填写${label}`);
    }
    if (cleaned && cleaned.length > maxLength) {
        throw new KitchenAlertValidationError(`${label} cannot exceed ${maxLength} characters / 不可超过 ${maxLength} 个字`);
    }
    return cleaned || undefined;
};

const cleanActor = (actor: KitchenAlertActor): KitchenAlertActor => {
    const id = cleanText(actor?.id, 'Staff ID / 员工编号', 80, true)!;
    const name = cleanText(actor?.name, 'Staff Name / 员工姓名', 100, true)!;
    return { id, name };
};

const stripUndefined = (value: Record<string, unknown>): Record<string, unknown> => (
    Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined))
);

const createAlertId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `ka_${crypto.randomUUID()}`;
    }
    return `ka_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeAlert = (
    id: string,
    data: DocumentData,
): KitchenAlert => {
    const status = (data.status || 'NEW') as KitchenAlertStatus;
    return {
        ...data,
        id,
        schemaVersion: 1,
        quantity: Number(data.quantity) || 1,
        status,
        isActive: typeof data.isActive === 'boolean'
            ? data.isActive
            : ACTIVE_STATUSES.includes(status),
    } as KitchenAlert;
};

const mapSnapshot = (
    snapshot: QueryDocumentSnapshot<DocumentData>,
): KitchenAlert => normalizeAlert(snapshot.id, snapshot.data());

const sortActiveAlerts = (alerts: KitchenAlert[]): KitchenAlert[] => (
    [...alerts].sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority === 'URGENT' ? -1 : 1;
        }
        return a.createdAt.localeCompare(b.createdAt);
    })
);

const sortHistory = (alerts: KitchenAlert[]): KitchenAlert[] => (
    [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

const requireId = (value: string, label: string): string => (
    cleanText(value, label, 120, true)!
);

/**
 * 厨房急单协同台专用 Firestore 服务。
 *
 * - 使用 onSnapshot 实时同步，不采用每两秒轮询。
 * - 使用 transaction 保护接收/解决状态，避免厨房多人同时点击造成覆盖。
 * - 完成记录只改变状态，不会删除，供历史查询与后续报表使用。
 */
export class KitchenAlertService {
    static async createAlert(input: CreateKitchenAlertInput): Promise<KitchenAlert> {
        const storeId = requireId(input.storeId, 'Store ID / 门店编号');
        const tableNo = requireId(input.tableNo, 'Table No / 桌号');
        const orderNo = input.orderNo ? requireId(input.orderNo, 'Order No / 菜单单号') : '—';
        const dishName = requireId(input.dishName, 'Dish Name / 菜品名称');
        const createdBy = cleanActor(input.createdBy);

        if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
            throw new KitchenAlertValidationError('Quantity must be an integer between 1 and 99 / 数量必须是 1 至 99 的整数');
        }
        if (!ALERT_TYPES.includes(input.alertType)) {
            throw new KitchenAlertValidationError('Invalid alert type / 通知类型不正确');
        }
        if (!ALERT_PRIORITIES.includes(input.priority)) {
            throw new KitchenAlertValidationError('Invalid priority / 紧急程度不正确');
        }

        const businessDate = input.businessDate || getBusinessDateString();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
            throw new KitchenAlertValidationError('Invalid business date format / 营业日期格式不正确');
        }

        const now = new Date().toISOString();
        const id = createAlertId();
        const alert: KitchenAlert = {
            id,
            schemaVersion: 1,
            storeId,
            businessDate,
            tableNo,
            orderNo,
            dishId: cleanText(input.dishId, 'Dish ID / 菜品编号', 120),
            dishName,
            size: cleanText(input.size, 'Size / 大小规格', 40),
            quantity: input.quantity,
            note: cleanText(input.note, 'Note / 备注', 500),
            alertType: input.alertType,
            priority: input.priority,
            status: 'NEW',
            isActive: true,
            createdById: createdBy.id,
            createdByName: createdBy.name,
            createdAt: now,
            updatedAt: now,
        };

        await setDoc(doc(db, COLLECTION_NAME, id), stripUndefined({
            ...alert,
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
        }));

        return alert;
    }

    /** 厨房大屏只监听当前门店尚未完成的通知。 */
    static subscribeActiveAlerts(
        storeId: string,
        listener: KitchenAlertListener,
        onError?: KitchenAlertErrorListener,
    ): Unsubscribe {
        const normalizedStoreId = requireId(storeId, 'Store ID / 门店编号');
        const activeQuery = query(
            collection(db, COLLECTION_NAME),
            where('storeId', '==', normalizedStoreId),
            where('isActive', '==', true),
        );

        return onSnapshot(
            activeQuery,
            snapshot => {
                const alerts = snapshot.docs
                    .map(mapSnapshot)
                    .filter(alert => ACTIVE_STATUSES.includes(alert.status));
                listener(sortActiveAlerts(alerts));
            },
            error => onError?.(error instanceof Error ? error : new Error(String(error))),
        );
    }

    /** 楼面员工监听自己在指定营业日提交的通知及厨房处理状态。 */
    static subscribeEmployeeAlerts(
        storeId: string,
        employeeId: string,
        listener: KitchenAlertListener,
        options?: {
            businessDate?: string;
            onError?: KitchenAlertErrorListener;
        },
    ): Unsubscribe {
        const normalizedStoreId = requireId(storeId, 'Store ID / 门店编号');
        const normalizedEmployeeId = requireId(employeeId, 'Staff ID / 员工编号');
        const businessDate = options?.businessDate || getBusinessDateString();
        const employeeQuery = query(
            collection(db, COLLECTION_NAME),
            where('storeId', '==', normalizedStoreId),
            where('createdById', '==', normalizedEmployeeId),
            where('businessDate', '==', businessDate),
        );

        return onSnapshot(
            employeeQuery,
            snapshot => listener(sortHistory(snapshot.docs.map(mapSnapshot))),
            error => options?.onError?.(
                error instanceof Error ? error : new Error(String(error)),
            ),
        );
    }

    static async getAlertById(alertId: string): Promise<KitchenAlert | null> {
        const normalizedId = requireId(alertId, 'Alert ID / 通知编号');
        const snapshot = await getDoc(doc(db, COLLECTION_NAME, normalizedId));
        return snapshot.exists()
            ? normalizeAlert(snapshot.id, snapshot.data())
            : null;
    }

    static async acknowledgeAlert(
        alertId: string,
        actorInput: KitchenAlertActor,
    ): Promise<KitchenAlert> {
        const normalizedId = requireId(alertId, 'Alert ID / 通知编号');
        const actor = cleanActor(actorInput);
        const alertRef = doc(db, COLLECTION_NAME, normalizedId);

        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(alertRef);
            if (!snapshot.exists()) {
                throw new KitchenAlertTransitionError('Alert not found / 找不到这项厨房通知');
            }

            const current = normalizeAlert(snapshot.id, snapshot.data());
            if (current.status === 'RESOLVED') {
                throw new KitchenAlertTransitionError('Alert already resolved / 这项通知已经解决');
            }
            if (current.status === 'CANCELLED') {
                throw new KitchenAlertTransitionError('Alert already cancelled / 这项通知已经取消');
            }
            if (current.status === 'ACKNOWLEDGED') {
                return current;
            }

            const now = new Date().toISOString();
            const updated: KitchenAlert = {
                ...current,
                status: 'ACKNOWLEDGED',
                isActive: true,
                acknowledgedById: actor.id,
                acknowledgedByName: actor.name,
                acknowledgedAt: now,
                updatedAt: now,
            };

            transaction.update(alertRef, {
                status: updated.status,
                isActive: true,
                acknowledgedById: actor.id,
                acknowledgedByName: actor.name,
                acknowledgedAt: now,
                updatedAt: now,
                serverUpdatedAt: serverTimestamp(),
            });
            return updated;
        });
    }

    static async resolveAlert(
        alertId: string,
        actorInput: KitchenAlertActor,
        resolutionNote?: string,
    ): Promise<KitchenAlert> {
        const normalizedId = requireId(alertId, 'Alert ID / 通知编号');
        const actor = cleanActor(actorInput);
        const cleanedResolutionNote = cleanText(resolutionNote, 'Resolution Note / 解决备注', 500);
        const alertRef = doc(db, COLLECTION_NAME, normalizedId);

        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(alertRef);
            if (!snapshot.exists()) {
                throw new KitchenAlertTransitionError('Alert not found / 找不到这项厨房通知');
            }

            const current = normalizeAlert(snapshot.id, snapshot.data());
            if (current.status === 'CANCELLED') {
                throw new KitchenAlertTransitionError('Cannot resolve a cancelled alert / 已取消的通知不能标记为解决');
            }
            if (current.status === 'RESOLVED') {
                return current;
            }

            const now = new Date().toISOString();
            const updated: KitchenAlert = {
                ...current,
                status: 'RESOLVED',
                isActive: false,
                resolvedById: actor.id,
                resolvedByName: actor.name,
                resolvedAt: now,
                resolutionNote: cleanedResolutionNote,
                updatedAt: now,
            };

            transaction.update(alertRef, {
                status: updated.status,
                isActive: false,
                resolvedById: actor.id,
                resolvedByName: actor.name,
                resolvedAt: now,
                resolutionNote: cleanedResolutionNote || null,
                updatedAt: now,
                serverUpdatedAt: serverTimestamp(),
            });
            return updated;
        });
    }

    static async cancelAlert(
        alertId: string,
        actorInput: KitchenAlertActor,
        reason?: string,
    ): Promise<KitchenAlert> {
        const normalizedId = requireId(alertId, 'Alert ID / 通知编号');
        const actor = cleanActor(actorInput);
        const cleanedReason = cleanText(reason, 'Cancel Reason / 取消原因', 300);
        const alertRef = doc(db, COLLECTION_NAME, normalizedId);

        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(alertRef);
            if (!snapshot.exists()) {
                throw new KitchenAlertTransitionError('Alert not found / 找不到这项厨房通知');
            }

            const current = normalizeAlert(snapshot.id, snapshot.data());
            if (current.status === 'RESOLVED') {
                throw new KitchenAlertTransitionError('Cannot cancel a resolved alert / 已经解决的通知不能取消');
            }
            if (current.status === 'CANCELLED') {
                return current;
            }

            const now = new Date().toISOString();
            const updated: KitchenAlert = {
                ...current,
                status: 'CANCELLED',
                isActive: false,
                cancelledById: actor.id,
                cancelledByName: actor.name,
                cancelledAt: now,
                cancelReason: cleanedReason,
                updatedAt: now,
            };

            transaction.update(alertRef, {
                status: updated.status,
                isActive: false,
                cancelledById: actor.id,
                cancelledByName: actor.name,
                cancelledAt: now,
                cancelReason: cleanedReason || null,
                updatedAt: now,
                serverUpdatedAt: serverTimestamp(),
            });
            return updated;
        });
    }

    /** 默认只读取一个营业日，避免历史记录不断增加时产生高额读取量。 */
    static async getHistory(filter: KitchenAlertHistoryFilter): Promise<KitchenAlert[]> {
        const storeId = requireId(filter.storeId, 'Store ID / 门店编号');
        const businessDate = requireId(filter.businessDate, 'Business Date / 营业日期');
        const historyQuery = query(
            collection(db, COLLECTION_NAME),
            where('storeId', '==', storeId),
            where('businessDate', '==', businessDate),
        );
        const snapshot = await getDocs(historyQuery);
        const maxRecords = Math.min(Math.max(filter.maxRecords || 300, 1), 500);
        const tableNo = filter.tableNo?.trim().toLowerCase();
        const orderNo = filter.orderNo?.trim().toLowerCase();

        return sortHistory(snapshot.docs.map(mapSnapshot))
            .filter(alert => !filter.status || alert.status === filter.status)
            .filter(alert => !filter.createdById || alert.createdById === filter.createdById)
            .filter(alert => !tableNo || alert.tableNo.toLowerCase().includes(tableNo))
            .filter(alert => !orderNo || alert.orderNo.toLowerCase().includes(orderNo))
            .slice(0, maxRecords);
    }
}
