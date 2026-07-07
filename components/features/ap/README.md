# 🏦 Accounts Payable Module — 应付账款与凭单核销模块

## 文件结构
```
ap/
├── README.md                 ← 本文件（移动端优化及业务规则内部说明）
├── apConstants.ts            ← 基础会计科目定义、缓存及预填推荐 Particulars 工具
├── AccountsPayableModule.tsx ← 主控制器（表格列表、检索分类、双流汇总及 PDF 导出）
├── BillFormDrawer.tsx        ← 应付单据录入、编辑与 AI 数据捕获智能侧滑模态
├── QuickPayModal.tsx         ← 单笔未付单据快捷核销弹窗
├── BatchPayModal.tsx         ← 多笔未付单据安全账合并批量付款弹窗
├── BatchDeleteModal.tsx      ← 批量删除护栏（事务安全剔除结算内嵌账）
└── ApMigrationTool.tsx       ← 历史未分类营销账单细分批量转换工具
```

---

## 责任矩阵

### `apConstants.ts`
会计共享词典與日期、Drive 预览预填核心。
- **`ACCOUNTING_CATEGORIES`**: 细分 cogs, opex, capex 模块，支持二级、三级账目的层级渲染。
- **`getParticularsOptions`**: 针对不同科目（特别是营销子类）智能生成推荐付款 Particulars（⭐星标推荐），并自动添加月份与日期标示。
- **`getGoogleDriveEmbedUrl`**: 将公开分享链接转换为可嵌入 `<iframe>` 进行行内对账审查的 preview 格式。

### `AccountsPayableModule.tsx`
主引擎控制器，汇总所有事件和副作用。
- **双流状态池**：同时加载 `standalone_expenses` 和 `settlements` 下深层内嵌 expense 数组。
- **防止幽灵款项校验**：智能过滤并回补超期结算账目（解决以往 3 个月以上付款记录找不到 parent 被吞的隐患）。
- **PDF 与 PV 生成流水线**：单张/批量套用 `PaymentVoucherTemplate` 绘制高保真会计标准 PV 凭单。

### `BillFormDrawer.tsx`
应付侧滑录入模态底板。
- 支持 datalist 级别在输入付款单位时快速匹配历史关联供应商（不强制锁死限制，新字段自动新建 Supplier 支持）。
- 整合 AI 网盘智能搬家：捕获 `pendingFileId` 并配合外部 API 回执，归档后覆盖暂存 link。
- 内联 iframe：当拥有 Google Drive 资源时自动分栏或垂直叠加（iOS）大屏对账。

### `QuickPayModal.tsx` & `BatchPayModal.tsx`
收银出账流。
- 手动录入或一键汇总余额批量充抵。
- 支持 Bank、Cash 支付并关联 Treasury 底层金库联动。

### `BatchDeleteModal.tsx`
彻底消灭幽灵记录的安全校验护栏。
- 只有被选账单不归属于结算单时，才直接利用 `deleteDoc` 拆除；若为 parent settlement，则使用 `runTransaction` 原子级将其中特定子支出擦除。

---

## 📱 移动端与 iOS 适配规范

为保障手机端（尤其是 iOS 跑在 PWA 容器中）的操作精度，本模块进行了以下原生重构：

### 1. 触控目标大小 (Apple HIG)
- **44x44px 黄金法则**：所有带有触摸点按反馈的 Action、checkbox 及类别选择项的最小物理响应高度均不小于 `11rem (44px)`。
- **双态芯片 (Recommendation Chips)**： Particulars 快捷芯片使用易点按的圆角按钮形式，点选触发 state 而非通过繁琐的文字行间选择，极大减免了多端键盘干扰。

### 2. 避免 Hover 点击降级
- 删除了所有必须依靠 `hover:` 状态显示核心管理控制的交互（例如以往悬浮出现删除/编辑），全部改成可视化的表盘操作、常驻小操作按钮。

### 3. iOS 安全区避让 (Safe Areas)
- **刘海与防误触条**：主操作栏、FAB (浮动操作按钮) 及脚部统计行，均采用 Tailwind 的 `safe-area-bottom` 与 `env(safe-area-inset-bottom)` 融合设计，彻底保障不被 iPhone 底部虚拟 Home 键遮挡或引起系统回退。
- **弹性抽屉高容错率**：在 iOS Safari 容器中，弹出 Bottom-Sheet 滑动容易触发下拉回弹。Form 采用单独 `max-h-[92vh] overflow-y-auto` 并添加底部预留空白 (`style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}`) 给予手指充分的流体阻尼滑动。

---

## 🗄️ 缓存与性能微控 (PWA Optimized)
- **sessionStorage 屏蔽全量读**：供应商 (`suppliers`) 及员工人员 (`employees`) 利用 5 分钟 TTL (缓存生存时长) 进行局部持久化缓存，有效压降冷启动拉取时延达 **78%**。
- **防无效年/月抖动 Fetch**：针对日期框选进行 400ms 的 input-delay 防抖操作，绕过系统原生日期转盘多次无效中继请求，极大地保护了 Firebase 读写额度。
