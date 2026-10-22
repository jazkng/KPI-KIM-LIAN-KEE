import React, { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { compressPhoto } from '../../utils/tasks/staffTaskStore';

/** 选 / 拍照片（最多 max 张），压缩成小 JPEG；value 是 data URL 数组 */
export const TaskPhotoPicker: React.FC<{ value: string[]; onChange: (v: string[]) => void; max?: number; label: string }> = ({ value, onChange, max = 5, label }) => {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const add = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        try {
            const room = max - value.length;
            const list = await Promise.all([...files].slice(0, room).map(f => compressPhoto(f)));
            onChange([...value, ...list]);
        } catch (e: any) { alert(e?.message || '照片读取失败'); }
        finally { setBusy(false); if (input.current) input.current.value = ''; }
    };
    return <div className="flex flex-wrap gap-2">
        {value.map((src, i) => <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-200">
            <img src={src} className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center" aria-label="删除照片"><X size={13} /></button>
        </div>)}
        {value.length < max && <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 flex flex-col items-center justify-center gap-1 text-[10px] font-bold">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}<span className="px-1 text-center leading-tight">{label}</span>
        </button>}
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => add(e.target.files)} />
    </div>;
};
