# ap-ai-service · 发票扫描服务

用 Gemini 读取 Google Drive「待处理」文件夹中的供应商发票，供 ERP 的「应付账款」模块核对后归档。

- **运行位置**：Google Cloud Run（目前网址的区域为 `asia-southeast1`）。实际的部署方式（命令或控制台）**待负责人补充**。
- **访问方式**：只经由 ERP 后端 `server.ts` 的 `/api/ap-ai/*` 代理调用，由代理在服务端加上 `X-Internal-Key`。浏览器不直接访问本服务。
- **权限**：使用 Service Account 操作 Google Drive（会移动、归档文件），所以**绝不可对公网开放**。

> ⚠️ ERP 端的代理目前没有身份校验，任何人都能经由 V1 网址调用本服务。整改方案见 `docs/security/2026-10-12-production-emergency-plan.md` 的 CHG-03。

## 接口

除 `/health` 外，所有 `/api/*` 都必须带正确的 `X-Internal-Key`，否则返回 401。

| 方法与路径 | 作用 | 会改动 Drive |
| --- | --- | --- |
| `GET /health` | 健康检查（不需密钥） | 否 |
| `GET /api/scan-pending?limit=` | 扫描待处理文件夹中的发票，用 Gemini 解析 | **会**：同一文件连续解析失败达 `SCAN_FAIL_LIMIT` 次时，自动移到 `_HOLDING_AREA` 隔离 |
| `GET /api/vendor-config` | 读取内建的供应商清单与别名表 | 否 |
| `POST /api/commit-bill` | 核对后归档到对应供应商文件夹 | **是** |
| `POST /api/hold-pending` | 挂起，移到 `_HOLDING_AREA` | **是** |
| `POST /api/delete-pending` | 废弃，移到 `_REJECTED_TRASH_BIN` | **是** |

## 环境变量（只列名称，不写值）

| 名称 | 用途 |
| --- | --- |
| `INTERNAL_API_KEY` | **必填**，长度至少 32；与 ERP 后端设置的值相同。缺少时服务拒绝启动 |
| `GEMINI_API_KEY` | Gemini API 密钥 |
| `GEMINI_MODEL`、`GEMINI_FALLBACK_MODEL` | 主模型与备用模型 |
| `GEMINI_REQUEST_TIMEOUT_MS` | 单次 Gemini 请求超时 |
| `NEW_INVOICE_FOLDER_ID` | 待处理发票文件夹 |
| `PETTY_CASH_BASE_FOLDER_ID`、`MAIN_SUPPLIERS_BASE_FOLDER_ID` | 归档目标文件夹 |
| `ALLOWED_ORIGINS` | CORS 允许的来源（逗号分隔）；未设置时为 `*` |
| `SCAN_CACHE_TTL_MS`、`SCAN_CACHE_MAX`、`SCAN_FAIL_LIMIT`、`SCAN_BATCH_DEFAULT`、`SCAN_BATCH_MAX`、`SCAN_CONCURRENCY` | 扫描缓存、失败隔离与批次大小 |
| `PORT` | 监听端口（Cloud Run 自动提供） |
| `GOOGLE_APPLICATION_CREDENTIALS` | **仅本机开发**：Service Account JSON 路径。Cloud Run 上使用附加的 Service Account，不需要此项 |

范例见 [`.env.example`](.env.example)。`credentials.json` 与 `.env` 已被 `.gitignore` 排除，**绝不提交**。

## 本机运行

```bash
cd ap-ai-service
npm install
npm start
```

⚠️ 本机运行时如果指向**正式** Drive 文件夹，`commit-bill`、`hold-pending`、`delete-pending` 会真的移动正式发票文件。测试请改用专门的测试文件夹。
