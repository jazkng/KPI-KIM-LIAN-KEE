import { initializeApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

/**
 * 御膳智控 - 安全加固版配置
 * 使用 import.meta.env 确保密钥不被硬编码在代码中
 */
const firebaseConfig = {
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

// 导出具备类型保护的 Firestore 实例
export const db: Firestore = createAuthProxy<Firestore>(
  app ? getFirestore(app) : null,
  "Firestore 未能成功初始化。请检查您的 .env 环境变量配置。"
);

// 导出具备类型保护的 Auth 实例
export const auth: Auth = createAuthProxy<Auth>(
  app ? getAuth(app) : null,
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