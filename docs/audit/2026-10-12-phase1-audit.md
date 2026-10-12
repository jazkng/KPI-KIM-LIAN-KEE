# ERP V2 · 第一阶段只读审计报告

- 日期：2026-10-12
- 审计者：Claude Code
- 审计对象：`origin/main` @ `2f9fad2`（"feat: implement read-only mode and staff cash module"，2026-10-12 23:29 +0800）
- 性质：**只读**。未修改生产 Firebase、Cloudflare、AI Studio 部署或 `main`。未连接任何生产服务。
- 本报告不包含任何密钥值。

---

## 1. GitHub 分支与最近同步

| 分支 | SHA | 保护 | 说明 |
| --- | --- | --- | --- |
| `main` | `2f9fad2` | **未保护** | 最新提交为 jazkng 于今天推送，看起来是 AI Studio 同步 |
| `claude/mobile-desktop-style-unify-kpuasv` | `766df5f` | 未保护 | 已通过 merge 提交 `415d47b` 进入 main，可删除 |
| `develop-v2` | — | — | **尚不存在** |

- PR 只有 1 个（#1，已关闭，未通过 GitHub 合并；其内容是以本地 merge 方式进入 main 的）。
- **待核实：** `2f9fad2` 是否就是两个 V1 网址当前运行的版本。仓库无法证明这一点，需负责人在 AI Studio 中对照。

## 2. 自动部署配置检查

| 检查项 | 结果 |
| --- | --- |
| `.github/workflows/` | **不存在**，无 GitHub Actions |
| `firebase.json` / `.firebaserc` | **不存在**，无 Firebase Hosting/CLI 部署配置 |
| `Dockerfile` / `cloudbuild.yaml` / `app.yaml` | **不存在** |
| `README.md` | 指向 AI Studio App `71b630a9-…` |

**结论：** 仓库内没有任何会自动部署到生产的配置。目前部署由 AI Studio 平台本身控制（AI Studio → GitHub 是单向同步）。
**待核实：** AI Studio 后台是否开启了「从 GitHub 拉取/自动重新部署」——这只能在 AI Studio 控制台确认。

## 3. 项目框架与架构

- 前端：React 19 + Vite 6 + Tailwind 4，TypeScript；PWA（`sw.js`）+ Android TWA。
- 后端：`server.ts`（Express 5，端口 3000），兼作 Vite dev server / 生产静态服务。
  - `POST /api/gemini/chat`、`/translate`、`/translate-card`、`/translate-my` —— Gemini 调用（按 IP 限流）
  - `ALL /api/ap-ai/*` —— 代理至 Cloud Run `ap-ai-service`，**服务端注入 `X-Internal-Key`**
  - `GET /.well-known/assetlinks.json` —— TWA 验证
- 独立服务：`ap-ai-service/`（Cloud Run，Express 4），以 Service Account 操作 Google Drive（发票扫描、删除、归档）。有 `X-Internal-Key` 闸门（timing-safe 比较，长度 ≥ 32）。
- 数据层：前端直连 Firestore（`firebase` Web SDK），主要逻辑在 `utils/dataManager.ts`（约 2300 行）。
- 没有测试框架和测试文件。

### 环境变量名称（仅名称）
- 前端（构建时注入，会进入 bundle）：`VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_STORAGE_BUCKET`、`VITE_FIREBASE_MESSAGING_SENDER_ID`、`VITE_FIREBASE_APP_ID`、`VITE_FIREBASE_MEASUREMENT_ID`
- `server.ts`：`GEMINI_API_KEY`、`GEMINI_CHAT_MODEL`、`GEMINI_TRANSLATION_LITE_MODEL`、`GEMINI_TRANSLATION_SMART_MODEL`、`GEMINI_TRANSLATION_MODEL`、`VITE_AP_AI_API_URL`、`INTERNAL_API_KEY`、`TWA_PACKAGES`、`NODE_ENV`
- `ap-ai-service`：`GEMINI_API_KEY`、`GEMINI_MODEL`、`GEMINI_FALLBACK_MODEL`、`GEMINI_REQUEST_TIMEOUT_MS`、`INTERNAL_API_KEY`、`ALLOWED_ORIGINS`、`NEW_INVOICE_FOLDER_ID`、`PETTY_CASH_BASE_FOLDER_ID`、`MAIN_SUPPLIERS_BASE_FOLDER_ID`、`GOOGLE_APPLICATION_CREDENTIALS`、`SCAN_*`、`PORT`

### 密钥扫描
- 当前代码与全部 git 历史：未发现 Google API Key、私钥、Service Account JSON、GitHub Token 形态的字符串；未发现提交过 `.env` / `credentials.json` / keystore。
- 代码中出现的非机密标识：GCP 项目编号（Cloud Run URL 内）、Google Drive 文件夹 ID（`ap-ai-service/.env.example`）、TWA 证书指纹（公开信息）。Firebase Project ID **未硬编码**，只能通过环境变量得知。

## 4. Firebase 使用情况

- 使用的服务：**Firestore**、**Authentication（仅匿名登录）**。代码中未发现 Storage、Cloud Functions、Analytics 调用。
- Firestore 集合（按代码出现次数）：`standalone_expenses`、`config`、`settlements`、`payment_vouchers`、`logs`、`roster`、`suppliers`、`notifications`、`employees`、`bill_payments`、`queue_tickets`、`purchase_orders`、`inventory_tasks`、`fund_transfers`、`attendance`、`storehubSales`、`stock_price_history`、`assessment_records`、`roster_months`、`inventory_logs`、`assessment_boss_ratings`、`warranties`、`treasury_monthly_closings`、`task_completions`、`system_backups`、`strategy_*`、`self_issued_vouchers`、`recurring_bills`、`menu`、`ap_ai_corrections`、`translations`、`sop_progress`、`queue_counters`、`payroll`、`stock_kitchen` 等。
- 仓库内没有 `firestore.indexes.json`；生产索引只存在于 Firebase 控制台。
- **待核实：** 仓库里的 `firestore.rules` 是否与生产实际部署的 Rules 一致（没有 CLI 部署配置，Rules 很可能是在控制台手动粘贴的）。

## 5. 风险清单（按严重程度排序）

### 🔴 R1 · 任何人都可以读写全部数据库，包括员工 PIN
- `firestore.rules`：`allow read, write: if request.auth != null`，而 `firebaseConfig.ts` 会对**每位访客**自动 `signInAnonymously`。
- 因此「signedIn」= 任何打开网页的人，或者任何拿到公开 Web 配置后用 SDK 匿名登录的人。
- 登录是**纯前端**：`components/Login.tsx` 会把整个 `employees` 集合下载到浏览器，并以明文比对 `pin`；默认 PIN 为 `8888`（Owner）/ `0000`。
- 后果：只要懂技术，就能读取所有员工 PIN、薪资、财务资料，并能修改或删除任何集合。`readOnlyMode.ts` 本身也注明只是 UI 层防护。
- 这是 V1 现状，V2 的首要后端任务（需设计稿 + 批准）：服务端 PIN 校验 → Firebase Custom Token + custom claims（role）→ 按角色收紧的 Rules；PIN 改为哈希存储，前端不再下载。

### 🔴 R2 · `/api/ap-ai/*` 代理等于对公网开放 Drive 写操作
- `ap-ai-service` 本身有密钥闸门，但 `server.ts` 代理会对**任何**来访请求自动加上 `X-Internal-Key`，而且没有身份校验或路径白名单。
- 任何人都可以通过 V1 网址调用 `/api/ap-ai/api/delete-pending`、`/commit-bill`、`/scan-pending`（会消耗 Gemini 额度并改动 Drive 文件）。
- 修复方向：代理需要验证 Firebase ID Token（R1 完成后再加 role）+ 方法/路径白名单。

### 🟠 R3 · Gemini 端点没有身份校验
- `/api/gemini/*` 只按 IP 限流（内存计数，重启就清零），可被滥用来消耗费用。`/api/gemini/chat` 接收前端传来的 `contextData`（业务数据）。

### 🟠 R4 · 「备份」不是真正的备份
- `system_backups` 存放在**同一个** Firestore 中，只保留 7 份（`cleanupOldBackups`），并且同样受 R1 影响，可被删除。
- `restoreSystem` / `resetToDefaults` 会批量清空集合后重写，前端任何人都能触发。
- 上线前需要：Firestore 托管导出（`gcloud firestore export` 到独立 GCS bucket，或开启 PITR / 计划备份）+ 恢复演练。

### 🟡 R5 · V1 两个网址未必是同一份部署
- `twa-manifest.json`、`public/.well-known/assetlinks.json`、`server.ts` 的 TWA 默认值都指向 `service-5174.ai.studio`；`kimliankee-epr.ai.studio` 在代码里**没有出现过**。
- `ap-ai-service/.env.example` 的 `ALLOWED_ORIGINS` 列出 `service-251285670091.us-west1.run.app`，代理默认值为 `ap-ai-service-251285670091.asia-southeast1.run.app` —— 同一个 GCP 项目编号，但不同区域。
- **无法从代码确认** 两个 V1 是否连接同一个 Firebase Project、是否运行同一版本代码。见第 6 节。

### 🟡 R6 · 其他
- `main` 没有分支保护，AI Studio 同步可能直接覆盖 GitHub 上的改动。
- 没有自动化测试；`npm run lint` 实际是 `tsc --noEmit`。
- `vendor-firebase` chunk 有 618 kB（构建警告，非阻塞）。

## 6. V1 两个部署：待负责人核实

| 项目 | `kimliankee-epr.ai.studio` | `service-5174.ai.studio` |
| --- | --- | --- |
| 对应 AI Studio App ID | 待核实 | 待核实（README 中的 `71b630a9-…` 是其中之一？） |
| 运行的代码版本 / 最后部署时间 | 待核实 | 待核实 |
| `VITE_FIREBASE_PROJECT_ID` | 待核实 | 待核实 |
| `VITE_AP_AI_API_URL` / `INTERNAL_API_KEY` 是否已设置 | 待核实 | 待核实 |
| TWA/APK 绑定 | 否（代码中无引用） | 是 |

核实方法（负责人操作，不需改动任何内容）：在两个网址分别打开浏览器 DevTools → Console 执行 `firebase` 相关请求观察，或在 Network 面板查看 `firestore.googleapis.com` 请求 URL 中的 `projects/<id>`；在 AI Studio 控制台查看两个 App 的部署设置和 Secrets 名称（不需要提供值）。

## 7. 实测结果（本地，无生产连接）

| 命令 | 结果 |
| --- | --- |
| `npm install` | ✅ 成功 |
| `npx tsc --noEmit` | ✅ 退出码 0，没有类型错误 |
| `npx vite build` | ✅ 成功（12.5 s），1 条 chunk 体积警告 |
| 测试 | ⚠️ 项目中没有测试 |

构建时没有设置任何 Firebase 环境变量，所以产物不会连接任何项目。

## 8. 建议的分支、PR 与预览方案（待批准）

1. **建立 `develop-v2`**：从 `main@2f9fad2` 创建。
2. **分支保护**（GitHub Settings → Branches / Rulesets）：
   - `main`：禁止直接 push 与 force push，必须走 PR + 1 个审核；（需要确认 AI Studio 同步是否会因此被挡——如会，先停止 AI Studio 推送，与规范第 1.3 条一致）。
   - `develop-v2`：必须走 PR，必须通过 CI 状态检查，禁止 force push 和删除。
   - `claude/*`、`codex/*`：不保护。
3. **CI（GitHub Actions，只做检查、不做部署）**：`npm ci` → `tsc --noEmit` → `vite build` → 测试（待加入 Vitest + Firebase Emulator）→ 密钥扫描（gitleaks）→ `npm audit --omit=dev`（仅报告）。CI **不注入任何生产 secret**。
4. **V2 预览部署**（`dev.kimliankee.app`）建议：
   - 托管在独立的 Cloud Run 服务（例如 `erp-v2-dev`），仅在 `develop-v2` 合并后手动/受控触发；或使用 Firebase Hosting 的**独立站点**（同一个 Project 内的另一个 site，不影响 V1）。
   - 关键问题：规范要求只用一个 Firebase Project，而预览站又不能写生产数据。在 R1 修复之前，预览站一旦连上生产 Firestore，就拥有完整读写权限。**建议预览站先只接 Firebase Emulator / 演示数据**，等到角色 Rules 完成后再考虑以只读角色接入生产数据。此决定需要负责人拍板。
5. **AGENTS.md / CLAUDE.md**：目前两份都**不存在**。建议把本规范放入 `docs/KLK_ERP_V2_RULES.md`，并新增 `CLAUDE.md` 与 `AGENTS.md`，两者都简短引用该文件，并列出关键禁令和验证命令。Claude Code 会自动读取 `CLAUDE.md`，Codex 会自动读取 `AGENTS.md`。

## 9. 待负责人批准的操作

| # | 操作 | 影响 | 风险 |
| --- | --- | --- | --- |
| A1 | 从 `main@2f9fad2` 创建 `develop-v2` | 仅 GitHub | 低 |
| A2 | 新增规范文档 + `CLAUDE.md` + `AGENTS.md`（经 PR 合并到 `develop-v2`） | 仅 GitHub | 低 |
| A3 | 设置 `main` / `develop-v2` 的分支保护 | 可能影响 AI Studio 同步 | 低–中 |
| A4 | 新增只做检查的 CI workflow | 仅 GitHub | 低 |
| A5 | 删除已合并分支 `claude/mobile-desktop-style-unify-kpuasv` | 仅 GitHub | 低 |
| A6 | 核实第 6 节两个 V1 部署的信息（负责人操作） | 无 | 无 |
| A7 | 批准 R1/R2 修复的设计稿撰写（认证 + Rules 重构） | 设计阶段不改生产 | — |
| A8 | 决定预览站的数据来源（Emulator / 演示数据 vs 生产只读） | 决定预览架构 | 中 |
| A9 | 在 GCP 开启 Firestore 计划备份/PITR 并演练恢复 | 改动生产 GCP 设置 | 中，需单独批准 |

**是否涉及 V1 生产环境：否。**
