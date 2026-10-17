# 库存编号标准化 · 第一阶段：代码审计与方案（待负责人批准）

- 日期：2026-10-17
- 范围：只读审计 `develop-v2`（`01d5ab7`）的代码，并提出设计方案。**没有读取、修改或写入任何正式 Firestore 资料，也没有改动程序。**
- 依据：`CLAUDE.md`、`docs/KLK_ERP_V2_RULES.md`。数据模型变更须先有设计说明并经负责人批准，本文件就是这份说明。
- 重要限制：本次没有正式资料库的读取权限。下面所有「线上有什么」都只是推测，需要负责人在预览站用只读审计工具确认后才算数（见第 6、7 节）。

---

## 0. 结论摘要

1. **内部 ID 就是 Firestore 文件 ID**，全系统用它做关联键：供应商、采购单、盘点、日志、价格历史、食谱、翻译都靠它。**绝对不能改。** 双 ID 方案可行：内部 `id` 不变，新增显示用的 `stockCode`。
2. 目前的程序**只会**产生 `K_1729…` / `B_…` / `G_…` / `F_…` 这种「区域首字母 + 底线 + 毫秒时间」的 ID（`InventoryModule.tsx:1038`）。`K009`、`K010` 这类编号**不是**现在的程序产生的，推测来自 V1、旧版程序或手动建立，需要用只读审计工具确认。
3. 审计发现几个**现存的程序问题**，会直接影响改编号、改分类的安全性。建议先修（只修程序，不动资料），再做编号：
   - **高**：采购单明细的 `stockId` 有两种意思。从供应商页面下单时存的是供应商目录 ID（`cat_…`）；市场临时采购存的是库存 ID。
   - **高**：收货时「写到哪个库存集合」有三套不同的判断规则。其中一套靠 ID 前缀（`id.startsWith('K')`），判断错了会在另一个集合**新建一份同 ID 的复制品**。
   - **高**：Firestore 规则是「登入即可读写全部」。「只有管理员能改编号」目前只能在画面上限制，资料库层面挡不住。
   - **中（疑似）**：酒水（BAR）与燃料（FUEL）的盘点任务一开始执行，物品就可能被当成「已删除」，任务自动关闭（需要先在 Emulator 重现）。
   - **中**：两条采购收货流程都**不写**库存日志与价格历史。
   - **中**：库存主资料（名称、成本、单位）的修改与删除**没有任何审计记录**。
4. 编号唯一性无法单靠前端「读最大号加一」。建议用 **Firestore 交易 + 编号登记表（`stock_codes/{编号}`）+ 计数器（`stock_code_counters/{前缀}`）**：多人同时新增也不会重号，删除的编号永不重用。
5. 旧资料迁移：只新增 `stockCode` 等**新的可选字段**，不改 `id`、名称、数量、成本、分类。全程「备份 → 只读预览 → 负责人逐项确认 → 分批写入 → 校验 → 可回滚」，每一步都可以重新执行，结果不变。

---

## 1. 库存 ID 的全部关联位置（按风险排序）

图例：🔴 改 `id` 或搬集合会断；🟠 改名称会显示旧名或匹配失败；🟢 只是显示或搜寻。

### 1.1 储存方式

| 位置 | 说明 | 风险 |
|---|---|---|
| `utils/dataManager.ts:670-687` `getStock` | 四个集合 `stock_kitchen` / `stock_bar` / `stock_general` / `stock_fuel`。文件 ID = `item.id`；没有 `id` 字段时才用 `d.id` 补 | 🔴 |
| `dataManager.ts:688-724` `saveStockItem` | `transaction.set(doc(col, item.id), {...旧资料, ...新资料})`，没有就新建 | 🔴 写错集合会产生同 ID 复制品 |
| `dataManager.ts:733-770` `batchUpdateStock` | 同上；数量用资料库最新值加 `diff`，但成本与其他字段用前端快照覆盖 | 🔴 / 🟠 |
| `dataManager.ts:600-645` `getStockItemsByIds` | 依序在 4 个集合用文件 ID 查，取第一个找到的 | 🔴 |
| `dataManager.ts:725-732` `deleteStockItem` | 直接 `deleteDoc`，不会清理供应商的 `linkedStockId` 与价格历史 | 🟠 留下断链 |
| `StockItem`（`types.ts:932-973`） | 没有区域字段、没有 createdAt / updatedAt / createdBy | — |

### 1.2 用内部 ID 当关联键的模块

| 模块 | 字段与位置 | 改 ID 的后果 |
|---|---|---|
| 供应商目录 | `CatalogItem.linkedStockId`（`types.ts:1024`），存在 `suppliers/{id}.catalog[]`；设定处：`ProductEditModal.tsx:117-124`、`BatchStockLinkModal.tsx`、`SupplierModule.tsx:363-399, 401-497` | 🔴 收货找不到库存 |
| 采购单 | `PurchaseOrderItem.stockId`（`types.ts:1088`），`purchase_orders/{PO…}` | 🔴（另见 2.2 的歧义） |
| 采购收货 A | `SupplierModule.tsx:602-738`：目录 → `linkedStockId` → 库存；没有连结的品项**静默略过** | 🔴 |
| 采购收货 B | `ProcurementModule.tsx:1201-1420`：先找目录的 `linkedStockId`，找不到就把 `item.stockId` 直接当库存 ID | 🔴 |
| 盘点任务 | `InventoryTaskItem {stockId, stockName, category}`（`types.ts:996-1002`），`inventory_tasks` | 🔴 / 🟠 名称是快照 |
| 盘点完成记录 | `task_completions.items[].stockId`（`inventoryConstants.ts:76`）；`ProcurementModule.tsx:730` 用它建议补货 | 🔴 |
| 库存日志 | `InventoryLogItem {stockId, stockName}`（`types.ts:975-984`），`inventory_logs`；历史画面显示存下的名称 | 🟠 历史显示旧名（正确行为） |
| 价格历史 | `stock_price_history/{stockId}`（`types.ts:150-172`；`dataManager.ts:853-886`） | 🔴 文件 ID 就是库存 ID |
| 价格监控 | `PriceMonitorModule.tsx:541-568, 645` | 🔴 |
| 食谱 | `MenuIngredient {stockId, stockName}`（`types.ts:1147-1168`），存在 `menu`；成本用 ID 即时查，显示用快照名称 | 🔴 / 🟠 |
| 食谱 Excel 导入 | `MenuManagement.tsx:446-455, 1046-1071`：**已认得 `stockCode` 字段**，找不到编号才用名称 | 🟢 对新编号友好 |
| 翻译 | `translations/{lang}.items[stockId]`（`InventoryModule.tsx:408-414`） | 🔴 |
| 驾驶舱 / 报表 | `loadFoodAnalytics.ts:45-46`、`foodAnalytics.ts:113-114`（ID → 名称对照）、`FinancialReport.tsx:1162-1178`、`BossDashboard.tsx:115-118` 等 | 🟢 只读 |
| 管理后台跳转 | `AdminDashboard.tsx:256-257`：把 ID 当搜寻字 | 🟢 |
| 浏览器快取 | sessionStorage `stock_item_${stockId}`、`stock_stock_kitchen` 等，5 分钟 | 🟢 |
| 服务端 / AI 扫描 | `server.ts`、`server/`、`ap-ai-service/` 都**没有**库存 ID | — |

### 1.3 用「名称」比对库存的地方

| 位置 | 用途 | 改名后果 |
|---|---|---|
| `MenuManagement.tsx:1046-1071` | 食谱 Excel 导入：编号找不到时才按名称 | 🟠 只有旧名、没有编号的 Excel 行会被略过并提示 |
| `BatchStockLinkModal.tsx:39-109` | 供应商品项连结库存的**建议**（相似度 ≥ 0.45），必须人工确认 | 🟢 已存的连结不受影响 |
| `ProductEditModal.tsx:117` | 搜寻库存；选取时**复制库存名称到供应商品项** | 🟢 |
| `dataManager.ts:647-668` `searchStockByName` | 唯一的呼叫是 `PriceMonitorModule.tsx:282`，传空字串 | 🟢 |
| `dataManager.ts:1091-1094` 供应商合并 | 目录去重会用「名称大写相同」 | 🟠 同名不同物会被合并掉一个 |
| `InventoryModule.tsx:104, 408-414` | 卡片用括号拆中英文；马来文翻译以 ID 为键 | 🟠 改名后翻译不会自动更新 |
| 搜寻框 | 库存（名称或 ID）、盘点任务（只按名称）、采购（名称或 ID）、价格监控、食谱选料、供应商 | 🟢 |

**结论：没有任何「写入资料」的流程依赖库存名称做关联**（食谱导入的名称只是后备）。所以改名称的风险在显示层：快照名称、翻译、搜寻习惯。

### 1.4 依赖 ID 前缀判断分类的地方（问题 10）

| 位置 | 逻辑 |
|---|---|
| `ProcurementModule.tsx:594, 599, 601` | 采购画面的区域筛选：`id.startsWith('K')`、`'B'`；一般区要 `id.startsWith('S') || 'G'`，而且分类不是 PACKAGING |
| `ProcurementModule.tsx:802, 805, 807` | 智能补货，同样的前缀逻辑 |
| `ProcurementModule.tsx:1339-1340` | **收货时决定写哪个集合**：`id.startsWith('K')` → KITCHEN，`'B'` → BAR |
| `MenuManagement.tsx:3003` | 食谱只列厨房库存：`… || s.id.startsWith('K')` |

供应商模块已改用 `CATEGORY_MAP`（`supplierConstants.ts:60-66`），README 也有记录。所以**显示编号绝对不能放进 `id`**，也不能让新的 `stockCode` 被这些前缀判断读到。

---

## 2. 编号产生机制与历史兼容风险

### 2.1 目前怎样产生 ID

- 唯一的建立点：`InventoryModule.tsx:1038`，`id: editingItem.id || \`${currentStockView.charAt(0)}_${Date.now()}\``。
- 写入的集合 = 当时浏览的区域分页（`:1072`），**不是**依商品分类。
- 供应商、导入、AI 扫描**都不会**建立库存。备份还原沿用原 ID。
- `constants/inventory.ts` 的预设清单（`KF01…`、`BT01…`、`SP01…`）**没有被任何程序引用**，也不会在打开页面时写入。它不能代表线上实际库存。
- 没有「把商品搬到另一个区域」的功能。分类下拉只列当前区域的子分类（`StockEditModal.tsx:393-400`）。

### 2.2 采购单 `stockId` 的歧义（问题 6）

| 建立来源 | `stockId` 存的是 |
|---|---|
| 供应商页面「加入购物车」`SupplierModule.tsx:534` | 供应商目录 ID `cat_…` |
| 采购模块，有对应供应商 `ProcurementModule.tsx:939` | 供应商目录 ID |
| 采购模块，市场临时采购 `ProcurementModule.tsx:976` | **库存 ID** |

- 收货 B（`ProcurementModule.tsx:1262-1274`）在找不到目录品项时，把 `cat_…` 当库存 ID 再找一次。如果目录品项被删除、取消连结，或在供应商合并时被去重掉，就会落入这个后备。
- 收货 A 则直接略过，没有任何提示。
- **建议**：新 PO 明细增加可选字段 `catalogItemId` 与 `inventoryStockId`。旧 PO 只读兼容，不改写历史。

### 2.3 写错集合的「复制品」风险（问题 8、9）

同一个商品「属于哪个集合」有三套规则：
- 供应商收货：`CATEGORY_MAP[category] || 'KITCHEN'`。
- 采购收货：ID 前缀 + 分类清单，预设 GENERAL。
- 盘点：`CATEGORY_SECTIONS` 反查，预设当前分页。

因为 `set()` 在文件不存在时会新建，判断不一致时就会在别的集合**新建同 ID 的第二份**。读取时：
- `SupplierModule.tsx:157` 以 ID 去重，后面的覆盖前面的。
- `ProcurementModule.tsx:485` 等处直接合并，会显示两次。
- `getStockItemsByIds` 取第一个找到的。

这种复制品目前无法从代码判断是否已经存在，只读审计工具必须检查。

### 2.4 盘点任务疑似问题（问题 7）

- 指派任务时，`category` 存的是区域名（`'BAR'`、`'FUEL'`）（`InventoryModule.tsx:1103-1105`）。
- 开始执行时，却拿它去子分类清单比对（`:1246-1252`）。比对不到就当成 KITCHEN，只读厨房库存，于是酒水和燃料的品项被当成「已删除」过滤掉。全部过滤掉时，任务会自动标记完成（`:1265-1271`）。
- 一般区不受影响，因为子分类里刚好也有 `'GENERAL'`。
- 修改任务后再保存（`:1213-1218`）会把区域重新算一次，但同样会落到 KITCHEN。
- 需要先在 Emulator 重现确认，修复属于独立 PR。

### 2.5 其他兼容事项

- **V1 兼容**：V1 与 V2 共用资料库。`saveStockItem` / `batchUpdateStock` 是「旧资料 + 新资料」合并写入。V1 读到含 `stockCode` 的文件再存回，字段会保留。但 V1 新建的商品不会有 `stockCode`，需要「缺编号」侦测与补发（见 3.4）。
- **备份还原**：`dataManager.ts:2405-2460` 的还原功能会先**清空**员工、日结、库存、供应商、采购单等多个集合，再写回。这是破坏性操作，**本方案的回滚绝不使用它**。
- 删除库存不会清理供应商连结与价格历史，会留下指向不存在商品的连结。迁移工具要把它们列出来。

---

## 3. 双 ID 方案（建议）

### 3.1 资料结构（只新增可选字段与新集合）

`StockItem` 新增可选字段：

```ts
stockCode?: string;              // 显示编号，例如 'K0012'
stockCodeAssignedAt?: string;    // ISO 时间
stockCodeAssignedBy?: string;    // 员工 ID
stockCodeSource?: 'AUTO_NEW' | 'MIGRATION' | 'ADMIN_EDIT';
legacyCodes?: string[];          // 以前用过的显示编号，例如 ['K009']，供搜寻与追溯
nameHistory?: { name: string; changedAt: string; changedBy: string }[];  // 第三阶段才用
```

新增两个集合：
- `stock_codes/{stockCode}`：编号登记表，一个编号一份文件。字段：`{ code, prefix, stockId, area, status: 'ACTIVE' | 'RETIRED', assignedAt, assignedBy, source, runId? }`。文件 ID 本身就是编号，所以 Firestore 保证不会重复。
- `stock_code_counters/{K|B|G|F}`：`{ next: number, updatedAt }`。

`stockCode` 只用于显示与搜寻，所有关联仍然用 `id`。

### 3.2 新商品自动编号（并发安全）

在同一个 Firestore 交易里完成：

1. 读 `stock_code_counters/K`，得到 `next`，例如 13。
2. 读 `stock_codes/K0013`。如果已存在（例如迁移时保留了这个号），把 `next` 加一再试。只读不写，最多试 20 次。
3. 写入 `stock_codes/K0013`（status ACTIVE）。
4. 更新计数器 `next = 14`。
5. 以字段更新的方式写 `stock_kitchen/{id}.stockCode = 'K0013'`。新商品就和商品本身一起建立。

Firestore 交易会对读过的文件做冲突检查。两个人同时新增时，其中一个交易会自动重试，拿到下一个号，所以不会重号。

- 删除商品：登记表改成 `RETIRED`，**编号不重用**，因为计数器只增不减。
- 4 位数：`K0001` 到 `K9999`，用完自动变成 5 位，不会报错。
- 前缀由「建立时的区域」决定：KITCHEN=K，BAR=B，GENERAL=G，FUEL=F。
- **改分类、改区域：编号保留**。画面上可以提示「编号前缀 K 与目前区域 BAR 不同」，但不会自动改。

**权限**：「只有管理员能改编号」目前只能在画面上执行，因为 Firestore 规则还是「登入即可读写」。两个可选做法：

- **（建议，分步）**
  - 第一步：前端交易，加上画面权限检查，再写审计日志 `stock_code_audit`。
  - 第二步：等 CHG-05/06 的角色凭证（custom claims）上线后，改 `firestore.rules`，限制 `stock_codes` 只能新建、不能删除、只有管理员能修改。改正式规则需要负责人另外批准。
- **（替代）** 服务端接口 `/api/inventory/allocate-code`：用 firebase-admin 交易，并验证员工的角色凭证。`server/firebaseAdmin.ts` 与 CHG-05 的 `verifyIdToken` 已经有了，但 CHG-05 服务端登录目前预设关闭，所以要等登录功能开放才有用。

### 3.3 为什么不改用其他身份模型

- **把编号直接当文件 ID**：要重建文件并改写所有关联，不可行。
- **只靠 `id` 的前缀显示**：旧 ID 格式混乱，而且前缀判断本来就是问题来源。
- **结论**：保留 `id` 当唯一身份，`stockCode` 当可变的显示编号，是改动最少、最安全的做法。

### 3.4 旧商品标准化（迁移流程）

工具放在「库存 → 管理员 → 编号标准化」，只有负责人或系统管理员看得到：

1. 只读载入 4 个集合的全部商品，以及供应商、PO、盘点任务、价格历史、食谱、翻译的关联数量。
2. 侦测：
   - 同一 ID 出现在两个集合（复制品）
   - 同名商品（完全相同，以及去掉空白括号后相同）
   - 缺少名称、单位或分类
   - 分类与所在集合不符
   - 供应商连结指向不存在的商品
   - PO 明细的 ID 找不到
3. 每个商品给出建议编号，规则：
   - 已有 `stockCode` 且符合规范、没有冲突的：保留。迁移可以重复执行，结果不变。
   - 旧显示编号符合「区域前缀 + 数字」（例如 `K009`）、数字没有冲突的：**保留数字、补成 4 位**（`K0009`），旧编号放进 `legacyCodes`。
   - 随机 ID（`K_1769…`）与其他旧格式：从该区域「保留号码的最大值 + 1」开始，按**名称排序**（可改成按建立时间或现在的顺序）依次分配。
4. 产生对照表：内部 ID、所在集合、名称、旧显示编号、建议新编号、冲突与警告、关联数量。可以下载 Excel，留在负责人的装置上。
5. 负责人在画面上逐项调整，或整批接受。
6. 按「确认写入」后才开始写（见第 6 节）。

---

## 4. 新旧编号转换示例（虚构资料，只示范规则）

| 内部 ID（不变） | 所在集合 | 名称 | 旧显示 | 建议 stockCode | 说明 |
|---|---|---|---|---|---|
| `K009` | stock_kitchen | 肉片 (Pork Slices) | K009 | **K0009** | 前缀 + 数字，保留数字补 4 位；`legacyCodes: ['K009']` |
| `K010` | stock_kitchen | 猪油渣 (Pork Lard) | K010 | **K0010** | 同上 |
| `K011` | stock_kitchen | 花肉 (Pork Belly) | K011 | **K0011** | 同上 |
| `K_1769757217745` | stock_kitchen | 招牌大面 | — | **K0012** | 随机 ID，接在保留号码之后 |
| `K_177817032518` | stock_kitchen | 黄面 (Yellow Noodle) | — | **K0013** | 同上 |
| `B_1771000000000` | stock_bar | Tiger Beer (虎牌啤酒) | — | **B0001** | 品牌优先的命名例外 |
| `KF09` | stock_bar | 可口可乐 (Coca-Cola) | — | **B0002** ⚠️ | 旧 ID 前缀是 K 但在酒水区：编号依**所在集合**给 B；标记「前缀不一致」，`id` 不改 |
| `K_1772…`（两份） | stock_kitchen 与 stock_general | 白糖 | — | ❗暂不分配 | 同一 ID 在两个集合：要负责人先决定保留哪一份，工具**不自动合并或删除** |

---

## 5. 需要修改的文件清单（第二阶段以后，批准后才做）

| 文件 | 修改 |
|---|---|
| `types.ts` | `StockItem` 新增可选字段；新增 `StockCodeRecord`、`StockCodeCounter`、`StockCodeMigrationRun`；`PurchaseOrderItem` 新增可选字段 `catalogItemId`、`inventoryStockId` |
| `utils/inventory/stockCode.ts`（新） | 编号格式、解析、建议规则、冲突侦测（纯函数，可单元测试） |
| `utils/inventory/stockArea.ts`（新） | **统一的「商品在哪个集合」判断**，取代三套规则与 ID 前缀判断 |
| `utils/dataManager.ts` | `allocateStockCode`（交易）、`saveStockItem` 新建时同交易配号、编号审计日志、只读审计载入 |
| `components/features/inventory/InventoryModule.tsx` | 卡片显示 `stockCode`，不再对一般员工显示 `#id`；搜寻加入编号、旧编号、英文名；新建时配号 |
| `components/features/inventory/StockEditModal.tsx` | 管理员详情区：内部 ID、编号、旧编号、真实存在的修改记录 |
| `components/features/inventory/StockCodeMigration.tsx`（新） | 只读审计、预览、逐项调整、写入、校验、回滚 |
| `components/features/ProcurementModule.tsx` | 区域筛选与收货改用 `stockArea.ts`，不再依赖 ID 前缀 |
| `components/features/supplier/SupplierModule.tsx` | 收货改用 `stockArea.ts`；未连结的品项要提示，不再静默略过 |
| `components/features/MenuManagement.tsx:3003` | 厨房库存筛选不再用 ID 前缀 |
| `components/features/inventory/InventoryModule.tsx:1246-1252` | 盘点任务的区域判断改用 `getInventoryScopeForCategory`（修 2.4） |
| `firestore.rules` | **不在本计划内修改**。等角色凭证上线后另案申请 |
| `tests/unit/*`、`tests/rules/*` | 见第 9 节 |

---

## 6. 迁移前备份与回滚

**前提：** 工具在预览站执行，由负责人亲自操作。正式资料库只有一个，写入前必须经负责人逐步确认。自动化测试只用 Emulator。

1. **完整备份（只读）**
   - 范围：4 个库存集合、`suppliers`、`purchase_orders`、`inventory_tasks`、`task_completions`、`inventory_logs`、`stock_price_history`、`menu`、`translations`。
   - 导出成 JSON 档，附每个集合的文件数与 SHA-256，下载到负责人的装置，不上传 GitHub。
   - 下载后由工具重新读档，比对文件数，确认备份可以用，才开放下一步。
2. **只读预览（Dry Run）**：产生第 3.4 节的对照表与问题清单，不写任何资料。
3. **写入范围最小化**
   - 每个商品只用字段更新（`update`）写入 `stockCode`、`stockCodeAssignedAt`、`stockCodeAssignedBy`、`stockCodeSource`、`legacyCodes`，**绝不使用整份覆盖的 `set`**。
   - 另外新建 `stock_codes/{code}` 登记文件。
   - 不碰 `id`、名称、数量、成本、单位、分类，也不碰供应商、PO、任务、日志。
4. **分批交易**
   - 每批不超过 200 个商品；每个商品一个小交易，或每批一个批次写入，Firestore 上限 500 个操作。
   - 写入前再检查一次：该商品还没有编号，或已有编号与计划相同，才写；否则跳过并记录。
5. **执行记录**
   - `stock_code_migration_runs/{runId}`：`{ startedAt, by, planHash, total, done, skipped, failed, status }`。
   - 每个商品的结果记在子集合 `items/{stockId}`。
6. **可以重新执行，结果不变**：已经有正确编号的商品会跳过，计数器只往前推，不会重新分配。
7. **中途失败**：用同一个 runId 重新执行，只处理未完成的商品。
8. **写入后校验**
   - 每个集合的文件数、`currentQtyBase` 总和、`costPerBaseUnit × 数量` 总和都与备份相同。
   - 所有 `linkedStockId` 仍然找得到对应商品。
   - PO、任务、日志的文件数与内容的 SHA-256 不变。
   - 编号没有重复，每个商品都有编号。
9. **回滚**
   - 只删除这次 runId 写入的字段，以及这次新建的登记文件；计数器还原到执行前的值。
   - 不使用 app 现有的「清空再还原」功能。

---

## 7. 分阶段开发计划（每一步都是独立 PR，经负责人批准）

| 步骤 | 内容 | 会不会写正式资料 |
|---|---|---|
| **0（建议先做）** | 修现存问题：统一区域判断（`stockArea.ts`）、移除 ID 前缀判断、修盘点任务的区域判断、未连结的收货品项要提示 | 只改程序，不动资料 |
| 1 | 型别 + 编号规则纯函数 + 单元测试；卡片与搜寻支持 `stockCode`（没有编号时显示「未编号」） | 否 |
| 2 | 只读审计工具：复制品、同名、断链、前缀不一致、PO 歧义报告 | 否（只读） |
| 3 | 新商品自动配号（交易 + 登记表 + 计数器 + 审计日志），在 Emulator 测试并发 | 只有新建商品时写 |
| 4 | 迁移工具：备份、预览、逐项调整、写入、校验、回滚，先在 Emulator 用虚构资料演练 | 负责人按确认后才写 |
| 5 | 命名规范：只产生建议与预览；改名一律逐项确认，并保留 `nameHistory` | 逐项确认 |
| 6 | StoreHub SKU 对照表（见第 8 节）：只建结构与对照画面，不扣库存 | 只写对照表 |
| 7 | 规则加强：`stock_codes` 只能新建、只有管理员可改。等角色凭证上线，另案批准 | 改规则须另批 |

---

## 8. 啤酒、罐装饮料与 StoreHub 的兼容建议

- **现状**：`storehubSales/{月份}.skuRows`（`utils/storehubImport.ts:21-39`）只有 SKU 对销售分类的对照（`config/sales_rules`）。**没有** SKU 对库存或 SKU 对食谱的对照，也没有用销量扣库存的功能。
- **建议新集合** `storehub_sku_map/{sku}`：

  ```ts
  { sku, storehubName, stockId /* 内部 ID，不用 stockCode */, saleUnit,
    baseQtyPerSale /* 每卖出一份扣多少基础单位 */, active, effectiveFrom, note, updatedAt, updatedBy }
  ```

  - 一个 SKU 对多个库存（套餐）时，改用 `components: [{ stockId, baseQtyPerSale }]`。
  - 例：单瓶啤酒 1 BTL；三瓶套餐 3 BTL；一罐汽水 1 CAN。**S01、S01A 等实际包装数量要负责人逐项填写，不预设。**
- **StoreHub SKU 与 `stockCode` 分开**：两者是不同系统的编号，对照表负责连接，不会强制统一。
- **先只做核对**：每月「应耗用 = 销量 × 每份扣量」与盘点差额并列，列出差异，不自动扣库存。
- **前提条件**：
  - 酒水盘点任务的问题（2.4）要先修好。
  - 采购收货要写库存日志，否则进货与耗用对不上。
  - 啤酒与饮料的基础单位要统一成 BTL / CAN。

---

## 9. 测试计划（第二阶段以后）

**单元测试（Vitest，虚构资料）**
- 编号格式与解析
- 建议规则：保留旧号、补 4 位、冲突与重复侦测
- 前缀不一致的提示
- 区域判断统一后，旧资料（`KF01`、`K_…`、`S…`）的结果
- 采购单的两种 `stockId` 都能正确对应到库存

**Emulator 测试（`demo-klk-erp`）**
- 两个以上客户端同时新增商品，编号不重复
- 删除后编号不重用
- 改名、改分类时编号保留
- 建立 PO、确认收货：数量、加权平均成本、换算比例不变
- 盘点提交
- 供应商 `linkedStockId` 关联不变
- 历史日志与价格历史查询
- StoreHub 月报导入不受影响
- 迁移：重复执行结果不变、中途失败后重跑、校验、回滚后与备份完全一致

**规则测试**：目前规则不变，保持现有测试通过。加强规则时另加测试。

> 静态检查与测试通过，不等于线上资料完整。正式写入前后的校验报告（第 6 节第 8 点）才是线上资料完整的依据。

---

## 10. 负责人的决定（2026-10-17）与执行状态

| # | 事项 | 决定 |
|---|---|---|
| 1 | 先修现存问题 | 是。第 0 步已完成（#44） |
| 2 | 编号格式 | 4 位，例如 `K0001` |
| 3 | 旧的 `K009` 类编号 | **全部重新连号**。旧编号存进隐藏的 `legacyCodes`，搜寻仍找得到 |
| 4 | 排序依据 | 同一区域内先按子分类（库存画面上的顺序），再按中文名称 |
| 5 | 杂项区前缀 | **G**。S 开头的旧编号随全部重新连号改成 G |
| 6 | 谁可以改编号 | **只有负责人（L1）与系统管理员**。经理不可以。之后新增的商品自动配下一个号码 |
| 7 | 命名 | 一律「中文 (English)」，**没有品牌例外**。工具只给建议，由负责人逐项勾选确认 |
| 8 | 内部 ID | 保留不改，只是不再给员工看（只有负责人 / 系统管理员在编辑窗看得到） |

**执行状态**

| 步骤 | PR | 状态 |
|---|---|---|
| 0 修现存问题（统一区域判断、盘点任务区域、未连结收货提示） | #44 | 已合并 |
| 1 编号字段、显示与搜寻 | #45 | 已合并 |
| 2–5 编号整理工具（备份 / 预览 / 命名建议 / 写入 / 校验 / 回滚）、新商品自动配号、补配号 | #46 | 已合并，**待负责人在预览站执行** |
| — 数据审查中心（集中审查与整理工具） | #47 | 已合并 |
| 2 只读库存资料审计工具（断链、复制品、分类错放等） | 进行中 | — |
| 6 StoreHub SKU 对照 | — | 未开始 |
| 7 Rules 加强（`stock_codes` 只能新建、只有管理员可改） | — | 须另案批准 |

与原方案的差别：第 3 步（自动配号）只在「全部重新连号」执行后才启用（还没有计数器时不配号），避免新商品抢走 `K0001` 打乱整批连号的顺序。
