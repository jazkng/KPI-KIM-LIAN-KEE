// components/AdminDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, BookOpen, CalendarOff, ClipboardCheck, Package, ArrowLeft, Truck, Armchair, Eye, CheckSquare, Clock, ShoppingCart, Utensils, Award, CreditCard, FileText, BellRing } from 'lucide-react';
import { StoreConfig, AppModule, Employee } from '../types';
import { DataManager } from '../utils/dataManager';
import { getOrgLevelLabel, getOrgLevel } from '../utils/orgAccess';
import { mt } from '../constants/managementTranslations';
import { getBusinessDateString } from '../utils/dateHelper';
import { needsReplenishment } from '../utils/unitConversion';
import { sortNavigationItems } from '../constants/moduleNavigation';

// --- NEW GENERIC IMPORTS ---
import { SettlementModule } from './features/SettlementModule';
import { RosterModule } from './features/RosterModule';
import { LogbookModule } from './features/LogbookModule';
import { InventoryModule } from './features/inventory/InventoryModule';
import { SOPInspection } from './features/SOPInspection';
import { QueueManager } from './features/QueueManager';
import { SupplierModule } from './features/supplier/SupplierModule';
import { AttendanceConsole } from './features/AttendanceConsole';
import { ProcurementModule } from './features/ProcurementModule';
import { MenuManagement } from './features/MenuManagement'; 
import { EmployeeAssessmentModule } from './features/EmployeeAssessmentModule'; // NEW IMPORT
import { AccountsPayableModule } from './features/ap/AccountsPayableModule';
import { SelfInvoiceModule } from './features/SelfInvoiceModule';
import { KitchenAlertDisplay } from './features/kitchen/KitchenAlertDisplay';
import { KitchenAlertModule } from './features/kitchen/KitchenAlertModule';

const defaultBossEmployee: Employee = {
    id: 'BOSS_TEMP',
    name: '系统管理员',
    role: 'BOSS',
    status: 'CONFIRMED',
    level: '1',
    basicSalary: 0,
    phone: '',
    joinDate: '2026-07-15',
    absentDays: 0,
    gender: 'Male',
    nationality: 'MY',
    allowedModules: ['KITCHEN_ALERT']
};

interface ManagerDashboardProps {
    onBack?: () => void; 
    allowedModules?: AppModule[]; 
    initialTab?: 'SETTLEMENT' | 'ROSTER' | 'LOGBOOK' | 'LOGBOOK_VIEW' | 'SOP_INSPECT' | 'INVENTORY_CHECK' | 'INVENTORY_VIEW' | 'SUPPLIER_CONTACTS' | 'QUEUE' | 'ATTENDANCE_CONSOLE' | 'PROCUREMENT' | 'MENU_MANAGEMENT' | 'ASSESSMENT' | 'AP' | 'SELF_INVOICE' | 'KITCHEN_ALERT';
    isSingleMode?: boolean;
    onOpenTV?: () => void;
    currentEmployee?: Employee; 
    isManagementStaff?: boolean;
    lang?: 'zh' | 'my';
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ onBack, allowedModules, initialTab, isSingleMode = false, onOpenTV, currentEmployee, isManagementStaff = false, lang = 'zh' }) => {
  const [activeTab, setActiveTab] = useState<'SETTLEMENT' | 'ROSTER' | 'LOGBOOK' | 'LOGBOOK_VIEW' | 'SOP_INSPECT' | 'INVENTORY_CHECK' | 'INVENTORY_VIEW' | 'SUPPLIER_CONTACTS' | 'QUEUE' | 'ATTENDANCE_CONSOLE' | 'PROCUREMENT' | 'MENU_MANAGEMENT' | 'ASSESSMENT' | 'AP' | 'SELF_INVOICE' | 'KITCHEN_ALERT'>('SETTLEMENT');
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({ 
      businessDayCutoff: 4,
      timeZoneOffset: 8,
      googleScriptUrl: 'https://script.google.com/macros/s/AKfycbzpnQGRmBV8y2HoL1AlguZhhsJCHxGLwMAB-lBHAm67FoFZE69Io_gGTK8GCHOzcwDXWA/exec' 
  });

  // State to hold a target stock ID for deep linking navigation
  const [targetStockId, setTargetStockId] = useState('');

  // Management stats state
  const [mgmtStats, setMgmtStats] = useState({ lowStock: 0, todayLogs: 0, absences: 0, pendingTasks: 0 });
  const [statsLoading, setStatsLoading] = useState(isManagementStaff);

  // 👑 新增：企业级5分钟缓存机制 (防止店长频繁返回主页导致全量重新拉取)
  useEffect(() => {
      if (!isManagementStaff) return;
      
      let isMounted = true;
      const loadStats = async () => {
          // 1. 检查 5 分钟内的本地缓存
          const CACHE_KEY = 'manager_dashboard_stats_cache';
          const CACHE_TIME = 5 * 60 * 1000; // 5分钟
          const cachedData = sessionStorage.getItem(CACHE_KEY);
          
          if (cachedData) {
              const { stats, timestamp } = JSON.parse(cachedData);
              if (Date.now() - timestamp < CACHE_TIME) {
                  if (isMounted) {
                      setMgmtStats(stats);
                      setStatsLoading(false);
                  }
                  return; // 👑 缓存有效，直接拦截，节省 Firebase 读取！
              }
          }

          // 2. 缓存过期或首次加载，去云端拿数据
          setStatsLoading(true);
          try {
              const [kStock, bStock, gStock, fStock, logs, rosterData, tasks] = await Promise.all([
                  DataManager.getStock('KITCHEN'), DataManager.getStock('BAR'), DataManager.getStock('GENERAL'), DataManager.getStock('FUEL'),
                  DataManager.getLogs(), DataManager.getRosterData(), DataManager.getInventoryTasks()
              ]);
              
              if (!isMounted) return;

              const allStock = [...kStock, ...bStock, ...gStock, ...fStock];
              const lowItems = allStock.filter(needsReplenishment).length;
              
              const dateStr = getBusinessDateString();
              
              const todayLogs = logs.filter(l => l.date === dateStr).length;
              const todayRoster = rosterData.roster?.[dateStr] || {};
              const absences = Object.values(todayRoster).filter(s => s === 'MC' || s === 'ABSENT').length;
              const pending = tasks.filter(t => t.status === 'PENDING').length;
              
              const newStats = { lowStock: lowItems, todayLogs: todayLogs, absences: absences, pendingTasks: pending };
              
              setMgmtStats(newStats);
              
              // 3. 把最新鲜的数据存入本地缓存
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({ stats: newStats, timestamp: Date.now() }));

          } catch (e) { 
              console.error("Stats load failed", e); 
          } finally { 
              if (isMounted) setStatsLoading(false); 
          }
      };
      
      loadStats();
      return () => { isMounted = false; };
  }, [isManagementStaff]);

  // Load Store Config
  useEffect(() => {
    const savedConfig = localStorage.getItem('kepong_erp_config');
    if (savedConfig) setStoreConfig(JSON.parse(savedConfig));
  }, []);

  // Determine available tabs
  const availableTabs = useMemo(() => {
     const tabs: { key: string, label: string, icon: React.ReactNode }[] = [];
     
     const showAll = !allowedModules || allowedModules.length === 0;

     if (showAll || allowedModules?.includes('QUEUE_MANAGER')) {
         tabs.push({ key: 'QUEUE', label: lang === 'my' ? 'တန်းစီခြင်း' : '排队取号', icon: <Armchair size={18} /> });
     }
     if (showAll || allowedModules?.includes('SETTLEMENT')) {
         tabs.push({ key: 'SETTLEMENT', label: lang === 'my' ? 'နေ့စဉ်စာရင်း' : '每日结算', icon: <Calculator size={18} /> });
     }
     if (showAll || allowedModules?.includes('KITCHEN_ALERT')) {
         tabs.push({ key: 'KITCHEN_ALERT', label: lang === 'my' ? 'မီးဖိုချောင်သတိပေးချက်' : '通知厨房', icon: <BellRing size={18} /> });
     }
     if (showAll || allowedModules?.includes('ROSTER') || allowedModules?.includes('ROSTER_KITCHEN') || allowedModules?.includes('ROSTER_FLOOR')) {
         tabs.push({ key: 'ROSTER', label: lang === 'my' ? 'အလှည့်ကျတာဝန်' : '排班缺席', icon: <CalendarOff size={18} /> });
     }
     if (showAll || allowedModules?.includes('ATTENDANCE_CONSOLE')) {
         tabs.push({ key: 'ATTENDANCE_CONSOLE', label: lang === 'my' ? 'တက်ရောက်မှု' : '考勤总控', icon: <Clock size={18} /> });
     }
     if (showAll || allowedModules?.includes('ASSESSMENT')) {
         tabs.push({ key: 'ASSESSMENT', label: lang === 'my' ? 'ကျွမ်းကျင်မှုစစ်' : '能力评测', icon: <Award size={18} /> });
     }
     if (showAll || allowedModules?.includes('PROCUREMENT')) {
         tabs.push({ key: 'PROCUREMENT', label: lang === 'my' ? 'ပစ္စည်းမှာယူမှု' : '智能订货', icon: <ShoppingCart size={18} /> });
     }
     if (showAll || allowedModules?.includes('MENU_MANAGEMENT')) {
         tabs.push({ key: 'MENU_MANAGEMENT', label: lang === 'my' ? 'ဟင်းချက်နည်း' : '智能菜谱', icon: <Utensils size={18} /> });
     }
     if (showAll || allowedModules?.includes('LOGBOOK')) {
         tabs.push({ key: 'LOGBOOK', label: lang === 'my' ? 'လည်ပတ်မှတ်တမ်း' : '运营日志', icon: <BookOpen size={18} /> });
     }
     if (showAll || allowedModules?.includes('SOP_INSPECT')) {
         tabs.push({ key: 'SOP_INSPECT', label: lang === 'my' ? 'SOP စစ်ဆေးခြင်း' : 'SOP 稽查', icon: <ClipboardCheck size={18} /> });
     }
     // INVENTORY LOGIC REFINED
     if (showAll || allowedModules?.some(m => m.startsWith('INVENTORY'))) {
         // Everyone with any inventory module sees Check
         tabs.push({ key: 'INVENTORY_CHECK', label: lang === 'my' ? 'ပစ္စည်းစာရင်း' : '库存盘点', icon: <CheckSquare size={18} /> });
         
         // Only Boss (showAll) sees View/Master. Staff with restricted modules CANNOT see View.
         if (showAll) {
             tabs.push({ key: 'INVENTORY_VIEW', label: lang === 'my' ? 'သိုလှောင်မှု' : '库存总览', icon: <Eye size={18} /> });
         }
     }
     if (showAll || allowedModules?.includes('SUPPLIER_CONTACTS')) {
         tabs.push({ key: 'SUPPLIER_CONTACTS', label: lang === 'my' ? 'ပစ္စည်းပေးသွင်း' : '供应商', icon: <Truck size={18} /> });
     }
     if (showAll || allowedModules?.includes('AP')) {
         tabs.push({ key: 'AP', label: lang === 'my' ? 'ပေးရန်ရှိစာရင်း' : '应付账款', icon: <CreditCard size={18} /> });
     }
     if (showAll || allowedModules?.includes('SELF_INVOICE')) {
         tabs.push({ key: 'SELF_INVOICE', label: lang === 'my' ? 'ကိုယ်တိုင်ပြေစာ' : '自制凭单', icon: <FileText size={18} /> });
     }
     return sortNavigationItems(tabs, tab => tab.key);
  }, [allowedModules, lang]);

  useEffect(() => {
      // Force tab switch if initialTab is provided, regardless of allowedModules (Boss override)
      if (initialTab) {
          setActiveTab(initialTab);
      } else if (availableTabs.length > 0 && !availableTabs.find(t => t.key === activeTab)) {
          setActiveTab(availableTabs[0].key as any);
      }
  }, [availableTabs, initialTab]);

  // Dynamic Title based on Active Tab (for Single Mode)
  const getPageTitle = () => {
      if (lang === 'my') {
          switch(activeTab) {
              case 'SETTLEMENT': return 'နေ့စဉ် ငွေသားစာရင်း တိုက်ဆိုင်စစ်ဆေးခြင်း (Settlement)';
              case 'ROSTER': return 'အလှည့်ကျတာဝန်၊ MC နှင့် ခွင့်ရက် စီမံခန့်ခွဲခြင်း (Roster)';
              case 'LOGBOOK': return 'လည်ပတ်မှု မှတ်တမ်း (လုပ်ဆောင်မှုပုံစံ)';
              case 'LOGBOOK_VIEW': return 'လည်ပတ်မှု မှတ်တမ်း (ကြည့်ရှုရုံပုံစံ)';
              case 'INVENTORY_CHECK': return 'ပစ္စည်းစာရင်း စစ်ဆေးခြင်း (Inventory Check)';
              case 'INVENTORY_VIEW': return 'ပစ္စည်းစာရင်း အကျဉ်းချုပ် (Inventory Master)';
              case 'SOP_INSPECT': return 'SOP လုပ်ငန်း တိုးတက်မှု စစ်ဆေးခြင်း (Inspection)';
              case 'SUPPLIER_CONTACTS': return 'ပေးသွင်းသူ ဆက်သွယ်ရန်စာအုပ် (Suppliers)';
              case 'QUEUE': return 'တန်းစီ စောင့်ဆိုင်းခြင်းနှင့် ခေါ်ဆိုခြင်း (Queue)';
              case 'ATTENDANCE_CONSOLE': return 'တက်ရောက်မှုစစ်ဆေး (Attendance Console)';
              case 'PROCUREMENT': return 'ဉာဏ်ရည်တု ကုန်ပစ္စည်းမှာယူမှုစနစ် (Procurement)';
              case 'MENU_MANAGEMENT': return 'ဟင်းချက်နည်း စာရင်း စီမံခန့်ခွဲခြင်း (Menu)';
              case 'ASSESSMENT': return 'ဝန်ထမ်း စွမ်းဆောင်ရည် အကဲဖြတ်စနစ် (Skill Matrix)';
              case 'AP': return 'ပေးရန်ရှိ ငွေစာရင်း စီမံခန့်ခွဲမှု (Accounts Payable)';
              case 'SELF_INVOICE': return 'ကိုယ်တိုင်ထုတ် ပြေစာများ ရေးဆွဲပြုလုပ်ခြင်း (Voucher Maker)';
              default: return 'စီမံခန့်ခွဲသူ မျက်နှာပြင်';
          }
      }
      switch(activeTab) {
          case 'SETTLEMENT': return '每日结算 (Settlement)';
          case 'ROSTER': return '排班管理 (Roster)';
          case 'LOGBOOK': return '运营日志 (操作模式)';
          case 'LOGBOOK_VIEW': return '运营日志 (查看模式)';
          case 'INVENTORY_CHECK': return '库存盘点 (Inventory Check)';
          case 'INVENTORY_VIEW': return '库存总览 (Inventory Master)';
          case 'SOP_INSPECT': return 'SOP 进度稽查 (Inspection)';
          case 'SUPPLIER_CONTACTS': return '供应商通讯录 (Suppliers)';
          case 'QUEUE': return '排队叫号系统 (Queue)';
          case 'ATTENDANCE_CONSOLE': return '考勤指挥台 (Attendance Console)';
          case 'PROCUREMENT': return '智能订货系统 (Procurement)';
          case 'MENU_MANAGEMENT': return '智能菜谱管理 (Menu)';
          case 'ASSESSMENT': return '员工能力评测 (Skill Matrix)';
          case 'AP': return '应付账款 (Accounts Payable)';
          case 'SELF_INVOICE': return '自制凭单 (Voucher Maker)';
          default: return '管理控制台';
      }
  }

  const handleOpenTVWrapper = () => {
      if (onOpenTV) onOpenTV();
      else {
          // If not provided, try to open in a new window with mode=tv
          const url = new URL(window.location.href);
          url.searchParams.set('mode', 'tv');
          window.open(url.toString(), '_blank');
      }
  }

  // --- NAVIGATION HANDLER ---
  const handleNavigateToStock = (stockId: string) => {
      setTargetStockId(stockId);
      // Prefer MASTER view if available, else CHECK view
      if (availableTabs.some(t => t.key === 'INVENTORY_VIEW')) {
          setActiveTab('INVENTORY_VIEW');
      } else if (availableTabs.some(t => t.key === 'INVENTORY_CHECK')) {
          setActiveTab('INVENTORY_CHECK');
      } else {
          alert(lang === 'my' ? "သင့်တွင် ပစ္စည်းစာရင်းစစ်ဆေးခွင့် မရှိပါ" : "您没有权限查看库存模块");
      }
  };

  // --- GENERIC MODULE EXIT HANDLER ---
  // Fixes the issue where closing a module redirects to Settlement incorrectly
  const handleModuleExit = () => {
      if (onBack) {
          // If a parent back handler exists (e.g., return to Grid), use it
          onBack(); 
      } else {
          // Otherwise, stay in the dashboard but switch to a safe default tab
          // Prioritize Settlement if available, otherwise the first available tab
          const safeTab = availableTabs.find(t => t.key === 'SETTLEMENT') 
              ? 'SETTLEMENT' 
              : (availableTabs[0]?.key || 'SETTLEMENT');
          
          if (activeTab !== safeTab) setActiveTab(safeTab as any);
      }
  };

  // Permission helper - check if user has permission for an action
  const hasPermission = (module: AppModule): boolean => {
      if (!allowedModules || allowedModules.length === 0) return true; // Boss mode - all access
      return allowedModules.includes(module);
  };

  return (
    <div className={`${isManagementStaff ? 'mobile-screen bg-[#F6F7FB]' : 'max-w-5xl mx-auto'} pb-32 pt-[env(safe-area-inset-top,0px)] md:pt-0`}>
      {/* MANAGEMENT STATS PANEL (Only for management staff) */}
      {isManagementStaff && !isSingleMode && currentEmployee && (
          <div className="bg-white border-b border-stone-200 pt-6 pb-10 px-4 md:px-6 relative overflow-hidden">
              <div className="relative z-10 max-w-5xl mx-auto">
                  <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black shadow-sm border-2 border-[#FFD200]/80 overflow-hidden ${currentEmployee.avatar ? '' : 'bg-[#FFD200] text-[#111111]'}`}>
                              {currentEmployee.avatar ? <img src={currentEmployee.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : currentEmployee.name.charAt(0)}
                          </div>
                          <div>
                              <h2 className="text-lg font-black text-[#111111] tracking-wide">{currentEmployee.name}</h2>
                              <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">{currentEmployee.role?.split('(')[0]}</span>
                                  <span className="bg-[#FFD200]/10 text-stone-800 text-[9px] px-2 py-0.5 rounded-full font-bold border border-[#FFD200]/30">
                                      {(() => {
                                          const level = getOrgLevel(currentEmployee);
                                          const translationMap = {
                                              'BOSS': 'org_owner',
                                              'GENERAL_MANAGER': 'org_general_manager',
                                              'BRANCH_MANAGER': 'org_branch_manager',
                                              'DEPARTMENT_HEAD': 'org_department_head',
                                              'STAFF': 'org_staff'
                                          };
                                          const transKey = translationMap[level];
                                          if (transKey) return mt(transKey, lang as any);
                                          return getOrgLevelLabel(currentEmployee);
                                      })()}
                                  </span>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  {/* Stats Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                          { label: lang === 'my' ? 'ကုန်စ္စည်းပြတ်လပ်မှု' : '库存告急', value: mgmtStats.lowStock, icon: '📉', color: mgmtStats.lowStock > 0 ? 'border-red-200 bg-red-50/50' : 'border-stone-200 bg-white', textColor: mgmtStats.lowStock > 0 ? 'text-red-600 font-black' : 'text-stone-800 font-bold' },
                          { label: lang === 'my' ? 'ယနေ့ မှတ်တမ်း' : '今日日志', value: mgmtStats.todayLogs, icon: '📝', color: 'border-stone-200 bg-white', textColor: 'text-sky-600 font-bold' },
                          { label: lang === 'my' ? 'ခွင့်/ပျက်ကွက်' : '员工缺席', value: mgmtStats.absences, icon: '🤒', color: mgmtStats.absences > 0 ? 'border-orange-200 bg-orange-50/50' : 'border-stone-200 bg-white', textColor: mgmtStats.absences > 0 ? 'text-orange-600 font-black' : 'text-stone-800 font-bold' },
                          { label: lang === 'my' ? 'လုပ်ငန်းများ' : '待办任务', value: mgmtStats.pendingTasks, icon: '📋', color: mgmtStats.pendingTasks > 0 ? 'border-[#FFD200] bg-[#FFD200]/10' : 'border-stone-200 bg-white', textColor: mgmtStats.pendingTasks > 0 ? 'text-stone-800 font-black' : 'text-stone-500 font-bold' }
                      ].map(stat => (
                          <div key={stat.label} className={`rounded-xl border p-3 ${stat.color} transition-all shadow-xs`}>
                              <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm">{stat.icon}</span>
                                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">{stat.label}</span>
                              </div>
                              <div className={`text-2xl font-mono ${stat.textColor}`}>
                                  {statsLoading ? '...' : stat.value}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
      
      {/* HEADER */}
      <div className={`admin-dashboard-header ${isManagementStaff ? 'bg-white border-b border-stone-200 text-[#111111]' : 'bg-[#1A1A1A] border-b-4 border-[#FFD700] text-white'} p-4 md:p-6 sticky top-0 z-30 shadow-sm`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-3">
            {onBack && (
                 <button onClick={onBack} className={`mobile-touch-target p-1.5 md:p-2 rounded-full transition-colors flex items-center justify-center ${isManagementStaff ? 'bg-stone-100 hover:bg-stone-200 text-stone-700' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                     <ArrowLeft size={18} className="md:w-5 md:h-5" />
                 </button>
            )}
            <div>
                <h2 className={`text-lg md:text-xl font-serif font-black tracking-wide ${isManagementStaff ? 'text-[#111111]' : 'text-[#FFD700]'}`}>
                    {isSingleMode ? getPageTitle() : (lang === 'my' ? 'စီမံခန့်ခွဲသူ မျက်နှာပြင်' : '管理层控制台')}
                </h2>
                {!isSingleMode && (
                    <p className={`text-[10px] md:text-xs font-mono tracking-widest uppercase ${isManagementStaff ? 'text-stone-500' : 'text-gray-400'}`}>
                        {isManagementStaff ? `${currentEmployee?.name || ''} • MANAGEMENT` : 'MANAGEMENT CONSOLE'}
                    </p>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION - HIDDEN IN SINGLE MODE */}
      {!isSingleMode && availableTabs.length > 0 ? (
        <div className={`flex p-3 md:p-4 gap-2 overflow-x-auto ${isManagementStaff ? 'bg-stone-50 border-b border-stone-200' : 'bg-[#F5F5F5] border-b border-gray-200'} scrollbar-hide`}>
            {availableTabs.map(tab => {
                const isPermitted = hasPermission(tab.key as AppModule);
                const isActive = activeTab === tab.key;
                return (
                <button 
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)} 
                    className={`flex-none min-w-[80px] md:min-w-[100px] py-2.5 md:py-3 px-2 rounded-lg flex flex-col items-center justify-center gap-1 md:gap-1.5 font-bold transition-all active:scale-95 text-[10px] md:text-xs ${
                        isActive 
                            ? (isManagementStaff ? 'bg-[#FFD200] text-[#111111] shadow-xs border-b-2 border-stone-950 font-black' : 'bg-[#1A1A1A] text-[#FFD700] shadow-md border-b-4 border-[#C70000]') 
                            : (isManagementStaff ? 'bg-white text-stone-500 border border-stone-200 hover:bg-stone-50' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100')
                    }`}
                >
                    {tab.icon} <span className="truncate w-full text-center">{tab.label}</span>
                </button>
                );
            })}
        </div>
      ) : (
        // Spacer for Single Mode
        isSingleMode && <div className="admin-dashboard-spacer h-6 bg-stone-50"></div>
      )}

      {/* Empty State if no modules */}
      {!isSingleMode && availableTabs.length === 0 && (
        <div className="p-8 text-center text-gray-400">{lang === 'my' ? 'ဝင်ရောက်နိုင်သော လုပ်ဆောင်ချက်မရှိပါ' : '没有可访问的功能模块'}</div>
      )}

      {/* TAB CONTENT (ROUTER) */}
      <div className={`min-h-[50vh] ${isManagementStaff ? 'max-w-5xl mx-auto' : ''}`}>
         {activeTab === 'SETTLEMENT' && (
             <SettlementModule 
                storeConfig={storeConfig} 
                isStandalone={isSingleMode} // Embed if not single mode
                onClose={onBack} // Optional: Close button for Single Mode
             />
         )}
         {activeTab === 'KITCHEN_ALERT' && (
             <KitchenAlertModule employee={currentEmployee || defaultBossEmployee} lang={lang} />
         )}
         {activeTab === 'ROSTER' && <RosterModule onClose={handleModuleExit} allowedModules={allowedModules} />}
         {activeTab === 'ATTENDANCE_CONSOLE' && <AttendanceConsole onClose={handleModuleExit} />}
         {activeTab === 'LOGBOOK' && <LogbookModule viewOnly={false} currentEmployee={currentEmployee} />}
         {activeTab === 'LOGBOOK_VIEW' && <LogbookModule viewOnly={true} currentEmployee={currentEmployee} />}
         {activeTab === 'PROCUREMENT' && (
             <ProcurementModule onClose={handleModuleExit} />
         )}
         {activeTab === 'MENU_MANAGEMENT' && (
             <MenuManagement onClose={handleModuleExit} isModal={false} />
         )}
         {activeTab === 'INVENTORY_CHECK' && (
             <InventoryModule 
                allowedModules={allowedModules} 
                employee={currentEmployee} 
                lockedMode="CHECK" 
                initialSearchTerm={targetStockId}
                isManagementStaff={isManagementStaff}
                lang={lang}
                onClose={handleModuleExit}
             />
         )}
         {/* UNLOCK MASTER MODE FOR VIEW TAB */}
         {activeTab === 'INVENTORY_VIEW' && (
             <InventoryModule 
                allowedModules={allowedModules} 
                employee={currentEmployee} 
                initialMode="MASTER" 
                initialSearchTerm={targetStockId}
                isManagementStaff={isManagementStaff}
                lang={lang}
                onClose={handleModuleExit}
             />
         )}
         {activeTab === 'SOP_INSPECT' && <SOPInspection />}
         {activeTab === 'SUPPLIER_CONTACTS' && (
             <SupplierModule 
                isModal={false} 
                onNavigateToStock={handleNavigateToStock} 
             />
         )}
         {activeTab === 'QUEUE' && <QueueManager onOpenTV={handleOpenTVWrapper} />}
         {activeTab === 'ASSESSMENT' && <EmployeeAssessmentModule onClose={handleModuleExit} currentEmployee={currentEmployee} />}
         {activeTab === 'AP' && (
             <AccountsPayableModule 
                onClose={handleModuleExit} 
                onNavigateToSelfVoucher={(prefill) => {
                    const isBoss = !allowedModules || allowedModules.length === 0;
                    if (isBoss || allowedModules.includes('SELF_INVOICE')) {
                        localStorage.setItem('klk_prefill_self_invoice', JSON.stringify(prefill));
                        setActiveTab('SELF_INVOICE');
                    } else {
                        alert(lang === 'my' ? "သင့်တွင် ကိုယ်တိုင်ထုတ်ပြေစာ စာမျက်နှာကို ဝင်ရောက်ခွင့်မရှိပါ" : "您没有自制凭单模块的访问权限");
                    }
                }} 
             />
         )}
         {activeTab === 'SELF_INVOICE' && (
             <SelfInvoiceModule 
                onClose={handleModuleExit} 
             />
         )}
      </div>
    </div>
  );
};
