# 登录认证 · Firestore Rules · 发票扫描 API · 权限 —— 安全整改方案

- 日期：2026-10-12
- 状态：**方案草案，待负责人批准**。本文件不修改任何生产系统。
- 可执行的生产变更单（含审批与回滚）：见 [`2026-10-12-production-emergency-plan.md`](2026-10-12-production-emergency-plan.md)。
- 依据代码：`main@2f9fad2`（假设与 V1 当前运行版本一致；这一点待核实，见审计报告第 6 节）
- 本文件不包含任何密钥值。

---

## 第一部分 · 紧急评估：生产环境是否真的存在未授权访问风险

### 评估方法

- **没有**对正式网站、正式 Firebase 或 Cloud Run 做任何探测或攻击性验证。规范禁止测试代码接触生产环境，主动验证漏洞本身也属于对生产的未授权操作。
- 结论来自三方面：
  1. 阅读 V1 代码。
  2. 在本机 Firestore Emulator 中，使用与仓库**完全相同**的 `firestore.rules` 复现（`tests/rules/firestore.rules.test.ts`，CI 每次运行）。
  3. 列出需要负责人在控制台确认的前提条件。

### 结论：只要下列前提成立，风险就是**真实且可被低技术门槛利用**的

| # | 攻击路径 | 需要攻击者做什么 | 生产成立的前提 | 后果 |
| --- | --- | --- | --- | --- |
| P1 | **直接读写数据库** | 打开网站 → 从公开 JS 取得 Firebase Web 配置（设计上就是公开的）→ 用 Firebase SDK 匿名登录 → 任意读写 | ① 正式 Firestore Rules 与仓库相同（或更宽）；② Anonymous 登录已启用（V1 必须启用才能运行） | 读取全部员工 PIN、薪资、财务资料；修改或删除任何集合 |
| P2 | **伪造登录状态** | 在浏览器 DevTools 中把 `localStorage.kepong_erp_session_employee` 设为 `{"id":"001"}`，然后刷新 | 无（纯前端逻辑） | 不需要 PIN 就能进入老板界面（App 会按 ID 从云端拉取老板资料并授予权限） |
| P3 | **发票扫描代理** | `curl https://<V1网址>/api/ap-ai/api/...` | V1 后端已设置 `INTERNAL_API_KEY`（只要发票扫描功能能用，就一定已设置） | 代理会替**任何人**加上内部密钥：列出、删除、搁置、归档 Google Drive 中的待处理发票；消耗 Gemini 额度 |
| P4 | **Gemini 接口滥用** | 直接 POST `/api/gemini/*` | V1 后端已设置 `GEMINI_API_KEY` | 产生费用（每 IP 每分钟有少量限流，但计数在内存中，换 IP 即可绕过） |
| P5 | **设备账号 PIN 离线破解** | 通过 P1 读取 `device_accounts` 的 PBKDF2 哈希 | 同 P1 | 4–8 位数字 PIN 可在本机快速穷举 |
| P6 | **误触覆盖员工资料**（非攻击，但会造成破坏） | 登录页读取员工失败时（断网、匿名登录失败）会显示「初始化系统」按钮 | 无 | 点击后会用默认名单**覆盖** `employees/001…`（PIN 重置为 8888，资料丢失） |

Emulator 复现结果（实际运行）：未登录 → 读写被拒；匿名身份 → **可以读取 `employees` 中的 PIN，也可以改写 PIN**。

### 需要负责人在控制台确认的事项（只看，不改）

1. **Firebase Console → Firestore → Rules**：正式规则是否与仓库中的 `firestore.rules` 相同。如果看到 `allow read, write: if true` 或 `request.time < ...`，情况比本评估更严重。
2. **Firebase Console → Authentication → Sign-in method**：Anonymous 是否为「已启用」。
   **Users** 页的匿名用户数量是否远多于实际设备数。异常偏多可能代表已有外部访问。
3. **AI Studio → 两个 V1 App → Secrets**：是否都设置了 `INTERNAL_API_KEY`、`GEMINI_API_KEY`。只看名称，不需要提供值。
4. **Google Cloud → Cloud Run → ap-ai-service → Logs**：是否有非营业时间或异常频率的 `/api/delete-pending`、`/api/commit-bill` 请求。
5. **Google Cloud → Billing**：Gemini API 的用量有没有异常峰值。

如果第 1、2 项成立，P1 就已经确认存在于生产环境；如果第 3 项成立，P3 也确认存在。

---

## 第二部分 · 最小影响的紧急修复方案（不等 V2 完成）

原则：
- 每一步都能单独上线、单独回退。
- 员工 PIN 不变；最多需要重新登录一次。
- 先补上「整个互联网都能进来」的漏洞，再处理「内部人员越权」。

> ⚠️ **流程前提：** V1 目前由 AI Studio 部署，GitHub 不会自动发布。所以紧急修复的流程是：
> 1. 在 `hotfix/v1-security-*` 分支开发，以 PR 审核，CI 必须全绿。
> 2. 经负责人批准后，由负责人在 AI Studio 中套用并部署。
>
> 两个 V1 网址很可能共用同一个 Firebase 项目。**收紧 Rules（E3）会同时影响两个网址**，所以两个部署都必须先完成 E2。

### E0 · 今天就能做，不改代码（负责人在控制台操作，需单独批准）

| 操作 | 目的 | 对员工影响 | 回退 |
| --- | --- | --- | --- |
| 开启 Firestore **PITR（时间点恢复，7 天）** 和每日计划备份 | 万一已被篡改或删除，可以还原 | 无 | 关闭即可 |
| 为 Gemini API Key 设置**每日配额上限**和**预算提醒** | 限制 P3、P4 的费用损失 | 超出配额时 AI 功能暂停 | 调高配额 |
| 按上面「需要确认的事项」检查日志 | 判断是否已被利用 | 无 | — |

### E1 · 小型代码补丁（约半天，V1 套用，几乎无感）

1. **发票扫描代理加锁（P3）**
   - 在 `server.ts` 中，`/api/ap-ai` 只放行实际用到的路径与方法：`GET /api/scan-pending`、`GET /api/vendor-config`（供应商归档设定弹窗读取，只读）、`POST /api/commit-bill`、`POST /api/hold-pending`、`POST /api/delete-pending`、`GET /health`。清单来自前端全部调用点（`AccountsPayableModule.tsx`、`VendorConfigModal.tsx`），实作时需再次核对。
   - 另外要求请求头带上 `X-AP-Access`。它的值等于新的服务端 Secret `AP_ACCESS_CODE`，用常数时间比较。
   - 老板或会计第一次在某台设备打开「应付账款」时输入一次访问码，之后保存在该设备。
   - 这是临时措施，E2 完成后改为验证登录身份。
2. **初始化按钮只在「确实读到 0 位员工」时显示（P6）**：读取失败时显示「连接失败，请重试」，不再显示初始化按钮。
3. **Gemini 接口（P4）**：加上每日总调用上限（服务端计数）。

回退方法：在 AI Studio 重新部署上一版。

### E2 · 服务端 PIN 验证 + Firebase Custom Token（核心修复，约 3–5 天）

- **新接口**（`server.ts`，使用 `firebase-admin`，以服务端权限读取员工资料）：
  - `GET /api/auth/roster`：只返回登录页需要的公开字段（ID、姓名、头像、职位），**不返回 PIN**。
  - `POST /api/auth/login {employeeId, pin}`：
    - 在服务端比对 PIN，兼容旧的明文 PIN 和新的哈希 PIN。
    - 按员工 ID + IP 限制尝试次数，连续失败会锁定。
    - 成功后签发 **Custom Token**，带上 claims：`emp`（员工 ID）、`portal`（BOSS / MANAGEMENT / STAFF）、`lvl`、`ro`（只读）。
  - `POST /api/auth/device-login`：专用设备（厨房、排队屏）登录，claims 为 `device` 和 `screens`。
  - `POST /api/auth/change-pin`：服务端写入哈希后的 PIN。
- **前端改动**：
  - `Login.tsx` 改为调用上述接口，然后执行 `signInWithCustomToken`。
  - App 启动时，以 Firebase 登录状态为准：如果没有带 `emp` claim 的身份，就退回登录页。这同时修好 P2。
  - `/api/ap-ai` 和 `/api/gemini` 改为验证 Firebase ID Token，并检查 claim（`portal`、`allowedModules`），取代 E1 的访问码。
- **前提条件（待核实）**：服务端需要能签发 Custom Token 的服务账号，也就是在运行时服务账号上授予 `roles/iam.serviceAccountTokenCreator`，并授予 Firestore 访问权限。
  - AI Studio 管理的 Cloud Run 未必允许调整服务账号。
  - 如果不行，就把认证接口放到同一个 GCP 项目中的独立小型 Cloud Run 服务（例如 `klk-auth`，做法与现有 `ap-ai-service` 相同）。这也只是增加一个服务，不需要第二个 Firebase 项目。
- **对员工的影响**：此阶段 PIN 不变，上线后每台设备需要重新登录一次。PIN 的全员重设在 E3 窗口进行。

### E3 · 切换窗口：收紧 Rules + 作废全部旧 PIN 与旧身份（在 E2 于两个 V1 部署都上线并稳定后）

**为什么必须在同一个窗口完成：**
- 旧 PIN 在 E3 之前对外公开可读，必须视为已经外泄。只收紧 Rules 而不作废旧 PIN，取得旧 PIN 的人仍可经 `/api/auth/login` 拿到被新 Rules 信任的员工身份。
- 新 PIN 必须在新 Rules 生效**之后**才产生。否则新 PIN（即使是哈希）在旧 Rules 下仍可被匿名读取，并离线穷举。
- 在 E2 至 E3 之间签发的身份，可能落入持有旧 PIN 的人手中，也要一并作废。

**规则草案**：用 `epoch` claim 一次作废全部旧身份。

```
function staff()  { return request.auth != null && request.auth.token.emp is string    && request.auth.token.epoch == 2; }
function device() { return request.auth != null && request.auth.token.device is string && request.auth.token.epoch == 2; }

// 注意：Firestore 只要有任一条 allow 成立就放行，所以通配规则必须「排除」秘密集合，
//       单独写一条 if false 无法覆盖通配规则。
match /{collection}/{document=**} {
  allow read, write: if staff() && collection != 'employee_secrets';  // 挡住匿名身份与 epoch 1 的旧身份
}
// employee_secrets（PIN 哈希）没有任何 allow → 客户端一律拒绝，只有服务端（Admin SDK）可访问
// 专用设备只放行它需要的集合（清单在实作时从 DeviceScreenPortal 盘点）
match /queue_tickets/{id} { allow read, write: if staff() || device(); }
```

**进入窗口前必须完成**（任何一项未完成，都不得开始窗口）：
- 在 Emulator 中演练全流程：把 KNOWN GAP 测试改为 `assertFails`，并补上「`epoch` 1 身份被拒」「旧 PIN 登录被拒」「已登录员工也读不到 `employee_secrets`」三组测试，全部通过。
- E2 已在两个 V1 部署上线并稳定。
- 已安排好每位员工领取临时 PIN 的时间。

**窗口内的步骤**（非营业时段，一次完成）：
1. 确认紧急整改计划 CHG-01 的备份为最新。
   并在发布 Rules **之前**，用一个匿名身份建立一个持续监听（例如监听 `employees` 集合），作为第 4 步的验证工具。
2. 发布新 Rules。新的查询约 1 分钟内会被拒绝。
3. 服务端切换设置：
   - 停止接受旧 PIN（`ACCEPT_LEGACY_PIN=false`）；
   - 改为只签发 `epoch: 2` 的身份；
   - 对所有用户执行 `revokeRefreshTokens`。
4. **等待规则完全生效，再写入任何 PIN 哈希。**
   - Firebase 文档说明：新规则对**已经存在的监听**最长约 10 分钟才完全生效。如果在此期间写入临时 PIN 哈希，切换前就建立的匿名监听仍可能收到它；而数字 PIN 可以离线穷举，临时 PIN 又有 72 小时有效期。
   - 所以发布后至少等待 **15 分钟**，并确认第 1 步建立的匿名监听已收到「权限被拒」而断开，才继续。如果没有断开，停止流程，不产生任何 PIN。
5. 由负责人执行服务端管理指令：为每位在职员工和每台专用设备产生**一次性临时 PIN**，有效期 72 小时。哈希存入 `employee_secrets`，明文只当场打印一次，当面交给本人。
6. 员工用临时 PIN 登录后，必须立刻设置新 PIN，新 PIN 只以哈希存储。

**回退**：
- 恢复上一版 Rules，并把 `ACCEPT_LEGACY_PIN` 改回 `true`。
- 旧的 `employees.pin` 字段在 E4 之前不删除，所以回退后旧 PIN 立即可用。
- ⚠️ 回退等于重新打开漏洞，只在营业被阻断时使用。

**结果**：完成 E3 后：
- 外部攻击者无法再通过匿名身份读写数据库（P1、P5）；
- 外泄的旧 PIN 和窗口前签发的身份全部失效。

剩下的「已登录员工能看到不该看的资料」，由 E4 和 V2 处理。

### E4 · 清理旧 PIN 与内部权限（E3 稳定后，并入 V2 优先做）

- 所有员工都完成新 PIN 设置并稳定运行后，删除 `employees` 中的旧 `pin` 字段。
  - 删除前另做一次备份导出；
  - 这一步不可逆，需要单独批准。
- 取消默认 PIN `8888` / `0000`。新员工一律使用一次性临时 PIN，首次登录必须更改。
- 删除旧 `device_accounts` 中的 PIN 哈希字段（已在 E3 移入 `employee_secrets` 或同等的服务端专用集合）。
- 开始按角色细分 Rules（见第三部分）。

---

## 第三部分 · V2 的完整权限模型（设计方向）

| 层级 | 机制 |
| --- | --- |
| 身份 | 服务端 PIN 验证 → Custom Token；claims：`emp`、`portal`、`lvl`、`modules`（精简版）、`ro`、`sysAdmin` |
| 权限变更即时生效 | 员工资料或权限修改时，服务端更新 claims 并撤销旧 Token（`revokeRefreshTokens`），前端强制刷新 |
| Firestore Rules | 按集合分角色：财务类（`settlements`、`payment_vouchers`、`fund_transfers`、`treasury_*`、`payroll`）只限 BOSS 与被授权的会计；员工只能写自己的打卡、日志、任务；`ro` 一律只读；历史日结、审计日志不可更新或删除 |
| 破坏性操作 | `restoreSystem`、`resetToDefaults`、批量删除改由服务端接口执行，并写审计日志；前端不再直接批量删除 |
| 服务端接口 | 统一 middleware：验证 ID Token、检查 claim、限流、写审计日志 |
| 防自动化滥用（可选） | Firebase App Check（reCAPTCHA Enterprise） |
| 备份 | PITR + 每日备份计划 + 定期导出到 Bucket；每季度做一次恢复演练（导入本机 Emulator 核对，不新建数据库，不覆盖正式库；详见紧急整改计划 CHG-01） |

每一项都会先写测试：Rules 用 Emulator 测试，接口用单元测试，再提交 PR。

---

## 第四部分 · 待负责人批准

| # | 事项 | 影响 |
| --- | --- | --- |
| S1 | 按第一部分完成控制台核实（只看） | 无 |
| S2 | E0：开启 PITR 或备份、设置 Gemini 配额与预算提醒 | 改动生产 GCP 设置（低风险） |
| S3 | 批准开发 E1（在 `hotfix/v1-security-e1` 分支，经 PR 审核） | 只改代码，不上线 |
| S4 | 批准 E1 上线到两个 V1 部署（由负责人在 AI Studio 操作） | V1 生产变更 |
| S5 | 核实 AI Studio 的 Cloud Run 能否设置服务账号权限；决定 E2 放在 `server.ts` 还是独立的 `klk-auth` 服务 | 决定架构 |
| S6 | 批准开发 E2，然后上线 E2 和 E3 | V1 生产变更，需分别批准 |
