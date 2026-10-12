// ==========================================
// 📒 传统账目 (Classic P&L) — SKU 销售分类规则
// ------------------------------------------
// 用途：把 StoreHub「SKU 销售」报表的每一笔产品，归到会计要看的大类。
//
// ⚠️ 本档案刻意「不」依赖 constants/menu.ts。
//    原因：StoreHub 实际卖的 SKU（R / M / S / OJ / L / SET / BUFFET 等）
//    比系统菜单多，用菜单比对会漏掉一堆。这里用「前缀 + 数字范围」判断，
//    以后 StoreHub 加新品也不会漏。
//
// 🔧 要改分类？只改这个档案，不用碰其他程式。
// ==========================================

/** 销售大类 ID */
export type SalesCategoryId =
    | 'MEE'
    | 'RICE'
    | 'VEGETABLE'
    | 'FISH'
    | 'PRAWN'
    | 'SOTONG'
    | 'LALA'
    | 'SEAFOOD_PROCESSED'
    | 'MEAT_WOK'
    | 'HQ_DISHES'
    | 'SET'
    | 'BUFFET'
    | 'JUICE'
    | 'TEA'
    | 'CANNED'
    | 'REFRESHMENT'
    | 'BEER'
    | 'OTHERS'
    | 'UNCLASSIFIED';

export const SALES_CATEGORY_LABELS: Record<SalesCategoryId, { zh: string; en: string }> = {
    MEE:          { zh: '面类',        en: 'MEE' },
    RICE:         { zh: '饭类',        en: 'RICE' },
    VEGETABLE:    { zh: '蔬菜',        en: 'VEGETABLE' },
    FISH:              { zh: '鱼类',        en: 'FISH' },
    PRAWN:             { zh: '虾类',        en: 'PRAWN' },
    SOTONG:            { zh: '苏东',        en: 'SOTONG' },
    LALA:              { zh: '啦啦',        en: 'LALA' },
    SEAFOOD_PROCESSED: { zh: '海鲜加工品',   en: 'SEAFOOD PROCESSED' },
    MEAT_WOK:     { zh: '大炒 & 肉类', en: 'MEAT & WOK' },
    HQ_DISHES:    { zh: '总店菜式',    en: 'HQ DISHES' },
    SET:          { zh: '套餐',        en: 'SET' },
    BUFFET:       { zh: '自助餐',      en: 'BUFFET' },
    JUICE:        { zh: '果汁',        en: 'JUICE' },
    TEA:          { zh: '茶',          en: 'TEA' },
    CANNED:       { zh: '罐装水',      en: 'CANNED' },
    REFRESHMENT:  { zh: '饮料',        en: 'REFRESHMENT' },
    BEER:         { zh: '啤酒',        en: 'BEER' },
    OTHERS:       { zh: '其他',        en: 'OTHERS' },
    UNCLASSIFIED: { zh: '未归类 ⚠️',   en: 'UNCLASSIFIED' },
};

// ==========================================
// 1️⃣ SKU 前缀规则
// ------------------------------------------
// prefix: SKU 开头字母 (大写)
// range:  数字范围 [起, 迄]，null = 该前缀不分范围，全归同一类
// ==========================================
export interface PrefixRule {
    prefix: string;
    range: [number, number] | null;
    category: SalesCategoryId;
}

export const SKU_PREFIX_RULES: PrefixRule[] = [
    // --- 面类：A 系列(招牌炭炒) + C 系列(特色面食) ---
    { prefix: 'A',  range: null, category: 'MEE' },
    { prefix: 'C',  range: null, category: 'MEE' },   // 含 C10 扣肉米粉、C03S

    // --- 饭类：D 系列(炒饭) + R 系列(单座饭) ---
    { prefix: 'D',  range: null, category: 'RICE' },
    { prefix: 'R',  range: null, category: 'RICE' },

    // --- 蔬菜：H 系列 ---
    { prefix: 'H',  range: null, category: 'VEGETABLE' },

    // --- 鱼类：E 系列(非洲鱼) ---
    { prefix: 'E',  range: null,      category: 'FISH' },

    // --- Lala 贝类：F01 金香啦啦、F02 上汤啦啦 ---
    { prefix: 'F',  range: [1, 2],    category: 'LALA' },

    // --- 虾类：F03 炸虾球 ---
    { prefix: 'F',  range: [3, 99],   category: 'PRAWN' },

    // --- Sotong：G01-G03(白灼/酥炸/亚参苏东) + G12(泰式苏东) ---
    { prefix: 'G',  range: [1, 3],    category: 'SOTONG' },
    { prefix: 'G',  range: [12, 12],  category: 'SOTONG' },

    // --- 海鲜加工品：G08 炸鱼饼 ---
    { prefix: 'G',  range: [8, 8],    category: 'SEAFOOD_PROCESSED' },

    // --- 总店菜式：从总店进货的半成品 ---
    // G05 家乡豆腐、G06 炸水饺、G09 炸春卷、G10 枕头年糕、G11 泰式家乡豆腐
    { prefix: 'G',  range: [5, 6],    category: 'HQ_DISHES' },
    { prefix: 'G',  range: [9, 11],   category: 'HQ_DISHES' },

    // --- 大炒 & 肉类：G 其余 + M 系列 ---
    { prefix: 'G',  range: [4, 4],    category: 'MEAT_WOK' },   // G04 南乳花肉
    { prefix: 'G',  range: [7, 7],    category: 'MEAT_WOK' },   // G07 炸鸡翅
    { prefix: 'G',  range: [13, 99],  category: 'MEAT_WOK' },
    { prefix: 'M',  range: null,      category: 'MEAT_WOK' },

    // --- 果汁：J(果汁) + OJ(平台果汁) ---
    // ⚠️ OJ 必须排在 J 前面，否则 'OJ01' 会被 'J' 误抓 — 比对时用最长前缀优先
    { prefix: 'OJ', range: null, category: 'JUICE' },
    { prefix: 'J',  range: null, category: 'JUICE' },

    // --- 茶：L 系列(中国茶) + K08(中国茶) ---
    { prefix: 'L',  range: null,     category: 'TEA' },
    { prefix: 'K',  range: [8, 8],   category: 'TEA' },

    // --- 罐装水：只有 K05-K07（可乐 / 100Plus / 雪碧）---
    { prefix: 'K',  range: [5, 7],   category: 'CANNED' },

    // --- 饮料(水吧)：K01-K04(自制凉茶) + K09 起(白开水/矿泉水/其他) ---
    { prefix: 'K',  range: [1, 4],   category: 'REFRESHMENT' },
    { prefix: 'K',  range: [9, 99],  category: 'REFRESHMENT' },

    // --- 啤酒：S 系列 (S01 / S01A / S02 / S02A / S03 / S03A) ---
    { prefix: 'S',  range: null, category: 'BEER' },
];

// ==========================================
// 2️⃣ 整串 SKU 直接对应 (不走前缀规则)
// ==========================================
export const SKU_EXACT_RULES: Record<string, SalesCategoryId> = {
    'SET A': 'SET',
    'SET B': 'SET',
    'BUFFET': 'BUFFET',
};

// ==========================================
// 3️⃣ 杂项：没有 SKU 编号的产品，靠「产品名称」关键字归类
// ------------------------------------------
// StoreHub 有些行 SKU 编号 = N/A（白饭、加冰块、荷包蛋、人工费…）
// 依 keyword 比对产品名称（不分大小写、忽略空白）
// ⚠️ 由上往下比，第一个命中就停 — 顺序有意义
// ==========================================
interface KeywordRule {
    keywords: string[];
    category: SalesCategoryId;
    note: string;
}

export const NAME_KEYWORD_RULES: KeywordRule[] = [
    { keywords: ['BUFFET', '自助餐'],                    category: 'BUFFET',      note: '自助餐（SKU 栏可能是空的，靠名称抓）' },
    { keywords: ['SET A', 'SET B', '套餐'],              category: 'SET',         note: '套餐（SKU 栏空白时靠名称抓）' },
    { keywords: ['白饭', 'RICE (BOWL)', 'RICE (DISH)'], category: 'RICE',        note: '白饭（碗/碟）' },
    { keywords: ['加冰块', 'ADD ICE'],                   category: 'REFRESHMENT', note: '加冰块' },
    { keywords: ['免费茶', 'CHINESE TEA'],               category: 'TEA',         note: '免费茶（金额通常为 0）' },
    { keywords: ['荷包蛋', 'FRIED EGG'],                category: 'MEAT_WOK',    note: '荷包蛋' },
    // 啤酒：S 系列前缀抓不到时（SKU 空白、名称也没写 S01）靠品牌名兜底
    { keywords: ['CARLSBERG', 'GUINESS', 'GUINNESS', 'HEINEKEN', 'TIGER BEER', '虎牌', 'SKOL', '啤酒'],
      category: 'BEER', note: '啤酒品牌名兜底 —— S 系列 SKU 抓不到时用（含三只装等无编号品项）。刻意不放单独的 TIGER / ANCHOR，会误抓「TIGER PRAWN 虎虾」' },
    { keywords: ['人工费', 'WORK FEE'],                 category: 'OTHERS',      note: '人工费' },
    { keywords: ['DELIVERY FEE', '外卖费'],             category: 'OTHERS',      note: '外卖费' },
    { keywords: ['TAKE AWAY FEE', '打包费'],            category: 'OTHERS',      note: '打包费' },
    { keywords: ['OFFER'],                              category: 'OTHERS',      note: '促销项（金额通常为 0）' },
    { keywords: ['COMBO A', 'COMBO B'],                 category: 'SET',         note: '套餐子项（金额为 0，不会重复计）' },
];

// ==========================================
// 4️⃣ 报表分组 — 对方（会计）看的版面
// ------------------------------------------
// SIMPLE   = 简易版：SHOP LOT 只显示 MEE / RICE / FOOD 三行
// DETAILED = 详细版：SHOP LOT 显示 5 行细分
// 两版的 Refreshment、Beer 都独立成行
// SET 依你的决定，并进 SHOP LOT SALES
// ==========================================
export interface ReportGroup {
    id: string;
    label: string;
    /** 组成这一行的大类 */
    members: SalesCategoryId[];
    /** 属于 SHOP LOT SALES 底下，还是同级独立行 */
    underShopLot: boolean;
    /**
     * 细分子项（只在细分模式显示）。
     * 子项金额加起来必须等于父项，否则合计会对不上。
     */
    children?: { id: string; label: string; members: SalesCategoryId[]; note?: string }[];
}

export const REPORT_GROUPS_SIMPLE: ReportGroup[] = [
    { id: 'MEE',         label: 'MEE (面类)',         members: ['MEE'],  underShopLot: true },
    { id: 'RICE',        label: 'RICE (饭类)',        members: ['RICE'], underShopLot: true },
    { id: 'FOOD',        label: 'FOOD (其他菜式)',     members: ['VEGETABLE', 'FISH', 'PRAWN', 'SOTONG', 'LALA', 'SEAFOOD_PROCESSED', 'MEAT_WOK', 'HQ_DISHES', 'SET', 'OTHERS', 'UNCLASSIFIED'], underShopLot: true },
    { id: 'BUFFET',      label: 'BUFFET (自助餐)',     members: ['BUFFET'], underShopLot: true },
    { id: 'REFRESHMENT', label: 'REFRESHMENT (饮料)',  members: ['JUICE', 'TEA', 'CANNED', 'REFRESHMENT'], underShopLot: false },
    { id: 'BEER',        label: 'BEER (酒)',           members: ['BEER'],        underShopLot: false },
];

export const REPORT_GROUPS_DETAILED: ReportGroup[] = [
    { id: 'MEE',         label: 'MEE (面类)',           members: ['MEE'],       underShopLot: true },
    { id: 'RICE',        label: 'RICE (饭类)',          members: ['RICE'],      underShopLot: true },
    { id: 'VEGETABLE',   label: 'VEGETABLE (蔬菜)',     members: ['VEGETABLE'], underShopLot: true },
    { id: 'SEAFOOD',     label: 'SEAFOOD (海鲜)',       members: ['FISH', 'PRAWN', 'SOTONG', 'LALA', 'SEAFOOD_PROCESSED'], underShopLot: true },
    { id: 'MEAT_WOK',    label: 'MEAT & WOK (大炒肉类)', members: ['MEAT_WOK'],  underShopLot: true },
    { id: 'HQ_DISHES',   label: 'HQ DISHES (总店菜式)',  members: ['HQ_DISHES'], underShopLot: true },
    { id: 'SET',         label: 'SET (套餐)',           members: ['SET'],       underShopLot: true },
    { id: 'BUFFET',      label: 'BUFFET (自助餐)',       members: ['BUFFET'],    underShopLot: true },
    { id: 'OTHERS',      label: 'OTHERS (其他)',        members: ['OTHERS', 'UNCLASSIFIED'], underShopLot: true },
    {
        id: 'REFRESHMENT', label: 'REFRESHMENT (饮料)',
        members: ['JUICE', 'TEA', 'CANNED', 'REFRESHMENT'], underShopLot: false,
        children: [
            { id: 'JUICE',      label: 'JUICE (果汁)',      members: ['JUICE'] },
            { id: 'TEA',        label: 'TEA (茶)',          members: ['TEA'] },
            { id: 'CANNED',     label: 'CANNED (罐装水)',   members: ['CANNED'] },
            { id: 'REF_OTHERS', label: '其他 (Others)',      members: ['REFRESHMENT'], note: '2026-08 之前 StoreHub 还没分类，果汁/茶/罐装水会全部落在这里' },
        ],
    },
    { id: 'BEER',        label: 'BEER (酒)',            members: ['BEER'],        underShopLot: false },
];

// ==========================================
// 5️⃣ 付款方式 → 渠道
// ------------------------------------------
// StoreHub「付款方式销售」报表用来把平台单和店内单分开。
// 比对不分大小写、忽略空白。
// ==========================================
export const PLATFORM_PAYMENT_METHODS: Record<string, 'GRAB' | 'SHOPEE' | 'PANDA'> = {
    'GRAB': 'GRAB',
    'GRABFOOD': 'GRAB',
    'SHOPEE': 'SHOPEE',
    'SHOPEEFOOD': 'SHOPEE',
    'FOODPANDA': 'PANDA',
    'FOOD PANDA': 'PANDA',
    'PANDA': 'PANDA',
};
