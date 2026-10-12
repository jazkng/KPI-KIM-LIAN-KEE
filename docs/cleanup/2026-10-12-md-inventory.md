# Markdown 文件清理清单

- 日期：2026-10-12
- 状态：**已执行**（负责人于 2026-10-12 批准，在独立的文档清理 PR 中完成，只合并到 `develop-v2`，不动 `main`）。执行结果见文末。
- 范围：仓库内全部 14 个 `.md` 文件（不含 `node_modules`）。

## 总表

| 文件 | 最后修改 | 分类 | 原因 | 建议动作 |
| --- | --- | --- | --- | --- |
| `CLAUDE.md` | 2026-10-12 | **保留** | Claude Code 的开发规则 | — |
| `AGENTS.md` | 2026-10-12 | **保留** | Codex 的开发规则（与 `CLAUDE.md` 同步） | — |
| `docs/KLK_ERP_V2_RULES.md` | 2026-10-12 | **保留** | 负责人制定的共同规范原文 | — |
| `docs/audit/2026-10-12-phase1-audit.md` | 2026-10-12 | **保留** | 第一阶段审计记录 | 内容中关于预览站数据库的建议已被新决定取代，在文首加一行注记即可 |
| `docs/security/*.md` | 2026-10-12 | **保留** | 安全整改方案与紧急计划 | — |
| `docs/deploy/dev-preview-plan.md` | 2026-10-12 | **保留** | 预览部署方案 | — |
| `docs/github/branch-protection.md` | 2026-10-12 | **保留** | 分支保护方案 | — |
| `components/features/inventory/README.md` | 2026-07-07 | **保留** | 文件结构与实际一致 | — |
| `components/features/ap/README.md` | 2026-07-07 | **保留（需补充）** | 漏列 `PayablesOverview.tsx`、`VendorConfigModal.tsx` | 补上这两个文件的说明 |
| `components/features/supplier/README.md` | 2026-07-07 | **保留（需补充）** | 漏列 `BatchStockLinkModal.tsx`、`BatchSupplierCodeModal.tsx` | 补上这两个文件的说明 |
| `README.md` | 2026-10-12 | **合并（重写）** | 仍是 AI Studio 自动生成的模板：只提到 `GEMINI_API_KEY`，使用 `npm install`（实际以 `bun.lock` 为准），没有 Firebase、Emulator、测试、分支说明 | 重写为项目首页：简介、快速开始（引用 `CLAUDE.md` 的命令）、文档索引。保留 AI Studio App 链接作为 V1 参考 |
| `ANDROID_APK_BUILD.md` | 2026-10-12 | **保留并移入 `docs/android/`** | 当前有效的 APK 打包步骤，与 `twa-manifest.json`（`com.kimliankee.erp` → `service-5174.ai.studio`）一致 | 移到 `docs/android/apk-build.md`；网域切换到 `erp.kimliankee.app` 时需重新打包，在文中加注 |
| `ANDROID_TWA_SETUP.md` | 2026-07-28 | **合并后建议删除** | 与 `ANDROID_APK_BUILD.md` 大部分重复，部分内容已过时：要求修改 `public/.well-known/assetlinks.json`（该文件实际不会被送出，由 `server.ts` 依 `TWA_PACKAGES` 动态产生），网址也写成占位的「正式 Cloud Run 域名」。（初版清单误称代码中没有 `portal=boss` 逻辑；实际 `App.tsx` 已实现，会直接打开老板 PIN 登录画面） | 把仍然有效的内容全部并入 `docs/android/apk-build.md`，逐节核对后删除 |
| `# 御膳智控 ERP — 风格统一 + 代码清理.md` | 2026-07-28 | **归档** | 7 月份一次性交付说明（对应 commit `841c1f8`），文中要求在 AI Studio 手动删除的 26 个文件在 GitHub 上已经不存在。文件名以 `# ` 开头并含空格，许多工具和命令行处理不便 | 移到 `docs/archive/2026-07-28-style-unify-cleanup.md`，并在文首注明「历史记录，已完成」 |

## 待确认事项

1. **AI Studio 中的那 26 个旧文件是否已删除**：GitHub 上已经没有，但 AI Studio 项目里是否还在，只能在 AI Studio 中确认。这影响 V1，但不影响 V2。
2. **「主管版」APK 是否仍是需求**：决定 `ANDROID_TWA_SETUP.md` 中的内容是并入待办，还是直接舍弃。
3. **`ap-ai-service/` 没有 README**：建议新增，写明部署方式、环境变量名称（不写值）和 `INTERNAL_API_KEY` 闸门说明。

## 对 V1 与 AI Studio 同步的影响

- 清理只在 `develop-v2` 进行，不改 `main`，所以不影响 V1，也不影响 AI Studio 的同步。
- 将来 V2 合并回 `main` 时，这些移动和删除会一并带过去。在此之前，如果 AI Studio 再次向 `main` 导出这些旧文件，也只影响 `main`。

## 执行结果（2026-10-12）

| 文件 | 动作 |
| --- | --- |
| `ANDROID_APK_BUILD.md` | 移到 `docs/android/apk-build.md`（保留 Git 历史），并与下一项合并、补充现状 |
| `ANDROID_TWA_SETUP.md` | 有效内容全部并入 `docs/android/apk-build.md`，**已删除**。逐节去向见该文档附录「来源对照」；唯一舍弃的做法是「修改 `public/.well-known/assetlinks.json`」，因为它不会生效 |
| `# 御膳智控 ERP — 风格统一 + 代码清理.md` | 移到 `docs/archive/2026-07-28-style-unify-cleanup.md`，文首加上归档说明 |
| `README.md` | 重写为项目首页：简介、快速开始、项目结构、文档索引 |
| `components/features/ap/README.md` | 补上 `PayablesOverview.tsx`、`VendorConfigModal.tsx` |
| `components/features/supplier/README.md` | 补上 `BatchStockLinkModal.tsx`、`BatchSupplierCodeModal.tsx` |
| `ap-ai-service/README.md` | 新增：接口、会改动 Drive 的操作、环境变量名称、本机运行注意事项 |
| `.gitignore` | 加入 `*.keystore`、`*.jks`，防止 APK 签名密钥被提交（仓库历史中从未提交过） |

仍待负责人确认的事项，已写在 `docs/android/apk-build.md` 第零节和 `ap-ai-service/README.md`：
- 实际在用的 APK 是哪一支，keystore 是否已备份；
- `ap-ai-service` 的部署方式。

