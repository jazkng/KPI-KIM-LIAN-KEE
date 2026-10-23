# AGENTS.md — 金莲记 · 御膳智控 ERP

**完整共同规范：[`docs/KLK_ERP_V2_RULES.md`](docs/KLK_ERP_V2_RULES.md)（必读；Claude Code 与 Codex 共用）。** 本文件只列出每次工作都必须遵守的要点。

> 本文件供 OpenAI Codex 读取；Claude Code 读取内容相同的 `CLAUDE.md`。修改规则时请两份一起更新。

## 绝对禁止（未经负责人在对话中明确批准）
- 合并或推送到 `main`；发布 V2 正式版（`dev.kimliankee.app` 预览站的自动部署已获批准，不在此限）；修改 V1 两个 AI Studio 部署（`kimliankee-epr.ai.studio`、`service-5174.ai.studio`）。
- 修改 Cloudflare DNS、正式 Firebase 的 Security Rules / Auth 设置 / 索引、Cloud Run（预览服务 `erp-v2-dev` 的自动部署除外）、付款设置。
- 对正式 Firestore **自行执行**批量删除、批量改写、破坏性迁移（删除或改名字段、改变字段格式、重写历史记录）。
- 让自动化测试（单元测试、Rules 测试、CI）连接正式 Firestore；自动化测试只能用 Emulator（`demo-klk-erp`）或 Mock。
- `git push --force` 到共享分支；跳过审核；修改分支保护；删除他人分支。
- 在代码、日志、PR、聊天中输出密钥、Token、Service Account JSON、`.env` 内容。

## 数据策略（负责人最终决定，详见规范第 10 条）
- 只有**一个** Firebase 项目、**一个**正式数据库。不建第二个项目，不建新数据库实例。**不要再询问是否建立测试数据库。**
- `dev.kimliankee.app`（V2 预览）连接正式数据库，由负责人亲自操作和验收；V2 产生的数据会同步出现在 V1，负责人已接受。
- 预览站必须启用访问门禁（`server.ts` 的 `PREVIEW_ACCESS_PASSWORD`，在送出任何内容前于服务端验证）；不得新增「打开页面就写入」的代码，写入一律经明确操作或确认。
- 正常开发流程可以使用现有数据库。**高风险变更**（批量写入、修改、删除，迁移，删除或改名字段，改动财务历史、日结、审计日志，修改 Rules、索引、Auth）必须：先备份并确认可用 → 说明影响与回滚 → 取得负责人批准 → 才可执行。
- **V1 必须能读懂 V2 写入的数据**：只新增可选字段或新集合，不删除、不改名、不改变既有字段的类型。改动写入路径的 PR 要附「V1 兼容性说明」。
- 不在正式数据库中建立测试订单、测试交易。新功能先在 Emulator 中测通，再由负责人在预览站验收。

## 快速迭代（负责人 2026-10-14 决定，详见规范第 11 条）
- 完成且 CI 通过的 PR，检查依赖与冲突后尽快合并到 `develop-v2`，不要长期留在 Draft。
- 合并后自动部署 `dev.kimliankee.app`。部署前跑 CI 并验证访问门禁，失败自动回滚。
- **dev 是测试站，`epr.kimliankee.app` 是正式站**（负责人 2026-10-23）：只有负责人在对话中说「发布」，才可运行 `deploy-production.yml`（action=release）把 dev 当下的版本发布到 epr。见 `docs/deploy/production-plan.md`。
- 按功能逐个发布。涉及真实写入、付款、订单权限、迁移的功能，未通过安全检查前可先发布界面，但禁用操作。
- 有阻碍（批量写入、财务缺口、权限风险）的 PR 明确列出阻碍，不强行合并。

## 分支
- `develop-v2`：V2 整合分支，只接受 PR。
- `codex/<feature>`：Codex 的功能分支，从最新 `develop-v2` 建立，PR 回 `develop-v2`。
- `claude/<feature>`：Claude Code 的功能分支。不要写入对方的分支。

## 开发与验证命令
```bash
bun install --frozen-lockfile   # 依赖以 bun.lock 为准（package-lock.json 被 .gitignore 忽略）
npm run lint                    # TypeScript 类型检查（tsc --noEmit）
npm test                        # 单元测试（vitest，tests/unit）
npm run test:rules              # Firestore Rules 测试（自动启动 Emulator，需要 Java）
npm run build                   # 生产构建
npm run emulators               # 本机 Firestore + Auth Emulator（UI: http://127.0.0.1:4000）
npm run dev:emulator            # 连接 Emulator 的开发服务器（http://localhost:3000）
```
提交 PR 前以上 lint / test / test:rules / build 必须实际运行并通过；报告中写明命令和结果，不能声称未运行的测试已通过。

## 架构速览
- 前端：React 19 + Vite 6 + Tailwind 4（根目录 `App.tsx`、`components/`、`utils/`、`constants/`、`types.ts`）。
- 后端：`server.ts`（Express 5）——Gemini 接口 `/api/gemini/*`、发票扫描代理 `/api/ap-ai/*`、TWA `assetlinks`。
- 发票扫描服务：`ap-ai-service/`（Cloud Run，Google Drive）。
- 数据：前端直连 Firestore，主要逻辑在 `utils/dataManager.ts`；连接配置在 `firebaseConfig.ts`（`VITE_USE_FIREBASE_EMULATOR=true` 时强制使用 Emulator）。
- 当前安全状况与整改计划：`docs/security/`。**V1 的登录与权限只在前端执行**，任何新功能都不能以「前端隐藏按钮」作为权限控制。

## 数据与财务原则
- 向后兼容：新增可选字段，保留旧字段读取，V1/V2 共用同一个 Firebase 项目。
- 不得无声改写原始交易、历史日结、成本依据、审计日志。
- 数据模型、权限、资金逻辑、自动扣库存、部署架构的改动：先写设计说明并获负责人批准。

## 每次交付报告
任务目标与完成情况 · 分支 / Commit SHA / PR 链接 · 修改文件 · 实际执行的命令与结果 · 数据库/权限/部署影响 · 是否涉及 V1 生产（正常应为「否」）· 风险与待批准事项。
