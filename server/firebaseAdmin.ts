// ============================================================================
// firebase-admin 共用初始化（推送 PR E2a、服务端登录 CHG-05 共用）
// ----------------------------------------------------------------------------
// Emulator 模式：强制连本机 Firestore / Auth Emulator（demo-klk-erp），不可能碰到正式资料。
// 其他模式：使用执行环境的服务账号（Application Default Credentials）。
// 只在某项服务端功能开启时才呼叫，功能关闭时不会初始化、不会连资料库。
// ============================================================================
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';

export const EMULATOR_PROJECT_ID = 'demo-klk-erp';

let app: App | null = null;
let emulator = false;

export const initFirebaseAdmin = (isEmulatorMode: boolean): App => {
    if (app) return app;
    emulator = isEmulatorMode;
    if (isEmulatorMode) {
        process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
        process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
        app = getApps()[0] || initializeApp({ projectId: EMULATOR_PROJECT_ID });
        return app;
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    app = getApps()[0] || initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
    return app;
};

export const adminApp = (): App => {
    if (!app) throw new Error('firebase-admin not initialised');
    return app;
};

export const isAdminEmulator = () => emulator;
