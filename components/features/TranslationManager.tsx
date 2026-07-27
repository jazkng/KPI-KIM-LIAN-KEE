import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Search, Languages, CheckCircle2, Loader2, Package, Flame, Coffee, Box, ChevronDown, ChevronRight, Sparkles, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { StockItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { UI_TRANSLATION_KEYS } from '../../constants/translationKeys';

interface TranslationManagerProps {
    onClose: () => void;
}

const CATEGORY_SECTIONS: Record<string, { id: string, label: string }[]> = {
    'KITCHEN': [
        { id: 'FRESH', label: '生鲜 (Fresh)' }, { id: 'MEAT', label: '肉类 (Meat)' },
        { id: 'SEAFOOD', label: '海鲜 (Seafood)' }, { id: 'VEG', label: '蔬果 (Veg)' },
        { id: 'NOODLE', label: '面食 (Noodle)' }, { id: 'SAUCE', label: '酱料 (Sauce)' },
        { id: 'DRY', label: '干货 (Dry)' }, { id: 'HQ', label: '总店 (HQ)' },
    ],
    'BAR': [
        { id: 'TEA', label: '茶叶 (Tea)' }, { id: 'FRUIT', label: '水果 (Fruit)' },
        { id: 'RTD', label: '罐装 (Drinks)' }, { id: 'MISC', label: '其他 (Misc)' },
        { id: 'DRINK', label: '饮品 (Drink)' },
    ],
    'GENERAL': [
        { id: 'PACKAGING', label: '包装 (Pack)' }, { id: 'CLEANING', label: '清洁 (Clean)' },
        { id: 'TOOLS', label: '工具 (Tools)' }, { id: 'WASTE', label: '耗材 (Waste)' },
        { id: 'GENERAL', label: '杂项 (General)' },
    ],
    'FUEL': [
        { id: 'GAS', label: '煤气 (Gas)' }, { id: 'CHARCOAL', label: '木炭 (Charcoal)' },
        { id: 'OIL', label: '柴油/油 (Oil)' },
    ]
};

const UNIT_LIST = ['kg', 'pkt', 'btl', 'ctn', 'roll', 'box', 'tank', 'tray', 'bag', 'pc', 'set', 'pair', 'Tin', 'Bowl', 'Cup', 'Dish', 'Plate', 'Portion', 'Pound'];

// Standard translation keys merged with previous UI labels
const UI_LABELS = Array.from(new Set([
  ...Object.keys(UI_TRANSLATION_KEYS),
  ...Object.values(UI_TRANSLATION_KEYS),
  '厨房', '水吧', '后勤', '燃料', '库存盘点', '库存总览', '搜索', '保存', '当前', '最低', '最高', '单位', '品名', '数量', '不足', '正常', '充足'
]));

const TAB_ICONS: Record<string, React.ReactNode> = {
    'KITCHEN': <Package size={14}/>,
    'BAR': <Coffee size={14}/>,
    'GENERAL': <Box size={14}/>,
    'FUEL': <Flame size={14}/>,
};

export const TranslationManager: React.FC<TranslationManagerProps> = ({ onClose }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [translating, setTranslating] = useState(false);
    
    // All stock items from Firebase
    const [allItems, setAllItems] = useState<StockItem[]>([]);
    
    // Saved translations from Firebase
    const [savedItemTranslations, setSavedItemTranslations] = useState<Record<string, string>>({});
    const [savedCategoryTranslations, setSavedCategoryTranslations] = useState<Record<string, string>>({});
    const [savedUnitTranslations, setSavedUnitTranslations] = useState<Record<string, string>>({});
    const [savedUiTranslations, setSavedUiTranslations] = useState<Record<string, string>>({});

    // Live working translations (includes unsaved user/AI edits)
    const [itemTranslations, setItemTranslations] = useState<Record<string, string>>({});
    const [categoryTranslations, setCategoryTranslations] = useState<Record<string, string>>({});
    const [unitTranslations, setUnitTranslations] = useState<Record<string, string>>({});
    const [uiTranslations, setUiTranslations] = useState<Record<string, string>>({});
    
    // Filter & view state
    const [activeSection, setActiveSection] = useState<'ITEMS' | 'CATEGORIES' | 'UNITS' | 'UI'>('ITEMS');
    const [activeStockView, setActiveStockView] = useState<'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL'>('KITCHEN');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
    
    // Missing only filter toggle (未翻译一键扫描)
    const [showMissingOnly, setShowMissingOnly] = useState<boolean>(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load all stock items
            const [k, b, g, f] = await Promise.all([
                DataManager.getStock('KITCHEN'),
                DataManager.getStock('BAR'),
                DataManager.getStock('GENERAL'),
                DataManager.getStock('FUEL'),
            ]);
            setAllItems([...k, ...b, ...g, ...f]);
            
            // Load existing translations
            const trans = await DataManager.getTranslations('my');
            const items = trans.items || {};
            const categories = trans.categories || {};
            const units = trans.units || {};
            const ui = trans.ui || {};

            setSavedItemTranslations({ ...items });
            setSavedCategoryTranslations({ ...categories });
            setSavedUnitTranslations({ ...units });
            setSavedUiTranslations({ ...ui });

            setItemTranslations({ ...items });
            setCategoryTranslations({ ...categories });
            setUnitTranslations({ ...units });
            setUiTranslations({ ...ui });
        } catch (e) { 
            console.error(e); 
        } finally { 
            setLoading(false); 
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await DataManager.saveTranslations('my', {
                items: itemTranslations,
                categories: categoryTranslations,
                units: unitTranslations,
                ui: uiTranslations,
            });
            
            // Update saved references
            setSavedItemTranslations({ ...itemTranslations });
            setSavedCategoryTranslations({ ...categoryTranslations });
            setSavedUnitTranslations({ ...unitTranslations });
            setSavedUiTranslations({ ...uiTranslations });

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) { 
            console.error(e); 
            alert('保存失败！'); 
        } finally { 
            setSaving(false); 
        }
    };

    // AI Translation Assistant (Up to 20 blank items at a time)
    const handleAiTranslate = async () => {
        if (translating) return;

        // 1. Identify missing translations based on active section
        let missingList: { key: string; chinese: string }[] = [];

        if (activeSection === 'ITEMS') {
            // Filter items in currently visible view
            const viewCategories = CATEGORY_SECTIONS[activeStockView]?.map(c => c.id) || [];
            const viewItems = allItems.filter(item => viewCategories.includes(item.category));
            
            for (const item of viewItems) {
                const currentVal = itemTranslations[item.id] || '';
                if (!currentVal.trim()) {
                    missingList.push({ key: item.id, chinese: item.name });
                }
            }
        } else if (activeSection === 'CATEGORIES') {
            const allCats = Object.values(CATEGORY_SECTIONS).flat();
            for (const cat of allCats) {
                const currentVal = categoryTranslations[cat.id] || '';
                if (!currentVal.trim()) {
                    missingList.push({ key: cat.id, chinese: cat.label });
                }
            }
        } else if (activeSection === 'UNITS') {
            for (const unit of UNIT_LIST) {
                const currentVal = unitTranslations[unit] || '';
                if (!currentVal.trim()) {
                    missingList.push({ key: unit, chinese: unit });
                }
            }
        } else if (activeSection === 'UI') {
            for (const label of UI_LABELS) {
                const currentVal = uiTranslations[label] || '';
                if (!currentVal.trim()) {
                    missingList.push({ key: label, chinese: label });
                }
            }
        }

        if (missingList.length === 0) {
            alert('当前页面没有未翻译的空白项！');
            return;
        }

        // Limit to 20 items to prevent high usage/costs
        const itemsToProcess = missingList.slice(0, 20);
        const chineseTexts = itemsToProcess.map(x => x.chinese);
        const contentType = activeSection === 'ITEMS'
            ? 'inventory_item'
            : activeSection === 'CATEGORIES'
                ? 'inventory_category'
                : activeSection === 'UNITS'
                    ? 'inventory_unit'
                    : 'ui_label';

        setTranslating(true);
        try {
            const response = await fetch('/api/gemini/translate-my', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: chineseTexts,
                    targetLang: 'my',
                    contentType,
                    audience: activeSection === 'UI' ? 'general_staff' : 'kitchen_staff',
                    tone: 'plain',
                    maxLength: activeSection === 'UI' ? 36 : 64,
                    context: `${activeSection} names for a Chinese-English Restaurant ERP Inventory system.`
                })
            });

            if (!response.ok) {
                throw new Error('Server returned an error');
            }

            const data = await response.json();
            const translations: string[] = data.translations || [];

            if (translations.length !== itemsToProcess.length) {
                throw new Error('AI returned a mismatched translation count');
            }

            // Fill drafts
            if (activeSection === 'ITEMS') {
                setItemTranslations(prev => {
                    const next = { ...prev };
                    itemsToProcess.forEach((item, index) => {
                        next[item.key] = translations[index];
                    });
                    return next;
                });
            } else if (activeSection === 'CATEGORIES') {
                setCategoryTranslations(prev => {
                    const next = { ...prev };
                    itemsToProcess.forEach((cat, index) => {
                        next[cat.key] = translations[index];
                    });
                    return next;
                });
            } else if (activeSection === 'UNITS') {
                setUnitTranslations(prev => {
                    const next = { ...prev };
                    itemsToProcess.forEach((unit, index) => {
                        next[unit.key] = translations[index];
                    });
                    return next;
                });
            } else if (activeSection === 'UI') {
                setUiTranslations(prev => {
                    const next = { ...prev };
                    itemsToProcess.forEach((label, index) => {
                        next[label.key] = translations[index];
                    });
                    return next;
                });
            }

        } catch (e: any) {
            console.error('AI translation failed:', e);
            alert(`AI 翻译出错: ${e.message || '请检查 Gemini API Key 设置'}`);
        } finally {
            setTranslating(false);
        }
    };

    // Filter items by current stock view, search, and missing toggle
    const currentViewItems = useMemo(() => {
        const viewCategories = CATEGORY_SECTIONS[activeStockView]?.map(c => c.id) || [];
        let filtered = allItems.filter(item => viewCategories.includes(item.category));
        
        if (showMissingOnly) {
            filtered = filtered.filter(item => !(itemTranslations[item.id] || '').trim());
        }

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
        }
        return filtered;
    }, [allItems, activeStockView, searchTerm, showMissingOnly, itemTranslations]);

    // Group items by category
    const groupedItems = useMemo(() => {
        const groups: Record<string, StockItem[]> = {};
        currentViewItems.forEach(item => {
            if (!groups[item.category]) groups[item.category] = [];
            groups[item.category].push(item);
        });
        return groups;
    }, [currentViewItems]);

    const toggleCat = (catId: string) => {
        const next = new Set(expandedCats);
        if (next.has(catId)) next.delete(catId); else next.add(catId);
        setExpandedCats(next);
    };

    // Count unsaved draft items
    const unsavedCount = useMemo(() => {
        let count = 0;
        Object.keys(itemTranslations).forEach(k => {
            if (itemTranslations[k] !== savedItemTranslations[k]) count++;
        });
        Object.keys(categoryTranslations).forEach(k => {
            if (categoryTranslations[k] !== savedCategoryTranslations[k]) count++;
        });
        Object.keys(unitTranslations).forEach(k => {
            if (unitTranslations[k] !== savedUnitTranslations[k]) count++;
        });
        Object.keys(uiTranslations).forEach(k => {
            if (uiTranslations[k] !== savedUiTranslations[k]) count++;
        });
        return count;
    }, [itemTranslations, categoryTranslations, unitTranslations, uiTranslations, savedItemTranslations, savedCategoryTranslations, savedUnitTranslations, savedUiTranslations]);

    // Stats for active dashboard
    const totalItems = allItems.length;
    const translatedCount = Object.values(itemTranslations).filter(v => v && v.trim()).length;
    const missingTotalItems = totalItems - translatedCount;

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center">
                <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
                    <Loader2 size={32} className="animate-spin text-[#FFD700]"/>
                    <p className="text-sm font-bold text-gray-700">加载翻译数据库 & 盘点中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-5xl md:h-[95vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* HEADER */}
                <div className="bg-[#111111] px-3 py-3 md:p-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD200] safe-area-top">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <button 
                            onClick={onClose}
                            style={{ touchAction: 'manipulation' }}
                            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-white transition-all border border-white/10 shrink-0"
                            aria-label="Back"
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                        <div className="bg-[#FFD200] text-black p-2 rounded-xl shadow-lg shrink-0">
                            <Languages size={20} className="md:w-5 md:h-5"/>
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-sans font-black text-sm md:text-lg tracking-wide flex items-center gap-1.5 truncate">
                                <span>缅甸语翻译中心</span>
                                <span className="hidden lg:inline-block bg-[#FFD200] text-black text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                    Myanmar Translation Center
                                </span>
                            </h3>
                            <p className="text-[9px] md:text-[10px] text-gray-400 font-mono tracking-widest truncate">
                                AI-ASSISTED MULTI-LAYER INTEGRATION
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right mr-2 hidden md:block">
                            <div className="text-[10px] text-gray-400">已翻译覆盖率</div>
                            <div className="text-xs md:text-sm font-mono font-black text-[#FFD200]">
                                {translatedCount} / {totalItems} ({Math.round((translatedCount / (totalItems || 1)) * 100)}%)
                            </div>
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={saving}
                            style={{ touchAction: 'manipulation' }}
                            className={`flex items-center gap-1.5 px-3 py-2 md:px-4 md:py-2.5 min-h-[44px] rounded-xl font-bold text-xs transition-all active:scale-95 shrink-0 ${saved ? 'bg-green-600 text-white' : 'bg-[#FFD200] text-black hover:bg-yellow-400'}`}
                        >
                            {saving ? <Loader2 size={15} className="animate-spin"/> : saved ? <CheckCircle2 size={15}/> : <Save size={15}/>}
                            <span className="whitespace-nowrap">{saving ? '保存中' : saved ? '已保存' : '部署保存'}</span>
                        </button>
                    </div>
                </div>

                {/* MODULE TABS & GENERAL ACTIONS */}
                <div className="bg-white border-b border-gray-200 p-2 md:p-2.5 flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center shrink-0">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide shrink-0 pb-1 sm:pb-0">
                        {[
                            { key: 'ITEMS', label: '品项翻译', sub: `${translatedCount}/${totalItems}` },
                            { key: 'CATEGORIES', label: '分类翻译', sub: `${Object.keys(categoryTranslations).filter(k => categoryTranslations[k]).length}` },
                            { key: 'UNITS', label: '单位翻译', sub: `${Object.keys(unitTranslations).filter(k => unitTranslations[k]).length}/${UNIT_LIST.length}` },
                            { key: 'UI', label: 'UI 标签', sub: `${Object.keys(uiTranslations).filter(k => uiTranslations[k]).length}/${UI_LABELS.length}` },
                        ].map(tab => (
                            <button 
                                key={tab.key}
                                onClick={() => setActiveSection(tab.key as any)} 
                                style={{ touchAction: 'manipulation' }}
                                className={`flex-1 min-h-[40px] py-2 px-3 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 ${activeSection === tab.key ? 'bg-[#111111] text-[#FFD200] shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                            >
                                {tab.label} <span className="text-[10px] opacity-60 font-mono ml-0.5">({tab.sub})</span>
                            </button>
                        ))}
                    </div>

                    {/* AI ASSISTANT PANEL */}
                    <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 pt-1 sm:pt-0">
                        <button
                            onClick={handleAiTranslate}
                            disabled={translating}
                            style={{ touchAction: 'manipulation' }}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                            {translating ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>AI 翻译中...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} className="text-yellow-300 animate-pulse" />
                                    <span>AI 翻译 20 项</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => setShowMissingOnly(!showMissingOnly)}
                            style={{ touchAction: 'manipulation' }}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-all ${showMissingOnly ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                            {showMissingOnly ? <EyeOff size={14} /> : <Eye size={14} />}
                            <span>{showMissingOnly ? '只看未翻译' : '查看全部'}</span>
                        </button>
                    </div>
                </div>

                {/* MAIN TRANSLATION CANVAS */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-36">
                    
                    {/* === ITEMS SECTION === */}
                    {activeSection === 'ITEMS' && (
                        <div className="space-y-4">
                            {/* Stock view switcher + Search */}
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                                    {(['KITCHEN', 'BAR', 'GENERAL', 'FUEL'] as const).map(view => (
                                        <button 
                                            key={view} 
                                            onClick={() => { setActiveStockView(view); setExpandedCats(new Set()); }}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeStockView === view ? 'bg-[#111111] text-[#FFD200]' : 'text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            {TAB_ICONS[view]} {view === 'KITCHEN' ? '厨房' : view === 'BAR' ? '水吧' : view === 'GENERAL' ? '后勤' : '燃料'}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3.5 top-3 text-gray-400" size={13}/>
                                    <input 
                                        type="text" placeholder="搜索品项名称、ID..." value={searchTerm} 
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm md:text-xs font-bold outline-none focus:border-[#FFD200] transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            {/* Group list */}
                            {Object.entries(groupedItems).map(([catId, catItems]) => {
                                const catInfo = CATEGORY_SECTIONS[activeStockView]?.find(c => c.id === catId);
                                const isExpanded = expandedCats.has(catId) || searchTerm.length > 0 || showMissingOnly;
                                const catTranslated = catItems.filter(i => (itemTranslations[i.id] || '').trim()).length;
                                
                                return (
                                    <div key={catId} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                        <button 
                                            onClick={() => toggleCat(catId)}
                                            className="w-full p-3.5 px-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100"
                                        >
                                            <div className="flex items-center gap-2">
                                                {isExpanded ? <ChevronDown size={15} className="text-gray-500"/> : <ChevronRight size={15} className="text-gray-500"/>}
                                                <span className="font-black text-xs text-[#111111]">{catInfo?.label || catId}</span>
                                                <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded-full">{catTranslated} / {catItems.length}</span>
                                            </div>
                                            {catTranslated === catItems.length && catItems.length > 0 && (
                                                <CheckCircle2 size={15} className="text-green-500"/>
                                            )}
                                        </button>
                                        
                                        {isExpanded && (
                                            <div className="divide-y divide-gray-100">
                                                {catItems.map(item => {
                                                    const currentVal = itemTranslations[item.id] || '';
                                                    const isDraft = currentVal !== savedItemTranslations[item.id];
                                                    const isMissing = !currentVal.trim();
                                                    
                                                    return (
                                                        <div key={item.id} className={`p-3 px-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${isDraft ? 'bg-green-50/60' : 'hover:bg-gray-50/50'}`}>
                                                            <div className="flex items-center gap-2.5 sm:w-2/5 min-w-0">
                                                                <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{item.id}</span>
                                                                <div className="truncate">
                                                                    <div className="text-xs font-black text-[#111111]">{item.name}</div>
                                                                    {item.image && <div className="text-[9px] text-gray-400 font-mono mt-0.5">有图片关联</div>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 sm:w-3/5">
                                                                <span className="text-xs text-gray-300 font-mono">→</span>
                                                                <div className="relative flex-grow">
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="ဘာသာပြန် ရိုက်ထည့်ပါ (输入缅甸文翻译)..."
                                                                        value={currentVal}
                                                                        onChange={e => setItemTranslations(prev => ({...prev, [item.id]: e.target.value}))}
                                                                        className={`w-full p-2.5 pr-14 rounded-lg text-sm md:text-xs font-bold outline-none border transition-all ${isMissing ? 'bg-gray-50 border-gray-200 focus:border-[#FFD200]' : isDraft ? 'bg-green-50 border-green-300 text-green-900 focus:border-green-500' : 'bg-white border-gray-200 text-gray-800 focus:border-[#FFD200]'}`}
                                                                    />
                                                                    {isDraft && (
                                                                        <span className="absolute right-2 top-2 bg-green-200 text-green-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">草稿</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            
                            {Object.keys(groupedItems).length === 0 && (
                                <div className="text-center text-gray-400 py-12 text-sm font-bold bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <AlertCircle size={24} className="mx-auto mb-2 text-orange-400" />
                                    没有找到对应的未翻译或搜索品项
                                </div>
                            )}
                        </div>
                    )}

                    {/* === CATEGORIES SECTION === */}
                    {activeSection === 'CATEGORIES' && (
                        <div className="space-y-4">
                            {Object.entries(CATEGORY_SECTIONS).map(([group, cats]) => {
                                const filteredCats = showMissingOnly 
                                    ? cats.filter(c => !(categoryTranslations[c.id] || '').trim())
                                    : cats;

                                if (filteredCats.length === 0) return null;

                                return (
                                    <div key={group} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 border-b pb-1">{group === 'KITCHEN' ? '厨房' : group === 'BAR' ? '水吧' : group === 'GENERAL' ? '后勤' : '燃料'}</h4>
                                        <div className="space-y-3">
                                            {filteredCats.map(cat => {
                                                const currentVal = categoryTranslations[cat.id] || '';
                                                const isDraft = currentVal !== savedCategoryTranslations[cat.id];
                                                const isMissing = !currentVal.trim();

                                                return (
                                                    <div key={cat.id} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${isDraft ? 'bg-green-50/50' : ''}`}>
                                                        <span className="text-xs font-black text-[#111111] w-1/3 truncate">{cat.label}</span>
                                                        <span className="text-xs text-gray-300">→</span>
                                                        <div className="relative flex-grow">
                                                            <input 
                                                                type="text"
                                                                placeholder="ဘာသာပြန်..."
                                                                value={currentVal}
                                                                onChange={e => setCategoryTranslations(prev => ({...prev, [cat.id]: e.target.value}))}
                                                                className={`w-full p-2.5 pr-14 rounded-lg text-sm md:text-xs font-bold outline-none border transition-all ${isMissing ? 'bg-gray-50 border-gray-200 focus:border-[#FFD200]' : isDraft ? 'bg-green-50 border-green-300 text-green-900 focus:border-green-500' : 'bg-white border-gray-200 focus:border-[#FFD200]'}`}
                                                            />
                                                            {isDraft && (
                                                                <span className="absolute right-2 top-2 bg-green-200 text-green-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">草稿</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* === UNITS SECTION === */}
                    {activeSection === 'UNITS' && (
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <h4 className="text-xs font-black text-[#111111] uppercase tracking-wider mb-4 border-b pb-2">单位翻译对照表 (Unit Translations)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {UNIT_LIST.filter(u => !showMissingOnly || !(unitTranslations[u] || '').trim()).map(unit => {
                                    const currentVal = unitTranslations[unit] || '';
                                    const isDraft = currentVal !== savedUnitTranslations[unit];
                                    const isMissing = !currentVal.trim();

                                    return (
                                        <div key={unit} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${isDraft ? 'bg-green-50/50' : ''}`}>
                                            <span className="text-xs font-mono font-black text-[#111111] bg-gray-100 px-3 py-2 rounded-lg w-20 text-center shrink-0">{unit}</span>
                                            <span className="text-xs text-gray-300">→</span>
                                            <div className="relative flex-grow">
                                                <input 
                                                    type="text"
                                                    placeholder="ဘာသာပြန်..."
                                                    value={currentVal}
                                                    onChange={e => setUnitTranslations(prev => ({...prev, [unit]: e.target.value}))}
                                                    className={`w-full p-2.5 pr-14 rounded-lg text-sm md:text-xs font-bold outline-none border transition-all ${isMissing ? 'bg-gray-50 border-gray-200 focus:border-[#FFD200]' : isDraft ? 'bg-green-50 border-green-300 text-green-900 focus:border-green-500' : 'bg-white border-gray-200 focus:border-[#FFD200]'}`}
                                                />
                                                {isDraft && (
                                                    <span className="absolute right-2 top-2 bg-green-200 text-green-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">草稿</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* === UI LABELS SECTION === */}
                    {activeSection === 'UI' && (
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <h4 className="text-xs font-black text-[#111111] uppercase tracking-wider mb-4 border-b pb-2 font-sans">界面核心标签翻译 (UI Label Translations)</h4>
                            <div className="space-y-3">
                                {UI_LABELS.filter(l => !showMissingOnly || !(uiTranslations[l] || '').trim()).map(label => {
                                    const currentVal = uiTranslations[label] || '';
                                    const isDraft = currentVal !== savedUiTranslations[label];
                                    const isMissing = !currentVal.trim();

                                    return (
                                        <div key={label} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${isDraft ? 'bg-green-50/50' : ''}`}>
                                            <span className="text-xs font-black text-[#111111] w-1/3 truncate">{label}</span>
                                            <span className="text-xs text-gray-300">→</span>
                                            <div className="relative flex-grow">
                                                <input 
                                                    type="text"
                                                    placeholder="ဘာသာပြန်..."
                                                    value={currentVal}
                                                    onChange={e => setUiTranslations(prev => ({...prev, [label]: e.target.value}))}
                                                    className={`w-full p-2.5 pr-14 rounded-lg text-sm md:text-xs font-bold outline-none border transition-all ${isMissing ? 'bg-gray-50 border-gray-200 focus:border-[#FFD200]' : isDraft ? 'bg-green-50 border-green-300 text-green-900 focus:border-green-500' : 'bg-white border-gray-200 focus:border-[#FFD200]'}`}
                                                />
                                                {isDraft && (
                                                    <span className="absolute right-2 top-2 bg-green-200 text-green-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">草稿</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* BOTTOM FLOATING CONTROL BAR */}
                <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-2xl z-30 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                    <div className="text-[11px] md:text-xs text-gray-500 text-center sm:text-left leading-tight">
                        <span className="inline-block mr-1 text-gray-400 font-medium">系统盘点:</span>
                        品项 <strong className="text-[#111111] font-mono">{translatedCount} / {totalItems}</strong> 已译 •
                        分类 <strong className="text-[#111111] font-mono">{Object.values(categoryTranslations).filter(v => v?.trim()).length}</strong> •
                        单位 <strong className="text-[#111111] font-mono">{Object.values(unitTranslations).filter(v => v?.trim()).length}</strong> •
                        UI <strong className="text-[#111111] font-mono">{Object.values(uiTranslations).filter(v => v?.trim()).length}</strong>
                        {unsavedCount > 0 && (
                            <span className="text-orange-600 font-bold ml-1.5 inline-block animate-pulse">
                                (待保存修改 {unsavedCount})
                            </span>
                        )}
                    </div>
                    
                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                        <button
                            onClick={onClose}
                            style={{ touchAction: 'manipulation' }}
                            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] border border-gray-300 hover:bg-gray-50 rounded-xl font-bold text-xs text-gray-700 active:scale-95 transition-all"
                        >
                            关闭
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={saving}
                            style={{ touchAction: 'manipulation' }}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] bg-[#111111] text-[#FFD200] rounded-xl font-black text-xs shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                            <span>{saving ? '正在部署保存...' : `确认并保存当前更改 (${unsavedCount})`}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
