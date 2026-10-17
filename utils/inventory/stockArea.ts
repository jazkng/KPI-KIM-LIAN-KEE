// ============================================================================
// 库存区域（集合）判断 · 全系统唯一的一套规则
// ----------------------------------------------------------------------------
// 库存分放在 4 个集合：stock_kitchen / stock_bar / stock_general / stock_fuel。
// 以前「写到哪个集合」有三套不同的猜法（CATEGORY_MAP、ID 前缀、CATEGORY_SECTIONS 反查），
// 猜错时 set() 会在别的集合新建一份同 ID 的复制品（2026-10-17 库存编号审计 2.3）。
//
// 现在的规则：
//   1. 读取库存时登记「这个 ID 实际是从哪个集合读到的」（DataManager.getStock 会登记）——以实际位置为准。
//   2. 还没读到过的，才按子分类推算（例如 MEAT → KITCHEN）。
//   3. 都判断不了 → 返回 null，呼叫端必须停下来提示，不能默认写进厨房。
// 绝不看 ID 前缀：ID 只是内部识别码，旧资料的前缀与所在区域不一定一致。
// ============================================================================

export type StockArea = 'KITCHEN' | 'BAR' | 'GENERAL' | 'FUEL';
export const STOCK_AREAS: StockArea[] = ['KITCHEN', 'BAR', 'GENERAL', 'FUEL'];

export const STOCK_AREA_COLLECTION: Record<StockArea, string> = {
    KITCHEN: 'stock_kitchen',
    BAR: 'stock_bar',
    GENERAL: 'stock_general',
    FUEL: 'stock_fuel',
};

/** 子分类 → 区域（与 inventoryConstants.CATEGORY_SECTIONS、supplierConstants.CATEGORY_MAP 一致；后者多了几个旧分类） */
const CATEGORY_AREA: Record<string, StockArea> = {
    FRESH: 'KITCHEN', MEAT: 'KITCHEN', SEAFOOD: 'KITCHEN', VEG: 'KITCHEN', NOODLE: 'KITCHEN', SAUCE: 'KITCHEN', DRY: 'KITCHEN', HQ: 'KITCHEN',
    TEA: 'BAR', FRUIT: 'BAR', RTD: 'BAR', MISC: 'BAR', DRINK: 'BAR',
    PACKAGING: 'GENERAL', CLEANING: 'GENERAL', TOOLS: 'GENERAL', WASTE: 'GENERAL', GENERAL: 'GENERAL',
    GAS: 'FUEL', CHARCOAL: 'FUEL', OIL: 'FUEL', FUEL: 'FUEL', DIESEL: 'FUEL', PETROL: 'FUEL',
};

const isArea = (v: unknown): v is StockArea => STOCK_AREAS.includes(String(v) as StockArea);

/** 子分类（或直接是区域名）→ 区域；认不得返回 null */
export const areaOfCategory = (category: unknown): StockArea | null => {
    const key = String(category || '').toUpperCase();
    if (isArea(key)) return key;
    return CATEGORY_AREA[key] || null;
};

// ── 读取时登记的实际位置 ──
const seenArea = new Map<string, StockArea>();
const conflicts = new Map<string, Set<StockArea>>();

/** 读到某集合的库存时呼叫：记录每个 ID 的实际所在区域；同一 ID 出现在两个区域时记为冲突 */
export const registerStockArea = (area: StockArea, items: { id?: string }[]): void => {
    items.forEach(item => {
        const id = String(item?.id || '');
        if (!id) return;
        const prev = seenArea.get(id);
        if (prev && prev !== area) {
            const set = conflicts.get(id) || new Set<StockArea>([prev]);
            set.add(area);
            conflicts.set(id, set);
            return; // 保留第一次读到的位置，冲突另外列出
        }
        seenArea.set(id, area);
    });
};

/** 同一 ID 同时存在于多个区域（复制品）的清单 */
export const stockAreaConflicts = (): { id: string; areas: StockArea[] }[] =>
    [...conflicts.entries()].map(([id, set]) => ({ id, areas: [...set] }));

/** 只给测试用 */
export const resetStockAreaRegistry = (): void => { seenArea.clear(); conflicts.clear(); };

/**
 * 这个库存商品应该写到哪个区域。
 * 实际读到的位置优先；同一 ID 在多个区域时返回 null（要人工处理，避免写到错的那份）。
 */
export const resolveStockArea = (item: { id?: string; category?: string } | null | undefined): StockArea | null => {
    const id = String(item?.id || '');
    if (id && conflicts.has(id)) return null;
    if (id && seenArea.has(id)) return seenArea.get(id)!;
    return areaOfCategory(item?.category);
};
