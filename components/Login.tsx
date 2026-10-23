import React, { useState, useEffect } from 'react';
import { PortalRole, Employee } from '../types';
import { DataManager } from '../utils/dataManager';
import { DEFAULT_STAFF } from '../constants/staff';
import { getPortalRole } from '../utils/orgAccess';
import { changePinWithToken, fetchBranding, loginWithPin, serverAuthEnabled, type LoginResult } from '../utils/auth/serverAuth';
import { APP_VERSION } from '../constants/versionHistory';
import { Lock, User, Delete, ChevronRight, Loader2 } from 'lucide-react';

interface LoginProps {
    onLogin: (role: PortalRole, employee?: Employee) => void;
}

// --- STYLES & ANIMATIONS ---
const LOGIN_STYLES = `
  .klk-login { min-height:100svh; min-height:var(--login-viewport-height,100dvh); display:grid; grid-template-columns:minmax(280px,36%) 1fr; background:#f7f4ed; color:#26211d; }
  .klk-brand { background:#780d16; color:#f4cf94; padding:clamp(32px,5vw,80px); display:flex; flex-direction:column; justify-content:center; gap:36px; }
  .klk-brand img { width:min(100%,240px); height:auto; border-radius:16px; }
  .klk-brand h1 { font-size:clamp(30px,3vw,48px); font-weight:900; margin:12px 0; }
  .klk-eyebrow { font-size:11px; font-weight:800; letter-spacing:.12em; }
  .klk-brand-copy { font-size:18px; opacity:.85; } .klk-branch { font-size:12px; opacity:.7; }
  .klk-login-main { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px 20px; }
  .klk-login-content { width:100%; max-width:420px; margin:auto 0; }
  .klk-login-heading { margin-bottom:24px; } .klk-login-heading .klk-eyebrow { color:#8c6d55; }
  .klk-login-heading h2 { font-size:30px; font-weight:900; margin:8px 0; } .klk-login-heading>p:last-child { font-size:14px; color:#78716c; }
  .klk-login-card { background:white; border:1px solid #e8e0d6; border-radius:24px; padding:28px; box-shadow:0 16px 50px #50221a08; }
  .klk-steps { display:flex; align-items:center; gap:12px; color:#a8a29e; font-size:12px; margin-bottom:28px; } .klk-steps .active { color:#8c1720; font-weight:800; }
  .klk-field-label { display:block; font-size:14px; font-weight:800; margin-bottom:10px; }
  .klk-input { width:100%; height:56px; padding:0 16px; background:#fcfbf8; border:1.5px solid #ded6cd; border-radius:12px; font-size:18px; outline:none; scroll-margin:24px; }
  .klk-input:focus { border-color:#931d26; box-shadow:0 0 0 3px #931d2612; } .klk-input[aria-invalid=true] { border-color:#b91c1c; }
  .klk-submit { width:100%; min-height:52px; border-radius:12px; background:#8d1520; color:white; font-size:15px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:20px; padding:12px; }
  .klk-submit:disabled { background:#e7e2dc; color:#a8a29e; } .klk-submit:focus-visible,.klk-keyboard-toggle:focus-visible { outline:3px solid #d3a550; outline-offset:3px; }
  .klk-keyboard-toggle { display:block; min-height:44px; margin:12px auto -8px; color:#78716c; font-size:12px; }
  .klk-keypad { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:18px; } .klk-keypad button { min-height:48px; border:1px solid #e8e0d6; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px; }
  .klk-identity { display:flex; gap:8px; align-items:center; font-size:13px; margin-bottom:20px; } .klk-identity button { margin-left:auto; min-height:44px; color:#8d1520; }
  .klk-error { color:#b91c1c; font-size:13px; margin-top:10px; } .klk-pin-hint { font-size:12px; color:#78716c; margin-bottom:12px; }
  .klk-login-help { text-align:center; font-size:12px; color:#8a8177; margin-top:20px; } .klk-login-main footer { padding-top:24px; font-size:11px; color:#a8a29e; } .klk-login-main footer span { margin:0 8px; }
  @media(max-width:767px) {
    .klk-login { display:flex; flex-direction:column; padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px); }
    .klk-brand { flex-direction:row; align-items:center; justify-content:flex-start; gap:14px; padding:20px 24px 16px; background:transparent; color:#780d16; }
    .klk-brand img { width:76px; border-radius:10px; } .klk-brand h1 { font-size:23px; margin:0; } .klk-brand .klk-eyebrow { font-size:8px; margin-bottom:5px; } .klk-brand-copy,.klk-branch { display:none; }
    .klk-login-main { flex:1; padding:12px 20px 16px; } .klk-login-heading { margin-bottom:18px; } .klk-login-heading h2 { font-size:26px; }
    .klk-login-card { padding:22px; border-radius:20px; } .klk-steps { margin-bottom:22px; } .klk-login-main footer { padding-top:16px; }
  }
  @media(max-height:650px) and (max-width:767px) { .klk-brand { padding-top:12px; padding-bottom:8px; } .klk-brand img { width:56px; } .klk-login-heading { margin-bottom:12px; } .klk-login-heading h2 { font-size:22px; } .klk-login-card { padding:18px; } .klk-login-help { margin-top:12px; } }
  @media(prefers-reduced-motion:reduce) { .klk-login *, .energy-gate { animation:none!important; transition:none!important; } }

  .energy-gate { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; background:#780d16; transition:opacity .3s; }
  .energy-gate.dissolved { opacity:0; pointer-events:none; }
  .gate-lock-btn { color:#f4cf94; }
`;

// --- COMPONENTS ---

const Keypad = ({ value, label, onInput, onDelete, onSubmit, isMasked = false, placeholder, error, busy }: any) => {
    const isId = label.includes('ID');
    const [showKeyboard, setShowKeyboard] = useState(false);
    const errors: Record<string, string> = {
      'USER NOT FOUND': '找不到这个员工编号，请重新检查。',
      'ACCESS DENIED': 'PIN 不正确，请重新输入。',
      'ID OR PIN WRONG': '员工编号或 PIN 不正确，请重新输入。',
      '6 DIGITS REQUIRED': '新 PIN 必须输入 6 位数字。',
      'INVALID PIN': '这个 PIN 不可使用，请设置其他号码。',
      'MISMATCH': '两次输入的 PIN 不一致。',
      'LOCKED': '尝试次数过多，请稍后再试。',
    };
    const title = isId ? '员工编号' : label.includes('SET NEW') ? '设置 6 位新 PIN' : label.includes('CONFIRM') ? '再次确认新 PIN' : '登入 PIN';
    return <form onSubmit={e => { e.preventDefault(); if (value && !busy) onSubmit(); }}>
      <label className="klk-field-label" htmlFor="login-credential">{title}</label>
      {label.includes('SET NEW') && <p className="klk-pin-hint">首次登入，请设置个人 6 位 PIN。</p>}
      <input id="login-credential" type={isMasked ? 'password' : 'text'} inputMode={isId ? 'text' : 'numeric'} autoCapitalize="characters" spellCheck={false}
        autoComplete={isId ? 'username' : label.includes('NEW') || label.includes('CONFIRM') ? 'new-password' : 'current-password'}
        value={value} maxLength={isId ? 20 : 6} placeholder={isId ? placeholder : '输入 PIN'} disabled={busy}
        aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined}
        onChange={e => onInput('SET_VALUE', isId ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') : e.target.value.replace(/\D/g, '').slice(0,6))}
        className="klk-input" />
      {error && <p id="login-error" role="alert" className="klk-error">{errors[error] || error}</p>}
      <button className="klk-submit" type="submit" disabled={!value || busy}>{busy ? <><Loader2 size={18} className="animate-spin"/>正在登入…</> : <>{isId ? '继续' : label.includes('NEW') ? '继续确认' : '确认登入'}<ChevronRight size={18}/></>}</button>
      <button className="klk-keyboard-toggle" type="button" aria-expanded={showKeyboard} onClick={() => setShowKeyboard(v => !v)}>{showKeyboard ? '收起屏幕键盘' : '使用屏幕键盘'}</button>
      {showKeyboard && <div className="klk-keypad">{['1','2','3','4','5','6','7','8','9','CLEAR','0','DELETE'].map(n => <button type="button" key={n} disabled={busy} aria-label={n === 'DELETE' ? '删除一位' : n === 'CLEAR' ? '清除' : n} onClick={() => n === 'DELETE' ? onDelete() : onInput(n)}>{n === 'DELETE' ? <Delete size={20}/> : n === 'CLEAR' ? '清除' : n}</button>)}</div>}
    </form>;
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

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => document.documentElement.style.setProperty('--login-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
      document.documentElement.style.removeProperty('--login-viewport-height');
    };
  }, []);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [step, setStep] = useState<'SELECT' | 'PIN' | 'CHANGE_PIN'>('SELECT');
  const [gateState, setGateState] = useState<'HIDDEN' | 'CLOSED' | 'OPENING' | 'READY' | 'ENTERING'>('HIDDEN');
  const [pendingLogin, setPendingLogin] = useState<{role: PortalRole, emp?: Employee} | null>(null);

  const [enteredId, setEnteredId] = useState('');
  const [enteredPin, setEnteredPin] = useState('');

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changePinStep, setChangePinStep] = useState<'NEW' | 'CONFIRM'>('NEW');

  const [targetEmployee, setTargetEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSystemEmpty, setIsSystemEmpty] = useState(false);
  // 读取失败或找不到负责人时显示错误，绝不显示「初始化系统」（初始化会覆盖正式员工资料）
  const [loadError, setLoadError] = useState<'LOAD_FAILED' | 'NO_OWNER' | null>(null);

  // 🔐 CHG-05：服务端登录开通时，PIN 只送到服务端比对；登录前不读 Firestore
  const [serverMode, setServerMode] = useState(false);
  const [changeToken, setChangeToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        try {
            if (await serverAuthEnabled) {
                setServerMode(true);
                // 登录页不再取得员工名单（负责人 2026-10-23 选 b）：只取 Logo；员工输入自己的编号，由服务端比对
                const branding = await fetchBranding();

                if (branding.empty) setIsSystemEmpty(true);
                return;
            }
            // 门店设定（Logo）与员工名单同时读取，不再一前一后等待；任一失败的处理与原本相同
            const list = await DataManager.getEmployees();


            const activeList = list.filter(e => e.status !== 'TERMINATED' && e.isArchived !== true);
            const hasOwner = list.some(e => e.role.includes('Owner') || ['001', '002', '003', '004'].includes(e.id));
            if (list.length === 0) {
                // 只有「成功读取且确实为 0 位员工」才允许初始化
                setIsSystemEmpty(true);
            } else if (!hasOwner) {
                setLoadError('NO_OWNER');
            } else {
                setEmployees(activeList.map(e => ({ ...e, pin: e.pin || (e.role.includes('Owner') ? '8888' : '0000') })));
                setIsSystemEmpty(false);
            }
        } catch (e) {
            console.error('Failed to load employees', e);
            setLoadError('LOAD_FAILED');
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
          await DataManager.initializeEmptySystem(DEFAULT_STAFF);
          const list = await DataManager.getEmployees();
          setEmployees(list.map(e => ({ ...e, pin: e.pin || (e.role.includes('Owner') ? '8888' : '0000') })));
          setIsSystemEmpty(false);
          alert("✅ 初始化成功！");
      } catch (e) {
          if (e instanceof Error && e.message === 'SYSTEM_NOT_EMPTY') {
              // 页面载入后已有其他人建立员工资料：不初始化，改为重新载入
              setIsSystemEmpty(false);
              alert("系统已有员工资料，未执行初始化。页面将重新载入。");
              window.location.reload();
              return;
          }
          alert("FAILED");
      }
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
      } else if (step === 'PIN') setEnteredPin(manualValue || '');
      else if (changePinStep === 'NEW') setNewPin(manualValue || '');
      else setConfirmPin(manualValue || '');
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
      if (serverMode) {
          // 服务端登录：不在浏览器查名单，编号与 PIN 一起送服务端比对（找不到也只回「编号或 PIN 不正确」）
          if (!normalizedId) { setError('USER NOT FOUND'); return; }
          setTargetEmployee({ id: normalizedId, name: '', role: '' } as Employee);
          setEnteredId(normalizedId); setStep('PIN'); setEnteredPin(''); setError('');
          return;
      }
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

  /** 服务端登录的结果 → 画面 */
  const applyServerResult = (r: LoginResult, onMustChange: (token: string) => void) => {
      if (r.kind === 'OK') { performLogin(r.employee); return; }
      if (r.kind === 'MUST_CHANGE') {
          // 服务端回传的员工（编号、姓名、职位、头像）：改 PIN 时让员工确认是自己
          setTargetEmployee(r.employee as unknown as Employee);
          onMustChange(r.changeToken);
          return;
      }
      if (r.kind === 'LOCKED') setError('LOCKED');
      else if (r.kind === 'DENIED') setError(targetEmployee?.name ? 'ACCESS DENIED' : 'ID OR PIN WRONG');
      else setError(r.message);
  };

  const handleSubmitPin = async () => {
      if (!targetEmployee) return;
      if (serverMode) {
          if (busy) return;
          setBusy(true);
          const r = await loginWithPin(targetEmployee.id, enteredPin);
          setBusy(false);
          setEnteredPin('');
          applyServerResult(r, token => { setChangeToken(token); setStep('CHANGE_PIN'); setChangePinStep('NEW'); setNewPin(''); setConfirmPin(''); });
          return;
      }
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
          if (serverMode) {
              if (busy) return;
              setBusy(true);
              const r = await changePinWithToken(changeToken, confirmPin);
              setBusy(false);
              if (r.kind === 'ERROR' && r.message === 'INVALID PIN') { setError('INVALID PIN'); setNewPin(''); setConfirmPin(''); setChangePinStep('NEW'); return; }
              if (r.kind === 'DENIED' || (r.kind === 'ERROR' && /凭证/.test(r.message))) {
                  // 凭证过期：回到 PIN 步骤重新登录
                  setError(r.kind === 'ERROR' ? r.message : 'ACCESS DENIED'); setStep('PIN'); setEnteredPin(''); return;
              }
              applyServerResult(r, () => setError('ACCESS DENIED'));
              return;
          }
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

  return (
    <div className="klk-login">
      <style>{LOGIN_STYLES}</style>
      <TransitionGate gateState={gateState} onLockClick={() => setGateState('OPENING')} />
      <aside className="klk-brand">
        <img src="/brand/kimliankee-logo.png" alt="金莲记 Since 1927" />
        <div><p className="klk-eyebrow">KIM LIAN KEE · SINCE 1927</p><h1>金莲记EPR</h1><p className="klk-brand-copy">每日营运，从这里开始。</p></div>
        <p className="klk-branch">甲洞分行 · Kepong Branch</p>
      </aside>
      <main className="klk-login-main">
        <div className="klk-login-content">
          <div className="klk-login-heading"><p className="klk-eyebrow">员工工作入口 · STAFF ACCESS</p><h2>欢迎回来</h2><p>使用原有员工编号与 PIN 登入</p></div>
          <div className="klk-login-card" aria-busy={busy || isLoading}>
            {isLoading ? <div role="status" className="py-10 text-center"><Loader2 className="mx-auto animate-spin"/><p className="mt-4">正在连接登入服务…</p></div>
            : loadError ? <div role="alert" className="py-6 text-center"><p>暂时无法载入登入资料，请重试。</p><button className="klk-submit" onClick={() => window.location.reload()}>重新载入</button></div>
            : isSystemEmpty ? <div className="py-6 text-center"><p>系统尚未初始化，请联系负责人。</p>{!serverMode && <button className="klk-submit" onClick={handleFirstRunInit}>初始化系统</button>}</div>
            : <>
              <div className="klk-steps" aria-label="登入步骤"><span className={step === 'SELECT' ? 'active' : ''}>1 员工编号</span><span aria-hidden="true">—</span><span className={step !== 'SELECT' ? 'active' : ''}>2 PIN</span></div>
              {step !== 'SELECT' && <div className="klk-identity"><User size={20}/><span>员工编号 <strong>{targetEmployee?.id}</strong></span><button type="button" onClick={() => { setStep('SELECT'); setTargetEmployee(null); setEnteredPin(''); setNewPin(''); setConfirmPin(''); setError(''); }}>更换</button></div>}
              <Keypad key={step + changePinStep} value={step === 'SELECT' ? enteredId : step === 'PIN' ? enteredPin : changePinStep === 'NEW' ? newPin : confirmPin}
                label={step === 'SELECT' ? 'STAFF ID' : step === 'PIN' ? 'ENTER PIN' : changePinStep === 'NEW' ? 'SET NEW 6-DIGIT PIN' : 'CONFIRM NEW PIN'}
                onInput={handleNumPad} onDelete={handleBackspace} onSubmit={step === 'SELECT' ? handleManualIdSubmit : step === 'PIN' ? handleSubmitPin : handleChangePinSubmit}
                isMasked={step !== 'SELECT'} placeholder="例如：002 / ID002" error={error} busy={busy}/>
            </>}
          </div>
          <p className="klk-login-help">登入遇到问题？请联系主管或 HR。</p>
        </div>
        <footer>金莲记EPR <span>·</span> v{APP_VERSION}</footer>
      </main>
    </div>
  );
};
