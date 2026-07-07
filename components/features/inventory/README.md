# 📦 Inventory Module — 库存管理模块

## 文件结构
```
inventory/
├── README.md                 ← 本文件
├── inventoryConstants.ts     ← 共用常量、类型、工具函数
├── InventoryModule.tsx       ← 主组件（路由 + 状态 + 业务逻辑）
├── StockEditModal.tsx        ← 库存物品编辑弹窗
├── DeleteConfirmModal.tsx    ← 删除确认弹窗
├── AssignModal.tsx           ← 盘点任务指派弹窗
├── TaskEditorModal.tsx       ← 常驻任务编辑弹窗
└── ExportModal.tsx           ← PDF 导出配置弹窗
```

---

## 各文件职责

### `inventoryConstants.ts`
所有子组件共享的基础设施，修改一处全局生效。

| 导出项 | 用途 |
|--------|------|
| `CATEGORY_SECTIONS` | 厨房/水吧/后勤/燃料的子分类定义（ID、标签、颜色） |
| `getCategoryLabel()` | 通过分类 ID 查找中文标签 |
| `getCategoryColor()` | 通过分类 ID 查找 Tailwind 颜色类 |
| `getToday()` / `getYesterday()` / `daysBetween()` | 日期工具函数 |
| `FREQ_OPTIONS` | 盘点频率选项（每天/每2天/每周...） |
| `INPUT_STYLE` / `LABEL_STYLE` | 统一的表单样式常量 |
| `TaskCompletion` | 盘点完成记录的类型定义 |

---

### `InventoryModule.tsx` — 主组件
模块入口，负责：
- **状态管理**：所有 useState / useMemo / useEffect
- **数据加载**：loadStock / loadTasks / loadCompletions / loadLogs
- **业务逻辑**：handleSubmitCheck（盘点提交）、confirmAssignment（指派）、executeDelete（删除）、executeExport（导出PDF）
- **路由切换**：盘点模式 / 管理模式 / 指派模式 / 历史记录 / 任务管理
- **子组件调度**：根据状态渲染各个 Modal

**Props：**
| Prop | 类型 | 说明 |
|------|------|------|
| `employee` | `Employee` | 当前登录员工 |
| `allowedModules` | `AppModule[]` | 权限模块列表 |
| `lockedMode` | `'CHECK' \| 'MASTER'` | 锁定模式（员工端只能盘点） |
| `initialMode` | `'CHECK' \| 'MASTER'` | 初始模式 |
| `lang` | `'zh' \| 'my'` | 语言 |

---

### `StockEditModal.tsx` — 库存编辑弹窗
编辑或新增库存物品，包含：
- 品名、ID、基础单位、分类选择
- 数量（Min / Current）、成本
- 基础换算设置（1 PKT = X KG）
- 多单位配置（1 箱 = 24 瓶）
- 供应商关联（只读显示）

---

### `DeleteConfirmModal.tsx` — 删除确认弹窗
纯 UI 组件，显示物品名称并提供确认/取消按钮。
删除逻辑（含任务清理）在主组件的 `executeDelete` 中。

---

### `AssignModal.tsx` — 盘点任务指派弹窗
管理者选择员工 + 盘点频率，将选中的物品指派为常驻盘点任务。
- 自动检测同频率任务并提示合并
- 频率选项：每天 / 每2天 / 每3天 / 每周 / 每2周 / 每月

---

### `TaskEditorModal.tsx` — 常驻任务编辑弹窗
编辑已有的常驻盘点任务：
- 修改盘点频率
- 增删任务中的物品（跨分类搜索全部库存）
- 清空物品时自动取消任务

---

### `ExportModal.tsx` — PDF 导出配置弹窗
配置导出选项后生成 PDF 报表：
- 选择导出区域（厨房/水吧/后勤/燃料）
- 是否显示成本与价值
- 是否仅导出缺货物品

---

## 数据流
```
InventoryModule (状态中心)
  │
  ├── MemoizedStockCard ← counts, checkedItems, mode
  │
  ├── StockEditModal ← editingItem → onChange → setEditingItem
  │                   → onSave → handleSaveMaster
  │
  ├── DeleteConfirmModal → onConfirm → executeDelete
  │
  ├── AssignModal ← staffList, assignFrequency
  │               → onConfirm → confirmAssignment
  │
  ├── TaskEditorModal ← editTaskItems, editTaskStockData
  │                   → onSave → saveTaskEdits
  │
  └── ExportModal ← exportConfig
                  → onExport → executeExport
```

## 重构记录

| 日期 | 变更 |
|------|------|
| 2026-03-30 | 从单文件 ~900 行拆分为 7 个模块 |
| 2026-03-30 | 修复 TaskCompletion 写入缺失 bug |
| 2026-03-30 | useCallback 优化让 React.memo 生效 |
| 2026-03-30 | 共用常量集中到 inventoryConstants.ts |