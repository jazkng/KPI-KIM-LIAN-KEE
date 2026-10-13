# CHG-05 / CHG-06 权限整改实施方案（2026-10-13）

> 状态：**方案与草案，未执行**。没有修改正式 Firestore Rules、Auth 设定、Cloud Run 或 V1 部署。
> 依据：`2026-10-12-production-emergency-plan.md`（CHG-05、CHG-06）、`2026-10-12-security-remediation-plan.md`（E2、E3），以及本次对 V1（`main` @ `2f9fad2`）程式码的逐项盘点。
> 规则草案：`security/rules/firestore.chg06.rules`；紧急回滚规则：`security/rules/firestore.chg06-rollback.rules`。
> Emulator 测试：`tests/rules/chg06.rules.test.ts`（62 项）、`tests/rules/chg06-rollback.rules.test.ts`（4 项），全部通过。
> 已依 Codex 安全审核（PR #13）修正：claims 来源受保护、临时 PIN 不直接换正式身份、bootstrap 不开放接口、回滚规则不外泄 PIN 哈希、厨房屏限门店与状态顺序；第二轮：取消固定系统管理员编号特例并强制文件 ID 一致、回滚期间保护权限栏位并以 epoch 作废回滚期间的身份。

## 1. 结论

1. **CHG-06 只能做「身份门槛」，不能做「角色门槛」，否则 V1 会坏。**
   - V1 的功能权限是前端按 `allowedModules` 控制的：Counter 员工（CREW）可以做日结并写入 `settlements`、`standalone_expenses`；有 HR 模组的店长可以改他人资料与薪资；考勤主控台替他人打卡。
   - 在规则里按角色限制这些集合，等于关掉这些员工今天正在用的功能。
   - 所以 CHG-06 草案让**每一位持有新身份的员工**照常读写 V1 的全部集合，与今天完全相同。只挡掉匿名身份、旧身份与外部存取，并限制专用设备的范围。
2. **CHG-05 必须先改掉 V1 中 5 处「浏览器读 PIN 或匿名写入」的地方**，否则 CHG-06 一发布，登录、设备登录、考勤 PIN 打卡、排班重置都会失效（见第 3 节）。
3. **员工的使用方式只变一次**：每台装置重新登录一次（CHG-05），每人领一次临时 PIN 再设新 PIN（CHG-06 窗口）。其余操作不变。
4. **PR #12（考勤导入）**：草案已把新的 `attendance_import_batches` 限制为管理层以上可写、任何人不可删除（V1 不使用此集合，不影响 V1）。但 `attendance` 本身仍须对所有员工开放（V1 需要），这个剩余风险要等 V2 取代考勤主控台、改由服务端写入才能消除。见第 7 节。

## 2. 现况（V1 盘点结果）

- 每个浏览器都以 **Firebase 匿名身份**存取 Firestore（`firebaseConfig.ts` 的 `signInAnonymously`）；规则只检查 `request.auth != null`。
- **没有任何公开页面**：没有顾客查询排队、问卷、点单或公开菜单页。所有画面都要员工 PIN 登录或设备登录。
- 服务端（`server.ts`）目前**完全不连 Firestore**，没有 `firebase-admin`。签发登录身份需要新增服务端程式。
- 登录状态只存在 `localStorage`，恢复时不重新验证身份。
- 专用设备只有两种画面：**厨房提醒**（`KITCHEN_ALERT`）与**排队屏**（`QUEUE_DISPLAY`）。

## 3. CHG-06 发布后会失效、必须由 CHG-05 先改掉的 V1 流程

| # | V1 位置 | 今天的做法 | 发布新规则后 | CHG-05 改法 |
| --- | --- | --- | --- | --- |
| 1 | `Login.tsx:375`、`:463`、`:494` | 登录前以匿名身份读取**全部员工资料（含明文 PIN）**，在浏览器比对；老板登录会扫描所有人的 PIN | 读不到 → 无法登录 | `GET /api/auth/roster`（不含 PIN）+ `POST /api/auth/login`；老板键盘改用 `POST /api/auth/boss-login`；成功后 `signInWithCustomToken` |
| 2 | `Login.tsx:481` | 首次登录（PIN 为 `0000`）在登录前直接覆写自己的员工文件 | 写入被拒 | `POST /api/auth/change-pin`，由服务端写入 |
| 3 | `Login.tsx:397`（初始化系统按钮） | 没有老板时，匿名写入预设员工 | 写入被拒 | **移除按钮**，不开放任何接口。改为负责人在服务端执行一次性的管理指令（见 4.1） |
| 4 | `DeviceScreenPortal.tsx:152`、`deviceAccountService.ts:519-563` | 设备登录前，以匿名身份读取全部设备户口（**含 PIN 哈希与盐**），在浏览器验证，再写回登录状态 | 读不到 → 设备无法登录 | `GET /api/auth/devices`（不含秘密）+ `POST /api/auth/device-login`，签发设备身份。PIN 哈希移到只有服务端能读的 `device_secrets` |
| 5 | `AttendanceConsole.tsx:1928-1983`、`:2481`；`RosterResetDialog.tsx:62` | 管理层装置上，**在浏览器比对被打卡员工或主管的明文 PIN** | 规则不挡，但 CHG-06 窗口重设 PIN 后：新 PIN 只有哈希，旧 `pin` 栏位过时 → 正确的新 PIN 被拒、旧 PIN 反而通过 | `POST /api/auth/verify-pin {employeeId, pin}` → 只回 `{ok}`，不签发身份；按员工 + IP 限次 |
| 6 | `App.tsx:141-146`、`Login.tsx:372` | 登录前读取 `config/store` 显示 Logo | 读不到 → 没有 Logo（须确认不会卡住画面） | `/api/auth/roster` 一并回传 Logo 与店名 |
| 7 | `App.tsx:111-126`、`DeviceScreenPortal.tsx:28` | 从 `localStorage` 恢复登录，不重新验证 | 旧装置没有新身份 → 每次读写都被拒，画面空白 | 启动时以 Firebase 登录状态为准：没有带 `emp`（或 `device`）claim 的身份，就清除旧状态、回到登录页 |
| 8 | `HRDeviceAccounts.tsx`（建立设备、改设备 PIN） | 浏览器计算 PIN 哈希并写入 `device_accounts` | 不会被挡，但哈希会留在客户端可读的集合 | 改为服务端接口，哈希写入 `device_secrets` |

> 第 1–4、7 项不改，CHG-06 一发布就会**停止营业**。第 5、8 项不改，安全性会倒退。所以这 8 项全部属于 CHG-05 的必做范围。

## 4. CHG-05 设计

### 4.1 服务端接口

放在哪里由负责人决定（S5）：AI Studio 的 Cloud Run 若无法调整服务账号，就在同一 GCP 项目新增小型服务 `klk-auth`。两个 V1 部署与 V2 预览都呼叫同一个服务，CORS 只放行这三个网址。

| 接口 | 用途 | 防护 |
| --- | --- | --- |
| `GET /api/auth/roster` | 登录页名单：ID、姓名、头像、职位、是否须改 PIN，加上 Logo、店名 | 不含 PIN、薪资、电话 |
| `POST /api/auth/login` | 员工 ID + PIN → Custom Token | 按员工 + IP 限次，连续失败锁定；比对旧明文 PIN 与新哈希 PIN（`ACCEPT_LEGACY_PIN` 开关）。**若用的是临时 PIN（或须改 PIN），不签发身份**，只回传一次性的改 PIN 凭证 |
| `POST /api/auth/boss-login` | 老板键盘只输入 PIN | 只比对层级为 OWNER / BRANCH_MANAGER 的人；限次更严 |
| `POST /api/auth/change-pin` | 首次登录或员工自己改 PIN | 需要有效身份，或 login 回传的一次性改 PIN 凭证（10 分钟有效、只能用一次、服务端只存哈希）。改完后撤销该员工所有旧登录（`revokeRefreshTokens`），才签发正式身份；新 PIN 只写哈希 |
| `POST /api/auth/verify-pin` | 考勤主控台 PIN 打卡、排班重置的二次确认 | 需要管理层身份；只回 `{ok}`；限次 |
| `GET /api/auth/devices`、`POST /api/auth/device-login` | 设备名单与设备登录 | 不含秘密；设备 PIN 限次 |
| `POST /api/auth/device-admin/*` | 建立设备、改设备 PIN、撤销登录 | 需要管理层身份 |

**不提供 bootstrap 接口。** 系统没有任何员工的情况，只会发生在首次建立或资料毁损时，由负责人在服务端执行一次性管理指令（Admin SDK，需要 GCP 权限）：

- 在 Firestore 交易中建立 `system/bootstrap` 哨兵文件，已存在就停止，保证只执行一次；
- 建立第一位老板，并产生临时 PIN（必须先改 PIN 才能取得正式身份）。

网页上的「初始化系统」按钮移除，任何人都无法从网络建立老板。

### 4.2 身份内容（Custom Token claims）

| 类型 | claims | 来源 |
| --- | --- | --- |
| 员工 | `emp`、`lvl`（OWNER / BRANCH_MANAGER / STAFF_SUPPORT / DEPARTMENT_HEAD / TEAM_LEAD / CREW）、`portal`、`ro`、`sa`、`epoch` | **只看明确存放的栏位**：`orgLevel`（没有就当 CREW，不从职位名称推断）、`systemRole`（**不再**沿用 V1「员工 ID 为 `002` 即系统管理员」的特例）、`portalRoleOverride`、`readOnlyAccess` |
| 设备 | `device`（`device_xxx`）、`screens`、`store`、`epoch` | `device_accounts` |

- **claims 的来源受规则保护**：上述 4 个栏位只有老板或系统管理员能修改；一般员工新增员工时也不能直接设成管理层或系统管理员；只有老板 / 系统管理员能删除员工资料（第 5 节）。否则任何员工都能把自己改成老板，再重新登录取得高权限身份。
  - V1 只在老板 / 系统管理员模式显示这些栏位为可编辑（`HRProfiles.tsx:1648-1649`），不影响 V1。
- **文件内的 `id` 必须等于文件 ID**（规则强制），任何人都不能把自己的编号改成别人的，或以别的路径建立冒用编号的文件。
- **前置资料补齐（须负责人批准）**：V1 的员工资料可能没有 `orgLevel`，由职位名称推断。HR 画面储存时会把推断结果写回（`HRProfiles.tsx:432`、`:676`），若不先补齐，非老板储存旧资料会被新规则拒绝，而服务端也会把这些人当成 CREW。
  - 所以 CHG-06 之前，要为所有没有 `orgLevel` 的员工写入「目前推断出的同一个值」；
  - 同时为员工 `002`（V1 固定的系统管理员）明确写入 `systemRole: 'SYSTEM_ADMIN'`，此后系统管理员只看这个栏位；
  - 只新增栏位，不改变任何人的实际权限；先备份，写入清单交负责人确认。
- CHG-05 期间签发 `epoch: 1`。CHG-06 窗口改为只签发 `epoch: 2`，并对所有人执行 `revokeRefreshTokens`。
- claims 只放少量资料，远低于 1,000 字节上限；`allowedModules` 不放进 claims。

### 4.3 前端改动（V1 与 V2 都要改）

- 第 3 节表中 8 项全部改掉。
- 移除 `signInAnonymously`：登录前**不需要任何 Firestore 存取**。
- 登出时执行 `signOut`。

### 4.4 CHG-05 上线时规则不变

正式规则在 CHG-05 期间仍是 `request.auth != null`，新身份当然也符合。所以：

- CHG-05 上线**不会**让任何人失去权限；
- 若出问题，重新部署上一版就能恢复，旧的匿名登录照常可用。
  - 前提：Firebase Console 的「匿名登录」在 CHG-06 前**不要关闭**。

## 5. CHG-06 规则草案（`security/rules/firestore.chg06.rules`）

| 对象 | 权限 |
| --- | --- |
| 未登录、匿名身份、没有 claims、`epoch` 1 | 一律拒绝 |
| 员工（`epoch` 2，任何层级） | V1 全部集合照常读写（与今天相同），但 `employees` 例外如下 |
| `employees` | 员工照常读写；但 `orgLevel`、`systemRole`、`portalRoleOverride`、`readOnlyAccess` 只有老板 / 系统管理员能改；一般员工新增员工不能设成管理层或系统管理员；只有老板 / 系统管理员能删除 |
| `employee_secrets`、`device_secrets`、`auth_rate_limits` | 任何客户端都不能读写，只有服务端（Admin SDK）可以 |
| 厨房屏设备 | 只能读写**自己门店**的 `kitchen_alerts`。状态只能往前走：新 → 已确认、新或已确认 → 已完成，每种转换只能改对应的栏位。不能新增、删除、改内容、改门店，也不能改已完成的提醒 |
| 排队屏设备 | 只读 `queue_tickets`（V1 排队号码没有门店栏位，目前只有一家店；开第二家店前须补上门店栏位与规则） |
| 所有设备 | 读 `config/store`（Logo）与自己的 `device_accounts`；读不到员工、财务、其他设备 |
| `device_accounts` | 员工可管理（HR 设备户口画面）；设备只能读自己的那一份 |
| `attendance_import_batches`（V2 新集合） | 员工可读；只有管理层以上能建立与更新；任何人不能删除；备份子集合写入一次后不能修改 |

### 已在 Emulator 验证（`npm run test:rules`，70 项全部通过）

- **V1 兼容**：V1 实际使用的 43 个集合（含以变数组成名称的 `stock_*`、`device_accounts`、`kitchen_alerts`），CREW 身份都能读、建立、更新、删除。
- **V1 典型流程**：Counter 员工做日结、管理层替他人打卡、HR 改他人资料、员工改自己的语言，全部通过。
- **身份门槛**：未登录、匿名、没有 claims、`epoch` 1 → 读员工、写日结、读门店设定，全部被拒。
- **秘密集合**：老板、CREW、设备、匿名都读写不到 `employee_secrets`。
- **权限来源**：
  - CREW 不能把自己改成老板、系统管理员、改入口或取消只读；
  - 部门主管也不能升级自己或别人；老板与系统管理员可以；
  - HR 画面整份重存（权限栏位值不变）、改职位名称、写警告记录照常可以；
  - 一般员工只能新增非管理层员工；只有老板 / 系统管理员能删除员工资料；
  - 文件内的 `id` 必须等于文件 ID：不能冒用 `002`，连老板也不能改掉员工编号。
- **设备**：
  - 厨房屏可以确认、完成提醒；改内容、新增、删除都被拒；
  - 已完成的提醒不能改回、不能反复改写处理人；不能跳回「新」；
  - 别家门店的提醒读不到也改不了，也不能把提醒改到别的门店；
  - 厨房屏看不到排队，排队屏看不到厨房，排队屏不能改号码；
  - 设备读不到别的设备、员工资料、财务与考勤设定。
- **考勤导入记录**：
  - 部门主管可以建立、完成；CREW 不能建立；老板也不能删除；
  - 备份写入后不能修改、不能删除，CREW 读不到。
- **紧急回滚规则**（4 项）：
  - 旧版 V1 的匿名身份可以照常读写营业资料，也能改语言、改旧 PIN、新增 CREW 员工；
  - 匿名身份不能改权限栏位、不能冒用员工编号；
  - `employee_secrets`、`device_secrets` 无论匿名或新身份都读写不到；
  - 未登录仍被拒。
- **现行 V1 规则**的 4 项测试照旧通过，包括「已知漏洞」：匿名身份目前仍能读写员工资料。

> 测试执行方式改为两个规则测试档依序执行（`--no-file-parallelism`），避免两份规则在同一个 Emulator 互相覆盖。

## 6. 员工与设备的影响

| 对象 | CHG-05 上线时 | CHG-06 窗口 | 之后日常 |
| --- | --- | --- | --- |
| 老板、管理层、员工 | 每台装置重新登录一次，PIN 不变 | 领取临时 PIN（72 小时有效），登录后设新 PIN，约 1–2 分钟 | 与今天相同 |
| 厨房屏、排队屏 | 重新做一次设备登录 | 用新设备 PIN 重新登录 | 与今天相同 |
| 考勤主控台 PIN 打卡、排班重置 | 改为服务端验证，画面不变 | 使用新 PIN | 与今天相同 |
| 只读帐号 | 不变（仍由前端控制） | 同员工 | 不变 |

## 7. 剩余风险（CHG-06 之后仍存在，由 V2 逐步消除）

| 风险 | 原因 | 消除方式 |
| --- | --- | --- |
| 已登录员工能读写所有 V1 集合，包括他人薪资、财务资料 | V1 功能权限在前端；规则若按角色限制会让 V1 坏掉 | V2 逐个模组取代 V1 画面后，在规则或服务端按角色收紧（每收紧一个集合，先确认 V1 已不再写它） |
| 任何员工都能改写 `attendance`（含导入的 `_face` 记录） | V1 考勤主控台需要；V1 的模组授权可能给到 TEAM_LEAD 或 CREW | PR #12 的导入改由服务端接口写入（Admin SDK，检查身份与模组）；V2 取代考勤主控台后收紧 `attendance` |
| `employees` 文件的旧 `pin` 栏位在 CHG-07 前仍可被已登录员工读到 | 回滚需要保留 | 窗口后旧 PIN 已不被接受，读到也无法登录；CHG-07 删除 |
| 唯读模式只在前端 | 同上 | V2 |

## 8. 测试计划

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 规则草案与回滚规则 | Emulator 66 项（第 5 节） | ✅ 已完成 |
| CHG-05 服务端 | 单元测试：旧明文与新哈希 PIN、限次与锁定、claims 只依明确栏位、roster 不含 PIN、临时 PIN 只能换改 PIN 凭证（凭证只能用一次、过期失效、改完撤销旧登录）、bootstrap 指令只执行一次；以 Auth + Firestore Emulator 执行 | 待开发 |
| CHG-05 + 草案规则端到端 | Playwright 连 Emulator（载入草案规则），逐一测试：老板、店长、部门主管、会计、Counter 员工、厨房员工、只读帐号、厨房屏、排队屏；每个角色打开它所有的模组并完成一个写入（日结、打卡、库存、排队叫号、厨房提醒、薪资草稿、应付账款）；另测首次登录改 PIN、初始化按钮、考勤 PIN 打卡、排班重置 | 待开发。这是确认 V1 不受影响的主要依据 |
| CHG-05 上线后观察 | 两个 V1 部署上线后 2–3 个营业日；确认所有装置都已用新方式登录（服务端登录记录涵盖全部在职员工与设备） | 待执行 |
| CHG-06 窗口 | 依紧急整改计划 CHG-06 的验证清单（匿名监听断开、旧 PIN 被拒、旧身份被拒、各角色常用流程） | 待执行 |

## 9. 回滚

| 步骤 | 回滚方法 | 所需时间 | 代价 |
| --- | --- | --- | --- |
| CHG-05 | AI Studio 重新部署上一版；`klk-auth` 若有新增可保留不用 | 约 5 分钟 | 无。规则未变，匿名登录照常可用 |
| CHG-06 规则 | **发布事先准备好的紧急回滚规则**（`security/rules/firestore.chg06-rollback.rules`），**不要**恢复历史版本；同时服务端切换为回滚模式（见下） | 1 分钟内生效（既有监听最长约 10 分钟） | 重新打开「匿名可读写营业资料」的漏洞，只在营业被阻断时使用。新的 PIN 哈希与员工权限栏位仍受保护：若恢复历史版本（全部开放），刚重设的数字 PIN 哈希会被匿名身份读走并离线破解，权限栏位也可被匿名改写 |
| CHG-06 PIN 切换 | 服务端 `ACCEPT_LEGACY_PIN=true` | 立即 | 旧 PIN 恢复可用。`employees.pin` 在 CHG-07 前不删除 |
| PR #12（若已合并） | 还原合并，或停用导入入口；已写入的考勤可用 `attendance_import_batches/{id}` 的 `recordIds` 与 `replaced` 备份还原 | 数分钟 | 无 |

**回滚模式与重新收紧（防止回滚期间被植入长期有效的身份）：**

1. 回滚时，服务端设定 `AUTH_MODE=ROLLBACK`：只签发 `epoch: 1` 的身份。回滚规则接受，但 CHG-06 规则一律拒绝。
2. 回滚期间，匿名身份仍可改写员工的旧 `pin` 栏位（旧版 V1 需要），但改不了 `orgLevel` 等权限栏位（规则保护，已测试）。
3. 重新收紧时：
   - 发布 CHG-06 规则，但把接受的 `epoch` 改为 **3**；
   - 服务端改为只签发 `epoch: 3`，并对所有人执行 `revokeRefreshTokens`。回滚期间签发的任何身份都因此失效。
4. 收紧前，将 `employees` 的 `pin`、`orgLevel`、`systemRole`、`portalRoleOverride`、`readOnlyAccess` 与回滚前的备份逐一比对：
   - 有任何 `pin` 被改动的员工，必须重新领取临时 PIN；
   - 权限栏位有改动就停止，先查明原因。

**前提**：CHG-01 的备份（PITR + 每日备份）必须先启用，并完成恢复演练。

## 10. 与 PR #12 的关系

- **保持不合并**，直到负责人决定。
- 建议的合并条件，二选一：
  - (a) CHG-05 与 CHG-06 已上线；
  - (b) 负责人接受「合并到 `develop-v2` 只影响有密码门禁的 V2 预览站、只由负责人使用」，并在 CHG-05 完成后把导入改为服务端写入。
- **加班**：维持现状，**不会自动计入薪资**。已核对 PR #12，薪资画面没有读取 `approvedOtMinutes`。已批准的加班只存在考勤记录，并用于人工成本**估算**。待负责人确认实际班表与计算规则后，另开 PR 启用。
- **主管审核**：维持现状。所有异常必须处理完才能导入；PDF 也走同一个审核流程。

## 11. 待负责人批准与决定

1. **S5**：认证接口放在 AI Studio 的 `server.ts`，还是新增 `klk-auth` Cloud Run 服务？须先在 GCP 确认服务账号能否签发 Custom Token。
2. 批准 CHG-06 前的 `orgLevel` 补齐：为没有 `orgLevel` 的员工写入目前推断出的同一个值（只新增栏位、先备份、清单先交确认）。
3. 批准开发 CHG-05：从 `main` 开 `hotfix/v1-chg05` 分支修改 V1，同步修改 V2；经 PR 审核，**不上线**。
4. 批准 CHG-01：开启 PITR 与每日备份，并做一次恢复演练。这是 CHG-06 的前提。
5. 本规则草案的方向：CHG-06 只做身份门槛，角色限制留给 V2。
6. CHG-05 端到端测试通过后，分别批准 CHG-05 上线与 CHG-06 窗口时间。

## 附录 · V1 集合盘点

- **员工身份读写**：
  - `employees`、`settlements`、`standalone_expenses`、`payment_vouchers`、`fund_transfers`、`bill_payments`、`payroll`、`attendance`、`roster`、`roster_months`、`config`；
  - `logs`、`notifications`、`suppliers`、`purchase_orders`、`inventory_tasks`、`inventory_logs`；
  - `stock_kitchen`、`stock_bar`、`stock_general`、`stock_fuel`、`stock_price_history`、`storehubSales`；
  - `assessment_records`、`assessment_boss_ratings`、`warranties`、`treasury_monthly_closings`、`task_completions`、`system_backups`；
  - `strategy_proposals`、`strategy_okrs`、`strategy_events`、`strategy_campaigns`；
  - `self_issued_vouchers`、`recurring_bills`、`menu`、`ap_ai_corrections`、`translations`、`sop_progress`；
  - `queue_tickets`、`queue_counters`、`kitchen_alerts`、`device_accounts`。
- **设备读写**：
  - 厨房屏：`kitchen_alerts`（读、确认、完成），`config/store`，`device_accounts/{自己}`；
  - 排队屏：`queue_tickets`（读），`config/store`，`device_accounts/{自己}`。
- **其他**：
  - 没有子集合，也没有 `collectionGroup` 查询；
  - 没有背景排程写入（自动备份程式码存在但未被呼叫）。
