/**
 * 网站订单 · 服务器端定价（契约 v0.1，见 docs/api/online-orders-contract.md）
 * ----------------------------------------------------------------------------
 * 纯计算：不碰 Firestore、不碰 React，网站与 ERP 服务端共用同一份算法。
 * 原则：
 *   - 价格只由服务器根据菜单计算；客户端送来的任何价格一律不采用（请求里根本没有价格栏位）。
 *   - 金额一律以「仙（sen）」整数计算，避免浮点误差。
 *   - 公开菜单只含公开栏位：成本、配方、做法、视频等内部资料绝不外流。
 */
import type { MenuItem } from '../../types';

// ── 公开菜单 ─────────────────────────────────────────────────────────────────

export interface PublicMenuVariant {
    /** 稳定 ID：`<itemId>:<规格名称 slug>`，规格名称不变 ID 就不变 */
    id: string;
    label: string;
    priceSen: number;
}

export interface PublicOptionChoice {
    id: string;
    label: string;
    /** 加价（仙），由选项名称中的「(+RMx.xx)」解析；没有标示则为 0 */
    priceDeltaSen: number;
}

export interface PublicOptionGroup {
    id: string;
    label: string;
    minSelect: number;
    maxSelect: number;
    choices: PublicOptionChoice[];
}

export interface PublicMenuItem {
    id: string;
    name: string;
    category: string;
    image?: string;
    available: boolean;
    variants: PublicMenuVariant[];
    optionGroups: PublicOptionGroup[];
}

/** RM 转仙（四舍五入到整数仙） */
export const toSen = (rm: number): number => {
    const value = Number(rm);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

/** 名称转成 ID 片段：保留中英文与数字，其余换成「-」 */
export const slugify = (label: string): string =>
    String(label || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '') || 'default';

export const variantIdFor = (itemId: string, label: string): string => `${itemId}:${slugify(label)}`;

/** 同一道菜内，名称 slug 相同时加上序号，保证 ID 唯一且每次结果一致 */
const uniqueIds = (base: string[]): string[] => {
    const seen = new Map<string, number>();
    return base.map(id => {
        const n = (seen.get(id) || 0) + 1;
        seen.set(id, n);
        return n === 1 ? id : `${id}~${n}`;
    });
};

/** 选项名称结尾的固定加价，例如「加生蛋 (+RM1.00)」 */
const SURCHARGE_SUFFIX = /\(\s*\+\s*RM\s*(\d+(?:\.\d{1,2})?)\s*\)\s*$/i;
/** 名称里出现金额（例如「2位以上每位加RM1.50」）但不是上面那种固定加价，服务器无法可靠计价 */
const MENTIONS_MONEY = /RM\s*\d/i;

/**
 * 解析选项加价。
 * - `加生蛋 (+RM1.00)` → 100 仙
 * - 没有金额 → 0
 * - 有金额但格式无法确定（按人数加价等）→ null，整道菜暂不开放网上点单，避免少收钱
 */
export const parseOptionSurchargeSen = (label: string): number | null => {
    const text = String(label || '');
    const match = text.match(SURCHARGE_SUFFIX);
    if (match) return toSen(Number(match[1]));
    return MENTIONS_MONEY.test(text) ? null : 0;
};

const isPositiveSen = (sen: number) => Number.isInteger(sen) && sen > 0;

/**
 * 由 ERP 菜单产生公开菜单。
 * 只挑选公开栏位（白名单），不使用「删除内部栏位」的方式，避免日后新增内部栏位时意外外流。
 * 以下情况整道菜或该规格不开放，宁可不卖也不卖错价：
 * - 价格不是正数的规格（例如菜单管理里预设为 0 的 M / L 规格）不公开；
 * - 选项含有无法计价的加价说明时，整道菜标为不供应。
 */
export const buildPublicMenu = (items: MenuItem[], unavailableItemIds: ReadonlySet<string> = new Set()): PublicMenuItem[] =>
    items.map(item => {
        const options = Array.isArray(item.options) ? item.options.filter(o => String(o || '').trim()) : [];
        const allVariants = Array.isArray(item.variants) ? item.variants : [];
        // 先以全部规格计算 ID，再过滤，日后补上价格时 ID 不变
        const variantIds = uniqueIds(allVariants.map(v => variantIdFor(item.id, v.label)));
        const variants = allVariants
            .map((v, i) => ({ id: variantIds[i], label: v.label, priceSen: toSen(v.price) }))
            .filter(v => isPositiveSen(v.priceSen));
        const choiceIds = uniqueIds(options.map(o => `${item.id}:opt:${slugify(o)}`));
        const surcharges = options.map(parseOptionSurchargeSen);
        const hasUnpriceableOption = surcharges.some(sen => sen === null);
        return {
            id: item.id,
            name: item.name,
            category: item.category,
            ...(item.image ? { image: item.image } : {}),
            available: !unavailableItemIds.has(item.id) && variants.length > 0 && !hasUnpriceableOption,
            variants,
            optionGroups: options.length && !hasUnpriceableOption
                ? [{
                    id: `${item.id}:options`,
                    label: '选项',
                    minSelect: 0,
                    maxSelect: options.length,
                    choices: options.map((o, i) => ({ id: choiceIds[i], label: o, priceDeltaSen: surcharges[i] as number })),
                }]
                : [],
        };
    });

// ── 订单定价 ─────────────────────────────────────────────────────────────────

export interface OrderLineRequest {
    itemId: string;
    variantId: string;
    quantity: number;
    optionChoiceIds?: string[];
    note?: string;
}

export interface PricingSettings {
    /** 服务费，基点（1000 = 10%）。实际费率由负责人在设定中决定 */
    serviceChargeBps: number;
    /** 服务税，基点（600 = 6%）。按 (小计 + 服务费) 计算。实际费率由负责人决定 */
    serviceTaxBps: number;
    /** 马来西亚现金找零：总额四舍五入到最接近的 5 仙 */
    roundToFiveSen: boolean;
}

export const ORDER_LIMITS = {
    maxLines: 30,
    maxQuantityPerLine: 50,
    maxNoteLength: 100,
} as const;

export type PricingErrorCode =
    | 'EMPTY_ORDER'
    | 'TOO_MANY_LINES'
    | 'ITEM_NOT_FOUND'
    | 'ITEM_UNAVAILABLE'
    | 'VARIANT_NOT_FOUND'
    | 'INVALID_QUANTITY'
    | 'OPTION_NOT_FOUND'
    | 'OPTION_DUPLICATED'
    | 'OPTION_COUNT_OUT_OF_RANGE'
    | 'NOTE_TOO_LONG';

export interface PricingError {
    code: PricingErrorCode;
    lineIndex?: number;
    message: string;
}

export interface PricedLine {
    itemId: string;
    variantId: string;
    /** 名称与价格快照：日后菜单改名或改价，不影响已下的订单 */
    itemName: string;
    variantLabel: string;
    optionLabels: string[];
    quantity: number;
    unitPriceSen: number;
    lineTotalSen: number;
    note?: string;
}

export interface PricedOrder {
    lines: PricedLine[];
    subtotalSen: number;
    serviceChargeSen: number;
    serviceTaxSen: number;
    roundingSen: number;
    totalSen: number;
}

export type PricingResult = { ok: true; order: PricedOrder } | { ok: false; errors: PricingError[] };

const applyBps = (amountSen: number, bps: number): number => Math.round((amountSen * Math.max(0, Math.trunc(bps))) / 10000);

/** 马来西亚四舍五入到 5 仙：1–2 仙舍去，3–4 仙进到 5，6–7 仙舍到 5，8–9 仙进位 */
export const roundToNearestFiveSen = (sen: number): number => Math.round(sen / 5) * 5;

export const priceOrder = (menu: PublicMenuItem[], lines: OrderLineRequest[], settings: PricingSettings): PricingResult => {
    const errors: PricingError[] = [];
    if (!Array.isArray(lines) || lines.length === 0) return { ok: false, errors: [{ code: 'EMPTY_ORDER', message: '订单没有任何品项' }] };
    if (lines.length > ORDER_LIMITS.maxLines) return { ok: false, errors: [{ code: 'TOO_MANY_LINES', message: `一张订单最多 ${ORDER_LIMITS.maxLines} 行` }] };

    const itemsById = new Map(menu.map(item => [item.id, item]));
    const priced: PricedLine[] = [];

    lines.forEach((line, lineIndex) => {
        const item = itemsById.get(line?.itemId);
        if (!item) { errors.push({ code: 'ITEM_NOT_FOUND', lineIndex, message: '找不到这道菜' }); return; }
        if (!item.available) { errors.push({ code: 'ITEM_UNAVAILABLE', lineIndex, message: `${item.name} 目前不供应` }); return; }
        const variant = item.variants.find(v => v.id === line.variantId);
        if (!variant) { errors.push({ code: 'VARIANT_NOT_FOUND', lineIndex, message: `${item.name} 没有这个规格` }); return; }
        if (!isPositiveSen(variant.priceSen)) { errors.push({ code: 'ITEM_UNAVAILABLE', lineIndex, message: `${item.name} 目前不供应` }); return; }
        const quantity = line.quantity;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > ORDER_LIMITS.maxQuantityPerLine) {
            errors.push({ code: 'INVALID_QUANTITY', lineIndex, message: `数量必须是 1 到 ${ORDER_LIMITS.maxQuantityPerLine} 的整数` });
            return;
        }
        const note = typeof line.note === 'string' ? line.note.trim() : '';
        if (note.length > ORDER_LIMITS.maxNoteLength) {
            errors.push({ code: 'NOTE_TOO_LONG', lineIndex, message: `备注最多 ${ORDER_LIMITS.maxNoteLength} 字` });
            return;
        }

        const choiceIds = Array.isArray(line.optionChoiceIds) ? line.optionChoiceIds : [];
        if (new Set(choiceIds).size !== choiceIds.length) {
            errors.push({ code: 'OPTION_DUPLICATED', lineIndex, message: '选项重复' });
            return;
        }
        const chosen: PublicOptionChoice[] = [];
        let optionError = false;
        for (const id of choiceIds) {
            const choice = item.optionGroups.flatMap(g => g.choices).find(c => c.id === id);
            if (!choice) { errors.push({ code: 'OPTION_NOT_FOUND', lineIndex, message: '选项不存在' }); optionError = true; break; }
            if (!Number.isInteger(choice.priceDeltaSen) || choice.priceDeltaSen < 0) {
                errors.push({ code: 'ITEM_UNAVAILABLE', lineIndex, message: `${item.name} 目前不供应` }); optionError = true; break;
            }
            chosen.push(choice);
        }
        if (optionError) return;
        for (const group of item.optionGroups) {
            const count = group.choices.filter(c => choiceIds.includes(c.id)).length;
            if (count < group.minSelect || count > group.maxSelect) {
                errors.push({ code: 'OPTION_COUNT_OUT_OF_RANGE', lineIndex, message: `「${group.label}」需选择 ${group.minSelect}–${group.maxSelect} 项` });
                optionError = true;
                break;
            }
        }
        if (optionError) return;

        const unitPriceSen = variant.priceSen + chosen.reduce((sum, c) => sum + c.priceDeltaSen, 0);
        priced.push({
            itemId: item.id,
            variantId: variant.id,
            itemName: item.name,
            variantLabel: variant.label,
            optionLabels: chosen.map(c => c.label),
            quantity,
            unitPriceSen,
            lineTotalSen: unitPriceSen * quantity,
            ...(note ? { note } : {}),
        });
    });

    if (errors.length) return { ok: false, errors };

    const subtotalSen = priced.reduce((sum, l) => sum + l.lineTotalSen, 0);
    const serviceChargeSen = applyBps(subtotalSen, settings.serviceChargeBps);
    const serviceTaxSen = applyBps(subtotalSen + serviceChargeSen, settings.serviceTaxBps);
    const beforeRounding = subtotalSen + serviceChargeSen + serviceTaxSen;
    const totalSen = settings.roundToFiveSen ? roundToNearestFiveSen(beforeRounding) : beforeRounding;

    return {
        ok: true,
        order: { lines: priced, subtotalSen, serviceChargeSen, serviceTaxSen, roundingSen: totalSen - beforeRounding, totalSen },
    };
};
