# CHG-05a · 服务端员工登录（V2）

> **依据：** `2026-10-13-chg05-chg06-permission-plan.md`（PR #13）第 3、4 节。
>
> **负责人决定：** 2026-10-14 批准开发 CHG-05（「先做第 2 项 CHG-05」）。**不上线 V1，不修改 Rules / Auth 设定。**
>
> **范围：** 只改 V2（`develop-v2`）。
> - CHG-05b：设备登录、考勤 PIN 验证、设备户口；
> - CHG-05c：移植到 V1。
>
> 以上两项另开 PR。

## 1. 完成的项目（对应方案第 3 节）

| # | 项目 | 做法 |
|---|---|---|
| 1 | 登录前读取全部员工（含明文 PIN） | 改为两步：<br>① `GET /api/auth/roster`：只回编号、姓名、职位、头像，**不含 PIN**；<br>② `POST /api/auth/login`：PIN 只在服务端比对，成功后 `signInWithCustomToken`。<br>老板入口改用 `POST /api/auth/boss-login`。 |
| 2 | 首次登录在登录前覆写自己的员工资料 | `POST /api/auth/change-pin`：凭一次性改 PIN 凭证由服务端写入。凭证 10 分钟有效、只能用一次，服务端只存杂凑。 |
| 3 | 网页「初始化系统」按钮 | 服务端登录模式下不显示。改为负责人执行 `scripts/auth/bootstrap-owner.ts`。<br>这个指令用交易与 `system/bootstrap` 哨兵文件保证只执行一次；非 Emulator 必须加 `--confirm-production`。 |
| 6 | 登录前读取 `config/store` 显示 Logo | roster 一并回传 Logo |
| 7 | 从 localStorage 恢复登录，不验证身份 | 启动时 Firebase 身份的 `emp` claim 必须等于本机记住的员工，否则回到登录页。<br>旧装置只有匿名身份，也会回到登录页。 |
| — | 匿名身份 | 服务端登录模式下，员工画面不再建立匿名身份。<br>厨房屏、排队屏的设备登录在 CHG-05b 才改，所以设备画面暂时仍沿用匿名身份。 |
| — | 登出 | 一并 `signOut`。 |

## 2. 安全规则

**PIN**
- 新 PIN 只存 scrypt 哈希（`employee_secrets`）。
- 已有哈希的人只认哈希。
- 过渡期 `ACCEPT_LEGACY_PIN`（预设开启）仍接受旧明文 PIN，预设值与 V1 相同：没有 PIN 的老板是 8888、其他人是 0000。

**必须先改 PIN 的情况**
- 没有存 PIN、PIN 为 0000、或是负责人发放的临时 PIN：登录只拿到改 PIN 凭证，**不签发身份**。
- 新 PIN 必须是 6 位数字，不能是同一数字重复，也不能是 123456 / 654321。

**尝试次数**
- 每个员工 + IP：15 分钟内错 5 次，锁定 15 分钟。
- 老板入口按 IP 计算，锁定 30 分钟。
- 另有每 IP 每分钟 30 次的接口限流。

**claims**（`emp`、`lvl`、`portal`、`ro`、`sa`、`epoch`）**只看明确栏位**
- 没有 `orgLevel` 的人一律是 CREW，不从职位名称推断。
- 不再沿用「员工 002 = 系统管理员」的特例。
- CHG-05 期间 `epoch` 为 1。
- 画面上的入口（老板 / 管理层 / 员工）仍依 V1 规则判断，所以员工看到的画面不变。

**改 PIN 后**
- `revokeRefreshTokens` 撤销该员工所有旧登录，再签发新身份。

## 3. 新增与写入的资料

| 集合 / 栏位 | 写入者 | 说明 |
|---|---|---|
| `employee_secrets/{员工}` | 只有服务端 | PIN 哈希、是否须改 PIN |
| `auth_rate_limits/{杂凑}` | 只有服务端 | 尝试次数与锁定 |
| `auth_pin_change_tokens/{杂凑}` | 只有服务端 | 一次性改 PIN 凭证（只存杂凑） |
| `system/bootstrap` | 只有管理指令 | 只在系统完全没有员工时建立 |
| `employees/{员工}.pin` | 服务端（过渡期） | **同步写入新 PIN。** 原因：V1 与 V2 共用资料库，V1 仍比对这个栏位。<br>这与 V1 今天写入的栏位与格式相同。关闭方式：`MIRROR_LEGACY_PIN=false`，CHG-06 窗口后关闭。 |

**V1 兼容性**
- 只新增集合，没有删除、改名或改格式。
- `employees.pin` 的写法与 V1 首次登录改 PIN 相同。

**Rules 风险**
- 现行规则允许任何已登录（含匿名）身份读写上面这些集合。
- 依方案，CHG-06 规则会让 `employee_secrets` 等集合只有服务端可存取。
- 在那之前，PIN 哈希理论上可被已登录身份读到。哈希是 scrypt，比现在 `employees.pin` 的明文更安全，但 6 位数字仍可能被离线穷举。所以**正式上线前必须完成 CHG-06**。

## 4. 开关（预设全部关闭）

| 环境变数 | 预设 | 说明 |
|---|---|---|
| `AUTH_SERVER_ENABLED` | 未设定（关闭） | 必须为 `true`，且有预览站门禁或 Emulator，才会开放。<br>关闭时前端照旧使用原本的登录方式，与 V1 相同。 |
| `AUTH_EPOCH` | 1 | CHG-06 窗口改为 2 |
| `ACCEPT_LEGACY_PIN` | 开启 | `false` 时只认哈希 |
| `MIRROR_LEGACY_PIN` | 开启 | V1 仍用旧登录时必须开启 |

## 5. 在预览站开通前需要负责人批准（S5 与 IAM）

1. **S5：** 认证接口放在哪里。
   - 本模组可直接挂在 `server.ts`，也可另外部署成 `klk-auth`。
   - V2 预览可用现有的 `erp-v2-dev`。
2. **`erp-v2-dev` 执行服务账号需要两项权限：**
   - 对自己的 `roles/iam.serviceAccountTokenCreator`：签发 Custom Token 需要 `signBlob`；
   - Firestore 读写。
3. **在 `deploy-dev-preview.yml` 加上 `AUTH_SERVER_ENABLED=true`、`FIREBASE_PROJECT_ID`。**
   - `--set-env-vars` 每次部署都会整组覆盖，不能在 Cloud Run 手动设定。
4. **注意：** 开通后，员工在预览站改的 PIN 会同步到 V1（第 3 节）。

## 6. 测试（Emulator，虚构资料）

**单元测试**（`tests/unit/authCore.test.ts`）
- 哈希；
- 旧 PIN 与预设值；
- 临时 PIN；
- claims 只看明确栏位；
- 登录 ID 写法；
- 锁定；
- 一次性凭证。

**端到端测试**（Firestore + Auth Emulator）
- roster 不含 PIN；
- 新人以 0000 登录 → 必须改 PIN；
- 弱 PIN 123456 被拒；
- 改完：只存哈希，并同步 `employees.pin`，凭证标为已用、没有存原值；
- 重新整理后仍登录；
- 伪造本机登录状态（改成老板）→ 回到登录页；
- 已改 PIN 后旧 0000 被拒；
- 连续错 5 次 → 正确 PIN 也被锁；
- 老板入口：错误 PIN 被拒、正确 PIN 进入老板首页；
- 只有匿名身份的旧装置 → 回到登录页；
- 签发的 claims 为 `{emp:"001", lvl:"OWNER", portal:null, ro:false, sa:false, epoch:1}`；
- 管理指令：只执行一次，非 Emulator 未确认时拒绝执行。

**开关关闭时**
- `/api/auth/config` 回 `enabled:false`；
- 原本的老板登录（8888）照常可用。

---

# CHG-05b · 设备登录、设备户口、PIN 二次确认（V2）

## 完成的项目（对应方案第 3 节第 4、5、8 项）

| # | 项目 | 做法 |
|---|---|---|
| 4 | 设备登录前读取全部设备户口（含 PIN 哈希与盐），在浏览器验证 | 改为两步：<br>① `GET /api/auth/devices`：名单不含 PIN 哈希、盐、会话；<br>② `POST /api/auth/device-login`：服务端验证 PIN，签发设备身份（uid = 设备资料编号，claims：`device`、`screens`、`store`、`epoch`）。<br>同时写入与 V1 相同的会话栏位（`sessionVersion`、`sessionHash`），设备画面沿用现有的会话检查。 |
| 5 | 考勤主控台 PIN 打卡、排班重置在浏览器比对明文 PIN | `POST /api/auth/verify-pin`：<br>- 需要已登录员工，且是老板 / 管理层入口，或有考勤主控台 / 排班权限；<br>- 只回 `{ok}`，不签发身份；<br>- 按「被确认的员工 + IP」限次。 |
| 8 | HR 设备户口在浏览器计算 PIN 哈希并写入 `device_accounts` | `POST /api/auth/device-admin/create`、`change-pin`、`revoke`：<br>- 需要老板入口或 `HR_FILES` 权限；<br>- 新 PIN 的 scrypt 哈希存在只有服务端能读的 `device_secrets`；<br>- 改 PIN、停用、撤销登录时，一并撤销设备的 Firebase 身份。 |
| 7 | 设备画面从 localStorage 恢复会话 | Firebase 设备身份必须等于本机记住的设备，否则回到设备登录。 |

- 服务端登录模式下，设备画面也不再建立匿名身份。
- 员工画面在登录前不读 Firestore：门店 Logo 等员工登录后才读取。

## 过渡期与 V1 相容
- **旧设备：** V1 浏览器建立的设备 PIN 是 PBKDF2-SHA256、120,000 次迭代。服务端在 `ACCEPT_LEGACY_PIN` 开启时能验证，所以现有设备不必重设 PIN。
- **同步写回：** 新建或改 PIN 时，服务端同时把同一格式的 PIN 写回 `device_accounts`（`MIRROR_LEGACY_PIN`），V1 设备登录照常可用。
  - 单元测试证明：V1 浏览器算法能验证服务端写回的值。
  - 端到端测试证明：服务端改过 PIN 的设备，关闭开关后用原本的浏览器登录照常进入荧幕。
- **新增集合：** `device_secrets`，只由服务端写入。V1 不读取。

## 测试（Emulator，虚构资料）

**单元测试**（`tests/unit/deviceAuthCore.test.ts`，8 项）
- 与 V1 浏览器 PBKDF2 双向相容；
- 会话杂凑算法相同；
- 设备编号与 PIN 格式；
- 操作权限。

**端到端测试**
- 设备名单不含 PIN 哈希、盐、会话；
- 旧格式 PIN 的设备经服务端登录，进入排队荧幕，会话版本与杂凑已写入；
- 重新整理后仍在荧幕；
- 伪造成另一台设备的会话 → 回到设备登录；
- 设备 PIN 连续错 5 次 → 正确 PIN 也回 429；
- 建立设备的权限：
  - 未登录 401；
  - CREW 403；
  - 只有考勤权限的领班 403；
  - 老板 200；
  - 重复建立 409；
- 新设备：`device_secrets` 为 scrypt，`device_accounts` 写回 V1 PBKDF2，可以登录；
- 改 PIN：旧 PIN 401、新 PIN 200；
- verify-pin：
  - CREW 呼叫 403；
  - 有考勤权限的领班：正确 PIN `{ok:true}`，错误 PIN `{ok:false}`；
- 开关关闭：
  - 原本的老板登录与 AI 智脑照常；
  - 服务端改过 PIN 的设备用原本的浏览器登录照常进入荧幕。
