// ============================================================================
// CHG-05 服务端登录 · 核心规则（纯函数）
// ----------------------------------------------------------------------------
// 依 docs/security/2026-10-13-chg05-chg06-permission-plan.md 第 4 节：
// - PIN 新格式只存 scrypt 哈希（employee_secrets，只有服务端能读）
// - 过渡期（ACCEPT_LEGACY_PIN）仍接受 employees.pin 的旧明文 PIN，预设值与 V1 相同：
//   没有 PIN 的老板 = 8888、其他人 = 0000
// - 使用预设 PIN（没有存 PIN，或 PIN 为 0000）的人，登录后只拿到一次性改 PIN 凭证，不签发身份
// - claims 只看明确存放的栏位（orgLevel / systemRole / portalRoleOverride / readOnlyAccess），
//   不从职位名称推断、不沿用「员工 ID 002 = 系统管理员」特例
// ============================================================================
import crypto from 'crypto';

// ── PIN 哈希 ──
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 32 } as const;

export const hashPin = (pin: string, salt = crypto.randomBytes(16).toString('hex')): string => {
    const hash = crypto.scryptSync(pin, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
    return `scrypt$${SCRYPT.N}$${salt}$${hash}`;
};

export const verifyPinHash = (pin: string, stored: string): boolean => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false;
    const expected = Buffer.from(parts[3], 'hex');
    if (expected.length !== SCRYPT.keyLen) return false;
    const actual = crypto.scryptSync(pin, parts[2], SCRYPT.keyLen, { N, r: SCRYPT.r, p: SCRYPT.p });
    return crypto.timingSafeEqual(actual, expected);
};

const safeEqual = (a: string, b: string) => {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
};

// ── 员工资料（只取需要的栏位）──
export interface AuthEmployee {
    id: string;
    name?: string;
    role?: string;
    pin?: string;
    status?: string;
    isArchived?: boolean;
    orgLevel?: string;
    systemRole?: string;
    portalRoleOverride?: string;
    readOnlyAccess?: boolean;
    avatar?: string;
    photoUrl?: string;
}

export const isOwnerByRole = (e: AuthEmployee) => String(e.role || '').includes('Owner');

/** 与 V1 Login.tsx 相同的旧 PIN（没有存 PIN 时：老板 8888、其他 0000） */
export const legacyPinOf = (e: AuthEmployee) => e.pin || (isOwnerByRole(e) ? '8888' : '0000');

export const isActiveEmployee = (e: AuthEmployee) => e.status !== 'TERMINATED' && e.isArchived !== true;

export type PinCheck = { ok: false } | { ok: true; mustChange: boolean; via: 'HASH' | 'LEGACY' };

/**
 * 比对 PIN。已有哈希就只认哈希（临时 PIN 要求先改）；没有哈希时，ACCEPT_LEGACY_PIN 开启才接受旧明文 PIN。
 * 预设 PIN（没存 PIN，或 PIN 为 0000）一律要求先改 PIN。
 */
/** employee_secrets/{员工 ID}：只有服务端能读写 */
export interface EmployeeSecret {
    pinHash: string;
    /** 临时 PIN（负责人管理指令或 CHG-06 窗口发放）：登录后必须先改 PIN */
    mustChange?: boolean;
}

export const checkPin = (e: AuthEmployee, secret: EmployeeSecret | null, pin: string, acceptLegacy: boolean): PinCheck => {
    if (!/^\d{4,6}$/.test(pin)) return { ok: false };
    if (secret?.pinHash) return verifyPinHash(pin, secret.pinHash) ? { ok: true, mustChange: secret.mustChange === true, via: 'HASH' } : { ok: false };
    if (!acceptLegacy) return { ok: false };
    const legacy = legacyPinOf(e);
    if (!safeEqual(pin, legacy)) return { ok: false };
    return { ok: true, mustChange: !e.pin || e.pin === '0000', via: 'LEGACY' };
};

export const NEW_PIN_RULES = '新 PIN 必须是 6 位数字，不能是 0000、8888 或同一个数字重复';
export const isAcceptableNewPin = (pin: string) =>
    /^\d{6}$/.test(pin) && !/^(\d)\1{5}$/.test(pin) && pin !== '123456' && pin !== '654321';

// ── claims ──
const ORG_LEVELS = ['OWNER', 'BRANCH_MANAGER', 'STAFF_SUPPORT', 'DEPARTMENT_HEAD', 'TEAM_LEAD', 'CREW'] as const;
const PORTALS = ['BOSS', 'MANAGEMENT', 'STAFF'] as const;

export interface EmployeeClaims {
    emp: string;
    lvl: (typeof ORG_LEVELS)[number];
    portal: (typeof PORTALS)[number] | null;
    ro: boolean;
    sa: boolean;
    epoch: number;
}

/** 只看明确存放的栏位：没有 orgLevel 一律 CREW，不从职位名称推断 */
export const claimsFor = (e: AuthEmployee, epoch: number): EmployeeClaims => ({
    emp: e.id,
    lvl: (ORG_LEVELS as readonly string[]).includes(String(e.orgLevel)) ? (e.orgLevel as EmployeeClaims['lvl']) : 'CREW',
    portal: (PORTALS as readonly string[]).includes(String(e.portalRoleOverride)) ? (e.portalRoleOverride as EmployeeClaims['portal']) : null,
    ro: e.readOnlyAccess === true,
    sa: e.systemRole === 'SYSTEM_ADMIN',
    epoch,
});

export const uidForEmployee = (id: string) => `emp_${id}`;

// ── 登录 ID（与 V1 handleManualIdSubmit 相同的写法）──
export const candidateIds = (raw: string): string[] => {
    const normalized = String(raw || '').trim().toUpperCase();
    const digits = normalized.replace(/\D/g, '');
    const padded = digits ? digits.padStart(3, '0') : '';
    return Array.from(new Set([normalized, digits, padded, digits ? `ID${digits}` : '', padded ? `ID${padded}` : ''].filter(Boolean)));
};

export const findEmployeeByLoginId = <T extends AuthEmployee>(list: T[], raw: string): T | undefined => {
    const ids = new Set(candidateIds(raw));
    return list.find(e => ids.has(String(e.id).trim().toUpperCase()));
};

// ── 尝试次数限制 ──
export interface AttemptState {
    failures: number;
    windowStart: number;
    lockedUntil: number;
}

export const LIMITS = {
    login: { maxFailures: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
    boss: { maxFailures: 5, windowMs: 15 * 60 * 1000, lockMs: 30 * 60 * 1000 },
} as const;

export const isLocked = (s: AttemptState | null, now: number) => !!s && s.lockedUntil > now;

export const recordFailure = (s: AttemptState | null, now: number, limit: { maxFailures: number; windowMs: number; lockMs: number }): AttemptState => {
    const fresh = !s || now - s.windowStart > limit.windowMs;
    const failures = (fresh ? 0 : s!.failures) + 1;
    return {
        failures,
        windowStart: fresh ? now : s!.windowStart,
        lockedUntil: failures >= limit.maxFailures ? now + limit.lockMs : 0,
    };
};

export const rateKey = (kind: string, ...parts: string[]) =>
    `${kind}_${crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)}`;

// ── 一次性改 PIN 凭证（只回给客户端原值，服务端只存哈希）──
export const newOneTimeToken = () => {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, id: crypto.createHash('sha256').update(token).digest('hex') };
};
export const oneTimeTokenId = (token: string) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const PIN_CHANGE_TOKEN_TTL_MS = 10 * 60 * 1000;
