# 交接给 Codex：目前的使用规则、部署方式与待办（2026-10-24）

> 写给接手的 Codex。负责人从现在起改由 Codex 处理剩下的工作。
> 共同规范仍以 `AGENTS.md` / `CLAUDE.md` 与 `docs/KLK_ERP_V2_RULES.md` 为准。本文件说明到今天为止**实际在用的方式**，以及还没做完的事。
> 本文件不含任何密码、密钥。

---

## 1. 两个网站：dev 是测试站，epr 是正式站（负责人 2026-10-23 决定）

| 网址 | Cloud Run 服务 | 用途 | 什么时候更新 |
|---|---|---|---|
| `https://dev.kimliankee.app` | `erp-v2-dev` | **测试站**，负责人先看 | `develop-v2` 每次合并后**自动**部署（`.github/workflows/deploy-dev-preview.yml`） |
| `https://epr.kimliankee.app` | `erp-v2` | **正式站**，全部员工使用 | **只有负责人在对话中说「发布」**，才运行 `.github/workflows/deploy-production.yml`（`action=release`） |

- 两个网站连**同一个正式 Firestore**（也是 V1 在用的那个）。在 dev 上做的操作是真的，会出现在正式站与 V1。不要在 dev 上建测试订单或交易。
- 发布到正式站时**不重新构建**：直接用 dev 当下正在跑的镜像。流程是：部署 0% 流量的候选版本 → 确认未登录访问 `/api/auth/session` 回 401 → 切 100% 流量 → 再确认一次。失败会自动切回上一版。
- 回滚正式站：`deploy-production.yml`，`action=rollback`，填上旧 revision 名称（每次发布的运行摘要里有）。
- 触发方式（从 Codex 端）：GitHub API `workflow_dispatch`，`workflow_id=deploy-production.yml`，`ref=develop-v2`，`inputs={action: release}`。工作流只放在 `develop-v2`，网页上可能没有「Run workflow」按钮。

完整说明：`docs/deploy/production-plan.md`。

## 2. 云端资源（负责人的 Google Cloud）

| 项目（显示名称） | 项目 ID | 内容 | 能不能动 |
|---|---|---|---|
| KimLianKee-ERP | `kimliankee-erp` | `erp-v2-dev`、`erp-v2`（asia-southeast1）；**Firestore 正式资料库在这里** | 只能经由 GitHub Actions 部署；其他变更要负责人执行 |
| KPISystem | `gen-lang-client-0215461265` | V1：`kimliankee-epr`、`service`、`service-2-0`（us-west1）；**`ap-ai-service`（发票扫描，V2 也在用）** | **不要动**。V1 停用要按第 6 节分阶段、经负责人批准；`ap-ai-service` 保留 |

- 网域映射：`dev.kimliankee.app` → `erp-v2-dev`；`epr.kimliankee.app` → `erp-v2`（2026-10-24 刚从 dev 搬过来，证书签发中）。
- Cloudflare：`dev`、`epr` 都是 CNAME → `ghs.googlehosted.com`，**DNS only（灰色云）**。不要改 DNS。
- 部署用服务账号：`erp-v2-dev-deployer`（GitHub Workload Identity，只接受 `develop-v2`）。运行用服务账号：`erp-v2-dev-runtime`（dev 与正式站共用）。
- Secrets（Secret Manager，值只有负责人知道）：
  - `erp-v2-dev-preview-password`：dev 的后备密码
  - `erp-v2-prod-access-password`：正式站的后备密码
  - `erp-v2-dev-gemini-api-key`
  - `erp-v2-dev-internal-api-key`
- GitHub Variables：GCP 设定、`VITE_FIREBASE_*`，以及 `AUTH_SERVER_ENABLED=true`（两个网站一起生效）。
- 我们没有 GCP 权限。所有云端动作都写成 `docs/deploy/*.sh` 脚本，由负责人在 Cloud Shell 执行，`PROJECT_ID=kimliankee-erp`。

## 3. 登录方式（已开启）

- **服务端登录 + 登录后免密码**（设计：`docs/security/2026-10-23-login-instead-of-gate-password.md`）：
  - 打开网址就是登录页。员工输入**员工编号**（不显示名单）+ PIN，由服务端比对。
  - 登录成功后，浏览器存一个 **30 天**的登录记录（HttpOnly Cookie，HMAC 签名）。到期、登出或改 PIN 后，要重新输入 PIN。
  - PIN 是 0000 或没设的人，第一次登录要改成 6 位数字。新 PIN 会同步写回 `employees.pin`，所以 V1 照常可用。
  - 同一员工 + IP：15 分钟错 5 次锁定。同一员工不论 IP：1 小时错 20 次锁定。
  - 没登录的人只能用页面本身和登录接口，其余 `/api/*` 一律 401。共用的预览站密码只留作负责人的后备入口。
- 关闭方式：删掉 GitHub 变量 `AUTH_SERVER_ENABLED`，再重新部署。
- 程序：`server/auth/sessionCookie.ts`、`server/auth/authService.ts`、`server/auth/deviceAuth.ts`、`server.ts` 门禁段落、`utils/auth/serverAuth.ts`、`components/Login.tsx`。

## 4. 平常的开发流程（到目前为止的做法）

1. 从最新 `develop-v2` 建分支：`codex/<功能>`（不要写入 `claude/*` 分支）。
2. 写程序。需要动资料模型、权限、资金逻辑、自动扣库存、部署架构的，先写设计说明（`docs/...`），负责人批准后才做。
3. 本机检查，**全部实际运行并通过**：
   ```bash
   npx tsc --noEmit
   npm test
   npm run build
   npm run test:rules
   ```
4. 需要看画面的，用 Emulator 测：`npm run emulators` + `PORT=3000 npm run dev:emulator`。要测登录与门禁时，加上 `PREVIEW_ACCESS_PASSWORD=<任意> AUTH_SERVER_ENABLED=true`。用 Playwright 截图检查手机（390 宽）画面。
5. 开 PR 到 `develop-v2`。PR 说明要写：内容、检查结果（命令 + 结果）、**V1 兼容性说明**、数据库 / 权限 / 部署影响。
6. CI 绿灯后 squash 合并 → dev 自动更新 → 负责人在 dev 检查 → 负责人说「发布」→ 运行正式站发布。
7. 用中文、白话回报负责人：做了什么、要他做什么、风险。

**固定的限制**（详见 `AGENTS.md`）：
- 不推、不合并到 `main`（`main` 还是 V1 的代码，暂时不动）。
- 不改 V1 部署、DNS、Rules、Auth 设定。
- 不对正式资料库做批量改写或删除。
- 自动测试只用 Emulator。
- V1 要读得懂 V2 写入的资料：只新增选填字段或新集合。

## 5. 最近完成的功能（2026-10-22 ~ 10-24，都已合并到 develop-v2，并已发布到正式站）

- **会议签到**：QR 扫码，签到时间用服务器时间（`docs/hr/meeting-checkin-design.md`）。
- **员工积分**：每月一次；个人卫生由主管每周评，HR（L2/L2S）在老板页「全部功能 → 个人卫生」评全部人（`docs/hr/points-system-design.md`）。
- **HR 员工档案改版**；技能评星要先按编辑，改动要填原因。
- **排班**：员工 App 读排班管理同一份 `roster_months`，**只看已发布的版本**（发布时另存 `publishedRoster`，草稿员工看不到）；没排班显示「未排班」。
- **固定上下班时间**（员工档案 → 资料 → 工作）：可以每天同一组，也可以按星期几设定。考勤审核、考勤主控台、薪资迟到扣款都按这个时间算（`docs/hr/fixed-shift-design.md`）。
- **薪资迟到扣款**：按员工自己的班次人群（Group A / B）计算。
- **经营中心**：外卖按实收计算，与日结一致。

## 6. 待办（按顺序；每项都要负责人批准）

1. **确认 epr 证书已生效**：Cloud Run →「网域映射」里 `epr` 是绿色勾。负责人用员工编号 + PIN 在 epr 登录成功。
2. **通知全部员工改用 epr**：手机捷径换成 epr，会议 QR 从 epr 重新打印。过几天，列出还没在 V2 登录过的人。可以用 `employee_secrets` 判断：有文件的人已在 V2 设过新 PIN；或者从 Cloud Run 日志看 `/api/auth/login` 的成功纪录。
3. **停用 V1**（负责人说「停用 V1」才做）：
   - 先**锁门不删除**：拿掉 KPISystem 里 `kimliankee-epr`、`service`、`service-2-0` 的公开访问（`allUsers` 的 `roles/run.invoker`），并附上恢复指令。
   - 观察 2 星期，再删除服务和两个 `*.ai.studio` 网域映射。
   - **`ap-ai-service` 不动**。
   - 停用前先备份正式 Firestore，并确认备份可以恢复。
4. **V1 停用后的安全收紧**（`docs/deploy/v2-cutover-checklist.md` A 段；每项分开批准，先备份、写影响与回滚）：
   - CHG-06：收紧 Firestore Rules（`employee_secrets` 等只给服务端）；
   - 全员重设 PIN，`ACCEPT_LEGACY_PIN=false`，`MIRROR_LEGACY_PIN=false`；
   - 移除前端比对 PIN 的旧登录方式；
   - 评估访问门禁（后备密码）是否还需要。
5. **移除「测试切换」**（`components/dev/TestSwitcher.tsx`，只有老板看得到的橙色按钮）：负责人尚未确认，要先问。
6. **鱼 / 西瓜按重量计价、按件数记库存**：V1 停用后才改（`docs/inventory/2026-10-19-weight-billed-count-stock.md`，清单 C2）。
7. **`main` 分支**：V1 不再修改后，才把 `develop-v2` 合并到 `main`，并开启分支保护（负责人批准）。

## 7. 常用文件

| 文件 | 内容 |
|---|---|
| `docs/deploy/production-plan.md` | 测试站 / 正式站架构、发布与回滚 |
| `docs/deploy/v2-cutover-checklist.md` | V1 停用前后的完整清单 |
| `docs/deploy/setup-production.sh` | 正式站一次性设置（已执行） |
| `docs/deploy/enable-server-login.sh` | 登录权限一次性设置（已执行） |
| `docs/deploy/move-epr-to-production.sh` | epr 搬到正式站（已执行，附回滚指令） |
| `docs/deploy/map-epr-to-preview.sh` | 过渡用，已不再使用 |
| `docs/security/` | 安全整改计划、CHG-05 服务端登录、登录后免密码设计 |
| `docs/hr/` | 会议签到、积分、固定上下班时间、员工任务的设计 |
