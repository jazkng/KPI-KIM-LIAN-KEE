# AGENTS.md — 金莲记 · 御膳智控 ERP

**完整共同规范：[`docs/KLK_ERP_V2_RULES.md`](docs/KLK_ERP_V2_RULES.md)（必读；Claude Code 与 Codex 共用）。** 本文件只列出每次工作都必须遵守的要点。

> 本文件供 OpenAI Codex 读取；Claude Code 读取内容相同的 `CLAUDE.md`。修改规则时请两份一起更新。

## 绝对禁止（未经负责人在对话中明确批准）
- 合并或推送到 `main`；发布 V2 正式版；修改 V1 两个 AI Studio 部署（`kimliankee-epr.ai.studio`、`service-5174.ai.studio`）。
- 修改 Cloudflare DNS、正式 Firebase（Rules、Auth、索引、数据）、Cloud Run、付款设置。
- 用任何代码、脚本或测试读写**正式** Firestore 的营业数据。测试只能用 Emulator（`demo-klk-erp`）或 Mock。
- `git push --force` 到共享分支；跳过审核；修改分支保护；删除他人分支。
- 在代码、日志、PR、聊天中输出密钥、Token、Service Account JSON、`.env` 内容。

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
