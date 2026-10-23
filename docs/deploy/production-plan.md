# 正式站 `epr.kimliankee.app` 与测试站 `dev.kimliankee.app`

> 负责人 2026-10-23 决定：**dev 是测试站，epr 是正式站。负责人确认 dev 的内容可以后，才发布到 epr。**
> 云端设置（Cloud Run、网域映射）由负责人执行；Claude Code 没有这些权限，也不得自行修改 DNS。
> 发布到正式站：负责人说「发布」，或自己执行第 3 节的指令。

## 1. 架构

```
dev.kimliankee.app ──▶ Cloud Run erp-v2-dev  ← 测试站：develop-v2 每次合并自动更新
epr.kimliankee.app ──▶ Cloud Run erp-v2      ← 正式站：负责人确认后才发布
                       两者 ──▶ 同一个正式 Firestore（与 V1 相同）
```

| 项目 | 做法 |
| --- | --- |
| 版本 | 正式站**不重新构建**，直接发布测试站正在跑、负责人看过的同一个镜像 |
| 资料 | 测试站与正式站用**同一个资料库**。在 dev 上做的操作是真的，会出现在正式站与 V1 |
| 登录 | 服务端登录（登录后免密码）两边同一个开关（GitHub 变量 `AUTH_SERVER_ENABLED`）；两边的登录记录分开 |
| 访问门禁 | 正式站有自己的后备密码 `erp-v2-prod-access-password`（只给负责人；员工用员工 PIN 登录） |
| 密钥 | Gemini、发票扫描沿用测试站的 Secret |
| main 分支 | 不动。正式站从 `develop-v2` 的镜像发布 |

## 2. 负责人一次性设置（依序做）

1. **正式站服务**（Cloud Shell，约 5 分钟）：
   ```bash
   cd KPI-KIM-LIAN-KEE && git checkout develop-v2 && git pull
   PROJECT_ID=<项目 ID> bash docs/deploy/setup-production.sh
   ```
   正式站后备密码只显示一次，请存好。这一步 epr 网址先不动，员工照常使用。
2. **登录后免密码**（如果还没做）：`docs/deploy/enable-server-login.sh`，再在 GitHub Variables 设 `AUTH_SERVER_ENABLED=true`。
3. **第一次发布正式站**（第 3 节）。完成后可用 Cloud Run 给的 `erp-v2-….run.app` 网址先看一眼。
4. **店休时把 epr 网址搬到正式站**：
   ```bash
   PROJECT_ID=<项目 ID> bash docs/deploy/move-epr-to-production.sh
   ```
   搬的过程中 epr 有 15–60 分钟打不开（重新签发 HTTPS 证书），员工这段时间可用 dev。Cloudflare 不用改。

## 3. 平常的流程

1. 改动合并 → dev 自动更新。
2. 负责人在 dev 检查。
3. 可以了 → 发布到 epr：
   - 跟 Claude Code 说「发布」；或
   - `gh workflow run deploy-production.yml -R jazkng/KPI-KIM-LIAN-KEE --ref develop-v2 -f action=release`
   发布的是 dev **当下**的版本。工作流会先部署不接流量的候选版本、确认未登录访问接口是 401，才切流量；失败自动切回上一版。
4. **回滚**：`… -f action=rollback -f revision=<旧 revision>`（旧 revision 名称在每次发布的运行摘要里）。只回退程序，不回退已写入的资料。

## 4. 注意
- **会议签到 QR**：从正式站（epr）打印墙上的 QR。App 里的「扫一扫」两种都认得。
- **员工手机**：主画面捷径用 epr 网址。
- **V1 仍在线**：V1 停用、全员重设 PIN、收紧 Rules，照 `v2-cutover-checklist.md` 逐项批准后进行。
