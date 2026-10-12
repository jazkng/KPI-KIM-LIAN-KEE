# V2 开发预览 `dev.kimliankee.app` 部署方案

- 日期：2026-10-12（已按负责人 2026-10-12 的决定修订：**不创建新的数据库实例**）
- 状态：**方案草案，待负责人批准**。本 PR 不建立任何云端资源，也不修改 Cloudflare DNS。

## 1. 目标与约束

- 负责人可以随时打开 `https://dev.kimliankee.app`，查看已合并到 `develop-v2`、并通过 CI 的版本。
- **不影响 V1**：
  - 不使用、也不改动两个 AI Studio 部署。
  - 不使用 V1 的 Cloud Run 服务。
  - 不写入正式 Firestore 数据。
- 只用**一个 Firebase / GCP 项目**，并且**不新建 Firestore 数据库实例**，包括命名数据库。
- 预览失败不影响营业；任何部署都能一键回退到上一版。

## 2. 预览站的数据：容器内置 Emulator（演示模式）

既然不能新建数据库，又不能让开发中的代码写正式数据，预览站第一阶段就采用**演示模式**：

- 预览站的 Cloud Run 容器内同时运行 `server.ts` 和 Firestore + Auth Emulator（项目 `demo-klk-erp`）。
- 每次启动或部署时，载入一份**模拟数据种子**（假员工、假账单、假日结），由仓库中的种子脚本生成。
- 数据只存在容器内存中：每次重启都会回到种子状态。这对「看新功能、试操作流程」足够，也不可能误写正式账目。
- 浏览器端仍使用 `VITE_USE_FIREBASE_EMULATOR=true`。容器只开放一个端口，所以需要由 `server.ts` 把 Emulator 流量（Firestore WebChannel、Auth 接口）按路径转发到容器内的 Emulator。

> ⚠️ **需要技术验证：** 「同一个网址转发 Emulator 流量（含 HTTPS）」尚未验证。我会先在本机做原型验证，确认可行后才提出部署 PR。如果不可行，备选做法是把预览站的数据层改为纯前端 Mock，同样不需要任何数据库。

**后续阶段（都需要单独批准）：**
- 当安全整改 E3 完成、Rules 已按角色控制后，可以考虑让预览站以**只读角色**连接正式数据库查看真实数据。这仍然不写入数据。
- 如果将来确实需要可写、可长期保存的预览数据，再由负责人决定是否例外批准建立独立数据库。本方案不预设这一项。

## 3. 推荐架构

```
dev.kimliankee.app ──(Cloudflare DNS, DNS only)──▶ Firebase Hosting 独立站点 kimliankee-erp-dev
                                                      │  rewrite: ** → Cloud Run
                                                      ▼
                                   Cloud Run 服务 erp-v2-dev（asia-southeast1）
                                   ├─ server.ts（静态页面 + /api + Emulator 流量转发）
                                   └─ Firestore / Auth Emulator（demo-klk-erp，内存数据，模拟种子）
                                   Gemini：独立 API Key + 低配额；发票扫描：Mock 或停用
```

| 选择 | 理由 |
| --- | --- |
| **Firebase Hosting 独立站点** | 免费的 HTTPS 证书与自定义域名，`rewrites` 可以直接转发到 Cloud Run。与 V1 没有任何共用资源（V1 不在 Firebase Hosting 上）。Hosting 站点不是数据库实例。 |
| **Cloud Run 独立服务 `erp-v2-dev`** | 与 V1 的运行方式相同，环境变量和 Secret 完全独立；可以缩容到 0，费用很低。 |
| **不用 Cloud Run 直接绑定域名** | Cloud Run 域名映射仍属预览功能，且不是所有区域都支持；全局负载均衡器每月约 18 美元。通过 Hosting 转发更简单。 |

## 4. 部署流程（GitHub Actions，日后单独 PR 加入）

- 新增 `deploy-dev-preview.yml`：
  - **只能手动触发**（`workflow_dispatch`），而且只接受 `develop-v2` 分支。
  - 先运行与 CI 相同的检查：lint / test / test:rules / build。
  - 使用 GitHub **Environment `dev-preview`**，并设置「需要负责人批准才执行」。
  - 使用 **Workload Identity Federation**，不在 GitHub 中保存任何服务账号 JSON 密钥。
  - 部署专用服务账号**只**授予：`erp-v2-dev` 的 Cloud Run 部署权限，以及 `kimliankee-erp-dev` 站点的 Hosting 发布权限。这个账号**没有任何 Firestore 权限**。
- 每次部署记录 Commit SHA、Cloud Run revision 和 Hosting release。
- **回退方法**：在 Cloud Run 中把流量切回上一个 revision，或在 Hosting 中回滚到上一个 release。

## 5. 需要负责人执行或批准的步骤（按顺序）

| # | 操作 | 改动范围 | 风险 |
| --- | --- | --- | --- |
| D1 | 确认 Firebase 项目和 `ap-ai-service` 所在的 GCP 项目是不是同一个 | 只看 | 无 |
| D2 | （由我完成）本机原型：容器内 Emulator + 同网址转发 + 模拟种子 | 只改代码 | 无 |
| D3 | 建立 Hosting 站点 `kimliankee-erp-dev` 和 Cloud Run 服务 `erp-v2-dev` | 新增资源（不是数据库） | 低 |
| D4 | 建立部署服务账号与 Workload Identity Federation（我会提供逐条命令，供审核后执行） | IAM 新增 | 中，需要审核权限范围 |
| D5 | 为预览站申请独立的 Gemini API Key，并设置低配额 | 新增 | 低 |
| D6 | 在 Firebase Hosting 添加自定义域名 `dev.kimliankee.app`，再按页面提示在 Cloudflare 添加记录（设为 **DNS only / 灰色云**） | **Cloudflare DNS**，只新增 `dev` 子域名 | 低，但需要单独批准 |

D3–D6 都只新增资源，删除即可完全撤销，也都不会碰到正式数据库。
