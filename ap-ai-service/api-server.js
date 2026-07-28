const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { google } = require('googleapis');
// Set global options for googleapis, including connection timeouts to prevent infinite hangs
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

/**
 * 🔐 内部调用闸门 (Internal Gate)
 * ---------------------------------------------------------------
 * 本服务的 Service Account 持有完整 Drive 权限，绝不能对公网开放。
 * 只接受来自 ERP 后端 (server.ts) 的调用，凭 X-Internal-Key 识别。
 * 密钥只存在于两边的 Cloud Run 环境变量，不会进入浏览器。
 *
 * /health 不受此限（Cloud Run 健康检查需要）。
 */
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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_REQUEST_TIMEOUT_MS = Math.max(
    15000,
    Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 60000)
);

// Cloud Run 优先使用 Service Account，若有 GOOGLE_APPLICATION_CREDENTIALS 会自动读取
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
    "8039": { folderName: "8039_OCEAN_ICE_INDUSTRIES", keywords: ["OCEAN ICE INDUSTRIES", "OCEAN ICE"] },
    "8047": { folderName: "8047_SHOPEE_MOBILE_MALAYSIA", keywords: ["SHOPEE", "SHOPEE MOBILE", "SHOPEEPAY"] },
    "8050": { folderName: "8050_TTF_MARKETING_HOLDINGS_SDN_BHD", keywords: ["TTF MARKETING"] },
    "8066": { folderName: "8066_HO_PRINTING", keywords: ["HO PRINTING"] },
    "8072": { folderName: "8072_EVO_PRINT_LABEL_SDN_BHD", keywords: ["EVO PRINT"] },
    "8084": { folderName: "8084_EK_FRESH", keywords: ["EK FRESH", "EKFRESH"] },
    "8085": { folderName: "8085_CHOI_SENG_TRADING", keywords: ["CHOI SENG TRADING", "CHOI SENG"] },
    "8099": { folderName: "8099_RIPON_MIAH", keywords: ["RIPON MIAH"] },
    "8102": { folderName: "8102_KLCC_BIHUN_WEE_HAI", keywords: ["KLCC BIHUN"] },
    "8103": { folderName: "8103_KY_MARKETING_RENOVATION_ENTERPRISE", keywords: ["KY MARKETING", "KY RENOVATION"] },
    "8107": { folderName: "8107_MISS_CUTE_SEAFOOD", keywords: ["MISS CUTE SEAFOOD", "MISS CUTE"] },
    "8118": { folderName: "8118_HUANG_LONG_CREATION", keywords: ["HUANG LONG CREATION", "HUANG LONG"] },
    "8121": { folderName: "8121_KIM_LIAN_KEE_HOLDINGS_SDN_BHD", keywords: ["KIM LIAN KEE HOLDINGS", "KIM_LIAN_KEE_HOLDINGS"] },
    "8129": { folderName: "8129_S_AND_T_WORLD_TRADING", keywords: ["S & T WORLD TRADING", "S AND T", "S&T", "Sy T WORLD"] },
    "8130": { folderName: "8130_PERNIAGAAN_MAHAMAS", keywords: ["PERNIAGAAN MAHAMAS", "MAHAMAS"] },
    "8137": { folderName: "8137_TCM_RESOURCES", keywords: ["TCM RESOURCES", "TCM"] },
    "8147": { folderName: "8147_TELUR_LOW_HIN_CHING", keywords: ["PERNIAGAAN TELUR LOW HIN CHING", "LOW HIN CHING", "TELUR LOW"] },
    "8159": { folderName: "8159_ONG_TUAN_CHUAN", keywords: ["ONG TUAN CHUAN"] },
    "8164": { folderName: "8164_MD_JIBON", keywords: ["MD JIBON", "JIBON"] }
};

const whitelist2_BankTransfers = ["RENTAL", "WATER_SELANGOR", "MAXIS", "INDAH_WATER"];

let scanningLocks = new Set(); 

/**
 * 🔐 Drive Query 转义
 * 供应商名称来自 AI 辨识结果，可能含单引号（例如 O'BRIEN），
 * 直接内插会破坏查询语义甚至被操纵，必须转义。
 */
function escapeDriveQ(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

/**
 * 🔐 父目录白名单校验
 * ---------------------------------------------------------------
 * 只允许操作「暂存区子树」内的档案。
 * 这是纵深防御：即使闸门被绕过，也动不了暂存区以外的任何 Drive 档案。
 */
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

/** 校验失败时直接回 403 并回传 true，供路由 early-return */
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

/**
 * Scan with the configured primary model first, then transparently retry once
 * with the configured fallback model. This prevents a transient Gemini timeout
 * from blocking all AP invoice scans for five minutes.
 */
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
                    // Empty headers ensures the SDK applies this timeout correctly.
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

function validateInvoiceExtraction(aiData) {
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
    const normalizedVendor = vendor && !vendor.toUpperCase().includes('UNKNOWN')
        ? vendor
        : 'UNKNOWN_VENDOR';
    if (normalizedVendor === 'UNKNOWN_VENDOR') reviewReasons.push('UNKNOWN_VENDOR');

    const amount = normalizeMoney(aiData.amount);
    const normalizedAmount = amount !== null && amount > 0 ? amount : 0;
    if (normalizedAmount <= 0) reviewReasons.push('UNCLEAR_AMOUNT');

    const rawCurrency = String(aiData.currency || '').trim().toUpperCase();
    const currency = rawCurrency === 'RM' ? 'MYR' : rawCurrency;
    if (!currency || currency === 'UNKNOWN') reviewReasons.push('UNKNOWN_CURRENCY');
    else if (currency !== 'MYR') reviewReasons.push('UNSUPPORTED_CURRENCY');

    return {
        ...aiData,
        vendor: normalizedVendor,
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

// ==========================================================================
// API: Health Check
// ==========================================================================
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: "ap-ai-service",
        model: GEMINI_MODEL,
        fallbackModel: GEMINI_FALLBACK_MODEL,
        requestTimeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
        failoverEnabled: true,
        timestamp: new Date().toISOString()
    });
});

// ==========================================================================
// API: 获取扫描数据 (On-Demand only)
// ==========================================================================
app.get('/api/scan-pending', async (req, res) => {
    try {
        console.log("🕵️ 前端请求抓取单据...");
        let fileToScan = null;
        let pageToken;
        let supportedFileFound = false;

        do {
            const response = await drive.files.list({
                q: `'${currentStagingFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
                orderBy: 'createdTime asc',
                pageSize: 100,
                pageToken,
            });

            const targetFiles = (response.data.files || []).filter(file =>
                file.mimeType === 'application/pdf' || String(file.mimeType || '').startsWith('image/')
            );
            supportedFileFound = supportedFileFound || targetFiles.length > 0;
            fileToScan = targetFiles.find(file => !scanningLocks.has(file.id)) || null;
            pageToken = response.data.nextPageToken;
        } while (!fileToScan && pageToken);

        if (!supportedFileFound) {
            return res.json({ success: true, message: "暂存区没有可扫描的 PDF 或图片", data: [] });
        }

        if (!fileToScan) {
            return res.status(409).json({ success: false, code: 'FILE_ALREADY_SCANNING', error: "文件正在处理中，请稍后再试" });
        }

        scanningLocks.add(fileToScan.id);

        try {
            console.log(`🧠 开始现场 AI 分析: ${fileToScan.name}`);
            const fileData = await drive.files.get({ fileId: fileToScan.id, alt: 'media' }, { responseType: 'arraybuffer' });
            
            const prompt = `You are a highly precise financial auditor AI. Analyze this invoice/receipt.
            CURRENT YEAR IS ${new Date().getFullYear()}.
            STRICT EXTRACTION RULES:
            1. Date: Check carefully. Often formatted as DD/MM/YYYY locally. Convert to YYYYMMDD.
            2. Amount: Extract the FINAL AMOUNT DUE or GRAND TOTAL. NEVER extract 'Cash Tendered', 'Change', or 'Subtotal'.
            3. Invoice No: Look for INV No, Receipt No, or Tax Invoice No. Return the exact alphanumeric code.
            4. Currency: Return the ISO currency code. Malaysian Ringgit must be returned as MYR. Never assume MYR when another currency is printed.`;

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    vendor: { type: Type.STRING, description: "Main store or company name in English upper-case. Exclude suffixes like SDN BHD, ENTERPRISE, PLT." },
                    date: { type: Type.STRING, description: "Exact invoice date in YYYYMMDD format. MUST be 8 digits." },
                    year_month: { type: Type.STRING, description: "Exact year and month in YYYY_MM format." },
                    amount: { type: Type.NUMBER, description: "FINAL GRAND TOTAL or AMOUNT DUE as a float." },
                    invoice_no: { type: Type.STRING, description: "Clean alphanumeric Invoice No. If none exists, return 'UNKNOWN'." },
                    currency: { type: Type.STRING, description: "ISO 4217 currency code such as MYR, SGD, USD, or CNY. Return UNKNOWN if it is not visible." }
                },
                required: ["vendor", "date", "year_month", "amount", "invoice_no", "currency"],
            };

            const { result, modelUsed } = await analyzeInvoiceWithFallback({
                fileData: fileData.data,
                mimeType: fileToScan.mimeType,
                prompt,
                responseSchema
            });

            let aiData = JSON.parse(result.text.trim());
            aiData = validateInvoiceExtraction(aiData);

            const fingerprint = buildInvoiceFingerprint(
                aiData.vendor,
                aiData.amount,
                aiData.invoice_no,
                aiData.date,
            );
            const duplicateArchive = await findArchivedFingerprint(fingerprint, fileToScan.id);
            
            const payload = {
                fileId: fileToScan.id,
                originalName: fileToScan.name,
                mimeType: fileToScan.mimeType,
                tempLink: fileToScan.webViewLink, 
                vendor: aiData.vendor,
                date: aiData.date || '',
                year_month: aiData.year_month || '',
                amount: aiData.amount,
                currency: aiData.currency,
                invoice_no: aiData.invoice_no,
                fingerprint,
                modelUsed,
                isDuplicate: !!duplicateArchive,
                duplicateFileName: duplicateArchive?.name || '',
                duplicateFileLink: duplicateArchive?.webViewLink || '',
                needsReview: !!aiData.needsReview,
                reviewReason: aiData.reviewReason,
                reviewReasons: aiData.reviewReasons || [],
            };

            res.json({ success: true, data: [payload] });
        } finally {
            scanningLocks.delete(fileToScan.id);
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, code: "SCAN_ERROR", error: err.message });
    }
});

// ==========================================================================
// API: 物理废弃移入隔离区 (Trash Bin)
// ==========================================================================
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

// ==========================================================================
// API: 移入保留区 (Holding Area)
// ==========================================================================
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

// ==========================================================================
// API: 收单归档 (Commit Bill)
// ==========================================================================
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

        const cleanVendorValue = String(verifiedVendor || '').trim();
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

        for (const [id, config] of Object.entries(whitelist1_MainSuppliers)) {
            if (config.keywords.some(kw => String(verifiedVendor).toUpperCase().includes(kw))) {
                matchedId = id;
                matchedConfig = config;
                break;
            }
        }

        if (matchedId && matchedConfig) {
            targetFolderId = await getOrCreateFolder(matchedConfig.folderName, mainSuppliersBaseFolderId);
            const vendorString = matchedConfig.folderName.replace(/^\d{4}_/, ''); 
            finalName = `${customDateStr}_${vendorString}_${cleanInvoiceNo}_RM${formattedAmountStr}${fileExt}`;
        } else if (whitelist2_BankTransfers.some(kw => String(verifiedVendor).toUpperCase().includes(kw)) || normalizedAmount >= 1000) {
            targetFolderId = await getOrCreateFolder("BIG_AMOUNT_TRANSFERS", mainSuppliersBaseFolderId);
            const cleanVendor = verifiedVendor ? String(verifiedVendor).replace(/[^A-Z0-9]/g, "_").toUpperCase() : '(unk)';
            finalName = `${customDateStr}_BANK_${cleanVendor}_${cleanInvoiceNo}_RM${formattedAmountStr}${fileExt}`;
        } else {
            targetFolderId = await getOrCreateFolder(yearMonthFolder, pettyCashBaseFolderId);
            const cleanVendor = verifiedVendor ? String(verifiedVendor).replace(/[^A-Z0-9]/g, "_").toUpperCase() : '(unk)';
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
