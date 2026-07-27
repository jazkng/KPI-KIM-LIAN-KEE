import React, { useState, useEffect } from 'react';
import { PortalRole, Employee } from '../types';
import { DataManager } from '../utils/dataManager';
import { DEFAULT_STAFF } from '../constants/staff';
import { getPortalRole } from '../utils/orgAccess';
import { APP_VERSION } from '../constants/versionHistory';
import { Lock, User, ShieldCheck, Zap, Delete, Unlock, ArrowLeft, ShieldAlert, MonitorSmartphone, KeyRound, RotateCcw, ChevronRight, Loader2, MapPin } from 'lucide-react';

interface LoginProps {
    onLogin: (role: PortalRole, employee?: Employee) => void;
    portalMode: 'STAFF' | 'BOSS';
    onSwitchPortal: (mode: 'STAFF' | 'BOSS') => void;
}

// --- STYLES & ANIMATIONS ---
const LOGIN_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Noto+Serif+SC:wght@300;500;700;900&family=Inter:wght@400;600;800&display=swap');

  @keyframes smokeFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  @keyframes shakeHard {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
    20%, 40%, 60%, 80% { transform: translateX(8px); }
  }

  @keyframes slowRotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .vintage-gold-ring {
    position: absolute;
    width: 108%;
    height: 108%;
    border: 1.5px dashed rgba(255, 210, 0, 0.4);
    border-radius: inherit;
    animation: slowRotate 30s linear infinite;
    pointer-events: none;
    z-index: 0;
  }
  
  @keyframes goldGlow {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.55; }
  }
  .gold-glow-background {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 25%, rgba(255, 210, 0, 0.08) 0%, transparent 60%);
    pointer-events: none;
    z-index: 1;
    animation: goldGlow 8s ease-in-out infinite;
  }

  @keyframes shineSweep {
    0% { transform: translateX(-150%) skewX(-25deg); }
    100% { transform: translateX(150%) skewX(-25deg); }
  }
  
  .shine-btn {
    position: relative;
    overflow: hidden;
  }
  .shine-btn::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 200%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.45) 30%,
      rgba(255, 255, 255, 0.6) 50%,
      rgba(255, 255, 255, 0.45) 70%,
      transparent
    );
    animation: shineSweep 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    pointer-events: none;
  }

  .crimson-palace-bg {
    background-color: #4a0404;
    background-image: 
        radial-gradient(circle at 50% 100%, #8B0000 0%, #500000 50%, #2a0000 100%),
        url("https://www.transparenttextures.com/patterns/black-scales.png");
    position: relative;
  }

  .smoke-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 200%;
    height: 100%;
    background: url('https://raw.githubusercontent.com/SochavaAG/example-assets/master/fog.png') repeat-x;
    background-size: contain;
    opacity: 0.15;
    animation: smokeFlow 60s linear infinite;
    pointer-events: none;
    mix-blend-mode: overlay;
  }

  .glass-panel {
    background: rgba(22, 1, 1, 0.65); /* Darker glass for better contrast */
    backdrop-filter: blur(25px);
    -webkit-backdrop-filter: blur(25px);
    border: 1px solid rgba(255, 210, 0, 0.25);
    box-shadow: 0 25px 60px rgba(0,0,0,0.7);
  }

  .ripple-btn {
    position: relative;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 210, 0, 0.15);
    transition: all 0.2s;
  }
  
  .ripple-btn:active {
    transform: scale(0.95);
    background: rgba(255, 210, 0, 0.18);
    border-color: #FFD200;
  }

  .shake-container {
    animation: shakeHard 0.4s ease-in-out;
  }
  
  .energy-gate {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #2a0000;
    transition: opacity 0.8s ease-in-out;
  }
  
  .energy-gate.dissolved {
    opacity: 0;
    pointer-events: none;
  }

  .gate-lock-btn {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: #500000;
    border: 4px solid #FFD200;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    z-index: 20;
    box-shadow: 0 0 30px rgba(255,210,0,0.2);
    transition: all 0.3s;
  }
  
  .gate-lock-btn:hover {
    box-shadow: 0 0 60px rgba(255,210,0,0.6);
    transform: scale(1.05);
  }
  
  .gate-lock-btn.charging {
    animation: shakeHard 0.5s ease-in-out infinite;
    background: #FFD200;
    border-color: white;
  }
`;

// --- COMPONENTS ---

const Keypad = ({ value, label, onInput, onDelete, onSubmit, isMasked = false, placeholder = "Enter ID", error }: any) => {
    const isIdStep = label.includes('ID');
    const isSetPin = label.includes('SET NEW');
    const isConfirmPin = label.includes('CONFIRM');
    const slotCount = 6;
    const errorText: Record<string, string> = {
        'USER NOT FOUND': '找不到这个员工编号，请重新检查。',
        'ACCESS DENIED': 'PIN 不正确，请重新输入。',
        '6 DIGITS REQUIRED': '新 PIN 必须输入 6 位数字。',
        'INVALID PIN': '这个 PIN 不可使用，请设置其他号码。',
        'MISMATCH': '两次输入的 PIN 不一致。',
    };
    const displayError = errorText[error] || error;
    const title = isIdStep
        ? '员工登入'
        : isSetPin
            ? '设置新 PIN'
            : isConfirmPin
                ? '确认新 PIN'
                : '输入登入 PIN';
    const subtitle = isIdStep
        ? '输入员工编号，继续确认个人资料'
        : isSetPin || isConfirmPin
            ? '请使用 6 位数字保护你的员工户口'
            : '请输入你的 4–6 位数字 PIN';
    const submitText = isIdStep
        ? '继续 · Continue'
        : isSetPin
            ? '下一步 · Next'
            : isConfirmPin
                ? '确认新密码'
                : '登入 · Login';

    return (
        <div className={`w-full ${error ? 'shake-container' : ''}`}>
            <div className="mb-5 md:mb-6">
                <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isIdStep ? 'bg-[#FFD200] text-[#111111]' : 'bg-[#650707] text-white'}`}>
                        {isIdStep ? <User size={21} /> : <KeyRound size={21} />}
                    </div>
                    <div>
                        <p className="text-[10px] font-black tracking-[0.18em] text-stone-400 uppercase">{label}</p>
                        <h2 className="mt-0.5 text-xl md:text-2xl font-black text-[#111111]">{title}</h2>
                        <p className="mt-1 text-xs md:text-sm font-semibold text-stone-500">{subtitle}</p>
                    </div>
                </div>

                {isIdStep ? (
                    <div className="relative mt-5">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => onInput('SET_VALUE', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && value.length > 0) onSubmit(); }}
                            placeholder={placeholder || '例如：002 / ID002'}
                            autoFocus
                            autoComplete="username"
                            maxLength={20}
                            className="w-full h-16 rounded-2xl border-2 border-stone-200 bg-[#FAF9F6] pl-12 pr-4 text-center text-xl font-black font-mono tracking-[0.16em] text-[#111111] outline-none transition-all placeholder:tracking-normal placeholder:text-sm placeholder:font-semibold focus:border-[#650707] focus:bg-white focus:ring-4 focus:ring-[#650707]/8 uppercase"
                        />
                    </div>
                ) : (
                    <div className="mt-5 flex items-center justify-center gap-2 md:gap-3">
                        {Array.from({ length: slotCount }).map((_, idx) => {
                            const isFilled = idx < value.length;
                            const isActive = idx === value.length;
                            return (
                                <div
                                    key={idx}
                                    className={`w-10 h-12 md:w-12 md:h-14 rounded-xl border-2 flex items-center justify-center transition-all ${
                                        isFilled
                                            ? 'border-[#650707] bg-[#650707] shadow-[0_8px_20px_rgba(101,7,7,0.13)]'
                                            : isActive
                                                ? 'border-[#FFD200] bg-[#FFF9D9] ring-4 ring-[#FFD200]/15'
                                                : 'border-stone-200 bg-[#FAF9F6]'
                                    }`}
                                >
                                    {isFilled ? (
                                        <span className={`text-lg md:text-xl font-black select-none ${error ? 'text-red-200' : 'text-white'}`}>
                                            {isMasked ? '●' : value[idx]}
                                        </span>
                                    ) : isActive ? (
                                        <span className="w-0.5 h-5 bg-[#650707] rounded-full animate-pulse" />
                                    ) : (
                                        <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-xs font-bold text-red-700">
                        {displayError}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 md:gap-3 mb-4 md:mb-5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button
                        type="button"
                        key={n}
                        onClick={() => onInput(n.toString())}
                        className="h-16 md:h-[72px] rounded-2xl border border-stone-200 bg-[#FAF9F6] text-2xl md:text-3xl font-black text-[#111111] shadow-sm transition-all hover:border-[#FFD200] hover:bg-[#FFFBEA] active:scale-[0.96] active:bg-[#FFD200]"
                    >
                        {n}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => onInput('CLEAR')}
                    disabled={value.length === 0}
                    className="h-16 md:h-[72px] rounded-2xl border border-stone-200 bg-white text-xs font-black text-stone-500 flex items-center justify-center gap-1.5 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.96] disabled:opacity-35"
                >
                    <RotateCcw size={16} /> 清除
                </button>
                <button
                    type="button"
                    onClick={() => onInput('0')}
                    className="h-16 md:h-[72px] rounded-2xl border border-stone-200 bg-[#FAF9F6] text-2xl md:text-3xl font-black text-[#111111] shadow-sm transition-all hover:border-[#FFD200] hover:bg-[#FFFBEA] active:scale-[0.96] active:bg-[#FFD200]"
                >
                    0
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={value.length === 0}
                    className="h-16 md:h-[72px] rounded-2xl border border-stone-200 bg-white text-stone-500 flex items-center justify-center transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.96] disabled:opacity-35"
                >
                    <Delete size={23} />
                </button>
            </div>

            <button
                type="button"
                onClick={onSubmit}
                disabled={value.length === 0}
                className="w-full min-h-14 md:min-h-16 rounded-2xl bg-[#FFD200] px-5 py-3 text-sm md:text-base font-black text-[#111111] shadow-[0_12px_30px_rgba(255,210,0,0.22)] transition-all flex items-center justify-center gap-2 hover:bg-[#E5C100] active:scale-[0.98] disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none disabled:pointer-events-none"
            >
                {isIdStep ? <ChevronRight size={21} /> : <Unlock size={20} />}
                {submitText}
            </button>
        </div>
    );
};

const TransitionGate = ({ gateState, onLockClick }: any) => {
    if (gateState === 'HIDDEN') return null;
    return (
        <div className={`energy-gate ${gateState === 'ENTERING' ? 'dissolved' : ''}`}>
            {(gateState === 'CLOSED' || gateState === 'OPENING') && (
                <div className={`gate-lock-btn ${gateState === 'OPENING' ? 'charging' : ''}`} onClick={onLockClick}>
                    <Lock size={48} className="text-[#FFD200]" strokeWidth={2}/>
                </div>
            )}
            {gateState === 'CLOSED' && (
                <div className="mt-8 text-[#FFD200] font-serif tracking-[0.5em] text-xs uppercase opacity-70 animate-pulse font-bold">
                    点击进入系统 (Tap to Enter)
                </div>
            )}
        </div>
    );
};

export const Login: React.FC<LoginProps> = ({ onLogin, portalMode, onSwitchPortal }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [step, setStep] = useState<'SELECT' | 'PIN' | 'CHANGE_PIN'>('SELECT');
  const [gateState, setGateState] = useState<'HIDDEN' | 'CLOSED' | 'OPENING' | 'READY' | 'ENTERING'>('HIDDEN');
  const [pendingLogin, setPendingLogin] = useState<{role: PortalRole, emp?: Employee} | null>(null);

  const [enteredId, setEnteredId] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [bossPassword, setBossPassword] = useState(''); 
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changePinStep, setChangePinStep] = useState<'NEW' | 'CONFIRM'>('NEW');

  const [targetEmployee, setTargetEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSystemEmpty, setIsSystemEmpty] = useState(false);
  const [customLogo, setCustomLogo] = useState<string>('');

  useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        try {
            const cfg = await DataManager.getConfig();
            if (cfg?.logoUrl) setCustomLogo(cfg.logoUrl);

            const list = await DataManager.getEmployees();
            const activeList = list.filter(e => e.status !== 'TERMINATED' && e.isArchived !== true);
            const hasOwner = list.some(e => e.role.includes('Owner') || ['001', '002', '003', '004'].includes(e.id));
            if (list.length === 0 || !hasOwner) {
                setIsSystemEmpty(true);
            } else {
                setEmployees(activeList.map(e => ({ ...e, pin: e.pin || (e.role.includes('Owner') ? '8888' : '0000') })));
                setIsSystemEmpty(false);
            }
        } catch (e) {
            setIsSystemEmpty(true);
        } finally {
            setIsLoading(false);
        }
    };
    loadData();
  }, []);

  const handleFirstRunInit = async () => {
      if(!confirm("⚠️ 确认初始化？ ID: 001, 密码: 8888")) return;
      setIsLoading(true);
      try {
          await DataManager.syncLocalToCloud(DEFAULT_STAFF); 
          const list = await DataManager.getEmployees();
          setEmployees(list.map(e => ({ ...e, pin: e.pin || (e.role.includes('Owner') ? '8888' : '0000') })));
          setIsSystemEmpty(false);
          alert("✅ 初始化成功！");
      } catch (e) { alert("FAILED"); }
      setIsLoading(false);
  };

  useEffect(() => {
      if (gateState === 'OPENING') setTimeout(() => setGateState('READY'), 800);
      if (gateState === 'ENTERING' && pendingLogin) setTimeout(() => onLogin(pendingLogin.role, pendingLogin.emp), 800);
      if (gateState === 'READY') setGateState('ENTERING');
  }, [gateState, pendingLogin, onLogin]);

  const handleNumPad = (num: string, manualValue?: string) => {
    if (num === 'CLEAR') {
      if (step === 'SELECT') setEnteredId('');
      else if (step === 'PIN') setEnteredPin('');
      else if (changePinStep === 'NEW') setNewPin('');
      else setConfirmPin('');
      setError('');
      return;
    }
    setError('');
    if (num === 'SET_VALUE') {
      if (step === 'SELECT') {
        setEnteredId(manualValue || '');
      }
      return;
    }
    if (step === 'SELECT') { if (enteredId.length < 20) setEnteredId(prev => prev + num); return; }
    if (step === 'PIN') { if (enteredPin.length < 6) setEnteredPin(prev => prev + num); } 
    else if (step === 'CHANGE_PIN') {
        if (changePinStep === 'NEW') { if (newPin.length < 6) setNewPin(prev => prev + num); }
        else { if (confirmPin.length < 6) setConfirmPin(prev => prev + num); }
    }
  };

  const handleBackspace = () => {
      if (step === 'SELECT') setEnteredId(prev => prev.slice(0, -1));
      else if (step === 'PIN') setEnteredPin(prev => prev.slice(0, -1));
      else if (step === 'CHANGE_PIN') {
          if (changePinStep === 'NEW') setNewPin(prev => prev.slice(0, -1));
          else setConfirmPin(prev => prev.slice(0, -1));
      }
  };

  const handleManualIdSubmit = () => { 
      const normalizedId = enteredId.trim().toUpperCase();
      const digits = normalizedId.replace(/\D/g, '');
      const paddedDigits = digits ? digits.padStart(3, '0') : '';
      const possibleIds = new Set([
          normalizedId,
          digits,
          paddedDigits,
          digits ? `ID${digits}` : '',
          paddedDigits ? `ID${paddedDigits}` : '',
      ].filter(Boolean));
      const emp = employees.find(e => possibleIds.has(e.id.trim().toUpperCase()));
      if (emp) { setTargetEmployee(emp); setEnteredId(emp.id); setStep('PIN'); setEnteredPin(''); setError(''); } 
      else { setError('USER NOT FOUND'); } 
  };

  const handleSubmitPin = () => {
      if (!targetEmployee) return;
      const actualPin = targetEmployee.pin || (targetEmployee.role.includes('Owner') ? '8888' : '0000'); 
      if (enteredPin === actualPin) {
          if (enteredPin === '0000' && !targetEmployee.role.includes('Owner')) {
              setStep('CHANGE_PIN'); setChangePinStep('NEW'); return;
          }
          performLogin(targetEmployee);
      } else { setError('ACCESS DENIED'); setEnteredPin(''); }
  };

  const handleChangePinSubmit = async () => {
      if (changePinStep === 'NEW') {
          if (newPin.length < 6) { setError('6 DIGITS REQUIRED'); return; }
          if (newPin === '0000' || newPin === '8888') { setError('INVALID PIN'); return; }
          setChangePinStep('CONFIRM');
      } else {
          if (confirmPin !== newPin) { setError('MISMATCH'); setConfirmPin(''); return; }
          if (targetEmployee) {
              const updatedEmp = { ...targetEmployee, pin: confirmPin };
              await DataManager.saveEmployee(updatedEmp);
              performLogin(updatedEmp);
          }
      }
  };

  const performLogin = (emp: Employee) => {
      const portalRole = getPortalRole(emp);
      setPendingLogin({ role: portalRole, emp });
      setGateState('ENTERING');
  };

  const handleBossDirectLogin = () => {
      const boss = employees.find(e => getPortalRole(e) === PortalRole.BOSS && e.pin === bossPassword);
      if (boss) performLogin(boss); else setError('WRONG PIN');
  };

  if (portalMode === 'BOSS') {
      return (
        <div className="mobile-screen crimson-palace-bg flex items-center justify-center px-4 md:px-8 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] relative overflow-y-auto overflow-x-hidden font-sans text-white">
            <style>{LOGIN_STYLES}</style>
            <div className="smoke-layer"></div>
            <TransitionGate gateState={gateState} onLockClick={() => setGateState('OPENING')} />
            <div className={`glass-panel p-6 md:p-12 rounded-3xl w-full max-w-md md:max-w-lg relative z-20 animate-fade-in ${gateState !== 'HIDDEN' ? 'opacity-0' : ''} border border-[#FFD200]/30`}>
                <div className="text-center mb-8 md:mb-12">
                    <div className="w-20 h-20 md:w-32 md:h-32 border-4 border-[#FFD200] rounded-full flex items-center justify-center mx-auto mb-6 bg-primary shadow-[0_0_30px_#FFD200]">
                        <img src={customLogo || "https://i.imgur.com/ex06Jva.png"} className="w-12 h-12 md:w-20 md:h-20 object-contain" />
                    </div>
                    <h1 className="text-xl md:text-3xl font-serif font-black text-[#FFD200] tracking-widest uppercase">御膳智控 <span className="text-[#FFD200]/80 text-[10px] md:text-sm block mt-2 font-sans">OWNER ACCESS</span></h1>
                </div>
                <form onSubmit={e => { e.preventDefault(); handleBossDirectLogin(); }} className={`space-y-6 md:space-y-8 ${error ? 'shake-container' : ''}`}>
                    <div className="relative">
                        <Lock className="absolute left-6 top-5 text-[#FFD200]/50" size={24} />
                        <input type="password" value={bossPassword} onChange={e => { setBossPassword(e.target.value); setError(''); }} className="w-full bg-black/40 border-2 border-[#FFD200]/30 rounded-2xl py-5 pl-16 text-[#FFD200] outline-none text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-normal focus:border-[#FFD200] transition-colors" placeholder="OWNER PIN" />
                    </div>
                    {error && <p className="text-red-400 text-sm text-center font-bold flex items-center justify-center gap-2"><ShieldAlert size={16}/> {error}</p>}
                    <button type="submit" className="w-full bg-gradient-to-r from-[#FFD200] to-[#FDB931] text-[#500000] font-black py-5 md:py-6 rounded-2xl shadow-lg flex items-center justify-center gap-3 tracking-widest uppercase active:scale-95 transition-all text-lg"><Zap size={24} fill="currentColor"/> Unlock</button>
                    <p className="text-center text-[10px] md:text-xs text-white/30 uppercase tracking-widest italic">Staff should use regular portal · v{APP_VERSION}</p>
                </form>
                <div className="mt-8 md:mt-12 text-center"><button onClick={() => onSwitchPortal?.('STAFF')} className="text-white/40 text-xs font-bold hover:text-[#FFD200] transition-colors flex items-center justify-center gap-2 w-full p-4"><ArrowLeft size={16}/> 返回前台 (Staff Portal)</button></div>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F7F3EA] font-sans text-[#111111] overflow-x-hidden">
      <style>{LOGIN_STYLES}</style>
      <TransitionGate gateState={gateState} onLockClick={() => setGateState('OPENING')} />

      <div className={`min-h-[100dvh] grid grid-cols-1 lg:grid-cols-[minmax(360px,42%)_minmax(0,58%)] transition-all duration-500 ${gateState !== 'HIDDEN' ? 'opacity-0 scale-[0.99]' : 'opacity-100'}`}>
        <section className="relative overflow-hidden bg-[#650707] text-white px-5 md:px-8 lg:px-12 xl:px-16 py-6 md:py-8 lg:py-12 flex lg:min-h-[100dvh] items-center">
          <div className="absolute -top-32 -left-28 w-80 h-80 rounded-full border border-[#FFD200]/15" />
          <div className="absolute -top-20 -left-16 w-56 h-56 rounded-full bg-[#FFD200]/8 blur-2xl" />
          <div className="absolute -bottom-40 -right-32 w-96 h-96 rounded-full border border-[#FFD200]/10" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#390303]/45 to-transparent" />

          <div className="relative z-10 w-full max-w-xl mx-auto lg:mx-0">
            <div className="flex items-center lg:block gap-4 md:gap-5">
              <div className="w-20 h-20 md:w-24 md:h-24 lg:w-44 lg:h-44 rounded-[1.4rem] lg:rounded-[2rem] bg-[#FFD200] p-2.5 lg:p-5 shadow-[0_22px_60px_rgba(33,0,0,0.28)] shrink-0">
                <img src={customLogo || "https://i.imgur.com/ex06Jva.png"} alt="金莲记 Kim Lian Kee" className="w-full h-full object-contain drop-shadow-xl" />
              </div>

              <div className="lg:mt-8 min-w-0">
                <div className="inline-flex items-center rounded-full border border-[#FFD200]/25 bg-[#FFD200]/10 px-3 py-1.5 text-[10px] md:text-xs font-black tracking-[0.14em] text-[#FFD200]">
                  员工入口 · STAFF PORTAL
                </div>
                <h1 className="mt-3 lg:mt-5 text-3xl md:text-4xl lg:text-6xl font-serif font-black tracking-[0.08em] text-[#FFD200] leading-none">金莲记</h1>
                <p className="mt-2 text-xs md:text-sm lg:text-lg font-bold uppercase tracking-[0.28em] text-white/70">Kim Lian Kee</p>
              </div>
            </div>

            <div className="hidden md:block mt-7 lg:mt-10 max-w-md">
              <div className="flex items-center gap-3 text-xs font-bold text-white/55">
                <span className="h-px flex-1 bg-[#FFD200]/35" />
                <span className="tracking-[0.22em]">SINCE 1927</span>
                <span className="h-px flex-1 bg-[#FFD200]/35" />
              </div>
              <h2 className="mt-6 text-xl lg:text-2xl font-black leading-tight">御膳智控 · 每日营运工作入口</h2>
              <p className="mt-2 text-sm leading-6 font-semibold text-white/55">登入后系统会根据员工档案自动进入老板、管理层或员工页面，并套用个人默认语言。</p>

              <div className="mt-6 grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3.5">
                  <p className="text-[9px] font-black tracking-wider text-white/35">分店</p>
                  <p className="mt-1 text-sm font-black text-[#FFD200]">甲洞</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3.5">
                  <p className="text-[9px] font-black tracking-wider text-white/35">系统</p>
                  <p className="mt-1 text-sm font-black text-[#FFD200]">ERP</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3.5">
                  <p className="text-[9px] font-black tracking-wider text-white/35">状态</p>
                  <p className="mt-1 text-sm font-black text-emerald-300">在线</p>
                </div>
              </div>
            </div>
          </div>

          <p className="hidden lg:block absolute bottom-7 left-12 xl:left-16 text-[10px] font-bold tracking-[0.16em] text-white/25">KIM LIAN KEE GROUP · KUALA LUMPUR · v{APP_VERSION}</p>
        </section>

        <main className="relative min-h-[calc(100dvh-128px)] lg:min-h-[100dvh] px-4 md:px-8 lg:px-12 py-5 md:py-8 lg:py-10 flex flex-col">
          <div className="w-full max-w-[600px] mx-auto flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-xs font-black text-stone-500">
              <MapPin size={15} className="text-[#650707]" /> 甲洞分行 · Kepong Branch
            </div>
            <button
              type="button"
              onClick={() => onSwitchPortal?.('BOSS')}
              className="rounded-full border border-stone-200 bg-white px-3 py-2 text-[10px] md:text-xs font-black text-stone-500 shadow-sm transition-colors hover:border-[#650707]/25 hover:text-[#650707]"
            >
              老板登入 · Owner
            </button>
          </div>

          <div className="w-full max-w-[520px] mx-auto flex-1 flex flex-col justify-center py-5 md:py-7">
            <div className="mb-4 flex items-center justify-center gap-2">
              <div className={`h-8 rounded-full px-3 flex items-center gap-1.5 text-[10px] font-black ${step === 'SELECT' ? 'bg-[#650707] text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">1</span> 员工编号
              </div>
              <span className="w-6 h-px bg-stone-300" />
              <div className={`h-8 rounded-full px-3 flex items-center gap-1.5 text-[10px] font-black ${step !== 'SELECT' ? 'bg-[#650707] text-white' : 'bg-white text-stone-400 border border-stone-200'}`}>
                <span className="w-4 h-4 rounded-full bg-black/5 flex items-center justify-center">2</span> PIN
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-[1.75rem] border border-stone-200 bg-white p-10 text-center shadow-[0_24px_70px_rgba(54,35,13,0.08)]">
                <Loader2 size={34} className="mx-auto text-[#650707] animate-spin" />
                <p className="mt-4 text-sm font-black">正在连接员工资料……</p>
                <p className="mt-1 text-xs font-semibold text-stone-400">Connecting employee records</p>
              </div>
            ) : isSystemEmpty ? (
              <div className="rounded-[1.75rem] border border-red-200 bg-white p-7 md:p-9 text-center shadow-[0_24px_70px_rgba(54,35,13,0.08)]">
                <ShieldCheck size={42} className="mx-auto text-[#650707]" />
                <h2 className="mt-4 text-xl font-black">系统尚未初始化</h2>
                <p className="mt-2 text-sm font-semibold text-stone-500">请由负责人建立初始员工资料。</p>
                <button onClick={handleFirstRunInit} className="mt-5 w-full min-h-14 rounded-2xl bg-[#FFD200] text-[#111111] font-black">初始化系统</button>
              </div>
            ) : step === 'SELECT' ? (
              <div className="rounded-[1.75rem] border border-stone-200 bg-white p-5 md:p-7 shadow-[0_24px_70px_rgba(54,35,13,0.1)] animate-fade-in">
                <Keypad
                  value={enteredId}
                  label="STAFF ID"
                  onInput={handleNumPad}
                  onDelete={handleBackspace}
                  onSubmit={handleManualIdSubmit}
                  placeholder="例如：002 / ID002"
                  error={error}
                />
              </div>
            ) : (
              <div className="rounded-[1.75rem] border border-stone-200 bg-white p-5 md:p-7 shadow-[0_24px_70px_rgba(54,35,13,0.1)] animate-fade-in">
                {step === 'CHANGE_PIN' && (
                  <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-center">
                    <p className="text-xs font-black text-sky-800">安全升级 · 请设置你的 6 位新 PIN</p>
                  </div>
                )}

                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#650707] text-[#FFD200] flex items-center justify-center shrink-0 shadow-sm">
                    {targetEmployee?.avatar ? (
                      <img src={targetEmployee.avatar} alt={targetEmployee.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-black">{targetEmployee?.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black tracking-wider text-emerald-600">✓ 已找到员工</p>
                    <h2 className="mt-0.5 truncate text-lg font-black">{targetEmployee?.name}</h2>
                    <p className="truncate text-xs font-semibold text-stone-500">{targetEmployee?.id} · {targetEmployee?.role.split('(')[0]}</p>
                  </div>
                </div>

                <Keypad
                  value={step === 'PIN' ? enteredPin : (changePinStep === 'NEW' ? newPin : confirmPin)}
                  label={step === 'PIN' ? 'ENTER PIN' : (changePinStep === 'NEW' ? 'SET NEW 6-DIGIT PIN' : 'CONFIRM NEW PIN')}
                  onInput={handleNumPad}
                  onDelete={handleBackspace}
                  onSubmit={step === 'PIN' ? handleSubmitPin : handleChangePinSubmit}
                  isMasked={true}
                  placeholder="••••••"
                  error={error}
                />

                <button
                  type="button"
                  onClick={() => {
                    setStep('SELECT');
                    setTargetEmployee(null);
                    setEnteredPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setError('');
                  }}
                  className="mt-3 w-full rounded-xl py-3 text-xs font-black text-stone-400 flex items-center justify-center gap-2 transition-colors hover:bg-stone-50 hover:text-[#650707]"
                >
                  <ArrowLeft size={15} /> 返回员工编号
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('mode', 'device');
                window.location.assign(url.toString());
              }}
              className="mt-4 w-full min-h-[52px] rounded-2xl border border-stone-300 bg-white px-4 py-3 text-xs md:text-sm font-black text-stone-600 flex items-center justify-center gap-2 shadow-sm transition-all hover:border-[#650707]/30 hover:text-[#650707] active:scale-[0.99]"
            >
              <MonitorSmartphone size={17} />
              专用设备登入 · Device Login
            </button>

            <p className="mt-4 text-center text-[10px] md:text-xs font-semibold text-stone-400">登入后将自动套用员工档案中的页面权限与默认语言。</p>
          </div>

          <p className="w-full max-w-[600px] mx-auto text-center text-[9px] font-bold tracking-[0.12em] text-stone-300">KIM LIAN KEE ERP v{APP_VERSION} · SECURE EMPLOYEE ACCESS</p>
        </main>
      </div>
    </div>
  );
};
