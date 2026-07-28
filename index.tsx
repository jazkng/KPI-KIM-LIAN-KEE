import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { SystemDialogProvider } from './components/ui/SystemDialog';
import { authReady } from './firebaseConfig';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// 👑 建立身份期间的启动画面，避免白屏
const BootSplash = () => (
  <div style={{
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1A1A1A',
    color: '#FFD700',
    fontFamily: 'Inter, system-ui, sans-serif',
    gap: '18px',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  }}>
    <div style={{
      width: '44px',
      height: '44px',
      border: '3px solid rgba(255,215,0,0.2)',
      borderTopColor: '#FFD700',
      borderRadius: '50%',
      animation: 'spin 0.9s linear infinite',
    }} />
    <div style={{ fontSize: '13px', letterSpacing: '0.2em', opacity: 0.7 }}>
      正在建立安全连接…
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

root.render(<BootSplash />);

// 👑 最多等 8 秒；超时也照样进 App，绝不把系统卡死在开机画面
const bootGuard = Promise.race([
  authReady,
  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
]);

bootGuard.then((ok) => {
  if (!ok) {
    console.warn("⚠️ [启动] 未取得匿名身份，数据可能无法读取。请检查网络或 Console 的 Anonymous 开关。");
  }
  root.render(
    <SystemDialogProvider>
      <App />
    </SystemDialogProvider>
  );
});