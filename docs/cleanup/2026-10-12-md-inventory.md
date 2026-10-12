# Markdown 文件清理清单

- 日期：2026-10-12
- 状态：**只是清单，没有删除、移动或修改任何文件**。实际清理需负责人批准后，在独立 PR 中进行，并且只在 `develop-v2` 上做，不动 `main`。
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
| `ANDROID_TWA_SETUP.md` | 2026-07-28 | **合并后建议删除** | 与 `ANDROID_APK_BUILD.md` 大部分重复，而且内容与现状冲突：描述「主管版」APK（包名 `com.kimliankee.erp.supervisor`、入口 `/?portal=boss`），但代码里没有 `portal=boss` 的路由逻辑，网址也写成占位的「正式 Cloud Run 域名」 | 把仍然有用的部分（PWABuilder 打包方式、员工 PWA 与 APK 分流的概念）并入 `docs/android/apk-build.md` 的「附录」，然后删除。若主管版 APK 仍是需求，改记为 V2 待办 |
| `# 御膳智控 ERP — 风格统一 + 代码清理.md` | 2026-07-28 | **归档** | 7 月份一次性交付说明（对应 commit `841c1f8`），文中要求在 AI Studio 手动删除的 26 个文件在 GitHub 上已经不存在。文件名以 `# ` 开头并含空格，许多工具和命令行处理不便 | 移到 `docs/archive/2026-07-28-style-unify-cleanup.md`，并在文首注明「历史记录，已完成」 |

## 待确认事项

1. **AI Studio 中的那 26 个旧文件是否已删除**：GitHub 上已经没有，但 AI Studio 项目里是否还在，只能在 AI Studio 中确认。这影响 V1，但不影响 V2。
2. **「主管版」APK 是否仍是需求**：决定 `ANDROID_TWA_SETUP.md` 中的内容是并入待办，还是直接舍弃。
3. **`ap-ai-service/` 没有 README**：建议新增，写明部署方式、环境变量名称（不写值）和 `INTERNAL_API_KEY` 闸门说明。

## 对 V1 与 AI Studio 同步的影响

- 清理只在 `develop-v2` 进行，不改 `main`，所以不影响 V1，也不影响 AI Studio 的同步。
- 将来 V2 合并回 `main` 时，这些移动和删除会一并带过去。在此之前，如果 AI Studio 再次向 `main` 导出这些旧文件，也只影响 `main`。
