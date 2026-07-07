import React, { useState, useEffect } from 'react';
import { ClipboardList, Shield, Crown, BookOpen, Languages, AlertTriangle } from 'lucide-react';
import { SOPItem, Employee, RoleGuide } from '../types';
import { ROLE_SOP_DETAILS, MODULE_SYSTEM_TASKS } from './constants';
import { DEFAULT_ROLE_GUIDES, DEFAULT_ROLES } from '../constants/staff';
import { ManagementView, FOHView, BOHView, PendingView, HandbookView } from './StaffViews';
import { DataManager } from '../utils/dataManager';
import { mapRoleToCode, getChineseRoleName } from './utils';
import { AIOperationsAssistant } from './features/AIOperationsAssistant';

interface StaffDashboardProps { employee: Employee; }

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ employee }) => {
  const roleCode = mapRoleToCode(employee.role);
  const isPending = roleCode === 'PENDING';
  // Check management based on role code prefixes/types
  const isManagement = ['MANAGER', 'SUPERVISOR', 'EXEC_CHEF', 'OWNER'].includes(roleCode);
  const isKitchen = ['HEAD_CHEF', 'ASST_CHEF', 'CHEF', 'COMMIS', 'BAR', 'CUTTER', 'APPRENTICE', 'HELPER', 'DISHWASH', 'FRYER'].includes(roleCode);
  const defaultKey = 'Commis/Runner (马王)';

  const [currentGuide, setCurrentGuide] = useState<RoleGuide>(DEFAULT_ROLE_GUIDES[defaultKey]);
  const [allowedModules, setAllowedModules] = useState<any[]>([]); 
  const [activeTab, setActiveTab] = useState<'SOP' | 'HANDBOOK' | 'ADMIN'>('SOP');
  const [sopItems, setSopItems] = useState<SOPItem[]>([]);
  
  // Language State: 'zh' (Default/English mix) | 'my' (Burmese)
  const [lang, setLang] = useState<'zh' | 'my'>('zh');

  // --- ALERT SYSTEM STATE ---
  const [billAlertCount, setBillAlertCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todayLogCount, setTodayLogCount] = useState(0);
  const [absentCount, setAbsentCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  
  // NEW: State to track if this user has assigned tasks
  const [hasPendingTasks, setHasPendingTasks] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // 1. Load Modules and Role Guide (Prefer Cloud Config)
  useEffect(() => {
     const initConfig = async () => {
         // Load modules from Employee object (passed prop, assume up to date)
         if (employee.allowedModules) {
             setAllowedModules(employee.allowedModules);
         } else {
             // Fallback to defaults
             const currentRoleDef = DEFAULT_ROLES.find(r => r.title === employee.role);
             setAllowedModules(currentRoleDef?.allowedModules || []);
         }

         // Load Guide from Cloud
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
        const now = new Date();
        if (now.getHours() < 4) now.setDate(now.getDate() - 1);
        const dateStr = now.toISOString().split('T')[0];

        // Try load today's progress from cloud
        const savedProgress = await DataManager.getSOPProgress(dateStr, employee.id);
        
        if (savedProgress) {
            setSopItems(savedProgress);
        } else {
            // New Day: Generate from Template
            const config = await DataManager.getRoleConfig();
            const templates = config?.sops ? { ...ROLE_SOP_DETAILS, ...config.sops } : ROLE_SOP_DETAILS;
            
            const template = templates[roleCode] || templates['COMMIS'] || { start: { tasks: [] }, end: { tasks: [] } };
            
            const startItems = template.start?.tasks?.map((t: any, i: number) => ({ id: `start_${i}`, label: t.label, completed: false, standard: t.standard, why: t.why })) || [];
            const endItems = template.end?.tasks?.map((t: any, i: number) => ({ id: `end_${i}`, label: t.label, completed: false, standard: t.standard, why: t.why })) || [];
            
            const sysTasks: SOPItem[] = [];
            if (employee.allowedModules) {
                employee.allowedModules.forEach(mod => {
                    const tasks = MODULE_SYSTEM_TASKS[mod];
                    if (tasks) {
                        tasks.forEach((t, i) => {
                            sysTasks.push({ id: `auto_${mod}_${i}`, label: t.label, completed: false, standard: t.standard, why: t.why, isSystemTask: true });
                        });
                    }
                });
            }
            setSopItems([...startItems, ...endItems, ...sysTasks]);
        }
    };
    initSOP();
  }, [employee.id, roleCode, isPending, employee.allowedModules]);

  // 3. DAILY ALERT HEALTH CHECK & PENDING TASK CHECK
  useEffect(() => {
      // Always run this check regardless of permissions to detect assigned tasks
      const runHealthCheck = async () => {
          setLoadingAlerts(true);
          try {
              // 0. CHECK FOR ASSIGNED TASKS (NEW)
              const allTasks = await DataManager.getInventoryTasks();
              const myTasks = allTasks.filter(t => t.assigneeId === employee.id && t.status === 'PENDING');
              setHasPendingTasks(myTasks.length > 0);

              // Only run other alerts if they have permission
              if (employee.allowedModules?.includes('DAILY_ALERT')) {
                  // 1. BILL ALERTS
                  const bills = await DataManager.getRecurringBills();
                  let bAlerts = 0;
                  const today = new Date();
                  const currentYear = today.getFullYear();
                  bills.forEach(bill => {
                      if (bill.type === 'YEARLY') {
                          const dueDate = new Date(currentYear, (bill.dueMonth || 1) - 1, bill.dueDay);
                          const diffTime = dueDate.getTime() - today.getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          const lastPaidYear = bill.lastPaidDate ? new Date(bill.lastPaidDate).getFullYear() : 0;
                          const isPaid = lastPaidYear >= currentYear;
                          if (!isPaid && diffDays <= (bill.reminderDays || 30)) bAlerts++;
                      } 
                  });
                  setBillAlertCount(bAlerts);

                  // 2. LOW STOCK ALERT
                  const [kStock, bStock, gStock] = await Promise.all([
                      DataManager.getStock('KITCHEN'),
                      DataManager.getStock('BAR'),
                      DataManager.getStock('GENERAL')
                  ]);
                  const allStock = [...kStock, ...bStock, ...gStock];
                  const lowItems = allStock.filter(i => i.currentQty <= i.minLevel).length;
                  setLowStockCount(lowItems);

                  // 3. TODAY'S LOGBOOK ALERT (UNACKNOWLEDGED)
                  const logs = await DataManager.getLogs();
                  const dateStr = today.toISOString().split('T')[0];
                  const newLogs = logs.filter(l => l.date === dateStr && !l.acknowledgedBy).length;
                  setTodayLogCount(newLogs);

                  // 4. STAFF ABSENCE ALERT
                  const { roster } = await DataManager.getRosterData();
                  const todayRoster = roster[dateStr] || {};
                  const absentStaff = Object.values(todayRoster).filter(status => status === 'MC' || status === 'ABSENT').length;
                  setAbsentCount(absentStaff);
              }

          } catch (e) {
              console.error("Alert Check Failed", e);
          } finally {
              setLoadingAlerts(false);
          }
      };
      
      // Initial Run
      runHealthCheck();

      // Poll specifically for tasks every 5 seconds
      const taskPoller = setInterval(async () => {
          const allTasks = await DataManager.getInventoryTasks();
          const myTasks = allTasks.filter(t => t.assigneeId === employee.id && t.status === 'PENDING');
          setHasPendingTasks(myTasks.length > 0);
      }, 5000);

      return () => clearInterval(taskPoller);

  }, [employee.allowedModules, employee.id]);

  const toggleSOP = async (id: string) => {
    const newItems = sopItems.map(item => item.id === id ? { ...item, completed: !item.completed } : item);
    setSopItems(newItems);
    
    // Save to Cloud
    const now = new Date();
    if (now.getHours() < 4) now.setDate(now.getDate() - 1);
    const dateStr = now.toISOString().split('T')[0];
    await DataManager.saveSOPProgress(dateStr, employee.id, newItems);
  };
  
  const isConfirmed = employee.status === 'CONFIRMED';
  const totalAlerts = billAlertCount + lowStockCount + todayLogCount + absentCount;

  // Helper for UI text
  const t = (zh: string, my: string) => lang === 'my' ? my : zh;

  // Determine if Admin Tab should be shown (Either has modules OR has pending tasks)
  const showAdminTab = allowedModules.length > 0 || hasPendingTasks;

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans pb-32">
      {/* HEADER CARD */}
      <div className="bg-[#1A1A1A] pb-10 pt-6 md:pb-12 md:pt-8 rounded-b-[2rem] md:rounded-b-[2.5rem] shadow-2xl relative overflow-hidden border-b-4 border-[#C70000]">
         <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-gray-700 via-[#1a1a1a] to-[#1a1a1a]"></div>
         
         {/* Language Toggle */}
         <button 
            onClick={() => setLang(lang === 'zh' ? 'my' : 'zh')}
            className="absolute top-3 right-3 md:top-4 md:right-4 z-30 bg-white/10 hover:bg-white/20 backdrop-blur-md px-2.5 py-1 md:px-3 md:py-1.5 rounded-full flex items-center gap-1.5 md:gap-2 border border-white/20 transition-all active:scale-95"
         >
            <Languages size={14} className="md:w-4 md:h-4 text-[#FFD700]"/>
            <span className="text-[10px] md:text-xs font-bold text-white">{lang === 'zh' ? '中文' : 'မြန်မာ'}</span>
         </button>

         <div className="relative z-10 flex flex-col items-center justify-center text-center px-4">
            <div className="relative mb-2 md:mb-3">
                <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-2xl md:text-3xl font-serif font-black shadow-2xl border-4 ${isConfirmed ? 'bg-[#FFD700] text-black border-white/20' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>{employee.name.charAt(0)}</div>
                {isConfirmed && employee.isQualityStaff && <div className="absolute -top-2 -right-1 md:-top-3 md:-right-2 bg-white p-1 md:p-1.5 rounded-full shadow-lg border border-[#FFD700]"><Crown size={12} className="md:w-3.5 md:h-3.5 text-[#FFD700] fill-current" /></div>}
            </div>
            <h1 className="text-xl md:text-2xl font-serif font-bold text-white mb-1">{employee.name}</h1>
            <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
                <span className="bg-white/10 text-gray-300 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-mono">ID: {employee.id}</span>
                <span className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold border ${isConfirmed ? 'bg-[#FFD700] text-black border-[#FFD700]' : 'text-gray-400 border-gray-600'}`}>
                    {lang === 'my' 
                        ? (isConfirmed ? 'အတည်ပြုပြီး (Confirmed)' : 'အစမ်းခန့် (Probation)')
                        : (isConfirmed ? '正式 (Confirmed)' : '试用 (Probation)')
                    }
                </span>
            </div>
            <div className="text-xs md:text-sm font-bold text-[#FFD700] uppercase tracking-widest">{getChineseRoleName(employee.role)}</div>
         </div>
      </div>

      <div className="px-4 md:px-6 -mt-5 md:-mt-6 relative z-20 max-w-xl mx-auto">
         <div className="bg-white/90 backdrop-blur-md rounded-xl md:rounded-2xl shadow-xl p-1 md:p-1.5 flex justify-center items-center border border-white/20 gap-1">
            <button onClick={() => setActiveTab('SOP')} className={`flex-1 py-2.5 md:py-3 px-1 md:px-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold flex items-center justify-center gap-1 md:gap-1.5 transition-all ${activeTab === 'SOP' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                <ClipboardList size={14} className="md:w-3.5 md:h-3.5"/> <span className="truncate">{t('每日任务', 'နေ့စဉ်တာဝန်')}</span>
            </button>
            <button onClick={() => setActiveTab('HANDBOOK')} className={`flex-1 py-2.5 md:py-3 px-1 md:px-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold flex items-center justify-center gap-1 md:gap-1.5 transition-all ${activeTab === 'HANDBOOK' ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                <BookOpen size={14} className="md:w-3.5 md:h-3.5"/> <span className="truncate">{t('岗位手册', 'အလုပ်လက်စွဲ')}</span>
            </button>
            
            {showAdminTab && (
                <button 
                    onClick={() => setActiveTab('ADMIN')} 
                    className={`flex-1 py-2.5 md:py-3 px-1 md:px-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold flex items-center justify-center gap-1 md:gap-1.5 transition-all relative ${activeTab === 'ADMIN' ? 'bg-[#C70000] text-white shadow-md' : 'text-gray-500 hover:bg-red-50'}`}
                >
                    <Shield size={14} className="md:w-3.5 md:h-3.5"/> 
                    <span className="truncate">{t('管理后台', 'Admin')}</span>
                    {/* Visual indicator for pending task */}
                    {hasPendingTasks && activeTab !== 'ADMIN' && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse absolute top-1 right-1"></span>
                    )}
                </button>
            )}
         </div>
      </div>

      <div className="max-w-3xl mx-auto mt-6 px-4">
         
         {/* ⚡️ AI 智控脑库 (AI Operations Brain) ── */}
         {allowedModules.includes('AI_ASSISTANT') && (
             <div className="hidden md:flex bg-gradient-to-r from-[#0C0C0E] via-[#141416] to-[#0A0A0C] border border-[#FFD700]/25 rounded-[1.8rem] p-5 text-white shadow-[0_10px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(255,215,0,0.03)] mb-6 animate-in slide-in-from-top-4 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD700]/5 rounded-full blur-2xl pointer-events-none"></div>
                 
                 <div className="flex items-center gap-4 relative z-10">
                     <div className="relative shrink-0">
                         <span className="absolute inline-flex h-6 w-6 rounded-full bg-[#FFD700]/20 animate-ping opacity-75"></span>
                         <div className="bg-gradient-to-tr from-[#3a3418] to-[#15140f] p-3 rounded-2xl border border-[#FFD700]/30 shadow-inner">
                             <span className="text-xl animate-pulse inline-block">🔮</span>
                         </div>
                     </div>
                     <div>
                         <h3 className="font-extrabold text-[#FFD700] text-sm tracking-widest uppercase flex items-center gap-2">
                             {t('AI 智控脑库', 'AI Operations Assistant')}
                             <span className="bg-emerald-500/10 text-emerald-400 font-extrabold text-[8px] px-2 py-0.5 rounded border border-emerald-500/30">ONLINE</span>
                         </h3>
                         <p className="text-[11px] text-stone-400 mt-1 pb-1 font-semibold leading-relaxed">
                             {t('智能检索店内库存、异常日志、排班与业务规范。解放双手，支持免提麦克风语音录入！', 'Query restaurant stocks, anomaly logs, scheduling & codes. Hands-free microphone ready!')}
                         </p>
                     </div>
                 </div>
                 <button
                     onClick={() => setAiOpen(true)}
                     style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                     className="w-full md:w-auto bg-gradient-to-r from-[#FFD700] via-[#F5C73C] to-[#E5A93C] hover:brightness-110 text-stone-950 font-black text-xs px-6 py-2.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 shadow-lg relative z-10"
                 >
                     <span>🗣️</span>
                     <span>{t('立即唤醒语音提问 →', 'Launch AI Chat →')}</span>
                 </button>
             </div>
         )}

         {activeTab === 'SOP' && (
             isPending ? <PendingView lang={lang} /> : 
             isKitchen ? <BOHView employee={employee} guide={currentGuide} sopItems={sopItems} onToggleSop={toggleSOP} lang={lang} /> : 
             <FOHView employee={employee} guide={currentGuide} sopItems={sopItems} onToggleSop={toggleSOP} lang={lang} />
         )}
         {activeTab === 'HANDBOOK' && <HandbookView guide={currentGuide} allowedModules={allowedModules} lang={lang} />}
         
         {/* Pass hasPendingTasks to ManagementView */}
         {activeTab === 'ADMIN' && showAdminTab && (
             <ManagementView 
                 employee={employee} 
                 guide={currentGuide} 
                 allowedModules={allowedModules} 
                 hasPendingTasks={hasPendingTasks}
                 lang={lang}
             />
         )}

         {/* ── AI OPERATIONS WORKFLOW DRAWER ── */}
         <AIOperationsAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />
      </div>
    </div>
  );
};