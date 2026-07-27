import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import {
  inferContentType,
  localizeRecord,
  localizeTexts,
  type TranslationAudience,
  type TranslationContentType,
  type TranslationTargetLanguage,
  type TranslationTone,
} from "./server/translationService";

// Read model configuration from environment variables
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
const TRANSLATION_MODELS = {
  // Keep GEMINI_TRANSLATION_MODEL as a backwards-compatible alias.
  lite:
    process.env.GEMINI_TRANSLATION_LITE_MODEL ||
    process.env.GEMINI_TRANSLATION_MODEL ||
    "gemini-3.1-flash-lite",
  smart: process.env.GEMINI_TRANSLATION_SMART_MODEL || "gemini-3.5-flash",
};

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets.",
    );
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

function normalizeTranslationTarget(value: unknown): TranslationTargetLanguage | null {
  const normalized = value === "zh_en" ? "zh" : value;
  return normalized === "zh" || normalized === "en" || normalized === "my"
    ? normalized
    : null;
}

// In-memory rate limiting structures
interface RateLimitInfo {
  count: number;
  resetTime: number;
}
const chatLimitStore = new Map<string, RateLimitInfo>();
const translationLimitStore = new Map<string, RateLimitInfo>();

function checkRateLimit(
  ip: string,
  store: Map<string, RateLimitInfo>,
  maxRequests: number,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const info = store.get(ip);

  if (!info || now > info.resetTime) {
    store.set(ip, {
      count: 1,
      resetTime: now + windowMs
    });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (info.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  info.count += 1;
  return { allowed: true, remaining: maxRequests - info.count };
}

const getClientIp = (req: express.Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Secure API endpoint for querying app data context with Gemini
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, chatLimitStore, 5);
      if (!limit.allowed) {
        return res.status(429).json({
          error: "⚠️ 智脑决策调用过于频繁，请等待 1 分钟后再试。"
        });
      }

      const { message, contextData, previousMessages } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets." 
        });
      }

      // Format current operational data context for the model so it can answer with real-time app state
      const systemInstruction = `
# Role
你是由金莲记餐饮团队开发的智能 ERP 系统「御膳智控」的专用高级 AI 智控脑库。你的岗位是「金莲记 Kepong 分店（Kim Lian Kee Kepong）」的专职餐饮财务数据分析师与经营军师。

# Core Directive & Data Isolation (核心数据隔离边界 - 最高刚性约束)
1. 【餐饮财务限定】：你只能访问、读取、分析和讨论与「金莲记餐厅」运营相关的财务（每日结算数据、营收）、收支流转、原材料库存、员工排班、运营日志以及资金转账记录。
2. 【洗车数据绝对隔离】：你必须彻底隔离并过滤任何与汽车美容、洗车服务等不相关的业务数据与术语。面对汽车美容相关提问，统一刚性回复：“抱歉，本脑库当前已切换至金莲记餐饮财务专用，无法处理洗车相关业务查询。”

# Action Permissions (行为权限限定)
1. 【只读安全机制】：你是一个“只读（Read-Only）的财务分析师”。你只能根据后台提供的真实数据上下文进行数据分析。你绝对没有任何修改、删除或写入数据库的权限。当用户发出写入指令时，必须拒绝并引导其手动操作。
2. 【禁止财务胡乱推测】：
   - 严禁脑补/推测/编造任何未在数据上下文中体现的数字（如具体的“利润额”、“差异额”或“差异原因”）。
   - 若系统没有明确传入的数据科目、对账明细、或明确金额，必须诚实回答：“后台对账明细不足，无法精准评估/归因，请由财务人员核实。”
   - 如果 dailySettlements 数组为空，或用户追问无差异的日结算差额原因，必须返回：“当前后台对账数据完整无差异或明细不足，无法精准定位，请查阅当天店面实记。”
3. 【财务机密隔离】：对于“分红 (Dividend)”和“押金 (Deposit)”等非主营流动资金，你必须遵循隔离逻辑，在计算餐厅日常纯利润 (OpEx/P&L) 时，坚决不计入，绝不污染通用营运费用。

# Core Capabilities & Thumb Actions Mapping
1. 📊 今日营收与对账摘要
   - 对比 POS 系统营业额（salesTotal 或 storeHubTotal）与实际流入分类对账状况。
   - 当用户问及"收入" / "营业额" / "进账" / "营业收入"时，必须查询并统计 dailySettlements 数组。
   - 绝不能把“分红/押金”等非主营收入计入。
2. 📉 低库存精准检查
   - 扫描库存并列出 lowStockItems（低于安全阈值 minLevelBase 的项）。
   - 计算和列出低库存项时，必须严格以基础单位（Base Unit，如 baseUnit）和基础数量（currentQtyBase、minLevelBase、deficitBase）进行分析与陈述，避免混淆二/三级单位。
3. 🔍 当日日志异常检查
   - 检查当天运营日志 logs，稽查是否发生任何打碎砂锅、投诉、免单等异常，并可与 dailySettlements 中的 refundTotal 或 varianceReason 进行交叉稽查。
4. 💰 资金与转账摘要
   - 汇总最近资金转账 recentFundTransfers 与账户余额状况。

# Interaction Tone & Style
- 语气专业、严谨、客观。
- 回答问题时多用结构化的**表格**、**数据对比**和**加粗核心数字**。
- 自带信息：你运行在 **${CHAT_MODEL}** 智力大模型引擎之上。

Here is the current real-time app data context:
---------------------------------------------
${JSON.stringify(contextData, null, 2)}
---------------------------------------------
`;

      const contents = [
        ...(previousMessages || []).map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        })),
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ];

      const response = await getAiClient().models.generateContent({
        model: CHAT_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API server error:", error);
      res.status(500).json({ error: error.message || "An error occurred with Gemini." });
    }
  });

  // Smart Localization V2: translate values while all JSON keys remain program-owned.
  app.post("/api/gemini/translate-card", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, translationLimitStore, 10);
      if (!limit.allowed) {
        return res.status(429).json({ error: "⚠️ 翻译服务请求过快，请稍候再试。" });
      }

      const targetLang = normalizeTranslationTarget(req.body?.targetLang ?? "my");
      if (!targetLang) {
        return res.status(400).json({ error: "Unsupported target language." });
      }

      const translated = await localizeRecord(
        getAiClient(),
        req.body?.bundle,
        {
          targetLang,
          contentType: "assessment_content",
          audience: "employee",
          tone: "clear_respectful",
          context: "Restaurant employee performance assessment descriptions and rating options.",
          maxLength: 240,
          preserve: ["S档", "A档", "B档", "C档", "D档"],
        },
        TRANSLATION_MODELS,
      );

      res.json(translated);
    } catch (error: any) {
      console.error("Card Translation V2 API error:", error);
      res.status(500).json({
        error: error.message || "An error occurred with Smart Localization V2.",
      });
    }
  });

  // Backwards-compatible single-text endpoint with semantic localization options.
  app.post("/api/gemini/translate", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, translationLimitStore, 10);
      if (!limit.allowed) {
        return res.status(429).json({ error: "⚠️ 翻译服务请求过快，请稍候再试。" });
      }

      const targetLang = normalizeTranslationTarget(req.body?.targetLang);
      if (!targetLang || typeof req.body?.text !== "string" || !req.body.text.trim()) {
        return res.status(400).json({ error: "A valid text and targetLang are required." });
      }

      const result = await localizeTexts(
        getAiClient(),
        [req.body.text],
        {
          targetLang,
          contentType: (req.body.contentType || inferContentType(req.body.context)) as TranslationContentType,
          audience: req.body.audience as TranslationAudience,
          tone: req.body.tone as TranslationTone,
          context: req.body.context,
          maxLength: req.body.maxLength,
          preserve: req.body.preserve,
        },
        TRANSLATION_MODELS,
      );

      res.json({
        text: result.translations[0],
        original: req.body.text,
        localization: {
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          contentType: result.contentType,
        },
      });
    } catch (error: any) {
      console.error("Translation V2 API error:", error);
      res.status(500).json({
        error: error.message || "An error occurred with Smart Localization V2.",
      });
    }
  });

  // Backwards-compatible batch/single endpoint used by logs and translation management.
  app.post("/api/gemini/translate-my", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, translationLimitStore, 10);
      if (!limit.allowed) {
        return res.status(429).json({ error: "⚠️ 翻译服务请求过快，请稍候再试。" });
      }

      const targetLang = normalizeTranslationTarget(req.body?.targetLang ?? "my");
      if (!targetLang) {
        return res.status(400).json({ error: "Unsupported target language." });
      }

      const hasBatch = Array.isArray(req.body?.texts);
      const inputs = hasBatch ? req.body.texts : [req.body?.text];
      if ((!hasBatch && typeof req.body?.text !== "string") || inputs.length === 0) {
        return res.status(400).json({ error: "Missing text or texts in request body." });
      }

      const result = await localizeTexts(
        getAiClient(),
        inputs,
        {
          targetLang,
          contentType: (req.body.contentType || inferContentType(req.body.context)) as TranslationContentType,
          audience: req.body.audience as TranslationAudience,
          tone: req.body.tone as TranslationTone,
          context: req.body.context,
          maxLength: req.body.maxLength,
          preserve: req.body.preserve,
        },
        TRANSLATION_MODELS,
      );

      const localization = {
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        contentType: result.contentType,
      };
      if (hasBatch) {
        res.json({ translations: result.translations, originals: inputs, localization });
      } else {
        res.json({ translation: result.translations[0], original: inputs[0], localization });
      }
    } catch (error: any) {
      console.error("Translation V2 batch API error:", error);
      res.status(500).json({
        error: error.message || "An error occurred with Smart Localization V2.",
      });
    }
  });

  // Secure AP AI Proxy Endpoint to bypass browser CORS limitations and dynamic preview URL shifts
  app.use("/api/ap-ai", async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout

    try {
      const apAiApiUrl = process.env.VITE_AP_AI_API_URL || "https://ap-ai-service-251285670091.asia-southeast1.run.app";
      const targetPath = req.originalUrl.replace(/^\/api\/ap-ai/, "");
      const fullUrl = `${apAiApiUrl.replace(/\/+$/, "")}${targetPath}`;

      console.log(`[AP AI Proxy] Forwarding ${req.method} ${req.originalUrl} -> ${fullUrl}`);

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          "Accept": "application/json",
          ...(req.headers["content-type"] ? { "Content-Type": req.headers["content-type"] as string } : {}),
        },
        signal: controller.signal,
      };

      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(fullUrl, fetchOptions);
      const dataText = await response.text();

      res.status(response.status);
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          res.json(JSON.parse(dataText));
        } catch {
          res.send(dataText);
        }
      } else {
        res.send(dataText);
      }
    } catch (error: any) {
      console.error("[AP AI Proxy] Error forwarding request:", error);
      if (error.name === "AbortError" || error.message?.includes("aborted")) {
        res.status(504).json({
          success: false,
          error: "云端 AP AI 扫描服务请求超时（120秒）。这可能是因为云端暂存区连接挂起，或者 API 密钥/文件夹 ID 权限失效。请检查 Google Drive 连接状态或云端日志。"
        });
      } else {
        res.status(500).json({ success: false, error: `AP AI Proxy failed: ${error.message}` });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  });

  // Digital Asset Links verification for Android TWA
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    res
      .status(200)
      .type("application/json")
      .set("Cache-Control", "no-store")
      .send([
        {
          relation: [
            "delegate_permission/common.handle_all_urls",
          ],
          target: {
            namespace: "android_app",
            package_name: "studio.ai.service_5174.twa",
            sha256_cert_fingerprints: [
              "5D:4C:BC:CE:EA:19:2A:C7:58:CF:4C:AA:E6:CD:13:AE:C8:A1:B5:27:91:D4:C8:BC:8C:9F:30:C3:1D:45:26:2D",
            ],
          },
        },
      ]);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
