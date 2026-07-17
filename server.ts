import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Read model configuration from environment variables
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
const TRANSLATION_MODEL = process.env.GEMINI_TRANSLATION_MODEL || "gemini-3.1-flash-lite";

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

  // Initialize Gemini Client secure on the server side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

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
   - 如果 \`dailySettlements\` 数组为空，或用户追问无差异的日结算差额原因，必须返回：“当前后台对账数据完整无差异或明细不足，无法精准定位，请查阅当天店面实记。”
3. 【财务机密隔离】：对于“分红 (Dividend)”和“押金 (Deposit)”等非主营流动资金，你必须遵循隔离逻辑，在计算餐厅日常纯利润 (OpEx/P&L) 时，坚决不计入，绝不污染通用营运费用。

# Core Capabilities & Thumb Actions Mapping
1. 📊 今日营收与对账摘要
   - 对比 POS 系统营业额（\`salesTotal\` 或 \`storeHubTotal\`）与实际流入分类对账状况。
   - 当用户问及"收入" / "营业额" / "进账" / "营业收入"时，必须查询并统计 \`dailySettlements\` 数组。
   - 绝不能把“分红/押金”等非主营收入计入。
2. 📉 低库存精准检查
   - 扫描库存并列出 \`lowStockItems\`（低于安全阈值 \`minLevelBase\` 的项）。
   - 计算和列出低库存项时，必须严格以基础单位（Base Unit，如 \`baseUnit\`）和基础数量（\`currentQtyBase\`、\`minLevelBase\`、\`deficitBase\`）进行分析与陈述，避免混淆二/三级单位。
3. 🔍 当日日志异常检查
   - 检查当天运营日志 \`logs\`，稽查是否发生任何打碎砂锅、投诉、免单等异常，并可与 \`dailySettlements\` 中的 \`refundTotal\` 或 \`varianceReason\` 进行交叉稽查。
4. 💰 资金与转账摘要
   - 汇总最近资金转账 \`recentFundTransfers\` 与账户余额状况。

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

      const response = await ai.models.generateContent({
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

  // Secure translation endpoint for multi-language translation (e.g. Burmese/Chinese)
  app.post("/api/gemini/translate-card", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, translationLimitStore, 10);
      if (!limit.allowed) {
        return res.status(429).json({
          error: "⚠️ 翻译服务请求过快，请稍候再试。"
        });
      }

      const { bundle } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets." 
        });
      }

      const systemInstruction = `You are a professional restaurant-industry translator specializing in translating text from Chinese to Burmese (Myanmar).
Translate all user-facing description, questions, and option descriptions in the provided JSON into Burmese (Myanmar language).
Keep all IDs, grade labels (like 'S档', 'A档', 'B档', 'C档', 'D档'), and JSON structures EXACTLY the same.
Your response must be valid JSON only, matching the exact same keys as the input.`;

      const response = await ai.models.generateContent({
        model: TRANSLATION_MODEL,
        contents: [
          { role: 'user', parts: [{ text: JSON.stringify(bundle) }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json"
        },
      });

      const responseText = response.text?.trim() || "{}";
      const parsed = JSON.parse(responseText);
      res.json(parsed);
    } catch (error: any) {
      console.error("Card Translation API server error:", error);
      res.status(500).json({ error: error.message || "An error occurred with Card Translation." });
    }
  });

  // Secure translation endpoint for multi-language translation (e.g. Burmese/Chinese)
  app.post("/api/gemini/translate", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, translationLimitStore, 10);
      if (!limit.allowed) {
        return res.status(429).json({
          error: "⚠️ 翻译服务请求过快，请稍候再试。"
        });
      }

      const { text, targetLang } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets." 
        });
      }

      const targetLangName = targetLang === 'my' ? 'Burmese (Myanmar)' : targetLang === 'zh' ? 'Simplified Chinese' : 'English';
      
      const systemInstruction = `You are a professional restaurant-industry translator. Translate the given text into ${targetLangName} accurately. Keep the tone professional, natural, and friendly. Do not output anything except the translated text itself. Do not add quotes.`;

      const response = await ai.models.generateContent({
        model: TRANSLATION_MODEL,
        contents: [
          { role: 'user', parts: [{ text }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });

      res.json({ text: response.text?.trim() });
    } catch (error: any) {
      console.error("Translation API server error:", error);
      res.status(500).json({ error: error.message || "An error occurred with Translation." });
    }
  });

  // Secure translation endpoint with prompt builder and batch support for Myanmar Translation Layer
  app.post("/api/gemini/translate-my", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip, translationLimitStore, 10);
      if (!limit.allowed) {
        return res.status(429).json({
          error: "⚠️ 翻译服务请求过快，请稍候再试。"
        });
      }

      const { text, texts, context } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets." 
        });
      }

      if (texts && Array.isArray(texts)) {
        // Batch translation
        const prompt = `你是餐饮 ERP 系统的缅甸文翻译助手。
请把以下的中文词汇列表翻译成自然、简洁、适合缅甸员工操作的缅甸文。
如果内容包含英文单位、品牌名、SKU、代码、缩写，请保留英文。
如果是库存品项，请使用餐饮、厨房、仓库常用说法。
如果是按钮或系统状态，请用简单易懂的操作用语。
不要解释，只返回一个 JSON 对象，结构为: { "translations": [ "翻译1", "翻译2", ... ] }。列表顺序必须与输入列表完全一致。

上下文背景: ${context || '餐饮、库存管理'}
待翻译列表: ${JSON.stringify(texts)}`;

        const response = await ai.models.generateContent({
          model: TRANSLATION_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const textResult = response.text?.trim() || "{}";
        const parsed = JSON.parse(textResult);
        res.json(parsed);
      } else if (text) {
        // Single translation
        const prompt = `你是餐饮 ERP 系统的缅甸文翻译助手。
请把中文翻译成自然、简洁、适合缅甸员工操作的缅甸文。
如果内容包含英文单位、品牌名、SKU、代码、缩写，请保留英文。
如果是库存品项，请使用餐饮、厨房、仓库常用说法。
如果是按钮或系统状态，请用简单易懂的操作用语。
不要解释，只返回翻译结果。

待翻译文本: "${text}"
${context ? `上下文背景: ${context}` : ''}`;

        const response = await ai.models.generateContent({
          model: TRANSLATION_MODEL,
          contents: prompt,
          config: {
            temperature: 0.1,
          },
        });

        res.json({ translation: response.text?.trim() || "" });
      } else {
        res.status(400).json({ error: "Missing text or texts in request body." });
      }
    } catch (error: any) {
      console.error("Myanmar Translation API error:", error);
      res.status(500).json({ error: error.message || "An error occurred during translation." });
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
