// ==========================================
// 📥 StoreHub CSV 导入 — 解析 + 分类引擎
// ------------------------------------------
// 支援两种 StoreHub 报表，上传时自动辨识：
//   1. 「SKU 销售」     → 各产品销售额，用来做品类细分
//   2. 「付款方式销售」 → 用来把平台单 / 店内单分开
//
// 金额一律取「商品净销售额」栏（已扣退货，未扣折扣）。
// ==========================================

import {
    SalesCategoryId,
    PLATFORM_PAYMENT_METHODS,
} from '../constants/salesCategoryRules';
// 分类规则改成走「执行期设定」：没有设定档时自动退回内建规则
import { SalesRulesConfig, getActiveSalesRules } from '../constants/salesRulesRuntime';

// ==========================================
// 型别
// ==========================================
export interface SkuSalesRow {
    productName: string;
    productCategory: string;
    sku: string;
    /** 归类后用的 code（SKU 栏 N/A 时从产品名称推出来） */
    resolvedCode: string;
    qty: number;
    grossSales: number;
    refund: number;
    discount: number;
    netSales: number;
    /** StoreHub 里设定的平均成本；没设定的商品是 0 */
    avgCost?: number;
    /** StoreHub 算的毛利额；成本没设定时等于净销售额（毛利率 100%），不可信 */
    grossProfit?: number;
    category: SalesCategoryId;
    /** 靠哪一条规则归的类，画面上给你查 */
    matchedBy: 'SKU_EXACT' | 'SKU_PREFIX' | 'NAME_KEYWORD' | 'NONE';
}

export interface PaymentRow {
    method: string;
    channel: 'GRAB' | 'SHOPEE' | 'PANDA' | 'IN_STORE';
    grossSales: number;
    txCount: number;
    refund: number;
    netSales: number;
}

export interface StorehubImportResult {
    /** 'YYYY-MM' */
    month: string;
    skuRows: SkuSalesRow[];
    paymentRows: PaymentRow[];
    /** 各大类净销售额（全渠道，含平台单） */
    categoryTotals: Record<SalesCategoryId, number>;
    totals: {
        /** SKU 报表全部净销售额 */
        allChannelNet: number;
        /** 付款方式报表：平台合计 */
        platformNet: number;
        /** 付款方式报表：店内合计 */
        inStoreNet: number;
        /** 付款方式报表合计 */
        paymentNet: number;
        /** 店内占比，用来把品类细分缩放成店内推算值 */
        inStoreRatio: number;
    };
    warnings: string[];
}

export type StorehubFileKind = 'SKU_SALES' | 'PAYMENT_SALES' | 'UNKNOWN';

/** 存进 Firestore 的月度记录 (collection: storehubSales, doc id = month) */
export interface StorehubMonthlySales {
    /** 'YYYY-MM'，同时是 doc id */
    month: string;
    skuRows: SkuSalesRow[];
    paymentRows: PaymentRow[];
    categoryTotals: Record<SalesCategoryId, number>;
    totals: StorehubImportResult['totals'];
    /** 导入时间 ISO 字串 */
    importedAt: string;
    importedBy?: string;
    /** 原始档名，方便日后追查 */
    sourceFiles: string[];
}

// ==========================================
// CSV 解析（处理引号内的逗号，例如 "饭类,扣肉 / Rice and Pork"）
// ==========================================
export const parseCsv = (text: string): string[][] => {
    // 去掉 BOM
    const clean = text.replace(/^﻿/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (inQuotes) {
            if (ch === '"') {
                if (clean[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
            continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === ',') { row.push(field); field = ''; continue; }
        if (ch === '\r') continue;
        if (ch === '\n') {
            row.push(field); field = '';
            if (row.some(c => c.trim() !== '')) rows.push(row);
            row = [];
            continue;
        }
        field += ch;
    }
    row.push(field);
    if (row.some(c => c.trim() !== '')) rows.push(row);
    return rows;
};

const toNum = (v: string | undefined): number => {
    if (!v) return 0;
    const n = parseFloat(String(v).replace(/,/g, '').trim());
    return isNaN(n) ? 0 : n;
};

const norm = (s: string): string => (s || '').toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * 栏位名正规化，用来做「宽松比对」。
 *
 * StoreHub 汇出的栏名会带单位后缀，而且不同版本用字不一样：
 *   「总销售额 RM」「总折扣 RM」「交易总数」「折扣 %」…
 * 以前用 header.indexOf('总销售额') 完全相等比对，只要多一个「 RM」就找不到，
 * 找不到会拿到 -1 → r[-1] 是 undefined → 金额全部变成 0。
 * （这就是「导入成功但合计 RM 0.00」的原因。）
 *
 * 所以这里统一：去掉所有空白、去掉结尾的 RM / %，再比。
 */
const normHeader = (s: string): string =>
    (s || '')
        .replace(/^\ufeff/, '')      // 去掉 BOM
        .replace(/\s+/g, '')          // 去掉所有空白（含栏名中间的）
        .replace(/(RM|%)$/i, '')      // 去掉结尾单位
        .trim();

/**
 * 依序试多个候选栏名，回传第一个找到的索引；都找不到回 -1。
 * 比对是「正规化后完全相等」—— 不用 includes，免得「平均净销售额」被「净销售额」抢走。
 */
const findCol = (header: string[], candidates: string[]): number => {
    const normalized = header.map(normHeader);
    for (const cand of candidates) {
        const target = normHeader(cand);
        const i = normalized.indexOf(target);
        if (i >= 0) return i;
    }
    return -1;
};

// ==========================================
// 自动辨识档案类型
// ==========================================
export const detectFileKind = (headerRow: string[]): StorehubFileKind => {
    const h = headerRow.map(c => c.trim());
    if (h.includes('SKU 编号') || h.includes('产品SKU') || h.includes('产品名称')) return 'SKU_SALES';
    if (h.includes('付款方式')) return 'PAYMENT_SALES';
    return 'UNKNOWN';
};

// ==========================================
// 从 SKU 栏 / 产品名称推出可比对的 code
// 例：'A02' → A02；'S01 Carlsberg'（SKU=N/A）→ S01；'(EGG) A09 …' → A09
// ==========================================
export const resolveSkuCode = (skuField: string, productName: string): string => {
    const s = norm(skuField);
    if (s && s !== 'N/A') return s;

    // SKU 栏是 N/A → 从产品名称开头抓。允许前面有 (EGG) 之类的括号前缀
    const name = norm(productName).replace(/^\([^)]*\)\s*/, '');
    const m = name.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\b/);
    return m ? m[1] : '';
};

// ==========================================
// 分类：单笔 SKU → 大类
// ==========================================
export const classifySku = (
    code: string,
    productName: string,
    /** 传入草稿规则可做「试算」而不影响正在生效的设定 */
    rules: SalesRulesConfig = getActiveSalesRules()
): { category: SalesCategoryId; matchedBy: SkuSalesRow['matchedBy'] } => {
    const c = norm(code);

    // 1. 整串精准比对（SET A / SET B / BUFFET）
    if (c && rules.exactRules[c]) {
        return { category: rules.exactRules[c], matchedBy: 'SKU_EXACT' };
    }

    // 2. 前缀 + 数字范围。用最长前缀优先，避免 'OJ01' 被 'J' 抢走
    if (c) {
        const m = c.match(/^([A-Z]+)(\d+)/);
        if (m) {
            const prefix = m[1];
            const num = parseInt(m[2], 10);
            // 规则已在 normalizeSalesRules 里排成「长前缀优先」，'OJ01' 不会被 'J' 抢走
            for (const rule of rules.prefixRules) {
                if (rule.prefix !== prefix) continue;
                if (rule.range === null) return { category: rule.category, matchedBy: 'SKU_PREFIX' };
                if (num >= rule.range[0] && num <= rule.range[1]) {
                    return { category: rule.category, matchedBy: 'SKU_PREFIX' };
                }
            }
        }
    }

    // 3. 产品名称关键字（白饭、加冰块、荷包蛋、人工费…）
    const n = norm(productName);
    for (const rule of rules.keywordRules) {
        if (rule.keywords.some(k => n.includes(norm(k)))) {
            return { category: rule.category, matchedBy: 'NAME_KEYWORD' };
        }
    }

    return { category: 'UNCLASSIFIED', matchedBy: 'NONE' };
};

// ==========================================
// 解析「SKU 销售」报表
// ==========================================
export const parseSkuSalesCsv = (text: string): SkuSalesRow[] => {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const header = rows[0].map(c => c.trim());

    const iName   = findCol(header, ['产品名称', '商品名称', 'Product Name']);
    const iCat    = findCol(header, ['产品类别', '商品类别', 'Category']);
    const iSku    = findCol(header, ['SKU 编号', 'SKU编号', '产品SKU', 'SKU']);
    const iQty    = findCol(header, ['总售出商品数', '总售出数量', '售出数量', 'Items Sold']);
    const iGross  = findCol(header, ['总销售额', 'Gross Sales']);
    const iRefund = findCol(header, ['总销售退货额', '退货额', 'Refund']);
    const iDisc   = findCol(header, ['总折扣', '总折扣额', '折扣额', 'Discount']);
    const iNet    = findCol(header, ['商品净销售额', '净销售额', 'Net Sales']);
    // 🟢 StoreHub 有填成本的商品，这两栏就是真实数字（没填的是 0）
    const iAvgCost = findCol(header, ['平均成本', 'Average Cost']);
    const iProfit  = findCol(header, ['毛利润', '毛利', 'Gross Profit']);

    return rows.slice(1).map(r => {
        const productName = (r[iName] || '').trim();
        const sku = (r[iSku] || '').trim();
        const resolvedCode = resolveSkuCode(sku, productName);
        const { category, matchedBy } = classifySku(resolvedCode, productName);
        return {
            productName,
            productCategory: (r[iCat] || '').trim(),
            sku,
            resolvedCode,
            qty: toNum(r[iQty]),
            grossSales: toNum(r[iGross]),
            refund: toNum(r[iRefund]),
            discount: toNum(r[iDisc]),
            netSales: toNum(r[iNet]),
            avgCost: iAvgCost >= 0 ? toNum(r[iAvgCost]) : 0,
            grossProfit: iProfit >= 0 ? toNum(r[iProfit]) : 0,
            category,
            matchedBy,
        };
    }).filter(r => r.productName !== '');
};

// ==========================================
// 解析「付款方式销售」报表
// ==========================================
export const parsePaymentSalesCsv = (text: string): PaymentRow[] => {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const header = rows[0].map(c => c.trim());

    const iMethod = findCol(header, ['付款方式', 'Payment Method']);
    const iGross  = findCol(header, ['总销售额', 'Gross Sales']);
    const iTx     = findCol(header, ['交易总数', '总交易次数', '交易次数', 'Transactions']);
    const iRefund = findCol(header, ['总销售退货额', '退货额', 'Refund']);
    const iNet    = findCol(header, ['净销售额', 'Net Sales']);

    return rows.slice(1).map(r => {
        const method = (r[iMethod] || '').trim();
        const key = norm(method);
        const channel: PaymentRow['channel'] = PLATFORM_PAYMENT_METHODS[key] || 'IN_STORE';
        return {
            method,
            channel,
            grossSales: toNum(r[iGross]),
            txCount: toNum(r[iTx]),
            refund: toNum(r[iRefund]),
            netSales: toNum(r[iNet]),
        };
    }).filter(r => r.method !== '');
};

// ==========================================
// 从档名抓月份：SKU销售_2026070120260731.csv → '2026-07'
// ==========================================
export const extractMonthFromFilename = (filename: string): string | null => {
    const m = filename.match(/(\d{4})(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    const m2 = filename.match(/(\d{4})[-_]?(\d{2})/);
    if (m2 && parseInt(m2[2], 10) >= 1 && parseInt(m2[2], 10) <= 12) return `${m2[1]}-${m2[2]}`;
    return null;
};

// ==========================================
// 汇总：把两份报表合成一份月度结果
// ==========================================
const EMPTY_TOTALS = (): Record<SalesCategoryId, number> => ({
    MEE: 0, RICE: 0, VEGETABLE: 0, MEAT_WOK: 0, HQ_DISHES: 0,
    FISH: 0, PRAWN: 0, SOTONG: 0, LALA: 0, SEAFOOD_PROCESSED: 0,
    SET: 0, BUFFET: 0,
    JUICE: 0, TEA: 0, CANNED: 0, REFRESHMENT: 0, BEER: 0,
    OTHERS: 0, UNCLASSIFIED: 0,
});

export const buildImportResult = (
    month: string,
    skuRows: SkuSalesRow[],
    paymentRows: PaymentRow[]
): StorehubImportResult => {
    const warnings: string[] = [];

    const categoryTotals = EMPTY_TOTALS();
    skuRows.forEach(r => { categoryTotals[r.category] += r.netSales; });

    const allChannelNet = skuRows.reduce((s, r) => s + r.netSales, 0);
    const platformNet = paymentRows.filter(p => p.channel !== 'IN_STORE').reduce((s, p) => s + p.netSales, 0);
    const inStoreNet = paymentRows.filter(p => p.channel === 'IN_STORE').reduce((s, p) => s + p.netSales, 0);
    const paymentNet = platformNet + inStoreNet;

    // 交叉验证：两份报表的合计应该一样
    if (skuRows.length > 0 && paymentRows.length > 0) {
        const diff = Math.abs(allChannelNet - paymentNet);
        if (diff > 1) {
            warnings.push(
                `⚠️ 两份报表合计对不上：SKU 报表 RM${allChannelNet.toFixed(2)}，付款方式报表 RM${paymentNet.toFixed(2)}，差 RM${diff.toFixed(2)}。请确认是同一个月份、同一间分店的档案。`
            );
        }
    }

    if (categoryTotals.UNCLASSIFIED > 0) {
        const items = skuRows.filter(r => r.category === 'UNCLASSIFIED').map(r => r.productName);
        warnings.push(
            `⚠️ 有 ${items.length} 项归不了类，共 RM${categoryTotals.UNCLASSIFIED.toFixed(2)}：${items.slice(0, 5).join('、')}${items.length > 5 ? ' 等' : ''}。请到「分类设置」补规则。`
        );
    }

    if (skuRows.length > 0 && paymentRows.length === 0) {
        warnings.push('ℹ️ 只上传了 SKU 报表，还没有付款方式报表 — 无法把平台单和店内单分开。');
    }
    if (paymentRows.length > 0 && skuRows.length === 0) {
        warnings.push('ℹ️ 只上传了付款方式报表，还没有 SKU 报表 — 无法做品类细分。');
    }

    const inStoreRatio = paymentNet > 0 ? inStoreNet / paymentNet : 1;

    return {
        month,
        skuRows,
        paymentRows,
        categoryTotals,
        totals: { allChannelNet, platformNet, inStoreNet, paymentNet, inStoreRatio },
        warnings,
    };
};

// ==========================================
// 用「现在生效的规则」重算某个月
// ------------------------------------------
// 导入时存过原始 skuRows，所以改了规则不用重新上传 CSV，
// 直接拿旧资料重跑分类就好。金额本身不动，只动 category。
// ==========================================
export const recalcMonth = (
    record: StorehubMonthlySales,
    rules: SalesRulesConfig = getActiveSalesRules()
): { record: StorehubMonthlySales; changedRows: number; diff: Record<string, number> } => {
    const before = record.categoryTotals || EMPTY_TOTALS();
    let changedRows = 0;

    const skuRows = (record.skuRows || []).map(r => {
        const resolved = r.resolvedCode || resolveSkuCode(r.sku, r.productName);
        const { category, matchedBy } = classifySku(resolved, r.productName, rules);
        if (category !== r.category) changedRows++;
        return { ...r, resolvedCode: resolved, category, matchedBy };
    });

    const rebuilt = buildImportResult(record.month, skuRows, record.paymentRows || []);

    const diff: Record<string, number> = {};
    (Object.keys(rebuilt.categoryTotals) as SalesCategoryId[]).forEach(k => {
        const d = rebuilt.categoryTotals[k] - (before[k] || 0);
        if (Math.abs(d) > 0.005) diff[k] = Number(d.toFixed(2));
    });

    return {
        record: {
            ...record,
            skuRows,
            categoryTotals: rebuilt.categoryTotals,
            totals: rebuilt.totals,
        },
        changedRows,
        diff,
    };
};

// ==========================================
// 批次导入：一次丢多个月的档案，自动分月
// ------------------------------------------
// 纯逻辑（吃 {name, text}），不碰 File API，方便测试。
// ==========================================
export interface BatchFileInput {
    name: string;
    text: string;
}

export interface BatchImportPlan {
    /** 每个月一笔，已经 buildImportResult 过 */
    months: StorehubImportResult[];
    /** 每个档案怎么被处理的，给使用者看 */
    fileLog: { name: string; kind: StorehubFileKind; month: string; rows: number; ok: boolean; reason?: string }[];
    warnings: string[];
}

export const planBatchImport = (
    files: BatchFileInput[],
    fallbackMonth: string
): BatchImportPlan => {
    const buckets: Record<string, { sku: SkuSalesRow[]; pay: PaymentRow[] }> = {};
    const fileLog: BatchImportPlan['fileLog'] = [];
    const warnings: string[] = [];
    let usedFallback = 0;

    files.forEach(f => {
        const rows = parseCsv(f.text);
        if (rows.length < 2) {
            fileLog.push({ name: f.name, kind: 'UNKNOWN', month: '—', rows: 0, ok: false, reason: '档案是空的或格式不对' });
            return;
        }
        const kind = detectFileKind(rows[0]);
        if (kind === 'UNKNOWN') {
            fileLog.push({ name: f.name, kind, month: '—', rows: 0, ok: false, reason: '认不出这是哪一种 StoreHub 报表' });
            return;
        }

        let month = extractMonthFromFilename(f.name);
        if (!month) { month = fallbackMonth; usedFallback++; }

        if (!buckets[month]) buckets[month] = { sku: [], pay: [] };

        if (kind === 'SKU_SALES') {
            const parsed = parseSkuSalesCsv(f.text);
            if (buckets[month].sku.length > 0) {
                warnings.push(`⚠️ ${month} 有两份「SKU 销售」档案，后面那份 (${f.name}) 覆盖了前面那份。`);
            }
            buckets[month].sku = parsed;
            fileLog.push({ name: f.name, kind, month, rows: parsed.length, ok: true });
        } else {
            const parsed = parsePaymentSalesCsv(f.text);
            if (buckets[month].pay.length > 0) {
                warnings.push(`⚠️ ${month} 有两份「付款方式销售」档案，后面那份 (${f.name}) 覆盖了前面那份。`);
            }
            buckets[month].pay = parsed;
            fileLog.push({ name: f.name, kind, month, rows: parsed.length, ok: true });
        }
    });

    if (usedFallback > 0) {
        warnings.push(
            `⚠️ 有 ${usedFallback} 个档案的档名看不出月份，已归到目前选的 ${fallbackMonth}。请确认档名格式（StoreHub 预设是 SKU销售_2026070120260731.csv 这种）。`
        );
    }

    const months = Object.keys(buckets)
        .sort()
        .map(m => buildImportResult(m, buckets[m].sku, buckets[m].pay));

    months.forEach(r => r.warnings.forEach(w => warnings.push(`[${r.month}] ${w}`)));

    return { months, fileLog, warnings };
};

// ==========================================
// 品类细分 → 店内推算值
// ------------------------------------------
// SKU 报表里平台单和店内单混在一起、没有渠道栏，分不开。
// 所以各品类乘上「店内收款占比」，让细分加起来 = SHOP LOT SALES 总额。
// ⚠️ 这是推算值，画面上必须标明。
// ==========================================
export const scaleToInStore = (
    categoryTotals: Record<SalesCategoryId, number>,
    inStoreRatio: number
): Record<SalesCategoryId, number> => {
    const out = EMPTY_TOTALS();
    (Object.keys(categoryTotals) as SalesCategoryId[]).forEach(k => {
        out[k] = categoryTotals[k] * inStoreRatio;
    });
    return out;
};
