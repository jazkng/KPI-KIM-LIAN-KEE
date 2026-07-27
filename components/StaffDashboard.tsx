import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Crown, BookOpen, Languages, AlertTriangle, User, Calendar, 
  Award, Clock, CheckCircle2, ChevronDown, ChevronUp, Check, LogOut, Shield, 
  MapPin, ChevronRight, CheckSquare, Sparkles, AlertOctagon, HelpCircle, 
  Smartphone, BookMarked, Settings, UserCheck, ShieldAlert
} from 'lucide-react';
import { SOPItem, Employee, RoleGuide, AttendanceRecord, AppModule, AppLanguage, normalizeLanguage } from '../types';
import { LanguageSelector } from './ui/LanguageSelector';
import { ROLE_SOP_DETAILS, MODULE_SYSTEM_TASKS, MODULE_DEFINITIONS } from './constants';
import { DEFAULT_ROLE_GUIDES, DEFAULT_ROLES } from '../constants/staff';
import { DataManager, DEFAULT_ATTENDANCE_SETTINGS, getTargetShiftForDate } from '../utils/dataManager';
import { mapRoleToCode, getChineseRoleName } from './utils';
import { AIOperationsAssistant } from './features/AIOperationsAssistant';
import { ManagerDashboard } from './AdminDashboard';
import { KitchenAlertModule } from './features/kitchen/KitchenAlertModule';
import { KitchenAlertNotifier } from './features/kitchen/KitchenAlertNotifier';
import { getBusinessDateString } from '../utils/dateHelper';
import { sortNavigationItems } from '../constants/moduleNavigation';
import { NotificationCenter } from './ui/NotificationCenter';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import { 
  st, 
  localizeStaffContent, 
  getStaffModuleLabel, 
  getStaffModuleDesc, 
  getStaffModuleGuide,
  StaffLang 
} from '../constants/staffTranslations';

interface StaffDashboardProps { 
  employee: Employee; 
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ employee }) => {
  const roleCode = mapRoleToCode(employee.role);
  const isPending = roleCode === 'PENDING';
  const defaultKey = 'Commis/Runner (马王)';

  // ──────────────────────────────────────────────────────────────────────────
  // STATES
  // ──────────────────────────────────────────────────────────────────────────
  // DYNAMIC THREE-LANGUAGE STATE ENGINE (zh_en | en | my)
  // ──────────────────────────────────────────────────────────────────────────
  const [lang, setLang] = useState<AppLanguage>(() => {
    if (employee?.preferredLanguage) {
      return normalizeLanguage(employee.preferredLanguage);
    }
    try {
      const saved = localStorage.getItem('kepong_erp_session_employee');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.preferredLanguage) return normalizeLanguage(parsed.preferredLanguage);
      }
    } catch (e) {}
    return 'zh_en';
  });

  useEffect(() => {
    if (employee?.preferredLanguage) {
      setLang(normalizeLanguage(employee.preferredLanguage));
    }
  }, [employee.preferredLanguage]);

  const handleLanguageSelect = async (newLang: AppLanguage) => {
    setLang(newLang);
    
    try {
      const savedEmp = localStorage.getItem('kepong_erp_session_employee');
      if (savedEmp) {
        const empObj = JSON.parse(savedEmp);
        empObj.preferredLanguage = newLang;
        localStorage.setItem('kepong_erp_session_employee', JSON.stringify(empObj));
      }
    } catch (e) {
      console.warn('Failed to update local preferred language', e);
    }
    
    try {
      await DataManager.updateEmployeePreferredLanguage(employee.id, newLang);
    } catch (err) {
      console.error('Failed to persist preferredLanguage in Firestore:', err);
    }
  };

  const [activeTab, setActiveTab] = useState<'TODAY' | 'ROSTER' | 'HANDBOOK' | 'PROFILE'>('TODAY');
  const [currentGuide, setCurrentGuide] = useState<RoleGuide>(DEFAULT_ROLE_GUIDES[defaultKey]);
  const [allowedModules, setAllowedModules] = useState<AppModule[]>([]);
  const [sopItems, setSopItems] = useState<SOPItem[]>([]);
  const [hasPendingTasks, setHasPendingTasks] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  
  // Shift & Attendance states
  const [todayRosterStatus, setTodayRosterStatus] = useState<string>('WORK');
  const [todayShiftTimes, setTodayShiftTimes] = useState<{ checkInStr: string; checkOutStr: string }>({ checkInStr: '15:00', checkOutStr: '02:00' });
  const [attendanceRecord, setAttendanceRecord] = useState<AttendanceRecord | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [rosterData3Days, setRosterData3Days] = useState<{ date: string; label: string; status: string }[]>([]);
  
  // Selected module for full screen Work Tools (hides bottom bar)
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(null);
  
  // Collapsible sections for SOP items
  const [expandedSopId, setExpandedSopId] = useState<string | null>(null);

  // Roster Calendar State
  const [rosterMonth, setRosterMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyRosterData, setMonthlyRosterData] = useState<Record<string, Record<string, string>>>({});
  const [monthlyNotes, setMonthlyNotes] = useState<Record<string, string>>({});

  const workModules: AppModule[] = sortNavigationItems(
    allowedModules || [],
    moduleKey => moduleKey,
  );
  
  // 1. Load Modules and Role Guide (Prefer Cloud Config)
  useEffect(() => {
     const initConfig = async () => {
         if (employee.allowedModules) {
             setAllowedModules(employee.allowedModules);
         } else {
             const currentRoleDef = DEFAULT_ROLES.find(r => r.title === employee.role);
             setAllowedModules(currentRoleDef?.allowedModules || []);
         }

         const config = await DataManager.getRoleConfig();
         const guidesSource = config?.guides ? { ...DEFAULT_ROLE_GUIDES, ...config.guides } : DEFAULT_ROLE_GUIDES;
         
         const findGuide = (source: Record<string, RoleGuide>) => {
            const exact = source[employee.role];
            if(exact) return exact;
            const fuzzyKey = Object.keys(source).find(k => k.includes(getChineseRoleName(employee.role)));
            if(fuzzyKey) return source[fuzzyKey];
            return source[defaultKey] || Object.values(source)[0];
         };
         
         setCurrentGuide(findGuide(guidesSource));
     };
     initConfig();
  }, [employee]);

  // 2. Load SOP Items (Cloud Sync)
  useEffect(() => {
    if (isPending) return;

    const initSOP = async () => {
        const dateStr = getBusinessDateString();

        const savedProgress = await DataManager.getSOPProgress(dateStr, employee.id);
        
        if (savedProgress) {
            setSopItems(savedProgress);
        } else {
            const config = await DataManager.getRoleConfig();
            const templates = config?.sops ? { ...ROLE_SOP_DETAILS, ...config.sops } : ROLE_SOP_DETAILS;
            const template = templates[roleCode] || templates['COMMIS'] || { start: { tasks: [] }, end: { tasks: [] } };
            
            const startItems = template.start?.tasks?.map((task: any, i: number) => ({ id: `start_${i}`, label: task.label, completed: false, standard: task.standard, why: task.why })) || [];
            const endItems = template.end?.tasks?.map((task: any, i: number) => ({ id: `end_${i}`, label: task.label, completed: false, standard: task.standard, why: task.why })) || [];
            
            const sysTasks: SOPItem[] = [];
            if (employee.allowedModules) {
                employee.allowedModules.forEach(mod => {
                    const tasks = MODULE_SYSTEM_TASKS[mod];
                    if (tasks) {
                        tasks.forEach((task, i) => {
                            sysTasks.push({ id: `auto_${mod}_${i}`, label: task.label, completed: false, standard: task.standard, why: task.why, isSystemTask: true });
                        });
                    }
                });
            }
            setSopItems([...startItems, ...endItems, ...sysTasks]);
        }
    };
    initSOP();
  }, [employee.id, roleCode, isPending, employee.allowedModules]);

  // 3. Load Shift and Attendance (Real Database) + 3 Days Roster list
  useEffect(() => {
    const fetchAttendanceAndRoster = async () => {
      setLoadingAttendance(true);
      try {
        const todayStr = getBusinessDateString();
        
        // Fetch only this employee's attendance for the current business date.
        const myAtt = await DataManager.getAttendanceByEmployeeAndDate(employee.id, todayStr);
        setAttendanceRecord(myAtt);

        // Fetch Roster (3 Days)
        const { roster, notes } = await DataManager.getRosterData();
        setMonthlyNotes(notes || {});
        setMonthlyRosterData(roster || {});

        const dates = [];
        const baseBusinessDate = new Date(todayStr);
        for (let i = 0; i < 3; i++) {
          const d = new Date(baseBusinessDate);
          d.setDate(baseBusinessDate.getDate() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dateD = String(d.getDate()).padStart(2, '0');
          dates.push(`${y}-${m}-${dateD}`);
        }

        const roster3 = dates.map((dStr, idx) => {
          const status = (roster[dStr] || {})[employee.id] || '暂无排班';
          const label = idx === 0 ? 'today' : idx === 1 ? 'tomorrow' : 'dayAfterTomorrow';
          return { date: dStr, label, status };
        });
        setRosterData3Days(roster3);
        setTodayRosterStatus(roster3[0]?.status || '暂无排班');

        // Fetch Settings & calculate shift times
        const settings = await DataManager.getAttendanceSettings();
        const currentSettings = settings || DEFAULT_ATTENDANCE_SETTINGS;
        const shiftInfo = getTargetShiftForDate(todayStr, currentSettings, employee.shiftGroup || 1);
        setTodayShiftTimes({
          checkInStr: shiftInfo.checkInStr,
          checkOutStr: shiftInfo.checkOutStr
        });

      } catch (err) {
        console.error('Failed to load roster or attendance:', err);
      } finally {
        setLoadingAttendance(false);
      }
    };

    fetchAttendanceAndRoster();
  }, [employee.id, employee.shiftGroup]);

  // 4. Subscribe only to this employee's pending inventory task.
  // The staff home only needs a yes/no flag, so one matching document is enough.
  useEffect(() => {
    setHasPendingTasks(false);

    const pendingTaskQuery = query(
      collection(db, 'inventory_tasks'),
      where('assigneeId', '==', employee.id),
      where('status', '==', 'PENDING'),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      pendingTaskQuery,
      snapshot => {
        setHasPendingTasks(!snapshot.empty);
      },
      error => {
        console.error('Pending inventory task listener failed:', error);
      }
    );

    return unsubscribe;
  }, [employee.id]);

  // ──────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ──────────────────────────────────────────────────────────────────────────
  const toggleSOP = async (id: string) => {
    const newItems = sopItems.map(item => item.id === id ? { ...item, completed: !item.completed } : item);
    setSopItems(newItems);
    
    const dateStr = getBusinessDateString();
    await DataManager.saveSOPProgress(dateStr, employee.id, newItems);
  };

  const handleLogoutClick = () => {
    localStorage.removeItem('kepong_erp_session_role');
    localStorage.removeItem('kepong_erp_session_employee');
    window.location.reload();
  };

  // Stats
  const totalTasks = sopItems.length;
  const completedTasks = sopItems.filter(item => item.completed).length;
  const taskProgressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const nextPendingTask = sopItems.find(item => !item.completed);

  const isConfirmed = employee.status === 'CONFIRMED';

  const openOperationalLogFromNotification = (logId: string) => {
    try {
      localStorage.setItem('klk_notification_log_target', logId);
    } catch {}
    if ((allowedModules || []).includes('LOGBOOK')) {
      setSelectedModule('LOGBOOK');
    }
  };

  const kitchenAlertNotifier = workModules.includes('KITCHEN_ALERT') ? (
    <KitchenAlertNotifier
      employee={employee}
      lang={lang}
      disabled={selectedModule === 'KITCHEN_ALERT'}
      onOpen={() => setSelectedModule('KITCHEN_ALERT')}
    />
  ) : null;

  // SOP Task categorizations
  const openingSops = sopItems.filter(item => item.id.startsWith('start_'));
  const operatingSops = sopItems.filter(item => item.id.startsWith('auto_'));
  const closingSops = sopItems.filter(item => item.id.startsWith('end_'));

  // ──────────────────────────────────────────────────────────────────────────
  // WORK TOOLS IF OPEN (Full screen overlay, hides bottom navigation)
  // ──────────────────────────────────────────────────────────────────────────
  if (selectedModule) {
    // Inject INVENTORY_CHECK if it is temporary and hasPendingTasks is true
    const displayModules = [...workModules];
    if (hasPendingTasks && !displayModules.includes('INVENTORY_CHECK')) {
      displayModules.push('INVENTORY_CHECK');
    }

    const modInfo = MODULE_DEFINITIONS[selectedModule];
    
    return (
      <div className="fixed inset-0 bg-[#F6F7FB] z-[999] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {kitchenAlertNotifier}
        {/* Top return bar */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm z-50 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <button 
            onClick={() => setSelectedModule(null)}
            className="flex items-center gap-1.5 text-[#111111] font-extrabold text-xs bg-gray-100 hover:bg-gray-200 active:scale-95 px-3 py-2 rounded-xl transition-all"
            style={{ minHeight: '44px' }}
          >
            <span>👈</span>
            <span>{st('返回工作台', lang)}</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <h4 className="font-black text-xs text-[#111111]">{getStaffModuleLabel(selectedModule, lang, modInfo?.label)}</h4>
              <p className="text-[9px] text-gray-400 font-bold uppercase">{employee.name}</p>
            </div>
          </div>
        </div>

        {/* The active tool view */}
        <div className="p-1">
          {selectedModule === 'KITCHEN_ALERT' ? (
            <KitchenAlertModule employee={employee} lang={lang} />
          ) : (
            <ManagerDashboard 
                allowedModules={displayModules} 
                initialTab={modInfo?.tab as any} 
                onBack={() => setSelectedModule(null)} 
                currentEmployee={employee} 
                isSingleMode={true}
                lang={lang}
            />
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MAIN RENDER WITH BOTTOM NAVIGATION
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F6F7FB] font-sans pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-6 relative text-[#111111]">
      {kitchenAlertNotifier}
      
      {/* ────────────────────────────────────────────────────────────────────────
          HEADER BRANDING & IDENT Zone (safe-area adapted)
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#111111] text-white pt-[calc(env(safe-area-inset-top)+1rem)] pb-10 rounded-b-[2rem] border-b-4 border-[#FFD200] relative overflow-hidden shadow-lg">
        {/* Subtle geometric grid background */}
        <div className="absolute inset-0 opacity-5 bg-[linear-gradient(45deg,#ffffff_25%,transparent_25%),linear-gradient(-45deg,#ffffff_25%,transparent_25%)] bg-[size:20px_20px]"></div>
        
        <div className="max-w-xl mx-auto px-4 relative z-10 flex flex-col gap-4">
          
          {/* Top Utilities (Branch & Language, notifications) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-full select-none">
              <MapPin size={12} className="text-[#FFD200]" />
              <span className="text-[9px] font-extrabold tracking-wider uppercase text-gray-200">
                {employee.department ? localizeStaffContent(employee.department, lang) : "KEPONG HQ"}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {activeTab === 'TODAY' && (
                <NotificationCenter
                  employee={employee}
                  onOpenLog={openOperationalLogFromNotification}
                  variant="dark"
                />
              )}

              {/* 3-Way Language Selector */}
              <LanguageSelector currentLang={lang} onSelectLang={handleLanguageSelect} dark={true} />
            </div>
          </div>

          {/* Profile Quick Snapshot */}
          <div className="flex items-center gap-4 pt-2">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-stone-800 border-2 border-[#FFD200] shadow-inner flex items-center justify-center text-xl font-serif font-black text-[#FFD200] overflow-hidden">
                {employee.avatar ? (
                  <img src={employee.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  employee.name.charAt(0)
                )}
              </div>
              {employee.isQualityStaff && (
                <div className="absolute -top-1 -right-1 bg-[#FFD200] p-1 rounded-full text-black shadow-md border border-white">
                  <Crown size={10} className="fill-current" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-grow">
              <div className="flex items-center gap-2">
                <h1 className="font-serif font-black text-lg tracking-wide text-white truncate">
                  {employee.name}
                </h1>
                {employee.isQualityStaff && (
                  <span className="bg-[#FFD200]/10 text-[#FFD200] border border-[#FFD200]/30 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                    ⭐ VIP STAFF
                  </span>
                )}
              </div>
              
              <div className="text-[11px] font-bold text-gray-300 mt-0.5 tracking-wider flex items-center gap-1.5">
                <span className="uppercase text-[#FFD200]">{st(employee.role, lang)}</span>
                <span className="text-gray-500">•</span>
                <span className="font-mono text-[10px]">ID: {employee.id}</span>
              </div>
            </div>

            {/* Confirmed / Probation badge */}
            <div className="shrink-0 text-right">
              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${
                isConfirmed ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20' : 'bg-[#FFD200]/10 text-[#FFD200] border-[#FFD200]/20'
              }`}>
                {isConfirmed ? st('confirmed', lang) : st('probation', lang)}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB VIEWS ROUTER
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto px-4 -mt-5 relative z-20 flex flex-col gap-5">
        
        {/* ==========================================
            TAB 1: TODAY WORKPLACE (今日工作台)
            ========================================== */}
        {activeTab === 'TODAY' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            
            {/* 1. Today Shift Card */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[#FFD200]" />
                  <h3 className="font-black text-sm text-[#111111]">{st('todayShift', lang)}</h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-gray-400">
                  {getBusinessDateString()}
                </span>
              </div>

              {/* Roster & Times list */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-400 font-bold uppercase">{st('position', lang)}</p>
                  <p className="font-bold text-xs text-[#111111]">
                    {st(employee.role, lang)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[9px] text-gray-400 font-bold uppercase">{st('workHours', lang)}</p>
                  <p className="font-bold text-xs text-[#111111] font-mono">
                    {todayShiftTimes.checkInStr} - {todayShiftTimes.checkOutStr}
                  </p>
                </div>

                <div className="space-y-1 col-span-2">
                  <p className="text-[9px] text-gray-400 font-bold uppercase">{st('status', lang)}</p>
                  <div className="flex items-center gap-2 pt-0.5">
                    {todayRosterStatus === 'OFF' ? (
                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                        💤 {st('restDay', lang)}
                      </span>
                    ) : todayRosterStatus === '暂无排班' ? (
                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                        ❔ {st('noSchedule', lang)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-green-500/10 text-[#22C55E] text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                        ✅ {st('onDuty', lang)}
                      </span>
                    )}

                    {/* Clock-in stamp */}
                    {attendanceRecord?.clockIn && (
                      <span className="text-[9px] bg-blue-500/10 text-blue-600 font-bold px-2 py-0.5 rounded-full">
                        In: {new Date(attendanceRecord.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}

                    {attendanceRecord?.clockOut && (
                      <span className="text-[9px] bg-[#FFD200]/10 text-amber-600 font-bold px-2 py-0.5 rounded-full">
                        Out: {new Date(attendanceRecord.clockOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                {attendanceRecord?.clockIn && attendanceRecord?.clockOut ? (
                  <div className="w-full bg-green-50 text-green-600 border border-green-100 text-xs font-bold py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={13} className="text-[#22C55E]" />
                    <span>{st('attendanceCompleted', lang)}</span>
                  </div>
                ) : attendanceRecord?.clockIn ? (
                  <div className="w-full bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                    <Clock size={13} />
                    <span>{st('clockedInWaiting', lang)}</span>
                  </div>
                ) : todayRosterStatus === 'OFF' ? (
                  <div className="w-full bg-gray-50 text-gray-500 border border-gray-100 text-xs font-bold py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                    <span>{st('restDayNoPunch', lang)}</span>
                  </div>
                ) : todayRosterStatus === '暂无排班' ? (
                  <div className="w-full bg-gray-50 text-gray-400 border border-gray-100 text-xs font-bold py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                    <span>{st('noRosterTip', lang)}</span>
                  </div>
                ) : (
                  <div className="w-full bg-amber-50 text-amber-700 border border-amber-100 text-xs font-bold py-2.5 rounded-xl text-center flex flex-col items-center justify-center gap-1">
                    <span className="flex items-center gap-1">🕒 <span>{st('waitingManagerConfirmation', lang)}</span></span>
                    <span className="text-[10px] text-gray-400 font-normal">{st('waitingDeviceSub', lang)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Authorized Work Tools (Grid - touch targets >= 48px) */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="font-black text-sm text-[#111111] flex items-center gap-2">
                  <Smartphone size={16} className="text-[#FFD200]" />
                  <span>{st('tools', lang)}</span>
                </h3>
                <span className="text-[9px] bg-green-500/10 text-green-600 font-extrabold px-2 py-0.5 rounded-full border border-green-500/20">
                  {workModules.length} Active
                </span>
              </div>

              {(() => {
                const hasTempInventory = hasPendingTasks && !workModules.includes('INVENTORY_CHECK');
                const totalActiveCount = workModules.length + (hasTempInventory ? 1 : 0);

                if (totalActiveCount === 0) {
                  return <p className="text-center text-xs text-gray-400 py-4 italic">{st('unauthorized', lang)}</p>;
                }

                return (
                  <div className="grid grid-cols-2 gap-3">
                    {workModules.map(modKey => {
                      const info = MODULE_DEFINITIONS[modKey];
                      if (!info) return null;
                      const Icon = info.icon;
                      return (
                        <button 
                          key={modKey}
                          onClick={() => {
                            if (modKey === 'AI_ASSISTANT') {
                              setAiOpen(true);
                            } else if (MODULE_DEFINITIONS[modKey]?.tab) {
                              setSelectedModule(modKey);
                            }
                          }}
                          className="bg-gray-50/50 hover:bg-[#FFD200]/5 active:scale-95 border border-gray-100 hover:border-[#FFD200]/40 transition-all p-3.5 rounded-2xl text-left flex flex-col gap-2 relative min-h-[48px] overflow-hidden group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#FFD200] border border-gray-200 shadow-sm">
                            <Icon size={16} />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-[#111111] truncate group-hover:text-amber-600">{getStaffModuleLabel(modKey, lang, info.label)}</h4>
                            <p className="text-[9px] text-gray-400 font-bold truncate">{getStaffModuleDesc(modKey, lang, info.desc)}</p>
                          </div>
                        </button>
                      );
                    })}

                    {hasTempInventory && (
                      <button 
                        onClick={() => setSelectedModule('INVENTORY_CHECK')}
                        className="bg-amber-50/40 hover:bg-[#FFD200]/10 active:scale-95 border border-amber-200/50 hover:border-[#FFD200]/60 transition-all p-3.5 rounded-2xl text-left flex flex-col gap-2 relative min-h-[48px] overflow-hidden group"
                      >
                        <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[7px] px-1 py-0.5 rounded font-black tracking-wider uppercase">
                          {st('tempTasks', lang)}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-amber-500 border border-amber-200 shadow-sm">
                          📦
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-[#111111] truncate">{st('inventoryTasks', lang)}</h4>
                          <p className="text-[9px] text-amber-600 font-bold truncate">{st('pendingInvAlert', lang)}</p>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 3. Today's Tasks & Progress */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-[#FFD200]" />
                  <h3 className="font-black text-sm text-[#111111]">{st('taskProgress', lang)}</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-stone-950 font-mono">
                    {completedTasks}/{totalTasks}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#22C55E] h-full transition-all duration-500"
                    style={{ width: `${taskProgressPct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                  <span>Progress</span>
                  <span>{taskProgressPct}%</span>
                </div>
              </div>

              {/* Next Task Notice */}
              {nextPendingTask ? (
                <div className="bg-[#FFD200]/5 border border-[#FFD200]/25 rounded-xl p-3 flex flex-col gap-1">
                  <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest">{st('nextTask', lang)}</span>
                  <span className="font-black text-xs text-stone-950">{localizeStaffContent(nextPendingTask.label, lang)}</span>
                </div>
              ) : (
                <div className="bg-green-500/5 border border-green-500/25 rounded-xl p-3 text-center text-xs font-bold text-[#22C55E]">
                  {st('allDone', lang)}
                </div>
              )}

              {/* SOP Collapsible Sections (Grouped) */}
              <div className="space-y-3 pt-2">
                
                {/* 1. Opening Tasks */}
                {openingSops.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      {st('openingTasks', lang)}
                    </h4>
                    <div className="space-y-2">
                      {openingSops.map(item => (
                        <div 
                          key={item.id} 
                          onClick={() => setExpandedSopId(expandedSopId === item.id ? null : item.id)}
                          className={`border rounded-xl transition-all overflow-hidden ${
                            item.completed ? 'bg-gray-50/50 border-green-300' : 'bg-white border-gray-200 shadow-sm'
                          }`}
                        >
                          <div className="p-3.5 flex items-center justify-between cursor-pointer select-none">
                            <div className="flex items-center gap-3 min-w-0">
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleSOP(item.id); }}
                                className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  item.completed ? 'bg-[#22C55E] border-[#22C55E] text-white' : 'border-gray-300 hover:border-amber-400'
                                }`}
                                style={{ minHeight: '24px', minWidth: '24px' }}
                              >
                                <Check size={12} strokeWidth={3} />
                              </button>
                              <span className={`text-xs font-bold truncate ${item.completed ? 'text-gray-400 line-through' : 'text-[#111111]'}`}>
                                {localizeStaffContent(item.label, lang)}
                              </span>
                            </div>
                            <span className="text-gray-400">
                              {expandedSopId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </div>

                          {expandedSopId === item.id && (
                            <div className="px-4 pb-4 pt-1 bg-amber-50/10 border-t border-dashed border-gray-100 text-[11px] space-y-2">
                              <div>
                                <span className="text-[9px] font-extrabold text-gray-400 block uppercase">{st('execStd', lang)}</span>
                                <span className="font-bold text-[#111111]">{localizeStaffContent(item.standard, lang) || st('stdText', lang)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-extrabold text-gray-400 block uppercase">{st('purpose', lang)}</span>
                                <span className="italic text-gray-500">{localizeStaffContent(item.why, lang) || st('whyText', lang)}</span>
                              </div>
                              <div className="text-[8px] text-green-600 font-extrabold tracking-wider flex items-center gap-1 pt-1">
                                <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
                                <span>{st('synced', lang)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. System / Operational Tasks */}
                {operatingSops.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      {st('midTasks', lang)}
                    </h4>
                    <div className="space-y-2">
                      {operatingSops.map(item => (
                        <div 
                          key={item.id} 
                          onClick={() => setExpandedSopId(expandedSopId === item.id ? null : item.id)}
                          className={`border rounded-xl transition-all overflow-hidden ${
                            item.completed ? 'bg-gray-50/50 border-green-300' : 'bg-white border-gray-200 shadow-sm'
                          }`}
                        >
                          <div className="p-3.5 flex items-center justify-between cursor-pointer select-none">
                            <div className="flex items-center gap-3 min-w-0">
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleSOP(item.id); }}
                                className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  item.completed ? 'bg-[#22C55E] border-[#22C55E] text-white' : 'border-gray-300 hover:border-amber-400'
                                }`}
                                style={{ minHeight: '24px', minWidth: '24px' }}
                              >
                                <Check size={12} strokeWidth={3} />
                              </button>
                              <span className={`text-xs font-bold truncate ${item.completed ? 'text-gray-400 line-through' : 'text-[#111111]'}`}>
                                {localizeStaffContent(item.label, lang)}
                              </span>
                            </div>
                            <span className="text-gray-400">
                              {expandedSopId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </div>

                          {expandedSopId === item.id && (
                            <div className="px-4 pb-4 pt-1 bg-blue-50/10 border-t border-dashed border-gray-100 text-[11px] space-y-2">
                              <div>
                                <span className="text-[9px] font-extrabold text-gray-400 block uppercase">{st('execStd', lang)}</span>
                                <span className="font-bold text-[#111111]">{localizeStaffContent(item.standard, lang) || st('stdText', lang)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-extrabold text-gray-400 block uppercase">{st('purpose', lang)}</span>
                                <span className="italic text-gray-500">{localizeStaffContent(item.why, lang) || st('whyText', lang)}</span>
                              </div>
                              <div className="text-[8px] text-green-600 font-extrabold tracking-wider flex items-center gap-1 pt-1">
                                <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
                                <span>{st('synced', lang)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Closing Tasks */}
                {closingSops.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                      {st('closingTasks', lang)}
                    </h4>
                    <div className="space-y-2">
                      {closingSops.map(item => (
                        <div 
                          key={item.id} 
                          onClick={() => setExpandedSopId(expandedSopId === item.id ? null : item.id)}
                          className={`border rounded-xl transition-all overflow-hidden ${
                            item.completed ? 'bg-gray-50/50 border-green-300' : 'bg-white border-gray-200 shadow-sm'
                          }`}
                        >
                          <div className="p-3.5 flex items-center justify-between cursor-pointer select-none">
                            <div className="flex items-center gap-3 min-w-0">
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleSOP(item.id); }}
                                className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  item.completed ? 'bg-[#22C55E] border-[#22C55E] text-white' : 'border-gray-300 hover:border-amber-400'
                                }`}
                                style={{ minHeight: '24px', minWidth: '24px' }}
                              >
                                <Check size={12} strokeWidth={3} />
                              </button>
                              <span className={`text-xs font-bold truncate ${item.completed ? 'text-gray-400 line-through' : 'text-[#111111]'}`}>
                                {localizeStaffContent(item.label, lang)}
                              </span>
                            </div>
                            <span className="text-gray-400">
                              {expandedSopId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </div>

                          {expandedSopId === item.id && (
                            <div className="px-4 pb-4 pt-1 bg-purple-50/10 border-t border-dashed border-gray-100 text-[11px] space-y-2">
                              <div>
                                <span className="text-[9px] font-extrabold text-gray-400 block uppercase">{st('execStd', lang)}</span>
                                <span className="font-bold text-[#111111]">{localizeStaffContent(item.standard, lang) || st('stdText', lang)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-extrabold text-gray-400 block uppercase">{st('purpose', lang)}</span>
                                <span className="italic text-gray-500">{localizeStaffContent(item.why, lang) || st('whyText', lang)}</span>
                              </div>
                              <div className="text-[8px] text-green-600 font-extrabold tracking-wider flex items-center gap-1 pt-1">
                                <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
                                <span>{st('synced', lang)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* AI Assistant Banner */}
            {allowedModules.includes('AI_ASSISTANT') && (
              <div className="bg-gradient-to-r from-stone-900 to-stone-950 border border-[#FFD200]/20 rounded-2xl p-4 text-white flex flex-col gap-3 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFD200]/5 rounded-full blur-xl pointer-events-none"></div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-stone-800 rounded-xl border border-stone-700 shrink-0">
                    <Sparkles size={16} className="text-[#FFD200] animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-[#FFD200] flex items-center gap-1.5">
                      <span>{st('ai_assistant_title', lang)}</span>
                      <span className="bg-green-500/10 text-green-400 text-[7px] px-1.5 py-0.2 rounded font-mono font-black">ONLINE</span>
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-1 font-medium leading-relaxed">
                      {st('ai_support_desc', lang)}
                    </p>
                  </div>
                </div>
                <button 
                   onClick={() => setAiOpen(true)}
                   className="w-full bg-[#FFD200] hover:brightness-105 active:scale-95 transition-all text-stone-950 font-black text-xs py-2 rounded-xl flex items-center justify-center gap-1.5"
                   style={{ minHeight: '44px' }}
                >
                  🗣️ {st('ai_launch_btn', lang)}
                </button>
              </div>
            )}

          </div>
        )}

        {/* ==========================================
            TAB 2: ROSTER VIEW (个人排班)
            ========================================== */}
        {activeTab === 'ROSTER' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            
            {/* Quick 3 Days shift cards */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <h3 className="font-black text-sm text-[#111111] flex items-center gap-2 border-b border-gray-100 pb-3">
                <Calendar size={16} className="text-[#FFD200]" />
                <span>{st('schedule', lang)}</span>
              </h3>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                {rosterData3Days.map((item, idx) => {
                  const isOff = item.status === 'OFF';
                  const isMc = item.status === 'MC';
                  return (
                    <div 
                      key={idx}
                      className={`p-3 rounded-xl border flex flex-col gap-1 ${
                        idx === 0 
                          ? 'bg-[#FFD200]/5 border-[#FFD200]/40' 
                          : 'bg-gray-50/50 border-gray-100'
                      }`}
                    >
                      <p className="text-[10px] font-black text-gray-400 uppercase">{st(item.label, lang)}</p>
                      <p className="text-[8px] font-mono text-gray-400 mt-0.5">{item.date.split('-')[2]}</p>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full mt-1.5 inline-block ${
                        isOff 
                          ? 'bg-gray-100 text-gray-500' 
                          : isMc 
                            ? 'bg-rose-50 text-rose-500 border border-rose-100' 
                            : 'bg-green-500/10 text-[#22C55E]'
                      }`}>
                        {isOff ? st('restDay', lang) : isMc ? st('sickLeave', lang) : st('work', lang)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Roster Monthly calendar view */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="font-black text-sm text-[#111111]">{st('monthlyRoster', lang)}</h3>
                <span className="text-[11px] font-mono font-extrabold text-gray-400">{rosterMonth}</span>
              </div>

              {/* Minimalist calendar grid */}
              <div className="grid grid-cols-7 gap-1 bg-gray-50 p-1.5 rounded-xl border border-gray-100 text-center">
                {/* Headers */}
                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(h => (
                  <div key={h} className="text-[9px] font-black text-gray-400 uppercase py-1">
                    {st(h, lang)}
                  </div>
                ))}

                {/* Days of current month */}
                {(() => {
                  const [yearStr, monthStr] = rosterMonth.split('-');
                  const year = parseInt(yearStr);
                  const month = parseInt(monthStr);
                  const firstDay = new Date(year, month - 1, 1).getDay(); // 0 (Sun) - 6 (Sat)
                  const offset = firstDay === 0 ? 6 : firstDay - 1; // Mon offset: 0-6
                  
                  const daysInMonth = new Date(year, month, 0).getDate();
                  const cells = [];
                  
                  // Padding cells
                  for (let i = 0; i < offset; i++) {
                    cells.push(<div key={`pad-${i}`} className="aspect-square bg-gray-50/40 rounded-lg"></div>);
                  }

                  // Actual month days
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dStr = `${rosterMonth}-${String(day).padStart(2, '0')}`;
                    const status = (monthlyRosterData[dStr] || {})[employee.id] || 'WORK';
                    const note = monthlyNotes[`${dStr}_${employee.id}`];
                    const isOff = status === 'OFF';
                    const isToday = dStr === getBusinessDateString();

                    cells.push(
                      <div 
                        key={day}
                        className={`aspect-square rounded-lg flex flex-col justify-between p-1 border text-center transition-all ${
                          isToday 
                            ? 'ring-2 ring-[#FFD200] border-[#FFD200] bg-yellow-50/20' 
                            : isOff 
                              ? 'bg-gray-100 border-gray-200' 
                              : 'bg-white border-gray-100 hover:bg-gray-50/50'
                        }`}
                        title={note || ''}
                      >
                        <span className={`text-[9px] font-mono font-extrabold ${isToday ? 'text-amber-600' : isOff ? 'text-gray-400' : 'text-stone-900'}`}>{day}</span>
                        <div className={`w-1.5 h-1.5 rounded-full mx-auto ${isOff ? 'bg-gray-300' : 'bg-green-500'}`}></div>
                      </div>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            TAB 3: HANDBOOK VIEW (岗位手册)
            ========================================== */}
        {activeTab === 'HANDBOOK' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            
            {/* 1. Core Guidelines */}
            <div className="bg-[#111111] text-white rounded-2xl p-5 relative overflow-hidden shadow-md">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#FFD200]"></div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                <Award size={14} className="text-[#FFD200]" />
                <span>{st('duties_title', lang)}</span>
              </h3>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {currentGuide.duties && currentGuide.duties.map((duty, idx) => (
                  <div key={idx} className="bg-white/5 text-gray-100 px-3 py-2 rounded-xl border border-white/10 text-xs font-bold flex items-center gap-2 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FFD200]"></div>
                    {localizeStaffContent(duty, lang)}
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-white/10 flex items-start gap-2">
                <Sparkles size={14} className="text-[#FFD200] shrink-0 mt-0.5 animate-pulse" fill="currentColor"/>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{st('coreValue_title', lang)}</p>
                  <p className="text-xs font-serif font-bold italic">"{localizeStaffContent(currentGuide.coreValue, lang)}"</p>
                </div>
              </div>

              {currentGuide.safetyRedLine && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                    <AlertOctagon size={16} className="text-[#EF4444] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-[#EF4444] uppercase">{st('safetyRedLine_title', lang)}</p>
                      <p className="text-xs font-bold text-gray-200 leading-relaxed">{localizeStaffContent(currentGuide.safetyRedLine, lang)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Job Manual / Troubleshooting (岗位实战宝典) */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                <HelpCircle className="text-[#FFD200]" size={18}/> 
                <span>{st('troubleshooting_title', lang)}</span>
              </h3>

              <div className="space-y-4">
                {currentGuide.troubleshooting && currentGuide.troubleshooting.map((item, idx) => (
                  <div key={idx} className="bg-gray-50/50 rounded-xl p-4 border-l-4 border-l-amber-500 border border-gray-100">
                    <p className="text-[9px] font-extrabold text-gray-400 uppercase mb-1">{st('issue_label', lang)}</p>
                    <p className="text-xs font-bold text-[#111111] mb-2">{localizeStaffContent(item.issue, lang)}</p>
                    <div className="bg-white p-3 rounded-lg border border-gray-100 mt-2">
                      <p className="text-[9px] font-extrabold text-green-600 uppercase mb-1">{st('solution_label', lang)}</p>
                      <p className="text-[11px] font-bold text-gray-600 leading-relaxed">{localizeStaffContent(item.solution, lang)}</p>
                    </div>
                  </div>
                ))}
                {(!currentGuide.troubleshooting || currentGuide.troubleshooting.length === 0) && (
                  <p className="text-center text-xs text-gray-400 italic py-4">{st('no_troubleshooting_tips', lang)}</p>
                )}
              </div>
            </div>

            {/* 3. General Rules (员工通用守则) */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                <BookMarked className="text-[#FFD200]" size={18}/> 
                <span>{st('employeeRules_title', lang)}</span>
              </h3>

              <div className="grid grid-cols-1 gap-2.5">
                {currentGuide.employeeRules && currentGuide.employeeRules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                    <div className="w-5 h-5 bg-[#FFD200] text-stone-950 rounded-full flex items-center justify-center text-[9px] font-black shrink-0">{idx + 1}</div>
                    <span className="text-xs font-bold text-[#111111]">{localizeStaffContent(rule, lang)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Technology Guides (系统功能指引 / Tech SOP) */}
            {workModules.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-[#111111] flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Smartphone className="text-[#FFD200]" size={18}/> 
                  <span>{st('techGuides', lang)}</span>
                </h3>
                <div className="space-y-4">
                  {workModules.map(modKey => {
                    const info = MODULE_DEFINITIONS[modKey];
                    if (!info) return null;
                    const Icon = info.icon;
                    return (
                      <div key={modKey} className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#FFD200] shadow-sm"><Icon size={16}/></div>
                          <h4 className="font-bold text-xs text-[#111111]">{getStaffModuleLabel(modKey, lang, info.label)}</h4>
                        </div>
                        <div className="p-3 bg-white border border-dashed border-gray-200 rounded-xl ml-4 relative text-xs text-gray-500 font-bold leading-relaxed whitespace-pre-line">
                          {localizeStaffContent(info.guide, lang)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ==========================================
            TAB 4: PROFILE VIEW (我的)
            ========================================== */}
        {activeTab === 'PROFILE' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            
            {/* Employee Detailed Profile Card */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <h3 className="font-black text-sm text-[#111111] border-b border-gray-100 pb-3 flex items-center gap-2">
                <User size={16} className="text-[#FFD200]" />
                <span>{st('profile', lang)}</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">{st('id', lang)}</span>
                  <span className="font-mono font-bold text-stone-900">{employee.id}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">{st('position', lang)}</span>
                  <span className="font-bold text-stone-900">{st(employee.role, lang)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">{st('phone', lang)}</span>
                  <span className="font-bold text-stone-900">{employee.phone}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">{st('nationality', lang)}</span>
                  <span className="font-bold text-stone-900">{employee.nationality}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">{st('joinDate', lang)}</span>
                  <span className="font-bold text-stone-900 font-mono">{employee.joinDate}</span>
                </div>
              </div>
            </div>

            {/* Warnings Log History */}
            {employee.warningHistory && employee.warningHistory.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                <h3 className="font-black text-sm text-[#111111] border-b border-gray-100 pb-3 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-red-500" />
                  <span>{st('warnings', lang)} ({employee.warningHistory.length})</span>
                </h3>
                <div className="space-y-3">
                  {employee.warningHistory.map((warn, i) => (
                    <div key={i} className="bg-red-50/50 border border-red-100 p-3 rounded-xl flex items-start gap-2.5">
                      <span className="text-base">⚠️</span>
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-red-600">
                            {warn.type === 'VERBAL' ? st('verbal', lang) : warn.type === 'WRITTEN' ? st('written', lang) : st('final', lang)}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400">{warn.date}</span>
                        </div>
                        <p className="text-gray-600 font-medium mt-1">{warn.reason}</p>
                        {warn.fineAmount && warn.fineAmount > 0 && (
                          <p className="text-red-700 font-extrabold mt-1">{lang === 'my' ? 'ဒဏ်ကြေး' : '罚款'}: RM {warn.fineAmount}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Read-only Quarterly Rating */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <h3 className="font-black text-sm text-[#111111] border-b border-gray-100 pb-3 flex items-center gap-2">
                <Award size={16} className="text-[#FFD200]" />
                <span>{st('rating', lang)}</span>
              </h3>
              {employee.assessmentSummary?.currentGrade ? (
                <div className="flex items-center justify-between bg-yellow-50/30 p-4 rounded-xl border border-yellow-100">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Quarter</p>
                    <p className="text-xs font-black text-stone-900">{employee.assessmentSummary.currentQuarter}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Grade / Score</p>
                    <p className="text-sm font-serif font-black text-amber-600">
                      Grade {employee.assessmentSummary.currentGrade} ({employee.assessmentSummary.currentScore} Pts)
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-gray-400 py-3 italic">{st('noRating', lang)}</p>
              )}
            </div>

            {/* Logout Action (touch targets >= 48px) */}
            <button 
              onClick={handleLogoutClick}
              className="w-full py-3.5 border-2 border-red-500/20 hover:bg-red-500/5 text-red-500 rounded-2xl text-xs font-black transition-all active:scale-98 flex items-center justify-center gap-1.5"
              style={{ minHeight: '48px' }}
            >
              <LogOut size={14} />
              <span>{st('logout', lang)}</span>
            </button>

          </div>
        )}

      </div>

      {/* ── AI OPERATIONS WORKFLOW DRAWER ── */}
      <AIOperationsAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />

      {/* ────────────────────────────────────────────────────────────────────────
          MOBILE BOTTOM NAVIGATION BAR (md:hidden, touch-optimized, uses brand yellow)
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px]
                      bg-white/90 backdrop-blur-3xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.08)] z-[110]
                      rounded-[1.25rem] py-1 px-1.5 flex justify-around items-center">
        
        {/* TODAY */}
        <button 
          onClick={() => setActiveTab('TODAY')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all active:scale-95 shrink-0 ${
            activeTab === 'TODAY' ? 'text-amber-500' : 'text-stone-400 active:text-stone-700'
          }`}
          style={{ minHeight: '44px' }}
        >
          <div className={`p-1.5 rounded-lg transition-all ${activeTab === 'TODAY' ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-50'}`}>
            <ClipboardList size={16} className={activeTab === 'TODAY' ? 'text-amber-600' : ''} />
          </div>
          <span className={`text-[8.5px] font-black tracking-wider ${activeTab === 'TODAY' ? 'text-amber-600' : ''}`}>{st('todayWorkspace', lang)}</span>
        </button>

        {/* ROSTER */}
        <button 
          onClick={() => setActiveTab('ROSTER')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all active:scale-95 shrink-0 ${
            activeTab === 'ROSTER' ? 'text-amber-500' : 'text-stone-400 active:text-stone-700'
          }`}
          style={{ minHeight: '44px' }}
        >
          <div className={`p-1.5 rounded-lg transition-all ${activeTab === 'ROSTER' ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-50'}`}>
            <Calendar size={16} className={activeTab === 'ROSTER' ? 'text-amber-600' : ''} />
          </div>
          <span className={`text-[8.5px] font-black tracking-wider ${activeTab === 'ROSTER' ? 'text-amber-600' : ''}`}>{st('schedule', lang)}</span>
        </button>

        {/* HANDBOOK */}
        <button 
          onClick={() => setActiveTab('HANDBOOK')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all active:scale-95 shrink-0 ${
            activeTab === 'HANDBOOK' ? 'text-amber-500' : 'text-stone-400 active:text-stone-700'
          }`}
          style={{ minHeight: '44px' }}
        >
          <div className={`p-1.5 rounded-lg transition-all ${activeTab === 'HANDBOOK' ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-50'}`}>
            <BookOpen size={16} className={activeTab === 'HANDBOOK' ? 'text-amber-600' : ''} />
          </div>
          <span className={`text-[8.5px] font-black tracking-wider ${activeTab === 'HANDBOOK' ? 'text-amber-600' : ''}`}>{st('handbook', lang)}</span>
        </button>

        {/* PROFILE */}
        <button 
          onClick={() => setActiveTab('PROFILE')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all active:scale-95 shrink-0 ${
            activeTab === 'PROFILE' ? 'text-amber-500' : 'text-stone-400 active:text-stone-700'
          }`}
          style={{ minHeight: '44px' }}
        >
          <div className={`p-1.5 rounded-lg transition-all ${activeTab === 'PROFILE' ? 'bg-[#FFD200]/20 text-[#FFD200]' : 'active:bg-stone-50'}`}>
            <User size={16} className={activeTab === 'PROFILE' ? 'text-amber-600' : ''} />
          </div>
          <span className={`text-[8.5px] font-black tracking-wider ${activeTab === 'PROFILE' ? 'text-amber-600' : ''}`}>{st('me', lang)}</span>
        </button>

      </div>

    </div>
  );
};