// components/AdminDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, BookOpen, CalendarOff, ClipboardCheck, Package, ArrowLeft, Truck, Armchair, Eye, CheckSquare, Clock, ShoppingCart, Utensils, Award, CreditCard, FileText } from 'lucide-react';
import { StoreConfig, AppModule, Employee } from '../types';
import { DataManager } from '../utils/dataManager';

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

interface ManagerDashboardProps {
    onBack?: () => void; 
    allowedModules?: AppModule[]; 
    initialTab?: 'SETTLEMENT' | 'ROSTER' | 'LOGBOOK' | 'LOGBOOK_VIEW' | 'SOP_INSPECT' | 'INVENTORY_CHECK' | 'INVENTORY_VIEW' | 'SUPPLIER_CONTACTS' | 'QUEUE' | 'ATTENDANCE_CONSOLE' | 'PROCUREMENT' | 'MENU_MANAGEMENT' | 'ASSESSMENT' | 'AP' | 'SELF_INVOICE';
    isSingleMode?: boolean;
    onOpenTV?: () => void;
    currentEmployee?: Employee; 
    isManagementStaff?: boolean;
    lang?: 'zh' | 'my';
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ onBack, allowedModules, initialTab, isSingleMode = false, onOpenTV, currentEmployee, isManagementStaff = false, lang = 'zh' }) => {
  const [activeTab, setActiveTab] = useState<'SETTLEMENT' | 'ROSTER' | 'LOGBOOK' | 'LOGBOOK_VIEW' | 'SOP_INSPECT' | 'INVENTORY_CHECK' | 'INVENTORY_VIEW' | 'SUPPLIER_CONTACTS' | 'QUEUE' | 'ATTENDANCE_CONSOLE' | 'PROCUREMENT' | 'MENU_MANAGEMENT' | 'ASSESSMENT' | 'AP' | 'SELF_INVOICE'>('SETTLEMENT');
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
              const [kStock, bStock, gStock, logs, rosterData, tasks] = await Promise.all([
                  DataManager.getStock('KITCHEN'), DataManager.getStock('BAR'), DataManager.getStock('GENERAL'),
                  DataManager.getLogs(), DataManager.getRosterData(), DataManager.getInventoryTasks()
              ]);
              
              if (!isMounted) return;

              const allStock = [...kStock, ...bStock, ...gStock];
              // 防御性编程：以防 minLevel 是 undefined
              const lowItems = allStock.filter(i => i.currentQty <= (i.minLevel || 0)).length;
              
              const now = new Date(); 
              if (now.getHours() < 4) now.setDate(now.getDate() - 1);
              const dateStr = now.toISOString().split('T')[0];
              
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
         tabs.push({ key: 'QUEUE', label: '排队取号', icon: <Armchair size={18} /> });
     }
     if (showAll || allowedModules?.includes('SETTLEMENT')) {
         tabs.push({ key: 'SETTLEMENT', label: '每日结算', icon: <Calculator size={18} /> });
     }
     if (showAll || allowedModules?.includes('ROSTER') || allowedModules?.includes('ROSTER_KITCHEN') || allowedModules?.includes('ROSTER_FLOOR')) {
         tabs.push({ key: 'ROSTER', label: '排班缺席', icon: <CalendarOff size={18} /> });
     }
     if (showAll || allowedModules?.includes('ATTENDANCE_CONSOLE')) {
         tabs.push({ key: 'ATTENDANCE_CONSOLE', label: '考勤总控', icon: <Clock size={18} /> });
     }
     if (showAll || allowedModules?.includes('ASSESSMENT')) {
         tabs.push({ key: 'ASSESSMENT', label: '能力评测', icon: <Award size={18} /> });
     }
     if (showAll || allowedModules?.includes('PROCUREMENT')) {
         tabs.push({ key: 'PROCUREMENT', label: '智能订货', icon: <ShoppingCart size={18} /> });
     }
     if (showAll || allowedModules?.includes('MENU_MANAGEMENT')) {
         tabs.push({ key: 'MENU_MANAGEMENT', label: '智能菜谱', icon: <Utensils size={18} /> });
     }
     if (showAll || allowedModules?.includes('LOGBOOK')) {
         tabs.push({ key: 'LOGBOOK', label: '运营日志', icon: <BookOpen size={18} /> });
     }
     if (showAll || allowedModules?.includes('SOP_INSPECT')) {
         tabs.push({ key: 'SOP_INSPECT', label: 'SOP 稽查', icon: <ClipboardCheck size={18} /> });
     }
     // INVENTORY LOGIC REFINED
     if (showAll || allowedModules?.some(m => m.startsWith('INVENTORY'))) {
         // Everyone with any inventory module sees Check
         tabs.push({ key: 'INVENTORY_CHECK', label: '库存盘点', icon: <CheckSquare size={18} /> });
         
         // Only Boss (showAll) sees View/Master. Staff with restricted modules CANNOT see View.
         if (showAll) {
             tabs.push({ key: 'INVENTORY_VIEW', label: '库存总览', icon: <Eye size={18} /> });
         }
     }
     if (showAll || allowedModules?.includes('SUPPLIER_CONTACTS')) {
         tabs.push({ key: 'SUPPLIER_CONTACTS', label: '供应商', icon: <Truck size={18} /> });
     }
     if (showAll || allowedModules?.includes('AP')) {
         tabs.push({ key: 'AP', label: '应付账款', icon: <CreditCard size={18} /> });
     }
     if (showAll || allowedModules?.includes('SELF_INVOICE')) {
         tabs.push({ key: 'SELF_INVOICE', label: '自制凭单', icon: <FileText size={18} /> });
     }
     return tabs;
  }, [allowedModules]);

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
          alert("您没有权限查看库存模块");
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
    <div className={`${isManagementStaff ? 'min-h-screen bg-[#0D0D0D]' : 'max-w-5xl mx-auto'} pb-32`}>
      {/* MANAGEMENT STATS PANEL (Only for management staff) */}
      {isManagementStaff && currentEmployee && (
          <div className="bg-gradient-to-br from-[#1A1A1A] via-[#111] to-[#0A0A0A] pt-6 pb-10 px-4 md:px-6 border-b-2 border-[#FFD700]/30 relative overflow-hidden">
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/dark-geometric.png")' }}></div>
              <div className="relative z-10 max-w-5xl mx-auto">
                  <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black shadow-lg border-2 border-[#FFD700]/50 overflow-hidden ${currentEmployee.avatar ? '' : 'bg-[#FFD700] text-black'}`}>
                              {currentEmployee.avatar ? <img src={currentEmployee.avatar} className="w-full h-full object-cover"/> : currentEmployee.name.charAt(0)}
                          </div>
                          <div>
                              <h2 className="text-lg font-black text-white tracking-wide">{currentEmployee.name}</h2>
                              <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-[#FFD700] font-bold uppercase tracking-widest">{currentEmployee.role?.split('(')[0]}</span>
                                  {currentEmployee.rank && <span className="bg-[#FFD700]/20 text-[#FFD700] text-[9px] px-2 py-0.5 rounded-full font-bold border border-[#FFD700]/30">{currentEmployee.rank}</span>}
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  {/* Stats Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                          { label: '库存告急', value: mgmtStats.lowStock, icon: '📉', color: mgmtStats.lowStock > 0 ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/5', textColor: mgmtStats.lowStock > 0 ? 'text-red-400' : 'text-white/50' },
                          { label: '今日日志', value: mgmtStats.todayLogs, icon: '📝', color: 'border-white/10 bg-white/5', textColor: 'text-blue-400' },
                          { label: '员工缺席', value: mgmtStats.absences, icon: '🤒', color: mgmtStats.absences > 0 ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/10 bg-white/5', textColor: mgmtStats.absences > 0 ? 'text-orange-400' : 'text-white/50' },
                          { label: '待办任务', value: mgmtStats.pendingTasks, icon: '📋', color: mgmtStats.pendingTasks > 0 ? 'border-[#FFD700]/50 bg-[#FFD700]/10' : 'border-white/10 bg-white/5', textColor: mgmtStats.pendingTasks > 0 ? 'text-[#FFD700]' : 'text-white/50' }
                      ].map(stat => (
                          <div key={stat.label} className={`rounded-xl border p-3 ${stat.color} transition-all`}>
                              <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm">{stat.icon}</span>
                                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{stat.label}</span>
                              </div>
                              <div className={`text-2xl font-mono font-black ${stat.textColor}`}>
                                  {statsLoading ? '...' : stat.value}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
      
      {/* HEADER */}
      <div className={`${isManagementStaff ? 'bg-[#1A1A1A] border-b border-[#FFD700]/20' : 'bg-[#1A1A1A] border-b-4 border-[#FFD700]'} text-white p-4 md:p-6 sticky ${isManagementStaff ? 'top-[64px] md:top-[72px]' : 'top-[64px] md:top-[72px]'} z-30 shadow-lg`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-3">
            {onBack && (
                 <button onClick={onBack} className="p-1.5 md:p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
                     <ArrowLeft size={18} className="md:w-5 md:h-5" />
                 </button>
            )}
            <div>
                <h2 className="text-lg md:text-xl font-serif font-bold text-[#FFD700] tracking-wide">
                    {isSingleMode ? getPageTitle() : isManagementStaff ? '管理层控制台' : '管理层控制台'}
                </h2>
                {!isSingleMode && <p className="text-[10px] md:text-xs text-gray-400 font-mono tracking-widest uppercase">{isManagementStaff ? `${currentEmployee?.name || ''} • MANAGEMENT` : 'MANAGEMENT CONSOLE'}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION - HIDDEN IN SINGLE MODE */}
      {!isSingleMode && availableTabs.length > 0 ? (
        <div className={`flex p-3 md:p-4 gap-2 overflow-x-auto ${isManagementStaff ? 'bg-[#111] border-b border-white/10' : 'bg-[#F5F5F5] border-b border-gray-200'} scrollbar-hide`}>
            {availableTabs.map(tab => {
                const isPermitted = hasPermission(tab.key as AppModule);
                return (
                <button 
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)} 
                    className={`flex-none min-w-[80px] md:min-w-[100px] py-2.5 md:py-3 px-2 rounded-lg flex flex-col items-center justify-center gap-1 md:gap-1.5 font-bold transition-all active:scale-95 text-[10px] md:text-xs ${
                        activeTab === tab.key 
                            ? (isManagementStaff ? 'bg-[#FFD700] text-black shadow-md shadow-[#FFD700]/20' : 'bg-[#1A1A1A] text-[#FFD700] shadow-md border-b-4 border-[#C70000]') 
                            : (isManagementStaff ? 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100')
                    }`}
                >
                    {tab.icon} <span className="truncate w-full text-center">{tab.label}</span>
                </button>
                );
            })}
        </div>
      ) : (
        // Spacer for Single Mode
        isSingleMode && <div className="h-6 bg-gray-50"></div>
      )}

      {/* Empty State if no modules */}
      {!isSingleMode && availableTabs.length === 0 && (
        <div className="p-8 text-center text-gray-400">没有可访问的功能模块</div>
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
                        alert("您没有自制凭单模块的访问权限");
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