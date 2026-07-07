import { ExpenseItem, MarketingSubCategory, AdChannel, MARKETING_SUBCAT_LABELS, AD_CHANNEL_LABELS } from '../../../types';

export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
            const { data, ts } = JSON.parse(raw);
            if (Date.now() - ts < CACHE_TTL) return data as T;
        }
    } catch {}
    const fresh = await fetcher();
    try {
        sessionStorage.setItem(key, JSON.stringify({ data: fresh, ts: Date.now() }));
    } catch {}
    return fresh;
}

export function getGoogleDriveEmbedUrl(url: string | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    
    const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (fileDMatch && fileDMatch[1]) {
        return `https://drive.google.com/file/d/${fileDMatch[1]}/preview`;
    }
    
    const queryIdMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (queryIdMatch && queryIdMatch[1]) {
        return `https://drive.google.com/file/d/${queryIdMatch[1]}/preview`;
    }
    
    if (trimmed.includes('/preview')) {
        return trimmed;
    }
    
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    
    return null;
}

export const ACCOUNTING_CATEGORIES: Record<string, { label: string, options: {id: string, label: string}[] }> = {
    'COGS (销货成本 - 随销量浮动)': {
        label: 'COGS (Cost of Goods Sold)',
        options: [
            { id: 'INGREDIENT_HQ', label: '食材-总店 (HQ Ingredients)' },
            { id: 'INGREDIENT_MEAT', label: '食材-肉类 (Meat)' },
            { id: 'INGREDIENT_SEAFOOD', label: '食材-海鲜 (Seafood)' },
            { id: 'INGREDIENT_VEG', label: '食材-蔬果 (Veg/Fruit)' },
            { id: 'INGREDIENT_DRY', label: '食材-干货 (Dry Goods)' },
            { id: 'INGREDIENT_SAUCE', label: '食材-酱料 (Sauce)' },
            { id: 'INGREDIENT_EGG', label: '食材-蛋类 (Egg)' },
            { id: 'INGREDIENT_NOODLE', label: '食材-面类 (Noodle)' },
            { id: 'BEVERAGE', label: '水吧 (Beverage)' },
            { id: 'INGREDIENT_ICE', label: '食材-冰块 (Ice)' },
            { id: 'PACKAGING', label: '包装材料 (Packaging)' },
            { id: 'GAS_COGS', label: '烹饪煤气 (Cooking Gas)' },
            { id: 'CHARCOAL', label: '火炭 (Charcoal)' },
            { id: 'SUPPLIER', label: '一般进货 (General)' }
        ]
    },
    'OPEX (营运开支 - 固定/半固定)': {
        label: 'OPEX (Operating Expenses)',
        options: [
            { id: 'RENT', label: '租金 (Rent)' },
            { id: 'UTILITIES', label: '水电费 (Utilities)' },
            { id: 'SALARY', label: '薪资 (Salary)' },
            { id: 'STAFF_MEAL', label: '员工餐 (Staff Meal)' }, 
            { id: 'MAINTENANCE', label: '维修/保养/清洁 (Maintenance)' },
            { id: 'MARKETING', label: '营销广告 (Marketing)' },
            { id: 'ADVERTISING', label: '广告与推广 (Advertising & Promotion)' },
            { id: 'IT_SOFTWARE', label: '软件与信息技术 (IT & Software)' },
            { id: 'PROFESSIONAL', label: '专业服务/律师 (Professional/Legal)' },
            { id: 'SUPPLIES', label: '杂项耗材 (Supplies - Cleaning/Office)' },
            { id: 'LICENSE', label: '执照/订阅 (License/Sub)' },
            { id: 'LOGISTICS', label: '物流运输 (Logistics)' },
            { id: 'DELIVERY_GRAB', label: '外卖及接送费 (Delivery/Grab/Transport)' }
        ]
    },
    'CAPEX (资本支出 - 资产增加)': {
        label: 'CAPEX (Capital Expenditure)',
        options: [
            { id: 'EQUIPMENT', label: '设备采购 (Equipment)' },
            { id: 'RENOVATION', label: '装修工程 (Renovation)' },
            { id: 'DEPOSIT', label: '押金 (Deposit)' }
        ]
    }
};

export const FLAT_CATEGORIES = Object.values(ACCOUNTING_CATEGORIES).flatMap(g => g.options);

export const getParticularsOptions = (
    bill: Partial<ExpenseItem>
): { label: string; value: string }[] => {
    const time      = bill.time || new Date().toISOString();
    const category  = bill.category || '';
    const monthYear = new Date(time).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
    const shortDate = time.split('T')[0];

    if (category === 'BEVERAGE') {
        return [
            { label: '水果', value: `Fruits - Beverage ingredients (${shortDate})` },
            { label: '罐装饮料', value: `Canned Drinks - Beverage supply (${shortDate})` },
            { label: '酒类', value: `Alcoholic Beverages - Bar replenishment (${shortDate})` },
            { label: '茶类', value: `Teas - Premium tea leaves supply (${shortDate})` },
            { label: '凉茶原料', value: `Herbal Tea - Traditional brewing ingredients (${shortDate})` },
            { label: '美禄/咖啡粉', value: `Powder Mixes (Milo/Coffee) - Beverage replenishment (${shortDate})` },
            { label: '炼奶/淡奶', value: `Dairy supply (Milk/Creamer) - Beverage ingredients (${shortDate})` },
            { label: '其他原料', value: `Other Bar ingredients - Beverage supply (${shortDate})` },
        ];
    }

    if (category === 'INGREDIENT_SEAFOOD') {
        return [
            { label: '鱼类 (Fish)', value: `Fish - Seafood purchase (${shortDate})` },
            { label: '虾类 (Prawn)', value: `Prawn - Seafood purchase (${shortDate})` },
            { label: 'Sotong (苏东)', value: `Sotong (Squid) - Seafood purchase (${shortDate})` },
            { label: 'Lala (螺贝类)', value: `Lala (Shellfish) - Seafood purchase (${shortDate})` },
            { label: '虾和Sotong Combo', value: `Prawn & Sotong - Seafood purchase (${shortDate})` },
            { label: '加工品 (Processed)', value: `Processed Seafood - Seafood purchase (${shortDate})` },
        ];
    }

    if (category === 'MARKETING') {
        const sub      = bill.marketingSubCategory;
        const channel  = bill.adChannel;
        const campaign = (bill.campaignTag || '').trim();
        const camp     = campaign ? ` - ${campaign}` : '';

        if (sub === 'AD_OUTPUT' && channel) {
            const ch = AD_CHANNEL_LABELS[channel];
            return [
                { label: '推广费',    value: `Advertising expense - ${ch} (${shortDate})` },
                { label: '广告投放',  value: `Paid ad placement via ${ch}${camp}` },
                { label: `${ch}广告`, value: `${ch} Advertising${camp} (${monthYear})` },
            ];
        }
        if (sub) {
            const subLabel = MARKETING_SUBCAT_LABELS[sub];
            return [
                { label: '推广',     value: `Promotional expense (${shortDate})` },
                { label: '营销活动', value: campaign ? `Marketing campaign: ${campaign}` : `Marketing activity (${monthYear})` },
                { label: subLabel,   value: `${subLabel}${camp} (${monthYear})` },
            ];
        }
        return [
            { label: '推广',   value: `Promotional activity (${shortDate})` },
            { label: '广告',   value: `Advertising materials (${shortDate})` },
            { label: '营销费', value: `Marketing & Advertising${camp} (${monthYear})` },
        ];
    }

    const MAP: Record<string, [string, string, string, string, string, string]> = {
        INGREDIENT_HQ:     ['月度采购', `Purchase of HQ Ingredients (${monthYear})`,      '总店食材',  'HQ kitchen ingredients supply',  '原材料',   `Raw materials - HQ (${shortDate})`],
        INGREDIENT_MEAT:   ['月度采购', `Purchase of Meat Supply (${monthYear})`,         '猪/牛/鸡肉', 'Meat & poultry supply',          '新鲜肉类', `Fresh meat purchase (${shortDate})`],
        INGREDIENT_SEAFOOD:['月度采购', `Purchase of Seafood (${monthYear})`,              '新鲜海鲜',  'Fresh seafood supply',            '水产',     `Seafood ingredients (${shortDate})`],
        INGREDIENT_VEG:    ['月度采购', `Purchase of Vegetables & Fruits (${monthYear})`, '蔬果',      'Fresh produce supply',            '时令蔬菜', `Seasonal vegetables (${shortDate})`],
        INGREDIENT_DRY:    ['月度采购', `Purchase of Dry Goods (${monthYear})`,            '干货/杂货', 'Dry goods & provisions',          '干料',     `Dry ingredients (${shortDate})`],
        INGREDIENT_SAUCE:  ['月度采购', `Purchase of Sauces & Condiments (${monthYear})`, '酱料/调味', 'Sauce & seasoning supply',        '调味品',   `Condiments purchase (${shortDate})`],
        INGREDIENT_EGG:    ['月度采购', `Purchase of Eggs (${monthYear})`,                '鸡蛋',      'Egg supply',                      '新鲜鸡蛋', `Fresh eggs (${shortDate})`],
        INGREDIENT_NOODLE: ['月度采购', `Purchase of Noodles (${monthYear})`,             '面类',      'Noodle supply',                   '鲜面/干面', `Fresh & dried noodles (${shortDate})`],
        BEVERAGE:          ['月度采购', `Purchase of Beverage Supplies (${monthYear})`,   '饮料/水吧', 'Drinks & beverage ingredients',   '水吧原料', `Bar raw materials (${shortDate})`],
        INGREDIENT_ICE:    ['冰块采购', `Purchase of Ice Supplies (${monthYear})`,        '冰块',      'Ice supply & delivery',           '食用冰',   `Ice replenishment (${shortDate})`],
        PACKAGING:         ['月度采购', `Purchase of Packaging Materials (${monthYear})`, '打包盒/袋', 'Takeaway packaging supply',       '包装耗材', `Packing materials (${shortDate})`],
        GAS_COGS:          ['煤气充值', `Cooking Gas (LPG) Refill (${monthYear})`,        '气瓶',      'Gas cylinder supply',             '液化气',   `LPG refill (${shortDate})`],
        CHARCOAL:          ['月度采购', `Charcoal Supply (${monthYear})`,                 '烧炭',      'BBQ charcoal purchase',           '木炭补货', `Charcoal replenishment (${shortDate})`],
        SUPPLIER:          ['一般进货', `General supply purchase (${monthYear})`,         '货品',      'Goods & materials',               '采购',     `General procurement (${shortDate})`],
        RENT:              ['月租金',   `Monthly Rental Payment (${monthYear})`,          '场地租金',  'Premise rental',                  '租约',     `Tenancy rent (${monthYear})`],
        UTILITIES:         ['水电费',   `Utilities Bill (${monthYear})`,                  'TNB/水',    'Water & electricity charges',     '公用事业', `Utilities payment (${shortDate})`],
        SALARY:            ['月薪',     `Staff Salary (${monthYear})`,                    '工资',      'Payroll disbursement',            '薪酬',     `Monthly wages (${monthYear})`],
        STAFF_MEAL:        ['员工餐',   `Staff Meal Allowance (${monthYear})`,            '员工伙食',  'Employee meal subsidy',           '工作餐',   `Staff food (${monthYear})`],
        MAINTENANCE:       ['维修费',   `Maintenance & Repair (${shortDate})`,            '保养',      'Equipment servicing',             '清洁/保洁', `Cleaning & upkeep (${shortDate})`],
        PROFESSIONAL:      ['专业费',   `Professional / Legal Fees (${shortDate})`,       '顾问费',    'Consultancy fees',                '法律服务', `Legal & advisory (${shortDate})`],
        SUPPLIES:          ['杂项耗材', `Sundry Supplies (${monthYear})`,                 '清洁用品',  'Cleaning & office supplies',      '文具/杂品', `Miscellaneous consumables (${shortDate})`],
        LICENSE:           ['执照费',   `License & Subscription (${monthYear})`,          '年度执照',  'Annual license fee',              '订阅费',   'Software / service subscription'],
        ADVERTISING:       ['推广费',   `Advertising & Promotion (${monthYear})`,         '广告投放',  'Advertising & promotional campaign','宣传材料', `Promotional materials (${shortDate})`],
        IT_SOFTWARE:       ['软件费',   `IT & Software Subscription (${monthYear})`,       '系统维护',  'IT service & software licensing',   '软件授权', `Software & IT service (${shortDate})`],
        LOGISTICS:         ['运费',     `Logistics & Delivery (${monthYear})`,            '快递',      'Courier & freight charges',       '运输',     `Transportation charges (${shortDate})`],
        DELIVERY_GRAB:     ['外卖接送', `Delivery & Staff Ride Hailing (${monthYear})`,   '载员工车费', 'Grab Delivery & Ride Hailing',     '外卖接送', `Staff ride/delivery (${shortDate})`],
        EQUIPMENT:         ['设备采购', `Equipment Purchase (${shortDate})`,              '厨具',      'Kitchen equipment',               '机器/工具', `Machinery & tools (${shortDate})`],
        RENOVATION:        ['装修工程', `Renovation Works (${shortDate})`,                '改建',      'Premises improvement works',      '施工',     'Construction / fitting works'],
        DEPOSIT:           ['押金',     `Security Deposit (${shortDate})`,                '租金押金',  'Rental security deposit',         '可退押金', 'Refundable deposit'],
    };

    const row = MAP[category];
    if (!row) return [
        { label: category,   value: `Purchase - ${category} (${shortDate})` },
        { label: '一般付款', value: `General payment (${shortDate})` },
        { label: '默认',     value: `Payment for goods/services (${monthYear})` },
    ];
    return [
        { label: row[4], value: row[5] },
        { label: row[2], value: row[3] },
        { label: row[0], value: row[1] },
    ];
};

export const TABS = [
    { id: 'UNPAID', label: '未付 (Unpaid)', color: 'text-red-600 border-red-600 bg-red-50' },
    { id: 'PAID', label: '已付 (Paid)', color: 'text-green-600 border-green-600 bg-green-50' },
    { id: 'ALL', label: '全部 (All)', color: 'text-gray-800 border-gray-800 bg-gray-100' }
];

export const getQuickDateRange = (type: 'TODAY' | 'YESTERDAY' | 'LAST_MONTH' | 'THIS_MONTH') => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    if (type === 'TODAY') {} 
    else if (type === 'YESTERDAY') { start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); } 
    else if (type === 'THIS_MONTH') { start.setDate(1); end.setMonth(end.getMonth() + 1); end.setDate(0); } 
    else if (type === 'LAST_MONTH') { start.setDate(1); start.setMonth(start.getMonth() - 1); end.setDate(0); }
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
};
