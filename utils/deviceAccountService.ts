import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    where,
    type DocumentData,
    type DocumentSnapshot,
    type QueryDocumentSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
    CreateDeviceAccountInput,
    DeviceAccount,
    DeviceAccountActor,
    DeviceAccountStatus,
    DeviceScreen,
    DeviceSession,
    UpdateDeviceAccountInput,
} from '../types';

const COLLECTION_NAME = 'device_accounts';
const PIN_ITERATIONS = 120_000;
const VALID_SCREENS: DeviceScreen[] = ['KITCHEN_ALERT', 'QUEUE_DISPLAY'];
const VALID_STATUSES: DeviceAccountStatus[] = ['ACTIVE', 'DISABLED'];

interface DeviceAccountRecord extends DeviceAccount {
    pinHash: string;
    pinSalt: string;
    pinIterations: number;
    sessionHash?: string;
}

export type DeviceAccountListener = (devices: DeviceAccount[]) => void;
export type DeviceAccountErrorListener = (error: Error) => void;

export class DeviceAccountValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeviceAccountValidationError';
    }
}

export class DeviceAccountConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeviceAccountConflictError';
    }
}

export class DeviceAccountAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeviceAccountAuthError';
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
        throw new DeviceAccountValidationError(`请填写${label}`);
    }
    if (cleaned && cleaned.length > maxLength) {
        throw new DeviceAccountValidationError(`${label}不可超过 ${maxLength} 个字`);
    }
    return cleaned || undefined;
};

const cleanActor = (actor: DeviceAccountActor): DeviceAccountActor => ({
    id: cleanText(actor?.id, '管理人员编号', 80, true)!,
    name: cleanText(actor?.name, '管理人员姓名', 100, true)!,
});

const normalizeDeviceCode = (value: string): string => {
    const code = value?.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code || '')) {
        throw new DeviceAccountValidationError('设备编号必须是 3 至 40 位英文字母、数字、横线或底线');
    }
    return code;
};

const validatePin = (pin: string): string => {
    const normalized = pin?.trim();
    if (!/^\d{4,8}$/.test(normalized || '')) {
        throw new DeviceAccountValidationError('设备 PIN 必须是 4 至 8 位数字');
    }
    return normalized;
};

const normalizeScreens = (screens: DeviceScreen[]): DeviceScreen[] => {
    const normalized = [...new Set(screens || [])]
        .filter((screen): screen is DeviceScreen => VALID_SCREENS.includes(screen));
    if (normalized.length === 0) {
        throw new DeviceAccountValidationError('设备至少需要一个可使用画面');
    }
    return normalized;
};

const validateDefaultScreen = (
    defaultScreen: DeviceScreen,
    allowedScreens: DeviceScreen[],
): DeviceScreen => {
    if (!VALID_SCREENS.includes(defaultScreen) || !allowedScreens.includes(defaultScreen)) {
        throw new DeviceAccountValidationError('默认画面必须包含在设备可使用画面中');
    }
    return defaultScreen;
};

const getDocumentId = (deviceCode: string): string => (
    `device_${normalizeDeviceCode(deviceCode).toLowerCase()}`
);

const requireCrypto = (): Crypto => {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
        throw new DeviceAccountValidationError('此浏览器不支持安全 PIN，请使用 HTTPS 和最新版浏览器');
    }
    return globalThis.crypto;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const derivePinHash = async (
    pin: string,
    salt: Uint8Array,
    iterations: number,
): Promise<Uint8Array> => {
    const cryptoApi = requireCrypto();
    const key = await cryptoApi.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const bits = await cryptoApi.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt,
            iterations,
        },
        key,
        256,
    );
    return new Uint8Array(bits);
};

const createPinCredential = async (pinInput: string) => {
    const pin = validatePin(pinInput);
    const cryptoApi = requireCrypto();
    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const hash = await derivePinHash(pin, salt, PIN_ITERATIONS);
    return {
        pinHash: bytesToBase64(hash),
        pinSalt: bytesToBase64(salt),
        pinIterations: PIN_ITERATIONS,
    };
};

const hashSessionToken = async (sessionToken: string): Promise<string> => {
    const cryptoApi = requireCrypto();
    const digest = await cryptoApi.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(sessionToken),
    );
    return bytesToBase64(new Uint8Array(digest));
};

const createSessionCredential = async (): Promise<{
    sessionToken: string;
    sessionHash: string;
}> => {
    const cryptoApi = requireCrypto();
    const tokenBytes = cryptoApi.getRandomValues(new Uint8Array(32));
    const sessionToken = bytesToBase64(tokenBytes);
    return {
        sessionToken,
        sessionHash: await hashSessionToken(sessionToken),
    };
};

const verifySessionCredential = async (
    sessionToken: string | undefined,
    sessionHash: string | undefined,
): Promise<boolean> => {
    if (!sessionToken || !sessionHash) return false;
    const actual = base64ToBytes(await hashSessionToken(sessionToken));
    const expected = base64ToBytes(sessionHash);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
        difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
};

const verifyPin = async (pinInput: string, record: DeviceAccountRecord): Promise<boolean> => {
    let pin: string;
    try {
        pin = validatePin(pinInput);
    } catch {
        return false;
    }
    const expected = base64ToBytes(record.pinHash);
    const actual = await derivePinHash(
        pin,
        base64ToBytes(record.pinSalt),
        record.pinIterations || PIN_ITERATIONS,
    );
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
        difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
};

const normalizeRecord = (id: string, data: DocumentData): DeviceAccountRecord => {
    const allowedScreens = Array.isArray(data.allowedScreens)
        ? data.allowedScreens.filter((screen: unknown): screen is DeviceScreen => VALID_SCREENS.includes(screen as DeviceScreen))
        : [];
    const safeScreens = allowedScreens.length ? allowedScreens : ['KITCHEN_ALERT'] as DeviceScreen[];
    const defaultScreen = safeScreens.includes(data.defaultScreen as DeviceScreen)
        ? data.defaultScreen as DeviceScreen
        : safeScreens[0];

    return {
        ...data,
        id,
        schemaVersion: 1,
        deviceCode: String(data.deviceCode || '').toUpperCase(),
        deviceName: String(data.deviceName || 'Unnamed Device'),
        storeId: String(data.storeId || 'KEPONG'),
        status: VALID_STATUSES.includes(data.status as DeviceAccountStatus)
            ? data.status as DeviceAccountStatus
            : 'DISABLED',
        allowedScreens: safeScreens,
        defaultScreen,
        location: typeof data.location === 'string' ? data.location : undefined,
        notes: typeof data.notes === 'string' ? data.notes : undefined,
        currentScreen: VALID_SCREENS.includes(data.currentScreen as DeviceScreen)
            ? data.currentScreen as DeviceScreen
            : undefined,
        sessionVersion: Math.max(1, Number(data.sessionVersion) || 1),
        pinHash: String(data.pinHash || ''),
        pinSalt: String(data.pinSalt || ''),
        pinIterations: Number(data.pinIterations) || PIN_ITERATIONS,
        sessionHash: typeof data.sessionHash === 'string' ? data.sessionHash : undefined,
    } as DeviceAccountRecord;
};

const mapSnapshot = (
    snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
): DeviceAccountRecord => normalizeRecord(snapshot.id, snapshot.data() || {});

const toPublicAccount = (record: DeviceAccountRecord): DeviceAccount => {
    const account = { ...record } as Partial<DeviceAccountRecord>;
    delete account.pinHash;
    delete account.pinSalt;
    delete account.pinIterations;
    delete account.sessionHash;
    return account as DeviceAccount;
};

const sortDevices = (devices: DeviceAccount[]): DeviceAccount[] => (
    [...devices].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
        return a.deviceName.localeCompare(b.deviceName);
    })
);

const getRecordByCode = async (deviceCode: string): Promise<DeviceAccountRecord | null> => {
    const normalizedCode = normalizeDeviceCode(deviceCode);
    const snapshot = await getDoc(doc(db, COLLECTION_NAME, getDocumentId(normalizedCode)));
    return snapshot.exists() ? mapSnapshot(snapshot) : null;
};

export class DeviceAccountService {
    static async createDeviceAccount(input: CreateDeviceAccountInput): Promise<DeviceAccount> {
        const deviceCode = normalizeDeviceCode(input.deviceCode);
        const deviceName = cleanText(input.deviceName, '设备名称', 100, true)!;
        const storeId = cleanText(input.storeId, '门店编号', 80, true)!;
        const allowedScreens = normalizeScreens(input.allowedScreens);
        const defaultScreen = validateDefaultScreen(input.defaultScreen, allowedScreens);
        const actor = cleanActor(input.createdBy);
        const credential = await createPinCredential(input.pin);
        const now = new Date().toISOString();
        const id = getDocumentId(deviceCode);
        const deviceRef = doc(db, COLLECTION_NAME, id);

        const record: DeviceAccountRecord = {
            id,
            schemaVersion: 1,
            deviceCode,
            deviceName,
            storeId,
            status: 'ACTIVE',
            allowedScreens,
            defaultScreen,
            sessionVersion: 1,
            createdById: actor.id,
            createdByName: actor.name,
            createdAt: now,
            updatedById: actor.id,
            updatedByName: actor.name,
            updatedAt: now,
            ...credential,
        };

        const location = cleanText(input.location, '设备位置', 120);
        if (location !== undefined) {
            record.location = location;
        }
        const notes = cleanText(input.notes, '备注', 300);
        if (notes !== undefined) {
            record.notes = notes;
        }

        await runTransaction(db, async transaction => {
            const existing = await transaction.get(deviceRef);
            if (existing.exists()) {
                throw new DeviceAccountConflictError(`设备编号 ${deviceCode} 已经存在`);
            }
            transaction.set(deviceRef, {
                ...record,
                serverCreatedAt: serverTimestamp(),
                serverUpdatedAt: serverTimestamp(),
            });
        });

        return toPublicAccount(record);
    }

    static async getDeviceAccountByCode(deviceCode: string): Promise<DeviceAccount | null> {
        const record = await getRecordByCode(deviceCode);
        return record ? toPublicAccount(record) : null;
    }

    static async listDeviceAccounts(storeId?: string): Promise<DeviceAccount[]> {
        const deviceQuery = storeId
            ? query(
                collection(db, COLLECTION_NAME),
                where('storeId', '==', cleanText(storeId, '门店编号', 80, true)!),
            )
            : collection(db, COLLECTION_NAME);
        const snapshot = await getDocs(deviceQuery);
        return sortDevices(snapshot.docs.map(mapSnapshot).map(toPublicAccount));
    }

    static subscribeDeviceAccounts(
        listener: DeviceAccountListener,
        options?: { storeId?: string; onError?: DeviceAccountErrorListener },
    ): Unsubscribe {
        const deviceQuery = options?.storeId
            ? query(
                collection(db, COLLECTION_NAME),
                where('storeId', '==', cleanText(options.storeId, '门店编号', 80, true)!),
            )
            : collection(db, COLLECTION_NAME);

        return onSnapshot(
            deviceQuery,
            snapshot => listener(sortDevices(snapshot.docs.map(mapSnapshot).map(toPublicAccount))),
            error => options?.onError?.(error instanceof Error ? error : new Error(String(error))),
        );
    }

    static async updateDeviceAccount(
        deviceId: string,
        input: UpdateDeviceAccountInput,
        actorInput: DeviceAccountActor,
    ): Promise<DeviceAccount> {
        const actor = cleanActor(actorInput);
        const deviceRef = doc(db, COLLECTION_NAME, cleanText(deviceId, '设备资料编号', 120, true)!);

        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(deviceRef);
            if (!snapshot.exists()) throw new DeviceAccountValidationError('找不到这个设备户口');
            const current = mapSnapshot(snapshot);

            const allowedScreens = input.allowedScreens
                ? normalizeScreens(input.allowedScreens)
                : current.allowedScreens;
            const defaultScreen = validateDefaultScreen(
                input.defaultScreen || current.defaultScreen,
                allowedScreens,
            );
            const status = input.status || current.status;
            if (!VALID_STATUSES.includes(status)) {
                throw new DeviceAccountValidationError('设备状态不正确');
            }
            const statusChangedToDisabled = current.status !== 'DISABLED' && status === 'DISABLED';
            const now = new Date().toISOString();
            const updated: DeviceAccountRecord = {
                ...current,
                deviceName: input.deviceName !== undefined
                    ? cleanText(input.deviceName, '设备名称', 100, true)!
                    : current.deviceName,
                storeId: input.storeId !== undefined
                    ? cleanText(input.storeId, '门店编号', 80, true)!
                    : current.storeId,
                allowedScreens,
                defaultScreen,
                location: input.location !== undefined
                    ? cleanText(input.location, '设备位置', 120)
                    : current.location,
                notes: input.notes !== undefined
                    ? cleanText(input.notes, '备注', 300)
                    : current.notes,
                status,
                sessionVersion: statusChangedToDisabled
                    ? current.sessionVersion + 1
                    : current.sessionVersion,
                sessionHash: statusChangedToDisabled ? undefined : current.sessionHash,
                currentScreen: status === 'DISABLED' ? undefined : current.currentScreen,
                updatedById: actor.id,
                updatedByName: actor.name,
                updatedAt: now,
            };

            transaction.update(deviceRef, {
                deviceName: updated.deviceName,
                storeId: updated.storeId,
                allowedScreens: updated.allowedScreens,
                defaultScreen: updated.defaultScreen,
                location: updated.location || null,
                notes: updated.notes || null,
                status: updated.status,
                sessionVersion: updated.sessionVersion,
                sessionHash: updated.sessionHash || null,
                currentScreen: updated.currentScreen || null,
                updatedById: actor.id,
                updatedByName: actor.name,
                updatedAt: now,
                serverUpdatedAt: serverTimestamp(),
            });
            return toPublicAccount(updated);
        });
    }

    static async changePin(
        deviceId: string,
        newPin: string,
        actorInput: DeviceAccountActor,
    ): Promise<void> {
        const actor = cleanActor(actorInput);
        const credential = await createPinCredential(newPin);
        const deviceRef = doc(db, COLLECTION_NAME, cleanText(deviceId, '设备资料编号', 120, true)!);

        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(deviceRef);
            if (!snapshot.exists()) throw new DeviceAccountValidationError('找不到这个设备户口');
            const current = mapSnapshot(snapshot);
            const now = new Date().toISOString();
            transaction.update(deviceRef, {
                ...credential,
                sessionVersion: current.sessionVersion + 1,
                sessionHash: null,
                currentScreen: null,
                updatedById: actor.id,
                updatedByName: actor.name,
                updatedAt: now,
                serverUpdatedAt: serverTimestamp(),
            });
        });
    }

    static async setStatus(
        deviceId: string,
        status: DeviceAccountStatus,
        actor: DeviceAccountActor,
    ): Promise<DeviceAccount> {
        return this.updateDeviceAccount(deviceId, { status }, actor);
    }

    static async revokeSessions(
        deviceId: string,
        actorInput: DeviceAccountActor,
    ): Promise<void> {
        const actor = cleanActor(actorInput);
        const deviceRef = doc(db, COLLECTION_NAME, cleanText(deviceId, '设备资料编号', 120, true)!);
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(deviceRef);
            if (!snapshot.exists()) throw new DeviceAccountValidationError('找不到这个设备户口');
            const current = mapSnapshot(snapshot);
            const now = new Date().toISOString();
            transaction.update(deviceRef, {
                sessionVersion: current.sessionVersion + 1,
                sessionHash: null,
                currentScreen: null,
                updatedById: actor.id,
                updatedByName: actor.name,
                updatedAt: now,
                serverUpdatedAt: serverTimestamp(),
            });
        });
    }

    static async authenticate(deviceCode: string, pin: string): Promise<DeviceSession> {
        const record = await getRecordByCode(deviceCode);
        if (!record || !record.pinHash || !record.pinSalt || !(await verifyPin(pin, record))) {
            throw new DeviceAccountAuthError('设备编号或 PIN 不正确');
        }
        if (record.status !== 'ACTIVE') {
            throw new DeviceAccountAuthError('这个设备户口已经停用，请联系管理员');
        }

        const deviceRef = doc(db, COLLECTION_NAME, record.id);
        const loginAt = new Date().toISOString();
        const sessionCredential = await createSessionCredential();
        const sessionVersion = await runTransaction(db, async transaction => {
            const latestSnapshot = await transaction.get(deviceRef);
            if (!latestSnapshot.exists()) throw new DeviceAccountAuthError('设备户口已经不存在');
            const latest = mapSnapshot(latestSnapshot);
            if (latest.status !== 'ACTIVE' || latest.sessionVersion !== record.sessionVersion) {
                throw new DeviceAccountAuthError('设备资料已经更新，请重新登录');
            }
            const nextSessionVersion = latest.sessionVersion + 1;
            transaction.update(deviceRef, {
                sessionVersion: nextSessionVersion,
                sessionHash: sessionCredential.sessionHash,
                lastLoginAt: loginAt,
                lastSeenAt: loginAt,
                currentScreen: latest.defaultScreen,
                serverLastLoginAt: serverTimestamp(),
                serverLastSeenAt: serverTimestamp(),
            });
            return nextSessionVersion;
        });

        return {
            schemaVersion: 1,
            deviceId: record.id,
            deviceCode: record.deviceCode,
            deviceName: record.deviceName,
            storeId: record.storeId,
            allowedScreens: record.allowedScreens,
            defaultScreen: record.defaultScreen,
            sessionVersion,
            sessionToken: sessionCredential.sessionToken,
            loginAt,
        };
    }

    static async validateSession(session: DeviceSession): Promise<DeviceAccount> {
        const snapshot = await getDoc(doc(db, COLLECTION_NAME, session.deviceId));
        if (!snapshot.exists()) throw new DeviceAccountAuthError('设备会话已经失效');
        const record = mapSnapshot(snapshot);
        const credentialValid = await verifySessionCredential(session.sessionToken, record.sessionHash);
        if (
            record.status !== 'ACTIVE' ||
            record.sessionVersion !== session.sessionVersion ||
            !credentialValid
        ) {
            throw new DeviceAccountAuthError('设备会话已经失效，请重新登录');
        }
        return toPublicAccount(record);
    }

    static async heartbeat(session: DeviceSession, currentScreen: DeviceScreen): Promise<void> {
        if (!VALID_SCREENS.includes(currentScreen) || !session.allowedScreens.includes(currentScreen)) {
            throw new DeviceAccountAuthError('这个设备没有使用该画面的权限');
        }
        const deviceRef = doc(db, COLLECTION_NAME, session.deviceId);
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(deviceRef);
            if (!snapshot.exists()) throw new DeviceAccountAuthError('设备会话已经失效');
            const record = mapSnapshot(snapshot);
            const credentialValid = await verifySessionCredential(session.sessionToken, record.sessionHash);
            if (
                record.status !== 'ACTIVE' ||
                record.sessionVersion !== session.sessionVersion ||
                !credentialValid
            ) {
                throw new DeviceAccountAuthError('设备会话已经失效，请重新登录');
            }
            if (!record.allowedScreens.includes(currentScreen)) {
                throw new DeviceAccountAuthError('这个设备没有使用该画面的权限');
            }
            const now = new Date().toISOString();
            transaction.update(deviceRef, {
                lastSeenAt: now,
                currentScreen,
                serverLastSeenAt: serverTimestamp(),
            });
        });
    }

    static getScreenMode(screen: DeviceScreen): 'kitchen' | 'tv' {
        return screen === 'KITCHEN_ALERT' ? 'kitchen' : 'tv';
    }
}
