import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    // 🧪 Emulator 开关：命令行环境变量优先，其次 .env / .env.local。
    //    只对这两个键读取 .env 文件；正式 Firebase 配置的来源（process.env）保持不变。
    const fileEnv = loadEnv(mode, process.cwd(), 'VITE_');
    const useEmulator = process.env.VITE_USE_FIREBASE_EMULATOR ?? fileEnv.VITE_USE_FIREBASE_EMULATOR;
    const emulatorHost = process.env.VITE_FIREBASE_EMULATOR_HOST ?? fileEnv.VITE_FIREBASE_EMULATOR_HOST;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
        'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN),
        'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID),
        'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET),
        'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
        'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(process.env.VITE_FIREBASE_APP_ID),
        'import.meta.env.VITE_FIREBASE_MEASUREMENT_ID': JSON.stringify(process.env.VITE_FIREBASE_MEASUREMENT_ID),
        'import.meta.env.VITE_USE_FIREBASE_EMULATOR': JSON.stringify(useEmulator),
        'import.meta.env.VITE_FIREBASE_EMULATOR_HOST': JSON.stringify(emulatorHost),
      },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
        ],
      },
      build: {
        // 📱 明确支援到 iPhone iOS 14（Safari 14）
        target: ['es2020', 'safari14'],
        rollupOptions: {
          output: {
            // 以前全部打成一个 3MB 的 JS，iPhone 要整包下载 + 解析完才看得到画面。
            // 拆成几包：可以同时下载，而且改了 App 代码时，firebase / 图表这些不用重新下载。
            manualChunks(id: string) {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase';
              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/scheduler/')
              ) {
                return 'vendor-react';
              }
              return undefined;
            },
          },
        },
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          '@': path.resolve(__dirname, '.'),
          'react': path.resolve(__dirname, 'node_modules/react'),
          'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        }
      }
    };
});
