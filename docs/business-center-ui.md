# 经营中心界面整合

- 保留现有 Login、getPortalRole、portalRoleOverride、allowedModules、readOnlyAccess；没有新登录方式或角色选择器。
- 默认老板首页改为经营中心。手机底栏为经营中心、人事、全部功能；电脑经营中心保留侧栏与双栏。
- 读取前检查 REPORTS，日报营运明细另检查 SETTLEMENT。权限撤销、换账号或切月时不保留上次明细。
- 月度只读调用 loadCockpitWith / computePnL，与原经营驾驶舱相同输入及计算。一次范围读取同时供日报和趋势，补足月初跨月前14天对照。
- 日报仅显示已结算日。月度沿用原引擎对草稿记录的处理；若存在 isClosed=false，显眼提示数量，不无声改报表结果。
- 日报与分渠道使用同一利润引擎的销售口径，平台总额与到账金额分开。旧 Grab 缺总额沿用引擎回退，同时提示待核对。
- 店内单均及人均只用店内销售额。读取#71新增的各平台完成单字段；缺失显示待补，有销售额但0单提示核对，不猜测订单数。
- 原 HR、排班、应付账款、资金与固定账单仍为现有功能模块，权限和可操作性不变；首页汇总只读不代表原模块全部只读。
- 无数据库写入、迁移、Rules/Auth改动，无V1或main改动。以功能分支PR到develop-v2，经CI及交叉审核后自动发布开发预览，回滚可恢复上个预览版本。
- 已同步#71特殊情况、天气、假日工具及平台单数；仅作经营环境提示，不用环境标签判断原因或决定工资，不恢复天气/空气质量自动同步。

验证：类型检查、单元测试、生产构建；Rules使用demo-klk-erp模拟器。tests/fixtures/business-center是可注入模拟数据的隔离组件验收，不是正式登录绕过入口，生产构建不包含该页面。

假日资料的已核对修正：2026-03-20额外假日、6/1元首诞辰、6/2卫塞补假。官方依据：[PUB111](https://www.kabinet.gov.my/storage/2026/03/PUB-111_2026.pdf)、[JTKSM说明](https://jtksm.mohr.gov.my/sites/default/files/2026-05/Kenyataan%20Media%20Hari%20Wesak%20dan%20Hari%20Keputeraan%20Yang%20di-Pertuan%20Agong%202026.pdf)。2027日期沿用现表预计标记；本次不据此改变薪资。
