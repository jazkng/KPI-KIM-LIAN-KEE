
import { CatalogItem, Supplier } from '../types';

// ==========================================
// 1. UOM OPTIONS (通用备用单位)
// ==========================================
export const UOM_CONVERSIONS = [
    { label: 'Base Unit (基础单位)', value: 'BASE', ratio: 1 },
    { label: '1 Box (x10)', value: 'BOX', ratio: 10 },
    { label: '1 Ctn (x12)', value: 'CTN12', ratio: 12 },
    { label: '1 Packet (x1)', value: 'PKT', ratio: 1 },
    { label: '1 Carton (x24)', value: 'CTN24', ratio: 24 },
    { label: '1 Bundle (x10)', value: 'BDL10', ratio: 10 },
];

export const SUPPLIER_TAG_OPTIONS = [
    { id: 'PACKAGING', label: '包装 (Packaging)' },
    { id: 'HQ', label: '总店 (HQ)' },
    { id: 'DRINK', label: '水吧 (Drinks)' },
    { id: 'INGREDIENT', label: '食材 (Ingredients)' },
    { id: 'GAS', label: '煤气 (Gas)' },
];

// ==========================================
// 2. CATALOGS (Standardized: English (Chinese))
// ==========================================

const CATALOG_CSK: CatalogItem[] = [
    // --- CONTAINER (饭盒) ---
    { 
        id: 'CSK_001', name: 'SQ1500 Square Box (单座方盒)', unit: 'pkt', price: 28.81, category: 'CONTAINER',
        uomOptions: [ { label: '1 PKT (50pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (150pcs)', value: 'CTN', ratio: 3 } ]
    },
    { 
        id: 'CSK_002', name: 'SQ5 2-Comp Box (双格饭盒)', unit: 'pkt', price: 28.10, category: 'CONTAINER',
        uomOptions: [ { label: '1 PKT (30pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (180pcs)', value: 'CTN', ratio: 6 } ]
    },
    { 
        id: 'CSK_003', name: 'SQ7 3-Comp Box (三格饭盒)', unit: 'pkt', price: 29.10, category: 'CONTAINER',
        uomOptions: [ { label: '1 PKT (30pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (180pcs)', value: 'CTN', ratio: 6 } ]
    },
    { 
        id: 'CSK_004', name: 'C.BIO Lunch Box (环保饭盒)', unit: 'pkt', price: 11.80, category: 'CONTAINER',
        uomOptions: [ { label: '1 PKT (50pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (600pcs)', value: 'CTN', ratio: 12 } ]
    },

    // --- CUTLERY (餐具) ---
    { 
        id: 'CSK_005', name: 'Bamboo Chopstick (独立包装竹筷)', unit: 'pkt', price: 1.70, category: 'CUTLERY',
        uomOptions: [ { label: '1 PKT (40pairs)', value: 'BASE', ratio: 1 }, { label: '1 BDL (50 PKTs)', value: 'BDL', ratio: 50 } ]
    },
    { 
        id: 'CSK_006', name: 'Chinese Spoon (短柄汤匙)', unit: 'pkt', price: 1.50, category: 'CUTLERY',
        uomOptions: [ { label: '1 PKT (80pcs)', value: 'BASE', ratio: 1 }, { label: '1 BDL (20 PKTs)', value: 'BDL', ratio: 20 } ]
    },
    { 
        id: 'CSK_007', name: '6.5" Black Spoon (外卖长黑匙)', unit: 'pkt', price: 1.40, category: 'CUTLERY',
        uomOptions: [ { label: '1 PKT (50pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (40 PKTs)', value: 'CTN', ratio: 40 } ]
    },
    { 
        id: 'CSK_008', name: '6.5" Black Fork (外卖长黑叉)', unit: 'pkt', price: 1.40, category: 'CUTLERY',
        uomOptions: [ { label: '1 PKT (50pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (40 PKTs)', value: 'CTN', ratio: 40 } ]
    },

    // --- DRINKWARE (杯子吸管) ---
    { 
        id: 'CSK_009', name: 'TOLI G-12 PP Cup (360ml 塑料杯)', unit: 'pkt', price: 7.60, category: 'DRINKWARE',
        uomOptions: [ { label: '1 PKT (100pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (2000pcs)', value: 'CTN', ratio: 20 } ]
    },
    { 
        id: 'CSK_010', name: '6MM Black Straw (单独包装吸管)', unit: 'pkt', price: 2.60, category: 'DRINKWARE',
        uomOptions: [ { label: '1 PKT (100pcs)', value: 'BASE', ratio: 1 }, { label: '1 BDL (50 PKTs)', value: 'BDL', ratio: 50 } ]
    },

    // --- PLASTIC BAGS (塑料袋) ---
    { 
        id: 'CSK_011', name: 'Singlet Bag 12x15 (小号手提袋)', unit: 'pkt', price: 6.40, category: 'PLASTIC_BAG',
        uomOptions: [ { label: '1 PKT (500g)', value: 'BASE', ratio: 1 }, { label: '1 BDL (60 PKTs)', value: 'BDL', ratio: 60 } ]
    },
    { 
        id: 'CSK_012', name: 'Singlet Bag 15x18 (中号手提袋)', unit: 'pkt', price: 6.40, category: 'PLASTIC_BAG',
        uomOptions: [ { label: '1 PKT (500g)', value: 'BASE', ratio: 1 }, { label: '1 BDL (60 PKTs)', value: 'BDL', ratio: 60 } ]
    },
    { 
        id: 'CSK_014', name: 'HD Anti-Oil Bag 7x10 (小号防油袋)', unit: 'pkt', price: 7.99, category: 'PLASTIC_BAG',
        uomOptions: [ { label: '1 PKT (1kg)', value: 'BASE', ratio: 1 }, { label: '1 BDL (30 PKTs)', value: 'BDL', ratio: 30 } ]
    },
    { 
        id: 'CSK_015', name: 'HD Anti-Oil Bag 8x12 (中号防油袋)', unit: 'pkt', price: 7.99, category: 'PLASTIC_BAG',
        uomOptions: [ { label: '1 PKT (1kg)', value: 'BASE', ratio: 1 }, { label: '1 BDL (30 PKTs)', value: 'BDL', ratio: 30 } ]
    },
    { 
        id: 'CSK_018', name: 'HD Sheet 20x20 (正方塑料纸)', unit: 'pkt', price: 8.90, category: 'PLASTIC_BAG',
        uomOptions: [ { label: '1 PKT (150pcs)', value: 'BASE', ratio: 1 }, { label: '1 BDL (20 PKTs)', value: 'BDL', ratio: 20 } ]
    },

    // --- ACCESSORIES (杂项) ---
    { 
        id: 'CSK_019', name: 'Paper Chilli Bag (辣椒纸袋)', unit: 'pkt', price: 3.50, category: 'ACCESSORY',
        uomOptions: [ { label: '1 PKT (480pcs)', value: 'BASE', ratio: 1 }, { label: '1 BDL (100 PKTs)', value: 'BDL', ratio: 100 } ]
    },
    { 
        id: 'CSK_020', name: 'Zip Lock 2.5x3.5 (酱料袋)', unit: 'pkt', price: 2.30, category: 'ACCESSORY',
        uomOptions: [ { label: '1 PKT (100pcs)', value: 'BASE', ratio: 1 }, { label: '1 BOX (100 PKTs)', value: 'BOX', ratio: 100 } ]
    },
    { 
        id: 'CSK_016', name: 'Sauce Plate (酱料碟)', unit: 'pkt', price: 5.90, category: 'ACCESSORY',
        uomOptions: [ { label: '1 PKT (500pcs)', value: 'BASE', ratio: 1 }, { label: '1 CTN (20 PKTs)', value: 'CTN', ratio: 20 } ]
    },
    { 
        id: 'CSK_017', name: 'Rubber Band (橡胶圈)', unit: 'pkt', price: 14.00, category: 'ACCESSORY',
        uomOptions: [ { label: '1 PKT (1kg)', value: 'BASE', ratio: 1 }, { label: '1 GUNI (30kg)', value: 'GUNI', ratio: 30 } ]
    },
];

const CATALOG_SUNSONS: CatalogItem[] = [
    { 
        id: 'SUN_001', name: 'Honey Lime (酸柑蜜)', unit: 'btl', price: 12.50, category: 'BEVERAGE',
        uomOptions: [ { label: '1 Bottle', value: 'BASE', ratio: 1 }, { label: '1 Ctn (12 Btls)', value: 'CTN', ratio: 12 } ]
    },
    { 
        id: 'SUN_002', name: 'Chrysanthemum Sugar (菊花糖)', unit: 'pkt', price: 8.50, category: 'INGREDIENT',
        uomOptions: [ { label: '1 Packet', value: 'BASE', ratio: 1 }, { label: '1 Ctn (10 Pkts)', value: 'CTN', ratio: 10 } ]
    },
    { 
        id: 'SUN_003', name: 'Rock Sugar (冰糖)', unit: 'kg', price: 4.50, category: 'INGREDIENT',
        uomOptions: [ { label: '1 Kg', value: 'BASE', ratio: 1 }, { label: '1 Bag (5kg)', value: 'BAG', ratio: 5 } ]
    },
];

// ==========================================
// 3. SUPPLIER DEFINITIONS
// ==========================================
export const DEFAULT_SUPPLIERS: Supplier[] = [
    { 
        id: '8001', // Updated to new Sequence
        name: 'CSK Food Packaging & Plastic', 
        category: 'PACKAGING', 
        tags: ['PACKAGING', 'HQ'], 
        contact: '+60 11-5406 5240', 
        contactPerson: 'Admin / Order Desk', 
        email: 'sales@cskfoodpack.com',
        note: '主营：一次性餐盒、餐具、塑料袋。\nMain Supplier for disposables.', 
        paymentTerm: 'COD', 
        status: 'ACTIVE', 
        address: '52, Jalan Metro Perdana Barat 13, Kepong', 
        catalog: CATALOG_CSK,
        bankAccount: 'MAYBANK 5142-7163-9821 (CSK TRADING)',
        ssmNumber: '202003123456 (CSK-001)',
        sstNumber: 'W10-1808-12345678',
        deliverySchedule: 'Mon, Wed, Fri (Before 2PM)',
        minOrderValue: 200,
        website: 'www.cskfoodpack.com.my'
    },
    {
        id: '8002', // Updated to new Sequence
        name: 'Sunsons Sdn Bhd',
        category: 'DRINK',
        tags: ['DRINK', 'SUGAR'],
        contact: '012-2345467',
        contactPerson: 'Mr. Melvin',
        note: '供应：酸柑蜜，菊花糖，冰糖。\nSupply: Honey lime & sugar products.',
        paymentTerm: 'CASH',
        status: 'ACTIVE',
        address: 'No 12, Jalan Industri PBP 3, Taman Industri Pusat Bandar Puchong',
        catalog: CATALOG_SUNSONS,
        ssmNumber: '199801001234 (SUN-888)',
        deliverySchedule: 'Tue, Thu',
        minOrderValue: 100
    }
];
