# V2 开发预览 `dev.kimliankee.app` 部署

- 依据：`docs/KLK_ERP_V2_RULES.md` 第 10 条（连接现有正式 Firebase；不新建数据库；V1 两个 AI Studio 网址不动）。
- 状态：代码、工作流与一次性设置脚本已就绪；云端设置由负责人执行一次（见第 3 节）。

## 1. 架构

```
dev.kimliankee.app ──(Cloudflare DNS, DNS only)──▶ Cloud Run 服务 erp-v2-dev（asia-southeast1，网域映射）
                                                     │  server.ts：预览站密码门禁 → 静态页面 + /api
                                                     ▼
                     浏览器（Firebase Web SDK）──▶ 正式 Firestore（与 V1 同一个数据库）
```

| 项目 | 做法 |
| --- | --- |
| 运行 | Cloud Run `erp-v2-dev`，容器由仓库的 `Dockerfile` 构建（`bun.lock` 安装依赖 → `npm run build` → `node dist/server.cjs`） |
| 数据 | 与 V1 同一个 Firebase 项目与数据库；前端 Firebase 配置与 V1 相同（公开配置，以 GitHub Variables 提供） |
| 访问门禁 | `server.ts` 在设置 `PREVIEW_ACCESS_PASSWORD` 时启用：**送出任何页面、静态文件或 API 之前**先验证密码（HTTP Basic Auth）；同一来源 15 分钟内错 10 次即锁定；加上 `noindex`。V1 不设置此变量，行为不变 |
| 密钥 | Secret Manager：`erp-v2-dev-preview-password`、`erp-v2-dev-gemini-api-key`、`erp-v2-dev-internal-api-key`；只有运行用服务账号可读取 |
| 部署权限 | GitHub Actions 以 Workload Identity Federation 登录（不保存任何密钥文件），只接受本仓库 `develop-v2`；部署账号只对 `erp-v2-dev` 这一个服务有权限，碰不到 V1 或其他 Cloud Run 服务 |
| 网域 | Cloud Run 网域映射 `dev.kimliankee.app`；Cloudflare 只新增 `dev` 一条记录，设为 DNS only（灰色云） |

> 预览站门禁挡住的是「他人使用 V2 界面」。数据库本身仍与 V1 相同（匿名身份可读写），只有紧急整改计划 CHG-05、CHG-06 能关闭这个风险，仍为最高安全优先级。

## 2. 已随部署代码一起完成的上线前修复

| 项目 | 状态 |
| --- | --- |
| 预览站访问门禁 | ✅ `server.ts`（已实测：无密码 401、正确密码 200、错 10 次后 429、伪造来源 IP 无法绕过锁定、未设置时与 V1 相同） |
| CHG-04「初始化系统」防误触 | ✅ `components/Login.tsx`：只有成功读取且确实为 0 位员工才显示初始化；读取失败或找不到负责人时显示错误与「重试」（已在浏览器实测两种情况） |
| 发票扫描代理 | 预览站的 `/api/ap-ai/*` 位于门禁之后，只有持有预览站密码者可用。V1 的公开代理风险由 CHG-03 处理 |
| 「打开页面就写入」 | 已知一项：`HRPayroll.tsx` 打开没有薪资记录的月份时会自动建立 DRAFT（V1 现有行为，V1 打开同一页面也会写入）。暂时保留，由负责人决定是否改为需要确认 |

## 3. 负责人一次性设置（约 15 分钟）

1. 打开 [Google Cloud Shell](https://shell.cloud.google.com)，执行：
   ```bash
   git clone https://github.com/jazkng/KPI-KIM-LIAN-KEE.git && cd KPI-KIM-LIAN-KEE && git checkout develop-v2
   PROJECT_ID=<你的 Firebase 项目 ID> bash docs/deploy/setup-dev-preview.sh
   ```
   脚本只**新增**资源（镜像仓库、2 个服务账号、3 个 Secret、`erp-v2-dev` 服务、GitHub 登录设定、网域映射），可重复执行。
   - 预览站密码只在画面上显示一次，请存入密码管理器。
   - `GEMINI_API_KEY`、`INTERNAL_API_KEY` 以隐藏方式输入，不会显示或写入任何文件。
2. 若脚本提示网域未验证：执行 `gcloud domains verify kimliankee.app`，按指示在 Cloudflare 加一条 TXT 记录，再重跑脚本。
3. 在 Cloudflare 按脚本列出的记录新增 `dev`（**DNS only / 灰色云**）。HTTPS 证书通常在 15–60 分钟内自动签发。
4. 在 GitHub 仓库 Settings → Secrets and variables → Actions → **Variables** 填入脚本最后列出的变量（都不是密钥）。
5. 如果 Firebase Web API Key 有「HTTP referrer」限制，请在 Google Cloud → APIs & Services → Credentials 中加入 `https://dev.kimliankee.app/*`。

## 4. 部署、验收与回滚

GitHub → Actions → **Deploy dev preview** → Run workflow（分支 `develop-v2`）：

| action | 做什么 |
| --- | --- |
| `deploy` | 先跑完整 CI（类型检查、单元测试、Rules 测试、构建、密钥扫描），再部署一个**不接流量**的候选版本，并自动确认候选版本有门禁（无密码必须 401）。运行摘要会给出候选网址 |
| `promote` | 负责人用候选网址实际验收 **登录、员工资料载入、日结 / 财务页面** 后执行，把 100% 流量切到最新版本，并再次确认门禁 |
| `rollback` | 填入运行摘要中列出的旧 revision 名称，把 100% 流量切回旧版本 |

- 回滚只回退代码，不回退已写入的数据；数据问题按紧急整改计划 CHG-01 的备份恢复（高风险，需负责人批准）。
- 任何部署都不影响 V1 的两个 AI Studio 网址。
