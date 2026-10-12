# 金莲记 · 御膳智控 ERP

金莲记（Kim Lian Kee）餐厅管理系统：员工登录与权限、每日结算、财务、库存、采购、应付账款、排班、考勤、薪资、SOP 与考核。

- **V1（正式营业中）**：由 AI Studio 部署
  - `https://kimliankee-epr.ai.studio`
  - `https://service-5174.ai.studio`
  - AI Studio App：<https://ai.studio/apps/71b630a9-6559-4e79-a1ad-194791d4c13d>
- **V2（开发中）**：在 `develop-v2` 分支整合，预览网址 `dev.kimliankee.app`（待建立）

## 开发前必读

- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md)：Claude Code 与 Codex 的开发规则（内容相同）
- [`docs/KLK_ERP_V2_RULES.md`](docs/KLK_ERP_V2_RULES.md)：完整共同规范，其中第 10 条为 V2 开发数据策略

## 快速开始

需要 Node.js 22、[Bun](https://bun.sh)；运行 Firestore Rules 测试还需要 Java 21。

```bash
bun install --frozen-lockfile   # 依赖以 bun.lock 为准
npm run lint                    # TypeScript 类型检查
npm test                        # 单元测试
npm run test:rules              # Firestore Rules 测试（自动启动 Emulator）
npm run build                   # 生产构建

npm run emulators               # 启动本机 Firestore + Auth Emulator
npm run dev:emulator            # 连接 Emulator 的开发服务器（http://localhost:3000）
```

环境变量名称见 [`.env.example`](.env.example)。真实的值只放在本机的 `.env` / `.env.local` 或部署平台的 Secrets 中，**绝不提交到 Git**。

## 项目结构

| 位置 | 内容 |
| --- | --- |
| `App.tsx`、`components/`、`utils/`、`constants/`、`types.ts` | 前端（React 19 + Vite 6 + Tailwind 4） |
| `server.ts` | 后端（Express 5）：Gemini 接口、发票扫描代理、TWA `assetlinks` |
| `ap-ai-service/` | 发票扫描服务（Cloud Run + Google Drive），见其 [README](ap-ai-service/README.md) |
| `firebaseConfig.ts`、`firestore.rules` | Firebase 连接与安全规则 |
| `tests/` | 单元测试与 Rules 测试 |

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/audit/`](docs/audit/) | 第一阶段只读审计 |
| [`docs/security/`](docs/security/) | 安全整改方案与生产紧急整改计划 |
| [`docs/deploy/dev-preview-plan.md`](docs/deploy/dev-preview-plan.md) | V2 预览部署方案 |
| [`docs/github/branch-protection.md`](docs/github/branch-protection.md) | 分支保护方案 |
| [`docs/android/apk-build.md`](docs/android/apk-build.md) | Android APK（TWA）打包与维护 |
| [`docs/cleanup/`](docs/cleanup/) | 文档清理清单 |
| [`docs/archive/`](docs/archive/) | 历史记录 |
