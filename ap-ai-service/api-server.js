const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { google } = require('googleapis');
google.options({
    timeout: 10000, // 10 seconds timeout
    connectTimeout: 5000 // 5 seconds connection timeout
});
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
app.use(express.json());

const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

// 🔐 内部闸门：Service Account 有完整 Drive 权限，绝不可对公网开放。/health 不受限。
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY || INTERNAL_API_KEY.length < 32) {
    console.error("❌ 严重错误: 缺少 INTERNAL_API_KEY 环境变量（或长度不足 32）");
    process.exit(1);
}
const INTERNAL_KEY_BUF = Buffer.from(INTERNAL_API_KEY);

app.use('/api', (req, res, next) => {
    const provided = Buffer.from(req.get('X-Internal-Key') || '');
    if (provided.length !== INTERNAL_KEY_BUF.length ||
        !crypto.timingSafeEqual(provided, INTERNAL_KEY_BUF)) {
        console.warn(`🚫 [闸门拦截] ${req.method} ${req.originalUrl} 来自 ${req.ip}`);
        return res.status(401).json({ success: false, code: "UNAUTHORIZED", error: "未授权的调用" });
    }
    next();
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("❌ 严重错误: 缺少 GEMINI_API_KEY 环境变量");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_REQUEST_TIMEOUT_MS = Math.max(
    15000,
    Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 60000)
);

const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

const currentStagingFolderId = process.env.NEW_INVOICE_FOLDER_ID;
const pettyCashBaseFolderId = process.env.PETTY_CASH_BASE_FOLDER_ID;
const mainSuppliersBaseFolderId = process.env.MAIN_SUPPLIERS_BASE_FOLDER_ID;

if (!currentStagingFolderId || !pettyCashBaseFolderId || !mainSuppliersBaseFolderId) {
    console.error("❌ 严重错误: 缺少 Drive Folder ID 环境变量");
    process.exit(1);
}

// 金连记供应商标准注册表
const whitelist1_MainSuppliers = {
    "8002": { folderName: "8002_TTC_RECYCLE_ENTERPRISE", keywords: ["TTC RECYCLE", "TTC RECYCLE ENTERPRISE"] },
    "8003": { folderName: "8003_KY_LEE_CHEMICAL", keywords: ["KY LEE CHEMICALS", "KY LEE", "KY_LEE_CHEMICAL"] }, 
    "8005": { folderName: "8005_WENG_FATT_FOOD", keywords: ["WENG FATT", "WENG FATT FOOD"] },
    "8006": { folderName: "8006_STA_MERCHANTS", keywords: ["STA MERCHANTS"] },
    "8007": { folderName: "8007_TTS_DISTRIBUTION_SDN_BHD", keywords: ["TTS DISTRIBUTION"] },
    "8011": { folderName: "8011_HONG_YANG_ORIENTAL", keywords: ["HONG YANG ORIENTAL", "HONG YANG"] },
    "8014": { folderName: "8014_HT_ONE_GAS", keywords: ["HT ONE GAS", "HT ONE"] },
    "8016": { folderName: "8016_SIN_HOE_KEE", keywords: ["SIN HOE KEE"] },
    "8017": { folderName: "8017_CHEAP_HIN_TRADING", keywords: ["CHEAP HIN TRADING"] },
    "8018": { folderName: "8018_AL_FROZEN_TRADING", keywords: ["AL FROZEN TRADING", "AL FROZEN"] },
    "8020": { folderName: "8020_PUDU_MARKETING", keywords: ["PUDU MARKET", "PUDU MARKETING"] },
    "8021": { folderName: "8021_CSK_STAR_PACKAGING", keywords: ["CSK STAR PACKAGING PLT", "CSK STAR PACKAGING", "CSK STAR"] },
    "8024": { folderName: "8024_MINCO_ENGINEERING_SDN_BHD", keywords: ["MINCO ENGINEERING"] },
    "8025": { folderName: "8025_HONG_ADVERTISING_TRADING_CO", keywords: ["HONG ADVERTISING"] },
    "8028": { folderName: "8028_VLOFT_PRINT_SDN_BHD", keywords: ["VLOFT PRINT"] },
    "8050": { folderName: "8050_TTF_MARKETING_HOLDINGS_SDN_BHD", keywords: ["TTF MARKETING"] },
    "8066": { folderName: "8066_HO_PRINTING", keywords: ["HO PRINTING"] },
    "8072": { folderName: "8072_EVO_PRINT_LABEL_SDN_BHD", keywords: ["EVO PRINT"] },
    "8084": { folderName: "8084_EK_FRESH", keywords: ["EK FRESH", "EKFRESH"] },
    "8085": { folderName: "8085_CHOI_SENG_TRADING", keywords: ["CHOI SENG TRADING", "CHOI SENG"] },
    "8097": { folderName: "8097_RESTORAN_NOBLE", keywords: ["NOBLE HOUSE SEAFOOD", "NOBLE HOUSE", "RESTORAN NOBLE"] },
    "8099": { folderName: "8099_RIPON_MIAH", keywords: ["RIPON MIAH"] },
    "8103": { folderName: "8103_KY_MARKETING_RENOVATION_ENTERPRISE", keywords: ["KY MARKETING", "KY RENOVATION"] },
    "8107": { folderName: "8107_MISS_CUTE_SEAFOOD", keywords: ["MISS CUTE SEAFOOD", "MISS CUTE"] },
    "8118": { folderName: "8118_HUANG_LONG_CREATION", keywords: ["HUANG LONG CREATION", "HUANG LONG"] },
    "8121": { folderName: "8121_KIM_LIAN_KEE_HOLDINGS_SDN_BHD", keywords: ["KIM LIAN KEE HOLDINGS", "KIM_LIAN_KEE_HOLDINGS"] },
    "8129": { folderName: "8129_S_AND_T_WORLD_TRADING", keywords: ["S & T WORLD TRADING", "S AND T", "S&T", "Sy T WORLD"] },
    "8137": { folderName: "8137_TCM_RESOURCES", keywords: ["TCM RESOURCES", "TCM"] },
    "8159": { folderName: "8159_ONG_TUAN_CHUAN", keywords: ["ONG TUAN CHUAN"] },
    "8164": { folderName: "8164_MD_JIBON", keywords: ["MD JIBON", "JIBON"] },
    "8214": { folderName: "8214_ST_FROZEN_FOOD_TRADING", keywords: ["ST FROZEN FOOD TRADING", "ST FROZEN FOOD", "ST FROZEN"] },
    "8204": { folderName: "8204_FULLY_FISHERY_M_SDN_BHD", keywords: ["FULLY FISHERY", "FULLY FISHERY (M) SDN BHD", "FULLY FISHERY M SDN BHD"] }
};

const whitelist2_BankTransfers = ["RENTAL", "WATER_SELANGOR", "MAXIS", "INDAH_WATER"];

// 正在扫描中的档案，避免同一张被两个请求重复处理
let scanningLocks = new Set();

// 供应商清单 / 别名由 ERP 存在 Firestore，随归档请求带过来。
// ⚠️ 不能存 Drive：Service Account 没有储存配额，建有内容的档案一定失败
//    （资料夹可以建，因为资料夹是 0 bytes）。
function sanitizeVendorConfig(raw) {
    const suppliers = {};
    const rawSuppliers = raw && typeof raw.suppliers === 'object' ? raw.suppliers : {};
    for (const [id, cfg] of Object.entries(rawSuppliers)) {
        const folderName = String(cfg?.folderName || '').trim();
        const keywords = (Array.isArray(cfg?.keywords) ? cfg.keywords : [])
            .map(k => String(k || '').trim()).filter(Boolean);
        if (!/^\d{3,6}$/.test(String(id))) continue;
        if (!folderName || keywords.length === 0) continue;
        suppliers[String(id)] = { folderName, keywords };
    }

    const aliases = (Array.isArray(raw?.aliases) ? raw.aliases : [])
        .map(a => ({
            match: (Array.isArray(a?.match) ? a.match : []).map(k => String(k || '').trim()).filter(Boolean),
            name: String(a?.name || '').trim(),
            supplierId: String(a?.supplierId || '').trim(),
        }))
        .filter(a => a.match.length > 0 && a.name);

    return {
        suppliers: Object.keys(suppliers).length > 0 ? suppliers : null,
        aliases: aliases.length > 0 ? aliases : null,
    };
}

/** 前端带来的设定优先；没有或不合格就退回内建表 */
function resolveVendorConfig(override) {
    if (!override) return { suppliers: whitelist1_MainSuppliers, aliases: VENDOR_ALIASES };
    const clean = sanitizeVendorConfig(override);
    return {
        suppliers: clean.suppliers || whitelist1_MainSuppliers,
        aliases: clean.aliases || VENDOR_ALIASES,
    };
}

function escapeDriveQ(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

// 🔐 只允许操作暂存区子树内的档案；闸门被绕过时的第二道防线
async function isInStagingArea(fileId, maxDepth = 6) {
    let frontier = [String(fileId)];
    const seen = new Set();

    for (let depth = 0; depth < maxDepth; depth++) {
        const next = [];
        for (const id of frontier) {
            if (id === currentStagingFolderId) return true;
            if (seen.has(id)) continue;
            seen.add(id);

            const meta = await drive.files.get({ fileId: id, fields: 'parents' });
            for (const parent of (meta.data.parents || [])) {
                if (parent === currentStagingFolderId) return true;
                next.push(parent);
            }
        }
        if (next.length === 0) return false;
        frontier = next;
    }
    return false;
}


async function rejectIfOutsideStaging(fileId, res) {
    try {
        if (await isInStagingArea(fileId)) return false;
    } catch (err) {
        console.error(`💥 [父目录校验失败] ${fileId}:`, err.message);
        res.status(400).json({ success: false, code: "FILE_NOT_ACCESSIBLE", error: "无法读取该文件的位置信息" });
        return true;
    }
    console.warn(`🚫 [越权拦截] 文件不在暂存区内: ${fileId}`);
    res.status(403).json({ success: false, code: "FILE_OUT_OF_SCOPE", error: "该文件不在暂存区范围内，拒绝操作" });
    return true;
}

async function getOrCreateFolder(name, parentId) {
    const res = await drive.files.list({ q: `name = '${escapeDriveQ(name)}' and '${escapeDriveQ(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id)' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({ requestBody: { name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return folder.data.id;
}

async function checkFileExistsInFolder(folderId, fileName) {
    const res = await drive.files.list({ q: `'${escapeDriveQ(folderId)}' in parents and name = '${escapeDriveQ(fileName)}' and trashed = false`, fields: 'files(id)' });
    return res.data.files && res.data.files.length > 0;
}

function normalizeVendorKey(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/\b(SDN\.?\s*BHD\.?|ENTERPRISE|PLT|TRADING|COMPANY|CO\.?)\b/g, '')
        .replace(/[^A-Z0-9]/g, '');
}

function normalizeInvoiceNo(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw || raw.includes('UNKNOWN') || raw === 'N/A' || raw === 'NA') return '';
    return raw.replace(/[^A-Z0-9]/g, '');
}

function buildInvoiceFingerprint(vendor, amount, invoiceNo, date) {
    const vendorKey = normalizeVendorKey(vendor) || 'UNKNOWN_VENDOR';
    const normalizedAmount = normalizeMoney(amount);
    const amountKey = normalizedAmount !== null ? normalizedAmount.toFixed(2) : 'UNKNOWN_AMOUNT';
    const referenceKey = normalizeInvoiceNo(invoiceNo) || String(date || '').replace(/[^0-9]/g, '') || 'NO_REFERENCE';
    const rawFingerprint = `${vendorKey}|${amountKey}|${referenceKey}`;
    return `AP1_${crypto.createHash('sha256').update(rawFingerprint).digest('hex')}`;
}

function isValidDateKey(value) {
    const dateStr = String(value || '');
    if (!/^\d{8}$/.test(dateStr)) return false;
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return year >= 2020 && year <= 2035
        && parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

async function findArchivedFingerprint(fingerprint, excludeFileId) {
    const response = await drive.files.list({
        q: `appProperties has { key='apFingerprint' and value='${fingerprint}' } and trashed = false`,
        fields: 'files(id, name, webViewLink)',
        pageSize: 10,
    });
    return (response.data.files || []).find(file => file.id !== excludeFileId) || null;
}

function normalizeMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function withTimeout(promise, timeoutMs, model) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Gemini ${model} 超过 ${Math.round(timeoutMs / 1000)} 秒没有回应`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}


async function analyzeInvoiceWithFallback({ fileData, mimeType, prompt, responseSchema }) {
    const modelsToTry = [...new Set([
        GEMINI_MODEL,
        GEMINI_FALLBACK_MODEL
    ].filter(Boolean))];

    const errors = [];

    for (const model of modelsToTry) {
        try {
            console.log(`🤖 正在使用 Gemini 模型扫描：${model}`);

            const result = await withTimeout(ai.models.generateContent({
                model,
                contents: [{
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                data: Buffer.from(fileData).toString('base64'),
                                mimeType
                            }
                        },
                        { text: prompt }
                    ]
                }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema,
                    temperature: 0.1,
                            httpOptions: {
                        timeout: GEMINI_REQUEST_TIMEOUT_MS,
                        headers: {}
                    }
                }
            }), GEMINI_REQUEST_TIMEOUT_MS, model);

            if (!result?.text?.trim()) {
                throw new Error('模型没有返回可读取的扫描结果');
            }

            console.log(`✅ 扫描成功，实际使用模型：${model}`);
            return { result, modelUsed: model };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`⚠️ 模型 ${model} 扫描失败：${message}`);
            errors.push(`${model}: ${message}`);
        }
    }

    throw new Error(`主模型与备用模型均无法完成扫描。${errors.join(' | ')}`);
}

// 供应商别名：AI 读出来的写法每次不同，统一成系统里的正式名称
// 加新的：{ match: [关键字...], name: '正式名称', supplierId: 'ID' }
const VENDOR_ALIASES = [
    { match: ['MRDIY', 'MRD.I.Y'],            name: 'MR D.I.Y. (KUCHAI)',   supplierId: '8158' },
    { match: ['99SPEEDMART', '99SPEED'],      name: '99 SPEEDMART SDN BHD', supplierId: '8030' },
    { match: ['ONGTUANCHUAN', 'ONGTUANGCHUAN', 'ONGTUAN'], name: 'ONG TUAN CHUAN', supplierId: '8159' },
    { match: ['FULLYFISHERY'],                name: 'FULLY FISHERY (M) SDN BHD', supplierId: '8204' },
];


function squashVendorName(raw) {
    return String(raw || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]/g, '');
}

/**
 * 供应商名称有没有命中某个关键字。
 * ⚠️ 以前是「整串压平后 includes」：S&T 压平成 ST，
 *    结果 RESTAURANT、STATIONERY、PLASTIC、ST FROZEN 全部被当成 S&T 归进 8129。
 * 现在：
 *   · 关键字压平后 ≥ 6 个字（FULLYFISHERY、ONGTUAN…）→ 照旧压平比对（容忍空格、括号、点）
 *   · 短关键字（S&T、TCM、HT ONE、MRDIY…）→ 必须是「完整的字」：
 *     供应商名称拆成一个个字，连续几个字拼起来刚好等于关键字才算
 *     （MR D.I.Y. → MR+D+I+Y = MRDIY ✓；RESTAURANT 里的 ST ✗）
 */
const LONG_KEYWORD = 6;
function vendorTokens(raw) {
    return String(raw || '').toUpperCase().replace(/&/g, ' AND ').split(/[^A-Z0-9]+/).filter(Boolean);
}
function vendorMatchesKeyword(rawVendor, keyword) {
    const k = squashVendorName(keyword);
    if (!k) return false;
    if (k.length >= LONG_KEYWORD) return squashVendorName(rawVendor).includes(k);
    const t = vendorTokens(rawVendor);
    for (let i = 0; i < t.length; i++) {
        let acc = '';
        for (let j = i; j < t.length && acc.length < k.length; j++) {
            acc += t[j];
            if (acc === k) return true;
        }
    }
    return false;
}
/** 命中的关键字里最长的那个（越长越具体），没命中 = 0 */
function bestKeywordScore(rawVendor, keywords) {
    let best = 0;
    for (const kw of keywords || []) {
        if (vendorMatchesKeyword(rawVendor, kw)) best = Math.max(best, squashVendorName(kw).length);
    }
    return best;
}

/**
 * 档名用的供应商片段。
 * ⚠️ 一定要先 toUpperCase 再替换 —— 顺序反过来会把所有小写字母变成底线，
 *    "Fully Fishery (M) Sdn Bhd" 会变成 F_____F________M__SDN__BHD。
 */
function vendorForFileName(raw) {
    const cleaned = String(raw || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || 'UNKNOWN';
}


function applyVendorAlias(rawVendor, aliases = VENDOR_ALIASES) {
    const squashed = squashVendorName(rawVendor);
    if (!squashed) return { vendor: rawVendor, supplierId: '', aliasHit: false };

    // 多条别名都命中 → 用关键字最长（最具体）的那条
    let best = null;
    let bestScore = 0;
    for (const alias of (aliases || VENDOR_ALIASES)) {
        const score = bestKeywordScore(rawVendor, alias.match);
        if (score > bestScore) { best = alias; bestScore = score; }
    }
    if (best) return { vendor: best.name, supplierId: best.supplierId, aliasHit: true };
    return { vendor: rawVendor, supplierId: '', aliasHit: false };
}

/**
 * 明细行清洗。
 * ⚠️ 一律不改数字，只做格式正规化与丢弃空行。
 *    合计对不上时只标记 needsReview，绝不「帮你算平」—— 算平就掩盖了读错。
 */
const FEE_ROW_PATTERN = /(DELIVERY|FREIGHT|TRANSPORT|SERVICE\s*CHARGE|SST|GST|TAX|ROUND|DISCOUNT|SUB\s*TOTAL|TOTAL|运费|送货|服务费|税|折扣|合计|总计)/i;

function normalizeLineItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
        .map(it => ({
            description: String(it?.description || '').trim(),
            item_code: String(it?.item_code || '').trim(),
            qty: normalizeMoney(it?.qty) ?? 0,
            unit: String(it?.unit || '').trim().toUpperCase(),
            unit_price: normalizeMoney(it?.unit_price) ?? 0,
            amount: normalizeMoney(it?.amount) ?? 0,
        }))
        .filter(it => it.description !== '' || it.amount !== 0)
        .map(it => ({
            ...it,
            // 费用行标出来，前端可以不算进「进货数量」
            isFeeRow: FEE_ROW_PATTERN.test(it.description),
        }));
}

function validateInvoiceExtraction(aiData, aliases = VENDOR_ALIASES) {
    const reviewReasons = [];
    let dateStr = String(aiData.date || '').trim();
    let yearMonth = '';

    if (/^\d{8}$/.test(dateStr)) {
        const year = parseInt(dateStr.substring(0, 4), 10);
        const month = parseInt(dateStr.substring(4, 6), 10);

        if (isValidDateKey(dateStr)) {
            yearMonth = `${year}_${String(month).padStart(2, '0')}`;
        } else {
            dateStr = '';
            reviewReasons.push('INVALID_OR_MISSING_DATE');
        }
    } else {
        dateStr = '';
        reviewReasons.push('INVALID_OR_MISSING_DATE');
    }

    const vendor = String(aiData.vendor || '').trim();
    let normalizedVendor = vendor && !vendor.toUpperCase().includes('UNKNOWN')
        ? vendor
        : 'UNKNOWN_VENDOR';
    if (normalizedVendor === 'UNKNOWN_VENDOR') reviewReasons.push('UNKNOWN_VENDOR');

    // 🏷️ 套用供应商别名表，把 MR DIY / 99 Speedmart 之类的写法统一
    let matchedSupplierId = '';
    if (normalizedVendor !== 'UNKNOWN_VENDOR') {
        const aliasResult = applyVendorAlias(normalizedVendor, aliases);
        normalizedVendor = aliasResult.vendor;
        matchedSupplierId = aliasResult.supplierId;
    }

    const amount = normalizeMoney(aiData.amount);
    const normalizedAmount = amount !== null && amount > 0 ? amount : 0;
    if (normalizedAmount <= 0) reviewReasons.push('UNCLEAR_AMOUNT');

    const rawCurrency = String(aiData.currency || '').trim().toUpperCase();
    const currency = rawCurrency === 'RM' ? 'MYR' : rawCurrency;
    if (!currency || currency === 'UNKNOWN') reviewReasons.push('UNKNOWN_CURRENCY');
    else if (currency !== 'MYR') reviewReasons.push('UNSUPPORTED_CURRENCY');

    const lineItems = normalizeLineItems(aiData.line_items);
    const lineSum = lineItems.reduce((sum, it) => sum + (it.amount || 0), 0);
    const roundedLineSum = normalizeMoney(lineSum) ?? 0;
    // 明细加起来跟总额差超过 1 分就要人看 —— 可能漏读一行，或读到别的栏
    const lineItemsMatchTotal = lineItems.length === 0
        ? null
        : Math.abs(roundedLineSum - (normalizeMoney(aiData.amount) ?? 0)) <= 0.01;
    if (lineItemsMatchTotal === false) reviewReasons.push('LINE_ITEMS_MISMATCH');

    return {
        ...aiData,
        vendor: normalizedVendor,
        matchedSupplierId,
        line_items: lineItems,
        lineItemsTotal: roundedLineSum,
        lineItemsMatchTotal,
        date: dateStr,
        year_month: yearMonth,
        amount: normalizedAmount,
        currency: currency || 'UNKNOWN',
        invoice_no: normalizeInvoiceNo(aiData.invoice_no),
        needsReview: reviewReasons.length > 0,
        reviewReason: reviewReasons[0],
        reviewReasons,
    };
}

// API: Health Check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: "ap-ai-service",
        model: GEMINI_MODEL,
        fallbackModel: GEMINI_FALLBACK_MODEL,
        requestTimeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
        failoverEnabled: true,
        // 用来确认部署到底有没有生效：旧版本不会有 features 这一栏
        features: {
            lineItems: true,
            batchScan: true,
            scanCache: true,
            vendorConfigApi: true,
        },
        batchDefault: SCAN_BATCH_DEFAULT,
        timestamp: new Date().toISOString()
    });
});

// API: 扫描暂存区（一次扫多张）
const SCAN_PROMPT = `You are a highly precise financial auditor AI. Analyze this invoice/receipt.
CURRENT YEAR IS ${new Date().getFullYear()}.
STRICT EXTRACTION RULES:
1. Date: Check carefully. Often formatted as DD/MM/YYYY locally. Convert to YYYYMMDD.
2. Amount: Extract the FINAL AMOUNT DUE or GRAND TOTAL. NEVER extract 'Cash Tendered', 'Change', or 'Subtotal'.
3. Invoice No: Look for INV No, Receipt No, or Tax Invoice No. Return the exact alphanumeric code.
4. Currency: Return the ISO currency code. Malaysian Ringgit must be returned as MYR. Never assume MYR when another currency is printed.
5. Vendor — WHO WE PAID, never ourselves:
   "KIM LIAN KEE", "金莲记", "KIM LIAN KEE GROUP" and "金莲记甲洞 / Kim Lian Kee - Kepong" are OUR OWN company. They are NEVER the vendor.
   If the document is our own self-issued voucher (it says "CASH BILL", "采购支出凭单", "支出凭单", "PAYMENT VOUCHER", or has a "收款人 PAYEE" field),
   the vendor is the name printed in the PAYEE field — not the letterhead at the top.
   For a normal supplier invoice or receipt, the vendor is the letterhead company as usual.
6. Vendor spelling: return the store name as printed. Do not merge different branches into one name.
7. Line items — copy the table exactly, never invent:
   Return one entry per printed line in the items table. For each line:
     description  = the item description as printed (keep the original language, keep codes like WP077-XXJH26 out of it).
     item_code    = the supplier's own item/product code if a code column exists, else empty string.
     qty          = the number in the Qty / Quantity column. If the qty column reads "24.00 KG", qty is 24 and unit is "KG".
     unit         = the unit printed next to the quantity (KG, CTN, PKT, BTL, 项, 件...). Empty string if none.
     unit_price   = the Price/Unit or Unit Price column.
     amount       = the line Amount / Total column.
   Rules:
     - Do NOT include delivery fee, freight, service charge, tax, rounding, discount or grand-total rows as items.
       Those belong in the totals, not in line_items.
     - If the document has no itemised table at all (a plain receipt with only a total), return an empty array.
     - Never guess a quantity that is not printed. If a line has no quantity, use 0.
     - Keep the printed order.`;

const SCAN_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        vendor: { type: Type.STRING, description: "Main store or company name in English upper-case. Exclude suffixes like SDN BHD, ENTERPRISE, PLT." },
        date: { type: Type.STRING, description: "Exact invoice date in YYYYMMDD format. MUST be 8 digits." },
        year_month: { type: Type.STRING, description: "Exact year and month in YYYY_MM format." },
        amount: { type: Type.NUMBER, description: "FINAL GRAND TOTAL or AMOUNT DUE as a float." },
        invoice_no: { type: Type.STRING, description: "Clean alphanumeric Invoice No. If none exists, return 'UNKNOWN'." },
        currency: { type: Type.STRING, description: "ISO 4217 currency code such as MYR, SGD, USD, or CNY. Return UNKNOWN if it is not visible." },
        line_items: {
            type: Type.ARRAY,
            description: "One entry per printed line in the items table. Empty array if the document has no itemised table.",
            items: {
                type: Type.OBJECT,
                properties: {
                    description: { type: Type.STRING, description: "Item description exactly as printed." },
                    item_code: { type: Type.STRING, description: "Supplier's own item code if printed, else empty string." },
                    qty: { type: Type.NUMBER, description: "Quantity as printed. 0 if no quantity is printed." },
                    unit: { type: Type.STRING, description: "Unit printed with the quantity (KG, CTN, PKT...). Empty string if none." },
                    unit_price: { type: Type.NUMBER, description: "Price per unit as printed. 0 if not printed." },
                    amount: { type: Type.NUMBER, description: "Line total as printed." }
                },
                required: ["description", "item_code", "qty", "unit", "unit_price", "amount"]
            }
        }
    },
    required: ["vendor", "date", "year_month", "amount", "invoice_no", "currency", "line_items"],
};

// 扫描结果快取：同一个档案没改过就不重打 Gemini（重开画面 / 重扫都是免费的）
// ⚠️ 存在记忆体里，Cloud Run 换实例就没了 —— 只是省钱，不是持久化
const SCAN_CACHE_TTL_MS = Number(process.env.SCAN_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const SCAN_CACHE_MAX = Number(process.env.SCAN_CACHE_MAX || 300);
const scanCache = new Map();   // key: fileId|modifiedTime → { at, payload }

function readScanCache(key) {
    const hit = scanCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > SCAN_CACHE_TTL_MS) { scanCache.delete(key); return null; }
    return hit.payload;
}
function writeScanCache(key, payload) {
    if (scanCache.size >= SCAN_CACHE_MAX) {
        const oldest = scanCache.keys().next().value;
        if (oldest) scanCache.delete(oldest);
    }
    scanCache.set(key, { at: Date.now(), payload });
}

// 连续失败的档案：失败满次数就自动移进保留区，不然它每一批都被扫、每次都失败、每次都付钱
const SCAN_FAIL_LIMIT = Number(process.env.SCAN_FAIL_LIMIT || 3);
const scanFailCounts = new Map();

const SCAN_BATCH_DEFAULT = Number(process.env.SCAN_BATCH_DEFAULT || 3);
const SCAN_BATCH_MAX = Number(process.env.SCAN_BATCH_MAX || 25);
// 并发别开太大：Gemini 会 429，Drive 也有配额
const SCAN_CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 3));

async function scanOneFile(file, { useCache = true } = {}) {
    const cacheKey = `${file.id}|${file.modifiedTime || ''}`;
    if (useCache) {
        const cached = readScanCache(cacheKey);
        if (cached) {
            console.log(`♻️ 用快取，不重打 Gemini: ${file.name}`);
            return { ...cached, fromCache: true };
        }
    }

    const fileData = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });

    // 👑 送去 Gemini 之前先检查文件本身，不然坏档只会回一句看不懂的「400 INVALID_ARGUMENT」
    const byteLength = fileData?.data?.byteLength ?? 0;
    if (byteLength === 0) {
        throw new Error('文件是空的（0 KB），扫描机上传没成功。请重新扫描上传，再把这个空档从暂存区删掉。');
    }
    // Gemini 直接夹带文件上限约 20MB（base64 会再变大 1/3），超过就会 400
    const MAX_INLINE_BYTES = 14 * 1024 * 1024;
    if (byteLength > MAX_INLINE_BYTES) {
        throw new Error(`文件太大（${(byteLength / 1024 / 1024).toFixed(1)} MB），超过 AI 扫描上限约 14 MB。请用较低解析度（200–300 dpi）或黑白模式重新扫描。`);
    }

    const { result, modelUsed } = await analyzeInvoiceWithFallback({
        fileData: fileData.data,
        mimeType: file.mimeType,
        prompt: SCAN_PROMPT,
        responseSchema: SCAN_SCHEMA
    });

    let aiData = JSON.parse(result.text.trim());
    aiData = validateInvoiceExtraction(aiData, VENDOR_ALIASES);

    const fingerprint = buildInvoiceFingerprint(aiData.vendor, aiData.amount, aiData.invoice_no, aiData.date);
    const duplicateArchive = await findArchivedFingerprint(fingerprint, file.id);

    const payload = {
        fileId: file.id,
        originalName: file.name,
        mimeType: file.mimeType,
        tempLink: file.webViewLink,
        vendor: aiData.vendor,
        date: aiData.date || '',
        year_month: aiData.year_month || '',
        amount: aiData.amount,
        currency: aiData.currency,
        invoice_no: aiData.invoice_no,
        line_items: aiData.line_items || [],
        lineItemsTotal: aiData.lineItemsTotal ?? 0,
        lineItemsMatchTotal: aiData.lineItemsMatchTotal,
        fingerprint,
        modelUsed,
        isDuplicate: !!duplicateArchive,
        duplicateFileName: duplicateArchive?.name || '',
        duplicateFileLink: duplicateArchive?.webViewLink || '',
        needsReview: !!aiData.needsReview,
        reviewReason: aiData.reviewReason,
        reviewReasons: aiData.reviewReasons || [],
    };

    writeScanCache(cacheKey, payload);
    return { ...payload, fromCache: false };
}

/** 失败满 SCAN_FAIL_LIMIT 次就移进保留区，避免无止境重扫烧钱 */
async function quarantineFailedFile(file, errMessage) {
    try {
        const meta = await drive.files.get({ fileId: file.id, fields: 'parents' });
        const previousParents = (meta.data.parents || []).join(',');
        const holdingFolderId = await getOrCreateFolder("_HOLDING_AREA", currentStagingFolderId);
        await drive.files.update({
            fileId: file.id,
            addParents: holdingFolderId,
            removeParents: previousParents,
            requestBody: { appProperties: { apScanFailed: 'SCAN_ERROR', apScanFailedMsg: String(errMessage).slice(0, 100) } },
            fields: 'id'
        });
        scanFailCounts.delete(file.id);
        console.warn(`⏸️ 连续失败 ${SCAN_FAIL_LIMIT} 次，已移入保留区: ${file.name}`);
        return true;
    } catch (err) {
        console.error(`💥 移入保留区失败: ${file.name} — ${err.message}`);
        return false;
    }
}

app.get('/api/scan-pending', async (req, res) => {
    const claimed = [];
    try {
        const requested = Number(req.query.limit);
        const limit = Math.min(
            SCAN_BATCH_MAX,
            Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : SCAN_BATCH_DEFAULT)
        );

        const candidates = [];
        let pageToken;
        let supportedFileFound = false;

        do {
            const response = await drive.files.list({
                q: `'${currentStagingFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime)',
                orderBy: 'createdTime asc',
                pageSize: 100,
                pageToken,
            });

            const targetFiles = (response.data.files || []).filter(file =>
                file.mimeType === 'application/pdf' || String(file.mimeType || '').startsWith('image/')
            );
            supportedFileFound = supportedFileFound || targetFiles.length > 0;
            targetFiles.forEach(f => { if (!scanningLocks.has(f.id)) candidates.push(f); });
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        if (!supportedFileFound) {
            return res.json({ success: true, message: "暂存区没有可扫描的 PDF 或图片", data: [], total: 0, remaining: 0 });
        }
        if (candidates.length === 0) {
            return res.status(409).json({ success: false, code: 'FILE_ALREADY_SCANNING', error: "文件正在处理中，请稍后再试" });
        }

        const batch = candidates.slice(0, limit);
        batch.forEach(f => { scanningLocks.add(f.id); claimed.push(f.id); });

        console.log(`🧠 批次扫描 ${batch.length} 张（暂存区共 ${candidates.length} 张待扫）`);

        const results = new Array(batch.length);
        const failures = [];
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const i = cursor++;
                if (i >= batch.length) return;
                const file = batch[i];
                try {
                    results[i] = await scanOneFile(file, { useCache: req.query.refresh !== '1' });
                    scanFailCounts.delete(file.id);
                } catch (err) {
                    const fails = (scanFailCounts.get(file.id) || 0) + 1;
                    scanFailCounts.set(file.id, fails);
                    console.error(`⚠️ 扫描失败 (${fails}/${SCAN_FAIL_LIMIT}): ${file.name} — ${err.message}`);
                    let quarantined = false;
                    if (fails >= SCAN_FAIL_LIMIT) quarantined = await quarantineFailedFile(file, err.message);
                    failures.push({ fileId: file.id, originalName: file.name, error: err.message, attempts: fails, quarantined });
                    results[i] = null;
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, batch.length) }, worker));

        const data = results.filter(Boolean);
        const cacheHits = data.filter(d => d.fromCache).length;
        console.log(`✅ 批次完成：成功 ${data.length}（快取 ${cacheHits}），失败 ${failures.length}`);

        res.json({
            success: true,
            data,
            total: candidates.length,
            scanned: batch.length,
            remaining: Math.max(0, candidates.length - batch.length),
            cacheHits,
            failures,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, code: "SCAN_ERROR", error: err.message });
    } finally {
        claimed.forEach(id => scanningLocks.delete(id));
    }
});

// API: 内建的供应商清单与别名（设定页拿来当「还原内建」的基准）
// 自订设定存在 ERP 的 Firestore，不经过这里
app.get('/api/vendor-config', (req, res) => {
    res.json({
        success: true,
        source: 'builtin',
        builtinSuppliers: whitelist1_MainSuppliers,
        builtinAliases: VENDOR_ALIASES,
    });
});

// API: 废弃 → _REJECTED_TRASH_BIN
app.post('/api/delete-pending', async (req, res) => {
    try {
        const { fileId } = req.body;
        if (!fileId) return res.status(400).json({ success: false, code: "MISSING_FILE_ID", error: "缺少参数 fileId" });
        if (await rejectIfOutsideStaging(fileId, res)) return;

        console.log(`🗑️ [废单扔弃] 正在将文件移出暂存区, ID: ${fileId}`);
        const file = await drive.files.get({ fileId: fileId, fields: 'parents' });
        const previousParents = (file.data.parents || []).join(',');

        const trashFolderId = await getOrCreateFolder("_REJECTED_TRASH_BIN", currentStagingFolderId);

        await drive.files.update({ fileId: fileId, addParents: trashFolderId, removeParents: previousParents, fields: 'id' });

        res.json({ success: true, message: "账单已成功移入隔离废纸篓" });
    } catch (err) {
        console.error("💥 废弃账单失败:", err.message);
        res.status(500).json({ success: false, code: "DELETE_ERROR", error: err.message });
    }
});

// API: 挂起 → _HOLDING_AREA
app.post('/api/hold-pending', async (req, res) => {
    try {
        const { fileId, reason } = req.body;
        if (!fileId) return res.status(400).json({ success: false, code: "MISSING_FILE_ID", error: "缺少参数 fileId" });

        const validReasons = ['MANUAL_REVIEW_REQUIRED', 'NO_AP_MATCH', 'UNCLEAR_AMOUNT', 'UNCLEAR_DATE', 'UNKNOWN_VENDOR', 'POSSIBLE_DUPLICATE', 'OTHER'];
        const holdReason = validReasons.includes(reason) ? reason : 'OTHER';
        if (await rejectIfOutsideStaging(fileId, res)) return;

        console.log(`⏸️ [挂起暂存] 将文件移入保留区, ID: ${fileId}, 理由: ${holdReason}`);
        
        const file = await drive.files.get({ fileId: fileId, fields: 'parents, name, webViewLink' });
        const previousParents = (file.data.parents || []).join(',');

        const holdingFolderId = await getOrCreateFolder("_HOLDING_AREA", currentStagingFolderId);

        const updatedFile = await drive.files.update({ 
            fileId: fileId, 
            addParents: holdingFolderId, 
            removeParents: previousParents, 
            fields: 'id, name, webViewLink' 
        });

        res.json({ 
            success: true, 
            message: `账单已挂起 (原因: ${holdReason})`,
            finalDriveLink: updatedFile.data.webViewLink
        });
    } catch (err) {
        console.error("💥 挂起账单失败:", err.message);
        res.status(500).json({ success: false, code: "HOLD_ERROR", error: err.message });
    }
});

// API: 收单归档
app.post('/api/commit-bill', async (req, res) => {
    try {
        const { fileId, originalName, mimeType, verifiedVendor, verifiedDate, verifiedAmount, verifiedInvoiceNo, forceCommit } = req.body;
        if (!fileId) return res.status(400).json({ success: false, code: "MISSING_FILE_ID", error: "缺少参数 fileId" });
        if (await rejectIfOutsideStaging(fileId, res)) return;
        console.log(`📦 收单归档指令: [${verifiedVendor}]`);

        const safeOriginalName = String(originalName || 'invoice');
        const safeMimeType = String(mimeType || 'application/pdf');
        const fileExt = safeOriginalName.includes('.')
            ? safeOriginalName.substring(safeOriginalName.lastIndexOf('.'))
            : (safeMimeType.startsWith('image/') ? '.jpg' : '.pdf');
        
        let customDateStr = '(unk)';
        if (verifiedDate && typeof verifiedDate === 'string' && verifiedDate.length === 8) {
            customDateStr = verifiedDate;
        } else if (verifiedDate) {
            const dateObj = new Date(verifiedDate);
            if (!isNaN(dateObj.getTime())) {
                const dayPrefix = String(dateObj.getDate()).padStart(2, '0');
                const monthPrefix = String(dateObj.getMonth() + 1).padStart(2, '0');
                const yearPrefix = dateObj.getFullYear();
                customDateStr = `${yearPrefix}${monthPrefix}${dayPrefix}`;
            }
        }
        if (!isValidDateKey(customDateStr)) customDateStr = '(unk)';

        // 人工确认过的名字也要过一次别名表，否则 "Ong Tuang Chuan" 这种拼法配不到 8159
        // vendorConfig 由 ERP 前端带来（存在 Firestore），没带就用内建表
        const { suppliers: activeSuppliers, aliases: activeAliases } = resolveVendorConfig(req.body?.vendorConfig);
        const aliasOnCommit = applyVendorAlias(String(verifiedVendor || '').trim(), activeAliases);
        const cleanVendorValue = aliasOnCommit.aliasHit
            ? aliasOnCommit.vendor
            : String(verifiedVendor || '').trim();
        const normalizedAmount = normalizeMoney(verifiedAmount);
        if (!cleanVendorValue || normalizeVendorKey(cleanVendorValue) === 'UNKNOWNVENDOR') {
            return res.status(400).json({ success: false, code: 'VERIFICATION_REQUIRED', error: '供应商名称无效，请人工确认后再归档。' });
        }
        if (customDateStr === '(unk)') {
            return res.status(400).json({ success: false, code: 'VERIFICATION_REQUIRED', error: '账单日期无效，请人工确认后再归档。' });
        }
        if (normalizedAmount === null || normalizedAmount <= 0) {
            return res.status(400).json({ success: false, code: 'VERIFICATION_REQUIRED', error: '账单金额必须大于 RM0.00。' });
        }

        const yearMonthFolder = `${customDateStr.substring(0,4)}_${customDateStr.substring(4,6)}`;
        const formattedAmountStr = normalizedAmount.toFixed(2);
        const normalizedInvoiceNo = normalizeInvoiceNo(verifiedInvoiceNo);
        const cleanInvoiceNo = normalizedInvoiceNo || 'NO_INV';
        const fingerprint = buildInvoiceFingerprint(cleanVendorValue, normalizedAmount, normalizedInvoiceNo, customDateStr);

        let targetFolderId, finalName;
        let matchedId = null;
        let matchedConfig = null;

        // 压平成纯英数再比对：大小写、空格、括号、点都不影响
        // 例如 "Fully Fishery (M) Sdn Bhd" → FULLYFISHERYMSDNBHD，含 FULLYFISHERY
        // ⚠️ 不再是「第一家命中就算」：几家都命中时取关键字最长（最具体）的那家，
        //    短关键字必须是完整的字（见 vendorMatchesKeyword）
        const squashedVendor = squashVendorName(cleanVendorValue);
        let bestScore = 0;
        for (const [id, config] of Object.entries(activeSuppliers)) {
            const score = bestKeywordScore(cleanVendorValue, config.keywords);
            if (score > bestScore) {
                bestScore = score;
                matchedId = id;
                matchedConfig = config;
            }
        }
        // 别名表直接指定了供应商 ID → 以别名为准
        if (aliasOnCommit.aliasHit && aliasOnCommit.supplierId && activeSuppliers[aliasOnCommit.supplierId]) {
            matchedId = aliasOnCommit.supplierId;
            matchedConfig = activeSuppliers[aliasOnCommit.supplierId];
        }

        if (matchedId && matchedConfig) {
            targetFolderId = await getOrCreateFolder(matchedConfig.folderName, mainSuppliersBaseFolderId);
            const vendorString = matchedConfig.folderName.replace(/^\d{4}_/, ''); 
            finalName = `${customDateStr}_${vendorString}_${cleanInvoiceNo}_RM${formattedAmountStr}${fileExt}`;
        } else if (whitelist2_BankTransfers.some(kw => squashedVendor.includes(squashVendorName(kw))) || normalizedAmount >= 1000) {
            targetFolderId = await getOrCreateFolder("BIG_AMOUNT_TRANSFERS", mainSuppliersBaseFolderId);
            const cleanVendor = vendorForFileName(cleanVendorValue);
            finalName = `${customDateStr}_BANK_${cleanVendor}_${cleanInvoiceNo}_RM${formattedAmountStr}${fileExt}`;
        } else {
            targetFolderId = await getOrCreateFolder(yearMonthFolder, pettyCashBaseFolderId);
            const cleanVendor = vendorForFileName(cleanVendorValue);
            finalName = `PETTY_CASH_${customDateStr}_${cleanVendor}_${cleanInvoiceNo}_RM${formattedAmountStr}${fileExt}`;
        }

        const [duplicateFingerprintFile, isAlreadyArchived] = await Promise.all([
            findArchivedFingerprint(fingerprint, fileId),
            checkFileExistsInFolder(targetFolderId, finalName),
        ]);

        if ((duplicateFingerprintFile || isAlreadyArchived) && !forceCommit) {
            console.warn(`🛑 [拦截物理搬家] 发现重复账单: ${finalName}`);
            return res.status(409).json({
                success: false,
                code: "DUPLICATE_ARCHIVE_DETECTED",
                duplicateFileName: duplicateFingerprintFile?.name || finalName,
                duplicateFileLink: duplicateFingerprintFile?.webViewLink || '',
                error: `归档区已经存在相同账单（${duplicateFingerprintFile?.name || finalName}）。请确认是否仍要另存为重复件。`
            });
        }

        if ((duplicateFingerprintFile || isAlreadyArchived) && forceCommit) {
            const duplicateSuffix = `_DUP_${Date.now()}`;
            finalName = finalName.endsWith(fileExt)
                ? `${finalName.slice(0, -fileExt.length)}${duplicateSuffix}${fileExt}`
                : `${finalName}${duplicateSuffix}`;
        }

        const file = await drive.files.get({ fileId: fileId, fields: 'parents' });
        const previousParents = (file.data.parents || []).join(',');
        
        const updatedFile = await drive.files.update({
            fileId: fileId,
            addParents: targetFolderId,
            removeParents: previousParents,
            requestBody: {
                name: finalName,
                appProperties: {
                    apFingerprint: fingerprint,
                    apVerifiedAt: new Date().toISOString(),
                },
            },
            fields: 'id, name, webViewLink'
        });

        console.log(`✅ 搬家完成！新文件名: ${finalName}`);
        res.json({ success: true, finalDriveLink: updatedFile.data.webViewLink, finalFileName: finalName, fingerprint });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, code: "COMMIT_ERROR", error: err.message });
    }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`AP AI service running on port ${PORT}`);
});
