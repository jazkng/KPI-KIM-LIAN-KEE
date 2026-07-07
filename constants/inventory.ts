
import { StockItem } from '../types';

// ============================================================================
// CODING SYSTEM (UPDATED):
// KITCHEN (K) -> RED LABEL
//   KF -> 'MEAT': Meat/Poultry (肉类)
//   KV -> 'VEG': Veg/Eggs (蔬菜/蛋)
//   KD -> 'DRY': Dry Goods
//   KS -> 'SAUCE': Sauce
// ============================================================================

export const DEFAULT_KITCHEN_STOCK: StockItem[] = [
    // --- 厨房-面类/主食 (NOODLE) ---
    { id: 'KF01', name: '面 (Noodles)', category: 'NOODLE', unit: 'kg', maxQty: 50, minLevel: 10, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF02', name: '河粉 (Hor Fun)', category: 'NOODLE', unit: 'kg', maxQty: 40, minLevel: 10, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF03', name: '米粉 (Bee Hoon - Fresh)', category: 'NOODLE', unit: 'kg', maxQty: 30, minLevel: 8, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF04', name: '伊面 (Yee Mee)', category: 'NOODLE', unit: 'pkt', maxQty: 40, minLevel: 10, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF05', name: '茨粉 (Tapioca Flour - Staple)', category: 'NOODLE', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF06', name: '面线 (Mee Sua)', category: 'NOODLE', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF07', name: '生面 (Sang Mee)', category: 'NOODLE', unit: 'kg', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF08', name: '米 (Rice)', category: 'NOODLE', unit: 'bag', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },

    // --- 厨房-肉类/家禽 (MEAT) ---
    { id: 'KF09', name: '肉片 (Meat Slices)', category: 'MEAT', unit: 'kg', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF10', name: '猪油渣 (Pork Lard Residue)', category: 'MEAT', unit: 'kg', maxQty: 15, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF11', name: '花肉 (Pork Belly)', category: 'MEAT', unit: 'kg', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF12', name: '扣肉 (Braised Pork)', category: 'MEAT', unit: 'can', maxQty: 24, minLevel: 6, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF13', name: '鸡翅膀 (Chicken Wings)', category: 'MEAT', unit: 'kg', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },

    // --- 厨房-海鲜/鱼类 (SEAFOOD) ---
    { id: 'KF15', name: '虾 31/40 (Prawn 31/40)', category: 'SEAFOOD', unit: 'kg', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF16', name: '虾 41/50 (Prawn 41/50)', category: 'SEAFOOD', unit: 'kg', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF17', name: '生虾 U7 (Fresh Prawn U7)', category: 'SEAFOOD', unit: 'kg', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF18', name: 'Sotong (Squid)', category: 'SEAFOOD', unit: 'kg', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF19', name: '花蛤 (Clams)', category: 'SEAFOOD', unit: 'kg', maxQty: 15, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF20', name: '金凤鱼 (Tilapia)', category: 'SEAFOOD', unit: 'pc', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF21', name: '大鱼片 (Big Fish Slices)', category: 'SEAFOOD', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF22', name: '鱼饼 (Fish Cake)', category: 'SEAFOOD', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },

    // --- 厨房-蔬菜/蛋类 (VEG) ---
    { id: 'KF14', name: '鸡蛋 (Eggs)', category: 'VEG', unit: 'tray', maxQty: 30, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF23', name: '包菜 (Cabbage)', category: 'VEG', unit: 'kg', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF24', name: '白菜 (Napa Cabbage)', category: 'VEG', unit: 'kg', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF25', name: '九菜 (Chives)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF26', name: '芽菜 (Bean Sprouts)', category: 'VEG', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF27', name: '豆角 (Long Beans)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF28', name: '红辣椒 (Red Chili)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF29', name: '茄子 (Eggplant)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF30', name: '辣椒仔 (Chili Padi)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF31', name: '蒜头 (Garlic)', category: 'VEG', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF32', name: '青葱 (Spring Onion)', category: 'VEG', unit: 'kg', maxQty: 3, minLevel: 0.5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF33', name: '大葱 (Onion)', category: 'VEG', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF34', name: '生姜 (Ginger)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF35', name: '菜心 (Choy Sum)', category: 'VEG', unit: 'kg', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF36', name: '芥兰 (Kai Lan)', category: 'VEG', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF37', name: '树苗 (Veg Shoots)', category: 'VEG', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KF38', name: '生菜 (Lettuce)', category: 'VEG', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KF39', name: '油麦 (Romaine)', category: 'VEG', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },

    // --- 厨房-调味品/酱料 (KS - Kitchen Sauce) ---
    { id: 'KS01', name: '黑酱油 (Dark Soy Sauce)', category: 'SAUCE', unit: 'tin', maxQty: 12, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KS02', name: '生抽 (Light Soy Sauce)', category: 'SAUCE', unit: 'tin', maxQty: 12, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KS03', name: '蚝油 (Oyster Sauce)', category: 'SAUCE', unit: 'btl', maxQty: 12, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KS04', name: '味精 (MSG)', category: 'SAUCE', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS05', name: '盐 (Salt)', category: 'SAUCE', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS06', name: '糖 (Sugar)', category: 'SAUCE', unit: 'kg', maxQty: 30, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS07', name: '鸡精 (Chicken Powder)', category: 'SAUCE', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS08', name: '胡椒粉 (Pepper Powder)', category: 'SAUCE', unit: 'pkt', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS09', name: '腐乳 (Fermented Bean Curd)', category: 'SAUCE', unit: 'jar', maxQty: 12, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS10', name: 'Belacan', category: 'SAUCE', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS11', name: 'Sambal (辣椒膏)', category: 'SAUCE', unit: 'kg', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KS12', name: '花雕酒 (Shaoxing Wine)', category: 'SAUCE', unit: 'btl', maxQty: 12, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS13', name: '辣椒瓶 (Bottled Chili)', category: 'SAUCE', unit: 'btl', maxQty: 24, minLevel: 6, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KS14', name: '姜粉 (Ginger Powder)', category: 'SAUCE', unit: 'pkt', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },

    // --- 厨房-干货/粉类 (KD - Kitchen Dry) ---
    { id: 'KD01', name: '虾米 (Dried Shrimp)', category: 'DRY', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KD02', name: '鱿鱼丝 (Shredded Cuttlefish)', category: 'DRY', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KD03', name: '风车粉 (Potato Starch)', category: 'DRY', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KD04', name: '木薯粉 (Tapioca Starch)', category: 'DRY', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KD05', name: '面粉 (Wheat Flour)', category: 'DRY', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: false },

    // --- 厨房-总店特供/半成品 (KH - Kitchen HQ Supply) ---
    { id: 'KH01', name: '左口鱼 (Flounder)', category: 'HQ', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KH02', name: '春卷 (Spring Roll)', category: 'HQ', unit: 'pkt', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KH03', name: '水饺 (Dumpling)', category: 'HQ', unit: 'pkt', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'KH04', name: '枕头年糕 (Pillow Rice Cake)', category: 'HQ', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'KH05', name: '海鲜豆腐 (Seafood Tofu)', category: 'HQ', unit: 'pkt', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: true },
];

export const DEFAULT_BAR_STOCK: StockItem[] = [
    // --- 水吧/饮品原料 (BT - Bar Tea/Ingredients) ---
    { id: 'BT01', name: '铁观音 (Tie Guan Yin)', category: 'TEA', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BT02', name: '普洱 (Pu Er)', category: 'TEA', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BT03', name: '香片 (Jasmine)', category: 'TEA', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BT04', name: '茶王 (Tea King)', category: 'TEA', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BT05', name: '菊花 (Chrysanthemum)', category: 'TEA', unit: 'pkt', maxQty: 15, minLevel: 4, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BT06', name: '罗汉果 (Luo Han Guo)', category: 'TEA', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },

    // --- 水吧-生鲜水果/原料 (BF - Bar Fruit) ---
    { id: 'BF01', name: '青苹 (Green Apple)', category: 'FRUIT', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BF02', name: '橙 (Orange)', category: 'FRUIT', unit: 'kg', maxQty: 10, minLevel: 3, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BF03', name: '西瓜 (Watermelon)', category: 'FRUIT', unit: 'kg', maxQty: 30, minLevel: 8, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BF04', name: '萝卜 (Carrot)', category: 'FRUIT', unit: 'kg', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
    { id: 'BF05', name: '桔子 (Lime)', category: 'FRUIT', unit: 'kg', maxQty: 5, minLevel: 1, currentQty: 0, cost: 0, isKeyItem: true },
    { id: 'BF06', name: '酸梅 (Sour Plum)', category: 'MISC', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 0, isKeyItem: false },
];

export const DEFAULT_GENERAL_STOCK: StockItem[] = [
    // --- SUPPLY PACKAGING (SP) ---
    { 
        id: 'SP01', 
        name: 'SQ1500 Box (单座饭盒)', 
        category: 'PACKAGING', 
        unit: 'pkt', // Base unit is PKT
        maxQty: 20, 
        minLevel: 5, 
        currentQty: 0, 
        cost: 28.81, 
        isKeyItem: true,
        uomOptions: [
            { label: 'PCS (粒)', value: 'PCS', ratio: 0.02 }, // 1 PKT = 50 PCS, so 1 PCS = 0.02 PKT
            { label: 'BOX (箱)', value: 'BOX', ratio: 3.0 }   // 1 BOX = 3 PKT
        ]
    },
    { id: 'SP02', name: 'SQ5 Box (双座饭盒)', category: 'PACKAGING', unit: 'pkt', maxQty: 10, minLevel: 3, currentQty: 0, cost: 28.10, isKeyItem: false },
    { id: 'SP03', name: 'SQ7 Box (三座饭盒)', category: 'PACKAGING', unit: 'pkt', maxQty: 10, minLevel: 3, currentQty: 0, cost: 29.10, isKeyItem: false },
    { id: 'SP04', name: 'C.BIO Lunch Box (Brown)', category: 'PACKAGING', unit: 'pkt', maxQty: 10, minLevel: 2, currentQty: 0, cost: 11.80, isKeyItem: false },

    // --- SUPPLY GENERAL (SG) ---
    { id: 'SG01', name: '煤气桶 (Gas Cylinder)', category: 'GENERAL', unit: 'tank', maxQty: 10, minLevel: 3, currentQty: 0, cost: 32.00, isKeyItem: true },
    { id: 'SG04', name: '收银纸 (Receipt Paper)', category: 'TOOLS', unit: 'roll', maxQty: 20, minLevel: 5, currentQty: 0, cost: 2.50, isKeyItem: true },
    { id: 'SG05', name: '垃圾袋 (Garbage Bag XL)', category: 'WASTE', unit: 'pkt', maxQty: 20, minLevel: 5, currentQty: 0, cost: 8.00, isKeyItem: true },
    { id: 'SG07', name: '厕纸 (Toilet Roll)', category: 'CLEANING', unit: 'bdl', maxQty: 10, minLevel: 3, currentQty: 0, cost: 18.00, isKeyItem: true },
    { id: 'SG02', name: '洗碗液 (Dish Soap)', category: 'CLEANING', unit: 'btl', maxQty: 10, minLevel: 2, currentQty: 0, cost: 12.00, isKeyItem: false },
    { id: 'SG06', name: '圆珠笔 (Ball Pen)', category: 'TOOLS', unit: 'box', maxQty: 5, minLevel: 1, currentQty: 0, cost: 15.00, isKeyItem: false },
];
