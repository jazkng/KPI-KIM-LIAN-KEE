# PR E2 · 驾驶舱手机推送 —— 设计说明（待负责人批准）

> 依 CLAUDE.md「数据模型、权限、部署架构的改动：先写设计说明并获负责人批准」。
>
> **决定纪录（2026-10-14 负责人）：** 采用 FCM（P1）；批准新增三个推送集合与 `firebase-admin`（P5、P6）；先做 E2a。
> P2–P4（VAPID 金钥、服务账号授权、Cloud Scheduler）**尚未批准**，没有改动任何 Firebase / Cloud Run / GCP 设定。

## 1. 目标
在老板没有打开 ERP 的时候，把预警中心（PR E1）判断出的**高优先级预警**推送到老板手机。

推送规则沿用预警中心：
- 营业额下降
- 应付账款逾期
- 未日结
- 预计亏损
- 薪资未过账
- 以及老板自己设定的人工 / 食材 / OT 比例上限

## 2. 为什么不能只改前端
- 预警目前是在**打开驾驶舱时**由浏览器计算的。
- 老板没打开 App 时，浏览器不会执行任何程序。
- 所以要有一个**服务端定时任务**：读取资料、计算预警、发送推送。
- 这个任务涉及以下几件事，都需要负责人批准：
  - 正式 Firebase 的设定；
  - Cloud Run 的权限；
  - 新的 GCP 资源；
  - 新的 Firestore 集合。

## 3. 推送渠道比较

| 方案 | iPhone | Android | 费用 | 需要的设定 |
|---|---|---|---|---|
| **A. FCM 网页推送（建议）** | 需把 ERP「加入主画面」后打开（iOS 16.4+）。Safari 分页里收不到 | Chrome / 现有 TWA App 可直接收 | 免费 | Firebase 产生 VAPID 金钥；Cloud Run 服务账号授权 |
| B. Telegram Bot | 装 Telegram 即可，最稳定 | 同左 | 免费 | 建 Bot，Token 存 Secret Manager；财务讯息经 Telegram 服务器 |
| C. WhatsApp Cloud API | 最普及 | 同左 | 按讯息收费 | Meta 商业验证、讯息模板审核，最慢 |

**建议 A**：资料不离开 Google / Firebase，也不用第三方帐号。代价是 iPhone 必须先把预览站加入主画面。

## 4. 架构（方案 A）

```
Cloud Scheduler（每 30 分钟，08:00–22:30 MYT）
   │  OIDC 身份验证（只有 Scheduler 的服务账号能呼叫）
   ▼
erp-v2-dev  POST /api/push/evaluate
   ├─ firebase-admin 只读：日结、支出、薪资、员工、未付账单
   ├─ 用与驾驶舱相同的纯函数计算（cockpitMetrics + alertRules）
   ├─ 去重：同一条预警每天最多推一次（记录在 push_alert_log）
   └─ FCM HTTP v1 发送到 push_devices 中已启用的装置
```

**订阅流程：**
1. 老板在预警中心按「开启手机推送」。
2. 浏览器询问通知权限，老板允许后取得 FCM token。
3. 前端 `POST /api/push/register`，由服务端写入 `push_devices`。前端不直接写 Firestore。
4. 老板可随时按「关闭推送」，服务端把该装置标为停用。
5. 订阅页显示「已在这台装置开启 / 关闭」。

**推送内容只写摘要，不写金额**，避免锁屏时被旁人看到。例如：

> 金莲记 ERP：2 条高优先级预警（应付账款逾期、营业额下降）

点开推送才进入 ERP 看详情，详情仍受预览站访问门禁保护。

**预警阈值改存服务端：**
- 目前 E1 的阈值只存在手机本机。
- 推送需要服务端读得到阈值，所以要加一份 `push_settings/owner`，只有一笔文件。

## 5. 新增资料（只新增集合，V1 不读取、不受影响）

| 集合 | 内容 | 写入者 |
|---|---|---|
| `push_devices/{id}` | token、装置说明（例：iPhone 主画面）、启用状态、建立 / 最后使用时间 | 只有服务端（`/api/push/register`） |
| `push_settings/owner` | 推送开关、阈值、勿扰时段 | 只有服务端 |
| `push_alert_log/{date_alertId}` | 已推送纪录（去重与稽核用） | 只有服务端 |

⚠️ **Rules 风险：** 目前 Rules 是「任何已登入（含匿名）身份都可读写全部集合」。所以上面三个集合**在 Rules 层也读写得到**。
- **影响：** 能读到 token 的人，没有服务端金钥也**无法**发送推送。不过他可以删除、改写装置纪录，造成推送失效。
- **处理：**
  - 这三个集合的 Rules 收紧，与安全整改计划的 E3（custom claims）一起处理；
  - 在那之前，服务端每次发送前检查纪录格式，格式不对就停用该装置并记录。
  - **本 PR 不修改 Rules。**

## 6. 需要负责人批准 / 亲自操作的项目

| # | 项目 | 类别 | 谁操作 |
|---|---|---|---|
| P1 | 选择推送渠道（建议 FCM） | 决定 | 负责人 |
| P2 | Firebase Console → 专案设定 → Cloud Messaging → 网页推送凭证：产生 VAPID 金钥对，把公钥告诉我（公钥可公开，私钥不用给） | 正式 Firebase 设定 | 负责人 |
| P3 | `erp-v2-dev` 的执行服务账号授予：`roles/datastore.viewer`（只读 Firestore）、写入三个推送集合的权限，以及发送 FCM 的权限（Firebase Cloud Messaging API Admin） | Cloud Run / IAM 权限 | 负责人批准后执行 |
| P4 | 建立 Cloud Scheduler 工作（每 30 分钟，08:00–22:30 MYT），用 OIDC 呼叫 `/api/push/evaluate` | 新 GCP 资源 | 负责人批准后执行 |
| P5 | 新增三个 Firestore 集合（第 5 节） | 数据模型 | 批准即可 |
| P6 | 新增依赖 `firebase-admin` | 依赖 | 批准即可 |

## 7. 开发与测试计划（批准后）
1. **E2a，可以先做，不需要 P2–P4：**
   - 把 `loadCockpit` 的读取层抽成介面，浏览器与服务端（firebase-admin）共用同一套计算；
   - 加上 `/api/push/evaluate`、`/api/push/register` 与前端订阅介面；
   - 预设关闭：环境变数 `PUSH_ENABLED` 未设定时，接口回 503，按钮显示「未开通」；
   - Emulator 测试中，FCM 发送以 mock 取代，验证去重、勿扰时段、只推高优先级。
2. **E2b，需要 P2–P4：**
   - 在预览站开通；
   - 由负责人在自己的手机上实际收一次推送验收；
   - 不在正式资料库建立测试资料。
3. **回滚：**
   - 停用 Scheduler 工作，或把 `PUSH_ENABLED` 设为 false；
   - 已建立的推送集合不影响 V1，可以保留或由负责人决定删除。

## 7.1 E2a 完成状况（PR「feat(cockpit): PR E2a」）
- `utils/cockpit/cockpitLoader.ts`：驾驶舱读取层改为注入资料来源。
  - 浏览器用 DataManager；
  - 服务端用 firebase-admin（`server/push/pushService.ts`）；
  - 两边计算完全相同。Emulator 实测：服务端算出的高优先级预警与浏览器画面一致（3 条）。
- 推送规则 `server/push/pushPolicy.ts`（纯函数，有单元测试）：
  - 只推高优先级；
  - 同一营业日同一条只推一次；
  - 勿扰 22:30–08:00（马来西亚时间）；
  - 讯息不含金额。
- 接口：
  - `/api/push/status`
  - `/api/push/register`、`/api/push/unregister`、`/api/push/device-status`
  - `/api/push/settings`（GET / PUT）
  - `/api/push/evaluate`
- **预设关闭：** 没有 `PUSH_ENABLED=true` 时全部回 503，预警中心显示停用与原因。
- **`/api/push/evaluate` 的验证：**
  - 这是唯一不经预览站密码的路径，且只在推送开启时如此；
  - 必须带 Cloud Scheduler 的 OIDC 身份，服务账号与受众都要符合；
  - 未设定身份时回 503。
- `public/sw.js` 新增 `push` / `notificationclick`，与现有 Service Worker 共用。

## 7.2 E2b 开通步骤（待负责人批准 P2–P4 后执行）
1. Firebase Console 产生网页推送金钥（P2）。公钥以 GitHub 变数 `VITE_FCM_VAPID_KEY` 提供，这是**建置时**变数：
   - 要在 `deploy-dev-preview.yml` 加上 `--build-arg`；
   - `Dockerfile` 加上 `ARG`。
2. `erp-v2-dev` 执行服务账号授权（P3）：
   - Firestore 读取；
   - 三个推送集合写入；
   - FCM 发送。
3. 建立 Cloud Scheduler（P4）：
   - 每 30 分钟，POST `https://dev.kimliankee.app/api/push/evaluate`；
   - OIDC 服务账号为专用的 scheduler 账号，受众为同一网址。
4. 在 `deploy-dev-preview.yml` 的 `--set-env-vars` 加上：
   - `PUSH_ENABLED=true`
   - `FIREBASE_PROJECT_ID`
   - `PUSH_EVALUATE_AUDIENCE`
   - `PUSH_SCHEDULER_SA`

   注意：`--set-env-vars` 每次部署都会整组覆盖，直接在 Cloud Run 手动设定会在下次部署时被清掉。
5. 负责人在自己的手机上：
   - 从主画面打开预览站；
   - 进入预警中心 → 在这台装置开启 → 开启总开关；
   - 等定时任务收到一次推送，即为验收。

## 8. 不在本 PR 范围
- 推送给店长、员工（需要先有服务端登入与权限，见安全整改计划 E2 / E3）；
- 修改 Firestore Rules / Auth；
- 修改 V1。
