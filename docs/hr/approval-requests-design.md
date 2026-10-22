# 设计说明：员工申请与管理层审批（请假 / 预支 / 调班）

> 状态：**待负责人批准**。批准前不写任何代码，也不建任何资料集合。
> 依据：CLAUDE.md「数据模型、权限、资金逻辑的改动：先写设计说明并获负责人批准」。

## 1. 要解决的问题
- 现在员工请假、要预支、想调班，都靠口头或 WhatsApp 讲，管理层再自己去改班表、记预支。没有记录，也容易漏。
- 管理层首页已经有「待我处理」（日结草稿、采购待收货、盘点、日志、班表待定、缺席、库存告急）。这份设计在同一个地方加上「**待审批**」：员工在员工页提出申请，管理层按「批准 / 拒绝」。

## 2. 范围（分三期，每期单独上线、单独验收）
| 期 | 申请类型 | 员工填什么 | 批准后系统做什么 |
|---|---|---|---|
| P1 | **请假**（事假 / 病假 MC / 年假） | 日期（可多天）、类型、原因、病假单照片（选填） | 把班表那几天的格子改成 LEAVE / MC / ANNUAL（班表现有格式，V1 看得懂） |
| P2 | **预支** | 金额、原因 | **不自动记账**。只把申请标成「已批准」，管理层照常在「兼职与预支」付钱、记录，记录上会带出申请编号，可以对回来 |
| P3 | **调班** | 日期、想跟谁换 | 对方员工同意 → 管理层批准 → 两人当天的班表格子互换 |

预支涉及现金。所以 P2 刻意不让「批准」直接产生支出记录，付钱与记账仍由人做，避免批准一下就多出一笔钱。

## 3. 资料设计（新集合，V1 不读不写）
新集合 `approval_requests`，每份申请一个文件：

```ts
interface ApprovalRequest {
  id: string;
  type: 'LEAVE' | 'ADVANCE' | 'SHIFT_SWAP';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  employeeId: string; employeeName: string; department: string;
  createdAt: string;            // ISO
  // 依类型只填一组
  leave?: { dates: string[]; kind: 'LEAVE' | 'MC' | 'ANNUAL'; reason: string; attachmentUrl?: string };
  advance?: { amount: number; reason: string };
  swap?: { date: string; withEmployeeId: string; withEmployeeName: string; peerAgreedAt?: string };
  // 谁审批：建立时算好，免得之后组织变动找不到人
  approverIds: string[];        // 直属上司（reportsTo）→ 没有就同部门 L3 → 再没有就 L2
  decidedBy?: string; decidedByName?: string; decidedAt?: string; decisionNote?: string;
  // 批准后实际改了什么（可追查、可人工还原）
  applied?: { at: string; roster?: { date: string; employeeId: string; from: string; to: string }[]; expenseId?: string };
  history: { at: string; by: string; action: string }[];   // 只增不删
}
```

- **不删除**：取消、拒绝都只改状态并在 `history` 加一笔。
- **不改既有字段**：班表仍是 `roster_months/{YYYY-MM}.roster[日期][员工ID] = 状态`，只用现有的状态值。
- **V1 兼容**：V1 不认得 `approval_requests`，也不需要认得；V1 看到的班表变化跟管理层手动改的一样。

## 4. 画面
- **员工页**：新增「申请」按钮，可以选请假、预支或调班。下面列出自己的申请，并显示状态（待审批 / 已批准 / 已拒绝）。
- **管理层首页「待我处理」**：最上面加「待审批 N」。每一笔一行，显示人、类型、日期或金额，旁边直接有「批准」「拒绝」两个按钮。拒绝时可以写一句原因。
- **请假冲突提醒**：批准前显示那几天同部门已经有几个人休息，避免批出去之后人手不够。
- **通知**：沿用现有通知中心。员工送出申请时通知审批人，审批完通知员工。手机推送目前默认关闭，跟着推送功能一起开。

## 5. 权限与安全（重要）
- 谁能审批：审批人清单里的人，加上 L1 / L2。L3 只能审批自己部门的申请。
- **现况限制**：V1 的登录与权限只在前端执行（见 `docs/security/`）。所以「谁能批准」目前也只能在前端判断，资料库层面挡不住懂技术的人直接改资料。
- **Firestore Rules**：需要为 `approval_requests` 加规则，例如员工只能建立自己的申请、不能把状态改成 APPROVED。这属于「修改正式 Rules」，按规定要另外取得批准。在 V2 服务端登录（CHG-05）全面接上之前，规则只能做基本检查。
- 每一次批准或拒绝都写入 `history`，可以追查。

## 6. 测试与上线
- 单元测试：审批人推算、请假转班表格子、调班互换、状态流转（不能从 REJECTED 改回 APPROVED 等）。
- Rules 测试（Emulator）：员工不能批准自己的申请、不能改别人的申请。
- 先在 Emulator 测通，再由负责人在预览站用 🧪 测试切换，分别扮演员工和管理层验收。
- 不在正式库建立测试申请。

## 7. 回滚
- 关闭功能开关后画面就不再显示，`approval_requests` 留着不删。
- 已经写进班表的变更，在 `applied.roster` 里都有 `from → to` 记录，可以逐笔还原。

## 8. 需要负责人决定
1. 三期的顺序：先做请假（P1）可以吗？
2. 谁审批：「直属上司 → 部门负责人 → 店面管理」的顺序对吗？老板要不要也收到每一笔？
3. 病假要不要强制上传病假单照片？
4. 预支有没有上限（例如每月不超过底薪的 X%）？超过时要不要只有老板能批？
5. 调班要不要对方员工先同意？
6. 是否同意为 `approval_requests` 新增 Firestore Rules（另一次批准）？
