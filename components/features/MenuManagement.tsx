import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Utensils, Plus, Search, Edit3, Trash2, X, Save, Image as ImageIcon, Box,
    Truck, RefreshCw, Camera, Loader2, Copy, Layers, AlertTriangle, Wrench,
    ArrowLeft, ArrowRight, Move, ChevronLeft, ChevronDown, ChevronUp,
    BookOpen, Clock, Youtube, Hash, Film,
    StickyNote, ListOrdered, Sparkles, Info, Check, ExternalLink, Scale
} from 'lucide-react';
import { MenuItem, MenuCategory, MenuVariant, StockItem, MenuIngredient } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { MENU_CATEGORIES, INITIAL_MENU_ITEMS } from '../../constants/menu';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { uploadToCloudinary } from '../utils';

interface MenuManagementProps {
    onClose?: () => void;
    isModal?: boolean;
}

const STOCK_CATEGORIES: Record<string, string> = {
    'FRESH': '生鲜 (Fresh)', 'MEAT': '肉类 (Meat)', 'SEAFOOD': '海鲜 (Seafood)',
    'VEG': '蔬果 (Veg)', 'NOODLE': '面类 (Noodles)', 'DRY': '干货 (Dry)',
    'SAUCE': '酱料 (Sauce)', 'HQ': '总店 (HQ)', 'TEA': '茶叶 (Tea)',
    'FRUIT': '水果 (Fruit)', 'RTD': '罐装 (Drinks)', 'OTHER': '其他 (Other)'
};

// 👑 提取 YouTube ID，用于缩略图预览 (兼容 youtu.be / youtube.com/watch / shorts / embed 等格式)
const extractYouTubeId = (url?: string): string | null => {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
};

// 👑 重新编号食材，保持 order 字段与数组顺序一致 (双轨制核心)
const renumberRecipe = (recipe?: MenuIngredient[]): MenuIngredient[] => {
    if (!recipe || recipe.length === 0) return [];
    return recipe.map((r, i) => ({ ...r, order: i + 1 }));
};

// 👑 按 order 字段排序食材 (向后兼容: order 缺失时按数组下标 fallback)
const sortRecipeByOrder = (recipe?: MenuIngredient[]): MenuIngredient[] => {
    if (!recipe || recipe.length === 0) return [];
    return [...recipe]
        .map((r, idx) => ({ ...r, order: r.order ?? idx + 1 }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
};

// 👑 重新计算规格成本 (recipe 任何变更后必须调用)
const recalcVariantCost = (recipe?: MenuIngredient[], overheadMarginPercent?: number): number => {
    if (!recipe || recipe.length === 0) return 0;
    const baseCost = recipe.reduce((sum, item) => {
        const yieldFactor = (item.yieldPercent && item.yieldPercent > 0) ? (item.yieldPercent / 100) : 1;
        return sum + (((item.qty || 0) * (item.costPerUnit || 0)) / yieldFactor);
    }, 0);
    return baseCost * (1 + (overheadMarginPercent || 0) / 100);
};

// ============================================================
// 弹窗类型 (统一替换 native confirm/alert，iOS 兼容)
// ============================================================
type ConfirmState = {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
} | null;

type InfoState = {
    title: string;
    message: string;
    icon?: 'success' | 'error' | 'info';
} | null;

export const MenuManagement: React.FC<MenuManagementProps> = ({ onClose, isModal = true }) => {
    // ---- Data State ----
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<MenuCategory[]>(MENU_CATEGORIES);
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [hasLegacyData, setHasLegacyData] = useState(false);

    // ---- View State ----
    const [activeCategory, setActiveCategory] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [priceMode, setPriceMode] = useState<'LOCAL' | 'DELIVERY'>('LOCAL');
    const [deliveryCommission, setDeliveryCommission] = useState<number>(27);
    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT' | 'YIELD_AUDIT'>('LIST');
    const [loading, setLoading] = useState(true);

    const [isReorderMode, setIsReorderMode] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

    // ---- 👑 V2.2 食材出成损耗换算与物料审计 ----
    const [conversionProfiles, setConversionProfiles] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);

    // - Model state (编辑/创建换算规则) -
    const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
    const [profileName, setProfileName] = useState('');
    const [bulkCost, setBulkCost] = useState(0);
    const [bulkUnit, setBulkUnit] = useState('kg');
    const [capacityCount, setCapacityCount] = useState(1);
    const [capacityUnit, setCapacityUnit] = useState('只');
    const [dishQty, setDishQty] = useState(1);
    const [dishUnit, setDishUnit] = useState('只');
    
    // - 👑 新增: 多规格 (小/中/大碟) 支持 -
    const [isMultiSize, setIsMultiSize] = useState(true);
    const [dishQtyS, setDishQtyS] = useState<number | ''>(2);
    const [dishQtyM, setDishQtyM] = useState<number | ''>(3);
    const [dishQtyL, setDishQtyL] = useState<number | ''>(5);

    // - 👑 智能菜谱规格配方实时联动状态 -
    const [useFormulaSync, setUseFormulaSync] = useState(false);
    const [linkedMenuItemId, setLinkedMenuItemId] = useState('');
    const [linkedStockItemId, setLinkedStockItemId] = useState('');
    const [syncValueType, setSyncValueType] = useState<'PIECE' | 'WEIGHT'>('PIECE');

    // - Audit/Reconciliation state -
    const [shouldDeductStock, setShouldDeductStock] = useState(true);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [actualBulkConsumed, setActualBulkConsumed] = useState<number | ''>('');
    const [actualDishesSold, setActualDishesSold] = useState<number | ''>('');
    
    // - 👑 多规格销售件数输入 -
    const [soldS, setSoldS] = useState<number | ''>('');
    const [soldM, setSoldM] = useState<number | ''>('');
    const [soldL, setSoldL] = useState<number | ''>('');

    // ---- Form State ----
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newId, setNewId] = useState('');
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState('A_SERIES');
    const [newOptions, setNewOptions] = useState('');
    const [newImage, setNewImage] = useState('');
    const [newVariants, setNewVariants] = useState<MenuVariant[]>([]);
    const [activeVariantTab, setActiveVariantTab] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ---- Modal / Selector State ----
    const [showStockSelector, setShowStockSelector] = useState(false);
    const [stockSearch, setStockSearch] = useState('');
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copySearch, setCopySearch] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // 👑 新增: 食材展开 / 拖拽 / 统一弹窗 (替换所有 native confirm/alert)
    const [expandedIngIdx, setExpandedIngIdx] = useState<number | null>(null);
    const [draggedIngIdx, setDraggedIngIdx] = useState<number | null>(null);
    const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
    const [infoModal, setInfoModal] = useState<InfoState>(null);
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

    // ============================================================
    // 👑 统一弹窗工具函数 (替换所有 native confirm/alert, iOS 兼容)
    // ============================================================
    const askConfirm = (
        title: string,
        message: string,
        onConfirm: () => void,
        opts?: { danger?: boolean; confirmText?: string; cancelText?: string }
    ) => setConfirmModal({ title, message, onConfirm, ...opts });

    const showInfo = (title: string, message: string, icon: 'success' | 'error' | 'info' = 'info') =>
        setInfoModal({ title, message, icon });

    // ============================================================
    // 数据加载 / Lifecycle
    // ============================================================
    useEffect(() => {
        loadData();
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 👑 编辑模式以及物料审计模式下锁定 body 滚动 (iOS Safari 防止 modal 背景滚穿)
    useEffect(() => {
        if (viewMode === 'EDIT' || viewMode === 'YIELD_AUDIT' || deleteId || showStockSelector || showCopyModal || confirmModal || infoModal) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = originalOverflow; };
        }
    }, [viewMode, deleteId, showStockSelector, showCopyModal, confirmModal, infoModal]);

    // 👑 智能计算当前配方实时联动数值 (穿透最新菜谱改动)
    const getLiveQuantities = (p: any) => {
        if (!p) return { dishQty: 1, dishQtyS: 0, dishQtyM: 0, dishQtyL: 0, capacityUnit: '只', isLiveSynced: false, menuName: '' };

        if (p.useFormulaSync && p.linkedMenuItemId && p.linkedStockItemId) {
            const liveMenu = menuItems.find(m => m.id === p.linkedMenuItemId);
            if (liveMenu) {
                const isPiece = p.syncValueType === 'PIECE';
                let sQty = p.dishQtyS;
                let mQty = p.dishQtyM;
                let lQty = p.dishQtyL;
                let baseQty = p.dishQty;
                let foundUnit = p.capacityUnit;

                liveMenu.variants.forEach(variant => {
                    const label = variant.label.toLowerCase();
                    const ing = variant.recipe?.find(r => r.stockId === p.linkedStockItemId);
                    if (ing) {
                        const val = isPiece ? (ing.pieceQty ?? ing.qty) : ing.qty;
                        const unit = isPiece ? (ing.pieceUnit ?? ing.unit) : ing.unit;
                        if (unit) foundUnit = unit;

                        if (label.includes('s') || label.includes('小')) {
                            sQty = val;
                        } else if (label.includes('m') || label.includes('中')) {
                            mQty = val;
                        } else if (label.includes('l') || label.includes('大')) {
                            lQty = val;
                        } else {
                            baseQty = val;
                        }
                    }
                });

                return {
                    dishQty: baseQty || p.dishQty,
                    dishQtyS: sQty || p.dishQtyS,
                    dishQtyM: mQty || p.dishQtyM,
                    dishQtyL: lQty || p.dishQtyL,
                    capacityUnit: foundUnit || p.capacityUnit,
                    isLiveSynced: true,
                    menuName: liveMenu.name.split(' (')[0]
                };
            }
        }

        return {
            dishQty: p.dishQty,
            dishQtyS: p.dishQtyS,
            dishQtyM: p.dishQtyM,
            dishQtyL: p.dishQtyL,
            capacityUnit: p.capacityUnit,
            isLiveSynced: false,
            menuName: ''
        };
    };

    // 👑 当绑定的菜品、配料或同步模式发生变化时，自动拉取配方数据填充到左侧建模表单
    useEffect(() => {
        if (!useFormulaSync || !linkedMenuItemId || !linkedStockItemId) return;
        
        const selectedMenu = menuItems.find(m => m.id === linkedMenuItemId);
        if (!selectedMenu) return;

        const isPiece = syncValueType === 'PIECE';
        let sQty: number | '' = '';
        let mQty: number | '' = '';
        let lQty: number | '' = '';
        let baseQty: number | '' = '';
        let foundUnit = '';

        selectedMenu.variants.forEach(variant => {
            const label = variant.label.toLowerCase();
            const ing = variant.recipe?.find(r => r.stockId === linkedStockItemId);
            if (!ing) return;

            const val = isPiece ? (ing.pieceQty ?? ing.qty) : ing.qty;
            const unit = isPiece ? (ing.pieceUnit ?? ing.unit) : ing.unit;
            if (unit) foundUnit = unit;

            if (label.includes('s') || label.includes('小')) {
                sQty = val;
            } else if (label.includes('m') || label.includes('中')) {
                mQty = val;
            } else if (label.includes('l') || label.includes('大')) {
                lQty = val;
            } else {
                baseQty = val;
            }
        });

        if (sQty !== '') setDishQtyS(sQty);
        if (mQty !== '') setDishQtyM(mQty);
        if (lQty !== '') setDishQtyL(lQty);
        if (baseQty !== '') setDishQty(baseQty);
        if (foundUnit) setCapacityUnit(foundUnit);

        const stockInfo = stockItems.find(s => s.id === linkedStockItemId);
        if (stockInfo) {
            setProfileName(`[配方同步] ${selectedMenu.name.split(' (')[0].trim()} - ${stockInfo.name.split(' (')[0].trim()}`);
            setBulkCost(stockInfo.cost);
            setBulkUnit(stockInfo.unit || 'kg');
        }
    }, [useFormulaSync, linkedMenuItemId, linkedStockItemId, syncValueType, menuItems, stockItems]);

    // 👑 找出当前选定关联菜品所有 variant 下涉及的配料食材
    const recipeIngredients = useMemo(() => {
        if (!linkedMenuItemId) return [];
        const currentLinkedMenuItem = menuItems.find(item => item.id === linkedMenuItemId);
        if (!currentLinkedMenuItem) return [];
        
        const map = new Map<string, string>(); // stockId -> stockName
        currentLinkedMenuItem.variants.forEach(v => {
            v.recipe?.forEach(ing => {
                if (ing.stockId) {
                    map.set(ing.stockId, ing.stockName || `${ing.stockId}`);
                }
            });
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [linkedMenuItemId, menuItems]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 加载物料出成模型配置与损耗对账记录
            const savedProfiles = localStorage.getItem('menu_yield_profiles');
            if (savedProfiles) {
                setConversionProfiles(JSON.parse(savedProfiles));
            } else {
                // 预置符合金莲记经典食材背景的推荐换算规则 (如：41/50 大只明虾，1L 经典蚝油)
                const defaultProfiles = [
                    {
                        id: 'shrimp_41_50',
                        stockId: 'stock_shrimp_41_50',
                        stockName: '大只海虾 Tiger Prawn (41/50)',
                        profileName: '大只珍宝海虾 (41/50规格) - 1kg大包装折算',
                        bulkCost: 45.00,
                        bulkUnit: 'kg',
                        capacityCount: 45,
                        capacityUnit: '只',
                        dishQty: 2,
                        isMultiSize: true,
                        dishQtyS: 2,
                        dishQtyM: 3,
                        dishQtyL: 5,
                        dishUnit: '只',
                        
                        // 👑 自动绑定 A01 (招牌福建面) 配料
                        useFormulaSync: true,
                        linkedMenuItemId: 'A01',
                        linkedStockItemId: 'stock_shrimp_41_50',
                        syncValueType: 'PIECE'
                    },
                    {
                        id: 'oyster_sauce_btl',
                        stockId: 'stock_oyster_sauce_premium',
                        stockName: '特级蚝油 Premium Oyster Sauce',
                        profileName: '金莲记秘制蚝油 (Oyster Sauce) - 1L / 1.2kg 瓶装折算',
                        bulkCost: 18.00,
                        bulkUnit: 'bottle',
                        capacityCount: 1200,
                        capacityUnit: 'g',
                        dishQty: 15,
                        isMultiSize: true,
                        dishQtyS: 15,
                        dishQtyM: 25,
                        dishQtyL: 40,
                        dishUnit: 'g',
                        
                        // 👑 自动绑定 A01 (招牌福建面) 配配蚝油
                        useFormulaSync: true,
                        linkedMenuItemId: 'A01',
                        linkedStockItemId: 'stock_oyster_sauce_premium',
                        syncValueType: 'WEIGHT'
                    }
                ];
                setConversionProfiles(defaultProfiles);
                localStorage.setItem('menu_yield_profiles', JSON.stringify(defaultProfiles));
            }

            const savedLogs = localStorage.getItem('menu_yield_audit_logs');
            if (savedLogs) {
                setAuditLogs(JSON.parse(savedLogs));
            }

            DataManager.getStock('KITCHEN').then(k =>
                DataManager.getStock('BAR').then(b =>
                    DataManager.getStock('GENERAL').then(g =>
                        setStockItems([...k, ...b, ...g])
                    )
                )
            ).catch(err => console.error("Stock load error", err));

            const items = await DataManager.getMenu();
            if (items && items.length > 0) {
                setMenuItems(items);
                const legacy = items.some(i => ['c2', 'c3', 'c4'].includes(i.id.toLowerCase()));
                setHasLegacyData(legacy);
            } else {
                setMenuItems(INITIAL_MENU_ITEMS);
            }
        } catch (error) {
            console.error("Failed to load menu data", error);
            setMenuItems(INITIAL_MENU_ITEMS);
        } finally {
            setLoading(false);
        }
    };

    // ---- 👑 V2.2 食材换算与损耗对账事件处理器 ----
    const handleSaveProfile = () => {
        if (!profileName) return showInfo("缺少模板名称", "请填入物料换算模板名称", "error");
        
        const newProfile = {
            id: `profile_${Date.now()}`,
            stockId: selectedStockItem?.id || 'manual',
            stockName: selectedStockItem?.name || '手动录入原料',
            profileName,
            bulkCost: Number(bulkCost) || 0,
            bulkUnit,
            capacityCount: Number(capacityCount) || 1,
            capacityUnit,
            dishQty: Number(dishQty) || 1,
            isMultiSize,
            dishQtyS: Number(dishQtyS) || 0,
            dishQtyM: Number(dishQtyM) || 0,
            dishQtyL: Number(dishQtyL) || 0,
            dishUnit,
            
            // 👑 保存配方绑定参数
            useFormulaSync,
            linkedMenuItemId: useFormulaSync ? linkedMenuItemId : '',
            linkedStockItemId: useFormulaSync ? linkedStockItemId : '',
            syncValueType
        };

        const updated = [newProfile, ...conversionProfiles];
        setConversionProfiles(updated);
        localStorage.setItem('menu_yield_profiles', JSON.stringify(updated));
        
        // 保存后自动选中并清空输入
        setSelectedProfileId(newProfile.id);
        setActualBulkConsumed('');
        setActualDishesSold('');
        setSoldS('');
        setSoldM('');
        setSoldL('');
        
        // 👑 重置绑定参数
        setUseFormulaSync(false);
        setLinkedMenuItemId('');
        setLinkedStockItemId('');
        setSyncValueType('PIECE');
        
        showInfo("✅ 保存成功", `规格模板「${profileName}」已成功保存并同步到对账面板中。`, "success");
    };

    const handleDeleteProfile = (id: string) => {
        askConfirm(
            "⚠️ 确认删除模板?",
            "删除该模板后，您将无法直接在右侧损耗面板选择该物料，历史对账记录将保持不变。",
            () => {
                const updated = conversionProfiles.filter(p => p.id !== id);
                setConversionProfiles(updated);
                localStorage.setItem('menu_yield_profiles', JSON.stringify(updated));
                if (selectedProfileId === id) setSelectedProfileId('');
                showInfo("🗑️ 模板已删除", "模板已从您的常用库中清除", "success");
            },
            { danger: true, confirmText: "是的，删除" }
        );
    };

    const handleSaveAuditLog = async (logData: any, stockId?: string, actualConsumed?: number) => {
        const newLog = {
            id: `log_${Date.now()}`,
            date: new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
            ...logData
        };
        const updated = [newLog, ...auditLogs];
        setAuditLogs(updated);
        localStorage.setItem('menu_yield_audit_logs', JSON.stringify(updated));

        let deductMsg = "";
        if (shouldDeductStock && stockId && stockId !== 'manual' && actualConsumed && actualConsumed > 0) {
            try {
                const types: ('KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL')[] = ['KITCHEN', 'BAR', 'GENERAL', 'FUEL'];
                let deductedItem = null;
                for (const t of types) {
                    const list = await DataManager.getStock(t);
                    const item = list.find(s => s.id === stockId);
                    if (item) {
                        const updatedItem = {
                            ...item,
                            currentQty: Math.max(0, (item.currentQty || 0) - actualConsumed)
                        };
                        await DataManager.saveStockItem(t, updatedItem);
                        deductedItem = updatedItem;
                        break;
                    }
                }
                if (deductedItem) {
                    deductMsg = `，并已自动在【库存总览】中扣减了 ${actualConsumed} ${logData.bulkUnit} 库存（当前剩余: ${deductedItem.currentQty.toFixed(2)}）`;
                    
                    // Background reload
                    DataManager.getStock('KITCHEN').then(k =>
                        DataManager.getStock('BAR').then(b =>
                            DataManager.getStock('GENERAL').then(g =>
                                setStockItems([...k, ...b, ...g])
                            )
                        )
                    ).catch(err => console.error("Stock reload error", err));
                }
            } catch (err) {
                console.error("Failed to deduct stock automatically", err);
            }
        }

        showInfo("📈 成功归档", `物料损耗对账记录已保存至下方的历史审计稽账单中${deductMsg}。`, "success");
    };

    const handleDeleteAuditLog = (id: string) => {
        const updated = auditLogs.filter(l => l.id !== id);
        setAuditLogs(updated);
        localStorage.setItem('menu_yield_audit_logs', JSON.stringify(updated));
    };

    // ============================================================
    // 菜品列表排序逻辑 (拖拽 / 上下箭头)
    // ============================================================
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const newItems = [...menuItems];
        const draggedItem = newItems[draggedItemIndex];
        newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, draggedItem);
        setMenuItems(newItems);
        setDraggedItemIndex(index);
    };

    const handleDragEnd = () => setDraggedItemIndex(null);

    const handleMoveItem = (index: number, direction: 'UP' | 'DOWN') => {
        if (direction === 'UP' && index === 0) return;
        if (direction === 'DOWN' && index === menuItems.length - 1) return;
        const newItems = [...menuItems];
        const targetIndex = direction === 'UP' ? index - 1 : index + 1;
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
        setMenuItems(newItems);
    };

    const saveReorderedList = async () => {
        askConfirm(
            "保存新排序?",
            "Confirm Save Order? 此操作将更新菜品的显示顺序。",
            async () => {
                setLoading(true);
                await DataManager.saveMenu(menuItems);
                setLoading(false);
                setIsReorderMode(false);
                showInfo("✅ 排序已保存", "Order Saved", 'success');
            }
        );
    };

    // ============================================================
    // 图片上传
    // ============================================================
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            setNewImage(url);
        } catch (error) {
            console.error("Image upload failed:", error);
            showInfo("上传失败", "图片上传失败，请重试 (Image upload failed)", 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ============================================================
    // 价格 / 利润计算
    // ============================================================
    const calculateDeliveryPrice = (localPrice: number) => {
        if (!localPrice) return 0;
        const factor = 1 - (deliveryCommission / 100);
        const safeFactor = factor > 0 ? factor : 1;
        const calculatedPrice = localPrice / safeFactor;
        const wholeNumber = Math.floor(calculatedPrice);
        const decimalPart = calculatedPrice - wholeNumber;
        return decimalPart >= 0.45 ? wholeNumber + 0.5 : wholeNumber;
    };

    const getDisplayPrice = (basePrice: number | undefined | null) => {
        const price = Number(basePrice) || 0;
        return priceMode === 'LOCAL' ? price : calculateDeliveryPrice(price);
    };

    const calculateMargin = (price: number, cost: number) => {
        const p = Number(price) || 0;
        const c = Number(cost) || 0;
        if (p <= 0) return 0;
        return ((p - c) / p) * 100;
    };

    // 👑 直接利润 = 卖价 - 成本 (RM 金额)
    const calculateProfit = (price: number, cost: number) => {
        const p = Number(price) || 0;
        const c = Number(cost) || 0;
        return p - c;
    };

    // ============================================================
    // 菜品 CRUD
    // ============================================================
    const saveMenu = async (items: MenuItem[]) => {
        setMenuItems(items);
        await DataManager.saveMenu(items);
    };

    const handleSaveItem = async () => {
        if (!newName) return showInfo("缺少菜名", "请填写菜品名称 (Name required)", 'error');
        const cleanId = newId.trim().toUpperCase().replace(/\s+/g, '');
        if (!cleanId) return showInfo("缺少编号", "请填写菜品编号 (Code/ID required)", 'error');

        const duplicate = menuItems.find(i => i.id === cleanId && i.id !== editingId);
        if (duplicate) {
            return showInfo("编号重复", `编号 [${cleanId}] 已经属于 ${duplicate.name}。 (ID already in use)`, 'error');
        }

        const validVariants = newVariants.filter(v => v.price > 0);
        if (validVariants.length === 0) return showInfo("缺少售价", "请至少填写一个规格的售价 (At least one variant needs a price)", 'error');

        // 👑 保存前重新编号所有规格的食材，保证 order 与数组顺序一致
        const finalVariants = newVariants.map(v => ({
            ...v,
            recipe: renumberRecipe(v.recipe),
            cost: recalcVariantCost(v.recipe, v.overheadMarginPercent)
        }));

        const newItem: MenuItem = {
            id: cleanId,
            name: newName,
            category: newCategory,
            variants: finalVariants,
            options: newOptions ? newOptions.split(',').map(s => s.trim()).filter(s => s) : [],
            image: newImage
        };

        setLoading(true);
        try {
            if (editingId) {
                if (cleanId !== editingId) {
                    await DataManager.deleteMenuItem(editingId);
                    const remaining = menuItems.filter(i => i.id !== editingId);
                    await saveMenu([...remaining, newItem]);
                } else {
                    const updated = menuItems.map(i => i.id === editingId ? newItem : i);
                    await saveMenu(updated);
                }
            } else {
                await saveMenu([...menuItems, newItem]);
            }
            resetForm();
            setViewMode('LIST');
            showInfo("✅ 已保存", `${newItem.name} 保存成功`, 'success');
        } catch (e) {
            console.error(e);
            showInfo("保存失败", "存储到后端时出错，请重试", 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEditItem = (item: MenuItem) => {
        if (isReorderMode) return;
        setNewId(item.id);
        setNewName(item.name);
        setNewCategory(item.category);
        setNewOptions(item.options ? item.options.join(', ') : '');
        setNewImage(item.image || '');

        // 👑 深拷贝 + 按 order 排序 (确保编辑时食材顺序稳定)
        const loadedVariants: MenuVariant[] = item.variants && item.variants.length > 0
            ? JSON.parse(JSON.stringify(item.variants))
            : [
                { label: 'S (小)', price: 0, cost: 0, recipe: [] },
                { label: 'M (中)', price: 0, cost: 0, recipe: [] },
                { label: 'L (大)', price: 0, cost: 0, recipe: [] }
            ];

        loadedVariants.forEach(v => {
            v.recipe = sortRecipeByOrder(v.recipe);
        });

        setNewVariants(loadedVariants);
        setEditingId(item.id);
        setViewMode('EDIT');
        setActiveVariantTab(0);
        setExpandedIngIdx(null);
    };

    const resetForm = () => {
        setNewId('');
        setNewName('');
        setNewCategory('A_SERIES');
        setNewOptions('');
        setNewImage('');
        setNewVariants([
            { label: 'S (小)', price: 0, cost: 0, recipe: [] },
            { label: 'M (中)', price: 0, cost: 0, recipe: [] },
            { label: 'L (大)', price: 0, cost: 0, recipe: [] }
        ]);
        setEditingId(null);
        setExpandedIngIdx(null);
    };

    const handleAddNew = () => { resetForm(); setViewMode('EDIT'); };
    const handleDeleteClick = (id: string) => { if (isReorderMode) return; setDeleteId(id); };

    const confirmDelete = async () => {
        if (deleteId) {
            await DataManager.deleteMenuItem(deleteId);
            const updated = menuItems.filter(i => i.id !== deleteId);
            setMenuItems(updated);
            setDeleteId(null);
            if (viewMode === 'EDIT') {
                resetForm();
                setViewMode('LIST');
            }
        }
    };

    const handleResetToDefault = () => {
        askConfirm(
            "⚠️ 重置菜谱?",
            "确定重置菜谱到初始状态吗？所有自定义更改将丢失，恢复为金莲记标准菜单。",
            async () => {
                setLoading(true);
                await DataManager.saveMenu(INITIAL_MENU_ITEMS);
                setMenuItems(INITIAL_MENU_ITEMS);
                setHasLegacyData(false);
                setLoading(false);
                showInfo("✅ 菜谱已恢复", "Menu Restored", 'success');
            },
            { danger: true, confirmText: '重置' }
        );
    };

    const handleFixLegacyData = () => {
        askConfirm(
            "⚠️ 修复旧数据?",
            "发现旧数据 (C2, C3...)。这将删除错误的 ID 并恢复 A13/A14 等正确 ID。",
            async () => {
                setLoading(true);
                try {
                    await DataManager.deleteMenuItem('c2'); await DataManager.deleteMenuItem('C2');
                    await DataManager.deleteMenuItem('c3'); await DataManager.deleteMenuItem('C3');
                    await DataManager.deleteMenuItem('c4'); await DataManager.deleteMenuItem('C4');
                    await DataManager.saveMenu(INITIAL_MENU_ITEMS);
                    await loadData();
                    showInfo("✅ 数据已修复", "Data Fixed", 'success');
                } catch (e) {
                    showInfo("修复失败", String(e), 'error');
                } finally {
                    setLoading(false);
                }
            },
            { danger: true, confirmText: '修复' }
        );
    };

    // ============================================================
    // 配方食材逻辑 (新增 / 编辑 / 排序 / 删除)
    // ============================================================
    const addIngredientToVariant = (stockItem: StockItem) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (!currentVariant.recipe) currentVariant.recipe = [];
        if (currentVariant.recipe.find(r => r.stockId === stockItem.id)) {
            setShowStockSelector(false);
            return;
        }
        const newOrder = currentVariant.recipe.length + 1;
        currentVariant.recipe.push({
            stockId: stockItem.id,
            stockName: stockItem.name,
            qty: 0,
            unit: stockItem.unit,
            costPerUnit: stockItem.cost,
            order: newOrder,
            spec: '',
            time: 0,
            note: '',
            step: '',
            youtubeUrl: '',
            // 👑 V2.1: 份数描述 (厨房看用) / 实际用量分离 — qty 仍用于算成本
            pieceQty: 0,
            pieceUnit: ''
        });
        currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent);
        setNewVariants(updatedVariants);
        setShowStockSelector(false);
        // 自动展开刚加入的食材
        setExpandedIngIdx(currentVariant.recipe.length - 1);
    };

    const updateIngredientQty = (idx: number, qty: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe && currentVariant.recipe[idx]) {
            currentVariant.recipe[idx].qty = isNaN(qty) ? 0 : qty;
            currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent);
        }
        setNewVariants(updatedVariants);
    };

    // 👑 通用食材字段更新器 (支持所有新增字段 spec/time/step/note/youtubeUrl/order)
    const updateIngredientField = (idx: number, field: keyof MenuIngredient, value: any) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe && currentVariant.recipe[idx]) {
            (currentVariant.recipe[idx] as any)[field] = value;
            if (field === 'qty' || field === 'costPerUnit' || field === 'yieldPercent') {
                currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent);
            }
        }
        setNewVariants(updatedVariants);
    };

    // 👑 智能 Kg 与 Gram 数量和单位一键互转
    const toggleIngredientKgGram = (idx: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe && currentVariant.recipe[idx]) {
            const ing = currentVariant.recipe[idx];
            const currentUnit = (ing.unit || '').toLowerCase();
            if (currentUnit === 'kg' || currentUnit === '公斤') {
                ing.unit = 'g';
                ing.qty = parseFloat(((ing.qty || 0) * 1000).toFixed(4));
                ing.costPerUnit = (ing.costPerUnit || 0) / 1000;
                // 同时把 pieceQty 转换（多向联动）
                if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                    ing.pieceQty = parseFloat(((ing.qty * ing.piecesPerKg) / 1000).toFixed(2));
                }
            } else if (currentUnit === 'g' || currentUnit === 'gram' || currentUnit === '克') {
                ing.unit = 'kg';
                ing.qty = parseFloat(((ing.qty || 0) / 1000).toFixed(4));
                ing.costPerUnit = (ing.costPerUnit || 0) * 1000;
                // 同时把 pieceQty 转换（多向联动）
                if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                    ing.pieceQty = parseFloat((ing.qty * ing.piecesPerKg).toFixed(2));
                }
            }
            currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent);
        }
        setNewVariants(updatedVariants);
    };

    const removeIngredient = (idx: number) => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (currentVariant.recipe) {
            currentVariant.recipe.splice(idx, 1);
            // 👑 重新编号 (保持 order 字段连续)
            currentVariant.recipe = renumberRecipe(currentVariant.recipe);
            currentVariant.cost = recalcVariantCost(currentVariant.recipe, currentVariant.overheadMarginPercent);
        }
        setNewVariants(updatedVariants);
        if (expandedIngIdx === idx) setExpandedIngIdx(null);
        else if (expandedIngIdx !== null && expandedIngIdx > idx) setExpandedIngIdx(expandedIngIdx - 1);
    };

    // 👑 食材上下移动 (双轨制: 同时更新数组顺序 + order 字段)
    const moveIngredient = (idx: number, direction: 'UP' | 'DOWN') => {
        const updatedVariants = [...newVariants];
        const currentVariant = updatedVariants[activeVariantTab];
        if (!currentVariant.recipe) return;
        if (direction === 'UP' && idx === 0) return;
        if (direction === 'DOWN' && idx === currentVariant.recipe.length - 1) return;
        const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
        [currentVariant.recipe[idx], currentVariant.recipe[targetIdx]] =
            [currentVariant.recipe[targetIdx], currentVariant.recipe[idx]];
        currentVariant.recipe = renumberRecipe(currentVariant.recipe);
        setNewVariants(updatedVariants);
        // 跟随展开
        if (expandedIngIdx === idx) setExpandedIngIdx(targetIdx);
        else if (expandedIngIdx === targetIdx) setExpandedIngIdx(idx);
    };

    // 食材拖拽排序 (桌面端 HTML5 drag/drop)
    const handleIngDragStart = (e: React.DragEvent, idx: number) => {
        setDraggedIngIdx(idx);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleIngDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedIngIdx === null || draggedIngIdx === idx) return;
        const updatedVariants = [...newVariants];
        const recipe = updatedVariants[activeVariantTab].recipe;
        if (!recipe) return;
        const dragged = recipe[draggedIngIdx];
        recipe.splice(draggedIngIdx, 1);
        recipe.splice(idx, 0, dragged);
        updatedVariants[activeVariantTab].recipe = renumberRecipe(recipe);
        setNewVariants(updatedVariants);
        setDraggedIngIdx(idx);
    };

    const handleIngDragEnd = () => setDraggedIngIdx(null);

    // ============================================================
    // 规格 CRUD + 配方同步 / 复制
    // ============================================================
    const updateVariantField = (idx: number, field: keyof MenuVariant, val: any) => {
        const updated = [...newVariants];
        updated[idx] = { ...updated[idx], [field]: val };
        if (field === 'overheadMarginPercent') {
            updated[idx].cost = recalcVariantCost(updated[idx].recipe, val);
        }
        setNewVariants(updated);
    };

    const deleteVariant = (idx: number) => {
        if (newVariants.length <= 1) {
            return showInfo("无法删除", "必须保留至少一个规格 (At least one variant required)", 'error');
        }
        askConfirm(
            "删除此规格?",
            `确定删除 [${newVariants[idx].label}] 吗？此规格的所有配方和做法将一并删除。`,
            () => {
                const updated = newVariants.filter((_, i) => i !== idx);
                setNewVariants(updated);
                setActiveVariantTab(0);
                setExpandedIngIdx(null);
            },
            { danger: true, confirmText: '删除' }
        );
    };

    const syncRecipeToAll = () => {
        const cur = newVariants[activeVariantTab];
        if (!cur.recipe || cur.recipe.length === 0) {
            return showInfo("无配方", "当前规格没有配方，无法同步。", 'info');
        }
        askConfirm(
            "同步配方?",
            `确定将 [${cur.label}] 的配方同步到其他所有规格吗？其他规格现有的配方将被覆盖（包括做法、注解、视频等全部字段）。`,
            () => {
                const baseRecipe = cur.recipe || [];
                const updatedVariants = newVariants.map((v, idx) => {
                    if (idx === activeVariantTab) return v;
                    const clonedRecipe = baseRecipe.map(ing => ({ ...ing }));
                    return {
                        ...v,
                        recipe: renumberRecipe(clonedRecipe),
                        cost: recalcVariantCost(clonedRecipe, v.overheadMarginPercent)
                    };
                });
                setNewVariants(updatedVariants);
                showInfo("✅ 配方已同步", "请检查其他规格的用量。", 'success');
            }
        );
    };

    const handleCopyRecipe = (sourceItem: MenuItem) => {
        if (!sourceItem.variants || sourceItem.variants.length === 0) {
            return showInfo("无变量", "Source item has no variants.", 'error');
        }
        const sourceVariant = sourceItem.variants[activeVariantTab] || sourceItem.variants[0];
        if (!sourceVariant.recipe || sourceVariant.recipe.length === 0) {
            return showInfo("无配方", "该菜品暂无配方 (No recipe found in source).", 'info');
        }
        askConfirm(
            "复制配方?",
            `确认从 [${sourceItem.name} - ${sourceVariant.label}] 复制配方？当前规格 [${newVariants[activeVariantTab].label}] 的现有配方将被覆盖。`,
            () => {
                const updatedVariants = [...newVariants];
                const cloned = JSON.parse(JSON.stringify(sourceVariant.recipe));
                updatedVariants[activeVariantTab].recipe = sortRecipeByOrder(cloned);
                updatedVariants[activeVariantTab].cost = recalcVariantCost(updatedVariants[activeVariantTab].recipe, updatedVariants[activeVariantTab].overheadMarginPercent);
                setNewVariants(updatedVariants);
                setShowCopyModal(false);
                setCopySearch('');
                showInfo("✅ 已复制", `从 ${sourceItem.name} 复制了 ${sourceVariant.recipe!.length} 项食材`, 'success');
            }
        );
    };

    // ============================================================
    // 视图过滤
    // ============================================================
    const visibleGridItems = useMemo(() => {
        return menuItems.map((item, index) => ({ ...item, globalIndex: index })).filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = activeCategory === 'ALL' || item.category === activeCategory;
            return matchesSearch && matchesCategory;
        });
    }, [menuItems, activeCategory, searchTerm]);

    const containerClass = isModal
        ? "fixed inset-0 z-[120] flex flex-col font-sans bg-[#F5F7FA]"
        : "relative w-full h-[85dvh] bg-[#F5F7FA] flex flex-col font-sans rounded-3xl overflow-hidden border border-gray-200 shadow-xl";

    // ============================================================
    // 渲染菜品卡片 (列表)
    // ============================================================
    const renderItemCard = (item: MenuItem & { globalIndex: number }, displayIndex: number) => (
        <div
            key={item.id}
            draggable={isReorderMode}
            onDragStart={(e) => handleDragStart(e, item.globalIndex)}
            onDragOver={(e) => handleDragOver(e, item.globalIndex)}
            onDragEnd={handleDragEnd}
            className={`
                bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 group flex flex-col relative overflow-hidden h-full select-none
                ${isReorderMode
                    ? 'cursor-move ring-2 ring-[#FFD700] ring-offset-2 scale-[0.98]'
                    : 'border border-gray-100 hover:border-yellow-400 cursor-default'
                }
            `}
        >
            {/* Header: ID Code + Commission + Edit/Delete Buttons */}
            <div className="p-3 pb-2.5 flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="bg-black/70 text-white text-[10px] font-mono font-black px-2 py-0.5 rounded-lg shadow-sm shrink-0">
                        {item.id}
                    </span>
                    {priceMode === 'DELIVERY' && !isReorderMode && (
                        <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg flex items-center gap-0.5 truncate shadow-sm">
                            <Truck size={10} /> {deliveryCommission}%
                        </span>
                    )}
                </div>
                {!isReorderMode && (
                    <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => handleEditItem(item)} className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#1A1A1A] bg-white border border-gray-200 hover:bg-[#FFD700] hover:border-[#FFD700] rounded-xl transition-colors active:scale-95 shadow-sm"><Edit3 size={12} /></button>
                        <button onClick={() => handleDeleteClick(item.id)} className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-red-600 bg-white border border-gray-200 hover:bg-red-500 hover:text-white hover:border-red-500 rounded-xl transition-colors active:scale-95 shadow-sm"><Trash2 size={12} /></button>
                    </div>
                )}
            </div>

            <div className="p-3 md:p-4 flex flex-col flex-grow bg-white relative z-10">
                <h4 className="font-black text-sm md:text-base text-[#1A1A1A] line-clamp-2 leading-snug mb-3 group-hover:text-yellow-600 transition-colors">
                    {item.name}
                </h4>

                {isReorderMode && (
                    <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl mt-auto p-1.5 shadow-inner">
                        <button onClick={() => handleMoveItem(item.globalIndex, 'UP')} className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white rounded-lg text-yellow-700 active:scale-95 shadow-sm flex items-center justify-center"><ArrowLeft size={14} /></button>
                        <Move size={16} className="text-yellow-500" />
                        <button onClick={() => handleMoveItem(item.globalIndex, 'DOWN')} className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white rounded-lg text-yellow-700 active:scale-95 shadow-sm flex items-center justify-center"><ArrowRight size={14} /></button>
                    </div>
                )}

                {!isReorderMode && (
                    <div className="mt-auto space-y-1.5 bg-gray-50/70 rounded-xl p-2.5 md:p-3 border border-gray-100">
                        {(item.variants || []).slice(0, 3).map((v, idx) => {
                            const dispPrice = getDisplayPrice(v.price);
                            return (
                                <div key={idx} className="flex justify-between items-end border-b border-dashed border-gray-200 last:border-0 pb-1.5 last:pb-0">
                                    <span className="font-bold text-xs text-gray-600 truncate pr-2">{v.label}</span>
                                    <div className={`font-mono font-black tabular-nums whitespace-nowrap leading-none ${priceMode === 'DELIVERY' ? 'text-blue-600' : 'text-[#1A1A1A]'}`}>
                                        <span className="text-[10px] mr-0.5 opacity-60">RM</span>
                                        <span className="text-sm">{dispPrice.toFixed(0)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!isReorderMode && item.options && item.options.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.options.slice(0, 3).map(opt => (
                            <span key={opt} className="text-[9px] bg-[#1A1A1A] text-[#FFD700] px-1.5 py-0.5 rounded flex items-center">{opt}</span>
                        ))}
                        {item.options.length > 3 && (
                            <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">+{item.options.length - 3}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // ============================================================
    // 渲染食材卡片 V2.1 (紧凑纵向卡 / 2 列网格 / 份数双轨)
    // ============================================================
    const renderIngredientCard = (ing: MenuIngredient, i: number) => {
        const yieldPercentVal = ing.yieldPercent ?? 100;
        const baseCostOnly = (ing.qty || 0) * (ing.costPerUnit || 0);
        const totalCost = baseCostOnly / (yieldPercentVal / 100);
        const ytId = extractYouTubeId(ing.youtubeUrl);
        const isExpanded = expandedIngIdx === i;
        const recipeLen = newVariants[activeVariantTab]?.recipe?.length || 0;
        const hasPieces = !!(ing.pieceQty && ing.pieceUnit);

        const stockItemMatch = stockItems.find(s => s.id === ing.stockId);
        const ingredientPhoto = stockItemMatch?.image;

        return (
            <div
                key={`${ing.stockId}_${i}`}
                draggable={!isMobile}
                onDragStart={(e) => handleIngDragStart(e, i)}
                onDragOver={(e) => handleIngDragOver(e, i)}
                onDragEnd={handleIngDragEnd}
                className={`bg-white rounded-2xl border-2 transition-all overflow-hidden shadow-sm flex flex-col
                    ${draggedIngIdx === i ? 'border-[#FFD700] shadow-lg scale-[0.99]' : isExpanded ? 'border-[#FFD700] shadow-md col-span-2 lg:col-span-2 xl:col-span-2' : 'border-gray-200 hover:border-gray-300'}`}
            >
                {/* ---------- 顶栏: #序号 + 名称 + 删除 ---------- */}
                <div className="p-2.5 pb-1.5 flex items-start gap-2">
                    <div className="flex flex-col gap-1.5 items-center justify-start shrink-0">
                        <div className="bg-[#1A1A1A] text-[#FFD700] text-[10px] font-mono font-black min-w-[28px] h-7 px-1.5 rounded-lg flex items-center justify-center">
                            #{ing.order ?? i + 1}
                        </div>
                        {ingredientPhoto && (
                            <div 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewImage({ url: ingredientPhoto, name: ing.stockName });
                                }}
                                className="w-16 h-12 rounded-xl overflow-hidden border-2 border-white shadow-md bg-cover bg-center cursor-zoom-in hover:scale-105 active:scale-95 transition-all shrink-0" 
                                style={{ backgroundImage: `url(${ingredientPhoto})` }} 
                            />
                        )}
                    </div>
                    <div className="flex-grow min-w-0">
                        <div className="font-bold text-sm text-[#1A1A1A] leading-tight line-clamp-2">{ing.stockName}</div>
                        {ing.spec && (
                            <span className="inline-block mt-1 text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">
                                {ing.spec}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => removeIngredient(i)}
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center active:scale-90 transition-all shrink-0"
                        title="删除食材"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* ---------- 用量输入: qty + unit ---------- */}
                <div className="px-2.5">
                    <div className="flex items-stretch bg-gray-50 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <input
                            type="number"
                            step="0.01"
                            value={ing.qty || ''}
                            onChange={e => {
                                const qtyVal = parseFloat(e.target.value) || 0;
                                updateIngredientQty(i, qtyVal);
                                if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                                    const isKg = ['kg', '公斤'].includes((ing.unit || '').toLowerCase());
                                    const pieceQtyVal = isKg ? (qtyVal * ing.piecesPerKg) : (qtyVal * ing.piecesPerKg / 1000);
                                    updateIngredientField(i, 'pieceQty', parseFloat(pieceQtyVal.toFixed(2)));
                                }
                            }}
                            onClick={e => (e.target as HTMLInputElement).select()}
                            className="flex-grow p-2 text-center font-black text-base outline-none bg-white text-black min-w-0"
                            placeholder="0"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                const u = (ing.unit || '').toLowerCase();
                                if (['kg', 'g', '克', '公斤', 'gram'].includes(u)) {
                                    toggleIngredientKgGram(i);
                                }
                            }}
                            className={`text-[10px] font-bold px-2.5 border-l flex items-center shrink-0 transition-all select-none
                                ${['kg', 'g', '克', '公斤', 'gram'].includes((ing.unit || '').toLowerCase())
                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 font-extrabold cursor-pointer'
                                    : 'text-gray-500 bg-gray-50'}`}
                            title={['kg', 'g', '克', '公斤', 'gram'].includes((ing.unit || '').toLowerCase()) ? '点击一键互转公斤(Kg)和克(G)' : undefined}
                        >
                            {ing.unit} {['kg', 'g', '克', '公斤', 'gram'].includes((ing.unit || '').toLowerCase()) && '🔄'}
                        </button>
                    </div>
                </div>

                {/* ---------- 份数显示 (如果有 pieceQty + pieceUnit) ---------- */}
                {hasPieces && (
                    <div className="px-2.5 mt-1.5">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-center">
                            <span className="text-[10px] text-amber-700 font-bold">
                                ≈ {ing.pieceQty} {ing.pieceUnit}
                            </span>
                        </div>
                    </div>
                )}

                {/* ---------- 小计 + Meta 标签 ---------- */}
                <div className="px-2.5 mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1 text-[9px] text-gray-400">
                        {ing.time && ing.time > 0 ? (
                            <span className="flex items-center gap-0.5"><Clock size={9} /> {ing.time}分</span>
                        ) : null}
                        {ytId && <Youtube size={10} className="text-red-500" />}
                        {ing.step && <ListOrdered size={10} className="text-blue-500" />}
                        {ing.note && <StickyNote size={10} className="text-gray-500" />}
                    </div>
                    <div className="font-mono font-black text-xs text-[#1A1A1A] bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                        RM {totalCost.toFixed(2)}
                        {yieldPercentVal < 100 && (
                            <span className="text-[8px] bg-orange-100 text-orange-700 px-1 rounded font-black" title={`含备料损耗折算 (出成率 ${yieldPercentVal}%)`}>
                                {yieldPercentVal}%
                            </span>
                        )}
                    </div>
                </div>

                {/* ---------- 底部控制条: 上 / 下 / 展开 ---------- */}
                <div className="mt-2 p-1.5 bg-gray-50 border-t border-gray-100 flex items-center gap-1">
                    <button
                        onClick={() => moveIngredient(i, 'UP')}
                        disabled={i === 0}
                        className="flex-1 h-9 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center active:scale-90 transition-all"
                        title="上移"
                    >
                        <ChevronUp size={14} className="text-gray-600" />
                    </button>
                    <button
                        onClick={() => moveIngredient(i, 'DOWN')}
                        disabled={i === recipeLen - 1}
                        className="flex-1 h-9 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center active:scale-90 transition-all"
                        title="下移"
                    >
                        <ChevronDown size={14} className="text-gray-600" />
                    </button>
                    <button
                        onClick={() => setExpandedIngIdx(isExpanded ? null : i)}
                        className={`flex-[2] h-9 rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-all text-[11px] font-bold
                            ${isExpanded ? 'bg-[#1A1A1A] text-[#FFD700]' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                    >
                        {isExpanded ? (
                            <><ChevronUp size={14} /> 收起</>
                        ) : (
                            <><ChevronDown size={14} /> 详情</>
                        )}
                    </button>
                </div>

                {/* ============================================ */}
                {/* 展开区 (跨 2 列宽度) */}
                {/* ============================================ */}
                {isExpanded && (
                    <div className="bg-gradient-to-br from-yellow-50/50 to-white border-t-2 border-dashed border-yellow-200 p-4 space-y-4">

                        {/* 👑 V2.1 份数 + 实际用量 双轨 */}
                        <div className="bg-amber-50/50 border-2 border-amber-100 rounded-xl p-3">
                            <div className="flex items-center gap-1 mb-2">
                                <Scale size={12} className="text-amber-600" />
                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">份数 & 用量</span>
                            </div>
                            <p className="text-[9px] text-gray-500 mb-3">💡 份数描述给厨房看 (如「5 只虾」)，实际用量用于成本计算</p>

                            <div className="grid grid-cols-2 gap-2.5">
                                {/* 份数 pieceQty */}
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">份数</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        value={ing.pieceQty || ''}
                                        onChange={e => {
                                            const pieceQtyVal = parseFloat(e.target.value) || 0;
                                            updateIngredientField(i, 'pieceQty', pieceQtyVal);
                                            // Auto-convert pieces to weight if piecesPerKg is set
                                            if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                                                const isKg = ['kg', '公斤'].includes((ing.unit || '').toLowerCase());
                                                const qtyVal = isKg ? (pieceQtyVal / ing.piecesPerKg) : (pieceQtyVal / ing.piecesPerKg * 1000);
                                                updateIngredientQty(i, parseFloat(qtyVal.toFixed(4)));
                                            }
                                        }}
                                        placeholder="5"
                                        className="w-full p-2.5 bg-white rounded-lg text-base border border-amber-200 outline-none focus:border-amber-400 font-bold text-center"
                                    />
                                </div>
                                {/* 份数单位 pieceUnit */}
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">单位</label>
                                    <input
                                        type="text"
                                        list="piece-units-suggestions"
                                        value={ing.pieceUnit || ''}
                                        onChange={e => updateIngredientField(i, 'pieceUnit', e.target.value)}
                                        placeholder="只/片/段"
                                        className="w-full p-2.5 bg-white rounded-lg text-base border border-amber-200 outline-none focus:border-amber-400 font-bold text-center"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 pt-3 border-t border-amber-200 grid grid-cols-2 gap-2.5">
                                {/* 实际用量 qty (重复显示，强调用于成本) */}
                                <div>
                                    <label className="text-[9px] font-bold text-emerald-700 uppercase mb-1 block">实际用量 *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={ing.qty || ''}
                                        onChange={e => {
                                            const qtyVal = parseFloat(e.target.value) || 0;
                                            updateIngredientQty(i, qtyVal);
                                            // Auto-convert weight to pieces if piecesPerKg is set
                                            if (ing.piecesPerKg && ing.piecesPerKg > 0) {
                                                const isKg = ['kg', '公斤'].includes((ing.unit || '').toLowerCase());
                                                const pieceQtyVal = isKg ? (qtyVal * ing.piecesPerKg) : (qtyVal * ing.piecesPerKg / 1000);
                                                updateIngredientField(i, 'pieceQty', parseFloat(pieceQtyVal.toFixed(2)));
                                            }
                                        }}
                                        onClick={e => (e.target as HTMLInputElement).select()}
                                        placeholder="0"
                                        className="w-full p-2.5 bg-emerald-50 rounded-lg text-base border-2 border-emerald-200 outline-none focus:border-emerald-400 font-bold text-center"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-emerald-700 uppercase mb-1 block">单位 (可切换 🔄)</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const u = (ing.unit || '').toLowerCase();
                                            if (['kg', 'g', '克', '公斤', 'gram'].includes(u)) {
                                                toggleIngredientKgGram(i);
                                            }
                                        }}
                                        className={`w-full p-2.5 rounded-lg text-base border-2 font-black text-center min-h-[44px] transition-all select-none
                                            ${['kg', 'g', '克', '公斤', 'gram'].includes((ing.unit || '').toLowerCase())
                                                ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer'
                                                : 'bg-gray-100 border-gray-200 text-gray-600'}`}
                                    >
                                        {ing.unit} {['kg', 'g', '克', '公斤', 'gram'].includes((ing.unit || '').toLowerCase()) && '🔄'}
                                    </button>
                                </div>
                            </div>
                            <p className="text-[9px] text-emerald-700 mt-2 flex items-center gap-1">
                                <span className="font-black">小计: RM {totalCost.toFixed(2)}</span>
                                <span className="text-gray-400">({(ing.qty || 0)} × RM {(ing.costPerUnit || 0).toFixed(2)}/{ing.unit})</span>
                            </p>
                        </div>

                        {/* 👑 V2.2 自动重量与件数换算 (piecesPerKg) */}
                        {['kg', 'g', '克', '公斤', 'gram'].includes((ing.unit || '').toLowerCase()) && (
                            <div className="bg-indigo-50/70 border-2 border-indigo-150 rounded-xl p-3 space-y-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm">🦐</span>
                                    <div>
                                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">海鲜/数量高级规格换算 (Pieces & Density)</span>
                                        <span className="text-[8px] text-indigo-500 block">用于输入数量（几只/几粒）即可自动换算出 KG/g 实际重量</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 mt-1">
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">每 1kg 数量 (例如 45 只)</label>
                                        <div className="flex items-center bg-white rounded-lg border border-indigo-200 overflow-hidden">
                                            <input
                                                type="number"
                                                placeholder="未设置 (按重量算)"
                                                value={ing.piecesPerKg || ''}
                                                className="w-full p-2 text-center text-xs font-bold outline-none text-[#1A1A1A]"
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    updateIngredientField(i, 'piecesPerKg', val);
                                                    if (val > 0 && ing.pieceQty) {
                                                        const isKg = ['kg', '公斤'].includes((ing.unit || '').toLowerCase());
                                                        const weight = isKg ? (ing.pieceQty / val) : (ing.pieceQty / val * 1000);
                                                        updateIngredientQty(i, parseFloat(weight.toFixed(4)));
                                                    }
                                                }}
                                            />
                                            <span className="p-2 border-l bg-gray-50 text-[9px] text-gray-400 font-bold shrink-0">只/1kg</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">1 只折算成本</label>
                                        <div className="w-full p-2 bg-gray-50 rounded-lg text-xs font-black text-center text-indigo-700 border border-indigo-100 min-h-[38px] flex items-center justify-center">
                                            {ing.piecesPerKg && ing.piecesPerKg > 0 ? (() => {
                                                const isKg = ['kg', '公斤'].includes((ing.unit || '').toLowerCase());
                                                const kgCost = isKg ? (ing.costPerUnit || 0) : ((ing.costPerUnit || 0) * 1000);
                                                const pieceCost = kgCost / ing.piecesPerKg;
                                                return `RM ${pieceCost.toFixed(4)} /只`;
                                            })() : '按重量核算'}
                                        </div>
                                    </div>
                                </div>

                                {ing.piecesPerKg && ing.piecesPerKg > 0 && (
                                    <div className="text-[8px] text-indigo-600 bg-white/70 rounded p-1.5 border border-indigo-100 mt-1 leading-normal">
                                        💡 <strong>智能模式开启</strong>：每1kg重 {ing.piecesPerKg} 只。在上方修改
                                        <span className="mx-0.5 font-bold text-[#E65100]">份数</span> (如更改为 5 只)
                                        将精准联动修改 <span className="mx-0.5 font-bold text-green-700">实际用量</span> 为
                                        {" "}{(() => {
                                            const isKg = ['kg', '公斤'].includes((ing.unit || '').toLowerCase());
                                            const convertedVal = isKg ? (ing.pieceQty || 0) / ing.piecesPerKg : ((ing.pieceQty || 0) / ing.piecesPerKg) * 1000;
                                            return `${convertedVal.toFixed(2)} ${ing.unit}`;
                                        })()}！
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 食材规格 + 出成率 + 处理时间 + 顺序号 */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                    <Sparkles size={10} /> 食材规格 (Spec)
                                </label>
                                <input
                                    type="text"
                                    value={ing.spec || ''}
                                    onChange={e => updateIngredientField(i, 'spec', e.target.value)}
                                    placeholder="如: 大只虾、自制猪油"
                                    className="w-full p-2.5 bg-white rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-orange-600 uppercase mb-1 flex items-center gap-1" title="出成率/净料率 % (1-100)">
                                    <Scale size={10} className="text-orange-600" /> 出成率 (Yield %)
                                </label>
                                <div className="flex items-center bg-white rounded-lg border border-gray-200 overflow-hidden">
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={ing.yieldPercent ?? 100}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value) || 100;
                                            updateIngredientField(i, 'yieldPercent', val > 100 ? 100 : val < 1 ? 1 : val);
                                        }}
                                        className="w-full p-2.5 text-center text-base font-bold outline-none text-[#1A1A1A]"
                                    />
                                    <span className="p-2 border-l bg-gray-50 text-[10px] text-gray-500 font-bold shrink-0">%</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                    <Clock size={10} /> 处理时间 (分)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={ing.time || ''}
                                    onChange={e => updateIngredientField(i, 'time', parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-full p-2.5 bg-white rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                    <Hash size={10} /> 顺序号
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={ing.order ?? i + 1}
                                    onChange={e => updateIngredientField(i, 'order', parseInt(e.target.value) || 1)}
                                    className="w-full p-2.5 bg-white rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] font-bold"
                                />
                            </div>
                        </div>

                        {ing.yieldPercent && ing.yieldPercent < 100 && (
                            <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-150 rounded-xl p-3 leading-normal">
                                💡 <strong>净料与出成损耗分析</strong>：
                                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                    <li>配方中所需净料重量：<strong>{ing.qty} {ing.unit}</strong></li>
                                    <li>按 <strong>{ing.yieldPercent}%</strong> 出成率，需采购/准备毛料：<strong>{((ing.qty || 0) / (ing.yieldPercent / 100)).toFixed(2)} {ing.unit}</strong> (损耗约 {(((ing.qty || 0) / (ing.yieldPercent / 100)) - (ing.qty || 0)).toFixed(2)} {ing.unit})</li>
                                    <li>毛料采购单价：RM {ing.costPerUnit?.toFixed(2)} / {ing.unit}</li>
                                    <li>考虑损耗后的实际净料真实单价：<strong>RM {((ing.costPerUnit || 0) / (ing.yieldPercent / 100)).toFixed(2)} / {ing.unit}</strong> (增加约 RM {(((ing.costPerUnit || 0) / (ing.yieldPercent / 100)) - (ing.costPerUnit || 0)).toFixed(2)})</li>
                                </ul>
                            </div>
                        )}

                        {/* 做法 step */}
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                <ListOrdered size={10} /> 做法 (Step) — 该食材如何处理
                            </label>
                            <textarea
                                value={ing.step || ''}
                                onChange={e => updateIngredientField(i, 'step', e.target.value)}
                                placeholder="如: 虾去壳留尾，用淀粉抓洗，沥干水分，热油爆香"
                                rows={3}
                                className="w-full p-2.5 bg-white rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] resize-y leading-relaxed"
                            />
                        </div>

                        {/* 注解 note */}
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                <StickyNote size={10} /> 注解 (Note)
                            </label>
                            <textarea
                                value={ing.note || ''}
                                onChange={e => updateIngredientField(i, 'note', e.target.value)}
                                placeholder="如: 必须新鲜，冷冻虾口感差"
                                rows={2}
                                className="w-full p-2.5 bg-white rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] resize-y leading-relaxed"
                            />
                        </div>

                        {/* 👑 YouTube — 改为按钮式 */}
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                <Youtube size={11} className="text-red-500" /> YouTube 教学链接
                            </label>
                            <input
                                type="url"
                                value={ing.youtubeUrl || ''}
                                onChange={e => updateIngredientField(i, 'youtubeUrl', e.target.value)}
                                placeholder="https://www.youtube.com/watch?v=..."
                                className="w-full p-2.5 bg-white rounded-lg text-base border border-gray-200 outline-none focus:border-red-300 font-mono"
                            />
                            {ytId && (
                                <a
                                    href={ing.youtubeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-2 px-4 py-3 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                >
                                    <Youtube size={18} className="fill-white" />
                                    <span>在 YouTube 打开</span>
                                    <ExternalLink size={13} className="opacity-70" />
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // 👑 份数单位的智能建议列表 (一次声明，渲染时全局可用)
    const renderPieceUnitsDatalist = () => (
        <datalist id="piece-units-suggestions">
            <option value="只" />
            <option value="片" />
            <option value="段" />
            <option value="粒" />
            <option value="条" />
            <option value="瓣" />
            <option value="朵" />
            <option value="支" />
            <option value="根" />
            <option value="个" />
            <option value="块" />
            <option value="包" />
            <option value="把" />
            <option value="颗" />
            <option value="份" />
        </datalist>
    );

    // ============================================================
    // 主返回 JSX
    // ============================================================
    const currentVariant = newVariants[activeVariantTab];
    const baseRecipeCost = currentVariant?.recipe?.reduce((sum, item) => {
        const yieldFactor = (item.yieldPercent && item.yieldPercent > 0) ? (item.yieldPercent / 100) : 1;
        return sum + (((item.qty || 0) * (item.costPerUnit || 0)) / yieldFactor);
    }, 0) || 0;
    const overheadCostAmount = baseRecipeCost * ((currentVariant?.overheadMarginPercent || 0) / 100);
    const variantPrice = currentVariant?.price || 0;
    const variantCost = currentVariant?.cost || 0;
    const variantProfit = calculateProfit(variantPrice, variantCost);
    const variantMargin = calculateMargin(variantPrice, variantCost);

    // 利润颜色: 绿 ≥65 / 黄 50-64 / 红 <50
    const marginColor = variantMargin >= 65
        ? 'bg-green-100 text-green-700 border-green-200'
        : variantMargin >= 50
            ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
            : 'bg-red-100 text-red-700 border-red-200';

    return (
        <div className={containerClass}>
            {/* ====================================================== */}
            {/* 顶栏 Header (含 iOS safe-area) */}
            {/* ====================================================== */}
            <div className="bg-[#1A1A1A] px-3 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:px-4 md:pb-4 md:pt-[max(env(safe-area-inset-top),1rem)] flex justify-between items-center text-white shrink-0 border-b-4 border-[#FFD700] z-30 relative shadow-md">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="bg-[#FFD700] text-black p-2 rounded-xl shadow-lg"><Utensils size={20} className="md:w-6 md:h-6" /></div>
                    <div>
                        <h3 className="font-serif font-black text-lg md:text-xl tracking-wide">智能菜谱系统</h3>
                        <p className="text-[9px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">SMART MENU</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <ModuleGuideButton module="MENU" />
                    {onClose && (
                        <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full active:scale-95 transition-all">
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* ====================================================== */}
            {/* LIST 视图 */}
            {/* ====================================================== */}
            {viewMode === 'LIST' && (
                <div className="flex-grow flex flex-col overflow-hidden bg-[#F5F7FA]">
                    <div className="bg-white border-b border-gray-200 p-2 md:p-3 space-y-2 shadow-sm z-20 shrink-0 sticky top-0">
                        {hasLegacyData && (
                            <div className="bg-yellow-50 border border-yellow-200 p-2 rounded-xl flex justify-between items-center animate-in slide-in-from-top-4">
                                <div className="flex items-center gap-2 text-yellow-800 font-bold text-xs">
                                    <AlertTriangle size={14} />
                                    <span>发现旧数据 ID (C2, C3...)</span>
                                </div>
                                <button onClick={handleFixLegacyData} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm flex items-center gap-1 active:scale-95 transition-all">
                                    <Wrench size={10} /> 修复
                                </button>
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row justify-between items-center gap-2">
                            <div className="flex gap-2 w-full md:flex-1 md:w-0 overflow-x-auto scrollbar-hide pb-1 md:pb-0 px-1">
                                {categories.map(c => (
                                    <button key={c.id} onClick={() => setActiveCategory(c.id)} disabled={isReorderMode && c.id === 'ALL'} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold whitespace-nowrap transition-all duration-200 border shrink-0 active:scale-95 ${activeCategory === c.id ? 'bg-gradient-to-r from-[#1A1A1A] to-[#333] text-[#FFD700] shadow-md border-transparent scale-105' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end overflow-x-auto px-1">
                                <button onClick={() => { if (isReorderMode) { saveReorderedList(); } else { setIsReorderMode(true); } }} className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm transition-all whitespace-nowrap border active:scale-95 ${isReorderMode ? 'bg-green-50 text-green-700 border-green-200 animate-pulse' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {isReorderMode ? <Save size={14} /> : <Move size={14} />}
                                    {isReorderMode ? '保存顺序 (Save)' : '排序 (Sort)'}
                                </button>

                                {!isReorderMode && (
                                    <>
                                        <div className="bg-gray-100 p-0.5 rounded-lg flex shrink-0 border border-gray-200 items-center">
                                            <button onClick={() => setPriceMode('LOCAL')} className={`px-2 py-1.5 rounded-md text-[10px] font-bold transition-all active:scale-95 ${priceMode === 'LOCAL' ? 'bg-white shadow-sm text-black ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}>堂食</button>
                                            <div className="flex items-center relative">
                                                <button onClick={() => setPriceMode('DELIVERY')} className={`px-2 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95 ${priceMode === 'DELIVERY' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}>
                                                    <Truck size={10} /> 外卖
                                                </button>
                                                {priceMode === 'DELIVERY' && (
                                                    <div className="flex items-center ml-1 pr-1 bg-white border border-gray-200 rounded text-[10px] h-6 shadow-sm overflow-hidden">
                                                        <span className="text-gray-400 pl-1">抽成</span>
                                                        <input type="number" value={deliveryCommission} onChange={e => setDeliveryCommission(Number(e.target.value) || 0)} className="w-7 text-center font-bold outline-none text-blue-600 bg-transparent text-[10px]" onClick={e => e.stopPropagation()} />
                                                        <span className="text-gray-400 font-mono">%</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setViewMode('YIELD_AUDIT')}
                                            className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95 shrink-0"
                                        >
                                            <Scale size={13} />
                                            <span>损耗对账与换算</span>
                                        </button>
                                        <button onClick={handleAddNew} className="bg-[#FFD700] hover:bg-[#E5C100] text-black px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 shadow-md active:scale-95 transition-all shrink-0 border border-yellow-400/20">
                                            <Plus size={14} /> <span className="hidden sm:inline">新增</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {!isReorderMode && (
                            <div className="relative flex gap-2">
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3 top-2 text-gray-400" size={14} />
                                    <input type="text" placeholder="搜索菜名 (Search Menu)..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); }} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-base md:text-xs font-bold outline-none focus:ring-2 focus:ring-[#FFD700] focus:border-transparent transition-all shadow-sm" />
                                </div>
                                <button onClick={handleResetToDefault} className="px-3 bg-white border border-gray-200 text-gray-500 hover:text-red-500 hover:bg-red-50 hover:border-red-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm shrink-0 active:scale-95" title="Reset">
                                    <RefreshCw size={12} /> 重置
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-grow overflow-hidden flex flex-col relative pb-[max(env(safe-area-inset-bottom,20px),1rem)]" id="menu-scroll-container">
                        {loading ? (
                            <div className="text-center py-20 text-gray-400 flex flex-col items-center">
                                <RefreshCw className="animate-spin mb-2" />Loading Menu...
                            </div>
                        ) : (
                            <div className="overflow-y-auto p-3 md:p-4 pb-32 h-full">
                                {visibleGridItems.length === 0 ? (
                                    <div className="text-center py-20 text-gray-400 font-bold">暂无菜品 (No Items)</div>
                                ) : (
                                    <div className="max-w-[1600px] mx-auto w-full">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
                                            {visibleGridItems.map((item, idx) => renderItemCard(item, idx))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* YIELD_AUDIT 视图 - 食材损耗换算与物料审计 */}
            {/* ====================================================== */}
            {viewMode === 'YIELD_AUDIT' && (
                <div className="flex-grow flex flex-col bg-[#F5F7FA] overflow-y-auto pb-40 md:pb-6 relative h-full">
                    {/* 页面子导航 */}
                    <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200 shrink-0 sticky top-0 z-20 shadow-sm pt-[max(env(safe-area-inset-top),0.75rem)] pb-[env(safe-area-inset-bottom)]">
                        <button 
                            onClick={() => setViewMode('LIST')} 
                            className="flex items-center gap-2 text-xs font-black text-gray-500 hover:text-[#1A1A1A] p-2 -ml-2 min-h-[44px] min-w-[44px] active:scale-95 transition-all text-left"
                        >
                            <ArrowLeft size={16} />
                            <span>返回菜品列表</span>
                        </button>
                        <div className="text-right">
                            <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                                ⚖️ 损耗换算与物料审计
                            </span>
                        </div>
                    </div>

                    <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
                        {/* 🏆 系统使用场景说明卡片 */}
                        <div className="bg-gradient-to-r from-slate-900 to-[#1e293b] text-white p-5 rounded-3xl border border-slate-700 shadow-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                            <div className="space-y-1">
                                <h4 className="font-black text-lg flex items-center gap-2 text-[#FFD700]">
                                    💡 为什么要做「订货换算」与「损耗对账」？
                                </h4>
                                <p className="text-xs text-gray-300 leading-relaxed max-w-4xl">
                                    在餐饮经营中，食材通常以大包装订货（如 <strong>1kg海虾</strong> 或 <strong>1整瓶蚝油</strong>），但菜品配方制作时却是按件或按克计算（如一份炒面用 <strong>2只虾</strong> 或 <strong>15g蚝油</strong>）。 
                                    本工具帮助您解决：<strong>大包装配料成本科学折算</strong>、<strong>每盘菜品真实用料估算</strong> 与 <strong>当日厨房异常浪费/流失稽核</strong>。只要看理论可出碟数与实际销售是否相符，就能立刻对账厨房异常损耗！
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* ==================================================== */}
                            {/* 左侧: 食材出成规格换算建模 */}
                            {/* ==================================================== */}
                            <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200/80 space-y-4">
                                <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                                    <h4 className="font-black text-base text-[#1A1A1A] flex items-center gap-1.5">
                                        <span className="text-xl">🛠️</span> 规格换算参数建模 (Profile Creator)
                                    </h4>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">步骤 1</span>
                                </div>

                                <div className="space-y-4">
                                    {/* 👑 智能菜谱规格配方实时联动面板 */}
                                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/30 p-4 rounded-2xl border border-indigo-100/80 space-y-3.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                                                <span>🔗</span> 智能菜谱规格与配方联动系统
                                            </span>
                                            <span className="text-[8px] bg-indigo-200 text-indigo-850 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                AUTO SYNCED
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setUseFormulaSync(true);
                                                    if (menuItems.length > 0 && !linkedMenuItemId) {
                                                        setLinkedMenuItemId(menuItems[0].id);
                                                    }
                                                }}
                                                className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1 active:scale-95 transition-all text-center min-h-[44px] ${useFormulaSync ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.02]' : 'bg-white text-gray-700 border-gray-200 shadow-sm'}`}
                                            >
                                                ⚡ 联动菜品配方
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setUseFormulaSync(false);
                                                    setLinkedMenuItemId('');
                                                    setLinkedStockItemId('');
                                                }}
                                                className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1 active:scale-95 transition-all text-center min-h-[44px] ${!useFormulaSync ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.02]' : 'bg-white text-gray-700 border-gray-200 shadow-sm'}`}
                                            >
                                                ✍_ 独立手动填报
                                            </button>
                                        </div>

                                        {useFormulaSync && (
                                            <div className="space-y-3.5 pt-1.5 border-t border-indigo-100/60 animate-in fade-in slide-in-from-top-3 duration-200">
                                                <div className="grid grid-cols-2 gap-2.5">
                                                    <div>
                                                        <label className="text-[9px] font-black text-indigo-950 uppercase mb-1 block">1. 关联系统菜品</label>
                                                        <select
                                                            className="w-full p-2 bg-white border border-indigo-200 rounded-lg text-xs font-extrabold outline-none h-[40px] text-indigo-900"
                                                            value={linkedMenuItemId}
                                                            onChange={e => {
                                                                setLinkedMenuItemId(e.target.value);
                                                                setLinkedStockItemId('');
                                                            }}
                                                        >
                                                            <option value="">-- 请选择菜品 --</option>
                                                            {menuItems.map(m => (
                                                                <option key={m.id} value={m.id}>
                                                                    🍜 {m.name.split(' (')[0].trim()}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="text-[9px] font-black text-indigo-950 uppercase mb-1 block">2. 对应配方原料</label>
                                                        <select
                                                            className="w-full p-2 bg-white border border-indigo-200 rounded-lg text-xs font-extrabold outline-none h-[40px] text-indigo-900"
                                                            value={linkedStockItemId}
                                                            onChange={e => {
                                                                const sId = e.target.value;
                                                                setLinkedStockItemId(sId);
                                                                const item = stockItems.find(s => s.id === sId);
                                                                if (item) {
                                                                    setSelectedStockItem(item);
                                                                }
                                                            }}
                                                            disabled={!linkedMenuItemId}
                                                        >
                                                            <option value="">-- 请选择原料 --</option>
                                                            {recipeIngredients.map(r => (
                                                                <option key={r.id} value={r.id}>
                                                                    🥕 {r.name.split(' (')[0].trim()}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[9px] font-black text-indigo-950 uppercase mb-1 block">3. 损耗对账折算取值类型</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <label className={`p-2 rounded-lg border text-center font-bold text-[10px] cursor-pointer block h-[38px] flex items-center justify-center ${syncValueType === 'PIECE' ? 'bg-indigo-600 text-white border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-600'}`}>
                                                            <input
                                                                type="radio"
                                                                className="hidden"
                                                                name="syncValueType"
                                                                value="PIECE"
                                                                checked={syncValueType === 'PIECE'}
                                                                onChange={() => setSyncValueType('PIECE')}
                                                            />
                                                            🔢 按配方个数 (Piece)
                                                        </label>
                                                        <label className={`p-2 rounded-lg border text-center font-bold text-[10px] cursor-pointer block h-[38px] flex items-center justify-center ${syncValueType === 'WEIGHT' ? 'bg-indigo-600 text-white border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-600'}`}>
                                                            <input
                                                                type="radio"
                                                                className="hidden"
                                                                name="syncValueType"
                                                                value="WEIGHT"
                                                                checked={syncValueType === 'WEIGHT'}
                                                                onChange={() => setSyncValueType('WEIGHT')}
                                                            />
                                                            ⚖️ 按配方克重 (Gram)
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 选择库存材料 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">
                                            绑定库存物料 {useFormulaSync && <span className="text-[#FFD700] ml-1">🔒 [已联动菜谱配方]</span>}
                                        </label>
                                        <select 
                                            className={`w-full p-3 rounded-xl text-xs font-black outline-none border text-black min-h-[44px] ${useFormulaSync ? 'bg-indigo-50/50 text-indigo-900 border-indigo-200 cursor-not-allowed' : 'bg-gray-50 border-gray-200'}`}
                                            value={selectedStockItem ? selectedStockItem.id : ''}
                                            disabled={useFormulaSync}
                                            onChange={e => {
                                                const id = e.target.value;
                                                const item = stockItems.find(s => s.id === id);
                                                if (item) {
                                                    setSelectedStockItem(item);
                                                    setProfileName(`${item.name} 规格换算`);
                                                    setBulkCost(item.cost);
                                                    setBulkUnit(item.unit || 'kg');
                                                } else {
                                                    setSelectedStockItem(null);
                                                }
                                            }}
                                        >
                                            <option value="">-- 手动输入，或选择系统既有库存物料 --</option>
                                            {stockItems.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    📦 {s.name} ({s.unit}) — 进货价 RM {s.cost.toFixed(2)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 规格换算模板名称 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">换算模板名称</label>
                                        <input 
                                            type="text"
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400"
                                            value={profileName}
                                            onChange={e => setProfileName(e.target.value)}
                                            placeholder="例: 大只海虾 (41/50) 换算"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3.5 bg-gray-50 p-4 rounded-2xl border border-gray-150">
                                        {/* 大包装订货信息 */}
                                        <div className="col-span-2 text-[10px] text-gray-550 font-black tracking-wider border-b border-gray-200 pb-1.5 flex items-center gap-1">
                                            <span>🛒</span> 进货大包装规格
                                        </div>

                                        <div>
                                            <label className="text-[9px] font-black text-gray-500 uppercase mb-1 block">订货成本 (RM)</label>
                                            <input 
                                                type="number"
                                                step="0.01"
                                                className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-center"
                                                value={bulkCost}
                                                onChange={e => setBulkCost(parseFloat(e.target.value) || 0)}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[9px] font-black text-gray-500 uppercase mb-1 block">订货大单位</label>
                                            <select 
                                                className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-center h-[38px]"
                                                value={bulkUnit}
                                                onChange={e => setBulkUnit(e.target.value)}
                                            >
                                                <option value="kg">kg (公斤)</option>
                                                <option value="bottle">bottle (瓶)</option>
                                                <option value="bag">bag (袋)</option>
                                                <option value="box">box (箱)</option>
                                                <option value="pkt">pkt (包)</option>
                                            </select>
                                        </div>

                                        {/* 换算出成规格 */}
                                        <div className="col-span-2 text-[10px] text-gray-550 font-black tracking-wider border-b border-gray-200 pt-2 pb-1.5 flex items-center gap-1">
                                            <span>🔢</span> 包装内细分总含量 (Capacity Count)
                                        </div>

                                        <div>
                                            <label className="text-[9px] font-black text-gray-500 uppercase mb-1 block">每袋/每公斤含多少</label>
                                            <input 
                                                type="number"
                                                className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-center"
                                                value={capacityCount}
                                                onChange={e => setCapacityCount(parseFloat(e.target.value) || 1)}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[9px] font-black text-gray-500 uppercase mb-1 block">
                                                个/克/毫升单位 {useFormulaSync && <span className="text-indigo-600">🔗</span>}
                                            </label>
                                            <input 
                                                type="text"
                                                className={`w-full p-2 text-center rounded-lg border text-sm font-bold h-[38px] ${useFormulaSync ? 'bg-indigo-50 text-indigo-700 border-indigo-200 cursor-not-allowed font-extrabold' : 'bg-white border-gray-200 text-black'}`}
                                                value={capacityUnit}
                                                disabled={useFormulaSync}
                                                onChange={e => setCapacityUnit(e.target.value)}
                                                placeholder="只/g/ml"
                                            />
                                            {useFormulaSync && (
                                                <span className="text-[8px] text-indigo-600 font-bold block mt-1 leading-tight">
                                                    🔒 自动同步自配方中的“{capacityUnit}”单位。如需更改，请在上方点击【✍_ 独立手动填报】或在菜谱配方中修改。
                                                </span>
                                            )}
                                        </div>

                                        {/* 每碟菜用量/模式选择 */}
                                        <div className="col-span-2 text-[10px] text-gray-550 font-black tracking-wider border-b border-gray-200 pt-2 pb-1.5 flex items-center justify-between">
                                            <span className="flex items-center gap-1">🍽️ 菜品单份（碟）制作消耗量</span>
                                            
                                            <div className="flex bg-gray-200 p-0.5 rounded-lg border border-gray-300">
                                                <button
                                                    type="button"
                                                    disabled={useFormulaSync}
                                                    onClick={() => setIsMultiSize(false)}
                                                    className={`text-[9px] px-2 py-1 rounded font-black transition-all ${useFormulaSync ? 'opacity-50 cursor-not-allowed' : ''} ${!isMultiSize ? 'bg-white text-gray-850 shadow-sm' : 'text-gray-500'}`}
                                                >
                                                    单规格
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={useFormulaSync}
                                                    onClick={() => setIsMultiSize(true)}
                                                    className={`text-[9px] px-2 py-1 rounded font-black transition-all ${useFormulaSync ? 'opacity-50 cursor-not-allowed' : ''} ${isMultiSize ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500'}`}
                                                >
                                                    S/M/L (小中大)
                                                </button>
                                            </div>
                                        </div>

                                        {!isMultiSize ? (
                                            <>
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1 block">
                                                        一碟菜标准用量 {useFormulaSync && <span className="text-indigo-600">🔗 [自动同步]</span>}
                                                    </label>
                                                    <input 
                                                        type="number"
                                                        step="0.1"
                                                        className={`w-full p-2 text-center rounded-lg border text-sm font-bold h-[38px] ${useFormulaSync ? 'bg-indigo-50 text-indigo-700 border-indigo-200 cursor-not-allowed font-extrabold' : 'bg-white border-gray-200 text-black'}`}
                                                        value={dishQty}
                                                        disabled={useFormulaSync}
                                                        onChange={e => setDishQty(parseFloat(e.target.value) || 1)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1 block font-mono">单位</label>
                                                    <div className="w-full p-2 bg-gray-100 border border-gray-200 rounded-lg text-sm font-bold text-center text-gray-550 select-none h-[38px] flex items-center justify-center">
                                                        {capacityUnit}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="col-span-2 grid grid-cols-3 gap-2.5 bg-indigo-50/20 p-2.5 rounded-xl border border-indigo-100/50">
                                                <div>
                                                    <label className="text-[9px] font-black text-indigo-700 uppercase mb- block text-center flex items-center justify-center gap-0.5">
                                                        <span>🔴 小碟 (S)</span> {useFormulaSync && <span className="text-[9px] text-indigo-500">🔒</span>}
                                                    </label>
                                                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden h-[34px]">
                                                        <input 
                                                            type="number"
                                                            step="0.1"
                                                            className={`w-full p-1 text-center font-black text-xs outline-none ${useFormulaSync ? 'bg-indigo-50/50 text-indigo-700 cursor-not-allowed font-extrabold' : 'text-gray-850'}`}
                                                            value={dishQtyS}
                                                            disabled={useFormulaSync}
                                                            onChange={e => setDishQtyS(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                            placeholder="0"
                                                        />
                                                        <span className="p-1 px-1.5 bg-gray-50 text-[8px] text-gray-500 font-bold flex items-center justify-center border-l select-none shrink-0">{capacityUnit}</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[9px] font-black text-indigo-700 uppercase mb- block text-center flex items-center justify-center gap-0.5 font-bold">
                                                        <span>🟡 中碟 (M)</span> {useFormulaSync && <span className="text-[9px] text-indigo-500">🔒</span>}
                                                    </label>
                                                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden h-[34px]">
                                                        <input 
                                                            type="number"
                                                            step="0.1"
                                                            className={`w-full p-1 text-center font-black text-xs outline-none ${useFormulaSync ? 'bg-indigo-50/50 text-indigo-700 cursor-not-allowed font-extrabold' : 'text-gray-850'}`}
                                                            value={dishQtyM}
                                                            disabled={useFormulaSync}
                                                            onChange={e => setDishQtyM(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                            placeholder="0"
                                                        />
                                                        <span className="p-1 px-1.5 bg-gray-50 text-[8px] text-gray-500 font-bold flex items-center justify-center border-l select-none shrink-0">{capacityUnit}</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[9px] font-black text-indigo-700 uppercase mb- block text-center flex items-center justify-center gap-0.5">
                                                        <span>🟢 大碟 (L)</span> {useFormulaSync && <span className="text-[9px] text-indigo-500">🔒</span>}
                                                    </label>
                                                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden h-[34px]">
                                                        <input 
                                                            type="number"
                                                            step="0.1"
                                                            className={`w-full p-1 text-center font-black text-xs outline-none ${useFormulaSync ? 'bg-indigo-50/50 text-indigo-700 cursor-not-allowed font-extrabold' : 'text-gray-850'}`}
                                                            value={dishQtyL}
                                                            disabled={useFormulaSync}
                                                            onChange={e => setDishQtyL(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                            placeholder="0"
                                                        />
                                                        <span className="p-1 px-1.5 bg-gray-50 text-[8px] text-gray-500 font-bold flex items-center justify-center border-l select-none shrink-0">{capacityUnit}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 自动极速运算面板 */}
                                    <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 space-y-3">
                                        <h5 className="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                                            <span>📊</span> 规格换算计算结果 (Calculated Outputs)
                                        </h5>

                                        {(() => {
                                            const singleUnitCost = bulkCost / (capacityCount || 1);
                                            
                                            if (!isMultiSize) {
                                                const dishCost = dishQty * singleUnitCost;
                                                const platesPerBulk = Math.floor(capacityCount / (dishQty || 1));
                                                return (
                                                    <div className="grid grid-cols-2 gap-3.5">
                                                        <div className="bg-white p-2.5 rounded-xl border border-amber-100 shadow-sm">
                                                            <span className="text-[9px] text-gray-400 font-bold block">单件（只/克）核算价</span>
                                                            <span className="font-mono font-black text-xs text-[#1A1A1A]">
                                                                RM {singleUnitCost.toFixed(4)} <span className="text-[9px] text-gray-500">/{capacityUnit}</span>
                                                            </span>
                                                        </div>

                                                        <div className="bg-white p-2.5 rounded-xl border border-amber-100 shadow-sm">
                                                            <span className="text-[9px] text-gray-400 font-bold block">单碟菜品原物料成本</span>
                                                            <span className="font-mono font-black text-xs text-green-700">
                                                                RM {dishCost.toFixed(2)} <span className="text-[9px] text-gray-500">/{dishQty}{capacityUnit}</span>
                                                            </span>
                                                        </div>

                                                        <div className="bg-white p-3 rounded-xl border-2 border-indigo-200 shadow-sm col-span-2 flex items-center justify-between">
                                                            <div>
                                                                <span className="text-[9px] text-indigo-700 font-black block uppercase tracking-wider">每 {bulkUnit === 'kg' ? '1kg' : `1 ${bulkUnit}`} 理论最大可出</span>
                                                                <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-0.5">
                                                                    1大包物料理论可制作标准碟数
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-sans font-black text-xl text-indigo-700">
                                                                    ≈ {platesPerBulk} <span className="text-xs">碟</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            } else {
                                                const qtyS = Number(dishQtyS) || 0;
                                                const qtyM = Number(dishQtyM) || 0;
                                                const qtyL = Number(dishQtyL) || 0;

                                                const costS = qtyS * singleUnitCost;
                                                const costM = qtyM * singleUnitCost;
                                                const costL = qtyL * singleUnitCost;

                                                const maxPlatesS = qtyS > 0 ? Math.floor(capacityCount / qtyS) : 0;
                                                const maxPlatesM = qtyM > 0 ? Math.floor(capacityCount / qtyM) : 0;
                                                const maxPlatesL = qtyL > 0 ? Math.floor(capacityCount / qtyL) : 0;

                                                return (
                                                    <div className="space-y-2.5">
                                                        <div className="bg-white p-2.5 rounded-xl border border-amber-100 shadow-sm">
                                                            <span className="text-[9px] text-gray-400 font-bold block">基础单件（只/克）核算价</span>
                                                            <span className="font-mono font-black text-xs text-[#1A1A1A]">
                                                                RM {singleUnitCost.toFixed(4)} <span className="text-[9px] text-gray-500">/{capacityUnit}</span>
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div className="bg-white p-2 rounded-xl border border-amber-100 text-center">
                                                                <span className="text-[8px] text-gray-400 font-bold block">S小碟成本</span>
                                                                <span className="font-mono font-black text-xs text-green-700">RM {costS.toFixed(2)}</span>
                                                                <span className="text-[7px] text-gray-400 block mt-0.5">≈ 可出 {maxPlatesS} 碟</span>
                                                            </div>
                                                            <div className="bg-white p-2 rounded-xl border border-amber-100 text-center">
                                                                <span className="text-[8px] text-gray-400 font-bold block">M中碟成本</span>
                                                                <span className="font-mono font-black text-xs text-green-700 font-black">RM {costM.toFixed(2)}</span>
                                                                <span className="text-[7px] text-gray-400 block mt-0.5">≈ 可出 {maxPlatesM} 碟</span>
                                                            </div>
                                                            <div className="bg-white p-2 rounded-xl border border-amber-100 text-center">
                                                                <span className="text-[8px] text-gray-400 font-bold block">L大碟成本</span>
                                                                <span className="font-mono font-black text-xs text-green-700">RM {costL.toFixed(2)}</span>
                                                                <span className="text-[7px] text-gray-400 block mt-0.5">≈ 可出 {maxPlatesL} 碟</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </div>

                                    {/* 提交与编辑控制按钮 */}
                                    <div className="pt-2 flex gap-3">
                                        <button 
                                            onClick={handleSaveProfile}
                                            className="flex-1 py-3 bg-[#1A1A1A] hover:bg-black text-[#FFD700] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all min-h-[44px]"
                                        >
                                            <Save size={14} /> 保存为换算模板
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ==================================================== */}
                            {/* 右侧: 损耗核销稽核（厨房对账） */}
                            {/* ==================================================== */}
                            <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200/80 space-y-4">
                                <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                                    <h4 className="font-black text-base text-[#1A1A1A] flex items-center gap-1.5">
                                        <span className="text-xl">🧮</span> 厨房耗损与漏损对账审计 (Reconciliation Panel)
                                    </h4>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">步骤 2</span>
                                </div>

                                <div className="space-y-4">
                                    {/* 选择规则模板 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">选择计算模板</label>
                                        <div className="flex gap-2">
                                            <select 
                                                className="flex-grow p-3 bg-gray-50 rounded-xl text-xs font-black outline-none border border-gray-200 text-black min-h-[44px]"
                                                value={selectedProfileId}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setSelectedProfileId(val);
                                                    setActualBulkConsumed('');
                                                    setActualDishesSold('');
                                                    setSoldS('');
                                                    setSoldM('');
                                                    setSoldL('');
                                                }}
                                            >
                                                <option value="">-- 请选择对应食材规格换算模板 --</option>
                                                {conversionProfiles.map(p => {
                                                    const live = getLiveQuantities(p);
                                                    const syncTag = live.isLiveSynced ? '🔗 ' : '';
                                                    const detailText = p.isMultiSize 
                                                        ? `S碟=${live.dishQtyS} / M碟=${live.dishQtyM} / L碟=${live.dishQtyL} ${live.capacityUnit}` 
                                                        : `1碟=${live.dishQty} ${live.capacityUnit}`;
                                                    return (
                                                        <option key={p.id} value={p.id}>
                                                            ⚖️ {syncTag}{p.profileName} (1 {p.bulkUnit} = {p.capacityCount} {live.capacityUnit} | {detailText})
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {selectedProfileId && (
                                                <button 
                                                    onClick={() => handleDeleteProfile(selectedProfileId)}
                                                    className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-95 border border-red-200/50"
                                                    title="删除换算模板"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* 选择模板后的计算参数输入 */}
                                    {selectedProfileId ? (
                                        (() => {
                                            const p = conversionProfiles.find(x => x.id === selectedProfileId);
                                            if (!p) return null;

                                            // 👑 智能计算当前配方实时联动数值 (穿透最新菜谱配方)
                                            const live = getLiveQuantities(p);

                                            // 实际参数
                                            const actualConsumedNum = Number(actualBulkConsumed) || 0;
                                            
                                            // 计算理论耗用 (用量单位)
                                            let totalTheoreticalUsed = 0;
                                            if (p.isMultiSize) {
                                                totalTheoreticalUsed = (Number(soldS) || 0) * (live.dishQtyS || 0) + 
                                                                       (Number(soldM) || 0) * (live.dishQtyM || 0) + 
                                                                       (Number(soldL) || 0) * (live.dishQtyL || 0);
                                            } else {
                                                totalTheoreticalUsed = (Number(actualDishesSold) || 0) * (live.dishQty || 0);
                                            }

                                            // 1 理论用量比例
                                            const materialsNeeded = totalTheoreticalUsed / p.capacityCount;

                                            // 2 原料溢耗差异 = 实际消耗 - 标准用量
                                            const varianceQty = actualConsumedNum - materialsNeeded;
                                            const variancePct = actualConsumedNum > 0 ? (varianceQty / actualConsumedNum) * 100 : 0;
                                            const lossCost = varianceQty * p.bulkCost;

                                            // 判定损耗严重度
                                            let alertColor = 'bg-green-50 border-green-200 text-green-800';
                                            let alertTitle = '👍 损耗正常 (Excellent)';
                                            let alertDesc = '厨房用料与账面销售完全匹配，正常损耗率在 5% 以内。请继续保持精细化备餐。';
                                            if (variancePct > 5 && variancePct <= 15) {
                                                alertColor = 'bg-yellow-50 border-yellow-250 text-yellow-800';
                                                alertTitle = '⚠️ 有微量物料损耗 (Moderate Loss)';
                                                alertDesc = '食材存在 5% - 15% 的中度损耗。可能原因：备餐切配边角料多、解冻带冰水偏多或出餐打秤轻微超标，建议提醒后厨装盘质量。';
                                            } else if (variancePct > 15) {
                                                alertColor = 'bg-rose-50 border-rose-200 text-rose-850';
                                                alertTitle = '🚨 发现厨房严重泄漏流失！(Severe Leakage)';
                                                alertDesc = '物料耗损率已超 15%！说明当日食材很大去向不明。建议严查：厨房偷吃带走、备餐废弃严重、死秤克数超标、或者存在逃单、飞单漏单行为！';
                                            } else if (variancePct < -5) {
                                                alertColor = 'bg-blue-50 border-blue-200 text-blue-850';
                                                alertTitle = '🧐 食材节省 (Under-portioned / Under-used)';
                                                alertDesc = '物料消耗比销售理论数量更低。可能原因：后厨出餐克数偏小，请审核菜品规格与装盘质量。';
                                            }

                                            // 校验是否已经录入数据了
                                            const hasEnteredSales = p.isMultiSize 
                                                ? (soldS !== '' || soldM !== '' || soldL !== '')
                                                : actualDishesSold !== '';
                                            const isReadyToCalc = actualBulkConsumed !== '' && hasEnteredSales;

                                            return (
                                                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                                                    
                                                    {/* 👑 配方超联动动态提示条 */}
                                                    {live.isLiveSynced && (
                                                        <div className="bg-gradient-to-r from-[#f0fdf4] to-[#f5f3ff] border border-indigo-200/60 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                                                            <div className="space-y-0.5">
                                                                <h6 className="text-[11px] font-black text-indigo-900 flex items-center gap-1">
                                                                    <span>⚡</span> 智能配方超联动中 (Active Live Sync)
                                                                </h6>
                                                                <p className="text-[9.5px] text-indigo-750 font-medium">
                                                                    对账数据已穿透并实时匹配 <strong>{live.menuName}</strong> 的规格用量配比。
                                                                </p>
                                                            </div>
                                                            <span className="text-[8px] bg-indigo-650 text-white font-extrabold px-1.5 py-1 rounded shadow-sm select-none shrink-0 uppercase tracking-wider font-mono">
                                                                LIVE
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* 段落A: 实际发货/领用量 */}
                                                    <div className="grid grid-cols-1 gap-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
                                                        <div>
                                                            <label className="text-[10px] font-black text-indigo-700 uppercase mb-1 block">
                                                                当日库存实际领用/到货量 (A)
                                                            </label>
                                                            <div className="flex bg-white rounded-lg border border-indigo-200 overflow-hidden min-h-[44px]">
                                                                <input 
                                                                    type="number"
                                                                    className="w-full p-2 font-black text-sm text-center text-[#1A1A1A] outline-none"
                                                                    value={actualBulkConsumed}
                                                                    onChange={e => setActualBulkConsumed(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                                    placeholder={`如: 开箱 / 订购了多少 ${p.bulkUnit}`}
                                                                />
                                                                <span className="p-2.5 bg-indigo-100 text-[10px] font-black flex items-center justify-center text-indigo-800 border-l border-indigo-200 shrink-0 select-none">
                                                                    {p.bulkUnit}
                                                                </span>
                                                            </div>
                                                            <span className="text-[9px] text-[#FF4500] mt-1 block leading-tight font-medium">💡 即当日从冰库总共发出领用或供应商送货的食材总量。员工无需每日计算厨房消耗，只需关注订了多少。</span>
                                                        </div>
                                                    </div>

                                                    {/* 段落B: 销量输入 */}
                                                    <div className="bg-emerald-50/20 p-4 rounded-2xl border border-emerald-100 space-y-3">
                                                        <label className="text-[10px] font-black text-emerald-800 uppercase block">
                                                            当日 POS 实际出碟销售量 (B)
                                                        </label>

                                                        {p.isMultiSize ? (
                                                            <div className="space-y-2">
                                                                <span className="text-[9px] text-emerald-600 font-bold block mb-1">请输入 POS 导出的各规格销量：</span>
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    <div className="bg-white p-2 rounded-xl border border-emerald-100 text-center">
                                                                        <span className="text-[9px] text-gray-550 font-bold block mb-1">S小碟销量</span>
                                                                        <input 
                                                                            type="number"
                                                                            className="w-full p-1 border border-gray-250 rounded font-mono font-bold text-xs text-center outline-none focus:border-emerald-500 text-black placeholder-gray-300"
                                                                            value={soldS}
                                                                            onChange={e => setSoldS(e.target.value === '' ? '' : parseInt(e.target.value))}
                                                                            placeholder="0"
                                                                        />
                                                                        <span className="text-[7.5px] text-gray-400 block mt-1">{live.dishQtyS} {live.capacityUnit}/碟</span>
                                                                    </div>
                                                                    <div className="bg-white p-2 rounded-xl border border-emerald-100 text-center font-bold">
                                                                        <span className="text-[9px] text-gray-555 font-bold block mb-1">M中碟销量</span>
                                                                        <input 
                                                                            type="number"
                                                                            className="w-full p-1 border border-gray-255 rounded font-mono font-bold text-xs text-center outline-none focus:border-emerald-500 text-black placeholder-gray-300"
                                                                            value={soldM}
                                                                            onChange={e => setSoldM(e.target.value === '' ? '' : parseInt(e.target.value))}
                                                                            placeholder="0"
                                                                        />
                                                                        <span className="text-[7.5px] text-gray-400 block mt-1">{live.dishQtyM} {live.capacityUnit}/碟</span>
                                                                    </div>
                                                                    <div className="bg-white p-2 rounded-xl border border-emerald-100 text-center font-bold">
                                                                        <span className="text-[9px] text-gray-555 font-bold block mb-1">L大碟销量</span>
                                                                        <input 
                                                                            type="number"
                                                                            className="w-full p-1 border border-gray-255 rounded font-mono font-bold text-xs text-center outline-none focus:border-emerald-500 text-black placeholder-gray-300"
                                                                            value={soldL}
                                                                            onChange={e => setSoldL(e.target.value === '' ? '' : parseInt(e.target.value))}
                                                                            placeholder="0"
                                                                        />
                                                                        <span className="text-[7.5px] text-gray-400 block mt-1">{live.dishQtyL} {live.capacityUnit}/碟</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <div className="flex bg-white rounded-lg border border-emerald-250 overflow-hidden min-h-[44px]">
                                                                    <input 
                                                                        type="number"
                                                                        className="w-full p-2 font-black text-sm text-center text-[#1A1A1A] outline-none"
                                                                        value={actualDishesSold}
                                                                        onChange={e => setActualDishesSold(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                                        placeholder="请输入今日销售总碟数"
                                                                    />
                                                                    <span className="p-2.5 bg-emerald-50 text-[10px] font-black flex items-center justify-center text-emerald-800 border-l border-emerald-150 shrink-0 select-none">
                                                                        碟
                                                                    </span>
                                                                </div>
                                                                <span className="text-[9px] text-gray-500 mt-1 block leading-tight font-medium">💡 即当日POS系统统计或前厅下达的实际出餐标准碟数。</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 对账分析仪表盘 */}
                                                    {isReadyToCalc && (
                                                        <div className="space-y-4 pt-2 animate-in fade-in duration-200">
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                                
                                                                <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl">
                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">到货量理论可制</span>
                                                                    <span className="font-mono font-bold text-xs text-[#1A1A1A] block font-semibold leading-relaxed">
                                                                        {p.isMultiSize ? (
                                                                            <span>
                                                                                S: {Math.floor(p.capacityCount * actualConsumedNum / (live.dishQtyS || 1))} 碟<br/>
                                                                                M: {Math.floor(p.capacityCount * actualConsumedNum / (live.dishQtyM || 1))} 碟
                                                                            </span>
                                                                        ) : (
                                                                            `${(p.capacityCount * actualConsumedNum / (live.dishQty || 1)).toFixed(1)} 碟`
                                                                        )}
                                                                    </span>
                                                                </div>

                                                                <div className="bg-[#EBF8FF] border border-[#BEE3F8] p-3 rounded-xl">
                                                                    <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest block mb-0.5">实际销售标准需要</span>
                                                                    <span className="font-mono font-black text-sm text-blue-700 block">
                                                                        {materialsNeeded.toFixed(2)} {p.bulkUnit}
                                                                    </span>
                                                                    <span className="text-[9px] text-[#2B6CB0] block mt-1 leading-normal font-medium">
                                                                        配额: {totalTheoreticalUsed.toFixed(1)} {live.capacityUnit}
                                                                    </span>
                                                                </div>

                                                                <div className="bg-red-50/55 border border-red-100 p-3 rounded-xl col-span-2 md:col-span-1">
                                                                    <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest block mb-0.5">异常损耗流失 (A-B)</span>
                                                                    <span className="font-mono font-black text-sm text-red-650 block">
                                                                        {varianceQty > 0 ? `⚠️ ${varianceQty.toFixed(2)}` : varianceQty.toFixed(2)} {p.bulkUnit}
                                                                    </span>
                                                                    <span className="text-[9px] text-red-550 block mt-1 leading-normal font-bold">
                                                                        折合流失 RM {lossCost.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* 🚨 损耗率警告条 */}
                                                            <div className="bg-gray-100 p-3 rounded-xl flex items-center justify-between border border-gray-200">
                                                                <div>
                                                                    <span className="text-[10px] text-gray-550 font-bold block uppercase tracking-wider">当日物料逸损率 (Loss Rate)</span>
                                                                    <p className="text-[10px] text-gray-400 leading-normal">
                                                                        大部分食材行业标准浪费常介于 ±5% 内
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className={`text-lg font-black ${variancePct > 15 ? 'text-rose-600' : variancePct > 5 ? 'text-amber-600' : 'text-green-600'}`}>
                                                                        {variancePct.toFixed(2)}%
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* 系统智能判定报告卡 */}
                                                            <div className={`p-4 rounded-2xl border ${alertColor} space-y-1.5`}>
                                                                <h5 className="font-black text-sm flex items-center gap-1.5">
                                                                    {alertTitle}
                                                                </h5>
                                                                <p className="text-xs leading-relaxed font-bold">
                                                                    {alertDesc}
                                                                </p>
                                                                {varianceQty > 0 && (
                                                                    <p className="text-[11px] border-t border-current/15 pt-2 mt-2 leading-relaxed">
                                                                        📋 <strong>数据分析账单:</strong> 剔除正常切配等偏差后，今日共有 <strong>{(varianceQty * p.capacityCount).toFixed(0)} {live.capacityUnit}</strong> 的物料消失没能核销到销售中，相当于凭空隐性亏损了 <strong>
                                                                            {p.isMultiSize 
                                                                                ? `${Math.floor(varianceQty * p.capacityCount / (live.dishQtyS || 1))} 小碟(S) 或 ${Math.floor(varianceQty * p.capacityCount / (live.dishQtyM || 1))} 中碟(M)` 
                                                                                : `${Math.floor(varianceQty * p.capacityCount / (live.dishQty || 1))} 碟`
                                                                            }
                                                                        </strong> 菜品本该得到的收益！
                                                                    </p>
                                                                )}
                                                            </div>



                                                            {/* 🚨 损耗率警告条 */}
                                                            <div className="bg-gray-100 p-3 rounded-xl flex items-center justify-between border border-gray-200">
                                                                <div>
                                                                    <span className="text-[10px] text-gray-500 font-bold block uppercase tracking-wider">当日物料逸损率 (Loss Rate)</span>
                                                                    <p className="text-[10px] text-gray-400 leading-normal">
                                                                        大部门食材行业标准浪费常介于 ±5% 内
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className={`text-lg font-black ${variancePct > 15 ? 'text-rose-600' : variancePct > 5 ? 'text-amber-600' : 'text-green-600'}`}>
                                                                        {variancePct.toFixed(2)}%
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* 系统智能判定报告卡 */}
                                                            <div className={`p-4 rounded-2xl border ${alertColor} space-y-1.5`}>
                                                                <h5 className="font-black text-sm flex items-center gap-1.5">
                                                                    {alertTitle}
                                                                </h5>
                                                                <p className="text-xs leading-relaxed font-bold">
                                                                    {alertDesc}
                                                                </p>
                                                                {varianceQty > 0 && (
                                                                    <p className="text-[11px] border-t border-current/15 pt-2 mt-2 leading-relaxed">
                                                                        📋 <strong>数据分析账单:</strong> 剔除正常切配等偏差后，今日共有 <strong>{(varianceQty * p.capacityCount).toFixed(0)} {p.capacityUnit}</strong> 的物料消失没能核销到销售中，相当于凭空隐性亏损了 <strong>
                                                                            {p.isMultiSize 
                                                                                ? `${Math.floor(varianceQty * p.capacityCount / (p.dishQtyS || 1))} 小碟(S) 或 ${Math.floor(varianceQty * p.capacityCount / (p.dishQtyM || 1))} 中碟(M)` 
                                                                                : `${Math.floor(varianceQty * p.capacityCount / (p.dishQty || 1))} 碟`
                                                                            }
                                                                        </strong> 菜品本该得到的收益！
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* 是否同步扣减库存选项 */}
                                                            {p.stockId && p.stockId !== 'manual' && (
                                                                <div className="flex items-center gap-2.5 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl mb-2 text-left">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        id="sync-deduct-checkbox" 
                                                                        className="w-4 h-4 rounded text-indigo-600 border-indigo-200 focus:ring-indigo-500 cursor-pointer"
                                                                        checked={shouldDeductStock}
                                                                        onChange={e => setShouldDeductStock(e.target.checked)}
                                                                    />
                                                                    <label htmlFor="sync-deduct-checkbox" className="text-[10px] font-black text-indigo-900 cursor-pointer select-none">
                                                                        🔄 同时自动从【库存总览】中扣减 {actualConsumedNum} {p.bulkUnit} 库存数量
                                                                    </label>
                                                                </div>
                                                            )}

                                                            {/* 保存与归档存档 */}
                                                            <button 
                                                                onClick={() => {
                                                                    let actualSoldDisplay = '';
                                                                    if (p.isMultiSize) {
                                                                        actualSoldDisplay = `S:${soldS || 0}碟 M:${soldM || 0}碟 L:${soldL || 0}碟`;
                                                                    } else {
                                                                        actualSoldDisplay = `${actualDishesSold}碟`;
                                                                    }
                                                                    handleSaveAuditLog({
                                                                        profileName: p.profileName,
                                                                        actualConsumed: actualConsumedNum,
                                                                        bulkUnit: p.bulkUnit,
                                                                        actualSold: actualSoldDisplay,
                                                                        variancePct: variancePct,
                                                                        lossCost: lossCost
                                                                    }, p.stockId, actualConsumedNum);
                                                                }}
                                                                className="w-full py-3 bg-[#1A1A1A] hover:bg-black text-[#FFD700] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md min-h-[44px]"
                                                            >
                                                                💾 归档当日对账记录 (Archive Report)
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        <div className="bg-gray-50 rounded-2xl p-8 border border-dashed border-gray-300 text-center text-xs text-gray-400 font-bold font-sans">
                                            💡 请在上方先选择一个已创建的「规格换算模板」，即可开始每日损耗对账审计。
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ==================================================== */}
                            {/* 历史审计记录归档 (Persistence Timeline Area) */}
                            {/* ==================================================== */}
                            <div className="col-span-1 lg:col-span-2 bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200/80 space-y-4">
                                <h4 className="font-black text-base text-[#1A1A1A] flex items-center gap-2">
                                    <span>📨</span> 历史物料稽账与稽核归档史 (Audit Archives History)
                                </h4>
                                {auditLogs.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="border-b border-gray-200 text-gray-450 font-bold uppercase text-[9px] tracking-wider">
                                                    <th className="py-2">审计日期</th>
                                                    <th className="py-2">物料换算模板</th>
                                                    <th className="py-2 text-center">实际原料领发</th>
                                                    <th className="py-2 text-center">销售碟数</th>
                                                    <th className="py-2 text-center">溢损率 (%)</th>
                                                    <th className="py-2 text-right">损耗折合金额</th>
                                                    <th className="py-2 text-right">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 font-medium text-gray-750">
                                                {auditLogs.map(log => {
                                                    const consumedVal = typeof log.actualConsumed === 'number' 
                                                        ? log.actualConsumed.toFixed(2) 
                                                        : String(log.actualConsumed);
                                                    
                                                    const soldVal = String(log.actualSold).includes('碟') 
                                                        ? String(log.actualSold) 
                                                        : `${log.actualSold} 碟`;

                                                    return (
                                                        <tr key={log.id} className="hover:bg-gray-50/50">
                                                            <td className="py-3 font-mono font-bold text-gray-400">{log.date}</td>
                                                            <td className="py-3 font-bold text-[#1A1A1A]">{log.profileName}</td>
                                                            <td className="py-3 text-center font-bold text-indigo-700">
                                                                {consumedVal} <span className="text-[10px] text-indigo-400">{log.bulkUnit || ''}</span>
                                                            </td>
                                                            <td className="py-3 text-center font-bold text-gray-800 text-[11px]">{soldVal}</td>
                                                            <td className="py-3 text-center animate-pulse">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                                    log.variancePct > 15 ? 'bg-red-100 text-red-700' : 
                                                                    log.variancePct > 5 ? 'bg-yellow-100 text-yellow-850' : 
                                                                    log.variancePct < -5 ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-green-100 text-green-700'
                                                                }`}>
                                                                    {log.variancePct.toFixed(2)}%
                                                                </span>
                                                            </td>
                                                            <td className="py-3 text-right font-mono font-black text-red-650">
                                                                RM {log.lossCost.toFixed(2)}
                                                            </td>
                                                            <td className="py-3 text-right">
                                                                <button
                                                                    onClick={() => handleDeleteAuditLog(log.id)}
                                                                    className="text-red-500 hover:text-red-700 font-extrabold active:scale-95 transition-all text-xs"
                                                                >
                                                                    删除
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic text-center py-6 block font-bold">
                                        📭 暂无归档的对账稽核单。可在上方点击「归档当日对账记录」进行持久化存储。
                                    </p>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* EDIT 视图 - 编辑菜品 */}
            {/* ====================================================== */}
            {viewMode === 'EDIT' && (
                <div className="flex-grow flex flex-col md:flex-row bg-[#F5F7FA] overflow-y-auto md:overflow-hidden h-full relative">

                    {/* ============ 左栏: 菜品基本信息 ============ */}
                    <div className="w-full md:w-1/3 bg-white border-b md:border-r md:border-b-0 border-gray-200 p-6 flex flex-col shrink-0 z-20 md:h-full md:overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <button onClick={() => setViewMode('LIST')} className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-black p-2 -ml-2 min-h-[44px] active:scale-95 transition-all">
                                <ChevronLeft size={16} /> 返回列表
                            </button>
                            {editingId && (
                                <button onClick={() => handleDeleteClick(editingId)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors md:hidden active:scale-95">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>

                        <h3 className="font-black text-2xl text-[#1A1A1A] mb-6">{editingId ? '编辑菜品' : '新增菜品'}</h3>

                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Code / ID (菜品编号)</label>
                                <input 
                                    className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none border-2 border-transparent focus:border-[#FFD700] uppercase font-mono" 
                                    value={newId} 
                                    onChange={e => setNewId(e.target.value.toUpperCase().replace(/\s+/g, ''))} 
                                    placeholder="e.g. A01" 
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Name (菜名)</label>
                                <input className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none border-2 border-transparent focus:border-[#FFD700]" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Hokkien Mee" />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Category (分类)</label>
                                <select className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                                    {categories.filter(c => c.id !== 'ALL').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Options (选项)</label>
                                <input className="w-full p-3 bg-gray-50 rounded-xl text-base font-bold outline-none border-2 border-transparent focus:border-[#FFD700]" value={newOptions} onChange={e => setNewOptions(e.target.value)} placeholder="e.g. 少辣, 加蛋, 走青 (Comma separated)" />
                            </div>
                        </div>

                        <div className="mt-auto pt-6 hidden md:block pb-[env(safe-area-inset-bottom)]">
                            <button onClick={handleSaveItem} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                                <Save size={20} /> 保存菜品 (Save)
                            </button>
                        </div>
                    </div>

                    {/* ============ 右栏: 规格与配方 ============ */}
                    <div className="flex-grow p-4 md:p-6 md:h-full md:overflow-y-auto pb-40 md:pb-6">
                        <div className="max-w-3xl mx-auto space-y-5">

                            {/* --- 规格 Tab 切换栏 --- */}
                            <div className="flex justify-between items-center gap-3 flex-wrap">
                                <h4 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2">
                                    <Box size={18} className="text-[#FFD700]" />
                                    规格与配方
                                </h4>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 overflow-x-auto scrollbar-hide flex-grow sm:flex-grow-0 max-w-full">
                                        {newVariants.map((v, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => { setActiveVariantTab(idx); setExpandedIngIdx(null); }}
                                                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${activeVariantTab === idx ? 'bg-[#1A1A1A] text-[#FFD700]' : 'text-gray-500 hover:bg-gray-50'}`}
                                            >
                                                {v.label || `Var ${idx + 1}`}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => {
                                                setNewVariants([...newVariants, { label: 'New', price: 0, cost: 0, recipe: [], method: '', youtubeUrl: '', totalTime: 0, variantNote: '' }]);
                                                setActiveVariantTab(newVariants.length);
                                            }}
                                            className="px-3 py-2.5 min-h-[44px] text-gray-400 hover:text-black active:scale-95"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                    <button onClick={() => deleteVariant(activeVariantTab)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors active:scale-95" title="Delete Variant">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* --- 6 列规格指标卡 (Label | Price | Overhead | Cost | Profit | GP%) --- */}
                            <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-4 pb-6 border-b border-gray-100">
                                    {/* 规格名 */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">规格名</label>
                                        <input className="w-full p-2.5 bg-gray-50 rounded-lg text-base font-bold outline-none border focus:border-[#FFD700]" value={currentVariant?.label || ''} onChange={e => updateVariantField(activeVariantTab, 'label', e.target.value)} />
                                    </div>
                                    {/* 卖价 */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">卖价 (RM)</label>
                                        <div className="relative">
                                            <span className="absolute left-2 top-[11px] text-gray-400 text-xs font-bold">RM</span>
                                            <input
                                                type="number"
                                                step="0.50"
                                                className="w-full p-2.5 pl-9 bg-gray-50 rounded-lg text-base font-bold outline-none border focus:border-[#FFD700]"
                                                value={currentVariant?.price || ''}
                                                onChange={e => updateVariantField(activeVariantTab, 'price', parseFloat(e.target.value) || 0)}
                                                onClick={e => (e.target as HTMLInputElement).select()}
                                            />
                                        </div>
                                    </div>
                                    {/* 调料/杂项损耗 % */}
                                    <div>
                                        <label className="text-[9px] font-black text-amber-600 uppercase mb-1 block tracking-wider" title="杂项调料、油盐酱醋与备料耗损附加比例 (Overhead Margin %)">🧂 调料/损耗 %</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.5"
                                                className="w-full p-2.5 pr-8 bg-amber-50 rounded-lg text-base font-bold outline-none border border-amber-200 focus:border-[#FFD700] text-center text-amber-900"
                                                value={currentVariant?.overheadMarginPercent ?? 0}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    updateVariantField(activeVariantTab, 'overheadMarginPercent', val > 100 ? 100 : val < 0 ? 0 : val);
                                                }}
                                                onClick={e => (e.target as HTMLInputElement).select()}
                                            />
                                            <span className="absolute right-2 top-[11px] text-amber-500 text-xs font-bold">%</span>
                                        </div>
                                    </div>
                                    {/* 成本 (auto) */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">成本 (Auto)</label>
                                        <div className="w-full p-2.5 bg-gray-100 text-gray-700 rounded-lg text-base font-mono font-black border border-gray-200 relative">
                                            <span className="text-[10px] mr-1 opacity-50">RM</span>
                                            {variantCost.toFixed(2)}
                                            <Info size={10} className="absolute right-2 top-3 text-gray-400" />
                                        </div>
                                    </div>
                                    {/* 利润 RM (NEW) */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">💰 利润 (RM)</label>
                                        <div className={`w-full p-2.5 rounded-lg text-base font-mono font-black border-2 ${variantProfit > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : variantProfit < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            <span className="text-[10px] mr-1 opacity-50">RM</span>
                                            {variantProfit.toFixed(2)}
                                        </div>
                                    </div>
                                    {/* GP% */}
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-wider">利润率 GP%</label>
                                        <div className={`w-full p-2.5 rounded-lg text-base font-mono font-black border-2 ${marginColor}`}>
                                            {variantMargin.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                {currentVariant?.overheadMarginPercent && currentVariant.overheadMarginPercent > 0 ? (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[10px] text-amber-800 leading-normal font-bold mt-4 animate-in fade-in duration-200">
                                        💡 <strong>配方额外损耗与调味料分摊分析</strong>：
                                        <ul className="list-disc pl-4 mt-1 space-y-0.5 font-sans">
                                            <li>配方食材原料净成本：<strong>RM {baseRecipeCost.toFixed(2)}</strong></li>
                                            <li>额外增设的调味品/杂项/损耗附加率：<strong>{currentVariant.overheadMarginPercent}%</strong></li>
                                            <li>分摊间接损耗金额：<strong>+ RM {overheadCostAmount.toFixed(2)}</strong></li>
                                            <li>最终加权总出餐成本 (作为成本基数，已用于核算上方毛利润和GP%)：<strong>RM {variantCost.toFixed(2)}</strong></li>
                                        </ul>
                                    </div>
                                ) : null}

                                {/* --- 外卖价对比 (副) --- */}
                                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-blue-600">
                                            <Truck size={12} /> <span className="font-bold">外卖建议价</span>
                                        </div>
                                        <div className="font-mono font-black text-blue-700">RM {calculateDeliveryPrice(variantPrice).toFixed(2)}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-gray-500">
                                            <Info size={12} /> <span className="font-bold">配方项数</span>
                                        </div>
                                        <div className="font-mono font-black text-gray-700">{currentVariant?.recipe?.length || 0} 项</div>
                                    </div>
                                </div>

                                {/* --- 食材配方区 --- */}
                                <div className="mt-6 space-y-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                        <h5 className="font-bold text-sm text-[#1A1A1A] flex items-center gap-2">
                                            <Box size={16} /> 配方食材 (Ingredients)
                                            {currentVariant?.recipe && currentVariant.recipe.length > 0 && (
                                                <span className="bg-[#FFD700] text-black text-[10px] px-2 py-0.5 rounded-full font-black">{currentVariant.recipe.length}</span>
                                            )}
                                        </h5>
                                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                            <button onClick={syncRecipeToAll} className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1 flex-1 sm:flex-none justify-center active:scale-95">
                                                <Layers size={12} /> <span className="hidden sm:inline">同步到所有规格</span><span className="sm:hidden">同步</span>
                                            </button>
                                            <button onClick={() => setShowCopyModal(true)} className="text-[10px] bg-orange-50 text-orange-600 px-3 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-orange-100 transition-colors flex items-center gap-1 flex-1 sm:flex-none justify-center active:scale-95">
                                                <BookOpen size={12} /> <span className="hidden sm:inline">从其他菜品复制</span><span className="sm:hidden">复制</span>
                                            </button>
                                            <button onClick={() => setShowStockSelector(true)} className="text-[10px] bg-[#FFD700] text-black px-3 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-yellow-400 transition-colors flex items-center gap-1 flex-1 sm:flex-none justify-center shadow-sm active:scale-95">
                                                <Plus size={12} /> 添加原料
                                            </button>
                                        </div>
                                    </div>

                                    {(!currentVariant?.recipe || currentVariant.recipe.length === 0) ? (
                                        <div className="text-center py-10 text-gray-400 text-xs italic bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                            <Box size={32} className="mx-auto mb-2 opacity-30" />
                                            暂无配方 (No Ingredients)
                                            <p className="mt-2 text-[10px] not-italic">点击右上方「添加原料」开始</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-2.5">
                                                {currentVariant.recipe.map((ing, i) => renderIngredientCard(ing, i))}
                                            </div>
                                            {renderPieceUnitsDatalist()}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ---------- 做法 / 视频区块 (规格层级) ---------- */}
                            <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-gray-200">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="bg-orange-100 p-2 rounded-xl">
                                        <Film size={18} className="text-orange-600" />
                                    </div>
                                    <div>
                                        <h5 className="font-black text-base text-[#1A1A1A]">做法 & 视频 (Method & Video)</h5>
                                        <p className="text-[10px] text-gray-400">规格层级 — 每个规格独立做法</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* 总用时 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Clock size={11} /> 总用时 (分钟)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={currentVariant?.totalTime || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'totalTime', parseFloat(e.target.value) || 0)}
                                            placeholder="如: 30"
                                            className="w-full sm:w-32 p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] font-bold"
                                        />
                                    </div>

                                    {/* 整体做法 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <ListOrdered size={11} /> 整体做法 (Method) — 按步骤换行
                                        </label>
                                        <textarea
                                            value={currentVariant?.method || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'method', e.target.value)}
                                            placeholder={"1. 大火热锅下油\n2. 加入虾爆炒至变色\n3. 加入面条快炒\n4. 调味，加蛋液炒匀\n5. 撒葱花起锅"}
                                            rows={6}
                                            className="w-full p-3 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] resize-y leading-relaxed font-mono"
                                        />
                                        <p className="text-[9px] text-gray-400 mt-1">建议每行一个步骤，方便后厨阅读</p>
                                    </div>

                                    {/* YouTube */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <Youtube size={12} className="text-red-500" /> YouTube 教学视频
                                        </label>
                                        <input
                                            type="url"
                                            value={currentVariant?.youtubeUrl || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'youtubeUrl', e.target.value)}
                                            placeholder="https://www.youtube.com/watch?v=..."
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-red-300 font-mono"
                                        />
                                        {extractYouTubeId(currentVariant?.youtubeUrl) && (
                                            <a
                                                href={currentVariant?.youtubeUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-3 inline-flex items-center gap-2 px-5 py-3.5 min-h-[48px] bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                            >
                                                <Youtube size={20} className="fill-white" />
                                                <span>在 YouTube 打开教学视频</span>
                                                <ExternalLink size={14} className="opacity-70" />
                                            </a>
                                        )}
                                    </div>

                                    {/* 规格备注 */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            <StickyNote size={11} /> 规格备注 (Variant Note)
                                        </label>
                                        <textarea
                                            value={currentVariant?.variantNote || ''}
                                            onChange={e => updateVariantField(activeVariantTab, 'variantNote', e.target.value)}
                                            placeholder="如: L 大份要用 2 号大锅，火候要更猛"
                                            rows={2}
                                            className="w-full p-2.5 bg-gray-50 rounded-lg text-base border border-gray-200 outline-none focus:border-[#FFD700] resize-y leading-relaxed"
                                        />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* ============ 移动端底部保存条 ============ */}
                    <div className="md:hidden fixed bottom-0 left-0 w-full px-4 pt-3 pb-[max(env(safe-area-inset-bottom,20px),1rem)] bg-white/95 backdrop-blur-md border-t border-gray-200 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
                        <button onClick={handleSaveItem} className="w-full py-3.5 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-lg shadow-lg hover:bg-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                            <Save size={20} /> 保存菜品 (Save)
                        </button>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 删除确认 Modal (单独保留，因业务上属于"删除菜品"专门弹窗) */}
            {/* ====================================================== */}
            {deleteId && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
                        <Trash2 size={48} className="mx-auto text-red-500 mb-4" />
                        <h3 className="font-black text-xl mb-2">确认删除?</h3>
                        <p className="text-sm text-gray-500 mb-6">此操作将永久删除该菜品。</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setDeleteId(null)} className="py-3.5 min-h-[48px] bg-gray-100 rounded-xl font-bold text-sm active:scale-95 transition-all">取消</button>
                            <button onClick={confirmDelete} className="py-3.5 min-h-[48px] bg-red-600 text-white rounded-xl font-bold text-sm active:scale-95 transition-all">删除</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 库存原料选择器 */}
            {/* ====================================================== */}
            {showStockSelector && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85dvh]">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-black text-lg">选择库存原料</h3>
                            <button onClick={() => setShowStockSelector(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95 transition-all"><X /></button>
                        </div>
                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                                <input className="w-full pl-10 p-2.5 bg-gray-50 rounded-xl text-base font-bold outline-none" placeholder="Search stock..." value={stockSearch} onChange={e => setStockSearch(e.target.value)} autoFocus />
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-2 pb-6">
                            {(() => {
                                const grouped: Record<string, StockItem[]> = {};
                                const kitchenOnly = stockItems.filter(s => {
                                    if (stockSearch) return s.name.toLowerCase().includes(stockSearch.toLowerCase());
                                    return ['FRESH', 'MEAT', 'SEAFOOD', 'VEG', 'NOODLE', 'DRY', 'SAUCE', 'HQ'].includes(s.category) || s.id.startsWith('K');
                                });
                                kitchenOnly.forEach(s => {
                                    const catLabel = STOCK_CATEGORIES[s.category] || '其他 (Other)';
                                    if (!grouped[catLabel]) grouped[catLabel] = [];
                                    grouped[catLabel].push(s);
                                });
                                const sortedGroups = Object.keys(grouped).sort();
                                if (sortedGroups.length === 0) return <div className="p-8 text-center text-gray-400 text-xs">No matching kitchen ingredients found.</div>;
                                return sortedGroups.map(group => (
                                    <div key={group} className="mb-4">
                                        <div className="px-3 py-2 bg-gray-50 rounded-lg text-xs font-black text-gray-500 uppercase tracking-wider mb-1 sticky top-0 z-10 flex items-center gap-2">
                                            <Layers size={12} /> {group}
                                        </div>
                                        {grouped[group].map(s => (
                                            <button key={s.id} onClick={() => addIngredientToVariant(s)} className="w-full text-left p-3.5 min-h-[56px] hover:bg-gray-50 rounded-xl flex justify-between items-center group border-b border-gray-50 last:border-0 active:scale-[0.99] active:bg-yellow-50 transition-all">
                                                <div>
                                                    <div className="font-bold text-sm text-[#1A1A1A]">{s.name}</div>
                                                    <div className="text-[10px] text-gray-400">Unit: {s.unit} • Cost: RM {s.cost.toFixed(2)}</div>
                                                </div>
                                                <Plus size={18} className="text-gray-300 group-hover:text-[#FFD700]" />
                                            </button>
                                        ))}
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 复制配方 Modal */}
            {/* ====================================================== */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85dvh]">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <div>
                                <h3 className="font-black text-lg text-[#1A1A1A] flex items-center gap-2"><BookOpen size={18} className="text-orange-500" /> 复制配方</h3>
                                <p className="text-xs text-gray-500">Copy ingredients from another dish</p>
                            </div>
                            <button onClick={() => setShowCopyModal(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95 transition-all"><X size={20} /></button>
                        </div>

                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                                <input
                                    className="w-full pl-10 p-2.5 bg-white border-2 border-gray-200 rounded-xl text-base font-bold outline-none focus:border-orange-400 transition-colors"
                                    placeholder="搜索菜品 (Search Menu)..."
                                    value={copySearch}
                                    onChange={e => setCopySearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-2 space-y-1 pb-6">
                            {menuItems
                                .filter(m => m.id !== editingId)
                                .filter(m => m.name.toLowerCase().includes(copySearch.toLowerCase()))
                                .map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleCopyRecipe(item)}
                                        className="w-full text-left p-3.5 min-h-[56px] hover:bg-orange-50 rounded-xl flex items-center justify-between group transition-colors active:scale-[0.99]"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs shrink-0 overflow-hidden">
                                                <Utensils size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm text-[#1A1A1A] truncate">{item.name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">ID: {item.id} • {item.variants?.[0]?.recipe?.length || 0} 项配方</div>
                                            </div>
                                        </div>
                                        <Copy size={16} className="text-gray-300 group-hover:text-orange-500 shrink-0 ml-2" />
                                    </button>
                                ))
                            }
                            {menuItems.filter(m => m.name.toLowerCase().includes(copySearch.toLowerCase())).length === 0 && (
                                <div className="py-10 text-center text-gray-400 text-xs italic">没有找到匹配的菜品</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 👑 通用 ConfirmModal (替换所有 native confirm) */}
            {/* ====================================================== */}
            {confirmModal && (
                <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${confirmModal.danger ? 'bg-red-100' : 'bg-yellow-100'}`}>
                            {confirmModal.danger ? <AlertTriangle size={28} className="text-red-600" /> : <Info size={28} className="text-yellow-600" />}
                        </div>
                        <h3 className="font-black text-xl mb-2 text-center text-[#1A1A1A]">{confirmModal.title}</h3>
                        <p className="text-sm text-gray-600 mb-6 text-center leading-relaxed whitespace-pre-line">{confirmModal.message}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="py-3.5 min-h-[48px] bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-sm active:scale-95 transition-all"
                            >
                                {confirmModal.cancelText || '取消'}
                            </button>
                            <button
                                onClick={() => {
                                    const fn = confirmModal.onConfirm;
                                    setConfirmModal(null);
                                    fn();
                                }}
                                className={`py-3.5 min-h-[48px] rounded-xl font-bold text-sm active:scale-95 transition-all text-white ${confirmModal.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1A1A1A] hover:bg-black'}`}
                            >
                                {confirmModal.confirmText || '确认'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🔍 全局高清图片大图预览弹窗 (Lightbox Zoom Modal) */}
            {previewImage && (
                <div 
                    onClick={() => setPreviewImage(null)}
                    className="fixed inset-0 z-[320] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in cursor-zoom-out select-none"
                >
                    <div className="absolute top-4 right-4 z-10">
                        <button 
                            onClick={() => setPreviewImage(null)}
                            style={{ minWidth: '48px', minHeight: '48px' }}
                            className="bg-white/10 hover:bg-white/25 active:scale-95 text-white rounded-full flex items-center justify-center transition-all shadow-lg border border-white/10"
                        >
                            <span className="text-xl font-bold">✕</span>
                        </button>
                    </div>
                    
                    <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="flex flex-col items-center max-w-full md:max-w-3xl bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-xs shadow-2xl select-text"
                    >
                        <img 
                            src={previewImage.url} 
                            alt={previewImage.name}
                            referrerPolicy="no-referrer"
                            className="max-w-[90vw] max-h-[65vh] md:max-h-[75vh] object-contain rounded-2xl shadow-xl border border-white/5"
                        />
                        <div className="mt-4 text-center">
                            <h3 className="text-base md:text-lg font-black text-white tracking-wide">{previewImage.name}</h3>
                            <p className="text-xs text-gray-450 mt-1 font-mono font-semibold">点击空白处或右上角关闭 (Tap anywhere to close)</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ====================================================== */}
            {/* 👑 通用 InfoModal (替换所有 native alert) */}
            {/* ====================================================== */}
            {infoModal && (
                <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in pb-[env(safe-area-inset-bottom)]" onClick={() => setInfoModal(null)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${infoModal.icon === 'success' ? 'bg-green-100' : infoModal.icon === 'error' ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {infoModal.icon === 'success' && <Check size={28} className="text-green-600" />}
                            {infoModal.icon === 'error' && <AlertTriangle size={28} className="text-red-600" />}
                            {(!infoModal.icon || infoModal.icon === 'info') && <Info size={28} className="text-blue-600" />}
                        </div>
                        <h3 className="font-black text-xl mb-2 text-center text-[#1A1A1A]">{infoModal.title}</h3>
                        <p className="text-sm text-gray-600 mb-6 text-center leading-relaxed whitespace-pre-line">{infoModal.message}</p>
                        <button
                            onClick={() => setInfoModal(null)}
                            className="w-full py-3.5 min-h-[48px] bg-[#1A1A1A] text-[#FFD700] rounded-xl font-bold text-sm active:scale-95 transition-all"
                        >
                            知道了
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};