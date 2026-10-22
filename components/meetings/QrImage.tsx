import React, { useEffect, useState } from 'react';

/** 用到才下载 qrcode 套件 */
export const QrImage: React.FC<{ text: string; size?: number; className?: string }> = ({ text, size = 320, className }) => {
    const [src, setSrc] = useState('');
    useEffect(() => {
        let on = true;
        import('qrcode').then(m => (m.default || m).toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })).then(u => on && setSrc(u)).catch(() => undefined);
        return () => { on = false; };
    }, [text, size]);
    return src ? <img src={src} alt="QR" width={size} height={size} className={className} /> : <div style={{ width: size, height: size }} className={`bg-stone-100 animate-pulse rounded-xl ${className || ''}`} />;
};
