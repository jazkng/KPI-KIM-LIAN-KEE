// ==========================================
// 📒 传统账目 (Classic P&L) — 成本科目映射
// ------------------------------------------
// 用途：把系统里的支出分类 (catKey)，映射到会计习惯看的传统科目。
//
// 🔧 要改哪个分类归到哪一行？只改这个档案的 sources 阵列。
// ⚠️ 每个 catKey 只能出现在一个科目里，否则会重复计算。
//    档案最下方有 validateCostMap() 可以自我检查。
// ==========================================

export type ClassicCostSection = 'COST' | 'PERSONAL' | 'SELLING' | 'OPERATION' | 'CAPEX';

export interface ClassicCostLine {
    id: string;
    /** 照你 XLSX 的写法 */
    label: string;
    section: ClassicCostSection;
    /** 对应系统里的支出分类 key (catKey)，大写 */
    sources: string[];
    /** 备注，会显示在画面上的问号提示 */
    note?: string;
    /** true = 这行有问题要注意（留空、映射不完整、与系统归类冲突），画面会标 ⚠ */
    warn?: boolean;
    /**
     * 子行：切到「细分模式」时展开显示。
     * ⚠️ 子行是父行的「拆解」，金额不另外加进小计，不会重复算。
     * 子行的 sources 加起来应该等于父行的 sources。
     */
    children?: Array<{ id: string; label: string; sources: string[]; note?: string }>;
}

export const CLASSIC_COST_LINES: ClassicCostLine[] = [
    // ==========================================
    // COST（进货成本 COGS）
    // ==========================================
    {
        id: 'MEAT', label: 'MEAT (肉类 + 干货)', section: 'COST',
        sources: ['INGREDIENT_MEAT', 'INGREDIENT_DRY'],
        note: '肉类和干货一起算，不再细分 —— 干货用在哪道菜分不出来。',
    },
    {
        id: 'SEAFOOD', label: 'SEAFOOD (海鲜合计)', section: 'COST',
        sources: [
            'INGREDIENT_FISH', 'INGREDIENT_PRAWN', 'INGREDIENT_SOTONG',
            'INGREDIENT_LALA', 'INGREDIENT_SEAFOOD_PROCESSED', 'INGREDIENT_SEAFOOD',
        ],
        note: '五类海鲜的合计。切到「细分模式」可展开各类；毛利率见下方「品类毛利」区块。',
        children: [
            { id: 'SEAFOOD_FISH',      label: '鱼类 (Fish)',            sources: ['INGREDIENT_FISH'],   note: '对应销售端 E01–E09 非洲鱼（8 种做法）' },
            { id: 'SEAFOOD_PRAWN',     label: '虾/生虾类 (Prawn)',      sources: ['INGREDIENT_PRAWN'],  note: '对应 F03 炸虾球' },
            { id: 'SEAFOOD_SOTONG',    label: '苏东 (Sotong)',          sources: ['INGREDIENT_SOTONG'], note: '对应 G01–G03、G12' },
            { id: 'SEAFOOD_LALA',      label: '啦啦 (Lala)',            sources: ['INGREDIENT_LALA'],   note: '对应 F01 金香啦啦、F02 上汤啦啦' },
            { id: 'SEAFOOD_PROCESSED', label: '海鲜加工品 (Processed)',  sources: ['INGREDIENT_SEAFOOD_PROCESSED'], note: '对应 G08 炸鱼饼' },
            { id: 'SEAFOOD_OTHERS',    label: '海鲜-其他 (Others)',      sources: ['INGREDIENT_SEAFOOD'], note: '旧账单没填细分的会落在这里' },
        ],
    },
    {
        id: 'INGREDIENTS', label: 'INGREDIENTS', section: 'COST',
        sources: [
            'INGREDIENT_NOODLE', 'INGREDIENT_EGG', 'INGREDIENT_SAUCE',
            'INGREDIENT_FROZEN', 'SUPPLIER', 'GENERAL',
        ],
        note: '合计模式只显示一行；细分模式拆成面类 / 蛋类 / 酱料 / 其他。⚠️ 干货已改归 MEAT、冰块归 REFRESHMENT、食用油归燃料',
        children: [
            { id: 'ING_NOODLE', label: '面类 (Noodle)',  sources: ['INGREDIENT_NOODLE'] },
            { id: 'ING_EGG',    label: '蛋类 (Egg)',     sources: ['INGREDIENT_EGG'] },
            { id: 'ING_SAUCE',  label: '酱料 (Sauce)',   sources: ['INGREDIENT_SAUCE'] },
            { id: 'ING_OTHERS', label: '其他 (Others)',  sources: ['INGREDIENT_FROZEN', 'SUPPLIER', 'GENERAL'], note: '冷冻品、一般进货 —— 没细分科目的账单会落在这里' },
        ],
    },
    {
        id: 'PROCESSING_HQ', label: 'PROCESSING FOOD (HQ / 总店菜式)', section: 'COST',
        sources: ['INGREDIENT_HQ', 'SUPPLIER_HQ'],
        note: '总店进的半成品。对应销售端「总店菜式」：家乡豆腐、炸水饺、春卷、年糕',
    },
    {
        id: 'VEGETABLE', label: 'VEGETABLE', section: 'COST',
        sources: ['INGREDIENT_VEG'],
    },
    // --- 水吧：合计一行「REFRESHMENT」，细分才拆成茶 / 罐装水 / 水果 / 其他 / 冰块 ---
    //     酒单独一行，不并进 REFRESHMENT。
    {
        id: 'REFRESHMENT_COST', label: 'REFRESHMENT (饮料/水吧)', section: 'COST',
        sources: ['BEVERAGE_TEA', 'BEVERAGE_CANNED', 'INGREDIENT_FRUIT', 'BEVERAGE', 'INGREDIENT_ICE'],
        note: '水吧原料合计。细分模式拆成茶 / 罐装水 / 水果 / 其他 / 冰块。酒另立一行。',
        children: [
            { id: 'REF_TEA',    label: '茶 (Tea)',                 sources: ['BEVERAGE_TEA'],      note: '对应销售端 L 系列与 K08 中国茶' },
            { id: 'REF_CANNED', label: '罐装水 (Canned)',           sources: ['BEVERAGE_CANNED'],   note: '对应销售端 K05–K07（可乐 / 100Plus / 雪碧）' },
            { id: 'REF_FRUIT',  label: '水果 / 果汁原料 (Fruit)',    sources: ['INGREDIENT_FRUIT'],  note: '⚠️ 同时含厨房用的水果；2026-08 前记在「食材-蔬果」的水果仍留在 VEGETABLE' },
            { id: 'REF_OTHERS', label: '其他 (Others)',             sources: ['BEVERAGE'],          note: '凉茶料、冲调粉、炼奶等。对应销售端 K01–K04 与 K09 起的水' },
            { id: 'REF_ICE',    label: '冰块 (Ice)',                sources: ['INGREDIENT_ICE'] },
        ],
    },
    {
        id: 'ALCOHOL_COST', label: 'ALCOHOL (酒)', section: 'COST',
        sources: ['BEVERAGE_ALCOHOL'],
        note: '对应销售端的 S 系列（Carlsberg / Tiger / Guiness）',
    },
    {
        id: 'GAS', label: '燃料 (Fuel)', section: 'COST',
        sources: ['GAS_COGS', 'CHARCOAL', 'INGREDIENT_OIL'],
        note: '天然气 + 碳 + 食用油。合计模式只显示「燃料」一行，细分模式才拆成三项',
        children: [
            { id: 'FUEL_GAS', label: '天然气 (Gas)', sources: ['GAS_COGS'], note: '烹饪煤气 / LPG 气瓶' },
            { id: 'FUEL_CHARCOAL', label: '碳 (Charcoal)', sources: ['CHARCOAL'], note: '烧炭 / 木炭' },
            { id: 'FUEL_OIL', label: '油 (Cooking Oil)', sources: ['INGREDIENT_OIL'], note: '食用油。2026-08 之前记在「一般进货」的油钱不会自动搬过来' },
        ],
    },
    {
        id: 'PACKAGING', label: 'PACKAGING', section: 'COST',
        sources: ['PACKAGING'],
    },

    // ==========================================
    // PERSONAL EXPENSES（人事）
    // ==========================================
    {
        id: 'LABOUR_CHARGES', label: 'LABOUR CHARGES', section: 'PERSONAL',
        sources: ['SALARY', 'PAYROLL', 'STAFF_ADVANCE', 'STAFF_MEAL', 'ALLOWANCE', 'COMMISSION'],
        note: '薪资、预支、员工餐、津贴。缴给政府的 EPF/SOCSO/EIS/LINDUNG 已经独立成下面的 STATUTORY 一行，不重复算在这里。底下的部门明细来自薪资单 + 员工档案的 department 栏位，是这一行的拆解，不另外加总。',
    },
    {
        id: 'STATUTORY', label: 'STATUTORY (法定缴款)', section: 'PERSONAL',
        sources: ['EPF_SOCSO', 'EPF', 'SOCSO', 'EIS', 'LINDUNG', 'PCB'],
        note: '缴给政府的钱：EPF/KWSP、SOCSO/PERKESO、EIS、LINDUNG 24 Jam、PCB。以前这笔钱没有归属，在传统账目里等于凭空消失 —— 现在独立一行。金额来自薪资结算的「缴政府费用」。',
    },

    // ==========================================
    // OPERATION EXPENSES（营运开销）
    // ==========================================
    {
        // 📒 PLATFORM_COMM_* 这几个 key 不是支出单来的，
        //    是 FinancialReport 用「账面流水 − 净回款 − 广告费」算出来再补进 costByCategory 的。
        //    因为 SALES 那边列的是平台账面流水(Gross)，这边不列抽佣的话净利会被高估。
        //    广告费已经搬去 MARKETING & ADVERTISING，这里只留抽佣和交易手续费。
        id: 'PLATFORM_FEES', label: 'PLATFORM FEES', section: 'SELLING',
        sources: [
            'PLATFORM_COMM_GRAB', 'PLATFORM_COMM_PANDA', 'PLATFORM_COMM_SHOPEE',
            'PLATFORM_FEE', 'PLATFORM_FEE_GRAB', 'PLATFORM_FEE_PANDA', 'PLATFORM_FEE_SHOPEE', 'PLATFORM_FEE_OTHER', 'MARKETING_FEE',
        ],
        note: '平台从账面流水里抽走的佣金。抽佣 = 账面流水 − 净回款 − 广告费。',
        children: [
            { id: 'PF_GRAB_COMM',   label: '　Grab Commission',       sources: ['PLATFORM_COMM_GRAB'] },
            { id: 'PF_SHOPEE_COMM', label: '　ShopeeFood Commission', sources: ['PLATFORM_COMM_SHOPEE'] },
            { id: 'PF_PANDA_COMM',  label: '　FoodPanda Commission',  sources: ['PLATFORM_COMM_PANDA'] },
            { id: 'PF_TXN',         label: '　Payment / Transaction Fees',
              sources: ['PLATFORM_FEE', 'PLATFORM_FEE_GRAB', 'PLATFORM_FEE_PANDA', 'PLATFORM_FEE_SHOPEE', 'PLATFORM_FEE_OTHER', 'MARKETING_FEE'],
              note: '走支出单记的平台费用、调节费，含核对时自动记的平账费' },
        ],
    },

    {
        // 2026-09：搬到新的 SELLING & DISTRIBUTION EXPENSES 段，
        // 并且把三大平台的广告费也收进来（广告就是广告，放一起才看得出总共花多少推广）。
        id: 'MARKETING', label: 'MARKETING & ADVERTISING', section: 'SELLING',
        sources: ['MARKETING', 'ADVERTISING', 'PLATFORM_ADS_GRAB', 'PLATFORM_ADS_PANDA', 'PLATFORM_ADS_SHOPEE'],
        note: '所有推广花费：自家营销 + 三大平台的广告费',
        children: [
            { id: 'MKT_OWN',    label: '　自家营销推广',        sources: ['MARKETING', 'ADVERTISING'] },
            { id: 'MKT_GRAB',   label: '　Grab 广告费',        sources: ['PLATFORM_ADS_GRAB'] },
            { id: 'MKT_SHOPEE', label: '　ShopeeFood 广告费',  sources: ['PLATFORM_ADS_SHOPEE'] },
            { id: 'MKT_PANDA',  label: '　FoodPanda 广告费',   sources: ['PLATFORM_ADS_PANDA'] },
        ],
    },
    {
        id: 'RENTAL_SHOPLOT', label: 'RENTAL SHOPLOT', section: 'OPERATION',
        sources: ['RENT'],
    },
    {
        id: 'STAFF_HOSTEL', label: 'STAFF HOSTEL RENTAL', section: 'OPERATION',
        sources: ['STAFF_ACCOMMODATION', 'RENT_STAFF'],
        note: '员工宿舍的房租。在经常性支出选「宿舍租金」就会归到这里。⚠️ 系统把 STAFF_ACCOMMODATION 归在 LABOR（人事成本），这里照你 XLSX 放在 OPERATION，所以它不会同时出现在 LABOUR CHARGES。',
        warn: true,
    },
    {
        id: 'UTILITIES_SHOP', label: 'UTINITY CHARGES SHOP LOT', section: 'OPERATION',
        sources: ['UTILITIES', 'UTILITIES_ELECTRIC', 'UTILITIES_WATER', 'UTILITIES_GAS', 'ELECTRICITY', 'WATER', 'INTERNET'],
        note: '水、电、管道煤气、网络电话',
    },
    {
        id: 'UTILITIES_STAFF', label: 'UTINITY CHARGES STAFF', section: 'OPERATION',
        sources: ['UTILITIES_ELECTRIC_STAFF', 'UTILITIES_WATER_STAFF'],
        note: '员工宿舍的独立电表/水表。在经常性支出选「宿舍电费 / 宿舍水费」即可归到这里。',
    },
    {
        id: 'UPKEEP_SHOPLOT', label: 'UPKEEP OF SHOPLOT', section: 'OPERATION',
        sources: ['MAINTENANCE', 'PEST_CONTROL', 'CLEANING', 'CLEANING_SUPPLY', 'WASTE', 'SUPPLIES'],
        note: '维修保养、虫害、清洁、垃圾、消耗杂品',
    },
    {
        id: 'UPKEEP_OFFICE', label: 'UPKEEP OF OFFICE (IT)', section: 'OPERATION',
        sources: ['IT_SOFTWARE'],
        note: 'IT_SYSTEM（电脑/POS 硬体）系统归在 CAPEX，不在这里 — 见下方 RENOVATION 说明',
        warn: true,
    },
    {
        id: 'OTHER_OPEX', label: 'OTHER OPERATING EXPENSES', section: 'OPERATION',
        sources: [
            'BILL', 'EXPENSE', 'LICENSE', 'INSURANCE', 'PROFESSIONAL', 'ACCOUNTING',
            'LOGISTICS', 'TRANSPORT', 'DELIVERY_GRAB', 'PRINTING', 'MISC_OPEX',
            'MBB_COMM', 'BANK_FEE',
        ],
        note: '执照、保险、专业服务、会计、物流交通、印刷、银行手续费、其他杂费',
    },

    // ==========================================
    // CAPEX（资本支出 — 不进 P&L，另外列出来给你看）
    // ==========================================
    {
        id: 'RENOVATION', label: 'RENOVATION', section: 'CAPEX',
        sources: ['RENOVATION'],
        note: '⚠️ 你 XLSX 把 RENOVATION 放在 OPERATION EXPENSES 里。系统把它算 CAPEX（资本支出，不吃当期利润）。这里照系统归 CAPEX，另外列一段给你看，避免拉低当月净利。要改回 OPERATION 跟我说。',
        warn: true,
    },
    {
        id: 'EQUIPMENT', label: 'EQUIPMENT & FIT-OUT', section: 'CAPEX',
        sources: ['EQUIPMENT', 'KITCHEN_EQUIPMENT', 'FURNITURE', 'IT_SYSTEM', 'SIGNAGE'],
        note: '设备、厨房设备、家具、电脑POS、招牌',
    },
];

// ==========================================
// 👥 部门薪资明细 — LABOUR CHARGES 的子行
// ------------------------------------------
// 来源：Employee.department 栏位（不是靠职位名称猜）。
// ⚠️ 这些是 LABOUR CHARGES 的「明细」，不另外加进 PERSONAL EXPENSES 总额，
//    否则薪资会被算两次。
// ==========================================
export interface LaborDeptLine {
    id: string;
    label: string;
    /** 对应 Employee.department 的值 */
    departments: string[];
}

export const LABOR_DEPT_LINES: LaborDeptLine[] = [
    { id: 'DEPT_KITCHEN',  label: 'KITCHEN (厨房)',    departments: ['KITCHEN'] },
    { id: 'DEPT_BAR',      label: 'WATER BAR (水吧)',  departments: ['BAR'] },
    { id: 'DEPT_FLOOR',    label: 'FLOOR (楼面)',      departments: ['FLOOR'] },
    { id: 'DEPT_CLEANING', label: 'CLEANING (清洁)',   departments: ['DISHWASH'] },
    { id: 'DEPT_ADMIN',    label: 'ADMIN (管理)',      departments: ['BACK_OFFICE', 'OWNER'] },
];

/** 员工没填 department、或填了 OTHER 时的去处 */
export const LABOR_DEPT_UNASSIGNED = { id: 'DEPT_UNASSIGNED', label: 'UNASSIGNED (未分部门)' };

/**
 * 旧资料没填 department 时的推断规则（靠职位名称关键字）。
 * ⚠️ 这是「猜」，画面上会标示有多少笔是推断来的。要准就去员工档案补 department。
 */
export const LABOR_DEPT_ROLE_FALLBACK: { keywords: string[]; department: string }[] = [
    { keywords: ['CHEF', 'COOK', 'COMMIS', 'FRYER', 'CUTTER', '厨', '头手', '帮锅', '打荷', '占板', '马王', 'BOH'], department: 'KITCHEN' },
    { keywords: ['BAR', '水吧', 'BEVERAGE'], department: 'BAR' },
    { keywords: ['DISH', 'CLEAN', '洗碗', '清洁'], department: 'DISHWASH' },
    { keywords: ['WAITER', 'CAPTAIN', 'COUNTER', 'CASHIER', '楼面', '服务', '写单', '柜台', 'FOH', 'PART-TIME', '兼职'], department: 'FLOOR' },
    { keywords: ['MANAGER', 'SUPERVISOR', 'HR', 'ADMIN', 'OWNER', '经理', '主管', '管理', '人事'], department: 'BACK_OFFICE' },
];

// ==========================================
// 📊 品类毛利配对 (Category Margin Pairs)
// ------------------------------------------
// 把「销售端的品类」对上「成本端的科目」，才算得出各自的毛利与毛利率。
//
// ⚠️ 口径说明：
//   · 销售取「全渠道」数字（含平台单），因为进货成本本来就涵盖所有渠道卖出去的东西。
//     若拿店内推算的销售去比全部成本，毛利率会被低估。
//   · 果汁的成本用「食材-水果」(INGREDIENT_FRUIT)。这一行同时含厨房用的水果，
//     所以果汁毛利率会略偏保守 —— 依你的决定不再另分「水吧果汁原料」科目。
// ==========================================
export interface CategoryMarginPair {
    id: string;
    label: string;
    /** 销售端的 SalesCategoryId */
    salesCategories: string[];
    /** 成本端的 catKey */
    costCategories: string[];
    note?: string;
    /**
     * 合计模式要并成同一行的分组。
     * 例如果汁/茶/罐装水/饮料在合计模式下并成一行「饮料 REFRESHMENT」，
     * 切到细分模式才各自分开。没填的就永远独立一行。
     */
    summaryGroup?: { id: string; label: string; note?: string };
}

/** 水吧合计模式的分组标签 */
export const MARGIN_GROUP_DRINKS = {
    id: 'MARGIN_DRINKS',
    label: '饮料 REFRESHMENT (合计)',
    note: '果汁 + 茶 + 罐装水 + 其他饮料。切到细分模式可分开看；酒不并进来。冰块没有对应销售，不算在毛利里（但仍计入成本表的 REFRESHMENT）。',
};

export const CATEGORY_MARGIN_PAIRS: CategoryMarginPair[] = [
    {
        id: 'MARGIN_FISH', label: '鱼类 FISH',
        salesCategories: ['FISH'],
        costCategories: ['INGREDIENT_FISH'],
        note: '销售端 E 系列非洲鱼',
    },
    {
        id: 'MARGIN_PRAWN', label: '虾/生虾类 PRAWN',
        salesCategories: ['PRAWN'],
        costCategories: ['INGREDIENT_PRAWN'],
        note: '销售端 F03 炸虾球。⚠️ 旧账单里「虾和Sotong」混合类别的金额也全算在这里，成本会偏高',
    },
    {
        id: 'MARGIN_SOTONG', label: '苏东 Sotong',
        salesCategories: ['SOTONG'],
        costCategories: ['INGREDIENT_SOTONG'],
        note: '销售端 G01–G03 与 G12 苏东',
    },
    {
        id: 'MARGIN_LALA', label: '啦啦 Lala',
        salesCategories: ['LALA'],
        costCategories: ['INGREDIENT_LALA'],
        note: '销售端 F01 金香啦啦、F02 上汤啦啦',
    },
    {
        id: 'MARGIN_HQ_DISHES', label: '总店菜式 HQ DISHES',
        salesCategories: ['HQ_DISHES'],
        costCategories: ['INGREDIENT_HQ', 'SUPPLIER_HQ'],
        note: '销售端 G05 家乡豆腐、G06 炸水饺、G09 春卷、G10 年糕、G11 泰式豆腐',
    },
    {
        id: 'MARGIN_SEAFOOD_PROCESSED', label: '海鲜加工品 PROCESSED',
        salesCategories: ['SEAFOOD_PROCESSED'],
        costCategories: ['INGREDIENT_SEAFOOD_PROCESSED', 'INGREDIENT_SEAFOOD'],
        note: '销售端 G08 炸鱼饼',
    },
    {
        id: 'MARGIN_JUICE', label: '果汁 JUICE',
        salesCategories: ['JUICE'],
        costCategories: ['INGREDIENT_FRUIT'],
        note: '成本用「食材-水果」，里面也含厨房用的水果，所以毛利率偏保守',
        summaryGroup: MARGIN_GROUP_DRINKS,
    },
    {
        id: 'MARGIN_TEA', label: '茶 TEA',
        salesCategories: ['TEA'],
        costCategories: ['BEVERAGE_TEA'],
        summaryGroup: MARGIN_GROUP_DRINKS,
    },
    {
        id: 'MARGIN_CANNED', label: '罐装水 CANNED',
        salesCategories: ['CANNED'],
        costCategories: ['BEVERAGE_CANNED'],
        summaryGroup: MARGIN_GROUP_DRINKS,
    },
    {
        id: 'MARGIN_ALCOHOL', label: '酒 ALCOHOL',
        salesCategories: ['BEER'],
        costCategories: ['BEVERAGE_ALCOHOL'],
    },
    {
        id: 'MARGIN_REFRESHMENT', label: '饮料 REFRESHMENT',
        salesCategories: ['REFRESHMENT'],
        costCategories: ['BEVERAGE'],
        note: '水吧自制饮品（凉茶、冲调、白开水、矿泉水）',
        summaryGroup: MARGIN_GROUP_DRINKS,
    },
];

export const SECTION_LABELS: Record<ClassicCostSection, string> = {
    COST: 'COST',
    PERSONAL: 'PERSONAL EXPENSES',
    SELLING: 'SELLING & DISTRIBUTION EXPENSES',
    OPERATION: 'OPERATION EXPENSES',
    CAPEX: 'CAPEX (资本支出 — 不入 P&L)',
};

// ==========================================
// 自我检查：有没有 catKey 被重复映射到两行
// 开发时可在 console 呼叫，正式画面不跑
// ==========================================
export const validateCostMap = (): string[] => {
    const seen: Record<string, string> = {};
    const dupes: string[] = [];
    CLASSIC_COST_LINES.forEach(line => {
        line.sources.forEach(s => {
            if (seen[s]) dupes.push(`${s} 同时出现在「${seen[s]}」和「${line.label}」`);
            else seen[s] = line.label;
        });
    });
    return dupes;
};

/** 已映射的所有 catKey，用来找出「没被归到任何一行」的漏网之鱼 */
export const MAPPED_CAT_KEYS = new Set(CLASSIC_COST_LINES.flatMap(l => l.sources));
