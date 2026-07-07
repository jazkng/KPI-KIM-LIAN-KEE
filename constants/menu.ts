
import { MenuCategory, MenuItem } from '../types';

// ==========================================
// MENU CATEGORIES
// ==========================================
export const MENU_CATEGORIES: MenuCategory[] = [
    { id: 'ALL', label: '全部 (All)' },
    { id: 'A_SERIES', label: 'A - 招牌炭炒 (Charcoal Noodles)' },
    { id: 'C_SERIES', label: 'C - 特色面食 (Premium Noodles)' },
    { id: 'D_SERIES', label: 'D - 饭类与汤 (Rice & Soup)' },
    { id: 'E_SERIES', label: 'E - 非洲鱼 (Tilapia)' },
    { id: 'F_SERIES', label: 'F - 海鲜 (Seafood)' },
    { id: 'G_SERIES', label: 'G - 小吃 (Snacks)' },
    { id: 'H_SERIES', label: 'H - 蔬菜 (Vegetables)' },
    { id: 'J_SERIES', label: 'J - 果汁 (Fruit Juice)' },
    { id: 'K_SERIES', label: 'K/L - 饮料 (Beverages)' },
];

// ==========================================
// MENU ITEMS (STRICTLY MATCHING PDF)
// ==========================================
export const INITIAL_MENU_ITEMS: MenuItem[] = [
    // --- A SERIES: 招牌炭炒面食 ---
    {
        id: 'A01',
        name: 'A01 招牌福建面 (Hokkien Mee)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 5.50 },
            { label: 'M (中)', price: 34.00, cost: 11.00 },
            { label: 'L (大)', price: 50.50, cost: 16.50 }
        ],
        options: ['加生蛋 (+RM1.00)', '米粉面', '少猪油']
    },
    {
        id: 'A02',
        name: 'A02 月光面 (Moon Light Mee)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.00 },
            { label: 'M (中)', price: 35.50, cost: 12.00 },
            { label: 'L (大)', price: 52.00, cost: 17.50 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A03',
        name: 'A03 金牌炭炒福建面 (Specialty Charcoal Fried Hokkien Mee)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 35.50, cost: 12.00 },
            { label: 'M (中)', price: 71.00, cost: 24.00 },
            { label: 'L (大)', price: 106.50, cost: 35.00 }
        ],
        options: ['不要猪肝', '少猪油']
    },
    {
        id: 'A04',
        name: 'A04 福建米粉 (Hokkien Bihun)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 5.50 },
            { label: 'M (中)', price: 34.00, cost: 11.00 },
            { label: 'L (大)', price: 50.50, cost: 16.50 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A05',
        name: 'A05 福建粿条面 (Hokkien Kuey Teow Mee)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 5.50 },
            { label: 'M (中)', price: 34.00, cost: 11.00 },
            { label: 'L (大)', price: 50.50, cost: 16.50 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A06',
        name: 'A06 福建米粉面 (Hokkien Bihun Mee)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 5.50 },
            { label: 'M (中)', price: 34.00, cost: 11.00 },
            { label: 'L (大)', price: 50.50, cost: 16.50 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A07',
        name: 'A07 福建粿条米粉 (Hokkien Kuey Teow Bihun)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 5.50 },
            { label: 'M (中)', price: 34.00, cost: 11.00 },
            { label: 'L (大)', price: 53.00, cost: 17.00 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A08',
        name: 'A08 广府鸳鸯 (Cantonese Yin Yong)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A09',
        name: 'A09 月光河 (Moonlight Kuey Teow)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 50.50, cost: 17.00 }
        ],
        options: ['加生蛋 (+RM1.00)']
    },
    {
        id: 'A10',
        name: 'A10 罗面 (Loh Mee)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 35.50, cost: 12.00 },
            { label: 'L (大)', price: 52.00, cost: 17.50 }
        ],
        options: ['多醋', '少醋']
    },
    {
        id: 'A11',
        name: 'A11 肉羹汤 (Pork Soup)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'A12',
        name: 'A12 香辣老鼠粉 (Spicy Fried Loh Shu Fan)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 6.00 },
            { label: 'M (中)', price: 34.00, cost: 11.50 },
            { label: 'L (大)', price: 50.50, cost: 17.00 }
        ],
        options: []
    },
    {
        id: 'A13',
        name: 'A13 炒面线 (Fried Mee Suah)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'A14',
        name: 'A14 猪油渣 (Pork Lard Crisps)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (小)', price: 4.00, cost: 1.50 }
        ],
        options: []
    },
    {
        id: 'A15',
        name: 'A15 金莲记好酱料 (Kim Lian Kee Signature Sauce)',
        category: 'A_SERIES',
        variants: [
            { label: 'S (罐)', price: 6.00, cost: 2.50 }
        ],
        options: []
    },

    // --- C SERIES: 特色面食 ---
    {
        id: 'C01',
        name: 'C01 姜葱生虾(生面/伊面) (Ginger & Scallion Prawn)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 38.00, cost: 13.00 },
            { label: 'M (中)', price: 73.50, cost: 25.00 },
            { label: 'L (大)', price: 109.50, cost: 38.00 }
        ],
        options: ['生面', '伊面', '加面底 (+RM11.00)']
    },
    {
        id: 'C02',
        name: 'C02 广府鸳鸯 (Cantonese Style Yin Yong)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'C03',
        name: 'C03 滑蛋河 (Cantonese Style Kuey Teow)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'C04',
        name: 'C04 广府香底米 (Cantonese Style Mee Hoon)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'C05',
        name: 'C05 广府伊面 (Cantonese Style Yi Mee)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'C06',
        name: 'C06 焖伊面 (Braised Yi Mee)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 6.00 },
            { label: 'M (中)', price: 34.00, cost: 11.50 },
            { label: 'L (大)', price: 50.50, cost: 17.00 }
        ],
        options: []
    },
    {
        id: 'C07',
        name: 'C07 家乡面 (Hometown Mee)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 6.00 },
            { label: 'M (中)', price: 34.00, cost: 11.50 },
            { label: 'L (大)', price: 50.50, cost: 17.00 }
        ],
        options: []
    },
    {
        id: 'C08',
        name: 'C08 茨粉根 (Tapioca Noodles (Shu Fen Gen))',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },
    {
        id: 'C09',
        name: 'C09 上海米粉 (Shanghai Mee Hoon)',
        category: 'C_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 53.00, cost: 18.00 }
        ],
        options: []
    },

    // --- D SERIES: 饭类与汤 ---
    {
        id: 'D01',
        name: 'D01 扬州炒饭 (Yangzhou Fried Rice)',
        category: 'D_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 6.00 },
            { label: 'M (中)', price: 34.00, cost: 11.50 },
            { label: 'L (大)', price: 50.50, cost: 17.00 }
        ],
        options: []
    },
    {
        id: 'D02',
        name: 'D02 金香炒饭 (Kam Heong Fried Rice)',
        category: 'D_SERIES',
        variants: [
            { label: 'S (小)', price: 17.50, cost: 6.00 },
            { label: 'M (中)', price: 34.00, cost: 11.50 },
            { label: 'L (大)', price: 50.50, cost: 17.00 }
        ],
        options: []
    },
    {
        id: 'D03',
        name: 'D03 扣肉米粉 (Braised Pork Belly Mee Hoon)',
        category: 'D_SERIES',
        variants: [
            { label: 'S (小)', price: 19.00, cost: 6.50 },
            { label: 'M (中)', price: 36.50, cost: 12.50 },
            { label: 'L (大)', price: 54.50, cost: 18.50 }
        ],
        options: []
    },

    // --- E SERIES: 非洲鱼 ---
    {
        id: 'E01',
        name: 'E01 姜蓉非洲鱼 (Steamed Ginger Tilapia)',
        category: 'E_SERIES',
        variants: [
            { label: 'S (小)', price: 47.50, cost: 16.00 },
            { label: 'L (大)', price: 68.50, cost: 24.00 }
        ],
        options: ['油煎', '清蒸', '姜蓉', '亚参', '酱蒸']
    },
    {
        id: 'E02',
        name: 'E02 清蒸非洲鱼 (Steamed Tilapia)',
        category: 'E_SERIES',
        variants: [
            { label: 'S (小)', price: 47.50, cost: 16.00 },
            { label: 'L (大)', price: 68.50, cost: 24.00 }
        ],
        options: []
    },
    {
        id: 'E03',
        name: 'E03 油浸非洲鱼 (Deep Fried Tilapia)',
        category: 'E_SERIES',
        variants: [
            { label: 'S (小)', price: 47.50, cost: 16.00 },
            { label: 'L (大)', price: 68.50, cost: 24.00 }
        ],
        options: []
    },
    {
        id: 'E04',
        name: 'E04 油浸亚参非洲鱼 (Deep Fried Asam Tilapia)',
        category: 'E_SERIES',
        variants: [
            { label: 'S (小)', price: 47.50, cost: 16.00 },
            { label: 'L (大)', price: 68.50, cost: 24.00 }
        ],
        options: []
    },
    {
        id: 'E05',
        name: 'E05 酱蒸非洲鱼 (Taucu Tilapia)',
        category: 'E_SERIES',
        variants: [
            { label: 'S (小)', price: 47.50, cost: 16.00 },
            { label: 'L (大)', price: 68.50, cost: 24.00 }
        ],
        options: []
    },
    {
        id: 'E06',
        name: 'E06 亚参蒸非洲鱼 (Asam Steamed Tilapia)',
        category: 'E_SERIES',
        variants: [
            { label: 'S (小)', price: 47.50, cost: 16.00 },
            { label: 'L (大)', price: 68.50, cost: 24.00 }
        ],
        options: []
    },

    // --- F SERIES: 海鲜 ---
    {
        id: 'F01',
        name: 'F01 金香啦啦 (Kam Heong Lala)',
        category: 'F_SERIES',
        variants: [
            { label: 'S (小)', price: 27.00, cost: 9.50 },
            { label: 'M (中)', price: 41.00, cost: 14.50 },
            { label: 'L (大)', price: 54.50, cost: 19.00 }
        ],
        options: []
    },
    {
        id: 'F02',
        name: 'F02 上汤啦啦 (Lala Soup)',
        category: 'F_SERIES',
        variants: [
            { label: 'S (小)', price: 27.00, cost: 9.50 },
            { label: 'M (中)', price: 41.00, cost: 14.50 },
            { label: 'L (大)', price: 54.50, cost: 19.00 }
        ],
        options: []
    },
    {
        id: 'F03',
        name: 'F03 炸虾球 (Deep Fried Prawn)',
        category: 'F_SERIES',
        variants: [
            { label: 'S (小)', price: 27.00, cost: 9.50 },
            { label: 'M (中)', price: 41.00, cost: 14.50 },
            { label: 'L (大)', price: 54.50, cost: 19.00 }
        ],
        options: []
    },

    // --- G SERIES: 小吃与单点 ---
    {
        id: 'G01',
        name: 'G01 白灼苏东 (Boiled Sotong)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (小)', price: 27.00, cost: 9.50 },
            { label: 'M (中)', price: 41.00, cost: 14.50 },
            { label: 'L (大)', price: 54.50, cost: 19.00 }
        ],
        options: []
    },
    {
        id: 'G02',
        name: 'G02 炸苏东 (Fried Sotong)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (小)', price: 27.00, cost: 9.50 },
            { label: 'M (中)', price: 41.00, cost: 14.50 },
            { label: 'L (大)', price: 54.50, cost: 19.00 }
        ],
        options: []
    },
    {
        id: 'G03',
        name: 'G03 亚参苏东 (Asam Sotong)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (小)', price: 27.00, cost: 9.50 },
            { label: 'M (中)', price: 41.00, cost: 14.50 },
            { label: 'L (大)', price: 54.50, cost: 19.00 }
        ],
        options: []
    },
    {
        id: 'G04',
        name: 'G04 南乳花肉 (Fermented Curd Pork Belly)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (小)', price: 35.50, cost: 12.50 },
            { label: 'M (中)', price: 61.50, cost: 21.50 },
            { label: 'L (大)', price: 89.00, cost: 31.00 }
        ],
        options: []
    },
    {
        id: 'G05',
        name: 'G05 招牌豆腐 (Signature Tofu)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (6pcs)', price: 20.50, cost: 7.00 },
            { label: 'M (10pcs)', price: 34.00, cost: 12.00 },
            { label: 'L (14pcs)', price: 47.50, cost: 16.50 }
        ],
        options: []
    },
    {
        id: 'G06',
        name: 'G06 炸水饺 (Fried Dumplings)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (6pcs)', price: 21.50, cost: 7.50 },
            { label: 'M (9pcs)', price: 32.50, cost: 11.50 },
            { label: 'L (12pcs)', price: 43.50, cost: 15.00 }
        ],
        options: []
    },
    {
        id: 'G07',
        name: 'G07 炸鸡翅 (Fried Chicken Wings)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (对)', price: 12.00, cost: 4.50 }
        ],
        options: []
    },
    {
        id: 'G08',
        name: 'G08 炸鱼饼 (Fried Fish Cake)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (块)', price: 9.50, cost: 3.50 }
        ],
        options: []
    },
    {
        id: 'G09',
        name: 'G09 炸家乡春卷 (Fried Spring Rolls)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (条)', price: 19.50, cost: 7.00 }
        ],
        options: []
    },
    // Moved G10 to G_SERIES correctly
    {
        id: 'G10',
        name: 'G10 枕头年糕 (Fried Rice Cake)',
        category: 'G_SERIES',
        variants: [
            { label: 'S (小)', price: 10.50, cost: 3.50 }
        ],
        options: []
    },

    // --- H SERIES: 蔬菜 ---
    {
        id: 'H01',
        name: 'H01 清炒树苗 (Stir-fried Shu Miu)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 13.50, cost: 4.50 },
            { label: 'M (中)', price: 20.50, cost: 7.00 },
            { label: 'L (大)', price: 27.00, cost: 9.50 }
        ],
        options: []
    },
    {
        id: 'H02',
        name: 'H02 清炒油麦 (Stir-fried Yau Mak)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 13.50, cost: 4.50 },
            { label: 'M (中)', price: 20.50, cost: 7.00 },
            { label: 'L (大)', price: 27.00, cost: 9.50 }
        ],
        options: []
    },
    {
        id: 'H03',
        name: 'H03 清炒芥兰 (Stir-fried Kai Lan)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 13.50, cost: 4.50 },
            { label: 'M (中)', price: 20.50, cost: 7.00 },
            { label: 'L (大)', price: 27.00, cost: 9.50 }
        ],
        options: []
    },
    {
        id: 'H04',
        name: 'H04 清炒生菜 (Stir-fried Sang Choy)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 13.50, cost: 4.50 },
            { label: 'M (中)', price: 20.50, cost: 7.00 },
            { label: 'L (大)', price: 27.00, cost: 9.50 }
        ],
        options: []
    },
    {
        id: 'H05',
        name: 'H05 腐乳树苗 (Preserved Curd Shu Miu)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 16.00, cost: 5.50 },
            { label: 'M (中)', price: 24.50, cost: 8.50 },
            { label: 'L (大)', price: 31.50, cost: 11.00 }
        ],
        options: []
    },
    {
        id: 'H06',
        name: 'H06 腐乳油麦 (Preserved Curd Yau Mak)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 16.00, cost: 5.50 },
            { label: 'M (中)', price: 24.50, cost: 8.50 },
            { label: 'L (大)', price: 31.50, cost: 11.00 }
        ],
        options: []
    },
    {
        id: 'H07',
        name: 'H07 马来风光 (Ma Lai Fong Gung)',
        category: 'H_SERIES',
        variants: [
            { label: 'S (小)', price: 16.00, cost: 5.50 },
            { label: 'M (中)', price: 24.50, cost: 8.50 },
            { label: 'L (大)', price: 31.50, cost: 11.00 }
        ],
        options: []
    },

    // --- J SERIES: 果汁 ---
    {
        id: 'J01',
        name: 'J01 苹果 (Apple)',
        category: 'J_SERIES',
        variants: [
            { label: 'S', price: 8.00, cost: 2.50 },
            { label: 'M', price: 15.00, cost: 5.00 }
        ],
        options: ['少冰', '去冰']
    },
    {
        id: 'J02',
        name: 'J02 橙 (Orange)',
        category: 'J_SERIES',
        variants: [
            { label: 'S', price: 8.00, cost: 2.50 },
            { label: 'M', price: 15.00, cost: 5.00 }
        ],
        options: ['少冰', '去冰']
    },
    {
        id: 'J03',
        name: 'J03 萝卜奶 (Carrot Milk)',
        category: 'J_SERIES',
        variants: [
            { label: 'S', price: 9.50, cost: 3.50 },
            { label: 'M', price: 17.50, cost: 6.00 }
        ],
        options: ['少冰', '去冰']
    },
    {
        id: 'J04',
        name: 'J04 西瓜 (Watermelon)',
        category: 'J_SERIES',
        variants: [
            { label: 'S', price: 8.00, cost: 2.50 },
            { label: 'M', price: 15.00, cost: 5.00 }
        ],
        options: ['少冰', '去冰']
    },
    {
        id: 'J05',
        name: 'J05 吉仔酸梅 (Lime Plum)',
        category: 'J_SERIES',
        variants: [
            { label: 'S', price: 8.00, cost: 2.50 },
            { label: 'M', price: 15.00, cost: 5.00 }
        ],
        options: ['少冰', '去冰']
    },

    // --- K/L SERIES: 饮料 ---
    {
        id: 'K01',
        name: 'K01 蜂蜜酸梅桔 (Honey Lime)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 6.00, cost: 2.00 } ],
        options: ['热', '冰']
    },
    {
        id: 'K02',
        name: 'K02 菊花茶 (Chrysanthemum)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 4.00, cost: 1.50 } ],
        options: ['热', '冰']
    },
    {
        id: 'K03',
        name: 'K03 罗汉果 (Loh Han Guo)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 4.00, cost: 1.50 } ],
        options: ['热', '冰']
    },
    {
        id: 'K04',
        name: 'K04 薏米水 (Barley)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 3.50, cost: 1.20 } ],
        options: ['热', '冰']
    },
    {
        id: 'K05',
        name: 'K05 可口可乐 (Coca Cola)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 4.50, cost: 2.00 } ],
        options: []
    },
    {
        id: 'K06',
        name: 'K06 100号 (100 Plus)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 4.50, cost: 2.00 } ],
        options: []
    },
    {
        id: 'K07',
        name: 'K07 雪碧 (Sprite)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 4.50, cost: 2.00 } ],
        options: []
    },
    {
        id: 'K08',
        name: 'K08 中国茶 (Chinese Tea)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 1.00, cost: 0.30 } ],
        options: ['热', '冰']
    },
    {
        id: 'K09',
        name: 'K09 白开水 (Drinking Water)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 0.50, cost: 0.00 } ],
        options: ['热', '温', '冰']
    },
    {
        id: 'K10',
        name: 'K10 矿泉水 (Mineral Water)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 3.00, cost: 1.20 } ],
        options: []
    },
    {
        id: 'K11',
        name: 'K11 冰块 (Ice)',
        category: 'K_SERIES',
        variants: [ { label: 'S', price: 2.50, cost: 0.20 } ],
        options: []
    },
    // Tea Pots (L Series)
    {
        id: 'L1',
        name: 'L1 茶王 (Cha Wang)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 10.50, cost: 3.00 } ],
        options: ['2位以上每位加RM1.50']
    },
    {
        id: 'L2',
        name: 'L2 普洱 (Pu-Er)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 8.00, cost: 2.50 } ],
        options: ['2位以上每位加RM1.50']
    },
    {
        id: 'L3',
        name: 'L3 菊葆 (Ju-Bao)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 8.00, cost: 2.50 } ],
        options: ['2位以上每位加RM1.50']
    },
    {
        id: 'L4',
        name: 'L4 香片 (Jasmine)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 6.50, cost: 2.00 } ],
        options: ['2位以上每位加RM1.50']
    },
    {
        id: 'L5',
        name: 'L5 铁观音 (Tie Guan Yin)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 6.50, cost: 2.00 } ],
        options: ['2位以上每位加RM1.50']
    },
    {
        id: 'L6',
        name: 'L6 独树香 (Tork Shu Heong)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 6.50, cost: 2.00 } ],
        options: ['2位以上每位加RM1.50']
    },
    {
        id: 'L7',
        name: 'L7 自来茶 (Hot Water Pot)',
        category: 'K_SERIES',
        variants: [ { label: '壶 (Pot)', price: 4.00, cost: 0.00 } ],
        options: ['2位以上每位加RM1.00']
    }
];
