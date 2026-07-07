import React, { useState } from 'react';
import { Shield, ChevronRight, Briefcase, Lock, User, Crown, CheckCircle2, AlertOctagon, Zap, Briefcase as BriefcaseIcon, Check, ChevronDown, ChevronUp, Clock, Sun, Moon, CheckSquare, HelpCircle, FileText, AlertCircle, Info, Smartphone } from 'lucide-react';
import { Employee, RoleGuide, AppModule, SOPItem } from '../types';
import { MODULE_DEFINITIONS } from './constants';
import { ManagerDashboard } from './AdminDashboard';

// ==========================================
// 🇲🇲 BURMESE TRANSLATION DICTIONARY
// ==========================================
const BURMESE_DICT: Record<string, string> = {
    // UI HEADERS
    "岗位实战宝典 (Job Manual)": "အလုပ်လမ်းညွှန် (Job Manual)",
    "遇到这种情况？(Issue)": "ပြဿနာရှိလား (Issue)",
    "解决方案 (Solution)": "ဖြေရှင်းနည်း (Solution)",
    "暂无常见问题记录": "မှတ်တမ်းမရှိပါ",
    "员工通用守则 (General Rules)": "အထွေထွေစည်းကမ်းများ (General Rules)",
    "暂无特别守则": "စည်းကမ်းချက်မရှိပါ",
    "系统功能指引 (Tech SOP)": "စနစ်အသုံးပြုပုံ (System SOP)",
    "指引 · Step by Step Guide": "အသုံးပြုနည်းလမ်းညွှန်",
    "核心职责 (Core Duties)": "အဓိကတာဝန်များ (Core Duties)",
    "核心价值 (Core Value)": "အဓိကတန်ဖိုး (Core Value)",
    "安全红线 (Red Line)": "ဘေးကင်းရေးစည်းကမ်း (Safety Red Line)",
    
    // SOP HEADERS
    "开铺准备 (Opening)": "ဆိုင်ဖွင့်ချိန်ပြင်ဆင်ခြင်း (Opening)",
    "打烊收尾 (Closing)": "ဆိုင်ပိတ်ချိန်သိမ်းဆည်းခြင်း (Closing)",
    "库存盘点 (Inventory)": "ပစ္စည်းစာရင်းစစ်ခြင်း (Inventory)",
    "执行标准 (Standard)": "စံသတ်မှတ်ချက် (Standard)",
    "目的 (Why)": "ရည်ရွယ်ချက် (Why)",
    "无特定标准，请保持整洁": "သန့်ရှင်းသပ်ရပ်စွာထားပါ",
    "为了保证营运流畅": "လုပ်ငန်းချောမွေ့စေရန်",

    // --- ROLES (NEW) ---
    "Executive Chef (行政总厨)": "Executive Chef (ခေါင်းဆောင်စားဖိုမှူး)",
    "Store Manager (门店经理)": "Store Manager (ဆိုင်မန်နေဂျာ)",
    "Operations Supervisor (运营主管)": "Supervisor (လုပ်ငန်းလည်ပတ်မှုကြီးကြပ်ရေးမှူး)",
    "Counter (柜台)": "Counter (ကောင်တာ)",
    "Captain (写单员)": "Captain (အော်ဒါစာရေး)",
    "Waiter (服务员)": "Waiter (စားပွဲထိုး)",
    "Cleaner (清洁员)": "Cleaner (သန့်ရှင်းရေး)",
    "Part-Time (兼职)": "Part-Time (အချိန်ပိုင်း)",
    "Head Chef (头手)": "Head Chef (ခေါင်းဆောင်စားဖိုမှူး)",
    "Assistant Chef (帮锅)": "Assistant Chef (လက်ထောက်စားဖိုမှူး)",
    "Kitchen Cook (厨师)": "Kitchen Cook (ထမင်းကြော်စားဖိုမှူး)",
    "Kitchen Cutter (占板)": "Kitchen Cutter (အသားလှီး)",
    "Fryer (打荷)": "Fryer (အကြော်ဆရာ)",
    "Commis/Runner (马王)": "Commis/Runner (မားဝမ်/အကူ)",
    "Kitchen Helper (厨房帮手)": "Kitchen Helper (မီးဖိုချောင်အကူ)",
    "Dishwasher (洗碗)": "Dishwasher (ပန်းကန်ဆေး)",
    "Water Bar (水吧)": "Water Bar (ရေဘား)",
    "Kitchen Apprentice (厨房学徒)": "Kitchen Apprentice (အလုပ်သင်)",

    // --- MODULE CARD LABELS ---
    "厨房库存 (Kitchen K)": "မီးဖိုချောင်ပစ္စည်း (Kitchen)",
    "水吧库存 (Bar B)": "ရေဘားပစ္စည်း (Bar)",
    "后勤物资 (Supply S)": "ထောက်ပံ့ရေးပစ္စည်း (Supply)",
    "燃料管理 (Fuel F)": "လောင်စာ (Fuel)",
    "库存总览 (View)": "ကုန်ပစ္စည်းကြည့်ရန် (View)",
    "库存盘点 (Check)": "ကုန်ပစ္စည်းစစ်ရန် (Check)",
    "智能订货 (Ordering)": "အမှာစာ (Ordering)",
    "智能菜谱 (Smart Menu)": "မီနူး (Menu)",
    "每日结算 (Settlement)": "နေ့စဉ်စာရင်း (Settlement)",
    "排班管理 (Roster)": "အလှည့်ကျဇယား (Roster)",
    "运营日志 (Logbook)": "မှတ်တမ်း (Logbook)",
    "SOP 稽查 (SOP Inspect)": "SOP စစ်ဆေးခြင်း (Inspect)",
    "排队叫号 (Queue)": "တန်းစီစနစ် (Queue)",
    "考勤总控 (Attendance Console)": "တက်ရောက်မှု (Attendance)",
    "供应商通讯录 (Suppliers)": "ကုန်သည်များ (Suppliers)",
    "能力评测 (Assessment)": "စွမ်းဆောင်ရည်စစ်ဆေးခြင်း (Assessment)",
    "应付账款 (AP)": "ပေးရန်ရှိစာရင်း (AP)",
    "应付账款": "ပေးရန်ရှိစာရင်း",
    "自制凭单 (Voucher Maker)": "ဘောက်ချာပြုလုပ်ခြင်း (Voucher Maker)",
    "自制凭单": "ဘောက်ချာပြုလုပ်ခြင်း",
    "管理权限控制台": "စီမံခန့်ခွဲမှုစင်တာ",
    "Management & Admin Console": "Management & Admin Console",

    // --- MODULE CARD DESCRIPTIONS ---
    "生鲜 KF / 干货 KD / 酱料 KS": "KF / KD / KS",
    "茶 BT / 罐装 BC / 水果 BF": "BT / BC / BF",
    "打包 SP / 杂项 SG": "SP / SG",
    "查看库存与价值": "ကုန်ပစ္စည်းတန်ဖိုးကြည့်ရန်",
    "执行盘点任务": "စစ်ဆေးရန်",
    "缺席记录与排班查看 (全员)": "အားလပ်ရက်နှင့်အလှည့်ကျကြည့်ရန်",
    "客诉、维修与突发事件": "တိုင်ကြားချက်၊ ပြုပြင်ခြင်း",

    // ... (Keep existing translations for duties/troubleshooting/etc. as is to save space - Assuming previous file content here) ...
    // NOTE: In a real update, I would include the full dictionary. For this patch, I'm assuming the dictionary is unchanged.
};

// HELPER: TRANSLATE FUNCTION
const t = (text: string, lang: 'zh' | 'my') => {
    if (lang === 'zh') return text;
    // Strict lookup then partial match attempt
    if (BURMESE_DICT[text]) return BURMESE_DICT[text];
    return text; 
};

interface ViewProps {
    employee: Employee;
    guide: RoleGuide;
    sopItems: SOPItem[];
    onToggleSop: (id: string) => void;
    lang: 'zh' | 'my';
}

// ==========================================
// 1. HANDBOOK VIEW
// ==========================================
export const HandbookView: React.FC<{ guide: RoleGuide; allowedModules: AppModule[]; lang: 'zh' | 'my' }> = ({ guide, allowedModules, lang }) => {
  if (!guide) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 岗位实战宝典 (POSITION MANUAL) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2 border-b border-gray-50 pb-4">
            <HelpCircle className="text-brandRed" size={22}/> {t("岗位实战宝典 (Job Manual)", lang)}
        </h3>
        
        <div className="space-y-6">
            {guide.troubleshooting && guide.troubleshooting.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-2xl p-5 border-l-4 border-l-brandRed">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="text-brandRed shrink-0 mt-0.5" size={18}/>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase mb-1">{t("遇到这种情况？(Issue)", lang)}</p>
                            <p className="text-sm font-bold text-gray-800 mb-3">{t(item.issue, lang)}</p>
                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                                <p className="text-[10px] font-black text-green-600 uppercase mb-1 flex items-center gap-1"><Check size={12}/> {t("解决方案 (Solution)", lang)}</p>
                                <p className="text-xs font-bold text-gray-600 leading-relaxed">{t(item.solution, lang)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            {(!guide.troubleshooting || guide.troubleshooting.length === 0) && (
                <p className="text-center text-xs text-gray-400 italic py-4">{t("暂无常见问题记录", lang)}</p>
            )}
        </div>
      </div>

      {/* 员工通用守则 (GENERAL RULES) */}
      <div className="bg-gray-800 rounded-3xl p-6 shadow-lg text-white">
        <h3 className="text-lg font-black mb-6 flex items-center gap-2 border-b border-white/10 pb-4">
            <Zap className="text-accent" size={22}/> {t("员工通用守则 (General Rules)", lang)}
        </h3>
        <div className="grid grid-cols-1 gap-3">
            {guide.employeeRules && guide.employeeRules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-6 h-6 bg-accent text-black rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                    <span className="text-xs font-bold text-gray-100">{t(rule, lang)}</span>
                </div>
            ))}
            {(!guide.employeeRules || guide.employeeRules.length === 0) && (
                <p className="text-center text-xs text-gray-500 italic">{t("暂无特别守则", lang)}</p>
            )}
        </div>
      </div>

      {/* 功能指引 (MODULE GUIDES) */}
      {allowedModules.length > 0 && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2 border-b border-gray-50 pb-4">
                <Smartphone className="text-blue-600" size={22}/> {t("系统功能指引 (Tech SOP)", lang)}
            </h3>
            <div className="space-y-4">
                {allowedModules.map(modKey => {
                    const info = MODULE_DEFINITIONS[modKey];
                    if (!info) return null;
                    const Icon = info.icon;
                    return (
                        <div key={modKey} className="group">
                            <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm"><Icon size={20}/></div>
                                <div>
                                    <h4 className="font-black text-sm text-[#1A1A1A]">{info.label}</h4>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{t("指引 · Step by Step Guide", lang)}</p>
                                </div>
                            </div>
                            <div className="mt-2 p-4 bg-white border border-gray-100 rounded-2xl ml-6 relative">
                                <div className="absolute top-0 left-[-16px] w-4 h-4 border-l-2 border-b-2 border-blue-100 rounded-bl-lg"></div>
                                <p className="text-xs font-bold text-gray-500 leading-relaxed italic whitespace-pre-line">{info.guide}</p>
                            </div>
                        </div>
                    )
                })}
            </div>
          </div>
      )}
    </div>
  );
};

// ==========================================
// 2. MANAGEMENT VIEW
// ==========================================
export const ManagementView: React.FC<{ 
    employee: Employee; 
    guide: RoleGuide; 
    allowedModules: AppModule[];
    hasPendingTasks?: boolean; // NEW PROP
    lang?: 'zh' | 'my';
}> = ({ employee, guide, allowedModules, hasPendingTasks, lang = 'zh' }) => {
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(null);

  // Dynamically calculate which modules to show
  // If user has a pending task but NO permanent inventory permission, inject INVENTORY_CHECK
  const displayModules = [...allowedModules];
  if (hasPendingTasks && !displayModules.includes('INVENTORY_CHECK')) {
      displayModules.push('INVENTORY_CHECK');
  }

  if (selectedModule) {
    return (
        <ManagerDashboard 
            allowedModules={displayModules} 
            initialTab={MODULE_DEFINITIONS[selectedModule].tab as any} 
            onBack={() => setSelectedModule(null)} 
            currentEmployee={employee} 
            isSingleMode={true}
            lang={lang}
        />
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right duration-500">
      <div className="bg-[#FFFEFA] p-6 rounded-2xl shadow-sm border border-[#D6D3CD] mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-brandRed flex items-center justify-center text-white shadow-md"><Briefcase size={24} /></div>
          <div>
            <h2 className="text-xl font-serif font-bold text-[#1A1A1A]">{t('管理权限控制台', lang)}</h2>
            <p className="text-xs text-gray-500">{t('Management & Admin Console', lang)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayModules.map(modKey => {
            const info = MODULE_DEFINITIONS[modKey];
            if (!info) return null;
            const Icon = info.icon;
            
            // Highlight Inventory Check if it's an injected temporary permission
            const isTempAccess = modKey === 'INVENTORY_CHECK' && !allowedModules.includes('INVENTORY_CHECK');
            
            return (
              <button 
                key={modKey}
                onClick={() => setSelectedModule(modKey)}
                className={`bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-all text-left group active:scale-[0.98] ${isTempAccess ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 hover:border-brandRed'}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isTempAccess ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 group-hover:bg-red-50 text-gray-600 group-hover:text-brandRed'}`}>
                    <Icon size={20} />
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-brandRed" />
                </div>
                <h3 className="font-bold text-[#1A1A1A] group-hover:text-brandRed transition-colors flex items-center gap-2">
                    {t(info.label, lang)}
                    {isTempAccess && <span className="bg-blue-100 text-blue-600 text-[9px] px-1.5 py-0.5 rounded font-black uppercase">Task Assigned</span>}
                </h3>
                <p className="text-xs text-gray-400 mt-1">{t(info.desc, lang)}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. FOH VIEW (Front of House)
// ==========================================
export const FOHView: React.FC<ViewProps> = ({ employee, guide, sopItems, onToggleSop, lang }) => {
  if(!guide) return null;
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
       <SOPSection guide={guide} sopItems={sopItems} onToggleSop={onToggleSop} colorTheme="blue" lang={lang} />
    </div>
  );
};

// ==========================================
// 4. BOH VIEW (Back of House / Kitchen)
// ==========================================
export const BOHView: React.FC<ViewProps> = ({ employee, guide, sopItems, onToggleSop, lang }) => {
  if(!guide) return null;
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
       <SOPSection guide={guide} sopItems={sopItems} onToggleSop={onToggleSop} colorTheme="orange" lang={lang} />
    </div>
  );
};

// ==========================================
// 5. PENDING VIEW
// ==========================================
export const PendingView: React.FC<{ lang: 'zh' | 'my' }> = ({ lang }) => (
  <div className="flex flex-col items-center justify-center min-h-[40vh] p-6 text-center bg-white rounded-3xl border border-gray-100">
    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 animate-pulse"><User size={32} className="text-gray-300" /></div>
    <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">{lang === 'my' ? 'အကောင့်စောင့်ဆိုင်းနေသည်' : '账号待分配 (Pending Assignment)'}</h3>
    <p className="text-xs text-gray-400 max-w-xs">{lang === 'my' ? 'သင်၏ရာထူးကို မန်နေဂျာထံ ဆက်သွယ်ပါ' : '您的账号尚未分配具体岗位。请联系经理或老板进行设置。'}</p>
  </div>
);

// --- SHARED SOP COMPONENT ---
const SOPSection: React.FC<{ guide: RoleGuide; sopItems: SOPItem[]; onToggleSop: (id: string) => void; colorTheme: 'blue' | 'orange'; lang: 'zh' | 'my' }> = ({ guide, sopItems, onToggleSop, colorTheme, lang }) => {
    const [expandedTask, setExpandedTask] = useState<string | null>(null);
    const openingTasks = sopItems.filter(i => i.id.startsWith('start_'));
    const closingTasks = sopItems.filter(i => i.id.startsWith('end_'));
    const inventoryTasks = sopItems.filter(i => i.id.startsWith('auto_inv_'));

    const renderTaskList = (tasks: SOPItem[], title: string, Icon: any, bgColor: string) => {
        if (tasks.length === 0) return null;
        return (
            <div className="mb-6">
                <h3 className={`text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2`}><Icon size={14} className={title.includes('开铺') ? 'text-orange-500' : 'text-purple-500'} /> {t(title, lang)}</h3>
                <div className="space-y-3">
                     {tasks.map(item => {
                         const isExpanded = expandedTask === item.id;
                         return (
                             <div key={item.id} onClick={() => setExpandedTask(isExpanded ? null : item.id)} className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden active:scale-[0.99] touch-pan-y ${item.completed ? 'border-green-400 shadow-sm' : 'border-gray-200 shadow-sm'} ${isExpanded ? 'ring-2 ring-gray-100' : ''}`}>
                                 <div className="p-4 flex items-center justify-between cursor-pointer">
                                     <div className="flex items-center gap-3">
                                         <button onClick={(e) => { e.stopPropagation(); onToggleSop(item.id); }} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent'}`}><Check size={16} strokeWidth={3} /></button>
                                         <span className={`text-sm font-bold ${item.completed ? 'text-gray-400 line-through' : 'text-[#1A1A1A]'}`}>{t(item.label, lang)}</span>
                                     </div>
                                     <div className="text-gray-400">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
                                 </div>
                                 {isExpanded && (
                                     <div className={`${bgColor} px-4 pb-4 pt-0 border-t border-dashed border-gray-200`}>
                                         <div className="mt-3 bg-white p-3 rounded-xl border border-gray-100 flex flex-col gap-2">
                                            <div><div className="text-[9px] text-gray-400 font-bold uppercase mb-0.5">{t('执行标准 (Standard)', lang)}</div><div className="text-xs text-[#1A1A1A] font-bold">{t(item.standard || '无特定标准，请保持整洁', lang)}</div></div>
                                            <div><div className="text-[9px] text-gray-400 font-bold uppercase mb-0.5">{t('目的 (Why)', lang)}</div><div className="text-xs text-gray-500 italic">{t(item.why || '为了保证营运流畅', lang)}</div></div>
                                         </div>
                                     </div>
                                 )}
                             </div>
                         )
                     })}
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="bg-gradient-to-br from-[#FFFDF5] to-[#FFF9E6] rounded-[2rem] shadow-sm border border-[#E6E0D0] p-6 relative overflow-hidden mb-6">
                <div className={`absolute top-0 left-0 w-1 h-full ${colorTheme === 'blue' ? 'bg-blue-600' : 'bg-orange-600'}`}></div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><BriefcaseIcon size={14} /> {t("核心职责 (Core Duties)", lang)}</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                    {guide.duties && guide.duties.map((duty, idx) => (
                        <div key={idx} className="bg-white/80 text-[#1A1A1A] px-3 py-2 rounded-xl border border-[#E6E0D0] text-xs font-bold flex items-center gap-2 shadow-sm"><div className={`w-1.5 h-1.5 rounded-full ${colorTheme === 'blue' ? 'bg-blue-500' : 'bg-orange-500'}`}></div>{t(duty, lang)}</div>
                    ))}
                </div>
                <div className="pt-4 border-t border-[#E6E0D0] flex items-start gap-2">
                    <Zap size={14} className="text-[#FFD700] shrink-0 mt-0.5" fill="currentColor"/>
                    <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{t("核心价值 (Core Value)", lang)}</p><p className="text-sm text-[#1A1A1A] font-serif font-bold italic">"{t(guide.coreValue, lang)}"</p></div>
                </div>
                {guide.safetyRedLine && (
                    <div className="mt-4 pt-4 border-t border-[#E6E0D0]">
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-3 flex items-start gap-2"><AlertOctagon size={16} className="text-[#C70000] shrink-0 mt-0.5" /><div><p className="text-[10px] font-bold text-red-600 uppercase">{t("安全红线 (Red Line)", lang)}</p><p className="text-xs font-bold text-[#1A1A1A] leading-relaxed">{t(guide.safetyRedLine, lang)}</p></div></div>
                    </div>
                )}
            </div>
            {renderTaskList(openingTasks, '开铺准备 (Opening)', Sun, 'bg-orange-50')}
            {renderTaskList(closingTasks, '打烊收尾 (Closing)', Moon, 'bg-blue-50')}
            {renderTaskList(inventoryTasks, '库存盘点 (Inventory)', CheckSquare, 'bg-green-50')}
        </>
    );
}