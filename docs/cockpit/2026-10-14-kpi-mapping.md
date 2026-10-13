# 老板经营驾驶舱 · 指标映射表（审计结果）

- 日期：2026-10-14
- 范围：
  - 老板首页：`BossPriorityDashboard.tsx`、`BossDashboard.tsx`
  - 日报：`DailyBusinessReportModal.tsx`
  - 财务：`FinancialReport.tsx`、`utils/monthlyPnLAggregator.ts`、`utils/classicPnLBuilder.ts`
  - 薪资与人工：`HRPayroll.tsx`、`utils/labour/*`
  - 采购与库存：`ProcurementModule.tsx`、`InventoryModule.tsx`
  - AI：`AIOperationsAssistant.tsx`、`server.ts`
- 方法：逐一阅读程序码。本文所有行号以审计时的 `develop-v2` 及 PR #14 分支为准。

## 1. 现有口径摘要

| 概念 | 现有程序的定义 | 位置 |
|---|---|---|
| **日结「营业总收入」`sales.total`** | POS（现金、TNG、DuitNow、卡）+ 各平台（净额 − 广告）+ Lalamove。退款有存，但没有扣 | `SettlementModule.tsx:1084-1112, 1250-1283` |
| **财务报表营业额（P&L）** | POS − 退款 + 平台总额（Gross）+ Lalamove；平台抽佣与广告另计为成本 | `FinancialReport.tsx:532-573`、`monthlyPnLAggregator.ts` |
| **食材成本** | 支出分类为 COGS 的**采购金额**（业务发生制看账单日，现金制看付款日）。不是实际耗用 | `categorizeExpense` |
| **人工（财务报表）** | 已发薪：净发 + `totalGovtPay`；未发薪：推算。找不到资料时用 **RM 57,300** 后备值 | `FinancialReport.tsx:687-784` |
| **人工（PR #14 / 驾驶舱）** | 雇主总成本 = 应发薪资 + 雇主 EPF / SOCSO / EIS；未发薪按人事底薪与 `statutory.ts` 推算 | `utils/labour/labourCost.ts` |
| **保本** | 固定成本 ÷（1 − 变动成本率）；固定 = 人工 + OPEX，变动 = COGS + 平台 | `utils/financialMetrics.ts:137` |
| **月结** | 没有影响损益的锁账：`treasury_monthly_closings` 只供显示；日结的 `isClosed` 永远为 true；薪资有 `POSTED` / `DRAFT` 两种状态 | `useTreasuryData.ts:780-905` |

## 2. KPI 映射

各 KPI 的数据来源与现有算法：

| KPI | 现有数据来源 | 现有算法 |
|---|---|---|
| **实际利润** | 财务报表 `analytics`；日报「经营净利润」 | 报表：净实收 − COGS − 人工（同步）− OPEX。日报：营业额 − COGS（缺资料时用 **35%**）− 钱箱支出 − 广告 |
| **本月累计营业额** | 老板首页：`getSettlements()` **最近 30 笔** | Σ `sales.total` |
| **预计月底利润** | 老板首页只预测营业额：月累计 ÷ 天数 × **30** | 没有利润预测 |
| **毛利率／净利率** | 财务报表 | 毛利 ÷ 净实收 |
| **人工总成本** | 财务报表 / PR #14 | 见上表 |
| **人工成本率** | 财务报表 / PR #14 | 人工 ÷ 营业额 |
| **食材采购成本** | `standalone_expenses`、`settlements.expenses`、`bill_payments` | COGS 分类加总 |
| **食材耗用成本** | 不存在 | — |
| **每日／每月保本** | 财务报表健康度、PR #14 | 见上表 |
| **与保本差额** | 不存在（只有 RM 150,000 目标进度） | — |
| **营业额走势** | 老板首页近 7 天、日报图表 | `sales.total`；日报图表利润固定用 35% |
| **预警** | 老板首页「需要留意」、`BossDashboard` 角标 | 各自计算 |
| **AI 简报** | `AIOperationsAssistant` | 模型自行生成数字 |

各 KPI 的资料状态、已发现的风险，以及驾驶舱的做法：

| KPI | 资料状态 | 已发现的重复计算或口径风险 | V2 做法 |
|---|---|---|---|
| **实际利润** | 报表：业务发生制下按月为实际数字。日报：**估算** | 日报：<br>1. 广告扣了两次；<br>2. 35% 的 COGS 再加上钱箱食材支出；<br>3. 没有扣人工和租金 | **PR A**：以 `aggregateRange` 加雇主人工成本计算。标示「已确认」需同时满足：期间结束、日结齐全、薪资已发、有经营费用；否则显示为「截至目前利润（未确认）」 |
| **本月累计营业额** | 实际，但**可能不完整**：31 天的月份会漏掉 1 日 | 首页用 `sales.total`，与财务报表口径不同 | **PR A**：按日期范围读取整月日结，与财务报表同口径。`sales.total` 只在明细中列出供对照 |
| **预计月底利润** | 估算 | 固定 ×30 天 | **PR A**：月日均 × 当月实际天数 × (1 − 实际变动成本率) − 固定成本，一律标为「预估」 |
| **毛利率／净利率** | 实际 | 财务报表以「净实收」为分母 | **PR A**：以营业额（Gross）为分母，平台抽佣列为成本。依据中有说明 |
| **人工总成本** | 已发薪为实际，未发薪为估算 | 1. RM 57,300 后备值；<br>2. 跨多月的期间重复计算；<br>3. 预支、兼职不在财务报表概览中；<br>4. 未发薪的法定供款未按业务发生制计入 | **PR A**：<br>• 雇主总成本按天数分摊<br>• 损益中薪资类支出排除，不重复扣除<br>• 兼职工资 `parttime_*` 取回计入<br>• 员工餐、宿舍另计<br>• 不使用后备值 |
| **人工成本率** | 同上 | 同上 | **PR A** |
| **食材采购成本** | 实际（采购口径） | 1. 收货建立的 `exp_` 与 AP 发票可能重复；<br>2. 分期付款的 `pay_*` 列在业务发生制下重复计入 | **PR A**：显示并注明「采购口径，非耗用」。重复防护在 **PR B** |
| **食材耗用成本** | 缺失 | 没有期初／期末快照，也没有出入库流水 | **PR C**：资料不足时只标示「资料不完整」 |
| **每日／每月保本** | 估算 | 1. PR #14 把 `PLATFORM_COMM_*` 当成固定费用（已在 #14 修正）；<br>2. 财务报表的日保本可能重复扣外送费用 | **PR A**：变动成本率取当月实际数字，不使用预设比例 |
| **与保本差额** | — | 硬编码 RM 150,000 目标 | **PR A**：月累计 − 日保本 × 已日结天数 |
| **营业额走势** | 实际／估算混用 | 缺日以 0 计算 | **PR A**：缺日结的日子标红，不当作 0 |
| **预警** | 实际 | 1. 一项读取失败，后面全部显示 0（看起来「一切正常」）；<br>2. 两处对低库存、账单、日志的定义不同 | **PR A**：<br>• 基础预警：漏日结、预计亏损、落后保本、缺底薪、无食材记录、钱箱支出未计入<br>• 读取失败显示错误，不显示 0<br>• 完整预警中心在 **PR E** |
| **AI 简报** | **未经验证** | 1. `/api/gemini/chat` 没有身份验证，且接受任意 context；<br>2. 老板入口没有权限检查 | **PR A** 只放依系统计算的摘要（非 AI）。**PR F** 改为由已计算的指标驱动，并可追溯 |

## 3. 其他已知问题

以下为审计发现，本 PR 不修改，列入后续 PR：

| # | 问题 | 位置 | 处理 |
|---|---|---|---|
| 1 | 业务发生制下，AP 第二笔以后的付款（`pay_*`，`totalBillAmount: 0`）会以全额重复计入 | `AccountsPayableModule.tsx:1312-1325` | PR B |
| 2 | Grab 平台款未对账前，广告不会被扣除（用的是 `grabNet`） | `FinancialReport.tsx:552-573` | PR B |
| 3 | 日结钱箱支出 `dayExpenses` 没有分类，没有进入损益 | `SettlementModule.tsx:1275-1281` | PR B（驾驶舱目前列出金额并注明未计入） |
| 4 | 刷卡、电子钱包手续费（`recon_fee_*`）被损益排除 | `settlementRecon.ts:99-116` | PR B |
| 5 | 固定账单类别 `ELECTRICITY_STAFF`、`SUBSCRIPTION` 在 Classic P&L 中消失 | `classicPnLCostMap` | PR B |
| 6 | 老板首页与日报的「今天」在马来西亚时间 00:00–08:00 之间会算成前一天（`toISOString` 时区问题） | `BossPriorityDashboard.tsx:196-198` 等 | 另案修正（V2 页面） |
| 7 | 日报「调整单数」以旧的整份文件覆盖存档，可能盖掉 `reconStatus` | `DailyBusinessReportModal.tsx:610-614` | 另案修正 |
| 8 | 库存没有出入库流水，也没有月底价值快照 | `InventoryModule` / `ProcurementModule` | PR C（需负责人确认是否新增集合） |
| 9 | 没有推播（没有 FCM，`sw.js` 不处理 push） | `public/sw.js` | PR E |
| 10 | `/api/gemini/chat` 没有身份验证 | `server.ts:168-252` | PR F（属 CHG-05 安全范围） |

## 4. PR A 交付范围

- `utils/cockpit/periods.ts`：期间选择。支持今天、昨天、本周、本月、上个月、自订，以营业日计算。
- `utils/monthlyPnLAggregator.ts`：新增 `aggregateRange`，与 `aggregateMonth` 共用同一段程序。重构前后结果相同，已有回归测试对照旧程序。
- `DataManager.getPnLRawRange`：只按日期范围查询，不读整个集合。
- `utils/cockpit/cockpitMetrics.ts`：所有 KPI。每项都附资料状态、计算依据、资料来源和明细。
- `utils/cockpit/loadCockpit.ts`：资料读取，只读。
- `components/features/cockpit/BossCockpit.tsx`：手机优先的驾驶舱画面，按需载入。
- 入口：
  - 老板首页「经营驾驶舱」按钮；
  - 「全部功能」卡片；
  - 权限对应 `BOSS_COCKPIT → REPORTS`，与财务报表相同。
