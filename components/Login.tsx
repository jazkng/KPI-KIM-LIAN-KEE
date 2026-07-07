import React, { useState, useEffect } from 'react';
import { UserRole, Employee } from '../types';
import { DataManager } from '../utils/dataManager';
import { DEFAULT_STAFF } from '../constants/staff';
import { Lock, User, ShieldCheck, Zap, Delete, Server, Unlock, ArrowLeft, CloudUpload, ShieldAlert } from 'lucide-react';

interface LoginProps {
    onLogin: (role: UserRole, employee?: Employee) => void;
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
    border: 1.5px dashed rgba(255, 215, 0, 0.4);
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
    background: radial-gradient(circle at 50% 25%, rgba(255, 215, 0, 0.08) 0%, transparent 60%);
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
    border: 1px solid rgba(255, 215, 0, 0.25);
    box-shadow: 0 25px 60px rgba(0,0,0,0.7);
  }

  .ripple-btn {
    position: relative;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 215, 0, 0.15);
    transition: all 0.2s;
  }
  
  .ripple-btn:active {
    transform: scale(0.95);
    background: rgba(255, 215, 0, 0.18);
    border-color: #FFD700;
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
    border: 4px solid #FFD700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    z-index: 20;
    box-shadow: 0 0 30px rgba(255,215,0,0.2);
    transition: all 0.3s;
  }
  
  .gate-lock-btn:hover {
    box-shadow: 0 0 60px rgba(255,215,0,0.6);
    transform: scale(1.05);
  }
  
  .gate-lock-btn.charging {
    animation: shakeHard 0.5s ease-in-out infinite;
    background: #FFD700;
    border-color: white;
  }
`;

// --- COMPONENTS ---

const KEY_LETTERS: Record<string, string> = {
    '1': ' ',
    '2': 'A B C',
    '3': 'D E F',
    '4': 'G H I',
    '5': 'J K L',
    '6': 'M N O',
    '7': 'P Q R S',
    '8': 'T U V',
    '9': 'W X Y Z',
};

const Keypad = ({ value, label, onInput, onDelete, onSubmit, isMasked = false, placeholder = "Enter ID", error }: any) => {
    const slotCount = label.includes('ID') ? 4 : 6;

    return (
        <div className={`w-full max-w-[340px] md:max-w-full mx-auto ${error ? 'shake-container' : ''}`}>
            {/* Upper label and discrete segmented code slots */}
            <div className="mb-4 md:mb-8 text-center relative">
                <label className={`text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] mb-3 md:mb-4 block font-serif ${label.includes('NEW') ? 'text-blue-400' : 'text-[#FFD700]/90'}`}>
                    {label}
                </label>
                
                {/* Segmented Display Input */}
                <div className="flex items-center justify-center gap-2 sm:gap-3 py-1.5 px-1 relative">
                    {Array.from({ length: slotCount }).map((_, idx) => {
                        const isFilled = idx < value.length;
                        const isActive = idx === value.length;
                        const valChar = isFilled ? value[idx] : '';
                        return (
                            <div 
                                key={idx}
                                className={`
                                    w-10 h-13 sm:w-12 sm:h-15 md:w-14 md:h-18 lg:w-16 lg:h-[4.8rem] 
                                    rounded-xl border flex items-center justify-center relative transition-all duration-300
                                    ${isFilled 
                                        ? 'border-[#FFD700] bg-gradient-to-b from-[#4a0404] to-[#1a0000] shadow-[0_0_15px_rgba(255,215,0,0.25)] scale-[1.03]' 
                                        : isActive 
                                            ? 'border-[#FFD700]/90 bg-black/50 shadow-[0_0_12px_rgba(255,215,0,0.18)] ring-1 ring-[#FFD700]/30 scale-[1.01]' 
                                            : 'border-white/10 bg-black/20 text-white/30'
                                    }
                                `}
                            >
                                {isFilled ? (
                                    <span className={`text-xl sm:text-2xl md:text-3xl font-mono font-black select-none ${error ? 'text-red-500 animate-pulse' : 'text-[#FFD700]'}`}>
                                        {isMasked ? '✦' : valChar}
                                    </span>
                                ) : isActive ? (
                                    <span className="w-[3px] h-6 md:h-8 bg-[#FFD700] rounded-full animate-pulse select-none"></span>
                                ) : (
                                    <span className="text-white/15 select-none text-xs md:text-sm">•</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="absolute -bottom-7 md:-bottom-9 left-0 w-full text-center text-red-300 text-[10px] md:text-xs font-bold tracking-widest uppercase animate-pulse bg-red-950/95 border border-red-800/40 py-1.5 rounded-lg shadow-lg z-10">
                        ⚠️ {error}
                    </div>
                )}
            </div>

            {/* Tactile Keypad Grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-3 md:mb-8">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
                    const letters = KEY_LETTERS[n.toString()] || '';
                    return (
                        <button 
                            key={n} 
                            onClick={() => onInput(n.toString())}
                            className="ripple-btn group/btn relative h-14 md:h-18 lg:h-[5.5rem] rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition-all duration-150 border border-white/5 shadow-md active:bg-[#FFD700]/15"
                        >
                            <span className="text-xl sm:text-2xl md:text-3xl font-serif font-black text-white group-hover/btn:text-[#FFD700] transition-colors">
                                {n}
                            </span>
                            {letters && (
                                <span className="text-[7px] md:text-[8px] font-mono tracking-[0.2em] text-white/30 group-hover/btn:text-[#FFD700]/50 uppercase mt-0.5 md:mt-1 scale-90">
                                    {letters}
                                </span>
                            )}
                        </button>
                    );
                })}
                <div className="flex items-center justify-center">
                    {value.length > 0 ? (
                        <button 
                            onClick={() => onInput('CLEAR')} 
                            className="text-[10px] md:text-xs text-[#FFD700]/70 font-semibold uppercase tracking-wider hover:text-red-400 transition-colors py-2 md:py-4 active:scale-95"
                        >
                            Clear
                        </button>
                    ) : (
                        <span className="text-[8px] text-white/10 uppercase font-mono tracking-widest">K.L.K</span>
                    )}
                </div>
                <button 
                    onClick={() => onInput('0')}
                    className="ripple-btn group/btn relative h-14 md:h-18 lg:h-[5.5rem] rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition-all duration-150 border border-white/5 shadow-md active:bg-[#FFD700]/15"
                >
                    <span className="text-xl sm:text-2xl md:text-3xl font-serif font-black text-white group-hover/btn:text-[#FFD700] transition-colors">0</span>
                    <span className="text-[7px] md:text-[8px] font-mono tracking-[0.15em] text-[#FFD700]/40 group-hover/btn:text-[#FFD700]/60 mt-0.5 md:mt-1">○</span>
                </button>
                <button 
                    onClick={onDelete}
                    className="ripple-btn h-14 md:h-18 lg:h-[5.5rem] rounded-xl sm:rounded-2xl text-white/40 hover:text-red-400 flex items-center justify-center active:scale-95 border border-white/5 hover:border-red-500/20 hover:bg-red-500/5 transition-all"
                >
                    <Delete size={20} className="md:w-7 md:h-7 opacity-80 hover:opacity-100"/>
                </button>
            </div>

            {/* Premium Gold Gilded Confirm Button */}
            <button 
                onClick={onSubmit}
                disabled={value.length === 0}
                className="shine-btn relative overflow-hidden w-full h-12 md:h-16 lg:h-[4.5rem] bg-gradient-to-r from-[#FFD700] via-[#FDB931] to-[#FFD700] text-[#4a0404] font-black text-xs sm:text-sm md:text-base uppercase tracking-[0.25em] rounded-xl md:rounded-2xl shadow-[0_4px_25px_rgba(255,215,0,0.3)] hover:shadow-[0_4px_45px_rgba(255,215,0,0.5)] active:scale-[0.97] transition-all disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center gap-3 border border-[#FFFFE0]/50 font-serif"
            >
                {label.includes('PIN') ? <Unlock size={18} className="md:w-5 md:h-5 text-[#4a0404]" strokeWidth={3}/> : <Zap size={18} className="md:w-5 md:h-5 text-[#4a0404]" strokeWidth={3} fill="currentColor"/>}
                {label.includes('PIN') ? (label.includes('NEW') ? 'Confirm New PIN' : 'UNLOCK PORTAL') : 'AUTHENTICATE ID'}
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
                    <Lock size={48} className="text-[#FFD700]" strokeWidth={2}/>
                </div>
            )}
            {gateState === 'CLOSED' && (
                <div className="mt-8 text-[#FFD700] font-serif tracking-[0.5em] text-xs uppercase opacity-70 animate-pulse font-bold">
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
  const [pendingLogin, setPendingLogin] = useState<{role: UserRole, emp?: Employee} | null>(null);

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

  useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        try {
            const list = await DataManager.getEmployees();
            const hasOwner = list.some(e => e.role.includes('Owner') || ['001', '002', '003', '004'].includes(e.id));
            if (list.length === 0 || !hasOwner) {
                setIsSystemEmpty(true);
            } else {
                setEmployees(list.map(e => ({ ...e, pin: e.pin || (e.role.includes('Owner') ? '8888' : '0000') })));
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

  const handleNumPad = (num: string) => {
    if (num === 'CLEAR') { setEnteredId(''); setEnteredPin(''); setError(''); return; }
    setError('');
    if (step === 'SELECT') { if (enteredId.length < 4) setEnteredId(prev => prev + num); return; }
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
      const emp = employees.find(e => e.id === enteredId); 
      if (emp) { setTargetEmployee(emp); setStep('PIN'); setEnteredPin(''); setError(''); } 
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
      const role = (emp.role.includes('Owner') || emp.role.includes('老板')) ? UserRole.BOSS : UserRole.STAFF;
      
      // AUTO-ROUTE: Detect management-level staff to upgrade their experience
      const roleTitle = emp.role.toLowerCase();
      const isManagementStaff = 
          roleTitle.includes('主管') || roleTitle.includes('supervisor') ||
          roleTitle.includes('店长') || roleTitle.includes('manager') ||
          roleTitle.includes('经理') || 
          roleTitle.includes('头手') || roleTitle.includes('head chef') ||
          emp.rank === 'MANAGEMENT' || emp.rank === 'HEAD' || emp.rank === 'TOP';
      
      if (isManagementStaff && role !== UserRole.BOSS) {
          // Upgrade to MANAGEMENT role for enhanced dashboard
          setPendingLogin({ role: UserRole.MANAGEMENT, emp });
      } else {
          setPendingLogin({ role, emp });
      }
      setGateState('CLOSED');
  };

  const handleBossDirectLogin = () => {
      const boss = employees.find(e => e.role.includes('Owner') && e.pin === bossPassword);
      if (boss) performLogin(boss); else setError('WRONG PIN');
  };

  if (portalMode === 'BOSS') {
      return (
        <div className="min-h-screen crimson-palace-bg flex items-center justify-center p-4 relative overflow-hidden font-sans text-white">
            <style>{LOGIN_STYLES}</style>
            <div className="smoke-layer"></div>
            <TransitionGate gateState={gateState} onLockClick={() => setGateState('OPENING')} />
            <div className={`glass-panel p-6 md:p-12 rounded-3xl w-full max-w-md md:max-w-lg relative z-20 animate-fade-in ${gateState !== 'HIDDEN' ? 'opacity-0' : ''} border border-[#FFD700]/30`}>
                <div className="text-center mb-8 md:mb-12">
                    <div className="w-20 h-20 md:w-32 md:h-32 border-4 border-[#FFD700] rounded-full flex items-center justify-center mx-auto mb-6 bg-primary shadow-[0_0_30px_#FFD700]">
                        <img src="https://i.imgur.com/ex06Jva.png" className="w-12 h-12 md:w-20 md:h-20 object-contain" />
                    </div>
                    <h1 className="text-xl md:text-3xl font-serif font-black text-[#FFD700] tracking-widest uppercase">御膳智控 <span className="text-[#FFD700]/80 text-[10px] md:text-sm block mt-2 font-sans">OWNER ACCESS</span></h1>
                </div>
                <form onSubmit={e => { e.preventDefault(); handleBossDirectLogin(); }} className={`space-y-6 md:space-y-8 ${error ? 'shake-container' : ''}`}>
                    <div className="relative">
                        <Lock className="absolute left-6 top-5 text-[#FFD700]/50" size={24} />
                        <input type="password" value={bossPassword} onChange={e => { setBossPassword(e.target.value); setError(''); }} className="w-full bg-black/40 border-2 border-[#FFD700]/30 rounded-2xl py-5 pl-16 text-[#FFD700] outline-none text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-normal focus:border-[#FFD700] transition-colors" placeholder="OWNER PIN" />
                    </div>
                    {error && <p className="text-red-400 text-sm text-center font-bold flex items-center justify-center gap-2"><ShieldAlert size={16}/> {error}</p>}
                    <button type="submit" className="w-full bg-gradient-to-r from-[#FFD700] to-[#FDB931] text-[#500000] font-black py-5 md:py-6 rounded-2xl shadow-lg flex items-center justify-center gap-3 tracking-widest uppercase active:scale-95 transition-all text-lg"><Zap size={24} fill="currentColor"/> Unlock</button>
                    <p className="text-center text-[10px] md:text-xs text-white/30 uppercase tracking-widest italic">Staff should use regular portal</p>
                </form>
                <div className="mt-8 md:mt-12 text-center"><button onClick={() => onSwitchPortal?.('STAFF')} className="text-white/40 text-xs font-bold hover:text-[#FFD700] transition-colors flex items-center justify-center gap-2 w-full p-4"><ArrowLeft size={16}/> 返回前台 (Staff Portal)</button></div>
            </div>
        </div>
      );
  }

  // --- RESPONSIVE MAIN LAYOUT ---
  // Updated for TABLET BALANCE: use lg:flex-row to keep md (tablet) in flex-col mode (vertical stack)
  return (
    <div className="min-h-screen crimson-palace-bg flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden font-sans text-white">
      <style>{LOGIN_STYLES}</style>
      <div className="smoke-layer"></div>
      <div className="gold-glow-background"></div>
      <TransitionGate gateState={gateState} onLockClick={() => setGateState('OPENING')} />

      {/* Main Container: Stack on mobile/tablet (flex-col), Row on Desktop (lg) */}
      <div className={`relative z-20 w-full max-w-7xl flex flex-col lg:flex-row items-center justify-center gap-8 md:gap-12 lg:gap-24 transition-all duration-700 ${gateState !== 'HIDDEN' ? 'opacity-0 translate-y-10 scale-95' : 'opacity-100'}`}>
        
        {/* BRANDING SECTION - Centered on mobile/tablet, Left on Desktop */}
        <div className="shrink-0 flex flex-col items-center lg:items-start text-center lg:text-left animate-in slide-in-from-left-10 duration-700">
            {/* Logo - INCREASED SIZE FOR TABLET (md) */}
            <div className="w-20 h-20 md:w-32 md:h-32 lg:w-64 lg:h-64 bg-primary rounded-2xl md:rounded-[2rem] flex items-center justify-center p-3 md:p-4 shadow-[0_0_40px_rgba(255,215,0,0.3)] md:shadow-[0_0_60px_rgba(255,215,0,0.3)] border-2 md:border-4 border-[#FFD700] mb-4 md:mb-8 relative group">
                <div className="vintage-gold-ring"></div>
                <div className="absolute inset-0 bg-[#FFD700]/5 opacity-0 group-hover:opacity-10 transition-opacity rounded-2xl md:rounded-[2rem]"></div>
                <img src="https://i.imgur.com/ex06Jva.png" alt="Logo" className="w-full h-full object-contain drop-shadow-2xl filter contrast-125 relative z-10"/>
            </div>
            
            {/* Title Text - INCREASED SIZE */}
            <h1 className="text-3xl md:text-5xl lg:text-7xl font-serif font-black text-[#FFD700] tracking-widest leading-none mb-1 md:mb-4 drop-shadow-lg" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.5)' }}>
                金莲记
            </h1>
            <p className="text-xs md:text-xl lg:text-3xl text-[#FFD700]/90 uppercase tracking-[0.3em] md:tracking-[0.4em] font-bold mb-3 md:mb-8 font-serif pl-1 md:pl-2">
                Kim Lian Kee
            </p>
            
            {/* Divider & Subtext - Centered on tablet, Left on Desktop */}
            <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-6 justify-center lg:justify-start">
                <div className="h-0.5 md:h-1 w-6 md:w-16 bg-[#FFD700]"></div>
                <span className="text-white/60 font-mono tracking-widest text-[9px] md:text-sm">SINCE 1927</span>
                <div className="h-0.5 md:h-1 w-6 md:w-16 bg-[#FFD700]"></div>
            </div>
            
            {/* Info Box (Hidden on small mobile to save space) */}
            <div className="hidden md:block bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-4 max-w-sm">
                <p className="text-xs lg:text-sm text-white/80 leading-relaxed font-bold">
                    Premium Enterprise Resource Planning<br/>
                    <span className="text-[#FFD700]">Kuala Lumpur · Malaysia</span>
                </p>
            </div>
        </div>

        {/* INTERACTION SECTION (Keypad) */}
        <div className="w-full max-w-[320px] md:max-w-[380px] lg:max-w-[440px] flex flex-col items-center justify-center relative transition-all duration-700 delay-100">
            {isLoading ? ( 
                <div className="text-[#FFD700] animate-pulse font-bold tracking-widest text-xl">CONNECTING...</div> 
            ) : isSystemEmpty ? (
                <div className="glass-panel p-8 rounded-3xl w-full border border-red-500/50 text-center">
                    <ShieldCheck size={48} className="text-[#FFD700] mx-auto mb-4" />
                    <h2 className="text-xl font-black mb-2">INIT SYSTEM</h2>
                    <button onClick={handleFirstRunInit} className="w-full py-4 bg-[#FFD700] text-black font-black rounded-xl">INITIALIZE</button>
                </div>
            ) : (
                <>
                    {step === 'SELECT' ? (
                        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-3xl md:rounded-[2.5rem] w-full border border-[#FFD700]/30 animate-fade-in relative shadow-2xl">
                            <Keypad value={enteredId} label="STAFF ID" onInput={handleNumPad} onDelete={handleBackspace} onSubmit={handleManualIdSubmit} placeholder="ID" error={error} />
                        </div>
                    ) : (
                        <div className={`glass-panel p-5 md:p-8 lg:p-10 rounded-3xl md:rounded-[2.5rem] w-full border animate-fade-in shadow-2xl ${step === 'CHANGE_PIN' ? 'border-blue-500' : 'border-[#FFD700]/30'}`}>
                            {step === 'CHANGE_PIN' && (
                                <div className="mb-4 p-4 bg-blue-900/30 border border-blue-500/50 rounded-2xl text-center">
                                    <p className="text-xs font-black text-blue-400 uppercase tracking-widest leading-relaxed">🔒 安全升级 (Security Upgrade)<br/>请设置您的 6 位新密码</p>
                                </div>
                            )}
                            <div className="text-center mb-6 relative flex items-center justify-center gap-4 bg-black/20 p-3 rounded-2xl border border-white/5">
                                <div className="w-14 h-14 rounded-full border-2 border-[#FFD700] p-0.5 bg-primary overflow-hidden shrink-0 shadow-lg">
                                    {targetEmployee?.avatar ? ( <img src={targetEmployee.avatar} className="w-full h-full object-cover rounded-full"/> ) : ( <div className="w-full h-full flex items-center justify-center text-2xl font-serif text-[#FFD700] bg-[#500000]">{targetEmployee?.name.charAt(0)}</div> )}
                                </div>
                                <div className="text-left"><h2 className="text-[#FFD700] text-lg font-black font-serif tracking-widest truncate max-w-[180px]">{targetEmployee?.name}</h2><p className="text-white/50 text-xs font-bold uppercase">{targetEmployee?.role.split('(')[0]}</p></div>
                            </div>

                            <Keypad 
                                value={step === 'PIN' ? enteredPin : (changePinStep === 'NEW' ? newPin : confirmPin)} 
                                label={step === 'PIN' ? "ENTER PIN" : (changePinStep === 'NEW' ? "SET NEW 6-DIGIT PIN" : "CONFIRM NEW PIN")} 
                                onInput={handleNumPad} 
                                onDelete={handleBackspace} 
                                onSubmit={step === 'PIN' ? handleSubmitPin : handleChangePinSubmit} 
                                isMasked={true} 
                                placeholder="••••••" 
                                error={error} 
                            />
                            <button onClick={() => {setStep('SELECT'); setEnteredPin(''); setNewPin(''); setConfirmPin('');}} className="mt-4 text-[#FFD700]/50 hover:text-[#FFD700] text-xs font-bold uppercase w-full flex items-center justify-center gap-2 py-3 rounded-xl hover:bg-white/5 transition-colors"><ArrowLeft size={14}/> BACK TO ID</button>
                        </div>
                    )}
                </>
            )}
        </div>

      </div>
      
      {/* Footer Info Mobile */}
      <div className="md:hidden w-full text-center text-white/10 text-[9px] font-bold tracking-[0.5em] pb-2 uppercase absolute bottom-4">Kim Lian Kee ERP System</div>
    </div>
  );
};