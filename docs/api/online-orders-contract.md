# 网站订单 API 契约 · v0.1（草案，待网站方与负责人确认）

- 适用：`kimliankee.app`（顾客网站，独立 Codex 项目） ↔ 御膳智控 ERP V2
- 来源：Issue #8「顾客网站订单 API 和 ERP 订单中心」
- 状态：**草案**。网站方确认前，ERP 不实作任何会写入正式数据的接口。
- 定价算法已实作并有单元测试：`utils/onlineOrders/pricing.ts`、`tests/unit/onlineOrderPricing.test.ts`

---

## 1. 原则

1. **网站不直接读写 Firestore。** 网站只调用本文件定义的 HTTPS API，看不到、也碰不到 ERP 的任何集合（工资、财务、库存、员工资料等）。
2. **价格只由服务器计算。** 请求里没有任何价格栏位，送了也会被忽略；回应中的金额以服务器为准。
3. **提交订单 ≠ 已收款。** 订单状态和付款状态分开记录。网站订单一律「到店付款」，提交后付款状态为 `UNPAID`。
4. **不重复计营收。** 营业额仍以 StoreHub / POS 和日结为准。网站订单只用来统计单数与运营，不计入营收汇总（见第 7 节）。
5. **个人资料最小化。** 只收姓名（称呼）和手机号码；不收电邮、地址、生日。
6. **所有状态变更都留下审计记录**，不可修改、不可删除。
7. **向后兼容。** 只新增集合与可选栏位，不改动现有的 `menu` 等集合的既有栏位。

## 2. 部署位置

- API 路径前缀：`/api/public/v1`。
- ⚠️ ERP 预览站 `dev.kimliankee.app` 整站有密码门禁，**不能**承载公开 API。公开 API 计划部署为同一 GCP 项目中的独立 Cloud Run 服务（暂名 `klk-order-api`），网址待定，例如 `https://order-api.kimliankee.app`。
- CORS 只允许 `https://kimliankee.app`，以及网站方的预览网址（待提供）。
- 速率限制：
  - 每个 IP 每分钟最多读取 60 次；
  - 每个 IP 每 10 分钟最多提交 5 张订单；
  - 每个手机号码每小时最多 5 张订单。
- 防机器人：提交订单时附带 Cloudflare Turnstile token（`turnstileToken`），由服务器验证。

## 3. 金额与识别码

| 项目 | 规则 |
| --- | --- |
| 金额 | 一律以**仙（sen）整数**表示，例如 RM 13.90 = `1390`。货币固定为 `MYR` |
| 规格 ID | `<itemId>:<规格名称 slug>`，例如 `hokkien-mee:大`。同一道菜内名称重复时，加 `~2`、`~3` |
| 选项 ID | `<itemId>:opt:<选项名称 slug>` |
| 订单 ID（`orderId`） | 服务器产生的随机 ID，不可猜测 |
| 订单号（`orderNo`） | 给人看的号码，例如 `W-251013-007`（W + 营业日 + 当日流水号）。以 Firestore 交易产生，与现有排队号码同样的做法 |
| 查询凭证（`publicToken`） | 由服务端以密钥计算：`HMAC-SHA256(ORDER_TOKEN_SECRET, orderId)`，Base64URL 编码。提交成功时回传；同一个幂等键重送时可以重新算出同一个凭证（见 4.3）。查询和取消都必须同时带上订单 ID 与凭证，防止他人逐号查看订单。**凭证只放在请求标头 `X-Order-Token`，不得放在网址里**（网址会进入存取日志、浏览器历史和分享链接），服务端日志须遮蔽此标头。密钥存于 Secret Manager，不进代码库 |
| 营业日 | 马来西亚时间，凌晨 4 点前归前一天，与 ERP 现有规则相同 |

## 4. 接口

### 4.1 `GET /api/public/v1/menu` — 公开菜单

回应 `200`：

```json
{
  "menuVersion": "2026-10-13T08:00:00Z",
  "currency": "MYR",
  "ordering": { "open": true, "message": null, "pickupLeadMinutes": 20 },
  "fees": { "serviceChargeBps": 0, "serviceTaxBps": 0, "roundToFiveSen": true },
  "categories": [{ "id": "NOODLES", "label": "面类" }],
  "items": [{
    "id": "hokkien-mee",
    "name": "福建面",
    "category": "NOODLES",
    "image": "https://…",
    "available": true,
    "variants": [{ "id": "hokkien-mee:小", "label": "小", "priceSen": 1390 }],
    "optionGroups": [{
      "id": "hokkien-mee:options", "label": "选项", "minSelect": 0, "maxSelect": 2,
      "choices": [{ "id": "hokkien-mee:opt:少辣", "label": "少辣", "priceDeltaSen": 0 }]
    }]
  }]
}
```

- 只输出白名单栏位。成本、配方、做法、视频等内部资料**绝不出现**，单元测试已验证。
- 现有菜单的选项是文字。名称结尾标示「(+RMx.xx)」的，例如「加生蛋 (+RM1.00)」，解析为加价 `priceDeltaSen`；没有标示的不加价。
- 名称提到金额但无法确定怎么计价的（例如「2位以上每位加RM1.50」），整道菜标为 `available: false`，宁可不开放也不少收钱。
  - 将来会在菜单新增可选的结构化加价栏位，不改动现有栏位。
- 价格不是正数的规格（例如菜单管理里预设为 0 元的 M / L 规格）不会公开。定价时服务端会再检查一次。
- 服务费与服务税费率**由负责人决定**，默认 0。

### 4.2 `POST /api/public/v1/orders/quote` — 试算（不建立订单）

请求：与 4.3 相同，但不需要 `customer`、`turnstileToken`。

回应 `200`：与 4.3 回应中的 `totals`、`lines` 相同。网站在结账页显示金额时，必须使用这个回应。

### 4.3 `POST /api/public/v1/orders` — 提交订单

标头：`Idempotency-Key: <UUID v4>`（**必填**）。同一个键在 24 小时内重复提交时，回传第一次的结果，不会建立第二张订单。网路重试或使用者连按，都只会产生一张订单。

请求：

```json
{
  "clientMenuVersion": "2026-10-13T08:00:00Z",
  "items": [
    { "itemId": "hokkien-mee", "variantId": "hokkien-mee:大", "quantity": 2,
      "optionChoiceIds": ["hokkien-mee:opt:少辣"], "note": "不要葱" }
  ],
  "customer": { "name": "Ali", "phone": "+60123456789" },
  "pickup": { "type": "ASAP" },
  "orderNote": "到了会打电话",
  "promoCode": null,
  "turnstileToken": "…"
}
```

规则：
- 品项与备注的上限：一张订单最多 30 行；每行数量 1–50 的整数；每行备注最多 100 字。
- 姓名 1–40 字；手机号码必须是马来西亚号码，服务器统一转为 E.164 格式。
- 取餐时间：`pickup.type` 为 `ASAP`，或 `SCHEDULED` 加 `time`（ISO 8601）。时间必须落在营业时间内，且不早于现在加上 `pickupLeadMinutes`。

回应 `201`：

```json
{
  "orderId": "q8Vf…",
  "orderNo": "W-251013-007",
  "publicToken": "…（只回传这一次）",
  "status": "PENDING_CONFIRMATION",
  "paymentStatus": "UNPAID",
  "priceChanged": false,
  "lines": [{ "itemName": "福建面", "variantLabel": "大", "optionLabels": ["少辣"],
              "quantity": 2, "unitPriceSen": 2550, "lineTotalSen": 5100, "note": "不要葱" }],
  "totals": { "subtotalSen": 5100, "serviceChargeSen": 0, "serviceTaxSen": 0,
              "discountSen": 0, "roundingSen": 0, "totalSen": 5100 },
  "createdAt": "2026-10-13T10:00:00+08:00"
}
```

- **幂等**：`Idempotency-Key` 为网站产生的 UUID。服务端在**同一个 Firestore 交易**内：读取 `online_order_idempotency/{key}` → 若不存在，建立订单、事件和幂等记录。
  - 幂等记录保存 `orderId`，以及请求指纹 `requestHash`：正规化后请求内容的 SHA-256，不含 `turnstileToken`。
  - 同一个键、指纹相同：回传第一次的结果，`publicToken` 由 `orderId` 重新计算，所以回应遗失后重送也能拿回凭证。
  - 同一个键、指纹不同：回 `422 IDEMPOTENCY_KEY_REUSED`，不建立新订单。
- `priceChanged: true`：网站送来的 `clientMenuVersion` 与当前菜单不同，金额可能有变。订单**照样建立**，以服务器金额为准，网站须提示顾客。
- 是否改为「价格变动时拒绝提交并要求重新确认」，见第 9 节待决事项。

### 4.4 `GET /api/public/v1/orders/{orderId}` — 查询订单

请求标头：`X-Order-Token: {publicToken}`（不得放在查询字串）

回应 `200`：订单号、状态、付款状态、品项快照、金额、取餐时间，以及给顾客看的拒单或取消原因。

- **不回传**顾客电话、内部备注，以及任何员工资料。

### 4.5 `POST /api/public/v1/orders/{orderId}/cancel` — 顾客取消

请求标头：`X-Order-Token: {publicToken}`；请求内容：`{ "reason": "选填" }`

- 只有在 `PENDING_CONFIRMATION`（店员尚未接单）时可以取消，其他状态回 `409 CANNOT_CANCEL`。

### 4.6 错误格式

```json
{ "error": { "code": "ITEM_UNAVAILABLE", "message": "福建面 目前不供应", "lineIndex": 0 } }
```

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `EMPTY_ORDER` `TOO_MANY_LINES` `INVALID_QUANTITY` `NOTE_TOO_LONG` `OPTION_*` `INVALID_PHONE` `INVALID_NAME` `INVALID_PICKUP_TIME` | 请求内容不合法 |
| 409 | `ITEM_NOT_FOUND` `ITEM_UNAVAILABLE` `VARIANT_NOT_FOUND` | 菜单已变更，网站应重新读取菜单 |
| 409 | `ORDERING_CLOSED` | 目前不接受网站订单 |
| 409 | `CANNOT_CANCEL` | 订单已被接单，不能取消 |
| 400 | `PROMO_NOT_SUPPORTED` | v0.1 尚未开放优惠码 |
| 403 | `TURNSTILE_FAILED` | 防机器人验证失败 |
| 422 | `IDEMPOTENCY_KEY_REUSED` | 同一个幂等键配上不同的请求内容 |
| 404 | `ORDER_NOT_FOUND` | 订单不存在，或凭证不符（两者回同一个错误，防止探测） |
| 429 | `RATE_LIMITED` | 请求太频繁 |

## 5. 状态

### 订单状态 `status`

```
PENDING_CONFIRMATION ─接单→ ACCEPTED ─开始备餐→ PREPARING ─完成备餐→ READY ─顾客取走→ COMPLETED
        │                      │                    │                  │
        ├─拒单→ REJECTED        └──────── 店员取消（须填原因）→ CANCELLED ┘
        ├─顾客取消→ CANCELLED
        └─超过 N 分钟无人接单→ EXPIRED（N 由负责人设定）
```

### 付款状态 `paymentStatus`（与订单状态分开）

| 值 | 意义 |
| --- | --- |
| `UNPAID` | 提交后的初始状态 |
| `PAID_AT_COUNTER` | 店员在 POS 收款后标记，**必须填写 POS 单号**（`posReceiptNo`） |
| `WAIVED` | 免单，须填原因，且只有管理层以上可操作 |

- 网站只能读取付款状态，永远不能修改。

### 状态变更必须原子化

- 每一次状态或付款状态变更（顾客取消、店员接单、逾时等），都在**同一个 Firestore 交易**内完成：
  1. 读取订单，确认当前状态等于预期的来源状态，且这个转换合法；
  2. 写入新状态；
  3. 新增对应的 `online_order_events` 记录。
- 来源状态不符（例如顾客取消与店员接单同时发生）时，后到的一方回 `409`，并重新读取订单，不会互相覆盖。

## 6. ERP 订单中心（店员端）

- **入口**：新增「网站订单」模块，延续现有模块的按需载入方式。依权限显示给楼面、柜台和管理层。
- **新单通知**：有新订单时，楼面设备与管理层显示提醒并播放声音，沿用现有 `notificationSound`。
- **厨房端**：接单后，在厨房屏显示「网站订单出单」，按品项列出。
  - 与现有「厨房急单」（`kitchen_alerts`，用于催菜、漏单、做错）**分开**，避免混淆。
- **店员操作**：接单、拒单（须选原因）、开始备餐、备餐完成、顾客取走、取消（须填原因）、标记已收款（须填 POS 单号）。
  - 每个操作都写入审计记录：谁、何时、从什么状态到什么状态、原因。
- **权限**：订单的建立只能由公开 API 的服务端执行；状态变更只能由已登录的员工身份执行。
  - 依赖紧急整改计划 CHG-05、CHG-06 完成后的身份与 Rules，详见第 8 节。

## 7. 营收与 StoreHub / POS

- 网站订单在柜台付款时，照常在 StoreHub / POS 结账，营业额由 POS 和日结记录。
- `online_orders` 的金额**不计入**任何营收、日结或损益报表，只用于：
  - 网站订单单数、取消率、平均备餐时间；
  - 对账：以 `posReceiptNo` 对照 POS 记录，找出「已取餐但未结账」的订单。
- **POS 单号一对一**：标记 `PAID_AT_COUNTER` 时，在同一个交易内建立 `online_order_pos_receipts/{receiptKey}`。
  - `receiptKey` 由门店、营业日、正规化后的 POS 单号组成（去空白、转大写），例如 `KLK1_2026-10-13_R00123`。
  - 文件已存在时拒绝（`409 POS_RECEIPT_ALREADY_USED`），一张 POS 单只能对应一张网站订单。
- 报表若需要「网站渠道营业额」，只能以去重后的 `online_order_pos_receipts` 为准，金额取自 POS 记录，不用订单快照。须标注「来自 POS」，不得与日结金额相加。

## 8. 数据模型（全部为新集合，不改动现有集合）

| 集合 | 用途 | 客户端（浏览器）权限 |
| --- | --- | --- |
| `online_orders/{orderId}` | 订单主档：品项快照、金额、状态、付款状态、顾客姓名与电话、`publicTokenHash`（只存哈希） | 只有员工可读；只有服务端可建立 |
| `online_order_events/{eventId}` | 审计记录（只增不改）：`orderId`、`from`、`to`、`actor`、`at`、`reason` | 员工可读；只能新增 |
| `online_order_idempotency/{key}` | 防重复提交：`orderId`、`requestHash`、`createdAt`，24 小时后失效 | 只有服务端可访问 |
| `online_order_pos_receipts/{receiptKey}` | POS 单号与网站订单一对一对应：`orderId`、`markedBy`、`markedAt` | 员工可读；只能经由标记收款的交易建立 |
| `online_order_counters/{businessDate}` | 当日订单流水号 | 只有服务端可访问 |
| `config/online_ordering` | 是否接单、费率、取餐前置时间、无人接单逾时、暂停供应的菜 | 管理层可写 |

- **个资保留**：订单完成 90 天后，把电话改为遮罩形式（例如 `+6012****789`）。这个提议需负责人确认，执行属于批量修改，须单独批准。
- ⚠️ **上线前置条件**：在 CHG-06（收紧 Rules）完成之前，Firestore 对匿名身份完全开放，顾客电话会被任何人读取。因此**真实顾客订单必须等 CHG-05、CHG-06 完成后才能开放**。
- 在此之前，订单写入功能**只在 Emulator（`demo-klk-erp`）测试**。
- 预览站 `dev.kimliankee.app` 连接正式数据库，**不得**用来建立测试订单，也不得存放测试顾客资料。
- 安全前置条件完成后，预览站只用于负责人的真实营运验收。

## 9. 待决事项

### 负责人决定

1. 服务费、服务税的费率，以及是否套用 5 仙进位（目前默认 0 / 0 / 是）。
2. 无人接单多少分钟后自动 `EXPIRED`。
3. 价格变动时的做法：照样建立订单（目前），或拒绝并要求顾客重新确认。
4. 优惠：v0.1 不支持。需要的优惠类型（例如满额折扣、指定菜品折扣），确认后在 v0.2 加入。
5. 电话号码的保留期限（建议 90 天后遮罩）。
6. 营业时间与是否允许预约取餐。

### 网站方确认

1. 本契约的栏位与错误码。
2. 网站的正式与预览网址（用于 CORS）。
3. 是否采用 Cloudflare Turnstile。
4. WhatsApp 客服与 Facebook 帖子展示由网站自行处理，**不经过**此 API。
