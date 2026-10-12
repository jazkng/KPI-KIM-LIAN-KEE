# 分支保护方案（`main` 与 `develop-v2`）

- 日期：2026-10-12
- 状态：**待负责人在 GitHub 设置页面操作**。
  - Claude Code 在本会话中没有修改仓库设置的权限，所以没有更改任何保护规则。
  - 规范也规定 AI 不得擅自修改分支保护。

## 1. 现有 AI Studio 同步的工作方式（从提交记录判断）

| 提交 | 作者 / 提交者 | 父提交 | 判断 |
| --- | --- | --- | --- |
| `2f9fad2` feat: implement read-only mode and staff cash module | jazkng / jazkng | `2a8209a` | AI Studio 导出 |
| `2a8209a` Updated | jazkng / jazkng | `415d47b`（Claude 的合并提交） | AI Studio 导出 |

- AI Studio 以**您本人的 GitHub 身份**（jazkng，仓库管理员）**直接 push 到 `main`**，没有经过 PR。
- 两次提交都接在 GitHub 上已有的历史之后（普通 fast-forward），**没有看到 force push 的迹象**。

## 2. 每项保护对 AI Studio 同步的影响

| 保护项 | 对 AI Studio 同步的影响 | 建议 |
| --- | --- | --- |
| 禁止 force push | **无影响**（目前 AI Studio 只做普通 push）。如果将来 AI Studio 试图用 force push 覆盖 GitHub 上的历史，会被拒绝。这正是我们想要的保护，但 AI Studio 会显示同步失败。 | ✅ 现在开启 |
| 禁止删除分支 | 无影响 | ✅ 现在开启 |
| 必须通过 PR 才能合并 | **会阻止 AI Studio 同步**（如果规则也适用于管理员）。V1 在 AI Studio 中的运行和部署不受影响，只是 AI Studio 的代码无法再导出到 GitHub。 | ⏸ 等决定停止在 AI Studio 修改代码后再开启 |
| 必须通过 CI 状态检查 | 同上，直接 push 会被拒绝 | ⏸ 同上 |
| 规则是否适用于管理员 | 如果管理员可以绕过，AI Studio（以管理员身份推送）就不会被挡，但保护效果也大打折扣 | 第二阶段设为「不允许绕过」 |

规范第 1.3 条已经决定「不再以 AI Studio 直接修改正式版代码」。所以第二阶段一旦开启，AI Studio 同步停止是**预期结果**，不是故障。但开启前请确认：AI Studio 里已经没有尚未导出到 GitHub 的修改。

## 3. 建议设置

### 第一阶段（现在，零影响）

GitHub → Settings → Rules → Rulesets → New branch ruleset：

- **名称**：`main-safety`
  - Enforcement：Active
  - Target：`main`
  - Bypass list：留空
  - 勾选：**Restrict deletions**、**Block force pushes**
- **名称**：`develop-v2`
  - Target：`develop-v2`
  - Bypass list：留空
  - 勾选：
    - **Restrict deletions**
    - **Block force pushes**
    - **Require a pull request before merging**（Required approvals = **0**，原因见下方说明）
    - **Require status checks to pass**：`TypeScript · 单元测试 · Build`、`Firestore Rules（Emulator）`、`密钥扫描`
      （这三个检查名称要等 CI 在本 PR 上运行过一次后，才会出现在选单中）

> **为什么 Required approvals 设为 0：**
> - Claude Code、Codex 和您很可能都以同一个 GitHub 账号（jazkng）操作，而 GitHub 不允许自己批准自己的 PR。
> - 审核改为在 PR 中留下另一位 AI 的审核意见，再由您点击合并。
> - 如果将来 Codex 使用独立账号，可以改为 1。

### 第二阶段（确认 AI Studio 不再修改代码后）

在 `main-safety` 中加上：
- **Require a pull request before merging**
- **Require status checks to pass**（与上面相同的三项检查）

开启后，任何变更（包括 V1 紧急修复）都要经 PR 才能进入 `main`。
