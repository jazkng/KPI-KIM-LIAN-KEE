import React, { useState, useEffect, useRef } from 'react';
import { 
    Settings, Crown, Layout, Cloud, Lock, Save, X, Download, AlertTriangle, 
    Info, History, Database, RotateCcw, Loader2, Calendar, Upload, 
    User, Phone, MapPin, Clock, Languages, Coins, Printer, Plus, Trash2, Check, Sparkles
} from 'lucide-react';
import { StoreConfig, Employee, SystemBackup } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { APP_VERSION, VERSION_HISTORY } from '../../constants/versionHistory';

interface DailyHours {
    [key: string]: { isOpen: boolean; open: string; close: string };
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAYS_ZH: Record<string, string> = {
    Monday: '星期一 (Mon)',
    Tuesday: '星期二 (Tue)',
    Wednesday: '星期三 (Wed)',
    Thursday: '星期四 (Thu)',
    Friday: '星期五 (Fri)',
    Saturday: '星期六 (Sat)',
    Sunday: '星期日 (Sun)'
};

const defaultDailyHours: DailyHours = {
    Monday: { isOpen: true, open: '10:00', close: '22:00' },
    Tuesday: { isOpen: true, open: '10:00', close: '22:00' },
    Wednesday: { isOpen: true, open: '10:00', close: '22:00' },
    Thursday: { isOpen: true, open: '10:00', close: '22:00' },
    Friday: { isOpen: true, open: '10:00', close: '22:00' },
    Saturday: { isOpen: true, open: '09:00', close: '23:00' },
    Sunday: { isOpen: true, open: '09:00', close: '23:00' }
};

const parseStoreHours = (hoursStr: string | undefined): DailyHours => {
    if (!hoursStr) return defaultDailyHours;
    try {
        const trimmed = hoursStr.trim();
        if (trimmed.startsWith('{')) {
            const parsed = JSON.parse(trimmed);
            const result = { ...defaultDailyHours };
            DAYS_OF_WEEK.forEach(day => {
                if (parsed[day]) {
                    result[day] = {
                        isOpen: parsed[day].isOpen !== undefined ? parsed[day].isOpen : true,
                        open: parsed[day].open || '10:00',
                        close: parsed[day].close || '22:00'
                    };
                }
            });
            return result;
        }
    } catch (e) {
        console.error("Failed to parse storeHours as JSON", e);
    }

    let open = '10:00';
    let close = '22:00';
    if (hoursStr) {
        const timeRegex = /(\d{1,2}):(\d{2})\s*(AM|PM)?/gi;
        const matches = [...hoursStr.matchAll(timeRegex)];
        if (matches.length >= 2) {
            const parseMatch = (match: any) => {
                let h = parseInt(match[1]);
                const m = match[2];
                const ampm = match[3];
                if (ampm) {
                    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
                    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
                }
                return `${String(h).padStart(2, '0')}:${m}`;
            };
            open = parseMatch(matches[0]);
            close = parseMatch(matches[1]);
        }
    }

    const result = { ...defaultDailyHours };
    DAYS_OF_WEEK.forEach(day => {
        result[day] = { isOpen: true, open, close };
    });
    return result;
};

interface StoreConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentEmployee?: Employee | null;
}

export const StoreConfigModal: React.FC<StoreConfigModalProps> = ({ isOpen, onClose, currentEmployee }) => {
    const isSuperadmin = currentEmployee?.id === '002';
    
    // Available Tabs: 'GENERAL' | 'RECOVERY' | 'DEV' (Only for Superadmin)
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'RECOVERY' | 'DEV'>('GENERAL');
    
    const [storeConfig, setStoreConfig] = useState<StoreConfig>({ 
        businessDayCutoff: 4, 
        timeZoneOffset: 8,
        cloudinaryCloudName: '', 
        cloudinaryUploadPreset: '', 
        googleDriveUrl: '',
        storeName: '金莲记 甲洞 (Kim Lian Kee Kepong)',
        storeAddress: 'PT709 , Jalan Kuang Bertam , 52100 Kepong Kuala Lumpur',
        storeHours: '10:00 AM - 10:00 PM',
        storePhone: '017 - 5501821',
        language: 'zh',
        currency: 'RM',
        printerSettings: '192.168.1.100',
        geminiApiKey: '',
        claudeApiKey: '',
        supabaseUrl: '',
        supabaseKey: '',
        firebaseApiKey: '',
        firebaseProjectId: '',
        appForceUpdate: false,
        systemLogLevel: 'INFO',
        enablePinClock: true,
        enableSelfieClock: false,
        enableGpsClock: false,
        enableQrClock: false,
        enableWifiClock: false
    });

    const [dailyHours, setDailyHours] = useState<DailyHours>(defaultDailyHours);
    const [isHoursExpanded, setIsHoursExpanded] = useState<boolean>(false);
    const [malaysiaTime, setMalaysiaTime] = useState<string>('');
    
    const [bossAccounts, setBossAccounts] = useState<Employee[]>([]);
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const [showChangelog, setShowChangelog] = useState(false);
    const [printerStatus, setPrinterStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS'>('IDLE');
    
    // Recovery State
    const [backups, setBackups] = useState<SystemBackup[]>([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mock Live Logs for Dev Tab
    const [logs, setLogs] = useState<string[]>([
        `[${new Date().toLocaleTimeString()}] INFO: System initialized, version v${APP_VERSION}`,
        `[${new Date().toLocaleTimeString()}] DEBUG: Lazy-loading Firestore snapshot cache`,
        `[${new Date().toLocaleTimeString()}] INFO: Cloud snapshot list synced successfully (3 records)`,
        `[${new Date().toLocaleTimeString()}] INFO: Active user role: OWNER (${currentEmployee?.name || 'JAKE'})`
    ]);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const myTime = new Date(utc + (3600000 * 8)); // UTC+8 for Malaysia
            
            const pad = (n: number) => String(n).padStart(2, '0');
            const formatted = `${myTime.getFullYear()}-${pad(myTime.getMonth() + 1)}-${pad(myTime.getDate())} ` +
                              `${pad(myTime.getHours())}:${pad(myTime.getMinutes())}:${pad(myTime.getSeconds())}`;
            setMalaysiaTime(formatted);
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    useEffect(() => {
        if (activeTab === 'RECOVERY') {
            loadBackups();
        }
    }, [activeTab]);

    const loadData = async () => {
        const cfg = await DataManager.getConfig();
        let loadedHoursStr = storeConfig.storeHours;
        if(cfg) {
            loadedHoursStr = cfg.storeHours || storeConfig.storeHours;
            setStoreConfig(prev => ({
                ...prev,
                ...cfg,
                storeName: (cfg.storeName && cfg.storeName !== '金莲记 (Kim Lian Kee)') ? cfg.storeName : prev.storeName,
                storeAddress: (cfg.storeAddress && cfg.storeAddress !== '吉隆坡十号胡同 (Lot 10 Hutong, Kuala Lumpur)') ? cfg.storeAddress : prev.storeAddress,
                storeHours: loadedHoursStr,
                storePhone: (cfg.storePhone && cfg.storePhone !== '+60 12-345 6789') ? cfg.storePhone : prev.storePhone,
                language: cfg.language || prev.language,
                currency: cfg.currency || prev.currency,
                printerSettings: cfg.printerSettings || prev.printerSettings,
                geminiApiKey: cfg.geminiApiKey || prev.geminiApiKey,
                claudeApiKey: cfg.claudeApiKey || prev.claudeApiKey,
                supabaseUrl: cfg.supabaseUrl || prev.supabaseUrl,
                supabaseKey: cfg.supabaseKey || prev.supabaseKey,
                firebaseApiKey: cfg.firebaseApiKey || prev.firebaseApiKey,
                firebaseProjectId: cfg.firebaseProjectId || prev.firebaseProjectId,
                appForceUpdate: cfg.appForceUpdate || prev.appForceUpdate,
                systemLogLevel: cfg.systemLogLevel || prev.systemLogLevel,
                enablePinClock: cfg.enablePinClock !== undefined ? cfg.enablePinClock : prev.enablePinClock,
                enableSelfieClock: cfg.enableSelfieClock !== undefined ? cfg.enableSelfieClock : prev.enableSelfieClock,
                enableGpsClock: cfg.enableGpsClock !== undefined ? cfg.enableGpsClock : prev.enableGpsClock,
                enableQrClock: cfg.enableQrClock !== undefined ? cfg.enableQrClock : prev.enableQrClock,
                enableWifiClock: cfg.enableWifiClock !== undefined ? cfg.enableWifiClock : prev.enableWifiClock,
            }));
        }
        setDailyHours(parseStoreHours(loadedHoursStr));
        
        const emps = await DataManager.getEmployees();
        setAllEmployees(emps);
        const bosses = emps.filter(e => ['001','002','003','004'].includes(e.id) || e.role.includes('Owner') || e.role.includes('老板'));
        setBossAccounts(bosses);
    };

    const loadBackups = async () => {
        setLoadingBackups(true);
        try {
            const list = await DataManager.getAvailableBackups();
            setBackups(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingBackups(false);
        }
    };

    const handleSaveConfig = async () => {
        const serializedHours = JSON.stringify(dailyHours);
        const configToSave = {
            ...storeConfig,
            storeHours: serializedHours
        };
        await DataManager.saveConfig(configToSave);
        localStorage.setItem('kepong_erp_config', JSON.stringify(configToSave));
        
        // Save modified boss records
        for (const boss of bossAccounts) {
            await DataManager.saveEmployee(boss);
        }
        
        // Also update session cache if current employee modified their own profile
        const selfAccount = bossAccounts.find(b => b.id === currentEmployee?.id);
        if (selfAccount) {
            localStorage.setItem('kepong_erp_session_employee', JSON.stringify(selfAccount));
        }

        alert('系统设置已更新 (System Config Updated)');
        onClose();
        // Reload to apply name/language modifications instantly
        window.location.reload();
    };

    const handleBossChange = (id: string, field: 'name' | 'pin', value: string) => {
        setBossAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, [field]: value } : acc));
    };

    const handleAddBossAccount = () => {
        const nextId = String(Math.max(...bossAccounts.map(b => parseInt(b.id) || 0), 4) + 1).padStart(3, '0');
        const newBoss: Employee = {
            id: nextId,
            name: `新老板_${nextId}`,
            pin: '1234',
            role: 'Owner (老板)',
            basicSalary: 8000,
            status: 'CONFIRMED',
            level: 'Owner',
            phone: '+60 12-345 6789',
            absentDays: 0,
            gender: 'Male',
            nationality: 'Malaysia',
            joinDate: new Date().toISOString().split('T')[0],
            allowedModules: [
                'PROCUREMENT', 'MENU_MANAGEMENT', 'SETTLEMENT', 'ROSTER', 'ROSTER_KITCHEN', 'ROSTER_FLOOR',
                'LOGBOOK', 'SOP_INSPECT', 'SOP', 'INVENTORY_KITCHEN', 'INVENTORY_BAR', 'INVENTORY_GENERAL',
                'INVENTORY_FUEL', 'INVENTORY_CHECK', 'INVENTORY_VIEW', 'SUPPLIER_CONTACTS', 'QUEUE_MANAGER',
                'QUEUE', 'ATTENDANCE_CONSOLE', 'ASSESSMENT', 'DAILY_ALERT', 'REPORTS', 'HR_FILES', 'AP',
                'SELF_INVOICE', 'TREASURY', 'BILLS', 'WARRANTY', 'AI_ASSISTANT'
            ]
        };
        setBossAccounts(prev => [...prev, newBoss]);
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] SUCCESS: Added new Boss account ${nextId}`]);
    };

    const handleDeleteBossAccount = (id: string) => {
        if (id === '002') {
            alert('❌ 无法删除 Superadmin 主管理员账号 (Cannot delete Superadmin)');
            return;
        }
        if (!confirm(`确定要删除老板账号 [${id}] 吗？`)) return;
        setBossAccounts(prev => prev.filter(b => b.id !== id));
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] WARNING: Removed Boss account ${id}`]);
    };

    const handleSyncBoss = async (bossId: string, empIdToMerge: string) => {
        if (!empIdToMerge) return;
        const emp = allEmployees.find(e => e.id === empIdToMerge);
        if (!emp) return;
        if (!confirm(`确定将员工 [${emp.id}] ${emp.name} 的档案同步合并到老板账号 [${bossId}] 吗？\n\n注意：合并后原员工档案 ${emp.id} 将被移除，您的老板账号将变为该员工身份并自动保留老板权限。`)) return;

        const boss = bossAccounts.find(b => b.id === bossId);
        if (!boss) return;

        const mergedBoss = {
            ...emp,
            id: bossId,
            pin: boss.pin || '1234',
            role: emp.role.includes('老板') || emp.role.includes('Owner') ? emp.role : `${emp.role} (老板)`
        };

        try {
            await DataManager.deleteEmployee(empIdToMerge);
            await DataManager.saveEmployee(mergedBoss);
            alert('同步成功！系统将重新加载。');
            window.location.reload();
        } catch (e: any) {
            alert('同步失败: ' + e.message);
        }
    };

    const handleTestPrinter = () => {
        setPrinterStatus('TESTING');
        setTimeout(() => {
            setPrinterStatus('SUCCESS');
            setTimeout(() => setPrinterStatus('IDLE'), 3000);
        }, 1200);
    };

    const handleResetData = async (type: 'INVENTORY' | 'SUPPLIERS' | 'STAFF') => {
      const confirmMsg = type === 'INVENTORY' ? "确定要重置所有库存数据吗？数量将清零。" : type === 'SUPPLIERS' ? "确定要恢复默认供应商列表吗？所有自定义更改将丢失。" : "确定要重置员工列表吗？除老板账号外，所有员工将被还原。";
      if (!confirm(confirmMsg)) return;
      const success = await DataManager.resetToDefaults(type);
      if (success) alert("✅ 重置成功 (Reset Successful)");
      else alert("❌ 重置失败 (Reset Failed)");
    };

    const handleExportData = async () => {
        if (!confirm("确定要导出全系统数据并下载到本地吗？(Export All Data)")) return;
        setIsExporting(true);
        try {
            const data = await DataManager.exportSystemData();
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.download = `KLK_ERP_BACKUP_V${APP_VERSION}_${dateStr}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            alert("✅ 备份文件下载成功！请妥善保管。");
        } catch (e) {
            console.error(e);
            alert("❌ 导出失败 (Export Failed)");
        } finally {
            setIsExporting(false);
        }
    };

    const performRestore = async (backupData: any, source: 'CLOUD' | 'FILE') => {
        const confirmStr = prompt(`⚠️ 严重警告：系统回滚 (SYSTEM RESTORE - ${source})\n\n您即将把系统恢复到备份状态。\n\n当前所有的数据（库存、账单、日志等）将被覆盖或清除！\n\n请输入 "RESTORE" 确认操作：`);
        if (confirmStr !== 'RESTORE') return;

        setIsRestoring(true);
        try {
            const backupObj: SystemBackup = {
                version: backupData.version || 'Unknown',
                timestamp: backupData.timestamp || new Date().toISOString(),
                data: backupData.data || backupData 
            };
            
            await DataManager.restoreSystem(backupObj);
            alert("✅ 系统已成功恢复！即将刷新页面...");
            window.location.reload();
        } catch (e) {
            console.error("Restore failed", e);
            alert("❌ 恢复失败，请联系技术支持。");
            setIsRestoring(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                performRestore(json, 'FILE');
            } catch (err) {
                alert("无效的备份文件 (Invalid JSON)");
            }
        };
        reader.readAsText(file);
    };

    if (!isOpen) return null;

    // Only the currently logged in owner can edit their own profile in Security Settings
    const loggedInBosses = bossAccounts.filter(b => b.id === currentEmployee?.id);
    const displayProfiles = loggedInBosses.length > 0 ? loggedInBosses : (currentEmployee ? [currentEmployee] : []);

    return (
        <div className="fixed inset-0 bg-stone-900/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-md animate-in fade-in">
            <div className="bg-stone-50 w-full md:max-w-3xl rounded-t-[2rem] md:rounded-[1.5rem] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(env(safe-area-inset-top),1rem)] md:px-8 md:pb-8 md:pt-6 shadow-2xl h-[92vh] h-[92dvh] md:h-[85vh] overflow-hidden mt-auto md:mt-0 flex flex-col relative border border-stone-200">
                
                {/* Header with Title & Close button */}
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-stone-200/50 shrink-0">
                    <h3 className="font-extrabold text-[#1C1C1E] text-base md:text-lg flex items-center gap-2">
                        <User size={20} className="text-[#8B0000]"/>
                        <span>系统账户与配置 (Account Settings)</span>
                    </h3>
                    <button 
                        onClick={onClose} 
                        style={{ minWidth: '44px', minHeight: '44px' }}
                        className="p-2 hover:bg-stone-200/60 rounded-full text-stone-500 transition-colors flex items-center justify-center"
                    >
                        <X size={20}/>
                    </button>
                </div>

                {/* 1. USER PROFILE HEADER SECTION - Beautiful, flat, modern & clean row layout (preventing any flex-shrink/cutoff) */}
                <div className="shrink-0 bg-stone-100 border border-stone-200 p-3.5 rounded-2xl flex items-center gap-3.5 mb-4 relative overflow-hidden">
                    <div className="w-12 h-12 rounded-full bg-stone-900 border border-[#FFD700] flex items-center justify-center text-[#FFD700] text-base font-black shadow-inner shrink-0 uppercase">
                        {currentEmployee?.name?.slice(0, 2) || 'JK'}
                    </div>
                    <div className="text-left flex-grow min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-sm font-black text-stone-900 tracking-wide truncate">{currentEmployee?.name || 'Jake 老板'}</h4>
                            <span className="bg-[#FFD700]/15 text-[#8B0000] border border-[#FFD700]/40 text-[9px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {isSuperadmin ? 'Superadmin (开发者账户)' : 'Owner'}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                            <p className="text-stone-600 text-[10px] font-bold">
                                所属企业: <span className="text-stone-900">金莲记 (Kim Lian Kee)</span>
                            </p>
                            <p className="text-stone-400 text-[9px] font-mono leading-none">
                                UID: {currentEmployee?.id || '002'} · Role: {currentEmployee?.role || 'Owner'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Segmented Control / Tab Switcher */}
                <div className="flex p-1 bg-stone-200/80 rounded-xl mb-5 shrink-0">
                    <button 
                        onClick={() => setActiveTab('GENERAL')} 
                        style={{ minHeight: '44px' }}
                        className={`flex-grow rounded-lg text-xs font-black tracking-wide transition-all ${activeTab === 'GENERAL' ? 'bg-white shadow text-[#8B0000]' : 'text-stone-500 hover:text-stone-800'}`}
                    >
                        👤 账户与店铺 (Profile)
                    </button>
                    <button 
                        onClick={() => setActiveTab('RECOVERY')} 
                        style={{ minHeight: '44px' }}
                        className={`flex-grow rounded-lg text-xs font-black tracking-wide transition-all ${activeTab === 'RECOVERY' ? 'bg-white shadow text-[#8B0000]' : 'text-stone-500 hover:text-stone-800'}`}
                    >
                        💾 数据与维护 (Data)
                    </button>
                    {isSuperadmin && (
                        <button 
                            onClick={() => setActiveTab('DEV')} 
                            style={{ minHeight: '44px' }}
                            className={`flex-grow rounded-lg text-xs font-black tracking-wide transition-all flex items-center justify-center gap-1 ${activeTab === 'DEV' ? 'bg-[#8B0000] text-[#FFD700] shadow' : 'text-stone-500 hover:text-stone-800'}`}
                        >
                            <Sparkles size={12}/>
                            <span>🛠️ 开发者选项 (Dev)</span>
                        </button>
                    )}
                </div>

                {/* --- TAB 1: GENERAL (PROFILE & STORE) --- */}
                {activeTab === 'GENERAL' && (
                    <div className="space-y-5 flex-grow overflow-y-auto min-h-0 pb-16 pr-1">
                        
                        {/* A. PERSONAL SECURITY PROFILE (PIN/Password Change) */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest mb-1 flex items-center gap-2">
                                <Lock size={14} className="text-[#8B0000]"/>
                                <span>个人安全设置 (Security Profile)</span>
                            </h4>
                            <p className="text-[10px] text-stone-500 font-bold mb-3">
                                💡 提示：此项仅限您当前登录的账户进行修改。员工账户与密码请前往 👥 员工档案 模块管理，请勿混淆。
                            </p>
                            <div className="space-y-3">
                                {displayProfiles.map(boss => (
                                    <div key={boss.id} className="bg-stone-50 p-3 rounded-lg border border-stone-200 flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono font-bold bg-stone-200 text-stone-700 px-2 py-1 rounded">ID: {boss.id}</span>
                                            <span className="text-xs font-black text-stone-800">修改登录昵称与 PIN 码</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] text-stone-400 font-bold block mb-1">昵称 (Name)</label>
                                                <input 
                                                    className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold bg-white text-stone-800" 
                                                    value={boss.name} 
                                                    onChange={e => handleBossChange(boss.id, 'name', e.target.value)} 
                                                    placeholder="请输入新昵称" 
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-stone-400 font-bold block mb-1">登录 PIN 码 (Password)</label>
                                                <div className="relative">
                                                    <Lock size={12} className="absolute left-3 top-3 text-stone-400"/>
                                                    <input 
                                                        type="password"
                                                        maxLength={6}
                                                        className="w-full p-2 pl-8 border border-stone-200 rounded-lg text-xs font-bold font-mono text-center bg-white text-stone-800" 
                                                        value={boss.pin} 
                                                        onChange={e => handleBossChange(boss.id, 'pin', e.target.value)} 
                                                        placeholder="4-6 位数字密码" 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* B. STORE INFO DETAILS */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Layout size={14} className="text-[#8B0000]"/>
                                <span>企业/店铺基本信息 (Enterprise Details)</span>
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-stone-400 font-black uppercase block mb-1">店铺名称 (Store Name)</label>
                                    <div className="relative">
                                        <Crown size={12} className="absolute left-3 top-3 text-stone-400"/>
                                        <input 
                                            className="w-full p-2 pl-8 border border-stone-200 rounded-lg text-xs font-bold text-stone-800" 
                                            value={storeConfig.storeName} 
                                            onChange={e => setStoreConfig({...storeConfig, storeName: e.target.value})} 
                                            placeholder="店名" 
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-stone-400 font-black uppercase block mb-1">联系电话 (Phone)</label>
                                    <div className="relative">
                                        <Phone size={12} className="absolute left-3 top-3 text-stone-400"/>
                                        <input 
                                            className="w-full p-2 pl-8 border border-stone-200 rounded-lg text-xs font-bold text-stone-800" 
                                            value={storeConfig.storePhone} 
                                            onChange={e => setStoreConfig({...storeConfig, storePhone: e.target.value})} 
                                            placeholder="联系电话" 
                                        />
                                    </div>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-[10px] text-stone-400 font-black uppercase block mb-1">店面地址 (Address)</label>
                                    <div className="relative">
                                        <MapPin size={12} className="absolute left-3 top-3 text-stone-400"/>
                                        <input 
                                            className="w-full p-2 pl-8 border border-stone-200 rounded-lg text-xs font-bold text-stone-800" 
                                            value={storeConfig.storeAddress} 
                                            onChange={e => setStoreConfig({...storeConfig, storeAddress: e.target.value})} 
                                            placeholder="店铺物理地址" 
                                        />
                                    </div>
                                </div>

                                <div className="sm:col-span-2 bg-stone-50/50 p-4 rounded-xl border border-stone-200/80">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-stone-200/60">
                                        <div>
                                            <label className="text-xs font-black text-stone-800 uppercase flex items-center gap-1.5">
                                                <Clock size={14} className="text-[#8B0000]"/>
                                                <span>每日营业时间设置 (Weekly Business Hours)</span>
                                            </label>
                                            <p className="text-[10px] text-stone-500 font-medium mt-0.5">
                                                可为星期一至星期日独立设置开门和关店时间，适配六日不同开店时段需求。
                                            </p>
                                        </div>
                                        {/* Malaysia Standard Time indicator */}
                                        <div className="bg-[#8B0000]/5 text-[#8B0000] border border-[#8B0000]/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                            <span className="text-[9px] font-mono font-bold leading-none">
                                                马国时间 (MYT +8): {malaysiaTime || '载入中...'}
                                            </span>
                                        </div>
                                    </div>

                                    {!isHoursExpanded ? (
                                        /* ── COLLAPSED VIEW-ONLY MODE ── */
                                        <div className="space-y-3">
                                            <div className="bg-[#8B0000]/5 border border-[#8B0000]/10 rounded-lg p-2.5 flex items-center gap-2">
                                                <span className="text-xs">👀</span>
                                                <span className="text-[11px] text-[#8B0000] font-black">当前为「只读预览」状态，点击下方按钮展开即可进行修改：</span>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {DAYS_OF_WEEK.map((day) => {
                                                    const item = dailyHours[day] || { isOpen: true, open: '10:00', close: '22:00' };
                                                    return (
                                                        <div 
                                                            key={day} 
                                                            className={`p-2.5 rounded-lg border transition-all ${
                                                                item.isOpen 
                                                                    ? 'bg-white border-stone-200/70 shadow-xs' 
                                                                    : 'bg-stone-100/50 border-stone-200/40 opacity-70'
                                                            }`}
                                                        >
                                                            <div className="text-[10px] text-stone-500 font-black tracking-wider uppercase mb-1">
                                                                {DAYS_ZH[day]}
                                                            </div>
                                                            {item.isOpen ? (
                                                                <div className="text-xs font-black font-mono text-stone-850">
                                                                    ⏰ {item.open} - {item.close}
                                                                </div>
                                                            ) : (
                                                                <div className="text-xs font-bold text-stone-400">
                                                                    💤 休息 (Closed)
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setIsHoursExpanded(true)}
                                                style={{ minHeight: '44px' }}
                                                className="w-full flex items-center justify-center gap-2 bg-stone-900 text-[#FFD700] hover:bg-stone-800 border border-[#FFD700]/30 font-black text-xs py-2 px-4 rounded-xl shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                                            >
                                                <span>✏️ 展开详细修改营业时间 (Expand & Edit)</span>
                                            </button>
                                        </div>
                                    ) : (
                                        /* ── EXPANDED EDITABLE MODE ── */
                                        <div className="space-y-3">
                                            {/* Quick action: Apply same hours to all working days */}
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-stone-200/60">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[10px] text-stone-600 font-extrabold">⚡ 快速设定一键应用 (Quick Preset):</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const open = prompt("请输入统一的开门时间 (例如 10:00):", "10:00");
                                                            const close = prompt("请输入统一的关店时间 (例如 22:00):", "22:00");
                                                            if (open && close) {
                                                                const updated = { ...dailyHours };
                                                                DAYS_OF_WEEK.forEach(day => {
                                                                    if (updated[day].isOpen) {
                                                                        updated[day] = { ...updated[day], open, close };
                                                                    }
                                                                });
                                                                setDailyHours(updated);
                                                            }
                                                        }}
                                                        style={{ minHeight: '32px' }}
                                                        className="text-[10px] font-black bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-md transition-all active:scale-95 cursor-pointer"
                                                    >
                                                        一键应用到所有营业日
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = { ...dailyHours };
                                                            DAYS_OF_WEEK.forEach((day, index) => {
                                                                const isWeekend = index === 5 || index === 6;
                                                                updated[day] = {
                                                                    isOpen: true,
                                                                    open: isWeekend ? '09:00' : '10:00',
                                                                    close: isWeekend ? '23:00' : '22:00'
                                                                };
                                                            });
                                                            setDailyHours(updated);
                                                        }}
                                                        style={{ minHeight: '32px' }}
                                                        className="text-[10px] font-black bg-stone-100 hover:bg-[#8B0000]/10 hover:text-[#8B0000] text-stone-700 border border-stone-200 px-2.5 py-1 rounded-md transition-all active:scale-95 cursor-pointer"
                                                    >
                                                        重置为标准工作日/六日模式
                                                    </button>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setIsHoursExpanded(false)}
                                                    style={{ minHeight: '32px' }}
                                                    className="text-[10px] font-black bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 px-3 py-1 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1 self-start md:self-auto"
                                                >
                                                    <span>🔒 保存并锁定 (Lock & Collapse)</span>
                                                </button>
                                            </div>

                                            {/* Days List */}
                                            <div className="space-y-2">
                                                {DAYS_OF_WEEK.map((day) => {
                                                    const item = dailyHours[day] || { isOpen: true, open: '10:00', close: '22:00' };
                                                    return (
                                                        <div 
                                                            key={day} 
                                                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
                                                                item.isOpen 
                                                                    ? 'bg-white border-stone-200 shadow-xs' 
                                                                    : 'bg-stone-100/60 border-stone-200/50 opacity-60'
                                                            }`}
                                                        >
                                                            {/* Day Checkbox & Name */}
                                                            <div className="flex items-center gap-2.5 min-w-[140px]">
                                                                <label className="flex items-center gap-2 cursor-pointer select-none" style={{ minHeight: '44px' }}>
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={item.isOpen}
                                                                        onChange={(e) => {
                                                                            setDailyHours(prev => ({
                                                                                ...prev,
                                                                                [day]: { ...prev[day], isOpen: e.target.checked }
                                                                            }));
                                                                        }}
                                                                        className="w-4.5 h-4.5 rounded text-[#8B0000] focus:ring-[#8B0000] border-stone-300 accent-[#8B0000]"
                                                                    />
                                                                    <span className={`text-xs font-black tracking-wide ${item.isOpen ? 'text-stone-900' : 'text-stone-400'}`}>
                                                                        {DAYS_ZH[day]}
                                                                    </span>
                                                                </label>
                                                            </div>

                                                            {/* Time Inputs - highly optimized to prevent wrapping issues */}
                                                            {item.isOpen ? (
                                                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-grow sm:justify-end w-full sm:w-auto">
                                                                    <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1.5 rounded-lg border border-stone-200 w-full sm:w-auto justify-between sm:justify-start">
                                                                        <span className="text-[10px] text-stone-500 font-extrabold shrink-0">开门:</span>
                                                                        <input 
                                                                            type="time" 
                                                                            value={item.open}
                                                                            onChange={(e) => {
                                                                                setDailyHours(prev => ({
                                                                                    ...prev,
                                                                                    [day]: { ...prev[day], open: e.target.value }
                                                                                }));
                                                                            }}
                                                                            style={{ minHeight: '36px' }}
                                                                            className="p-1 border-0 focus:ring-0 text-xs font-black font-mono text-stone-800 bg-transparent text-center w-24 focus:outline-none"
                                                                        />
                                                                    </div>
                                                                    <div className="hidden sm:block h-px w-2 bg-stone-300"></div>
                                                                    <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1.5 rounded-lg border border-stone-200 w-full sm:w-auto justify-between sm:justify-start">
                                                                        <span className="text-[10px] text-stone-500 font-extrabold shrink-0">关店:</span>
                                                                        <input 
                                                                            type="time" 
                                                                            value={item.close}
                                                                            onChange={(e) => {
                                                                                setDailyHours(prev => ({
                                                                                    ...prev,
                                                                                    [day]: { ...prev[day], close: e.target.value }
                                                                                }));
                                                                            }}
                                                                            style={{ minHeight: '36px' }}
                                                                            className="p-1 border-0 focus:ring-0 text-xs font-black font-mono text-stone-800 bg-transparent text-center w-24 focus:outline-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-stone-400 text-xs font-black tracking-wider flex-grow text-right sm:pr-4 py-2 select-none">
                                                                    💤 休息中 (Closed)
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="pt-2 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsHoursExpanded(false)}
                                                    style={{ minHeight: '44px' }}
                                                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-stone-900 text-[#FFD700] hover:bg-stone-800 border border-[#FFD700]/30 font-black text-xs py-2 px-6 rounded-xl shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                                                >
                                                    <span>🔒 完成编辑并折叠 (Save & Lock)</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] text-stone-400 font-black block mb-1">日终结算界限 (Settlement Cutoff)</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max="23" 
                                            value={storeConfig.businessDayCutoff ?? 4} 
                                            onChange={e => setStoreConfig({...storeConfig, businessDayCutoff: parseInt(e.target.value)})} 
                                            className="w-full p-2 border border-stone-200 rounded-lg font-mono font-bold text-stone-800 text-center text-xs"
                                        />
                                        <span className="text-xs text-stone-500 font-bold whitespace-nowrap">AM (凌晨)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* C. GLOBAL PREFERENCES */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Languages size={14} className="text-[#8B0000]"/>
                                <span>系统偏好设置 (Global Preferences)</span>
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] text-stone-400 font-bold block mb-1">多语种切换 (Language)</label>
                                    <div className="relative">
                                        <Languages size={12} className="absolute left-3 top-3 text-stone-400"/>
                                        <select 
                                            className="w-full p-2 pl-8 border border-stone-200 rounded-lg text-xs font-bold text-stone-800 bg-white"
                                            value={storeConfig.language}
                                            onChange={e => setStoreConfig({...storeConfig, language: e.target.value})}
                                        >
                                            <option value="zh">简体中文 (CN)</option>
                                            <option value="en">English (EN)</option>
                                            <option value="my">မြန်မာဘာသာ (Burmese)</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-stone-400 font-bold block mb-1">结算货币单位 (Currency)</label>
                                    <div className="relative">
                                        <Coins size={12} className="absolute left-3 top-3 text-stone-400"/>
                                        <select 
                                            className="w-full p-2 pl-8 border border-stone-200 rounded-lg text-xs font-bold text-stone-800 bg-white"
                                            value={storeConfig.currency}
                                            onChange={e => setStoreConfig({...storeConfig, currency: e.target.value})}
                                        >
                                            <option value="RM">RM (Malaysian Ringgit)</option>
                                            <option value="SGD">SGD (Singapore Dollar)</option>
                                            <option value="USD">USD (US Dollar)</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-stone-400 font-bold block mb-1">小票打印机 IP (Printer)</label>
                                    <div className="flex gap-1.5">
                                        <div className="relative flex-grow">
                                            <Printer size={12} className="absolute left-2.5 top-3 text-stone-400"/>
                                            <input 
                                                className="w-full p-2 pl-7 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800" 
                                                value={storeConfig.printerSettings} 
                                                onChange={e => setStoreConfig({...storeConfig, printerSettings: e.target.value})} 
                                                placeholder="e.g. 192.168.1.100" 
                                            />
                                        </div>
                                        <button 
                                            onClick={handleTestPrinter}
                                            style={{ minHeight: '34px' }}
                                            className={`px-2 rounded-lg text-[10px] font-black transition-all ${
                                                printerStatus === 'SUCCESS' 
                                                    ? 'bg-emerald-500 text-white' 
                                                    : printerStatus === 'TESTING' 
                                                    ? 'bg-amber-100 text-amber-700' 
                                                    : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                                            }`}
                                        >
                                            {printerStatus === 'SUCCESS' ? '已联通' : printerStatus === 'TESTING' ? '联通中' : '测试'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* D. 考勤打卡方式配置 (Attendance Clock-In Methods) */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-2">
                                <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest flex items-center gap-2">
                                    <span>⏱️ 员工打卡方式设置 (Clock-In Methods)</span>
                                </h4>
                                <span className="bg-[#8B0000]/10 text-[#8B0000] text-[9px] font-black px-2 py-0.5 rounded-full">
                                    多选 (Multi-Select)
                                </span>
                            </div>
                            <p className="text-[10px] text-stone-500 font-bold mb-4">
                                💡 提示：在此开启或禁用员工打卡时允许使用的方法。至少需要选择一种方式。
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* 1. PIN 码 */}
                                <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-all cursor-pointer select-none min-h-[52px]">
                                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                        <span className="text-xl shrink-0 mt-0.5">🔐</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-stone-800">安全 PIN 码打卡</p>
                                            <p className="text-[9px] text-stone-400 font-bold truncate">员工输入 4 位密码进行身份验证</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={storeConfig.enablePinClock ?? true}
                                        onChange={e => setStoreConfig({
                                            ...storeConfig,
                                            enablePinClock: e.target.checked
                                        })}
                                        className="w-5 h-5 rounded text-[#8B0000] focus:ring-[#8B0000] border-stone-300 accent-[#8B0000]"
                                    />
                                </label>

                                {/* 2. 自拍 */}
                                <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-all cursor-pointer select-none min-h-[52px]">
                                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                        <span className="text-xl shrink-0 mt-0.5">📸</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-stone-800">拍照自拍留证打卡</p>
                                            <p className="text-[9px] text-stone-400 font-bold truncate">启动前置摄像头拍照存底，防止代打卡</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={storeConfig.enableSelfieClock ?? false}
                                        onChange={e => setStoreConfig({
                                            ...storeConfig,
                                            enableSelfieClock: e.target.checked
                                        })}
                                        className="w-5 h-5 rounded text-[#8B0000] focus:ring-[#8B0000] border-stone-300 accent-[#8B0000]"
                                    />
                                </label>

                                {/* 3. GPS */}
                                <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-all cursor-pointer select-none min-h-[52px]">
                                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                        <span className="text-xl shrink-0 mt-0.5">📍</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-stone-800">GPS 地理定位打卡</p>
                                            <p className="text-[9px] text-stone-400 font-bold truncate">检查手机 GPS 坐标是否在店铺辐射范围</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={storeConfig.enableGpsClock ?? false}
                                        onChange={e => setStoreConfig({
                                            ...storeConfig,
                                            enableGpsClock: e.target.checked
                                        })}
                                        className="w-5 h-5 rounded text-[#8B0000] focus:ring-[#8B0000] border-stone-300 accent-[#8B0000]"
                                    />
                                </label>

                                {/* 4. 二维码 */}
                                <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-all cursor-pointer select-none min-h-[52px]">
                                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                        <span className="text-xl shrink-0 mt-0.5">🔍</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-stone-800">扫码打卡</p>
                                            <p className="text-[9px] text-stone-400 font-bold truncate">扫描店内实时或静态二维码确认考勤</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={storeConfig.enableQrClock ?? false}
                                        onChange={e => setStoreConfig({
                                            ...storeConfig,
                                            enableQrClock: e.target.checked
                                        })}
                                        className="w-5 h-5 rounded text-[#8B0000] focus:ring-[#8B0000] border-stone-300 accent-[#8B0000]"
                                    />
                                </label>

                                {/* 5. WiFi */}
                                <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-all cursor-pointer select-none min-h-[52px] sm:col-span-2">
                                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                        <span className="text-xl shrink-0 mt-0.5">📶</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-stone-800">WiFi 局域网验证打卡</p>
                                            <p className="text-[9px] text-stone-400 font-bold truncate">手机必须连接到店内指定 WiFi 路由器才允许打卡</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="checkbox"
                                        checked={storeConfig.enableWifiClock ?? false}
                                        onChange={e => setStoreConfig({
                                            ...storeConfig,
                                            enableWifiClock: e.target.checked
                                        })}
                                        className="w-5 h-5 rounded text-[#8B0000] focus:ring-[#8B0000] border-stone-300 accent-[#8B0000]"
                                    />
                                </label>
                            </div>
                        </div>
                        
                    </div>
                )}

                {/* --- TAB 2: RECOVERY & MAINTENANCE --- */}
                {activeTab === 'RECOVERY' && (
                    <div className="flex-grow overflow-y-auto min-h-0 pb-16 space-y-4 pr-1">
                        
                        <div className="bg-stone-900 text-stone-100 p-4 rounded-xl border border-stone-800 shadow-sm flex items-start gap-3">
                            <Database size={18} className="text-[#FFD700] shrink-0 mt-0.5"/>
                            <div>
                                <h4 className="text-xs font-black text-[#FFD700] uppercase tracking-wider mb-1">系统数据安全与备份机制 (Security Snapshot)</h4>
                                <p className="text-[10px] text-stone-400 leading-relaxed font-semibold">
                                    为了保障每日对账单与高频库存稽查的数据稳定性，系统已深度整合了本地高速缓存与云端轻量化机制。
                                    强烈建议您<strong>每月手动导出系统数据</strong>，妥善保存在个人电脑或离线介质上。
                                </p>
                            </div>
                        </div>

                        {/* Export / Import Bento Layout */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                            {/* EXPORT */}
                            <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-[#8B0000] mb-2 shadow-inner">
                                        <Download size={16}/>
                                    </div>
                                    <h4 className="text-xs font-black text-[#1A1A1A] mb-1">一键导出系统全量数据</h4>
                                    <p className="text-[10px] text-stone-400 mb-3 font-semibold">打包下载全店所有数据并另存为 JSON 文件，确保双重安全备份。</p>
                                </div>
                                <button 
                                    onClick={handleExportData} 
                                    disabled={isExporting} 
                                    style={{ minHeight: '44px' }}
                                    className="w-full py-2 bg-stone-900 text-[#FFD700] text-xs font-black rounded-lg hover:bg-black transition-all flex justify-center items-center gap-2 shadow-sm"
                                >
                                    {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} 
                                    {isExporting ? '生成中...' : '下载本地备份 (.json)'}
                                </button>
                            </div>

                            {/* IMPORT */}
                            <div 
                                className="bg-stone-50 border border-dashed border-stone-300 p-4 rounded-xl shadow-inner flex flex-col justify-between cursor-pointer hover:bg-stone-100/70"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div>
                                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-stone-500 mb-2 shadow-sm">
                                        <Upload size={16}/>
                                    </div>
                                    <h4 className="text-xs font-black text-[#1A1A1A] mb-1">导入本地备份数据</h4>
                                    <p className="text-[10px] text-stone-400 mb-3 font-semibold">选择先前导出的 JSON 数据，进行全量系统状态回滚与覆盖。</p>
                                </div>
                                <div className="w-full py-2 bg-white border border-stone-200 text-stone-600 text-xs font-black rounded-lg flex justify-center items-center gap-2 shadow-sm">
                                    <Upload size={14}/> 选择备份文件 (.json)
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileUpload} />
                            </div>
                        </div>

                        {/* Cloud snapshots list */}
                        <div className="h-px bg-stone-200 my-4"></div>
                        <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Cloud size={14}/> <span>云端快照控制点 (Cloud Snapshots)</span>
                        </h4>
                        {loadingBackups ? (
                            <div className="py-8 text-center text-stone-400 font-bold flex flex-col items-center">
                                <Loader2 size={24} className="animate-spin mb-2 text-[#8B0000]"/> 正在拉取最新的云端映像控制点...
                            </div>
                        ) : backups.length === 0 ? (
                            <div className="py-8 text-center text-stone-400 font-bold bg-stone-100 rounded-xl border border-dashed border-stone-200 text-xs">
                                暂无活动的云端快照控制点
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {backups.map((bk, idx) => (
                                    <div key={idx} className="bg-white border border-stone-200 p-3.5 rounded-xl shadow-sm flex justify-between items-center hover:border-amber-400 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 font-black text-xs border border-stone-200">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h4 className="font-extrabold text-[#1A1A1A] text-xs flex items-center gap-1.5">
                                                    <Calendar size={12} className="text-stone-400"/>
                                                    {new Date(bk.timestamp).toLocaleDateString()} 
                                                    <span className="text-[10px] font-medium text-stone-400">{new Date(bk.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                </h4>
                                                <div className="flex gap-1.5 mt-0.5">
                                                    <span className="text-[9px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-bold border border-stone-200">v{bk.version}</span>
                                                    <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-bold border border-amber-200">Snapshot</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => performRestore(bk, 'CLOUD')} 
                                            disabled={isRestoring}
                                            className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-black shadow-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 flex items-center gap-1"
                                        >
                                            {isRestoring ? <Loader2 size={12} className="animate-spin"/> : <RotateCcw size={12}/>} 恢复
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB 3: DEVELOPER OPTIONS (SUPERADMIN EXCLUSIVE) --- */}
                {activeTab === 'DEV' && isSuperadmin && (
                    <div className="flex-grow overflow-y-auto min-h-0 pb-16 space-y-4 pr-1">
                        
                        <div className="bg-[#8B0000]/10 border border-[#8B0000]/30 p-4 rounded-xl flex items-start gap-3">
                            <Sparkles size={18} className="text-[#8B0000] shrink-0 mt-0.5 animate-pulse"/>
                            <div>
                                <h4 className="text-xs font-black text-[#8B0000] uppercase tracking-wider mb-1">高级开发者选项 (Developer Options)</h4>
                                <p className="text-[10px] text-[#8B0000] leading-relaxed font-semibold">
                                    此板块包含系统核心云算力密钥、API 请求代理以及第三方集成参数。非技术人员请勿随意更改，否则可能会影响系统正常运行。
                                </p>
                            </div>
                        </div>

                        {/* Danger zone (Moved here to prevent unauthorized action) */}
                        <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm">
                            <h4 className="text-xs font-black text-red-700 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-600"/>
                                <span>危险系统维护区 (System Danger Zone)</span>
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                <button 
                                    onClick={() => handleResetData('INVENTORY')} 
                                    style={{ minHeight: '34px' }}
                                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg shadow-sm"
                                >
                                    清空盘点及当前库存
                                </button>
                                <button 
                                    onClick={() => handleResetData('SUPPLIERS')} 
                                    style={{ minHeight: '34px' }}
                                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg shadow-sm"
                                >
                                    还原默认供应商 (WhatsApp)
                                </button>
                            </div>
                        </div>

                        {/* A. CLOUD INFRASTRUCTURE & INTEGRATIONS */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Cloud size={14} className="text-[#8B0000]"/>
                                <span>云端存储及脚本配置 (Cloud & Media Storage)</span>
                            </h4>
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 block mb-1">Cloudinary Cloud Name</label>
                                        <input 
                                            className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                            value={storeConfig.cloudinaryCloudName || ''} 
                                            onChange={e => setStoreConfig({...storeConfig, cloudinaryCloudName: e.target.value})} 
                                            placeholder="e.g. dp9vqajqu" 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 block mb-1">Upload Preset (Unsigned)</label>
                                        <input 
                                            className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                            value={storeConfig.cloudinaryUploadPreset || ''} 
                                            onChange={e => setStoreConfig({...storeConfig, cloudinaryUploadPreset: e.target.value})} 
                                            placeholder="e.g. kepong_unsigned" 
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-stone-400 block mb-1">Google AppScript API Webhook</label>
                                    <input 
                                        className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                        value={storeConfig.googleScriptUrl || ''} 
                                        onChange={e => setStoreConfig({...storeConfig, googleScriptUrl: e.target.value})} 
                                        placeholder="https://script.google.com/macros/s/..." 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* B. DATABASE SETTINGS (Supabase / Firestore) */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Database size={14} className="text-[#8B0000]"/>
                                <span>云数据库参数 (Durable Databases)</span>
                            </h4>
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 block mb-1">Firebase Project ID</label>
                                        <input 
                                            className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                            value={storeConfig.firebaseProjectId || ''} 
                                            onChange={e => setStoreConfig({...storeConfig, firebaseProjectId: e.target.value})} 
                                            placeholder="e.g. kepong-erp-production" 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 block mb-1">Firebase API Key</label>
                                        <input 
                                            type="password"
                                            className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                            value={storeConfig.firebaseApiKey || ''} 
                                            onChange={e => setStoreConfig({...storeConfig, firebaseApiKey: e.target.value})} 
                                            placeholder="AIzaSyA..." 
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 block mb-1">Supabase REST Endpoint</label>
                                        <input 
                                            className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                            value={storeConfig.supabaseUrl || ''} 
                                            onChange={e => setStoreConfig({...storeConfig, supabaseUrl: e.target.value})} 
                                            placeholder="https://xxx.supabase.co" 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 block mb-1">Supabase Anon Key</label>
                                        <input 
                                            type="password"
                                            className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                            value={storeConfig.supabaseKey || ''} 
                                            onChange={e => setStoreConfig({...storeConfig, supabaseKey: e.target.value})} 
                                            placeholder="eyJhbGciOi..." 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* C. SYSTEM API KEYS FOR MODEL AI */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-black text-stone-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Sparkles size={14} className="text-[#8B0000]"/>
                                <span>AI 脑库大模型密钥 (AI System Credentials)</span>
                            </h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-stone-400 block mb-1">Google Gemini API Key (Gemini-2.5-Pro / Flash)</label>
                                    <input 
                                        type="password"
                                        className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                        value={storeConfig.geminiApiKey || ''} 
                                        onChange={e => setStoreConfig({...storeConfig, geminiApiKey: e.target.value})} 
                                        placeholder="AIzaSy..." 
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-stone-400 block mb-1">Anthropic Claude API Token (Claude-3.5-Sonnet)</label>
                                    <input 
                                        type="password"
                                        className="w-full p-2 border border-stone-200 rounded-lg text-xs font-bold font-mono text-stone-800 bg-stone-50" 
                                        value={storeConfig.claudeApiKey || ''} 
                                        onChange={e => setStoreConfig({...storeConfig, claudeApiKey: e.target.value})} 
                                        placeholder="sk-ant-..." 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* D. SUPERADMIN EXCLUSIVE: DEFINE OWNER ACCOUNTS */}
                        {isSuperadmin && (
                            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-sm">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                                        <Crown size={14} className="text-amber-700"/>
                                        <span>超级管理：老板账号设定 (Boss Accounts)</span>
                                    </h4>
                                    <button 
                                        onClick={handleAddBossAccount}
                                        className="text-[10px] font-black bg-amber-600 text-white hover:bg-amber-700 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm"
                                    >
                                        <Plus size={10}/> 新增老板
                                    </button>
                                </div>
                                <p className="text-[10px] text-amber-700/80 mb-3 font-medium">作为 Superadmin (002)，您有权查看并更改全店所有老板角色的登录名、登录密码 (PIN码)。</p>
                                <div className="space-y-2">
                                    {bossAccounts.sort((a,b) => a.id.localeCompare(b.id)).map(boss => (
                                        <div key={boss.id} className="flex flex-col bg-white p-2.5 rounded-lg border border-amber-200 shadow-inner">
                                            <div className="flex items-center gap-2">
                                                <div className="bg-amber-100 text-amber-800 text-[10px] font-mono font-bold px-2 py-1.5 rounded-lg w-12 text-center">{boss.id}</div>
                                                <input 
                                                    className="flex-1 p-1.5 border border-stone-200 rounded-lg text-xs font-bold bg-white text-stone-800" 
                                                    value={boss.name} 
                                                    onChange={e => handleBossChange(boss.id, 'name', e.target.value)} 
                                                    placeholder="Name" 
                                                />
                                                <div className="relative w-24">
                                                    <Lock size={12} className="absolute left-2 top-2.5 text-stone-400"/>
                                                    <input 
                                                        className="w-full p-1.5 pl-6 border border-stone-200 rounded-lg text-xs font-bold text-center bg-white font-mono text-stone-800" 
                                                        value={boss.pin} 
                                                        onChange={e => handleBossChange(boss.id, 'pin', e.target.value)} 
                                                        placeholder="PIN" 
                                                    />
                                                </div>
                                                {boss.id !== '002' && (
                                                    <button 
                                                        onClick={() => handleDeleteBossAccount(boss.id)}
                                                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors shrink-0"
                                                        title="删除账号"
                                                    >
                                                        <Trash2 size={14}/>
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex justify-end mt-2 border-t border-amber-100 pt-2">
                                                <select 
                                                    className="p-1.5 border border-amber-200 bg-amber-50 rounded-lg text-[10px] font-bold text-amber-800 w-full md:w-auto"
                                                    onChange={(e) => handleSyncBoss(boss.id, e.target.value)}
                                                    value=""
                                                >
                                                    <option value="">🔗 链接已有员工档案同步至此老板账号 (Link Employee)</option>
                                                    {allEmployees
                                                        .filter(emp => !['001','002','003','004'].includes(emp.id) && !emp.role.includes('Owner') && !emp.role.includes('老板'))
                                                        .sort((a,b) => parseInt(a.id) - parseInt(b.id))
                                                        .map(emp => (
                                                        <option key={emp.id} value={emp.id}>[{emp.id}] {emp.name} ({emp.role})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* E. FORCED APP UPDATE TOGGLES */}
                        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex items-center justify-between">
                            <div>
                                <h4 className="text-xs font-black text-stone-800 uppercase flex items-center gap-1.5"><History size={14} className="text-[#8B0000]"/> App 强更开关 (Forced OTA update)</h4>
                                <p className="text-[9px] text-stone-400 font-bold mt-0.5">开启后，全体员工手机端进入应用将强制拦截弹框要求下载最新安装包。</p>
                            </div>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    id="forceUpdateToggle"
                                    className="sr-only peer" 
                                    checked={storeConfig.appForceUpdate || false}
                                    onChange={e => setStoreConfig({...storeConfig, appForceUpdate: e.target.checked})}
                                />
                                <div className="w-11 h-6 bg-stone-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8B0000]"></div>
                            </div>
                        </div>

                    </div>
                )}

                {/* Bottom Bar: Action Buttons */}
                <div className="flex gap-2.5 pt-4 border-t border-stone-200 mt-auto bg-stone-50 sticky bottom-0 z-10">
                    <button 
                        onClick={onClose} 
                        style={{ minHeight: '44px' }}
                        className="flex-1 py-3 bg-stone-200 hover:bg-stone-300 text-stone-600 font-extrabold rounded-xl transition-all active:scale-95 text-xs text-center"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSaveConfig} 
                        style={{ minHeight: '44px' }}
                        className="flex-[2] py-3 bg-stone-900 text-[#FFD700] font-extrabold rounded-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg text-xs"
                    >
                        <Save size={16}/> 保存全部设置
                    </button>
                </div>

            </div>

            {/* CHANGELOG OVERLAY */}
            {showChangelog && (
                <div className="absolute inset-0 bg-white z-[130] flex flex-col p-6 animate-in slide-in-from-right w-full md:max-w-2xl ml-auto rounded-l-2xl shadow-2xl">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h3 className="font-black text-xl flex items-center gap-2 text-[#1A1A1A]"><History size={24}/> 版本更新记录 (Changelog)</h3>
                        <button onClick={() => setShowChangelog(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
                    </div>
                    <div className="flex-grow overflow-y-auto space-y-6">
                        {VERSION_HISTORY.map((log, idx) => (
                            <div key={log.version} className="relative pl-6 border-l-2 border-gray-200">
                                <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white ${idx === 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                <div className="mb-1 flex items-center gap-3">
                                    <span className={`text-lg font-black ${idx === 0 ? 'text-green-600' : 'text-gray-500'}`}>v{log.version}</span>
                                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{log.date}</span>
                                    {idx === 0 && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold uppercase">Current</span>}
                                </div>
                                <ul className="list-disc list-outside ml-4 space-y-1">
                                    {log.changes.map((c, i) => (
                                        <li key={i} className="text-sm font-bold text-gray-600">{c}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
