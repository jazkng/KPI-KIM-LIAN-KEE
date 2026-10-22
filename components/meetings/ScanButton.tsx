import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, X } from 'lucide-react';
import { parseCheckinCode } from '../../utils/meetings/meetingLogic';
import { requestCheckin } from './meetingEvents';

/**
 * 「扫一扫」小图标。按一下开相机扫签到码；
 * onLongPress：按住超过 3 秒触发（老板用来开 AI 经营顾问）。
 */
export const ScanButton: React.FC<{ className?: string; label?: string; iconSize?: number; onLongPress?: () => void; children?: React.ReactNode }> = ({ className, label = '扫一扫', iconSize = 18, onLongPress, children }) => {
    const [open, setOpen] = useState(false);
    const timer = useRef<number | null>(null), fired = useRef(false);
    const down = () => {
        fired.current = false;
        if (!onLongPress) return;
        timer.current = window.setTimeout(() => { fired.current = true; onLongPress(); }, 3000);
    };
    const up = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
    return <>
        <button type="button" aria-label={label} title={label} className={className}
            onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
            onContextMenu={e => onLongPress && e.preventDefault()}
            onClick={() => { if (!fired.current) setOpen(true); }}>
            {children || <ScanLine size={iconSize} />}
        </button>
        {open && <ScannerSheet onClose={() => setOpen(false)} />}
    </>;
};

/** 相机扫码：有 BarcodeDetector 就用（Android Chrome），没有就用 jsQR（iPhone） */
const ScannerSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const video = useRef<HTMLVideoElement>(null);
    const [err, setErr] = useState('');
    const closeRef = useRef(onClose); closeRef.current = onClose;
    useEffect(() => {
        let stream: MediaStream | null = null, raf = 0, stopped = false;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const done = (text: string) => {
            const type = parseCheckinCode(text);
            if (!type) { setErr('这不是签到码'); return false; }
            stopped = true; closeRef.current(); requestCheckin(type, 'APP_SCAN'); return true;
        };
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                if (!video.current || stopped) return;
                video.current.srcObject = stream;
                await video.current.play();
                const Detector = (window as any).BarcodeDetector;
                const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
                const jsQR = detector ? null : (await import('jsqr')).default;
                const tick = async () => {
                    if (stopped || !video.current) return;
                    const v = video.current;
                    if (v.readyState >= 2) {
                        if (detector) {
                            const codes = await detector.detect(v).catch(() => []);
                            if (codes[0]?.rawValue && done(codes[0].rawValue)) return;
                        } else if (jsQR && ctx) {
                            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                            ctx.drawImage(v, 0, 0);
                            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            const code = jsQR(img.data, img.width, img.height);
                            if (code?.data && done(code.data)) return;
                        }
                    }
                    raf = requestAnimationFrame(tick);
                };
                tick();
            } catch {
                setErr('打不开相机。请允许使用相机，或直接用手机相机扫墙上的 QR。');
            }
        })();
        return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
    }, []);
    return createPortal(
        <div className="fixed inset-0 z-[400] bg-black flex flex-col">
            <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 text-white">
                <b className="font-black">扫一扫</b>
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/15 grid place-items-center" aria-label="关闭"><X size={20} /></button>
            </div>
            <div className="relative flex-1 grid place-items-center overflow-hidden">
                <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <div className="relative w-64 h-64 rounded-3xl border-4 border-[#FFD200] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <p className="px-6 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center text-sm font-bold text-white/80">{err || '把墙上的会议 QR 放进框里'}</p>
        </div>, document.body);
};
