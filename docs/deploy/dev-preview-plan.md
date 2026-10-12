# V2 开发预览 `dev.kimliankee.app` 部署方案

- 日期：2026-10-12
- 状态：**方案草案，待负责人批准**。本 PR 不建立任何云端资源，也不修改 Cloudflare DNS。

## 1. 目标与约束

- 负责人可以随时打开 `https://dev.kimliankee.app`，查看已合并到 `develop-v2`、并通过 CI 的版本。
- **不影响 V1**：
  - 不使用、也不改动两个 AI Studio 部署。
  - 不使用 V1 的 Cloud Run 服务。
  - 不写入正式 Firestore `(default)` 数据库。
- 继续只用**一个 Firebase / GCP 项目**（规范第 5 条）。
- 预览失败不影响营业；任何部署都能一键回退到上一版。

## 2. 推荐架构

```
dev.kimliankee.app ──(Cloudflare DNS, DNS only)──▶ Firebase Hosting 独立站点 kimliankee-erp-dev
                                                      │  rewrite: ** → Cloud Run
                                                      ▼
                                              Cloud Run 服务 erp-v2-dev（asia-southeast1）
                                              运行 server.ts（静态页面 + /api）
                                                      │
                     ┌────────────────────────────────┼─────────────────────────────┐
                     ▼                                ▼                             ▼
     Firestore 独立命名数据库 v2-dev        Firebase Auth（同项目）         Gemini：独立 API Key + 低配额
     （与正式 (default) 数据库完全隔离）                                    发票扫描：Mock 或停用
```

### 为什么这样设计

| 选择 | 理由 |
| --- | --- |
| **Firestore 命名数据库 `v2-dev`** | Firestore 支持一个项目内有多个数据库。预览数据与正式 `(default)` 物理隔离、规则各自独立，同时仍是「同一个 Firebase 项目」。V2 前端只需要加一个设置，例如 `VITE_FIRESTORE_DATABASE_ID=v2-dev`。 |
| **Firebase Hosting 独立站点** | 免费的 HTTPS 证书与自定义域名，`rewrites` 可以直接转发到 Cloud Run。与 V1 没有任何共用资源（V1 不在 Firebase Hosting 上）。 |
| **Cloud Run 独立服务 `erp-v2-dev`** | 与 V1 相同的运行方式（`server.ts`），环境变量和 Secret 完全独立；可以缩容到 0，费用很低。 |
| **不用 Cloud Run 直接绑定域名** | Cloud Run 域名映射仍属预览功能，且不是所有区域都支持；全局负载均衡器每月约 18 美元。通过 Hosting 转发更简单。 |

### 预览数据来源（对应审计报告中的 A8）

1. **第一阶段（推荐，马上可以用）**：`v2-dev` 数据库只放模拟数据，使用种子脚本或 App 内置的「初始化系统」生成。
2. **第二阶段（可选）**：如果需要用真实规模的数据测试，就把正式数据导出，经过**脱敏**（去掉 PIN、银行账号、IC、薪资明细）后导入 `v2-dev`。导出是只读操作，但需要单独批准。
3. **不推荐**：预览站直接连正式 `(default)` 数据库。在完成安全整改 E3 之前，这等于让一个开发中的版本拥有正式数据的完整读写权限。

## 3. 部署流程（GitHub Actions，日后单独 PR 加入）

- 新增 `deploy-dev-preview.yml`：
  - **只能手动触发**（`workflow_dispatch`），而且只接受 `develop-v2` 分支。
  - 先运行与 CI 相同的检查：lint / test / test:rules / build。
  - 使用 GitHub **Environment `dev-preview`**，并设置「需要负责人批准才执行」。
  - 使用 **Workload Identity Federation**，不在 GitHub 中保存任何服务账号 JSON 密钥。
  - 部署专用服务账号**只**授予：`erp-v2-dev` 的 Cloud Run 部署权限，以及 `kimliankee-erp-dev` 站点的 Hosting 发布权限。这个账号没有任何 Firestore 数据权限，也不能接触 V1。
- 每次部署记录 Commit SHA、Cloud Run revision 和 Hosting release。
- **回退方法**：在 Cloud Run 中把流量切回上一个 revision，或在 Hosting 中回滚到上一个 release。两者都能一键完成。

## 4. 需要负责人执行或批准的步骤（按顺序）

| # | 操作 | 改动范围 | 风险 |
| --- | --- | --- | --- |
| D1 | 确认 Firebase 项目和 `ap-ai-service` 所在的 GCP 项目是不是同一个（GCP 项目编号相同即可） | 只看 | 无 |
| D2 | 在同一项目中建立 Firestore 命名数据库 `v2-dev`（区域与正式库相同） | 新增资源，不动 `(default)` | 低 |
| D3 | 建立 Hosting 站点 `kimliankee-erp-dev` 和 Cloud Run 服务 `erp-v2-dev` | 新增资源 | 低 |
| D4 | 建立部署服务账号与 Workload Identity Federation（我会提供逐条命令，供审核后执行） | IAM 新增 | 中，需要审核权限范围 |
| D5 | 为预览站申请独立的 Gemini API Key，并设置低配额 | 新增 | 低 |
| D6 | 在 Firebase Hosting 添加自定义域名 `dev.kimliankee.app`，再按页面提示在 Cloudflare 添加 TXT 或 A 记录（设为 **DNS only / 灰色云**，否则无法签发证书） | **Cloudflare DNS**，只新增 `dev` 子域名，不动其他记录 | 低，但需要单独批准 |

D2–D6 都只新增资源，不修改任何现有资源；删除这些资源即可完全撤销。
