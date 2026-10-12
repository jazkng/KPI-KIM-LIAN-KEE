import { initializeApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { initializeAuth, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence, Auth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";

/**
 * 御膳智控 - 安全加固版配置
 * 使用 import.meta.env 确保密钥不被硬编码在代码中
 */
/**
 * 🧪 Emulator 模式（V2 开发 / 测试专用）
 * ---------------------------------------------------------------
 * VITE_USE_FIREBASE_EMULATOR=true 时：
 *   - 完全不读取正式 Firebase 的 VITE_FIREBASE_* 变量
 *   - 固定使用 demo- 开头的假项目 ID（Firebase 保证 demo- 项目永远不会连到云端）
 *   - Firestore / Auth 全部连到本机 Emulator
 * 这样即使开发机的 .env 里有正式配置，也不可能误写正式营业资料。
 */
export const isEmulatorMode = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
export const EMULATOR_PROJECT_ID = 'demo-klk-erp';
const EMULATOR_HOST = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';

const firebaseConfig = isEmulatorMode ? {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT_ID,
} : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 检查必要的安全凭证是否存在
export const isFirebaseInitialized = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

if (!isFirebaseInitialized) {
  console.error("🔥 [致命错误]: Firebase 配置未找到！请检查根目录是否存在 .env 文件且包含 VITE_ 变量。");
}

// 初始化 Firebase
export const app: FirebaseApp | null = isFirebaseInitialized ? initializeApp(firebaseConfig) : null;

/**
 * 生产环境防御性 Proxy 工厂
 * 既能抛出清晰的运行时错误，又能保持 TypeScript 的类型提示
 */
function createAuthProxy<T extends object>(instance: T | null, errorMessage: string): T {
  if (instance) return instance;
  return new Proxy({} as T, {
    get(_, prop) {
      // 允许控制台打印或工具库检查时读取常见属性，防止框架层崩掉
      if (prop === 'then' || prop === 'toJSON' || typeof prop === 'symbol') return undefined;
      throw new Error(`[御膳智控] ${errorMessage} (尝试访问了属性: ${String(prop)})`);
    }
  });
}

const firestoreInstance = app ? getFirestore(app) : null;
if (firestoreInstance && isEmulatorMode) {
  connectFirestoreEmulator(firestoreInstance, EMULATOR_HOST, 8080);
  console.warn(`🧪 [Emulator] Firestore → ${EMULATOR_HOST}:8080（项目 ${EMULATOR_PROJECT_ID}，不会写入正式资料）`);
}

// 导出具备类型保护的 Firestore 实例
export const db: Firestore = createAuthProxy<Firestore>(
  firestoreInstance,
  "Firestore 未能成功初始化。请检查您的 .env 环境变量配置。"
);

// 📱 iPhone：Safari / 主画面 PWA 的 IndexedDB 偶尔会「打不开也不报错」，
//    getAuth() 预设先用 IndexedDB，一卡住整个 App 就停在载入画面。
//    改成 localStorage 优先，IndexedDB 备用；旧的身份如果在 IndexedDB 里会自动搬过来。
const authInstance = app ? initializeAuth(app, { persistence: [browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence] }) : null;
if (authInstance && isEmulatorMode) {
  connectAuthEmulator(authInstance, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
}

// 导出具备类型保护的 Auth 实例
export const auth: Auth = createAuthProxy<Auth>(
  authInstance,
  "Firebase Auth 未能成功初始化。请检查您的 .env 环境变量配置。"
);

/**
 * 👑 匿名身份守卫 (Anonymous Identity Guard)
 * ---------------------------------------------------------------
 * 目的：让 firestore.rules 可以要求 request.auth != null，
 *      把公网上的自动扫描器挡在门外（他们没有身份，一律拒绝）。
 *
 * 对员工完全无感：不需要注册、不需要多输入任何东西。
 * 身份会存进浏览器 IndexedDB，之后每次开 App 直接沿用同一个身份。
 *
 * 注意：必须先在 Firebase Console 启用 Anonymous 登录方式。
 */
export const authReady: Promise<boolean> = (async () => {
  if (!app) return false;
  try {
    // 先看有没有已经存在的身份（离线也能读到，PWA 断网可正常启动）
    const hasExisting = await new Promise<boolean>((resolve) => {
      const unsub = onAuthStateChanged(
        auth,
        (user) => { unsub(); resolve(!!user); },
        () => { unsub(); resolve(false); }
      );
    });
    if (hasExisting) return true;

    // 第一次使用这台设备 —— 建立一个新的匿名身份
    await signInAnonymously(auth);
    console.log("🛡️ [安全] 匿名身份已建立");
    return true;
  } catch (err) {
    console.error("🔥 [匿名登录失败] Firestore 读写将被规则拒绝：", err);
    return false;
  }
})();