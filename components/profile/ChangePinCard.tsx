import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, serverAuthEnabled } from '../../firebaseConfig';
import type { Employee } from '../../types';

/**
 * 个人页：更改自己的登录 PIN（6 位数字）。要先输入旧 PIN。
 * 只改员工档案原有的 pin 栏位（同一种格式，V1 登录照样能用），不新增栏位。
 * 伺服器登录模式开启时，PIN 由伺服器管理，这里改为提示。
 */
const T = {
    zh: { title: '更改密码（PIN）', old: '旧 PIN', neu: '新 PIN（6 位数字）', again: '再输入一次新 PIN', save: '更改', ok: '已更改，下次登录用新 PIN', mismatch: '两次新 PIN 不一样', six: '新 PIN 要 6 位数字', weak: '这个 PIN 太简单，换一个', wrong: '旧 PIN 不对', server: '目前由伺服器管理登录，请登录时按提示更改，或请管理员重设。' },
    en: { title: 'Change PIN', old: 'Current PIN', neu: 'New PIN (6 digits)', again: 'Repeat new PIN', save: 'Change', ok: 'Changed. Use the new PIN next time.', mismatch: 'New PINs do not match', six: 'New PIN must be 6 digits', weak: 'PIN too simple', wrong: 'Current PIN is wrong', server: 'Login is managed by the server; ask an admin to reset.' },
    my: { title: 'PIN ပြောင်းရန်', old: 'လက်ရှိ PIN', neu: 'PIN အသစ် (ဂဏန်း ၆ လုံး)', again: 'PIN အသစ် ထပ်ရိုက်', save: 'ပြောင်း', ok: 'ပြောင်းပြီးပါပြီ', mismatch: 'PIN အသစ် မတူပါ', six: 'ဂဏန်း ၆ လုံး လိုသည်', weak: 'PIN လွယ်လွန်းသည်', wrong: 'လက်ရှိ PIN မှားနေသည်', server: 'စီမံခန့်ခွဲသူထံ ပြန်သတ်မှတ်ရန် တောင်းဆိုပါ' },
};
const WEAK = new Set(['000000', '111111', '123456', '654321', '888888', '000000']);

export const ChangePinCard: React.FC<{ employee: Employee; lang: string }> = ({ employee, lang }) => {
    const t = T[lang === 'my' ? 'my' : lang === 'en' ? 'en' : 'zh'];
    const [oldPin, setOld] = useState(''), [pin, setPin] = useState(''), [again, setAgain] = useState('');
    const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [serverMode, setServerMode] = useState(false);
    useEffect(() => { serverAuthEnabled.then(setServerMode).catch(() => setServerMode(false)); }, []);
    const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
    const save = async () => {
        setMsg(null);
        if (!/^\d{6}$/.test(pin)) return setMsg({ ok: false, text: t.six });
        if (WEAK.has(pin)) return setMsg({ ok: false, text: t.weak });
        if (pin !== again) return setMsg({ ok: false, text: t.mismatch });
        setBusy(true);
        try {
            const ref = doc(db, 'employees', employee.id);
            const snap = await getDoc(ref);
            // 跟登录页同一套：没设过 PIN 的人用默认值
            const data = snap.data() || {};
            const current = String(data.pin || (String(data.role || '').includes('Owner') ? '8888' : '0000'));
            if (!snap.exists() || current !== oldPin) { setMsg({ ok: false, text: t.wrong }); return; }
            await updateDoc(ref, { pin });
            setOld(''); setPin(''); setAgain(''); setMsg({ ok: true, text: t.ok });
        } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Error' }); }
        finally { setBusy(false); }
    };
    const box = 'w-full min-h-[46px] rounded-xl border border-stone-200 bg-stone-50 px-3 font-black tracking-[0.3em] placeholder:tracking-normal placeholder:font-bold text-[16px]';
    return <div className="p-5 rounded-2xl border border-stone-200 bg-white shadow-xs space-y-3">
        <h3 className="text-sm font-black text-stone-900 flex items-center gap-2"><KeyRound size={16} className="text-[#650707]" /> {t.title}</h3>
        {serverMode ? <p className="text-xs text-stone-500">{t.server}</p> : <>
            <input type="password" inputMode="numeric" autoComplete="current-password" value={oldPin} onChange={e => setOld(e.target.value.replace(/\D/g, ''))} placeholder={t.old} className={box} />
            <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e => setPin(digits(e.target.value))} placeholder={t.neu} className={box} />
            <input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={e => setAgain(digits(e.target.value))} placeholder={t.again} className={box} />
            {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
            <button onClick={save} disabled={busy || !oldPin || !pin || !again} className="w-full min-h-[48px] rounded-xl bg-[#650707] text-white font-black disabled:opacity-40 flex items-center justify-center gap-2">{busy && <Loader2 size={15} className="animate-spin" />}{t.save}</button>
        </>}
    </div>;
};
