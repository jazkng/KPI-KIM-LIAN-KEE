# V2 开发预览 `dev.kimliankee.app` 部署方案

- 日期：2026-10-12（已按负责人的最终数据策略修订，见 `docs/KLK_ERP_V2_RULES.md` 第 10 条）
- 状态：**方案已定，云端资源待负责人批准后建立**。本 PR 不建立任何云端资源，也不修改 Cloudflare DNS。

## 1. 已确定的原则

- 预览站**连接现有正式 Firebase 项目与正式 Firestore 数据库**，与 V1 使用同一份数据。
- 不建立第二个 Firebase 项目，也不创建新的数据库实例。
- 预览站由负责人本人操作和验收；V2 正常操作产生的数据会同步出现在 V1。
- 两个 V1 AI Studio 网址继续正常运行，预览站不使用、也不改动它们的任何资源。
- 预览失败不影响营业；任何部署都能一键回退到上一版。

## 2. 架构

```
dev.kimliankee.app ──(Cloudflare DNS, DNS only)──▶ Firebase Hosting 独立站点 kimliankee-erp-dev
                                                      │  rewrite: ** → Cloud Run
                                                      ▼
                                   Cloud Run 服务 erp-v2-dev（asia-southeast1）
                                   运行 develop-v2 的 server.ts（静态页面 + /api）
                                                      │
              浏览器（Firebase Web SDK） ─────────────▶ 正式 Firestore（与 V1 同一个数据库）
              /api/gemini/* ─────────────────────────▶ Gemini（预览专用 API Key，低配额）
              /api/ap-ai/*（已加锁）───────────────────▶ 现有 ap-ai-service（与 V1 同一个 Drive）
```

| 选择 | 理由 |
| --- | --- |
| **Firebase Hosting 独立站点** | 免费的 HTTPS 证书与自定义域名，`rewrites` 直接转发到 Cloud Run。V1 不在 Firebase Hosting 上，两者不共用任何资源。Hosting 站点不是数据库。 |
| **Cloud Run 独立服务 `erp-v2-dev`** | 与 V1 相同的运行方式（`server.ts`），环境变量与 Secret 独立；可以缩容到 0。 |
| **前端 Firebase 配置与 V1 相同** | 6 个 `VITE_FIREBASE_*` 变量与 V1 相同（都是公开配置，不是密钥），指向同一个项目和数据库。`VITE_USE_FIREBASE_EMULATOR` **不设置**。 |
| **Gemini 使用预览专用 Key** | 预览的用量与费用和 V1 分开，可以单独设上限。 |

## 3. 上线前置条件（全部完成并验证后，才可以公开 `dev.kimliankee.app`）

### 3.1 先认清：哪些风险是网址门禁挡得住的，哪些挡不住

- **挡不住的：数据库本身。**
  - 预览站与 V1 使用同一份公开的 Firebase Web 配置和同一套 Rules。在 CHG-05/06 完成前，任何人都可以通过 V1 网址（或直接用 SDK）匿名读写正式数据。
  - 给预览站加门禁**不能**关闭这条路径，只有紧急整改计划 CHG-05、CHG-06 能关闭。
  - 因此 CHG-05/06 仍是最高优先级，建议在预览站上线后尽快完成。
- **挡得住的：预览站界面被他人使用。** 负责人决定「V2 由本人操作」，但目前没有任何技术手段保证这一点：任何人打开网址都能使用 V2 界面，触发写入，包括下面 3.3 所列「打开页面就会写入」的路径。所以**必须**加上门禁。

### 3.2 网址门禁（必须）

- 整个 `dev.kimliankee.app` 只允许负责人的帐号访问。这一层在到达 App 之前的网络边缘执行，不是前端隐藏按钮。
- **候选方案**（需要先验证可行性，再在部署 PR 中定案）：
  - **Cloudflare Access**（Zero Trust 免费版）：以负责人的电邮验证码或 Google 帐号登录。
    - 需要把 `dev` 记录设为「Proxied / 橙色云」；
    - 并需验证 Cloudflare → Cloud Run（域名映射或 Host 标头）的串接方式；
    - 采用此方案时，第 2 节的 Firebase Hosting 可能改为不使用。
  - **Google Cloud IAP**：只允许负责人的 Google 帐号。需要验证 IAP 与 Cloud Run 及自定义域名的组合方式。
- 另外加上 `X-Robots-Tag: noindex`，避免网址被搜索引擎收录。
- **验证**：在未登录的无痕窗口打开网址 → 被门禁拦下，看不到 App。

### 3.3 必须先完成的代码（在 `develop-v2` 上，经 PR 审核）

1. **CHG-03 发票扫描代理加锁**（路径白名单 + `AP_ACCESS_CODE`；未设置时拒绝全部请求）。预览站的发票扫描操作的是与 V1 同一个 Google Drive。
2. **CHG-04 初始化按钮防误触**：预览站连接的是正式员工资料，绝不能出现误覆盖。
3. **盘点并处理「打开页面就会写入」的路径**：
   - 已确认的一项：`components/features/hr/HRPayroll.tsx`。打开某个月份时，如果数据库没有该月薪资记录，会自动建立一份 DRAFT 薪资记录。
   - 盘点方式：逐一检查所有在页面载入（`useEffect`）时执行写入的代码。
   - 每一项要标明「V1 现有行为」或「V2 新增」：
     - **V2 新增**的一律改为明确确认后才写入；
     - **V1 现有**的，因为 V1 打开同一页面也会写入同一份数据，由负责人逐项决定保留或修改。
   - 盘点结果附在部署 PR 中。
4. **部署前检查**：部署工作流在构建时确认 `VITE_USE_FIREBASE_EMULATOR` 未设置，且 `VITE_FIREBASE_PROJECT_ID` 不是 `demo-` 开头，避免把指向 Emulator 的构建误部署上线。

## 4. 部署流程（GitHub Actions，日后单独 PR 加入）

- 新增 `deploy-dev-preview.yml`：
  - **只能手动触发**（`workflow_dispatch`），而且只接受 `develop-v2` 分支。
  - 先运行与 CI 相同的检查：lint / test / test:rules / build。
  - 使用 GitHub **Environment `dev-preview`**，并设置「需要负责人批准才执行」。
  - 使用 **Workload Identity Federation**，不在 GitHub 中保存任何服务账号 JSON 密钥。
  - 部署专用服务账号**只**授予：`erp-v2-dev` 的 Cloud Run 部署权限，以及 `kimliankee-erp-dev` 站点的 Hosting 发布权限。它**没有任何 Firestore 权限**，因为数据由浏览器中的 Firebase SDK 直接读写，服务端不需要。
- 每次部署记录 Commit SHA、Cloud Run revision 和 Hosting release。
- **回退方法**：在 Cloud Run 中把流量切回上一个 revision，或在 Hosting 中回滚到上一个 release。
  - ⚠️ 回退**代码**不会回退已经写入的**数据**。如果某次 V2 版本写错了数据，就要按紧急整改计划 CHG-01 的备份方式恢复受影响的集合，而这属于高风险变更，需要单独批准。

## 5. 需要负责人执行或批准的步骤（按顺序）

| # | 操作 | 改动范围 | 风险 |
| --- | --- | --- | --- |
| D0 | 先完成紧急整改计划 **CHG-01 备份** | 生产 GCP 设置 | 低（强烈建议在预览站上线前完成） |
| D1 | 确认 Firebase 项目和 `ap-ai-service` 所在的 GCP 项目是同一个 | 只看 | 无 |
| D2 | （由我完成）在 `develop-v2` 完成第 3.3 节的代码与「打开即写入」盘点，经 Codex 审核；并验证第 3.2 节门禁方案 | 只改代码 | 无 |
| D3 | 建立 Hosting 站点 `kimliankee-erp-dev` 和 Cloud Run 服务 `erp-v2-dev` | 新增资源（不是数据库） | 低 |
| D4 | 建立部署服务账号与 Workload Identity Federation（我会提供逐条命令，供审核后执行） | IAM 新增 | 中，需要审核权限范围 |
| D5 | 为预览站申请 Gemini API Key 并设置低配额；在预览服务的 Secrets 中设置 `GEMINI_API_KEY`、`INTERNAL_API_KEY`、`AP_ACCESS_CODE` | 新增 | 低 |
| D6 | 检查 Firebase Web API Key 是否设置了「HTTP referrer」限制；如有，加入 `dev.kimliankee.app` | 正式 API Key 设置（只新增一个网址） | 低，需要单独批准 |
| D7 | 按第 3.2 节定案的门禁方案，设置 `dev.kimliankee.app` 的 Cloudflare 记录与门禁（Access 应用或 IAP） | **Cloudflare DNS / Access**，只新增 `dev` 子域名 | 低，需要单独批准 |
| D8 | 在未登录的无痕窗口验证门禁确实挡住访问，**之后才开放预览** | 只看 | 无 |

D3–D7 都只新增资源或设定，删除即可撤销，也都不会改动 V1 的任何部署。
