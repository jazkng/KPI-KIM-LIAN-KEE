# V2 正式站 `epr.kimliankee.app`

> 负责人 2026-10-23 批准：V2 从预览站 `dev.kimliankee.app` 发布为正式站 `epr.kimliankee.app`，开始正常使用。
> 云端设置（Cloud Run、网域映射、Cloudflare DNS）由负责人执行；Claude Code 没有这些权限，也不得自行修改 DNS。

## 1. 架构

```
epr.kimliankee.app ──(Cloudflare DNS, DNS only)──▶ Cloud Run erp-v2      ← 正式站：手动发布
dev.kimliankee.app ──(Cloudflare DNS, DNS only)──▶ Cloud Run erp-v2-dev  ← 预览站：每次合并自动更新
                                 两者 ──▶ 同一个正式 Firestore（与 V1 相同）
```

| 项目 | 做法 |
| --- | --- |
| 版本 | 正式站**不重新构建**，直接用预览站正在跑、已通过 CI 与门禁检查的镜像。负责人在 dev 验收后，再发布到 epr |
| 访问门禁 | 正式站同样启用（`PREVIEW_ACCESS_PASSWORD`，正式站自己的密码 `erp-v2-prod-access-password`）。员工第一次打开时浏览器会问一次帐号密码（帐号随意）。门禁要等「只保留服务端登录 + 收紧 Rules」完成后另行评估，不能直接拿掉 |
| 密钥 | Gemini、发票扫描沿用预览站的 Secret；正式站只新增访问密码 |
| 权限 | 部署账号只多了 `erp-v2` 一个服务的部署权，和读取预览站目前版本的权限 |
| main 分支 | 不动。正式站从 `develop-v2` 的镜像发布 |

## 2. 负责人一次性设置

1. Google Cloud Shell：
   ```bash
   cd KPI-KIM-LIAN-KEE && git checkout develop-v2 && git pull
   PROJECT_ID=<你的 Firebase 项目 ID> bash docs/deploy/setup-production.sh
   ```
   正式站密码只显示一次，请存好。
2. **Cloudflare**：按脚本列出的记录新增或修改 `epr`（**DNS only / 灰色云**）。如果 `epr` 原本已有记录，先截图保存。HTTPS 证书通常 15–60 分钟内自动签发。
3. Firebase Web API Key 如有「HTTP referrer」限制，加入 `https://epr.kimliankee.app/*`。
4. 发布：
   ```bash
   gh workflow run deploy-production.yml -R jazkng/KPI-KIM-LIAN-KEE --ref develop-v2 -f action=release
   ```
5. 用正式站密码打开 `https://epr.kimliankee.app`，确认登录、员工资料、日结页面正常。

## 3. 之后怎么更新、怎么回滚

- **更新正式站**：照常合并 → dev 自动更新 → 负责人在 dev 看过 → 再执行一次第 2 节第 4 步。
- **发布指定版本**：加 `-f commit=<develop-v2 的完整 SHA>`（那个 commit 必须部署过预览站）。
- **回滚**：`gh workflow run deploy-production.yml -R jazkng/KPI-KIM-LIAN-KEE --ref develop-v2 -f action=rollback -f revision=<旧 revision>`。旧 revision 名称在每次发布的运行摘要里。
- 回滚只回退代码，不回退已写入的资料。

## 4. 上线后要注意
- **会议签到 QR**：以前从 dev 打印的墙上 QR 指向 dev。请在正式站重新打印（会议 → QR）。App 里的「扫一扫」两种 QR 都认得。
- **员工手机的主画面捷径 / App**：改成 epr 网址（TWA 的 `assetlinks` 见 `docs/deploy/v2-cutover-checklist.md` B6）。
- **V1 仍在线**：V1 和 V2 共用资料库，V1 停用与安全收紧（Rules、PIN 重设）照 `v2-cutover-checklist.md` 逐项批准后进行。
