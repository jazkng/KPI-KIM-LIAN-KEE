# V1 仍在使用期间的卫生评分规则

状态：代码已准备；正式 Firestore 尚未发布。

负责人确认仍有员工使用 V1，因此此阶段只能收紧 V2 专用的 `hygiene_checks`。其他集合保留原有 Firebase 已登录身份可读写的规则；V1 的读写行为不变。不要把此变更称为全面完成 CHG-06。

## 影响

- V2 评分写入必须使用员工编号登录签发的 Firebase 身份；L1、L2、L2S 最多 5 分，L3 最多 4 分，L4 最多 3 分，L5 无评分权。
- L3/L4 只可评本部门或老板在人事档案允许的额外部门的 L5 员工；同一周已有别人评分时不能覆盖。
- V1 匿名身份仍可读写其他集合，包含 `employees`。这意味着旧权限漏洞仍在，部门和额外检查区域等档案字段不能视为已受到 Firestore 保护。全面角色隔离仍须等 V1 停用、备份恢复演练和 PIN 轮换。
- 档案等级调整后，已有 V2 登录凭证中的等级可能需要重新登录才能同步；规则额外比对档案等级与凭证等级，不一致时暂时拒绝评分。

## 发布前检查

1. 2026-10-24 已在 Google Cloud 控制台确认：PITR 保留 7 天；最新计划备份为 2026-10-24 15:06:33 GMT+8，备份编号 `a37385fb-fd55-42e8-bbe3-0acaa2232933`，界面显示有效至 2026-11-07。**尚未完成恢复演练**，发布前须确认备份可恢复。
2. 线上当前规则与 `4a2744b:firestore.rules` 相同（仅要求 `request.auth != null`）；此 Git 版本是本次规则的回滚副本。
3. 在 `demo-klk-erp` Emulator 执行 `npm run test:rules`；检查 V1 匿名访问旧集合、V2 各级评分、跨区、重复覆盖。
4. 只发布 `firestore:rules` 到 `kimliankee-erp`，随后分别验证 V1 原有操作和 V2 评分。不要运行完整 `firebase deploy`。

## 回滚

如果线上 V1 或 V2 操作失败，立即把 Git `4a2744b:firestore.rules` 写回工作树，再执行 `firebase deploy --only firestore:rules --project kimliankee-erp`。Firestore 规则回滚不会改动业务数据，但本次规则生效期间遭拒的写入不会自动补回，需由使用者重试。
