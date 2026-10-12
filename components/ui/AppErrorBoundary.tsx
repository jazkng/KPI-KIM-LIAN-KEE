import React from 'react';

/**
 * 🛟 全 App 的安全网
 * ---------------------------------------------------------------------------
 * 以前任何一个画面出错（例如某支 iPhone 不支援的写法），React 会把整个 App 拆掉，
 * 画面就停在白屏 / 载入中，看起来像「卡住」。
 * 现在：出错时显示错误内容（可以截图给开发者）+ 「回到首页」「重新载入」两个按钮。
 */

/** 标记 App 已经跑起来 */
export const markAppMounted = () => {
    try {
        (window as any).__APP_MOUNTED__ = true;
    } catch {}
};

interface State {
    error: Error | null;
    where: string;
}

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { error: null, where: '' };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[AppErrorBoundary]', error, info?.componentStack);
        // 记下「出错的是哪个画面」，显示在错误卡上，方便截图定位
        const comp = String(info?.componentStack || '')
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean)
            .slice(0, 6)
            .join('\n');
        const stack = String(error?.stack || '')
            .split('\n')
            .slice(1, 4)
            .map(l => l.trim())
            .join('\n');
        this.setState({ where: [comp, stack].filter(Boolean).join('\n---\n') });
        try {
            localStorage.setItem('klk_last_crash', JSON.stringify({ at: new Date().toISOString(), message: String(error?.message || error), where: comp }));
        } catch {}
    }

    /** 回到首页：清掉「上次开着的模块」，避免一打开又进到出错的画面 */
    goHome = () => {
        try {
            Object.keys(localStorage)
                .filter(k => k.startsWith('klk_boss_active_modal') || k.startsWith('klk_prefill') || k.startsWith('klk_ap_highlight') || k.startsWith('klk_notification_log_target'))
                .forEach(k => localStorage.removeItem(k));
        } catch {}
        const url = new URL(window.location.href);
        window.location.replace(url.origin + url.pathname + (url.searchParams.get('portal') ? `?portal=${url.searchParams.get('portal')}` : ''));
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        return (
            <div
                style={{
                    minHeight: '100dvh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px 16px',
                    background: '#F6F7FB',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    boxSizing: 'border-box',
                }}
            >
                <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, border: '1px solid #E7E5E4', padding: 20, boxShadow: '0 10px 30px -12px rgba(0,0,0,0.2)' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#1C1917' }}>画面出了问题</div>
                    <p style={{ margin: '6px 0 12px', fontSize: 14, color: '#57534E', lineHeight: 1.6 }}>
                        先按「重新载入」或「回到首页」。如果还是一样，请把这个画面截图给开发者。
                    </p>
                    <pre
                        style={{
                            margin: 0,
                            padding: 12,
                            background: '#FAFAF9',
                            border: '1px solid #E7E5E4',
                            borderRadius: 12,
                            fontSize: 11.5,
                            color: '#B91C1C',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 240,
                            overflow: 'auto',
                        }}
                    >
                        {String(error?.message || error)}
                        {this.state.where && (
                            <>
                                {'\n\n'}
                                <span style={{ color: '#57534E' }}>{this.state.where}</span>
                            </>
                        )}
                        {'\n\n'}
                        <span style={{ color: '#78716C' }}>{ua}</span>
                    </pre>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button
                            onClick={this.goHome}
                            style={{ flex: 1, minHeight: 48, borderRadius: 12, border: '1px solid #D6D3D1', background: '#fff', fontSize: 15, fontWeight: 700, color: '#1C1917' }}
                        >
                            回到首页
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            style={{ flex: 1, minHeight: 48, borderRadius: 12, border: '1px solid #D6D3D1', background: '#fff', fontSize: 15, fontWeight: 700, color: '#1C1917' }}
                        >
                            重新载入
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
