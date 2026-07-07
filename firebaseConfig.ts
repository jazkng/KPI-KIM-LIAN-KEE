import { initializeApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";

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