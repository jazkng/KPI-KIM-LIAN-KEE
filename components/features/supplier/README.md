# 🚚 Supplier Module — 供应商与采购管理模块

## 文件结构

```
supplier/
├── README.md                  ← 本文件
├── supplierConstants.ts       ← 共用常量、类型、样式
├── SupplierModule.tsx         ← 主组件（路由 + 状态 + 业务逻辑）
├── SupplierEditModal.tsx      ← 新增/编辑供应商弹窗
├── ProductEditModal.tsx       ← 新增/编辑商品弹窗
├── BillFormModal.tsx          ← 录入账单弹窗
├── ReceivePOModal.tsx         ← 入库对账弹窗
├── POCart.tsx                 ← 底部悬浮购物车
├── SupplierDeleteModals.tsx   ← 三个删除确认弹窗
├── BatchStockLinkModal.tsx    ← 批量关联库存品项（供应商产品 → 库存品项）
└── BatchSupplierCodeModal.tsx ← 批量填写供应商产品编号
```

## 各文件职责

### `supplierConstants.ts`
| 导出项 | 用途 |
|--------|------|
| `INVENTORY_CATEGORIES` | 从 inventoryConstants 转换的库存分类选项 |
| `ACCOUNTING_CATEGORIES_OPTIONS` | 会计科目分类（COGS/OPEX/CAPEX） |
| `CATEGORY_MAP` | 子分类 → 主分类映射（用于入库分组） |
| `SUP_INPUT_STYLE` / `SUP_LABEL_STYLE` | 供应商模块的表单样式 |
| `DEFAULT_UOMS` | 默认单位换算选项 |
| `SupplierReceivedItem` | 入库对账的物品类型 |

### `SupplierModule.tsx` — 主组件
- 状态管理、数据加载（含 5 分钟库存缓存）
- 供应商 CRUD、账单管理、商品管理
- 采购车 & PO 创建、入库收货（增量写入）
- PDF 导出、WhatsApp 发送

### `SupplierEditModal.tsx`
新增或编辑供应商信息：公司名、联系人、电话、分类、收藏、休息日等。

### `ProductEditModal.tsx`
新增或编辑供应商品：关联库存系统、多单位换算、价格设定。

### `BillFormModal.tsx`
手动录入账单：金额、日期、付款状态、备注。

### `ReceivePOModal.tsx`
采购入库对账：核对数量与价格，支持按重计费（肉类/海鲜）。

### `POCart.tsx`
底部悬浮购物车，支持展开/收起、数量调整、一键生成订单。

### `SupplierDeleteModals.tsx`
三个删除确认弹窗：删除商品、删除采购单、删除供应商。

### `BatchStockLinkModal.tsx`
批量设定「供应商产品 → 库存品项」的关联（`linkedStockId`）。
- 收货时系统靠这个关联才知道要把货加到哪一格库存。**没有关联的品项会被静默跳过**：收货单存了、账单也出了，唯独库存原地不动。
- 同一样东西向不同供应商购买没有问题：每个供应商的产品各自关联到同一个库存品项即可。

### `BatchSupplierCodeModal.tsx`
把没有填 `supplierCode`（画面显示 NO-CODE）的产品排成一张表，对着报价单一次填完。
- `supplierCode` 是**供应商自己的产品编号**，会印在采购单（PO）上给对方看。
- 系统**绝不自动生成**这个编号，编错了对方会送错货；只能从报价单或发票抄写。

## 数据流

```
SupplierModule (状态中心)
  │
  ├── SupplierEditModal ← supplierForm → onChange → setSupplierForm
  │                     → onSave → handleSaveSupplier
  │
  ├── ProductEditModal ← productForm, productUoms
  │                    → onSave → handleSaveProduct
  │
  ├── BillFormModal ← newBill → onChange → setNewBill
  │                 → onSave → handleSaveBill
  │
  ├── ReceivePOModal ← receivedItems
  │                  → onConfirm → confirmReceivePO (增量写入)
  │
  ├── POCart ← cart, selectedSupplier
  │          → onCreatePO → handleCreatePO
  │
  └── DeleteModals → onConfirm → executeDelete*
```

## 重构记录

| 日期 | 变更 |
|------|------|
| 2026-03-30 | P0: confirmReceivePO 全量写入 → 增量写入 |
| 2026-03-30 | P0: loadData 加 5 分钟库存缓存 |
| 2026-03-30 | P1: ID 前缀判断 → CATEGORY_MAP 反查 |
| 2026-03-30 | P1: 分类定义统一引用 inventoryConstants |
| 2026-03-30 | P2: filteredSuppliers 加 useMemo |
| 2026-03-30 | P2: handleCreatePO 用本地数据算 ID |
| 2026-03-30 | P2: 账单按日期排序 |
| 2026-03-30 | 从单文件 ~1460 行拆分为 9 个模块 |
