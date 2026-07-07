
import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Search, Languages, CheckCircle2, Loader2, Package, Flame, Coffee, Box, ChevronDown, ChevronRight } from 'lucide-react';
import { StockItem } from '../../types';
import { DataManager } from '../../utils/dataManager';

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

const UNIT_LIST = ['kg', 'pkt', 'btl', 'ctn', 'roll', 'box', 'tank', 'tray', 'bag', 'pc', 'set', 'pair'];

const UI_LABELS = ['厨房', '水吧', '后勤', '燃料', '库存盘点', '库存总览', '搜索', '保存', '当前', '最低', '最高', '单位', '品名', '数量', '不足', '正常', '充足'];

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
    
    // All stock items from Firebase
    const [allItems, setAllItems] = useState<StockItem[]>([]);
    
    // Translation data
    const [itemTranslations, setItemTranslations] = useState<Record<string, string>>({});
    const [categoryTranslations, setCategoryTranslations] = useState<Record<string, string>>({});
    const [unitTranslations, setUnitTranslations] = useState<Record<string, string>>({});
    const [uiTranslations, setUiTranslations] = useState<Record<string, string>>({});
    
    // View state
    const [activeSection, setActiveSection] = useState<'ITEMS' | 'CATEGORIES' | 'UNITS' | 'UI'>('ITEMS');
    const [activeStockView, setActiveStockView] = useState<'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL'>('KITCHEN');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

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
            setItemTranslations(trans.items || {});
            setCategoryTranslations(trans.categories || {});
            setUnitTranslations(trans.units || {});
            setUiTranslations(trans.ui || {});
        } catch (e) { console.error(e); } finally { setLoading(false); }
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
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) { 
            console.error(e); 
            alert('保存失败！'); 
        } finally { setSaving(false); }
    };

    // Filter items by current stock view
    const currentViewItems = useMemo(() => {
        const viewCategories = CATEGORY_SECTIONS[activeStockView]?.map(c => c.id) || [];
        let filtered = allItems.filter(item => viewCategories.includes(item.category));
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
        }
        return filtered;
    }, [allItems, activeStockView, searchTerm]);

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

    // Stats
    const totalItems = allItems.length;
    const translatedCount = Object.values(itemTranslations).filter(v => v && v.trim()).length;

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center">
                <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-[#FFD700]"/>
                    <p className="text-sm font-bold text-gray-500">加载翻译数据...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-5xl md:h-[95vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* HEADER */}
                <div className="bg-[#1A1A1A] p-4 flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700] safe-area-top">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#FFD700] text-black p-2.5 rounded-xl shadow-lg"><Languages size={24}/></div>
                        <div>
                            <h3 className="font-serif font-black text-xl tracking-wide">翻译管理器</h3>
                            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">TRANSLATION MANAGER • 缅甸语 (Burmese)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-right mr-2 hidden sm:block">
                            <div className="text-[10px] text-gray-400">翻译进度</div>
                            <div className="text-sm font-mono font-black text-[#FFD700]">{translatedCount}/{totalItems}</div>
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={saving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 ${saved ? 'bg-green-500 text-white' : 'bg-[#FFD700] text-black hover:bg-yellow-400'}`}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin"/> : saved ? <CheckCircle2 size={16}/> : <Save size={16}/>}
                            {saving ? '保存中...' : saved ? '已保存!' : '保存'}
                        </button>
                        <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full select-none transition-colors"><X size={20}/></button>
                    </div>
                </div>

                {/* SECTION TABS */}
                <div className="bg-white border-b border-gray-200 p-2 flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
                    {[
                        { key: 'ITEMS', label: '品项翻译', sub: `${translatedCount}/${totalItems}` },
                        { key: 'CATEGORIES', label: '分类翻译', sub: `${Object.keys(categoryTranslations).filter(k => categoryTranslations[k]).length} 条` },
                        { key: 'UNITS', label: '单位翻译', sub: `${Object.keys(unitTranslations).filter(k => unitTranslations[k]).length} 条` },
                        { key: 'UI', label: 'UI 标签', sub: `${Object.keys(uiTranslations).filter(k => uiTranslations[k]).length} 条` },
                    ].map(tab => (
                        <button 
                            key={tab.key}
                            onClick={() => setActiveSection(tab.key as any)} 
                            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeSection === tab.key ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                        >
                            {tab.label} <span className="text-[9px] opacity-60 ml-1">{tab.sub}</span>
                        </button>
                    ))}
                </div>

                {/* CONTENT */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-32">
                    
                    {/* === ITEMS SECTION === */}
                    {activeSection === 'ITEMS' && (
                        <div className="space-y-4">
                            {/* Stock view switcher + search */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                                    {(['KITCHEN', 'BAR', 'GENERAL', 'FUEL'] as const).map(view => (
                                        <button 
                                            key={view} 
                                            onClick={() => { setActiveStockView(view); setExpandedCats(new Set()); }}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${activeStockView === view ? 'bg-[#1A1A1A] text-[#FFD700]' : 'text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            {TAB_ICONS[view]} {view === 'KITCHEN' ? '厨房' : view === 'BAR' ? '水吧' : view === 'GENERAL' ? '后勤' : '燃料'}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3 top-2.5 text-gray-400" size={14}/>
                                    <input 
                                        type="text" placeholder="搜索品项..." value={searchTerm} 
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD700]"
                                    />
                                </div>
                            </div>

                            {/* Items grouped by category */}
                            {Object.entries(groupedItems).map(([catId, catItems]) => {
                                const catInfo = CATEGORY_SECTIONS[activeStockView]?.find(c => c.id === catId);
                                const isExpanded = expandedCats.has(catId) || searchTerm.length > 0;
                                const catTranslated = catItems.filter(i => itemTranslations[i.id]?.trim()).length;
                                
                                return (
                                    <div key={catId} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                        <button 
                                            onClick={() => toggleCat(catId)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
                                                <span className="font-bold text-sm text-[#1A1A1A]">{catInfo?.label || catId}</span>
                                                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{catTranslated}/{catItems.length}</span>
                                            </div>
                                            {catTranslated === catItems.length && catItems.length > 0 && (
                                                <CheckCircle2 size={16} className="text-green-500"/>
                                            )}
                                        </button>
                                        
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                                {catItems.map(item => (
                                                    <div key={item.id} className="p-3 px-4 flex flex-col sm:flex-row sm:items-center gap-2">
                                                        <div className="flex items-center gap-2 sm:w-2/5 min-w-0">
                                                            <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{item.id}</span>
                                                            <span className="text-xs font-bold text-[#1A1A1A] truncate">{item.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:w-3/5">
                                                            <span className="text-[10px] text-gray-400 shrink-0">→</span>
                                                            <input 
                                                                type="text"
                                                                placeholder="ဘာသာပြန် ရိုက်ထည့်ပါ..."
                                                                value={itemTranslations[item.id] || ''}
                                                                onChange={e => setItemTranslations(prev => ({...prev, [item.id]: e.target.value}))}
                                                                className={`flex-grow p-2 rounded-lg text-xs font-bold outline-none border transition-colors ${itemTranslations[item.id]?.trim() ? 'bg-green-50 border-green-200 text-green-900' : 'bg-gray-50 border-gray-200 text-gray-800 focus:border-[#FFD700]'}`}
                                                            />
                                                            {itemTranslations[item.id]?.trim() && <CheckCircle2 size={14} className="text-green-500 shrink-0"/>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            
                            {Object.keys(groupedItems).length === 0 && (
                                <div className="text-center text-gray-400 py-12 text-sm">没有找到品项</div>
                            )}
                        </div>
                    )}

                    {/* === CATEGORIES SECTION === */}
                    {activeSection === 'CATEGORIES' && (
                        <div className="space-y-4">
                            {Object.entries(CATEGORY_SECTIONS).map(([group, cats]) => (
                                <div key={group} className="bg-white rounded-2xl border border-gray-200 p-4">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{group}</h4>
                                    <div className="space-y-2">
                                        {cats.map(cat => (
                                            <div key={cat.id} className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-[#1A1A1A] w-1/3 truncate">{cat.label}</span>
                                                <span className="text-[10px] text-gray-400">→</span>
                                                <input 
                                                    type="text"
                                                    placeholder="ဘာသာပြန်..."
                                                    value={categoryTranslations[cat.id] || ''}
                                                    onChange={e => setCategoryTranslations(prev => ({...prev, [cat.id]: e.target.value}))}
                                                    className={`flex-grow p-2 rounded-lg text-xs font-bold outline-none border transition-colors ${categoryTranslations[cat.id]?.trim() ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 focus:border-[#FFD700]'}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* === UNITS SECTION === */}
                    {activeSection === 'UNITS' && (
                        <div className="bg-white rounded-2xl border border-gray-200 p-4">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">单位翻译 (Unit Translations)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {UNIT_LIST.map(unit => (
                                    <div key={unit} className="flex items-center gap-3">
                                        <span className="text-xs font-mono font-bold text-[#1A1A1A] bg-gray-100 px-3 py-2 rounded-lg w-16 text-center">{unit}</span>
                                        <span className="text-[10px] text-gray-400">→</span>
                                        <input 
                                            type="text"
                                            placeholder="ဘာသာပြန်..."
                                            value={unitTranslations[unit] || ''}
                                            onChange={e => setUnitTranslations(prev => ({...prev, [unit]: e.target.value}))}
                                            className={`flex-grow p-2 rounded-lg text-xs font-bold outline-none border transition-colors ${unitTranslations[unit]?.trim() ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 focus:border-[#FFD700]'}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* === UI LABELS SECTION === */}
                    {activeSection === 'UI' && (
                        <div className="bg-white rounded-2xl border border-gray-200 p-4">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">界面标签翻译 (UI Label Translations)</h4>
                            <div className="space-y-2">
                                {UI_LABELS.map(label => (
                                    <div key={label} className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-[#1A1A1A] w-24 truncate">{label}</span>
                                        <span className="text-[10px] text-gray-400">→</span>
                                        <input 
                                            type="text"
                                            placeholder="ဘာသာပြန်..."
                                            value={uiTranslations[label] || ''}
                                            onChange={e => setUiTranslations(prev => ({...prev, [label]: e.target.value}))}
                                            className={`flex-grow p-2 rounded-lg text-xs font-bold outline-none border transition-colors ${uiTranslations[label]?.trim() ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 focus:border-[#FFD700]'}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* FLOATING SAVE BAR */}
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                        品项: <strong className="text-[#1A1A1A]">{translatedCount}/{totalItems}</strong> 已翻译 •
                        分类: <strong className="text-[#1A1A1A]">{Object.values(categoryTranslations).filter(v => v?.trim()).length}</strong> •
                        单位: <strong className="text-[#1A1A1A]">{Object.values(unitTranslations).filter(v => v?.trim()).length}</strong> •
                        UI: <strong className="text-[#1A1A1A]">{Object.values(uiTranslations).filter(v => v?.trim()).length}</strong>
                    </div>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-sm shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                        {saving ? '保存中...' : '保存翻译 (Save)'}
                    </button>
                </div>
            </div>
        </div>
    );
};
